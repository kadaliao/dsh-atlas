/**
 * Footprint numbers: countries, provinces and cities, per year and overall.
 *
 * @module stats
 */

import { dayOf } from './trips.mjs';

/** The year (local time) of an asset. */
export const yearOf = (a) => new Date((a.t + (a.tz ?? 0)) * 1000).getUTCFullYear();

/** Roughly how many countries there are, for a coverage share. */
export const WORLD_COUNTRIES = 195;

/** `🇯🇵` for `JP`. */
export function flagOf(cc) {
  if (typeof cc !== 'string' || !/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Tallies over located assets (all, or one year's).
 *
 * Returns `{photos, videos, located, days, countries, provinces, cities,
 * years, trips, km, abroadTrips, firstAt, lastAt}` where `countries`,
 * `provinces` and `cities` are lists `{key, name, cc, photos, days, first,
 * last, lat, lng, cover}` sorted by days.
 * @param {Array} assets
 * @param {Array} trips - from `findTrips`.
 * @param {{year?: number}} [filter]
 */
export function statsOf(assets, trips, filter = {}) {
  const inYear = (a) => filter.year === undefined || yearOf(a) === filter.year;
  const list = assets.filter(inYear);
  const located = list.filter((a) => a.lat !== null && a.lat !== undefined);
  const tally = (keyOf, nameOf) => {
    const m = new Map();
    for (const a of located) {
      const key = keyOf(a);
      if (!key) continue;
      let e = m.get(key);
      if (!e) m.set(key, (e = { key, name: nameOf(a), cc: a.place?.cc ?? '', photos: 0, days: new Set(), first: a.t, last: a.t, lat: a.lat, lng: a.lng, cover: a.id, score: -1 }));
      e.photos += 1;
      e.days.add(dayOf(a));
      if (a.t < e.first) e.first = a.t;
      if (a.t > e.last) e.last = a.t;
      if ((a.score ?? 0) > e.score) {
        e.score = a.score ?? 0;
        e.cover = a.id;
        e.lat = a.lat;
        e.lng = a.lng;
      }
    }
    return [...m.values()]
      .map(({ days, score, ...rest }) => ({ ...rest, days: days.size }))
      .sort((a, b) => b.days - a.days || b.photos - a.photos);
  };
  const countries = tally(
    (a) => a.place?.cc || '',
    (a) => a.place?.country || a.place?.cc || '',
  );
  const provinces = tally(
    (a) => (a.place?.cc ? `${a.place.cc}|${a.place.province || a.place.city}` : ''),
    (a) => a.place?.province || a.place?.city || '',
  );
  const cities = tally(
    (a) => (a.place?.cc && a.place.city ? `${a.place.cc}|${a.place.city}` : ''),
    (a) => a.place?.city || '',
  );
  const tripList = (trips ?? []).filter((t) => filter.year === undefined || new Date(t.startDay * 86400000).getUTCFullYear() === filter.year);
  const years = new Map();
  for (const a of list) {
    const y = yearOf(a);
    let e = years.get(y);
    if (!e) years.set(y, (e = { year: y, photos: 0, located: 0, days: new Set(), cities: new Set(), countries: new Set() }));
    e.photos += 1;
    if (a.lat !== null && a.lat !== undefined) {
      e.located += 1;
      e.days.add(dayOf(a));
      if (a.place?.city) e.cities.add(`${a.place.cc}|${a.place.city}`);
      if (a.place?.cc) e.countries.add(a.place.cc);
    }
  }
  // A city is new in the year it first shows up.
  const firstYear = new Map();
  for (const a of [...assets].filter((x) => x.place?.city).sort((x, y) => x.t - y.t)) {
    const k = `${a.place.cc}|${a.place.city}`;
    if (!firstYear.has(k)) firstYear.set(k, yearOf(a));
  }
  const allTrips = trips ?? [];
  const yearRows = [...years.values()]
    .map((e) => {
      const ts = allTrips.filter((t) => new Date(t.startDay * 86400000).getUTCFullYear() === e.year);
      return {
        year: e.year,
        photos: e.photos,
        located: e.located,
        days: e.days.size,
        cities: e.cities.size,
        countries: e.countries.size,
        newCities: [...e.cities].filter((k) => firstYear.get(k) === e.year).length,
        trips: ts.length,
        km: ts.reduce((s, t) => s + t.km, 0),
      };
    })
    .sort((a, b) => a.year - b.year);
  return {
    photos: list.filter((a) => !a.video).length,
    videos: list.filter((a) => a.video).length,
    located: located.length,
    days: new Set(located.map(dayOf)).size,
    countries,
    provinces,
    cities,
    years: yearRows,
    trips: tripList.length,
    abroadTrips: tripList.filter((t) => t.abroad).length,
    km: tripList.reduce((s, t) => s + t.km, 0),
    longestTrip: tripList.reduce((best, t) => (best === null || t.days > best.days ? t : best), null)?.id ?? null,
    farthestTrip: tripList.reduce((best, t) => (best === null || t.km > best.km ? t : best), null)?.id ?? null,
    firstAt: located.reduce((m, a) => Math.min(m, a.t), Infinity),
    lastAt: located.reduce((m, a) => Math.max(m, a.t), -Infinity),
    coverage: Math.round((countries.length / WORLD_COUNTRIES) * 1000) / 10,
  };
}
