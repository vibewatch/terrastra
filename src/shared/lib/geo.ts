const R_KM = 6371;
const D2R = Math.PI / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * D2R, dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing in degrees (0 = north, clockwise). */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
export function arrow8(bearing: number): string {
  return ARROWS[Math.round(bearing / 45) % 8];
}

/** Unit vector for lat/lon on a Y-up sphere where lon=0 faces +Z. */
export function latLonToVec(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = lat * D2R, lam = lon * D2R;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}

export function vecToLatLon(x: number, y: number, z: number): [number, number] {
  const r = Math.hypot(x, y, z) || 1;
  return [Math.asin(y / r) / D2R, Math.atan2(x, z) / D2R];
}

/** Spherical interpolation between two lat/lon points; t in [0,1]. */
export function slerpLatLon(a: [number, number], b: [number, number], t: number): [number, number] {
  const va = latLonToVec(a[0], a[1]), vb = latLonToVec(b[0], b[1]);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  if (om < 1e-6) return a;
  const s = Math.sin(om), ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  return vecToLatLon(va[0] * ka + vb[0] * kb, va[1] * ka + vb[1] * kb, va[2] * ka + vb[2] * kb);
}

export function formatKm(km: number, lang = 'en'): string {
  return new Intl.NumberFormat(lang).format(Math.round(km)) + ' km';
}
