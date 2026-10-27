/**
 * Procedural pictures for the deep-space scales: the Milky Way's spiral structure (shared by its 3D star cloud and
 * its glow texture), other galaxies by shape, nebulae, the cosmic microwave background and card thumbnails.
 * Everything is generated from small seeded generators, so nothing big is downloaded.
 */
import type { Morph } from '../../shared/data/cosmos.ts';
import { mulberry32 } from '../../shared/lib/rng.ts';

export type Rnd = () => number;
/** Seeded PRNG; seed 0 is mapped to 1. */
export const rng = (seed: number): Rnd => mulberry32(seed >>> 0 || 1);
export const gauss = (r: Rnd) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
export const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** A logarithmic spiral arm: R(β) = rRef · exp(−(β − bRef) · tan ψ), β in degrees along the galaxy's rotation. */
export interface Arm { rRef: number; bRef: number; pitch: number; b0: number; b1: number; w: number; weight: number }
export interface DiscDef {
  /** Outer radius (same unit as everything else in the def). */
  R: number; arms: Arm[]; bar?: { half: number; ang: number; w: number }; bulge: number; scaleLen: number; thick: number;
}

const D2R = Math.PI / 180;
/** kpc → kly, rescaled so R0 matches the 26.67 kly distance to Sgr A* used everywhere else. */
const K = 3.2616 * (26.67 / (8.34 * 3.2616));

/** The Milky Way in kly, centred on the Galactic Centre: arms after Reid et al. (2014), bar at 27° to the Sun. */
export const MILKY_WAY: DiscDef = {
  R: 58,
  arms: [
    { rRef: 5.0 * K, bRef: 27.6, pitch: 19.8, b0: -150, b1: 84, w: 1.5, weight: 1 }, // Scutum–Centaurus
    { rRef: 6.6 * K, bRef: 25.6, pitch: 6.9, b0: -115, b1: 185, w: 1.1, weight: 0.55 }, // Sagittarius–Carina
    { rRef: 8.4 * K, bRef: 8.9, pitch: 12.8, b0: -16, b1: 34, w: 0.8, weight: 0.3 }, // Orion–Cygnus (local spur)
    { rRef: 9.9 * K, bRef: 14.2, pitch: 9.4, b0: -130, b1: 200, w: 1.5, weight: 1 }, // Perseus
    { rRef: 13.0 * K, bRef: 18.6, pitch: 13.8, b0: -40, b1: 318, w: 1.3, weight: 0.6 }, // Norma–Outer
  ],
  bar: { half: 16, ang: 27, w: 2.6 },
  bulge: 4.2, scaleLen: 8.5, thick: 0.9,
};

/** A generic n-armed spiral of radius 1 (pitch in degrees). */
export function genericSpiral(n: number, pitch: number, barred: boolean, seed: number): DiscDef {
  const r = rng(seed), arms: Arm[] = [];
  const t = Math.tan(pitch * D2R), span = Math.log(0.95 / 0.18) / t / D2R;
  for (let i = 0; i < n; i++) arms.push({ rRef: 0.18, bRef: (360 / n) * i + r() * 20, pitch, b0: (360 / n) * i - span, b1: (360 / n) * i, w: 0.045, weight: 1 });
  for (const a of arms) { a.b0 = a.bRef - span; a.b1 = a.bRef; }
  return { R: 1, arms, bar: barred ? { half: 0.2, ang: r() * 180, w: 0.04 } : undefined, bulge: 0.09, scaleLen: 0.28, thick: 0.015 };
}

/** Galaxy-plane position (x toward the Sun's side is −x, y along the rotation) of an arm at β. */
function armPoint(a: Arm, beta: number): [number, number, number] {
  const R = a.rRef * Math.exp(-(beta - a.bRef) * D2R * Math.tan(a.pitch * D2R));
  return [-R * Math.cos(beta * D2R), R * Math.sin(beta * D2R), R];
}

export interface StarCloud { pos: Float32Array; col: Float32Array; size: Float32Array; n: number; dust: Float32Array; nd: number }

/**
 * Samples a disc galaxy as coloured points in its own frame (x, y in the disc, z up). Sizes are in the def's unit.
 * Old disc stars are warm, arms are blue-white with pink star-forming knots, the bulge and bar are golden.
 */
export function sampleDisc(def: DiscDef, n: number, seed: number, starSize: number): StarCloud {
  const r = rng(seed);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const dustN = Math.round(n * 0.5), dust = new Float32Array(dustN * 2);
  let i = 0, nd = 0;
  const put = (x: number, y: number, z: number, c: [number, number, number], k: number, s: number) => {
    if (i >= n) return;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = c[0] * k; col[i * 3 + 1] = c[1] * k; col[i * 3 + 2] = c[2] * k;
    size[i] = s; i++;
  };
  const armW = def.arms.reduce((s, a) => s + a.weight * Math.abs(a.b1 - a.b0), 0);
  const nArm = Math.round(n * 0.44), nKnot = Math.round(n * 0.05), nBulge = Math.round(n * 0.13), nBar = def.bar ? Math.round(n * 0.07) : 0;
  const nDisc = n - nArm - nKnot - nBulge - nBar;
  const pickArm = () => { let x = r() * armW; for (const a of def.arms) { x -= a.weight * Math.abs(a.b1 - a.b0); if (x <= 0) return a; } return def.arms[0]; };
  const armSample = (a: Arm) => {
    for (let k = 0; k < 8; k++) {
      const beta = a.b0 + r() * (a.b1 - a.b0);
      const [x, y, R] = armPoint(a, beta);
      if (R > def.R || r() > Math.min(1, (R / (R + def.scaleLen * 0.3)) * Math.exp(-R / (def.scaleLen * 2.4)) * 2.2)) continue;
      return { x, y, R, beta };
    }
    return null;
  };
  // Arms
  for (let k = 0; k < nArm; k++) {
    const a = pickArm(), s = armSample(a);
    if (!s) { k--; continue; }
    const g = gauss(r) * a.w, ux = s.x / s.R, uy = s.y / s.R;
    const t = r();
    const c: [number, number, number] = t < 0.55 ? [0.62, 0.74, 1] : t < 0.85 ? [0.9, 0.93, 1] : [1, 0.86, 0.7];
    put(s.x + ux * g + gauss(r) * a.w * 0.35, s.y + uy * g + gauss(r) * a.w * 0.35, gauss(r) * def.thick * 0.5, c, 0.35 + r() * 0.5, starSize * (0.7 + r() * 0.8));
    // dust on the inner (trailing) edge
    if (nd < dustN && r() < 0.9) { const gd = -Math.abs(gauss(r)) * a.w * 0.55 - a.w * 0.25; dust[nd * 2] = s.x + ux * gd; dust[nd * 2 + 1] = s.y + uy * gd; nd++; }
  }
  // Star-forming knots: clumps strung along the arms
  for (let k = 0; k < nKnot;) {
    const a = pickArm(), s = armSample(a);
    if (!s) continue;
    const m = 6 + Math.floor(r() * 14), ux = s.x / s.R, uy = s.y / s.R, off = gauss(r) * a.w * 0.4;
    for (let j = 0; j < m && k < nKnot; j++, k++) {
      const pink = r() < 0.55;
      put(s.x + ux * off + gauss(r) * a.w * 0.12, s.y + uy * off + gauss(r) * a.w * 0.12, gauss(r) * def.thick * 0.2,
        pink ? [1, 0.42, 0.62] : [0.7, 0.82, 1], pink ? 0.75 : 0.9, starSize * (1 + r() * 1.2));
    }
  }
  // Bulge
  for (let k = 0; k < nBulge; k++) {
    const s = def.bulge * 0.55;
    put(gauss(r) * s, gauss(r) * s, gauss(r) * s * 0.62, [1, 0.8, 0.52], 0.55 + r() * 0.4, starSize * (0.8 + r() * 0.7));
  }
  // Bar
  if (def.bar) {
    const ca = Math.cos(def.bar.ang * D2R), sa = Math.sin(def.bar.ang * D2R);
    for (let k = 0; k < nBar; k++) {
      const u = gauss(r) * def.bar.half * 0.5, v = gauss(r) * def.bar.w * 0.5;
      // the bar's near end points to the Sun's side (−x) and toward positive longitudes (+y)
      put(-u * ca - v * sa, u * sa - v * ca, gauss(r) * def.thick * 0.7, [1, 0.84, 0.6], 0.5 + r() * 0.35, starSize * (0.8 + r() * 0.6));
    }
  }
  // Old disc
  for (let k = 0; k < nDisc; k++) {
    const R = -def.scaleLen * Math.log((r() + 1e-6) * (r() + 1e-6)) * 0.62;
    if (R > def.R) { k--; continue; }
    const th = r() * Math.PI * 2;
    put(Math.cos(th) * R, Math.sin(th) * R, gauss(r) * def.thick, [1, 0.9, 0.76], 0.18 + r() * 0.35, starSize * (0.6 + r() * 0.7));
  }
  return { pos, col, size, n: i, dust, nd };
}

// ---------- canvas helpers ----------
function blur(src: Float32Array, w: number, h: number, ch: number, rad: number): Float32Array {
  const out = new Float32Array(src.length), tmp = new Float32Array(src.length), win = rad * 2 + 1;
  for (let y = 0; y < h; y++) for (let c = 0; c < ch; c++) {
    let acc = 0;
    for (let x = -rad; x <= rad; x++) acc += src[(y * w + Math.min(w - 1, Math.max(0, x))) * ch + c];
    for (let x = 0; x < w; x++) {
      tmp[(y * w + x) * ch + c] = acc / win;
      acc += src[(y * w + Math.min(w - 1, x + rad + 1)) * ch + c] - src[(y * w + Math.max(0, x - rad)) * ch + c];
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * ch + c];
    for (let y = 0; y < h; y++) {
      out[(y * w + x) * ch + c] = acc / win;
      acc += tmp[(Math.min(h - 1, y + rad + 1) * w + x) * ch + c] - tmp[(Math.max(0, y - rad) * w + x) * ch + c];
    }
  }
  return out;
}

const canvas = (w: number, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** Face-on glow picture of a disc galaxy from its star cloud (x right, y up), with dark dust lanes. */
export function paintDisc(def: DiscDef, cloud: StarCloud, S: number, gain = 1): HTMLCanvasElement {
  const acc = new Float32Array(S * S * 3), dust = new Float32Array(S * S);
  const toPx = (v: number) => ((v / def.R + 1) / 2) * S;
  for (let i = 0; i < cloud.n; i++) {
    const px = Math.floor(toPx(cloud.pos[i * 3])), py = Math.floor(S - toPx(cloud.pos[i * 3 + 1]));
    if (px < 0 || py < 0 || px >= S || py >= S) continue;
    const o = (py * S + px) * 3;
    acc[o] += cloud.col[i * 3]; acc[o + 1] += cloud.col[i * 3 + 1]; acc[o + 2] += cloud.col[i * 3 + 2];
  }
  for (let i = 0; i < cloud.nd; i++) {
    const px = Math.floor(toPx(cloud.dust[i * 2])), py = Math.floor(S - toPx(cloud.dust[i * 2 + 1]));
    if (px >= 0 && py >= 0 && px < S && py < S) dust[py * S + px] += 1;
  }
  const fine = blur(acc, S, S, 3, Math.max(1, Math.round(S / 256)));
  const wide = blur(blur(acc, S, S, 3, Math.round(S / 40)), S, S, 3, Math.round(S / 40));
  const dd = blur(dust, S, S, 1, Math.max(1, Math.round(S / 200)));
  const cv = canvas(S), ctx = cv.getContext('2d')!, img = ctx.createImageData(S, S);
  const norm = (S * S) / Math.max(1, cloud.n) * 0.9 * gain;
  for (let p = 0; p < S * S; p++) {
    const dx = (p % S) / S * 2 - 1, dy = Math.floor(p / S) / S * 2 - 1;
    const edge = Math.max(0, 1 - Math.max(0, Math.hypot(dx, dy) - 0.82) / 0.18);
    const dk = 0.3 + 0.7 * Math.exp(-dd[p] * norm * 0.6);
    for (let c = 0; c < 3; c++) {
      const v = (fine[p * 3 + c] * 0.55 + wide[p * 3 + c] * 1.6) * norm * dk * edge;
      img.data[p * 4 + c] = 255 * (1 - Math.exp(-v * 1.6));
    }
    img.data[p * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Elliptical / lenticular / dwarf glow (centred, radius = half the canvas). */
export function paintBlob(morph: Morph, S: number, seed: number): HTMLCanvasElement {
  const cv = canvas(S), ctx = cv.getContext('2d')!, r = rng(seed);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  const c = S / 2;
  if (morph === 'irregular') {
    for (let i = 0; i < 26; i++) {
      const x = c + gauss(r) * S * 0.16, y = c + gauss(r) * S * 0.12, rad = S * (0.05 + r() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const pink = r() < 0.25;
      g.addColorStop(0, pink ? 'rgba(255,120,170,0.5)' : 'rgba(175,200,255,0.42)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    }
    return cv;
  }
  const flat = morph === 'lenticular' ? 0.45 : morph === 'elliptical' ? 0.72 + r() * 0.2 : 0.85;
  ctx.translate(c, c); ctx.rotate(r() * Math.PI); ctx.scale(1, flat);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.98);
  const warm = morph === 'dwarf' ? [215, 205, 190] : [255, 214, 160];
  const a0 = morph === 'dwarf' ? 0.55 : 1;
  g.addColorStop(0, `rgba(255,246,225,${a0})`);
  g.addColorStop(0.08, `rgba(${warm},${0.8 * a0})`);
  g.addColorStop(0.35, `rgba(${warm},${0.28 * a0})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(-c, -c, S, S);
  if (morph === 'lenticular') { ctx.fillStyle = 'rgba(255,230,190,0.25)'; ctx.fillRect(-c * 0.8, -c * 0.035, c * 1.6, c * 0.07); }
  return cv;
}

/** Value noise in [0, 1] (tileable along x with period `px`). */
function makeNoise(seed: number) {
  const r = rng(seed), P = 256, v = new Float32Array(P * P);
  for (let i = 0; i < v.length; i++) v[i] = r();
  const at = (x: number, y: number) => v[((y & 255) * P + (x & 255))];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
const fbm = (n: (x: number, y: number) => number, x: number, y: number, o = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2.03; } return s; };

/** Planck-style CMB map (equirectangular, 2:1): tiny hot and cold spots. */
export function paintCMB(W: number): HTMLCanvasElement {
  const H = W / 2, cv = canvas(W, H), ctx = cv.getContext('2d')!, img = ctx.createImageData(W, H), n = makeNoise(7);
  const pal: [number, number, number, number][] = [[0, 20, 40, 140], [0.35, 60, 120, 230], [0.5, 235, 235, 220], [0.65, 250, 160, 60], [1, 170, 30, 25]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // sample on the sphere so the map has no seam and no pinched poles
    const lon = (x / W) * Math.PI * 2, lat = (y / H - 0.5) * Math.PI;
    const px = Math.cos(lat) * Math.cos(lon), py = Math.cos(lat) * Math.sin(lon), pz = Math.sin(lat);
    let v = fbm(n, px * 9 + 40, py * 9 + pz * 5 + 40, 5) * 0.75 + fbm(n, pz * 9 + 80, px * 7 + 13, 3) * 0.25;
    v = Math.max(0, Math.min(1, (v - 0.5) * 2.6 + 0.5));
    let k = 1; while (k < pal.length - 1 && pal[k][0] < v) k++;
    const [t0, ...c0] = pal[k - 1], [t1, ...c1] = pal[k], f = (v - t0) / (t1 - t0);
    const o = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) img.data[o + c] = c0[c] + (c1[c] - c0[c]) * f;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Colourful nebula / remnant picture for cards (and sprites): layered noise clouds with a few stars. */
export function paintNebula(S: number, seed: number, hues: [string, string], ring = false, stars = true): HTMLCanvasElement {
  const cv = canvas(S), ctx = cv.getContext('2d')!, img = ctx.createImageData(S, S), n = makeNoise(seed), r = rng(seed);
  const ca = hexRgb(hues[0]), cb = hexRgb(hues[1]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, d = Math.hypot(u, v) * 2;
    const m = ring ? Math.exp(-(((d - 0.55) / 0.16) ** 2)) : Math.max(0, 1 - d * d);
    const a = Math.max(0, fbm(n, u * 5 + 10, v * 5 + 10) * 1.6 - 0.45) * m, b = Math.max(0, fbm(n, u * 7 + 50, v * 7 + 3) * 1.7 - 0.6) * m;
    const o = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) img.data[o + c] = Math.min(255, (ca[c] * a * 1.7 + cb[c] * b * 2));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (!stars) return cv;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < S / 6; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`; const s = r() < 0.08 ? 2 : 1; ctx.fillRect(r() * S, r() * S, s, s); }
  return cv;
}

const hexRgb = (h: string): [number, number, number] => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };

/** A soft round glow (white, for tinted sprites). */
let glowCv: HTMLCanvasElement | null = null;
export function glowCanvas(): HTMLCanvasElement {
  if (glowCv) return glowCv;
  const c = canvas(64), ctx = c.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return (glowCv = c);
}
