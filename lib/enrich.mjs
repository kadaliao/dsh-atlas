/**
 * Tidy the places Photos gave: fill in missing countries and cities, and
 * fold the wards of a big city (Tokyo's 区, Bangkok's districts, Saigon's
 * wards) into the city itself.
 *
 * @module enrich
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { centerOf, createCountryLookup, createGrid, km } from './geo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let countriesCache;
/** Natural Earth countries bundled with the plugin. */
export function loadCountries() {
  if (countriesCache === undefined) {
    try {
      countriesCache = JSON.parse(readFileSync(join(here, '..', 'vendor', 'countries.json'), 'utf8'));
    } catch {
      countriesCache = { type: 'FeatureCollection', features: [] };
    }
  }
  return countriesCache;
}

/**
 * Provinces that are really one city: three or more "cities" in them, all
 * within `spanKm` of each other. Returns a Set of `cc|province`.
 */
export function metroProvinces(assets, { minCities = 3, spanKm = 30 } = {}) {
  const groups = new Map();
  for (const a of assets) {
    const p = a.place;
    if (a.lat === null || !p?.province || !p.city || p.city === p.province) continue;
    const key = `${p.cc}|${p.province}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = new Map()));
    let c = g.get(p.city);
    if (!c) g.set(p.city, (c = []));
    if (c.length < 200) c.push(a);
  }
  const out = new Set();
  for (const [key, cities] of groups) {
    if (cities.size < minCities) continue;
    const centers = [...cities.values()].map((list) => centerOf(list));
    let span = 0;
    for (let i = 0; i < centers.length && span <= spanKm; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        span = Math.max(span, km(centers[i].lat, centers[i].lng, centers[j].lat, centers[j].lng));
        if (span > spanKm) break;
      }
    }
    if (span <= spanKm) out.add(key);
  }
  return out;
}

/**
 * Fill in what Photos did not, in place: the city of a located photo with no
 * address (from the nearest photo within 15 km that has one), else its
 * country (from the bundled borders); and a metro's wards become the metro.
 */
export function enrich(assets, countries = loadCountries()) {
  const lookup = createCountryLookup(countries);
  const named = assets.filter((a) => a.lat !== null && a.place?.city);
  const grid = createGrid(named, 0.25);
  for (const a of assets) {
    if (a.lat === null || (a.place?.cc && a.place?.city)) continue;
    const near = grid.nearest(a.lat, a.lng, 15);
    if (near) {
      a.place = { ...near.point.place, district: a.place?.district || near.point.place.district, home: false, guessed: true };
      continue;
    }
    if (!a.place?.cc) {
      const c = lookup(a.lat, a.lng);
      if (c) {
        const p = a.place ?? {};
        a.place = { cc: c.iso, country: c.zh || c.en, province: p.province ?? '', city: p.city ?? '', district: p.district ?? '', home: false, guessed: true };
      }
    }
  }
  const metros = metroProvinces(assets);
  for (const a of assets) {
    const p = a.place;
    if (!p?.province || !metros.has(`${p.cc}|${p.province}`) || p.city === p.province) continue;
    a.place = { ...p, district: p.city, city: p.province };
  }
  return assets;
}
