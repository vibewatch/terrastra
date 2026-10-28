import * as THREE from 'three';
import { type Builder, type V3, type Paint, type MatOpts, g, add, mat, box, cyl, cone, ball, rbox, rod, strut, tube, lathe, prism, gable, paintFaces, shade, mix, fbm, hash3, worley, BOX, CYL } from '../prims.ts';
import { type HFn, island, sstep, ripple, strataSide, EARTH, onGround, scatter } from '../nature.ts';
import { grp, person } from '../kit/town.ts';
import { Mesher } from '../kit/mesher.ts';

// Hero builders for landmarks of African, American and Oceanian countries (keys cb_*). Each is a compact diorama on its
// real setting; front is +z, base at y=0, footprint radius ≈ 0.5.

// ---- local helpers ----------------------------------------------------------------------------------------
const LO = () => g('cb:sph9', () => new THREE.SphereGeometry(0.5, 9, 7));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);


/** Parametric surface P(u,v) on an nu×nv grid, coloured per cell by col(u,v). Front face follows u × v. */
function patch(p: THREE.Object3D, P: (u: number, v: number) => V3, nu: number, nv: number, col: (u: number, v: number) => string, o: MatOpts = {}, flip = false): THREE.Mesh {
  const m = new Mesher();
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
    const a = P(u0, v0), b = P(u1, v0), d = P(u1, v1), e = P(u0, v1), c = col((u0 + u1) / 2, (v0 + v1) / 2);
    if (flip) m.quad(a, e, d, b, c); else m.quad(a, b, d, e, c);
  }
  return m.build(p, o);
}

/** Tapered painted block (subdivided so the paint can mottle the stone): bottom w0×d0, top w1×d1, height h. */
function frustum(p: THREE.Object3D, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number, paint: Paint, seg: [number, number, number] = [6, 2, 6], ry = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1, ...seg);
  const pa = geo.getAttribute('position');
  for (let i = 0; i < pa.count; i++) {
    const t = pa.getY(i) + 0.5;
    pa.setXYZ(i, pa.getX(i) * (w0 + (w1 - w0) * t), t * h, pa.getZ(i) * (d0 + (d1 - d0) * t));
  }
  geo.computeVertexNormals();
  return add(p, paintFaces(geo, '#888888', paint), mat('#ffffff', { vc: true }), x, y, z, 1, 1, 1, ry);
}

const _m4 = new THREE.Matrix4(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
/** Box running from a to b (length), width w across horizontally, thickness t. */
function beam(p: THREE.Object3D, a: V3, b: V3, w: number, t: number, c: string): THREE.Mesh {
  _bx.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _bx.length() || 0.001;
  _bx.normalize();
  _bz.crossVectors(_bx, _by.set(0, 1, 0));
  if (_bz.lengthSq() < 1e-6) _bz.set(0, 0, 1);
  _bz.normalize();
  _by.crossVectors(_bz, _bx).normalize();
  const m = add(p, BOX(), mat(c), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, len, t, w);
  m.quaternion.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz));
  return m;
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
  tube(p, [[x, y, z], [x + lx * 0.3, y + h * 0.5, z + lz * 0.3], top], h * 0.045, h * 0.032, '#8a7458', { radial: 6, sub: 3 });
  const n = 8, l = h * 0.42;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + hash3(seed, i, 7), tl = 0.25 + hash3(seed, i, 8) * 0.5;
    blob(p, shade(c, 0.85 + hash3(seed, i, 9) * 0.3), top[0] + Math.cos(a) * l * 0.48 * Math.cos(tl), top[1] - l * 0.48 * Math.sin(tl), top[2] - Math.sin(a) * l * 0.48 * Math.cos(tl),
      l * 0.5, h * 0.012, h * 0.07, a, 0, -tl);
  }
  blob(p, '#6b5a2a', top[0], top[1] - h * 0.03, top[2], h * 0.05, h * 0.04, h * 0.05);
}
/** Classic 1950s convertible, ~0.07 long along local x. */
function classicCar(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c: string): void {
  const q = grp(p, x, y, z, ry);
  rbox(q, c, 0, 0.004, 0, 0.072, 0.011, 0.027, 0.004);
  rbox(q, shade(c, 1.08), -0.004, 0.013, 0, 0.05, 0.005, 0.026, 0.0025);
  for (const sz of [-1, 1]) box(q, shade(c, 0.9), -0.03, 0.014, sz * 0.011, 0.012, 0.004, 0.003);
  box(q, '#efe7d6', -0.008, 0.016, 0, 0.03, 0.004, 0.022);
  box(q, '#d7eef8', 0.012, 0.016, 0, 0.002, 0.008, 0.022, 0, 0, -0.35);
  box(q, '#dfe3e8', 0.037, 0.005, 0, 0.003, 0.004, 0.028);
  box(q, '#dfe3e8', -0.037, 0.005, 0, 0.003, 0.004, 0.028);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(q, CYL(10), mat('#1f2328'), sx * 0.022, 0.0062, sz * 0.0125, 0.0124, 0.006, 0.0124, 0, Math.PI / 2, 0);
    add(q, CYL(8), mat('#f1f1ee'), sx * 0.022, 0.0062, sz * 0.0155, 0.007, 0.0008, 0.007, 0, Math.PI / 2, 0);
  }
}

// ---- Deadvlei: white clay pan, black camel-thorn skeletons, Big Daddy red dune -----------------------------
function deadTree(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number): void {
  const C = ['#2e2620', '#3a302a', '#262019'];
  const grow = (a: V3, d: V3, len: number, r: number, depth: number, k: number) => {
    const b: V3 = [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len];
    strut(p, a, b, r, r * 0.66, C[k % 3], 5);
    if (depth === 0) return;
    const n = depth >= 2 ? 2 + (hash3(seed, k, depth) > 0.6 ? 1 : 0) : 2;
    for (let i = 0; i < n; i++) {
      const a2 = hash3(seed, k * 7 + i, depth) * 6.28, sp = 0.55 + 0.35 * hash3(seed, i, k + 3);
      const nd: V3 = [d[0] + Math.cos(a2) * sp, d[1] + 0.35, d[2] + Math.sin(a2) * sp];
      const l = Math.hypot(...nd);
      grow(b, [nd[0] / l, nd[1] / l, nd[2] / l], len * (0.68 + 0.2 * hash3(seed, i, k)), r * 0.62, depth - 1, k * 3 + i + 1);
    }
  };
  const lean = hash3(seed, 9, 9) * 6.28;
  grow([x, y - 0.004, z], [Math.cos(lean) * 0.15, 1, Math.sin(lean) * 0.15], s * 0.32, s * 0.07, 3, 0);
  blob(p, '#3a302a', x, y + 0.002, z, s * 0.07, s * 0.02, s * 0.07);
}

const deadvlei: Builder = gp => {
  const pan = (x: number, z: number) => ((x - 0.02) / 0.3) ** 2 + ((z - 0.13) / 0.2) ** 2;
  const crest = (x: number) => -0.1 - 0.08 * Math.cos(x * 3.4) + 0.035 * Math.sin(x * 7 + 1);
  const hf: HFn = (x, z) => {
    const H = 0.44 * Math.max(0.15, 1 - ((x - 0.06) / 0.62) ** 2);
    const dz = z - crest(x), sd = Math.sqrt(dz * dz + 0.0006) - 0.0245;
    let y = dz > 0 ? H * Math.max(0, 1 - sd / 0.26) ** 1.3 : H * Math.max(0, 1 - sd / 0.36) ** 1.2;
    // Side dunes wrapping the pan
    const lx = x + 0.36 + 0.05 * Math.sin(z * 6);
    y = Math.max(y, 0.2 * Math.max(0, 1 - Math.abs(lx) / (lx > 0 ? 0.11 : 0.2)) ** 1.3 * sstep(0.5, 0.05, Math.abs(z - 0.1)));
    const rx = x - 0.38, rz = z - 0.26;
    y = Math.max(y, 0.13 * Math.max(0, 1 - Math.hypot(rx * 1.3, rz * 0.8) / 0.16) ** 1.2);
    y *= 0.2 + 0.8 * sstep(0.5, 0.34, Math.hypot(x, z));
    y += 0.005 * fbm(x * 18, 3, z * 18) * sstep(0.02, 0.1, y);
    y = Math.max(y, 0.015 + 0.01 * fbm(x * 6, 1, z * 6));
    const pn = pan(x, z);
    return pn < 1.2 ? 0.012 + (y - 0.012) * sstep(0.8, 1.2, pn) : y;
  };
  island(gp, 0.5, hf, '#d9622b', (x, y, z, nx, ny, nz) => {
    const t = y - 0.035;
    if (t < 0.016 && pan(x, z) < 1.05) {
      const [f1, f2] = worley(x * 38, 0.5, z * 38);
      if (f2 - f1 < 0.07) return '#cbbfa9';
      return hash3(Math.floor(x * 90), 2, Math.floor(z * 90)) > 0.8 ? '#e4dccd' : mix('#f1ebdf', '#e8dfcf', fbm(x * 9, 0, z * 9));
    }
    if (t < 0.03 && ny > 0.9) return mix('#d79a63', '#cf8452', fbm(x * 10, 0, z * 10));
    const lit = nx * 0.75 + nz * 0.25 + ny * 0.2;
    let c = lit > 0.3 ? '#ea7e3c' : lit < -0.15 ? '#a8401f' : lit < 0.05 ? '#c4532a' : '#d9662f';
    if (Math.sin((x * 0.6 + z) * 150 + fbm(x * 8, y * 8, z * 8) * 5) > 0.82) c = shade(c, 0.92);
    return c;
  }, { rings: 56, segs: 124, side: strataSide(['#b8582c', '#a24a25', '#c4683a']) });
  const gy = onGround(hf);
  const trees: [number, number, number][] = [[-0.1, 0.12, 0.22], [0.08, 0.06, 0.26], [0.19, 0.18, 0.18], [-0.22, 0.2, 0.16], [0.0, 0.25, 0.14], [0.25, 0.07, 0.15], [-0.05, 0.0, 0.13]];
  trees.forEach(([x, z, s], i) => deadTree(gp, x, gy(x, z), z, s, i + 1));
  // Nara shrubs where the pan meets the sand
  scatter(26, 77, (x, z) => { const pn = pan(x, z); if (pn > 1.05 && pn < 1.5 && hf(x, z) < 0.05) blob(gp, hash3(x * 50, z * 50, 1) > 0.5 ? '#7d8a4a' : '#6b7a3e', x, gy(x, z) + 0.004, z, 0.012, 0.007, 0.012); }, 0.45);
  person(gp, 0.1, gy(0.1, 0.25), 0.25, '#f97316', 1);
  person(gp, 0.125, gy(0.125, 0.26), 0.26, '#38bdf8', 3);
  person(gp, -0.13, gy(-0.13, 0.3), 0.3, '#facc15', 0);
};

// ---- Zuma Rock: streaked granite inselberg above green savanna ----------------------------------------------
const zuma: Builder = gp => {
  const dome = (x: number, z: number) => Math.pow(Math.abs(x / 0.34) ** 3 + Math.abs((z + 0.07) / 0.21) ** 3, 1 / 3);
  const ROAD = 0.36;
  const hf: HFn = (x, z) => {
    const d = dome(x, z);
    let rock = d < 1 ? 0.52 * Math.pow(1 - d ** 3.4, 0.42) * (0.82 + 0.18 * (x / 0.34)) : 0;
    if (rock > 0) rock += 0.008 * fbm(x * 20, 1, z * 20);
    let gnd = 0.025 + 0.006 * fbm(x * 14, 2, z * 14) + 0.05 * Math.max(0, 1 - (d - 1) / 0.22) ** 2 * (d > 1 ? 1 : 0);
    gnd += 0.04 * sstep(0.32, 0.5, Math.hypot(x, z)) * fbm(x * 4, 5, z * 4) * (z < 0 ? 1 : 0);
    const road = Math.abs(z - ROAD - 0.03 * Math.sin(x * 3));
    if (road < 0.05) gnd = 0.02 + (gnd - 0.02) * sstep(0.025, 0.05, road);
    return Math.max(rock, gnd);
  };
  island(gp, 0.5, hf, '#6d9a45', (x, y, z, _nx, ny) => {
    const t = y - 0.035, d = dome(x, z);
    if (d < 1.0 && t > 0.06) {
      if (ny > 0.8 && t > 0.4) return fbm(x * 30, 0, z * 30) > 0.5 ? '#5d6b3c' : '#6a6458';
      const a = Math.atan2((z + 0.07) / 0.21, x / 0.34);
      if (z > 0 && Math.abs(x + 0.04) < 0.09 && t > 0.14 && t < 0.38 && fbm(x * 18, y * 9, 2) > 0.35) return mix('#a39684', '#8f8474', fbm(x * 40, y * 40, 1));
      const n = fbm(a * 14, y * 1.6, 3);
      if (n > 0.62) return '#2c2a28';
      if (n < 0.34) return '#7c776f';
      return hash3(Math.floor(a * 60), Math.floor(y * 25), 4) > 0.85 ? '#3c3936' : '#55514c';
    }
    if (Math.abs(z - ROAD - 0.03 * Math.sin(x * 3)) < 0.022) return Math.abs(z - ROAD - 0.03 * Math.sin(x * 3)) < 0.002 && Math.sin(x * 120) > 0 ? '#f1f5f9' : '#4b5058';
    if (d < 1.25 && t > 0.02) return hash3(Math.floor(x * 80), 5, Math.floor(z * 80)) > 0.7 ? '#b8b2a6' : '#7d8a52';
    return hash3(Math.floor(x * 60), 6, Math.floor(z * 60)) > 0.82 ? '#4f7a35' : mix('#6d9a45', '#8aa858', fbm(x * 8, 0, z * 8));
  }, { rings: 56, segs: 128, side: strataSide(['#7a5a40', '#6b4f3a', '#8a6a48']) });
  const gy = onGround(hf);
  scatter(46, 13, (x, z, i) => {
    const d = dome(x, z), rd = Math.abs(z - ROAD - 0.03 * Math.sin(x * 3));
    if (d > 1.12 && rd > 0.04) leafTree(gp, x, gy(x, z), z, 0.045 + hash3(i, 2, 3) * 0.03, hash3(i, 1, 1) > 0.5 ? '#3f7a35' : '#558b3e', i);
  }, 0.47);
  scatter(18, 31, (x, z, i) => { const d = dome(x, z); if (d > 1.02 && d < 1.3) blob(gp, '#c9c3b6', x, gy(x, z) + 0.004, z, 0.008 + hash3(i, 0, 0) * 0.008, 0.006, 0.009); }, 0.45);
  minibus(gp, gy);
};
/** Small minibus on the Abuja–Kaduna road in front of the rock. */
function minibus(gp: THREE.Object3D, gy: (x: number, z: number) => number): void {
  const x = -0.12, z = 0.36 + 0.03 * Math.sin(-0.12 * 3) + 0.008;
  const q = grp(gp, x, gy(x, z), z, 0);
  rbox(q, '#facc15', 0, 0.002, 0, 0.05, 0.022, 0.022, 0.004);
  box(q, '#1f2937', 0.005, 0.013, 0, 0.045, 0.006, 0.0225);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(q, CYL(8), mat('#1f2328'), sx * 0.016, 0.004, sz * 0.011, 0.009, 0.004, 0.009, 0, Math.PI / 2, 0);
}

// ---- Great Zimbabwe: Great Enclosure with chevron frieze & conical tower, Hill Complex kopje ---------------------
/** Dry-stone wall along a centre line: battered faces, course banding, optional chevron frieze. */
function stoneWall(p: THREE.Object3D, pts: [number, number][], hAt: (i: number) => number, yb: number, t0: number, t1: number, closed: boolean, chevron?: (i: number) => boolean): void {
  const n = pts.length, R = 12, m = new Mesher();
  const T = pts.map((_, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as [number, number];
  });
  const V = (i: number, k: number, s: number): V3 => {
    const th = t0 + (t1 - t0) * (k / R), [tx, tz] = T[i];
    return [pts[i][0] - tz * s * th / 2, yb + (hAt(i) * k) / R, pts[i][1] + tx * s * th / 2];
  };
  const stone = (i: number, k: number, s: number) => {
    if (chevron && s > 0 && k >= R - 4 && k < R - 1 && chevron(i)) { const ph = (i % 6), row = k - (R - 4); if (Math.abs(ph - 3) === row) return '#4f4a42'; }
    const base = k % 2 ? '#9d9686' : '#aaa392';
    const h = hash3(i, k, s + 2);
    return h > 0.85 ? shade(base, 0.86) : h < 0.12 ? shade(base, 1.08) : fbm(i * 0.4, k * 0.5, s) > 0.62 ? mix(base, '#6f6a55', 0.4) : base;
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n, [tx, tz] = T[i];
    for (let k = 0; k < R; k++) for (const s of [1, -1]) m.quad(V(i, k, s), V(j, k, s), V(j, k + 1, s), V(i, k + 1, s), stone(i, k, s), [-tz * s, 0, tx * s]);
    m.quad(V(i, R, 1), V(j, R, 1), V(j, R, -1), V(i, R, -1), hash3(i, 3, 3) > 0.5 ? '#8f8a78' : '#a19a88', [0, 1, 0]);
  }
  if (!closed) for (const [i, sg] of [[0, -1], [n - 1, 1]] as const) {
    const [tx, tz] = T[i];
    for (let k = 0; k < R; k++) m.quad(V(i, k, 1), V(i, k, -1), V(i, k + 1, -1), V(i, k + 1, 1), stone(i, k, 3), [tx * sg, 0, tz * sg]);
  }
  m.build(p, { flat: true, rough: 0.9 });
}
const arc = (cx: number, cz: number, a: number, b: number, t0: number, t1: number, n: number, wob = 0.006): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / (n - 1), w = 1 + wob * Math.sin(t * 7) / Math.max(a, b);
    return [cx + Math.cos(t) * a * w, cz + Math.sin(t) * b * w];
  });

const greatzimbabwe: Builder = gp => {
  const hf: HFn = (x, z) => {
    let y = 0.02 + 0.008 * fbm(x * 9, 1, z * 9);
    const k = Math.hypot((x + 0.33) / 1.0, (z + 0.33) / 0.8);
    y += 0.16 * Math.max(0, 1 - k / 0.18) ** 1.4 * (0.8 + 0.4 * fbm(x * 10, 2, z * 10));
    return y;
  };
  island(gp, 0.5, hf, '#b59b62', (x, y, z, _nx, ny) => {
    const t = y - 0.035;
    if (t > 0.05 && ny < 0.8) return hash3(Math.floor(x * 70), Math.floor(y * 70), 2) > 0.5 ? '#8a8578' : '#9d978a';
    const path = Math.abs(z - 0.3 + 0.15 * Math.sin(x * 4)) < 0.012 || Math.abs(x - 0.33 - 0.04 * z) < 0.01;
    if (path && t < 0.04) return '#c9a77a';
    return hash3(Math.floor(x * 60), 4, Math.floor(z * 60)) > 0.8 ? '#7f8a48' : mix('#b59b62', '#a38c55', fbm(x * 9, 0, z * 9));
  }, { rings: 40, segs: 100, side: strataSide(['#7a5a40', '#6b4f3a', '#8a6a48']) });
  const gy = onGround(hf);
  const CX = 0.06, CZ = 0.06, A = 0.36, B = 0.27, Y = 0.033;
  // Great Enclosure outer wall: low at the front, tall with chevron frieze at the back; two entrances
  const N = 120;
  const full = arc(CX, CZ, A, B, -Math.PI, Math.PI, N + 1).slice(0, N);
  const gaps = [[44, 47], [86, 89]];
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  const hOf = (pt: [number, number]) => { const t = Math.atan2((pt[1] - CZ) / B, (pt[0] - CX) / A); return 0.085 + 0.065 * Math.max(0, Math.cos(t + 1.75)) ** 1.2 + 0.004 * hash3(pt[0] * 99, 1, pt[1] * 99); };
  for (let i = 0; i < N; i++) {
    if (gaps.some(([a, b]) => i >= a && i <= b)) { if (cur.length) runs.push(cur); cur = []; continue; }
    cur.push(full[i]);
  }
  if (cur.length) runs.push(cur);
  if (runs.length > 2) { runs[0] = [...runs[runs.length - 1], ...runs[0]]; runs.pop(); }
  for (const run of runs) {
    stoneWall(gp, run, i => hOf(run[i]), Y, 0.034, 0.02, false, i => { const t = Math.atan2((run[i][1] - CZ) / B, (run[i][0] - CX) / A); return t < -0.7 && t > -2.6; });
  }
  // Parallel passage: inner wall hugging the back of the enclosure
  const inner = arc(CX, CZ, A * 0.87, B * 0.8, -2.5, -0.5, 40);
  stoneWall(gp, inner, i => 0.1 - 0.025 * Math.abs(i - 20) / 20, Y, 0.024, 0.016, false);
  // Conical tower and its small twin
  const tx = CX + 0.16, tz = CZ - 0.12;
  const cg = new THREE.LatheGeometry([[0.0001, 0], [0.052, 0], [0.047, 0.07], [0.039, 0.15], [0.031, 0.22], [0.029, 0.23], [0.0001, 0.23]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
  add(gp, paintFaces(cg, '#a39c8c', (_x, y, _z, _nx, ny) => ny > 0.9 ? '#8b8a6a' : Math.floor(y * 160) % 2 ? (hash3(Math.floor(_x * 200), Math.floor(y * 160), Math.floor(_z * 200)) > 0.8 ? '#8e8778' : '#aaa392') : '#9a9383'),
    mat('#ffffff', { vc: true, flat: true }), tx, Y, tz, 1, 1, 1);
  blob(gp, '#6d7a40', tx, Y + 0.23, tz, 0.028, 0.006, 0.028);
  cone(gp, '#a39c8c', tx - 0.07, Y, tz + 0.02, 0.022, 0.06, 14);
  // Internal enclosures (low curved walls of former homesteads)
  stoneWall(gp, arc(CX - 0.12, CZ + 0.02, 0.07, 0.06, 0.3, 4.8, 22), () => 0.03, Y, 0.016, 0.012, false);
  stoneWall(gp, arc(CX - 0.02, CZ + 0.1, 0.05, 0.04, 3.4, 6.6, 16), () => 0.025, Y, 0.014, 0.01, false);
  // Hill Complex: granite boulders on the kopje, walls threaded between them
  const hx = -0.33, hz = -0.33;
  for (let i = 0; i < 9; i++) {
    const a = hash3(i, 5, 1) * 6.28, d = 0.03 + hash3(i, 5, 2) * 0.1, x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d * 0.8;
    ball(gp, i % 2 ? '#7d786e' : '#8f8a80', x, gy(x, z) + 0.015, z, 0.05 + hash3(i, 5, 3) * 0.04, 0.035 + hash3(i, 5, 4) * 0.035, 0.05, a);
  }
  stoneWall(gp, arc(hx, hz, 0.13, 0.1, 0.1, 1.9, 18), () => 0.04, 0.02, 0.018, 0.012, false);
  // Trees: two great trees inside, msasa woodland around
  leafTree(gp, CX - 0.05, Y, CZ - 0.02, 0.15, '#3f6b30', 3);
  leafTree(gp, CX + 0.05, Y, CZ + 0.08, 0.12, '#4a7a35', 8);
  scatter(40, 21, (x, z, i) => {
    const e = ((x - CX) / A) ** 2 + ((z - CZ) / B) ** 2;
    if (e > 1.4 && Math.hypot(x - hx, z - hz) > 0.12) leafTree(gp, x, gy(x, z), z, 0.04 + hash3(i, 1, 2) * 0.035, hash3(i, 2, 2) > 0.5 ? '#6b7a35' : '#557a35', i + 20);
  }, 0.47);
  person(gp, CX - 0.02, Y, CZ + 0.25, '#e11d48', 0);
  person(gp, CX + 0.01, Y, CZ + 0.26, '#2563eb', 2);
};

// ---- El Jem: three-storey Roman arena of golden stone in a Tunisian town -----------------------------------
const eljem: Builder = gp => {
  const STONE = '#c9a66b';
  const flat: HFn = (x, z) => 0.003 * fbm(x * 10, 0, z * 10);
  const A = 0.35, B = 0.29, CZ = -0.02, Y = 0.035;
  const ell = (x: number, z: number) => (x / A) ** 2 + ((z - CZ) / B) ** 2;
  island(gp, 0.5, flat, '#d9c7a2', (x, _y, z) => {
    const e = ell(x, z);
    if (e < 1.35) return hash3(Math.floor(x * 70), 1, Math.floor(z * 70)) > 0.75 ? '#cbb68c' : '#d6c094';
    if (Math.abs(z - 0.42 + x * 0.1) < 0.02) return '#8c8478';
    return hash3(Math.floor(x * 50), 2, Math.floor(z * 50)) > 0.85 ? '#cdb994' : '#ddcfb2';
  }, { rings: 24, segs: 96, side: strataSide(EARTH) });
  // Arena floor with the hypogeum trench, podium wall and raked seating
  const sand = add(gp, CYL(40), mat('#d8be8a'), 0, Y + 0.004, CZ, 0.3, 0.008, 0.3 * (B / A));
  sand.scale.z = 0.3 * 0.78;
  box(gp, '#4a3a2a', 0, Y + 0.004, CZ, 0.17, 0.0085, 0.018);
  box(gp, '#4a3a2a', 0, Y + 0.004, CZ, 0.018, 0.0085, 0.08);
  const seat: [number, number][] = [[0.16, 0], [0.16, 0.035]];
  for (let k = 0; k < 9; k++) { const r = 0.165 + k * 0.018, yy = 0.035 + k * 0.017; seat.push([r, yy], [r, yy + 0.017]); }
  seat.push([A - 0.02, 0.035 + 9 * 0.017], [A - 0.02, 0]);
  const sg = new THREE.LatheGeometry(seat.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  const cav = add(gp, paintFaces(sg, STONE, (x, y, z, _nx, ny) => {
    if (ny < 0.5) return Math.floor(y * 58) % 2 ? '#8a6f48' : '#a4865a';
    return hash3(Math.floor(Math.atan2(z, x) * 30), Math.floor(y * 58), 1) > 0.8 ? '#b89660' : Math.floor(y * 58) % 2 ? '#cfae74' : '#c4a36a';
  }), mat('#ffffff', { vc: true, flat: true }), 0, Y, CZ, 1, 1, B / A);
  cav.castShadow = true;
  // Facade: 36 arched bays × 3 storeys, engaged half-columns, cornices; western breach knocked open
  const N = 36, TH = 0.064;
  const pts = Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2; return [Math.cos(t) * A, CZ + Math.sin(t) * B] as [number, number]; });
  let per = 0;
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const W = per / N;
  const bayGeo = (tier: number) => g('cb:jem' + tier + ':' + W.toFixed(4), () => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, TH); s.lineTo(-W / 2, TH); s.closePath();
    const aw = W * 0.56, ah = tier === 3 ? TH * 0.42 : TH * 0.72, r = aw / 2, y0 = tier === 3 ? TH * 0.35 : TH * 0.08;
    const hole = new THREE.Path();
    if (tier === 3) { hole.moveTo(-aw * 0.35, y0); hole.lineTo(aw * 0.35, y0); hole.lineTo(aw * 0.35, y0 + ah); hole.lineTo(-aw * 0.35, y0 + ah); hole.closePath(); } else {
      hole.moveTo(-aw / 2, y0); hole.lineTo(aw / 2, y0); hole.lineTo(aw / 2, y0 + ah - r); hole.absarc(0, y0 + ah - r, r, 0, Math.PI, false); hole.lineTo(-aw / 2, y0); hole.closePath();
    }
    s.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false, curveSegments: 6 });
    eg.translate(0, 0, -0.011);
    eg.computeVertexNormals();
    return eg;
  });
  const breach = (i: number) => (i >= 14 && i <= 16 ? 3 : i === 13 || i === 17 ? 1 : i === 12 || i === 18 ? 2 : 0);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const tx = b[0] - a[0], tz = b[1] - a[1], w = Math.hypot(tx, tz), ry = Math.atan2(-tz, tx);
    const nx = tz / w, nz = -tx / w, o = 1;
    const br = breach(i), tiers = br === 3 ? 0 : br === 1 ? 1 : br === 2 ? 2 : (i >= 26 || i <= 4) ? 4 : 3;
    for (let t = 0; t < Math.min(tiers, 3); t++) {
      add(gp, bayGeo(t), mat(shade(STONE, 1.03 - t * 0.04 + hash3(i, t, 1) * 0.04)), mx, Y + t * TH, mz, w / W, 1, 1, ry + Math.PI);
      // engaged half-column at the left pier + cornice block
      cyl(gp, shade(STONE, 1.06), a[0] + nx * o * 0.012, Y + t * TH + 0.003, a[1] + nz * o * 0.012, 0.0055, TH - 0.008, 7);
      box(gp, shade(STONE, 0.9), mx + nx * o * 0.006, Y + (t + 1) * TH - 0.006, mz + nz * o * 0.006, w + 0.004, 0.006, 0.034, ry);
    }
    if (tiers === 4) {
      add(gp, bayGeo(3), mat(shade(STONE, 0.94)), mx, Y + 3 * TH, mz, w / W, 0.7, 1, ry + Math.PI);
    }
    if (br) {
      // rubble spilling from the breach
      for (let k = 0; k < 4; k++) {
        const rr = 1.02 + hash3(i, k, 4) * 0.12, px = mx * rr + (hash3(i, k, 5) - 0.5) * 0.03, pz = CZ + (mz - CZ) * rr + (hash3(i, k, 6) - 0.5) * 0.03;
        ball(gp, shade(STONE, 0.85 + hash3(i, k, 7) * 0.2), px, Y + 0.004, pz, 0.014 + hash3(i, k, 8) * 0.012, 0.01, 0.016, hash3(i, k, 9) * 3);
      }
    }
  }
  // Town: flat-roofed whitewashed houses with blue doors, palms and a few people
  scatter(150, 5, (x, z, i) => {
    if (ell(x, z) < 1.3 || Math.abs(z - 0.42 + x * 0.1) < 0.03) return;
    const w = 0.026 + hash3(i, 1, 1) * 0.026, d = 0.026 + hash3(i, 1, 2) * 0.022, h = 0.016 + hash3(i, 1, 3) * 0.026, ry = Math.atan2(x, z);
    const c = ['#f4efe4', '#ece3d0', '#e8dcc2', '#f8f5ee', '#dccaa6'][i % 5];
    box(gp, c, x, Y, z, w, h, d, ry);
    box(gp, shade(c, 0.9), x, Y + h, z, w + 0.002, 0.003, d + 0.002, ry);
    if (hash3(i, 2, 2) > 0.4) box(gp, i % 3 ? '#2f6db5' : '#1f8fb8', x + Math.sin(ry) * d / 2, Y, z + Math.cos(ry) * d / 2, 0.008, 0.014, 0.002, ry);
  }, 0.5);
  for (const [x, z] of [[-0.36, 0.3], [0.38, 0.28], [0.12, 0.33], [-0.42, -0.1], [0.43, -0.18]] as [number, number][]) palm(gp, x, Y, z, 0.13, 0.15, hash3(x, z, 1) * 6, '#5b8a3a', Math.round(x * 100));
  person(gp, 0.02, Y, 0.3, '#ef4444', 1); person(gp, 0.05, Y, 0.31, '#0ea5e9', 3); person(gp, -0.2, Y, 0.27, '#eab308', 0);
};

// ---- El Capitolio, Havana: domed neoclassical capitol, Paseo del Prado with 1950s cars and royal palms ---------
const capitolio: Builder = gp => {
  const C = '#ece4d2', CD = '#ddd4c0', Y = 0.035;
  island(gp, 0.5, () => 0, '#cfc8bb', (x, _y, z) => {
    if (z > 0.27) return Math.abs(z - 0.355) < 0.002 && Math.sin(x * 140) > 0 ? '#f4f1e8' : '#50545b';
    if (z > 0.22) return '#d9d2c4';
    if (z > 0.09 && Math.abs(x) > 0.12 && Math.abs(x) < 0.42) return hash3(Math.floor(x * 80), 0, Math.floor(z * 80)) > 0.8 ? '#4f8a3f' : '#5f9a4a';
    return hash3(Math.floor(x * 60), 1, Math.floor(z * 60)) > 0.85 ? '#c4bcad' : '#cfc8bb';
  }, { rings: 24, segs: 96, side: strataSide(['#8d877c', '#7c766b']) });
  const P = Y + 0.035;
  rbox(gp, CD, 0, Y, -0.05, 0.84, 0.035, 0.22, 0.004);
  for (let i = 0; i < 40; i++) box(gp, '#c9c0ac', -0.41 + i * 0.021, Y + 0.012, 0.0605, 0.017, 0.002, 0.002);
  // Wings with giant-order colonnades
  for (const sx of [-1, 1]) {
    const wx = sx * 0.27;
    rbox(gp, C, wx, P, -0.06, 0.29, 0.1, 0.16, 0.003);
    rbox(gp, shade(C, 1.02), sx * 0.405, P, -0.055, 0.03, 0.105, 0.175, 0.003);
    for (let k = 0; k < 12; k++) {
      const x = sx * (0.14 + k * 0.022);
      box(gp, '#d8cfbb', x, P, 0.04, 0.011, 0.004, 0.011);
      cyl(gp, '#f3ecdc', x, P + 0.004, 0.04, 0.0048, 0.078, 8);
      box(gp, '#e2d9c5', x, P + 0.082, 0.04, 0.012, 0.004, 0.012);
      if (k < 11) for (const wy of [0.012, 0.05]) box(gp, '#6b5f50', x + sx * 0.011, P + wy, 0.0205, 0.009, 0.026, 0.002);
    }
    box(gp, '#e6dcc8', wx - sx * 0.005, P + 0.086, 0.01, 0.28, 0.016, 0.066);
    box(gp, '#d6ccb8', wx - sx * 0.005, P + 0.1, -0.06, 0.28, 0.006, 0.17);
    for (let k = 0; k < 26; k++) box(gp, '#efe7d6', sx * (0.135 + k * 0.0105), P + 0.102, 0.04, 0.003, 0.008, 0.003);
    box(gp, '#e6dcc8', wx - sx * 0.005, P + 0.109, 0.04, 0.28, 0.003, 0.006);
  }
  // Central block, portico of 12 columns, attic, bronze doors, grand staircase with statues
  rbox(gp, shade(C, 1.02), 0, P, -0.05, 0.22, 0.13, 0.2, 0.003);
  for (const z of [0.105, 0.078]) for (let k = 0; k < 6; k++) {
    const x = -0.075 + k * 0.03;
    box(gp, '#d8cfbb', x, P, z, 0.013, 0.004, 0.013);
    cyl(gp, '#f6f0e2', x, P + 0.004, z, 0.0058, 0.098, 9);
    box(gp, '#e2d9c5', x, P + 0.102, z, 0.014, 0.005, 0.014);
  }
  box(gp, '#e9e0cc', 0, P + 0.107, 0.075, 0.19, 0.018, 0.075);
  box(gp, '#ddd3bf', 0, P + 0.125, 0.07, 0.17, 0.012, 0.06);
  box(gp, '#5b4a35', 0, P, 0.0505, 0.03, 0.06, 0.003);
  for (let k = 0; k < 10; k++) {
    const zf = 0.235 - k * 0.0118;
    box(gp, k % 2 ? '#e4dccb' : '#dad2c0', 0, Y, (0.118 + zf) / 2, 0.17, (k + 1) * 0.0035, zf - 0.118);
  }
  for (const sx of [-1, 1]) {
    rbox(gp, '#d8cfbb', sx * 0.105, Y, 0.2, 0.03, 0.03, 0.04, 0.003);
    cyl(gp, '#5e4b33', sx * 0.105, Y + 0.03, 0.2, 0.007, 0.022, 7);
    blob(gp, '#5e4b33', sx * 0.105, Y + 0.058, 0.2, 0.006);
    blob(gp, '#5e4b33', sx * 0.098, Y + 0.04, 0.204, 0.009, 0.012, 0.007);
  }
  // Dome: square base, colonnaded drum, windowed attic drum, ribbed golden dome, lantern
  const D = P + 0.13, DZ = -0.05;
  rbox(gp, CD, 0, D, DZ, 0.17, 0.028, 0.17, 0.003);
  cyl(gp, '#e9e1cf', 0, D + 0.028, DZ, 0.09, 0.012, 32);
  cyl(gp, '#e3dbc8', 0, D + 0.04, DZ, 0.07, 0.078, 30);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    cyl(gp, '#f5efe2', Math.cos(a) * 0.081, D + 0.04, DZ + Math.sin(a) * 0.081, 0.0042, 0.07, 7);
    if (k % 2 === 0) box(gp, '#6b6050', Math.cos(a + 0.13) * 0.0705, D + 0.06, DZ + Math.sin(a + 0.13) * 0.0705, 0.012, 0.03, 0.003, Math.PI / 2 - a - 0.13);
  }
  cyl(gp, '#e8e0cc', 0, D + 0.11, DZ, 0.089, 0.012, 32);
  cyl(gp, '#efe8d8', 0, D + 0.122, DZ, 0.075, 0.006, 32);
  cyl(gp, '#e6dfcc', 0, D + 0.128, DZ, 0.066, 0.034, 30);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    box(gp, '#6b6050', Math.cos(a) * 0.0665, D + 0.138, DZ + Math.sin(a) * 0.0665, 0.01, 0.014, 0.003, Math.PI / 2 - a);
  }
  const prof: [number, number][] = [[0.066, 0], [0.064, 0.025], [0.058, 0.05], [0.047, 0.073], [0.031, 0.091], [0.014, 0.1], [0.0001, 0.102]];
  const DY = D + 0.162;
  lathe(gp, prof, '#d9c27c', 0, DY, DZ, 32);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (let j = 0; j < prof.length - 2; j++) {
      const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
      rod(gp, [Math.cos(a) * (r0 + 0.002), DY + y0, DZ + Math.sin(a) * (r0 + 0.002)], [Math.cos(a) * (r1 + 0.002), DY + y1, DZ + Math.sin(a) * (r1 + 0.002)], 0.0022, '#e8d9a0', 4);
    }
  }
  cyl(gp, '#efe8d8', 0, DY + 0.098, DZ, 0.02, 0.028, 14);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; cyl(gp, '#f8f3e8', Math.cos(a) * 0.022, DY + 0.098, DZ + Math.sin(a) * 0.022, 0.0025, 0.026, 5); }
  lathe(gp, [[0.024, 0], [0.02, 0.012], [0.008, 0.02], [0.0001, 0.022]], '#d9c27c', 0, DY + 0.126, DZ, 16);
  cone(gp, '#e5c66a', 0, DY + 0.146, DZ, 0.005, 0.03, 8);
  // Paseo del Prado: royal palms, lamps, classic cars, strollers
  for (const x of [-0.42, -0.28, 0.28, 0.42]) palm(gp, x, Y, 0.245, 0.2, 0.05, 1.2, '#4f8a3a', Math.round(x * 50 + 9));
  for (const x of [-0.18, 0.18]) { rod(gp, [x, Y, 0.25], [x, Y + 0.07, 0.25], 0.0018, '#2f3438', 5); blob(gp, '#f8f1d8', x, Y + 0.072, 0.25, 0.006); }
  const cars: [number, number, number, string][] = [[-0.3, 0.31, 0, '#e88bb5'], [-0.06, 0.31, 0, '#3fb6a8'], [0.2, 0.31, 0, '#d9483b'], [-0.2, 0.39, Math.PI, '#4caf50'], [0.06, 0.395, Math.PI, '#f2c94c'], [0.27, 0.38, Math.PI, '#6ec1e4']];
  for (const [x, z, ry, c] of cars) classicCar(gp, x, Y, z, ry, c);
  person(gp, -0.06, Y, 0.235, '#f43f5e', 1); person(gp, -0.035, Y, 0.24, '#facc15', 2); person(gp, 0.33, Y, 0.235, '#22c55e', 3); person(gp, 0.06, Y + 0.02, 0.165, '#3b82f6', 0);
};

// ---- Panama Canal: Miraflores twin locks, Panamax ship towed by mules, control house, jungle hills ----------
const panamacanal: Builder = gp => {
  const ZA = -0.075, ZB = 0.065, LW = 0.1, WT = 0.105;
  const hf: HFn = (x, z) => {
    if (z > ZA - LW / 2 - 0.03 && z < ZB + LW / 2 + 0.03) return 0.0;
    let y = WT - 0.035 + 0.006 * fbm(x * 12, 0, z * 12);
    if (z < -0.22) y += 0.1 * sstep(-0.22, -0.48, z) * (0.6 + 0.6 * fbm(x * 5, 1, z * 5));
    return y;
  };
  island(gp, 0.5, hf, '#5f9a4a', (x, y, z) => {
    const t = y - 0.035;
    if (t < 0.002) return '#7d7a72';
    if (t > 0.09) return hash3(Math.floor(x * 50), Math.floor(y * 50), Math.floor(z * 50)) > 0.5 ? '#3f7a35' : '#4f8a3e';
    if (z > 0.17 && z < 0.2) return '#cfcac0';
    return hash3(Math.floor(x * 60), 2, Math.floor(z * 60)) > 0.8 ? '#4f8a3f' : mix('#5f9a4a', '#6fa855', fbm(x * 8, 0, z * 8));
  }, { rings: 40, segs: 110, side: strataSide(EARTH) });
  const Y = 0.035, CON = '#cfcbc2', TOP = Y + WT - 0.035;
  // Concrete chamber walls (two outer walls + centre wall), stepped at the mid-gate
  for (const [z, w] of [[ZA - LW / 2 - 0.014, 0.028], [(ZA + ZB) / 2, ZB - ZA - LW], [ZB + LW / 2 + 0.014, 0.028]] as [number, number][]) {
    box(gp, CON, 0, Y - 0.0, z, 0.98, TOP - Y, w);
    box(gp, '#bdb8ad', 0, TOP, z, 0.98, 0.002, w * 0.98);
    for (const dz of [-w / 4, w / 4]) box(gp, '#5b5b5b', 0, TOP + 0.002, z + dz, 0.98, 0.0015, 0.002);
    for (let k = 0; k < 14; k++) box(gp, '#f2c230', -0.45 + k * 0.07, TOP + 0.002, z + (z < ZA ? w / 2 - 0.002 : z > ZB ? -w / 2 + 0.002 : 0), 0.02, 0.0012, 0.002);
  }
  // Water: lane A both chambers low; lane B upper chamber (west) high with the ship, lower chamber (east) low
  const water = (x0: number, x1: number, z: number, h: number) => {
    add(gp, BOX(), mat('#3f7f78', { rough: 0.25 }), (x0 + x1) / 2, Y + h / 2, z, x1 - x0, h, LW);
  };
  water(-0.49, 0.49, ZA, 0.035);
  water(-0.49, 0.0, ZB, 0.065);
  water(0.0, 0.49, ZB, 0.035);
  for (let i = 0; i < 26; i++) box(gp, '#d6f0ee', -0.47 + hash3(i, 1, 1) * 0.94, Y + (hash3(i, 1, 1) < 0.5 && hash3(i, 2, 2) > 0.5 ? 0.065 : 0.035), (hash3(i, 2, 2) > 0.5 ? ZB : ZA) + (hash3(i, 3, 3) - 0.5) * 0.07, 0.012, 0.001, 0.002);
  // Mitre gates: lane B closed (V pointing upstream), lane A open & folded into wall recesses
  const GC = '#46525e';
  for (const sz of [-1, 1]) {
    beam(gp, [0.0, Y + 0.035, ZB + sz * LW / 2], [-0.025, Y + 0.035, ZB + sz * 0.002], 0.008, 0.07, GC).position.y = Y + 0.04;
    box(gp, GC, 0.004, Y, ZA + sz * (LW / 2 - 0.004), 0.05, 0.075, 0.006);
  }
  // Panamax container ship in the upper chamber of lane B
  const S = grp(gp, -0.25, Y + 0.065, ZB);
  const hullPlan: [number, number][] = [[-0.22, -0.042], [0.15, -0.042], [0.2, -0.03], [0.225, 0], [0.2, 0.03], [0.15, 0.042], [-0.22, 0.042]];
  prism(S, hullPlan, -0.004, 0.012, '#b23a2c');
  prism(S, hullPlan, 0.008, 0.05, '#1f2329');
  prism(S, hullPlan.map(([x, z]) => [x * 0.995, z * 0.97] as [number, number]), 0.058, 0.004, '#3b4048');
  const CC = ['#c2552c', '#a8432b', '#d9792e', '#7b2e2e', '#2f7f86', '#d6d3cc', '#5778a6', '#b9472f', '#e08a2c'];
  for (let b = 0; b < 11; b++) for (let r = 0; r < 5; r++) {
    const hgt = 2 + (hash3(b, r, 1) > 0.35 ? 1 : 0) + (b > 1 && b < 9 && hash3(b, r, 2) > 0.5 ? 1 : 0);
    for (let k = 0; k < hgt; k++) box(S, CC[Math.floor(hash3(b, r, k + 5) * CC.length)], -0.135 + b * 0.0285, 0.062 + k * 0.0135, (r - 2) * 0.0158, 0.027, 0.0128, 0.0152);
  }
  rbox(S, '#f4f4f2', -0.19, 0.062, 0, 0.04, 0.07, 0.076, 0.003);
  for (let k = 0; k < 4; k++) box(S, '#334155', -0.17, 0.07 + k * 0.016, 0, 0.0015, 0.005, 0.07);
  box(S, '#f4f4f2', -0.185, 0.128, 0, 0.026, 0.006, 0.1);
  box(S, '#334155', -0.172, 0.12, 0, 0.002, 0.006, 0.098);
  rbox(S, '#e7e5e4', -0.205, 0.132, 0, 0.016, 0.03, 0.022, 0.003);
  box(S, '#b91c1c', -0.205, 0.158, 0, 0.017, 0.006, 0.023);
  rod(S, [0.21, 0.058, 0], [0.21, 0.09, 0], 0.0015, '#e5e7eb', 4);
  // Electric "mules" on the wall tops, cables to the ship
  for (const [mx, sz] of [[-0.06, 1], [-0.06, -1], [-0.42, 1], [-0.42, -1]] as [number, number][]) {
    const wz = ZB + sz * (LW / 2 + 0.014);
    const m = grp(gp, mx, TOP, wz);
    rbox(m, '#d4d8dc', 0, 0.002, 0, 0.034, 0.016, 0.016, 0.003);
    rbox(m, '#e6e9ec', 0.004, 0.018, 0, 0.016, 0.009, 0.014, 0.002);
    box(m, '#1e293b', 0.0125, 0.02, 0, 0.001, 0.005, 0.012);
    for (const ex of [-1, 1]) box(m, '#f2c230', ex * 0.018, 0.003, 0, 0.003, 0.004, 0.016);
    rod(gp, [mx + 0.01, TOP + 0.012, wz - sz * 0.006], [mx + (mx < -0.2 ? -0.02 : 0.03), Y + 0.12, ZB + sz * 0.035], 0.0008, '#1f2937', 3);
  }
  // Control house with red tiled roof on the centre wall, visitor-centre terraces, jungle hills
  const CZW = (ZA + ZB) / 2;
  rbox(gp, '#f3f1ea', 0.06, TOP, CZW, 0.06, 0.04, 0.035, 0.003);
  for (let k = 0; k < 5; k++) box(gp, '#3a4a5a', 0.038 + k * 0.011, TOP + 0.022, CZW + 0.0177, 0.006, 0.01, 0.001);
  gable(gp, 0.068, 0.02, 0.042, '#b4532a', 0.06, TOP + 0.04, CZW);
  rbox(gp, '#f4f2ec', 0.27, TOP, 0.28, 0.16, 0.035, 0.09, 0.003);
  rbox(gp, '#f4f2ec', 0.27, TOP + 0.035, 0.26, 0.13, 0.03, 0.06, 0.003);
  box(gp, '#2d3d4f', 0.27, TOP + 0.04, 0.2905, 0.12, 0.016, 0.002);
  box(gp, '#2d3d4f', 0.27, TOP + 0.008, 0.3255, 0.15, 0.016, 0.002);
  for (let k = 0; k < 6; k++) person(gp, 0.21 + k * 0.022, TOP + 0.065, 0.245 + (k % 2) * 0.006, ['#ef4444', '#3b82f6', '#facc15', '#22c55e'][k % 4], k);
  const gy = onGround(hf);
  scatter(60, 41, (x, z, i) => {
    if (z < ZA - LW / 2 - 0.05 || (z > ZB + LW / 2 + 0.05 && !(x > 0.15 && z > 0.2 && z < 0.36))) {
      if (z > 0.17 && z < 0.2) return;
      leafTree(gp, x, gy(x, z), z, 0.04 + hash3(i, 2, 2) * 0.035, hash3(i, 3, 3) > 0.5 ? '#2f6b30' : '#3f7d38', i);
    }
  }, 0.48);
  for (const [x, z] of [[-0.3, 0.25], [-0.12, 0.3], [0.05, 0.26]] as [number, number][]) palm(gp, x, gy(x, z), z, 0.1, 0.12, 0.5, '#4f8a3a', Math.round(x * 90));
};

// ---- Tikal Temple I: nine steep limestone tiers, frontal stair, roof-combed shrine, Great Plaza and jungle -----
const jungle = (p: THREE.Object3D, x: number, y: number, z: number, s: number, seed: number, cols = ['#2f6b2f', '#3b7d34', '#275c2a', '#4a8a3a']) => {
  const c = cols[Math.floor(hash3(seed, 1, 1) * cols.length)];
  blob(p, c, x, y + s * 0.55, z, s * 0.62, s * 0.5, s * 0.62, hash3(seed, 2, 2) * 6);
  if (hash3(seed, 3, 3) > 0.45) blob(p, shade(c, 1.12), x + s * 0.25, y + s * 0.85, z - s * 0.1, s * 0.4, s * 0.32, s * 0.4);
};
const tikal: Builder = gp => {
  const CZ = -0.1;
  const hf: HFn = (x, z) => {
    const r = Math.hypot(x, z);
    let y = 0.02 + 0.03 * fbm(x * 5, 2, z * 5) * sstep(0.25, 0.45, r);
    const plaza = Math.abs(x) < 0.3 && z > 0.06 && z < 0.4;
    if (plaza) y = 0.012;
    else if (Math.abs(x) < 0.34 && z > 0.02 && z < 0.44) y = Math.min(y, 0.012 + (y - 0.012) * sstep(0.3, 0.34, Math.abs(x)) + 0.02 * sstep(0.4, 0.44, z));
    return y;
  };
  const GRASS = '#6f9a45';
  island(gp, 0.5, hf, GRASS, (x, y, z, _nx, ny) => {
    if (y < 0.05 && Math.abs(x) < 0.3 && z > 0.06 && z < 0.4 && ny > 0.9) {
      if (Math.abs(x) < 0.05 && z < 0.2) return mix('#c9c0a8', '#b4ab94', hash3(Math.floor(x * 70), 1, Math.floor(z * 70)));
      return mix('#7fae4c', '#6b9c40', fbm(x * 14, 1, z * 14));
    }
    return mix('#3f6b2c', '#4f7d35', fbm(x * 9, 0, z * 9));
  }, { rings: 28, segs: 96, side: strataSide(EARTH) });

  const STONE = ['#b8b09d', '#a69f8c', '#c6bfab', '#8f897a', '#6f6c62'];
  const stonePaint = (k: number): Paint => (x, y, z, nx, ny) => {
    const n = fbm(x * 30 + k, y * 40, z * 30);
    if (ny > 0.6 && hash3(Math.floor(x * 50), k, Math.floor(z * 50)) > 0.7) return '#6f8150';
    if (Math.sin((nx > 0.5 || nx < -0.5 ? z : x) * 260 + n * 6) > 0.86) return STONE[4];
    return n > 0.62 ? STONE[3] : n > 0.5 ? STONE[1] : n < 0.32 ? STONE[2] : STONE[0];
  };
  const N = 9, TH = 0.044, W0 = 0.36, D0 = 0.3;
  let y = 0.035 + 0.008;
  rbox(gp, STONE[1], 0, 0.03, CZ, W0 + 0.05, 0.016, D0 + 0.05, 0.004);
  for (let k = 0; k < N; k++) {
    const w = W0 - k * 0.026, d = D0 - k * 0.024;
    frustum(gp, w, d, w - 0.016, d - 0.014, TH * 0.78, 0, y, CZ, stonePaint(k), [5, 2, 4]);
    // projecting apron moulding with inset corners
    box(gp, STONE[0], 0, y + TH * 0.6, CZ, w - 0.04, TH * 0.22, d + 0.002);
    box(gp, STONE[0], 0, y + TH * 0.6, CZ, w + 0.002, TH * 0.22, d - 0.04);
    box(gp, STONE[2], 0, y + TH * 0.78, CZ, w - 0.012, TH * 0.22, d - 0.012);
    y += TH;
  }
  const TOP = y;
  // Frontal stair (ruined, rubbly edges) from the plaza to the summit platform
  const zf0 = CZ + D0 / 2 + 0.07, zf1 = CZ + (D0 - (N - 1) * 0.024) / 2 - 0.004, NS = 34;
  for (let s = 0; s < NS; s++) {
    const t = s / NS, yy = 0.035 + (TOP - 0.035) * t, zz = zf0 + (zf1 - zf0) * t, h = (TOP - 0.035) / NS;
    const ww = 0.072 + 0.006 * (hash3(s, 7, 1) - 0.5);
    box(gp, s % 2 ? '#a8a08c' : '#bdb5a1', 0, yy, (zz + CZ) / 2, ww, h * 1.02, zz - CZ);
    if (hash3(s, 2, 2) > 0.6) box(gp, '#8f897a', (hash3(s, 3, 3) > 0.5 ? 1 : -1) * (ww / 2 + 0.004), yy, zz - 0.006, 0.01, h * 1.6, 0.012);
  }
  for (const sx of [-1, 1]) beam(gp, [sx * 0.04, 0.04, zf0 - 0.004], [sx * 0.04, TOP + 0.002, zf1 - 0.002], 0.008, 0.006, '#9d9683');
  // Summit shrine: three dark doorways, then the tall three-tier roof comb
  const SZ = CZ - 0.01;
  rbox(gp, STONE[1], 0, TOP, SZ, 0.13, 0.016, 0.1, 0.002);
  frustum(gp, 0.11, 0.08, 0.104, 0.074, 0.058, 0, TOP + 0.016, SZ, stonePaint(20), [4, 2, 3]);
  box(gp, '#24211d', 0, TOP + 0.016, SZ + 0.0385, 0.022, 0.034, 0.004);
  box(gp, STONE[2], 0, TOP + 0.05, SZ + 0.0405, 0.11, 0.008, 0.004);
  const CB = TOP + 0.074;
  frustum(gp, 0.1, 0.05, 0.086, 0.04, 0.04, 0, CB, SZ - 0.02, stonePaint(21), [4, 2, 2]);
  frustum(gp, 0.082, 0.04, 0.07, 0.032, 0.038, 0, CB + 0.04, SZ - 0.022, stonePaint(22), [4, 2, 2]);
  frustum(gp, 0.066, 0.03, 0.05, 0.024, 0.034, 0, CB + 0.078, SZ - 0.024, stonePaint(23), [3, 2, 2]);
  // carved panels on the comb front
  for (const [yy, w] of [[CB + 0.012, 0.06], [CB + 0.05, 0.044], [CB + 0.086, 0.03]] as [number, number][]) {
    box(gp, '#7d786b', 0, yy, SZ + 0.006, w, 0.018, 0.002);
    box(gp, '#3e3a33', -w * 0.25, yy + 0.006, SZ + 0.0072, w * 0.18, 0.006, 0.0015);
    box(gp, '#3e3a33', w * 0.25, yy + 0.006, SZ + 0.0072, w * 0.18, 0.006, 0.0015);
  }
  // plants clinging to the tiers
  for (let i = 0; i < 26; i++) {
    const k = Math.floor(hash3(i, 1, 9) * 7), a = hash3(i, 2, 9);
    const w = W0 - k * 0.026, d = D0 - k * 0.024, yy = 0.043 + (k + 1) * TH;
    const side = Math.floor(hash3(i, 3, 9) * 3);
    const [x, z] = side === 0 ? [(a - 0.5) * w * 0.9, CZ - d / 2 + 0.01] : [(side === 1 ? -1 : 1) * (w / 2 - 0.01), CZ + (a - 0.5) * d * 0.8];
    if (Math.abs(x) < 0.06 && z > CZ) continue;
    blob(gp, hash3(i, 4, 9) > 0.5 ? '#557a35' : '#46702f', x, yy - 0.004, z, 0.012, 0.007, 0.012);
  }
  const gy = onGround(hf);
  // Stelae and round altars lining the plaza
  for (let i = 0; i < 7; i++) {
    const x = -0.24 + i * 0.08;
    if (Math.abs(x) < 0.05) continue;
    rbox(gp, '#9e978a', x, gy(x, 0.12), 0.12, 0.018, 0.045, 0.008, 0.002);
    cyl(gp, '#a59e90', x, gy(x, 0.14), 0.14, 0.022, 0.01, 10);
  }
  // North Acropolis on the left and Central Acropolis on the right: low ruined platforms
  for (const [x, z, w, d, h] of [[-0.38, 0.05, 0.12, 0.2, 0.05], [-0.36, -0.12, 0.1, 0.1, 0.08], [0.38, 0.12, 0.1, 0.24, 0.04], [0.37, -0.08, 0.1, 0.1, 0.07]] as number[][]) {
    frustum(gp, w, d, w - 0.02, d - 0.02, h, x, gy(x, z), z, stonePaint(Math.round(x * 100)), [3, 1, 3]);
    rbox(gp, STONE[0], x, gy(x, z) + h, z, w * 0.5, 0.025, d * 0.35, 0.002);
    box(gp, '#2a2622', x + w * 0.26 * Math.sign(-x) - 0.0, gy(x, z) + h + 0.002, z, 0.002, 0.016, 0.012);
  }
  // Dense rainforest canopy all around, with tall emergent ceibas
  scatter(130, 13, (x, z, i) => {
    const r = Math.hypot(x, z);
    if (Math.abs(x) < 0.33 && z > 0.0 && z < 0.44) return;
    if (Math.abs(x) < 0.26 && z > CZ - 0.2 && z < 0.05) return;
    if (Math.abs(x) > 0.3 && Math.abs(x) < 0.46 && z > -0.2 && z < 0.26) return;
    jungle(gp, x, gy(x, z), z, 0.05 + 0.04 * hash3(i, 5, 5) + 0.03 * sstep(0.2, 0.45, r), i);
  }, 0.48);
  for (const [x, z] of [[-0.22, -0.32], [0.3, -0.3], [-0.44, -0.2]] as [number, number][]) {
    cyl(gp, '#8a8277', x, gy(x, z), z, 0.012, 0.16, 6);
    blob(gp, '#3f7a33', x, gy(x, z) + 0.17, z, 0.08, 0.035, 0.08);
  }
  for (let i = 0; i < 9; i++) {
    const x = -0.2 + hash3(i, 1, 4) * 0.4, z = 0.2 + hash3(i, 2, 4) * 0.17;
    if (Math.abs(x) < 0.05) continue;
    person(gp, x, gy(x, z), z, ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316'][i % 5], i, 1.2);
  }
  person(gp, 0.006, 0.035 + (TOP - 0.035) * 0.42, zf0 + (zf1 - zf0) * 0.42 + 0.004, '#e11d48', 2, 1.1);
};

// ---- Angel Falls: world's tallest waterfall leaping off the sheer orange wall of Auyán-tepui -----------------
const angelfalls: Builder = gp => {
  const zc = (x: number) => -0.12 + 0.62 * x * x + 0.025 * Math.sin(x * 23) * sstep(0.04, 0.14, Math.abs(x));
  const TOPH = 0.66, LED = 0.4;
  const hf: HFn = (x, z) => {
    const s = zc(x) - z; // >0 behind the cliff
    const ax = Math.abs(x);
    const ledge = 0.035 * sstep(0.07, 0.16, ax);
    let y: number;
    if (s < 0) {
      const d = -s;
      y = 0.022 + 0.13 * Math.exp(-d / 0.09) + 0.02 * fbm(x * 8, 1, z * 8) * sstep(0.0, 0.05, d);
      const st = Math.abs(x - 0.025 * Math.sin(z * 9) - 0.0);
      if (z < 0.3) y -= 0.03 * sstep(0.03, 0.0, st) * sstep(0.0, 0.06, d) * Math.exp(-d / 0.3);
      const rv = Math.abs(z - 0.33 - 0.04 * Math.sin(x * 6));
      if (rv < 0.09) y = 0.008 + (y - 0.008) * sstep(0.05, 0.09, rv);
    } else {
      const wall1 = (LED - 0.15) * sstep(0.0, 0.012, s);
      const wall2 = (TOPH - LED) * sstep(ledge, ledge + 0.012, s);
      y = 0.15 + wall1 + wall2 + 0.012 * fbm(x * 12, 3, z * 12) * sstep(ledge + 0.02, ledge + 0.06, s);
      // river notch cut into the plateau feeding the fall
      if (Math.abs(x) < 0.03) y -= 0.02 * sstep(0.03, 0.0, Math.abs(x)) * sstep(ledge, ledge + 0.03, s);
    }
    return y;
  };
  const ROCK = ['#c2652f', '#a9512a', '#d98042', '#8a5a44', '#7d7068', '#b36a3e'];
  island(gp, 0.5, hf, '#3f7a34', (x, y, z, nx, ny) => {
    const t = y - 0.035;
    if (t < 0.012 && ny > 0.95) return ripple('#3f7590')(x, y, z, 0, 1, 0);
    if (ny < 0.55) {
      const col = Math.floor(Math.atan2(z, x) * 140);
      if (hash3(col, 1, 1) > 0.82) return '#5a3b2e';
      if (hash3(col, 2, 2) > 0.88) return '#6e4a3a';
      const band = Math.floor(t * 34 + fbm(x * 9, t * 6, z * 9) * 2.2);
      return shade(ROCK[band % ROCK.length], 0.9 + 0.2 * hash3(col, 3, band));
    }
    if (t > 0.6) return hash3(Math.floor(x * 70), 5, Math.floor(z * 70)) > 0.75 ? '#5d6b3c' : mix('#7a7d5a', '#6d7a4b', fbm(x * 12, 0, z * 12));
    if (t > 0.2) return '#4f7a3a';
    return mix('#2f6b2c', '#468238', fbm(x * 11, 1, z * 11));
  }, { rings: 62, segs: 132, side: strataSide(['#7a4a2e', '#5f3b26', '#8a5634']) });
  const gy = onGround(hf);
  // The fall: free-leaping ribbon widening into spray, plus lower cascades over the talus
  const z0 = zc(0), FT = 0.035 + TOPH - 0.022, FB = 0.035 + 0.15;
  const waterMat: MatOpts = { transparent: 0.85, rough: 0.3, flat: false };
  for (const [dz, sc, op] of [[0, 1, 1], [0.008, 1.6, 0.5]] as number[][]) {
    patch(gp, (u, v) => {
      const y = FT - (FT - FB) * v, w = (0.016 + 0.05 * v ** 1.2) * sc, bow = 0.034 * Math.sin(v * Math.PI * 0.9) + 0.006 + dz;
      return [(u - 0.5) * w + 0.004 * Math.sin(v * 9), y, z0 + bow];
    }, 4, 20, (u, v) => (hash3(Math.floor(u * 4), Math.floor(v * 20), 3) > 0.55 ? '#ffffff' : v > 0.5 ? '#eef6f9' : '#dcebf2'), { ...waterMat, transparent: op }, true);
  }
  for (let i = 0; i < 7; i++) blob(gp, '#f4f8fa', (hash3(i, 1, 6) - 0.5) * 0.1, FB + 0.005 + i * 0.01, z0 + 0.045 + hash3(i, 2, 6) * 0.03, 0.028 + 0.006 * i, 0.024, 0.028)
    .material = mat('#f4f8fa', { transparent: 0.55, flat: false });
  // stream down the talus
  const pts: V3[] = [];
  for (let k = 0; k <= 10; k++) { const z = z0 + 0.04 + k * (0.3 - z0 - 0.04) / 10, x = 0.025 * Math.sin(z * 9); pts.push([x, gy(x, z) + 0.006, z]); }
  tube(gp, pts, 0.008, 0.012, '#dfeef4', { radial: 5, sub: 2 });
  // plateau river feeding the lip
  box(gp, '#4b6f80', 0, 0.035 + TOPH - 0.024, z0 - 0.12, 0.035, 0.004, 0.22);
  // Clouds drifting past the wall
  const cmat = mat('#ffffff', { transparent: 0.8, flat: false });
  for (const [x, y, z, sc] of [[-0.3, 0.52, -0.0, 1], [0.3, 0.44, 0.06, 0.8]] as number[][])
    for (let k = 0; k < 5; k++) add(gp, LO(), cmat, x + (k - 2) * 0.03 * sc, y + (k % 2) * 0.012 * sc - Math.abs(k - 2) * 0.006 * sc, z + hash3(k, 1, x * 9) * 0.02, 0.07 * sc * (1 - Math.abs(k - 2) * 0.15), 0.05 * sc, 0.06 * sc);
  // Rainforest on the talus and river banks
  scatter(150, 23, (x, z, i) => {
    if (z < zc(x) + 0.02) return;
    if (Math.abs(z - 0.33 - 0.04 * Math.sin(x * 6)) < 0.07) return;
    if (Math.abs(x - 0.025 * Math.sin(z * 9)) < 0.028 && z < 0.3) return;
    jungle(gp, x, gy(x, z), z, 0.035 + 0.025 * hash3(i, 5, 5), i + 50, ['#2f6b2c', '#3b7d34', '#2a5f2a', '#4c8a3c']);
  }, 0.49);
  // scrub on the tepui summit
  scatter(40, 31, (x, z) => { if (z < zc(x) - 0.08) blob(gp, hash3(x * 40, 1, z * 40) > 0.5 ? '#56693a' : '#6b7a45', x, gy(x, z) + 0.004, z, 0.016, 0.008, 0.016); }, 0.48);
  // Dugout curiara with tourists on the Churún river
  const cq = grp(gp, -0.12, 0.035 + 0.006, 0.34 + 0.04 * Math.sin(-0.72), 0.25);
  add(cq, LO(), mat('#5b3a26'), 0, 0.004, 0, 0.12, 0.016, 0.026);
  box(cq, '#3a2a1f', 0, 0.007, 0, 0.1, 0.002, 0.018);
  for (let k = 0; k < 4; k++) person(cq, -0.035 + k * 0.022, 0.006, 0, ['#f97316', '#facc15', '#ef4444', '#22c55e'][k], k, 0.9);
  // viewpoint camp on the bank
  const vx = 0.2, vz = 0.24;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(gp, '#6b4a2e', vx + sx * 0.03, gy(vx, vz), vz + sz * 0.02, 0.003, 0.03, 4);
  gable(gp, 0.08, 0.02, 0.06, '#c8a35a', vx, gy(vx, vz) + 0.03, vz);
  person(gp, vx - 0.05, gy(vx - 0.05, vz + 0.03), vz + 0.03, '#3b82f6', 1);
};

// ---- El Peñol de Guatapé: granite monolith with a zig-zag stair in its crack, above a maze-like reservoir ------
const penol: Builder = gp => {
  const RX = 0.03, RZ = -0.08, H = 0.47, R0 = 0.19, SZ = 0.86, Y0 = 0.05;
  const rr = (t: number) => R0 * (1.04 - 0.1 * t) * Math.pow(Math.max(0, 1 - t ** 3.2), 0.5);
  const hf: HFn = (x, z) => {
    const dr = Math.hypot(x - RX, (z - RZ) / SZ);
    let land = fbm(x * 4.2 + 3, 1, z * 4.2 - 2) - 0.53 + 0.55 * Math.max(0, 1 - dr / 0.3);
    land += 0.12 * Math.max(0, 1 - Math.hypot(x + 0.3, z - 0.28) / 0.12) + 0.1 * Math.max(0, 1 - Math.hypot(x - 0.32, z - 0.2) / 0.1);
    return land < 0 ? 0.004 : 0.012 + Math.min(0.05, land * 0.22) * sstep(0, 0.04, land) + 0.02 * fbm(x * 10, 2, z * 10) * sstep(0.04, 0.12, land);
  };
  island(gp, 0.5, hf, '#5e9a43', (x, y, z, _nx, ny) => {
    const t = y - 0.035;
    if (t < 0.007 && ny > 0.95) return ripple('#3b7f8f')(x, y, z, 0, 1, 0);
    if (t < 0.011) return '#a8865a';
    return mix('#5e9a43', '#78ad4c', fbm(x * 12, 0, z * 12));
  }, { rings: 40, segs: 110, side: strataSide(EARTH) });
  const gy = onGround(hf);
  // Monolith
  const NR = 22, prof: THREE.Vector2[] = [];
  for (let i = 0; i <= NR; i++) { const t = i / NR; prof.push(new THREE.Vector2(i === NR ? 0.0001 : rr(t), t * H)); }
  prof.unshift(new THREE.Vector2(0.0001, -0.02));
  prof.splice(1, 0, new THREE.Vector2(rr(0) * 1.05, -0.02));
  const CA = Math.PI / 2 - 0.32; // crack faces front-right
  const rock = paintFaces(new THREE.LatheGeometry(prof, 44), '#b5b2aa', (x, y, z, _nx, ny) => {
    const a = Math.atan2(z, x), t = y / H;
    const da = Math.abs(Math.atan2(Math.sin(a - CA), Math.cos(a - CA)));
    if (da < 0.12 && t < 0.92) return hash3(Math.floor(y * 90), 3, 1) > 0.5 ? '#3e3a35' : '#4a4640';
    if (ny > 0.55 && t > 0.9) return hash3(Math.floor(x * 80), 1, Math.floor(z * 80)) > 0.6 ? '#6f7a52' : '#8f8d82';
    const col = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 22), st = hash3(col, 1, Math.floor(t * 2.2 + hash3(col, 2, 2) * 2));
    if (st > 0.82) return t > 0.75 ? '#6d7258' : '#5f5c55';
    if (st > 0.66) return '#8a877e';
    if (st < 0.1) return '#cfccc3';
    return mix('#b3b0a8', '#9c998f', fbm(a * 4, t * 7, 1));
  });
  const rk = add(gp, rock, mat('#ffffff', { vc: true, flat: false }), RX, Y0, RZ, 1, 1, SZ);
  rk.castShadow = true;
  const S = (a: number, t: number, off = 0.004): V3 => {
    const r = rr(t) + off;
    return [RX + Math.cos(a) * r, Y0 + t * H, RZ + Math.sin(a) * r * SZ];
  };
  const AC = CA;
  // Zig-zag staircase climbing the crack: white walls with brick-red treads
  const NF = 16;
  for (let k = 0; k < NF; k++) {
    const t0 = 0.02 + (k / NF) * 0.88, t1 = 0.02 + ((k + 1) / NF) * 0.88, sw = k % 2 ? 1 : -1;
    const a = S(AC + sw * 0.09, t0, 0.012), b = S(AC - sw * 0.09, t1, 0.012);
    beam(gp, a, b, 0.016, 0.008, '#f2efe8');
    beam(gp, [a[0], a[1] + 0.005, a[2]], [b[0], b[1] + 0.005, b[2]], 0.011, 0.004, '#b5603d');
    const l = S(AC - sw * 0.09, t1, 0.012);
    box(gp, '#f2efe8', l[0], l[1] - 0.006, l[2], 0.02, 0.01, 0.02);
  }
  // Big white "G I" painted on the left face
  const AL = Math.PI / 2;
  const letter = (x0: number, x1: number, y0: number, y1: number) => patch(gp, (u, v) => {
    const lx = x0 + (x1 - x0) * u, ly = y0 + (y1 - y0) * v;
    return S(AL + 0.6 - lx * 0.55, 0.26 + ly * 0.34, 0.003);
  }, 2, 2, () => '#f7f7f2', {}, false);
  letter(0.04, 0.12, 0.0, 1.0); // G spine
  letter(0.04, 0.4, 0.86, 1.0);
  letter(0.04, 0.4, 0.0, 0.14);
  letter(0.32, 0.4, 0.0, 0.45);
  letter(0.24, 0.4, 0.38, 0.5);
  letter(0.58, 0.67, 0.0, 1.0); // I
  // Summit viewpoint tower
  const TY = Y0 + H - 0.004;
  cyl(gp, '#f2efe8', RX + 0.01, TY, RZ, 0.07, 0.012, 12);
  rbox(gp, '#f2efe8', RX + 0.01, TY + 0.012, RZ, 0.05, 0.05, 0.045, 0.003);
  for (let k = 0; k < 3; k++) box(gp, '#3a6ea5', RX + 0.01 - 0.015 + k * 0.015, TY + 0.03, RZ + 0.0228, 0.008, 0.016, 0.001);
  rbox(gp, '#c1462f', RX + 0.01, TY + 0.062, RZ, 0.058, 0.008, 0.052, 0.003);
  for (let k = 0; k < 4; k++) person(gp, RX - 0.03 + k * 0.02, TY + 0.012, RZ + 0.03, ['#ef4444', '#facc15', '#3b82f6', '#22c55e'][k], k);
  // Colourful zócalo houses at the foot, boats on the reservoir, trees on the fingers of land
  const house = (x: number, z: number, ry: number, c: string) => {
    const y = gy(x, z);
    const q = grp(gp, x, y, z, ry);
    box(q, '#f4f1ea', 0, 0, 0, 0.04, 0.026, 0.03);
    box(q, c, 0, 0, 0.0152, 0.04, 0.008, 0.001);
    box(q, shade(c, 0.8), -0.008, 0.008, 0.0155, 0.008, 0.012, 0.001);
    gable(q, 0.046, 0.014, 0.036, '#c0512f', 0, 0.026, 0);
  };
  const HC = ['#e85d75', '#3fb6a8', '#f2c94c', '#6c8cf2', '#f08a3c', '#9b6cd9'];
  let hk = 0;
  scatter(90, 9, (x, z) => {
    const dr = Math.hypot(x - RX, (z - RZ) / SZ);
    if (dr < R0 + 0.03 || hf(x, z) < 0.02) return;
    if (dr < 0.32 && hk < 14) { house(x, z, Math.atan2(x - RX, z - RZ), HC[hk % HC.length]); hk++; return; }
    if (hash3(x * 30, 1, z * 30) > 0.35) leafTree(gp, x, gy(x, z), z, 0.03 + hash3(x * 30, 2, z * 30) * 0.025, hash3(x * 30, 3, z * 30) > 0.5 ? '#2f6b30' : '#4a8a3a', Math.round(x * 100));
  }, 0.47);
  let bk = 0;
  scatter(60, 4, (x, z, i) => {
    if (bk >= 5 || hf(x, z) > 0.0045 || hf(x + 0.04, z) > 0.0045 || hf(x - 0.04, z) > 0.0045 || z < -0.1) return;
    bk++;
    const q = grp(gp, x, 0.036, z, hash3(i, 2, 2) * 6);
    add(q, LO(), mat('#f4f4f2'), 0, 0.003, 0, 0.045, 0.012, 0.016);
    box(q, i % 2 ? '#e25c45' : '#2f7fd0', -0.004, 0.006, 0, 0.014, 0.006, 0.01);
    add(q, LO(), mat('#e8f4f8', { transparent: 0.7 }), 0.03, 0.001, 0, 0.03, 0.002, 0.008);
  }, 0.46);
};

// ---- Haus Tambaran (Maprik, East Sepik): soaring spirit house with a painted face-gable -------------------
const haustambaran: Builder = gp => {
  const hf: HFn = (x, z) => 0.012 + 0.025 * fbm(x * 5, 3, z * 5) * sstep(0.25, 0.45, Math.hypot(x, z));
  island(gp, 0.5, hf, '#6b9a3e', (x, y, z) => {
    const r = Math.hypot(x, z * 1.1);
    if (r < 0.3 && z > -0.1) return mix('#b48a58', '#a07a4a', fbm(x * 16, 0, z * 16));
    return mix('#5d8f38', '#73a446', fbm(x * 11, 1, z * 11));
  }, { rings: 24, segs: 96, side: strataSide(EARTH) });
  const gy = onGround(hf);
  const Y = 0.047;
  const A: V3 = [0, 0.8, 0.17], BL: V3 = [-0.17, Y, 0.1], BR: V3 = [0.17, Y, 0.1];
  const ER: V3 = [0.2, Y - 0.006, -0.33], EL: V3 = [-0.2, Y - 0.006, -0.33], RB: V3 = [0, 0.24, -0.37];
  const L = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  // Painted gable: rows of ancestral spirit faces (red ochre, white-ringed eyes) on black, woven mat below
  const RED = '#b5482b', OCH = '#d9a441', WHT = '#efe9dc', BLK = '#1d1815';
  const facade = (u: number, v: number): string => {
    const p = L(L(BL, BR, u), A, v), x = p[0], y = p[1];
    const halfW = 0.17 * (1 - v);
    if (y < 0.2) {
      if (Math.abs(x) < 0.03 && y < 0.11) return '#120d0a';
      const d = Math.floor((x + y) * 70) + Math.floor((x - y) * 70);
      return d % 2 ? '#c9a46a' : '#9c7748';
    }
    if (halfW - Math.abs(x) < 0.012) return OCH;
    const rowH = 0.085, k = Math.floor((y - 0.2) / rowH), ry = (y - 0.2) / rowH - k;
    if (ry < 0.1) return Math.floor(x * 120) % 2 ? WHT : OCH;
    const n = Math.max(1, Math.floor((2 * halfW - 0.02) / 0.075)), cw = (2 * halfW - 0.02) / n;
    const fi = Math.floor((x + halfW - 0.01) / cw), fx = ((x + halfW - 0.01) / cw - fi) * 2 - 1, fy = ((ry - 0.1) / 0.9) * 2 - 1;
    const e = fx * fx / 0.85 + fy * fy / 0.95;
    if (e > 1) return BLK;
    for (const ex of [-0.42, 0.42]) {
      const d = Math.hypot(fx - ex, (fy - 0.22) * 1.1);
      if (d < 0.14) return BLK;
      if (d < 0.32) return WHT;
    }
    if (Math.abs(fy + 0.5) < 0.1 && Math.abs(fx) < 0.4) return WHT;
    if (Math.abs(fx) < 0.08 && fy > -0.3 && fy < 0.1) return OCH;
    return (k + fi) % 3 === 2 ? '#c46a2f' : RED;
  };
  patch(gp, (u, v) => L(L(BL, BR, u), A, v), 34, 64, facade, { flat: true });
  // Thatch roof: two long slopes falling from the forward-leaning apex to a low back ridge
  const THATCH = ['#8a6a3c', '#a07c45', '#76592f', '#b08a52'];
  const th = (u: number, v: number) => shade(THATCH[Math.floor(v * 14 + hash3(Math.floor(u * 30), 1, 1) * 1.4) % 4], 0.92 + 0.12 * hash3(Math.floor(u * 40), Math.floor(v * 14), 2));
  const BLo: V3 = [-0.19, Y - 0.006, 0.12], BRo: V3 = [0.19, Y - 0.006, 0.12], Ao: V3 = [0, 0.81, 0.2];
  patch(gp, (u, v) => L(L(Ao, RB, u), L(BLo, EL, u), v), 14, 10, th);
  patch(gp, (u, v) => L(L(Ao, RB, u), L(BRo, ER, u), v), 14, 10, th, {}, true);
  const back = new Mesher();
  back.tri(EL, ER, RB, '#76592f', [0, 0, -1]);
  back.build(gp);
  // thick thatch rims framing the gable and the ridge
  tube(gp, [BLo, L(BLo, Ao, 0.5), Ao], 0.012, 0.008, '#6f5330', { radial: 6, sub: 2 });
  tube(gp, [BRo, L(BRo, Ao, 0.5), Ao], 0.012, 0.008, '#6f5330', { radial: 6, sub: 2 });
  tube(gp, [Ao, L(Ao, RB, 0.5), RB], 0.008, 0.008, '#5e452a', { radial: 5, sub: 2 });
  // carved finial: spike with a hornbill on top
  strut(gp, [Ao[0], Ao[1] - 0.01, Ao[2]], [0, 0.9, 0.24], 0.008, 0.003, '#3a2a1f', 5);
  blob(gp, '#2a211b', 0, 0.9, 0.245, 0.012, 0.009, 0.018);
  strut(gp, [0, 0.902, 0.26], [0, 0.896, 0.29], 0.004, 0.0012, '#e0a43a', 5);
  for (const sx of [-1, 1]) blob(gp, '#3a2a1f', sx * 0.014, 0.9, 0.24, 0.016, 0.003, 0.009, 0, 0, sx * 0.4);
  // Ridge-pole tips and posts under the eaves
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) cyl(gp, '#4a3626', sx * 0.165, Y - 0.006, 0.05 - k * 0.12, 0.007, 0.05, 5);
  // slit gong (garamut) in front and villagers
  const gq = grp(gp, -0.2, gy(-0.2, 0.3), 0.3, 0.4);
  add(gq, CYL(10), mat('#6b4a2e'), 0, 0.016, 0, 0.032, 0.11, 0.032, 0, 0, Math.PI / 2);
  box(gq, '#1d1815', 0, 0.031, 0, 0.08, 0.002, 0.006);
  for (let i = 0; i < 7; i++) {
    const x = -0.15 + hash3(i, 1, 2) * 0.3, z = 0.18 + hash3(i, 2, 2) * 0.16;
    person(gp, x, gy(x, z), z, ['#d9483b', '#f2c94c', '#efe9dc', '#3fb6a8', '#e85d75'][i % 5], i % 3 === 0 ? 2 : 0, 1.2);
  }
  // Stilt huts with thatched gables
  for (const [x, z, ry] of [[-0.34, -0.06, 0.5], [0.35, -0.02, -0.5], [0.3, 0.26, -0.9]] as number[][]) {
    const y = gy(x, z), q = grp(gp, x, y, z, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(q, '#4a3626', sx * 0.03, 0, sz * 0.022, 0.006, 0.045, 4);
    box(q, '#8a6a43', 0, 0.045, 0, 0.075, 0.004, 0.056);
    box(q, '#b8925c', 0, 0.049, 0, 0.066, 0.03, 0.046);
    box(q, '#3a2a1f', 0, 0.049, 0.0235, 0.014, 0.022, 0.001);
    gable(q, 0.09, 0.04, 0.066, '#9a7743', 0, 0.079, 0, Math.PI / 2);
    beam(q, [0.014, 0, 0.05], [0.006, 0.046, 0.03], 0.012, 0.004, '#6b4a2e');
  }
  // Coconut and betel palms, banana plants, rainforest
  for (const [x, z, h] of [[-0.3, 0.2, 0.2], [-0.38, 0.08, 0.16], [0.22, -0.3, 0.22], [0.4, 0.12, 0.18], [-0.12, -0.4, 0.2], [0.12, 0.38, 0.15]] as number[][])
    palm(gp, x, gy(x, z), z, h, 0.14, Math.atan2(z, x), '#4f8a3a', Math.round(x * 50 + z * 70));
  for (const [x, z] of [[-0.25, -0.22], [0.27, -0.16], [0.4, 0.32], [-0.42, 0.25]] as [number, number][])
    for (let k = 0; k < 5; k++) { const a = k * 1.26; blob(gp, k % 2 ? '#5fa045' : '#4f8f3a', x + Math.cos(a) * 0.02, gy(x, z) + 0.035, z + Math.sin(a) * 0.02, 0.026, 0.006, 0.01, -a, 0, 0.5); }
  scatter(60, 61, (x, z, i) => {
    const r = Math.hypot(x, z);
    if (r < 0.36 || (z > 0.1 && Math.abs(x) < 0.3)) return;
    jungle(gp, x, gy(x, z), z, 0.045 + 0.03 * hash3(i, 5, 5), i + 7);
  }, 0.48);
};

export const H_COUNTRIES_B: Record<string, Builder> = {
  cb_deadvlei: deadvlei,
  cb_zuma: zuma,
  cb_greatzimbabwe: greatzimbabwe,
  cb_eljem: eljem,
  cb_capitolio: capitolio,
  cb_panamacanal: panamacanal,
  cb_tikal: tikal,
  cb_angelfalls: angelfalls,
  cb_penol: penol,
  cb_haustambaran: haustambaran,
};
