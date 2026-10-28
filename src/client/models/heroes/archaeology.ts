import * as THREE from 'three';
import type { Builder, MatOpts, Paint, V3 } from '../prims.ts';
import { g, add, mat, box, cyl, rbox, rod, sweep, skin, slab, lathe, gable, tree, paintFaces, shade, mix, fbm, vnoise, hash3, BOX } from '../prims.ts';
import { sstep, ridged } from '../nature.ts';
import { Mesher as BaseMesher } from '../kit/mesher.ts';

// Archaeological dig dioramas (keys ar_*): each find sits in its excavation — a terraced ground disc (radius 0.5)
// with cut pits whose sides show the soil layers, grid strings, tools, tents and tiny archaeologists for scale.
// The artefact itself is deliberately enlarged so it reads at globe size. Front is +z, base at y=0.

// ---- local helpers -------------------------------------------------------------------------------------
const LO = (s = 8) => g('ar:sph' + s, () => new THREE.SphereGeometry(1, s, Math.max(5, Math.round(s * 0.7))));
/** Cheap smooth ellipsoid with semi-axes (rx, ry, rz). */
function blob(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, rotx = 0, rotz = 0, s = 8, o: MatOpts = {}): THREE.Mesh {
  return add(p, LO(s), mat(c, { flat: false, ...o }), x, y, z, rx, ry, rz, roty, rotx, rotz);
}
function grp(p: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0, s = 1): THREE.Group {
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = ry; q.scale.setScalar(s); p.add(q); return q;
}
const GOLD = '#d9a93a';
const gold = (c = GOLD) => mat(c, { metal: 0.65, rough: 0.32, flat: false });
const glow = (c: string) => mat(c, { emissive: c });

/** Shared triangle soup, finished slightly rougher for weathered stone. */
class Mesher extends BaseMesher {
  override build(p: THREE.Object3D, o: MatOpts = {}): THREE.Mesh { return super.build(p, { rough: 0.9, ...o }); }
}

type H2 = (x: number, z: number) => number;
/** One terrace of the dig ground: cells whose centre passes `in` take height `h` and colour `c`. */
interface Lvl { in?: (x: number, z: number) => boolean; h: H2; c: (x: number, y: number, z: number) => string }
const rect = (x0: number, x1: number, z0: number, z1: number) => (x: number, z: number) => x > x0 && x < x1 && z > z0 && z < z1;
/** Soil-layer colouring for cut faces: bands by height, wobbling with noise so the layers look natural. */
const strata = (pal: string[], k = 70) => (x: number, y: number, z: number) => {
  const v = y * k + (fbm(x * 14, y * 4, z * 14) - 0.5) * 2.2;
  const c = pal[((Math.floor(v) % pal.length) + pal.length) % pal.length];
  return hash3(Math.floor(x * 260), Math.floor(y * 260), Math.floor(z * 260)) > 0.93 ? shade(c, 0.82) : c;
};

/**
 * Terraced dig ground on a square grid clipped to a disc: every cell belongs to the last level that contains it,
 * and vertical faces are cut wherever neighbouring levels differ (pit sides, steps) and round the outer rim —
 * all painted with `wall` so the soil layers line up. Returns the surface height function.
 */
function ground(p: THREE.Object3D, levels: Lvl[], wall: (x: number, y: number, z: number) => string, N = 60, R = 0.5, maxBands = 12): H2 {
  const cs = (2 * R) / N, vx = (i: number) => -R + i * cs;
  const inside = (i: number, j: number) => Math.hypot(vx(i), vx(j)) <= R + 1e-9;
  const P = (i: number, j: number): [number, number] => { const x = vx(i), z = vx(j), r = Math.hypot(x, z); return r > R ? [(x * R) / r, (z * R) / r] : [x, z]; };
  const incl = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && (inside(i, j) || inside(i + 1, j) || inside(i, j + 1) || inside(i + 1, j + 1));
  const lv = new Int16Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = vx(i) + cs / 2, cz = vx(j) + cs / 2;
    let L = 0;
    for (let k = 1; k < levels.length; k++) if (levels[k].in?.(cx, cz)) L = k;
    lv[i * N + j] = L;
  }
  const m = new Mesher();
  const Y: V3 = [0, 1, 0];
  const NV = (N + 1) * (N + 1), hc = new Float32Array(NV * levels.length).fill(NaN);
  const H = (L: number, i: number, j: number, x: number, z: number) => {
    const k = L * NV + i * (N + 1) + j;
    let h = hc[k];
    if (h !== h) h = hc[k] = levels[L].h(x, z);
    return h;
  };
  const corner: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const face = (A: [number, number], B: [number, number], tA: number, tB: number, bA: number, bB: number, want: V3, band = 0.0075) => {
    const k = Math.min(maxBands, Math.max(1, Math.ceil(Math.max(tA - bA, tB - bB) / band)));
    for (let s = 0; s < k; s++) {
      const a0 = tA - ((tA - bA) * s) / k, a1 = tA - ((tA - bA) * (s + 1)) / k, b0 = tB - ((tB - bB) * s) / k, b1 = tB - ((tB - bB) * (s + 1)) / k;
      m.quad([A[0], a0, A[1]], [B[0], b0, B[1]], [B[0], b1, B[1]], [A[0], a1, A[1]], wall((A[0] + B[0]) / 2, (a0 + a1 + b0 + b1) / 4, (A[1] + B[1]) / 2), want);
    }
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (!incl(i, j)) continue;
    const li = lv[i * N + j], L = levels[li];
    const c = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    const v = c.map(([x, z], q) => [x, H(li, i + corner[q][0], j + corner[q][1], x, z), z] as V3);
    const ce = (a: V3, b: V3, d: V3) => L.c((a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3);
    m.tri(v[0], v[1], v[2], ce(v[0], v[1], v[2]), Y);
    m.tri(v[0], v[2], v[3], ce(v[0], v[2], v[3]), Y);
    const cx = vx(i) + cs / 2, cz = vx(j) + cs / 2;
    const edges: [number, number, number, number][] = [[0, 1, i, j - 1], [1, 2, i + 1, j], [2, 3, i, j + 1], [3, 0, i - 1, j]];
    for (const [a, b, ni, nj] of edges) {
      const A = c[a], B = c[b];
      if (!incl(ni, nj)) {
        const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
        face(A, B, v[a][1], v[b][1], 0, 0, [mx, 0, mz], 0.014);
        continue;
      }
      const L2 = lv[ni * N + nj];
      if (L2 === lv[i * N + j]) continue;
      const bA = H(L2, i + corner[a][0], j + corner[a][1], A[0], A[1]), bB = H(L2, i + corner[b][0], j + corner[b][1], B[0], B[1]);
      if (v[a][1] + v[b][1] <= bA + bB) continue;
      face(A, B, v[a][1], v[b][1], bA, bB, [vx(ni) + cs / 2 - cx, 0, vx(nj) + cs / 2 - cz]);
    }
  }
  m.build(p, { flat: true });
  return (x, z) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor((x + R) / cs))), j = Math.min(N - 1, Math.max(0, Math.floor((z + R) / cs)));
    return levels[lv[i * N + j]].h(x, z);
  };
}

/** String grid over a trench (x0..x1, z0..z1) at height y, with stakes along the rim. */
function strings(p: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y: number, step: number, c = '#f4f1e6'): void {
  for (let x = x0 + step; x < x1 - step * 0.4; x += step) { box(p, c, x, y, (z0 + z1) / 2, 0.0014, 0.0014, z1 - z0); box(p, '#c2410c', x, y - 0.012, z0 - 0.004, 0.0035, 0.016, 0.0035); box(p, '#c2410c', x, y - 0.012, z1 + 0.004, 0.0035, 0.016, 0.0035); }
  for (let z = z0 + step; z < z1 - step * 0.4; z += step) { box(p, c, (x0 + x1) / 2, y, z, x1 - x0, 0.0014, 0.0014); box(p, '#c2410c', x0 - 0.004, y - 0.012, z, 0.0035, 0.016, 0.0035); box(p, '#c2410c', x1 + 0.004, y - 0.012, z, 0.0035, 0.016, 0.0035); }
}

const SKIN = ['#c68b5e', '#8d5a3b', '#e0b48a', '#6b4630'];
type Pose = 'stand' | 'kneel' | 'bend' | 'carry' | 'point';
/** Tiny archaeologist (~0.065 tall) facing local +z: sun hat, shirt, trousers; pose decides the limbs. */
function person(p: THREE.Object3D, x: number, y: number, z: number, ry: number, pose: Pose, shirt: string, k = 0, hat: string | null = '#e8dcb5', pants = '#6b5a45', s = 1): THREE.Group {
  const q = grp(p, x, y, z, ry, s);
  const sk = SKIN[k % 4];
  let hx: V3;
  if (pose === 'kneel') {
    for (const sx of [-1, 1]) {
      rod(q, [sx * 0.0045, 0.016, -0.002], [sx * 0.005, 0.004, 0.012], 0.0033, pants, 5);
      rod(q, [sx * 0.005, 0.003, 0.012], [sx * 0.005, 0.003, -0.008], 0.003, pants, 5);
      box(q, '#3a2a1e', sx * 0.005, 0, -0.012, 0.005, 0.004, 0.007);
    }
    blob(q, shirt, 0, 0.027, 0.004, 0.0085, 0.0125, 0.0062, 0, 0.45);
    hx = [0, 0.042, 0.012];
    for (const sx of [-1, 1]) rod(q, [sx * 0.0095, 0.034, 0.008], [sx * 0.006, 0.012, 0.024], 0.0024, shirt, 5);
    box(q, '#9ca3af', 0.006, 0.006, 0.026, 0.004, 0.002, 0.009);
  } else {
    for (const sx of [-1, 1]) {
      rod(q, [sx * 0.0045, 0.029, 0], [sx * 0.005, 0.003, 0], 0.0034, pants, 5);
      box(q, '#3a2a1e', sx * 0.005, 0, 0.002, 0.005, 0.004, 0.009);
    }
    if (pose === 'bend') {
      blob(q, shirt, 0, 0.037, 0.008, 0.0085, 0.0125, 0.0062, 0, 0.95);
      hx = [0, 0.043, 0.024];
      for (const sx of [-1, 1]) rod(q, [sx * 0.0095, 0.04, 0.016], [sx * 0.006, 0.016, 0.028], 0.0024, shirt, 5);
    } else {
      blob(q, shirt, 0, 0.04, 0, 0.0088, 0.013, 0.0064);
      hx = [0, 0.0595, 0];
      if (pose === 'carry') for (const sx of [-1, 1]) rod(q, [sx * 0.0095, 0.049, 0], [sx * 0.007, 0.07, 0.002], 0.0024, shirt, 5);
      else if (pose === 'point') { rod(q, [0.0095, 0.049, 0], [0.012, 0.05, 0.022], 0.0024, shirt, 5); rod(q, [-0.0095, 0.049, 0], [-0.012, 0.028, 0.003], 0.0024, shirt, 5); }
      else for (const sx of [-1, 1]) rod(q, [sx * 0.0098, 0.049, 0], [sx * 0.012, 0.028, 0.004], 0.0024, shirt, 5);
    }
  }
  blob(q, sk, hx[0], hx[1], hx[2], 0.0058, 0.0062, 0.0058);
  if (hat) {
    cyl(q, hat, hx[0], hx[1] + 0.003, hx[2], 0.0098, 0.0012, 10);
    cyl(q, shade(hat, 0.92), hx[0], hx[1] + 0.004, hx[2], 0.0056, 0.0042, 8);
  }
  return q;
}

/** Simple canvas field tent / sunshade on 4 poles. */
function tent(p: THREE.Object3D, x: number, y: number, z: number, ry: number, w: number, d: number, h: number, c: string): void {
  const q = grp(p, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(q, [sx * w * 0.46, 0, sz * d * 0.46], [sx * w * 0.46, h, sz * d * 0.46], 0.0018, '#6b5b4b', 4);
  gable(q, w, h * 0.32, d, c, 0, h, 0);
  box(q, shade(c, 0.9), 0, h - 0.012, -d * 0.48, w, 0.012, 0.002);
}
function bucket(p: THREE.Object3D, x: number, y: number, z: number, c = '#2563eb', s = 1): void {
  lathe(p, [[0.0001, 0], [0.0062 * s, 0], [0.0082 * s, 0.013 * s], [0.0074 * s, 0.013 * s], [0.0001, 0.003 * s]], c, x, y, z, 10);
}
function wheelbarrow(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c = '#16a34a', load?: string): void {
  const q = grp(p, x, y, z, ry);
  add(q, CYLX(), mat('#1f2937'), 0, 0.009, 0.03, 0.018, 0.005, 0.018, 0, 0, Math.PI / 2);
  const t = add(q, g('ar:tray', () => trayGeo()), mat(c), 0, 0.013, 0.004, 1, 1, 1);
  t.castShadow = true;
  if (load) blob(q, load, 0, 0.026, 0.002, 0.016, 0.006, 0.02, 0, 0, 0, 7);
  for (const sx of [-1, 1]) {
    rod(q, [sx * 0.008, 0.012, 0.03], [sx * 0.012, 0.024, -0.035], 0.0016, '#4b5563', 4);
    rod(q, [sx * 0.009, 0.014, -0.012], [sx * 0.01, 0, -0.016], 0.0014, '#4b5563', 4);
  }
}
const CYLX = () => g('ar:cyl12', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
function trayGeo(): THREE.BufferGeometry {
  const lg = new THREE.CylinderGeometry(0.02, 0.012, 0.016, 4, 1, true);
  lg.rotateY(Math.PI / 4); lg.scale(0.9, 1, 1.3); lg.translate(0, 0.008, 0);
  const bt = new THREE.BoxGeometry(0.017, 0.001, 0.022); bt.translate(0, 0, 0);
  const mg = new THREE.BufferGeometry();
  const a = lg.toNonIndexed(), b = bt.toNonIndexed();
  const pa = [...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)];
  mg.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3));
  mg.computeVertexNormals();
  return mg;
}
function shovel(p: THREE.Object3D, x: number, y: number, z: number, ry: number, lean = 0.35): void {
  const q = grp(p, x, y, z, ry);
  q.rotation.z = lean;
  rod(q, [0, 0.012, 0], [0, 0.065, 0], 0.0015, '#8b6a45', 4);
  box(q, '#6b7280', 0, 0, 0, 0.009, 0.013, 0.0015);
  box(q, '#3f3f46', 0, 0.064, 0, 0.007, 0.0025, 0.0025);
}
function ladder(p: THREE.Object3D, a: V3, b: V3, w = 0.016, c = '#9a7b55'): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, px = (-dz / L) * w / 2, pz = (dx / L) * w / 2;
  rod(p, [a[0] + px, a[1], a[2] + pz], [b[0] + px, b[1], b[2] + pz], 0.0013, c, 4);
  rod(p, [a[0] - px, a[1], a[2] - pz], [b[0] - px, b[1], b[2] - pz], 0.0013, c, 4);
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.012));
  for (let i = 1; i < n; i++) {
    const t = i / n, cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t, cz = a[2] + (b[2] - a[2]) * t;
    rod(p, [cx + px, cy, cz + pz], [cx - px, cy, cz - pz], 0.001, c, 4);
  }
}
function crate(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry = 0, c = '#a8835a'): void {
  rbox(p, c, x, y, z, s, s * 0.7, s * 0.8, 0.002, ry);
  const q = grp(p, x, y, z, ry);
  for (const f of [-1, 1]) box(q, shade(c, 0.8), 0, s * 0.25, f * s * 0.401, s * 1.0, s * 0.06, s * 0.004);
}
/** Field sieve: mesh frame on splayed legs. */
function sieve(p: THREE.Object3D, x: number, y: number, z: number, ry: number): void {
  const q = grp(p, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(q, [sx * 0.012, 0.024, sz * 0.008], [sx * 0.017, 0, sz * 0.012], 0.0012, '#7c5a3a', 4);
  rbox(q, '#8a6a48', 0, 0.022, 0, 0.032, 0.005, 0.022, 0.001);
  box(q, '#55524c', 0, 0.0255, 0, 0.028, 0.0008, 0.018);
}
/** Finds tray with little sherds. */
function finds(p: THREE.Object3D, x: number, y: number, z: number, ry: number, cols: string[]): void {
  const q = grp(p, x, y, z, ry);
  box(q, '#e9e4d6', 0, 0, 0, 0.03, 0.004, 0.02);
  for (let i = 0; i < 6; i++) box(q, cols[i % cols.length], -0.01 + (i % 3) * 0.01, 0.004, -0.005 + Math.floor(i / 3) * 0.01, 0.006, 0.0015, 0.005, hash3(i, 2, 3) * 3);
}
/** Red–white survey pole. */
function rangePole(p: THREE.Object3D, x: number, y: number, z: number, h = 0.07): void {
  for (let i = 0; i < 5; i++) cyl(p, i % 2 ? '#f5f5f4' : '#dc2626', x, y + (i * h) / 5, z, 0.0014, h / 5, 5);
}

// =========================================================================================================
// Tutankhamun: KV62 burial chamber opened from above in the Valley of the Kings — golden mask and coffin
// =========================================================================================================

/** The golden funerary mask (unit height, front +z): striped nemes, inlaid broad collar, lappets, beard, uraeus. */
function tutMask(p: THREE.Object3D, x: number, y: number, z: number, S: number): void {
  const q = grp(p, x, y, z, 0, S);
  const LAP = '#25357a', TURQ = '#3aa6a0', CARN = '#b5452e';
  // Broad collar: shoulder dome inlaid with concentric bands round the neck
  const cg = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const collarBands = [GOLD, LAP, GOLD, TURQ, GOLD, CARN, GOLD, LAP, GOLD, TURQ, GOLD];
  add(q, paintFaces(cg, GOLD, (px, py, pz, _nx, _ny, nz) => {
    if (nz < -0.1) return null;
    const d = Math.hypot(px / 0.98, (py - 0.95) / 0.95);
    if (d < 0.42) return null;
    if (d > 0.93) return Math.floor(Math.atan2(py - 0.95, px) * 40) % 2 ? GOLD : LAP;
    return collarBands[Math.floor((d - 0.42) / 0.047) % collarBands.length];
  }), mat('#ffffff', { vc: true, metal: 0.6, rough: 0.35, flat: false }), 0, 0, 0.02, 0.5, 0.4, 0.3);
  cyl(q, GOLD, 0, 0.3, -0.02, 0.13, 0.25, 14).material = gold();
  // Nemes headdress: flaring striped cloth, lofted from shoulders to crown
  const prof: [number, number, number][] = [[0.3, 0.44, 0.2], [0.4, 0.44, 0.22], [0.5, 0.41, 0.24], [0.6, 0.35, 0.25], [0.7, 0.3, 0.25], [0.8, 0.27, 0.25], [0.88, 0.25, 0.23], [0.94, 0.21, 0.19], [0.98, 0.14, 0.12], [1.0, 0.03, 0.03]];
  const rings: V3[][] = [];
  const NR = 32, NS = 28;
  for (let r = 0; r <= NR; r++) {
    const yy = 0.3 + (0.7 * r) / NR;
    let k = 0;
    while (k < prof.length - 2 && prof[k + 1][0] < yy) k++;
    const u = Math.min(1, (yy - prof[k][0]) / (prof[k + 1][0] - prof[k][0]));
    const W = prof[k][1] + (prof[k + 1][1] - prof[k][1]) * u, D = prof[k][2] + (prof[k + 1][2] - prof[k][2]) * u;
    const ring: V3[] = [];
    for (let s = 0; s < NS; s++) {
      const a = (s / NS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      ring.push([Math.sign(ca) * Math.pow(Math.abs(ca), 0.7) * W, yy, -0.04 + Math.sign(sa) * Math.pow(Math.abs(sa), 0.85) * D]);
    }
    rings.push(ring);
  }
  skin(q, rings, GOLD, {
    caps: false, metal: 0.6, rough: 0.35,
    paint: (px, py, pz) => (py > 0.96 ? GOLD : pz > 0.12 && Math.abs(px) < 0.2 && py > 0.6 ? GOLD : Math.floor(((py - 0.3) / 0.7) * 32) % 2 ? LAP : GOLD),
  });
  // Lappets hanging in front of the shoulders, striped across
  for (const sx of [-1, 1]) {
    const lg = new THREE.BoxGeometry(1, 1, 1, 1, 18, 1);
    add(q, paintFaces(lg, GOLD, (_px, py) => (Math.floor((py + 0.5) * 18) % 2 ? LAP : GOLD)), mat('#ffffff', { vc: true, metal: 0.6, rough: 0.35 }), sx * 0.3, 0.33, 0.13, 0.13, 0.5, 0.05, 0, 0, sx * 0.04);
    blob(q, GOLD, sx * 0.3, 0.085, 0.13, 0.065, 0.02, 0.025, 0, 0, 0, 8, { metal: 0.6, rough: 0.35 });
  }
  // Face, ears, eyes with kohl lines, brows, nose, lips
  const face = add(q, g('ar:face', () => new THREE.SphereGeometry(1, 22, 16)), gold('#e3b448'), 0, 0.665, 0.12, 0.19, 0.24, 0.15);
  face.castShadow = true;
  blob(q, '#e3b448', 0, 0.52, 0.17, 0.11, 0.07, 0.09, 0, 0, 0, 10, { metal: 0.65, rough: 0.3 });
  for (const sx of [-1, 1]) {
    blob(q, '#d9a93a', sx * 0.19, 0.67, 0.08, 0.035, 0.06, 0.03, 0, 0, sx * 0.1, 8, { metal: 0.6, rough: 0.35 });
    blob(q, '#f3efe6', sx * 0.075, 0.7, 0.245, 0.042, 0.02, 0.012, 0, 0, sx * -0.12);
    blob(q, '#151515', sx * 0.072, 0.7, 0.255, 0.016, 0.017, 0.006);
    rod(q, [sx * 0.03, 0.715, 0.25], [sx * 0.135, 0.703, 0.215], 0.006, LAP, 5);
    rod(q, [sx * 0.11, 0.69, 0.235], [sx * 0.165, 0.695, 0.2], 0.005, LAP, 5);
    rod(q, [sx * 0.03, 0.75, 0.255], [sx * 0.13, 0.745, 0.22], 0.008, LAP, 5);
  }
  blob(q, '#e8b94c', 0, 0.64, 0.275, 0.03, 0.055, 0.03, 0, -0.25, 0, 8, { metal: 0.65, rough: 0.3 });
  blob(q, '#c99a3a', 0, 0.565, 0.255, 0.05, 0.016, 0.022, 0, 0, 0, 8, { metal: 0.6, rough: 0.35 });
  // Vulture and cobra on the brow
  blob(q, GOLD, -0.03, 0.88, 0.25, 0.022, 0.035, 0.02, 0, 0.3, 0, 8, { metal: 0.6 });
  blob(q, GOLD, -0.03, 0.92, 0.27, 0.014, 0.016, 0.022, 0, 0.5, 0, 8, { metal: 0.6 });
  blob(q, '#2b3a8a', 0.035, 0.89, 0.25, 0.024, 0.045, 0.012);
  blob(q, GOLD, 0.035, 0.94, 0.26, 0.012, 0.014, 0.016, 0, 0, 0, 8, { metal: 0.6 });
  // Plaited divine beard
  sweep(q, [{ p: [0, 0.5, 0.215], w: 0.03, h: 0.03 }, { p: [0, 0.4, 0.24], w: 0.032, h: 0.032 }, { p: [0, 0.3, 0.25], w: 0.033, h: 0.033 }, { p: [0, 0.24, 0.27], w: 0.028, h: 0.028 }],
    GOLD, { radial: 10, sub: 5, paint: (_px, py) => (Math.floor(py * 50) % 2 ? '#3a4a9a' : '#c79a36') });
}

/** Golden anthropoid coffin lying along x (head at -x). */
function tutCoffin(p: THREE.Object3D, x: number, y: number, z: number, L: number): void {
  const q = grp(p, x, y, z, 0, L);
  const st = [{ p: [0.5, 0, 0] as V3, w: 0.07, h: 0.05 }, { p: [0.3, 0.005, 0] as V3, w: 0.09, h: 0.065 }, { p: [0.05, 0.01, 0] as V3, w: 0.12, h: 0.08 }, { p: [-0.2, 0.015, 0] as V3, w: 0.14, h: 0.09 },
    { p: [-0.33, 0.015, 0] as V3, w: 0.13, h: 0.085 }, { p: [-0.42, 0.02, 0] as V3, w: 0.15, h: 0.1 }, { p: [-0.5, 0.02, 0] as V3, w: 0.12, h: 0.09 }];
  sweep(q, st, GOLD, {
    radial: 14, sub: 4, caps: true, paint: (px, py, pz) => {
      if (px < -0.36) return Math.abs(pz) < 0.07 && py > 0.05 ? '#e3b448' : Math.floor(px * 60) % 2 ? '#25357a' : GOLD;
      if (px < -0.25 && py > 0.06) return '#3aa6a0';
      return Math.sin(px * 90 + Math.abs(pz) * 70) > 0.35 ? '#25357a' : GOLD;
    },
  }).material = mat('#ffffff', { vc: true, metal: 0.6, rough: 0.35, flat: false });
  rod(q, [-0.28, 0.1, -0.06], [-0.12, 0.1, 0.05], 0.012, '#25357a', 5);
  rod(q, [-0.28, 0.1, 0.06], [-0.12, 0.1, -0.05], 0.012, GOLD, 5);
}

const tutankhamun: Builder = gp => {
  const SAND = '#d8b27a', ROCK = '#cfae80';
  const base: H2 = (x, z) => 0.085 + 0.006 * fbm(x * 12, 0, z * 12)
    + 0.2 * sstep(-0.16, -0.46, z) * (0.55 + 0.6 * ridged(x * 3 + 4, z * 3))
    + 0.2 * Math.max(0, 1 - Math.hypot(x + 0.22, z + 0.36) / 0.2);
  const CH = rect(-0.2, 0.2, -0.12, 0.12);
  const floorY = 0.014;
  const levels: Lvl[] = [
    { h: base, c: (x, y, z) => (y > 0.13 ? (Math.floor(y * 55 + fbm(x * 9, y, z * 9) * 2) % 3 ? ROCK : '#b8946a') : hash3(Math.floor(x * 90), 1, Math.floor(z * 90)) > 0.93 ? '#b8946a' : mix(SAND, '#e4c48f', fbm(x * 14, 0, z * 14))) },
    { in: CH, h: () => floorY, c: (x, _y, z) => (hash3(Math.floor(x * 70), 3, Math.floor(z * 70)) > 0.8 ? '#bfa67c' : '#cdb58a') },
  ];
  // Rock-cut entrance stairs descending from the front into the chamber
  for (let s = 0; s < 7; s++) {
    const z0 = 0.12 + s * 0.03;
    levels.push({ in: rect(-0.05, 0.05, z0, z0 + 0.03), h: () => floorY + 0.012 + s * 0.0105, c: () => (s % 2 ? '#dcc59a' : '#d2b98c') });
  }
  const wallPal = strata(['#d8bb8c', '#c9a77a', '#e0c79c', '#b99466']);
  const gy = ground(gp, levels, (x, y, z) => {
    const inCh = Math.abs(x) < 0.205 && z > -0.125 && z < 0.125 && y < 0.08;
    if (!inCh) return wallPal(x, y, z);
    if (y < 0.024) return '#8a3b28';
    if (y > 0.066) return '#2b3550';
    const u = (Math.abs(z) > 0.115 ? x : z) * 26;
    const f = u - Math.floor(u);
    if (y > 0.03 && y < 0.062 && f > 0.3 && f < 0.62) return y > 0.052 ? '#2a1d14' : f < 0.4 ? '#f2ead8' : '#9a4a2a';
    return '#e2b84e';
  }, 56);
  // Safety rope round the opened chamber
  for (const [x, z] of [[-0.21, -0.13], [0.21, -0.13], [-0.21, 0.13], [0.21, 0.13]] as const) cyl(gp, '#7c5a3a', x, gy(x, z), z, 0.003, 0.03, 5);
  rod(gp, [-0.21, gy(-0.21, -0.13) + 0.026, -0.13], [0.21, gy(0.21, -0.13) + 0.026, -0.13], 0.0012, '#f4f1e6', 4);
  rod(gp, [-0.21, 0.111, -0.13], [-0.21, 0.111, 0.13], 0.0012, '#f4f1e6', 4);
  rod(gp, [0.21, 0.111, -0.13], [0.21, 0.111, 0.13], 0.0012, '#f4f1e6', 4);
  // Quartzite sarcophagus (open) with the golden coffin, granite lid leaning on the wall
  const sx0 = 0.03, sz0 = 0.055;
  rbox(gp, '#b98f5f', sx0, floorY, sz0, 0.25, 0.012, 0.1, 0.003);
  for (const f of [-1, 1]) {
    rbox(gp, '#c49a68', sx0, floorY, sz0 + f * 0.044, 0.25, 0.05, 0.012, 0.003);
    rbox(gp, '#c49a68', sx0 + f * 0.119, floorY, sz0, 0.012, 0.05, 0.1, 0.003);
  }
  box(gp, '#d9b27c', sx0, floorY + 0.05, sz0 + 0.044, 0.25, 0.004, 0.014);
  tutCoffin(gp, sx0, floorY + 0.03, sz0, 0.22);
  const lid = rbox(gp, '#b4766a', 0, 0, 0, 0.012, 0.1, 0.24, 0.003);
  lid.position.set(-0.178, floorY + 0.05, 0.0); lid.rotation.z = -0.32;
  // The golden mask on a plinth, rising out of the chamber
  rbox(gp, '#2a2a2e', 0, floorY, -0.065, 0.13, 0.03, 0.1, 0.004);
  tutMask(gp, 0, floorY + 0.03, -0.075, 0.31);
  // Howard Carter kneeling with a candle, a helper on the stairs, workers carrying baskets
  person(gp, 0.17, floorY, 0.07, -1.9, 'kneel', '#f3f0e8', 2, '#3f3f46', '#3f3f46');
  cyl(gp, '#f8f4e3', 0.15, floorY + 0.012, 0.075, 0.0025, 0.01, 6);
  blob(gp, '#ffd36b', 0.15, floorY + 0.025, 0.075, 0.003, 0.005, 0.003).material = glow('#ffd36b');
  person(gp, 0.0, floorY + 0.034, 0.17, Math.PI, 'point', '#e5e7eb', 2, '#e8dcb5', '#4b5563');
  person(gp, 0.3, gy(0.3, 0.2), 0.2, -0.6, 'carry', '#f5f0e6', 1, null, '#f5f0e6');
  blob(gp, '#a07a4a', 0.3, gy(0.3, 0.2) + 0.075, 0.2, 0.012, 0.006, 0.012);
  person(gp, -0.3, gy(-0.3, 0.16), 0.16, 0.5, 'stand', '#f5f0e6', 3, '#f5f0e6', '#f5f0e6');
  // Camp: tent, crates for the treasures, baskets
  tent(gp, 0.31, gy(0.31, -0.02), -0.02, 0.2, 0.12, 0.09, 0.06, '#efe6d0');
  crate(gp, 0.26, gy(0.26, 0.31), 0.31, 0.04, 0.3);
  crate(gp, 0.31, gy(0.31, 0.29), 0.29, 0.03, -0.2);
  crate(gp, -0.25, gy(-0.25, 0.3), 0.3, 0.04, -0.4);
  for (const [x, z] of [[-0.3, 0.26], [-0.34, 0.2], [0.14, 0.3]] as const) lathe(gp, [[0.0001, 0], [0.008, 0], [0.011, 0.012], [0.0001, 0.012]], '#9a7448', x, gy(x, z), z, 8);
  wheelbarrow(gp, -0.15, gy(-0.15, 0.27), 0.27, 0.8, '#7c5a3a', '#d8b27a');
  for (let i = 0; i < 18; i++) {
    const a = hash3(i, 7, 1) * Math.PI * 2, d = 0.3 + hash3(i, 7, 2) * 0.17, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > -0.15) blob(gp, '#c2a275', x, gy(x, z) + 0.002, z, 0.006 + hash3(i, 7, 3) * 0.008, 0.004, 0.007, a, 0, 0, 6);
  }
};


// =========================================================================================================
// Lascaux: limestone hill cut open like a doll's house to show the painted cave — bulls, horses, deer
// =========================================================================================================

type Pt = [number, number];
/** Palaeolithic animal silhouettes, facing +x, feet at y=0, length ≈ 1. */
const BULL: Pt[] = [[0.02, 0.6], [0.0, 0.46], [0.05, 0.36], [0.1, 0.24], [0.1, 0.02], [0.15, 0.02], [0.19, 0.24], [0.3, 0.26], [0.6, 0.26], [0.64, 0.02], [0.69, 0.02], [0.73, 0.3], [0.84, 0.36], [0.96, 0.4], [1.0, 0.48], [0.96, 0.57], [0.88, 0.62], [0.78, 0.74], [0.62, 0.82], [0.42, 0.76], [0.24, 0.72], [0.1, 0.68]];
const HORSE: Pt[] = [[0.02, 0.56], [0.05, 0.42], [0.12, 0.3], [0.12, 0.02], [0.17, 0.02], [0.2, 0.3], [0.32, 0.27], [0.58, 0.27], [0.64, 0.02], [0.69, 0.02], [0.72, 0.34], [0.8, 0.46], [0.9, 0.48], [1.0, 0.56], [0.96, 0.66], [0.86, 0.72], [0.74, 0.74], [0.6, 0.68], [0.4, 0.66], [0.2, 0.64]];
const DEER: Pt[] = [[0.02, 0.6], [0.06, 0.48], [0.12, 0.38], [0.12, 0.02], [0.16, 0.02], [0.2, 0.38], [0.55, 0.38], [0.6, 0.02], [0.64, 0.02], [0.68, 0.42], [0.76, 0.58], [0.82, 0.7], [0.96, 0.74], [0.98, 0.8], [0.86, 0.86], [0.76, 0.84], [0.66, 0.66], [0.45, 0.66], [0.2, 0.64]];

/** Closed Catmull-Rom smoothing of a control polygon with `k` samples per edge (cheaper than slab's own ×6). */
function smooth(o: Pt[], k = 2): Pt[] {
  const n = o.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = o[(i - 1 + n) % n], p1 = o[i], p2 = o[(i + 1) % n], p3 = o[(i + 2) % n];
    for (let s = 0; s < k; s++) {
      const t = s / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
const circ = (cx: number, cy: number, r: number, ry = r, n = 7): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * ry] as Pt);
/** Thin band polygon along a polyline (horns, antlers, manes). */
function band(pts: Pt[], w0: number, w1: number): Pt[] {
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    L.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]); R.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  return [...L, ...R.reverse()];
}

function flipWinding(geo: THREE.BufferGeometry): void {
  const ix = geo.index;
  if (ix) { for (let t = 0; t < ix.count; t += 3) { const tmp = ix.getX(t + 1); ix.setX(t + 1, ix.getX(t + 2)); ix.setX(t + 2, tmp); } return; }
  const pa = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i += 3) { const x = pa.getX(i + 1), y = pa.getY(i + 1), z = pa.getZ(i + 1); pa.setXYZ(i + 1, pa.getX(i + 2), pa.getY(i + 2), pa.getZ(i + 2)); pa.setXYZ(i + 2, x, y, z); }
}

/** A painted animal wrapped onto the inside of a vertical cylindrical cave wall (radius r round (0, cz)). */
function cavePaint(p: THREE.Object3D, kind: 'bull' | 'horse' | 'deer', a0: number, yb: number, L: number, flip: boolean, r: number, cz: number): void {
  const put = (o: Pt[], c: string, lift: number, k = 1) => {
    const m = slab(p, o.map(([x, y]) => [0.5 + (x - 0.5) * k, 0.4 + (y - 0.4) * k] as Pt), 0.0015, c, 0, false);
    const pa = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const X = (flip ? -1 : 1) * (pa.getX(i) - 0.5) * L, Y = yb + pa.getY(i) * L, rr = r - 0.003 - lift - pa.getZ(i);
      const ang = a0 + X / r;
      pa.setXYZ(i, Math.sin(ang) * rr, Y, cz - Math.cos(ang) * rr);
    }
    if (flip) flipWinding(m.geometry);
    m.geometry.computeVertexNormals();
    m.material = mat(c, { flat: true });
  };
  const INK = '#1d1712';
  if (kind === 'bull') {
    put(smooth(BULL), INK, 0);
    put(smooth(BULL), '#f1e4c4', 0.0016, 0.86);
    put(circ(0.92, 0.5, 0.075, 0.065), INK, 0.0032);
    for (const d of [-1, 1]) put(band([[0.86, 0.6], [0.84 + d * 0.06, 0.78], [0.92 + d * 0.03, 0.94]], 0.035, 0.008), INK, 0.0032);
    for (const [x, y] of [[0.5, 0.5], [0.33, 0.56], [0.64, 0.44], [0.42, 0.62]] as const) put(circ(x, y, 0.025), INK, 0.0032, 1);
    for (const lx of [0.13, 0.67]) put(band([[lx, 0.0], [lx, 0.2]], 0.05, 0.05), INK, 0.0032);
  } else if (kind === 'horse') {
    put(smooth(HORSE), '#a5492a', 0);
    put(band([[0.7, 0.7], [0.82, 0.72], [0.95, 0.66]], 0.07, 0.04), INK, 0.0016);
    put(circ(0.97, 0.58, 0.045), INK, 0.0016);
    for (const lx of [0.145, 0.665]) put(band([[lx, 0.0], [lx, 0.2]], 0.055, 0.05), INK, 0.0016);
    put(band([[0.03, 0.55], [-0.03, 0.42], [-0.02, 0.28]], 0.05, 0.02), INK, 0.0016);
  } else {
    put(smooth(DEER), '#7a2f1c', 0);
    put(smooth(DEER), '#c96a3a', 0.0016, 0.78);
    for (const d of [-1, 1]) {
      put(band([[0.86, 0.82], [0.82 + d * 0.05, 1.0], [0.8 + d * 0.1, 1.16]], 0.025, 0.012), '#7a2f1c', 0.0032);
      put(band([[0.83 + d * 0.03, 0.94], [0.9 + d * 0.06, 1.02]], 0.018, 0.01), '#7a2f1c', 0.0032);
      put(band([[0.81 + d * 0.07, 1.07], [0.88 + d * 0.12, 1.13]], 0.016, 0.008), '#7a2f1c', 0.0032);
    }
  }
}

const lascaux: Builder = gp => {
  const cz = -0.11, R0 = 0.27, Hh = 0.33, y0 = 0.03, YV = 0.2;
  const rAt = (y: number) => (y < y0 + YV ? R0 : R0 * Math.sqrt(Math.max(0, 1 - Math.pow((y - y0 - YV) / (Hh - YV), 2))));
  const GRASS = '#6f9a46';
  const h: H2 = (x, z) => {
    const d = Math.hypot(x, z - cz), back = sstep(0.16, -0.02, z);
    return y0 + 0.004 * fbm(x * 20, 0, z * 20) + (0.02 + 0.33 * back) * sstep(R0 + 0.01, R0 + 0.1, d) * (0.88 + 0.24 * fbm(x * 5, 2, z * 5)) * sstep(0.55, 0.4, d);
  };
  ground(gp, [{ h, c: (x, y, z) => {
    const d = Math.hypot(x, z - cz);
    if (d < R0 + 0.02 && z < 0.13) return mix('#b59b77', '#9c8463', fbm(x * 30, 0, z * 30));
    if (Math.abs(x + 0.02 - (z - 0.2) * 0.3) < 0.03 && z > 0.12) return '#c2a77c';
    return y > 0.08 && hash3(Math.floor(x * 60), Math.floor(y * 60), Math.floor(z * 60)) > 0.93 ? '#8fa86a' : mix(GRASS, '#86ad55', fbm(x * 12, 1, z * 12));
  } }], strata(['#7a5a3a', '#d8cdb3', '#cbbd9e', '#e2d8c0', '#b8a888', '#d4c7a8']), 56);
  // The cave shell: painted limestone inside, grassy hill outside; open towards the viewer like a cutaway
  const NY = 18, NA = 34, A = 2.0;
  const inner: V3[][] = [], outer: V3[][] = [];
  for (let i = 0; i <= NY; i++) {
    const y = y0 + (Hh * i) / NY * 0.995, r = rAt(y);
    const ri: V3[] = [], ro: V3[] = [];
    for (let j = 0; j <= NA; j++) {
      const a = -A + (2 * A * j) / NA, w = 1 + 0.05 * (vnoise(j * 0.7, i * 0.5, 3) - 0.5);
      ri.push([Math.sin(a) * r * w, y, cz - Math.cos(a) * r * w]);
      const ro_ = (r + 0.03) * 1.02;
      ro.push([Math.sin(a) * ro_, y + 0.025 * (i / NY), cz - Math.cos(a) * ro_]);
    }
    inner.push(ri); outer.push(ro);
  }
  skin(gp, inner, '#efe3c6', { closed: false, inward: true, flat: true, paint: (x, y, z) => {
    const v = fbm(x * 18, y * 18, z * 18);
    return v > 0.64 ? '#e0c9a0' : v < 0.32 ? '#f8eed8' : y > 0.3 ? '#e3d2b0' : null;
  } });
  skin(gp, outer, GRASS, { closed: false, flat: true, paint: (_x, y, _z, _nx, ny) => (ny > 0.35 && y > 0.12 ? (vnoise(_x * 40, y * 40, _z * 40) > 0.6 ? '#5f8a3c' : GRASS) : '#cbbd9e') });
  for (const sgn of [-1, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= NY; i += 2) { const y = y0 + (Hh * i) / NY * 0.995, r = rAt(y) + 0.015; pts.push([sgn * Math.sin(A) * r, y, cz - Math.cos(A) * r]); }
    for (let k = 0; k < pts.length - 1; k++) rod(gp, pts[k], pts[k + 1], 0.02, '#cbbd9e', 6);
  }
  // Paintings: the Hall of the Bulls frieze round the curved wall
  const paints: [('bull' | 'horse' | 'deer'), number, number, number, boolean][] = [
    ['bull', -0.3, 0.1, 0.17, false], ['bull', 0.42, 0.1, 0.17, true], ['horse', -0.95, 0.075, 0.13, false], ['horse', 0.06, 0.06, 0.1, true],
    ['deer', 1.1, 0.07, 0.12, true], ['horse', -1.5, 0.09, 0.1, false], ['deer', -0.62, 0.05, 0.075, false], ['bull', 1.55, 0.09, 0.14, true],
  ];
  for (const [k, a, y, L, f] of paints) cavePaint(gp, k, a, y, L, f, R0, cz);
  // Red dots and hand stencils
  for (let i = 0; i < 7; i++) { const a = -0.25 + i * 0.07, r = R0 - 0.004; blob(gp, '#9a3a22', Math.sin(a) * r, 0.25 + (i % 2) * 0.008, cz - Math.cos(a) * r, 0.005, 0.005, 0.002, -a, 0, 0, 6); }
  // Lamps glowing on the floor; the four teenagers and their dog Robot at the cave mouth
  for (const [x, z] of [[-0.08, -0.05], [0.12, 0.0]] as const) {
    lathe(gp, [[0.0001, 0], [0.01, 0], [0.012, 0.006], [0.0001, 0.004]], '#8a7a62', x, y0, z, 8);
    blob(gp, '#ffcf66', x, y0 + 0.012, z, 0.004, 0.008, 0.004).material = glow('#ffcf66');
  }
  person(gp, -0.04, y0, 0.1, Math.PI + 0.3, 'point', '#2f4b7c', 2, null, '#4b3b2b');
  person(gp, 0.06, y0, 0.12, Math.PI - 0.2, 'carry', '#8b3a3a', 0, null, '#3f3f46');
  blob(gp, '#ffcf66', 0.067, y0 + 0.072, 0.12, 0.005, 0.006, 0.005).material = glow('#ffcf66');
  person(gp, 0.13, y0, 0.18, Math.PI - 0.6, 'stand', '#556b2f', 3, null, '#4b3b2b');
  person(gp, -0.12, y0, 0.2, Math.PI + 0.5, 'stand', '#9a8c6a', 2, null, '#3f3f46');
  const dog = grp(gp, 0.0, y0, 0.2, 2.6);
  blob(dog, '#f1ece0', 0, 0.016, 0, 0.007, 0.006, 0.013);
  blob(dog, '#f1ece0', 0, 0.024, 0.013, 0.006);
  blob(dog, '#3a2a1e', 0.004, 0.026, 0.012, 0.003, 0.004, 0.003);
  for (const [x, z] of [[-0.004, -0.008], [0.004, -0.008], [-0.004, 0.008], [0.004, 0.008]] as const) rod(dog, [x, 0.012, z], [x, 0, z], 0.0018, '#f1ece0', 4);
  // Oak woods on the hill and around
  const trees: [number, number, number][] = [[-0.3, -0.33, 0.07], [0.32, -0.3, 0.075], [0.05, -0.43, 0.06], [-0.4, 0.05, 0.06], [0.4, 0.08, 0.065], [-0.32, 0.3, 0.055], [0.34, 0.3, 0.06], [-0.18, -0.42, 0.055]];
  for (const [x, z, s] of trees) tree(gp, x, h(x, z) - 0.004, z, s, '#4f7d36');
  rangePole(gp, 0.2, y0, 0.32, 0.06);
  finds(gp, -0.22, y0, 0.33, 0.4, ['#7a2f1c', '#1d1712', '#c76a3c']);
};

// =========================================================================================================
// Sanxingdui: sacrificial pits with crossing elephant tusks and the giant protruding-eye bronze mask
// =========================================================================================================

const BRONZE = '#6f8460';
const patina = (x: number, y: number, z: number) => {
  const v = fbm(x * 9 + 3, y * 9, z * 9);
  return v > 0.62 ? '#9a8f5a' : v > 0.5 ? '#7d8a5e' : v < 0.3 ? '#4f6648' : null;
};
/** The great protruding-eye bronze mask (unit ≈ 1.1 wide incl. ears, front +z). */
function sanxMask(p: THREE.Object3D, x: number, y: number, z: number, S: number, tilt: number): void {
  const q = grp(p, x, y, z, 0, S);
  q.rotation.x = -tilt;
  const o = { metal: 0.45, rough: 0.55 };
  const pm = mat('#ffffff', { ...o, vc: true, flat: true });
  const face = slab(q, [[-0.32, 0.44], [0.32, 0.44], [0.33, 0.2], [0.27, 0.05], [0.15, 0.0], [-0.15, 0.0], [-0.27, 0.05], [-0.33, 0.2]], 0.2, BRONZE, 0.02, false);
  face.geometry = paintFaces(face.geometry, BRONZE, patina); face.material = pm;
  box(q, '#2b2f24', 0, 0.37, 0.1, 0.05, 0.05, 0.012);
  for (const sx of [-1, 1]) {
    // Ears: huge flared fins with a spiral inside
    const ear = slab(q, smooth([[0, 0.0], [0.12, -0.05], [0.27, 0.04], [0.36, 0.2], [0.3, 0.38], [0.16, 0.34], [0.03, 0.22]]), 0.035, '#7a8d66', 0, false);
    ear.geometry = paintFaces(ear.geometry, '#7a8d66', patina); ear.material = pm;
    ear.scale.set(sx, 1, 1); ear.position.set(sx * 0.3, 0.08, 0.0); ear.rotation.y = sx * 0.25;
    const curl = slab(q, smooth([[0.06, 0.06], [0.16, 0.03], [0.25, 0.13], [0.23, 0.27], [0.12, 0.22]]), 0.045, '#55694a', 0, false);
    curl.material = mat('#55694a', o);
    curl.scale.set(sx, 1, 1); curl.position.set(sx * 0.31, 0.08, 0.01); curl.rotation.y = sx * 0.25;
    // Almond eye sockets with the cylinder pupils thrusting forward
    blob(q, '#62764f', sx * 0.15, 0.29, 0.1, 0.13, 0.045, 0.03, 0, 0, sx * 0.3, 10, o);
    add(q, CYLX(), mat('#8f9b6a', { ...o, flat: false }), sx * 0.15, 0.29, 0.24, 0.12, 0.28, 0.12, 0, Math.PI / 2).castShadow = true;
    add(q, CYLX(), mat('#a8ad7e', o), sx * 0.15, 0.29, 0.38, 0.135, 0.025, 0.135, 0, Math.PI / 2);
    blob(q, '#6b5a3a', sx * 0.15, 0.29, 0.392, 0.04, 0.04, 0.006);
    // Slanted brows
    rod(q, [sx * 0.035, 0.36, 0.11], [sx * 0.29, 0.42, 0.1], 0.025, '#4a5c3e', 5);
  }
  // Hooked nose, wide smiling mouth
  sweep(q, [{ p: [0, 0.34, 0.1], w: 0.03, h: 0.03 }, { p: [0, 0.24, 0.15], w: 0.05, h: 0.045 }, { p: [0, 0.16, 0.135], w: 0.08, h: 0.035 }], '#7a8d66', { radial: 8, sub: 3 });
  const mouth: V3[] = [];
  for (let i = 0; i <= 8; i++) { const t = -1 + i / 4; mouth.push([t * 0.23, 0.075 + 0.04 * t * t, 0.105 + 0.01 * (1 - t * t)]); }
  for (let i = 0; i < mouth.length - 1; i++) rod(q, mouth[i], mouth[i + 1], 0.018, '#3e4a33', 5);
}

const sanxingdui: Builder = gp => {
  const top = 0.075, fl = 0.018;
  const P1 = rect(-0.24, 0.24, -0.2, 0.12), P2 = rect(0.15, 0.33, 0.19, 0.33), P3 = rect(-0.38, -0.2, 0.18, 0.32);
  const soil = (x: number, _y: number, z: number) => (hash3(Math.floor(x * 80), 5, Math.floor(z * 80)) > 0.9 ? '#5a4a3a' : mix('#6b5a48', '#4a3e33', fbm(x * 20, 1, z * 20)));
  const gy = ground(gp, [
    { h: (x, z) => top + 0.003 * fbm(x * 18, 0, z * 18), c: (x, _y, z) => (hash3(Math.floor(x * 80), 1, Math.floor(z * 80)) > 0.92 ? '#8f9a52' : mix('#a88a5c', '#b99a6a', fbm(x * 9, 0, z * 9))) },
    { in: rect(-0.26, 0.26, -0.22, 0.14), h: () => top - 0.02, c: () => '#9a7a52' },
    { in: P1, h: () => fl, c: soil },
    { in: P2, h: () => 0.03, c: soil },
    { in: P3, h: () => 0.035, c: soil },
  ], strata(['#b38a58', '#9a774b', '#c8a26c', '#7d5f3f', '#a98457'], 90), 56);
  strings(gp, -0.24, 0.24, -0.2, 0.12, top + 0.012, 0.08);
  // Elephant tusks criss-crossing the pit floor
  for (let i = 0; i < 13; i++) {
    const a = hash3(i, 1, 9) * Math.PI, cx = -0.18 + hash3(i, 2, 9) * 0.36, czz = -0.15 + hash3(i, 3, 9) * 0.22, L = 0.09 + hash3(i, 4, 9) * 0.05;
    const dx = Math.cos(a) * L / 2, dz = Math.sin(a) * L / 2, bend = (hash3(i, 5, 9) - 0.5) * 0.04;
    sweep(gp, [{ p: [cx - dx, fl + 0.006 + (i % 3) * 0.004, czz - dz], w: 0.006 }, { p: [cx - bend * Math.sin(a), fl + 0.012 + (i % 3) * 0.004, czz + bend * Math.cos(a)], w: 0.0055 }, { p: [cx + dx, fl + 0.006 + (i % 3) * 0.004, czz + dz], w: 0.0015 }], '#eadfc4', { radial: 6, sub: 3 });
  }
  // Scattered bronze fragments and jade
  for (let i = 0; i < 10; i++) {
    const x = -0.2 + hash3(i, 6, 1) * 0.4, z = -0.16 + hash3(i, 7, 1) * 0.26;
    box(gp, i % 4 ? BRONZE : '#3f8f7a', x, fl, z, 0.012 + hash3(i, 8, 1) * 0.015, 0.004, 0.008, hash3(i, 9, 1) * 3).material = mat(i % 4 ? BRONZE : '#3f8f7a', { metal: 0.4, rough: 0.6 });
  }
  // Mask rests on a padded cradle at the back of the pit; the gold-faced bronze head and a gold mask nearby
  rbox(gp, '#e5e7eb', 0, fl, -0.13, 0.2, 0.025, 0.06, 0.006);
  sanxMask(gp, 0, fl + 0.022, -0.14, 0.36, 0.42);
  const hd = grp(gp, -0.17, fl, 0.0, -0.5, 1.5);
  cyl(hd, BRONZE, 0, 0, 0, 0.018, 0.035, 10).material = mat(BRONZE, { metal: 0.45, rough: 0.55 });
  rbox(hd, BRONZE, 0, 0.032, 0, 0.044, 0.056, 0.042, 0.01).material = mat(BRONZE, { metal: 0.45, rough: 0.55 });
  cyl(hd, '#5d7150', 0, 0.086, 0, 0.024, 0.012, 12).material = mat('#5d7150', { metal: 0.45, rough: 0.55 });
  const gf = rbox(hd, '#e0b44c', 0, 0.036, 0.019, 0.042, 0.046, 0.008, 0.003); gf.material = gold('#e0b44c');
  for (const sx of [-1, 1]) {
    box(hd, '#2b2f24', sx * 0.011, 0.064, 0.0235, 0.015, 0.004, 0.002);
    slab(hd, [[0, 0], [0.012, -0.004], [0.016, 0.012], [0.01, 0.026], [0, 0.02]], 0.004, '#7a8d66', 0, false).position.set(sx * 0.02, 0.045, 0);
  }
  box(hd, '#a3722a', 0, 0.048, 0.0235, 0.006, 0.012, 0.004);
  box(hd, '#6b4a2a', 0, 0.042, 0.0235, 0.022, 0.0025, 0.002);
  const gm = grp(gp, 0.16, fl + 0.004, 0.02, -0.6);
  const gmesh = slab(gm, [[-0.05, 0.06], [0.05, 0.06], [0.055, 0.0], [0.03, -0.045], [-0.03, -0.045], [-0.055, 0.0]], 0.004, '#e2b44a', 0, false);
  gmesh.material = gold('#e2b44a'); gmesh.rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1]) box(gm, '#2b2a24', sx * 0.022, 0.003, -0.015, 0.024, 0.002, 0.008);
  // Plank bridge across the pit with archaeologists in white suits working from it
  for (const sx of [-1, 1]) box(gp, '#9a7b55', sx * 0.25, top, 0.06, 0.03, 0.012, 0.03);
  box(gp, '#c9a777', 0, top + 0.012, 0.06, 0.54, 0.006, 0.04);
  person(gp, -0.06, top + 0.018, 0.06, Math.PI, 'kneel', '#f8fafc', 2, '#f8fafc', '#f8fafc');
  person(gp, 0.08, top + 0.018, 0.06, Math.PI + 0.3, 'kneel', '#f8fafc', 0, '#f8fafc', '#f8fafc');
  person(gp, 0.05, fl, -0.03, 2.4, 'bend', '#f8fafc', 2, '#f8fafc', '#f8fafc');
  // Climate-controlled glass lab over a second pit
  const cab = grp(gp, 0.24, gy(0.24, 0.26), 0.26, 0, 0.76);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(cab, '#f8fafc', sx * 0.135, 0, sz * 0.105, 0.006, 0.09, 0.006);
  for (const sz of [-1, 1]) box(cab, '#f8fafc', 0, 0.09, sz * 0.105, 0.276, 0.006, 0.006);
  for (const sx of [-1, 1]) box(cab, '#f8fafc', sx * 0.135, 0.09, 0, 0.006, 0.006, 0.216);
  const glass = mat('#cbe7f2', { transparent: 0.3 });
  box(cab, '#cbe7f2', 0, 0.093, 0, 0.27, 0.003, 0.21).material = glass;
  for (const sz of [-1, 1]) box(cab, '#cbe7f2', 0, 0, sz * 0.105, 0.27, 0.09, 0.002).material = glass;
  for (const sx of [-1, 1]) box(cab, '#cbe7f2', sx * 0.135, 0, 0, 0.002, 0.09, 0.21).material = glass;
  person(gp, 0.21, 0.03, 0.25, 0.4, 'kneel', '#f8fafc', 1, '#f8fafc', '#f8fafc');
  for (let i = 0; i < 4; i++) sweep(gp, [{ p: [0.18 + i * 0.035, 0.034, 0.21], w: 0.005 }, { p: [0.2 + i * 0.035, 0.038, 0.26], w: 0.005 }, { p: [0.19 + i * 0.035, 0.034, 0.31], w: 0.0015 }], '#eadfc4', { radial: 6, sub: 2 });
  // Third pit with sieving station; camp tent and finds tables
  sieve(gp, -0.3, 0.035, 0.23, 0.3);
  bucket(gp, -0.25, 0.035, 0.27, '#f97316');
  person(gp, -0.34, 0.035, 0.27, 0.6, 'bend', '#f8fafc', 3, '#f8fafc', '#f8fafc');
  tent(gp, -0.26, gy(-0.26, -0.33), -0.32, 0.3, 0.14, 0.1, 0.065, '#3b82f6');
  finds(gp, -0.26, gy(-0.26, -0.33) + 0.025, -0.32, 0.3, [BRONZE, '#eadfc4', '#e2b44a']);
  box(gp, '#9a7b55', -0.26, gy(-0.26, -0.33), -0.32, 0.034, 0.025, 0.024, 0.3);
  tent(gp, 0.3, gy(0.3, -0.33), -0.31, -0.3, 0.13, 0.1, 0.07, '#e5e7eb');
  crate(gp, 0.32, gy(0.32, -0.2), -0.2, 0.035, 0.2);
  wheelbarrow(gp, 0.38, gy(0.38, 0.0), 0.0, -1.2, '#dc2626', '#9a774b');
  shovel(gp, 0.3, gy(0.3, 0.1), 0.1, 0.4);
  for (const [x, z] of [[-0.42, -0.1], [0.44, -0.18], [-0.38, -0.3]] as const) tree(gp, x, gy(x, z), z, 0.06, '#4f8a3c');
};

// =========================================================================================================
// Göbekli Tepe: stone circle of carved T-pillars on a hilltop — the world's oldest known temple
// =========================================================================================================

/** Stone T-pillar (front +z broad face), optional arms, belt and fox relief. */
function tPillar(p: THREE.Object3D, x: number, y: number, z: number, ry: number, H: number, carved: boolean): void {
  const q = grp(p, x, y, z, ry);
  const LIME = '#d8ccb0', w = H * 0.3, t = H * 0.11;
  rbox(q, LIME, 0, 0, 0, w, H * 0.8, t, 0.004);
  rbox(q, '#e2d7bc', w * 0.12, H * 0.8, 0, w * 1.55, H * 0.2, t * 1.15, 0.004);
  if (!carved) return;
  const RC = '#a8946c';
  for (const sx of [-1, 1]) {
    rod(q, [sx * w * 0.4, H * 0.74, t * 0.52], [sx * w * 0.38, H * 0.42, t * 0.52], H * 0.026, RC, 5);
    rod(q, [sx * w * 0.38, H * 0.42, t * 0.52], [sx * w * 0.06, H * 0.36, t * 0.52], H * 0.022, RC, 5);
    for (let f = 0; f < 4; f++) box(q, RC, sx * (w * 0.03 + f * w * 0.025), H * 0.34, t * 0.51, w * 0.015, H * 0.04, t * 0.06);
  }
  box(q, RC, 0, H * 0.31, t * 0.5, w * 0.96, H * 0.025, t * 0.08);
  for (let i = 0; i < 5; i++) blob(q, RC, -w * 0.36 + i * w * 0.18, H * 0.32, t * 0.53, w * 0.04, H * 0.012, t * 0.03);
  // Fox pelt hanging from the belt
  const fox = slab(q, smooth([[0, 0], [0.04, -0.02], [0.06, -0.12], [0.03, -0.2], [0.0, -0.24], [-0.03, -0.2], [-0.06, -0.12], [-0.04, -0.02]]), t * 0.12, RC, 0, false);
  fox.scale.setScalar(H * 0.85); fox.position.set(0, H * 0.31, t * 0.52);
  // Leaping fox on the head
  const fx = slab(q, [[-0.5, 0.05], [-0.2, 0.15], [0.2, 0.15], [0.4, 0.3], [0.5, 0.2], [0.35, 0.05], [0.4, -0.15], [0.3, -0.15], [0.15, 0.0], [-0.15, 0.0], [-0.3, -0.15], [-0.4, -0.15], [-0.3, 0.02], [-0.6, -0.05]], t * 0.12, RC, 0, false);
  fx.scale.set(w * 0.6, H * 0.1, 1); fx.position.set(w * 0.08, H * 0.88, t * 0.58);
}

const gobeklitepe: Builder = gp => {
  const ER = 0.21, fl = 0.05, cz = -0.03;
  const hill: H2 = (x, z) => 0.1 + 0.04 * sstep(0.1, -0.4, z) + 0.008 * fbm(x * 9, 0, z * 9) - 0.03 * sstep(0.32, 0.5, Math.hypot(x, z));
  const inEnc = (x: number, z: number) => Math.hypot(x, z - cz) < ER + 0.03;
  const TERRA = (x: number, _y: number, z: number) => (hash3(Math.floor(x * 70), 2, Math.floor(z * 70)) > 0.86 ? '#c9b48e' : mix('#b8956a', '#a8845a', fbm(x * 12, 0, z * 12)));
  const lv: Lvl[] = [
    { h: hill, c: (x, y, z) => (y > 0.13 && vnoise(x * 30, 0, z * 30) > 0.55 ? '#c9b998' : mix('#c4a77a', '#b19065', fbm(x * 10, 1, z * 10))) },
    { in: inEnc, h: () => fl, c: (x, _y, z) => (hash3(Math.floor(x * 90), 4, Math.floor(z * 90)) > 0.8 ? '#cbbd9e' : '#bfae8c') },
  ];
  for (const [x0, z0] of [[0.27, -0.12], [0.27, 0.0], [-0.33, -0.08], [0.15, -0.3], [0.03, -0.32]] as const) lv.push({ in: rect(x0 - 0.04, x0 + 0.04, z0 - 0.04, z0 + 0.04), h: () => 0.07, c: TERRA });
  const gy = ground(gp, lv, strata(['#c8ab7c', '#b8955f', '#d9c39a', '#a8845a', '#cbb38a'], 80), 56);
  // Dry-stone enclosure wall
  const NA = 56, NH = 7, wh = 0.07;
  const wg = new THREE.CylinderGeometry(ER + 0.02, ER + 0.02, wh, NA, NH, true);
  const wgi = new THREE.CylinderGeometry(ER, ER, wh, NA, NH, true);
  const stone = (x: number, y: number, z: number) => {
    const row = Math.floor((y + wh / 2) / (wh / NH)), a = Math.atan2(z, x), col = Math.floor(a * 9 + (row % 2) * 0.5);
    const v = hash3(row, col, 3);
    return v > 0.7 ? '#bca986' : v > 0.35 ? '#cdbd9b' : '#d9cbaa';
  };
  add(gp, paintFaces(wg, '#cdbd9b', stone), mat('#ffffff', { vc: true, flat: true }), 0, fl + wh / 2, cz, 1, 1, 1);
  const gi = paintFaces(wgi, '#cdbd9b', stone);
  const ia = gi.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < ia.count; i += 3) { const ax = ia.getX(i + 1), ay = ia.getY(i + 1), az = ia.getZ(i + 1); ia.setXYZ(i + 1, ia.getX(i + 2), ia.getY(i + 2), ia.getZ(i + 2)); ia.setXYZ(i + 2, ax, ay, az); }
  gi.computeVertexNormals();
  add(gp, gi, mat('#ffffff', { vc: true, flat: true }), 0, fl + wh / 2, cz, 1, 1, 1);
  add(gp, g('ar:ring', () => { const r = new THREE.RingGeometry(ER, ER + 0.02, NA, 1); r.rotateX(-Math.PI / 2); return r; }), mat('#c8b896'), 0, fl + wh, cz, 1, 1, 1);
  // Ring of T-pillars set into the wall facing the centre, the two great carved pillars in the middle
  for (let i = 0; i < 11; i++) {
    const a = -2.4 + (i / 10) * 4.8, px = Math.sin(a) * (ER - 0.008), pz = cz - Math.cos(a) * (ER - 0.008);
    if (Math.abs(a) > 2.3 && i > 0 && i < 10) continue;
    tPillar(gp, px, fl, pz, -a + Math.PI / 2, 0.1 + hash3(i, 1, 1) * 0.02, false);
  }
  tPillar(gp, -0.055, fl, cz - 0.03, 0.05, 0.24, true);
  tPillar(gp, 0.06, fl, cz - 0.01, -0.08, 0.23, true);
  // Raised boardwalk, visitors, archaeologists and the lone mulberry "wishing tree"
  const bw = 0.27;
  for (let i = 0; i < 9; i++) { const a = 0.4 + i * 0.29, x = Math.cos(a) * bw, z = cz + Math.sin(a) * bw; box(gp, '#8b6a45', x, gy(x, z), z, 0.03, 0.022, 0.012, -a); }
  for (let i = 0; i < 8; i++) {
    const a0 = 0.4 + i * 0.29, a1 = a0 + 0.29, x0 = Math.cos(a0) * bw, z0 = cz + Math.sin(a0) * bw, x1 = Math.cos(a1) * bw, z1 = cz + Math.sin(a1) * bw;
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    box(gp, '#a8835a', (x0 + x1) / 2, Math.max(gy(x0, z0), gy(x1, z1)) + 0.022, (z0 + z1) / 2, len + 0.004, 0.005, 0.034, -ang);
  }
  person(gp, -0.02, fl, 0.1, Math.PI + 0.2, 'kneel', '#f59e0b', 1);
  person(gp, 0.13, fl, 0.0, -1.4, 'bend', '#60a5fa', 0);
  bucket(gp, 0.11, fl, 0.05, '#2563eb');
  person(gp, 0.25, 0.07, -0.12, -0.6, 'kneel', '#e5e7eb', 2);
  person(gp, -0.33, 0.07, -0.08, 0.8, 'bend', '#84cc16', 3);
  sieve(gp, -0.24, gy(-0.24, -0.25), -0.25, 0.4);
  person(gp, 0.0, gy(0, 0.27) + 0.027, 0.27, Math.PI, 'point', '#ef4444', 0, '#f5f5f4', '#1f2937');
  person(gp, -0.14, gy(-0.14, 0.24) + 0.027, 0.24 - 0.01, Math.PI - 0.6, 'stand', '#3b82f6', 2, null, '#1f2937');
  wheelbarrow(gp, 0.36, gy(0.36, 0.12), 0.12, -0.6, '#f97316', '#b8956a');
  tent(gp, -0.35, gy(-0.35, 0.18), 0.18, 0.6, 0.11, 0.08, 0.06, '#f5f5f4');
  const tx = 0.33, tz = -0.32, ty = gy(tx, tz);
  rod(gp, [tx, ty, tz], [tx + 0.01, ty + 0.07, tz], 0.008, '#6b4c35', 5);
  blob(gp, '#5f8f3a', tx + 0.01, ty + 0.1, tz, 0.06, 0.045, 0.06, 0, 0, 0, 9);
  for (let i = 0; i < 6; i++) box(gp, ['#ef4444', '#3b82f6', '#facc15'][i % 3], tx - 0.04 + i * 0.016, ty + 0.06 + (i % 2) * 0.01, tz + 0.05, 0.004, 0.012, 0.001);
  rangePole(gp, -0.3, 0.07, -0.13, 0.05);
};

// =========================================================================================================
// Nazca Lines: a giant hummingbird scraped into the red desert, seen from a viewing tower and a little plane
// =========================================================================================================

const BIRD: Pt[] = [[0, -1.0], [0.025, -0.55], [0.11, -0.5], [0.12, -0.38], [0.07, -0.3], [0.12, -0.22], [0.42, -0.32], [0.72, -0.37], [0.97, -0.32], [0.8, -0.22], [0.99, -0.18], [0.79, -0.1], [0.95, -0.04], [0.68, 0.0], [0.4, -0.02], [0.16, 0.04], [0.13, 0.26], [0.08, 0.4], [0.26, 0.7], [0.17, 0.74], [0.12, 0.56], [0.1, 0.8], [0.04, 0.8], [0.03, 0.6], [0, 0.63]];

/** Pale scraped line following a polyline in plan, draped on the ground. */
function geoLine(p: THREE.Object3D, pts: Pt[], gy: H2, w: number, c: string): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    box(p, c, mx, gy(mx, mz) - 0.0015, mz, L + w * 0.5, 0.0035, w, -Math.atan2(z1 - z0, x1 - x0));
  }
}

const nazca: Builder = gp => {
  const h: H2 = (x, z) => 0.06 + 0.004 * fbm(x * 15, 0, z * 15) + 0.12 * sstep(-0.28, -0.48, z) * (0.6 + 0.5 * ridged(x * 4 + 2, z * 4));
  const gy = ground(gp, [{ h, c: (x, y, z) => {
    if (Math.abs(z - 0.36 - x * 0.12) < 0.025) return Math.abs(z - 0.36 - x * 0.12) < 0.002 ? '#facc15' : '#4b4b4f';
    if (y > 0.09) return mix('#d9b48a', '#c99c72', fbm(x * 10, y * 10, z * 10));
    return hash3(Math.floor(x * 110), 0, Math.floor(z * 110)) > 0.88 ? '#6e3f28' : mix('#9a5b3a', '#ad6c46', fbm(x * 14, 0, z * 14));
  } }], strata(['#a8643f', '#c98e60', '#8a5032', '#d9a87a', '#b3734a'], 70), 56);
  const LINE = '#ecd9b6';
  const S = 0.26, ox = -0.04, oz = -0.02, rot = 0.35;
  const tr = ([x, z]: Pt): Pt => { const c = Math.cos(rot), sn = Math.sin(rot); return [ox + (x * c - z * sn) * S, oz + (x * sn + z * c) * S]; };
  const full = [...BIRD, ...BIRD.slice(0, -1).reverse().map(([x, z]) => [-x, z] as Pt)].map(tr);
  geoLine(gp, full, gy, 0.0065, LINE);
  // Long straight lines and a trapezoid running to the horizon
  geoLine(gp, [[-0.45, 0.2], [0.15, -0.38]], gy, 0.005, LINE);
  geoLine(gp, [[0.42, -0.2], [-0.2, 0.28]], gy, 0.004, LINE);
  const trap: Pt[] = [[0.22, 0.05], [0.44, 0.0], [0.45, 0.06], [0.24, 0.09]];
  for (let i = 0; i < 6; i++) geoLine(gp, [[0.22 + i * 0.002, 0.055 + i * 0.006], [0.44, 0.005 + i * 0.01]], gy, 0.007, LINE);
  geoLine(gp, [...trap, trap[0]], gy, 0.004, LINE);
  // The steel mirador viewing tower by the highway, with visitors on the platform
  const mx = 0.27, mz = 0.22, my = gy(mx, mz), MH = 0.13;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(gp, [mx + sx * 0.03, my, mz + sz * 0.03], [mx + sx * 0.02, my + MH, mz + sz * 0.02], 0.0025, '#9ca3af', 5);
  for (let i = 1; i <= 3; i++) { const y = my + (MH * i) / 3, r = 0.03 - 0.01 * (i / 3); box(gp, '#6b7280', mx, y - 0.002, mz, r * 2.1, 0.003, r * 2.1); }
  box(gp, '#9ca3af', mx, my + MH, mz, 0.05, 0.004, 0.05);
  for (const [dx, dz] of [[-0.025, 0], [0.025, 0], [0, -0.025], [0, 0.025]] as const) box(gp, '#d1d5db', mx + dx, my + MH + 0.004, mz + dz, dz ? 0.05 : 0.002, 0.014, dz ? 0.002 : 0.05);
  for (let i = 0; i < 6; i++) { const y0 = my + (MH * i) / 6, s = i % 2 ? 1 : -1; rod(gp, [mx + 0.034 * s, y0, mz + 0.034], [mx - 0.034 * s, y0 + MH / 6, mz + 0.034], 0.002, '#6b7280', 4); }
  person(gp, mx - 0.01, my + MH + 0.004, mz, -2.3, 'point', '#ef4444', 0, null, '#1f2937', 0.8);
  person(gp, mx + 0.012, my + MH + 0.004, mz - 0.006, -2.6, 'stand', '#22c55e', 2, '#f5f5f4', '#1f2937', 0.8);
  // Maria Reiche, the "lady of the lines", sweeping the hummingbird's tail clean
  const [rx, rz] = tr([0.18, 0.84]);
  person(gp, rx, gy(rx, rz), rz, -0.4, 'bend', '#e5e7eb', 2, '#f8fafc', '#93785a');
  rod(gp, [rx + 0.004, gy(rx, rz) + 0.04, rz + 0.02], [rx + 0.01, gy(rx, rz), rz + 0.045], 0.0012, '#8b6a45', 4);
  box(gp, '#d6b56d', rx + 0.01, gy(rx, rz), rz + 0.046, 0.014, 0.004, 0.006, 0.4);
  // Small sightseeing plane banking overhead
  const pl = grp(gp, -0.16, 0.36, 0.08, 0.6);
  pl.rotation.z = 0.25;
  sweep(pl, [{ p: [-0.08, 0.004, 0], w: 0.004, h: 0.006 }, { p: [-0.03, 0.002, 0], w: 0.012, h: 0.014 }, { p: [0.03, 0, 0], w: 0.014, h: 0.015 }, { p: [0.065, -0.002, 0], w: 0.009, h: 0.01 }], '#f8fafc', {
    radial: 10, sub: 3, caps: true, paint: (x, y) => (y > 0.006 && x > 0.01 && x < 0.05 ? '#1e3a5f' : Math.abs(y + 0.001) < 0.0025 ? '#dc2626' : null),
  });
  box(pl, '#f1f5f9', 0.02, 0.012, 0, 0.026, 0.0025, 0.2);
  for (const sz of [-1, 1]) box(pl, '#dc2626', 0.02, 0.0126, sz * 0.095, 0.026, 0.0025, 0.012);
  box(pl, '#f1f5f9', -0.075, 0.006, 0, 0.014, 0.002, 0.06);
  slab(pl, [[-0.085, 0.004], [-0.065, 0.006], [-0.07, 0.03], [-0.085, 0.032]], 0.002, '#dc2626', 0, false);
  box(pl, '#374151', 0.068, -0.012, 0, 0.002, 0.024, 0.003);
  for (const sz of [-1, 1]) rod(pl, [0.03, -0.012, 0], [0.032, -0.024, sz * 0.012], 0.0015, '#6b7280', 4);
  // Desert huarango trees and a parked tour van
  for (const [x, z] of [[-0.42, 0.18], [0.44, -0.1], [-0.38, -0.24]] as const) { const y = gy(x, z); rod(gp, [x, y, z], [x, y + 0.04, z], 0.004, '#6b4c35', 4); blob(gp, '#6b8f3a', x, y + 0.05, z, 0.04, 0.018, 0.04, 0, 0, 0, 7); }
  const vx = 0.07, vz = 0.37, vy = gy(vx, vz);
  rbox(gp, '#f8fafc', vx, vy + 0.006, vz, 0.07, 0.03, 0.032, 0.006, -0.12);
  box(gp, '#1e3a5f', vx + 0.01, vy + 0.022, vz + 0.0045, 0.05, 0.009, 0.0335, -0.12);
  for (const [dx, dz] of [[-0.022, -0.016], [0.022, -0.016], [-0.022, 0.016], [0.022, 0.016]] as const) add(gp, CYLX(), mat('#1f2937'), vx + dx, vy + 0.007, vz + dz, 0.014, 0.006, 0.014, -0.12, 0, Math.PI / 2);
};


/** Box with a brick/stone course pattern (cached unit geometry, shaded through vertex colours × material colour). */
function bricks(p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rows = 4, cols = 6): THREE.Mesh {
  const geo = g(`ar:brick${rows}:${cols}`, () => paintFaces(new THREE.BoxGeometry(1, 1, 1, cols, rows, Math.max(1, Math.round(cols / 3))), '#ffffff', (px, py, pz, nx, ny, nz) => {
    const r = Math.floor((py + 0.5) * rows - 1e-4), u = Math.abs(nx) > 0.5 ? pz : px, k = Math.floor((u + 0.5) * cols + (r % 2) * 0.5);
    if (ny > 0.5) return hash3(Math.floor((px + 0.5) * cols), 7, Math.floor((pz + 0.5) * cols)) > 0.5 ? '#f2f2f2' : '#dcdcdc';
    const v = hash3(r, k, Math.round(nx * 3 + nz * 5));
    return v > 0.75 ? '#c8c8c8' : v > 0.4 ? '#e8e8e8' : '#ffffff';
  }));
  const m = add(p, geo, mat(c, { vc: true }), x, y + sy / 2, z, sx, sy, sz, ry);
  return m;
}

// =========================================================================================================
// Mawangdui: the Han tomb dug open in stepped terraces — the wooden 井 chamber with nested lacquer coffins
// =========================================================================================================

const mawangdui: Builder = gp => {
  const d0 = (x: number, z: number) => Math.hypot(x, z);
  const mound: H2 = (x, z) => 0.075 + 0.055 * sstep(0.5, 0.18, d0(x, z)) + 0.004 * fbm(x * 16, 0, z * 16);
  const tiers = [[0.31, 0.28, 0.22, 0.105], [0.25, 0.22, 0.16, 0.08], [0.19, 0.16, 0.1, 0.055]] as const;
  const lv: Lvl[] = [{ h: mound, c: (x, y, z) => (y > 0.1 ? mix('#7aa04a', '#8bb158', fbm(x * 12, 0, z * 12)) : mix('#8fa65a', '#a8a066', fbm(x * 9, 1, z * 9))) }];
  for (const [w, zb, zf, hh] of tiers) lv.push({ in: rect(-w, w, -zb, zf), h: () => hh, c: (x, _y, z) => mix('#c9a46a', '#b8915a', fbm(x * 20, 2, z * 20)) });
  lv.push({ in: rect(-0.15, 0.15, -0.13, 0.07), h: () => 0.025, c: () => '#3a3330' });
  lv.push({ in: rect(-0.045, 0.045, 0.07, 0.46), h: (_x, z) => 0.03 + Math.max(0, z - 0.07) * 0.27, c: (x, _y, z) => (hash3(Math.floor(x * 90), 3, Math.floor(z * 90)) > 0.8 ? '#b08a56' : '#c49c66') });
  const loess = strata(['#c9a46a', '#b88f58', '#d8b57c', '#a98050'], 80);
  const gy = ground(gp, lv, (x, y, z) => (Math.hypot(x, z) > 0.45 ? loess(x, y, z) : y < 0.032 ? (hash3(Math.floor(x * 200), Math.floor(y * 300), Math.floor(z * 200)) > 0.85 ? '#3d3d3d' : '#222') : y < 0.05 ? '#ece7da' : loess(x, y, z)), 56);
  // Wooden 井-shaped outer chamber: planked walls and dividers, four side compartments round the coffin
  const WD = '#5c3d22', WL = '#7a5332', fy = 0.025, cz = -0.03, CW = 0.13, CD = 0.095, CH = 0.045;
  box(gp, WL, 0, fy, cz, CW * 2, 0.004, CD * 2);
  for (const sz of [-1, 1]) bricks(gp, WD, 0, fy, cz + sz * CD, CW * 2 + 0.008, CH, 0.008, 0, 5, 1);
  for (const sx of [-1, 1]) bricks(gp, WD, sx * CW, fy, cz, 0.008, CH, CD * 2, 0, 5, 1);
  const ix = 0.078, iz0 = cz - 0.056, iz1 = cz + 0.056;
  for (const z of [iz0, iz1]) bricks(gp, WL, 0, fy, z, CW * 2, CH * 0.9, 0.006, 0, 5, 1);
  for (const sx of [-1, 1]) bricks(gp, WL, sx * ix, fy, cz, 0.006, CH * 0.9, CD * 2, 0, 5, 1);
  // Nested coffins: open black-lacquer outer coffin with cloud scrolls, red-lacquer coffin closed inside
  const cloud: Paint = (px, py, pz) => (Math.sin(px * 22 + Math.sin(py * 9 + pz * 12) * 2.4) > 0.78 || Math.sin(pz * 26 - py * 8) > 0.9 ? '#c9a24a' : null);
  const lattice: Paint = (px, py, pz, _nx, ny) => {
    const f = (v: number) => Math.abs((((v % 1) + 1) % 1) - 0.5) < 0.1;
    if (ny > 0.5) return f(px * 5 + pz * 3) || f(px * 5 - pz * 3) ? '#d8b04a' : null;
    return py > 0.25 ? '#1e5b4a' : f(px * 8 + py * 2) ? '#d8b04a' : null;
  };
  const cbox = (key: string, c: string, pnt: Paint, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    add(gp, g('ar:coff:' + key, () => paintFaces(new THREE.BoxGeometry(1, 1, 1, 10, 4, 6), c, pnt)), mat('#ffffff', { vc: true }), x, y + sy / 2, z, sx, sy, sz);
  const ox = 0.07, oz = 0.05, oh = 0.036;
  cbox('blk', '#151515', cloud, 0, fy, cz, ox * 2, 0.004, oz * 2);
  for (const sz of [-1, 1]) cbox('blk', '#151515', cloud, 0, fy, cz + sz * oz, ox * 2, oh, 0.004);
  for (const sx of [-1, 1]) cbox('blk', '#151515', cloud, sx * ox, fy, cz, 0.004, oh, oz * 2);
  cbox('red', '#a5221a', lattice, 0, fy + 0.004, cz, 0.116, 0.03, 0.076);
  rbox(gp, '#1f1a17', 0.02, 0.055, 0.084, 0.13, 0.005, 0.026, 0.002);
  // Grave goods in the side compartments: lacquer ear-cups and boxes, figurines, bamboo cases, silk bundles
  const comp: [number, number, number, number][] = [[-CW + 0.006, -ix - 0.004, cz - CD + 0.006, cz + CD - 0.006], [ix + 0.004, CW - 0.006, cz - CD + 0.006, cz + CD - 0.006], [-ix + 0.004, ix - 0.004, cz - CD + 0.006, iz0 - 0.004], [-ix + 0.004, ix - 0.004, iz1 + 0.004, cz + CD - 0.006]];
  let n = 0;
  for (const [x0, x1, z0, z1] of comp) for (let k = 0; k < 9; k++, n++) {
    const x = x0 + (x1 - x0) * hash3(n, 1, 4), z = z0 + (z1 - z0) * hash3(n, 2, 4), t = hash3(n, 3, 4);
    if (t < 0.35) { blob(gp, '#a5221a', x, fy + 0.004, z, 0.008, 0.004, 0.006, t * 9, 0, 0, 7); blob(gp, '#1a1a1a', x, fy + 0.0075, z, 0.0055, 0.001, 0.004, t * 9, 0, 0, 6); }
    else if (t < 0.55) lathe(gp, [[0.0001, 0], [0.008, 0], [0.009, 0.008], [0.0001, 0.009]], t < 0.45 ? '#1a1a1a' : '#9b1d16', x, fy + 0.004, z, 8);
    else if (t < 0.72) { cyl(gp, '#d9b48a', x, fy + 0.004, z, 0.0035, 0.018, 6); blob(gp, '#f0dcc0', x, fy + 0.025, z, 0.0035); cyl(gp, '#1a1a1a', x, fy + 0.028, z, 0.0036, 0.002, 6); }
    else if (t < 0.86) box(gp, '#b58a4a', x, fy + 0.004, z, 0.016, 0.01, 0.01, t * 5);
    else blob(gp, ['#d9a35e', '#8a4b6e', '#c46b3c'][n % 3], x, fy + 0.008, z, 0.01, 0.005, 0.007, t * 7, 0, 0, 7);
  }
  // The T-shaped painted silk banner laid out on a table under an awning
  const tx = 0.3, tz = -0.3, ty = gy(tx, tz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(gp, [tx + sx * 0.045, ty, tz + sz * 0.03], [tx + sx * 0.045, ty + 0.03, tz + sz * 0.03], 0.002, '#6b4c35', 4);
  box(gp, '#8b6a45', tx, ty + 0.03, tz, 0.1, 0.004, 0.07);
  const ban = slab(gp, [[-0.035, 0.04], [0.035, 0.04], [0.035, 0.015], [0.016, 0.015], [0.016, -0.04], [-0.016, -0.04], [-0.016, 0.015], [-0.035, 0.015]], 0.002, '#c46b3c', 0, false);
  ban.geometry = paintFaces(ban.geometry, '#c46b3c', (px, py) => (py > 0.015 ? (Math.hypot(px - 0.022, py - 0.03) < 0.007 ? '#d32f2f' : Math.hypot(px + 0.022, py - 0.028) < 0.006 ? '#f2e6c0' : '#2d3a4a') : py > -0.01 ? (Math.abs(px) < 0.006 ? '#2b2b2b' : '#b85a30') : '#3d2a1f'));
  ban.material = mat('#ffffff', { vc: true }); ban.rotation.set(-Math.PI / 2, 0, -0.5); ban.position.set(tx, ty + 0.035, tz);
  tent(gp, tx, ty, tz, -0.5, 0.14, 0.11, 0.075, '#dc2626');
  // Diggers: carrying a find on a pole up the ramp, kneeling on the chamber, measuring on the terraces
  person(gp, -0.004, gy(0, 0.2), 0.18, 0, 'carry', '#1e40af', 0, '#e8dcb5', '#374151');
  person(gp, 0.004, gy(0, 0.3), 0.29, 0, 'carry', '#1e40af', 2, '#e8dcb5', '#374151');
  rod(gp, [0, gy(0, 0.2) + 0.07, 0.18], [0, gy(0, 0.3) + 0.07, 0.29], 0.0015, '#8b6a45', 4);
  box(gp, '#a8835a', 0, (gy(0, 0.2) + gy(0, 0.3)) / 2 + 0.045, 0.235, 0.02, 0.016, 0.02);
  person(gp, -0.1, fy + CH, cz + CD, Math.PI, 'kneel', '#f97316', 1, '#e8dcb5', '#374151');
  person(gp, 0.17, 0.055, -0.05, -1.6, 'bend', '#16a34a', 3);
  person(gp, -0.22, 0.08, -0.17, 0.6, 'point', '#e5e7eb', 2, '#f5f5f4', '#1f2937');
  ladder(gp, [0.1, 0.025, 0.065], [0.1, 0.06, 0.1], 0.016);
  crate(gp, 0.28, gy(0.28, 0.24), 0.24, 0.04, 0.4);
  crate(gp, 0.33, gy(0.33, 0.18), 0.18, 0.03, -0.2);
  wheelbarrow(gp, 0.14, gy(0.14, 0.3), 0.3, -0.5, '#16a34a', '#c9a46a');
  shovel(gp, -0.12, gy(-0.12, 0.3), 0.3, 0.3);
  for (const [x, z, s] of [[-0.38, -0.2, 0.07], [0.42, -0.08, 0.065], [-0.32, 0.26, 0.06], [-0.1, -0.42, 0.06], [0.2, -0.4, 0.07], [-0.42, 0.06, 0.06], [0.42, 0.02, 0.06]] as const) tree(gp, x, gy(x, z) - 0.004, z, s, '#3f7d3a');
};

// =========================================================================================================
// Mohenjo-daro: the Great Bath and brick streets of an Indus city, with the famous unicorn seal
// =========================================================================================================

const mohenjodaro: Builder = gp => {
  const BR = '#b9784a', PAVE = '#c58a5a', DUST = '#d6b88c';
  const bz = -0.06, bw = 0.12, bd = 0.075, top = 0.1;
  const brickWall = (x: number, y: number, z: number, _s: number, _t: number, _r: number) => {
    const r = Math.floor(y * 260), k = Math.floor((x + z) * 120 + (r % 2) * 0.5);
    const v = hash3(r, k, 1);
    return v > 0.8 ? '#a0623a' : v > 0.45 ? BR : '#c98d5e';
  };
  const lv: Lvl[] = [
    { h: (x, z) => 0.045 + 0.004 * fbm(x * 14, 0, z * 14), c: (x, _y, z) => (hash3(Math.floor(x * 70), 0, Math.floor(z * 70)) > 0.9 ? '#c4a172' : mix(DUST, '#cdae80', fbm(x * 10, 0, z * 10))) },
    { in: (x, z) => z < 0.1 && x > -0.36 && x < 0.34 && z > -0.42, h: (x, z) => top + 0.003 * fbm(x * 20, 1, z * 20), c: (x, _y, z) => (hash3(Math.floor(x * 60), 2, Math.floor(z * 60)) > 0.75 ? '#c29266' : '#cfa274') },
    { in: (x, z) => Math.hypot(x + 0.26, z + 0.3) < 0.13, h: (x, z) => top + 0.05 * sstep(0.13, 0.04, Math.hypot(x + 0.26, z + 0.3)), c: (x, _y, z) => mix('#c9a074', '#b8875c', fbm(x * 15, 3, z * 15)) },
    { in: rect(-bw - 0.03, bw + 0.03, bz - bd - 0.03, bz + bd + 0.03), h: () => top + 0.002, c: (x, _y, z) => ((Math.floor(x * 80) + Math.floor(z * 80)) % 2 ? PAVE : '#b98050') },
    { in: rect(-bw, bw, bz - bd, bz + bd), h: () => top - 0.045, c: (x, _y, z) => ((Math.floor(x * 70) + Math.floor(z * 140)) % 2 ? '#a86a40' : '#b6774a') },
  ];
  for (const sgn of [-1, 1]) for (let s = 0; s < 4; s++) {
    const x0 = sgn * (bw - 0.012 * s);
    lv.push({ in: rect(Math.min(x0, x0 - sgn * 0.012), Math.max(x0, x0 - sgn * 0.012), bz - 0.04, bz + 0.04), h: () => top - 0.045 + 0.011 * (4 - s), c: () => (s % 2 ? '#c98d5e' : '#b9784a') });
  }
  const gy = ground(gp, lv, (x, y, z) => (y > 0.05 ? brickWall(x, y, z, 0, 0, 0) : strata(['#cfa77a', '#b98c5e', '#dcbc90', '#a97c50'], 80)(x, y, z)), 60);
  // Brick corridors and cells round the bath, colonnade bases, the lower town's walls and streets
  for (const sz of [-1, 1]) bricks(gp, BR, 0, top, bz + sz * (bd + 0.05), 2 * bw + 0.12, 0.028, 0.012, 0, 4, 10);
  for (const sx of [-1, 1]) bricks(gp, BR, sx * (bw + 0.07), top, bz, 0.012, 0.028, 2 * bd + 0.1, 0, 4, 8);
  for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) bricks(gp, '#c08050', -0.1 + i * 0.04, top + 0.002, bz + sz * (bd + 0.022), 0.014, 0.016, 0.014, 0, 2, 2);
  for (const [x, z, w, d] of [[0.25, -0.2, 0.012, 0.16], [0.3, -0.12, 0.1, 0.012], [0.3, -0.28, 0.1, 0.012], [0.18, -0.3, 0.1, 0.012], [-0.1, -0.3, 0.012, 0.12], [0.02, -0.3, 0.012, 0.12], [-0.04, -0.36, 0.13, 0.012]] as const) bricks(gp, BR, x, top, z, w, 0.03, d, 0, 4, 6);
  // Lower town: house walls along a street with a covered drain, and a round brick well
  const LT = 0.045;
  for (const [x, z, w, d] of [[-0.3, 0.2, 0.12, 0.012], [-0.3, 0.3, 0.12, 0.012], [-0.36, 0.25, 0.012, 0.1], [-0.24, 0.25, 0.012, 0.1], [-0.08, 0.22, 0.12, 0.012], [-0.14, 0.28, 0.012, 0.12], [-0.02, 0.28, 0.012, 0.12], [0.24, 0.2, 0.14, 0.012], [0.17, 0.27, 0.012, 0.14], [0.3, 0.32, 0.12, 0.012]] as const) bricks(gp, BR, x, gy(x, z) - 0.002, z, w, 0.03, d, 0, 4, 6);
  for (let i = 0; i < 12; i++) box(gp, '#a86a40', -0.42 + i * 0.07, LT + 0.002, 0.14, 0.06, 0.004, 0.012);
  const wx = 0.07, wz = 0.33, wy = gy(wx, wz);
  add(gp, g('ar:well', () => paintFaces(new THREE.CylinderGeometry(0.024, 0.024, 0.035, 14, 4, true), '#b9784a', (px, py, pz) => (hash3(Math.floor(py * 120), Math.floor(Math.atan2(pz, px) * 4), 1) > 0.5 ? '#a0623a' : null))), mat('#ffffff', { vc: true }), wx, wy + 0.0175, wz, 1, 1, 1);
  cyl(gp, '#2a1d14', wx, wy + 0.028, wz, 0.022, 0.003, 12);
  // The Buddhist stupa crowning the citadel mound
  const sx0 = -0.26, sz0 = -0.3, sy = gy(sx0, sz0);
  bricks(gp, BR, sx0, sy - 0.01, sz0, 0.12, 0.04, 0.12, 0, 5, 8);
  lathe(gp, [[0.0001, 0.03], [0.05, 0.03], [0.052, 0.05], [0.042, 0.075], [0.025, 0.09], [0.0001, 0.095]], '#b27448', sx0, sy, sz0, 12);
  // The unicorn seal, shown big on a stand at the front
  const ss = grp(gp, 0.22, gy(0.22, 0.06), 0.06, -0.45);
  box(ss, '#8b8b8b', 0, 0, 0, 0.11, 0.015, 0.05);
  const seal = grp(ss, 0, 0.015, 0.0, 0);
  seal.rotation.x = -0.35;
  rbox(seal, '#e6dcc4', 0, 0, 0, 0.1, 0.1, 0.018, 0.006);
  const uni = slab(seal, smooth([[-0.035, 0.0], [-0.03, 0.022], [0.0, 0.026], [0.02, 0.03], [0.03, 0.045], [0.038, 0.04], [0.032, 0.025], [0.026, 0.012], [0.024, -0.012], [0.018, -0.012], [0.016, 0.006], [-0.018, 0.006], [-0.022, -0.012], [-0.028, -0.012]]), 0.004, '#8a7a5a', 0, false);
  uni.position.set(0, 0.04, 0.01);
  rod(seal, [0.03, 0.084, 0.012], [0.05, 0.1, 0.012], 0.002, '#8a7a5a', 4);
  for (let i = 0; i < 5; i++) box(seal, '#8a7a5a', -0.036 + i * 0.016, 0.085, 0.01, i % 2 ? 0.003 : 0.008, 0.008, 0.003);
  box(seal, '#8a7a5a', 0.0, 0.024, 0.01, 0.015, 0.012, 0.003);
  // Archaeologists and visitors
  person(gp, -0.06, top - 0.045, bz + 0.01, 0.4, 'kneel', '#f59e0b', 1);
  person(gp, 0.15, top, bz - 0.12, -0.6, 'point', '#e5e7eb', 2, '#f5f5f4', '#4b5563');
  person(gp, 0.2, gy(0.2, 0.0), 0.0, 0.2, 'stand', '#22c55e', 0, null, '#1f2937');
  person(gp, -0.1, gy(-0.1, 0.36), 0.36, 2.6, 'bend', '#ef4444', 3);
  sieve(gp, -0.18, gy(-0.18, 0.37), 0.37, 0.2);
  tent(gp, 0.36, gy(0.36, 0.06), 0.06, -0.4, 0.1, 0.08, 0.06, '#f5f5f4');
  finds(gp, 0.36, gy(0.36, 0.06) + 0.004, 0.06, -0.4, [BR, '#e6dcc4', '#2a2a2a']);
  wheelbarrow(gp, -0.42, gy(-0.42, 0.12), 0.12, 0.6, '#2563eb', '#cfa77a');
  for (const [x, z] of [[0.42, -0.2], [0.38, 0.28], [-0.44, -0.04]] as const) tree(gp, x, gy(x, z), z, 0.05, '#7a9a3a');
};

// =========================================================================================================
// Lucy: the 3.2-million-year-old skeleton laid out on a gridded tarp among Ethiopia's striped badlands
// =========================================================================================================

const lucy: Builder = gp => {
  const SED = ['#e2d0ad', '#cfb088', '#b8946c', '#dcc39a', '#a98462', '#d5b88e', '#c4a47c'];
  const band = (y: number) => SED[Math.floor(y / 0.016 + 0.02) % SED.length];
  const h: H2 = (x, z) => {
    const d = Math.hypot(x * 1.1, z + 0.02);
    const hill = sstep(0.2, 0.4, d) * (0.06 + 0.16 * ridged(x * 4.5 + 1, z * 4.5) * sstep(0.2, -0.3, z) + 0.05 * ridged(x * 7, z * 7));
    const raw = 0.05 + hill + 0.003 * fbm(x * 20, 0, z * 20);
    const q = Math.floor(raw / 0.016) * 0.016;
    return q + (raw - q) * 0.35;
  };
  const gy = ground(gp, [{ h, c: (x, y, z) => (y < 0.058 ? mix('#c8a983', '#b99a74', fbm(x * 14, 0, z * 14)) : band(y)) }],
    (x, y, z) => SED[Math.floor(y * 60 + (fbm(x * 10, y * 3, z * 10) - 0.5)) % SED.length], 56);
  // Gridded tarp with Lucy's bones laid out (head to the left)
  const TY = gy(0, 0) + 0.001;
  box(gp, '#f3f1ea', 0.0, TY, 0.02, 0.46, 0.002, 0.22);
  strings(gp, -0.225, 0.225, -0.09, 0.13, TY + 0.004, 0.045, '#9ca3af');
  const B1 = '#8a5f38', B2 = '#a87a4a';
  const sk = grp(gp, 0.01, TY + 0.006, 0.02, 0, 1.3);
  const bone = (a: V3, b: V3, r: number, c = B1) => {
    rod(sk, a, b, r, c, 6);
    blob(sk, c, ...a, r * 1.7, r * 1.4, r * 1.7, 0, 0, 0, 6);
    blob(sk, c, ...b, r * 1.6, r * 1.3, r * 1.6, 0, 0, 0, 6);
  };
  const Y = 0, Z = 0;
  // Skull fragments and jaw
  blob(sk, B2, -0.145, Y, Z - 0.01, 0.02, 0.008, 0.016, 0.4, 0, 0, 8);
  blob(sk, B1, -0.15, Y, Z + 0.018, 0.012, 0.006, 0.01, 1.1, 0, 0, 7);
  blob(sk, B1, -0.128, Y, Z + 0.006, 0.009, 0.005, 0.008, 0.2, 0, 0, 7);
  sweep(sk, [{ p: [-0.1, Y, Z - 0.022], w: 0.0045 }, { p: [-0.118, Y, Z - 0.008], w: 0.005 }, { p: [-0.12, Y, Z + 0.004], w: 0.005 }, { p: [-0.1, Y, Z + 0.016], w: 0.0045 }], B2, { radial: 6, sub: 3 });
  // Spine and ribs (some missing — only 40% of Lucy was found)
  for (let i = 0; i < 9; i++) if (i !== 3 && i !== 6) blob(sk, B2, -0.075 + i * 0.012, Y, Z, 0.0055, 0.0045, 0.0065, 0, 0, 0, 6);
  for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) {
    if ((i + (sd > 0 ? 1 : 0)) % 3 === 2) continue;
    const x0 = -0.07 + i * 0.012;
    sweep(sk, [{ p: [x0, Y, Z + sd * 0.008], w: 0.0022 }, { p: [x0 + 0.006, Y, Z + sd * 0.03], w: 0.0024 }, { p: [x0 + 0.016, Y, Z + sd * 0.045], w: 0.0018 }], i % 2 ? B1 : B2, { radial: 5, sub: 2 });
  }
  // Arms
  bone([-0.07, Y, Z - 0.05], [-0.01, Y, Z - 0.062], 0.004);
  bone([-0.005, Y, Z - 0.064], [0.045, Y, Z - 0.07], 0.003, B2);
  bone([-0.068, Y, Z + 0.052], [-0.012, Y, Z + 0.064], 0.0038, B2);
  // Pelvis with sacrum
  blob(sk, B1, 0.04, Y, Z - 0.022, 0.018, 0.006, 0.014, 0.3, 0, 0, 8);
  blob(sk, B1, 0.04, Y, Z + 0.022, 0.018, 0.006, 0.014, -0.3, 0, 0, 8);
  blob(sk, B2, 0.035, Y, Z, 0.012, 0.006, 0.009, 0, 0, 0, 7);
  // Legs: left femur, tibia; right femur fragment; foot bones
  bone([0.06, Y, Z - 0.022], [0.125, Y, Z - 0.03], 0.0048);
  bone([0.13, Y, Z - 0.03], [0.175, Y, Z - 0.033], 0.0042, B2);
  bone([0.07, Y, Z + 0.024], [0.1, Y, Z + 0.03], 0.0045);
  for (let i = 0; i < 4; i++) box(sk, B1, 0.165 + (i % 2) * 0.008, Y - 0.002, Z + 0.02 + i * 0.006, 0.006, 0.003, 0.004, i);
  // Survey flags where pieces lay on the slope, kneeling researchers, a camp with tent and Land Rover
  for (let i = 0; i < 9; i++) {
    const x = -0.25 + hash3(i, 3, 3) * 0.5, z = -0.32 + hash3(i, 4, 3) * 0.16, y = gy(x, z);
    rod(gp, [x, y, z], [x, y + 0.03, z], 0.0009, '#4b5563', 3);
    box(gp, i % 2 ? '#f97316' : '#facc15', x + 0.005, y + 0.024, z, 0.01, 0.006, 0.001);
  }
  person(gp, -0.06, TY, -0.11, 0.1, 'kneel', '#e5d3a4', 2, '#e8dcb5', '#6b5a45');
  person(gp, 0.08, TY, 0.16, Math.PI - 0.2, 'kneel', '#7c9a5a', 0, '#d6c7a0', '#6b5a45');
  person(gp, 0.21, gy(0.21, 0.08), 0.08, -1.7, 'point', '#f5f0e6', 1, '#e8dcb5', '#4b5563');
  finds(gp, -0.28, gy(-0.28, 0.16), 0.16, 0.3, [B1, B2, '#e2d0ad']);
  bucket(gp, -0.23, gy(-0.23, 0.2), 0.2, '#dc2626');
  sieve(gp, 0.23, gy(0.23, -0.04), -0.04, 0.3);
  tent(gp, -0.26, gy(-0.26, 0.28), 0.28, 0.4, 0.12, 0.1, 0.065, '#e7c26a');
  // Cassette player blasting "Lucy in the Sky with Diamonds"
  const cx = -0.18, cz = 0.3, cy = gy(cx, cz);
  box(gp, '#9a7b55', cx, cy, cz, 0.03, 0.018, 0.022, 0.3);
  box(gp, '#1f2937', cx, cy + 0.018, cz, 0.026, 0.012, 0.01, 0.3);
  for (const [dx, dy] of [[0.0, 0.05], [0.016, 0.062]] as const) {
    blob(gp, '#1f2937', cx + dx, cy + dy, cz, 0.0035, 0.0028, 0.002, 0, 0, 0.3, 6);
    rod(gp, [cx + dx + 0.003, cy + dy, cz], [cx + dx + 0.003, cy + dy + 0.014, cz], 0.0009, '#1f2937', 3);
  }
  const rv = grp(gp, 0.25, gy(0.25, 0.26), 0.26, -0.7);
  rbox(rv, '#5b6b3a', 0, 0.012, 0, 0.11, 0.035, 0.05, 0.005);
  rbox(rv, '#5b6b3a', -0.016, 0.045, 0, 0.065, 0.028, 0.048, 0.005);
  box(rv, '#a5c4d4', 0.017, 0.05, 0, 0.002, 0.018, 0.04);
  rbox(rv, '#e8dcb5', -0.016, 0.073, 0, 0.07, 0.004, 0.052, 0.002);
  for (const [dx, dz] of [[-0.034, -0.026], [0.034, -0.026], [-0.034, 0.026], [0.034, 0.026]] as const) add(rv, CYLX(), mat('#1f2937'), dx, 0.011, dz, 0.022, 0.008, 0.022, 0, Math.PI / 2);
  const ac = (x: number, z: number, s: number) => { const y = gy(x, z); rod(gp, [x, y, z], [x + 0.005, y + 0.06 * s, z], 0.004 * s, '#5a4330', 4); blob(gp, '#7a9a3a', x + 0.005, y + 0.07 * s, z, 0.055 * s, 0.014 * s, 0.05 * s, 0, 0, 0, 8); };
  ac(0.38, -0.02, 1.1); ac(-0.38, 0.05, 0.9);
};

// =========================================================================================================
// Pakal's tomb: the Temple of the Inscriptions cut open to show the secret stair and crypt, plus the jade mask
// =========================================================================================================

/**
 * Pakal's funerary mask: a gently curved face plate (wide cheeks, square jaw) covered in small jade mosaic tiles with
 * dark gaps, shell-and-obsidian eyes, a raised nose ridge, slightly open mouth and ear spools. Faces local +z, ~1 tall.
 */
function jadeMask(p: THREE.Object3D, S: number): void {
  const q = grp(p, 0, 0, 0, 0, S);
  const JADE = ['#2f7d4f', '#3f9a5f', '#256b45', '#4caf74', '#1f5e3c', '#35865a', '#5bb07a', '#2a7448'];
  const W = 0.42, HH = 0.5;
  const prof: [number, number][] = [[-1, 0.46], [-0.82, 0.62], [-0.5, 0.82], [-0.1, 0.95], [0.3, 0.92], [0.7, 0.84], [1, 0.68]];
  const hw = (v: number) => {
    for (let i = 1; i < prof.length; i++) if (v <= prof[i][0]) { const [v0, w0] = prof[i - 1], [v1, w1] = prof[i]; return w0 + ((w1 - w0) * (v - v0)) / (v1 - v0); }
    return prof[prof.length - 1][1];
  };
  const eye = (u: number, v: number) => ((Math.abs(u) - 0.38) / 0.2) ** 2 + ((v - 0.2) / 0.075) ** 2 < 1;
  const mouth = (u: number, v: number) => (u / 0.27) ** 2 + ((v + 0.55) / 0.06) ** 2 < 1;
  const nose = (u: number, v: number) => 0.075 * Math.exp(-((u / 0.13) ** 2)) * sstep(0.32, -0.3, v) * sstep(-0.42, -0.3, v);
  const surf = (u: number, v: number) => 0.15 * (1 - 0.45 * u * u) * (1 - 0.1 * v * v) + nose(u, v)
    + 0.02 * Math.exp(-((Math.abs(u) - 0.5) ** 2 + (v + 0.12) ** 2) / 0.05) + 0.022 * Math.exp(-(((v - 0.36) / 0.07) ** 2)) * sstep(0.75, 0.6, Math.abs(u));
  const m = new Mesher(), back = new Mesher();
  const NU = 16, NV = 19, du = 2 / NU, dv = 2 / NV;
  const P = (u: number, v: number, dz: number): V3 => [u * W, v * HH, surf(u, v) + dz];
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const u = -1 + (i + 0.5) * du, v = -1 + (j + 0.5) * dv;
    if (Math.abs(u) > hw(v) + du * 0.2) continue;
    back.quad(P(u - du / 2, v - dv / 2, -0.003), P(u + du / 2, v - dv / 2, -0.003), P(u + du / 2, v + dv / 2, -0.003), P(u - du / 2, v + dv / 2, -0.003), '#0e2619', [0, 0, 1]);
    if (eye(u, v) || mouth(u, v) || Math.abs(u) > hw(v) - du * 0.3) continue;
    const h = hash3(i, j, 11), ju = (hash3(i, j, 12) - 0.5) * du * 0.1, jv = (hash3(i, j, 13) - 0.5) * dv * 0.1;
    const su = (du / 2) * (0.8 + 0.12 * h), sv = (dv / 2) * (0.8 + 0.12 * hash3(i, j, 14)), cu = u + ju, cv = v + jv;
    const brow = Math.abs(v - 0.36) < 0.06 && Math.abs(u) < 0.7, ridge = Math.abs(u) < 0.08 && v < 0.3 && v > -0.4;
    const c = brow ? '#1d5a39' : ridge ? '#4caf74' : JADE[Math.floor(hash3(i, j, 15) * JADE.length)];
    const cs: [number, number][] = [[cu - su, cv - sv], [cu + su, cv - sv], [cu + su, cv + sv], [cu - su, cv + sv]];
    const top = cs.map(([a, b]) => P(a, b, 0.014)), bot = cs.map(([a, b]) => P(a, b, -0.002));
    m.quad(top[0], top[1], top[2], top[3], c, [0, 0, 1]);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4, o: V3 = [((cs[k][0] + cs[k2][0]) / 2 - cu) * W, ((cs[k][1] + cs[k2][1]) / 2 - cv) * HH, 0];
      m.quad(top[k], top[k2], bot[k2], bot[k], shade(c, 0.8), o);
    }
  }
  m.build(q, { rough: 0.35, flat: true });
  back.build(q, { rough: 0.8, flat: true });
  // Shell eye inserts with obsidian pupils, nostrils, open mouth with a shell tooth, jade ear spools
  for (const sx of [-1, 1]) {
    const ez = surf(sx * 0.38, 0.2);
    blob(q, '#f3efe2', sx * 0.38 * W, 0.2 * HH, ez + 0.002, 0.085, 0.034, 0.012, 0, 0, sx * -0.12, 10);
    blob(q, '#0d0d0d', sx * 0.35 * W, 0.19 * HH, ez + 0.012, 0.028, 0.028, 0.007, 0, 0, 0, 8);
    blob(q, '#0e2619', sx * 0.045, -0.4 * HH, surf(sx * 0.1, -0.4) + 0.012, 0.014, 0.008, 0.006, 0, 0, 0, 6);
    const e = add(q, CYLX(), mat('#2f7d4f'), sx * (0.95 * W + 0.04), 0.04 * HH, 0.03, 0.13, 0.04, 0.13, Math.PI / 2, 0, 0);
    e.castShadow = true;
    add(q, CYLX(), mat('#e8e2d0'), sx * (0.95 * W + 0.04), 0.04 * HH, 0.052, 0.06, 0.008, 0.06, Math.PI / 2, 0, 0);
  }
  const mz = surf(0, -0.55);
  blob(q, '#2a0f0c', 0, -0.55 * HH, mz - 0.004, 0.115, 0.03, 0.012, 0, 0, 0, 8);
  box(q, '#f3efe2', 0, -0.55 * HH + 0.006, mz + 0.002, 0.03, 0.012, 0.006);
}

const pakal: Builder = gp => {
  const LIME = '#cfc6b0', GR = '#5f9a45';
  const pz = -0.16, nT = 9, TH = 0.024, base = 0.05;
  const gy = ground(gp, [
    { h: (x, z) => base + 0.006 * fbm(x * 12, 0, z * 12), c: (x, _y, z) => (Math.abs(x) < 0.08 && z > -0.02 && z < 0.4 ? mix('#cbbf9f', '#bcb08f', fbm(x * 30, 0, z * 30)) : mix(GR, '#4a8a3a', fbm(x * 10, 1, z * 10))) },
  ], strata(['#6b4f35', '#8a6a48', '#c8b89a', '#5a4430'], 70), 52);
  // Nine stepped terraces, front-left quarter cut away like a model to reveal the hidden stair and crypt
  const CX = -0.07, CZ = pz + 0.02;
  for (let t = 0; t < nT; t++) {
    const w = 0.24 - t * 0.018, d = 0.17 - t * 0.012, y = base + t * TH, c = t % 2 ? LIME : '#c4bba4';
    rbox(gp, c, (CX + w) / 2, y, pz, w - CX, TH, 2 * d, 0.003);
    rbox(gp, c, (-w + CX) / 2, y, (pz - d + CZ) / 2, CX + w, TH, CZ - (pz - d), 0.003);
    if (t < nT - 1) box(gp, '#a39a84', (CX + w) / 2, y + TH - 0.004, pz + d + 0.0015, w - CX, 0.004, 0.003);
  }
  // Front staircase
  const topY = base + nT * TH, stF = pz + 0.17, stB = pz + 0.17 - nT * 0.012;
  for (let i = 0; i < 18; i++) {
    const t = i / 18, y = base + t * nT * TH, zz = stF + 0.012 - t * (stF - stB + 0.012);
    box(gp, '#ddd5c2', 0.0, y, zz, 0.075, (nT * TH) / 18, 0.016);
  }
  for (const sx of [-1, 1]) rod(gp, [sx * 0.04, base, stF + 0.012], [sx * 0.04, topY, stB], 0.006, '#bdb39a', 4);
  // Temple on top: five doorways, carved piers, mansard roof
  const ty = topY, tz = pz - 0.01;
  box(gp, '#d8d0bc', 0, ty, tz, 0.2, 0.006, 0.12);
  for (let i = 0; i < 6; i++) bricks(gp, '#d6cdb6', -0.088 + i * 0.0352, ty + 0.006, tz + 0.045, 0.016, 0.045, 0.016, 0, 3, 2);
  for (let i = 0; i < 5; i++) box(gp, '#1d1a16', -0.07 + i * 0.0352, ty + 0.006, tz + 0.035, 0.019, 0.04, 0.004);
  box(gp, '#c9c0aa', 0, ty + 0.006, tz - 0.02, 0.19, 0.045, 0.06);
  const roof = add(gp, g('ar:mansard', () => new THREE.CylinderGeometry(0.5 * 0.62, 0.5, 1, 4, 1).rotateY(Math.PI / 4)), mat('#bdb39c'), 0, ty + 0.051 + 0.0175, tz + 0.005, 0.27, 0.035, 0.16);
  roof.castShadow = true;
  box(gp, '#a8a08a', 0, ty + 0.086, tz + 0.005, 0.15, 0.006, 0.05);
  // Inside the cut: hidden stairway zig-zagging down to the crypt and its carved sarcophagus lid
  const crY = base, crX = CX - 0.07, crZ = CZ + 0.06;
  box(gp, '#6b5b4b', crX, crY, crZ, 0.13, 0.002, 0.11);
  for (const [x, z, w, d] of [[crX, crZ - 0.055, 0.13, 0.008], [crX - 0.065, crZ, 0.008, 0.11]] as const) bricks(gp, '#8a7a66', x, crY, z, w, 0.07, d, 0, 4, 4);
  box(gp, '#2a3a2a', crX, crY + 0.002, crZ, 0.09, 0.035, 0.055);
  const lid = rbox(gp, '#d9cfb6', crX, crY + 0.037, crZ, 0.1, 0.008, 0.06, 0.002);
  lid.rotation.y = 0.05;
  for (let i = 0; i < 12; i++) blob(gp, '#a39878', crX - 0.04 + (i % 4) * 0.026, crY + 0.045, crZ - 0.02 + Math.floor(i / 4) * 0.02, 0.008, 0.0015, 0.004, i, 0, 0, 6);
  for (let i = 0; i < 14; i++) {
    const t = i / 14, y = crY + 0.035 + t * (topY - crY - 0.035), zz = crZ - 0.03 - t * 0.09;
    box(gp, '#b7ab92', CX - 0.012, y, zz, 0.022, (topY - crY) / 14, 0.012);
  }
  person(gp, crX + 0.03, crY + 0.002, crZ + 0.04, -2.4, 'point', '#f5f0e6', 2, '#e8dcb5', '#4b5563');
  blob(gp, '#ffd36b', crX - 0.05, crY + 0.06, crZ - 0.04, 0.004).material = glow('#ffd36b');
  // Replica of the open sarcophagus at the front: red cinnabar-lined box, carved lid slid aside, the jade mask
  // propped at the head end with a jade bead collar below it
  const mx = -0.22, mz = 0.22, my = gy(mx, mz);
  const sc = grp(gp, mx, my, mz, -0.6);
  rbox(sc, '#8f887a', 0, 0, 0, 0.11, 0.008, 0.16, 0.002);
  const SL = '#b7ad96', SW = 0.07, SD = 0.12, SH = 0.032;
  box(sc, '#a8312a', 0, 0.008, 0, SW - 0.01, 0.018, SD - 0.01);
  for (const sx of [-1, 1]) box(sc, SL, sx * (SW / 2 - 0.003), 0.008, 0, 0.006, SH, SD);
  for (const sz of [-1, 1]) box(sc, SL, 0, 0.008, sz * (SD / 2 - 0.003), SW, SH, 0.006);
  for (let i = 0; i < 4; i++) box(sc, '#958b74', 0, 0.014 + i * 0.006, SD / 2 + 0.0002, SW - 0.012, 0.0015, 0.001);
  const lg = grp(sc, SW / 2 + 0.034, 0.02, 0);
  lg.rotation.z = -0.42;
  rbox(lg, '#c9bea3', 0, -0.003, 0, 0.06, 0.006, SD + 0.01, 0.002);
  for (let i = 0; i < 5; i++) box(lg, '#a39878', 0, 0.003, -0.04 + i * 0.02, 0.042, 0.0012, 0.004);
  const mk = grp(sc, 0, 0.032, -0.022, 0);
  mk.rotation.x = -0.95;
  jadeMask(mk, 0.072);
  for (let i = 0; i < 9; i++) {
    const a = -1.0 + (i / 8) * 2.0;
    blob(sc, i % 2 ? '#3f9a5f' : '#2a7448', Math.sin(a) * 0.022, 0.028 + Math.cos(a) * 0.002, 0.012 + Math.cos(a) * 0.012, 0.004, 0.004, 0.004, 0, 0, 0, 6);
  }
  person(gp, mx + 0.09, my, mz + 0.05, -2.0, 'point', '#f5f0e6', 1, '#e8dcb5', '#4b5563');
  person(gp, 0.12, gy(0.12, 0.3), 0.3, Math.PI - 0.3, 'stand', '#ef4444', 0, null, '#1f2937');
  person(gp, 0.06, gy(0.06, 0.34), 0.34, Math.PI + 0.2, 'stand', '#3b82f6', 2, '#f5f5f4', '#1f2937');
  // Rainforest round the back and sides
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * 1.1 + hash3(i, 1, 5) * Math.PI * 1.2 - 0.1, r = 0.36 + hash3(i, 2, 5) * 0.11, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.95;
    if (z > 0.15) continue;
    tree(gp, x, gy(x, z) - 0.004, z, 0.055 + hash3(i, 3, 5) * 0.035, ['#2f6b35', '#3f7d3a', '#4f8a3c'][i % 3]);
  }
  for (const [x, z] of [[0.38, 0.2], [0.42, 0.06], [-0.4, 0.12]] as const) tree(gp, x, gy(x, z), z, 0.06, '#3f7d3a');
};

// =========================================================================================================
// Vasa: the 1628 warship rising from Stockholm harbour in 1961, slung between salvage pontoons
// =========================================================================================================

const vasa: Builder = gp => {
  const WY = 0.06;
  ground(gp, [
    { h: () => WY, c: (x, _y, z) => (Math.sin(x * 70 + Math.sin(z * 22) * 2.2) * Math.sin(z * 55 + x * 8) > 0.8 ? '#6fa9cc' : mix('#2d6b93', '#3a7ea6', fbm(x * 6, 0, z * 6))) },
    { in: (_x, z) => z < -0.33, h: () => 0.095, c: (x, _y, z) => ((Math.floor(x * 55) + Math.floor(z * 55)) % 2 ? '#a19b8e' : '#aea89a') },
  ], (x, y, z) => (z < -0.3 && y > WY - 0.002 ? (hash3(Math.floor(x * 80), Math.floor(y * 130), 2) > 0.5 ? '#77716a' : '#86807a')
    : y > 0.032 ? (y > 0.048 ? '#2f6f97' : '#245a7d') : y > 0.02 ? '#1d4560' : strata(['#4a4238', '#5b5244', '#3e372f'], 120)(x, y, z)), 40);
  // Hull: dark oak planking with a red upper strake, tall stern castle at -x, beakhead at +x
  const hull = grp(gp, -0.01, 0, 0.0, 0);
  hull.rotation.z = 0.035;
  const X0 = -0.25, X1 = 0.24, YK = 0.03, B = 0.072;
  const deck = (x: number) => 0.165 + 0.055 * sstep(-0.1, -0.23, x) + 0.015 * sstep(0.08, 0.22, x);
  const beam = (x: number) => {
    const t = (x - X0) / (X1 - X0);
    return B * Math.pow(Math.min(1, 0.62 + t * 1.6), 0.5) * Math.sqrt(Math.max(0.002, 1 - Math.max(0, (t - 0.5) / 0.5) ** 2));
  };
  const keel = (x: number) => YK + 0.06 * sstep(0.75, 1, (x - X0) / (X1 - X0));
  const wf = (u: number) => Math.sqrt(1 - (1 - u) ** 2.4) * (1 - 0.16 * Math.max(0, u - 0.55) / 0.45);
  const NS = 9, NR = 40, rings: V3[][] = [];
  for (let i = 0; i <= NR; i++) {
    const x = X0 + ((X1 - X0) * i) / NR, b = Math.max(0.003, beam(x)), yk = keel(x), yd = deck(x);
    const r: V3[] = [];
    for (let k = 0; k <= NS; k++) { const u = 1 - k / NS; r.push([x, yk + (yd - yk) * u, b * wf(u)]); }
    for (let k = NS - 1; k >= 0; k--) { const u = 1 - k / NS; r.push([x, yk + (yd - yk) * u, -b * wf(u)]); }
    rings.push(r);
  }
  skin(hull, rings, '#4a3320', {
    flat: true, caps: true,
    paint: (px, py, _pz, _nx, ny) => (ny > 0.75 ? (Math.floor(px * 160) % 2 ? '#7a5a38' : '#6e5032') : py > deck(px) - 0.012 ? '#8e2a1f' : Math.floor(py * 170) % 3 === 0 ? '#3a2616' : '#4f3721'),
  });
  // Two rows of gunports with open red lids on the side facing the viewer
  const zAt = (x: number, y: number) => { const yk = keel(x), yd = deck(x); return Math.max(0.003, beam(x)) * wf((y - yk) / (yd - yk)); };
  for (const [y0, n, xa, xb] of [[0.112, 12, -0.19, 0.16], [0.142, 11, -0.17, 0.14]] as const) for (let i = 0; i < n; i++) {
    const x = xa + ((xb - xa) * i) / (n - 1), zs = zAt(x, y0);
    for (const sd of [1, -1]) {
      box(hull, '#120c08', x, y0 - 0.006, sd * (zs + 0.0005), 0.011, 0.011, 0.004);
      const lid = box(hull, '#a3271c', x, y0 + 0.004, sd * (zs + 0.006), 0.012, 0.0115, 0.002);
      lid.rotation.x = sd * -0.9;
    }
  }
  // Stern: carved transom painted red and gold, crowned with a gilded crest; quarter galleries
  const sy = deck(X0);
  const st = grp(hull, X0 - 0.003, 0, 0, 0);
  box(st, '#7d2219', 0, 0.09, 0, 0.008, sy - 0.09 + 0.02, 0.1);
  for (let i = 0; i < 5; i++) box(st, GOLD, -0.0045, 0.09, -0.04 + i * 0.02, 0.002, sy - 0.09 + 0.02, 0.004);
  for (const yy of [0.13, 0.17]) for (let i = 0; i < 4; i++) box(st, '#1a1410', -0.0045, yy, -0.03 + i * 0.02, 0.002, 0.014, 0.01);
  blob(st, GOLD, 0, sy + 0.028, 0, 0.012, 0.016, 0.03, 0, 0, 0, 8, { metal: 0.6, rough: 0.35 });
  for (const sd of [-1, 1]) blob(st, GOLD, 0, sy + 0.016, sd * 0.04, 0.008, 0.012, 0.008, 0, 0, 0, 7, { metal: 0.6, rough: 0.35 });
  for (const sd of [-1, 1]) {
    const qx = X0 + 0.03, qz = sd * (zAt(qx, 0.17) + 0.004);
    rbox(hull, '#7d2219', qx, 0.15, qz, 0.04, 0.05, 0.012, 0.003);
    box(hull, GOLD, qx, 0.2, qz, 0.044, 0.006, 0.014);
    for (let i = 0; i < 2; i++) box(hull, '#1a1410', qx - 0.01 + i * 0.02, 0.17, qz + sd * 0.006, 0.01, 0.014, 0.002);
    blob(hull, GOLD, qx, 0.148, qz, 0.016, 0.006, 0.008, 0, 0, 0, 7, { metal: 0.6, rough: 0.35 });
  }
  // Mast stumps, bowsprit, beakhead with the golden lion figurehead
  for (const [x, h] of [[-0.12, 0.08], [0.0, 0.11], [0.13, 0.07]] as const) {
    cyl(hull, '#3a2818', x, deck(x), 0, 0.007, h, 8);
    box(hull, '#2a1c10', x, deck(x) + h - 0.004, 0, 0.022, 0.004, 0.022);
  }
  const bd = deck(X1);
  rod(hull, [X1 - 0.03, bd, 0], [X1 + 0.1, bd + 0.06, 0], 0.005, '#3a2818', 6);
  box(hull, '#4a3320', X1 + 0.012, bd - 0.03, 0, 0.04, 0.012, 0.016, 0, 0, 0.3);
  const lion = grp(hull, X1 + 0.035, bd - 0.02, 0, 0);
  lion.rotation.z = 0.55;
  const LG = { metal: 0.6, rough: 0.35 };
  blob(lion, GOLD, 0, 0, 0, 0.026, 0.01, 0.01, 0, 0, 0, 8, LG);
  blob(lion, GOLD, 0.028, 0.004, 0, 0.012, 0.012, 0.012, 0, 0, 0, 8, LG);
  blob(lion, '#b8862a', 0.024, 0.004, 0, 0.009, 0.016, 0.016, 0, 0, 0, 7, LG);
  for (const sd of [-1, 1]) rod(lion, [0.01, -0.004, sd * 0.006], [0.03, -0.016, sd * 0.008], 0.0035, GOLD, 5);
  // Salvage pontoons with lifting cables under the hull, a crane and divers
  const pont = (z: number, r: number, y: number) => {
    add(gp, CYLX(), mat('#5c6670'), 0, y, z, r * 2, 0.5, r * 2, 0, 0, Math.PI / 2);
    box(gp, '#7b858e', 0, y + r - 0.002, z, 0.46, 0.006, r * 1.4);
    for (let i = 0; i < 5; i++) {
      const x = -0.18 + i * 0.09;
      rod(gp, [x, y + r + 0.004, z], [x, WY + 0.004, z * 0.55], 0.0016, '#2b2b2b', 4);
      cyl(gp, '#3b4248', x, y + r + 0.004, z, 0.006, 0.008, 8);
    }
  };
  pont(-0.17, 0.03, WY + 0.012);
  pont(0.15, 0.02, WY + 0.004);
  const cx0 = 0.12, cz0 = -0.19, cy0 = WY + 0.048;
  box(gp, '#f2c230', cx0, cy0, cz0, 0.04, 0.025, 0.035);
  rod(gp, [cx0, cy0 + 0.025, cz0], [cx0 - 0.04, cy0 + 0.2, cz0 + 0.12], 0.004, '#f2c230', 4);
  rod(gp, [cx0 + 0.01, cy0 + 0.025, cz0], [cx0 - 0.03, cy0 + 0.2, cz0 + 0.12], 0.002, '#d9a816', 4);
  rod(gp, [cx0 - 0.04, cy0 + 0.2, cz0 + 0.12], [cx0 - 0.04, 0.24, cz0 + 0.12], 0.001, '#222', 3);
  rod(gp, [cx0 - 0.04, cy0 + 0.2, cz0 + 0.12], [cx0 + 0.015, cy0 + 0.025, cz0 - 0.01], 0.001, '#222', 3);
  const diver = (x: number, y: number, z: number, ry: number) => {
    person(gp, x, y, z, ry, 'stand', '#9aa3ab', 0, null, '#9aa3ab');
    blob(gp, '#c8913f', x, y + 0.06, z, 0.0095, 0.0095, 0.0095, 0, 0, 0, 10, { metal: 0.7, rough: 0.3 });
    blob(gp, '#2a3a44', x + Math.sin(ry) * 0.008, y + 0.06, z + Math.cos(ry) * 0.008, 0.004, 0.004, 0.002, ry, 0, 0, 6);
  };
  diver(-0.12, WY + 0.026, 0.15, -0.6);
  person(gp, -0.06, WY + 0.026, 0.155, -0.4, 'point', '#f97316', 2, '#f5f5f4', '#1f2937');
  rod(gp, [-0.11, WY + 0.03, 0.16], [-0.2, WY, 0.26], 0.0014, '#e8b830', 4);
  blob(gp, '#c8913f', -0.2, WY + 0.002, 0.26, 0.009, 0.009, 0.009, 0, 0, 0, 10, { metal: 0.7, rough: 0.3 });
  for (let i = 0; i < 5; i++) blob(gp, '#e8f4fa', -0.215 + hash3(i, 1, 9) * 0.03, WY + 0.001, 0.25 + hash3(i, 2, 9) * 0.03, 0.004, 0.0015, 0.004, 0, 0, 0, 6);
  person(gp, 0.08, WY + 0.04, -0.17, 0.3, 'stand', '#1e40af', 1, '#f5f5f4', '#1f2937');
  // Tug pushing alongside, a rowing boat with onlookers
  const tug = grp(gp, 0.25, WY, 0.22, 2.5);
  skin(tug, [-0.06, -0.03, 0.02, 0.05, 0.065].map((x, i) => { const w = [0.018, 0.024, 0.024, 0.016, 0.002][i]; return [[x, 0.022, w], [x, -0.004, w * 0.7], [x, -0.004, -w * 0.7], [x, 0.022, -w]] as V3[]; }), '#222222', { caps: true, flat: true, paint: (_x, py) => (py < 0.004 ? '#9b2a1e' : null) });
  rbox(tug, '#f2f0ea', -0.01, 0.022, 0, 0.045, 0.022, 0.03, 0.003);
  box(tug, '#1f2937', 0.005, 0.034, 0, 0.002, 0.006, 0.026);
  cyl(tug, '#1f1f1f', -0.02, 0.044, 0, 0.007, 0.022, 8);
  cyl(tug, '#e0b020', -0.02, 0.058, 0, 0.0072, 0.004, 8);
  for (let i = 0; i < 5; i++) blob(gp, '#e8f4fa', 0.29 + i * 0.012, WY + 0.001, 0.245 + i * 0.006, 0.008 - i * 0.001, 0.0015, 0.005, -0.6, 0, 0, 6);
  const rb = grp(gp, -0.3, WY, 0.12, 0.9);
  skin(rb, [-0.04, -0.015, 0.015, 0.04].map((x, i) => { const w = [0.006, 0.014, 0.014, 0.002][i]; return [[x, 0.01, w], [x, -0.002, 0], [x, 0.01, -w]] as V3[]; }), '#c46b3c', { caps: true, flat: true });
  person(rb, -0.012, 0.0, 0, Math.PI / 2, 'kneel', '#facc15', 1, null, '#1f2937', 0.9);
  person(rb, 0.016, 0.0, 0, Math.PI / 2, 'kneel', '#ef4444', 3, '#1f2937', '#1f2937', 0.9);
  // The old-town quay behind: tall merchant houses, onlookers and a Swedish flag
  const cols = ['#d9a441', '#b5523b', '#e3c27a', '#c97b4a', '#e8d9b0', '#9c4a32', '#d4b06a'];
  for (let i = 0; i < 7; i++) {
    const x = -0.3 + i * 0.1 + (i === 3 ? 0.0 : 0), w = 0.085, h = 0.09 + hash3(i, 5, 5) * 0.05, z = -0.43 + Math.abs(x) * 0.08;
    if (Math.hypot(x, z) > 0.47) continue;
    bricks(gp, cols[i], x, 0.095, z, w, h, 0.06, 0, 4, 3);
    gable(gp, w, 0.035, 0.064, '#5a3a2e', x, 0.095 + h, z);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box(gp, '#2a3340', x - 0.025 + c * 0.025, 0.11 + r * 0.03, z + 0.031, 0.01, 0.014, 0.002);
  }
  for (let i = 0; i < 6; i++) person(gp, -0.22 + i * 0.075, 0.095, -0.35 + hash3(i, 2, 2) * 0.012, hash3(i, 3, 2) - 0.5, i % 3 ? 'stand' : 'point', ['#ef4444', '#3b82f6', '#f5f5f4', '#22c55e', '#a855f7', '#f59e0b'][i], i, i % 2 ? null : '#1f2937', '#1f2937');
  const fx = 0.36, fz = -0.33;
  rod(gp, [fx, 0.095, fz], [fx, 0.21, fz], 0.0016, '#e5e7eb', 4);
  box(gp, '#1e5aa8', fx + 0.022, 0.18, fz, 0.044, 0.028, 0.002);
  box(gp, '#f2c230', fx + 0.016, 0.18, fz, 0.006, 0.028, 0.0025);
  box(gp, '#f2c230', fx + 0.022, 0.191, fz, 0.044, 0.006, 0.0025);
};

// =========================================================================================================
// Skara Brae: Stone Age houses sunk into a grassy Orkney dune, with stone dressers, box beds and hearths
// =========================================================================================================

const skarabrae: Builder = gp => {
  const G0 = 0.125, FL = 0.07;
  const se = (cx: number, cz: number, rx: number, rz: number) => (x: number, z: number) => ((x - cx) / rx) ** 4 + ((z - cz) / rz) ** 4 < 1;
  const H: [number, number, number, number][] = [[-0.05, 0.08, 0.14, 0.115], [0.21, -0.05, 0.085, 0.075], [-0.27, -0.08, 0.08, 0.07], [-0.01, -0.22, 0.08, 0.07], [0.22, -0.26, 0.07, 0.06]];
  const cap = (x: number, z: number) => {
    let m = 0;
    for (const [cx, cz, rx, rz] of H) { const v = Math.sqrt(Math.sqrt(((x - cx) / rx) ** 4 + ((z - cz) / rz) ** 4)); m = Math.max(m, sstep(1.55, 1.08, v)); }
    return m;
  };
  const turf: H2 = (x, z) => G0 + 0.01 * fbm(x * 9, 0, z * 9) - 0.07 * sstep(0.22, 0.36, z) + 0.022 * cap(x, z) * sstep(0.3, 0.2, z);
  const lv: Lvl[] = [
    { h: turf, c: (x, y, z) => (y < 0.07 ? mix('#e3cf9e', '#d6c08c', fbm(x * 20, 0, z * 20)) : mix('#5f9a3c', '#77ad48', fbm(x * 11, 2, z * 11))) },
    { in: (_x, z) => z > 0.38, h: (x, z) => 0.03 + 0.002 * Math.sin(x * 60 + z * 20), c: (x, _y, z) => (z < 0.405 ? '#eef6f8' : Math.sin(x * 50 + z * 30) > 0.85 ? '#7fb8cf' : mix('#3f86a8', '#4d97b8', fbm(x * 7, 3, z * 7))) },
    { in: rect(-0.26, 0.24, -0.15, -0.115), h: () => FL + 0.012, c: (x, _y, z) => ((Math.floor(x * 70) + Math.floor(z * 40)) % 2 ? '#a69c86' : '#b5ab94') },
    { in: rect(-0.035, 0.015, -0.16, 0.0), h: () => FL + 0.012, c: (x, _y, z) => ((Math.floor(x * 40) + Math.floor(z * 70)) % 2 ? '#a69c86' : '#b5ab94') },
    { in: rect(0.17, 0.205, -0.2, -0.13), h: () => FL + 0.012, c: () => '#aaa08a' },
    { in: rect(-0.42, -0.26, -0.135, -0.115), h: () => FL + 0.016, c: () => '#aaa08a' },
  ];
  for (const [cx, cz, rx, rz] of H) lv.push({ in: se(cx, cz, rx, rz), h: () => FL, c: (x, _y, z) => (hash3(Math.floor(x * 120), 4, Math.floor(z * 120)) > 0.85 ? '#a8987a' : mix('#c4b28c', '#b8a47e', fbm(x * 25, 4, z * 25))) });
  const STONE = ['#8d8577', '#a39a88', '#7a7366', '#b0a690', '#6e675c', '#9a9282'];
  const dry = (x: number, y: number, z: number) => {
    const r = Math.floor(y * 260), k = Math.floor((x + z) * 45 + (r % 2) * 0.5);
    return hash3(r, k, 3) > 0.9 ? '#4f4a42' : STONE[Math.floor(hash3(r, k, 7) * STONE.length)];
  };
  const dune = strata(['#d8c79a', '#cbb78a', '#e3d4a8', '#8a7a5a', '#cdb98e'], 90);
  const gy = ground(gp, lv, (x, y, z) => (Math.hypot(x, z) > 0.46 || z > 0.3 ? (y < 0.03 ? '#2a5e7a' : dune(x, y, z)) : y > FL - 0.002 ? dry(x, y, z) : dune(x, y, z)), 64, 0.5, 16);
  // House 1 (front): stone dresser, two box beds, square hearth, limpet tanks, entrance
  const [hx, hz] = H[0];
  const S = '#8a8274', S2 = '#9d9483';
  const dz = hz - 0.09;
  for (const dx of [-0.045, 0, 0.045]) box(gp, S, hx + dx, FL, dz, 0.01, 0.06, 0.026);
  for (const yy of [0.02, 0.04, 0.06]) rbox(gp, S2, hx, FL + yy, dz, 0.105, 0.006, 0.03, 0.001);
  for (const [px, c] of [[-0.02, '#9a6a3a'], [0.018, '#7a5a3a'], [-0.01, '#b08a5a']] as const) lathe(gp, [[0.0001, 0], [0.005, 0], [0.006, 0.008], [0.004, 0.011], [0.0001, 0.011]], c, hx + px, FL + 0.026 + (px > 0 ? 0.02 : 0), dz, 8);
  for (const sd of [-1, 1]) {
    const bx = hx + sd * 0.1, bz = hz + 0.005;
    box(gp, S2, bx - sd * 0.024, FL, bz, 0.005, 0.026, 0.09);
    for (const ez of [-0.045, 0.045]) box(gp, S, bx, FL, bz + ez, 0.05, 0.036, 0.006);
    box(gp, '#a39070', bx, FL + 0.002, bz, 0.042, 0.01, 0.084);
    blob(gp, '#c9b48a', bx, FL + 0.012, bz - 0.02, 0.012, 0.004, 0.02, 0, 0, 0, 6);
  }
  for (const [ox, oz] of [[-0.02, 0], [0.02, 0], [0, -0.02], [0, 0.02]] as const) box(gp, S, hx + ox, FL, hz + 0.01 + oz, ox ? 0.004 : 0.044, 0.008, oz ? 0.004 : 0.044);
  box(gp, '#3c342c', hx, FL, hz + 0.01, 0.036, 0.003, 0.036);
  for (let i = 0; i < 4; i++) blob(gp, '#5a4a3a', hx - 0.01 + (i % 2) * 0.02, FL + 0.004, hz + 0.004 + Math.floor(i / 2) * 0.012, 0.005, 0.002, 0.004, i, 0, 0, 6);
  for (const tx of [-0.04, 0.035]) {
    const tz = hz + 0.065;
    for (const [ox, oz, w, d] of [[0, -0.008, 0.02, 0.003], [0, 0.008, 0.02, 0.003], [-0.0085, 0, 0.003, 0.016], [0.0085, 0, 0.003, 0.016]] as const) box(gp, S, hx + tx + ox, FL, tz + oz, w, 0.01, d);
    box(gp, '#6d8f9a', hx + tx, FL + 0.006, tz, 0.014, 0.001, 0.013);
  }
  // Furniture glimpses in the other houses; a glass roof over house 2 like the replica cover
  for (const [cx, cz] of H.slice(1)) {
    box(gp, S, cx, FL, cz - 0.05, 0.06, 0.03, 0.016);
    for (const ox of [-0.012, 0.012]) box(gp, S, cx + ox, FL, cz + 0.005, 0.004, 0.007, 0.03);
    box(gp, '#3c342c', cx, FL, cz + 0.005, 0.02, 0.003, 0.026);
  }
  const [gx, gz, grx, grz] = H[1];
  add(gp, BOX(), mat('#d6eef6', { transparent: 0.32, rough: 0.1 }), gx, G0 + 0.03, gz, grx * 2 + 0.02, 0.004, grz * 2 + 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(gp, [gx + sx * grx, FL, gz + sz * grz], [gx + sx * grx, G0 + 0.028, gz + sz * grz], 0.0018, '#4b5563', 4);
  for (let i = -1; i <= 1; i++) box(gp, '#4b5563', gx + i * grx * 0.66, G0 + 0.032, gz, 0.002, 0.002, grz * 2 + 0.02);
  // Flagstone path and visitors on the turf, Skaill House behind, rocks on the beach
  for (let i = 0; i < 9; i++) {
    const x = -0.36 + i * 0.012, z = 0.05 + i * 0.035;
    rbox(gp, '#9a968c', x, gy(x, z) - 0.002, z, 0.03, 0.004, 0.022, 0.002, 0.3 * hash3(i, 1, 1));
  }
  person(gp, -0.35, gy(-0.35, 0.12), 0.12, -0.3, 'point', '#ef4444', 0, null, '#1f2937');
  person(gp, -0.31, gy(-0.31, 0.2), 0.2, -0.9, 'stand', '#facc15', 2, null, '#1f2937');
  person(gp, 0.12, gy(0.12, 0.1), 0.1, -2.4, 'stand', '#3b82f6', 1, '#1f2937', '#374151');
  box(gp, '#1f2937', 0.12, gy(0.12, 0.1) + 0.035, 0.094, 0.01, 0.014, 0.006);
  person(gp, 0.02, FL + 0.012, -0.08, Math.PI, 'kneel', '#16a34a', 3, '#e8dcb5', '#4b5563');
  person(gp, -0.2, gy(-0.2, -0.28), -0.28, 0.6, 'point', '#f5f0e6', 2, '#e8dcb5', '#4b5563');
  bucket(gp, -0.17, gy(-0.17, -0.27), -0.27, '#dc2626');
  const shx = 0.05, shz = -0.4, shy = gy(shx, shz);
  bricks(gp, '#9c968a', shx, shy - 0.004, shz, 0.16, 0.06, 0.05, 0, 4, 8);
  gable(gp, 0.16, 0.035, 0.054, '#5f6670', shx, shy + 0.056, shz);
  for (const ex of [-0.08, 0.08]) { bricks(gp, '#9c968a', shx + ex, shy + 0.056, shz, 0.012, 0.05, 0.04, 0, 3, 1); }
  for (let i = 0; i < 5; i++) box(gp, '#2a3340', shx - 0.06 + i * 0.03, shy + 0.03, shz + 0.026, 0.01, 0.014, 0.002);
  for (let i = 0; i < 8; i++) {
    const x = -0.3 + hash3(i, 1, 6) * 0.6, z = 0.36 + hash3(i, 2, 6) * 0.05;
    blob(gp, i % 2 ? '#6e675c' : '#585249', x, gy(x, z), z, 0.012 + hash3(i, 3, 6) * 0.01, 0.007, 0.01, i, 0, 0, 6);
  }
};

// =========================================================================================================
// Troy: the Hisarlik mound sliced by Schliemann's great trench, showing nine cities stacked as coloured
// layers, with Troy VI's sloping walls and the giant wooden horse replica
// =========================================================================================================

const troy: Builder = gp => {
  const B0 = 0.05, TOP = 0.215, TW = 0.085;
  const LAY = ['#9a8468', '#c98c58', '#5e3a2c', '#e6c48c', '#a8806a', '#f2dfb2', '#7a4a3a', '#d9a86a', '#efe0bc'];
  const mound: H2 = (x, z) => B0 + (TOP - B0) * sstep(0.44, 0.17, Math.hypot(x * 1.05, z + 0.03)) + 0.004 * fbm(x * 15, 0, z * 15);
  const trench = (x: number, z: number) => Math.abs(x) < TW && z > -0.28;
  const gy = ground(gp, [
    { h: mound, c: (x, y, z) => (y > 0.07 ? mix('#a3a35a', '#b8b070', fbm(x * 12, 0, z * 12)) : mix('#b9ad78', '#c8b98a', fbm(x * 10, 1, z * 10))) },
    { in: trench, h: (x, z) => B0 - 0.006 + 0.012 * sstep(-0.12, -0.18, z) + 0.001 * fbm(x * 30, 2, z * 30), c: (x, _y, z) => (hash3(Math.floor(x * 90), 5, Math.floor(z * 90)) > 0.8 ? '#a38a64' : '#b8a07a') },
  ], (x, y, z) => {
    if (Math.abs(x) < TW + 0.03 && z > -0.3 && Math.hypot(x, z) < 0.47 && y > B0 - 0.004) {
      const t = (y - B0) / ((TOP - B0) / 9) + (fbm(x * 8, y * 2, z * 8) - 0.5) * 0.5;
      const L = Math.max(0, Math.min(8, Math.floor(t))), f = t - Math.floor(t);
      if (f > 0.55 && f < 0.85 && hash3(Math.floor(z * 70), L, 1) > 0.45) return hash3(Math.floor(z * 140), L, 2) > 0.5 ? '#d9cfba' : '#c4b89c';
      return LAY[L];
    }
    return strata(['#b9a27a', '#a88f66', '#c7b28a', '#96805c'], 70)(x, y, z);
  }, 60, 0.5, 30);
  // Stone wall stubs crossing the trench floor at different depths
  for (const [z, h] of [[0.02, 0.03], [0.14, 0.018], [-0.08, 0.04]] as const) bricks(gp, '#cfc3a6', 0, gy(0, z) - 0.002, z, TW * 1.6, h, 0.014, 0, 3, 8);
  // Troy VI: sloping (battered) limestone walls and a tower round the front-right of the mound
  for (let i = 0; i < 6; i++) {
    const a = 0.12 + i * 0.16, r = 0.34, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < TW + 0.02) continue;
    const m = bricks(gp, '#d2c4a2', x, gy(x * 1.08, z * 1.08) - 0.01, z, 0.058, 0.07, 0.025, Math.PI / 2 - a, 5, 6);
    m.rotation.order = 'YXZ'; m.rotation.x = 0.18;
  }
  const tA = 0.12 + 5.6 * 0.16, tx = Math.cos(tA) * 0.33, tz = Math.sin(tA) * 0.33;
  bricks(gp, '#c9bb98', tx + 0.08, gy(tx + 0.08, tz) - 0.01, tz, 0.07, 0.09, 0.065, Math.PI / 2 - tA, 6, 5);
  // Archaeologists in the trench: brushing a wall, sieving, carrying a find; a tent on the mound top
  person(gp, 0.03, gy(0.03, 0.06), 0.06, -0.6, 'kneel', '#f59e0b', 1);
  person(gp, -0.035, gy(-0.035, 0.1), 0.1, 2.0, 'bend', '#ef4444', 3);
  person(gp, -0.02, gy(-0.02, 0.24), 0.24, -0.4, 'carry', '#3b82f6', 0);
  box(gp, '#a8835a', -0.02, gy(-0.02, 0.24) + 0.07, 0.24, 0.016, 0.012, 0.016);
  sieve(gp, 0.035, gy(0.035, 0.2), 0.2, 0.4);
  bucket(gp, -0.04, gy(-0.04, 0.03), 0.03, '#16a34a');
  wheelbarrow(gp, 0.04, gy(0.04, 0.32), 0.32, -0.3, '#dc2626', '#b9a27a');
  tent(gp, 0.17, gy(0.17, -0.1), -0.1, -0.3, 0.11, 0.09, 0.06, '#f5f5f4');
  finds(gp, 0.17, gy(0.17, -0.1) + 0.003, -0.1, -0.3, ['#a0623a', '#d9cfba', '#3a2a24']);
  person(gp, 0.12, gy(0.12, -0.03), -0.03, -0.9, 'point', '#f5f0e6', 2, '#e8dcb5', '#4b5563');
  ladder(gp, [TW - 0.012, B0 + 0.03, -0.05], [TW + 0.012, gy(TW + 0.02, -0.05) + 0.004, -0.05], 0.014);
  // The giant wooden Trojan Horse replica (front-left), with a stair up into its belly and kids at the windows
  const hp = grp(gp, -0.26, gy(-0.26, 0.22), 0.22, -0.6);
  const WD = '#8a5a34', WD2 = '#7a4c2a', WN = '#2a1a10';
  box(hp, '#9a7b55', 0, 0, 0, 0.22, 0.006, 0.11);
  for (const lx of [-0.06, 0.055]) for (const lz of [-0.028, 0.028]) {
    const lg = bricks(hp, WD2, lx, 0.006, lz, 0.03, 0.1, 0.012, 0, 6, 1);
    lg.rotation.z = lx < 0 ? 0.12 : -0.12;
  }
  bricks(hp, WD, 0, 0.1, 0, 0.17, 0.05, 0.075, 0, 5, 8);
  for (let i = 0; i < 4; i++) box(hp, WN, -0.05 + i * 0.033, 0.122, 0.0378, 0.012, 0.012, 0.002);
  bricks(hp, WD, 0.04, 0.15, 0, 0.07, 0.05, 0.066, 0, 4, 4);
  for (let i = 0; i < 2; i++) box(hp, WN, 0.025 + i * 0.03, 0.172, 0.0335, 0.011, 0.012, 0.002);
  blob(hp, SKIN[2], -0.017, 0.128, 0.039, 0.004);
  blob(hp, SKIN[0], 0.025, 0.178, 0.035, 0.004);
  const neck = bricks(hp, WD, -0.07, 0.13, 0, 0.045, 0.085, 0.05, 0, 6, 3);
  neck.rotation.z = 0.42;
  const head = grp(hp, -0.1, 0.22, 0, 0);
  head.rotation.z = 0.55;
  bricks(head, WD, 0, -0.02, 0, 0.075, 0.04, 0.042, 0, 3, 4);
  box(head, WN, -0.03, 0.002, 0.0215, 0.006, 0.006, 0.002);
  box(head, WN, -0.03, 0.002, -0.0215, 0.006, 0.006, 0.002);
  for (const sz of [-1, 1]) box(head, WD2, 0.02, 0.02, sz * 0.012, 0.008, 0.016, 0.006);
  box(head, WN, -0.036, -0.012, 0, 0.004, 0.004, 0.03);
  for (let i = 0; i < 6; i++) box(hp, WD2, -0.075 + i * 0.016 - 0.04 * 0, 0.205 - i * 0.012 + (i % 2) * 0.008, 0, 0.01, 0.016, 0.024);
  const tail = bricks(hp, WD2, 0.092, 0.09, 0, 0.016, 0.06, 0.02, 0, 4, 1);
  tail.rotation.z = -0.15;
  ladder(hp, [0.0, 0.006, 0.05], [0.0, 0.1, 0.02], 0.016);
  // Visitors round the horse, olive and pine trees
  person(gp, -0.12, gy(-0.12, 0.33), 0.33, -2.6, 'point', '#22c55e', 0, null, '#1f2937');
  person(gp, -0.16, gy(-0.16, 0.38), 0.38, -2.4, 'stand', '#a855f7', 2, null, '#1f2937', 0.8);
  person(gp, -0.38, gy(-0.38, 0.06), 0.06, 0.5, 'stand', '#f59e0b', 1, '#f5f5f4', '#1f2937');
  for (const [x, z, s, pine] of [[-0.4, -0.14, 0.07, true], [-0.3, -0.32, 0.075, true], [0.36, -0.22, 0.06, false], [0.42, 0.08, 0.055, false], [-0.42, 0.2, 0.06, false], [0.2, 0.4, 0.05, false]] as const) tree(gp, x, gy(x, z) - 0.004, z, s, pine ? '#3f6b35' : '#8a9a5a', pine);
};

export const H_ARCHAEOLOGY: Record<string, Builder> = {
  ar_tutankhamun: tutankhamun,
  ar_lascaux: lascaux,
  ar_sanxingdui: sanxingdui,
  ar_gobeklitepe: gobeklitepe,
  ar_nazca: nazca,
  ar_mawangdui: mawangdui,
  ar_mohenjodaro: mohenjodaro,
  ar_lucy: lucy,
  ar_pakal: pakal,
  ar_vasa: vasa,
  ar_skarabrae: skarabrae,
  ar_troy: troy,
};
