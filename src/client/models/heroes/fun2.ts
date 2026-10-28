import { human } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type Paint, type V3, add, g, mat, box, cyl, cone, gable, lathe, prism, shade, mix, hash3, fbm, SPH, paintFaces, tbox } from '../prims.ts';
import { island, ripple, sstep } from '../nature.ts';
import { grp, type Q, type Plan, supPlan, type StandOpts, turf, mow, SK, HR, fan } from '../kit/sport.ts';

// Fun pack 2: ten sports places and ten festivals as compact dioramas (base radius ≈0.5, front +z, base at y=0).
// Mobile budget: ≤15k triangles each. People, animals and props are built from a handful of shared low-poly
// pieces (open 5-sided limbs, 8×6 blobs, boxes); crowds are painted quads merged into one mesh.

const TAU = Math.PI * 2;

// ---- shared helpers -------------------------------------------------------------------------------------

const BL = () => g('f2-bl', () => new THREE.SphereGeometry(1, 7, 5));
const LIMB = () => g('f2-limb', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true));
const BOXG = () => g('box', () => new THREE.BoxGeometry(1, 1, 1));
/** Smooth low-poly ellipsoid (7×5). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, rotx = 0, rotz = 0) =>
  add(p, BL(), mat(c, { flat: false }), x, y, z, rx, ry, rz, roty, rotx, rotz);
/** Tiny ball (heads, balls, lights). */
const dot = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, seg = 6) =>
  add(p, SPH(seg), mat(c), x, y, z, r * 2, r * 2, r * 2);
const glow = (m: THREE.Mesh, c: string, e = c) => { m.material = mat(c, { emissive: e }); return m; };
const _u = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** Open 5-sided cylinder between two points (limbs, poles, ropes, masts) — 10 triangles. */
function limb(p: THREE.Object3D, a: V3, b: V3, r: number, c: string, geo = LIMB()): THREE.Mesh {
  _a.set(...a); _b.set(...b).sub(_a);
  const len = _b.length() || 1e-4;
  const m = new THREE.Mesh(geo, mat(c));
  m.scale.set(r * 2, len, r * 2);
  m.position.copy(_a).addScaledVector(_b, 0.5);
  m.quaternion.setFromUnitVectors(_u, _b.normalize());
  m.castShadow = true;
  p.add(m);
  return m;
}
/** Closed 6-sided rod (visible ends). */
const ROD6 = () => g('f2-rod6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
const pole = (p: THREE.Object3D, a: V3, b: V3, r: number, c: string) => limb(p, a, b, r, c, ROD6());
/** Thin flat line on the ground from (x0,z0) to (x1,z1). */
function line(p: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, w = 0.004, c = '#f8fafc', h = 0.0016): THREE.Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0);
  return add(p, BOXG(), mat(c), (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, len, h, w, -Math.atan2(z1 - z0, x1 - x0));
}
/** Flat ring line (centre circles, face-off circles). */
function ringLine(p: THREE.Object3D, x: number, y: number, z: number, r: number, w: number, c = '#f8fafc', seg = 24, tube = 3): THREE.Mesh {
  const geo = g(`f2-tor:${seg}:${tube}:${(w / r).toFixed(3)}`, () => new THREE.TorusGeometry(1, w / r, tube, seg));
  return add(p, geo, mat(c), x, y, z, r, r, r * 0.4, 0, -Math.PI / 2);
}
/** Flat disc (pool, circle, rug) lying on y. */
function disc(p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, h = 0.003, seg = 16): THREE.Mesh {
  return add(p, g('f2-disc' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg)), mat(c), x, y + h / 2, z, r, h, r);
}

/** Accumulates painted quads into one vertex-coloured mesh; each quad is turned to face `want`. */
class Quads {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  quad(a: Q, b: Q, cc: Q, d: Q, color: string, want: Q): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
    const tri = flip ? [a, cc, b, a, d, cc] : [a, b, cc, a, cc, d];
    this.c.set(color);
    for (const v of tri) { this.pos.push(v[0], v[1], v[2]); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  /** Box made of quads (5 faces, no bottom), turned by ry about its centre. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, ry = 0, top?: string): void {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (u: number, v: number, w: number): Q => [x + u * cs + w * sn, v, z - u * sn + w * cs];
    const D = (u: number, w: number): Q => [u * cs + w * sn, 0, -u * sn + w * cs];
    const a = sx / 2, b = sz / 2, y1 = y + sy;
    this.quad(P(-a, y1, -b), P(a, y1, -b), P(a, y1, b), P(-a, y1, b), top ?? c, [0, 1, 0]);
    this.quad(P(-a, y, b), P(a, y, b), P(a, y1, b), P(-a, y1, b), c, D(0, 1));
    this.quad(P(-a, y, -b), P(a, y, -b), P(a, y1, -b), P(-a, y1, -b), shade(c, 0.9), D(0, -1));
    this.quad(P(a, y, -b), P(a, y, b), P(a, y1, b), P(a, y1, -b), shade(c, 0.95), D(1, 0));
    this.quad(P(-a, y, -b), P(-a, y, b), P(-a, y1, b), P(-a, y1, -b), shade(c, 0.95), D(-1, 0));
  }
  mesh(p: THREE.Object3D, opts: { rough?: number; emissive?: string } = {}): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return add(p, geo, mat('#ffffff', { vc: true, flat: true, rough: opts.rough, emissive: opts.emissive }), 0, 0, 0, 1, 1, 1);
  }
}

/** Stepped grandstand following a plan curve: crowd-painted treads, risers, front wall, back facade. */
function stands(p: THREE.Object3D, plan: Plan, o: StandOpts): void {
  const t0 = o.t0 ?? 0, t1 = o.t1 ?? 1, q = new Quads(), full = t1 - t0 >= 0.999;
  const riser = o.riser ?? '#9ca3af', wall = o.wall ?? '#e5e7eb', bh = o.backH ?? 0.01;
  const P = (t: number, off: number, y: number): Q => { const [x, z] = plan(t, off); return [x, y, z]; };
  const top = o.y0 + o.rows * o.dh, offE = o.off0 + o.rows * o.dr;
  for (let i = 0; i < o.n; i++) {
    const ta = t0 + ((t1 - t0) * i) / o.n, tb = t0 + ((t1 - t0) * (i + 1)) / o.n, tm = (ta + tb) / 2;
    const [cx, cz] = plan(tm, 0), [ox, oz] = plan(tm, 1);
    const out: Q = [ox - cx, 0, oz - cz], inn: Q = [cx - ox, 0, cz - oz];
    q.quad(P(ta, o.off0, 0), P(tb, o.off0, 0), P(tb, o.off0, o.y0), P(ta, o.off0, o.y0), wall, inn);
    for (let k = 0; k < o.rows; k++) {
      const r0 = o.off0 + k * o.dr, r1 = r0 + o.dr, y = o.y0 + k * o.dh;
      q.quad(P(ta, r0, y), P(tb, r0, y), P(tb, r0, y + o.dh), P(ta, r0, y + o.dh), shade(riser, 0.9 + (k % 2) * 0.1), inn);
      q.quad(P(ta, r0, y + o.dh), P(tb, r0, y + o.dh), P(tb, r1, y + o.dh), P(ta, r1, y + o.dh), o.seat(tm, k, i), [0, 1, 0]);
    }
    q.quad(P(ta, offE, top), P(tb, offE, top), P(tb, offE, top + bh), P(ta, offE, top + bh), wall, inn);
    q.quad(P(ta, offE, top + bh), P(tb, offE, top + bh), P(tb, offE + 0.006, top + bh), P(ta, offE + 0.006, top + bh), shade(wall, 0.92), [0, 1, 0]);
    for (let k = 0; k < 2; k++) {
      const ya = ((top + bh) * k) / 2, yb = ((top + bh) * (k + 1)) / 2;
      q.quad(P(ta, offE + 0.006, ya), P(tb, offE + 0.006, ya), P(tb, offE + 0.006, yb), P(ta, offE + 0.006, yb), o.back ? o.back(tm, (ya + yb) / 2) : wall, out);
    }
  }
  if (!full) {
    for (const [t, sgn] of [[t0, -1], [t1, 1]] as const) {
      const [ax, az] = plan(t, 0), [bx, bz] = plan(t + sgn * 0.001, 0);
      const want: Q = [bx - ax, 0, bz - az];
      for (let k = 0; k < o.rows; k++) {
        const r0 = o.off0 + k * o.dr;
        q.quad(P(t, r0, 0), P(t, r0 + o.dr, 0), P(t, r0 + o.dr, o.y0 + (k + 1) * o.dh), P(t, r0, o.y0 + (k + 1) * o.dh), wall, want);
      }
      q.quad(P(t, offE, 0), P(t, offE + 0.006, 0), P(t, offE + 0.006, top + bh), P(t, offE, top + bh), wall, want);
    }
  }
  q.mesh(p);
}
/** Crowd seat painter: mostly team colours, some skin dots, a few empty seats. */
const crowd = (pal: string[], empty = '#94a3b8', fill = 0.9, seed = 1) => (_t: number, row: number, i: number) => {
  const h = hash3(i * 1.7, row * 3.1, seed);
  if (h > fill) return empty;
  const k = hash3(i * 5.3, row * 0.7, seed + 7);
  return k < 0.22 ? SK[Math.floor(k * 22) % 5] : shade(pal[Math.floor(k * 97) % pal.length], 0.88 + h * 0.2);
};
/** Round base (lawn / sand / plaza / water) with an earth skirt; modest resolution for phones. */
function base(gp: THREE.Object3D, R: number, top: string, paint: Paint, h = 0.03, hf: (x: number, z: number) => number = () => 0, rings = 10, segs = 48, side = '#6b5644'): void {
  island(gp, R, hf, top, paint, { rings, segs, base: h, side: (y) => (y > h * 0.55 ? side : shade(side, 0.78)) });
}

// ---- people & animals -----------------------------------------------------------------------------------
interface Pose {
  c: string; b?: string; legs?: string; skin?: string; hair?: string; shoes?: string; sleeve?: string;
  /** foot & hand targets in unit-height figure space ([left, right]) */
  feet?: [V3, V3]; hands?: [V3, V3];
  lean?: number; bulk?: number;
  /** long skirt / robe instead of trousers */
  skirt?: string;
  hat?: (f: THREE.Group) => void;
  noHair?: boolean;
}
/** Little person, h tall (feet at y): two-segment limbs to foot/hand targets, blob torso, ball head. ~400 tris. */
function fig(p: THREE.Object3D, x: number, y: number, z: number, ry: number, h: number, o: Pose): THREE.Group {
  const f = grp(p, x, y, z, ry, h);
  const sk = o.skin ?? SK[Math.floor(hash3(x * 31, z * 17, 3) * 4)], hr = o.hair ?? HR[Math.floor(hash3(x * 13, z * 7, 5) * 5)];
  // targets are given with soles at y = 0; the rig wants ankles
  const feet = o.feet ? (o.feet.map(([fx, fy, fz]) => [fx, fy + 0.032, fz]) as [V3, V3]) : undefined;
  const rig = human(f, 0, 0, 0, {
    h: 1, detail: h > 0.06 ? 'hi' : 'lo', top: o.c, skin: sk, shoes: o.shoes ?? '#27272a', build: o.bulk,
    feet, hands: o.hands, hipY: feet ? 0.46 : undefined, lean: (o.lean ?? 0) * 0.6, sleeve: 0.4,
    bottom: o.legs ?? o.b ?? '#1f2937', hair: o.noHair ? null : hr, dress: o.skirt ? 'ankle' : undefined,
  });
  if (o.hat) {
    // hats were authored for a head at (0, 0.9, 0) of radius ≈0.11: map that frame onto the rig's head
    const k = 0.6, hf = new THREE.Group();
    hf.position.set(rig.head[0], rig.head[1] - 0.9 * k, rig.head[2]);
    hf.scale.setScalar(k);
    f.add(hf);
    o.hat(hf);
  }
  return f;
}
const RUN = (ph = 0): Pick<Pose, 'feet' | 'hands' | 'lean'> => {
  const s = ph ? -1 : 1;
  return { feet: [[-0.06, 0.06, 0.28 * s], [0.06, 0.14, -0.3 * s]], hands: [[-0.2, 0.55, -0.2 * s], [0.2, 0.58, 0.22 * s]], lean: 0.35 };
};
const CHEER: Pick<Pose, 'hands'> = { hands: [[-0.26, 1.12, 0.02], [0.26, 1.12, 0.02]] };
interface Beast { body: string; mane?: string; hump?: boolean; neckUp?: number; gait?: number; long?: number }
/** Quadruped (horse/pony/camel), length ≈ s, facing +z of its group. */
function beast(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, o: Beast): THREE.Group {
  const f = grp(p, x, y, z, ry, s), c = o.body, d = shade(c, 0.8), ga = o.gait ?? 0.5;
  const camel = !!o.hump, legH = camel ? 0.62 : 0.5, bodyY = legH + 0.1;
  blob(f, c, 0, bodyY, 0, 0.17, 0.15, 0.36);
  if (camel) blob(f, shade(c, 1.05), 0, bodyY + 0.14, -0.02, 0.13, 0.15, 0.18);
  const nb: V3 = [0, bodyY + 0.06, 0.3];
  const nh: V3 = camel ? [0, bodyY + 0.36, 0.55] : [0, bodyY + 0.34 * (o.neckUp ?? 1), 0.46];
  if (camel) {
    limb(f, nb, [0, bodyY + 0.05, 0.5], 0.13, c);
    limb(f, [0, bodyY + 0.05, 0.5], nh, 0.1, c);
  } else limb(f, nb, nh, 0.16, c);
  blob(f, c, nh[0], nh[1] + 0.02, nh[2] + 0.08, 0.065, 0.07, 0.15, 0, camel ? 0.1 : 0.55);
  blob(f, d, nh[0], nh[1] + (camel ? 0.01 : -0.05), nh[2] + (camel ? 0.2 : 0.17), 0.05, 0.05, 0.06);
  for (const sx of [-1, 1]) add(f, BOXG(), mat(d), sx * 0.04, nh[1] + 0.1, nh[2] + 0.02, 0.025, 0.07, 0.03, 0, -0.3, sx * 0.3);
  if (o.mane) add(f, BOXG(), mat(o.mane), 0, (nb[1] + nh[1]) / 2 + 0.05, (nb[2] + nh[2]) / 2 - 0.03, 0.03, 0.08, 0.26, 0, -0.85);
  limb(f, [0, bodyY + 0.03, -0.34], [0, bodyY - 0.22, -0.44], 0.04, o.mane ?? d);
  const legs: [number, number, number][] = [[-1, 0.24, ga], [1, 0.24, -ga], [-1, -0.24, -ga * 0.8], [1, -0.24, ga * 0.8]];
  for (const [sx, lz, sw] of legs) {
    const hip: V3 = [sx * 0.09, bodyY - 0.05, lz];
    const ft: V3 = [sx * 0.085, 0.02, lz + sw * 0.32];
    const kn: V3 = [sx * 0.09, legH * 0.5, lz + sw * 0.16 + (lz > 0 ? 0.04 : -0.04)];
    limb(f, hip, kn, 0.075, c);
    limb(f, kn, ft, 0.05, d);
    add(f, BOXG(), mat(camel ? shade(c, 0.9) : '#2a2420'), ft[0], 0.012, ft[2], 0.06, 0.03, camel ? 0.09 : 0.06);
  }
  f.userData.bodyY = bodyY;
  return f;
}
/** Flame (outer orange, inner yellow) standing on y — emissive so torches & fires glow. */
function flame(p: THREE.Object3D, x: number, y: number, z: number, h: number): void {
  glow(cone(p, '#f97316', x, y, z, h * 0.32, h, 6), '#f97316', '#ea580c');
  glow(cone(p, '#fde047', x, y, z, h * 0.18, h * 0.62, 5), '#fde047', '#facc15');
}
/** Round broadleaf tree. */
function leafy(p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#4f7d3a'): void {
  limb(p, [x, y, z], [x, y + s * 0.5, z], s * 0.12, '#6b4c35');
  blob(p, c, x, y + s * 0.62, z, s * 0.36, s * 0.3, s * 0.36);
  blob(p, shade(c, 1.12), x + s * 0.1, y + s * 0.78, z + s * 0.06, s * 0.24, s * 0.2, s * 0.24);
}
/** Palm tree with arched fronds. */
function palm(p: THREE.Object3D, x: number, y: number, z: number, s: number, lean = 0.12, c = '#3f7d3a'): void {
  const top: V3 = [x + lean * s, y + s, z];
  limb(p, [x, y, z], [x + lean * s * 0.45, y + s * 0.55, z], s * 0.05, '#8b6b4a');
  limb(p, [x + lean * s * 0.45, y + s * 0.55, z], top, s * 0.04, '#9a7a56');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const fr = add(p, BOXG(), mat(i % 2 ? c : shade(c, 1.15)), top[0] + Math.cos(a) * s * 0.17, top[1] - s * 0.04, top[2] + Math.sin(a) * s * 0.17, s * 0.36, s * 0.012, s * 0.09);
    fr.rotation.set(0, -a, -0.45, 'YXZ');
  }
  dot(p, '#6b4f2a', top[0], top[1] - s * 0.02, top[2], s * 0.05, 5);
}
/** Pennant flag on a pole. */
function flag(p: THREE.Object3D, x: number, y: number, z: number, h: number, c: string, c2?: string, ry = 0, w = 0.034): void {
  limb(p, [x, y, z], [x, y + h, z], 0.0025, '#e5e7eb');
  const f = grp(p, x, y + h, z, ry);
  box(f, c, w / 2, -w * 0.7, 0, w, w * 0.65, 0.002);
  if (c2) box(f, c2, w / 2, -w * 0.47, 0, w, w * 0.16, 0.0025);
}
/** Stadium floodlight mast with a lit head. */
function mast(p: THREE.Object3D, x: number, y: number, z: number, h: number, ry: number, w = 0.05, c = '#cbd5e1'): void {
  limb(p, [x, y, z], [x, y + h, z], 0.006, c);
  const f = grp(p, x, y + h, z, ry);
  box(f, shade(c, 0.8), 0, -0.006, 0, w, w * 0.45, 0.01);
  glow(box(f, '#fff7d6', 0, -0.004, 0.0055, w * 0.88, w * 0.36, 0.003), '#fff7d6', '#fff2b0');
}
/** Wheel (axle along x) — 8-sided cylinder lying on its side. */
const wheel = (p: THREE.Object3D, x: number, y: number, z: number, r: number, w: number, c = '#1f2023') =>
  add(p, g('cyl8', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), mat(c), x, y, z, r * 2, w, r * 2, 0, 0, Math.PI / 2);
/** Racket: handle + flattened oval head, from the hand towards tip (unit-height figure space). */
function racket(f: THREE.Object3D, hand: V3, tip: V3, c = '#e5e7eb'): void {
  const d = new THREE.Vector3(tip[0] - hand[0], tip[1] - hand[1], tip[2] - hand[2]), len = d.length();
  d.normalize();
  const at = (k: number): V3 => [hand[0] + d.x * len * k, hand[1] + d.y * len * k, hand[2] + d.z * len * k];
  limb(f, hand, at(0.45), 0.03, '#1f2937');
  const h = blob(f, c, ...at(0.72), 0.1, len * 0.3, 0.018);
  h.quaternion.setFromUnitVectors(_u, d);
}

// =========================================================================================================
// WIMBLEDON — Centre Court: the dark-green, ivy-clad bowl with its white roof rim and folded roof panels,
// striped grass with worn baselines, net, umpire's chair, players and ball kids; an outside court on the lawn
// with purple-and-green flags, hydrangea beds and trees.
// =========================================================================================================
const sp_wimbledon: Builder = (gp) => {
  const Y0 = 0.03, GREEN = '#1f4d2c', PURPLE = '#5b2a86';
  const lawn = '#5f9a3e';
  base(gp, 0.5, lawn, (x, _y, z) => {
    if (Math.abs(z - 0.36) < 0.022 && x < 0.1) return '#d8ccb0';
    if (Math.abs(x + 0.4) < 0.02 && z > -0.1) return '#d8ccb0';
    return shade(lawn, 0.9 + fbm(x * 12, 0, z * 12, 2) * 0.2);
  });
  const cc = grp(gp, -0.02, Y0, -0.05);
  const A = 0.17, Bz = 0.105, plan = supPlan(A, Bz, 4.2);
  // court surround + grass court with stripes and worn brown baselines
  turf(cc, (x, z) => Math.pow(Math.abs(x) / A, 4.2) + Math.pow(Math.abs(z) / Bz, 4.2) < 1, A, Bz, 18, 0.002, (x, _y, z) => {
    const wear = Math.abs(Math.abs(x) - 0.112) < 0.014 && Math.abs(z) < 0.05;
    if (wear) return mix('#9a8a5a', '#6f8f45', fbm(x * 90, 1, z * 90, 2));
    return shade('#5fa046', (Math.floor(x / 0.026 + 100) % 2 ? 0.92 : 1.06));
  });
  const L = 0.118, W = 0.052, w2 = 0.04, sv = 0.064;
  for (const s of [-1, 1]) { line(cc, -L, s * W, L, s * W, 0.002, 0.003); line(cc, -L, s * w2, L, s * w2, 0.002, 0.003); line(cc, s * L, -W, s * L, W, 0.002, 0.003); line(cc, s * sv, -w2, s * sv, w2, 0.002, 0.003); }
  line(cc, -sv, 0, sv, 0, 0.002, 0.003);
  // net, posts, umpire chair
  box(cc, '#1f2937', 0, 0.002, 0, 0.003, 0.016, W * 2 + 0.02);
  box(cc, '#f8fafc', 0, 0.017, 0, 0.004, 0.003, W * 2 + 0.02);
  for (const s of [-1, 1]) cyl(cc, GREEN, 0, 0.002, s * (W + 0.012), 0.003, 0.02, 6);
  box(cc, GREEN, 0, 0.002, -(W + 0.03), 0.014, 0.04, 0.012);
  box(cc, GREEN, 0, 0.042, -(W + 0.03), 0.018, 0.004, 0.016);
  fig(cc, 0, 0.044, -(W + 0.03), 0, 0.028, { c: '#1e3a5f', b: '#1e3a5f', feet: [[-0.06, -0.3, 0.2], [0.06, -0.3, 0.2]], hands: [[-0.15, 0.45, 0.2], [0.15, 0.45, 0.2]] });
  // players in white: server and returner
  const whites: Pose = { c: '#f8fafc', b: '#f1f5f9', legs: SK[1], shoes: '#f8fafc', sleeve: SK[1] };
  const sp = fig(cc, -0.128, 0.002, 0.022, Math.PI / 2, 0.048, { ...whites, hands: [[-0.2, 0.9, 0.05], [0.18, 1.12, -0.05]], lean: -0.1 });
  racket(sp, [0.18, 1.12, -0.05], [0.12, 1.42, -0.15]);
  dot(cc, '#d9f99d', -0.13, 0.11, 0.02, 0.0035, 5);
  const rp = fig(cc, 0.125, 0.002, -0.025, -Math.PI / 2, 0.048, { ...whites, skin: SK[3], legs: SK[3], sleeve: SK[3], feet: [[-0.14, 0, 0.02], [0.14, 0, 0.02]], hands: [[-0.15, 0.5, 0.25], [0.12, 0.5, 0.25]], lean: 0.35 });
  racket(rp, [0.12, 0.5, 0.25], [0.05, 0.75, 0.5]);
  for (const [x, z] of [[0.0, W + 0.035], [0.15, W + 0.035]] as const) fig(cc, x, 0.002, z, Math.PI, 0.034, { c: PURPLE, b: GREEN, hands: [[-0.15, 0.4, 0.15], [0.15, 0.4, 0.15]], lean: 0.25 });
  // the bowl: dark green walls, green seats full of fans; front kept low so the court reads
  const seat = crowd(['#f8fafc', '#e5e7eb', '#1f4d2c', '#7c3aed', '#0ea5e9', '#f59e0b', '#be123c'], '#2f5d3a', 0.93, 3);
  const back = (_t: number, y: number) => (y > 0.06 ? '#e8e6df' : (Math.floor(y * 90) % 3 === 0 ? '#2c6a3c' : GREEN));
  stands(cc, plan, { t0: 0.42, t1: 1.08, n: 44, rows: 7, off0: 0.006, dr: 0.016, y0: 0.012, dh: 0.011, seat, riser: GREEN, wall: GREEN, back, backH: 0.03 });
  stands(cc, plan, { t0: 0.08, t1: 0.42, n: 18, rows: 2, off0: 0.006, dr: 0.016, y0: 0.012, dh: 0.011, seat, riser: GREEN, wall: GREEN, back: () => GREEN, backH: 0.004 });
  // roof rim: white cantilever band over the upper stands + folded retractable panels at both ends
  const q = new Quads();
  const RY = 0.122, ri = 0.07, ro = 0.124;
  for (let i = 0; i < 40; i++) {
    const ta = 0.42 + (0.66 * i) / 40, tb = 0.42 + (0.66 * (i + 1)) / 40;
    const P = (t: number, off: number, y: number): Q => { const [x, z] = plan(t, off); return [x, y, z]; };
    q.quad(P(ta, ri, RY), P(tb, ri, RY), P(tb, ro, RY), P(ta, ro, RY), '#f1f5f9', [0, 1, 0]);
    q.quad(P(ta, ri, RY - 0.008), P(tb, ri, RY - 0.008), P(tb, ro, RY - 0.008), P(ta, ro, RY - 0.008), '#94a3b8', [0, -1, 0]);
    const [ix, iz] = plan(ta, 0);
    q.quad(P(ta, ri, RY - 0.008), P(tb, ri, RY - 0.008), P(tb, ri, RY), P(ta, ri, RY), '#e2e8f0', [-ix, 0, -iz]);
  }
  q.mesh(cc);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = s * (A + 0.04 + k * 0.012);
      const pnl = box(cc, k % 2 ? '#e2e8f0' : '#cbd5e1', x, RY + 0.004, 0, 0.012, 0.03 - k * 0.004, Bz * 2 + 0.1);
      pnl.rotation.z = s * 0.5;
    }
  }
  for (let i = 0; i < 10; i++) {
    const t = 0.45 + i * 0.066, [x, z] = plan(t, ro - 0.004);
    limb(cc, [x, 0.09, z], [x, RY - 0.006, z], 0.003, '#e2e8f0');
  }
  // ivy, purple/green flags, crest scoreboard on the front wall
  for (let i = 0; i < 14; i++) {
    const t = 0.45 + i * 0.045, [x, z] = plan(t, 0.124);
    blob(cc, i % 3 ? '#2f6b34' : '#3f8a3f', x, 0.035 + hash3(i, 2, 1) * 0.03, z, 0.02, 0.025, 0.01, -Math.atan2(z, x) + Math.PI / 2);
  }
  box(cc, GREEN, 0.06, 0.03, 0.135, 0.07, 0.035, 0.008);
  glow(box(cc, '#facc15', 0.06, 0.04, 0.14, 0.05, 0.012, 0.002), '#facc15', '#ca8a04');
  for (const [x, z] of [[-0.24, -0.24], [0.2, -0.26], [0.27, 0.0]] as const) flag(cc, x, 0.12, z, 0.05, PURPLE, GREEN);
  // outside court on the lawn (front right)
  const oc = grp(gp, 0.25, Y0, 0.3, -0.35);
  box(oc, '#4f8a3c', 0, 0, 0, 0.2, 0.002, 0.1);
  for (const s of [-1, 1]) { line(oc, -0.075, s * 0.034, 0.075, s * 0.034, 0.002, 0.0025); line(oc, s * 0.075, -0.034, s * 0.075, 0.034, 0.002, 0.0025); }
  box(oc, '#1f2937', 0, 0.002, 0, 0.002, 0.012, 0.08);
  for (const s of [-1, 1]) {
    const pl = fig(oc, s * 0.06, 0.002, s * 0.01, -s * Math.PI / 2, 0.042, { ...whites, skin: SK[s > 0 ? 0 : 4], legs: SK[s > 0 ? 0 : 4], sleeve: SK[s > 0 ? 0 : 4], hands: [[-0.18, 0.45, 0.1], [0.2, 0.6, 0.2]], lean: 0.2 });
    racket(pl, [0.2, 0.6, 0.2], [0.3, 0.85, 0.4]);
  }
  for (const s of [-1, 1]) box(oc, GREEN, 0, 0, s * 0.06, 0.2, 0.012, 0.004);
  // hedges, hydrangea beds, trees, visitors with strawberries
  for (let i = 0; i < 7; i++) {
    const a = 2.0 + i * 0.32, r = 0.44;
    blob(gp, i % 2 ? '#7c3aed' : '#a78bfa', Math.cos(a) * r, Y0 + 0.012, Math.sin(a) * r, 0.025, 0.016, 0.025);
  }
  for (const [x, z, s] of [[-0.38, -0.25, 0.12], [-0.25, -0.4, 0.11], [0.32, -0.32, 0.13], [0.42, -0.08, 0.1], [-0.43, 0.08, 0.1], [0.05, -0.45, 0.1]] as const) leafy(gp, x, Y0, z, s, '#3f7d3a');
  for (let i = 0; i < 9; i++) {
    const x = -0.3 + i * 0.045, z = 0.36 + (hash3(i, 1, 2) - 0.5) * 0.03;
    fig(gp, x, Y0, z, (hash3(i, 3, 3) - 0.5) * 2, 0.04, { c: ['#f8fafc', '#fda4af', '#93c5fd', '#fde68a', '#86efac'][i % 5], b: ['#1e3a8a', '#d6d3d1', '#f8fafc'][i % 3] });
  }
};

// ---- more shared props ------------------------------------------------------------------------------------
/** Hip-roofed / flat house block with window grid on the front (+z of its own group). */
function house(p: THREE.Object3D, x: number, y: number, z: number, ry: number, w: number, h: number, d: number, c: string, roof: string | null, win = '#334155', trim?: string): THREE.Group {
  const f = grp(p, x, y, z, ry);
  box(f, c, 0, 0, 0, w, h, d);
  const q = new Quads(), cols = Math.max(1, Math.round(w / 0.022)), rows = Math.max(1, Math.round(h / 0.03));
  const dx = w / cols, dy = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const wx = -w / 2 + dx * (i + 0.5), wy = dy * j + dy * 0.28;
    if (trim) q.box(wx, wy - 0.002, d / 2, dx * 0.62, dy * 0.56, 0.003, trim);
    q.box(wx, wy, d / 2 + 0.0015, dx * 0.42, dy * 0.44, 0.003, win);
  }
  if (q.pos.length) q.mesh(f);
  if (roof) {
    const r = gable(f, w + 0.008, Math.min(w, d) * 0.4, d + 0.008, roof, 0, h, 0);
    r.castShadow = true;
  }
  return f;
}
/** Water surface clipped to inside(x,z) (star-shaped about the group origin), with ripples. */
function water(p: THREE.Object3D, x: number, y: number, z: number, inside: (x: number, z: number) => boolean, hx: number, hz: number, n: number, c: string): void {
  const f = grp(p, x, y, z);
  turf(f, inside, hx, hz, n, 0, ripple(c));
  (f.children[0] as THREE.Mesh).material = mat('#ffffff', { vc: true, flat: true, rough: 0.25, metal: 0.1 });
}
/** Formula 1 car, length ≈ s along +z of its group. */
function f1car(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, c: string, c2 = '#f8fafc'): void {
  const f = grp(p, x, y, z, ry, s);
  box(f, c, 0, 0.04, -0.05, 0.2, 0.07, 0.62);
  box(f, c, 0, 0.04, 0.38, 0.09, 0.045, 0.32);
  box(f, shade(c, 0.85), 0, 0.03, -0.05, 0.36, 0.06, 0.28);
  box(f, c2, 0, 0.11, -0.08, 0.1, 0.04, 0.2);
  box(f, '#111827', 0, 0.015, 0.56, 0.5, 0.014, 0.08);
  box(f, c, 0, 0.03, 0.56, 0.5, 0.012, 0.06);
  box(f, '#111827', 0, 0.12, -0.42, 0.4, 0.06, 0.06);
  box(f, c2, 0, 0.18, -0.42, 0.4, 0.012, 0.07);
  for (const sx of [-1, 1]) box(f, '#111827', sx * 0.2, 0.06, -0.42, 0.012, 0.14, 0.1);
  dot(f, '#facc15', 0, 0.15, 0.04, 0.045, 6);
  limb(f, [0, 0.17, 0.12], [0, 0.17, -0.04], 0.015, '#111827');
  for (const [sx, wz, r] of [[-1, 0.33, 0.075], [1, 0.33, 0.075], [-1, -0.32, 0.09], [1, -0.32, 0.09]] as const) wheel(f, sx * 0.23, r, wz, r, 0.11);
}
/** Little motor yacht, length ≈ s along +z of its group. */
function yacht(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, c = '#f8fafc', stripe = '#1e3a8a'): void {
  const f = grp(p, x, y, z, ry, s);
  prism(f, [[-0.13, -0.5], [0.13, -0.5], [0.15, 0.1], [0, 0.5], [-0.15, 0.1]], 0, 0.1, c);
  box(f, stripe, 0, 0.055, -0.1, 0.31, 0.015, 0.7);
  box(f, c, 0, 0.1, -0.12, 0.2, 0.06, 0.4);
  box(f, '#1f2937', 0, 0.125, -0.0, 0.205, 0.025, 0.2);
  box(f, c, 0, 0.16, -0.16, 0.14, 0.04, 0.22);
  limb(f, [0, 0.2, -0.16], [0, 0.3, -0.18], 0.012, '#cbd5e1');
}
const sm = sstep;

// =========================================================================================================
// NAISMITH HALL OF FAME (Springfield, MA) — the silver basketball dome beside its tall spire topped with a
// glowing basketball; an outdoor court with kids shooting hoops, and a replica peach basket nailed to a post
// with the ladder that was needed to get the ball back out.
// =========================================================================================================
const sp_basketball: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#6a9a48', (x, _y, z) => {
    if (z < -0.37 + Math.sin(x * 6) * 0.02) return shade('#3f7d9c', 0.95 + fbm(x * 20, 0, z * 20, 2) * 0.1);
    if (Math.abs(x + 0.02 - z * 0.15) < 0.035 && z > 0.12) return shade('#d6d3cd', 0.97 + hash3(x * 80, 0, z * 80) * 0.05);
    return shade('#6a9a48', 0.9 + fbm(x * 12, 0, z * 12, 2) * 0.2);
  });
  const cx = -0.04, cz = -0.1;
  disc(gp, '#d6d3cd', cx, Y0, cz, 0.27, 0.004, 32);
  cyl(gp, '#f1f5f9', cx, Y0, cz, 0.215, 0.012, 28);
  glow(cyl(gp, '#38bdf8', cx, Y0 + 0.012, cz, 0.21, 0.022, 28), '#7dd3fc', '#0c4a6e');
  cyl(gp, '#f8fafc', cx, Y0 + 0.034, cz, 0.218, 0.01, 28);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    box(gp, '#e2e8f0', cx + Math.cos(a) * 0.212, Y0 + 0.012, cz + Math.sin(a) * 0.212, 0.004, 0.022, 0.004);
  }
  const SY = Y0 + 0.02, R = 0.17;
  add(gp, g('f2-sph22', () => new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, Math.PI * 0.56)), mat('#d4dae2', { metal: 0.55, rough: 0.28, flat: false }), cx, SY, cz, R, R, R);
  const seam = g('f2-seam', () => new THREE.TorusGeometry(1, 0.011, 3, 44, Math.PI));
  for (const ry of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) add(gp, seam, mat(ry === 0 || ry === Math.PI / 2 ? '#334155' : '#64748b'), cx, SY, cz, R * 1.004, R * 1.004, R * 1.004, ry);
  add(gp, g('f2-seamh', () => new THREE.TorusGeometry(1, 0.011, 3, 44)), mat('#64748b'), cx, SY + R * 0.5, cz, R * 0.87, R * 0.87, R * 0.87, 0, Math.PI / 2);
  // entrance canopy
  box(gp, '#f8fafc', cx + 0.04, Y0 + 0.04, cz + 0.22, 0.12, 0.006, 0.05);
  for (const s of [-1, 1]) limb(gp, [cx + 0.04 + s * 0.055, Y0, cz + 0.24], [cx + 0.04 + s * 0.055, Y0 + 0.04, cz + 0.24], 0.003, '#cbd5e1');
  // the spire with the lit basketball
  const sx0 = cx + 0.25, sz0 = cz - 0.02;
  tbox(gp, 0.05, 0.05, 0.014, 0.014, 0.36, '#cbd5e1', sx0, Y0, sz0);
  for (let k = 0; k < 6; k++) box(gp, '#64748b', sx0, Y0 + 0.03 + k * 0.05, sz0, 0.046 - k * 0.006, 0.004, 0.046 - k * 0.006);
  const bY = Y0 + 0.39;
  glow(blob(gp, '#f97316', sx0, bY, sz0, 0.035), '#f97316', '#c2410c');
  add(gp, g('f2-bseam', () => new THREE.TorusGeometry(1, 0.06, 3, 18)), mat('#1c1917'), sx0, bY, sz0, 0.036, 0.036, 0.036);
  add(gp, g('f2-bseam', () => new THREE.TorusGeometry(1, 0.06, 3, 18)), mat('#1c1917'), sx0, bY, sz0, 0.036, 0.036, 0.036, Math.PI / 2);
  // outdoor court (front left)
  const ct = grp(gp, -0.24, Y0, 0.24, 0.35);
  box(ct, '#c46a3a', 0, 0, 0, 0.2, 0.004, 0.16);
  box(ct, '#1d4ed8', 0, 0.004, -0.045, 0.06, 0.0015, 0.07);
  ringLine(ct, 0, 0.0055, -0.01, 0.03, 0.002, '#f8fafc', 20);
  ringLine(ct, 0, 0.0055, -0.05, 0.085, 0.002, '#f8fafc', 28);
  for (const s of [-1, 1]) line(ct, s * 0.1, -0.08, s * 0.1, 0.08, 0.004, 0.003);
  line(ct, -0.1, 0.08, 0.1, 0.08, 0.004, 0.003);
  pole(ct, [0, 0, -0.1], [0, 0.11, -0.1], 0.006, '#1f2937');
  limb(ct, [0, 0.1, -0.1], [0, 0.1, -0.075], 0.004, '#1f2937');
  box(ct, '#f8fafc', 0, 0.085, -0.074, 0.06, 0.04, 0.003);
  box(ct, '#dc2626', 0, 0.093, -0.072, 0.02, 0.014, 0.002);
  ringLine(ct, 0, 0.092, -0.06, 0.011, 0.0015, '#ea580c', 14);
  add(ct, g('f2-net', () => new THREE.CylinderGeometry(1, 0.7, 1, 8, 1, true)), mat('#f8fafc', { transparent: 0.7 }), 0, 0.083, -0.06, 0.011, 0.016, 0.011);
  fig(ct, 0.01, 0.004, 0.02, Math.PI, 0.05, { c: '#f97316', b: '#1e3a8a', ...CHEER, lean: -0.05 });
  dot(ct, '#ea580c', 0.0, 0.13, -0.02, 0.006, 6);
  fig(ct, -0.03, 0.004, -0.02, 0.2, 0.046, { c: '#22c55e', b: '#111827', hands: [[-0.24, 1.05, 0.05], [0.26, 0.9, 0.05]] });
  fig(ct, 0.06, 0.004, 0.06, -2.4, 0.044, { c: '#a855f7', b: '#f8fafc', ...RUN(1) });
  // replica peach basket with its ladder (front right)
  const pb = grp(gp, 0.22, Y0, 0.3, -0.5);
  box(pb, '#8b6b4a', 0, 0, 0, 0.022, 0.15, 0.022);
  add(pb, g('f2-basket', () => new THREE.CylinderGeometry(0.5, 0.36, 1, 9, 1, true)), mat('#c69a5a', { flat: false }), 0, 0.12, 0.028, 0.04, 0.028, 0.04);
  disc(pb, '#7c5a32', 0, 0.106, 0.028, 0.014, 0.002, 9);
  for (const k of [0.11, 0.128]) ringLine(pb, 0, k, 0.028, 0.019, 0.0016, '#7c5a32', 12);
  for (const s of [-1, 1]) limb(pb, [s * 0.016 + 0.05, 0, 0.06], [s * 0.016 + 0.02, 0.13, 0.03], 0.0025, '#a17a4f');
  for (let k = 1; k < 6; k++) { const t = k / 6; limb(pb, [0.034 + 0.05 * (1 - t) - 0.03 * t * 0, 0.13 * t, 0.06 - 0.03 * t], [0.066 - 0.03 * t, 0.13 * t, 0.06 - 0.03 * t], 0.0018, '#a17a4f'); }
  fig(pb, -0.04, 0, 0.06, 0.3, 0.05, { c: '#7c2d12', b: '#44403c', hands: [[-0.18, 0.5, 0.1], [0.22, 0.95, 0.15]] });
  dot(pb, '#78350f', 0.005, 0.15, 0.03, 0.007, 6);
  // visitors, trees, river bank
  for (let i = 0; i < 6; i++) {
    const z = 0.18 + i * 0.05, x = 0.0 + z * 0.15 + (i % 2 ? 0.02 : -0.02);
    fig(gp, x, Y0, z, i % 2 ? Math.PI : 0, 0.042, { c: ['#ef4444', '#f8fafc', '#38bdf8', '#facc15', '#16a34a', '#f97316'][i], b: ['#1e3a8a', '#44403c', '#d6d3d1'][i % 3] });
  }
  for (const [x, z, s] of [[-0.38, -0.2, 0.12], [-0.42, 0.0, 0.1], [0.4, 0.05, 0.11], [0.35, 0.24, 0.1], [-0.3, -0.33, 0.1], [0.28, -0.32, 0.12], [-0.12, 0.42, 0.09]] as const) leafy(gp, x, Y0, z, s, '#3f7d3a');
};

// =========================================================================================================
// BELL CENTRE (Montreal) — a cut-away hockey arena: white ice with red & blue lines, face-off circles, creases
// and red nets; boards and glass; a steep bowl of red-white-blue fans; centre-hung scoreboard; red jerseys vs
// white, goalies, referee; outside a snowy plaza with a bronze hockey statue.
// =========================================================================================================
const sp_icehockey: Builder = (gp) => {
  const Y0 = 0.03, RED = '#b91c1c', BLUE = '#1e3a8a';
  base(gp, 0.5, '#a8a29e', (x, _y, z) => {
    if (fbm(x * 9, 3, z * 9, 2) > 0.62) return '#f1f5f9';
    return shade('#a8a29e', (Math.floor(x * 30 + 50) + Math.floor(z * 30 + 50)) % 2 ? 0.95 : 1.03);
  });
  const ar = grp(gp, 0, Y0, -0.04);
  const A = 0.19, B = 0.088, N = 5;
  const plan = supPlan(A, B, N), inside = (x: number, z: number) => Math.pow(Math.abs(x) / A, N) + Math.pow(Math.abs(z) / B, N) < 1;
  box(ar, '#3f3f46', 0, 0, 0, A * 2 + 0.03, 0.003, B * 2 + 0.03);
  turf(ar, inside, A, B, 14, 0.004, (x, _y, z) => shade('#eef6fb', 0.98 + hash3(x * 50, 0, z * 50) * 0.04));
  const yl = 0.0045;
  line(ar, 0, -B, 0, B, yl, 0.006, '#dc2626');
  for (const s of [-1, 1]) {
    line(ar, s * 0.05, -B, s * 0.05, B, yl, 0.008, '#1d4ed8');
    line(ar, s * 0.145, -0.055, s * 0.145, 0.055, yl, 0.0025, '#dc2626');
    for (const sz of [-1, 1]) {
      ringLine(ar, s * 0.11, yl + 0.001, sz * 0.036, 0.022, 0.0016, '#dc2626', 20);
      dot(ar, '#dc2626', s * 0.11, yl, sz * 0.036, 0.003, 5);
    }
    add(ar, g('f2-crease', () => new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI)), mat('#7dd3fc'), s * 0.145, yl + 0.0005, 0, 0.016, 0.001, 0.016, s > 0 ? Math.PI : 0);
    // goal net: red frame + white mesh
    const gx = s * 0.153;
    for (const sz of [-1, 1]) pole(ar, [gx, yl, sz * 0.011], [gx, yl + 0.016, sz * 0.011], 0.0016, '#dc2626');
    pole(ar, [gx, yl + 0.016, -0.011], [gx, yl + 0.016, 0.011], 0.0016, '#dc2626');
    box(ar, '#f8fafc', gx + s * 0.007, yl, 0, 0.012, 0.015, 0.022).material = mat('#f8fafc', { transparent: 0.75 });
  }
  ringLine(ar, 0, yl + 0.001, 0, 0.022, 0.0016, '#1d4ed8', 20);
  // boards (white, yellow kick plate) + glass
  const bq = new Quads(), gq = new Quads();
  for (let i = 0; i < 64; i++) {
    const ta = i / 64, tb = (i + 1) / 64;
    const P = (t: number, off: number, y: number): Q => { const [x, z] = plan(t, off); return [x, y, z]; };
    const [mx, mz] = plan((ta + tb) / 2, 0), want: Q = [-mx, 0, -mz];
    bq.quad(P(ta, 0, 0.002), P(tb, 0, 0.002), P(tb, 0, 0.008), P(ta, 0, 0.008), '#facc15', want);
    bq.quad(P(ta, 0, 0.008), P(tb, 0, 0.008), P(tb, 0, 0.018), P(ta, 0, 0.018), i % 8 === 3 ? '#1d4ed8' : i % 8 === 6 ? RED : '#f8fafc', want);
    bq.quad(P(ta, 0, 0.018), P(tb, 0, 0.018), P(tb, 0.006, 0.018), P(ta, 0.006, 0.018), '#e5e7eb', [0, 1, 0]);
    gq.quad(P(ta, 0.003, 0.018), P(tb, 0.003, 0.018), P(tb, 0.003, 0.036), P(ta, 0.003, 0.036), '#bae6fd', want);
  }
  bq.mesh(ar);
  const gm = gq.mesh(ar);
  gm.material = mat('#ffffff', { vc: true, transparent: 0.28 }).clone(); // mat() is shared: don't change it in place
  (gm.material as THREE.Material).side = THREE.DoubleSide;
  // benches
  for (const s of [-1, 1]) box(ar, '#27272a', s * 0.06, 0, -B - 0.012, 0.07, 0.01, 0.012);
  // the bowl
  const seat = crowd([RED, RED, BLUE, '#f8fafc', RED, '#f8fafc'], '#7f1d1d', 0.95, 5);
  const back = (_t: number, y: number) => (y > 0.1 ? '#475569' : Math.floor(y * 80) % 3 === 0 ? '#94a3b8' : '#64748b');
  stands(ar, plan, { t0: 0.42, t1: 1.08, n: 52, rows: 9, off0: 0.012, dr: 0.017, y0: 0.022, dh: 0.013, seat, riser: '#3f3f46', wall: '#27272a', back, backH: 0.02 });
  stands(ar, plan, { t0: 0.08, t1: 0.42, n: 20, rows: 2, off0: 0.012, dr: 0.017, y0: 0.022, dh: 0.012, seat, riser: '#3f3f46', wall: '#27272a', back: () => '#27272a', backH: 0.004 });
  // centre-hung scoreboard on a truss between two pylons
  const SH = 0.25;
  for (const s of [-1, 1]) { pole(ar, [s * 0.36, 0, 0], [s * 0.36, SH + 0.03, 0], 0.008, '#64748b'); }
  pole(ar, [-0.36, SH + 0.03, 0], [0.36, SH + 0.03, 0], 0.005, '#94a3b8');
  pole(ar, [-0.36, SH + 0.045, 0], [0.36, SH + 0.045, 0], 0.003, '#94a3b8');
  for (let k = -6; k <= 6; k++) limb(ar, [k * 0.055, SH + 0.03, 0], [(k + 0.5) * 0.055, SH + 0.045, 0], 0.0018, '#94a3b8');
  for (const s of [-1, 1]) limb(ar, [s * 0.02, SH, 0], [s * 0.02, SH + 0.03, 0], 0.0012, '#1f2937');
  box(ar, '#18181b', 0, SH - 0.05, 0, 0.07, 0.05, 0.07);
  for (const [ox, oz, ry] of [[0, 0.0355, 0], [0, -0.0355, Math.PI], [0.0355, 0, Math.PI / 2], [-0.0355, 0, -Math.PI / 2]] as const) {
    glow(box(ar, '#38bdf8', ox, SH - 0.044, oz, 0.06, 0.03, 0.002, ry), '#38bdf8', '#0369a1');
    glow(box(ar, '#ef4444', ox * 1.02, SH - 0.034, oz * 1.02, 0.04, 0.006, 0.002, ry), '#ef4444', '#b91c1c');
  }
  box(ar, '#27272a', 0, SH - 0.065, 0, 0.05, 0.015, 0.05);
  // players
  const home: Pose = { c: RED, b: BLUE, legs: '#f8fafc', sleeve: RED, shoes: '#111827', hat: (f) => blob(f, '#1f2937', 0, 0.94, 0, 0.12, 0.08, 0.12) };
  const away: Pose = { c: '#f8fafc', b: '#111827', legs: '#111827', sleeve: '#f8fafc', shoes: '#111827', hat: (f) => blob(f, '#f8fafc', 0, 0.94, 0, 0.12, 0.08, 0.12) };
  const skater = (x: number, z: number, ry: number, o: Pose, ph: number) => {
    const s = ph ? -1 : 1;
    const f = fig(ar, x, yl, z, ry, 0.04, { ...o, feet: [[-0.12, 0, 0.12 * s], [0.12, 0.05, -0.15 * s]], hands: [[-0.12, 0.5, 0.25], [0.1, 0.35, 0.28]], lean: 0.45 });
    limb(f, [-0.12, 0.5, 0.25], [0.1, 0.02, 0.62], 0.025, '#1c1917');
    box(f, '#1c1917', 0.12, 0, 0.66, 0.12, 0.04, 0.05);
  };
  skater(-0.02, 0.01, Math.PI / 2, home, 0);
  skater(0.03, -0.03, -Math.PI / 2, away, 1);
  skater(-0.08, 0.04, 1.2, home, 1);
  skater(0.08, 0.035, -1.9, away, 0);
  skater(-0.06, -0.045, 1.8, home, 0);
  skater(0.1, -0.03, -1.4, away, 1);
  cyl(ar, '#0a0a0a', 0.008, yl, -0.004, 0.0025, 0.0015, 6);
  for (const s of [-1, 1]) {
    const gk = fig(ar, s * 0.138, yl, 0, -s * Math.PI / 2, 0.042, { ...(s < 0 ? home : away), bulk: 1.35, feet: [[-0.16, 0, 0.05], [0.16, 0, 0.05]], hands: [[-0.25, 0.45, 0.25], [0.22, 0.3, 0.3]], lean: 0.3 });
    box(gk, s < 0 ? '#f8fafc' : '#dc2626', -0.08, 0, 0.12, 0.12, 0.42, 0.06);
    box(gk, s < 0 ? '#f8fafc' : '#dc2626', 0.08, 0, 0.12, 0.12, 0.42, 0.06);
    blob(gk, '#78350f', -0.3, 0.48, 0.25, 0.1, 0.1, 0.03);
  }
  fig(ar, 0.0, yl, 0.06, Math.PI, 0.042, { c: '#e5e7eb', b: '#111827', sleeve: '#111827', hands: [[-0.2, 0.6, 0.1], [0.2, 0.6, 0.1]] });
  // outside: snowy plaza, a bronze statue on a plinth, flags, fans arriving
  box(gp, '#d6d3d1', 0.3, Y0, 0.3, 0.06, 0.04, 0.06);
  const st = fig(gp, 0.3, Y0 + 0.04, 0.3, -0.5, 0.07, { c: '#8a6a3a', b: '#8a6a3a', legs: '#8a6a3a', skin: '#8a6a3a', hair: '#7a5a2a', shoes: '#7a5a2a', feet: [[-0.12, 0, 0.18], [0.14, 0.08, -0.2]], hands: [[-0.15, 0.45, 0.3], [0.12, 0.35, 0.32]], lean: 0.45 });
  limb(st, [-0.15, 0.45, 0.3], [0.1, 0.02, 0.75], 0.03, '#7a5a2a');
  for (const [x, z] of [[-0.42, 0.12], [0.43, 0.08], [-0.35, 0.26], [0.36, -0.28], [-0.36, -0.3]] as const) {
    limb(gp, [x, Y0, z], [x, Y0 + 0.06, z], 0.008, '#57534e');
    cone(gp, '#2f5e3f', x, Y0 + 0.03, z, 0.05, 0.08, 7);
    cone(gp, '#f8fafc', x, Y0 + 0.085, z, 0.03, 0.05, 7);
  }
  for (const [x, z] of [[-0.18, 0.4], [0.12, 0.42]] as const) flag(gp, x, Y0, z, 0.1, RED, BLUE, 0, 0.04);
  for (let i = 0; i < 7; i++) {
    const x = -0.12 + i * 0.04, z = 0.32 + hash3(i, 2, 9) * 0.06;
    fig(gp, x, Y0, z, Math.PI + (hash3(i, 1, 1) - 0.5), 0.04, { c: i % 3 ? RED : '#f8fafc', b: '#1f2937', hat: (f) => blob(f, i % 2 ? BLUE : RED, 0, 1.0, -0.02, 0.1, 0.08, 0.1) });
  }
};

// =========================================================================================================
// MONACO GRAND PRIX — the harbour full of yachts, the street circuit with red-and-white kerbs and armco
// barriers running along the quay, a grandstand, the tunnel under the hotel, apartment blocks climbing the
// hillside and the green-roofed Casino; three F1 cars racing.
// =========================================================================================================
const sp_monaco: Builder = (gp) => {
  const Y0 = 0.03;
  const hill = (x: number, z: number) => Math.max(sm(-0.12, -0.36, z), sm(-0.22, -0.42, x) * sm(0.35, 0.0, z));
  base(gp, 0.5, '#9a958a', (x, _y, z) => {
    const h = hill(x, z);
    if (h > 0.4) return shade(fbm(x * 14, 1, z * 14, 2) > 0.5 ? '#5c7f3d' : '#8a8172', 0.92 + hash3(x * 40, 0, z * 40) * 0.12);
    return shade('#a8a29e', 0.95 + hash3(x * 60, 0, z * 60) * 0.08);
  }, 0.03, (x, z) => hill(x, z) * 0.1, 12, 48);
  // harbour basin (front right)
  const hx = 0.2, hz = 0.22;
  water(gp, hx, Y0 + 0.003, hz, (x, z) => Math.hypot(x / 0.27, z / 0.24) < 1 && Math.hypot(x + hx, z + hz) < 0.47, 0.27, 0.24, 14, '#1d6fa3');
  // quay edge
  for (let i = 0; i < 20; i++) {
    const a = Math.PI * 0.55 + (i / 20) * Math.PI * 0.95, b = a + (Math.PI * 0.95) / 20;
    const P = (t: number): [number, number] => [hx + Math.cos(t) * 0.275, hz + Math.sin(t) * 0.245];
    const [x0, z0] = P(a), [x1, z1] = P(b);
    if (Math.hypot(x0, z0) < 0.48) line(gp, x0, z0, x1, z1, Y0 + 0.003, 0.01, '#e7e5e4', 0.006);
  }
  // the circuit: along the quay then up the left
  const track: [number, number][] = [[0.47, -0.08], [0.2, -0.05], [0.0, -0.02], [-0.08, 0.06], [-0.1, 0.2], [-0.14, 0.34], [-0.22, 0.42]];
  for (let i = 0; i < track.length - 1; i++) {
    const [x0, z0] = track[i], [x1, z1] = track[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ang = -Math.atan2(z1 - z0, x1 - x0);
    box(gp, '#3f3f46', (x0 + x1) / 2, Y0 + 0.002, (z0 + z1) / 2, len + 0.05, 0.003, 0.07, ang);
    const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
    for (const s of [-1, 1]) {
      const n = Math.ceil(len / 0.016);
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        line(gp, x0 + (x1 - x0) * t0 + nx * s * 0.036, z0 + (z1 - z0) * t0 + nz * s * 0.036, x0 + (x1 - x0) * t1 + nx * s * 0.036, z0 + (z1 - z0) * t1 + nz * s * 0.036, Y0 + 0.005, 0.008, k % 2 ? '#dc2626' : '#f8fafc', 0.002);
      }
      // armco + catch fence on the harbour side
      if (s === -1) {
        line(gp, x0 + nx * s * 0.046, z0 + nz * s * 0.046, x1 + nx * s * 0.046, z1 + nz * s * 0.046, Y0 + 0.004, 0.003, '#d4d4d8', 0.012);
        line(gp, x0 + nx * s * 0.049, z0 + nz * s * 0.049, x1 + nx * s * 0.049, z1 + nz * s * 0.049, Y0 + 0.016, 0.0015, '#94a3b8', 0.03).material = mat('#94a3b8', { transparent: 0.5 });
      }
    }
  }
  line(gp, -0.1, 0.27, -0.1, 0.27, Y0 + 0.005, 0.07, '#f8fafc', 0.002);
  for (let k = 0; k < 6; k++) line(gp, -0.137 + k * 0.012, 0.265 + 0.012 * (k % 2), -0.127 + k * 0.012, 0.265 + 0.012 * (k % 2), Y0 + 0.006, 0.012, k % 2 ? '#111827' : '#f8fafc', 0.002);
  f1car(gp, -0.09, Y0 + 0.004, 0.13, 0.08, 0.075, '#dc2626', '#facc15');
  f1car(gp, -0.105, Y0 + 0.004, 0.22, 0.12, 0.075, '#0ea5e9', '#f8fafc');
  f1car(gp, 0.12, Y0 + 0.004, -0.04, -1.6, 0.075, '#16a34a', '#facc15');
  // grandstand on the inside of the quay
  const gs = grp(gp, -0.22, Y0, 0.16, Math.PI / 2 - 0.08);
  const q = new Quads();
  for (let r = 0; r < 6; r++) for (let i = 0; i < 12; i++) q.box(-0.12 + i * 0.02 + 0.01, r * 0.012, -0.0 - r * 0.014, 0.02, 0.012, 0.014, hash3(i, r, 4) < 0.25 ? SK[(i + r) % 5] : ['#dc2626', '#f8fafc', '#f59e0b', '#2563eb'][(i * 3 + r) % 4]);
  q.mesh(gs);
  box(gs, '#e5e7eb', 0, 0, -0.084, 0.24, 0.074, 0.006);
  for (const s of [-1, 1]) limb(gs, [s * 0.12, 0.074, -0.084], [s * 0.12, 0.085, -0.084], 0.003, '#94a3b8');
  box(gs, '#dc2626', 0, 0.085, -0.06, 0.25, 0.005, 0.07);
  // tunnel under the hotel (back right) + apartment blocks on the hill
  box(gp, '#e7d7bd', 0.36, Y0, -0.12, 0.16, 0.06, 0.1, 0.1);
  house(gp, 0.37, Y0 + 0.06, -0.14, 0.1, 0.15, 0.06, 0.08, '#f2e2c4', null, '#3b5b7a', '#f8fafc');
  box(gp, '#111827', 0.3, Y0 + 0.004, -0.07, 0.04, 0.035, 0.003, 0.1);
  const pal = ['#f3e3c7', '#f5cfc0', '#e8c48a', '#f0e6d8', '#e9b7a0', '#f6e7b0'];
  const lots: [number, number, number, number, number][] = [
    [-0.02, -0.2, 0.09, 0.07, 0.11], [0.1, -0.22, 0.09, 0.09, 0.13], [0.22, -0.26, 0.08, 0.08, 0.15], [0.33, -0.3, 0.08, 0.1, 0.09],
    [-0.12, -0.3, 0.08, 0.12, 0.12], [0.05, -0.34, 0.09, 0.12, 0.1], [0.18, -0.38, 0.08, 0.1, 0.09], [-0.32, -0.12, 0.08, 0.08, 0.14],
    [-0.36, 0.02, 0.07, 0.08, 0.1], [-0.4, 0.15, 0.06, 0.08, 0.1],
  ];
  lots.forEach(([x, z, w, h, d], i) => {
    const y = Y0 + hill(x, z) * 0.1 - 0.01;
    const ry = x < -0.25 ? Math.PI / 2 - 0.2 : -0.08 * x * 4;
    house(gp, x, y, z, ry, w, h, d, pal[i % pal.length], '#b45f3c', '#475569', '#f8fafc');
  });
  // the Casino: twin towers, central lantern, green copper roofs
  const ca = grp(gp, -0.22, Y0 + hill(-0.22, -0.3) * 0.1 - 0.01, -0.3, 0.3);
  box(ca, '#efe2c4', 0, 0, 0, 0.16, 0.06, 0.08);
  box(ca, '#e2cfa8', 0, 0.06, 0.0, 0.17, 0.008, 0.085);
  for (const s of [-1, 1]) {
    box(ca, '#efe2c4', s * 0.065, 0.06, 0.02, 0.028, 0.05, 0.028);
    cone(ca, '#4a8a6a', s * 0.065, 0.11, 0.02, 0.022, 0.035, 4, Math.PI / 4);
  }
  add(ca, g('f2-cdome', () => new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2)), mat('#4a8a6a'), 0, 0.068, 0.01, 0.035, 0.03, 0.03);
  for (let i = 0; i < 6; i++) box(ca, '#cbb98f', -0.05 + i * 0.02, 0.012, 0.041, 0.008, 0.04, 0.003);
  // palms, flags and the principality's red-white
  for (const [x, z, s] of [[-0.3, 0.3, 0.12], [0.0, -0.12, 0.1], [-0.24, -0.04, 0.11], [0.42, -0.2, 0.1]] as const) palm(gp, x, Y0 + hill(x, z) * 0.1, z, s);
  for (const [x, z] of [[-0.03, 0.08], [0.05, -0.09], [0.26, -0.11]] as const) flag(gp, x, Y0, z, 0.08, '#f8fafc', '#dc2626', 0, 0.035);
  // yachts in the harbour
  yacht(gp, 0.12, Y0 + 0.003, 0.14, 1.4, 0.14);
  yacht(gp, 0.2, Y0 + 0.003, 0.22, 1.5, 0.12, '#f8fafc', '#334155');
  yacht(gp, 0.3, Y0 + 0.003, 0.12, 1.3, 0.11, '#f1f5f9', '#0e7490');
  yacht(gp, 0.18, Y0 + 0.003, 0.36, 0.4, 0.13);
  yacht(gp, 0.32, Y0 + 0.003, 0.3, 0.2, 0.1, '#e2e8f0', '#9f1239');
};

// =========================================================================================================
// ITEN — "Home of Champions" in Kenya's highlands: red-earth roads at 2,400 m, the famous welcome gate,
// groups of runners in bright kit on the dirt track and the road, eucalyptus and flat-topped acacias,
// tin-roofed houses, and the escarpment dropping into the Kerio Valley at the back.
// =========================================================================================================
const sp_iten: Builder = (gp) => {
  const Y0 = 0.03, RED = '#a8512c';
  const hf = (x: number, z: number) => 0.06 * sm(-0.48, -0.22, z + Math.sin(x * 5) * 0.03);
  base(gp, 0.5, '#6f8f3c', (x, y, z) => {
    if (y < Y0 + 0.03 && z < -0.25) return shade('#7aa04a', 0.85 + fbm(x * 18, 0, z * 18, 2) * 0.25);
    const n = fbm(x * 8, 4, z * 8, 2);
    return shade(n > 0.6 ? '#7d8a42' : '#6f8f3c', 0.9 + n * 0.2);
  }, 0.03, hf, 12, 48, '#8a4a2a');
  const T = Y0 + 0.06;
  const rq = new Quads();
  for (let i = 0; i < 16; i++) {
    const za = 0.47 - i * 0.045, zb = za - 0.045, xa = 0.05 + za * 0.25 + Math.sin(za * 9) * 0.02, xb = 0.05 + zb * 0.25 + Math.sin(zb * 9) * 0.02;
    if (Math.hypot(xa, za) > 0.49) continue;
    const ya = T + 0.002 - 0.06 * (1 - sm(-0.48, -0.22, za)), yb = T + 0.002 - 0.06 * (1 - sm(-0.48, -0.22, zb));
    rq.quad([xa - 0.04, ya, za], [xa + 0.04, ya, za], [xb + 0.04, yb, zb], [xb - 0.04, yb, zb], shade(RED, 0.95 + hash3(i, 0, 3) * 0.1), [0, 1, 0]);
  }
  rq.mesh(gp);
  // escarpment rocks
  for (let i = 0; i < 9; i++) {
    const x = -0.42 + i * 0.1, z = -0.31 + Math.sin(x * 5) * 0.03;
    blob(gp, '#8a5a3c', x, Y0 + 0.035, z, 0.04, 0.025, 0.02, x);
  }
  // the dirt track (Kamariny style) on the left
  const tr = grp(gp, -0.22, T, 0.06, 0.15);
  const tp = supPlan(0.15, 0.09, 2.2), tin = supPlan(0.11, 0.05, 2.2);
  turf(tr, (x, z) => Math.pow(Math.abs(x) / 0.15, 2.2) + Math.pow(Math.abs(z) / 0.09, 2.2) < 1, 0.15, 0.09, 12, 0.002, (x, _y, z) => {
    const inner = Math.pow(Math.abs(x) / 0.11, 2.2) + Math.pow(Math.abs(z) / 0.05, 2.2) < 1;
    return inner ? shade('#7aa04a', 0.95 + hash3(x * 30, 0, z * 30) * 0.1) : shade('#b5603a', 0.95 + hash3(x * 60, 1, z * 60) * 0.1);
  });
  for (let i = 0; i < 4; i++) {
    const off = 0.01 + i * 0.01;
    for (let k = 0; k < 24; k++) {
      const [x0, z0] = tin(k / 24, off), [x1, z1] = tin((k + 1) / 24, off);
      line(tr, x0, z0, x1, z1, 0.002, 0.0012, '#f1e5d0');
    }
  }
  void tp;
  const kits = ['#ef4444', '#facc15', '#22c55e', '#0ea5e9', '#f97316', '#a855f7', '#ec4899', '#f8fafc'];
  for (let i = 0; i < 7; i++) {
    const t = 0.18 + i * 0.03 + (i > 3 ? 0.35 : 0);
    const [x, z] = tin(t, 0.02 + (i % 2) * 0.012), [x2, z2] = tin(t + 0.01, 0.02);
    fig(tr, x, 0.002, z, Math.atan2(x2 - x, z2 - z), 0.045, { c: kits[i], b: '#111827', legs: SK[3 + (i % 2)], sleeve: SK[3 + (i % 2)], skin: SK[3 + (i % 2)], hair: '#111111', shoes: kits[(i + 3) % 8], ...RUN(i % 2) });
  }
  // the welcome gate over the red road
  const gt = grp(gp, 0.11, T, 0.2, -0.25, 1.45);
  for (const s of [-1, 1]) {
    box(gt, '#7c1d1d', s * 0.08, 0, 0, 0.022, 0.13, 0.022);
    box(gt, '#15803d', s * 0.08, 0.03, 0, 0.024, 0.012, 0.024);
  }
  box(gt, '#7c1d1d', 0, 0.13, 0, 0.2, 0.012, 0.022);
  box(gt, '#f8fafc', 0, 0.095, 0.008, 0.14, 0.032, 0.006);
  box(gt, '#15803d', 0, 0.12, 0.012, 0.14, 0.006, 0.002);
  for (let i = 0; i < 6; i++) box(gt, '#111827', -0.05 + i * 0.02, 0.102, 0.012, 0.012, 0.004, 0.002);
  box(gt, '#111827', 0, 0.098, 0.012, 0.09, 0.003, 0.002);
  fig(gt, 0, 0.142, 0, 0, 0.05, { c: '#dc2626', b: '#111827', skin: '#3a2416', legs: '#3a2416', sleeve: '#3a2416', ...RUN(0) });
  // runners on the road
  for (let i = 0; i < 6; i++) {
    const z = 0.38 - i * 0.05, x = 0.05 + z * 0.25 + ((i % 2) - 0.5) * 0.03;
    fig(gp, x, T, z, Math.PI + 0.25, 0.046, { c: kits[(i + 2) % 8], b: '#1f2937', skin: SK[3 + (i % 2)], legs: SK[3 + (i % 2)], sleeve: i % 3 ? SK[3 + (i % 2)] : kits[(i + 2) % 8], hair: '#111111', shoes: '#f8fafc', ...RUN(i % 2) });
  }
  // houses with tin roofs, a little shop
  const hs: [number, number, number, string][] = [[0.3, 0.0, 0.3, '#e9d5b7'], [0.38, 0.16, -0.3, '#c7d2fe'], [0.26, -0.16, 0.1, '#fde68a'], [-0.05, -0.15, 0.0, '#e7e5e4']];
  hs.forEach(([x, z, ry, c]) => {
    const f = house(gp, x, T, z, ry, 0.09, 0.045, 0.06, c, null, '#3f3f46');
    gable(f, 0.1, 0.02, 0.07, '#9ca3af', 0, 0.045, 0);
  });
  // trees: tall eucalyptus and flat acacias
  for (const [x, z, s] of [[0.42, -0.04, 0.2], [-0.4, -0.15, 0.22], [0.18, 0.35, 0.16], [-0.42, 0.22, 0.18]] as const) {
    limb(gp, [x, T, z], [x, T + s * 0.8, z], s * 0.04, '#d6cfc2');
    blob(gp, '#5f7f4f', x, T + s * 0.8, z, s * 0.16, s * 0.32, s * 0.16);
  }
  for (const [x, z, s] of [[0.36, 0.3, 0.13], [-0.1, 0.38, 0.12], [0.08, -0.22, 0.12], [-0.3, -0.24, 0.11]] as const) {
    limb(gp, [x, T, z], [x + s * 0.15, T + s * 0.6, z], s * 0.05, '#5b4636');
    blob(gp, '#4d7a35', x + s * 0.15, T + s * 0.66, z, s * 0.5, s * 0.1, s * 0.4);
  }
  // valley floor far below with fields
  for (let i = 0; i < 6; i++) blob(gp, i % 2 ? '#86a856' : '#a3b86a', -0.3 + i * 0.12, Y0 + 0.002, -0.42 + (i % 2) * 0.02, 0.05, 0.004, 0.03);
};

// =========================================================================================================
// CAPOEIRA in Salvador's Pelourinho — cobbled square, pastel colonial houses and the blue church, a roda of
// people in white clapping, berimbau players and an atabaque drum; one player cartwheels while the other
// swings a high kick over him.
// =========================================================================================================
const sp_capoeira: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#a39d93', (x, _y, z) => {
    if (Math.hypot(x, z - 0.06) < 0.2) return shade('#9c8e7c', 0.97 + hash3(x * 40, 0, z * 40) * 0.05);
    return shade('#a39d93', 0.96 + fbm(x * 30, 0, z * 30, 2) * 0.08);
  }, 0.03, (x, z) => 0.04 * sm(-0.1, -0.4, z) + 0.0 * x);
  // colonial row at the back, stepping up the slope
  const pal = ['#f9a8d4', '#fde68a', '#93c5fd', '#86efac', '#fdba74', '#c4b5fd', '#fca5a5', '#99f6e4'];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.94 + i * 0.4, r = 0.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85 - 0.02;
    if (i === 4) continue;
    const y = Y0 + 0.04 * sm(-0.1, -0.4, z);
    for (const k of [-1, 0, 1]) house(gp, x + Math.sin(a) * k * 0.085 * -1, y, z + Math.cos(a) * k * 0.085, -a - Math.PI / 2, 0.082, 0.1 + ((i + k + 3) % 3) * 0.018, 0.06, pal[(i * 3 + k + 8) % 8], '#b45f3c', '#7c2d12', '#f8fafc');
  }
  // the blue church with twin bell towers
  const a5 = -Math.PI * 0.94 + 4 * 0.4, ch = grp(gp, Math.cos(a5) * 0.4, Y0 + 0.035, Math.sin(a5) * 0.4 * 0.85 - 0.02, -a5 - Math.PI / 2, 1.25);
  box(ch, '#3b82c4', 0, 0, 0, 0.11, 0.11, 0.07);
  for (const s of [-1, 1]) {
    box(ch, '#3b82c4', s * 0.045, 0.11, 0.01, 0.026, 0.05, 0.026);
    cone(ch, '#f8fafc', s * 0.045, 0.16, 0.01, 0.016, 0.03, 4, Math.PI / 4);
    box(ch, '#1e3a5f', s * 0.045, 0.13, 0.024, 0.01, 0.014, 0.003);
  }
  gable(ch, 0.064, 0.03, 0.02, '#f8fafc', 0, 0.11, 0.03).rotation.y = Math.PI / 2;
  box(ch, '#f8fafc', 0, 0.0, 0.036, 0.11, 0.008, 0.003);
  box(ch, '#f8fafc', 0, 0.1, 0.036, 0.11, 0.006, 0.003);
  box(ch, '#7c2d12', 0, 0, 0.037, 0.022, 0.04, 0.002);
  for (const s of [-1, 1]) box(ch, '#1e3a5f', s * 0.03, 0.055, 0.037, 0.012, 0.018, 0.002);
  // the roda
  const R = 0.2, cz = 0.12, FH = 0.066;
  disc(gp, '#9a8f80', 0, Y0, cz, R - 0.02, 0.002, 24);
  const white: Pose = { c: '#f8fafc', b: '#f8fafc', legs: '#f8fafc', shoes: SK[3] };
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI * 0.95 + (i / 12) * Math.PI * 1.25;
    if (i === 3 || i === 4 || i === 5) continue;
    const x = Math.cos(a) * R, z = cz + Math.sin(a) * R * 0.85, sk = SK[2 + (i % 3)];
    fig(gp, x, Y0, z, Math.atan2(-x, cz - z), FH, { ...white, skin: sk, sleeve: i % 2 ? sk : '#f8fafc', hands: [[-0.06, 0.62, 0.2], [0.06, 0.64, 0.22]], c: i % 4 === 0 ? '#fde047' : '#f8fafc' });
  }
  // musicians at the back of the circle: three berimbaus and the atabaque
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI * 0.95 + ((3 + k) / 12) * Math.PI * 1.25, x = Math.cos(a) * R, z = cz + Math.sin(a) * R * 0.85;
    const ry = Math.atan2(-x, cz - z);
    const m = fig(gp, x, Y0, z, ry, FH, { ...white, skin: SK[4], sleeve: SK[4], hands: [[-0.12, 0.55, 0.2], [0.15, 0.75, 0.22]] });
    limb(m, [-0.06, 0.2, 0.22], [-0.04, 1.75, 0.24], 0.022, '#a16207');
    limb(m, [-0.04, 1.75, 0.24], [0.02, 0.22, 0.26], 0.006, '#e5e7eb');
    blob(m, '#d97706', -0.1, 0.5, 0.28, 0.1, 0.1, 0.1);
  }
  const ax = Math.cos(-Math.PI * 0.95 + (6.5 / 12) * Math.PI * 1.25) * (R + 0.025), az = cz + Math.sin(-Math.PI * 0.95 + (6.5 / 12) * Math.PI * 1.25) * (R + 0.025) * 0.85;
  add(gp, g('f2-atab', () => new THREE.CylinderGeometry(0.5, 0.36, 1, 9)), mat('#92400e'), ax, Y0 + 0.03, az, 0.032, 0.06, 0.032);
  disc(gp, '#f5f5dc', ax, Y0 + 0.06, az, 0.0158, 0.002, 9);
  for (const k of [0.016, 0.04]) ringLine(gp, ax, Y0 + k, az, 0.0145, 0.0015, '#fde047', 10);
  // the jogo: a cartwheel (aú) and a high kick (meia-lua)
  const cw = fig(gp, -0.045, Y0 + 0.07, cz + 0.01, 0.4, FH * 1.1, { ...white, c: '#f8fafc', skin: SK[4], sleeve: SK[4], hands: [[-0.22, 1.1, 0.0], [0.22, 1.1, 0.0]], feet: [[-0.25, 0.05, 0], [0.22, 0.12, 0]] });
  cw.rotation.z = Math.PI * 0.93;
  cw.position.y = Y0 + FH * 1.2;
  fig(gp, 0.06, Y0, cz + 0.0, -1.2, FH * 1.12, { ...white, c: '#fde047', skin: SK[2], sleeve: SK[2], feet: [[-0.05, 0, -0.05], [0.12, 0.78, 0.32]], hands: [[-0.28, 0.75, -0.05], [0.25, 0.85, 0.05]], lean: -0.25 });
  // palm, bunting across the square
  palm(gp, 0.38, Y0, 0.2, 0.22);
  palm(gp, -0.4, Y0, 0.2, 0.2, -0.1);
  const bq = new Quads(), cols = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#f8fafc'];
  for (let i = 0; i < 22; i++) {
    const t = i / 22, x = -0.34 + t * 0.66, z = -0.12 + t * 0.03, y = Y0 + 0.17 - Math.sin(t * Math.PI) * 0.03;
    bq.quad([x, y, z], [x + 0.016, y, z], [x + 0.008, y - 0.016, z], [x + 0.008, y - 0.016, z], cols[i % 5], [0, 0, 1]);
    bq.quad([x, y, z], [x + 0.016, y, z], [x + 0.008, y - 0.016, z], [x + 0.008, y - 0.016, z], cols[i % 5], [0, 0, -1]);
  }
  bq.mesh(gp);
  limb(gp, [-0.34, Y0 + 0.17, -0.12], [0.32, Y0 + 0.17, -0.09], 0.001, '#475569');
};

/** Rider sitting on a beast built by beast(): returns the rider figure (unit-height space). */
function rider(b: THREE.Group, h: number, o: Pose, camel = false): THREE.Group {
  const by = b.userData.bodyY as number;
  const hip = by + (camel ? 0.3 : 0.15);
  return fig(b, 0, hip - 0.46 * h, camel ? -0.02 : 0.02, 0, h, { feet: [[-0.3, 0.12, 0.2], [0.3, 0.12, 0.2]], ...o });
}

// =========================================================================================================
// POLO in Imphal (Manipur) — the Mapal Kangjeibung ground, where the British first saw the game in the
// 1850s: riders in white turbans on small Manipuri ponies with bright head guards swinging mallets, goal
// posts, a covered pavilion of fans, and the giant Marjing polo statue standing on its hill.
// =========================================================================================================
const sp_polo: Builder = (gp) => {
  const Y0 = 0.03;
  const hill = (x: number, z: number) => 0.09 * Math.max(0, 1 - Math.hypot(x - 0.3, z + 0.3) / 0.22) ** 1.4;
  base(gp, 0.5, '#5f9a3e', (x, y, z) => {
    if (y > Y0 + 0.02) return shade('#4f7d3a', 0.9 + fbm(x * 20, 0, z * 20, 2) * 0.2);
    return shade('#6a9e45', 0.92 + fbm(x * 10, 0, z * 10, 2) * 0.16);
  }, 0.03, hill, 12, 48);
  const fd = grp(gp, -0.04, Y0, 0.06);
  const L = 0.3, W = 0.17;
  turf(fd, (x, z) => Math.abs(x) < L && Math.abs(z) < W, L, W, 20, 0.002, mow('#68a848', 0.05, true, 0.12));
  for (const s of [-1, 1]) {
    line(fd, -L, s * W, L, s * W, 0.002, 0.004);
    box(fd, '#f8fafc', 0, 0.002, s * (W + 0.004), L * 2, 0.008, 0.004);
    line(fd, s * L, -W, s * L, W, 0.002, 0.004);
    for (const sz of [-1, 1]) {
      pole(fd, [s * L, 0, sz * 0.03], [s * L, 0.05, sz * 0.03], 0.003, '#f8fafc');
      for (let k = 0; k < 3; k++) box(fd, '#dc2626', s * L, 0.012 + k * 0.014, sz * 0.03, 0.007, 0.006, 0.007);
    }
  }
  line(fd, 0, -W, 0, W, 0.002, 0.003);
  // riders: two teams on ponies
  const teams = [{ c: '#dc2626', turban: '#f8fafc' }, { c: '#facc15', turban: '#f8fafc' }];
  const ponies = ['#7c4a2a', '#4b3424', '#a16b3a', '#3a2a20'];
  const spots: [number, number, number, number][] = [[-0.07, 0.02, 1.2, 0], [0.04, -0.03, -1.9, 1], [-0.16, 0.06, 1.5, 0], [0.12, 0.05, -1.4, 1]];
  spots.forEach(([x, z, ry, t], i) => {
    const b = beast(fd, x, 0.002, z, ry, 0.1, { body: ponies[i], mane: '#1c1917', gait: 0.55, neckUp: 0.85 });
    blob(b, ['#dc2626', '#16a34a', '#2563eb', '#f59e0b'][i], 0, 0.86, 0.6, 0.075, 0.08, 0.1);
    for (const sx of [-1, 1]) blob(b, ['#facc15', '#f8fafc'][t], sx * 0.15, 0.55, 0.12, 0.03, 0.09, 0.14);
    const tm = teams[t];
    const r = rider(b, 0.62, { c: tm.c, b: '#f8fafc', legs: '#f8fafc', hands: [[-0.15, 0.6, 0.35], [0.3, 0.75, 0.1]], lean: 0.3, hat: (f) => { blob(f, tm.turban, 0, 0.97, 0, 0.13, 0.08, 0.13); dot(f, tm.c, 0, 1.03, 0.06, 0.04, 5); } });
    limb(r, [0.3, 0.75, 0.1], [0.55, -0.15 + (i % 2) * 0.6, 0.55], 0.02, '#a16207');
    add(r, BOXG(), mat('#a16207'), 0.56, -0.17 + (i % 2) * 0.6, 0.57, 0.18, 0.04, 0.04);
  });
  dot(fd, '#f8fafc', -0.02, 0.008, 0.06, 0.005, 6);
  // the pavilion (back left) with fans
  const pv = grp(gp, -0.15, Y0, -0.2);
  const q = new Quads();
  for (let r = 0; r < 4; r++) for (let i = 0; i < 16; i++) q.box(-0.16 + i * 0.02 + 0.01, r * 0.014, -r * 0.016, 0.02, 0.014, 0.016, hash3(i, r, 6) < 0.3 ? SK[2 + ((i + r) % 3)] : ['#f8fafc', '#dc2626', '#facc15', '#16a34a', '#ec4899'][(i * 7 + r) % 5]);
  q.mesh(pv);
  box(pv, '#e7e5e4', 0, 0, -0.07, 0.34, 0.08, 0.008);
  for (let i = 0; i < 6; i++) limb(pv, [-0.165 + i * 0.066, 0.056, 0.01], [-0.165 + i * 0.066, 0.1, 0.01], 0.003, '#f8fafc');
  const roof = gable(pv, 0.36, 0.035, 0.1, '#b91c1c', 0, 0.1, -0.03);
  roof.castShadow = true;
  // the Marjing polo statue on its hill (back right)
  const hy = Y0 + hill(0.3, -0.3);
  const st = grp(gp, 0.3, hy, -0.3, -0.6);
  box(st, '#e7e5e4', 0, 0, 0, 0.12, 0.03, 0.08);
  box(st, '#d6d3d1', 0, 0.03, 0, 0.09, 0.05, 0.05);
  const BR = '#8a6a3a';
  const sb = beast(st, 0, 0.08, 0, 0, 0.18, { body: BR, mane: '#6b4f2a', gait: 0.7, neckUp: 1.1 });
  const sr = rider(sb, 0.62, { c: BR, b: BR, legs: BR, skin: BR, hair: BR, shoes: BR, sleeve: BR, hands: [[-0.15, 0.6, 0.35], [0.35, 1.15, -0.1]], lean: 0.2, hat: (f) => blob(f, BR, 0, 0.97, 0, 0.13, 0.08, 0.13) });
  limb(sr, [0.35, 1.15, -0.1], [0.5, 1.7, -0.5], 0.025, '#6b4f2a');
  for (const [x, z] of [[0.2, -0.38], [0.4, -0.2], [0.16, -0.18]] as const) flag(gp, x, Y0 + hill(x, z), z, 0.07, ['#dc2626', '#facc15', '#16a34a'][Math.floor(x * 10) % 3], undefined, 0, 0.03);
  // spectators along the front, trees
  for (let i = 0; i < 14; i++) fan(gp, -0.32 + i * 0.045, Y0, 0.3 + (i % 2) * 0.02, 0.04, ['#f8fafc', '#ec4899', '#facc15', '#16a34a', '#f97316', '#38bdf8'][i % 6], i % 4 === 1);
  for (const [x, z, s] of [[-0.42, -0.1, 0.12], [-0.4, 0.2, 0.1], [0.42, 0.14, 0.11], [0.0, -0.4, 0.1], [-0.35, -0.3, 0.1], [0.42, -0.05, 0.1]] as const) leafy(gp, x, Y0, z, s, '#3f7d3a');
};

// =========================================================================================================
// MUAY THAI in Ayutthaya — a ring with red, blue and white corners and three ropes, two fighters with the
// mongkol headband and armbands (one throwing a high roundhouse kick), the referee, a little band playing
// pi and drums, and the three bell-shaped chedis of Wat Phra Si Sanphet behind.
// =========================================================================================================
const sp_muaythai: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#7aa04a', (x, _y, z) => {
    if (z > -0.18 && Math.abs(x) < 0.3) return shade('#c9b48a', 0.95 + hash3(x * 40, 0, z * 40) * 0.08);
    return shade('#6f9a45', 0.9 + fbm(x * 12, 0, z * 12, 2) * 0.2);
  });
  // the ring
  const rg = grp(gp, 0, Y0, 0.08);
  const S = 0.13, H = 0.04;
  box(rg, '#1e3a8a', 0, 0, 0, S * 2 + 0.03, H, S * 2 + 0.03);
  box(rg, '#93c5fd', 0, H, 0, S * 2 + 0.01, 0.004, S * 2 + 0.01);
  disc(rg, '#dc2626', 0, H + 0.004, 0, 0.04, 0.001, 16);
  disc(rg, '#facc15', 0, H + 0.0045, 0, 0.025, 0.001, 16);
  for (let k = 0; k < 4; k++) box(rg, '#1d4ed8', 0, H - 0.03 + k * 0.006, S + 0.016, S * 2 + 0.02, 0.003, 0.002);
  box(rg, '#f8fafc', 0, H - 0.024, S + 0.0165, 0.1, 0.012, 0.002);
  const corners: [number, number, string][] = [[-S, -S, '#dc2626'], [S, -S, '#2563eb'], [S, S, '#f8fafc'], [-S, S, '#f8fafc']];
  for (const [x, z, c] of corners) {
    pole(rg, [x, H, z], [x, H + 0.075, z], 0.005, '#d4d4d8');
    box(rg, c, x, H + 0.01, z, 0.014, 0.065, 0.014);
  }
  const rc = ['#dc2626', '#f8fafc', '#2563eb'];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4];
    for (let k = 0; k < 3; k++) limb(rg, [x0, H + 0.025 + k * 0.02, z0], [x1, H + 0.025 + k * 0.02, z1], 0.0018, rc[k]);
  }
  for (const [x, z] of [[-S - 0.03, 0.06], [S + 0.03, -0.05]] as const) for (let k = 0; k < 3; k++) box(rg, '#57534e', x, k * 0.013, z + (x < 0 ? 0 : 0), 0.03, 0.013, 0.03 - k * 0.008);
  // fighters
  const fighter = (c: string, sk: string): Pose => ({ c: sk, b: c, legs: sk, sleeve: sk, skin: sk, shoes: sk, hair: '#111111', hat: (f) => ringLine(f, 0, 0.98, 0, 0.11, 0.025, '#f8fafc', 10, 3) });
  const glove = (f: THREE.Group, h: V3, c: string) => blob(f, c, h[0], h[1], h[2], 0.075, 0.075, 0.09);
  const armband = (f: THREE.Group, c: string) => { for (const sx of [-1, 1]) blob(f, c, sx * 0.17, 0.72, 0.0, 0.05, 0.03, 0.05); };
  const kH: [V3, V3] = [[-0.12, 0.9, 0.18], [0.22, 0.55, -0.15]];
  const k1 = fig(rg, -0.03, H + 0.004, 0.0, Math.PI / 2, 0.075, { ...fighter('#dc2626', SK[2]), feet: [[-0.05, 0, -0.05], [0.12, 0.85, 0.42]], hands: kH, lean: -0.3 });
  glove(k1, kH[0], '#dc2626'); glove(k1, kH[1], '#dc2626'); armband(k1, '#dc2626');
  const bH: [V3, V3] = [[-0.1, 0.92, 0.18], [0.1, 0.95, 0.2]];
  const k2 = fig(rg, 0.05, H + 0.004, 0.0, -Math.PI / 2, 0.075, { ...fighter('#2563eb', SK[3]), feet: [[-0.1, 0, 0.1], [0.1, 0.12, -0.12]], hands: bH, lean: -0.1 });
  glove(k2, bH[0], '#2563eb'); glove(k2, bH[1], '#2563eb'); armband(k2, '#2563eb');
  fig(rg, 0.03, H + 0.004, -0.08, 0.3, 0.07, { c: '#f8fafc', b: '#111827', hands: [[-0.25, 0.6, 0.2], [0.25, 0.9, 0.2]] });
  // band: pi (oboe), two drums, cymbals
  const bd = grp(gp, -0.26, Y0, 0.22, 0.9);
  for (let i = 0; i < 3; i++) {
    const m = fig(bd, -0.04 + i * 0.04, 0, 0, 0, 0.05, { c: ['#7c3aed', '#f59e0b', '#16a34a'][i], b: '#7c2d12', skirt: '#7c2d12', feet: [[-0.15, 0, 0.2], [0.15, 0, 0.2]], hands: [[-0.12, 0.6, 0.3], [0.12, 0.6, 0.3]] });
    m.position.y = -0.016;
    if (i === 0) limb(m, [0, 0.82, 0.12], [0, 0.6, 0.45], 0.03, '#a16207');
    else add(bd, g('f2-klong', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 9)), mat('#92400e'), -0.04 + i * 0.04, 0.012, 0.025, 0.02, 0.03, 0.02, 0, 0, Math.PI / 2);
  }
  // the three chedis of Wat Phra Si Sanphet + brick ruins
  const chedi: [number, number][] = [[0.07, 0], [0.07, 0.014], [0.058, 0.014], [0.058, 0.028], [0.048, 0.028], [0.048, 0.04], [0.046, 0.044], [0.042, 0.075], [0.03, 0.098], [0.014, 0.108], [0.016, 0.112], [0.016, 0.126], [0.009, 0.13], [0.007, 0.17], [0.004, 0.2], [0, 0.215]];
  for (const [x, z, s] of [[-0.18, -0.3, 1], [0.0, -0.33, 1.05], [0.18, -0.3, 1]] as const) {
    const m = lathe(gp, chedi, '#9c9184', x, Y0, z, 12);
    m.scale.setScalar(s * 1.15);
    for (const [ox, oz] of [[0, 0.08], [0.08, 0], [-0.08, 0], [0, -0.08]] as const) box(gp, '#a36b4f', x + ox * s, Y0, z + oz * s, 0.016, 0.03, 0.016);
  }
  for (let i = 0; i < 8; i++) {
    const x = -0.36 + i * 0.1;
    box(gp, '#a36b4f', x, Y0, -0.2, 0.05, 0.02 + hash3(i, 1, 1) * 0.02, 0.012);
  }
  for (const [x, z] of [[-0.4, -0.08], [0.4, -0.12], [0.36, 0.06], [-0.38, 0.06]] as const) for (let k = 0; k < 2; k++) cyl(gp, '#a36b4f', x + k * 0.04, Y0, z, 0.009, 0.04 + k * 0.015, 6);
  // fans around the ring
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, x = Math.cos(a) * 0.25, z = 0.08 + Math.sin(a) * 0.23;
    if (z < -0.08 || (x < -0.15 && z > 0.12)) continue;
    fan(gp, x, Y0, z, 0.045, ['#dc2626', '#2563eb', '#facc15', '#f8fafc', '#16a34a'][i % 5], i % 3 === 0);
  }
  for (const [x, z, s] of [[0.42, 0.22, 0.2], [-0.42, -0.22, 0.2], [0.33, -0.36, 0.18]] as const) palm(gp, x, Y0, z, s);
};

// =========================================================================================================
// EDEN PARK (Auckland) — rugby stadium: striped pitch with try lines, 22s and padded H-posts; the All Blacks
// in black performing the haka facing their opponents in gold; covered stands, floodlights, and the grassy
// volcanic cone of Maungawhau / Mt Eden behind.
// =========================================================================================================
const sp_rugby: Builder = (gp) => {
  const Y0 = 0.03;
  const cone_ = (x: number, z: number) => { const d = Math.hypot(x + 0.28, z + 0.3); return d < 0.17 ? 0.13 * sm(0.17, 0.05, d) - (d < 0.04 ? 0.03 * sm(0.04, 0.0, d) : 0) : 0; };
  base(gp, 0.5, '#5f9a3e', (x, y, z) => (y > Y0 + 0.02 ? shade('#4f8a3a', 0.9 + fbm(x * 20, 1, z * 20, 2) * 0.2) : shade('#6b7a5a', 0.95 + hash3(x * 40, 0, z * 40) * 0.08)), 0.03, cone_, 14, 48);
  const st = grp(gp, 0.07, Y0, 0.06, 0, 0.9);
  const A = 0.2, B = 0.13, plan = supPlan(A, B, 7);
  turf(st, (x, z) => Math.abs(x) < A && Math.abs(z) < B, A, B, 20, 0.002, mow('#4ea043', 0.025, true, 0.14));
  const TL = 0.16, PW = 0.1;
  for (const s of [-1, 1]) {
    line(st, s * TL, -PW, s * TL, PW, 0.002, 0.0035);
    line(st, s * 0.19, -PW, s * 0.19, PW, 0.002, 0.003);
    line(st, s * 0.105, -PW, s * 0.105, PW, 0.002, 0.003);
    line(st, -0.19, s * PW, 0.19, s * PW, 0.002, 0.003);
    for (let k = 0; k < 5; k++) line(st, s * 0.04 - 0.004, -PW + k * 0.05, s * 0.04 - 0.004, -PW + k * 0.05 + 0.02, 0.002, 0.002);
    // H-posts with padding
    for (const sz of [-1, 1]) {
      pole(st, [s * TL, 0, sz * 0.016], [s * TL, 0.13, sz * 0.016], 0.0025, '#f8fafc');
      box(st, '#1d4ed8', s * TL, 0.002, sz * 0.016, 0.012, 0.025, 0.012);
    }
    pole(st, [s * TL, 0.04, -0.016], [s * TL, 0.04, 0.016], 0.002, '#f8fafc');
  }
  line(st, 0, -PW, 0, PW, 0.002, 0.004);
  // stands: tall roofed back + sides, low front
  const seat = crowd(['#111827', '#111827', '#f8fafc', '#facc15', '#1f2937', '#94a3b8'], '#475569', 0.94, 11);
  stands(st, plan, { t0: 0.42, t1: 1.08, n: 48, rows: 8, off0: 0.008, dr: 0.017, y0: 0.012, dh: 0.013, seat, riser: '#6b7280', wall: '#d1d5db', back: (_t, y) => (y > 0.05 ? '#e5e7eb' : '#9ca3af'), backH: 0.025 });
  stands(st, plan, { t0: 0.08, t1: 0.42, n: 20, rows: 2, off0: 0.008, dr: 0.017, y0: 0.012, dh: 0.012, seat, riser: '#6b7280', wall: '#d1d5db', back: () => '#9ca3af', backH: 0.004 });
  const q = new Quads(), RY = 0.15;
  for (let i = 0; i < 40; i++) {
    const ta = 0.42 + (0.66 * i) / 40, tb = 0.42 + (0.66 * (i + 1)) / 40;
    const P = (t: number, off: number, y: number): Q => { const [x, z] = plan(t, off); return [x, y, z]; };
    q.quad(P(ta, 0.07, RY + 0.012), P(tb, 0.07, RY + 0.012), P(tb, 0.15, RY), P(ta, 0.15, RY), '#f1f5f9', [0, 1, 0]);
    q.quad(P(ta, 0.07, RY + 0.012), P(tb, 0.07, RY + 0.012), P(tb, 0.15, RY), P(ta, 0.15, RY), '#94a3b8', [0, -1, 0]);
  }
  q.mesh(st);
  for (const [x, z, ry] of [[-0.27, -0.2, 0.8], [0.27, -0.2, -0.8], [-0.29, 0.17, 2.4], [0.29, 0.17, -2.4]] as const) mast(st, x, 0, z, 0.26, ry, 0.06);
  // the haka: All Blacks in a staggered line facing the opponents
  const AB: Pose = { c: '#111827', b: '#111827', legs: '#111827', shoes: '#111827', sleeve: '#111827', feet: [[-0.17, 0, 0.05], [0.17, 0, 0.05]], hands: [[-0.25, 0.72, 0.18], [0.25, 0.7, 0.2]], lean: 0.15 };
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 5), k = i % 5;
    const f = fig(st, -0.05 - r * 0.035, 0.002, -0.07 + k * 0.035 + r * 0.017, Math.PI / 2, 0.05, { ...AB, skin: SK[2 + (i % 3)], hands: i % 2 ? [[-0.25, 0.72, 0.18], [0.25, 0.7, 0.2]] : [[-0.2, 0.5, 0.25], [0.28, 0.95, 0.05]] });
    box(f, '#f8fafc', 0.0, 0.7, 0.1, 0.06, 0.06, 0.01);
  }
  for (let i = 0; i < 7; i++) fig(st, 0.06, 0.002, -0.06 + i * 0.02, -Math.PI / 2, 0.05, { c: '#facc15', b: '#14532d', legs: '#facc15', shoes: '#111827', sleeve: '#facc15', hands: [[-0.08, 0.6, 0.15], [0.08, 0.6, 0.15]] });
  blob(st, '#f8fafc', 0.0, 0.008, 0.05, 0.006, 0.005, 0.009);
  // outside: trees, Mt Eden cone with summit path
  for (const [x, z, s] of [[0.4, 0.26, 0.1], [-0.42, 0.18, 0.11], [0.42, -0.24, 0.1], [-0.12, -0.42, 0.1]] as const) leafy(gp, x, Y0, z, s, '#3f7d3a');
  ringLine(gp, -0.28, Y0 + 0.098, -0.3, 0.045, 0.004, '#a3a37a', 18);
};

// =========================================================================================================
// CAMEL RACING at Al-Shahaniya (Qatar) — a sandy oval track with white rails, racing camels ridden by little
// remote-controlled robot jockeys in bright silks, the owners' white SUVs following on the inside road, a
// white arched grandstand with battlements, palms and the maroon-and-white flag.
// =========================================================================================================
const sp_camelrace: Builder = (gp) => {
  const Y0 = 0.03, SAND = '#dcb985';
  base(gp, 0.5, SAND, (x, _y, z) => shade(SAND, 0.92 + fbm(x * 10, 2, z * 10, 2) * 0.12 + Math.sin(x * 30 + z * 12) * 0.02), 0.03, (x, z) => 0.02 * fbm(x * 4, 0, z * 4, 2) * sm(0.32, 0.48, Math.hypot(x, z)), 10, 48, '#b48a5a');
  const tr = grp(gp, 0, Y0, 0.04);
  const A = 0.4, B = 0.26, w = 0.07;
  const pl = supPlan(A - w, B - w, 2.6), po = supPlan(A, B, 2.6);
  const tq = new Quads(), rq = new Quads();
  for (let i = 0; i < 60; i++) {
    const ta = i / 60, tb = (i + 1) / 60;
    const P = (pp: Plan, t: number, off: number, y: number): Q => { const [x, z] = pp(t, off); return [x, y, z]; };
    tq.quad(P(pl, ta, 0, 0.002), P(pl, tb, 0, 0.002), P(po, tb, 0, 0.002), P(po, ta, 0, 0.002), shade('#c9a06a', 0.95 + hash3(i, 0, 1) * 0.08), [0, 1, 0]);
    for (const pp of [pl, po]) {
      const [mx, mz] = pp((ta + tb) / 2, 0), wnt: Q = [mx, 0, mz];
      rq.quad(P(pp, ta, 0, 0.016), P(pp, tb, 0, 0.016), P(pp, tb, 0, 0.022), P(pp, ta, 0, 0.022), '#f8fafc', wnt);
      rq.quad(P(pp, ta, 0, 0.016), P(pp, tb, 0, 0.016), P(pp, tb, 0, 0.022), P(pp, ta, 0, 0.022), '#e5e7eb', [-mx, 0, -mz]);
      if (i % 3 === 0) { const [x, z] = pp(ta, 0); rq.box(x, 0, z, 0.004, 0.02, 0.004, '#f8fafc'); }
    }
  }
  tq.mesh(tr); rq.mesh(tr);
  // inside road with the SUVs
  const ri = supPlan(A - w - 0.035, B - w - 0.035, 2.6);
  const iq = new Quads();
  for (let i = 0; i < 48; i++) {
    const ta = i / 48, tb = (i + 1) / 48;
    const P = (t: number, off: number): Q => { const [x, z] = ri(t, off); return [x, 0.0025, z]; };
    iq.quad(P(ta, -0.016), P(tb, -0.016), P(tb, 0.016), P(ta, 0.016), '#6b6b6b', [0, 1, 0]);
  }
  iq.mesh(tr);
  const suv = (t: number, c: string) => {
    const [x, z] = ri(t, 0), [x2, z2] = ri(t + 0.01, 0);
    const f = grp(tr, x, 0.003, z, Math.atan2(x2 - x, z2 - z));
    box(f, c, 0, 0.007, 0, 0.024, 0.014, 0.05);
    box(f, c, 0, 0.021, -0.004, 0.022, 0.01, 0.03);
    box(f, '#1e293b', 0, 0.022, -0.004, 0.0225, 0.007, 0.031);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) wheel(f, sx * 0.012, 0.007, sz * 0.016, 0.007, 0.006);
  };
  // camels with robot jockeys
  const silks = ['#dc2626', '#2563eb', '#facc15', '#16a34a', '#ec4899'];
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + i * 0.022 + (i % 2) * 0.006, [x, z] = po(t, -0.025 - (i % 3) * 0.015), [x2, z2] = po(t + 0.01, -0.025);
    const c = beast(tr, x, 0.002, z, Math.atan2(x2 - x, z2 - z), 0.1, { body: ['#c8a274', '#b88b5c', '#d6b88f', '#a7774a', '#c39a6b'][i], hump: true, gait: 0.7 });
    const by = c.userData.bodyY as number;
    box(c, silks[i], 0, by + 0.22, 0.0, 0.16, 0.1, 0.14);
    box(c, '#e5e7eb', 0, by + 0.32, 0.02, 0.1, 0.12, 0.1);
    box(c, silks[(i + 2) % 5], 0, by + 0.44, 0.02, 0.11, 0.05, 0.11);
    limb(c, [0, by + 0.44, -0.02], [0, by + 0.62, -0.06], 0.008, '#111827');
    limb(c, [0.06, by + 0.36, 0.02], [0.18, by + 0.42, -0.2], 0.012, '#111827');
    blob(c, '#7c2d12', 0, by + 0.18, -0.05, 0.12, 0.04, 0.18);
  }
  suv(0.24, '#f8fafc'); suv(0.215, '#e5e7eb'); suv(0.19, '#f8fafc');
  // the grandstand (back) — white with pointed arches and crenellations
  const gs = grp(gp, 0.0, Y0, -0.27);
  box(gs, '#f5f0e6', 0, 0, 0, 0.36, 0.07, 0.07);
  const q = new Quads();
  for (let i = 0; i < 9; i++) {
    q.box(-0.16 + i * 0.04, 0.012, 0.035, 0.022, 0.04, 0.003, '#7a6a55');
    q.box(-0.16 + i * 0.04, 0.052, 0.035, 0.012, 0.008, 0.003, '#7a6a55');
  }
  for (let i = 0; i < 18; i++) q.box(-0.17 + i * 0.02, 0.07, 0.03, 0.01, 0.012, 0.01, '#f5f0e6');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 14; i++) q.box(-0.13 + i * 0.02, 0.07 + r * 0.008, -0.005 - r * 0.012, 0.02, 0.008, 0.012, hash3(i, r, 2) < 0.6 ? '#f8fafc' : '#8a1538');
  q.mesh(gs);
  box(gs, '#f8fafc', 0, 0.12, -0.012, 0.3, 0.005, 0.05);
  for (const s of [-1, 1]) {
    box(gs, '#f5f0e6', s * 0.19, 0, 0, 0.04, 0.12, 0.04);
    add(gs, g('f2-cdome', () => new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2)), mat('#d4af37', { metal: 0.5 }), s * 0.19, 0.12, 0, 0.02, 0.025, 0.02);
  }
  // Qatar flags, palms, a few spectators on the sand
  for (const [x, z] of [[-0.12, -0.36], [0.12, -0.36]] as const) {
    limb(gp, [x, Y0, z], [x, Y0 + 0.2, z], 0.003, '#e5e7eb');
    box(gp, '#8a1538', x + 0.03, Y0 + 0.16, z, 0.05, 0.035, 0.002);
    box(gp, '#f8fafc', x + 0.008, Y0 + 0.16, z, 0.016, 0.035, 0.0025);
  }
  for (const [x, z, s] of [[-0.38, -0.28, 0.2], [0.38, -0.28, 0.2], [0.0, 0.05, 0.16], [-0.12, 0.1, 0.13], [0.13, 0.08, 0.14]] as const) palm(gp, x, Y0, z, s);
  for (let i = 0; i < 6; i++) fig(gp, -0.1 + i * 0.035, Y0, -0.14, Math.PI * 0.95, 0.042, { c: '#f8fafc', skirt: '#f8fafc', b: '#f8fafc', hat: (f) => blob(f, i % 2 ? '#f8fafc' : '#dc2626', 0, 0.94, -0.02, 0.13, 0.07, 0.13), noHair: true });
};

const RAINBOW = ['#dc2626', '#f97316', '#facc15', '#16a34a', '#0ea5e9', '#2563eb', '#7c3aed'];
/** Striped rainbow flag on a pole (Cusco flag). */
function rainbowFlag(p: THREE.Object3D, x: number, y: number, z: number, h: number, w = 0.05, ry = 0): void {
  limb(p, [x, y, z], [x, y + h, z], 0.0028, '#e5e7eb');
  const f = grp(p, x, y + h, z, ry), sh = (w * 0.66) / 7;
  for (let k = 0; k < 7; k++) box(f, RAINBOW[k], w / 2, -sh * (k + 1), 0, w, sh, 0.002);
}
/** Torch: stick + flame. */
function torch(p: THREE.Object3D, a: V3, b: V3, s: number): void {
  limb(p, a, b, s * 0.06, '#5b4636');
  flame(p, b[0], b[1], b[2], s * 0.4);
}

// =========================================================================================================
// INTI RAYMI — the Festival of the Sun at Sacsayhuamán above Cusco: three tiers of zig-zag walls of giant
// fitted stones, the Sapa Inca carried on a golden litter, a huge golden sun disc, dancers in red, orange
// and yellow, rainbow flags, crowds on the walls and a couple of curious llamas.
// =========================================================================================================
const fe_intiraymi: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#7a9a4a', (x, _y, z) => shade(z > -0.1 ? '#86a552' : '#6f8f44', 0.9 + fbm(x * 12, 0, z * 12, 2) * 0.2));
  // the zig-zag walls (front tier lowest)
  const q = new Quads(), TH = 0.04;
  for (let k = 0; k < 3; k++) {
    const zb = -0.14 - k * 0.075, y0 = Y0 + k * TH, n = 11;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) { const x = -0.5 + (i / n) * 1.0; pts.push([x, zb + (i % 2 ? 0.035 : -0.0)]); }
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const lim = (x: number, z: number) => Math.hypot(x, z) < 0.49;
      if (!lim(x0, z0) && !lim(x1, z1)) continue;
      const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      let u = 0, j = 0;
      while (u < len - 0.004) {
        const w = Math.min(len - u, 0.022 + hash3(i, j, k) * 0.03), t = (u + w / 2) / len;
        const sx = x0 + (x1 - x0) * t + nx * 0.004, sz = z0 + (z1 - z0) * t + nz * 0.004;
        const split = 0.35 + hash3(j, i, k + 3) * 0.3;
        const big = hash3(i, j, 9) > 0.7;
        if (Math.hypot(sx, sz) > 0.475) { u += w; j++; continue; }
        const c1 = shade('#a8a196', 0.85 + hash3(j, k, i) * 0.25), c2 = shade('#9a9488', 0.85 + hash3(k, j, i) * 0.25);
        if (big) q.box(sx, y0 - 0.005, sz, w - 0.002, TH + 0.003, 0.012, c1, ry, shade(c1, 1.05));
        else {
          q.box(sx, y0 - 0.005, sz, w - 0.002, TH * split, 0.012, c1, ry, shade(c1, 1.05));
          q.box(sx, y0 - 0.005 + TH * split + 0.001, sz, w - 0.002, TH * (1 - split) + 0.002, 0.012, c2, ry, shade(c2, 1.05));
        }
        u += w; j++;
      }
      // grassy terrace on top of this wall reaching back to the next one
      const back = 0.075;
      const P = (x0_: number, z: number, dz: number): Q => { const x = Math.max(-0.46, Math.min(0.46, x0_)); const zz = Math.max(z - dz, -Math.sqrt(0.48 * 0.48 - x * x)); return [x, y0 + TH - 0.001, Math.min(zz, z)]; };
      q.quad(P(x0, z0, 0), P(x1, z1, 0), P(x1, z1, k === 2 ? 0.5 : back + 0.04), P(x0, z0, k === 2 ? 0.5 : back + 0.04), shade('#6f8f44', 0.92 + hash3(i, k, 1) * 0.12), [0, 1, 0]);
    }
  }
  q.mesh(gp);
  // the sun disc and the usnu platform
  const sx = 0.0, sz = -0.06;
  box(gp, '#9a9488', sx, Y0, sz, 0.14, 0.025, 0.08);
  box(gp, '#a8a196', sx, Y0 + 0.025, sz - 0.01, 0.09, 0.02, 0.05);
  limb(gp, [sx, Y0 + 0.045, sz - 0.02], [sx, Y0 + 0.12, sz - 0.02], 0.004, '#a16207');
  const sun = grp(gp, sx, Y0 + 0.16, sz - 0.02);
  glow(add(sun, g('f2-disc16', () => new THREE.CylinderGeometry(1, 1, 1, 16)), mat('#facc15'), 0, 0, 0, 0.055, 0.008, 0.055, 0, Math.PI / 2), '#facc15', '#ca8a04');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    glow(add(sun, BOXG(), mat('#f59e0b'), Math.cos(a) * 0.068, Math.sin(a) * 0.068, 0, 0.026, 0.008, 0.004, 0, 0, a), '#f59e0b', '#b45309');
  }
  disc(sun, '#b45309', 0, 0, 0.004, 0.022, 0.002, 12).rotation.x = Math.PI / 2;
  fig(gp, sx + 0.03, Y0 + 0.045, sz, 0, 0.05, { c: '#dc2626', b: '#f59e0b', skirt: '#f59e0b', hands: [[-0.25, 1.1, 0.1], [0.25, 1.1, 0.1]], hat: (f) => { blob(f, '#facc15', 0, 1.0, 0, 0.12, 0.06, 0.12); for (const s of [-1, 1]) box(f, '#f8fafc', s * 0.03, 1.02, -0.02, 0.03, 0.25, 0.02); } });
  // the Sapa Inca on his golden litter, carried by bearers
  const lt = grp(gp, -0.12, Y0, 0.14, 0.4);
  for (const s of [-1, 1]) limb(lt, [s * 0.035, 0.05, -0.1], [s * 0.035, 0.05, 0.1], 0.004, '#a16207');
  glow(box(lt, '#eab308', 0, 0.05, 0, 0.06, 0.012, 0.08), '#eab308', '#713f12');
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) limb(lt, [x * 0.026, 0.062, z * 0.034], [x * 0.026, 0.11, z * 0.034], 0.002, '#eab308');
  glow(box(lt, '#eab308', 0, 0.11, 0, 0.06, 0.006, 0.08), '#eab308', '#713f12');
  for (let i = 0; i < 6; i++) dot(lt, RAINBOW[i], -0.03 + i * 0.012, 0.106, 0.041, 0.004, 5);
  fig(lt, 0, 0.062, 0.0, 0, 0.045, { c: '#b91c1c', b: '#facc15', skirt: '#facc15', feet: [[-0.1, 0.15, 0.25], [0.1, 0.15, 0.25]], hands: [[-0.25, 0.75, 0.15], [0.22, 0.95, 0.1]], hat: (f) => { blob(f, '#facc15', 0, 1.0, 0, 0.12, 0.06, 0.12); box(f, '#f8fafc', 0, 1.03, -0.02, 0.05, 0.22, 0.02); } });
  for (const [x, z] of [[-0.045, -0.08], [0.045, -0.08], [-0.045, 0.08], [0.045, 0.08]] as const) fig(lt, x, 0, z, 0, 0.05, { c: '#ea580c', b: '#7c2d12', hands: [[-0.15, 1.0, 0], [0.15, 1.0, 0]], hat: (f) => blob(f, '#facc15', 0, 0.98, 0, 0.12, 0.05, 0.12) });
  // dancers in rows, women in layered skirts
  const tun = ['#dc2626', '#f97316', '#facc15', '#be123c'];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
    const x = 0.06 + i * 0.045, z = 0.07 + r * 0.07;
    const woman = (i + r) % 2 === 0;
    fig(gp, x, Y0, z, -0.3, 0.05, { c: tun[(i + r) % 4], b: '#1f2937', skirt: woman ? ['#be185d', '#16a34a', '#2563eb'][i % 3] : undefined, hands: i % 2 ? CHEER.hands : [[-0.28, 0.7, 0.05], [0.28, 0.7, 0.05]], hat: (f) => { blob(f, woman ? '#1f2937' : '#facc15', 0, 0.99, 0, 0.13, 0.04, 0.13); if (!woman) box(f, RAINBOW[i % 7], 0, 1.0, -0.06, 0.04, 0.18, 0.02); } });
  }
  // rainbow flags, spectators on the walls, llamas
  for (const [x, z] of [[-0.3, -0.05], [0.3, -0.06], [-0.1, -0.13], [0.14, -0.13]] as const) rainbowFlag(gp, x, Y0, z, 0.12);
  for (let i = 0; i < 18; i++) {
    const k = i % 3, x = -0.38 + Math.floor(i / 3) * 0.14 + k * 0.03, z = -0.17 - k * 0.075 - 0.02;
    if (Math.hypot(x, z) > 0.46) continue;
    fan(gp, x, Y0 + (k + 1) * TH, z, 0.04, ['#dc2626', '#facc15', '#16a34a', '#2563eb', '#f8fafc', '#ec4899'][i % 6], i % 4 === 0);
  }
  for (const [x, z, ry, c] of [[-0.34, 0.2, 0.8, '#f5f0e6'], [-0.27, 0.28, 1.2, '#8a6a4a']] as const) {
    const l = beast(gp, x, Y0, z, ry, 0.07, { body: c, neckUp: 1.5, gait: 0.15 });
    blob(l, '#dc2626', 0, 0.98, 0.5, 0.03, 0.03, 0.03);
  }
  for (let i = 0; i < 10; i++) fan(gp, -0.4 + i * 0.07, Y0, 0.36 + (i % 2) * 0.03, 0.04, ['#0ea5e9', '#f8fafc', '#dc2626', '#facc15', '#16a34a'][i % 5], i % 3 === 0);
};

// =========================================================================================================
// UP HELLY AA (Lerwick, Shetland) — the Jarl squad in winged helmets with round shields and axes, a ring of
// torch-bearers around the Viking galley with its dragon-head prow, round shields and striped sail, and the
// flames just catching at the stern; grey stone houses with slate roofs behind.
// =========================================================================================================
const fe_uphellyaa: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#4b5563', (x, _y, z) => (z < -0.3 ? shade('#4f6b45', 0.9 + fbm(x * 10, 0, z * 10, 2) * 0.2) : shade(Math.hypot(x - 0.02, z + 0.02) < 0.2 ? '#57534e' : '#4b5563', 0.9 + hash3(x * 60, 0, z * 60) * 0.12)));
  // houses
  const hp = ['#a8a29e', '#9ca3af', '#d6d3d1', '#b8b2a7', '#e7e5e4'];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.86 + i * 0.12 * Math.PI, r = 0.4;
    house(gp, Math.cos(a) * r, Y0, Math.sin(a) * r * 0.9, -a - Math.PI / 2, 0.08, 0.07 + (i % 2) * 0.02, 0.06, hp[i % 5], '#334155', i % 3 ? '#fde68a' : '#475569', '#f8fafc');
  }
  // the galley
  const gl = grp(gp, 0.02, Y0, -0.04, -0.25, 1.55);
  prism(gl, [[-0.035, -0.17], [0.035, -0.17], [0.05, -0.08], [0.05, 0.08], [0.0, 0.2], [-0.05, 0.08], [-0.05, -0.08]], 0, 0.04, '#5b3a22', 0, true);
  for (let k = 0; k < 3; k++) box(gl, '#3f2817', 0, 0.01 + k * 0.01, 0, 0.102, 0.002, 0.2);
  const neck: V3[] = [[0, 0.03, 0.18], [0, 0.07, 0.22], [0, 0.11, 0.23], [0, 0.13, 0.21]];
  for (let i = 0; i < 3; i++) limb(gl, neck[i], neck[i + 1], 0.018 - i * 0.003, '#166534');
  blob(gl, '#166534', 0, 0.135, 0.225, 0.016, 0.014, 0.03);
  blob(gl, '#dc2626', 0, 0.128, 0.25, 0.006, 0.003, 0.012);
  for (const s of [-1, 1]) { dot(gl, '#facc15', s * 0.012, 0.142, 0.235, 0.004, 5); box(gl, '#166534', s * 0.008, 0.148, 0.212, 0.004, 0.018, 0.004); }
  limb(gl, [0, 0.03, -0.16], [0, 0.1, -0.21], 0.012, '#166534');
  blob(gl, '#166534', 0, 0.11, -0.205, 0.012, 0.022, 0.01);
  const shc = ['#dc2626', '#facc15', '#f8fafc', '#2563eb', '#16a34a'];
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = -0.1 + i * 0.038, x = s * (z > 0.08 ? 0.05 - (z - 0.08) * 0.4 : 0.05) + s * 0.004;
    const sh = add(gl, g('f2-shield', () => new THREE.CylinderGeometry(1, 1, 1, 10)), mat(shc[(i + (s > 0 ? 2 : 0)) % 5]), x, 0.03, z, 0.016, 0.003, 0.016, 0, 0, Math.PI / 2);
    sh.rotation.y = 0;
    dot(gl, '#d4d4d8', x + s * 0.002, 0.03, z, 0.004, 5);
  }
  limb(gl, [0, 0.04, 0.0], [0, 0.22, 0.0], 0.004, '#3f2817');
  limb(gl, [-0.06, 0.2, 0.0], [0.06, 0.2, 0.0], 0.003, '#3f2817');
  for (let k = 0; k < 6; k++) box(gl, k % 2 ? '#dc2626' : '#f8fafc', -0.055 + k * 0.0183, 0.09, 0.0, 0.0183, 0.11, 0.002);
  // fire catching at the stern
  flame(gl, 0.0, 0.035, -0.12, 0.08);
  flame(gl, 0.02, 0.035, -0.1, 0.06);
  flame(gl, -0.02, 0.035, -0.14, 0.055);
  // ring of guizers with torches around the galley
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2, x = 0.02 + Math.cos(a) * 0.32, z = -0.04 + Math.sin(a) * 0.25;
    if (Math.hypot(x, z) > 0.45) continue;
    const f = fig(gp, x, Y0, z, Math.atan2(0.02 - x, -0.04 - z), 0.055, { c: ['#111827', '#7c2d12', '#1e3a8a', '#4c1d95'][i % 4], b: '#1f2937', hands: [[-0.2, 0.42, 0.05], [0.16, 0.9, 0.15]] });
    torch(f, [0.16, 0.8, 0.15], [0.2, 1.35, 0.25], 0.5);
  }
  // the Jarl squad marching in front: winged helmets, shields, axes, red cloaks
  for (let i = 0; i < 6; i++) {
    const x = -0.17 + i * 0.07, z = 0.29 + (i % 2) * 0.03;
    const jarl = i === 2;
    const f = fig(gp, x, Y0, z, 0.15, jarl ? 0.07 : 0.06, { c: '#9ca3af', b: '#7c2d12', legs: '#7c2d12', sleeve: '#78716c', hands: [[-0.22, 0.55, 0.15], [0.2, 0.95, 0.1]], hat: (ff) => {
      blob(ff, '#d4d4d8', 0, 0.97, 0, 0.12, 0.08, 0.12);
      for (const s of [-1, 1]) box(ff, '#f8fafc', s * 0.12, 1.0, -0.02, 0.03, 0.2, 0.1, 0, 0, -s * 0.5);
    } });
    blob(f, '#b91c1c', 0, 0.62, -0.1, 0.17, 0.27, 0.04);
    add(f, g('f2-shield', () => new THREE.CylinderGeometry(1, 1, 1, 10)), mat(jarl ? '#facc15' : shc[i % 5]), -0.25, 0.55, 0.18, 0.17, 0.03, 0.17, 0, Math.PI / 2);
    dot(f, '#d4d4d8', -0.25, 0.55, 0.2, 0.04, 5);
    limb(f, [0.2, 0.95, 0.1], [0.2, 1.4, 0.0], 0.025, '#5b4636');
    blob(f, '#e5e7eb', 0.25, 1.35, 0.0, 0.08, 0.06, 0.02);
    if (jarl) torch(f, [-0.2, 0.55, 0.15], [-0.3, 1.0, 0.25], 0.6);
  }
  // spectators along the barrier
  for (let i = 0; i < 10; i++) fan(gp, -0.27 + i * 0.06, Y0, 0.43 - Math.abs(i - 6) * 0.012, 0.045, ['#1e3a8a', '#7f1d1d', '#374151', '#065f46', '#f8fafc'][i % 5], i % 4 === 2);
  box(gp, '#d4d4d8', -0.0, Y0, 0.4, 0.5, 0.015, 0.006);
};

// =========================================================================================================
// TRINIDAD CARNIVAL (Port of Spain) — masqueraders in sparkling costumes with giant feathered back-pieces
// parading down the street, a steel band playing pans, the music truck stacked with speakers, gingerbread
// houses with white fretwork, palms and the red-black-white flag.
// =========================================================================================================
const fe_trinidad: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#7a9a4a', (x, _y, z) => shade('#7a9a4a', 0.9 + fbm(x * 12, 0, z * 12, 2) * 0.2));
  // the street (diagonal) with kerbs
  const st = grp(gp, 0, Y0, 0.02, 0.25);
  box(st, '#d6d3d1', 0, 0, 0, 0.9, 0.004, 0.3);
  box(st, '#4b5563', 0, 0.001, 0, 0.92, 0.004, 0.22);
  for (let i = 0; i < 8; i++) box(st, '#facc15', -0.42 + i * 0.12, 0.005, 0, 0.06, 0.0015, 0.005);
  // gingerbread houses (back side of street)
  const hp = ['#fde68a', '#a5f3fc', '#fbcfe8', '#bbf7d0', '#fed7aa'];
  for (let i = 0; i < 5; i++) {
    const x = -0.32 + i * 0.16;
    const f = house(st, x, 0, -0.22, 0, 0.12, 0.08, 0.07, hp[i], '#b91c1c', '#7c2d12', '#f8fafc');
    box(f, '#f8fafc', 0, 0.04, 0.045, 0.12, 0.004, 0.02);
    for (let k = 0; k < 6; k++) box(f, '#f8fafc', -0.05 + k * 0.02, 0.0, 0.054, 0.003, 0.04, 0.003);
    for (let k = 0; k < 10; k++) cone(f, '#f8fafc', -0.054 + k * 0.012, 0.072, 0.036, 0.004, 0.008, 4);
  }
  // masqueraders with feather back-pieces
  const pal = [['#f97316', '#facc15'], ['#ec4899', '#a855f7'], ['#22d3ee', '#2563eb'], ['#facc15', '#dc2626'], ['#22c55e', '#facc15'], ['#f43f5e', '#f97316']];
  for (let i = 0; i < 8; i++) {
    const x = -0.34 + i * 0.085, z = (i % 2 ? 0.04 : -0.04);
    const [c1, c2] = pal[i % pal.length];
    const f = fig(st, x, 0.004, z, 0.4 + (hash3(i, 1, 1) - 0.5) * 0.6, 0.064, { c: c1, b: c1, legs: SK[2 + (i % 3)], sleeve: SK[2 + (i % 3)], ...(i % 2 ? CHEER : { hands: [[-0.35, 0.8, 0.0], [0.35, 0.8, 0.0]] as [V3, V3] }), lean: -0.05 });
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI * 0.45 + (k / 8) * Math.PI * 0.9, L = k % 2 ? 0.7 : 0.9;
      const fe = add(f, BOXG(), mat(k % 2 ? c2 : c1), Math.sin(a) * L * 0.5, 0.75 + Math.cos(a) * L * 0.5, -0.12, 0.08, L, 0.02, 0, 0, -a);
      fe.castShadow = false;
    }
    glow(blob(f, '#fde047', 0, 0.75, -0.11, 0.12, 0.12, 0.03), '#fde047', '#a16207');
    blob(f, c2, 0, 1.03, 0, 0.13, 0.05, 0.13);
  }
  // King costume: a giant moving sculpture
  const kg = grp(st, 0.36, 0.004, 0.0, -0.4);
  fig(kg, 0, 0, 0, 0, 0.066, { c: '#facc15', b: '#facc15', ...CHEER });
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * Math.PI, R = 0.12;
    const fe = add(kg, BOXG(), mat(RAINBOW[k % 7], { emissive: k % 3 === 0 ? RAINBOW[k % 7] : undefined }), Math.cos(a) * R * 0.5, 0.03 + Math.sin(a) * R * 0.6, -0.02, 0.01, R, 0.004, 0, 0, a - Math.PI / 2);
    fe.castShadow = false;
  }
  // steel band on a rack (front)
  const sb = grp(gp, -0.15, Y0, 0.3, 0.15);
  box(sb, '#1f2937', 0, 0, 0, 0.28, 0.012, 0.11);
  for (const s of [-1, 1]) for (const z of [-1, 1]) limb(sb, [s * 0.13, 0.012, z * 0.05], [s * 0.13, 0.11, z * 0.05], 0.003, '#94a3b8');
  for (const z of [-1, 1]) box(sb, '#facc15', 0, 0.11, z * 0.05, 0.27, 0.006, 0.006);
  for (let i = 0; i < 6; i++) {
    const x = -0.11 + (i % 3) * 0.11, z = i < 3 ? -0.025 : 0.03;
    add(sb, g('f2-pan', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12)), mat('#d1d5db', { metal: 0.75, rough: 0.25 }), x, 0.04, z + 0.02, 0.034, 0.012, 0.034, 0, 0.35);
    limb(sb, [x, 0.012, z + 0.02], [x, 0.035, z + 0.02], 0.002, '#64748b');
    fig(sb, x, 0.012, z - 0.012, 0, 0.05, { c: ['#dc2626', '#f8fafc', '#111827'][i % 3], b: '#111827', skin: SK[3 + (i % 2)], hands: [[-0.12, 0.6, 0.38], [0.12, 0.65, 0.36]] });
  }
  // music truck (back right)
  const tk = grp(gp, 0.28, Y0, -0.06, 0.25 + Math.PI);
  box(tk, '#f8fafc', 0, 0.012, 0.11, 0.08, 0.06, 0.05);
  box(tk, '#1e293b', 0, 0.045, 0.136, 0.07, 0.02, 0.002);
  box(tk, '#475569', 0, 0.012, -0.03, 0.09, 0.012, 0.22);
  for (const [z, w] of [[0.1, 0], [-0.08, 0], [0.02, 0]] as const) for (const s of [-1, 1]) wheel(tk, s * 0.045, 0.012, z, 0.012, 0.008 + w);
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    box(tk, '#111827', s * 0.028, 0.024 + k * 0.04, -0.06, 0.035, 0.04, 0.05);
    for (let j = 0; j < 2; j++) disc(tk, '#374151', s * 0.028, 0.034 + k * 0.04 + j * 0.018, -0.034, 0.008, 0.002, 8).rotation.x = Math.PI / 2;
  }
  fig(tk, 0, 0.024, 0.04, Math.PI, 0.045, { c: '#facc15', b: '#111827', ...CHEER });
  // flags, palms, spectators
  for (const [x, z] of [[-0.42, -0.04], [0.06, -0.38]] as const) {
    limb(gp, [x, Y0, z], [x, Y0 + 0.16, z], 0.003, '#e5e7eb');
    box(gp, '#dc2626', x + 0.03, Y0 + 0.12, z, 0.06, 0.04, 0.002);
    box(gp, '#f8fafc', x + 0.03, Y0 + 0.12, z + 0.0012, 0.07, 0.011, 0.002, 0, 0, -0.6);
    box(gp, '#111827', x + 0.03, Y0 + 0.124, z + 0.0016, 0.07, 0.006, 0.002, 0, 0, -0.6);
  }
  for (const [x, z, s] of [[0.42, 0.2, 0.2], [-0.4, -0.25, 0.2], [0.3, 0.36, 0.17], [0.4, -0.25, 0.19]] as const) palm(gp, x, Y0, z, s);
  for (let i = 0; i < 10; i++) {
    const x = 0.02 + i * 0.035, z = 0.25 + i * 0.008;
    fan(gp, x, Y0, z, 0.04, ['#facc15', '#f97316', '#22c55e', '#ec4899', '#38bdf8'][i % 5], i % 2 === 0);
  }
};

// =========================================================================================================
// LOY KRATHONG at Sukhothai — the lotus-bud chedi and laterite columns of Wat Mahathat on its island, the moat
// covered with glowing krathong floats among lotus leaves, sky lanterns drifting up, and families kneeling at
// the water's edge to launch their krathongs.
// =========================================================================================================
const fe_loykrathong: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#6f9a45', (x, _y, z) => shade('#6f9a45', 0.9 + fbm(x * 12, 0, z * 12, 2) * 0.2));
  // moat: a wide band of water around the temple island
  const isl = (x: number, z: number) => Math.hypot(x / 0.3, (z + 0.14) / 0.22);
  water(gp, 0, Y0 + 0.002, 0.08, (x, z) => { const zz = z + 0.08; const d = isl(x, zz); return d > 1.0 && Math.hypot(x, zz) < 0.43 && zz > -0.15; }, 0.43, 0.43, 20, '#1e5a7a');
  // temple island: laterite platform, columns, lotus-bud chedi
  const tp = grp(gp, 0, Y0, -0.14, 0, 1.35);
  box(tp, '#8a7a6a', 0, 0, 0, 0.26, 0.012, 0.18);
  box(tp, '#9a8a78', 0, 0.012, -0.02, 0.2, 0.01, 0.1);
  const BR = '#9a8a7a', DK = '#7a6a5a';
  box(tp, BR, 0, 0.022, -0.03, 0.08, 0.02, 0.08);
  box(tp, DK, 0, 0.042, -0.03, 0.065, 0.02, 0.065);
  box(tp, BR, 0, 0.062, -0.03, 0.05, 0.03, 0.05);
  box(tp, DK, 0, 0.092, -0.03, 0.04, 0.012, 0.04);
  const bud: [number, number][] = [[0.0, 0], [0.018, 0.0], [0.022, 0.012], [0.024, 0.03], [0.02, 0.05], [0.012, 0.065], [0.004, 0.08], [0, 0.09]];
  lathe(tp, bud, '#a89a88', 0, 0.104, -0.03, 8);
  limb(tp, [0, 0.19, -0.03], [0, 0.24, -0.03], 0.003, '#a89a88');
  for (const s of [-1, 1]) {
    box(tp, BR, s * 0.07, 0.022, -0.03, 0.03, 0.05, 0.03);
    lathe(tp, bud, '#a89a88', s * 0.07, 0.072, -0.03, 8).scale.setScalar(0.55);
  }
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) cyl(tp, '#8a7868', -0.08 + i * 0.04, 0.022, 0.04 + s * 0.022, 0.006, 0.05 + hash3(i, s, 1) * 0.02, 6);
  // seated figure statue silhouette kept simple: a stupa row behind
  for (let i = 0; i < 4; i++) lathe(tp, bud, '#8a7a6a', -0.11 + i * 0.073, 0.012, -0.08, 8).scale.setScalar(0.4);
  // the krathongs: banana-leaf rafts with lotus petals, candle and incense, glowing
  const kr = (x: number, z: number, s: number) => {
    const f = grp(gp, x, Y0 + 0.003, z, hash3(x * 10, z * 10, 1) * 6, s);
    add(f, g('f2-kr', () => new THREE.CylinderGeometry(1, 0.8, 1, 8)), mat('#4d7c0f'), 0, 0.006, 0, 0.03, 0.012, 0.03);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; cone(f, ['#f472b6', '#fde68a', '#f8fafc'][k % 3], Math.cos(a) * 0.018, 0.012, Math.sin(a) * 0.018, 0.009, 0.018, 4); }
    glow(cyl(f, '#fde68a', 0, 0.012, 0, 0.004, 0.02, 5), '#fef3c7', '#fde68a');
    flame(f, 0, 0.032, 0, 0.018);
  };
  const spots: [number, number][] = [[-0.3, 0.16], [-0.18, 0.24], [-0.05, 0.3], [0.08, 0.2], [0.2, 0.26], [0.32, 0.13], [-0.34, 0.0], [0.36, 0.0], [0.0, 0.18], [-0.12, 0.13], [0.14, 0.32], [0.26, 0.07]];
  spots.forEach(([x, z], i) => kr(x, z, 1 + (i % 3) * 0.15));
  for (let i = 0; i < 16; i++) {
    const x = -0.38 + hash3(i, 2, 3) * 0.76, z = 0.0 + hash3(i, 5, 1) * 0.36;
    if (Math.hypot(x, z + 0.0) > 0.42 || isl(x, z) < 1.1) continue;
    disc(gp, '#3f7d2a', x, Y0 + 0.003, z, 0.016, 0.002, 9);
    if (i % 4 === 0) cone(gp, '#f9a8d4', x + 0.006, Y0 + 0.004, z, 0.007, 0.016, 5);
  }
  // sky lanterns rising
  for (let i = 0; i < 7; i++) {
    const x = -0.3 + i * 0.1 + hash3(i, 1, 2) * 0.03, z = -0.2 + hash3(i, 3, 2) * 0.3, y = Y0 + 0.24 + hash3(i, 7, 2) * 0.16;
    glow(add(gp, g('f2-lantern', () => new THREE.CylinderGeometry(0.6, 0.45, 1, 7)), mat('#fb923c'), x, y, z, 0.022, 0.034, 0.022), '#fdba74', '#ea580c');
  }
  // families kneeling at the water's edge (front)
  for (let i = 0; i < 6; i++) {
    const x = -0.24 + i * 0.1, z = 0.42 - Math.abs(x) * 0.25;
    const f = fig(gp, x, Y0, z, Math.PI, i % 2 ? 0.045 : 0.035, { c: ['#f8fafc', '#fbcfe8', '#fde68a', '#bae6fd', '#e9d5ff', '#fecaca'][i], b: ['#7c3aed', '#be123c', '#0f766e'][i % 3], skirt: i % 2 ? undefined : ['#be123c', '#7c3aed', '#0f766e'][i % 3], feet: [[-0.08, 0.0, -0.2], [0.08, 0.0, -0.2]], hands: [[-0.06, 0.45, 0.3], [0.06, 0.45, 0.3]], lean: 0.35 });
    f.position.y = Y0 - 0.008;
  }
  for (const [x, z, s] of [[-0.42, -0.18, 0.12], [0.42, -0.18, 0.12], [-0.3, -0.36, 0.1], [0.3, -0.36, 0.1]] as const) leafy(gp, x, Y0, z, s, '#3f7d3a');
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 0.2 + (i / 7) * Math.PI * 0.6, x = Math.cos(a) * 0.46, z = Math.sin(a) * 0.46;
    glow(dot(gp, '#fde68a', x, Y0 + 0.05, z, 0.006, 5), '#fde68a', '#facc15');
    limb(gp, [x, Y0, z], [x, Y0 + 0.045, z], 0.002, '#57534e');
  }
};

// =========================================================================================================
// ARGUNGU FISHING FESTIVAL (Nigeria) — the Matan Fada river packed with fishermen holding big scoop nets and
// floating calabash gourds, one lifting a giant fish, drummers in a dugout canoe, sandy banks lined with
// cheering crowds and shade canopies, doum palms and a baobab.
// =========================================================================================================
const fe_argungu: Builder = (gp) => {
  const Y0 = 0.03, SAND = '#d8bf8a';
  const riv = (x: number, z: number) => Math.abs(z - Math.sin(x * 4) * 0.04) < 0.16;
  base(gp, 0.5, SAND, (x, _y, z) => (riv(x, z) ? '#7a6a48' : shade(SAND, 0.92 + fbm(x * 12, 0, z * 12, 2) * 0.14)), 0.03, (x, z) => 0.02 * sm(0.13, 0.2, Math.abs(z - Math.sin(x * 4) * 0.04)), 14, 48);
  const WY = Y0 + 0.012;
  water(gp, 0, WY, 0, (x, z) => riv(x, z) && Math.hypot(x, z) < 0.485, 0.49, 0.2, 22, '#6b7a52');
  // fishermen in the water with nets & calabashes
  const net = (f: THREE.Group, hand: V3) => {
    limb(f, hand, [hand[0] + 0.1, hand[1] + 0.7, hand[2] + 0.35], 0.02, '#a16207');
    ringLine(f, hand[0] + 0.1, hand[1] + 0.75, hand[2] + 0.4, 0.3, 0.02, '#a16207', 12, 3).rotation.x = -0.9;
    add(f, g('f2-netc', () => new THREE.ConeGeometry(1, 1, 8, 1, true)), mat('#f5f5dc', { transparent: 0.6 }), hand[0] + 0.1, hand[1] + 0.5, hand[2] + 0.45, 0.28, 0.4, 0.28, 0, -0.9 + Math.PI);
  };
  for (let i = 0; i < 12; i++) {
    const x = -0.38 + (i / 11) * 0.76 + (hash3(i, 1, 1) - 0.5) * 0.04, z = Math.sin(x * 4) * 0.04 + (hash3(i, 2, 1) - 0.5) * 0.2;
    const f = fig(gp, x, WY - 0.026, z, i === 5 ? 0.2 : hash3(i, 3, 1) * 6, 0.06, { c: SK[3 + (i % 2)], b: '#1e3a8a', skin: SK[3 + (i % 2)], hands: i === 5 ? [[-0.32, 1.22, 0.12], [0.36, 1.22, 0.12]] : [[-0.25, 0.75, 0.15], [0.22, 0.8, 0.2]], hat: (ff) => blob(ff, i % 3 ? '#facc15' : '#f8fafc', 0, 0.98, 0, 0.12, 0.05, 0.12) });
    if (i === 5) {
      f.position.y = WY - 0.012;
      blob(f, '#cbd5e1', 0, 1.3, 0.12, 0.5, 0.16, 0.13);
      blob(f, '#64748b', 0.55, 1.3, 0.12, 0.1, 0.16, 0.04);
      dot(f, '#111827', -0.38, 1.35, 0.24, 0.03, 5);
      continue;
    }
    if (i % 2 === 0) net(f, [0.22, 0.8, 0.2]);
    blob(gp, i % 3 ? '#d97706' : '#b45309', x + 0.025, WY + 0.002, z + 0.01, 0.014, 0.01, 0.014);
  }
  // drummers' canoe
  const cn = grp(gp, 0.12, WY, 0.08, 0.2);
  prism(cn, [[-0.02, -0.11], [0.02, -0.11], [0.025, 0.0], [0.0, 0.12], [-0.025, 0.0]], -0.006, 0.016, '#6b4423', 0, true);
  for (let k = 0; k < 3; k++) {
    const f = fig(cn, 0, 0.0, -0.06 + k * 0.05, 0, 0.042, { c: ['#16a34a', '#f8fafc', '#dc2626'][k], b: '#1f2937', skirt: '#f8fafc', feet: [[-0.12, 0, 0.2], [0.12, 0, 0.2]], hands: [[-0.12, 0.55, 0.3], [0.15, 0.7, 0.28]] });
    f.position.y = -0.012;
    add(f, g('f2-klong', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 9)), mat('#92400e'), 0, 0.5, 0.3, 0.2, 0.25, 0.2);
  }
  // banks: crowds, canopies, palms, baobab
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const x = -0.36 + i * 0.065, z = Math.sin(x * 4) * 0.04 + side * (0.21 + (i % 2) * 0.03);
      if (Math.hypot(x, z) > 0.46) continue;
      fan(gp, x, Y0 + 0.02, z, 0.042, ['#16a34a', '#f8fafc', '#facc15', '#dc2626', '#2563eb', '#a855f7'][(i + (side > 0 ? 3 : 0)) % 6], i % 3 === 0);
    }
  }
  for (const [x, z, c] of [[-0.18, -0.34, '#16a34a'], [0.12, -0.36, '#f8fafc']] as const) {
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) limb(gp, [x + ox * 0.06, Y0 + 0.02, z + oz * 0.03], [x + ox * 0.06, Y0 + 0.09, z + oz * 0.03], 0.003, '#e5e7eb');
    box(gp, c, x, Y0 + 0.09, z, 0.13, 0.008, 0.07);
    box(gp, '#facc15', x, Y0 + 0.082, z + 0.035, 0.13, 0.01, 0.002);
    for (let k = 0; k < 4; k++) fig(gp, x - 0.045 + k * 0.03, Y0 + 0.02, z, 0, 0.042, { c: ['#f8fafc', '#a5f3fc', '#fde68a', '#f8fafc'][k], skirt: '#f8fafc', b: '#f8fafc', hat: (f) => blob(f, '#dc2626', 0, 0.98, 0, 0.11, 0.08, 0.11) });
  }
  for (const [x, z, s] of [[-0.4, 0.3, 0.2], [0.4, -0.24, 0.19], [0.38, 0.3, 0.17]] as const) palm(gp, x, Y0 + 0.02, z, s, 0.08, '#5f8a3a');
  const bx = -0.36, bz = -0.24;
  add(gp, g('f2-baob', () => new THREE.CylinderGeometry(0.6, 1, 1, 8)), mat('#9a8270'), bx, Y0 + 0.02 + 0.06, bz, 0.035, 0.12, 0.035);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; limb(gp, [bx, Y0 + 0.13, bz], [bx + Math.cos(a) * 0.06, Y0 + 0.17, bz + Math.sin(a) * 0.05], 0.007, '#9a8270'); blob(gp, '#6b8f3a', bx + Math.cos(a) * 0.06, Y0 + 0.18, bz + Math.sin(a) * 0.05, 0.03, 0.018, 0.03); }
};

/** Firework burst: emissive rays around a centre. */
function burst(p: THREE.Object3D, x: number, y: number, z: number, r: number, c: string, n = 12): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, e = (hash3(i, x * 9, y * 9) - 0.5) * 1.2;
    const d: V3 = [Math.cos(a) * Math.cos(e), Math.sin(e) + 0.1, Math.sin(a) * Math.cos(e)];
    glow(limb(p, [x + d[0] * r * 0.35, y + d[1] * r * 0.35, z + d[2] * r * 0.35], [x + d[0] * r, y + d[1] * r, z + d[2] * r], r * 0.035, c), c, c);
  }
  glow(dot(p, '#ffffff', x, y, z, r * 0.12, 5), '#ffffff', c);
}

// =========================================================================================================
// SCARLET SAILS (St Petersburg) — a white-night celebration for school graduates: a brig with scarlet sails
// glides along the Neva under fireworks, in front of the Peter and Paul Fortress with its golden needle
// spire; graduates in white cheer from the granite embankment by the red Rostral Columns.
// =========================================================================================================
const fe_scarletsails: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#7a8a5a', (x, _y, z) => (z > 0.27 ? shade('#b8aca0', 0.94 + hash3(Math.floor(x * 40), 0, Math.floor(z * 40)) * 0.1) : shade('#6f8a4f', 0.92 + fbm(x * 10, 0, z * 10, 2) * 0.16)));
  water(gp, 0, Y0 + 0.002, 0.02, (x, z) => z < 0.24 && z > -0.24 && Math.hypot(x, z + 0.02) < 0.485, 0.49, 0.26, 22, '#2b5a8a');
  // granite embankment edge (front)
  line(gp, -0.4, 0.265, 0.4, 0.265, Y0, 0.014, '#9f8f84', 0.012);
  for (let i = 0; i < 14; i++) box(gp, '#57534e', -0.36 + i * 0.055, Y0 + 0.012, 0.268, 0.004, 0.014, 0.004);
  line(gp, -0.37, 0.268, 0.37, 0.268, Y0 + 0.024, 0.003, '#44403c', 0.003);
  // Rostral columns
  for (const x of [-0.33, 0.33]) {
    box(gp, '#d6d3d1', x, Y0, 0.36, 0.05, 0.03, 0.05);
    cyl(gp, '#9f3a2a', x, Y0 + 0.03, 0.36, 0.014, 0.17, 10);
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) {
      const a = j * Math.PI + k * 0.6;
      box(gp, '#b45309', x + Math.cos(a) * 0.018, Y0 + 0.06 + k * 0.035, 0.36 + Math.sin(a) * 0.018, 0.016, 0.008, 0.006, -a);
    }
    box(gp, '#d6d3d1', x, Y0 + 0.2, 0.36, 0.03, 0.008, 0.03);
    glow(cone(gp, '#f97316', x, Y0 + 0.208, 0.36, 0.012, 0.03, 6), '#f97316', '#ea580c');
  }
  // graduates in white & dark suits, cheering
  for (let i = 0; i < 12; i++) {
    const x = -0.27 + i * 0.05 + (hash3(i, 1, 4) - 0.5) * 0.02, z = 0.31 + (i % 3) * 0.03;
    const girl = i % 2 === 0;
    fig(gp, x, Y0, z, Math.PI + (hash3(i, 2, 4) - 0.5) * 0.6, 0.048, { c: girl ? '#f8fafc' : '#1f2937', b: '#1f2937', skirt: girl ? '#f8fafc' : undefined, ...(i % 3 ? CHEER : {}), hat: girl && i % 4 === 0 ? (f) => blob(f, '#f8fafc', 0, 1.02, -0.04, 0.09, 0.06, 0.09) : undefined });
  }
  // far bank: fortress bastion wall, cathedral with the golden needle
  const fb = grp(gp, 0, Y0, -0.3);
  const q = new Quads();
  for (let i = 0; i < 9; i++) {
    const x = -0.36 + i * 0.09;
    q.box(x, 0, 0.05 - (i % 2) * 0.015, 0.09, 0.04, 0.05, '#b9a48a', 0, '#7f9a5a');
    for (let k = 0; k < 3; k++) q.box(x - 0.03 + k * 0.03, 0.012, 0.075 - (i % 2) * 0.015 + 0.001, 0.008, 0.012, 0.002, '#57534e');
  }
  q.mesh(fb);
  box(fb, '#e8c46a', 0, 0.04, -0.03, 0.14, 0.05, 0.07);
  gable(fb, 0.14, 0.03, 0.072, '#94a3b8', 0, 0.09, -0.03);
  box(fb, '#e8c46a', 0.06, 0.04, -0.03, 0.04, 0.12, 0.04);
  box(fb, '#f8fafc', 0.06, 0.07, 0.0, 0.03, 0.012, 0.002);
  for (let k = 0; k < 3; k++) box(fb, k % 2 ? '#e8c46a' : '#f5deb3', 0.06, 0.16 + k * 0.025, -0.03, 0.034 - k * 0.008, 0.025, 0.034 - k * 0.008);
  glow(cone(fb, '#facc15', 0.06, 0.235, -0.03, 0.009, 0.16, 6), '#facc15', '#a16207');
  limb(fb, [0.06, 0.39, -0.03], [0.06, 0.41, -0.03], 0.002, '#facc15');
  box(fb, '#facc15', 0.06, 0.405, -0.03, 0.014, 0.003, 0.003);
  add(fb, g('f2-cdome', () => new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2)), mat('#2f6b4a'), -0.04, 0.09, -0.03, 0.02, 0.025, 0.02);
  for (const [x, z, s] of [[-0.3, -0.42, 0.1], [0.3, -0.42, 0.1], [-0.18, -0.4, 0.09], [0.22, -0.38, 0.09]] as const) leafy(gp, x, Y0, z, s, '#3f7d3a');
  // the brig with scarlet sails
  const br = grp(gp, -0.02, Y0 + 0.002, 0.03, Math.PI / 2 - 0.15, 1.3);
  prism(br, [[-0.03, -0.14], [0.03, -0.14], [0.04, 0.0], [0.02, 0.12], [0.0, 0.17], [-0.02, 0.12], [-0.04, 0.0]], -0.01, 0.035, '#1f2937', 0, true);
  box(br, '#f8fafc', 0, 0.02, -0.01, 0.083, 0.004, 0.27);
  box(br, '#9a6b3a', 0, 0.025, -0.01, 0.07, 0.002, 0.25);
  limb(br, [0, 0.03, 0.15], [0, 0.06, 0.24], 0.002, '#7c5a32');
  const SC = '#dc2626';
  for (const [mz, mh] of [[0.06, 0.26], [-0.06, 0.24]] as const) {
    limb(br, [0, 0.025, mz], [0, 0.025 + mh, mz], 0.0035, '#5b3a22');
    for (let k = 0; k < 3; k++) {
      const y = 0.06 + k * 0.06, w = 0.12 - k * 0.025, h = 0.05;
      limb(br, [-w / 2 - 0.005, y + h, mz], [w / 2 + 0.005, y + h, mz], 0.0018, '#5b3a22');
      const sail = add(br, g('f2-sail', () => { const ge = new THREE.PlaneGeometry(1, 1, 2, 2); const pa = ge.getAttribute('position'); for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, 0.12 * (1 - 4 * x * x) * (1 - 4 * y * y) * 0.5 + 0.06); } ge.computeVertexNormals(); return ge; }), mat(SC, { emissive: '#7f1d1d' }), 0, y + h / 2, mz + 0.002, w, h, 0.1);
      sail.material = (sail.material as THREE.MeshStandardMaterial).clone();
      (sail.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      sail.rotation.y = Math.PI / 2 - Math.PI / 2;
    }
  }
  const jib = new Quads();
  jib.quad([0, 0.03, 0.22], [0, 0.26, 0.06], [0, 0.04, 0.09], [0, 0.04, 0.09], SC, [1, 0, 0]);
  jib.quad([0, 0.03, 0.22], [0, 0.26, 0.06], [0, 0.04, 0.09], [0, 0.04, 0.09], SC, [-1, 0, 0]);
  jib.mesh(br, { emissive: '#7f1d1d' });
  box(br, SC, 0.0, 0.25, -0.06, 0.002, 0.012, 0.03);
  // fireworks
  burst(gp, -0.22, Y0 + 0.36, -0.12, 0.08, '#f472b6', 14);
  burst(gp, 0.18, Y0 + 0.42, -0.18, 0.09, '#fde047', 14);
  burst(gp, 0.34, Y0 + 0.3, -0.05, 0.06, '#60a5fa', 12);
  burst(gp, -0.38, Y0 + 0.26, -0.02, 0.05, '#4ade80', 10);
};

/** Hot-air balloon envelope with coloured gores (cached by palette). */
function balloon(p: THREE.Object3D, x: number, y: number, z: number, s: number, pal: string[], tilt = 0): THREE.Group {
  const f = grp(p, x, y, z, 0, s);
  f.rotation.z = tilt;
  const m = add(f, balloonGeo(pal), mat('#ffffff', { vc: true, flat: true, rough: 0.5 }), 0, 0.14, 0, 1, 1, 1);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) limb(f, [ox * 0.03, 0.06, oz * 0.03], [ox * 0.1, 0.16, oz * 0.1], 0.004, '#57534e');
  box(f, '#8b5a2b', 0, 0, 0, 0.07, 0.06, 0.07);
  glow(dot(f, '#fde047', 0, 0.1, 0, 0.018, 5), '#fde047', '#f59e0b');
  m.castShadow = true;
  return f;
}
function balloonGeo(pal: string[]): THREE.BufferGeometry {
  return g('f2-bal:' + pal.join(','), () => {
    const pts = [[0.12, 0], [0.2, 0.08], [0.38, 0.25], [0.48, 0.45], [0.5, 0.62], [0.45, 0.8], [0.32, 0.94], [0.14, 1.0], [0.0, 1.01]].map(([r, h]) => new THREE.Vector2(r, h));
    const lg = new THREE.LatheGeometry(pts, 14);
    return paintFaces(lg, pal[0], (px, py, pz) => {
      const k = Math.floor(((Math.atan2(pz, px) / TAU + 1) % 1) * 14 + 0.5) % 14;
      if (py > 0.55 && py < 0.66) return pal[pal.length - 1];
      return pal[k % (pal.length - 1)];
    });
  });
}

// =========================================================================================================
// ALBUQUERQUE BALLOON FIESTA — the mass ascension at sunrise: striped balloons rising over the launch field,
// one still being inflated on its side by the crew, a smiley special-shape balloon, chase pickups and a
// crowd; the pink Sandia Mountains behind.
// =========================================================================================================
const fe_balloonfiesta: Builder = (gp) => {
  const Y0 = 0.03;
  const mtn = (x: number, z: number) => 0.13 * sm(-0.3, -0.48, z) * (0.6 + 0.4 * fbm(x * 6, 1, 0, 2)) * sm(0.5, 0.2, Math.abs(x));
  base(gp, 0.5, '#9caf6a', (x, y, z) => (y > Y0 + 0.03 ? shade('#b8857a', 0.9 + fbm(x * 15, y * 20, z * 15, 2) * 0.2) : y > Y0 + 0.012 ? '#8a9a5a' : shade('#a3b36d', 0.92 + fbm(x * 9, 0, z * 9, 2) * 0.14)), 0.03, mtn, 14, 56);
  // launch field grid (mown squares)
  for (let i = -3; i <= 3; i++) line(gp, i * 0.1, -0.22, i * 0.1, 0.3, Y0 + 0.0005, 0.004, '#c7d39a');
  const pals = [
    ['#dc2626', '#facc15', '#2563eb', '#16a34a', '#f8fafc'],
    ['#7c3aed', '#ec4899', '#f97316', '#facc15'],
    ['#0ea5e9', '#f8fafc', '#0ea5e9', '#1e3a8a', '#facc15'],
    ['#f97316', '#facc15', '#dc2626', '#111827'],
    ['#16a34a', '#facc15', '#f8fafc', '#dc2626'],
    ['#ec4899', '#f8fafc', '#a855f7', '#22d3ee'],
  ];
  const spots: [number, number, number, number][] = [[-0.26, 0.22, -0.1, 0.24], [0.02, 0.3, -0.24, 0.26], [0.26, 0.16, -0.06, 0.22], [-0.08, 0.08, 0.06, 0.2], [0.3, 0.3, -0.28, 0.2], [-0.32, 0.34, -0.3, 0.18]];
  spots.forEach(([x, y, z, s], i) => balloon(gp, x, Y0 + y, z, s, pals[i], (hash3(i, 2, 2) - 0.5) * 0.15));
  // special shape: a smiling sun
  const sp = grp(gp, 0.14, Y0 + 0.24, 0.08);
  blob(sp, '#facc15', 0, 0.09, 0, 0.075, 0.08, 0.07);
  for (const s of [-1, 1]) dot(sp, '#111827', s * 0.025, 0.11, 0.065, 0.008, 5);
  add(sp, g('f2-smile', () => new THREE.TorusGeometry(1, 0.15, 3, 10, Math.PI)), mat('#111827'), 0, 0.085, 0.066, 0.03, 0.03, 0.03, 0, 0, Math.PI);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; cone(sp, '#f97316', Math.cos(a) * 0.08, 0.09 + Math.sin(a) * 0.085, 0, 0.012, 0.03, 4).rotation.z = a - Math.PI / 2; }
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) limb(sp, [ox * 0.008, -0.03, oz * 0.008], [ox * 0.025, 0.02, oz * 0.025], 0.0012, '#57534e');
  box(sp, '#8b5a2b', 0, -0.045, 0, 0.018, 0.016, 0.018);
  // a balloon inflating on the ground with its crew
  const inf = grp(gp, -0.2, Y0, 0.24, 0.5, 0.75);
  const env = add(inf, balloonGeo(pals[1]), mat('#ffffff', { vc: true, flat: true, rough: 0.5 }), 0, 0.055, 0.0, 0.2, 0.2, 0.2);
  env.rotation.z = Math.PI / 2;
  env.scale.set(0.24, 0.24, 0.18);
  env.position.set(0.01, 0.112, 0);
  box(inf, '#8b5a2b', -0.17, 0, 0, 0.022, 0.018, 0.022);
  flame(inf, -0.13, 0.03, 0, 0.035);
  for (const [x, z] of [[-0.14, 0.04], [-0.14, -0.04], [-0.17, 0.03]] as const) fig(inf, x, 0, z, Math.PI / 2, 0.042, { c: '#1d4ed8', b: '#44403c', hands: [[-0.2, 0.6, 0.25], [0.2, 0.6, 0.25]] });
  // chase pickups, crowd
  for (const [x, z, ry, c] of [[0.3, 0.2, 0.4, '#f8fafc'], [0.38, 0.06, 1.2, '#dc2626']] as const) {
    const t = grp(gp, x, Y0, z, ry);
    box(t, c, 0, 0.008, 0, 0.026, 0.014, 0.06);
    box(t, c, 0, 0.022, 0.008, 0.024, 0.012, 0.024);
    box(t, '#1e293b', 0, 0.024, 0.008, 0.0245, 0.007, 0.025);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) wheel(t, sx * 0.013, 0.007, sz * 0.02, 0.007, 0.006);
  }
  for (let i = 0; i < 14; i++) {
    const x = -0.33 + i * 0.05, z = 0.38 + (i % 2) * 0.03 - Math.abs(x) * 0.12;
    fig(gp, x, Y0, z, Math.PI + (hash3(i, 1, 3) - 0.5), 0.042, { c: ['#f97316', '#f8fafc', '#38bdf8', '#facc15', '#ef4444', '#a855f7'][i % 6], b: ['#1e3a8a', '#44403c'][i % 2], hands: i % 3 === 0 ? CHEER.hands : undefined, hat: i % 4 === 1 ? (f) => blob(f, '#78350f', 0, 1.0, 0, 0.17, 0.04, 0.17) : undefined });
  }
};

// =========================================================================================================
// UTTARAYAN in Ahmedabad — on Makar Sankranti everyone is up on the flat roofs of the old pol houses with
// their colourful facades and carved wooden balconies, flying diamond kites; the sky is full of kites with
// tails, strings run down to the hands of the flyers, and the spool-holders (firki) stand ready.
// =========================================================================================================
const fe_kites: Builder = (gp) => {
  const Y0 = 0.03;
  base(gp, 0.5, '#c8b28a', (x, _y, z) => shade('#c8b28a', 0.92 + hash3(Math.floor(x * 30), 0, Math.floor(z * 30)) * 0.12));
  const pal = ['#f59e0b', '#38bdf8', '#f472b6', '#a3e635', '#fde68a', '#f97316', '#c4b5fd', '#5eead4', '#fca5a5'];
  const roofs: [number, number, number][] = [];
  const lots: [number, number, number, number, number, number][] = [];
  // two rows of houses facing a winding lane, plus a back row
  for (let i = 0; i < 6; i++) lots.push([-0.36 + i * 0.12, -0.05, 0.11, 0.1 + (i % 3) * 0.03, 0.1, 0]);
  for (let i = 0; i < 5; i++) lots.push([-0.3 + i * 0.13, -0.24, 0.12, 0.13 + (i % 2) * 0.04, 0.1, 0]);
  for (let i = 0; i < 5; i++) lots.push([-0.28 + i * 0.13, 0.2, 0.12, 0.08 + (i % 2) * 0.03, 0.1, 0]);
  lots.forEach(([x, z, w, h, d], i) => {
    if (Math.hypot(x, z) > 0.42) return;
    const f = house(gp, x, Y0, z, 0, w - 0.004, h, d, pal[i % pal.length], null, '#1e3a5f', '#f8fafc');
    box(f, shade(pal[i % pal.length], 0.85), 0, h, 0, w, 0.012, d);
    box(f, '#7c4a2a', 0, h * 0.45, d / 2 + 0.008, w * 0.7, 0.008, 0.016);
    for (let k = 0; k < 4; k++) box(f, '#7c4a2a', -w * 0.33 + k * w * 0.22, h * 0.45, d / 2 + 0.016, 0.004, 0.022, 0.004);
    box(f, '#7c4a2a', 0, h * 0.45 + 0.022, d / 2 + 0.008, w * 0.72, 0.004, 0.018);
    roofs.push([x, Y0 + h + 0.012, z]);
  });
  // people on roofs flying kites; kites in the sky with tails
  const kq = new Quads(), kc = ['#dc2626', '#facc15', '#2563eb', '#16a34a', '#ec4899', '#f97316', '#7c3aed', '#f8fafc', '#06b6d4'];
  roofs.forEach(([x, y, z], i) => {
    if (i % 2 === 1 && i !== 7) return;
    const ry = Math.PI + (hash3(i, 2, 3) - 0.5) * 1.5;
    const f = fig(gp, x + (hash3(i, 1, 1) - 0.5) * 0.04, y, z, ry, 0.05, { c: kc[(i + 3) % 9], b: i % 3 ? '#1f2937' : '#f8fafc', skirt: i % 4 === 0 ? kc[(i + 5) % 9] : undefined, hands: [[-0.15, 0.7, 0.2], [0.18, 1.15, 0.15]] });
    const hx = x + Math.sin(ry) * 0.01, hz = z + Math.cos(ry) * 0.01, hy = y + 0.058;
    const kx = x + (hash3(i, 4, 1) - 0.5) * 0.3, kz = z - 0.05 - hash3(i, 5, 1) * 0.15, ky = Y0 + 0.32 + hash3(i, 6, 1) * 0.18;
    limb(gp, [hx, hy, hz], [kx, ky - 0.02, kz], 0.0009, '#f8fafc');
    const s = 0.028, c = kc[i % 9], c2 = kc[(i + 4) % 9];
    const T: Q = [kx, ky + s, kz], B: Q = [kx, ky - s, kz], L: Q = [kx - s * 0.85, ky + s * 0.15, kz], R: Q = [kx + s * 0.85, ky + s * 0.15, kz], M: Q = [kx, ky + s * 0.15, kz];
    for (const w of [[0, 0, 1], [0, 0, -1]] as Q[]) {
      kq.quad(T, R, M, M, c, w); kq.quad(T, L, M, M, c2, w); kq.quad(B, R, M, M, c2, w); kq.quad(B, L, M, M, c, w);
      kq.quad([kx - 0.006, ky - s, kz], [kx + 0.006, ky - s, kz], [kx, ky - s - 0.012, kz], [kx, ky - s - 0.012, kz], c2, w);
    }
    void f;
  });
  for (let i = 0; i < 10; i++) {
    const kx = -0.38 + hash3(i, 9, 2) * 0.76, kz = -0.4 + hash3(i, 8, 2) * 0.6, ky = Y0 + 0.42 + hash3(i, 7, 2) * 0.14, s = 0.02, c = kc[(i + 2) % 9];
    if (Math.hypot(kx, kz) > 0.45) continue;
    for (const w of [[0, 0, 1], [0, 0, -1]] as Q[]) kq.quad([kx, ky + s, kz], [kx + s * 0.85, ky, kz], [kx, ky - s, kz], [kx - s * 0.85, ky, kz], c, w);
  }
  kq.mesh(gp);
  // firki spools & a few kids in the lane
  for (const [x, z] of [[-0.12, 0.08], [0.1, 0.08]] as const) {
    const f = fig(gp, x, Y0, z, Math.PI * 0.9, 0.04, { c: '#facc15', b: '#1f2937', hands: [[-0.15, 0.6, 0.25], [0.15, 0.6, 0.25]] });
    add(f, g('f2-firki', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), mat('#dc2626'), 0, 0.6, 0.3, 0.25, 0.22, 0.25, 0, 0, Math.PI / 2);
  }
  for (const [x, z] of [[-0.42, 0.1], [0.42, 0.1], [0.0, 0.42]] as const) leafy(gp, x, Y0, z, 0.1, '#4f7d3a');
};

// =========================================================================================================
// GOROKA SHOW (Papua New Guinea) — highland groups gather to sing and dance (a "sing-sing"): Asaro mudmen
// with clay masks and grey bodies, dancers with towering bird-of-paradise feather headdresses, painted faces
// and grass skirts beating kundu drums; thatched round houses and green mountains.
// =========================================================================================================
const fe_goroka: Builder = (gp) => {
  const Y0 = 0.03;
  const hills = (x: number, z: number) => 0.12 * sm(-0.28, -0.48, z) * (0.5 + 0.5 * fbm(x * 5, 2, 0, 2));
  base(gp, 0.5, '#5f9a3e', (x, y, z) => (y > Y0 + 0.03 ? shade('#2f6b34', 0.9 + fbm(x * 15, y * 10, z * 15, 2) * 0.2) : shade('#6aa046', 0.9 + fbm(x * 10, 0, z * 10, 2) * 0.18)), 0.03, hills, 14, 56);
  disc(gp, '#8fbf5a', 0, Y0, 0.05, 0.3, 0.002, 32);
  // thatched round houses
  for (const [x, z] of [[-0.32, -0.2], [0.32, -0.22], [-0.38, 0.06], [0.4, 0.02]] as const) {
    cyl(gp, '#a07a4a', x, Y0, z, 0.045, 0.04, 10);
    cone(gp, '#c2a060', x, Y0 + 0.04, z, 0.065, 0.07, 10);
    box(gp, '#3f2a1a', x, Y0, z + 0.044, 0.016, 0.026, 0.002);
  }
  // Asaro mudmen (left)
  for (let i = 0; i < 4; i++) {
    const x = -0.25 + i * 0.06, z = 0.02 + (i % 2) * 0.06;
    const f = fig(gp, x, Y0, z, 0.3, 0.07, { c: '#c9c6bb', b: '#a3a08f', legs: '#c9c6bb', skin: '#c9c6bb', sleeve: '#c9c6bb', skirt: '#8a7a50', shoes: '#c9c6bb', noHair: true, hands: i % 2 ? [[-0.3, 0.8, 0.2], [0.3, 0.8, 0.2]] : [[-0.2, 0.5, 0.2], [0.25, 1.0, 0.15]], hat: (ff) => {
      blob(ff, '#d6d3c4', 0, 1.0, 0, 0.2, 0.2, 0.19);
      for (const s of [-1, 1]) { blob(ff, '#3f3a30', s * 0.07, 1.03, 0.17, 0.04, 0.025, 0.02); blob(ff, '#d6d3c4', s * 0.2, 1.0, 0.0, 0.05, 0.09, 0.04); }
      blob(ff, '#3f3a30', 0, 0.92, 0.17, 0.08, 0.025, 0.02);
    } });
    if (i % 2 === 0) limb(f, [0.25, 1.0, 0.15], [0.3, 0.0, 0.2], 0.02, '#7a5a3a');
  }
  // feather dancers (centre/right)
  const plume = ['#dc2626', '#facc15', '#111827', '#2563eb', '#f97316', '#16a34a'];
  for (let i = 0; i < 8; i++) {
    const x = 0.0 + (i % 4) * 0.075, z = -0.04 + Math.floor(i / 4) * 0.1 + (i % 2) * 0.02;
    const f = fig(gp, x, Y0, z, -0.2, 0.07, { c: SK[4], b: '#7c5a2a', skin: SK[4], sleeve: SK[4], legs: SK[4], shoes: SK[4], skirt: '#8a7a40', noHair: true, hands: [[-0.15, 0.6, 0.3], [0.18, 0.75, 0.28]], hat: (ff) => {
      blob(ff, '#facc15', 0, 0.92, 0.09, 0.08, 0.035, 0.03);
      blob(ff, '#dc2626', 0, 0.86, 0.09, 0.09, 0.025, 0.03);
      blob(ff, '#111827', 0, 1.0, 0, 0.14, 0.08, 0.13);
      for (let k = 0; k < 7; k++) {
        const a = -0.6 + (k / 6) * 1.2;
        add(ff, BOXG(), mat(plume[(k + i) % plume.length]), Math.sin(a) * 0.32, 1.3 + Math.cos(a) * 0.26, -0.03, 0.09, 0.75 - Math.abs(k - 3) * 0.08, 0.025, 0, 0, -a);
      }
    } });
    blob(f, '#f8fafc', 0, 0.72, 0.09, 0.08, 0.03, 0.02);
    add(f, g('f2-kundu', () => new THREE.CylinderGeometry(0.5, 0.35, 1, 8)), mat('#6b4423'), 0.0, 0.6, 0.35, 0.12, 0.45, 0.12, 0, 0, Math.PI / 2 - 0.3);
  }
  // spectators behind a rope, flags of PNG
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * 0.15 + (i / 13) * Math.PI * 0.7, x = Math.cos(a) * 0.4, z = 0.05 + Math.sin(a) * 0.34;
    if (Math.hypot(x, z) > 0.47) continue;
    fan(gp, x, Y0, z, 0.042, ['#dc2626', '#facc15', '#111827', '#f8fafc', '#16a34a'][i % 5], i % 3 === 0);
  }
  for (const [x, z] of [[-0.18, -0.24], [0.18, -0.26]] as const) {
    limb(gp, [x, Y0, z], [x, Y0 + 0.16, z], 0.003, '#e5e7eb');
    const fl = grp(gp, x, Y0 + 0.16, z);
    const fq = new Quads();
    fq.quad([0, 0, 0], [0.06, 0, 0], [0.06, -0.04, 0], [0.06, -0.04, 0], '#dc2626', [0, 0, 1]);
    fq.quad([0, 0, 0], [0, -0.04, 0], [0.06, -0.04, 0], [0.06, -0.04, 0], '#111827', [0, 0, 1]);
    fq.quad([0, 0, 0], [0.06, 0, 0], [0.06, -0.04, 0], [0.06, -0.04, 0], '#dc2626', [0, 0, -1]);
    fq.quad([0, 0, 0], [0, -0.04, 0], [0.06, -0.04, 0], [0.06, -0.04, 0], '#111827', [0, 0, -1]);
    fq.mesh(fl);
    box(fl, '#facc15', 0.04, -0.016, 0.001, 0.012, 0.008, 0.002);
  }
  for (const [x, z, s] of [[-0.2, -0.38, 0.14], [0.05, -0.42, 0.13], [0.25, -0.38, 0.12]] as const) palm(gp, x, Y0 + hills(x, z), z, s, 0.06, '#2f6b34');
};

/** Baku Flame Tower envelope (curved, pointed), painted blue glass rising into flame orange. */
function flameTower(p: THREE.Object3D, x: number, y: number, z: number, h: number, ry: number, lean: number): void {
  const geo = g('f2-flametower', () => {
    const pts = [[0.5, 0], [0.58, 0.18], [0.6, 0.38], [0.52, 0.6], [0.36, 0.8], [0.16, 0.94], [0, 1.0]].map(([r, hh]) => new THREE.Vector2(r, hh));
    const lg = new THREE.LatheGeometry(pts, 10);
    return paintFaces(lg, '#60a5fa', (_x, py) => (py > 0.86 ? '#fdba74' : Math.floor(py * 16) % 2 ? '#3b82f6' : '#7cb8f5'));
  });
  const m = add(p, geo, mat('#ffffff', { vc: true, flat: true, metal: 0.35, rough: 0.3 }), x, y, z, h * 0.3, h, h * 0.22, ry, 0, lean);
  m.castShadow = true;
}

// =========================================================================================================
// NOVRUZ in Baku — spring new year: the khoncha tray with sprouted green wheat (semeni) tied with a red
// ribbon, painted eggs, sweets and candles; children jumping over little bonfires; blossom trees, the round
// stone Maiden Tower, and the three Flame Towers on the hill behind.
// =========================================================================================================
const fe_nowruz: Builder = (gp) => {
  const Y0 = 0.03;
  const hill = (x: number, z: number) => 0.1 * sm(-0.15, -0.42, z) * sm(0.5, 0.0, Math.abs(x - 0.12));
  base(gp, 0.5, '#8ab05a', (x, y, z) => (y > Y0 + 0.04 ? shade('#7a9a4a', 0.92 + fbm(x * 12, 0, z * 12, 2) * 0.16) : shade(Math.abs(x + z * 0.4) < 0.05 && z > -0.1 ? '#d6c9b0' : '#8ab05a', 0.92 + fbm(x * 12, 0, z * 12, 2) * 0.14)), 0.03, hill, 14, 48);
  // the Flame Towers on the hill
  const hy = Y0 + hill(0.12, -0.34) - 0.005;
  flameTower(gp, 0.04, hy, -0.3, 0.28, 0.5, 0.08);
  flameTower(gp, 0.14, hy, -0.36, 0.33, 0.0, 0.0);
  flameTower(gp, 0.24, hy, -0.3, 0.26, -0.5, -0.08);
  // the Maiden Tower
  const mt = grp(gp, -0.3, Y0, -0.2);
  cyl(mt, '#c9b48a', 0, 0, 0, 0.055, 0.2, 14);
  box(mt, '#c9b48a', 0.0, 0, 0.05, 0.05, 0.19, 0.045);
  for (let k = 0; k < 4; k++) box(mt, '#5b4a3a', 0.0, 0.05 + k * 0.035, 0.0565, 0.008, 0.014, 0.002, 0);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; box(mt, '#bfa67a', Math.cos(a) * 0.05, 0.2, Math.sin(a) * 0.05, 0.016, 0.012, 0.012, -a); }
  flag(mt, 0, 0.2, 0, 0.06, '#0ea5e9', '#dc2626', 0, 0.04);
  // the khoncha table
  const tb = grp(gp, 0.06, Y0, 0.16, 0, 1.4);
  box(tb, '#7c2d12', 0, 0, 0, 0.2, 0.035, 0.12);
  box(tb, '#b91c1c', 0, 0.035, 0, 0.21, 0.003, 0.13);
  const TY = 0.038;
  add(tb, g('f2-tray', () => new THREE.CylinderGeometry(1, 0.9, 1, 18)), mat('#c2843a', { metal: 0.6, rough: 0.35 }), 0, TY + 0.003, 0, 0.07, 0.006, 0.07);
  add(tb, g('f2-semeni', () => new THREE.CylinderGeometry(0.7, 1, 1, 10)), mat('#4ade80'), 0, TY + 0.02, 0, 0.026, 0.03, 0.026);
  for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; limb(tb, [Math.cos(a) * 0.015, TY + 0.03, Math.sin(a) * 0.015], [Math.cos(a) * 0.022, TY + 0.05, Math.sin(a) * 0.022], 0.003, '#22c55e'); }
  ringLine(tb, 0, TY + 0.018, 0, 0.026, 0.003, '#dc2626', 14);
  box(tb, '#dc2626', 0.0, TY + 0.012, 0.026, 0.006, 0.012, 0.004);
  const eggs = ['#dc2626', '#facc15', '#2563eb', '#16a34a', '#ec4899', '#f97316'];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; blob(tb, eggs[k], Math.cos(a) * 0.048, TY + 0.012, Math.sin(a) * 0.048, 0.007, 0.009, 0.007); }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.7; glow(cyl(tb, '#fef3c7', Math.cos(a) * 0.058, TY + 0.006, Math.sin(a) * 0.058, 0.003, 0.016, 5), '#fef3c7', '#fde68a'); flame(tb, Math.cos(a) * 0.058, TY + 0.022, Math.sin(a) * 0.058, 0.01); }
  for (const s of [-1, 1]) {
    add(tb, g('f2-dish', () => new THREE.CylinderGeometry(1, 0.6, 1, 10)), mat('#e0f2fe'), s * 0.075, TY + 0.004, 0.02, 0.022, 0.008, 0.022);
    for (let k = 0; k < 3; k++) box(tb, '#d4a053', s * 0.075 + (k - 1) * 0.01, TY + 0.008, 0.02, 0.008, 0.005, 0.012, Math.PI / 4);
    for (let k = 0; k < 3; k++) blob(tb, '#f5e1b8', s * 0.075 + (k - 1) * 0.01, TY + 0.012, -0.03, 0.007, 0.004, 0.006);
  }
  // little bonfires with kids jumping over them
  for (const [x, z, k] of [[-0.18, 0.22, 0], [-0.28, 0.06, 1], [0.3, 0.16, 2]] as const) {
    for (let j = 0; j < 5; j++) { const a = (j / 5) * TAU; limb(gp, [x + Math.cos(a) * 0.025, Y0, z + Math.sin(a) * 0.025], [x, Y0 + 0.02, z], 0.004, '#5b4636'); }
    flame(gp, x, Y0 + 0.004, z, 0.06);
    flame(gp, x + 0.012, Y0 + 0.004, z - 0.008, 0.04);
    const jf = fig(gp, x + 0.01, Y0 + 0.075, z + 0.005, -1.2 + k, 0.05, { c: ['#dc2626', '#16a34a', '#2563eb'][k], b: '#1f2937', skirt: k === 1 ? '#facc15' : undefined, feet: [[-0.06, 0.15, 0.32], [0.06, 0.28, -0.3]], ...CHEER, lean: 0.2 });
    void jf;
    for (let i = 0; i < 2; i++) fig(gp, x + (i ? 0.07 : -0.06), Y0, z + 0.05, Math.PI + (i ? 0.6 : -0.6), 0.044, { c: ['#f472b6', '#fde047', '#a5f3fc'][(k + i) % 3], b: '#334155', skirt: i ? undefined : '#be185d', ...(i ? CHEER : {}) });
  }
  // blossom trees, a family by the table
  for (const [x, z, s] of [[-0.42, 0.18, 0.12], [0.42, -0.02, 0.12], [-0.1, -0.12, 0.11], [0.38, 0.3, 0.1], [-0.38, -0.08, 0.11]] as const) leafy(gp, x, Y0, z, s, '#f9a8d4');
  for (let i = 0; i < 3; i++) fig(gp, -0.06 + i * 0.1, Y0, 0.29, Math.PI, i === 1 ? 0.04 : 0.055, { c: ['#7c3aed', '#facc15', '#0ea5e9'][i], b: '#1f2937', skirt: i === 0 ? '#7c3aed' : undefined, hands: [[-0.2, 0.55, 0.25], [0.2, 0.55, 0.25]] });
};

export const H_FUN2: Record<string, Builder> = {
  sp_wimbledon,
  sp_basketball,
  sp_icehockey,
  sp_monaco,
  sp_iten,
  sp_capoeira,
  sp_polo,
  sp_muaythai,
  sp_rugby,
  sp_camelrace,
  fe_intiraymi,
  fe_uphellyaa,
  fe_trinidad,
  fe_loykrathong,
  fe_argungu,
  fe_scarletsails,
  fe_balloonfiesta,
  fe_kites,
  fe_goroka,
  fe_nowruz,
};
