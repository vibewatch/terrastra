import * as THREE from 'three';
import { type Builder, type V3, g, add, mat, box, cyl, cone, rod, gable, shade } from '../prims.ts';
import { type HFn, sstep } from '../nature.ts';
import { type VCol, K, W, B, L, S, W2, clamp, smax, Y0, hh, n2, f2, r2, H01, person, type TOpts, terra as terra0 } from '../kit/terrain.ts';

// Hero builders for the volcano collection (keys vo_*). Each is a small terrain diorama: a smooth vertex-coloured
// heightfield disc (radius 0.5, strata skirt), glowing emissive lava, soft ash/steam puffs and scale props.
// Front faces +z, base at y=0.


/** Volcanic terrain: a slightly coarser grid than the peaks pack and dark basaltic strata. */
const terra = (gp: THREE.Object3D, R: number, h: HFn, paint: VCol, o: TOpts = {}) =>
  terra0(gp, R, h, paint, { n: 100, focus: 0.3, strata: ['#4a3a32', '#3b2f2a', '#5a463a', '#2f2826'], ...o });

/** Blend toward two-tone snow (lit → shadowed by the up component of the normal). */
const LS = (t: number, ny: number, lit = '#f4f7fb', sh = '#c6d2e2') => {
  if (t > 0) W.lerp(W2.copy(K(lit)).lerp(K(sh), sstep(0.8, 0.35, ny)), t > 1 ? 1 : t);
  return W;
};

/** Radial gully pattern around a cone (0 = ridge, 1 = gully floor), `k` ≈ number of gullies. */
const gully = (a: number, k = 13, sd = 0) => {
  const n = n2(Math.cos(a) * 2.5 + 7 + sd, Math.sin(a) * 2.5);
  const s1 = 0.5 + 0.5 * Math.sin(a * k + n * 6 + sd), s2 = 0.5 + 0.5 * Math.sin(a * (k * 2 + 3) + 1.3 + n * 5);
  const a2 = s1 * s1, a4 = a2 * a2, b2 = s2 * s2, b4 = b2 * b2;
  return Math.max(a4 * a2 * s1, 0.75 * b4 * b4 * s2);
};


/** Sea/lake painter: depth-tinted (shallow → deep by terrain depth below `wl`) with ripple glints. */
function sea(h: HFn, wl: number, shallow = '#3fa7b8', deep = '#1d5f8c', foam = '#e8f6fb'): VCol {
  return (x, _y, z) => {
    const d = wl - h(x, z);
    B(shallow); L(deep, sstep(0.004, 0.03, d));
    L(foam, sstep(0.004, 0.0, d) * 0.6);
    const rip = Math.sin(z * 210 + Math.sin(x * 37) * 2.5 + n2(x * 30, z * 30) * 4);
    if (rip > 0.84) L('#d8eef8', 0.3);
    return W;
  };
}

// ---- volcanic effects ----------------------------------------------------------------------------------------
const GLOW = '#ff8a24', GLOWE = '#ff4a08';
const PS = () => g('vo:puff', () => new THREE.SphereGeometry(1, 10, 7));
/**
 * Merged cloud of spheres [x, y, z, r] (one draw call). Opaque puffs (ash) get baked with AO; `op` makes soft
 * translucent steam. `c2` tints toward the top (vertical gradient); `sq` squashes vertically.
 */
function puffs(gp: THREE.Object3D, P: number[][], c: string, o: { op?: number; c2?: string; glow?: string; sq?: number } = {}): void {
  const base = PS(), bp = base.getAttribute('position'), bi = base.index!;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  let y0 = 1e9, y1 = -1e9;
  for (const p of P) { y0 = Math.min(y0, p[1] - p[3]); y1 = Math.max(y1, p[1] + p[3]); }
  const ca = K(c), cb = K(o.c2 ?? c), tc = new THREE.Color(), sq = o.sq ?? 0.85;
  for (const [x, y, z, r] of P) {
    const off = pos.length / 3;
    for (let i = 0; i < bp.count; i++) {
      const vx = bp.getX(i), vy = bp.getY(i), vz = bp.getZ(i), py = y + vy * r * sq;
      pos.push(x + vx * r, py, z + vz * r);
      nor.push(vx, vy, vz);
      tc.copy(ca).lerp(cb, clamp((py - y0) / (y1 - y0 || 1)));
      col.push(tc.r, tc.g, tc.b);
    }
    for (let i = 0; i < bi.count; i++) idx.push(off + bi.getX(i));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const m = add(gp, geo, mat('#ffffff', { flat: false, vc: true, rough: 1, transparent: o.op, emissive: o.glow }), 0, 0, 0, 1, 1, 1);
  if (o.op !== undefined) { (m.material as THREE.Material).depthWrite = false; m.renderOrder = 2; m.castShadow = false; }
}
/** A billowing column: puffs growing and drifting with height from (x,y,z). */
function column(x: number, y: number, z: number, hgt: number, r0: number, r1: number, n: number, seed: number, drift: [number, number] = [0, 0]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), r = r0 + (r1 - r0) * t;
    const jx = (H01(i, seed, 1) - 0.5) * r * 0.9, jz = (H01(i, seed, 2) - 0.5) * r * 0.9;
    out.push([x + drift[0] * t * t + jx, y + hgt * t, z + drift[1] * t * t + jz, r * (0.8 + 0.4 * H01(i, seed, 3))]);
    if (t > 0.35) out.push([x + drift[0] * t * t - jx * 1.4, y + hgt * t - r * 0.3, z + drift[1] * t * t - jz * 1.4, r * 0.75]);
  }
  return out;
}

const DISC = () => g('vo:disc', () => new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2));
/**
 * Lava lake: glowing emissive sheet with dark cooled crust plates separated by jagged glowing cracks (Worley cells).
 * `crust` = 0..1 how much of the surface is covered, `cell` = plate size.
 */
function lavaLake(gp: THREE.Object3D, cx: number, y: number, cz: number, rx: number, rz: number, seed: number, crust = 0.75, cell = 0.025): void {
  add(gp, DISC(), mat(GLOW, { emissive: GLOWE, flat: false }), cx, y, cz, rx, 1, rz);
  const N = Math.max(10, Math.round((Math.max(rx, rz) * 2) / (cell * 0.32))), pos: number[] = [], col: number[] = [];
  const tc = new THREE.Color();
  const cw = 0.06 + (1 - crust) * 0.5;
  const edge = (x: number, z: number) => {
    // Worley F2-F1 on a 2D grid (cheap version using integer hash)
    const u = x / cell + seed * 7.1, v = z / cell, ui = Math.floor(u), vi = Math.floor(v);
    let f1 = 9, f2 = 9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const px = ui + i + hh(ui + i, vi + j), pz = vi + j + hh(vi + j + 91, ui + i + 37);
      const d = Math.hypot(u - px, v - pz);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x0 = -1 + (2 * i) / N, z0 = -1 + (2 * j) / N, s = 2 / N;
    for (const tri of [[[x0, z0], [x0, z0 + s], [x0 + s, z0]], [[x0 + s, z0], [x0, z0 + s], [x0 + s, z0 + s]]]) {
      const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, mz = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      if (mx * mx + mz * mz > 0.86) continue;
      const e = edge(mx * rx, mz * rz) + (n2(mx * 4 + seed, mz * 4) - 0.5) * 0.1;
      if (e < cw) continue;
      const hot = sstep(cw + 0.18, cw, e);
      tc.copy(K('#221a18')).lerp(K('#3a2a24'), n2(mx * 9 + seed, mz * 9)).lerp(K('#7a2a12'), hot * 0.8);
      for (const [vx, vz] of tri) { pos.push(cx + vx * rx, y + 0.0015 + hot * 0.0005, cz + vz * rz); col.push(tc.r, tc.g, tc.b); }
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  add(gp, geo, mat('#ffffff', { flat: true, vc: true, rough: 0.95 }), 0, 0, 0, 1, 1, 1);
}
/** Glowing lava ribbon draped over the terrain along a polyline (widths w0 → w1). */
function lavaRibbon(gp: THREE.Object3D, h: HFn, P: [number, number][], w0: number, w1: number, lift = 0.003, c = GLOW, e = GLOWE): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < 6; k++) {
    const t = k / 6;
    pts.push([P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t]);
  }
  pts.push(P[P.length - 1]);
  const pos: number[] = [], idx: number[] = [];
  pts.forEach(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, t = i / (pts.length - 1);
    const w = (w0 + (w1 - w0) * t) * (0.8 + 0.4 * n2(i * 0.7, 3.3)), nx = -dz / l, nz = dx / l;
    for (const s of [-1, 0, 1]) {
      const px = x + nx * w * s, pz = z + nz * w * s;
      pos.push(px, Y0 + h(px, pz) + lift + (s === 0 ? w * 0.25 : 0), pz);
    }
    if (i) { const k = (i - 1) * 3; idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  add(gp, geo, mat(c, { emissive: e, flat: false }), 0, 0, 0, 1, 1, 1);
}

// ---- props -------------------------------------------------------------------------------------------------
const LO = () => g('vo:lo', () => new THREE.SphereGeometry(0.5, 9, 6));
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
function sprinkle(n: number, seed: number, R: number, ok: (x: number, z: number) => boolean, f: (x: number, z: number, i: number) => void, tries = 5): void {
  let placed = 0;
  for (let i = 0; i < n * tries && placed < n; i++) {
    const a = H01(i, seed, 1) * Math.PI * 2, d = Math.sqrt(H01(i, seed, 2)) * R, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ok(x, z)) { f(x, z, i); placed++; }
  }
}
function conifer(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#4a3526', x, y, z, s * 0.07, s * 0.3, 5);
  cone(p, c, x, y + s * 0.18, z, s * 0.3, s * 0.55, 6);
  cone(p, shade(c, 1.12), x, y + s * 0.48, z, s * 0.22, s * 0.5, 6);
}
function decid(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#5b4636', x, y, z, s * 0.07, s * 0.45, 5);
  blob(p, c, x, y + s * 0.6, z, s * 0.34, s * 0.3, s * 0.34);
  blob(p, shade(c, 1.15), x + s * 0.12, y + s * 0.78, z + s * 0.06, s * 0.2);
}
function palm(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number): void {
  const lean = H01(seed, 5) * 0.3;
  const top: V3 = [x + Math.cos(seed) * s * lean, y + s, z + Math.sin(seed) * s * lean];
  rod(p, [x, y, z], top, s * 0.03, '#7a6650', 5);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + seed, d = 0.35 + (k % 2) * 0.35, l = s * 0.34;
    box(p, k % 2 ? '#3f7a3a' : '#4f8a42', top[0] + (l / 2) * Math.cos(d) * Math.cos(a), top[1] - (l / 2) * Math.sin(d), top[2] - (l / 2) * Math.cos(d) * Math.sin(a), l, 0.003, s * 0.08, a, 0, -d);
  }
  blob(p, '#3a6b35', top[0], top[1], top[2], s * 0.08);
}
function house(p: THREE.Object3D, x: number, y: number, z: number, w: number, ry: number, wall: string, roof: string, hgt = w * 0.7): void {
  box(p, wall, x, y - 0.002, z, w, hgt + 0.002, w * 0.75, ry);
  gable(p, w * 1.12, w * 0.4, w * 0.85, roof, x, y + hgt, z, ry);
}

// =========================================================================================================
// Mayon — the near-perfect concave cone rising from rice paddies, gullied grey upper slopes with a fresh lava
// channel glowing below the summit, a cloud band around the waist and the Cagsawa belfry ruin in front.
const vo_mayon: Builder = gp => {
  const CX = 0, CZ = -0.06, R0 = 0.42, H = 0.7;
  const prof = (u: number) => { const s = Math.max(0, 1 - u); return H * s * s * (1.15 - 0.15 * s); };
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    let y = prof(u);
    if (u < 0.035) y = prof(0.035) - 0.012 * (1 - u / 0.035);
    else y -= 0.018 * gully(a, 15) * sstep(0.03, 0.2, u) * Math.max(0, 1 - u) ** 0.7;
    const gnd = 0.012 + 0.012 * f2(x * 7, z * 7, 2, 1);
    return smax(y, gnd, 0.04);
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const a = Math.atan2(z - CZ, x - CX);
    const t = y / H, n = f2(x * 12, z * 12, 3, 2);
    if (t < 0.07) {
      // rice paddies: green checker with earthen dikes
      const px = x * 34 + n2(z * 6, 1) * 1.5, pz = z * 30;
      const cell = hh(Math.floor(px), Math.floor(pz));
      B(cell > 0.66 ? '#8fb84e' : cell > 0.33 ? '#6f9e3e' : '#a7c25c');
      if (Math.abs(px - Math.round(px)) < 0.08 || Math.abs(pz - Math.round(pz)) < 0.08) B('#8a7a52');
      return L('#4c7a35', sstep(0.04, 0.07, t));
    }
    B('#3f6e33'); L('#55803d', n);
    L('#7b7a5c', sstep(0.18, 0.36, t + 0.06 * n));
    L('#6f655c', sstep(0.36, 0.55, t));
    L('#857a70', sstep(0.62, 0.8, t) * 0.7);
    // grey lahar/ash streaks in gullies
    L('#9a948a', gully(a, 15) * sstep(0.15, 0.35, t) * 0.55);
    // dark recent lava flow on the south-east gully
    const lf = Math.exp(-(((a - 0.95) / 0.07) ** 2)) * sstep(0.95, 0.55, t) * sstep(0.2, 0.4, t);
    L('#2c2725', lf * 0.9);
    L('#c2410c', Math.exp(-(((a - 1.0) / 0.06) ** 2)) * sstep(0.62, 0.72, t));
    return S(0.9 + 0.12 * ny);
  }, { n: 90, focus: 0.4, strata: ['#4f3f32', '#3e322a', '#5c4a3a'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // glowing lava tongue just below the crater
  const pa = 0.95, lp: [number, number][] = [];
  for (const u of [0.04, 0.09, 0.15, 0.22]) lp.push([CX + Math.cos(pa + u * 0.3) * u * R0, CZ + Math.sin(pa + u * 0.3) * u * R0]);
  lavaRibbon(gp, hf, lp, 0.007, 0.011, 0.006);
  // summit steam & a cloud band wrapped around the waist
  puffs(gp, column(CX, Y0 + H + 0.005, CZ, 0.1, 0.022, 0.045, 6, 3, [0.06, 0.02]), '#f1f3f5', { op: 0.85, c2: '#ffffff' });
  const band: number[][] = [];
  for (let i = 0; i < 9; i++) {
    const a = -2.6 + i * 0.32, rr = 0.2 + H01(i, 4) * 0.03;
    band.push([CX + Math.cos(a) * rr, Y0 + 0.24 + H01(i, 5) * 0.04, CZ + Math.sin(a) * rr, 0.05 + H01(i, 6) * 0.025]);
  }
  puffs(gp, band, '#e9edf2', { op: 0.8, c2: '#ffffff', sq: 0.55 });
  // Cagsawa belfry ruin with its broken church wall
  const bx = -0.2, bz = 0.34, by = gy(bx, bz);
  box(gp, '#8d8172', bx, by, bz, 0.05, 0.05, 0.05);
  box(gp, '#9a8e7d', bx, by + 0.05, bz, 0.042, 0.045, 0.042);
  box(gp, '#a39784', bx, by + 0.095, bz, 0.034, 0.035, 0.034);
  for (const [ox, oz] of [[0, 0.022], [0.022, 0], [-0.022, 0], [0, -0.022]]) box(gp, '#3a332c', bx + ox * 0.78, by + 0.103, bz + oz * 0.78, ox ? 0.002 : 0.012, 0.018, oz ? 0.002 : 0.012);
  cone(gp, '#7a6e60', bx, by + 0.13, bz, 0.02, 0.025, 8);
  blob(gp, '#4c7a35', bx + 0.01, by + 0.11, bz + 0.012, 0.012, 0.008, 0.01);
  box(gp, '#8d8172', bx + 0.07, by, bz - 0.01, 0.07, 0.03, 0.008, 0.1);
  box(gp, '#8d8172', bx + 0.1, by, bz - 0.01, 0.025, 0.045, 0.008, 0.1);
  // nipa huts, palms and a carabao
  for (const [x, z, r] of [[0.22, 0.34, 0.4], [0.28, 0.28, -0.2], [0.17, 0.4, 0.1]]) house(gp, x, gy(x, z), z, 0.026, r, '#b9965a', '#8a6a3a', 0.016);
  sprinkle(16, 11, 0.49, (x, z) => hf(x, z) < 0.03 && Math.hypot(x - bx, z - bz) > 0.06 && (Math.hypot(x, z) > 0.36), (x, z, i) => palm(gp, x, gy(x, z), z, 0.06 + H01(i, 12) * 0.025, i));
  const kx = 0.05, kz = 0.42, ky = gy(kx, kz);
  blob(gp, '#4a4440', kx, ky + 0.009, kz, 0.012, 0.007, 0.007);
  blob(gp, '#4a4440', kx + 0.013, ky + 0.012, kz, 0.005, 0.005, 0.004);
  person(gp, kx - 0.02, ky, kz + 0.005, '#c2410c');
};

// =========================================================================================================
// Mount St. Helens — the 1980 lateral blast left a horseshoe crater breached to the north (+z here). Inside: the
// steaming lava dome wrapped by Crater Glacier; outside: the grey Pumice Plain, Spirit Lake choked with floating
// logs, and ridges of blown-down grey trees beside surviving green forest.
const vo_sthelens: Builder = gp => {
  const CX = 0, CZ = -0.08, R0 = 0.48, H = 0.64;
  const AX = 0, AZ = -0.04;
  const amph = (x: number, z: number) => {
    const dx = x - AX, dz = z - AZ;
    if (dz <= 0) return Math.hypot(dx / 0.14, dz / 0.15);
    return Math.abs(dx) / (0.14 + dz * 0.5);
  };
  const LK: [number, number] = [0.27, 0.22];
  const lakeE = (x: number, z: number) => ((x - LK[0]) / 0.13) ** 2 + ((z - LK[1]) / 0.1) ** 2;
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    let y = H * Math.pow(Math.max(0, 1 - u), 1.35);
    y -= 0.016 * gully(a, 11, 2) * sstep(0.2, 0.5, u) * (1 - u);
    const d = amph(x, z);
    const floor = 0.22 - 0.42 * Math.max(0, z - AZ) + 0.01 * f2(x * 20, z * 20, 2, 3);
    const m = sstep(1.08, 0.82, d);
    // rim crest, notched and jagged
    const rimY = y + 0.02 * r2(x * 26, z * 26, 2, 4) * sstep(0.6, 1, d);
    y = rimY * (1 - m) + Math.min(rimY, floor) * m;
    // the lava dome
    const dd = Math.hypot(x - AX, z - (AZ + 0.02));
    if (dd < 0.07) y = Math.max(y, floor + 0.06 * (1 - (dd / 0.07) ** 2) ** 0.8 * (0.8 + 0.4 * r2(x * 50, z * 50, 2, 5)));
    // hummocky pumice plain + lowland
    const gnd = 0.02 + 0.016 * f2(x * 6, z * 6, 3, 6) + 0.012 * sstep(0.1, 0.4, z) * r2(x * 22, z * 22, 2, 7);
    y = smax(y, gnd, 0.05);
    const e = lakeE(x, z);
    if (e < 3) { const k = sstep(0.6, 2.6, e); y = y * k + (1 - k) * (0.0 + 0.02 * sstep(0.3, 1.2, e)); }
    return y;
  };
  const WL = 0.016;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const d = amph(x, z), t = y / H, n = f2(x * 12, z * 12, 3, 8);
    const inC = sstep(1.0, 0.9, d) * (z < 0.2 ? 1 : 0);
    const blast = sstep(-0.05, 0.12, z - Math.abs(x) * 0.45);
    B('#2f5a33'); L('#41703c', n);
    L(n > 0.5 ? '#7a7a5a' : '#9a9280', blast * 0.75);
    L('#bdb39e', sstep(0.04, 0.1, z) * sstep(0.26, 0.1, Math.abs(x) - z * 0.25) * sstep(0.09, 0.05, y) * 0.9);
    L('#7c7268', sstep(0.2, 0.36, t + 0.08 * n - 0.06 * blast));
    L('#6b5e57', inC * 0.8);
    if (inC > 0.5 && ny < 0.6) L(Math.sin(y * 260 + n * 4) > 0 ? '#8f7e6a' : '#5f544c', 0.5);
    // snow on the outer upper slopes and rim; glacier around the dome
    const sn = sstep(0.5, 0.6, t + 0.12 * n - 0.08 * (1 - ny)) * (1 - inC * 0.7);
    LS(sn, ny);
    const glac = inC * sstep(0.035, 0.015, Math.abs(Math.hypot(x - AX, z - AZ - 0.02) - 0.085)) * (z < AZ + 0.06 ? 1 : 0) * (ny > 0.6 ? 1 : 0.3);
    LS(glac * 0.85, ny, '#e8eef5', '#b8c6d6');
    if (Math.hypot(x - AX, z - AZ - 0.02) < 0.065 && y > 0.23) { B('#4a403b'); L('#6a5a50', n); }
    return W;
  }, { n: 90, focus: 0.3, wl: WL, water: (x, y, z) => {
    // Spirit Lake with its drifting log mat
    sea(hf, WL, '#5a8ea0', '#2f6a86')(x, y, z, 0, 1, 0);
    if (z < LK[1] - 0.01 && n2(x * 60, z * 60) > 0.45) L('#8c8070', 0.75);
    return W;
  }, strata: ['#5a4d44', '#4a3e37', '#6a5a4c', '#3e3530'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // steam from the dome
  puffs(gp, column(AX, gy(AX, AZ + 0.02) + 0.04, AZ + 0.02, 0.12, 0.02, 0.045, 6, 7, [0.04, -0.03]), '#eef1f4', { op: 0.75, c2: '#ffffff' });
  // floating logs on Spirit Lake
  for (let i = 0; i < 22; i++) {
    const x = LK[0] - 0.08 + H01(i, 13) * 0.14, z = LK[1] - 0.08 + H01(i, 14) * 0.05;
    if (lakeE(x, z) > 0.75) continue;
    rod(gp, [x, Y0 + WL + 0.001, z], [x + 0.022 * Math.cos(H01(i, 15) * 3), Y0 + WL + 0.001, z + 0.022 * Math.sin(H01(i, 15) * 3)], 0.0016, '#a59a8a', 4);
  }
  // blown-down forest: grey trunks lying flat, all pointing away from the crater
  sprinkle(36, 17, 0.48, (x, z) => {
    const r = Math.hypot(x, z);
    return r > 0.3 && z > -0.05 && Math.abs(x) > 0.2 && lakeE(x, z) > 1.6;
  }, (x, z) => {
    const a = Math.atan2(z - AZ, x - AX), y = gy(x, z) + 0.002, l = 0.03;
    rod(gp, [x, y, z], [x + Math.cos(a) * l, Y0 + hf(x + Math.cos(a) * l, z + Math.sin(a) * l) + 0.001, z + Math.sin(a) * l], 0.0022, '#857a6c', 4);
  });
  // surviving forest behind and on the flanks
  sprinkle(46, 19, 0.49, (x, z) => Math.hypot(x, z) > 0.36 && hf(x, z) < 0.08 && (z < -0.02 || (z - Math.abs(x) * 0.45 < -0.05)) && lakeE(x, z) > 1.5, (x, z, i) =>
    conifer(gp, x, gy(x, z), z, 0.04 + H01(i, 20) * 0.02, i % 3 ? '#23472c' : '#2f5a37'));
  // Johnston Ridge observatory and visitors on the front-left ridge
  const ox = -0.3, oz = 0.36, oy = gy(ox, oz);
  box(gp, '#6b6258', ox, oy, oz, 0.05, 0.016, 0.026, -0.5);
  box(gp, '#3a5f7a', ox + 0.004, oy + 0.006, oz + 0.008, 0.042, 0.008, 0.012, -0.5);
  for (let i = 0; i < 4; i++) person(gp, ox + 0.04 + i * 0.012, gy(ox + 0.04 + i * 0.012, oz - 0.02), oz - 0.02, ['#2563eb', '#dc2626', '#f59e0b', '#16a34a'][i]);
};

// =========================================================================================================
// Vesuvius — the Gran Cono with its deep summit crater, cradled on the north (back) by the cliff arc of Monte
// Somma; vineyards and pine on the lower slopes, a pastel coastal town and the Bay of Naples in front.
const vo_vesuvius: Builder = gp => {
  const CX = 0.02, CZ = -0.03, R0 = 0.36, H = 0.54, RC = 0.075;
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), u = r / R0, a = Math.atan2(dz, dx);
    // Gran Cono with crater
    let y = H * Math.pow(Math.max(0, 1 - u), 1.15);
    y -= 0.012 * gully(a, 17, 1) * sstep(0.35, 0.6, u) * Math.max(0, 1 - u);
    const rimH = H * Math.pow(1 - RC / R0, 1.15) + 0.006 * Math.sin(a * 3 + 1);
    if (r < RC) y = rimH - 0.12 * Math.pow(1 - r / RC, 0.6) + 0.01 * (r / RC) ** 3;
    // Monte Somma: steep inner wall facing the cone, gentle outer slope; only on the north (back) side
    const RS = 0.33, back = sstep(0.05, -0.6, Math.sin(a)), sh = 0.27 * back * (0.75 + 0.35 * r2(Math.cos(a) * 4, Math.sin(a) * 4, 3, 2));
    const somma = r < RS ? sh * Math.exp(-(((r - RS) / 0.035) ** 2)) : sh * Math.pow(Math.max(0, 1 - (r - RS) / 0.16), 1.6);
    // Valle del Gigante floor between them
    const atrio = 0.15 * back * sstep(0.16, 0.24, r) * sstep(RS + 0.01, RS - 0.03, r);
    y = Math.max(y, somma, atrio);
    y += (0.004 + y * 0.04) * (r2(x * 24, z * 24, 2, 3) - 0.5);
    // coastal plain down to the sea
    const gnd = 0.035 + 0.02 * f2(x * 7, z * 7, 2, 1);
    y = smax(y, gnd, 0.05);
    const sea = sstep(0.26, 0.34, z + 0.03 * Math.sin(x * 9));
    return y * (1 - sea) + sea * (-0.02);
  };
  const WL = 0.006;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), t = y / H, n = f2(x * 12, z * 12, 3, 4);
    if (y < WL + 0.006) { B('#c9b48a'); return L('#9a8a6a', n * 0.5); }
    B('#4b7a3a'); L('#5f8a44', n);
    // vineyard rows on the lower slopes
    if (t < 0.22 && r > 0.2) { if (Math.sin((x * 0.7 + z * 0.7) * 260) > 0.3) L('#3b6230', 0.6); }
    L('#3a5e35', sstep(0.15, 0.25, t) * sstep(0.45, 0.3, t) * 0.7);
    // bare upper cone: purple-grey ash and tephra
    const bare = sstep(0.3, 0.42, t + 0.08 * n) * (r < 0.3 ? 1 : 0);
    L('#7a6a66', bare);
    L('#8d7d72', bare * gully(Math.atan2(dz, dx), 17, 1) * 0.6);
    // crater: reddish oxidised walls, dark floor
    if (r < RC + 0.004) { B(ny < 0.7 ? (Math.sin(y * 300) > 0 ? '#9a5a42' : '#7a4a3a') : '#4a3f3c'); L('#c49a5a', sstep(0.45, 0.48, t) * 0.3); }
    // Somma cliff face: dark lava strata; dark recent lava flows (1944) on the atrio and west flank
    if (r > 0.29 && ny < 0.7 && t > 0.22) L(Math.sin(y * 220 + n * 3) > 0 ? '#5a4c46' : '#6e5e54', 0.7);
    const flow = Math.exp(-(((Math.atan2(dz, dx) - 2.2) / 0.12) ** 2)) * sstep(0.45, 0.1, t) * sstep(0.12, 0.2, r);
    L('#3a3230', flow * 0.85);
    return S(0.92 + 0.1 * ny);
  }, { n: 90, focus: 0.3, wl: WL, water: sea(hf, WL, '#3e9ab6', '#1f5f8e'), strata: ['#5a4a40', '#4a3c34', '#6a564a', '#3a302b'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // fumarole wisps on the crater rim
  puffs(gp, [[CX + 0.03, Y0 + H * 0.82, CZ - 0.03, 0.012], [CX + 0.04, Y0 + H * 0.82 + 0.02, CZ - 0.04, 0.018], [CX + 0.06, Y0 + H * 0.82 + 0.045, CZ - 0.05, 0.024]],
    '#eef2f5', { op: 0.6 });
  // Stone pines and orchards
  sprinkle(40, 23, 0.47, (x, z) => { const y = hf(x, z); return y > 0.03 && y < 0.12 && z > -0.2; }, (x, z, i) => {
    const y = gy(x, z), s = 0.035 + H01(i, 24) * 0.015;
    if (i % 3 === 0) { cyl(gp, '#5a4434', x, y, z, s * 0.06, s * 0.7, 5); blob(gp, '#2f5a30', x, y + s * 0.78, z, s * 0.35, s * 0.14, s * 0.35); }
    else decid(gp, x, y, z, s * 0.8, '#47723a');
  });
  // pastel town along the shore (Torre del Greco / Ercolano) with a church dome
  const walls = ['#f1e4c8', '#e8c9a0', '#f3d9d0', '#e9e2cf', '#f6edd9', '#e3b98a'];
  sprinkle(42, 29, 0.47, (x, z) => z > 0.12 && hf(x, z) > WL + 0.008 && hf(x, z) < 0.06 && Math.abs(x) < 0.42, (x, z, i) => {
    const y = gy(x, z), w = 0.014 + H01(i, 30) * 0.008, hgt = 0.01 + H01(i, 31) * 0.014, ry = 0.15 + (H01(i, 32) - 0.5) * 0.3;
    box(gp, walls[i % walls.length], x, y, z, w, hgt, w * 0.85, ry);
    box(gp, i % 4 ? '#b0553a' : '#c96a45', x, y + hgt, z, w * 1.04, 0.003, w * 0.9, ry);
  });
  const cx = -0.12, cz = 0.22, cy = gy(cx, cz);
  box(gp, '#efe3c7', cx, cy, cz, 0.03, 0.022, 0.03);
  add(gp, LO(), mat('#8aa0b0', { flat: false }), cx, cy + 0.024, cz, 0.024, 0.024, 0.024);
  box(gp, '#efe3c7', cx + 0.022, cy, cz - 0.01, 0.01, 0.045, 0.01);
  // boats in the bay
  for (const [x, z, r] of [[0.12, 0.4, 0.3], [-0.25, 0.38, -0.2], [0.3, 0.33, 0.6]]) {
    box(gp, '#f8fafc', x, Y0 + WL, z, 0.03, 0.005, 0.01, r);
    box(gp, '#1e3a5f', x, Y0 + WL - 0.001, z, 0.031, 0.002, 0.011, r);
  }
  rod(gp, [0.12, Y0 + WL, 0.4], [0.12, Y0 + WL + 0.03, 0.4], 0.001, '#d6d3d1', 4);
};

/** Small scoria/cinder cone added onto a height (pit crater on top). */
const cinder = (y: number, x: number, z: number, cx: number, cz: number, r: number, hgt: number, pit = 0.35) => {
  const d = Math.hypot(x - cx, z - cz) / r;
  if (d >= 1) return y;
  let c = hgt * (1 - d) ** 1.2;
  if (d < pit) c = hgt * (1 - pit) ** 1.2 - hgt * 0.5 * (1 - d / pit) ** 1.5;
  return Math.max(y, y * 0.6 + c + y * 0.4 * (1 - d));
};

// =========================================================================================================
// Etna — a broad, gently sloping giant: a snowy summit plateau with a cluster of smoking craters (the young South-
// East Crater cone spilling glowing lava into the Valle del Bove), black lava fields striping the flanks, dozens of
// red-brown parasitic cones, green orchards below and Catania on the Ionian shore.
const vo_etna: Builder = gp => {
  const CX = -0.04, CZ = -0.08, R0 = 0.54, H = 0.44;
  const CR: [number, number, number, number][] = [[-0.05, -0.1, 0.06, 0.05], [0.0, -0.15, 0.045, 0.04], [0.035, -0.06, 0.05, 0.07], [-0.09, -0.06, 0.035, 0.03]];
  const PAR: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = H01(i, 41) * Math.PI * 2, d = 0.16 + H01(i, 42) * 0.24;
    const px = CX + Math.cos(a) * d, pz = CZ + Math.sin(a) * d;
    if (Math.hypot(px - 0.18, pz + 0.02) < 0.12) continue;
    PAR.push([px, pz, 0.022 + H01(i, 43) * 0.018]);
  }
  const VB = { x: 0.17, z: -0.02 };
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    let y = H * Math.pow(Math.max(0, 1 - u), 1.35);
    if (u < 0.14) y = H * Math.pow(0.86, 1.35) + (H * 1.0 - H * Math.pow(0.86, 1.35)) * 0.25 * (1 - u / 0.14);
    y -= 0.012 * gully(a, 9, 3) * sstep(0.25, 0.6, u) * (1 - u);
    for (const [cx, cz, r, hgt] of CR) y = cinder(y, x, z, cx, cz, r, hgt + 0.0, 0.45);
    for (const [cx, cz, r] of PAR) y = cinder(y, x, z, cx, cz, r, r * 0.9, 0.3);
    // Valle del Bove: horseshoe amphitheatre on the east flank, open seaward
    const vx = (x - VB.x) / 0.11, vz = (z - VB.z) / 0.13, vd = Math.hypot(Math.min(vx, 0) * 1.0 + Math.max(vx, 0) * 0.35, vz);
    if (vd < 1.2) y -= 0.1 * sstep(1.15, 0.75, vd) * sstep(-0.2, 0.25, y / H);
    y += (0.003 + y * 0.04) * (r2(x * 22, z * 22, 2, 5) - 0.5);
    const gnd = 0.012 + 0.012 * f2(x * 7, z * 7, 2, 4);
    y = smax(y, gnd, 0.03);
    const sea = sstep(0.36, 0.44, z + 0.08 * Math.sin(x * 5 + 1) - x * 0.12);
    return y * (1 - sea) - 0.02 * sea;
  };
  const WL = 0.005;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    const t = y / H, n = f2(x * 10, z * 10, 3, 6);
    if (y < WL + 0.004) { B('#2a2624'); return L('#4a4440', n); }
    B('#56803e'); L('#6f8c48', n);
    if (t < 0.12) { const c = hh(Math.floor(x * 40 + n2(z * 5, 2)), Math.floor(z * 40)); L(c > 0.6 ? '#7e9a46' : c > 0.3 ? '#4f7a3a' : '#a08a52', 0.55); }
    L('#6a6a4e', sstep(0.18, 0.32, t + 0.08 * n));
    L('#4e4642', sstep(0.32, 0.5, t + 0.08 * n));
    // dark historic lava flows radiating downhill
    const fl = sstep(0.62, 0.8, n2(a * 6 + 3, u * 2.5)) * sstep(0.95, 0.6, u);
    L('#231f1e', fl * 0.85);
    // parasitic cones are reddish scoria
    for (const [cx, cz, r] of PAR) { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1) L(d < 0.35 ? '#3a2a24' : '#8a4a32', 0.75 * (1 - d * 0.5)); }
    // snow on the high plateau, streaking down gullies; bare dark ash around the active craters
    const sn = sstep(0.55, 0.66, t + 0.1 * n + 0.05 * gully(a, 9, 3)) * (ny > 0.5 ? 1 : 0.4);
    LS(sn * 0.95, ny);
    for (const [cx, cz, r] of CR) { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1.2) { L('#3a3230', 0.85 * sstep(1.2, 0.8, d)); if (d < 0.45) L('#c9a24a', 0.25); } }
    if (Math.hypot((x - VB.x) / 0.11, (z - VB.z) / 0.13) < 0.95 && t < 0.62) L('#2b2624', 0.6);
    return S(0.92 + 0.1 * ny);
  }, { n: 92, focus: 0.3, wl: WL, water: sea(hf, WL, '#3b8fb0', '#1d5a86'), strata: ['#3a302c', '#2c2523', '#4a3c34', '#5a483c'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // glowing flow from the South-East Crater down into the Valle del Bove
  const sec = CR[2];
  lavaRibbon(gp, hf, [[sec[0] + 0.02, sec[1]], [0.1, -0.05], [0.15, -0.02], [0.2, 0.01], [0.24, 0.05]], 0.007, 0.013, 0.009);
  add(gp, DISC(), mat(GLOW, { emissive: GLOWE, flat: false }), sec[0], gy(sec[0], sec[1]) - 0.012, sec[1], 0.012, 1, 0.012);
  // ash-and-steam plume from the summit drifting east
  puffs(gp, column(-0.05, Y0 + H + 0.02, -0.1, 0.22, 0.03, 0.07, 7, 5, [0.12, 0.02]), '#8a8580', { c2: '#e4e2de', sq: 0.8 });
  puffs(gp, column(sec[0], Y0 + H + 0.04, sec[1], 0.08, 0.016, 0.03, 4, 6, [0.04, 0]), '#f1f3f5', { op: 0.7 });
  // Catania on the coast: pale blocks with terracotta roofs, the Duomo dome
  const walls = ['#efe2c6', '#e8d4b0', '#d9cbb3', '#f3e8d2'];
  sprinkle(46, 37, 0.48, (x, z) => z > 0.24 && hf(x, z) > WL + 0.006 && hf(x, z) < 0.04 && x < 0.15, (x, z, i) => {
    const y = gy(x, z), w = 0.014 + H01(i, 38) * 0.007, hg = 0.008 + H01(i, 39) * 0.012;
    box(gp, walls[i % 4], x, y, z, w, hg, w * 0.9, 0.4);
    box(gp, '#b4583c', x, y + hg, z, w * 1.02, 0.003, w * 0.92, 0.4);
  });
  // orchards and villages on the lower slopes
  sprinkle(36, 47, 0.49, (x, z) => { const y = hf(x, z); return y > 0.015 && y < 0.07 && z < 0.24; }, (x, z, i) =>
    blob(gp, i % 4 ? '#3f6e32' : '#5a7f3a', x, gy(x, z) + 0.008, z, 0.011, 0.009, 0.011));
  for (const [x, z] of [[-0.36, 0.06], [-0.3, -0.3], [0.28, 0.22]]) for (let k = 0; k < 4; k++) {
    const hx = x + (H01(k, x * 10) - 0.5) * 0.05, hz = z + (H01(k, z * 10) - 0.5) * 0.05;
    house(gp, hx, gy(hx, hz), hz, 0.014, k, '#ece0c8', '#a85538', 0.01);
  }
};

// =========================================================================================================
// Kīlauea — a low, wide shield: the summit caldera with the Halemaʻumaʻu pit and its churning lava lake, the
// Puʻu ʻŌʻō vent on the east rift, a glowing channel running down black pāhoehoe fields over the pali to the sea,
// where a new lava delta hisses up a white laze plume. ʻŌhiʻa forest survives on the older ground.
const vo_kilauea: Builder = gp => {
  const SX = -0.08, SZ = -0.16;
  const CAL = (x: number, z: number) => Math.hypot((x - SX) / 0.21, (z - SZ) / 0.15);
  const HP = { x: -0.06, z: -0.16, r: 0.085 };
  const PO = { x: 0.22, z: -0.04 };
  const coast = (x: number) => 0.27 + 0.03 * Math.sin(x * 7) + 0.05 * Math.exp(-(((x - 0.27) / 0.07) ** 2));
  const hf: HFn = (x, z) => {
    const r = Math.hypot((x - SX) / 1.25, z - SZ);
    let y = 0.19 * Math.pow(Math.max(0, 1 - r / 0.62), 1.2);
    // the pali: fault scarp step across the slope
    y += 0.035 * sstep(0.05, 0.02, z + 0.04 * Math.sin(x * 6));
    // caldera with flat floor and steep walls, and the deeper Halemaʻumaʻu pit
    const c = CAL(x, z);
    if (c < 1.15) y = y * sstep(0.88, 1.08, c) + (0.15 + 0.004 * f2(x * 30, z * 30, 2, 1)) * (1 - sstep(0.88, 1.08, c));
    const hp = Math.hypot(x - HP.x, z - HP.z) / HP.r;
    if (hp < 1.15) y -= 0.06 * sstep(1.12, 0.88, hp);
    y = cinder(y, x, z, PO.x, PO.z, 0.075, 0.06, 0.4);
    // ropey pāhoehoe texture
    y += 0.003 * r2(x * 40, z * 40, 2, 3) + 0.006 * (f2(x * 9, z * 9, 3, 4) - 0.5);
    const cz = coast(x);
    const sea = sstep(cz - 0.01, cz + 0.04, z);
    return y * (1 - sea) + sea * (-0.02) + 0.012 * (1 - sea);
  };
  const WL = 0.008;
  const flowPath: [number, number][] = [[PO.x + 0.02, PO.z + 0.03], [0.25, 0.04], [0.24, 0.1], [0.27, 0.17], [0.26, 0.23], [0.27, 0.31]];
  const nearFlow = (x: number, z: number) => {
    let d = 9;
    for (let i = 0; i < flowPath.length - 1; i++) {
      const [ax, az] = flowPath[i], [bx, bz] = flowPath[i + 1], ex = bx - ax, ez = bz - az;
      const f = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez));
      d = Math.min(d, Math.hypot(x - ax - ex * f, z - az - ez * f));
    }
    return d;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 10, z * 10, 3, 2);
    if (y < WL + 0.003) { B('#1c1a1a'); return L('#3a3532', n * 0.5); }
    // fresh black lava fields vs older rust-brown lava vs green forest
    const age = f2(x * 4 + 3, z * 4, 3, 7) + (z < -0.2 ? 0.35 : 0) + (x < -0.25 ? 0.25 : 0);
    B('#26221f'); L('#3d3733', n * 0.6);
    if (n2(x * 60, z * 60) > 0.7) L('#6a6a72', 0.35);
    L('#6b4a34', sstep(0.5, 0.62, age) * 0.7);
    L('#3f6a35', sstep(0.6, 0.75, age));
    L('#55803e', sstep(0.72, 0.85, age) * n);
    // a fresh glossy lava fan around the active flow
    const fd = nearFlow(x, z);
    L('#15120f', sstep(0.07, 0.02, fd));
    L('#7a2a12', sstep(0.012, 0.004, fd) * 0.8);
    // caldera floor grey, walls banded, sulphur-yellow staining near the pit
    const c = CAL(x, z);
    if (c < 1.0) { B('#4a4440'); L('#5a534d', n); }
    if (c > 0.85 && c < 1.12 && ny < 0.75) L(Math.sin(y * 400) > 0 ? '#5a4a40' : '#3a3330', 0.8);
    const hp = Math.hypot(x - HP.x, z - HP.z) / HP.r;
    if (hp < 1.4) L('#c9b24a', sstep(1.4, 1.05, hp) * 0.45);
    if (hp < 1.0) { B(Math.sin(y * 500) > 0 ? '#5a3a2c' : '#3a2a24'); }
    return S(0.92 + 0.1 * ny);
  }, { n: 92, focus: 0.25, wl: WL, water: (x, y, z) => {
    sea(hf, WL, '#2f8aa8', '#1b5a84')(x, y, z, 0, 1, 0);
    // turquoise churned water where the lava enters
    const d = Math.hypot(x - 0.28, z - coast(0.28) - 0.04);
    return L('#8fd6d0', sstep(0.12, 0.02, d) * 0.6);
  }, strata: ['#2a2420', '#3a302a', '#4a3a30', '#1f1b19'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Halemaʻumaʻu lava lake with a fountain
  const ly = Y0 + hf(HP.x, HP.z) + 0.006;
  lavaLake(gp, HP.x, ly, HP.z, HP.r * 0.86, HP.r * 0.86, 3, 0.62, 0.02);
  puffs(gp, [[HP.x - 0.01, ly + 0.01, HP.z + 0.01, 0.008], [HP.x - 0.012, ly + 0.02, HP.z + 0.008, 0.006]], GLOW, { glow: GLOWE });
  // channel of glowing lava to the sea, Puʻu ʻŌʻō crater glow, and the sea-entry laze plume
  lavaRibbon(gp, hf, flowPath, 0.006, 0.01, 0.004);
  add(gp, DISC(), mat(GLOW, { emissive: GLOWE, flat: false }), PO.x, gy(PO.x, PO.z) + 0.0, PO.z, 0.018, 1, 0.018);
  const ex = 0.27, ez = coast(0.27) + 0.03;
  puffs(gp, column(ex, Y0 + WL + 0.01, ez, 0.22, 0.025, 0.07, 11, 9, [-0.06, -0.1]), '#f4f6f8', { op: 0.6, c2: '#ffffff' });
  puffs(gp, column(HP.x + 0.02, ly + 0.06, HP.z - 0.03, 0.14, 0.02, 0.05, 7, 10, [0.05, -0.06]), '#ffd2b0', { op: 0.4, c2: '#ffffff' });
  puffs(gp, column(PO.x, gy(PO.x, PO.z) + 0.02, PO.z, 0.09, 0.015, 0.035, 4, 11, [0.03, -0.03]), '#eef0f2', { op: 0.6 });
  // ʻōhiʻa trees and tree ferns on the old forested ground, observers at the caldera rim
  sprinkle(44, 53, 0.49, (x, z) => {
    const age = f2(x * 4 + 3, z * 4, 3, 7) + (z < -0.2 ? 0.35 : 0) + (x < -0.25 ? 0.25 : 0);
    return age > 0.72 && CAL(x, z) > 1.2 && nearFlow(x, z) > 0.08 && hf(x, z) > 0.015;
  }, (x, z, i) => {
    const y = gy(x, z);
    if (i % 3) decid(gp, x, y, z, 0.035 + H01(i, 54) * 0.015, i % 2 ? '#3d6b34' : '#4a7a3a');
    else { rod(gp, [x, y, z], [x, y + 0.022, z], 0.002, '#4a3628', 4); blob(gp, '#5f9a42', x, y + 0.024, z, 0.012, 0.005, 0.012); }
  });
  // ʻōhiʻa lehua red blossoms
  sprinkle(10, 57, 0.49, (x, z) => f2(x * 4 + 3, z * 4, 3, 7) + (z < -0.2 ? 0.35 : 0) > 0.85 && CAL(x, z) > 1.25, (x, z) => blob(gp, '#c2302b', x, gy(x, z) + 0.03, z, 0.006));
  for (let i = 0; i < 5; i++) person(gp, -0.2 + i * 0.012, gy(-0.2 + i * 0.012, -0.03), -0.03, ['#ef4444', '#2563eb', '#fbbf24', '#10b981', '#f97316'][i]);
};

// =========================================================================================================
// Krakatau — Anak Krakatau, the grey "child" ash cone puffing a dark plume, rises in the drowned 1883 caldera,
// ringed by the remnant islands: Rakata's sheer half-cone cliff behind, low jungle-clad Sertung and Panjang.
const vo_krakatoa: Builder = gp => {
  const AX = 0.03, AZ = 0.04;
  const RK = { x: -0.12, z: -0.36 };
  const hf: HFn = (x, z) => {
    let y = -0.03 + 0.008 * f2(x * 6, z * 6, 2, 1);
    // Rakata: big cone sliced by the caldera wall (cliff facing the centre)
    const rd = Math.hypot(x - RK.x, z - RK.z);
    let rk = 0.42 * Math.pow(Math.max(0, 1 - rd / 0.3), 1.25);
    const cd = Math.hypot(x - AX, z - AZ + 0.02);
    rk *= sstep(0.3, 0.335, cd);
    rk += 0.012 * r2(x * 25, z * 25, 2, 2) * sstep(0, 0.05, rk);
    y = Math.max(y, rk - 0.01);
    // Sertung (west) and Panjang (east): low curved rim islands
    const arc = (cx: number, a0: number, a1: number, hgt: number, sd: number) => {
      const a = Math.atan2(z - AZ, x - AX), r = Math.hypot(x - AX, z - AZ);
      const w = sstep(a0, a0 + 0.25, a) * sstep(a1, a1 - 0.25, a);
      return hgt * w * Math.max(0, 1 - ((r - cx) / 0.06) ** 2) * (0.7 + 0.5 * f2(a * 3, r * 9, 2, sd)) - 0.012;
    };
    y = Math.max(y, arc(0.38, 1.9, 3.6, 0.06, 3), arc(0.36, -0.9, 0.7, 0.05, 4));
    // Anak Krakatau: ash cone with crater, apron of black sand and lava
    const ad = Math.hypot(x - AX, z - AZ) / 0.17;
    let an = 0.2 * Math.pow(Math.max(0, 1 - ad), 1.1) + 0.03 * Math.max(0, 1 - (ad / 1.5) ** 2);
    if (ad < 0.15) an -= 0.04 * (1 - ad / 0.15);
    an += 0.006 * gully(Math.atan2(z - AZ, x - AX), 12, 5) * (ad < 1 ? -1 : 0);
    y = Math.max(y, an - 0.012);
    return y;
  };
  const WL = 0.004;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 3, 9);
    if (y < WL + 0.006) { B('#2a2725'); return L('#4f4842', n); }
    const ad = Math.hypot(x - AX, z - AZ) / 0.17;
    if (ad < 1.35) {
      B('#6c6763'); L('#8a847e', n);
      L('#3a3532', gully(Math.atan2(z - AZ, x - AX), 12, 5) * 0.5);
      if (ad > 0.95) L('#2a2725', 0.8);
      if (x > AX + 0.06 && ad > 0.7 && z > AZ - 0.08) L('#3f6e33', sstep(0.5, 0.65, n) * 0.9);
      if (ad < 0.18) L('#3a2a24', 0.8);
      return S(0.9 + 0.12 * ny);
    }
    // jungle, with bare cliffs on steep faces (Rakata's banded caldera wall)
    B('#2f5e2c'); L('#3f7a36', n);
    if (ny < 0.55) { B(Math.sin(y * 200 + n * 3) > 0 ? '#7a5a48' : '#5a4a42'); L('#9a6a4a', n * 0.4); }
    return S(0.9 + 0.12 * ny);
  }, { n: 96, focus: 0.15, wl: WL, water: sea(hf, WL, '#3ab0b8', '#1a5d8a'), strata: ['#1d4f73', '#1a476a', '#184163'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // the ash column: dark at the vent, paler and billowing above, drifting downwind
  const top = Y0 + 0.2 - 0.04;
  puffs(gp, column(AX, top + 0.02, AZ, 0.32, 0.03, 0.08, 9, 13, [0.1, -0.05]), '#3e3a38', { c2: '#b9b3ad', sq: 0.85 });
  add(gp, DISC(), mat(GLOW, { emissive: GLOWE, flat: false }), AX, top + 0.004, AZ, 0.02, 1, 0.02);
  // lava bombs
  for (let i = 0; i < 5; i++) { const a = i * 1.3; blob(gp, '#ff7a1a', AX + Math.cos(a) * 0.05, top + 0.03 + H01(i, 61) * 0.04, AZ + Math.sin(a) * 0.05, 0.004).material = mat(GLOW, { emissive: GLOWE, flat: false }); }
  // jungle canopy blobs on Rakata, Sertung and Panjang
  sprinkle(60, 63, 0.49, (x, z) => { const y = hf(x, z); return y > 0.015 && Math.hypot(x - AX, z - AZ) > 0.24; }, (x, z, i) =>
    blob(gp, i % 3 ? '#2f6a2e' : '#3f7d38', x, gy(x, z) + 0.006, z, 0.012, 0.009, 0.012));
  for (const [x, z] of [[-0.34, 0.12], [-0.37, 0.2], [0.33, -0.14], [0.38, 0.0]]) if (hf(x, z) > 0.0) palm(gp, x, gy(x, z), z, 0.05, x * 9);
  // a tourist boat
  const bx = -0.12, bz = 0.3, by = Y0 + WL;
  box(gp, '#f8fafc', bx, by - 0.002, bz, 0.05, 0.008, 0.014, 0.4);
  box(gp, '#2563eb', bx, by + 0.006, bz, 0.03, 0.006, 0.01, 0.4);
  for (let i = 0; i < 3; i++) person(gp, bx - 0.01 + i * 0.01, by + 0.012, bz - i * 0.004, '#f59e0b', 0.8);
};

/**
 * Flat water sheet at height y (above Y0) limited to radius R around (cx, cz): polar grid keeping only triangles
 * where the terrain dips below the surface — for crater lakes and pools that sit above the surrounding ground.
 */
function lakeSheet(gp: THREE.Object3D, h: HFn, cx: number, cz: number, R: number, y: number, paint: VCol): void {
  const RI = 18, SG = 56, pos: number[] = [], col: number[] = [];
  const P = (i: number, j: number): [number, number] => { const r = (R * i) / RI, a = (j / SG) * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  const wy = Y0 + y;
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    if (Math.min(h(a[0], a[1]), h(b[0], b[1]), h(c[0], c[1])) > y) return;
    if (Math.max(Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1]), Math.hypot(c[0], c[1])) > 0.497) return;
    for (const v of [a, b, c]) { pos.push(v[0], wy, v[1]); const k = paint(v[0], y, v[1], 0, 1, 0); col.push(k.r, k.g, k.b); }
  };
  for (let i = 0; i < RI; i++) for (let j = 0; j < SG; j++) {
    const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j), d = P(i + 1, j + 1);
    if (i === 0) tri(a, d, c); else { tri(a, d, c); tri(a, b, d); }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  add(gp, geo, mat('#ffffff', { flat: false, vc: true, rough: 0.2 }), 0, 0, 0, 1, 1, 1);
}

// =========================================================================================================
// Yellowstone — the supervolcano shows itself as heat: on the flat caldera floor the Grand Prismatic Spring glows in
// rings of deep blue, green, yellow and orange with rust-red microbial mats streaming outward, Old Faithful blasts a
// tall white column from its sinter cone, boardwalks thread between them, lodgepole pines and bison all around.
const vo_yellowstone: Builder = gp => {
  const GP = { x: -0.11, z: 0.1, r: 0.13 };
  const OF = { x: 0.2, z: -0.06 };
  const river = (x: number) => 0.3 + 0.05 * Math.sin(x * 9 + 1);
  const hf: HFn = (x, z) => {
    let y = 0.03 + 0.012 * f2(x * 6, z * 6, 3, 1);
    // caldera rim mountains at the back
    const back = sstep(-0.12, -0.38, z + 0.06 * Math.sin(x * 5));
    y += back * (0.13 + 0.09 * r2(x * 7, z * 7, 3, 2));
    // the spring: very shallow terraced dome with a central pool
    const g = Math.hypot(x - GP.x, z - GP.z) / GP.r;
    if (g < 1.6) y = y * sstep(1.0, 1.6, g) + (0.033 - 0.004 * g) * (1 - sstep(1.0, 1.6, g));
    if (g < 0.62) y -= 0.012 * sstep(0.62, 0.45, g);
    // Old Faithful sinter mound
    const o = Math.hypot(x - OF.x, z - OF.z) / 0.07;
    if (o < 1) y = Math.max(y, 0.03 + 0.018 * (1 - o * o));
    // Firehole River cutting across the front
    const rv = Math.abs(z - river(x));
    if (rv < 0.04) y -= 0.016 * sstep(0.04, 0.015, rv);
    return y;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 10, z * 10, 3, 3);
    B('#7c8a52'); L('#6a7a46', n);
    const back = sstep(-0.12, -0.38, z + 0.06 * Math.sin(x * 5));
    L('#3d5a36', back * 0.7);
    if (y > 0.17) LS(sstep(0.17, 0.22, y + 0.03 * n) * (ny > 0.6 ? 1 : 0.4), ny);
    const g = Math.hypot(x - GP.x, z - GP.z) / GP.r, a = Math.atan2(z - GP.z, x - GP.x);
    if (g < 2.0) {
      // radial rust/orange microbial mat fingers spreading out over white sinter
      const fing = n2(a * 7 + 3, g * 1.5) * 0.6 + 0.4 * n2(a * 19, g * 4);
      L('#e7e3d6', sstep(2.0, 1.4, g));
      if (g > 0.75) L(fing > 0.5 ? '#c4581f' : '#d98a2b', sstep(1.0 + fing * 0.9, 0.8 + fing * 0.5, g) * 0.95);
      if (g > 0.6 && g < 0.85) L('#e2b13c', 0.85);
    }
    const o = Math.hypot(x - OF.x, z - OF.z) / 0.07;
    if (o < 1.6) { L('#d8d4c8', sstep(1.6, 1.0, o)); if (o < 0.5) L('#b39a6a', 0.3); }
    // boardwalk-side grey sinter flats around the geyser basin
    if (Math.hypot(x - 0.05, z) < 0.3 && back < 0.1) L('#b9b2a0', sstep(0.6, 0.75, f2(x * 6, z * 6, 2, 9)) * 0.6);
    if (Math.abs(z - river(x)) < 0.035) L('#5a6a4a', 0.3);
    return S(0.94 + 0.08 * ny);
  }, { n: 92, focus: 0.2, strata: ['#6b5a44', '#5a4a3a', '#7a6650', '#4a3e32'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // the hot pool: blue centre → turquoise → green → yellow edge
  lakeSheet(gp, hf, GP.x, GP.z, GP.r * 0.66, 0.0275, (x, _y, z) => {
    const g = Math.hypot(x - GP.x, z - GP.z) / GP.r;
    B('#0e4fa0'); L('#1f86c4', sstep(0.15, 0.35, g)); L('#4fc2c4', sstep(0.35, 0.48, g)); L('#9ccf7a', sstep(0.5, 0.58, g)); L('#e9cf54', sstep(0.58, 0.64, g));
    return W;
  });
  // Firehole River
  lakeSheet(gp, (x, z) => (Math.abs(z - river(x)) < 0.03 ? 0 : 1), 0, 0.26, 0.5, 0.022, sea(() => 0, 0.03, '#4a8fb0', '#2f6f96'));
  // steam over the spring, tinted by the colours below
  const st: number[][] = [];
  for (let i = 0; i < 9; i++) st.push([GP.x + (H01(i, 71) - 0.5) * 0.18, Y0 + 0.05 + H01(i, 72) * 0.05, GP.z + (H01(i, 73) - 0.5) * 0.14, 0.035 + H01(i, 74) * 0.025]);
  puffs(gp, st, '#c9e6f0', { op: 0.22, c2: '#ffffff', sq: 0.6 });
  // Old Faithful: white jet at the base, billowing steam column above
  const oy = gy(OF.x, OF.z) + 0.01;
  add(gp, g('vo:jet', () => new THREE.CylinderGeometry(0.5, 1, 1, 10, 1, true)), mat('#f8fafc', { flat: false, transparent: 0.9 }), OF.x, oy + 0.08, OF.z, 0.016, 0.16, 0.016);
  puffs(gp, column(OF.x, oy + 0.08, OF.z, 0.4, 0.02, 0.06, 12, 75, [0.05, -0.03]), '#f4f6f8', { op: 0.7, c2: '#ffffff' });
  puffs(gp, [[OF.x, oy + 0.01, OF.z, 0.03], [OF.x + 0.03, oy, OF.z + 0.02, 0.022], [OF.x - 0.03, oy, OF.z + 0.015, 0.02]], '#ffffff', { op: 0.55, sq: 0.6 });
  // boardwalks with visitors
  const bw: [number, number][] = [];
  for (let k = 0; k <= 14; k++) { const a = Math.PI * (-0.35 + k * 0.075); bw.push([GP.x + Math.cos(a) * GP.r * 1.55, GP.z + Math.sin(a) * GP.r * 1.55]); }
  const link: [number, number][] = [bw[0], [0.04, -0.02], [OF.x - 0.07, OF.z + 0.03]];
  for (const seg of [...bw.slice(0, -1).map((p, i) => [p, bw[i + 1]]), [link[0], link[1]], [link[1], link[2]]]) {
    const [[ax, az], [bx, bz]] = seg, l = Math.hypot(bx - ax, bz - az);
    box(gp, '#8a6a48', (ax + bx) / 2, Y0 + 0.034, (az + bz) / 2, l + 0.004, 0.003, 0.012, -Math.atan2(bz - az, bx - ax));
  }
  for (let i = 0; i < 7; i++) { const [x, z] = bw[i * 2 + 1]; person(gp, x, Y0 + 0.037, z, ['#ef4444', '#2563eb', '#fbbf24', '#10b981', '#f97316', '#8b5cf6', '#0ea5e9'][i]); }
  // lodgepole pines on the margins and rim
  sprinkle(64, 77, 0.49, (x, z) => Math.hypot(x - GP.x, z - GP.z) > GP.r * 2.1 && Math.hypot(x - OF.x, z - OF.z) > 0.13 && Math.abs(z - river(x)) > 0.05 && (Math.hypot(x, z) > 0.33 || z < -0.15), (x, z, i) => {
    const y = gy(x, z), s = 0.045 + H01(i, 78) * 0.02;
    cyl(gp, '#5a4434', x, y, z, s * 0.04, s * 0.5, 4);
    cone(gp, i % 3 ? '#24432c' : '#2e5236', x, y + s * 0.3, z, s * 0.18, s * 0.75, 6);
  });
  // bison grazing by the river
  for (const [x, z, r] of [[0.12, 0.24, 0.3], [0.2, 0.22, -0.4]]) {
    const y = gy(x, z);
    blob(gp, '#4a3324', x, y + 0.012, z, 0.016, 0.01, 0.009, r);
    blob(gp, '#3a2618', x + Math.cos(r) * 0.013, y + 0.013, z - Math.sin(r) * 0.013, 0.009, 0.01, 0.008, r);
  }
};

// =========================================================================================================
// Changbai Mountain Tianchi — a ring of jagged grey-buff peaks with snow in the gullies encloses the deep blue
// Heavenly Lake; the rim breaks open at the north where the Changbai Waterfall pours out. Alpine tundra outside,
// forest on the lower slopes.
const vo_tianchi: Builder = gp => {
  const CX = 0, CZ = -0.04, RR = 0.27, WLK = 0.2;
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const front = sstep(0.2, 1, Math.sin(a));
    const peakH = (0.37 - 0.16 * front) * (0.72 + 0.42 * f2(Math.cos(a) * 3 + 1, Math.sin(a) * 3, 3, 2) + 0.12 * r2(Math.cos(a) * 6, Math.sin(a) * 6, 2, 3));
    // rim crest profile: steep inner wall, long outer slope
    let y = r < RR ? peakH * Math.exp(-(((r - RR) / 0.085) ** 2)) : peakH * Math.pow(Math.max(0, 1 - (r - RR) / 0.25), 1.15);
    // inner lake basin
    if (r < RR - 0.02) y = Math.min(y, WLK - 0.04 + 0.16 * sstep(RR - 0.12, RR - 0.02, r) * (y > 0.2 ? 1 : 0));
    // outlet notch to the north (front)
    const notch = Math.exp(-(((a - Math.PI / 2) / 0.16) ** 2));
    y -= notch * Math.max(0, y - (WLK - 0.01 - Math.max(0, r - RR) * 0.6)) * 0.95;
    y += (0.004 + y * 0.07) * (r2(x * 16, z * 16, 3, 4) - 0.5);
    const gnd = 0.03 + 0.02 * f2(x * 6, z * 6, 2, 5);
    return smax(y, gnd, 0.04);
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), n = f2(x * 12, z * 12, 3, 6);
    B('#2d5a32'); L('#3f6e3a', n);
    L('#9aa05a', sstep(0.07, 0.13, y + 0.03 * n));
    L('#8a8070', sstep(0.15, 0.24, y + 0.04 * n));
    L('#b5a58a', sstep(0.24, 0.32, y + 0.05 * n) * 0.8);
    if (ny < 0.6) L(Math.sin(y * 260 + n * 4) > 0 ? '#6e6258' : '#9a8a78', 0.6);
    if (r < RR + 0.02 && ny < 0.7) L('#7a6a60', 0.3);
    // late snow in north-facing gullies
    const sn = sstep(0.22, 0.3, y + 0.06 * n) * sstep(0.55, 0.75, r2(x * 14, z * 14, 2, 7)) * (ny > 0.45 ? 1 : 0.3);
    LS(sn, ny);
    return S(0.92 + 0.1 * ny);
  }, { n: 96, focus: 0.15, strata: ['#5a4c40', '#4a3e34', '#6a5a4a', '#3e342c'] });
  lakeSheet(gp, hf, CX, CZ, RR, WLK, (x, _y, z) => {
    const d = WLK - hf(x, z);
    B('#3aa0c0'); L('#174f8f', sstep(0.004, 0.035, d)); L('#123f7a', sstep(0.04, 0.09, d));
    if (Math.sin(z * 180 + Math.sin(x * 30) * 2) > 0.9) L('#cfe8f5', 0.25);
    return W;
  });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Changbai waterfall pouring from the notch down the front
  const wf: [number, number][] = [];
  for (let k = 0; k <= 8; k++) wf.push([CX + Math.sin(k * 0.7) * 0.006, CZ + RR - 0.01 + k * 0.022]);
  lavaRibbon(gp, hf, wf, 0.006, 0.01, 0.004, '#e9f4fb', '#000000');
  puffs(gp, [[wf[8][0], gy(wf[8][0], wf[8][1]) + 0.01, wf[8][1], 0.018], [wf[8][0] + 0.012, gy(wf[8][0], wf[8][1]) + 0.016, wf[8][1] + 0.01, 0.014]], '#f4f8fb', { op: 0.6 });
  // forest on the lower slopes, a weather station and visitors on the western rim
  sprinkle(56, 81, 0.49, (x, z) => hf(x, z) < 0.075 && Math.hypot(x - CX, z - CZ) > 0.33, (x, z, i) =>
    conifer(gp, x, gy(x, z), z, 0.04 + H01(i, 82) * 0.02, i % 3 ? '#21452a' : i % 2 ? '#2f5a37' : '#4a7a3a'));
  const sx = CX - 0.24, sz = CZ + 0.1, sy = gy(sx, sz);
  box(gp, '#e5e7eb', sx, sy, sz, 0.024, 0.016, 0.018, 0.5);
  cone(gp, '#b91c1c', sx, sy + 0.016, sz, 0.017, 0.012, 4, 0.5 + Math.PI / 4);
  rod(gp, [sx + 0.01, sy, sz], [sx + 0.01, sy + 0.04, sz], 0.0012, '#9ca3af', 4);
  for (let i = 0; i < 4; i++) person(gp, sx + 0.03 + i * 0.01, gy(sx + 0.03 + i * 0.01, sz + 0.02), sz + 0.02, ['#ef4444', '#2563eb', '#fbbf24', '#10b981'][i]);
};

// =========================================================================================================
// Teide — the ochre-and-black cone rises from the vast Las Cañadas caldera floor, ringed behind by the old caldera
// cliff; Pico Viejo's wide crater sits on its shoulder, dark lava tongues spill onto the pumice plain, and the
// tree-shaped Roque Cinchado, red tajinaste flower spikes and Canary pines stand in front.
const vo_teide: Builder = gp => {
  const CX = 0.03, CZ = -0.1, R0 = 0.32, H = 0.58;
  const PV = { x: -0.17, z: -0.06 };
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), u = r / R0, a = Math.atan2(dz, dx);
    // two-stage profile: broad base cone + steep El Pilón summit cone
    let y = 0.42 * Math.pow(Math.max(0, 1 - u), 1.3);
    const pil = r / 0.13;
    if (pil < 1) y = smax(y, 0.205 + (H - 0.205) * Math.pow(1 - pil, 1.1), 0.02);
    if (pil < 0.16) y -= 0.012 * (1 - pil / 0.16);
    y -= 0.012 * gully(a, 14, 6) * sstep(0.3, 0.6, u) * Math.max(0, 1 - u);
    // Pico Viejo: wide shoulder crater on the west
    const pv = Math.hypot(x - PV.x, z - PV.z) / 0.16;
    if (pv < 1) { let p = 0.33 * Math.pow(1 - pv, 0.9); if (pv < 0.45) p = 0.33 * Math.pow(0.55, 0.9) - 0.05 * (1 - pv / 0.45); y = smax(y, p, 0.04); }
    // the caldera floor and the Las Cañadas cliff wall behind
    const fl = 0.05 + 0.006 * f2(x * 14, z * 14, 2, 1);
    const R = Math.hypot(x, z), wall = sstep(0.0, -0.5, z / (R + 1e-6)) * sstep(0.41, 0.46, R) * (0.17 + 0.05 * r2(x * 10, z * 10, 2, 2));
    y = Math.max(y, fl, fl + wall);
    y += 0.004 * r2(x * 30, z * 30, 2, 3);
    return y;
  };
  // dark lava tongues fanning onto the floor (angle centre, width)
  const tongues: [number, number][] = [[1.25, 0.1], [1.9, 0.08], [0.55, 0.07], [2.6, 0.09]];
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), n = f2(x * 12, z * 12, 3, 4);
    // pumice floor and cliff
    B('#c9a874'); L('#b08f62', n);
    if (Math.hypot(x, z) > 0.4 && z < 0) { L('#7a5a44', sstep(0.07, 0.12, y)); if (ny < 0.6) L(Math.sin(y * 300) > 0 ? '#6a4a3a' : '#8a6a50', 0.6); }
    // cone: dark basalt base → ochre/tan pumice upper → pale sulphur summit
    const cone_ = sstep(0.07, 0.11, y) * (r < 0.33 || Math.hypot(x - PV.x, z - PV.z) < 0.17 ? 1 : 0);
    L('#4a3a34', cone_ * 0.9);
    L('#a07a4c', sstep(0.3, 0.42, y + 0.05 * n) * (r < 0.15 ? 1 : 0.4));
    L('#d4c49a', sstep(0.52, 0.6, y) * 0.9);
    LS(sstep(0.48, 0.56, y + 0.04 * n) * sstep(0.5, 0.75, gully(a, 14, 6)) * 0.85, ny);
    // black lava tongues
    let tg = 0;
    for (const [ta, tw] of tongues) tg = Math.max(tg, Math.exp(-(((a - ta) / tw) ** 2)) * sstep(0.48, 0.3, r) * (0.7 + 0.4 * n));
    L('#241e1c', tg * sstep(0.45, 0.2, y));
    const pv = Math.hypot(x - PV.x, z - PV.z) / 0.16;
    if (pv < 0.5) L('#7a4a3a', 0.6);
    return S(0.92 + 0.1 * ny);
  }, { n: 96, focus: 0.3, strata: ['#7a5a44', '#6a4a38', '#8a6a50', '#5a4032'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Roque Cinchado: a tilted rock pillar, narrow at the waist, with the Roques ridge beside it
  const rx = 0.22, rz = 0.27, ry = gy(rx, rz);
  const RC = '#8a5a44';
  blob(gp, shade(RC, 0.9), rx, ry + 0.012, rz, 0.02, 0.016, 0.018);
  blob(gp, RC, rx + 0.002, ry + 0.04, rz, 0.011, 0.024, 0.011, 0, 0, 0.1);
  blob(gp, shade(RC, 1.08), rx + 0.008, ry + 0.075, rz, 0.02, 0.022, 0.018, 0.3, 0, 0.15);
  blob(gp, shade(RC, 1.15), rx + 0.012, ry + 0.098, rz, 0.014, 0.01, 0.013);
  for (let k = 0; k < 4; k++) blob(gp, shade(RC, 0.8 + k * 0.08), rx + 0.06 + k * 0.035, ry + 0.02, rz - 0.04 - k * 0.012, 0.022, 0.03 + H01(k, 85) * 0.02, 0.018);
  // red tajinaste flower spikes
  sprinkle(14, 87, 0.47, (x, z) => z > 0.1 && hf(x, z) < 0.07 && Math.hypot(x - rx, z - rz) > 0.06, (x, z, i) => {
    const y = gy(x, z), s = 0.04 + H01(i, 88) * 0.025;
    blob(gp, '#5f7a4a', x, y + 0.004, z, 0.008, 0.005, 0.008);
    cone(gp, i % 4 ? '#c0262d' : '#d9465a', x, y + 0.004, z, 0.006, s, 6);
  });
  // Canary pines on the far rim, a road with a little car
  sprinkle(20, 89, 0.49, (x, z) => Math.hypot(x, z) > 0.42 && z > -0.1, (x, z, i) => conifer(gp, x, gy(x, z), z, 0.045 + H01(i, 90) * 0.015, '#3d6b3a'));
  for (let k = 0; k < 12; k++) { const x = -0.42 + k * 0.07, z = 0.18 + 0.04 * Math.sin(k * 0.8); box(gp, '#3f3f46', x, gy(x, z) + 0.001, z, 0.072, 0.002, 0.014, -0.04 * Math.cos(k * 0.8) * 8); }
  box(gp, '#2563eb', -0.1, gy(-0.1, 0.2) + 0.003, 0.2, 0.014, 0.006, 0.008);
};

// =========================================================================================================
// Pinatubo — the 1991 blast left a 2.5 km caldera now holding a turquoise crater lake inside steep, green-furred
// walls streaked with pale ash; broad grey lahar valleys of volcanic sand radiate out across the lowlands.
const vo_pinatubo: Builder = gp => {
  const CX = 0, CZ = -0.08, RC = 0.19;
  const rimH = (a: number) => 0.28 + 0.05 * r2(Math.cos(a) * 2.2 + 3, Math.sin(a) * 2.2, 2, 1) - 0.07 * Math.exp(-(((a - 1.75) / 0.5) ** 2));
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), rh = rimH(a);
    let y: number;
    if (r < RC) y = 0.1 + (rh - 0.1) * Math.pow(sstep(RC * 0.7, RC, r), 1.3);
    else {
      y = rh * Math.pow(Math.max(0, 1 - (r - RC) / 0.33), 1.6);
      y -= 0.035 * gully(a, 8, 3) * sstep(RC + 0.02, RC + 0.14, r) * sstep(0.5, 0.25, r);
      y += 0.012 * r2(x * 18, z * 18, 2, 2) * sstep(RC + 0.25, RC, r);
    }
    return smax(y, 0.012 + 0.01 * f2(x * 8, z * 8, 2, 4), 0.03);
  };
  const LW = 0.17;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), n = f2(x * 12, z * 12, 3, 5);
    B('#2f6a2e'); L('#4c8a3a', n);
    if (r < RC + 0.01) {
      // inner caldera wall: forest on gentle ledges, pale ash-tan cliffs on steep faces
      if (ny < 0.72) { B(Math.sin(y * 300 + n * 5) > 0 ? '#b3a58a' : '#8f8370'); L('#5f8a45', sstep(0.6, 0.72, ny) * 0.8); }
      L('#d8d2bf', sstep(LW + 0.012, LW, y) * 0.8);
      return S(0.9 + 0.12 * ny);
    }
    // lahar valleys: wide grey sand floors following the gullies, widening downslope
    const lah = gully(a, 8, 3) * sstep(RC + 0.03, RC + 0.12, r);
    L('#a39e92', sstep(0.45, 0.75, lah + 0.15 * (n - 0.5)));
    L('#bdb7a8', sstep(0.035, 0.015, y) * sstep(0.1, 0.4, z) * sstep(0.3, 0.6, n + 0.3));
    if (ny < 0.75) L('#8a7a62', 0.5);
    return S(0.9 + 0.12 * ny);
  }, { n: 90, focus: 0.3, strata: ['#6b5f50', '#5a4f44', '#857867', '#4a4038'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  lakeSheet(gp, hf, CX, CZ, RC, LW, (x, _y, z) => {
    const d = LW - hf(x, z);
    B('#7fd6c4'); L('#2fa8a8', sstep(0.004, 0.04, d)); L('#1f7f94', sstep(0.04, 0.07, d));
    if (Math.sin(z * 200 + n2(x * 30, z * 30) * 4) > 0.86) L('#e2fbf6', 0.3);
    return W;
  });
  // fumarole wisps on the lake shore, a bamboo raft, hikers on the rim trail
  puffs(gp, column(CX + 0.12, Y0 + LW + 0.01, CZ - 0.08, 0.07, 0.012, 0.03, 5, 21, [0.03, -0.02]), '#f2f4f6', { op: 0.45, c2: '#ffffff' });
  const fx = CX - 0.02, fz = CZ + 0.06, fy = Y0 + LW;
  box(gp, '#b9965a', fx, fy - 0.001, fz, 0.04, 0.004, 0.018, 0.3);
  person(gp, fx - 0.008, fy + 0.003, fz, '#dc2626', 0.9); person(gp, fx + 0.01, fy + 0.003, fz - 0.002, '#2563eb', 0.9);
  for (let i = 0; i < 4; i++) { const a = 1.25 + i * 0.09, x = CX + Math.cos(a) * (RC + 0.012), z = CZ + Math.sin(a) * (RC + 0.012); person(gp, x, gy(x, z), z, ['#f59e0b', '#16a34a', '#ef4444', '#3b82f6'][i]); }
  // forest canopy on the outer slopes (avoiding the lahar valleys)
  sprinkle(70, 23, 0.49, (x, z) => {
    const r = Math.hypot(x - CX, z - CZ), a = Math.atan2(z - CZ, x - CX);
    return r > RC + 0.02 && gully(a, 8, 3) < 0.4 && hf(x, z) > 0.02;
  }, (x, z, i) => blob(gp, i % 3 ? '#2b5f2a' : '#3d7a34', x, gy(x, z) + 0.006, z, 0.012, 0.008, 0.012));
  // jeeps crossing the lahar plain
  for (const [x, z, r, c] of [[0.1, 0.4, 0.4, '#e5e7eb'], [0.16, 0.36, 0.5, '#dc2626']] as [number, number, number, string][]) {
    const y = gy(x, z) + 0.002;
    box(gp, c, x, y, z, 0.024, 0.009, 0.012, r);
    box(gp, '#334155', x - 0.003, y + 0.009, z, 0.012, 0.005, 0.011, r);
  }
};

// =========================================================================================================
// Eyjafjallajökull — a broad ice-capped ridge whose outlet glaciers spill down gullies; in 2010 a dark grey-brown
// ash column punched up through the ice. Below lie emerald pastures, a red-roofed farm under the old sea cliff with a
// waterfall, a black braided outwash plain and the North Atlantic.
const vo_eyjafjallajokull: Builder = gp => {
  const MX = 0.02, MZ = -0.13, VX = 0.03, VZ = -0.15;
  const ell = (x: number, z: number) => Math.hypot((x - MX) / 0.44, (z - MZ) / 0.3);
  const hf: HFn = (x, z) => {
    const e = ell(x, z), a = Math.atan2(z - MZ, x - MX);
    let y = 0.36 * Math.pow(Math.max(0, 1 - e * e), 1.25);
    y -= 0.04 * gully(a, 9, 4) * sstep(0.35, 0.75, e) * sstep(1.1, 0.75, e);
    y += 0.012 * r2(x * 16, z * 16, 3, 5) * sstep(0.4, 0.8, e);
    const vd = Math.hypot(x - VX, z - VZ);
    y -= 0.03 * sstep(0.07, 0.02, vd);
    // the old coastline: a cliffed terrace across the middle, lowland and beach below it
    const cliffZ = 0.1 + 0.03 * Math.sin(x * 9);
    let gnd = 0.016 + 0.006 * f2(x * 10, z * 10, 2, 6) + 0.06 * sstep(cliffZ + 0.025, cliffZ, z);
    const sea = sstep(0.36, 0.41, z + 0.02 * Math.sin(x * 5));
    gnd = gnd * (1 - sea) - 0.02 * sea;
    return smax(y, gnd, 0.03);
  };
  const WL = 0.004;
  const tongue = (x: number, z: number) => {
    // two outlet glaciers following gullies down to the front
    const a = Math.atan2(z - MZ, x - MX), g = gully(a, 9, 4);
    return g * (Math.exp(-(((a - 1.25) / 0.22) ** 2)) + Math.exp(-(((a - 2.15) / 0.2) ** 2)));
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 3, 7), e = ell(x, z);
    if (y < WL + 0.004) { B('#1e1d1d'); return L('#3a3838', n); }
    // pasture vs black sandur (outwash plain) on the right
    B('#5f9a3a'); L('#7cb04a', n * 0.7);
    const sandur = sstep(0.0, 0.12, x - 0.05 + 0.1 * n) * sstep(0.12, 0.2, z) * sstep(0.05, 0.03, y);
    L('#2c2a29', sandur);
    if (ny < 0.6) { B(Math.sin(y * 260 + n * 4) > 0 ? '#5a4c42' : '#3e3632'); L('#4f7a35', sstep(0.5, 0.6, ny)); }
    // moss and scree on the mountain
    L('#6f6a4a', sstep(0.06, 0.14, y) * 0.6);
    L('#4a4440', sstep(0.12, 0.2, y) * 0.6);
    // ice cap + tongues with ash-dirtied surface near the vent
    const ice = Math.max(sstep(0.17, 0.21, y + 0.03 * n), sstep(0.35, 0.6, tongue(x, z)) * sstep(0.05, 0.1, y));
    LS(ice, ny, '#eef4f8', '#b4c6d8');
    if (ice > 0.5 && Math.sin((e * 60 + n * 3)) > 0.9) L('#9fb4c8', 0.4);
    const vd = Math.hypot(x - VX, z - VZ);
    L('#6b625a', sstep(0.16, 0.05, vd + 0.04 * n) * 0.85);
    if (vd < 0.04) L('#3a302c', 0.7);
    return S(0.92 + 0.1 * ny);
  }, { n: 92, focus: 0.25, wl: WL, water: sea(hf, WL, '#5f9fb0', '#25567a'), strata: ['#3a3532', '#2a2726', '#4a423c', '#5a4e44'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // the ash plume: dark and dense at the vent, billowing brown-grey, bent by the wind
  const vy = gy(VX, VZ);
  puffs(gp, column(VX, vy + 0.02, VZ, 0.34, 0.03, 0.085, 10, 31, [0.16, -0.06]), '#3f3934', { c2: '#9a9088', sq: 0.85 });
  add(gp, DISC(), mat(GLOW, { emissive: GLOWE, flat: false }), VX, vy + 0.004, VZ, 0.016, 1, 0.016);
  puffs(gp, [[VX - 0.02, vy + 0.02, VZ + 0.01, 0.02], [VX + 0.02, vy + 0.015, VZ - 0.01, 0.018]], '#f2f4f6', { op: 0.6 });
  // braided glacial rivers across the sandur
  const riv = (P: [number, number][], w: number) => lavaRibbon(gp, hf, P, w, w * 1.4, 0.0015, '#9cb9c6', '#000000');
  riv([[0.12, 0.16], [0.16, 0.24], [0.14, 0.31], [0.19, 0.39]], 0.004);
  riv([[0.2, 0.15], [0.22, 0.22], [0.27, 0.28], [0.26, 0.37]], 0.004);
  riv([[0.16, 0.24], [0.22, 0.27], [0.27, 0.28]], 0.003);
  // Seljalandsfoss-style waterfall off the old sea cliff, with spray
  const wx = -0.3, wz0 = 0.1 + 0.03 * Math.sin(-0.3 * 9) - 0.012, top = gy(wx, wz0 - 0.01), bot = gy(wx, wz0 + 0.04);
  box(gp, '#e9f4fa', wx, bot, wz0 + 0.018, 0.012, top - bot, 0.003);
  puffs(gp, [[wx, bot + 0.008, wz0 + 0.035, 0.016], [wx + 0.01, bot + 0.014, wz0 + 0.04, 0.012]], '#ffffff', { op: 0.55 });
  riv([[wx, wz0 + 0.04], [wx + 0.02, 0.22], [wx - 0.01, 0.3], [wx + 0.01, 0.38]], 0.003);
  // Þorvaldseyri-style farm: white houses with red roofs, a barn, hay bales; sheep in the field
  for (const [x, z, w, ry, wall, roof] of [[-0.12, 0.22, 0.03, 0.1, '#f4f4f0', '#c2271d'], [-0.08, 0.25, 0.026, 0.1, '#f4f4f0', '#c2271d'], [-0.15, 0.27, 0.036, -0.1, '#9a3a2a', '#5a5a60']] as [number, number, number, number, string, string][])
    house(gp, x, gy(x, z), z, w, ry, wall, roof);
  for (let i = 0; i < 5; i++) { const x = -0.04 + i * 0.012, z = 0.3; blob(gp, '#f1f1ea', x, gy(x, z) + 0.004, z, 0.005, 0.004, 0.005); }
  sprinkle(14, 33, 0.4, (x, z) => z > 0.16 && z < 0.34 && x < -0.0 && x > -0.36, (x, z) => blob(gp, '#f3f3ee', x, gy(x, z) + 0.005, z, 0.006, 0.0045, 0.0045));
  // the Ring Road
  lavaRibbon(gp, hf, [[-0.45, 0.33], [-0.2, 0.32], [0.0, 0.33], [0.2, 0.34], [0.42, 0.3]], 0.004, 0.004, 0.0015, '#5a5a5e', '#000000');
};

// =========================================================================================================
// Cotopaxi — a textbook symmetrical cone with a flat-topped summit crater and a thick glacier cap whose lower edge
// is sharply scalloped; reddish-brown scoria below, golden páramo grassland, Limpiopungo lagoon and grazing llamas.
const vo_cotopaxi: Builder = gp => {
  const CX = 0.02, CZ = -0.07, R0 = 0.4, H = 0.62;
  const prof = (u: number) => { const s = Math.max(0, 1 - u); return H * Math.pow(s, 1.55) * (1.05 - 0.05 * s); };
  const LG = { x: -0.25, z: 0.27 };
  const lgE = (x: number, z: number) => ((x - LG.x) / 0.1) ** 2 + ((z - LG.z) / 0.06) ** 2;
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    let y = u < 0.1 ? prof(0.1) + 0.006 : prof(u);
    if (u < 0.075) y -= 0.05 * sstep(0.075, 0.05, u);
    y -= 0.016 * gully(a, 17, 6) * sstep(0.1, 0.3, u) * Math.max(0, 1 - u) ** 0.6;
    const gnd = 0.015 + 0.01 * f2(x * 7, z * 7, 3, 7) + 0.04 * sstep(-0.1, -0.45, z + 0.2 * Math.sin(x * 4)) * f2(x * 5, z * 5, 2, 8);
    y = smax(y, gnd, 0.05);
    const e = lgE(x, z);
    if (e < 2.5) { const k = sstep(0.5, 2.2, e); y = y * k - 0.006 * (1 - k); }
    return y;
  };
  const WL = 0.006;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    const t = y / H, n = f2(x * 12, z * 12, 3, 9);
    // golden páramo with greener wet hollows and dark lahar sand
    B('#b39f5a'); L('#8f9a4a', n); L('#c7b16a', sstep(0.6, 0.8, n2(x * 30, z * 30)) * 0.5);
    L('#4a4440', sstep(0.6, 0.75, f2(x * 5 + 4, z * 5, 2, 10)) * sstep(0.05, 0.02, t) * 0.6);
    // scoria: reddish-brown to dark grey bands up the cone
    L('#7a5240', sstep(0.04, 0.12, t));
    L('#5a3d32', sstep(0.2, 0.32, t + 0.05 * n) * 0.8);
    L('#4a4342', sstep(0.38, 0.48, t) * 0.7);
    L('#2a2524', gully(a, 17, 6) * sstep(0.2, 0.4, t) * 0.35);
    // glacier cap: sharp scalloped lower edge, tongues down the gullies, crevasse bands
    const edge = 0.6 - 0.07 * gully(a, 17, 6) + 0.03 * (n - 0.5) + 0.03 * Math.sin(a * 5);
    const ice = sstep(edge - 0.01, edge + 0.01, t) * (u > 0.065 ? 1 : 0);
    LS(ice, ny, '#f6f9fc', '#c2d0e2');
    if (ice > 0.5 && Math.sin(t * 160 + Math.sin(a * 9) * 2) > 0.88) L('#8fa8c8', 0.45);
    if (u < 0.075) { B('#3a3230'); L('#5a4a40', n); }
    return S(0.9 + 0.12 * ny);
  }, { n: 94, focus: 0.35, wl: WL, water: sea(hf, WL, '#6aa8b8', '#2f6f8e'), strata: ['#5a4334', '#4a382e', '#6a5242', '#3b2d26'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // faint fumarole steam above the crater
  puffs(gp, column(CX, Y0 + prof(0.1), CZ, 0.08, 0.018, 0.035, 5, 41, [0.05, -0.01]), '#f4f6f8', { op: 0.65, c2: '#ffffff' });
  // José Rivas refuge on the north (front) slope
  const rx = CX + 0.01, rz = CZ + R0 * 0.43, ry = gy(rx, rz);
  house(gp, rx, ry, rz, 0.024, 0.1, '#f3e8d8', '#b91c1c', 0.014);
  for (let i = 0; i < 3; i++) person(gp, rx + 0.02 + i * 0.008, gy(rx + 0.02 + i * 0.008, rz - 0.03 - i * 0.02), rz - 0.03 - i * 0.02, ['#f97316', '#2563eb', '#facc15'][i], 0.9);
  // llamas grazing near the lagoon
  const llama = (x: number, z: number, ry: number, c: string) => {
    const y = gy(x, z), ca = Math.cos(ry), sa = Math.sin(ry);
    blob(gp, c, x, y + 0.012, z, 0.009, 0.006, 0.005, -ry);
    rod(gp, [x + ca * 0.007, y + 0.014, z - sa * 0.007], [x + ca * 0.011, y + 0.028, z - sa * 0.011], 0.0025, c, 4);
    blob(gp, c, x + ca * 0.013, y + 0.029, z - sa * 0.013, 0.0035, 0.003, 0.0025, -ry);
    for (const s of [-1, 1]) for (const f of [-1, 1]) rod(gp, [x + ca * 0.005 * f + sa * 0.002 * s, y + 0.008, z - sa * 0.005 * f + ca * 0.002 * s], [x + ca * 0.005 * f + sa * 0.002 * s, y, z - sa * 0.005 * f + ca * 0.002 * s], 0.0012, '#3a2e26', 3);
  };
  for (const [x, z, r, c] of [[-0.12, 0.3, 0.4, '#f1ece2'], [-0.08, 0.34, 2.8, '#8a5a3a'], [-0.15, 0.37, 1.2, '#d9c6a6'], [-0.05, 0.27, -0.3, '#3a2e28']] as [number, number, number, string][]) llama(x, z, r, c);
  // páramo tussocks and a few flowering chuquiragua shrubs
  sprinkle(40, 43, 0.49, (x, z) => hf(x, z) < 0.04 && lgE(x, z) > 1.6 && Math.hypot(x, z) > 0.32, (x, z, i) =>
    blob(gp, i % 4 ? '#a8924e' : '#d08a2a', x, gy(x, z) + 0.004, z, 0.007, 0.005, 0.007));
};

// =========================================================================================================
// Mount Erebus — Antarctica's southernmost active volcano: a massive, broad, snow-buried shield-cone with dark rock
// buttresses, a summit crater holding a persistent lava lake, a streaming steam plume, fumarolic ice towers, and the
// frozen Ross Sea in front with Adélie penguins and a research hut.
const vo_erebus: Builder = gp => {
  const CX = -0.02, CZ = -0.1, R0 = 0.48, H = 0.5;
  const TR = { x: 0.32, z: -0.3 };
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, u = Math.hypot(dx, dz) / R0, a = Math.atan2(dz, dx);
    let y = H * (0.62 * Math.pow(Math.max(0, 1 - u), 1.05) + 0.38 * Math.pow(Math.max(0, 1 - u / 0.32), 1.6));
    if (u < 0.07) y -= 0.05 * sstep(0.07, 0.045, u);
    if (u < 0.03) y -= 0.01;
    y -= 0.014 * gully(a, 10, 7) * sstep(0.25, 0.6, u) * sstep(1, 0.7, u);
    y += 0.01 * r2(x * 14, z * 14, 3, 8) * sstep(0.15, 0.5, u);
    // Mount Terror shoulder behind-right
    const td = Math.hypot(x - TR.x, z - TR.z);
    y = smax(y, 0.24 * Math.pow(Math.max(0, 1 - td / 0.26), 1.4), 0.04);
    const ice = sstep(0.2, 0.32, z);
    const gnd = 0.012 + 0.006 * f2(x * 8, z * 8, 2, 9);
    y = smax(y, gnd, 0.03);
    return y * (1 - ice) + ice * 0.008;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 3, 11);
    if (z > 0.27 && y < 0.012) {
      // sea ice with pressure ridges and a dark open lead
      B('#e4eef6'); L('#c8dbea', n * 0.6);
      const lead = Math.abs(z - 0.38 - 0.05 * Math.sin(x * 9));
      if (lead < 0.008) { B('#1d3f5c'); L('#2f5f80', n); }
      if (Math.sin(x * 80 + z * 30 + n * 5) > 0.95) L('#ffffff', 0.6);
      return W;
    }
    LS(1, ny, '#f5f8fb', '#bccbdc');
    // exposed dark lava rock on steep buttresses and wind-scoured ridges
    const rock = sstep(0.8, 0.65, ny + 0.12 * (n - 0.5)) + sstep(0.8, 0.9, r2(x * 14, z * 14, 2, 12)) * sstep(0.12, 0.25, y) * 0.7;
    L(Math.sin(y * 300) > 0 ? '#3a3433' : '#2a2525', clamp(rock) * sstep(0.22, 0.12, z));
    const u = Math.hypot(x - CX, z - CZ) / R0;
    if (u < 0.075) { B('#3a302c'); L('#5a4038', n); }
    if (u > 0.06 && u < 0.11) L('#d8c9a6', 0.25);
    return S(0.95 + 0.06 * ny);
  }, { n: 94, focus: 0.3, strata: ['#3a3836', '#2a2928', '#4a4642', '#e8eef4'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // summit lava lake and the drifting steam plume
  const ly = Y0 + hf(CX, CZ) + 0.006;
  lavaLake(gp, CX, ly, CZ, 0.022, 0.018, 5, 0.55, 0.012);
  puffs(gp, column(CX, ly + 0.03, CZ, 0.22, 0.03, 0.07, 9, 51, [0.18, -0.04]), '#f3f5f8', { op: 0.7, c2: '#ffffff' });
  // fumarolic ice towers on the summit plateau
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3, r = 0.05 + H01(i, 52) * 0.04, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r, y = gy(x, z);
    cone(gp, '#eef4f9', x, y, z, 0.007, 0.02 + H01(i, 53) * 0.015, 6);
    if (i % 3 === 0) puffs(gp, [[x, y + 0.03, z, 0.008], [x + 0.006, y + 0.042, z, 0.01]], '#ffffff', { op: 0.6 });
  }
  // Adélie penguins on the sea ice
  const peng = (x: number, z: number, ry: number) => {
    const y = gy(x, z) + 0.002;
    blob(gp, '#1f2327', x, y + 0.008, z, 0.0045, 0.008, 0.004, ry);
    blob(gp, '#f4f4f0', x + Math.sin(ry) * 0.002, y + 0.007, z + Math.cos(ry) * 0.002, 0.0035, 0.006, 0.003, ry);
    blob(gp, '#1f2327', x, y + 0.017, z, 0.0032);
    blob(gp, '#f59e0b', x + Math.sin(ry) * 0.004, y + 0.016, z + Math.cos(ry) * 0.004, 0.0012);
  };
  for (let i = 0; i < 9; i++) peng(-0.22 + (i % 5) * 0.022 + H01(i, 54) * 0.01, 0.32 + Math.floor(i / 5) * 0.025 + H01(i, 55) * 0.008, H01(i, 56) * 1.2 - 0.6);
  // a field hut, sledge and a scientist
  const hx = 0.2, hz = 0.24, hy = gy(hx, hz);
  box(gp, '#2f6a3e', hx, hy, hz, 0.04, 0.018, 0.024, -0.3);
  cyl(gp, '#c2271d', hx + 0.04, hy, hz + 0.02, 0.01, 0.014, 10);
  box(gp, '#c2271d', hx + 0.006, hy + 0.018, hz, 0.044, 0.003, 0.028, -0.3);
  box(gp, '#8a6a4a', hx - 0.02, hy, hz + 0.05, 0.03, 0.004, 0.01, 0.2);
  person(gp, hx - 0.04, hy, hz + 0.04, '#ef4444');
};

// =========================================================================================================
// Nyiragongo — a steep, forest-skirted cone whose vast summit crater steps down in black terraces to the world's
// largest lava lake, churning orange under a glowing steam column; 2002 lava flows run down to Goma and Lake Kivu.
const vo_nyiragongo: Builder = gp => {
  const CX = 0, CZ = -0.09, R0 = 0.4, H = 0.55, CR = 0.13;
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), u = r / R0, a = Math.atan2(dz, dx);
    let y = H * Math.pow(Math.max(0, 1 - u), 1.25);
    const top = H * Math.pow(1 - CR / R0, 1.25) + 0.008 * r2(Math.cos(a) * 3, Math.sin(a) * 3, 2, 3) - 0.055 * sstep(0.2, 1, Math.sin(a));
    if (r < CR) {
      const s = r / CR;
      y = top - 0.045 * sstep(1.0, 0.9, s) - 0.03 * sstep(0.76, 0.68, s) - 0.03 * sstep(0.54, 0.48, s);
      y += 0.003 * f2(x * 50, z * 50, 2, 4);
    } else y = Math.min(y, top + 0.01);
    y -= 0.014 * gully(a, 14, 8) * sstep(CR / R0 + 0.05, 0.6, u) * Math.max(0, 1 - u);
    // Baruta parasitic cone on the front-right flank
    y = cinder(y, x, z, 0.24, 0.12, 0.07, 0.06, 0.35);
    let gnd = 0.016 + 0.01 * f2(x * 7, z * 7, 3, 9);
    const lake = sstep(0.34, 0.39, z + 0.03 * Math.sin(x * 6));
    gnd = gnd * (1 - lake) - 0.02 * lake;
    return smax(y, gnd, 0.04);
  };
  const WL = 0.004;
  const flows: [number, number][][] = [[[-0.08, 0.02], [-0.1, 0.12], [-0.14, 0.22], [-0.13, 0.33]], [[0.09, 0.0], [0.12, 0.1], [0.08, 0.2], [0.1, 0.31]]];
  const nf = (x: number, z: number) => {
    let d = 9;
    for (const P of flows) for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], ex = bx - ax, ez = bz - az;
      const f = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez));
      d = Math.min(d, Math.hypot(x - ax - ex * f, z - az - ez * f) - 0.012 - 0.02 * f2(x * 20, z * 20, 2, 10));
    }
    return d;
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const r = Math.hypot(x - CX, z - CZ), n = f2(x * 12, z * 12, 3, 13);
    if (y < WL + 0.004) { B('#2a2522'); return L('#4a403a', n); }
    if (r < CR) {
      B(ny > 0.85 ? '#2c2624' : (Math.sin(y * 400) > 0 ? '#4a3a34' : '#2a2220')); L('#6a2a14', sstep(0.6, 0.2, r / CR) * 0.25 * (ny > 0.85 ? 1 : 0));
      if (ny > 0.85 && n2(x * 70, z * 70) > 0.72) L('#c9b24a', 0.4);
      return W;
    }
    // dense montane forest → heath → bare dark cone
    const t = y / H;
    B('#2b5a2a'); L('#3f7a36', n);
    L('#5a6a3a', sstep(0.32, 0.45, t + 0.08 * n));
    L('#3a3230', sstep(0.48, 0.6, t + 0.06 * n));
    L('#5a4a44', sstep(0.65, 0.8, t) * 0.5);
    if (ny < 0.6) L('#3a3230', 0.6);
    // the 2002 black lava flows through farmland
    L('#1e1a19', sstep(0.01, -0.005, nf(x, z)));
    L('#8a6a3a', sstep(0.04, 0.0, y) * sstep(0.15, 0.25, z) * sstep(0.4, 0.6, n2(x * 25, z * 25)) * 0.5);
    return S(0.9 + 0.12 * ny);
  }, { n: 94, focus: 0.3, wl: WL, water: sea(hf, WL, '#3f8a9a', '#1f4f6a'), strata: ['#3a2e28', '#2a2320', '#4a3a30', '#5a4636'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // the lava lake with crust plates, fountains at the edge and orange-lit steam
  const ly = Y0 + hf(CX, CZ) + 0.004;
  lavaLake(gp, CX, ly, CZ, CR * 0.5, CR * 0.5, 7, 0.6, 0.016);
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4, x = CX + Math.cos(a) * CR * 0.4, z = CZ + Math.sin(a) * CR * 0.4; puffs(gp, [[x, ly + 0.006, z, 0.006], [x, ly + 0.012, z, 0.004]], GLOW, { glow: GLOWE }); }
  puffs(gp, column(CX + 0.01, ly + 0.09, CZ - 0.02, 0.22, 0.03, 0.07, 8, 61, [0.06, -0.08]), '#ffb07a', { op: 0.55, c2: '#f2f0ee' });
  // Goma's tin-roofed houses along the lakeshore, banana groves, boats on Lake Kivu
  sprinkle(16, 63, 0.48, (x, z) => z > 0.22 && z < 0.33 && Math.abs(x) < 0.4 && nf(x, z) > 0.02, (x, z, i) =>
    house(gp, x, gy(x, z), z, 0.018 + H01(i, 64) * 0.008, H01(i, 65) * 0.5, i % 3 ? '#d9cbb0' : '#c97b5a', i % 2 ? '#8a9aa6' : '#9a5a3a', 0.012));
  sprinkle(26, 67, 0.48, (x, z) => z > 0.08 && z < 0.24 && nf(x, z) > 0.03 && hf(x, z) < 0.05, (x, z, i) => palm(gp, x, gy(x, z), z, 0.035 + H01(i, 68) * 0.01, i));
  for (const [x, z] of [[-0.05, 0.43], [0.18, 0.41]]) { box(gp, '#7a5a3a', x, Y0 + WL - 0.001, z, 0.03, 0.005, 0.008, 0.3); person(gp, x, Y0 + WL + 0.004, z, '#f59e0b', 0.8); }
};

// =========================================================================================================
// Erta Ale — a low, black basalt shield rising out of the scorching Danakil salt desert. Its elongated summit
// caldera holds a pit crater with a bubbling lava lake: dark crust plates split by glowing cracks, lava splashing
// at the rim, hornitos puffing on the caldera floor and a camel caravan on the salt.
const vo_ertaale: Builder = gp => {
  const CX = 0.0, CZ = -0.06;
  const cal = (x: number, z: number) => Math.hypot((x - CX) / 0.22, (z - CZ) / 0.14);
  const PX = 0.05, PZ = -0.05, PR = 0.08;
  const hf: HFn = (x, z) => {
    const s = Math.hypot((x - CX) / 0.62, (z - CZ) / 0.42);
    let y = 0.19 * Math.pow(Math.max(0, 1 - s), 1.1);
    y += 0.005 * r2(x * 30, z * 30, 2, 1) * sstep(1, 0.6, s);
    const c = cal(x, z);
    const fl = 0.15 + 0.003 * f2(x * 40, z * 40, 2, 2);
    if (c < 1.15) { const k = sstep(0.9, 1.08, c); y = y * k + fl * (1 - k); }
    const p = Math.hypot((x - PX) / 1.2, z - PZ) / PR;
    if (p < 1.2) y -= 0.04 * sstep(1.15, 0.92, p);
    // hornitos on the caldera floor
    for (const [hx, hz] of [[-0.09, -0.04], [-0.06, -0.1], [-0.12, -0.08]]) y = cinder(y, x, z, hx, hz, 0.018, 0.016, 0.3);
    return smax(y, 0.012 + 0.003 * f2(x * 10, z * 10, 2, 3), 0.02);
  };
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 3, 4);
    if (y < 0.018) {
      // salt flats (white crusted polygons) and tan sand
      B('#dac9a2'); L('#c9b48a', n);
      const sp = sstep(0.18, 0.3, z + 0.1 * n) + sstep(0.25, 0.35, -x - 0.2 * n) * 0.8;
      L('#f2eee2', clamp(sp));
      const px = x * 45 + n2(z * 8, 2), pz = z * 45 + n2(x * 8, 3);
      if (sp > 0.5 && (Math.abs(px - Math.round(px)) < 0.06 || Math.abs(pz - Math.round(pz)) < 0.06)) L('#c8bfa8', 0.6);
      return W;
    }
    // fresh black pāhoehoe with silver sheen, older brown flows lower down
    B('#1c1a1a'); L('#2e2a28', n);
    L('#5a5a62', sstep(0.6, 0.8, f2(x * 30, z * 30, 2, 9)) * 0.35);
    L('#5a4636', sstep(0.6, 0.75, f2(x * 5, z * 5 + 3, 2, 5)) * sstep(0.06, 0.03, y) * 0.7);
    const c = cal(x, z);
    if (c > 0.85 && c < 1.12 && ny < 0.8) L(Math.sin(y * 500) > 0 ? '#4a3a32' : '#2a2422', 0.9);
    const p = Math.hypot((x - PX) / 1.2, z - PZ) / PR;
    if (p < 1.4) L('#c9b24a', sstep(1.45, 1.1, p) * 0.35);
    if (p < 1.0) B(Math.sin(y * 600) > 0 ? '#3a2620' : '#1e1614');
    return S(0.9 + 0.12 * ny);
  }, { n: 92, focus: 0.3, strata: ['#c9b48a', '#a8916a', '#d9c9a2', '#8a7456'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  const ly = Y0 + hf(PX, PZ) + 0.006;
  lavaLake(gp, PX, ly, PZ, PR * 1.1, PR * 0.86, 9, 0.7, 0.014);
  // splashes of lava at the pit rim
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3, x = PX + Math.cos(a) * PR * 0.95, z = PZ + Math.sin(a) * PR * 0.75;
    puffs(gp, [[x, ly + 0.006, z, 0.006], [x + 0.003, ly + 0.013, z, 0.004], [x - 0.002, ly + 0.019, z, 0.0025]], GLOW, { glow: GLOWE });
  }
  puffs(gp, column(PX, ly + 0.02, PZ, 0.18, 0.03, 0.06, 8, 71, [-0.06, -0.08]), '#ffb488', { op: 0.5, c2: '#f4f2f0' });
  for (const [hx, hz] of [[-0.09, -0.04], [-0.12, -0.08]]) puffs(gp, column(hx, gy(hx, hz) + 0.02, hz, 0.05, 0.008, 0.016, 4, hx * 100, [-0.02, -0.02]), '#f2f2f2', { op: 0.55 });
  // visitors at the caldera edge and the Afar camel caravan crossing the salt
  for (let i = 0; i < 4; i++) { const x = PX - 0.02 + i * 0.012, z = PZ + PR + 0.03; person(gp, x, gy(x, z), z, ['#f97316', '#2563eb', '#16a34a', '#facc15'][i], 0.9); }
  const camel = (x: number, z: number, load: boolean) => {
    const y = gy(x, z);
    blob(gp, '#b98a56', x, y + 0.016, z, 0.011, 0.006, 0.005);
    blob(gp, '#a87a4a', x - 0.001, y + 0.022, z, 0.005, 0.004, 0.004);
    rod(gp, [x + 0.009, y + 0.018, z], [x + 0.016, y + 0.026, z], 0.0022, '#b98a56', 4);
    blob(gp, '#a87a4a', x + 0.018, y + 0.026, z, 0.004, 0.0025, 0.0025);
    for (const fx of [-0.007, 0.007]) for (const fz of [-0.0025, 0.0025]) rod(gp, [x + fx, y + 0.013, z + fz], [x + fx, y, z + fz], 0.0012, '#8a6440', 3);
    if (load) box(gp, '#f4f1e8', x - 0.001, y + 0.024, z, 0.012, 0.006, 0.012);
  };
  for (let i = 0; i < 5; i++) camel(-0.3 + i * 0.045, 0.36 + i * 0.012, i % 2 === 0);
  person(gp, -0.34, gy(-0.34, 0.355), 0.355, '#e5e7eb');
};

// =========================================================================================================
// Sakurajima — one of the world's most active volcanoes, a twin-peaked cone filling Kagoshima Bay: Kitadake behind,
// Minamidake's crater in front puffing grey ash. The 1914 lava field joins it to the Ōsumi mainland on the right;
// Kagoshima city and its ferry face it across the water.
const vo_sakurajima: Builder = gp => {
  const KX = -0.02, KZ = -0.12, MX = 0.02, MZ = -0.04;
  const isl = (x: number, z: number) => Math.hypot((x - 0.0) / 0.28, (z + 0.07) / 0.24);
  const hf: HFn = (x, z) => {
    const e = isl(x, z), a = Math.atan2(z + 0.07, x);
    let y = 0.06 * Math.pow(Math.max(0, 1 - e), 0.8) - 0.03;
    const kd = Math.hypot(x - KX, z - KZ) / 0.24, md = Math.hypot(x - MX, z - MZ) / 0.2;
    y = smax(y, 0.38 * Math.pow(Math.max(0, 1 - kd), 1.5) - 0.02, 0.04);
    y = smax(y, 0.3 * Math.pow(Math.max(0, 1 - md), 1.4) - 0.02, 0.04);
    if (md < 0.12) y -= 0.03 * sstep(0.12, 0.06, md);
    if (kd < 0.08) y -= 0.012 * sstep(0.08, 0.04, kd);
    y -= 0.014 * gully(a, 13, 6) * sstep(0.3, 0.75, e) * sstep(1.05, 0.7, e);
    // 1914 lava field fused to the mainland (right) and the Ōsumi hills
    const lf = sstep(0.2, 0.26, x) * sstep(0.16, 0.06, Math.abs(z + 0.07)) * (0.025 + 0.01 * r2(x * 30, z * 30, 2, 2));
    const main = sstep(0.33, 0.4, x + 0.04 * Math.sin(z * 8)) * (0.03 + 0.07 * f2(x * 6, z * 6, 3, 3));
    // Kagoshima side (front-left): coastal city plain and Shiroyama hill
    const city = sstep(0.27, 0.33, z - 0.25 * x + 0.03 * Math.sin(x * 9)) * sstep(0.2, 0.0, x) * (0.012 + 0.004 * f2(x * 20, z * 20, 2, 4));
    const shiro = 0.06 * Math.max(0, 1 - Math.hypot(x + 0.33, z - 0.37) / 0.1);
    return Math.max(y, lf - 0.004, main - 0.01, city, shiro + city * 0.5 - 0.003, -0.03 + 0.006 * f2(x * 6, z * 6, 2, 5));
  };
  const WL = 0.004;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 3, 7);
    if (y < WL + 0.004) { B('#4a4440'); return L('#6a625a', n); }
    if (isl(x, z) < 1.1 || (x > 0.18 && x < 0.36 && Math.abs(z + 0.07) < 0.16)) {
      const t = y / 0.36;
      B('#3f7a36'); L('#5a8f42', n);
      // 1914 lava field: dark, with pine scrub colonising it
      if (x > 0.15 && y < 0.05) { B('#2f2c2a'); L('#4a5a36', sstep(0.5, 0.75, n) * 0.8); }
      L('#7a6a5a', sstep(0.18, 0.32, t + 0.08 * n));
      L('#5a504a', sstep(0.4, 0.55, t));
      L('#9a948c', sstep(0.55, 0.75, t) * 0.6);
      // grey ashfall dusting the leeward (left) slopes
      L('#a8a29a', sstep(0.0, -0.2, x) * sstep(0.2, 0.4, t) * 0.4);
      if (ny < 0.65) L(Math.sin(y * 280) > 0 ? '#6a5a4c' : '#4a403a', 0.6);
      const md = Math.hypot(x - MX, z - MZ) / 0.2;
      if (md < 0.12) { B('#3a302c'); L('#6a2a14', sstep(0.06, 0.0, md) * 0.6); }
      return S(0.9 + 0.12 * ny);
    }
    // mainlands: green hills, and Kagoshima's grey urban grid on the front-left
    B('#3a7034'); L('#57893f', n);
    const urb = sstep(0.27, 0.33, z - 0.25 * x) * sstep(0.2, 0.05, x) * (Math.hypot(x + 0.33, z - 0.37) > 0.07 ? 1 : 0);
    if (urb > 0.5) { const gx = x * 40, gz = z * 40; B((Math.abs(gx - Math.round(gx)) < 0.12 || Math.abs(gz - Math.round(gz)) < 0.12) ? '#6a6a6e' : (hh(Math.floor(gx), Math.floor(gz)) > 0.5 ? '#c9c2b6' : '#a8a29a')); }
    return S(0.92 + 0.1 * ny);
  }, { n: 96, focus: 0.2, wl: WL, water: sea(hf, WL, '#3d9ab0', '#1f5f88'), strata: ['#1d4f73', '#1a476a', '#2f3a40'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // Minamidake's ash puff: dark grey cauliflower billowing then drifting over the city side
  const my = gy(MX, MZ);
  puffs(gp, column(MX, my + 0.015, MZ, 0.24, 0.03, 0.07, 9, 81, [-0.12, -0.05]), '#5a5552', { c2: '#b6b0aa', sq: 0.85 });
  add(gp, DISC(), mat(GLOW, { emissive: GLOWE, flat: false }), MX, my - 0.005, MZ, 0.012, 1, 0.012);
  // Kagoshima: blocks of buildings, a tower, Shiroyama trees
  sprinkle(34, 83, 0.49, (x, z) => z - 0.25 * x > 0.31 && x < 0.15 && Math.hypot(x + 0.33, z - 0.37) > 0.08 && hf(x, z) > WL + 0.004, (x, z, i) => {
    const hgt = 0.012 + H01(i, 84) ** 2 * 0.04;
    box(gp, ['#e5e2dc', '#c9c4bc', '#9aa6b2', '#f1ede4'][i % 4], x, gy(x, z), z, 0.014, hgt, 0.014, 0.25);
  });
  sprinkle(12, 85, 0.49, (x, z) => Math.hypot(x + 0.33, z - 0.37) < 0.075, (x, z) => blob(gp, '#2f6a2e', x, gy(x, z) + 0.006, z, 0.012, 0.009, 0.012));
  // villages and pines on the island's lower slopes, the Arimura observatory
  sprinkle(30, 87, 0.49, (x, z) => { const e = isl(x, z); return e > 0.75 && e < 1.0 && hf(x, z) > 0.012; }, (x, z, i) =>
    i % 3 ? conifer(gp, x, gy(x, z), z, 0.03, '#2f5a33') : house(gp, x, gy(x, z), z, 0.014, i, '#f1ede4', '#4a5a6a', 0.009));
  // the Sakurajima ferry crossing the channel
  const fx = -0.24, fz = 0.12, fy = Y0 + WL;
  box(gp, '#f8fafc', fx, fy - 0.003, fz, 0.06, 0.01, 0.018, 0.5);
  box(gp, '#f59e0b', fx, fy + 0.007, fz, 0.04, 0.007, 0.014, 0.5);
  box(gp, '#1f2937', fx - 0.002, fy + 0.014, fz, 0.012, 0.006, 0.006, 0.5);
};

// =========================================================================================================
// Tambora — decapitated by the largest eruption in recorded history (1815): a broad, gullied green mountain whose
// top is a 6 km-wide, kilometre-deep caldera with layered tan and brown walls, a dry floor with the small Doro Afi
// Toi cone and a yellowish lake, wisps of cloud drifting over the rim.
const vo_tambora: Builder = gp => {
  const CX = 0.0, CZ = -0.06, RC = 0.2;
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const rim = 0.33 + 0.03 * r2(Math.cos(a) * 2 + 1, Math.sin(a) * 2, 2, 1) - 0.03 * Math.exp(-(((a - 1.4) / 0.4) ** 2));
    let y: number;
    if (r < RC) {
      const s = r / RC;
      y = 0.08 + (rim - 0.08) * sstep(0.72, 1.0, s) ** 1.2 - 0.006 * Math.sin(s * 40) * sstep(0.75, 0.95, s);
    } else {
      y = rim * Math.pow(Math.max(0, 1 - (r - RC) / 0.31), 1.3);
      y -= 0.03 * gully(a, 18, 2) * sstep(RC + 0.02, RC + 0.12, r) * sstep(0.5, 0.3, r);
    }
    y -= 0.012 * sstep(0.05, 0.03, Math.hypot(x - CX + 0.07, z - CZ + 0.05));
    y = cinder(y, x, z, CX + 0.06, CZ + 0.04, 0.04, 0.035, 0.3);
    const sea = sstep(0.38, 0.44, z - 0.6 * x);
    const gnd = (0.014 + 0.008 * f2(x * 8, z * 8, 2, 3)) * (1 - sea) - 0.02 * sea;
    return smax(y * (1 - sea * 0.5), gnd, 0.03);
  };
  const WL = 0.004;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const r = Math.hypot(x - CX, z - CZ), a = Math.atan2(z - CZ, x - CX), n = f2(x * 12, z * 12, 3, 4);
    if (y < WL + 0.004) { B('#7a6a58'); return L('#9a8a72', n); }
    if (r < RC + 0.005) {
      if (ny > 0.88 && y < 0.1) { B('#9a8a6a'); L('#b5a37a', n); return W; }
      // banded caldera wall: tan pumice, brown lava, grey ash
      const band = Math.floor(y * 70 + (n - 0.5) * 2);
      B(['#b8996a', '#8a6a4a', '#a8a090', '#6a503a', '#c9b080'][((band % 5) + 5) % 5]);
      L('#5f8a45', sstep(0.75, 0.88, ny) * 0.7);
      return S(0.88 + 0.14 * ny);
    }
    // gullied outer slopes: green ridges, browner gullies, savanna lowland
    B('#3f7a36'); L('#5a8f42', n);
    L('#8a7a52', gully(a, 18, 2) * sstep(RC + 0.02, RC + 0.1, r) * 0.5);
    L('#b0a060', sstep(0.06, 0.025, y) * 0.7);
    L('#8a7a5a', sstep(0.27, 0.32, y) * 0.5);
    if (ny < 0.65) L('#7a6248', 0.5);
    return S(0.9 + 0.12 * ny);
  }, { n: 94, focus: 0.3, wl: WL, water: sea(hf, WL, '#3fa0b0', '#1f5f88'), strata: ['#6a503a', '#8a6a4a', '#5a4434', '#a88a62'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  // the small acidic lake on the caldera floor
  const LX = CX - 0.07, LZ = CZ - 0.05;
  lakeSheet(gp, hf, LX, LZ, 0.06, 0.084, () => { B('#a8b84a'); return L('#6a9a5a', 0.3); });
  puffs(gp, column(CX + 0.06, gy(CX + 0.06, CZ + 0.04) + 0.03, CZ + 0.04, 0.06, 0.008, 0.016, 4, 91, [0.02, -0.02]), '#f2f2f2', { op: 0.55 });
  // cloud wisps drifting over the rim and around the flanks
  const wisp: number[][] = [];
  for (let i = 0; i < 10; i++) { const a = 2.6 + i * 0.22, rr = 0.27 + H01(i, 92) * 0.05; wisp.push([CX + Math.cos(a) * rr, 0.3 + H01(i, 93) * 0.04, CZ + Math.sin(a) * rr, 0.04 + H01(i, 94) * 0.02]); }
  puffs(gp, wisp, '#eef1f4', { op: 0.75, c2: '#ffffff', sq: 0.5 });
  // forest, a coastal village with a boat, hikers on the rim
  sprinkle(56, 95, 0.49, (x, z) => { const r = Math.hypot(x - CX, z - CZ); return r > RC + 0.05 && hf(x, z) > 0.02 && gully(Math.atan2(z - CZ, x - CX), 18, 2) < 0.5; }, (x, z, i) =>
    blob(gp, i % 3 ? '#2f6a2e' : '#447f3a', x, gy(x, z) + 0.006, z, 0.011, 0.008, 0.011));
  for (const [x, z, ry] of [[0.02, 0.4, 0.4], [0.07, 0.37, 0.1], [-0.04, 0.42, 0.7]]) house(gp, x, gy(x, z), z, 0.02, ry, '#c9a46a', '#7a4a2a', 0.012);
  box(gp, '#2563eb', 0.22, Y0 + WL - 0.002, 0.36, 0.035, 0.006, 0.01, 0.6);
  for (let i = 0; i < 3; i++) { const a = 1.0 + i * 0.07, x = CX + Math.cos(a) * (RC + 0.01), z = CZ + Math.sin(a) * (RC + 0.01); person(gp, x, gy(x, z), z, ['#ef4444', '#facc15', '#2563eb'][i]); }
};

// =========================================================================================================
// Ruapehu — the North Island's highest peak: a broad massif crowned by jagged snowy peaks around a steaming, milky
// turquoise crater lake; a ski field with chairlift and lodges on its flank, golden tussock below and the perfect
// young cone of Ngauruhoe behind.
const vo_ruapehu: Builder = gp => {
  const CX = 0.05, CZ = -0.04, NG = { x: -0.3, z: -0.3 };
  const CL = { x: 0.06, z: -0.07, r: 0.06 };
  const hf: HFn = (x, z) => {
    const dx = x - CX, dz = z - CZ, e = Math.hypot(dx / 0.44, dz / 0.36), a = Math.atan2(dz, dx);
    // broad massif with a high summit plateau
    let y = 0.27 * Math.pow(Math.max(0, 1 - e), 0.85);
    y -= 0.035 * gully(a, 11, 3) * sstep(0.3, 0.7, e) * sstep(1, 0.7, e);
    // jagged summit peaks (Tahurangi, Paretetaitonga…) ringing the crater
    const cd = Math.hypot(x - CL.x, z - CL.z) / CL.r;
    const ring = sstep(0.9, 1.4, cd) * sstep(4.2, 2.2, cd);
    y += ring * (0.03 + 0.11 * Math.pow(r2(x * 7 + 2, z * 7, 3, 4), 1.6));
    if (cd < 1.4) y = Math.min(y, 0.27 + 0.2 * sstep(0.9, 1.6, cd));
    if (cd < 1.0) y = 0.3 - 0.03 * (1 - cd);
    // Ngauruhoe: steep symmetric young cone
    const nd = Math.hypot(x - NG.x, z - NG.z) / 0.17;
    let ng = 0.34 * Math.pow(Math.max(0, 1 - nd), 1.2);
    if (nd < 0.12) ng -= 0.025 * sstep(0.12, 0.06, nd);
    y = smax(y, ng, 0.03);
    return smax(y, 0.016 + 0.012 * f2(x * 7, z * 7, 3, 5), 0.04);
  };
  const LW = 0.294;
  terra(gp, 0.5, hf, (x, y, z, _nx, ny) => {
    const n = f2(x * 12, z * 12, 3, 6), nd = Math.hypot(x - NG.x, z - NG.z) / 0.17;
    // golden-brown tussock, darker scrub, grey-brown scoria, then snow by altitude and aspect
    B('#b0965a'); L('#8a7a46', n); L('#5a6a3a', sstep(0.6, 0.8, f2(x * 6, z * 6, 2, 7)) * 0.6);
    L('#7a6a5a', sstep(0.06, 0.14, y + 0.03 * n));
    L('#5a4a44', sstep(0.15, 0.24, y + 0.03 * n) * 0.7);
    if (nd < 1) { B('#4a3a34'); L('#7a4a3a', sstep(0.6, 0.9, n) * 0.6); L('#2a2422', sstep(0.15, 0.1, nd)); LS(sstep(0.24, 0.28, y + 0.03 * n) * 0.8, ny); return W; }
    if (ny < 0.6) L(Math.sin(y * 240 + n * 4) > 0 ? '#5a4c46' : '#3a3230', 0.7);
    LS(sstep(0.2, 0.26, y + 0.05 * n - 0.06 * (1 - ny)), ny);
    // groomed ski runs on the front-right flank
    if (x > 0.12 && x < 0.32 && z > 0.02 && z < 0.24 && Math.abs(Math.sin((x - z * 0.4) * 60)) < 0.35 && y > 0.12) LS(0.8, ny);
    return W;
  }, { n: 94, focus: 0.3, strata: ['#5a4a3e', '#4a3c32', '#6a5848', '#3a302a'] });
  const gy = (x: number, z: number) => Y0 + hf(x, z) - 0.002;
  lakeSheet(gp, hf, CL.x, CL.z, CL.r * 1.3, LW, () => { B('#a6e0d6'); return L('#7ccfc4', 0.3); });
  puffs(gp, column(CL.x, Y0 + LW + 0.01, CL.z, 0.1, 0.02, 0.04, 6, 101, [0.05, -0.03]), '#f4f6f8', { op: 0.6, c2: '#ffffff' });
  // ski field: chairlift towers and cable, lodges at the bottom, skiers
  const lift: [number, number][] = [[0.24, 0.24], [0.21, 0.17], [0.18, 0.1], [0.15, 0.03]];
  const tops: V3[] = lift.map(([x, z]) => { const y = gy(x, z); cyl(gp, '#475569', x, y, z, 0.002, 0.03, 4); box(gp, '#334155', x, y + 0.03, z, 0.014, 0.002, 0.002, 0.8); return [x, y + 0.031, z]; });
  for (let i = 0; i < tops.length - 1; i++) rod(gp, tops[i], tops[i + 1], 0.0008, '#1f2937', 3);
  for (const [x, z, w] of [[0.27, 0.27, 0.03], [0.31, 0.25, 0.024]]) house(gp, x, gy(x, z), z, w, 0.4, '#8a5a3a', '#3f4a5a');
  for (let i = 0; i < 5; i++) { const x = 0.16 + H01(i, 102) * 0.12, z = 0.06 + H01(i, 103) * 0.15; if (hf(x, z) > 0.1) person(gp, x, gy(x, z), z, ['#ef4444', '#2563eb', '#facc15', '#10b981', '#f97316'][i], 0.9); }
  // beech forest patches low on the front-left, the Desert Road
  sprinkle(24, 105, 0.49, (x, z) => x < 0.05 && z > 0.2 && hf(x, z) < 0.05, (x, z, i) => blob(gp, i % 2 ? '#2f5a33' : '#3f6a3a', x, gy(x, z) + 0.007, z, 0.012, 0.009, 0.012));
  lavaRibbon(gp, hf, [[-0.45, 0.2], [-0.2, 0.36], [0.05, 0.42], [0.3, 0.38]], 0.004, 0.004, 0.0015, '#4a4a4e', '#000000');
};

/** Builders keyed by catalogue item key (recipe.hero). */
export const H_VOLCANOES: Record<string, Builder> = {
  vo_mayon, vo_sthelens, vo_vesuvius, vo_etna, vo_kilauea, vo_krakatoa,
  vo_yellowstone, vo_tianchi, vo_teide, vo_pinatubo, vo_eyjafjallajokull, vo_cotopaxi,
  vo_erebus, vo_nyiragongo, vo_ertaale, vo_sakurajima, vo_tambora, vo_ruapehu,
};
