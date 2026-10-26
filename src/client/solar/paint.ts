/**
 * Procedural surface maps for solar-system bodies (pure, DOM-free; runs in a worker).
 * Equirectangular, h = w / 2: x = 0 → lon -180, x = w → lon +180; y = 0 → lat +90. Same convention as Earth.
 * Longitudes are planetocentric east-positive; real features are stamped at their IAU coordinates.
 * All noise is evaluated on the unit sphere (no seam at ±180°, no polar pinching) and deterministic.
 */
import type { BodyId } from '../../shared/data/solar.ts';
import { mulberry32 } from '../../shared/lib/rng.ts';

interface BodyMaps {
  w: number;
  h: number;
  /** RGBA, w × h × 4. */
  color: Uint8ClampedArray;
  /** Relief 0..255 (128 = datum) for bump mapping, or null for bodies without a solid surface. */
  height: Uint8Array | null;
}

type F32 = Float32Array;
type RGB = [number, number, number];
const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const wrapLon = (l: number) => ((((l + 180) % 360) + 360) % 360) - 180;

// ---------------------------------------------------------------- gradient noise (improved Perlin, 3D)

const PERM = new Uint8Array(512);
{
  const r = mulberry32(0x9e3779b1), a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
  for (let i = 0; i < 512; i++) PERM[i] = a[i & 255];
}
const GX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GZ = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

/** Gradient noise, roughly -1..1 (std ≈ 0.2). */
function noise3(x: number, y: number, z: number): number {
  let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
  const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10), w = z * z * z * (z * (z * 6 - 15) + 10);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const x1 = x - 1, y1 = y - 1, z1 = z - 1;
  let h = PERM[AA] & 15; const n000 = GX[h] * x + GY[h] * y + GZ[h] * z;
  h = PERM[BA] & 15; const n100 = GX[h] * x1 + GY[h] * y + GZ[h] * z;
  h = PERM[AB] & 15; const n010 = GX[h] * x + GY[h] * y1 + GZ[h] * z;
  h = PERM[BB] & 15; const n110 = GX[h] * x1 + GY[h] * y1 + GZ[h] * z;
  h = PERM[AA + 1] & 15; const n001 = GX[h] * x + GY[h] * y + GZ[h] * z1;
  h = PERM[BA + 1] & 15; const n101 = GX[h] * x1 + GY[h] * y + GZ[h] * z1;
  h = PERM[AB + 1] & 15; const n011 = GX[h] * x + GY[h] * y1 + GZ[h] * z1;
  h = PERM[BB + 1] & 15; const n111 = GX[h] * x1 + GY[h] * y1 + GZ[h] * z1;
  const a0 = n000 + u * (n100 - n000), a1 = n010 + u * (n110 - n010), a2 = n001 + u * (n101 - n001), a3 = n011 + u * (n111 - n011);
  const b0 = a0 + v * (a1 - a0), b1 = a2 + v * (a3 - a2);
  return b0 + w * (b1 - b0);
}

function offsets(seed: number): RGB {
  const r = mulberry32((seed * 7919 + 13) >>> 0);
  return [r() * 256, r() * 256, r() * 256];
}

// ---------------------------------------------------------------- sphere grids

interface Grid { w: number; h: number; n: number; lat: Float64Array; sl: Float64Array; cl: Float64Array; lon: Float64Array; so: Float64Array; co: Float64Array }
const GRIDS = new Map<number, Grid>();
function grid(w: number): Grid {
  let g = GRIDS.get(w);
  if (g) return g;
  const h = w >> 1;
  const lat = new Float64Array(h), sl = new Float64Array(h), cl = new Float64Array(h);
  const lon = new Float64Array(w), so = new Float64Array(w), co = new Float64Array(w);
  for (let y = 0; y < h; y++) { lat[y] = 90 - ((y + 0.5) * 180) / h; sl[y] = Math.sin(lat[y] * D2R); cl[y] = Math.cos(lat[y] * D2R); }
  for (let x = 0; x < w; x++) { lon[x] = -180 + ((x + 0.5) * 360) / w; so[x] = Math.sin(lon[x] * D2R); co[x] = Math.cos(lon[x] * D2R); }
  g = { w, h, n: w * h, lat, sl, cl, lon, so, co };
  GRIDS.set(w, g);
  return g;
}

/** Bilinear upsample of an equirect field (wraps in longitude, clamps at the poles). */
function upsample(src: F32, sw: number, dw: number): F32 {
  if (sw === dw) return src;
  const sh = sw >> 1, dh = dw >> 1, out = new Float32Array(dw * dh), sc = sw / dw;
  const x0 = new Int32Array(dw), x1 = new Int32Array(dw), fx = new Float32Array(dw);
  for (let x = 0; x < dw; x++) {
    const s = (x + 0.5) * sc - 0.5, i = Math.floor(s);
    fx[x] = s - i; x0[x] = (i + sw) % sw; x1[x] = (i + 1) % sw;
  }
  for (let y = 0; y < dh; y++) {
    const s = (y + 0.5) * sc - 0.5, j = Math.floor(s), fy = s - j;
    const r0 = clamp(j, 0, sh - 1) * sw, r1 = clamp(j + 1, 0, sh - 1) * sw, o = y * dw;
    for (let x = 0; x < dw; x++) {
      const a = src[r0 + x0[x]], b = src[r0 + x1[x]], c = src[r1 + x0[x]], d = src[r1 + x1[x]], f = fx[x];
      const t = a + (b - a) * f, u = c + (d - c) * f;
      out[o + x] = t + (u - t) * fy;
    }
  }
  return out;
}

/** Bilinear sample of an equirect field at (lat, lon) degrees. */
function sampleF(f: F32, W: number, lat: number, lon: number): number {
  const H = W >> 1;
  const sx = ((wrapLon(lon) + 180) / 360) * W - 0.5, sy = ((90 - lat) / 180) * H - 0.5;
  const i = Math.floor(sx), j = Math.floor(sy), fx = sx - i, fy = sy - j;
  const xa = (i + W) % W, xb = (i + 1 + W) % W, ya = clamp(j, 0, H - 1) * W, yb = clamp(j + 1, 0, H - 1) * W;
  const t = f[ya + xa] + (f[ya + xb] - f[ya + xa]) * fx, u = f[yb + xa] + (f[yb + xb] - f[yb + xa]) * fx;
  return t + (u - t) * fy;
}

interface FbmOpt {
  /** Base frequency (lattice cells per unit radius). */
  f: number; oct: number; seed: number;
  gain?: number; lac?: number;
  /** 0 plain, 1 ridged (1-|n|)², 2 billow |n|. */
  kind?: number;
  /** Latitude-direction stretch (>1 → zonal streaks). */
  sy?: number;
  /** Skip octaves whose wavelength is below this many output pixels. */
  minPx?: number;
  /** Evaluate at most at this width, then upsample. */
  cap?: number;
}

/**
 * Multi-resolution fBm on the sphere: each octave is evaluated on the coarsest power-of-two grid that still
 * resolves it (≥3 px per wavelength) and the levels are summed by bilinear upsampling. Costs ≈1.3 noise
 * evaluations per output pixel regardless of octave count, and looks the same at every resolution.
 */
function fbm(w: number, o: FbmOpt): F32 {
  const gain = o.gain ?? 0.5, lac = o.lac ?? 2, kind = o.kind ?? 0, sy = o.sy ?? 1, minPx = o.minPx ?? 2;
  const top = Math.min(w, o.cap ?? 1024);
  let kmax = 0;
  while (top >> (kmax + 1) >= 32) kmax++;
  const lv: (F32 | null)[] = new Array(kmax + 1).fill(null);
  let amp = 1, fr = o.f, norm = 0;
  for (let i = 0; i < o.oct; i++, amp *= gain, fr *= lac) {
    norm += amp;
    const wl = top / (TAU * fr * Math.max(1, sy));
    if (wl < minPx) continue;
    const k = clamp(Math.floor(Math.log2(wl / 3)), 0, kmax), W = top >> k;
    const buf = (lv[k] ??= new Float32Array(W * (W >> 1)));
    const g = grid(W), [ox, oy, oz] = offsets(o.seed * 31 + i);
    for (let y = 0; y < g.h; y++) {
      const yy = g.sl[y] * fr * sy + oy, c = g.cl[y] * fr, row = y * W;
      for (let x = 0; x < W; x++) {
        let v = noise3(c * g.co[x] + ox, yy, c * g.so[x] + oz);
        if (kind === 1) { v = 1 - Math.abs(v) * 1.6; v = v < 0 ? 0 : v * v; } else if (kind === 2) v = Math.abs(v) * 2;
        buf[row + x] += v * amp;
      }
    }
  }
  let acc: F32 | null = null, aw = 0;
  for (let k = kmax; k >= 0; k--) {
    const W = top >> k, l = lv[k];
    if (acc) { acc = upsample(acc, aw, W); if (l) for (let j = 0; j < acc.length; j++) acc[j] += l[j]; } else acc = l;
    aw = W;
  }
  if (!acc) acc = new Float32Array(top * (top >> 1));
  const inv = 1 / norm;
  for (let j = 0; j < acc.length; j++) acc[j] *= inv;
  return upsample(acc, top, w);
}

// ---------------------------------------------------------------- stamping primitives

const SPY = new Int32Array(8192), SPX = new Int32Array(8192), SPN = new Int32Array(8192);
/** Row spans (y, xStart, count) covering the cap of angular radius R (deg) around (lat, lon); returns the span count. */
function spans(g: Grid, lat: number, lon: number, R: number): number {
  const W = g.w, H = g.h, pxd = 360 / W;
  const y0 = Math.max(0, Math.floor(((90 - lat - R) / 180) * H) - 1), y1 = Math.min(H - 1, Math.ceil(((90 - lat + R) / 180) * H) + 1);
  const pole = lat + R >= 89 || lat - R <= -89 || R >= 89;
  const sR = Math.sin(Math.min(R, 89) * D2R);
  let k = 0;
  for (let y = y0; y <= y1; y++, k++) {
    const cl = g.cl[y];
    SPY[k] = y;
    if (pole || sR >= cl * 0.995) { SPX[k] = 0; SPN[k] = W; continue; }
    const dl = Math.asin(sR / cl) * R2D + 1.5 * pxd, n = Math.ceil(((2 * dl) / 360) * W) + 2;
    if (n >= W) { SPX[k] = 0; SPN[k] = W; continue; }
    let xs = Math.floor(((lon - dl + 180) / 360) * W) % W;
    if (xs < 0) xs += W;
    SPX[k] = xs; SPN[k] = n;
  }
  return k;
}

const EXP = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) EXP[i] = Math.exp(-i / 256);
/** Fast exp(-x) for x ≥ 0. */
const ex = (x: number) => (x >= 16 ? 0 : EXP[(x * 256) | 0]);

interface Frame { cx: number; cy: number; cz: number; ex: number; ez: number; nx: number; ny: number; nz: number }
function frame(lat: number, lon: number): Frame {
  const sl = Math.sin(lat * D2R), cl = Math.cos(lat * D2R), so = Math.sin(lon * D2R), co = Math.cos(lon * D2R);
  return { cx: cl * co, cy: sl, cz: cl * so, ex: -so, ez: co, nx: -sl * co, ny: cl, nz: -sl * so };
}

interface Blob {
  lat: number; lon: number;
  /** Semi-axes in degrees (a along the rotated east axis, b along rotated north). */
  a: number; b?: number;
  /** Rotation (deg, counter-clockwise from east). */
  rot?: number;
  v?: number;
  /** Edge softness as a fraction of the radius (plateau shapes). */
  e?: number;
  /** Gaussian dome instead of a plateau. */
  g?: boolean;
}

/** Stamp elliptical blobs into field f (mode 0 = max, 1 = add, 2 = min with 1-v). */
function stamp(W: number, f: F32, blobs: Blob[], mode = 0) {
  const g = grid(W), co = g.co, so = g.so;
  for (const s of blobs) {
    const a = s.a, b = s.b ?? a, R = Math.max(a, b) * (s.g ? 1.6 : 1.02);
    if (R * W < 90) continue; // < 0.25 px
    const F = frame(s.lat, s.lon), rt = (s.rot ?? 0) * D2R, cr = Math.cos(rt), sr = Math.sin(rt);
    const ux = F.ex * cr + F.nx * sr, uy = F.ny * sr, uz = F.ez * cr + F.nz * sr;
    const vx = -F.ex * sr + F.nx * cr, vy = F.ny * cr, vz = -F.ez * sr + F.nz * cr;
    const ia = 1 / Math.tan(Math.min(a, 80) * D2R), ib = 1 / Math.tan(Math.min(b, 80) * D2R);
    const v = s.v ?? 1, e0 = 1 - (s.e ?? 0.35), ie = 1 / (1 - e0), gs = !!s.g, cosR = Math.cos(Math.min(R, 89) * D2R);
    const ns = spans(g, s.lat, s.lon, R);
    for (let q = 0; q < ns; q++) {
      const y = SPY[q], sl = g.sl[y], cl = g.cl[y], row = y * W, n = SPN[q];
      let x = SPX[q];
      for (let k = 0; k < n; k++, x++) {
        if (x === W) x = 0;
        const px = cl * co[x], pz = cl * so[x];
        const d = px * F.cx + sl * F.cy + pz * F.cz;
        if (d < cosR) continue;
        const X = ((px * ux + sl * uy + pz * uz) / d) * ia, Y = ((px * vx + sl * vy + pz * vz) / d) * ib;
        const r2 = X * X + Y * Y;
        let val: number;
        if (gs) val = v * ex(r2 * 2.2);
        else {
          if (r2 >= 1) continue;
          const r = Math.sqrt(r2);
          if (r <= e0) val = v; else { const t = (r - e0) * ie; val = v * (1 - t * t * (3 - 2 * t)); }
        }
        const i = row + x;
        if (mode === 0) { if (val > f[i]) f[i] = val; } else if (mode === 1) f[i] += val; else { const m = 1 - val; if (m < f[i]) f[i] = m; }
      }
    }
  }
}

/** Densely sample a polyline (lat/lon degrees) into blobs of the given radius. */
function path(pts: [number, number][], r: number, v = 1, g = false, step = 0.45): Blob[] {
  const out: Blob[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [la0, lo0] = pts[i], [la1, lo1] = pts[i + 1], dlo = wrapLon(lo1 - lo0);
    const len = Math.hypot(la1 - la0, dlo * Math.cos(((la0 + la1) / 2) * D2R));
    const n = Math.max(1, Math.ceil(len / (r * step)));
    for (let k = 0; k < n; k++) { const t = k / n; out.push({ lat: la0 + (la1 - la0) * t, lon: wrapLon(lo0 + dlo * t), a: r, v, g, e: 0.6 }); }
  }
  const [la, lo] = pts[pts.length - 1];
  out.push({ lat: la, lon: lo, a: r, v, g, e: 0.6 });
  return out;
}

/** Path along a slowly turning great circle: start, bearing (deg clockwise from north), length (deg), curvature (deg of turn per deg). */
function arc(lat: number, lon: number, bearing: number, len: number, curve: number, step: number): [number, number][] {
  const pts: [number, number][] = [];
  let la = lat * D2R, lo = lon * D2R, br = bearing * D2R;
  const n = Math.max(2, Math.ceil(len / step)), d = (len / n) * D2R;
  for (let i = 0; i <= n; i++) {
    pts.push([la * R2D, wrapLon(lo * R2D)]);
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
    const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    const back = Math.atan2(Math.sin(lo - lo2) * Math.cos(la), Math.cos(la2) * Math.sin(la) - Math.sin(la2) * Math.cos(la) * Math.cos(lo - lo2));
    br = back + Math.PI + curve * (len / n) * D2R;
    la = la2; lo = lo2;
  }
  return pts;
}

// ---------------------------------------------------------------- craters

interface Crater {
  lat: number; lon: number;
  /** Radius in degrees of arc. */
  r: number;
  /** Depth and rim height in height units. */
  d: number; rim: number;
  /** Freshness 0..1 (bright floor/ejecta). */
  f: number;
  /** Central peak height (fraction of depth). */
  pk?: number;
  /** Flat-floor fraction of the radius. */
  fl?: number;
  /** Ray length in crater radii (rayed craters). */
  ray?: number;
  /** Flooded floor albedo (replaces albedo inside). */
  fill?: number;
  /** Extra concentric ring radii (in crater radii) for multi-ring basins. */
  rings?: number[];
  /** Albedo tint added inside the crater (e.g. bright Valhalla / dark Tsiolkovskiy). */
  tint?: number;
  seed?: number;
}

interface CraterLook { rim: number; floor: number; fresh: number; ray: number; halo?: number }

const RAY_BINS = 256;
const RS = new Float32Array(RAY_BINS), RL = new Float32Array(RAY_BINS);

function stampCraters(W: number, hg: F32, al: F32 | null, list: Crater[], k: CraterLook) {
  const g = grid(W), pxd = 360 / W, co = g.co, so = g.so;
  const halo = k.halo ?? 1, kRim = k.rim, kFloor = k.floor, kFresh = k.fresh;
  for (const c of list) {
    if (c.r < pxd * 0.55) continue;
    let ext = c.r > 8 ? 1.35 : 1.45;
    if (c.rings) for (const q of c.rings) ext = Math.max(ext, q + 0.25);
    if (c.ray) ext = Math.max(ext, c.ray);
    const R = Math.min(c.r * ext, 175), fall = 3 / ((c.r > 8 ? 1.35 : 1.45) - 1);
    const F = frame(c.lat, c.lon), cosR = Math.cos(R * D2R), inv = 1 / (2 * Math.sin((c.r * D2R) / 2));
    const fl = c.fl ?? clamp(0.1 + c.r * 0.06, 0.1, 0.55), ifl = 1 / (1 - fl);
    const d = c.d, rim = c.rim, pk = (c.pk ?? 0) * d, fr = c.f, rings = c.rings, fill = c.fill, tint = c.tint ?? 0;
    const ray = !!c.ray && !!al;
    if (ray) {
      RS.fill(0); RL.fill(1);
      const rnd = mulberry32(c.seed ?? ((c.lat * 1000 + c.lon * 7) | 0));
      const nr = 14 + ((rnd() * 18) | 0);
      for (let j = 0; j < nr; j++) {
        const az = rnd() * RAY_BINS, wd = 0.6 + rnd() * 2.2, st = 0.4 + rnd() * 0.6, ln = (c.ray as number) * (0.25 + rnd() * 0.75);
        for (let b = Math.floor(az - wd * 3); b <= az + wd * 3; b++) {
          const q = st * Math.exp(-((b - az) * (b - az)) / (wd * wd)), bi = (b + RAY_BINS) % RAY_BINS;
          if (q > RS[bi]) { RS[bi] = q; RL[bi] = ln; }
        }
      }
    }
    const aRim = al ? kRim : 0, aFresh = fr * kFresh, aHalo = aFresh * halo, aFloor = kFloor * (1 - fr), aRay = fr * k.ray;
    const ns = spans(g, c.lat, c.lon, R);
    for (let sp = 0; sp < ns; sp++) {
      const y = SPY[sp], sl = g.sl[y], cl = g.cl[y], row = y * W, n = SPN[sp];
      let x = SPX[sp];
      for (let q = 0; q < n; q++, x++) {
        if (x === W) x = 0;
        const px = cl * co[x], pz = cl * so[x];
        const dot = px * F.cx + sl * F.cy + pz * F.cz;
        if (dot < cosR) continue;
        const d2 = 2 - 2 * dot, t = d2 > 0 ? Math.sqrt(d2) * inv : 0, i = row + x;
        if (t < 1) {
          let s = t <= fl ? 0 : (t - fl) * ifl;
          s *= s;
          let h = -d + (d + rim) * s;
          const pkv = pk ? ex(t * t * 45) : 0;
          h += pk * pkv;
          if (fill !== undefined) {
            const m = t < 0.8 ? 1 : t > 0.97 ? 0 : (0.97 - t) / 0.17;
            hg[i] = mix(hg[i] * (0.25 + 0.75 * s) + h, -d * 0.7 + hg[i] * 0.05, m);
            if (al) al[i] = mix(al[i] + aRim * s * s, fill, m) + tint * m;
          } else {
            hg[i] = hg[i] * (0.25 + 0.75 * s) + h;
            if (al) al[i] += aFloor * (1 - s) + aRim * s * s + aFresh * (0.75 + 0.25 * s) + fr * 0.1 * pkv + tint * (1 - s * 0.5);
          }
        } else {
          const u = t - 1;
          let h = rim * ex(u * fall);
          let rs = 0;
          if (rings) for (const rr of rings) { const z = (t - rr) * 18; rs += ex(z * z); }
          hg[i] += h + rim * 0.8 * rs;
          if (al) {
            let a = aRim * ex(u * fall * 1.8) + aHalo * ex(u * fall * 0.65) + aRim * rs;
            if (ray) {
              const ea = px * F.ex + pz * F.ez, na = px * F.nx + sl * F.ny + pz * F.nz;
              const bi = (((Math.atan2(ea, na) / TAU + 1) * RAY_BINS) | 0) % RAY_BINS;
              const L = RL[bi];
              if (u < L) { const v = 1 - u / L; a += aRay * RS[bi] * v * v * (0.75 + 0.25 * Math.cos(u * 3.1 + bi)); }
            }
            al[i] += a;
          }
        }
      }
    }
  }
}

interface CraterGen {
  seed: number;
  /** Area fraction covered per factor-of-two size bin (0.3 ≈ heavily cratered highlands). */
  cover: number;
  rMin: number; rMax: number;
  /** Depth = dk · r^0.62 (r in degrees). */
  dk: number;
  /** Freshness exponent (higher → fewer bright young craters). */
  fp?: number;
  /** Probability of keeping a crater at (lat, lon, r). */
  keep?: (lat: number, lon: number, r: number) => number;
  /** Fraction of the freshest craters that get rays. */
  rays?: number;
  /** Smallest crater radius in output pixels (default 1.1). */
  minPx?: number;
}

/**
 * Power-law (N(>r) ∝ r⁻²) crater population, generated per factor-of-two size bin (each bin has its own
 * seed, so the list is identical at every resolution apart from the sub-pixel bins that are skipped). Largest first.
 */
function genCraters(w: number, o: CraterGen): Crater[] {
  const A = (2 * o.cover) / Math.LN2, cut = (360 / w) * (o.minPx ?? 1.1), fp = o.fp ?? 10;
  const out: Crater[] = [];
  const nb = Math.ceil(Math.log2(o.rMax / o.rMin));
  for (let b = nb - 1; b >= 0; b--) {
    const r0 = o.rMin * 2 ** b, r1 = Math.min(o.rMax, r0 * 2);
    if (r1 < cut) continue;
    const r0r = r0 * D2R, r1r = r1 * D2R, N = Math.round(A / (r0r * r0r) - A / (r1r * r1r));
    const rnd = mulberry32(o.seed * 977 + b * 131 + 7), q = 1 - (r0 / r1) ** 2;
    for (let i = 0; i < N; i++) {
      const u1 = rnd(), u2 = rnd(), u3 = rnd(), u4 = rnd(), u5 = rnd();
      const r = r0 / Math.sqrt(1 - u1 * q);
      if (r < cut) continue;
      const lat = Math.asin(2 * u2 - 1) * R2D, lon = u3 * 360 - 180;
      if (o.keep && u5 > o.keep(lat, lon, r)) continue;
      const f = u4 ** fp * clamp(1.6 - r / 4, 0.1, 1);
      const d = o.dk * r ** 0.62 * (0.5 + 0.5 * Math.sqrt(f + 0.1));
      const c: Crater = { lat, lon, r, d, rim: d * (0.22 + 0.2 * f), f, pk: r > 0.9 ? 0.45 : 0, seed: i + b * 100003 };
      if (o.rays && f > 1 - o.rays && r > cut * 2) c.ray = 6 + 6 * f;
      out.push(c);
    }
  }
  return out;
}
// ---------------------------------------------------------------- output helpers

interface Canvas { w: number; h: number; n: number; R: F32; G: F32; B: F32 }
function canvas(w: number): Canvas { const n = w * (w >> 1); return { w, h: w >> 1, n, R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n) }; }
function finish(c: Canvas, hg: F32 | null, hScale = 127): BodyMaps {
  const color = new Uint8ClampedArray(c.n * 4);
  for (let i = 0, j = 0; i < c.n; i++, j += 4) { color[j] = c.R[i]; color[j + 1] = c.G[i]; color[j + 2] = c.B[i]; color[j + 3] = 255; }
  let height: Uint8Array | null = null;
  if (hg) {
    height = new Uint8Array(c.n);
    for (let i = 0; i < c.n; i++) height[i] = clamp(Math.round(128 + hg[i] * hScale), 0, 255);
  }
  return { w: c.w, h: c.h, color, height };
}

/** Height-gradient shading baked lightly into albedo maps so relief reads even under flat light. */
function bakeRelief(c: Canvas, hg: F32, amt: number) {
  const W = c.w, H = c.h, k = amt * (W / 1024);
  for (let y = 0; y < H; y++) {
    const yu = Math.max(0, y - 1) * W, yd = Math.min(H - 1, y + 1) * W, row = y * W;
    for (let x = 0; x < W; x++) {
      const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1;
      const s = clamp(1 + ((hg[row + xr] - hg[row + xl]) * 0.6 + (hg[yd + x] - hg[yu + x])) * k, 0.6, 1.4), i = row + x;
      c.R[i] *= s; c.G[i] *= s; c.B[i] *= s;
    }
  }
}

// ---------------------------------------------------------------- Moon

type Poly = [number, number][];
/** Scanline-fill a [lat, lon] polygon (may cross ±180) into f with value v (max). */
function poly(W: number, f: F32, pts: Poly, v = 1) {
  const H = W >> 1, n = pts.length, la = new Float64Array(n), lo = new Float64Array(n);
  let min = 90, max = -90;
  for (let i = 0; i < n; i++) {
    la[i] = pts[i][0]; lo[i] = i ? lo[i - 1] + wrapLon(pts[i][1] - pts[i - 1][1]) : pts[i][1];
    min = Math.min(min, la[i]); max = Math.max(max, la[i]);
  }
  const xs: number[] = [];
  const y0 = Math.max(0, Math.floor(((90 - max) / 180) * H)), y1 = Math.min(H - 1, Math.ceil(((90 - min) / 180) * H));
  for (let y = y0; y <= y1; y++) {
    const L = 90 - ((y + 0.5) * 180) / H;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if ((la[i] > L) !== (la[j] > L)) xs.push(lo[j] + ((L - la[j]) / (la[i] - la[j])) * (lo[i] - lo[j]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(((xs[k] + 180) / 360) * W - 0.5), xb = Math.round(((xs[k + 1] + 180) / 360) * W - 0.5);
      for (let x = xa; x <= xb; x++) { const i = y * W + (((x % W) + W) % W); if (v > f[i]) f[i] = v; }
    }
  }
}

/** Box blur (separable, wraps in longitude), radius in pixels, applied `it` times. */
function blur(W: number, f: F32, r: number, it = 2): F32 {
  const H = W >> 1, tmp = new Float32Array(f.length), k = 1 / (2 * r + 1);
  for (let pass = 0; pass < it; pass++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let s = 0;
      for (let d = -r; d <= r; d++) s += f[row + ((d + W) % W)];
      for (let x = 0; x < W; x++) { tmp[row + x] = s * k; s += f[row + ((x + r + 1) % W)] - f[row + ((x - r + W) % W)]; }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[clamp(d, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) { f[y * W + x] = s * k; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
    }
  }
  return f;
}

const MOON_POLYS: Poly[] = [
  // Mare Frigoris
  [[49, -46], [55, -33], [58, -12], [60, 10], [60, 30], [58, 42], [55, 46], [54, 34], [55, 14], [53, -2], [52, -16], [49, -30], [46, -42]],
  // Mare Imbrium (+ Sinus Iridum)
  [[48, -36], [48, -26], [47, -8], [44, -2], [38, 1], [30, 1], [24, -2], [19, -10], [16, -20], [17, -31], [23, -39], [32, -43], [42, -40]],
  // Oceanus Procellarum
  [[57, -56], [51, -70], [42, -76], [30, -73], [20, -72], [10, -67], [0, -64], [-8, -56], [-15, -48], [-19, -40], [-12, -34], [-3, -31], [5, -27],
    [12, -30], [18, -36], [26, -40], [36, -44], [46, -42], [52, -46]],
  // Mare Insularum + Sinus Aestuum
  [[16, -31], [15, -20], [14, -12], [15, -6], [10, -4], [6, -12], [2, -18], [-2, -24], [-5, -31], [4, -36], [10, -38]],
  // Mare Cognitum + Nubium
  [[-5, -30], [-7, -20], [-11, -13], [-15, -7], [-22, -5], [-28, -9], [-30, -17], [-28, -25], [-22, -29], [-16, -33], [-10, -34]],
  // Mare Humorum
  [[-18, -39], [-19, -34], [-24, -32], [-29, -35], [-30, -41], [-26, -45], [-20, -44]],
  // Mare Vaporum, Sinus Medii
  [[17, 0], [16, 8], [11, 9], [8, 4], [10, -2], [14, -4]],
  [[5, -4], [4, 5], [0, 6], [-1, -1], [2, -5]],
  // Mare Serenitatis + Lacus Somniorum + Lacus Mortis
  [[38, 13], [39, 22], [37, 28], [40, 33], [37, 37], [33, 32], [30, 29], [23, 28], [18, 22], [17, 15], [20, 8], [27, 6], [33, 7]],
  [[47, 24], [47, 30], [43, 30], [43, 24]],
  // Mare Tranquillitatis
  [[20, 24], [17, 30], [17, 35], [12, 41], [6, 46], [1, 45], [-3, 41], [-2, 34], [-4, 29], [-1, 22], [3, 19], [8, 17], [13, 18]],
  // Mare Fecunditatis
  [[4, 46], [3, 52], [-1, 58], [-9, 60], [-17, 59], [-22, 54], [-18, 49], [-12, 47], [-5, 43]],
  // Mare Nectaris
  [[-10, 33], [-11, 38], [-16, 40], [-21, 37], [-19, 32], [-14, 31]],
  // Mare Crisium
  [[24, 55], [24, 62], [20, 68], [13, 68], [9, 63], [10, 55], [14, 51], [20, 51]],
  // Spumans, Undarum, Marginis, Smythii, Humboldtianum, Australe, Orientale core, Moscoviense, Ingenii, Grimaldi
  [[3, 63], [3, 67], [-1, 67], [-1, 63]], [[9, 66], [9, 72], [5, 72], [5, 66]],
  [[18, 82], [18, 90], [9, 92], [7, 85], [12, 82]], [[6, 82], [6, 92], [-4, 93], [-4, 83]], [[60, 75], [60, 87], [54, 87], [54, 76]],
  [[-34, 85], [-36, 96], [-44, 102], [-49, 92], [-44, 84]],
  [[-16, -96], [-16, -89], [-23, -89], [-23, -97]], [[30, 144], [30, 151], [24, 151], [24, 144]],
  [[-31, 161], [-32, 166], [-36, 166], [-36, 160]], [[-3, -71], [-3, -66], [-8, -66], [-8, -71]],
];
// Bright highland islands inside the maria (value subtracted): Aristarchus plateau, Montes Apenninus/Carpathus, Fra Mauro, Ptolemaeus
const MOON_HI: Blob[] = [
  { lat: 26, lon: -51, a: 4.5, b: 3, v: 0.8 }, { lat: 20, lon: -4, a: 2.5, b: 7, rot: -40, v: 0.9 }, { lat: 14.5, lon: -24, a: 6, b: 1.6, v: 0.6 },
  { lat: -6, lon: -17, a: 4, b: 3, v: 0.5 }, { lat: -9, lon: -2, a: 4, b: 4, v: 0.9 }, { lat: 6, lon: -20, a: 2.5, b: 2, v: 0.5 },
];

/** Named lunar craters & basins: [lat, lon, diameter km, fresh, rays (radii), flags]. */
const MOON_KM = 30.32;
function lunarNamed(): Crater[] {
  const L: Crater[] = [];
  const add = (lat: number, lon: number, km: number, o: Partial<Crater> = {}) => {
    const r = km / 2 / MOON_KM, d = o.d ?? 0.16 * r ** 0.62;
    L.push({ lat, lon, r, d, rim: o.rim ?? d * 0.3, f: 0, pk: r > 0.9 ? 0.45 : 0, seed: (lat * 100 + lon) | 0, ...o });
  };
  // basins (big, old; under maria)
  add(-53, -169, 2500, { d: 0.32, rim: 0.06, fl: 0.6, pk: 0 });          // South Pole–Aitken
  add(32.8, -15.6, 1146, { d: 0.3, rim: 0.12, fl: 0.7, pk: 0 });          // Imbrium
  add(28, 17.5, 707, { d: 0.25, rim: 0.1, fl: 0.7, pk: 0 });              // Serenitatis
  add(17, 59.1, 556, { d: 0.3, rim: 0.12, fl: 0.7, pk: 0, rings: [1.35] }); // Crisium
  add(-15.2, 35.5, 860, { d: 0.2, rim: 0.1, fl: 0.5, pk: 0, rings: [0.45] }); // Nectaris
  add(-24.4, -38.6, 425, { d: 0.22, rim: 0.1, fl: 0.7, pk: 0 });          // Humorum
  add(-19.4, -92.8, 930, { d: 0.25, rim: 0.14, fl: 0.25, pk: 0, rings: [0.35, 0.68] }); // Orientale
  add(27.3, 147.9, 445, { d: 0.22, rim: 0.1, fl: 0.6, pk: 0 });          // Moscoviense
  add(2.6, -128.7, 570, { d: 0.2, rim: 0.1, fl: 0.5, rings: [0.5] });    // Hertzsprung
  add(-4, -157.4, 437, { d: 0.2, rim: 0.1, fl: 0.5, rings: [0.5] });     // Korolev
  add(-36.1, -151.8, 538, { d: 0.22, rim: 0.1, fl: 0.5, rings: [0.5] }); // Apollo
  add(5.7, 140.9, 313, { d: 0.18, rim: 0.08, fl: 0.5 });                  // Mendeleev
  // large classic craters
  add(-58.4, -14.4, 231, { f: 0.05 });                                     // Clavius
  add(-9.3, -1.9, 153, { fill: 0.5, pk: 0 });                             // Ptolemaeus
  add(-13.4, -3.2, 108, {}); add(-18.2, -1.9, 96, { f: 0.1 });           // Alphonsus, Arzachel
  add(51.6, -9.4, 101, { fill: 0.28, pk: 0 });                            // Plato
  add(29.7, -4.0, 83, { fill: 0.36, pk: 0 });                              // Archimedes
  add(14.5, -11.3, 58, { f: 0.3 });                                        // Eratosthenes
  add(-5.5, -68.3, 172, { fill: 0.27, pk: 0 });                            // Grimaldi
  add(-8.9, 61.1, 132, { f: 0.35 }); add(-11.4, 26.4, 100, { f: 0.3 });   // Langrenus, Theophilus
  add(-25.1, 60.4, 177, { f: 0.15 }); add(53.9, 57, 123, { fill: 0.3, pk: 0 }); // Petavius, Endymion
  add(-44.3, -55, 227, { fill: 0.48 });                                    // Schickard
  add(-20.4, 129.1, 185, { fill: 0.28 });                                  // Tsiolkovskiy
  // young rayed craters
  add(-43.3, -11.4, 86, { f: 1.3, ray: 28 });                              // Tycho
  add(9.6, -20.1, 93, { f: 0.9, ray: 14 });                                // Copernicus
  add(8.1, -38.0, 31, { f: 0.95, ray: 16 });                               // Kepler
  add(23.7, -47.4, 40, { f: 1.2, ray: 9 });                                // Aristarchus
  add(16.1, 46.8, 28, { f: 0.9, ray: 12 });                                // Proclus
  add(35.9, 102.8, 22, { f: 1, ray: 22 });                                 // Giordano Bruno
  add(22.4, -163.1, 71, { f: 0.85, ray: 11 });                             // Jackson
  add(8.1, -77.6, 43, { f: 0.8, ray: 10 }); add(-24.5, -63.7, 19, { f: 0.8, ray: 12 }); // Glushko, Byrgius A
  add(-33.4, 5.0, 20, { f: 0.7, ray: 10 });                                // (Stöfler/Tycho-area fresh)
  add(-5.0, -33.0, 11, { f: 0.7, ray: 10 });                               // Lansberg-area
  return L;
}

function paintMoon(w: number): BodyMaps {
  const c = canvas(w), n = c.n, Wm = Math.min(w, 512);
  const maria = new Float32Array(Wm * (Wm >> 1));
  for (const p of MOON_POLYS) poly(Wm, maria, p);
  const hi = new Float32Array(maria.length);
  stamp(Wm, hi, MOON_HI);
  for (let i = 0; i < maria.length; i++) maria[i] = Math.max(0, maria[i] - hi[i]);
  blur(Wm, maria, 2);
  const mU = upsample(maria, Wm, w);
  const n1 = fbm(w, { f: 3, oct: 10, seed: 11, gain: 0.55 });
  const n2 = fbm(w, { f: 1.1, oct: 4, seed: 12, cap: 256 });
  const n3 = fbm(w, { f: 6, oct: 3, seed: 13, cap: 512 });
  const hg = new Float32Array(n), al = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = sstep(0.36, 0.56, mU[i] + n1[i] * 1.1 + n3[i] * 0.7);
    mU[i] = m;
    hg[i] = mix(n1[i] * 0.35 + n2[i] * 0.4, -0.12 + n1[i] * 0.04, m);
    al[i] = mix(0.62 + n2[i] * 0.3 + n1[i] * 0.3, 0.37 + n2[i] * 0.45 + n3[i] * 0.4 + n1[i] * 0.25, mU[i]);
  }
  const keep = (lat: number, lon: number, r: number) => {
    const m = sampleF(maria, Wm, lat, lon);
    return m > 0.4 ? (r > 0.8 ? 0.04 : r > 0.3 ? 0.15 : 0.35) : 1;
  };
  stampCraters(w, hg, al, genCraters(w, { seed: 101, cover: 0.24, rMin: 0.13, rMax: 6, dk: 0.13, keep, rays: 0.01, fp: 14 }), { rim: 0.035, floor: -0.03, fresh: 0.16, ray: 0.18, halo: 0.6 });
  stampCraters(w, hg, al, lunarNamed(), { rim: 0.04, floor: -0.03, fresh: 0.25, ray: 0.42 });
  for (let i = 0; i < n; i++) {
    const a = clamp(al[i], 0.1, 1.1), m = mU[i];
    const bl = m * clamp(0.5 - n2[i] * 3, 0, 1);
    c.R[i] = a * mix(232, 214, bl); c.G[i] = a * mix(226, 218, bl); c.B[i] = a * mix(216, 226, bl);
  }
  bakeRelief(c, hg, 0.6);
  return finish(c, hg, 110);
}

// ---------------------------------------------------------------- generic helpers for rocky / icy bodies

type Named = [number, number, number, Partial<Crater>?];
/** Named craters [lat, lon, diameter km, overrides] → Crater list (kmDeg = km per degree of arc). */
function named(kmDeg: number, rows: Named[], dk = 0.16): Crater[] {
  return rows.map(([lat, lon, km, o]) => {
    const r = km / 2 / kmDeg, d = o?.d ?? dk * r ** 0.62;
    return { lat, lon, r, d, rim: o?.rim ?? d * 0.3, f: 0, pk: r > 0.9 ? 0.45 : 0, seed: (lat * 100 + lon * 3) | 0, ...o };
  });
}

/** Write albedo × tint into the canvas, optionally mixing toward a second tint by t (0..1). */
function tint(c: Canvas, al: F32, a: RGB, b?: RGB, t?: F32 | null, lo = 0.03, hi = 1.3) {
  for (let i = 0; i < c.n; i++) {
    const v = clamp(al[i], lo, hi), m = t ? t[i] : 0;
    if (b && m) { c.R[i] = v * mix(a[0], b[0], m); c.G[i] = v * mix(a[1], b[1], m); c.B[i] = v * mix(a[2], b[2], m); } else { c.R[i] = v * a[0]; c.G[i] = v * a[1]; c.B[i] = v * a[2]; }
  }
}

/** Soft plains mask from blobs/polygons rasterised at ≤512 and upsampled, with noisy edges. */
function regions(w: number, blobs: Blob[], polys: Poly[], edge: F32 | null, amt = 0.6, lo = 0.4, hi = 0.6, br = 2, conf = false): F32 {
  // broad, soft shapes are rasterised at 256 px (their detail comes from the full-res edge noise)
  const Wm = Math.min(w, br >= 4 ? 256 : 512), f = new Float32Array(Wm * (Wm >> 1));
  if (Wm === 256 && w > 256) br = Math.round(br / 2);
  if (blobs.length) stamp(Wm, f, blobs);
  for (const p of polys) poly(Wm, f, p);
  if (br) blur(Wm, f, br);
  const u = upsample(f, Wm, w);
  // conf: edge noise only acts near the shapes (no stray specks far away)
  for (let i = 0; i < u.length; i++) u[i] = sstep(lo, hi, u[i] + (edge ? edge[i] * amt * (conf ? sstep(0, 0.12, u[i]) : 1) : 0));
  return u;
}

// ---------------------------------------------------------------- Mercury

const MERCURY_KM = 42.6;
function paintMercury(w: number): BodyMaps {
  const c = canvas(w), n = c.n;
  const n1 = fbm(w, { f: 3, oct: 10, seed: 21, gain: 0.55 }), n2 = fbm(w, { f: 1.2, oct: 4, seed: 22, cap: 256 });
  // smooth plains: Borealis Planitia, Caloris interior + exterior plains, Suisei/Odin/Tir Planitiae
  const plains = regions(w, [
    { lat: 72, lon: -60, a: 22, b: 13 }, { lat: 70, lon: 20, a: 25, b: 12 }, { lat: 66, lon: 120, a: 18, b: 10 }, { lat: 80, lon: -150, a: 14, b: 8 },
    { lat: 31, lon: 162, a: 14, b: 14 }, { lat: 25, lon: -175, a: 9, b: 12 }, { lat: 40, lon: 140, a: 8, b: 6 }, { lat: 8, lon: 172, a: 8, b: 6 },
    { lat: 59, lon: -150, a: 10, b: 6 }, { lat: 25, lon: -30, a: 8, b: 6, v: 0.8 }, { lat: 0, lon: 105, a: 9, b: 6, v: 0.8 },
  ], [], n1, 2.2, 0.35, 0.65, 4);
  const hg = new Float32Array(n), al = new Float32Array(n), dark = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = plains[i];
    dark[i] = clamp(0.15 - n2[i] * 2.5, 0, 0.55) * (1 - p);
    hg[i] = mix(n1[i] * 0.4 + n2[i] * 0.4, -0.05 + n1[i] * 0.05, p);
    al[i] = 0.56 + n2[i] * 0.25 + n1[i] * 0.3 + p * 0.04 - dark[i] * 0.1;
  }
  const keep = (lat: number, lon: number, r: number) => {
    const ct = 1 - 0.85 * sstep(0.3, 0.6, sampleF(plains, w, lat, lon));
    return r > 0.5 ? ct : Math.max(ct, 0.35);
  };
  stampCraters(w, hg, al, genCraters(w, { seed: 202, cover: 0.2, rMin: 0.1, rMax: 5, dk: 0.12, keep, rays: 0.012, fp: 13 }), { rim: 0.035, floor: -0.02, fresh: 0.2, ray: 0.2, halo: 0.6 });
  stampCraters(w, hg, al, named(MERCURY_KM, [
    [31, 162, 1550, { d: 0.18, rim: 0.16, fl: 0.82, pk: 0, tint: 0.05, rings: [1.12] }], // Caloris
    [-33.2, 87.5, 715, { d: 0.2, rim: 0.1, fl: 0.6, pk: 0, rings: [0.6] }],           // Rembrandt
    [-20.8, -123.6, 630, { d: 0.18, rim: 0.1, fl: 0.6, pk: 0 }], [-16.3, -164.4, 390, { d: 0.16, fl: 0.6, pk: 0 }], // Beethoven, Tolstoj
    [27.6, 57.6, 290, { fl: 0.5, rings: [0.5], tint: 0.06 }], [27.3, 119.1, 263, { fl: 0.5, rings: [0.5], f: 0.4 }], // Rachmaninoff, Raditladi
    [-46, 25, 400, { d: 0.12 }], [-3, 10, 280, {}], [12, -95, 200, {}], [-60, -100, 300, { d: 0.14 }], [-65, 150, 250, {}],
    [57.8, 16.8, 95, { f: 1.3, ray: 40 }],                                              // Hokusai
    [-11.3, -31.1, 62, { f: 1.1, ray: 18 }], [-33.9, -12.5, 80, { f: 1.2, ray: 24 }],   // Kuiper, Debussy
    [37.1, -127, 60, { f: 0.9, ray: 14 }], [-32.3, -170, 80, { f: 0.4, tint: -0.15 }],  // Degas, Bashō (dark halo)
    [-47.7, 158.6, 36, { f: 1, ray: 14 }], [9.7, -151, 50, { f: 0.9, ray: 12 }],         // Han Kan-ish fresh, Bartók-ish
  ]), { rim: 0.035, floor: -0.02, fresh: 0.22, ray: 0.35 });
  tint(c, al, [200, 193, 184], [160, 164, 172], dark, 0.08, 1.2);
  bakeRelief(c, hg, 0.6);
  return finish(c, hg, 110);
}

// ---------------------------------------------------------------- Ceres

const CERES_KM = 8.25;
function paintCeres(w: number): BodyMaps {
  const c = canvas(w), n = c.n;
  const n1 = fbm(w, { f: 3, oct: 10, seed: 31, gain: 0.55 }), n2 = fbm(w, { f: 1.4, oct: 4, seed: 32, cap: 256 });
  const hg = new Float32Array(n), al = new Float32Array(n);
  for (let i = 0; i < n; i++) { hg[i] = n1[i] * 0.5 + n2[i] * 0.6; al[i] = 0.62 + n2[i] * 0.25 + n1[i] * 0.2; }
  stampCraters(w, hg, al, genCraters(w, { seed: 303, cover: 0.24, rMin: 0.25, rMax: 9, dk: 0.13, rays: 0.006, fp: 14 }), { rim: 0.03, floor: -0.03, fresh: 0.25, ray: 0.15, halo: 0.6 });
  stampCraters(w, hg, al, named(CERES_KM, [
    [-10.8, 124, 284, { d: 0.12, fl: 0.7, pk: 0 }], [-42.6, -67.5, 260, { fl: 0.6 }], [-46.3, -110.7, 170, { pk: 0.6 }], // Kerwan, Yalode, Urvara
    [19.86, -121.15, 92, { f: 0.5, fl: 0.6 }],                                          // Occator
    [5.8, 10.8, 34, { f: 1.3, ray: 10 }], [42.2, 0.4, 9, { f: 1.5, ray: 6 }],           // Haulani, Oxo
    [-55, -125, 126, {}], [33, 70, 160, { d: 0.1 }], [-28, 160, 120, {}], [15, -165, 80, { f: 0.3 }], // Dantu-ish, Ernutet, ...
    [24.3, 138.2, 126, { f: 0.5 }],                                                      // Dantu
  ]), { rim: 0.03, floor: -0.03, fresh: 0.3, ray: 0.3 });
  // Ahuna Mons and the Occator faculae
  const mt = new Float32Array(n);
  stamp(w, mt, [{ lat: -10.5, lon: -43.8, a: 1.1, b: 0.9, g: true }]);
  const fac = new Float32Array(n);
  stamp(w, fac, [
    { lat: 19.8, lon: -120.6, a: 1.4, b: 1.3, e: 0.7 }, { lat: 19.9, lon: -120.6, a: 0.5, e: 0.4, v: 1 },
    { lat: 20.4, lon: -118.4, a: 0.8, b: 0.5, e: 0.8, v: 0.75 }, { lat: 19.2, lon: -117.8, a: 0.5, b: 0.35, e: 0.8, v: 0.6 }, { lat: 21.1, lon: -117.4, a: 0.4, e: 0.8, v: 0.5 },
    { lat: -10.5, lon: -43.8, a: 0.5, b: 1.2, rot: 30, e: 0.9, v: 0.35 }, // Ahuna's bright streaks
  ]);
  for (let i = 0; i < n; i++) { hg[i] += mt[i] * 0.9; al[i] = mix(al[i], 2.6, fac[i]); }
  tint(c, al, [128, 124, 120], undefined, null, 0.1, 2.6);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

// ---------------------------------------------------------------- Callisto

const CALLISTO_KM = 42.05;
function paintCallisto(w: number): BodyMaps {
  const c = canvas(w), n = c.n;
  const n1 = fbm(w, { f: 3, oct: 10, seed: 41, gain: 0.55 }), n2 = fbm(w, { f: 1.3, oct: 5, seed: 42, cap: 256 });
  const hg = new Float32Array(n), al = new Float32Array(n);
  for (let i = 0; i < n; i++) { hg[i] = n1[i] * 0.35 + n2[i] * 0.3; al[i] = 0.42 + n2[i] * 0.3 + n1[i] * 0.3; }
  // Saturated, degraded cratering; many small fresh bright craters
  stampCraters(w, hg, al, genCraters(w, { seed: 404, cover: 0.3, rMin: 0.12, rMax: 4, dk: 0.1, rays: 0.006, fp: 9 }), { rim: 0.06, floor: -0.06, fresh: 0.6, ray: 0.3, halo: 0.35 });
  const ringsV: number[] = [], ringsA: number[] = [];
  for (let k = 0; k < 14; k++) ringsV.push(1.6 + k * 0.33 + 0.08 * Math.sin(k * 2.3));
  for (let k = 0; k < 8; k++) ringsA.push(1.5 + k * 0.32);
  stampCraters(w, hg, al, named(CALLISTO_KM, [
    [14.7, -56, 300, { d: 0.05, rim: 0.12, fl: 0.2, pk: 0, tint: 0.3, rings: ringsV.map((r) => r * 2) }], // Valhalla
    [32, -140, 220, { d: 0.05, rim: 0.1, fl: 0.2, pk: 0, tint: 0.2, rings: ringsA.map((r) => r * 1.8) }],  // Asgard
    [-40, 30, 200, { d: 0.05, tint: 0.25 }], [60, 100, 300, { d: 0.05, tint: 0.15 }],    // Adlinda-ish, Utgard-ish
    [12, -86, 60, { f: 1.2, ray: 14 }], [-33, 152, 80, { f: 1, ray: 12 }],               // Bran-like fresh rayed craters
    [-60, -80, 50, { f: 1.1, ray: 10 }], [45, 30, 40, { f: 1, ray: 9 }],
  ]), { rim: 0.12, floor: -0.04, fresh: 0.8, ray: 0.45 });
  const glow = new Float32Array(n);
  stamp(w, glow, [{ lat: 14.7, lon: -56, a: 9, v: 0.9, g: true }, { lat: 32, lon: -140, a: 6, v: 0.5, g: true }], 1);
  for (let i = 0; i < n; i++) al[i] += glow[i] * (1 + n1[i] * 2);
  tint(c, al, [150, 132, 112], undefined, null, 0.08, 2);
  bakeRelief(c, hg, 0.5);
  return finish(c, hg, 100);
}

// ---------------------------------------------------------------- Mars

const MARS_KM = 59.27;
const MARS_DARK: Poly[] = [
  // Syrtis Major
  [[24, 68], [19, 74], [10, 77], [2, 80], [-5, 83], [-11, 79], [-9, 67], [-4, 61], [3, 59], [11, 63], [17, 64]],
  // Sinus Sabaeus + Sinus Meridiani + Iapygia
  [[-1, -8], [3, -3], [1, 6], [-4, 18], [-6, 34], [-4, 50], [-3, 58], [-9, 66], [-15, 74], [-23, 72], [-21, 58], [-17, 45], [-15, 30], [-13, 15], [-11, 5], [-8, -5]],
  // Margaritifer Sinus + Mare Erythraeum
  [[-3, -22], [-7, -13], [-13, -12], [-21, -8], [-31, -12], [-39, -24], [-41, -45], [-35, -60], [-27, -63], [-21, -52], [-16, -42], [-10, -36], [-6, -29]],
  // Aurorae Sinus
  [[-11, -64], [-12, -50], [-18, -47], [-21, -58], [-17, -66]],
  // Mare Sirenum
  [[-24, -172], [-27, -152], [-30, -136], [-36, -126], [-41, -138], [-39, -158], [-35, -176]],
  // Mare Cimmerium
  [[-9, 132], [-14, 148], [-19, 166], [-24, 180], [-35, 182], [-33, 160], [-28, 142], [-21, 128], [-13, 120]],
  // Mare Tyrrhenum
  [[-4, 98], [-8, 114], [-14, 124], [-21, 124], [-23, 108], [-18, 94], [-10, 88]],
  // Mare Acidalium + Niliacus Lacus
  [[60, -42], [57, -20], [50, -4], [42, -10], [36, -24], [33, -32], [40, -38], [50, -46]],
  // Utopia / Casius (moderately dark)
  [[58, 92], [55, 112], [48, 124], [40, 118], [38, 100], [44, 88]],
];
const MARS_DARK_BLOBS: Blob[] = [
  { lat: -25, lon: -86, a: 5, b: 3, v: 0.8 }, { lat: -28, lon: -95, a: 3, b: 2, v: 0.5 },          // Solis Lacus
  { lat: 12, lon: 162, a: 8, b: 3, rot: -15, v: 0.55 },                                             // Cerberus
  { lat: -60, lon: 0, a: 25, b: 5, v: 0.5 }, { lat: -58, lon: 120, a: 30, b: 5, v: 0.45 }, { lat: -62, lon: -120, a: 25, b: 4, v: 0.4 }, // Mare Australe
  { lat: -20, lon: -150, a: 10, b: 4, v: 0.45 }, { lat: 20, lon: 85, a: 4, b: 6, v: 0.5 },            // Memnonia, Nili
  { lat: 45, lon: 60, a: 6, b: 4, v: 0.4 }, { lat: 30, lon: 60, a: 5, b: 3, v: 0.5 },                  // Protonilus, Nilosyrtis
  { lat: -20, lon: 86, a: 6, b: 4, v: 0.6 }, { lat: -30, lon: 100, a: 10, b: 4, v: 0.45 }, { lat: -32, lon: -110, a: 12, b: 4, v: 0.35 }, // Iapygia–Tyrrhenum, Thaumasia
  { lat: -45, lon: 160, a: 14, b: 5, v: 0.4 }, { lat: -50, lon: -170, a: 12, b: 5, v: 0.4 }, { lat: -48, lon: 20, a: 14, b: 5, v: 0.5 }, // Mare Chronium, Hadriacum…
  { lat: 70, lon: 0, a: 40, b: 4, v: 0.5 }, { lat: 70, lon: 120, a: 40, b: 4, v: 0.5 }, { lat: 70, lon: -120, a: 40, b: 4, v: 0.5 }, // Mare Boreum collar
];
const VALLES: [number, number][] = [[-6.5, -102], [-7, -90], [-8.5, -78], [-10, -70], [-13, -62], [-13.5, -55], [-12, -48], [-10, -40], [-6, -33]];

function paintMars(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 10, seed: 51, gain: 0.55 }), n2 = fbm(w, { f: 1.4, oct: 5, seed: 52, cap: 256 });
  const n3 = fbm(w, { f: 5, oct: 4, seed: 53, cap: 512, kind: 1 });
  const dark = regions(w, MARS_DARK_BLOBS, MARS_DARK, n1, 2.4, 0.15, 0.85, 5);
  // relief: dichotomy, Tharsis rise, volcanoes, basins
  const up = new Float32Array(n);
  stamp(w, up, [
    { lat: -2, lon: -105, a: 28, b: 24, v: 0.35, g: true }, { lat: 25, lon: 147, a: 10, b: 8, v: 0.25, g: true },
    { lat: 40.5, lon: -109.6, a: 9, b: 11, v: 0.2, g: true },
  ], 1);
  stamp(w, up, [
    { lat: 18.65, lon: -133.8, a: 5.1, e: 0.55, v: 0.55 }, { lat: 18.65, lon: -133.8, a: 3.6, v: 0.55, g: true },
    { lat: -8.26, lon: -120.1, a: 2.8, v: 0.6, g: true }, { lat: 1.48, lon: -113, a: 2.4, v: 0.55, g: true }, { lat: 11.92, lon: -104.1, a: 2.4, v: 0.6, g: true },
    { lat: 25, lon: 147.2, a: 1.9, v: 0.4, g: true }, { lat: 32, lon: 148.4, a: 1.1, v: 0.2, g: true }, { lat: 21, lon: 150.5, a: 1.0, v: 0.2, g: true },
    { lat: 40.5, lon: -109.6, a: 2, v: 0.15, g: true }, { lat: -20, lon: 106, a: 3, v: 0.12, g: true },
  ], 1);
  const pit = new Float32Array(n);
  stamp(w, pit, [
    { lat: 18.4, lon: -133.4, a: 0.65, e: 0.4 }, { lat: -8.4, lon: -120.4, a: 0.55, e: 0.5 }, { lat: 1.4, lon: -113, a: 0.4, e: 0.5 }, { lat: 11.9, lon: -104, a: 0.45, e: 0.5 },
  ]);
  const vm = new Float32Array(n);
  stamp(w, vm, path(VALLES, 1.9, 1, false, 0.4));
  stamp(w, vm, [
    { lat: -6, lon: -73, a: 3.4, b: 2.2, e: 0.6 }, { lat: -10.5, lon: -71, a: 3, b: 2, e: 0.6 }, { lat: -4, lon: -65, a: 3, b: 1.5, e: 0.6 },
    { lat: -5, lon: -45, a: 2.5, b: 2, e: 0.8, v: 0.7 }, { lat: -9, lon: -36, a: 3, b: 2.6, e: 0.8, v: 0.6 }, { lat: -1, lon: -30, a: 3, b: 3, e: 0.9, v: 0.5 },
    { lat: -7, lon: -102, a: 4, b: 3, e: 0.9, v: 0.45 }, { lat: -3, lon: -96, a: 2, b: 1, e: 0.8, v: 0.5 },
  ]);
  const hg = new Float32Array(n), al = new Float32Array(n), dk = dark;
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, lon = g.lon[x];
      const db = 10 + 24 * Math.cos((lon - 25) * D2R) + n2[i] * 40;
      const hi = sstep(-4, 4, db - lat);
      hg[i] = -0.25 + hi * 0.3 + up[i] + n1[i] * 0.3 + n3[i] * 0.12 * hi - pit[i] * 0.35 - vm[i] * 0.7;
      al[i] = 1 + n1[i] * 0.7 + n2[i] * 0.5 - vm[i] * 0.12;
    }
  }
  const keep = (lat: number, lon: number, r: number) => {
    const db = 10 + 24 * Math.cos((lon - 25) * D2R);
    const hi = sstep(-6, 6, db - lat), th = sampleF(up, w, lat, lon) > 0.15 ? 0.15 : 1;
    return (0.12 + 0.88 * hi) * th * (r > 2 ? 0.6 : 1);
  };
  stampCraters(w, hg, al, genCraters(w, { seed: 505, cover: 0.14, rMin: 0.12, rMax: 5, dk: 0.12, keep, rays: 0.002, fp: 16 }), { rim: 0.04, floor: -0.02, fresh: 0.12, ray: 0.1, halo: 0.5 });
  stampCraters(w, hg, al, named(MARS_KM, [
    [-42.4, 70.5, 2300, { d: 0.7, rim: 0.12, fl: 0.7, pk: 0, tint: 0.12 }],   // Hellas
    [-49.7, -44, 1800, { d: 0.45, rim: 0.1, fl: 0.65, pk: 0, tint: 0.1 }],    // Argyre
    [12.9, 87, 1200, { d: 0.25, rim: 0.08, fl: 0.7, pk: 0 }],                  // Isidis
    [46.7, 117.5, 3300, { d: 0.12, rim: 0.02, fl: 0.8, pk: 0 }],               // Utopia
    [-5.4, 137.8, 154, { pk: 1.0, fl: 0.4 }], [18.38, 77.58, 49, {}],          // Gale (Aeolis Mons), Jezero
    [-14, 55.6, 456, { d: 0.18 }], [-2.7, 16.7, 461, { d: 0.18, fl: 0.6 }],    // Huygens, Schiaparelli
    [-21.7, -32.7, 220, { d: 0.15 }], [-43.9, 175.8, 340, { d: 0.15 }], [-47, -96, 230, {}], [-36.4, -134.4, 80, {}], // Galle, Newton, Lowell, Copernicus-ish
  ]), { rim: 0.04, floor: -0.02, fresh: 0.1, ray: 0.1 });
  // colour
  const brt: RGB = [206, 124, 72], drk: RGB = [96, 66, 50], ice: RGB = [246, 244, 240];
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, lon = g.lon[x], d = Math.min(0.92, dk[i] * clamp(0.75 + n2[i] * 2 + (n1[i] + n3[i] * 0.4 - 0.2) * 2.2, 0.1, 1) + vm[i] * 0.5 * clamp(0.7 + n1[i] * 3, 0, 1)), a = clamp(al[i], 0.5, 1.6);
      let R = a * mix(brt[0], drk[0], d), G = a * mix(brt[1], drk[1], d), B = a * mix(brt[2], drk[2], d);
      // polar caps: north residual cap with spiral troughs; small offset south residual cap
      const sp = Math.sin(lon * D2R * 2 + (90 - lat) * 0.55 + n1[i] * 5);
      const nc = sstep(79.5, 81.5, lat + n1[i] * 14 + n2[i] * 6) * (sp > 0.82 ? 0.55 : 1) * (1 - sstep(0.9, 1, 1 - Math.abs(wrapLon(lon + 10)) / 25) * sstep(84, 86, lat) * 0);
      const sd = 90 - Math.acos(clamp(g.sl[y] * Math.sin(-87 * D2R) + g.cl[y] * Math.cos(-87 * D2R) * Math.cos((lon + 45) * D2R), -1, 1)) * R2D;
      const sc = sstep(85.5, 87, sd + n1[i] * 10) + 0.35 * sstep(80, 84, sd + n1[i] * 12);
      const cap = clamp(nc + sc, 0, 1);
      R = mix(R, ice[0], cap); G = mix(G, ice[1], cap); B = mix(B, ice[2], cap);
      hg[i] += cap * 0.15;
      c.R[i] = R; c.G[i] = G; c.B[i] = B;
    }
  }
  bakeRelief(c, hg, 0.5);
  return finish(c, hg, 90);
}

// ---------------------------------------------------------------- gas giants

type Band = [number, number, number, number];
/** Latitude colour profile (control points [lat, r, g, b], descending lat) → LUT at 0.1° steps from +90 to −90. */
function bandLut(bands: Band[]): F32 {
  const lut = new Float32Array(1801 * 3);
  let j = 0;
  for (let k = 0; k <= 1800; k++) {
    const lat = 90 - k / 10;
    while (j < bands.length - 2 && lat < bands[j + 1][0]) j++;
    const a = bands[j], b = bands[j + 1], t = clamp((a[0] - lat) / (a[0] - b[0] || 1), 0, 1), s = t * t * (3 - 2 * t);
    for (let q = 0; q < 3; q++) lut[k * 3 + q] = a[q + 1] + (b[q + 1] - a[q + 1]) * s;
  }
  return lut;
}
const lutIdx = (lat: number) => Math.round((90 - clamp(lat, -90, 90)) * 10) * 3;

interface Vortex {
  lat: number; lon: number;
  /** Semi-axes: a in degrees of longitude, b in degrees of latitude. */
  a: number; b: number;
  /** Swirl of the surrounding flow (radians at the centre); negative winds anticlockwise seen from outside, like the anticyclones of the south and the cyclones of the north. */
  spin: number;
  col?: RGB; op?: number;
  /** Collar colour drawn just outside the edge. */
  rim?: RGB; rimOp?: number;
  /** Extent of the flow distortion in radii. */
  reach?: number;
}

/** Iterate the pixels of a lat/lon box around a vortex; cb(i, u, v) with u, v in vortex radii. */
function vbox(w: number, v: Vortex, ext: number, cb: (i: number, u: number, v: number) => void) {
  const g = grid(w), H = g.h;
  const y0 = Math.max(0, Math.floor(((90 - v.lat - v.b * ext) / 180) * H)), y1 = Math.min(H - 1, Math.ceil(((90 - v.lat + v.b * ext) / 180) * H));
  const nx = Math.ceil(((v.a * ext * 2) / 360) * w) + 2, x0 = Math.floor(((v.lon - v.a * ext + 180) / 360) * w);
  for (let y = y0; y <= y1; y++) {
    const vv = (g.lat[y] - v.lat) / v.b;
    for (let k = 0; k < nx; k++) {
      const x = (((x0 + k) % w) + w) % w;
      cb(y * w + x, wrapLon(g.lon[x] - v.lon) / v.a, vv);
    }
  }
}

interface GasOpt {
  seed: number;
  /** Large / fine warp amplitude in degrees of latitude. */
  warp: number; fine: number;
  /** Turbulence multiplier by latitude. */
  turb: (lat: number) => number;
  /** Fine zonal streak contrast. */
  streak: number;
  sy?: number;
  vort?: Vortex[];
  /** Optional latitude remap before the LUT lookup (e.g. Saturn's hexagon). */
  remap?: (lat: number, lon: number) => number;
}

function gas(w: number, lut: F32, o: GasOpt): { c: Canvas; w2: F32 } {
  const c = canvas(w), n = c.n, g = grid(w), sy = o.sy ?? 2.5;
  const w1 = fbm(w, { f: 2.5, oct: 4, seed: o.seed, sy, cap: 256 }), w2 = fbm(w, { f: 8, oct: 6, seed: o.seed + 1, sy: sy * 1.6, cap: 1024, gain: 0.6 });
  const w3 = fbm(w, { f: 6, oct: 5, seed: o.seed + 3, cap: 512 }), w4 = fbm(w, { f: 3, oct: 3, seed: o.seed + 4, cap: 256 });
  const st = fbm(w, { f: 24, oct: 4, seed: o.seed + 2, sy: 6, cap: 1024, minPx: 1.5 });
  const sl = new Float32Array(n), A = o.warp / 0.15, B = o.fine / 0.15;
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], t = o.turb(lat), pol = sstep(45, 65, Math.abs(lat)), row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, gate = clamp(0.5 + w4[i] * 4, 0.15, 1.6);
      sl[i] = lat + t * ((w1[i] * A + w2[i] * B * gate) * (1 - pol * 0.6) + w3[i] * B * 1.5 * pol);
    }
  }
  for (const v of o.vort ?? []) {
    const reach = v.reach ?? 2.2;
    vbox(w, v, reach, (i, u, q) => {
      const r2 = u * u + q * q;
      if (r2 > reach * reach) return;
      const th = v.spin * ex(r2 * 0.9), cs = Math.cos(th), sn = Math.sin(th);
      sl[i] += (u * sn + q * cs - q) * v.b;
    });
  }
  const remap = o.remap;
  for (let y = 0; y < g.h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, j = lutIdx(remap ? remap(sl[i], g.lon[x]) : sl[i]), s = 1 + st[i] * o.streak + w2[i] * o.streak * 0.5;
      c.R[i] = lut[j] * s; c.G[i] = lut[j + 1] * s; c.B[i] = lut[j + 2] * s;
    }
  }
  for (const v of o.vort ?? []) {
    if (!v.col && !v.rim) continue;
    vbox(w, v, 1.5, (i, u, q) => {
      const r = Math.sqrt(u * u + q * q);
      if (v.rim && r > 0.85) { const m = (v.rimOp ?? 0.6) * sstep(1.45, 1.1, r) * sstep(0.85, 1.05, r); over(c, i, v.rim, m); }
      if (v.col && r < 1.05) {
        const ang = Math.atan2(q, u), sw = 0.95 + 0.04 * Math.sin(ang * 2 + r * 7 * Math.sign(v.spin)) + w2[i] * 0.5;
        const m = (v.op ?? 1) * sstep(1.02, 0.78, r + w2[i] * (v.a > 10 ? 0.08 : 0.3));
        const k = sw * (0.92 + 0.15 * r);
        over(c, i, [v.col[0] * k, v.col[1] * k, v.col[2] * k], m);
      }
    });
  }
  return { c, w2 };
}
function over(c: Canvas, i: number, col: RGB, m: number) {
  if (m <= 0) return;
  c.R[i] += (col[0] - c.R[i]) * m; c.G[i] += (col[1] - c.G[i]) * m; c.B[i] += (col[2] - c.B[i]) * m;
}
/** Composite soft blobs of a colour over the canvas. */
function paintBlobs(c: Canvas, blobs: Blob[], col: RGB, op: number, noise?: F32, na = 0) {
  const m = new Float32Array(c.n);
  stamp(c.w, m, blobs);
  for (let i = 0; i < c.n; i++) if (m[i] > 0) over(c, i, col, clamp(m[i] * op * (1 + (noise ? noise[i] * na : 0)), 0, 1));
}

const JUPITER_BANDS: Band[] = [
  [90, 112, 112, 118], [66, 146, 138, 128], [56, 166, 154, 136], [48, 190, 176, 150], [44, 160, 140, 118], [41, 205, 190, 165], [37, 166, 142, 116],
  [34, 212, 198, 172], [29, 222, 208, 182], [26.5, 176, 132, 100], [24, 178, 134, 102], [22, 232, 220, 197], [18.5, 226, 211, 186], [17, 160, 108, 74],
  [12, 140, 90, 62], [8.5, 156, 106, 78], [7, 212, 192, 162], [4, 234, 218, 184], [0, 222, 196, 154], [-4, 234, 220, 188], [-7, 214, 190, 156],
  [-8.5, 166, 116, 82], [-12, 186, 140, 100], [-15, 156, 106, 72], [-19, 172, 124, 88], [-20.5, 232, 222, 202], [-25, 236, 226, 207],
  [-27, 192, 162, 132], [-31, 186, 156, 126], [-33, 226, 213, 191], [-39, 216, 201, 179], [-41, 176, 151, 126], [-44, 202, 187, 162],
  [-50, 176, 161, 141], [-60, 148, 141, 132], [-90, 112, 113, 120],
];

function paintJupiter(w: number): BodyMaps {
  const rnd = mulberry32(61), vort: Vortex[] = [
    { lat: -22, lon: -55, a: 7.5, b: 5.2, spin: -2.6, col: [206, 122, 84], rim: [238, 230, 214], rimOp: 0.75, reach: 2.6 }, // Great Red Spot
    { lat: -33, lon: -100, a: 3.4, b: 2.4, spin: -2, col: [214, 170, 142], rim: [236, 228, 214], rimOp: 0.5 },           // Oval BA
  ];
  for (let k = 0; k < 6; k++) vort.push({ lat: -41 + rnd() * 1.5, lon: -170 + k * 58 + rnd() * 20, a: 2.2 + rnd(), b: 1.5 + rnd() * 0.5, spin: -1.8, col: [246, 242, 232], op: 0.9 });
  for (let k = 0; k < 5; k++) vort.push({ lat: 14.5 + rnd() * 2, lon: -150 + k * 70 + rnd() * 25, a: 2 + rnd() * 1.5, b: 0.9 + rnd() * 0.4, spin: -1.5, col: [118, 70, 50], op: 0.75 }); // barges
  for (let k = 0; k < 26; k++) {
    const north = rnd() < 0.5, lat = (north ? 1 : -1) * (46 + rnd() * 26), s = 0.6 + rnd() * 1.4;
    vort.push({ lat, lon: rnd() * 360 - 180, a: s * 1.3 / Math.cos(lat * D2R), b: s, spin: (north ? -1 : 1) * 1.5, col: rnd() < 0.7 ? [226, 222, 214] : [130, 112, 98], op: 0.6 });
  }
  const turb = (lat: number) => {
    const a = Math.abs(lat);
    return a < 6 ? 0.35 : a < 20 ? 0.8 : a < 45 ? 1 : 1.4;
  };
  const { c, w2 } = gas(w, bandLut(JUPITER_BANDS), { seed: 60, warp: 1.6, fine: 0.9, turb, streak: 0.12, vort, sy: 3 });
  // equatorial festoons (dark blue-grey) and bright plumes along the NEB's southern edge
  const fest: Blob[] = [], plume: Blob[] = [];
  for (let k = 0; k < 12; k++) {
    const L = -180 + k * 30 + rnd() * 12;
    const p = path([[7.4, L], [6, L - 3], [4.2, L - 8], [2.5, L - 14], [1.2, L - 22]], 1.7, 1, false, 0.4);
    p.forEach((b, j) => { b.a *= 1 - j / p.length * 0.6; b.e = 0.95; });
    fest.push(...p);
    plume.push({ lat: 4.5, lon: L + 9, a: 5, b: 1.8, rot: 12, e: 0.95, v: 0.8 });
  }
  paintBlobs(c, fest, [100, 108, 124], 0.38, w2, 5);
  paintBlobs(c, plume, [246, 240, 228], 0.4, w2, 3);
  return finish(c, null);
}

const SATURN_BANDS: Band[] = [
  [90, 138, 150, 150], [80, 150, 158, 150], [77.5, 170, 166, 146], [76, 200, 180, 138], [70, 206, 186, 142], [60, 212, 192, 148], [50, 216, 196, 150],
  [45, 194, 168, 122], [40, 220, 200, 155], [35, 198, 172, 126], [31, 222, 202, 158], [28, 226, 206, 162], [24, 206, 176, 126], [21, 200, 168, 118],
  [17, 222, 198, 152], [14, 232, 212, 166], [8, 240, 224, 182], [0, 238, 220, 174], [-5, 228, 206, 158],
  [-12, 232, 210, 162], [-17, 214, 186, 138], [-20, 200, 168, 118], [-24, 214, 188, 140], [-28, 224, 202, 156], [-38, 204, 176, 130], [-45, 216, 196, 150], [-55, 202, 182, 142],
  [-70, 186, 172, 142], [-90, 164, 154, 138],
];

function paintSaturn(w: number): BodyMaps {
  const hex = (lat: number, lon: number) => {
    if (lat < 66) return lat;
    const q = ((((lon + 30) % 60) + 60) % 60) - 30, k = Math.cos(q * D2R);
    const t = sstep(66, 74, lat), co = 90 - lat;
    return 90 - co * mix(1, k, t);
  };
  const { c } = gas(w, bandLut(SATURN_BANDS), {
    seed: 70, warp: 0.6, fine: 0.35, streak: 0.08, sy: 4,
    turb: (lat) => (Math.abs(lat) > 70 ? 0.6 : 1), remap: hex,
    vort: [{ lat: 89.5, lon: 0, a: 40, b: 1.5, spin: -3, col: [110, 120, 128], op: 0.6, reach: 3 }],
  });
  return finish(c, null);
}

const URANUS_BANDS: Band[] = [
  [90, 196, 230, 232], [70, 186, 224, 230], [45, 172, 214, 224], [30, 166, 208, 220], [20, 172, 214, 224], [0, 170, 212, 222],
  [-20, 168, 210, 222], [-30, 164, 206, 218], [-45, 176, 216, 226], [-70, 190, 226, 232], [-90, 200, 232, 234],
];
function paintUranus(w: number): BodyMaps {
  const { c } = gas(w, bandLut(URANUS_BANDS), { seed: 80, warp: 0.4, fine: 0.2, turb: () => 1, streak: 0.025, sy: 5 });
  return finish(c, null);
}

const NEPTUNE_BANDS: Band[] = [
  [90, 82, 120, 212], [60, 72, 110, 210], [40, 70, 110, 212], [20, 76, 118, 218], [0, 82, 126, 224], [-15, 74, 114, 216], [-30, 66, 104, 208],
  [-50, 58, 94, 198], [-58, 42, 72, 176], [-66, 44, 74, 178], [-72, 70, 108, 208], [-90, 82, 122, 216],
];
function paintNeptune(w: number): BodyMaps {
  const { c, w2 } = gas(w, bandLut(NEPTUNE_BANDS), {
    seed: 90, warp: 1.0, fine: 0.5, turb: () => 1, streak: 0.06, sy: 4,
    vort: [
      { lat: -20, lon: -30, a: 16, b: 7, spin: -1.2, col: [38, 60, 150], op: 0.85, reach: 1.8 },   // Great Dark Spot
      { lat: -55, lon: 60, a: 4, b: 2.5, spin: -1.5, col: [36, 58, 150], op: 0.8 },            // Dark Spot 2
    ],
  });
  const rnd = mulberry32(91), cl: Blob[] = [
    { lat: -27, lon: -30, a: 9, b: 1.2, e: 0.9 }, { lat: -26, lon: -18, a: 5, b: 1.0, rot: 8, e: 0.9 },              // GDS companion clouds
    { lat: -42, lon: 20, a: 3.5, b: 1.6, e: 0.8 }, { lat: -55, lon: 60, a: 1.2, b: 0.8, e: 0.7 },                   // Scooter, D2 core
  ];
  for (let k = 0; k < 14; k++) cl.push({ lat: (rnd() < 0.5 ? 1 : -1) * (24 + rnd() * 14), lon: rnd() * 360 - 180, a: 6 + rnd() * 18, b: 0.5 + rnd() * 0.8, e: 0.95, v: 0.5 + rnd() * 0.5 });
  paintBlobs(c, cl, [240, 246, 252], 0.85, w2, 3);
  return finish(c, null);
}

// ---------------------------------------------------------------- Venus (cloud deck), Sun, Earth fallback

function paintVenus(w: number): BodyMaps {
  const c = canvas(w), g = grid(w);
  const a = fbm(w, { f: 2, oct: 6, seed: 101, sy: 4, cap: 512 }), b = fbm(w, { f: 7, oct: 5, seed: 102, sy: 5, cap: 1024 }), q = fbm(w, { f: 1.2, oct: 3, seed: 103, cap: 256 });
  // chevrons / dark "Y": features sheared so that they point westward at the equator (sample shifted with |lat|)
  const Wq = Math.min(w, 512), yf = new Float32Array(Wq * (Wq >> 1)), gq = grid(Wq);
  for (let y = 0; y < gq.h; y++) {
    const lat = gq.lat[y], al = Math.abs(lat);
    for (let x = 0; x < Wq; x++) {
      const lon = gq.lon[x], u = wrapLon(lon + 40 - al * 1.6) / 30;
      const arm = ex(((al - 3 - Math.max(0, -u) * 30) / 9) ** 2) * sstep(-3, -0.2, u) * sstep(0.6, 0.1, u); // Y arms
      const stem = ex((lat / 7) ** 2) * sstep(-0.2, 0.3, u) * sstep(2.5, 1.2, u);
      yf[y * Wq + x] = Math.max(arm, stem) * sstep(70, 40, al);
    }
  }
  blur(Wq, yf, 3, 1);
  const Y = upsample(yf, Wq, w);
  const lit: RGB = [244, 234, 204], drk: RGB = [214, 192, 146];
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], al = Math.abs(lat), row = y * w, polar = sstep(55, 75, al);
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const d = clamp(0.3 + a[i] * 1.1 + b[i] * 0.5 + q[i] * 0.7 + Y[i] * 0.55 - polar * 0.25 + sstep(72, 62, al) * sstep(55, 65, al) * 0.2, 0, 1);
      c.R[i] = mix(lit[0], drk[0], d); c.G[i] = mix(lit[1], drk[1], d); c.B[i] = mix(lit[2], drk[2], d);
    }
  }
  return finish(c, null);
}

function paintSun(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const gran = fbm(w, { f: 60, oct: 3, seed: 111, kind: 2, cap: 2048, minPx: 1.2 }), sup = fbm(w, { f: 14, oct: 3, seed: 112, kind: 1, cap: 1024 });
  const big = fbm(w, { f: 3, oct: 4, seed: 113, cap: 256 });
  // sunspot groups in the two activity belts: penumbra + umbra pairs, with bright faculae around them
  const rnd = mulberry32(114), pen: Blob[] = [], umb: Blob[] = [], fac: Blob[] = [];
  for (let k = 0; k < 9; k++) {
    const lat = (k % 2 ? 1 : -1) * (8 + rnd() * 20), lon = -170 + k * 40 + rnd() * 20, ns = 2 + ((rnd() * 5) | 0);
    fac.push({ lat, lon, a: 8 + rnd() * 6, b: 4 + rnd() * 2, rot: -10 + rnd() * 20, e: 0.9, v: 0.5 + rnd() * 0.5 });
    for (let j = 0; j < ns; j++) {
      const r = (j === 0 ? 2.2 : j === ns - 1 ? 1.7 : 0.7) * (0.7 + rnd() * 0.7), la = lat + (rnd() - 0.5) * 2.5, lo = lon - 6 + (j / Math.max(1, ns - 1)) * 12 + rnd() * 2;
      pen.push({ lat: la, lon: lo, a: r * 1.2, b: r, rot: rnd() * 180, e: 0.35 });
      umb.push({ lat: la, lon: lo, a: r * 0.5, b: r * 0.45, rot: rnd() * 180, e: 0.3 });
    }
  }
  const P = new Float32Array(n), U = new Float32Array(n), Fc = new Float32Array(n);
  stamp(w, P, pen); stamp(w, U, umb); stamp(w, Fc, fac);
  for (let y = 0; y < g.h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, k = 0.96 + (gran[i] - 0.4) * 0.08 - sup[i] * 0.04 + big[i] * 0.04 + Fc[i] * 0.08 * (0.5 + sup[i] * 2);
      // The familiar golden Sun (as through a solar filter); the shader's limb darkening turns the edge orange
      let R = 262 * k, G = 218 * k, B = 140 * k;
      const p = P[i] * (0.85 + gran[i] * 0.3), u = U[i];
      // Spots are cooler: penumbra ~65% and umbra ~20% of the photosphere's brightness
      R = mix(R, 165, p * 0.85); G = mix(G, 104, p * 0.85); B = mix(B, 48, p * 0.85);
      R = mix(R, 48, u * 0.95); G = mix(G, 24, u * 0.95); B = mix(B, 10, u * 0.95);
      c.R[i] = R; c.G[i] = G; c.B[i] = B;
    }
  }
  return finish(c, null);
}

/** Cheap blue-marble-like fallback (the app normally uses its own Earth texture). */
const EARTH_LAND: Poly[] = [
  [[71, -156], [70, -130], [68, -100], [62, -80], [58, -64], [47, -53], [44, -66], [35, -76], [25, -80], [29, -95], [21, -97], [16, -88], [8, -77], [10, -84], [16, -95], [23, -106], [32, -117], [40, -124], [49, -125], [58, -137], [60, -147], [55, -165], [66, -166]],
  [[82, -40], [83, -25], [76, -18], [70, -22], [60, -43], [68, -53], [77, -72]],
  [[12, -72], [5, -52], [-5, -35], [-23, -41], [-34, -54], [-40, -62], [-52, -68], [-55, -68], [-47, -75], [-37, -73], [-18, -70], [-5, -81], [2, -79], [8, -77]],
  [[36, -6], [43, -9], [48, -4], [51, 2], [54, 9], [58, 6], [62, 5], [70, 20], [71, 28], [69, 40], [73, 55], [77, 104], [72, 130], [71, 160], [66, 179], [60, 163], [59, 143], [53, 141], [46, 138], [39, 128], [35, 120], [30, 122], [22, 114], [21, 108], [10, 106], [1, 104], [8, 98], [16, 97], [22, 90], [20, 86], [8, 77], [21, 72], [25, 62], [22, 59], [12, 44], [30, 33], [36, 36], [37, 27], [41, 26], [40, 20], [44, 12], [38, 15], [44, 9], [43, 3], [36, -2]],
  [[37, 10], [31, 32], [21, 37], [11, 43], [12, 51], [-2, 41], [-15, 40], [-26, 33], [-34, 26], [-34, 18], [-22, 14], [-12, 13], [-1, 9], [5, 5], [4, -8], [12, -17], [21, -17], [28, -12], [35, -6]],
  [[-11, 132], [-12, 142], [-19, 146], [-28, 153], [-38, 148], [-38, 140], [-32, 133], [-35, 117], [-22, 113], [-14, 127]],
  [[-12, 49], [-25, 47], [-25, 44], [-16, 44]], [[45, 141], [41, 141], [34, 136], [31, 131], [34, 132], [39, 140]],
  [[58, -6], [53, 0], [50, -5], [55, -8]], [[-1, 109], [6, 117], [1, 119], [-3, 115]], [[-2, 132], [-3, 141], [-9, 148], [-8, 138]],
  [[-35, 173], [-41, 176], [-46, 167], [-41, 172]], [[66, -24], [64, -14], [63, -22]],
  [[-64, -180], [-70, -60], [-63, -58], [-72, -70], [-78, -160], [-72, -100], [-66, 0], [-66, 60], [-66, 120], [-66, 179.9], [-90, 179.9], [-90, -180]],
];
function paintEarth(w: number): BodyMaps {
  const c = canvas(w), g = grid(w), Wm = Math.min(w, 256);
  const lm = new Float32Array(Wm * (Wm >> 1));
  for (const p of EARTH_LAND) poly(Wm, lm, p);
  blur(Wm, lm, 1, 1);
  const L = upsample(lm, Wm, w), nz = fbm(w, { f: 4, oct: 6, seed: 121, cap: 512 }), cl = fbm(w, { f: 3, oct: 6, seed: 122, sy: 2, cap: 512 });
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], al = Math.abs(lat), row = y * w;
    const dry = ex(((al - 23) / 9) ** 2), ice = sstep(68, 76, al);
    for (let x = 0; x < w; x++) {
      const i = row + x, land = sstep(0.45, 0.55, L[i] + nz[i] * 0.6), v = 1 + nz[i] * 0.8;
      let R = mix(20, mix(52, 190, dry) * v, land), G = mix(46, mix(96, 160, dry) * v, land), B = mix(110, mix(40, 100, dry) * v, land);
      const ic = Math.max(ice * (lat < 0 ? 1 : land), lat < -60 ? land : 0, sstep(0.5, 0.6, L[i]) * sstep(60, 70, al) * (lat > 0 ? 1 : 0));
      R = mix(R, 240, ic); G = mix(G, 244, ic); B = mix(B, 248, ic);
      const cv = sstep(0.05, 0.3, cl[i] + 0.12 * Math.cos(lat * 4 * D2R) - 0.05) * 0.85;
      c.R[i] = mix(R, 250, cv); c.G[i] = mix(G, 250, cv); c.B[i] = mix(B, 252, cv);
    }
  }
  return finish(c, null);
}

// ---------------------------------------------------------------- Io

function paintIo(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 9, seed: 131, gain: 0.55 }), n2 = fbm(w, { f: 1.5, oct: 5, seed: 132, cap: 256 }), n3 = fbm(w, { f: 5, oct: 5, seed: 133, cap: 512 });
  const rnd = mulberry32(134);
  // [lat, lon, patera radius°, halo radius°, halo colour] — named eruptive centres first, then many anonymous paterae
  const halo: { b: Blob; col: RGB; op: number }[] = [];
  const dark: Blob[] = [], pit: Blob[] = [];
  const named: [number, number, number, number, RGB, number][] = [
    [-18.7, 104.7, 0.9, 19, [196, 84, 44], 0.75],   // Pele (red ring)
    [13, 51.2, 3.2, 6, [120, 92, 60], 0.4],         // Loki Patera
    [-1.5, -153, 0.8, 7, [244, 240, 226], 0.75],    // Prometheus (white ring)
    [63, -124, 1.2, 11, [190, 90, 50], 0.55],       // Tvashtar
    [24, -115, 0.9, 5, [70, 60, 50], 0.6],          // Amirani flow field
    [-20, -160, 1, 5, [196, 110, 60], 0.6],         // Culann
    [-8.6, 34.7, 1, 6, [210, 150, 70], 0.5],        // Ra Patera
    [-45, -55, 0.9, 6, [230, 230, 216], 0.5],       // Masubi
    [-12, 117, 1.0, 5, [56, 52, 48], 0.75],         // Pillan dark deposit
    [-28, 150, 0.9, 5, [192, 96, 54], 0.5],         // Marduk
    [-14, -102, 1.4, 4, [80, 70, 60], 0.45],        // Zamama-ish
  ];
  for (let k = 0; k < 90; k++) {
    const lat = Math.asin(2 * rnd() - 1) * R2D * 0.85, lon = rnd() * 360 - 180, r = 0.3 + rnd() ** 2 * 1.6, t = rnd();
    named.push([lat, lon, r, r * (1.5 + rnd() * 3), t < 0.4 ? [190, 100, 50] : t < 0.7 ? [110, 90, 66] : [236, 232, 214], 0.25 + rnd() * 0.35]);
  }
  for (const [lat, lon, r, hr, col, op] of named) {
    halo.push({ b: { lat, lon, a: hr, b: hr * (0.8 + rnd() * 0.3), rot: rnd() * 180, e: 0.8 }, col, op });
    dark.push({ lat, lon, a: r * (1 + rnd() * 0.5), b: r, rot: rnd() * 180, e: 0.35, v: 0.85 + rnd() * 0.15 });
    pit.push({ lat, lon, a: r, b: r * 0.8, e: 0.4 });
  }
  const hg = new Float32Array(n);
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], pol = sstep(40, 70, Math.abs(lat)), row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, frost = sstep(-0.05, 0.3, n2[i] * 1.4 + n3[i] * 0.6 + n1[i] * 0.5 - 0.02) * (1 - pol);
      const v = 1 + n1[i] * 0.6;
      let R = 226 * v, G = 204 * v, B = 104 * v;
      R = mix(R, 236, frost * 0.6); G = mix(G, 230, frost * 0.6); B = mix(B, 196, frost * 0.6);       // SO2 frost (whitish)
      const orn = sstep(0.0, 0.2, n3[i] + 0.05) * 0.4;
      R = mix(R, 214, orn); G = mix(G, 150, orn); B = mix(B, 70, orn);
      R = mix(R, 150, pol * 0.75); G = mix(G, 108, pol * 0.75); B = mix(B, 76, pol * 0.75);           // brownish-red poles
      c.R[i] = R; c.G[i] = G; c.B[i] = B;
      hg[i] = n1[i] * 0.4 + n2[i] * 0.3;
    }
  }
  // Pele: an oval ring, not a disc
  const ring = new Float32Array(n);
  stamp(w, ring, [{ lat: -18.7, lon: 104.7, a: 19, b: 15, e: 0.25 }]);
  const hole = new Float32Array(n);
  stamp(w, hole, [{ lat: -18.7, lon: 104.7, a: 13, b: 10, e: 0.5 }]);
  for (let i = 0; i < n; i++) if (ring[i] > 0) over(c, i, [190, 76, 40], clamp((ring[i] - hole[i]) * (0.8 + n1[i] * 2), 0, 1) * 0.7);
  const groups = new Map<string, Blob[]>();
  for (const h of halo.slice(1)) { const k = h.col.join(','); h.b.v = h.op; (groups.get(k) ?? groups.set(k, []).get(k)!).push(h.b); }
  for (const [k, bl] of groups) paintBlobs(c, bl, k.split(',').map(Number) as RGB, 1, n1, 2.5);
  paintBlobs(c, dark, [36, 30, 26], 0.95, n1, 1);
  paintBlobs(c, [{ lat: 13.5, lon: 52, a: 1.2, b: 0.9, e: 0.5 }], [190, 170, 120], 0.8);  // Loki's island
  const pm = new Float32Array(n);
  stamp(w, pm, pit);
  // mountains (Boösaule, Tohil, Haemus) as sharp ridged mounds
  const mt = new Float32Array(n);
  stamp(w, mt, [{ lat: -5, lon: 87, a: 2.5, b: 4, g: true, v: 0.9 }, { lat: -28, lon: 202 - 360, a: 2, b: 3, g: true, v: 0.7 }, { lat: -70, lon: -48, a: 4, b: 2, g: true, v: 0.6 }, { lat: 12, lon: -175, a: 2, b: 3, rot: 30, g: true, v: 0.6 }], 1);
  for (let i = 0; i < n; i++) hg[i] += mt[i] * (0.8 + n1[i]) - pm[i] * 0.4;
  bakeRelief(c, hg, 0.4);
  return finish(c, hg, 80);
}

// ---------------------------------------------------------------- Europa

const EUROPA_KM = 27.3;
function paintEuropa(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 4, oct: 9, seed: 141, gain: 0.55 }), n2 = fbm(w, { f: 1.6, oct: 5, seed: 142, cap: 256 }), n3 = fbm(w, { f: 8, oct: 4, seed: 143, cap: 1024 });
  const rnd = mulberry32(144), lin: Blob[] = [], halo: Blob[] = [];
  for (let k = 0; k < 120; k++) {
    const lat = Math.asin(2 * rnd() - 1) * R2D, lon = rnd() * 360 - 180, len = 20 + rnd() * 100, br = rnd() * 360, cu = (rnd() - 0.5) * 0.7;
    const wd = k < 16 ? 0.45 + rnd() * 0.4 : 0.12 + rnd() * 0.2, pts = arc(lat, lon, br, len, cu, 2);
    const p = path(pts, wd, k < 16 ? 0.7 + rnd() * 0.3 : 0.3 + rnd() * 0.5, false, 0.5);
    lin.push(...p);
    if (k < 16) halo.push(...path(pts, wd * 3.2, 0.5, false, 0.5));
    if (k < 30 && rnd() < 0.6) { const q = arc(lat + 0.6 * wd, lon, br, len, cu, 2); lin.push(...path(q, wd * 0.6, 0.6, false, 0.6)); }
  }
  // chaos: Conamara and others (mottled brownish)
  const chaos: Blob[] = [
    { lat: 9.7, lon: 87.3, a: 4, b: 3.2, e: 0.8 }, { lat: -47, lon: 179, a: 3, b: 2.4, e: 0.8 }, { lat: -46, lon: -172, a: 6, b: 3.5, e: 0.8 },
    { lat: 10, lon: 120, a: 10, b: 6, e: 0.9, v: 0.7 }, { lat: -20, lon: 140, a: 12, b: 8, e: 0.9, v: 0.6 }, { lat: 25, lon: 60, a: 8, b: 5, e: 0.9, v: 0.6 },
    { lat: -5, lon: 170, a: 7, b: 6, e: 0.9, v: 0.6 }, { lat: 40, lon: 100, a: 6, b: 5, e: 0.9, v: 0.5 }, { lat: -15, lon: -150, a: 6, b: 4, e: 0.9, v: 0.5 },
  ];
  const hg = new Float32Array(n), al = new Float32Array(n);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, cl = g.cl[y];
    for (let x = 0; x < w; x++) {
      const i = row + x, trail = clamp(0.5 + 0.5 * cl * g.so[x], 0, 1);   // trailing hemisphere (centre 90°E) is redder/darker
      al[i] = 1 + n1[i] * 0.25 + n2[i] * 0.2 - trail * 0.12;
      hg[i] = n1[i] * 0.25 + n3[i] * 0.1;
      const t = trail * trail * clamp(0.6 + n2[i] * 3, 0, 1);
      c.R[i] = mix(236, 214, t); c.G[i] = mix(230, 188, t); c.B[i] = mix(218, 150, t);
    }
  }
  const L = new Float32Array(n), Hm = new Float32Array(n), C = new Float32Array(n);
  stamp(w, L, lin); stamp(w, Hm, halo); stamp(w, C, chaos);
  stampCraters(w, hg, al, named(EUROPA_KM, [
    [-25.2, 88.6, 45, { f: 1.3, ray: 30, pk: 0.5 }], [34, -146.6, 40, { d: 0.05, rings: [1.8, 2.6, 3.4, 4.2] }],
    [-16.7, 25.5, 33, { d: 0.04, rings: [1.6, 2.2] }], [-6, -80, 24, { f: 0.7, ray: 8 }], [50, 30, 20, { f: 0.6 }],
  ]), { rim: 0.05, floor: -0.02, fresh: 0.25, ray: 0.35 });
  for (let i = 0; i < n; i++) {
    const a = clamp(al[i], 0.5, 1.4), lm = clamp(L[i] * (0.7 + n3[i] * 2), 0, 1), hm = Hm[i] * 0.35 * clamp(0.8 + n1[i] * 2, 0, 1);
    const ch = clamp(C[i] * (0.4 + n3[i] * 3 + n1[i] * 2), 0, 1);
    let R = c.R[i] * a, G = c.G[i] * a, B = c.B[i] * a;
    R = mix(R, 172, hm); G = mix(G, 120, hm); B = mix(B, 84, hm);
    R = mix(R, 150, lm * 0.85); G = mix(G, 92, lm * 0.85); B = mix(B, 58, lm * 0.85);
    R = mix(R, 160, ch * 0.75); G = mix(G, 116, ch * 0.75); B = mix(B, 84, ch * 0.75);
    c.R[i] = R; c.G[i] = G; c.B[i] = B;
    hg[i] += L[i] * 0.25 + ch * n3[i] * 1.5;
  }
  bakeRelief(c, hg, 0.4);
  return finish(c, hg, 80);
}

// ---------------------------------------------------------------- Ganymede

const GANYMEDE_KM = 45.9;
const d0 = (d: number) => (d > 0.5 ? 1 : d * 2);
function paintGanymede(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 10, seed: 151, gain: 0.55 }), n2 = fbm(w, { f: 1.6, oct: 5, seed: 152, cap: 256 });
  const dark = regions(w, [
    { lat: 40, lon: -135, a: 26, b: 22, rot: 10 }, { lat: 15, lon: -150, a: 10, b: 10 },                  // Galileo Regio
    { lat: 10, lon: 160, a: 22, b: 20 }, { lat: -15, lon: 175, a: 14, b: 10 }, { lat: 35, lon: 175, a: 12, b: 10 }, // Marius Regio
    { lat: -20, lon: 0, a: 15, b: 12 }, { lat: -30, lon: -15, a: 10, b: 8 },                             // Nicholson Regio
    { lat: 40, lon: -30, a: 14, b: 12 }, { lat: 22, lon: -10, a: 10, b: 8 },                             // Perrine, Barnard
    { lat: 25, lon: 70, a: 12, b: 10 }, { lat: -25, lon: 100, a: 10, b: 12 }, { lat: 60, lon: 60, a: 15, b: 6 }, // Melotte/… minor dark terrain
  ], [], n1, 1.5, 0.35, 0.6, 5);
  // grooved terrain: per-cell groove direction (coarse Voronoi), fine parallel ridges
  const NC = 48, rnd = mulberry32(153), cx = new Float32Array(NC), cy = new Float32Array(NC), cz = new Float32Array(NC), dx = new Float32Array(NC), dy = new Float32Array(NC), dz = new Float32Array(NC);
  for (let k = 0; k < NC; k++) {
    const la = Math.asin(2 * rnd() - 1), lo = rnd() * TAU; cx[k] = Math.cos(la) * Math.cos(lo); cy[k] = Math.sin(la); cz[k] = Math.cos(la) * Math.sin(lo);
    let ax = rnd() - 0.5, ay = rnd() - 0.5, az = rnd() - 0.5; const l = Math.hypot(ax, ay, az); ax /= l; ay /= l; az /= l; dx[k] = ax; dy[k] = ay; dz[k] = az;
  }
  const Wc = Math.min(w, 256), gc = grid(Wc), cell = new Uint8Array(Wc * (Wc >> 1));
  for (let y = 0; y < gc.h; y++) for (let x = 0; x < Wc; x++) {
    const px = gc.cl[y] * gc.co[x], py = gc.sl[y], pz = gc.cl[y] * gc.so[x];
    let b = 0, bd = -2;
    for (let k = 0; k < NC; k++) { const d = px * cx[k] + py * cy[k] + pz * cz[k]; if (d > bd) { bd = d; b = k; } }
    cell[y * Wc + x] = b;
  }
  const hg = new Float32Array(n), al = new Float32Array(n), sc = Wc / w;
  for (let y = 0; y < g.h; y++) {
    const row = y * w, yc = Math.min(gc.h - 1, Math.floor(y * sc)) * Wc, sl = g.sl[y], cl = g.cl[y];
    for (let x = 0; x < w; x++) {
      const i = row + x, k = cell[yc + Math.floor(x * sc)], px = cl * g.co[x], pz = cl * g.so[x];
      const s = (px * dx[k] + sl * dy[k] + pz * dz[k]) * 420 + n1[i] * 10, amp = (k % 3 ? 0.5 : 1) * (1 - d0(dark[i]));
      const gr = (Math.sin(s) * 0.5 + 0.5) * amp, d = dark[i];
      hg[i] = n1[i] * 0.3 + n2[i] * 0.3 + gr * gr * 0.1 - (1 - d) * 0.08;
      al[i] = mix(1.0 + n1[i] * 0.3 + gr * 0.05, 0.55 + n1[i] * 0.35 + n2[i] * 0.3, d);
    }
  }
  const keep = (lat: number, lon: number) => 0.35 + 0.65 * sampleF(dark, w, lat, lon);
  stampCraters(w, hg, al, genCraters(w, { seed: 155, cover: 0.16, rMin: 0.12, rMax: 3, dk: 0.1, keep, rays: 0.01, fp: 9 }), { rim: 0.06, floor: -0.02, fresh: 0.5, ray: 0.3, halo: 0.6 });
  stampCraters(w, hg, al, named(GANYMEDE_KM, [
    [-38, -166, 107, { f: 1.4, ray: 22 }], [11, -27, 94, { f: 1.2, ray: 16 }], [-3, -40, 70, { f: 0.9, ray: 10 }], // Osiris, Tros, …
    [-24, 152, 80, { f: 1, ray: 12 }], [32, 82, 60, { f: 0.9, ray: 10 }],
    [13, -21, 300, { d: 0.05, rim: 0.03, fl: 0.7, pk: 0, tint: 0.15 }],                                           // Memphis Facula-like palimpsest
  ]), { rim: 0.06, floor: -0.02, fresh: 0.6, ray: 0.45 });
  for (let y = 0; y < g.h; y++) {
    const lat = g.lat[y], cap = sstep(38, 60, Math.abs(lat)) * 0.35, row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x, d = dark[i], a = clamp(al[i] + cap * 0.5, 0.2, 1.6);
      c.R[i] = a * mix(182, 116, d); c.G[i] = a * mix(176, 104, d); c.B[i] = a * mix(166, 90, d);
      if (cap) over(c, i, [226, 228, 232], cap * clamp(0.6 + n1[i] * 3, 0, 1));
    }
  }
  bakeRelief(c, hg, 0.4);
  return finish(c, hg, 90);
}

// ---------------------------------------------------------------- cellular noise

let WF1 = 0, WF2 = 0;
/** 3D Worley noise: sets WF1/WF2 (distances to the nearest and second-nearest jittered cell points). */
function worley(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9, f2 = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const h = PERM[(PERM[(PERM[(cx + seed) & 255] + (cy & 255)) & 255] + (cz & 255)) & 255];
    const jx = cx + PERM[h] / 256 - x, jy = cy + PERM[h + 1] / 256 - y, jz = cz + PERM[h + 2] / 256 - z;
    const d = jx * jx + jy * jy + jz * jz;
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  WF1 = Math.sqrt(f1); WF2 = Math.sqrt(f2);
}

// ---------------------------------------------------------------- Titan

function paintTitan(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 9, seed: 161, gain: 0.55 }), n2 = fbm(w, { f: 1.5, oct: 5, seed: 162, cap: 256 });
  const dunes = fbm(w, { f: 30, oct: 2, seed: 163, sy: 0.15, kind: 1, cap: 1024 });
  // dark dune seas (Shangri-La, Belet, Fensal, Aztlan, Senkyo, …) and bright Xanadu / Adiri / Dilmun
  const dark = regions(w, [
    { lat: -8, lon: -165, a: 30, b: 16, rot: 8 }, { lat: 5, lon: 170, a: 14, b: 10 }, { lat: -15, lon: -140, a: 12, b: 9 },   // Shangri-La
    { lat: -8, lon: 105, a: 28, b: 13, rot: -6 }, { lat: 5, lon: 75, a: 10, b: 8 },                                        // Belet
    { lat: 8, lon: -32, a: 16, b: 9, rot: 20 }, { lat: -12, lon: -18, a: 15, b: 9, rot: -10 }, { lat: -2, lon: -45, a: 6, b: 10 }, // Fensal, Aztlan
    { lat: -5, lon: 30, a: 22, b: 12 }, { lat: 15, lon: 50, a: 10, b: 6 },                                                 // Senkyo, …
    { lat: 20, lon: -110, a: 10, b: 5, v: 0.6 }, { lat: -25, lon: 60, a: 14, b: 6, v: 0.7 },
    { lat: -5, lon: 135, a: 14, b: 8 }, { lat: 0, lon: -70, a: 14, b: 7, v: 0.8 }, { lat: -12, lon: 0, a: 12, b: 8 }, { lat: 0, lon: 55, a: 14, b: 8 },
    { lat: 10, lon: -160, a: 12, b: 6, v: 0.8 }, { lat: -20, lon: 165, a: 12, b: 7 },
  ], [], n1, 2.2, 0.35, 0.65, 7, true);
  const bright = regions(w, [
    { lat: -12, lon: -100, a: 38, b: 20, rot: 5 }, { lat: 5, lon: -128, a: 12, b: 9 },          // Xanadu
    { lat: -10, lon: 150, a: 12, b: 9 }, { lat: 15, lon: -175, a: 10, b: 7 },                   // Adiri, Dilmun
    { lat: 25, lon: 10, a: 30, b: 10 }, { lat: 30, lon: 140, a: 25, b: 10 }, { lat: -35, lon: -40, a: 35, b: 10 }, // mid-latitude bright plains
    { lat: -35, lon: 120, a: 25, b: 8 },
  ], [], n1, 2, 0.35, 0.65, 7, true);
  // northern seas (Kraken, Ligeia, Punga) and southern Ontario Lacus
  const lakes = regions(w, [
    { lat: 68, lon: 50, a: 9, b: 5, rot: 60 }, { lat: 62, lon: 60, a: 5, b: 3 }, { lat: 74, lon: 35, a: 4, b: 6 },          // Kraken Mare
    { lat: 79, lon: 112, a: 5, b: 4 }, { lat: 85, lon: 21, a: 3, b: 2.5 }, { lat: 72, lon: 150, a: 1.5 }, { lat: 77, lon: -110, a: 1.5 },
    { lat: -72, lon: 177, a: 3, b: 1.6, rot: 30 },                                                                          // Ontario Lacus
  ], [], n1, 2, 0.4, 0.6, 1, true);
  const hg = new Float32Array(n), al = new Float32Array(n);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y], eq = 1 - sstep(25, 40, Math.abs(lat));
    for (let x = 0; x < w; x++) {
      const i = row + x, d = dark[i], b = bright[i], L = lakes[i];
      hg[i] = n1[i] * 0.25 + n2[i] * 0.2 + b * 0.12 * (1 + n1[i] * 3) + d * eq * (dunes[i] - 0.45) * 0.25 - L * 0.3;
      al[i] = 1 + n2[i] * 0.2 + n1[i] * 0.15 - d * 0.28 + b * (0.2 + n1[i] * 0.4) - L * 0.5;
    }
  }
  stampCraters(w, hg, al, named(55.7, [[19.6, -87.3, 392, { d: 0.08, f: 0.4, pk: 0 }], [7, 161, 90, { f: 0.6 }], [11.3, -16, 80, { f: 0.5 }], [26, 160, 60, { f: 0.4 }]]),
    { rim: 0.08, floor: -0.02, fresh: 0.15, ray: 0 });
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y], hood = sstep(55, 75, lat) * 0.5;    // detached north polar hood
    for (let x = 0; x < w; x++) {
      const i = row + x, a = clamp(al[i], 0.4, 1.4), s = 0.68 + 0.32 * a;   // haze washes out the surface contrast
      c.R[i] = 214 * s + hood * 18; c.G[i] = 148 * s * (0.96 + 0.06 * a) + hood * 22; c.B[i] = 62 * s * (0.9 + 0.1 * a) + hood * 10;
    }
  }
  return finish(c, hg, 40);
}

// ---------------------------------------------------------------- Enceladus

function paintEnceladus(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 9, seed: 171, gain: 0.55 }), n2 = fbm(w, { f: 1.4, oct: 4, seed: 172, cap: 256 });
  const rid = fbm(w, { f: 14, oct: 3, seed: 173, kind: 1, sy: 3, cap: 1024 });
  const hg = new Float32Array(n), al = new Float32Array(n), frac = new Float32Array(n);
  // tiger stripes: four parallel troughs ~35 km (≈8°) apart around the south pole
  const rot = 45 * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y], spt = 1 - sstep(-62, -52, lat), sulci = sstep(-50, -30, lat) * (1 - sstep(25, 45, lat));
    for (let x = 0; x < w; x++) {
      const i = row + x, cx = g.co[x], sx = g.so[x], band = sulci * sstep(0.55, 0.85, Math.abs(sx)); // ridged plains centred on ±90°
      let h = n1[i] * 0.3 + n2[i] * 0.3 + band * (rid[i] - 0.45) * 0.4, a = 1 + n2[i] * 0.06 + n1[i] * 0.05;
      if (spt) {
        const p = 90 + lat, u = p * cx * cr - p * sx * sr, v = p * cx * sr + p * sx * cr;
        const vv = v + n1[i] * 12, len = 1 - sstep(16, 24, Math.abs(u + n2[i] * 10));
        let best = 9;
        for (const k of [-12, -4, 4, 12]) best = Math.min(best, Math.abs(vv - k));
        const t = ex(best * best * 2.5) * len;
        h += spt * ((rid[i] - 0.45) * 0.25 - t * 0.35 + ex((best - 1.3) * (best - 1.3) * 3) * len * 0.12);
        frac[i] = Math.max(frac[i], t * spt);
      }
      frac[i] = Math.max(frac[i], band * sstep(0.6, 0.9, rid[i]) * 0.35);
      hg[i] = h; al[i] = a;
    }
  }
  const keep = (lat: number, lon: number) => (lat < -50 ? 0 : Math.abs(Math.sin(lon * D2R)) > 0.6 && lat < 35 ? 0.12 : 1);
  stampCraters(w, hg, al, genCraters(w, { seed: 174, cover: 0.2, rMin: 0.25, rMax: 4, dk: 0.12, keep, fp: 12 }), { rim: 0.03, floor: -0.03, fresh: 0.05, ray: 0 });
  stampCraters(w, hg, al, named(4.4, [[55, -12, 39, {}], [60, -26, 34, {}], [-5, 7, 23, {}], [44, 150, 30, {}], [10, 180, 28, {}]]), { rim: 0.03, floor: -0.03, fresh: 0.05, ray: 0 });
  for (let i = 0; i < n; i++) {
    const a = clamp(al[i], 0.8, 1.15), f = clamp(frac[i] * (0.8 + n1[i] * 2), 0, 1);
    c.R[i] = mix(232 * a, 168, f); c.G[i] = mix(236 * a, 200, f); c.B[i] = mix(240 * a, 212, f);
  }
  bakeRelief(c, hg, 0.6);
  return finish(c, hg, 100);
}

// ---------------------------------------------------------------- Triton

function paintTriton(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 9, seed: 181, gain: 0.55 }), n2 = fbm(w, { f: 1.5, oct: 5, seed: 182, cap: 256 });
  const cant = regions(w, [{ lat: 15, lon: -45, a: 45, b: 28, rot: -5, e: 0.6 }, { lat: -5, lon: -95, a: 15, b: 15 }], [], n1, 2.2, 0.25, 0.65, 6, true); // Bubembe Regio
  const plains = regions(w, [{ lat: 30, lon: 25, a: 22, b: 14 }, { lat: 10, lon: 60, a: 20, b: 15 }], [], n2, 1.5, 0.35, 0.6, 4); // Cipango Planum
  const hg = new Float32Array(n), al = new Float32Array(n), capM = new Float32Array(n);
  const fq = 40;
  for (let y = 0; y < g.h; y++) {
    const row = y * w, sl = g.sl[y], cl = g.cl[y], lat = g.lat[y];
    for (let x = 0; x < w; x++) {
      const i = row + x, cm = cant[i];
      let h = n1[i] * 0.3 + n2[i] * 0.3 - plains[i] * 0.05;
      if (cm > 0.01) {
        worley(cl * g.co[x] * fq + n1[i] * 3, sl * fq, cl * g.so[x] * fq, 7);
        const edge = 1 - sstep(0.0, 0.18, WF2 - WF1);
        h += cm * (edge * 0.14 - WF1 * 0.14 + 0.06);
      }
      hg[i] = h;
      al[i] = 1 + n1[i] * 0.2 + n2[i] * 0.2 + cm * (n1[i] * 0.15 - 0.03);
      capM[i] = 1 - sstep(-22, -8, lat + n2[i] * 40 + n1[i] * 14);
    }
  }
  stampCraters(w, hg, al, genCraters(w, { seed: 184, cover: 0.03, rMin: 0.15, rMax: 1.2, dk: 0.1, fp: 8 }), { rim: 0.04, floor: -0.02, fresh: 0.2, ray: 0 });
  stampCraters(w, hg, al, named(23.6, [
    [27, 23, 200, { d: 0.06, fill: 1.0, fl: 0.85, pk: 0 }], [34, 14, 300, { d: 0.06, fill: 0.98, fl: 0.85, pk: 0 }], // Ruach, Tuonela Planitiae
    [17, 28, 100, { d: 0.08, fill: 0.9, pk: 0 }], [-12, 5, 27, { f: 0.6 }],                                       // Leviathan Patera, Mazomba
  ]), { rim: 0.05, floor: -0.02, fresh: 0.2, ray: 0 });
  // dark plume streaks on the polar cap, blown north-east
  const rnd = mulberry32(185), streaks: Blob[] = [];
  for (let k = 0; k < 70; k++) {
    const lat = -18 - rnd() * 40, lon = rnd() * 360 - 180, l = 1.2 + rnd() * 3;
    streaks.push({ lat, lon, a: l, b: 0.25 + rnd() * 0.35, rot: 40 + rnd() * 25, v: 0.4 + rnd() * 0.5, e: 0.9 });
  }
  const st = new Float32Array(n);
  stamp(w, st, streaks);
  const mac = new Float32Array(n);   // Akupara, Doro, Zin maculae: dark spots with bright rims
  stamp(w, mac, [{ lat: -23, lon: 30, a: 5, b: 3.5, e: 0.8, rot: 20 }, { lat: -28, lon: 42, a: 4, b: 3, e: 0.8 }, { lat: -15, lon: 22, a: 4.5, b: 2.5, e: 0.8, rot: -15 }, { lat: -20, lon: 54, a: 3, e: 0.8 }]);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y], fringe = ex(((lat + 14) / 6) ** 2) * 0.12;
    for (let x = 0; x < w; x++) {
      const i = row + x, a = clamp(al[i] + fringe, 0.5, 1.4), cp = capM[i], cm = cant[i];
      let R = mix(mix(170, 176, cm), 236, cp) * a, G = mix(mix(176, 172, cm), 210, cp) * a, B = mix(mix(170, 158, cm), 196, cp) * a;
      const s = st[i] * cp * clamp(0.6 + n1[i] * 3, 0, 1), m = clamp(mac[i] * (0.8 + n1[i] * 5) - 0.15, 0, 1);
      R = mix(R, 118, s * 0.7); G = mix(G, 102, s * 0.7); B = mix(B, 96, s * 0.7);
      R = mix(R, 92, m * 0.75); G = mix(G, 90, m * 0.75); B = mix(B, 86, m * 0.75);
      c.R[i] = R; c.G[i] = G; c.B[i] = B;
    }
  }
  bakeRelief(c, hg, 0.4);
  return finish(c, hg, 90);
}

// ---------------------------------------------------------------- Pluto

const PLUTO_KM = 20.7;
// Sputnik Planitia (western lobe of Tombaugh Regio): teardrop, ~1050 × 800 km, pointing south
const SPUTNIK: Poly = [[45, 168], [44, 178], [40, 186], [33, 192], [25, 196], [17, 198], [9, 196], [2, 191], [-5, 185], [-12, 180], [-18, 177],
  [-16, 172], [-9, 168], [-2, 164], [6, 160], [15, 158], [25, 158], [34, 160], [41, 163]];
function paintPluto(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 9, seed: 191, gain: 0.55 }), n2 = fbm(w, { f: 1.4, oct: 5, seed: 192, cap: 256 });
  const bl = fbm(w, { f: 26, oct: 2, seed: 193, kind: 1, cap: 512 });
  const sp = regions(w, [], [SPUTNIK], n1, 0.5, 0.45, 0.55, 2);
  const tomb = regions(w, [
    { lat: 15, lon: -148, a: 20, b: 26, rot: 20 }, { lat: -5, lon: -158, a: 9, b: 10 }, { lat: 38, lon: -168, a: 12, b: 8 }, { lat: 25, lon: -132, a: 8, b: 10 }, // eastern lobe
  ], [SPUTNIK], n1, 1.4, 0.35, 0.6, 6, true);
  // Cthulhu Macula and the other dark equatorial maculae
  const cth = regions(w, [], [
    [[8, 20], [12, 35], [10, 55], [5, 75], [3, 95], [0, 115], [-4, 135], [-8, 150], [-14, 160], [-22, 162], [-25, 150], [-24, 130], [-24, 110], [-28, 90],
      [-30, 70], [-28, 50], [-22, 32], [-12, 18], [-2, 14]],
  ], n1, 1.8, 0.3, 0.6, 6, true);
  const mac = regions(w, [{ lat: -5, lon: -140, a: 10, b: 8 }], [   // Krun, Balrog, Meng-p'o… a broken dark belt east of the heart
    [[-2, -132], [2, -110], [-2, -85], [0, -60], [-4, -35], [-2, -12], [2, 8], [-8, 16], [-18, 4], [-22, -20], [-26, -45], [-24, -75], [-28, -100], [-22, -125], [-12, -138]],
  ], n1, 2.2, 0.3, 0.7, 6, true);
  const tart = regions(w, [{ lat: 15, lon: -128, a: 12, b: 16, rot: 10 }, { lat: 30, lon: -112, a: 8, b: 10 }], [], n2, 1, 0.4, 0.6, 3, true); // Tartarus Dorsa
  const hg = new Float32Array(n), al = new Float32Array(n);
  const fq = 32;
  for (let y = 0; y < g.h; y++) {
    const row = y * w, sl = g.sl[y], cl = g.cl[y];
    for (let x = 0; x < w; x++) {
      const i = row + x, s = sp[i];
      let h = n1[i] * 0.4 + n2[i] * 0.4 + tart[i] * (bl[i] - 0.4) * 0.8, a = 1 + n1[i] * 0.22 + n2[i] * 0.1;
      if (s > 0.01) {   // nitrogen-ice convection cells
        worley(cl * g.co[x] * fq + n1[i] * 2, sl * fq + n1[i] * 2, cl * g.so[x] * fq, 11);
        const tr = 1 - sstep(0.0, 0.14, WF2 - WF1);
        h = mix(h, -0.35 - tr * 0.1 + (0.5 - WF1) * 0.05, s);
        a = mix(a, 1.04 + n1[i] * 0.25 - tr * 0.3, s);
      }
      hg[i] = h; al[i] = a;
    }
  }
  const keep = (lat: number, lon: number) => {
    const s = sampleF(sp, w, lat, lon), t = sampleF(tomb, w, lat, lon);
    return s > 0.2 ? 0 : t > 0.5 ? 0.25 : 1;
  };
  stampCraters(w, hg, al, genCraters(w, { seed: 194, cover: 0.12, rMin: 0.25, rMax: 4, dk: 0.12, keep, fp: 12 }), { rim: 0.03, floor: -0.02, fresh: 0.08, ray: 0 });
  stampCraters(w, hg, al, named(PLUTO_KM, [
    [47, 133, 296, { d: 0.12, fl: 0.6, pk: 0 }], [3, 100, 90, {}], [-14, 22, 70, {}], [30, 60, 120, { d: 0.12 }], [-3, -95, 60, {}], [45, -60, 80, {}],
  ]), { rim: 0.03, floor: -0.02, fresh: 0.08, ray: 0 });
  // mountains: blocky water-ice ranges on Sputnik's western rim (al-Idrisi, Hillary, Tenzing), Wright & Piccard Montes
  const mt = new Float32Array(n);
  const rnd = mulberry32(195), blocks: Blob[] = [];
  const rim: [number, number][] = [[38, 158], [30, 156], [22, 155], [14, 156], [6, 158], [-2, 161], [-9, 164], [-15, 168], [-20, 172]];
  for (const [la, lo] of rim) for (let k = 0; k < 5; k++) blocks.push({ lat: la + (rnd() - 0.5) * 6, lon: lo + (rnd() - 0.5) * 6, a: 0.6 + rnd() * 1.1, b: 0.5 + rnd() * 0.8, rot: rnd() * 180, v: 0.5 + rnd() * 0.5, e: 0.6 });
  stamp(w, mt, blocks);
  stamp(w, mt, [{ lat: -21, lon: 173, a: 4, b: 3.4, g: true, v: 0.9 }, { lat: -35, lon: 176, a: 4.5, b: 3.6, g: true, v: 0.8 }]);
  const pit = new Float32Array(n);
  stamp(w, pit, [{ lat: -21, lon: 173, a: 1.2, g: true }, { lat: -35, lon: 176, a: 1.4, g: true }]);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y], pol = sstep(55, 80, lat), south = sstep(-30, -60, lat);
    for (let x = 0; x < w; x++) {
      const i = row + x, s = sp[i], t = tomb[i], d = cth[i], m = mac[i] * (1 - d), mo = mt[i] * clamp(0.7 + n1[i] * 3, 0, 1);
      hg[i] += mo * 0.6 - pit[i] * 0.4;
      const a = clamp(al[i], 0.5, 1.4);
      // base: peach / tan mottling, greyer Lowell Regio polar cap, light south
      const v = clamp(0.7 + n2[i] * 1.1 + n1[i] * 0.9 + sstep(15, 35, lat) * (1 - pol) * 0.25 - (1 - sstep(5, 25, Math.abs(lat))) * 0.2, 0, 1);
      let R = mix(168, 222, v), G = mix(118, 186, v), B = mix(86, 152, v);
      R = mix(R, 172, pol); G = mix(G, 158, pol); B = mix(B, 146, pol);
      R = mix(R, 210, south); G = mix(G, 182, south); B = mix(B, 156, south);
      R *= a; G *= a; B *= a;
      if (t > 0) { const lt = clamp(t * (0.9 + n1[i] * 1.5), 0, 1); R = mix(R, 236, lt); G = mix(G, 218, lt); B = mix(B, 198, lt); }
      if (s > 0) { R = mix(R, 238 * a, s); G = mix(G, 228 * a, s); B = mix(B, 212 * a, s); }
      if (d > 0) { const dk = clamp(d * (0.95 + n1[i] * 2 + n2[i]), 0, 1); R = mix(R, 86 * a, dk); G = mix(G, 42 * a, dk); B = mix(B, 28 * a, dk); }
      if (m > 0) { const mk = clamp(m * (0.6 + n1[i] * 3 + n2[i] * 2), 0, 1) * 0.8; R = mix(R, 120 * a, mk); G = mix(G, 70 * a, mk); B = mix(B, 50 * a, mk); }
      const tt = tart[i] * 0.35;
      if (tt > 0) { R = mix(R, 150, tt); G = mix(G, 105, tt); B = mix(B, 82, tt); }
      c.R[i] = R; c.G[i] = G; c.B[i] = B;
    }
  }
  bakeRelief(c, hg, 0.5);
  return finish(c, hg, 90);
}

// ---------------------------------------------------------------- Charon

const CHARON_KM = 10.6;
function paintCharon(w: number): BodyMaps {
  const c = canvas(w), n = c.n, g = grid(w);
  const n1 = fbm(w, { f: 3, oct: 9, seed: 201, gain: 0.55 }), n2 = fbm(w, { f: 1.4, oct: 5, seed: 202, cap: 256 });
  // Vulcan Planitia: smoother southern plains bounded by the equatorial chasma belt
  const vul = new Float32Array(n), hg = new Float32Array(n), al = new Float32Array(n);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y];
    for (let x = 0; x < w; x++) {
      const i = row + x, v = 1 - sstep(-6, 4, lat + Math.sin(g.lon[x] * D2R * 2) * 6 + n2[i] * 25);
      vul[i] = v;
      hg[i] = mix(n1[i] * 0.45 + n2[i] * 0.4 + 0.08, n1[i] * 0.12 + n2[i] * 0.2 - 0.08, v);
      al[i] = 1 + n1[i] * 0.25 + n2[i] * 0.2 + v * 0.04;
    }
  }
  // chasmata: Serenity, Mandjet, Argo… a belt of canyons running roughly east–west just north of the plains
  const rnd = mulberry32(203), ch: Blob[] = [];
  const belts: [number, number, number, number, number][] = [[5, -40, 70, 85, 0.05], [12, 10, 75, 70, 0.08], [2, 70, 80, 60, -0.05], [18, -120, 95, 60, 0.04], [8, 140, 100, 70, -0.04]];
  for (const [la, lo, br, len, cu] of belts) {
    ch.push(...path(arc(la, lo, br, len, cu, 2), 1.4, 1, true, 0.4));
    for (let k = 0; k < 2; k++) ch.push(...path(arc(la + (rnd() - 0.5) * 6, lo + (rnd() - 0.5) * 8, br + (rnd() - 0.5) * 10, len * 0.5, cu, 2), 0.7, 0.7, true, 0.4));
  }
  const cm = new Float32Array(n);
  stamp(w, cm, ch);
  for (let i = 0; i < n; i++) { hg[i] -= cm[i] * 0.5; al[i] += cm[i] * 0.08; }
  stampCraters(w, hg, al, genCraters(w, { seed: 204, cover: 0.14, rMin: 0.25, rMax: 4, dk: 0.13, rays: 0.02, fp: 10 }), { rim: 0.04, floor: -0.03, fresh: 0.3, ray: 0.25, halo: 0.6 });
  stampCraters(w, hg, al, named(CHARON_KM, [
    [58, 35, 240, { d: 0.15, fl: 0.6 }],                                           // Dorothy (Gale)
    [49, -23, 35, { f: 1, ray: 6, tint: -0.3 }], [55, -45, 26, { f: 1, ray: 8 }], // Organa (dark ejecta), Skywalker
    [-25, 20, 40, { f: 0.6, ray: 7 }], [14, -95, 60, { f: 0.4 }], [-40, -150, 70, {}],
  ]), { rim: 0.04, floor: -0.03, fresh: 0.35, ray: 0.35 });
  const mt = new Float32Array(n);   // Kubrick & Clarke Montes standing in moats
  stamp(w, mt, [{ lat: -3, lon: 2, a: 1.2, g: true }, { lat: -12, lon: 10, a: 1.6, b: 1, g: true, v: 0.7 }, { lat: -8, lon: 16, a: 0.9, g: true, v: 0.6 }]);
  const moat = new Float32Array(n);
  stamp(w, moat, [{ lat: -3, lon: 2, a: 2.2, g: true }, { lat: -12, lon: 10, a: 2.6, b: 1.8, g: true }]);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, lat = g.lat[y];
    for (let x = 0; x < w; x++) {
      const i = row + x, mord = sstep(52, 72, lat + n1[i] * 18 + n2[i] * 10), core = sstep(70, 88, lat + n1[i] * 10);
      hg[i] += mt[i] * 0.7 - moat[i] * 0.2;
      const a = clamp(al[i], 0.4, 1.6);
      let R = 152 * a, G = 148 * a, B = 144 * a;
      R = mix(R, 136 * a, vul[i] * 0.4); G = mix(G, 134 * a, vul[i] * 0.4); B = mix(B, 134 * a, vul[i] * 0.4);
      R = mix(R, 112 * a, mord); G = mix(G, 80 * a, mord); B = mix(B, 66 * a, mord);
      R = mix(R, 92 * a, core * 0.6); G = mix(G, 58 * a, core * 0.6); B = mix(B, 46 * a, core * 0.6);
      c.R[i] = R; c.G[i] = G; c.B[i] = B;
    }
  }
  bakeRelief(c, hg, 0.5);
  return finish(c, hg, 100);
}

// ---------------------------------------------------------------- entry points

// ---------------------------------------------------------------- small moons, Saturn's and Uranus's moons, distant dwarfs

const kmDeg = (radiusKm: number) => (radiusKm * TAU) / 360;

/** Shared start for the airless worlds: two noise fields, a height field and an albedo field around 1. */
function rocky(w: number, seed: number, hAmp = 0.4, aAmp = 0.2) {
  const c = canvas(w), n = c.n;
  const n1 = fbm(w, { f: 3, oct: 10, seed, gain: 0.55 }), n2 = fbm(w, { f: 1.3, oct: 5, seed: seed + 1, cap: 256 });
  const hg = new Float32Array(n), al = new Float32Array(n);
  for (let i = 0; i < n; i++) { hg[i] = (n1[i] + n2[i]) * hAmp; al[i] = 1 + (n1[i] + n2[i]) * aAmp; }
  return { c, n, n1, n2, hg, al };
}

/** Angular distance (deg) of every pixel from (lat, lon). */
function distFrom(w: number, lat: number, lon: number): F32 {
  const g = grid(w), out = new Float32Array(g.n), s0 = Math.sin(lat * D2R), c0 = Math.cos(lat * D2R), sl0 = Math.sin(lon * D2R), cl0 = Math.cos(lon * D2R);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, a = g.sl[y] * s0, b = g.cl[y] * c0;
    for (let x = 0; x < w; x++) out[row + x] = Math.acos(clamp(a + b * (g.co[x] * cl0 + g.so[x] * sl0), -1, 1)) * R2D;
  }
  return out;
}

/** Points along the great circle 90° from a pole (lat, lon), from angle t0 to t1 (deg). */
function greatCircle(lat: number, lon: number, t0: number, t1: number, step = 2): [number, number][] {
  const p = [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
  const u = Math.abs(p[2]) > 0.9 ? [1, 0, 0] : [-p[1], p[0], 0], ul = Math.hypot(u[0], u[1], u[2]);
  const U = u.map(x => x / ul), V = [p[1] * U[2] - p[2] * U[1], p[2] * U[0] - p[0] * U[2], p[0] * U[1] - p[1] * U[0]];
  const pts: [number, number][] = [];
  for (let t = t0; t <= t1; t += step) {
    const ct = Math.cos(t * D2R), st = Math.sin(t * D2R), q = [U[0] * ct + V[0] * st, U[1] * ct + V[1] * st, U[2] * ct + V[2] * st];
    pts.push([Math.asin(clamp(q[2], -1, 1)) * R2D, Math.atan2(q[1], q[0]) * R2D]);
  }
  return pts;
}

/** A family of roughly parallel grooves or wisps: n arcs scattered in a lat/lon box. */
function lineSet(seed: number, k: number, box: [number, number, number, number], bearing: [number, number], len: [number, number], r: number, curve = 0): Blob[] {
  const rnd = mulberry32(seed), out: Blob[] = [];
  const [la0, la1, lo0, lo1] = box;
  for (let i = 0; i < k; i++) {
    const pts = arc(la0 + rnd() * (la1 - la0), lo0 + rnd() * (lo1 - lo0), bearing[0] + rnd() * (bearing[1] - bearing[0]), len[0] + rnd() * (len[1] - len[0]), curve * (rnd() - 0.5) * 2, Math.max(0.5, r));
    out.push(...path(pts, r * (0.6 + rnd() * 0.6), 0.5 + rnd() * 0.5, true, 0.5));
  }
  return out;
}

function paintPhobos(w: number): BodyMaps {
  const { c, n, n1, n2, hg, al } = rocky(w, 501, 0.5, 0.12);
  // the grooves: chains of pits running roughly parallel to the orbit, crossing everywhere but the trailing side
  const gr = new Float32Array(n);
  stamp(w, gr, lineSet(502, 34, [-60, 60, -170, 60], [62, 108], [40, 110], 0.8, 0.4));
  const stk = distFrom(w, 1, -49);
  for (let i = 0; i < n; i++) { hg[i] -= gr[i] * 0.22; al[i] -= gr[i] * 0.07; }
  stampCraters(w, hg, al, genCraters(w, { seed: 503, cover: 0.2, rMin: 0.8, rMax: 9, dk: 0.16, fp: 12 }), { rim: 0.05, floor: -0.05, fresh: 0.15, ray: 0.1, halo: 0.5 });
  const K = kmDeg(11.08);
  stampCraters(w, hg, al, named(K, [
    [1, -49, 9, { d: 0.9, rim: 0.2, fl: 0.25, f: 0.2 }], [-11, -54, 2, { d: 0.3 }],       // Stickney, Limtoc inside it
    [-80, -150, 5.4, { d: 0.6 }], [-60, -5, 2.5, {}], [37, 22, 1.8, {}], [15, 150, 2, {}], // Hall, Todd, Clustril, Drunlo-ish
  ]), { rim: 0.05, floor: -0.05, fresh: 0.25, ray: 0.2 });
  // the "blue" unit: brighter, bluer material sprayed around Stickney
  const blue = new Float32Array(n);
  for (let i = 0; i < n; i++) blue[i] = (1 - sstep(18, 50, stk[i] + n2[i] * 25)) * 0.8;
  for (let i = 0; i < n; i++) al[i] *= 1 + blue[i] * 0.18 + n1[i] * 0.05;
  tint(c, al, [108, 98, 90], [118, 118, 122], blue, 0.4, 1.6);
  bakeRelief(c, hg, 0.8);
  return finish(c, hg, 100);
}

function paintDeimos(w: number): BodyMaps {
  const { c, n, n1, n2, hg, al } = rocky(w, 511, 0.35, 0.08);
  // a thick blanket of dust smooths everything: soft, shallow craters and bright streaks down the slopes
  stampCraters(w, hg, al, genCraters(w, { seed: 512, cover: 0.12, rMin: 1, rMax: 8, dk: 0.07, fp: 14 }), { rim: 0.02, floor: -0.02, fresh: 0.1, ray: 0, halo: 0.3 });
  stampCraters(w, hg, al, named(kmDeg(6.27), [[22, -3.5, 1.9, { d: 0.25, f: 0.2 }], [12.5, -1, 1, { d: 0.15, f: 0.3 }], [-30, 120, 3, { d: 0.3 }]]), // Voltaire, Swift
    { rim: 0.02, floor: -0.03, fresh: 0.2, ray: 0 });
  const st = new Float32Array(n);
  stamp(w, st, lineSet(513, 14, [-50, 50, -180, 180], [-20, 20], [8, 20], 2.2));
  for (let i = 0; i < n; i++) al[i] += st[i] * 0.22 * (0.6 + n2[i]);
  for (let i = 0; i < n; i++) hg[i] = hg[i] * 0.8 + n1[i] * 0.05;
  tint(c, al, [132, 120, 108], undefined, null, 0.4, 1.6);
  bakeRelief(c, hg, 0.6);
  return finish(c, hg, 100);
}

function paintMimas(w: number): BodyMaps {
  const { c, hg, al } = rocky(w, 521, 0.35, 0.12);
  stampCraters(w, hg, al, genCraters(w, { seed: 522, cover: 0.32, rMin: 0.35, rMax: 9, dk: 0.15, fp: 11 }), { rim: 0.05, floor: -0.05, fresh: 0.2, ray: 0.1, halo: 0.5 });
  stampCraters(w, hg, al, named(kmDeg(198.2), [
    [-1.4, -111.8, 139, { d: 0.9, rim: 0.25, fl: 0.35, pk: 0.75 }],                     // Herschel: the "Death Star" crater
    [-55, 165, 60, {}], [42, 72, 50, {}], [-12, 40, 45, {}], [60, -40, 40, {}],
  ]), { rim: 0.06, floor: -0.05, fresh: 0.2, ray: 0.2 });
  tint(c, al, [196, 196, 194], undefined, null, 0.5, 1.5);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

function paintTethys(w: number): BodyMaps {
  const { c, n, n2, hg, al } = rocky(w, 531, 0.3, 0.1);
  stampCraters(w, hg, al, genCraters(w, { seed: 532, cover: 0.26, rMin: 0.3, rMax: 7, dk: 0.12, fp: 12 }), { rim: 0.04, floor: -0.04, fresh: 0.2, ray: 0.1, halo: 0.5 });
  const K = kmDeg(531.1);
  stampCraters(w, hg, al, named(K, [
    [32.8, -128.9, 445, { d: 0.12, rim: 0.12, fl: 0.7, pk: 0.4 }],                       // Odysseus: huge but flattened by time
    [-10, 111, 207, { d: 0.12 }], [-58, 168, 255, { d: 0.14 }],                           // Penelope, Melanthius
  ]), { rim: 0.05, floor: -0.04, fresh: 0.2, ray: 0.2 });
  // Ithaca Chasma: a canyon three-quarters of the way round, on the great circle 90° from Odysseus
  const ch = new Float32Array(n), fl = new Float32Array(n);
  const gc = greatCircle(32.8, -128.9, 20, 290, 1.5);
  stamp(w, ch, path(gc, 4.5, 1, true, 0.4));
  stamp(w, fl, path(gc, 7.5, 1, true, 0.4));
  for (let i = 0; i < n; i++) { hg[i] += fl[i] * 0.08 - ch[i] * (0.32 + n2[i] * 0.2); al[i] -= ch[i] * 0.05; }
  tint(c, al, [214, 212, 208], undefined, null, 0.5, 1.4);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

/** Dione and Rhea: bright cratered ice with a darker trailing side laced by bright wispy cliffs. */
function wispy(w: number, seed: number, base: RGB, wispBox: [number, number, number, number], rows: Named[], radiusKm: number): BodyMaps {
  const { c, n, n1, n2, hg, al } = rocky(w, seed, 0.3, 0.1);
  const trail = distFrom(w, 0, 90);
  const lead = (lat: number, lon: number) => 0.45 + 0.55 * sstep(60, 120, Math.acos(clamp(Math.cos(lat * D2R) * Math.cos((lon - 90) * D2R), -1, 1)) * R2D);
  stampCraters(w, hg, al, genCraters(w, { seed: seed + 1, cover: 0.28, rMin: 0.3, rMax: 7, dk: 0.12, fp: 12, keep: lead }), { rim: 0.04, floor: -0.04, fresh: 0.25, ray: 0.12, halo: 0.5 });
  stampCraters(w, hg, al, named(kmDeg(radiusKm), rows), { rim: 0.05, floor: -0.04, fresh: 0.3, ray: 0.45 });
  const wi = new Float32Array(n);
  stamp(w, wi, lineSet(seed + 2, 22, wispBox, [150, 210], [25, 70], 0.9, 0.6));
  for (let i = 0; i < n; i++) {
    const dark = 1 - sstep(40, 95, trail[i] + n2[i] * 30);
    al[i] *= 1 - dark * 0.28;
    al[i] += wi[i] * (0.45 + n1[i]) * 0.9;
    hg[i] -= wi[i] * 0.12;
  }
  tint(c, al, base, undefined, null, 0.4, 1.7);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

const paintDione = (w: number) => wispy(w, 541, [204, 202, 198], [-60, 60, 30, 150], [
  [-57, -145, 350, { d: 0.12, fl: 0.6 }], [25, -47, 155, {}], [-23, -15, 120, {}],          // Evander, Aeneas, Dido
  [49, -76, 40, { f: 1.2, ray: 14 }],                                                        // Creusa: a fresh rayed crater
], 561.4);
const paintRhea = (w: number) => wispy(w, 551, [206, 203, 199], [-55, 55, 35, 145], [
  [34, -151, 360, { d: 0.12, fl: 0.5, rings: [1.6] }], [10, -179, 480, { d: 0.1, fl: 0.6 }], // Tirawa, Mamaldi
  [-14, -112, 48, { f: 1.4, ray: 28 }],                                                      // Inktomi, the "Splat"
], 763.8);

function paintIapetus(w: number): BodyMaps {
  const { c, n, n1, n2, hg, al } = rocky(w, 561, 0.35, 0.08);
  const g = grid(w), apex = distFrom(w, 0, -90);
  stampCraters(w, hg, al, genCraters(w, { seed: 562, cover: 0.27, rMin: 0.3, rMax: 8, dk: 0.13, fp: 12 }), { rim: 0.05, floor: -0.05, fresh: 0.2, ray: 0.05, halo: 0.5 });
  stampCraters(w, hg, al, named(kmDeg(734.5), [
    [17, -28, 580, { d: 0.14, fl: 0.6, rings: [1.5] }], [-43, 96, 504, { d: 0.12, fl: 0.6 }], [-48, 135, 445, { d: 0.12, fl: 0.6 }], // Turgis, Engelier, Gerin
    [-10, -150, 380, { d: 0.12 }], [40, -100, 300, { d: 0.12 }],
  ]), { rim: 0.05, floor: -0.05, fresh: 0.2, ray: 0.2 });
  // the equatorial ridge, up to 20 km tall, running along the middle of the dark side
  const rg = new Float32Array(n);
  stamp(w, rg, path(arc(0.5, -175, 90, 150, 0.01, 1), 1.3, 1, true, 0.4));
  // Cassini Regio: dark, reddish dust coating the leading side; the poles and trailing side stay bright
  const dark = new Float32Array(n);
  for (let y = 0; y < g.h; y++) {
    const row = y * w, la = Math.abs(g.lat[y]);
    for (let x = 0; x < w; x++) { const i = row + x; dark[i] = 1 - sstep(62, 78, apex[i] + la * 0.35 + n2[i] * 22 + n1[i] * 8); }
  }
  for (let i = 0; i < n; i++) { hg[i] += rg[i] * 0.6; al[i] = mix(al[i], al[i] * 0.22, dark[i]); }
  tint(c, al, [222, 214, 200], [255, 190, 140], dark, 0.12, 1.4);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

function paintMiranda(w: number): BodyMaps {
  const { c, n, n1, n2, hg, al } = rocky(w, 571, 0.35, 0.1);
  // coronae: oval "racetracks" of parallel bright and dark ridges set in old cratered ground
  const cor: [number, number, number][] = [[-66.9, -34.3, 30], [-29.1, 73.7, 38], [-24.4, -102.9, 38]]; // Inverness, Arden, Elsinore
  const ds = cor.map(([la, lo]) => distFrom(w, la, lo));
  const inC = (lat: number, lon: number) => {
    let m = 1;
    cor.forEach(([la, lo, r]) => { const d = Math.acos(clamp(Math.sin(la * D2R) * Math.sin(lat * D2R) + Math.cos(la * D2R) * Math.cos(lat * D2R) * Math.cos((lon - lo) * D2R), -1, 1)) * R2D; if (d < r) m = 0.15; });
    return m;
  };
  stampCraters(w, hg, al, genCraters(w, { seed: 572, cover: 0.25, rMin: 0.4, rMax: 6, dk: 0.12, fp: 12, keep: inC }), { rim: 0.04, floor: -0.04, fresh: 0.2, ray: 0.05, halo: 0.5 });
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < cor.length; k++) {
      const r = cor[k][2], rel = (ds[k][i] + n2[i] * 6) / r;
      if (rel >= 1.05) continue;
      const m = 1 - sstep(0.9, 1.05, rel), band = Math.sin(rel * TAU * 5 + n1[i] * 3);
      hg[i] = mix(hg[i], band * 0.18 + n1[i] * 0.1, m);
      al[i] = mix(al[i], 1 + band * 0.22 + (k === 0 ? 0.1 : -0.05), m);
    }
  }
  // Inverness's bright chevron, and Verona Rupes: the tallest known cliff in the Solar System (~20 km)
  const chev = new Float32Array(n), cl = new Float32Array(n);
  stamp(w, chev, [...path([[-50, -50], [-62, -34], [-50, -18]], 2.2, 1, true, 0.4)]);
  stamp(w, cl, path([[-8, -14], [-18.3, -11.7], [-30, -9]], 1.2, 1, true, 0.4));
  for (let i = 0; i < n; i++) { al[i] += chev[i] * 0.5 + cl[i] * 0.35; hg[i] += cl[i] * 0.5; }
  tint(c, al, [174, 174, 172], undefined, null, 0.4, 1.7);
  bakeRelief(c, hg, 0.8);
  return finish(c, hg, 100);
}

function paintAriel(w: number): BodyMaps {
  const { c, n, n2, hg, al } = rocky(w, 581, 0.3, 0.1);
  stampCraters(w, hg, al, genCraters(w, { seed: 582, cover: 0.13, rMin: 0.3, rMax: 4, dk: 0.12, fp: 10, rays: 0.02 }), { rim: 0.04, floor: -0.04, fresh: 0.3, ray: 0.3, halo: 0.5 });
  stampCraters(w, hg, al, named(kmDeg(578.9), [[-68.7, -81, 78, {}], [-15.1, -64.2, 45, { f: 1, ray: 10 }]]), { rim: 0.05, floor: -0.04, fresh: 0.3, ray: 0.3 }); // Yangoor, Laica-ish
  // chasmata: broad flat-floored rift valleys criss-crossing the surface, their floors smoothed by icy flows
  const wall = new Float32Array(n), floor = new Float32Array(n);
  const rifts: [number, number, number, number, number][] = [[-10, -150, 100, 160, 0.1], [-35, -120, 80, 120, -0.1], [5, -60, 115, 140, 0.05], [-50, 0, 75, 100, 0.08], [-20, 60, 95, 120, -0.06]]; // Kachina, Kewpie, Brownie…
  for (const [la, lo, br, len, cu] of rifts) {
    stamp(w, wall, path(arc(la, lo, br, len, cu, 1), 3.2, 1, true, 0.45));
    stamp(w, floor, path(arc(la, lo, br, len, cu, 1), 2, 1, false, 0.45));
  }
  for (let i = 0; i < n; i++) { hg[i] = mix(hg[i] - wall[i] * 0.25, -0.3 + n2[i] * 0.05, floor[i]); al[i] += floor[i] * 0.12; }
  tint(c, al, [190, 188, 184], undefined, null, 0.4, 1.7);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

function paintUmbriel(w: number): BodyMaps {
  const { c, n, hg, al } = rocky(w, 591, 0.3, 0.06);
  stampCraters(w, hg, al, genCraters(w, { seed: 592, cover: 0.32, rMin: 0.3, rMax: 7, dk: 0.12, fp: 14 }), { rim: 0.04, floor: -0.04, fresh: 0.05, ray: 0, halo: 0.3 });
  stampCraters(w, hg, al, named(kmDeg(584.7), [[-7.9, -86.4, 131, { fl: 0.6 }], [-4.7, -48.4, 98, { pk: 0.7 }], [-1.8, -28.3, 72, { pk: 0.7 }]]), // Wunda, Vuver, Skynd
    { rim: 0.05, floor: -0.04, fresh: 0.1, ray: 0 });
  // Wunda's bright ring (the "fluorescent Cheerio") and the bright central peaks of Vuver and Skynd
  const br = new Float32Array(n), hole = new Float32Array(n);
  stamp(w, br, [{ lat: -7.9, lon: -86.4, a: 5.6, e: 0.3 }, { lat: -4.7, lon: -48.4, a: 1, g: true }, { lat: -1.8, lon: -28.3, a: 0.8, g: true }]);
  stamp(w, hole, [{ lat: -7.9, lon: -86.4, a: 3.6, e: 0.3 }]);
  for (let i = 0; i < n; i++) al[i] += Math.max(0, br[i] - hole[i]) * 1.6;
  tint(c, al, [98, 97, 95], undefined, null, 0.5, 3);
  bakeRelief(c, hg, 0.6);
  return finish(c, hg, 100);
}

function paintTitania(w: number): BodyMaps {
  const { c, n, hg, al } = rocky(w, 601, 0.3, 0.1);
  stampCraters(w, hg, al, genCraters(w, { seed: 602, cover: 0.2, rMin: 0.3, rMax: 6, dk: 0.12, fp: 11, rays: 0.012 }), { rim: 0.04, floor: -0.04, fresh: 0.3, ray: 0.3, halo: 0.5 });
  stampCraters(w, hg, al, named(kmDeg(788.4), [[-15.8, -72.9, 326, { d: 0.12, fl: 0.6, pk: 0.5 }], [-26, 20, 120, {}], [-40, -20, 100, {}]]), // Gertrude, …
    { rim: 0.05, floor: -0.04, fresh: 0.3, ray: 0.3 });
  // Messina Chasmata: faults up to 1500 km long, twin cliffs around a sunken floor
  const ch = new Float32Array(n), ri = new Float32Array(n);
  for (const [la, lo, br, len] of [[-33, -25, 35, 100], [-28, -35, 40, 70], [-10, 20, 30, 50]] as const) {
    stamp(w, ch, path(arc(la, lo, br, len, 0.05, 1), 1.4, 1, true, 0.4));
    stamp(w, ri, path(arc(la, lo, br, len, 0.05, 1), 3, 1, true, 0.4));
  }
  for (let i = 0; i < n; i++) { hg[i] += ri[i] * 0.06 - ch[i] * 0.35; al[i] += ch[i] * 0.1; }
  tint(c, al, [162, 156, 150], undefined, null, 0.4, 1.8);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

function paintOberon(w: number): BodyMaps {
  const { c, n, n2, hg, al } = rocky(w, 611, 0.35, 0.1);
  stampCraters(w, hg, al, genCraters(w, { seed: 612, cover: 0.3, rMin: 0.3, rMax: 7, dk: 0.13, fp: 11, rays: 0.01 }), { rim: 0.05, floor: -0.05, fresh: 0.3, ray: 0.3, halo: 0.5 });
  // big craters floored with dark material: Hamlet, Othello, Macbeth, Falstaff
  stampCraters(w, hg, al, named(kmDeg(761.4), [
    [-46.1, 44.4, 206, { fill: 0.55, fl: 0.5 }], [-66, 42.9, 114, { fill: 0.55 }], [-58.4, 112.5, 203, { fill: 0.6, fl: 0.5 }], [-22.1, 19, 124, { fill: 0.5 }],
    [-30, -60, 140, { f: 1, ray: 8 }],
  ]), { rim: 0.06, floor: -0.05, fresh: 0.3, ray: 0.3 });
  // Mommur Chasma, and a slightly redder trailing side
  const ch = new Float32Array(n), trail = distFrom(w, 0, 90);
  stamp(w, ch, path(arc(-16, 10, 70, 45, 0.05, 1), 1.5, 1, true, 0.4));
  const red = new Float32Array(n);
  for (let i = 0; i < n; i++) { hg[i] -= ch[i] * 0.3; red[i] = (1 - sstep(50, 110, trail[i] + n2[i] * 25)) * 0.6; }
  tint(c, al, [150, 140, 132], [160, 132, 112], red, 0.3, 1.8);
  bakeRelief(c, hg, 0.7);
  return finish(c, hg, 100);
}

/** Eris and Makemake: smooth frost-covered worlds; colours from their spectra (Eris nearly white, Makemake reddish). */
function frosty(w: number, seed: number, base: RGB, spot: RGB, spotAmt: number): BodyMaps {
  const c = canvas(w), n = c.n;
  const n1 = fbm(w, { f: 2.5, oct: 8, seed, gain: 0.5 }), n2 = fbm(w, { f: 1.2, oct: 5, seed: seed + 1, cap: 256 });
  const hg = new Float32Array(n), al = new Float32Array(n), t = new Float32Array(n);
  for (let i = 0; i < n; i++) { hg[i] = n1[i] * 0.15 + n2[i] * 0.2; al[i] = 1 + n1[i] * 0.06 + n2[i] * 0.08; t[i] = sstep(0.05, 0.35, n2[i] + n1[i] * 0.3) * spotAmt; }
  tint(c, al, base, spot, t, 0.5, 1.3);
  return finish(c, hg, 60);
}
const paintEris = (w: number) => frosty(w, 621, [236, 234, 230], [196, 192, 186], 0.4);
const paintMakemake = (w: number) => frosty(w, 631, [214, 182, 152], [168, 116, 86], 0.7);

function paintHaumea(w: number): BodyMaps {
  const c = canvas(w), n = c.n;
  const n1 = fbm(w, { f: 2.5, oct: 8, seed: 641, gain: 0.5 }), n2 = fbm(w, { f: 1.2, oct: 5, seed: 642, cap: 256 });
  // crystalline water ice all over, and the "Dark Red Spot" seen in its light curve
  const sp = new Float32Array(n);
  stamp(w, sp, [{ lat: 5, lon: 30, a: 28, b: 18, e: 0.8 }]);
  const hg = new Float32Array(n), al = new Float32Array(n), t = new Float32Array(n);
  for (let i = 0; i < n; i++) { hg[i] = n1[i] * 0.12 + n2[i] * 0.15; al[i] = 1 + n1[i] * 0.05 + n2[i] * 0.06; t[i] = clamp(sp[i] * (0.8 + n2[i] * 1.5), 0, 1) * 0.75; }
  tint(c, al, [232, 233, 236], [150, 98, 88], t, 0.5, 1.3);
  return finish(c, hg, 60);
}

function paintPlain(w: number): BodyMaps {
  const c = canvas(w);
  c.R.fill(128); c.G.fill(128); c.B.fill(128);
  return finish(c, null);
}

const PAINTERS: Partial<Record<BodyId, (w: number) => BodyMaps>> = {
  moon: paintMoon,
  titan: paintTitan,
  enceladus: paintEnceladus,
  triton: paintTriton,
  pluto: paintPluto,
  charon: paintCharon,
  io: paintIo,
  europa: paintEuropa,
  ganymede: paintGanymede,
  venus: paintVenus,
  sun: paintSun,
  earth: paintEarth,
  jupiter: paintJupiter,
  saturn: paintSaturn,
  uranus: paintUranus,
  neptune: paintNeptune,
  mars: paintMars,
  mercury: paintMercury,
  ceres: paintCeres,
  callisto: paintCallisto,
  phobos: paintPhobos,
  deimos: paintDeimos,
  mimas: paintMimas,
  tethys: paintTethys,
  dione: paintDione,
  rhea: paintRhea,
  iapetus: paintIapetus,
  miranda: paintMiranda,
  ariel: paintAriel,
  umbriel: paintUmbriel,
  titania: paintTitania,
  oberon: paintOberon,
  haumea: paintHaumea,
  makemake: paintMakemake,
  eris: paintEris,
};

export function paintBody(id: BodyId, w: number): BodyMaps {
  w = Math.max(64, w & ~1);
  return (PAINTERS[id] ?? paintPlain)(w);
}

/** Radial ring profile (RGBA, w × 1) from the inner to the outer ring radius. */
export function paintRings(id: BodyId, w: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * 4);
  if (id === 'saturn') {
    const r0 = 1.24, r1 = 2.27, rnd = mulberry32(777), fine = new Float32Array(w);
    // fine radial structure: a few octaves of 1D value noise
    for (let o = 0, amp = 1, step = 64; o < 5; o++, amp *= 0.6, step >>= 1) {
      let a = rnd() * 2 - 1, b = rnd() * 2 - 1;
      for (let x = 0; x < w; x++) { if (x % Math.max(1, step) === 0) { a = b; b = rnd() * 2 - 1; } const t = (x % Math.max(1, step)) / Math.max(1, step); fine[x] += amp * mix(a, b, t * t * (3 - 2 * t)) * 0.4; }
    }
    for (let x = 0; x < w; x++) {
      const r = r0 + ((x + 0.5) / w) * (r1 - r0), f = fine[x];
      let al: number, col: RGB;
      if (r < 1.527) {          // C ring
        al = 0.1 + 0.12 * sstep(1.24, 1.5, r) + f * 0.08 + (Math.abs(r - 1.45) < 0.004 ? -0.15 : 0); col = [150, 138, 122];
      } else if (r < 1.951) {   // B ring
        al = r < 1.64 ? mix(0.62, 0.86, sstep(1.527, 1.64, r)) : 0.9 + 0.06 * Math.sin(r * 90); al += f * 0.12;
        const k = 0.88 + 0.12 * sstep(1.55, 1.75, r) + f * 0.1; col = [232 * k, 214 * k, 182 * k];
      } else if (r < 2.027) {   // Cassini Division
        al = 0.06 + 0.04 * sstep(1.99, 2.02, r) + f * 0.03; col = [110, 104, 96];
      } else {                  // A ring with the Encke and Keeler gaps
        al = 0.62 + f * 0.1 - 0.08 * sstep(2.15, 2.25, r); col = [204, 190, 166];
        const pw = (r1 - r0) / w;
        if (Math.abs(r - 2.214) < Math.max(0.0027, pw)) al = 0.03;
        if (Math.abs(r - 2.265) < Math.max(0.0007, pw * 0.5)) al = 0.15;
      }
      const j = x * 4;
      out[j] = col[0]; out[j + 1] = col[1]; out[j + 2] = col[2]; out[j + 3] = clamp(al, 0, 1) * 255;
    }
  } else if (id === 'haumea') {
    // one narrow ring (~70 km wide) at 2287 km, discovered in a 2017 stellar occultation
    const r0 = 2.86, r1 = 3.0;
    for (let x = 0; x < w; x++) {
      const r = r0 + ((x + 0.5) / w) * (r1 - r0), al = 0.5 * Math.exp(-(((r - 2.93) / 0.03) ** 2));
      const j = x * 4;
      out[j] = 200; out[j + 1] = 196; out[j + 2] = 190; out[j + 3] = al * 255;
    }
  } else if (id === 'uranus') {
    const r0 = 1.64, r1 = 2.0, rings = [[1.637, 0.25], [1.652, 0.25], [1.666, 0.3], [1.75, 0.35], [1.786, 0.35], [1.834, 0.3], [1.863, 0.35], [1.9, 0.4], [1.958, 0.25], [1.992, 0.6]];
    const pw = (r1 - r0) / w, hw = Math.max(pw * 0.9, 0.0012);
    for (let x = 0; x < w; x++) {
      const r = r0 + ((x + 0.5) / w) * (r1 - r0);
      let al = 0;
      for (const [rr, a] of rings) { const d = Math.abs(r - Math.max(r0 + pw, rr)) / hw; if (d < 1.5) al = Math.max(al, a * (d < 0.5 ? 1 : 1.5 - d)); }
      const j = x * 4;
      out[j] = 92; out[j + 1] = 94; out[j + 2] = 100; out[j + 3] = al * 255;
    }
  }
  return out;
}
