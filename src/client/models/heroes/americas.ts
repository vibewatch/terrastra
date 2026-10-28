import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type V3, type Paint, g, add, mat, box, cyl, rbox, rod, strut, skin, sweep, lathe, prism, gable, slab, tbox, panel, paintFaces, shade, mix, fbm, hash3 } from '../prims.ts';
import { type HFn, island, sstep, ridged, ripple, strataSide, EARTH, onGround } from '../nature.ts';
import { grp } from '../kit/town.ts';

// Hero builders for: opera, goldengate, liberty, empire, chichenitza, machupicchu, moai, stonehenge, louvre, spaceneedle.
// Keyed by catalogue item key (recipe.hero). Each sits on its real setting; front is +z, base at y=0.

// ---- local helpers ----------------------------------------------------------------------------------------
const LO = () => g('am:sph7', () => new THREE.SphereGeometry(0.5, 8, 6));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
/** Painted box: base at y, paint receives local coords (centered in x/z, y from 0..h). */
function pbox(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, base: string, paint?: Paint, seg: [number, number, number] = [1, 1, 1], ry = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  geo.translate(0, h / 2, 0);
  return add(p, paintFaces(geo, base, paint), mat('#ffffff', { vc: true }), x, y, z, 1, 1, 1, ry);
}
function bush(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#5b4636', x, y, z, s * 0.1, s * 0.45, 5);
  blob(p, c, x, y + s * 0.7, z, s * 0.48, s * 0.4, s * 0.48);
  blob(p, shade(c, 1.12), x + s * 0.12, y + s * 0.9, z + s * 0.08, s * 0.3);
}
function conifer(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#5b4030', x, y, z, s * 0.08, s * 0.3, 5);
  strut(p, [x, y + s * 0.15, z], [x, y + s * 1.1, z], s * 0.32, 0.001, c, 6);
}
function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, s = 1): void {
  passerby(p, x, y, z, 0.0165 * s, 1, { top: c });
}
const STAR = (n: number, ro: number, ri: number, rot = 0): [number, number][] =>
  Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i * Math.PI) / n, rr = i % 2 ? ri : ro; return [Math.sin(a) * rr, Math.cos(a) * rr]; });
const ELL = (cx: number, cz: number, rx: number, rz: number, n = 40, wob = 0, seed = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, k = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2) * 0.4);
    return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k];
  });
function boat(p: THREE.Object3D, x: number, z: number, ry: number, hull: string, cabin: string, s = 1): void {
  const b = grp(p, x, 0.035, z, ry);
  tbox(b, 0.05 * s, 0.016 * s, 0.06 * s, 0.02 * s, 0.008 * s, hull);
  rbox(b, cabin, -0.004 * s, 0.008 * s, 0, 0.034 * s, 0.009 * s, 0.015 * s, 0.002);
  box(b, shade(cabin, 0.9), -0.006 * s, 0.017 * s, 0, 0.022 * s, 0.006 * s, 0.012 * s);
}
function sailboat(p: THREE.Object3D, x: number, z: number, ry: number, s = 1): void {
  const b = grp(p, x, 0.035, z, ry);
  tbox(b, 0.03 * s, 0.009 * s, 0.036 * s, 0.011 * s, 0.006 * s, '#f8fafc');
  rod(b, [0, 0.006 * s, 0], [0, 0.05 * s, 0], 0.0008, '#64748b', 4);
  const sl = slab(b, [[0, 0.008 * s], [0.016 * s, 0.008 * s], [0, 0.048 * s]], 0.001, '#f1f5f9', 0, false);
  sl.position.x = 0.001;
}

// =========================================================================================================
// Sydney Opera House
interface Shell { x: number; z: number; y: number; L: number; W: number; H: number; ov: number; dir: number; glass?: boolean }
function sail(gp: THREE.Object3D, s: Shell): void {
  const NU = 12, NV = 6;
  // local frame: a = toward the mouth, h = up, sd = sideways
  const W3 = (a: number, h: number, sd: number): V3 => [s.x - s.dir * a, s.y + h, s.z + sd];
  const Bk = [-s.L, 0], Tp = [s.ov, s.H];
  const dl = Math.hypot(Tp[0] - Bk[0], Tp[1] - Bk[1]);
  const nR = [-(Tp[1] - Bk[1]) / dl, (Tp[0] - Bk[0]) / dl];
  const ridge = (u: number): V3 => { const b = 0.17 * dl * Math.sin(Math.PI * u); return [Bk[0] + (Tp[0] - Bk[0]) * u + nR[0] * b, Bk[1] + (Tp[1] - Bk[1]) * u + nR[1] * b, 0]; };
  const edge = (u: number, sg: number): V3 => [s.ov * u * u, s.H * Math.pow(u, 0.62), sg * s.W * (1 - Math.pow(u, 1.35))];
  const rows: V3[][] = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, R = ridge(u), row: V3[] = [];
    for (let j = -NV; j <= NV; j++) {
      const t = Math.abs(j) / NV, sg = j < 0 ? -1 : 1, E = edge(u, sg);
      const span = Math.hypot(E[0] - R[0], E[1] - R[1], E[2] - R[2]);
      const b = 0.2 * span * Math.sin(Math.PI * t), up = Math.min(1, u * 3);
      row.push(W3(R[0] + (E[0] - R[0]) * t - b * 0.1, R[1] + (E[1] - R[1]) * t + b * 0.55 * up, R[2] + (E[2] - R[2]) * t + sg * b * 0.8));
    }
    rows.push(row);
  }
  skin(gp, rows, '#f4f1e8', { closed: false, paint: (x, y, z) => {
    const h = y - s.y, sd = Math.abs(z - s.z), a = (s.x - x) * s.dir;
    if (h < 0.004) return '#d9d2c2';
    const v = Math.floor(h * 70 + sd * 55 - a * 8);
    return v % 3 === 0 ? '#e3ddcc' : hash3(Math.floor(h * 140), Math.floor(sd * 140), 1) > 0.85 ? '#fbfaf5' : null;
  } });
  skin(gp, rows, '#d6ccb6', { closed: false, inward: true, paint: (x, y) => (Math.floor(Math.atan2(y - s.y, (s.x - x) * s.dir + s.L) * 30) % 2 ? '#c9bea6' : null) });
  if (s.glass) {
    const top: V3[] = [], bot: V3[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = i <= 8 ? i / 8 : (16 - i) / 8, sg = i <= 8 ? -1 : 1, E = edge(u * 0.97, sg);
      top.push(W3(E[0], E[1], E[2]));
      bot.push(W3(E[0] * 0.25 - 0.012, 0.002, E[2] * 0.92));
    }
    const gpnt: Paint = (x, y, z) => (Math.floor((z - s.z) * 160 + x * 7) % 4 === 0 || Math.floor((y - s.y) * 90) % 5 === 0 ? '#c9a35a' : null);
    skin(gp, [top, bot], '#6e5a44', { closed: false, metal: 0.6, rough: 0.25, paint: gpnt });
    skin(gp, [top, bot], '#6e5a44', { closed: false, inward: true, metal: 0.6, rough: 0.25, paint: gpnt });
  }
}

const opera: Builder = gp => {
  // Bennelong Point: harbour water on three sides, Royal Botanic Garden land to the south (+x)
  const landX = (z: number) => 0.33 + 0.05 * Math.sin(z * 7 + 1);
  const hf: HFn = (x, z) => { const s = sstep(-0.01, 0.03, x - landX(z)); return 0.002 + s * (0.014 + 0.012 * fbm(x * 8, 0, z * 8)); };
  island(gp, 0.5, hf, '#4f8a45', (x, y, z, _nx, ny) => {
    if (y < 0.04 && ny > 0.97) return ripple('#2a6f9e')(x, y, z, 0, 1, 0);
    return hash3(Math.floor(x * 60), 2, Math.floor(z * 60)) > 0.8 ? '#3f7a3c' : mix('#5a9a4c', '#4a8540', fbm(x * 9, 0, z * 9));
  }, { rings: 34, segs: 96, side: strataSide(EARTH) });
  // Seawall promenade (broadwalk) around the point, then the red-granite podium
  const point: [number, number][] = [[-0.42, -0.1], [-0.36, -0.2], [0.3, -0.22], [0.42, -0.24], [0.42, 0.24], [0.3, 0.22], [-0.36, 0.2], [-0.42, 0.1]];
  prism(gp, point, 0.03, 0.017, '#8f8778', 0.002);
  prism(gp, point.map(([x, z]) => [x * 0.985, z * 0.97] as [number, number]), 0.047, 0.002, '#d8cdb8');
  const PT = 0.105;
  const pod: [number, number][] = [[-0.33, -0.12], [-0.29, -0.165], [0.2, -0.165], [0.2, 0.165], [-0.29, 0.165], [-0.33, 0.12]];
  prism(gp, pod, 0.049, PT - 0.049 - 0.004, '#a8705a', 0.002);
  prism(gp, pod.map(([x, z]) => [x * 1.01, z * 1.015] as [number, number]), PT - 0.006, 0.006, '#bd8a72', 0.001);
  // Ribbed promenade facade: dark glazed slit bands along the podium sides
  for (const sz of [-1, 1]) for (let i = 0; i < 22; i++) box(gp, '#5b3a30', -0.28 + i * 0.022, 0.06, sz * 0.1655, 0.012, 0.024, 0.002);
  // Monumental steps: the full-width stair falling south to the forecourt
  const NS = 10;
  for (let i = 0; i < NS; i++) {
    const t = i / NS;
    box(gp, i % 2 ? '#b98a73' : '#c29680', 0.2 + (i + 0.5) * 0.011, 0.049, 0, 0.011, (PT - 0.049) * (1 - t), 0.34);
  }
  for (const sz of [-1, 1]) tbox(gp, 0.11, 0.014, 0.01, 0.014, PT - 0.049, '#9a6450', 0.255, 0.049, sz * 0.177, -0.05, 0);
  pbox(gp, 0.12, 0.004, 0.42, 0.37, 0.047, 0, '#cfc3ad', (x, _y, z) => ((Math.floor(x * 120) + Math.floor(z * 120)) % 2 ? '#c6b9a2' : null), [6, 1, 12]);
  // Shell groups: Concert Hall (front, larger), Joan Sutherland Theatre (behind), Bennelong restaurant (south-west)
  const hall = (zc: number, k: number) => {
    sail(gp, { x: -0.25, z: zc, y: PT, L: 0.1 * k, W: 0.072 * k, H: 0.15 * k, ov: 0.06 * k, dir: 1, glass: true });
    sail(gp, { x: -0.17, z: zc, y: PT, L: 0.11 * k, W: 0.08 * k, H: 0.215 * k, ov: 0.07 * k, dir: 1 });
    sail(gp, { x: -0.075, z: zc, y: PT, L: 0.1 * k, W: 0.082 * k, H: 0.25 * k, ov: 0.075 * k, dir: 1 });
    sail(gp, { x: 0.105, z: zc, y: PT, L: 0.11 * k, W: 0.068 * k, H: 0.16 * k, ov: 0.045 * k, dir: -1, glass: true });
  };
  hall(0.075, 1);
  hall(-0.085, 0.86);
  sail(gp, { x: 0.08, z: -0.125, y: PT, L: 0.045, W: 0.036, H: 0.075, ov: 0.025, dir: 1, glass: true });
  sail(gp, { x: 0.165, z: -0.125, y: PT, L: 0.045, W: 0.032, H: 0.058, ov: 0.018, dir: -1, glass: true });
  // Botanic garden & quay life
  for (let i = 0; i < 12; i++) {
    const z = -0.4 + hash3(i, 3, 1) * 0.8, x = landX(z) + 0.05 + hash3(i, 3, 2) * 0.09;
    if (Math.hypot(x, z) < 0.47 && Math.abs(z) > 0.2) bush(gp, x, 0.035 + hf(x, z) - 0.002, z, 0.05 + hash3(i, 3, 3) * 0.02, i % 3 ? '#3f7a3c' : '#4f8a45');
  }
  for (let i = 0; i < 9; i++) person(gp, 0.33 + hash3(i, 7, 1) * 0.07, 0.051, -0.18 + hash3(i, 7, 2) * 0.36, ['#1e3a8a', '#b91c1c', '#f8fafc', '#334155'][i % 4]);
  boat(gp, -0.3, 0.33, 0.4, '#1f5f3a', '#efe6c8');
  boat(gp, 0.05, -0.37, -0.2, '#1f5f3a', '#efe6c8', 0.9);
  sailboat(gp, -0.42, -0.2, 1.2);
  sailboat(gp, 0.2, 0.36, 2.4, 0.9);
};

// =========================================================================================================
// Golden Gate Bridge
const goldengate: Builder = (gp, r) => {
  const c = r.color ?? '#c0452e', cd = shade(c, 0.78), cl = shade(c, 1.12);
  const T = 0.265, A = 0.435, D = 0.15, TOP = 0.39, Z = 0.034;
  // Marin Headlands (north, -x) rise steeply; Fort Point & the Presidio (south, +x) are lower
  const hf: HFn = (x, z) => {
    const n = 0.025 * fbm(x * 9, 0, z * 9);
    const north = sstep(-0.36, -0.46, x + 0.04 * Math.sin(z * 8)) * (0.12 + 0.07 * ridged(x * 6, z * 6) + 0.05 * sstep(0, -0.4, z));
    const south = sstep(0.38, 0.46, x + 0.03 * Math.sin(z * 9 + 2)) * (0.05 + 0.03 * fbm(x * 7, 2, z * 7));
    const v = north + south;
    return v > 0.006 ? v + n : 0.002;
  };
  island(gp, 0.5, hf, '#b49d63', (x, y, z, _nx, ny) => {
    if (y < 0.039 && ny > 0.97) return ripple('#2c6a8c')(x, y, z, 0, 1, 0);
    if (ny < 0.6) return fbm(x * 30, y * 30, z * 30) > 0.5 ? '#8a7a66' : '#a08c70';
    if (x > 0) return hash3(Math.floor(x * 60), 0, Math.floor(z * 60)) > 0.55 ? '#3f6b3a' : '#6b8a4a';
    return fbm(x * 12, y * 12, z * 12) > 0.55 ? '#5d7246' : mix('#c2aa6a', '#a99558', fbm(x * 20, 0, z * 20));
  }, { rings: 40, segs: 110, side: strataSide(EARTH) });
  // Deck: asphalt roadway with lane lines, sidewalks, railings and the Warren stiffening truss underneath
  const X0 = -0.5, X1 = 0.5, L = X1 - X0;
  box(gp, '#3a3d42', 0, D - 0.005, 0, L, 0.005, 0.066);
  box(gp, '#f8fafc', 0, D, 0, L, 0.0005, 0.0016);
  for (const sz of [-1, 1]) {
    box(gp, '#9ca3af', 0, D - 0.004, sz * 0.031, L, 0.0055, 0.008);
    box(gp, c, 0, D, sz * 0.0355, L, 0.005, 0.0015);
    box(gp, c, 0, D - 0.026, sz * 0.034, L, 0.004, 0.004);
    box(gp, c, 0, D - 0.009, sz * 0.034, L, 0.004, 0.004);
    for (let i = 0; i < 50; i++) {
      const x = X0 + i * 0.02;
      box(gp, cd, x, D - 0.026, sz * 0.034, 0.0022, 0.021, 0.0022);
      rod(gp, [x, D - 0.024, sz * 0.034], [x + 0.02, D - 0.007, sz * 0.034], 0.0011, cd, 3);
    }
  }
  const cars = ['#f8fafc', '#1f2937', '#dc2626', '#2563eb', '#9ca3af', '#facc15'];
  for (let i = 0; i < 14; i++) rbox(gp, cars[i % cars.length], -0.45 + hash3(i, 1, 1) * 0.9, D, (i % 4 - 1.5) * 0.012, 0.012, 0.005, 0.006, 0.0015);
  // Towers: two tapering legs with art-deco setbacks, stepped portal struts above deck, X-bracing below
  for (const tx of [-T, T]) {
    rbox(gp, '#b9b2a4', tx, 0.03, 0, 0.06, 0.03, 0.12, 0.006);
    const lv = [0.06, D - 0.03, D + 0.07, D + 0.135, D + 0.19, TOP];
    for (const sz of [-1, 1]) {
      for (let k = 0; k < lv.length - 1; k++) {
        const f = k / (lv.length - 1), w = 0.024 - f * 0.008, d = 0.017 - f * 0.005;
        tbox(gp, w, d, w * 0.97, d * 0.97, lv[k + 1] - lv[k] + 0.002, c, tx, lv[k], sz * Z);
        for (const sx of [-1, 1]) for (const rz of [-1, 1]) box(gp, cl, tx + sx * w * 0.49, lv[k] + 0.004, sz * Z + rz * d * 0.22, 0.0016, lv[k + 1] - lv[k] - 0.008, 0.0028);
      }
      box(gp, c, tx, TOP, sz * Z, 0.014, 0.008, 0.011);
      box(gp, cl, tx, TOP + 0.008, sz * Z, 0.009, 0.006, 0.007);
      add(gp, LO(), mat('#ef4444', { emissive: '#ef4444' }), tx, TOP + 0.016, sz * Z, 0.004, 0.004, 0.004);
    }
    for (const [y, h] of [[D + 0.055, 0.016], [D + 0.12, 0.016], [D + 0.176, 0.015], [TOP - 0.016, 0.02]]) {
      box(gp, c, tx, y, 0, 0.015, h, Z * 2);
      box(gp, cd, tx, y - 0.004, 0, 0.012, 0.004, Z * 2 - 0.022);
      for (const sz of [-1, 1]) { box(gp, c, tx, y - 0.008, sz * (Z - 0.013), 0.014, 0.008, 0.008); box(gp, c, tx, y - 0.013, sz * (Z - 0.0105), 0.013, 0.005, 0.004); }
    }
    for (const [ya, yb] of [[0.065, D - 0.035]]) {
      for (const sz of [-1, 1]) rod(gp, [tx, ya, sz * Z], [tx, yb, -sz * Z], 0.003, c, 4);
      box(gp, c, tx, yb, 0, 0.014, 0.012, Z * 2);
      box(gp, c, tx, ya - 0.005, 0, 0.016, 0.01, Z * 2);
    }
  }
  // Main cables (parabolic catenary) & side spans, vertical suspenders
  const ycab = (x: number) => {
    const ax = Math.abs(x);
    if (ax <= T) return D + 0.012 + (TOP - 0.006 - D - 0.012) * (x / T) ** 2;
    const u = (ax - T) / (A - T);
    return TOP - 0.006 + (D + 0.004 - (TOP - 0.006)) * u - 0.03 * Math.sin(Math.PI * u);
  };
  for (const sz of [-1, 1]) {
    for (const [a, b] of [[-A, -T], [-T, T], [T, A]]) {
      const st = Array.from({ length: 11 }, (_, i) => { const x = a + ((b - a) * i) / 10; return { p: [x, ycab(x), sz * Z] as V3, w: 0.0028 }; });
      sweep(gp, st, c, { radial: 6, sub: 2, caps: false });
    }
    for (let x = -A + 0.016; x < A; x += 0.016) {
      if (Math.abs(Math.abs(x) - T) < 0.01) continue;
      const yc = ycab(x);
      if (yc - D > 0.004) box(gp, cl, x, D, sz * Z, 0.0011, yc - D, 0.0011);
    }
  }
  // Anchorages, art-deco pylons, Fort Point arch and the Marin viaduct
  for (const sx of [-1, 1]) {
    rbox(gp, '#cbc3b2', sx * A, 0.035, 0, 0.06, D - 0.03, 0.1, 0.004);
    for (const sz of [-1, 1]) {
      tbox(gp, 0.026, 0.02, 0.018, 0.014, D + 0.04 - 0.035, '#d6cfbf', sx * (A + 0.01), 0.035, sz * 0.05);
      box(gp, '#c8c0ae', sx * (A + 0.01), D + 0.005, sz * 0.05, 0.02, 0.006, 0.016);
    }
  }
  for (let i = 0; i <= 12; i++) {
    const a0 = (i / 12) * Math.PI, a1 = ((i + 1) / 12) * Math.PI;
    if (i === 12) break;
    for (const sz of [-1, 1]) rod(gp, [0.465 - Math.cos(a0) * 0.03, 0.06 + Math.sin(a0) * 0.06, sz * 0.03], [0.465 - Math.cos(a1) * 0.03, 0.06 + Math.sin(a1) * 0.06, sz * 0.03], 0.003, c, 4);
  }
  box(gp, '#9a4a3a', 0.465, 0.035, 0, 0.05, 0.03, 0.05);
  for (const x of [-0.475]) for (const sz of [-1, 1]) box(gp, '#c8c0ae', x, 0.03, sz * 0.025, 0.012, D - 0.03, 0.012);
  sailboat(gp, -0.1, 0.25, 0.5);
  sailboat(gp, 0.12, 0.33, 2.2, 0.9);
  sailboat(gp, 0.05, -0.3, 1.0, 0.8);
  boat(gp, -0.2, -0.32, 0.2, '#334155', '#f1f5f9', 1.3);
};

// =========================================================================================================
// Statue of Liberty
const liberty: Builder = (gp, r) => {
  const c = r.color ?? '#5fb39a', cD = shade(c, 0.82), cL = shade(c, 1.1);
  const isl: [number, number][] = ELL(0, -0.02, 0.42, 0.36, 40, 0.04, 1);
  const inIsl = (x: number, z: number) => ((x / 0.42) ** 2 + ((z + 0.02) / 0.36) ** 2);
  const hf: HFn = (x, z) => (inIsl(x, z) < 1 ? 0.012 + 0.003 * fbm(x * 9, 0, z * 9) : 0.002);
  island(gp, 0.5, hf, '#5e8f4a', (x, y, z, _nx, ny) => {
    if (y < 0.04 && ny > 0.97) return ripple('#2e6f8f')(x, y, z, 0, 1, 0);
    const e = inIsl(x, z);
    if (e > 0.82) return '#b8b0a0';
    if (Math.abs(Math.hypot(x, z) - 0.3) < 0.012) return '#d8d0c0';
    return hash3(Math.floor(x * 60), 0, Math.floor(z * 60)) > 0.85 ? '#4f7d3e' : '#5e8f4a';
  }, { rings: 36, segs: 96, side: strataSide(['#7a756c', '#6a655c']) });
  void isl;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, d = 0.33 + hash3(i, 2, 2) * 0.04, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.82 - 0.02;
    if (z < 0.15) bush(gp, x, 0.045, z, 0.045 + hash3(i, 1, 1) * 0.02, i % 2 ? '#3f6f35' : '#4d7d3f');
  }
  // Fort Wood: 11-point star granite walls with a paved terreplein
  const G = 0.046;
  prism(gp, STAR(11, 0.25, 0.185, 0), G - 0.002, 0.05, '#a39b8d', 0.002);
  prism(gp, STAR(11, 0.243, 0.18, 0), G + 0.046, 0.004, '#c9c1b0');
  prism(gp, STAR(11, 0.2, 0.15, 0), G + 0.049, 0.002, '#6d8f55');
  // Pedestal: stepped foundation, dado with roundels, rusticated shaft with loggias, balcony & attic
  let y = G + 0.05;
  tbox(gp, 0.2, 0.2, 0.17, 0.17, 0.035, '#beb5a3', 0, y, 0); y += 0.035;
  box(gp, '#c8bfad', 0, y, 0, 0.175, 0.006, 0.175); y += 0.006;
  tbox(gp, 0.13, 0.13, 0.122, 0.122, 0.058, '#b9ad97', 0, y, 0);
  for (let f = 0; f < 4; f++) {
    const fg = grp(gp, 0, 0, 0, (f * Math.PI) / 2);
    for (let i = 0; i < 7; i++) add(fg, g('am:disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateX(Math.PI / 2)), mat('#a89c86'), -0.045 + i * 0.015, y + 0.012, 0.0625, 0.011, 0.011, 0.003);
    box(fg, '#4b4a46', 0, y, 0.063, 0.014, 0.022, 0.003);
  }
  y += 0.058;
  box(gp, '#c4b8a2', 0, y, 0, 0.134, 0.008, 0.134); y += 0.008;
  const SH = 0.118;
  box(gp, '#bcb09a', 0, y, 0, 0.108, SH, 0.108);
  for (let f = 0; f < 4; f++) {
    const fg = grp(gp, 0, 0, 0, (f * Math.PI) / 2);
    for (const sx of [-1, 1]) for (let q = 0; q < 6; q++) box(fg, q % 2 ? '#a99d86' : '#c9bea8', sx * 0.048, y + q * (SH / 6), 0.0535, 0.014, SH / 6, 0.004);
    box(fg, '#36332f', 0, y + SH * 0.47, 0.054, 0.056, 0.03, 0.002);
    for (let i = 0; i < 4; i++) cyl(fg, '#cdc2ac', -0.024 + i * 0.016, y + SH * 0.47 - 0.002, 0.056, 0.0028, 0.034, 6);
    box(fg, '#cdc2ac', 0, y + SH * 0.47 + 0.032, 0.0548, 0.064, 0.005, 0.002);
    box(fg, '#cdc2ac', 0, y + SH * 0.47 - 0.006, 0.0548, 0.064, 0.004, 0.003);
  }
  y += SH;
  box(gp, '#c8bca6', 0, y, 0, 0.12, 0.008, 0.12); y += 0.008;
  box(gp, '#b7ab95', 0, y, 0, 0.114, 0.014, 0.114);
  for (let f = 0; f < 4; f++) { const fg = grp(gp, 0, 0, 0, (f * Math.PI) / 2); for (let i = 0; i < 7; i++) box(fg, '#8e846f', -0.045 + i * 0.015, y + 0.004, 0.0572, 0.006, 0.007, 0.002); }
  y += 0.014;
  tbox(gp, 0.09, 0.09, 0.084, 0.084, 0.022, '#bfb39d', 0, y, 0); y += 0.022;
  box(gp, cD, 0, y, 0, 0.078, 0.006, 0.078); y += 0.006;
  // Statue (scale k): draped robe lofted with fold ridges, diagonal mantle, raised torch arm, tablet, crowned head
  const S = y, k = 0.9, BH = 0.27 * k;
  const prof: [number, number, number][] = [[0, 0.064, 0.05], [0.06, 0.058, 0.046], [0.3, 0.054, 0.043], [0.5, 0.055, 0.044], [0.66, 0.05, 0.04], [0.8, 0.055, 0.042], [0.9, 0.06, 0.04], [0.96, 0.05, 0.034], [1, 0.016, 0.016]];
  const pr = (t: number): [number, number] => {
    let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < t) i++;
    const [t0, a0, b0] = prof[i], [t1, a1, b1] = prof[i + 1], u = sstep(0, 1, (t - t0) / (t1 - t0));
    return [(a0 + (a1 - a0) * u) * k, (b0 + (b1 - b0) * u) * k];
  };
  const NR = 18, NA = 30, rings: V3[][] = [];
  for (let i = 0; i <= NR; i++) {
    const t = i / NR, [rx, rz] = pr(t), ring: V3[] = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const fold = (0.075 * (1 - t * 0.7)) * Math.sin(a * 9 + Math.sin(t * 5) * 1.2 + (a > Math.PI ? t * 2 : 0));
      const f = t > 0.94 ? 0 : fold;
      ring.push([Math.cos(a) * rx * (1 + f) + 0.004 * Math.sin(t * 6), S + t * BH, Math.sin(a) * rz * (1 + f)]);
    }
    rings.push(ring);
  }
  skin(gp, rings, c, { caps: true, paint: (x, yy, z) => (fbm(x * 90, yy * 40, z * 90) > 0.62 ? cD : fbm(x * 50, yy * 50, z * 50) < 0.3 ? cL : null) });
  // Mantle (palla): from the left shoulder across the body with a diagonal hem, hanging long on her left side
  const mrows: V3[][] = [];
  for (let v = 0; v <= 8; v++) {
    const row: V3[] = [];
    for (let j = 0; j <= 18; j++) {
      const a = -0.55 + (j / 18) * (Math.PI + 1.0);
      const hem = 0.14 + 0.26 * (1 - (j / 18)) ** 1.2;
      const t = hem + (0.88 - hem) * (v / 8), [rx, rz] = pr(t);
      const f = 1.1 + 0.07 * Math.sin(a * 7 + t * 4);
      row.push([Math.cos(a) * rx * f + 0.003, S + t * BH, Math.sin(a) * rz * f]);
    }
    mrows.push(row);
  }
  skin(gp, mrows, shade(c, 0.95), { closed: false, paint: (x, yy, z) => (Math.sin(Math.atan2(z, x) * 14 + yy * 60) > 0.6 ? cD : null) });
  skin(gp, mrows, cD, { closed: false, inward: true });
  // Head, neck, hair & crown with 7 rays
  const NY = S + BH;
  cyl(gp, c, 0, NY - 0.006, 0.002, 0.012 * k, 0.022 * k, 10);
  const HY = NY + 0.036 * k;
  blob(gp, c, 0, HY, 0.004, 0.019 * k, 0.024 * k, 0.021 * k);
  blob(gp, cD, 0, HY + 0.002, -0.006, 0.02 * k, 0.022 * k, 0.018 * k);
  blob(gp, c, 0, HY - 0.004, 0.024 * k, 0.003, 0.006, 0.004);
  lathe(gp, [[0.021 * k, 0], [0.023 * k, 0.004], [0.022 * k, 0.012], [0.019 * k, 0.014]], cL, 0, HY + 0.008, 0.002, 14);
  for (let i = 0; i < 7; i++) {
    const a = -1.25 + (i / 6) * 2.5, dx = Math.sin(a), dz = Math.cos(a);
    const b: V3 = [dx * 0.02 * k, HY + 0.018, 0.002 + dz * 0.02 * k];
    strut(gp, b, [b[0] + dx * 0.04 * k, b[1] + 0.024 * k, b[2] + dz * 0.03 * k], 0.0042, 0.0006, cL, 4);
  }
  // Raised right arm (her right = -x) with a loose sleeve, torch & gilded flame
  const SHy = NY - 0.012;
  sweep(gp, [
    { p: [-0.046 * k, SHy, 0], w: 0.019 * k },
    { p: [-0.058 * k, SHy + 0.06 * k, -0.004], w: 0.017 * k },
    { p: [-0.064 * k, SHy + 0.12 * k, -0.006], w: 0.012 * k },
    { p: [-0.066 * k, SHy + 0.19 * k, -0.002], w: 0.01 * k },
    { p: [-0.066 * k, SHy + 0.225 * k, 0], w: 0.011 * k },
  ], c, { radial: 10, sub: 4 });
  blob(gp, cD, -0.05 * k, SHy + 0.03 * k, -0.002, 0.024 * k, 0.03 * k, 0.022 * k, 0, 0, 0.3);
  const TY = SHy + 0.225 * k;
  cyl(gp, cD, -0.066 * k, TY, 0, 0.007 * k, 0.025 * k, 8);
  lathe(gp, [[0.007 * k, 0], [0.02 * k, 0.012 * k], [0.022 * k, 0.016 * k], [0.02 * k, 0.018 * k]], cL, -0.066 * k, TY + 0.024 * k, 0, 14);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; box(gp, '#c9a64a', -0.066 * k + Math.cos(a) * 0.021 * k, TY + 0.04 * k, Math.sin(a) * 0.021 * k, 0.0015, 0.006, 0.0015); }
  lathe(gp, [[0.012 * k, 0], [0.016 * k, 0.01 * k], [0.013 * k, 0.026 * k], [0.006 * k, 0.04 * k], [0, 0.05 * k]], '#f3c54a', -0.066 * k, TY + 0.042 * k, 0, 12)
    .material = mat('#f3c54a', { emissive: '#d4901c', metal: 0.5, rough: 0.3 });
  // Left arm cradling the tablet (JULY IV MDCCLXXVI)
  sweep(gp, [
    { p: [0.048 * k, SHy, 0], w: 0.016 * k },
    { p: [0.064 * k, SHy - 0.06 * k, 0.004], w: 0.014 * k },
    { p: [0.058 * k, SHy - 0.085 * k, 0.03 * k], w: 0.011 * k },
    { p: [0.045 * k, SHy - 0.06 * k, 0.045 * k], w: 0.009 * k },
  ], c, { radial: 10, sub: 4 });
  const tb = grp(gp, 0.07 * k, SHy - 0.085 * k, 0.03 * k, 0.35);
  tb.rotation.z = -0.32;
  rbox(tb, cL, 0, -0.045 * k, 0, 0.034 * k, 0.085 * k, 0.012 * k, 0.002);
  box(tb, cD, 0, 0.0, 0.0062 * k, 0.026 * k, 0.003, 0.001);
};

// =========================================================================================================
// Empire State Building
const empire: Builder = (gp, r) => {
  const c = r.color ?? '#c9c2b2', lime = mix(c, '#e2dccc', 0.4), glassC = '#5e6672';
  // Midtown grid: 5th Avenue runs along x in front (+z), 33rd/34th Streets along z beside the tower
  const SW = 0.018, BX = 0.075, AV = 0.172;
  island(gp, 0.5, () => 0.006, '#b8b6ae', () => null, { rings: 8, segs: 64, side: () => '#5b5f66' });
  const G0 = 0.041, chord = (o: number) => 2 * Math.sqrt(Math.max(0, 0.495 ** 2 - o * o));
  box(gp, '#3f444b', 0, G0, AV, chord(AV + 0.026), 0.0012, 0.052);
  box(gp, '#facc15', 0, G0 + 0.0012, AV, chord(AV + 0.026) - 0.004, 0.0003, 0.0016);
  for (let kx = -3; kx <= 2; kx++) {
    const x = (kx + 0.5) * (2 * BX + 2 * SW), L = chord(Math.abs(x) + 0.014);
    if (L <= 0) continue;
    box(gp, '#3f444b', x, G0, 0, 0.028, 0.0011, L);
    for (const dz of [-0.03, 0.03]) for (let i = 0; i < 5; i++) box(gp, '#e5e7eb', x - 0.01 + i * 0.005, G0 + 0.0012, AV + dz, 0.0025, 0.0003, 0.008);
  }
  const G = 0.041;
  // Neighbouring blocks: brick & limestone mid-rises with rooftop water tanks
  const pal = ['#9b5a43', '#b07a5a', '#c9b79a', '#8d939b', '#a3876a', '#7c6a5c', '#c2a585', '#6b7480'];
  let n = 0;
  for (let kx = -2; kx <= 2; kx++) {
    const cx = kx * (2 * BX + 2 * SW);
    for (const [z0, z1] of [[-0.5, AV - 0.03], [AV + 0.03, 0.5]] as const) {
      let z = z1;
      while (z > z0) {
        const len = 0.05 + hash3(kx, n, 1) * 0.06, zc = z - len / 2;
        n++;
        z -= len + 0.004;
        if (kx === 0 && zc > -0.17 && zc < AV) continue;
        for (const sx of [-1, 1]) {
          const x = cx + sx * BX * 0.5;
          if (Math.hypot(x + sx * BX * 0.5, zc) > 0.47 || Math.hypot(x, zc) > 0.45) continue;
          const hsh = hash3(kx * 7 + sx, n, 2), h = 0.03 + hsh * hsh * 0.2 + (Math.abs(kx) === 1 && hsh > 0.85 ? 0.12 : 0);
          const col = pal[Math.floor(hash3(kx, n, sx + 5) * pal.length)];
          pbox(gp, BX - 0.004, h, len - 0.002, x, G, zc, col, (_x, yy, _z, _nx, ny) => (ny > 0.5 ? shade(col, 0.82) : Math.floor(yy / 0.009) % 2 === 1 ? shade(col, 0.72) : null), [1, Math.max(2, Math.round(h / 0.009)), 1]);
          if (hsh > 0.5) {
            const tx = x + (hsh - 0.7) * 0.03, tz = zc + 0.01;
            for (const [lx, lz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) box(gp, '#3f3a35', tx + lx * 0.004, G + h, tz + lz * 0.004, 0.0012, 0.006, 0.0012);
            cyl(gp, '#7a5a3a', tx, G + h + 0.006, tz, 0.0065, 0.01, 8);
            strut(gp, [tx, G + h + 0.016, tz], [tx, G + h + 0.022, tz], 0.007, 0.001, '#4a3a2c', 8);
          }
        }
      }
    }
  }
  for (let i = 0; i < 9; i++) rbox(gp, i % 3 ? '#facc15' : '#f8fafc', -0.42 + i * 0.1 + hash3(i, 9, 1) * 0.04, G, AV + (i % 2 ? 0.01 : -0.01), 0.014, 0.006, 0.007, 0.002);
  // Tower tiers (width x, depth z, top y) with notched corners, limestone piers and dark window spandrel strips
  const floorPaint = (fh: number): Paint => (_x, yy, _z, _nx, ny) => (Math.abs(ny) > 0.5 ? lime : Math.floor(yy / (fh / 2)) % 2 ? '#7d8590' : null);
  const tier = (w: number, d: number, y0: number, y1: number, piers: number) => {
    const h = y1 - y0, fl = Math.max(2, Math.round(h / 0.0072));
    const nw = 0.8;
    pbox(gp, w, h, d * nw, 0, y0, 0, glassC, floorPaint(h / fl), [1, fl * 2, 1]);
    pbox(gp, w * nw, h, d, 0, y0, 0, glassC, floorPaint(h / fl), [1, fl * 2, 1]);
    for (let side = 0; side < 4; side++) {
      const along = side % 2 ? d : w, other = side % 2 ? w : d, fw = along * nw;
      const fg = grp(gp, 0, 0, 0, (side * Math.PI) / 2);
      for (let i = 0; i <= piers; i++) {
        const u = -fw / 2 + (fw * i) / piers, edge = i === 0 || i === piers;
        box(fg, edge ? c : lime, u, y0, other / 2 + 0.0008, edge ? 0.0062 : 0.0034, h, 0.003);
      }
      for (const s of [-1, 1]) {
        box(fg, c, s * (fw / 2 + (along - fw) / 4), y0, other * nw / 2 + 0.0008, (along - fw) / 2, h, 0.003);
        box(fg, c, s * along / 2, y0, other * nw / 2, 0.006, h, 0.006);
      }
      void other;
    }
    box(gp, lime, 0, y1 - 0.002, 0, w + 0.004, 0.004, d * nw + 0.004);
    box(gp, lime, 0, y1 - 0.002, 0, w * nw + 0.004, 0.004, d + 0.004);
  };
  // 5-storey base filling the lot, with the 5th Avenue entrance
  const BW = 0.146, BD = 0.29;
  pbox(gp, BW, 0.052, BD, 0, G, 0, lime, (x, yy, z, nx, ny) => {
    if (ny > 0.5) return '#9ca3af';
    if (yy < 0.0115) return Math.floor(((Math.abs(nx) > 0.5 ? z + BD / 2 : x + BW / 2)) / 0.00911) % 3 === 1 ? '#3f3a35' : '#6b5d4a';
    const u = Math.abs(nx) > 0.5 ? z + BD / 2 : x + BW / 2;
    return Math.floor(u / 0.00911) % 2 && Math.floor(yy / 0.00578) % 2 ? '#4b5260' : null;
  }, [16, 9, 32]);
  box(gp, '#2a2723', 0, G, BD / 2 + 0.001, 0.03, 0.03, 0.004);
  box(gp, '#c9a646', 0, G + 0.03, BD / 2 + 0.002, 0.034, 0.005, 0.005);
  box(gp, lime, 0, G + 0.052, 0, BW + 0.004, 0.004, BD + 0.004);
  tier(0.13, 0.215, G + 0.055, 0.2, 9);
  tier(0.124, 0.17, 0.2, 0.235, 8);
  tier(0.116, 0.14, 0.235, 0.265, 8);
  tier(0.104, 0.118, 0.265, 0.6, 7);
  tier(0.088, 0.096, 0.6, 0.652, 6);
  tier(0.074, 0.078, 0.652, 0.69, 5);
  tier(0.062, 0.064, 0.69, 0.712, 4);
  for (let side = 0; side < 4; side++) {
    const fg = grp(gp, 0, 0, 0, (side * Math.PI) / 2 + Math.PI / 4);
    tbox(fg, 0.014, 0.03, 0.006, 0.012, 0.03, lime, 0, 0.712, 0.03);
  }
  // Mooring mast: finned shaft, 102nd-floor drum, dome cap and the broadcast antenna
  const MY = 0.712;
  cyl(gp, lime, 0, MY, 0, 0.026, 0.018, 8);
  cyl(gp, '#b9b5ab', 0, MY + 0.018, 0, 0.02, 0.07, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; box(gp, '#e8e4da', Math.cos(a) * 0.02, MY + 0.018, Math.sin(a) * 0.02, 0.005, 0.07, 0.005, -a); }
  cyl(gp, lime, 0, MY + 0.088, 0, 0.022, 0.006, 8);
  cyl(gp, '#4b5563', 0, MY + 0.094, 0, 0.015, 0.02, 8).material = mat('#4b5563', { metal: 0.6, rough: 0.3 });
  lathe(gp, [[0.016, 0], [0.014, 0.01], [0.008, 0.022], [0.005, 0.03]], '#d8d4ca', 0, MY + 0.114, 0, 8);
  const AY = MY + 0.144;
  cyl(gp, '#cbd5e1', 0, AY, 0, 0.0045, 0.05, 6);
  cyl(gp, '#94a3b8', 0, AY + 0.03, 0, 0.007, 0.004, 8);
  cyl(gp, '#e2e8f0', 0, AY + 0.05, 0, 0.003, 0.06, 6);
  cyl(gp, '#94a3b8', 0, AY + 0.09, 0, 0.005, 0.003, 8);
  cyl(gp, '#e2e8f0', 0, AY + 0.11, 0, 0.0016, 0.035, 5);
  add(gp, LO(), mat('#ef4444', { emissive: '#ef4444' }), 0, AY + 0.146, 0, 0.005, 0.005, 0.005);
};

// =========================================================================================================
// El Castillo, Chichén Itzá
const chichenitza: Builder = (gp, r) => {
  const c = r.color ?? '#bfae8c';
  const hf: HFn = (x, z) => { const d = Math.hypot(x, z); return 0.008 + 0.003 * fbm(x * 12, 0, z * 12) + 0.02 * sstep(0.42, 0.5, d) * fbm(x * 6, 1, z * 6); };
  island(gp, 0.5, hf, '#6f8f45', (x, y, z) => {
    if (Math.abs(x) < 0.03 && z > 0.33) return '#d9cfb8';
    return hash3(Math.floor(x * 55), 0, Math.floor(z * 55)) > 0.86 ? '#5f7f3a' : mix('#7a9a4c', '#6a8a40', fbm(x * 8, y, z * 8));
  }, { rings: 30, segs: 90, side: strataSide(EARTH) });
  const gy = onGround(hf);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + hash3(i, 1, 1) * 0.12, d = 0.4 + hash3(i, 2, 1) * 0.07, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 0.18 && Math.abs(x) < 0.32) continue;
    bush(gp, x, gy(x, z), z, 0.06 + hash3(i, 3, 1) * 0.04, ['#2f6a35', '#3f7a3c', '#4a8a45', '#356f30'][i % 4]);
  }
  // Nine talud-tablero terraces: sloped base, panelled vertical band with recessed niches, projecting moulding
  const G = 0.044, NT = 9, B0 = 0.26, BT = 0.1, TH = 0.03, SW = 0.044;
  const faces = [0, 1, 2, 3].map(f => grp(gp, 0, 0, 0, (f * Math.PI) / 2));
  for (let k = 0; k < NT; k++) {
    const hw = B0 - ((B0 - BT) * k) / NT, y = G + k * TH, col = mix(c, '#a39a84', hash3(k, 1, 1) * 0.5);
    tbox(gp, 2 * hw, 2 * hw, 2 * (hw - 0.006), 2 * (hw - 0.006), TH * 0.36, shade(col, 0.96), 0, y, 0);
    box(gp, col, 0, y + TH * 0.36, 0, 2 * (hw - 0.007), TH * 0.46, 2 * (hw - 0.007));
    box(gp, shade(col, 1.08), 0, y + TH * 0.82, 0, 2 * (hw - 0.004), TH * 0.18, 2 * (hw - 0.004));
    for (const fg of faces) for (const s of [-1, 1]) {
      for (let u = SW + 0.026; u + 0.012 < hw - 0.012; u += 0.027) box(fg, '#6d675a', s * u, y + TH * 0.42, hw - 0.007 + 0.0006, 0.018, TH * 0.34, 0.0016);
    }
  }
  // Four 91-step staircases with serpent balustrades
  const GT = G + NT * TH, D1 = 0.33, NS = 26, run = (D1 - BT) / NS, rise = (GT - G) / NS;
  faces.forEach((fg, f) => {
    const sl = slab(fg, [[BT - 0.012, G - 0.004], [D1, G - 0.004], [BT - 0.002, GT], [BT - 0.012, GT]], 2 * SW, shade(c, 0.9), 0, false);
    sl.rotation.y = -Math.PI / 2;
    for (let i = 0; i < NS; i++) box(fg, i % 2 ? shade(c, 1.05) : shade(c, 0.98), 0, GT - (i + 1) * rise, BT + (i + 0.5) * run, 2 * SW, rise, run);
    for (const s of [-1, 1]) {
      const x = s * (SW + 0.006);
      tbox(fg, 0.012, 0.012, 0.012, 0.012, 0.012, shade(c, 1.08), x, GT - 0.004, BT - 0.002);
      const b0: V3 = [x, GT + 0.004, BT], b1: V3 = [x, G + 0.01, D1 + 0.002];
      const m = rod(fg, b0, b1, 0.0085, shade(c, 1.1), 4);
      m.rotation.y += 0;
      if (f === 0) {
        // Kukulcán serpent heads at the foot of the north stair
        blob(fg, shade(c, 1.05), x, G + 0.012, D1 + 0.014, 0.012, 0.012, 0.02);
        blob(fg, shade(c, 0.95), x, G + 0.004, D1 + 0.022, 0.011, 0.005, 0.016);
        blob(fg, '#3f3a32', x + s * 0.008, G + 0.017, D1 + 0.02, 0.003);
        for (const fx of [-1, 1]) strut(fg, [x + fx * 0.005, G + 0.008, D1 + 0.03], [x + fx * 0.005, G + 0.002, D1 + 0.031], 0.0018, 0.0004, '#efe8d8', 4);
      }
    }
  });
  // Temple of Kukulcán: doorways (three on the north with serpent columns), frieze & cornices
  const TY = GT, TW = 0.13;
  box(gp, shade(c, 0.6), 0, TY, 0, TW - 0.02, 0.05, TW - 0.02);
  faces.forEach((fg, f) => {
    const holes: THREE.Path[] = [];
    const doors = f === 0 ? [-0.032, 0, 0.032] : [0];
    for (const dx of doors) { const p = new THREE.Path(); p.moveTo(dx - 0.011, 0); p.lineTo(dx + 0.011, 0); p.lineTo(dx + 0.011, 0.032); p.lineTo(dx - 0.011, 0.032); p.closePath(); holes.push(p); }
    panel(fg, TW, 0.048, 0.01, shade(c, 1.04), holes, 0, TY, TW / 2 - 0.005);
    if (f === 0) for (const dx of [-0.016, 0.016]) { cyl(fg, shade(c, 1.1), dx, TY, TW / 2 - 0.004, 0.005, 0.032, 6); blob(fg, shade(c, 1.1), dx, TY + 0.004, TW / 2 + 0.003, 0.006, 0.004, 0.008); }
    for (let i = 0; i < 9; i++) box(fg, '#8a8270', -0.056 + i * 0.014, TY + 0.06, TW / 2 + 0.0025, 0.007, 0.012, 0.002);
  });
  box(gp, shade(c, 1.1), 0, TY + 0.048, 0, TW + 0.008, 0.008, TW + 0.008);
  box(gp, shade(c, 1.0), 0, TY + 0.056, 0, TW + 0.002, 0.022, TW + 0.002);
  box(gp, shade(c, 1.12), 0, TY + 0.078, 0, TW + 0.01, 0.007, TW + 0.01);
  box(gp, shade(c, 0.95), 0, TY + 0.085, 0, TW - 0.01, 0.006, TW - 0.01);
  for (let i = 0; i < 10; i++) person(gp, -0.3 + hash3(i, 4, 1) * 0.6, gy(0, 0.36), 0.34 + hash3(i, 4, 2) * 0.06, ['#f8fafc', '#dc2626', '#2563eb', '#f59e0b'][i % 4]);
};

// =========================================================================================================
// Machu Picchu
function llama(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c: string): void {
  const l = grp(p, x, y, z, ry);
  for (const [lx, lz] of [[-0.004, -0.008], [0.004, -0.008], [-0.004, 0.008], [0.004, 0.008]]) box(l, shade(c, 0.85), lx, 0, lz, 0.0025, 0.012, 0.0025);
  blob(l, c, 0, 0.016, 0, 0.007, 0.0065, 0.013);
  rod(l, [0, 0.018, 0.01], [0, 0.032, 0.014], 0.003, c, 5);
  blob(l, c, 0, 0.034, 0.017, 0.0032, 0.0032, 0.0055);
  for (const s of [-1, 1]) strut(l, [s * 0.002, 0.036, 0.015], [s * 0.003, 0.042, 0.014], 0.0012, 0.0004, c, 4);
}
function incaHouse(p: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, ry: number, roof: boolean, seed: number): void {
  const h = 0.022, t = 0.004, st = mix('#a8a092', '#8f8879', hash3(seed, 1, 1));
  const q = grp(p, x, y, z, ry);
  box(q, st, 0, 0, d / 2 - t / 2, w, h, t);
  box(q, st, 0, 0, -d / 2 + t / 2, w, h, t);
  for (const s of [-1, 1]) { box(q, st, s * (w / 2 - t / 2), 0, 0, t, h, d); gable(q, t, 0.016, d, st, s * (w / 2 - t / 2), h, 0); }
  tbox(q, 0.0075, 0.002, 0.005, 0.002, 0.014, '#3b352d', 0, 0, d / 2);
  for (const s of [-1, 1]) tbox(q, 0.005, 0.002, 0.0035, 0.002, 0.007, '#3b352d', s * w * 0.3, 0.009, d / 2);
  if (roof) gable(q, w + 0.008, 0.024, d + 0.01, '#b08d4f', 0, h - 0.002, 0);
}

const machupicchu: Builder = gp => {
  const P = 0.19;
  const plateau = (x: number, z: number) => 1 - ((x / 0.24) ** 2 + ((z - 0.0) / 0.19) ** 2);
  const peak = (x: number, z: number, px: number, pz: number, h: number, rr: number, e = 1.25) => {
    const dx = x - px, dz = z - pz, d = Math.max(Math.hypot(dx, dz), (Math.abs(dx) + Math.abs(dz)) * 0.76);
    return h * Math.pow(Math.max(0, 1 - d / rr), e);
  };
  const hf: HFn = (x, z) => {
    const hp = peak(x, z, 0.03, -0.33, 0.66, 0.2, 1.2);
    const up = peak(x, z, -0.19, -0.24, 0.3, 0.14);
    const bg = Math.max(peak(x, z, -0.42, -0.08, 0.34, 0.22), peak(x, z, 0.42, -0.12, 0.3, 0.2), peak(x, z, 0.3, -0.42, 0.42, 0.2));
    const m = plateau(x, z);
    const cit = P * sstep(-2.2, 0, m) - (m > 0 ? 0 : 0);
    const saddle = 0.15 * Math.exp(-((x / 0.08) ** 2)) * sstep(-0.42, -0.16, z) * sstep(-0.05, -0.18, z) * 0;
    let y = Math.max(hp, up, bg, cit, saddle);
    const rough = sstep(0.04, 0.2, y) * (m > 0 ? 0 : 1);
    y += (0.01 + y * 0.12) * ridged(x * 12, z * 12) * rough;
    return Math.max(0.006 + 0.008 * fbm(x * 9, 2, z * 9), y);
  };
  island(gp, 0.5, hf, '#3f7a3a', (x, y, z, _nx, ny) => {
    const t = y - 0.035;
    if (t < 0.012 && ny > 0.9) return Math.abs(Math.hypot(x, z) - 0.45) < 0.03 ? ripple('#7a8a6a')(x, y, z, 0, 1, 0) : '#6a7a4a';
    if (plateau(x, z) > 0 && ny > 0.9) return '#7aa452';
    if (ny < 0.5 && fbm(x * 26, y * 26, z * 26) > 0.5) return fbm(x * 60, y * 60, z * 60) > 0.5 ? '#6b6e70' : '#85878a';
    if (y > 0.3) return hash3(Math.floor(x * 80), Math.floor(y * 80), Math.floor(z * 80)) > 0.5 ? '#2f6a35' : '#3d7c3c';
    return hash3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70)) > 0.6 ? '#2f5f2e' : mix('#3f7a3a', '#4f8a42', fbm(x * 9, y * 9, z * 9));
  }, { rings: 52, segs: 120, side: strataSide(EARTH) });
  // Agricultural terraces: stacked dry-stone contour walls stepping down the south & east flanks
  const Y0 = 0.035;
  for (let k = 7; k >= 1; k--) {
    const top = Y0 + P - k * 0.021, rx = 0.24 + k * 0.024, rz = 0.19 + k * 0.022, cz = k * 0.012;
    const plan = ELL(0.0 + k * 0.004, cz, rx, rz, 48, 0.035, 0.7);
    prism(gp, plan, Y0, top - Y0, mix('#8f887a', '#a39b8b', hash3(k, 2, 2)));
    prism(gp, ELL(0.0 + k * 0.004, cz, rx - 0.004, rz - 0.004, 48, 0.035, 0.7), top, 0.0025, k % 2 ? '#6f9a4a' : '#7aa452');
  }
  prism(gp, ELL(0, 0, 0.245, 0.195, 48, 0.035, 0.7), Y0, P - 0.004, '#9a9384');
  const TOP = Y0 + P;
  prism(gp, ELL(0, 0, 0.24, 0.19, 48, 0.035, 0.7), TOP - 0.004, 0.004, '#7aa452');
  // Main plaza (sunken lawn) and the raised sacred / urban sectors either side
  prism(gp, [[-0.1, -0.06], [-0.13, 0.06], [-0.24, 0.05], [-0.22, -0.08], [-0.15, -0.14]], TOP, 0.012, '#9a9384');
  prism(gp, [[-0.1, -0.06], [-0.13, 0.06], [-0.24, 0.05], [-0.22, -0.08], [-0.15, -0.14]].map(([x, z]) => [x * 0.97, z * 0.97] as [number, number]), TOP + 0.012, 0.002, '#7aa452');
  prism(gp, [[0.06, -0.14], [0.22, -0.08], [0.23, 0.07], [0.08, 0.12]], TOP, 0.008, '#9a9384');
  const houses: [number, number, number, number, number, boolean][] = [
    [-0.17, -0.1, 0.04, 0.026, 0.3, true], [-0.2, -0.04, 0.036, 0.024, 0.1, false], [-0.17, 0.02, 0.04, 0.026, -0.1, false], [-0.12, -0.03, 0.03, 0.024, 1.4, false],
    [0.1, -0.1, 0.04, 0.026, -0.3, false], [0.15, -0.06, 0.036, 0.024, -0.2, true], [0.2, -0.02, 0.036, 0.024, -1.4, false], [0.11, -0.02, 0.036, 0.024, -0.2, false],
    [0.15, 0.03, 0.04, 0.026, -0.1, false], [0.1, 0.07, 0.036, 0.024, 0.1, false], [0.19, 0.06, 0.03, 0.024, -1.5, true], [-0.06, 0.12, 0.036, 0.024, 0.0, true],
    [0.02, 0.15, 0.04, 0.026, 0.0, false], [-0.2, 0.08, 0.032, 0.024, 0.4, false], [0.06, -0.15, 0.032, 0.024, -0.5, false], [-0.08, -0.14, 0.032, 0.024, 0.4, false],
  ];
  houses.forEach(([x, z, w, d, ry, roof], i) => {
    const raise = x < -0.1 && z < 0.06 ? 0.014 : x > 0.06 && z < 0.12 && z > -0.14 ? 0.008 : 0;
    incaHouse(gp, x, TOP + raise, z, w, d, ry, roof, i);
  });
  // Temple of the Sun (Torreón) & Intihuatana hill
  cyl(gp, '#a9a293', 0.02, TOP, -0.06, 0.022, 0.034, 14);
  cyl(gp, '#8e877a', 0.02, TOP + 0.034, -0.06, 0.023, 0.003, 14);
  for (let k = 0; k < 3; k++) prism(gp, ELL(-0.19, -0.13, 0.05 - k * 0.014, 0.04 - k * 0.012, 16), TOP + 0.014 + k * 0.012, 0.012, k % 2 ? '#9a9384' : '#a8a092');
  box(gp, '#b7b0a2', -0.19, TOP + 0.05, -0.13, 0.01, 0.014, 0.006);
  // Huayna Picchu summit terraces, cloud-forest mist and the llamas
  for (let k = 0; k < 3; k++) prism(gp, ELL(0.03, -0.32, 0.03 - k * 0.006, 0.026 - k * 0.006, 12), 0.035 + 0.55 + k * 0.012, 0.014, '#8a8478');
  const mist = mat('#eef2f6', { transparent: 0.5 });
  for (const [x, y, z, s, n] of [[-0.3, 0.2, -0.2, 0.06, 5], [0.3, 0.26, -0.3, 0.05, 4]]) for (let j = 0; j < n; j++) add(gp, LO(), mist, x + (j - n / 2) * s * 0.7, y + hash3(j, n, 1) * s * 0.4, z + (j - n / 2) * s * 0.35, s * 1.1, s * 0.5, s * 0.9);
  llama(gp, -0.02, TOP + 0.001, 0.02, 0.6, '#f1ece0');
  llama(gp, 0.04, TOP + 0.001, 0.07, -0.8, '#8a6a4a');
  llama(gp, -0.01, Y0 + P - 0.021, 0.23, 1.4, '#e8dcc5');
  for (let i = 0; i < 6; i++) person(gp, -0.05 + hash3(i, 5, 1) * 0.1, TOP, -0.05 + hash3(i, 5, 2) * 0.14, ['#dc2626', '#2563eb', '#f59e0b'][i % 3], 0.8);
};

// =========================================================================================================
// Moai of Ahu Tongariki
function moaiFig(p: THREE.Object3D, x: number, y: number, z: number, H: number, ry: number, seed: number, pukao: boolean, rx = 0): THREE.Group {
  const q = grp(p, x, y, z, ry);
  q.rotation.x = rx;
  const prof: [number, number, number, number][] = [
    [0, 0.165, 0.115, 0], [0.3, 0.16, 0.115, 0], [0.46, 0.16, 0.11, 0], [0.5, 0.15, 0.11, 0.008], [0.55, 0.145, 0.12, 0.022],
    [0.64, 0.15, 0.13, 0.024], [0.74, 0.15, 0.13, 0.022], [0.83, 0.15, 0.125, 0.012], [0.93, 0.142, 0.11, 0], [1, 0.128, 0.1, -0.01],
  ];
  const at = (t: number) => {
    let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < t) i++;
    const a = prof[i], b = prof[i + 1], u = sstep(0, 1, (t - a[0]) / (b[0] - a[0]));
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
  };
  const gau = (v: number, s: number) => Math.exp(-((v / s) ** 2));
  const NR = 20, NA = 24, rings: V3[][] = [];
  for (let i = 0; i <= NR; i++) {
    const t = i / NR, [wx, wz, oz] = at(t), ring: V3[] = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let px = wx * Math.sign(ca) * Math.abs(ca) ** 0.7, pz = wz * Math.sign(sa) * Math.abs(sa) ** 0.7 + oz;
      if (sa > 0) {
        const fx = px / wx, front = sa ** 2;
        let bump = 0;
        bump += 0.075 * gau(fx, 0.22) * gau(t - 0.69, 0.07) * (t < 0.64 ? 0.6 : 1);
        bump += 0.035 * gau(fx, 0.75) * gau(t - 0.825, 0.025);
        bump -= 0.025 * gau(Math.abs(fx) - 0.45, 0.2) * gau(t - 0.77, 0.03);
        bump += 0.022 * gau(fx, 0.4) * gau(t - 0.6, 0.015);
        bump += 0.03 * gau(fx, 0.5) * gau(t - 0.555, 0.02);
        pz += bump * front;
      }
      if (Math.abs(ca) > 0.85 && t > 0.6 && t < 0.88) px += Math.sign(ca) * 0.018;
      ring.push([px * H, t * H, pz * H]);
    }
    rings.push(ring);
  }
  const base = mix('#7a6a5a', '#8a7865', hash3(seed, 1, 1));
  skin(q, rings, base, { caps: true, flat: true, paint: (px, py, pz, _nx, ny) => {
    const t = py / H, fx = px / H;
    if (ny > 0.8) return shade(base, 0.9);
    if (pz > 0.1 * H && t > 0.74 && t < 0.8 && Math.abs(Math.abs(fx) - 0.07) < 0.04) return '#4a3f35';
    if (t < 0.45 && t > 0.08 && pz > 0 && Math.abs(Math.abs(fx) - 0.12) < 0.01) return shade(base, 0.74);
    if (t < 0.3 && t > 0.24 && pz > 0.08 * H && Math.abs(fx) < 0.12) return shade(base, 0.82);
    const n = fbm(px * 80 / H, py * 60 / H, pz * 80 / H + seed);
    return n > 0.64 ? '#9a8e6e' : n < 0.32 ? shade(base, 0.86) : null;
  } });
  if (pukao) {
    lathe(q, [[0.13 * H, 0], [0.15 * H, 0.03 * H], [0.15 * H, 0.11 * H], [0.12 * H, 0.14 * H], [0.06 * H, 0.15 * H], [0.05 * H, 0.18 * H], [0, 0.18 * H]], '#8b3d2b', 0, H - 0.01 * H, -0.01 * H, 12);
  }
  return q;
}
const moai: Builder = (gp, r) => {
  const cnt = Math.max(7, Math.min(15, typeof r.count === 'number' && r.count >= 7 ? r.count : 11));
  // Inland grass in front (+z), the ahu, then the volcanic boulder shore and the Pacific behind (-z)
  const shoreZ = (x: number) => -0.13 + 0.03 * Math.sin(x * 9) + 0.015 * Math.sin(x * 23);
  const hf: HFn = (x, z) => {
    const s = z - shoreZ(x);
    if (s < -0.05) return 0.002;
    return 0.002 + 0.012 * sstep(-0.05, 0.03, s) + 0.012 * fbm(x * 7, 0, z * 7) * sstep(0, 0.2, s) + 0.04 * sstep(0.3, 0.5, z) * fbm(x * 4, 1, z * 4);
  };
  island(gp, 0.5, hf, '#7a9a4a', (x, y, z, _nx, ny) => {
    const s = z - shoreZ(x);
    if (s < -0.05 && y < 0.04) return s > -0.075 || Math.sin(x * 50 + z * 30) > 0.92 ? '#e6f2f8' : ripple('#1f6f9f')(x, y, z, 0, 1, 0);
    if (s < 0.02) return hash3(Math.floor(x * 80), 0, Math.floor(z * 80)) > 0.5 ? '#3b3632' : '#55504a';
    if (ny < 0.85) return '#6b5a48';
    return hash3(Math.floor(x * 60), 1, Math.floor(z * 60)) > 0.8 ? '#8aa858' : mix('#7a9a4a', '#a3a35a', fbm(x * 8, 0, z * 8));
  }, { rings: 34, segs: 100, side: strataSide(['#4a4038', '#5a4e44', '#3b332d']) });
  const gy = onGround(hf);
  for (let i = 0; i < 26; i++) {
    const x = -0.45 + hash3(i, 2, 1) * 0.9, z = shoreZ(x) - 0.04 + hash3(i, 2, 2) * 0.05;
    if (Math.hypot(x, z) < 0.48) blob(gp, i % 2 ? '#3a3531' : '#4a443e', x, 0.038, z, 0.012 + hash3(i, 2, 3) * 0.012, 0.008, 0.012, hash3(i, 2, 4) * 3);
  }
  // Ahu: long platform faced with fitted basalt slabs, paved ramp with round poro stones in front
  const AL = 0.84, AZ = -0.03, AY = 0.05, AH = 0.03;
  pbox(gp, AL, AH, 0.07, 0, AY - 0.008, AZ, '#6e655b', (x, y, _z, _nx, ny) => {
    if (ny > 0.5) return '#7d7468';
    const i = Math.floor((x + AL / 2) / 0.042), j = Math.floor(y / (AH / 2));
    return hash3(i, j, 3) > 0.6 ? '#5f574e' : hash3(i, j, 4) > 0.5 ? '#80766a' : null;
  }, [20, 2, 1]);
  tbox(gp, AL + 0.02, 0.07, AL, 0.005, 0.016, '#8a8070', 0, AY - 0.012, AZ + 0.07, 0, -0.03);
  for (let i = 0; i < 40; i++) {
    const x = -0.4 + hash3(i, 6, 1) * 0.8, z = AZ + 0.05 + hash3(i, 6, 2) * 0.06;
    blob(gp, i % 3 ? '#8c8478' : '#6f675d', x, AY - 0.003 - (z - AZ - 0.05) * 0.2, z, 0.008, 0.004, 0.007);
  }
  // The row of moai, backs to the sea; two wearing red-scoria pukao topknots
  for (let i = 0; i < cnt; i++) {
    const x = -AL / 2 + 0.045 + (i * (AL - 0.09)) / (cnt - 1);
    const H = 0.17 + hash3(i, 3, 1) * 0.045 + (i === 5 ? 0.03 : 0);
    box(gp, '#5f574e', x, AY + AH - 0.008, AZ, 0.05, 0.006, 0.04);
    moaiFig(gp, x, AY + AH - 0.002, AZ, H, (hash3(i, 3, 2) - 0.5) * 0.12, i, i === 5 || i === 9);
  }
  // A toppled moai lying face-down on the grass, and visitors for scale
  moaiFig(gp, -0.22, 0.05, 0.27, 0.17, 0.9, 99, false, Math.PI / 2 - 0.08).position.y = 0.06;
  for (let i = 0; i < 4; i++) person(gp, 0.1 + i * 0.04, gy(0.1 + i * 0.04, 0.3), 0.3 + (i % 2) * 0.02, ['#dc2626', '#2563eb', '#f8fafc', '#16a34a'][i]);
};

// =========================================================================================================
// Stonehenge
function megalith(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, ry: number, col: string, seed: number, lean = 0, taper = 0.15, rz = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1, 2, 3, 1);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const kx = Math.round(px * 4), ky = Math.round(py * 6), kz = Math.round(pz * 4);
    const n = (hash3(kx + seed * 7, ky, kz) - 0.5) * 0.16, m = (hash3(kx, ky + seed * 3, kz + 9) - 0.5) * 0.12;
    const tp = 1 - taper * (py + 0.5);
    let yy = py + (py > 0.4 ? -Math.abs(px) * 0.12 - Math.abs(pz) * 0.08 : 0);
    yy += py > 0 ? m * 0.3 : 0;
    pos.setXYZ(i, (px * tp + n) * w, (yy + 0.5) * h, (pz * tp + m) * d);
  }
  geo.computeVertexNormals();
  const painted = paintFaces(geo, col, (px, py, pz) => {
    const v = fbm(px * 90 + seed, py * 70, pz * 90);
    return v > 0.66 ? '#a9ab84' : v < 0.34 ? shade(col, 0.82) : hash3(Math.floor(px * 300), Math.floor(py * 300), seed) > 0.9 ? shade(col, 1.12) : null;
  });
  return add(p, painted, mat('#ffffff', { vc: true }), x, y, z, 1, 1, 1, ry, lean, rz);
}
const stonehenge: Builder = (gp, r) => {
  const c = r.color ?? '#8e8c84', blue = '#646a72';
  // Salisbury Plain: grass with mowing stripes, the circular ditch & bank, the Avenue and round barrows
  const hf: HFn = (x, z) => {
    const d = Math.hypot(x, z), ent = x > -0.06 && x < 0.06 && z > 0;
    let y = 0.01 + 0.006 * fbm(x * 5, 0, z * 5);
    if (!ent) y += 0.009 * Math.exp(-(((d - 0.37) / 0.016) ** 2)) - 0.008 * Math.exp(-(((d - 0.415) / 0.014) ** 2));
    if (z > 0.3) y += 0.006 * (Math.exp(-(((x - 0.07) / 0.01) ** 2)) + Math.exp(-(((x + 0.07) / 0.01) ** 2)));
    for (const [bx, bz] of [[-0.33, -0.3], [0.36, -0.26], [0.2, -0.42]]) y += 0.03 * Math.max(0, 1 - Math.hypot(x - bx, z - bz) / 0.06) ** 1.5;
    return y;
  };
  island(gp, 0.5, hf, '#6f9a48', (x, _y, z, _nx, ny) => {
    const d = Math.hypot(x, z);
    if (Math.abs(d - 0.3) < 0.007 && !(z > 0.25 && Math.abs(x) < 0.08)) return '#cfc6ae';
    if (ny < 0.97) return '#5f8a3f';
    return Math.floor((x + z) * 30) % 2 ? '#6f9a48' : '#78a350';
  }, { rings: 44, segs: 120, side: strataSide(['#e8e3d4', '#d9d2c0', '#6b4f3a']) });
  const gy = onGround(hf);
  const Y = 0.043;
  const M = grp(gp, 0, -Y * 0.22, 0, 0);
  M.scale.setScalar(1.22);
  // Sarsen circle (30 positions): the north-east run still carries its lintels; gaps, stumps & fallen stones elsewhere
  const RS = 0.19, NSS = 30;
  const stand = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 16, 21, 22, 23, 26, 27, 28, 29]);
  const lint = [[26, 27], [27, 28], [28, 29], [29, 0], [0, 1], [1, 2], [5, 6], [22, 23], [10, 11]];
  const ang = (i: number) => (i / NSS) * Math.PI * 2 + Math.PI / NSS;
  const SH = 0.1;
  for (let i = 0; i < NSS; i++) {
    const a = ang(i), x = Math.sin(a) * RS, z = Math.cos(a) * RS;
    if (stand.has(i)) megalith(M, x, Y - 0.004, z, 0.03, SH + hash3(i, 1, 1) * 0.01, 0.02, a, c, i, (hash3(i, 2, 1) - 0.5) * 0.06, 0.12);
    else if (hash3(i, 3, 1) > 0.5) megalith(M, x, Y - 0.004, z, 0.026, 0.018, 0.018, a, c, i + 40);
  }
  for (const [i, j] of lint) {
    const a0 = ang(i), a1 = ang(j < i ? j + NSS : j), am = (a0 + a1) / 2, L = 2 * RS * Math.sin((a1 - a0) / 2) + 0.03;
    megalith(M, Math.sin(am) * RS, Y + SH + 0.004, Math.cos(am) * RS, L, 0.014, 0.018, am, shade(c, 1.03), i + 70, 0, 0.02);
  }
  for (const [i, k] of [[13, 1], [19, -1], [24, 1]]) {
    const a = ang(i) + k * 0.05, x = Math.sin(a) * (RS + 0.03 * k), z = Math.cos(a) * (RS + 0.03 * k);
    megalith(M, x, Y - 0.002, z, 0.028, 0.02, 0.09, a + 0.3 * k, shade(c, 0.95), i + 90, 0, 0.05);
  }
  // Trilithon horseshoe opening to the north-east (+z); the Great Trilithon has fallen apart
  const tri: [number, number, number, boolean][] = [[Math.PI, 0.1, 0.16, false], [Math.PI - 0.95, 0.105, 0.135, true], [Math.PI + 0.95, 0.105, 0.135, true], [Math.PI - 1.75, 0.11, 0.12, true], [Math.PI + 1.75, 0.11, 0.12, false]];
  tri.forEach(([a, rr, h, whole], ti) => {
    const cx = Math.sin(a) * rr, cz = Math.cos(a) * rr, tx = Math.cos(a), tz = -Math.sin(a);
    for (const s of [-1, 1]) {
      if (ti === 0 && s === 1) { megalith(M, cx + tx * 0.03 + 0.02, Y - 0.002, cz + 0.03, 0.035, 0.026, 0.13, a + 0.5, c, 120, 0, 0.08); continue; }
      megalith(M, cx + tx * s * 0.022, Y - 0.004, cz + tz * s * 0.022, 0.03, h, 0.026, a, c, ti * 5 + s + 130, ti === 0 ? -0.08 : 0, 0.1);
    }
    if (whole) megalith(M, cx, Y + h - 0.002, cz, 0.08, 0.018, 0.024, a, shade(c, 1.04), ti + 150, 0, 0.02);
    else if (ti === 4) megalith(M, cx - 0.03, Y - 0.002, cz + 0.02, 0.07, 0.018, 0.026, a + 0.6, c, 160, 0, 0.03);
  });
  megalith(M, 0.005, Y - 0.002, -0.06, 0.07, 0.012, 0.022, 0.1, '#7a6f62', 170, 0, 0.02);
  // Bluestone circle & bluestone horseshoe
  for (let i = 0; i < 34; i++) {
    if (hash3(i, 8, 1) < 0.35) continue;
    const a = (i / 34) * Math.PI * 2, x = Math.sin(a) * 0.15, z = Math.cos(a) * 0.15, tall = hash3(i, 8, 2) > 0.4;
    megalith(M, x, Y - 0.003, z, 0.014, tall ? 0.04 + hash3(i, 8, 3) * 0.015 : 0.012, 0.011, a, blue, i + 200, (hash3(i, 8, 4) - 0.5) * 0.2, 0.2);
  }
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10 - 0.5) * 3.6, x = Math.sin(a) * 0.065, z = Math.cos(a) * 0.075;
    if (hash3(i, 9, 1) > 0.3) megalith(M, x, Y - 0.003, z, 0.012, 0.055, 0.01, a, shade(blue, 1.06), i + 240, 0, 0.25);
  }
  // Heel Stone, Slaughter Stone & Station Stones
  megalith(gp, 0.03, gy(0.03, 0.36) - 0.004, 0.36, 0.05, 0.075, 0.04, 0.2, shade(c, 0.93), 300, -0.18, 0.3);
  megalith(gp, -0.015, gy(0, 0.31) - 0.003, 0.31, 0.03, 0.01, 0.07, 0.1, shade(c, 0.9), 301, 0, 0.05);
  for (const [x, z] of [[0.24, -0.15], [-0.25, 0.14]]) megalith(gp, x, gy(x, z) - 0.003, z, 0.016, 0.03, 0.014, 0, c, 302 + x, 0, 0.1);
  // Visitors on the path, a few sheep on the plain
  for (let i = 0; i < 8; i++) { const a = -2.4 + i * 0.22, x = Math.sin(a) * 0.3, z = Math.cos(a) * 0.3; person(gp, x, gy(x, z), z, ['#dc2626', '#2563eb', '#f8fafc', '#facc15', '#16a34a'][i % 5]); }
  for (let i = 0; i < 5; i++) { const x = -0.34 + i * 0.05, z = 0.24 + hash3(i, 11, 1) * 0.06; blob(gp, '#f1ede4', x, gy(x, z) + 0.008, z, 0.008, 0.006, 0.011, i); blob(gp, '#2f2a26', x, gy(x, z) + 0.01, z + 0.011, 0.003, 0.003, 0.004); }
};

// =========================================================================================================
// Louvre Pyramid & Cour Napoléon
const louvre: Builder = (gp, r) => {
  const glassC = r.color ?? '#9fc6dd', stone = '#e3cfa6', slate = '#5f6a7c', pave = '#d8d0c0';
  island(gp, 0.5, () => 0.004, pave, (x, _y, z, _nx, ny) => (ny < 0.9 ? null : Math.abs(x) > 0.36 || z < -0.37 ? '#7a8a5a' : (Math.floor(x * 40) + Math.floor(z * 40)) % 2 ? '#d2c9b8' : null), { rings: 16, segs: 72, side: strataSide(['#b8ae9a', '#a89f8e']) });
  const G = 0.039;
  // Palace wings: Richelieu (-x), Denon (+x), Sully (-z) — rusticated ground floor, two piano nobile storeys, attic, mansards
  const FH = 0.12, WD = 0.075, BAY = 0.011;
  const facade = (w: number, d: number): Paint => (x, y, z, nx, ny) => {
    if (ny > 0.5 || ny < -0.5) return null;
    const side = Math.abs(nx) > 0.5, u = side ? z + d / 2 : x + w / 2, n = Math.max(1, Math.round((side ? d : w) / BAY));
    const bay = Math.floor((u / (side ? d : w)) * n), win = bay % 2 === 1 && bay > 0 && bay < n - 1, row = Math.floor(y / 0.01);
    if (row <= 2) return row === 1 && win ? '#3a3f4a' : row === 2 ? shade(stone, 0.93) : null;
    if (row === 3 || row === 6) return shade(stone, 1.05);
    if (row >= 11) return shade(stone, 1.08);
    return win && row !== 9 ? (row === 10 ? '#5a6070' : '#3f4756') : null;
  };
  const segs = (w: number, d: number): [number, number, number] => [Math.max(1, Math.round(w / BAY)), 12, Math.max(1, Math.round(d / BAY))];
  const wing = (x0: number, z0: number, x1: number, z1: number) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    pbox(gp, w, FH, d, cx, G, cz, stone, facade(w, d), segs(w, d));
    box(gp, shade(stone, 1.06), cx, G + FH - 0.004, cz, w + 0.006, 0.006, d + 0.006);
    const along = w > d, L = along ? w : d, Wd = along ? d : w;
    tbox(gp, along ? L : Wd + 0.004, along ? Wd + 0.004 : L, along ? L - 0.02 : Wd * 0.35, along ? Wd * 0.35 : L - 0.02, 0.045, slate, cx, G + FH + 0.002, cz);
    for (let s = -L / 2 + 0.02; s < L / 2 - 0.015; s += 0.022) {
      for (const sd of [-1, 1]) {
        const ox = along ? s : sd * (Wd / 2 - 0.007), oz = along ? sd * (Wd / 2 - 0.007) : s;
        box(gp, '#ece2c8', cx + ox, G + FH + 0.002, cz + oz, along ? 0.008 : 0.01, 0.013, along ? 0.01 : 0.008);
        gable(gp, along ? 0.012 : 0.011, 0.006, along ? 0.011 : 0.012, slate, cx + ox, G + FH + 0.015, cz + oz, along ? Math.PI / 2 : 0);
      }
      if (hash3(s * 100, 1, x0) > 0.55) box(gp, '#a8998a', cx + (along ? s + 0.011 : 0), G + FH + 0.04, cz + (along ? 0 : s + 0.011), 0.006, 0.016, 0.01);
    }
  };
  const IX = 0.265, BZ = -0.29, FZ = 0.33;
  wing(-IX - WD, BZ - WD, -IX, FZ);
  wing(IX, BZ - WD, IX + WD, FZ);
  wing(-IX, BZ - WD, IX, BZ);
  // Pavilions with paired columns, sculpted pediments and square "à l'impériale" domes
  const pavilion = (x: number, z: number, w: number, d: number, face: number, tall: number, dome: boolean) => {
    const H = FH + tall;
    pbox(gp, w, H, d, x, G, z, shade(stone, 1.03), facade(w, d), [...segs(w, d)].map((v, i) => (i === 1 ? Math.round(H / 0.01) : v)) as [number, number, number]);
    box(gp, shade(stone, 1.08), x, G + H - 0.005, z, w + 0.008, 0.007, d + 0.008);
    const fg = grp(gp, x, 0, z, face);
    const fw = Math.abs(face % Math.PI) > 0.1 ? d : w, fd = Math.abs(face % Math.PI) > 0.1 ? w : d;
    for (const s of [-1, 1]) for (const k of [0.3, 0.4]) cyl(fg, '#f1e6c9', s * fw * k, G + 0.032, fd / 2 + 0.003, 0.003, H - 0.04, 6);
    gable(fg, fw * 0.6, 0.02, 0.006, shade(stone, 1.08), 0, G + H + 0.002, fd / 2 - 0.001);
    if (dome) {
      const rr = Math.max(w, d) * 0.5 * Math.SQRT2 * 0.92;
      const dm = lathe(gp, [[rr, 0], [rr * 0.94, 0.03], [rr * 0.78, 0.06], [rr * 0.5, 0.085], [rr * 0.2, 0.095], [0.001, 0.097]], slate, x, G + H + 0.002, z, 4);
      dm.rotation.y = Math.PI / 4;
      cyl(gp, '#c9a646', x, G + H + 0.097, z, 0.006, 0.02, 6);
      blob(gp, '#c9a646', x, G + H + 0.12, z, 0.006);
    } else {
      tbox(gp, w + 0.004, d + 0.004, w * 0.55, d * 0.55, 0.045, slate, x, G + H + 0.002, z);
    }
  };
  pavilion(-IX - WD / 2, -0.04, WD + 0.024, 0.1, Math.PI / 2, 0.035, true);
  pavilion(IX + WD / 2, -0.04, WD + 0.024, 0.1, -Math.PI / 2, 0.035, true);
  pavilion(0, BZ - WD / 2, 0.11, WD + 0.024, 0, 0.05, true);
  pavilion(-IX - WD / 2, BZ - WD / 2, WD + 0.02, WD + 0.02, Math.PI / 2, 0.025, false);
  pavilion(IX + WD / 2, BZ - WD / 2, WD + 0.02, WD + 0.02, -Math.PI / 2, 0.025, false);
  pavilion(-IX - WD / 2, FZ - 0.03, WD + 0.02, 0.066, Math.PI / 2, 0.02, false);
  pavilion(IX + WD / 2, FZ - 0.03, WD + 0.02, 0.066, -Math.PI / 2, 0.02, false);
  // Pei's triangular reflecting basins with fountain jets
  const PZ = 0.04, PH = 0.1, PY = G;
  const pool = (pts: [number, number][]) => {
    prism(gp, pts, G, 0.007, '#c8c0b0');
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cz = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    prism(gp, pts.map(([x, z]) => [cx + (x - cx) * 0.84, cz + (z - cz) * 0.84] as [number, number]), G + 0.0072, 0.0006, '#3d8fc0');
    const jet = mat('#e0f2fe', { transparent: 0.6, emissive: '#bae6fd' });
    for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.2; add(gp, CYLG(), jet, cx + (pts[1][0] - cx) * t, G + 0.016, cz + (pts[1][1] - cz) * t, 0.0025, 0.016, 0.0025); }
  };
  const O = 0.22, I = 0.125, Wk = 0.022;
  for (let f = 0; f < 4; f++) {
    const rot = (p: [number, number]): [number, number] => { const a = (f * Math.PI) / 2, cs = Math.cos(a), sn = Math.sin(a); return [p[0] * cs - p[1] * sn, PZ + p[0] * sn + p[1] * cs]; };
    if (f === 0) continue;
    for (const s of [-1, 1]) pool([rot([s * O, O]), rot([s * Wk, O]), rot([s * I, I])]);
  }
  // Glass pyramid: tinted panes, stainless ridges and the rhombic mullion lattice
  const A: V3 = [0, PY + PH * 1.33, PZ], hb = PH * 1.0;
  const C4: V3[] = [[-hb, PY, PZ - hb], [hb, PY, PZ - hb], [hb, PY, PZ + hb], [-hb, PY, PZ + hb]];
  box(gp, '#3b4252', 0, G - 0.0005, PZ, hb * 2 - 0.004, 0.001, hb * 2 - 0.004);
  const gpos: number[] = [];
  for (let f = 0; f < 4; f++) { const p0 = C4[f], p1 = C4[(f + 1) % 4]; gpos.push(...p1, ...p0, ...A); }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
  gg.computeVertexNormals();
  add(gp, gg, mat(glassC, { transparent: 0.5, metal: 0.6, rough: 0.12 }), 0, 0, 0, 1, 1, 1);
  const N = 9, ln = '#e5e7eb';
  const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const push = (v: V3, f: number): V3 => { const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][f]; return [v[0] + n[0] * 0.0012, v[1] + 0.0006, v[2] + n[1] * 0.0012]; };
  for (let f = 0; f < 4; f++) {
    const p0 = C4[f], p1 = C4[(f + 1) % 4];
    rod(gp, p0, A, 0.0022, '#cbd5e1', 4);
    rod(gp, p0, p1, 0.002, '#9ca3af', 4);
    for (let i = 1; i < N; i++) {
      const t = i / N, s = lerp3(p0, p1, t);
      rod(gp, push(s, f), push(lerp3(p0, A, t), f), 0.0009, ln, 3);
      rod(gp, push(s, f), push(lerp3(p1, A, 1 - t), f), 0.0009, ln, 3);
    }
  }
  for (const [x, z] of [[-0.205, PZ], [0.205, PZ], [0, PZ - 0.205]] as const) {
    const s = 0.028, a: V3 = [x, G + 0.034, z], cs: V3[] = [[x - s, G, z - s], [x + s, G, z - s], [x + s, G, z + s], [x - s, G, z + s]];
    const pp: number[] = [];
    for (let f = 0; f < 4; f++) pp.push(...cs[(f + 1) % 4], ...cs[f], ...a);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); sg.computeVertexNormals();
    add(gp, sg, mat(glassC, { transparent: 0.5, metal: 0.6, rough: 0.12 }), 0, 0, 0, 1, 1, 1);
    for (const v of cs) rod(gp, v, a, 0.0012, '#cbd5e1', 3);
  }
  // Equestrian statue of Louis XIV, lamp posts and visitors
  box(gp, '#d6cdb9', 0.2, G, 0.28, 0.04, 0.03, 0.02);
  blob(gp, '#4a4036', 0.2, G + 0.045, 0.28, 0.014, 0.008, 0.006);
  for (const dx of [-0.009, 0.009]) box(gp, '#4a4036', 0.2 + dx, G + 0.03, 0.28, 0.002, 0.01, 0.002);
  rod(gp, [0.21, G + 0.048, 0.28], [0.218, G + 0.06, 0.28], 0.003, '#4a4036', 5);
  blob(gp, '#4a4036', 0.198, G + 0.06, 0.28, 0.004, 0.008, 0.004);
  for (const [x, z] of [[-0.25, 0.25], [0.25, 0.15], [-0.25, -0.2], [0.25, -0.2], [-0.1, 0.38], [0.1, 0.38]]) {
    cyl(gp, '#334155', x, G, z, 0.0015, 0.04, 5);
    add(gp, LO(), mat('#fef3c7', { emissive: '#fde68a' }), x, G + 0.042, z, 0.007, 0.007, 0.007);
  }
  for (let i = 0; i < 16; i++) person(gp, -0.22 + hash3(i, 12, 1) * 0.44, G, 0.2 + hash3(i, 12, 2) * 0.2, ['#1e293b', '#dc2626', '#f8fafc', '#2563eb', '#a16207'][i % 5]);
};
const CYLG = () => g('am:cyl6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));

// =========================================================================================================
// Space Needle
const spaceneedle: Builder = (gp, r) => {
  const c = r.color ?? '#f0f0f0', cs = shade(c, 0.9), gold = '#d9a441';
  // Seattle Center: lawns, plaza, trees and the monorail
  island(gp, 0.5, (x, z) => 0.006 + 0.003 * fbm(x * 8, 0, z * 8), '#5f8f4a', (x, _y, z) => {
    const d = Math.hypot(x, z);
    if (d < 0.2) return (Math.floor(Math.atan2(z, x) * 8) + Math.floor(d * 60)) % 2 ? '#cfc8ba' : '#c4bcac';
    if (Math.abs(x - z * 0.3) < 0.02) return '#cfc8ba';
    return hash3(Math.floor(x * 60), 0, Math.floor(z * 60)) > 0.85 ? '#4f7f3c' : '#5f8f4a';
  }, { rings: 30, segs: 96, side: strataSide(EARTH) });
  const G = 0.041;
  for (let i = 0; i < 24; i++) {
    const a = hash3(i, 1, 7) * Math.PI * 2, d = 0.26 + hash3(i, 2, 7) * 0.19, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(z + 0.32) < 0.04) continue;
    if (i % 4 === 0) conifer(gp, x, G, z, 0.08, '#2f5e3f');
    else bush(gp, x, G, z, 0.055 + hash3(i, 3, 7) * 0.02, ['#3f7a3c', '#4f8a45', '#b45309', '#3a6b35'][i % 4]);
  }
  // Base pavilion: curved glass building wrapping part of the base
  for (let i = 0; i < 9; i++) {
    const a = 0.6 + i * 0.32, x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.15;
    box(gp, '#3b4a5a', x, G, z, 0.058, 0.03, 0.04, -a + Math.PI / 2).material = mat('#3b4a5a', { metal: 0.6, rough: 0.25 });
    box(gp, '#f1f5f9', x, G + 0.03, z, 0.062, 0.005, 0.046, -a + Math.PI / 2);
  }
  // Monorail beam on T-pylons with a two-car train
  const MZ = -0.33;
  box(gp, '#cbd5e1', 0, G + 0.05, MZ, 0.94, 0.008, 0.012);
  for (let x = -0.4; x <= 0.4; x += 0.2) { box(gp, '#94a3b8', x, G, MZ, 0.012, 0.05, 0.012); box(gp, '#94a3b8', x, G + 0.045, MZ, 0.012, 0.006, 0.03); }
  rbox(gp, '#b91c1c', -0.12, G + 0.058, MZ, 0.1, 0.022, 0.024, 0.008);
  rbox(gp, '#1d4ed8', 0.0, G + 0.058, MZ, 0.1, 0.022, 0.024, 0.008);
  for (const x of [-0.12, 0]) box(gp, '#1e293b', x, G + 0.068, MZ, 0.08, 0.006, 0.0255);
  // Hourglass legs: three pairs of twin steel columns, pinched at the waist, laddered with ties
  const HY = 0.76;
  const prof: [number, number][] = [[G, 0.16], [0.18, 0.105], [0.32, 0.052], [0.44, 0.032], [0.56, 0.036], [0.68, 0.055], [HY, 0.072]];
  const rad = (y: number) => { let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < y) i++; const [y0, r0] = prof[i], [y1, r1] = prof[i + 1], u = (y - y0) / (y1 - y0); return r0 + (r1 - r0) * (u * u * (3 - 2 * u) * 0.5 + u * 0.5); };
  const half = (y: number) => 0.012 - 0.004 * Math.exp(-(((y - 0.44) / 0.15) ** 2));
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 3, ca = Math.cos(a), sa = Math.sin(a);
    const P = (y: number, s: number): V3 => { const rr = rad(y), w = half(y); return [ca * rr - sa * w * s, y, sa * rr + ca * w * s]; };
    for (const s of [-1, 1]) {
      sweep(gp, prof.map(([y]) => ({ p: P(y, s), w: 0.0058 - (y / HY) * 0.0015 })), c, { radial: 7, sub: 3 });
    }
    for (let y = G + 0.03; y < HY - 0.01; y += 0.034) rod(gp, P(y, -1), P(y, 1), 0.0022, cs, 4);
    rbox(gp, '#9ca3af', ca * 0.16, G - 0.004, sa * 0.16, 0.04, 0.012, 0.04, 0.004);
    rod(gp, [ca * rad(0.44), 0.44, sa * rad(0.44)], [ca * 0.018, 0.44, sa * 0.018], 0.004, cs, 5);
    rod(gp, [ca * rad(0.2), 0.2, sa * rad(0.2)], [ca * 0.04, 0.2, sa * 0.04], 0.003, cs, 5);
  }
  // Core with elevator rails and the gold elevator cabs; SkyLine banquet level at 100 ft
  cyl(gp, '#d1d5db', 0, G, 0, 0.017, HY - G, 10);
  for (const a of [0.3, 2.4, 4.4]) {
    box(gp, '#94a3b8', Math.cos(a) * 0.019, G, Math.sin(a) * 0.019, 0.006, HY - G, 0.006, -a);
  }
  box(gp, gold, Math.cos(0.3) * 0.022, 0.3, Math.sin(0.3) * 0.022, 0.01, 0.016, 0.01, -0.3);
  box(gp, gold, Math.cos(2.4) * 0.022, 0.55, Math.sin(2.4) * 0.022, 0.01, 0.016, 0.01, -2.4);
  cyl(gp, '#f1f5f9', 0, 0.19, 0, 0.042, 0.006, 16);
  cyl(gp, '#334155', 0, 0.196, 0, 0.039, 0.01, 16).material = mat('#334155', { metal: 0.6, rough: 0.25 });
  cyl(gp, '#f1f5f9', 0, 0.206, 0, 0.042, 0.004, 16);
  // Top house: ribbed underside, revolving restaurant glass, observation deck with tilted glass barrier, halo, roof
  lathe(gp, [[0.022, 0], [0.05, 0.016], [0.075, 0.028], [0.092, 0.034]], c, 0, HY, 0, 32);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    rod(gp, [Math.cos(a) * 0.024, HY + 0.001, Math.sin(a) * 0.024], [Math.cos(a) * 0.091, HY + 0.032, Math.sin(a) * 0.091], 0.0018, cs, 3);
  }
  const RY = HY + 0.034;
  lathe(gp, [[0.088, 0], [0.091, 0.02]], '#2f3b4a', 0, RY, 0, 32).material = mat('#2f3b4a', { metal: 0.7, rough: 0.2, flat: false });
  cyl(gp, c, 0, RY + 0.02, 0, 0.1, 0.005, 32);
  const OY = RY + 0.025;
  lathe(gp, [[0.082, 0], [0.085, 0.02]], '#3b4a5a', 0, OY, 0, 32).material = mat('#3b4a5a', { metal: 0.7, rough: 0.2, flat: false });
  add(gp, g('am:barrier', () => new THREE.CylinderGeometry(0.107, 0.1, 0.014, 40, 1, true)), mat('#cfe8f5', { transparent: 0.45, metal: 0.4 }), 0, OY + 0.007, 0, 1, 1, 1);
  const HL = OY + 0.022;
  lathe(gp, [[0.06, 0], [0.112, 0.004], [0.114, 0.008], [0.06, 0.008]], c, 0, HL, 0, 40);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; rod(gp, [Math.cos(a) * 0.085, OY + 0.02, Math.sin(a) * 0.085], [Math.cos(a) * 0.11, HL + 0.004, Math.sin(a) * 0.11], 0.0015, cs, 3); }
  lathe(gp, [[0.08, 0], [0.07, 0.012], [0.045, 0.024], [0.022, 0.03], [0.014, 0.034]], c, 0, HL + 0.008, 0, 32);
  cyl(gp, gold, 0, HL + 0.016, 0, 0.0725, 0.002, 32);
  // The Spike: stepped spire with beacon
  const SY = HL + 0.042;
  cyl(gp, c, 0, SY, 0, 0.012, 0.02, 10);
  strut(gp, [0, SY + 0.02, 0], [0, 0.985, 0], 0.0055, 0.0018, c, 8);
  for (const y of [SY + 0.04, SY + 0.07]) cyl(gp, cs, 0, y, 0, 0.007, 0.003, 8);
  add(gp, LO(), mat('#fef3c7', { emissive: '#fde68a' }), 0, 0.99, 0, 0.006, 0.01, 0.006);
};

export const AMERICAS: Record<string, Builder> = { opera, goldengate, liberty, empire, chichenitza, machupicchu, moai, stonehenge, louvre, spaceneedle };
