/**
 * Parametric builders for the galaxy models (all on the nebula `NB` builder): spiral discs (arms, bar, dust lanes,
 * HII knots, bulge), ellipticals (de Vaucouleurs-like light + globular clusters), irregulars, resolved dwarf
 * spheroidals, cheap mini-galaxies, galaxy clusters (many mini-galaxies in hot X-ray gas) and quasars.
 *
 * Frame: +Z towards Earth, +Y celestial north, −X east (a north-up, east-left sky picture from +Z).
 * Position angles (PA) are degrees from north through east; inclination 0 = face-on.
 * Brightness is given as flux (the sum over all sprites), so the look does not depend on point counts or tier.
 */
import { NB, PAL, add, clamp, hex, makeNoise3, mix, norm, scale, smooth, unitRand, type C3, type V3 } from '../nebulae/core.ts';

export const DEG = Math.PI / 180;
export const O: V3 = [0, 0, 0];

/** Galaxy colours (natural / popular-image look). */
export const GC = {
  core: hex('#fff3df'), old: hex('#ffd29a'), old2: hex('#ffe4c0'), red: hex('#ffb07a'), amber: hex('#ffc070'),
  arm: hex('#9cb6ff'), arm2: hex('#d6e0ff'), blue: hex('#7ea0ff'), white: hex('#f4f2ff'),
  hii: hex('#ff6c9c'), hii2: hex('#ff9cbc'), ha: hex('#ff4a6a'),
  dust: hex('#120a05'), dust2: hex('#2a180c'),
  xray: hex('#8f78ff'), xpink: hex('#ff70c8'), dm: hex('#3f6cff'),
};

/** Glow intensity so that `n` (high-tier) sprites of diameter `s` add up to flux `F` (same units as `s`²). */
export const fluxI = (F: number, n: number, s: number) => F / (Math.max(1, n) * 0.19 * s * s);
/** Sky offset for position angle `pa` (deg) and distance `d` (+ optional depth). */
export const sky = (pa: number, d: number, z = 0): V3 => [-Math.sin(pa * DEG) * d, Math.cos(pa * DEG) * d, z];
const wrap = (a: number) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
/** Seed for noise generators, drawn from the builder's stream. */
export const seed = (b: NB) => Math.floor(b.r() * 1e9);

type Xf = (v: V3) => V3;
/**
 * Galaxy-local → model transform. Local x = major axis, y in the disc plane, z = disc normal (units of `R`).
 * Inclined by `inc` about the major axis, major axis turned to sky PA `pa`; `near` = +1 puts the side at PA+90° nearer to us.
 */
export function skyXf(c: V3, R: number, pa: number, inc: number, near = 1): Xf {
  const i = inc * near * DEG, ci = Math.cos(i), si = Math.sin(i), t = (90 + pa) * DEG, ct = Math.cos(t), st = Math.sin(t);
  return ([x, y, z]) => {
    x *= R; y *= R; z *= R;
    const y1 = y * ci - z * si, z1 = y * si + z * ci;
    return [c[0] + x * ct - y1 * st, c[1] + x * st + y1 * ct, c[2] + z1];
  };
}
/** The disc-plane local point (units of R) that is seen at sky offset (dx, dy) from the disc centre. */
export function skyToDisc(R: number, pa: number, inc: number, near: number, dx: number, dy: number): V3 {
  const t = (90 + pa) * DEG, x = (dx * Math.cos(t) + dy * Math.sin(t)) / R, y1 = (-dx * Math.sin(t) + dy * Math.cos(t)) / R;
  return [x, y1 / Math.max(0.05, Math.cos(inc * near * DEG)), 0];
}

/** Buffer marks, so a later pass can tint whatever was emitted after the mark. */
export const mark = (b: NB) => ({ g: b.glow.c.length, f: b.glowF.c.length, h: b.haze.c.length, s: b.stars.c.length });
/** Multiply colours emitted since `m` by `k` (e.g. reddening and dimming behind the Milky Way's dust). */
export function tint(b: NB, m: ReturnType<typeof mark>, k: C3) {
  const go = (a: number[], from: number) => { for (let i = from; i < a.length; i += 3) { a[i] *= k[0]; a[i + 1] *= k[1]; a[i + 2] *= k[2]; } };
  go(b.glow.c, m.g); go(b.glowF.c, m.f); go(b.haze.c, m.h); go(b.stars.c, m.s);
}

/** Hernquist radius (its projected light is close to de Vaucouleurs' r^¼ law), scale `a`. */
const hernq = (u: number, a: number) => { const s = Math.sqrt(u); return a * s / (1 - s + 1e-6); };
/** Plummer radius, scale `a`. */
export const plummer = (u: number, a: number) => a / Math.sqrt(Math.pow(u + 1e-6, -2 / 3) - 1);

// ---------------------------------------------------------------- spiral discs
export interface Seg { a: number; r0: number; r1: number; w: number; wt: number }
export interface SpiralOpts {
  c?: V3; R: number; pa: number; inc: number; near?: number;
  /** Main arms, pitch angle (deg), winding (+1: counter-clockwise outwards seen face-on from Earth), phase (deg, from the major axis). */
  arms?: number; pitch?: number; wind?: number; phase?: number;
  /** Arm start / end radius and arm half-width (units of R). */
  r0?: number; r1?: number; armW?: number;
  /** Extra short arm fragments (flocculent spirals). */
  floc?: number;
  /** Custom arm segments instead of `arms` (angle `a` in deg at radius r0). */
  segs?: Seg[];
  /** Bar half-length (0 = none), its angle in the disc from the major axis (deg) and centre offset. */
  bar?: number; barAng?: number; barOff?: [number, number];
  /** Bulge size (units of R; 0 = none), flux and flattening; disc / arm flux; disc scale length; thickness. */
  bulge?: number; bulgeF?: number; bulgeQ?: number; discF?: number; armF?: number; h?: number; thick?: number;
  /** HII knots, young stars, dust amount (1 = normal) and opacity. */
  hii?: number; young?: number; dust?: number; dustA?: number;
  /** Lopsidedness: the outer disc stretched towards in-disc angle `lopAng`. */
  lop?: number; lopAng?: number;
  /** A star-forming ring (radius, width) with dust, like Andromeda's 10 kpc ring. */
  ring?: [number, number]; ringF?: number;
  /** Warp of the outer disc (z at the rim) towards in-disc angle `warpAng`. */
  warp?: number; warpAng?: number;
  /** Point-count multiplier; extra warmth 0..1 (Sa-like). */
  n?: number; warm?: number;
  armCol?: C3; armCol2?: C3; hiiCol?: C3;
  nucleus?: number;
}

/** A disc galaxy. Returns its local→model transform (for placing extra features). */
export function spiral(b: NB, o: SpiralOpts): Xf {
  const r = b.r, g = b.g, S = o.R, near = o.near ?? 1, X = skyXf(o.c ?? O, S, o.pa, o.inc, near), k = o.n ?? 1;
  const nA = o.arms ?? 2, tp = Math.tan((o.pitch ?? 16) * DEG), sinP = Math.sin((o.pitch ?? 16) * DEG), wind = o.wind ?? 1, aw = o.armW ?? 0.045, bar = o.bar ?? 0;
  const r0 = o.r0 ?? Math.max(0.08, bar * 0.95), r1 = o.r1 ?? 1, warm = o.warm ?? 0, th = o.thick ?? 0.018;
  const segs: Seg[] = o.segs ? o.segs.map((s) => ({ ...s })) : Array.from({ length: nA }, (_, i) => ({ a: (o.phase ?? 0) + i * 360 / nA, r0, r1, w: aw, wt: 1 }));
  for (let i = 0; i < (o.floc ?? 0); i++) {
    const ra = r0 + r() * (r1 - r0) * 0.85;
    segs.push({ a: r() * 360, r0: ra, r1: Math.min(r1, ra + 0.12 + r() * 0.3), w: aw * (0.5 + r() * 0.6), wt: 0.55 });
  }
  const lop = o.lop ?? 0, la = (o.lopAng ?? 0) * DEG, warp = o.warp ?? 0, wa = (o.warpAng ?? 0) * DEG;
  const P = (R: number, phi: number, z: number): V3 => {
    const RR = R * (1 + lop * Math.cos(phi - la) * R);
    return X([RR * Math.cos(phi), RR * Math.sin(phi), z + warp * Math.max(0, R - 0.55) ** 2 / 0.2 * Math.sin(phi - wa)]);
  };
  const segPhi = (s: Seg, R: number) => s.a * DEG + wind * Math.log(R / s.r0) / tp;
  const wsum = segs.reduce((t, s) => t + s.wt * (s.r1 - s.r0), 0);
  const pick = () => { let x = r() * wsum; for (const s of segs) { x -= s.wt * (s.r1 - s.r0); if (x <= 0) return s; } return segs[0]; };
  const armSample = () => {
    for (let tries = 0; tries < 60; tries++) {
      const s = pick(), R = s.r0 + r() * (s.r1 - s.r0);
      const t = smooth(s.r0, s.r0 + 0.05, R) * (1 - smooth(s.r1 - 0.15, s.r1, R) * 0.85) * Math.exp(-(R - r0) * 1.1);
      if (r() < t) return { s, R, phi: segPhi(s, R) };
    }
    const s = segs[0]; return { s, R: s.r0, phi: segPhi(s, s.r0) };
  };
  const armDen = (R: number, phi: number) => {
    let d = 0;
    for (const s of segs) {
      if (R < s.r0 - 0.03 || R > s.r1 + 0.05) continue;
      const q = Math.abs(wrap(phi - segPhi(s, Math.max(R, s.r0)))) * R * sinP / (s.w * 1.6 * (0.6 + R));
      d = Math.max(d, Math.exp(-q * q) * Math.min(1, s.wt * 1.5));
    }
    return d;
  };
  const nz = makeNoise3(seed(b));
  const armCol = o.armCol ?? GC.arm, armCol2 = o.armCol2 ?? GC.arm2, hiiCol = o.hiiCol ?? GC.hii;

  // old stellar disc (warm), brighter along the arms
  const h = o.h ?? 0.28, nD = 24000 * k, sD = 0.032, ID = fluxI(o.discF ?? 0.16, nD, sD);
  for (let i = 0, N = b.n(nD), t = 0; i < N && t < N * 20; t++) {
    const R = -h * Math.log((r() + 1e-6) * (r() + 1e-6));
    if (R > 1.08 * r1) continue;
    const phi = r() * Math.PI * 2;
    if (r() > 0.45 + 0.55 * armDen(R, phi)) continue;
    const c = mix(mix(GC.old2, GC.old, r() * 0.6 + warm * 0.3), armCol2, clamp(smooth(0.2, 1, R) * (0.45 - warm * 0.4)));
    b.glw(P(R, phi, g() * th * (0.7 + R)), c, ID * (0.6 + r() * 0.8), sD * S * (0.6 + r() * 0.8));
    i++;
  }
  // spiral arms: young blue-white light, clumpy
  const nAr = 30000 * k, sA = 0.022, IA = fluxI(o.armF ?? 0.2, nAr, sA);
  for (let i = 0, N = b.n(nAr), t = 0; i < N && t < N * 20; t++) {
    const { s, R, phi } = armSample(), w = s.w * (0.6 + 0.8 * R);
    const RR = R + g() * w, ph = phi + g() * w * 0.4 / Math.max(R, 0.05);
    if (r() > 0.35 + nz(RR * Math.cos(ph) * 9, RR * Math.sin(ph) * 9, 1.3) * 1.1) continue;
    const c = mix(mix(armCol, armCol2, r()), GC.old2, clamp(0.25 - R * 0.25 + warm * 0.4 + r() * 0.15));
    b.glw(P(RR, ph, g() * th * 0.6), c, IA * (0.5 + r()), sA * S * (0.6 + r() * 0.8));
    i++;
  }
  // dust lanes on the inner (concave) edge of the arms, plus patchy inter-arm dust
  const nDu = Math.round(14000 * k * (o.dust ?? 1)), dA = o.dustA ?? 0.55;
  for (let i = 0, N = b.n(nDu); i < N; i++) {
    let R: number, phi: number;
    if (r() < 0.8) {
      const a = armSample(), w = a.s.w * (0.6 + 0.8 * a.R);
      R = a.R - w * (0.7 + Math.abs(g()) * 0.35); phi = a.phi + g() * 0.01;
    } else {
      R = -h * Math.log((r() + 1e-6) * (r() + 1e-6)) * 0.8; phi = r() * Math.PI * 2;
      if (nz(R * Math.cos(phi) * 6, R * Math.sin(phi) * 6, 4.1) < 0.5) continue;
    }
    if (R < 0.04 || R > r1) continue;
    b.dst(P(R, phi, g() * th * 0.35), mix(GC.dust, GC.dust2, r()), dA * (0.6 + r() * 0.6), 0.028 * S * (0.6 + r() * 0.8));
  }
  // young star sparkle and pink HII knots along the arms
  for (let i = 0, N = b.n(o.young ?? 500 * k); i < N; i++) {
    const { s, R, phi } = armSample(), w = s.w * (0.6 + 0.8 * R), m = r() ** 3;
    b.star(P(R + g() * w * 0.8, phi + g() * 0.02, g() * th * 0.4), r() < 0.8 ? PAL.starB : PAL.starW, 0.22 + m * 0.6, 2.2 + m * 3.5);
  }
  for (let i = 0, N = b.n(o.hii ?? 140 * k); i < N; i++) {
    const { s, R, phi } = armSample(), w = s.w * (0.6 + 0.8 * R), c = P(R + g() * w * 0.5, phi, g() * th * 0.3), sz = 0.004 + r() ** 2 * 0.012, m = 10;
    const I = fluxI(0.001 * (0.3 + r() * 1.4) * (sz / 0.01) ** 2, m, 0.012);
    for (let j = 0; j < m; j++) b.glw(add(c, [g() * sz * S, g() * sz * S, g() * sz * S * 0.4]), mix(hiiCol, GC.hii2, r() * 0.5), I, 0.012 * S);
    if (r() < 0.35) b.star(c, PAL.starB, 0.35 + r() * 0.4, 3 + r() * 2);
  }
  // star-forming ring with its dust
  if (o.ring) {
    const [rr, rw] = o.ring, nR = 9000 * k, IR = fluxI(o.ringF ?? 0.06, nR, 0.02);
    for (let i = 0, N = b.n(nR), t = 0; i < N && t < N * 20; t++) {
      const phi = r() * Math.PI * 2, R = rr + g() * rw * (0.6 + nz(Math.cos(phi) * 3, Math.sin(phi) * 3, 7) * 0.8);
      if (r() > nz(Math.cos(phi) * 8, Math.sin(phi) * 8, 2) * 1.6 - 0.1) continue;
      b.glw(P(R, phi, g() * th * 0.4), mix(armCol, armCol2, r()), IR * (0.5 + r()), 0.02 * S * (0.6 + r() * 0.8));
      i++;
    }
    for (let i = 0, N = b.n(4000 * k * (o.dust ?? 1)); i < N; i++) {
      const phi = r() * Math.PI * 2, R = rr + g() * rw * 0.7 - rw * 0.3;
      b.dst(P(R, phi, g() * th * 0.3), mix(GC.dust, GC.dust2, r()), dA * (0.7 + r() * 0.6), 0.03 * S * (0.6 + r() * 0.8));
    }
    for (let i = 0, N = b.n(60 * k); i < N; i++) {
      const phi = r() * Math.PI * 2, c = P(rr + g() * rw * 0.5, phi, 0), sz = (0.004 + r() * 0.008) * S;
      for (let j = 0; j < 8; j++) b.glw(add(c, [g() * sz, g() * sz, g() * sz * 0.4]), mix(hiiCol, GC.hii2, r() * 0.5), fluxI(0.0005, 8, 0.012), 0.012 * S);
    }
  }
  // bar
  if (bar > 0) {
    const ba = (o.barAng ?? 0) * DEG, cb = Math.cos(ba), sb = Math.sin(ba), [ox, oy] = o.barOff ?? [0, 0], nB = 7000 * k, IB = fluxI(0.05 * bar / 0.3, nB, 0.024);
    for (let i = 0, N = b.n(nB); i < N; i++) {
      const u = clamp(g() * 0.5, -1, 1) * bar, v = g() * bar * 0.13 * (1 - Math.abs(u / bar) * 0.4);
      b.glw(X([ox + u * cb - v * sb, oy + u * sb + v * cb, g() * th * 1.2]), mix(GC.old2, GC.old, r()), IB * (0.6 + r() * 0.8), 0.024 * S * (0.6 + r() * 0.8));
    }
  }
  // bulge: a flattened Hernquist sphere, golden, white-hot in the middle
  const B = o.bulge ?? 0.12;
  if (B > 0) {
    const nBu = 12000 * k, F = o.bulgeF ?? 0.05, bq = o.bulgeQ ?? 0.65;
    for (let i = 0, N = b.n(nBu); i < N; i++) {
      const rr = hernq(r(), B * 0.3);
      if (rr > B * 2.6) { i--; continue; }
      const u = unitRand(r), s = 0.006 + rr * 0.45, z = u[2] * rr * bq;
      // the half in front of the disc plane is drawn over the disc's dust, the far half behind it
      const e = () => b.glw(X([u[0] * rr, u[1] * rr, z]), mix(GC.core, GC.old, smooth(0, B * 1.4, rr) * 0.85), fluxI(F, nBu, s) * (0.7 + r() * 0.6), s * S);
      if (z > 0) b.front(e); else e();
    }
    b.hz(X(O), mix(GC.old, GC.core, 0.5), F * 0.6 / (B * B * 2.6), B * 1.6 * S, 0.1);
  }
  if ((o.nucleus ?? 0.7) > 0) b.star(X(O), GC.core, o.nucleus ?? 0.7, 7);
  return X;
}

// ---------------------------------------------------------------- ellipticals
interface EllOpts {
  c?: V3; R: number; pa?: number;
  /** Sky axis ratio b/a, and line-of-sight axis ratio. */
  q?: number; q3?: number;
  /** Hernquist scale (units of R; smaller = more concentrated), total flux, point-count multiplier. */
  a?: number; F?: number; n?: number;
  /** Centre / outskirts colours. */
  c0?: C3; c1?: C3;
  /** Globular clusters: count and their spread (units of R). */
  gc?: number; gcR?: number;
  nucleus?: number; halo?: number;
  /** Tilt of the local frame (for lenticulars). */
  inc?: number; near?: number;
  /** Model-space normal of a dusty disc through the centre: light on its Earth side is drawn in front of the dust. */
  split?: V3;
}
export function elliptical(b: NB, o: EllOpts): Xf {
  const r = b.r, S = o.R, X = skyXf(o.c ?? O, S, o.pa ?? 0, o.inc ?? 0, o.near ?? 1), q = o.q ?? 0.85, q3 = o.q3 ?? (1 + q) / 2;
  const a = o.a ?? 0.12, nE = 16000 * (o.n ?? 1), F = o.F ?? 0.1, c0 = o.c0 ?? GC.core, c1 = o.c1 ?? GC.old;
  for (let i = 0, N = b.n(nE); i < N; i++) {
    const rr = hernq(r(), a);
    if (rr > 1) { i--; continue; }
    const u = unitRand(r), s = 0.006 + rr * 0.3, p = X([u[0] * rr, u[1] * rr * q, u[2] * rr * q3]), c = o.c ?? O;
    const e = () => b.glw(p, mix(c0, c1, smooth(0, 0.6, rr) * (0.7 + r() * 0.3)), fluxI(F, nE, s) * (0.7 + r() * 0.6), s * S);
    if (o.split && (p[0] - c[0]) * o.split[0] + (p[1] - c[1]) * o.split[1] + (p[2] - c[2]) * o.split[2] > 0) b.front(e); else e();
  }
  const hl = o.halo ?? 1;
  if (hl > 0) for (const [sz, k] of [[0.25, 0.5], [0.55, 0.25], [0.9, 0.1]]) b.hz(X(O), mix(c0, c1, 0.6), F * k * hl * 0.6 / (sz * sz), sz * S * (1 + q) / 2, 0.08);
  if ((o.nucleus ?? 0.8) > 0) b.star(X(O), c0, o.nucleus ?? 0.8, 8);
  globulars(b, X, o.gc ?? 0, o.gcR ?? 0.35, q);
  return X;
}

/** Globular clusters: compact gold/white points in a round, extended swarm. */
function globulars(b: NB, X: Xf, n: number, spread: number, q = 1) {
  const r = b.r;
  for (let i = 0, N = n > 0 ? b.n(n) : 0; i < N; i++) {
    const rr = plummer(r(), spread);
    if (rr > 1.05) { i--; continue; }
    const u = unitRand(r), m = r() ** 3;
    b.star(X([u[0] * rr, u[1] * rr * (0.4 + q * 0.6), u[2] * rr]), r() < 0.6 ? PAL.starY : r() < 0.6 ? PAL.starW : hex('#ffcf9a'), 0.22 + m * 0.5, 1.8 + m * 2.4);
  }
}

// ---------------------------------------------------------------- dwarf spheroidals (resolved swarms)
interface DsphOpts {
  c?: V3; R: number; pa?: number; q?: number; q3?: number;
  /** Plummer scale (units of R), resolved star count, unresolved glow flux. */
  a?: number; stars?: number; F?: number;
  /** Star clusters: centre (local units), Plummer size, star count. */
  gcs?: { p: V3; s: number; n: number }[];
  /** 0..1 share of younger, bluer stars, and brightness of the resolved stars. */
  young?: number; bright?: number;
}
export function dsph(b: NB, o: DsphOpts): Xf {
  const r = b.r, S = o.R, X = skyXf(o.c ?? O, S, o.pa ?? 0, 0), q = o.q ?? 0.8, q3 = o.q3 ?? (1 + q) / 2, a = o.a ?? 0.3, br = o.bright ?? 1;
  const cols = [PAL.starY, PAL.starY, hex('#ffd49a'), PAL.starR, hex('#ffa070'), PAL.starW];
  for (let i = 0, N = b.n(o.stars ?? 4000); i < N; i++) {
    const rr = plummer(r(), a);
    if (rr > 1) { i--; continue; }
    const u = unitRand(r), m = r() ** 5, yg = r() < (o.young ?? 0);
    const c = yg ? (r() < 0.6 ? PAL.starB : PAL.starW) : r() < 0.06 ? PAL.starB : cols[Math.floor(r() * 6)];
    b.star(X([u[0] * rr, u[1] * rr * q, u[2] * rr * q3]), c, (0.26 + m * 1.0) * br, 2.2 + m * 4.5);
  }
  const nG = 5000, F = o.F ?? 0.02;
  for (let i = 0, N = b.n(nG); i < N; i++) {
    const rr = plummer(r(), a);
    if (rr > 1) { i--; continue; }
    const u = unitRand(r), s = 0.02 + rr * 0.12;
    b.glw(X([u[0] * rr, u[1] * rr * q, u[2] * rr * q3]), mix(GC.old2, GC.old, r()), fluxI(F, nG, s), s * S);
  }
  for (const gc of o.gcs ?? []) {
    const c = X(gc.p);
    for (let i = 0, N = b.n(gc.n); i < N; i++) {
      const rr = Math.min(plummer(r(), gc.s), gc.s * 6), u = unitRand(r), m = r() ** 4;
      b.star(add(c, scale(u, rr * S)), r() < 0.7 ? PAL.starY : PAL.starW, 0.25 + m * 0.6, 1.6 + m * 2.5);
    }
    b.blob(120, c, [gc.s * S, gc.s * S, gc.s * S], GC.old2, fluxI(0.0006 * gc.n / 200, 120, 0.01), 0.01 * S);
  }
  return X;
}

// ---------------------------------------------------------------- irregulars
interface IrrOpts {
  c?: V3; R: number; pa?: number; inc?: number; q?: number; q3?: number;
  /** Clumps of young stars, HII knots, resolved stars, young-light flux, old-envelope flux, 0..1 extra pink. */
  clumps?: number; hii?: number; stars?: number; F?: number; oldF?: number; pink?: number;
  /** A bar (half-length, units of R) along the major axis that half the clumps sit on. */
  bar?: number;
  dust?: number;
  col?: C3; col2?: C3;
  /** Point-count multiplier. */
  n?: number;
}
export function irregular(b: NB, o: IrrOpts): Xf {
  const r = b.r, g = b.g, S = o.R, X = skyXf(o.c ?? O, S, o.pa ?? 0, o.inc ?? 0), q = o.q ?? 0.7, q3 = o.q3 ?? 0.35;
  const nC = o.clumps ?? 9, bar = o.bar ?? 0, col = o.col ?? GC.arm, col2 = o.col2 ?? GC.arm2;
  const cl = Array.from({ length: nC }, () => {
    const p: V3 = bar > 0 && r() < 0.5 ? [g() * bar * 0.6, g() * 0.08, g() * 0.08] : [g() * 0.38, g() * 0.38 * q, g() * 0.3 * q3];
    return { p, s: 0.07 + r() * 0.16, w: 0.3 + r() };
  });
  const wsum = cl.reduce((t, c) => t + c.w, 0);
  const pick = () => { let x = r() * wsum; for (const c of cl) { x -= c.w; if (x <= 0) return c; } return cl[0]; };
  // young population: clumpy blue-white light
  const nG = 26000 * (o.n ?? 1), sG = 0.03, IG = fluxI(o.F ?? 0.1, nG, sG);
  for (let i = 0, N = b.n(nG), t = 0; i < N && t < N * 20; t++) {
    const c = pick(), p: V3 = [c.p[0] + g() * c.s, c.p[1] + g() * c.s * q, c.p[2] + g() * c.s * q3];
    if (p[0] * p[0] + (p[1] / q) ** 2 > 1) continue;
    b.glw(X(p), mix(mix(col, col2, r()), GC.old2, r() * 0.35), IG * (0.5 + r()), sG * S * (0.6 + r() * 0.8));
    i++;
  }
  // old envelope: smooth, faint, warm
  const nO = 8000 * (o.n ?? 1), oF = o.oldF ?? 0.04;
  for (let i = 0, N = b.n(nO); i < N; i++) {
    const rr = plummer(r(), 0.35);
    if (rr > 1) { i--; continue; }
    const u = unitRand(r), s = 0.03 + rr * 0.1;
    b.glw(X([u[0] * rr, u[1] * rr * q, u[2] * rr * q3]), mix(GC.old2, GC.old, r()), fluxI(oF, nO, s), s * S);
  }
  // HII regions
  const pk = o.pink ?? 0.5;
  for (let i = 0, N = b.n(o.hii ?? 26); i < N; i++) {
    const c = pick(), ctr = X([c.p[0] + g() * c.s, c.p[1] + g() * c.s * q, c.p[2] + g() * c.s * q3]), sz = 0.006 + r() ** 2 * 0.03, m = 14;
    for (let j = 0; j < m; j++) b.glw(add(ctr, [g() * sz * S, g() * sz * S, g() * sz * S]), mix(GC.hii, GC.hii2, r() * 0.5), fluxI(0.0012 * (0.5 + pk) * (sz / 0.015) ** 2, m, 0.014), 0.014 * S);
    if (r() < 0.6) b.star(ctr, PAL.starB, 0.4 + r() * 0.4, 3 + r() * 2.5);
  }
  // resolved bright stars: blue and red supergiants
  for (let i = 0, N = b.n(o.stars ?? 700); i < N; i++) {
    const c = pick(), m = r() ** 4;
    b.star(X([c.p[0] + g() * c.s * 1.3, c.p[1] + g() * c.s * q * 1.3, c.p[2] + g() * c.s * q3]), r() < 0.7 ? PAL.starB : r() < 0.5 ? PAL.starW : PAL.starR, 0.22 + m * 0.7, 2 + m * 3.5);
  }
  for (let i = 0, N = o.dust ? b.n(o.dust) : 0; i < N; i++) {
    const c = pick();
    b.dst(X([c.p[0] + g() * c.s, c.p[1] + g() * c.s * q, c.p[2] + g() * c.s * q3]), mix(GC.dust, GC.dust2, r()), 0.4 + r() * 0.3, 0.03 * S);
  }
  return X;
}

// ---------------------------------------------------------------- mini galaxies (cluster / group members)
export type MiniType = 'E' | 'S0' | 'S' | 'SB' | 'Irr';
/** A cheap small galaxy (a hundred to a few hundred primitives) of radius `R` and relative surface brightness `sb`. */
export function mini(b: NB, c: V3, R: number, type: MiniType, pa: number, inc: number, sb = 1, cols?: { old?: C3; arm?: C3 }) {
  const r = b.r, g = b.g, X = skyXf(c, R, pa, type === 'E' ? 0 : inc), old = cols?.old ?? GC.old, arm = cols?.arm ?? GC.arm;
  const F = 0.45 * sb * R * R;
  if (type === 'E' || type === 'S0') {
    const q = type === 'E' ? 0.65 + r() * 0.35 : 1, n = Math.round(80 + R * 4000);
    for (let i = 0, N = b.n(n); i < N; i++) {
      const rr = Math.min(1, hernq(r(), 0.13)), u = unitRand(r), s = 0.03 + rr * 0.35;
      const p: V3 = type === 'E' ? [u[0] * rr, u[1] * rr * q, u[2] * rr] : [u[0] * rr, u[1] * rr, u[2] * rr * (rr < 0.25 ? 0.6 : 0.12)];
      b.glw(X(p), mix(GC.core, old, smooth(0, 0.5, rr)), fluxI(F, n, s * R), s * R);
    }
    b.star(X(O), GC.core, Math.min(1.2, 0.2 + R * 6), Math.min(9, 2.5 + R * 40));
    return;
  }
  if (type === 'Irr') {
    const n = Math.round(60 + R * 3000);
    for (let i = 0, N = b.n(n); i < N; i++) {
      const k = Math.floor(r() * 4), p: V3 = [Math.cos(k * 2.1) * 0.3 + g() * 0.25, Math.sin(k * 1.7) * 0.25 + g() * 0.2, g() * 0.15];
      b.glw(X(p), mix(arm, GC.arm2, r()), fluxI(F * 0.8, n, 0.12 * R), 0.12 * R);
    }
    return;
  }
  // spiral: two arms, a bulge (and a bar)
  const n = Math.round(140 + R * 5000), ph = r() * Math.PI * 2, w = r() < 0.5 ? 1 : -1, tp = 0.3 + r() * 0.2;
  for (let i = 0, N = b.n(n); i < N; i++) {
    const t = r();
    if (t < 0.22) {
      const rr = Math.min(0.5, hernq(r(), 0.05)), u = unitRand(r), s = 0.03 + rr * 0.4;
      b.glw(X([u[0] * rr, u[1] * rr, u[2] * rr * 0.6]), mix(GC.core, old, smooth(0, 0.2, rr)), fluxI(F * 0.3, n * 0.22, s * R), s * R);
    } else if (t < 0.32 && type === 'SB') {
      b.glw(X([g() * 0.25, g() * 0.04, g() * 0.03]), old, fluxI(F * 0.1, n * 0.1, 0.06 * R), 0.06 * R);
    } else {
      const onArm = r() < 0.7, RR = onArm ? 0.12 + r() * 0.85 : -0.3 * Math.log(r() * r() + 1e-6);
      if (RR > 1) continue;
      const phi = onArm ? ph + (r() < 0.5 ? 0 : Math.PI) + w * Math.log(RR / 0.12) / tp + g() * 0.25 : r() * Math.PI * 2;
      b.glw(X([RR * Math.cos(phi), RR * Math.sin(phi), g() * 0.03]), onArm ? mix(arm, GC.arm2, r()) : mix(GC.old2, GC.old, r()), fluxI(F * 0.6, n * 0.7, 0.09 * R), 0.09 * R);
    }
  }
  b.star(X(O), GC.core, Math.min(1, 0.15 + R * 5), Math.min(8, 2.5 + R * 30));
}

// ---------------------------------------------------------------- galaxy clusters
interface Sub { c: V3; w: number; core: number }
interface ClusterOpts {
  /** Member galaxies, galaxy-size scale (radius of the biggest normal members, model units), axis stretch. */
  n: number; size?: number; stretch?: V3;
  /** Sub-clumps (default: one at the origin). */
  subs?: Sub[];
  /** Share of spirals in the outskirts (0..1). */
  spirals?: number;
  /** Hot intracluster gas: flux, colour, radius scale, own clumps. */
  gasF?: number; gasCol?: C3; gasR?: number; gasSubs?: Sub[];
  /** Max radius of the swarm. */
  Rmax?: number;
  cols?: { old?: C3; arm?: C3 };
  sb?: number;
}
export function cluster(b: NB, o: ClusterOpts) {
  const r = b.r, subs = o.subs ?? [{ c: O, w: 1, core: 0.18 }], st = o.stretch ?? [1, 1, 1], Rmax = o.Rmax ?? 0.95, size = o.size ?? 0.03;
  const wsum = subs.reduce((t, s) => t + s.w, 0);
  const pickSub = () => { let x = r() * wsum; for (const s of subs) { x -= s.w; if (x <= 0) return s; } return subs[0]; };
  for (let i = 0, t = 0; i < o.n && t < o.n * 20; t++) {
    const s = pickSub(), d = s.core * Math.tan(r() * Math.atan(Rmax / s.core)) * 0.9, u = unitRand(r);
    const p: V3 = [s.c[0] + u[0] * d * st[0], s.c[1] + u[1] * d * st[1], s.c[2] + u[2] * d * st[2]];
    if (Math.hypot(p[0], p[1], p[2]) > Rmax) continue;
    const pE = 0.85 * Math.exp(-d / (s.core * 2.5)) + (1 - (o.spirals ?? 0.5)) * 0.4;
    const x = r(), type: MiniType = x < pE * 0.6 ? 'E' : x < pE ? 'S0' : r() < 0.15 ? 'Irr' : r() < 0.3 ? 'SB' : 'S';
    const R = size * (0.18 + 0.9 * r() ** 3.5) * (type === 'Irr' ? 0.5 : 1);
    mini(b, p, R, type, r() * 180, 20 + r() * 70, o.sb ?? 1, o.cols);
    i++;
  }
  if (o.gasF) gas(b, o.gasSubs ?? subs, o.gasF, o.gasCol ?? GC.xray, o.gasR ?? 1);
}

/** Hot X-ray gas: soft round haze plus a 3D cloud of faint glow, so it holds up when orbited. */
export function gas(b: NB, subs: Sub[], F: number, col: C3, k = 1) {
  const r = b.r, g = b.g, wsum = subs.reduce((t, s) => t + s.w, 0);
  for (const s of subs) {
    const f = F * s.w / wsum, R = s.core * 2.2 * k;
    for (let i = 0; i < 5; i++) { const hs = R * (0.4 + i * 0.3); b.hz(add(s.c, [g() * R * 0.12, g() * R * 0.12, g() * R * 0.12]), col, f * 0.11 / (hs * hs), hs, 0.35); }
    const n = 5000 * s.w / wsum;
    for (let i = 0, N = b.n(n); i < N; i++) {
      const rr = Math.min(R * 1.8, plummer(r(), R * 0.45)), u = unitRand(r), sz = 0.03 + rr * 0.3;
      b.glw(add(s.c, scale(u, rr)), col, fluxI(f * 0.45, n, sz), sz);
    }
  }
}

// ---------------------------------------------------------------- quasars
interface QuasarOpts {
  c?: V3; I?: number; px?: number;
  /** Host galaxy radius (0 = none) and its flux. */
  host?: number; hostF?: number;
  /** Jet: sky PA, start / end distance, z (towards us) per unit length, knots, flux. */
  jet?: JetOpts;
}
export function quasar(b: NB, o: QuasarOpts) {
  const r = b.r, c = o.c ?? O, I = o.I ?? 2.4, px = o.px ?? 46;
  if ((o.host ?? 0) > 0) elliptical(b, { c, R: o.host!, q: 0.8, a: 0.2, F: o.hostF ?? 0.01, n: 0.4, nucleus: 0, halo: 0.5, pa: r() * 180, c0: GC.old2, c1: GC.old });
  b.star(c, hex('#eaf2ff'), I, px, 1);
  b.star(c, hex('#cfe0ff'), I * 0.35, px * 2.6, 0);
  b.blob(1200, c, [0.012, 0.012, 0.012], () => mix(hex('#bcd2ff'), PAL.white, r()), fluxI(0.004, 1200, 0.02), 0.02);
  b.hz(c, hex('#9fb8ff'), 0.12 * I / 2.4, 0.08, 0.05);
  if (o.jet) jet(b, c, o.jet);
}

interface JetOpts { pa: number; r0: number; r1: number; z?: number; knots?: number; F?: number; col?: C3; width?: number; n?: number }
/** A relativistic jet: a thin, slightly widening line of glow with bright knots, from `r0` to `r1` along sky PA `pa`. */
export function jet(b: NB, c: V3, j: JetOpts) {
  const r = b.r, g = b.g, d = norm(sky(j.pa, 1, j.z ?? 0)), col = j.col ?? hex('#bcd0ff'), w = j.width ?? 0.012, n = j.n ?? 6000, F = j.F ?? 0.004;
  const L = j.r1 - j.r0, sz = Math.max(w * 1.2, L * 0.012);
  for (let i = 0, N = b.n(n); i < N; i++) {
    const t = j.r0 + L * Math.sqrt(r()), ww = w * (0.6 + 0.6 * (t - j.r0) / L);
    b.glw(add(add(c, d, t), [g() * ww, g() * ww, g() * ww]), col, fluxI(F, n, sz) * (0.5 + r()), sz);
  }
  const K = j.knots ?? 0;
  for (let k = 0; k < K; k++) {
    const t = j.r0 + L * (k + 0.5 + g() * 0.15) / K;
    b.blob(400, add(c, d, t), [w * 1.2, w * 1.2, w * 1.2], () => mix(col, PAL.white, r() * 0.5), fluxI(F * 0.25 * (0.6 + (t - j.r0) / L), 400, sz), sz);
  }
}
