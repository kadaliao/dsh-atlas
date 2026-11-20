import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { namingLanguages } from '../lib/languages.mjs';
import { adminAreasOf, createPlaceNames, lookupNames, shorterNames } from '../lib/place-names.mjs';
import { parseText, search } from '../lib/search.mjs';

// Two places called Chaoyang: one in Beijing, one far away in Liaoning.
const ENTITIES = {
  Q1: { labels: { en: { value: 'Chaoyang District' }, 'zh-hans': { value: '朝阳区' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 41.57, longitude: 120.45 } } } }] } },
  Q2: { labels: { en: { value: 'Chaoyang District' }, 'zh-hans': { value: '朝阳区' }, zh: { value: '朝陽區' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 39.92, longitude: 116.44 } } } }] } },
  Q3: { labels: { en: { value: 'Beijing' }, 'zh-hans': { value: '北京市' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 39.9, longitude: 116.39 } } } }] } },
};
const SEARCH = { chaoyang: ['Q1', 'Q2'], beijing: ['Q3'] };
// Tests do not depend on the languages of the Mac running them: an English Mac.
const EN = { languages: namingLanguages(['en-US']), searchLanguage: 'en', countryAt: () => null };

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
  assert.deepEqual(await lookupNames(chaoyang, { fetchImpl, ...EN }), ['Chaoyang District', '朝阳区']);
  const sent = JSON.stringify(asked);
  assert.ok(!/39\.9|116\.4/.test(sent), 'no coordinates leave the Mac');
  assert.deepEqual(await lookupNames({ name: 'Chaoyang', level: 'district', lat: 22.27, lng: 113.3 }, { fetchImpl, ...EN }), [], 'none of that name is near');
});

test('names are asked once, kept, and let either language find the place', async () => {
  const { fetchImpl, asked } = fakeWikidata();
  const cacheDir = mkdtempSync(join(tmpdir(), 'atlas-names-'));
  let on = true;
  const names = createPlaceNames({ cacheDir, enabled: () => on, fetchImpl, pauseMs: 0, ...EN });
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
  const again = createPlaceNames({ cacheDir, enabled: () => on, fetchImpl, pauseMs: 0, ...EN });
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

test('names in the Mac\'s own languages too, found by shorter forms, never in another country', async () => {
  const ENT = {
    Q10: { labels: { en: { value: 'Xinjiang' }, ja: { value: '新疆ウイグル自治区' }, 'zh-hans': { value: '新疆维吾尔自治区' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 41.0, longitude: 85.0 } } } }] } },
    Q20: { labels: { en: { value: 'Springfield' }, ja: { value: 'スプリングフィールド' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 45.0, longitude: 5.0 } } } }] } },
  };
  const found = { xinjiang: ['Q10'], springfield: ['Q20'] };
  const searched = [];
  const fetchImpl = async (url) => {
    const p = new URL(url).searchParams;
    if (p.get('action') === 'wbsearchentities') searched.push(`${p.get('language')}:${p.get('search')}`);
    const body = p.get('action') === 'wbsearchentities' ? { search: (found[p.get('search').toLowerCase()] ?? []).map((id) => ({ id })) } : { entities: Object.fromEntries(p.get('ids').split('|').map((id) => [id, ENT[id]])) };
    return { ok: true, status: 200, json: async () => body };
  };
  const ja = { languages: namingLanguages(['ja-JP', 'en-JP']), searchLanguage: 'ja' };
  // A province's photos can be far from where Wikidata puts it; Photos' spelling is not Wikidata's.
  const xj = await lookupNames({ name: 'Xinjiang Uygur Zizhiqu', level: 'province', lat: 47.8, lng: 88.1 }, { fetchImpl, ...ja, countryAt: () => 'CN' });
  assert.deepEqual(xj, ['新疆ウイグル自治区', 'Xinjiang', '新疆维吾尔自治区']);
  assert.ok(searched.includes('ja:Xinjiang Uygur Zizhiqu') && searched.includes('en:Xinjiang Uygur Zizhiqu') && searched.includes('ja:Xinjiang'), searched.join(' '));
  // Close enough, but in another country.
  const countryAt = (lat) => (lat > 44 ? 'FR' : 'CH');
  assert.deepEqual(await lookupNames({ name: 'Springfield', level: 'city', lat: 43.5, lng: 5.0 }, { fetchImpl, ...ja, countryAt }), []);
  assert.deepEqual(await lookupNames({ name: 'Springfield', level: 'city', lat: 45.5, lng: 5.0 }, { fetchImpl, ...ja, countryAt }), ['スプリングフィールド', 'Springfield']);
  assert.deepEqual(shorterNames('Hong Kong SAR'), ['Hong Kong', 'Hong'], 'each only if the longer was not found, and still where the photos are');
  assert.deepEqual(shorterNames('Foo Bar (Baz)'), ['Foo Bar', 'Foo']);
  assert.deepEqual(shorterNames('Beijing'), []);
});

test('the Mac\'s languages, then Chinese and English', () => {
  assert.deepEqual(namingLanguages(['ja-JP', 'en-JP']).map((l) => l.table), ['ja', 'en', 'zh_CN']);
  assert.deepEqual(namingLanguages(['zh-Hant-TW']).map((l) => l.table), ['zh_TW', 'zh_CN', 'en']);
  assert.deepEqual(namingLanguages(['zh-HK']).map((l) => l.table), ['zh_HK', 'zh_CN', 'en']);
  assert.deepEqual(namingLanguages([]).map((l) => l.table), ['zh_CN', 'en']);
});

test('New York the city is the city, not the state or a university', async () => {
  const at = (lat, lng) => ({ P625: [{ mainsnak: { datavalue: { value: { latitude: lat, longitude: lng } } } }] });
  const ENT = {
    Q1384: { labels: { en: { value: 'New York' }, 'zh-hans': { value: '纽约州' } }, claims: { ...at(43, -75.5), P1082: [{}] } },
    Q49210: { labels: { en: { value: 'New York University' }, 'zh-hans': { value: '纽约大学' } }, claims: at(40.73, -73.996) },
    Q60: { labels: { en: { value: 'New York City' }, 'zh-hans': { value: '纽约市' } }, claims: { ...at(40.71, -74.0), P1082: [{}] } },
  };
  const results = [
    { id: 'Q1384', label: 'New York', match: { type: 'label', text: 'New York' } },
    { id: 'Q49210', label: 'New York University', match: { type: 'label', text: 'New York University' } },
    { id: 'Q60', label: 'New York City', match: { type: 'label', text: 'New York City' } },
  ];
  const fetchImpl = async (url) => {
    const p = new URL(url).searchParams;
    const body = p.get('action') === 'wbsearchentities' ? { search: results } : { entities: Object.fromEntries(p.get('ids').split('|').map((id) => [id, ENT[id]])) };
    return { ok: true, status: 200, json: async () => body };
  };
  const opts = { fetchImpl, languages: namingLanguages(['en-US']), searchLanguage: 'en', countryAt: () => 'US' };
  assert.deepEqual(await lookupNames({ name: 'New York', level: 'city', lat: 40.73, lng: -73.99 }, opts), ['New York City', '纽约市']);
  assert.deepEqual(await lookupNames({ name: 'New York', level: 'province', lat: 40.73, lng: -73.99 }, opts), ['New York', '纽约州']);
});

test('places that no longer exist are left out', async () => {
  const at = (lat, lng, more = {}) => ({ P625: [{ mainsnak: { datavalue: { value: { latitude: lat, longitude: lng } } } }], ...more });
  const ENT = {
    Q17167: { labels: { en: { value: 'Roman Republic' }, 'zh-hans': { value: '罗马共和国' } }, claims: at(41.89, 12.48, { P576: [{}] }) },
    Q220: { labels: { en: { value: 'Rome' }, 'zh-hans': { value: '罗马' } }, claims: at(41.89, 12.48) },
  };
  const fetchImpl = async (url) => {
    const p = new URL(url).searchParams;
    const body = p.get('action') === 'wbsearchentities' ? { search: [{ id: 'Q17167', label: 'Roman Republic', match: { type: 'alias', text: 'Rome' } }, { id: 'Q220', label: 'Rome' }] } : { entities: Object.fromEntries(p.get('ids').split('|').map((id) => [id, ENT[id]])) };
    return { ok: true, status: 200, json: async () => body };
  };
  assert.deepEqual(await lookupNames({ name: 'Rome', level: 'city', lat: 41.9, lng: 12.5 }, { fetchImpl, languages: namingLanguages(['en-US']), searchLanguage: 'en', countryAt: () => 'IT' }), ['Rome', '罗马']);
});

test('when Wikidata is too busy, it tries again by itself and searches take the names when they come', async () => {
  let busy = true;
  const real = fakeWikidata();
  const fetchImpl = async (url, o) => (busy ? { ok: true, status: 200, headers: { get: () => '0' }, json: async () => ({ error: { code: 'maxlag' } }) } : real.fetchImpl(url, o));
  const cacheDir = mkdtempSync(join(tmpdir(), 'atlas-names-'));
  let told = 0;
  const names = createPlaceNames({ cacheDir, enabled: () => true, onNames: () => (told += 1), fetchImpl, pauseMs: 0, busyWaitMs: 1, retryMs: 20, ...EN });
  assert.equal(await names.fill(assets), false, 'paused, nothing cached as unknown');
  assert.equal(names.aliasesFor(assets).length, 0);
  busy = false;
  for (let i = 0; i < 100 && told === 0; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.ok(told > 0, 'asked again by itself');
  assert.ok(names.aliasesFor(assets).some(([alias]) => alias === '北京市'));
});
