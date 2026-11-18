import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, 'client.js'), 'utf8');

/** A hook-capable stand-in for React that renders plain element trees. */
function fakeReact() {
  let slots = [];
  let cursor = 0;
  const hooks = {
    rewind() {
      cursor = 0;
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (v) => (slots[i] = typeof v === 'function' ? v(slots[i]) : v)];
    },
    useEffect() {
      cursor++;
    },
  };
  const createElement = (type, props, ...children) => {
    const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
    if (typeof type === 'function') return type({ ...(props ?? {}), ...(kids.length ? { children: kids.length === 1 ? kids[0] : kids } : {}) });
    return { type, props: props ?? {}, children: kids };
  };
  return { React: { createElement, useState: hooks.useState, useRef: hooks.useRef, useEffect: hooks.useEffect }, hooks };
}

/** Load the client with a fake module loader and collect what it registers. */
function loadClient() {
  const { React, hooks } = fakeReact();
  let factory;
  globalThis.window = {
    __ModuleLoader__: {
      load({ id, factory: make }) {
        assert.equal(id, '@kadaliao/dsh-atlas');
        factory = make;
      },
    },
  };
  new Function(`${source}\n//# sourceURL=client.js`)();
  const exports = factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected require ${name}`);
  });
  const slots = [];
  const events = [];
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_name, fn) => fn(), register: (desc, component) => (slots.push({ ...desc, component }), () => {}) },
    uiConversation: { events: { register: (d) => (events.push(d), () => {}) } },
    get: () => undefined,
  };
  exports.apply(ctx);
  return { exports, slots, events, hooks };
}

/** Every text node of an element tree, joined. */
const textOf = (node) => (node === null || node === undefined ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node.children));
const find = (node, pred) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => find(n, pred));
  return [...(pred(node) ? [node] : []), ...find(node.children, pred)];
};

test('the client registers its panel, sidebar entry, tool views and result rows', () => {
  const { exports, slots, events } = loadClient();
  assert.deepEqual(exports.inject, ['slots', 'locale', 'uiConversation']);
  const names = slots.map((s) => `${s.name}:${s.key ?? s.id}`);
  for (const tool of ['atlas_search', 'atlas_show', 'atlas_trips', 'atlas_stats', 'atlas_today', 'atlas_look']) assert.ok(names.includes(`tool.call.toolview:${tool}`), tool);
  assert.ok(names.includes('sidebar.panellist:atlas'));
  assert.ok(names.includes('main:atlas'));
  assert.ok(names.includes('conversation.chat.node:atlas-result'));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'atlas-result');
});

test('a tool result with a card becomes a turn-level row; atlas_look does not', () => {
  const { events } = loadClient();
  const def = events[0];
  assert.equal(def.match({ type: 'tool/call', data: { name: 'atlas_search', callId: 'c1' } }), null);
  const event = { type: 'tool/result', surfaceOp: 'append', seq: 7, data: { message: { toolCallId: 'c1' }, meta: { atlas: { tool: 'atlas_search', title: '猫', total: 3, ids: ['A', 'B'] } } } };
  const m = def.match(event);
  assert.deepEqual(m, { id: 'c1', role: 'start' });
  const state = def.start({}, { event });
  const node = def.buildViewNode({ state, key: 'k', id: 'c1', start: { location: 'x' } });
  assert.equal(node.groupTree, 'turn');
  assert.equal(node.anchorSeq, 7.2);
  const look = { ...event, data: { ...event.data, meta: { atlas: { tool: 'atlas_look', ids: ['A'] } } } };
  assert.equal(def.buildViewNode({ state: def.start({}, { event: look }), key: 'k', id: 'c', start: {} }), null);
  assert.equal(def.match({ type: 'tool/result', surfaceOp: 'append', data: { meta: { other: 1 } } }), null);
});

test('the result row shows thumbnails and a way to the map', () => {
  const { slots } = loadClient();
  const Row = slots.find((s) => s.name === 'conversation.chat.node').component;
  const tree = Row({ node: { data: { card: { tool: 'atlas_search', title: 'JP · 猫', total: 58, ids: ['ID1', 'ID2'], bbox: [1, 2, 3, 4], query: { country: 'JP' } } } } });
  const imgs = find(tree, (n) => n.type === 'img');
  assert.deepEqual(imgs.map((i) => i.props.src), ['/__dsh_atlas/thumb/ID1', '/__dsh_atlas/thumb/ID2']);
  assert.match(textOf(tree), /JP · 猫/);
  assert.equal(find(tree, (n) => n.type === 'button').length, 1);
  const compact = Row({ node: { data: { card: { tool: 'atlas_show', compact: true, title: '京都', ids: ['X'] } } } });
  assert.equal(find(compact, (n) => n.type === 'img').length, 0, 'atlas_show does not repeat the thumbnails');
  const trips = Row({ node: { data: { card: { tool: 'atlas_trips', trips: [{ id: 't1', start: '2024-04-10', days: 6, places: ['东京'], cover: 'C', abroad: true }] } } } });
  assert.match(textOf(trips), /✈ 东京/);
});

test('the tool view names the tool and summarizes its arguments', () => {
  const { slots } = loadClient();
  const View = slots.find((s) => s.name === 'tool.call.toolview' && s.key === 'atlas_search').component;
  const pending = View({ phase: 'start', block: { name: 'atlas_search', argsRaw: JSON.stringify({ place: '京都', labels: ['猫'] }) } });
  assert.match(textOf(pending), /toolSearch/);
  assert.match(textOf(pending), /京都 · 猫/);
  const done = View({ phase: 'result', block: { name: 'atlas_search', args: {}, content: [{ type: 'text', text: '3 matches\nmore' }] } });
  assert.match(textOf(done), /3 matches/);
});

test('the sidebar glyph renders at the asked size', () => {
  const { slots } = loadClient();
  const Glyph = slots.find((s) => s.name === 'sidebar.panellist').component;
  const svg = Glyph({ size: 20, active: true });
  assert.equal(svg.type, 'svg');
  assert.equal(svg.props.width, 20);
});
