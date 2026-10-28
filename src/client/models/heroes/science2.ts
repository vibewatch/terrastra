import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type Paint, type V3, add, mat, shade, fbm, hash3, paintFaces, g, sweep, slab } from '../prims.ts';
import { island, sstep, type HFn } from '../nature.ts';
import { type P2, fine, bar, batched } from '../kit/orbit.ts';

// Hero builders for the second space & discovery pack: observatories, launch sites and a meteorite (sx_*), plus
// natural wonders and amazing finds (dc_*). Front faces +z, base at y=0, ground disc radius 0.5.
// Mobile budget: light terrain (≈3k tris), low-segment shared geometry, thin parts batched into one mesh.

const TAU = Math.PI * 2;
let seed = 1;
const srand = (s: number) => { seed = s; };
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a: number, b: number) => a + (b - a) * rnd();

const VC = (o: { flat?: boolean; metal?: number; rough?: number } = {}) => mat('#ffffff', { vc: true, flat: o.flat ?? false, metal: o.metal, rough: o.rough });
const SPH = (s: number) => g('s2:sph' + s, () => new THREE.SphereGeometry(1, s, Math.max(4, Math.round(s * 0.65))));
const CYLG = (s: number) => g('s2:cyl' + s, () => new THREE.CylinderGeometry(1, 1, 1, s));
const CONEG = (s: number) => g('s2:cone' + s, () => new THREE.ConeGeometry(1, 1, s));
const BOXG = () => g('s2:box', () => new THREE.BoxGeometry(1, 1, 1));

function grp(p: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): THREE.Group {
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.set(rx, ry, rz); p.add(q); return q;
}
/** Box with its base at y. */
function cube(p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  return add(p, BOXG(), mat(c), x, y + sy / 2, z, sx, sy, sz, ry, rx, rz);
}
/** Upright cylinder with its base at y. */
function cyl(p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, h: number, s = 10, smooth = true): THREE.Mesh {
  return add(p, CYLG(s), mat(c, { flat: !smooth }), x, y + h / 2, z, r, h, r);
}
function ell(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, s = 8, smooth = true): THREE.Mesh {
  return add(p, SPH(s), mat(c, { flat: !smooth }), x, y, z, rx, ry, rz, roty);
}
/** Lathe of a [r, y] profile with per-face paint. */
function plathe(p: THREE.Object3D, prof: P2[], c: string, paint?: Paint, x = 0, y = 0, z = 0, seg = 20, o: { flat?: boolean; metal?: number; rough?: number } = {}): THREE.Mesh {
  const geo = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(Math.max(1e-4, r), h)), seg);
  geo.computeVertexNormals();
  return add(p, paintFaces(geo, c, paint), VC(o), x, y, z, 1, 1, 1);
}

const _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _col = new THREE.Color();
/** Batched flat triangles with per-face colour, for custom walls, arcs and stairs. */
class QB {
  pos: number[] = []; col: number[] = [];
  tri(a: V3, b: V3, c: V3, hex: string): void {
    _col.set(hex);
    for (const v of [a, b, c]) { this.pos.push(v[0], v[1], v[2]); this.col.push(_col.r, _col.g, _col.b); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, hex: string, two = false): void {
    this.tri(a, b, c, hex); this.tri(a, c, d, hex);
    if (two) { this.tri(a, c, b, hex); this.tri(a, d, c, hex); }
  }
  build(p: THREE.Object3D, o: { metal?: number; rough?: number } = {}): void {
    if (!this.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    add(p, geo, VC({ flat: true, ...o }), 0, 0, 0, 1, 1, 1);
  }
}
/** Batches many copies of small non-indexed geometries (stencils, blotches) into one vertex-coloured mesh. */
class Stamp {
  pos: number[] = []; nor: number[] = []; col: number[] = [];
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, hex: string): void {
    const gp = geo.getAttribute('position'), gn = geo.getAttribute('normal');
    _nm.getNormalMatrix(m); _col.set(hex);
    for (let i = 0; i < gp.count; i++) {
      _v.fromBufferAttribute(gp, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(gn, i).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_col.r, _col.g, _col.b);
    }
  }
  build(p: THREE.Object3D): void {
    if (!this.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    add(p, geo, VC({ flat: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);
  }
}

/** Light terrain disc (≈2.8k tris) with an earthy skirt; y0 is the base thickness. */
const Y0 = 0.035;
function ground(gp: THREE.Object3D, h: HFn, paint: Paint, side?: (y: number, x: number, z: number) => string, rings = 22, segs = 64): void {
  island(gp, 0.5, h, '#888888', paint, { rings, segs, base: Y0, side: side ?? ((yy: number) => (yy > Y0 * 0.55 ? '#6b5440' : '#4f3d2e')) });
}
const at = (h: HFn) => (x: number, z: number) => Y0 + h(x, z);

/** Tiny person for scale. */
function person(p: THREE.Object3D, x: number, y: number, z: number, s = 0.03, c = '#2b5d9c'): void {
  passerby(p, x, y, z, s * 0.9, 1, { top: c });
}
/** Round broadleaf tree / bush. */
function bush(p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#3f7d3a', trunk = true): void {
  if (trunk) bar(p, [x, y, z], [x, y + s * 0.7, z], s * 0.09, '#6a4a32', 4);
  ell(p, c, x, y + s * (trunk ? 0.9 : 0.3), z, s * 0.45, s * 0.38, s * 0.45, rnd() * 3, 7, false);
  ell(p, shade(c, 1.12), x + s * 0.15, y + s * (trunk ? 1.05 : 0.45), z + s * 0.1, s * 0.28, s * 0.24, s * 0.28, 0, 6, false);
}
/** Flat-topped umbrella acacia. */
function acacia(p: THREE.Object3D, x: number, y: number, z: number, s: number): void {
  bar(p, [x, y, z], [x + s * 0.08, y + s * 0.6, z], s * 0.05, '#5a4030', 4);
  bar(p, [x + s * 0.08, y + s * 0.6, z], [x - s * 0.15, y + s * 0.8, z + s * 0.05], s * 0.03, '#5a4030', 4);
  bar(p, [x + s * 0.08, y + s * 0.6, z], [x + s * 0.3, y + s * 0.82, z - s * 0.05], s * 0.03, '#5a4030', 4);
  add(p, SPH(8), mat('#6a8a3a', { flat: true }), x + s * 0.06, y + s * 0.88, z, s * 0.5, s * 0.1, s * 0.4, rnd() * 3);
}
/** Palm tree. */
function palm(p: THREE.Object3D, x: number, y: number, z: number, s: number, lean = 0): void {
  const pts: V3[] = [];
  for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push([x + Math.sin(lean) * s * 0.3 * t * t, y + s * t, z + Math.cos(lean) * s * 0.3 * t * t]); }
  for (let i = 0; i < 3; i++) bar(p, pts[i], pts[i + 1], s * 0.035 * (1.15 - i * 0.12), '#8a6a4a', 5);
  const [tx, ty, tz] = pts[3];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + hash3(x, z, i), c = i % 2 ? '#3f7d3a' : '#4f9145';
    const m: V3 = [tx + Math.cos(a) * s * 0.28, ty + s * 0.06, tz + Math.sin(a) * s * 0.28];
    const e: V3 = [tx + Math.cos(a) * s * 0.5, ty - s * 0.12, tz + Math.sin(a) * s * 0.5];
    bar(p, [tx, ty, tz], m, s * 0.045, c, 4);
    bar(p, m, e, s * 0.035, c, 4);
  }
}
/** Lattice-grid paint for dish surfaces (radial spokes + rings). */
/** Two-sided parabolic dish opening up +y (vertex at origin): painted concave front, plain back shell. */
function dish(p: THREE.Object3D, R: number, k: number, front: Paint | undefined, cf: string, cb: string, seg = 40, rows = 8, r0 = 0): void {
  const prof: P2[] = [];
  for (let i = 0; i <= rows; i++) { const r = r0 + ((R - r0) * i) / rows; prof.push([r, k * r * r]); }
  plathe(p, [...prof].reverse(), cf, front, 0, 0, 0, seg, { metal: 0.25, rough: 0.5 });
  plathe(p, prof.map(([r, y]) => [r, y - 0.004] as P2), cb, undefined, 0, 0, 0, seg);
}
const dishPaint = (c: string, line: string, spokes: number, rings: number, R: number): Paint => (x, _y, z) => {
  const a = Math.atan2(z, x), d = Math.hypot(x, z) / R;
  const sp = Math.abs(((a / TAU) * spokes + spokes) % 1 - 0.5) > 0.46;
  const rg = Math.abs((d * rings) % 1 - 0.5) > 0.44;
  return sp || rg ? line : c;
};

// ───────────────────────────── Arecibo Telescope (Puerto Rico, 1963–2020) ─────────────────────────────
const sx_arecibo: Builder = batched((gp) => {
  srand(401);
  const Rd = 0.27;
  const dishY = (r: number) => 0.004 + r * r * 1.0;
  const mog = (x: number, z: number) => {
    let s = 0;
    for (const [mx, mz, mr, mh] of [[-0.36, -0.28, 0.13, 0.1], [0.38, -0.22, 0.12, 0.09], [0.0, -0.42, 0.11, 0.08], [-0.42, 0.12, 0.1, 0.07], [0.42, 0.18, 0.1, 0.06]]) {
      const d = Math.hypot(x - mx, z - mz) / mr; if (d < 1) s = Math.max(s, mh * (1 - d * d));
    }
    return s;
  };
  const h: HFn = (x, z) => {
    const d = Math.hypot(x, z);
    if (d < Rd + 0.005) return dishY(d) - 0.012;
    const rim = dishY(Rd) + 0.006;
    return rim + sstep(Rd, Rd + 0.08, d) * 0.01 + mog(x, z) + (fbm(x * 9, 1, z * 9, 2) - 0.5) * 0.02;
  };
  ground(gp, h, (x, _y, z) => {
    const d = Math.hypot(x, z);
    if (d < Rd + 0.012) return '#3d6a2c';
    const f = fbm(x * 14, 2, z * 14, 2);
    return f > 0.6 ? '#2f5e24' : f < 0.36 ? '#5a8a3a' : '#467a30';
  });
  const gy = at(h);
  // the 305 m spherical reflector: perforated aluminium panels, mesh lines
  const prof: P2[] = [];
  for (let i = 0; i <= 10; i++) { const r = (Rd * i) / 10; prof.push([r, Y0 + dishY(r)]); }
  plathe(gp, prof.reverse(), '#c9ced2', dishPaint('#c4cacf', '#9aa3aa', 40, 9, Rd), 0, 0, 0, 48, { metal: 0.15, rough: 0.6 });
  // three reinforced-concrete towers on the surrounding hills, with backstays
  const PY = 0.43, towers: V3[] = [];
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3 + 0.2, d = Rd + 0.11, x = Math.cos(a) * d, z = Math.sin(a) * d, y = gy(x, z);
    const th = PY + 0.05 - y;
    const tw = grp(gp, x, y, z, -a);
    add(tw, BOXG(), mat('#d8d2c4'), 0, th / 2, 0, 0.034, th, 0.034);
    add(tw, BOXG(), mat('#c8c0b0'), 0, th * 0.2, 0, 0.05, th * 0.4, 0.05);
    cube(tw, '#e04030', 0, th, 0, 0.026, 0.012, 0.026);
    towers.push([x, y + th, z]);
    const bx = Math.cos(a) * (d + 0.08), bz = Math.sin(a) * (d + 0.08);
    for (const s of [-1, 1]) bar(gp, [x, y + th - 0.01, z], [bx - Math.sin(a) * 0.05 * s, gy(bx, bz) + 0.005, bz + Math.cos(a) * 0.05 * s], 0.0018, '#3a3a3a', 3);
  }
  // 900-tonne triangular platform hanging 150 m above the dish
  const P = grp(gp, 0, PY, 0);
  const corner = (k: number): V3 => { const a = -Math.PI / 2 + (k * TAU) / 3 + 0.2; return [Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075]; };
  for (let k = 0; k < 3; k++) {
    const a = corner(k), b = corner(k + 1);
    for (const dy of [0, -0.03]) bar(P, [a[0], dy, a[2]], [b[0], dy, b[2]], 0.004, '#8a8f94', 4);
    bar(P, [a[0], 0, a[2]], [a[0], -0.03, a[2]], 0.004, '#8a8f94', 4);
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4, t1 = (i + 1) / 4;
      bar(P, [a[0] + (b[0] - a[0]) * t0, 0, a[2] + (b[2] - a[2]) * t0], [a[0] + (b[0] - a[0]) * t1, -0.03, a[2] + (b[2] - a[2]) * t1], 0.0025, '#8a8f94', 3);
    }
    // main cables tower → corner
    const t = towers[k];
    for (const o of [-0.006, 0.006]) bar(gp, [t[0], t[1] - 0.01 + o, t[2]], [a[0], PY + o, a[2]], 0.0018, '#2a2a2a', 3);
  }
  cube(P, '#9aa0a6', 0, -0.006, 0, 0.06, 0.012, 0.06);
  // curved azimuth arm under the platform, carrying the Gregorian dome and the long line feed
  const arm = grp(P, 0, -0.035, 0, 0.5);
  const arc = (t: number): V3 => { const a = (t - 0.5) * 1.6; return [Math.sin(a) * 0.13, 0.13 - Math.cos(a) * 0.13 - 0.01, 0]; };
  for (let i = 0; i < 8; i++) {
    const a = arc(i / 8), b = arc((i + 1) / 8);
    for (const s of [-1, 1]) bar(arm, [a[0], a[1], s * 0.012], [b[0], b[1], s * 0.012], 0.003, '#a4aab0', 4);
    bar(arm, [a[0], a[1], -0.012], [b[0], b[1], 0.012], 0.002, '#a4aab0', 3);
  }
  bar(arm, [0, 0.005, 0], [0, -0.01, 0], 0.01, '#9aa0a6', 6);
  const dm = arc(0.2);
  plathe(arm, [[0, 0.045], [0.02, 0.042], [0.03, 0.03], [0.032, 0.012], [0.03, 0], [0, 0]], '#f2f2ee', (_x, y) => (y < 0.004 ? '#9aa0a6' : null), dm[0] - 0.012, dm[1] - 0.05, 0, 14);
  const lf = arc(0.85);
  add(arm, CONEG(8), mat('#d6d8da'), lf[0], lf[1] - 0.055, 0, 0.008, 0.11, 0.008, 0, Math.PI, 0);
  // visitor centre + road through the karst forest
  cube(gp, '#f2efe6', 0.3, gy(0.3, 0.33) - 0.004, 0.33, 0.07, 0.025, 0.045, -0.5);
  cube(gp, '#7a8a96', 0.3, gy(0.3, 0.33) + 0.021, 0.33, 0.075, 0.006, 0.05, -0.5);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU, d = rr(Rd + 0.07, 0.47), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - 0.3, z - 0.33) < 0.07) continue;
    bush(gp, x, gy(x, z) - 0.004, z, rr(0.035, 0.06), rnd() > 0.5 ? '#2f6a26' : '#3f7d32', false);
  }
});

// ───────────────────────────── Guiana Space Centre, Kourou (Ariane 5) ─────────────────────────────
/** Ariane 5 ECA: white cryogenic core, two solid boosters, big ogive fairing; base at y. */
function ariane5(p: THREE.Object3D, x: number, y: number, z: number, k: number): void {
  const q = grp(p, x, y, z);
  // core stage (5.4 m) + upper stage + fairing (5.4 m), total ~52 m
  const core: P2[] = fine([[0, 0], [2.7, 0], [2.7, 31], [2.7, 36], [2.7, 41], [2.65, 44], [2.3, 48], [1.4, 51], [0, 52.5]], 2.5).map(([r, h]) => [r * k, h * k]);
  plathe(q, core, '#f4f4f0', (_x, yy, zz) => {
    const m = yy / k;
    if (m < 1.2) return '#3a3a3c';
    if (m > 30.5 && m < 31.5) return '#c8c8c4';
    if (m > 35.6 && m < 36.4) return '#1e3a8a';
    if (m > 18 && m < 26 && zz > 0 && Math.abs(_x) < 0.8 * k) return '#1e3a8a';
    return null;
  }, 0, 0, 0, 16);
  add(q, CYLG(10), mat('#3a3a3c'), 0, -1.8 * k, 0, 1.4 * k, 3 * k, 1.4 * k);
  // solid boosters (EAP) on either side
  for (const s of [-1, 1]) {
    const bp: P2[] = [[0, 0], [1.5, 0], [1.5, 26], [1.4, 28], [0.9, 30.5], [0, 31.5]].map(([r, h]) => [r * k, h * k]) as P2[];
    plathe(q, bp, '#f0efe9', (_x, yy) => (yy / k < 2.5 ? '#c8c8c4' : yy / k > 12 && yy / k < 12.6 ? '#d0d0cc' : null), s * 4.4 * k, 0, 0, 12);
    add(q, CONEG(10), mat('#3a3a3c'), s * 4.4 * k, -1.6 * k, 0, 1.2 * k, 3.2 * k, 1.2 * k, 0, Math.PI, 0);
    bar(q, [s * 2.7 * k, 4 * k, 0], [s * 2.9 * k, 4 * k, 0], 0.6 * k, '#b8b8b4', 4);
    bar(q, [s * 2.7 * k, 24 * k, 0], [s * 2.9 * k, 24 * k, 0], 0.6 * k, '#b8b8b4', 4);
  }
}
const sx_kourou: Builder = batched((gp) => {
  srand(402);
  const h: HFn = (x, z) => {
    const sea = sstep(-0.22, -0.36, z);
    return 0.03 * (1 - sea) - 0.012 * sea + (fbm(x * 8, 3, z * 8, 2) - 0.5) * 0.02 * (1 - sea);
  };
  ground(gp, h, (x, y, z) => {
    if (y < Y0 - 0.002) return Math.sin(x * 70 + Math.sin(z * 30) * 2) > 0.92 ? '#5aa0c8' : '#2f7fb0';
    if (y < Y0 + 0.006) return '#d8c8a0';
    const pad = Math.abs(x) < 0.17 && z > -0.12 && z < 0.24;
    if (pad) return '#bdbab2';
    const f = fbm(x * 12, 1, z * 12, 2);
    return f > 0.62 ? '#245a20' : f < 0.36 ? '#4a8a34' : '#336e28';
  });
  const gy = at(h);
  const base = gy(0, 0.05);
  // concrete apron with the flame trench, rails to the assembly building
  cube(gp, '#cfccc4', 0, base - 0.006, 0.05, 0.3, 0.012, 0.32);
  cube(gp, '#2a2826', 0, base - 0.004, -0.02, 0.07, 0.012, 0.12);
  for (const s of [-0.03, 0.03]) cube(gp, '#6a6a6a', s, base + 0.006, 0.17, 0.006, 0.004, 0.18);
  // mobile launch table carrying the rocket
  cube(gp, '#7a7e84', 0, base + 0.006, 0.0, 0.16, 0.05, 0.12);
  cube(gp, '#5a5e64', 0, base + 0.056, 0.0, 0.17, 0.008, 0.13);
  for (const s of [-1, 1]) {
    cube(gp, '#b4b8bc', s * 0.1, base + 0.006, -0.02, 0.025, 0.25, 0.025);
    bar(gp, [s * 0.1, base + 0.2, -0.02], [s * 0.03, base + 0.2, -0.0], 0.004, '#b4b8bc', 4);
  }
  ariane5(gp, 0, base + 0.08, 0.0, 0.0075);
  // four lightning masts around the pad
  for (const [x, z] of [[-0.16, -0.12], [0.16, -0.12], [-0.16, 0.18], [0.16, 0.18]] as P2[]) {
    const y = gy(x, z);
    for (let i = 0; i < 3; i++) bar(gp, [x, y + i * 0.15, z], [x, y + (i + 1) * 0.15, z], 0.006 - i * 0.0015, i % 2 ? '#e8e8e4' : '#d8402a', 5);
    bar(gp, [x, y + 0.45, z], [x, y + 0.52, z], 0.0015, '#888888', 3);
  }
  // final assembly building (BAF), white with the blue CNES/ESA stripe
  const bf = grp(gp, 0.0, gy(0, 0.4), 0.4);
  cube(bf, '#f0f0ec', 0, -0.004, 0, 0.18, 0.2, 0.1);
  cube(bf, '#1e4a9a', 0, 0.16, 0.051, 0.18, 0.012, 0.002);
  cube(bf, '#c8ccd0', 0, -0.004, -0.051, 0.06, 0.17, 0.004);
  cube(bf, '#e6e6e2', -0.12, -0.004, 0, 0.06, 0.1, 0.08);
  // jungle canopy all around
  for (let i = 0; i < 36; i++) {
    const a = rnd() * TAU, d = rr(0.24, 0.47), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z < -0.22 || (Math.abs(x) < 0.12 && z > 0.2) || (Math.abs(x) < 0.2 && z > 0.3)) continue;
    bush(gp, x, gy(x, z) - 0.004, z, rr(0.05, 0.08), rnd() > 0.5 ? '#2a6a24' : '#3a7d2e', false);
  }
  for (let i = 0; i < 4; i++) palm(gp, -0.3 + i * 0.2, gy(-0.3 + i * 0.2, -0.24), -0.24, 0.08, 0.3);
});

// ───────────────────────────── Parkes radio telescope "The Dish" (Australia, 1961) ─────────────────────────────
const sheep = (p: THREE.Object3D, x: number, y: number, z: number, ry: number): void => {
  const q = grp(p, x, y, z, ry);
  ell(q, '#f1ede2', 0, 0.011, 0, 0.014, 0.009, 0.009, 0, 7);
  ell(q, '#2e2a26', 0.015, 0.014, 0, 0.0055, 0.005, 0.0045, 0, 6);
  for (const [lx, lz] of [[-0.008, -0.004], [-0.008, 0.004], [0.008, -0.004], [0.008, 0.004]]) bar(q, [lx, 0.004, lz], [lx, -0.002, lz], 0.0016, '#2e2a26', 3);
};
const gum = (p: THREE.Object3D, x: number, y: number, z: number, s: number): void => {
  bar(p, [x, y, z], [x + s * 0.05, y + s * 0.6, z], s * 0.05, '#d9d2c2', 5);
  bar(p, [x + s * 0.05, y + s * 0.5, z], [x - s * 0.18, y + s * 0.85, z + s * 0.06], s * 0.03, '#d9d2c2', 4);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + x * 9;
    ell(p, i % 2 ? '#7d9a74' : '#6a8a66', x + Math.cos(a) * s * 0.2, y + s * (0.8 + 0.1 * (i % 3)), z + Math.sin(a) * s * 0.15, s * 0.24, s * 0.15, s * 0.22, a, 6, false);
  }
};
const sx_parkes: Builder = batched((gp) => {
  srand(403);
  const h: HFn = (x, z) => 0.012 + (fbm(x * 6, 4, z * 6, 2) - 0.5) * 0.016 + sstep(0.15, 0.5, -z) * 0.012;
  const road = (x: number, z: number) => Math.abs(x - 0.2 - Math.sin(z * 5) * 0.04) < 0.022 && z > 0.05;
  ground(gp, h, (x, _y, z) => {
    if (road(x, z)) return '#8a8580';
    const f = fbm(x * 16, 5, z * 16, 2);
    return f > 0.62 ? '#b4a860' : f < 0.38 ? '#7f9a48' : '#97a452';
  });
  const gy = at(h);
  const by = gy(0, -0.04);
  // three-storey drum tower: brick-red base, cream upper floor with windows, white rim
  const T = grp(gp, 0, by - 0.004, -0.04);
  plathe(T, fine([[0, 0], [0.085, 0], [0.085, 0.13], [0, 0.13]], 0.0116), '#a85e3a', (x, y, z) => {
    if (y > 0.129) return '#d9d4ca';
    const seg = Math.floor(((Math.atan2(z, x) / TAU) + 1) * 32) % 2;
    if (y > 0.09) return seg && y > 0.098 && y < 0.12 ? '#2a2c30' : '#e2d6be';
    return seg && ((y > 0.036 && y < 0.05) || (y > 0.064 && y < 0.078)) ? '#3a3230' : null;
  }, 0, 0, 0, 32);
  cyl(T, '#f2f2ee', 0, 0.128, 0, 0.09, 0.008, 24);
  cyl(T, '#c9c6be', 0, 0.136, 0, 0.055, 0.02, 16);
  for (const s of [-1, 1]) cube(T, '#d6d6d0', s * 0.045, 0.15, 0, 0.018, 0.05, 0.04);
  // the 64 m dish, tilted to look at the sky above the viewer
  const D = grp(T, 0, 0.195, 0, 0, 0.6);
  const Rd = 0.2, kd = 1.4;
  add(D, CONEG(12), mat('#d4d6d6'), 0, 0.012, 0, 0.075, 0.07, 0.075, 0, Math.PI, 0);
  const V = grp(D, 0, 0.045, 0);
  const dp = dishPaint('#eceeee', '#a9b1b8', 48, 7, Rd);
  dish(V, Rd, kd, (x, y, z, nx, ny, nz) => (Math.hypot(x, z) > Rd * 0.62 ? (Math.floor(Math.atan2(z, x) * 15) % 2 ? '#c4cbd0' : '#d6dce0') : dp(x, y, z, nx, ny, nz)), '#e6e8e8', '#cdd1d4', 48, 8, 0.02);
  cyl(V, '#bfc4c8', 0, -0.004, 0, 0.022, 0.012, 10);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, ca = Math.cos(a) * Rd * 0.98, sa = Math.sin(a) * Rd * 0.98;
    bar(V, [0, -0.025, 0], [ca, kd * Rd * Rd - 0.006, sa], 0.0028, '#d8dadc', 3);
  }
  // tripod and focus cabin
  const f = 1 / (4 * kd);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2, r = Rd * 0.85;
    bar(V, [Math.cos(a) * r, kd * r * r, Math.sin(a) * r], [0, f - 0.01, 0], 0.003, '#f2f2f0', 4);
  }
  cyl(V, '#e8e8e4', 0, f - 0.015, 0, 0.016, 0.035, 10);
  cyl(V, '#8a8f94', 0, f + 0.02, 0, 0.01, 0.006, 8);
  // sheep paddock, gum trees, visitor centre and a little dish
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, d = rr(0.2, 0.42), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (road(x, z) || road(x + 0.02, z)) continue;
    sheep(gp, x, gy(x, z) - 0.002, z, rnd() * TAU);
  }
  for (const [x, z, s] of [[-0.36, -0.2, 0.16], [-0.28, -0.32, 0.13], [0.36, -0.22, 0.15], [0.4, 0.05, 0.12], [-0.42, 0.05, 0.12], [0.08, -0.42, 0.14]] as V3[]) gum(gp, x, gy(x, z) - 0.003, z, s);
  cube(gp, '#efe9dc', 0.3, gy(0.3, 0.25) - 0.004, 0.25, 0.1, 0.03, 0.055, -0.4);
  cube(gp, '#8a6a4a', 0.3, gy(0.3, 0.25) + 0.026, 0.25, 0.11, 0.006, 0.065, -0.4);
  const sd = grp(gp, -0.28, gy(-0.28, 0.22), 0.22);
  bar(sd, [0, 0, 0], [0, 0.05, 0], 0.006, '#e8e8e4', 5);
  const sdd = grp(sd, 0, 0.055, 0, 0.6, 0.7);
  dish(sdd, 0.04, 3, undefined, '#f2f2f0', '#d0d4d6', 16, 3);
});

// ───────────────────────────── Southern African Large Telescope (Karoo, 2005) ─────────────────────────────
const sx_salt: Builder = batched((gp) => {
  srand(404);
  const h: HFn = (x, z) => 0.03 - sstep(0.12, 0.5, Math.hypot(x, z)) * 0.02 + (fbm(x * 7, 6, z * 7, 2) - 0.5) * 0.025 * sstep(0.12, 0.3, Math.hypot(x, z));
  const road = (x: number, z: number) => Math.abs(x - 0.06 - z * 0.3 - Math.sin(z * 9) * 0.04) < 0.02 && z > 0.1;
  ground(gp, h, (x, _y, z) => {
    if (road(x, z)) return '#5e5c5a';
    if (Math.hypot(x + 0.02, z) < 0.15) return '#b9a98e';
    const f = fbm(x * 20, 7, z * 20, 2);
    return f > 0.6 ? '#8a7a5a' : f < 0.36 ? '#a88a62' : '#9a7e5c';
  });
  const gy = at(h);
  const by = gy(0, 0) - 0.004;
  // white drum building with rows of small windows
  const B = grp(gp, -0.02, by, 0.0);
  const Rb = 0.115, Hb = 0.15;
  plathe(B, fine([[0, 0], [Rb, 0], [Rb, Hb], [0, Hb]], 0.0125), '#f3f3ef', (x, y, z) => {
    const seg = Math.floor(((Math.atan2(z, x) / TAU) + 1) * 40) % 3 === 0;
    return seg && y > 0.012 && y < Hb - 0.01 && Math.floor(y / 0.0125) % 2 === 1 ? '#2a3038' : null;
  }, 0, 0, 0, 40);
  cyl(B, '#e0e0dc', 0, Hb - 0.002, 0, Rb + 0.006, 0.008, 32);
  // faceted silver dome with the observing slit open towards the viewer
  const Rdm = 0.11, dome: P2[] = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); dome.push([Math.cos(a) * Rdm, Hb + 0.006 + Math.sin(a) * Rdm]); }
  plathe(B, dome, '#c8ced6', (x, y, z) => {
    const ang = Math.floor(((Math.atan2(z, x) / TAU) + 1) * 36);
    if (Math.abs(x) < 0.022 && z > 0) {
      const row = Math.floor((y - Hb) / 0.01), col = Math.floor(x / 0.01 + row * 0.5);
      return (row + col) % 2 ? '#7e92aa' : '#1c2128';
    }
    return ang % 2 ? '#b8c0ca' : (y - Hb) / Rdm > 0.7 ? '#dfe4ea' : null;
  }, 0, 0, 0, 36, { flat: true, metal: 0.55, rough: 0.3 });
  for (const s of [-1, 1]) bar(B, [s * 0.025, Hb + 0.01, Rdm * 0.98], [s * 0.025, Hb + Rdm * 0.99, 0.01], 0.003, '#9aa4ae', 4);
  // tall white tower with its little dome (the ‘centre of curvature alignment’ tower)
  const tx = 0.12, tz = -0.07;
  cyl(gp, '#f2f2ee', tx, by, tz, 0.032, 0.36, 16);
  cyl(gp, '#e2e2de', tx, by + 0.3, tz, 0.035, 0.006, 16);
  ell(gp, '#ececea', tx, by + 0.36, tz, 0.032, 0.03, 0.032, 0, 12);
  for (let i = 0; i < 6; i++) cube(gp, '#2a3038', tx + 0.012, by + 0.04 + i * 0.045, tz + 0.028, 0.008, 0.016, 0.006, 0.3);
  cube(gp, '#eeeeea', 0.07, by, -0.04, 0.06, 0.12, 0.05);
  // front annex with door and a parked car
  cube(gp, '#f0f0ec', -0.02, by, 0.11, 0.09, 0.05, 0.05);
  cube(gp, '#2a3038', -0.02, by, 0.136, 0.022, 0.032, 0.002);
  cube(gp, '#d8dadc', -0.02, by + 0.05, 0.11, 0.1, 0.006, 0.06);
  cube(gp, '#e8e8e8', 0.12, gy(0.12, 0.14) - 0.002, 0.14, 0.03, 0.012, 0.016, 0.4);
  cube(gp, '#2a3038', 0.12, gy(0.12, 0.14) + 0.01, 0.14, 0.02, 0.006, 0.015, 0.4);
  // neighbouring small observatories on the ridge
  for (const [x, z, r] of [[-0.3, -0.22, 0.04], [-0.38, 0.0, 0.03], [0.32, -0.28, 0.035], [0.38, 0.05, 0.028]] as V3[]) {
    const y = gy(x, z) - 0.003;
    cyl(gp, '#f2f2ee', x, y, z, r, r * 1.1, 14);
    ell(gp, '#e6e8ea', x, y + r * 1.1, z, r, r * 0.95, r, 0, 12);
  }
  // Karoo scrub
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU, d = rr(0.17, 0.47), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (road(x, z) || Math.hypot(x - 0.12, z - 0.14) < 0.04) continue;
    ell(gp, rnd() > 0.5 ? '#6f7a52' : '#8a8a5a', x, gy(x, z), z, rr(0.008, 0.016), rr(0.006, 0.01), rr(0.008, 0.016), 0, 5, false);
  }
});

// ───────────────────────────── Thumba rocket station (Kerala, 1963) ─────────────────────────────
const TORG = () => g('s2:tor', () => new THREE.TorusGeometry(1, 0.1, 4, 14));
/** Bicycle (length ≈ 1.7 s) facing +x, carrying a rocket nose cone on the rear rack. */
function bicycle(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number): void {
  const q = grp(p, x, y, z, ry);
  const r = s * 0.33, fx = s * 0.55, rx = -s * 0.55;
  for (const wx of [fx, rx]) add(q, TORG(), mat('#2a2a2a'), wx, r, 0, r, r, r);
  const k = '#c03a2a', seat: V3 = [rx + s * 0.35, s * 0.85, 0], head: V3 = [fx - s * 0.1, s * 0.92, 0], crank: V3 = [0, r * 0.95, 0];
  bar(q, [rx, r, 0], crank, s * 0.025, k, 3); bar(q, crank, seat, s * 0.025, k, 3); bar(q, seat, head, s * 0.025, k, 3);
  bar(q, crank, head, s * 0.025, k, 3); bar(q, [rx, r, 0], seat, s * 0.02, k, 3); bar(q, head, [fx, r, 0], s * 0.025, '#888888', 3);
  bar(q, [head[0], head[1] + s * 0.05, -s * 0.22], [head[0], head[1] + s * 0.05, s * 0.22], s * 0.02, '#888888', 3);
  cube(q, '#3a2a20', seat[0], seat[1], 0, s * 0.18, s * 0.04, s * 0.08);
  bar(q, [rx, r, 0], [rx, s * 0.75, 0], s * 0.02, '#888888', 3);
  add(q, CONEG(10), mat('#f2f2ee'), rx - s * 0.05, s * 0.86, 0, s * 0.16, s * 0.75, s * 0.16, 0, 0, Math.PI / 2);
}
/** Nike-Apache sounding rocket (two stages, finned), base at origin, pointing +y. */
function nikeApache(p: THREE.Object3D, L: number): void {
  const r = L * 0.035;
  plathe(p, fine([[0, 0], [r * 1.25, 0], [r * 1.25, L * 0.42], [r, L * 0.45], [r, L * 0.86], [r * 0.6, L * 0.95], [0, L]], L * 0.04), '#f2f2ee', (_x, y) => {
    const t = y / L;
    return (t > 0.42 && t < 0.46) || (t > 0.2 && t < 0.24) ? '#e05a1a' : t > 0.88 ? '#d8d8d4' : null;
  }, 0, 0, 0, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4, c = Math.cos(a), sn = Math.sin(a);
    const f1 = grp(p, c * r * 1.6, L * 0.06, sn * r * 1.6, -a);
    cube(f1, '#e05a1a', 0, 0, 0, r * 1.4, L * 0.12, r * 0.12);
    const f2 = grp(p, c * r * 1.3, L * 0.46, sn * r * 1.3, -a);
    cube(f2, '#f2f2ee', 0, 0, 0, r * 0.7, L * 0.06, r * 0.1);
  }
}
const sx_thumba: Builder = batched((gp) => {
  srand(405);
  const h: HFn = (x, z) => {
    const coast = 0.2 + Math.sin(x * 7) * 0.025;
    const land = 1 - sstep(coast - 0.06, coast + 0.04, z), sea = sstep(coast + 0.06, coast + 0.12, z);
    return 0.022 * land + 0.006 * (1 - land) * (1 - sea) - 0.012 * sea + (fbm(x * 8, 8, z * 8, 2) - 0.5) * 0.015 * land;
  };
  ground(gp, h, (x, y, z) => {
    if (y < Y0 - 0.006) return Math.sin(x * 60 + z * 40) > 0.85 ? '#7cc2d8' : '#2f86b0';
    if (y < Y0 - 0.002) return '#f0f0e8';
    if (y < Y0 + 0.012) return '#e8d4a6';
    if (Math.hypot(x + 0.02, z + 0.02) < 0.11) return '#c7c2b6';
    const f = fbm(x * 14, 3, z * 14, 2);
    return f > 0.6 ? '#3f7a2e' : f < 0.38 ? '#5f9a3a' : '#4c8a34';
  });
  const gy = at(h);
  // the old seaside church that became the first office (now the space museum)
  const C = grp(gp, -0.24, gy(-0.24, -0.16) - 0.004, -0.16, 0.35);
  cube(C, '#f1e9d6', 0, 0, 0, 0.1, 0.07, 0.16);
  for (const s of [-1, 1]) cube(C, '#b0482e', s * 0.028, 0.068, 0, 0.068, 0.006, 0.17, 0, 0, s * -0.6);
  slab(C, [[-0.05, 0.07], [0.05, 0.07], [0, 0.11]], 0.008, '#f6efde', 0, false).position.set(0, 0, 0.08);
  cube(C, '#f6efde', 0, 0, 0.083, 0.11, 0.075, 0.008);
  cube(C, '#5a3a2a', 0, 0, 0.088, 0.024, 0.04, 0.003);
  cube(C, '#f6efde', 0, 0.105, 0.083, 0.02, 0.025, 0.008);
  cube(C, '#d8b030', 0, 0.13, 0.083, 0.004, 0.022, 0.004); cube(C, '#d8b030', 0, 0.141, 0.083, 0.014, 0.004, 0.004);
  for (const s of [-1, 1]) cube(C, '#4a6a8a', s * 0.051, 0.03, 0, 0.002, 0.022, 0.1);
  // concrete launch pad with the rocket on its tilted rail launcher
  const py = gy(-0.02, -0.02);
  cube(gp, '#b4b0a8', -0.02, py - 0.004, -0.02, 0.18, 0.012, 0.18);
  const L = grp(gp, -0.02, py + 0.008, -0.02, 0.5, 0, 0.14);
  cube(L, '#5a6066', 0, 0, 0, 0.06, 0.02, 0.06);
  cube(L, '#3a6a9a', -0.022, 0.02, 0, 0.012, 0.36, 0.012);
  for (const s of [-1, 1]) bar(gp, [-0.02 + s * 0.06, py + 0.008, -0.07], [-0.06, py + 0.2, -0.02], 0.003, '#6a7078', 4);
  const R = grp(L, 0, 0.04, 0);
  nikeApache(R, 0.38);
  // bicycle carrying a nose cone, with its rider walking alongside
  bicycle(gp, 0.17, gy(0.17, 0.12), 0.12, 0.3, 0.075);
  person(gp, 0.15, gy(0.15, 0.16), 0.16, 0.06, '#f2f2ee');
  person(gp, 0.06, gy(0.06, 0.08), 0.08, 0.055, '#2b5d9c');
  // small block house and coconut palms along the shore
  cube(gp, '#e8e4da', 0.2, gy(0.2, -0.12) - 0.004, -0.12, 0.08, 0.04, 0.05, -0.3);
  cube(gp, '#8a5a3a', 0.2, gy(0.2, -0.12) + 0.036, -0.12, 0.09, 0.006, 0.06, -0.3);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, d = rr(0.22, 0.4), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (h(x, z) < 0.012 || Math.hypot(x + 0.24, z + 0.16) < 0.12) continue;
    palm(gp, x, gy(x, z) - 0.003, z, rr(0.13, 0.18), rnd() * TAU);
  }
  // fishing boat pulled up on the sand
  const bx = -0.12, bz = 0.24, bt = grp(gp, bx, gy(bx, bz) + 0.004, bz, 0.4);
  add(bt, SPH(10), mat('#2f6a9a'), 0, 0.006, 0, 0.07, 0.016, 0.018);
  add(bt, SPH(10), mat('#c8462a'), 0, 0.012, 0, 0.068, 0.006, 0.016);
  bar(bt, [0.0, 0.01, 0], [0.0, 0.07, 0], 0.002, '#6a4a32', 3);
});

// ───────────────────────────── Jantar Mantar, Jaipur (1734) ─────────────────────────────
const sx_jantar: Builder = batched((gp) => {
  srand(406);
  const bowls: P2[] = [[-0.25, 0.17], [-0.08, 0.27]];
  const Rb = 0.06;
  const h: HFn = (x, z) => {
    let d = 0.03;
    for (const [bx, bz] of bowls) { const r = Math.hypot(x - bx, z - bz); if (r < 0.08) d = Math.min(d, 0.03 - 0.065 * Math.sqrt(1 - (r / 0.08) ** 2)); }
    return d;
  };
  ground(gp, h, (x, _y, z) => {
    const lawn = (Math.abs(x - 0.25) < 0.16 && z > 0.08 && z < 0.4 && Math.abs(x - 0.25) > 0.02) || (x < -0.15 && z < -0.05 && z > -0.36);
    if (lawn) return fbm(x * 30, 1, z * 30, 2) > 0.55 ? '#5f9a40' : '#6aa646';
    return fbm(x * 25, 2, z * 25, 2) > 0.6 ? '#c8b088' : '#d6c098';
  }, undefined, 26, 72);
  const gy = at(h), by = gy(0, -0.05) - 0.003;
  const ochre = '#e0a868', ochreD = '#c88a50', marble = '#f2ece0';
  // Samrat Yantra: giant right-angled gnomon whose slope points at the Pole Star
  const x0 = -0.22, x1 = 0.2, H = 0.22, zw = -0.07, tw = 0.045;
  const tri = slab(gp, [[x0, 0], [x1, 0], [x1, H]], tw, ochre, 0, false);
  tri.position.set(0, by, zw);
  cube(gp, ochre, x1 - 0.015, by, zw, 0.03, H, tw + 0.004);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) cube(gp, '#6a3a24', -0.1 + i * 0.07, by, zw + s * (tw / 2 + 0.001), 0.03, 0.02 + i * 0.006, 0.002);
  const qb = new QB();
  // staircase up the slope
  const n = 22, ang = Math.atan2(H, x1 - x0);
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n;
    const ya = by + (H * i) / n + 0.003, yb = by + (H * (i + 1)) / n + 0.003;
    const zl = zw - tw / 2, zr = zw + tw / 2;
    qb.quad([xa, ya, zl], [xa, ya, zr], [xa, yb, zr], [xa, yb, zl], '#d8cbb4', true);
    qb.quad([xa, yb, zl], [xa, yb, zr], [xb, yb, zr], [xb, yb, zl], i % 2 ? '#f0e6d4' : '#e6dac4', true);
  }
  // the two quadrant scales (east & west), perpendicular to the gnomon slope
  const dx = Math.cos(ang), dy = Math.sin(ang), e2: V3 = [Math.sin(ang), -Math.cos(ang), 0];
  const cxq = 0.0, C: V3 = [cxq, by + ((cxq - x0) / (x1 - x0)) * H, zw], Rq = 0.13, w = 0.05, N = 18;
  for (const sz of [-1, 1]) {
    const pt = (t: number, o: number): V3 => {
      const a = (t * Math.PI) / 2, c = Math.cos(a) * Rq, s = Math.sin(a) * Rq;
      return [C[0] + e2[0] * s + dx * o, Math.max(by, C[1] + e2[1] * s + dy * o), C[2] + sz * (c + tw / 2)];
    };
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const a0 = pt(t0, -w), a1 = pt(t0, w), b0 = pt(t1, -w), b1 = pt(t1, w);
      qb.quad(a0, a1, b1, b0, i % 3 === 0 ? '#8a5a3a' : marble, true);
      for (const [u, v] of [[a0, b0], [a1, b1]]) qb.quad(u, v, [v[0], by, v[2]], [u[0], by, u[2]], ochreD, true);
    }
  }
  qb.build(gp, { rough: 0.8 });
  // little chhatri pavilion on top
  const ty = by + H;
  cube(gp, ochre, x1 - 0.015, ty, zw, 0.05, 0.006, 0.05);
  for (const [px, pz] of [[-0.018, -0.018], [0.018, -0.018], [-0.018, 0.018], [0.018, 0.018]]) cube(gp, marble, x1 - 0.015 + px, ty + 0.006, zw + pz, 0.006, 0.03, 0.006);
  ell(gp, marble, x1 - 0.015, ty + 0.038, zw, 0.026, 0.02, 0.026, 0, 10);
  cube(gp, '#d8b030', x1 - 0.015, ty + 0.056, zw, 0.004, 0.012, 0.004);
  // Jai Prakash Yantra: twin sunken marble bowls, gridded with lines of the sky
  for (const [bx, bz] of bowls) {
    const prof: P2[] = [];
    for (let i = 0; i <= 9; i++) { const a = (i / 9) * (Math.PI / 2); prof.push([Math.sin(a) * Rb, gy(bx, bz + 0.2) + 0.006 - Math.cos(a) * Rb]); }
    plathe(gp, prof.reverse(), marble, (x, y, z) => {
      const a = Math.atan2(z, x), seg = Math.floor(((a / TAU) + 1) * 12) % 2;
      const lat = Math.abs(((y * 150) % 1 + 1) % 1 - 0.5) > 0.42;
      return seg ? (lat ? '#b06a40' : '#e6dccb') : lat ? '#9a5a34' : null;
    }, bx, 0, bz, 24);
    plathe(gp, [[Rb, 0], [0.084, 0], [0.084, 0.012], [Rb, 0.012], [Rb, 0]], ochreD, undefined, bx, gy(bx, bz + 0.2) - 0.006, bz, 24);
    bar(gp, [bx - Rb, gy(bx, bz + 0.2) + 0.006, bz], [bx + Rb, gy(bx, bz + 0.2) + 0.006, bz], 0.0012, '#3a3a3a', 3);
    bar(gp, [bx, gy(bx, bz + 0.2) + 0.006, bz - Rb], [bx, gy(bx, bz + 0.2) + 0.006, bz + Rb], 0.0012, '#3a3a3a', 3);
  }
  // Rama Yantra: open-roofed round colonnade with a central pillar
  const rx = 0.25, rz = 0.2, ry = gy(rx, rz) - 0.003;
  cyl(gp, ochreD, rx, ry, rz, 0.075, 0.012, 24);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; cube(gp, ochre, rx + Math.cos(a) * 0.065, ry + 0.012, rz + Math.sin(a) * 0.065, 0.014, 0.06, 0.014, -a); }
  plathe(gp, [[0.058, 0], [0.074, 0], [0.074, 0.012], [0.058, 0.012], [0.058, 0]], ochre, undefined, rx, ry + 0.072, rz, 24);
  cyl(gp, marble, rx, ry + 0.012, rz, 0.008, 0.07, 8);
  // visitors, trees and the boundary wall
  for (let i = 0; i < 10; i++) {
    const x = rr(-0.3, 0.3), z = rr(-0.02, 0.4);
    if (Math.hypot(x - rx, z - rz) < 0.09 || bowls.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 0.1)) continue;
    person(gp, x, gy(x, z) - 0.002, z, 0.045, ['#d83a5a', '#f2c230', '#2b5d9c', '#f2f2ee', '#e06a1a'][i % 5]);
  }
  for (const [x, z] of [[-0.4, -0.2], [-0.3, -0.34], [0.38, -0.2], [0.42, 0.05], [-0.44, 0.08], [0.0, -0.44], [0.2, -0.4]] as P2[]) bush(gp, x, gy(x, z) - 0.003, z, 0.09, '#4a7d34');
});

// ───────────────────────────── Hoba meteorite (Namibia, found 1920) ─────────────────────────────
/** Rounded, dented box (superellipsoid + noise) for boulders and meteorites. */
function rock(p: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, paint: Paint, base: string, sd: number, ry = 0, o: { metal?: number; rough?: number } = {}): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1, 5, 2, 5);
  const ps = geo.getAttribute('position');
  for (let i = 0; i < ps.count; i++) {
    _v.fromBufferAttribute(ps, i);
    const nn = Math.pow(Math.abs(2 * _v.x) ** 4 + Math.abs(2 * _v.y) ** 4 + Math.abs(2 * _v.z) ** 4, 0.25);
    const k = (0.5 / nn) * 2 * (1 + (fbm(_v.x * 4 + sd, _v.y * 4, _v.z * 4, 2) - 0.5) * 0.35);
    ps.setXYZ(i, _v.x * k, _v.y * k, _v.z * k);
  }
  geo.computeVertexNormals();
  return add(p, paintFaces(geo, base, paint), VC({ flat: true, ...o }), x, y, z, sx, sy, sz, ry);
}
const sx_hoba: Builder = batched((gp) => {
  srand(407);
  const h: HFn = (x, z) => 0.064 - sstep(0.385, 0.34, Math.hypot(x, z)) * 0.08 + (fbm(x * 9, 10, z * 9, 2) - 0.5) * 0.012;
  ground(gp, h, (x, _y, z) => {
    if (Math.abs(x) < 0.03 && z > 0.36) return '#b0704a';
    const f = fbm(x * 18, 11, z * 18, 2);
    return f > 0.62 ? '#a89858' : f < 0.36 ? '#d2bc80' : '#c4ac6c';
  });
  const gy = at(h);
  // stepped dry-stone amphitheatre built around the meteorite
  const steps: P2[] = [[0.395, 0.066], [0.33, 0.066], [0.33, 0.05], [0.275, 0.05], [0.275, 0.034], [0.22, 0.034], [0.22, 0.018], [0.165, 0.018], [0.165, 0.002], [0, 0.002]];
  const prof: P2[] = [steps[0]];
  for (let i = 1; i < steps.length; i++) {
    const [r0, y0] = steps[i - 1], [r1, y1] = steps[i], n = r0 === r1 ? 3 : r0 - r1 > 0.1 ? 3 : 1;
    for (let k = 1; k <= n; k++) prof.push([r0 + ((r1 - r0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  for (const q of prof) q[1] += Y0;
  plathe(gp, prof, '#b8ae9a', (x, y, z, _nx, ny) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (Math.abs(ny) < 0.5) {
      const row = Math.floor((y - Y0) / 0.00533), c = Math.floor(a * 30 + row * 0.5);
      return (row + c) % 3 === 0 ? '#6e6a62' : (row + c) % 3 === 1 ? '#8e887c' : '#a39c8e';
    }
    if (r < 0.165) return fbm(x * 30, 3, z * 30, 2) > 0.55 ? '#b8986e' : '#c8a87e';
    return Math.floor(a * 14) % 2 ? '#c2b8a2' : '#b4aa94';
  }, 0, 0, 0, 64);
  // a few stair blocks leading down at the front
  for (const [r, y0, y1] of [[0.33, 0.05, 0.066], [0.275, 0.034, 0.05], [0.22, 0.018, 0.034], [0.165, 0.002, 0.018]]) {
    cube(gp, '#a39c8e', 0, Y0 + y0, r - 0.009, 0.06, (y1 - y0) / 2, 0.018);
  }
  // the 60-tonne iron slab: dark metal, rusty patches, one shiny sawn corner
  const fy = Y0 + 0.002;
  rock(gp, 0, fy + 0.02, -0.01, 0.24, 0.07, 0.2, (x, y, z) => {
    if (x > 0.38 && z > 0.3 && y > 0) return '#a8a8a4';
    const f = fbm(x * 9, y * 9, z * 9, 2);
    return f > 0.64 ? '#5a3a26' : f < 0.4 ? '#2a2624' : null;
  }, '#3e3834', 3, 0.25, { metal: 0.45, rough: 0.55 });
  // visitors (one child sitting on top), information board and camel-thorn trees
  person(gp, 0.03, fy + 0.05, -0.02, 0.04, '#e05a2a');
  person(gp, -0.2, Y0 + 0.034, 0.12, 0.05, '#2b5d9c');
  person(gp, 0.24, Y0 + 0.05, -0.12, 0.05, '#f2c230');
  person(gp, 0.06, Y0 + 0.066, 0.36, 0.05, '#3a8a5a');
  const by = gy(-0.1, 0.42);
  bar(gp, [-0.12, by, 0.42], [-0.12, by + 0.04, 0.42], 0.003, '#6a4a32', 4);
  bar(gp, [-0.07, by, 0.42], [-0.07, by + 0.04, 0.42], 0.003, '#6a4a32', 4);
  cube(gp, '#3a5a3a', -0.095, by + 0.03, 0.42, 0.06, 0.03, 0.004, 0.0);
  for (const [x, z, s] of [[-0.42, -0.12, 0.13], [0.4, -0.2, 0.15], [-0.2, -0.43, 0.12], [0.36, 0.28, 0.11], [-0.38, 0.26, 0.1]] as V3[]) acacia(gp, x, gy(x, z) - 0.003, z, s);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, d = rr(0.4, 0.48), x = Math.cos(a) * d, z = Math.sin(a) * d;
    ell(gp, rnd() > 0.5 ? '#8a8a4a' : '#a09a5a', x, gy(x, z), z, rr(0.01, 0.018), rr(0.006, 0.01), rr(0.01, 0.018), 0, 5, false);
  }
});

// ───────────────────────────── Very Large Telescope, Cerro Paranal (1998) ─────────────────────────────
const sx_paranal: Builder = batched((gp) => {
  srand(408);
  const e = (x: number, z: number) => Math.hypot(x / 0.36, (z + 0.03) / 0.16);
  const h: HFn = (x, z) => {
    const k = e(x, z), sl = sstep(1, 2.6, k);
    return 0.17 - 0.15 * sl + (fbm(x * 7, 12, z * 7, 2) - 0.5) * 0.05 * Math.sin(Math.PI * Math.min(1, sl * 1.2)) + (fbm(x * 3, 13, z * 3, 2) - 0.5) * 0.02 * sl;
  };
  const road = (x: number, z: number) => { const k = e(x, z); return k > 1.05 && Math.abs(x - 0.06 + Math.sin(z * 14) * 0.08) < 0.016 && z > 0.1; };
  ground(gp, h, (x, y, z) => {
    if (e(x, z) < 1.04) return Math.abs(z + 0.03) < 0.014 || Math.abs(z - 0.075) < 0.008 ? '#d8d2c4' : '#c4b29a';
    if (road(x, z)) return '#cfc6b4';
    const f = fbm(x * 14, 14, z * 14, 2);
    return f > 0.6 ? '#7e4028' : y > Y0 + 0.11 ? '#b06a40' : f < 0.4 ? '#c0804e' : '#a45a36';
  }, undefined, 26, 72);
  const top = Y0 + 0.17 - 0.003;
  // four 8.2 m Unit Telescope enclosures in a row, slits open
  const uts: number[] = [-0.255, -0.085, 0.085, 0.255];
  uts.forEach((x, i) => {
    const u = grp(gp, x, top, -0.04, (i - 1.5) * 0.12);
    cyl(u, '#efefea', 0, 0, 0, 0.046, 0.02, 16);
    cube(u, '#d4d8dc', 0, 0.02, 0, 0.08, 0.055, 0.075);
    add(u, CYLG(14), mat('#dfe2e6', { metal: 0.3 }), 0, 0.075, 0, 0.0375, 0.08, 0.0375, 0, 0, Math.PI / 2);
    cube(u, '#14181e', 0, 0.022, 0.0376, 0.03, 0.068, 0.002);
    cube(u, '#14181e', 0, 0.105, 0.0, 0.03, 0.009, 0.06);
    cube(u, '#f2f2ee', 0, 0.03, 0.03, 0.008, 0.05, 0.004);
    cube(u, '#b8bcc0', 0, 0.02, -0.0376, 0.08, 0.05, 0.002);
  });
  // laser guide star beam from UT4
  add(gp, CYLG(6), mat('#ffb040', { emissive: '#ff9a20', transparent: 0.75 }), 0.29, top + 0.32, -0.15, 0.004, 0.46, 0.004, 0, -0.22, -0.28).castShadow = false;
  // auxiliary telescopes on their rails, and the survey telescope further along
  for (const s of [-0.004, 0.004]) cube(gp, '#6a6a6a', 0, top + 0.001, 0.075 + s, 0.5, 0.002, 0.002);
  for (const x of [-0.18, -0.02, 0.15]) {
    cyl(gp, '#f2f2ee', x, top, 0.075, 0.018, 0.015, 12);
    ell(gp, '#f6f6f4', x, top + 0.015, 0.075, 0.018, 0.017, 0.018, 0, 10);
    cube(gp, '#2a2e34', x, top + 0.02, 0.092, 0.006, 0.01, 0.003);
  }
  cyl(gp, '#efefea', -0.35, top - 0.01, 0.06, 0.03, 0.04, 14);
  ell(gp, '#f4f4f2', -0.35, top + 0.03, 0.06, 0.03, 0.028, 0.03, 0, 12);
  // control building and service road down the mountain
  const cx = 0.26, cz = 0.3, cyy = Y0 + h(cx, cz) - 0.01;
  cube(gp, '#e8e2d6', cx, cyy, cz, 0.12, 0.03, 0.05, -0.3);
  cube(gp, '#c4bcb0', cx, cyy + 0.03, cz, 0.13, 0.005, 0.06, -0.3);
  person(gp, 0.0, top, 0.12, 0.045, '#e05a2a');
  person(gp, 0.03, top, 0.13, 0.045, '#2b5d9c');
});

// ───────────────────────────── Richat Structure, "Eye of the Sahara" (Mauritania) ─────────────────────────────
function camel(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, c = '#c49a62'): void {
  const q = grp(p, x, y, z, ry);
  ell(q, c, 0, s * 0.62, 0, s * 0.42, s * 0.2, s * 0.17, 0, 7);
  ell(q, shade(c, 0.92), -s * 0.02, s * 0.84, 0, s * 0.2, s * 0.17, s * 0.13, 0, 7);
  bar(q, [s * 0.35, s * 0.66, 0], [s * 0.55, s * 0.95, 0], s * 0.07, c, 4);
  ell(q, c, s * 0.62, s * 0.98, 0, s * 0.13, s * 0.07, s * 0.07, 0, 6);
  for (const [lx, lz] of [[-0.28, -0.09], [-0.28, 0.09], [0.28, -0.09], [0.28, 0.09]]) bar(q, [lx * s, s * 0.55, lz * s], [lx * s, 0, lz * s], s * 0.045, shade(c, 0.85), 3);
}
const richatD = (x: number, z: number) => (Math.hypot(x, z * 1.1) + (fbm(x * 5, 9, z * 5, 2) - 0.5) * 0.07) / 0.4;
const dc_richat: Builder = batched((gp) => {
  srand(409);
  const h: HFn = (x, z) => {
    const d = richatD(x, z);
    const ridge = Math.pow(Math.abs(Math.sin(d * Math.PI * 4)), 2) * 0.022 * (1.1 - 0.4 * d) * (1 - sstep(1.0, 1.12, d));
    const dunes = (Math.sin(x * 46 + Math.sin(z * 9) * 1.5) * 0.5 + 0.5) ** 2 * 0.012 * sstep(1.05, 1.2, d);
    return 0.02 + 0.03 * Math.max(0, 1 - d * d) + ridge + dunes - 0.006 * sstep(0.95, 1.1, d) * (1 - sstep(1.1, 1.2, d));
  };
  ground(gp, h, (x, _y, z) => {
    const d = richatD(x, z);
    if (d > 1.12) return fbm(x * 20, 15, z * 20, 2) > 0.55 ? '#e6b878' : '#dcaa68';
    const b = d * 8, fr = b - Math.floor(b), band = Math.floor(b);
    if (d < 0.14) return '#e8dcc6';
    if (fr > 0.3 && fr < 0.7) return band % 2 ? '#6a4630' : '#86603e';
    return band % 3 === 0 ? '#d8bc8e' : band % 3 === 1 ? '#c49a6a' : '#b48458';
  }, undefined, 34, 96);
  const gy = at(h);
  // a little camel caravan crossing the dunes at the edge
  [[0.24, 0.38], [0.3, 0.34], [0.36, 0.29]].forEach(([x, z], i) => camel(gp, x, gy(x, z) - 0.002, z, -0.75, 0.065, i === 1 ? '#a87a4a' : '#c49a62'));
  person(gp, 0.18, gy(0.18, 0.42), 0.42, 0.05, '#2a5aa8');
  for (let i = 0; i < 10; i++) {
    const a = rnd() * TAU, d = rr(0.2, 0.36), x = Math.cos(a) * d, z = Math.sin(a) * d;
    ell(gp, '#7a7a3a', x, gy(x, z), z, 0.008, 0.006, 0.008, 0, 5, false);
  }
});

// ───────────────────────────── Cueva de las Manos (Patagonia, ~9,300 years old) ─────────────────────────────
const HANDG = () => g('s2:hand', () => {
  const sh: THREE.Shape[] = [];
  const palm = new THREE.Shape(); palm.absellipse(0, 0, 0.4, 0.48, 0, TAU, false, 0); sh.push(palm);
  const finger = (x: number, y: number, a: number, l: number, w: number) => {
    const s = new THREE.Shape(), c = Math.cos(a), sn = Math.sin(a), dx = -sn, dy = c, px = c * w, py = sn * w;
    s.moveTo(x - px, y - py); s.lineTo(x + px, y + py); s.lineTo(x + px + dx * l, y + py + dy * l);
    s.lineTo(x + dx * (l + w), y + dy * (l + w)); s.lineTo(x - px + dx * l, y - py + dy * l); sh.push(s);
  };
  finger(-0.26, 0.28, 0.25, 0.5, 0.085); finger(-0.09, 0.36, 0.08, 0.64, 0.09); finger(0.09, 0.36, -0.04, 0.68, 0.09);
  finger(0.25, 0.3, -0.2, 0.55, 0.085); finger(0.32, -0.12, -1.05, 0.48, 0.11);
  const geo = new THREE.ShapeGeometry(sh, 4).toNonIndexed(); geo.computeVertexNormals(); return geo;
});
const DISCG = () => g('s2:disc', () => { const geo = new THREE.CircleGeometry(1, 9).toNonIndexed(); geo.computeVertexNormals(); return geo; });
const dc_cuevamanos: Builder = batched((gp) => {
  srand(410);
  const cz = 0.12, Rc = 0.4, a0 = Math.PI + 0.32, a1 = TAU - 0.32, top = 0.25;
  const off = (v: number) => 0.035 * Math.sin(Math.PI * Math.min(1, v * 1.4)) - 0.07 * sstep(0.62, 1, v);
  const wallR = (a: number) => Rc + Math.sin(a * 7) * 0.012 + Math.sin(a * 13 + 1) * 0.007;
  const h: HFn = (x, z) => {
    const a = Math.atan2(z - cz, x), r = Math.hypot(x, z - cz);
    const behind = a < 0 && a > -Math.PI ? sstep(wallR(a + TAU) + 0.065, wallR(a + TAU) + 0.1, r) : 0;
    const river = sstep(0.24, 0.31, z) * (1 - sstep(0.4, 0.46, z));
    return 0.02 + behind * (top - 0.035) - river * 0.025 + (fbm(x * 9, 17, z * 9, 2) - 0.5) * 0.012;
  };
  ground(gp, h, (x, y, z) => {
    if (y > Y0 + top - 0.05) return fbm(x * 18, 18, z * 18, 2) > 0.5 ? '#b8a868' : '#a49a5c';
    if (y < Y0 + 0.004) return '#4a8ab0';
    if (z > 0.2 && z < 0.27) return '#5a8a3a';
    return fbm(x * 20, 19, z * 20, 2) > 0.55 ? '#a89070' : '#b89c78';
  }, (yy) => (yy > Y0 + 0.1 ? '#b0703e' : yy > Y0 * 0.55 ? '#6b5440' : '#4f3d2e'), 24, 72);
  // the curved canyon wall with its sheltering overhang, banded orange and cream
  const NA = 30, NV = 12, qb = new QB();
  const P = (i: number, j: number): V3 => {
    const a = a0 + ((a1 - a0) * i) / NA, v = j / NV, r = wallR(a) + off(v);
    return [Math.cos(a) * r, Y0 + 0.01 + v * (top - 0.005), cz + Math.sin(a) * r];
  };
  for (let i = 0; i < NA; i++) for (let j = 0; j < NV; j++) {
    const v = (j + 0.5) / NV, a = a0 + ((a1 - a0) * (i + 0.5)) / NA, f = fbm(a * 6, v * 5, 20, 2);
    const c = v > 0.85 ? '#d8b88a' : v > 0.62 ? (f > 0.5 ? '#c07a48' : '#b06a3a') : f > 0.6 ? '#d49a6a' : f < 0.38 ? '#b8784c' : '#c88a5a';
    qb.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), c);
    if (j === NV - 1) {
      const p0 = P(i, j + 1), p1 = P(i + 1, j + 1), a2 = a0 + ((a1 - a0) * (i + 1)) / NA, aa = a0 + ((a1 - a0) * i) / NA;
      const b0: V3 = [Math.cos(aa) * (wallR(aa) + 0.12), Y0 + top - 0.022, cz + Math.sin(aa) * (wallR(aa) + 0.12)];
      const b1: V3 = [Math.cos(a2) * (wallR(a2) + 0.12), Y0 + top - 0.022, cz + Math.sin(a2) * (wallR(a2) + 0.12)];
      qb.quad(p0, p1, b1, b0, '#ab9c60');
    }
  }
  qb.build(gp, { rough: 0.95 });
  // hand stencils: a sprayed blotch of pigment with the bare-rock hand shape left in the middle
  const st = new Stamp(), m = new THREE.Matrix4(), rz = new THREE.Matrix4(), eye = new THREE.Vector3(), tgt = new THREE.Vector3(), upv = new THREE.Vector3(0, 1, 0);
  const paints = ['#a8321e', '#8a2414', '#b8401e', '#f0e6d6', '#2a2220', '#d8942a', '#a8321e'];
  for (let k = 0; k < 50; k++) {
    const a = rr(a0 + 0.2, a1 - 0.2), v = rr(0.14, 0.6), r = wallR(a) + off(v) - 0.002;
    const nx = -Math.cos(a), nz = -Math.sin(a), s = rr(0.022, 0.03);
    tgt.set(Math.cos(a) * r, Y0 + 0.01 + v * (top - 0.005), cz + Math.sin(a) * r);
    eye.set(tgt.x + nx, tgt.y, tgt.z + nz);
    m.lookAt(eye, tgt, upv).setPosition(tgt);
    const col = paints[k % paints.length];
    const stencil = k % 2 === 0;
    if (stencil) st.add(DISCG(), m.clone().multiply(rz.makeScale(s * 0.85, s * 1.05, 1)), col);
    m.multiply(rz.makeRotationZ(rr(-0.5, 0.5))).multiply(rz.makeTranslation(0, -0.12 * s, 0.0012)).multiply(rz.makeScale(s * 0.75, s * 0.75, 1));
    st.add(HANDG(), m, !stencil ? col : col === '#f0e6d6' ? '#9a5a32' : '#ecd2ae');
  }
  st.build(gp);
  // boardwalk with railings along the foot of the wall
  const bw: V3[] = [];
  for (let i = 0; i <= 10; i++) { const a = a0 + 0.35 + ((a1 - a0 - 0.7) * i) / 10, r = Rc - 0.09; bw.push([Math.cos(a) * r, 0, cz + Math.sin(a) * r]); }
  for (let i = 0; i < 10; i++) {
    const [ax, , az] = bw[i], [bx, , bz] = bw[i + 1], y = Y0 + 0.03;
    bar(gp, [ax, y, az], [bx, y, bz], 0.012, '#8a6a48', 4);
    bar(gp, [ax, y + 0.03, az], [bx, y + 0.03, bz], 0.0015, '#5a4a3a', 3);
    bar(gp, [ax, y, az], [ax, y + 0.03, az], 0.0015, '#5a4a3a', 3);
  }
  // visitors, a guanaco, and bushes along the river
  person(gp, bw[3][0], Y0 + 0.035, bw[3][2], 0.05, '#d83a3a');
  person(gp, bw[6][0], Y0 + 0.035, bw[6][2], 0.05, '#2b5d9c');
  const gq = grp(gp, -0.16, at(h)(-0.16, 0.16), 0.16, 0.6), gc = '#c48a52';
  ell(gq, gc, 0, 0.05, 0, 0.032, 0.016, 0.015, 0, 7);
  ell(gq, '#f0e6d6', 0, 0.042, 0, 0.026, 0.01, 0.013, 0, 6);
  bar(gq, [0.026, 0.055, 0], [0.036, 0.078, 0], 0.008, gc, 5);
  ell(gq, gc, 0.044, 0.082, 0, 0.012, 0.008, 0.007, 0, 6);
  for (const s of [-1, 1]) bar(gq, [0.04, 0.088, s * 0.003], [0.037, 0.096, s * 0.005], 0.0018, gc, 3);
  for (const [lx, lz] of [[-0.02, -0.008], [-0.02, 0.008], [0.02, -0.008], [0.02, 0.008]]) bar(gq, [lx, 0.045, lz], [lx, 0, lz], 0.003, '#a8784a', 3);
  for (let i = 0; i < 18; i++) {
    const x = rr(-0.42, 0.42), z = rr(0.17, 0.23);
    if (Math.hypot(x, z) > 0.47) continue;
    bush(gp, x, at(h)(x, z) - 0.002, z, rr(0.035, 0.05), rnd() > 0.5 ? '#4a7a32' : '#6a8a3a', false);
  }
});

/** Simple human figure of height s (legs, body, arms, head), facing +x. */
function hiker(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, coat: string, legs = '#3a3a48', pack?: string, arm = 0): void {
  const q = grp(p, x, y, z, ry);
  for (const k of [-1, 1]) bar(q, [0, s * 0.47, k * s * 0.05], [k * s * 0.03, 0, k * s * 0.06], s * 0.045, legs, 4);
  cyl(q, coat, 0, s * 0.45, 0, s * 0.1, s * 0.32, 8);
  ell(q, '#e0b48c', 0, s * 0.86, 0, s * 0.075, s * 0.085, s * 0.075, 0, 7);
  bar(q, [0, s * 0.74, -s * 0.11], [0, s * 0.45, -s * 0.13], s * 0.035, coat, 4);
  bar(q, [0, s * 0.74, s * 0.11], arm ? [s * 0.3, s * 0.8, s * 0.13] : [0, s * 0.45, s * 0.13], s * 0.035, coat, 4);
  if (pack) cube(q, pack, -s * 0.11, s * 0.5, 0, s * 0.09, s * 0.24, s * 0.16);
}

// ───────────────────────────── Plain of Jars (Laos) ─────────────────────────────
const JARG = (v: number) => g('s2:jar' + v, () => {
  const prof: P2[] = v === 2
    ? [[0, 0], [0.42, 0], [0.47, 0.15], [0.47, 0.45], [0.43, 0.42], [0.45, 0.5], [0.4, 0.55], [0.3, 0.5], [0.3, 0.3], [0, 0.3]]
    : [[0, 0], [0.4, 0], [0.46, 0.15], [0.47, 0.6], [0.42, 0.92], [0.4, 1], [0.29, 1], [0.27, 0.9], [0.27, 0.35], [0, 0.35]];
  const geo = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(Math.max(1e-4, r), h)), 11);
  return paintFaces(geo, '#a8a08e', (x, y, z) => {
    const f = fbm(x * 6 + v * 3, y * 6, z * 6, 2);
    return f > 0.62 ? '#8a9668' : f < 0.36 ? '#7c766a' : y > 0.8 && Math.hypot(x, z) < 0.3 ? '#4a463e' : null;
  });
});
const dc_plainofjars: Builder = batched((gp) => {
  srand(411);
  const h: HFn = (x, z) => 0.02 + (fbm(x * 3.5, 21, z * 3.5, 3) - 0.4) * 0.08 + sstep(0.1, 0.5, -z) * 0.03;
  const path = (x: number, z: number) => Math.abs(z - 0.25 - Math.sin(x * 6) * 0.06) < 0.02;
  ground(gp, h, (x, _y, z) => {
    if (path(x, z)) return '#b89a6a';
    const f = fbm(x * 16, 22, z * 16, 2);
    return f > 0.6 ? '#c8ae5a' : f < 0.38 ? '#8aa048' : '#b0a454';
  });
  const gy = at(h);
  const jm = VC({ flat: true, rough: 0.95 });
  const jars: [number, number, number, number, number][] = [
    [0.05, -0.02, 0.13, 0, 0], [-0.1, 0.05, 0.1, 0, 0.08], [0.17, 0.08, 0.09, 0, -0.1], [-0.02, 0.14, 0.075, 0, 0], [0.24, -0.1, 0.11, 0, 0.12],
    [-0.2, -0.08, 0.12, 0, 0], [-0.3, 0.1, 0.07, 2, 0], [0.33, 0.12, 0.08, 0, 0], [-0.08, -0.2, 0.09, 0, -0.18], [0.12, -0.24, 0.085, 2, 0],
    [-0.26, -0.26, 0.08, 0, 0.1], [0.3, -0.28, 0.07, 0, 0], [-0.38, -0.08, 0.06, 0, 0],
  ];
  for (const [x, z, s, v, tilt] of jars) {
    const y = gy(x, z) - 0.006;
    add(gp, JARG(v), jm, x, y, z, s * 0.95, s * (v === 2 ? 1.05 : 1.15), s * 0.95, rnd() * TAU, tilt * 0.6, tilt);
  }
  // one toppled jar and its round stone lid
  add(gp, JARG(1), jm, 0.2, gy(0.2, 0.22) + 0.045, 0.22, 0.08, 0.1, 0.08, 0.4, 0, Math.PI / 2 - 0.08);
  add(gp, CYLG(10), mat('#9a9282'), 0.0, gy(0.0, 0.3) + 0.004, 0.3, 0.035, 0.012, 0.035, 0, 0.1, 0.05);
  // big shady tree on the left, small trees on the far hills
  const tx = -0.37, tz = 0.06, ty = gy(tx, tz) - 0.004;
  sweep(gp, [{ p: [tx, ty, tz], w: 0.022 }, { p: [tx + 0.01, ty + 0.12, tz], w: 0.016 }, { p: [tx + 0.04, ty + 0.22, tz - 0.01], w: 0.011 }], '#6a4a32', { radial: 7, sub: 3 });
  bar(gp, [tx + 0.01, ty + 0.13, tz], [tx - 0.08, ty + 0.21, tz + 0.03], 0.008, '#6a4a32', 4);
  for (const [dx, dy, dz, r] of [[0.04, 0.25, -0.01, 0.1], [-0.07, 0.22, 0.03, 0.08], [0.12, 0.22, 0.0, 0.07], [0.0, 0.29, 0.02, 0.07], [-0.03, 0.23, -0.06, 0.07]]) {
    ell(gp, dx > 0.05 ? '#4a7a32' : '#3e6c2c', tx + dx * 0.8, ty + dy, tz + dz, r * 0.85, r * 0.5, r * 0.75, rnd() * 3, 7, false);
  }
  for (const [x, z] of [[0.38, -0.2], [0.25, -0.38], [-0.12, -0.42], [-0.3, -0.33]] as P2[]) bush(gp, x, gy(x, z) - 0.003, z, 0.08, '#4a7a32');
  hiker(gp, 0.08, gy(0.08, 0.28), 0.28, 2.6, 0.075, '#d84a3a', '#3a3a48', '#2a6a9a', 1);
  hiker(gp, -0.04, gy(-0.04, 0.32), 0.32, 2.2, 0.06, '#f2c230', '#3a4a6a');
});

// ───────────────────────────── Ötzi the Iceman (Ötztal Alps, found 1991) ─────────────────────────────
const dc_otzi: Builder = batched((gp) => {
  srand(412);
  const h: HFn = (x, z) => {
    const back = sstep(-0.02, -0.4, z), peaks = (fbm(x * 3, 23, z * 3, 2) - 0.35) * 0.35;
    const hollow = Math.max(0, 1 - Math.hypot((x + 0.02) / 0.22, (z - 0.1) / 0.16)) * 0.04;
    return 0.05 + back * Math.max(0.04, 0.16 + peaks) + (fbm(x * 10, 24, z * 10, 2) - 0.5) * 0.018 - hollow;
  };
  const ice = (x: number, z: number) => Math.hypot((x + 0.1) / 0.13, (z - 0.15) / 0.09) < 1;
  ground(gp, h, (x, y, z, _nx, ny) => {
    if (ice(x, z)) return '#bfe2ee';
    if (y > Y0 + 0.19 && ny > 0.6) return '#f4f7fa';
    if (ny > 0.92 && fbm(x * 14, 25, z * 14, 2) > 0.6) return '#eef2f6';
    if (ny > 0.9 && y < Y0 + 0.08) return fbm(x * 20, 33, z * 20, 2) > 0.5 ? '#7a8a5a' : '#8a8a6a';
    const f = fbm(x * 18, 26, z * 18, 2);
    return f > 0.6 ? '#6e6a66' : f < 0.4 ? '#9a948c' : '#85807a';
  }, (yy) => (yy > Y0 * 0.55 ? '#6e6a66' : '#4f4a46'));
  const gy = at(h);
  // the flat rock where he lay, half in the melting ice
  const rx = 0.04, rz = 0.12, ry0 = gy(rx, rz);
  rock(gp, rx, ry0 + 0.004, rz, 0.24, 0.035, 0.14, (_x, y) => (y > 0.3 ? '#a49e94' : null), '#8a847a', 5, 0.15);
  const top = ry0 + 0.02;
  const O = grp(gp, rx, top, rz, 0.15);
  const skin = '#8a5a30';
  sweep(O, [{ p: [-0.04, 0.012, 0], w: 0.022, h: 0.011 }, { p: [0.0, 0.013, 0], w: 0.024, h: 0.012 }, { p: [0.045, 0.013, 0], w: 0.026, h: 0.012 }, { p: [0.06, 0.012, 0], w: 0.014, h: 0.01 }], skin,
    { radial: 9, sub: 3, paint: (x, _y, z) => (Math.abs(z) < 0.01 && x < 0.03 && fbm(x * 90, 1, z * 90, 2) > 0.62 ? '#4a3420' : null) });
  ell(O, skin, 0.078, 0.014, 0.004, 0.016, 0.012, 0.014, 0.2, 8);
  ell(O, '#3a2a1a', 0.082, 0.02, 0.004, 0.012, 0.006, 0.012, 0.2, 6);
  for (const s of [-1, 1]) sweep(O, [{ p: [-0.04, 0.01, s * 0.01], w: 0.009 }, { p: [-0.09, 0.008, s * 0.016], w: 0.007 }, { p: [-0.135, 0.008, s * 0.018], w: 0.005 }], skin, { radial: 6, sub: 2 });
  sweep(O, [{ p: [0.045, 0.012, 0.022], w: 0.006 }, { p: [0.07, 0.008, 0.045], w: 0.005 }, { p: [0.1, 0.006, 0.05], w: 0.004 }], skin, { radial: 6, sub: 2 });
  sweep(O, [{ p: [0.045, 0.012, -0.022], w: 0.006 }, { p: [0.06, 0.006, -0.03], w: 0.005 }, { p: [0.08, 0.005, -0.012], w: 0.004 }], skin, { radial: 6, sub: 2 });
  // his things: copper axe, longbow, fur quiver and the wooden backpack frame
  const ax = grp(gp, -0.12, gy(-0.12, 0.27) + 0.005, 0.27, 0.6);
  bar(ax, [-0.03, 0, 0], [0.03, 0, 0], 0.003, '#7a5530', 4);
  cube(ax, '#c87a3a', 0.03, -0.004, 0, 0.004, 0.008, 0.012);
  const bw = gy(0.16, -0.0);
  bar(gp, [0.17, bw, 0.0], [0.2, bw + 0.17, -0.03], 0.0028, '#8a6a3a', 4);
  cyl(gp, '#6a4a2a', 0.21, bw, 0.04, 0.009, 0.07, 7);
  for (let i = 0; i < 3; i++) bar(gp, [0.21 + (i - 1) * 0.003, bw + 0.07, 0.04], [0.21 + (i - 1) * 0.004, bw + 0.09, 0.04], 0.0012, '#c8b088', 3);
  const fr = grp(gp, -0.17, gy(-0.17, 0.06), 0.06, 0.3, 0.2);
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI, a1 = ((i + 1) / 6) * Math.PI;
    bar(fr, [Math.cos(a0) * 0.022, 0.06 + Math.sin(a0) * 0.022, 0], [Math.cos(a1) * 0.022, 0.06 + Math.sin(a1) * 0.022, 0], 0.0025, '#7a5530', 3);
  }
  for (const s of [-1, 1]) bar(fr, [s * 0.022, 0.06, 0], [s * 0.022, 0, 0], 0.0025, '#7a5530', 3);
  for (const yb of [0.015, 0.04]) cube(fr, '#8a6a3a', 0, yb, 0, 0.05, 0.005, 0.004);
  // the two hikers who found him, and the stone pyramid that marks the spot
  hiker(gp, 0.22, gy(0.22, 0.24), 0.24, 2.7, 0.15, '#d83a3a', '#2a2a3a', '#2a5a9a', 1);
  hiker(gp, 0.3, gy(0.3, 0.16), 0.16, 2.9, 0.14, '#2b6ab0', '#3a3a3a', '#e0a020');
  const px = -0.26, pz = -0.16, py = gy(px, pz) - 0.01;
  plathe(gp, fine([[0.08, 0], [0, 0.17]], 0.016), '#a8a49c', (_x, y) => (Math.floor(y / 0.0155) % 2 ? '#8e8a82' : null), px, py, pz, 4);
  // patches of old snow
  for (let i = 0; i < 6; i++) {
    const x = rr(-0.4, 0.4), z = rr(-0.1, 0.3);
    if (Math.hypot(x - rx, z - rz) < 0.18 || x * x + z * z > 0.18) continue;
    add(gp, SPH(8), mat('#f4f7fa', { flat: false }), x, gy(x, z) - 0.002, z, rr(0.03, 0.05), 0.008, rr(0.02, 0.04), rnd() * 3);
  }
});

// ───────────────────────────── Lyuba the baby mammoth (Yamal, found 2007) ─────────────────────────────
function reindeer(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number): void {
  const q = grp(p, x, y, z, ry), c = '#7a6a5a';
  ell(q, c, 0, s * 0.62, 0, s * 0.36, s * 0.17, s * 0.14, 0, 7);
  ell(q, '#e8e0d0', s * 0.28, s * 0.66, 0, s * 0.12, s * 0.12, s * 0.11, 0, 6);
  bar(q, [s * 0.3, s * 0.7, 0], [s * 0.42, s * 0.9, 0], s * 0.06, '#e8e0d0', 4);
  ell(q, c, s * 0.48, s * 0.92, 0, s * 0.11, s * 0.06, s * 0.06, 0, 6);
  for (const k of [-1, 1]) {
    const b: V3 = [s * 0.4, s * 0.98, k * s * 0.04], t: V3 = [s * 0.3, s * 1.3, k * s * 0.14];
    bar(q, b, t, s * 0.014, '#c8b89a', 3);
    bar(q, [s * 0.34, s * 1.14, k * s * 0.09], [s * 0.46, s * 1.24, k * s * 0.1], s * 0.01, '#c8b89a', 3);
    bar(q, t, [s * 0.18, s * 1.36, k * s * 0.16], s * 0.01, '#c8b89a', 3);
  }
  for (const [lx, lz] of [[-0.24, -0.07], [-0.24, 0.07], [0.22, -0.07], [0.22, 0.07]]) bar(q, [lx * s, s * 0.55, lz * s], [lx * s, 0, lz * s], s * 0.035, '#5a4a3a', 3);
}
const dc_lyuba: Builder = batched((gp) => {
  srand(413);
  const riv = (x: number, z: number) => z - (0.18 + x * 0.25 + Math.sin(x * 5) * 0.03);
  const h: HFn = (x, z) => {
    const r = riv(x, z), bank = sstep(-0.2, -0.36, z + x * 0.2);
    return 0.03 - sstep(0.0, 0.06, r) * 0.04 + bank * 0.1 + (fbm(x * 9, 27, z * 9, 2) - 0.5) * 0.012 * (1 - sstep(-0.05, 0.05, r));
  };
  ground(gp, h, (x, y, z, _nx, ny) => {
    const r = riv(x, z);
    if (r > 0.045) return Math.sin(x * 50 + z * 20) > 0.9 ? '#8aa8b8' : '#5a7a8a';
    if (r > -0.06) return '#b8a68a';
    if (ny < 0.75) { const b = Math.floor((y - Y0) / 0.014) % 3; return b === 0 ? '#4a3a2e' : b === 1 ? '#6a5442' : fbm(x * 30, y * 30, 28, 2) > 0.6 ? '#e8eef2' : '#3a3028'; }
    const f = fbm(x * 18, 29, z * 18, 2);
    if (f > 0.74) return '#eef2f4';
    return f > 0.56 ? '#a8a070' : f < 0.36 ? '#8a5a3a' : '#7a8048';
  });
  const gy = at(h);
  // Lyuba: a one-month-old woolly mammoth calf, standing on the sandbank where she was found
  const L = grp(gp, 0.06, gy(0.06, 0.1) - 0.004, 0.1, -0.55), fur = '#7a5030';
  L.scale.setScalar(1.25);
  const hair: Paint = (x, y, z) => (fbm(x * 70, y * 70, z * 70, 2) > 0.6 ? '#5a3820' : y < 0.06 ? '#6a4428' : null);
  sweep(L, [{ p: [-0.065, 0.068, 0], w: 0.028, h: 0.03 }, { p: [-0.02, 0.074, 0], w: 0.036, h: 0.038 }, { p: [0.03, 0.084, 0], w: 0.036, h: 0.044 }, { p: [0.058, 0.092, 0], w: 0.028, h: 0.036 }], fur, { radial: 10, sub: 3, paint: hair });
  ell(L, fur, 0.082, 0.108, 0, 0.03, 0.034, 0.027, 0, 9);
  ell(L, '#6a4428', 0.074, 0.134, 0, 0.018, 0.014, 0.016, 0, 7);
  ell(L, '#5a3820', -0.01, 0.05, 0, 0.06, 0.016, 0.03, 0, 8);
  for (const k of [-1, 1]) ell(L, '#5a3820', 0.075, 0.115, k * 0.03, 0.012, 0.016, 0.004, 0, 6);
  for (const k of [-1, 1]) ell(L, '#1a1410', 0.107, 0.115, k * 0.016, 0.0035, 0.0035, 0.0035, 0, 5);
  sweep(L, [{ p: [0.11, 0.1, 0], w: 0.013 }, { p: [0.13, 0.07, 0], w: 0.01 }, { p: [0.135, 0.035, 0], w: 0.008 }, { p: [0.125, 0.02, 0], w: 0.006 }, { p: [0.115, 0.026, 0], w: 0.005 }], fur, { radial: 7, sub: 3, paint: hair });
  for (const [lx, lz] of [[-0.055, -0.018], [-0.055, 0.018], [0.04, -0.02], [0.04, 0.02]]) {
    sweep(L, [{ p: [lx, 0.07, lz], w: 0.014 }, { p: [lx + 0.002, 0.03, lz], w: 0.012 }, { p: [lx, 0.0, lz], w: 0.012 }], fur, { radial: 7, sub: 2, paint: hair });
  }
  bar(L, [-0.1, 0.085, 0], [-0.115, 0.06, 0], 0.004, '#5a3820', 3);
  // the reindeer herder's family: tent (chum), sled and reindeer
  const cx = -0.24, cz = -0.06, cyy = gy(cx, cz) - 0.004;
  plathe(gp, fine([[0.11, 0], [0.02, 0.24], [0, 0.245]], 0.03), '#8a7a66', (x, y, z) => {
    const a = Math.atan2(z, x);
    if (Math.abs(a - 0.6) < 0.18 && y < 0.07) return '#3a2e24';
    return Math.floor(y / 0.03) % 2 ? '#a8987e' : Math.floor(a * 3) % 2 ? '#7a6a56' : null;
  }, cx, cyy, cz, 10);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    bar(gp, [cx + Math.cos(a) * 0.012, cyy + 0.22, cz + Math.sin(a) * 0.012], [cx + Math.cos(a) * 0.035, cyy + 0.32, cz + Math.sin(a) * 0.035], 0.003, '#6a4a32', 3);
  }
  const sl = grp(gp, -0.08, gy(-0.08, -0.16), -0.16, 0.4);
  for (const k of [-1, 1]) bar(sl, [-0.07, 0.004, k * 0.025], [0.08, 0.004, k * 0.025], 0.003, '#8a6a42', 3);
  cube(sl, '#a07a4a', 0, 0.016, 0, 0.12, 0.004, 0.055);
  for (const k of [-1, 1]) for (const xx of [-0.05, 0.0, 0.05]) bar(sl, [xx, 0.004, k * 0.025], [xx, 0.016, k * 0.025], 0.0025, '#8a6a42', 3);
  reindeer(gp, -0.3, gy(-0.3, 0.12), 0.12, 0.6, 0.11);
  reindeer(gp, -0.16, gy(-0.16, -0.24), -0.24, -0.3, 0.1);
  hiker(gp, -0.1, gy(-0.1, 0.0), 0.0, -0.4, 0.17, '#a83a2a', '#3a3030', undefined, 1);
  hiker(gp, -0.14, gy(-0.14, 0.07), 0.07, -0.3, 0.11, '#2a5a9a', '#3a3030');
  // dwarf willows on the tundra
  for (let i = 0; i < 14; i++) {
    const x = rr(-0.45, 0.45), z = rr(-0.45, 0.1);
    if (x * x + z * z > 0.2 || riv(x, z) > -0.08 || Math.hypot(x - cx, z - cz) < 0.14) continue;
    ell(gp, rnd() > 0.5 ? '#6a7a3a' : '#8a6a3a', x, gy(x, z), z, rr(0.012, 0.022), rr(0.008, 0.012), rr(0.012, 0.022), 0, 5, false);
  }
});

// ───────────────────────────── Qumran caves, Dead Sea Scrolls (found 1947) ─────────────────────────────
function goat(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, c: string): void {
  const q = grp(p, x, y, z, ry);
  ell(q, c, 0, s * 0.6, 0, s * 0.32, s * 0.16, s * 0.13, 0, 7);
  bar(q, [s * 0.26, s * 0.65, 0], [s * 0.36, s * 0.85, 0], s * 0.06, c, 4);
  ell(q, c, s * 0.42, s * 0.86, 0, s * 0.12, s * 0.07, s * 0.06, 0, 6);
  for (const k of [-1, 1]) bar(q, [s * 0.38, s * 0.92, k * s * 0.03], [s * 0.3, s * 1.04, k * s * 0.05], s * 0.015, '#3a3028', 3);
  for (const [lx, lz] of [[-0.2, -0.06], [-0.2, 0.06], [0.2, -0.06], [0.2, 0.06]]) bar(q, [lx * s, s * 0.55, lz * s], [lx * s, 0, lz * s], s * 0.03, shade(c, 0.8), 3);
}
const dc_qumran: Builder = batched((gp) => {
  srand(414);
  const spur = (x: number, z: number) => sstep(1, 0.55, Math.hypot((x - 0.02) / 0.2, (z + 0.02) / 0.13 - Math.max(0, -z) * 2));
  const h: HFn = (x, z) => {
    const cliffs = sstep(-0.12, -0.4, z) * (0.24 + (fbm(x * 5, 30, z * 5, 2) - 0.5) * 0.1);
    let y = 0.02 + cliffs + spur(x, z) * 0.15 + (fbm(x * 8, 31, z * 8, 2) - 0.5) * 0.015;
    if (y > 0.05) y += Math.sin(y * 180) * 0.004;
    return y - sstep(0.3, 0.38, x) * 0.03;
  };
  ground(gp, h, (x, y, z, _nx, ny) => {
    if (x > 0.36) return y < Y0 + 0.0 ? '#3a8ab0' : '#f0eee6';
    if (y < Y0 + 0.035) return fbm(x * 20, 32, z * 20, 2) > 0.6 ? '#c8b494' : '#d4c2a2';
    const band = Math.floor((y - Y0) / 0.012) % 3;
    if (ny > 0.85) return '#dccaa4';
    return band === 0 ? '#c8ac80' : band === 1 ? '#dcc49a' : '#b8986c';
  }, undefined, 26, 72);
  const gy = at(h);
  // dark cave mouths: two on the rounded marl spur ("Cave 4"), more in the cliffs behind
  const st = new Stamp(), m = new THREE.Matrix4(), sc = new THREE.Matrix4(), eye = new THREE.Vector3(), tgt = new THREE.Vector3(), upv = new THREE.Vector3(0, 1, 0);
  const caves: [number, number, number][] = [[-0.03, 0.065, 0.026], [0.06, 0.07, 0.02], [0.11, 0.02, 0.014], [-0.25, -0.2, 0.018], [-0.1, -0.24, 0.015], [0.2, -0.22, 0.017], [0.32, -0.12, 0.013], [-0.36, -0.08, 0.014]];
  for (const [x, z, s] of caves) {
    const e = 0.004, dx = (h(x + e, z) - h(x - e, z)) / (2 * e), dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
    eye.set(-dx, 1, -dz).normalize();
    tgt.set(x, gy(x, z) + 0.001, z);
    m.lookAt(eye.clone().add(tgt), tgt, upv).setPosition(tgt);
    st.add(DISCG(), m.multiply(sc.makeScale(s, s * 0.8, 1)), '#1e1612');
  }
  st.build(gp);
  // a tall clay scroll jar with its bowl lid, and an unrolled scroll on a rock
  const jx = 0.16, jz = 0.24, jy = gy(jx, jz) - 0.003;
  plathe(gp, [[0, 0], [0.024, 0], [0.032, 0.02], [0.034, 0.07], [0.028, 0.095], [0.02, 0.1], [0.02, 0.106], [0, 0.106]], '#d8bc94', (_x, y) => (y > 0.03 && y < 0.034 ? '#b8946a' : null), jx, jy, jz, 12);
  plathe(gp, [[0, 0.104], [0.026, 0.106], [0.024, 0.118], [0, 0.124]], '#c8a880', undefined, jx, jy, jz, 12);
  add(gp, CYLG(10), mat('#d8bc94'), jx + 0.05, jy + 0.012, jz + 0.02, 0.015, 0.03, 0.015, 0.3, 0, Math.PI / 2 - 0.2);
  const sr = grp(gp, 0.02, gy(0.02, 0.3) + 0.004, 0.3, -0.2);
  rock(sr, 0, 0.0, 0, 0.12, 0.03, 0.07, () => null, '#b89c74', 7);
  const sh = grp(sr, 0, 0.017, 0);
  cube(sh, '#efe2c2', 0, 0, 0, 0.07, 0.002, 0.04);
  for (let i = 0; i < 6; i++) cube(sh, '#5a4a3a', 0, 0.002, -0.014 + i * 0.006, 0.05, 0.0006, 0.0018);
  for (const s of [-1, 1]) add(sh, CYLG(8), mat('#e2d2ae'), s * 0.038, 0.006, 0, 0.007, 0.044, 0.007, 0, Math.PI / 2, 0);
  // the young shepherd with his crook, and his goats
  hiker(gp, -0.14, gy(-0.14, 0.2), 0.2, -0.5, 0.13, '#e8e0cc', '#8a6a4a', undefined, 1);
  bar(gp, [-0.12, gy(-0.12, 0.23), 0.23], [-0.12, gy(-0.12, 0.23) + 0.16, 0.23], 0.003, '#6a4a2a', 4);
  goat(gp, -0.25, gy(-0.25, 0.26), 0.26, 0.4, 0.07, '#2a2420');
  goat(gp, -0.3, gy(-0.3, 0.14), 0.14, -0.6, 0.065, '#8a6a4a');
  goat(gp, 0.22, gy(0.22, 0.05), 0.05, 2.2, 0.06, '#f0e8d8');
  for (let i = 0; i < 8; i++) {
    const x = rr(-0.42, 0.3), z = rr(0.05, 0.42);
    if (x * x + z * z > 0.2) continue;
    ell(gp, '#8a8a5a', x, gy(x, z), z, 0.01, 0.007, 0.01, 0, 5, false);
  }
});

export const H_SCIENCE2: Record<string, Builder> = {
  sx_arecibo, sx_kourou, sx_parkes, sx_salt, sx_thumba, sx_jantar, sx_hoba, sx_paranal,
  dc_richat, dc_cuevamanos, dc_plainofjars, dc_otzi, dc_lyuba, dc_qumran,
};
