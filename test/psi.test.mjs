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

const words = (r) => Object.values(r.lexicon).map((e) => `${e.c}:${e.w}`).sort();
const labelsOf = (r) => Object.fromEntries(r.assets.map((a) => [a.id, a.lex.map((id) => r.lexicon[id].w).sort()]));

// A person with a name, besides the pet 小黑; both come with the words every person and pet has.
const lexicon = { ...sampleLexicon, 9: { c: 3010, w: '小黑', s: ['宠物', '爱宠'] }, 12: { c: 3000, w: '阿明', s: ['人', '人物'] } };
const rows = () => sampleRows().map((r, i) => (i === 3 ? { ...r, labels: [...(r.labels ?? []), 12] } : r));

test('labels come from psi.sqlite on macOS 13 to 26, as they do from leo.sqlite', { skip }, async () => {
  const { readLibrary } = await import('../lib/photos-db.mjs');
  const fromLeo = await readLibrary(await makeLibrary(rows(), lexicon));
  const fromPsi = await readLibrary(await makeLibrary(rows(), lexicon, { index: 'psi' }));
  const full = (r) => Object.values(r.lexicon).map((e) => `${e.c}:${e.w}:${[...e.s].sort().join('/')}`).sort();
  assert.deepEqual(full(fromPsi), full(fromLeo), 'the same words, synonyms and categories, without the trailing NUL');
  assert.ok(fromPsi.assets.some((a) => a.lex.length > 0));
  assert.deepEqual(labelsOf(fromPsi), labelsOf(fromLeo), 'each photo keeps its labels');
});

test('people and pets are found by their names, not by "人物" or "宠物"', { skip }, async () => {
  const { readLibrary } = await import('../lib/photos-db.mjs');
  for (const index of ['leo', 'psi']) {
    const r = await readLibrary(await makeLibrary(rows(), lexicon, { index }));
    const people = Object.values(r.lexicon).filter((e) => e.c === 'person');
    assert.deepEqual(people.map((e) => e.w).sort(), ['小黑', '阿明'], index);
    assert.ok(people.every((e) => e.s.length === 0), index);
  }
});

test('labels and people come from the psi.sqlite of macOS 10.15 to 12 too', { skip }, async () => {
  const { readLibrary } = await import('../lib/photos-db.mjs');
  const fromLeo = await readLibrary(await makeLibrary(rows(), lexicon));
  const fromOld = await readLibrary(await makeLibrary(rows(), lexicon, { index: 'psi5' }));
  assert.deepEqual(words(fromOld), words(fromLeo));
  assert.deepEqual(labelsOf(fromOld), labelsOf(fromLeo));
});
