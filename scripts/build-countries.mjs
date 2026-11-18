// Build vendor/countries.json from Natural Earth's 1:110m admin-0 countries
// (public domain): ISO code + English/Chinese names, coordinates rounded to
// 0.01°, everything else dropped. Run: node scripts/build-countries.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'countries.json');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`${res.status} ${SRC}`);
const src = await res.json();

const round = (n) => Math.round(n * 100) / 100;
const ring = (r) => {
  const pts = [];
  for (const [x, y] of r) {
    const p = [round(x), round(y)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  return pts.length >= 4 ? pts : null;
};
const poly = (p) => {
  const rings = p.map(ring).filter(Boolean);
  return rings.length > 0 ? rings : null;
};

// Short, neutral display names where Natural Earth's are long-form.
const NAMES = { CN: ['China', '中国'], TW: ['Taiwan', '台湾'], US: ['United States', '美国'], KR: ['South Korea', '韩国'], KP: ['North Korea', '朝鲜'], RU: ['Russia', '俄罗斯'] };

const features = [];
for (const f of src.features) {
  const p = f.properties;
  // ISO_A2 is -99 for a few (France, Norway); the "EH" column fills them in.
  let iso = [p.ISO_A2_EH, p.ISO_A2, p.WB_A2].find((v) => typeof v === 'string' && /^[A-Z]{2}$/.test(v));
  if (!iso) continue;
  const g = f.geometry;
  let coordinates;
  if (g.type === 'Polygon') coordinates = [poly(g.coordinates)].filter(Boolean);
  else coordinates = g.coordinates.map(poly).filter(Boolean);
  if (coordinates.length === 0) continue;
  features.push({
    type: 'Feature',
    properties: { iso, en: NAMES[iso]?.[0] ?? (p.NAME_EN || p.NAME), zh: NAMES[iso]?.[1] ?? (p.NAME_ZH || p.NAME_EN || p.NAME) },
    geometry: { type: 'MultiPolygon', coordinates },
  });
}
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', source: 'Natural Earth 1:110m admin-0 countries v5.1.2 (public domain)', features }));
console.log(`${features.length} countries → ${out}`);
