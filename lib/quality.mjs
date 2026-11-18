/**
 * Which photos are worth showing: a score per photo, and a picker that takes
 * the best few without near-duplicates.
 *
 * Photos' own aesthetic score picks good photos well on its own (checked on
 * a real library against blends with its other scores, which picked worse);
 * what it misses is junk, so the score here is that plus what the owner
 * said (favourites, the photos Photos made key photos of a day) minus what
 * is not a photograph of a moment (screenshots, documents, saved images,
 * tiny files).
 *
 * @module quality
 */

import { km } from './geo.mjs';

/** Label words that mean "a document, not a moment". */
export const DOC_WORDS = /^(收据|插图|手写|文稿|找到的文本|条形码|条码|身份证件|身份证|驾照|驾驶证|护照|永久账号|文档|文件|截屏|屏幕截图|receipt|document|handwriting|text|barcode|passport|screenshot)$/i;

/**
 * The quality score of one photo from its raw signals.
 * @param {{aes?: number, fav?: boolean, keyed?: boolean, camera?: boolean, shot?: boolean, doc?: boolean, w?: number, h?: number, video?: boolean}} s
 */
export function qualityOf(s) {
  let q = Number.isFinite(s.aes) ? s.aes : 0.3;
  if (s.fav) q += 0.15;
  if (s.keyed) q += 0.08;
  if (s.shot) q -= 1;
  if (s.doc) q -= 0.4;
  // Saved and downloaded images: no camera recorded them.
  if (s.camera === false) q -= 0.35;
  const short = Math.min(s.w || 0, s.h || 0);
  if (short > 0 && short < 700) q -= 0.2;
  if (s.video) q -= 0.05;
  return Math.round(q * 1000) / 1000;
}

/**
 * The best `n` of `list` (assets with `score`, `t`, `lat`, `lng`), skipping
 * near-duplicates (within `burstSec` and `burstM` of one already taken) and
 * spreading over scenes and days: one per scene (`sceneSec` apart) first,
 * then picks go in rounds, each day giving its best photo
 * before any day gives a second; early rounds skip photos far worse than the
 * best (`floor` below it), so a dull day does not push out a great one.
 * Best first.
 */
export function pickBest(list, n, { burstSec = 90, burstM = 150, sceneSec = 1800, floor = 0.3 } = {}) {
  const sorted = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (sorted.length === 0 || n <= 0) return [];
  const top = sorted[0].score ?? 0;
  const taken = [];
  const perDay = new Map();
  const dayOf = (a) => Math.floor((a.t + (a.tz ?? 0)) / 86400);
  const near = (a, b, gap) => Math.abs(a.t - b.t) <= gap && (a.lat === null || b.lat === null || a.lat === undefined || gap > burstSec || km(a.lat, a.lng, b.lat, b.lng) * 1000 <= burstM);
  const round = (limit, minScore, gap = burstSec) => {
    for (const a of sorted) {
      if (taken.length >= n) return;
      if ((a.score ?? 0) < minScore) break;
      if (taken.includes(a)) continue;
      const d = dayOf(a);
      if ((perDay.get(d) ?? 0) >= limit) continue;
      if (taken.some((b) => near(a, b, gap))) continue;
      taken.push(a);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
  };
  // First one per scene (photos half an hour apart), then bursts aside, one per day at a time.
  for (const gap of [sceneSec, burstSec]) for (let limit = 1; limit <= 3 && taken.length < n; limit += 1) round(limit, top - floor, gap);
  // Few days or few good photos: the best of the rest, still one per scene first.
  if (taken.length < n) round(Infinity, -Infinity, sceneSec);
  if (taken.length < n) round(Infinity, -Infinity);
  return taken.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
