import * as THREE from 'three';
import { type Builder, type V3, g, add, mat, cyl, rod } from '../prims.ts';

// Spacecraft kit shared by the space packs (space, planets, science2): memoised colour math and batched
// rods/struts (one merged mesh per group instead of a draw call per strut).

export type P2 = [number, number];
const memo = new Map<string, string>();
const C = new THREE.Color(), C2 = new THREE.Color();
/** Memoised colour mix (t quantised to 1/32) — paints run per face, so avoid re-parsing colours. */
export const mx = (a: string, b: string, t: number): string => {
  const q = Math.round(Math.min(1, Math.max(0, t)) * 32), k = a + b + q;
  let r = memo.get(k);
  if (!r) { r = '#' + C.set(a).lerp(C2.set(b), q / 32).getHexString(); memo.set(k, r); }
  return r;
};
export const sh = (a: string, f: number): string => {
  const q = Math.round(f * 32), k = a + '*' + q;
  let r = memo.get(k);
  if (!r) { r = '#' + C.set(a).multiplyScalar(q / 32).getHexString(); memo.set(k, r); }
  return r;
};
/** Subdivides a polyline profile so no piece is longer than `step` (fine rows for painted bands). */
export function fine(prof: P2[], step: number): P2[] {
  const out: P2[] = [prof[0]];
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    const n = Math.max(1, Math.ceil(Math.hypot(r1 - r0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([r0 + ((r1 - r0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}
interface RodIt { p: THREE.Object3D; a: V3; b: V3; r: number; c: string; seg: number }
export let RODS: RodIt[] | null = null;
/** Thin cylinder between two points; batched into one vertex-coloured mesh per model (lattices have hundreds). */
export function bar(p: THREE.Object3D, a: V3, b: V3, r: number, c: string, seg = 4): void {
  if (RODS) RODS.push({ p, a, b, r, c, seg }); else rod(p, a, b, r, c, seg);
}
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _sc = new THREE.Vector3(), _mid = new THREE.Vector3(), _col = new THREE.Color();
function flushRods(gp: THREE.Group, items: RodIt[]): void {
  if (!items.length) return;
  gp.updateMatrixWorld(true);
  _inv.copy(gp.matrixWorld).invert();
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const it of items) {
    const u = g('sp:rod' + it.seg, () => new THREE.CylinderGeometry(1, 1, 1, it.seg, 1, true).toNonIndexed());
    const up = u.getAttribute('position'), un = u.getAttribute('normal');
    _dir.set(it.b[0] - it.a[0], it.b[1] - it.a[1], it.b[2] - it.a[2]);
    const len = _dir.length() || 1e-4;
    _q.setFromUnitVectors(_up, _dir.normalize());
    _mid.set((it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2, (it.a[2] + it.b[2]) / 2);
    _m.compose(_mid, _q, _sc.set(it.r, len, it.r)).premultiply(it.p.matrixWorld).premultiply(_inv);
    _nm.getNormalMatrix(_m);
    _col.set(it.c);
    for (let i = 0; i < up.count; i++) {
      _v.fromBufferAttribute(up, i).applyMatrix4(_m); pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(un, i).applyMatrix3(_nm).normalize(); nor.push(_n.x, _n.y, _n.z);
      col.push(_col.r, _col.g, _col.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  add(gp, geo, mat('#ffffff', { vc: true, flat: true }), 0, 0, 0, 1, 1, 1);
}
/** Runs a builder with rod batching enabled. */
export const batched = (fn: Builder): Builder => (gp, r) => {
  const prev = RODS; RODS = [];
  try { fn(gp, r); flushRods(gp, RODS); } finally { RODS = prev; }
};
/** Horizontal (or vertical) cylinder centred at (x,y,z) along `ax`. */
export function hcyl(p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, L: number, ax: 'x' | 'y' | 'z', seg = 12): THREE.Mesh {
  const m = cyl(p, c, x, y, z, r, L, seg);
  m.position.set(x, y, z);
  if (ax === 'x') m.rotation.z = Math.PI / 2; else if (ax === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
