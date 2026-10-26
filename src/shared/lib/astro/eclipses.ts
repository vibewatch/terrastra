/**
 * Solar and lunar eclipses from the precise ephemerides in `ephem.ts`. Solar eclipses use Besselian fundamental-plane
 * geometry on a flattened Earth; lunar eclipses use Danjon's shadow enlargement (as NASA's canon does).
 */
import type { GeoPoint, LocalSolar, LunarEclipse, PathPoint, SolarEclipse, Vec3 } from './types.ts';
import {
  D2R, EARTH_B, EARTH_KM, MOON_K, R2D, SUN_KM, angleBetween, centuries, ecefToGeo, eqVec, findMin, fromEcef, gast, lunarArgs,
  moonGeo, nextPhase, norm180, radec, rootFrom, sunGeo, toEcef, topocentric,
} from './ephem.ts';

/** Moon radius (Earth radii) for the penumbra and the umbra (NASA). */
const K_PEN = 0.272488, K_UMB = 0.272281;
const E2 = 1 - EARTH_B * EARTH_B;
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Besselian elements at an instant (Earth equatorial radii, equatorial frame of date). */
interface Besselian {
  t: number; x: number; y: number; l1: number; l2: number; tf1: number; tf2: number;
  /** Fundamental-plane axes: X east, Y north, G toward the Sun along the shadow axis. */
  X: Vec3; Y: Vec3; G: Vec3;
  /** Greenwich apparent sidereal time (deg). */
  th: number;
  /** Semi-minor axis of the Earth's outline on the fundamental plane. */
  rho1: number;
}

function besselian(t: number): Besselian {
  const s = eqVec(sunGeo(t)), m = eqVec(moonGeo(t));
  const M: Vec3 = [m[0] / EARTH_KM, m[1] / EARTH_KM, m[2] / EARTH_KM];
  const gx = s[0] / EARTH_KM - M[0], gy = s[1] / EARTH_KM - M[1], gz = s[2] / EARTH_KM - M[2], D = Math.hypot(gx, gy, gz);
  const G: Vec3 = [gx / D, gy / D, gz / D], h = Math.hypot(G[0], G[1]);
  const X: Vec3 = [-G[1] / h, G[0] / h, 0], Y: Vec3 = [-G[2] * X[1], G[2] * X[0], h];
  const z = dot(M, G), rs = SUN_KM / EARTH_KM;
  const sf1 = (rs + K_PEN) / D, sf2 = (rs - K_UMB) / D;
  const tf1 = sf1 / Math.sqrt(1 - sf1 * sf1), tf2 = sf2 / Math.sqrt(1 - sf2 * sf2);
  return {
    t, x: dot(M, X), y: dot(M, Y), l1: (z + K_PEN / sf1) * tf1, l2: (z - K_UMB / sf2) * tf2, tf1, tf2, X, Y, G, th: gast(t),
    rho1: Math.sqrt(1 - E2 * h * h),
  };
}

/** Where the line through (ξ, η) on the fundamental plane, parallel to the axis, meets the sunward Earth surface. */
function surface(b: Besselian, xi: number, eta: number): { q: Vec3; zeta: number } | null {
  const { X, Y, G } = b, ib = 1 / EARTH_B;
  const P: Vec3 = [xi * X[0] + eta * Y[0], xi * X[1] + eta * Y[1], (xi * X[2] + eta * Y[2]) * ib], D: Vec3 = [G[0], G[1], G[2] * ib];
  const A = dot(D, D), B = 2 * dot(P, D), C = dot(P, P) - 1, disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const zeta = (-B + Math.sqrt(disc)) / (2 * A);
  return { q: [xi * X[0] + eta * Y[0] + zeta * G[0], xi * X[1] + eta * Y[1] + zeta * G[1], xi * X[2] + eta * Y[2] + zeta * G[2]], zeta };
}

const geoOf = (q: Vec3, th: number): GeoPoint => ecefToGeo(toEcef(q, th));

/** Time near `t0` when the point (x, y) returned by `xy` passes closest to the origin (iterated linear motion). */
function closest(xy: (t: number) => [number, number], t0: number): number {
  let t = t0;
  for (let i = 0; i < 6; i++) {
    const h = i ? MIN : 10 * MIN, [x, y] = xy(t), [x1, y1] = xy(t + h), [x0, y0] = xy(t - h);
    const dx = (x1 - x0) / (2 * h), dy = (y1 - y0) / (2 * h), dt = -(x * dx + y * dy) / (dx * dx + dy * dy);
    t += Math.max(-3 * HOUR, Math.min(3 * HOUR, dt));
    if (Math.abs(dt) < 50) break;
  }
  return t;
}

/** Distance (Earth radii) from a fixed Earth point to the shadow axis, minus the umbral radius there (<0 inside). */
function umbraGap(qEcef: Vec3) {
  return (t: number) => {
    const b = besselian(t), q = fromEcef(qEcef, b.th);
    return Math.hypot(dot(q, b.X) - b.x, dot(q, b.Y) - b.y) - Math.abs(b.l2 - dot(q, b.G) * b.tf2);
  };
}

/** Velocity (Earth radii per ms, fundamental plane) of the shadow axis relative to a fixed Earth point. */
function relVelocity(qEcef: Vec3, t: number): [number, number] {
  const rel = (tt: number) => { const b = besselian(tt), q = fromEcef(qEcef, b.th); return [b.x - dot(q, b.X), b.y - dot(q, b.Y)]; };
  const a = rel(t - 5000), c = rel(t + 5000);
  return [(c[0] - a[0]) / 1e4, (c[1] - a[1]) / 1e4];
}

/** Times when the shadow axis first and last touches the Earth (around `t`, which must be a central instant). */
function axisSpan(t: number): [number, number] {
  const off = (tt: number) => { const b = besselian(tt); return surface(b, b.x, b.y) ? -1 : 1; };
  return [rootFrom(off, t, -10 * MIN, 40, 1000) ?? t, rootFrom(off, t, 10 * MIN, 40, 1000) ?? t];
}

/** The solar eclipse around a new moon at `tNew`, or null if the penumbra misses the Earth. */
function solarAt(tNew: number): SolarEclipse | null {
  const t = closest((tt) => { const b = besselian(tt); return [b.x, b.y]; }, tNew);
  const b = besselian(t), r = Math.hypot(b.x, b.y), gamma = b.y < 0 ? -r : r;
  const penGap = (tt: number) => { const c = besselian(tt); return Math.hypot(c.x, c.y / c.rho1) - 1 - c.l1; };
  if (penGap(t) >= 0) return null;
  const p1 = rootFrom(penGap, t, -20 * MIN, 30)!, p4 = rootFrom(penGap, t, 20 * MIN, 30)!;
  const hit = surface(b, b.x, b.y);
  if (hit) {
    const L1 = b.l1 - hit.zeta * b.tf1, L2 = b.l2 - hit.zeta * b.tf2, qE = toEcef(hit.q, b.th);
    let type: SolarEclipse['type'] = L2 < 0 ? 'total' : 'annular';
    const [ta, tb] = axisSpan(t);
    if (type === 'total' && (besselian(ta).l2 > 0 || besselian(tb).l2 > 0)) type = 'hybrid';
    const gap = umbraGap(qE), c2 = rootFrom(gap, t, -0.5 * MIN, 30, 10), c3 = rootFrom(gap, t, 0.5 * MIN, 30, 10);
    // Path width: the umbral strip (half-width |L2| across the relative motion) lifted onto the tangent plane.
    const [vx, vy] = relVelocity(qE, t), v = Math.hypot(vx, vy), wx = -vy / v, wy = vx / v;
    const w: Vec3 = [wx * b.X[0] + wy * b.Y[0], wx * b.X[1] + wy * b.Y[1], wx * b.X[2] + wy * b.Y[2]];
    const q = hit.q, n0: Vec3 = [q[0], q[1], q[2] / (EARTH_B * EARTH_B)], nl = Math.hypot(...n0), n: Vec3 = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
    const wn = dot(w, n), wt = Math.hypot(w[0] - wn * n[0], w[1] - wn * n[1], w[2] - wn * n[2]);
    return {
      kind: 'solar', type, t, gamma, magnitude: (L1 - L2) / (L1 + L2), greatest: ecefToGeo(qE),
      durationS: c2 !== undefined && c3 !== undefined ? (c3 - c2) / 1000 : undefined, pathWidthKm: ((2 * Math.abs(L2)) / wt) * EARTH_KM, p1, p4,
    };
  }
  // Non-central: the point of the Earth's outline nearest the axis.
  const th = Math.atan2(b.y / b.rho1, b.x), xi = Math.cos(th), eta = b.rho1 * Math.sin(th), d = Math.hypot(b.x - xi, b.y - eta);
  const type = d < Math.abs(b.l2) ? (b.l2 < 0 ? 'total' : 'annular') : 'partial';
  const q: Vec3 = [xi * b.X[0] + eta * b.Y[0], xi * b.X[1] + eta * b.Y[1], xi * b.X[2] + eta * b.Y[2]];
  return { kind: 'solar', type, t, gamma, magnitude: (b.l1 - d) / (b.l1 + b.l2), greatest: geoOf(q, b.th), p1, p4 };
}

const nearNode = (t: number) => Math.abs(Math.sin(lunarArgs(centuries(t)).F * D2R)) < 0.36;

/** Solar eclipses whose greatest eclipse falls in [fromMs, toMs]. */
export function findSolarEclipses(fromMs: number, toMs: number): SolarEclipse[] {
  const out: SolarEclipse[] = [];
  for (let t = nextPhase(fromMs - DAY, 0); t < toMs + DAY; t = nextPhase(t + 20 * DAY, 0)) {
    if (!nearNode(t)) continue;
    const e = solarAt(t);
    if (e && e.t >= fromMs && e.t <= toMs) out.push(e);
  }
  return out;
}

/** The central line and umbral/antumbral limits of a central eclipse, every `stepS` seconds; [] for partial ones. */
export function eclipsePath(e: SolarEclipse, stepS = 60): PathPoint[] {
  const b0 = besselian(e.t);
  if (e.type === 'partial' || !surface(b0, b0.x, b0.y)) return [];
  const [ta, tb] = axisSpan(e.t), out: PathPoint[] = [], n = Math.max(1, Math.ceil((tb - ta) / (stepS * 1000)));
  for (let i = 0; i <= n; i++) {
    const t = i === n ? tb - 1 : i === 0 ? ta + 1 : ta + i * stepS * 1000, b = besselian(t), hit = surface(b, b.x, b.y);
    if (!hit) continue;
    const qE = toEcef(hit.q, b.th), [vx, vy] = relVelocity(qE, t), v = Math.hypot(vx, vy), wx = -vy / v, wy = vx / v;
    const limit = (side: number): GeoPoint | null => {
      let L = Math.abs(b.l2 - hit.zeta * b.tf2), s = null as ReturnType<typeof surface>;
      for (let k = 0; k < 3; k++) {
        s = surface(b, b.x + side * L * wx, b.y + side * L * wy);
        if (!s) return null;
        L = Math.abs(b.l2 - s.zeta * b.tf2);
      }
      return geoOf(s!.q, b.th);
    };
    const a = limit(1), c = limit(-1), aN = a && (!c || a.lat > c.lat);
    out.push({ t, center: ecefToGeo(qE), north: aN ? a : c, south: aN ? c : a });
  }
  return out;
}

/** Overlapping fraction of the Sun's disc (radius rs) covered by the Moon (radius rm) at centre distance d. */
function obscuration(rs: number, rm: number, d: number): number {
  if (d >= rs + rm) return 0;
  if (d <= Math.abs(rs - rm)) return Math.min(1, (rm * rm) / (rs * rs));
  const a = Math.acos((d * d + rs * rs - rm * rm) / (2 * d * rs)), c = Math.acos((d * d + rm * rm - rs * rs) / (2 * d * rm));
  const area = rs * rs * (a - Math.sin(2 * a) / 2) + rm * rm * (c - Math.sin(2 * c) / 2);
  return area / (Math.PI * rs * rs);
}

/**
 * Local circumstances of a solar eclipse for one observer. Contacts (to ~0.1 s) use NASA's penumbral/umbral lunar radii
 * and are given whenever they happen, even with the Sun below the horizon (check `topocentric` for that).
 */
export function localSolar(e: SolarEclipse, obs: GeoPoint): LocalSolar {
  const outer = (t: number) => { const s = topocentric(t, obs); return s.sep - s.sun.radius - (s.moon.radius * K_PEN) / MOON_K; };
  const a = e.p1 - 30 * MIN, z = e.p4 + 30 * MIN, step = 5 * MIN;
  let best = a, bv = Infinity;
  for (let t = a; t <= z; t += step) { const v = outer(t); if (v < bv) { bv = v; best = t; } }
  const max = findMin(outer, best - step, best + step, 100), at = topocentric(max, obs);
  const { sep } = at, rs = at.sun.radius, rm = at.moon.radius;
  const magnitude = Math.max(0, (rs + rm - sep) / (2 * rs));
  if (outer(max) >= 0) return { visible: false, max, magnitude: 0, obscuration: 0, sunAlt: at.sun.alt, type: 'none' };
  const c1 = rootFrom(outer, max, -step, 80, 100), c4 = rootFrom(outer, max, step, 80, 100);
  const inner = (t: number) => { const s = topocentric(t, obs); return s.sep - Math.abs(s.sun.radius - (s.moon.radius * K_UMB) / MOON_K); };
  const central = inner(max) < 0;
  const c2 = central ? rootFrom(inner, max, -0.25 * MIN, 40, 100) : undefined, c3 = central ? rootFrom(inner, max, 0.25 * MIN, 40, 100) : undefined;
  const t0 = c1 ?? a, t1 = c4 ?? z;
  let visible = at.sun.alt > 0;
  for (let t = t0; !visible && t <= t1; t += step) visible = topocentric(t, obs).sun.alt > 0;
  visible ||= topocentric(t1, obs).sun.alt > 0;
  return {
    visible, c1, c2, max, c3, c4, magnitude, obscuration: obscuration(rs, rm, sep), sunAlt: at.sun.alt,
    type: central ? (rm > rs ? 'total' : 'annular') : 'partial',
  };
}

// ---------------------------------------------------------------------------------------------- lunar eclipses

interface LunarGeom { u: number; v: number; d: number; rp: number; ru: number; sm: number; distKm: number }

/** Moon relative to the Earth's shadow axis: plane offsets (deg, east/north), angular distance and shadow radii (Danjon). */
function lunarGeom(t: number): LunarGeom {
  const s = sunGeo(t), m = moonGeo(t), A = radec(s.ra + 180, -s.dec), M = radec(m.ra, m.dec);
  const a = (s.ra + 180) * D2R, dA = -s.dec * D2R;
  const X: Vec3 = [-Math.sin(a), Math.cos(a), 0], Y: Vec3 = [-Math.sin(dA) * Math.cos(a), -Math.sin(dA) * Math.sin(a), Math.cos(dA)];
  const pm = Math.asin(EARTH_KM / m.distKm) * R2D, ps = Math.asin(EARTH_KM / s.distKm) * R2D, ss = Math.asin(SUN_KM / s.distKm) * R2D;
  return {
    u: dot(M, X) * R2D, v: dot(M, Y) * R2D, d: angleBetween(M, A), rp: 1.01 * pm + ss + ps, ru: 1.01 * pm - ss + ps,
    sm: Math.asin((MOON_K * EARTH_KM) / m.distKm) * R2D, distKm: m.distKm,
  };
}

function lunarAt(tFull: number): LunarEclipse | null {
  const t = closest((tt) => { const g = lunarGeom(tt); return [g.u, g.v]; }, tFull);
  const g = lunarGeom(t), pen = (g.rp + g.sm - g.d) / (2 * g.sm), umb = (g.ru + g.sm - g.d) / (2 * g.sm);
  if (pen <= 0) return null;
  const contact = (r: (g: LunarGeom) => number, dir: number) => rootFrom((tt) => { const c = lunarGeom(tt); return c.d - r(c); }, t, dir * 10 * MIN, 60, 200);
  const rP = (c: LunarGeom) => c.rp + c.sm, rU = (c: LunarGeom) => c.ru + c.sm, rT = (c: LunarGeom) => c.ru - c.sm;
  const m = moonGeo(t), r = (g.distKm * Math.sin(g.d * D2R)) / EARTH_KM;
  return {
    kind: 'lunar', type: umb >= 1 ? 'total' : umb > 0 ? 'partial' : 'penumbral', t, gamma: g.v < 0 ? -r : r,
    umbralMagnitude: umb, penumbralMagnitude: pen, p1: contact(rP, -1)!, p4: contact(rP, 1)!,
    u1: umb > 0 ? contact(rU, -1) : undefined, u4: umb > 0 ? contact(rU, 1) : undefined,
    u2: umb >= 1 ? contact(rT, -1) : undefined, u3: umb >= 1 ? contact(rT, 1) : undefined,
    subMoon: { lat: m.dec, lon: norm180(m.ra - gast(t)) },
  };
}

/** Lunar eclipses (including penumbral ones) whose greatest eclipse falls in [fromMs, toMs]. */
export function findLunarEclipses(fromMs: number, toMs: number): LunarEclipse[] {
  const out: LunarEclipse[] = [];
  for (let t = nextPhase(fromMs - DAY, 180); t < toMs + DAY; t = nextPhase(t + 20 * DAY, 180)) {
    if (!nearNode(t)) continue;
    const e = lunarAt(t);
    if (e && e.t >= fromMs && e.t <= toMs) out.push(e);
  }
  return out;
}
