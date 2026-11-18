/**
 * Where home is, and the trips away from it.
 *
 * @module trips
 */

import { arc, bboxOf, centerOf, km } from './geo.mjs';

export const DEFAULTS = {
  /** A photo further than this from home is away. */
  awayKm: 100,
  /** Away photos further apart than this are separate trips. */
  gapDays: 3,
  /** A trip needs at least this many photos. */
  minPhotos: 3,
  /** Home-grid cell size, degrees. */
  cellDeg: 0.3,
};

/** The local calendar day number of an asset (days since 1970-01-01, local time). */
export const dayOf = (a) => Math.floor((a.t + (a.tz ?? 0)) / 86400);
/** `YYYY-MM-DD` of a local day number. */
export const isoDay = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/**
 * Home per calendar year: the place with the most days of photos that year,
 * carried over from the nearest year with enough of them.
 *
 * Returns `{byYear: Map<year, home>, main: home}`, each home
 * `{lat, lng, cc, city, days}`; `main` is the one with the most days overall.
 * An explicit `{lat, lng}` override replaces all of them.
 * @param {Array} geo - assets with a location.
 */
export function inferHomes(geo, { cellDeg = DEFAULTS.cellDeg, override = null } = {}) {
  const byYear = new Map();
  if (override && Number.isFinite(override.lat) && Number.isFinite(override.lng)) {
    const home = { lat: override.lat, lng: override.lng, cc: override.cc ?? '', city: override.city ?? '', days: 0, fixed: true };
    return { byYear, main: home, of: () => home };
  }
  const cells = new Map();
  for (const a of geo) {
    const year = new Date((a.t + (a.tz ?? 0)) * 1000).getUTCFullYear();
    const key = `${Math.floor(a.lat / cellDeg)}:${Math.floor(a.lng / cellDeg)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { key, days: new Set(), years: new Map(), points: [] }));
    const day = dayOf(a);
    c.days.add(day);
    let y = c.years.get(year);
    if (!y) c.years.set(year, (y = new Set()));
    y.add(day);
    if (c.points.length < 4000) c.points.push(a);
  }
  const homeOf = (cell) => {
    const center = centerOf(cell.points);
    const counts = new Map();
    for (const p of cell.points) {
      const k = p.place?.city || p.place?.province || '';
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const city = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const cc = cell.points.find((p) => p.place?.cc)?.place?.cc ?? '';
    return { lat: center.lat, lng: center.lng, cc, city, days: cell.days.size };
  };
  const all = [...cells.values()];
  if (all.length === 0) return { byYear, main: null, of: () => null };
  const mainCell = all.reduce((best, c) => (c.days.size > best.days.size ? c : best));
  const main = homeOf(mainCell);
  const years = new Set();
  for (const c of all) for (const y of c.years.keys()) years.add(y);
  const strong = new Map();
  for (const y of years) {
    let best = null;
    let bestDays = 0;
    for (const c of all) {
      const d = c.years.get(y)?.size ?? 0;
      if (d > bestDays) {
        best = c;
        bestDays = d;
      }
    }
    if (best && bestDays >= 15) strong.set(y, best === mainCell ? main : homeOf(best));
  }
  const sorted = [...years].sort((a, b) => a - b);
  for (const y of sorted) {
    if (strong.has(y)) {
      byYear.set(y, strong.get(y));
      continue;
    }
    // The nearest year that had a clear home, earlier first.
    let pick = null;
    for (let d = 1; d < 40 && pick === null; d += 1) pick = strong.get(y - d) ?? strong.get(y + d) ?? null;
    byYear.set(y, pick ?? main);
  }
  const of = (a) => byYear.get(new Date((a.t + (a.tz ?? 0)) * 1000).getUTCFullYear()) ?? main;
  return { byYear, main, of };
}

/** The best-scored asset of a list (ties: the earlier). */
export function bestOf(list) {
  let best = null;
  for (const a of list) if (best === null || (a.score ?? 0) > (best.score ?? 0)) best = a;
  return best;
}

/** A stop's grouping key: the city, else the province, else a grid cell. */
const stopKey = (a) => a.place?.city || a.place?.province || a.place?.country || `${Math.round(a.lat * 2) / 2},${Math.round(a.lng * 2) / 2}`;

/** Top-`n` ids of a list by score, in time order. */
function topIds(list, n) {
  return [...list]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, n)
    .sort((a, b) => a.t - b.t)
    .map((a) => a.id);
}

/**
 * Split one trip's photos (time-ordered) into stops.
 */
export function stopsOf(photos) {
  const raw = [];
  for (const a of photos) {
    const key = stopKey(a);
    const last = raw[raw.length - 1];
    if (last && last.key === key) last.photos.push(a);
    else raw.push({ key, photos: [a] });
  }
  // A lone photo between two stops (a motorway, a station) is folded into the stop before it.
  const kept = [];
  raw.forEach((s, i) => {
    if (s.photos.length < 2 && i > 0 && i < raw.length - 1 && kept.length > 0) kept[kept.length - 1].photos.push(...s.photos);
    else {
      const last = kept[kept.length - 1];
      if (last && last.key === s.key) last.photos.push(...s.photos);
      else kept.push({ key: s.key, photos: [...s.photos] });
    }
  });
  return kept.map((s) => {
    const p = s.photos;
    const first = p.find((a) => a.place) ?? p[0];
    const center = centerOf(p);
    const cover = bestOf(p);
    return {
      name: first.place?.city || first.place?.province || first.place?.district || first.moment || first.place?.country || '',
      province: first.place?.province ?? '',
      country: first.place?.country ?? '',
      cc: first.place?.cc ?? '',
      lat: Math.round(center.lat * 1e4) / 1e4,
      lng: Math.round(center.lng * 1e4) / 1e4,
      from: p[0].t,
      to: p[p.length - 1].t,
      start: isoDay(dayOf(p[0])),
      end: isoDay(dayOf(p[p.length - 1])),
      count: p.length,
      cover: cover.id,
      ids: topIds(p, 12),
    };
  });
}

/**
 * Trips: runs of away-from-home photos without a return home in between.
 *
 * Each trip: `{id, from, to, startDay, endDay, days, count, cover, ids,
 * stops, places, countries, km, bbox, home, path, nodes}`; newest first.
 * `nodes[i]` is the index in `path` of route node i (home, the stops, home).
 * @param {Array} assets - all assets (those without a location are ignored).
 */
export function findTrips(assets, options = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(options)) if (v !== undefined) o[k] = v;
  const geo = assets.filter((a) => a.lat !== null && a.lat !== undefined).sort((a, b) => a.t - b.t);
  const homes = inferHomes(geo, { cellDeg: o.cellDeg, override: o.home ?? null });
  if (homes.main === null) return { trips: [], homes };
  const runs = [];
  let cur = null;
  let lastAway = null;
  for (const a of geo) {
    const home = homes.of(a);
    const away = km(home.lat, home.lng, a.lat, a.lng) > o.awayKm;
    if (away) {
      if (cur && lastAway && a.t - lastAway.t <= o.gapDays * 86400) cur.photos.push(a);
      else runs.push((cur = { home, photos: [a] }));
      lastAway = a;
    } else if (cur && lastAway && a.t - lastAway.t > 6 * 3600) {
      // Back home: the trip is over.
      cur = null;
      lastAway = null;
    }
  }
  const trips = [];
  for (const run of runs) {
    const p = run.photos;
    if (p.length < o.minPhotos) continue;
    const stops = stopsOf(p);
    const startDay = dayOf(p[0]);
    const endDay = dayOf(p[p.length - 1]);
    const route = [run.home, ...stops, run.home];
    let distance = 0;
    const path = [];
    // Where each route node (home, every stop, home) sits in `path`.
    const nodes = [0];
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      distance += km(a.lat, a.lng, b.lat, b.lng);
      const seg = arc(a.lat, a.lng, b.lat, b.lng);
      // Keep longitudes continuous from one leg to the next.
      if (path.length > 0) {
        const lastLng = path[path.length - 1][0];
        let shift = 0;
        while (seg[0][0] + shift - lastLng > 180) shift -= 360;
        while (seg[0][0] + shift - lastLng < -180) shift += 360;
        for (const pt of seg.slice(1)) path.push([Math.round((pt[0] + shift) * 1e4) / 1e4, pt[1]]);
      } else path.push(...seg);
      nodes.push(path.length - 1);
    }
    // Places in visit order, most-photographed first when trimming.
    const byPlace = new Map();
    for (const s of stops) byPlace.set(s.name, (byPlace.get(s.name) ?? 0) + s.count);
    const countries = [];
    for (const s of stops) if (s.cc && !countries.some((c) => c.cc === s.cc)) countries.push({ cc: s.cc, name: s.country });
    const cover = bestOf(p);
    trips.push({
      id: `trip-${isoDay(startDay).replace(/-/g, '')}-${p[0].id.slice(0, 4).toLowerCase()}`,
      from: p[0].t,
      to: p[p.length - 1].t,
      startDay,
      endDay,
      start: isoDay(startDay),
      end: isoDay(endDay),
      days: endDay - startDay + 1,
      count: p.length,
      cover: cover.id,
      ids: topIds(p, 24),
      stops,
      places: [...byPlace.keys()].filter(Boolean),
      countries,
      abroad: countries.some((c) => c.cc && run.home.cc && c.cc !== run.home.cc),
      km: Math.round(distance),
      bbox: bboxOf([...stops, run.home]),
      home: { lat: run.home.lat, lng: run.home.lng, city: run.home.city, cc: run.home.cc },
      path,
      nodes,
    });
  }
  trips.sort((a, b) => b.from - a.from);
  return { trips, homes };
}
