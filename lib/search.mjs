/**
 * Find photos by place, time, labels, people and distance.
 *
 * @module search
 */

import { bboxOf, centerOf, km } from './geo.mjs';
import { dayOf } from './trips.mjs';

const PLACE_LEX = new Set(['street', 'area', 'poi', 'landmark', 'water', 'placeType']);
const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Parse a date bound: `YYYY`, `YYYY-MM` or `YYYY-MM-DD` into a local day
 * number, the first day for `from`, the last for `to`. NaN when unreadable.
 */
export function dayBound(value, end) {
  const m = String(value ?? '').trim().match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) - 1 : end ? 11 : 0;
  if (!m[3]) {
    const d = end ? Date.UTC(y, mo + 1, 0) : Date.UTC(y, mo, 1);
    return Math.floor(d / 86400000);
  }
  return Math.floor(Date.UTC(y, mo, Number(m[3])) / 86400000);
}

/**
 * Label ids matching a word: exact matches on a primary word or synonym
 * first; failing that, words containing it.
 * @param {object} lexicon - id → {c, w, s}
 * @param {string} term
 * @param {(c: string) => boolean} [only] - categories to look in.
 */
export function lexemesFor(lexicon, term, only) {
  const t = norm(term);
  if (t === '') return [];
  const exact = [];
  const partial = [];
  for (const [id, e] of Object.entries(lexicon)) {
    if (only && !only(e.c)) continue;
    const words = [e.w, ...(e.s ?? [])].map(norm);
    if (words.includes(t)) exact.push(Number(id));
    else if (t.length >= 2 && words.some((w) => w.includes(t))) partial.push(Number(id));
  }
  return exact.length > 0 ? exact : partial;
}

/**
 * Search the index.
 *
 * `q`: `{place, country, from, to, months, labels, people, near: {lat, lng, km},
 * kind, favorites, located, trip, sort, limit, withAll}` — every part
 * optional, all of them must hold; `withAll` adds `all`, every located match's id. Returns `{total, located, ids, first, last, places,
 * years, bbox, center, labels: {matched, unmatched}, suggestions}`.
 * @param {object} atlas - the built index (`assets`, `lexicon`, `labelCounts`, `countryNames`, `tripById`).
 */
export function search(atlas, q = {}) {
  const lexicon = atlas.lexicon ?? {};
  let list = atlas.assets;
  const matched = {};
  const unmatched = [];

  const from = q.from ? dayBound(q.from, false) : NaN;
  const to = q.to ? dayBound(q.to, true) : NaN;
  if (Number.isFinite(from)) list = list.filter((a) => dayOf(a) >= from);
  if (Number.isFinite(to)) list = list.filter((a) => dayOf(a) <= to);
  const months = Array.isArray(q.months) ? q.months.map(Number).filter((m) => m >= 1 && m <= 12) : [];
  if (months.length > 0) list = list.filter((a) => months.includes(new Date((a.t + (a.tz ?? 0)) * 1000).getUTCMonth() + 1));
  if (q.kind === 'video') list = list.filter((a) => a.video);
  else if (q.kind === 'photo') list = list.filter((a) => !a.video);
  if (q.favorites === true) list = list.filter((a) => a.fav);
  if (q.located === true) list = list.filter((a) => a.lat !== null);
  if (typeof q.trip === 'string' && q.trip !== '') {
    const trip = atlas.tripById?.get(q.trip);
    if (trip) {
      const lo = trip.from;
      const hi = trip.to;
      list = list.filter((a) => a.t >= lo && a.t <= hi && a.lat !== null);
    } else unmatched.push(`trip:${q.trip}`);
  }

  const country = norm(q.country);
  if (country !== '') {
    const cc = resolveCountry(atlas, country);
    if (cc) list = list.filter((a) => a.place?.cc === cc);
    else {
      list = list.filter((a) => norm(a.place?.country).includes(country));
    }
  }

  const place = norm(q.place);
  if (place !== '') {
    const cc = resolveCountry(atlas, place);
    const ids = new Set(lexemesFor(lexicon, place, (c) => PLACE_LEX.has(c)));
    list = list.filter(
      (a) =>
        (cc && a.place?.cc === cc) ||
        ['country', 'province', 'city', 'district'].some((k) => norm(a.place?.[k]).includes(place)) ||
        norm(a.moment).includes(place) ||
        (ids.size > 0 && a.lex.some((id) => ids.has(id))),
    );
  }

  const terms = (Array.isArray(q.labels) ? q.labels : typeof q.labels === 'string' ? q.labels.split(/[,，、]/) : []).map((s) => String(s).trim()).filter(Boolean);
  for (const term of terms) {
    const ids = new Set(lexemesFor(lexicon, term, (c) => c !== 'person'));
    if (ids.size === 0) {
      unmatched.push(term);
      continue;
    }
    matched[term] = [...ids].slice(0, 6).map((id) => lexicon[id].w);
    list = list.filter((a) => a.lex.some((id) => ids.has(id)));
  }
  const people = (Array.isArray(q.people) ? q.people : typeof q.people === 'string' ? [q.people] : []).map((s) => String(s).trim()).filter(Boolean);
  for (const name of people) {
    const ids = new Set(lexemesFor(lexicon, name, (c) => c === 'person'));
    if (ids.size === 0) {
      unmatched.push(name);
      continue;
    }
    matched[name] = [...ids].map((id) => lexicon[id].w);
    list = list.filter((a) => a.lex.some((id) => ids.has(id)));
  }

  if (q.near && Number.isFinite(Number(q.near.lat)) && Number.isFinite(Number(q.near.lng))) {
    const r = Number(q.near.km) > 0 ? Number(q.near.km) : 5;
    const lat = Number(q.near.lat);
    const lng = Number(q.near.lng);
    list = list.filter((a) => a.lat !== null && km(lat, lng, a.lat, a.lng) <= r);
  }

  const limit = Math.max(1, Math.min(60, Number(q.limit) || 12));
  const sorted = [...list];
  if (q.sort === 'newest') sorted.sort((a, b) => b.t - a.t);
  else if (q.sort === 'oldest') sorted.sort((a, b) => a.t - b.t);
  else sorted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  // Spread the picks over time, not 12 shots of one afternoon.
  const ids = [];
  const days = new Map();
  for (const a of sorted) {
    if (ids.length >= limit) break;
    const d = dayOf(a);
    const n = days.get(d) ?? 0;
    if (n >= 3 && sorted.length > limit * 3) continue;
    days.set(d, n + 1);
    ids.push(a.id);
  }

  const places = new Map();
  for (const a of list) {
    if (!a.place) continue;
    const name = a.place.city || a.place.province || a.place.country;
    if (!name) continue;
    const key = `${a.place.cc}|${name}`;
    let e = places.get(key);
    if (!e) places.set(key, (e = { name, country: a.place.country, cc: a.place.cc, count: 0, lat: a.lat, lng: a.lng }));
    e.count += 1;
  }
  const years = {};
  for (const a of list) {
    const y = new Date((a.t + (a.tz ?? 0)) * 1000).getUTCFullYear();
    years[y] = (years[y] ?? 0) + 1;
  }
  const located = list.filter((a) => a.lat !== null);
  const result = {
    total: list.length,
    located: located.length,
    ids,
    first: list.reduce((m, a) => Math.min(m, a.t), Infinity),
    last: list.reduce((m, a) => Math.max(m, a.t), -Infinity),
    places: [...places.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    years,
    bbox: bboxOf(located),
    center: centerOf(located),
    labels: { matched, unmatched },
  };
  if (q.withAll === true) result.all = located.map((a) => a.id);
  if (!Number.isFinite(result.first)) {
    result.first = null;
    result.last = null;
  }
  if (unmatched.length > 0) result.suggestions = suggest(atlas, unmatched);
  return result;
}

/** A country code for a name or code the index knows, or ''. */
export function resolveCountry(atlas, text) {
  const t = norm(text);
  if (/^[a-z]{2}$/.test(t)) return t.toUpperCase();
  const hit = atlas.countryNames?.get(t);
  return hit ?? '';
}

/** Labels the library does have, for a word it does not: near spellings first, then the most common. */
export function suggest(atlas, terms) {
  const counts = atlas.labelCounts ?? [];
  const near = [];
  for (const term of terms) {
    const chars = [...norm(term)];
    for (const row of counts) {
      if (near.length >= 12) break;
      if (chars.some((ch) => row.word.includes(ch)) && !near.includes(row.word)) near.push(row.word);
    }
  }
  const common = counts.slice(0, 40).map((r) => r.word).filter((w) => !near.includes(w));
  return { similar: near, common };
}

/**
 * Turn the panel's search box into a query: `2023`, `2023-07`, `7月`,
 * `视频`/`video`, `收藏`/`favorite`, place names, people's names, and
 * everything else as labels. "京都 2023 猫" → place 京都, 2023, label 猫.
 */
export function parseText(atlas, text) {
  const q = {};
  const labels = [];
  const people = [];
  const months = [];
  const placeNames = new Set();
  for (const a of atlas.located ?? atlas.assets ?? []) {
    const p = a.place;
    if (!p) continue;
    for (const k of ['country', 'province', 'city', 'district']) if (p[k]) placeNames.add(norm(p[k]));
  }
  const isPlace = (t) => {
    if (resolveCountry(atlas, t)) return true;
    for (const n of placeNames) if (n.includes(t) || (t.length >= 2 && t.includes(n) && n.length >= 2)) return true;
    return false;
  };
  const personIds = (t) => lexemesFor(atlas.lexicon ?? {}, t, (c) => c === 'person');
  for (const raw of String(text ?? '').split(/[\s,，、;；]+/)) {
    const t = raw.trim();
    if (t === '') continue;
    let m;
    if ((m = t.match(/^(\d{4})(?:年)?$/))) {
      q.from = q.from && q.from < m[1] ? q.from : m[1];
      q.to = q.to && q.to > m[1] ? q.to : m[1];
    } else if ((m = t.match(/^(\d{4})[-./年](\d{1,2})月?$/))) {
      q.from = `${m[1]}-${m[2].padStart(2, '0')}`;
      q.to = q.from;
    } else if ((m = t.match(/^(\d{1,2})月$/))) months.push(Number(m[1]));
    else if (/^(视频|video|videos)$/i.test(t)) q.kind = 'video';
    else if (/^(照片|photo|photos)$/i.test(t)) q.kind = 'photo';
    else if (/^(收藏|喜欢|favorites?|♥|❤️?)$/i.test(t)) q.favorites = true;
    else if (/^(夏天|夏季|summer)$/i.test(t)) months.push(6, 7, 8);
    else if (/^(冬天|冬季|winter)$/i.test(t)) months.push(12, 1, 2);
    else if (/^(春天|春季|spring)$/i.test(t)) months.push(3, 4, 5);
    else if (/^(秋天|秋季|autumn|fall)$/i.test(t)) months.push(9, 10, 11);
    else if (!q.place && isPlace(norm(t))) q.place = t;
    else if (personIds(t).length > 0) people.push(t);
    else labels.push(t);
  }
  if (months.length) q.months = [...new Set(months)];
  if (labels.length) q.labels = labels;
  if (people.length) q.people = people;
  return q;
}
