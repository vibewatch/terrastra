import { passerby } from '../human.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type Builder, type V3, type MatOpts, type Paint, g, add, mat, box, cyl, cone, rod, tube, lathe, gable, tbox, prism, archPath,
  paintFaces, shadeQ as shade, mixQ as mix, qn, hash3, CYL,
} from '../prims.ts';
import { type HFn, island, sstep, strataSide, EARTH, onGround, scatter, pine } from '../nature.ts';

// Hero builders for landmarks of countries that had none yet (keys cc_*). Each is a compact diorama on its real
// setting; front is +z, base at y=0, footprint radius ≈ 0.5.

// ---- local helpers ----------------------------------------------------------------------------------------
/** Water ripple paint (same look as nature.ripple, but with memoised colours). */
const rip = (c: string, x: number, z: number) =>
  Math.sin(x * 90 + Math.sin(z * 40) * 2) > 0.93 ? mix(c, '#d6f0ff', 0.45) : hash3(Math.floor(x * 60), 0, Math.floor(z * 60)) > 0.9 ? shade(c, 1.12) : c;
const LO = () => g('cc:sph9', () => new THREE.SphereGeometry(0.5, 9, 7));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
function grp(p: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0): THREE.Group {
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = ry; p.add(q); return q;
}

/** Triangle soup with per-face colours; `want` (optional) forces each face normal to point along that direction. */
class Mesher {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  tri(a: V3, b: V3, d: V3, color: string, want?: V3): void {
    let q1 = b, q2 = d;
    if (want) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { q1 = d; q2 = b; }
    }
    this.c.set(color);
    for (const q of [a, q1, q2]) { this.pos.push(q[0], q[1], q[2]); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  quad(a: V3, b: V3, d: V3, e: V3, color: string, want?: V3): void { this.tri(a, b, d, color, want); this.tri(a, d, e, color, want); }
  /** Flat rectangle on a vertical facade: centre c, horizontal unit axis u (normal = u × up, flipped to face n). */
  rect(c: V3, u: [number, number], n: [number, number], w: number, h: number, color: string): void {
    const ux = u[0] * w / 2, uz = u[1] * w / 2;
    this.quad([c[0] - ux, c[1], c[2] - uz], [c[0] + ux, c[1], c[2] + uz], [c[0] + ux, c[1] + h, c[2] + uz], [c[0] - ux, c[1] + h, c[2] - uz], color, [n[0], 0, n[1]]);
  }
  /** Window rows on a vertical facade plane. Origin o = facade centre at ground; u along the wall, n outward normal. */
  windows(o: V3, u: [number, number], n: [number, number], cols: number, dx: number, rows: number[], ww: number, wh: number, glass: string, frame?: string, arch = false): void {
    for (const y of rows) for (let i = 0; i < cols; i++) {
      const s = (i - (cols - 1) / 2) * dx;
      const cx = o[0] + u[0] * s + n[0] * 0.0012, cz = o[2] + u[1] * s + n[1] * 0.0012;
      if (frame) this.rect([cx, o[1] + y - 0.0025, cz], u, n, ww + 0.005, wh + 0.005, frame);
      const cx2 = cx + n[0] * 0.0008, cz2 = cz + n[1] * 0.0008;
      this.rect([cx2, o[1] + y, cz2], u, n, ww, wh, glass);
      if (arch) this.tri([cx2 - u[0] * ww / 2, o[1] + y + wh, cz2 - u[1] * ww / 2], [cx2 + u[0] * ww / 2, o[1] + y + wh, cz2 + u[1] * ww / 2], [cx2, o[1] + y + wh + ww * 0.5, cz2], glass, [n[0], 0, n[1]]);
    }
  }
  build(p: THREE.Object3D, o: MatOpts = {}): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return add(p, geo, mat('#ffffff', { vc: true, ...o }), 0, 0, 0, 1, 1, 1);
  }
}

/** Battlement merlons along a straight wall top from a to b (y = top of wall). */
function merlons(p: THREE.Object3D, a: [number, number], b: [number, number], y: number, c: string, step = 0.016, s = 0.008, h = 0.009, t = 0.008): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step)), ry = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i <= n; i++) { const f = i / n; box(p, c, a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f, s, h, t, ry); }
}
/** Square pyramid / hipped roof (w × d footprint, top w1 × d1). */
const hip = (p: THREE.Object3D, c: string, x: number, y: number, z: number, w: number, d: number, h: number, w1 = 0.002, d1 = 0.002, ry = 0) =>
  tbox(p, w, d, w1, d1, h, c, x, y, z, 0, 0, ry);
/** Stepped brick gable facing ±x, ridge along x (wall plane at x, spanning depth d). */
function stepGable(p: THREE.Object3D, c: string, x: number, y: number, z: number, d: number, h: number, steps: number, ry = Math.PI / 2): void {
  for (let i = 0; i < steps; i++) {
    const w = d * (1 - i / steps);
    box(p, i % 2 ? c : shade(c, 0.94), x, y + (i * h) / steps, z, w, h / steps + 0.0005, 0.008, ry);
    if (i > 0) for (const s of [-1, 1]) cone(p, shade(c, 0.9), x + (ry === 0 ? s * w / 2 : 0), y + ((i + 1) * h) / steps, z + (ry === 0 ? 0 : s * w / 2), 0.003, 0.01, 4);
  }
}

const SKIN = ['#8d5a3b', '#c68b5e', '#5a3825', '#e0b48a'];
function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, k = 0, s = 1): void {
  passerby(p, x, y, z, 0.023 * s, k, { top: c, skin: SKIN[k % 4] });
}
const PCOL = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316', '#a855f7', '#f8fafc', '#0ea5e9'];
function crowd(p: THREE.Object3D, n: number, seed: number, at: (i: number) => [number, number, number] | null, s = 1): void {
  for (let i = 0; i < n; i++) { const q = at(i); if (q) person(p, q[0], q[1], q[2], PCOL[Math.floor(hash3(i, seed, 3) * 8)], i, s); }
}
function leafTree(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, seed = 0): void {
  cyl(p, '#5b4636', x, y, z, s * 0.09, s * 0.55, 5);
  for (let i = 0; i < 3; i++) {
    const a = hash3(seed, i, 1) * 6.28, d = s * 0.22 * hash3(seed, i, 2);
    blob(p, shade(c, 0.88 + hash3(seed, i, 3) * 0.28), x + Math.cos(a) * d, y + s * (0.62 + 0.18 * hash3(seed, i, 4)), z + Math.sin(a) * d,
      s * (0.32 + 0.12 * hash3(seed, i, 5)), s * 0.24, s * (0.32 + 0.12 * hash3(seed, i, 6)));
  }
}
function palm(p: THREE.Object3D, x: number, y: number, z: number, h: number, lean = 0.15, ang = 0, c = '#4f8a3a', seed = 0): void {
  const lx = Math.cos(ang) * lean * h, lz = Math.sin(ang) * lean * h;
  const top: V3 = [x + lx, y + h, z + lz];
  ctube(p, [[x, y, z], [x + lx * 0.3, y + h * 0.5, z + lz * 0.3], top], h * 0.04, '#8a7458', 8, 6);
  const n = 8, l = h * 0.42;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + hash3(seed, i, 7), tl = 0.25 + hash3(seed, i, 8) * 0.5;
    blob(p, shade(c, 0.85 + hash3(seed, i, 9) * 0.3), top[0] + Math.cos(a) * l * 0.48 * Math.cos(tl), top[1] - l * 0.48 * Math.sin(tl), top[2] - Math.sin(a) * l * 0.48 * Math.cos(tl),
      l * 0.5, h * 0.012, h * 0.07, a, 0, -tl);
  }
}
/** Clipped topiary cone / column. */
const topiary = (p: THREE.Object3D, x: number, y: number, z: number, h: number, c = '#3f6f3a') => { cone(p, c, x, y, z, h * 0.28, h, 8); };
const grass = (x: number, z: number, a = '#5f9a4a', b = '#6faa55') => (hash3(Math.floor(x * 70), 7, Math.floor(z * 70)) > 0.8 ? shade(a, 0.9) : mix(a, b, qn(x * 8, 0, z * 8)));

// ---- Malbork: red-brick Teutonic castle on the Nogat, twin bridge-gate towers, stepped gables ----------------
const BR = '#b4553a', BRD = '#93432d', RF = '#a3412b';
function brickBlock(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, seed: number, c = BR): void {
  box(p, shade(c, 0.95 + hash3(seed, 1, 1) * 0.1), x, y, z, w, h, d);
  box(p, BRD, x, y + h * 0.82, z, w + 0.002, 0.006, d + 0.002);
  box(p, shade(BRD, 0.9), x, y, z, w + 0.004, 0.012, d + 0.004);
}
const malbork: Builder = gp => {
  const bank = (x: number) => 0.17 + 0.02 * Math.sin(x * 5 + 1);
  const hf: HFn = (x, z) => {
    const dz = z - bank(x);
    if (dz > 0.03) return -0.016;
    if (dz > 0) return -0.016 * sstep(0, 0.03, dz);
    return 0.003 * qn(x * 12, 1, z * 12);
  };
  island(gp, 0.5, hf, '#5f9a4a', (x, y, z) => {
    if (y < 0.03) return rip('#4f7f9a', x, z);
    const dz = z - bank(x);
    if (dz > -0.012) return '#8a7a55';
    if (z > -0.03 && z < 0.0 && x > -0.25 && x < 0.25) return '#b9ad92';
    return grass(x, z);
  }, { rings: 40, segs: 110, side: strataSide(EARTH) });
  const Y = 0.035;
  const W = new Mesher();
  // River wall with crenellations and the twin conical bridge-gate towers
  box(gp, BR, -0.06, Y, 0.115, 0.6, 0.045, 0.016);
  box(gp, BRD, -0.06, Y + 0.036, 0.115, 0.602, 0.004, 0.018);
  merlons(gp, [-0.355, 0.123], [0.235, 0.123], Y + 0.045, BR, 0.014, 0.007, 0.008, 0.006);
  for (const tx of [-0.035, 0.035]) {
    cyl(gp, shade(BR, 1.04), tx, Y, 0.125, 0.026, 0.1, 16);
    cyl(gp, BRD, tx, Y + 0.09, 0.125, 0.028, 0.01, 16);
    cone(gp, RF, tx, Y + 0.1, 0.125, 0.031, 0.085, 16);
    rod(gp, [tx, Y + 0.183, 0.125], [tx, Y + 0.2, 0.125], 0.0015, '#3b3b3b', 4);
    for (const yy of [0.03, 0.06]) W.windows([tx, Y, 0.1512], [1, 0], [0, 1], 1, 0, [yy], 0.006, 0.012, '#2a1c17');
  }
  box(gp, BR, 0, Y, 0.13, 0.05, 0.075, 0.03);
  merlons(gp, [-0.022, 0.146], [0.022, 0.146], Y + 0.075, BR, 0.011, 0.006, 0.007, 0.005);
  W.rect([0, Y, 0.1455], [1, 0], [0, 1], 0.022, 0.042, '#2a1c17');
  // Wooden footbridge across the moat to the gate
  box(gp, '#7a5a3a', 0, Y - 0.004, 0.2, 0.024, 0.006, 0.12);
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) rod(gp, [s * 0.012, Y - 0.02, 0.15 + k * 0.024], [s * 0.012, Y + 0.012, 0.15 + k * 0.024], 0.0015, '#5b4030', 4);
  // Middle Castle: Grand Master's Palace (left) with tall windows, corner turrets and steep hipped roof
  const px = -0.26, pz = -0.03;
  brickBlock(gp, px, Y, pz, 0.15, 0.13, 0.11, 2);
  hip(gp, RF, px, Y + 0.13, pz, 0.15, 0.11, 0.09, 0.07, 0.01);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    cyl(gp, BR, px + sx * 0.075, Y + 0.08, pz + sz * 0.055, 0.009, 0.07, 8);
    cone(gp, RF, px + sx * 0.075, Y + 0.15, pz + sz * 0.055, 0.011, 0.04, 8);
  }
  W.windows([px, Y, pz + 0.0551], [1, 0], [0, 1], 6, 0.022, [0.03, 0.075], 0.011, 0.032, '#2c2622', '#e8e0cc', true);
  W.windows([px + 0.0751, Y, pz], [0, -1], [1, 0], 4, 0.022, [0.03, 0.075], 0.011, 0.032, '#2c2622', '#e8e0cc', true);
  W.windows([px - 0.0751, Y, pz], [0, 1], [-1, 0], 4, 0.022, [0.03, 0.075], 0.011, 0.032, '#2c2622', '#e8e0cc', true);
  // Connecting middle-castle wing with gable roof
  brickBlock(gp, -0.1, Y, -0.06, 0.18, 0.085, 0.08, 3);
  gable(gp, 0.18, 0.06, 0.084, shade(RF, 0.95), -0.1, Y + 0.085, -0.06);
  for (let k = 0; k < 4; k++) { box(gp, BR, -0.16 + k * 0.04, Y + 0.105, -0.025, 0.014, 0.022, 0.014); gable(gp, 0.016, 0.01, 0.016, RF, -0.16 + k * 0.04, Y + 0.127, -0.025, Math.PI / 2); }
  W.windows([-0.1, Y, -0.0195], [1, 0], [0, 1], 7, 0.024, [0.025, 0.055], 0.008, 0.016, '#2a1c17');
  // High Castle: big square block, steep roof, stepped gables, and the great square main tower
  const hx = 0.12, hz = -0.12;
  brickBlock(gp, hx, Y, hz, 0.2, 0.15, 0.15, 4);
  gable(gp, 0.2, 0.11, 0.154, RF, hx, Y + 0.15, hz);
  for (const s of [-1, 1]) stepGable(gp, BR, hx + s * 0.1, Y + 0.15, hz, 0.15, 0.11, 6);
  W.windows([hx, Y, hz + 0.0751], [1, 0], [0, 1], 8, 0.022, [0.03, 0.08], 0.008, 0.022, '#2a1c17', undefined, true);
  W.windows([hx, Y, hz + 0.0751], [1, 0], [0, 1], 4, 0.04, [0.115], 0.014, 0.012, BRD);
  const tx = 0.0, tz = -0.17;
  brickBlock(gp, tx, Y, tz, 0.06, 0.29, 0.06, 5);
  box(gp, BRD, tx, Y + 0.29, tz, 0.068, 0.012, 0.068);
  for (const [a, b] of [[[-0.034, 0.034], [0.034, 0.034]], [[0.034, 0.034], [0.034, -0.034]], [[0.034, -0.034], [-0.034, -0.034]], [[-0.034, -0.034], [-0.034, 0.034]]] as [number, number][][])
    merlons(gp, [tx + a[0], tz + a[1]], [tx + b[0], tz + b[1]], Y + 0.302, BR, 0.017, 0.008, 0.012, 0.006);
  hip(gp, RF, tx, Y + 0.302, tz, 0.05, 0.05, 0.04);
  W.windows([tx, Y, tz + 0.0301], [1, 0], [0, 1], 2, 0.02, [0.1, 0.16, 0.22, 0.26], 0.007, 0.016, '#2a1c17');
  W.windows([tx + 0.0301, Y, tz], [0, -1], [1, 0], 2, 0.02, [0.1, 0.16, 0.22, 0.26], 0.007, 0.016, '#2a1c17');
  // East square tower with a pyramid roof and the long outer bailey wall
  brickBlock(gp, 0.31, Y, 0.04, 0.055, 0.15, 0.055, 6);
  hip(gp, RF, 0.31, Y + 0.15, 0.04, 0.062, 0.062, 0.09);
  W.windows([0.31, Y, 0.0681], [1, 0], [0, 1], 2, 0.02, [0.05, 0.1], 0.007, 0.016, '#2a1c17');
  box(gp, BR, 0.27, Y, 0.0, 0.016, 0.06, 0.2);
  box(gp, BR, 0.3, Y, -0.13, 0.08, 0.06, 0.016);
  merlons(gp, [0.27, -0.1], [0.27, 0.0], Y + 0.06, BR, 0.014, 0.007, 0.008, 0.006);
  // Copper-green church spire of the old town on the far right
  box(gp, '#c9b8a0', 0.36, Y, -0.17, 0.035, 0.12, 0.035);
  cone(gp, '#5e9c84', 0.36, Y + 0.12, -0.17, 0.022, 0.11, 8);
  W.build(gp, { rough: 0.5 });
  // Trees along the bank and behind
  const trees: [number, number, number][] = [[-0.42, 0.06, 0.1], [-0.38, -0.12, 0.09], [-0.17, 0.07, 0.07], [0.14, 0.05, 0.075], [0.4, 0.1, 0.08], [-0.33, 0.12, 0.08], [0.22, -0.3, 0.09], [-0.12, -0.28, 0.1], [0.42, -0.06, 0.09]];
  trees.forEach(([x, z, s], i) => leafTree(gp, x, Y - 0.003, z, s, i % 2 ? '#3f7a35' : '#4f8a3e', i + 3));
  crowd(gp, 7, 11, i => { const x = -0.2 + i * 0.06; return [x, Y, 0.0 - 0.012 * (i % 2)]; });
};

// ---- Bran Castle: white walls and red roofs crowning a forested rock ----------------------------------------
const bran: Builder = gp => {
  const PL = 0.21;
  const rockR = (x: number, z: number) => Math.hypot(x * 1.05, (z + 0.02) * 1.25);
  const hf: HFn = (x, z) => {
    const r = rockR(x, z);
    let y = 0.27 * Math.max(0, 1 - (r / 0.36) ** 2.2) + 0.03 * qn(x * 9, 2, z * 9);
    y = Math.min(y, PL + 0.01 * qn(x * 20, 1, z * 20));
    return Math.max(y, 0.01 + 0.01 * qn(x * 6, 3, z * 6));
  };
  island(gp, 0.5, hf, '#5f8a45', (x, y, z, _nx, ny) => {
    const t = y - 0.035;
    if (t > 0.04 && ny < 0.75) return qn(x * 30, y * 30, z * 30) > 0.55 ? '#7d776c' : hash3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70)) > 0.85 ? '#6a655c' : '#948d80';
    if (t > PL - 0.015) return '#9a9283';
    if (Math.abs(z - 0.41 - 0.04 * Math.sin(x * 7)) < 0.017) return hash3(Math.floor(x * 80), 2, Math.floor(z * 80)) > 0.8 ? '#b5a88e' : '#c8bba0';
    return grass(x, z, '#4f8a3e', '#6a9a4c');
  }, { rings: 46, segs: 112, side: strataSide(EARTH) });
  const gy = onGround(hf);
  const Y = 0.035 + PL - 0.004;
  const WH = '#ece5d6', WH2 = '#e2d9c6', ST = '#bfae8f', RO = '#b5482f';
  const W = new Mesher();
  // Stone foundations growing out of the rock
  for (const [x, z, w, d] of [[-0.06, 0.0, 0.26, 0.15], [0.07, -0.03, 0.12, 0.13], [-0.02, 0.06, 0.12, 0.08]] as number[][]) tbox(gp, w + 0.04, d + 0.04, w, d, 0.04, ST, x, Y - 0.03, z);
  // Left round tower with a tall pointed roof
  const rx = -0.15, rz = 0.02;
  cyl(gp, ST, rx, Y - 0.01, rz, 0.048, 0.04, 16);
  cyl(gp, WH, rx, Y + 0.03, rz, 0.042, 0.13, 16);
  cyl(gp, RO, rx, Y + 0.16, rz, 0.047, 0.008, 16);
  cone(gp, RO, rx, Y + 0.168, rz, 0.047, 0.15, 16);
  rod(gp, [rx, Y + 0.31, rz], [rx, Y + 0.34, rz], 0.0015, '#2f2f2f', 4);
  box(gp, '#2f2f2f', rx, Y + 0.33, rz, 0.012, 0.0015, 0.0015);
  for (let k = 0; k < 4; k++) { const a = 0.4 + k * 0.6; W.rect([rx + Math.cos(a) * 0.0425, Y + 0.08 + (k % 2) * 0.04, rz + Math.sin(a) * 0.0425], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.008, 0.016, '#2a2522'); }
  // Main west wing
  box(gp, WH, -0.07, Y, 0.0, 0.12, 0.13, 0.11);
  hip(gp, RO, -0.07, Y + 0.13, 0.0, 0.13, 0.12, 0.06, 0.07, 0.01);
  W.windows([-0.07, Y, 0.0551], [1, 0], [0, 1], 4, 0.025, [0.03, 0.08], 0.008, 0.014, '#2a2522', '#f8f4ea');
  // Central keep with the tall watch tower (timber gallery + pointed cap)
  box(gp, WH2, 0.03, Y, -0.03, 0.09, 0.19, 0.09);
  hip(gp, RO, 0.03, Y + 0.19, -0.03, 0.1, 0.1, 0.05, 0.04, 0.04);
  W.windows([0.03, Y, 0.0151], [1, 0], [0, 1], 3, 0.024, [0.04, 0.09, 0.14], 0.008, 0.016, '#2a2522', '#f8f4ea');
  W.windows([0.0751, Y, -0.03], [0, -1], [1, 0], 3, 0.024, [0.06, 0.12], 0.008, 0.016, '#2a2522', '#f8f4ea');
  const tx = 0.03, tz = -0.04;
  box(gp, WH, tx, Y + 0.2, tz, 0.05, 0.09, 0.05);
  box(gp, ST, tx, Y + 0.29, tz, 0.06, 0.03, 0.06);
  merlons(gp, [tx - 0.03, tz + 0.03], [tx + 0.03, tz + 0.03], Y + 0.32, ST, 0.012, 0.007, 0.008, 0.006);
  merlons(gp, [tx + 0.03, tz + 0.03], [tx + 0.03, tz - 0.03], Y + 0.32, ST, 0.012, 0.007, 0.008, 0.006);
  box(gp, '#5b3f2c', tx, Y + 0.322, tz, 0.046, 0.02, 0.046);
  hip(gp, RO, tx, Y + 0.342, tz, 0.056, 0.056, 0.05);
  cyl(gp, RO, tx, Y + 0.392, tz, 0.006, 0.012, 6);
  cone(gp, RO, tx, Y + 0.404, tz, 0.008, 0.02, 6);
  rod(gp, [tx, Y + 0.42, tz], [tx, Y + 0.44, tz], 0.0013, '#2f2f2f', 4);
  W.windows([tx, Y + 0.2, tz + 0.0251], [1, 0], [0, 1], 2, 0.02, [0.03, 0.065], 0.007, 0.012, '#2a2522');
  W.windows([tx, Y + 0.29, tz + 0.0301], [1, 0], [0, 1], 3, 0.017, [0.008], 0.008, 0.012, '#2a2522');
  // East wing with its own small pointed turret
  box(gp, WH, 0.12, Y - 0.02, -0.02, 0.08, 0.15, 0.1);
  hip(gp, RO, 0.12, Y + 0.13, -0.02, 0.09, 0.11, 0.055, 0.01, 0.06);
  W.windows([0.12, Y - 0.02, 0.0301], [1, 0], [0, 1], 2, 0.03, [0.05, 0.1], 0.008, 0.016, '#2a2522', '#f8f4ea');
  W.windows([0.1601, Y - 0.02, -0.02], [0, -1], [1, 0], 3, 0.03, [0.05, 0.1], 0.008, 0.016, '#2a2522', '#f8f4ea');
  box(gp, WH2, 0.15, Y + 0.12, -0.06, 0.035, 0.07, 0.035);
  hip(gp, RO, 0.15, Y + 0.19, -0.06, 0.042, 0.042, 0.07);
  for (const [x, z] of [[-0.03, -0.06], [0.1, 0.02], [-0.1, -0.03]]) { box(gp, WH2, x, Y + 0.15, z, 0.012, 0.06, 0.012); box(gp, '#8a7f70', x, Y + 0.21, z, 0.015, 0.004, 0.015); }
  // Front lower wing with a timber oriel and the entry stair
  box(gp, WH, -0.02, Y - 0.015, 0.075, 0.1, 0.085, 0.06);
  gable(gp, 0.11, 0.045, 0.068, RO, -0.02, Y + 0.07, 0.075);
  box(gp, '#6b4a32', 0.0, Y + 0.03, 0.108, 0.035, 0.03, 0.012);
  hip(gp, RO, 0.0, Y + 0.06, 0.108, 0.04, 0.016, 0.014, 0.04, 0.002);
  W.windows([0.0, Y + 0.03, 0.1141], [1, 0], [0, 1], 3, 0.01, [0.008], 0.006, 0.014, '#2a2522');
  W.windows([-0.045, Y - 0.015, 0.1051], [1, 0], [0, 1], 2, 0.02, [0.025, 0.055], 0.007, 0.013, '#2a2522', '#f8f4ea');
  W.build(gp, { rough: 0.5 });
  // Village road along the foot of the rock, red-roofed houses and the stair path up to the gate
  const roadZ = (x: number) => 0.41 + 0.04 * Math.sin(x * 7);
  for (let k = 0; k < 10; k++) {
    const t = k / 9, x = 0.07 + 0.035 * Math.sin(t * 7), z = 0.385 - t * 0.2;
    box(gp, '#c8bba0', x, gy(x, z), z, 0.018, 0.006, 0.018, t * 2);
  }
  for (const [x, side, c] of [[-0.3, -1, '#f1e6c8'], [-0.22, 1, '#e9d9b0'], [-0.12, -1, '#f4efe2'], [0.2, -1, '#efe0bd'], [0.28, 1, '#f4efe2'], [0.34, -1, '#e9d9b0']] as [number, number, string][]) {
    const z = roadZ(x) + side * 0.04;
    if (Math.hypot(x, z) > 0.46) continue;
    const y = gy(x, z) + 0.004, ry = Math.atan(0.28 * Math.cos(x * 7));
    box(gp, c, x, y, z, 0.045, 0.028, 0.03, -ry);
    gable(gp, 0.05, 0.022, 0.036, '#b5482f', x, y + 0.028, z, -ry);
    const m = new Mesher();
    m.windows([0, 0, side * -0.0151], [side * -1, 0], [0, side * -1], 2, 0.02, [0.01], 0.007, 0.009, '#2a2522', '#f8f4ea');
    const hq = grp(gp, x, y, z, -ry); m.build(hq, { rough: 0.6 });
  }
  for (let k = 0; k < 3; k++) { const x = -0.05 + k * 0.05, z = roadZ(x); box(gp, ['#c8102e', '#2b4a7a', '#f2c94c'][k], x, gy(x, z) + 0.004, z, 0.024, 0.01, 0.013); }
  scatter(70, 21, (x, z, i) => {
    const r = rockR(x, z), h = hf(x, z);
    if (r < 0.2 || h > 0.2 || Math.abs(z - roadZ(x)) < 0.08) return;
    if (hash3(i, 4, 4) > 0.45) pine(gp, x, gy(x, z), z, 0.06 + hash3(i, 2, 2) * 0.05, hash3(i, 3, 3) > 0.5 ? '#2f5e3f' : '#3a6b45');
    else leafTree(gp, x, gy(x, z), z, 0.06 + hash3(i, 5, 5) * 0.04, hash3(i, 6, 6) > 0.5 ? '#4f8a3e' : '#5f9a44', i);
  }, 0.47);
  crowd(gp, 7, 4, i => { const x = -0.02 + i * 0.03, z = roadZ(x) + (i % 2 ? 0.01 : -0.01); return [x, gy(x, z), z]; });
};

// ---- Schönbrunn: long Schönbrunn-yellow façade, grand parterre and the Neptune Fountain ---------------------
const schonbrunn: Builder = gp => {
  const PZ = -0.25;
  island(gp, 0.5, () => 0, '#e3dccb', (x, _y, z) => {
    const ax = Math.abs(x);
    if (z < PZ + 0.06) return '#d8d0bc';
    if (ax > 0.33) return z > 0.3 ? grass(x, z) : '#3f6f3a';
    if (ax < 0.03 || (z > -0.06 && z < -0.03) || (z > 0.17 && z < 0.2) || z > 0.33) return hash3(Math.floor(x * 90), 1, Math.floor(z * 90)) > 0.85 ? '#d6ceba' : '#e6dfcf';
    if (ax > 0.28) return '#e6dfcf';
    // Embroidered parterre beds: lawn with flower ribbons
    const lx = (ax - 0.155) / 0.12, lz = z < 0.075 ? (z - 0.07) / 0.12 : (z - 0.26) / 0.06;
    const r = Math.hypot(lx, lz);
    if (Math.abs(r - 0.55) < 0.07 || Math.abs(Math.abs(lx) - 0.92) < 0.05 || Math.abs(Math.abs(lz) - 0.92) < 0.06) return hash3(Math.floor(x * 120), 2, Math.floor(z * 120)) > 0.5 ? '#e05a4f' : '#f2b84b';
    if (r < 0.2) return '#e8e2d2';
    return grass(x, z, '#5c9a45', '#6aa652');
  }, { rings: 30, segs: 100, side: strataSide(['#8d877c', '#7c766b']) });
  const Y = 0.035, YE = '#ebc35e', YD = '#d9ad48', WT = '#f4efe2', RF = '#8b8579';
  const W = new Mesher();
  // Main block, wing ends and corner pavilions
  const H = 0.11;
  box(gp, YE, 0, Y, PZ, 0.74, H, 0.1);
  box(gp, '#f0ead9', 0, Y + H - 0.008, PZ, 0.745, 0.008, 0.104);
  box(gp, shade(YE, 0.92), 0, Y, PZ, 0.746, 0.022, 0.104);
  tbox(gp, 0.74, 0.1, 0.7, 0.05, 0.035, RF, 0, Y + H, PZ);
  for (const s of [-1, 1]) {
    box(gp, YE, s * 0.33, Y, PZ + 0.04, 0.08, H + 0.004, 0.06);
    tbox(gp, 0.08, 0.06, 0.05, 0.02, 0.03, RF, s * 0.33, Y + H + 0.004, PZ + 0.04);
    box(gp, '#f0ead9', s * 0.33, Y + H - 0.006, PZ + 0.04, 0.084, 0.007, 0.064);
    W.windows([s * 0.33, Y, PZ + 0.0701], [1, 0], [0, 1], 3, 0.022, [0.03, 0.06, 0.088], 0.008, 0.016, '#3d4a4e', WT);
  }
  // Central risalit: pilasters, attic balustrade, ground-floor arcade and twin stairs
  box(gp, shade(YE, 1.03), 0, Y, PZ + 0.058, 0.2, H + 0.02, 0.02);
  tbox(gp, 0.2, 0.06, 0.18, 0.03, 0.025, RF, 0, Y + H + 0.02, PZ + 0.04);
  for (let k = 0; k < 9; k++) {
    const x = -0.088 + k * 0.022;
    box(gp, WT, x, Y + 0.03, PZ + 0.069, 0.006, H - 0.012, 0.004);
    box(gp, WT, x, Y + H + 0.022, PZ + 0.066, 0.006, 0.01, 0.006);
    blob(gp, WT, x, Y + H + 0.037, PZ + 0.066, 0.004, 0.006, 0.004);
  }
  W.windows([0, Y, PZ + 0.0691], [1, 0], [0, 1], 8, 0.022, [0.008], 0.013, 0.018, '#3a3e40', undefined, true);
  W.windows([0, Y, PZ + 0.0691], [1, 0], [0, 1], 8, 0.022, [0.045, 0.085], 0.009, 0.022, '#3d4a4e', WT, true);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) box(gp, k % 2 ? '#e2dbc9' : '#d6cfbd', s * (0.06 + k * 0.012), Y, PZ + 0.085 + k * 0.004, 0.012 + 0.0, 0.03 - k * 0.005, 0.03);
    box(gp, WT, s * 0.04, Y + 0.03, PZ + 0.085, 0.06, 0.004, 0.03);
  }
  // Long wings: rows of windows and pilasters
  for (const s of [-1, 1]) {
    const cx = s * 0.2;
    W.windows([cx, Y, PZ + 0.0501], [1, 0], [0, 1], 9, 0.02, [0.03, 0.062, 0.09], 0.008, 0.018, '#3d4a4e', WT);
    for (let k = 0; k < 5; k++) box(gp, YD, cx + (k - 2) * 0.045, Y + 0.022, PZ + 0.051, 0.006, H - 0.03, 0.003);
    for (let k = 0; k < 14; k++) { const x = s * (0.11 + k * 0.016); box(gp, WT, x, Y + H, PZ + 0.048, 0.003, 0.007, 0.003); }
    for (let k = 0; k < 6; k++) cyl(gp, '#6d675e', s * (0.12 + k * 0.035), Y + H + 0.02, PZ - 0.01, 0.004, 0.016, 5);
  }
  W.windows([0, Y, PZ - 0.0501], [-1, 0], [0, -1], 30, 0.022, [0.035, 0.07], 0.008, 0.018, '#3d4a4e', WT);
  W.build(gp, { rough: 0.5 });
  // Garden: tall clipped hedge walls, topiary cones, statues on the parterre edge
  for (const s of [-1, 1]) {
    box(gp, '#3e6a36', s * 0.36, Y, 0.05, 0.03, 0.05, 0.42);
    box(gp, '#4a7a40', s * 0.36, Y + 0.05, 0.05, 0.026, 0.004, 0.42);
    for (let k = 0; k < 6; k++) topiary(gp, s * 0.3, Y, -0.1 + k * 0.08, 0.035, '#3f6f3a');
    for (let k = 0; k < 5; k++) {
      const z = -0.1 + k * 0.1;
      box(gp, '#d8d2c4', s * 0.285, Y, z + 0.04, 0.01, 0.012, 0.01);
      cyl(gp, '#f2eee6', s * 0.285, Y + 0.012, z + 0.04, 0.0035, 0.02, 6);
      blob(gp, '#f2eee6', s * 0.285, Y + 0.035, z + 0.04, 0.004);
    }
  }
  // Neptune Fountain: wide basin, rock with figures and a jet
  const fz = 0.36;
  lathe(gp, [[0.0001, 0], [0.13, 0], [0.13, 0.018], [0.122, 0.018], [0.122, 0.006], [0.0001, 0.006]], '#d6cfbe', 0, Y, fz, 28);
  lathe(gp, [[0.0001, 0], [0.122, 0], [0.0001, 0]], '#4c93b8', 0, Y + 0.013, fz, 28);
  add(gp, CYL(28), mat('#5aa3c6', { rough: 0.2 }), 0, Y + 0.013, fz, 0.244, 0.002, 0.244);
  for (const [x, y, z, r, c] of [[0, 0.02, -0.03, 0.05, '#8f8574'], [-0.045, 0.018, -0.01, 0.035, '#a39684'], [0.045, 0.016, -0.015, 0.034, '#7d7466'], [-0.015, 0.045, -0.035, 0.03, '#958b79'], [0.02, 0.04, -0.02, 0.028, '#a79c88'], [0.0, 0.066, -0.035, 0.02, '#8a806f']] as [number, number, number, number, string][])
    blob(gp, c, x, Y + y, fz + z, r, r * 0.75, r * 0.8, x * 20, 0.2);
  const statue = (x: number, y: number, z: number, h: number, ry: number) => {
    cyl(gp, '#f2eee6', x, Y + y, fz + z, h * 0.18, h * 0.65, 7);
    blob(gp, '#f2eee6', x, Y + y + h * 0.75, fz + z, h * 0.13);
    for (const s of [-1, 1]) rod(gp, [x + Math.cos(ry) * s * h * 0.15, Y + y + h * 0.55, fz + z - Math.sin(ry) * s * h * 0.15], [x + Math.cos(ry) * s * h * 0.3, Y + y + h * (s > 0 ? 0.9 : 0.4), fz + z - Math.sin(ry) * s * h * 0.3], h * 0.05, '#f2eee6', 4);
  };
  statue(0, 0.08, -0.035, 0.055, 0);
  rod(gp, [0.017, Y + 0.1, fz - 0.035], [0.022, Y + 0.165, fz - 0.035], 0.0016, '#e5e2da', 4);
  for (const [x, z, ry] of [[-0.06, 0.01, 0.6], [0.06, 0.005, -0.6], [-0.03, 0.025, 0.2], [0.03, 0.03, -0.2]] as number[][]) statue(x, 0.025, z, 0.04, ry);
  for (const s of [-1, 1]) {
    blob(gp, '#f2eee6', s * 0.088, Y + 0.026, fz + 0.035, 0.016, 0.012, 0.022, s * 0.5);
    blob(gp, '#f2eee6', s * 0.096, Y + 0.044, fz + 0.05, 0.007, 0.012, 0.007, 0, 0.4);
  }
  for (let k = 0; k < 5; k++) cone(gp, '#e9f6fb', -0.06 + k * 0.03, Y + 0.013, fz + 0.06, 0.003, 0.03, 5);
  // Visitors and a fiaker carriage on the gravel
  crowd(gp, 14, 8, i => { const x = (hash3(i, 1, 9) - 0.5) * 0.5, z = -0.14 + hash3(i, 2, 9) * 0.45; return Math.abs(x) < 0.03 || (z > -0.06 && z < -0.03) || (z > 0.17 && z < 0.2) ? [x, Y, z] : [x > 0 ? 0.015 : -0.015, Y, z]; });
  const cq = grp(gp, -0.2, Y, -0.115, 0);
  box(cq, '#1f2328', 0, 0.012, 0, 0.03, 0.014, 0.018);
  box(cq, '#1f2328', -0.006, 0.026, 0, 0.016, 0.012, 0.018);
  for (const s of [-1, 1]) add(cq, CYL(10), mat('#3b2a1d'), s * 0.01, 0.009, 0.01, 0.018, 0.002, 0.018, 0, Math.PI / 2, 0);
  for (const s of [-1, 1]) { blob(cq, '#7a5236', 0.04, 0.014, s * 0.005, 0.012, 0.007, 0.004); cyl(cq, '#7a5236', 0.04, 0.0, s * 0.005, 0.002, 0.01, 4); }
};

/** Lathe surface (smooth normals) with per-face paint in local coordinates. */
function plathe(p: THREE.Object3D, prof: [number, number][], x: number, y: number, z: number, seg: number, base: string, paint?: Paint, o: MatOpts = {}): THREE.Mesh {
  const lg = new THREE.LatheGeometry(prof.map(([r, py]) => new THREE.Vector2(r, py)), seg);
  lg.computeVertexNormals();
  return add(p, paintFaces(lg, base, paint), mat('#ffffff', { vc: true, flat: false, ...o }), x, y, z, 1, 1, 1);
}
/** Light smooth tube along a Catmull-Rom curve (no end caps). */
function ctube(p: THREE.Object3D, pts: V3[], r: number, c: string, tub = 24, rad = 4): THREE.Mesh {
  const cv = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)));
  return add(p, new THREE.TubeGeometry(cv, tub, r, rad, false), mat(c, { flat: false }), 0, 0, 0, 1, 1, 1);
}
/** Painted sphere (smooth). */
function psphere(p: THREE.Object3D, r: number, x: number, y: number, z: number, ws: number, hs: number, base: string, paint?: Paint, o: MatOpts = {}): THREE.Mesh {
  const sg = new THREE.SphereGeometry(r, ws, hs);
  return add(p, paintFaces(sg, base, paint), mat('#ffffff', { vc: true, flat: false, ...o }), x, y, z, 1, 1, 1);
}

// ---- Nyhavn: canal of coloured gabled townhouses, moored wooden ships, cafés and the memorial anchor ----------
const NYC = ['#d9502f', '#f2b632', '#3e7cb1', '#e9853a', '#f3e3b8', '#7fb6a8', '#c75b3a', '#f1d77a', '#e9e2cf', '#b03a2e', '#5b8fc7', '#f4c58c'];
function ship(p: THREE.Object3D, x: number, y: number, z: number, L: number, hull: string, masts: number, seed: number): void {
  const q = grp(p, x, y, z, 0);
  const w = L * 0.24;
  const plan: [number, number][] = [[0, L / 2], [w * 0.45, L * 0.3], [w / 2, 0], [w * 0.45, -L * 0.38], [w * 0.3, -L / 2], [-w * 0.3, -L / 2], [-w * 0.45, -L * 0.38], [-w / 2, 0], [-w * 0.45, L * 0.3]];
  tbox(q, w * 0.7, L * 0.8, w, L * 0.98, L * 0.09, hull, 0, -L * 0.04, -L * 0.01);
  prism(q, plan, L * 0.05, L * 0.02, hull);
  prism(q, plan.map(([a, b]) => [a * 0.88, b * 0.9] as [number, number]), L * 0.07, L * 0.004, '#c9a47a');
  box(q, '#f1ece0', 0, L * 0.045, 0, w * 1.02, L * 0.008, L * 0.7);
  box(q, '#8a6a48', 0, L * 0.074, -L * 0.25, w * 0.55, L * 0.05, L * 0.16);
  rod(q, [0, L * 0.06, L * 0.45], [0, L * 0.1, L * 0.75], L * 0.008, '#6b4f36', 4);
  const tops: V3[] = [];
  for (let m = 0; m < masts; m++) {
    const mz = masts === 1 ? L * 0.08 : L * (0.22 - m * 0.36), mh = L * (masts === 1 ? 0.9 : 1.05 - m * 0.15);
    rod(q, [0, L * 0.07, mz], [0, mh, mz], L * 0.011, '#7a5a3c', 5);
    tops.push([0, mh, mz]);
    for (const yy of [0.55, 0.8]) {
      if (yy > 0.6 && masts === 1) continue;
      const ya = mh * yy;
      rod(q, [-w * 0.9, ya, mz], [w * 0.9, ya, mz], L * 0.006, '#6b4f36', 4);
      blob(q, '#efe8d6', 0, ya + L * 0.006, mz, w * 0.85, L * 0.01, L * 0.012);
    }
    for (const s of [-1, 1]) rod(q, [0, mh * 0.96, mz], [s * w * 0.5, L * 0.07, mz - L * 0.04], L * 0.0025, '#3b3127', 3);
    box(q, hash3(seed, m, 4) > 0.5 ? '#c8102e' : '#f1f1f1', 0.0, mh, mz, L * 0.003, L * 0.035, L * 0.05);
  }
  rod(q, tops[0], [0, L * 0.1, L * 0.75], L * 0.0025, '#3b3127', 3);
  if (tops.length > 1) rod(q, tops[1], [0, L * 0.08, -L * 0.48], L * 0.0025, '#3b3127', 3);
}
const nyhavn: Builder = gp => {
  const CW = 0.1, QW = 0.2, END = -0.34;
  const isWater = (x: number, z: number) => Math.abs(x) < CW && z > END;
  const hf: HFn = (x, z) => (isWater(x, z) ? -0.018 : 0);
  island(gp, 0.5, hf, '#9b938a', (x, y, z) => {
    if (y < 0.03) return rip('#2f6f7a', x, z);
    const ax = Math.abs(x);
    if (ax < QW && ax > CW - 0.005 && ax < CW + 0.006) return '#c9c2b4';
    const c = (Math.floor(x * 110) + Math.floor(z * 110)) % 2 ? '#a39a8e' : '#958c80';
    return hash3(Math.floor(x * 110), 5, Math.floor(z * 110)) > 0.88 ? '#b5ab9c' : c;
  }, { rings: 36, segs: 110, side: strataSide(['#7d766b', '#6e675d']) });
  const Y = 0.035;
  // Quay kerbs and bollards
  for (const s of [-1, 1]) {
    box(gp, '#d2ccc0', s * (CW + 0.003), Y - 0.004, (END + 0.42) / 2, 0.008, 0.006, 0.42 - END);
    for (let k = 0; k < 9; k++) cyl(gp, '#2b2f33', s * (CW + 0.01), Y, END + 0.04 + k * 0.08, 0.003, 0.01, 6);
  }
  box(gp, '#d2ccc0', 0, Y - 0.004, END - 0.003, CW * 2 + 0.01, 0.006, 0.008);
  const W = new Mesher();
  // Townhouses on both quays
  for (const s of [-1, 1]) {
    let z = -0.44, i = 0;
    while (z < 0.36) {
      const wz = 0.045 + hash3(i, s, 1) * 0.035, cz = z + wz / 2;
      const back = Math.min(0.36, Math.sqrt(Math.max(0, 0.25 - (Math.abs(cz) + wz / 2) ** 2)) - 0.012);
      z += wz + 0.001; i++;
      if (back - QW < 0.07) continue;
      const depth = back - QW, cx = s * (QW + depth / 2);
      const n = 3 + Math.floor(hash3(i, s, 2) * 3), H = 0.03 + n * 0.026;
      const col = NYC[Math.floor(hash3(i, s, 3) * NYC.length)], roof = hash3(i, s, 4) > 0.3 ? '#a8432c' : '#4a4f57';
      box(gp, col, cx, Y, cz, depth, H, wz);
      box(gp, shade(col, 0.88), s * (QW + 0.001), Y, cz, 0.004, 0.03, wz);
      box(gp, '#f5f1e8', s * (QW - 0.001), Y + H - 0.006, cz, 0.004, 0.005, wz + 0.002);
      const rows: number[] = []; for (let k = 0; k < n; k++) rows.push(0.038 + k * 0.026);
      const cols = Math.max(2, Math.round(wz / 0.016));
      W.windows([s * (QW - 0.0005), Y, cz], [0, 1], [-s, 0], cols, wz / (cols + 0.4), rows, 0.0075, 0.015, '#27323d', '#f6f2e8');
      W.windows([s * (QW - 0.0005), Y, cz], [0, 1], [-s, 0], 2, wz * 0.45, [0.006], 0.012, 0.02, '#3a2f28');
      W.windows([s * (back + 0.0005), Y, cz], [0, 1], [s, 0], cols, wz / (cols + 0.4), rows, 0.0075, 0.015, '#27323d', '#f6f2e8');
      if (cz + wz / 2 > 0.2) {
        const dc = Math.max(1, Math.round(depth / 0.018));
        W.windows([cx, Y, cz + wz / 2 + 0.0005], [1, 0], [0, 1], dc, depth / (dc + 0.4), rows, 0.0075, 0.015, '#27323d', '#f6f2e8');
      }
      if (hash3(i, s, 5) > 0.68) {
        gable(gp, depth + 0.004, 0.045, wz + 0.004, roof, cx, Y + H, cz, 0);
        const fx = s * (QW - 0.0015);
        W.tri([fx, Y + H, cz - wz / 2], [fx, Y + H, cz + wz / 2], [fx, Y + H + 0.045, cz], col, [-s, 0, 0]);
        W.rect([fx - s * 0.0008, Y + H + 0.01, cz], [0, 1], [-s, 0], 0.007, 0.012, '#27323d');
      } else {
        gable(gp, wz + 0.002, 0.04, depth + 0.006, roof, cx, Y + H, cz, Math.PI / 2);
        if (wz > 0.06) for (const dz of [-0.016, 0.016]) {
          const dx = s * (QW + 0.012);
          box(gp, '#f5f1e8', dx, Y + H + 0.008, cz + dz, 0.012, 0.014, 0.012);
          gable(gp, 0.016, 0.008, 0.014, roof, dx, Y + H + 0.022, cz + dz, Math.PI / 2);
          W.rect([dx - s * 0.0062, Y + H + 0.011, cz + dz], [0, 1], [-s, 0], 0.006, 0.008, '#27323d');
        }
      }
      if (hash3(i, s, 6) > 0.6) box(gp, '#7c6f66', cx + s * depth * 0.2, Y + H + 0.012, cz, 0.008, 0.02, 0.008);
    }
  }
  W.build(gp, { rough: 0.55 });
  // Café life on the sunny quay: awnings, umbrellas and tables
  for (let k = 0; k < 8; k++) {
    const z = -0.24 + k * 0.075, c = k % 2 ? '#e9e2cf' : '#c8102e';
    cyl(gp, '#555', 0.155, Y, z, 0.0015, 0.03, 4);
    cone(gp, c, 0.155, Y + 0.026, z, 0.026, 0.012, 8);
    for (const dz of [-0.014, 0.014]) cyl(gp, '#e9e2cf', 0.142, Y, z + dz, 0.005, 0.009, 6);
  }
  for (let k = 0; k < 6; k++) box(gp, k % 2 ? '#2f5d50' : '#b03a2e', -0.188, Y + 0.022, -0.2 + k * 0.1, 0.022, 0.003, 0.05, 0, 0, 0.5);
  crowd(gp, 18, 5, i => { const s = i % 3 === 0 ? -1 : 1, x = s * (0.115 + hash3(i, 1, 2) * 0.06), z = -0.3 + hash3(i, 2, 2) * 0.68; return [x, Y, z]; });
  // Wooden ships moored along both quays
  ship(gp, 0.058, Y - 0.02, -0.17, 0.22, '#1f2a36', 2, 1);
  ship(gp, -0.058, Y - 0.02, -0.02, 0.2, '#7b2d26', 2, 2);
  ship(gp, 0.058, Y - 0.02, 0.15, 0.18, '#2c4f6b', 1, 3);
  ship(gp, -0.058, Y - 0.02, 0.3, 0.16, '#f2efe6', 1, 4);
  ship(gp, -0.058, Y - 0.02, -0.22, 0.14, '#3a5a40', 1, 5);
  // Low footbridge and quay lamps
  box(gp, '#7d766b', 0, Y + 0.004, 0.42, CW * 2 + 0.02, 0.008, 0.035);
  for (const s of [-1, 1]) box(gp, '#3a3f45', 0, Y + 0.012, 0.42 + s * 0.016, CW * 2 + 0.02, 0.01, 0.002);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
    const z = -0.28 + k * 0.12, x = s * (CW + 0.03);
    cyl(gp, '#2b2f33', x, Y, z, 0.0015, 0.045, 4);
    blob(gp, '#fff1c2', x, Y + 0.047, z, 0.005);
  }
  // Memorial anchor at the canal head
  const az = END - 0.05;
  box(gp, '#9b938a', 0, Y, az, 0.05, 0.016, 0.04);
  rod(gp, [0, Y + 0.016, az], [0, Y + 0.09, az], 0.0035, '#2b2f33', 6);
  rod(gp, [-0.018, Y + 0.08, az], [0.018, Y + 0.08, az], 0.0025, '#2b2f33', 4);
  tube(gp, [[-0.03, Y + 0.035, az], [-0.02, Y + 0.018, az], [0, Y + 0.016, az], [0.02, Y + 0.018, az], [0.03, Y + 0.035, az]], 0.0035, 0.0035, '#2b2f33', { radial: 5, sub: 2 });
  add(gp, CYL(10), mat('#2b2f33'), 0, Y + 0.094, az, 0.012, 0.003, 0.012, 0, Math.PI / 2, 0);
};

// ---- Shah Mosque (Isfahan): tiled portal on Naqsh-e Jahan Square, skewed courtyard, turquoise onion dome ----
const TB = '#2c5f9e', TBL = '#4f86c2', TBD = '#1d3f6e', SAND = '#d8b98e';
const tilePaint = (base: string): Paint => (x, y, z) => {
  const h = Math.sin(x * 260 + Math.sin(y * 180) * 2) * Math.sin(y * 260 + z * 120);
  return h > 0.72 ? '#e8d9a8' : h < -0.75 ? shade(base, 0.82) : null;
};
function tiledBox(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, base = TB, ry = 0): void {
  const bg = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 0.016)), Math.max(1, Math.round(h / 0.016)), Math.max(1, Math.round(d / 0.016)));
  add(p, paintFaces(bg, base, tilePaint(base)), mat('#ffffff', { vc: true }), x, y + h / 2, z, 1, 1, 1, ry);
}
/** Iwan portal: tiled frame, pointed-arch niche with muqarnas hood, white calligraphy band. Front +z local. */
function iwan(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): void {
  const q = grp(p, x, y, z, ry);
  tiledBox(q, 0, 0, 0, w, h, d);
  box(q, '#f4f1e8', 0, h * 0.84, d / 2 + 0.001, w * 0.86, h * 0.035, 0.002);
  box(q, TBL, 0, 0, d / 2 + 0.0015, w * 0.9, h * 0.8, 0.002);
  const nw = w * 0.62, nh = h * 0.72;
  const sh = new THREE.Shape(archPath(0, 0, nw, nh, true).getPoints(16));
  const ng = new THREE.ShapeGeometry(sh, 8);
  add(q, ng, mat(TBD), 0, h * 0.04, d / 2 + 0.003, 1, 1, 1);
  for (let k = 0; k < 4; k++) {
    const t = k / 4, r = nw * (0.42 - t * 0.09);
    for (let j = 0; j < 7; j++) {
      const a = Math.PI * (j / 6);
      blob(q, k % 2 ? '#e8d9a8' : '#6aa8d8', Math.cos(a) * r, h * 0.04 + nh * (0.62 + t * 0.08) + Math.sin(a) * r * 0.5, d / 2 + 0.004 - t * 0.004, nw * 0.06, nw * 0.05, nw * 0.03);
    }
  }
  box(q, '#3b2a1d', 0, h * 0.04, d / 2 + 0.004, nw * 0.4, nh * 0.42, 0.002);
  for (const s of [-1, 1]) cyl(q, '#6aa8d8', s * w * 0.46, 0, d / 2, 0.004, h * 0.92, 8);
}
function persianMinaret(p: THREE.Object3D, x: number, y: number, z: number, h: number, r: number): void {
  plathe(p, [[r * 1.15, 0], [r * 1.1, h * 0.12], [r, h * 0.13], [r * 0.9, h * 0.8]], x, y, z, 12, TB, (px, py, pz) => {
    const a = Math.atan2(pz, px), b = Math.floor((py / h) * 30);
    return (Math.floor(a * 3) + b) % 3 === 0 ? '#e8d9a8' : b % 4 === 0 ? TBD : null;
  });
  plathe(p, [[r * 0.9, 0], [r * 1.5, h * 0.05], [r * 1.55, h * 0.065], [r * 0.95, h * 0.07], [r * 0.85, h * 0.16], [r * 1.0, h * 0.165], [r * 0.95, h * 0.19], [r * 0.6, h * 0.22], [0.0001, h * 0.25]], x, y + h * 0.8, z, 12, '#5aa9c9');
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; rod(p, [x + Math.cos(a) * r * 0.85, y + h * 0.88, z + Math.sin(a) * r * 0.85], [x + Math.cos(a) * r * 0.85, y + h * 0.95, z + Math.sin(a) * r * 0.85], r * 0.08, '#f1ead8', 3); }
  rod(p, [x, y + h * 1.04, z], [x, y + h * 1.09, z], r * 0.1, '#d9b44a', 4);
}
function arcadeWing(p: THREE.Object3D, W: Mesher, x0: number, x1: number, z: number, h: number, d: number): void {
  const w = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
  box(p, SAND, cx, 0.035, z, w, h, d);
  box(p, shade(SAND, 0.92), cx, 0.035 + h, z, w + 0.002, 0.004, d + 0.002);
  const n = Math.round(w / 0.03);
  W.windows([cx, 0.035, z + d / 2], [1, 0], [0, 1], n, w / n, [0.006, 0.04], 0.018, 0.02, '#5c4636', undefined, true);
  W.windows([cx, 0.035, z + d / 2], [1, 0], [0, 1], n, w / n, [0.034], 0.022, 0.003, TB);
}
const shahmosque: Builder = gp => {
  const Y = 0.035;
  island(gp, 0.5, (x, z) => (Math.abs(x) < 0.2 && z > 0.27 && z < 0.4 ? -0.012 : 0), '#d6c6a4', (x, y, z) => {
    if (y < 0.03) return rip('#3d8fb0', x, z);
    if (z > 0.2 && Math.abs(x) > 0.24) return grass(x, z, '#5f9a4a', '#73ac58');
    if (Math.abs(Math.abs(x) - 0.22) < 0.012 && z > 0.2) return '#bfae8a';
    return hash3(Math.floor(x * 80), 2, Math.floor(z * 80)) > 0.85 ? '#cdbd9a' : '#dccdae';
  }, { rings: 30, segs: 100, side: strataSide(['#b29a72', '#9e8762']) });
  const W = new Mesher();
  // Square arcades flanking the portal
  arcadeWing(gp, W, -0.45, -0.1, 0.1, 0.075, 0.05);
  arcadeWing(gp, W, 0.1, 0.42, 0.1, 0.075, 0.05);
  // Entrance portal with two minarets
  const PZ = 0.13;
  iwan(gp, 0, Y, PZ, 0.15, 0.24, 0.06);
  for (const s of [-1, 1]) persianMinaret(gp, s * 0.068, Y + 0.24, PZ - 0.005, 0.2, 0.012);
  for (const s of [-1, 1]) blob(gp, SAND, s * 0.12, Y + 0.075, 0.03, 0.06, 0.05, 0.06);
  // Courtyard complex turned towards Mecca
  const cg = grp(gp, -0.02, Y, -0.17, -0.6);
  box(cg, '#e3d4b8', 0, 0, 0.02, 0.3, 0.003, 0.2);
  add(cg, CYL(4), mat('#3d8fb0', { rough: 0.2 }), 0, 0.003, 0.03, 0.07, 0.002, 0.045, Math.PI / 4);
  for (const s of [-1, 1]) for (const t of [-1, 1]) topiary(cg, s * 0.09, 0, 0.03 + t * 0.06, 0.03, '#3f7a35');
  const CW2 = new Mesher();
  box(cg, SAND, 0, 0, 0.125, 0.32, 0.075, 0.02);
  CW2.windows([0, 0, 0.1149], [-1, 0], [0, -1], 9, 0.032, [0.006, 0.04], 0.02, 0.026, '#5c4636', undefined, true);
  CW2.windows([0, 0, 0.1351], [1, 0], [0, 1], 9, 0.032, [0.006, 0.04], 0.02, 0.026, '#5c4636', undefined, true);
  for (const s of [-1, 1]) {
    box(cg, SAND, s * 0.15, 0, 0.02, 0.02, 0.075, 0.2);
    CW2.windows([s * 0.1399, 0, 0.02], [0, s], [-s, 0], 6, 0.032, [0.006, 0.04], 0.02, 0.026, '#5c4636', undefined, true);
    iwan(cg, s * 0.15, 0, 0.02, 0.07, 0.12, 0.04, -s * Math.PI / 2);
    box(cg, SAND, s * 0.1, 0, -0.17, 0.1, 0.09, 0.16);
    plathe(cg, [[0.042, 0], [0.04, 0.02], [0.028, 0.038], [0.0001, 0.047]], s * 0.1, 0.09, -0.17, 16, '#cfae80');
  }
  CW2.build(cg, { rough: 0.6 });
  iwan(cg, 0, 0, -0.08, 0.14, 0.21, 0.05, 0);
  for (const s of [-1, 1]) persianMinaret(cg, s * 0.062, 0.21, -0.085, 0.2, 0.011);
  // Drum and the great double-shell turquoise dome
  const DZ = -0.19;
  tiledBox(cg, 0, 0, DZ, 0.17, 0.15, 0.16, SAND);
  plathe(cg, [[0.085, 0], [0.085, 0.07]], 0, 0.15, DZ, 24, TB, tilePaint(TB));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    box(cg, k % 2 ? TBD : '#f4f1e8', Math.cos(a) * 0.0855, 0.165 + (k % 2 ? 0 : 0.04), DZ + Math.sin(a) * 0.0855, 0.014, k % 2 ? 0.032 : 0.004, 0.002, Math.PI / 2 - a);
  }
  const R = 0.095;
  const prof: [number, number][] = [[R * 0.9, 0], [R * 1.04, R * 0.25], [R * 1.08, R * 0.5], [R * 1.03, R * 0.78], [R * 0.86, R * 1.03], [R * 0.6, R * 1.25], [R * 0.3, R * 1.42], [R * 0.08, R * 1.52], [0.0001, R * 1.55]];
  plathe(cg, prof, 0, 0.22, DZ, 40, '#45a9c0', (x, y, z) => {
    const a = Math.atan2(z, x), t = y / (R * 1.5);
    if (t < 0.1) return '#f4f1e8';
    const sw = Math.sin(a * 16 + Math.sin(t * 9) * 2.2) * Math.cos(t * 26);
    if (sw > 0.82) return '#efe2a2';
    if (Math.abs(sw) < 0.06) return '#1f6f8f';
    return t > 0.7 ? '#4cb3c6' : null;
  }, { rough: 0.35 });
  rod(cg, [0, 0.22 + R * 1.52, DZ], [0, 0.22 + R * 1.52 + 0.04, DZ], 0.003, '#d9b44a', 5);
  blob(cg, '#d9b44a', 0, 0.22 + R * 1.52 + 0.016, DZ, 0.006);
  W.build(gp, { rough: 0.6 });
  // Square life: lawns with trees, horse carriages, strollers
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) topiary(gp, s * (0.26 + (k % 2) * 0.05), Y, 0.22 + Math.floor(k / 2) * 0.07, 0.05, '#3f7a35');
  crowd(gp, 16, 12, i => { const x = (hash3(i, 3, 1) - 0.5) * 0.4, z = 0.17 + hash3(i, 4, 1) * 0.08; return [x, Y, z]; });
  const cq = grp(gp, 0.12, Y, 0.43, 0);
  box(cq, '#6b3f2a', 0, 0.01, 0, 0.03, 0.014, 0.02);
  for (const s of [-1, 1]) add(cq, CYL(10), mat('#3b2a1d'), 0.0, 0.01, s * 0.012, 0.018, 0.002, 0.018, 0, Math.PI / 2, 0);
  blob(cq, '#f1ede4', -0.035, 0.016, 0, 0.012, 0.008, 0.005);
  for (const s of [-1, 1]) cyl(cq, '#f1ede4', -0.035, 0, s * 0.003, 0.002, 0.012, 4);
};

// ---- Faisal Mosque: Bedouin-tent prayer hall of folded white facets, four pencil minarets, Margalla Hills ----
function pencilMinaret(p: THREE.Object3D, x: number, y: number, z: number, h: number, r: number): void {
  add(p, CYL(4), mat('#d9d4c8'), x, y + h * 0.02, z, r * 3.2, h * 0.04, r * 3.2, Math.PI / 4);
  plathe(p, [[r * 1.15, 0], [r, h * 0.62], [r * 0.95, h * 0.63]], x, y + h * 0.04, z, 4, '#efece4', (px, py, pz) => (Math.abs(Math.abs(px) - Math.abs(pz)) < r * 0.08 ? '#d4cfc2' : py > h * 0.3 && py < h * 0.31 ? '#c9c2b2' : null), { flat: true });
  cyl(p, '#e6e1d6', x, y + h * 0.66, z, r * 1.35, h * 0.012, 8);
  cyl(p, '#6f8899', x, y + h * 0.672, z, r * 0.9, h * 0.02, 8);
  cyl(p, '#e6e1d6', x, y + h * 0.692, z, r * 1.25, h * 0.008, 8);
  cone(p, '#f3f1ea', x, y + h * 0.7, z, r * 0.95, h * 0.3, 4, Math.PI / 4);
  rod(p, [x, y + h * 0.99, z], [x, y + h * 1.03, z], r * 0.12, '#d9b44a', 4);
}
const faisal: Builder = gp => {
  const hf: HFn = (x, z) => {
    const back = sstep(-0.18, -0.42, z);
    return back * (0.09 + 0.05 * qn(x * 5, 1, z * 5) + 0.04 * Math.sin(x * 9));
  };
  const G = onGround(hf);
  island(gp, 0.5, hf, '#d7d2c6', (x, y, z) => {
    if (y > 0.05) return mix('#3f6b34', '#5b8a44', qn(x * 9, y * 9, z * 9));
    const ax = Math.abs(x);
    if (ax < 0.17 && z > 0.12 && z < 0.4) return (Math.floor(x * 60) + Math.floor(z * 60)) % 2 ? '#e3ded2' : '#d6d0c2';
    if (z < -0.18 || ax > 0.3) return grass(x, z, '#6a9a4c', '#7fae58');
    return '#cfc9bb';
  }, { rings: 34, segs: 90, side: strataSide(['#8c7a62', '#7a6a55']) });
  const Y = 0.035, a = 0.14, HC = Y + 0.035, HA = Y + 0.155, HT = Y + 0.215, IN = 0.035;
  // Raised platform
  box(gp, '#e9e5dc', 0, Y, -0.02, a * 2 + 0.05, 0.022, a * 2 + 0.05);
  const C: V3[] = [[-a, HC, a], [a, HC, a], [a, HC, -a], [-a, HC, -a]].map(([x, y, z]) => [x, y, z - 0.02] as V3);
  const T: V3 = [0, HT, -0.02];
  const M = new Mesher();
  box(gp, '#d8d3c7', 0, Y + 0.022, -0.02, a * 2 - 0.004, HC - Y - 0.022, a * 2 - 0.004);
  for (let i = 0; i < 4; i++) {
    const c0 = C[i], c1 = C[(i + 1) % 4];
    const mx = (c0[0] + c1[0]) / 2, mz = (c0[2] + c1[2]) / 2;
    const dx = T[0] - mx, dz = T[2] - mz, dl = Math.hypot(dx, dz);
    const A: V3 = [mx + (dx / dl) * IN, HA, mz + (dz / dl) * IN];
    const out: V3 = [-dx / dl, 0.25, -dz / dl];
    // roof facets
    M.tri(c0, A, T, i % 2 ? '#e4e2dc' : '#d6d4ce', [out[0], 1, out[2]]);
    M.tri(A, c1, T, i % 2 ? '#d6d4ce' : '#e4e2dc', [out[0], 1, out[2]]);
    // gable: white rim, glazed inset with vertical fins
    M.tri(c0, c1, A, '#f4f2ec', out);
    const k = 0.84, ctr: V3 = [(c0[0] + c1[0] + A[0]) / 3, (c0[1] + c1[1] + A[1]) / 3, (c0[2] + c1[2] + A[2]) / 3];
    const sh = (q: V3): V3 => [ctr[0] + (q[0] - ctr[0]) * k - (dx / dl) * 0.0015, ctr[1] + (q[1] - ctr[1]) * k, ctr[2] + (q[2] - ctr[2]) * k - (dz / dl) * 0.0015];
    const g0 = sh(c0), g1 = sh(c1), gA = sh(A);
    M.tri(g0, g1, gA, '#e7a868', out);
    const ux = c1[0] - c0[0], uz = c1[2] - c0[2];
    for (let f = 1; f < 14; f++) {
      const t = f / 14, bx = g0[0] + (g1[0] - g0[0]) * t, bz = g0[2] + (g1[2] - g0[2]) * t;
      const top = gA[1] - (gA[1] - g0[1]) * Math.abs(t - 0.5) * 2;
      const nb = -0.0028;
      const by = g0[1], lean = (top - by) / (gA[1] - g0[1]);
      const tx = bx + (gA[0] - (g0[0] + g1[0]) / 2) * lean, tz = bz + (gA[2] - (g0[2] + g1[2]) / 2) * lean;
      const w2 = 0.002, wx = (ux / Math.hypot(ux, uz)) * w2, wz = (uz / Math.hypot(ux, uz)) * w2;
      M.quad([bx - wx + (dx / dl) * nb, by, bz - wz + (dz / dl) * nb], [bx + wx + (dx / dl) * nb, by, bz + wz + (dz / dl) * nb], [tx + wx + (dx / dl) * nb, top, tz + wz + (dz / dl) * nb], [tx - wx + (dx / dl) * nb, top, tz - wz + (dz / dl) * nb], '#fbf4e4', out);
    }
    // corner ridge stair line
    rod(gp, A, T, 0.0025, '#b9b6ae', 4);
  }
  M.build(gp, { rough: 0.45, flat: true });
  rod(gp, T, [T[0], T[1] + 0.035, T[2]], 0.003, '#d9b44a', 4);
  tube(gp, [[0, T[1] + 0.032, T[2] - 0.006], [0, T[1] + 0.042, T[2]], [0, T[1] + 0.032, T[2] + 0.006]], 0.0018, 0.0018, '#d9b44a', { radial: 4, sub: 2 });
  // Four minarets at the corners of the precinct
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) pencilMinaret(gp, sx * 0.25, Y, sz * 0.2 - 0.02, 0.42, 0.016);
  // Courtyard: porticoes, pool and fountain
  for (const s of [-1, 1]) {
    box(gp, '#f0ede6', s * 0.2, Y + 0.035, 0.24, 0.03, 0.006, 0.26);
    for (let k = 0; k < 8; k++) cyl(gp, '#e2ded4', s * 0.2, Y, 0.125 + k * 0.033, 0.0035, 0.035, 5);
  }
  box(gp, '#f0ede6', 0, Y + 0.035, 0.38, 0.43, 0.006, 0.03);
  for (let k = 0; k < 11; k++) cyl(gp, '#e2ded4', -0.18 + k * 0.036, Y, 0.38, 0.0035, 0.035, 5);
  box(gp, '#c9c3b5', 0, Y, 0.25, 0.12, 0.006, 0.2);
  box(gp, '#4b9cc0', 0, Y + 0.0015, 0.25, 0.11, 0.006, 0.19);
  cyl(gp, '#e9f5fb', 0, Y + 0.006, 0.25, 0.004, 0.02, 6);
  crowd(gp, 22, 8, i => { const x = (hash3(i, 1, 8) - 0.5) * 0.34, z = 0.13 + hash3(i, 2, 8) * 0.22; return Math.abs(x) < 0.07 && z > 0.14 && z < 0.36 ? null : [x, Y, z]; });
  // Margalla Hills forest and garden trees
  scatter(70, 21, (x, z) => { if (z < -0.24) pine(gp, x, G(x, z), z, 0.05 + hash3(x * 50, z * 50, 1) * 0.03, '#2f5a32'); }, 0.47);
  for (let k = 0; k < 10; k++) for (const s of [-1, 1]) leafTree(gp, s * (0.33 + (k % 2) * 0.05), Y, -0.15 + k * 0.05, 0.045, '#4f8a3a', k);
};

// ---- Baiterek: white “tree of life” tower cradling a golden sphere, on Astana's Nurzhol Boulevard ----------
const baiterek: Builder = gp => {
  island(gp, 0.5, () => 0, '#d9d5cc', (x, _y, z) => {
    const ax = Math.abs(x);
    if (ax > 0.07 && ax < 0.13) return grass(x, z, '#5f9a4a', '#73ac58');
    if (ax > 0.2) return '#5a5f66';
    if (ax > 0.17) return '#cfcac0';
    return (Math.floor(x * 50) + Math.floor(z * 50)) % 2 ? '#e2ded6' : '#d3cfc6';
  }, { rings: 30, segs: 80, side: strataSide(['#8d8a83', '#7a776f']) });
  const Y = 0.035;
  // Stepped plinth and pools around the base
  cyl(gp, '#cfc9bc', 0, Y, 0, 0.11, 0.008, 24);
  cyl(gp, '#e4dfd4', 0, Y + 0.008, 0, 0.085, 0.008, 24);
  cyl(gp, '#bfe2ee', 0, Y + 0.004, 0, 0.1, 0.0052, 24);
  cyl(gp, '#f2efe8', 0, Y + 0.016, 0, 0.06, 0.012, 20);
  const B = Y + 0.028, NR = 18, TW = 0.9;
  const prof: [number, number][] = [[0.05, 0], [0.034, 0.04], [0.02, 0.1], [0.016, 0.17], [0.017, 0.21], [0.03, 0.245], [0.055, 0.27], [0.07, 0.3], [0.072, 0.33], [0.06, 0.365], [0.035, 0.39]];
  for (let i = 0; i < NR; i++) {
    const a0 = (i / NR) * Math.PI * 2;
    const pts: V3[] = prof.map(([r, y], k) => { const a = a0 + (k / prof.length) * TW * (i % 2 ? 1 : -1); return [Math.cos(a) * r, B + y, Math.sin(a) * r]; });
    ctube(gp, pts, 0.0034, '#f7f6f2', 30, 4);
  }
  cyl(gp, '#eeece6', 0, B, 0, 0.014, 0.23, 10);
  for (let k = 0; k < 3; k++) cyl(gp, '#f7f6f2', 0, B + 0.07 + k * 0.05, 0, 0.022, 0.004, 12);
  // Golden glass sphere
  const SR = 0.058, SY = B + 0.315;
  psphere(gp, SR, 0, SY, 0, 28, 20, '#e0b23c', (x, y, z) => {
    const a = Math.atan2(z, x), e = Math.asin(Math.max(-1, Math.min(1, y / SR)));
    const fa = (a / (Math.PI * 2)) * 24, fe = (e / Math.PI) * 14;
    if (Math.abs(fa - Math.round(fa)) < 0.08 || Math.abs(fe - Math.round(fe)) < 0.08) return '#8a6a2a';
    return hash3(Math.floor(fa), Math.floor(fe), 3) > 0.7 ? '#f3d27a' : null;
  }, { rough: 0.25, metal: 0.6 });
  // Boulevard: tree rows, fountains, lamps, people
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) {
    const z = -0.42 + k * 0.105;
    if (Math.abs(z) < 0.08) continue;
    leafTree(gp, s * 0.1, Y, z, 0.05, k % 3 ? '#4f8a3a' : '#d9a23a', k);
    cyl(gp, '#3a3f45', s * 0.155, Y, z + 0.05, 0.0018, 0.06, 4);
    blob(gp, '#fff1c2', s * 0.155, Y + 0.062, z + 0.05, 0.005);
  }
  for (const z of [-0.22, 0.22, 0.36]) {
    cyl(gp, '#bfb9ac', 0, Y, z, 0.04, 0.008, 16);
    cyl(gp, '#7ec8e3', 0, Y + 0.002, z, 0.036, 0.0065, 16);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; cone(gp, '#e9f6fb', Math.cos(a) * 0.022, Y + 0.008, z + Math.sin(a) * 0.022, 0.003, 0.02, 5); }
    cone(gp, '#e9f6fb', 0, Y + 0.008, z, 0.005, 0.035, 6);
  }
  crowd(gp, 26, 14, i => { const x = (hash3(i, 1, 14) - 0.5) * 0.12, z = (hash3(i, 2, 14) - 0.5) * 0.85; return Math.hypot(x, z) < 0.12 || Math.abs(Math.abs(z) - 0.22) < 0.05 ? null : [x, Y, z]; });
  // Astana skyline: Khan Shatyr tent, golden twin towers, blue-domed Ak Orda
  const W = new Mesher();
  const tower = (x: number, z: number, w: number, h: number, c: string) => {
    box(gp, c, x, Y, z, w, h, w);
    for (const [u, n] of [[[1, 0], [0, 1]], [[0, -1], [1, 0]]] as [[number, number], [number, number]][]) {
      const o: V3 = [x + n[0] * (w / 2), Y, z + n[1] * (w / 2)];
      const rows: number[] = []; for (let y = 0.02; y < h - 0.01; y += 0.018) rows.push(y);
      W.windows(o, u, n, Math.max(2, Math.round(w / 0.014)), w / Math.max(2, Math.round(w / 0.014) + 0.3), rows, 0.008, 0.01, shade(c, 0.75));
    }
  };
  tower(-0.3, -0.16, 0.06, 0.24, '#2f8f8c');
  tower(-0.3, -0.03, 0.06, 0.24, '#2f8f8c');
  tower(0.3, -0.22, 0.07, 0.2, '#3c7fa8');
  tower(0.31, 0.1, 0.06, 0.13, '#d8c9a8');
  tower(-0.29, 0.14, 0.07, 0.11, '#e3d7bd');
  for (const s of [-1, 1]) { cyl(gp, '#d9a23a', s * 0.06, Y, -0.38, 0.018, 0.16, 12); cone(gp, '#d9a23a', s * 0.06, Y + 0.16, -0.38, 0.018, 0.03, 12); }
  add(gp, CYL(14), mat('#e3e1da', { rough: 0.3 }), 0.24, Y + 0.08, -0.36, 0.06, 0.16, 0.05, 0, 0, -0.35);
  cone(gp, '#d8d4c8', 0.22, Y, -0.38, 0.07, 0.17, 16);
  box(gp, '#f1ede4', 0, Y, 0.43, 0.14, 0.04, 0.05);
  cyl(gp, '#f1ede4', 0, Y + 0.04, 0.43, 0.022, 0.012, 14);
  plathe(gp, [[0.024, 0], [0.024, 0.01], [0.018, 0.024], [0.0001, 0.032]], 0, Y + 0.052, 0.43, 16, '#3b8fc9');
  rod(gp, [0, Y + 0.084, 0.43], [0, Y + 0.105, 0.43], 0.0015, '#d9b44a', 4);
  W.build(gp, { rough: 0.3 });
  for (let k = 0; k < 12; k++) {
    const s = k % 2 ? 1 : -1, z = -0.4 + hash3(k, 3, 9) * 0.8, x = s * (0.215 + (k % 4 < 2 ? 0 : 0.03));
    if (Math.hypot(x, z) > 0.46) continue;
    const c = PCOL[k % 8];
    box(gp, c, x, Y, z, 0.016, 0.008, 0.03);
    box(gp, shade(c, 0.8), x, Y + 0.008, z - 0.002, 0.014, 0.006, 0.016);
  }
};

/** Many identical columns merged into one mesh. */
function colonnade(p: THREE.Object3D, pts: [number, number][], y: number, r: number, h: number, c: string, seg = 6): THREE.Mesh {
  const parts = pts.map(([x, z]) => new THREE.CylinderGeometry(r, r * 1.1, h, seg, 1, true).translate(x, y + h / 2, z));
  const m = add(p, mergeGeometries(parts), mat(c), 0, 0, 0, 1, 1, 1);
  parts.forEach(q => q.dispose());
  return m;
}
/** Wall segments around a closed polygon (plan [x,z]); optional merlons. */
function wallLoop(p: THREE.Object3D, pts: [number, number][], y: number, h: number, t: number, c: string, mer?: string, skip: number[] = []): void {
  for (let i = 0; i < pts.length; i++) {
    if (skip.includes(i)) continue;
    const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    box(p, i % 2 ? c : shade(c, 0.96), (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, len + t, h, t, -Math.atan2(b[1] - a[1], b[0] - a[0]));
    if (mer) merlons(p, a, b, y + h, mer, 0.024, 0.011, 0.011, t * 1.05);
  }
}
const xf = (pl: [number, number][], ang: number, tx: number, tz: number): [number, number][] =>
  pl.map(([x, z]) => [tx + x * Math.cos(ang) - z * Math.sin(ang), tz + x * Math.sin(ang) + z * Math.cos(ang)]);
function cannon(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s = 1): void {
  const q = grp(p, x, y, z, ry);
  box(q, '#5b4129', 0, 0, 0, 0.012 * s, 0.006 * s, 0.016 * s);
  for (const k of [-1, 1]) add(q, CYL(8), mat('#3b2a1d'), k * 0.0068 * s, 0.004 * s, 0.003 * s, 0.009 * s, 0.002 * s, 0.009 * s, 0, 0, Math.PI / 2);
  rod(q, [0, 0.008 * s, -0.008 * s], [0, 0.009 * s, 0.022 * s], 0.0032 * s, '#2a2b2d', 6);
}
function ballPile(p: THREE.Object3D, x: number, y: number, z: number, n: number, r = 0.0035): void {
  for (let l = 0; l < n; l++) for (let i = 0; i < n - l; i++) for (let j = 0; j < n - l; j++)
    blob(p, '#2e2f31', x + (i - (n - l - 1) / 2) * r * 2, y + r + l * r * 1.45, z + (j - (n - l - 1) / 2) * r * 2, r);
}
function sheep(p: THREE.Object3D, x: number, y: number, z: number, ry: number): void {
  blob(p, '#f2efe6', x, y + 0.007, z, 0.008, 0.0055, 0.0055, ry);
  blob(p, '#2b2622', x + Math.cos(ry) * 0.009, y + 0.009, z - Math.sin(ry) * 0.009, 0.0032, 0.003, 0.0028, ry);
}

// ---- Gergeti Trinity Church: stone church and bell tower high on a ridge beneath snowy Mount Kazbek ---------
const gergeti: Builder = gp => {
  const hill = (x: number, z: number) => 0.2 * Math.exp(-((x + 0.04) ** 2 / 0.03 + (z - 0.05) ** 2 / 0.02));
  const mtn = (x: number, z: number) => 0.42 * Math.exp(-((x - 0.08) ** 2 / 0.035 + (z + 0.4) ** 2 / 0.02));
  const hf: HFn = (x, z) => {
    const top = Math.min(hill(x, z), 0.14);
    return Math.max(top, mtn(x, z) + 0.05 * qn(x * 7, 2, z * 7) * sstep(-0.1, -0.3, z), 0.03 * sstep(-0.05, -0.3, z)) + 0.012 * qn(x * 9, 0, z * 9);
  };
  const G = onGround(hf);
  island(gp, 0.5, hf, '#6c9a48', (x, y, z, _nx, ny) => {
    if (y > 0.3 + qn(x * 12, 0, z * 12) * 0.04) return ny > 0.55 ? '#f7f9fb' : '#dfe6ec';
    if (y > 0.2) return ny < 0.7 ? '#7d7570' : mix('#8a8378', '#b5c0c8', qn(x * 20, y * 10, z * 20));
    if (ny < 0.72) return hash3(Math.floor(x * 90), Math.floor(y * 90), Math.floor(z * 90)) > 0.5 ? '#8b7f70' : '#a39684';
    return grass(x, z, '#6a9a48', '#86b25a');
  }, { rings: 32, segs: 96, side: strataSide(['#7c6e5e', '#6b5f51', '#8a7c6b']) });
  const cx = -0.04, cz = 0.05, Y = 0.035 + 0.14;
  // Stone enclosure wall
  const encl: [number, number][] = [[-0.2, -0.04], [0.11, -0.06], [0.14, 0.12], [-0.17, 0.15]];
  wallLoop(gp, encl, Y - 0.004, 0.018, 0.008, '#8e7660');
  const church = grp(gp, cx - 0.03, Y, cz + 0.02, 0.1);
  church.scale.setScalar(1.5);
  const ST = '#a5876c', SL = '#5a5550';
  box(church, ST, 0, 0, 0, 0.13, 0.065, 0.065);
  gable(church, 0.134, 0.028, 0.072, SL, 0, 0.065, 0, 0);
  box(church, shade(ST, 0.95), 0.0, 0, 0, 0.07, 0.07, 0.105);
  gable(church, 0.076, 0.028, 0.11, SL, 0, 0.07, 0, Math.PI / 2);
  cyl(church, ST, -0.065, 0, 0, 0.026, 0.05, 10);
  cone(church, SL, -0.065, 0.05, 0, 0.028, 0.022, 10);
  const W = new Mesher();
  for (const s of [-1, 1]) W.windows([s * 0.066, 0, 0], [0, 1], [s, 0], 1, 0, [0.03], 0.008, 0.018, '#2a221c', undefined, true);
  W.windows([0, 0, 0.0526], [1, 0], [0, 1], 1, 0, [0.004], 0.014, 0.03, '#3a2c22', undefined, true);
  W.windows([0, 0, 0.0526], [1, 0], [0, 1], 1, 0, [0.06], 0.008, 0.012, '#2a221c', undefined, true);
  W.windows([0.045, 0, 0.0331], [1, 0], [0, 1], 1, 0, [0.03], 0.008, 0.016, '#2a221c', undefined, true);
  W.windows([-0.045, 0, 0.0331], [1, 0], [0, 1], 1, 0, [0.03], 0.008, 0.016, '#2a221c', undefined, true);
  // Drum with conical slate cap and cross
  plathe(church, [[0.026, 0], [0.026, 0.055]], 0, 0.07, 0, 8, ST, (x, y, z) => (y > 0.042 || y < 0.01 ? null : Math.abs(Math.atan2(z, x) * 4 / Math.PI % 1) < 0.18 && y > 0.02 && y < 0.04 ? '#2a221c' : null), { flat: true });
  cyl(church, shade(ST, 0.9), 0, 0.125, 0, 0.029, 0.004, 8);
  cone(church, SL, 0, 0.129, 0, 0.03, 0.045, 8);
  rod(church, [0, 0.172, 0], [0, 0.196, 0], 0.0018, '#d9b44a', 4);
  rod(church, [-0.007, 0.188, 0], [0.007, 0.188, 0], 0.0016, '#d9b44a', 4);
  // Bell tower
  const bt = grp(gp, cx + 0.115, Y, cz + 0.06, 0.1);
  bt.scale.setScalar(1.4);
  box(bt, ST, 0, 0, 0, 0.042, 0.06, 0.042);
  box(bt, shade(ST, 0.92), 0, 0.06, 0, 0.046, 0.005, 0.046);
  box(bt, ST, 0, 0.065, 0, 0.036, 0.035, 0.036);
  for (const [u, n] of [[[1, 0], [0, 1]], [[0, -1], [1, 0]], [[-1, 0], [0, -1]], [[0, 1], [-1, 0]]] as [[number, number], [number, number]][])
    W.windows([bt.position.x + n[0] * 0.0181, Y + 0.065, bt.position.z + n[1] * 0.0181], u, n, 1, 0, [0.008], 0.014, 0.016, '#241c16', undefined, true);
  W.windows([bt.position.x, Y, bt.position.z + 0.0211], [1, 0], [0, 1], 1, 0, [0.002], 0.014, 0.026, '#3a2c22', undefined, true);
  hip(bt, SL, 0, 0.1, 0, 0.04, 0.04, 0.03);
  rod(bt, [0, 0.128, 0], [0, 0.145, 0], 0.0016, '#d9b44a', 4);
  W.build(gp, { rough: 0.8 });
  // Winding path up the ridge with pilgrims and 4x4s
  const path: V3[] = [];
  for (let k = 0; k <= 22; k++) {
    const t = k / 22, x = 0.38 - t * 0.36 + Math.sin(t * 7) * 0.06, z = 0.35 - t * 0.2;
    path.push([x, G(x, z) + 0.006, z]);
  }
  ctube(gp, path, 0.0055, '#cdbf9f', 60, 3);
  crowd(gp, 10, 31, i => { const q = path[2 + i * 2]; return q ? [q[0] + 0.006, q[1] - 0.004, q[2]] : null; });
  for (const [k, c] of [[6, '#f1f1f1'], [15, '#d9d9d9']] as [number, string][]) {
    const q = path[k];
    box(gp, c, q[0], q[1] - 0.003, q[2] - 0.012, 0.02, 0.012, 0.012, 0.6);
    box(gp, '#3b4652', q[0], q[1] + 0.009, q[2] - 0.012, 0.012, 0.006, 0.0115, 0.6);
  }
  // Sheep and pines on the slopes, a few village roofs below
  scatter(16, 41, (x, z, i) => { if (z > 0.15 && x < 0.1) sheep(gp, x, G(x, z), z, i); }, 0.44);
  scatter(40, 42, (x, z) => { if (z > -0.2 && Math.hypot(x - cx, z - cz) > 0.17 && x > 0.12) pine(gp, x, G(x, z), z, 0.04, '#335f37'); }, 0.46);
  for (let k = 0; k < 6; k++) {
    const x = 0.2 + (k % 3) * 0.06, z = 0.3 + Math.floor(k / 3) * 0.06 - (k % 3) * 0.03, y = G(x, z);
    box(gp, '#d9cdb8', x, y, z, 0.03, 0.022, 0.024, 0.3);
    gable(gp, 0.034, 0.014, 0.028, k % 2 ? '#a33f2c' : '#5a6b7b', x, y + 0.022, z, 0.3);
  }
};

// ---- Fort Jesus (Mombasa): ochre Portuguese fort with arrowhead bastions on a coral ridge over the sea -------
const fortjesus: Builder = gp => {
  const hf: HFn = (x, z) => {
    const r = Math.hypot(x * 0.9, z);
    const land = 1 - sstep(0.24, 0.3, z + Math.max(0, -x) * 0.25 + (r > 0.44 ? 0.2 : 0));
    return 0.045 * land - 0.02 * (1 - land);
  };
  const G = onGround(hf);
  island(gp, 0.5, hf, '#c9b088', (x, y, z, _nx, ny) => {
    if (y < 0.03) return rip('#2f8fa0', x, z);
    if (ny < 0.7) return hash3(Math.floor(x * 120), Math.floor(y * 120), Math.floor(z * 120)) > 0.6 ? '#b49b74' : '#cdb48a';
    if (Math.abs(x) < 0.2 && z > -0.22 && z < 0.24) return '#c7a97a';
    return grass(x, z, '#6e9442', '#86a84c');
  }, { rings: 34, segs: 100, side: strataSide(['#c2a77d', '#ad9068', '#cdb48c']) });
  const Y = 0.035 + 0.045, H = 0.085, T = 0.014, OC = '#d9a066', OD = '#b97b44';
  // Main curtain walls and four arrowhead bastions
  const x0 = 0.14, z0 = -0.17, z1 = 0.12;
  const body: [number, number][] = [[-x0, z0], [x0, z0], [x0, z1], [-x0, z1]];
  box(gp, '#c9a777', 0, Y, (z0 + z1) / 2, x0 * 2, 0.004, z1 - z0);
  wallLoop(gp, body, Y, H, T, OC, OD);
  const arrow: [number, number][] = [[0.1, 0], [0.04, 0.062], [0.034, 0.038], [-0.018, 0.036], [-0.018, -0.036], [0.034, -0.038], [0.04, -0.062]];
  for (const [sx, sz, zc] of [[-1, -1, z0], [1, -1, z0], [1, 1, z1], [-1, 1, z1]] as [number, number, number][]) {
    const ang = Math.atan2(sz, sx), pl = xf(arrow, -ang, sx * x0, zc).map(([a, b]) => [a, b] as [number, number]);
    prism(gp, pl, Y, H + 0.008, OC);
    for (const i of [0, 6]) merlons(gp, pl[i], pl[(i + 1) % pl.length], Y + H + 0.008, OD, 0.024, 0.011, 0.011, 0.012);
    box(gp, shade(OC, 0.86), pl[0][0], Y, pl[0][1], 0.012, H * 0.4, 0.012, -ang);
  }
  // Seaward gun platform with cannons
  const sp: [number, number][] = [[-0.07, z1], [-0.055, 0.205], [0.055, 0.205], [0.07, z1]];
  prism(gp, sp, Y, H * 0.6, OC);
  merlons(gp, sp[0], sp[1], Y + H * 0.6, OD); merlons(gp, sp[1], sp[2], Y + H * 0.6, OD); merlons(gp, sp[2], sp[3], Y + H * 0.6, OD);
  for (let k = 0; k < 4; k++) cannon(gp, -0.036 + k * 0.024, Y + H * 0.6, 0.18, 0, 1.4);
  // Weathering streaks, gate and gun ports
  const W = new Mesher();
  for (let k = 0; k < 14; k++) W.rect([-x0 + 0.02 + k * 0.017, Y + 0.004 + hash3(k, 1, 1) * 0.02, z1 + T / 2 + 0.001], [1, 0], [0, 1], 0.006 + hash3(k, 2, 1) * 0.006, 0.02 + hash3(k, 3, 1) * 0.03, OD);
  for (let k = 0; k < 10; k++) W.rect([x0 + T / 2 + 0.001, Y + 0.004 + hash3(k, 4, 1) * 0.02, z0 + 0.02 + k * 0.026], [0, 1], [1, 0], 0.006 + hash3(k, 5, 1) * 0.006, 0.02 + hash3(k, 6, 1) * 0.03, OD);
  W.windows([x0 + T / 2, Y, 0], [0, 1], [1, 0], 5, 0.045, [0.05], 0.006, 0.006, '#3a2a1c');
  W.windows([0, Y, z1 + T / 2], [1, 0], [0, 1], 4, 0.06, [0.052], 0.006, 0.006, '#3a2a1c');
  W.windows([-x0 - T / 2, Y, -0.02], [0, -1], [-1, 0], 1, 0, [0.0], 0.022, 0.034, '#3a2a1c', '#8a6239', true);
  W.build(gp, { rough: 0.85 });
  // Inside: Omani house, barracks, well, flag
  box(gp, '#efe7d6', -0.05, Y, -0.08, 0.07, 0.05, 0.05);
  box(gp, '#d9cbb0', -0.05, Y + 0.05, -0.08, 0.074, 0.004, 0.054);
  for (let k = 0; k < 3; k++) box(gp, '#6b4a33', -0.07 + k * 0.02, Y + 0.012, -0.0545, 0.008, 0.016, 0.002);
  box(gp, shade(OC, 1.04), 0.06, Y, -0.03, 0.05, 0.035, 0.18);
  box(gp, '#8c5a34', 0.06, Y + 0.035, -0.03, 0.054, 0.004, 0.184);
  cyl(gp, '#bfa078', -0.03, Y, 0.05, 0.012, 0.012, 10);
  cyl(gp, '#1d3c4d', -0.03, Y + 0.0125, 0.05, 0.009, 0.001, 10);
  rod(gp, [0, Y + H, z0], [0, Y + H + 0.08, z0], 0.0015, '#d8d8d8', 4);
  const fl = ['#1a1a1a', '#f4f4f4', '#bb0000', '#f4f4f4', '#006600'], fh = [0.008, 0.002, 0.008, 0.002, 0.008];
  let fy = Y + H + 0.08;
  fl.forEach((c, i) => { fy -= fh[i]; box(gp, c, 0.018, fy, z0, 0.036, fh[i], 0.001); });
  crowd(gp, 14, 51, i => { const x = (hash3(i, 1, 51) - 0.5) * 0.18, z = -0.12 + hash3(i, 2, 51) * 0.2; return Math.abs(x - 0.06) < 0.035 || Math.hypot(x + 0.05, z + 0.08) < 0.05 ? null : [x, Y + 0.004, z]; });
  // Coastline: palms, baobab, dhow
  for (let k = 0; k < 7; k++) { const x = -0.4 + k * 0.05, z = 0.05 + hash3(k, 1, 7) * 0.12; palm(gp, x, G(x, z), z, 0.08 + hash3(k, 2, 7) * 0.03, 0.15, k, '#4f8a3a', k); }
  for (let k = 0; k < 5; k++) { const x = 0.25 + k * 0.035, z = -0.25 + hash3(k, 4, 7) * 0.3; palm(gp, x, G(x, z), z, 0.08, 0.15, k + 2, '#4f8a3a', k + 9); }
  const bx = -0.25, bz = -0.25, by = G(bx, bz);
  ctube(gp, [[bx, by, bz], [bx, by + 0.05, bz]], 0.016, '#9b8a78', 4, 8);
  for (let k = 0; k < 6; k++) { const a = k * 1.05; ctube(gp, [[bx, by + 0.045, bz], [bx + Math.cos(a) * 0.03, by + 0.075, bz + Math.sin(a) * 0.03]], 0.004, '#9b8a78', 3, 4); blob(gp, '#5f8a3a', bx + Math.cos(a) * 0.032, by + 0.08, bz + Math.sin(a) * 0.032, 0.014, 0.008, 0.014); }
  const d = grp(gp, 0.2, 0.017, 0.38, 0.5);
  tbox(d, 0.022, 0.07, 0.03, 0.1, 0.018, '#7a5a3c', 0, 0, 0);
  box(d, '#c9a47a', 0, 0.018, 0, 0.026, 0.002, 0.09);
  rod(d, [0, 0.018, 0.0], [0, 0.11, 0.01], 0.0018, '#5b4129', 4);
  const W2 = new Mesher(); W2.tri([0, 0.02, -0.045], [0, 0.105, 0.012], [0, 0.03, 0.05], '#f3ead6', [1, 0, 0]); W2.tri([0, 0.02, -0.045], [0, 0.105, 0.012], [0, 0.03, 0.05], '#f3ead6', [-1, 0, 0]); W2.build(d, { rough: 0.9 });
};

// ---- Yamoussoukro: giant domed basilica with curving colonnade arms and a vast esplanade ------------------
const yamoussoukro: Builder = gp => {
  island(gp, 0.5, () => 0, '#cfc6b4', (x, _y, z) => {
    const ax = Math.abs(x), r = Math.hypot(x, z + 0.08);
    if (z > 0.02 && ax < 0.09) return Math.abs(ax - 0.05) < 0.008 ? '#efe9dc' : (Math.floor(z * 50) % 2 ? '#d8cfbd' : '#cfc5b1');
    if (r < 0.34 && z < 0.1) return (Math.floor(x * 40) + Math.floor(z * 40)) % 2 ? '#ddd5c4' : '#d2c9b6';
    return grass(x, z, '#4f8f3a', '#68a648');
  }, { rings: 32, segs: 96, side: strataSide(['#9b7a55', '#8a6a48']) });
  const Y = 0.035, CZ = -0.12, ST = '#d9cfbd', ROOF = '#9aa3ab';
  // Raised circular podium with a ring of columns
  cyl(gp, '#c9bfac', 0, Y, CZ, 0.17, 0.012, 32);
  cyl(gp, ST, 0, Y + 0.012, CZ, 0.13, 0.065, 32);
  const ring: [number, number][] = []; for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; ring.push([Math.cos(a) * 0.155, CZ + Math.sin(a) * 0.155]); }
  colonnade(gp, ring, Y + 0.012, 0.0045, 0.06, '#efe9dc');
  plathe(gp, [[0.166, 0], [0.166, 0.008], [0.12, 0.012]], 0, Y + 0.072, CZ, 32, '#e7e0d0');
  // Drum with columns, ribbed dome, lantern, cross
  plathe(gp, [[0.098, 0], [0.098, 0.05], [0.104, 0.052], [0.104, 0.058]], 0, Y + 0.078, CZ, 32, ST, (x, y, z) => {
    const a = Math.atan2(z, x);
    return y < 0.05 && y > 0.008 && Math.abs(((a / (Math.PI * 2)) * 24 + 10) % 1 - 0.5) < 0.18 ? '#4a5a6a' : null;
  });
  const R = 0.105, DB = Y + 0.136;
  const prof: [number, number][] = []; for (let k = 0; k <= 10; k++) { const t = (k / 10) * Math.PI / 2; prof.push([R * Math.cos(t) * (1 - 0.06 * Math.sin(t)) + 0.0001, R * 1.12 * Math.sin(t)]); }
  plathe(gp, prof, 0, DB, CZ, 36, ROOF, (x, y, z) => {
    const a = Math.atan2(z, x), f = ((a / (Math.PI * 2)) * 18 + 10) % 1;
    if (f < 0.06) return '#e9edf0';
    const t = y / (R * 1.12);
    if (t > 0.3 && t < 0.42 && f > 0.35 && f < 0.65) return '#3a4654';
    return t > 0.85 ? '#b8c0c8' : null;
  }, { rough: 0.35, metal: 0.25 });
  cyl(gp, '#e9edf0', 0, DB + R * 1.1, CZ, 0.02, 0.006, 12);
  colonnade(gp, Array.from({ length: 8 }, (_, k) => [Math.cos(k * 0.785) * 0.016, CZ + Math.sin(k * 0.785) * 0.016] as [number, number]), DB + R * 1.12, 0.002, 0.022, '#efe9dc');
  plathe(gp, [[0.021, 0], [0.019, 0.01], [0.01, 0.02], [0.0001, 0.024]], 0, DB + R * 1.12 + 0.022, CZ, 12, '#d9b44a', undefined, { metal: 0.5, rough: 0.3 });
  rod(gp, [0, DB + R * 1.12 + 0.044, CZ], [0, DB + R * 1.12 + 0.075, CZ], 0.0018, '#d9b44a', 4);
  rod(gp, [-0.008, DB + R * 1.12 + 0.065, CZ], [0.008, DB + R * 1.12 + 0.065, CZ], 0.0016, '#d9b44a', 4);
  // Entrance portico
  box(gp, ST, 0, Y + 0.012, CZ + 0.15, 0.1, 0.07, 0.04);
  colonnade(gp, Array.from({ length: 8 }, (_, k) => [-0.042 + k * 0.012, CZ + 0.172] as [number, number]), Y + 0.012, 0.0035, 0.058, '#efe9dc');
  box(gp, '#e7e0d0', 0, Y + 0.07, CZ + 0.155, 0.104, 0.012, 0.05);
  // Two curved colonnade arms ending in domed pavilions
  for (const s of [-1, 1]) {
    const arc: [number, number][] = [], arc2: [number, number][] = [];
    for (let k = 0; k <= 18; k++) {
      const a = 0.25 + (k / 18) * 1.0, x = s * (0.13 + Math.sin(a) * 0.2), z = CZ + 0.08 + (1 - Math.cos(a)) * 0.12 - 0.02;
      arc.push([x, z]); arc2.push([x + s * 0.02, z - 0.005]);
    }
    colonnade(gp, [...arc, ...arc2], Y, 0.0035, 0.05, '#efe9dc');
    for (let k = 0; k < arc.length - 1; k++) {
      const a = arc[k], b = arc[k + 1], mx = (a[0] + b[0]) / 2 + s * 0.01, mz = (a[1] + b[1]) / 2 - 0.0025;
      box(gp, '#e7e0d0', mx, Y + 0.05, mz, Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.004, 0.008, 0.032, -Math.atan2(b[1] - a[1], b[0] - a[0]));
    }
    const e = arc[arc.length - 1], px = e[0] + s * 0.02, pz = e[1] + 0.02;
    box(gp, ST, px, Y, pz, 0.05, 0.065, 0.05);
    cyl(gp, ST, px, Y + 0.065, pz, 0.018, 0.012, 12);
    plathe(gp, [[0.02, 0], [0.019, 0.01], [0.012, 0.02], [0.0001, 0.024]], px, Y + 0.077, pz, 14, ROOF);
    rod(gp, [px, Y + 0.1, pz], [px, Y + 0.115, pz], 0.0014, '#d9b44a', 4);
  }
  // Esplanade lamps, people, palms and lawns
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
    const z = 0.12 + k * 0.06;
    cyl(gp, '#555b60', s * 0.1, Y, z, 0.0016, 0.06, 4);
    box(gp, '#f3f0e6', s * 0.1, Y + 0.06, z, 0.01, 0.003, 0.003);
  }
  crowd(gp, 14, 61, i => [(hash3(i, 1, 61) - 0.5) * 0.14, Y, 0.06 + hash3(i, 2, 61) * 0.36]);
  scatter(36, 62, (x, z, i) => { if (z > 0.08 && Math.abs(x) > 0.16) palm(gp, x, Y, z, 0.07 + hash3(i, 1, 62) * 0.03, 0.12, i, '#3f7a35', i); else if (z < -0.32) leafTree(gp, x, Y, z, 0.05, '#3f7a35', i); }, 0.46);
};

// ---- Citadelle Laferrière: ship-prow mountaintop fortress with cannons and cannonball pyramids -------------
const citadelle: Builder = gp => {
  const hf: HFn = (x, z) => {
    const r = Math.hypot(x * 1.1, z * 0.9);
    const k = sstep(0.25, 0.48, r);
    return 0.2 * (1 - k) + 0.03 * k * qn(x * 8, 3, z * 8) + 0.012 * Math.sin(Math.atan2(z, x) * 5) * k * (1 - k) * 4;
  };
  const G = onGround(hf);
  island(gp, 0.5, hf, '#4f8a3a', (x, y, z, _nx, ny) => {
    if (y > 0.232) return '#8f8676';
    if (y > 0.226) return mix('#7d8f55', '#9a8f74', qn(x * 30, 0, z * 30));
    if (ny < 0.6 && hash3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70)) > 0.55) return '#8f826f';
    return mix('#3f7a32', '#5e9a44', qn(x * 10, y * 6, z * 10));
  }, { rings: 40, segs: 100, side: strataSide(['#6e5d48', '#5e4f3d', '#7b6a54']) });
  const Y = 0.035 + 0.2, SC = '#857a6c', SD = '#6c6256';
  const fort = grp(gp, 0.01, Y - 0.006, -0.03, -0.45);
  fort.scale.setScalar(1.3);
  // Plan: the famous prow points at the viewer
  const prow: [number, number][] = [[0, 0.2], [0.05, 0.17], [0.075, 0.1], [0.08, 0.04], [-0.08, 0.04], [-0.075, 0.1], [-0.05, 0.17]];
  prism(fort, prow, 0, 0.16, SC, 0, true);
  prism(fort, prow.map(([a, b]) => [a * 1.04, b * 1.02 - 0.002] as [number, number]), 0.16, 0.008, SD, 0, true);
  const main: [number, number][] = [[-0.1, 0.05], [0.1, 0.05], [0.12, -0.12], [-0.12, -0.12]];
  prism(fort, main, 0, 0.11, SC);
  box(fort, SD, 0, 0.11, -0.035, 0.24, 0.004, 0.17);
  box(fort, SC, -0.13, 0, -0.06, 0.06, 0.08, 0.1);
  box(fort, SC, 0.14, 0, -0.04, 0.05, 0.075, 0.08);
  box(fort, '#7a3a2a', 0, 0.114, -0.04, 0.12, 0.012, 0.08);
  gable(fort, 0.12, 0.02, 0.08, '#8e4a36', 0, 0.126, -0.04, 0);
  // Gun ports in rows around the prow
  const W = new Mesher();
  for (let i = 0; i < prow.length; i++) {
    const a = prow[i], b = prow[(i + 1) % prow.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), u: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n: [number, number] = [-u[1], u[0]];
    if (n[1] < -0.2) continue;
    const cols = Math.max(1, Math.round(len / 0.03)), o: V3 = [(a[0] + b[0]) / 2 + n[0] * 0.005, 0, (a[1] + b[1]) / 2 + n[1] * 0.005];
    W.windows(o, u, n, cols, len / (cols + 0.5), [0.05, 0.1, 0.14], 0.008, 0.008, '#2b2621');
    for (let k = 0; k < 3; k++) { const f = (k + 0.5) / 3 - 0.5 + (hash3(i, k, 3) - 0.5) * 0.2; W.rect([o[0] + u[0] * f * len + n[0] * 0.0006, 0.004 + hash3(i, k, 4) * 0.04, o[2] + u[1] * f * len + n[1] * 0.0006], u, n, 0.006, 0.03 + hash3(i, k, 5) * 0.05, '#6f6658'); }
  }
  for (const s of [-1, 1]) W.windows([s * 0.12, 0, -0.035], [0, s], [s, 0], 4, 0.04, [0.04, 0.08], 0.008, 0.008, '#2b2621');
  W.build(fort, { rough: 0.9 });
  // Cannons on the top terrace and beside the fort
  for (let k = 0; k < 5; k++) cannon(fort, -0.06 + k * 0.03, 0.168, 0.1 + Math.abs(k - 2) * -0.015, 0, 1.3);
  for (let k = 0; k < 6; k++) { const x = 0.03 + k * 0.03, z = 0.2 - k * 0.018; cannon(gp, x, G(x, z), z, 0.4, 1.4); }
  ballPile(gp, 0.17, G(0.17, 0.08), 0.08, 4, 0.004);
  ballPile(gp, 0.22, G(0.22, 0.04), 0.04, 3, 0.004);
  ballPile(gp, -0.2, G(-0.2, 0.08), 0.08, 3, 0.004);
  // Zig-zag trail with visitors and a horse
  const path: V3[] = [];
  for (let k = 0; k <= 20; k++) { const t = k / 20, z = 0.46 - t * 0.28, x = 0.08 + Math.sin(t * 9) * 0.07; path.push([x, G(x, z) + 0.006, z]); }
  ctube(gp, path, 0.006, '#b7a382', 60, 3);
  crowd(gp, 8, 71, i => { const q = path[3 + i * 2]; return q ? [q[0] + 0.004, q[1] - 0.004, q[2]] : null; });
  const hq = path[8], hz = grp(gp, hq[0] - 0.01, hq[1] - 0.004, hq[2], 0.8);
  blob(hz, '#6b4429', 0, 0.016, 0, 0.012, 0.007, 0.006);
  blob(hz, '#6b4429', 0.014, 0.024, 0, 0.006, 0.004, 0.0035, 0, 0, 0.6);
  for (const [dx, dz] of [[-0.008, -0.003], [-0.008, 0.003], [0.008, -0.003], [0.008, 0.003]]) cyl(hz, '#4a2e1c', dx, 0, dz, 0.0015, 0.012, 4);
  // Tropical forest on the slopes
  scatter(48, 72, (x, z, i) => { const y = G(x, z); if (y < 0.2 && Math.hypot(x, z) > 0.27) leafTree(gp, x, y, z, 0.035 + hash3(i, 1, 72) * 0.025, i % 3 ? '#2f6b2c' : '#4a8a36', i); }, 0.47);
};

// ---- Pha That Luang (Vientiane): golden stupa on lotus terraces ringed by spires inside a cloister ----------
const GOLD = '#f0c24a', GOLDD = '#c99a2e';
function laoRoof(p: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, tiers: number, ry = 0): void {
  const q = grp(p, x, y, z, ry);
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.22, h = 0.03 * k;
    gable(q, w * k, h, d * k, i % 2 ? '#9e2f22' : '#b23a29', 0, i * 0.018, 0, 0);
    for (const s of [-1, 1]) {
      box(q, GOLD, 0, i * 0.018, s * d * k / 2, w * k + 0.002, 0.002, 0.003);
      cone(q, GOLD, s * w * k / 2, i * 0.018 + h * 0.9, 0, 0.003, 0.014, 4);
    }
    box(q, GOLD, 0, i * 0.018 + h - 0.001, 0, w * k + 0.004, 0.003, 0.004);
  }
}
const thatluang: Builder = gp => {
  island(gp, 0.5, () => 0, '#b58a6a', (x, _y, z) => {
    const ax = Math.abs(x);
    if (ax < 0.31 && Math.abs(z + 0.1) < 0.3) return (Math.floor(x * 60) + Math.floor(z * 60)) % 2 ? '#e8e0cc' : '#ddd3bc';
    if (z > 0.17 && ax < 0.3) return hash3(Math.floor(x * 80), 1, Math.floor(z * 80)) > 0.85 ? '#9b5d44' : '#b06b4f';
    return grass(x, z, '#5f9a44', '#79ae52');
  }, { rings: 30, segs: 90, side: strataSide(['#8c6a4e', '#7a5c43']) });
  const Y = 0.035, CZ = -0.05;
  const root = gp;
  gp = grp(root, 0, -Y * 0.3, -0.03, 0);
  gp.scale.setScalar(1.3);
  // Terraces with lotus-petal rims
  box(gp, '#efe5c8', 0, Y, CZ, 0.26, 0.015, 0.26);
  box(gp, GOLD, 0, Y + 0.015, CZ, 0.21, 0.03, 0.21);
  for (const [a, b] of [[[-0.105, -0.105], [0.105, -0.105]], [[0.105, -0.105], [0.105, 0.105]], [[0.105, 0.105], [-0.105, 0.105]], [[-0.105, 0.105], [-0.105, -0.105]]] as [[number, number], [number, number]][]) {
    for (let k = 0; k <= 10; k++) { const t = k / 10; cone(gp, GOLDD, a[0] + (b[0] - a[0]) * t, Y + 0.045, CZ + a[1] + (b[1] - a[1]) * t, 0.006, 0.012, 4); }
  }
  box(gp, GOLD, 0, Y + 0.045, CZ, 0.16, 0.025, 0.16);
  // Ring of thirty small spires
  for (let k = 0; k < 28; k++) {
    const t = k / 28, side = Math.floor(t * 4), f = (t * 4) % 1 - 0.5, e = 0.072;
    const [x, z] = side === 0 ? [f * 0.144, -e] : side === 1 ? [e, f * 0.144] : side === 2 ? [-f * 0.144, e] : [-e, -f * 0.144];
    plathe(gp, [[0.0065, 0], [0.0065, 0.012], [0.009, 0.016], [0.006, 0.024], [0.004, 0.04], [0.0001, 0.056]], x, Y + 0.07, CZ + z, 6, GOLD, undefined, { metal: 0.2, rough: 0.4 });
  }
  // Central bell stupa and lotus-bud spire
  plathe(gp, [[0.072, 0], [0.072, 0.012], [0.066, 0.03], [0.052, 0.048], [0.036, 0.06], [0.03, 0.068], [0.034, 0.072], [0.034, 0.078], [0.026, 0.08]], 0, Y + 0.07, CZ, 4, GOLD, (x, y) => (y > 0.068 && y < 0.072 ? GOLDD : Math.abs(x) < 0.002 ? GOLDD : null), { metal: 0.2, rough: 0.4, flat: true });
  plathe(gp, [[0.026, 0], [0.02, 0.012], [0.025, 0.026], [0.024, 0.04], [0.017, 0.065], [0.011, 0.095], [0.006, 0.12], [0.0025, 0.14], [0.0001, 0.155]], 0, Y + 0.15, CZ, 8, GOLD, (_x, y) => (Math.floor(y * 220) % 5 === 0 ? GOLDD : null), { metal: 0.2, rough: 0.35 });
  for (const ry of [0, Math.PI / 2]) for (const s of [-1, 1]) {
    const q = grp(gp, 0, Y + 0.07, CZ, ry);
    box(q, GOLD, 0, 0, s * 0.072, 0.03, 0.04, 0.012);
    gable(q, 0.032, 0.014, 0.014, GOLDD, 0, 0.04, s * 0.072, Math.PI / 2);
  }
  // Cloister: white base, maroon tiled roof, gates in each side
  const CL = 0.2;
  for (let i = 0; i < 4; i++) {
    const q = grp(gp, 0, Y, CZ, (i * Math.PI) / 2);
    for (const s of [-1, 1]) {
      box(q, '#f1ece0', s * 0.112, 0, CL, 0.176, 0.02, 0.022);
      tbox(q, 0.18, 0.032, 0.17, 0.008, 0.016, '#7b2c2a', s * 0.112, 0.02, CL);
    }
    box(q, '#f1ece0', 0, 0, CL, 0.05, 0.045, 0.03);
    box(q, '#3a2a20', 0, 0, CL + 0.0155, 0.018, 0.028, 0.002);
    laoRoof(q, 0, 0.045, CL, 0.06, 0.04, 2, 0);
    box(q, '#f1ece0', CL, 0, CL, 0.03, 0.05, 0.03);
    cone(q, GOLD, CL, 0.05, CL, 0.018, 0.04, 4, Math.PI / 4);
  }
  gp = root;
  // Wat That Luang Tai beside the plaza
  const wt = grp(gp, -0.33, Y, 0.27, 0.35);
  box(wt, '#f4efe2', 0, 0, 0, 0.13, 0.05, 0.08);
  box(wt, '#c9a23a', 0, 0, 0.0405, 0.13, 0.012, 0.002);
  laoRoof(wt, 0, 0.05, 0, 0.15, 0.1, 3, 0);
  const W = new Mesher();
  W.windows([0, 0, 0.041], [1, 0], [0, 1], 5, 0.024, [0.016], 0.01, 0.024, '#7b2c2a', GOLD);
  W.build(wt, { rough: 0.6 });
  // Flags, seated statue, people, frangipani and palms
  for (let k = 0; k < 8; k++) { const x = -0.18 + k * 0.052; rod(gp, [x, Y, 0.225], [x, Y + 0.08, 0.225], 0.0012, '#ddd', 3); box(gp, k % 2 ? '#ce1126' : '#002868', x + 0.009, Y + 0.068, 0.225, 0.018, 0.012, 0.001); }
  box(gp, '#9a8f80', 0, Y, 0.33, 0.05, 0.03, 0.04);
  blob(gp, '#6a6f74', 0, Y + 0.045, 0.33, 0.012, 0.016, 0.01);
  blob(gp, '#6a6f74', 0, Y + 0.066, 0.33, 0.0065);
  crowd(gp, 18, 81, i => { const x = (hash3(i, 1, 81) - 0.5) * 0.4, z = 0.24 + hash3(i, 2, 81) * 0.18; return Math.hypot(x, z - 0.33) < 0.04 ? null : [x, Y, z]; });
  scatter(40, 82, (x, z, i) => {
    if (Math.abs(x) < 0.33 && z < 0.22 && z > -0.42) return;
    if (z > 0.17 && Math.abs(x) < 0.3) return;
    if (i % 3) palm(gp, x, Y, z, 0.08 + hash3(i, 1, 82) * 0.03, 0.12, i, '#4a8a36', i); else leafTree(gp, x, Y, z, 0.045, i % 2 ? '#3f7a35' : '#e8b6c4', i);
  }, 0.47);
};

// ---- National Parliament House (Dhaka): Louis Kahn's concrete citadel with giant geometric cut-outs, ringed by a lake ----
const CONC = '#b9b3a7';
function concBlock(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): void {
  const bg = new THREE.BoxGeometry(w, h, d, 1, Math.max(1, Math.round(h / 0.012)), 1);
  add(p, paintFaces(bg, CONC, (_x, py) => (((py + h / 2) / 0.024) % 1 < 0.08 ? '#ece8df' : null)), mat('#ffffff', { vc: true, rough: 0.85 }), x, y + h / 2, z, 1, 1, 1, ry);
}
function concCyl(p: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, seg = 16): void {
  plathe(p, [[r, 0], [r, h]], x, y, z, seg, CONC, (_x, py) => ((py / 0.024) % 1 < 0.08 ? '#ece8df' : null), { flat: true, rough: 0.85 });
  cyl(p, shade(CONC, 0.9), x, y + h - 0.001, z, r * 0.98, 0.002, seg);
}
const sangsad: Builder = gp => {
  const hf: HFn = (x, z) => { const r = Math.hypot(x, z * 1.1); return r > 0.27 && r < 0.37 && z < 0.22 ? -0.016 : 0; };
  island(gp, 0.5, hf, '#d6d0c4', (x, y, z) => {
    if (y < 0.03) return rip('#4f8aa0', x, z);
    const r = Math.hypot(x, z * 1.1);
    if (r < 0.27) return (Math.floor(x * 40) + Math.floor(z * 40)) % 2 ? '#d9d3c7' : '#cfc8bb';
    return grass(x, z, '#4f9a3a', '#6fb24a');
  }, { rings: 34, segs: 100, side: strataSide(['#8c7a5e', '#7a6a50']) });
  const Y = 0.035, DARK = '#2b2a28';
  const W = new Mesher();
  // Central assembly chamber and ring of eight blocks
  plathe(gp, [[0.085, 0], [0.085, 0.2]], 0, Y, 0, 8, CONC, (_x, py) => ((py / 0.024) % 1 < 0.08 ? '#ece8df' : null), { flat: true, rough: 0.85 });
  cyl(gp, shade(CONC, 0.85), 0, Y + 0.2, 0, 0.08, 0.004, 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, R = 0.14, x = Math.sin(a) * R, z = Math.cos(a) * R, ry = a;
    const n: [number, number] = [Math.sin(a), Math.cos(a)], u: [number, number] = [Math.cos(a), -Math.sin(a)];
    const h = k % 2 ? 0.15 : 0.13;
    if (k % 4 === 1) {
      concCyl(gp, x, Y, z, 0.045, h, 14);
      W.rect([x + n[0] * 0.0455, Y + 0.04, z + n[1] * 0.0455], u, n, 0.012, 0.09, DARK);
    } else {
      concBlock(gp, x, Y, z, 0.085, h, 0.07, ry);
      const fx = x + n[0] * 0.0355, fz = z + n[1] * 0.0355;
      if (k % 2 === 0) {
        const cg = new THREE.CircleGeometry(0.022, 20);
        add(gp, cg, mat(DARK), fx + n[0] * 0.001, Y + 0.06, fz + n[1] * 0.001, 1, 1, 1, ry);
      } else {
        W.tri([fx - u[0] * 0.02, Y + 0.04, fz - u[1] * 0.02], [fx + u[0] * 0.02, Y + 0.04, fz + u[1] * 0.02], [fx, Y + 0.12, fz], DARK, [n[0], 0, n[1]]);
      }
      for (const s of [-1, 1]) W.tri([fx + u[0] * s * 0.042, Y + 0.09, fz + u[1] * s * 0.042], [fx + u[0] * s * 0.03, Y + 0.09, fz + u[1] * s * 0.03], [fx + u[0] * s * 0.036, Y + 0.12, fz + u[1] * s * 0.036], DARK, [n[0], 0, n[1]]);
    }
  }
  // Front entrance slot, flag and marble steps
  concBlock(gp, 0, Y, 0.2, 0.07, 0.17, 0.05);
  W.rect([0, Y + 0.02, 0.2251], [1, 0], [0, 1], 0.026, 0.13, DARK);
  rod(gp, [0, Y + 0.02, 0.232], [0, Y + 0.075, 0.232], 0.0012, '#ddd', 3);
  box(gp, '#006a4e', 0.008, Y + 0.062, 0.232, 0.016, 0.011, 0.001);
  blob(gp, '#f42a41', 0.007, Y + 0.0675, 0.2325, 0.0032, 0.0032, 0.0008);
  for (let k = 0; k < 5; k++) box(gp, '#eeeae2', 0, Y + k * 0.004, 0.235 + 0.06 - k * 0.012, 0.18 - k * 0.02, 0.004, 0.012);
  W.build(gp, { rough: 0.85 });
  // Red-brick hostels with arches across the lake and lawns with trees
  for (const [x, z, ry] of [[-0.27, 0.31, -0.74], [0.27, 0.31, 0.74], [0, -0.42, 0]] as [number, number, number][]) {
    const q = grp(gp, x, Y, z, ry);
    box(q, '#a54d36', 0, 0, 0, 0.16, 0.045, 0.04);
    box(q, '#8e3f2c', 0, 0.045, 0, 0.162, 0.004, 0.042);
    const m = new Mesher();
    m.windows([0, 0, 0.0205], [1, 0], [0, 1], 6, 0.025, [0.006], 0.014, 0.024, '#3a2a20', undefined, true);
    m.windows([0, 0, -0.0205], [-1, 0], [0, -1], 6, 0.025, [0.006], 0.014, 0.024, '#3a2a20', undefined, true);
    m.build(q, { rough: 0.8 });
  }
  scatter(50, 91, (x, z, i) => { const r = Math.hypot(x, z * 1.1); if (r > 0.38 && !(Math.abs(x) < 0.12 && z > 0.3)) leafTree(gp, x, Y, z, 0.04 + hash3(i, 1, 91) * 0.02, i % 4 ? '#3f7a35' : '#5a9a3a', i); }, 0.48);
  crowd(gp, 12, 92, i => [(hash3(i, 1, 92) - 0.5) * 0.2, Y, 0.3 + hash3(i, 2, 92) * 0.12]);
  for (let k = 0; k < 4; k++) { const a = -0.8 + k * 0.5; add(gp, CYL(8), mat('#f2efe8'), Math.sin(a) * 0.32, Y - 0.012, Math.cos(a) * 0.29 - 0.05, 0.012, 0.004, 0.03, a); }
};

// ---- Malwiya of Samarra: spiral minaret with an outside ramp beside the vast buttressed mosque wall ---------
const SANDB = '#c99a5e';
const malwiya: Builder = gp => {
  island(gp, 0.5, (x, z) => 0.006 * qn(x * 6, 4, z * 6), '#d9bf8f', (x, _y, z) => {
    if (Math.abs(z - 0.32 - x * 0.2) < 0.018) return '#9b9182';
    return hash3(Math.floor(x * 90), 3, Math.floor(z * 90)) > 0.8 ? '#cfb07c' : mix('#e0c896', '#d4b783', qn(x * 10, 0, z * 10));
  }, { rings: 28, segs: 90, side: strataSide(['#bf9f6c', '#ad8c5c']) });
  const Y = 0.035, MX = 0.17, MZ = 0.12, H = 0.3, TURNS = 5;
  const R0 = 0.085, R1 = 0.024, RW = 0.014;
  const Rf = (t: number) => R0 + (R1 - R0) * t;
  // Square base and tapering core
  box(gp, shade(SANDB, 0.95), MX, Y, MZ, 0.21, 0.02, 0.21);
  {
    const m = new Mesher();
    for (const [u, n] of [[[1, 0], [0, 1]], [[0, -1], [1, 0]], [[-1, 0], [0, -1]], [[0, 1], [-1, 0]]] as [[number, number], [number, number]][])
      m.windows([MX + n[0] * 0.105, Y, MZ + n[1] * 0.105], u, n, 9, 0.022, [0.003], 0.01, 0.01, '#6e5232', undefined, true);
    m.build(gp, { rough: 0.9 });
  }
  const prof: [number, number][] = []; for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([Rf(t) - RW * 0.6, t * H]); }
  plathe(gp, prof, MX, Y + 0.02, MZ, 24, SANDB, (x, y, z) => (Math.floor(y * 300 + Math.atan2(z, x) * 2) % 3 === 0 ? shade(SANDB, 0.94) : null), { rough: 0.9 });
  // Helical ramp: top tread + outer face, built as one mesh
  const R = new Mesher(), N = 260;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const pt = (t: number, r: number, dy = 0): V3 => { const a = t * TURNS * Math.PI * 2, y = Y + 0.02 + t * H + dy; return [MX + Math.cos(a) * r, y, MZ + Math.sin(a) * r]; };
    const ri0 = Rf(t0) - RW * 0.6, ri1 = Rf(t1) - RW * 0.6, ro0 = Rf(t0) + RW * 0.4, ro1 = Rf(t1) + RW * 0.4, th = H / TURNS;
    const c = i % 2 ? '#cfa466' : '#c6995a';
    R.quad(pt(t0, ri0), pt(t0, ro0), pt(t1, ro1), pt(t1, ri1), '#d8b47a', [0, 1, 0]);
    const a0 = t0 * TURNS * Math.PI * 2, nx = Math.cos(a0), nz = Math.sin(a0);
    R.quad(pt(t0, ro0), pt(t1, ro1), pt(t1, ro1, -th), pt(t0, ro0, -th), c, [nx, 0, nz]);
    if (i % 3 === 0) R.quad(pt(t0, ro0, 0.004), pt(t1, ro1, 0.004), pt(t1, ro1), pt(t0, ro0), '#b5884e', [nx, 0, nz]);
  }
  R.build(gp, { rough: 0.9 });
  // Little arched pavilion on top
  const TY = Y + 0.02 + H;
  plathe(gp, [[R1 * 0.9, 0], [R1 * 0.85, 0.035], [R1 * 0.95, 0.04]], MX, TY - 0.005, MZ, 12, SANDB, (x, y, z) => (y > 0.01 && y < 0.03 && Math.abs(((Math.atan2(z, x) / (Math.PI * 2)) * 8 + 8) % 1 - 0.5) < 0.2 ? '#4a3622' : null), { flat: true });
  crowd(gp, 7, 101, i => { const t = 0.15 + i * 0.12, a = t * TURNS * Math.PI * 2, r = Rf(t); return [MX + Math.cos(a) * r, Y + 0.02 + t * H, MZ + Math.sin(a) * r]; }, 0.9);
  // Great Mosque enclosure wall with round buttress towers
  const wx0 = -0.42, wx1 = 0.04, wz0 = -0.36, wz1 = -0.02, WH = 0.075;
  const pts: [number, number][] = [[wx0, wz1], [wx1, wz1], [wx1, wz0], [wx0, wz0]];
  wallLoop(gp, pts, Y, WH, 0.016, SANDB);
  const F = new Mesher();
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n: [number, number] = [u[1], -u[0]];
    const nT = Math.round(len / 0.045);
    for (let k = 0; k <= nT; k++) {
      const f = k / nT, x = a[0] + (b[0] - a[0]) * f + n[0] * 0.01, z = a[1] + (b[1] - a[1]) * f + n[1] * 0.01;
      if (Math.hypot(x, z) > 0.49) continue;
      cyl(gp, k === 0 ? shade(SANDB, 1.04) : SANDB, x, Y, z, k === 0 ? 0.017 : 0.012, WH + 0.004, 10);
    }
    F.windows([(a[0] + b[0]) / 2 + n[0] * 0.008, Y, (a[1] + b[1]) / 2 + n[1] * 0.008], u, n, nT, len / nT, [WH - 0.016], 0.016, 0.009, '#a77c45');
  }
  F.windows([wx1 + 0.008, Y, -0.15], [0, -1], [1, 0], 1, 0, [0.0], 0.014, 0.03, '#4a3622', undefined, true);
  F.build(gp, { rough: 0.9 });
  box(gp, '#d8c49a', (wx0 + wx1) / 2, Y, (wz0 + wz1) / 2, wx1 - wx0 - 0.02, 0.003, wz1 - wz0 - 0.02);
  for (let k = 0; k < 10; k++) for (let j = 0; j < 4; j++) cyl(gp, '#bfa678', wx0 + 0.04 + k * 0.04, Y, wz0 + 0.06 + j * 0.06, 0.003, 0.006, 5);
  // Path, visitors, date palms on the river side
  crowd(gp, 10, 102, i => { const x = 0.05 + hash3(i, 1, 102) * 0.1, z = 0.22 + hash3(i, 2, 102) * 0.1; return [x, Y, z]; });
  for (let k = 0; k < 7; k++) { const x = -0.38 + k * 0.05, z = 0.2 + hash3(k, 1, 103) * 0.15; palm(gp, x, Y, z, 0.08 + hash3(k, 2, 103) * 0.03, 0.1, k, '#5b8a3a', k); }
  for (let k = 0; k < 3; k++) { const x = 0.3 + k * 0.04, z = 0.32 - k * 0.03; box(gp, PCOL[k + 2], x, Y, z, 0.03, 0.012, 0.016, 0.2); box(gp, '#3b4652', x, Y + 0.012, z, 0.018, 0.007, 0.0145, 0.2); }
};

// ---- Kuwait Towers: three white needles, two of them wearing blue-green mosaic spheres, on the Gulf shore ---
const sphTiles: Paint = (x, y, z) => {
  const r = Math.hypot(x, y, z), lat = Math.asin(y / r), lon = Math.atan2(z, x);
  const fl = (lat / Math.PI) * 18, fo = (lon / (Math.PI * 2)) * 36 * Math.max(0.35, Math.cos(lat));
  const dl = fl - Math.round(fl), dor = fo - Math.round(fo);
  const d = Math.hypot(dl, dor);
  if (d < 0.32) { const h = hash3(Math.round(fl), Math.round(fo), 5); return h > 0.66 ? '#2f6fb0' : h > 0.33 ? '#3aa19a' : '#7cc7c0'; }
  return d > 0.5 ? '#e8f1f2' : '#1d5a78';
};
function kneedle(p: THREE.Object3D, x: number, z: number, y0: number, h: number, r0: number, r1: number): void {
  plathe(p, [[r0 * 1.25, 0], [r0, 0.012], [r1, h * 0.86], [r1 * 0.35, h * 0.9], [r1 * 0.12, h * 0.98], [0.0001, h]], x, y0, z, 14, '#f4f4f2', undefined, { rough: 0.35 });
}
const kuwaittowers: Builder = gp => {
  const hf: HFn = (x, z) => (z - x * 0.4 < -0.18 ? -0.018 : 0);
  island(gp, 0.5, hf, '#d8c9a6', (x, y, z) => {
    if (y < 0.03) return rip('#2d8ca8', x, z);
    const d = z - x * 0.4;
    if (d < -0.15) return '#e6d7b0';
    const r = Math.hypot(x + 0.02, z - 0.12);
    if (r < 0.26) return Math.floor(r * 60) % 3 === 0 ? '#c9a49c' : '#d9b5ab';
    return grass(x, z, '#5f9a44', '#79ae52');
  }, { rings: 34, segs: 100, side: strataSide(['#bfa77c', '#a8916a']) });
  const Y = 0.035;
  // Main tower: reservoir sphere with viewing ring, revolving restaurant sphere, spire
  const AX = 0.0, AZ = -0.04;
  kneedle(gp, AX, AZ, Y, 0.47, 0.024, 0.01);
  psphere(gp, 0.06, AX, Y + 0.2, AZ, 32, 22, '#2a6f8a', sphTiles, { rough: 0.3, metal: 0.2 });
  cyl(gp, '#e8eef0', AX, Y + 0.218, AZ, 0.066, 0.006, 32);
  cyl(gp, '#304a5a', AX, Y + 0.224, AZ, 0.061, 0.008, 32);
  cyl(gp, '#e8eef0', AX, Y + 0.232, AZ, 0.063, 0.003, 32);
  psphere(gp, 0.032, AX, Y + 0.325, AZ, 28, 20, '#1d4f78', (x, y, z) => { const v = sphTiles(x, y, z, 0, 1, 0); return v === '#e8f1f2' ? '#24425f' : v; }, { rough: 0.3, metal: 0.2 });
  cyl(gp, '#cfd8dc', AX, Y + 0.322, AZ, 0.0335, 0.004, 24);
  // Second tower with one sphere, third plain needle
  const BX = -0.12, BZ = 0.0;
  kneedle(gp, BX, BZ, Y, 0.38, 0.018, 0.008);
  psphere(gp, 0.042, BX, Y + 0.17, BZ, 28, 18, '#2a6f8a', sphTiles, { rough: 0.3, metal: 0.2 });
  kneedle(gp, -0.2, 0.04, Y, 0.33, 0.012, 0.006);
  // Bases and plaza
  for (const [x, z, r] of [[AX, AZ, 0.045], [BX, BZ, 0.035], [-0.2, 0.04, 0.025]]) cyl(gp, '#e6e2d8', x, Y, z, r, 0.01, 16);
  for (let k = 0; k < 4; k++) { const r = 0.2 + k * 0.012; plathe(gp, [[r, 0], [r, 0.004 * (4 - k)], [r - 0.012, 0.004 * (4 - k)]], -0.02, Y, 0.12, 40, '#e9e3d6'); }
  // Palms, hedges, people, dhows on the Gulf
  for (let k = 0; k < 9; k++) { const x = 0.15 + (k % 3) * 0.06, z = 0.05 + Math.floor(k / 3) * 0.08 + (k % 2) * 0.02; palm(gp, x, Y, z, 0.07 + hash3(k, 1, 111) * 0.02, 0.1, k, '#4f8a3a', k); }
  for (let k = 0; k < 6; k++) { const x = -0.38 + k * 0.05, z = 0.22 + hash3(k, 1, 112) * 0.1; palm(gp, x, Y, z, 0.07, 0.12, k + 3, '#4f8a3a', k + 20); }
  for (let k = 0; k < 7; k++) blob(gp, '#3f7a35', 0.12 + k * 0.035, Y + 0.006, 0.33 - k * 0.014, 0.014, 0.008, 0.01);
  crowd(gp, 12, 113, i => { const a = hash3(i, 1, 113) * 6.28, r = 0.08 + hash3(i, 2, 113) * 0.18; const x = -0.02 + Math.cos(a) * r, z = 0.12 + Math.sin(a) * r; return z - x * 0.4 < -0.14 ? null : [x, Y, z]; });
  for (const [x, z, ry] of [[0.2, -0.36, 0.4], [-0.15, -0.38, -0.3]] as [number, number, number][]) {
    const d = grp(gp, x, 0.017, z, ry);
    tbox(d, 0.02, 0.06, 0.028, 0.09, 0.016, '#8a6a48', 0, 0, 0);
    box(d, '#d6c19a', 0, 0.016, 0, 0.024, 0.002, 0.08);
    rod(d, [0, 0.016, 0], [0, 0.08, 0.008], 0.0016, '#5b4129', 4);
    const m = new Mesher(); m.tri([0, 0.02, -0.035], [0, 0.078, 0.01], [0, 0.026, 0.04], '#f3ead6', [1, 0, 0]); m.tri([0, 0.02, -0.035], [0, 0.078, 0.01], [0, 0.026, 0.04], '#f3ead6', [-1, 0, 0]); m.build(d);
  }
};

export const H_COUNTRIES_C: Record<string, Builder> = {
  cc_malbork: malbork,
  cc_bran: bran,
  cc_schonbrunn: schonbrunn,
  cc_nyhavn: nyhavn,
  cc_shahmosque: shahmosque,
  cc_faisal: faisal,
  cc_baiterek: baiterek,
  cc_gergeti: gergeti,
  cc_fortjesus: fortjesus,
  cc_yamoussoukro: yamoussoukro,
  cc_citadelle: citadelle,
  cc_thatluang: thatluang,
  cc_sangsad: sangsad,
  cc_malwiya: malwiya,
  cc_kuwaittowers: kuwaittowers,
};
