/**
 * Read a macOS Photos library: every visible asset with its time, place,
 * score and search labels. Read-only; the database is opened in place.
 *
 * @module photos-db
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { parseRevGeo } from './bplist.mjs';
import { dbPathOf, psiDbPathOf, searchDbPathOf } from './library.mjs';
import { DOC_WORDS, qualityOf } from './quality.mjs';

/** Core Data's epoch (2001-01-01) in Unix seconds. */
export const APPLE_EPOCH = 978307200;

/**
 * Search-index categories kept per asset, by what they describe. The
 * library's own language names them (Chinese for a Chinese-language Mac).
 */
export const LABEL_CATEGORIES = {
  4000: 'scene',
  3010: 'person',
  3030: 'age',
  4060: 'action',
  4090: 'event',
  4100: 'trip',
  1030: 'holiday',
  2030: 'placeType',
  2050: 'street',
  2060: 'area',
  2080: 'poi',
  2130: 'landmark',
  2210: 'water',
  // Documents and text: used to keep receipts and screenshots out of covers.
  4080: 'doc',
  4110: 'doc',
  4130: 'doc',
};

/**
 * The same categories in the search index of macOS 26 and earlier
 * (`psi.sqlite`), where each word is a group and its synonyms are groups
 * owned by it.
 */
export const PSI_CATEGORIES = {
  1500: 'scene',
  1330: 'person',
  2600: 'action',
  1600: 'event',
  1610: 'trip',
  1103: 'holiday',
  1003: 'placeType',
  2: 'street',
  1: 'area',
  4: 'poi',
  9: 'landmark',
  14: 'water',
  2800: 'doc',
  1205: 'doc',
};
/** psi categories holding synonyms of a word in PSI_CATEGORIES. */
const PSI_SYNONYMS = [1501, 1004, 1601, 1611, 2601];

let sqliteModule;
async function loadSqlite() {
  if (sqliteModule !== undefined) return sqliteModule;
  try {
    sqliteModule = await import('node:sqlite');
  } catch {
    sqliteModule = null;
  }
  return sqliteModule;
}

/**
 * Open a SQLite file read-only as `{all(sql), close()}`: through `node:sqlite`
 * where the runtime has it, else the system `sqlite3` command.
 * @param {string} path
 */
export async function openReadOnly(path) {
  if (!existsSync(path)) throw Object.assign(new Error(`No database at ${path}`), { code: 'ENOENT' });
  const mod = await loadSqlite();
  if (mod?.DatabaseSync) {
    const db = new mod.DatabaseSync(path, { readOnly: true });
    return {
      all: (sql) => db.prepare(sql).all(),
      close: () => db.close(),
    };
  }
  const uri = `file:${encodeURI(path).replace(/\?/g, '%3F').replace(/#/g, '%23')}?mode=ro`;
  return {
    all: (sql) => {
      const out = execFileSync('/usr/bin/sqlite3', ['-json', uri, sql], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 120_000 });
      return out.trim() === '' ? [] : JSON.parse(out);
    },
    close: () => {},
  };
}

const ASSET_SQL = `
SELECT a.Z_PK AS pk, a.ZUUID AS uuid, a.ZDATECREATED AS created, a.ZLATITUDE AS lat, a.ZLONGITUDE AS lng,
       a.ZKIND AS kind, a.ZFAVORITE AS fav, a.ZWIDTH AS w, a.ZHEIGHT AS h, a.ZDURATION AS dur,
       a.ZDIRECTORY AS dir, a.ZFILENAME AS file, a.ZOVERALLAESTHETICSCORE AS aes, a.ZCURATIONSCORE AS cur,
       a.ZISDETECTEDSCREENSHOT AS shot, m.ZTITLE AS moment,
       x.ZTIMEZONEOFFSET AS tz, hex(x.ZREVERSELOCATIONDATA) AS rev, x.ZTITLE AS title
FROM ZASSET a
LEFT JOIN ZADDITIONALASSETATTRIBUTES x ON x.ZASSET = a.Z_PK
LEFT JOIN ZMOMENT m ON m.Z_PK = a.ZMOMENT
WHERE a.ZTRASHEDSTATE = 0 AND a.ZHIDDEN = 0 AND COALESCE(a.ZVISIBILITYSTATE, 0) = 0 AND a.ZDATECREATED IS NOT NULL`;

/** Whether a stored coordinate is a real one (Photos uses -180/-180 and 0/0 for none). */
export function hasLocation(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 && !(a === -180 || b === -180) && !(a === 0 && b === 0);
}

/**
 * Every visible asset of a library.
 *
 * Returns `{assets, lexicon}`: `assets` are compact records
 * `{id, t, tz, lat, lng, video, fav, w, h, dur, dir, file, score, shot, saved, place, lex}`
 * (`t` in Unix seconds, `tz` the capture offset in seconds, `place`
 * `{cc, country, province, city, district, home}` or null, `lex` the kept
 * label ids, `saved` whether another app saved it into the library); `lexicon` maps a label id to `{c, w, s}` (category name,
 * primary word, synonyms).
 * @param {string} library
 */
export async function readLibrary(library) {
  const db = await openReadOnly(dbPathOf(library));
  let rows;
  // Signals for the quality score that older libraries may not have: read on their own.
  let cameras = null;
  let keyed = new Set();
  let saved = new Set();
  try {
    rows = db.all(ASSET_SQL);
    try {
      // Saved from another app (WeChat, Xiaohongshu, a browser…): its location, if any, is where someone else was.
      saved = new Set(db.all('SELECT ZASSET AS pk FROM ZADDITIONALASSETATTRIBUTES WHERE ZIMPORTEDBY IN (3, 6)').map((r) => Number(r.pk)));
    } catch {
      saved = new Set();
    }
    try {
      cameras = new Set(db.all("SELECT ZASSET AS pk FROM ZEXTENDEDATTRIBUTES WHERE COALESCE(ZCAMERAMAKE, '') <> '' OR COALESCE(ZCAMERAMODEL, '') <> ''").map((r) => Number(r.pk)));
    } catch {
      cameras = null;
    }
    try {
      keyed = new Set(
        db
          .all('SELECT Z_PK AS pk FROM ZASSET WHERE ZDAYGROUPHIGHLIGHTBEINGKEYASSETPRIVATE IS NOT NULL OR ZHIGHLIGHTBEINGKEYASSETPRIVATE IS NOT NULL OR ZMONTHHIGHLIGHTBEINGKEYASSETPRIVATE IS NOT NULL OR ZYEARHIGHLIGHTBEINGKEYASSETPRIVATE IS NOT NULL')
          .map((r) => Number(r.pk)),
      );
    } catch {
      keyed = new Set();
    }
  } finally {
    db.close();
  }
  const assets = [];
  for (const r of rows) {
    if (typeof r.uuid !== 'string') continue;
    const located = hasLocation(r.lat, r.lng);
    let place = null;
    if (typeof r.rev === 'string' && r.rev.length > 80) place = parseRevGeo(Buffer.from(r.rev, 'hex'));
    const aes = Number.isFinite(Number(r.aes)) ? Number(r.aes) : Number.isFinite(Number(r.cur)) ? Number(r.cur) : undefined;
    assets.push({
      pk: Number(r.pk),
      aes,
      keyed: keyed.has(Number(r.pk)),
      camera: cameras === null ? undefined : cameras.has(Number(r.pk)),
      id: r.uuid,
      t: Math.round(Number(r.created) + APPLE_EPOCH),
      tz: Number.isFinite(Number(r.tz)) ? Number(r.tz) : null,
      lat: located ? Number(r.lat) : null,
      lng: located ? Number(r.lng) : null,
      video: Number(r.kind) === 1,
      fav: Number(r.fav) === 1,
      w: Number(r.w) || 0,
      h: Number(r.h) || 0,
      dur: Number(r.dur) || 0,
      dir: typeof r.dir === 'string' ? r.dir : '',
      file: typeof r.file === 'string' ? r.file : '',
      score: 0,
      shot: Number(r.shot) === 1,
      saved: saved.has(Number(r.pk)),
      moment: typeof r.moment === 'string' ? r.moment : '',
      title: typeof r.title === 'string' ? r.title : '',
      place,
      lex: [],
    });
  }
  const lexicon = {};
  try {
    const labels = await readLabels(library);
    for (const [id, entry] of labels.lexicon) lexicon[id] = entry;
    for (const a of assets) {
      const ids = labels.byAsset.get(a.id);
      if (ids) a.lex = ids;
    }
  } catch {
    // No search index (never built, or another format): no labels.
  }
  const docIds = new Set(Object.entries(lexicon).filter(([, e]) => e.c === 'doc' || DOC_WORDS.test(e.w)).map(([id]) => Number(id)));
  for (const a of assets) {
    a.score = qualityOf({ aes: a.aes, fav: a.fav, keyed: a.keyed, camera: a.camera, shot: a.shot, doc: a.lex.some((id) => docIds.has(id)), w: a.w, h: a.h, video: a.video });
    // Kept only as long as the score needs them.
    delete a.pk;
    delete a.aes;
    delete a.camera;
  }
  return { assets, lexicon };
}

/**
 * The search index's labels: `{lexicon: Map<id, {c, w, s}>, byAsset: Map<uuid, id[]>}`.
 * Reads `leo.sqlite` (macOS 27), else `psi.sqlite` (macOS 26 and earlier).
 * @param {string} library
 */
export async function readLabels(library) {
  if (!existsSync(searchDbPathOf(library)) && existsSync(psiDbPathOf(library))) return readPsiLabels(library);
  const db = await openReadOnly(searchDbPathOf(library));
  try {
    const cats = Object.keys(LABEL_CATEGORIES).join(',');
    const lexicon = new Map();
    for (const r of db.all(`SELECT lexeme_id AS id, category AS c, type AS t, content AS w FROM lexicon WHERE category IN (${cats}) AND content <> ''`)) {
      let e = lexicon.get(r.id);
      if (!e) lexicon.set(r.id, (e = { c: LABEL_CATEGORIES[r.c] ?? String(r.c), w: '', s: [] }));
      if (Number(r.t) === 1 && e.w === '') e.w = String(r.w);
      else if (!e.s.includes(r.w)) e.s.push(String(r.w));
    }
    for (const e of lexicon.values()) if (e.w === '' && e.s.length > 0) e.w = e.s.shift();
    const byAsset = new Map();
    for (const r of db.all('SELECT identifier AS id, hex(lexeme_ids) AS ids FROM items WHERE type = 1')) {
      if (typeof r.ids !== 'string' || r.ids === '') continue;
      const b = Buffer.from(r.ids, 'hex');
      const kept = [];
      for (let i = 0; i + 4 <= b.length; i += 4) {
        const id = b.readUInt32LE(i);
        if (lexicon.has(id)) kept.push(id);
      }
      if (kept.length > 0) byAsset.set(String(r.id).toUpperCase(), kept);
    }
    return { lexicon, byAsset };
  } finally {
    db.close();
  }
}

/** A psi asset's UUID: its two halves are the UUID's bytes read as little-endian 64-bit integers (here as hex). */
function psiUuid(h0, h1) {
  const le = (h) => Buffer.from(String(h).padStart(16, '0'), 'hex').reverse().toString('hex');
  const h = (le(h0) + le(h1)).toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** psi words end in a NUL byte. */
const psiWord = (w) => String(w ?? '').replace(/\0+$/, '').trim();

/** {@link readLabels} from `psi.sqlite`. */
async function readPsiLabels(library) {
  const db = await openReadOnly(psiDbPathOf(library));
  try {
    const cats = Object.keys(PSI_CATEGORIES).join(',');
    const lexicon = new Map();
    for (const r of db.all(`SELECT rowid AS id, category AS c, content_string AS w FROM groups WHERE category IN (${cats}) AND content_string <> ''`)) {
      const w = psiWord(r.w);
      if (w !== '') lexicon.set(Number(r.id), { c: PSI_CATEGORIES[r.c], w, s: [] });
    }
    for (const r of db.all(`SELECT owning_groupid AS id, content_string AS w FROM groups WHERE category IN (${PSI_SYNONYMS.join(',')}) AND content_string <> ''`)) {
      const e = lexicon.get(Number(r.id));
      const w = psiWord(r.w);
      if (e && w !== '' && w !== e.w && !e.s.includes(w)) e.s.push(w);
    }
    const byAsset = new Map();
    const sql = `SELECT printf('%016X', a.uuid_0) AS u0, printf('%016X', a.uuid_1) AS u1, group_concat(ga.groupid) AS ids
      FROM ga JOIN assets a ON a.rowid = ga.assetid JOIN groups g ON g.rowid = ga.groupid
      WHERE g.category IN (${cats}) AND g.content_string <> '' GROUP BY ga.assetid`;
    for (const r of db.all(sql)) {
      const kept = String(r.ids ?? '').split(',').map(Number).filter((id) => lexicon.has(id));
      if (kept.length > 0) byAsset.set(psiUuid(r.u0, r.u1), kept);
    }
    return { lexicon, byAsset };
  } finally {
    db.close();
  }
}
