import * as THREE from 'three';
import type { Paint, V3 } from '../prims.ts';
import { add, mat, g, sweep, rbox, box, cyl, hash3, vnoise } from '../prims.ts';
import { pblob } from '../animals.ts';
import { mx, sh, sst, vc, speck, VCM, vpaint, psurf, type SpSt } from './sculpt.ts';

// Sculpting kit shared by the travelling hero packs (routes2, journeys): lofted bodies, foils, sails, hulls and birds.


// ---- Small sculpting helpers (adapted from animals.ts) ----
const ESEG = [[6, 4], [8, 6], [12, 8], [16, 11]];
export const ellip = (p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, rotx = 0, rotz = 0) => {
  const r = Math.max(rx, ry, rz), [a, b] = ESEG[r < 0.006 ? 0 : r < 0.02 ? 1 : r < 0.045 ? 2 : 3];
  return add(p, g('tk-esph' + a, () => new THREE.SphereGeometry(1, a, b)), mat(c, { flat: false }), x, y, z, rx, ry, rz, roty, rotx, rotz);
};
export function bead(p: THREE.Object3D, x: number, y: number, z: number, r: number, c = '#111827'): void {
  ellip(p, c, x, y, z, r);
  ellip(p, '#f4f4f4', x + r * 0.3, y + r * 0.35, z + r * 0.62, r * 0.3);
}
export function grp(p: THREE.Object3D, pos: V3, rot: V3 = [0, 0, 0], s = 1, order: THREE.EulerOrder = 'YXZ'): THREE.Group {
  const gg = new THREE.Group();
  gg.position.set(pos[0], pos[1], pos[2]);
  gg.rotation.set(rot[0], rot[1], rot[2], order);
  gg.scale.setScalar(s);
  p.add(gg);
  return gg;
}
export function vblob(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, paint?: Paint, rot: V3 = [0, 0, 0], seg = 16): THREE.Mesh {
  return vpaint(pblob(p, c, x, y, z, rx, ry, rz, undefined, rot, seg), c, paint);
}
/** Body lofted along a spine with elliptical sections; `shape(u, a)` returns a radial multiplier. */
export function spine(p: THREE.Object3D, st: SpSt[], c: string, paint?: Paint,
  o: { nu?: number; nv?: number; side?: V3; shape?: (u: number, a: number) => number; uvp?: (u: number, a: number, x: number, y: number, z: number) => string | null } = {}): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(...s.p)), false, 'centripetal');
  const nu = o.nu ?? (st.length - 1) * 6, nv = o.nv ?? 18;
  const side = new THREE.Vector3(...(o.side ?? [1, 0, 0]));
  const fr: { P: THREE.Vector3; S: THREE.Vector3; N: THREE.Vector3; w: number; h: number }[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, P = curve.getPoint(u), T = curve.getTangent(u);
    const N = new THREE.Vector3().crossVectors(T, side).normalize();
    const S = new THREE.Vector3().crossVectors(N, T).normalize();
    const f = u * (st.length - 1), k = Math.min(st.length - 2, Math.floor(f)), t = f - k, s = t * t * (3 - 2 * t);
    fr.push({ P, S, N, w: st[k].w + (st[k + 1].w - st[k].w) * s, h: st[k].h + (st[k + 1].h - st[k].h) * s });
  }
  return psurf(p, nu, nv, (u, v) => {
    const F = fr[Math.round(u * nu)], a = v * Math.PI * 2, m = o.shape ? o.shape(u, a) : 1;
    const ca = Math.cos(a) * F.w * m, sa = Math.sin(a) * F.h * m;
    return [F.P.x + F.S.x * ca + F.N.x * sa, F.P.y + F.S.y * ca + F.N.y * sa, F.P.z + F.S.z * ca + F.N.z * sa];
  }, c, paint, o.uvp ? (u, v, x, y, z) => o.uvp!(u, v * Math.PI * 2, x, y, z) : undefined);
}
/** Streamlined fin / fluke / flipper: span stations root→tip with leading & trailing edge points and thickness along `up`. */
export function foil(p: THREE.Object3D, c: string, st: { le: V3; te: V3; t: number }[], up: V3, paint?: Paint, nu = 12, nv = 12): THREE.Mesh {
  const L = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(...s.le)), false, 'centripetal');
  const T = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(...s.te)), false, 'centripetal');
  const U = new THREE.Vector3(...up).normalize(), le = new THREE.Vector3(), te = new THREE.Vector3();
  return psurf(p, nu, nv, (u, v) => {
    L.getPoint(u, le); T.getPoint(u, te);
    const f = u * (st.length - 1), k = Math.min(st.length - 2, Math.floor(f)), th = st[k].t + (st[k + 1].t - st[k].t) * (f - k);
    const a = v * Math.PI * 2, ch = (1 - Math.cos(a)) / 2, thick = Math.sin(a) * th * Math.pow(Math.max(0, 1 - ch), 0.7) * Math.pow(ch + 0.02, 0.3) * 1.6;
    return [le.x + (te.x - le.x) * ch + U.x * thick, le.y + (te.y - le.y) * ch + U.y * thick, le.z + (te.z - le.z) * ch + U.z * thick];
  }, c, paint);
}
const DROP = () => g('tk-drop', () => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(Math.max(1e-4, 0.5 * Math.sin(Math.PI * Math.pow(t, 0.62))), t)); }
  const lg = new THREE.LatheGeometry(pts, 7);
  lg.computeVertexNormals();
  return lg;
});
const _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
/** Teardrop from base a to pointed tip b (tufts, horns, claws, beards, feathers). */
export function drop(p: THREE.Object3D, c: string, a: V3, b: V3, r: number, rz = r): THREE.Mesh {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length() || 1e-4;
  const m = add(p, DROP(), mat(c, { flat: false }), a[0], a[1], a[2], r * 2, len, rz * 2);
  m.quaternion.setFromUnitVectors(_Y, _d.normalize());
  return m;
}
const _m4 = new THREE.Matrix4(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
/** Flattened teardrop a→b whose flat face looks along `up` (feathers, manes, claws). */
export function blade(p: THREE.Object3D, c: string, a: V3, b: V3, w: number, t: number, up: V3): THREE.Mesh {
  _by.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _by.length() || 1e-4;
  _by.multiplyScalar(1 / len);
  _bz.set(up[0], up[1], up[2]).addScaledVector(_by, -(up[0] * _by.x + up[1] * _by.y + up[2] * _by.z));
  if (_bz.lengthSq() < 1e-8) _bz.set(_by.y, _by.z, _by.x);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  const m = add(p, DROP(), mat(c, { flat: false }), a[0], a[1], a[2], w * 2, len, t * 2);
  m.quaternion.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz));
  return m;
}
/** Smooth tube through points with ball ends. */
export function tube(p: THREE.Object3D, pts: V3[], r0: number, r1: number, c: string, radial = 7, paint?: Paint): THREE.Mesh {
  const m = sweep(p, pts.map((pt, i) => ({ p: pt, w: r0 + (r1 - r0) * (i / Math.max(1, pts.length - 1)) })), c, { radial, sub: 4, paint, flat: false });
  ellip(p, c, ...pts[0], r0 * 0.98);
  ellip(p, c, ...pts[pts.length - 1], r1 * 0.98);
  return m;
}
/** Straight cylinder between two points (masts, yards, oars, ropes). */
export function rod(p: THREE.Object3D, a: V3, b: V3, r: number, c: string, seg = 6, r1 = r): THREE.Mesh {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length() || 1e-4;
  const m = add(p, g('tk-cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1)), mat(c, { flat: false }), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r, len, r);
  if (r1 !== r) m.geometry = g(`tk-cone${seg}:${(r1 / r).toFixed(2)}`, () => new THREE.CylinderGeometry(r1 / r, 1, 1, seg, 1));
  m.quaternion.setFromUnitVectors(_Y, _d.normalize());
  return m;
}

/**
 * Triangle soup with explicit per-face colours and (optionally) smooth normals — sails, wings and flags that need
 * crisp painted panels on both faces (the baked material is single-sided).
 */
export class Soup {
  pos: number[] = []; nor: number[] = []; col: number[] = [];
  tri(a: V3, b: V3, c: V3, colour: string, na?: V3, nb?: V3, nc?: V3): void {
    const C = vc(colour);
    let n0 = na, n1 = nb, n2 = nc;
    if (!n0 || !n1 || !n2) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
      n0 = n1 = n2 = [nx / l, ny / l, nz / l];
    }
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...n0, ...n1!, ...n2!);
    for (let i = 0; i < 3; i++) this.col.push(C.r, C.g, C.b);
  }
  quad(a: V3, b: V3, c: V3, d: V3, colour: string): void { this.tri(a, b, c, colour); this.tri(a, c, d, colour); }
  /**
   * Two-sided grid sheet f(u,v) with smooth normals; front/back painters get the cell centre (u,v).
   * Each side is pushed out by t/2 along the surface normal.
   */
  sheet(nu: number, nv: number, f: (u: number, v: number) => V3, front: (u: number, v: number) => string, back: (u: number, v: number) => string = front, t = 0.004,
    us?: number[], vs?: number[], sides: 0 | 1 | -1 = 0): void {
    const U = us ?? Array.from({ length: nu + 1 }, (_, i) => i / nu), Vv = vs ?? Array.from({ length: nv + 1 }, (_, j) => j / nv);
    const P: V3[][] = U.map(u => Vv.map(v => f(u, v)));
    const N: V3[][] = U.map((_u, i) => Vv.map((_v, j) => {
      const a = P[Math.min(i + 1, U.length - 1)][j], b = P[Math.max(i - 1, 0)][j], c = P[i][Math.min(j + 1, Vv.length - 1)], d = P[i][Math.max(j - 1, 0)];
      const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      const nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0], l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l] as V3;
    }));
    const off = (i: number, j: number, s: number): V3 => [P[i][j][0] + N[i][j][0] * s, P[i][j][1] + N[i][j][1] * s, P[i][j][2] + N[i][j][2] * s];
    const neg = (n: V3): V3 => [-n[0], -n[1], -n[2]];
    for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < Vv.length - 1; j++) {
      const uc = (U[i] + U[i + 1]) / 2, vcn = (Vv[j] + Vv[j + 1]) / 2, cf = front(uc, vcn), cb = back(uc, vcn), h = t / 2;
      if (sides >= 0) {
        this.tri(off(i, j, h), off(i + 1, j, h), off(i + 1, j + 1, h), cf, N[i][j], N[i + 1][j], N[i + 1][j + 1]);
        this.tri(off(i, j, h), off(i + 1, j + 1, h), off(i, j + 1, h), cf, N[i][j], N[i + 1][j + 1], N[i][j + 1]);
      }
      if (sides <= 0) {
        this.tri(off(i, j, -h), off(i + 1, j + 1, -h), off(i + 1, j, -h), cb, neg(N[i][j]), neg(N[i + 1][j + 1]), neg(N[i + 1][j]));
        this.tri(off(i, j, -h), off(i, j + 1, -h), off(i + 1, j + 1, -h), cb, neg(N[i][j]), neg(N[i][j + 1]), neg(N[i + 1][j + 1]));
      }
    }
  }
  mesh(p: THREE.Object3D): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return add(p, geo, VCM(), 0, 0, 0, 1, 1, 1);
  }
}

/** Wing (or sail) hinge: a 'flap' group that the globe & preview rock about its local z (forward) axis; left side mirrored. */
export function hinge(p: THREE.Object3D, side: number, at: V3): THREE.Group {
  const m = grp(p, [0, 0, 0]);
  m.scale.set(side, 1, 1);
  const f = grp(m, [side * at[0], at[1], at[2]]);
  f.name = 'flap';
  return f;
}


/** Flat foam patches where a body breaks the surface (y≈0) — not a base disc, just water churn. */
export function foam(p: THREE.Object3D, pts: [number, number, number][]): void {
  for (const [x, z, r] of pts) vblob(p, '#e8f4fb', x, 0.004, z, r, 0.006, r * 0.7, (px, _py, pz) => mx('#ffffff', '#9ec9de', sst(0.35, 0.75, vnoise(px * 50, 1, pz * 50))), [0, 0, 0], 12);
}

// ======================================================================================================
// Ships: lofted hulls, decks, bulwarks and two-sided painted sails
// ======================================================================================================
interface HullOpts {
  L: number; B: number; sheer: (u: number) => number; half: (u: number) => number; keel: (u: number) => number; full: number;
  /** d: 0 at the gunwale → 1 at the keel (bands follow the sheer); y: height. */
  paint: (u: number, d: number, y: number) => string; deck: string | ((u: number, w: number) => string); tumble?: number; nu?: number; nv?: number; bands?: number[];
  bulwark?: number; bulC?: string; z0?: number;
}
export interface Hull { gun: (u: number, side: number) => V3; z: (u: number) => number; top: (u: number) => number; hb: (u: number) => number; pt: (u: number, v: number) => V3 }
/** Hull loft (u stern→bow, v starboard gunwale→keel→port gunwale) with transom fans, flush planked deck and bulwarks. */
export function hull(p: THREE.Object3D, o: HullOpts): Hull {
  const z = (u: number) => (o.z0 ?? 0) - o.L / 2 + o.L * u, hb = (u: number) => o.B * o.half(u), tm = o.tumble ?? 0;
  const sec = (u: number, v: number): V3 => {
    const ph = Math.PI * v, s = Math.sin(ph), c = Math.cos(ph), top = o.sheer(u), k = o.keel(u);
    const y = top - (top - k) * Math.pow(s, o.full);
    return [Math.sign(c) * Math.pow(Math.abs(c), 0.8) * hb(u) * (1 - tm * Math.pow(1 - s, 2)), y, z(u)];
  };
  const sp = new Soup(), nu = o.nu ?? 24, nv = o.nv ?? 12;
  const dset = new Set<number>(Array.from({ length: nv + 1 }, (_, j) => j / nv));
  for (const d of o.bands ?? []) { dset.add(d / 2); dset.add(1 - d / 2); }
  const vs = [...dset].sort((a, b) => a - b);
  sp.sheet(nu, vs.length - 1, sec, (u, v) => o.paint(u, 1 - Math.abs(1 - 2 * v), sec(u, v)[1]), undefined, 0, undefined, vs, 1);
  // Transom / bow fans where the hull still has width
  for (const [u, sgn] of [[0, 1], [1, -1]] as const) {
    if (hb(u) < 0.004) continue;
    const ring = Array.from({ length: nv + 1 }, (_, j) => sec(u, j / nv)), cy = ring.reduce((a, q) => a + q[1], 0) / ring.length;
    const C: V3 = [0, cy, z(u)];
    for (let j = 0; j < nv; j++) {
      const col = o.paint(u, 1 - Math.abs(1 - 2 * (j + 0.5) / nv), (ring[j][1] + ring[j + 1][1] + cy) / 3);
      if (sgn > 0) sp.tri(C, ring[j], ring[j + 1], col); else sp.tri(C, ring[j + 1], ring[j], col);
    }
  }
  // Deck planking
  const dk = o.deck;
  sp.sheet(nu, 6, (u, w) => { const g0 = sec(u, 0)[0]; return [(w * 2 - 1) * g0, o.sheer(u) - 0.003, z(u)]; },
    typeof dk === 'string' ? (u, w) => (Math.floor(w * 6) % 2 ? dk : sh(dk, 0.9 + hash3(Math.floor(u * 9), Math.floor(w * 6), 1) * 0.1)) : dk, undefined, 0, undefined, undefined, 1);
  // Bulwarks: a thin two-sided strip standing on the gunwale
  if (o.bulwark) for (const sd of [-1, 1]) {
    sp.sheet(nu, 1, (u, v) => { const q = sec(u, sd > 0 ? 0 : 1); return [q[0], q[1] + v * o.bulwark!, q[2]]; }, () => o.bulC ?? '#5a3b22', () => sh(o.bulC ?? '#5a3b22', 0.8), 0.006);
  }
  sp.mesh(p);
  return { gun: (u, side) => { const q = sec(u, side > 0 ? 0 : 1); return [q[0], q[1], q[2]]; }, z, top: o.sheer, hb, pt: sec };
}
/** Square sail hanging from a yard: u across (port→starboard), v down; bellies forward (+z) and gets a yard spar. */
export function squareSail(p: THREE.Object3D, at: V3, w: number, h: number, belly: number, paint: (u: number, v: number) => string, us?: number[], vs?: number[], foot = 1): void {
  const sp = new Soup();
  sp.sheet(6, 5, (u, v) => {
    const ww = w * (1 + (foot - 1) * v);
    return [at[0] + (u - 0.5) * ww, at[1] - v * h, at[2] + belly * Math.pow(Math.sin(Math.PI * u), 0.7) * Math.sin(Math.PI * (0.12 + 0.8 * v))];
  }, paint, paint, 0.005, us, vs);
  sp.mesh(p);
  rod(p, [at[0] - w * 0.56, at[1] + 0.006, at[2]], [at[0] + w * 0.56, at[1] + 0.006, at[2]], 0.0055, '#4a3420', 6);
}
/** Triangular (lateen / crab-claw) sheet A-B-C with a belly along `bv`. */
export function triSail(p: THREE.Object3D, A: V3, B: V3, C: V3, bv: V3, paint: (u: number, v: number) => string, dip = 0): void {
  const sp = new Soup();
  sp.sheet(6, 5, (u, v) => {
    const t = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) , d = dip * Math.sin(Math.PI * u) * (1 - v);
    const x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u, zz = A[2] + (B[2] - A[2]) * u;
    return [x + (C[0] - x) * v + bv[0] * t + (C[0] - x) * d, y + (C[1] - y) * v + bv[1] * t + (C[1] - y) * d, zz + (C[2] - zz) * v + bv[2] * t + (C[2] - zz) * d];
  }, paint, paint, 0.005);
  sp.mesh(p);
}
/** Small waving flag / pennant from a staff top. */
export function flag(p: THREE.Object3D, at: V3, w: number, h: number, paint: (u: number, v: number) => string, dir = -1, taper = 0, nu = 5, nv = 3): void {
  const sp = new Soup();
  sp.sheet(nu, nv, (u, v) => [at[0] + Math.sin(u * 5) * 0.012 * u, at[1] - v * h * (1 - taper * u) - (taper * u * h) / 2 * 0, at[2] + dir * u * w], paint, paint, 0.003);
  sp.mesh(p);
}
/** Shroud fan: lines from a masthead down to the gunwale on both sides. */
export function shrouds(p: THREE.Object3D, top: V3, H: Hull, us: number[], c = '#2a2018'): void {
  for (const sd of [-1, 1]) for (const u of us) { const gq = H.gun(u, sd); rod(p, top, [gq[0] * 1.04, gq[1] + 0.01, gq[2]], 0.0018, c, 4); }
}
/** Foam at the bow wave and wake (flat churn at y≈0, not a base). */
export function wake(p: THREE.Object3D, zb: number, zs: number, w: number): void {
  foam(p, [[0, zb, w * 0.9], [-w * 0.9, zb - 0.06, w * 0.5], [w * 0.9, zb - 0.06, w * 0.5], [0, zs, w * 0.9], [0, zs - 0.08, w * 0.6]]);
}

/** Carrack / nao (Victoria, Santa María) or caravel: black or brown round hull, castles, square courses with crosses. */
export function carrack(p: THREE.Object3D, o: { hull: string; wale: string; upper: string; sail: string; cross: string; caravel?: boolean; flagP: (u: number, v: number) => string; crossAll?: boolean;
  crossFn?: (u: number, v: number) => string; grid?: number[] }): Hull {
  const cv = !!o.caravel;
  const H = hull(p, {
    L: 0.78, B: cv ? 0.1 : 0.12, full: 0.75, tumble: 0.18, bulwark: 0.03, bulC: o.upper,
    sheer: u => 0.15 + 0.07 * Math.pow(1 - u, 2.4) + (cv ? 0.02 : 0.06) * Math.pow(u, 3),
    half: u => Math.min(1, 0.62 + 1.4 * u) * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, u - 0.55) / 0.45, 2.2)), 0.55),
    keel: u => 0.0 + 0.03 * Math.pow(1 - u, 2) + 0.08 * Math.pow(Math.max(0, u - 0.7) / 0.3, 2),
    bands: [0.1, 0.13, 0.3, 0.33, 0.5, 0.53, 0.8],
    paint: (_u, d) => (d > 0.8 ? '#2e2620' : d < 0.1 ? o.upper : (d > 0.1 && d < 0.13) || (d > 0.3 && d < 0.33) || (d > 0.5 && d < 0.53) ? o.wale : o.hull),
    deck: '#9a7a52',
  });
  // Aftercastle (two tiers) with a carved rail, forecastle overhanging the bow
  const aft = cv ? 0.04 : 0.07;
  rbox(p, o.upper, 0, H.top(0.08) + aft / 2, H.z(0.1), H.hb(0.1) * 1.7, aft, 0.16, 0.008);
  rbox(p, sh(o.upper, 0.85), 0, H.top(0.08) + aft + 0.02, H.z(0.04), H.hb(0.05) * 1.5, 0.04, 0.08, 0.006);
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) box(p, '#e0b54a', sd * H.hb(0.1) * 0.86, H.top(0.08) + aft * 0.6, H.z(0.03 + i * 0.045), 0.004, 0.012, 0.016);
  box(p, '#c79a3a', 0, H.top(0.08) + aft * 0.15, H.z(0.0) - 0.004, H.hb(0.0) * 1.8, 0.008, 0.006);
  if (!cv) {
    rbox(p, o.upper, 0, H.top(0.93) + 0.025, H.z(0.88), H.hb(0.84) * 1.9, 0.05, 0.14, 0.008);
    box(p, o.wale, 0, H.top(0.93) + 0.052, H.z(0.88), H.hb(0.84) * 1.95, 0.006, 0.145);
  }
  // Bowsprit, masts, tops
  const yd = H.top(0.5);
  rod(p, [0, H.top(0.9) + 0.03, H.z(0.86)], [0, H.top(0.9) + 0.11, H.z(1) + 0.17], 0.007, '#5b4027', 6);
  const mast = (u: number, h: number, r: number): V3 => { const zz = H.z(u); rod(p, [0, yd - 0.02, zz], [0, yd + h, zz], r, '#5b4027', 7, r * 0.6); return [0, yd + h, zz]; };
  const fm = mast(0.74, cv ? 0.42 : 0.48, 0.008), mm = mast(0.47, cv ? 0.55 : 0.66, 0.01), zm = mast(0.2, cv ? 0.4 : 0.4, 0.007);
  if (!cv) cyl(p, '#4a3420', 0, mm[1] - 0.13, mm[2], 0.026, 0.025, 10);
  const crossP = o.crossFn ?? ((u: number, v: number) => (Math.abs(u - 0.5) < 0.085 && v > 0.15 && v < 0.85) || (Math.abs(v - 0.4) < 0.075 && u > 0.2 && u < 0.8) ? o.cross : sh(o.sail, 0.96 + 0.04 * (Math.floor(u * 6) % 2)));
  const plainP = (u: number) => sh(o.sail, 0.95 + 0.05 * (Math.floor(u * 6) % 2));
  const US = o.grid ?? [0, 0.2, 0.415, 0.585, 0.8, 1], VS = o.grid ?? [0, 0.15, 0.325, 0.475, 0.85, 1];
  squareSail(p, [0, mm[1] - 0.2, mm[2] + 0.01], cv ? 0.3 : 0.38, cv ? 0.26 : 0.3, 0.06, crossP, US, VS, 1.08);
  squareSail(p, [0, mm[1] - 0.02, mm[2] + 0.005], cv ? 0.17 : 0.22, 0.14, 0.035, o.crossAll ? crossP : plainP, o.crossAll ? US : undefined, o.crossAll ? VS : undefined, 1.25);
  squareSail(p, [0, fm[1] - 0.15, fm[2] + 0.01], cv ? 0.24 : 0.3, cv ? 0.21 : 0.24, 0.05, crossP, US, VS, 1.08);
  if (!cv) squareSail(p, [0, fm[1] - 0.01, fm[2] + 0.005], 0.17, 0.11, 0.03, plainP, undefined, undefined, 1.25);
  // Lateen mizzen and a small spritsail under the bowsprit
  const lz = zm[2];
  rod(p, [0, zm[1] - 0.36, lz + 0.14], [0, zm[1] + 0.04, lz - 0.16], 0.0045, '#4a3420', 5);
  triSail(p, [0.002, zm[1] - 0.35, lz + 0.13], [0.002, zm[1] + 0.03, lz - 0.15], [0.004, yd + 0.03, lz - 0.12], [0.03, 0, 0], plainP);
  if (!cv) squareSail(p, [0, H.top(0.9) + 0.08, H.z(1) + 0.08], 0.14, 0.08, 0.025, plainP);
  shrouds(p, [0, mm[1] - 0.12, mm[2]], H, [0.4, 0.44, 0.48]);
  shrouds(p, [0, fm[1] - 0.1, fm[2]], H, [0.68, 0.72]);
  rod(p, mm, [0, fm[1] - 0.05, fm[2]], 0.0016, '#2a2018', 4);
  rod(p, fm, [0, H.top(0.9) + 0.1, H.z(1) + 0.14], 0.0016, '#2a2018', 4);
  rod(p, mm, [0, zm[1], zm[2]], 0.0016, '#2a2018', 4);
  // Flags
  rod(p, mm, [0, mm[1] + 0.05, mm[2]], 0.003, '#3a2a1a', 4);
  flag(p, [0, mm[1] + 0.05, mm[2]], 0.09, 0.055, o.flagP);
  flag(p, [0, fm[1] + 0.01, fm[2]], 0.08, 0.016, () => '#c8281e');
  rod(p, [0, H.top(0.04) + aft + 0.04, H.z(0.02)], [0, H.top(0.04) + aft + 0.12, H.z(0.0)], 0.003, '#3a2a1a', 4);
  flag(p, [0, H.top(0.04) + aft + 0.12, H.z(0.0)], 0.07, 0.045, o.flagP);
  // Gun ports, rudder, wake
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const q = H.gun(0.3 + i * 0.12, sd); box(p, '#151210', q[0] * 1.01, 0.1, q[2], 0.006, 0.014, 0.018); }
  box(p, sh(o.hull, 1.4), 0, 0.07, H.z(0) - 0.012, 0.012, 0.12, 0.03);
  wake(p, H.z(1) + 0.02, H.z(0) - 0.06, 0.07);
  return H;
}
/** Battened junk lug sail: a fan of horizontal battens, top yard rising aft, mast a third back from the luff. */
export function lugSail(p: THREE.Object3D, mast: V3, w: number, h: number, yaw: number, c: string): void {
  const gs = grp(p, mast, [0, yaw, 0]);
  const nb = 6, sp = new Soup();
  const pt = (u: number, v: number): V3 => {
    const x = (u - 0.32) * w * (1 + 0.12 * v), y = -h + v * h + (u - 0.32) * 0.18 * h * v;
    return [x, y, 0.035 * Math.sin(Math.PI * u) * (0.4 + 0.6 * Math.abs(Math.sin(v * nb * Math.PI)))];
  };
  sp.sheet(6, nb * 2, pt, (u, v) => sh(c, 0.85 + 0.15 * ((Math.floor(v * nb) + Math.floor(u * 3)) % 2)), (_u, v) => sh(c, Math.floor(v * nb) % 2 ? 0.92 : 0.84), 0.005);
  sp.mesh(gs);
  for (let k = 0; k <= nb; k++) { const v = k / nb; rod(gs, pt(-0.04, v), pt(1.04, v), 0.0035, '#3a2618', 4); }
  // Sheet lines fanning from the batten ends
  for (let k = 2; k <= nb; k += 2) rod(gs, pt(1.04, k / nb), [w * 0.72, -h - 0.04, -0.12], 0.0012, '#2a1d14', 3);
}

// ======================================================================================================
// Birds
// ======================================================================================================
export interface BirdOpts {
  body: string; belly: string; head: string; cap?: string; bill: string; billL: number; billUp?: number; legs?: string;
  wingUp: (u: number, v: number) => string; wingDn: (u: number, v: number) => string; span: number; chord: number; sweep: number;
  tailFork?: number; tail: string; throat?: string;
}
/** A flying bird ~0.4 long in local units: lofted body, flapping two-sided wings, fanned or forked tail. */
export function bird(p: THREE.Object3D, at: V3, yaw: number, s: number, o: BirdOpts, bank = 0, beat = 0.25): void {
  const b = grp(p, at, [0, yaw, bank], s);
  spine(b, [
    { p: [0, 0.005, -0.15], w: 0.018, h: 0.012 }, { p: [0, 0, -0.09], w: 0.042, h: 0.036 }, { p: [0, 0, 0.0], w: 0.055, h: 0.05 },
    { p: [0, 0.008, 0.08], w: 0.044, h: 0.042 }, { p: [0, 0.02, 0.13], w: 0.032, h: 0.032 }, { p: [0, 0.026, 0.17], w: 0.03, h: 0.029 }, { p: [0, 0.024, 0.2], w: 0.014, h: 0.012 },
  ], o.body, (x, y, z, _nx, ny) => {
    if (o.cap && z > 0.115 && ny > -0.1 + (z - 0.115) * 2) return o.cap;
    if (o.throat && z > 0.1 && ny < -0.15 && z > 0.12 - ny * 0.03) return o.throat;
    if (z > 0.13) return ny < -0.2 ? mx(o.head, o.belly, 0.6) : o.head;
    return speck(ny < 0 ? mx(o.body, o.belly, sst(0.05, -0.55, ny)) : o.body, x, y, z, 0.06);
  }, { nu: 30, nv: 14 });
  // Bill (gently upturned for godwits), eyes
  const bl = o.billL, up = o.billUp ?? 0;
  tube(b, [[0, 0.022, 0.198], [0, 0.022 + up * 0.3, 0.198 + bl * 0.5], [0, 0.022 + up, 0.198 + bl]], 0.007, 0.0018, o.bill, 6);
  for (const sx of [-1, 1]) bead(b, sx * 0.022, 0.035, 0.175, 0.0065, '#0a0a0a');
  // Tail: forked streamers (tern) or a short fan
  const fork = o.tailFork ?? 0;
  for (const sx of [-1, 1]) {
    blade(b, o.tail, [sx * 0.006, 0.006, -0.13], [sx * (0.03 + fork * 0.2), 0.006, -0.2 - fork], 0.016 - fork * 0.03, 0.003, [0, 1, 0]);
    blade(b, o.tail, [0, 0.006, -0.13], [sx * 0.012, 0.004, -0.2], 0.018, 0.003, [0, 1, 0]);
  }
  if (o.legs) for (const sx of [-1, 1]) tube(b, [[sx * 0.015, -0.03, -0.05], [sx * 0.012, -0.03, -0.13]], 0.004, 0.003, o.legs, 5);
  // Wings on flap hinges at the shoulders
  for (const sx of [-1, 1]) {
    const f = hinge(b, sx, [0.035, 0.02, 0.04]);
    const w = grp(f, [0, 0, 0], [0, 0, beat]);
    const sp = new Soup(), S = o.span, C = o.chord, sw = o.sweep;
    sp.sheet(7, 4, (u, v) => {
      const le = 0.03 - sw * u * u, tip = Math.pow(u, 1.3), ch = C * (1 - 0.75 * tip) * (1 - 0.15 * u);
      const z = le - v * ch - (u > 0.7 ? (u - 0.7) * 0.4 * C : 0) * v;
      return [u * S, 0.03 * Math.sin(u * Math.PI) - 0.02 * u * u - v * 0.008, z];
    }, o.wingUp, o.wingDn, 0.007);
    sp.mesh(w);
  }
}
