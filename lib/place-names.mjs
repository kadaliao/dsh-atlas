/**
 * Place names in Chinese and English. Photos names places in the Mac's
 * language only (北京市 on a Chinese Mac, Beijing on an English one); the
 * other names come from Wikidata, asked once per province, city and district
 * and kept in a cache. Only the names are sent: which of the places of that
 * name is meant is decided here, by where the photos are.
 *
 * @module place-names
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { km } from './geo.mjs';

const LEVELS = ['province', 'city', 'district'];
/** How far a place's own coordinates may be from its photos. */
const RADIUS_KM = { province: 800, city: 150, district: 60 };
/** A name Wikidata did not know is asked again after this long. */
const RETRY_MS = 30 * 86400_000;
const API = 'https://www.wikidata.org/w/api.php';
const CACHE_VERSION = 1;

const norm = (s) => String(s ?? '').trim().toLowerCase();
const CJK = /[㐀-鿿]/;

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
 * One API call. When Wikidata asks to slow down (429, or a `maxlag` error
 * while its servers catch up), wait as long as it says (up to two minutes)
 * and try again; any other error throws, so it is not taken for "no such place".
 */
async function getJson(params, { fetchImpl, userAgent, tries = 5 }) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetchImpl(`${API}?${new URLSearchParams({ format: 'json', maxlag: '5', ...params })}`, { headers: { 'user-agent': userAgent, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const body = res.ok ? await res.json() : null;
    const busy = res.status === 429 || res.status === 503 || body?.error?.code === 'maxlag';
    if (busy && attempt < tries) {
      const after = Number(res.headers?.get?.('retry-after'));
      await sleep(Math.min(120, Number.isFinite(after) && after > 0 ? after : 5 * attempt) * 1000);
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

/** The items Wikidata finds for a place's name, best first. */
async function searchIds(place, opts) {
  const language = CJK.test(place.name) ? 'zh' : 'en';
  const found = await getJson({ action: 'wbsearchentities', search: place.name, language, uselang: language, type: 'item', limit: '8' }, opts);
  return (found?.search ?? []).map((r) => r.id).filter((id) => /^Q\d+$/.test(id));
}

/** The best-ranked of `ids` that is where the place's photos are: its English and Chinese names, or `[]`. */
function pickNames(place, ids, entities) {
  const radius = RADIUS_KM[place.level] ?? 100;
  for (const id of ids) {
    const e = entities[id];
    const at = coordOf(e);
    if (!at || km(at.lat, at.lng, place.lat, place.lng) > radius) continue;
    const l = e.labels ?? {};
    const names = [l.en?.value, l['zh-hans']?.value ?? l['zh-cn']?.value ?? l.zh?.value].filter((v) => typeof v === 'string' && v.trim() !== '');
    return [...new Set(names)];
  }
  return [];
}

/**
 * The names of several places in English and Chinese: `Map<key, names[]>`,
 * `[]` for one Wikidata has no place of that name near its photos. One search
 * per place, then one call for the details of everything found.
 * @param {{key: string, name: string, level: string, lat: number, lng: number}[]} places
 */
export async function lookupMany(places, { fetchImpl = fetch, userAgent = DEFAULT_AGENT, pauseMs = 0 } = {}) {
  const opts = { fetchImpl, userAgent };
  const found = [];
  for (const place of places) {
    found.push([place, await searchIds(place, opts)]);
    if (pauseMs > 0) await sleep(pauseMs);
  }
  const all = [...new Set(found.flatMap(([, ids]) => ids))];
  const entities = {};
  for (let i = 0; i < all.length; i += 50) {
    const got = await getJson({ action: 'wbgetentities', ids: all.slice(i, i + 50).join('|'), props: 'labels|claims', languages: 'en|zh-hans|zh-cn|zh' }, opts);
    Object.assign(entities, got?.entities ?? {});
    if (pauseMs > 0) await sleep(pauseMs);
  }
  return new Map(found.map(([place, ids]) => [place.key, pickNames(place, ids, entities)]));
}

/** {@link lookupMany} for one place. */
export async function lookupNames(place, opts) {
  return (await lookupMany([{ ...place, key: '' }], opts)).get('');
}

/**
 * The cache of place names and the background work that fills it.
 * @param {{cacheDir: string, enabled: () => boolean, log?: Function, userAgent?: string, fetchImpl?: Function, pauseMs?: number}} opts
 */
export function createPlaceNames({ cacheDir, enabled, log = () => {}, userAgent = DEFAULT_AGENT, fetchImpl = fetch, pauseMs = 1000 }) {
  const file = join(cacheDir, 'place-names.json');
  let entries = {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (raw?.version === CACHE_VERSION && raw.places && typeof raw.places === 'object') entries = raw.places;
  } catch {
    // Nothing asked yet.
  }
  const save = () => {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify({ version: CACHE_VERSION, places: entries }));
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      log(`atlas: could not write the place names: ${error?.message ?? error}`);
    }
  };
  let running = null;

  return {
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
      if (running || !enabled()) return running ?? Promise.resolve(false);
      const now = Date.now();
      const todo = [...adminAreasOf(assets).values()]
        .filter((p) => {
          const e = entries[p.key];
          return !e || ((e.names ?? []).length === 0 && now - (e.at ?? 0) > RETRY_MS);
        })
        .sort((a, b) => b.photos - a.photos);
      if (todo.length === 0) return Promise.resolve(false);
      running = (async () => {
        let added = 0;
        let asked = 0;
        for (let i = 0; i < todo.length && enabled(); i += 6) {
          const batch = todo.slice(i, i + 6);
          let got;
          try {
            got = await lookupMany(batch, { fetchImpl, userAgent, pauseMs });
          } catch (error) {
            // Offline or turned away: try again another time.
            log(`atlas: place names paused: ${error?.message ?? error}`);
            break;
          }
          for (const p of batch) {
            const names = got.get(p.key) ?? [];
            entries[p.key] = { names, at: Date.now() };
            if (names.length > 0) added += 1;
          }
          asked += batch.length;
          save();
        }
        if (asked > 0) log(`atlas: named ${added} of ${asked} places in Chinese and English`);
        return added > 0;
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
