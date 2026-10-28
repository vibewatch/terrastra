import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type V3, hash3, add, mat } from '../prims.ts';
import { type HFn } from '../nature.ts';

// Terrain kit shared by the landform packs (peaks, volcanoes, nature2): working-colour vertex painters,
// fast integer-hash value noise and small scale figures.

/** Vertex painter: receives position (y = height above the terrain base) and smooth normal; returns a colour. */
export type VCol = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color;
export const PAL = new Map<string, THREE.Color>();
export const K = (hex: string) => { let c = PAL.get(hex); if (!c) { c = new THREE.Color(hex); PAL.set(hex, c); } return c; };
export const W = new THREE.Color();
/** Working-colour helpers: `B` sets the base, `L` blends toward another colour by t (clamped), `S` scales. */
export const B = (hex: string) => W.copy(K(hex));
export const L = (hex: string, t: number) => { if (t > 0) W.lerp(K(hex), t > 1 ? 1 : t); return W; };
export const S = (f: number) => W.multiplyScalar(f);
export const W2 = new THREE.Color();
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smax = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
export const Y0 = 0.035;
// Fast 2D value noise (integer hash, no trig) — terrain needs ~10 samples per vertex, so this matters.
export const hh = (i: number, j: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const n2 = (x: number, z: number) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
/** Fractal 2D noise in [0,1]; `sd` decorrelates different layers. */
export const f2 = (x: number, z: number, oct = 3, sd = 0) => {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * n2(x * f + sd * 31.7 + i * 5.3, z * f - sd * 17.1); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
};
/** Ridged 2D noise in [0,1] (sharp crests). */
export const r2 = (x: number, z: number, oct = 3, sd = 0) => {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(2 * n2(x * f + sd * 13.3 + i * 7.1, z * f + sd * 3.9) - 1)); n += a; a *= 0.5; f *= 2.1; }
  return s / n;
};
export const H01 = (i: number, s: number, k = 0) => hash3(i, s, k);
export function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, s = 1): void {
  passerby(p, x, y, z, 0.0155 * s, 1, { top: c });
}

export interface TOpts { n?: number; focus?: number; base?: number; strata?: string[]; wl?: number; water?: VCol }
/**
 * Smooth-shaded heightfield disc (radius R) with per-vertex colours (no per-face checker noise), an earth-strata
 * skirt and an optional water sheet at height `wl`. The grid is a square→disc mapping, denser toward the centre.
 */
export function terra(gp: THREE.Object3D, R: number, h: HFn, paint: VCol, o: TOpts = {}): void {
  const N = o.n ?? 104, f = o.focus ?? 0.32, M = N + 1;
  const warp = (s: number) => s * (1 - f + f * s * s);
  const grid = (n: number, y: (x: number, z: number) => number) => {
    const m = n + 1, pos = new Float32Array(m * m * 3);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const u = warp(-1 + (2 * i) / n), v = warp(-1 + (2 * j) / n);
      const x = R * u * Math.sqrt(1 - (v * v) / 2), z = R * v * Math.sqrt(1 - (u * u) / 2), k = (j * m + i) * 3;
      pos[k] = x; pos[k + 1] = y(x, z); pos[k + 2] = z;
    }
    return pos;
  };
  const quads = (n: number, keep?: (a: number, b: number, c: number, d: number) => boolean) => {
    const m = n + 1, idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      if (keep && !keep(a, b, c, d)) continue;
      if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    return idx;
  };
  const colour = (geo: THREE.BufferGeometry, fn: VCol, yb: number) => {
    geo.computeVertexNormals();
    const p = geo.getAttribute('position'), nr = geo.getAttribute('normal'), col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const c = fn(p.getX(i), p.getY(i) - yb, p.getZ(i), nr.getX(i), nr.getY(i), nr.getZ(i));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const pos = grid(N, (x, z) => Y0 + h(x, z));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(quads(N));
  add(gp, colour(geo, paint, Y0), mat('#ffffff', { flat: false, vc: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);

  const wl = o.wl;
  if (wl !== undefined && o.water) {
    const n = Math.round(N / 2), wy = Y0 + wl;
    const wp = grid(n, () => wy);
    const dry = (k: number) => h(wp[k * 3], wp[k * 3 + 2]) > wl + 0.006;
    const idx = quads(n, (a, b, c, d) => !(dry(a) && dry(b) && dry(c) && dry(d)));
    if (idx.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      wg.setIndex(idx);
      add(gp, colour(wg, o.water, Y0), mat('#ffffff', { flat: false, vc: true, rough: 0.25 }), 0, 0, 0, 1, 1, 1);
    }
  }

  // Skirt: ordered rim loop → rows down to y=0, painted as exposed strata (water band on top where flooded)
  const rim: number[] = [];
  for (let i = 0; i < N; i++) rim.push(i);
  for (let j = 0; j < N; j++) rim.push(j * M + N);
  for (let i = N; i > 0; i--) rim.push(N * M + i);
  for (let j = N; j > 0; j--) rim.push(j * M);
  const ROWS = 5, sp: number[] = [], strata = o.strata ?? ['#6b4f3a', '#5a4130', '#7a5a40', '#4f3a2b'];
  const cols: number[] = [];
  const ring = (k: number) => {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    const top = wl !== undefined ? Math.max(y, Y0 + wl) : y;
    const ys = [top, y];
    for (let r = 1; r <= ROWS; r++) ys.push(y * (1 - r / ROWS));
    return { x, z, ys };
  };
  const wc = K('#2b6f9c');
  for (let e = 0; e < rim.length; e++) {
    const A = ring(rim[e]), Bq = ring(rim[(e + 1) % rim.length]);
    for (let r = 0; r <= ROWS; r++) {
      const k1 = r === ROWS ? 0.985 : 1;
      const a0: V3 = [A.x, A.ys[r], A.z], b0: V3 = [Bq.x, Bq.ys[r], Bq.z];
      const a1: V3 = [A.x * k1, A.ys[r + 1], A.z * k1], b1: V3 = [Bq.x * k1, Bq.ys[r + 1], Bq.z * k1];
      if (a0[1] - a1[1] < 1e-5 && b0[1] - b1[1] < 1e-5) continue;
      sp.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
      const yc = (a0[1] + a1[1]) / 2;
      const c = r === 0 ? wc : K(strata[Math.abs(Math.floor(yc * 34 + (f2(A.x * 5 + A.z * 4, 0.5, 2) - 0.5) * 1.2)) % strata.length]);
      for (let q = 0; q < 6; q++) cols.push(c.r, c.g, c.b);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sg.computeVertexNormals();
  add(gp, sg, mat('#ffffff', { flat: true, vc: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);
}
