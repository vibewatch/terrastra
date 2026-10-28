import * as THREE from 'three';
import { type Builder, type V3, g, add, mat, box, cyl, cone, rod, gable, shade } from '../prims.ts';
import { type HFn, sstep } from '../nature.ts';
import { type VCol, K, W, B, L, S, W2, clamp, smax, Y0, n2, f2, r2, H01, person, terra } from '../kit/terrain.ts';
import { grp } from '../kit/town.ts';

// Hero builders for: fuji, everest, kilimanjaro, matterhorn, tablemountain, uluru.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.


/** Blend the working colour toward a two-tone snow/ice colour (lit → shadowed by the normal's up component). */
const LS = (lit: string, sh: string, ny: number, t: number, lo = 0.35, hi = 0.8) => {
  if (t > 0) W.lerp(W2.copy(K(lit)).lerp(K(sh), sstep(hi, lo, ny)), t > 1 ? 1 : t);
  return W;
};
const smin = (a: number, b: number, k: number) => -smax(-a, -b, k);


// ---- small props -----------------------------------------------------------------------------------------
const LO = () => g('pk:lo', () => new THREE.SphereGeometry(0.5, 9, 6));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
/** Scatter n points with a rejection test; `f` receives (x, z, i). */
function sprinkle(n: number, seed: number, R: number, ok: (x: number, z: number) => boolean, f: (x: number, z: number, i: number) => void, tries = 4): void {
  let placed = 0;
  for (let i = 0; i < n * tries && placed < n; i++) {
    const a = H01(i, seed, 1) * Math.PI * 2, d = Math.sqrt(H01(i, seed, 2)) * R, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ok(x, z)) { f(x, z, i); placed++; }
  }
}
function conifer(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#4a3526', x, y, z, s * 0.07, s * 0.3, 5);
  cone(p, c, x, y + s * 0.18, z, s * 0.32, s * 0.55, 6);
  cone(p, shade(c, 1.12), x, y + s * 0.48, z, s * 0.24, s * 0.52, 6);
}
function decid(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, c2 = shade(c, 1.15)): void {
  cyl(p, '#5b4636', x, y, z, s * 0.07, s * 0.45, 5);
  blob(p, c, x, y + s * 0.6, z, s * 0.34, s * 0.3, s * 0.34);
  blob(p, c2, x + s * 0.12, y + s * 0.78, z + s * 0.06, s * 0.2);
}
function acacia(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number): void {
  const lean = (H01(seed, 3) - 0.5) * 0.3, tx = x + lean * s, ty = y + s * 0.55;
  rod(p, [x, y, z], [tx, ty, z], s * 0.04, '#4a3628', 5);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + seed, ex = tx + Math.cos(a) * s * 0.22, ez = z + Math.sin(a) * s * 0.22;
    rod(p, [tx, ty, z], [ex, y + s * 0.82, ez], s * 0.022, '#4a3628', 4);
  }
  blob(p, '#5d7a34', tx, y + s * 0.88, z, s * 0.42, s * 0.07, s * 0.36, seed);
  blob(p, '#6f8c3e', tx + s * 0.06, y + s * 0.94, z - s * 0.04, s * 0.3, s * 0.05, s * 0.26, seed);
}
/** Reflection-tinted water: mirrors a mountain silhouette (half-width `hw(h)`, colour `mc(h, x)`) about the far shore. */
function mirrorWater(zFar: (x: number) => number, k: number, hw: (h: number) => number, mc: (h: number, x: number) => string | null, cx: number, base: string, sky: string): VCol {
  return (x, _y, z) => {
    const d = z - zFar(x), hr = d * k;
    const rip = Math.sin(z * 260 + Math.sin(x * 40) * 2.5 + n2(x * 30, z * 30) * 4);
    B(sky); L(base, 0.35);
    if (d > 0 && Math.abs(x - cx) < hw(hr)) { const c = mc(hr, x); if (c) { B(c); L(base, 0.45); S(0.8); } }
    if (rip > 0.82) L('#e8f4fb', 0.35);
    return W;
  };
}

// =========================================================================================================
// Mount Fuji — concave stratocone, gullied snow cap, summit crater; Lake Kawaguchi with the mountain mirrored
// in it, and the red five-storey Chureito pagoda among cherry blossom on a foreground hill.
function pagoda(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry);
  const RED = '#c4302b', ROOF = '#3d5a52', EAVE = '#2c403b';
  box(q, '#cfc6b4', 0, -s * 0.03, 0, s * 0.34, s * 0.06, s * 0.34);
  box(q, '#bdb3a0', 0, 0.03 * s, 0, s * 0.28, s * 0.02, s * 0.28);
  let yy = s * 0.05;
  for (let i = 0; i < 5; i++) {
    const w = s * (0.2 - i * 0.022), hh = s * (i === 0 ? 0.085 : 0.07);
    box(q, '#efe6d6', 0, yy, 0, w * 0.92, hh, w * 0.92);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(q, RED, cx * w * 0.46, yy, cz * w * 0.46, w * 0.1, hh, w * 0.1);
    box(q, RED, 0, yy + hh * 0.42, 0, w * 1.0, hh * 0.16, w * 1.0);
    box(q, RED, 0, yy, 0, w * 0.3, hh * 0.85, w * 0.95);
    box(q, '#e9c46a', 0, yy + hh, 0, w * 1.18, s * 0.008, w * 1.18);
    // railing gallery under the roof, then the flared roof (thin eave slab + low hipped cap)
    box(q, EAVE, 0, yy + hh + s * 0.008, 0, w * 1.75, s * 0.012, w * 1.75);
    cone(q, ROOF, 0, yy + hh + s * 0.016, 0, w * 1.22, s * 0.045, 4, Math.PI / 4);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) blob(q, EAVE, cx * w * 0.86, yy + hh + s * 0.022, cz * w * 0.86, s * 0.012, s * 0.006, s * 0.012);
    yy += hh + s * 0.05;
  }
  cyl(q, '#2b2b2b', 0, yy - s * 0.01, 0, s * 0.011, s * 0.22, 6);
  for (let k = 0; k < 9; k++) cyl(q, '#3a3a3a', 0, yy + s * (0.03 + k * 0.016), 0, s * 0.024, s * 0.006, 8);
  blob(q, '#b08d3c', 0, yy + s * 0.22, 0, s * 0.012, s * 0.02, s * 0.012);
}
function sakura(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number): void {
  rod(p, [x, y, z], [x + (H01(seed, 1) - 0.5) * s * 0.2, y + s * 0.5, z], s * 0.06, '#4a3328', 5);
  const pinks = ['#f4b3c6', '#f9cfdb', '#ec9cb5', '#f7c0cf'];
  for (let k = 0; k < 4; k++) {
    const a = k * 2.1 + seed, r = k ? s * 0.22 : 0;
    blob(p, pinks[(k + seed) % 4], x + Math.cos(a) * r, y + s * (0.62 + (k ? 0.04 : 0.12)), z + Math.sin(a) * r, s * (k ? 0.24 : 0.3), s * 0.2, s * (k ? 0.24 : 0.3));
  }
}
const fuji: Builder = gp => {
  const CX = 0, CZ = -0.08, R0 = 0.44, H = 0.43, U0 = 0.072;
  const gully = (a: number) => {
    const n = n2(Math.cos(a) * 2.5 + 7, Math.sin(a) * 2.5);
    const s1 = 0.5 + 0.5 * Math.sin(a * 13 + n * 6), s2 = 0.5 + 0.5 * Math.sin(a * 29 + 1.3 + n * 5);
    const a2 = s1 * s1, a4 = a2 * a2, b2 = s2 * s2, b4 = b2 * b2;
    return Math.max(a4 * a2 * s1, 0.75 * b4 * b4 * s2);
  };
  const prof = (u: number) => { const s = u < U0 ? 1 : Math.max(0, 1 - (u - U0) / (1 - U0)); return H * s * Math.sqrt(s); };
  const LX = 0.1, LZ = 0.31;
  const lakeE = (x: number, z: number) => ((x - LX) / 0.25) ** 2 + ((z - LZ - 0.05 * ((x - LX) / 0.25) ** 2) / 0.062) ** 2;
  const lakeM = (x: number, z: number) => sstep(1, 0.6, lakeE(x, z));
  const HILL: V3 = [-0.3, 0.29, 0.13];
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    let y = prof(u);
    if (u < U0) { const k = u / U0; y = H - 0.03 * (1 - k * k) ** 1.4; }
    else y -= 0.016 * gully(a) * sstep(0.08, 0.3, u) * Math.max(0, 1 - u) ** 0.8;
    y += 0.006 * Math.exp(-(((u - U0) / 0.022) ** 2)) * (0.6 + 0.4 * Math.sin(a * 8));
    if (u > 0.5) y += 0.006 * (f2(x * 16, z * 16, 2, 2) - 0.5) * sstep(0.5, 0.8, u);
    let gnd = 0.016 + 0.03 * f2(x * 6, z * 6, 3, 3);
    gnd += HILL[2] * Math.exp(-(((x - HILL[0]) / 0.12) ** 2 + ((z - HILL[1]) / 0.1) ** 2));
    gnd += 0.05 * sstep(0.36, 0.5, Math.hypot(x, z)) * n2(x * 5 + 7, z * 5) * (z < 0.1 ? 1 : 0.3);
    const e = lakeE(x, z), lm = sstep(1, 0.6, e);
    return (smax(y, gnd, 0.05) - 0.014 * sstep(2.4, 1, e)) * (1 - lm) - 0.004 * lm;
  };
  const WL = 0.012;
  const SNOW = '#f4f7fb', SNOWSH = '#c8d3e3';
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    const t = prof(u) / H, n = f2(x * 11, z * 11, 3, 1);
    B('#2d5434'); L('#44703f', n * 1.2 - 0.2);
    L('#6f8a4a', sstep(0.03, 0.015, y) * 0.6);
    L('#b3a47e', sstep(WL + 0.012, WL + 0.004, y) * sstep(2.5, 1.2, lakeE(x, z)));
    if (y < WL + 0.001) return B('#7d7258');
    L('#5d6249', sstep(0.16, 0.28, t + 0.05 * n));
    L('#5b4a4a', sstep(0.26, 0.4, t));
    if (t > 0.3) L('#454a5c', 0.55 * n2(x * 18 + y * 9, z * 18));
    const sl = 0.66 - 0.27 * gully(a) - 0.07 * n2(Math.cos(a) * 6, Math.sin(a) * 6 + 2);
    const sn = sstep(sl - 0.012, sl + 0.012, t);
    return LS(SNOW, SNOWSH, ny, sn);
  }, {
    n: 100, focus: 0.36, strata: ['#5b4a3a', '#52422f', '#64503e', '#4b3d30'], wl: WL,
    water: mirrorWater(x => LZ + 0.05 * ((x - LX) / 0.25) ** 2 - 0.062 * Math.sqrt(Math.max(0, 1 - ((x - LX) / 0.25) ** 2)), 3.4,
      h => (h > H ? 0 : R0 * (U0 + (1 - U0) * (1 - (h / H) ** (1 / 1.5)))),
      (h, x) => (h / H > 0.62 - 0.3 * gully(Math.atan2(0.4, x - CX) + (x - CX) * 3) ? '#e8eef6' : h / H > 0.25 ? '#4f4b5a' : '#24452c'), CX, '#235d80', '#6fa6c9'),
  });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Chureito pagoda on the hill, cherry trees around it and a vermilion torii at the foot of the stairs
  const [hx, hz] = HILL;
  pagoda(gp, hx + 0.01, gy(hx + 0.01, hz - 0.01), hz - 0.01, 0.16, 0.5);
  [[-0.07, 0.04], [0.06, 0.05], [-0.05, -0.06], [0.07, -0.04], [0.0, 0.08], [-0.1, -0.01], [0.1, 0.02], [-0.02, -0.09]].forEach(([ox, oz], i) =>
    sakura(gp, hx + ox, gy(hx + ox, hz + oz), hz + oz, 0.05 + H01(i, 4) * 0.02, i));
  const tx = hx + 0.1, tz = hz + 0.1, ty = gy(tx, tz);
  for (const k of [-1, 1]) cyl(gp, '#c4302b', tx + k * 0.012, ty, tz, 0.0025, 0.032, 6);
  box(gp, '#1f1f1f', tx, ty + 0.032, tz, 0.036, 0.004, 0.006);
  box(gp, '#c4302b', tx, ty + 0.025, tz, 0.028, 0.003, 0.004);
  for (let i = 0; i < 6; i++) box(gp, '#b9b0a0', hx + 0.08 - i * 0.012, gy(hx + 0.08 - i * 0.012, hz + 0.08 - i * 0.012) - 0.002, hz + 0.08 - i * 0.012, 0.016, 0.006, 0.01, 0.78);
  // Fujikawaguchiko town on the east shore: pale walls, grey/blue/terracotta roofs
  const roofs = ['#5b6472', '#3f5f7a', '#8a4b3a', '#6b6f78'];
  sprinkle(26, 21, 0.47, (x, z) => x > 0.2 && z > 0.06 && z < 0.27 && lakeM(x, z) < 0.01 && hf(x, z) < 0.07, (x, z, i) => {
    const y = gy(x, z), w = 0.014 + H01(i, 5) * 0.008, r = H01(i, 6) * 0.4;
    box(gp, H01(i, 7) > 0.5 ? '#ece6da' : '#d9d4ca', x, y, z, w, 0.01, w * 0.8, r);
    gable(gp, w * 1.15, 0.007, w * 0.9, roofs[i % 4], x, y + 0.01, z, r);
  });
  // Conifer forest on the lower flanks and lowlands
  sprinkle(46, 9, 0.48, (x, z) => {
    const u = Math.hypot(x - CX, z - CZ) / R0;
    return u > 0.72 && lakeM(x, z) < 0.01 && Math.hypot(x - hx, z - hz) > 0.11 && !(x > 0.2 && z > 0.06 && z < 0.27) && hf(x, z) > 0.012;
  }, (x, z, i) => conifer(gp, x, gy(x, z), z, 0.035 + H01(i, 8) * 0.02, i % 3 ? '#24482d' : '#31593a'));
  // Little white tour boat and a swan pedalo on the lake
  const bx = 0.16, bz = LZ + 0.01, wy = Y0 + WL;
  box(gp, '#f8fafc', bx, wy, bz, 0.034, 0.006, 0.012, 0.15);
  box(gp, '#e2e8f0', bx - 0.003, wy + 0.006, bz, 0.018, 0.006, 0.009, 0.15);
  blob(gp, '#f8fafc', 0.0, wy + 0.003, LZ + 0.02, 0.008, 0.005, 0.006);
};

// ---- shape helpers -----------------------------------------------------------------------------------------
type Path = [number, number, number, number][]; // [x, z, y, halfWidth]
const PQ = { d: 0, y: 0, w: 0, t: 0 };
/** Nearest point on a polyline of stations: distance, interpolated height/width and arc parameter t∈[0,1]. */
function along(x: number, z: number, P: Path): typeof PQ {
  let best = 1e9;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1];
    const f = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez));
    const dx = x - a[0] - ex * f, dz = z - a[1] - ez * f, d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; PQ.y = a[2] + (b[2] - a[2]) * f; PQ.w = a[3] + (b[3] - a[3]) * f; PQ.t = (i + f) / (P.length - 1); }
  }
  PQ.d = Math.sqrt(best);
  return PQ;
}
/** Point on a polyline at parameter t with a sideways offset (fraction of the local half-width). */
function pathAt(P: Path, t: number, off = 0): [number, number] {
  const f = clamp(t) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), u = f - i, a = P[i], b = P[i + 1];
  const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1, w = a[3] + (b[3] - a[3]) * u;
  return [a[0] + ex * u - (ez / l) * off * w, a[1] + ez * u + (ex / l) * off * w];
}
/** Crest of a ridge following P (y = crest height, w = half-width), falling off with exponent p. */
const ridge = (x: number, z: number, P: Path, p = 1.1) => { const q = along(x, z, P); const s = 1 - q.d / q.w; return s > 0 ? q.y * Math.pow(s, p) : 0; };
/** n-faced pyramid (sharp arêtes softened by `round`) — Himalayan/Alpine horns. Returns a height fn. */
function pyr(cx: number, cz: number, H: number, r: number, rot: number, nf: number, p: number, round = 0.25): HFn {
  const cs: number[] = [], sn: number[] = [];
  for (let k = 0; k < nf; k++) { const a = rot + (k * Math.PI * 2) / nf; cs.push(Math.cos(a)); sn.push(Math.sin(a)); }
  return (x, z) => {
    const dx = x - cx, dz = z - cz;
    let m = -1e9;
    for (let k = 0; k < nf; k++) { const d = dx * cs[k] + dz * sn[k]; if (d > m) m = d; }
    const s = 1 - ((1 - round) * m + round * Math.sqrt(dx * dx + dz * dz)) / r;
    return s > 0 ? H * Math.pow(s, p) : 0;
  };
}

// =========================================================================================================
// Everest massif from the Khumbu: one dominant three-faced summit pyramid of wind-scoured dark rock with the Yellow
// Band and snow-dusted ledges, the West Shoulder to the left, Lhotse behind and the lower Nuptse wall in front-right.
// The Khumbu Icefall spills out at the foot of the massif and the rubble-covered glacier winds towards the viewer;
// Everest Base Camp sits in tidy tent clusters on the moraine, and a wispy snow plume streams off the summit.
let plumeMat: THREE.MeshStandardMaterial | undefined;
/** Wispy summit streamer: a few twisted, tapered sheets whose vertex alpha fades towards the edges and the tail. */
function plume(gp: THREE.Object3D, sx: number, sy: number, sz: number): void {
  plumeMat ??= new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    roughness: 1, metalness: 0, emissive: new THREE.Color('#8a94a6'), emissiveIntensity: 0.7,
  });
  const NS = 16, pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let r = 0; r < 5; r++) {
    const L = 0.2 + H01(r, 81) * 0.14, th0 = 0.5 + r * 0.55, dy = (H01(r, 82) - 0.5) * 0.03, dz = (H01(r, 83) - 0.5) * 0.04;
    const a0 = 0.6 - r * 0.07, base = pos.length / 3;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, x = sx + 0.006 + t * L, y = sy - 0.006 + dy * t + 0.012 * Math.sin(t * 5 + r) * t - 0.01 * t * t;
      const z = sz - t * L * 0.22 + dz * t + 0.01 * Math.sin(t * 4 + r * 2) * t;
      const w = 0.004 + 0.042 * Math.pow(t, 0.75), th = th0 + t * 0.9, cy = Math.cos(th) * w, cz = Math.sin(th) * w;
      const al = a0 * sstep(0, 0.12, t) * Math.pow(1 - t, 1.4);
      pos.push(x, y - cy, z - cz, x, y, z, x, y + cy, z + cz);
      col.push(0.93, 0.95, 0.98, 0, 1, 1, 1, al, 0.93, 0.95, 0.98, 0);
      if (i < NS) { const k = base + i * 3; idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, plumeMat);
  m.renderOrder = 2;
  gp.add(m);
}
const everest: Builder = gp => {
  const EH = 0.74, EX = -0.06, EZ = -0.18;
  // Khumbu glacier: icefall from the foot of the Western Cwm, then a curving tongue towards the viewer
  const G: Path = [[0.03, 0.03, 0.2, 0.045], [-0.08, 0.08, 0.14, 0.052], [-0.19, 0.13, 0.09, 0.058], [-0.27, 0.21, 0.066, 0.062],
    [-0.24, 0.3, 0.054, 0.066], [-0.1, 0.36, 0.046, 0.068], [0.06, 0.4, 0.04, 0.07], [0.22, 0.43, 0.034, 0.07], [0.36, 0.42, 0.03, 0.068]];
  const TI1 = 2.7 / 8; // end of the icefall section on the glacier path
  const NUP: Path = [[-0.03, 0.0, 0.22, 0.15], [0.1, 0.05, 0.31, 0.16], [0.25, 0.03, 0.34, 0.17], [0.4, -0.07, 0.27, 0.17]];
  const COL: Path = [[EX + 0.03, EZ - 0.03, 0.52, 0.15], [0.1, -0.29, 0.43, 0.16], [0.24, -0.33, 0.48, 0.16]];
  const WSH: Path = [[EX - 0.02, EZ + 0.01, 0.5, 0.2], [-0.27, -0.08, 0.36, 0.2], [-0.45, 0.0, 0.2, 0.18]];
  const LNW: Path = [[0.24, -0.33, 0.44, 0.17], [0.36, -0.15, 0.36, 0.18], [0.31, 0.0, 0.3, 0.17]];
  const BC: [number, number] = [-0.37, 0.15];
  const pE = pyr(EX, EZ, EH, 0.37, Math.PI / 2 + Math.PI / 3 - 0.3, 3, 1.18, 0.1);
  const pL = pyr(0.24, -0.33, 0.56, 0.3, Math.PI / 2 - 0.3, 3, 1.1, 0.18);
  const pC = pyr(-0.33, -0.33, 0.36, 0.26, 0.4, 4, 1.15), pP = pyr(0.42, -0.27, 0.3, 0.22, 1.1, 3, 1.15);
  const hf: HFn = (x, z) => {
    const rg = r2(x * 9, z * 9, 3, 1);
    const e = pE(x, z);
    let y = Math.max(e, pL(x, z));
    y = Math.max(y, ridge(x, z, COL, 1.0), ridge(x, z, WSH, 1.1), ridge(x, z, LNW, 1.1));
    y = Math.max(y, ridge(x, z, NUP, 1.15) * (0.86 + 0.28 * r2(x * 14, z * 14, 2, 4)));
    y = Math.max(y, pC(x, z), pP(x, z));
    // smoother, crisper faces on the summit pyramid; craggier elsewhere
    const pyrK = sstep(0.3, 0.55, e) * (e >= y - 0.001 ? 1 : 0);
    y += (0.006 + y * (0.15 - 0.1 * pyrK)) * (rg - 0.5);
    const gnd = 0.022 + 0.03 * f2(x * 6, z * 6, 3, 2);
    y = gnd + Math.max(0, y - gnd) * (0.4 + 0.6 * sstep(0.5, 0.36, Math.hypot(x, z)));
    y = smax(y, gnd, 0.04);
    const q = along(x, z, G);
    if (q.d < q.w * 3) {
      const ice = sstep(TI1 + 0.03, TI1 - 0.02, q.t);
      const surf = ice * 0.012 * r2(x * 38, z * 38, 2, 3) + 0.004 * n2(x * 30, z * 30);
      const dd = Math.max(0, q.d - q.w * 0.8);
      const cut = smin(y, q.y + surf + dd * 1.4 + dd * dd * 8, 0.03);
      y += (cut - y) * sstep(0, 0.08, q.t);
      if (q.t > TI1) y += 0.016 * Math.exp(-(((q.d - q.w * 1.2) / 0.018) ** 2)) * sstep(TI1, TI1 + 0.06, q.t);
    }
    const bc = Math.hypot(x - BC[0], z - BC[1]);
    if (bc < 0.1) y += (0.06 + 0.003 * n2(x * 40, z * 40) - y) * sstep(0.1, 0.06, bc);
    return y;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 2, 5), t = y / EH;
    B('#6f665d'); L('#877c70', n); L('#5d544c', sstep(0.6, 0.85, n2(x * 30, z * 30)) * 0.6);
    const rock = sstep(0.06, 0.13, y);
    const de = Math.hypot(x - EX, z - EZ), summit = sstep(0.24, 0.12, de) * sstep(0.4, 0.5, t);
    if (rock > 0) {
      W2.copy(K('#4a4542')).lerp(K('#625a54'), n).lerp(K('#2c2a2c'), sstep(0.5, 0.25, ny) * 0.55);
      W2.lerp(K('#2a2729'), summit * 0.75);
      W.lerp(W2, rock);
      L('#a88f68', sstep(0.05, 0.012, Math.abs(y - 0.58 - 0.02 * n)) * sstep(0.2, 0.1, de) * 0.75);
    }
    // ledges: thin horizontal snow bands on steep rock
    const ledge = sstep(0.42, 0.74, n2((x - z) * 10 + 3, y * 13)) * sstep(0.15, 0.38, ny) * (0.55 + 0.45 * sstep(0.25, 0.55, n2(x * 7 + 9, z * 7)));
    const streak = sstep(0.6, 0.82, n2((x + z * 0.6) * 22, y * 5)) * sstep(0.25, 0.5, ny);
    const sl = ny + 0.14 * (n - 0.5) + 0.06 * t;
    const face = sstep(0.52, 0.7, sl - 0.2 * summit);
    const snow = Math.max(face * (1 - 0.55 * summit), ledge * (0.55 + 0.35 * summit), streak * 0.7 * (1 - 0.5 * summit)) * sstep(0.1, 0.16, y);
    LS('#f5f8fc', '#b9c9dc', ny, snow);
    const q = along(x, z, G), gm = sstep(q.w * 1.05, q.w * 0.7, q.d) * sstep(0, 0.05, q.t);
    if (gm > 0) {
      if (q.t < TI1 + 0.02) {
        W2.copy(K('#eef4fa')).lerp(K('#9fbdd6'), sstep(0.5, 0.9, r2(x * 40, z * 40, 2, 3)));
      } else {
        W2.copy(K('#8a837c')).lerp(K('#a19a92'), n2(x * 40, z * 40)).lerp(K('#e9f0f6'), sstep(0.55, 0.2, q.d / q.w) * sstep(0.35, 0.6, n2(x * 25 + 3, z * 25)));
      }
      W.lerp(W2, gm);
    }
    return W;
  }, { n: 104, focus: 0.3, strata: ['#5a5048', '#665b51', '#4f4740', '#5f564c'] });

  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Seracs tumbling down the icefall and ice pinnacles on the lower glacier
  for (let i = 0; i < 40; i++) {
    const t = 0.03 + H01(i, 31) * (TI1 - 0.04), [x, z] = pathAt(G, t, (H01(i, 32) - 0.5) * 1.4);
    const s = 0.006 + H01(i, 33) * 0.008;
    box(gp, i % 3 ? '#eef5fb' : '#cfe0ee', x, gy(x, z), z, s, s * (0.8 + H01(i, 34)), s * 0.8, H01(i, 35) * 3, (H01(i, 36) - 0.5) * 0.5);
  }
  for (let i = 0; i < 24; i++) {
    const t = TI1 + 0.05 + H01(i, 41) * 0.4, [x, z] = pathAt(G, t, (H01(i, 42) - 0.5) * 0.7);
    cone(gp, '#f1f6fa', x, gy(x, z), z, 0.004 + H01(i, 43) * 0.003, 0.01 + H01(i, 44) * 0.01, 5);
  }
  plume(gp, EX, Y0 + hf(EX, EZ), EZ);
  // Base camp: three tidy clusters of dome tents in muted expedition colours, mess tents, puja altar and flags
  const tc = ['#a8693f', '#b39a5a', '#6e7452', '#7d4a3e', '#5b6676'];
  const CL: [number, number, number][] = [[-0.04, -0.035, 0.5], [0.04, -0.005, -0.3], [-0.015, 0.05, 0.2]];
  CL.forEach(([ox, oz, ry], c) => {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (let i = 0; i < 6; i++) {
      const u = (i % 3) * 0.019 - 0.019, v = Math.floor(i / 3) * 0.019 - 0.0095;
      const x = BC[0] + ox + u * cs - v * sn, z = BC[1] + oz + u * sn + v * cs;
      blob(gp, tc[(i + c * 2) % tc.length], x, gy(x, z) + 0.002, z, 0.0085, 0.0062, 0.0085, ry);
    }
  });
  for (const [ox, oz, c] of [[0.045, 0.05, '#b8a274'], [-0.065, 0.02, '#8d8a7c']] as const) {
    const x = BC[0] + ox, z = BC[1] + oz, y = gy(x, z);
    box(gp, c, x, y, z, 0.026, 0.01, 0.014, 0.4);
    gable(gp, 0.028, 0.008, 0.016, shade(c, 0.85), x, y + 0.01, z, 0.4);
  }
  const ax = BC[0] + 0.0, az = BC[1] + 0.012, ay = gy(ax, az);
  box(gp, '#9a948c', ax, ay, az, 0.016, 0.008, 0.016);
  box(gp, '#b5afa6', ax, ay + 0.008, az, 0.01, 0.006, 0.01);
  cyl(gp, '#7c5a3a', ax, ay + 0.014, az, 0.0014, 0.055, 5);
  const fc = ['#2563eb', '#f8fafc', '#dc2626', '#16a34a', '#facc15'];
  const top: V3 = [ax, ay + 0.066, az];
  for (let l = 0; l < 4; l++) {
    const a = (l / 4) * Math.PI * 2 + 0.6, ex = ax + Math.cos(a) * 0.07, ez = az + Math.sin(a) * 0.055, ey = gy(ex, ez) + 0.004;
    for (let i = 1; i < 11; i++) {
      const u = i / 11, x = top[0] + (ex - top[0]) * u, z = top[2] + (ez - top[2]) * u, y = top[1] + (ey - top[1]) * u - Math.sin(u * Math.PI) * 0.012;
      box(gp, fc[i % 5], x, y - 0.005, z, 0.004, 0.005, 0.001, -a + Math.PI / 2);
    }
  }
  for (let i = 0; i < 18; i++) {
    const x = BC[0] - 0.1 + H01(i, 61) * 0.2, z = BC[1] - 0.08 + H01(i, 62) * 0.16;
    if (Math.hypot(x - BC[0], z - BC[1]) > 0.08) blob(gp, '#6b645c', x, gy(x, z) + 0.002, z, 0.006 + H01(i, 63) * 0.006, 0.004, 0.006, H01(i, 64) * 3);
  }
  [[0.02, 0.07, '#b45343'], [0.035, 0.065, '#3f4f6b'], [-0.07, -0.02, '#c0713f']].forEach(([ox, oz, c]) => person(gp, BC[0] + (ox as number), gy(BC[0] + (ox as number), BC[1] + (oz as number)), BC[1] + (oz as number), c as string, 1.2));
};

// =========================================================================================================
// Kilimanjaro: the broad, flat-topped Kibo cone with its last ice cliffs on the crater rim, the jagged Mawenzi
// spires to the east joined by the saddle, a belt of cloud around the forest zone, and savanna with acacias,
// elephants and giraffes in the foreground.
function elephant(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry), c = '#7d7670';
  blob(q, c, 0, s * 0.62, 0, s * 0.5, s * 0.34, s * 0.3);
  for (const [lx, lz] of [[0.3, 0.15], [0.3, -0.15], [-0.3, 0.15], [-0.3, -0.15]]) rod(q, [lx * s, s * 0.5, lz * s], [lx * s, 0, lz * s], s * 0.1, c, 5);
  blob(q, c, s * 0.55, s * 0.78, 0, s * 0.22, s * 0.22, s * 0.2);
  for (const sz of [1, -1]) blob(q, '#6e6761', s * 0.5, s * 0.8, sz * s * 0.2, s * 0.06, s * 0.2, s * 0.17, 0, 0, sz * 0.2);
  rod(q, [s * 0.7, s * 0.72, 0], [s * 0.82, s * 0.3, 0], s * 0.06, c, 5);
  rod(q, [s * 0.82, s * 0.3, 0], [s * 0.86, s * 0.08, 0], s * 0.045, c, 5);
  for (const sz of [1, -1]) rod(q, [s * 0.68, s * 0.62, sz * s * 0.08], [s * 0.86, s * 0.5, sz * s * 0.1], s * 0.022, '#efe6d0', 4);
}
function giraffe(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry), c = '#d9a24a', d = '#7a4a22';
  blob(q, c, 0, s * 0.62, 0, s * 0.28, s * 0.14, s * 0.12, 0, 0, 0.18);
  for (const [lx, lz] of [[0.18, 0.06], [0.18, -0.06], [-0.18, 0.06], [-0.18, -0.06]]) rod(q, [lx * s, s * 0.6, lz * s], [lx * s, 0, lz * s], s * 0.03, c, 4);
  rod(q, [s * 0.2, s * 0.68, 0], [s * 0.42, s * 1.28, 0], s * 0.045, c, 5);
  blob(q, c, s * 0.48, s * 1.3, 0, s * 0.1, s * 0.05, s * 0.05);
  rod(q, [s * 0.4, s * 1.34, 0], [s * 0.38, s * 1.42, 0], s * 0.01, d, 3);
  for (let i = 0; i < 6; i++) blob(q, d, (H01(i, 81) - 0.5) * s * 0.4, s * (0.62 + (H01(i, 82) - 0.3) * 0.2), (H01(i, 83) > 0.5 ? 1 : -1) * s * 0.1, s * 0.045, s * 0.04, s * 0.03);
}
const kilimanjaro: Builder = gp => {
  const KX = -0.07, KZ = -0.08, KH = 0.4, KR = 0.56, KT = 0.15;
  const MX = 0.33, MZ = -0.06;
  const SAD: Path = [[KX, KZ, 0.32, 0.2], [0.17, -0.08, 0.24, 0.2], [MX, MZ, 0.24, 0.16]];
  const SHI: Path = [[KX, KZ, 0.24, 0.22], [-0.36, -0.08, 0.16, 0.18], [-0.48, -0.02, 0.08, 0.12]];
  const kibo = (x: number, z: number) => {
    const dx = x - KX, dz = (z - KZ) * 1.12, d = Math.hypot(dx, dz);
    const s = clamp((KR - d) / (KR - KT));
    let y = KH * s * Math.sqrt(s) * (0.5 + 0.5 * s);
    y += 0.008 * Math.exp(-(((d - KT * 0.6) / 0.018) ** 2));
    y -= 0.018 * sstep(KT * 0.55, KT * 0.3, d) - 0.012 * sstep(0.03, 0.0, d);
    return y;
  };
  // remnant ice fields on the summit plateau: [a0, a1, r0, r1, thickness]
  const ICE = [[-2.75, -1.2, 0.075, 0.16, 0.014], [-1.0, -0.25, 0.085, 0.155, 0.011], [0.6, 1.2, 0.1, 0.152, 0.011], [2.25, 2.85, 0.1, 0.15, 0.009], [-0.7, 0.2, 0.0, 0.045, 0.007]];
  const ice = (x: number, z: number) => {
    const dx = x - KX, dz = (z - KZ) * 1.12, d = Math.hypot(dx, dz);
    if (d > 0.17) return 0;
    const a = Math.atan2(dz, dx);
    let m = 0;
    for (const [a0, a1, r0, r1, h] of ICE) {
      const e = 0.012 + 0.006 * n2(x * 90, z * 90);
      const ma = Math.min(a - a0, a1 - a) * Math.max(d, 0.05), mr = Math.min(d - r0, r1 - d);
      if (r0 === 0) { const md = Math.min(ma, mr); m = Math.max(m, h * sstep(0, 0.01, md)); } else m = Math.max(m, h * sstep(e - 0.012, e, Math.min(ma, mr) + 0.01));
    }
    return m;
  };
  const pM = pyr(MX, MZ, 0.33, 0.21, 0.5, 5, 1.2, 0.3);
  const hf: HFn = (x, z) => {
    let y = kibo(x, z) + ice(x, z);
    y = smax(y, ridge(x, z, SAD, 1.2) * (0.92 + 0.12 * n2(x * 14, z * 14)), 0.04);
    y = smax(y, ridge(x, z, SHI, 1.3), 0.04);
    const m = pM(x, z) * (0.68 + 0.55 * r2(x * 22, z * 22, 2, 7));
    y = smax(y, m, 0.03);
    const gnd = 0.02 + 0.02 * f2(x * 5, z * 5, 3, 3);
    y = smax(y, gnd, 0.05);
    y += (0.002 + y * 0.05) * (f2(x * 26, z * 26, 2, 9) - 0.5);
    return y;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 10, z * 10, 2, 5), m = n2(x * 34, z * 34), t = y / KH;
    B('#c2a35c'); L('#a99a4e', sstep(0.5, 0.8, n) * 0.7); L('#d4b878', sstep(0.6, 0.85, m) * 0.5);
    const tf = t + 0.05 * n;
    L('#3e6a33', sstep(0.15, 0.2, tf) * sstep(0.4, 0.34, tf));
    L('#2c5329', sstep(0.18, 0.24, tf) * sstep(0.34, 0.28, tf) * 0.6 * m);
    L('#8a8258', sstep(0.34, 0.42, tf) * sstep(0.58, 0.5, tf));
    L('#6f8a3c', sstep(0.12, 0.16, tf) * sstep(0.2, 0.16, tf) * 0.6);
    if (t > 0.48) {
      W2.copy(K('#857262')).lerp(K('#9a8572'), m).lerp(K('#56504c'), sstep(0.72, 0.92, t));
      W.lerp(W2, sstep(0.48, 0.56, t));
    }
    if (Math.hypot(x - MX, z - MZ) < 0.18 && t > 0.4) L('#4c4642', sstep(0.4, 0.55, t) * sstep(0.85, 0.55, ny) * 0.8);
    const dk = Math.hypot(x - KX, (z - KZ) * 1.12);
    const snow = sstep(0.82, 0.93, t) * sstep(0.42, 0.62, n + 0.25 * sstep(-0.05, -0.2, z - KZ) - 0.18 * sstep(KT * 0.7, KT * 0.4, dk))
      + sstep(0.66, 0.86, t) * sstep(0.74, 0.86, n2((Math.atan2(z - KZ, x - KX)) * 12, dk * 4)) * sstep(-0.02, -0.12, z - KZ);
    LS('#f4f8fb', '#c3d0de', ny, clamp(snow));
    const ic = ice(x, z);
    if (ic > 0.001) { W2.copy(K('#f7fbff')).lerp(K('#b9d3e8'), sstep(0.7, 0.3, ny)); W.lerp(W2, sstep(0.001, 0.004, ic)); }
    return W;
  }, { n: 92, focus: 0.34, strata: ['#8c6a46', '#9b7a52', '#7f5f3f', '#a0805a'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;

  // Cloud belt hugging the forest zone (gap towards the viewer)
  const cl = mat('#ffffff', { transparent: 0.78, flat: false, emissive: '#5b6472' });
  const CG = g('pk:cloud', () => new THREE.SphereGeometry(0.5, 10, 7));
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + H01(i, 91) * 0.15;
    const cz = Math.sin(a), cx = Math.cos(a);
    if (cz > 0.3 && cx > -0.6 && cx < 0.9) continue;
    const r = 0.33 + H01(i, 93) * 0.05, x = KX + 0.03 + cx * r, z = KZ + cz * r * 0.9;
    const w = 0.03 + H01(i, 94) * 0.025, y = Y0 + clamp(hf(x, z), 0.1, 0.15) + 0.008 + H01(i, 95) * 0.012;
    add(gp, CG, cl, x, y, z, w * 2.4, w * 1.1, w * 1.6, -a);
    add(gp, CG, cl, x + cz * w * 0.6, y + w * 0.4, z - cx * w * 0.6, w * 1.4, w * 1.0, w * 1.2, -a);
  }
  // Savanna: acacias, grass tussocks, elephants and giraffes
  const low = (x: number, z: number) => hf(x, z) < 0.06;
  sprinkle(13, 101, 0.48, (x, z) => low(x, z) && z > -0.05, (x, z, i) => acacia(gp, x, gy(x, z), z, 0.05 + H01(i, 102) * 0.03, i));
  sprinkle(34, 103, 0.49, low, (x, z, i) => blob(gp, i % 3 ? '#9c8a45' : '#7f7a3a', x, gy(x, z) + 0.002, z, 0.008, 0.004, 0.008));
  sprinkle(22, 107, 0.47, (x, z) => { const y = hf(x, z); return y > 0.065 && y < 0.14; }, (x, z, i) => blob(gp, i % 2 ? '#2f5a2c' : '#3b6631', x, gy(x, z) + 0.008, z, 0.012, 0.012, 0.012));
  elephant(gp, 0.06, gy(0.06, 0.38), 0.38, 0.05, -0.4);
  elephant(gp, 0.13, gy(0.13, 0.35), 0.35, 0.042, -0.6);
  elephant(gp, 0.1, gy(0.1, 0.41), 0.41, 0.026, -0.5);
  giraffe(gp, -0.2, gy(-0.2, 0.36), 0.36, 0.07, 0.9);
  giraffe(gp, -0.26, gy(-0.26, 0.3), 0.3, 0.06, 1.3);
};

// =========================================================================================================
// Matterhorn: the four-faced horn seen from above Zermatt — the Hörnli ridge running straight at the viewer, the
// snow-plastered east face and darker north face banded by snowy ledges, the summit hook, glaciers at its foot,
// the Hörnli hut, larch meadows with the Riffelsee mirroring the peak and dark-timbered Zermatt chalets.
function chalet(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, seed: number): void {
  const q = grp(p, x, y, z, ry), w = s, d = s * (0.8 + H01(seed, 1) * 0.3);
  box(q, '#c9c3b8', 0, 0, 0, w, s * 0.35, d);
  box(q, H01(seed, 2) > 0.4 ? '#5b3a24' : '#6e4a2c', 0, s * 0.35, 0, w * 0.96, s * 0.5, d * 0.96);
  box(q, '#3d2718', 0, s * 0.42, d * 0.52, w * 0.9, s * 0.04, s * 0.12);
  for (const k of [-1, 1]) box(q, '#f3efe6', k * w * 0.24, s * 0.5, d * 0.485, w * 0.16, s * 0.14, s * 0.02);
  gable(q, w * 1.25, s * 0.42, d * 1.15, '#555a63', 0, s * 0.85, 0, Math.PI / 2);
}
const matterhorn: Builder = gp => {
  const HX = 0.0, HZ = -0.1, HH = 0.8, HR = 0.4, ROT = -0.33;
  const ha = ROT + Math.PI / 4; // Hörnli arête bearing (towards the viewer)
  const HOR: Path = [[HX + Math.cos(ha) * 0.04, HZ + Math.sin(ha) * 0.04, 0.6, 0.12], [HX + Math.cos(ha) * 0.22, HZ + Math.sin(ha) * 0.22, 0.3, 0.12], [HX + Math.cos(ha) * 0.33, HZ + Math.sin(ha) * 0.33, 0.1, 0.1]];
  const BK1: Path = [[-0.5, -0.2, 0.2, 0.16], [-0.3, -0.36, 0.3, 0.16], [-0.12, -0.44, 0.24, 0.12]];
  const BK2: Path = [[0.16, -0.42, 0.24, 0.12], [0.34, -0.3, 0.3, 0.16], [0.52, -0.12, 0.2, 0.16]];
  const LK: [number, number, number, number] = [-0.16, 0.3, 0.15, 0.065];
  const lakeE = (x: number, z: number) => ((x - LK[0]) / LK[2]) ** 2 + ((z - LK[1]) / LK[3]) ** 2;
  const pB = pyr(HX, HZ, HH * 0.86, HR, ROT, 4, 1.45, 0.12), pS = pyr(HX - 0.05, HZ - 0.03, HH, 0.2, ROT + 0.12, 4, 0.9, 0.2);
  const horn = (x: number, z: number) => smax(pB(x, z), pS(x, z), 0.03);
  const hf: HFn = (x, z) => {
    let y = horn(x, z);
    y = smax(y, ridge(x, z, HOR, 1.0) * (0.9 + 0.15 * r2(x * 20, z * 20, 2, 5)), 0.02);
    y = Math.max(y, ridge(x, z, BK1, 1.2) * (0.85 + 0.3 * r2(x * 12, z * 12, 2, 6)), ridge(x, z, BK2, 1.2) * (0.85 + 0.3 * r2(x * 12, z * 12, 2, 7)));
    y += (0.003 + y * 0.06) * (r2(x * 16, z * 16, 3, 8) - 0.5) + y * 0.07 * sstep(0.12, 0.3, y) * (r2(x * 30 + 5, z * 30, 2, 9) - 0.5);
    // ledges: compress the slope periodically so snow settles on the bands
    if (y > 0.12) { const w = y + 0.03 * n2(x * 9, z * 9), a = 0.4 * sstep(0.35, 0.65, n2(x * 7 + 3, w * 9)); y -= (a * Math.sin(w * Math.PI * 2 * 11)) / (Math.PI * 2 * 11) * sstep(0.12, 0.2, y); }
    let gnd = 0.02 + 0.03 * f2(x * 5, z * 5, 3, 3) + 0.06 * sstep(0.1, -0.25, z);
    gnd = gnd + 0.02 * Math.exp(-(((x - 0.3) / 0.12) ** 2 + ((z - 0.28) / 0.1) ** 2));
    y = smax(y, gnd, 0.05);
    const e = lakeE(x, z), lm = sstep(1, 0.55, e);
    return (y - 0.006 * sstep(1.6, 1, e)) * (1 - lm) + 0.006 * lm;
  };
  const WL = 0.016;
  terra(gp, 0.5, hf, (x, y, z, nx, ny, nz) => {
    const n = f2(x * 11, z * 11, 3, 1), m = n2(x * 36, z * 36), dh = Math.hypot(x - HX, z - HZ);
    B('#5d8a3e'); L('#7a9a48', n * 0.8); L('#4a7536', sstep(0.6, 0.85, m) * 0.5);
    L('#a39c84', sstep(WL + 0.01, WL + 0.003, y) * sstep(2.2, 1.2, lakeE(x, z)));
    const rock = sstep(0.07, 0.12, y + 0.02 * n);
    if (rock > 0) {
      W2.copy(K('#5a5049')).lerp(K('#7a6d60'), m).lerp(K('#33302d'), sstep(0.5, 0.2, ny) * 0.6);
      if (y > 0.2) W2.lerp(K('#a08a6c'), 0.3 * sstep(0.3, 0.7, n2(y * 40, n * 3)));
      W.lerp(W2, rock);
    }
    // east face (facing +x / +z quadrant towards the light) holds more snow than the dark north face
    const face = nx * Math.cos(ROT + Math.PI / 2) + nz * Math.sin(ROT + Math.PI / 2);
    const sn = sstep(0.5, 0.64, ny + 0.2 * (f2(x * 26, y * 22 + z * 26, 2, 4) - 0.5) + 0.16 * face + 0.08 * (y / HH)) * sstep(0.1, 0.16, y);
    const glac = sstep(0.06, 0.12, y) * sstep(0.62, 0.8, ny) * sstep(0.12, 0.2, dh) * sstep(0.1, -0.05, z);
    LS('#f4f7fb', '#bccbe0', ny, Math.max(sn, glac));
    return W;
  }, {
    n: 104, focus: 0.3, strata: ['#5d5044', '#685a4c', '#544739', '#6b5d4e'], wl: WL,
    water: mirrorWater(x => LK[1] - LK[3] * Math.sqrt(Math.max(0, 1 - ((x - LK[0]) / LK[2]) ** 2)), 1.6,
      h => (h > HH ? 0 : 0.13 * (1 - h / HH) ** 1.4 + 0.004),
      h => (h / HH > 0.22 ? (h / HH > 0.45 ? '#e6edf5' : '#7d7570') : '#3d6b35'), LK[0] + 0.02, '#2b6585', '#79acd0'),
  });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Hörnli hut perched on the ridge shoulder
  const [hx, hz] = pathAt(HOR, 0.62);
  const hy = gy(hx, hz);
  box(gp, '#e7e2d8', hx, hy, hz, 0.026, 0.016, 0.016, -ha);
  gable(gp, 0.028, 0.008, 0.018, '#6b7280', hx, hy + 0.016, hz, -ha);
  // Zermatt chalets clustered on the right, a white church with a spire
  sprinkle(16, 121, 0.47, (x, z) => x > 0.12 && z > 0.18 && Math.hypot(x - 0.3, z - 0.3) < 0.16, (x, z, i) =>
    chalet(gp, x, gy(x, z), z, 0.026 + H01(i, 122) * 0.01, 0.4 + (H01(i, 123) - 0.5) * 0.4, i));
  const cx = 0.25, cz = 0.4, cy = gy(cx, cz);
  box(gp, '#f3f1ec', cx, cy, cz, 0.03, 0.022, 0.02, 0.4);
  gable(gp, 0.032, 0.01, 0.022, '#4b5563', cx, cy + 0.022, cz, 0.4);
  box(gp, '#f3f1ec', cx + 0.018, cy, cz - 0.008, 0.01, 0.045, 0.01, 0.4);
  cone(gp, '#3f4652', cx + 0.018, cy + 0.045, cz - 0.008, 0.008, 0.022, 4, 0.4 + Math.PI / 4);
  // larches and spruces on the meadows, skipping the lake and the village
  sprinkle(54, 131, 0.49, (x, z) => { const y = hf(x, z); return y < 0.1 && lakeE(x, z) > 1.6 && Math.hypot(x - 0.3, z - 0.3) > 0.13 && Math.hypot(x - HX, z - HZ) > 0.3; },
    (x, z, i) => conifer(gp, x, gy(x, z), z, 0.03 + H01(i, 132) * 0.025, i % 3 ? '#2e5530' : '#6f8f3b'));
  // boulders on the moraine
  sprinkle(20, 141, 0.45, (x, z) => { const y = hf(x, z); return y > 0.07 && y < 0.14; }, (x, z, i) =>
    blob(gp, '#8b8178', x, gy(x, z) + 0.002, z, 0.006 + H01(i, 142) * 0.006, 0.004, 0.006, H01(i, 143) * 3));
  [[-0.12, 0.36, '#dc2626'], [-0.1, 0.37, '#2563eb']].forEach(([x, z, c]) => person(gp, x as number, gy(x as number, z as number), z as number, c as string, 1.4));
};

// =========================================================================================================
// Table Mountain: the dead-flat sandstone tabletop with its sheer, horizontally bedded cliffs and Platteklip Gorge,
// Devil's Peak and Lion's Head/Signal Hill flanking, the "tablecloth" cloud pouring over the edge, the cableway,
// the City Bowl, the Green Point stadium and the V&A harbour on Table Bay.
const tablemountain: Builder = gp => {
  const TX = -0.02, TZ = -0.12, TOP = 0.34, CL = 0.2, AX = 0.29, AZ = 0.085, RT = -0.06;
  const ct = Math.cos(RT), st = Math.sin(RT);
  const tdist = (x: number, z: number) => {
    const lx = (x - TX) * ct - (z - TZ) * st, lz = (x - TX) * st + (z - TZ) * ct;
    const qx = Math.abs(lx) - AX, qz = Math.abs(lz) - AZ;
    let d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 0.015;
    d += 0.007 * (n2(x * 34, z * 34) - 0.5) + 0.004 * Math.sin(lx * 90) * sstep(0, 0.05, lz);
    if (lz > 0) d += 0.016 * Math.exp(-(((lx - 0.03) / 0.011) ** 2)) + 0.01 * Math.exp(-(((lx + 0.15) / 0.009) ** 2));
    return d;
  };
  const pD = pyr(-0.4, -0.08, 0.31, 0.24, 0.3, 4, 1.25, 0.45), pL = pyr(0.36, 0.06, 0.21, 0.15, 0.2, 5, 1.15, 0.6);
  const SAD: Path = [[-0.4, -0.08, 0.22, 0.16], [-0.27, -0.12, 0.2, 0.16]];
  const SIG: Path = [[0.36, 0.06, 0.1, 0.12], [0.45, 0.17, 0.07, 0.1]];
  const BACK: Path = [[TX - 0.2, TZ - 0.12, 0.24, 0.16], [TX + 0.25, TZ - 0.16, 0.24, 0.16], [0.36, -0.3, 0.16, 0.14]];
  const shore = (x: number) => 0.3 + 0.035 * Math.sin(x * 7 + 1) - 0.04 * sstep(0.1, 0.4, x);
  const WL = 0.01;
  const hf: HFn = (x, z) => {
    const d = tdist(x, z);
    let y = d < 0.002 ? TOP - (TOP - CL) * sstep(-0.012, 0.0, d) : 0;
    y = Math.max(y, CL * Math.pow(clamp(1 - (d - 0.01) / 0.27), 1.5) * (0.93 + 0.14 * f2(x * 14, z * 14, 2, 3)));
    if (d < 0) y += 0.004 * f2(x * 20, z * 20, 2, 4) - 0.002;
    // Lion's Head: grassy cone capped by a bare rock knob
    const lh = pL(x, z);
    y = smax(y, lh + 0.03 * sstep(0.13, 0.17, lh), 0.02);
    y = smax(y, pD(x, z) * (0.9 + 0.2 * r2(x * 12, z * 12, 2, 5)), 0.03);
    y = smax(y, Math.max(ridge(x, z, SAD, 1.3), ridge(x, z, SIG, 1.3), ridge(x, z, BACK, 1.2)), 0.03);
    const gnd = 0.02 + 0.015 * f2(x * 6, z * 6, 2, 2);
    y = smax(y, gnd, 0.04);
    const sd = z - shore(x);
    return sd > 0 ? y - (y - 0.0) * sstep(0, 0.03, sd) - 0.02 * sstep(0.02, 0.1, sd) : y;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 2, 5), m = n2(x * 40, z * 40), d = tdist(x, z);
    B('#66724a'); L('#7d8556', n); L('#4d5c3c', sstep(0.55, 0.8, m) * 0.6);
    L('#d8ccaa', sstep(0.03, 0.01, y) * sstep(-0.05, 0.0, z - shore(x)));
    if (y > CL - 0.03 && d < 0.035) {
      const cliff = sstep(0.75, 0.45, ny);
      const band = Math.sin(y * 330 + n * 2.5), b2 = Math.sin(y * 95 + 1);
      W2.copy(K('#8f897d')).lerp(K('#b39b78'), sstep(-0.2, 0.6, b2) * 0.6).lerp(K('#5a554f'), sstep(0.55, 0.9, band) * 0.7).lerp(K('#4c4844'), sstep(0.62, 0.9, n2(x * 70, y * 12)) * 0.5);
      W.lerp(W2, cliff);
      if (d < 0) { W2.copy(K('#7f7c70')).lerp(K('#69704f'), sstep(0.45, 0.75, m)); W.lerp(W2, 1 - cliff); }
    }
    L('#6e665c', sstep(0.6, 0.35, ny) * sstep(0.1, 0.16, y) * 0.6);
    if (pL(x, z) > 0.15) L('#8a7e6e', sstep(0.15, 0.17, pL(x, z)));
    return W;
  }, {
    n: 94, focus: 0.28, strata: ['#7a6248', '#8a7055', '#6e5841', '#94795c'], wl: WL,
    water: (x, _y, z) => {
      const dep = clamp((WL - hf(x, z)) / 0.03), rip = Math.sin(x * 120 + z * 40 + n2(x * 25, z * 25) * 5);
      B('#5fb3be'); L('#1f6688', dep); L('#174f74', sstep(0.1, 0.2, z - shore(x)));
      if (dep < 0.25) L('#f4f8f8', sstep(0.25, 0.05, dep) * 0.7);
      if (rip > 0.9) L('#cfe6ee', 0.25);
      return W;
    },
  });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  const land = (x: number, z: number) => z < shore(x) - 0.012;
  // Sheer sandstone cliff band as its own finely-rowed wall so the horizontal bedding reads crisply
  {
    const per: [number, number][] = [], ex = AX + 0.015, ez = AZ + 0.015, P = 2 * (ex + ez), NC = 168;
    for (let k = 0; k < NC; k++) {
      let t = (k / NC) * P * 2, lx: number, lz: number;
      if (t < 2 * ex) { lx = -ex + t; lz = ez; } else if ((t -= 2 * ex) < 2 * ez) { lx = ex; lz = ez - t; } else if ((t -= 2 * ez) < 2 * ex) { lx = ex - t; lz = -ez; } else { t -= 2 * ex; lx = -ex; lz = -ez + t; }
      per.push([lx, lz]);
    }
    const ray = (dx: number, dz: number, target: number) => {
      let a = 0, b = 0.6;
      for (let it = 0; it < 14; it++) { const m = (a + b) / 2; if (tdist(TX + dx * m, TZ + dz * m) < target) a = m; else b = m; }
      return (a + b) / 2;
    };
    const ROWS = 20, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let k = 0; k < NC; k++) {
      const [lx, lz] = per[k], l = Math.hypot(lx, lz), ux = lx / l, uz = lz / l;
      const dx = ux * ct + uz * st, dz = -ux * st + uz * ct, rc = ray(dx, dz, 0.003);
      const cn = n2(k * 0.35, 3.1), cn2 = n2(k * 1.3, 7.7);
      for (let j = 0; j <= ROWS; j++) {
        const f = j / ROWS, r = j === 0 ? rc - 0.016 : rc + 0.0015 + f * 0.006 + (j === ROWS ? 0.01 : 0);
        const y = j === 0 ? TOP + 0.0015 : TOP - 0.0015 - f * (TOP - CL + 0.012) + (j === ROWS ? 0 : 0.002 * (cn2 - 0.5));
        const x = TX + dx * r, z = TZ + dz * r;
        pos.push(x, Y0 + y, z);
        if (j === 0) { W.copy(K('#7f7c70')).lerp(K('#69704f'), sstep(0.45, 0.75, n2(x * 40, z * 40))); }
        else {
          const band = Math.sin(y * 175 + cn * 1.5), b2 = Math.sin(y * 52 + 1.3);
          W.copy(K('#958e80')).lerp(K('#b9a17c'), sstep(-0.3, 0.7, b2) * 0.55).lerp(K('#5d5852'), sstep(0.4, 0.95, band) * 0.75);
          W.lerp(K('#4e4a46'), sstep(0.55, 0.85, cn) * 0.4 * (1 - f * 0.5)).lerp(K('#6b6557'), sstep(0.7, 1, f) * 0.5);
        }
        col.push(W.r, W.g, W.b);
      }
    }
    const M = ROWS + 1;
    for (let k = 0; k < NC; k++) {
      const k2 = (k + 1) % NC;
      for (let j = 0; j < ROWS; j++) { const a = k * M + j, b = k2 * M + j; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    add(gp, wg, mat('#ffffff', { flat: false, vc: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);
  }

  // City Bowl: CBD towers in the middle, low blocks around, stadium at Green Point
  const wall = ['#e9e4da', '#d8d2c6', '#f2efe8', '#cfc8bb', '#e2d6c0'];
  sprinkle(120, 151, 0.49, (x, z) => land(x, z) && z > 0.1 && hf(x, z) < 0.065 && Math.hypot(x - 0.3, z - 0.27) > 0.05, (x, z, i) => {
    const cbd = Math.exp(-(((x - 0.02) / 0.1) ** 2 + ((z - 0.24) / 0.05) ** 2));
    const w = 0.012 + H01(i, 152) * 0.008, h = 0.008 + H01(i, 153) * 0.01 + cbd * (0.02 + H01(i, 154) * 0.04);
    box(gp, cbd > 0.4 ? (i % 3 ? '#b8c4cf' : '#d9dee3') : wall[i % 5], x, gy(x, z), z, w, h, w * (0.7 + H01(i, 155) * 0.5), RT);
    if (cbd < 0.4 && H01(i, 156) > 0.4) gable(gp, w * 1.05, 0.004, w * 0.8, i % 2 ? '#a65d3f' : '#6b7280', x, gy(x, z) + h, z, RT);
  });
  const sx = 0.3, sz = 0.27, sy = gy(sx, sz);
  cyl(gp, '#f5f5f4', sx, sy, sz, 0.036, 0.014, 18);
  cyl(gp, '#4d8b3a', sx, sy + 0.0142, sz, 0.024, 0.001, 18);
  // V&A Waterfront: quays, breakwater and boats
  for (const [x, z, w, d, r] of [[0.06, 0.33, 0.07, 0.012, 0.1], [0.12, 0.35, 0.012, 0.05, 0.1], [0.0, 0.36, 0.012, 0.05, 0.1], [0.08, 0.41, 0.16, 0.01, 0.25]])
    box(gp, '#a8a29e', x, Y0 + WL - 0.006, z, w, 0.009, d, r);
  for (let i = 0; i < 9; i++) {
    const x = -0.2 + H01(i, 161) * 0.5, z = 0.38 + H01(i, 162) * 0.09;
    if (!land(x, z)) { box(gp, '#f8fafc', x, Y0 + WL, z, 0.016, 0.004, 0.006, H01(i, 163) * 3); if (i % 3 === 0) rod(gp, [x, Y0 + WL, z], [x, Y0 + WL + 0.02, z], 0.0008, '#e5e7eb', 3); }
  }
  // Stone pines on the lower slopes
  sprinkle(28, 171, 0.47, (x, z) => { const y = hf(x, z); return land(x, z) && y > 0.04 && y < 0.12; }, (x, z, i) =>
    decid(gp, x, gy(x, z), z, 0.03 + H01(i, 172) * 0.015, i % 2 ? '#3e5a32' : '#4a6a3a'));
  // Cableway: lower station on the slope, upper station on the front lip of the plateau, cabin halfway
  const [ux, uz] = [TX + 0.15, TZ + AZ - 0.002], [lx, lz] = [TX + 0.17, TZ + AZ + 0.12];
  const uy = Y0 + TOP, ly = gy(lx, lz);
  box(gp, '#e7e5e4', ux, uy, uz, 0.026, 0.014, 0.018, RT);
  box(gp, '#78716c', ux, uy + 0.014, uz, 0.028, 0.003, 0.02, RT);
  box(gp, '#e7e5e4', lx, ly, lz, 0.02, 0.014, 0.016, RT);
  for (const o of [-0.003, 0.003]) rod(gp, [ux + o, uy + 0.01, uz], [lx + o, ly + 0.012, lz], 0.0006, '#334155', 3);
  const cu = 0.45, cxp = ux + (lx - ux) * cu, cyp = uy + 0.01 + (ly + 0.012 - uy - 0.01) * cu - 0.006, czp = uz + (lz - uz) * cu;
  box(gp, '#dc2626', cxp, cyp - 0.009, czp, 0.009, 0.008, 0.009, RT);
  box(gp, '#f1f5f9', cxp, cyp - 0.0045, czp, 0.0092, 0.0025, 0.0092, RT);
  rod(gp, [cxp, cyp - 0.001, czp], [cxp, cyp + 0.002, czp], 0.0006, '#334155', 3);
  // Tablecloth: orographic cloud sitting on the plateau and pouring down the front cliffs
  const CG = g('pk:cloud', () => new THREE.SphereGeometry(0.5, 10, 7));
  const cl = mat('#ffffff', { transparent: 0.85, flat: false, emissive: '#6b7482' });
  for (let i = 0; i < 12; i++) {
    const u = -0.9 + (i / 11) * 1.45 + (H01(i, 181) - 0.5) * 0.08, lz = (H01(i, 182) - 0.15) * AZ * 0.9;
    const x = TX + u * AX * ct + lz * st, z = TZ - u * AX * st + lz * ct;
    add(gp, CG, cl, x, Y0 + TOP + 0.01, z, 0.11 + H01(i, 183) * 0.05, 0.028 + H01(i, 184) * 0.012, 0.08, -RT);
  }
  for (let i = 0; i < 8; i++) {
    const u = -0.72 + (i / 7) * 1.1 + (H01(i, 191) - 0.5) * 0.06, ez = AZ + 0.03;
    const x = TX + u * AX * ct + ez * st, z = TZ - u * AX * st + ez * ct, len = 0.04 + H01(i, 192) * 0.05;
    add(gp, CG, cl, x, Y0 + TOP + 0.004 - len * 0.45, z, 0.11 + H01(i, 193) * 0.03, len, 0.04, -RT, 0.1);
  }
  for (let i = 0; i < 10; i++) {
    const u = -0.78 + (i / 9) * 1.15, ez = AZ + 0.02;
    add(gp, CG, cl, TX + u * AX * ct + ez * st, Y0 + TOP + 0.006, TZ - u * AX * st + ez * ct, 0.07, 0.03, 0.05, -RT);
  }
};

// =========================================================================================================
// Uluru: the great red sandstone loaf — sheer, fluted flanks, ribbed tilted bedding across the rounded top, dark
// water-streaks and tafoni caves at the foot, the Mutitjulu waterhole in a fold of the wall, spinifex, mulga and
// desert oaks on red sand ringed by the base-walk track.
const uluru: Builder = gp => {
  const UX = 0.0, UZ = -0.04, A = 0.37, Bz = 0.175, UH = 0.23, ROT = 0.2;
  const cr = Math.cos(ROT), sr = Math.sin(ROT);
  const GUL = [0.35, 1.25, 1.9, 2.6, 3.5, 4.3, 5.1, 5.8];
  const SH = { lx: 0, lz: 0, rho: 2, r0: 2, g: 0 };
  /** Loaf footprint: superellipse radius `rho` (<1 inside) with fluted walls and deep gullies; `r0` unperturbed. */
  const shape = (x: number, z: number) => {
    const lx = (x - UX) * cr + (z - UZ) * sr, lz = -(x - UX) * sr + (z - UZ) * cr;
    const ax = lx / A, az = lz / Bz, a2 = ax * ax, b2 = az * az;
    const r0 = Math.sqrt(Math.sqrt(a2 * a2 + b2 * b2));
    SH.lx = lx; SH.lz = lz; SH.r0 = r0; SH.rho = r0; SH.g = 0;
    if (r0 > 1.02 || r0 < 0.45) return SH;
    let a = Math.atan2(az, ax); if (a < 0) a += Math.PI * 2;
    let g = 0;
    for (const ga of GUL) { let da = Math.abs(a - ga); if (da > Math.PI) da = Math.PI * 2 - da; if (da < 0.14) { const t = 1 - da / 0.14; g += t * t * (3 - 2 * t); } }
    SH.g = g;
    SH.rho = r0 * (1 + 0.05 * g + 0.012 * Math.sin(a * 46 + 2 * n2(ax * 4, az * 4)));
    return SH;
  };
  const rock = (x: number, z: number) => {
    const { lx, lz, rho, g } = shape(x, z);
    if (rho >= 1) return 0;
    const r6 = rho * rho * rho; const prof = Math.pow(1 - r6 * r6, 0.38);
    const east = 1 - 0.22 * sstep(0.45, 0.85, lx / A) + 0.06 * sstep(0.2, -0.5, lx / A);
    let y = UH * prof * east;
    y *= 1 - 0.18 * g * sstep(0.5, 0.95, rho);
    y += 0.0055 * Math.sin((lx * 0.55 + lz * 1.2) * 95 + 3 * n2(lx * 8, lz * 8)) * sstep(0.95, 0.6, rho);
    y -= 0.015 * Math.exp(-(((lx - 0.08) / 0.03) ** 2)) * sstep(0.6, 0.2, Math.abs(lz / Bz));
    return y;
  };
  const WH: [number, number] = [UX + 0.02 * cr - (Bz + 0.05) * sr, UZ + 0.02 * sr + (Bz + 0.05) * cr];
  const hf: HFn = (x, z) => {
    let gnd = 0.02 + 0.012 * f2(x * 7, z * 7, 3, 2) + 0.004 * n2(x * 40, z * 40);
    const wd = Math.hypot(x - WH[0], z - WH[1]);
    gnd -= 0.03 * sstep(0.05, 0.022, wd);
    return Math.max(gnd, rock(x, z) + 0.012);
  };
  const ring = (x: number, z: number) => { const lx = (x - UX) * cr + (z - UZ) * sr, lz = -(x - UX) * sr + (z - UZ) * cr, ax = lx / (A * 1.3), az = lz / (Bz * 1.55); return Math.abs(Math.sqrt(ax * ax + az * az) - 1) * A; };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 10, z * 10, 3, 5), m = n2(x * 45, z * 45);
    B('#b0472a'); L('#cf6a3a', n * 0.8); L('#8a3a24', sstep(0.6, 0.9, m) * 0.5);
    L('#55552e', sstep(0.5, 0.78, n2(x * 26 + 4, z * 26)) * 0.6); L('#a08a4a', sstep(0.62, 0.85, n2(x * 9 - 3, z * 9)) * 0.4);
    L('#d7b385', sstep(0.008, 0.002, ring(x, z)) * 0.85);
    const r = y - 0.012;
    if (r > 0.002 && shape(x, z).rho < 1.02) {
      const { lx, lz, rho } = SH;
      const steep = sstep(0.75, 0.35, ny);
      W2.copy(K('#c4572e')).lerp(K('#dc7a45'), sstep(0.6, 0.95, ny) * 0.8).lerp(K('#a64326'), steep * 0.5);
      const streak = sstep(0.62, 0.9, n2(Math.atan2(lz / Bz, lx / A) * 34, rho * 3)) * steep;
      W2.lerp(K('#4a2a1e'), streak * 0.75).lerp(K('#8a7468'), sstep(0.85, 1, n2(lx * 70, y * 30)) * steep * 0.4);
      W2.lerp(K('#33190f'), sstep(0.05, 0.02, r) * sstep(0.55, 0.8, n2(lx * 40, lz * 40)) * 0.9);
      W2.lerp(K('#8e3a22'), sstep(0.7, 0.9, ny) * sstep(0.55, 0.8, n2(lx * 90, lz * 90)) * 0.45);
      W.lerp(W2, sstep(0.002, 0.01, r));
    }
    const wd = Math.hypot(x - WH[0], z - WH[1]);
    L('#4e5530', sstep(0.07, 0.045, wd) * 0.7);
    return W;
  }, {
    n: 100, focus: 0.3, strata: ['#a2492a', '#b5582f', '#8f3f24', '#c0663a'], wl: 0.01,
    water: (x, _y, z) => { B('#2f5f63'); L('#6fa59a', sstep(0.035, 0.02, Math.hypot(x - WH[0], z - WH[1]))); return W; },
  });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // tafoni caves at the foot of the walls
  for (let k = 0; k < 18; k++) {
    const a = H01(k, 201) * Math.PI * 2, ax = Math.cos(a), az = Math.sin(a);
    let lo = 0.6, hi = 1.4;
    for (let it = 0; it < 12; it++) { const mm = (lo + hi) / 2, lx = ax * A * mm, lz = az * Bz * mm; if (rock(UX + lx * cr - lz * sr, UZ + lx * sr + lz * cr) > 0.012) lo = mm; else hi = mm; }
    const lx = ax * A * (lo - 0.022), lz = az * Bz * (lo - 0.022), x = UX + lx * cr - lz * sr, z = UZ + lx * sr + lz * cr;
    const w = 0.014 + H01(k, 202) * 0.016, ry = -Math.atan2(az * A, ax * Bz) - ROT + Math.PI / 2;
    blob(gp, '#2a140c', x, Y0 + 0.028 + H01(k, 203) * 0.025, z, w, w * 0.6, w * 0.6, ry);
  }
  const outside = (x: number, z: number, k = 1.08) => Math.hypot(x - WH[0], z - WH[1]) > 0.065 && shape(x, z).rho > k;
  // spinifex hummocks, mulga scrub and desert oaks
  sprinkle(56, 211, 0.49, (x, z) => outside(x, z, 1.12) && ring(x, z) > 0.012, (x, z, i) =>
    blob(gp, i % 3 ? '#b8a45a' : '#9c9a52', x, gy(x, z) + 0.002, z, 0.008 + H01(i, 212) * 0.005, 0.0045, 0.008 + H01(i, 213) * 0.004));
  sprinkle(30, 221, 0.48, (x, z) => outside(x, z, 1.15) && ring(x, z) > 0.015, (x, z, i) =>
    blob(gp, i % 2 ? '#4d5a33' : '#5f6a3b', x, gy(x, z) + 0.008, z, 0.013, 0.009, 0.012));
  sprinkle(14, 231, 0.47, (x, z) => outside(x, z, 1.2) && ring(x, z) > 0.02, (x, z, i) => {
    const y = gy(x, z), h = 0.05 + H01(i, 232) * 0.03;
    rod(gp, [x, y, z], [x, y + h * 0.55, z], 0.0035, '#3b2c22', 5);
    blob(gp, '#4b5a3c', x, y + h * 0.7, z, 0.014, h * 0.32, 0.014);
    blob(gp, '#56664a', x + 0.004, y + h * 0.55, z - 0.003, 0.018, 0.012, 0.016);
  });
  // river red gums shading the Mutitjulu waterhole
  for (let k = 0; k < 4; k++) {
    const a = 3.5 + k * 0.75, x = WH[0] + Math.cos(a) * 0.055, z = WH[1] + Math.sin(a) * 0.04;
    decid(gp, x, gy(x, z), z, 0.045 + H01(k, 241) * 0.015, '#5b7046');
  }
  // tour bus on the ring track
  {
    const a = 2.6, lx = Math.cos(a) * A * 1.32, lz = Math.sin(a) * Bz * 1.32, x = UX + lx * cr - lz * sr, z = UZ + lx * sr + lz * cr;
    box(gp, '#f1f5f9', x, gy(x, z), z, 0.026, 0.01, 0.01, -ROT - 0.5);
    box(gp, '#1e293b', x, gy(x, z) + 0.006, z, 0.0262, 0.003, 0.0102, -ROT - 0.5);
  }
};

export const PEAKS: Record<string, Builder> = { fuji, everest, kilimanjaro, matterhorn, tablemountain, uluru };
