/**
 * "On this day": your own photos from this date in earlier years, and world
 * events on this date from Wikipedia — the ones near places you have been
 * first.
 *
 * @module today
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { centerOf } from './geo.mjs';
import { pickBest } from './quality.mjs';
import { bestOf } from './trips.mjs';

/** Month (1–12) and day of an asset in its own local time. */
const monthDayOf = (a) => {
  const d = new Date((a.t + (a.tz ?? 0)) * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};

/**
 * Your photos from `month`/`day` of earlier years, newest year first:
 * `[{year, yearsAgo, count, place, country, cc, lat, lng, cover, ids}]`.
 */
export function memoriesOn(assets, { year, month, day }) {
  const byYear = new Map();
  for (const a of assets) {
    if (a.shot) continue;
    const md = monthDayOf(a);
    if (md.m !== month || md.d !== day || md.y >= year) continue;
    let list = byYear.get(md.y);
    if (!list) byYear.set(md.y, (list = []));
    list.push(a);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, list]) => {
      const located = list.filter((a) => a.lat !== null);
      const counts = new Map();
      for (const a of located) {
        const k = a.place?.city || a.place?.province || a.place?.country || '';
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const place = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const at = located.find((a) => (a.place?.city || a.place?.province || a.place?.country) === place) ?? located[0];
      const center = centerOf(located.filter((a) => (a.place?.city || a.place?.province || a.place?.country || '') === place));
      return {
        year: y,
        yearsAgo: year - y,
        count: list.length,
        place,
        country: at?.place?.country ?? '',
        cc: at?.place?.cc ?? '',
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
        cover: (pickBest(list, 1)[0] ?? bestOf(list)).id,
        ids: pickBest(list.filter((a) => (a.score ?? 0) > -0.2), 12).map((a) => a.id),
      };
    });
}

/** The feed URL for one date. */
export function feedUrl(lang, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
}

/** Strip a Wikipedia feed down to events that have a place: `[{year, text, title, url, lat, lng, thumb}]`. */
export function eventsOf(feed) {
  const out = [];
  for (const e of Array.isArray(feed?.events) ? feed.events : []) {
    const pages = Array.isArray(e.pages) ? e.pages : [];
    const at = pages.find((p) => p?.coordinates && Number.isFinite(p.coordinates.lat) && Number.isFinite(p.coordinates.lon));
    const lead = at ?? pages.find((p) => p?.thumbnail) ?? pages[0];
    out.push({
      year: Number(e.year),
      text: String(e.text ?? '').trim(),
      title: String(lead?.normalizedtitle ?? lead?.titles?.normalized ?? lead?.title ?? '').replace(/_/g, ' '),
      url: String(lead?.content_urls?.desktop?.page ?? ''),
      lat: at ? Math.round(at.coordinates.lat * 1e4) / 1e4 : null,
      lng: at ? Math.round(at.coordinates.lon * 1e4) / 1e4 : null,
      thumb: String(lead?.thumbnail?.source ?? ''),
    });
  }
  return out.filter((e) => e.text !== '');
}

/**
 * The day's events, fetched once and kept for a week.
 * @param {string} cacheDir
 * @param {'zh'|'en'} lang
 */
export async function fetchEvents(cacheDir, lang, month, day, { fetchImpl = fetch, timeoutMs = 15_000, userAgent = 'dsh-atlas (DeepSeek Harness plugin)' } = {}) {
  const file = join(cacheDir, `onthisday-${lang}-${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}.json`);
  try {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(cached.events) && Date.now() - cached.fetchedAt < 7 * 86400_000) return { events: cached.events, fetchedAt: cached.fetchedAt, cached: true };
  } catch {
    // Not fetched yet.
  }
  const headers = { 'user-agent': userAgent, accept: 'application/json' };
  // Simplified Chinese, whatever variant the article was written in.
  if (lang === 'zh') headers['accept-language'] = 'zh-hans';
  const res = await fetchImpl(feedUrl(lang, month, day), { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
  const events = eventsOf(await res.json());
  const fetchedAt = Date.now();
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify({ fetchedAt, events }));
  } catch {
    // Still usable this once.
  }
  return { events, fetchedAt, cached: false };
}

/**
 * Rank events by how close they happened to where you have taken photos:
 * events within `nearKm` of one of your photos first (closest first), then
 * the rest that have a place, then those without one.
 * @param {Array} events - from `eventsOf`.
 * @param {{nearest(lat, lng, km): ({point, km} | null)}} grid
 */
export function rankEvents(events, grid, { nearKm = 60, maxKm = 400 } = {}) {
  const rows = events.map((e) => {
    if (e.lat === null) return { ...e, near: null };
    const hit = grid.nearest(e.lat, e.lng, maxKm);
    if (!hit) return { ...e, near: null };
    const p = hit.point;
    return {
      ...e,
      near: {
        km: Math.round(hit.km * 10) / 10,
        close: hit.km <= nearKm,
        place: p.place?.city || p.place?.province || p.place?.country || '',
        cover: p.id,
        at: p.t,
      },
    };
  });
  const rank = (e) => (e.near?.close ? 0 : e.near ? 1 : e.lat !== null ? 2 : 3);
  return rows.sort((a, b) => rank(a) - rank(b) || (a.near && b.near ? a.near.km - b.near.km : b.year - a.year));
}
