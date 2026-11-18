window.__ModuleLoader__.load({
  id: '@kadaliao/dsh-atlas',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'atlas';
    const PANEL_ID = 'atlas';
    const ROUTE = '/__dsh_atlas';
    const VENDOR = `${ROUTE}/vendor/`;
    const TOOL_NAMES = ['atlas_search', 'atlas_show', 'atlas_trips', 'atlas_stats', 'atlas_today', 'atlas_look'];
    const RESULT_KIND = 'atlas-result';
    // OpenFreeMap's most detailed style (POIs, 3D buildings, shaded relief), recoloured for night.
    const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
    const AMAP_TILES = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
    const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
    const POLL_MS = 2000;

    // The map is a night globe whatever the app theme; its overlays are dark glass.
    const C = {
      glass: 'rgba(13, 17, 28, 0.74)',
      glassStrong: 'rgba(10, 13, 22, 0.9)',
      line: 'rgba(255, 255, 255, 0.09)',
      ink: '#e9edf5',
      muted: '#9ba5b9',
      faint: '#6b7489',
      amber: '#ffb547',
      amberDeep: '#ff7a1a',
      cyan: '#5ad1ff',
      violet: '#b892ff',
      danger: '#ff6b6b',
      // Panel chrome outside the map follows the app theme.
      label: 'var(--dsw-alias-brand-primary, #5ad1ff)',
      appMuted: 'var(--dsw-alias-label-secondary, #888)',
      appFaint: 'var(--dsw-alias-label-tertiary, #999)',
      appLayer: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))',
      appBorder: 'var(--dsw-alias-border-l2, rgba(127,127,127,.25))',
    };
    const SMALL = 'var(--dsh-content-font-size-secondary, 12.5px)';

    // --- words ---------------------------------------------------------------------

    const DICTIONARY = {
      en: {
        lang: 'en',
        featured: 'Featured',
        allByTime: 'All {n} photos, by time',
        basemapNight: 'Night',
        basemapAmap: 'Amap',
        basemapSatellite: 'Satellite',
        basemapOfflineShort: 'Outline',
        basemapAmapLong: 'Amap: China in full detail (an unofficial tile endpoint that may stop working; the night map abroad)',
        basemapSatelliteLong: 'Satellite imagery (Esri World Imagery; check its terms for your use)',
        basemapNightHint: 'OpenStreetMap at night, with shops, landmarks and 3D buildings.',
        basemapAmapHint: 'Amap inside China (shops, estates, landmarks in Chinese); the night map elsewhere. Unofficial endpoint: it may stop working.',
        basemapSatelliteHint: 'Esri World Imagery under the night map’s labels. Check Esri’s terms for your use.',
        layerTerrain: '3D terrain',
        layerPlaces: 'Places I have been',
        layerNearby: 'Wikipedia nearby',
        nearbyHint: 'Zoomed in, ask Wikipedia what is around the centre of the map (sends that point).',
        title: 'Atlas',
        toolTitle: 'Atlas',
        searchPlaceholder: 'Search your photos: Kyoto 2023, cat, beach video…',
        photos: '{n} photos',
        photosShort: '{n}',
        places: '{n} places',
        countriesN: '{n} countries',
        citiesN: '{n} cities',
        tripsN: '{n} trips',
        km: '{n} km',
        daysN: '{n} days',
        dayN: '{n} day',
        all: 'All',
        allTime: 'All time',
        abroad: 'Abroad',
        tabPhotos: 'Photos',
        tabTrips: 'Trips',
        tabStats: 'Footprint',
        tabToday: 'On this day',
        close: 'Close',
        clear: 'Clear',
        play: 'Play',
        pause: 'Pause',
        replay: 'Replay the years',
        story: 'Story',
        route: 'Route',
        next: 'Next',
        previous: 'Previous',
        exitStory: 'Exit story',
        onThisDay: 'On this day',
        yearsAgo: '{n} year ago',
        yearsAgoN: '{n} years ago',
        youWereIn: 'you were in {place}',
        inHistory: 'In history',
        nearYou: '{km} km from your photos in {place}',
        readMore: 'Wikipedia',
        noMemories: 'No photos from this day in earlier years.',
        noEvents: 'No events with a place today.',
        historyOff: 'World history is turned off in settings.',
        locate: 'Show on map',
        openOnMap: 'Open in Atlas',
        settings: 'Settings',
        library: 'Photos library',
        libraryHint: 'Leave empty to use the library Photos opens by default.',
        found: 'Found',
        use: 'Use',
        basemap: 'Map',
        basemapAuto: 'Night street map (OpenFreeMap): shops, landmarks, 3D buildings; outline map when offline',
        basemapOffline: 'Outline map only (nothing is fetched)',
        history: 'History on this day',
        historyHint: 'Fetch world events for today\'s date from Wikipedia. Only the date is sent.',
        home: 'Home',
        homeAuto: 'Found from your photos: {city}',
        homeFixed: 'Set by you: {city}',
        homeHere: 'Use the map centre as home',
        homeReset: 'Find it from my photos',
        awayKm: 'A trip starts this far from home',
        rebuild: 'Read the library again',
        rebuilding: 'Reading…',
        indexed: '{items} items, {located} with a place · read {when}',
        save: 'Save',
        loading: 'Opening the globe…',
        building: 'Reading your Photos library… the first time takes a few seconds.',
        permissionTitle: 'Atlas can\'t read your Photos library',
        permissionBody: 'macOS keeps the library private. Give DeepSeek Harness Full Disk Access in System Settings → Privacy & Security → Full Disk Access, then restart the app.',
        noLibraryTitle: 'No Photos library found',
        noLibraryBody: 'Enter the path of a .photoslibrary bundle below.',
        readFailedTitle: 'The library could not be read',
        retry: 'Try again',
        unavailable: 'The Atlas plugin is not answering. Refresh the page, or check that it is enabled.',
        libsFailed: 'The map engine failed to load.',
        noLocation: 'No location',
        video: 'Video',
        noOriginal: 'The original video is not on this Mac (iCloud keeps it).',
        labelsTitle: 'In this photo',
        filtered: '{n} shown',
        everything: 'Everything',
        yearsLabel: 'Years',
        topCities: 'Where you spent the most days',
        countriesTitle: 'Countries & regions',
        byYear: 'By year',
        coverage: '{p}% of the world\'s countries',
        longest: 'Longest trip',
        farthest: 'Farthest trip',
        newCities: '{n} new',
        tripTo: 'Trip',
        stopN: 'Stop {i} of {n}',
        homeLabel: 'Home',
        layers: 'Layers',
        layerArcs: 'Flight arcs',
        layerNight: 'Night side',
        layerCountries: 'Visited countries',
        layerHistory: 'History markers',
        searching: 'Searching…',
        noMatch: 'Nothing matches “{q}”.',
        tryLabels: 'Try: {words}',
        resultCount: '{n} photos · {q}',
        selection: 'Selected',
        empty: 'No photos with a location yet.',
        toolSearch: 'Searched photos',
        toolShow: 'Moved the map',
        toolTrips: 'Looked up trips',
        toolStats: 'Counted the footprint',
        toolToday: 'On this day',
        toolLook: 'Looked at photos',
        working: 'working…',
        failed: 'Failed',
        justNow: 'just now',
        minutesAgo: '{n} min ago',
        hoursAgo: '{n} h ago',
        daysAgo: '{n} d ago',
      },
      zh: {
        lang: 'zh',
        featured: '精选',
        allByTime: '全部 {n} 张，按时间',
        basemapNight: '夜景',
        basemapAmap: '高德',
        basemapSatellite: '卫星',
        basemapOfflineShort: '轮廓',
        basemapAmapLong: '高德：国内最详细（非官方图块接口，可能失效；国外用夜景地图）',
        basemapSatelliteLong: '卫星影像（Esri World Imagery，使用前请看它的条款）',
        basemapNightHint: '夜色下的 OpenStreetMap，有店铺、地标和 3D 建筑。',
        basemapAmapHint: '国内用高德（店铺、小区、地标，全中文），国外用夜景地图。非官方接口，可能随时失效。',
        basemapSatelliteHint: 'Esri 卫星影像，叠夜景地图的地名。使用前请看 Esri 的条款。',
        layerTerrain: '3D 地形',
        layerPlaces: '我去过的地方',
        layerNearby: '附近百科',
        nearbyHint: '放大后向维基百科查询地图中心附近的条目（会发送这个位置）。',
        title: '足迹',
        toolTitle: '足迹',
        searchPlaceholder: '搜照片：京都 2023、猫、海滩 视频……',
        photos: '{n} 张',
        photosShort: '{n}',
        places: '{n} 个地方',
        countriesN: '{n} 个国家和地区',
        citiesN: '{n} 座城市',
        tripsN: '{n} 次旅行',
        km: '{n} 公里',
        daysN: '{n} 天',
        dayN: '{n} 天',
        all: '全部',
        allTime: '全部年份',
        abroad: '出境',
        tabPhotos: '照片',
        tabTrips: '旅行',
        tabStats: '足迹',
        tabToday: '那年今天',
        close: '关闭',
        clear: '清除',
        play: '播放',
        pause: '暂停',
        replay: '回放这些年',
        story: '故事',
        route: '路线',
        next: '下一站',
        previous: '上一站',
        exitStory: '退出故事',
        onThisDay: '那年今天',
        yearsAgo: '{n} 年前',
        yearsAgoN: '{n} 年前',
        youWereIn: '你在{place}',
        inHistory: '历史上的今天',
        nearYou: '离你在{place}拍照的地方 {km} 公里',
        readMore: '维基百科',
        noMemories: '往年的今天没有照片。',
        noEvents: '今天没有带地点的历史事件。',
        historyOff: '已在设置里关闭“历史上的今天”。',
        locate: '在地图上看',
        openOnMap: '在足迹里看',
        settings: '设置',
        library: '照片图库',
        libraryHint: '留空就用“照片”App 默认打开的图库。',
        found: '找到的图库',
        use: '使用',
        basemap: '底图',
        basemapAuto: '夜景街道地图（OpenFreeMap）：店铺、地标、3D 建筑，离线时用轮廓地图',
        basemapOffline: '只用内置轮廓地图（不联网）',
        history: '历史上的今天',
        historyHint: '从维基百科取今天日期的历史事件，只发送日期。',
        home: '常住地',
        homeAuto: '从照片推断：{city}',
        homeFixed: '你设定的：{city}',
        homeHere: '把地图中心设为常住地',
        homeReset: '改回从照片推断',
        awayKm: '离家多远算旅行（公里）',
        rebuild: '重新读取图库',
        rebuilding: '读取中…',
        indexed: '{items} 项，{located} 项有地点 · {when}读取',
        save: '保存',
        loading: '正在打开地球…',
        building: '正在读取照片图库……第一次要几秒钟。',
        permissionTitle: '足迹读不到你的照片图库',
        permissionBody: 'macOS 保护着照片图库。请在“系统设置 → 隐私与安全性 → 完全磁盘访问权限”里给 DeepSeek Harness 打开，然后重启 App。',
        noLibraryTitle: '没找到照片图库',
        noLibraryBody: '在下面填入 .photoslibrary 图库的路径。',
        readFailedTitle: '图库读取失败',
        retry: '重试',
        unavailable: '足迹插件没有响应。刷新页面，或确认插件已启用。',
        libsFailed: '地图引擎没能加载。',
        noLocation: '没有地点',
        video: '视频',
        noOriginal: '原视频不在这台 Mac 上（在 iCloud 里）。',
        labelsTitle: '照片里有',
        filtered: '显示 {n} 张',
        everything: '全部',
        yearsLabel: '年份',
        topCities: '待得最久的地方',
        countriesTitle: '国家和地区',
        byYear: '逐年',
        coverage: '去过世界上 {p}% 的国家',
        longest: '最长的一次',
        farthest: '最远的一次',
        newCities: '新到 {n} 座',
        tripTo: '旅行',
        stopN: '第 {i} 站 / 共 {n} 站',
        homeLabel: '家',
        layers: '图层',
        layerArcs: '航线',
        layerNight: '夜幕',
        layerCountries: '去过的国家',
        layerHistory: '历史事件',
        searching: '搜索中…',
        noMatch: '没有找到“{q}”。',
        tryLabels: '可以试试：{words}',
        resultCount: '{n} 张 · {q}',
        selection: '选中',
        empty: '还没有带地点的照片。',
        toolSearch: '搜索了照片',
        toolShow: '移动了地图',
        toolTrips: '查了旅行',
        toolStats: '统计了足迹',
        toolToday: '那年今天',
        toolLook: '看了照片',
        working: '进行中…',
        failed: '失败',
        justNow: '刚刚',
        minutesAgo: '{n} 分钟前',
        hoursAgo: '{n} 小时前',
        daysAgo: '{n} 天前',
      },
    };

    function fallbackT(key, params) {
      const template = DICTIONARY.en[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
    }

    // --- small helpers ---------------------------------------------------------------

    const getJson = (url) => fetch(url, { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
    const postJson = (url, body) =>
      fetch(url, { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then((r) => (r.ok ? r.json() : null));
    const thumbUrl = (id) => `${ROUTE}/thumb/${encodeURIComponent(id)}`;
    const largeUrl = (id) => `${ROUTE}/large/${encodeURIComponent(id)}`;
    const originalUrl = (id) => `${ROUTE}/original/${encodeURIComponent(id)}`;

    /** `YYYY-MM-DD` of a photo in its own local time. */
    const localDay = (t, tz) => new Date((t + (tz ?? 0)) * 1000).toISOString().slice(0, 10);
    const localYear = (t, tz) => new Date((t + (tz ?? 0)) * 1000).getUTCFullYear();
    const fmtNum = (n) => {
      try {
        return Number(n).toLocaleString();
      } catch {
        return String(n);
      }
    };
    /** 29.8万 / 298K for big numbers. */
    const fmtCompact = (n, lang) => {
      try {
        return Number(n) >= 10000 ? new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n)) : fmtNum(n);
      } catch {
        return fmtNum(n);
      }
    };
    const flagOf = (cc) => (typeof cc === 'string' && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
    const placeOf = (p) => (p ? [p.city || p.province, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') : '');
    const dateRange = (a, b) => (a === b ? a : `${a} – ${b.slice(0, 4) === a.slice(0, 4) ? b.slice(5) : b}`);

    function fmtWhen(t, at, now = Date.now()) {
      const ms = Math.max(0, now - at);
      if (ms < 60_000) return t('justNow');
      if (ms < 3_600_000) return t('minutesAgo', { n: Math.round(ms / 60_000) });
      if (ms < 86_400_000) return t('hoursAgo', { n: Math.round(ms / 3_600_000) });
      return t('daysAgo', { n: Math.round(ms / 86_400_000) });
    }

    /** A cross-component channel: map commands from the tools and the chat cards. */
    const bus = {
      listeners: new Set(),
      pending: null,
      emit(cmd) {
        this.pending = { ...cmd, receivedAt: Date.now() };
        let taken = false;
        for (const fn of this.listeners) taken = fn(cmd) === true || taken;
        if (taken) this.pending = null;
      },
      on(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      },
      /** A command that arrived while no panel was open, if it is recent. */
      take() {
        const p = this.pending;
        this.pending = null;
        return p && Date.now() - p.receivedAt < 120_000 ? p : null;
      },
    };

    // --- styles ---------------------------------------------------------------------

    const CSS = `
.atl-root { position: relative; width: 100%; height: 100%; min-height: 360px; overflow: hidden; color: ${C.ink};
  background: radial-gradient(ellipse at 50% 55%, #0d1630 0%, #070b18 55%, #03050b 100%); font-size: 13px; }
.atl-stars { position: absolute; inset: 0; pointer-events: none; opacity: .7; background-repeat: repeat; }
.atl-map { position: absolute; inset: 0; }
.atl-map .maplibregl-canvas { outline: none; }
.atl-map .maplibregl-ctrl-attrib { background: rgba(10,13,22,.55) !important; color: ${C.faint}; font-size: 10px; }
.atl-map .maplibregl-ctrl-attrib a { color: ${C.muted}; }
.atl-map .maplibregl-ctrl-attrib-button { filter: invert(1) opacity(.6); }
.atl-glass { background: ${C.glass}; backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid ${C.line}; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
.atl-btn { appearance: none; border: 1px solid ${C.line}; background: rgba(255,255,255,.05); color: ${C.ink}; border-radius: 10px;
  height: 32px; padding: 0 11px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font: inherit; font-size: 12.5px; white-space: nowrap; }
.atl-btn:hover { background: rgba(255,255,255,.11); }
.atl-btn[data-on="true"] { background: rgba(255,181,71,.16); border-color: rgba(255,181,71,.45); color: ${C.amber}; }
.atl-btn.atl-icon { width: 32px; padding: 0; justify-content: center; }
.atl-btn:disabled { opacity: .45; cursor: default; }
.atl-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,.07);
  border: 1px solid ${C.line}; font-size: 12px; color: ${C.ink}; cursor: pointer; white-space: nowrap; }
.atl-chip:hover { background: rgba(255,255,255,.13); }
.atl-chip[data-on="true"] { background: rgba(90,209,255,.16); border-color: rgba(90,209,255,.45); color: ${C.cyan}; }
.atl-input { appearance: none; width: 100%; height: 34px; border-radius: 11px; border: 1px solid ${C.line}; background: rgba(0,0,0,.25);
  color: ${C.ink}; padding: 0 12px; font: inherit; font-size: 13px; outline: none; }
.atl-input:focus { border-color: rgba(90,209,255,.55); background: rgba(0,0,0,.35); }
.atl-input::placeholder { color: ${C.faint}; }
.atl-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
.atl-pin { cursor: pointer; }
.atl-quiet .atl-pin, .atl-quiet .atl-event { visibility: hidden; }
.atl-pin:hover { z-index: 5; }
/* MapLibre positions the marker element with transform; the motion lives on the inner body. */
.atl-pin-body { position: relative; transform-origin: 50% 100%; animation: atl-pop .38s cubic-bezier(.2,1.4,.4,1) both; }
.atl-pin-img { display: block; border-radius: 12px; border: 2px solid rgba(255,255,255,.92); background: #1a2233 center/cover no-repeat;
  box-shadow: 0 6px 18px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.25); transition: transform .18s ease; }
.atl-pin:hover .atl-pin-img { transform: scale(1.12) translateY(-3px); }
.atl-pin-tail { position: absolute; left: 50%; bottom: -6px; width: 10px; height: 10px; transform: translateX(-50%) rotate(45deg);
  background: rgba(255,255,255,.92); border-radius: 2px; z-index: -1; }
.atl-pin-cap { position: absolute; left: 50%; top: calc(100% + 9px); transform: translateX(-50%); white-space: nowrap; font-size: 11px; font-weight: 600;
  color: #fff; padding: 2px 7px; border-radius: 8px; background: rgba(8,11,20,.78); border: 1px solid rgba(255,255,255,.12); pointer-events: none;
  text-shadow: 0 1px 2px #000; letter-spacing: .2px; }
.atl-pin-badge { position: absolute; top: -8px; right: -9px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
  background: ${C.amber}; color: #1d1200; font-weight: 700; font-size: 11px; line-height: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.atl-pin[data-hl="true"] .atl-pin-img { border-color: ${C.cyan}; box-shadow: 0 0 0 3px rgba(90,209,255,.35), 0 6px 18px rgba(0,0,0,.55); }
.atl-pin[data-video="true"] .atl-pin-body::after { content: '▶'; position: absolute; left: 6px; bottom: 6px; font-size: 9px; color: #fff; text-shadow: 0 1px 3px #000; }
@keyframes atl-pop { from { transform: scale(.2) translateY(12px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
.atl-event { width: 11px; height: 11px; border-radius: 50%; background: ${C.violet}; border: 1.5px solid rgba(255,255,255,.9); cursor: pointer; opacity: .9;
  box-shadow: 0 0 0 0 rgba(184,146,255,.7); animation: atl-pulse 2.4s infinite; }
.atl-event[data-near="true"] { background: #ff8bd0; width: 14px; height: 14px; }
@keyframes atl-pulse { 0% { box-shadow: 0 0 0 0 rgba(184,146,255,.65); } 70% { box-shadow: 0 0 0 16px rgba(184,146,255,0); } 100% { box-shadow: 0 0 0 0 rgba(184,146,255,0); } }
.atl-home { width: 14px; height: 14px; border-radius: 50%; background: ${C.cyan}; border: 2px solid #fff; box-shadow: 0 0 14px ${C.cyan}; }
.atl-popup .maplibregl-popup-content { background: ${C.glassStrong}; color: ${C.ink}; border-radius: 14px; padding: 12px 14px; border: 1px solid ${C.line};
  box-shadow: 0 10px 30px rgba(0,0,0,.5); max-width: 300px; font-size: 12.5px; line-height: 1.55; }
.atl-popup .maplibregl-popup-tip { border-top-color: ${C.glassStrong} !important; border-bottom-color: ${C.glassStrong} !important; }
.atl-popup .maplibregl-popup-close-button { color: ${C.muted}; font-size: 16px; right: 4px; top: 2px; }
.atl-popup a { color: ${C.cyan}; }
.atl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 4px; }
.atl-tile { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #141b2a; cursor: pointer; }
.atl-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s ease; }
.atl-tile:hover img { transform: scale(1.06); }
.atl-tile[data-video="true"]::after { content: '▶'; position: absolute; left: 6px; bottom: 5px; font-size: 10px; color: #fff; text-shadow: 0 1px 3px #000; }
.atl-card { border-radius: 12px; border: 1px solid ${C.line}; background: rgba(255,255,255,.035); overflow: hidden; }
.atl-card:hover { background: rgba(255,255,255,.07); }
.atl-kb { animation: atl-kb 7s ease-out both; }
@keyframes atl-kb { from { transform: scale(1.0) translate(0,0); } to { transform: scale(1.14) translate(-2%, -2%); } }
.atl-fade { animation: atl-fade .5s ease both; }
@keyframes atl-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.atl-spin { width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.15); border-top-color: ${C.amber}; animation: atl-spin 1s linear infinite; }
@keyframes atl-spin { to { transform: rotate(360deg); } }
.atl-bar { transition: height .2s ease, background .2s ease; }
.atl-strip img { transition: transform .2s ease; }
.atl-strip img:hover { transform: translateY(-2px); }
`;
    function ensureCss() {
      if (typeof document === 'undefined' || document.getElementById('atl-css')) return;
      const el = document.createElement('style');
      el.id = 'atl-css';
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    /** A field of stars as a tiling data URL, drawn once. */
    let starsUrl = '';
    function stars() {
      if (starsUrl || typeof document === 'undefined') return starsUrl;
      try {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const g = c.getContext('2d');
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 260; i += 1) {
          const r = rnd() < 0.93 ? rnd() * 0.9 + 0.2 : rnd() * 1.4 + 0.8;
          g.fillStyle = `rgba(${200 + rnd() * 55},${210 + rnd() * 45},255,${0.25 + rnd() * 0.65})`;
          g.beginPath();
          g.arc(rnd() * 512, rnd() * 512, r, 0, Math.PI * 2);
          g.fill();
        }
        starsUrl = c.toDataURL();
      } catch {
        starsUrl = '';
      }
      return starsUrl;
    }

    // --- the map engine -----------------------------------------------------------------

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.appendChild(s);
      });
    }
    let libsPromise = null;
    /** MapLibre and Supercluster, loaded once from the plugin's own routes. */
    function ensureLibs() {
      if (libsPromise) return libsPromise;
      libsPromise = (async () => {
        if (!document.querySelector('link[data-atl-css]')) {
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = `${VENDOR}maplibre-gl.css`;
          l.setAttribute('data-atl-css', '1');
          document.head.appendChild(l);
        }
        // An AMD loader on the page would capture the UMD bundles; hide it while they load.
        const savedDefine = window.define;
        try {
          if (savedDefine !== undefined) window.define = undefined;
          if (!window.maplibregl) await loadScript(`${VENDOR}maplibre-gl.js`);
          if (!window.Supercluster) await loadScript(`${VENDOR}supercluster.min.js`);
        } finally {
          if (savedDefine !== undefined) window.define = savedDefine;
        }
        if (!window.maplibregl || !window.Supercluster) throw new Error('map libraries missing');
        return { maplibregl: window.maplibregl, Supercluster: window.Supercluster };
      })();
      libsPromise.catch(() => {
        libsPromise = null;
      });
      return libsPromise;
    }

    let countriesPromise = null;
    const loadCountries = () => (countriesPromise ??= getJson(`${VENDOR}countries.json`).catch(() => null));

    const styleCache = {};
    /** The basemap: OpenFreeMap's dark style with names in the UI language, else a bundled outline map. */
    // --- colours: a light style turned into a night one ---------------------------

    /** `[h, s, l, a]` (h in degrees, s/l/a 0–1) of a CSS colour string, or null. */
    function parseColor(str) {
      if (typeof str !== 'string') return null;
      const v = str.trim().toLowerCase();
      let r;
      let g;
      let b;
      let a = 1;
      let m;
      if ((m = v.match(/^#([0-9a-f]{3,8})$/))) {
        let hex = m[1];
        if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
        if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
      } else if ((m = v.match(/^rgba?\(([^)]+)\)$/))) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        [r, g, b] = p;
        if (p.length > 3) a = p[3];
      } else if ((m = v.match(/^hsla?\(([^)]+)\)$/))) {
        const p = m[1].replace(/%/g, '').split(/[\s,/]+/).filter(Boolean).map(Number);
        return [p[0], p[1] / 100, p[2] / 100, p.length > 3 ? p[3] : 1];
      } else return null;
      if (![r, g, b].every(Number.isFinite)) return null;
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0;
      let sat = 0;
      if (max !== min) {
        const d = max - min;
        sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
      }
      return [h, sat, l, a];
    }
    const hsla = ([h, sat, l, a]) => `hsla(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%, ${Math.round(a * 100) / 100})`;

    /** The night version of one colour of a paint property. */
    function nightColor(hsl, prop) {
      const [h, sat, l, a] = hsl;
      const water = h >= 185 && h <= 235 && sat > 0.25;
      if (prop === 'text-color') return hsla([h, sat * 0.55, Math.max(0.62, 0.9 - l * 0.35), a]);
      if (prop === 'text-halo-color') return hsla([220, 0.3, 0.06, Math.min(a, 0.85)]);
      if (prop === 'line-color') return hsla([water ? 212 : h, sat * 0.45, water ? 0.2 : 0.17 + l * 0.2, a]);
      if (prop === 'fill-extrusion-color') return hsla([220, 0.12, 0.16 + (1 - l) * 0.1, a]);
      if (water) return hsla([214, 0.42, 0.075, a]);
      return hsla([h, sat * 0.35, 0.075 + (1 - l) * 0.2, a]);
    }

    /** Recolour every literal colour in a paint value, expressions included. */
    function recolor(value, prop) {
      if (typeof value === 'string') {
        const c = parseColor(value);
        return c ? nightColor(c, prop) : value;
      }
      if (Array.isArray(value)) return value.map((v) => recolor(v, prop));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, recolor(v, prop)]));
      return value;
    }

    /** Liberty, at night, with names in the UI language. */
    function nightStyle(style, lang) {
      const names = lang === 'zh' ? ['name:zh-Hans', 'name:zh', 'name:ja', 'name_int', 'name'] : ['name:en', 'name_int', 'name'];
      for (const layer of style.layers) {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field'] !== undefined) {
          // Chinese, then Japanese kanji (readable to a Chinese reader), then Latin.
          layer.layout['text-field'] = ['coalesce', ...names.map((n) => ['get', n])];
        }
        if (layer.type === 'raster') {
          layer.paint = { ...(layer.paint ?? {}), 'raster-brightness-max': 0.32, 'raster-saturation': -0.35, 'raster-contrast': 0.1 };
          continue;
        }
        if (!layer.paint) continue;
        for (const [prop, v] of Object.entries(layer.paint)) if (/color$/.test(prop)) layer.paint[prop] = recolor(v, prop);
        if (layer.type === 'background') layer.paint['background-color'] = '#0b1220';
      }
      return style;
    }

    /** Layers drawn on top of the vector map for one basemap. */
    function addBasemapLayers(style, basemap) {
      if (basemap === 'amap') {
        // China in detail: Amap's map, darkened. Abroad its tiles are blank, and blank tiles are made
        // transparent (see the atlas-amap protocol) so the world map shows there.
        style.sources['atl-amap'] = { type: 'raster', tiles: ['atlas-amap://{z}/{x}/{y}'], tileSize: 256, minzoom: 3, maxzoom: 18, bounds: [73, 15, 136, 54], attribution: '© 高德地图 AutoNavi' };
        style.layers.push({
          id: 'atl-amap',
          type: 'raster',
          source: 'atl-amap',
          minzoom: 3,
          paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 4.5, 1], 'raster-brightness-min': 1, 'raster-brightness-max': 0, 'raster-hue-rotate': 180, 'raster-saturation': -0.25, 'raster-contrast': 0.15, 'raster-fade-duration': 150 },
        });
        style.metadata = { ...(style.metadata ?? {}), atlasGcj: true };
      }
      if (basemap === 'satellite') {
        // Imagery under the night map's labels, roads and borders.
        style.sources['atl-sat'] = { type: 'raster', tiles: [ESRI_TILES], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' };
        const first = style.layers.findIndex((l) => l.type === 'line' || l.type === 'symbol');
        style.layers = style.layers.filter((l) => l.type !== 'fill' && l.type !== 'fill-extrusion' && l.type !== 'raster');
        style.layers.splice(Math.max(1, first < 0 ? 1 : Math.min(first, style.layers.length)), 0, { id: 'atl-sat', type: 'raster', source: 'atl-sat', paint: { 'raster-saturation': -0.1, 'raster-brightness-max': 0.85 } });
        for (const l of style.layers) if (l.type === 'line' && l.paint) l.paint['line-opacity'] = 0.45;
      }
      return style;
    }

    let amapProtocol = false;
    // A 1×1 transparent PNG, for Amap's blank tiles outside China.
    const CLEAR_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    function ensureAmapProtocol(maplibregl) {
      if (amapProtocol || typeof maplibregl.addProtocol !== 'function') return;
      amapProtocol = true;
      maplibregl.addProtocol('atlas-amap', async (params, abort) => {
        const [z, x, y] = params.url.replace('atlas-amap://', '').split('/').map(Number);
        const url = AMAP_TILES.replace('{s}', String(1 + ((x + y) % 4))).replace('{x}', x).replace('{y}', y).replace('{z}', z);
        const res = await fetch(url, { signal: abort.signal });
        if (!res.ok) throw new Error(`amap ${res.status}`);
        const buf = await res.arrayBuffer();
        // Amap answers outside China with one small blank tile.
        return { data: buf.byteLength < 400 ? CLEAR_PNG.buffer.slice(0) : buf };
      });
    }

    /** The basemap: 'night' (OpenFreeMap liberty at night), 'amap', 'satellite' or 'offline'. */
    async function loadStyle(basemap, lang) {
      const mode = basemap === 'auto' || !basemap ? 'night' : basemap;
      const key = `${mode}:${lang}`;
      if (styleCache[key]) return JSON.parse(JSON.stringify(styleCache[key]));
      let style = null;
      if (mode !== 'offline') {
        try {
          const res = await fetch(STYLE_URL, { signal: AbortSignal.timeout(8000) });
          if (res.ok) style = await res.json();
        } catch {
          style = null;
        }
      }
      if (style && Array.isArray(style.layers)) {
        style = addBasemapLayers(nightStyle(style, lang), mode);
        style.metadata = { ...(style.metadata ?? {}), atlasOnline: true, atlasBasemap: mode };
      } else style = offlineStyle();
      style.projection = { type: 'globe' };
      styleCache[key] = JSON.parse(JSON.stringify(style));
      return style;
    }

    // --- China's map datum ---------------------------------------------------------
    // Maps of China (Amap included) are drawn in GCJ-02, offset by a few hundred metres from GPS.
    // With the Amap basemap, everything Atlas draws inside China is shifted the same way.

    let chinaPolygons = null;
    function setChina(countries) {
      const f = (countries?.features ?? []).find((x) => x.properties?.iso === 'CN');
      chinaPolygons = f ? f.geometry.coordinates : null;
    }
    function inChina(lng, lat) {
      if (!chinaPolygons || lng < 73 || lng > 136 || lat < 3 || lat > 54) return false;
      for (const poly of chinaPolygons) {
        let inside = false;
        const ring = poly[0];
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return true;
      }
      // Hong Kong and Macau are too small for the outline at this scale.
      return lng > 113.4 && lng < 114.5 && lat > 22.08 && lat < 22.6;
    }
    function toGcj(lng, lat) {
      if (!inChina(lng, lat)) return [lng, lat];
      const A = 6378245.0;
      const EE = 0.00669342162296594323;
      const x = lng - 105;
      const y = lat - 35;
      const PI = Math.PI;
      let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      dLat += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
      dLat += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
      dLat += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
      let dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      dLng += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
      dLng += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
      dLng += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
      const rad = (lat / 180) * PI;
      let magic = Math.sin(rad);
      magic = 1 - EE * magic * magic;
      const sq = Math.sqrt(magic);
      dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * PI);
      dLng = (dLng * 180) / ((A / sq) * Math.cos(rad) * PI);
      return [lng + dLng, lat + dLat];
    }
    /** GPS from a GCJ-02 point (two rounds of the inverse; well under a metre). */
    function fromGcj(lng, lat) {
      let g = [lng, lat];
      for (let i = 0; i < 2; i += 1) {
        const back = toGcj(g[0], g[1]);
        g = [g[0] - (back[0] - lng), g[1] - (back[1] - lat)];
      }
      return g;
    }

    /** The bundled outline map: land from Natural Earth, no tiles, no labels. */
    function offlineStyle() {
      return {
        version: 8,
        metadata: { atlasOnline: false },
        projection: { type: 'globe' },
        sources: { 'atl-land': { type: 'geojson', data: `${VENDOR}countries.json` } },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#0a1526' } },
          { id: 'atl-land', type: 'fill', source: 'atl-land', paint: { 'fill-color': '#18233a', 'fill-opacity': 1 } },
          { id: 'atl-land-line', type: 'line', source: 'atl-land', paint: { 'line-color': '#2b3a5c', 'line-width': 0.6 } },
        ],
      };
    }

    /** Sun position and night polygon (as in lib/geo.mjs). */
    function nightPolygon(date = new Date()) {
      const rad = (d) => (d * Math.PI) / 180;
      const deg = (r) => (r * 180) / Math.PI;
      const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
      const g = rad((357.529 + 0.98560028 * d) % 360);
      const q = (280.459 + 0.98564736 * d) % 360;
      const L = rad(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
      const e = rad(23.439 - 0.00000036 * d);
      const decl = Math.asin(Math.sin(e) * Math.sin(L));
      const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
      const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
      let sunLng = deg(ra) - gmst * 15;
      sunLng = ((sunLng + 540) % 360) - 180;
      const tanDecl = Math.tan(decl);
      const pts = [];
      for (let lng = -180; lng <= 180; lng += 3) {
        const ha = rad(lng - sunLng);
        pts.push([lng, deg(Math.atan(-Math.cos(ha) / (Math.abs(tanDecl) < 1e-6 ? 1e-6 : tanDecl)))]);
      }
      const pole = deg(decl) > 0 ? -90 : 90;
      return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, [180, pole], [-180, pole], pts[0]]] } };
    }

    /** Fraction along a path (in Mercator length, as `line-progress` measures) at each node index. */
    function nodeFractions(path, nodes) {
      const merc = path.map(([lng, lat]) => {
        const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
        return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
      });
      const cum = [0];
      for (let i = 1; i < merc.length; i += 1) cum.push(cum[i - 1] + Math.hypot(merc[i][0] - merc[i - 1][0], merc[i][1] - merc[i - 1][1]));
      const total = cum[cum.length - 1] || 1;
      return (nodes ?? []).map((i) => cum[Math.min(i, cum.length - 1)] / total);
    }

    const angularKm = (a, b) => {
      const rad = Math.PI / 180;
      const x = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
    };

    /**
     * The globe: a MapLibre map with the footprint layers, thumbnail pins and
     * camera moves. Imperative; the panel drives it.
     */
    function createGlobe(el, { maplibregl, Supercluster, style, home, onPick, onEvent, onUser, onPlace, onView, lang }) {
      ensureAmapProtocol(maplibregl);
      // With the Amap basemap, what Atlas draws in China is shifted to its datum.
      const gcj = style?.metadata?.atlasGcj === true;
      const P = (lng, lat) => (gcj ? toGcj(lng, lat) : [lng, lat]);
      const unP = (lng, lat) => (gcj ? fromGcj(lng, lat) : [lng, lat]);
      const Pp = (path) => (gcj ? path.map(([lng, lat]) => P(lng, lat)) : path);
      const map = new maplibregl.Map({
        container: el,
        style,
        center: home ? P(home.lng, home.lat) : [105, 30],
        zoom: 1.55,
        minZoom: 0.6,
        maxZoom: 18.5,
        maxPitch: 70,
        attributionControl: { compact: true },
        fadeDuration: 120,
        localIdeographFontFamily: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
      });
      const st = {
        ready: false,
        index: null,
        pins: new Map(),
        points: [],
        highlight: null,
        events: [],
        eventMarkers: [],
        homeMarker: null,
        layers: { arcs: true, night: true, countries: true, history: true, terrain: true, places: true, nearby: true },
        cities: [],
        visited: [],
        trips: [],
        activeTrip: null,
        progressAnim: 0,
        lastUser: Date.now(),
        spinning: true,
        frozen: false,
        raf: 0,
        destroyed: false,
        queue: [],
      };
      const whenReady = (fn) => (st.ready ? fn() : st.queue.push(fn));
      const setData = (id, data) => {
        const src = map.getSource(id);
        if (src) src.setData(data);
      };
      const firstSymbol = () => map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

      // What the custom layers show, kept so they can be rebuilt after a style switch.
      const empty = { type: 'FeatureCollection', features: [] };
      const data = { pts: empty, arcs: empty, active: empty, visited: [], places: empty, wiki: empty };
      // The style's own font, for the labels Atlas adds (none in the offline map).
      const fontOf = () => map.getStyle().layers.find((l) => l.type === 'symbol' && l.layout?.['text-font'])?.layout['text-font'] ?? null;
      const addLayers = () => {
        if (map.getSource('atl-pts')) return;
        try {
          map.setProjection({ type: 'globe' });
        } catch {
          // Older engines without the call keep the style's projection.
        }
        try {
          map.setSky({ 'sky-color': '#0b1430', 'horizon-color': '#28406e', 'fog-color': '#0b1430', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.4, 'fog-ground-blend': 0.4, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.9, 7, 0] });
        } catch {
          // No atmosphere.
        }
        const before = firstSymbol();
        const visited = ['in', ['get', 'iso'], ['literal', data.visited]];
        map.addSource('atl-night', { type: 'geojson', data: nightPolygon() });
        map.addLayer({ id: 'atl-night', type: 'fill', source: 'atl-night', paint: { 'fill-color': '#000611', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.38, 5, 0.25, 7, 0] } }, before);
        map.addSource('atl-countries', { type: 'geojson', data: `${VENDOR}countries.json` });
        map.addLayer({ id: 'atl-visited', type: 'fill', source: 'atl-countries', filter: visited, paint: { 'fill-color': C.amber, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.16, 4, 0.1, 6, 0] } }, before);
        map.addLayer({ id: 'atl-visited-line', type: 'line', source: 'atl-countries', filter: visited, paint: { 'line-color': C.amber, 'line-width': 1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 5, 0.25, 7, 0] } }, before);
        map.addSource('atl-arcs', { type: 'geojson', data: data.arcs });
        map.addLayer({ id: 'atl-arcs-glow', type: 'line', source: 'atl-arcs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'abroad'], C.cyan, '#7fb4ff'], 'line-width': 5, 'line-blur': 5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.22, 6, 0.08] } });
        map.addLayer({ id: 'atl-arcs', type: 'line', source: 'atl-arcs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'abroad'], C.cyan, '#7fb4ff'], 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 6, 1.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 6, 0.25, 10, 0.12] } });
        map.addSource('atl-active', { type: 'geojson', lineMetrics: true, data: data.active });
        map.addLayer({ id: 'atl-active-glow', type: 'line', source: 'atl-active', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 9, 'line-blur': 7, 'line-gradient': progressGradient(st.progress ?? 1, 0.55) } });
        map.addLayer({ id: 'atl-active', type: 'line', source: 'atl-active', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 2.6, 'line-gradient': progressGradient(st.progress ?? 1, 1) } });
        map.addSource('atl-pts', { type: 'geojson', data: data.pts });
        map.addLayer({
          id: 'atl-heat',
          type: 'heatmap',
          source: 'atl-pts',
          maxzoom: 12,
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 6, 1.4, 11, 2.5],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 3, 10, 7, 18, 11, 26],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,120,20,0)', 0.15, 'rgba(255,110,20,0.45)', 0.4, 'rgba(255,150,40,0.75)', 0.7, 'rgba(255,200,90,0.9)', 1, 'rgba(255,245,210,1)'],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.95, 9, 0.6, 12, 0],
          },
        });
        map.addLayer({ id: 'atl-dots', type: 'circle', source: 'atl-pts', minzoom: 9, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 16, 4], 'circle-color': C.amber, 'circle-opacity': 0.85, 'circle-stroke-color': '#2a1600', 'circle-stroke-width': 0.6 } });
        const online = style?.metadata?.atlasOnline === true;
        const font = fontOf();
        if (online) {
          // Mountains: elevation for 3D terrain, and shading for the night map.
          map.addSource('atl-dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Terrain: Mapzen, AWS Open Data' });
          map.addSource('atl-dem-shade', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15 });
          map.addLayer({ id: 'atl-hillshade', type: 'hillshade', source: 'atl-dem-shade', minzoom: 4, paint: { 'hillshade-shadow-color': '#02040a', 'hillshade-highlight-color': 'rgba(170,195,240,0.6)', 'hillshade-accent-color': '#16223a', 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 10, 0.6, 15, 0.4] } }, map.getLayer('atl-amap') ? 'atl-amap' : before);
        }
        // Places you have been: venues and landmarks Photos named in your photos.
        map.addSource('atl-places', { type: 'geojson', data: data.places });
        map.addLayer({ id: 'atl-places-dot', type: 'circle', source: 'atl-places', minzoom: 10, filter: ['any', ['>=', ['zoom'], 13], ['>=', ['get', 'photos'], 20]], paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'photos'], 2, 3.5, 100, 7, 1000, 10], 'circle-color': 'rgba(255,181,71,0.25)', 'circle-stroke-color': C.amber, 'circle-stroke-width': 1.6 } });
        if (font) {
          map.addLayer({
            id: 'atl-places-label',
            type: 'symbol',
            source: 'atl-places',
            minzoom: 11,
            filter: ['any', ['>=', ['zoom'], 13.5], ['>=', ['get', 'photos'], 15]],
            layout: { 'text-field': ['get', 'label'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['get', 'photos'], 2, 11.5, 200, 14], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'symbol-sort-key': ['-', 0, ['get', 'photos']], 'text-optional': true },
            paint: { 'text-color': '#ffd28a', 'text-halo-color': 'rgba(8,10,18,0.92)', 'text-halo-width': 1.6 },
          });
        }
        // What Wikipedia knows around the centre of the map, when zoomed in.
        map.addSource('atl-wiki', { type: 'geojson', data: data.wiki });
        map.addLayer({ id: 'atl-wiki-dot', type: 'circle', source: 'atl-wiki', minzoom: 11, paint: { 'circle-radius': 5, 'circle-color': C.violet, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2, 'circle-opacity': 0.9 } });
        if (font) {
          map.addLayer({ id: 'atl-wiki-label', type: 'symbol', source: 'atl-wiki', minzoom: 13, layout: { 'text-field': ['get', 'title'], 'text-font': font, 'text-size': 11.5, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-max-width': 8, 'text-optional': true }, paint: { 'text-color': '#d9c6ff', 'text-halo-color': 'rgba(8,10,18,0.92)', 'text-halo-width': 1.5 } });
        }
        for (const id of ['atl-places-dot', 'atl-wiki-dot']) {
          map.on('click', id, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            if (id === 'atl-places-dot') onPlace?.({ ...f.properties });
            else onEvent?.({ wiki: true, ...f.properties, lng: Number(f.properties.lng), lat: Number(f.properties.lat) });
          });
          map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
        }
        st.ready = true;
        applyLayers();
        for (const fn of st.queue.splice(0)) fn();
        refreshPins();
      };
      // `style.load` does not wait for tiles, and fires again after a style switch.
      map.on('style.load', addLayers);
      if (map.isStyleLoaded()) addLayers();

      // Street tiles that keep failing (offline, blocked): switch to the bundled outline map.
      let tileErrors = 0;
      let tilesOk = false;
      map.on('error', (e) => {
        if (e?.sourceId && e.sourceId.startsWith('atl-')) return;
        tileErrors += 1;
      });
      map.on('sourcedata', (e) => {
        if (e?.tile && e.sourceId && !e.sourceId.startsWith('atl-')) tilesOk = true;
      });
      const fallbackTimer = setTimeout(() => {
        if (st.destroyed || tilesOk || tileErrors < 3 || !style?.metadata?.atlasOnline) return;
        st.ready = false;
        map.setStyle(offlineStyle());
      }, 12_000);

      const progressGradient = (p, alpha) => {
        const a = `rgba(255,214,120,${alpha})`;
        const b = `rgba(90,209,255,${alpha})`;
        const none = 'rgba(0,0,0,0)';
        if (p <= 0.0005) return ['interpolate', ['linear'], ['line-progress'], 0, none, 1, none];
        if (p >= 0.999) return ['interpolate', ['linear'], ['line-progress'], 0, a, 1, b];
        return ['interpolate', ['linear'], ['line-progress'], 0, a, p, b, Math.min(0.9999, p + 0.0005), none, 1, none];
      };

      // --- pins ---
      const pinSize = (count) => (count <= 1 ? 46 : Math.min(70, 48 + Math.log2(count) * 3));
      const makePin = (props) => {
        const el = document.createElement('div');
        el.className = 'atl-pin';
        const body = document.createElement('div');
        body.className = 'atl-pin-body';
        el.appendChild(body);
        const size = pinSize(props.point_count ?? 1);
        const img = document.createElement('div');
        img.className = 'atl-pin-img';
        img.style.width = `${size}px`;
        img.style.height = `${size}px`;
        img.style.backgroundImage = `url("${thumbUrl(props.id)}")`;
        body.appendChild(img);
        const tail = document.createElement('div');
        tail.className = 'atl-pin-tail';
        body.appendChild(tail);
        if ((props.point_count ?? 1) > 1) {
          const badge = document.createElement('div');
          badge.className = 'atl-pin-badge';
          badge.textContent = props.point_count_abbreviated ?? String(props.point_count);
          body.appendChild(badge);
        }
        // Where and when, under the photo.
        const cap = captionOf(props);
        if (cap) {
          const c = document.createElement('div');
          c.className = 'atl-pin-cap';
          c.textContent = cap;
          body.appendChild(c);
        }
        if (props.v) el.setAttribute('data-video', 'true');
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pick(el.__atl);
        });
        return el;
      };
      const yearsOf = (a, b) => {
        const ya = new Date(a * 1000).getUTCFullYear();
        const yb = new Date(b * 1000).getUTCFullYear();
        return ya === yb ? String(ya) : `${ya}–${String(yb).slice(2)}`;
      };
      const captionOf = (props) => {
        const z = map.getZoom();
        if (z < 2.2 || z > 15.5 || props.cap === false) return '';
        const t0 = props.t0 ?? props.t;
        const t1 = props.t1 ?? props.t;
        // Inside a city its name says nothing: the date does.
        if (z >= 12.5 && t0) {
          const day = (t) => new Date(t * 1000).toISOString().slice(0, 10).replace(/-/g, '.');
          const a = day(t0);
          const b = day(t1);
          return a === b ? a : a.slice(0, 4) === b.slice(0, 4) ? `${a} – ${b.slice(5)}` : `${a.slice(0, 7)} – ${b.slice(0, 7)}`;
        }
        const city = st.cities[props.ci] ?? '';
        const when = t0 ? yearsOf(t0, t1 ?? t0) : '';
        return [city, when].filter(Boolean).join(' · ');
      };
      const pick = (feature) => {
        if (!feature || !st.index) return;
        st.lastUser = Date.now();
        const [lng, lat] = feature.geometry.coordinates;
        if (feature.properties.cluster) {
          const id = feature.properties.cluster_id;
          let leaves = [];
          try {
            leaves = st.index.getLeaves(id, 2000).map((f) => f.properties);
          } catch {
            leaves = [];
          }
          let zoom = map.getZoom() + 2;
          try {
            zoom = Math.min(16, st.index.getClusterExpansionZoom(id) + 0.3);
          } catch {
            // Keep the guess.
          }
          if (zoom > map.getZoom() + 0.5) map.flyTo({ center: [lng, lat], zoom, duration: 1400, essential: true });
          onPick?.({ ids: leaves.sort((a, b) => a.t - b.t).map((p) => p.id), center: { lat, lng }, title: st.cities[feature.properties.ci] ?? '' });
        } else {
          if (map.getZoom() < 12) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), duration: 1400, essential: true });
          onPick?.({ ids: [feature.properties.id], center: { lat, lng }, focus: feature.properties.id });
        }
      };
      let pinTimer = 0;
      const schedulePins = () => {
        if (pinTimer) return;
        pinTimer = setTimeout(() => {
          pinTimer = 0;
          refreshPins();
        }, 140);
      };
      const refreshPins = () => {
        if (!st.ready || !st.index || st.destroyed) return;
        const zoom = map.getZoom();
        // One level deeper than the camera: the globe shows more than a flat map at the same zoom.
        const z = Math.max(0, Math.min(17, Math.floor(zoom) + 1));
        let bbox = [-180, -85, 180, 85];
        if (zoom >= 3.2) {
          const b = map.getBounds();
          let w = b.getWest();
          let e = b.getEast();
          if (e - w >= 360) {
            w = -180;
            e = 180;
          }
          bbox = [Math.max(-180, w), Math.max(-85, b.getSouth()), Math.min(180, e), Math.min(85, b.getNorth())];
        }
        let features = [];
        try {
          features = st.index.getClusters(bbox, z);
        } catch {
          features = [];
        }
        const c = map.getCenter();
        const center = { lat: c.lat, lng: c.lng };
        // On the globe, only what faces the camera.
        const limitKm = zoom < 2.5 ? 6500 : zoom < 4 ? 4500 : Infinity;
        features = features.filter((f) => limitKm === Infinity || angularKm(center, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }) < limitKm);
        features.sort((a, b) => (b.properties.point_count ?? 1) - (a.properties.point_count ?? 1));
        const max = zoom < 3 ? 18 : zoom < 6 ? 36 : zoom < 13 ? 44 : 64;
        features = features.slice(0, max);
        // Captions only on the biggest few, so they do not pile up.
        const captioned = new Set(features.slice(0, 8).map((f) => String(f.properties.id)));
        const keep = new Set();
        for (const f of features) {
          f.properties.cap = captioned.has(String(f.properties.id));
          const key = String(f.properties.id);
          keep.add(key);
          let pin = st.pins.get(key);
          const count = f.properties.point_count ?? 1;
          const cap = captionOf(f.properties);
          if (pin && (pin.count !== count || pin.cap !== cap)) {
            pin.marker.remove();
            st.pins.delete(key);
            pin = undefined;
          }
          if (!pin) {
            const el = makePin(f.properties);
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(f.geometry.coordinates).addTo(map);
            pin = { marker, el, count, cap };
            st.pins.set(key, pin);
          } else pin.marker.setLngLat(f.geometry.coordinates);
          pin.el.__atl = f;
          pin.el.setAttribute('data-hl', st.highlight && st.highlight.has(key) ? 'true' : 'false');
        }
        for (const [key, pin] of st.pins) {
          if (keep.has(key)) continue;
          pin.marker.remove();
          st.pins.delete(key);
        }
      };
      map.on('move', schedulePins);
      map.on('moveend', refreshPins);
      // The panel looks up what is around the centre once the camera rests.
      map.on('moveend', () => {
        if (st.destroyed || !st.ready) return;
        const c = map.getCenter();
        const [lng, lat] = unP(c.lng, c.lat);
        const b = map.getBounds();
        const radiusKm = angularKm({ lat: c.lat, lng: c.lng }, { lat: b.getNorth(), lng: b.getEast() });
        onView?.({ lat, lng, zoom: map.getZoom(), radiusKm });
      });

      // --- the user is in charge after any touch ---
      const touched = () => {
        st.lastUser = Date.now();
        onUser?.();
      };
      for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragstart']) map.on(ev, touched);

      // --- slow spin while idle and far out ---
      let lastFrame = 0;
      const spin = (now) => {
        if (st.destroyed) return;
        st.raf = requestAnimationFrame(spin);
        if (!st.ready || !st.spinning || st.frozen) return;
        if (now - lastFrame < 33) return;
        const dt = lastFrame ? Math.min(100, now - lastFrame) : 33;
        lastFrame = now;
        if (Date.now() - st.lastUser < 9000 || map.isMoving() || map.getZoom() > 3.2) return;
        const c = map.getCenter();
        map.setCenter([c.lng + dt * 0.0016, c.lat]);
      };
      st.raf = requestAnimationFrame(spin);

      const nightTimer = setInterval(() => st.ready && setData('atl-night', nightPolygon()), 5 * 60_000);

      const applyLayers = () => {
        if (!st.ready) return;
        const vis = (on) => (on ? 'visible' : 'none');
        // The story shows only its own route.
        map.setLayoutProperty('atl-arcs', 'visibility', vis(st.layers.arcs && !st.quiet));
        map.setLayoutProperty('atl-arcs-glow', 'visibility', vis(st.layers.arcs && !st.quiet));
        map.setLayoutProperty('atl-night', 'visibility', vis(st.layers.night));
        map.setLayoutProperty('atl-visited', 'visibility', vis(st.layers.countries));
        map.setLayoutProperty('atl-visited-line', 'visibility', vis(st.layers.countries));
        for (const m of st.eventMarkers) m.getElement().style.display = st.layers.history ? '' : 'none';
        for (const id of ['atl-places-dot', 'atl-places-label']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(st.layers.places && !st.quiet));
        for (const id of ['atl-wiki-dot', 'atl-wiki-label']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(st.layers.nearby && !st.quiet));
        if (map.getSource('atl-dem')) {
          try {
            map.setTerrain(st.layers.terrain ? { source: 'atl-dem', exaggeration: 1.35 } : null);
          } catch {
            // No terrain on this engine.
          }
        }
      };

      const fitPadding = () => {
        const w = el.clientWidth;
        const side = w > 900 ? 420 : 40;
        return { top: 90, bottom: 150, left: 60, right: side };
      };

      let progressRaf = 0;
      const api = {
        map,
        debug: () => ({ ready: st.ready, pins: st.pins.size, points: st.points.length, zoom: map.getZoom(), clusters: st.index ? st.index.getClusters([-180, -85, 180, 85], Math.floor(map.getZoom())).length : -1 }),
        setPoints(points, cities) {
          st.points = points;
          if (Array.isArray(cities)) st.cities = cities;
          const features = points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: P(p.lng, p.lat) }, properties: { id: p.id, s: p.s, t: p.t, v: p.v, ci: p.ci } }));
          st.index = new Supercluster({
            radius: 56,
            maxZoom: 17,
            minPoints: 2,
            map: (p) => ({ id: p.id, s: p.s, t: p.t, t0: p.t, t1: p.t, v: p.v, ci: p.ci }),
            reduce: (acc, p) => {
              // The cover is the best photo; the caption its city and the cluster's years.
              if (p.s > acc.s) {
                acc.s = p.s;
                acc.id = p.id;
                acc.v = p.v;
                acc.ci = p.ci;
              }
              if (p.t0 < acc.t0) acc.t0 = p.t0;
              if (p.t1 > acc.t1) acc.t1 = p.t1;
            },
          });
          st.index.load(features);
          data.pts = { type: 'FeatureCollection', features };
          whenReady(() => {
            setData('atl-pts', data.pts);
            refreshPins();
          });
        },
        setHighlight(ids) {
          st.highlight = ids && ids.length ? new Set(ids) : null;
          refreshPins();
        },
        setVisited(ccs) {
          st.visited = ccs;
          data.visited = ccs;
          whenReady(() => {
            const f = ['in', ['get', 'iso'], ['literal', ccs]];
            map.setFilter('atl-visited', f);
            map.setFilter('atl-visited-line', f);
          });
        },
        setTrips(trips) {
          st.trips = trips;
          data.arcs = {
            type: 'FeatureCollection',
            features: trips.filter((t) => Array.isArray(t.path) && t.path.length > 1).map((t) => ({ type: 'Feature', properties: { id: t.id, abroad: t.abroad === true }, geometry: { type: 'LineString', coordinates: Pp(t.path) } })),
          };
          whenReady(() => setData('atl-arcs', data.arcs));
        },
        /** Draw one trip's route, filled in up to `progress` (0–1). */
        setActiveTrip(trip, progress = 1) {
          st.activeTrip = trip;
          cancelAnimationFrame(progressRaf);
          data.active = trip ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Pp(trip.path) } } : empty;
          st.progress = progress;
          whenReady(() => {
            setData('atl-active', data.active);
            api.setProgress(progress);
          });
        },
        setProgress(p) {
          if (!st.ready) return;
          st.progress = p;
          map.setPaintProperty('atl-active', 'line-gradient', progressGradient(p, 1));
          map.setPaintProperty('atl-active-glow', 'line-gradient', progressGradient(p, 0.55));
        },
        animateProgress(from, to, ms) {
          cancelAnimationFrame(progressRaf);
          const t0 = performance.now();
          const step = (now) => {
            const f = Math.min(1, (now - t0) / ms);
            const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
            api.setProgress(from + (to - from) * e);
            if (f < 1) progressRaf = requestAnimationFrame(step);
          };
          progressRaf = requestAnimationFrame(step);
        },
        setEvents(events) {
          for (const m of st.eventMarkers) m.remove();
          st.eventMarkers = [];
          st.events = events;
          for (const e of events) {
            if (e.lat === null || e.lat === undefined) continue;
            const dot = document.createElement('div');
            dot.className = 'atl-event';
            if (e.near?.close) dot.setAttribute('data-near', 'true');
            dot.title = `${e.year} · ${e.title}`;
            dot.addEventListener('click', (ev) => {
              ev.stopPropagation();
              onEvent?.(e);
            });
            const m = new maplibregl.Marker({ element: dot }).setLngLat(P(e.lng, e.lat)).addTo(map);
            if (!st.layers.history) dot.style.display = 'none';
            st.eventMarkers.push(m);
          }
        },
        setHome(h) {
          st.homeMarker?.remove();
          st.homeMarker = null;
          if (!h) return;
          const dot = document.createElement('div');
          dot.className = 'atl-home';
          dot.title = h.city || '';
          st.homeMarker = new maplibregl.Marker({ element: dot }).setLngLat(P(h.lng, h.lat)).addTo(map);
        },
        setPlaces(places) {
          data.places = {
            type: 'FeatureCollection',
            features: places.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: P(p.lng, p.lat) }, properties: { id: p.id, name: p.name, photos: p.photos, days: p.days, label: `${p.name}${p.photos > 1 ? ` · ${p.photos}` : ''}`, first: p.first, last: p.last, cover: p.cover, lat: p.lat, lng: p.lng } })),
          };
          whenReady(() => setData('atl-places', data.places));
        },
        setWiki(articles) {
          data.wiki = {
            type: 'FeatureCollection',
            features: articles.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: P(a.lng, a.lat) }, properties: { ...a } })),
          };
          whenReady(() => setData('atl-wiki', data.wiki));
        },
        setLayers(layers) {
          st.layers = { ...st.layers, ...layers };
          applyLayers();
        },
        /** Show or hide the thumbnail pins and history markers (the story hides them). */
        setMarkersVisible(on) {
          el.classList.toggle('atl-quiet', !on);
          st.quiet = !on;
          applyLayers();
        },
        popup(lngLat, node) {
          const p = new maplibregl.Popup({ className: 'atl-popup', closeButton: true, maxWidth: '320px', offset: 14 }).setLngLat(P(lngLat[0], lngLat[1])).setDOMContent(node).addTo(map);
          return p;
        },
        fitBounds(bbox, { maxZoom = 13, duration = 2200 } = {}) {
          if (!Array.isArray(bbox) || bbox.length !== 4) return;
          st.lastUser = Date.now();
          const [w0, s0, e0, n0] = bbox;
          const [w, s] = P(w0, s0);
          const [e, n] = P(e0, n0);
          if (Math.abs(e - w) < 0.002 && Math.abs(n - s) < 0.002) {
            map.flyTo({ center: [w, s], zoom: Math.min(maxZoom, 14), duration, essential: true });
            return;
          }
          try {
            map.fitBounds([[w, s], [e, n]], { padding: fitPadding(), maxZoom, duration, essential: true });
          } catch {
            map.flyTo({ center: [(w + e) / 2, (s + n) / 2], zoom: 4, duration, essential: true });
          }
        },
        /** Fly the camera; `center` is GPS, shifted here when the basemap needs it. */
        flyTo(opts) {
          st.lastUser = Date.now();
          const center = Array.isArray(opts.center) ? P(opts.center[0], opts.center[1]) : opts.center;
          map.flyTo({ essential: true, ...opts, ...(center ? { center } : {}) });
        },
        /** Promise resolved when the camera stops. */
        settle() {
          return new Promise((resolve) => {
            if (!map.isMoving()) return resolve();
            map.once('moveend', () => resolve());
          });
        },
        overview() {
          st.lastUser = Date.now() - 6000;
          const c = map.getCenter();
          map.flyTo({ center: [c.lng, Math.max(-30, Math.min(40, c.lat))], zoom: 1.55, pitch: 0, bearing: 0, duration: 2000, essential: true });
        },
        freeze(on) {
          st.frozen = on;
          if (on) st.lastUser = Date.now();
        },
        /** The map's centre in GPS terms. */
        center() {
          const c = map.getCenter();
          const [lng, lat] = unP(c.lng, c.lat);
          return { lat, lng };
        },
        resize() {
          map.resize();
        },
        destroy() {
          st.destroyed = true;
          cancelAnimationFrame(st.raf);
          cancelAnimationFrame(progressRaf);
          clearInterval(nightTimer);
          clearTimeout(pinTimer);
          clearTimeout(fallbackTimer);
          for (const p of st.pins.values()) p.marker.remove();
          for (const m of st.eventMarkers) m.remove();
          st.homeMarker?.remove();
          try {
            map.remove();
          } catch {
            // Already gone.
          }
        },
      };
      // For tests and debugging from the console.
      el.__atlasGlobe = api;
      return api;
    }

    // --- icons ------------------------------------------------------------------------

    const svg = (size, kids, extra = {}) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', ...extra }, ...kids);
    const P = (d, k) => h('path', { key: k ?? d, d });
    const Icon = {
      search: (s = 15) => svg(s, [h('circle', { key: 'c', cx: 11, cy: 11, r: 6.5 }), P('M16 16l4.5 4.5')]),
      close: (s = 15) => svg(s, [P('M6 6l12 12M18 6L6 18')]),
      play: (s = 14) => svg(s, [h('path', { key: 'p', d: 'M7 5l12 7-12 7z', fill: 'currentColor', stroke: 'none' })]),
      pause: (s = 14) => svg(s, [h('rect', { key: 'a', x: 6, y: 5, width: 4, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' }), h('rect', { key: 'b', x: 14, y: 5, width: 4, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' })]),
      plane: (s = 15) => svg(s, [P('M10.5 13.5L3 11l1.5-1.5 8 .5 4.8-4.8a2 2 0 012.8 2.8L15.3 12.8l.5 8L14.3 22.3 11.8 15l-3.3 3.3.3 2.4-1.3 1.3-1.5-3.8-3.8-1.5 1.3-1.3 2.4.3z')]),
      chart: (s = 15) => svg(s, [P('M4 20V10M10 20V4M16 20v-7M22 20H2')]),
      image: (s = 15) => svg(s, [h('rect', { key: 'r', x: 3, y: 5, width: 18, height: 14, rx: 2.5 }), P('M4.5 17.5l5-5.5 3.5 4 2.5-2.5 4 4'), h('circle', { key: 'c', cx: 16, cy: 9.5, r: 1.5 })]),
      calendar: (s = 15) => svg(s, [h('rect', { key: 'r', x: 3.5, y: 5, width: 17, height: 15, rx: 2.5 }), P('M3.5 10h17M8 3v4M16 3v4')]),
      gear: (s = 15) => svg(s, [h('circle', { key: 'c', cx: 12, cy: 12, r: 3 }), P('M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z')]),
      layers: (s = 15) => svg(s, [P('M12 3l9 5-9 5-9-5z'), P('M3 13l9 5 9-5'), P('M3 17.5l9 5 9-5', 'b')]),
      globe: (s = 15) => svg(s, [h('circle', { key: 'c', cx: 12, cy: 12, r: 9 }), P('M3 12h18'), P('M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18')]),
      left: (s = 18) => svg(s, [P('M15 5l-7 7 7 7')]),
      right: (s = 18) => svg(s, [P('M9 5l7 7-7 7')]),
      pin: (s = 14) => svg(s, [P('M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z'), h('circle', { key: 'c', cx: 12, cy: 9.5, r: 2.4 })]),
      book: (s = 14) => svg(s, [P('M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5z'), P('M4 19V5.5')]),
    };

    function AtlasGlyph(props) {
      const size = Number(props?.size) > 0 ? Number(props.size) : 18;
      const ink = props?.active ? C.label : 'currentColor';
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('circle', { key: 'g', cx: 11, cy: 13, r: 8 }),
        h('path', { key: 'e', d: 'M3 13h16M11 5c2.5 2.6 2.5 13.4 0 16M11 5c-2.5 2.6-2.5 13.4 0 16' }),
        h('path', { key: 'p', d: 'M18.5 1.8c-1.9 0-3.3 1.4-3.3 3.2 0 2.2 3.3 5 3.3 5s3.3-2.8 3.3-5c0-1.8-1.4-3.2-3.3-3.2z', fill: props?.active ? C.label : 'var(--dsw-alias-bg-base, #fff)' }),
        h('circle', { key: 'd', cx: 18.5, cy: 5, r: 1, fill: ink, stroke: 'none' }),
      );
    }

    // --- photo details, fetched in batches --------------------------------------------

    const photoCache = new Map();
    async function loadPhotos(ids) {
      const missing = ids.filter((id) => !photoCache.has(id));
      for (let i = 0; i < missing.length; i += 400) {
        const body = await postJson(`${ROUTE}/photos`, { ids: missing.slice(i, i + 400) });
        for (const p of body?.photos ?? []) photoCache.set(p.id, p);
      }
      return ids.map((id) => photoCache.get(id)).filter(Boolean);
    }

    // --- the viewer ---------------------------------------------------------------------

    function Viewer(props) {
      const t = props.t;
      const { ids, index } = props;
      const id = ids[index];
      const [photo, setPhoto] = useState(photoCache.get(id) ?? null);
      const [videoFailed, setVideoFailed] = useState(false);
      useEffect(() => {
        let alive = true;
        setVideoFailed(false);
        setPhoto(photoCache.get(id) ?? null);
        loadPhotos([id]).then((list) => alive && setPhoto(list[0] ?? null)).catch(() => {});
        // Warm the neighbours.
        for (const n of [ids[index + 1], ids[index - 1]]) if (n) new Image().src = largeUrl(n);
        return () => {
          alive = false;
        };
      }, [id]);
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === 'Escape') props.onClose();
          else if (e.key === 'ArrowRight') props.onStep(1);
          else if (e.key === 'ArrowLeft') props.onStep(-1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [index, ids.length]);
      const video = photo?.video === true;
      const navBtn = (dir) =>
        h(
          'button',
          {
            className: 'atl-btn atl-icon',
            'aria-label': t(dir < 0 ? 'previous' : 'next'),
            disabled: dir < 0 ? index === 0 : index >= ids.length - 1,
            onClick: (e) => {
              e.stopPropagation();
              props.onStep(dir);
            },
            style: { position: 'absolute', top: '50%', [dir < 0 ? 'left' : 'right']: 18, transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 21, background: 'rgba(0,0,0,.45)' },
          },
          dir < 0 ? Icon.left(20) : Icon.right(20),
        );
      return h(
        'div',
        { className: 'atl-fade', onClick: props.onClose, style: { position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(2,4,10,.92)', display: 'flex' } },
        h(
          'div',
          { style: { position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 } },
          video && !videoFailed
            ? h('video', { key: id, src: originalUrl(id), poster: largeUrl(id), controls: true, autoPlay: true, onClick: (e) => e.stopPropagation(), onError: () => setVideoFailed(true), style: { maxWidth: '100%', maxHeight: '100%', borderRadius: 10, background: '#000' } })
            : h('img', { key: id, src: largeUrl(id), alt: '', onClick: (e) => e.stopPropagation(), style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)' } }),
          video && videoFailed ? h('div', { style: { position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', color: C.muted, fontSize: 12 } }, t('noOriginal')) : null,
          ids.length > 1 ? navBtn(-1) : null,
          ids.length > 1 ? navBtn(1) : null,
          h('div', { style: { position: 'absolute', top: 16, left: 20, color: C.muted, fontSize: 12 } }, `${index + 1} / ${ids.length}`),
        ),
        h(
          'div',
          { onClick: (e) => e.stopPropagation(), className: 'atl-scroll', style: { width: 280, flex: 'none', padding: '56px 18px 18px', borderLeft: `1px solid ${C.line}`, background: 'rgba(10,13,22,.7)', display: props.narrow ? 'none' : 'block' } },
          h('button', { className: 'atl-btn atl-icon', 'aria-label': t('close'), onClick: props.onClose, style: { position: 'absolute', top: 14, right: 14 } }, Icon.close()),
          photo
            ? [
                h('div', { key: 'd', style: { fontSize: 17, fontWeight: 650, letterSpacing: 0.2 } }, photo.local.slice(0, 10)),
                h('div', { key: 'tm', style: { color: C.muted, marginTop: 2 } }, `${photo.local.slice(11)}${photo.video ? ` · ${t('video')} ${Math.round(photo.dur)}s` : ''}`),
                h('div', { key: 'p', style: { marginTop: 14, display: 'flex', gap: 6, alignItems: 'flex-start', color: C.ink } }, h('span', { style: { color: C.amber, marginTop: 2 } }, Icon.pin()), h('span', null, [photo.place?.district, photo.place?.city || photo.place?.province, photo.place?.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || t('noLocation'))),
                photo.lat !== null
                  ? h('button', { key: 'loc', className: 'atl-btn', style: { marginTop: 12 }, onClick: () => props.onLocate(photo) }, Icon.globe(14), t('locate'))
                  : null,
                photo.labels?.length
                  ? h(
                      'div',
                      { key: 'l', style: { marginTop: 20 } },
                      h('div', { style: { color: C.faint, fontSize: 11.5, marginBottom: 8, letterSpacing: 0.4 } }, t('labelsTitle')),
                      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, photo.labels.slice(0, 24).map((l, i) => h('span', { key: i, className: 'atl-chip', onClick: () => props.onLabel(l.w) }, l.w))),
                    )
                  : null,
              ]
            : h('div', { className: 'atl-spin' }),
        ),
      );
    }

    // --- timeline ---------------------------------------------------------------------

    /** Months from the first photo to now, with counts. */
    function monthBins(points) {
      if (points.length === 0) return { bins: [], first: 0 };
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of points) {
        const y = p.y;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      // Skip the empty early years: start at the first year with a real share.
      const perYear = new Map();
      for (const p of points) perYear.set(p.y, (perYear.get(p.y) ?? 0) + 1);
      const start = [...perYear.entries()].sort((a, b) => a[0] - b[0]).find(([, n]) => n >= Math.max(3, points.length * 0.002))?.[0] ?? minY;
      const bins = [];
      for (let y = start; y <= maxY; y += 1) for (let m = 0; m < 12; m += 1) bins.push({ y, m, n: 0 });
      for (const p of points) {
        const i = (p.y - start) * 12 + p.m;
        if (i >= 0 && i < bins.length) bins[i].n += 1;
      }
      return { bins, first: start };
    }

    function Timeline(props) {
      const t = props.t;
      const { bins, range, playing, focus } = props;
      const box = useRef(null);
      const drag = useRef(null);
      const max = bins.reduce((m, b) => Math.max(m, b.n), 1);
      const n = bins.length;
      const idxAt = (clientX) => {
        const r = box.current?.getBoundingClientRect();
        if (!r || n === 0) return 0;
        return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
      };
      const onDown = (e) => {
        if (n === 0) return;
        const i = idxAt(e.clientX);
        drag.current = { start: i, moved: false };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Fine without capture.
        }
      };
      const onMove = (e) => {
        if (!drag.current) return;
        const i = idxAt(e.clientX);
        if (i !== drag.current.start) drag.current.moved = true;
        if (drag.current.moved) props.onRange([Math.min(drag.current.start, i), Math.max(drag.current.start, i)]);
      };
      const onUp = (e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (!d.moved) {
          // A click picks that whole year.
          const y = bins[idxAt(e.clientX)].y;
          const a = bins.findIndex((b) => b.y === y);
          const b = a + 11;
          if (range && range[0] === a && range[1] === Math.min(n - 1, b)) props.onRange(null);
          else props.onRange([a, Math.min(n - 1, b)]);
        }
      };
      const years = [];
      for (let i = 0; i < n; i += 12) years.push({ i, y: bins[i].y });
      const yearStep = years.length > 14 ? 2 : 1;
      const label = range ? `${bins[range[0]].y}.${bins[range[0]].m + 1} – ${bins[range[1]].y}.${bins[range[1]].m + 1}` : t('allTime');
      return h(
        'div',
        { className: 'atl-glass', style: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: '10px 14px 8px', zIndex: 10 } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
          h('button', { className: 'atl-btn', 'data-on': playing ? 'true' : 'false', onClick: props.onPlay, title: t('replay') }, playing ? Icon.pause() : Icon.play(), playing ? t('pause') : t('replay')),
          h('div', { style: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }, label),
          h('div', { style: { color: C.muted, fontSize: 12 } }, t('filtered', { n: fmtNum(props.shown) })),
          h('div', { style: { flex: 1 } }),
          range || props.extra ? h('button', { className: 'atl-btn', onClick: () => props.onRange(null) }, t('everything')) : null,
        ),
        h(
          'div',
          {
            ref: box,
            onPointerDown: onDown,
            onPointerMove: onMove,
            onPointerUp: onUp,
            style: { position: 'relative', height: 38, display: 'flex', alignItems: 'flex-end', gap: 1, cursor: 'crosshair', touchAction: 'none', userSelect: 'none' },
          },
          bins.map((b, i) => {
            const inRange = !range || (i >= range[0] && i <= range[1]);
            const scale = (v) => (v === 0 ? 1 : 3 + (Math.log(1 + v) / Math.log(1 + max)) * 33);
            const hgt = scale(b.n);
            // With a search on, the matches are drawn over the whole library's bar.
            const f = focus ? focus[i] ?? 0 : b.n;
            const fill = inRange ? `linear-gradient(to top, ${C.amberDeep}, ${C.amber})` : 'rgba(255,255,255,.22)';
            return h(
              'div',
              { key: i, className: 'atl-bar', title: `${b.y}.${b.m + 1} · ${focus ? `${f} / ` : ''}${b.n}`, style: { position: 'relative', flex: 1, minWidth: 1, height: hgt, borderRadius: 1.5, background: focus ? 'rgba(255,255,255,.07)' : b.n === 0 ? 'rgba(255,255,255,.06)' : fill } },
              focus && f > 0 ? h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: scale(f), borderRadius: 1.5, background: inRange ? `linear-gradient(to top, #2b8cff, ${C.cyan})` : 'rgba(90,209,255,.3)' } }) : null,
            );
          }),
        ),
        h(
          'div',
          { style: { position: 'relative', height: 16, marginTop: 3 } },
          years
            .filter((_, k) => k % yearStep === 0)
            .map((yr) => h('div', { key: yr.y, style: { position: 'absolute', left: `${(yr.i / n) * 100}%`, fontSize: 10.5, color: C.faint, fontVariantNumeric: 'tabular-nums' } }, String(yr.y))),
        ),
      );
    }

    // --- today card ---------------------------------------------------------------------

    function TodayCard(props) {
      const t = props.t;
      const { today } = props;
      const [open, setOpen] = useState(true);
      if (!today) return null;
      const mem = today.memories ?? [];
      const ev = (today.events ?? []).find((e) => e.near?.close) ?? (today.events ?? []).find((e) => e.lat !== null);
      if (mem.length === 0 && !ev) return null;
      const md = String(today.date ?? '').slice(5).replace('-', '/');
      if (!open) {
        return h('button', { className: 'atl-btn atl-glass', style: { position: 'absolute', top: 66, left: 14, zIndex: 9, borderRadius: 12 }, onClick: () => setOpen(true) }, Icon.calendar(14), `${t('onThisDay')} · ${md}`);
      }
      return h(
        'div',
        { className: 'atl-glass atl-fade', style: { position: 'absolute', top: 66, left: 14, width: props.narrow ? 'calc(100% - 28px)' : 318, zIndex: 9, padding: 14 } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
          h('span', { style: { color: C.amber } }, Icon.calendar(15)),
          h('div', { style: { fontWeight: 650 } }, t('onThisDay')),
          h('div', { style: { color: C.muted, fontVariantNumeric: 'tabular-nums' } }, md),
          h('div', { style: { flex: 1 } }),
          h('button', { className: 'atl-btn atl-icon', style: { width: 26, height: 26 }, 'aria-label': t('close'), onClick: () => setOpen(false) }, Icon.close(13)),
        ),
        mem.length
          ? h(
              'div',
              { className: 'atl-scroll', style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 } },
              mem.slice(0, 8).map((m) =>
                h(
                  'div',
                  { key: m.year, className: 'atl-card', style: { flex: 'none', width: 112, cursor: 'pointer' }, onClick: () => props.onMemory(m) },
                  h('div', { style: { height: 84, background: `#141b2a url("${thumbUrl(m.cover)}") center/cover` } }),
                  h('div', { style: { padding: '6px 8px 7px' } }, h('div', { style: { fontWeight: 600, fontSize: 12 } }, t(m.yearsAgo > 1 ? 'yearsAgoN' : 'yearsAgo', { n: m.yearsAgo })), h('div', { style: { color: C.muted, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, `${m.place || m.year} · ${m.count}`)),
                ),
              ),
            )
          : h('div', { style: { color: C.muted, fontSize: 12 } }, t('noMemories')),
        ev
          ? h(
              'div',
              { style: { marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.line}`, cursor: 'pointer' }, onClick: () => props.onEvent(ev) },
              h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', color: C.violet, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3 } }, Icon.book(13), `${t('inHistory')} · ${ev.year}`),
              h('div', { style: { marginTop: 5, lineHeight: 1.5, fontSize: 12.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, ev.text),
              ev.near ? h('div', { style: { marginTop: 5, color: C.muted, fontSize: 11.5 } }, t('nearYou', { km: ev.near.km, place: ev.near.place })) : null,
            )
          : null,
      );
    }

    // --- drawer tabs ------------------------------------------------------------------

    function PhotosTab(props) {
      const t = props.t;
      const { selection } = props;
      const [best, setBest] = useState(null);
      const [photos, setPhotos] = useState([]);
      const [showAll, setShowAll] = useState(false);
      const [limit, setLimit] = useState(240);
      useEffect(() => {
        let alive = true;
        setLimit(240);
        setPhotos([]);
        setBest(null);
        setShowAll(false);
        if (!selection?.ids?.length) return undefined;
        // The featured few first: the best photos, no near-duplicates, spread over days.
        if (selection.ids.length > 1) {
          postJson(`${ROUTE}/curate`, { ids: selection.ids, n: 13 })
            .then((b) => alive && setBest(b?.ok ? b.best : []))
            .catch(() => alive && setBest([]));
        } else setBest([]);
        return () => {
          alive = false;
        };
      }, [selection]);
      const few = selection?.ids?.length <= 13;
      useEffect(() => {
        let alive = true;
        if (!selection?.ids?.length || !(showAll || few)) return undefined;
        loadPhotos(selection.ids.slice(0, 1500)).then((list) => alive && setPhotos(list)).catch(() => {});
        return () => {
          alive = false;
        };
      }, [selection, showAll]);
      if (!selection?.ids?.length) return h('div', { style: { color: C.muted, padding: 16 } }, t('empty'));
      const head = [
        h('div', { key: 'h', style: { fontWeight: 650, fontSize: 15, marginTop: 4 } }, selection.title || t('selection')),
        h('div', { key: 's', style: { color: C.muted, marginTop: 2, marginBottom: 10 } }, [t('photos', { n: fmtNum(selection.ids.length) }), selection.subtitle].filter(Boolean).join(' · ')),
      ];
      const featured = best && best.length > 1 && !few
        ? h(
            'div',
            { key: 'f', style: { marginBottom: 14 } },
            h('div', { style: { fontSize: 11.5, color: C.amber, fontWeight: 650, letterSpacing: 0.4, margin: '0 0 7px' } }, t('featured')),
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 } },
              best.map((id, i) =>
                h(
                  'div',
                  { key: id, className: 'atl-tile', style: i === 0 ? { gridColumn: 'span 3', aspectRatio: '16 / 10' } : undefined, onClick: () => props.onOpen(best, i) },
                  h('img', { src: i === 0 ? largeUrl(id) : thumbUrl(id), loading: 'lazy', alt: '' }),
                ),
              ),
            ),
          )
        : best === null && !few
          ? h('div', { key: 'f', className: 'atl-spin', style: { margin: '20px auto' } })
          : null;
      // Everything, by day.
      const groups = [];
      for (const p of photos.slice(0, limit)) {
        const day = p.local.slice(0, 10);
        const last = groups[groups.length - 1];
        if (last && last.day === day) last.items.push(p);
        else groups.push({ day, place: placeOf(p.place), items: [p] });
      }
      const ids = photos.map((p) => p.id);
      const all = showAll || few
        ? [
            ...groups.map((g) =>
              h(
                'div',
                { key: g.day, style: { marginBottom: 12 } },
                h('div', { style: { fontSize: 11.5, color: C.muted, margin: '0 0 6px', display: 'flex', gap: 6 } }, h('span', { style: { color: C.ink, fontWeight: 600 } }, g.day), g.place),
                h(
                  'div',
                  { className: 'atl-grid' },
                  g.items.map((p) => h('div', { key: p.id, className: 'atl-tile', 'data-video': p.video ? 'true' : 'false', onClick: () => props.onOpen(ids, ids.indexOf(p.id)) }, h('img', { src: thumbUrl(p.id), loading: 'lazy', alt: '' }))),
                ),
              ),
            ),
            photos.length > limit ? h('button', { key: 'more', className: 'atl-btn', style: { width: '100%', justifyContent: 'center' }, onClick: () => setLimit(limit + 240) }, '…') : null,
            photos.length === 0 ? h('div', { key: 'sp', className: 'atl-spin', style: { margin: '20px auto' } }) : null,
          ]
        : h('button', { key: 'all', className: 'atl-btn', style: { width: '100%', justifyContent: 'center' }, onClick: () => setShowAll(true) }, t('allByTime', { n: fmtNum(selection.ids.length) }));
      return h('div', { style: { padding: '4px 14px 16px' } }, head, featured, all);
    }

    function TripsTab(props) {
      const t = props.t;
      const [abroad, setAbroad] = useState(false);
      const trips = (props.trips ?? []).filter((x) => !abroad || x.abroad);
      const byYear = [];
      for (const trip of trips) {
        const y = trip.start.slice(0, 4);
        const last = byYear[byYear.length - 1];
        if (last && last.y === y) last.items.push(trip);
        else byYear.push({ y, items: [trip] });
      }
      return h(
        'div',
        { style: { padding: '4px 14px 16px' } },
        h(
          'div',
          { style: { display: 'flex', gap: 6, margin: '4px 0 12px' } },
          h('span', { className: 'atl-chip', 'data-on': !abroad ? 'true' : 'false', onClick: () => setAbroad(false) }, `${t('all')} ${props.trips.length}`),
          h('span', { className: 'atl-chip', 'data-on': abroad ? 'true' : 'false', onClick: () => setAbroad(true) }, `✈ ${t('abroad')} ${props.trips.filter((x) => x.abroad).length}`),
        ),
        byYear.map((g) =>
          h(
            'div',
            { key: g.y, style: { marginBottom: 14 } },
            h('div', { style: { fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,.85)', margin: '2px 0 8px', fontVariantNumeric: 'tabular-nums' } }, g.y),
            g.items.map((trip) =>
              h(
                'div',
                { key: trip.id, className: 'atl-card', 'data-active': props.active === trip.id ? 'true' : 'false', style: { display: 'flex', gap: 10, padding: 8, marginBottom: 7, cursor: 'pointer', borderColor: props.active === trip.id ? 'rgba(90,209,255,.55)' : undefined }, onClick: () => props.onRoute(trip) },
                h('div', { style: { width: 64, height: 64, flex: 'none', borderRadius: 9, background: `#141b2a url("${thumbUrl(trip.cover)}") center/cover` } }),
                h(
                  'div',
                  { style: { minWidth: 0, flex: 1 } },
                  h('div', { style: { fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, `${trip.countries.filter((c) => c.cc !== trip.home?.cc).map((c) => flagOf(c.cc)).join('')} ${trip.places.slice(0, 3).join(' → ')}`.trim()),
                  h('div', { style: { color: C.muted, fontSize: 11.5, marginTop: 2 } }, `${dateRange(trip.start, trip.end)} · ${t(trip.days > 1 ? 'daysN' : 'dayN', { n: trip.days })} · ${t('photos', { n: trip.count })}`),
                  h(
                    'div',
                    { style: { display: 'flex', gap: 6, marginTop: 6 } },
                    h('button', { className: 'atl-btn', style: { height: 24, fontSize: 11.5, padding: '0 8px' }, onClick: (e) => (e.stopPropagation(), props.onStory(trip)) }, Icon.play(10), t('story')),
                    h('span', { style: { color: C.faint, fontSize: 11, alignSelf: 'center' } }, t('km', { n: fmtNum(trip.km) })),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function StatsTab(props) {
      const t = props.t;
      const [year, setYear] = useState(null);
      const [stats, setStats] = useState(null);
      useEffect(() => {
        let alive = true;
        setStats(null);
        getJson(`${ROUTE}/stats${year ? `?year=${year}` : ''}`)
          .then((b) => alive && b?.ok && setStats(b.stats))
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [year]);
      const all = props.years ?? [];
      const big = (n, label, color) => h('div', { style: { flex: 1, minWidth: 80 } }, h('div', { style: { fontSize: 26, fontWeight: 700, color: color ?? C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 } }, n), h('div', { style: { color: C.muted, fontSize: 11.5, marginTop: 3 } }, label));
      return h(
        'div',
        { style: { padding: '4px 14px 16px' } },
        h(
          'div',
          { className: 'atl-scroll', style: { display: 'flex', gap: 6, overflowX: 'auto', margin: '4px 0 14px', paddingBottom: 4 } },
          h('span', { className: 'atl-chip', 'data-on': year === null ? 'true' : 'false', onClick: () => setYear(null) }, t('allTime')),
          [...all].reverse().map((y) => h('span', { key: y, className: 'atl-chip', 'data-on': year === y ? 'true' : 'false', onClick: () => setYear(y) }, String(y))),
        ),
        !stats
          ? h('div', { className: 'atl-spin', style: { margin: '24px auto' } })
          : [
              h(
                'div',
                { key: 'big', style: { display: 'flex', flexWrap: 'wrap', gap: '14px 10px', marginBottom: 16 } },
                big(stats.countries.length, t('countriesN', { n: '' }).trim(), C.amber),
                big(stats.cities.length, t('citiesN', { n: '' }).trim()),
                big(stats.trips, t('tripsN', { n: '' }).trim(), C.cyan),
                big(fmtCompact(stats.km, t('lang')), t('km', { n: '' }).trim()),
              ),
              h('div', { key: 'cov', style: { color: C.muted, fontSize: 12, marginBottom: 14 } }, `${t('coverage', { p: stats.coverage })} · ${t('daysN', { n: fmtNum(stats.days) })}`),
              h('div', { key: 'ct', style: { fontWeight: 650, margin: '6px 0 8px' } }, t('countriesTitle')),
              h(
                'div',
                { key: 'cl', style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 } },
                stats.countries.map((c) => h('span', { key: c.key, className: 'atl-chip', onClick: () => props.onPlace({ country: c.cc, title: c.name }) }, `${flagOf(c.cc)} ${c.name}`, h('span', { style: { color: C.faint } }, t('daysN', { n: c.days })))),
              ),
              h('div', { key: 'tc', style: { fontWeight: 650, margin: '6px 0 8px' } }, t('topCities')),
              stats.cities.slice(0, 12).map((c) => {
                const max = stats.cities[0]?.days || 1;
                return h(
                  'div',
                  { key: c.key, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }, onClick: () => props.onPlace({ place: c.name, title: c.name, lat: c.lat, lng: c.lng }) },
                  h('div', { style: { width: 92, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, `${flagOf(c.cc)} ${c.name}`),
                  h('div', { style: { flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.06)', overflow: 'hidden' } }, h('div', { style: { width: `${Math.max(3, Math.sqrt(c.days / max) * 100)}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${C.amberDeep}, ${C.amber})` } })),
                  h('div', { style: { width: 54, textAlign: 'right', color: C.muted, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' } }, t('daysN', { n: c.days })),
                );
              }),
              year === null && stats.years?.length
                ? [
                    h('div', { key: 'by', style: { fontWeight: 650, margin: '16px 0 8px' } }, t('byYear')),
                    h(
                      'div',
                      { key: 'yc', style: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 } },
                      (() => {
                        const rows = stats.years.filter((y) => y.located > 0);
                        const maxC = Math.max(1, ...rows.map((y) => y.cities));
                        return rows.map((y) =>
                          h(
                            'div',
                            { key: y.year, title: `${y.year}: ${y.trips} · ${y.cities} · ${y.km} km`, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }, onClick: () => setYear(y.year) },
                            h('div', { style: { fontSize: 9.5, color: C.faint } }, y.cities),
                            h('div', { style: { width: '100%', height: Math.max(3, (y.cities / maxC) * 56), borderRadius: 3, background: `linear-gradient(to top, #2b6cff, ${C.cyan})` } }),
                            h('div', { style: { fontSize: 9.5, color: C.muted } }, `'${String(y.year).slice(2)}`),
                          ),
                        );
                      })(),
                    ),
                  ]
                : null,
            ],
      );
    }

    function TodayTab(props) {
      const t = props.t;
      const { today } = props;
      if (!today) return h('div', { className: 'atl-spin', style: { margin: '24px auto' } });
      return h(
        'div',
        { style: { padding: '4px 14px 16px' } },
        h('div', { style: { fontWeight: 650, fontSize: 15, margin: '4px 0 10px' } }, `${t('onThisDay')} · ${String(today.date).slice(5).replace('-', '/')}`),
        today.memories?.length
          ? today.memories.map((m) =>
              h(
                'div',
                { key: m.year, className: 'atl-card', style: { padding: 10, marginBottom: 8, cursor: 'pointer' }, onClick: () => props.onMemory(m) },
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('div', { style: { fontWeight: 600 } }, `${m.year} · ${t(m.yearsAgo > 1 ? 'yearsAgoN' : 'yearsAgo', { n: m.yearsAgo })}`), h('div', { style: { color: C.muted, fontSize: 11.5 } }, `${flagOf(m.cc)} ${m.place}`)),
                h('div', { className: 'atl-strip', style: { display: 'flex', gap: 4, marginTop: 8, overflow: 'hidden' } }, m.ids.slice(0, 5).map((id) => h('img', { key: id, src: thumbUrl(id), loading: 'lazy', alt: '', style: { width: 58, height: 58, objectFit: 'cover', borderRadius: 7, flex: 'none' } }))),
              ),
            )
          : h('div', { style: { color: C.muted, marginBottom: 12 } }, t('noMemories')),
        h('div', { style: { fontWeight: 650, margin: '16px 0 8px', color: C.violet, display: 'flex', gap: 6, alignItems: 'center' } }, Icon.book(14), t('inHistory')),
        today.history === false
          ? h('div', { style: { color: C.muted } }, t('historyOff'))
          : today.events === null
            ? h('div', { style: { color: C.muted } }, today.eventsError || '…')
            : (today.events ?? []).slice(0, 30).map((e, i) =>
                h(
                  'div',
                  { key: i, style: { display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.line}`, cursor: e.lat !== null ? 'pointer' : 'default' }, onClick: () => e.lat !== null && props.onEvent(e) },
                  h('div', { style: { width: 40, flex: 'none', color: e.near?.close ? '#ff8bd0' : C.violet, fontWeight: 650, fontVariantNumeric: 'tabular-nums' } }, e.year),
                  h(
                    'div',
                    { style: { minWidth: 0, flex: 1, lineHeight: 1.5, fontSize: 12.5 } },
                    e.text,
                    e.near ? h('div', { style: { color: C.muted, fontSize: 11.5, marginTop: 2 } }, t('nearYou', { km: e.near.km, place: e.near.place })) : null,
                  ),
                  e.lat !== null ? h('span', { style: { color: C.faint, flex: 'none', marginTop: 2 } }, Icon.pin(13)) : null,
                ),
              ),
      );
    }

    // --- story mode -------------------------------------------------------------------

    function Story(props) {
      const t = props.t;
      const { trip, globe } = props;
      // Step 0: the overview; 1..n: the stops; n+1: the end card.
      const [step, setStep] = useState(0);
      const [paused, setPaused] = useState(false);
      const [arrived, setArrived] = useState(false);
      const fractions = useRef(nodeFractions(trip.path ?? [], trip.nodes ?? []));
      const n = trip.stops.length;
      useEffect(() => {
        globe.freeze(true);
        globe.setMarkersVisible(false);
        return () => {
          globe.freeze(false);
          globe.setMarkersVisible(true);
          globe.setActiveTrip(null);
        };
      }, [trip.id]);
      useEffect(() => {
        let alive = true;
        let timer = 0;
        setArrived(false);
        const f = fractions.current;
        if (step === 0) {
          globe.setActiveTrip(trip, 0);
          globe.fitBounds(trip.bbox, { maxZoom: 6, duration: 2600 });
          globe.settle().then(() => alive && setArrived(true));
        } else if (step <= n) {
          const stop = trip.stops[step - 1];
          const zoom = n > 1 ? 9.5 : 10.5;
          const bearing = ((step * 37) % 50) - 25;
          globe.flyTo({ center: [stop.lng, stop.lat], zoom, pitch: 48, bearing, duration: 3600, curve: 1.6 });
          globe.animateProgress(f[step - 1] ?? 0, f[step] ?? 1, 3400);
          globe.settle().then(() => alive && setArrived(true));
        } else {
          globe.animateProgress(f[n] ?? 0.95, 1, 2200);
          globe.fitBounds(trip.bbox, { maxZoom: 5, duration: 2600 });
          globe.settle().then(() => alive && setArrived(true));
        }
        return () => {
          alive = false;
          clearTimeout(timer);
        };
      }, [step]);
      useEffect(() => {
        if (!arrived || paused || step > n) return undefined;
        const hold = step === 0 ? 2600 : 6200;
        const timer = setTimeout(() => setStep((s) => s + 1), hold);
        return () => clearTimeout(timer);
      }, [arrived, paused, step]);
      const stop = step >= 1 && step <= n ? trip.stops[step - 1] : null;
      const shots = stop ? stop.ids.slice(0, 4) : [];
      const flags = trip.countries.filter((c) => c.cc !== trip.home?.cc).map((c) => flagOf(c.cc)).join(' ');
      return h(
        'div',
        { style: { position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' } },
        h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)' } }),
        // Progress dots.
        h(
          'div',
          { style: { position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, pointerEvents: 'auto' } },
          Array.from({ length: n + 2 }, (_, i) => h('div', { key: i, onClick: () => setStep(i), style: { width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i <= step ? C.amber : 'rgba(255,255,255,.25)', transition: 'all .3s', cursor: 'pointer' } })),
        ),
        // Title / stop caption.
        h(
          'div',
          { key: `cap-${step}`, className: 'atl-fade', style: { position: 'absolute', left: 28, bottom: 120, maxWidth: 520 } },
          step === 0 || step > n
            ? [
                h('div', { key: 'k', style: { fontSize: 12, letterSpacing: 2, color: C.amber, fontWeight: 700, textTransform: 'uppercase' } }, `${t('tripTo')} · ${dateRange(trip.start, trip.end)}`),
                h('div', { key: 't', style: { fontSize: 34, fontWeight: 750, lineHeight: 1.15, marginTop: 6, textShadow: '0 4px 24px rgba(0,0,0,.6)' } }, `${flags} ${trip.places.slice(0, 4).join(' · ')}`.trim()),
                h('div', { key: 's', style: { color: C.muted, marginTop: 8, fontSize: 14 } }, [t(trip.days > 1 ? 'daysN' : 'dayN', { n: trip.days }), t('photos', { n: trip.count }), t('km', { n: fmtNum(trip.km) })].join(' · ')),
              ]
            : [
                h('div', { key: 'k', style: { fontSize: 12, letterSpacing: 1.5, color: C.amber, fontWeight: 700 } }, t('stopN', { i: step, n })),
                h('div', { key: 't', style: { fontSize: 38, fontWeight: 750, lineHeight: 1.1, marginTop: 4, textShadow: '0 4px 24px rgba(0,0,0,.6)' } }, `${stop.cc && stop.cc !== trip.home?.cc ? `${flagOf(stop.cc)} ` : ''}${stop.name}`),
                h('div', { key: 's', style: { color: C.muted, marginTop: 6, fontSize: 14 } }, `${dateRange(stop.start ?? localDay(stop.from, 0), stop.end ?? localDay(stop.to, 0))} · ${t('photos', { n: stop.count })}`),
              ],
        ),
        // The stop's photos.
        stop && arrived
          ? h(
              'div',
              { key: `ph-${step}`, style: { position: 'absolute', right: 28, top: 70, bottom: 120, width: 'min(46%, 520px)', display: 'grid', gridTemplateColumns: shots.length > 1 ? '1fr 1fr' : '1fr', gridAutoRows: '1fr', gap: 10 } },
              shots.map((id, i) =>
                h(
                  'div',
                  { key: id, className: 'atl-fade', style: { animationDelay: `${i * 0.25}s`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.55)', border: '2px solid rgba(255,255,255,.85)', gridRow: shots.length === 3 && i === 0 ? 'span 2' : undefined, background: '#111' } },
                  h('img', { className: 'atl-kb', src: largeUrl(id), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', animationDelay: `${i * 0.25}s` } }),
                ),
              ),
            )
          : null,
        // Controls.
        h(
          'div',
          { className: 'atl-glass', style: { position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)', display: 'flex', gap: 8, padding: 8, pointerEvents: 'auto', borderRadius: 14 } },
          h('button', { className: 'atl-btn atl-icon', 'aria-label': t('previous'), disabled: step === 0, onClick: () => setStep((s) => Math.max(0, s - 1)) }, Icon.left(16)),
          h('button', { className: 'atl-btn', onClick: () => (step > n ? setStep(0) : setPaused((p) => !p)) }, paused || step > n ? Icon.play() : Icon.pause(), step > n ? t('replay') : paused ? t('play') : t('pause')),
          h('button', { className: 'atl-btn atl-icon', 'aria-label': t('next'), disabled: step > n, onClick: () => setStep((s) => Math.min(n + 1, s + 1)) }, Icon.right(16)),
          h('button', { className: 'atl-btn', onClick: props.onExit }, Icon.close(13), t('exitStory')),
        ),
      );
    }

    // --- settings ---------------------------------------------------------------------

    function SettingsSheet(props) {
      const t = props.t;
      const { state } = props;
      const s = state?.settings ?? {};
      const [library, setLibrary] = useState(s.library ?? '');
      const [away, setAway] = useState(String(s.awayKm ?? 100));
      const [busy, setBusy] = useState(false);
      const save = (patch) => {
        setBusy(true);
        postJson(`${ROUTE}/settings`, patch)
          .then((st) => st && props.onSaved(st))
          .finally(() => setBusy(false));
      };
      const row = (title, body, hint) => h('div', { style: { marginBottom: 18 } }, h('div', { style: { fontWeight: 600, marginBottom: 6 } }, title), body, hint ? h('div', { style: { color: C.faint, fontSize: 11.5, marginTop: 5, lineHeight: 1.5 } }, hint) : null);
      return h(
        'div',
        { className: 'atl-glass atl-fade', style: { position: 'absolute', top: 66, right: 14, width: 'min(380px, calc(100% - 28px))', maxHeight: 'calc(100% - 180px)', zIndex: 30, padding: 18 }, onClick: (e) => e.stopPropagation() },
        h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 14 } }, h('div', { style: { fontWeight: 700, fontSize: 15, flex: 1 } }, t('settings')), h('button', { className: 'atl-btn atl-icon', onClick: props.onClose, 'aria-label': t('close') }, Icon.close())),
        h(
          'div',
          { className: 'atl-scroll', style: { maxHeight: 'calc(100vh - 300px)' } },
          row(
            t('library'),
            h(
              'div',
              { style: { display: 'flex', gap: 6 } },
              h('input', { className: 'atl-input', value: library, placeholder: state?.library || '…/Photos Library.photoslibrary', onChange: (e) => setLibrary(e.target.value) }),
              h('button', { className: 'atl-btn', disabled: busy, onClick: () => save({ library }) }, t('save')),
            ),
            [t('libraryHint'), state?.library ? ` ${state.library}` : ''].join(''),
          ),
          state?.candidates?.length > 1
            ? row(
                t('found'),
                state.candidates.map((c) => h('div', { key: c, style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 } }, h('div', { style: { flex: 1, fontSize: 11.5, color: C.muted, wordBreak: 'break-all' } }, c), h('button', { className: 'atl-btn', onClick: () => (setLibrary(c), save({ library: c })) }, t('use')))),
              )
            : null,
          row(
            t('home'),
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('div', { style: { color: C.muted } }, s.home ? t('homeFixed', { city: s.home.city || `${s.home.lat.toFixed(2)}, ${s.home.lng.toFixed(2)}` }) : t('homeAuto', { city: state?.home?.city || '—' })),
              h(
                'div',
                { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                h('button', { className: 'atl-btn', disabled: busy, onClick: () => save({ home: props.center() }) }, Icon.pin(13), t('homeHere')),
                s.home ? h('button', { className: 'atl-btn', disabled: busy, onClick: () => save({ home: null }) }, t('homeReset')) : null,
              ),
            ),
          ),
          row(
            t('awayKm'),
            h('div', { style: { display: 'flex', gap: 6 } }, h('input', { className: 'atl-input', type: 'number', min: 10, value: away, onChange: (e) => setAway(e.target.value), style: { width: 120 } }), h('button', { className: 'atl-btn', disabled: busy, onClick: () => save({ awayKm: Number(away) }) }, t('save'))),
          ),
          row(
            t('basemap'),
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              ['night', 'amap', 'satellite', 'offline'].map((b) => h('span', { key: b, className: 'atl-chip', 'data-on': ((s.basemap === 'auto' ? 'night' : s.basemap) ?? 'night') === b ? 'true' : 'false', style: { whiteSpace: 'normal' }, onClick: () => save({ basemap: b }) }, t({ night: 'basemapAuto', amap: 'basemapAmapLong', satellite: 'basemapSatelliteLong', offline: 'basemapOffline' }[b]))),
            ),
          ),
          row(t('history'), h('span', { className: 'atl-chip', 'data-on': s.history !== false ? 'true' : 'false', onClick: () => save({ history: s.history === false }) }, s.history !== false ? 'ON' : 'OFF'), t('historyHint')),
          row(t('layerNearby'), h('span', { className: 'atl-chip', 'data-on': s.nearby !== false ? 'true' : 'false', onClick: () => save({ nearby: s.nearby === false }) }, s.nearby !== false ? 'ON' : 'OFF'), t('nearbyHint')),
          row(
            t('rebuild'),
            h('button', { className: 'atl-btn', disabled: busy || state?.status === 'building', onClick: () => (setBusy(true), postJson(`${ROUTE}/rebuild`, {}).then((st) => st && props.onSaved(st, true)).finally(() => setBusy(false))) }, busy ? t('rebuilding') : t('rebuild')),
            state?.builtAt ? t('indexed', { items: fmtNum(state.items), located: fmtNum(state.located), when: fmtWhen(t, state.builtAt) }) : '',
          ),
          h('div', { style: { color: C.faint, fontSize: 11, marginTop: 6 } }, `Atlas ${state?.version ?? ''} · MapLibre · OpenFreeMap · © OpenStreetMap · Natural Earth · Wikipedia`),
        ),
      );
    }

    // --- the panel ----------------------------------------------------------------------

    function StatusScreen(props) {
      const t = props.t;
      const { state } = props;
      const code = state?.error?.code;
      const [path, setPath] = useState(state?.settings?.library ?? '');
      let title = t('building');
      let body = '';
      let spinner = true;
      if (props.failed) {
        title = t('unavailable');
        spinner = false;
      } else if (props.libsFailed) {
        title = t('libsFailed');
        body = props.libsFailed;
        spinner = false;
      } else if (state?.status === 'error') {
        spinner = false;
        title = code === 'permission' ? t('permissionTitle') : code === 'no-library' ? t('noLibraryTitle') : t('readFailedTitle');
        body = code === 'permission' ? t('permissionBody') : code === 'no-library' ? t('noLibraryBody') : String(state.error?.message ?? '');
      } else if (state && state.status !== 'building') title = t('loading');
      return h(
        'div',
        { style: { position: 'absolute', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 } },
        h(
          'div',
          { className: 'atl-glass', style: { maxWidth: 460, padding: 24, textAlign: 'center' } },
          spinner ? h('div', { className: 'atl-spin', style: { margin: '0 auto 14px' } }) : h('div', { style: { color: C.amber, marginBottom: 10 } }, Icon.globe(30)),
          h('div', { style: { fontWeight: 650, fontSize: 15, lineHeight: 1.5 } }, title),
          body ? h('div', { style: { color: C.muted, marginTop: 8, lineHeight: 1.6, userSelect: 'text' } }, body) : null,
          state?.status === 'error'
            ? h(
                'div',
                { style: { display: 'flex', gap: 6, marginTop: 16 } },
                code === 'no-library' || code === 'read-failed' ? h('input', { className: 'atl-input', value: path, placeholder: '/Volumes/…/Photos Library.photoslibrary', onChange: (e) => setPath(e.target.value) }) : null,
                h('button', { className: 'atl-btn', style: { flex: code === 'permission' ? 1 : 'none', justifyContent: 'center' }, onClick: () => props.onRetry(path) }, t('retry')),
              )
            : null,
        ),
      );
    }

    function AtlasPanel(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      const lang = t('lang') === 'zh' ? 'zh' : 'en';
      const rootRef = useRef(null);
      const mapRef = useRef(null);
      const globeRef = useRef(null);
      const [state, setState] = useState(null);
      const [failed, setFailed] = useState(false);
      const [libsFailed, setLibsFailed] = useState('');
      const [mapReady, setMapReady] = useState(false);
      const [points, setPoints] = useState(null);
      const [trips, setTrips] = useState([]);
      const [today, setToday] = useState(null);
      const [tab, setTab] = useState(null);
      const [selection, setSelection] = useState(null);
      const [range, setRange] = useState(null);
      const [filter, setFilter] = useState(null);
      const [query, setQuery] = useState('');
      const [searching, setSearching] = useState(false);
      const [searchNote, setSearchNote] = useState('');
      const [viewer, setViewer] = useState(null);
      const [story, setStory] = useState(null);
      const [activeTrip, setActiveTrip] = useState(null);
      const [playing, setPlaying] = useState(false);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [layersOpen, setLayersOpen] = useState(false);
      const [layers, setLayers] = useState(() => {
        const base = { arcs: true, night: true, countries: true, history: true, terrain: true, places: true, nearby: true };
        try {
          return { ...base, ...JSON.parse(localStorage.getItem('atlas.layers') || '{}') };
        } catch {
          return base;
        }
      });
      const [width, setWidth] = useState(1200);
      const [reload, setReload] = useState(0);
      const alive = useRef(true);
      const commandSeq = useRef(0);
      const citiesRef = useRef([]);
      const [places, setPlaces] = useState([]);
      const nearbyTimer = useRef(0);
      const live = useRef({});
      live.current = { points, trips, range, filter, selection, layers };

      // The index's state; polls while it is being built.
      useEffect(() => {
        alive.current = true;
        ensureCss();
        let timer = 0;
        const poll = () =>
          getJson(`${ROUTE}/state`)
            .then((st) => {
              if (!alive.current) return;
              if (!st) {
                setFailed(true);
                return;
              }
              setFailed(false);
              setState(st);
              if (st.status === 'building' || st.status === 'idle') timer = setTimeout(poll, 1200);
            })
            .catch(() => alive.current && setFailed(true));
        poll();
        return () => {
          alive.current = false;
          clearTimeout(timer);
        };
      }, [reload]);

      // Width, for the narrow layout.
      useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => {
          setWidth(el.clientWidth);
          globeRef.current?.resize();
        });
        ro.observe(el);
        return () => ro.disconnect();
      }, []);

      const ready = state?.status === 'ready' || state?.status === 'refreshing';

      // Data once the index is there.
      useEffect(() => {
        if (!ready) return;
        let on = true;
        getJson(`${ROUTE}/points`).then((b) => {
          if (!on || !b?.ok) return;
          const list = b.ids.map((id, i) => {
            const d = new Date((b.t[i] + (b.tz[i] ?? 0)) * 1000);
            return { id, lat: b.lat[i], lng: b.lng[i], t: b.t[i], tz: b.tz[i], s: b.s[i], v: b.v[i], cc: b.cc[i], ci: b.ci?.[i], y: d.getUTCFullYear(), m: d.getUTCMonth() };
          });
          citiesRef.current = Array.isArray(b.cities) ? b.cities : [];
          setPoints(list);
        });
        getJson(`${ROUTE}/trips`).then((b) => on && b?.ok && setTrips(b.trips));
        getJson(`${ROUTE}/places`).then((b) => on && b?.ok && setPlaces(b.places));
        getJson(`${ROUTE}/today?lang=${lang}`).then((b) => on && b?.ok && setToday(b));
        return () => {
          on = false;
        };
      }, [ready, state?.builtAt]);

      // The globe.
      useEffect(() => {
        if (!ready || !mapRef.current || globeRef.current) return undefined;
        let cancelled = false;
        Promise.all([ensureLibs(), loadStyle(state.settings?.basemap ?? 'night', lang), loadCountries().then(setChina)])
          .then(([libs, style]) => {
            if (cancelled || !mapRef.current) return;
            const globe = createGlobe(mapRef.current, {
              ...libs,
              style,
              home: state.home,
              onPick: ({ ids, center, focus, title }) => {
                setStory(null);
                const first = photoCache.get(ids[0]);
                setSelection({ ids, title: title || '', subtitle: '', center, key: Date.now() });
                setTab('photos');
                if (focus) setViewer({ ids, index: 0 });
                void first;
                loadPhotos(ids.slice(0, 1)).then((list) => {
                  const p = list[0];
                  if (p && alive.current) setSelection((s) => (s && s.ids === ids ? { ...s, title: placeOf(p.place) || s.title, subtitle: ids.length > 1 ? '' : p.local.slice(0, 10) } : s));
                });
              },
              onEvent: (e) => showEvent(e),
              onPlace: (p) => showPlace(p),
              onView: (v) => lookAround(v),
              lang,
            });
            globeRef.current = globe;
            globe.setHome(state.home);
            setMapReady(true);
          })
          .catch((error) => alive.current && setLibsFailed(String(error?.message ?? error)));
        return () => {
          cancelled = true;
        };
      }, [ready]);
      useEffect(
        () => () => {
          globeRef.current?.destroy();
          globeRef.current = null;
        },
        [],
      );

      const bins = useRef({ key: null, value: { bins: [], first: 0 } });
      if (points && bins.current.key !== points) bins.current = { key: points, value: monthBins(points) };
      const timeline = bins.current.value;

      // What the map shows: the time range and the filter (search, chat).
      const shown = useRef({ key: '', list: [] });
      const filterKey = `${points?.length ?? 0}|${range?.join('-') ?? ''}|${filter?.key ?? ''}`;
      if (points && shown.current.key !== filterKey) {
        let list = points;
        if (range && timeline.bins.length) {
          const a = timeline.bins[range[0]];
          const b = timeline.bins[range[1]];
          const lo = a.y * 12 + a.m;
          const hi = b.y * 12 + b.m;
          list = list.filter((p) => {
            const k = p.y * 12 + p.m;
            return k >= lo && k <= hi;
          });
        }
        if (filter?.ids) {
          const set = new Set(filter.ids);
          list = list.filter((p) => set.has(p.id));
        }
        shown.current = { key: filterKey, list };
      }
      // The filter's matches per month, for the timeline.
      const focusRef = useRef({ key: '', bins: null });
      if (points && focusRef.current.key !== `${filter?.key ?? ''}|${points.length}`) {
        let fb = null;
        if (filter?.ids && timeline.bins.length) {
          const set = new Set(filter.ids);
          fb = new Array(timeline.bins.length).fill(0);
          const y0 = timeline.first;
          for (const p of points) {
            if (!set.has(p.id)) continue;
            const i = (p.y - y0) * 12 + p.m;
            if (i >= 0 && i < fb.length) fb[i] += 1;
          }
        }
        focusRef.current = { key: `${filter?.key ?? ''}|${points.length}`, bins: fb };
      }
      useEffect(() => {
        const g = globeRef.current;
        if (!g || !mapReady || !points) return;
        g.setPoints(shown.current.list, citiesRef.current);
      }, [mapReady, filterKey]);
      useEffect(() => {
        const g = globeRef.current;
        if (!g || !mapReady) return;
        g.setPlaces(places);
      }, [mapReady, places]);
      useEffect(() => {
        const g = globeRef.current;
        if (!g || !mapReady) return;
        g.setTrips(trips);
      }, [mapReady, trips]);
      useEffect(() => {
        const g = globeRef.current;
        if (!g || !mapReady || !points) return;
        g.setVisited([...new Set(points.map((p) => p.cc).filter(Boolean))]);
      }, [mapReady, points]);
      useEffect(() => {
        const g = globeRef.current;
        if (!g || !mapReady) return;
        g.setEvents((today?.events ?? []).filter((e) => e.lat !== null).slice(0, 14));
      }, [mapReady, today]);
      useEffect(() => {
        globeRef.current?.setLayers(layers);
        try {
          localStorage.setItem('atlas.layers', JSON.stringify(layers));
        } catch {
          // Remembered for this page only.
        }
      }, [mapReady, layers]);
      useEffect(() => {
        const g = globeRef.current;
        if (!g || !mapReady || story) return;
        const trip = trips.find((x) => x.id === activeTrip);
        g.setActiveTrip(trip ?? null, 1);
      }, [mapReady, activeTrip, story]);

      // Replay the years: the footprint grows month by month.
      useEffect(() => {
        if (!playing || timeline.bins.length === 0) return undefined;
        let end = range && range[1] < timeline.bins.length - 1 ? range[1] : 0;
        const startAt = 0;
        globeRef.current?.overview();
        const timer = setInterval(() => {
          end += Math.max(1, Math.round(timeline.bins.length / 120));
          if (end >= timeline.bins.length - 1) {
            setRange(null);
            setPlaying(false);
            return;
          }
          setRange([startAt, end]);
        }, 160);
        return () => clearInterval(timer);
      }, [playing]);

      // Commands from the tools and the chat cards.
      const runCommand = (cmd) => {
        const g = globeRef.current;
        if (!g) return false;
        if (cmd.kind === 'trip') {
          const trip = live.current.trips.find((x) => x.id === cmd.trip);
          if (!trip) return false;
          setFilter(null);
          setRange(null);
          if (cmd.story) setStory(trip);
          else {
            setActiveTrip(trip.id);
            setTab('trips');
            g.fitBounds(trip.bbox, { maxZoom: 8 });
          }
          return true;
        }
        if (cmd.kind === 'highlight') {
          setStory(null);
          const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
          const label = cmd.label ?? cmd.title ?? '';
          // A later command wins even if its search answers first.
          const ticket = (commandSeq.current += 1);
          if (cmd.query) {
            postJson(`${ROUTE}/search`, { ...cmd.query, all: true }).then((b) => {
              if (!b?.ok || !alive.current || ticket !== commandSeq.current) return;
              const all = b.result.all ?? ids;
              setFilter({ key: `cmd-${Date.now()}`, ids: all, label: b.label || label, total: b.result.total });
              setSelection({ ids: all, title: b.label || label, subtitle: '', key: Date.now() });
              setTab('photos');
            });
          } else if (ids.length) {
            setSelection({ ids, title: label, subtitle: '', key: Date.now() });
            setTab('photos');
            if (cmd.focus) setViewer({ ids, index: 0 });
          }
          if (cmd.bbox) g.fitBounds(cmd.bbox, { maxZoom: ids.length === 1 ? 15 : 12 });
          return true;
        }
        return false;
      };
      useEffect(() => {
        if (!mapReady || !points) return undefined;
        const pending = bus.take();
        if (pending) runCommand(pending);
        return bus.on((cmd) => runCommand(cmd));
      }, [mapReady, points]);

      const showEvent = (e) => {
        const g = globeRef.current;
        if (!g || e.lat === null) return;
        if (!e.wiki) g.flyTo({ center: [e.lng, e.lat], zoom: Math.max(5, Math.min(11, g.map.getZoom() + 3)), duration: 2200 });
        const node = document.createElement('div');
        const head = document.createElement('div');
        head.style.cssText = `color:${C.violet};font-weight:700;font-size:11.5px;letter-spacing:.3px`;
        head.textContent = e.wiki ? `${e.title}${e.description ? ` · ${e.description}` : ''}` : `${t('inHistory')} · ${e.year}`;
        node.appendChild(head);
        if (e.thumb) {
          const img = document.createElement('img');
          img.src = e.thumb;
          img.style.cssText = 'width:100%;max-height:130px;object-fit:cover;border-radius:8px;margin-top:8px';
          img.onerror = () => img.remove();
          node.appendChild(img);
        }
        const body = document.createElement('div');
        body.style.cssText = 'margin-top:6px';
        body.textContent = e.wiki ? e.extract : e.text;
        node.appendChild(body);
        if (e.near) {
          const near = document.createElement('div');
          near.style.cssText = `margin-top:6px;color:${C.muted};font-size:11.5px`;
          near.textContent = t('nearYou', { km: e.near.km, place: e.near.place });
          node.appendChild(near);
        }
        if (e.url) {
          const a = document.createElement('a');
          a.href = e.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = `${e.title || t('readMore')} ↗`;
          a.style.cssText = 'display:inline-block;margin-top:8px';
          node.appendChild(a);
        }
        if (e.wiki) g.popup([e.lng, e.lat], node);
        else setTimeout(() => g.popup([e.lng, e.lat], node), 900);
      };

      /** A named place on the map: its photos, in the drawer. */
      const showPlace = (p) => {
        postJson(`${ROUTE}/search`, { lexeme: p.id, located: true, all: true, limit: 1 }).then((b) => {
          if (!b?.ok || !alive.current) return;
          const ids = b.result.all ?? [];
          const first = Number(p.first);
          const last = Number(p.last);
          const when = Number.isFinite(first) ? dateRange(localDay(first, 0), localDay(last, 0)) : '';
          setSelection({ ids, title: p.name, subtitle: [t('daysN', { n: p.days }), when].filter(Boolean).join(' · '), key: Date.now() });
          setTab('photos');
        });
      };

      /** Once the camera rests zoomed in: Wikipedia around the centre. */
      const lookAround = (v) => {
        clearTimeout(nearbyTimer.current);
        const g = globeRef.current;
        if (!g) return;
        if (v.zoom < 11.5 || !live.current.layers?.nearby) {
          if (v.zoom < 10.5) g.setWiki([]);
          return;
        }
        nearbyTimer.current = setTimeout(() => {
          const r = Math.round(Math.min(10, Math.max(0.5, v.radiusKm)) * 1000);
          getJson(`${ROUTE}/nearby?lat=${v.lat.toFixed(4)}&lng=${v.lng.toFixed(4)}&r=${r}&lang=${lang}`)
            .then((b) => b?.ok && alive.current && globeRef.current?.setWiki(b.articles ?? []))
            .catch(() => {});
        }, 700);
      };

      const showMemory = (m) => {
        const g = globeRef.current;
        setSelection({ ids: m.ids, title: `${m.year} · ${m.place}`, subtitle: t(m.yearsAgo > 1 ? 'yearsAgoN' : 'yearsAgo', { n: m.yearsAgo }), key: Date.now() });
        setTab('photos');
        if (g && m.lat !== null) g.flyTo({ center: [m.lng, m.lat], zoom: 11, duration: 2600 });
      };

      const runSearch = (text) => {
        const q = String(text ?? '').trim();
        if (q === '') {
          setFilter(null);
          setSearchNote('');
          return;
        }
        setSearching(true);
        setSearchNote('');
        const ticket = (commandSeq.current += 1);
        postJson(`${ROUTE}/search`, { text: q, all: true, limit: 1 })
          .then((b) => {
            if (!b?.ok || !alive.current || ticket !== commandSeq.current) return;
            const r = b.result;
            if (r.located === 0) {
              setFilter(null);
              const words = r.suggestions?.similar?.length ? r.suggestions.similar : r.suggestions?.common ?? [];
              setSearchNote(`${t('noMatch', { q })}${words.length ? ` ${t('tryLabels', { words: words.slice(0, 8).join('、') })}` : ''}`);
              return;
            }
            setFilter({ key: `q-${q}-${Date.now()}`, ids: r.all, label: q, total: r.located });
            setSelection({ ids: r.all, title: q, subtitle: r.places.slice(0, 3).map((p) => p.name).join(' · '), key: Date.now() });
            setTab('photos');
            if (r.bbox) globeRef.current?.fitBounds(r.bbox, { maxZoom: 11 });
          })
          .finally(() => alive.current && setSearching(false));
      };

      const narrow = width < 760;
      const drawerOpen = tab !== null && !story;
      const tabs = [
        ['photos', Icon.image(14), t('tabPhotos')],
        ['trips', Icon.plane(14), t('tabTrips')],
        ['stats', Icon.chart(14), t('tabStats')],
        ['today', Icon.calendar(14), t('tabToday')],
      ];
      const years = [...new Set((points ?? []).map((p) => p.y))].sort((a, b) => a - b);

      const topBar = h(
        'div',
        { style: { position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', gap: 8, alignItems: 'center', zIndex: 20 } },
        h(
          'div',
          { className: 'atl-glass', style: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 42, borderRadius: 13, flex: 'none' } },
          h('span', { style: { color: C.amber, display: 'flex' } }, h(AtlasGlyph, { size: 18, active: false })),
          h('span', { style: { fontWeight: 700, letterSpacing: 0.4 } }, t('title')),
          !narrow && points ? h('span', { style: { color: C.muted, fontSize: 12 } }, `${t('photos', { n: fmtNum(points.length) })} · ${t('tripsN', { n: trips.length })}`) : null,
        ),
        h(
          'form',
          {
            className: 'atl-glass',
            style: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 0 12px', height: 42, borderRadius: 13, maxWidth: 560 },
            onSubmit: (e) => {
              e.preventDefault();
              runSearch(query);
            },
          },
          h('span', { style: { color: C.muted, display: 'flex' } }, searching ? h('div', { className: 'atl-spin', style: { width: 14, height: 14, borderWidth: 2 } }) : Icon.search()),
          h('input', { value: query, onChange: (e) => setQuery(e.target.value), placeholder: t('searchPlaceholder'), style: { flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: C.ink, font: 'inherit', fontSize: 13 } }),
          filter
            ? h(
                'span',
                { className: 'atl-chip', 'data-on': 'true', onClick: () => (setFilter(null), setQuery(''), setSearchNote('')) },
                `${filter.label} · ${fmtNum(filter.ids.length)}`,
                Icon.close(11),
              )
            : null,
        ),
        h('div', { style: { flex: 'none', marginLeft: 'auto', display: 'flex', gap: 6 } },
          !narrow
            ? tabs.map(([key, icon, label]) => h('button', { key, className: 'atl-btn atl-glass', 'data-on': tab === key ? 'true' : 'false', style: { height: 42, borderRadius: 13 }, onClick: () => setTab(tab === key ? null : key), title: label }, icon, width > 1100 ? label : null))
            : h('button', { className: 'atl-btn atl-glass atl-icon', style: { height: 42, width: 42, borderRadius: 13 }, onClick: () => setTab(tab ? null : 'trips') }, Icon.plane()),
          h('button', { className: 'atl-btn atl-glass atl-icon', 'data-on': layersOpen ? 'true' : 'false', style: { height: 42, width: 42, borderRadius: 13 }, onClick: () => setLayersOpen(!layersOpen), title: t('layers') }, Icon.layers()),
          h('button', { className: 'atl-btn atl-glass atl-icon', 'data-on': settingsOpen ? 'true' : 'false', style: { height: 42, width: 42, borderRadius: 13 }, onClick: () => setSettingsOpen(!settingsOpen), title: t('settings') }, Icon.gear()),
        ),
      );

      const basemap = state?.settings?.basemap === 'auto' ? 'night' : state?.settings?.basemap ?? 'night';
      const switchBasemap = (b) => {
        if (b === basemap) return;
        postJson(`${ROUTE}/settings`, { basemap: b }).then((st) => {
          if (!st || !alive.current) return;
          globeRef.current?.destroy();
          globeRef.current = null;
          setMapReady(false);
          setPoints(null);
          setState({ ...st, status: 'building' });
          setReload((r) => r + 1);
        });
      };
      const layersMenu = layersOpen
        ? h(
            'div',
            { className: 'atl-glass atl-fade', onClick: (e) => e.stopPropagation(), style: { position: 'absolute', top: 66, right: 14, zIndex: 25, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, width: 236 } },
            h('div', { style: { color: C.faint, fontSize: 11.5, letterSpacing: 0.4 } }, t('basemap')),
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 } },
              [
                ['night', t('basemapNight')],
                ['amap', t('basemapAmap')],
                ['satellite', t('basemapSatellite')],
                ['offline', t('basemapOfflineShort')],
              ].map(([k, label]) => h('span', { key: k, className: 'atl-chip', 'data-on': basemap === k ? 'true' : 'false', style: { justifyContent: 'center' }, onClick: () => switchBasemap(k) }, label)),
            ),
            h('div', { style: { color: C.faint, fontSize: 11.5, letterSpacing: 0.4 } }, t('layers')),
            [
              ['places', t('layerPlaces')],
              ['nearby', t('layerNearby')],
              ['terrain', t('layerTerrain')],
              ['arcs', t('layerArcs')],
              ['countries', t('layerCountries')],
              ['night', t('layerNight')],
              ['history', t('layerHistory')],
            ].map(([k, label]) => h('span', { key: k, className: 'atl-chip', 'data-on': layers[k] ? 'true' : 'false', onClick: () => setLayers({ ...layers, [k]: !layers[k] }) }, label)),
            h('div', { style: { color: C.faint, fontSize: 11, lineHeight: 1.5, marginTop: 4 } }, t(basemap === 'amap' ? 'basemapAmapHint' : basemap === 'satellite' ? 'basemapSatelliteHint' : 'basemapNightHint')),
          )
        : null;

      const drawer = drawerOpen
        ? h(
            'div',
            { className: 'atl-glass atl-fade', style: { position: 'absolute', top: 66, right: 14, bottom: 120, width: narrow ? 'calc(100% - 28px)' : 380, zIndex: 15, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
            h(
              'div',
              { style: { display: 'flex', gap: 4, padding: '10px 10px 6px', borderBottom: `1px solid ${C.line}` } },
              narrow
                ? tabs.map(([key, icon]) => h('button', { key, className: 'atl-btn', 'data-on': tab === key ? 'true' : 'false', style: { flex: 1, justifyContent: 'center', height: 30, padding: 0, fontSize: 12 }, onClick: () => setTab(key) }, icon))
                : h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 4, fontWeight: 650 } }, tabs.find(([key]) => key === tab)?.[1], tabs.find(([key]) => key === tab)?.[2]),
              h('button', { className: 'atl-btn atl-icon', style: { height: 30, width: 30 }, onClick: () => setTab(null), 'aria-label': t('close') }, Icon.close(13)),
            ),
            h(
              'div',
              { className: 'atl-scroll', style: { flex: 1, minHeight: 0 } },
              tab === 'photos' ? h(PhotosTab, { t, selection, onOpen: (ids, index) => setViewer({ ids, index }) }) : null,
              tab === 'trips'
                ? h(TripsTab, {
                    t,
                    trips,
                    active: activeTrip,
                    onRoute: (trip) => {
                      setActiveTrip(trip.id);
                      setSelection({ ids: trip.ids, title: trip.places.slice(0, 3).join(' → '), subtitle: dateRange(trip.start, trip.end), key: Date.now() });
                      globeRef.current?.fitBounds(trip.bbox, { maxZoom: 8 });
                    },
                    onStory: (trip) => setStory(trip),
                  })
                : null,
              tab === 'stats'
                ? h(StatsTab, {
                    t,
                    years,
                    onPlace: (p) => {
                      const q = p.country ? { country: p.country } : { place: p.place };
                      runCommand({ kind: 'highlight', query: { ...q, located: true }, label: p.title, bbox: null });
                      postJson(`${ROUTE}/search`, { ...q, located: true, limit: 1 }).then((b) => b?.result?.bbox && globeRef.current?.fitBounds(b.result.bbox, { maxZoom: 10 }));
                    },
                  })
                : null,
              tab === 'today' ? h(TodayTab, { t, today, onMemory: showMemory, onEvent: showEvent }) : null,
            ),
          )
        : null;

      const blocking = failed || libsFailed || !ready || (!mapReady && !state?.error);
      return h(
        'div',
        { ref: rootRef, className: 'atl-root', 'data-dsh-atlas': true, onClick: () => (settingsOpen || layersOpen) && (setSettingsOpen(false), setLayersOpen(false)) },
        h('div', { className: 'atl-stars', style: { backgroundImage: stars() ? `url(${stars()})` : undefined } }),
        // Inline: MapLibre's own class sets `position: relative` on its container.
        h('div', { ref: mapRef, className: 'atl-map', style: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } }),
        ready && mapReady && !story ? topBar : null,
        ready && mapReady && !story && searchNote ? h('div', { className: 'atl-glass atl-fade', style: { position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 21, padding: '8px 14px', maxWidth: 520, color: C.muted, fontSize: 12.5 } }, searchNote) : null,
        ready && mapReady && !story && !drawerOpen && !settingsOpen ? h(TodayCard, { t, today, narrow, onMemory: showMemory, onEvent: showEvent }) : null,
        ready && mapReady && !story && !(narrow && drawerOpen) ? h(Timeline, { t, bins: timeline.bins, focus: focusRef.current.bins, range, playing, extra: filter, shown: shown.current.list.length, onPlay: () => setPlaying(!playing), onRange: (r) => (setPlaying(false), setRange(r), r === null && setFilter(null)) }) : null,
        ready && mapReady ? drawer : null,
        ready && mapReady && layersOpen && !story ? layersMenu : null,
        ready && mapReady && settingsOpen && !story
          ? h(SettingsSheet, {
              t,
              state,
              center: () => globeRef.current?.center(),
              onClose: () => setSettingsOpen(false),
              onSaved: (st, rebuilt) => {
                const basemapChanged = st?.settings?.basemap !== state?.settings?.basemap;
                setState(st);
                if (rebuilt || basemapChanged || st.builtAt !== state?.builtAt) {
                  globeRef.current?.destroy();
                  globeRef.current = null;
                  setMapReady(false);
                  setPoints(null);
                  setState({ ...st, status: 'building' });
                  setReload((r) => r + 1);
                } else getJson(`${ROUTE}/trips`).then((b) => b?.ok && setTrips(b.trips));
              },
            })
          : null,
        story && mapReady ? h(Story, { t, trip: story, globe: globeRef.current, onExit: () => setStory(null) }) : null,
        viewer
          ? h(Viewer, {
              t,
              ids: viewer.ids,
              index: viewer.index,
              narrow,
              onClose: () => setViewer(null),
              onStep: (d) => setViewer((v) => (v ? { ...v, index: Math.max(0, Math.min(v.ids.length - 1, v.index + d)) } : v)),
              onLocate: (p) => {
                setViewer(null);
                globeRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 2000 });
              },
              onLabel: (w) => {
                setViewer(null);
                setQuery(w);
                runSearch(w);
              },
            })
          : null,
        blocking
          ? h(StatusScreen, {
              t,
              state,
              failed,
              libsFailed,
              onRetry: (path) => {
                if (path && path !== state?.settings?.library) postJson(`${ROUTE}/settings`, { library: path }).then(() => setReload((r) => r + 1));
                else postJson(`${ROUTE}/rebuild`, {}).then(() => setReload((r) => r + 1));
              },
            })
          : null,
      );
    }

    // --- in the conversation ------------------------------------------------------------

    function parseArgs(block) {
      const raw = block?.argsRaw ?? block?.call?.argsRaw;
      if (typeof raw === 'string' && raw !== '') {
        try {
          return JSON.parse(raw);
        } catch {
          // Streaming.
        }
      }
      const args = block?.args;
      if (args && typeof args === 'object') {
        try {
          return typeof args.toJSON === 'function' ? args.toJSON() : { ...args };
        } catch {
          return {};
        }
      }
      return {};
    }
    function resultText(block) {
      return (Array.isArray(block?.content) ? block.content : [])
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }
    const TOOL_LABEL = { atlas_search: 'toolSearch', atlas_show: 'toolShow', atlas_trips: 'toolTrips', atlas_stats: 'toolStats', atlas_today: 'toolToday', atlas_look: 'toolLook' };
    function argSummary(name, args) {
      if (name === 'atlas_trips') return [args.id, args.year, args.country, args.abroad ? '✈' : ''].filter(Boolean).join(' · ');
      if (name === 'atlas_stats') return args.year ? String(args.year) : '';
      if (name === 'atlas_today') return args.date ?? '';
      if (name === 'atlas_look') return Array.isArray(args.ids) ? `${args.ids.length}` : '';
      const parts = [args.place, args.country, args.trip, args.from || args.to ? [args.from, args.to].filter(Boolean).join('–') : '', Array.isArray(args.months) ? args.months.join('/') : '', Array.isArray(args.labels) ? args.labels.join(' · ') : '', Array.isArray(args.people) ? args.people.join(' · ') : ''];
      return parts.filter(Boolean).join(' · ');
    }

    /** The tool's own line inside the turn's process fold. */
    function AtlasToolView(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      const { phase, block } = props;
      const name = String(block?.name ?? block?.call?.name ?? props.name ?? '');
      const args = parseArgs(block);
      const settled = phase === 'result';
      const text = settled ? resultText(block) : '';
      const [open, setOpen] = useState(false);
      const first = text.split('\n')[0] ?? '';
      return h(
        'div',
        { 'data-dsh-atlas-tool': name, style: { fontSize: SMALL, color: C.appMuted, minWidth: 0 } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline', gap: 8, cursor: text ? 'pointer' : 'default' }, onClick: () => text && setOpen(!open) },
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: settled && !block?.isError ? C.label : C.appFaint, fontWeight: 600, flex: 'none' } }, h(AtlasGlyph, { size: 14, active: settled && !block?.isError }), t(TOOL_LABEL[name] ?? 'toolTitle')),
          h('span', { style: { color: C.appFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, argSummary(name, args)),
          !settled ? h('span', { style: { fontStyle: 'italic', color: C.appFaint } }, t('working')) : null,
        ),
        settled ? h('div', { style: { marginTop: 3, color: block?.isError ? 'var(--dsw-alias-state-error-primary, #f25a5a)' : C.appFaint, whiteSpace: open ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'text', wordBreak: 'break-word' } }, open ? text : first) : null,
      );
    }

    // This plugin's tool calls by id, as the feed announces them.
    const ownCalls = new Map();
    function resultMeta(event) {
      if (event?.type !== 'tool/result' || event.surfaceOp !== 'append') return null;
      const data = event.data ?? {};
      const callId = String(data.message?.source?.callId ?? data.message?.toolCallId ?? '');
      const card = data.meta?.atlas;
      if (!card || typeof card !== 'object' || !TOOL_NAMES.includes(card.tool)) return null;
      return { callId, card };
    }
    const resultDefinition = {
      kind: RESULT_KIND,
      target: 'chat',
      match: (event) => {
        if (event?.type === 'tool/call') {
          if (TOOL_NAMES.includes(event.data?.name)) ownCalls.set(String(event.data.callId), event.data.name);
          return null;
        }
        const hit = resultMeta(event);
        if (!hit) return null;
        return { id: hit.callId || String(event.seq), role: 'start' };
      },
      start: (_context, match) => {
        const data = match.event.data ?? {};
        return { callId: String(data.message?.source?.callId ?? data.message?.toolCallId ?? ''), seq: match.event.seq, isError: data.message?.isError === true, card: data.meta?.atlas ?? null };
      },
      update: (context) => context.state,
      buildViewNode: (context) => {
        const s = context.state;
        if (!s || s.isError || !s.card || s.card.tool === 'atlas_look') return null;
        const c = s.card;
        const has = c.compact || (c.ids?.length ?? 0) > 0 || (c.trips?.length ?? 0) > 0 || (c.countries?.length ?? 0) > 0 || (c.memories?.length ?? 0) > 0;
        if (!has) return null;
        return { key: context.key, kind: RESULT_KIND, id: context.id, target: 'chat', anchorSeq: s.seq + 0.2, location: context.start.location, visibility: 'visible', groupTree: 'turn', data: s };
      },
    };

    function AtlasResultRow(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      const card = props.node?.data?.card ?? {};
      const open = (cmd) => {
        props.openPanel();
        setTimeout(() => bus.emit(cmd), 50);
      };
      const button = (cmd) => h('button', { onClick: () => open(cmd), style: { appearance: 'none', border: `1px solid ${C.appBorder}`, background: 'transparent', color: C.label, borderRadius: 8, height: 26, padding: '0 10px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(AtlasGlyph, { size: 13, active: true }), t('openOnMap'));
      const strip = (ids, onClick) =>
        h(
          'div',
          { className: 'atl-strip', style: { display: 'flex', gap: 5, overflow: 'hidden' } },
          ids.slice(0, 8).map((id, i) => h('img', { key: id, src: thumbUrl(id), loading: 'lazy', alt: '', onClick: () => onClick(i), style: { width: 72, height: 72, objectFit: 'cover', borderRadius: 9, flex: 'none', cursor: 'pointer', background: C.appLayer } })),
        );
      let body = null;
      let cmd = null;
      if (card.tool === 'atlas_trips' && Array.isArray(card.trips)) {
        body = h(
          'div',
          { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          card.trips.map((tr) =>
            h(
              'div',
              { key: tr.id, onClick: () => open({ kind: 'trip', trip: tr.id, story: false, open: true }), style: { display: 'flex', gap: 8, alignItems: 'center', padding: 5, paddingRight: 10, border: `1px solid ${C.appBorder}`, borderRadius: 10, cursor: 'pointer', maxWidth: 260 } },
              h('img', { src: thumbUrl(tr.cover), alt: '', style: { width: 40, height: 40, objectFit: 'cover', borderRadius: 7 } }),
              h('div', { style: { minWidth: 0 } }, h('div', { style: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, `${tr.abroad ? '✈ ' : ''}${tr.places.join(' → ')}`), h('div', { style: { fontSize: 11.5, color: C.appFaint } }, `${tr.start} · ${t(tr.days > 1 ? 'daysN' : 'dayN', { n: tr.days })}`)),
            ),
          ),
        );
      } else if (card.tool === 'atlas_stats' && Array.isArray(card.countries)) {
        body = h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 } }, card.countries.map((c) => h('span', { key: c.cc, title: c.name, style: { fontSize: 20 } }, c.flag || c.cc)), h('span', { style: { color: C.appFaint, marginLeft: 6 } }, [t('citiesN', { n: card.cities }), t('tripsN', { n: card.trips }), t('km', { n: fmtNum(card.km) })].join(' · ')));
        cmd = { kind: 'highlight', ids: [], open: true };
      } else if (card.compact) {
        // atlas_show: the map is already open; a way back to it is enough.
        cmd = card.trip ? { kind: 'trip', trip: card.trip, open: true } : card.query ? { kind: 'highlight', query: card.query, bbox: card.bbox, ids: card.ids ?? [], label: card.title, open: true } : { kind: 'highlight', ids: card.ids ?? [], bbox: card.bbox, label: card.title, open: true };
        return h('div', { 'data-dsh-atlas-row': card.tool, style: { padding: '2px 0 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: SMALL, color: C.appMuted } }, button(cmd), card.title ? h('span', null, card.title) : null);
      } else if (Array.isArray(card.ids) && card.ids.length) {
        cmd = card.trip ? { kind: 'trip', trip: card.trip, open: true } : card.query ? { kind: 'highlight', query: card.query, bbox: card.bbox, ids: card.ids, label: card.title, open: true } : { kind: 'highlight', ids: card.ids, bbox: card.bbox, label: card.title, open: true };
        body = strip(card.ids, (i) => open({ kind: 'highlight', ids: card.ids, focus: card.ids[i], bbox: card.bbox, open: true }));
      }
      if (!body) return null;
      return h(
        'div',
        { 'data-dsh-atlas-row': card.tool, style: { padding: '4px 0 10px', display: 'flex', flexDirection: 'column', gap: 7 } },
        card.title || card.total ? h('div', { style: { fontSize: SMALL, color: C.appMuted } }, [card.title, card.total ? t('photos', { n: fmtNum(card.total) }) : ''].filter(Boolean).join(' · ')) : null,
        body,
        cmd ? h('div', null, button(cmd)) : null,
      );
    }

    function openPanel(ctx) {
      try {
        const layout = ctx.get?.('layout');
        if (!layout || typeof layout.selectPanel !== 'function') return false;
        layout.selectPanel(PANEL_ID);
        return true;
      } catch {
        return false;
      }
    }

    return {
      inject: ['slots', 'locale', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTIONARY), 'atlas: dictionaries');
        let bound = null;
        const tr = (key, params) => {
          try {
            if (bound === null && typeof ctx.locale.bind === 'function') bound = ctx.locale.bind(NS);
            if (typeof bound === 'function') return bound(key, params);
          } catch {
            // The English below.
          }
          return fallbackT(key, params);
        };
        const withT = (Component, extra) => (props) => h(Component, { ...props, ...extra, t: typeof props.t === 'function' ? props.t : tr });
        const open = () => openPanel(ctx);

        for (const name of TOOL_NAMES) {
          ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: name, locale: NS }, withT(AtlasToolView, { name })));
        }
        ctx.uiConversation.events.register(resultDefinition);
        ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: RESULT_KIND, locale: NS }, withT(AtlasResultRow, { openPanel: open })));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 32, label: () => tr('title') }, AtlasGlyph));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, withT(AtlasPanel)));

        // Map commands the tools leave on the Host: open the panel and pass them on.
        if (typeof document !== 'undefined' && typeof fetch === 'function') {
          let after = null;
          let stopped = false;
          let timer = 0;
          const poll = () => {
            if (stopped) return;
            const hidden = typeof document !== 'undefined' && document.hidden;
            (hidden ? Promise.resolve(null) : getJson(`${ROUTE}/commands${after === null ? '' : `?after=${after}`}`))
              .then((b) => {
                if (!b?.ok) return;
                if (after === null) {
                  // Older commands were for another page load.
                  after = b.seq;
                  return;
                }
                after = b.seq;
                for (const cmd of b.commands ?? []) {
                  if (Date.now() - cmd.at > 60_000) continue;
                  if (cmd.open) open();
                  setTimeout(() => bus.emit(cmd), cmd.open ? 300 : 0);
                }
              })
              .catch(() => {})
              .finally(() => {
                if (!stopped) timer = setTimeout(poll, POLL_MS);
              });
          };
          poll();
          ctx.effect(() => () => {
            stopped = true;
            clearTimeout(timer);
          }, 'atlas: command poll');
        }

        if (typeof ctx.inject === 'function') {
          ctx.inject(['commandUi'], (scope) => {
            scope.effect(
              () =>
                scope.commandUi.decorate({
                  name: 'atlas',
                  available: () => typeof ctx.get?.('layout')?.selectPanel === 'function',
                  ui: { kind: 'action', run: () => void open() },
                }),
              'atlas: /atlas opens the panel',
            );
          });
        }
      },
    };
  },
});
