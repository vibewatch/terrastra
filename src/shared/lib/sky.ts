/**
 * Sky frames shared by every scale. Galactic coordinates (l, b) put x toward the Galactic Centre, y toward l = 90°
 * (the way the Sun travels) and z toward the north galactic pole. Ecliptic J2000 is the Solar System frame used by
 * orbits.ts. Both get mapped to three.js as (x, z, −y), so each frame's "plane" is three's XZ plane and its north +Y.
 */
import type { Vec3 } from './orbits.ts';

const D2R = Math.PI / 180;
const EPS = 23.4392911 * D2R;
/** Equatorial J2000 → galactic rotation (rows are the galactic axes in equatorial coordinates). */
const EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];

/** Unit vector (times `dist`) for galactic longitude / latitude in degrees. */
export function galVec(l: number, b: number, dist = 1): Vec3 {
  const cl = Math.cos(l * D2R), sl = Math.sin(l * D2R), cb = Math.cos(b * D2R), sb = Math.sin(b * D2R);
  return [dist * cb * cl, dist * cb * sl, dist * sb];
}

export function eqToGal(v: Vec3): Vec3 {
  const m = EQ2GAL;
  return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
}

export function galToEq(v: Vec3): Vec3 {
  const m = EQ2GAL;
  return [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2], m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2], m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]];
}

function eclToEq(v: Vec3): Vec3 {
  const c = Math.cos(EPS), s = Math.sin(EPS);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

export function eqToEcl(v: Vec3): Vec3 {
  const c = Math.cos(EPS), s = Math.sin(EPS);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

export const eclToGal = (v: Vec3): Vec3 => eqToGal(eclToEq(v));
export const galToEcl = (v: Vec3): Vec3 => eqToEcl(galToEq(v));

/** RA / Dec (degrees, J2000) → galactic l, b (degrees, l in 0..360). */
export function radecToGal(ra: number, dec: number): [number, number] {
  const cd = Math.cos(dec * D2R);
  const g = eqToGal([cd * Math.cos(ra * D2R), cd * Math.sin(ra * D2R), Math.sin(dec * D2R)]);
  const l = Math.atan2(g[1], g[0]) / D2R;
  return [(l + 360) % 360, Math.asin(Math.max(-1, Math.min(1, g[2]))) / D2R];
}

/** Galactic l, b (degrees) → equatorial J2000 RA (0..360°) and Dec (−90..+90°). */
export function galToRadec(l: number, b: number): [number, number] {
  const e = galToEq(galVec(l, b, 1));
  const ra = (Math.atan2(e[1], e[0]) / D2R + 360) % 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, e[2]))) / D2R;
  return [ra, dec];
}

/** Numerically stable angular separation (0..180°) between two non-zero 3D direction vectors. */
export function angularSepDeg(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
  if (!(la > 0) || !(lb > 0)) return 0;
  const ax = a[0] / la, ay = a[1] / la, az = a[2] / la;
  const bx = b[0] / lb, by = b[1] / lb, bz = b[2] / lb;
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz) / D2R;
}

/** Formats J2000 RA/Dec degrees as compact astronomical coordinates ("05h 35m · −05.4°"). */
export function fmtRadec(raDeg: number, decDeg: number): string {
  const totalMin = Math.round((((raDeg % 360) + 360) % 360) / 15 * 60) % (24 * 60);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  const sign = decDeg >= 0 ? '+' : '−';
  return `${hh}h ${mm}m · ${sign}${Math.abs(decDeg).toFixed(1)}°`;
}

/** The north celestial pole in galactic coordinates (for sky "north" when orienting galaxy discs). */
export const NCP_GAL: Vec3 = eqToGal([0, 0, 1]);
