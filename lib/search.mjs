/**
 * Find photos by place, time, labels, people and distance.
 *
 * @module search
 */

import { bboxOf, centerOf, km } from './geo.mjs';
import { pickBest } from './quality.mjs';
import { dayOf } from './trips.mjs';

const PLACE_LEX = new Set(['street', 'area', 'poi', 'landmark', 'water', 'placeType']);
const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Parse a date bound: `YYYY`, `YYYY-MM` or `YYYY-MM-DD` into a local day
 * number, the first day for `from`, the last for `to`. NaN when unreadable.
 */
export function dayBound(value, end) {
  const m = String(value ?? '').trim().match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) - 1 : end ? 11 : 0;
  if (!m[3]) {
    const d = end ? Date.UTC(y, mo + 1, 0) : Date.UTC(y, mo, 1);
    return Math.floor(d / 86400000);
  }
  return Math.floor(Date.UTC(y, mo, Number(m[3])) / 86400000);
}

const startsWord = (text, t) => {
  let i = text.indexOf(t);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return true;
    i = text.indexOf(t, i + 1);
  }
  return false;
};

/** Every word a label goes by: its own, its synonyms, and its names in other languages. */
const wordsOf = (e) => [e.w, ...(e.s ?? []), ...(e.x ?? [])];

/**
 * Label ids matching a word: exact matches on a primary word or synonym
 * first; failing that, words containing it.
 * @param {object} lexicon - id → {c, w, s}
 * @param {string} term
 * @param {(c: string) => boolean} [only] - categories to look in.
 */
export function lexemesFor(lexicon, term, only) {
  const t = norm(term);
  if (t === '') return [];
  // "cat" is not in "delicatessen": Latin words match from the start of a word.
  const latin = /^[a-z0-9' -]+$/.test(t);
  const exact = [];
  const partial = [];
  for (const [id, e] of Object.entries(lexicon)) {
    if (only && !only(e.c)) continue;
    const words = wordsOf(e).map(norm);
    if (words.includes(t)) exact.push(Number(id));
    else if (t.length >= 2 && words.some((w) => (latin ? startsWord(w, t) : w.includes(t)))) partial.push(Number(id));
  }
  return exact.length > 0 ? exact : partial;
}

/**
 * Search the index.
 *
 * `q`: `{place, country, from, to, months, labels, people, near: {lat, lng, km},
 * kind, favorites, located, trip, sort, limit, withAll}` — every part
 * optional, all of them must hold (a label or person the library does not
 * know matches nothing); `place` may be a list, any of which will do; `withAll` adds `all`, every located match's id, and `matches`, every match's id. Returns `{total, located, ids, first, last, places,
 * years, bbox, center, labels: {matched, unmatched}, suggestions}`.
 * @param {object} atlas - the built index (`assets`, `lexicon`, `labelCounts`, `countryNames`, `tripById`).
 */
export function search(atlas, q = {}) {
  const lexicon = atlas.lexicon ?? {};
  let list = atlas.assets;
  const matched = {};
  const unmatched = [];

  const from = q.from ? dayBound(q.from, false) : NaN;
  const to = q.to ? dayBound(q.to, true) : NaN;
  if (Number.isFinite(from)) list = list.filter((a) => dayOf(a) >= from);
  if (Number.isFinite(to)) list = list.filter((a) => dayOf(a) <= to);
  const months = Array.isArray(q.months) ? q.months.map(Number).filter((m) => m >= 1 && m <= 12) : [];
  if (months.length > 0) list = list.filter((a) => months.includes(new Date((a.t + (a.tz ?? 0)) * 1000).getUTCMonth() + 1));
  if (q.kind === 'video') list = list.filter((a) => a.video);
  else if (q.kind === 'photo') list = list.filter((a) => !a.video);
  else if (q.kind === 'screenshot') list = list.filter((a) => a.shot);
  if (q.favorites === true) list = list.filter((a) => a.fav);
  if (q.located === true) list = list.filter((a) => a.lat !== null);
  if (typeof q.trip === 'string' && q.trip !== '') {
    const trip = atlas.tripById?.get(q.trip);
    if (trip) {
      const lo = trip.from;
      const hi = trip.to;
      list = list.filter((a) => a.t >= lo && a.t <= hi && a.lat !== null);
    } else unmatched.push(`trip:${q.trip}`);
  }

  const country = norm(q.country);
  if (country !== '') {
    const cc = resolveCountry(atlas, country);
    if (cc) list = list.filter((a) => a.place?.cc === cc);
    else {
      list = list.filter((a) => norm(a.place?.country).includes(country));
    }
  }

  if (Number.isFinite(Number(q.lexeme)) && q.lexeme !== null && q.lexeme !== '') {
    const id = Number(q.lexeme);
    list = list.filter((a) => a.lex.includes(id));
  }

  // One place, or several (any of them): "北京 珠海".
  const placeList = (Array.isArray(q.place) ? q.place : [q.place]).map(norm).filter(Boolean);
  if (placeList.length > 0) {
    const tests = placeList.map((place) => {
      const cc = resolveCountry(atlas, place);
      const ids = new Set(lexemesFor(lexicon, place, (c) => PLACE_LEX.has(c)));
      return (a) =>
        (cc && a.place?.cc === cc) ||
        ['country', 'province', 'city', 'district'].some((k) => norm(a.place?.[k]).includes(place)) ||
        norm(a.moment).includes(place) ||
        (ids.size > 0 && a.lex.some((id) => ids.has(id)));
    });
    list = list.filter((a) => tests.some((test) => test(a)));
  }

  const terms = (Array.isArray(q.labels) ? q.labels : typeof q.labels === 'string' ? q.labels.split(/[,，、]/) : []).map((s) => String(s).trim()).filter(Boolean);
  for (const term of terms) {
    const test = labelTest(atlas, term);
    if (test === null) {
      // A word the library does not know matches nothing (not everything).
      unmatched.push(term);
      list = [];
      continue;
    }
    if (test.words.length > 0) matched[term] = test.words;
    list = list.filter(test.match);
  }
  const people = (Array.isArray(q.people) ? q.people : typeof q.people === 'string' ? [q.people] : []).map((s) => String(s).trim()).filter(Boolean);
  for (const name of people) {
    const ids = new Set(lexemesFor(lexicon, name, (c) => c === 'person'));
    if (ids.size === 0) {
      // A word the library does not know matches nothing (not everything).
      unmatched.push(name);
      list = [];
      continue;
    }
    matched[name] = [...ids].map((id) => lexicon[id].w);
    list = list.filter((a) => a.lex.some((id) => ids.has(id)));
  }

  if (q.near && Number.isFinite(Number(q.near.lat)) && Number.isFinite(Number(q.near.lng))) {
    const r = Number(q.near.km) > 0 ? Number(q.near.km) : 5;
    const lat = Number(q.near.lat);
    const lng = Number(q.near.lng);
    list = list.filter((a) => a.lat !== null && km(lat, lng, a.lat, a.lng) <= r);
  }

  const limit = Math.max(1, Math.min(60, Number(q.limit) || 12));
  let ids;
  if (q.sort === 'newest' || q.sort === 'oldest') {
    const sorted = [...list].sort((a, b) => (q.sort === 'newest' ? b.t - a.t : a.t - b.t));
    ids = sorted.slice(0, limit).map((a) => a.id);
  } else {
    // The best few, no near-duplicates, spread over days; junk only when nothing else matches.
    const good = list.filter((a) => (a.score ?? 0) > -0.2);
    ids = pickBest(good.length >= Math.min(limit, list.length) ? good : list, limit).map((a) => a.id);
  }

  const places = new Map();
  for (const a of list) {
    if (!a.place) continue;
    const name = a.place.city || a.place.province || a.place.country;
    if (!name) continue;
    const key = `${a.place.cc}|${name}`;
    let e = places.get(key);
    if (!e) places.set(key, (e = { name, country: a.place.country, cc: a.place.cc, count: 0, lat: a.lat, lng: a.lng }));
    e.count += 1;
  }
  const years = {};
  for (const a of list) {
    const y = new Date((a.t + (a.tz ?? 0)) * 1000).getUTCFullYear();
    years[y] = (years[y] ?? 0) + 1;
  }
  const located = list.filter((a) => a.lat !== null);
  const result = {
    total: list.length,
    located: located.length,
    ids,
    first: list.reduce((m, a) => Math.min(m, a.t), Infinity),
    last: list.reduce((m, a) => Math.max(m, a.t), -Infinity),
    places: [...places.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    years,
    bbox: bboxOf(located),
    center: centerOf(located),
    labels: { matched, unmatched },
  };
  if (q.withAll === true) {
    result.all = located.map((a) => a.id);
    // Every match, with a location or not, oldest first: the list shows them all.
    result.matches = [...list].sort((a, b) => a.t - b.t).map((a) => a.id);
  }
  if (!Number.isFinite(result.first)) {
    result.first = null;
    result.last = null;
  }
  if (unmatched.length > 0) result.suggestions = suggest(atlas, unmatched);
  return result;
}

/** What an asset is called besides its labels: its place, the moment Photos put it in, its title. */
const texts = new WeakMap();
function textOf(a) {
  let s = texts.get(a);
  if (s === undefined) {
    const p = a.place ?? {};
    s = norm([p.country, p.province, p.city, p.district, a.moment, a.title].filter(Boolean).join(' | '));
    texts.set(a, s);
  }
  return s;
}

/** A test for texts containing a word: Latin words whole, anything else anywhere. */
function wordIn(t) {
  if (!/^[a-z0-9' -]+$/.test(t)) return (text) => text.includes(t);
  const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[^a-z0-9]/g, (c) => `\\${c}`)}($|[^a-z0-9])`);
  return (text) => re.test(text);
}

/**
 * How a word picks photos: what Photos recognised in them (its labels, the
 * venues around), or what they are called (place, moment, title); failing
 * both, the one-character words in it. `null` when nothing does.
 * @returns {{match: (a: object) => boolean, words: string[]} | null}
 */
export function labelTest(atlas, term) {
  const lexicon = atlas.lexicon ?? {};
  const t = norm(term);
  const ids = new Set(lexemesFor(lexicon, t, (c) => c !== 'person'));
  const assets = atlas.assets ?? [];
  const inText = wordIn(t);
  const byText = t.length >= 2 && assets.some((a) => inText(textOf(a)));
  if (ids.size > 0 || byText) {
    return {
      match: (a) => (ids.size > 0 && a.lex.some((id) => ids.has(id))) || (byText && inText(textOf(a))),
      words: [...ids].slice(0, 6).map((id) => lexicon[id].w),
    };
  }
  // "猫猫", "吃饭": the one-character words in it, when at most one character is not one.
  // "环球影城" is not a search for 球 and 城.
  const chars = [...t];
  if (chars.length < 2 || /[a-z0-9]/.test(t)) return null;
  const each = chars.map((ch) => lexemesFor(lexicon, ch, (c) => c !== 'person').filter((id) => wordsOf(lexicon[id]).map(norm).includes(ch)));
  const unknown = each.filter((list) => list.length === 0).length;
  if (unknown > 1 || unknown === chars.length) return null;
  const sets = each.filter((list) => list.length > 0).map((list) => new Set(list));
  return {
    match: (a) => sets.every((set) => a.lex.some((id) => set.has(id))),
    words: [...new Set(sets.flatMap((set) => [...set]))].slice(0, 6).map((id) => lexicon[id].w),
  };
}

/** A country code for a name or code the index knows, or ''. */
export function resolveCountry(atlas, text) {
  const t = norm(text);
  if (/^[a-z]{2}$/.test(t)) return t.toUpperCase();
  const hit = atlas.countryNames?.get(t);
  return hit ?? '';
}

/** Labels the library does have, for a word it does not: near spellings first, then the most common. */
export function suggest(atlas, terms) {
  const counts = atlas.labelCounts ?? [];
  const near = [];
  for (const term of terms) {
    const chars = [...norm(term)];
    for (const row of counts) {
      if (near.length >= 12) break;
      if (chars.some((ch) => row.word.includes(ch)) && !near.includes(row.word)) near.push(row.word);
    }
  }
  const common = counts.slice(0, 40).map((r) => r.word).filter((w) => !near.includes(w));
  return { similar: near, common };
}

// --- the search box -----------------------------------------------------------------

/** Little words between the ones that mean something: "北京的猫", "在海边拍的照片". */
const FILLER = new Set(['的', '在', '和', '跟', '与', '及', '里', '中', '时', '我', '拍', '张', '有', '去', '那', '这', '了', '是', '吗', '呢', '些', '都', '所有', '全部', '一些', '照片', '相片', '图片', '时候', '我家', '我们', '家里', '咱家', '的时候', '拍的', '我的', '那次', '一起', '里面', 'the', 'of', 'in', 'at', 'my', 'and', 'with']);
const SEASONS = [
  [/^(夏天|夏季|summer)$/i, [6, 7, 8]],
  [/^(冬天|冬季|winter)$/i, [12, 1, 2]],
  [/^(春天|春季|spring)$/i, [3, 4, 5]],
  [/^(秋天|秋季|autumn|fall)$/i, [9, 10, 11]],
];
const KEYWORDS = ['视频', '截图', '截屏', '收藏', '喜欢', '夏天', '夏季', '冬天', '冬季', '春天', '春季', '秋天', '秋季', '今年', '去年', '前年'];
/** Suffixes a place is often typed without: 北京市 → 北京, 广东省 → 广东, 朝阳区 → 朝阳. */
const PLACE_SUFFIX = /(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|自治县|省|市|区|县|府)$/;

/** The words the box understands, built once per index. */
const dictionaries = new WeakMap();
function dictionaryOf(atlas) {
  let d = dictionaries.get(atlas);
  if (d) return d;
  const words = new Map();
  let longest = 1;
  const add = (word, kind) => {
    const w = norm(word);
    if (w === '' || words.has(w)) return;
    words.set(w, kind);
    longest = Math.max(longest, w.length);
  };
  for (const k of KEYWORDS) add(k, 'keyword');
  // Places first: a city's name wins over a label of the same name.
  for (const a of atlas.located ?? atlas.assets ?? []) {
    const p = a.place;
    if (!p) continue;
    for (const k of ['country', 'province', 'city', 'district']) {
      const name = p[k];
      if (!name) continue;
      add(name, 'place');
      const short = String(name).replace(PLACE_SUFFIX, '');
      if (short.length >= 2 && short !== name) add(short, 'place');
    }
  }
  for (const name of atlas.countryNames?.keys() ?? []) if (name.length >= 2) add(name, 'place');
  for (const e of Object.values(atlas.lexicon ?? {})) {
    const kind = e.c === 'person' ? 'person' : 'label';
    for (const w of wordsOf(e)) if (w) add(w, kind);
  }
  d = { words, longest };
  dictionaries.set(atlas, d);
  return d;
}

/**
 * Split a run of text with no spaces into the words the box knows, longest
 * first: "北京的猫" → 北京, 猫; "2023年夏天" → 2023年, 夏天. Filler is dropped.
 * Text it cannot place stays together as one word, with any one-character
 * words it touches: "环球影城" is not 球 + 城, "烤鸭" not 烤 + 鸭.
 */
export function segment(atlas, text) {
  const { words, longest } = dictionaryOf(atlas);
  const isLatin = (ch) => /[a-z0-9]/i.test(ch ?? '');
  const parts = [];
  const s = String(text ?? '');
  let i = 0;
  while (i < s.length) {
    // Dates first: 2020-2022, 2023年7月, 2023-07, 2023年, 2023, 7月.
    const date = /^(\d{4}\s*[-–~到至]\s*\d{4}年?|\d{4}[-./年]\d{1,2}月?(?!\d)|\d{4}年?(?!\d)|\d{1,2}月)/.exec(s.slice(i));
    if (date && !/\d/.test(s[i - 1] ?? '')) {
      parts.push({ text: date[1], kind: 'word' });
      i += date[1].length;
      continue;
    }
    let hit = '';
    const low = s.slice(i, i + longest).toLowerCase();
    for (let n = Math.min(longest, s.length - i); n >= 1; n -= 1) {
      const w = low.slice(0, n);
      // A Latin word only as a whole word.
      if ((isLatin(w[0]) && isLatin(s[i - 1])) || (isLatin(w[n - 1]) && isLatin(s[i + n]))) continue;
      if (words.has(w) || FILLER.has(w)) {
        hit = s.slice(i, i + n);
        break;
      }
    }
    if (hit === '') {
      const last = parts[parts.length - 1];
      if (last?.kind === 'unknown') last.text += s[i];
      else parts.push({ text: s[i], kind: 'unknown' });
      i += 1;
      continue;
    }
    const kind = FILLER.has(norm(hit)) ? 'filler' : hit.length === 1 ? 'single' : 'word';
    parts.push({ text: hit, kind });
    i += hit.length;
  }
  // Runs of unknown text and one-character words.
  const out = [];
  for (let k = 0; k < parts.length; ) {
    const p = parts[k];
    if (p.kind === 'word') out.push(p.text);
    if (p.kind !== 'unknown' && p.kind !== 'single') {
      k += 1;
      continue;
    }
    let j = k;
    while (j < parts.length && (parts[j].kind === 'unknown' || parts[j].kind === 'single')) j += 1;
    const run = parts.slice(k, j);
    // Kept whole: "环球影城" is not 球 + 城, "烤鸭" not 烤 + 鸭; the search decides what a whole word matches.
    out.push(run.map((r) => r.text).join(''));
    k = j;
  }
  return out;
}

/**
 * Turn the panel's search box into a query: `2023`, `2023-07`, `2023年7月`, `7月`,
 * `今年`/`去年`, seasons, `视频`/`video`, `截图`/`screenshot`, `收藏`/`favorite`, place names (several:
 * any of them), people's names, and everything else as labels. Words may run
 * together: "北京的猫", "2023年夏天在珠海".
 */
export function parseText(atlas, text, now = new Date()) {
  const q = {};
  const labels = [];
  const people = [];
  const months = [];
  const places = [];
  const years = [];
  const raw = String(text ?? '').trim();
  // Alone, "照片" means photos rather than videos; inside a phrase it is filler.
  if (/^(照片|photos?)$/i.test(raw)) return { kind: 'photo' };
  const { words } = dictionaryOf(atlas);
  const personIds = (t) => lexemesFor(atlas.lexicon ?? {}, t, (c) => c === 'person');
  const thisYear = now.getFullYear();
  for (const t of raw.split(/[\s,，、;；。]+/).flatMap((part) => segment(atlas, part))) {
    const low = norm(t);
    let m;
    if ((m = t.match(/^(\d{4})\s*[-–~到至]\s*(\d{4})年?$/))) years.push(Number(m[1]), Number(m[2]));
    else if ((m = t.match(/^(\d{4})(?:年)?$/))) years.push(Number(m[1]));
    else if ((m = t.match(/^(\d{4})[-./年](\d{1,2})月?$/))) {
      q.from = `${m[1]}-${m[2].padStart(2, '0')}`;
      q.to = q.from;
    } else if ((m = t.match(/^(\d{1,2})月$/))) months.push(Number(m[1]));
    else if (low === '今年' || low === 'this year') years.push(thisYear);
    else if (low === '去年' || low === 'last year') years.push(thisYear - 1);
    else if (low === '前年') years.push(thisYear - 2);
    else if (/^(视频|video|videos)$/i.test(t)) q.kind = 'video';
    else if (/^(截图|截屏|屏幕快照|screenshots?)$/i.test(t)) q.kind = 'screenshot';
    else if (/^(收藏|喜欢|favorites?|♥|❤️?)$/i.test(t)) q.favorites = true;
    else if (SEASONS.some(([re]) => re.test(t))) months.push(...SEASONS.find(([re]) => re.test(t))[1]);
    else if (words.get(low) === 'place' || resolveCountry(atlas, low)) places.push(t);
    else if (words.get(low) === 'person' || (words.get(low) !== 'label' && personIds(t).length > 0)) people.push(t);
    else labels.push(t);
  }
  // Only filler ("的", "照片"…): search for what was typed rather than for everything.
  if (raw !== '' && Object.keys(q).length === 0 && !years.length && !places.length && !months.length && !labels.length && !people.length) labels.push(raw);
  if (years.length) {
    q.from = String(Math.min(...years));
    q.to = String(Math.max(...years));
  }
  if (places.length === 1) q.place = places[0];
  else if (places.length > 1) q.place = [...new Set(places)];
  if (months.length) q.months = [...new Set(months)];
  if (labels.length) q.labels = labels;
  if (people.length) q.people = people;
  return q;
}
