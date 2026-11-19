# Atlas

English | [简体中文](README.zh-CN.md)

Your photo library on a globe, inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

- **A night globe that zooms to street level.** Every place you took a photo glows; thumbnails pop up
  where you were, captioned with the place and the years, and split apart as you zoom in. Zoomed in,
  the map has 3D terrain and buildings, shops and landmarks, the **places you have been** (the venues
  and landmarks Photos recognised in your photos — click one for its photos) and **Wikipedia nearby**
  (what the articles around you say, with a picture). Countries you have been to are lit up, the
  night side of the Earth is shaded, and the globe turns slowly while you are not touching it.
- **Four basemaps.** *Night* (OpenStreetMap, recoloured for the night globe), *Amap* (China in full
  Chinese detail; the night map abroad), *Satellite* and *Outline* (nothing fetched).
- **The best photos first.** Wherever you open a set of photos — a pin, a place, a search, a trip —
  a **featured** row comes first: the best few by Photos' own aesthetic score and your favourites,
  near-duplicates and bursts skipped, spread over the days; screenshots, documents and saved images
  kept out. Everything else follows, by time, one click away.
- **Your trips, found for you.** Runs of photos taken far from home become trips, with their stops,
  dates and distance. Pick one to see its route; press **Story** and the camera
  flies stop by stop while that stop's best photos drift across the screen.
- **A timeline of your years.** Drag across it to see one stretch of time, click a year, or press
  **Replay the years**: the camera flies from chapter to chapter — every trip, and the cities of each
  year — showing each one's best photos while your footprint grows behind it.
- **On this day, twice.** What you photographed on this date in earlier years — and what happened in
  the world on this date (from Wikipedia), the events near places you have been first: *"1987: the
  first mobile network opened in Guangzhou — 1 km from where you took photos."*
- **Search like you talk.** Type `Kyoto 2023 cat`, `beach video`, `summer` in the panel — or, in
  Chinese, run the words together: `北京的猫`, `2023年夏天在珠海`, `去年`. The map filters to the
  matches; a word your library has no photos of finds nothing and suggests words it does have. In any conversation, ask the model — *"Did I photograph cats in Japan? Show
  me on the map"*, *"Recap my April trip as a story"*, *"How many countries have I been to?"* — and
  the map moves as it answers.
- **Footprint numbers.** Countries and regions, cities, days in each, trips, kilometres, a year-by-year
  breakdown.

Bilingual (English, 简体中文).

## Install

Atlas is listed in the [DSH Plugins](https://github.com/kadaliao/dsh-plugins) market. Turn on
**Plugins → Experimental plugins → Custom plugin markets**, add the market under **Discover → Sources**:

```
https://raw.githubusercontent.com/kadaliao/dsh-plugins/main/marketplace.json
```

and install **Atlas** from Discover. Or paste `@kadaliao/dsh-atlas` into the plugin manager. Refresh
the page once after installing; **Atlas** appears in the left sidebar (or type `/atlas`).

## Requirements

- macOS with a **Photos** library. Atlas reads the library Photos opens by default; another one can
  be picked in the panel's settings.
- DeepSeek Harness 0.2.x with the Web UI (the desktop app, or `dsh web`).
- If the panel says it cannot read the library: give **DeepSeek Harness** Full Disk Access in
  System Settings → Privacy & Security → Full Disk Access, then restart it.

## What it reads, and what leaves your Mac

- **Your Photos library, read-only.** Atlas opens `database/Photos.sqlite` and the search index
  `database/search/leo.sqlite` read-only, and serves the previews Photos already made
  (`resources/derivatives`) to the panel. It never writes to the library. Hidden and deleted photos
  are left out.
- **An index** of what it read (dates, coordinates, place names, labels) is cached under
  `~/.dsh/cache/atlas/`. Nothing is written to your conversations.
- **Map tiles**: like any web map, the tile servers see which area you look at. *Night* uses
  [OpenFreeMap](https://openfreemap.org); 3D terrain uses the public Terrarium elevation tiles on AWS
  Open Data; *Amap* additionally fetches Amap (高德) tiles inside China; *Satellite* fetches Esri World
  Imagery. Choose *Outline* to fetch nothing.
- **Wikipedia nearby**: zoomed in, the panel asks Wikipedia for articles around the centre of the
  map, which sends that point. Turn it off in the layers menu or settings.
- **History on this day** asks Wikipedia for the events of today's date — only the date is sent.
  It can be turned off in settings.
- **The model** sees what its tools return: counts, dates, place names, photo ids and labels. It sees
  a photo itself only when it calls `atlas_look` (at most 4 previews per call), which is sent to your
  model provider like any other image.

## Tools for the model

| Tool | What it does |
| --- | --- |
| `atlas_search` | Find photos by place, country, dates, months, labels (what is in them), people and distance; highlights them on the map |
| `atlas_show` | Open the map and fly to a search, a trip (optionally as a story), photos or an area |
| `atlas_trips` | The list of trips, or one trip's stops and photos |
| `atlas_stats` | Countries, cities, days, trips and distance, overall or for a year |
| `atlas_today` | This date in your photos and in world history |
| `atlas_look` | Look at up to 4 photos (previews attached for the model) |

Labels are the words Photos itself uses for search, in the language of your Mac: on a Chinese system
`猫`, `海滩`, `日落`, `雪`. A word that matches nothing comes back with suggestions.

## Settings

The gear button in the panel:

- **Photos library** — a path to a `.photoslibrary`, or empty for the default one.
- **Home** — found from your photos (the place with the most days each year); pin it to the map's
  centre if that guess is wrong.
- **A trip starts this far from home** — 100 km by default.
- **Map** — Night, Amap, Satellite or Outline (also in the layers menu, with the layers themselves:
  places, Wikipedia nearby, 3D terrain, countries, night side, history markers).
- **History on this day** — on or off.
- **Read the library again** — Atlas also re-reads it by itself a few minutes after Photos changes.

The same keys can be set on the plugin's row in `cordis.patch.yml`: `library`, `history`, `nearby`,
`basemap` (`night` | `amap` | `satellite` | `offline`), `awayKm`.

## Limits

- **Amap** is fetched from its public tile endpoint without a key, which Amap does not document for
  third-party use; it may stop working at any time, and then China falls back to the night map.
  Inside China, Atlas shifts what it draws to Amap's GCJ-02 datum so photos line up with the streets.
- **Satellite** imagery is Esri's; check Esri's terms for your use. It is off unless you choose it.

- Only photos with a location are on the map; the rest still count in search and "on this day".
- Videos play when the original is on this Mac; with **Optimize Mac Storage** many originals stay in
  iCloud, and Atlas shows the preview instead.
- The Photos database format is Apple's and undocumented; Atlas is tested on the libraries of recent
  macOS versions. If a future one changes it, the panel says it cannot read the library.

## Development

```bash
npm test                       # node --test test/*.test.mjs (Node 24+, uses node:sqlite)
node scripts/build-countries.mjs   # rebuild vendor/countries.json from Natural Earth
```

Try a working copy in a throwaway Harness home:

```bash
DSH=/Applications/DeepSeek\ Harness.app/Contents/Resources/runtime/cli/bin/dsh
export DSH_HOME=$(mktemp -d)
"$DSH" plugin --profile web add "$PWD"
"$DSH" web --no-open --port 3917
```

Layout: `index.js` (Host half: routes, tools), `client.js` (Web Client half: panel, globe, chat
cards), `lib/` (library reader, trips, stats, search, on this day), `vendor/` (MapLibre GL JS 5.24,
Supercluster 9.1, Natural Earth 1:110m countries).

## Credits

[MapLibre GL JS](https://maplibre.org) (BSD-3-Clause), [Supercluster](https://github.com/mapbox/supercluster)
(ISC), [OpenFreeMap](https://openfreemap.org) tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, terrain from Mapzen Terrarium on AWS Open Data, © 高德地图 AutoNavi (Amap basemap),
Esri World Imagery (Satellite basemap), [Natural Earth](https://www.naturalearthdata.com) (public domain),
[Wikipedia](https://www.wikipedia.org) "On this day" (CC BY-SA).

## License

MIT.
