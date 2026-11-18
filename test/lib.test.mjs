import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseBplist, parseRevGeo, unarchive, UID } from '../lib/bplist.mjs';
import { arc, bboxOf, centerOf, createCountryLookup, createGrid, km, nightPolygon } from '../lib/geo.mjs';
import { createFiles, pathFromBookmark } from '../lib/library.mjs';
import { enrich, metroProvinces } from '../lib/enrich.mjs';
import { findTrips, inferHomes, stopsOf } from '../lib/trips.mjs';
import { statsOf, flagOf } from '../lib/stats.mjs';
import { dayBound, lexemesFor, parseText, search } from '../lib/search.mjs';
import { eventsOf, fetchEvents, memoriesOn, rankEvents } from '../lib/today.mjs';
import { derive } from '../lib/atlas.mjs';
import { at, revGeoBlob, sampleLexicon, sampleRows, Uid, writeBplist } from './fixtures.mjs';

// --- bplist ---------------------------------------------------------------------

test('parseBplist reads scalars, strings, arrays, dicts and uids', () => {
  const buf = writeBplist({ a: 1, b: 'hello', c: '中文', d: [true, false, null], e: new Uid(3), f: 2.5, big: 123456789012 });
  const v = parseBplist(buf);
  assert.equal(v.a, 1);
  assert.equal(v.b, 'hello');
  assert.equal(v.c, '中文');
  assert.deepEqual(v.d, [true, false, null]);
  assert.ok(v.e instanceof UID);
  assert.equal(v.e.value, 3);
  assert.equal(v.f, 2.5);
  assert.equal(v.big, 123456789012);
});

test('parseBplist rejects what is not a binary plist', () => {
  assert.throws(() => parseBplist(Buffer.from('<?xml version="1.0"?><plist></plist>xxxxxxxxxxxxxxxxxxxxxxxx')));
});

test('unarchive resolves a keyed archive graph', () => {
  const archive = {
    $archiver: 'NSKeyedArchiver',
    $objects: ['$null', { $class: new Uid(2), 'NS.objects': [new Uid(3), new Uid(4)] }, { $classname: 'NSArray', $classes: ['NSArray'] }, 'x', 'y'],
    $top: { root: new Uid(1) },
  };
  assert.deepEqual(unarchive(parseBplist(writeBplist(archive))), ['x', 'y']);
});

test('parseRevGeo names the country, province, city and district', () => {
  const place = parseRevGeo(revGeoBlob({ cc: 'XB', country: '乙国', province: '乙省', city: '乙城', district: '北区', home: true }));
  assert.deepEqual(place, { cc: 'XB', country: '乙国', province: '乙省', city: '乙城', district: '北区', home: true });
  assert.equal(parseRevGeo(null), null);
  assert.equal(parseRevGeo(Buffer.alloc(60)), null);
});

// --- geo ------------------------------------------------------------------------

test('km and arc follow the great circle, continuous across the antimeridian', () => {
  assert.ok(Math.abs(km(0, 0, 0, 1) - 111.2) < 0.5);
  const path = arc(35, 170, 35, -170);
  assert.equal(path[0][0], 170);
  for (let i = 1; i < path.length; i += 1) assert.ok(Math.abs(path[i][0] - path[i - 1][0]) < 30, 'no jump');
  assert.ok(path[path.length - 1][0] > 180, 'goes east past 180');
  assert.deepEqual(bboxOf([{ lat: 1, lng: 2 }, { lat: -1, lng: 5 }, { lat: null, lng: null }]), [2, -1, 5, 1]);
  assert.deepEqual(centerOf([{ lat: 0, lng: 0 }, { lat: 2, lng: 2 }, { lat: 100, lng: 100 }]), { lat: 2, lng: 2 });
});

test('country lookup and the grid find what is near', () => {
  const lookup = createCountryLookup({ features: [{ properties: { iso: 'XA' }, geometry: { coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]] } }] });
  assert.equal(lookup(5, 5).iso, 'XA');
  assert.equal(lookup(20, 5), null);
  const grid = createGrid([{ lat: 10, lng: 10, id: 'a' }, { lat: 10.5, lng: 10.5, id: 'b' }]);
  assert.equal(grid.nearest(10.4, 10.4, 50).point.id, 'b');
  assert.equal(grid.nearest(30, 30, 50), null);
  assert.equal(grid.within(10, 10, 100).length, 2);
});

test('nightPolygon puts the night on the side away from the sun', () => {
  const june = nightPolygon(new Date('2024-06-21T12:00:00Z'));
  assert.ok(june.sun.lat > 23 && june.sun.lat < 24);
  assert.ok(Math.abs(june.sun.lng) < 5, 'noon UTC: the sun over Greenwich');
  const ring = june.coordinates[0];
  assert.ok(ring.some(([, lat]) => lat === -90), 'southern winter is night');
});

// --- library ----------------------------------------------------------------------

test('pathFromBookmark reads the path components of a bookmark', () => {
  const item = (s) => {
    const b = Buffer.from(s, 'utf8');
    const head = Buffer.alloc(8);
    head.writeUInt32LE(b.length, 0);
    head.writeUInt32LE(0x0101, 4);
    return Buffer.concat([head, b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  };
  const data = Buffer.concat([Buffer.from('book'), Buffer.alloc(44), item('Volumes'), item('Disk'), item('Photos Library.photoslibrary'), item('file:///Volumes/Disk/')]);
  assert.equal(pathFromBookmark(data), '/Volumes/Disk/Photos Library.photoslibrary');
  assert.equal(pathFromBookmark(Buffer.from('nope')), '');
});

test('createFiles finds thumbnails and previews by UUID', () => {
  const lib = mkdtempSync(join(tmpdir(), 'atlas-files-'));
  const id = 'ABCDEF01-1111-4222-8333-444455556666';
  mkdirSync(join(lib, 'resources', 'derivatives', 'masters', 'A'), { recursive: true });
  mkdirSync(join(lib, 'resources', 'derivatives', 'A'), { recursive: true });
  mkdirSync(join(lib, 'originals', 'A'), { recursive: true });
  writeFileSync(join(lib, 'resources', 'derivatives', 'masters', 'A', `${id}_4_5005_c.jpeg`), 'x');
  writeFileSync(join(lib, 'resources', 'derivatives', 'A', `${id}_1_105_c.jpeg`), 'x');
  writeFileSync(join(lib, 'resources', 'derivatives', 'A', `${id}_1_102_o.jpeg`), 'x');
  writeFileSync(join(lib, 'originals', 'A', `${id}.mov`), 'x');
  const files = createFiles(lib);
  assert.match(files.thumb(id), /_4_5005_c\.jpeg$/);
  assert.match(files.large(id), /_1_102_o\.jpeg$/);
  assert.match(files.original('A', `${id}.mov`), /\.mov$/);
  assert.equal(files.original('../x', 'y'), '');
  assert.equal(files.thumb('not-a-uuid'), '');
});

// --- trips, stats ----------------------------------------------------------------

/** Sample rows as the reader returns them. */
function sampleAssets() {
  return sampleRows()
    .filter((r) => !r.hidden && !r.trashed)
    .map((r) => ({ id: r.id, t: r.t, tz: 28800, lat: r.lat ?? null, lng: r.lng ?? null, video: false, fav: false, w: 1, h: 1, dur: 0, dir: '', file: '', score: r.score ?? 0.5, shot: false, moment: '', title: '', place: r.place ? { ...r.place, home: false } : null, lex: r.labels ?? [] }));
}
const lexicon = Object.fromEntries(Object.entries(sampleLexicon).map(([id, e]) => [id, { c: e.c === 3010 ? 'person' : 'scene', w: e.w, s: e.s }]));

test('inferHomes picks the place with the most days', () => {
  const geo = sampleAssets().filter((a) => a.lat !== null);
  const { main } = inferHomes(geo);
  assert.equal(main.city, '甲城');
  assert.ok(Math.abs(main.lat - 10) < 0.1);
});

test('findTrips finds the trip abroad with its stops and route', () => {
  const { trips } = findTrips(sampleAssets());
  assert.equal(trips.length, 1);
  const t = trips[0];
  assert.equal(t.start, '2024-04-12');
  assert.equal(t.end, '2024-04-14');
  assert.equal(t.days, 3);
  assert.equal(t.count, 5);
  assert.deepEqual(t.stops.map((s) => s.name), ['乙城', '丙城']);
  assert.equal(t.abroad, true);
  assert.equal(t.nodes.length, t.stops.length + 2, 'home, stops, home');
  assert.equal(t.nodes[t.nodes.length - 1], t.path.length - 1);
  assert.ok(t.km > 2000);
  assert.match(t.id, /^trip-20240412-/);
});

test('findTrips keeps defaults when options are undefined', () => {
  assert.equal(findTrips(sampleAssets(), { awayKm: undefined, home: undefined }).trips.length, 1);
  assert.equal(findTrips(sampleAssets(), { awayKm: 5000 }).trips.length, 0);
});

test('stopsOf folds a lone photo between stops into the one before', () => {
  const p = (city, t) => ({ id: `${city}${t}`, t, tz: 0, lat: 1, lng: 1, place: { city, cc: 'XB', country: '乙国' }, score: 0 });
  const stops = stopsOf([p('A', 1), p('A', 2), p('B', 3), p('C', 4), p('C', 5)]);
  assert.deepEqual(stops.map((s) => [s.name, s.count]), [['A', 3], ['C', 2]]);
});

test('statsOf counts countries, cities, years and trips', () => {
  const assets = sampleAssets();
  const { trips } = findTrips(assets);
  const s = statsOf(assets, trips);
  assert.deepEqual(s.countries.map((c) => c.key), ['XA', 'XB']);
  assert.equal(s.cities.length, 3);
  assert.equal(s.trips, 1);
  assert.equal(s.abroadTrips, 1);
  assert.deepEqual(s.years.map((y) => y.year), [2023, 2024]);
  assert.equal(statsOf(assets, trips, { year: 2023 }).countries.length, 1);
  assert.equal(flagOf('JP'), '🇯🇵');
  assert.equal(flagOf('x'), '');
});

test('enrich fills a missing city from a neighbour and folds a metro', () => {
  const a = (city, lat, lng, province = '大省') => ({ id: city + lat, t: 0, lat, lng, lex: [], place: { cc: 'XC', country: '丙国', province, city, district: '' } });
  const assets = [a('一区', 30, 120), a('二区', 30.05, 120.05), a('三区', 30.1, 120), { id: 'x', t: 0, lat: 30.01, lng: 120.01, lex: [], place: null }];
  assert.ok(metroProvinces(assets).has('XC|大省'));
  enrich(assets, { features: [] });
  assert.equal(assets[0].place.city, '大省');
  assert.equal(assets[0].place.district, '一区');
  assert.equal(assets[3].place.city, '大省', 'the neighbour’s city, folded too');
  assert.equal(assets[3].place.guessed, true);
});

// --- search ---------------------------------------------------------------------

test('dayBound reads year, month and day bounds', () => {
  assert.equal(new Date(dayBound('2024', false) * 86400000).toISOString().slice(0, 10), '2024-01-01');
  assert.equal(new Date(dayBound('2024-02', true) * 86400000).toISOString().slice(0, 10), '2024-02-29');
  assert.ok(Number.isNaN(dayBound('soon', false)));
});

test('lexemesFor prefers exact words and synonyms over partial ones', () => {
  assert.deepEqual(lexemesFor(lexicon, '猫'), [1]);
  assert.deepEqual(lexemesFor(lexicon, '沙滩'), [3]);
  assert.deepEqual(lexemesFor(lexicon, '猫咪'), [1]);
  assert.deepEqual(lexemesFor(lexicon, '狗'), []);
});

test('search filters by labels, place, dates, months and distance', () => {
  const data = derive(sampleAssets(), lexicon, {});
  const cats = search(data, { labels: ['猫'] });
  assert.equal(cats.total, 16);
  const beach = search(data, { labels: ['海滩'], place: '乙国' });
  assert.equal(beach.total, 5);
  assert.deepEqual(beach.places.map((p) => p.name), ['乙城', '丙城']);
  assert.equal(search(data, { from: '2024-04-12', to: '2024-04-13' }).total, 3);
  assert.equal(search(data, { months: [4], located: true, from: '2024' }).total, 16);
  assert.equal(search(data, { near: { lat: 21, lng: 111.5, km: 5 } }).total, 2);
  const none = search(data, { labels: ['恐龙'] });
  assert.equal(none.total, sampleAssets().length, 'an unknown label is ignored');
  assert.deepEqual(none.labels.unmatched, ['恐龙']);
  assert.ok(none.suggestions.common.includes('猫'));
  assert.equal(search(data, { labels: ['猫'], withAll: true }).all.length, 16);
});

test('parseText splits a typed query into place, dates and labels', () => {
  const data = derive(sampleAssets(), lexicon, {});
  assert.deepEqual(parseText(data, '乙城 2024 猫'), { place: '乙城', from: '2024', to: '2024', labels: ['猫'] });
  assert.deepEqual(parseText(data, '夏天 视频'), { kind: 'video', months: [6, 7, 8] });
  assert.deepEqual(parseText(data, '小黑'), { people: ['小黑'] });
  assert.deepEqual(parseText(data, '2024-04'), { from: '2024-04', to: '2024-04' });
});

// --- today ------------------------------------------------------------------------

test('memoriesOn finds this date in earlier years', () => {
  const m = memoriesOn(sampleAssets(), { year: 2024, month: 4, day: 12 });
  assert.equal(m.length, 1);
  assert.equal(m[0].year, 2023);
  assert.equal(m[0].yearsAgo, 1);
  assert.equal(m[0].place, '甲城');
  assert.equal(memoriesOn(sampleAssets(), { year: 2025, month: 4, day: 12 }).length, 2);
});

const feed = {
  events: [
    { year: 1900, text: 'Far away', pages: [{ title: 'Far', coordinates: { lat: -40, lon: -70 }, content_urls: { desktop: { page: 'https://example.org/Far' } } }] },
    { year: 1950, text: 'Near the beach', pages: [{ title: 'Year' }, { title: 'Beach_town', normalizedtitle: 'Beach town', coordinates: { lat: 20.1, lon: 110.1 }, thumbnail: { source: 'https://example.org/t.jpg' } }] },
    { year: 1999, text: 'No place', pages: [{ title: 'Thing' }] },
    { year: 2001, text: '', pages: [] },
  ],
};

test('eventsOf keeps events with text and finds their place', () => {
  const ev = eventsOf(feed);
  assert.equal(ev.length, 3);
  assert.deepEqual([ev[1].title, ev[1].lat, ev[1].lng, ev[1].thumb], ['Beach town', 20.1, 110.1, 'https://example.org/t.jpg']);
  assert.equal(ev[2].lat, null);
});

test('rankEvents puts what happened near your photos first', () => {
  const grid = createGrid(sampleAssets().filter((a) => a.lat !== null));
  const ranked = rankEvents(eventsOf(feed), grid);
  assert.equal(ranked[0].text, 'Near the beach');
  assert.equal(ranked[0].near.close, true);
  assert.equal(ranked[0].near.place, '乙城');
  assert.equal(ranked[ranked.length - 1].text, 'No place');
});

test('fetchEvents asks Wikipedia once and keeps the answer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-today-'));
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { ok: true, json: async () => feed };
  };
  const first = await fetchEvents(dir, 'zh', 4, 12, { fetchImpl });
  assert.equal(first.cached, false);
  assert.equal(calls[0].url, 'https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events/04/12');
  assert.equal(calls[0].headers['accept-language'], 'zh-hans');
  const second = await fetchEvents(dir, 'zh', 4, 12, { fetchImpl });
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
  await assert.rejects(fetchEvents(dir, 'en', 4, 12, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
});

test('at() fixture helper is local time', () => {
  assert.equal(new Date((at('2024-04-12T12:00:00') + 28800) * 1000).toISOString(), '2024-04-12T12:00:00.000Z');
});
