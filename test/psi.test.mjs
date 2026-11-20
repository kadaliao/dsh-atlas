import assert from 'node:assert/strict';
import test from 'node:test';

import { makeLibrary, sampleLexicon, sampleRows } from './fixtures.mjs';

let hasSqlite = true;
try {
  await import('node:sqlite');
} catch {
  hasSqlite = false;
}
const skip = hasSqlite ? false : 'node:sqlite is not available';

test('labels come from psi.sqlite on macOS 26 and earlier', { skip }, async () => {
  const { readLibrary } = await import('../lib/photos-db.mjs');
  const rows = sampleRows();
  const fromLeo = await readLibrary(await makeLibrary(rows, sampleLexicon));
  const fromPsi = await readLibrary(await makeLibrary(rows, sampleLexicon, { index: 'psi' }));
  const words = (r) => Object.values(r.lexicon).map((e) => `${e.c}:${e.w}:${[...e.s].sort().join('/')}`).sort();
  assert.deepEqual(words(fromPsi), words(fromLeo), 'the same words, synonyms and categories, without the trailing NUL');
  assert.ok(fromPsi.assets.some((a) => a.lex.length > 0));
  const lex = (r) => Object.fromEntries(r.assets.map((a) => [a.id, a.lex.map((id) => r.lexicon[id].w).sort()]));
  assert.deepEqual(lex(fromPsi), lex(fromLeo), 'each photo keeps its labels');
});
