/**
 * Shared machinery for the signature nebula models: a seeded point/quad builder (glowing gas, dark dust, stars),
 * 3D samplers (blobs, shells, curves, braids, sphere walks, 2D density fields), the three.js renderer
 * (≤ 5 draw calls per model) and a CPU splatter that paints the same data as a flat picture.
 *
 * Model frame: +Z points from the nebula towards Earth, +Y is up, so a camera on +Z sees the famous photo.
 * Dust is drawn first and writes depth, so glowing gas behind it is hidden while gas in front still shows.
 */
import * as THREE from 'three';
import { gauss, rng, type Rnd } from '../cosmos-paint.ts';

export type NebulaTier = 'high' | 'medium' | 'low';
export type V3 = [number, number, number];
export type C3 = [number, number, number];
export type P2 = [number, number];

export interface NebulaModel {
  /** Centred at the origin; the longest semi-axis ≈ 1 model unit. +Z faces Earth, +Y is up. */
  group: THREE.Group;
  /** Bounding radius in model units (so a host can scale it: scale = sizeLy / 2 / radius). */
  radius: number;
  /** Advance animations (pulsar strobe, slow shimmer, twinkle); t in seconds. */
  update(t: number, camera: THREE.Camera): void;
  /** Overall opacity fade 0..1. */
  setOpacity(a: number): void;
  dispose(): void;
}

export const hex = (h: string): C3 => { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
export const mix = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (v: number, a = 0, b = 1) => v < a ? a : v > b ? b : v;
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);
export const norm = (v: V3): V3 => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
/** Rotation (degrees about X, then Y, then Z) as a function on points. */
export function rot(ax: number, ay = 0, az = 0): (v: V3) => V3 {
  const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax * Math.PI / 180, ay * Math.PI / 180, az * Math.PI / 180, 'ZYX')).elements;
  return (v) => [e[0] * v[0] + e[4] * v[1] + e[8] * v[2], e[1] * v[0] + e[5] * v[1] + e[9] * v[2], e[2] * v[0] + e[6] * v[1] + e[10] * v[2]];
}
/** Two unit vectors perpendicular to `t` (and to each other). */
export function perp(t: V3): [V3, V3] {
  const n = norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [n, cross(t, n)];
}
export const unitRand = (r: Rnd): V3 => { const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), s * Math.sin(a), z]; };

/** Natural / popular-image colours (not the Hubble palette). */
export const PAL = {
  ha: hex('#ff2e4c'), pink: hex('#ff6a9a'), magenta: hex('#ff4f8a'), nii: hex('#b0122a'), oiii: hex('#38e0c8'), teal: hex('#4cc4e0'),
  blue: hex('#6f98ff'), refl: hex('#5a86ff'), orange: hex('#ff7a2c'), gold: hex('#ffc458'), yellow: hex('#ffe486'), white: hex('#fff4ec'),
  green: hex('#7cff9a'), dust: hex('#010000'), dustLit: hex('#2e1c12'), starB: hex('#cfdcff'), starW: hex('#fff6e8'), starY: hex('#ffe2b0'), starR: hex('#ffb08a'),
};

// ---------------------------------------------------------------- value noise
/** Seeded 3D fBm, values ≈ 0..1 (mean 0.5). */
export function makeNoise3(seed: number) {
  const r = rng(seed), P = new Uint8Array(512), V = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x: number, y: number, z: number) => V[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t: number) => t * t * (3 - 2 * t), l = (a: number, b: number, t: number) => a + (b - a) * t;
  const n = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy), fz);
  };
  return (x: number, y: number, z = 0.5, oct = 4) => { let a = 0, w = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { a += n(x * f + 17, y * f + 31, z * f + 7) * w; t += w; w *= 0.5; f *= 2.03; } return a / t; };
}

/** Shared tileable wispy cloud texture for the haze quads (also sampled by the CPU painter). */
const NT = 128;
let noiseData: Float32Array | null = null, noiseTex: THREE.DataTexture | null = null;
function noiseField(): Float32Array {
  if (noiseData) return noiseData;
  const r = rng(9137), d = new Float32Array(NT * NT), oct = [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]] as const;
  const lat = oct.map(([g]) => Float32Array.from({ length: g * g }, () => r()));
  let lo = 9, hi = -9;
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
    let v = 0;
    oct.forEach(([g, w], k) => {
      const fx = x / NT * g, fy = y / NT * g, xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi, L = lat[k];
      const q = (i: number, j: number) => L[(j % g) * g + (i % g)], sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      v += w * ((q(xi, yi) * (1 - sx) + q(xi + 1, yi) * sx) * (1 - sy) + (q(xi, yi + 1) * (1 - sx) + q(xi + 1, yi + 1) * sx) * sy);
    });
    v = 1 - Math.abs(v - 0.5) * 2; // ridged → wispy
    d[y * NT + x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  for (let i = 0; i < d.length; i++) d[i] = clamp((d[i] - lo) / (hi - lo)) ** 2.2;
  return (noiseData = d);
}
function noiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const d = noiseField(), u = new Uint8Array(NT * NT * 4);
  for (let i = 0; i < d.length; i++) { u[i * 4] = u[i * 4 + 1] = u[i * 4 + 2] = Math.round(d[i] * 255); u[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(u, NT, NT, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (noiseTex = t);
}

// ---------------------------------------------------------------- builder
const TIER_Q: Record<NebulaTier, number> = { high: 1, medium: 0.4, low: 0.12 };

/** Accumulates a model's primitives. Counts given to samplers are high-tier counts; lower tiers use fewer, bigger, brighter points. */
export class NB {
  readonly r: Rnd; readonly q: number;
  private iq: number; private sq: number; private dq: number;
  glow = { p: [] as number[], c: [] as number[], s: [] as number[] };
  /** Glow drawn after the soft dust (rims, flows and nebulae that sit in front of dark clouds). */
  glowF = { p: [] as number[], c: [] as number[], s: [] as number[] };
  private fg = false;
  haze = { p: [] as number[], c: [] as number[], s: [] as number[], k: [] as number[] };
  dust = { p: [] as number[], c: [] as number[], s: [] as number[], a: [] as number[] };
  stars = { p: [] as number[], c: [] as number[], s: [] as number[], sp: [] as number[], st: [] as number[] };
  constructor(seed: number, tier: NebulaTier) {
    this.r = rng(seed); this.q = TIER_Q[tier];
    this.iq = this.q ** -0.5; this.sq = this.q ** -0.25; this.dq = this.q ** -0.5;
  }
  n(c: number) { return Math.max(1, Math.round(c * this.q)); }
  g = () => gauss(this.r);
  /** Glowing gas point (additive): `I` brightness, `size` sprite diameter in model units. */
  glw(p: V3, col: C3, I: number, size: number) {
    const k = I * this.iq, G = this.fg ? this.glowF : this.glow;
    G.p.push(p[0], p[1], p[2]); G.c.push(col[0] * k, col[1] * k, col[2] * k); G.s.push(size * this.sq);
  }
  /** Emit glow inside `f` into the foreground layer (in front of dust). */
  front(f: () => void) { const o = this.fg; this.fg = true; f(); this.fg = o; }
  /** Big soft camera-facing cloud quad (additive, wispy texture): `size` = half-width, `rough` 0..1 wispiness. */
  hz(p: V3, col: C3, I: number, size: number, rough = 0.8) {
    this.haze.p.push(p[0], p[1], p[2]); this.haze.c.push(col[0] * I, col[1] * I, col[2] * I); this.haze.s.push(size);
    this.haze.k.push(Math.floor(this.r() * 1000) + clamp(rough, 0, 0.999));
  }
  /** Dark dust particle (occludes what is behind it). */
  dst(p: V3, col: C3, alpha: number, size: number) {
    this.dust.p.push(p[0], p[1], p[2]); this.dust.c.push(col[0], col[1], col[2]); this.dust.a.push(alpha); this.dust.s.push(size * this.dq);
  }
  /** Star: `px` sprite size in reference pixels (900 px tall view), `spike` diffraction-cross strength, `strobe` flashes/s. */
  star(p: V3, col: C3, I: number, px: number, spike = 0, strobe = 0) {
    this.stars.p.push(p[0], p[1], p[2]); this.stars.c.push(col[0] * I, col[1] * I, col[2] * I); this.stars.s.push(px); this.stars.sp.push(spike); this.stars.st.push(strobe);
  }
  /** A loose star cluster. */
  cluster(n: number, c: V3, s: number, I: number, px: number, cols: C3[] = [PAL.starB, PAL.starW, PAL.starW, PAL.starY]) {
    for (let i = 0; i < n; i++) {
      const m = this.r() ** 3;
      this.star([c[0] + this.g() * s, c[1] + this.g() * s, c[2] + this.g() * s], cols[Math.floor(this.r() * cols.length)], I * (0.3 + m * 1.5), px * (0.6 + m * 1.2));
    }
  }
  /** Faint field stars in a box (foreground/background of the nebula). */
  field_stars(n: number, ext = 1.1, I = 0.5) {
    for (let i = 0; i < n; i++) {
      const m = this.r() ** 4, cols = [PAL.starW, PAL.starY, PAL.starB, PAL.starR];
      this.star([(this.r() * 2 - 1) * ext, (this.r() * 2 - 1) * ext, (this.r() * 2 - 1) * 0.6], cols[Math.floor(this.r() * 4)], I * (0.25 + m * 1.6), 5 + m * 9);
    }
  }

  // ------------------------------------------------ samplers
  /** Gaussian clump of glow points. */
  blob(n: number, c: V3, s: V3, col: C3 | ((p: V3) => C3), I: number, size: number) {
    for (let i = 0, N = this.n(n); i < N; i++) {
      const p: V3 = [c[0] + this.g() * s[0], c[1] + this.g() * s[1], c[2] + this.g() * s[2]];
      this.glw(p, typeof col === 'function' ? col(p) : col, I * (0.5 + this.r()), size * (0.6 + this.r() * 0.8));
    }
  }
  /** Points on an ellipsoidal shell (radial gaussian thickness `thick`); `f(p, u)` emits (u = unit direction). */
  shell(n: number, radii: V3, thick: number, f: (p: V3, u: V3) => void) {
    for (let i = 0, N = this.n(n); i < N; i++) {
      const u = unitRand(this.r), k = 1 + this.g() * thick;
      f([u[0] * radii[0] * k, u[1] * radii[1] * k, u[2] * radii[2] * k], u);
    }
  }
  /** Points along a Catmull-Rom curve through `pts` with gaussian width; `f(p, t)` emits. */
  curve(pts: V3[], n: number, width: number | ((t: number) => number), f: (p: V3, t: number) => void) {
    for (let i = 0, N = this.n(n); i < N; i++) {
      const t = this.r(), c = crPoint(pts, t), w = typeof width === 'number' ? width : width(t);
      f([c[0] + this.g() * w, c[1] + this.g() * w, c[2] + this.g() * w], t);
    }
  }
  /** Several thin strands twisting round a base curve (a braided filament); `f(p, t, strand)` emits. */
  braid(pts: V3[], strands: number, n: number, amp: number, turns: number, width: number, f: (p: V3, t: number, k: number) => void) {
    const per = Math.max(2, Math.round(this.n(n) / strands));
    for (let k = 0; k < strands; k++) {
      const ph = this.r() * Math.PI * 2, a = amp * (0.4 + this.r() * 0.8), tw = turns * (0.6 + this.r() * 0.8) * (this.r() < 0.5 ? -1 : 1);
      for (let i = 0; i < per; i++) {
        const t = this.r(), c = crPoint(pts, t), tg = norm(sub(crPoint(pts, Math.min(1, t + 0.01)), crPoint(pts, Math.max(0, t - 0.01))));
        const [nn, bb] = perp(tg), an = ph + t * tw * Math.PI * 2, o = a * (0.3 + 0.7 * Math.sin(Math.PI * t)), ca = Math.cos(an) * o, sa = Math.sin(an) * o;
        f([c[0] + nn[0] * ca + bb[0] * sa + this.g() * width, c[1] + nn[1] * ca + bb[1] * sa + this.g() * width, c[2] + nn[2] * ca + bb[2] * sa + this.g() * width], t, k);
      }
    }
  }
  /** A wandering path on the unit sphere (for shell filaments). */
  walk(start: V3, dir: V3, steps: number, step: number, turn: number): V3[] {
    let p = norm(start), t = norm(sub(dir, scale(p, dot(dir, p))));
    const out: V3[] = [p];
    for (let i = 0; i < steps; i++) {
      const b = cross(p, t), a = this.g() * turn;
      t = norm(add(scale(t, Math.cos(a)), b, Math.sin(a)));
      p = norm(add(p, t, step));
      t = norm(sub(t, scale(p, dot(t, p))));
      out.push(p);
    }
    return out;
  }
  /** Rejection-sample a 2D density d(x,y) ∈ 0..1 over the box [x0,x1,y0,y1]; `f(x, y, d)` emits. */
  field(n: number, box: [number, number, number, number], d: (x: number, y: number) => number, f: (x: number, y: number, d: number) => void) {
    const N = this.n(n), [x0, x1, y0, y1] = box;
    for (let i = 0, k = 0; i < N && k < N * 200; k++) {
      const x = x0 + (x1 - x0) * this.r(), y = y0 + (y1 - y0) * this.r(), v = d(x, y);
      if (this.r() < v) { f(x, y, v); i++; }
    }
  }
}

/** Uniform Catmull-Rom through points (t ∈ 0..1). */
export function crPoint(P: V3[], t: number): V3 {
  const n = P.length - 1, f = clamp(t) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)], u2 = u * u, u3 = u2 * u, o: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  return o;
}
export function inPoly(P: P2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Distance from (x,y) to the polygon outline. */
function polyDist(P: P2[], x: number, y: number): number {
  let d = 1e9;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
    d = Math.min(d, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return d;
}
/** Signed distance: negative inside the polygon. */
export const polySd = (P: P2[], x: number, y: number) => polyDist(P, x, y) * (inPoly(P, x, y) ? -1 : 1);
/** Chaikin-smoothed closed outline (organic edges from a coarse polygon). */
export function chaikin(P: P2[], it = 2): P2[] {
  let a = P;
  for (let k = 0; k < it; k++) {
    const o: P2[] = [];
    for (let i = 0; i < a.length; i++) { const p = a[i], q = a[(i + 1) % a.length]; o.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); }
    a = o;
  }
  return a;
}

// ---------------------------------------------------------------- three.js
const COMMON_VS = /* glsl */`
uniform float uScale, uOrtho, uMinPx, uMaxPx, uTime, uOpacity;
float pxSize(float s, vec4 mv) { return uOrtho > 0.5 ? s * uScale : s * uScale / max(-mv.z, 1e-5); }
`;
const GLOW_VS = /* glsl */`${COMMON_VS}
attribute vec3 aColor; attribute float aSize; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = pxSize(aSize, mv), k = 1.0;
  if (px < uMinPx) { k = px * px / (uMinPx * uMinPx); px = uMinPx; }
  px = min(px, uMaxPx);
  float sh = 1.0 + 0.08 * sin(uTime * 0.7 + dot(position, vec3(41.3, 27.1, 33.7)));
  vC = aColor * k * sh * uOpacity;
  gl_PointSize = px; gl_Position = projectionMatrix * mv;
}`;
const GLOW_FS = /* glsl */`varying vec3 vC;
void main() { vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d); if (r2 > 1.0) discard; gl_FragColor = vec4(vC, exp(-r2 * 4.0)); }`;
const DUST_VS = /* glsl */`${COMMON_VS}
attribute vec3 aColor; attribute float aSize, aAlpha; varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = pxSize(aSize, mv), k = 1.0;
  if (px < uMinPx) { k = px / uMinPx; px = uMinPx; }
  px = min(px, uMaxPx * 1.5);
  vC = aColor; vA = aAlpha * k;
  gl_PointSize = px; gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */`uniform float uSoft, uOpacity; varying vec3 vC; varying float vA;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d); if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.0) * vA;
  if (uSoft < 0.5) { if (a < 0.7) discard; gl_FragColor = vec4(vC, uOpacity); }
  else gl_FragColor = vec4(vC, min(1.0, a * 1.05) * uOpacity);
}`;
const HAZE_VS = /* glsl */`${COMMON_VS}
uniform float uWs; attribute vec2 aCorner; attribute vec3 aColor; attribute float aSize, aSeed; varying vec3 vC; varying vec2 vUv, vT; varying float vR;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * uWs;
  mv.xy += aCorner * s;
  float near = uOrtho > 0.5 ? 1.0 : smoothstep(s * 0.4, s * 1.6, -mv.z);
  float a = fract(aSeed * 0.6180339) * 6.2831853, c = cos(a), sn = sin(a);
  vUv = aCorner; vT = mat2(c, -sn, sn, c) * aCorner * 0.42 + vec2(fract(aSeed * 0.0137), fract(aSeed * 0.0291)); vR = fract(aSeed);
  vC = aColor * near * uOpacity * (1.0 + 0.06 * sin(uTime * 0.4 + aSeed));
  gl_Position = projectionMatrix * mv;
}`;
const HAZE_FS = /* glsl */`uniform sampler2D uNoise; varying vec3 vC; varying vec2 vUv, vT; varying float vR;
void main() { float r2 = dot(vUv, vUv); if (r2 > 1.0) discard; float n = texture2D(uNoise, vT).r; gl_FragColor = vec4(vC, exp(-r2 * 3.0) * max(0.0, 1.0 + (n * 2.2 - 1.0) * vR)); }`;
const STAR_VS = /* glsl */`${COMMON_VS}
uniform float uPx, uFar; attribute vec3 aColor; attribute float aSize, aSpike, aStrobe; varying vec3 vC; varying float vS, vCore;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float b;
  if (aStrobe > 0.0) b = 0.5 + 0.7 * pow(0.5 + 0.5 * cos(6.2831853 * uTime * aStrobe), 6.0);
  else b = 1.0 + 0.12 * sin(uTime * (1.3 + fract(aSize * 7.31) * 2.0) + position.x * 91.0);
  float px = aSize * uPx * uFar * (aStrobe > 0.0 ? 0.8 + 0.25 * b : 1.0);
  vCore = clamp(uPx * uFar * 2.2 / max(px, 1.0), 0.04, 0.6);
  vC = aColor * b * uOpacity; vS = aSpike;
  gl_PointSize = max(px, 1.5); gl_Position = projectionMatrix * mv;
}`;
const STAR_FS = /* glsl */`varying vec3 vC; varying float vS, vCore;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d);
  float a = exp(-r2 / (vCore * vCore) * 1.2) + 0.35 * exp(-r2 * 9.0);
  if (vS > 0.0) { vec2 q = abs(d); a += vS * (exp(-q.x * 70.0) + exp(-q.y * 70.0)) * pow(max(0.0, 1.0 - max(q.x, q.y)), 2.0) * 0.9; }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC, min(a, 1.6));
}`;

/** Turn builder data into a three.js group: dust depth pass, haze quads, glow points, soft dust pass, foreground glow, stars. */
export function toModel(b: NB, radius = 1): NebulaModel {
  const group = new THREE.Group(), geos: THREE.BufferGeometry[] = [], mats: THREE.ShaderMaterial[] = [];
  const U = {
    uScale: { value: 1000 }, uOrtho: { value: 0 }, uMinPx: { value: 1.5 }, uMaxPx: { value: 48 }, uTime: { value: 0 }, uOpacity: { value: 1 },
    uWs: { value: 1 }, uPx: { value: 1 }, uFar: { value: 1 }, uNoise: { value: noiseTexture() },
  };
  const size = new THREE.Vector2(), wp = new THREE.Vector3(), cp = new THREE.Vector3();
  const prep = (r: THREE.WebGLRenderer, cam: THREE.Camera, obj: THREE.Object3D) => {
    r.getDrawingBufferSize(size);
    const H = size.y, ws = obj.matrixWorld.getMaxScaleOnAxis();
    let pr: number;
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const c = cam as THREE.PerspectiveCamera, s = H / (2 * Math.tan(c.fov * Math.PI / 360)) * c.zoom;
      U.uOrtho.value = 0; U.uScale.value = s * ws;
      obj.getWorldPosition(wp); cam.getWorldPosition(cp);
      pr = s * ws * radius / Math.max(1e-9, wp.distanceTo(cp));
    } else {
      const c = cam as THREE.OrthographicCamera;
      U.uOrtho.value = 1; U.uScale.value = H / ((c.top - c.bottom) / c.zoom) * ws; pr = U.uScale.value * radius;
    }
    U.uWs.value = ws; U.uMinPx.value = Math.max(1, H / 700); U.uMaxPx.value = Math.max(24, H * 0.07);
    U.uPx.value = H / 900; U.uFar.value = clamp(Math.sqrt(pr / (H * 0.35)), 0.3, 1.7);
  };
  const mk = (vs: string, fs: string, blending: THREE.Blending, extra: Partial<THREE.ShaderMaterialParameters> = {}, own: Record<string, { value: unknown }> = {}) => {
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, ...own }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: true, blending, ...extra });
    mats.push(m); return m;
  };
  const geo = (attrs: Record<string, [number[] | Float32Array, number]>, index?: number[]) => {
    const g = new THREE.BufferGeometry();
    for (const [k, [a, s]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), s));
    if (index) g.setIndex(index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.2);
    geos.push(g); return g;
  };
  const put = (o: THREE.Object3D, order: number) => { o.renderOrder = order; o.frustumCulled = false; o.onBeforeRender = (r, _s, c) => prep(r, c, o); group.add(o); };

  const D = b.dust;
  let dustGeo: THREE.BufferGeometry | null = null;
  if (D.s.length) {
    dustGeo = geo({ position: [D.p, 3], aColor: [D.c, 3], aSize: [D.s, 1], aAlpha: [D.a, 1] });
    put(new THREE.Points(dustGeo, mk(DUST_VS, DUST_FS, THREE.NormalBlending, { depthWrite: true }, { uSoft: { value: 0 } })), 0);
  }
  const Hz = b.haze;
  if (Hz.s.length) {
    const n = Hz.s.length, P = new Float32Array(n * 12), C = new Float32Array(n * 12), S = new Float32Array(n * 4), K = new Float32Array(n * 4), Q = new Float32Array(n * 8), I: number[] = [];
    const cs = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < n; i++) {
      for (let v = 0; v < 4; v++) {
        const o = i * 4 + v;
        for (let c = 0; c < 3; c++) { P[o * 3 + c] = Hz.p[i * 3 + c]; C[o * 3 + c] = Hz.c[i * 3 + c]; }
        S[o] = Hz.s[i]; K[o] = Hz.k[i]; Q[o * 2] = cs[v * 2]; Q[o * 2 + 1] = cs[v * 2 + 1];
      }
      I.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    put(new THREE.Mesh(geo({ position: [P, 3], aColor: [C, 3], aSize: [S, 1], aSeed: [K, 1], aCorner: [Q, 2] }, I), mk(HAZE_VS, HAZE_FS, THREE.AdditiveBlending, { side: THREE.DoubleSide })), 1);
  }
  const G = b.glow;
  if (G.s.length) put(new THREE.Points(geo({ position: [G.p, 3], aColor: [G.c, 3], aSize: [G.s, 1] }), mk(GLOW_VS, GLOW_FS, THREE.AdditiveBlending)), 2);
  if (dustGeo) put(new THREE.Points(dustGeo, mk(DUST_VS, DUST_FS, THREE.NormalBlending, {}, { uSoft: { value: 1 } })), 3);
  const GF = b.glowF;
  if (GF.s.length) put(new THREE.Points(geo({ position: [GF.p, 3], aColor: [GF.c, 3], aSize: [GF.s, 1] }), mk(GLOW_VS, GLOW_FS, THREE.AdditiveBlending)), 3.5);
  const St = b.stars;
  if (St.s.length) put(new THREE.Points(geo({ position: [St.p, 3], aColor: [St.c, 3], aSize: [St.s, 1], aSpike: [St.sp, 1], aStrobe: [St.st, 1] }), mk(STAR_VS, STAR_FS, THREE.AdditiveBlending)), 4);

  return {
    group, radius,
    update(t) { U.uTime.value = t; },
    setOpacity(a) { U.uOpacity.value = clamp(a); group.visible = a > 0.001; },
    dispose() { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); },
  };
}

/** Primitive counts (for budgets). */
export const counts = (b: NB) => ({ glow: b.glow.s.length + b.glowF.s.length, haze: b.haze.s.length, dust: b.dust.s.length, stars: b.stars.s.length });

// ---------------------------------------------------------------- CPU painter
/** Orthographic +Z view of the model data splatted onto a square canvas (same look as the 3D front view). */
export function paintData(b: NB, S: number, ext = 1.08): HTMLCanvasElement {
  const N = S * S, F = new Float32Array(N * 3), Z = new Float32Array(N).fill(-1e9), A = new Float32Array(N), SC = new Float32Array(N * 4);
  const k = S / (2 * ext), sx = (x: number) => (x + ext) * k, sy = (y: number) => (ext - y) * k, minPx = Math.max(1, S / 700);
  const splat = (cx: number, cy: number, rad: number, fn: (i: number, r2: number, u: number, v: number) => void) => {
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(S - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(S - 1, Math.ceil(cy + rad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rad, v = (y + 0.5 - cy) / rad, r2 = u * u + v * v;
      if (r2 <= 1) fn(y * S + x, r2, u, v);
    }
  };
  const D = b.dust;
  for (let i = 0; i < D.s.length; i++) {
    let px = D.s[i] * k, al = D.a[i]; if (px < minPx) { al *= px / minPx; px = minPx; }
    const z = D.p[i * 3 + 2];
    splat(sx(D.p[i * 3]), sy(D.p[i * 3 + 1]), px / 2, (j, r2) => {
      const a = Math.exp(-r2 * 3) * al;
      if (a >= 0.7 && z > Z[j]) { Z[j] = z; for (let c = 0; c < 3; c++) F[j * 3 + c] = D.c[i * 3 + c]; }
      const s = Math.min(1, a * 1.05); A[j] = 1 - (1 - A[j]) * (1 - s);
      for (let c = 0; c < 3; c++) SC[j * 4 + c] += D.c[i * 3 + c] * s;
      SC[j * 4 + 3] += s;
    });
  }
  const glow = (G: NB['glow']) => {
    for (let i = 0; i < G.s.length; i++) {
      let px = G.s[i] * k, kk = 1; if (px < minPx) { kk = px * px / (minPx * minPx); px = minPx; }
      const z = G.p[i * 3 + 2], r = G.c[i * 3] * kk, g = G.c[i * 3 + 1] * kk, bl = G.c[i * 3 + 2] * kk;
      splat(sx(G.p[i * 3]), sy(G.p[i * 3 + 1]), px / 2, (j, r2) => { if (z < Z[j]) return; const a = Math.exp(-r2 * 4); F[j * 3] += r * a; F[j * 3 + 1] += g * a; F[j * 3 + 2] += bl * a; });
    }
  };
  glow(b.glow);
  const Hz = b.haze, nf = noiseField();
  for (let i = 0; i < Hz.s.length; i++) {
    const z = Hz.p[i * 3 + 2], seed = Hz.k[i], ang = ((seed * 0.6180339) % 1) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang), ox = (seed * 0.0137) % 1, oy = (seed * 0.0291) % 1, rough = seed % 1;
    splat(sx(Hz.p[i * 3]), sy(Hz.p[i * 3 + 1]), Hz.s[i] * k, (j, r2, u, v) => {
      if (z < Z[j]) return;
      v = -v;
      const tx = (c * u - s * v) * 0.42 + ox, ty = (s * u + c * v) * 0.42 + oy;
      const n = nf[(((Math.floor(ty * NT) % NT) + NT) % NT) * NT + (((Math.floor(tx * NT) % NT) + NT) % NT)];
      const a = Math.exp(-r2 * 3) * Math.max(0, 1 + (n * 2.2 - 1) * rough);
      F[j * 3] += Hz.c[i * 3] * a; F[j * 3 + 1] += Hz.c[i * 3 + 1] * a; F[j * 3 + 2] += Hz.c[i * 3 + 2] * a;
    });
  }
  for (let j = 0; j < N; j++) {
    const a = A[j], w = SC[j * 4 + 3] || 1;
    for (let c = 0; c < 3; c++) F[j * 3 + c] = F[j * 3 + c] * (1 - a) + SC[j * 4 + c] / w * a;
  }
  glow(b.glowF);
  const St = b.stars, sc = S / 900;
  for (let i = 0; i < St.s.length; i++) {
    const px = Math.max(1.5, St.s[i] * sc * 1.3), sp = St.sp[i], core = clamp(sc * 2.2 / px, 0.04, 0.6), z = St.p[i * 3 + 2];
    splat(sx(St.p[i * 3]), sy(St.p[i * 3 + 1]), px / 2, (j, r2, u, v) => {
      if (z < Z[j]) return;
      let a = Math.exp(-r2 / (core * core) * 1.2) + 0.35 * Math.exp(-r2 * 9);
      if (sp > 0) { const qx = Math.abs(u), qy = Math.abs(v); a += sp * (Math.exp(-qx * 70) + Math.exp(-qy * 70)) * (1 - Math.max(qx, qy)) ** 2 * 0.9; }
      a = Math.min(a, 1);
      for (let c = 0; c < 3; c++) F[j * 3 + c] += St.c[i * 3 + c] * a;
    });
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(S, S);
  for (let j = 0; j < N; j++) {
    for (let c = 0; c < 3; c++) img.data[j * 4 + c] = Math.min(255, Math.round(F[j * 3 + c] * 255));
    img.data[j * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
