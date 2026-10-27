/**
 * Building blocks for the astronomy kits: lit and glowing bodies, star fields, orbit lines that draw themselves in,
 * arrows and a few easing helpers. Everything is added by the caller to `ctx.root`, so the board disposes it.
 */
import * as THREE from 'three';
import { glowTexture, bodyTexture } from '../../sky/common.ts';
import type { BodyId } from '../../../shared/data/solar.ts';
import type { V3 } from './types.ts';

export const D2R = Math.PI / 180;
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
/** 0 → 1 between `t0` and `t0 + dur` seconds (eased): reveal and draw-in timings. */
export const ramp = (el: number, t0: number, dur = 1) => ease((el - t0) / dur);
export const v3 = (p: V3 | THREE.Vector3) => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
const col = (c: string | number) => new THREE.Color(c);

/** Deterministic random numbers (same sky every time). */
export function rng(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** A distant star field on a sphere of radius `r` (a backdrop for every space scene). */
export function starfield(n = 2500, r = 900, seed = 7, size = 1.6): THREE.Points {
  const R = rng(seed), pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([r * s * Math.cos(a), r * s * Math.sin(a), r * z], i * 3);
    const t = R(), b = 0.35 + 0.65 * R() ** 3;
    const c = t < 0.15 ? [0.75, 0.82, 1] : t > 0.9 ? [1, 0.82, 0.62] : [1, 0.97, 0.92];
    colr.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.renderOrder = -10;
  p.frustumCulled = false;
  return p;
}

let glowTex: THREE.Texture | null = null;
/** A soft additive glow (suns, stars, highlights). `size` in scene units. Its texture is shared: not disposed. */
export function glow(color: string | number, size: number, opacity = 1): THREE.Sprite {
  glowTex ??= glowTexture();
  const m = new THREE.SpriteMaterial({ map: glowTex, color: col(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.userData.keepMap = true;
  return s;
}

/** A plain lit ball. */
export function ball(r: number, color: string | number, o: { emissive?: string | number; rough?: number; seg?: number } = {}): THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> {
  const seg = o.seg ?? 48;
  const m = new THREE.MeshStandardMaterial({ color: col(color), roughness: o.rough ?? 0.9, metalness: 0, emissive: o.emissive !== undefined ? col(o.emissive) : new THREE.Color(0) });
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), m);
}

/** A glowing star ball with a halo (the Sun, or any star: pass its colour). */
export function star(r: number, color: string | number = '#ffd27a', halo = 4): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshBasicMaterial({ color: col(color) }));
  g.add(core, glow(color, r * halo, 0.9));
  return g;
}

/**
 * A planet (or the Moon / Sun) with its painted texture, lit by the scene's lights. The texture is painted in a worker
 * and arrives a moment later; until then the ball has the body's flat colour. Textures are cached: not disposed.
 */
export function body(id: BodyId, r: number, color: string | number = '#9aa4ad', w = 512): THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> {
  const m = ball(r, color, { seg: 64 });
  m.userData.keepMap = true;
  bodyTexture(id, w).then(t => { m.material.map = t; m.material.color.set(0xffffff); m.material.needsUpdate = true; }, () => {});
  // planet maps are equirectangular with +z up in our scenes
  m.rotation.x = Math.PI / 2;
  return m;
}

/** Lights for a scene lit by a sun at `at` (point light) plus a little fill so night sides are not pitch black. */
export function sunLight(at: V3 = [0, 0, 0], intensity = 2.6, fill = 0.12): THREE.Group {
  const g = new THREE.Group();
  const p = new THREE.PointLight(0xffffff, intensity, 0, 0);
  p.position.set(...at);
  g.add(p, new THREE.AmbientLight(0xffffff, fill));
  return g;
}
/** Parallel sunlight from direction `from` (toward the origin). */
export function dirLight(from: V3 = [1, 0, 0], intensity = 2.4, fill = 0.12): THREE.Group {
  const g = new THREE.Group();
  const d = new THREE.DirectionalLight(0xffffff, intensity);
  d.position.set(...from);
  g.add(d, d.target, new THREE.AmbientLight(0xffffff, fill));
  return g;
}

/** A polyline. Use `drawIn(line, f)` to reveal it progressively. */
export function line(pts: (V3 | THREE.Vector3)[], color: string | number, o: { opacity?: number; dashed?: boolean; closed?: boolean; dash?: number } = {}): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(v3));
  const mat = o.dashed
    ? new THREE.LineDashedMaterial({ color: col(color), transparent: true, opacity: o.opacity ?? 1, dashSize: o.dash ?? 0.3, gapSize: (o.dash ?? 0.3) * 0.7, depthWrite: false })
    : new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: o.opacity ?? 1, depthWrite: false });
  const l = o.closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
  if (o.dashed) l.computeLineDistances();
  return l;
}
/** Replace a line's points (same count or not). */
export function setLine(l: THREE.Line, pts: (V3 | THREE.Vector3)[]): void {
  const n = pts.length, a = l.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (a && a.count === n) { pts.forEach((p, i) => { const q = v3(p); a.setXYZ(i, q.x, q.y, q.z); }); a.needsUpdate = true; }
  else { l.geometry.dispose(); l.geometry = new THREE.BufferGeometry().setFromPoints(pts.map(v3)); } // a new count needs a new buffer
  l.geometry.computeBoundingSphere();
  if (l.material instanceof THREE.LineDashedMaterial) l.computeLineDistances();
}
/** Show the first fraction `f` of a line (0 … 1). */
export function drawIn(l: THREE.Line | THREE.Mesh, f: number): void {
  const n = l.geometry.index ? l.geometry.index.count : (l.geometry.getAttribute('position')?.count ?? 0);
  l.geometry.setDrawRange(0, Math.max(0, Math.round(n * clamp(f))));
}
/** Points of a circle of radius r in the xy plane (or around `axis`). */
export function circlePts(r: number, n = 128, center: V3 = [0, 0, 0]): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector3(center[0] + r * Math.cos(a), center[1] + r * Math.sin(a), center[2]); });
}
/** Points of an ellipse with semi-major axis a and eccentricity e, focus at the origin, periapsis on +x, in the xy plane. */
export function ellipsePts(a: number, e: number, n = 180): THREE.Vector3[] {
  const b = a * Math.sqrt(1 - e * e);
  return Array.from({ length: n + 1 }, (_, i) => { const E = (i / n) * Math.PI * 2; return new THREE.Vector3(a * (Math.cos(E) - e), b * Math.sin(E), 0); });
}
/** Solve Kepler's equation: mean anomaly M (rad) → eccentric anomaly E. */
export function keplerE(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 12; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
/** Position on a Keplerian ellipse (focus at origin, xy plane) at orbital phase `p` (0 … 1 of a period, from periapsis). */
export function orbitPos(a: number, e: number, p: number, out = new THREE.Vector3()): THREE.Vector3 {
  const E = keplerE(((p % 1) + 1) % 1 * Math.PI * 2, e);
  return out.set(a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), 0);
}

/** An arrow you can re-aim every frame. Length in scene units; `head` is the head length. */
export class Arrow extends THREE.Group {
  private shaft: THREE.Mesh; private tip: THREE.Mesh;
  constructor(color: string | number, private thick = 0.04) {
    super();
    const m = new THREE.MeshBasicMaterial({ color: col(color), transparent: true, depthWrite: false });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), m);
    this.tip = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14), m);
    this.add(this.shaft, this.tip);
  }
  /** Point from `from` along `vec` (its length is the arrow's length). */
  set(from: THREE.Vector3 | V3, vec: THREE.Vector3 | V3): this {
    const f = v3(from), d = v3(vec), L = d.length();
    this.visible = L > 1e-6;
    if (!this.visible) return this;
    const head = Math.min(L * 0.35, this.thick * 7), t = this.thick;
    this.position.copy(f);
    this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    this.shaft.scale.set(t, L - head, t); this.shaft.position.set(0, (L - head) / 2, 0);
    this.tip.scale.set(t * 2.6, head, t * 2.6); this.tip.position.set(0, L - head / 2, 0);
    return this;
  }
  set opacity(a: number) { (this.shaft.material as THREE.MeshBasicMaterial).opacity = a; }
}

/** A flat translucent disc or ring (orbit planes, zones, the habitable zone). */
export function ring(r0: number, r1: number, color: string | number, opacity = 0.25, seg = 128): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(new THREE.RingGeometry(r0, r1, seg, 1), m);
}

/** Set the opacity of every material under `o` (fades whole groups in and out). */
export function fade(o: THREE.Object3D, a: number): void {
  o.visible = a > 0.005;
  o.traverse(x => {
    const mat = (x as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      m.userData.a0 ??= m.opacity;
      m.transparent = true;
      m.opacity = m.userData.a0 * a;
    }
  });
}

/** Free GPU memory under `o` (geometries, materials and their own textures). */
export function disposeTree(o: THREE.Object3D): void {
  o.traverse(x => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const k of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      if (!x.userData.keepMap) for (const v of Object.values(k)) if (v instanceof THREE.Texture) v.dispose();
      k.dispose();
    }
  });
}

/** A canvas texture painted once (gradients, discs, light curves drawn in 3D). */
export function canvasTex(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  paint(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Star colour for a surface temperature (K), roughly blackbody. */
export function tempColor(T: number): THREE.Color {
  const t = T / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
  return new THREE.Color(clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255);
}
