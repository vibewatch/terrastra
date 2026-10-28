import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Paint, add, mat, shade, fbm, paintFaces } from '../prims.ts';

// Stadium kit shared by the sports & fun packs (sports, fun2): plan curves, stands, turf and crowd palettes.

const TAU = Math.PI * 2;

export function grp(p: THREE.Object3D, x: number, y: number, z: number, ry = 0, s = 1): THREE.Group {
  const f = new THREE.Group();
  f.position.set(x, y, z);
  f.rotation.y = ry;
  f.scale.setScalar(s);
  p.add(f);
  return f;
}
export type Q = [number, number, number];
/** Closed plan curve: t∈[0,1) → [x,z] pushed outward by `off`. */
export type Plan = (t: number, off: number) => [number, number];
/** Super-ellipse plan (n=2 ellipse, larger n squarer) — MCG, FNB, oval bowls. */
export const supPlan = (a: number, b: number, n = 2.4): Plan => (t, off) => {
  const th = t * TAU, c = Math.cos(th), s = Math.sin(th);
  return [(a + off) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), (b + off) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
};
export interface StandOpts {
  t0?: number; t1?: number; n: number; rows: number;
  /** offset of the front row from the plan curve, row depth, height of the front wall, rise per row */
  off0: number; dr: number; y0: number; dh: number;
  seat: (t: number, row: number, i: number) => string;
  riser?: string; wall?: string; back?: (t: number, y: number) => string;
  /** extra height of the outer back wall above the top row */
  backH?: number;
}
/** Square-grid surface clipped to an inside() test (pitches, ovals); paint per triangle centroid. */
export function turf(p: THREE.Object3D, inside: (x: number, z: number) => boolean, hx: number, hz: number, n: number, y: number, paint: Paint): void {
  const pos: number[] = [], cs = (hx * 2) / n, nz = Math.ceil((hz * 2) / cs);
  const clamp = (x: number, z: number): [number, number] => {
    if (inside(x, z)) return [x, z];
    let lo = 0, hi = 1;
    for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (inside(x * m, z * m)) lo = m; else hi = m; }
    return [x * lo, z * lo];
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < nz; j++) {
    const x0 = -hx + i * cs, z0 = -hz + j * cs, x1 = Math.min(hx, x0 + cs), z1 = Math.min(hz, z0 + cs);
    if (!inside(x0, z0) && !inside(x1, z0) && !inside(x1, z1) && !inside(x0, z1)) continue;
    const a = clamp(x0, z0), b = clamp(x1, z0), c = clamp(x1, z1), d = clamp(x0, z1);
    pos.push(a[0], y, a[1], d[0], y, d[1], c[0], y, c[1], a[0], y, a[1], c[0], y, c[1], b[0], y, b[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  add(p, paintFaces(geo, '#ffffff', paint), mat('#ffffff', { vc: true, flat: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);
}
/** Mowing stripes along x (or z). */
export const mow = (c: string, w = 0.04, alongX = true, k = 0.1): Paint => (x, _y, z) => {
  const v = alongX ? x : z;
  return shade(c, (Math.floor(v / w + 1000) % 2 ? 1 - k / 2 : 1 + k / 2) * (0.97 + fbm(x * 40, 0, z * 40, 2) * 0.06));
};
export const SK = ['#f1c7a3', '#d9a27a', '#b9805a', '#8d5a3b', '#5c3a24'];
export const HR = ['#2b1d14', '#3b2a1f', '#1c1917', '#6b4226', '#a16207'];
/** Seated / standing spectator as a 2–3 part pawn (cheap crowds near the action). */
export function fan(p: THREE.Object3D, x: number, y: number, z: number, h: number, c: string, arms = false, sit = false): void {
  // spectators face the middle of the scene; a seated fan's h is the seated height
  passerby(p, x, y, z, sit ? h * 1.55 : h, 2, { top: c, ry: Math.atan2(-x, -z), pose: sit ? 'sitGround' : arms ? 'cheer' : undefined });
}
