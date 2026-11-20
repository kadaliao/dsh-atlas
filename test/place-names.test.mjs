import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { adminAreasOf, createPlaceNames, lookupNames } from '../lib/place-names.mjs';
import { parseText, search } from '../lib/search.mjs';

// Two places called Chaoyang: one in Beijing, one far away in Liaoning.
const ENTITIES = {
  Q1: { labels: { en: { value: 'Chaoyang District' }, 'zh-hans': { value: '朝阳区' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 41.57, longitude: 120.45 } } } }] } },
  Q2: { labels: { en: { value: 'Chaoyang District' }, 'zh-hans': { value: '朝阳区' }, zh: { value: '朝陽區' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 39.92, longitude: 116.44 } } } }] } },
  Q3: { labels: { en: { value: 'Beijing' }, 'zh-hans': { value: '北京市' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 39.9, longitude: 116.39 } } } }] } },
};
const SEARCH = { chaoyang: ['Q1', 'Q2'], beijing: ['Q3'] };

function fakeWikidata() {
  const asked = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    asked.push(Object.fromEntries(u.searchParams));
    const p = u.searchParams;
    const body =
      p.get('action') === 'wbsearchentities'
        ? { search: (SEARCH[p.get('search').toLowerCase()] ?? []).map((id) => ({ id })) }
        : { entities: Object.fromEntries(p.get('ids').split('|').map((id) => [id, ENTITIES[id]])) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, asked };
}

const photo = (id, lat, lng, place, lex = []) => ({ id, t: 1700000000, tz: 28800, lat, lng, place, lex });
const BJ = { cc: 'CN', country: 'China', province: '', city: 'Beijing', district: 'Chaoyang' };
const assets = [photo('a', 39.93, 116.45, BJ, [1]), photo('b', 39.91, 116.43, BJ), photo('c', 22.27, 113.3, { cc: 'CN', country: 'China', province: 'Guangdong', city: 'Zhuhai', district: '' })];

test('a place is the one of its name near its photos, and only names are sent', async () => {
  const { fetchImpl, asked } = fakeWikidata();
  const [chaoyang] = [...adminAreasOf(assets).values()].filter((p) => p.level === 'district');
  assert.equal(chaoyang.photos, 2);
  assert.deepEqual(await lookupNames(chaoyang, { fetchImpl }), ['Chaoyang District', '朝阳区']);
  const sent = JSON.stringify(asked);
  assert.ok(!/39\.9|116\.4/.test(sent), 'no coordinates leave the Mac');
  assert.deepEqual(await lookupNames({ name: 'Chaoyang', level: 'district', lat: 22.27, lng: 113.3 }, { fetchImpl }), [], 'none of that name is near');
});

test('names are asked once, kept, and let either language find the place', async () => {
  const { fetchImpl, asked } = fakeWikidata();
  const cacheDir = mkdtempSync(join(tmpdir(), 'atlas-names-'));
  let on = true;
  const names = createPlaceNames({ cacheDir, enabled: () => on, fetchImpl, pauseMs: 0 });
  assert.equal(await names.fill(assets), true);
  const count = asked.length;
  assert.equal(await names.fill(assets), false, 'nothing left to ask');
  assert.equal(asked.length, count);
  assert.ok(JSON.parse(readFileSync(join(cacheDir, 'place-names.json'), 'utf8')).places['CN|district|chaoyang'].names.includes('朝阳区'));

  const atlas = { assets, located: assets, lexicon: { 1: { c: 'scene', w: 'Cat', s: [], x: ['猫'] } }, placeAliases: names.aliasesFor(assets) };
  assert.equal(search(atlas, { place: '北京' }).total, 2);
  assert.equal(search(atlas, { place: '朝阳' }).total, 2);
  assert.equal(search(atlas, { place: 'Beijing' }).total, 2);
  assert.equal(search(atlas, { place: '珠海' }).total, 0, 'Wikidata did not know it here');
  assert.deepEqual(parseText(atlas, '北京的猫'), { place: '北京', labels: ['猫'] });

  // Kept across restarts; turned off, nothing is used or asked.
  const again = createPlaceNames({ cacheDir, enabled: () => on, fetchImpl, pauseMs: 0 });
  assert.ok(again.aliasesFor(assets).some(([alias]) => alias === '北京市'));
  on = false;
  assert.deepEqual(again.aliasesFor(assets), []);
  assert.equal(await again.fill(assets), false);
});

test('a place typed without its suffix: 东京 for 东京都, Chaoyang for Chaoyang District', () => {
  const tokyo = { cc: 'JP', country: 'Japan', province: 'Tokyo', city: 'Tokyo', district: '' };
  const list = [photo('t', 35.68, 139.76, tokyo, [1])];
  const atlas = { assets: list, located: list, lexicon: { 1: { c: 'scene', w: 'Food', s: [], x: ['美食'] } }, placeAliases: [['东京都', 'tokyo']] };
  assert.deepEqual(parseText(atlas, '东京的美食'), { place: '东京', labels: ['美食'] });
  assert.equal(search(atlas, { place: '东京', labels: ['美食'] }).total, 1);
});
