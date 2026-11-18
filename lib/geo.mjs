/**
 * Small spherical-geometry helpers.
 *
 * @module geo
 */

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in km. */
export function km(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Points along the great circle from A to B (inclusive), as `[lng, lat]`,
 * with longitudes kept continuous so a line across the antimeridian draws
 * the short way.
 */
export function arc(lat1, lng1, lat2, lng2, steps = 0) {
  const d = km(lat1, lng1, lat2, lng2) / R;
  const n = steps > 0 ? steps : Math.max(2, Math.min(128, Math.ceil(d * R / 60)));
  if (d < 1e-9) return [[lng1, lat1], [lng2, lat2]];
  const p1 = rad(lat1);
  const l1 = rad(lng1);
  const p2 = rad(lat2);
  const l2 = rad(lng2);
  const out = [];
  let prev = null;
  for (let i = 0; i <= n; i += 1) {
    const f = i / n;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
    const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
    const z = a * Math.sin(p1) + b * Math.sin(p2);
    const lat = deg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lng = deg(Math.atan2(y, x));
    if (prev !== null) {
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
    }
    prev = lng;
    out.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]);
  }
  return out;
}

/** `[west, south, east, north]` around points `{lat, lng}`; null for none. */
export function bboxOf(points) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    if (p.lat === null || p.lat === undefined) continue;
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  if (!Number.isFinite(w)) return null;
  return [w, s, e, n].map((v) => Math.round(v * 1e4) / 1e4);
}

/** The middle of points (median lat/lng, robust to strays); null for none. */
export function centerOf(points) {
  const lats = [];
  const lngs = [];
  for (const p of points) {
    if (p.lat === null || p.lat === undefined) continue;
    lats.push(p.lat);
    lngs.push(p.lng);
  }
  if (lats.length === 0) return null;
  const mid = (a) => {
    a.sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  return { lat: mid(lats), lng: mid(lngs) };
}

/** Whether `[lng, lat]` is inside one polygon (rings of `[lng, lat]`, the first outer). */
function inPolygon(lng, lat, rings) {
  let inside = false;
  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r];
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    if (r === 0) inside = hit;
    else if (hit) return false;
  }
  return inside;
}

/**
 * A lookup from a point to the country polygon it is in.
 * @param {{features: Array<{properties: {iso: string}, geometry: {coordinates: number[][][][]}}>}} countries
 */
export function createCountryLookup(countries) {
  const items = (countries?.features ?? []).map((f) => {
    const polys = f.geometry.coordinates;
    let w = 180;
    let s = 90;
    let e = -180;
    let n = -90;
    for (const p of polys) for (const [x, y] of p[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    return { props: f.properties, polys, box: [w, s, e, n] };
  });
  return (lat, lng) => {
    for (const it of items) {
      const [w, s, e, n] = it.box;
      if (lng < w || lng > e || lat < s || lat > n) continue;
      for (const p of it.polys) if (inPolygon(lng, lat, p)) return it.props;
    }
    return null;
  };
}

/**
 * The night side of the Earth at `date`: a polygon of `[lng, lat]` covering
 * everything more than 90° from the subsolar point.
 */
export function nightPolygon(date = new Date()) {
  const d = (date.getTime() / 86400000) + 2440587.5 - 2451545.0;
  const g = rad((357.529 + 0.98560028 * d) % 360);
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = rad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * d);
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  let sunLng = deg(ra) - gmst * 15;
  sunLng = ((sunLng + 540) % 360) - 180;
  const sunLat = deg(decl);
  // The terminator: for each longitude, the latitude where the sun is on the horizon.
  const pts = [];
  const tanDecl = Math.tan(decl);
  for (let lng = -180; lng <= 180; lng += 3) {
    const ha = rad(lng - sunLng);
    let lat = deg(Math.atan(-Math.cos(ha) / (Math.abs(tanDecl) < 1e-6 ? 1e-6 : tanDecl)));
    pts.push([lng, Math.round(lat * 100) / 100]);
  }
  // Night is on the pole away from the sun.
  const pole = sunLat > 0 ? -90 : 90;
  return { type: 'Polygon', coordinates: [[...pts, [180, pole], [-180, pole], pts[0]]], sun: { lat: sunLat, lng: sunLng } };
}

/** A coarse grid index of points for "anything within r km" questions. */
export function createGrid(points, cellDeg = 0.5) {
  const cells = new Map();
  const key = (lat, lng) => `${Math.floor(lat / cellDeg)}:${Math.floor(lng / cellDeg)}`;
  for (const p of points) {
    if (p.lat === null || p.lat === undefined) continue;
    const k = key(p.lat, p.lng);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = []));
    c.push(p);
  }
  return {
    /** The nearest point within `maxKm`, as `{point, km}`, or null. */
    nearest(lat, lng, maxKm) {
      const span = Math.ceil(maxKm / (111 * cellDeg)) + 1;
      const cy = Math.floor(lat / cellDeg);
      const cx = Math.floor(lng / cellDeg);
      let best = null;
      const lngSpan = Math.min(Math.ceil(span / Math.max(0.05, Math.cos(rad(lat)))), Math.ceil(360 / cellDeg));
      for (let y = cy - span; y <= cy + span; y += 1) {
        for (let x = cx - lngSpan; x <= cx + lngSpan; x += 1) {
          const c = cells.get(`${y}:${x}`);
          if (!c) continue;
          for (const p of c) {
            const d = km(lat, lng, p.lat, p.lng);
            if (d <= maxKm && (best === null || d < best.km)) best = { point: p, km: d };
          }
        }
      }
      return best;
    },
    /** Every point within `maxKm`. */
    within(lat, lng, maxKm) {
      const span = Math.ceil(maxKm / (111 * cellDeg)) + 1;
      const cy = Math.floor(lat / cellDeg);
      const cx = Math.floor(lng / cellDeg);
      const lngSpan = Math.min(Math.ceil(span / Math.max(0.05, Math.cos(rad(lat)))), Math.ceil(360 / cellDeg));
      const out = [];
      for (let y = cy - span; y <= cy + span; y += 1) {
        for (let x = cx - lngSpan; x <= cx + lngSpan; x += 1) {
          const c = cells.get(`${y}:${x}`);
          if (!c) continue;
          for (const p of c) if (km(lat, lng, p.lat, p.lng) <= maxKm) out.push(p);
        }
      }
      return out;
    },
  };
}
