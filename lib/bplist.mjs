/**
 * A small reader for Apple binary property lists (`bplist00`) and the
 * NSKeyedArchiver graphs Photos stores in them. Read-only, no dependencies.
 *
 * @module bplist
 */

/** A keyed-archiver object reference. */
export class UID {
  constructor(value) {
    this.value = value;
  }
}

/**
 * Parse a `bplist00` buffer into plain values: numbers, strings, booleans,
 * null, Buffers (data), Dates, arrays, objects and `UID`s.
 * @param {Uint8Array} input
 */
export function parseBplist(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 40 || buf.toString('latin1', 0, 8) !== 'bplist00') throw new Error('not a binary plist');
  const trailer = buf.length - 32;
  const offsetSize = buf[trailer + 6];
  const refSize = buf[trailer + 7];
  const numObjects = readUInt(buf, trailer + 8, 8);
  const topObject = readUInt(buf, trailer + 16, 8);
  const tableOffset = readUInt(buf, trailer + 24, 8);
  if (numObjects > 1_000_000 || tableOffset >= buf.length) throw new Error('bad plist trailer');

  const offsets = new Array(numObjects);
  for (let i = 0; i < numObjects; i += 1) offsets[i] = readUInt(buf, tableOffset + i * offsetSize, offsetSize);

  const cache = new Map();
  const parsing = new Set();

  const lengthAt = (pos, info) => {
    if (info !== 0x0f) return { length: info, start: pos + 1 };
    const marker = buf[pos + 1];
    const bytes = 1 << (marker & 0x0f);
    return { length: readUInt(buf, pos + 2, bytes), start: pos + 2 + bytes };
  };

  const parse = (index) => {
    if (cache.has(index)) return cache.get(index);
    if (parsing.has(index)) throw new Error('cyclic plist');
    parsing.add(index);
    const pos = offsets[index];
    const marker = buf[pos];
    const type = marker >> 4;
    const info = marker & 0x0f;
    let value;
    switch (type) {
      case 0x0:
        value = info === 0x8 ? false : info === 0x9 ? true : null;
        break;
      case 0x1: {
        const bytes = 1 << info;
        value = bytes === 8 ? Number(buf.readBigInt64BE(pos + 1)) : readUInt(buf, pos + 1, bytes);
        break;
      }
      case 0x2:
        value = info === 2 ? buf.readFloatBE(pos + 1) : buf.readDoubleBE(pos + 1);
        break;
      case 0x3:
        // Seconds since 2001-01-01.
        value = new Date((buf.readDoubleBE(pos + 1) + 978307200) * 1000);
        break;
      case 0x4: {
        const { length, start } = lengthAt(pos, info);
        value = Buffer.from(buf.subarray(start, start + length));
        break;
      }
      case 0x5: {
        const { length, start } = lengthAt(pos, info);
        value = buf.toString('latin1', start, start + length);
        break;
      }
      case 0x6: {
        const { length, start } = lengthAt(pos, info);
        const chars = Buffer.from(buf.subarray(start, start + length * 2));
        chars.swap16();
        value = chars.toString('utf16le');
        break;
      }
      case 0x8:
        value = new UID(readUInt(buf, pos + 1, info + 1));
        break;
      case 0xa:
      case 0xc: {
        const { length, start } = lengthAt(pos, info);
        value = [];
        cache.set(index, value);
        for (let i = 0; i < length; i += 1) value.push(parse(readUInt(buf, start + i * refSize, refSize)));
        break;
      }
      case 0xd: {
        const { length, start } = lengthAt(pos, info);
        value = {};
        cache.set(index, value);
        for (let i = 0; i < length; i += 1) {
          const key = parse(readUInt(buf, start + i * refSize, refSize));
          value[String(key)] = parse(readUInt(buf, start + (length + i) * refSize, refSize));
        }
        break;
      }
      default:
        throw new Error(`unsupported plist object 0x${type.toString(16)}`);
    }
    parsing.delete(index);
    cache.set(index, value);
    return value;
  };

  return parse(topObject);
}

function readUInt(buf, pos, bytes) {
  let n = 0;
  for (let i = 0; i < bytes; i += 1) n = n * 256 + buf[pos + i];
  return n;
}

/**
 * Resolve an NSKeyedArchiver graph into plain values: `NS.objects` arrays,
 * `NS.keys`/`NS.objects` dictionaries, strings, and other objects as their
 * own keys (with `$class` replaced by the class name in `$classname`).
 * @param {object} archive - the parsed top-level plist.
 */
export function unarchive(archive) {
  const objects = archive?.$objects;
  if (!Array.isArray(objects)) throw new Error('not a keyed archive');
  const top = archive.$top?.root ?? Object.values(archive.$top ?? {})[0];
  const memo = new Map();
  const resolve = (value, depth) => {
    if (depth > 64) return null;
    if (value instanceof UID) {
      if (memo.has(value.value)) return memo.get(value.value);
      const raw = objects[value.value];
      if (raw === '$null') return null;
      const out = decode(raw, depth + 1, value.value);
      return out;
    }
    return value;
  };
  const decode = (raw, depth, index) => {
    if (raw === null || typeof raw !== 'object' || Buffer.isBuffer(raw) || raw instanceof Date) return raw;
    if (Array.isArray(raw)) return raw.map((v) => resolve(v, depth));
    const cls = raw.$class instanceof UID ? objects[raw.$class.value] : null;
    const name = cls?.$classname ?? '';
    if (Array.isArray(raw['NS.keys']) && Array.isArray(raw['NS.objects'])) {
      const out = {};
      if (index !== undefined) memo.set(index, out);
      raw['NS.keys'].forEach((k, i) => {
        out[String(resolve(k, depth))] = resolve(raw['NS.objects'][i], depth);
      });
      return out;
    }
    if (Array.isArray(raw['NS.objects'])) {
      const out = [];
      if (index !== undefined) memo.set(index, out);
      for (const v of raw['NS.objects']) out.push(resolve(v, depth));
      return out;
    }
    if (typeof raw['NS.string'] === 'string') return raw['NS.string'];
    const out = name ? { $classname: name } : {};
    if (index !== undefined) memo.set(index, out);
    for (const [k, v] of Object.entries(raw)) {
      if (k === '$class') continue;
      out[k] = resolve(v, depth);
    }
    return out;
  };
  return resolve(top, 0);
}

/** Place types in Photos' reverse-geocode records. */
export const PLACE_TYPES = { country: 1, province: 2, county: 3, city: 4, district: 6, area: 7, address: 17 };

/**
 * The place a `ZREVERSELOCATIONDATA` blob names, as
 * `{cc, country, province, city, district, home}` (strings '' when absent), or null
 * when the blob cannot be read.
 * @param {Uint8Array | null | undefined} blob
 */
export function parseRevGeo(blob) {
  if (!blob || blob.length < 40) return null;
  let info;
  try {
    info = unarchive(parseBplist(blob));
  } catch {
    return null;
  }
  if (!info || typeof info !== 'object') return null;
  const places = info.mapItem?.sortedPlaceInfos ?? info.mapItem?.finalPlaceInfos ?? [];
  const byType = new Map();
  for (const p of Array.isArray(places) ? places : []) {
    if (!p || typeof p.name !== 'string' || p.name === '') continue;
    const t = Number(p.placeType);
    // The first (most specific) of each type is the one to keep.
    if (!byType.has(t)) byType.set(t, p.name);
  }
  const postal = info.postalAddress && typeof info.postalAddress === 'object' ? info.postalAddress : {};
  const pick = (...vals) => vals.find((v) => typeof v === 'string' && v.trim() !== '')?.trim() ?? '';
  return {
    cc: pick(typeof info.countryCode === 'string' ? info.countryCode.toUpperCase() : '', postal._ISOCountryCode, postal.ISOCountryCode),
    country: pick(byType.get(PLACE_TYPES.country), postal._country, postal.country),
    province: pick(byType.get(PLACE_TYPES.province), postal._state, postal.state),
    city: pick(byType.get(PLACE_TYPES.city), postal._city, postal.city, byType.get(PLACE_TYPES.county), postal._subAdministrativeArea),
    district: pick(postal._subLocality, postal.subLocality, byType.get(PLACE_TYPES.district), byType.get(PLACE_TYPES.area)),
    // Photos' own guess that this is where the owner lives.
    home: info.isHome === true,
  };
}
