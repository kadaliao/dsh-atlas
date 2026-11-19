import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeLibrary, sampleLexicon, sampleRows } from './fixtures.mjs';

let hasSqlite = true;
try {
  await import('node:sqlite');
} catch {
  hasSqlite = false;
}
const skip = hasSqlite ? false : 'node:sqlite is not available';

let library;
let mod;
let routes;
let tools;
let home;

/** Call a registered route like the web server would. */
function call(path, body, headers = {}) {
  return new Promise((resolve) => {
    const route = routes.find((r) => (r.kind === 'exact' ? r.path === path.split('?')[0] : path.startsWith(`${r.path}/`)));
    assert.ok(route, `no route for ${path}`);
    const req = new EventEmitter();
    req.url = path;
    req.method = body === undefined ? 'GET' : 'POST';
    req.headers = body === undefined ? headers : { 'content-type': 'application/json', ...headers };
    const chunks = [];
    const res = {
      statusCode: 0,
      headers: {},
      headersSent: false,
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      write(b) {
        chunks.push(Buffer.from(b));
      },
      end(b) {
        if (b) chunks.push(Buffer.from(b));
        const raw = Buffer.concat(chunks);
        let json;
        try {
          json = JSON.parse(raw.toString('utf8'));
        } catch {
          json = undefined;
        }
        resolve({ status: this.statusCode, headers: this.headers, raw, json });
      },
      on() {},
      once() {},
      emit() {},
      removeListener() {},
    };
    // Streams pipe into `res`: give it the writable bits pipe() needs.
    res.write = res.write.bind(res);
    route.handler(req, res);
    if (body !== undefined) {
      req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    }
  });
}

before(async () => {
  if (!hasSqlite) return;
  library = await makeLibrary(sampleRows(), sampleLexicon);
  home = mkdtempSync(join(tmpdir(), 'atlas-home-'));
  process.env.DSH_HOME = home;
  mod = await import('../index.js');
  routes = [];
  tools = [];
  const ctx = {
    effect: (fn) => fn(),
    get: (name) => (name === 'attachments' ? { saveImage: async ({ data, mediaType, name }) => ({ attachmentId: `sha256:${data.length}`, mediaType, bytes: data.length, width: 1, height: 1, name }) } : undefined),
    tools: { register: (t) => (tools.push(t), () => {}) },
    inject: (_names, fn) => fn({ webServer: { register: (r) => (routes.push(r), () => {}) }, effect: (fn) => fn() }),
  };
  mod.apply(ctx, { enabled: true, library, history: false });
});

const tool = (name) => tools.find((t) => t.name === name);

test('settingsOf and mergeSettings normalize the row and the panel', { skip }, () => {
  const base = mod.settingsOf({ library: ' /x ', basemap: 'offline', awayKm: 5, home: { lat: 1, lng: 2 } });
  assert.deepEqual(base, { enabled: true, library: '/x', history: true, basemap: 'offline', nearby: true, awayKm: 100, home: { lat: 1, lng: 2, city: '' } });
  assert.equal(mod.settingsOf({ basemap: 'auto' }).basemap, 'night', 'the old name');
  const merged = mod.mergeSettings(base, { history: false, home: null, awayKm: 300, basemap: 'nope' });
  assert.equal(merged.history, false);
  assert.equal(merged.home, null);
  assert.equal(merged.awayKm, 300);
  assert.equal(merged.basemap, 'offline');
});

test('state builds the index from the library', { skip }, async () => {
  const st = (await call('/__dsh_atlas/state')).json;
  assert.equal(st.status, 'ready');
  assert.equal(st.library, library);
  // Hidden and trashed are left out; the unlocated one is counted.
  assert.equal(st.items, sampleRows().length - 2);
  assert.equal(st.located, sampleRows().length - 3);
  assert.equal(st.home.city, '甲城');
  assert.equal(st.trips, 1);
  assert.deepEqual(st.labels.slice(0, 2).sort(), ['天空', '猫'].sort());
  assert.deepEqual(st.people, ['小黑'].filter((n) => st.people.includes(n)));
});

test('points are columns of the located photos', { skip }, async () => {
  const p = (await call('/__dsh_atlas/points')).json;
  assert.equal(p.ok, true);
  assert.equal(p.ids.length, sampleRows().length - 3);
  for (const k of ['lat', 'lng', 't', 'tz', 's', 'v', 'cc']) assert.equal(p[k].length, p.ids.length, k);
  assert.equal(p.unlocated, 1);
});

test('trips, stats and photos answer as JSON', { skip }, async () => {
  const trips = (await call('/__dsh_atlas/trips')).json;
  assert.equal(trips.trips[0].stops.length, 2);
  const stats = (await call('/__dsh_atlas/stats?year=2024')).json;
  assert.equal(stats.year, 2024);
  assert.equal(stats.stats.countries.length, 2);
  const id = trips.trips[0].cover;
  const photos = (await call('/__dsh_atlas/photos', { ids: [id, 'nope'] })).json;
  assert.equal(photos.photos.length, 1);
  assert.equal(photos.photos[0].place.city.length > 0, true);
  assert.ok(photos.photos[0].labels.some((l) => l.w === '海滩'));
});

test('search takes typed text and returns every match on request', { skip }, async () => {
  const r = (await call('/__dsh_atlas/search', { text: '乙国 海滩', all: true })).json;
  assert.equal(r.result.total, 5);
  assert.equal(r.result.all.length, 5);
  assert.equal(r.result.matches.length, 5);
  assert.deepEqual(r.query, { place: '乙国', labels: ['海滩'] });
  assert.equal(r.label, '乙国 · 海滩');
});

test('a GET to a POST route is refused, and a form POST too', { skip }, async () => {
  assert.equal((await call('/__dsh_atlas/search')).status, 405);
  assert.equal((await call('/__dsh_atlas/search', {}, { 'content-type': 'text/plain' })).status, 415);
});

test('thumbnails stream from the library, unknown ids are 404', { skip }, async () => {
  const id = sampleRows()[0].id;
  const ok = await call(`/__dsh_atlas/thumb/${id}`);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ok.headers['content-type'], 'image/jpeg');
  assert.equal((await call('/__dsh_atlas/thumb/../../etc/passwd')).status, 404);
  assert.equal((await call('/__dsh_atlas/vendor/../index.js')).status, 404);
});

test('today without history lists memories only', { skip }, async () => {
  const t = (await call('/__dsh_atlas/today?date=2024-04-12&lang=zh')).json;
  assert.equal(t.memories.length, 1);
  assert.equal(t.memories[0].year, 2023);
  assert.equal(t.events, null);
  assert.equal(t.history, false);
});

test('the tools answer the model and queue map commands', { skip }, async () => {
  assert.deepEqual(tools.map((t) => t.name), mod.TOOLS);
  const s = await tool('atlas_search').execute({ labels: ['海滩'] });
  assert.equal(s.ok, true);
  assert.equal(s.result.total, 5);
  assert.equal(s.card.tool, 'atlas_search');
  const text = mod.renderText('atlas_search', s);
  assert.match(text, /5 matches/);
  assert.match(text, /乙城/);
  const cmds = (await call('/__dsh_atlas/commands?after=0')).json;
  assert.equal(cmds.commands.at(-1).kind, 'highlight');
  assert.equal(cmds.commands.at(-1).open, false);

  const miss = await tool('atlas_search').execute({ labels: ['恐龙'], place: '不存在的地方' });
  assert.match(mod.renderText('atlas_search', miss), /No photos match/);

  const trips = await tool('atlas_trips').execute({});
  assert.equal(trips.total, 1);
  assert.match(mod.renderText('atlas_trips', trips), /乙城 → 丙城/);
  const one = await tool('atlas_trips').execute({ id: trips.trips[0].id });
  assert.equal(one.kind, 'atlas_trip');
  assert.match(mod.renderText('atlas_trip', one), /1\. 乙城/);

  const show = await tool('atlas_show').execute({ trip: trips.trips[0].id, story: true });
  assert.equal(show.opened, true);
  const last = (await call('/__dsh_atlas/commands?after=0')).json.commands.at(-1);
  assert.deepEqual([last.kind, last.story, last.open], ['trip', true, true]);
  const byFilter = await tool('atlas_show').execute({ country: 'XB', labels: ['猫'] });
  assert.equal(byFilter.card.compact, true);
  assert.equal(byFilter.card.query.country, 'XB');

  const stats = await tool('atlas_stats').execute({});
  assert.match(mod.renderText('atlas_stats', stats), /2 countries/);
  const today = await tool('atlas_today').execute({ date: '2024-04-12' });
  assert.match(mod.renderText('atlas_today', today), /2023 \(1 year ago\)/);

  const look = await tool('atlas_look').execute({ ids: [trips.trips[0].cover] });
  assert.equal(look.images.length, 1);
  assert.ok(look.images[0].image.attachmentId);
  const blocks = tool('atlas_look').output.render({}, look);
  assert.equal(blocks.filter((b) => b.type === 'image').length, 1);
  assert.deepEqual(tool('atlas_search').output.presentationMeta({}, s), { atlas: s.card });
});

test('the index is cached on disk for the next start', { skip }, async () => {
  const raw = JSON.parse(readFileSync(join(home, 'cache', 'atlas', 'index.json'), 'utf8'));
  assert.equal(raw.library, library);
  assert.equal(raw.assets.length, sampleRows().length - 2);
});

test('settings saved by the panel apply at once', { skip }, async () => {
  const st = (await call('/__dsh_atlas/settings', { awayKm: 6000 })).json;
  assert.equal(st.settings.awayKm, 6000);
  assert.equal(st.trips, 0);
  const back = (await call('/__dsh_atlas/settings', { awayKm: null })).json;
  assert.equal(back.trips, 1);
});
