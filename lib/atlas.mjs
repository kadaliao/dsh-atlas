/**
 * The built index of one library: assets, trips, stats and lookups, cached
 * on disk and rebuilt in the background when the library changes.
 *
 * @module atlas
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { enrich, loadCountries } from './enrich.mjs';
import { createGrid, km } from './geo.mjs';
import { createFiles, dbPathOf, findLibraries, isLibrary } from './library.mjs';
import { readLibrary } from './photos-db.mjs';
import { statsOf } from './stats.mjs';
import { findTrips } from './trips.mjs';

/** Bumped when the cached shape changes. */
export const INDEX_VERSION = 7;
/** A changed library is re-read at most this often. */
const REFRESH_MS = 5 * 60_000;

/** What identifies a version of the library: the database's size and time, and its log's. */
export function stampOf(library) {
  const parts = [];
  for (const f of [dbPathOf(library), `${dbPathOf(library)}-wal`]) {
    try {
      const s = statSync(f);
      parts.push(`${s.size}:${Math.floor(s.mtimeMs)}`);
    } catch {
      parts.push('-');
    }
  }
  return parts.join('|');
}

/**
 * Lookups the routes and tools use, built from assets and settings.
 */
export function derive(assets, lexicon, settings = {}) {
  const located = assets.filter((a) => a.lat !== null).sort((a, b) => a.t - b.t);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const { trips, homes } = findTrips(assets, { home: settings.home ?? null, awayKm: settings.awayKm || undefined });
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const counts = new Map();
  for (const a of assets) for (const id of a.lex) counts.set(id, (counts.get(id) ?? 0) + 1);
  const labelCounts = [...counts.entries()]
    .filter(([id]) => lexicon[id]?.c === 'scene')
    .map(([id, n]) => ({ id, word: lexicon[id].w, count: n }))
    .sort((a, b) => b.count - a.count);
  const people = [...counts.entries()]
    .filter(([id]) => lexicon[id]?.c === 'person' && lexicon[id].w)
    .map(([id, n]) => ({ id, name: lexicon[id].w, count: n }))
    .sort((a, b) => b.count - a.count);
  const countryNames = new Map();
  for (const f of loadCountries().features) {
    countryNames.set(String(f.properties.en).toLowerCase(), f.properties.iso);
    countryNames.set(String(f.properties.zh).toLowerCase(), f.properties.iso);
  }
  for (const a of located) if (a.place?.cc && a.place.country) countryNames.set(a.place.country.toLowerCase(), a.place.cc);
  const statsCache = new Map();
  return {
    assets,
    located,
    byId,
    lexicon,
    trips,
    tripById,
    homes,
    labelCounts,
    people,
    countryNames,
    grid: createGrid(located, 0.5),
    stats(year) {
      const key = year === undefined ? 'all' : String(year);
      if (!statsCache.has(key)) statsCache.set(key, statsOf(assets, trips, year === undefined ? {} : { year }));
      return statsCache.get(key);
    },
  };
}

/**
 * One library's index, kept fresh.
 * @param {{cacheDir: string, settings: () => object, log?: (msg: string) => void}} options
 */
export function createAtlas({ cacheDir, settings, log = () => {} }) {
  const file = join(cacheDir, 'index.json');
  const state = {
    status: 'idle',
    error: null,
    library: '',
    candidates: [],
    builtAt: 0,
    stamp: '',
    checkedAt: 0,
    data: null,
    files: null,
    building: null,
  };

  const chooseLibrary = () => {
    const configured = String(settings().library ?? '').trim();
    if (configured && isLibrary(configured)) return configured;
    state.candidates = findLibraries(configured);
    return state.candidates[0] ?? '';
  };

  const useRaw = (raw, library) => {
    state.data = derive(raw.assets, raw.lexicon, settings());
    if (state.library !== library || state.files === null) state.files = createFiles(library);
    else state.files.reset();
    state.library = library;
    state.status = 'ready';
    state.error = null;
  };

  const readCache = (library) => {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      if (raw.version !== INDEX_VERSION || raw.library !== library || !Array.isArray(raw.assets)) return null;
      return raw;
    } catch {
      return null;
    }
  };

  const build = async (library) => {
    const started = Date.now();
    const stamp = stampOf(library);
    const { assets, lexicon } = await readInWorker(library);
    const raw = { version: INDEX_VERSION, library, stamp, builtAt: Date.now(), assets, lexicon };
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(raw));
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      log(`atlas: could not write the index cache: ${error?.message ?? error}`);
    }
    state.stamp = stamp;
    state.builtAt = raw.builtAt;
    useRaw(raw, library);
    log(`atlas: indexed ${assets.length} items (${state.data.located.length} with a place) in ${Date.now() - started} ms`);
  };

  /** Load from the cache or the library; resolves when there is something to show. */
  const ensure = async ({ force = false } = {}) => {
    if (state.building) return state.building;
    const library = chooseLibrary();
    if (library === '') {
      state.status = 'error';
      state.error = { code: 'no-library', message: 'No Photos library found.' };
      return;
    }
    if (!force && state.data && state.library === library) {
      // Re-read a changed library now and then, in the background.
      if (Date.now() - state.checkedAt > 30_000) {
        state.checkedAt = Date.now();
        if (stampOf(library) !== state.stamp && Date.now() - state.builtAt > REFRESH_MS) {
          state.building = build(library)
            .catch((error) => log(`atlas: refresh failed: ${error?.message ?? error}`))
            .finally(() => {
              state.building = null;
            });
        }
      }
      return;
    }
    if (!force && state.library !== library) {
      const cached = readCache(library);
      if (cached) {
        state.stamp = cached.stamp;
        state.builtAt = cached.builtAt;
        useRaw(cached, library);
        state.checkedAt = 0;
        return ensure();
      }
    }
    state.status = 'building';
    state.building = build(library)
      .catch((error) => {
        state.status = 'error';
        const code = error?.code === 'EPERM' || error?.code === 'EACCES' || /authoriz|permission|not permitted|unable to open/i.test(String(error?.message)) ? 'permission' : error?.code === 'ENOENT' ? 'no-library' : 'read-failed';
        state.error = { code, message: String(error?.message ?? error) };
        log(`atlas: could not read ${library}: ${state.error.message}`);
      })
      .finally(() => {
        state.building = null;
      });
    return state.building;
  };

  return {
    ensure,
    /** Re-read the library now. */
    rebuild: () => ensure({ force: true }),
    /** Recompute trips and stats after a settings change, without re-reading. */
    rederive() {
      if (state.data) state.data = derive(state.data.assets, state.data.lexicon, settings());
    },
    get data() {
      return state.data;
    },
    get files() {
      return state.files;
    },
    status() {
      return {
        status: state.building && state.data ? 'refreshing' : state.status,
        error: state.error,
        library: state.library,
        candidates: state.candidates,
        builtAt: state.builtAt,
        items: state.data?.assets.length ?? 0,
        located: state.data?.located.length ?? 0,
      };
    },
  };
}

/**
 * Read and tidy a library on a worker thread, so the Harness keeps answering
 * meanwhile; on the calling thread where workers are not available.
 */
export async function readInWorker(library) {
  let Worker;
  try {
    ({ Worker } = await import('node:worker_threads'));
  } catch {
    Worker = undefined;
  }
  if (Worker) {
    try {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./build-worker.mjs', import.meta.url), { workerData: { library } });
        let settled = false;
        worker.once('message', (msg) => {
          settled = true;
          if (msg?.ok) resolve({ assets: msg.assets, lexicon: msg.lexicon });
          else reject(Object.assign(new Error(msg?.error?.message ?? 'read failed'), { code: msg?.error?.code ?? '' }));
          void worker.terminate();
        });
        worker.once('error', (error) => {
          if (!settled) reject(Object.assign(error, { worker: true }));
        });
        worker.once('exit', (code) => {
          if (!settled) reject(Object.assign(new Error(`reader exited (${code})`), { worker: true }));
        });
      });
    } catch (error) {
      if (!error?.worker) throw error;
      // The worker could not start here: read inline below.
    }
  }
  const { assets, lexicon } = await readLibrary(library);
  enrich(assets);
  return { assets, lexicon };
}

export { km, loadCountries };
