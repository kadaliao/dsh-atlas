/**
 * Reads a Photos library off the Harness's main thread: the SQLite reads are
 * synchronous and take seconds on a large library.
 *
 * workerData: `{library}`; posts `{ok: true, assets, lexicon}` or `{ok: false, error: {code, message}}`.
 *
 * @module build-worker
 */

import { parentPort, workerData } from 'node:worker_threads';

import { enrich } from './enrich.mjs';
import { readLibrary } from './photos-db.mjs';

try {
  const { assets, lexicon } = await readLibrary(workerData.library);
  enrich(assets);
  parentPort.postMessage({ ok: true, assets, lexicon });
} catch (error) {
  parentPort.postMessage({ ok: false, error: { code: error?.code ?? '', message: String(error?.message ?? error) } });
}
