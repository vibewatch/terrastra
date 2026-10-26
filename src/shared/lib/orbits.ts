/**
 * Orbital positions for the solar view. Planets use JPL's approximate Keplerian elements; the Moon uses a short
 * lunar series (so its phase is right); other moons run on circular orbits. Output is ecliptic J2000:
 * x toward the vernal equinox, z toward the north ecliptic pole. Distances in AU (planets) or km (moons).
 */
import { BODY, type BodyId, type Kepler } from '../data/solar.ts';

const D2R = Math.PI / 180;
export const AU_KM = 149_597_870.7;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export type Vec3 = [number, number, number];

/** Days since J2000.0 (TT ≈ UTC is fine here). */
export function daysJ2000(ms: number): number { return (ms - J2000_MS) / 864e5; }

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Heliocentric ecliptic position (AU) from Keplerian elements at `d` days after J2000. */
export function keplerPosition(k: Kepler, d: number): Vec3 {
  const T = d / 36525;
  const el = (p: [number, number]) => p[0] + p[1] * T;
  const a = el(k.a), e = el(k.e), I = el(k.i) * D2R, L = el(k.L), peri = el(k.peri), node = el(k.node);
  const w = (peri - node) * D2R, O = node * D2R;
  let M = ((L - peri) % 360) * D2R;
  if (M > Math.PI) M -= 2 * Math.PI; else if (M < -Math.PI) M += 2 * Math.PI;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** Geocentric ecliptic position of the Moon (km), accurate to about a degree. */
function moonPosition(d: number): Vec3 {
  const L = (218.316 + 13.176396 * d) * D2R, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.22935 * d) * D2R;
  const D = (297.85 + 12.190749 * d) * D2R;
  const lam = L + (6.289 * Math.sin(M) - 1.274 * Math.sin(M - 2 * D) + 0.658 * Math.sin(2 * D)) * D2R;
  const beta = 5.128 * Math.sin(F) * D2R;
  const r = 385001 - 20905 * Math.cos(M);
  return [r * Math.cos(beta) * Math.cos(lam), r * Math.cos(beta) * Math.sin(lam), r * Math.sin(beta)];
}

/** Unit vector of a body's north pole in ecliptic coordinates. */
export function poleOf(id: BodyId): Vec3 {
  const b = BODY[id];
  if (b.kind === 'moon' && b.parent && id !== 'moon') return poleOf(b.parent);
  const t = b.tilt * D2R, l = (b.poleLon ?? 90) * D2R;
  return [Math.sin(t) * Math.cos(l), Math.sin(t) * Math.sin(l), Math.cos(t)];
}

/**
 * Position relative to the parent (or the Sun for planets): AU for planets/dwarfs, km for moons.
 * Circular moons orbit in the parent's equatorial plane.
 */
export function relativePosition(id: BodyId, d: number): Vec3 {
  const b = BODY[id];
  if (b.kepler) return keplerPosition(b.kepler, d);
  if (id === 'moon') return moonPosition(d);
  if (!b.moon || !b.parent) return [0, 0, 0];
  const ang = (b.moon.L0 + (360 / b.moon.periodD) * d) * D2R;
  const p = poleOf(b.parent);
  // Orthonormal basis (u, v) of the parent's equatorial plane.
  const n = cross([0, 0, 1], p), u = Math.hypot(n[0], n[1], n[2]) < 1e-6 ? [1, 0, 0] as Vec3 : norm(n);
  const v = cross(p, u);
  const r = b.moon.aKm, c = Math.cos(ang) * r, s = Math.sin(ang) * r;
  return [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
}

export const LIGHT_KMS = 299_792.458;

/** True heliocentric ecliptic position in km (moons: their planet's position plus the moon's offset). */
export function helioKm(id: BodyId, d: number): Vec3 {
  const b = BODY[id];
  if (b.kepler) { const p = keplerPosition(b.kepler, d); return [p[0] * AU_KM, p[1] * AU_KM, p[2] * AU_KM]; }
  if (!b.parent) return [0, 0, 0];
  const par = helioKm(b.parent, d), m = relativePosition(id, d);
  return [par[0] + m[0], par[1] + m[1], par[2] + m[2]];
}

/** Centre-to-centre distance between two bodies (km) on day `d` since J2000. */
export function distanceKm(a: BodyId, b: BodyId, d: number): number {
  const p = helioKm(a, d), q = helioKm(b, d);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function norm(a: Vec3): Vec3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/**
 * Display scale for the overview: real distances would put Neptune 80,000 Earth-radii away, so orbit radii are
 * compressed with a square root and body sizes with a power law. Close-ups use the body at radius `displayRadius`.
 */
export function displayOrbit(au: number): number { return 12 * Math.sqrt(au); }
export function displayRadius(id: BodyId): number {
  if (id === 'sun') return 2.6;
  return 0.34 * Math.pow(BODY[id].radiusKm / 6371, 0.45);
}
/** Moon distance from its parent in display units, monotonic in the real distance. */
export function displayMoonDist(id: BodyId): number {
  const b = BODY[id], p = BODY[b.parent!];
  const rel = b.moon!.aKm / p.radiusKm;
  return displayRadius(p.id) * (1.7 + 0.42 * Math.sqrt(rel)) + displayRadius(id) * 1.5;
}
