import * as THREE from 'three';
import type { ModelRecipe } from '../../shared/data/types.ts';

// Shared CAD + organic modelling primitives. Every model is ~1 unit tall/long, base at y=0, front +z.
// Static meshes are later baked (kit.ts) into a few vertex-colored draw calls with ambient occlusion.

export type V3 = [number, number, number];
export type Builder = (gp: THREE.Group, r: ModelRecipe) => void;
export const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

export interface MatOpts { emissive?: string; transparent?: number; metal?: number; flat?: boolean; rough?: number; vc?: boolean }
const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const k = color + JSON.stringify(opts);
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.65,
      metalness: opts.metal ?? 0.08,
      flatShading: opts.flat ?? true,
      vertexColors: opts.vc ?? false,
    });
    // no explicit finish: the baker infers one from the colour (see inferPbr)
    if (opts.rough === undefined && opts.metal === undefined) m.userData.autoPbr = true;
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 0.85; }
    if (opts.transparent !== undefined) { m.transparent = true; m.opacity = opts.transparent; }
    mats.set(k, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();
export function g<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let x = geos.get(key) as T | undefined;
  if (!x) { x = make(); geos.set(key, x); }
  return x;
}
export const BOX = () => g('box', () => new THREE.BoxGeometry(1, 1, 1));
export const CYL = (s = 8) => g('cyl' + s, () => new THREE.CylinderGeometry(0.5, 0.5, 1, s));
export const CONE = (s = 8) => g('cone' + s, () => new THREE.ConeGeometry(0.5, 1, s));
export const SPH = (s = 12) => g('sph' + s, () => new THREE.SphereGeometry(0.5, s, Math.max(6, Math.round(s * 0.65))));

export function add(grp: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  grp.add(mesh);
  return mesh;
}
export const box = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
  add(p, BOX(), mat(c), x, y + sy / 2, z, sx, sy, sz, ry, rx, rz);
export const cyl = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, h: number, s = 10) =>
  add(p, CYL(s), mat(c), x, y + h / 2, z, r * 2, h, r * 2);
export const cone = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, h: number, s = 10, ry = 0) =>
  add(p, CONE(s), mat(c), x, y + h / 2, z, r * 2, h, r * 2, ry);
export const ball = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, SPH(), mat(c), x, y, z, sx, sy, sz, ry, rx, rz);

/** Smooth-shaded ellipsoid with semi-axes (rx, ry, rz) — organic forms, eyes, noses, domes. */
export const ellip = (p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, rotx = 0, rotz = 0) =>
  add(p, g('esph', () => new THREE.SphereGeometry(1, 22, 15)), mat(c, { flat: false }), x, y, z, rx, ry, rz, roty, rotx, rotz);

export function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}
export function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

// ---- Deterministic noise (pattern painting & terrain) ----

export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
/** Fractal value noise in [0,1]. */
export function fbm(x: number, y: number, z: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
/** 3D Worley cell distances [F1, F2] — giraffe patches, turtle scutes, cobblestones. */
export function worley(x: number, y: number, z: number): [number, number] {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9, f2 = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = xi + i + hash3(xi + i, yi + j, zi + k);
    const cy = yi + j + hash3(yi + j + 17, zi + k, xi + i);
    const cz = zi + k + hash3(zi + k + 31, xi + i, yi + j);
    const d = Math.hypot(x - cx, y - cy, z - cz);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

/** Per-face painter: receives the face centroid & normal in the mesh's local space; returns a color or null for the base color. */
export type Paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => string | null;

/** Converts an indexed smooth geometry to non-indexed with crisp per-face vertex colors chosen by `paint`. */
export function paintFaces(geo: THREE.BufferGeometry, base: string, paint?: Paint): THREE.BufferGeometry {
  const ng = geo.index ? geo.toNonIndexed() : geo;
  if (!ng.getAttribute('normal')) ng.computeVertexNormals();
  const pos = ng.getAttribute('position'), nor = ng.getAttribute('normal');
  const cols = new Float32Array(pos.count * 3);
  const bc = new THREE.Color(base), tc = new THREE.Color();
  const cache = new Map<string, THREE.Color>();
  for (let i = 0; i < pos.count; i += 3) {
    let col = bc;
    if (paint) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const nx = nor.getX(i) + nor.getX(i + 1) + nor.getX(i + 2);
      const ny = nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2);
      const nz = nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const hex = paint(cx, cy, cz, nx / nl, ny / nl, nz / nl);
      if (hex) {
        let cc = cache.get(hex);
        if (!cc) { cc = tc.clone().set(hex); cache.set(hex, cc); }
        col = cc;
      }
    }
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = col.r; cols[(i + k) * 3 + 1] = col.g; cols[(i + k) * 3 + 2] = col.b; }
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return ng;
}

/** A sweep station: centre point, half-width (side axis) and half-height (up axis). */
export interface Station { p: V3; w: number; h?: number }
export interface SweepOpts { radial?: number; sub?: number; paint?: Paint; flat?: boolean; up?: V3; caps?: boolean; squash?: number }

/**
 * Organic loft: elliptical cross-sections swept along a Catmull-Rom spine through the stations.
 * Ideal for animal torsos, necks, limbs, tails, trunks, fuselages, hulls and tentacles.
 */
export function sweep(p: THREE.Object3D, st: Station[], c: string, o: SweepOpts = {}): THREE.Mesh {
  const radial = o.radial ?? 14, sub = o.sub ?? 6;
  const pts = st.map(s => new THREE.Vector3(...s.p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(2, (st.length - 1) * sub);
  // three's default arc-length table samples 200 points per curve; a few per output ring is plenty
  curve.arcLengthDivisions = Math.max(24, n * 6);
  // Interpolate widths with the same parameterisation (smoothstep between stations)
  const lerpW = (t: number, key: 'w' | 'h') => {
    const f = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(f)), u = f - i;
    const a = key === 'w' ? st[i].w : (st[i].h ?? st[i].w), b = key === 'w' ? st[i + 1].w : (st[i + 1].h ?? st[i + 1].w);
    const s = u * u * (3 - 2 * u);
    return a + (b - a) * s;
  };
  const upRef = new THREE.Vector3(...(o.up ?? [0, 1, 0]));
  const verts: number[] = [];
  const T = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3();
  let prevS: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    S.crossVectors(upRef, T);
    if (S.lengthSq() < 1e-6) S.copy(prevS ?? new THREE.Vector3(1, 0, 0));
    S.normalize();
    if (prevS && S.dot(prevS) < 0) S.negate();
    prevS = S.clone();
    N.crossVectors(T, S).normalize();
    const w = lerpW(t, 'w'), h = lerpW(t, 'h');
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // squash flattens the underside (bellies, hulls)
      const hh = sa < 0 && o.squash ? h * o.squash : h;
      verts.push(P.x + S.x * ca * w + N.x * sa * hh, P.y + S.y * ca * w + N.y * sa * hh, P.z + S.z * ca * w + N.z * sa * hh);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c2 = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
    idx.push(a, b, c2, b, d, c2);
  }
  if (o.caps !== false) {
    for (const [ring, sgn] of [[0, -1], [n, 1]] as const) {
      const ctr = verts.length / 3;
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < radial; j++) { cx += verts[(ring * radial + j) * 3]; cy += verts[(ring * radial + j) * 3 + 1]; cz += verts[(ring * radial + j) * 3 + 2]; }
      verts.push(cx / radial, cy / radial, cz / radial);
      for (let j = 0; j < radial; j++) {
        const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
        if (sgn < 0) idx.push(ctr, b, a); else idx.push(ctr, a, b);
      }
    }
  }
  let geo: THREE.BufferGeometry = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo = paintFaces(geo, c, o.paint);
  if (o.flat) geo.computeVertexNormals();
  return add(p, geo, mat('#ffffff', { flat: o.flat ?? false, vc: true }), 0, 0, 0, 1, 1, 1);
}

/** Constant-radius smooth tube through points (limbs, horns, cables) with rounded ball ends. */
export function tube(p: THREE.Object3D, pts: V3[], r0: number, r1: number, c: string, o: SweepOpts = {}): THREE.Mesh {
  const st: Station[] = pts.map((pt, i) => ({ p: pt, w: r0 + (r1 - r0) * (i / Math.max(1, pts.length - 1)) }));
  const m = sweep(p, st, c, { radial: 10, sub: 5, ...o });
  ellip(p, c, ...pts[0], r0 * 0.98);
  ellip(p, c, ...pts[pts.length - 1], r1 * 0.98);
  return m;
}

/** Flat extruded silhouette (wings, fins, flukes, ears, sails) in the XY plane, thickness d along Z. */
export function slab(p: THREE.Object3D, outline: [number, number][], d: number, c: string, bevel = 0, smooth = true): THREE.Mesh {
  // Organic outlines: run a closed centripetal spline through the control polygon
  const pts = smooth && outline.length > 3
    ? new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal')
      .getPoints(outline.length * 6).slice(0, -1).map(v => new THREE.Vector2(v.x, v.y))
    : outline.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10,
  });
  geo.translate(0, 0, -d / 2);
  geo.computeVertexNormals();
  return add(p, geo, mat(c, { flat: false }), 0, 0, 0, 1, 1, 1);
}

/** Rounded-edge box (bevelled CAD block) — catches highlights on edges like a real scale model. */
export function rbox(p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, r = 0.012, ry = 0): THREE.Mesh {
  const rr = Math.min(r, sx / 2.2, sy / 2.2, sz / 2.2);
  const key = `rbox:${sx.toFixed(3)}:${sy.toFixed(3)}:${sz.toFixed(3)}:${rr.toFixed(4)}`;
  const geo = g(key, () => {
    const s = new THREE.Shape();
    const w = sx / 2 - rr, h = sy / 2 - rr;
    s.moveTo(-w, -sy / 2); s.lineTo(w, -sy / 2); s.quadraticCurveTo(sx / 2, -sy / 2, sx / 2, -h);
    s.lineTo(sx / 2, h); s.quadraticCurveTo(sx / 2, sy / 2, w, sy / 2);
    s.lineTo(-w, sy / 2); s.quadraticCurveTo(-sx / 2, sy / 2, -sx / 2, h);
    s.lineTo(-sx / 2, -h); s.quadraticCurveTo(-sx / 2, -sy / 2, -w, -sy / 2);
    const eg = new THREE.ExtrudeGeometry(s, { depth: sz - rr * 2, bevelEnabled: true, bevelSize: rr * 0.6, bevelThickness: rr, bevelSegments: 2, curveSegments: 3 });
    eg.translate(0, 0, -(sz - rr * 2) / 2);
    eg.computeVertexNormals();
    return eg;
  });
  return add(p, geo, mat(c), x, y + sy / 2, z, 1, 1, 1, ry);
}

/** Cartoon eye: glossy sclera, iris/pupil and a tiny catch-light, looking along +z (or `dir`). */
export function eye(p: THREE.Object3D, x: number, y: number, z: number, r: number, iris = '#1f2937', sclera = '#f8fafc', dirX = 0): void {
  ellip(p, sclera, x, y, z, r, r, r * 0.8);
  ellip(p, iris, x + dirX * r * 0.35, y, z + r * 0.52, r * 0.62, r * 0.66, r * 0.4);
  ellip(p, '#ffffff', x + r * 0.22 + dirX * r * 0.3, y + r * 0.28, z + r * 0.78, r * 0.18).material = mat('#ffffff', { emissive: '#ffffff' });
}

// ---- Architectural CAD Primitives ----

/** Tapered / leaning 6-face frustum box: bottom w0×d0 at y, top w1×d1 shifted by (ox,oz) at y+h. */
export function tbox(
  p: THREE.Object3D, w0: number, d0: number, w1: number, d1: number, h: number,
  c: string, x = 0, y = 0, z = 0, ox = 0, oz = 0, ry = 0
): THREE.Mesh {
  const hw0 = w0 / 2, hd0 = d0 / 2, hw1 = w1 / 2, hd1 = d1 / 2;
  const v = [
    [-hw0, 0, -hd0], [hw0, 0, -hd0], [hw0, 0, hd0], [-hw0, 0, hd0],
    [ox - hw1, h, oz - hd1], [ox + hw1, h, oz - hd1], [ox + hw1, h, oz + hd1], [ox - hw1, h, oz + hd1],
  ];
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [3, 7, 6, 2], [1, 5, 4, 0], [2, 6, 5, 1], [0, 4, 7, 3]];
  const pos: number[] = [];
  for (const [a, b, d, e] of faces) {
    pos.push(...v[a], ...v[d], ...v[b], ...v[a], ...v[e], ...v[d]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return add(p, geo, mat(c), x, y, z, 1, 1, 1, ry);
}

/** Gable roof prism (ridge along X, triangular gable ends on ±X). */
export function gable(p: THREE.Object3D, w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
  const hw = w / 2, hd = d / 2;
  const v = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, h, 0], [hw, h, 0]];
  const tris = [[0, 3, 2], [0, 2, 1], [3, 4, 5], [3, 5, 2], [1, 5, 4], [1, 4, 0], [0, 4, 3], [2, 5, 1]];
  const pos: number[] = [];
  for (const [a, b, e] of tris) pos.push(...v[a], ...v[e], ...v[b]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return add(p, geo, mat(c), x, y, z, 1, 1, 1, ry);
}

/** 2D arch cutout path (rounded Roman arch or pointed Gothic/Mughal iwan arch) for extruded walls. */
export function archPath(cx: number, cy: number, w: number, h: number, pointed = false): THREE.Path {
  const hw = w / 2, r = Math.min(hw, h * 0.55);
  const path = new THREE.Path();
  path.moveTo(cx - hw, cy);
  path.lineTo(cx - hw, cy + h - r);
  if (pointed) {
    path.quadraticCurveTo(cx - hw, cy + h - r * 0.15, cx, cy + h);
    path.quadraticCurveTo(cx + hw, cy + h - r * 0.15, cx + hw, cy + h - r);
  } else {
    path.absarc(cx, cy + h - r, hw, Math.PI, 0, true);
  }
  path.lineTo(cx + hw, cy);
  path.closePath();
  return path;
}

/** Extruded architectural wall panel of width w, height h, thickness d with optional arch/window holes. */
export function panel(
  p: THREE.Object3D, w: number, h: number, d: number, c: string,
  holes: THREE.Path[] = [], x = 0, y = 0, z = 0, ry = 0
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h);
  shape.lineTo(-w / 2, h);
  shape.closePath();
  for (const hole of holes) shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -d / 2);
  geo.computeVertexNormals();
  return add(p, geo, mat(c), x, y, z, 1, 1, 1, ry);
}

/** Lofted surface through an array of 3D point rings (all rings have the same vertex count). */
export function loft(p: THREE.Object3D, rings: [number, number, number][][], c: string, caps = true, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
  const m = rings.length, n = rings[0].length;
  const pos: number[] = [];
  for (let j = 0; j < m - 1; j++) {
    const r0 = rings[j], r1 = rings[j + 1];
    for (let i = 0; i < n; i++) {
      const ni = (i + 1) % n;
      pos.push(...r0[i], ...r0[ni], ...r1[ni], ...r0[i], ...r1[ni], ...r1[i]);
    }
  }
  if (caps) {
    const [b, t] = [rings[0], rings[m - 1]];
    for (let i = 1; i < n - 1; i++) {
      pos.push(...b[0], ...b[i + 1], ...b[i]);
      pos.push(...t[0], ...t[i], ...t[i + 1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return add(p, geo, mat(c), x, y, z, 1, 1, 1, ry);
}

/** Revolved 2D [radius, height] profile around the Y axis (domes, spires, urns, robes). */
export function lathe(p: THREE.Object3D, pts: [number, number][], c: string, x = 0, y = 0, z = 0, seg = 14): THREE.Mesh {
  const key = 'lathe:' + seg + ':' + pts.map(pt => pt[0].toFixed(3) + ',' + pt[1].toFixed(3)).join(';');
  const geo = g(key, () => {
    const lg = new THREE.LatheGeometry(pts.map(([r, py]) => new THREE.Vector2(r, py)), seg);
    lg.computeVertexNormals();
    return lg;
  });
  return add(p, geo, mat(c, { flat: seg <= 12 }), x, y, z, 1, 1, 1);
}

const _up = new THREE.Vector3(0, 1, 0);
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vd = new THREE.Vector3();

/** Tapered 3D structural strut / beam connecting point a=[x,y,z] to b=[x,y,z]. */
export function strut(p: THREE.Object3D, a: V3, b: V3, ra: number, rb: number, c: string, seg = 6): THREE.Mesh {
  _va.set(a[0], a[1], a[2]);
  _vb.set(b[0], b[1], b[2]);
  _vd.subVectors(_vb, _va);
  const len = _vd.length() || 0.001;
  const key = `strut:${seg}:${(ra / Math.max(0.001, rb)).toFixed(2)}`;
  const geo = g(key, () => new THREE.CylinderGeometry(0.5, 0.5 * (ra / Math.max(0.001, rb)), 1, seg));
  const mesh = new THREE.Mesh(geo, mat(c));
  mesh.scale.set(rb * 2, len, rb * 2);
  mesh.position.addVectors(_va, _vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, _vd.normalize());
  mesh.castShadow = true;
  p.add(mesh);
  return mesh;
}
export const rod = (p: THREE.Object3D, a: V3, b: V3, r: number, c: string, seg = 6) =>
  strut(p, a, b, r, r, c, seg);

/** Architectural miniature tree (deciduous canopy or conifer pine). */
export function tree(p: THREE.Object3D, x: number, y: number, z: number, s = 0.06, c = '#4d8a54', pine = false): void {
  cyl(p, '#6b4c35', x, y, z, s * 0.16, s * 0.5, 5);
  if (pine) {
    cone(p, c, x, y + s * 0.32, z, s * 0.56, s * 0.95, 6);
    cone(p, shade(c, 1.12), x, y + s * 0.72, z, s * 0.42, s * 0.75, 6);
  } else {
    ball(p, c, x, y + s * 0.78, z, s * 0.95, s * 0.85, s * 0.95);
    ball(p, shade(c, 1.1), x + s * 0.2, y + s * 1.05, z + s * 0.12, s * 0.55);
  }
}

interface SkinOpts { paint?: Paint; flat?: boolean; closed?: boolean; caps?: boolean; metal?: number; rough?: number; inward?: boolean }

/**
 * Indexed surface through rings of 3D points (hulls, fuselages, car bodies, robes). Rings may be open profiles
 * (closed=false) or closed loops. Winding is auto-corrected so normals face away from the ring centroids.
 */
export function skin(p: THREE.Object3D, rings: V3[][], c: string, o: SkinOpts = {}): THREE.Mesh {
  const m = rings.length, n = rings[0].length, closed = o.closed ?? true;
  const pos: number[] = [];
  for (const r of rings) for (const v of r) pos.push(v[0], v[1], v[2]);
  const idx: number[] = [];
  const cols = closed ? n : n - 1;
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c2 = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
    idx.push(a, b, c2, b, d, c2);
  }
  const centroid = (ri: number): V3 => {
    let x = 0, y = 0, z = 0;
    for (const v of rings[ri]) { x += v[0]; y += v[1]; z += v[2]; }
    return [x / n, y / n, z / n];
  };
  // Orientation probe on the widest ring: outward normals must point away from that ring's centroid
  let wi = 0, best = -1;
  for (let i = 0; i < m; i++) { const ct = centroid(i); const d = Math.hypot(rings[i][0][0] - ct[0], rings[i][0][1] - ct[1], rings[i][0][2] - ct[2]); if (d > best) { best = d; wi = i; } }
  const ri = Math.min(wi, m - 2), ct = centroid(wi);
  let score = 0;
  for (let j = 0; j < cols; j++) {
    const t = (ri * cols + j) * 6;
    const A = new THREE.Vector3().fromArray(pos, idx[t] * 3), Bv = new THREE.Vector3().fromArray(pos, idx[t + 1] * 3), C = new THREE.Vector3().fromArray(pos, idx[t + 2] * 3);
    const nrm = Bv.clone().sub(A).cross(C.clone().sub(A));
    score += nrm.dot(A.clone().add(Bv).add(C).divideScalar(3).sub(new THREE.Vector3(...ct)));
  }
  if ((score < 0) !== !!o.inward) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  const flip = (score < 0) !== !!o.inward;
  if (o.caps) {
    for (const [ring, sgn] of [[0, -1], [m - 1, 1]] as const) {
      const cc = centroid(ring), ci = pos.length / 3;
      pos.push(...cc);
      for (let j = 0; j < cols; j++) {
        const a = ring * n + j, b = ring * n + ((j + 1) % n);
        // Side quads go ring i → i+1 as (a, b, c2); a cap on the last ring faces forward, the first faces back
        if ((sgn > 0) !== flip) idx.push(ci, a, b); else idx.push(ci, b, a);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const pg = paintFaces(geo, c, o.paint);
  if (o.flat) pg.computeVertexNormals();
  return add(p, pg, mat('#ffffff', { flat: o.flat ?? false, vc: true, metal: o.metal, rough: o.rough }), 0, 0, 0, 1, 1, 1);
}

/** Vertical extrusion of a floor plan [x, z][] from y to y+h (deckhouses, setback towers, plinths). */
export function prism(p: THREE.Object3D, plan: [number, number][], y: number, h: number, c: string, bevel = 0, smooth = false): THREE.Mesh {
  const pts = smooth && plan.length > 3
    ? new THREE.CatmullRomCurve3(plan.map(([x, z]) => new THREE.Vector3(x, -z, 0)), true, 'centripetal')
      .getPoints(plan.length * 5).slice(0, -1).map(v => new THREE.Vector2(v.x, v.y))
    : plan.map(([x, z]) => new THREE.Vector2(x, -z));
  const key = `prism:${bevel}:${h.toFixed(4)}:` + pts.map(v => v.x.toFixed(4) + ',' + v.y.toFixed(4)).join(';');
  const geo = g(key, () => {
    const eg = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: Math.max(0.0001, h - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6,
    });
    eg.rotateX(-Math.PI / 2);
    eg.translate(0, bevel, 0);
    eg.computeVertexNormals();
    return eg;
  });
  return add(p, geo, mat(c, { flat: !smooth }), 0, y, 0, 1, 1, 1);
}
