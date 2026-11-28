/**
 * Orbital positions for the solar view. Planets use JPL's approximate Keplerian elements; the Moon uses a short
 * lunar series (so its phase is right); other moons run on fixed Keplerian ellipses (mostly circles). Output is ecliptic J2000:
 * x toward the vernal equinox, z toward the north ecliptic pole. Distances in AU (planets) or km (moons).
 */
import { BODY, type BodyId, type Kepler } from '../data/solar.ts';
import { cross, norm } from './vec3.ts';

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
 * Other moons orbit in the parent's equatorial plane (or the ecliptic for `laplace` orbits), eccentric if `e` is set.
 */
export function relativePosition(id: BodyId, d: number): Vec3 {
  const b = BODY[id];
  if (b.kepler) return keplerPosition(b.kepler, d);
  if (id === 'moon') return moonPosition(d);
  const m = b.moon;
  if (!m || !b.parent) return [0, 0, 0];
  const p: Vec3 = m.laplace ? [0, 0, 1] : poleOf(b.parent);
  // Orthonormal basis (u, v) of the orbit plane.
  const n = cross([0, 0, 1], p), u = Math.hypot(n[0], n[1], n[2]) < 1e-6 ? [1, 0, 0] as Vec3 : norm(n);
  const v = cross(p, u);
  let c: number, s: number;
  const L = m.L0 + (360 / m.periodD) * d;
  if (m.e) {
    const e = m.e, w = (m.peri ?? 0) * D2R;
    let M = (((L - (m.peri ?? 0)) % 360) + 540) % 360 - 180;
    M *= D2R;
    const E = solveKepler(M, e), x = m.aKm * (Math.cos(E) - e), y = m.aKm * Math.sqrt(1 - e * e) * Math.sin(E);
    c = x * Math.cos(w) - y * Math.sin(w); s = x * Math.sin(w) + y * Math.cos(w);
  } else {
    const ang = L * D2R;
    c = Math.cos(ang) * m.aKm; s = Math.sin(ang) * m.aKm;
  }
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

/** Typical interstellar cruise speed of Voyager 1 (~17.0 km/s). */
export const PROBE_KMS = 17.0;
const GM_SUN_KM3_S2 = 1.32712440018e11;
const G_EARTH_MS2 = 9.80665;

/** Surface escape velocity (km/s) derived from surface gravity and mean radius, or null when unknown. */
export function escapeVelocityKms(id: BodyId): number | null {
  const b = BODY[id];
  if (!b || !(b.radiusKm > 0)) return null;
  if (id === 'sun') return +(Math.sqrt((2 * GM_SUN_KM3_S2) / b.radiusKm)).toFixed(1);
  if (b.facts.gravity === undefined || !(b.facts.gravity > 0)) return null;
  const vMs = Math.sqrt(2 * b.facts.gravity * G_EARTH_MS2 * b.radiusKm * 1000);
  const vKms = vMs / 1000;
  return vKms >= 1 ? +vKms.toFixed(2) : +vKms.toFixed(3);
}

/** Instantaneous orbital speed (km/s) around the Sun (planets/dwarfs via vis-viva) or parent planet (moons) on day `d` since J2000. */
export function orbitalSpeedKms(id: BodyId, d: number): number | null {
  const b = BODY[id];
  if (!b || id === 'sun') return null;
  if (b.kepler) {
    const p = keplerPosition(b.kepler, d);
    const rKm = Math.hypot(p[0], p[1], p[2]) * AU_KM;
    const T = d / 36525;
    const aKm = (b.kepler.a[0] + b.kepler.a[1] * T) * AU_KM;
    if (!(rKm > 0) || !(aKm > 0)) return null;
    return +Math.sqrt(GM_SUN_KM3_S2 * Math.max(0, 2 / rKm - 1 / aKm)).toFixed(2);
  }
  if (b.kind === 'moon' && b.parent) {
    const dtDays = 0.01;
    const p0 = relativePosition(id, d - dtDays);
    const p1 = relativePosition(id, d + dtDays);
    const v = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) / (2 * dtDays * 86400);
    return +v.toFixed(2);
  }
  return null;
}

/**
 * Minimum-energy Hohmann transfer duration (hours) between two Solar System bodies,
 * either heliocentric (planet/dwarf ↔ planet/dwarf) or planet ↔ moon from a 300 km parking orbit.
 */
export function hohmannTransferHours(a: BodyId, b: BodyId): number | null {
  if (a === b) return 0;
  const ba = BODY[a], bb = BODY[b];
  if (!ba || !bb || a === 'sun' || b === 'sun') return null;
  const cislunar = (planet: BodyId, moon: BodyId): number | null => {
    const p = BODY[planet], m = BODY[moon];
    if (p.facts.gravity === undefined || !(p.facts.gravity > 0)) return null;
    const r1 = p.radiusKm + 300;
    const r2 = moon === 'moon' ? 384_400 : m.moon?.aKm ?? 0;
    if (!(r2 > r1)) return null;
    const gmKm3S2 = p.facts.gravity * (G_EARTH_MS2 / 1000) * p.radiusKm * p.radiusKm;
    return (Math.PI * Math.sqrt(Math.pow((r1 + r2) / 2, 3) / gmKm3S2)) / 3600;
  };
  if (ba.parent === b && ba.kind === 'moon') return cislunar(b, a);
  if (bb.parent === a && bb.kind === 'moon') return cislunar(a, b);
  const auOf = (id: BodyId): number | null => {
    const x = BODY[id];
    if (x.kepler) return x.kepler.a[0];
    if (x.parent && BODY[x.parent]?.kepler) return BODY[x.parent].kepler!.a[0];
    return null;
  };
  const r1AU = auOf(a), r2AU = auOf(b);
  if (!r1AU || !r2AU || Math.abs(r1AU - r2AU) < 1e-4) return null;
  const years = 0.5 * Math.pow((r1AU + r2AU) / 2, 1.5);
  return years * 365.25 * 24;
}

/** One-way light / radio travel delay (seconds) between two Solar System bodies on day `d` since J2000. */
export function lightDelaySec(a: BodyId, b: BodyId, d: number): number {
  return distanceKm(a, b, d) / LIGHT_KMS;
}

/** Straight-line spacecraft transit time (hours) between two bodies at `speedKms` (default Voyager 1 ~17 km/s). */
export function probeTransitHours(a: BodyId, b: BodyId, d: number, speedKms = PROBE_KMS): number {
  return distanceKm(a, b, d) / Math.max(0.1, speedKms) / 3600;
}

/** Apparent angular diameter (arcseconds) of body `id` as seen from `from` (default `'earth'`) on day `d` since J2000. */
export function apparentArcsec(id: BodyId, d: number, from: BodyId = 'earth'): number {
  if (id === from) return 0;
  const dist = distanceKm(id, from, d);
  if (!(dist > 0)) return 0;
  return (2 * Math.atan2(BODY[id].radiusKm, dist) * 180 / Math.PI) * 3600;
}

/** IAU 2015 nominal total solar irradiance at 1 AU (W/m²). */
export const SOLAR_CONSTANT_WM2 = 1361;

/** Representative Bond albedos for planetary radiative-equilibrium calculations. */
const BOND_ALBEDO: Partial<Record<BodyId, number>> = {
  mercury: 0.068, venus: 0.77, earth: 0.306, moon: 0.11, mars: 0.25, ceres: 0.034,
  jupiter: 0.503, io: 0.63, europa: 0.67, ganymede: 0.43, callisto: 0.17,
  saturn: 0.342, enceladus: 0.81, titan: 0.22,
  uranus: 0.30, neptune: 0.29, triton: 0.76,
  pluto: 0.72, charon: 0.25, haumea: 0.51, makemake: 0.81, eris: 0.96,
};

/** Instantaneous top-of-atmosphere solar irradiance (W/m²) at body `id` on day `d` since J2000 (`null` for the Sun). */
export function solarIrradianceWm2(id: BodyId, d: number): number | null {
  if (id === 'sun' || !BODY[id]) return null;
  const p = helioKm(id, d);
  const rAu = Math.hypot(p[0], p[1], p[2]) / AU_KM;
  if (!(rAu > 0)) return null;
  const flux = SOLAR_CONSTANT_WM2 / (rAu * rAu);
  return flux >= 10 ? Math.round(flux) : flux >= 1 ? +flux.toFixed(1) : +flux.toFixed(2);
}

/** Zero-greenhouse rapid-rotator blackbody equilibrium temperature (°C) on day `d` since J2000 (`null` for the Sun). */
export function equilibriumTempC(id: BodyId, d: number): number | null {
  if (id === 'sun' || !BODY[id]) return null;
  const p = helioKm(id, d);
  const rAu = Math.hypot(p[0], p[1], p[2]) / AU_KM;
  if (!(rAu > 0)) return null;
  const albedo = BOND_ALBEDO[id] ?? 0.12;
  const tK = (278.5 * Math.pow(Math.max(0.01, 1 - albedo), 0.25)) / Math.sqrt(rAu);
  return Math.round(tK - 273.15);
}

/** Mean Keplerian synodic period (days) between two bodies sharing the same primary (Sun or host planet). */
export function synodicPeriodDays(a: BodyId, b: BodyId): number | null {
  if (a === b) return null;
  const ba = BODY[a], bb = BODY[b];
  if (!ba || !bb) return null;
  let pa = 0, pb = 0;
  if (ba.kepler && bb.kepler) {
    pa = 365.25636 * Math.pow(ba.kepler.a[0], 1.5);
    pb = 365.25636 * Math.pow(bb.kepler.a[0], 1.5);
  } else if (ba.moon && bb.moon && ba.parent && ba.parent === bb.parent) {
    // Preserve retrograde sign when one moon orbits retrograde so opposing revolutions add!
    pa = ba.moon.periodD;
    pb = bb.moon.periodD;
  } else {
    return null;
  }
  const diff = Math.abs(1 / pa - 1 / pb);
  if (!(diff > 1e-9)) return null;
  const syn = 1 / diff;
  return syn >= 10 ? +syn.toFixed(1) : +syn.toFixed(2);
}

/** Gravitational Hill sphere radius at periapsis (km) for a planet, dwarf planet, or moon (`null` for the Sun). */
export function hillSphereKm(id: BodyId): number | null {
  const b = BODY[id];
  if (!b || b.facts.gravity === undefined || !(b.facts.gravity > 0) || !(b.radiusKm > 0)) return null;
  const muBodyKm3S2 = b.facts.gravity * (G_EARTH_MS2 / 1000) * b.radiusKm * b.radiusKm;
  if (b.kepler) {
    const periKm = b.kepler.a[0] * (1 - Math.max(0, b.kepler.e[0])) * AU_KM;
    return Math.round(periKm * Math.cbrt(muBodyKm3S2 / (3 * GM_SUN_KM3_S2)));
  }
  if (b.moon && b.parent) {
    const p = BODY[b.parent];
    if (!p || p.facts.gravity === undefined || !(p.facts.gravity > 0) || !(p.radiusKm > 0)) return null;
    const muParentKm3S2 = p.facts.gravity * (G_EARTH_MS2 / 1000) * p.radiusKm * p.radiusKm;
    const periKm = b.moon.aKm * (1 - Math.max(0, b.moon.e ?? 0));
    return Math.round(periKm * Math.cbrt(muBodyKm3S2 / (3 * muParentKm3S2)));
  }
  return null;
}

/**
 * Display scale for the overview: real distances would put Neptune 80,000 Earth-radii away, so orbit radii are
 * compressed with a square root and body sizes with a power law. Close-ups use the body at radius `displayRadius`.
 */
export function displayOrbit(au: number): number { return 12 * Math.sqrt(au); }
export function displayRadius(id: BodyId): number {
  if (id === 'sun') return 2.6;
  return 0.34 * Math.pow(BODY[id].radiusKm / 6371, 0.45);
}
/** Moon distance from its parent in display units, monotonic in the real distance (default: the semi-major axis). */
export function displayMoonDist(id: BodyId, rKm?: number): number {
  const b = BODY[id], p = BODY[b.parent!];
  const rel = (rKm ?? b.moon!.aKm) / p.radiusKm;
  return displayRadius(p.id) * (1.7 + 0.42 * Math.sqrt(rel)) + displayRadius(id) * 1.5;
}
