/**
 * Where the Photos library is, and which files in it show one photo.
 *
 * @module library
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The Photos database inside a library bundle. */
export const dbPathOf = (library) => join(library, 'database', 'Photos.sqlite');
/** The search index (labels, people, places) inside a library bundle, as macOS 27 keeps it. */
export const searchDbPathOf = (library) => join(library, 'database', 'search', 'leo.sqlite');
/** The same index as macOS 26 and earlier keep it. */
export const psiDbPathOf = (library) => join(library, 'database', 'search', 'psi.sqlite');

/** Whether `path` looks like a Photos library bundle. */
export function isLibrary(path) {
  try {
    return typeof path === 'string' && path !== '' && statSync(dbPathOf(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The path a macOS bookmark (`NSURL` bookmark data) points at, read from its
 * path-component strings. Only what Photos stores for its default library is
 * needed: a run of components ending in `.photoslibrary`.
 * @param {Buffer} data
 */
export function pathFromBookmark(data) {
  if (!Buffer.isBuffer(data) || data.length < 64 || data.toString('latin1', 0, 4) !== 'book') return '';
  // Bookmark items: 4-byte length, 4-byte type; type 0x0101 is a UTF-8 string.
  const strings = [];
  for (let at = 48; at + 8 <= data.length; ) {
    const length = data.readUInt32LE(at);
    const type = data.readUInt32LE(at + 4);
    if (type === 0x0101 && length > 0 && length < 1024 && at + 8 + length <= data.length) {
      strings.push(data.toString('utf8', at + 8, at + 8 + length));
      at += 8 + ((length + 3) & ~3);
    } else at += 4;
    const end = strings.findIndex((s) => s.endsWith('.photoslibrary'));
    if (end >= 0) {
      // The components are the run of plain names right before it.
      const parts = [];
      for (let i = end; i >= 0; i -= 1) {
        const s = strings[i];
        if (s.includes('/') || s.includes(':')) break;
        parts.unshift(s);
      }
      return `/${parts.join('/')}`;
    }
  }
  return '';
}

/** The library Photos itself opens by default, from its preferences; '' when unknown. */
export function defaultLibraryFromPrefs() {
  try {
    const xml = execFileSync('/usr/bin/defaults', ['export', 'com.apple.Photos', '-'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = xml.match(/<key>IPXDefaultLibraryURLBookmark<\/key>\s*<data>([\s\S]*?)<\/data>/);
    if (!m) return '';
    return pathFromBookmark(Buffer.from(m[1].replace(/\s+/g, ''), 'base64'));
  } catch {
    return '';
  }
}

/**
 * Libraries worth offering, best first: the configured one, Photos' default,
 * `~/Pictures`, then any at the top of a mounted volume.
 * @param {string} [configured]
 */
export function findLibraries(configured = '') {
  const seen = new Set();
  const out = [];
  const add = (p) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    if (isLibrary(p)) out.push(p);
  };
  add(configured);
  add(defaultLibraryFromPrefs());
  add(join(homedir(), 'Pictures', 'Photos Library.photoslibrary'));
  try {
    for (const name of readdirSync(join(homedir(), 'Pictures'))) if (name.endsWith('.photoslibrary')) add(join(homedir(), 'Pictures', name));
  } catch {
    // No Pictures folder.
  }
  try {
    for (const vol of readdirSync('/Volumes')) {
      let names = [];
      try {
        names = readdirSync(join('/Volumes', vol));
      } catch {
        continue;
      }
      for (const name of names) if (name.endsWith('.photoslibrary')) add(join('/Volumes', vol, name));
    }
  } catch {
    // No /Volumes (not macOS).
  }
  return out;
}

/**
 * Which files show a photo, found by listing the library's derivative
 * folders once per bucket (the first character of the UUID).
 *
 * - `thumb`: the small square-ish JPEG (~300 px) Photos makes for grids;
 * - `large`: the biggest ready-made JPEG preview;
 * - `original`: the original file, when it is on this Mac.
 */
export function createFiles(library) {
  const derivatives = join(library, 'resources', 'derivatives');
  const buckets = new Map();
  const listing = (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  };
  const bucket = (ch) => {
    let b = buckets.get(ch);
    if (b) return b;
    b = new Map();
    const note = (uuid, kind, path) => {
      let e = b.get(uuid);
      if (!e) b.set(uuid, (e = {}));
      if (!e[kind]) e[kind] = path;
    };
    for (const name of listing(join(derivatives, 'masters', ch))) {
      const uuid = name.slice(0, 36);
      if (/_4_5005_c\.jpe?g$/i.test(name)) note(uuid, 'thumb', join(derivatives, 'masters', ch, name));
      else if (/\.jpe?g$/i.test(name)) note(uuid, 'thumbAlt', join(derivatives, 'masters', ch, name));
    }
    for (const name of listing(join(derivatives, ch))) {
      const uuid = name.slice(0, 36);
      const path = join(derivatives, ch, name);
      // _1_100/_1_102 are full-size renders, _1_105 a ~1200 px preview.
      if (/_1_10[0-4]_[a-z]\.jpe?g$/i.test(name)) note(uuid, 'full', path);
      else if (/_1_10[5-9]_[a-z]\.jpe?g$/i.test(name)) note(uuid, 'medium', path);
      else if (/\.THM$/i.test(name)) note(uuid, 'thm', path);
    }
    buckets.set(ch, b);
    return b;
  };
  const entryOf = (uuid) => (typeof uuid === 'string' && /^[0-9A-F-]{36}$/i.test(uuid) ? bucket(uuid[0].toUpperCase()).get(uuid.toUpperCase()) : undefined);
  return {
    /** The small preview's path, or ''. */
    thumb(uuid) {
      const e = entryOf(uuid);
      return e?.thumb ?? e?.thumbAlt ?? e?.medium ?? e?.thm ?? e?.full ?? '';
    },
    /** The biggest ready-made JPEG, or ''. */
    large(uuid) {
      const e = entryOf(uuid);
      return e?.full ?? e?.medium ?? e?.thumb ?? e?.thumbAlt ?? e?.thm ?? '';
    },
    /** The original file, when present on disk. */
    original(directory, filename) {
      if (!directory || !filename || filename.includes('/') || directory.includes('..')) return '';
      const path = join(library, 'originals', directory, filename);
      return existsSync(path) ? path : '';
    },
    /** Forget the listings (after the library changed). */
    reset() {
      buckets.clear();
    },
  };
}
