import { passerby } from '../human.ts';
import * as THREE from 'three';
import type { Builder, V3 } from '../prims.ts';
import { add, mat, g, box, cyl, cone, strut, sweep, slab, hash3, lathe, tbox, gable, SPH, CONE, CYL } from '../prims.ts';
import { PAL, W, f2 } from '../kit/terrain.ts';

// Wave-4 nature pack (plants pl_*, volcanoes vo_*, prehistoric animals dn_*). Every model is a compact diorama on a
// vertex-coloured terrain disc (radius ≈0.5, strata skirt), front +z, base y=0. Built for phones: low-segment
// shapes, cached geometry, ≤15k triangles each.

const K = (h: string) => { let c = PAL.get(h); if (!c) { c = new THREE.Color(h); PAL.set(h, c); } return c; };
const B = (h: string) => W.copy(K(h));
const L = (h: string, t: number) => { if (t > 0) W.lerp(K(h), t > 1 ? 1 : t); return W; };
const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const H = (i: number, s: number, k = 0) => hash3(i, s, k);
const TAU = Math.PI * 2;

// ---- terrain disc ----------------------------------------------------------------------------------------
type HF = (x: number, z: number) => number;
/** Vertex painter: returns a colour (usually the shared working colour W). */
type VP = (x: number, y: number, z: number, ny: number) => THREE.Color;
interface TO { rings?: number; segs?: number; pow?: number; y0?: number; wl?: number; strata?: string[]; water?: string }
const Y0 = 0.04;
/** Polar heightfield disc (radius R) with smooth vertex colours and a banded earth skirt down to y=0. */
function terrain(gp: THREE.Object3D, R: number, h: HF, paint: VP, o: TO = {}): void {
  const rings = o.rings ?? 26, segs = o.segs ?? 64, pw = o.pow ?? 1, y0 = o.y0 ?? Y0;
  const pos: number[] = [0, y0 + h(0, 0), 0];
  for (let i = 1; i <= rings; i++) {
    const r = R * Math.pow(i / rings, pw), off = (i % 2) * 0.5;
    for (let j = 0; j < segs; j++) { const a = ((j + off) / segs) * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; pos.push(x, y0 + h(x, z), z); }
  }
  const vi = (i: number, j: number) => 1 + (i - 1) * segs + (((j % segs) + segs) % segs);
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) idx.push(0, vi(1, j + 1), vi(1, j));
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    // staggered rings: odd ring i is rotated half a step
    const a = vi(i, j), b = vi(i, j + 1);
    if (i % 2) { const c = vi(i + 1, j + 1), d = vi(i + 1, j + 2); idx.push(a, b, c, b, d, c); }
    else { const c = vi(i + 1, j), d = vi(i + 1, j + 1); idx.push(a, d, c, a, b, d); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal'), n = pos.length / 3, cols = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const c = paint(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], nor.getY(k));
    cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  add(gp, geo, mat('#ffffff', { flat: false, vc: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);
  // skirt: banded strata from the rim (or water line) down to the ground
  const strata = o.strata ?? ['#6b4f3a', '#5a4130', '#7a5a40', '#4f3a2b'], rows = 4;
  const sp: number[] = [], sc: number[] = [];
  const top = (j: number) => { const k = vi(rings, j) * 3; return [pos[k], o.wl !== undefined ? Math.max(pos[k + 1], o.wl) : pos[k + 1], pos[k + 2]]; };
  for (let j = 0; j < segs; j++) {
    const [x0, t0, z0] = top(j), [x1, t1, z1] = top(j + 1);
    for (let r = 0; r < rows; r++) {
      const a0 = t0 * (1 - r / rows), a1 = t0 * (1 - (r + 1) / rows), b0 = t1 * (1 - r / rows), b1 = t1 * (1 - (r + 1) / rows);
      sp.push(x0, a0, z0, x1, b0, z1, x0, a1, z0, x1, b0, z1, x1, b1, z1, x0, a1, z0);
      const wet = o.wl !== undefined && r === 0 && pos[vi(rings, j) * 3 + 1] < o.wl;
      const c = wet ? K(o.water ?? '#3f7f9f') : K(strata[(r + (H(j >> 2, 7) > 0.6 ? 1 : 0)) % strata.length]);
      for (let q = 0; q < 6; q++) sc.push(c.r, c.g, c.b);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  sg.computeVertexNormals();
  add(gp, sg, mat('#ffffff', { flat: true, vc: true, rough: 0.95 }), 0, 0, 0, 1, 1, 1);
}

/** Flat water sheet (radius R at height y) painted per face with ripples; `keep(x,z)` limits it to a region. */
function water(gp: THREE.Object3D, R: number, y: number, base: string, o: { rings?: number; segs?: number; spot?: (x: number, z: number) => string | null } = {}): void {
  const rings = o.rings ?? 10, segs = o.segs ?? 56;
  const pos: number[] = [], col: number[] = [];
  const P = (i: number, j: number): [number, number] => { const r = (R * 0.985 * i) / rings, a = ((j + (i % 2) * 0.5) / segs) * TAU; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[1] + b[1] + c[1]) / 3;
    const s = o.spot?.(cx, cz);
    const k = s ? K(s) : Math.sin(cx * 70 + Math.sin(cz * 31) * 2.2) > 0.9 ? B(base).multiplyScalar(1.12) : K(base);
    pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
    for (let q = 0; q < 3; q++) col.push(k.r, k.g, k.b);
  };
  for (let j = 0; j < segs; j++) tri([0, 0], P(1, j + 1), P(1, j));
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    if (i % 2) { tri(P(i, j), P(i, j + 1), P(i + 1, j + 1)); tri(P(i, j + 1), P(i + 1, j + 2), P(i + 1, j + 1)); }
    else { tri(P(i, j), P(i + 1, j + 1), P(i + 1, j)); tri(P(i, j), P(i, j + 1), P(i + 1, j + 1)); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  add(gp, geo, mat('#ffffff', { flat: true, vc: true, rough: 0.25, metal: 0.1 }), 0, 0, 0, 1, 1, 1);
}

// ---- cached low-poly shapes ------------------------------------------------------------------------------
/** Jittered icosphere (detail 0 = 20 tris, 1 = 80 tris) — foliage clumps, rocks, fruit. */
const BLOBG = (v: number, d: number) => g(`n2-blob${v}-${d}`, () => {
  const ge = new THREE.IcosahedronGeometry(1, d), p = ge.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash3(Math.round(x * 40) + v * 13, Math.round(y * 40), Math.round(z * 40)) - 0.5) * 0.34;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  ge.computeVertexNormals();
  return ge;
});
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, v = 0, d = 1, ry = 0, rx = 0, rz = 0) =>
  add(p, BLOBG(((v % 5) + 5) % 5, d), mat(c), x, y, z, sx, sy, sz, ry, rx, rz);
/** Smooth low-segment sphere of radii (rx, ry, rz). */
const sph = (p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, s = 8, ry0 = 0, rx0 = 0, rz0 = 0) =>
  add(p, SPH(s), mat(c, { flat: false }), x, y, z, rx * 2, ry * 2, rz * 2, ry0, rx0, rz0);

/** Leaf / petal along +z (unit length & width), folded along the midrib (fold>0 droops edges, <0 cups them),
 *  drooping by `droop`·t², optional vertex-colour gradient c0 (base) → c1 (tip). Closed thin shell. */
function leafGeo(key: string, n: number, wf: (t: number) => number, fold: number, droop: number, c0?: string, c1?: string): THREE.BufferGeometry {
  return g('n2-leaf:' + key, () => {
    const pos: number[] = [], col: number[] = [], idx: number[] = [], th = 0.03;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.max(0.0005, wf(t) * 0.5), yc = -droop * t * t, z = t;
      pos.push(-w, yc - fold * w, z, 0, yc + th * (1 - t), z, w, yc - fold * w, z, 0, yc - th * 0.3 * (1 - t), z);
      if (c0 && c1) { const c = B(c0).lerp(K(c1), Math.pow(t, 0.8)); for (let q = 0; q < 4; q++) col.push(c.r, c.g, c.b); }
    }
    for (let i = 0; i < n; i++) {
      const a = i * 4, b = a + 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); // top
      idx.push(a, a + 3, b, a + 3, b + 3, b, a + 3, a + 2, b + 3, a + 2, b + 2, b + 3); // bottom
    }
    const ge = new THREE.BufferGeometry();
    ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (col.length) ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ge.setIndex(idx);
    ge.computeVertexNormals();
    return ge;
  });
}
const _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** Places a +z-pointing mesh at `at`, aimed along `dir` with its local +y turned toward `up`, scaled (w, len, len). */
function aim(p: THREE.Object3D, geo: THREE.BufferGeometry, c: string, at: V3, dir: V3, len: number, w: number, up: V3 = [0, 1, 0], vc = false): THREE.Mesh {
  const m = add(p, geo, vc ? mat('#ffffff', { flat: false, vc: true }) : mat(c, { flat: false }), at[0], at[1], at[2], w, len, len);
  _z.set(dir[0], dir[1], dir[2]).normalize();
  _y.set(up[0], up[1], up[2]);
  _x.crossVectors(_y, _z);
  if (_x.lengthSq() < 1e-8) { _y.set(1, 0, 0); _x.crossVectors(_y, _z); }
  _x.normalize(); _y.crossVectors(_z, _x);
  m.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  return m;
}
/** Smooth tapered limb / branch through points (radius r0 → r1). */
const limb = (p: THREE.Object3D, pts: V3[], r0: number, r1: number, c: string, radial = 6, sub = 3, paint?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => string | null) =>
  sweep(p, pts.map((pt, i) => ({ p: pt, w: r0 + (r1 - r0) * (i / Math.max(1, pts.length - 1)) })), c, { radial, sub, paint });
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Tiny person for scale (≈0.07 tall at s=1), facing +z rotated by ry. */
function person(p: THREE.Object3D, x: number, y: number, z: number, top: string, ry = 0, s = 1, skin = '#b07850', legs = '#3b3f4a'): void {
  passerby(p, x, y, z, 0.075 * s, 1, { top, ry, skin, bottom: legs });
}

// ---- shared bits -----------------------------------------------------------------------------------------
/** Grass painter: two-tone noise with darker hollows. */
const grassy = (a: string, b: string, f = 9, sd = 0) => (x: number, _y: number, z: number, ny: number) =>
  B(a).lerp(K(b), f2(x * f, z * f, 2, sd)).lerp(K('#6b5a3a'), sst(0.86, 0.7, ny) * 0.6);
/** Stone lantern (tōrō). */
function lantern(p: THREE.Object3D, x: number, y: number, z: number, s = 1): void {
  const c = '#9a968c';
  cyl(p, c, x, y, z, 0.012 * s, 0.006 * s, 6); cyl(p, c, x, y + 0.006 * s, z, 0.006 * s, 0.03 * s, 6);
  box(p, '#8a867c', x, y + 0.036 * s, z, 0.026 * s, 0.018 * s, 0.026 * s);
  box(p, '#ffe9a8', x, y + 0.04 * s, z + 0.0125 * s, 0.01 * s, 0.008 * s, 0.002).material = mat('#ffe9a8', { emissive: '#ffcc66' });
  cone(p, c, x, y + 0.054 * s, z, 0.024 * s, 0.016 * s, 6, Math.PI / 6);
  sph(p, c, x, y + 0.072 * s, z, 0.004 * s, 0.004 * s, 0.004 * s, 6);
}
/** Pagoda-style hipped roof tier: frustum + upturned eaves. */
function hipRoof(p: THREE.Object3D, c: string, x: number, y: number, z: number, w: number, d: number, h: number): void {
  tbox(p, w, d, w * 0.92, d * 0.92, h * 0.12, c, x, y, z);
  tbox(p, w * 0.92, d * 0.92, w * 0.42, d * 0.3, h * 0.88, c, x, y + h * 0.12, z);
}

// ================================================ PLANTS ==================================================

/** Hirosaki Castle hanami: a gnarled pink sakura over a petal carpet, moat with petal rafts, red bridge, keep. */
const sakura: Builder = gp => {
  const hf: HF = (x, z) => {
    const mo = sst(-0.17, -0.21, z) * sst(-0.38, -0.34, z);
    const bank = sst(-0.34, -0.38, z) * 0.075;
    return 0.012 * f2(x * 6, z * 6) * (1 - mo) - mo * 0.035 + bank;
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  const TX = 0.03, TZ = 0.05;
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    if (y < Y0 - 0.008) return B('#4e5a3c');
    if (ny < 0.75) { const blk = Math.abs(Math.floor(y * 90) + Math.floor(x * 30 + (Math.abs(Math.floor(y * 90)) % 2) * 0.5)) % 3; return B('#8d8a82').lerp(K('#6f6c64'), blk * 0.35); }
    const d = Math.hypot(x - TX, z - TZ), path = Math.abs(x - 0.2 + Math.sin(z * 5) * 0.04) < 0.035 && z > -0.2;
    if (path) return B('#c9b99a').lerp(K('#e9b9c9'), f2(x * 40, z * 40) > 0.62 ? 0.7 : 0);
    const c = grassy('#5f8f3e', '#86ad4c', 9)(x, y, z, ny);
    if (z < -0.3) return c;
    const pet = f2(x * 30, z * 30, 2, 3);
    return c.lerp(K('#f5c6d6'), sst(0.34, 0.08, d) * 0.85 + (pet > 0.6 ? 0.55 * sst(0.45, 0.2, d) : 0));
  }, { rings: 26, segs: 64, wl: Y0 - 0.012, water: '#4f7f86' });
  water(gp, 0.5, Y0 - 0.012, '#4f7f86', { rings: 8, segs: 48, spot: (x, z) => (f2(x * 14, z * 14, 2, 5) > 0.62 ? '#f2bfd0' : null) });
  // keep: stone base, three white storeys with green copper roofs
  const KX = -0.15, KZ = -0.41, ky = gy(KX, KZ) - 0.005;
  tbox(gp, 0.15, 0.11, 0.125, 0.09, 0.03, '#77746c', KX, ky, KZ);
  const tiers: [number, number, number][] = [[0.11, 0.08, 0.038], [0.08, 0.06, 0.032], [0.058, 0.044, 0.03]];
  let yy = ky + 0.03;
  tiers.forEach(([w, d, h], i) => {
    box(gp, '#f3f1ea', KX, yy + h / 2, KZ, w, h, d);
    for (let k = -1; k <= 1; k++) box(gp, '#2f3a36', KX + k * w * 0.3, yy + h * 0.55, KZ + d / 2 + 0.001, w * 0.09, h * 0.3, 0.002);
    hipRoof(gp, '#4e7a66', KX, yy + h, KZ, w + 0.026, d + 0.022, i === 2 ? 0.032 : 0.022);
    if (i < 2) gable(gp, w * 0.4, 0.016, 0.012, '#4e7a66', KX, yy + h + 0.004, KZ + d / 2 + 0.008);
    yy += h + (i === 2 ? 0.032 : 0.018);
  });
  box(gp, '#d9b44a', KX, yy + 0.002, KZ, 0.03, 0.004, 0.004);
  // vermilion Gejo bridge arching over the moat
  const bx = 0.2, z0 = -0.15, z1 = -0.4, N = 9;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, tm = (t0 + t1) / 2;
    const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1, arc = (t: number) => Y0 + 0.012 + Math.sin(Math.PI * t) * 0.05;
    const ya = arc(t0), yb = arc(t1), len = Math.hypot(zb - za, yb - ya), ang = Math.atan2(yb - ya, za - zb);
    box(gp, '#9a6a45', bx, (ya + yb) / 2, (za + zb) / 2, 0.06, 0.008, len + 0.002, 0, -ang);
    for (const sx of [-1, 1]) {
      box(gp, '#c8312b', bx + sx * 0.03, (ya + yb) / 2 + 0.022, (za + zb) / 2, 0.005, 0.005, len + 0.002, 0, -ang);
      cyl(gp, '#c8312b', bx + sx * 0.03, ya, za, 0.0035, 0.024, 6);
      if (i === N - 1) cyl(gp, '#c8312b', bx + sx * 0.03, yb, zb, 0.0035, 0.024, 6);
    }
    if (i % 3 === 1) for (const sx of [-1, 1]) cyl(gp, "#5a3b2a", bx + sx * 0.022, Y0 - 0.034, z0 + (z1 - z0) * tm, 0.004, arc(tm) - Y0 + 0.03, 6);
  }
  // the hero sakura: gnarled trunk, spreading limbs, pink cloud canopy
  const bark = '#4a3b35', ty = gy(TX, TZ) - 0.01;
  const top: V3 = [TX - 0.01, ty + 0.17, TZ + 0.01];
  limb(gp, [[TX, ty, TZ], [TX + 0.015, ty + 0.07, TZ - 0.005], [TX - 0.012, ty + 0.13, TZ + 0.01], top], 0.042, 0.026, bark, 8, 3,
    (x, y, z) => (Math.sin(y * 260 + Math.sin(x * 90 + z * 70) * 3) > 0.5 ? '#3a2e29' : null));
  const limbs: V3[] = [[0.26, 0.3, 0.05], [-0.24, 0.32, 0.1], [0.08, 0.36, -0.2], [-0.08, 0.3, 0.26], [0.17, 0.28, 0.24], [-0.16, 0.34, -0.15]];
  const tips: V3[] = [];
  limbs.forEach(([dx, dy, dz], i) => {
    const e: V3 = [TX + dx, ty + dy, TZ + dz], m1 = lerp3(top, e, 0.45);
    m1[1] += 0.06 + H(i, 1) * 0.03;
    limb(gp, [top, m1, e], 0.02, 0.006, bark, 6, 3);
    tips.push(e, m1);
    const side: V3 = [e[0] + (H(i, 2) - 0.5) * 0.14, e[1] + 0.02, e[2] + (H(i, 3) - 0.5) * 0.14];
    limb(gp, [m1, lerp3(m1, side, 0.5), side], 0.01, 0.004, bark, 5, 2);
    tips.push(side);
  });
  const pinks = ['#f7c4d6', '#fbdbe6', '#eea6c1', '#fde9f0', '#f3b3c9'];
  for (let i = 0; i < 44; i++) {
    const a = i * 2.39996, rr = Math.sqrt((i + 0.5) / 44) * 0.3, hgt = 0.39 - (rr / 0.3) ** 2 * 0.1 + (H(i, 4) - 0.5) * 0.04;
    const s = 0.042 + H(i, 5) * 0.026;
    blob(gp, pinks[i % 5], TX + Math.cos(a) * rr, ty + hgt, TZ + Math.sin(a) * rr, s * 1.2, s * 0.7, s * 1.15, i, i % 3 ? 1 : 0, a);
  }
  tips.forEach(([x, y, z], i) => blob(gp, pinks[i % 5], x, y + 0.012, z, 0.045, 0.03, 0.045, i, 0));
  // secondary trees, hanami picnic, lantern
  for (const [x, z, s] of [[-0.36, 0.02, 0.6], [0.4, 0.02, 0.5], [-0.38, 0.28, 0.42]] as [number, number, number][]) {
    const y = gy(x, z) - 0.005;
    strut(gp, [x, y, z], [x, y + 0.18 * s, z], 0.016 * s, 0.01 * s, bark, 6);
    for (let k = 0; k < 6; k++) { const a = k * 2.4; blob(gp, pinks[k % 5], x + Math.cos(a) * 0.08 * s, y + (0.2 + H(k, 9) * 0.08) * s, z + Math.sin(a) * 0.08 * s, 0.075 * s, 0.06 * s, 0.075 * s, k, 0, a); }
    blob(gp, pinks[1], x, y + 0.28 * s, z, 0.08 * s, 0.06 * s, 0.08 * s, 3, 1);
  }
  const px = 0.21, pz = 0.27, py = gy(px, pz) + 0.002;
  box(gp, '#3f7fd0', px, py, pz, 0.15, 0.003, 0.1, 0.3);
  const sit = (x: number, z: number, top: string, ry: number) => {
    add(gp, CONE(6), mat(top), x, py + 0.018, z, 0.03, 0.036, 0.026, ry);
    sph(gp, '#e0b890', x, py + 0.042, z, 0.009, 0.01, 0.009, 6);
    sph(gp, '#222222', x, py + 0.047, z, 0.0092, 0.0068, 0.0092, 6);
  };
  sit(px - 0.04, pz - 0.015, '#e24a5a', 2.2); sit(px + 0.035, pz + 0.01, '#f2d14a', -0.7); sit(px + 0.005, pz - 0.03, '#ffffff', 3);
  box(gp, '#c0392b', px - 0.002, py + 0.006, pz + 0.02, 0.03, 0.01, 0.02, 0.3);
  box(gp, '#111111', px + 0.012, py + 0.004, pz + 0.04, 0.018, 0.006, 0.014, 0.1);
  lantern(gp, -0.3, gy(-0.3, 0.18) - 0.003, 0.18, 1.2);
  lantern(gp, -0.12, gy(-0.12, -0.12) - 0.003, -0.12, 0.9);
  person(gp, -0.18, gy(-0.18, 0.08), 0.08, '#2c4a7a', 0.4, 0.9);
  person(gp, -0.215, gy(-0.215, 0.11), 0.11, '#c45a8a', 0.3, 0.8);
};

/** Red Lotus Sea (Nong Han Kumphawapi): pink sacred lotus rising on stalks above cupped pads, a long-tail boat. */
const PADG = () => g('n2-pad', () => {
  const lg = new THREE.LatheGeometry([[0, -0.004], [0.3, 0.004], [0.62, 0.022], [0.92, 0.05], [1, 0.064], [0.97, 0.07], [0.6, 0.032], [0.28, 0.014], [0, 0.01]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  return lg.toNonIndexed();
});
function lotusFlower(p: THREE.Object3D, base: V3, h: number, s: number, open: number, lean: number, ry = 0): void {
  const top: V3 = [base[0] + Math.cos(ry) * lean, base[1] + h, base[2] + Math.sin(ry) * lean];
  limb(p, [base, lerp3(base, top, 0.6), top], 0.0045 * s, 0.0035 * s, '#5d8a3c', 5, 2);
  const petal = leafGeo('lotus', 6, t => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)), 0.6) * (1 - 0.3 * t), -0.4, -0.12, '#fff2f4', '#e64d88');
  const rings: [number, number, number][] = [[6, 0.25, 0.055], [8, 0.62, 0.07], [8, 1.05, 0.074]];
  rings.forEach(([n, th0, len], ri) => {
    const th = 0.12 + th0 * open;
    for (let k = 0; k < n; k++) {
      const a = ((k + ri * 0.5) / n) * TAU + ry, st = Math.sin(th), ct = Math.cos(th);
      const d: V3 = [Math.cos(a) * st, ct, Math.sin(a) * st], up: V3 = [-Math.cos(a) * ct, st, -Math.sin(a) * ct];
      aim(p, petal, '', [top[0] + Math.cos(a) * 0.008 * s, top[1] + 0.004 * s, top[2] + Math.sin(a) * 0.008 * s], d, len * s, len * s * 0.62, up, true);
    }
  });
  if (open > 0.3) {
    const rc = add(p, g('n2-recep', () => new THREE.LatheGeometry([[0.001, 0], [0.35, 0.12], [0.8, 0.72], [1, 0.95], [0.86, 1], [0.001, 1.02]].map(([r, y]) => new THREE.Vector2(r, y)), 10)), mat('#d6cf5c'), top[0], top[1], top[2], 0.021 * s, 0.022 * s, 0.021 * s);
    rc.rotation.y = ry;
    for (let k = 0; k < 7; k++) { const a = k * 0.9, r = k ? 0.012 * s : 0; sph(p, '#7f8f3a', top[0] + Math.cos(a) * r, top[1] + 0.0225 * s, top[2] + Math.sin(a) * r, 0.0028 * s, 0.0012 * s, 0.0028 * s, 6); }
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; add(p, CONE(4), mat('#f4c430'), top[0] + Math.cos(a) * 0.024 * s, top[1] + 0.012 * s, top[2] + Math.sin(a) * 0.024 * s, 0.006 * s, 0.022 * s, 0.006 * s, 0, Math.sin(a) * 0.5, -Math.cos(a) * 0.5); }
  }
}
const lotus: Builder = gp => {
  const WL = Y0 + 0.004;
  const hf: HF = (x, z) => -0.028 + sst(0.3, 0.1, Math.hypot(x + 0.3, z + 0.32)) * 0.05 + 0.006 * f2(x * 8, z * 8);
  terrain(gp, 0.5, hf, (x, y, z, ny) => (y > WL ? grassy('#5d8a3a', '#86a64e', 10)(x, y, z, ny) : B('#4a5a3a')), { rings: 14, segs: 56, wl: WL, water: '#3d6f6a' });
  water(gp, 0.5, WL, '#3f7069', { rings: 9, segs: 52 });
  const padC = ['#5f9a5c', '#6eaa6a', '#4f8c58', '#78a86a'];
  const pad = (x: number, y: number, z: number, r: number, tilt: number, i: number) => {
    const m = add(gp, PADG(), mat(padC[i % 4]), x, y, z, r, r * 0.8, r, H(i, 1) * 6, tilt * (H(i, 2) - 0.5), tilt * (H(i, 3) - 0.5));
    if (y > WL + 0.01) strut(gp, [x, WL - 0.01, z], [x, y, z], 0.0035, 0.003, '#5d8a3c', 5);
    return m;
  };
  // big cupped pads around the hero flower, some raised on stalks
  const pads: [number, number, number, number][] = [[-0.08, 0.2, 0.0, 0.085], [0.15, 0.16, 0.02, 0.075], [-0.24, 0.0, 0.07, 0.08], [0.1, -0.12, 0.09, 0.09], [-0.12, -0.08, 0.005, 0.07],
    [0.3, 0.06, 0.0, 0.07], [0.02, 0.33, 0.0, 0.07], [-0.3, 0.24, 0.0, 0.065], [0.24, 0.3, 0.05, 0.06], [-0.02, -0.28, 0.06, 0.075], [0.33, -0.12, 0.0, 0.06], [-0.38, -0.05, 0.0, 0.06], [0.12, 0.42, 0.0, 0.05], [-0.18, 0.4, 0.0, 0.05]];
  pads.forEach(([x, z, hgt, r], i) => pad(x, WL + 0.002 + hgt, z, r, hgt ? 0.5 : 0.1, i));
  lotusFlower(gp, [0.03, WL, 0.05], 0.2, 1.7, 1, 0.02, 0.4);
  lotusFlower(gp, [-0.18, WL, 0.15], 0.12, 1.15, 0.8, 0.03, 2.2);
  lotusFlower(gp, [0.2, WL, -0.05], 0.15, 1.25, 0.35, 0.02, -0.6);
  // bud and a dried seed pod
  strut(gp, [0.14, WL, 0.21], [0.15, WL + 0.12, 0.2], 0.004, 0.0035, '#5d8a3c', 5);
  add(gp, g('n2-bud', () => new THREE.LatheGeometry([[0.001, 0], [0.6, 0.18], [0.85, 0.42], [0.6, 0.78], [0.001, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 8)), mat('#e86a98', { flat: false }), 0.15, WL + 0.118, 0.2, 0.028, 0.06, 0.028);
  limb(gp, [[-0.07, WL, -0.14], [-0.06, WL + 0.1, -0.13], [-0.03, WL + 0.15, -0.11]], 0.004, 0.0035, '#8a7a4a', 5, 2);
  const sp0 = add(gp, g('n2-recep2', () => new THREE.LatheGeometry([[0.001, 0], [0.35, 0.12], [0.8, 0.72], [1, 0.95], [0.86, 1], [0.001, 1.02]].map(([r, y]) => new THREE.Vector2(r, y)), 10)), mat('#8a7348'), -0.03, WL + 0.145, -0.11, 0.032, 0.03, 0.032);
  sp0.rotation.set(0.5, 0, -0.4);
  // sea of distant blooms
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = 0.25 + Math.sqrt(H(i, 7)) * 0.22, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 0.1 || Math.hypot(x + 0.3, z + 0.32) < 0.17) continue;
    add(gp, CYL(8), mat(padC[i % 4]), x, WL + 0.002, z, 0.05, 0.004, 0.05);
    if (i % 3 !== 2) { strut(gp, [x, WL, z], [x, WL + 0.04, z], 0.002, 0.002, '#5d8a3c', 4); blob(gp, i % 4 ? '#e8659a' : '#f6b7cf', x, WL + 0.045, z, 0.012, 0.014, 0.012, i, 0); }
  }
  // reeds on the bank
  for (let i = 0; i < 18; i++) { const a = H(i, 8) * TAU, r = H(i, 9) * 0.11, x = -0.3 + Math.cos(a) * r, z = -0.32 + Math.sin(a) * r; cone(gp, i % 2 ? '#7f9a46' : '#9aa856', x, Y0 + hf(x, z) - 0.005, z, 0.006, 0.07 + H(i, 10) * 0.05, 4); }
  // long-tail boat with visitors
  const bt = new THREE.Group(); bt.position.set(0.27, WL - 0.004, -0.25); bt.rotation.y = 0.9; gp.add(bt);
  sweep(bt, [{ p: [0, 0.016, -0.13], w: 0.006, h: 0.006 }, { p: [0, 0.012, -0.08], w: 0.024, h: 0.012 }, { p: [0, 0.012, 0.04], w: 0.027, h: 0.013 }, { p: [0, 0.016, 0.1], w: 0.016, h: 0.011 }, { p: [0, 0.034, 0.14], w: 0.004, h: 0.005 }], '#7a4a2a',
    { radial: 10, sub: 3, squash: 0.8, paint: (_x, y) => (y > 0.019 ? '#a06a3a' : y > 0.014 ? '#2f6aa0' : null) });
  sph(bt, '#e8c040', 0, 0.036, 0.14, 0.006, 0.006, 0.006, 6);
  for (let k = -1; k <= 1; k += 2) for (let q = 0; q < 2; q++) strut(bt, [k * 0.018, 0.02, -0.02 + q * 0.08], [k * 0.018, 0.06, -0.02 + q * 0.08], 0.002, 0.002, '#cfcfcf', 4);
  box(bt, '#c0392b', 0, 0.062, 0.02, 0.044, 0.004, 0.1);
  person(bt, 0, 0.012, 0.0, '#f2a33a', 0, 0.9); person(bt, 0, 0.012, 0.05, '#3a8ad0', 0, 0.85);
  person(bt, 0, 0.014, -0.085, '#3a3a3a', 0, 0.95);
  box(bt, '#444444', 0, 0.024, -0.115, 0.016, 0.016, 0.022);
  strut(bt, [0, 0.024, -0.12], [0, -0.004, -0.23], 0.002, 0.002, '#888888', 4);
};

/** Ghana cacao farm: pods growing straight from the trunk, a split pod, beans drying on a bamboo table. */
const PODG = () => g('n2-pod', () => {
  const prof: [number, number][] = [[0.001, 0], [0.22, 0.05], [0.36, 0.2], [0.42, 0.45], [0.38, 0.7], [0.24, 0.9], [0.06, 1], [0.001, 1.02]];
  const lg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  const ps = lg.getAttribute('position');
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), k = 1 + 0.16 * Math.cos(Math.atan2(z, x) * 6) - 0.04 * Math.sin(y * 30);
    ps.setXYZ(i, x * k, z * k, y); // lathe axis y → +z
  }
  lg.computeVertexNormals();
  return lg;
});
function cacaoTree(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number, pods: number): void {
  const bark = '#8a7d6a', tr: V3 = [x, y + 0.27 * s, z];
  limb(p, [[x, y - 0.01, z], [x + 0.01 * s, y + 0.12 * s, z], tr], 0.03 * s, 0.022 * s, bark, 7, 3,
    (_x, yy, zz) => (Math.sin(yy * 140 + zz * 60) > 0.75 ? '#a7a08a' : null));
  const leaf = leafGeo('cacao', 4, t => Math.pow(Math.sin(Math.PI * t), 0.8), 0.15, 0.25);
  const ends: V3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = seed + k * 1.75, e: V3 = [x + Math.cos(a) * 0.19 * s, y + (0.46 + H(k, seed) * 0.06) * s, z + Math.sin(a) * 0.19 * s];
    const m: V3 = [x + Math.cos(a) * 0.08 * s, y + 0.37 * s, z + Math.sin(a) * 0.08 * s];
    limb(p, [tr, m, e], 0.016 * s, 0.005 * s, bark, 5, 3);
    ends.push(e, m);
  }
  const greens = ['#2f5a2a', '#3d6b30', '#4a7a35', '#2a4f26'];
  ends.forEach(([ex, ey, ez], k) => {
    blob(p, greens[k % 4], ex, ey + 0.02 * s, ez, 0.095 * s, 0.06 * s, 0.095 * s, k + seed, 1, k);
    for (let q = 0; q < 4; q++) {
      const a = k * 1.3 + q * 1.57, d: V3 = [Math.cos(a), -0.8, Math.sin(a)];
      aim(p, leaf, q === 0 && k % 3 === 0 ? '#a0522d' : greens[(k + q) % 4], [ex + Math.cos(a) * 0.05 * s, ey - 0.01 * s, ez + Math.sin(a) * 0.05 * s], d, 0.09 * s, 0.035 * s);
    }
  });
  blob(p, greens[1], x, y + 0.54 * s, z, 0.13 * s, 0.07 * s, 0.13 * s, seed, 1);
  const pc = ['#e8b830', '#e07a20', '#c8402a', '#7a2a30', '#6a9a3a', '#d8a02a'];
  for (let k = 0; k < pods; k++) {
    const a = seed * 2 + k * 2.3, hy = y + (0.06 + (k / pods) * 0.24) * s, r = 0.026 * s, ps: V3 = [x + Math.cos(a) * r, hy, z + Math.sin(a) * r];
    const d: V3 = [Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5];
    aim(p, PODG(), pc[k % 6], ps, d, 0.075 * s, 0.075 * s);
  }
}
const cacao: Builder = gp => {
  const hf: HF = (x, z) => 0.016 * f2(x * 5, z * 5);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, _y, z) => {
    const n = f2(x * 22, z * 22, 2, 4);
    return B('#4a3424').lerp(K('#8a5a32'), sst(0.45, 0.8, n) * 0.8).lerp(K('#4f7a32'), sst(0.6, 0.78, f2(x * 7, z * 7, 2, 9)) * 0.85);
  }, { rings: 22, segs: 60 });
  cacaoTree(gp, -0.02, gy(-0.02, -0.02), -0.02, 1.1, 0.3, 9);
  cacaoTree(gp, -0.32, gy(-0.32, -0.2), -0.2, 0.7, 2.1, 5);
  // shade banana plant
  const bx = 0.28, bz = -0.26, by = gy(bx, bz);
  strut(gp, [bx, by - 0.01, bz], [bx, by + 0.24, bz], 0.026, 0.018, '#7a9a4a', 8);
  const bl = leafGeo('banana', 6, t => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.5), 0.1, 0.55);
  for (let k = 0; k < 7; k++) { const a = k * 0.9; aim(gp, bl, k % 2 ? '#5a9a3a' : '#6aaa45', [bx, by + 0.23, bz], [Math.cos(a), 0.9, Math.sin(a)], 0.22, 0.07); }
  // bamboo drying table with beans and a split pod
  const tx = 0.22, tz = 0.2, ty = gy(tx, tz);
  for (const [dx, dz] of [[-0.09, -0.05], [0.09, -0.05], [-0.09, 0.05], [0.09, 0.05]]) strut(gp, [tx + dx, ty - 0.01, tz + dz], [tx + dx, ty + 0.06, tz + dz], 0.004, 0.004, '#b89a5a', 5);
  box(gp, '#c2a46a', tx, ty + 0.06, tz, 0.2, 0.006, 0.12);
  box(gp, '#3a2a20', tx, ty + 0.064, tz, 0.18, 0.003, 0.1);
  for (let k = 0; k < 44; k++) box(gp, k % 3 ? '#6a3a26' : '#8a4a2e', tx + (H(k, 1) - 0.5) * 0.17, ty + 0.068, tz + (H(k, 2) - 0.5) * 0.09, 0.012, 0.006, 0.008, H(k, 3) * 3);
  const sx = 0.1, sz = 0.36, sy = gy(sx, sz);
  aim(gp, PODG(), '#e0a020', [sx - 0.05, sy + 0.022, sz], [1, 0, 0.1], 0.1, 0.1).scale.set(0.1, 0.06, 0.1);
  blob(gp, '#f4efe0', sx + 0.005, sy + 0.03, sz + 0.004, 0.032, 0.016, 0.018, 1, 1);
  for (let k = 0; k < 6; k++) sph(gp, '#efe6d0', sx - 0.02 + k * 0.009, sy + 0.042, sz + (k % 2 ? 0.006 : -0.006), 0.006, 0.005, 0.007, 6);
  // basket of pods and a farmer
  const kx = -0.2, kz = 0.27, ky = gy(kx, kz);
  lathe(gp, [[0.001, 0], [0.04, 0.004], [0.052, 0.04], [0.056, 0.044], [0.05, 0.044], [0.046, 0.008], [0.001, 0.008]], '#a07a40', kx, ky - 0.002, kz, 10);
  for (let k = 0; k < 5; k++) blob(gp, ['#e8b830', '#e07a20', '#c8402a', '#7a2a30', '#d8a02a'][k], kx + Math.cos(k * 1.3) * 0.022, ky + 0.045, kz + Math.sin(k * 1.3) * 0.022, 0.024, 0.016, 0.016, k, 0, k * 1.3);
  person(gp, -0.1, gy(-0.1, 0.3), 0.3, '#3a7a3a', -0.3, 1.1, '#6a4028');
  strut(gp, [-0.084, gy(-0.1, 0.3) + 0.04, 0.31], [-0.07, gy(-0.1, 0.3) + 0.02, 0.35], 0.0015, 0.003, '#cccccc', 4);
};

/** Kaffa forest coffee (Ethiopia, birthplace of coffee): glossy shrub with red cherries + a coffee ceremony. */
function coffeeShrub(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number): void {
  const leaf = leafGeo('coffee', 3, t => Math.pow(Math.sin(Math.PI * t), 0.75), 0.2, 0.1);
  const lc = ['#2e5e2a', '#24502a', '#3a6a30'], cc = ['#c0272d', '#a3161e', '#d8432a', '#e0a020', '#6a9a3a'];
  for (let st = 0; st < 3; st++) {
    const sa = seed + st * 2.1, sx = x + Math.cos(sa) * 0.03 * s, sz = z + Math.sin(sa) * 0.03 * s;
    strut(p, [sx, y - 0.01, sz], [sx, y + 0.36 * s, sz], 0.006 * s, 0.003 * s, '#7a6a55', 5);
    for (let lv = 0; lv < 7; lv++) {
      const by = y + (0.07 + lv * 0.042) * s, a = sa + lv * 2.4, len = (0.15 - lv * 0.014) * s;
      const e: V3 = [sx + Math.cos(a) * len, by - 0.02 * s, sz + Math.sin(a) * len];
      const b0: V3 = [sx, by, sz];
      strut(p, b0, e, 0.003 * s, 0.0016 * s, '#6a5a45', 4);
      for (let nd = 1; nd <= 3; nd++) {
        const t = nd / 3.3, np = lerp3(b0, e, t), side: V3 = [-Math.sin(a), 0, Math.cos(a)];
        for (const sg of [-1, 1]) aim(p, leaf, lc[(nd + lv) % 3], np, [side[0] * sg + Math.cos(a) * 0.4, -0.2, side[2] * sg + Math.sin(a) * 0.4], 0.068 * s, 0.032 * s);
        if ((nd + lv + st) % 3 !== 0) for (let c = 0; c < 3; c++) blob(p, cc[(c + lv + st * 2) % (lv < 2 ? 5 : 3)], np[0] + (c - 1) * 0.006 * s, np[1] - 0.008 * s, np[2] + ((c * 7) % 3 - 1) * 0.005 * s, 0.0075 * s, 0.009 * s, 0.0075 * s, c, 0);
        else blob(p, '#fbfbf2', np[0], np[1] + 0.006 * s, np[2], 0.008 * s, 0.006 * s, 0.008 * s, nd, 0);
      }
    }
  }
}
const coffee: Builder = gp => {
  const hf: HF = (x, z) => 0.03 * sst(0.0, -0.5, z) + 0.014 * f2(x * 6, z * 6);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const c = grassy('#3f6f2a', '#6a9a3a', 8)(x, y, z, ny);
    return c.lerp(K('#8a4a2a'), sst(0.05, 0.02, Math.abs(x * 0.7 - z * 0.5 + 0.12 + Math.sin(z * 9) * 0.03)) * 0.85);
  }, { rings: 22, segs: 60 });
  coffeeShrub(gp, -0.04, gy(-0.04, 0.0), 0.0, 1.15, 0.4);
  // forest: tall umbrella tree + background bushes
  const fx = 0.18, fz = -0.32, fy = gy(fx, fz);
  limb(gp, [[fx, fy - 0.01, fz], [fx - 0.02, fy + 0.2, fz + 0.01], [fx + 0.01, fy + 0.4, fz]], 0.03, 0.016, '#6a5a48', 7, 3);
  for (let k = 0; k < 9; k++) { const a = k * 2.4, r = k ? 0.07 + H(k, 4) * 0.08 : 0; blob(gp, ['#2f5a28', '#3f6a30', '#4a7a35'][k % 3], fx + Math.cos(a) * r, fy + 0.43 + H(k, 5) * 0.04, fz + Math.sin(a) * r, 0.09, 0.045, 0.09, k, 1, a); }
  for (const [x, z, sc] of [[-0.35, -0.12, 0.08], [0.38, -0.08, 0.07], [-0.12, -0.38, 0.09], [0.36, 0.14, 0.06]] as [number, number, number][]) {
    const y = gy(x, z);
    for (let k = 0; k < 3; k++) blob(gp, ['#2e5e2a', '#3a6a30', '#24502a'][k], x + (k - 1) * sc * 0.6, y + sc * (0.7 + (k % 2) * 0.3), z, sc, sc * 0.9, sc, k + (x * 10) | 0, 1);
    for (let k = 0; k < 4; k++) blob(gp, '#c0272d', x + Math.cos(k * 1.6) * sc * 0.9, y + sc * 0.9, z + Math.sin(k * 1.6) * sc * 0.9, 0.008, 0.008, 0.008, k, 0);
  }
  // tukul hut
  const hx = -0.3, hz = -0.3, hy = gy(hx, hz) - 0.005;
  cyl(gp, '#b08a5a', hx, hy, hz, 0.085, 0.075, 12);
  box(gp, '#3a2a1a', hx + 0.04, hy + 0.025, hz + 0.074, 0.03, 0.05, 0.01, 0.5);
  cone(gp, '#c2a060', hx, hy + 0.07, hz, 0.11, 0.1, 12);
  cone(gp, '#a88a4a', hx, hy + 0.15, hz, 0.035, 0.04, 8);
  strut(gp, [hx, hy + 0.18, hz], [hx, hy + 0.215, hz], 0.002, 0.002, '#555555', 4);
  // coffee ceremony: grass-strewn floor, jebena pot, cups, brazier, host
  const cx = 0.22, cz = 0.22, cy = gy(cx, cz);
  add(gp, CYL(12), mat('#7aaa45'), cx, cy + 0.002, cz, 0.24, 0.004, 0.2);
  box(gp, '#7a5030', cx + 0.02, cy + 0.004, cz + 0.02, 0.07, 0.016, 0.05, 0.3);
  for (let k = 0; k < 6; k++) cyl(gp, '#f6f2ea', cx - 0.005 + (k % 3) * 0.016, cy + 0.02, cz + 0.008 + Math.floor(k / 3) * 0.016, 0.0055, 0.008, 8);
  const jx = cx - 0.055, jz = cz + 0.04, jy = cy + 0.004;
  lathe(gp, [[0.001, 0], [0.018, 0.004], [0.026, 0.02], [0.022, 0.034], [0.008, 0.044], [0.006, 0.07], [0.009, 0.074], [0.001, 0.074]], '#2a2420', jx, jy, jz, 10);
  strut(gp, [jx + 0.016, jy + 0.022, jz], [jx + 0.034, jy + 0.05, jz], 0.004, 0.002, '#2a2420', 5);
  strut(gp, [jx - 0.01, jy + 0.06, jz], [jx - 0.026, jy + 0.03, jz], 0.002, 0.002, '#2a2420', 4);
  cyl(gp, '#555555', jx - 0.05, jy, jz - 0.04, 0.02, 0.018, 8);
  cyl(gp, '#ff7a2a', jx - 0.05, jy + 0.018, jz - 0.04, 0.016, 0.003, 8).material = mat('#ff7a2a', { emissive: '#ff5a10' });
  const wg = new THREE.Group(); wg.position.set(cx - 0.03, cy, cz - 0.04); wg.rotation.y = 0.5; gp.add(wg);
  add(wg, CONE(8), mat('#f8f6f0'), 0, 0.022, 0, 0.05, 0.044, 0.044);
  box(wg, '#2a8a4a', 0, 0.006, 0.021, 0.04, 0.006, 0.003);
  sph(wg, '#6a4028', 0, 0.052, 0, 0.01, 0.011, 0.01, 6); sph(wg, '#1a1a1a', 0, 0.056, -0.003, 0.0105, 0.009, 0.0105, 6);
  // basket of picked cherries
  lathe(gp, [[0.001, 0], [0.03, 0.002], [0.04, 0.026], [0.001, 0.026]], '#b08a4a', -0.24, gy(-0.24, 0.24), 0.24, 10);
  for (let k = 0; k < 9; k++) blob(gp, k % 4 ? '#c0272d' : '#a3161e', -0.24 + Math.cos(k * 2.4) * 0.022 * Math.sqrt(k / 9), gy(-0.24, 0.24) + 0.03, 0.24 + Math.sin(k * 2.4) * 0.022 * Math.sqrt(k / 9), 0.009, 0.008, 0.009, k, 0);
  person(gp, -0.17, gy(-0.17, 0.2), 0.2, '#e8d8a8', 0.6, 1.0, '#5a3420');
};

/** Munnar tea estate: a rounded hill combed with bright contour hedges, silver oaks, a picker and the factory. */
const tea: Builder = gp => {
  const HX = -0.06, HZ = -0.1;
  const hf: HF = (x, z) => { const d = Math.hypot(x - HX, (z - HZ) * 1.1); return 0.22 * Math.exp(-((d / 0.3) ** 2)) + 0.02 * f2(x * 5, z * 5) + 0.03 * sst(0.1, 0.5, -z); };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const road = Math.abs(Math.hypot(x - 0.18, z - 0.42) - 0.2) < 0.018;
    if (road) return B('#a65a3a');
    return grassy('#3e6a2a', '#557f32', 14)(x, y, z, ny).lerp(K('#7a4a2e'), sst(0.6, 0.85, f2(x * 30, z * 30, 2, 2)) * 0.5);
  }, { rings: 30, segs: 72, strata: ['#8a4a2e', '#7a3f28', '#9a5a36', '#6a3a26'] });
  // contour hedge rows (break at the rim and at the pickers' footpath)
  const rowPaint = (_x: number, _y: number, _z: number, _nx: number, ny: number) => (ny > 0.75 ? '#7cb840' : null);
  const prof: number[][] = [];
  for (let k = 0; k <= 30; k++) { const a = (k / 30) * TAU, row: number[] = []; for (let r = 0; r < 0.6; r += 0.012) row.push(hf(HX + Math.cos(a) * r, HZ + Math.sin(a) * r)); prof.push(row); }
  for (let lv = 0; lv < 12; lv++) {
    const L = 0.012 + lv * 0.019;
    let seg: V3[] = [];
    const flush = () => { if (seg.length > 2) sweep(gp, seg.map(pt => ({ p: pt, w: 0.017, h: 0.015 })), lv % 2 ? '#6aa83a' : '#5f9e34', { radial: 5, sub: 2, caps: true, paint: rowPaint }); seg = []; };
    for (let k = 0; k <= 30; k++) {
      const a = (k / 30) * TAU, pr = prof[k];
      if (Math.abs(((a - 1.3 + Math.PI) % TAU) - Math.PI) < 0.12) { flush(); continue; }
      let i = 1;
      while (i < pr.length && pr[i] > L) i++;
      const r = i >= pr.length ? 0.6 : (i - 1 + (pr[i - 1] - L) / Math.max(1e-6, pr[i - 1] - pr[i])) * 0.012;
      const x = HX + Math.cos(a) * r, z = HZ + Math.sin(a) * r;
      if (Math.hypot(x, z) > 0.45 || r >= 0.6) { flush(); continue; }
      seg.push([x, Y0 + L + 0.006, z]);
    }
    flush();
  }
  // bright new flush on hedge tops
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, r = 0.06 + Math.sqrt(H(i, 1)) * 0.3, x = HX + Math.cos(a) * r, z = HZ + Math.sin(a) * r;
    if (Math.hypot(x, z) > 0.44) continue;
    blob(gp, '#9acd4a', x, gy(x, z) + 0.02, z, 0.012, 0.006, 0.012, i, 0);
  }
  // silver oaks (Grevillea) for shade
  for (const [x, z, s] of [[-0.02, -0.08, 1], [0.16, -0.22, 0.85], [-0.26, 0.02, 0.9], [-0.1, -0.34, 0.8], [0.12, 0.08, 0.75], [-0.3, -0.24, 0.7]] as [number, number, number][]) {
    const y = gy(x, z) - 0.004;
    strut(gp, [x, y, z], [x, y + 0.24 * s, z], 0.007 * s, 0.003 * s, '#6a5a4a', 5);
    for (let k = 0; k < 4; k++) blob(gp, k % 2 ? '#3a5a32' : '#4a6a3a', x + (H(k, x * 9) - 0.5) * 0.03, y + (0.13 + k * 0.035) * s, z + (H(k, z * 9) - 0.5) * 0.03, 0.026 * s, 0.03 * s, 0.026 * s, k, 0);
  }
  // pickers with baskets
  const pick = (x: number, z: number, sari: string, ry: number) => {
    const y = gy(x, z);
    person(gp, x, y, z, sari, ry, 1.1, '#6a4028');
    lathe(gp, [[0.001, 0], [0.012, 0.002], [0.016, 0.026], [0.001, 0.026]], '#a07a40', x - Math.sin(ry) * 0.014, y + 0.04, z - Math.cos(ry) * 0.014, 8);
    blob(gp, '#7ab83a', x - Math.sin(ry) * 0.014, y + 0.066, z - Math.cos(ry) * 0.014, 0.012, 0.006, 0.012, 1, 0);
  };
  pick(0.1, 0.2, '#d6336c', 0.4); pick(0.02, 0.24, '#f59f00', -0.2); pick(-0.2, 0.18, '#7048e8', 0.8);
  // tea factory by the red road
  const fx = 0.3, fz = 0.22, fy = gy(fx, fz) - 0.004, ry = -0.7;
  const fg = new THREE.Group(); fg.position.set(fx, fy, fz); fg.rotation.y = ry; gp.add(fg);
  box(fg, '#f1efe6', 0, 0.03, 0, 0.17, 0.06, 0.07);
  gable(fg, 0.18, 0.035, 0.08, '#b23a2a', 0, 0.06, 0);
  for (let k = 0; k < 6; k++) box(fg, '#3a4a5a', -0.07 + k * 0.028, 0.035, 0.036, 0.012, 0.016, 0.002);
  box(fg, '#5a3a2a', 0.05, 0.012, 0.036, 0.02, 0.024, 0.002);
  cyl(fg, '#9a8a7a', -0.06, 0.06, -0.02, 0.008, 0.07, 8);
};

/** Channel Islands giant kelp forest: golden fronds with gas floats rise to a sunlit surface; otter on top. */
const kelp: Builder = gp => {
  const SURF = 0.74;
  const hf: HF = (x, z) => 0.02 * f2(x * 6, z * 6) + 0.03 * sst(0.55, 0.85, f2(x * 4, z * 4, 2, 7));
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z) => {
    const rock = sst(0.055, 0.07, y - Y0 + 0.01 * f2(x * 30, z * 30));
    return B('#d2c09a').lerp(K('#b8a47e'), f2(x * 20, z * 20, 2, 3) * 0.6).lerp(K('#6a6050'), rock).lerp(K('#c96a8a'), rock * sst(0.6, 0.75, f2(x * 25, z * 25, 2, 8)) * 0.6);
  }, { rings: 20, segs: 56, strata: ['#8a7a5a', '#7a6a4a', '#9a8a68', '#6a5a40'] });
  // glassy water column + surface
  const col = new THREE.CylinderGeometry(0.5, 0.5, SURF - Y0, 32, 1, true);
  add(gp, g('n2-kcol', () => col), mat('#3f9fc8', { transparent: 0.16, flat: false }), 0, Y0 + (SURF - Y0) / 2, 0, 1, 1, 1);
  add(gp, CYL(32), mat('#5ab8d8', { transparent: 0.38, flat: false, rough: 0.2 }), 0, SURF, 0, 1, 0.006, 1);
  const blade = leafGeo('kelp', 4, t => Math.pow(Math.sin(Math.PI * t), 0.55), -0.15, 0.08);
  const gold = ['#b08a2a', '#9a7426', '#c49a38', '#8a6a22'];
  const stipes: [number, number][] = [[0, 0.02], [-0.18, 0.12], [0.2, 0.1], [-0.1, -0.2], [0.16, -0.18], [-0.3, -0.06], [0.32, -0.02]];
  stipes.forEach(([x, z], si) => {
    const y0 = gy(x, z) - 0.004, pts: V3[] = [];
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push([x + Math.sin(t * 5 + si) * 0.03 * t, y0 + (SURF - 0.01 - y0) * t, z + Math.cos(t * 4 + si * 2) * 0.03 * t]); }
    limb(gp, pts, 0.005, 0.0035, '#7a5a1e', 5, 3);
    blob(gp, '#6a4a1e', x, y0 + 0.008, z, 0.028, 0.016, 0.028, si, 1);
    const curve = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)));
    for (let b = 1; b < 11; b++) {
      const t = 0.08 + b * 0.085, q = curve.getPointAt(Math.min(1, t)), a = si * 1.7 + b * 2.4;
      const d: V3 = [Math.cos(a) * 0.8, 0.9, Math.sin(a) * 0.8];
      blob(gp, '#a8902a', q.x + Math.cos(a) * 0.006, q.y, q.z + Math.sin(a) * 0.006, 0.0055, 0.0075, 0.0055, b, 0);
      aim(gp, blade, gold[(b + si) % 4], [q.x + Math.cos(a) * 0.008, q.y + 0.004, q.z + Math.sin(a) * 0.008], d, 0.085 + H(b, si) * 0.03, 0.03);
    }
    // canopy fronds floating on the surface
    const top = pts[5];
    for (let k = 0; k < 3; k++) { const a = si + k * 2.1; aim(gp, blade, gold[k % 4], [top[0], SURF + 0.002, top[2]], [Math.cos(a), 0.02, Math.sin(a)], 0.11, 0.036); }
  });
  // rocks, urchins, sea stars
  for (let i = 0; i < 6; i++) { const a = i * 1.9 + 0.4, r = 0.2 + H(i, 3) * 0.2, x = Math.cos(a) * r, z = Math.sin(a) * r; blob(gp, '#5a5448', x, gy(x, z), z, 0.04 + H(i, 4) * 0.03, 0.025, 0.035, i, 1, a); }
  for (let i = 0; i < 9; i++) {
    const a = i * 2.2 + 1, r = 0.12 + H(i, 5) * 0.3, x = Math.cos(a) * r, z = Math.sin(a) * r, y = gy(x, z);
    blob(gp, i % 3 ? '#4a2a5a' : '#6a2a6a', x, y + 0.008, z, 0.014, 0.011, 0.014, i, 1);
  }
  for (const [x, z, c] of [[0.24, 0.24, '#e8742a'], [-0.22, 0.28, '#c8402a'], [0.36, 0.18, '#e8a02a']] as [number, number, string][]) {
    const y = gy(x, z) + 0.003;
    for (let k = 0; k < 5; k++) box(gp, c, x + Math.cos(k * 1.2566) * 0.012, y, z + Math.sin(k * 1.2566) * 0.012, 0.026, 0.006, 0.009, -k * 1.2566);
  }
  // garibaldi fish
  const fish = (x: number, y: number, z: number, ry: number, s: number, c: string) => {
    const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = ry; f.scale.setScalar(s); gp.add(f);
    sph(f, c, 0, 0, 0, 0.012, 0.016, 0.022, 8);
    add(f, CONE(4), mat(c), 0, 0, -0.026, 0.026, 0.014, 0.004, 0, Math.PI / 2);
    sph(f, '#111111', 0.008, 0.004, 0.012, 0.003, 0.003, 0.003, 6); sph(f, '#111111', -0.008, 0.004, 0.012, 0.003, 0.003, 0.003, 6);
  };
  fish(0.12, 0.26, 0.2, 1.2, 1.3, '#ff7a1a'); fish(-0.14, 0.4, 0.12, -0.6, 1.1, '#ff8a20'); fish(0.24, 0.5, -0.1, 2.4, 1.0, '#f5701a');
  for (let k = 0; k < 9; k++) fish(-0.22 + (k % 3) * 0.03, 0.56 + Math.floor(k / 3) * 0.025, 0.2 + (k % 2) * 0.02, 1.4, 0.5, '#b8c4cc');
  // sea otter floating on its back, holding an urchin
  const ot = new THREE.Group(); ot.position.set(-0.1, SURF + 0.006, 0.1); ot.rotation.y = 0.5; gp.add(ot);
  sweep(ot, [{ p: [0, 0, -0.08], w: 0.008, h: 0.006 }, { p: [0, 0.004, -0.045], w: 0.02, h: 0.013 }, { p: [0, 0.008, 0.01], w: 0.024, h: 0.017 }, { p: [0, 0.01, 0.045], w: 0.017, h: 0.014 }],
    '#5a3e2c', { radial: 8, sub: 3, paint: (_x, _y, z) => (z > 0.03 ? '#9a8068' : null) });
  sph(ot, '#d8ccb8', 0, 0.016, 0.062, 0.016, 0.014, 0.017, 8);
  sph(ot, '#222222', 0, 0.02, 0.078, 0.004, 0.003, 0.003, 6);
  sph(ot, '#111111', 0.007, 0.028, 0.068, 0.0025, 0.0025, 0.0025, 6); sph(ot, '#111111', -0.007, 0.028, 0.068, 0.0025, 0.0025, 0.0025, 6);
  for (const sx of [-1, 1]) { strut(ot, [sx * 0.016, 0.014, 0.03], [sx * 0.008, 0.03, 0.02], 0.004, 0.004, '#4a3222', 5); strut(ot, [sx * 0.012, 0.004, -0.06], [sx * 0.016, 0.018, -0.075], 0.005, 0.007, '#4a3222', 5); }
  blob(ot, '#4a2a5a', 0, 0.032, 0.018, 0.009, 0.007, 0.009, 2, 1);
};

/** Quiver Tree Forest (Keetmanshoop): golden-barked aloes forking into blue-grey rosettes among dolerite boulders. */
function quiverTree(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number, depth = 3): void {
  const top: V3 = [x, y + 0.25 * s, z];
  limb(p, [[x, y - 0.01, z], [x, y + 0.12 * s, z], top], 0.05 * s, 0.03 * s, '#c89a48', 8, 3,
    (_x, yy, zz) => (Math.sin(yy * 220 + Math.sin(zz * 80) * 2) > 0.55 ? '#a07a38' : yy > y + 0.2 * s ? '#d0b070' : null));
  const grow = (p0: V3, dir: THREE.Vector3, len: number, r: number, depth: number, twist: number) => {
    const e: V3 = [p0[0] + dir.x * len, p0[1] + dir.y * len, p0[2] + dir.z * len];
    strut(p, p0, e, r, r * 0.78, depth > 2 ? '#d8c08a' : '#ddd2bc', 6);
    if (depth === 0) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 7) * TAU + seed + (k > 6 ? 0.45 : 0), tilt = k > 6 ? 1.15 : 0.55;
        const m = add(p, CONE(3), mat(k % 3 ? '#8aa29a' : '#a0b4a8'), e[0] + Math.cos(a) * Math.sin(tilt) * 0.024 * s, e[1] + Math.cos(tilt) * 0.024 * s, e[2] + Math.sin(a) * Math.sin(tilt) * 0.024 * s, 0.014 * s, 0.055 * s, 0.008 * s);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)));
      }
      if (H(seed * 10 | 0, e[0] * 99 | 0) > 0.6) for (let k = 0; k < 3; k++) strut(p, e, [e[0] + (k - 1) * 0.012 * s, e[1] + 0.05 * s, e[2] + ((k * 2) % 3 - 1) * 0.01 * s], 0.002 * s, 0.003 * s, '#f2c230', 4);
      return;
    }
    const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(Math.cos(twist), 0, Math.sin(twist))).normalize();
    for (const sg of [-1, 1]) {
      const nd = dir.clone().applyAxisAngle(perp, sg * (0.42 + depth * 0.04)).normalize();
      grow(e, nd, len * 0.82, r * 0.78, depth - 1, twist + Math.PI / 2);
    }
  };
  grow(top, new THREE.Vector3(0, 1, 0), (depth > 3 ? 0.07 : 0.085) * s, 0.03 * s, depth, seed);
}
const quiver: Builder = gp => {
  const hf: HF = (x, z) => 0.025 * f2(x * 5, z * 5) + 0.03 * sst(0.0, -0.5, z);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, _y, z) => B('#c08a58').lerp(K('#a86a40'), f2(x * 12, z * 12, 2, 1)).lerp(K('#d8c08a'), sst(0.62, 0.8, f2(x * 25, z * 25, 2, 6)) * 0.7),
    { rings: 22, segs: 60, strata: ['#9a6a40', '#8a5a36', '#aa7a4a', '#7a4a2e'] });
  quiverTree(gp, 0.02, gy(0.02, 0.0), 0.0, 1.25, 0.3, 4);
  quiverTree(gp, -0.3, gy(-0.3, -0.18), -0.18, 0.75, 1.4);
  quiverTree(gp, 0.3, gy(0.3, -0.22), -0.22, 0.85, 2.2);
  quiverTree(gp, -0.08, gy(-0.08, -0.38), -0.38, 0.55, 3.1);
  // dolerite boulder piles
  const piles: [number, number, number][] = [[-0.22, 0.2, 1], [0.26, 0.16, 0.9], [0.15, -0.36, 0.8], [-0.38, 0.0, 0.7]];
  piles.forEach(([px, pz, sc], pi) => {
    for (let k = 0; k < 6; k++) {
      const a = k * 2.1 + pi, r = (k ? 0.04 : 0) * sc, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r, sz = (0.035 + H(k, pi) * 0.025) * sc;
      blob(gp, k % 2 ? '#3a2e2a' : '#4a3a32', x, gy(x, z) + sz * 0.5 + (k > 3 ? sz * 0.6 : 0), z, sz, sz * 0.8, sz, k + pi, 1, a);
    }
  });
  // dry grass tufts
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, r = 0.12 + Math.sqrt(H(i, 2)) * 0.34, x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let k = 0; k < 3; k++) add(gp, CONE(4), mat(k % 2 ? '#e0c878' : '#cdb060'), x + (k - 1) * 0.008, gy(x, z) + 0.012, z, 0.006, 0.03, 0.006, 0, (k - 1) * 0.35, 0);
  }
  // rock hyrax sunning on a boulder
  sph(gp, '#8a6a4a', -0.22, gy(-0.22, 0.2) + 0.07, 0.2, 0.016, 0.012, 0.022, 8);
  sph(gp, '#7a5a3a', -0.22, gy(-0.22, 0.2) + 0.078, 0.222, 0.009, 0.009, 0.01, 6);
};

/** The Great Banyan (Howrah): one tree that became a forest — a vast low canopy held up by thousands of prop roots. */
const banyan: Builder = gp => {
  const hf: HF = (x, z) => 0.01 * f2(x * 6, z * 6);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const d = Math.hypot(x, z);
    if (d > 0.43 && d < 0.47) return B('#c8a878');
    return grassy('#4a7a32', '#6a9a3e', 8)(x, y, z, ny).lerp(K('#5a4a30'), sst(0.36, 0.1, d) * 0.55);
  }, { rings: 24, segs: 64 });
  const canopyY = (x: number, z: number) => gy(x, z) + 0.27 - Math.hypot(x, z) * 0.12;
  // prop-root pillars (thick old ones and thin new ones)
  const roots: [number, number, number][] = [];
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = 0.03 + Math.sqrt((i + 0.5) / 46) * 0.33;
    roots.push([Math.cos(a) * r + (H(i, 1) - 0.5) * 0.03, Math.sin(a) * r + (H(i, 2) - 0.5) * 0.03, i % 4 === 0 ? 0.014 : 0.006 + H(i, 3) * 0.004]);
  }
  roots.forEach(([x, z, r], i) => {
    const y = gy(x, z) - 0.005, top = canopyY(x, z) - 0.02;
    if (r > 0.01) limb(gp, [[x, y, z], [x + (H(i, 4) - 0.5) * 0.02, (y + top) / 2, z], [x, top, z]], r * 1.5, r, '#7a6a58', 6, 2,
      (xx, yy) => (Math.sin(xx * 300 + yy * 40) > 0.4 ? '#8a7a66' : null));
    else strut(gp, [x, y, z], [x, top, z], r * 1.2, r, i % 2 ? '#8a7a66' : '#76665a', 5);
  });
  // horizontal limbs linking the pillars
  for (let i = 0; i < 18; i++) {
    const a = roots[i * 2], b = roots[(i * 2 + 7) % roots.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.25) continue;
    const ya = canopyY(a[0], a[1]) - 0.03, yb = canopyY(b[0], b[1]) - 0.03;
    limb(gp, [[a[0], ya, a[1]], [(a[0] + b[0]) / 2, Math.max(ya, yb) + 0.012, (a[1] + b[1]) / 2], [b[0], yb, b[1]]], 0.007, 0.005, '#6a5a4a', 5, 2);
  }
  // hanging aerial roots
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996 + 0.7, r = 0.08 + Math.sqrt(H(i, 6)) * 0.34, x = Math.cos(a) * r, z = Math.sin(a) * r, top = canopyY(x, z) - 0.015;
    strut(gp, [x, top - 0.04 - H(i, 7) * 0.09, z], [x, top, z], 0.0015, 0.0025, '#9a8a70', 4);
  }
  // the canopy: a broad, slightly domed roof of foliage
  const greens = ['#2f5a28', '#3a6a2e', '#4a7a35', '#2a4f24', '#447a32'];
  for (let i = 0; i < 52; i++) {
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 52) * 0.4, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.06 + H(i, 8) * 0.03;
    blob(gp, greens[i % 5], x, canopyY(x, z) + 0.02 + H(i, 9) * 0.03, z, s * 1.3, s * 0.55, s * 1.3, i, i % 3 ? 1 : 0, a);
  }
  // ring path fence and visitors
  for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, x = Math.cos(a) * 0.475, z = Math.sin(a) * 0.475; cyl(gp, '#e8e0d0', x, gy(x, z) - 0.002, z, 0.003, 0.022, 4); }
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
    strut(gp, [Math.cos(a0) * 0.475, Y0 + 0.018, Math.sin(a0) * 0.475], [Math.cos(a1) * 0.475, Y0 + 0.018, Math.sin(a1) * 0.475], 0.0018, 0.0018, '#e8e0d0', 4);
  }
  person(gp, 0.3, gy(0.3, 0.32), 0.32, '#e24a5a', 0.8, 1.1, '#6a4028');
  person(gp, 0.25, gy(0.25, 0.37), 0.37, '#f2c94c', 0.9, 0.9, '#6a4028');
  person(gp, -0.4, gy(-0.4, 0.2), 0.2, '#2f6ad0', -0.9, 1.1, '#6a4028');
  // a rhesus macaque on a limb
  sph(gp, '#a08060', 0.12, canopyY(0.12, 0.2) - 0.02, 0.2, 0.012, 0.014, 0.012, 6);
  sph(gp, '#c8a080', 0.12, canopyY(0.12, 0.2) - 0.0, 0.208, 0.009, 0.009, 0.009, 6);
  // information signboard
  const sx = 0.36, sz = 0.2;
  strut(gp, [sx, gy(sx, sz), sz], [sx, gy(sx, sz) + 0.05, sz], 0.002, 0.002, '#555555', 4);
  box(gp, '#2a6a3a', sx, gy(sx, sz) + 0.045, sz, 0.05, 0.03, 0.004, 1.0);
};

/** Cedars of God (Bsharri): an ancient cedar with flat tiered foliage on a snowy limestone mountainside. */
const cedar: Builder = gp => {
  const hf: HF = (x, z) => 0.2 * sst(-0.12, -0.5, z) * (0.7 + 0.5 * f2(x * 4, 3)) + 0.02 * f2(x * 7, z * 7);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0, snow = sst(0.17, 0.22, h + 0.05 * f2(x * 12, z * 12, 2, 5)) * sst(0.45, 0.6, f2(x * 9, z * 9, 2, 4) + 0.2);
    const rock = sst(0.85, 0.7, ny) + sst(0.62, 0.78, f2(x * 16, z * 16, 2, 2)) * 0.6;
    return grassy('#6a7a3a', '#8a8a4a', 9)(x, y, z, ny).lerp(K('#f4f6f8'), snow).lerp(K('#a89c88'), Math.min(1, rock) * (snow > 0.5 ? sst(0.8, 0.6, ny) : 1));
  }, { rings: 28, segs: 64, strata: ['#a89c88', '#968a76', '#b8ac98', '#8a7e6a'] });
  const plate = (x: number, y: number, z: number, w: number, d: number, k: number) => {
    blob(gp, k % 2 ? '#2f4a3a' : '#3a5a44', x, y, z, w, 0.016, d, k, 1, k);
    blob(gp, '#4a6e54', x + w * 0.15, y + 0.01, z - d * 0.1, w * 0.65, 0.011, d * 0.65, k + 1, 0, k);
  };
  const cedarTree = (x: number, z: number, s: number, seed: number) => {
    const y = gy(x, z) - 0.008;
    limb(gp, [[x, y, z], [x + 0.005, y + 0.08 * s, z], [x, y + 0.16 * s, z]], 0.06 * s, 0.045 * s, '#5a4a3e', 8, 3,
      (xx, yy) => (Math.sin(xx * 400 + yy * 90) > 0.3 ? '#4a3c32' : null));
    const leaders: V3[] = [[0.07, 0.3, 0.02], [-0.06, 0.34, -0.03], [0.0, 0.42, 0.04]];
    leaders.forEach(([dx, dy, dz], i) => limb(gp, [[x, y + 0.15 * s, z], [x + dx * 0.5 * s, y + (0.15 + dy * 0.5) * s, z + dz * 0.5 * s], [x + dx * s, y + dy * s, z + dz * s]], 0.03 * s, 0.012 * s, '#5a4a3e', 6, 2));
    const tiers: [number, number, number][] = [[0.13, 0.3, 0], [0.2, 0.25, 1.1], [0.27, 0.2, 2.3], [0.34, 0.15, 0.6], [0.4, 0.11, 3.4], [0.45, 0.06, 1.8]];
    tiers.forEach(([ty, rr, a0], ti) => {
      for (let k = 0; k < 3; k++) {
        const a = a0 + seed + k * 2.1, r = rr * s * (0.7 + H(k, ti) * 0.3), px = x + Math.cos(a) * r * 0.75, pz = z + Math.sin(a) * r * 0.75, py = y + ty * s;
        strut(gp, [x + Math.cos(a) * 0.02 * s, py - 0.03 * s, z + Math.sin(a) * 0.02 * s], [px, py - 0.01 * s, pz], 0.012 * s, 0.006 * s, '#5a4a3e', 5);
        if (k < 2 || ti < 3) plate(px, py, pz, (0.06 + rr * 0.3) * s, (0.05 + rr * 0.24) * s, ti * 3 + k);
      }
    });
  };
  cedarTree(0.02, 0.1, 1.15, 0.2);
  // young conical cedars and a stand behind
  const young = (x: number, z: number, s: number) => {
    const y = gy(x, z) - 0.005;
    strut(gp, [x, y, z], [x, y + 0.05 * s, z], 0.008 * s, 0.006 * s, '#5a4a3e', 5);
    for (let k = 0; k < 4; k++) cone(gp, k % 2 ? '#2f4a3a' : '#3a5a44', x, y + (0.04 + k * 0.045) * s, z, (0.08 - k * 0.016) * s, 0.06 * s, 7, k);
  };
  young(-0.28, 0.12, 0.9); young(0.3, -0.05, 1.0); young(-0.15, -0.18, 1.1); young(0.18, -0.28, 0.85); young(-0.34, -0.12, 0.8); young(0.38, 0.16, 0.7);
  // little stone chapel and pilgrims
  const cx = -0.24, cz = 0.3, cy = gy(cx, cz) - 0.004;
  box(gp, '#d8ccb4', cx, cy + 0.025, cz, 0.06, 0.05, 0.08, 0.4);
  gable(gp, 0.075, 0.03, 0.09, '#9a3a2a', cx, cy + 0.05, cz, 0.4 + Math.PI / 2);
  box(gp, '#d8ccb4', cx + Math.sin(0.4) * 0.03, cy + 0.07, cz + Math.cos(0.4) * 0.03, 0.014, 0.04, 0.014, 0.4);
  box(gp, '#5a3a2a', cx + Math.sin(0.4) * 0.041, cy + 0.014, cz + Math.cos(0.4) * 0.041, 0.016, 0.028, 0.002, 0.4);
  person(gp, 0.18, gy(0.18, 0.32), 0.32, '#a83a3a', 0.4, 1, '#c89a7a');
  person(gp, 0.22, gy(0.22, 0.29), 0.29, '#3a5a8a', 0.6, 0.9, '#c89a7a');
  for (let i = 0; i < 8; i++) { const a = i * 0.785, x = 0.02 + Math.cos(a) * 0.2, z = 0.1 + Math.sin(a) * 0.2; if (z > 0.25) cyl(gp, '#8a7a6a', x, gy(x, z) - 0.002, z, 0.003, 0.02, 4); }
};

/** Ukrainian sunflower field: a giant head with a Fibonacci seed spiral, rows of followers and a white khata. */
const SEEDG = () => g('n2-seed', () => {
  const rings = 7, segs = 34, pos: number[] = [], col: number[] = [];
  const P = (i: number, j: number): V3 => { const r = i / rings, a = (j / segs) * TAU; return [Math.cos(a) * r, Math.sin(a) * r, (1 - r * r) * 0.18]; };
  const c = new THREE.Color();
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const quad = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], r = (i + 0.5) / rings, a = ((j + 0.5) / segs) * TAU;
    const sp = Math.sin(13 * a + r * 26) * Math.sin(21 * a - r * 34);
    c.set(r < 0.25 ? '#6a7a2a' : sp > 0 ? '#3a2416' : '#5a3a20');
    for (const [a0, b0, c0] of [[0, 1, 2], [0, 2, 3]]) for (const q of [quad[a0], quad[b0], quad[c0]]) { pos.push(...q); col.push(c.r, c.g, c.b); }
  }
  const ge = new THREE.BufferGeometry();
  ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ge.computeVertexNormals();
  return ge;
});
const sunflower: Builder = gp => {
  const hf: HF = (x, z) => 0.012 * f2(x * 5, z * 5) + 0.004 * Math.sin(x * 90);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const furrow = Math.sin(x * 90) < -0.2;
    if (z < -0.28 && x > -0.05) return grassy('#6a9a3a', '#8aaa4a', 8)(x, y, z, ny);
    return furrow ? B('#3a2a20') : B('#4a6a2a').lerp(K('#5a3a26'), f2(x * 20, z * 20) * 0.6);
  }, { rings: 26, segs: 64, strata: ['#3a2a20', '#2e221a', '#4a3626', '#2a1e16'] });
  const ray = leafGeo('sunray', 3, t => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), 0.7), 0.1, 0.05, '#f0a800', '#ffd21a');
  const leaf = leafGeo('sunleaf', 4, t => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.6) * (1.1 - 0.3 * t), 0.25, 0.3);
  // hero sunflower facing +z
  const hx = 0.02, hz = 0.12, hy = gy(hx, hz) - 0.005, head: V3 = [hx, hy + 0.4, hz + 0.03];
  limb(gp, [[hx, hy, hz], [hx + 0.005, hy + 0.2, hz - 0.01], [hx, hy + 0.36, hz], head], 0.011, 0.008, '#5a8a2a', 6, 3);
  for (let k = 0; k < 6; k++) { const a = k * 2.4 + 0.5; aim(gp, leaf, k % 2 ? '#4a7a2a' : '#5a8a32', [hx, hy + 0.08 + k * 0.045, hz], [Math.cos(a), 0.3, Math.sin(a)], 0.1 - k * 0.008, 0.08 - k * 0.006); }
  const hg = new THREE.Group(); hg.position.set(...head); hg.rotation.x = 0.25; gp.add(hg);
  add(hg, SEEDG(), mat('#ffffff', { flat: false, vc: true, rough: 0.95 }), 0, 0, 0.006, 0.06, 0.06, 0.06);
  cyl(hg, '#4a7a2a', 0, 0, -0.008, 0.062, 0.014, 14).rotation.x = Math.PI / 2;
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * TAU + (k % 2) * 0.09, r0 = 0.055, d: V3 = [Math.cos(a), Math.sin(a), k % 2 ? 0.25 : 0.1];
    aim(hg, ray, '', [Math.cos(a) * r0, Math.sin(a) * r0, k % 2 ? -0.002 : 0.002], d, 0.055 + (k % 3) * 0.006, 0.024, [0, 0, 1], true);
  }
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; aim(hg, leaf, '#4a7a2a', [Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.008], [Math.cos(a), Math.sin(a), -0.3], 0.03, 0.016, [0, 0, -1]); }
  // the field: rows of smaller heads, all turned to the morning sun (+z)
  for (let rI = 0; rI < 7; rI++) for (let cI = 0; cI < 9; cI++) {
    const x = -0.4 + cI * 0.1 + (rI % 2) * 0.05, z = 0.38 - rI * 0.1;
    if (Math.hypot(x, z) > 0.45 || (Math.abs(x - hx) < 0.09 && Math.abs(z - hz) < 0.09) || (z < -0.28 && x > -0.05)) continue;
    const y = gy(x, z) - 0.004, h = 0.15 + H(rI, cI) * 0.06, s = 0.8 + H(cI, rI) * 0.3;
    strut(gp, [x, y, z], [x, y + h, z], 0.004, 0.003, '#5a8a2a', 4);
    blob(gp, '#4a7a2a', x, y + h * 0.5, z, 0.026, 0.018, 0.026, rI + cI, 0);
    const f = add(gp, CYL(12), mat('#f5c518'), x, y + h + 0.01, z + 0.01, 0.06 * s, 0.006, 0.06 * s); f.rotation.x = Math.PI / 2 - 0.3;
    const d = add(gp, CYL(8), mat('#4a2e1a'), x, y + h + 0.01, z + 0.014, 0.032 * s, 0.008, 0.032 * s); d.rotation.x = Math.PI / 2 - 0.3;
  }
  // whitewashed khata with thatch, wattle fence and a stork nest
  const kx = 0.22, kz = -0.36, ky = gy(kx, kz) - 0.004, kg = new THREE.Group(); kg.position.set(kx, ky, kz); kg.rotation.y = -0.4; gp.add(kg);
  box(kg, '#f6f4ee', 0, 0.03, 0, 0.14, 0.06, 0.08);
  box(kg, '#2f5fa8', 0, 0.002, 0, 0.142, 0.006, 0.082);
  for (const wx of [-0.04, 0.04]) { box(kg, '#2f5fa8', wx, 0.034, 0.041, 0.024, 0.024, 0.002); box(kg, '#bfe0f6', wx, 0.034, 0.042, 0.016, 0.016, 0.002); }
  box(kg, '#6a4a2a', 0, 0.024, 0.041, 0.016, 0.038, 0.002);
  tbox(kg, 0.17, 0.11, 0.06, 0.012, 0.06, '#c8a050', 0, 0.06, 0);
  cyl(kg, '#f6f4ee', 0.04, 0.09, -0.02, 0.008, 0.04, 6);
  for (let k = 0; k < 9; k++) cyl(gp, '#8a6a40', 0.04 + k * 0.03, gy(0.04 + k * 0.03, -0.26) - 0.002, -0.26 + k * 0.004, 0.0035, 0.03, 4);
  box(gp, '#9a7a4a', 0.16, gy(0.16, -0.24) + 0.018, -0.244, 0.25, 0.014, 0.004, -0.13);
  const px = -0.02, pz = -0.4, py = gy(px, pz);
  strut(gp, [px, py, pz], [px, py + 0.2, pz], 0.005, 0.004, '#7a6a5a', 5);
  lathe(gp, [[0.001, 0], [0.03, 0.004], [0.034, 0.018], [0.022, 0.018], [0.001, 0.012]], '#8a6a40', px, py + 0.2, pz, 8);
  sph(gp, '#f8f8f8', px, py + 0.232, pz, 0.012, 0.014, 0.018, 8);
  sph(gp, '#f8f8f8', px, py + 0.255, pz + 0.014, 0.007, 0.008, 0.008, 6);
  add(gp, CONE(5), mat('#e04020'), px, py + 0.254, pz + 0.03, 0.005, 0.022, 0.005, 0, Math.PI / 2);
  box(gp, '#1a1a1a', px, py + 0.232, pz - 0.012, 0.022, 0.008, 0.014);
  strut(gp, [px - 0.004, py + 0.2, pz], [px - 0.004, py + 0.222, pz], 0.0015, 0.0015, '#e04020', 4);
  strut(gp, [px + 0.004, py + 0.2, pz], [px + 0.004, py + 0.222, pz], 0.0015, 0.0015, '#e04020', 4);
};

// ================================================ VOLCANOES ===============================================
/** Translucent drifting smoke / steam puffs. */
function puffs(p: THREE.Object3D, from: V3, n: number, c: string, s: number, drift: V3, op = 0.75): void {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), r = s * (0.6 + t * 0.9);
    add(p, BLOBG(i, 1), mat(c, { transparent: op - t * 0.25 }), from[0] + drift[0] * t + (H(i, 1) - 0.5) * s * 0.6, from[1] + drift[1] * t, from[2] + drift[2] * t + (H(i, 2) - 0.5) * s * 0.6, r, r * 0.8, r, i);
  }
}
const pineT = (p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#2f5a34') => {
  strut(p, [x, y - 0.005, z], [x, y + 0.03 * s, z], 0.005 * s, 0.004 * s, '#5a4632', 4);
  cone(p, c, x, y + 0.02 * s, z, 0.03 * s, 0.06 * s, 6); cone(p, c, x, y + 0.05 * s, z, 0.022 * s, 0.05 * s, 6);
};

/** Parícutin (Michoacán): the volcano born in a cornfield in 1943 — black cinder cone, lava field, buried church. */
const paricutin: Builder = gp => {
  const CX = -0.1, CZ = -0.14;
  const lavaM = (x: number, z: number) => sst(0.42, 0.56, f2(x * 3.2, z * 3.2, 2, 4) + sst(0.45, 0.15, Math.hypot(x - CX, z - CZ)) * 0.4);
  const hf: HF = (x, z) => {
    const d = Math.hypot(x - CX, z - CZ);
    const cone0 = 0.34 * Math.min(1, Math.max(0, (0.27 - d) / 0.2)) ** 1.1 - 0.07 * sst(0.07, 0.035, d);
    return Math.max(cone0, 0.03 * lavaM(x, z) * (0.6 + 0.4 * f2(x * 30, z * 30))) + 0.008 * f2(x * 8, z * 8);
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const d = Math.hypot(x - CX, z - CZ), h = y - Y0;
    if (d < 0.29 && h > 0.05) return B('#2c2826').lerp(K('#5a3a2e'), sst(0.26, 0.33, h) * 0.7).lerp(K('#3e3834'), f2(x * 40, z * 40) * 0.5);
    const lv = lavaM(x, z);
    const farm = grassy('#7a8a3a', '#a89a4a', 7)(x, y, z, ny).lerp(K('#6a4a2e'), Math.sin(x * 120) > 0.3 ? 0.4 : 0);
    const glow = sst(0.025, 0.0, Math.abs(f2(x * 14, z * 14, 2, 7) - 0.5)) * sst(0.6, 0.8, lv) * 0.55;
    return farm.lerp(K('#1e1c1c'), sst(0.3, 0.45, lv)).lerp(K('#3a3634'), sst(0.6, 0.9, lv) * f2(x * 50, z * 50) * 0.5).lerp(K('#c0401a'), glow);
  }, { rings: 30, segs: 72, strata: ['#4a3a30', '#3a302a', '#5a4636', '#2e2620'] });
  puffs(gp, [CX, Y0 + 0.31, CZ], 6, '#9a948e', 0.06, [0.12, 0.3, 0.02]);
  // the buried church of San Juan Parangaricutiro: one tower still standing out of the lava
  const cx = 0.2, cz = 0.18, cy = gy(cx, cz) - 0.01, cg = new THREE.Group(); cg.position.set(cx, cy, cz); cg.rotation.y = -0.5; gp.add(cg);
  const st = '#b0a490';
  box(cg, st, 0, 0.03, 0, 0.1, 0.06, 0.03);
  box(cg, '#2a2420', 0, 0.035, 0.016, 0.022, 0.04, 0.002);
  box(cg, st, -0.04, 0.05, 0, 0.032, 0.1, 0.032);
  box(cg, st, -0.04, 0.115, 0, 0.026, 0.03, 0.026);
  for (const [dx, dz] of [[0, 0.0135], [0.0135, 0], [-0.0135, 0]]) box(cg, '#2a2420', -0.04 + dx, 0.115, dz, dz ? 0.01 : 0.002, 0.016, dz ? 0.002 : 0.01);
  lathe(cg, [[0.001, 0], [0.014, 0], [0.012, 0.012], [0.004, 0.022], [0.001, 0.03]], st, -0.04, 0.13, 0, 8);
  box(cg, st, 0.04, 0.035, 0, 0.03, 0.07, 0.03);
  box(cg, '#8a8070', 0.035, 0.074, 0, 0.022, 0.012, 0.022, 0.4);
  // pines and cornfield on the edge of the lava
  for (let i = 0; i < 14; i++) {
    const a = i * 0.45 + 2.4, r = 0.4 + H(i, 3) * 0.06, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (lavaM(x, z) > 0.35) continue;
    pineT(gp, x, gy(x, z), z, 1 + H(i, 4) * 0.5);
  }
  for (let i = 0; i < 40; i++) {
    const x = 0.3 + (i % 5) * 0.03, z = -0.05 + Math.floor(i / 5) * 0.035;
    if (Math.hypot(x, z) > 0.46 || lavaM(x, z) > 0.35) continue;
    add(gp, CONE(4), mat(i % 3 ? '#8aa040' : '#c8b050'), x, gy(x, z) + 0.016, z, 0.012, 0.032, 0.012);
  }
  person(gp, 0.12, gy(0.12, 0.28), 0.28, '#d23a2a', 2.6, 1.0);
  person(gp, 0.08, gy(0.08, 0.3), 0.3, '#3a6ab0', 2.9, 0.85);
};

/** Ol Doinyo Lengai: the "Mountain of God" whose cool black lava turns white; flamingos on pink Lake Natron. */
const lengai: Builder = gp => {
  const CX = -0.06, CZ = -0.14, WL = Y0 + 0.006;
  const hf: HF = (x, z) => {
    const d = Math.hypot(x - CX, z - CZ), a = Math.atan2(z - CZ, x - CX);
    const cone0 = 0.44 * Math.max(0, 1 - d / 0.36) ** 1.35 * (1 - 0.07 * Math.abs(Math.sin(a * 7 + d * 10))) - 0.03 * sst(0.04, 0.02, d);
    const lake = sst(0.12, 0.28, z + 0.12 * f2(x * 3, 1)) * 0.03;
    return cone0 + 0.012 * f2(x * 7, z * 7) - lake + 0.012;
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const d = Math.hypot(x - CX, z - CZ), a = Math.atan2(z - CZ, x - CX), h = y - Y0;
    if (y < WL + 0.003) return B('#e8dccc');
    const streak = sst(0.1, 0.6, Math.sin(a * 13 + f2(x * 9, z * 9) * 5)) * sst(0.1, 0.28, h);
    const base = B('#8a7a62').lerp(K('#6a5a48'), f2(x * 20, z * 20) * 0.6).lerp(K('#a89a72'), sst(0.3, 0.15, d) * 0.3 * sst(0.5, 0.9, ny));
    return base.lerp(K('#f2eee4'), Math.min(1, streak + sst(0.3, 0.38, h)));
  }, { rings: 30, segs: 72, wl: WL, water: '#c86a5a', strata: ['#8a7a62', '#7a6a52', '#9a8a70', '#6a5a46'] });
  water(gp, 0.5, WL, '#d27a68', { rings: 8, segs: 48, spot: (x, z) => (f2(x * 10, z * 10, 2, 3) > 0.72 ? '#dc9a88' : null) });
  puffs(gp, [CX, Y0 + 0.43, CZ], 4, '#d8d4cc', 0.035, [0.05, 0.12, 0]);
  // flamingos
  const flamingo = (x: number, z: number, ry: number, s: number, feed: boolean) => {
    const f = new THREE.Group(); f.position.set(x, WL, z); f.rotation.y = ry; f.scale.setScalar(s); gp.add(f);
    strut(f, [0.003, 0, 0], [0.003, 0.05, 0], 0.0015, 0.0015, '#e87a8a', 4);
    strut(f, [-0.003, 0.02, 0.005], [-0.003, 0.05, 0], 0.0015, 0.0015, '#e87a8a', 4);
    sph(f, '#f4a2b4', 0, 0.06, 0, 0.012, 0.012, 0.022, 8);
    add(f, CONE(4), mat('#1a1a1a'), 0, 0.064, -0.022, 0.012, 0.016, 0.006, 0, -Math.PI / 2 - 0.4);
    const head: V3 = feed ? [0, 0.012, 0.035] : [0, 0.11, 0.018];
    limb(f, feed ? [[0, 0.065, 0.016], [0, 0.07, 0.035], [0, 0.03, 0.04], head] : [[0, 0.065, 0.016], [0, 0.09, 0.03], [0, 0.1, 0.008], head], 0.004, 0.003, '#f6b0c0', 5, 2);
    sph(f, '#f6b0c0', head[0], head[1], head[2], 0.006, 0.006, 0.007, 6);
    add(f, CONE(4), mat('#2a2a2a'), head[0], head[1] - 0.004, head[2] + 0.008, 0.005, 0.012, 0.005, 0, Math.PI * 0.75);
  };
  for (let i = 0; i < 13; i++) {
    const x = -0.3 + (i % 7) * 0.09 + H(i, 1) * 0.04, z = 0.22 + Math.floor(i / 7) * 0.1 + H(i, 2) * 0.05;
    if (Math.hypot(x, z) > 0.45) continue;
    flamingo(x, z, H(i, 3) * 6, 0.9 + H(i, 4) * 0.3, i % 3 === 0);
  }
  // Maasai herder and umbrella acacia on the shore
  const ax = 0.32, az = -0.02, ay = gy(ax, az);
  strut(gp, [ax, ay - 0.005, az], [ax + 0.01, ay + 0.1, az], 0.007, 0.004, '#5a4a3a', 5);
  for (let k = 0; k < 5; k++) blob(gp, k % 2 ? '#6a7a3a' : '#7a8a42', ax + 0.01 + Math.cos(k * 1.26) * 0.04, ay + 0.11, az + Math.sin(k * 1.26) * 0.04, 0.05, 0.016, 0.05, k, 0);
  const mx = 0.28, mz = 0.08, my = gy(mx, mz);
  person(gp, mx, my, mz, '#c8202a', 2.4, 1.1, '#4a2a1a', '#4a2a1a');
  strut(gp, [mx + 0.012, my, mz], [mx + 0.014, my + 0.085, mz], 0.0012, 0.0012, '#6a4a2a', 4);
  for (let k = 0; k < 3; k++) { const gx = 0.2 + k * 0.04, gz = 0.04 - k * 0.03, gyy = gy(gx, gz); sph(gp, k % 2 ? '#f0ece4' : '#8a5a3a', gx, gyy + 0.018, gz, 0.011, 0.01, 0.016, 6); for (const lx of [-0.006, 0.006]) strut(gp, [gx + lx, gyy, gz], [gx + lx, gyy + 0.012, gz], 0.0015, 0.0015, '#3a2a1a', 4); }
};

/** Villarrica (Chile): a perfect snow cone with a glowing lava lake, monkey-puzzle trees and a blue lake below. */
const villarrica: Builder = gp => {
  const CX = 0.0, CZ = -0.1, WL = Y0 + 0.004;
  const hf: HF = (x, z) => {
    const d = Math.hypot(x - CX, z - CZ), a = Math.atan2(z - CZ, x - CX);
    const cone0 = 0.46 * Math.max(0, 1 - Math.max(d, 0.045) / 0.4) ** 1.5 * (1 - 0.05 * Math.abs(Math.sin(a * 9)) * sst(0.04, 0.08, d)) - 0.03 * sst(0.045, 0.03, d);
    return cone0 + 0.012 * f2(x * 7, z * 7) + 0.012 - 0.03 * sst(0.24, 0.34, z);
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0, a = Math.atan2(z - CZ, x - CX);
    if (y < WL + 0.004) return B('#a89a80');
    const snow = sst(0.16, 0.22, h + 0.04 * Math.sin(a * 11) + 0.02 * f2(x * 20, z * 20));
    const rock = sst(0.5, 0.8, Math.sin(a * 9 + 0.6)) * sst(0.28, 0.2, h) * snow;
    const lavaRun = sst(0.04, 0.0, Math.abs(a - 1.75 + f2(x * 9, z * 9) * 0.2)) * sst(0.1, 0.36, h);
    return grassy('#2f5a2a', '#4a6a32', 10)(x, y, z, ny).lerp(K('#4a4440'), sst(0.08, 0.14, h)).lerp(K('#f6f8fa'), snow).lerp(K('#5a524c'), rock).lerp(K('#2a2420'), lavaRun);
  }, { rings: 30, segs: 72, wl: WL, water: '#2f6f9a', strata: ['#5a4a3e', '#4a3c32', '#6a5848', '#3e3228'] });
  water(gp, 0.5, WL, '#2f74a2', { rings: 8, segs: 48 });
  const ly = Y0 + hf(CX, CZ) + 0.006;
  cyl(gp, '#ff6a1a', CX, ly - 0.004, CZ, 0.026, 0.004, 12).material = mat('#ff7a20', { emissive: '#ff4a00' });
  sph(gp, '#ffd040', CX + 0.006, ly, CZ, 0.01, 0.003, 0.008, 8).material = mat('#ffd040', { emissive: '#ffaa00' });
  puffs(gp, [CX, ly + 0.03, CZ], 5, '#f2f2f2', 0.045, [-0.1, 0.18, 0]);
  // monkey-puzzle (Araucaria) trees: straight trunk, umbrella of upturned arms
  const araucaria = (x: number, z: number, s: number) => {
    const y = gy(x, z) - 0.004, top: V3 = [x, y + 0.2 * s, z];
    strut(gp, [x, y, z], top, 0.01 * s, 0.006 * s, '#6a5a4a', 6);
    for (let k = 0; k < 8; k++) {
      const a = k * 0.785 + s, lvl = k % 2 ? 0 : -0.02 * s, e: V3 = [x + Math.cos(a) * 0.05 * s, top[1] + lvl + 0.02 * s, z + Math.sin(a) * 0.05 * s];
      limb(gp, [[x, top[1] + lvl - 0.01 * s, z], [x + Math.cos(a) * 0.03 * s, top[1] + lvl - 0.005 * s, z + Math.sin(a) * 0.03 * s], e], 0.006 * s, 0.006 * s, '#2a4a2a', 5, 2);
    }
    blob(gp, '#2f5230', x, top[1] + 0.01 * s, z, 0.03 * s, 0.014 * s, 0.03 * s, 1, 0);
  };
  for (const [x, z, s] of [[-0.32, 0.12, 1.1], [-0.25, 0.2, 0.85], [0.3, 0.1, 1.0], [0.36, -0.06, 0.8], [-0.38, -0.04, 0.9]] as [number, number, number][]) araucaria(x, z, s);
  for (let i = 0; i < 12; i++) { const a = i * 0.52 + 0.2, r = 0.42, x = Math.cos(a + 3.5) * r, z = Math.sin(a + 3.5) * r; if (z < 0.2) pineT(gp, x, gy(x, z), z, 0.8, '#2a4a2e'); }
  // lakeside: Pucón jetty and a little sailboat
  box(gp, '#8a6a4a', 0.12, WL + 0.004, 0.33, 0.02, 0.006, 0.1);
  const sb = new THREE.Group(); sb.position.set(-0.08, WL, 0.4); sb.rotation.y = 0.6; gp.add(sb);
  sweep(sb, [{ p: [0, 0.006, -0.03], w: 0.004, h: 0.004 }, { p: [0, 0.006, 0], w: 0.012, h: 0.006 }, { p: [0, 0.008, 0.03], w: 0.003, h: 0.004 }], '#f4f4f4', { radial: 8, sub: 2, squash: 0.6 });
  strut(sb, [0, 0.008, 0], [0, 0.07, 0], 0.0015, 0.0015, '#555555', 4);
  slab(sb, [[0, 0.012], [0, 0.066], [0.03, 0.014]], 0.002, '#f8f8f2', 0, false).position.set(0, 0, 0.001);
  person(gp, 0.12, WL + 0.007, 0.38, '#e0442a', 0, 0.9);
};

/** Mount Ararat: Greater and Little Ararat over the Ararat plain, seen from Khor Virap with its apricot orchards. */
const ararat: Builder = gp => {
  const G: V3 = [-0.14, 0, -0.16], Lt: V3 = [0.2, 0, -0.08];
  const hf: HF = (x, z) => {
    const dg = Math.hypot(x - G[0], (z - G[2]) * 1.15), dl = Math.hypot(x - Lt[0], z - Lt[2]);
    const big = 0.42 * Math.max(0, 1 - dg / 0.36) ** 1.15 * (1 + 0.12 * sst(0.12, 0, dg)) ;
    const small = 0.26 * Math.max(0, 1 - dl / 0.2) ** 1.35;
    const saddle = 0.1 * sst(0.16, 0, Math.abs((z + 0.12) - (x - 0.03) * 0.25)) * sst(0.25, 0.0, Math.abs(x - 0.06));
    const a = Math.atan2(z - G[2], x - G[0]);
    return Math.max(big * (1 - 0.06 * Math.abs(Math.sin(a * 8 + dg * 12))), small, saddle) + 0.014 * f2(x * 7, z * 7) + 0.01;
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0, dg = Math.hypot(x - G[0], z - G[2]);
    const snowLine = dg < 0.3 ? 0.24 : 0.28;
    const snow = sst(snowLine, snowLine + 0.05, h + 0.03 * f2(x * 18, z * 18) + 0.04 * Math.sin(Math.atan2(z - G[2], x - G[0]) * 9) * sst(0.15, 0.3, h));
    const steep = sst(0.85, 0.6, ny);
    const plain = (z > 0.1 && Math.hypot(x, z) < 0.46) ? (Math.sin(x * 70 + Math.floor(z * 14) * 1.7) > 0 ? B('#7e9a40') : B('#b0a85a')) : grassy('#8a8a52', '#a69a62', 13)(x, y, z, ny);
    return plain.lerp(K('#8a7056'), sst(0.03, 0.09, h)).lerp(K('#6a5a4c'), steep * sst(0.05, 0.12, h) * 0.7).lerp(K('#f4f6fa'), snow);
  }, { rings: 34, segs: 72, strata: ['#8a6a4a', '#7a5a3c', '#9a7a56', '#6a4c34'] });
  // Noah's ark resting high on the saddle (legend!)
  const ax = 0.04, az = -0.12, ark = new THREE.Group(); ark.position.set(ax, gy(ax, az) - 0.002, az); ark.rotation.y = 0.3; ark.rotation.z = 0.05; gp.add(ark);
  tbox(ark, 0.05, 0.014, 0.07, 0.022, 0.014, '#7a5232', 0, 0, 0);
  box(ark, '#8a6040', 0, 0.022, 0, 0.04, 0.014, 0.014);
  gable(ark, 0.044, 0.01, 0.018, '#5a3a22', 0, 0.029, 0);
  // Khor Virap monastery on its hillock
  const mx = 0.18, mz = 0.26, my = gy(mx, mz) + 0.01, m = new THREE.Group(); m.position.set(mx, my, mz); m.rotation.y = -0.4; gp.add(m);
  cyl(m, '#9a8a62', 0, -0.03, 0, 0.11, 0.03, 10);
  const wall = '#c8a882';
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    box(m, wall, Math.cos(a) * 0.075, 0.012, Math.sin(a) * 0.075, k % 2 ? 0.15 : 0.006, 0.024, k % 2 ? 0.006 : 0.15);
    cyl(m, wall, Math.cos(a + 0.785) * 0.106, 0, Math.sin(a + 0.785) * 0.106, 0.012, 0.03, 8);
  }
  box(m, wall, 0, 0.02, 0, 0.05, 0.04, 0.035);
  gable(m, 0.052, 0.015, 0.037, '#a8886a', 0, 0.04, 0);
  cyl(m, wall, 0, 0.04, 0, 0.012, 0.03, 8);
  cone(m, '#a8886a', 0, 0.07, 0, 0.015, 0.025, 8);
  box(m, '#3a2a20', 0, 0.015, 0.018, 0.01, 0.02, 0.002);
  // apricot orchard rows and a flock of sheep
  for (let i = 0; i < 18; i++) {
    const x = -0.36 + (i % 6) * 0.05, z = 0.18 + Math.floor(i / 6) * 0.06;
    if (Math.hypot(x, z) > 0.45) continue;
    const y = gy(x, z);
    strut(gp, [x, y - 0.004, z], [x, y + 0.02, z], 0.003, 0.002, '#5a4030', 4);
    blob(gp, i % 4 ? '#5e8a36' : '#e8a040', x, y + 0.03, z, 0.018, 0.014, 0.018, i, 0);
  }
  for (let i = 0; i < 7; i++) {
    const x = 0.0 + H(i, 1) * 0.1, z = 0.32 + H(i, 2) * 0.07, y = gy(x, z);
    sph(gp, '#f2eee2', x, y + 0.012, z, 0.008, 0.007, 0.011, 6);
    sph(gp, '#2a2420', x, y + 0.015, z + 0.011, 0.004, 0.004, 0.005, 5);
  }
  person(gp, 0.08, gy(0.08, 0.36), 0.36, '#3a5a8a', 0.4, 1.0);
};

/** Klyuchevskaya Sopka (Kamchatka): the tallest active volcano in Eurasia — perfect snowy cone, ash plume, bear and salmon river. */
const klyuch: Builder = gp => {
  const CX = -0.04, CZ = -0.12;
  const riv = (x: number) => 0.2 + 0.05 * Math.sin(x * 9);
  const hf: HF = (x, z) => {
    const d = Math.hypot(x - CX, z - CZ), a = Math.atan2(z - CZ, x - CX);
    const main = 0.5 * Math.max(0, 1 - d / 0.38) ** 1.7 * (1 - 0.05 * Math.abs(Math.sin(a * 11))) - 0.02 * sst(0.03, 0.015, d);
    const kamen = 0.24 * Math.max(0, 1 - Math.hypot(x + 0.3, z + 0.28) / 0.2) ** 1.2 * (1 - 0.25 * f2(x * 12, z * 12));
    const river = 0.03 * sst(0.035, 0.0, Math.abs(z - riv(x)));
    return Math.max(main, kamen) + 0.016 * f2(x * 8, z * 8) + 0.02 - river;
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0, a = Math.atan2(z - CZ, x - CX);
    if (Math.abs(z - riv(x)) < 0.022 && h < 0.02) return B('#4a7fa0').lerp(K('#a8d0e0'), sst(0.6, 0.9, f2(x * 40, z * 40)) * 0.4);
    const gl = sst(0.6, 0.95, Math.sin(a * 6 + 1)) * sst(0.06, 0.12, h);
    const snow = Math.min(1, sst(0.12, 0.16, h + 0.04 * Math.sin(a * 13) + 0.02 * f2(x * 22, z * 22)) + gl);
    const ash = sst(0.5, 0.9, Math.sin(a * 13 + 2)) * sst(0.25, 0.4, h) * 0.6;
    return grassy('#4a6a32', '#6a7a3a', 21)(x, y, z, ny).lerp(K('#5a4a40'), sst(0.04, 0.09, h)).lerp(K('#f4f7fb'), snow).lerp(K('#6a6058'), ash);
  }, { rings: 34, segs: 72, strata: ['#4a3a32', '#3a2e28', '#5a4a3e', '#2e2420'] });
  // river water
  const rw: number[] = [];
  for (let i = 0; i < 24; i++) {
    const x0 = -0.5 + i / 24, x1 = x0 + 1 / 24, z0 = riv(x0), z1 = riv(x1);
    if (Math.hypot(x0, z0) > 0.47 || Math.hypot(x1, z1) > 0.47) continue;
    rw.push(x0, z0 - 0.02, x0, z0 + 0.02, x1, z1 - 0.02, x1, z1 + 0.02);
  }
  const wy = Y0 + 0.012, wp: number[] = [];
  for (let k = 0; k < rw.length; k += 8) wp.push(rw[k], wy, rw[k + 1], rw[k + 2], wy, rw[k + 3], rw[k + 4], wy, rw[k + 5], rw[k + 2], wy, rw[k + 3], rw[k + 6], wy, rw[k + 7], rw[k + 4], wy, rw[k + 5]);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.computeVertexNormals();
  if ((wg.getAttribute('normal').getY(0)) < 0) { const ix: number[] = []; for (let k = 0; k < wp.length / 3; k += 3) ix.push(k, k + 2, k + 1); wg.setIndex(ix); wg.computeVertexNormals(); }
  add(gp, wg, mat('#4a86b0', { transparent: 0.85, rough: 0.3 }), 0, 0, 0, 1, 1, 1);
  // ash plume
  puffs(gp, [CX, Y0 + 0.5, CZ], 7, '#7a7470', 0.05, [0.2, 0.25, 0.05], 0.85);
  // larch & birch forest
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, r = 0.3 + H(i, 5) * 0.16, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - riv(x)) < 0.05 || Math.hypot(x - CX, z - CZ) < 0.3) continue;
    const y = gy(x, z);
    if (i % 3) pineT(gp, x, y, z, 0.8 + H(i, 6) * 0.4, i % 2 ? '#5a7a2a' : '#3a5a2a');
    else { strut(gp, [x, y - 0.004, z], [x, y + 0.05, z], 0.003, 0.002, '#e8e4dc', 4); blob(gp, '#c8a832', x, y + 0.05, z, 0.016, 0.022, 0.016, i, 0); }
  }
  // brown bear fishing in the river
  const bx = 0.16, bz = riv(0.16), by = Y0 + 0.004, bear = new THREE.Group(); bear.position.set(bx, by, bz); bear.rotation.y = 2.2; gp.add(bear);
  const fur = '#6a4428';
  sph(bear, fur, 0, 0.032, 0, 0.022, 0.02, 0.034, 8);
  sph(bear, fur, 0, 0.042, -0.012, 0.02, 0.02, 0.02, 8);
  sph(bear, fur, 0, 0.04, 0.032, 0.013, 0.013, 0.014, 8);
  sph(bear, '#8a6040', 0, 0.036, 0.046, 0.006, 0.005, 0.007, 6);
  sph(bear, '#1a1410', 0, 0.038, 0.052, 0.002, 0.002, 0.002, 4);
  for (const ex of [-0.008, 0.008]) sph(bear, fur, ex, 0.053, 0.03, 0.004, 0.004, 0.003, 5);
  for (const [lx, lz] of [[-0.012, 0.018], [0.012, 0.018], [-0.012, -0.02], [0.012, -0.02]]) strut(bear, [lx, 0.0, lz], [lx, 0.03, lz], 0.007, 0.008, fur, 5);
  const fish = (x: number, y: number, z: number, ry: number, rz: number) => {
    const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.set(0, ry, rz); gp.add(f);
    sph(f, '#c8443a', 0, 0, 0, 0.004, 0.005, 0.012, 6);
    add(f, CONE(3), mat('#a83a30'), 0, 0, -0.014, 0.005, 0.008, 0.002, 0, Math.PI / 2);
  };
  fish(bx + 0.02, by + 0.035, bz + 0.03, 0.4, 0.6);
  fish(0.05, Y0 + 0.016, riv(0.05) - 0.005, 0, 0);
  fish(-0.06, Y0 + 0.016, riv(-0.06) + 0.004, 0.2, 0);
  person(gp, -0.2, gy(-0.2, 0.3), 0.3, '#d8402a', 0.4, 1);
};

/** Piton de la Fournaise (Réunion): shield volcano with a horseshoe caldera, glowing lava flowing down to the Indian Ocean. */
const fournaise: Builder = gp => {
  const WL = Y0 + 0.006;
  const flowX = (z: number) => 0.06 + 0.04 * Math.sin(z * 8);
  const hf: HF = (x, z) => {
    const r = Math.hypot(x, z + 0.15);
    let h = 0.26 * Math.max(0, 1 - (r / 0.62) ** 1.6);
    const inC = sst(0.19, 0.16, Math.abs(x)) * sst(-0.32, -0.28, z);
    h -= 0.08 * inC * sst(0.0, 0.3, 0.3 - Math.max(0, z) * 0.6);
    const dc = Math.hypot(x + 0.01, z + 0.12);
    h += 0.09 * Math.max(0, 1 - dc / 0.14) ** 1.2 - 0.03 * sst(0.04, 0.02, dc);
    h += 0.04 * Math.max(0, 1 - Math.hypot(x - 0.1, z + 0.02) / 0.04);
    h -= 0.06 * sst(0.22, 0.42, z) + 0.05 * sst(0.32, 0.45, z);
    return Math.max(-0.025, h + 0.008 * f2(x * 10, z * 10) + 0.01);
  };
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const inC = Math.abs(x) < 0.17 && z > -0.3;
    if (y < WL + 0.004) return B('#2a2624');
    const flow = sst(0.025, 0.008, Math.abs(x - flowX(z))) * sst(-0.06, -0.02, z);
    const old = inC ? B('#4a4442').lerp(K('#6a5648'), f2(x * 30, z * 30) * 0.6).lerp(K('#8a3a22'), sst(0.04, 0.0, Math.hypot(x + 0.01, z + 0.12) - 0.05) * 0.6) : grassy('#3a7a2e', '#5a8a36', 17)(x, y, z, ny).lerp(K('#6a5a4a'), sst(0.75, 0.5, ny) * 0.8);
    return old.lerp(K('#ff5a10'), flow);
  }, { rings: 34, segs: 80, wl: WL, water: '#1f5f8a', strata: ['#3a3230', '#2a2422', '#4a3e38', '#221c1a'] });
  water(gp, 0.5, WL, '#1e6aa0', { rings: 10, segs: 56, spot: (x, z) => (Math.hypot(x - flowX(z), z - 0.43) < 0.06 ? '#b8c8d0' : null) });
  // glowing lava ribbon (emissive) over the painted flow
  const pts: V3[] = [];
  for (let z = -0.05; z <= 0.42; z += 0.05) pts.push([flowX(z), gy(flowX(z), z) + 0.004, z]);
  const lm = limb(gp, pts, 0.008, 0.006, '#ff6a18', 4, 2);
  lm.material = mat('#ff7a20', { emissive: '#ff4400' });
  const lk = cyl(gp, '#ff7a20', -0.01, gy(-0.01, -0.12) - 0.002, -0.12, 0.022, 0.003, 10); lk.material = mat('#ff8a20', { emissive: '#ff5000' });
  // lava fountain and steam where lava meets the sea
  for (let k = 0; k < 4; k++) blob(gp, k % 2 ? '#ffb030' : '#ff6a18', -0.01 + (H(k, 1) - 0.5) * 0.02, gy(-0.01, -0.12) + 0.01 + k * 0.012, -0.12, 0.008, 0.012, 0.008, k, 0).material = mat('#ffa030', { emissive: '#ff6000' });
  puffs(gp, [flowX(0.43), WL + 0.03, 0.44], 5, '#f4f4f4', 0.04, [-0.04, 0.2, -0.04], 0.8);
  puffs(gp, [-0.01, gy(-0.01, -0.12) + 0.06, -0.12], 3, '#c8c4bc', 0.025, [0.04, 0.08, 0], 0.6);
  // palm trees and a road-side red-roofed house on the green slopes
  const palm = (x: number, z: number, s: number) => {
    const y = gy(x, z) - 0.003, t: V3 = [x + 0.012 * s, y + 0.09 * s, z];
    limb(gp, [[x, y, z], [x + 0.008 * s, y + 0.05 * s, z], t], 0.005 * s, 0.003 * s, '#7a6048', 5, 2);
    for (let k = 0; k < 6; k++) aim(gp, leafGeo('n2palm', 5, t => 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.2)), 0.3, 0.5), '#3a8a32', t, [Math.cos(k * 1.05), -0.25, Math.sin(k * 1.05)], 0.05 * s, 0.03 * s);
  };
  for (const [x, z, s] of [[-0.3, 0.18, 1], [-0.36, 0.06, 0.8], [0.33, 0.12, 0.9], [0.28, 0.24, 1.1], [-0.22, 0.26, 0.85]] as [number, number, number][]) palm(x, z, s);
  for (let i = 0; i < 12; i++) { const a = i * 0.5 + 3.4, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4 - 0.05; blob(gp, i % 2 ? '#2f6a2a' : '#3e7a30', x, gy(x, z) + 0.02, z, 0.03, 0.026, 0.03, i, 0); }
  const hx = -0.26, hz = 0.0, hy = gy(hx, hz), hs = new THREE.Group(); hs.position.set(hx, hy, hz); hs.rotation.y = 0.5; gp.add(hs);
  box(hs, '#f4ecd8', 0, 0.012, 0, 0.04, 0.024, 0.03); gable(hs, 0.046, 0.016, 0.034, '#c8402a', 0, 0.024, 0);
  person(gp, -0.2, gy(-0.2, 0.06), 0.06, '#f0c020', 1.2, 1);
  person(gp, -0.18, gy(-0.18, 0.08), 0.08, '#2a6ab0', 1.6, 0.9);
};

// ================================================ PREHISTORIC ANIMALS =====================================
/** Hide painter: local position, normal and u along the loft (0 = first station). Returns W. */
type HP = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number) => THREE.Color;
interface St2 { p: V3; w: number; h?: number }
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _S = new THREE.Vector3(), _N = new THREE.Vector3(), _UP = new THREE.Vector3();
/** Smooth vertex-coloured loft (elliptical rings along a Catmull-Rom spine) with capped ends — bodies, necks, limbs. */
function hide(p: THREE.Object3D, st: St2[], paint: HP, nv = 12, sub = 4, o: { belly?: number; up?: V3; shape?: (u: number, a: number) => number } = {}): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(st.map(q => new THREE.Vector3(...q.p)), false, 'centripetal');
  const n = (st.length - 1) * sub, pos: number[] = [], uu: number[] = [];
  _UP.set(...(o.up ?? [0, 1, 0]));
  const prev = new THREE.Vector3(); let hasPrev = false;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPoint(t, _P); curve.getTangent(t, _T);
    _S.crossVectors(_UP, _T);
    if (_S.lengthSq() < 1e-8) _S.copy(hasPrev ? prev : new THREE.Vector3(1, 0, 0));
    _S.normalize();
    if (hasPrev && _S.dot(prev) < 0) _S.negate();
    prev.copy(_S); hasPrev = true;
    _N.crossVectors(_T, _S).normalize();
    const f = t * (st.length - 1), k = Math.min(st.length - 2, Math.floor(f)), q = f - k, e = q * q * (3 - 2 * q);
    const w = st[k].w + (st[k + 1].w - st[k].w) * e, h0 = st[k].h ?? st[k].w, h = h0 + ((st[k + 1].h ?? st[k + 1].w) - h0) * e;
    for (let j = 0; j < nv; j++) {
      const a = (j / nv) * TAU, ca = Math.cos(a), sa = Math.sin(a), hb = sa < 0 && o.belly ? h * o.belly : h, sc = o.shape ? o.shape(t, a) : 1;
      pos.push(_P.x + (_S.x * ca * w + _N.x * sa * hb) * sc, _P.y + (_S.y * ca * w + _N.y * sa * hb) * sc, _P.z + (_S.z * ca * w + _N.z * sa * hb) * sc);
      uu.push(t);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < nv; j++) {
    const a = i * nv + j, b = i * nv + ((j + 1) % nv), c = (i + 1) * nv + j, d = (i + 1) * nv + ((j + 1) % nv);
    idx.push(a, c, b, b, c, d);
  }
  for (const [ring, sgn] of [[0, -1], [n, 1]] as const) {
    const ctr = pos.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < nv; j++) { cx += pos[(ring * nv + j) * 3]; cy += pos[(ring * nv + j) * 3 + 1]; cz += pos[(ring * nv + j) * 3 + 2]; }
    pos.push(cx / nv, cy / nv, cz / nv); uu.push(ring ? 1 : 0);
    for (let j = 0; j < nv; j++) { const a = ring * nv + j, b = ring * nv + ((j + 1) % nv); if (sgn < 0) idx.push(ctr, b, a); else idx.push(ctr, a, b); }
  }
  // make the winding face outward (checked on the middle ring)
  const mi = Math.floor(n / 2) * nv, v = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const cen = new THREE.Vector3(); for (let j = 0; j < nv; j++) cen.add(v(mi + j)); cen.multiplyScalar(1 / nv);
  const A = v(mi), Bv = v(mi + 1), C = v(mi + nv);
  if (new THREE.Vector3().crossVectors(C.clone().sub(A), Bv.clone().sub(A)).dot(A.clone().sub(cen)) < 0)
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal'), cnt = pos.length / 3, col = new Float32Array(cnt * 3);
  for (let k = 0; k < cnt; k++) {
    const c = paint(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], nor.getX(k), nor.getY(k), nor.getZ(k), uu[k]);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return add(p, geo, mat('#ffffff', { flat: false, vc: true, rough: 0.75 }), 0, 0, 0, 1, 1, 1);
}
interface Skin { top: string; belly: string; stripe?: string; sf?: number; spot?: string; spf?: number }
/** Countershaded hide with optional dorsal stripes (along z) and blotches. */
const skin = (o: Skin): HP => (x, y, z, _nx, ny) => {
  B(o.top).lerp(K(o.belly), sst(0.0, -0.6, ny));
  if (o.stripe) L(o.stripe, sst(0.3, 0.85, Math.sin(z * (o.sf ?? 60) + f2(x * 30 + y * 20, z * 30) * 2.5)) * sst(-0.25, 0.45, ny) * 0.8);
  if (o.spot) L(o.spot, sst(0.6, 0.68, f2(x * (o.spf ?? 40) + y * 23, z * (o.spf ?? 40) - y * 17, 2, 3)) * sst(-0.3, 0.3, ny) * 0.85);
  return W;
};
const CONEZ = () => g('n2-conez', () => { const c = new THREE.ConeGeometry(0.5, 1, 5, 1); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.5); return c; });
/** Cone from `at` pointing along `dir` (claws, horns, teeth, quills). */
function spike(p: THREE.Object3D, c: string, at: V3, dir: V3, len: number, r: number, up: V3 = [0, 1, 0]): THREE.Mesh {
  const m = aim(p, CONEZ(), c, at, dir, 1, 1, Math.abs(dir[1]) > 0.95 * Math.hypot(...dir) ? [0, 0, 1] : up);
  m.scale.set(r * 2, r * 2, len);
  return m;
}
/** Glossy eye: iris + pupil looking outward along side sx. */
function eye(p: THREE.Object3D, at: V3, r: number, sx: number, iris = '#d9a020'): void {
  sph(p, iris, at[0], at[1], at[2], r, r, r, 8);
  sph(p, '#0c0806', at[0] + sx * r * 0.55, at[1], at[2] + r * 0.12, r * 0.55, r * 0.7, r * 0.6, 6);
  sph(p, '#ffffff', at[0] + sx * r * 0.85, at[1] + r * 0.35, at[2] + r * 0.3, r * 0.18, r * 0.18, r * 0.18, 4);
}
/** Row of n teeth between a and b pointing along dir. */
function teeth(p: THREE.Object3D, a: V3, b: V3, n: number, len: number, dir: V3 = [0, -1, 0.15], c = '#f2ead2'): void {
  for (let i = 0; i < n; i++) spike(p, c, lerp3(a, b, (i + 0.5) / n), dir, len * (1 - 0.4 * (i / n)), len * 0.3);
}
/** Hind leg: hip → knee → ankle → foot with toes (claws) pointing along `fwd`. `r` = thigh radius. */
function hindLeg(p: THREE.Object3D, hip: V3, knee: V3, ankle: V3, foot: V3, r: number, paint: HP, fwd: V3 = [0, 0, 1], claw = '#3a3028', toes = 3, tl = 0.03): void {
  hide(p, [{ p: hip, w: r * 1.6, h: r * 1.15 }, { p: lerp3(hip, knee, 0.55), w: r * 1.35, h: r }, { p: knee, w: r * 0.75, h: r * 0.65 }, { p: lerp3(knee, ankle, 0.5), w: r * 0.55, h: r * 0.5 }, { p: ankle, w: r * 0.38 }, { p: foot, w: r * 0.36, h: r * 0.3 }], paint, 8, 3, { up: [1, 0, 0] });
  const yaw = Math.atan2(fwd[0], fwd[2]);
  for (let k = 0; k < toes; k++) {
    const a = yaw + (k - (toes - 1) / 2) * 0.42, d: V3 = [Math.sin(a), -0.12, Math.cos(a)];
    const base: V3 = [foot[0] + d[0] * r * 0.25, foot[1], foot[2] + d[2] * r * 0.25];
    limb(p, [base, [base[0] + d[0] * tl * 0.7, foot[1] - r * 0.2, base[2] + d[2] * tl * 0.7]], r * 0.22, r * 0.16, '#000', 5, 1, () => '#' + paint(...base, 0, 1, 0, 1).getHexString());
    spike(p, claw, [base[0] + d[0] * tl * 0.65, foot[1] - r * 0.2, base[2] + d[2] * tl * 0.65], [d[0], -0.5, d[2]], tl * 0.45, r * 0.14);
  }
}
/** Fore limb: shoulder → elbow → wrist, with `n` claws of length cl along `cd`. */
function foreLimb(p: THREE.Object3D, sh: V3, el: V3, wr: V3, r: number, paint: HP, n: number, cl: number, cd: V3, claw = '#3a3028'): void {
  hide(p, [{ p: sh, w: r * 1.2 }, { p: el, w: r * 0.75 }, { p: wr, w: r * 0.55 }], paint, 7, 3, { up: [1, 0, 0] });
  // Fingers stacked vertically: dinosaur wrists could not pronate, so palms face inward (each other)
  const sx = Math.sign(wr[0]) || 1;
  for (let k = 0; k < n; k++) spike(p, claw, [wr[0] - sx * r * 0.15, wr[1] + ((n - 1) / 2 - k) * r * 0.6, wr[2]], [cd[0] - sx * 0.12, cd[1] - k * 0.12, cd[2]], cl * (k === 0 ? 1.15 : 1), r * 0.28);
}
/** Prehistoric flora. */
const FROND = () => leafGeo('n2-frond', 5, t => 0.42 * Math.min(1, t * 3.5) * (1 - t * 0.85), -0.15, 0.35, '#2f5a22', '#6a9a3a');
function fern(p: THREE.Object3D, x: number, y: number, z: number, s: number, sd = 0, n = 6): void {
  for (let k = 0; k < n; k++) { const a = k * (TAU / n) + sd; aim(p, FROND(), '', [x, y, z], [Math.cos(a), 0.75 + H(k, sd) * 0.4, Math.sin(a)], 0.07 * s, 0.05 * s, [0, 1, 0], true); }
}
const CYCF = () => leafGeo('n2-cycf', 5, t => 0.3 * Math.min(1, t * 5) * (1 - t * 0.7), -0.3, 0.12, '#2a4a1e', '#4e7a2e');
function cycad(p: THREE.Object3D, x: number, y: number, z: number, s: number, sd = 0): void {
  lathe(p, [[0.001, 0], [0.016 * s, 0], [0.018 * s, 0.02 * s], [0.013 * s, 0.04 * s], [0.002, 0.045 * s]], '#6a5232', x, y, z, 7);
  for (let k = 0; k < 9; k++) { const a = k * 0.7 + sd; aim(p, CYCF(), '', [x, y + 0.042 * s, z], [Math.cos(a), 0.55 + (k % 3) * 0.25, Math.sin(a)], 0.07 * s, 0.05 * s, [0, 1, 0], true); }
}
function treeFern(p: THREE.Object3D, x: number, y: number, z: number, s: number, sd = 0): void {
  const top: V3 = [x + 0.01 * s, y + 0.16 * s, z];
  limb(p, [[x, y - 0.005, z], [x + 0.006 * s, y + 0.08 * s, z], top], 0.009 * s, 0.007 * s, '#5a4430', 5, 2);
  for (let k = 0; k < 8; k++) { const a = k * 0.785 + sd; aim(p, FROND(), '', top, [Math.cos(a), 0.15, Math.sin(a)], 0.1 * s, 0.07 * s, [0, 1, 0], true); }
}
function horsetail(p: THREE.Object3D, x: number, y: number, z: number, s: number, sd = 0): void {
  for (let k = 0; k < 4; k++) { const a = k * 1.6 + sd, h = (0.06 + H(k, sd) * 0.04) * s; strut(p, [x + Math.cos(a) * 0.006, y, z + Math.sin(a) * 0.006], [x + Math.cos(a) * 0.014, y + h, z + Math.sin(a) * 0.014], 0.0028 * s, 0.0016 * s, k % 2 ? '#5a7a32' : '#6a8a3a', 4); }
}
const stone = (p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#8a8276', sd = 0) => blob(p, c, x, y + s * 0.25, z, s, s * 0.55, s * 0.8, sd, 0, sd);

/** Carnotaurus (Patagonia): the "meat-eating bull" — horned brows, stubby arms, bumpy armour, striding through floodplain scrub. */
const carnotaurus: Builder = gp => {
  const hf: HF = (x, z) => 0.012 * f2(x * 6, z * 6) - 0.02 * sst(0.06, 0.0, Math.abs(z + 0.3 + 0.08 * Math.sin(x * 6))) + 0.01;
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    if (Math.abs(z + 0.3 + 0.08 * Math.sin(x * 6)) < 0.04) return B('#5a8aa0').lerp(K('#8a7a5a'), sst(0.03, 0.045, Math.abs(z + 0.3 + 0.08 * Math.sin(x * 6))));
    return grassy('#9a8a52', '#7a7a3e', 8, 4)(x, y, z, ny).lerp(K('#b09a6a'), sst(0.55, 0.7, f2(x * 5, z * 5, 2, 8)) * 0.7);
  }, { rings: 22, segs: 56, strata: ['#a07a52', '#8a6442', '#b08a5e', '#7a5638'] });
  const sk = skin({ top: '#8a3a26', belly: '#e0c8a0', stripe: '#4a2016', sf: 70 });
  const d = new THREE.Group(); d.position.set(0.02, gy(0, 0.02), 0.02); d.rotation.y = 1.15; gp.add(d);
  const spine: St2[] = [
    { p: [0, 0.2, -0.4], w: 0.004 }, { p: [0, 0.23, -0.3], w: 0.016, h: 0.02 }, { p: [0, 0.255, -0.18], w: 0.032, h: 0.04 },
    { p: [0, 0.27, -0.06], w: 0.05, h: 0.062 }, { p: [0, 0.26, 0.04], w: 0.054, h: 0.07 }, { p: [0, 0.265, 0.12], w: 0.044, h: 0.055 },
    { p: [0, 0.29, 0.18], w: 0.03, h: 0.036 }, { p: [0, 0.31, 0.225], w: 0.033, h: 0.042 }, { p: [0, 0.305, 0.27], w: 0.026, h: 0.034 },
    { p: [0, 0.298, 0.305], w: 0.017, h: 0.024 }, { p: [0, 0.294, 0.318], w: 0.006, h: 0.01 },
  ];
  hide(d, spine, sk, 14, 4, { belly: 0.85 });
  // lower jaw (mouth slightly open) and teeth
  hide(d, [{ p: [0, 0.29, 0.215], w: 0.024, h: 0.016 }, { p: [0, 0.276, 0.27], w: 0.019, h: 0.011 }, { p: [0, 0.27, 0.305], w: 0.01, h: 0.007 }], skin({ top: '#7a3422', belly: '#d8bc94' }), 10, 3);
  teeth(d, [0.015, 0.284, 0.25], [0.01, 0.282, 0.305], 5, 0.009); teeth(d, [-0.015, 0.284, 0.25], [-0.01, 0.282, 0.305], 5, 0.009);
  sph(d, '#7a2a24', 0, 0.284, 0.27, 0.014, 0.004, 0.03, 6);
  // the famous brow horns
  for (const sx of [-1, 1]) {
    spike(d, '#6e3222', [sx * 0.016, 0.324, 0.228], [sx * 0.8, 0.7, -0.15], 0.045, 0.017);
    eye(d, [sx * 0.026, 0.318, 0.252], 0.0065, sx, '#e0b020');
  }
  // osteoderm rows along the back
  for (let i = 0; i < 14; i++) {
    const t = i / 13, z = -0.22 + t * 0.38, y = 0.255 + Math.sin(t * Math.PI) * 0.06 + 0.005;
    for (const sx of [-1, 1]) sph(d, '#6a2a1a', sx * (0.024 + 0.012 * Math.sin(t * Math.PI)), y, z, 0.006, 0.005, 0.007, 5);
  }
  // legs: striding pose
  hindLeg(d, [0.04, 0.25, -0.05], [0.05, 0.15, 0.03], [0.05, 0.06, -0.03], [0.05, 0.008, 0.03], 0.03, sk);
  hindLeg(d, [-0.04, 0.25, -0.05], [-0.05, 0.16, -0.02], [-0.05, 0.08, -0.11], [-0.05, 0.016, -0.1], 0.03, sk, [0, -0.3, 1]);
  // tiny arms
  for (const sx of [-1, 1]) foreLimb(d, [sx * 0.04, 0.235, 0.12], [sx * 0.045, 0.215, 0.13], [sx * 0.042, 0.205, 0.14], 0.008, sk, 2, 0.006, [0, -0.3, 1]);
  // Patagonian scrub, a monkey-puzzle and river stones
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + 3.6, r = 0.36 + H(i, 1) * 0.08, x = Math.cos(a) * r, z = Math.sin(a) * r; if (i % 3) blob(gp, i % 2 ? '#6a7a3a' : '#7a7a42', x, gy(x, z) + 0.015, z, 0.03, 0.022, 0.03, i, 0); else cycad(gp, x, gy(x, z), z, 1, i); }
  const tx = -0.3, tz = -0.18, ty = gy(tx, tz);
  strut(gp, [tx, ty - 0.005, tz], [tx, ty + 0.3, tz], 0.012, 0.007, '#6a5440', 6);
  for (let k = 0; k < 4; k++) { const yy = ty + 0.2 + k * 0.03, rr = 0.07 - k * 0.014; blob(gp, '#2e4a28', tx, yy, tz, rr, 0.018, rr, k, 0); }
  for (let i = 0; i < 5; i++) { const x = 0.15 + i * 0.05, z = -0.32 + H(i, 3) * 0.05; stone(gp, x, gy(x, z), z, 0.015 + H(i, 4) * 0.01, '#9a9286', i); }
  fern(gp, 0.3, gy(0.3, 0.15), 0.15, 0.9, 1); fern(gp, -0.22, gy(-0.22, 0.25), 0.25, 1.1, 2); fern(gp, 0.12, gy(0.12, 0.35), 0.35, 0.8, 3);
};

/** Cryolophosaurus (Antarctica): the "frozen-crested lizard" with its Elvis-style crest, in a warm Jurassic polar forest. */
const cryolophosaurus: Builder = gp => {
  const hf: HF = (x, z) => 0.014 * f2(x * 6, z * 6, 2, 2) + 0.012 + 0.07 * sst(0.25, 0.48, -z - x * 0.3) * f2(x * 5, z * 5, 2, 7);
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const back = sst(0.3, 0.42, -z - x * 0.3);
    return grassy('#4e7a34', '#6a8a3e', 10, 6)(x, y, z, ny).lerp(K('#5a4a3a'), sst(0.6, 0.75, f2(x * 9, z * 9, 2, 1)) * 0.5).lerp(K('#eef2f6'), back * sst(0.8, 0.95, ny) * 0.0);
  }, { rings: 22, segs: 56, strata: ['#6a5a4a', '#5a4a3c', '#7a6a58', '#4a3c30'] });
  const sk = skin({ top: '#4a5a6a', belly: '#d8d4c4', stripe: '#2a3442', sf: 55, spot: '#a8603a', spf: 60 });
  const d = new THREE.Group(); d.position.set(0.03, gy(0, 0), 0.04); d.rotation.y = 1.35; gp.add(d);
  const spine: St2[] = [
    { p: [0, 0.205, -0.42], w: 0.004 }, { p: [0, 0.225, -0.32], w: 0.013, h: 0.016 }, { p: [0, 0.243, -0.2], w: 0.026, h: 0.034 },
    { p: [0, 0.25, -0.08], w: 0.04, h: 0.052 }, { p: [0, 0.245, 0.02], w: 0.043, h: 0.058 }, { p: [0, 0.25, 0.09], w: 0.034, h: 0.044 },
    { p: [0, 0.285, 0.15], w: 0.022, h: 0.028 }, { p: [0, 0.31, 0.19], w: 0.024, h: 0.032 }, { p: [0, 0.306, 0.235], w: 0.019, h: 0.026 },
    { p: [0, 0.297, 0.275], w: 0.013, h: 0.019 }, { p: [0, 0.293, 0.29], w: 0.005, h: 0.008 },
  ];
  hide(d, spine, sk, 14, 4, { belly: 0.85 });
  hide(d, [{ p: [0, 0.293, 0.185], w: 0.018, h: 0.012 }, { p: [0, 0.272, 0.24], w: 0.014, h: 0.009 }, { p: [0, 0.262, 0.275], w: 0.007, h: 0.005 }], skin({ top: '#3e4c5a', belly: '#d0ccbc' }), 10, 3);
  teeth(d, [0.011, 0.287, 0.215], [0.008, 0.284, 0.28], 5, 0.008); teeth(d, [-0.011, 0.287, 0.215], [-0.008, 0.284, 0.28], 5, 0.008);
  sph(d, '#8a2a2a', 0, 0.282, 0.235, 0.01, 0.004, 0.03, 6);
  // the single transverse crest above the eyes: a thin, furrowed plate running side-to-side (a "pompadour")
  const co: [number, number][] = [[0.014, 0], [0.026, 0.016]];
  for (let k = 0; k <= 8; k++) { const t = 1 - k / 4; co.push([t * 0.03, 0.03 - 0.01 * t * t + (k % 2 ? -0.006 : 0.004)]); }
  co.push([-0.026, 0.016], [-0.014, 0]);
  const crest = slab(d, co, 0.006, '#d86a2a', 0.0015, true); crest.position.set(0, 0.318, 0.212); crest.rotation.x = 0.22;
  for (let k = 0; k < 5; k++) { const t = (k - 2) / 2; strut(d, [t * 0.02, 0.322, 0.216], [t * 0.026, 0.344 - 0.006 * t * t, 0.222], 0.0012, 0.001, '#a8481e', 3); }
  for (const sx of [-1, 1]) eye(d, [sx * 0.018, 0.316, 0.215], 0.0055, sx, '#f0c040');
  hindLeg(d, [0.035, 0.235, -0.07], [0.04, 0.14, 0.0], [0.04, 0.06, -0.06], [0.04, 0.008, -0.01], 0.026, sk);
  hindLeg(d, [-0.035, 0.235, -0.07], [-0.04, 0.15, 0.02], [-0.04, 0.07, 0.0], [-0.04, 0.008, 0.06], 0.026, sk);
  for (const sx of [-1, 1]) foreLimb(d, [sx * 0.035, 0.225, 0.09], [sx * 0.045, 0.19, 0.11], [sx * 0.04, 0.18, 0.15], 0.009, sk, 3, 0.012, [0, -0.6, 1]);
  // Jurassic polar forest: Glossopteris-like conifers, tree ferns, ferns and a snowy ridge
  for (let i = 0; i < 7; i++) { const a = i * 0.55 + 3.5, r = 0.38 + H(i, 3) * 0.06, x = Math.cos(a) * r, z = Math.sin(a) * r; pineT(gp, x, gy(x, z), z, 1.6 + H(i, 2) * 0.6, i % 2 ? '#2e5230' : '#3a5e32'); }
  treeFern(gp, -0.3, gy(-0.3, 0.15), 0.15, 1.1, 1); treeFern(gp, 0.32, gy(0.32, -0.05), -0.05, 0.9, 2);
  fern(gp, 0.25, gy(0.25, 0.25), 0.25, 1, 3); fern(gp, -0.15, gy(-0.15, 0.33), 0.33, 0.9, 4); fern(gp, 0.05, gy(0.05, -0.28), -0.28, 1, 5);
  horsetail(gp, 0.18, gy(0.18, 0.36), 0.36, 1, 1); horsetail(gp, -0.36, gy(-0.36, 0.0), 0.0, 1.1, 2);
  for (let i = 0; i < 4; i++) { const x = -0.05 + i * 0.12, z = 0.36 - i * 0.03; stone(gp, x, gy(x, z), z, 0.014 + H(i, 5) * 0.01, '#7a7a74', i); }
  // tiny early mammal (Morganucodon-like) watching from the ferns
  const mx = 0.2, mz = 0.2, my = gy(mx, mz);
  sph(gp, '#6a5040', mx, my + 0.008, mz, 0.006, 0.006, 0.01, 6); sph(gp, '#6a5040', mx, my + 0.011, mz + 0.01, 0.004, 0.004, 0.005, 5);
};

/** Massospondylus (Golden Gate, South Africa): long-necked early sauropodomorph guarding the world's oldest known dinosaur nest. */
const massospondylus: Builder = gp => {
  const cliff = (x: number, z: number) => sst(-0.12, -0.3, z + 0.08 * Math.sin(x * 7) + 0.04 * f2(x * 8, 3));
  const hf: HF = (x, z) => 0.012 * f2(x * 6, z * 6) + 0.01 + 0.3 * cliff(x, z) * (0.85 + 0.15 * f2(x * 5, z * 5, 2, 4));
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0, band = Math.sin(h * 90 + f2(x * 6, z * 6) * 2);
    const rockC = B('#d89a5a').lerp(K('#f0d8a8'), sst(0.2, 0.8, band) * 0.8).lerp(K('#b0603a'), sst(0.7, 0.95, -band) * 0.5);
    if (ny < 0.8 && h > 0.03) return rockC;
    return grassy('#8a9a48', '#a8a85a', 9, 3)(x, y, z, ny).lerp(K('#c8a070'), sst(0.6, 0.75, f2(x * 6, z * 6, 2, 9)) * 0.6);
  }, { rings: 28, segs: 64, strata: ['#c88a52', '#e8c898', '#b8703e', '#d8a86a'] });
  const sk = skin({ top: '#6a6a3a', belly: '#e0d4a8', stripe: '#3a3a1e', sf: 80 });
  const d = new THREE.Group(); d.position.set(-0.04, gy(0, 0.08), 0.08); d.rotation.y = 1.25; gp.add(d);
  const spine: St2[] = [
    { p: [0, 0.16, -0.42], w: 0.004 }, { p: [0, 0.178, -0.32], w: 0.014, h: 0.018 }, { p: [0, 0.192, -0.2], w: 0.03, h: 0.036 },
    { p: [0, 0.2, -0.08], w: 0.048, h: 0.055 }, { p: [0, 0.195, 0.02], w: 0.05, h: 0.058 }, { p: [0, 0.2, 0.09], w: 0.036, h: 0.04 },
    { p: [0, 0.23, 0.14], w: 0.022, h: 0.024 }, { p: [0, 0.27, 0.18], w: 0.016, h: 0.018 }, { p: [0, 0.29, 0.22], w: 0.014, h: 0.016 },
    { p: [0, 0.285, 0.25], w: 0.016, h: 0.019 }, { p: [0, 0.275, 0.28], w: 0.01, h: 0.012 }, { p: [0, 0.27, 0.292], w: 0.004, h: 0.005 },
  ];
  hide(d, spine, sk, 12, 4, { belly: 0.8 });
  for (const sx of [-1, 1]) eye(d, [sx * 0.013, 0.293, 0.255], 0.0045, sx, '#e8b830');
  hindLeg(d, [0.035, 0.18, -0.07], [0.04, 0.11, -0.01], [0.04, 0.05, -0.06], [0.04, 0.006, -0.02], 0.024, sk, [0, 0, 1], '#3a3028', 4, 0.026);
  hindLeg(d, [-0.035, 0.18, -0.07], [-0.04, 0.11, -0.02], [-0.04, 0.05, -0.08], [-0.04, 0.006, -0.04], 0.024, sk, [0, 0, 1], '#3a3028', 4, 0.026);
  // grasping hands with the big thumb claw reaching toward the nest
  for (const sx of [-1, 1]) {
    foreLimb(d, [sx * 0.035, 0.18, 0.09], [sx * 0.04, 0.13, 0.11], [sx * 0.036, 0.09, 0.15], 0.01, sk, 3, 0.012, [0, -0.7, 0.8]);
    spike(d, '#2a2420', [sx * 0.042, 0.092, 0.152], [sx * 0.5, 0.1, 1], 0.026, 0.005);
  }
  // nest: scoop of earth, clutch of eggs and two hatchlings
  const nx = 0.12, nz = 0.24, ny = gy(nx, nz);
  lathe(gp, [[0.001, 0.0], [0.04, 0.0], [0.07, 0.008], [0.06, 0.016], [0.03, 0.006], [0.001, 0.004]], '#9a7a52', nx, ny - 0.003, nz, 12);
  for (let k = 0; k < 7; k++) { const a = k * 0.9, r = k ? 0.024 : 0; sph(gp, k % 3 ? '#f2ead8' : '#e8dcc0', nx + Math.cos(a) * r, ny + 0.012, nz + Math.sin(a) * r, 0.01, 0.012, 0.01, 6, a, 0.5); }
  const baby = (x: number, z: number, ry: number) => {
    const b = new THREE.Group(); b.position.set(x, gy(x, z), z); b.rotation.y = ry; gp.add(b);
    sph(b, '#8a8a4a', 0, 0.014, 0, 0.008, 0.009, 0.012, 6);
    sph(b, '#8a8a4a', 0, 0.025, 0.012, 0.009, 0.008, 0.01, 6);
    for (const sx of [-1, 1]) sph(b, '#111111', sx * 0.007, 0.028, 0.016, 0.0025, 0.0025, 0.0025, 4);
    limb(b, [[0, 0.012, -0.01], [0, 0.008, -0.025]], 0.005, 0.002, '#8a8a4a', 5, 1);
  };
  baby(nx + 0.07, nz + 0.02, -1.5); baby(nx - 0.03, nz + 0.07, 2.6);
  for (let k = 0; k < 4; k++) sph(gp, '#e8dcc0', nx + 0.075 + k * 0.006, ny + 0.004, nz - 0.02 + k * 0.004, 0.007, 0.003, 0.006, 5, k);
  // cycads and ferns of the Early Jurassic
  cycad(gp, -0.3, gy(-0.3, 0.12), 0.12, 1.2, 1); cycad(gp, 0.32, gy(0.32, 0.0), 0.0, 1, 2);
  fern(gp, -0.15, gy(-0.15, 0.34), 0.34, 1, 3); fern(gp, 0.3, gy(0.3, 0.22), 0.22, 0.9, 4); horsetail(gp, -0.38, gy(-0.38, -0.05), -0.05, 1, 1);
  for (let i = 0; i < 5; i++) { const x = -0.3 + i * 0.13, z = -0.12 + H(i, 1) * 0.04; stone(gp, x, gy(x, z), z, 0.018, '#c89a6a', i); }
};

/** Nigersaurus (Niger): the "Mesozoic cow" — a sauropod with a vacuum-cleaner muzzle of 500 teeth, mowing ferns by a Saharan river. */
const nigersaurus: Builder = gp => {
  const rz = (x: number) => -0.28 + 0.06 * Math.sin(x * 5);
  const hf: HF = (x, z) => 0.012 * f2(x * 6, z * 6) + 0.012 - 0.025 * sst(0.08, 0.02, Math.abs(z - rz(x)));
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  const WL = Y0 + 0.002;
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    if (y < WL + 0.004) return B('#c8b080');
    return grassy('#5a8a34', '#7a9a3e', 9, 2)(x, y, z, ny).lerp(K('#c8a870'), sst(0.62, 0.78, f2(x * 5, z * 5, 2, 5)) * 0.7);
  }, { rings: 24, segs: 60, wl: WL, water: '#3a7a90', strata: ['#c8a070', '#a8804e', '#d8b888', '#9a7044'] });
  water(gp, 0.5, WL, '#4a8aa0', { rings: 6, segs: 40 });
  const sk = skin({ top: '#7a6a5a', belly: '#d8ccb4', stripe: '#4a3e34', sf: 45, spot: '#9a7a5a', spf: 50 });
  const d = new THREE.Group(); d.position.set(-0.04, gy(0, 0.05), 0.06); d.rotation.y = 1.0; gp.add(d);
  const spine: St2[] = [
    { p: [0, 0.12, -0.44], w: 0.004 }, { p: [0, 0.16, -0.32], w: 0.016, h: 0.02 }, { p: [0, 0.19, -0.2], w: 0.036, h: 0.042 },
    { p: [0, 0.205, -0.09], w: 0.062, h: 0.068 }, { p: [0, 0.2, 0.01], w: 0.068, h: 0.075 }, { p: [0, 0.185, 0.1], w: 0.05, h: 0.056 },
    { p: [0, 0.16, 0.17], w: 0.028, h: 0.032 }, { p: [0, 0.115, 0.23], w: 0.022, h: 0.024 }, { p: [0, 0.07, 0.275], w: 0.019, h: 0.02 },
    { p: [0, 0.04, 0.305], w: 0.019, h: 0.017 }, { p: [0, 0.024, 0.33], w: 0.026, h: 0.011 }, { p: [0, 0.02, 0.343], w: 0.027, h: 0.008 },
  ];
  hide(d, spine, sk, 14, 4, { belly: 0.85 });
  for (const sx of [-1, 1]) eye(d, [sx * 0.016, 0.052, 0.3], 0.0045, sx, '#c89a30');
  // the famous straight row of teeth across the front of the muzzle
  for (let k = 0; k < 9; k++) spike(d, '#f4eedc', [(k - 4) * 0.0056, 0.016, 0.343], [0, -0.6, 0.6], 0.007, 0.0022);
  // pillar legs
  const pillar = (top: V3, bot: V3, r: number) => {
    hide(d, [{ p: top, w: r * 1.3, h: r * 1.5 }, { p: lerp3(top, bot, 0.45), w: r }, { p: lerp3(top, bot, 0.8), w: r * 0.8 }, { p: bot, w: r * 0.95 }], sk, 8, 2, { up: [1, 0, 0] });
    lathe(d, [[0.001, 0], [r * 1.15, 0], [r * 1.0, r * 0.7], [0.001, r * 0.8]], '#5a4a3e', bot[0], 0, bot[2], 8);
  };
  pillar([0.05, 0.19, -0.1], [0.055, 0.0, -0.06], 0.027); pillar([-0.05, 0.19, -0.1], [-0.055, 0.0, -0.14], 0.027);
  pillar([0.045, 0.17, 0.09], [0.05, 0.0, 0.12], 0.023); pillar([-0.045, 0.17, 0.09], [-0.05, 0.0, 0.07], 0.023);
  // ferns being mowed + horsetails by the river
  const fx = Math.sin(1.0) * 0.36 - 0.04, fz = Math.cos(1.0) * 0.36 + 0.06;
  fern(gp, fx + 0.04, gy(fx + 0.04, fz), fz, 0.7, 1); fern(gp, fx - 0.02, gy(fx - 0.02, fz + 0.06), fz + 0.06, 0.8, 2);
  for (let i = 0; i < 10; i++) { const a = i * 0.62 + 2.2, r = 0.3 + H(i, 1) * 0.15, x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(z - rz(x)) < 0.07) continue; if (i % 2) fern(gp, x, gy(x, z), z, 0.8 + H(i, 2) * 0.4, i); else horsetail(gp, x, gy(x, z), z, 1.2, i); }
  for (let i = 0; i < 8; i++) { const x = -0.35 + i * 0.09, z = rz(x) + (i % 2 ? 0.07 : -0.07); if (Math.hypot(x, z) < 0.44) horsetail(gp, x, gy(x, z), z, 0.9, i + 3); }
  treeFern(gp, 0.25, gy(0.25, -0.12), -0.12, 1.2, 3); treeFern(gp, -0.3, gy(-0.3, 0.2), 0.2, 1, 4);
  // a crocodile cousin (Sarcosuchus) lurking in the river
  const cx = -0.12, cz = rz(-0.12), sc = new THREE.Group(); sc.position.set(cx, WL - 0.004, cz); sc.rotation.y = 1.4; gp.add(sc);
  hide(sc, [{ p: [0, 0.004, -0.09], w: 0.003 }, { p: [0, 0.006, -0.03], w: 0.012, h: 0.006 }, { p: [0, 0.007, 0.02], w: 0.016, h: 0.007 }, { p: [0, 0.006, 0.06], w: 0.007, h: 0.004 }, { p: [0, 0.005, 0.09], w: 0.004, h: 0.003 }], skin({ top: '#4a5232', belly: '#8a8a5a' }), 8, 2);
  for (const sx of [-1, 1]) sph(sc, '#c8b030', sx * 0.006, 0.012, 0.045, 0.0025, 0.0025, 0.0025, 4);
};

/** Therizinosaurus (Gobi, Mongolia): pot-bellied, feathered plant-eater with the longest claws of any animal, hooking down a branch. */
const therizinosaurus: Builder = gp => {
  const hf: HF = (x, z) => 0.014 * f2(x * 6, z * 6, 2, 3) + 0.012;
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => grassy('#7a8a42', '#9a9a52', 8, 7)(x, y, z, ny).lerp(K('#c0a070'), sst(0.6, 0.75, f2(x * 5, z * 5, 2, 2)) * 0.6), { rings: 22, segs: 56, strata: ['#c89a62', '#a87a4a', '#d8b07a', '#8a6038'] });
  const fe: HP = (x, y, z, _nx, ny) => B('#6a4a30').lerp(K('#c8a070'), sst(0.0, -0.7, ny)).lerp(K('#3a2818'), sst(0.55, 0.75, f2(x * 70 + y * 50, z * 70 - y * 40, 2, 5)) * 0.6).lerp(K('#e8d8b0'), sst(0.7, 0.85, f2(x * 90 - y * 30, z * 90 + y * 60, 2, 9)) * 0.4);
  const d = new THREE.Group(); d.position.set(-0.06, gy(0, 0), -0.02); d.rotation.y = 0.7; gp.add(d);
  const spine: St2[] = [
    { p: [0, 0.16, -0.3], w: 0.006 }, { p: [0, 0.185, -0.22], w: 0.022, h: 0.024 }, { p: [0, 0.22, -0.12], w: 0.048, h: 0.05 },
    { p: [0, 0.26, -0.03], w: 0.072, h: 0.072 }, { p: [0, 0.31, 0.03], w: 0.066, h: 0.07 }, { p: [0, 0.37, 0.06], w: 0.042, h: 0.045 },
    { p: [0, 0.42, 0.075], w: 0.024, h: 0.026 }, { p: [0, 0.47, 0.095], w: 0.018, h: 0.02 }, { p: [0, 0.5, 0.125], w: 0.016, h: 0.018 },
    { p: [0, 0.505, 0.15], w: 0.016, h: 0.017 }, { p: [0, 0.495, 0.175], w: 0.009, h: 0.009 }, { p: [0, 0.488, 0.188], w: 0.003, h: 0.003 },
  ];
  hide(d, spine, fe, 14, 4);
  spike(d, '#d8c8a0', [0, 0.494, 0.17], [0, -0.3, 1], 0.024, 0.006);
  for (const sx of [-1, 1]) eye(d, [sx * 0.013, 0.508, 0.155], 0.004, sx, '#e0a020');
  // feathery fluff along the back of the neck and a tail fan
  for (let i = 0; i < 10; i++) { const t = i / 9, pt = lerp3([0, 0.36, 0.04], [0, 0.5, 0.11], t); spike(d, i % 2 ? '#4a3220' : '#7a5636', [pt[0], pt[1], pt[2] - 0.01], [0, 0.3, -1], 0.02, 0.006); }
  for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.25; spike(d, k % 2 ? '#5a3e26' : '#8a6a44', [0, 0.165, -0.29], [Math.sin(a), 0.15, -Math.cos(a)], 0.06, 0.012); }
  // shaggy coat of filament feathers over the body and tail (therizinosaurs were feathered, e.g. Beipiaosaurus)
  for (let i = 0; i < 14; i++) {
    const f = 0.6 + i * 0.3, j = Math.min(spine.length - 2, Math.floor(f)), t = f - j, A = spine[j], Bs = spine[j + 1];
    const C = lerp3(A.p, Bs.p, t), w = A.w + (Bs.w - A.w) * t, h = (A.h ?? A.w) + ((Bs.h ?? Bs.w) - (A.h ?? A.w)) * t;
    const T = new THREE.Vector3(Bs.p[0] - A.p[0], Bs.p[1] - A.p[1], Bs.p[2] - A.p[2]).normalize(), N = new THREE.Vector3().crossVectors(T, new THREE.Vector3(1, 0, 0));
    for (let k = 0; k < 9; k++) {
      const a = -0.35 + (k + (i % 2) * 0.5) * 0.48, ca = Math.cos(a), sa = Math.sin(a);
      const out = new THREE.Vector3(ca, 0, 0).addScaledVector(N, sa), at: V3 = [C[0] + ca * w * 0.92, C[1] + N.y * sa * h * 0.92, C[2] + N.z * sa * h * 0.92];
      const dir = out.clone().multiplyScalar(0.55).addScaledVector(T, -0.85).add(new THREE.Vector3(0, -0.25, 0)).normalize();
      spike(d, (i + k) % 3 ? '#5e4028' : '#8a6a44', at, [dir.x, dir.y, dir.z], 0.022 + 0.008 * Math.sin(i * 1.7 + k), 0.007);
    }
  }
  // stout legs with four-toed feet
  hindLeg(d, [0.05, 0.22, -0.06], [0.06, 0.13, 0.0], [0.06, 0.05, -0.05], [0.06, 0.008, 0.0], 0.032, fe, [0.2, 0, 1], '#2a2018', 4, 0.03);
  hindLeg(d, [-0.05, 0.22, -0.06], [-0.06, 0.13, 0.0], [-0.06, 0.05, -0.05], [-0.06, 0.008, 0.0], 0.032, fe, [-0.2, 0, 1], '#2a2018', 4, 0.03);
  // long arms with feather fringes and three giant scythe claws, reaching up
  for (const sx of [-1, 1]) {
    const sh: V3 = [sx * 0.05, 0.36, 0.05], el: V3 = [sx * 0.08, 0.33, 0.13], wr: V3 = [sx * 0.07, 0.4, 0.2];
    hide(d, [{ p: sh, w: 0.022 }, { p: el, w: 0.015 }, { p: wr, w: 0.011 }], fe, 7, 3, { up: [1, 0, 0] });
    for (let k = 0; k < 5; k++) { const pt = lerp3(el, wr, k / 5); spike(d, k % 2 ? '#4a3220' : '#6a4a30', pt, [sx * 0.3, -1, -0.3], 0.035, 0.008); }
    for (let k = 0; k < 3; k++) {
      const b: V3 = [wr[0] + sx * (k - 1) * 0.008, wr[1] + 0.006, wr[2] + 0.004], m: V3 = [b[0] + sx * (k - 1) * 0.01, b[1] + 0.04, b[2] + 0.05], tip: V3 = [m[0], m[1] + 0.006, m[2] + 0.045];
      limb(d, [b, m, tip], 0.0045, 0.001, '#2a2420', 5, 3);
    }
  }
  // the tree it is browsing (Nemegt riverside conifer/broadleaf) with a branch hooked by the claws
  const tx = 0.28, tz = 0.18, ty = gy(tx, tz);
  strut(gp, [tx, ty - 0.005, tz], [tx - 0.01, ty + 0.38, tz], 0.022, 0.012, '#5a4232', 7);
  for (let k = 0; k < 6; k++) blob(gp, k % 2 ? '#3e6a2e' : '#4e7a34', tx - 0.01 + Math.cos(k * 1.1) * 0.05, ty + 0.38 + (k % 3) * 0.03, tz + Math.sin(k * 1.1) * 0.05, 0.06, 0.04, 0.06, k, 1);
  const br: V3[] = [[tx - 0.005, ty + 0.3, tz], [0.14, ty + 0.36, 0.13], [0.06, ty + 0.42, 0.12]];
  limb(gp, br, 0.007, 0.003, '#5a4232', 5, 3);
  for (let k = 0; k < 5; k++) { const pt = lerp3(br[1], br[2], k / 4); blob(gp, '#5a8a38', pt[0], pt[1] + 0.012, pt[2], 0.022, 0.016, 0.022, k, 0); }
  // more Nemegt flora
  for (let i = 0; i < 6; i++) { const a = i * 0.8 + 3.2, r = 0.38 + H(i, 1) * 0.06, x = Math.cos(a) * r, z = Math.sin(a) * r; if (i % 2) pineT(gp, x, gy(x, z), z, 1.4 + H(i, 3) * 0.5, '#3a5a30'); else fern(gp, x, gy(x, z), z, 1.0, i); }
  for (let i = 0; i < 4; i++) { const x = -0.2 + i * 0.1, z = 0.32 + H(i, 2) * 0.05; stone(gp, x, gy(x, z), z, 0.015, '#a08a6a', i); }
};

/** Quetzalcoatlus (Big Bend, Texas): giraffe-tall azhdarchid pterosaur stalking on all fours, wings folded, across a Cretaceous floodplain. */
const quetzalcoatlus: Builder = gp => {
  const mesa = (x: number, z: number) => sst(0.06, 0.0, Math.hypot((x + 0.22) * 0.8, z + 0.3) - 0.14 - 0.03 * f2(x * 9, z * 9));
  const pond = (x: number, z: number) => Math.hypot((x - 0.2) * 0.8, z - 0.2) - 0.1 - 0.02 * f2(x * 10, z * 10);
  const hf: HF = (x, z) => 0.012 * f2(x * 6, z * 6) + 0.014 + 0.2 * mesa(x, z) - 0.025 * sst(0.0, -0.03, pond(x, z));
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  const WL = Y0 + 0.004;
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0;
    if (y < WL + 0.004) return B('#8a7a5a');
    if (h > 0.04 && ny < 0.85) return B('#c87a4a').lerp(K('#e8b888'), sst(0.3, 0.8, Math.sin(h * 120)) * 0.6);
    return grassy('#9a9a52', '#b8a868', 8, 5)(x, y, z, ny).lerp(K('#d0b088'), sst(0.6, 0.75, f2(x * 6, z * 6, 2, 4)) * 0.6);
  }, { rings: 26, segs: 60, wl: WL, water: '#4a7a8a', strata: ['#c8885a', '#a86a42', '#d8a070', '#8a5a36'] });
  water(gp, 0.5, WL, '#5a8a9a', { rings: 6, segs: 40 });
  const sk: HP = (x, y, z, _nx, ny) => B('#e8e4dc').lerp(K('#b8b4ac'), sst(0.2, 0.9, ny) * 0.5).lerp(K('#8a8680'), sst(0.6, 0.75, f2(x * 60 + y * 40, z * 60, 2, 1)) * 0.25);
  const wingC: HP = (_x, _y, _z, _nx, ny) => B('#5a5a62').lerp(K('#8a7a6a'), sst(0.0, -0.8, ny) * 0.6);
  const d = new THREE.Group(); d.position.set(0.0, gy(0, -0.02), -0.03); d.rotation.y = -0.35; gp.add(d);
  // small body sloping up to the shoulders (forelimbs far longer than hind legs) + long stiff neck + giant head
  hide(d, [{ p: [0, 0.183, -0.11], w: 0.004 }, { p: [0, 0.19, -0.088], w: 0.02, h: 0.022 }, { p: [0, 0.21, -0.035], w: 0.032, h: 0.035 }, { p: [0, 0.238, 0.025], w: 0.034, h: 0.037 }, { p: [0, 0.26, 0.068], w: 0.025, h: 0.027 }, { p: [0, 0.272, 0.088], w: 0.016 }], sk, 12, 4);
  hide(d, [{ p: [0, 0.262, 0.075], w: 0.022 }, { p: [0, 0.335, 0.135], w: 0.015 }, { p: [0, 0.415, 0.196], w: 0.0125 }, { p: [0, 0.478, 0.243], w: 0.013 }], sk, 8, 3);
  // skull nearly as long as the neck, ending in a stiff, toothless, pointed beak angled down
  hide(d, [{ p: [0, 0.492, 0.232], w: 0.012, h: 0.016 }, { p: [0, 0.5, 0.258], w: 0.016, h: 0.023 }, { p: [0, 0.484, 0.305], w: 0.012, h: 0.018 }, { p: [0, 0.455, 0.355], w: 0.008, h: 0.012 }, { p: [0, 0.425, 0.4], w: 0.0045, h: 0.007 }, { p: [0, 0.404, 0.432], w: 0.001, h: 0.0012 }],
    (x, y, z, nx, ny, nz, u) => (u > 0.32 ? B('#d8c8a0').lerp(K('#3a3028'), sst(0.86, 1, u)) : sk(x, y, z, nx, ny, nz, u)), 10, 4);
  for (let i = 0; i < 2; i++) { const z = 0.3 + i * 0.05, y = 0.474 - i * 0.034; hide(d, [{ p: [0, y - 0.012, z - 0.02], w: 0.0012 }, { p: [0, y - 0.018 + 0.003 * i, z + 0.03], w: 0.0012 }], () => K('#4a3c30'), 4, 1); }
  // sagittal crest along the skull roof (slab in the YZ plane)
  const cr = slab(d, [[-0.045, 0], [0.03, -0.004], [0.042, 0.026], [0.02, 0.046], [-0.012, 0.03]], 0.0025, '#c83a2a', 0, true);
  cr.position.set(0, 0.5, 0.262); cr.rotation.y = Math.PI / 2;
  for (const sx of [-1, 1]) eye(d, [sx * 0.0135, 0.505, 0.252], 0.0042, sx, '#d8a020');
  // forelimbs as walking legs: near-vertical long hand (metacarpal), knuckle of the folded wing finger on the ground
  for (const sx of [-1, 1]) {
    const sh: V3 = [sx * 0.03, 0.252, 0.068], el: V3 = [sx * 0.056, 0.205, 0.025], wr: V3 = [sx * 0.058, 0.13, 0.082], kn: V3 = [sx * 0.062, 0.016, 0.092];
    const f1: V3 = [sx * 0.07, 0.15, 0.06], fq: V3 = [sx * 0.068, 0.225, -0.03], tip: V3 = [sx * 0.058, 0.25, -0.13];
    hide(d, [{ p: sh, w: 0.015 }, { p: lerp3(sh, el, 0.5), w: 0.013 }, { p: el, w: 0.01 }, { p: lerp3(el, wr, 0.5), w: 0.0085 }, { p: wr, w: 0.0075 }, { p: lerp3(wr, kn, 0.5), w: 0.006 }, { p: kn, w: 0.0065 }], sk, 7, 3, { up: [1, 0, 0] });
    // folded wing finger running from the knuckle up and back past the hips
    hide(d, [{ p: kn, w: 0.0055 }, { p: f1, w: 0.005 }, { p: fq, w: 0.0038 }, { p: tip, w: 0.0015 }], wingC, 6, 3, { up: [1, 0, 0] });
    // tucked membrane between flank, arm and folded finger
    const fan: V3[] = [[sx * 0.03, 0.2, -0.07], [sx * 0.035, 0.24, 0.05], el, lerp3(el, wr, 0.6), lerp3(kn, f1, 0.5), f1, fq, tip], mp: number[] = [];
    for (let k = 1; k < fan.length - 1; k++) for (const q of [fan[0], fan[k], fan[k + 1], fan[0], fan[k + 1], fan[k]]) mp.push(q[0] + sx * 0.003, q[1], q[2]);
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mg.computeVertexNormals();
    add(d, mg, mat('#5e5054', { rough: 0.8 }), 0, 0, 0, 1, 1, 1);
    // three small clawed fingers splayed forward-outward on the ground
    for (let k = 0; k < 3; k++) { const a = sx * (0.5 + k * 0.35), q: V3 = [kn[0] + Math.sin(a) * 0.006, 0.006, kn[2] + Math.cos(a) * 0.006 + 0.004]; spike(d, '#2a2420', q, [Math.sin(a), -0.15, Math.cos(a)], 0.011, 0.0022); }
  }
  // short hind legs, plantigrade feet
  for (const sx of [-1, 1]) hindLeg(d, [sx * 0.024, 0.188, -0.075], [sx * 0.034, 0.122, -0.035], [sx * 0.034, 0.038, -0.088], [sx * 0.034, 0.006, -0.058], 0.0135, sk, [0, 0, 1], '#2a2420', 3, 0.018);
  // a tiny juvenile Alamosaurus... no — a small lizard dinner! and palms, cycads
  const lx = 0.28, lz = 0.0, ly = gy(lx, lz), lz2 = new THREE.Group(); lz2.position.set(lx, ly, lz); lz2.rotation.y = -0.6; gp.add(lz2);
  hide(lz2, [{ p: [0, 0.004, -0.04], w: 0.002 }, { p: [0, 0.006, -0.01], w: 0.006, h: 0.005 }, { p: [0, 0.007, 0.01], w: 0.007, h: 0.005 }, { p: [0, 0.007, 0.025], w: 0.004, h: 0.004 }], skin({ top: '#5a7a3a', belly: '#c8c890' }), 6, 2);
  const palm = (x: number, z: number, s: number) => {
    const y = gy(x, z) - 0.003, t: V3 = [x + 0.012 * s, y + 0.12 * s, z];
    limb(gp, [[x, y, z], [x + 0.008 * s, y + 0.06 * s, z], t], 0.006 * s, 0.004 * s, '#7a6048', 5, 2);
    for (let k = 0; k < 7; k++) aim(gp, FROND(), '', t, [Math.cos(k * 0.9), -0.1, Math.sin(k * 0.9)], 0.07 * s, 0.05 * s, [0, 1, 0], true);
  };
  palm(0.32, 0.25, 1); palm(0.1, 0.36, 0.9); palm(-0.35, 0.15, 1.1);
  cycad(gp, 0.33, gy(0.33, -0.15), -0.15, 1, 1); fern(gp, -0.2, gy(-0.2, 0.32), 0.32, 1, 2); fern(gp, 0.18, gy(0.18, 0.06), 0.06, 0.8, 3);
  for (let i = 0; i < 5; i++) { const x = 0.05 + i * 0.07, z = 0.32 - i * 0.05; if (pond(x, z) > 0.02) stone(gp, x, gy(x, z), z, 0.012, '#b0987a', i); }
};

/** Mosasaurus (Maastricht, Netherlands): the giant sea lizard bursting from the chalk sea after an ammonite. */
const mosasaurus: Builder = gp => {
  const WL = Y0 + 0.07;
  const cliff = (x: number, z: number) => sst(-0.14, -0.26, z - x * 0.4 + 0.04 * f2(x * 8, 1));
  const hf: HF = (x, z) => 0.012 * f2(x * 7, z * 7) + 0.012 + 0.3 * cliff(x, z) * (0.85 + 0.15 * f2(x * 6, z * 6, 2, 2));
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  terrain(gp, 0.5, hf, (x, y, z, ny) => {
    const h = y - Y0;
    if (h < 0.06) return B('#c8c0a0').lerp(K('#8a9a6a'), sst(0.55, 0.7, f2(x * 9, z * 9, 2, 3)) * 0.6);
    if (ny > 0.85 && h > 0.25) return grassy('#6a8a3a', '#8a9a48', 9)(x, y, z, ny);
    return B('#f2eee2').lerp(K('#d8d0c0'), sst(0.4, 0.9, Math.sin(h * 140)) * 0.5).lerp(K('#4a4440'), sst(0.92, 1, Math.sin(h * 70 + 1)) * 0.6);
  }, { rings: 26, segs: 60, strata: ['#e8e2d2', '#d0c8b4', '#f0ece0', '#bab29c'] });
  // translucent sea: column + surface
  const keep = (x: number, z: number) => cliff(x, z) < 0.5;
  const sea: number[] = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 48; j++) {
    const r0 = 0.49 * i / 12, r1 = 0.49 * (i + 1) / 12, a0 = j / 48 * TAU, a1 = (j + 1) / 48 * TAU;
    const P = (r: number, a: number) => [Math.cos(a) * r, WL, Math.sin(a) * r];
    const q = [P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1)];
    if (!keep((q[0][0] + q[2][0]) / 2, (q[0][2] + q[2][2]) / 2)) continue;
    for (const k of [0, 2, 1, 0, 3, 2]) sea.push(...q[k]);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sea, 3)); sg.computeVertexNormals();
  add(gp, sg, mat('#3a8ab0', { transparent: 0.55, rough: 0.15, flat: true }), 0, 0, 0, 1, 1, 1);
  // sea rim (glass-like side wall where there's no cliff)
  const wall: number[] = [];
  for (let j = 0; j < 48; j++) {
    const a0 = j / 48 * TAU, a1 = (j + 1) / 48 * TAU, r = 0.495;
    if (!keep(Math.cos((a0 + a1) / 2) * r, Math.sin((a0 + a1) / 2) * r)) continue;
    const A = [Math.cos(a0) * r, Math.sin(a0) * r], Bq = [Math.cos(a1) * r, Math.sin(a1) * r];
    wall.push(A[0], Y0, A[1], Bq[0], WL, Bq[1], Bq[0], Y0, Bq[1], A[0], Y0, A[1], A[0], WL, A[1], Bq[0], WL, Bq[1]);
  }
  const wgm = new THREE.BufferGeometry(); wgm.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3)); wgm.computeVertexNormals();
  add(gp, wgm, mat('#2a6a90', { transparent: 0.45, rough: 0.2 }), 0, 0, 0, 1, 1, 1);
  // the mosasaur: arching up out of the water, jaws open
  const sk = skin({ top: '#2e3a4a', belly: '#e8e4d8', spot: '#24303e', spf: 55 });
  const d = new THREE.Group(); d.position.set(0.04, 0, 0.06); d.rotation.y = 1.1; gp.add(d);
  hide(d, [
    { p: [0, WL - 0.055, -0.405], w: 0.004, h: 0.007 }, { p: [0, WL - 0.03, -0.375], w: 0.008, h: 0.013 }, { p: [0, WL - 0.012, -0.34], w: 0.012, h: 0.02 }, { p: [0, WL - 0.004, -0.28], w: 0.017, h: 0.027 }, { p: [0, WL + 0.0, -0.18], w: 0.034, h: 0.042 },
    { p: [0, WL + 0.05, -0.07], w: 0.05, h: 0.056 }, { p: [0, WL + 0.11, 0.02], w: 0.052, h: 0.058 }, { p: [0, WL + 0.17, 0.1], w: 0.04, h: 0.044 },
    { p: [0, WL + 0.22, 0.17], w: 0.032, h: 0.034 }, { p: [0, WL + 0.25, 0.24], w: 0.028, h: 0.028 }, { p: [0, WL + 0.26, 0.3], w: 0.018, h: 0.016 },
    { p: [0, WL + 0.26, 0.335], w: 0.009, h: 0.008 },
  ], sk, 14, 4, { belly: 0.85 });
  const hd = new THREE.Group(); hd.position.y = 0.08; d.add(hd);
  hide(hd, [{ p: [0, WL + 0.14, 0.2], w: 0.026, h: 0.014 }, { p: [0, WL + 0.1, 0.26], w: 0.018, h: 0.01 }, { p: [0, WL + 0.08, 0.31], w: 0.008, h: 0.005 }], skin({ top: '#2e3a4a', belly: '#e0dcd0' }), 10, 3);
  sph(hd, '#9a3a3a', 0, WL + 0.145, 0.25, 0.016, 0.014, 0.04, 6, 0, 0.5);
  teeth(hd, [0.018, WL + 0.162, 0.23], [0.009, WL + 0.172, 0.325], 7, 0.014, [0, -1, 0.1]);
  teeth(hd, [-0.018, WL + 0.162, 0.23], [-0.009, WL + 0.172, 0.325], 7, 0.014, [0, -1, 0.1]);
  teeth(hd, [0.016, WL + 0.14, 0.22], [0.007, WL + 0.088, 0.3], 6, 0.012, [0, 1, 0.3]);
  teeth(hd, [-0.016, WL + 0.14, 0.22], [-0.007, WL + 0.088, 0.3], 6, 0.012, [0, 1, 0.3]);
  for (const sx of [-1, 1]) eye(hd, [sx * 0.024, WL + 0.183, 0.215], 0.006, sx, '#e0c040');
  // paddles and the shark-like tail fluke (big lower lobe)
  const PAD = leafGeo('n2-paddle', 5, t => 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.1, 0, 0);
  for (const sx of [-1, 1]) {
    aim(d, PAD, '#2a3442', [sx * 0.045, WL + 0.12, 0.05], [sx, -0.6, 0.3], 0.07, 0.04, [0, 1, 0]);
    aim(d, PAD, '#2a3442', [sx * 0.035, WL + 0.02, -0.12], [sx, -0.5, -0.2], 0.05, 0.03, [0, 1, 0]);
  }
  // crescent fluke at the downturned tail tip: lower lobe carried by the vertebrae, upper lobe of soft tissue (Lindgren et al. 2013)
  const fl = slab(d, [[0, 0.01], [0.025, 0.03], [0.065, 0.062], [0.042, 0.016], [0.04, -0.01], [0.06, -0.06], [0.03, -0.038], [0, -0.01]], 0.005, '#2a3442', 0.001, true);
  fl.rotation.y = Math.PI / 2; fl.position.set(0, WL - 0.022, -0.36);
  // splash ring and spray where it breaches
  for (let k = 0; k < 12; k++) { const a = k * 0.52, r = 0.05 + H(k, 1) * 0.02; blob(d, '#f4fbff', Math.cos(a) * r, WL + 0.008 + H(k, 2) * 0.01, -0.12 + Math.sin(a) * r * 1.6, 0.014, 0.01 + H(k, 3) * 0.012, 0.014, k, 0).material = mat('#f0f8ff', { transparent: 0.85 }); }
  for (let k = 0; k < 8; k++) blob(d, '#f4fbff', (H(k, 4) - 0.5) * 0.06, WL + 0.02 + H(k, 5) * 0.06, 0.0 + (H(k, 6) - 0.5) * 0.1, 0.007, 0.007, 0.007, k, 0).material = mat('#f0f8ff', { transparent: 0.8 });
  // ammonite fleeing in front of the jaws (coiled, ribbed shell + tentacles)
  const am = new THREE.Group(); am.position.set(0.25, WL + 0.06, 0.3); am.rotation.y = -0.3; gp.add(am);
  const coil: St2[] = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * TAU * 1.6, r = 0.004 + t * 0.03; coil.push({ p: [0, Math.sin(a) * r, Math.cos(a) * r], w: 0.006 + t * 0.012, h: 0.003 + t * 0.012 }); }
  hide(am, coil, (x, y, z) => B('#e8d0a0').lerp(K('#9a6a3a'), sst(0.2, 0.8, Math.sin(Math.atan2(y, z) * 14)) * 0.6), 8, 2, { up: [1, 0, 0] });
  for (let k = 0; k < 6; k++) limb(am, [[0, -0.006, -0.035], [(k - 2.5) * 0.004, -0.012, -0.05], [(k - 2.5) * 0.007, -0.02, -0.06]], 0.0018, 0.0008, '#c88a6a', 4, 2);
  // fish school and a sea-floor with ammonite shells
  for (let k = 0; k < 9; k++) { const f = new THREE.Group(); f.position.set(-0.24 + (k % 3) * 0.03, WL - 0.03 - Math.floor(k / 3) * 0.012, 0.25 + Math.floor(k / 3) * 0.02 + (k % 2) * 0.01); f.rotation.y = 0.9; gp.add(f); sph(f, '#b8c8d8', 0, 0, 0, 0.003, 0.004, 0.009, 5); add(f, CONE(3), mat('#9aaab8'), 0, 0, -0.011, 0.005, 0.006, 0.001, 0, Math.PI / 2); }
  for (let k = 0; k < 4; k++) { const x = -0.1 + k * 0.08, z = 0.38 - k * 0.04; lathe(gp, [[0.001, 0], [0.012, 0.0], [0.013, 0.004], [0.008, 0.008], [0.001, 0.008]], '#d8b88a', x, gy(x, z) - 0.002, z, 8); }
};

/** Pachycephalosaurus (Hell Creek, Montana): the bone-headed dinosaur with a 25-cm thick, knobby skull dome — parent and youngster. */
const pachycephalosaurus: Builder = gp => {
  const rz = (x: number) => -0.3 + 0.05 * Math.sin(x * 6);
  const hf: HF = (x, z) => 0.012 * f2(x * 6, z * 6) + 0.012 - 0.024 * sst(0.07, 0.02, Math.abs(z - rz(x)));
  const gy = (x: number, z: number) => Y0 + hf(x, z);
  const WL = Y0 + 0.0;
  terrain(gp, 0.5, hf, (x, y, z, ny) => (y < WL + 0.006 ? B('#9a8a6a') : grassy('#5a7a32', '#7a8a3a', 9, 6)(x, y, z, ny).lerp(K('#8a7a52'), sst(0.62, 0.76, f2(x * 6, z * 6, 2, 3)) * 0.6)), { rings: 24, segs: 60, wl: WL, water: '#3a6a7a', strata: ['#7a6a52', '#5a4a3a', '#8a7a62', '#4a3c2e'] });
  water(gp, 0.5, WL, '#4a7a8a', { rings: 6, segs: 40 });
  const pachy = (x: number, z: number, ry: number, sc: number, top: string) => {
    const sk = skin({ top, belly: '#e0d4b0', stripe: '#3a2e22', sf: 70 });
    const d = new THREE.Group(); d.position.set(x, gy(x, z), z); d.rotation.y = ry; d.scale.setScalar(sc); gp.add(d);
    hide(d, [
      { p: [0, 0.14, -0.36], w: 0.004 }, { p: [0, 0.18, -0.25], w: 0.018, h: 0.022 }, { p: [0, 0.215, -0.13], w: 0.038, h: 0.045 },
      { p: [0, 0.23, -0.03], w: 0.058, h: 0.064 }, { p: [0, 0.22, 0.06], w: 0.056, h: 0.064 }, { p: [0, 0.225, 0.13], w: 0.036, h: 0.04 },
      { p: [0, 0.25, 0.18], w: 0.026, h: 0.028 }, { p: [0, 0.262, 0.215], w: 0.026, h: 0.028 }, { p: [0, 0.252, 0.25], w: 0.016, h: 0.018 },
      { p: [0, 0.244, 0.268], w: 0.008, h: 0.009 },
    ], sk, 14, 4, { belly: 0.85 });
    // the dome and its crown of knobs
    sph(d, '#8a7656', 0, 0.272, 0.212, 0.031, 0.03, 0.035, 10);
    sph(d, '#a8946c', 0, 0.284, 0.21, 0.026, 0.022, 0.03, 10);
    for (let k = 0; k < 12; k++) { const a = (k / 11 - 0.5) * Math.PI * 1.4 + Math.PI, r = 0.03; spike(d, '#6a5a40', [Math.sin(a) * r, 0.262, 0.21 + Math.cos(a) * r * 1.1], [Math.sin(a), 0.2, Math.cos(a)], 0.01, 0.004); }
    for (let k = 0; k < 4; k++) spike(d, '#8a7a5a', [(k - 1.5) * 0.008, 0.262, 0.248 - Math.abs(k - 1.5) * 0.004], [0, 1, 0.5], 0.008, 0.003);
    spike(d, '#3a3028', [0, 0.244, 0.262], [0, -0.3, 1], 0.012, 0.007);
    for (const sx of [-1, 1]) eye(d, [sx * 0.022, 0.268, 0.228], 0.0055, sx, '#d8a020');
    hindLeg(d, [0.04, 0.215, -0.04], [0.045, 0.13, 0.03], [0.045, 0.05, -0.03], [0.045, 0.007, 0.02], 0.028, sk, [0, 0, 1], '#2a2420', 3, 0.026);
    hindLeg(d, [-0.04, 0.215, -0.04], [-0.045, 0.135, 0.0], [-0.045, 0.06, -0.07], [-0.045, 0.01, -0.04], 0.028, sk, [0, -0.2, 1], '#2a2420', 3, 0.026);
    for (const sx of [-1, 1]) foreLimb(d, [sx * 0.04, 0.2, 0.12], [sx * 0.045, 0.17, 0.13], [sx * 0.04, 0.165, 0.155], 0.009, sk, 3, 0.008, [0, -0.5, 1]);
  };
  pachy(-0.06, 0.02, 1.05, 1, '#6a5a3e');
  pachy(0.26, 0.2, -2.0, 0.55, '#7a6a4a');
  // Hell Creek flora: dawn redwoods (Metasequoia), ferns, a magnolia-like shrub in flower
  const redwood = (x: number, z: number, s: number) => {
    const y = gy(x, z);
    strut(gp, [x, y - 0.005, z], [x, y + 0.3 * s, z], 0.013 * s, 0.004 * s, '#7a4a32', 6);
    for (let k = 0; k < 4; k++) cone(gp, k % 2 ? '#5a7a32' : '#4a6a2e', x, y + (0.08 + k * 0.055) * s, z, (0.07 - k * 0.014) * s, 0.09 * s, 7, k);
  };
  redwood(-0.34, -0.12, 1.1); redwood(-0.22, -0.36, 0.9); redwood(0.36, -0.12, 1.0);
  const mx = -0.3, mz = 0.22, my = gy(mx, mz);
  for (let k = 0; k < 5; k++) blob(gp, '#3e6a2e', mx + Math.cos(k * 1.3) * 0.03, my + 0.03 + (k % 2) * 0.02, mz + Math.sin(k * 1.3) * 0.03, 0.035, 0.03, 0.035, k, 0);
  for (let k = 0; k < 7; k++) sph(gp, '#f4ece4', mx + Math.cos(k * 0.9) * 0.045, my + 0.05 + (k % 3) * 0.012, mz + Math.sin(k * 0.9) * 0.045, 0.008, 0.006, 0.008, 6);
  fern(gp, 0.15, gy(0.15, 0.36), 0.36, 1, 1); fern(gp, -0.1, gy(-0.1, 0.36), 0.36, 0.9, 2); fern(gp, 0.36, gy(0.36, 0.05), 0.05, 0.9, 3);
  horsetail(gp, 0.1, gy(0.1, -0.22), -0.22, 1, 1); horsetail(gp, -0.05, gy(-0.05, -0.25), -0.25, 1, 2);
  for (let i = 0; i < 4; i++) { const x = 0.05 + i * 0.07, z = -0.2 - H(i, 1) * 0.03; stone(gp, x, gy(x, z), z, 0.013, '#8a8274', i); }
};

// ================================================ EXPORT ==================================================
export const H_NATURE2: Record<string, Builder> = {
  pl_sakura: sakura, pl_lotus: lotus, pl_cacao: cacao, pl_coffee: coffee, pl_tea: tea, pl_kelp: kelp, pl_quiver: quiver, pl_banyan: banyan, pl_cedar: cedar, pl_sunflower: sunflower,
  vo_paricutin: paricutin, vo_lengai: lengai, vo_villarrica: villarrica, vo_ararat: ararat, vo_klyuchevskaya: klyuch, vo_fournaise: fournaise,
  dn_carnotaurus: carnotaurus, dn_cryolophosaurus: cryolophosaurus, dn_massospondylus: massospondylus, dn_nigersaurus: nigersaurus,
  dn_therizinosaurus: therizinosaurus, dn_quetzalcoatlus: quetzalcoatlus, dn_mosasaurus: mosasaurus, dn_pachycephalosaurus: pachycephalosaurus,
};
