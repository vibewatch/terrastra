import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type MatOpts, type Paint, type V3, add, mat, tbox, skin, paintFaces, hash3 } from '../prims.ts';

// Town kit shared by the country & landmark packs: frames, painted placement, plinths, columns and tiny visitors.

export function grp(p: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0): THREE.Group {
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = ry; p.add(q); return q;
}
/** Hipped / pyramid roof (w × d footprint tapering to w1 × d1). */
export const hip = (p: THREE.Object3D, c: string, x: number, y: number, z: number, w: number, d: number, h: number, w1 = 0.002, d1 = 0.002, ry = 0) =>
  tbox(p, w, d, w1, d1, h, c, x, y, z, 0, 0, ry);
/** Lathe with per-face paint (not cached; use for the hero shapes only). */
export function plathe(p: THREE.Object3D, prof: [number, number][], x: number, y: number, z: number, seg: number, base: string, paint?: Paint, o: MatOpts = {}): THREE.Mesh {
  const lg = new THREE.LatheGeometry(prof.map(([r, py]) => new THREE.Vector2(r, py)), seg);
  lg.computeVertexNormals();
  return add(p, paintFaces(lg, base, paint), mat('#ffffff', { vc: true, flat: false, ...o }), x, y, z, 1, 1, 1);
}
const SKIN = ['#8d5a3b', '#c68b5e', '#5a3825', '#e0b48a'];
export const PCOL = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316', '#a855f7', '#f8fafc', '#0ea5e9'];
/** Tiny visitor for scale (3 meshes, ~70 triangles). */
export function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, k = 0, s = 1): void {
  passerby(p, x, y, z, 0.023 * s, k, { top: c, skin: SKIN[k % 4] });
}
export function crowd(p: THREE.Object3D, n: number, seed: number, at: (i: number) => [number, number, number] | null, s = 1): void {
  for (let i = 0; i < n; i++) { const q = at(i); if (q) person(p, q[0], q[1], q[2], PCOL[Math.floor(hash3(i, seed, 3) * 8)], i, s); }
}

export interface MOpts { flat?: boolean; metal?: number; rough?: number }
/** Paints a fresh model-space geometry and adds it with a vertex-colour material. */
export function place(p: THREE.Object3D, geo: THREE.BufferGeometry, base: string, paint?: Paint, o: MOpts = {}): THREE.Mesh {
  return add(p, paintFaces(geo, base, paint), mat('#ffffff', { vc: true, flat: o.flat ?? true, metal: o.metal, rough: o.rough }), 0, 0, 0, 1, 1, 1);
}
/** Painted box, base at y (paint sees model coordinates). */
export function pbox(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, base: string, paint?: Paint, seg: V3 = [1, 1, 1], ry = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  geo.translate(0, h / 2, 0);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
  return place(p, geo, base, paint);
}
/** Vertical rim around a disc from the terrain edge down to y=0. */
export function skirt(p: THREE.Object3D, R: number, top: (x: number, z: number) => number, side: (y: number, x: number, z: number) => string, segs = 96, rows = 3): void {
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R, t = top(x, z);
    for (let k = 0; k <= rows; k++) pos.push(x, t * (1 - k / rows), z);
  }
  for (let j = 0; j < segs; j++) for (let k = 0; k < rows; k++) {
    const a = j * (rows + 1) + k, b = a + 1, c = a + rows + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  place(p, geo, '#5b4636', (x, y, z) => side(y, x, z), { rough: 0.9 });
}
/** Closed rock column: rings of radius rad(angle, t) from y0 to y0+h around (cx, cz), capped. */
export function column(p: THREE.Object3D, cx: number, cz: number, y0: number, h: number, rad: (a: number, t: number) => number, base: string,
  paint?: Paint, na = 22, nh = 14, shift?: (t: number) => [number, number], flat = true): THREE.Mesh {
  const rings: V3[][] = [];
  for (let k = 0; k <= nh; k++) {
    const t = k / nh, [ox, oz] = shift ? shift(t) : [0, 0], ring: V3[] = [];
    for (let j = 0; j < na; j++) {
      const a = (j / na) * Math.PI * 2, r = rad(a, t);
      ring.push([cx + ox + Math.cos(a) * r, y0 + h * t, cz + oz + Math.sin(a) * r]);
    }
    rings.push(ring);
  }
  return skin(p, rings, base, { paint, caps: true, flat });
}
