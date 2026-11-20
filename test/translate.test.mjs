import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { lexemesFor, parseText } from '../lib/search.mjs';
import { addTranslations, buildConcepts, SYSTEM_TABLES, systemConcepts } from '../lib/translate.mjs';

const scenes = {
  scenes: true,
  synonyms: (k) => `${k}-synonyms`,
  entries: {
    en: { cat: 'Cat', 'cat-synonyms': 'Cats', beach: 'Beach', 'beach-synonyms': 'NULL' },
    zh_CN: { cat: '猫', 'cat-synonyms': '猫咪|小猫', beach: '海滩', 'beach-synonyms': '沙滩' },
  },
};
const actions = {
  synonyms: (k) => `${k}_SYNONYMS`,
  keep: (k) => k.startsWith('SEARCH_HUMAN_ACTION') && !k.endsWith('_SYNONYMS'),
  entries: { en: { SEARCH_HUMAN_ACTION_DANCING: 'Dancing', SEARCH_HUMAN_ACTION_DANCING_SYNONYMS: 'Dance', SEARCH_OTHER: 'Cat' }, zh_CN: { SEARCH_HUMAN_ACTION_DANCING: '跳舞' } },
};

test('labels get their names in the other language, scenes by taxonomy id', () => {
  const concepts = buildConcepts([scenes, actions], new Map([[114, 'cat'], [5, 'beach']]));
  const lexicon = {
    1: { c: 'scene', w: 'Cat', s: [] },
    2: { c: 'scene', w: '海滩', s: [] },
    3: { c: 'action', w: 'Dancing', s: [] },
    4: { c: 'poi', w: 'Beach', s: [] },
    5: { c: 'person', w: 'Cat', s: [] },
  };
  // 1 by its id; 2 has none and meets by spelling.
  addTranslations(lexicon, new Map([[1, 'scene/114']]), concepts);
  assert.deepEqual(lexicon[1].x, ['Cats', '猫', '猫咪', '小猫']);
  assert.deepEqual(lexicon[2].x, ['Beach', '沙滩']);
  assert.deepEqual(lexicon[3].x, ['Dance', '跳舞']);
  assert.equal(lexicon[4].x, undefined, 'place names stay as they are');
  assert.equal(lexicon[5].x, undefined, 'and so do people');
  assert.deepEqual(lexemesFor(lexicon, '猫'), [1]);
  assert.deepEqual(lexemesFor(lexicon, 'beach', (c) => c === 'scene'), [2]);
  assert.deepEqual(parseText({ lexicon, assets: [] }, '跳舞的猫').labels, ['跳舞', '猫']);
});

const hasTables = existsSync(SYSTEM_TABLES[0].file);
test('this Mac names cats in Chinese and English', { skip: hasTables ? false : 'no Photos translation tables on this system' }, () => {
  const concepts = systemConcepts();
  const lexicon = { 1: { c: 'scene', w: 'Cat', s: [] }, 2: { c: 'action', w: '跳舞', s: [] } };
  addTranslations(lexicon, new Map([[1, 'scene/114']]), concepts);
  assert.ok(lexicon[1].x.includes('猫'));
  assert.ok(lexicon[2].x.includes('Dancing'));
});
