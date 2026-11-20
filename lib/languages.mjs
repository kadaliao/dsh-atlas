/**
 * Which languages labels and places are named in: the Mac's own languages
 * (System Settings → Language & Region), and always Chinese and English.
 *
 * @module languages
 */

import { execFileSync } from 'node:child_process';

/** One language as the system's tables and Wikidata spell it. */
const LANGUAGE = {
  en: { table: 'en', wiki: ['en'] },
  zh_CN: { table: 'zh_CN', wiki: ['zh-hans', 'zh-cn', 'zh'] },
  zh_TW: { table: 'zh_TW', wiki: ['zh-hant', 'zh-tw', 'zh'] },
  zh_HK: { table: 'zh_HK', wiki: ['zh-hk', 'zh-hant', 'zh'] },
};

/** Always named in these, whatever the Mac's languages. */
const ALWAYS = ['zh_CN', 'en'];
const MAX = 5;

/**
 * A BCP 47 tag (`zh-Hans-SG`, `en-US`, `ja-JP`, `pt-BR`) as `{table, wiki}`:
 * the key of the system's localisation tables and Wikidata's label codes.
 * @param {string} tag
 */
export function languageOf(tag) {
  const parts = String(tag ?? '').replace(/_/g, '-').split('-').filter(Boolean);
  const lang = (parts[0] ?? '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) return null;
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  if (lang === 'zh') {
    if (rest.includes('hk') || rest.includes('mo')) return LANGUAGE.zh_HK;
    if (rest.includes('hant') || rest.includes('tw')) return LANGUAGE.zh_TW;
    return LANGUAGE.zh_CN;
  }
  if (lang === 'en') return LANGUAGE.en;
  const region = rest.find((p) => /^[a-z]{2}$|^\d{3}$/.test(p));
  // The tables have a few regional variants (pt_PT, es_419, fr_CA); the plain language otherwise.
  return { table: lang, wiki: [lang], variant: region ? `${lang}_${region.toUpperCase()}` : null };
}

let cached;
/** The Mac's preferred languages, first first; `[]` when they cannot be read. */
export function preferredLanguages() {
  if (cached !== undefined) return cached;
  try {
    const out = execFileSync('/usr/bin/defaults', ['read', '-g', 'AppleLanguages'], { encoding: 'utf8', timeout: 5000 });
    cached = [...out.matchAll(/"?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)"?\s*,?\s*$/gm)].map((m) => m[1]);
  } catch {
    cached = [];
  }
  return cached;
}

/**
 * The languages to name things in: the Mac's, then Chinese and English;
 * each once, at most five.
 * @param {string[]} [tags]
 */
export function namingLanguages(tags = preferredLanguages()) {
  const out = [];
  const add = (l) => {
    if (l && !out.some((o) => o.table === l.table) && out.length < MAX) out.push(l);
  };
  for (const t of tags) add(languageOf(t));
  for (const key of ALWAYS) add(LANGUAGE[key]);
  return out;
}

/** The language Photos named places in: the Mac's first one. */
export function primaryLanguage(tags = preferredLanguages()) {
  return languageOf(tags[0]) ?? LANGUAGE.en;
}
