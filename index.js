/**
 * Host half of the Atlas bundle.
 *
 * Reads the macOS Photos library (read-only), builds an index of where and
 * when every photo was taken, and serves it to the Client half's map panel
 * through loopback routes: points, trips, stats, "on this day", thumbnails.
 * Registers tools the conversation model can use to search the photos and
 * move the map.
 *
 * @module @kadaliao/dsh-atlas
 */

import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAtlas } from './lib/atlas.mjs';
import { nearbyArticles, placesOf } from './lib/places.mjs';
import { pickBest } from './lib/quality.mjs';
import { parseText, search } from './lib/search.mjs';
import { flagOf, yearOf } from './lib/stats.mjs';
import { fetchEvents, memoriesOn, rankEvents } from './lib/today.mjs';
import { isoDay } from './lib/trips.mjs';

// The registry wants the compiled definition `defineTool` makes. Outside a
// Harness (the tests) the raw definition stands in for it.
let defineTool = (definition) => definition;
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
} catch {
  // No Harness around: tests run on the raw definition.
}

export const inject = ['tools'];

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();

export const ROUTE = '/__dsh_atlas';
export const TOOLS = ['atlas_search', 'atlas_show', 'atlas_trips', 'atlas_stats', 'atlas_today', 'atlas_look'];
/** Files the page may load from `vendor/`. */
const VENDOR = {
  'maplibre-gl.js': 'text/javascript; charset=utf-8',
  'maplibre-gl.css': 'text/css; charset=utf-8',
  'supercluster.min.js': 'text/javascript; charset=utf-8',
  'countries.json': 'application/json; charset=utf-8',
};
const SETTINGS_FIELDS = ['library', 'home', 'history', 'basemap', 'awayKm', 'nearby'];
/** Basemaps the panel offers; `auto` is the old name of `night`. */
export const BASEMAPS = ['night', 'amap', 'satellite', 'offline'];
const basemapOf = (v, fallback = 'night') => (v === 'auto' ? 'night' : BASEMAPS.includes(v) ? v : fallback);

/** The DSH home the cache lives under. */
function homeDir() {
  return process.env.DSH_HOME && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh');
}

/**
 * Normalize the Loader row's config.
 * @param {unknown} config
 */
export function settingsOf(config) {
  const c = config && typeof config === 'object' ? config : {};
  const away = Number(c.awayKm);
  return {
    enabled: c.enabled !== false,
    library: typeof c.library === 'string' ? c.library.trim() : '',
    history: c.history !== false,
    basemap: basemapOf(c.basemap),
    nearby: c.nearby !== false,
    awayKm: Number.isFinite(away) && away >= 10 ? away : 100,
    home: validHome(c.home),
  };
}

function validHome(h) {
  if (!h || typeof h !== 'object') return null;
  const lat = Number(h.lat);
  const lng = Number(h.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, city: typeof h.city === 'string' ? h.city : '' };
}

/** The row's settings with what the panel saved on top. */
export function mergeSettings(base, saved) {
  const out = { ...base };
  const s = saved && typeof saved === 'object' ? saved : {};
  if (typeof s.library === 'string') out.library = s.library.trim();
  if (typeof s.history === 'boolean') out.history = s.history;
  if (typeof s.basemap === 'string' && (BASEMAPS.includes(s.basemap) || s.basemap === 'auto')) out.basemap = basemapOf(s.basemap);
  if (typeof s.nearby === 'boolean') out.nearby = s.nearby;
  if (Number.isFinite(Number(s.awayKm)) && Number(s.awayKm) >= 10) out.awayKm = Number(s.awayKm);
  if ('home' in s) out.home = validHome(s.home);
  return out;
}

// --- what the page and the model see of one photo ---------------------------------

const placeName = (p) => (p ? [p.city || p.province, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') : '');
const localIso = (a) => new Date((a.t + (a.tz ?? 0)) * 1000).toISOString().slice(0, 16).replace('T', ' ');

/** One photo for the page. */
export function photoView(data, a, { labels = true } = {}) {
  const lex = labels
    ? a.lex
        .map((id) => data.lexicon[id])
        .filter((e) => e && (e.c === 'scene' || e.c === 'person' || e.c === 'landmark' || e.c === 'poi' || e.c === 'action' || e.c === 'event'))
        .map((e) => ({ c: e.c, w: e.w }))
    : [];
  return {
    id: a.id,
    t: a.t,
    tz: a.tz,
    local: localIso(a),
    lat: a.lat,
    lng: a.lng,
    video: a.video,
    fav: a.fav,
    w: a.w,
    h: a.h,
    dur: a.dur,
    place: a.place,
    moment: a.moment,
    title: a.title,
    labels: lex,
  };
}

/** One line per photo for the model. */
function photoLine(data, a) {
  const words = a.lex
    .map((id) => data.lexicon[id])
    .filter((e) => e && (e.c === 'scene' || e.c === 'person' || e.c === 'landmark'))
    .slice(0, 8)
    .map((e) => e.w);
  return `${a.id} · ${localIso(a)} · ${placeName(a.place) || 'no location'}${a.video ? ' · video' : ''}${words.length ? ` · ${words.join('/')}` : ''}`;
}

const fmtDate = (t) => (t === null || !Number.isFinite(t) ? '?' : new Date(t * 1000).toISOString().slice(0, 10));

// --- tools --------------------------------------------------------------------------

/** The result text the model reads for each tool. */
export function renderText(name, value) {
  if (value?.ok === false) return value.reason ?? 'The photo library is not available.';
  switch (name) {
    case 'atlas_search': {
      const r = value.result;
      if (r.total === 0) {
        const hint = r.suggestions ? `\nThe library has no label like ${r.labels.unmatched.map((t) => `"${t}"`).join(', ')}. Labels it does have that look close: ${r.suggestions.similar.join(', ') || '(none)'}; most common: ${r.suggestions.common.slice(0, 25).join(', ')}.` : '';
        return `No photos match.${hint}`;
      }
      const years = Object.entries(r.years)
        .sort((a, b) => a[0] - b[0])
        .map(([y, n]) => `${y}: ${n}`)
        .join(', ');
      const places = r.places.map((p) => `${p.name}${p.country && p.country !== p.name ? ` (${p.country})` : ''} ${p.count}`).join('; ');
      const lines = [
        `${r.total} match${r.total > 1 ? 'es' : ''} (${r.located} with a location), ${fmtDate(r.first)} to ${fmtDate(r.last)}.`,
        places ? `Places: ${places}.` : '',
        `By year: ${years}.`,
        Object.keys(r.labels.matched).length ? `Labels matched: ${Object.entries(r.labels.matched).map(([k, v]) => `${k} → ${v.join('/')}`).join('; ')}.` : '',
        `Representative photos (best first):`,
        ...value.photos.map((line) => `- ${line}`),
        value.shown ? 'The Atlas map now highlights these results; the user sees them there and in the card below. Call atlas_look with ids to see a few photos yourself.' : '',
      ];
      return lines.filter(Boolean).join('\n');
    }
    case 'atlas_show':
      return value.opened ? `The Atlas map is ${value.what}.` : `Nothing to show: ${value.reason}`;
    case 'atlas_trips': {
      if (value.trips.length === 0) return 'No trips found (a trip is a run of photos more than ' + value.awayKm + ' km from home).';
      return [
        `${value.total} trip${value.total > 1 ? 's' : ''}${value.year ? ` in ${value.year}` : ''} (home: ${value.home || 'unknown'}). Newest first:`,
        ...value.trips.map((t) => `- ${t.id} · ${t.start}${t.days > 1 ? ` → ${t.end}` : ''} (${t.days} day${t.days > 1 ? 's' : ''}) · ${t.places.slice(0, 5).join(' → ')}${t.abroad ? ' · abroad' : ''} · ${t.count} photos · ${t.km} km`),
        value.total > value.trips.length ? `(${value.total - value.trips.length} more; narrow by year)` : '',
        'Call atlas_trips with `id` for one trip\'s stops and photos, atlas_show with `trip` to fly the map along it.',
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'atlas_trip': {
      const t = value.trip;
      return [
        `${t.id}: ${t.start} → ${t.end}, ${t.days} day${t.days > 1 ? 's' : ''}, ${t.count} photos, ${t.km} km round trip from ${t.home.city || 'home'}.`,
        'Stops:',
        ...t.stops.map((s, i) => `${i + 1}. ${s.name}${s.country ? `, ${s.country}` : ''} · ${fmtDate(s.from)}${fmtDate(s.to) !== fmtDate(s.from) ? ` → ${fmtDate(s.to)}` : ''} · ${s.count} photos`),
        'Representative photos:',
        ...value.photos.map((line) => `- ${line}`),
      ].join('\n');
    }
    case 'atlas_stats': {
      const s = value.stats;
      const top = (list, n) => list.slice(0, n).map((c) => `${c.name} ${c.days}d`).join(', ');
      return [
        `${value.year ? `In ${value.year}` : 'All time'}: ${s.photos} photos and ${s.videos} videos, ${s.located} with a location, on ${s.days} days.`,
        `${s.countries.length} countr${s.countries.length === 1 ? 'y' : 'ies'} (${s.coverage}% of the world's): ${s.countries.map((c) => `${c.name} (${c.days}d)`).join(', ')}.`,
        `${s.provinceCount ?? s.provinces.length} provinces/states; ${s.cityCount ?? s.cities.length} cities. Most days: ${top(s.cities, 12)}.`,
        `${s.trips} trips (${s.abroadTrips} abroad), about ${s.km} km travelled.`,
        value.year ? '' : `By year: ${s.years.map((y) => `${y.year}: ${y.trips} trips, ${y.cities} cities (${y.newCities} new), ${y.km} km`).join('; ')}.`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'atlas_today': {
      const m = value.memories;
      const lines = [`On ${value.date.slice(5)} in earlier years:`];
      if (m.length === 0) lines.push('- no photos');
      for (const y of m) lines.push(`- ${y.year} (${y.yearsAgo} year${y.yearsAgo > 1 ? 's' : ''} ago): ${y.count} photos${y.place ? ` in ${y.place}` : ''}`);
      if (value.events?.length) {
        lines.push('World events on this day (Wikipedia), nearest to places in the library first:');
        for (const e of value.events.slice(0, 8)) lines.push(`- ${e.year}: ${e.text}${e.near ? ` — ${e.near.km} km from photos in ${e.near.place}` : ''}`);
      } else if (value.eventsError) lines.push(`World events unavailable: ${value.eventsError}`);
      return lines.join('\n');
    }
    case 'atlas_look':
      return value.images.length === 0 ? 'None of those ids has a preview.' : value.images.map((img, i) => `Photo ${i + 1}: ${img.line}`).join('\n');
    default:
      return JSON.stringify(value);
  }
}

const SEARCH_PARAMS = {
  place: { type: 'string', description: 'A place to match: country, province, city, district, or a street / landmark / venue name. Names are as Apple Maps gave them, usually in the Mac\'s language (北京市, 京都市, 日本); English country names also work.' },
  country: { type: 'string', description: 'Country as an ISO code (JP) or name.' },
  from: { type: 'string', description: 'Earliest local date, YYYY, YYYY-MM or YYYY-MM-DD.' },
  to: { type: 'string', description: 'Latest local date, YYYY, YYYY-MM or YYYY-MM-DD (inclusive).' },
  months: { type: 'array', items: { type: 'integer' }, description: 'Only these months (1–12), any year: [6,7,8] for summers.' },
  labels: {
    type: 'array',
    items: { type: 'string' },
    description: 'What is in the photo, as words from Apple Photos\' own search index: scenes, objects, animals, activities, events — all must match. They are in the Mac\'s language (on a Chinese system: 海滩, 猫, 雪, 日落, 山, 美食, 生日; English words will not match there). A word with no match comes back with suggestions.',
  },
  people: { type: 'array', items: { type: 'string' }, description: 'Names of people or pets as named in Photos.' },
  nearLat: { type: 'number', description: 'With nearLng: only photos within nearKm of this point.' },
  nearLng: { type: 'number', description: 'See nearLat.' },
  nearKm: { type: 'number', description: 'Radius for nearLat/nearLng, km (default 5).' },
  kind: { type: 'string', enum: ['photo', 'video', 'screenshot'], description: 'Only photos, only videos, or only screenshots.' },
  favorites: { type: 'boolean', description: 'Only favourites.' },
  trip: { type: 'string', description: 'Only photos of this trip (an id from atlas_trips).' },
  sort: { type: 'string', enum: ['best', 'newest', 'oldest'], description: 'Order of the representative photos (default best: Photos\' own aesthetic score).' },
  limit: { type: 'integer', description: 'Representative photos to return, 1–60 (default 12).' },
};

/** Ids → photo rows, unknown ones dropped. */
const pick = (data, ids) => (Array.isArray(ids) ? ids : []).map((id) => data.byId.get(String(id).toUpperCase())).filter(Boolean);

/**
 * Build all tools.
 * @param {object} host - `{atlas, ctx, settings(), show(cmd), events(date, lang)}`
 */
export function buildTools(host) {
  const ready = async () => {
    await host.atlas.ensure();
    const st = host.atlas.status();
    if (!host.atlas.data) {
      const why =
        st.error?.code === 'permission'
          ? 'DeepSeek Harness is not allowed to read the Photos library. Ask the user to give it Full Disk Access (System Settings → Privacy & Security → Full Disk Access), then restart it.'
          : st.error?.code === 'no-library'
            ? 'No Photos library was found. The user can set its path in the Atlas panel\'s settings.'
            : st.status === 'building'
              ? 'The Atlas index is still being built; try again in a few seconds.'
              : `The Photos library could not be read: ${st.error?.message ?? 'unknown error'}`;
      return { ok: false, reason: why };
    }
    return null;
  };
  const tool = (def) =>
    defineTool({
      ...def,
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean', required: true } } },
        render: (_args, value) => {
          const blocks = [{ type: 'text', text: renderText(value?.kind ?? def.name, value) }];
          for (const img of value?.images ?? []) if (img.image) blocks.push({ type: 'image', attachment: img.image });
          return blocks;
        },
        presentationMeta: (_args, value) => ({ atlas: value?.card ?? null }),
        ...(def.output ?? {}),
      },
      isConcurrencySafe: () => true,
    });

  const searchTool = tool({
    name: 'atlas_search',
    description:
      'Search the user\'s own photo library (macOS Photos) by place, date, what is in the photo, people and distance, and highlight the results on the Atlas map panel. Use it for questions about where the user has been, when, and what they photographed: "我 2019 年夏天去过哪些海边", "photos of my cat in Japan", "what did I shoot near here". Returns counts, places, years and representative photo ids. Every filter is optional; combine them.',
    parameters: SEARCH_PARAMS,
    execute: async (args) => {
      const not = await ready();
      if (not) return not;
      const data = host.atlas.data;
      const q = { ...args };
      if (Number.isFinite(args.nearLat) && Number.isFinite(args.nearLng)) q.near = { lat: args.nearLat, lng: args.nearLng, km: args.nearKm };
      const result = search(data, q);
      const photos = pick(data, result.ids);
      const shown = result.located > 0;
      if (shown) host.show({ kind: 'highlight', open: false, query: q, bbox: result.bbox, ids: result.ids, total: result.total });
      return {
        ok: true,
        kind: 'atlas_search',
        result,
        photos: photos.map((a) => photoLine(data, a)),
        shown,
        card: { tool: 'atlas_search', title: describeQuery(q), total: result.total, located: result.located, ids: result.ids.slice(0, 12), bbox: result.bbox, query: q },
      };
    },
  });

  const showTool = tool({
    name: 'atlas_show',
    description:
      'Open the Atlas map panel and move it: to what a search finds (the same filters as atlas_search: place, country, dates, labels, people…), a trip (fly along its route, or play it as a story), specific photos, or a box. Use it when the user wants to see something on the map ("带我去看看京都", "show me that trip"). After an atlas_search, pass the same filters to show exactly those results.',
    parameters: {
      place: { type: 'string', description: 'A place name to fly to (matched like atlas_search\'s place).' },
      trip: { type: 'string', description: 'A trip id from atlas_trips: flies along its route.' },
      story: { type: 'boolean', description: 'With trip: play it as a story (the camera travels stop by stop, showing photos).' },
      ids: { type: 'array', items: { type: 'string' }, description: 'Photo ids to show.' },
      bbox: { type: 'array', items: { type: 'number' }, description: '[west, south, east, north] to frame.' },
      // The same filters as atlas_search, so the map shows exactly what was found.
      country: SEARCH_PARAMS.country,
      from: SEARCH_PARAMS.from,
      to: SEARCH_PARAMS.to,
      months: SEARCH_PARAMS.months,
      labels: SEARCH_PARAMS.labels,
      people: SEARCH_PARAMS.people,
      kind: SEARCH_PARAMS.kind,
      favorites: SEARCH_PARAMS.favorites,
    },
    execute: async (args) => {
      const not = await ready();
      if (not) return not;
      const data = host.atlas.data;
      if (args.trip) {
        const trip = data.tripById.get(String(args.trip));
        if (!trip) return { ok: true, kind: 'atlas_show', opened: false, reason: `no trip ${args.trip}; list them with atlas_trips` };
        host.show({ kind: 'trip', open: true, trip: trip.id, story: args.story === true, bbox: trip.bbox });
        return { ok: true, kind: 'atlas_show', opened: true, what: `${args.story ? 'playing' : 'showing'} the trip ${trip.places.slice(0, 4).join(' → ')} (${trip.start})`, card: { tool: 'atlas_show', title: trip.places.slice(0, 4).join(' → '), trip: trip.id, ids: trip.ids.slice(0, 8), bbox: trip.bbox } };
      }
      if (Array.isArray(args.ids) && args.ids.length > 0) {
        const photos = pick(data, args.ids).filter((a) => a.lat !== null);
        if (photos.length === 0) return { ok: true, kind: 'atlas_show', opened: false, reason: 'none of those photos has a location' };
        const r = search({ ...data, assets: photos }, {});
        host.show({ kind: 'highlight', open: true, ids: photos.map((a) => a.id), bbox: r.bbox, focus: photos.length === 1 ? photos[0].id : null });
        return { ok: true, kind: 'atlas_show', opened: true, what: `showing ${photos.length} photo${photos.length > 1 ? 's' : ''}`, card: { tool: 'atlas_show', compact: true, title: '', ids: photos.slice(0, 8).map((a) => a.id), bbox: r.bbox } };
      }
      if (Array.isArray(args.bbox) && args.bbox.length === 4 && args.bbox.every(Number.isFinite)) {
        host.show({ kind: 'highlight', open: true, bbox: args.bbox, ids: [] });
        return { ok: true, kind: 'atlas_show', opened: true, what: 'framing the requested area', card: { tool: 'atlas_show', compact: true, title: '', ids: [], bbox: args.bbox } };
      }
      const q = { place: args.place, country: args.country, from: args.from, to: args.to, months: args.months, labels: args.labels, people: args.people, kind: args.kind, favorites: args.favorites, located: true, limit: 24 };
      for (const k of Object.keys(q)) if (q[k] === undefined) delete q[k];
      const result = search(data, q);
      if (result.located === 0) return { ok: true, kind: 'atlas_show', opened: false, reason: `no photos with a location match ${describeQuery(q) || 'that'}` };
      host.show({ kind: 'highlight', open: true, query: q, bbox: result.bbox, ids: result.ids, total: result.total });
      return { ok: true, kind: 'atlas_show', opened: true, what: `showing ${result.located} photos: ${describeQuery(q)}`, card: { tool: 'atlas_show', compact: true, title: describeQuery(q), total: result.total, ids: result.ids.slice(0, 8), bbox: result.bbox, query: q } };
    },
  });

  const tripsTool = tool({
    name: 'atlas_trips',
    description:
      'The user\'s trips, found from their photos: runs of photos taken far from home, with stops (cities), dates, distance. Without `id`: the list (newest first, optionally one year or country). With `id`: one trip\'s stops and representative photos — use it to write a travel diary or recap.',
    parameters: {
      id: { type: 'string', description: 'A trip id for its details.' },
      year: { type: 'integer', description: 'Only trips that started this year.' },
      country: { type: 'string', description: 'Only trips that visited this country (ISO code or name).' },
      abroad: { type: 'boolean', description: 'Only trips abroad.' },
      limit: { type: 'integer', description: 'How many to list (default 30).' },
    },
    execute: async (args) => {
      const not = await ready();
      if (not) return not;
      const data = host.atlas.data;
      if (args.id) {
        const trip = data.tripById.get(String(args.id));
        if (!trip) return { ok: false, reason: `No trip ${args.id}. Call atlas_trips without id to list them.` };
        const { path, ...rest } = trip;
        void path;
        return { ok: true, kind: 'atlas_trip', trip: rest, photos: pick(data, trip.ids.slice(0, 16)).map((a) => photoLine(data, a)), card: { tool: 'atlas_trips', title: trip.places.slice(0, 4).join(' → '), trip: trip.id, ids: trip.ids.slice(0, 12), bbox: trip.bbox } };
      }
      let list = data.trips;
      if (Number.isFinite(args.year)) list = list.filter((t) => new Date(t.startDay * 86400000).getUTCFullYear() === args.year);
      if (args.country) {
        const c = String(args.country).toLowerCase();
        const cc = /^[a-z]{2}$/.test(c) ? c.toUpperCase() : data.countryNames.get(c) ?? '';
        list = list.filter((t) => t.countries.some((x) => x.cc === cc || String(x.name).toLowerCase().includes(c)));
      }
      if (args.abroad === true) list = list.filter((t) => t.abroad);
      const limit = Math.max(1, Math.min(200, Number(args.limit) || 30));
      return {
        ok: true,
        kind: 'atlas_trips',
        total: list.length,
        year: args.year ?? null,
        home: data.homes.main?.city ?? '',
        awayKm: host.settings().awayKm,
        trips: list.slice(0, limit).map(({ path, stops, ids, ...rest }) => (void path, void stops, void ids, rest)),
        card: { tool: 'atlas_trips', title: '', trips: list.slice(0, 8).map((t) => ({ id: t.id, start: t.start, days: t.days, places: t.places.slice(0, 3), cover: t.cover, abroad: t.abroad })) },
      };
    },
  });

  const statsTool = tool({
    name: 'atlas_stats',
    description: 'Footprint statistics from the user\'s photos: countries, provinces and cities visited (with days spent), trips, distance, and a per-year breakdown. Use for "我去过多少个国家/城市", year-in-review summaries.',
    parameters: { year: { type: 'integer', description: 'One year only; leave out for all time.' } },
    execute: async (args) => {
      const not = await ready();
      if (not) return not;
      const s = host.atlas.data.stats(Number.isFinite(args.year) ? args.year : undefined);
      const trim = (list) => list.slice(0, 40).map(({ key, name, cc, days, photos, first, last }) => ({ key, name, cc, days, photos, first, last }));
      return {
        ok: true,
        kind: 'atlas_stats',
        year: args.year ?? null,
        stats: { ...s, countries: s.countries.map(({ key, name, cc, days, photos }) => ({ key, name, cc, days, photos })), provinces: trim(s.provinces), cities: trim(s.cities), provinceCount: s.provinces.length, cityCount: s.cities.length },
        card: { tool: 'atlas_stats', title: '', year: args.year ?? null, countries: s.countries.map((c) => ({ cc: c.cc, name: c.name, flag: flagOf(c.cc) })), cities: s.cities.length, trips: s.trips, km: s.km },
      };
    },
  });

  const todayTool = tool({
    name: 'atlas_today',
    description: '"On this day": the user\'s photos from this date in earlier years (where they were), and world events from Wikipedia on this date, the ones that happened near places the user has photographed first.',
    parameters: { date: { type: 'string', description: 'MM-DD or YYYY-MM-DD; default today.' } },
    execute: async (args) => {
      const not = await ready();
      if (not) return not;
      const today = host.today(args.date);
      const view = await host.todayView(today, host.lang());
      return {
        ok: true,
        kind: 'atlas_today',
        date: today.iso,
        memories: view.memories.map(({ ids, ...m }) => (void ids, m)),
        events: (view.events ?? []).slice(0, 12).map(({ thumb, ...e }) => (void thumb, e)),
        eventsError: view.eventsError,
        card: { tool: 'atlas_today', title: today.iso.slice(5), memories: view.memories.slice(0, 6).map((m) => ({ year: m.year, place: m.place, cover: m.cover, count: m.count })), ids: view.memories.flatMap((m) => m.ids.slice(0, 2)).slice(0, 10) },
      };
    },
  });

  const lookTool = tool({
    name: 'atlas_look',
    description: 'Look at up to 4 of the user\'s photos yourself (their previews are attached to the result). Only when you need to see what is in them — to describe a trip, pick a cover, answer "what was I doing there". Photos are private: do not call it just to show the user; they see photos on the map and in the cards already.',
    parameters: { ids: { type: 'array', items: { type: 'string' }, required: true, description: 'Photo ids (from atlas_search or atlas_trips), at most 4.' } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          images: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                id: { type: 'string', required: true },
                line: { type: 'string', required: true },
                image: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    attachmentId: { type: 'string', required: true },
                    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
                    bytes: { type: 'integer', required: true },
                    width: { type: 'integer', required: true },
                    height: { type: 'integer', required: true },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    execute: async (args) => {
      const not = await ready();
      if (not) return not;
      const data = host.atlas.data;
      const attachments = host.ctx.get?.('attachments');
      const images = [];
      for (const a of pick(data, args.ids).slice(0, 4)) {
        const file = host.atlas.files.large(a.id) || host.atlas.files.thumb(a.id);
        if (!file) continue;
        let image;
        try {
          if (attachments?.saveImage) image = await attachments.saveImage({ data: new Uint8Array(readFileSync(file)), mediaType: 'image/jpeg', name: `${a.id}.jpg` });
        } catch {
          image = undefined;
        }
        images.push({ id: a.id, line: photoLine(data, a), ...(image ? { image } : {}) });
      }
      return { ok: true, kind: 'atlas_look', images, card: { tool: 'atlas_look', title: '', ids: images.map((i) => i.id) } };
    },
  });

  return [searchTool, showTool, tripsTool, statsTool, todayTool, lookTool];
}

/** A short human label of a query, for cards. */
export function describeQuery(q) {
  const parts = [];
  if (q.place) parts.push(Array.isArray(q.place) ? q.place.join(' / ') : q.place);
  if (q.country) parts.push(q.country);
  if (q.from || q.to) parts.push(q.from && q.to && q.from !== q.to ? `${q.from} – ${q.to}` : q.from || `≤ ${q.to}`);
  if (Array.isArray(q.months) && q.months.length) parts.push(`${q.months.join('/')}月`);
  if (Array.isArray(q.labels) && q.labels.length) parts.push(q.labels.join(' · '));
  if (Array.isArray(q.people) && q.people.length) parts.push(q.people.join(' · '));
  if (q.near) parts.push(`${q.near.km ?? 5} km`);
  if (q.kind === 'video') parts.push('video');
  if (q.kind === 'screenshot') parts.push('screenshot');
  if (q.favorites) parts.push('♥');
  return parts.join(' · ');
}

// --- the plugin -------------------------------------------------------------------

/**
 * @param ctx - plugin context.
 * @param {unknown} config - the Loader row's config.
 */
export function apply(ctx, config) {
  const base = settingsOf(config);
  const dir = join(homeDir(), 'cache', 'atlas');
  const settingsFile = join(dir, 'settings.json');
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
  } catch {
    saved = {};
  }
  let settings = mergeSettings(base, saved);
  const log = (msg) => {
    try {
      ctx.logger?.info?.(msg);
    } catch {
      // No logger.
    }
  };
  const atlas = createAtlas({ cacheDir: dir, settings: () => settings, log });
  // Start reading in the background so the panel opens on a built index.
  setTimeout(() => void atlas.ensure().catch(() => {}), 1500);

  // Map commands from the tools, read by every open page.
  const commands = [];
  let seq = 0;
  const show = (cmd) => {
    seq += 1;
    commands.push({ seq, at: Date.now(), ...cmd });
    while (commands.length > 20) commands.shift();
  };

  let lang = 'zh';
  const today = (input) => {
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    let d = now.getDate();
    const hit = String(input ?? '').match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
    if (hit) {
      if (hit[1]) y = Number(hit[1]);
      m = Number(hit[2]);
      d = Number(hit[3]);
    }
    return { year: y, month: m, day: d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  };
  const todayView = async (when, language) => {
    const data = atlas.data;
    const memories = data ? memoriesOn(data.assets, when) : [];
    let events = null;
    let eventsError = '';
    if (settings.history) {
      try {
        const feed = await fetchEvents(dir, language === 'en' ? 'en' : 'zh', when.month, when.day, { userAgent: `dsh-atlas/${VERSION} (DeepSeek Harness plugin)` });
        events = data ? rankEvents(feed.events, data.grid) : feed.events;
      } catch (error) {
        eventsError = String(error?.message ?? error);
      }
    }
    return { date: when.iso, memories, events, eventsError, history: settings.history };
  };

  const host = { atlas, ctx, settings: () => settings, show, today, todayView, lang: () => lang };

  let disposeTools = [];
  ctx.effect(() => {
    if (base.enabled && typeof ctx.tools?.register === 'function') {
      disposeTools = buildTools(host).map((t) => ctx.tools.register(t));
    }
    return () => {
      for (const d of disposeTools) if (typeof d === 'function') d();
      disposeTools = [];
    };
  });

  const cmds = ctx.get?.('commands');
  if (cmds !== undefined) {
    ctx.effect(() =>
      cmds.register({
        name: 'atlas',
        description: 'Open the Atlas map of your photos (rebuild: read the Photos library again)',
        input: { hint: '[rebuild]' },
        handler: async (invocation) => {
          const arg = String(invocation.rawInput ?? '').trim().toLowerCase();
          if (arg === 'rebuild') {
            await atlas.rebuild();
            const st = atlas.status();
            return { kind: 'success', text: st.status === 'ready' ? `Atlas: indexed ${st.items} items, ${st.located} with a place.` : `Atlas: ${st.error?.message ?? st.status}` };
          }
          await atlas.ensure();
          const st = atlas.status();
          return { kind: 'success', text: st.located ? `${st.located} photos on the map. Open Atlas from the sidebar.` : `Atlas: ${st.error?.message ?? st.status}` };
        },
      }),
    );
  }

  const mountRoutes = (scope) => {
    const webServer = scope.webServer;
    if (webServer === undefined || typeof webServer.register !== 'function') return;
    const route = (kind, path, handler) => scope.effect(() => webServer.register({ kind, path: `${ROUTE}${path}`, handler }));

    const stateView = () => {
      const st = atlas.status();
      const data = atlas.data;
      return {
        ok: true,
        version: VERSION,
        ...st,
        settings: { library: settings.library, history: settings.history, basemap: settings.basemap, awayKm: settings.awayKm, home: settings.home, nearby: settings.nearby },
        home: data?.homes.main ? { lat: data.homes.main.lat, lng: data.homes.main.lng, city: data.homes.main.city, cc: data.homes.main.cc } : null,
        trips: data?.trips.length ?? 0,
        people: data?.people.slice(0, 30).map((p) => p.name) ?? [],
        labels: data?.labelCounts.slice(0, 60).map((l) => l.word) ?? [],
        seq,
      };
    };
    route('exact', '/state', (req, res) => serveJson(res, async () => {
      await atlas.ensure();
      return stateView();
    }));

    route('exact', '/points', (req, res) =>
      serveJson(res, async () => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        const pts = data.located;
        return {
          ok: true,
          builtAt: atlas.status().builtAt,
          ids: pts.map((a) => a.id),
          lat: pts.map((a) => Math.round(a.lat * 1e5) / 1e5),
          lng: pts.map((a) => Math.round(a.lng * 1e5) / 1e5),
          t: pts.map((a) => a.t),
          tz: pts.map((a) => a.tz ?? 0),
          s: pts.map((a) => Math.round((a.score ?? 0) * 100)),
          v: pts.map((a) => (a.video ? 1 : 0)),
          cc: pts.map((a) => a.place?.cc ?? ''),
          // The city of each point, as an index into `cities`.
          ...(() => {
            const cities = [];
            const index = new Map();
            const ci = pts.map((a) => {
              const name = a.place?.city || a.place?.province || a.place?.country || '';
              if (!index.has(name)) {
                index.set(name, cities.length);
                cities.push(name);
              }
              return index.get(name);
            });
            return { cities, ci };
          })(),
          unlocated: data.assets.length - pts.length,
        };
      }),
    );

    route('exact', '/trips', (req, res) =>
      serveJson(res, async () => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        return { ok: true, home: data.homes.main, trips: data.trips };
      }),
    );

    route('exact', '/stats', (req, res) =>
      serveJson(res, async () => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        const url = new URL(req.url ?? '/', 'http://localhost');
        const y = Number(url.searchParams.get('year'));
        return { ok: true, year: Number.isFinite(y) && y > 1900 ? y : null, stats: data.stats(Number.isFinite(y) && y > 1900 ? y : undefined) };
      }),
    );

    route('exact', '/today', (req, res) =>
      serveJson(res, async () => {
        await atlas.ensure();
        const url = new URL(req.url ?? '/', 'http://localhost');
        const l = url.searchParams.get('lang');
        if (l === 'en' || l === 'zh') lang = l;
        return { ok: true, ...(await todayView(today(url.searchParams.get('date')), lang)) };
      }),
    );

    route('exact', '/photos', (req, res) =>
      postJson(req, res, async (body) => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        return { ok: true, photos: pick(data, (body.ids ?? []).slice(0, 500)).map((a) => photoView(data, a, { labels: body.labels !== false })) };
      }),
    );

    route('exact', '/search', (req, res) =>
      postJson(req, res, async (body) => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        const typed = typeof body.text === 'string' ? parseText(data, body.text) : {};
        const { text, all, ...rest } = body;
        void text;
        const q = { ...typed, ...rest, all };
        // `all`: every located match's id too, so the map can filter to them.
        const result = search(data, { ...q, limit: Math.min(60, Number(q.limit) || 40), withAll: q.all === true });
        return { ok: true, result, query: typed, label: describeQuery(q) };
      }),
    );

    // Named places at street level (venues, landmarks), built once per index.
    let placesCache = { data: null, list: [] };
    route('exact', '/places', (req, res) =>
      serveJson(res, async () => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        if (placesCache.data !== data) placesCache = { data, list: placesOf(data.assets, data.lexicon) };
        return { ok: true, places: placesCache.list };
      }),
    );

    // The best few of a set of photos, for the panel's "featured" row.
    route('exact', '/curate', (req, res) =>
      postJson(req, res, async (body) => {
        await atlas.ensure();
        const data = atlas.data;
        if (!data) return { ok: false, ...atlas.status() };
        const list = pick(data, (body.ids ?? []).slice(0, 20000));
        const n = Math.max(1, Math.min(60, Number(body.n) || 18));
        const good = list.filter((a) => (a.score ?? 0) > -0.2);
        return { ok: true, best: pickBest(good.length >= Math.min(n, list.length) ? good : list, n).map((a) => a.id) };
      }),
    );

    // Wikipedia articles near the map's centre (only when the panel asks, zoomed in).
    const nearbyCache = new Map();
    route('exact', '/nearby', (req, res) =>
      serveJson(res, async () => {
        if (!settings.nearby) return { ok: true, off: true, articles: [] };
        const url = new URL(req.url ?? '/', 'http://localhost');
        const lat = Number(url.searchParams.get('lat'));
        const lng = Number(url.searchParams.get('lng'));
        const r = Number(url.searchParams.get('r')) || 3000;
        const l = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'lat and lng' };
        const key = `${l}:${lat.toFixed(2)}:${lng.toFixed(2)}:${Math.round(Math.log2(Math.max(100, r)))}`;
        if (!nearbyCache.has(key)) {
          const p = nearbyArticles(lat, lng, r, l, { userAgent: `dsh-atlas/${VERSION} (DeepSeek Harness plugin)` });
          nearbyCache.set(key, p);
          p.catch(() => nearbyCache.delete(key));
          while (nearbyCache.size > 300) nearbyCache.delete(nearbyCache.keys().next().value);
        }
        try {
          return { ok: true, articles: await nearbyCache.get(key) };
        } catch (error) {
          return { ok: false, reason: String(error?.message ?? error), articles: [] };
        }
      }),
    );

    route('exact', '/commands', (req, res) =>
      serveJson(res, () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const after = Number(url.searchParams.get('after'));
        return { ok: true, seq, commands: Number.isFinite(after) ? commands.filter((c) => c.seq > after) : [] };
      }),
    );

    route('exact', '/settings', (req, res) =>
      postJson(req, res, async (body) => {
        const next = { ...saved };
        for (const key of SETTINGS_FIELDS) {
          if (!(key in body)) continue;
          if (body[key] === null || body[key] === '') delete next[key];
          else next[key] = body[key];
        }
        const before = settings;
        saved = next;
        settings = mergeSettings(base, next);
        try {
          mkdirSync(dir, { recursive: true });
          writeFileSync(settingsFile, JSON.stringify(next, null, 2), 'utf8');
        } catch {
          // Applies to this process anyway.
        }
        if (before.library !== settings.library) await atlas.rebuild();
        else if (JSON.stringify(before.home) !== JSON.stringify(settings.home) || before.awayKm !== settings.awayKm) atlas.rederive();
        return stateView();
      }),
    );

    route('exact', '/rebuild', (req, res) =>
      postJson(req, res, async () => {
        await atlas.rebuild();
        return stateView();
      }),
    );

    route('prefix', '/thumb', (req, res) => servePhoto(req, res, '/thumb', (id) => atlas.files?.thumb(id)));
    route('prefix', '/large', (req, res) => servePhoto(req, res, '/large', (id) => atlas.files?.large(id) || atlas.files?.thumb(id)));
    route('prefix', '/original', (req, res) =>
      servePhoto(req, res, '/original', (id) => {
        const a = atlas.data?.byId.get(id);
        return a ? atlas.files?.original(a.dir, a.file) : '';
      }),
    );
    route('prefix', '/vendor', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const name = decodeURIComponent(url.pathname.slice(`${ROUTE}/vendor/`.length));
      const type = VENDOR[name];
      if (!type) {
        res.statusCode = 404;
        res.end();
        return;
      }
      streamFile(req, res, join(here, 'vendor', name), type, 'public, max-age=86400');
    });
  };
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountRoutes);
  else if (ctx.webServer) mountRoutes({ webServer: ctx.webServer, effect: (fn) => ctx.effect(fn) });
}

/** Serve one photo file by UUID from a prefix route. */
function servePhoto(req, res, prefix, resolve) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const id = decodeURIComponent(url.pathname.slice(`${ROUTE}${prefix}/`.length)).replace(/\.[a-z0-9]+$/i, '').toUpperCase();
  const file = /^[0-9A-F-]{36}$/.test(id) ? resolve(id) : '';
  if (!file) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const ext = extname(file).toLowerCase();
  const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.gif': 'image/gif', '.thm': 'image/jpeg' }[ext] ?? 'application/octet-stream';
  streamFile(req, res, file, type, 'private, max-age=86400');
}

/** Stream a file, honouring a single byte range (for video). */
function streamFile(req, res, file, type, cache) {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    size = 0;
  }
  if (size === 0) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('content-type', type);
  res.setHeader('cache-control', cache);
  res.setHeader('accept-ranges', 'bytes');
  let start = 0;
  let end = size - 1;
  const range = String(req.headers?.range ?? '').match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] !== '' || range[2] !== '')) {
    if (range[1] === '') {
      start = Math.max(0, size - Number(range[2]));
    } else {
      start = Number(range[1]);
      if (range[2] !== '') end = Math.min(size - 1, Number(range[2]));
    }
    if (start > end || start >= size) {
      res.statusCode = 416;
      res.setHeader('content-range', `bytes */${size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
  } else res.statusCode = 200;
  res.setHeader('content-length', String(end - start + 1));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  stream.pipe(res);
}

/**
 * Answer one state-changing request. Only a JSON POST is taken: a cross-site
 * page cannot send one without a CORS preflight, which these routes never grant.
 */
function postJson(req, res, produce) {
  const type = String(req.headers?.['content-type'] ?? '');
  if (req.method !== 'POST' || !/^application\/json\b/i.test(type)) {
    res.statusCode = req.method === 'POST' ? 415 : 405;
    res.end();
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    serveJson(res, () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return { ok: false, reason: 'bad-request' };
      }
      return produce(body && typeof body === 'object' ? body : {});
    });
  });
}

/** Answer one request as JSON; a thrown handler becomes a stable error body. */
function serveJson(res, produce) {
  Promise.resolve()
    .then(produce)
    .then((body) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    })
    .catch((error) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, reason: error?.message ?? 'error' }));
    });
}

export { isoDay, yearOf };
