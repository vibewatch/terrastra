import * as THREE from 'three';
import type { Paint, V3 } from '../prims.ts';
import { add, mat, slab, vnoise, fbm } from '../prims.ts';

// Shared kit for vertex-coloured hero packs: fast cached hex-colour math (quantised so the string caches stay small),
// per-vertex painting and a few common sculpting primitives.

const RGB = new Map<string, number[]>();
function rgb(h: string): number[] {
  let v = RGB.get(h);
  if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(h, v); }
  return v;
}
const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const hx = (r: number, gg: number, b: number) => '#' + ((1 << 24) | (c8(r) << 16) | (c8(gg) << 8) | c8(b)).toString(16).slice(1);
export function mx(a: string, b: string, t: number): string {
  if (t <= 0) return a; if (t >= 1) return b;
  t = Math.round(t * 16) / 16;
  const A = rgb(a), B = rgb(b);
  return hx(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const sh = (a: string, f: number) => { const A = rgb(a); f = Math.round(f * 32) / 32; return hx(A[0] * f, A[1] * f, A[2] * f); };
export const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const VC = new Map<string, THREE.Color>();
export const vc = (h: string) => { let c = VC.get(h); if (!c) { if (VC.size > 8000) VC.clear(); c = new THREE.Color(h); VC.set(h, c); } return c; };
export const speck = (c: string, x: number, y: number, z: number, n: number) => (n ? sh(c, 1 + Math.round((vnoise(x * 34, y * 34, z * 34) - 0.5) * 8) / 4 * n * 1.1) : c);
export const VCM = () => mat('#ffffff', { flat: false, vc: true });

// ---- Vertex painting & surfaces ----
export function vpaint<T extends THREE.Mesh>(m: T, base: string, paint?: Paint): T {
  const geo = m.geometry;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const cols = new Float32Array(pos.count * 3), bc = vc(base);
  for (let i = 0; i < pos.count; i++) {
    const h = paint ? paint(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)) : null;
    const c = h ? vc(h) : bc;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  m.material = VCM();
  return m;
}
/** Grid surface: rings along u∈[0,1], v∈[0,1) wrapping around, fan-capped ends; outward winding is auto-detected. */
export function psurf(p: THREE.Object3D, nu: number, nv: number, f: (u: number, v: number) => V3, c: string, paint?: Paint,
  uvp?: (u: number, v: number, x: number, y: number, z: number) => string | null): THREE.Mesh {
  const pos: number[] = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) pos.push(...f(i / nu, j / nv));
  const idx: number[] = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * nv + j, b = i * nv + ((j + 1) % nv), c2 = (i + 1) * nv + j, d = (i + 1) * nv + ((j + 1) % nv);
    idx.push(a, b, c2, b, d, c2);
  }
  for (const [ring, sgn] of [[0, -1], [nu, 1]] as const) {
    const ctr = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < nv; j++) { cx += pos[(ring * nv + j) * 3]; cy += pos[(ring * nv + j) * 3 + 1]; cz += pos[(ring * nv + j) * 3 + 2]; }
    pos.push(cx / nv, cy / nv, cz / nv);
    for (let j = 0; j < nv; j++) {
      const a = ring * nv + j, b = ring * nv + ((j + 1) % nv);
      if (sgn < 0) idx.push(ctr, b, a); else idx.push(ctr, a, b);
    }
  }
  const mi = Math.floor(nu / 2) * nv, P = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const cen = new THREE.Vector3();
  for (let j = 0; j < nv; j++) cen.add(P(mi + j));
  cen.multiplyScalar(1 / nv);
  const A = P(mi), B = P(mi + 1), C = P(mi + nv);
  const n = new THREE.Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A));
  if (n.dot(A.clone().sub(cen)) < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = vpaint(add(p, geo, VCM(), 0, 0, 0, 1, 1, 1), c, paint);
  if (uvp) {
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) {
      const k = i * nv + j, h = uvp(i / nu, j / nv, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      if (h) { const cc = vc(h); col.setXYZ(k, cc.r, cc.g, cc.b); }
    }
  }
  return m;
}
export interface SpSt { p: V3; w: number; h: number }

// ---- Small shared shapes ----
export type LS = [V3, number, number?];
export const lit = (m: THREE.Mesh) => { m.material = mat('#ffffff', { emissive: '#ffffff' }); };
/** Leaf-shaped flat slab placed in model space (ears, leaves, fins). */
export function leaf(p: THREE.Object3D, c: string, at: V3, w: number, h: number, rot: V3, d = 0.01, tip = 0.15): THREE.Mesh {
  const m = slab(p, [[-w, 0], [-w * 0.9, h * 0.45], [-w * tip, h], [w * tip, h], [w * 0.9, h * 0.45], [w, 0]], d, c, d * 0.35);
  m.position.set(at[0], at[1], at[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const barkP = (bark: string, k = 1): Paint => (x, y, z) => {
  const s = fbm(x * 40 * k, y * 130, z * 40 * k, 2);
  return mx(bark, s > 0.5 ? sh(bark, 1.25) : sh(bark, 0.65), Math.min(0.9, Math.abs(s - 0.5) * 2.6));
};
