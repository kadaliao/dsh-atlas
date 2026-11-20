/**
 * Place names in more than one language. Photos names places in the Mac's
 * language only (北京市 on a Chinese Mac, Beijing on an English one); the names
 * in the Mac's other languages, Chinese and English come from Wikidata, asked
 * once per province, city and district and kept in a cache. Only the names
 * are sent: which of the places of that name is meant is decided here, by
 * where the photos are.
 *
 * @module place-names
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadCountries } from './enrich.mjs';
import { createCountryLookup, km } from './geo.mjs';
import { namingLanguages, primaryLanguage } from './languages.mjs';

const LEVELS = ['province', 'city', 'district'];
/** How far a place's own coordinates may be from the middle of its photos (a province can be very large). */
const RADIUS_KM = { province: 1500, city: 300, district: 80 };
/** A name Wikidata did not know is asked again after this long. */
const RETRY_MS = 30 * 86400_000;
const API = 'https://www.wikidata.org/w/api.php';
const CACHE_VERSION = 2;

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** The language a name is written in, by its script, as Wikidata codes it. */
function scriptLanguage(name) {
  if (/[぀-ヿ]/.test(name)) return 'ja';
  if (/[가-힯]/.test(name)) return 'ko';
  if (/[㐀-鿿]/.test(name)) return 'zh';
  if (/[Ѐ-ӿ]/.test(name)) return 'ru';
  if (/[฀-๿]/.test(name)) return 'th';
  if (/[؀-ۿ]/.test(name)) return 'ar';
  return 'en';
}

/**
 * Shorter forms of a name to try when Wikidata does not know it as Photos
 * spells it: "Xinjiang Uygur Zizhiqu" → "Xinjiang Uygur" → "Xinjiang",
 * "Hong Kong SAR" → "Hong Kong", "Foo (Bar)" → "Foo".
 */
export function shorterNames(name) {
  const out = [];
  let n = String(name).replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim();
  if (n !== name.trim() && n !== '') out.push(n);
  for (let i = 0; i < 2; i += 1) {
    const words = n.split(/\s+/);
    if (words.length < 2) break;
    n = words.slice(0, -1).join(' ');
    out.push(n);
  }
  return out;
}

/**
 * The provinces, cities and districts of the located photos, each once:
 * `Map<key, {key, level, name, cc, lat, lng, photos}>`, `lat`/`lng` the middle of its photos.
 * @param {object[]} assets
 */
export function adminAreasOf(assets) {
  const out = new Map();
  for (const a of assets) {
    const p = a.place;
    if (!p || a.lat === null || a.lat === undefined) continue;
    for (const level of LEVELS) {
      const name = String(p[level] ?? '').trim();
      if (name === '') continue;
      const key = `${p.cc ?? ''}|${level}|${norm(name)}`;
      let e = out.get(key);
      if (!e) out.set(key, (e = { key, level, name, cc: p.cc ?? '', lat: 0, lng: 0, photos: 0 }));
      e.lat += a.lat;
      e.lng += a.lng;
      e.photos += 1;
    }
  }
  for (const e of out.values()) {
    e.lat /= e.photos;
    e.lng /= e.photos;
  }
  return out;
}

const DEFAULT_AGENT = 'dsh-atlas (https://github.com/kadaliao/dsh-atlas)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One API call. When Wikidata asks to slow down (429, or an error saying it
 * is too busy), wait as long as it says (up to two minutes)
 * and try again; any other error throws, so it is not taken for "no such place".
 */
async function getJson(params, { fetchImpl, userAgent, tries = 5, busyWaitMs }) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetchImpl(`${API}?${new URLSearchParams({ format: 'json', maxlag: '5', ...params })}`, { headers: { 'user-agent': userAgent, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const body = res.ok ? await res.json() : null;
    // Too busy for now, in its several ways (maxlag, cirrussearch-too-busy-error, ratelimited, readonly).
    const busy = res.status === 429 || res.status === 503 || /maxlag|busy|ratelimit|readonly/i.test(String(body?.error?.code ?? ''));
    if (busy && attempt < tries) {
      const after = Number(res.headers?.get?.('retry-after'));
      await sleep(busyWaitMs ?? Math.min(120, Number.isFinite(after) && after > 0 ? after : 5 * attempt) * 1000);
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`Wikidata answered ${res.status}`), { status: res.status });
    if (body?.error) throw Object.assign(new Error(`Wikidata: ${body.error.code ?? 'error'}`), { status: res.status });
    return body;
  }
}

const coordOf = (entity) => {
  const v = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude) ? { lat: v.latitude, lng: v.longitude } : null;
};

/**
 * The items Wikidata finds for a name, best first, `{id, named}` (`named`:
 * it is called this name or starts with it, like New York City). Searched in
 * the Mac's language, then the name's own script.
 */
async function searchIds(name, opts) {
  const langs = [...new Set([opts.searchLanguage, scriptLanguage(name)].filter(Boolean))];
  for (const language of langs) {
    const found = await getJson({ action: 'wbsearchentities', search: name, language, uselang: language, type: 'item', limit: '8' }, opts);
    const ids = (found?.search ?? [])
      .filter((r) => /^Q\d+$/.test(r.id))
      .map((r) => ({ id: r.id, named: [r.match?.text, r.label].some((t) => norm(t).startsWith(norm(name))) }));
    if (ids.length > 0) return ids;
    if (opts.pauseMs > 0) await sleep(opts.pauseMs);
  }
  return [];
}

/**
 * Of `ids`, the one that is where the place's photos are — close enough for
 * its level, and not in another country — named in each of `languages`; `[]`
 * when none is. Places that no longer exist (the Roman Republic for Rome) are
 * left out. Wikidata's ranking decides (Sydney the city, not the electoral
 * division), except that for a city or district a place by this name ten
 * times nearer wins (New York the city, not the state). A place is something
 * with people living in it: New York University is nearer still, but not one.
 */
function pickNames(place, ids, entities, languages, countryAt) {
  const radius = RADIUS_KM[place.level] ?? 300;
  const home = countryAt(place.lat, place.lng);
  const near = [];
  for (const [rank, { id, named }] of ids.entries()) {
    const e = entities[id];
    const at = coordOf(e);
    const d = at ? km(at.lat, at.lng, place.lat, place.lng) : Infinity;
    if (d > radius) continue;
    // The world map is coarse (no Hong Kong, coasts cut short): only a clear other country rules one out.
    const there = countryAt(at.lat, at.lng);
    if (home && there && there !== home) continue;
    if (e.claims?.P576) continue;
    near.push({ e, d, rank, named: named && Boolean(e.claims?.P1082) });
  }
  if (place.level !== 'province' && near.length > 1 && near[0].d > 30) {
    const closer = near.find((c) => c.named && c.d * 10 < near[0].d);
    if (closer) near.unshift(closer);
  }
  for (const { e } of near) {
    const l = e.labels ?? {};
    const names = languages.map((lang) => lang.wiki.map((code) => l[code]?.value).find((v) => typeof v === 'string' && v.trim() !== '')).filter(Boolean);
    if (names.length > 0) return [...new Set(names)];
  }
  return [];
}

let worldLookup;
const countryOfPoint = (lat, lng) => {
  worldLookup ??= createCountryLookup(loadCountries());
  return worldLookup(lat, lng)?.iso ?? null;
};

/**
 * The names of several places in each of `languages` (the Mac's, Chinese and
 * English): `Map<key, names[]>`, `[]` for one Wikidata has no place of that
 * name near its photos. A search per place, then one call for the details of
 * everything found; places not found try shorter forms of their names.
 * @param {{key: string, name: string, level: string, lat: number, lng: number}[]} places
 */
export async function lookupMany(places, { fetchImpl = fetch, userAgent = DEFAULT_AGENT, pauseMs = 0, busyWaitMs, languages = namingLanguages(), searchLanguage = primaryLanguage().wiki[0], countryAt = countryOfPoint } = {}) {
  const opts = { fetchImpl, userAgent, pauseMs, busyWaitMs, searchLanguage };
  const codes = [...new Set(languages.flatMap((l) => l.wiki))].join('|');
  const out = new Map();
  let pending = places.map((place) => ({ place, names: [place.name, ...shorterNames(place.name)] }));
  while (pending.length > 0) {
    const found = [];
    for (const p of pending) {
      found.push([p, await searchIds(p.names[0], opts)]);
      if (pauseMs > 0) await sleep(pauseMs);
    }
    const all = [...new Set(found.flatMap(([, ids]) => ids.map((r) => r.id)))];
    const entities = {};
    for (let i = 0; i < all.length; i += 50) {
      const got = await getJson({ action: 'wbgetentities', ids: all.slice(i, i + 50).join('|'), props: 'labels|claims', languages: codes }, opts);
      Object.assign(entities, got?.entities ?? {});
      if (pauseMs > 0) await sleep(pauseMs);
    }
    const next = [];
    for (const [p, ids] of found) {
      const names = pickNames(p.place, ids, entities, languages, countryAt);
      if (names.length > 0 || p.names.length === 1) out.set(p.place.key, names);
      else next.push({ place: p.place, names: p.names.slice(1) });
    }
    pending = next;
  }
  return out;
}

/** {@link lookupMany} for one place. */
export async function lookupNames(place, opts) {
  return (await lookupMany([{ ...place, key: '' }], opts)).get('');
}

/**
 * The cache of place names and the background work that fills it.
 * `onNames` is called whenever names come in. When Wikidata cannot be
 * reached or is too busy, it tries again by itself later (10 minutes,
 * doubling up to an hour).
 * @param {{cacheDir: string, enabled: () => boolean, onNames?: () => void, log?: Function, userAgent?: string, fetchImpl?: Function, pauseMs?: number, busyWaitMs?: number, retryMs?: number, languages?: object[], searchLanguage?: string, countryAt?: Function}} opts
 */
export function createPlaceNames({ cacheDir, enabled, onNames = () => {}, log = () => {}, userAgent = DEFAULT_AGENT, fetchImpl = fetch, pauseMs = 1000, busyWaitMs, retryMs = 10 * 60_000, languages, searchLanguage, countryAt }) {
  const file = join(cacheDir, 'place-names.json');
  const langs = languages ?? namingLanguages();
  // Names in other languages than the Mac's are asked again.
  const langKey = langs.map((l) => l.table).join(',');
  let entries = {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (raw?.version === CACHE_VERSION && raw.languages === langKey && raw.places && typeof raw.places === 'object') entries = raw.places;
  } catch {
    // Nothing asked yet.
  }
  const lookupOpts = { fetchImpl, userAgent, pauseMs, busyWaitMs, languages: langs, ...(searchLanguage ? { searchLanguage } : {}), ...(countryAt ? { countryAt } : {}) };
  const save = () => {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify({ version: CACHE_VERSION, languages: langKey, places: entries }));
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      log(`atlas: could not write the place names: ${error?.message ?? error}`);
    }
  };
  let running = null;
  let retryTimer = null;
  let retryIn = retryMs;
  let latest = [];

  const api = {
    /**
     * `[name in another language, the library's own name]` pairs, both
     * lower-case, for the places of `assets`.
     */
    aliasesFor(assets) {
      const out = [];
      if (!enabled()) return out;
      for (const p of adminAreasOf(assets).values()) {
        const own = norm(p.name);
        for (const n of entries[p.key]?.names ?? []) if (norm(n) !== own) out.push([norm(n), own]);
      }
      return out;
    },
    /** Ask for the places not asked yet; resolves to whether any names came. */
    fill(assets) {
      latest = assets;
      if (running || !enabled()) return running ?? Promise.resolve(false);
      clearTimeout(retryTimer);
      retryTimer = null;
      const now = Date.now();
      const todo = [...adminAreasOf(assets).values()]
        .filter((p) => {
          const e = entries[p.key];
          return !e || ((e.names ?? []).length === 0 && now - (e.at ?? 0) > RETRY_MS);
        })
        // Provinces and cities first: most searches are for them, and a large library has many districts.
        .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || b.photos - a.photos);
      if (todo.length === 0) return Promise.resolve(false);
      running = (async () => {
        let added = 0;
        let asked = 0;
        let paused = false;
        for (let i = 0; i < todo.length && enabled(); i += 6) {
          const batch = todo.slice(i, i + 6);
          let got;
          try {
            got = await lookupMany(batch, lookupOpts);
          } catch (error) {
            // Offline or turned away: try again later, by itself.
            log(`atlas: place names paused, trying again in ${Math.round(retryIn / 60_000)} min: ${error?.message ?? error}`);
            paused = true;
            break;
          }
          for (const p of batch) {
            const names = got.get(p.key) ?? [];
            entries[p.key] = { names, at: Date.now() };
            if (names.length > 0) added += 1;
          }
          asked += batch.length;
          save();
          if (got.size > 0 && batch.some((p) => (got.get(p.key) ?? []).length > 0)) onNames();
        }
        if (paused) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            api.fill(latest);
          }, retryIn);
          retryTimer.unref?.();
          retryIn = Math.min(60 * 60_000, retryIn * 2);
        } else retryIn = retryMs;
        if (asked > 0) log(`atlas: named ${added} of ${asked} places in ${langKey}`);
        return added > 0;
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
  return api;
}
