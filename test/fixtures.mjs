// Test fixtures: a tiny binary-plist writer (for reverse-geocode blobs) and a
// synthetic Photos library on disk. Every place and photo here is made up.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class Uid {
  constructor(value) {
    this.value = value;
  }
}

/** Encode plain values (string, int, bool, null, array, object, Uid) as `bplist00`. */
export function writeBplist(root) {
  const objects = [];
  const index = new Map();
  const add = (v) => {
    const key = typeof v === 'object' && v !== null && !(v instanceof Uid) ? null : `${typeof v}:${v instanceof Uid ? `uid${v.value}` : v}`;
    if (key && index.has(key)) return index.get(key);
    const i = objects.length;
    objects.push(null);
    if (key) index.set(key, i);
    if (Array.isArray(v)) objects[i] = { kind: 'array', refs: v.map(add) };
    else if (v && typeof v === 'object' && !(v instanceof Uid)) {
      const keys = Object.keys(v);
      objects[i] = { kind: 'dict', keys: keys.map(add), vals: keys.map((k) => add(v[k])) };
    } else objects[i] = { kind: 'scalar', v };
    return i;
  };
  const top = add(root);
  const refSize = objects.length > 255 ? 2 : 1;
  const ref = (n) => (refSize === 1 ? Buffer.from([n]) : Buffer.from([n >> 8, n & 255]));
  const len = (marker, n) => (n < 15 ? Buffer.from([marker | n]) : Buffer.concat([Buffer.from([marker | 15, 0x11]), Buffer.from([n >> 8, n & 255])]));
  const chunks = [Buffer.from('bplist00', 'latin1')];
  let offset = 8;
  const offsets = [];
  for (const o of objects) {
    let b;
    if (o.kind === 'array') b = Buffer.concat([len(0xa0, o.refs.length), ...o.refs.map(ref)]);
    else if (o.kind === 'dict') b = Buffer.concat([len(0xd0, o.keys.length), ...o.keys.map(ref), ...o.vals.map(ref)]);
    else {
      const v = o.v;
      if (v === null) b = Buffer.from([0x00]);
      else if (v === false) b = Buffer.from([0x08]);
      else if (v === true) b = Buffer.from([0x09]);
      else if (v instanceof Uid) b = Buffer.from([0x80, v.value]);
      else if (typeof v === 'number' && Number.isInteger(v)) {
        const x = Buffer.alloc(8);
        x.writeBigInt64BE(BigInt(v));
        b = Buffer.concat([Buffer.from([0x13]), x]);
      } else if (typeof v === 'number') {
        const x = Buffer.alloc(8);
        x.writeDoubleBE(v);
        b = Buffer.concat([Buffer.from([0x23]), x]);
      } else if (/^[\x00-\x7f]*$/.test(String(v))) b = Buffer.concat([len(0x50, String(v).length), Buffer.from(String(v), 'latin1')]);
      else {
        const u = Buffer.from(String(v), 'utf16le');
        u.swap16();
        b = Buffer.concat([len(0x60, u.length / 2), u]);
      }
    }
    offsets.push(offset);
    chunks.push(b);
    offset += b.length;
  }
  const offsetSize = offset > 65535 ? 4 : 2;
  const table = Buffer.concat(offsets.map((o) => {
    const x = Buffer.alloc(offsetSize);
    if (offsetSize === 2) x.writeUInt16BE(o);
    else x.writeUInt32BE(o);
    return x;
  }));
  chunks.push(table);
  const trailer = Buffer.alloc(32);
  trailer[6] = offsetSize;
  trailer[7] = refSize;
  trailer.writeBigUInt64BE(BigInt(objects.length), 8);
  trailer.writeBigUInt64BE(BigInt(top), 16);
  trailer.writeBigUInt64BE(BigInt(offset), 24);
  chunks.push(trailer);
  return Buffer.concat(chunks);
}

/**
 * A reverse-geocode blob in the shape Photos stores (NSKeyedArchiver of
 * PLRevGeoLocationInfo), naming `{cc, country, province, city, district}`.
 */
export function revGeoBlob({ cc, country, province, city, district, home = false }) {
  const objects = ['$null'];
  const push = (v) => (objects.push(v), objects.length - 1);
  const placeClass = push({ $classes: ['PLRevGeoMapItemAdditionalPlaceInfo', 'NSObject'], $classname: 'PLRevGeoMapItemAdditionalPlaceInfo' });
  const arrayClass = push({ $classes: ['NSMutableArray', 'NSArray', 'NSObject'], $classname: 'NSMutableArray' });
  const place = (name, type) => {
    const n = push(name);
    return push({ $class: new Uid(placeClass), area: 0, dominantOrderType: 0, name: new Uid(n), placeType: type });
  };
  const places = [];
  if (district) places.push(place(district, 6));
  if (city) places.push(place(city, 4));
  if (province) places.push(place(province, 2));
  if (country) places.push(place(country, 1));
  const sorted = push({ $class: new Uid(arrayClass), 'NS.objects': places.map((i) => new Uid(i)) });
  const mapItemClass = push({ $classes: ['PLRevGeoMapItem', 'NSObject'], $classname: 'PLRevGeoMapItem' });
  const mapItem = push({ $class: new Uid(mapItemClass), sortedPlaceInfos: new Uid(sorted) });
  const ccIdx = push(cc);
  const infoClass = push({ $classes: ['PLRevGeoLocationInfo', 'NSObject'], $classname: 'PLRevGeoLocationInfo' });
  const root = push({ $class: new Uid(infoClass), countryCode: new Uid(ccIdx), isHome: home, mapItem: new Uid(mapItem), version: 13 });
  return writeBplist({ $archiver: 'NSKeyedArchiver', $objects: objects, $top: { root: new Uid(root) }, $version: 100000 });
}

const APPLE_EPOCH = 978307200;
export const uuid = (n) => `${String(n).padStart(8, '0').toUpperCase()}-0000-4000-8000-000000000000`.replace(/^(.)/, (c) => 'ABCDEF0123456789'[Number(n) % 16] ?? c).slice(0, 36);

/**
 * Build a library bundle in a temp dir from rows
 * `{id, t, tz, lat, lng, video, place, labels: [lexemeId], score, hidden, trashed}`
 * and a lexicon `{id: {c: category number, w, s: []}}`.
 * Its search index is `leo.sqlite` (macOS 27), or with `{index: 'psi'}` the
 * `psi.sqlite` of macOS 26 and earlier. Returns the bundle path. Needs `node:sqlite`.
 */
export async function makeLibrary(rows, lexicon = {}, { index = 'leo' } = {}) {
  const { DatabaseSync } = await import('node:sqlite');
  const root = mkdtempSync(join(tmpdir(), 'atlas-lib-'));
  const lib = join(root, 'Test.photoslibrary');
  mkdirSync(join(lib, 'database', 'search'), { recursive: true });
  const db = new DatabaseSync(join(lib, 'database', 'Photos.sqlite'));
  db.exec(`CREATE TABLE ZASSET (Z_PK INTEGER PRIMARY KEY, ZUUID TEXT, ZDATECREATED REAL, ZLATITUDE REAL, ZLONGITUDE REAL, ZKIND INTEGER, ZFAVORITE INTEGER,
    ZWIDTH INTEGER, ZHEIGHT INTEGER, ZDURATION REAL, ZDIRECTORY TEXT, ZFILENAME TEXT, ZOVERALLAESTHETICSCORE REAL, ZCURATIONSCORE REAL,
    ZISDETECTEDSCREENSHOT INTEGER, ZMOMENT INTEGER, ZTRASHEDSTATE INTEGER, ZHIDDEN INTEGER, ZVISIBILITYSTATE INTEGER);
    CREATE TABLE ZADDITIONALASSETATTRIBUTES (Z_PK INTEGER PRIMARY KEY, ZASSET INTEGER, ZTIMEZONEOFFSET INTEGER, ZREVERSELOCATIONDATA BLOB, ZTITLE TEXT);
    CREATE TABLE ZMOMENT (Z_PK INTEGER PRIMARY KEY, ZTITLE TEXT);`);
  const insA = db.prepare('INSERT INTO ZASSET VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insX = db.prepare('INSERT INTO ZADDITIONALASSETATTRIBUTES VALUES (?,?,?,?,?)');
  rows.forEach((r, i) => {
    const pk = i + 1;
    insA.run(pk, r.id, r.t - APPLE_EPOCH, r.lat ?? -180, r.lng ?? -180, r.video ? 1 : 0, r.fav ? 1 : 0, 4032, 3024, r.video ? 12 : 0, r.id[0], `${r.id}.${r.video ? 'mov' : 'jpeg'}`, r.score ?? 0.5, 0.5, 0, null, r.trashed ? 1 : 0, r.hidden ? 1 : 0, 0);
    insX.run(pk, pk, r.tz ?? 28800, r.place ? revGeoBlob(r.place) : null, null);
  });
  db.close();
  if (index === 'psi') writePsi(lib, DatabaseSync, rows, lexicon);
  else {
    const leo = new DatabaseSync(join(lib, 'database', 'search', 'leo.sqlite'));
    leo.exec(`CREATE TABLE lexicon (pk INTEGER PRIMARY KEY AUTOINCREMENT, lexeme_id INTEGER, type INTEGER, category INTEGER, content TEXT, identifier TEXT, score REAL);
      CREATE TABLE items (pk INTEGER PRIMARY KEY AUTOINCREMENT, identifier TEXT UNIQUE, type INTEGER, lexeme_ids BLOB, date_created TIMESTAMP, change_timestamp TIMESTAMP, lexeme_scores BLOB, thumbnail_info BLOB);`);
    const insL = leo.prepare('INSERT INTO lexicon (lexeme_id, type, category, content) VALUES (?,?,?,?)');
    for (const [id, e] of Object.entries(lexicon)) {
      insL.run(Number(id), 1, e.c, e.w);
      for (const syn of e.s ?? []) insL.run(Number(id), 2, e.c, syn);
    }
    const insI = leo.prepare('INSERT INTO items (identifier, type, lexeme_ids) VALUES (?,?,?)');
    for (const r of rows) {
      if (!r.labels?.length) continue;
      const b = Buffer.alloc(r.labels.length * 4);
      r.labels.forEach((id, i) => b.writeUInt32LE(id, i * 4));
      insI.run(r.id, 1, b);
    }
    leo.close();
  }
  // A thumbnail and a preview per photo.
  for (const r of rows) {
    const ch = r.id[0];
    mkdirSync(join(lib, 'resources', 'derivatives', 'masters', ch), { recursive: true });
    mkdirSync(join(lib, 'resources', 'derivatives', ch), { recursive: true });
    writeFileSync(join(lib, 'resources', 'derivatives', 'masters', ch, `${r.id}_4_5005_c.jpeg`), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    writeFileSync(join(lib, 'resources', 'derivatives', ch, `${r.id}_1_105_c.jpeg`), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]));
  }
  return lib;
}

/** leo categories as psi numbers them (see PSI_CATEGORIES); synonyms go one higher where psi has them. */
const PSI_OF = { 4000: 1500, 3010: 1330 };
const PSI_SYNONYM = { 1500: 1501 };

/** A psi.sqlite as macOS 26 writes it: words are groups, synonyms groups owned by them, UUIDs two little-endian integers. */
function writePsi(lib, DatabaseSync, rows, lexicon) {
  const psi = new DatabaseSync(join(lib, 'database', 'search', 'psi.sqlite'));
  psi.exec(`CREATE TABLE groups(category INT2, owning_groupid INT, content_string TEXT, normalized_string TEXT, lookup_identifier TEXT, score REAL, token_ranges_0 INT8, token_ranges_1 INT8);
    CREATE TABLE assets(uuid_0 INT, uuid_1 INT, creationDate INT, UNIQUE(uuid_0, uuid_1));
    CREATE TABLE ga(groupid INT, assetid INT, PRIMARY KEY(groupid, assetid));`);
  const insG = psi.prepare('INSERT INTO groups (rowid, category, owning_groupid, content_string, normalized_string) VALUES (?,?,?,?,?)');
  // Words end in a NUL, as Photos writes them. Synonym rows get ids past the words'.
  let next = 1000;
  for (const [id, e] of Object.entries(lexicon)) {
    const cat = PSI_OF[e.c] ?? e.c;
    insG.run(Number(id), cat, 0, `${e.w}\0`, e.w.toLowerCase());
    for (const syn of e.s ?? []) insG.run(next++, PSI_SYNONYM[cat] ?? cat, Number(id), `${syn}\0`, syn.toLowerCase());
  }
  const insA = psi.prepare('INSERT INTO assets (rowid, uuid_0, uuid_1) VALUES (?,?,?)');
  const insGA = psi.prepare('INSERT INTO ga (groupid, assetid) VALUES (?,?)');
  rows.forEach((r, i) => {
    if (!r.labels?.length) return;
    const b = Buffer.from(r.id.replace(/-/g, ''), 'hex');
    insA.run(i + 1, b.readBigInt64LE(0), b.readBigInt64LE(8));
    for (const id of r.labels) insGA.run(id, i + 1);
  });
  psi.close();
}

/** Unix seconds of a local date-time at offset `tz` seconds. */
export const at = (iso, tz = 28800) => Math.floor(Date.parse(`${iso}Z`) / 1000) - tz;

const HOME = { cc: 'XA', country: '甲国', province: '', city: '甲城', district: '东区' };
const AWAY = { cc: 'XB', country: '乙国', province: '乙省', city: '乙城', district: '' };
const AWAY2 = { cc: 'XB', country: '乙国', province: '乙省', city: '丙城', district: '' };

/**
 * A small made-up life: 40 days of photos at home (around 10°N 100°E), a
 * three-stop trip abroad, and labels for search.
 */
export function sampleRows() {
  const rows = [];
  let n = 1;
  const id = () => {
    const hex = (n++).toString(16).toUpperCase().padStart(8, '0');
    return `${hex}-1111-4222-8333-444455556666`;
  };
  for (let d = 1; d <= 40; d += 1) {
    const day = `2024-0${d <= 30 ? 3 : 4}-${String(d <= 30 ? d : d - 30).padStart(2, '0')}`;
    rows.push({ id: id(), t: at(`${day}T10:00:00`), lat: 10 + (d % 5) * 0.01, lng: 100 + (d % 3) * 0.01, place: HOME, labels: d % 4 === 0 ? [1] : [2], score: 0.3 + (d % 7) / 20 });
  }
  // The trip: 乙城 two days, 丙城 one day, back home.
  for (const [day, lat, lng, place] of [
    ['2024-04-12', 20.0, 110.0, AWAY],
    ['2024-04-12', 20.01, 110.01, AWAY],
    ['2024-04-13', 20.02, 110.0, AWAY],
    ['2024-04-14', 21.0, 111.5, AWAY2],
    ['2024-04-14', 21.01, 111.5, AWAY2],
  ]) rows.push({ id: id(), t: at(`${day}T12:00:00`), lat, lng, place, labels: [1, 3], score: 0.9 });
  rows.push({ id: id(), t: at('2024-04-15T20:00:00'), lat: 10, lng: 100, place: HOME, labels: [2] });
  // Same date in an earlier year, for "on this day".
  rows.push({ id: id(), t: at('2023-04-12T09:00:00'), lat: 10.02, lng: 100.01, place: HOME, labels: [1] });
  // No location; hidden; trashed.
  rows.push({ id: id(), t: at('2024-03-05T08:00:00'), labels: [2] });
  rows.push({ id: id(), t: at('2024-03-06T08:00:00'), lat: 10, lng: 100, place: HOME, hidden: true });
  rows.push({ id: id(), t: at('2024-03-07T08:00:00'), lat: 10, lng: 100, place: HOME, trashed: true });
  return rows;
}

export const sampleLexicon = {
  1: { c: 4000, w: '猫', s: ['猫咪'] },
  2: { c: 4000, w: '天空', s: [] },
  3: { c: 4000, w: '海滩', s: ['沙滩'] },
  9: { c: 3010, w: '小黑', s: [] },
};
