import { human, type HumanPose } from '../human.ts';
import * as THREE from 'three';
import type { Builder, Paint, V3 } from '../prims.ts';
import { mat, rbox, box, cyl, prism, hash3 } from '../prims.ts';
import { mx, sh } from '../kit/sculpt.ts';
import { type BirdOpts, type Hull, Soup, bead, bird, blade, carrack, drop, ellip, flag, foam, foil, grp, hinge, hull, lugSail, rod, shrouds, spine, squareSail, triSail, tube, vblob, wake } from '../kit/travel.ts';

// Routes pack 2: historic voyages, animal migrations and iconic vehicles that travel along routes on the globe.
// No plinth — just the moving subject, front +z, ~1 unit long, base at y = 0 (the sea or land surface).

// ======================================================================================================
// Extra helpers: four-cornered sails, square-rigged masts, stroke lettering, figures, dogs, ice
// ======================================================================================================
const l3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Four-cornered fore-and-aft sail (gaff / spanker): tack A, throat B (both on the mast), peak C, clew D. */
function quadSail(p: THREE.Object3D, A: V3, B: V3, C: V3, D: V3, belly: number, paint: (u: number, v: number) => string, nu = 6, nv = 5): void {
  const sp = new Soup();
  sp.sheet(nu, nv, (u, v) => {
    const q = l3(l3(A, D, u), l3(B, C, u), v), t = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * belly;
    return [q[0] + t, q[1], q[2]];
  }, paint, paint, 0.004);
  sp.mesh(p);
  rod(p, B, C, 0.004, '#4a3420', 5);
  rod(p, A, D, 0.004, '#4a3420', 5);
}
/** A mast stepped at hull station u carrying a stack of square sails [yard height above deck, width, drop]. */
function rigMast(p: THREE.Object3D, H: Hull, u: number, h: number, r: number, tiers: [number, number, number][], sail: (u: number, v: number) => string, col = '#3b2a1c'): V3 {
  const z = H.z(u), y0 = H.top(u);
  rod(p, [0, y0 - 0.02, z], [0, y0 + h, z], r, col, 7, r * 0.5);
  if (tiers.length) {
    cyl(p, '#4a3420', 0, y0 + tiers[0][0] + 0.004, z, 0.024, 0.006, 10);
    shrouds(p, [0, y0 + tiers[0][0], z], H, [u - 0.07, u - 0.035, u]);
    if (tiers.length > 1) for (const sd of [-1, 1]) rod(p, [sd * 0.022, y0 + tiers[0][0] + 0.006, z], [0, y0 + tiers[1][0] - 0.01, z], 0.0013, '#2a2018', 3);
  }
  tiers.forEach(([y, w, hh], i) => squareSail(p, [0, y0 + y, z + 0.012 - i * 0.002], w, hh, 0.03 + hh * 0.18, sail, undefined, undefined, i === 0 ? 1.05 : 1.18));
  return [0, y0 + h, z];
}
const SAIL = (c: string) => (u: number) => sh(c, 0.95 + 0.05 * (Math.floor(u * 6) % 2));

// Minimal stroke font on a 2×3 grid (Latin + the Cyrillic letters needed for РОСАТОМФЛОТ).
const FONT: Record<string, number[][][]> = {
  A: [[[0, 0], [0, 2], [1, 3], [2, 2], [2, 0]], [[0, 1.3], [2, 1.3]]], C: [[[2, 3], [0, 3], [0, 0], [2, 0]]],
  E: [[[2, 3], [0, 3], [0, 0], [2, 0]], [[0, 1.5], [1.4, 1.5]]], F: [[[0, 0], [0, 3], [2, 3]], [[0, 1.5], [1.4, 1.5]]],
  G: [[[2, 3], [0, 3], [0, 0], [2, 0], [2, 1.4], [1, 1.4]]], H: [[[0, 0], [0, 3]], [[2, 0], [2, 3]], [[0, 1.5], [2, 1.5]]],
  I: [[[1, 0], [1, 3]]], L: [[[0, 3], [0, 0], [2, 0]]], M: [[[0, 0], [0, 3], [1, 1.6], [2, 3], [2, 0]]], N: [[[0, 0], [0, 3], [2, 0], [2, 3]]],
  O: [[[0, 0], [0, 3], [2, 3], [2, 0], [0, 0]]], P: [[[0, 0], [0, 3], [2, 3], [2, 1.5], [0, 1.5]]],
  R: [[[0, 0], [0, 3], [2, 3], [2, 1.5], [0, 1.5]], [[0.8, 1.5], [2, 0]]], S: [[[2, 3], [0, 3], [0, 1.5], [2, 1.5], [2, 0], [0, 0]]],
  T: [[[0, 3], [2, 3]], [[1, 3], [1, 0]]], U: [[[0, 3], [0, 0], [2, 0], [2, 3]]], X: [[[0, 0], [2, 3]], [[0, 3], [2, 0]]],
  '1': [[[1, 0], [1, 3], [0.4, 2.5]]], '2': [[[0, 3], [2, 3], [2, 1.5], [0, 1.5], [0, 0], [2, 0]]], '-': [[[0.4, 1.5], [1.6, 1.5]]],
  B: [[[0, 0], [0, 3], [1.5, 3], [2, 2.4], [1.5, 1.5], [0, 1.5]], [[1.5, 1.5], [2, 0.7], [1.5, 0], [0, 0]]],
  D: [[[0, 0], [0, 3], [1.3, 3], [2, 2.2], [2, 0.8], [1.3, 0], [0, 0]]], K: [[[0, 0], [0, 3]], [[2, 3], [0, 1.3]], [[0.7, 1.9], [2, 0]]],
  V: [[[0, 3], [1, 0], [2, 3]]], W: [[[0, 3], [0.45, 0], [1, 1.8], [1.55, 0], [2, 3]]], Y: [[[0, 3], [1, 1.6], [2, 3]], [[1, 1.6], [1, 0]]],
  Z: [[[0, 3], [2, 3], [0, 0], [2, 0]]], '7': [[[0, 3], [2, 3], [0.8, 0]]],
  'Ф': [[[1, 0], [1, 3]], [[0, 0.8], [0, 2.2], [2, 2.2], [2, 0.8], [0, 0.8]]], 'Л': [[[0, 0], [0.6, 3], [2, 3], [2, 0]]],
};
const CYR: Record<string, string> = { 'Р': 'P', 'С': 'C', 'А': 'A', 'Т': 'T', 'О': 'O', 'М': 'M' };
/** Stroke lettering: text starts at o, advancing along ax and rising along ay (both per font unit). */
function letters(p: THREE.Object3D, text: string, o: V3, ax: V3, ay: V3, r: number, c: string): void {
  [...text].forEach((ch, i) => {
    const strokes = FONT[CYR[ch] ?? ch];
    if (!strokes) return;
    const at = (q: number[]): V3 => [o[0] + ax[0] * (i * 3 + q[0]) + ay[0] * q[1], o[1] + ax[1] * (i * 3 + q[0]) + ay[1] * q[1], o[2] + ax[2] * (i * 3 + q[0]) + ay[2] * q[1]];
    for (const st of strokes) for (let k = 0; k < st.length - 1; k++) rod(p, at(st[k]), at(st[k + 1]), r, c, 4);
  });
}
/** Little standing figure (~0.14 tall at s = 1) with coat, head, optional hat and arms (reach: arm angle forward). */
function person(p: THREE.Object3D, at: V3, yaw: number, s: number, coat: string, o: { hat?: string; skin?: string; legs?: string; reach?: number; hair?: string; robe?: boolean; pose?: HumanPose } = {}): THREE.Group {
  const b = grp(p, at, [0, yaw, 0], s);
  const rc = o.reach ?? 0.3;
  human(b, 0, 0, 0, {
    h: 0.14, top: coat, skin: o.skin ?? '#e2ad86', bottom: o.legs ?? '#3a3a42', hair: o.hair ?? '#3b2a20', hat: o.hat, hatStyle: 'brim',
    dress: o.robe ? 'ankle' : undefined, pose: o.pose ?? (rc >= 0.6 ? 'carry' : 'relax'), detail: 'lo',
  });
  return b;
}
/** Small husky / dog: body, head with snout and ears, curled tail. */
function dog(p: THREE.Object3D, at: V3, yaw: number, s: number, c: string, belly = c): void {
  const b = grp(p, at, [0, yaw, 0], s);
  vblob(b, c, 0, 0.05, 0, 0.022, 0.022, 0.045, (_x, y) => (y < 0.042 ? belly : null), [0, 0, 0], 10);
  for (const sx of [-1, 1]) for (const z of [-0.028, 0.028]) rod(b, [sx * 0.012, 0.045, z], [sx * 0.012, 0, z], 0.005, c, 4);
  vblob(b, c, 0, 0.074, 0.05, 0.016, 0.016, 0.019, (_x, y) => (y < 0.068 ? belly : null), [0, 0, 0], 10);
  drop(b, belly, [0, 0.068, 0.062], [0, 0.065, 0.082], 0.008, 0.007);
  bead(b, 0, 0.068, 0.083, 0.003);
  for (const sx of [-1, 1]) drop(b, c, [sx * 0.008, 0.084, 0.046], [sx * 0.01, 0.1, 0.044], 0.005, 0.003);
  tube(b, [[0, 0.06, -0.04], [0, 0.085, -0.05], [0, 0.088, -0.035]], 0.006, 0.004, c, 5);
}
/** Flat ice floe (jagged slab sitting at the waterline) — scattered patches, never a base. */
function floe(p: THREE.Object3D, x: number, z: number, r: number, seed: number): void {
  const plan: [number, number][] = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, rr = r * (0.65 + 0.5 * hash3(seed, i, 3)); plan.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr * 0.8]); }
  prism(p, plan, -0.012, 0.02, '#cfe3ee');
  prism(p, plan.map(([px, pz]) => [x + (px - x) * 0.86, z + (pz - z) * 0.86] as [number, number]), 0.006, 0.006, '#f6fbfe');
}
const norway = (u: number, v: number) => {
  const cu = Math.abs(u - 0.36), cv = Math.abs(v - 0.5);
  return cu < 0.055 || cv < 0.09 ? '#1d3a8a' : cu < 0.11 || cv < 0.18 ? '#f4f4f4' : '#c8202f';
};
const redEnsign = (u: number, v: number) => (u < 0.45 && v < 0.5 ? (Math.abs(u - 0.225) < 0.06 || Math.abs(v - 0.25) < 0.09 ? '#c8202f' : '#1f2f7a') : '#c42820');

interface NeckBirdOpts {
  base: string; paint?: Paint; bill: string; billL: number; legs?: string; legL?: number; neck: number;
  span: number; chord: number; sweep?: number; wing: (u: number, v: number) => string; wingDn?: (u: number, v: number) => string; tail: string; fingers?: number;
}
/** Long-necked flier (stork, goose, crane): neck stretched forward, broad two-sided flapping wings, legs trailing or tucked. */
function neckBird(p: THREE.Object3D, at: V3, rot: V3, s: number, o: NeckBirdOpts, beat = 0.2): void {
  const b = grp(p, at, rot, s), n = o.neck, hz = 0.13 + n;
  spine(b, [
    { p: [0, 0.004, -0.17], w: 0.014, h: 0.008 }, { p: [0, 0, -0.11], w: 0.04, h: 0.034 }, { p: [0, 0, -0.03], w: 0.05, h: 0.044 }, { p: [0, 0.004, 0.05], w: 0.038, h: 0.036 },
    { p: [0, 0.01, 0.1], w: 0.017, h: 0.018 }, { p: [0, 0.014, 0.1 + n * 0.5], w: 0.012, h: 0.013 }, { p: [0, 0.016, 0.1 + n], w: 0.016, h: 0.017 }, { p: [0, 0.016, hz], w: 0.009, h: 0.01 },
  ], o.base, o.paint, { nu: 42, nv: 12 });
  tube(b, [[0, 0.016, hz - 0.006], [0, 0.012, hz + o.billL * 0.5], [0, 0.008, hz + o.billL]], 0.0068, 0.0016, o.bill, 6);
  for (const sx of [-1, 1]) bead(b, sx * 0.012, 0.022, hz - 0.018, 0.0042);
  for (const sx of [-1, 1]) {
    blade(b, o.tail, [sx * 0.006, 0.004, -0.13], [sx * 0.03, 0.004, -0.21], 0.018, 0.003, [0, 1, 0]);
    blade(b, o.tail, [0, 0.004, -0.13], [sx * 0.01, 0.004, -0.22], 0.018, 0.003, [0, 1, 0]);
  }
  if (o.legs) {
    const L = o.legL ?? 0.06;
    for (const sx of [-1, 1]) tube(b, [[sx * 0.012, -0.022, -0.06], [sx * 0.01, -0.022, -0.16], [sx * 0.008, -0.018, -0.1 - L]], 0.0042, 0.003, o.legs, 5);
  }
  const fg = o.fingers ?? 0;
  for (const sx of [-1, 1]) {
    const f = hinge(b, sx, [0.03, 0.012, 0.01]);
    const w = grp(f, [0, 0, 0], [0, 0, beat]);
    const sp = new Soup(), S = o.span, C = o.chord, sw = o.sweep ?? 0.04;
    sp.sheet(14, 5, (u, v) => {
      const le = 0.035 - sw * u * u, ch = C * (1 - 0.45 * Math.pow(u, 3)) * (u > 0.8 && fg ? 1 - fg * Math.abs(Math.sin(u * 60)) * v : 1);
      return [u * S, 0.025 * Math.sin(u * Math.PI) - 0.015 * u * u - v * 0.006, le - v * ch];
    }, o.wing, o.wingDn ?? o.wing, 0.007);
    sp.mesh(w);
  }
}
/** Sockeye salmon in spawning colours (red body, olive-green head, hooked kype jaw, hump), ~0.42 long at s = 1. */
function salmon(p: THREE.Object3D, at: V3, rot: V3, s: number, hump = 1): void {
  const b = grp(p, at, rot, s);
  const red = '#c62a26', dark = '#951c1d', green = '#3f5a33';
  spine(b, [
    { p: [0, 0.0, -0.2], w: 0.006, h: 0.016 }, { p: [0, 0.004, -0.14], w: 0.018, h: 0.04 }, { p: [0, 0.008, -0.05], w: 0.032, h: 0.068 },
    { p: [0, 0.012 + hump * 0.006, 0.03], w: 0.035, h: 0.074 + hump * 0.012 }, { p: [0, 0.008, 0.1], w: 0.03, h: 0.055 }, { p: [0, 0.0, 0.16], w: 0.02, h: 0.034 }, { p: [0, -0.006, 0.205], w: 0.008, h: 0.014 },
  ], red, (_x, y, z, _nx, ny) => {
    if (z > 0.105) return y < -0.012 && ny < 0 ? '#d6ccb0' : green;
    if (z > 0.085) return ny > 0.2 ? green : mx(green, red, 0.5);
    if (z < -0.16) return '#4a5a3a';
    return ny > 0.55 ? dark : ny < -0.6 ? '#d4473a' : red;
  }, { nu: 28, nv: 14 });
  // Kype: hooked lower jaw and snout
  tube(b, [[0, -0.022, 0.15], [0, -0.02, 0.19], [0, -0.008, 0.215]], 0.006, 0.003, '#d6ccb0', 5);
  drop(b, green, [0, -0.002, 0.2], [0, -0.016, 0.222], 0.006, 0.006);
  for (const sx of [-1, 1]) { bead(b, sx * 0.016, 0.008, 0.16, 0.0058, '#1a1410'); ellip(b, '#c9b26a', sx * 0.0185, 0.008, 0.159, 0.0035, 0.0072, 0.0072); }
  // Fins: forked caudal, dorsal, adipose, pectorals, pelvics, anal
  const fin = '#3d4a33';
  for (const sy of [-1, 1]) blade(b, fin, [0, 0.0, -0.195], [0, sy * 0.045, -0.265], 0.022, 0.003, [1, 0, 0]);
  blade(b, fin, [0, 0.06 + hump * 0.008, 0.02], [0, 0.085 + hump * 0.008, -0.04], 0.022, 0.003, [1, 0, 0]);
  blade(b, fin, [0, 0.03, -0.12], [0, 0.04, -0.14], 0.007, 0.002, [1, 0, 0]);
  blade(b, fin, [0, -0.03, -0.09], [0, -0.05, -0.13], 0.014, 0.003, [1, 0, 0]);
  for (const sx of [-1, 1]) {
    blade(b, fin, [sx * 0.02, -0.025, 0.09], [sx * 0.045, -0.04, 0.05], 0.012, 0.002, [0, 1, 0.4]);
    blade(b, fin, [sx * 0.012, -0.045, -0.02], [sx * 0.025, -0.06, -0.06], 0.01, 0.002, [0, 1, 0]);
  }
}
/** Silver-phase European eel: a long sinuous body with continuous dorsal/anal fin fringe. */
function eel(p: THREE.Object3D, at: V3, yaw: number, s: number, ph: number): void {
  const b = grp(p, at, [0, yaw, 0], s);
  const N = 11, pts: V3[] = [];
  for (let i = 0; i < N; i++) { const t = i / (N - 1), z = -0.3 + t * 0.6; pts.push([0.05 * Math.sin(t * 9 + ph) * (1.1 - t * 0.8), 0, z]); }
  const st = pts.map((q, i) => { const t = i / (N - 1); const w = 0.004 + 0.016 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * (t > 0.92 ? 0.8 : 1); return { p: q, w, h: w * 1.15 }; });
  st[N - 1].w = 0.009; st[N - 1].h = 0.008;
  spine(b, st, '#2f3a2a', (_x, _y, _z, _nx, ny) => (ny > 0.25 ? '#26301f' : ny < -0.3 ? '#cfd3cb' : ny < 0.0 ? '#8d978a' : '#465140'), { nu: 50, nv: 10 });
  // Fin fringe along the back and belly of the rear two-thirds
  const cu = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)), false, 'centripetal'), sp = new Soup();
  for (const sy of [-1, 1]) sp.sheet(18, 1, (u, v) => {
    const P = cu.getPoint(u * 0.62);
    const w = 0.004 + 0.016 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.62 * 1.15)), 0.6);
    return [P.x, sy * (w * 1.05 + v * 0.012 * (1 - u * 0.4)), P.z];
  }, () => '#3a4434', () => '#3a4434', 0.002);
  sp.mesh(b);
  const hd = pts[N - 1];
  for (const sx of [-1, 1]) { bead(b, hd[0] + sx * 0.008, 0.007, hd[2] - 0.012, 0.0035, '#0e0e0c'); blade(b, '#5a6650', [hd[0] + sx * 0.014, -0.002, hd[2] - 0.035], [hd[0] + sx * 0.03, -0.004, hd[2] - 0.05], 0.007, 0.0015, [0, 1, 0]); }
}
/** Floating golden sargassum weed clump with little air bladders. */
function sargassum(p: THREE.Object3D, x: number, z: number, r: number, seed: number): void {
  for (let i = 0; i < 6; i++) {
    const a = hash3(seed, i, 1) * Math.PI * 2, d = r * hash3(seed, i, 2);
    vblob(p, i % 2 ? '#b58a2a' : '#9a7424', x + Math.cos(a) * d, 0.006, z + Math.sin(a) * d, r * 0.5, 0.007, r * 0.3, undefined, [0, a, 0], 8);
    ellip(p, '#d0a63a', x + Math.cos(a) * d * 1.2, 0.012, z + Math.sin(a) * d * 1.2, 0.006);
  }
}
/** Straw-coloured fruit bat: golden mantle, fox face with big eyes, dark membrane wings over finger bones. */
function fruitBat(p: THREE.Object3D, at: V3, rot: V3, s: number, beat: number): void {
  const b = grp(p, at, rot, s);
  const brn = '#5e4128', straw = '#d6ab4a';
  vblob(b, brn, 0, 0, -0.01, 0.04, 0.034, 0.07, (_x, y, z) => (z > 0.02 && y > -0.02 ? straw : z > 0.03 ? '#b48a3a' : null), [0, 0, 0], 12);
  vblob(b, straw, 0, 0.012, 0.075, 0.03, 0.028, 0.032, (_x, y, z) => (z > 0.09 && y < 0.008 ? '#7a5a34' : null), [0, 0, 0], 12);
  drop(b, '#6a4a2c', [0, 0.008, 0.09], [0, 0.0, 0.135], 0.014, 0.012);
  bead(b, 0, 0.002, 0.136, 0.004);
  for (const sx of [-1, 1]) {
    bead(b, sx * 0.016, 0.02, 0.1, 0.0065, '#120c08');
    drop(b, '#3a2818', [sx * 0.016, 0.03, 0.07], [sx * 0.024, 0.06, 0.066], 0.008, 0.004);
    for (const z of [-0.055]) tube(b, [[sx * 0.016, -0.02, z], [sx * 0.02, -0.03, z - 0.04]], 0.004, 0.003, '#2e2016', 4);
  }
  for (const sx of [-1, 1]) {
    const f = hinge(b, sx, [0.03, 0.01, 0.02]);
    const w = grp(f, [0, 0, 0], [0, 0, beat]);
    const sh0: V3 = [0, 0, 0], el: V3 = [0.1, 0.012, -0.02], wr: V3 = [0.2, 0.02, 0.03];
    const tips: V3[] = [[0.34, 0.012, 0.06], [0.37, 0.004, -0.04], [0.31, 0.0, -0.13], [0.21, -0.004, -0.17]], hip: V3 = [-0.01, -0.01, -0.09];
    // Membrane: fan from the wrist through the finger tips, plus the arm patagium to the hip; scalloped trailing edge
    const sp = new Soup(), mem = '#3a2618', memDn = '#4e3420';
    const ring: V3[] = [sh0, el, ...tips, hip];
    const ctr: V3 = [0.17, 0.008, -0.04];
    for (let i = 0; i < ring.length - 1; i++) {
      const A = ring[i], B = ring[i + 1], M = l3(l3(A, B, 0.5), ctr, i >= 2 && i < ring.length - 2 ? 0.22 : 0);
      for (const [q0, q1] of [[A, M], [M, B]] as [V3, V3][]) { sp.tri(ctr, q0, q1, mem); sp.tri(ctr, q1, q0, memDn); }
    }
    sp.mesh(w);
    rod(w, sh0, el, 0.006, '#4a3220', 5); rod(w, el, wr, 0.005, '#4a3220', 5);
    for (const t of tips) rod(w, wr, t, 0.0025, '#4a3220', 4);
    drop(w, '#2a1c12', wr, [0.22, 0.03, 0.05], 0.004, 0.003);
  }
}
// ======================================================================================================
// Vehicles: carriage shells, Soup boxes & wheels, ribbon lettering, hull decals
// ======================================================================================================
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Flat ribbon lettering baked into a Soup (one mesh); strokes face ax × ay, `map` can wrap them onto a curved hull. */
function sletters(sp: Soup, text: string, o: V3, ax: V3, ay: V3, r: number, c: string, map?: (q: V3) => V3): void {
  const n = nrm3(cross3(ax, ay));
  [...text].forEach((ch, i) => {
    const strokes = FONT[CYR[ch] ?? ch];
    if (!strokes) return;
    const at = (q: number[]): V3 => [o[0] + ax[0] * (i * 3 + q[0]) + ay[0] * q[1], o[1] + ax[1] * (i * 3 + q[0]) + ay[1] * q[1], o[2] + ax[2] * (i * 3 + q[0]) + ay[2] * q[1]];
    for (const st of strokes) for (let k = 0; k < st.length - 1; k++) {
      const a0 = at(st[k]), b0 = at(st[k + 1]), d = nrm3([b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]]), w = nrm3(cross3(n, d));
      const P = (q: V3, sd: number, ex: number): V3 => {
        const v: V3 = [q[0] + w[0] * r * sd + d[0] * r * ex, q[1] + w[1] * r * sd + d[1] * r * ex, q[2] + w[2] * r * sd + d[2] * r * ex];
        return map ? map(v) : v;
      };
      sp.quad(P(a0, -1, -0.8), P(b0, -1, 0.8), P(b0, 1, 0.8), P(a0, 1, -0.8), c);
    }
  });
}
/** Axis-aligned box into a Soup; y is the bottom. Face colours [+x, −x, +y, −y, +z, −z] (default all c). */
function sbox(sp: Soup, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, fc?: (string | undefined)[]): void {
  const x0 = x - sx / 2, z0 = z - sz / 2, X = sx, Y = sy, Z = sz, f = (o: V3, u: V3, v: V3, k: number) => {
    sp.quad(o, [o[0] + u[0], o[1] + u[1], o[2] + u[2]], [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]], [o[0] + v[0], o[1] + v[1], o[2] + v[2]], fc?.[k] ?? c);
  };
  f([x0 + X, y, z0], [0, Y, 0], [0, 0, Z], 0); f([x0, y, z0], [0, 0, Z], [0, Y, 0], 1);
  f([x0, y + Y, z0], [0, 0, Z], [X, 0, 0], 2); f([x0, y, z0], [X, 0, 0], [0, 0, Z], 3);
  f([x0, y, z0 + Z], [X, 0, 0], [0, Y, 0], 4); f([x0, y, z0], [0, Y, 0], [X, 0, 0], 5);
}
/** Wheel face (disc in the y-z plane) looking out along ±x, with a darker tyre ring and hub. */
function sdisc(sp: Soup, x: number, y: number, z: number, r: number, side: number, c: string, tyre = '#1d1f23', n = 12): void {
  const ring = (rr: number, dx: number, col: string) => {
    const C: V3 = [x + dx * side, y, z];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      const A: V3 = [C[0], y + Math.sin(a) * rr, z + Math.cos(a) * rr], B: V3 = [C[0], y + Math.sin(b) * rr, z + Math.cos(b) * rr];
      if (side > 0) sp.tri(C, B, A, col); else sp.tri(C, A, B, col);
    }
  };
  ring(r, 0, tyre); ring(r * 0.8, 0.001, c); ring(r * 0.25, 0.002, tyre);
}
/** Two/three-axle bogie: frame plus wheel faces both sides. */
function sbogie(sp: Soup, z: number, w: number, axles = 2, wr = 0.013, c = '#26292e'): void {
  const L = (axles - 1) * wr * 2.4;
  sbox(sp, c, 0, wr * 0.6, z, w * 1.7, wr * 1.1, L + wr * 2.2);
  for (let i = 0; i < axles; i++) for (const sd of [-1, 1]) sdisc(sp, sd * w * 0.86, wr, z - L / 2 + i * wr * 2.4, wr, sd, '#3b3f46');
}
/** Rounded-rectangle section (right half bottom→top, then mirrored), anticlockwise seen from +z; extra side vertices at `ys`. */
function rrSec(w: number, h: number, r: number, rt: number, ys: number[], n = 3): [number, number][] {
  const R: [number, number][] = [[0, 0]];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; R.push([w - r + Math.cos(a) * r, r + Math.sin(a) * r]); }
  for (const y of [...ys].sort((a, b) => a - b)) if (y > r + 1e-4 && y < h - rt - 1e-4) R.push([w, y]);
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; R.push([w - rt + Math.cos(a) * rt, h - rt + Math.sin(a) * rt]); }
  R.push([0, h]);
  const L = R.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [...R, ...L];
}
interface CarO {
  zb: number; zf: number; w: number; y0: number; h: number; r?: number; rTop?: number; ys?: number[]; zs?: number[];
  /** Colour for each face from its centre and normal. */
  paint: (z: number, y: number, nx: number, ny: number, nz: number) => string; capB?: string; capF?: string;
  /** Extra rings near the ends: [distance in from the end, width scale, height scale]. */
  nose?: [number, number, number][]; tail?: [number, number, number][];
}
/** Railway carriage / locomotive shell into a Soup: crisp per-face livery (window edges come from `ys`/`zs` breakpoints). */
function carBody(sp: Soup, o: CarO): void {
  const sec = rrSec(o.w, o.h, o.r ?? 0.008, o.rTop ?? o.r ?? 0.008, (o.ys ?? []).map(y => y - o.y0)), m = sec.length;
  const rs: [number, number, number][] = [[o.zb, 1, 1], [o.zf, 1, 1]];
  for (const z of o.zs ?? []) if (z > o.zb + 1e-4 && z < o.zf - 1e-4) rs.push([z, 1, 1]);
  for (const [d, a, b] of o.nose ?? []) rs.push([o.zf - d, a, b]);
  for (const [d, a, b] of o.tail ?? []) rs.push([o.zb + d, a, b]);
  rs.sort((a, b) => a[0] - b[0]);
  const rings = rs.map(([z, a, b]) => sec.map(([x, y]) => [x * a, o.y0 + y * b, z] as V3));
  const vn = sec.map((_, j) => {
    const p0 = sec[(j + m - 1) % m], p1 = sec[j], p2 = sec[(j + 1) % m];
    const n1 = nrm3([p1[1] - p0[1], -(p1[0] - p0[0]), 0]), n2 = nrm3([p2[1] - p1[1], -(p2[0] - p1[0]), 0]);
    return nrm3([n1[0] + n2[0], n1[1] + n2[1], 0]);
  });
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < m; j++) {
    const j1 = (j + 1) % m, A = rings[i][j], B = rings[i][j1], C = rings[i + 1][j1], D = rings[i + 1][j];
    const fn = nrm3(cross3([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]));
    const col = o.paint((A[2] + C[2]) / 2, (A[1] + B[1] + C[1] + D[1]) / 4, fn[0], fn[1], fn[2]);
    if (Math.abs(fn[2]) > 0.15) sp.quad(A, B, C, D, col);
    else { sp.tri(A, B, C, col, vn[j], vn[j1], vn[j1]); sp.tri(A, C, D, col, vn[j], vn[j1], vn[j]); }
  }
  for (const [ring, sg, cc] of [[rings[0], -1, o.capB], [rings[rings.length - 1], 1, o.capF]] as const) {
    const C: V3 = [0, ring.reduce((s0, q) => s0 + q[1], 0) / m, ring[0][2]], col = cc ?? o.paint(C[2], C[1], 0, 0, sg);
    for (let j = 0; j < m; j++) { const a = ring[j], b = ring[(j + 1) % m]; if (sg > 0) sp.tri(C, a, b, col); else sp.tri(C, b, a, col); }
  }
}
/** Hull-side decal between stations u0..u1 and heights y0..y1 on side sd (cells where paint(s, t) is null are skipped). */
function decal(sp: Soup, H: Hull, sd: number, u0: number, u1: number, y0: number, y1: number, nu: number, nv: number, paint: (s: number, t: number) => string | null, off = 0.0015): void {
  const vAt = (u: number, y: number) => {
    let a = 0, b = 0.5;
    for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (H.pt(u, m)[1] > y) a = m; else b = m; }
    return sd > 0 ? (a + b) / 2 : 1 - (a + b) / 2;
  };
  const P = (s0: number, t: number): V3 => { const u = u0 + (u1 - u0) * s0, q = H.pt(u, vAt(u, y0 + (y1 - y0) * t)); return [q[0] + sd * off, q[1], q[2]]; };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const c = paint((i + 0.5) / nu, (j + 0.5) / nv);
    if (!c) continue;
    const A = P(i / nu, j / nv), B = P((i + 1) / nu, j / nv), C = P((i + 1) / nu, (j + 1) / nv), D = P(i / nu, (j + 1) / nv);
    if (sd > 0) sp.quad(A, D, C, B, c); else sp.quad(A, B, C, D, c);
  }
}
const glow = (m: THREE.Mesh, c: string) => { m.material = mat(c, { emissive: c }); return m; };
/** Full-width diesel cab unit (y0 0.034, h 0.11) with a raked windscreen nose at +z (and at −z when `both`). */
function diesel(sp: Soup, zb: number, zf: number, o: { body: string; roof: string; glass: string; front: string; both?: boolean; ys?: number[];
  livery?: (z: number, y: number, nx: number, ny: number, nz: number) => string | null }): void {
  const w = 0.047, y0 = 0.034, nose: [number, number, number][] = [[0.034, 1, 1], [0.016, 0.985, 0.93], [0, 0.95, 0.82]];
  const cabF = (z: number) => z > zf - 0.06 || (!!o.both && z < zb + 0.06);
  carBody(sp, {
    zb, zf, w, y0, h: 0.11, r: 0.006, rTop: 0.014, ys: [0.046, 0.104, 0.124, ...(o.ys ?? [])], zs: [zf - 0.058, zf - 0.042, zb + 0.042, zb + 0.058], nose, tail: o.both ? nose : [],
    capF: o.front, capB: o.both ? o.front : o.body,
    paint: (z, y, nx, ny, nz) => {
      if (Math.abs(nz) > 0.15 && y > 0.1) return o.glass;
      const L = o.livery?.(z, y, nx, ny, nz);
      if (L) return L;
      if (ny > 0.6) return o.roof;
      if (Math.abs(nx) > 0.6 && y > 0.104 && y < 0.124 && cabF(z) && (z > zf - 0.042 || z < zb + 0.042)) return o.glass;
      return y < 0.046 ? sh(o.body, 0.6) : o.body;
    },
  });
  // Windscreen glazing and headlights on the front face(s), roof fans, three-axle bogies
  for (const [zz, sg] of (o.both ? [[zf, 1], [zb, -1]] : [[zf, 1]]) as [number, number][]) {
    sbox(sp, o.glass, 0, 0.1, zz + sg * 0.0012, 0.074, 0.018, 0.002);
    sbox(sp, '#1a1b1e', 0, 0.034, zz + sg * 0.0015, 0.09, 0.008, 0.003);
  }
  for (let k = 0; k < 3; k++) sbox(sp, '#5b6067', 0, 0.143, zb + (zf - zb) * (0.3 + k * 0.17), 0.05, 0.006, 0.04);
  sbogie(sp, zb + 0.05, w, 3, 0.012);
  sbogie(sp, zf - 0.05, w, 3, 0.012);
}
/** Passenger coach shell with one window band; `win` decides glass vs. pier at z, `livery` overrides other faces. */
function coach(sp: Soup, zb: number, zf: number, o: { body: string; roof: string; glass: string; yw: [number, number]; ys?: number[]; pitch?: number;
  livery?: (z: number, y: number, nx: number, ny: number) => string | null; rTop?: number }): void {
  const w = 0.047, pitch = o.pitch ?? 0.03, n = Math.floor((zf - zb - 0.05) / pitch), z0 = (zb + zf) / 2 - ((n - 1) * pitch) / 2, zs: number[] = [];
  for (let k = 0; k < n; k++) zs.push(z0 + k * pitch - pitch * 0.33, z0 + k * pitch + pitch * 0.33);
  const inWin = (z: number) => { const k = Math.round((z - z0) / pitch); return k >= 0 && k < n && Math.abs(z - (z0 + k * pitch)) < pitch * 0.33; };
  carBody(sp, {
    zb, zf, w, y0: 0.032, h: 0.108, r: 0.006, rTop: o.rTop ?? 0.02, ys: [0.04, ...o.yw, ...(o.ys ?? [])], zs, capB: '#1b1c20', capF: '#1b1c20',
    paint: (z, y, nx, ny) => {
      if (Math.abs(nx) > 0.6 && y > o.yw[0] && y < o.yw[1]) return inWin(z) ? o.glass : (o.livery?.(z, y, nx, ny) ?? o.body);
      const L = o.livery?.(z, y, nx, ny);
      if (L) return L;
      if (ny > 0.45) return o.roof;
      return y < 0.04 ? sh(o.body, 0.55) : o.body;
    },
  });
  sbogie(sp, zb + 0.042, w);
  sbogie(sp, zf - 0.042, w);
}
// ======================================================================================================
// Builders
// ======================================================================================================
export const H_ROUTES2: Record<string, Builder> = {
  // ---------------------------------------------------------------------------------------------- Voyages
  vy_kontiki: gp => {
    // Kon-Tiki (1947): nine balsa logs lashed side by side, bamboo deck and a leaf-thatched bamboo cabin,
    // mangrove A-frame mast with a big square sail painted with the bearded red face of the god Kon-Tiki
    const balsa = ['#b99b68', '#a98b5c', '#c4a774', '#b0935f'];
    for (let i = 0; i < 9; i++) {
      const k = Math.abs(i - 4), zf = 0.42 - k * 0.014 - (k > 2 ? 0.02 : 0), zb = -0.4 + k * 0.006;
      rod(gp, [(i - 4) * 0.041, 0.012, zb], [(i - 4) * 0.041, 0.012, zf], 0.021, balsa[i % 4], 8);
      ellip(gp, sh(balsa[i % 4], 1.12), (i - 4) * 0.041, 0.012, zf, 0.019, 0.019, 0.008);
      ellip(gp, sh(balsa[i % 4], 1.12), (i - 4) * 0.041, 0.012, zb, 0.019, 0.019, 0.006);
    }
    for (const z of [-0.33, -0.2, -0.05, 0.1, 0.25, 0.36]) rod(gp, [-0.19, 0.036, z], [0.19, 0.036, z], 0.008, '#9a7a4c', 6);
    // Split-bamboo deck (alternating slats)
    for (let i = 0; i < 12; i++) box(gp, i % 2 ? '#d6bd84' : '#c9ad72', -0.15 + i * 0.0273, 0.042, 0.0, 0.026, 0.006, 0.6);
    // Bamboo cabin with plaited walls and a banana-leaf roof
    const cz = -0.11;
    rbox(gp, '#c2a066', 0, 0.09, cz, 0.16, 0.085, 0.2, 0.004);
    for (const sd of [-1, 1]) for (let i = 0; i < 9; i++) rod(gp, [sd * 0.082, 0.048, cz - 0.095 + i * 0.024], [sd * 0.082, 0.13, cz - 0.095 + i * 0.024], 0.0035, '#9b7a46', 4);
    box(gp, '#3a2a18', 0, 0.048, cz + 0.101, 0.05, 0.06, 0.004);
    for (const sd of [-1, 1]) {
      const m = rbox(gp, sd > 0 ? '#8b8f3e' : '#7d7f36', sd * 0.048, 0.152, cz, 0.112, 0.012, 0.24, 0.004);
      m.rotation.z = -sd * 0.55;
      for (let i = 0; i < 6; i++) { const r2 = box(gp, '#6c6a2c', sd * 0.048, 0.157, cz - 0.1 + i * 0.04, 0.11, 0.003, 0.006); r2.rotation.z = -sd * 0.55; }
    }
    rod(gp, [0, 0.183, cz - 0.125], [0, 0.183, cz + 0.125], 0.006, '#6c6a2c', 5);
    // Lorita the parrot on the roof ridge
    vblob(gp, '#2f9a3a', 0.0, 0.198, cz + 0.06, 0.008, 0.011, 0.008, (_x, y) => (y > 0.203 ? '#e04a2a' : null), [0, 0, 0], 8);
    // Mangrove A-frame mast, yard and the Kon-Tiki face sail
    const zm = 0.12, top = 0.6;
    for (const sd of [-1, 1]) rod(gp, [sd * 0.13, 0.045, zm], [sd * 0.008, top, zm], 0.007, '#6b4a2a', 6);
    rod(gp, [-0.13, 0.05, zm], [0, top, zm - 0.18], 0.0016, '#3a2a18', 3);
    rod(gp, [0.13, 0.05, zm], [0, top, zm - 0.18], 0.0016, '#3a2a18', 3);
    rod(gp, [0, top, zm], [0, 0.05, 0.4], 0.0016, '#3a2a18', 3);
    const tiki = (u: number, v: number) => {
      const x = (u - 0.5) / 0.4, y = (v - 0.46) / 0.42, r = Math.hypot(x, y);
      const R = '#a92f26', base = sh('#d7b27a', 0.94 + 0.06 * hash3(Math.floor(u * 6), 1, 2));
      if (r > 1.02) return base;
      if (r > 0.86 || y < -0.62) return R;
      for (const ex of [-0.36, 0.36]) { const d = Math.hypot(x - ex, (y + 0.18) * 1.3); if (d < 0.2) return d < 0.09 ? '#f1e2c0' : R; }
      if (Math.abs(x) < 0.08 && y > -0.2 && y < 0.18) return R;
      if (Math.abs(y - 0.33) < 0.06 && Math.abs(x) < 0.38) return R;
      if (y > 0.46 && Math.floor((x + 1) * 5.5) % 2 === 0) return R;
      return base;
    };
    const sw = 0.46, shh = 0.4, yy = top - 0.03, sp = new Soup();
    sp.sheet(20, 16, (u, v) => [(u - 0.5) * sw * (1 + 0.06 * v), yy - v * shh, zm + 0.012 + 0.05 * Math.pow(Math.sin(Math.PI * u), 0.7) * Math.sin(Math.PI * (0.1 + 0.8 * v))], tiki, (u, v) => tiki(1 - u, v), 0.005);
    sp.mesh(gp);
    rod(gp, [-sw * 0.56, yy + 0.006, zm + 0.01], [sw * 0.56, yy + 0.006, zm + 0.01], 0.0065, '#7a5a34', 6);
    rod(gp, [-sw * 0.5, yy - shh, zm + 0.02], [sw * 0.5, yy - shh, zm + 0.02], 0.0045, '#7a5a34', 5);
    rod(gp, [0, top, zm], [0, top + 0.06, zm], 0.003, '#3a2a18', 4);
    flag(gp, [0, top + 0.06, zm], 0.08, 0.055, norway, -1, 0, 10, 8);
    // Long steering oar over the stern; a couple of crew
    rod(gp, [0, 0.048, -0.36], [0, 0.13, -0.36], 0.006, '#6b4a2a', 5);
    rod(gp, [0.01, 0.135, -0.3], [0.03, -0.01, -0.66], 0.0055, '#8a6a40', 6);
    blade(gp, '#8a6a40', [0.027, 0.02, -0.58], [0.032, -0.012, -0.68], 0.024, 0.004, [1, 0, 0]);
    person(gp, [0.03, 0.045, -0.27], 2.9, 1, '#e8e2d0', { skin: '#d79a6e', legs: '#b8a68a', hair: '#d8b45a', reach: 0.8 });
    person(gp, [-0.1, 0.045, 0.24], 0.4, 1, '#c8452e', { skin: '#d79a6e', legs: '#5a5a62', hair: '#3a2a1a' });
    wake(gp, 0.45, -0.46, 0.15);
  },
  vy_beagle: gp => {
    // HMS Beagle (1831–36): black ten-gun brig-sloop with a white strake at the gun ports, rigged as a barque —
    // square sails on fore and main, a gaff spanker on the mizzen — carrying young Charles Darwin
    const blk = '#1c1c1f';
    const sheer = (u: number) => 0.115 + 0.03 * Math.pow(1 - u, 2) + 0.035 * Math.pow(u, 3);
    const H = hull(gp, {
      L: 0.68, B: 0.1, full: 0.8, tumble: 0.08, bulwark: 0.02, bulC: blk, nu: 26, sheer,
      half: u => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.13 + u * 0.88))), 0.55),
      keel: u => 0.04 * Math.pow(Math.max(0, u - 0.78) / 0.22, 2) + 0.02 * Math.pow(1 - u, 3),
      bands: [0.06, 0.16],
      paint: (_u, d, y) => (y < 0.02 ? '#a8693a' : d > 0.06 && d < 0.16 ? '#efeae0' : blk),
      deck: '#b89a6a',
    });
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const q = H.gun(0.25 + i * 0.1, sd); box(gp, '#151417', q[0] * 0.97 + sd * 0.002, 0.08, q[2], 0.006, 0.014, 0.018); }
    for (let i = 0; i < 4; i++) box(gp, '#f2e6b8', -0.045 + i * 0.03, 0.12, H.z(0) - 0.003, 0.016, 0.018, 0.004);
    const sail = SAIL('#efe9da');
    const mm = rigMast(gp, H, 0.5, 0.64, 0.009, [[0.3, 0.34, 0.17], [0.47, 0.27, 0.15], [0.59, 0.19, 0.1]], sail);
    const fm = rigMast(gp, H, 0.77, 0.58, 0.008, [[0.27, 0.31, 0.15], [0.43, 0.25, 0.14], [0.54, 0.17, 0.09]], sail);
    const zm = H.z(0.22), dz = H.top(0.22);
    rod(gp, [0, dz - 0.02, zm], [0, dz + 0.46, zm], 0.007, '#3b2a1c', 7, 0.004);
    shrouds(gp, [0, dz + 0.3, zm], H, [0.15, 0.2]);
    quadSail(gp, [0, dz + 0.05, zm - 0.008], [0, dz + 0.32, zm - 0.008], [0, dz + 0.42, zm - 0.2], [0, dz + 0.06, zm - 0.27], 0.03, sail);
    // Bowsprit, jib-boom and two jibs; stays
    const bs: V3 = [0, H.top(1) + 0.1, H.z(1) + 0.2];
    rod(gp, [0, H.top(0.92) + 0.01, H.z(0.9)], bs, 0.006, '#3b2a1c', 6, 0.004);
    triSail(gp, l3([0, H.top(1), H.z(1)], bs, 0.55), [0, fm[1] - 0.18, fm[2]], [0, H.top(0.85) + 0.05, H.z(0.86)], [0.03, 0, 0], sail);
    triSail(gp, bs, [0, fm[1] - 0.07, fm[2]], [0, H.top(0.92) + 0.09, H.z(0.95)], [0.025, 0, 0], sail);
    rod(gp, mm, [0, fm[1] - 0.03, fm[2]], 0.0015, '#2a2018', 4);
    rod(gp, [0, dz + 0.46, zm], [0, mm[1] - 0.1, mm[2]], 0.0015, '#2a2018', 4);
    // Ship's boat on stern davits, ensign and pennant, Darwin on the quarterdeck with his notebook
    vblob(gp, '#f0ece0', 0.112, H.top(0.12) + 0.004, H.z(0.12), 0.018, 0.012, 0.06, (_x, y) => (y > H.top(0.12) + 0.008 ? '#6b4a2c' : null), [0, 0, 0], 10);
    rod(gp, [0, H.top(0.02), H.z(0.02)], [0, H.top(0.02) + 0.13, H.z(0) - 0.03], 0.003, '#3a2a1a', 4);
    flag(gp, [0, H.top(0.02) + 0.13, H.z(0) - 0.03], 0.1, 0.06, redEnsign, -1, 0, 8, 6);
    flag(gp, [0, mm[1], mm[2]], 0.12, 0.012, () => '#c42820');
    person(gp, [-0.04, H.top(0.3) - 0.002, H.z(0.3)], 0.4, 0.95, '#26324e', { hat: '#1a1a1a', legs: '#e8e2d0', reach: 0.7 });
    person(gp, [0.04, H.top(0.17) - 0.002, H.z(0.17)], 0, 0.95, '#1a2340', { hat: '#1a1a1a', legs: '#1a1a20' });
    box(gp, '#3a2a1c', 0, 0.06, H.z(0) - 0.012, 0.012, 0.09, 0.024);
    wake(gp, H.z(1) + 0.03, H.z(0) - 0.06, 0.08);
  },
  vy_endeavour: gp => {
    // HMB Endeavour (1768–71): a stout bluff-bowed Whitby collier — yellow-ochre sides, black wales, a blue upper
    // strake, white-stuff bottom — full-rigged with a spritsail under the bowsprit and the red ensign aft
    const sheer = (u: number) => 0.125 + 0.035 * Math.pow(1 - u, 2.2) + 0.03 * Math.pow(u, 3);
    const H = hull(gp, {
      L: 0.66, B: 0.12, full: 0.6, tumble: 0.05, bulwark: 0.022, bulC: '#2d4a86', nu: 26, sheer,
      half: u => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.17 + u * 0.86))), 0.4),
      keel: u => 0.03 * Math.pow(Math.max(0, u - 0.82) / 0.18, 2) + 0.015 * Math.pow(1 - u, 3),
      bands: [0.07, 0.09, 0.22, 0.27, 0.36, 0.41],
      paint: (_u, d, y) => (y < 0.022 ? '#ece5d2' : d < 0.07 ? '#2d4a86' : d < 0.09 ? '#d5ab48' : (d > 0.22 && d < 0.27) || (d > 0.36 && d < 0.41) ? '#1b1a19' : '#b58a4c'),
      deck: '#a88a5c',
    });
    // Stern: windows and a carved rail; quarter galleries
    for (let i = 0; i < 5; i++) box(gp, '#f5e3a8', -0.06 + i * 0.03, 0.135, H.z(0) - 0.003, 0.018, 0.02, 0.004);
    box(gp, '#d5ab48', 0, 0.165, H.z(0) - 0.004, 0.16, 0.006, 0.006);
    for (const sd of [-1, 1]) rbox(gp, '#2d4a86', sd * H.hb(0.06) * 1.02, 0.13, H.z(0.06), 0.02, 0.05, 0.05, 0.006);
    const sail = SAIL('#efe7d3');
    const mm = rigMast(gp, H, 0.5, 0.66, 0.009, [[0.3, 0.36, 0.17], [0.48, 0.28, 0.16], [0.6, 0.19, 0.1]], sail);
    const fm = rigMast(gp, H, 0.76, 0.6, 0.009, [[0.27, 0.33, 0.16], [0.44, 0.26, 0.15], [0.55, 0.17, 0.09]], sail);
    const zm = rigMast(gp, H, 0.22, 0.48, 0.007, [[0.38, 0.17, 0.11]], sail);
    const dz = H.top(0.22);
    quadSail(gp, [0, dz + 0.05, zm[2] - 0.008], [0, dz + 0.26, zm[2] - 0.008], [0, dz + 0.36, zm[2] - 0.18], [0, dz + 0.06, zm[2] - 0.24], 0.03, sail);
    // Bowsprit with spritsail yard, one jib; stays
    const bs: V3 = [0, H.top(1) + 0.11, H.z(1) + 0.19];
    rod(gp, [0, H.top(0.92) + 0.01, H.z(0.9)], bs, 0.007, '#3b2a1c', 6, 0.004);
    squareSail(gp, [0, H.top(1) + 0.03, H.z(1) + 0.1], 0.18, 0.08, 0.025, sail);
    triSail(gp, bs, [0, fm[1] - 0.12, fm[2]], [0, H.top(0.9) + 0.06, H.z(0.93)], [0.03, 0, 0], sail);
    rod(gp, mm, [0, fm[1] - 0.03, fm[2]], 0.0015, '#2a2018', 4);
    rod(gp, zm, [0, mm[1] - 0.12, mm[2]], 0.0015, '#2a2018', 4);
    rod(gp, fm, bs, 0.0015, '#2a2018', 4);
    // Ship's boat amidships, red ensign, pennant, Captain Cook on the quarterdeck
    vblob(gp, '#5a7a9a', 0, H.top(0.62) + 0.012, H.z(0.62), 0.03, 0.014, 0.065, (_x, y) => (y > H.top(0.62) + 0.018 ? '#8a6a44' : null), [0, 0, 0], 10);
    rod(gp, [0, H.top(0.02), H.z(0.02)], [0, H.top(0.02) + 0.14, H.z(0) - 0.035], 0.003, '#3a2a1a', 4);
    flag(gp, [0, H.top(0.02) + 0.14, H.z(0) - 0.035], 0.11, 0.065, redEnsign, -1, 0, 8, 6);
    flag(gp, [0, mm[1], mm[2]], 0.12, 0.012, () => '#c42820');
    person(gp, [0.03, H.top(0.12) - 0.002, H.z(0.12)], 0.2, 0.95, '#22305a', { hat: '#1a1a1a', legs: '#e8e2d0' });
    box(gp, '#3a2a1c', 0, 0.06, H.z(0) - 0.012, 0.012, 0.1, 0.026);
    wake(gp, H.z(1) + 0.03, H.z(0) - 0.06, 0.09);
  },
  vy_dagama: gp => {
    // São Gabriel (1497): Vasco da Gama's nau with square sails bearing the red Cross of the Order of Christ,
    // Portuguese royal flags, a stone padrão on deck to plant on new shores — and the little caravel Bérrio
    const christ = (u: number, v: number) => {
      const x = Math.abs(u - 0.5), y = Math.abs(v - 0.45);
      if ((x < 0.02 && y < 0.28) || (y < 0.02 && x < 0.26)) return '#f6f1e4';
      if ((x < 0.09 + 0.35 * Math.max(0, y - 0.12) && y < 0.37) || (y < 0.09 + 0.35 * Math.max(0, x - 0.12) && x < 0.35)) return '#b8231c';
      return sh('#ece2c8', 0.96 + 0.04 * (Math.floor(u * 6) % 2));
    };
    const portugal = (u: number, v: number) => (Math.hypot(u - 0.4, (v - 0.5) * 0.7) < 0.15 ? '#e8c22a' : u < 0.4 ? '#1f6b2c' : '#c8281e');
    const grid = Array.from({ length: 18 }, (_, i) => i / 17), grid2 = Array.from({ length: 10 }, (_, i) => i / 9);
    const H = carrack(gp, { hull: '#3a2a1e', wale: '#c9a04a', upper: '#6b4a2c', sail: '#ece2c8', cross: '#b8231c', crossFn: christ, grid, flagP: portugal });
    // Padrão: stone pillar topped by a cube and cross
    const py = H.top(0.62), pz = H.z(0.62);
    cyl(gp, '#cfc8b8', 0.04, py, pz, 0.008, 0.07, 8);
    box(gp, '#d8d2c2', 0.04, py + 0.07, pz, 0.02, 0.02, 0.02);
    box(gp, '#d8d2c2', 0.04, py + 0.09, pz, 0.005, 0.026, 0.005);
    box(gp, '#d8d2c2', 0.04, py + 0.104, pz, 0.016, 0.005, 0.005);
    person(gp, [-0.03, H.top(0.12) + 0.07, H.z(0.12)], 0.1, 0.95, '#1a1a1a', { hat: '#1a1a1a', legs: '#5a1a1a', hair: '#2a1a12' });
    carrack(grp(gp, [0.27, 0, -0.28], [0, 0.05, 0], 0.46), { hull: '#4f3826', wale: '#cfae6a', upper: '#80603e', sail: '#ece2c8', cross: '#b8231c', caravel: true, crossFn: christ, grid: grid2, flagP: portugal });
  },
  vy_fram: gp => {
    // Fram (1910–12): the stubby round-bottomed polar schooner that carried Amundsen and ~100 sled dogs south —
    // black hull, white rail, red-brown bottom, three gaff-rigged masts with square topsails on the foremast
    const blk = '#1a1a1c';
    const sheer = (u: number) => 0.105 + 0.03 * Math.pow(1 - u, 2) + 0.04 * Math.pow(u, 3);
    const H = hull(gp, {
      L: 0.66, B: 0.12, full: 0.5, tumble: 0.02, bulwark: 0.018, bulC: blk, nu: 26, sheer,
      half: u => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.1 + u * 0.92))), 0.5),
      keel: u => 0.035 * Math.pow(Math.max(0, u - 0.8) / 0.2, 2) + 0.03 * Math.pow(1 - u, 4),
      bands: [0.04],
      paint: (_u, d, y) => (y < 0.022 ? '#7d3424' : d < 0.04 ? '#ece8de' : blk),
      deck: '#c6ae86',
    });
    rbox(gp, '#7a5a3c', 0, H.top(0.3) + 0.022, H.z(0.3), 0.12, 0.044, 0.12, 0.006);
    rbox(gp, '#ece8de', 0, H.top(0.3) + 0.047, H.z(0.3), 0.13, 0.006, 0.13, 0.003);
    for (let i = 0; i < 2; i++) rbox(gp, '#8a6a48', 0, H.top(0.62) + 0.012, H.z(0.58 + i * 0.1), 0.06, 0.024, 0.05, 0.004);
    const sail = SAIL('#ebe3cf');
    const fm = rigMast(gp, H, 0.76, 0.58, 0.009, [[0.42, 0.24, 0.12], [0.54, 0.18, 0.1]], sail);
    const mmz = H.z(0.48), mmy = H.top(0.48), mzz = H.z(0.2), mzy = H.top(0.2);
    rod(gp, [0, mmy - 0.02, mmz], [0, mmy + 0.62, mmz], 0.009, '#3b2a1c', 7, 0.005);
    rod(gp, [0, mzy - 0.02, mzz], [0, mzy + 0.5, mzz], 0.008, '#3b2a1c', 7, 0.0045);
    shrouds(gp, [0, mmy + 0.4, mmz], H, [0.42, 0.46]);
    shrouds(gp, [0, mzy + 0.34, mzz], H, [0.14, 0.18]);
    // Crow's nest barrel on the main
    cyl(gp, '#5a4028', 0, mmy + 0.44, mmz, 0.018, 0.03, 10);
    quadSail(gp, [0, fm[1] - 0.52, fm[2] - 0.01], [0, fm[1] - 0.2, fm[2] - 0.01], [0, fm[1] - 0.14, fm[2] - 0.16], [0, fm[1] - 0.5, fm[2] - 0.2], 0.03, sail);
    quadSail(gp, [0, mmy + 0.05, mmz - 0.01], [0, mmy + 0.4, mmz - 0.01], [0, mmy + 0.48, mmz - 0.18], [0, mmy + 0.07, mmz - 0.22], 0.03, sail);
    quadSail(gp, [0, mzy + 0.06, mzz - 0.01], [0, mzy + 0.34, mzz - 0.01], [0, mzy + 0.42, mzz - 0.17], [0, mzy + 0.07, mzz - 0.26], 0.03, sail);
    const bs: V3 = [0, H.top(1) + 0.08, H.z(1) + 0.17];
    rod(gp, [0, H.top(0.92) + 0.01, H.z(0.9)], bs, 0.006, '#3b2a1c', 6, 0.004);
    triSail(gp, bs, [0, fm[1] - 0.16, fm[2]], [0, H.top(0.92) + 0.06, H.z(0.95)], [0.025, 0, 0], sail);
    triSail(gp, l3([0, H.top(1), H.z(1)], bs, 0.5), [0, fm[1] - 0.26, fm[2]], [0, H.top(0.86) + 0.04, H.z(0.86)], [0.025, 0, 0], sail);
    rod(gp, [0, mmy + 0.62, mmz], [0, fm[1] - 0.04, fm[2]], 0.0015, '#2a2018', 4);
    rod(gp, [0, mzy + 0.5, mzz], [0, mmy + 0.5, mmz], 0.0015, '#2a2018', 4);
    // Norwegian flag on the mizzen gaff, pennant on the main
    flag(gp, [0, mzy + 0.42, mzz - 0.17], 0.1, 0.07, norway, -1, 0, 10, 8);
    flag(gp, [0, mmy + 0.62, mmz], 0.11, 0.012, () => '#c8202f');
    // Sled dogs crowding the deck; Amundsen in his fur
    const DC = ['#d9d4c8', '#3a3530', '#8a6a4a', '#c8c0b0', '#5a5048', '#e8e2d6'];
    [[0.03, 0.66, 0.4], [-0.04, 0.7, -0.9], [0.035, 0.84, 2.6], [-0.03, 0.9, 1.4], [0.04, 0.4, -2.2], [-0.045, 0.38, 0.9], [0.0, 0.16, 3.0]].forEach(([x, u, yw], i) =>
      dog(gp, [x, H.top(u) - 0.003, H.z(u)], yw, 0.5, DC[i % DC.length], i % 2 ? '#efe8dc' : DC[i % DC.length]));
    person(gp, [-0.02, H.top(0.12) - 0.002, H.z(0.12)], 0.2, 0.95, '#6a5440', { hat: '#4a3a2a', legs: '#2a2a2e' });
    box(gp, '#2a2a2c', 0, 0.05, H.z(0) - 0.01, 0.012, 0.08, 0.024);
    // Scattered floes around the bow and wake
    floe(gp, 0.2, 0.36, 0.06, 1); floe(gp, -0.22, 0.2, 0.05, 2); floe(gp, 0.24, -0.18, 0.045, 3); floe(gp, -0.2, -0.36, 0.06, 4); floe(gp, -0.09, 0.46, 0.035, 5);
    wake(gp, H.z(1) + 0.03, H.z(0) - 0.06, 0.08);
  },
  vy_lindbergh: gp => {
    // Spirit of St. Louis (Ryan NYP, 1927): silver high-wing monoplane with a long constant-chord wing on struts,
    // engine-turned metal nose with a 9-cylinder Wright Whirlwind radial, no front windscreen, "N-X-211" on the wing
    const cy = 0.17, silver = '#cfd2d6';
    spine(gp, [
      { p: [0, cy + 0.018, -0.36], w: 0.004, h: 0.01 }, { p: [0, cy + 0.015, -0.3], w: 0.014, h: 0.022 }, { p: [0, cy + 0.01, -0.15], w: 0.04, h: 0.05 },
      { p: [0, cy + 0.006, 0.0], w: 0.058, h: 0.07 }, { p: [0, cy + 0.004, 0.12], w: 0.062, h: 0.074 }, { p: [0, cy, 0.22], w: 0.06, h: 0.064 }, { p: [0, cy, 0.28], w: 0.046, h: 0.046 },
    ], silver, (x, y, z, nx) => {
      if (Math.abs(nx) > 0.6 && z > -0.02 && z < 0.06 && y > cy + 0.022 && y < cy + 0.055) return '#2f3a48';
      if (z > 0.1) return hash3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70)) > 0.5 ? '#e6e9ee' : '#b3b8c0';
      return silver;
    }, { nu: 36, nv: 18, shape: (u, a) => (u < 0.08 ? 1 : Math.pow(Math.pow(Math.abs(Math.cos(a)), 3) + Math.pow(Math.abs(Math.sin(a)), 3), -1 / 3)) });
    // "SPIRIT OF / ST LOUIS" on both sides of the cowl
    for (const sd of [-1, 1]) {
      const u = 0.0046, x = sd * 0.0645, ax: V3 = [0, 0, -sd * u], ay: V3 = [0, u, 0], z0 = sd > 0 ? 0.205 : 0.08;
      letters(gp, 'SPIRIT OF', [x, cy + 0.006, z0], ax, ay, 0.0011, '#151515');
      letters(gp, 'ST LOUIS', [x, cy - 0.016, z0 - sd * 0.006], ax, ay, 0.0011, '#151515');
    }
    // Wing: long constant chord with rounded tips; doped-silver ribs
    const yw = 0.25, W = (x: number, le: number, te: number, t: number) => ({ le: [x, yw, le] as V3, te: [x, yw, te] as V3, t });
    foil(gp, silver, [W(-0.5, 0.055, -0.025, 0.004), W(-0.485, 0.093, -0.05, 0.01), W(-0.3, 0.1, -0.055, 0.014), W(0, 0.1, -0.055, 0.016), W(0.3, 0.1, -0.055, 0.014), W(0.485, 0.093, -0.05, 0.01), W(0.5, 0.055, -0.025, 0.004)],
      [0, 1, 0], (x, y) => (y < yw - 0.004 ? '#bfc3c8' : Math.floor((x + 1) * 26) % 2 ? '#d6d9dd' : '#c9ccd1'), 24, 12);
    letters(gp, 'N-X-211', [-0.13, yw + 0.0125, 0.0], [-0.0135, 0, 0], [0, 0, 0.0135], 0.0032, '#151515');
    letters(gp, 'N-X-211', [0.13, yw - 0.0125, 0.0], [0.0135, 0, 0], [0, 0, 0.0135], 0.0032, '#151515');
    // Tailplane, fin & rudder
    foil(gp, silver, [{ le: [-0.17, cy + 0.02, -0.29], te: [-0.17, cy + 0.02, -0.34], t: 0.003 }, { le: [-0.15, cy + 0.02, -0.27], te: [-0.15, cy + 0.02, -0.36], t: 0.006 },
      { le: [0, cy + 0.02, -0.26], te: [0, cy + 0.02, -0.37], t: 0.008 }, { le: [0.15, cy + 0.02, -0.27], te: [0.15, cy + 0.02, -0.36], t: 0.006 }, { le: [0.17, cy + 0.02, -0.29], te: [0.17, cy + 0.02, -0.34], t: 0.003 }], [0, 1, 0], undefined, 12, 8);
    foil(gp, silver, [{ le: [0, cy + 0.02, -0.28], te: [0, cy + 0.02, -0.375], t: 0.007 }, { le: [0, cy + 0.09, -0.315], te: [0, cy + 0.09, -0.38], t: 0.006 },
      { le: [0, cy + 0.125, -0.34], te: [0, cy + 0.12, -0.375], t: 0.004 }], [1, 0, 0], (_x, y, z) => (z < -0.345 && y > cy + 0.03 && Math.floor(y * 90) % 3 === 0 ? '#9aa0a8' : null), 8, 8);
    // Wright J-5 radial: nine cylinders poking out of the cowl, spinner and two-blade prop
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.17;
      rod(gp, [Math.cos(a) * 0.028, cy + Math.sin(a) * 0.028, 0.268], [Math.cos(a) * 0.066, cy + Math.sin(a) * 0.066, 0.266], 0.0095, '#5d6168', 6, 0.0085);
      ellip(gp, '#3a3d42', Math.cos(a) * 0.066, cy + Math.sin(a) * 0.066, 0.266, 0.0095, 0.0095, 0.0095);
    }
    ellip(gp, '#9aa0a8', 0, cy, 0.285, 0.026, 0.026, 0.02);
    const spin = grp(gp, [0, cy, 0.3]);
    spin.name = 'spin';
    ellip(spin, '#d8dbe0', 0, 0, 0.004, 0.02, 0.02, 0.024);
    for (const sd of [-1, 1]) blade(spin, '#a3a8af', [0, 0, 0], [0, sd * 0.17, -0.004], 0.016, 0.004, [0.3, 0, 1]);
    // Wing struts, wide main gear with spoked wheels, tail skid
    for (const sd of [-1, 1]) {
      for (const z of [0.07, -0.02]) rod(gp, [sd * 0.055, cy - 0.055, z + 0.02], [sd * 0.3, yw - 0.008, z], 0.004, '#aeb2b8', 5);
      rod(gp, [sd * 0.14, 0.035, 0.12], [sd * 0.06, cy - 0.06, 0.15], 0.005, '#aeb2b8', 5);
      rod(gp, [sd * 0.14, 0.035, 0.12], [sd * 0.05, cy - 0.06, 0.05], 0.004, '#aeb2b8', 5);
      rod(gp, [sd * 0.14, 0.035, 0.12], [sd * 0.19, yw - 0.01, 0.08], 0.0045, '#aeb2b8', 5);
      const wh = cyl(gp, '#1d1f22', sd * 0.15, 0.035, 0.12, 0.035, 0.018, 14);
      wh.rotation.z = Math.PI / 2; wh.position.set(sd * 0.15, 0.035, 0.12);
      const hb = cyl(gp, '#c9ccd1', sd * 0.15, 0.035, 0.12, 0.016, 0.02, 10);
      hb.rotation.z = Math.PI / 2; hb.position.set(sd * 0.15, 0.035, 0.12);
    }
    rod(gp, [0, cy - 0.03, -0.3], [0, cy - 0.06, -0.34], 0.003, '#5d6168', 4);
  },
  vy_lewisclark: gp => {
    // Corps of Discovery (1804–06): the 55-ft keelboat with its aft cabin, lockers, swivel gun, square sail and oars,
    // flying the 15-star flag; a red pirogue paddles alongside; Seaman the Newfoundland dog stands at the bow
    const kb = grp(gp, [-0.07, 0, -0.04]);
    const sheer = (u: number) => 0.06 + 0.02 * Math.pow(Math.abs(2 * u - 1), 3);
    const H = hull(kb, {
      L: 0.68, B: 0.075, full: 0.35, bulwark: 0.012, bulC: '#5a3a24', nu: 22, sheer,
      half: u => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.22 + u * 0.8))), 0.5),
      keel: u => 0.004 + 0.03 * Math.pow(Math.max(0, u - 0.8) / 0.2, 2), bands: [0.14],
      paint: (_u, d, y) => (y < 0.01 ? '#3a2a1e' : d < 0.14 ? '#5a3a24' : sh('#7a5a3a', 0.92 + 0.08 * (Math.floor(d * 8) % 2))), deck: '#9a7a52',
    });
    rbox(kb, '#8a6a44', 0, H.top(0.12) + 0.032, H.z(0.13), 0.12, 0.064, 0.18, 0.004);
    rbox(kb, '#5a3e26', 0, H.top(0.12) + 0.068, H.z(0.13), 0.135, 0.01, 0.195, 0.004);
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) box(kb, '#2a1e14', sd * 0.061, H.top(0.12) + 0.03, H.z(0.07 + i * 0.05), 0.003, 0.016, 0.018);
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) rbox(kb, i % 2 ? '#6a4a2e' : '#735234', sd * (H.hb(0.35 + i * 0.06) - 0.018), H.top(0.35 + i * 0.06) + 0.012, H.z(0.35 + i * 0.06), 0.03, 0.024, 0.038, 0.003);
    const ms = rigMast(kb, H, 0.6, 0.38, 0.007, [[0.34, 0.24, 0.2]], SAIL('#e8e0c8'));
    rod(kb, ms, [0, H.top(1) + 0.01, H.z(1)], 0.0014, '#2a2018', 3);
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
      const q = H.gun(0.66 + i * 0.07, sd), b: V3 = [sd * 0.2, 0.004, q[2] - 0.05];
      rod(kb, [q[0], q[1] + 0.01, q[2]], b, 0.0025, '#a07c52', 5);
      blade(kb, '#a07c52', l3([q[0], q[1], q[2]], b, 0.8), b, 0.008, 0.002, [0, 0, 1]);
    }
    // Swivel gun on the bow, steering sweep aft
    rod(kb, [0, H.top(0.92), H.z(0.92)], [0, H.top(0.92) + 0.03, H.z(0.92)], 0.004, '#3a2a1e', 5);
    rod(kb, [0, H.top(0.92) + 0.032, H.z(0.9)], [0, H.top(0.92) + 0.034, H.z(0.97)], 0.005, '#2a2a2c', 6);
    rod(kb, [0, H.top(0.12) + 0.08, H.z(0.1)], [0.02, 0.0, H.z(0) - 0.15], 0.004, '#8a6a40', 5);
    // 15-stripe, 15-star flag
    rod(kb, [0, H.top(0.12) + 0.07, H.z(0.03)], [0, H.top(0.12) + 0.2, H.z(0.03)], 0.0028, '#3a2a1a', 4);
    flag(kb, [0, H.top(0.12) + 0.2, H.z(0.03)], 0.1, 0.065, (u, v) => (u < 0.4 && v < 0.54 ? (hash3(Math.floor(u * 20), Math.floor(v * 18), 7) > 0.6 ? '#f4f4f4' : '#1f2f6a') : Math.floor(v * 9) % 2 ? '#f4f4f4' : '#b8202a'), -1, 0, 10, 9);
    // Crew: Lewis (blue coat, cocked hat), Clark at the sweep, a buckskin boatman, Seaman
    person(kb, [-0.02, H.top(0.12) + 0.073, H.z(0.18)], 0.1, 0.9, '#25335e', { hat: '#1a1a1a', legs: '#e8e0c8' });
    person(kb, [0.02, H.top(0.12) + 0.073, H.z(0.06)], 2.8, 0.9, '#2d3a5a', { hat: '#1a1a1a', legs: '#c8b08a', hair: '#b4542a', reach: 0.9 });
    person(kb, [0.03, H.top(0.8) - 0.002, H.z(0.8)], 0.2, 0.9, '#a8804e', { hat: '#5a4028', legs: '#8a6a44' });
    dog(kb, [0, H.top(0.94) - 0.002, H.z(0.94)], 0, 0.75, '#141416');
    // Red pirogue with three paddlers
    const pg = grp(gp, [0.17, 0, 0.12]);
    const P = hull(pg, {
      L: 0.38, B: 0.038, full: 0.6, nu: 16, nv: 8, sheer: u => 0.04 + 0.018 * Math.pow(Math.abs(2 * u - 1), 4),
      half: u => Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.6), keel: u => 0.004 + 0.02 * Math.pow(Math.abs(2 * u - 1), 4), bands: [0.15],
      paint: (_u, d) => (d < 0.15 ? '#e9dfc6' : '#a8342a'), deck: '#6a4a2e',
    });
    for (let i = 0; i < 3; i++) {
      const u = 0.3 + i * 0.2, sd = i % 2 ? 1 : -1, b = person(pg, [0, P.top(u) - 0.035, P.z(u)], 0, 0.8, ['#a8804e', '#6a7a4a', '#8a3a2a'][i], { hat: i === 1 ? '#5a4028' : undefined, hair: '#2a1a12', legs: '#6a4a2e', pose: 'row' });
      rod(b, [sd * 0.03, 0.1, 0.03], [sd * 0.07, -0.02, -0.03], 0.003, '#8a6a40', 4);
      blade(b, '#8a6a40', [sd * 0.062, 0.0, -0.02], [sd * 0.075, -0.05, -0.04], 0.012, 0.003, [1, 0, 0]);
    }
    wake(gp, 0.33, -0.44, 0.07);
    foam(gp, [[0.17, 0.33, 0.04], [0.17, -0.1, 0.04]]);
  },
  vy_jianzhen: gp => {
    // Jianzhen's Tang voyage (753): a kentōshi-style ship — flat-bottomed hull, vermilion-and-white bulwark panels,
    // two red masts with battened mat sails, a pavilion aft — and the blind master monk standing at the bow
    const red = '#b3342a', wht = '#f1ead8', gold = '#d9a93a';
    const H = hull(gp, {
      L: 0.78, B: 0.125, full: 0.4, tumble: 0.04, bulwark: 0.03, bulC: wht, nu: 26,
      sheer: u => 0.12 + 0.07 * Math.pow(1 - u, 2.5) + 0.06 * Math.pow(u, 2.5),
      half: u => (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.05))) * (u > 0.85 ? 1 - (u - 0.85) * 2.2 : 1),
      keel: u => 0.04 * Math.pow(1 - u, 2) + 0.06 * Math.pow(u, 2), bands: [0.12, 0.17, 0.21],
      paint: (u, d, y) => (y < 0.02 ? '#2a2220' : d < 0.12 ? (Math.floor(u * 22) % 3 === 0 ? red : wht) : d < 0.17 ? red : d < 0.21 ? '#1e1a18' : '#4a2e20'), deck: '#a8865a',
    });
    // Red posts along the white bulwark
    for (const sd of [-1, 1]) for (let i = 0; i <= 12; i++) { const q = H.gun(0.06 + i * 0.075, sd); box(gp, red, q[0] * 1.02, q[1] - 0.004, q[2], 0.008, 0.038, 0.01); }
    for (const sd of [-1, 1]) { const a = H.gun(0.03, sd), b = H.gun(0.97, sd); rod(gp, [a[0], a[1] + 0.034, a[2]], [b[0], b[1] + 0.034, b[2]], 0.004, red, 5); }
    // Pavilion aft: red pillars, white walls, dark tiled hip roof with gilded upturned corners
    const st = H.top(0.14), pz = H.z(0.15);
    rbox(gp, red, 0, st + 0.035, pz, 0.14, 0.07, 0.15, 0.004);
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) box(gp, wht, sd * 0.0705, st + 0.014, pz - 0.046 + i * 0.046, 0.003, 0.046, 0.034);
    for (let i = 0; i < 2; i++) box(gp, wht, -0.03 + i * 0.06, st + 0.014, pz + 0.0755, 0.04, 0.046, 0.003);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(gp, '#8a1e18', sx * 0.072, st, pz + sz * 0.077, 0.008, 0.075, 7);
    box(gp, gold, 0, st + 0.07, pz, 0.15, 0.006, 0.16);
    for (const sd of [-1, 1]) { const m = box(gp, '#26302f', sd * 0.048, st + 0.088, pz, 0.13, 0.014, 0.21); m.rotation.z = -sd * 0.45; }
    box(gp, '#1a2120', 0, st + 0.112, pz, 0.018, 0.016, 0.22);
    for (const e of [-1, 1]) drop(gp, gold, [0, st + 0.118, pz + e * 0.1], [0, st + 0.14, pz + e * 0.125], 0.007, 0.005);
    for (const sd of [-1, 1]) for (const e of [-1, 1]) drop(gp, gold, [sd * 0.105, st + 0.068, pz + e * 0.1], [sd * 0.125, st + 0.098, pz + e * 0.118], 0.007, 0.005);
    // Two red masts with mat sails; long streamers
    const mast = (u: number, h: number): V3 => { const z = H.z(u), y = H.top(u); rod(gp, [0, y - 0.02, z], [0, y + h, z], 0.009, red, 7, 0.006); return [0, y + h, z]; };
    const m1 = mast(0.55, 0.52), m2 = mast(0.84, 0.38);
    lugSail(gp, [0, m1[1] - 0.03, m1[2] - 0.012], 0.3, 0.38, 0.35, '#c9a466');
    lugSail(gp, [0, m2[1] - 0.03, m2[2] - 0.012], 0.22, 0.26, 0.3, '#c29c5c');
    for (const m of [m1, m2]) flag(gp, [0, m[1] + 0.004, m[2]], 0.12, 0.02, u => (u < 0.5 ? '#e0b030' : '#c22a1e'), -1, 0, 6, 2);
    rod(gp, m1, [0, H.top(1) + 0.02, H.z(1)], 0.0015, '#2a2018', 3);
    rod(gp, m1, [0, H.top(0.12) + 0.12, H.z(0.08)], 0.0015, '#2a2018', 3);
    // Big stern rudder; Jianzhen at the bow (saffron robe, red kasaya) with a disciple
    box(gp, '#3a2a1c', 0, 0.03, H.z(0) - 0.02, 0.014, 0.17, 0.06);
    const jz = person(gp, [0, H.top(0.86) - 0.004, H.z(0.86)], 0, 1, '#c8862a', { robe: true, skin: '#e2b28a', reach: 0.2 });
    blade(jz, '#9a2a1e', [-0.02, 0.1, 0.012], [0.02, 0.03, 0.014], 0.012, 0.003, [0, 0, 1]);
    person(gp, [0.05, H.top(0.74) - 0.004, H.z(0.74)], 0.3, 0.92, '#5a4a3a', { robe: true, skin: '#e2b28a' });
    wake(gp, H.z(1) + 0.03, H.z(0) - 0.06, 0.1);
  },
  // --------------------------------------------------------------------------------------------- Migrations
  mg_salmon: gp => {
    // Sockeye salmon running up the Fraser River to spawn: humped red males with green heads and hooked jaws,
    // one leaping a riffle — backs breaking the surface
    salmon(gp, [-0.1, 0.012, 0.14], [0, 0.08, 0.04], 1.05, 1);
    salmon(gp, [0.16, 0.008, 0.0], [0, -0.1, -0.05], 0.95, 0.6);
    salmon(gp, [-0.18, 0.006, -0.22], [0, 0.18, 0.03], 0.9, 0.3);
    salmon(gp, [0.1, 0.01, -0.33], [0, -0.05, 0], 0.85, 1);
    salmon(gp, [0.04, 0.2, 0.3], [-0.55, -0.15, 0.15], 0.95, 1);
    foam(gp, [[-0.1, 0.18, 0.11], [-0.1, 0.0, 0.07], [0.16, 0.04, 0.09], [0.16, -0.18, 0.06], [-0.18, -0.18, 0.08], [0.1, -0.3, 0.08], [0.0, 0.08, 0.08], [0.03, 0.21, 0.06]]);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; drop(gp, '#dff0f7', [0.0 + Math.cos(a) * 0.04, 0.0, 0.16 + Math.sin(a) * 0.04], [Math.cos(a) * 0.08, 0.06 + 0.03 * hash3(i, 2, 3), 0.16 + Math.sin(a) * 0.08], 0.006, 0.006); }
  },
  mg_eel: gp => {
    // European eels: silver-phase adults swimming from Europe to the Sargasso Sea to spawn among golden sargassum
    // weed; tiny see-through glass eels drift back the other way
    eel(gp, [-0.12, 0.022, 0.08], 0.1, 1.15, 0.0);
    eel(gp, [0.16, 0.02, -0.06], -0.08, 1.0, 1.6);
    eel(gp, [-0.02, 0.018, -0.3], 0.18, 0.85, 3.0);
    sargassum(gp, 0.26, 0.28, 0.06, 1); sargassum(gp, -0.3, -0.15, 0.07, 2); sargassum(gp, 0.25, -0.38, 0.05, 3); sargassum(gp, -0.28, 0.38, 0.05, 4);
    for (let i = 0; i < 6; i++) {
      const x = -0.35 + i * 0.13, z = 0.42 - (i % 2) * 0.08;
      tube(gp, [[x, 0.015, z], [x + 0.01, 0.015, z - 0.03], [x, 0.015, z - 0.06]], 0.004, 0.0015, '#e6f0f2', 5);
      bead(gp, x, 0.017, z + 0.002, 0.0022, '#101010');
    }
    foam(gp, [[-0.12, 0.38, 0.05], [0.16, 0.26, 0.05], [-0.02, -0.08, 0.04]]);
  },
  mg_stork: gp => {
    // White storks soaring from Europe to Africa: white bodies, black flight feathers, long red bill, neck stretched
    // forward and red legs trailing behind
    const o: NeckBirdOpts = {
      base: '#f4f3ee', paint: (_x, y, z) => (z > 0.21 && y > 0.012 && z < 0.235 ? '#2a2a2a' : null), bill: '#d8342a', billL: 0.1, legs: '#d8402e', legL: 0.15, neck: 0.1,
      span: 0.42, chord: 0.16, sweep: 0.03, fingers: 0.35, wing: (u, v) => (v > 0.48 || u > 0.8 ? '#151515' : '#f4f3ee'), wingDn: (u, v) => (v > 0.5 || u > 0.8 ? '#1d1d1d' : '#e9e8e2'), tail: '#f4f3ee',
    };
    neckBird(gp, [0, 0.2, 0.18], [0, 0, 0.08], 1, o, 0.12);
    neckBird(gp, [-0.3, 0.14, -0.2], [0, 0.12, -0.05], 0.75, o, -0.05);
    neckBird(gp, [0.32, 0.25, -0.26], [0, -0.1, 0.12], 0.7, o, 0.25);
  },
  mg_goose: gp => {
    // Bar-headed geese crossing the Himalaya in a V: pale grey bodies, white heads with two black bars, a white
    // stripe down the dark neck, orange bills
    const n = 0.13, hz = 0.13 + n;
    const o: NeckBirdOpts = {
      base: '#c9c9c3', bill: '#e8952c', billL: 0.045, neck: n, legs: '#e8952c', legL: 0.0,
      paint: (_x, y, z, nx, ny) => {
        if (z > hz - 0.04) return y > 0.014 && ((z > hz - 0.032 && z < hz - 0.024) || (z > hz - 0.017 && z < hz - 0.01)) ? '#121212' : '#f6f5f0';
        if (z > 0.08) return Math.abs(nx) > 0.6 && Math.abs(ny) < 0.5 ? '#f2f1ec' : '#3b3b3d';
        return ny < -0.4 ? '#efeee8' : z < -0.12 ? '#e6e5df' : null;
      },
      span: 0.36, chord: 0.12, sweep: 0.05, wing: (u, v) => (u > 0.72 ? '#5a5a5c' : v > 0.7 ? '#8a8a88' : '#c3c3bd'), wingDn: (u, v) => (u > 0.72 ? '#6a6a6a' : v > 0.75 ? '#9a9a96' : '#d6d6d0'), tail: '#bdbdb6',
    };
    neckBird(gp, [0, 0.16, 0.26], [0, 0, 0], 0.62, o, 0.2);
    neckBird(gp, [-0.19, 0.14, 0.05], [0, 0, 0.05], 0.55, o, -0.1);
    neckBird(gp, [0.19, 0.15, 0.04], [0, 0, -0.05], 0.55, o, 0.35);
    neckBird(gp, [-0.37, 0.12, -0.17], [0, 0, 0], 0.5, o, 0.3);
    neckBird(gp, [0.37, 0.13, -0.18], [0, 0, 0], 0.5, o, -0.15);
  },
  mg_amurfalcon: gp => {
    // Amur falcons — the longest raptor migration over open sea (India → Africa): slate-grey male with orange
    // legs and cere and white underwings, a barred female, and a globe-skimmer dragonfly (their in-flight food)
    bird(gp, [0, 0.2, 0.12], 0, 1.05, {
      body: '#4b5059', belly: '#5f6570', head: '#3d424a', bill: '#e88a34', billL: 0.028, billUp: -0.008, legs: '#ec6f22',
      wingUp: (u, v) => (u > 0.7 || v > 0.75 ? '#353941' : '#4f555e'), wingDn: (u, v) => (u > 0.75 ? '#2e3138' : v > 0.7 ? '#9aa0a8' : '#f0efe9'), span: 0.36, chord: 0.11, sweep: 0.14, tail: '#3d424a',
    }, 0.12, 0.2);
    ellip(gp, '#c0582a', 0, 0.18, -0.02, 0.022, 0.018, 0.03);
    bird(gp, [-0.3, 0.16, -0.2], 0.25, 0.9, {
      body: '#6b625a', belly: '#e8dcc6', head: '#4a4440', cap: '#3c3632', bill: '#e8a040', billL: 0.026, billUp: -0.008, legs: '#ec7a2a',
      wingUp: (u, v) => ((Math.floor(u * 8) + Math.floor(v * 4)) % 2 ? '#7a7068' : '#5e554e'), wingDn: (u, v) => ((Math.floor(u * 9) + Math.floor(v * 5)) % 2 ? '#e8dccb' : '#8a7e70'), span: 0.36, chord: 0.11, sweep: 0.14, tail: '#5e554e',
    }, -0.1, -0.1);
    // Globe skimmer dragonfly
    const d = grp(gp, [0.32, 0.26, -0.18], [0, -0.4, 0], 1);
    tube(d, [[0, 0, 0.04], [0, 0, -0.03], [0, 0.004, -0.12]], 0.007, 0.0035, '#d9902a', 5);
    for (let i = 0; i < 4; i++) box(d, '#7a3e12', 0, 0.002, -0.04 - i * 0.02, 0.009, 0.004, 0.003);
    for (const sx of [-1, 1]) ellip(d, '#9a3a1e', sx * 0.008, 0.004, 0.052, 0.009, 0.009, 0.009);
    const sp = new Soup();
    for (const sx of [-1, 1]) for (const [z, L] of [[0.025, 0.13], [0.0, 0.12]] as const) sp.sheet(4, 2, (u, v) => [sx * (0.006 + u * L), 0.004 + 0.01 * u, z - v * 0.026 * (1 - 0.4 * u)], () => '#e7eef0', () => '#d5dfe2', 0.002);
    sp.mesh(d);
  },
  mg_fruitbat: gp => {
    // Straw-coloured fruit bats — ten million of them arrive at Kasanka every November: golden mantles, fox faces,
    // dark leathery wings stretched over long finger bones
    fruitBat(gp, [0, 0.2, 0.15], [0, 0, 0.06], 1.2, 0.2);
    fruitBat(gp, [-0.3, 0.16, -0.18], [0, 0.15, -0.08], 0.85, -0.15);
    fruitBat(gp, [0.3, 0.26, -0.24], [0, -0.12, 0.1], 0.8, 0.35);
  },
  mg_hummingbird: gp => {
    // Ruby-throated hummingbirds: emerald backs, a glittering ruby throat (male), needle bill, flying non-stop
    // 800 km across the Gulf of Mexico
    const o: BirdOpts = {
      body: '#3e8a3a', belly: '#e9ece4', head: '#36803a', bill: '#141414', billL: 0.16, billUp: -0.01,
      wingUp: () => '#3c4a3a', wingDn: () => '#55604e', span: 0.26, chord: 0.06, sweep: 0.08, tail: '#2a4e28', tailFork: 0.015, throat: '#c8102e',
    };
    bird(gp, [-0.12, 0.22, 0.1], 0.1, 1.3, o, 0.1, 0.75);
    bird(gp, [0.2, 0.18, -0.18], -0.15, 1.05, { ...o, throat: undefined, tailFork: 0 }, -0.12, 0.55);
  },
  mg_sardine: gp => {
    // The Sardine Run: a swirling silver bait ball off South Africa's Wild Coast, a common dolphin leaping in,
    // a Cape gannet plunge-diving from above
    const sp = new Soup(), back = '#2c4f72', mid = '#9fb4c4', belly = '#e6ecf0';
    for (let i = 0; i < 120; i++) {
      const a = hash3(i, 1, 9) * Math.PI * 2, r = Math.sqrt(hash3(i, 2, 9)) * 0.27, y = 0.012 + hash3(i, 3, 9) * 0.1 * (1 - r * 2);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r * 0.85, yaw = a + Math.PI + (hash3(i, 4, 9) - 0.5) * 0.4;
      const fz = Math.sin(yaw), fx = -Math.cos(yaw), l = 0.022, w = 0.0045, h = 0.007;
      const P = (f: number, sx: number, sy: number): V3 => [cx + fx * f * l + sx * w * fz, y + sy * h, cz + fz * f * l - sx * w * fx];
      const N = P(1, 0, 0), T = P(-0.9, 0, 0), U = P(0.1, 0, 1), D = P(0.1, 0, -0.8), L = P(0.1, 1, 0), R = P(0.1, -1, 0);
      sp.tri(N, L, U, back); sp.tri(N, U, R, back); sp.tri(T, U, L, back); sp.tri(T, R, U, back);
      sp.tri(N, D, L, mid); sp.tri(N, R, D, belly); sp.tri(T, L, D, mid); sp.tri(T, D, R, belly);
      const T1 = P(-1.3, 0, 0.9), T2 = P(-1.3, 0, -0.9);
      sp.tri(T, T1, T2, '#5c7890'); sp.tri(T, T2, T1, '#5c7890');
    }
    sp.mesh(gp);
    foam(gp, [[0.26, 0.08, 0.06], [-0.22, -0.12, 0.06], [0.04, -0.25, 0.05], [0.36, 0.18, 0.06]]);
    // Common dolphin leaping: dark cape, tan hourglass flank, white belly
    const d = grp(gp, [0.27, 0.15, 0.08], [-0.35, -0.5, 0.1], 1.5);
    spine(d, [
      { p: [0, 0.0, -0.22], w: 0.008, h: 0.012 }, { p: [0, 0.004, -0.14], w: 0.022, h: 0.03 }, { p: [0, 0.008, -0.02], w: 0.04, h: 0.048 },
      { p: [0, 0.008, 0.08], w: 0.036, h: 0.042 }, { p: [0, 0.004, 0.15], w: 0.022, h: 0.026 }, { p: [0, -0.002, 0.2], w: 0.008, h: 0.008 }, { p: [0, -0.003, 0.23], w: 0.005, h: 0.005 },
    ], '#3a4048', (_x, y, z, _nx, ny) => {
      if (ny < -0.45) return '#f2f2ee';
      const hg = 0.004 + 0.012 * Math.cos((z - 0.02) * 9);
      if (y < hg && z > 0.0 && z < 0.15) return '#d9b878';
      if (y < hg && z <= 0.0 && z > -0.15) return '#9aa2aa';
      return '#2c3138';
    }, { nu: 30, nv: 14 });
    blade(d, '#2c3138', [0, 0.04, 0.0], [0, 0.085, -0.05], 0.02, 0.004, [1, 0, 0]);
    for (const sx of [-1, 1]) {
      blade(d, '#2c3138', [sx * 0.03, -0.02, 0.08], [sx * 0.06, -0.035, 0.04], 0.012, 0.003, [0, 1, 0]);
      blade(d, '#2c3138', [0, 0, -0.21], [sx * 0.05, 0, -0.25], 0.014, 0.003, [0, 1, 0]);
      bead(d, sx * 0.02, 0.008, 0.14, 0.004);
    }
    // Cape gannet plunge-diving: wings swept back like an arrow, yellow head
    const gn = grp(gp, [-0.22, 0.22, -0.2], [1.15, 0.6, 0], 0.9);
    spine(gn, [{ p: [0, 0, -0.14], w: 0.01, h: 0.008 }, { p: [0, 0, -0.08], w: 0.032, h: 0.03 }, { p: [0, 0, 0.0], w: 0.04, h: 0.038 }, { p: [0, 0.004, 0.08], w: 0.026, h: 0.026 }, { p: [0, 0.006, 0.12], w: 0.02, h: 0.02 }, { p: [0, 0.004, 0.15], w: 0.009, h: 0.009 }],
      '#f4f4f0', (_x, _y, z) => (z > 0.09 ? '#e8c75a' : null), { nu: 24, nv: 12 });
    tube(gn, [[0, 0.004, 0.145], [0, 0.0, 0.2]], 0.007, 0.0015, '#9aa6b0', 5);
    for (const sx of [-1, 1]) {
      bead(gn, sx * 0.012, 0.01, 0.125, 0.0035);
      const sw = new Soup();
      sw.sheet(6, 3, (u, v) => [sx * (0.03 + u * 0.09), 0.012 - u * 0.01, 0.03 - u * 0.17 - v * 0.05 * (1 - u * 0.6)], (u) => (u > 0.55 ? '#141414' : '#f4f4f0'), (u) => (u > 0.55 ? '#1c1c1c' : '#ecece8'), 0.006);
      sw.mesh(gn);
    }
    blade(gn, '#141414', [0, 0, -0.13], [0, 0, -0.2], 0.014, 0.003, [0, 1, 0]);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; drop(gp, '#e4f2f8', [-0.3 + Math.cos(a) * 0.03, 0.0, -0.3 + Math.sin(a) * 0.03], [-0.3 + Math.cos(a) * 0.06, 0.05 + 0.02 * hash3(i, 5, 1), -0.3 + Math.sin(a) * 0.06], 0.005, 0.005); }
    foam(gp, [[-0.3, -0.3, 0.05]]);
  },
  // ---------------------------------------------------------------------------------------------- Vehicles
  vh_orientexpress: gp => {
    // Orient Express: a black steam locomotive with brass bands, red wheels and a plume of smoke, its coal tender, and
    // midnight-blue Wagons-Lits sleeping cars lined in gold with warm lamp-lit windows
    const sp = new Soup(), blk = '#1c1d22', red = '#a3271f', brass = '#d4a843', blue = '#1f2b5a', gold = '#d8b04a';
    // Locomotive: boiler with brass bands, smokebox and door, chimney, dome, safety valve
    rod(gp, [0, 0.092, 0.27], [0, 0.092, 0.445], 0.034, blk, 16);
    rod(gp, [0, 0.092, 0.44], [0, 0.092, 0.488], 0.037, '#2b2c31', 16);
    ellip(gp, '#3a3c42', 0, 0.092, 0.489, 0.03, 0.03, 0.006);
    for (const z of [0.3, 0.355, 0.41]) rod(gp, [0, 0.092, z], [0, 0.092, z + 0.005], 0.0352, brass, 16);
    cyl(gp, blk, 0, 0.12, 0.465, 0.011, 0.04, 10);
    cyl(gp, blk, 0, 0.156, 0.465, 0.015, 0.007, 10);
    ellip(gp, brass, 0, 0.126, 0.36, 0.015, 0.013, 0.019);
    cyl(gp, brass, 0, 0.12, 0.3, 0.006, 0.018, 8);
    glow(ellip(gp, '#fff1b8', 0, 0.136, 0.486, 0.008, 0.008, 0.005), '#ffe9a0');
    for (const sd of [-1, 1]) glow(ellip(gp, '#fff1b8', sd * 0.035, 0.05, 0.5, 0.006, 0.006, 0.004), '#ffe9a0');
    // Frames, running boards with red valance, cab with glowing firebox windows, buffer beam and buffers
    sbox(sp, blk, 0, 0.02, 0.36, 0.06, 0.042, 0.27);
    sbox(sp, blk, 0, 0.062, 0.36, 0.112, 0.005, 0.27);
    for (const sd of [-1, 1]) sbox(sp, red, sd * 0.056, 0.056, 0.36, 0.002, 0.007, 0.27);
    sbox(sp, blk, 0, 0.062, 0.232, 0.1, 0.088, 0.075, [blk, blk, blk, blk, blk, blk]);
    for (const sd of [-1, 1]) { sbox(sp, '#f2c86a', sd * 0.0505, 0.105, 0.24, 0.002, 0.026, 0.03); sbox(sp, red, sd * 0.0505, 0.07, 0.232, 0.002, 0.004, 0.075); }
    for (const sd of [-1, 1]) sbox(sp, '#f2c86a', sd * 0.03, 0.115, 0.2705, 0.022, 0.018, 0.002);
    sbox(sp, '#2b2c31', 0, 0.15, 0.228, 0.108, 0.006, 0.088);
    sbox(sp, red, 0, 0.03, 0.494, 0.11, 0.024, 0.012);
    for (const sd of [-1, 1]) { rod(gp, [sd * 0.035, 0.05, 0.5], [sd * 0.035, 0.05, 0.515], 0.006, '#2b2c31', 8); ellip(gp, '#9aa0a8', sd * 0.035, 0.05, 0.516, 0.009, 0.009, 0.003); }
    // Cylinders, driving wheels with coupling rods, leading wheels
    for (const sd of [-1, 1]) {
      rod(gp, [sd * 0.047, 0.05, 0.415], [sd * 0.047, 0.05, 0.475], 0.014, blk, 10);
      for (const z of [0.39, 0.325, 0.26]) sdisc(sp, sd * 0.05, 0.031, z, 0.029, sd, red, '#202125', 14);
      sdisc(sp, sd * 0.045, 0.017, 0.455, 0.016, sd, red, '#202125', 10);
      rod(gp, [sd * 0.054, 0.022, 0.39], [sd * 0.054, 0.022, 0.26], 0.0028, '#b7bcc4', 4);
      rod(gp, [sd * 0.056, 0.05, 0.415], [sd * 0.056, 0.022, 0.39], 0.0025, '#b7bcc4', 4);
    }
    // Smoke plume drifting back
    const puffs: [number, number, number, number][] = [[0, 0.18, 0.455, 0.02], [0.005, 0.205, 0.41, 0.026], [-0.004, 0.228, 0.35, 0.032], [0.008, 0.246, 0.28, 0.036]];
    puffs.forEach(([x, y, z, r], i) => vblob(gp, mx('#f4f4f2', '#b9bcc2', i / 4), x, y, z, r, r * 0.85, r * 1.1, undefined, [0, 0, 0], 10));
    // Tender: coal heap, red lining, three axles
    sbox(sp, blk, 0, 0.038, 0.14, 0.096, 0.082, 0.12);
    for (const sd of [-1, 1]) sbox(sp, red, sd * 0.0485, 0.1, 0.14, 0.002, 0.004, 0.12);
    vblob(gp, '#141416', 0, 0.12, 0.145, 0.04, 0.016, 0.05, (x, y, z) => (hash3(Math.floor(x * 200), Math.floor(y * 200), Math.floor(z * 200)) > 0.7 ? '#3a3b40' : null), [0, 0, 0], 10);
    for (const sd of [-1, 1]) for (const z of [0.1, 0.14, 0.18]) sdisc(sp, sd * 0.045, 0.017, z, 0.016, sd, red, '#202125', 10);
    // Two Wagons-Lits sleeping cars with gold lettering
    const cars: [number, number][] = [[-0.19, 0.068], [-0.468, -0.204]];
    for (const [zb, zf] of cars) {
      coach(sp, zb, zf, {
        body: blue, roof: '#c9c7bf', glass: '#f6d27e', yw: [0.073, 0.103], ys: [0.07, 0.106, 0.049, 0.063],
        livery: (_z, y, nx) => (Math.abs(nx) > 0.6 && ((y > 0.07 && y < 0.073) || (y > 0.103 && y < 0.106)) ? gold : null),
      });
      const zc = (zb + zf) / 2, u = 0.0034, x = 0.0478;
      sletters(sp, 'WAGONS-LITS', [x, 0.0505, zc + 16 * u], [0, 0, -u], [0, u, 0], 0.0007, gold);
      sletters(sp, 'WAGONS-LITS', [-x, 0.0505, zc - 16 * u], [0, 0, u], [0, u, 0], 0.0007, gold);
    }
    for (const z of [0.062, -0.197]) sbox(sp, '#16171a', 0, 0.04, z, 0.062, 0.09, 0.016);
    sp.mesh(gp);
  },
  vh_qinghaitibet: gp => {
    // Qinghai–Tibet Railway: twin NJ2 diesels (dark green with a yellow stripe and yellow nose) hauling sealed,
    // oxygen-enriched coaches over the roof of the world — up to 5,072 m at Tanggula Pass
    const sp = new Soup(), grn = '#1f4f3c', yel = '#f0c419', glass = '#1b2630';
    const stripe = (z: number, y: number, nx: number) => (Math.abs(nx) > 0.6 && y > 0.068 && y < 0.08 ? yel : null);
    diesel(sp, 0.248, 0.5, { body: grn, roof: '#5d6560', glass, front: yel, ys: [0.068, 0.08], livery: (z, y, nx) => stripe(z, y, nx) ?? (Math.abs(nx) > 0.6 && z > 0.5 - 0.06 + (y - 0.046) * 0.9 && y > 0.046 ? yel : null) });
    diesel(sp, -0.012, 0.236, { body: grn, roof: '#5d6560', glass, front: yel, ys: [0.068, 0.08], livery: stripe });
    // Green V on the yellow nose, headlights, number board
    for (const sd of [-1, 1]) {
      const A: V3 = [sd * 0.045, 0.06, 0.5013], B: V3 = [0, 0.052, 0.5013], C: V3 = [sd * 0.045, 0.085, 0.5013];
      sp.tri(A, B, C, grn);
      sp.tri(A, C, B, grn);
    }
    for (const sd of [-1, 1]) glow(ellip(gp, '#fff6cc', sd * 0.03, 0.06, 0.501, 0.007, 0.007, 0.003), '#fff1b0');
    glow(ellip(gp, '#fff6cc', 0, 0.124, 0.49, 0.006, 0.006, 0.003), '#fff1b0');
    sbox(sp, '#111', 0, 0.088, 0.5012, 0.03, 0.008, 0.002);
    // Two passenger coaches: green with a yellow waist band, pale roof, tinted sealed windows
    for (const [zb, zf] of [[-0.252, -0.022], [-0.49, -0.262]] as [number, number][]) {
      coach(sp, zb, zf, { body: grn, roof: '#dfe2de', glass, yw: [0.075, 0.103], ys: [0.062, 0.07], pitch: 0.034,
        livery: (_z, y, nx) => (Math.abs(nx) > 0.6 && y > 0.062 && y < 0.07 ? yel : null) });
    }
    for (const z of [-0.017, -0.257]) sbox(sp, '#16171a', 0, 0.04, z, 0.062, 0.09, 0.012);
    sp.mesh(gp);
  },
  vh_ghan: gp => {
    // The Ghan: a Ghan-red NR-class diesel with white nose chevrons and "THE GHAN" on its flanks, pulling fluted
    // stainless-steel carriages 2,979 km across the red centre from Adelaide to Darwin
    const sp = new Soup(), red = '#b5232b', wht = '#f4f2ec', glass = '#1d262e';
    diesel(sp, 0.236, 0.5, { body: red, roof: '#3c3e43', glass, front: red, ys: [0.05, 0.054] , livery: (_z, y, nx) => (Math.abs(nx) > 0.6 && y > 0.05 && y < 0.054 ? wht : null) });
    // White chevrons on the nose
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
      const y = 0.044 + k * 0.016, zz = 0.5013;
      sp.quad([0, y, zz], [sd * 0.044, y + 0.016, zz], [sd * 0.044, y + 0.023, zz], [0, y + 0.007, zz], wht);
      sp.quad([0, y, zz], [0, y + 0.007, zz], [sd * 0.044, y + 0.023, zz], [sd * 0.044, y + 0.016, zz], wht);
    }
    for (const sd of [-1, 1]) glow(ellip(gp, '#fff6cc', sd * 0.032, 0.093, 0.501, 0.006, 0.006, 0.003), '#fff1b0');
    const u = 0.0042;
    sletters(sp, 'THE GHAN', [0.0478, 0.066, 0.368 + 12 * u], [0, 0, -u], [0, u, 0], 0.0011, wht);
    sletters(sp, 'THE GHAN', [-0.0478, 0.066, 0.368 - 12 * u], [0, 0, u], [0, u, 0], 0.0011, wht);
    // Three fluted stainless carriages with a red line under the windows
    const ribs: number[] = [];
    for (let y = 0.042; y < 0.072; y += 0.004) ribs.push(y);
    for (const [zb, zf] of [[0.004, 0.226], [-0.236, -0.006], [-0.49, -0.246]] as [number, number][]) {
      coach(sp, zb, zf, { body: '#c6cbd0', roof: '#9fa6ad', glass, yw: [0.078, 0.106], ys: [...ribs, 0.074, 0.078, 0.112, 0.118], rTop: 0.016,
        livery: (_z, y, nx) => (Math.abs(nx) < 0.6 ? null : y > 0.074 && y < 0.078 ? red : y < 0.074 && y > 0.04 ? (Math.floor((y - 0.042) / 0.004) % 2 ? '#dfe3e7' : '#a9b0b7') : y > 0.112 && y < 0.118 ? '#dfe3e7' : null) });
    }
    for (const z of [0.231, -0.001, -0.241]) sbox(sp, '#16171a', 0, 0.04, z, 0.062, 0.09, 0.012);
    sp.mesh(gp);
  },
  vh_concorde: gp => {
    // Concorde (British Airways): needle fuselage, ogival delta wing, four Olympus engines in two paired nacelles,
    // drooped nose, tall fin with the Chatham union-flag tail — London to New York in about 3½ hours at Mach 2
    const cy = 0.15, wht = '#f6f7f9', sp = new Soup(), yw = cy - 0.016;
    spine(gp, [
      { p: [0, cy + 0.014, -0.48], w: 0.004, h: 0.004 }, { p: [0, cy + 0.008, -0.43], w: 0.014, h: 0.016 }, { p: [0, cy + 0.002, -0.33], w: 0.025, h: 0.027 },
      { p: [0, cy, -0.1], w: 0.027, h: 0.029 }, { p: [0, cy, 0.2], w: 0.027, h: 0.029 }, { p: [0, cy - 0.002, 0.33], w: 0.022, h: 0.024 },
      { p: [0, cy - 0.008, 0.42], w: 0.012, h: 0.013 }, { p: [0, cy - 0.017, 0.49], w: 0.002, h: 0.002 },
    ], wht, (_x, y, z, _nx, ny) => (z > 0.335 && z < 0.37 && ny > 0.35 ? '#26303c' : y < cy - 0.02 && z > -0.3 && z < 0.25 ? '#e2e5e9' : null), { nu: 44, nv: 16 });
    rod(gp, [0, cy - 0.017, 0.488], [0, cy - 0.02, 0.52], 0.0012, '#3a3d42', 4);
    // Cabin windows and BRITISH AIRWAYS titles hugging the fuselage
    for (const sd of [-1, 1]) {
      for (let z = -0.26; z < 0.27; z += 0.0125) {
        const x = sd * 0.0262, y = cy + 0.007;
        if (sd > 0) sp.quad([x, y, z], [x, y + 0.005, z], [x, y + 0.005, z + 0.004], [x, y, z + 0.004], '#2a3442');
        else sp.quad([x, y, z], [x, y, z + 0.004], [x, y + 0.005, z + 0.004], [x, y + 0.005, z], '#2a3442');
      }
      const u = 0.0027, map = (q: V3): V3 => [Math.sign(q[0]) * (0.027 * Math.sqrt(Math.max(0, 1 - ((q[1] - cy) / 0.029) ** 2)) + 0.0006), q[1], q[2]];
      sletters(sp, 'BRITISH AIRWAYS', [sd * 0.02, cy + 0.015, sd > 0 ? 0.2 : 0.2 - 45 * u], [0, 0, -sd * u], [0, u, 0], 0.00075, '#1c2c66', map);
    }
    // Ogival delta wing with drooping tips, light grey underside
    const Wg = (x: number, le: number, te: number, t: number) => ({ le: [x, yw - Math.abs(x) * 0.03, le] as V3, te: [x, yw - Math.abs(x) * 0.03, te] as V3, t });
    const half = [Wg(0.205, -0.39, -0.425, 0.002), Wg(0.19, -0.3, -0.435, 0.004), Wg(0.15, -0.19, -0.44, 0.007), Wg(0.1, -0.07, -0.437, 0.01), Wg(0.06, 0.05, -0.432, 0.012), Wg(0.03, 0.15, -0.43, 0.013)];
    foil(gp, wht, [...half.map(w => ({ ...w, le: [-w.le[0], w.le[1], w.le[2]] as V3, te: [-w.te[0], w.te[1], w.te[2]] as V3 })), Wg(0, 0.2, -0.43, 0.013), ...[...half].reverse()],
      [0, 1, 0], (_x, y, z) => (y < yw - 0.004 ? '#d7dbe0' : z < -0.415 ? '#e4e7eb' : null), 26, 10);
    // Paired engine nacelles with intakes and four nozzles
    for (const sd of [-1, 1]) {
      const x = sd * 0.078, y = yw - Math.abs(x) * 0.03 - 0.017;
      rbox(gp, wht, x, y, -0.31, 0.058, 0.022, 0.24, 0.006);
      sbox(sp, '#1f242b', x, y - 0.009, -0.1895, 0.05, 0.016, 0.002);
      sbox(sp, wht, x, y - 0.009, -0.1885, 0.003, 0.016, 0.003);
      for (const dx of [-0.014, 0.014]) rod(gp, [x + dx, y, -0.43], [x + dx, y, -0.448], 0.0085, '#4a4e55', 10, 0.0075);
    }
    // Fin and rudder with a stylised Chatham union-flag sweep
    foil(gp, wht, [{ le: [0, cy + 0.02, -0.29], te: [0, cy + 0.02, -0.47], t: 0.006 }, { le: [0, cy + 0.07, -0.37], te: [0, cy + 0.07, -0.475], t: 0.0045 },
      { le: [0, cy + 0.125, -0.445], te: [0, cy + 0.123, -0.48], t: 0.003 }], [1, 0, 0], (_x, y, z) => {
      const dd = (y - cy - 0.02) / 0.1 + (-(z + 0.3) / 0.18) * 0.7;
      return dd > 1.02 ? '#1b2d6b' : dd > 0.92 ? '#c8102e' : dd > 0.86 ? null : dd > 0.74 ? '#1b2d6b' : dd > 0.66 ? '#c8102e' : null;
    }, 10, 14);
    // Long landing gear: nose leg and two four-wheel main bogies
    rod(gp, [0, cy - 0.025, 0.29], [0, 0.016, 0.29], 0.0025, '#9aa0a8', 5);
    for (const sd of [-1, 1]) { const w = cyl(gp, '#1d1f22', sd * 0.006, 0.012, 0.29, 0.012, 0.007, 10); w.rotation.z = Math.PI / 2; w.position.set(sd * 0.006, 0.012, 0.29); }
    for (const sd of [-1, 1]) {
      rod(gp, [sd * 0.06, yw - 0.004, -0.17], [sd * 0.06, 0.026, -0.17], 0.0035, '#9aa0a8', 5);
      sbox(sp, '#6b7078', sd * 0.06, 0.02, -0.17, 0.006, 0.005, 0.05);
      for (const dz of [-0.017, 0.017]) for (const dx of [-0.008, 0.008]) {
        const w = cyl(gp, '#1d1f22', sd * 0.06 + dx, 0.014, -0.17 + dz, 0.014, 0.006, 10); w.rotation.z = Math.PI / 2; w.position.set(sd * 0.06 + dx, 0.014, -0.17 + dz);
      }
    }
    sp.mesh(gp);
  },
  vh_zeppelin: gp => {
    // LZ 127 Graf Zeppelin (1929 round-the-world flight): 236 m silver hull of fabric panels over rings, control car under
    // the nose, five engine cars with pusher propellers, cruciform tail fins and "GRAF ZEPPELIN" on the bow
    const cy = 0.105, sp = new Soup(), sil = '#c9cdd3';
    const prof: [number, number][] = [[-0.5, 0.004], [-0.46, 0.02], [-0.38, 0.038], [-0.24, 0.055], [-0.05, 0.064], [0.15, 0.066], [0.3, 0.061], [0.4, 0.05], [0.46, 0.035], [0.49, 0.018], [0.5, 0.003]];
    const R = (z: number) => {
      for (let i = 0; i < prof.length - 1; i++) if (z <= prof[i + 1][0]) { const t = (z - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t * t * (3 - 2 * t); }
      return 0.003;
    };
    spine(gp, prof.map(([z, r]) => ({ p: [0, cy, z] as V3, w: r, h: r })), sil, undefined, {
      nu: 50, nv: 24, uvp: (_u, a, _x, _y, z) => (Math.abs((((z + 0.5) * 22) % 1) - 0.5) > 0.42 ? '#aab0b8' : Math.round(a / (Math.PI * 2) * 24) % 2 ? '#d6dade' : '#c0c5cc'),
    });
    for (const sd of [-1, 1]) {
      const map = (q: V3): V3 => [sd * (Math.sqrt(Math.max(0, R(q[2]) ** 2 - (q[1] - cy) ** 2)) + 0.0012), q[1], q[2]];
      const u = 0.0062, L = 13 * 3 * u;
      sletters(sp, 'GRAF ZEPPELIN', [sd * 0.06, cy - 0.009, sd > 0 ? 0.335 : 0.335 - L], [0, 0, -sd * u], [0, u, 0], 0.0014, '#1a1a1c', map);
      const u2 = 0.0046, L2 = 7 * 3 * u2;
      sletters(sp, 'D-LZ127', [sd * 0.06, cy + 0.016, sd > 0 ? -0.12 : -0.12 - L2], [0, 0, -sd * u2], [0, u2, 0], 0.001, '#1a1a1c', map);
    }
    // Cruciform tail: fixed fins with darker rudders and elevators
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const P = (r: number, z: number): V3 => [dx * r, cy + dy * r, z];
      foil(gp, sil, [{ le: P(R(-0.3) - 0.004, -0.3), te: P(0.016, -0.475), t: 0.005 }, { le: P(0.072, -0.385), te: P(0.07, -0.472), t: 0.004 }, { le: P(0.094, -0.418), te: P(0.092, -0.474), t: 0.003 }],
        dy ? [1, 0, 0] : [0, 1, 0], (_x, _y, z) => (z < -0.455 ? '#8f969f' : null), 8, 8);
    }
    // Control car under the bow: windowed gondola with a bumper wheel
    const gy = cy - 0.088;
    const gz: number[] = [];
    for (let k = 0; k < 6; k++) gz.push(0.215 + k * 0.018, 0.225 + k * 0.018);
    carBody(sp, {
      zb: 0.2, zf: 0.33, w: 0.017, y0: gy, h: 0.032, r: 0.006, rTop: 0.004, ys: [gy + 0.012, gy + 0.022], zs: gz, nose: [[0.022, 0.92, 1], [0, 0.55, 0.8]],
      paint: (z, y, nx, _ny, nz) => (y > gy + 0.012 && y < gy + 0.022 && ((Math.abs(nx) > 0.5 && (z - 0.215) % 0.018 < 0.01 && z < 0.32) || nz > 0.15) ? '#2b3644' : '#b9bec5'),
    });
    rod(gp, [0, gy + 0.03, 0.21], [0, cy - R(0.21) + 0.004, 0.21], 0.008, '#b9bec5', 6);
    const bw = cyl(gp, '#222', 0, 0.008, 0.25, 0.008, 0.006, 10); bw.rotation.z = Math.PI / 2; bw.position.set(0, 0.008, 0.25);
    rod(gp, [0, gy, 0.25], [0, 0.008, 0.25], 0.0018, '#555', 4);
    // Five Maybach engine cars on struts, each with a spinning pusher propeller
    const cars: V3[] = [[0.075, cy - 0.04, -0.06], [-0.075, cy - 0.04, -0.06], [0.07, cy - 0.034, -0.2], [-0.07, cy - 0.034, -0.2], [0, cy - 0.078, -0.29]];
    for (const [x, y, z] of cars) {
      vblob(gp, sil, x, y, z, 0.011, 0.012, 0.03, (_px, _py, pz) => (pz > z + 0.022 ? '#8f969f' : null), [0, 0, 0], 10);
      const dl = Math.hypot(x, y - cy) || 1, hx = (x / dl) * R(z) * 0.95, hy = cy + ((y - cy) / dl) * R(z) * 0.95;
      for (const dz of [-0.012, 0.012]) rod(gp, [x * 0.92, y + (cy - y) * 0.08, z + dz], [hx, hy, z + dz * 1.4], 0.0016, '#8f969f', 4);
      const sp2 = grp(gp, [x, y, z - 0.032]);
      sp2.name = 'spin';
      ellip(sp2, '#6b5c4c', 0, 0, 0, 0.004, 0.004, 0.006);
      for (const sd of [-1, 1]) blade(sp2, '#6b5c4c', [0, 0, 0], [0, sd * 0.026, 0], 0.006, 0.002, [0, 0, 1]);
    }
    sp.mesh(gp);
  },
  vh_felucca: gp => {
    // Nile felucca: a small open wooden boat in bright stripes, one enormous white lateen sail on a long sloping yard,
    // a Nubian skipper in a white galabiya and turban at the tiller, passengers on cushions
    const wht = '#f4f1e8', blu = '#2a6fb5', ylw = '#e8b43a', red = '#c0392b';
    const H = hull(gp, {
      L: 0.56, B: 0.1, z0: -0.04, full: 0.55, tumble: 0.02, nu: 22, nv: 10, bands: [0.14, 0.22, 0.28],
      sheer: u => 0.085 + 0.03 * Math.pow(1 - u, 2) + 0.05 * Math.pow(u, 2.2),
      half: u => (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (u > 0.75 ? 1 - Math.pow((u - 0.75) / 0.25, 1.6) * 0.97 : 1),
      keel: u => 0.008 + 0.03 * Math.pow(u, 3),
      paint: (_u, d, y) => (y < 0.014 ? '#36586a' : d < 0.14 ? blu : d < 0.22 ? ylw : d < 0.28 ? red : wht), deck: '#b08a5a', bulwark: 0.012, bulC: blu,
    });
    // Mast, long yard and the great triangular sail
    const zm = H.z(0.72), A: V3 = [0, H.top(0.97) + 0.05, H.z(0.98) + 0.06], B: V3 = [0, 0.78, -0.36];
    const t = (A[2] - zm) / (A[2] - B[2]), ym = A[1] + (B[1] - A[1]) * t;
    rod(gp, [0, H.top(0.72) - 0.02, zm], [0, ym + 0.012, zm + 0.004], 0.0075, '#6b4a2a', 7, 0.005);
    rod(gp, l3(A, B, -0.03), l3(A, B, 1.03), 0.0045, '#7a5a36', 6, 0.0025);
    const C: V3 = [0, H.top(0.04) + 0.075, H.z(0) - 0.05];
    triSail(gp, [0.006, A[1] - 0.004, A[2]], [0.006, B[1] - 0.004, B[2]], C, [0.07, 0, 0], u => (Math.floor(u * 9) % 2 ? '#f8f6ef' : '#eae5d8'));
    rod(gp, C, [0, H.top(0.04) + 0.01, H.z(0.04)], 0.0012, '#5a4a38', 3);
    rod(gp, [0, ym, zm], [0.004, H.top(0.08), H.z(0.06)], 0.001, '#5a4a38', 3);
    flag(gp, l3(A, B, 1.02), 0.06, 0.03, (_u, v) => (v < 0.34 ? red : v < 0.67 ? wht : '#151515'), -1, 0, 5, 3);
    // Rudder and tiller, the skipper, passengers on cushions
    box(gp, '#6b4a2a', 0, 0.01, H.z(0) - 0.012, 0.01, 0.1, 0.035);
    rod(gp, [0, H.top(0) + 0.03, H.z(0) - 0.01], [0, H.top(0.12) + 0.02, H.z(0.14)], 0.003, '#6b4a2a', 4);
    person(gp, [0, H.top(0.1) - 0.004, H.z(0.12)], 0.2, 0.95, '#f2f0ea', { robe: true, skin: '#7a4a2a', hair: '#f6f6f2', reach: 0.6 });
    for (const [x, u, c, yaw] of [[0.04, 0.42, '#d94f87', -1.2], [-0.04, 0.5, '#3a8f5a', 1.4]] as [number, number, string, number][]) {
      rbox(gp, c === '#d94f87' ? '#e8a33c' : '#c0392b', x, H.top(u) + 0.008, H.z(u), 0.04, 0.014, 0.07, 0.006);
      person(gp, [x, H.top(u) - 0.02, H.z(u)], yaw, 0.8, c, { skin: '#e2b28a', hair: '#3a2a1a', reach: 0.8 });
    }
    wake(gp, H.z(1) + 0.02, H.z(0) - 0.06, 0.08);
  },
  vh_dhow: gp => {
    // Omani dhow (baghlah/boom): teak hull with a long raked stem, white-limed bottom, carved high stern, two forward-raked
    // masts with cream lateen sails, sacks and chests of cargo, and the red-white-green flag of Oman
    const teak = '#8a5530', cream = '#efe5c9';
    const H = hull(gp, {
      L: 0.74, B: 0.12, z0: -0.07, full: 0.45, tumble: 0.03, nu: 26, nv: 12, bands: [0.08, 0.12],
      sheer: u => 0.12 + 0.1 * Math.pow(1 - u, 2.4) + 0.05 * Math.pow(u, 2),
      half: u => (0.68 + 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.08))) * (u > 0.72 ? 1 - Math.pow((u - 0.72) / 0.28, 1.5) * 0.97 : 1),
      keel: u => 0.005 + 0.06 * Math.pow(1 - u, 3) + 0.08 * Math.pow(u, 3),
      paint: (_u, d, y) => (y < 0.034 ? '#efe9da' : d < 0.08 ? '#5a3418' : d < 0.12 ? '#e7dcc0' : Math.floor(y * 90) % 2 ? teak : sh(teak, 0.88)),
      deck: '#a07a4c', bulwark: 0.025, bulC: '#6e4222',
    });
    // Raked stem post and carved transom with gallery windows
    const zb = H.z(1);
    tube(gp, [[0, 0.07, zb - 0.01], [0, 0.17, zb + 0.06], [0, 0.27, zb + 0.13]], 0.009, 0.006, '#6e4222', 6);
    const zs = H.z(0), ys = H.top(0);
    rbox(gp, '#6a3c1c', 0, ys - 0.03, zs - 0.006, 0.17, 0.08, 0.014, 0.005);
    for (let i = 0; i < 4; i++) box(gp, '#e9cf8a', -0.054 + i * 0.036, ys - 0.045, zs - 0.0135, 0.022, 0.028, 0.002);
    box(gp, '#c99a3c', 0, ys + 0.008, zs - 0.006, 0.18, 0.008, 0.016);
    // Two forward-raked masts with lateen yards and sails
    const mast = (u: number, h: number, rake: number): V3 => { const z = H.z(u), y = H.top(u); rod(gp, [0, y - 0.02, z], [0, y + h, z + rake], 0.008, '#5a3418', 7, 0.0055); return [0, y + h, z + rake]; };
    const M1 = mast(0.6, 0.4, 0.05), M2 = mast(0.22, 0.27, 0.03);
    const A1: V3 = [0, H.top(0.95) + 0.05, H.z(0.97) + 0.03], B1 = l3(A1, M1, 1.75), C1: V3 = [0, H.top(0.32) + 0.05, H.z(0.32)];
    const A2: V3 = [0, H.top(0.46) + 0.06, H.z(0.46)], B2 = l3(A2, M2, 1.75), C2: V3 = [0, H.top(0.02) + 0.07, H.z(0) - 0.04];
    for (const [A, B, C] of [[A1, B1, C1], [A2, B2, C2]] as [V3, V3, V3][]) {
      rod(gp, l3(A, B, -0.03), l3(A, B, 1.03), 0.0045, '#5a3418', 6, 0.0025);
      triSail(gp, [0.006, A[1] - 0.004, A[2]], [0.006, B[1] - 0.004, B[2]], C, [0.06, 0, 0], u => (Math.floor(u * 8) % 2 ? cream : '#e4d8b8'));
      rod(gp, C, [0.02, C[1] - 0.04, C[2] - 0.02], 0.0012, '#4a3a28', 3);
    }
    for (const M of [M1, M2]) flag(gp, [0, M[1] + 0.02, M[2]], 0.05, 0.012, u => (u < 0.5 ? '#c8202f' : '#f4f4f0'), -1, 0, 5, 2);
    // Oman's flag on the stern staff
    rod(gp, [0, ys, zs - 0.01], [0, ys + 0.13, zs - 0.03], 0.003, '#4a3a28', 4);
    flag(gp, [0, ys + 0.13, zs - 0.03], 0.075, 0.048, (u, v) => (u < 0.3 ? '#db161b' : v < 0.34 ? '#f4f4f4' : v < 0.67 ? '#db161b' : '#008000'), -1, 0, 6, 3);
    // Cargo: sacks of dates and spice, wooden chests, two sailors
    const deck = (u: number) => H.top(u) - 0.003;
    for (const [x, u, c] of [[0.035, 0.7, '#cdb88a'], [-0.03, 0.72, '#bfa678'], [0.0, 0.78, '#d5c49a'], [0.03, 0.4, '#bfa678'], [-0.035, 0.38, '#cdb88a']] as [number, number, string][])
      vblob(gp, c, x, deck(u) + 0.014, H.z(u), 0.025, 0.016, 0.02, undefined, [0, 0, 0], 8);
    rbox(gp, '#7a4520', -0.02, deck(0.84) + 0.014, H.z(0.84), 0.05, 0.028, 0.04, 0.004);
    rbox(gp, '#5f3418', 0.03, deck(0.3) + 0.016, H.z(0.3), 0.04, 0.032, 0.05, 0.004);
    person(gp, [0.03, deck(0.13), H.z(0.13)], 0.3, 0.9, '#f2f0ea', { robe: true, skin: '#9a6a44', hair: '#f6f6f2' });
    person(gp, [-0.04, deck(0.55), H.z(0.55)], -0.6, 0.85, '#d9cba5', { robe: true, skin: '#9a6a44', hair: '#c8202f', reach: 0.7 });
    wake(gp, H.z(1) + 0.03, H.z(0) - 0.07, 0.1);
  },
  vh_icebreaker: gp => {
    // 50 Let Pobedy, the biggest nuclear icebreaker: black hull with a red boot-top, ROSATOMFLOT in white, a shark mouth
    // on the ice-breaking bow, tall white superstructure, red funnel, helideck aft — crunching through Arctic floes towards the Pole
    const blk = '#1b1d21', red = '#c22b26', wht = '#eeeeea', sp = new Soup(), glass = '#20272f';
    const H = hull(gp, {
      L: 0.94, B: 0.1, z0: -0.02, full: 0.22, nu: 40, nv: 12, bands: [0.15],
      sheer: u => 0.13 + 0.035 * Math.pow(u, 2.5) + 0.012 * Math.pow(1 - u, 3),
      half: u => (u < 0.08 ? 0.86 + u * 1.75 : 1) * (u > 0.62 ? 1 - Math.pow((u - 0.62) / 0.38, 1.7) * 0.94 : 1),
      keel: u => (u > 0.8 ? Math.pow((u - 0.8) / 0.2, 1.5) * 0.09 : 0),
      paint: (_u, _d, y) => (y < 0.035 ? red : blk), deck: '#6d7174', bulwark: 0.012, bulC: blk,
    });
    const uOf = (z: number) => (z - H.z(0)) / 0.94;
    for (const sd of [-1, 1]) {
      const map = (q: V3): V3 => [sd * (H.hb(uOf(q[2])) + 0.0016), q[1], q[2]];
      const u = 0.0105, L = 11 * 3 * u;
      sletters(sp, 'РОСАТОМФЛОТ', [sd * 0.1, 0.066, sd > 0 ? 0.03 + L / 2 : 0.03 - L / 2], [0, 0, -sd * u], [0, u, 0], 0.0021, '#f4f4f2', map);
      // Shark mouth grinning on the bow: red jaws lined with white teeth
      decal(sp, H, sd, 0.8, 0.985, 0.04, 0.135, 22, 12, (s0, t) => {
        const cl = 0.42 + 0.12 * s0, ho = 0.36 * Math.pow(s0, 0.6), e = ho - Math.abs(t - cl);
        if (e < 0) return null;
        const f = (s0 * 11) % 1;
        return e < 0.2 * (1 - Math.abs(2 * f - 1)) + 0.02 ? '#f6f6f4' : '#a3161d';
      });
    }
    // Stepped white superstructure with window rows, bridge with wings
    const dk = H.top(0.5), tiers: [number, number, number, number, number][] = [[0, 0.042, 0.18, -0.17, 0.13], [0.042, 0.04, 0.16, -0.15, 0.11], [0.082, 0.036, 0.14, -0.08, 0.1], [0.118, 0.034, 0.19, 0.035, 0.1]];
    for (const [y0, h, w, z0, z1] of tiers) {
      sbox(sp, wht, 0, dk + y0, (z0 + z1) / 2, w, h, z1 - z0, [wht, wht, '#dcdcd8', wht, wht, wht]);
      const yy = dk + y0 + h * 0.45, n = Math.floor((z1 - z0) / 0.02);
      for (const sd of [-1, 1]) for (let k = 0; k < n; k++) {
        const x = sd * (w / 2 + 0.0008), z = z0 + 0.012 + k * ((z1 - z0 - 0.024) / Math.max(1, n - 1));
        if (sd > 0) sp.quad([x, yy, z - 0.005], [x, yy + 0.011, z - 0.005], [x, yy + 0.011, z + 0.005], [x, yy, z + 0.005], glass);
        else sp.quad([x, yy, z - 0.005], [x, yy, z + 0.005], [x, yy + 0.011, z + 0.005], [x, yy + 0.011, z - 0.005], glass);
      }
      sbox(sp, glass, 0, yy, z1 + 0.0006, w * 0.82, 0.012, 0.0014);
    }
    // Funnel (red, black top), white radar mast, lifeboats, red crane, anchors
    rbox(gp, red, 0, dk + 0.12, -0.11, 0.1, 0.08, 0.06, 0.012);
    rbox(gp, blk, 0, dk + 0.166, -0.11, 0.104, 0.014, 0.064, 0.006);
    const mt = dk + 0.152;
    rod(gp, [0, mt, 0.06], [0, mt + 0.12, 0.055], 0.0045, '#f2f2f0', 6, 0.003);
    for (const [y, w] of [[0.06, 0.05], [0.09, 0.034]]) rod(gp, [-w, mt + y, 0.058], [w, mt + y, 0.058], 0.002, '#f2f2f0', 4);
    box(gp, '#f2f2f0', 0, mt + 0.1, 0.056, 0.05, 0.004, 0.008);
    flag(gp, [0, mt + 0.12, 0.055], 0.04, 0.026, (_u, v) => (v < 0.34 ? '#f6f6f6' : v < 0.67 ? '#1c3f94' : '#d52b1e'), -1, 0, 4, 3);
    for (const sd of [-1, 1]) for (const z of [-0.06, 0.02]) ellip(gp, '#f08a24', sd * 0.088, dk + 0.058, z, 0.012, 0.012, 0.03);
    cyl(gp, red, 0.05, dk, 0.2, 0.012, 0.035, 8);
    rod(gp, [0.05, dk + 0.035, 0.2], [0.02, dk + 0.11, 0.3], 0.005, red, 5, 0.003);
    for (const sd of [-1, 1]) { const q = H.gun(0.93, sd); box(gp, '#2a2c30', q[0] * 1.03, q[1] - 0.04, q[2], 0.006, 0.02, 0.02); }
    // Helideck on the stern: dark green pad, yellow ring, white H
    const hz = H.z(0.08), hy = H.top(0.08) + 0.03;
    for (const sd of [-1, 1]) rod(gp, [sd * 0.06, H.top(0.08), hz], [sd * 0.06, hy, hz], 0.004, '#9aa0a8', 4);
    sbox(sp, '#3c5546', 0, hy, hz, 0.19, 0.006, 0.15);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2, b = ((k + 1) / 20) * Math.PI * 2, r0 = 0.05, r1 = 0.057, y = hy + 0.0065;
      sp.quad([Math.cos(a) * r0, y, hz + Math.sin(a) * r0], [Math.cos(a) * r1, y, hz + Math.sin(a) * r1], [Math.cos(b) * r1, y, hz + Math.sin(b) * r1], [Math.cos(b) * r0, y, hz + Math.sin(b) * r0], '#f0c419');
    }
    sletters(sp, 'H', [0.009, hy + 0.0068, hz - 0.0135], [-0.009, 0, 0], [0, 0, 0.009], 0.0022, '#f6f6f4');
    sp.mesh(gp);
    // Sea ice: big floes ahead and alongside, a channel of broken ice astern, and a curious polar bear
    const floes: [number, number, number][] = [[0.24, 0.32, 0.09], [-0.27, 0.36, 0.1], [0.3, 0.05, 0.08], [-0.24, -0.08, 0.07], [0.2, -0.34, 0.05], [-0.18, -0.36, 0.045], [0.07, -0.56, 0.04], [-0.06, -0.52, 0.035], [0.12, 0.5, 0.05], [-0.1, 0.55, 0.06]];
    floes.forEach(([x, z, r], i) => floe(gp, x, z, r, i + 3));
    const pb = grp(gp, [0.25, 0.012, 0.32], [0, -2.2, 0], 0.9);
    vblob(pb, '#f3efe4', 0, 0.05, 0, 0.026, 0.026, 0.05, undefined, [0, 0, 0], 10);
    vblob(pb, '#f3efe4', 0, 0.058, 0.055, 0.016, 0.016, 0.022, undefined, [0, 0, 0], 8);
    bead(pb, 0, 0.056, 0.078, 0.004);
    for (const sx of [-1, 1]) { bead(pb, sx * 0.012, 0.072, 0.05, 0.004, '#e6e0d2'); bead(pb, sx * 0.008, 0.064, 0.07, 0.0025); for (const z of [-0.03, 0.03]) rod(pb, [sx * 0.014, 0.04, z], [sx * 0.015, 0, z], 0.008, '#f3efe4', 5); }
  },
};
