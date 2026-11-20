/**
 * Labels in more than one language. Photos indexes a library in the Mac's
 * language only (猫 on a Chinese Mac, Cat on an English one); the names in
 * the Mac's other languages, Chinese and English come from the tables Photos
 * itself is translated with, read from the system when the index is built.
 *
 * @module translate
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { namingLanguages } from './languages.mjs';

const FRAMEWORKS = '/System/Library/PrivateFrameworks';
const SCENES = join(FRAMEWORKS, 'PhotosFormats.framework', 'Versions', 'A', 'Resources');

/** Label categories that are words, not names: places and people stay as they are. */
const TRANSLATED = new Set(['scene', 'action', 'event', 'trip', 'holiday', 'placeType', 'doc']);

/**
 * Where the names are: the scene taxonomy (keys like `cat`, `Q100026`), the
 * search words of Photos (actions, documents, trips) and the holiday names.
 * `synonyms` gives the key of a word's synonyms, `keep` which keys are words.
 */
export const SYSTEM_TABLES = [
  { file: join(SCENES, 'scenetaxonomy.loctable'), synonyms: (k) => `${k}-synonyms`, scenes: true },
  {
    file: join(FRAMEWORKS, 'PhotoLibraryServices.framework', 'Versions', 'A', 'Resources', 'PhotoLibraryServices.loctable'),
    synonyms: (k) => `${k}_SYNONYMS`,
    keep: (k) => /^SEARCH_(HUMAN_ACTION|UTILITY_TYPE|TEXTUNDERSTANDING|TRIP|SEASON|AUDIO)/.test(k) && !k.endsWith('_SYNONYMS'),
  },
  { file: join(FRAMEWORKS, 'MediaMiningKit.framework', 'Versions', 'A', 'Resources', 'Localizable.loctable'), keep: (k) => !/[%_]/.test(k) },
];

const norm = (s) => String(s ?? '').trim().toLowerCase();
const wordsOf = (v) =>
  typeof v === 'string'
    ? v
        .split('|')
        .map((w) => w.trim())
        .filter((w) => w !== '' && w !== 'NULL' && !w.includes('%') && w.length <= 40)
    : [];

/**
 * Concepts from loctables: `{byScene: Map<scene id, words[]>, byWord: Map<word, words[][]>}`.
 * `tables` are `{entries: {lang: {key: value}}, synonyms?, keep?, scenes?}`;
 * `sceneKeys` maps a scene id (as in `scene/114`) to its taxonomy key.
 * @param {object[]} tables
 * @param {Map<number, string>} [sceneKeys]
 */
export function buildConcepts(tables, sceneKeys = new Map()) {
  const byKey = new Map();
  const byWord = new Map();
  for (const table of tables) {
    const keys = new Set();
    for (const entries of Object.values(table.entries)) for (const k of Object.keys(entries ?? {})) keys.add(k);
    for (const k of keys) {
      if (table.synonyms && k.endsWith(table.synonyms(''))) continue;
      if (table.keep && !table.keep(k)) continue;
      const words = [];
      for (const entries of Object.values(table.entries)) {
        for (const w of [...wordsOf(entries?.[k]), ...(table.synonyms ? wordsOf(entries?.[table.synonyms(k)]) : [])]) if (!words.includes(w)) words.push(w);
      }
      if (words.length === 0) continue;
      if (table.scenes) byKey.set(k, words);
      for (const w of words) {
        const n = norm(w);
        const list = byWord.get(n) ?? [];
        list.push(words);
        byWord.set(n, list);
      }
    }
  }
  const byScene = new Map();
  for (const [id, key] of sceneKeys) {
    const words = byKey.get(key);
    if (words) byScene.set(id, words);
  }
  return { byScene, byWord };
}

/** Scene ids to taxonomy keys, from every version of the taxonomy the system has (the newest wins). */
function readSceneKeys(dir = SCENES) {
  const keys = new Map();
  const files = readdirSync(dir)
    .map((f) => [f, /^PFSceneTaxonomyData_(\d+)\.bz2$/.exec(f)])
    .filter(([, m]) => m)
    .sort((a, b) => Number(a[1][1]) - Number(b[1][1]));
  for (const [f] of files) {
    const text = execFileSync('/usr/bin/bzip2', ['-dc', join(dir, f)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
    for (const line of text.split('\n')) {
      if (!line.startsWith('n:')) continue;
      const parts = line.slice(2).split(',');
      const id = Number(parts[0]);
      const key = parts[parts.length - 1];
      if (Number.isInteger(id) && key) keys.set(id, key);
    }
  }
  return keys;
}

/** One language of a loctable (its regional variant where the table has one, like pt_PT), or `{}`. */
function readLanguage(file, language) {
  for (const key of [language.variant, language.table].filter(Boolean)) {
    try {
      return JSON.parse(execFileSync('/usr/bin/plutil', ['-extract', key, 'json', '-o', '-', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      // Not in this table.
    }
  }
  return {};
}

/**
 * The concepts this Mac has tables for, in the Mac's languages and Chinese
 * and English; empty where it has none.
 * @param {{table: string, variant?: string}[]} [languages]
 */
export function systemConcepts(languages = namingLanguages()) {
  const tables = SYSTEM_TABLES.filter((t) => existsSync(t.file)).map((t) => ({ ...t, entries: Object.fromEntries(languages.map((l) => [l.table, readLanguage(t.file, l)])) }));
  let sceneKeys = new Map();
  try {
    sceneKeys = readSceneKeys();
  } catch {
    // Words still meet by spelling.
  }
  return buildConcepts(tables, sceneKeys);
}

/**
 * Give each label its names in the other languages, as `x` beside its own
 * words `w` and `s`: a scene by its taxonomy id (`keys`: label id →
 * `scene/114`), anything else by one of its words.
 * @param {object} lexicon - id → {c, w, s}; changed in place.
 * @param {Map<string|number, string>} keys
 * @param {{byScene: Map, byWord: Map}} concepts
 */
export function addTranslations(lexicon, keys, concepts) {
  for (const [id, e] of Object.entries(lexicon)) {
    if (!TRANSLATED.has(e.c)) continue;
    const own = [e.w, ...(e.s ?? [])];
    const found = [];
    const scene = /^scene\/(\d+)$/.exec(String(keys.get(id) ?? keys.get(Number(id)) ?? ''));
    const byScene = scene ? concepts.byScene.get(Number(scene[1])) : null;
    if (byScene) found.push(byScene);
    else for (const w of own) found.push(...(concepts.byWord.get(norm(w)) ?? []));
    const seen = new Set(own.map(norm));
    const x = [];
    for (const words of found) {
      for (const w of words) {
        const n = norm(w);
        if (seen.has(n)) continue;
        seen.add(n);
        x.push(w);
      }
    }
    if (x.length > 0) e.x = x;
  }
  return lexicon;
}
