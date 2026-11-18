/**
 * Places you have been, at street level: the venues, landmarks and areas
 * Photos named in your photos (its search index), each placed where those
 * photos were taken. And what Wikipedia knows near a point.
 *
 * @module places
 */

import { centerOf, km } from './geo.mjs';
import { pickBest } from './quality.mjs';
import { dayOf } from './trips.mjs';

const KINDS = new Set(['poi', 'landmark', 'area']);

/**
 * Every named place with at least `minPhotos` photos whose photos sit
 * within `spreadKm` of their middle (a venue, not a whole region):
 * `[{id, name, kind, lat, lng, photos, days, first, last, cover}]`, most
 * photographed first.
 */
export function placesOf(assets, lexicon, { minPhotos = 2, spreadKm = 1.5 } = {}) {
  const groups = new Map();
  for (const a of assets) {
    if (a.lat === null || a.lat === undefined) continue;
    for (const id of a.lex) {
      const e = lexicon[id];
      if (!e || !KINDS.has(e.c) || !e.w) continue;
      let g = groups.get(id);
      if (!g) groups.set(id, (g = []));
      g.push(a);
    }
  }
  const out = [];
  for (const [id, list] of groups) {
    if (list.length < minPhotos) continue;
    const c = centerOf(list);
    const dists = list.map((a) => km(c.lat, c.lng, a.lat, a.lng)).sort((x, y) => x - y);
    if (dists[Math.floor(dists.length / 2)] > spreadKm) continue;
    const e = lexicon[id];
    out.push({
      id: Number(id),
      name: e.w,
      kind: e.c,
      lat: Math.round(c.lat * 1e5) / 1e5,
      lng: Math.round(c.lng * 1e5) / 1e5,
      photos: list.length,
      days: new Set(list.map(dayOf)).size,
      first: list.reduce((m, a) => Math.min(m, a.t), Infinity),
      last: list.reduce((m, a) => Math.max(m, a.t), -Infinity),
      cover: (pickBest(list, 1)[0] ?? list[0]).id,
    });
  }
  // The same name under two kinds (a temple as a venue and as an area), or two branches of
  // one name side by side: keep the one with more photos.
  out.sort((a, b) => b.photos - a.photos);
  const kept = [];
  for (const p of out) if (!kept.some((k) => k.name === p.name && km(k.lat, k.lng, p.lat, p.lng) < 2)) kept.push(p);
  return kept;
}

/**
 * Wikipedia articles near a point, with a line of text and a picture:
 * `[{title, lat, lng, km, description, extract, thumb, url}]`, nearest first.
 * @param {'zh'|'en'} lang
 */
export async function nearbyArticles(lat, lng, radiusM, lang, { fetchImpl = fetch, userAgent = 'dsh-atlas (DeepSeek Harness plugin)', limit = 40 } = {}) {
  const r = Math.max(100, Math.min(10000, Math.round(radiusM)));
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'geosearch',
    ggscoord: `${lat.toFixed(5)}|${lng.toFixed(5)}`,
    ggsradius: String(r),
    ggslimit: String(limit),
    prop: 'coordinates|pageimages|description|extracts|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    exsentences: '2',
    exlimit: String(limit),
    piprop: 'thumbnail',
    pithumbsize: '320',
    pilimit: String(limit),
  });
  if (lang === 'zh') params.set('variant', 'zh-cn');
  const res = await fetchImpl(`https://${lang}.wikipedia.org/w/api.php?${params}`, { headers: { 'user-agent': userAgent, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
  const body = await res.json();
  const pages = Array.isArray(body?.query?.pages) ? body.query.pages : [];
  return pages
    .map((p) => {
      const c = Array.isArray(p.coordinates) ? p.coordinates[0] : null;
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return null;
      return {
        title: String(p.title ?? ''),
        lat: c.lat,
        lng: c.lon,
        km: Math.round(km(lat, lng, c.lat, c.lon) * 100) / 100,
        description: String(p.description ?? ''),
        extract: String(p.extract ?? '').slice(0, 400),
        thumb: String(p.thumbnail?.source ?? ''),
        url: String(p.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title ?? ''))}`),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);
}
