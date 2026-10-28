import * as THREE from 'three';
import type { Builder, V3 } from '../prims.ts';
import { add, mat, g, vnoise, fbm, hash3, worley } from '../prims.ts';
import { VCM, lerp3, mx, sh, sst, vc } from '../kit/sculpt.ts';

// Prehistoric museum miniatures: each dinosaur is one continuous lofted hide (tail → body → neck → skull) with
// IK-posed muscular limbs, clawed feet, glossy eyes and painted countershading / stripes / spots, standing on a
// small fossil-site diorama of mossy ground, ferns, cycads and rocks. Front +z, base at y=0, ~1 unit across.

/** Body painter: position, normal, u along the loft (0 = tail tip) and angle a around it (π/2 = dorsal). */
type BP = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, a: number) => string;

/** Vertex-coloured grid surface: rings u∈[0,1] × v∈[0,1) with fan caps, outward winding auto-detected. */
function surf(p: THREE.Object3D, nu: number, nv: number, f: (u: number, v: number) => V3, paint: BP, caps = true, up?: V3): THREE.Mesh {
  const pos: number[] = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) pos.push(...f(i / nu, j / nv));
  const idx: number[] = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * nv + j, b = i * nv + ((j + 1) % nv), c2 = (i + 1) * nv + j, d = (i + 1) * nv + ((j + 1) % nv);
    idx.push(a, b, c2, b, d, c2);
  }
  if (caps) for (const [ring, sgn] of [[0, -1], [nu, 1]] as const) {
    const ctr = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < nv; j++) { cx += pos[(ring * nv + j) * 3]; cy += pos[(ring * nv + j) * 3 + 1]; cz += pos[(ring * nv + j) * 3 + 2]; }
    pos.push(cx / nv, cy / nv, cz / nv);
    for (let j = 0; j < nv; j++) { const a = ring * nv + j, b = ring * nv + ((j + 1) % nv); if (sgn < 0) idx.push(ctr, b, a); else idx.push(ctr, a, b); }
  }
  const mi = Math.floor(nu / 2) * nv, P = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const cen = new THREE.Vector3();
  for (let j = 0; j < nv; j++) cen.add(P(mi + j));
  cen.multiplyScalar(1 / nv);
  const A = P(mi), B = P(mi + 1), C = P(mi + nv), ref = up ? new THREE.Vector3(...up) : A.clone().sub(cen);
  if (new THREE.Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A)).dot(ref) < 0)
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal'), n = pos.length / 3, cols = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const grid = k < (nu + 1) * nv, u = grid ? Math.floor(k / nv) / nu : k === (nu + 1) * nv ? 0 : 1, v = grid ? (k % nv) / nv : 0.75;
    const c = vc(paint(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], nor.getX(k), nor.getY(k), nor.getZ(k), u, v * Math.PI * 2));
    cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return add(p, geo, VCM(), 0, 0, 0, 1, 1, 1);
}

interface St { p: V3; w: number; h?: number }
interface Fr { P: THREE.Vector3; T: THREE.Vector3; S: THREE.Vector3; N: THREE.Vector3; w: number; h: number }
interface LoftO { nu?: number; nv?: number; side?: V3; shape?: (u: number, a: number) => number; caps?: boolean }
interface Loft { F: (u: number) => Fr; at: (u: number, a: number, k?: number) => V3; mesh: THREE.Mesh }
/** Smooth elliptical loft through stations; `shape(u, a)` scales the radius (flat bellies, ridges, scallops). */
function loft(p: THREE.Object3D, st: St[], paint: BP, o: LoftO = {}): Loft {
  const curve = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(...s.p)), false, 'centripetal');
  const nu = o.nu ?? (st.length - 1) * 8, nv = o.nv ?? 24, side = new THREE.Vector3(...(o.side ?? [1, 0, 0]));
  const F = (u: number): Fr => {
    const P = curve.getPoint(u), T = curve.getTangent(u);
    const N = new THREE.Vector3().crossVectors(T, side).normalize(), S = new THREE.Vector3().crossVectors(N, T).normalize();
    const f = u * (st.length - 1), k = Math.min(st.length - 2, Math.floor(f)), t = f - k, s = t * t * (3 - 2 * t);
    const h0 = st[k].h ?? st[k].w, h1 = st[k + 1].h ?? st[k + 1].w;
    return { P, T, S, N, w: st[k].w + (st[k + 1].w - st[k].w) * s, h: h0 + (h1 - h0) * s };
  };
  const at = (u: number, a: number, k = 1): V3 => {
    const R = F(u), m = (o.shape ? o.shape(u, a) : 1) * k, ca = Math.cos(a) * R.w * m, sa = Math.sin(a) * R.h * m;
    return [R.P.x + R.S.x * ca + R.N.x * sa, R.P.y + R.S.y * ca + R.N.y * sa, R.P.z + R.S.z * ca + R.N.z * sa];
  };
  const fr: Fr[] = [];
  for (let i = 0; i <= nu; i++) fr.push(F(i / nu));
  const mesh = surf(p, nu, nv, (u, v) => {
    const R = fr[Math.round(u * nu)], a = v * Math.PI * 2, m = o.shape ? o.shape(u, a) : 1;
    const ca = Math.cos(a) * R.w * m, sa = Math.sin(a) * R.h * m;
    return [R.P.x + R.S.x * ca + R.N.x * sa, R.P.y + R.S.y * ca + R.N.y * sa, R.P.z + R.S.z * ca + R.N.z * sa];
  }, paint, o.caps ?? true);
  return { F, at, mesh };
}

// ---- Small shared shapes ----
const DROP = () => g('dn-drop', () => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(new THREE.Vector2(Math.max(1e-4, 0.5 * Math.sin(Math.PI * Math.pow(t, 0.6))), t)); }
  const lg = new THREE.LatheGeometry(pts, 8); lg.computeVertexNormals(); return lg;
});
const CLAW = () => g('dn-claw', () => {
  // curved talon: lathe cone bent down along its length
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(Math.max(1e-4, 0.5 * (1 - t) * Math.sqrt(Math.min(1, t * 4 + 0.3))), t)); }
  const lg = new THREE.LatheGeometry(pts, 7);
  const ps = lg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ps.count; i++) { const y = ps.getY(i); ps.setZ(i, ps.getZ(i) - 0.55 * y * y); }
  lg.computeVertexNormals(); return lg;
});
const _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _bx = new THREE.Vector3(), _bz = new THREE.Vector3();
/** Teardrop / claw from base a to tip b; `up` sets which way a curved claw bends (local −z → opposite of up). */
function drop(p: THREE.Object3D, c: string, a: V3, b: V3, r: number, rz = r, up?: V3, geo: THREE.BufferGeometry = DROP()): THREE.Mesh {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length() || 1e-4;
  const m = add(p, geo, mat(c, { flat: false }), a[0], a[1], a[2], r * 2, len, rz * 2);
  _d.normalize();
  if (up) {
    _bz.set(up[0], up[1], up[2]).addScaledVector(_d, -(up[0] * _d.x + up[1] * _d.y + up[2] * _d.z));
    if (_bz.lengthSq() < 1e-8) _bz.set(_d.y, _d.z, _d.x);
    _bz.normalize(); _bx.crossVectors(_d, _bz);
    m.quaternion.setFromRotationMatrix(_m4.makeBasis(_bx, _d, _bz));
  } else m.quaternion.setFromUnitVectors(_Y, _d);
  return m;
}
const TOOTH = () => g('dn-tooth', () => { const c = new THREE.ConeGeometry(0.5, 1, 5, 1); c.translate(0, 0.5, 0); c.computeVertexNormals(); return c; });
const tooth = (p: THREE.Object3D, a: V3, b: V3, r: number, c = '#f1e9d0') => drop(p, c, a, b, r, r, undefined, TOOTH());
const claw = (p: THREE.Object3D, c: string, a: V3, b: V3, r: number, up: V3) => drop(p, c, a, b, r, r * 0.7, up, CLAW());
const ESEG = [[7, 5], [10, 7], [14, 10]];
function el(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, ry0 = 0, rx0 = 0, rz0 = 0): THREE.Mesh {
  const r = Math.max(rx, ry, rz), [a, b] = ESEG[r < 0.015 ? 0 : r < 0.04 ? 1 : 2];
  return add(p, g('dn-sph' + a, () => new THREE.SphereGeometry(1, a, b)), mat(c, { flat: false }), x, y, z, rx, ry, rz, ry0, rx0, rz0);
}
/** Vertex-painted, optionally noise-displaced ellipsoid (rocks, foliage clumps, armour, eyes sockets). */
function vblob(p: THREE.Object3D, x: number, y: number, z: number, rx: number, ry: number, rz: number, paint: (x: number, y: number, z: number, ny: number) => string,
  o: { seg?: number; bump?: number; freq?: number; rot?: V3; seed?: number; flatBottom?: boolean } = {}): THREE.Mesh {
  const seg = o.seg ?? 14, geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const ps = geo.attributes.position as THREE.BufferAttribute, sd = o.seed ?? 0, fq = o.freq ?? 2.2;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  const v = new THREE.Vector3();
  for (let i = 0; i < ps.count; i++) {
    v.fromBufferAttribute(ps, i);
    const k = o.bump ? 1 + (fbm(v.x * fq + sd, v.y * fq, v.z * fq - sd, 3) - 0.5) * o.bump : 1;
    v.multiplyScalar(k);
    if (o.flatBottom && v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    v.set(v.x * rx, v.y * ry, v.z * rz).applyQuaternion(q);
    ps.setXYZ(i, x + v.x, y + v.y, z + v.z);
  }
  geo.deleteAttribute('uv');
  const ng = mergeSeams(geo);
  ng.computeVertexNormals();
  const np = ng.getAttribute('position'), nn = ng.getAttribute('normal'), cols = new Float32Array(np.count * 3);
  for (let i = 0; i < np.count; i++) { const c = vc(paint(np.getX(i), np.getY(i), np.getZ(i), nn.getY(i))); cols.set([c.r, c.g, c.b], i * 3); }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return add(p, ng, VCM(), 0, 0, 0, 1, 1, 1);
}
/** Welds the duplicated seam vertices of a SphereGeometry so displaced blobs stay closed and smooth. */
function mergeSeams(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const ps = geo.getAttribute('position'), idx = geo.index!, map = new Map<string, number>(), remap: number[] = [], out: number[] = [];
  for (let i = 0; i < ps.count; i++) {
    const k = `${ps.getX(i).toFixed(5)},${ps.getY(i).toFixed(5)},${ps.getZ(i).toFixed(5)}`;
    let j = map.get(k);
    if (j === undefined) { j = out.length / 3; map.set(k, j); out.push(ps.getX(i), ps.getY(i), ps.getZ(i)); }
    remap.push(j);
  }
  const ni: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = remap[idx.getX(t)], b = remap[idx.getX(t + 1)], c = remap[idx.getX(t + 2)];
    if (a !== b && b !== c && a !== c) ni.push(a, b, c);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.setIndex(ni);
  return ng;
}
/** Extruded silhouette (XY outline, thickness d along Z) painted per vertex, placed at `at` with Euler `rot` (XYZ). */
function vslab(p: THREE.Object3D, outline: [number, number][], d: number, paint: (x: number, y: number, z: number, lx: number, ly: number) => string, at: V3, rot: V3, bevel = 0.003, order: THREE.EulerOrder = 'XYZ'): THREE.Mesh {
  const pts = new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal').getPoints(outline.length * 5).slice(0, -1).map(v => new THREE.Vector2(v.x, v.y));
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(1e-4, d - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
  geo.translate(0, 0, -(d - bevel * 2) / 2);
  const ps = geo.getAttribute('position'), loc = new Float32Array(ps.count * 2);
  for (let i = 0; i < ps.count; i++) { loc[i * 2] = ps.getX(i); loc[i * 2 + 1] = ps.getY(i); }
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)), new THREE.Vector3(1, 1, 1)));
  geo.computeVertexNormals();
  const cols = new Float32Array(ps.count * 3);
  for (let i = 0; i < ps.count; i++) { const c = vc(paint(ps.getX(i), ps.getY(i), ps.getZ(i), loc[i * 2], loc[i * 2 + 1])); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return add(p, geo, VCM(), 0, 0, 0, 1, 1, 1);
}
const lit = (m: THREE.Mesh) => { m.material = mat('#ffffff', { emissive: '#ffffff' }); };
/** Glossy reptile eye with a coloured iris ring, dark pupil and a catch-light, looking outward along `dir`. */
function eye(p: THREE.Object3D, at: V3, dir: V3, r: number, iris = '#c98a1c'): void {
  const l = Math.hypot(...dir), d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  el(p, '#1d140e', at[0], at[1], at[2], r * 1.15);
  el(p, iris, at[0] + d[0] * r * 0.45, at[1] + d[1] * r * 0.45, at[2] + d[2] * r * 0.45, r * 0.85);
  el(p, '#080808', at[0] + d[0] * r * 0.8, at[1] + d[1] * r * 0.8, at[2] + d[2] * r * 0.8, r * 0.45);
  lit(el(p, '#ffffff', at[0] + d[0] * r * 0.95, at[1] + r * 0.35, at[2] + d[2] * r * 0.95 + r * 0.2, r * 0.2));
}

// ---- Batched flat foliage (fern & cycad leaflets, grass): thousands of two-sided triangles in one mesh ----
class Leaves {
  pos: number[] = []; col: number[] = [];
  tri(a: V3, b: V3, c: V3, h: string): void {
    const k = vc(h);
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...b);
    for (let i = 0; i < 6; i++) this.col.push(k.r, k.g, k.b);
  }
  done(p: THREE.Object3D): void {
    if (!this.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    add(p, geo, mat('#ffffff', { flat: true, vc: true }), 0, 0, 0, 1, 1, 1);
  }
}
/**
 * Pinnate frond: an arching rachis from `base` heading `yaw`, lined with paired leaflets (2 creased triangles each)
 * that shrink toward the tip. Ferns use many soft leaflets, cycads fewer stiff spiky ones.
 */
function frond(L: Leaves, base: V3, yaw: number, len: number, rise: number, droop: number, wid: number, c: string, n = 10, stiff = 0, seed = 0): void {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
  const P = (t: number): V3 => [base[0] + dx * len * t, base[1] + rise * Math.sin(t * Math.PI * 0.55) - droop * t * t, base[2] + dz * len * t];
  const c2 = sh(c, 1.15), c3 = sh(c, 0.82);
  for (let i = 1; i <= n; i++) {
    const t0 = 0.12 + (i - 1) / n * 0.86, t1 = t0 + 0.9 / n, a = P(t0), b = P(Math.min(1, t1)), m = lerp3(a, b, 0.5);
    const w = wid * Math.sin(Math.PI * Math.min(1, 0.15 + t0 * 0.95)) * (0.85 + hash3(i, seed, 3) * 0.3);
    for (const s of [-1, 1]) {
      const tip: V3 = [m[0] + (lx * s + dx * (0.45 + stiff * 0.4)) * w, m[1] - w * (0.35 - stiff * 0.3) - t0 * w * 0.3, m[2] + (lz * s + dz * (0.45 + stiff * 0.4)) * w];
      const crease: V3 = [m[0] + lx * s * w * 0.35, m[1] + w * 0.08, m[2] + lz * s * w * 0.35];
      const col = (i + (s > 0 ? 1 : 0)) % 3 === 0 ? c2 : hash3(i, s, seed) > 0.7 ? c3 : c;
      L.tri(a, crease, tip, col);
      L.tri(crease, b, tip, sh(col, 0.9));
    }
  }
}
function fern(L: Leaves, x: number, y: number, z: number, s: number, c = '#4f7f35', seed = 0, n = 7): void {
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + hash3(i, seed, 1) * 0.6;
    frond(L, [x, y, z], yaw, s * (0.85 + hash3(i, seed, 2) * 0.3), s * 0.55, s * 0.55, s * 0.17, mx(c, '#7a9a3a', hash3(i, seed, 4) * 0.5), 7, 0, seed + i);
  }
}
/** Cycad: stout diamond-scaled trunk with a crown of stiff spiky fronds and a central cone. */
function cycad(p: THREE.Object3D, L: Leaves, x: number, y: number, z: number, s: number, c = '#3f6b2c', seed = 0): void {
  const h = s * 0.45;
  loft(p, [{ p: [x, y - 0.01, z], w: s * 0.13 }, { p: [x, y + h * 0.5, z], w: s * 0.12 }, { p: [x, y + h, z], w: s * 0.1 }],
    (px, py, pz) => { const t = Math.sin(py * 260 + Math.atan2(pz - z, px - x) * 5) * Math.sin(py * 260 - Math.atan2(pz - z, px - x) * 5); return t > 0.35 ? '#4a3a26' : mx('#7a6040', '#8d7350', vnoise(px * 80, py * 80, pz * 80)); }, { nu: 6, nv: 12 });
  el(p, '#a07a3c', x, y + h + s * 0.03, z, s * 0.05, s * 0.07, s * 0.05);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + hash3(i, seed, 7) * 0.4;
    frond(L, [x, y + h, z], yaw, s * (0.75 + hash3(i, seed, 8) * 0.2), s * 0.35, s * 0.32, s * 0.11, mx(c, '#5f8a33', hash3(i, seed, 9) * 0.6), 8, 1, seed + i * 3);
  }
}
/** Tree fern: slender shaggy trunk with a parasol of long drooping fronds. */
function treeFern(p: THREE.Object3D, L: Leaves, x: number, y: number, z: number, s: number, seed = 0): void {
  loft(p, [{ p: [x, y - 0.01, z], w: s * 0.07 }, { p: [x + s * 0.03, y + s * 0.5, z], w: s * 0.05 }, { p: [x + s * 0.02, y + s, z + s * 0.02], w: s * 0.065 }],
    (px, py, pz) => mx('#4b3725', '#6b5236', vnoise(px * 120, py * 300, pz * 120)), { nu: 10, nv: 9 });
  const top: V3 = [x + s * 0.02, y + s, z + s * 0.02];
  for (let i = 0; i < 9; i++) frond(L, top, (i / 9) * Math.PI * 2 + seed, s * 0.7, s * 0.22, s * 0.5, s * 0.12, mx('#4a7a30', '#6c9238', hash3(i, seed, 1)), 8, 0, seed + i);
}
/** Horsetail clump: jointed green stems with dark nodes. */
function horsetail(p: THREE.Object3D, x: number, y: number, z: number, s: number, seed = 0): void {
  for (let i = 0; i < 5; i++) {
    const a = hash3(i, seed, 1) * 6.28, d = hash3(i, seed, 2) * s * 0.18, hh = s * (0.6 + hash3(i, seed, 3) * 0.5);
    const b: V3 = [x + Math.cos(a) * d, y, z + Math.sin(a) * d], t: V3 = [b[0] + Math.cos(a) * hh * 0.12, y + hh, b[2] + Math.sin(a) * hh * 0.12];
    loft(p, [{ p: b, w: s * 0.022 }, { p: lerp3(b, t, 0.5), w: s * 0.02 }, { p: t, w: s * 0.004 }], (_x, py) => (Math.sin((py - y) / s * 50) > 0.8 ? '#2f3d1f' : '#6f9440'), { nu: 8, nv: 6 });
  }
}
/** Noise-sculpted boulder. */
function rock(p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#8a7f72', seed = 0, sy = 0.6): THREE.Mesh {
  return vblob(p, x, y, z, s, s * sy, s * (0.8 + hash3(seed, 1, 1) * 0.4), (px, py, pz, ny) => {
    const n = fbm(px * 40 + seed, py * 40, pz * 40, 3);
    return mx(mx(sh(c, 0.82 + n * 0.4), '#7d8a4a', sst(0.55, 0.85, ny) * sst(0.5, 0.7, vnoise(px * 30, py * 30 + seed, pz * 30)) * 0.7), '#3d342c', sst(-0.2, -0.8, ny) * 0.4);
  }, { seg: 12, bump: 0.55, freq: 1.8, seed, rot: [0, seed * 1.7, 0], flatBottom: true });
}
/** Half-buried fossil bones poking out of the ground (the dig-site signature on every base). */
function fossils(p: THREE.Object3D, x: number, y: number, z: number, s: number, yaw: number): void {
  const B = '#e7dcc0', dx = Math.sin(yaw), dz = Math.cos(yaw);
  for (let i = 0; i < 4; i++) {
    const c: V3 = [x + dx * s * (i - 1.5) * 0.55, y + 0.002, z + dz * s * (i - 1.5) * 0.55];
    el(p, i % 2 ? B : '#dccfae', c[0], c[1], c[2], s * 0.16, s * 0.12, s * 0.16);
  }
  const a: V3 = [x - dz * s * 0.9, y, z + dx * s * 0.9], b: V3 = [x + dz * s * 0.6 + dx * s * 0.6, y + s * 0.15, z - dx * s * 0.6 + dz * s * 0.6];
  loft(p, [{ p: a, w: s * 0.09 }, { p: lerp3(a, b, 0.5), w: s * 0.07 }, { p: b, w: s * 0.08 }], () => B, { nu: 6, nv: 8 });
  el(p, B, b[0], b[1], b[2], s * 0.14, s * 0.1, s * 0.12);
  el(p, B, a[0], a[1], a[2], s * 0.13, s * 0.1, s * 0.12);
}

// ---- Diorama ground ----
type HF = (x: number, z: number) => number;
interface GroundO { R?: number; top: string; moss: string; soil: string; strata?: string[]; hf?: HF; y0?: number; sand?: boolean; /** water level: skirt rises to it */ wl?: number }
/** Gently undulating disc of ground (vertex-painted soil, moss and pebbles) with a banded rock skirt. Returns surface height. */
function ground(gp: THREE.Object3D, o: GroundO): HF {
  const R = o.R ?? 0.48, y0 = o.y0 ?? 0.05, hf: HF = o.hf ?? ((x, z) => 0.012 * (fbm(x * 4 + 3, 0.5, z * 4, 3) - 0.5) * sst(0.12, 0.4, Math.hypot(x, z)));
  const rim = (x: number, z: number) => { const r = Math.hypot(x, z) / R; return -0.012 * sst(0.9, 1, r); };
  const H: HF = (x, z) => y0 + hf(x, z) + rim(x, z);
  const rings = 14, segs = 56;
  surf(gp, rings, segs, (u, v) => {
    const r = R * Math.pow(u, 0.85), a = v * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    return [x, H(x, z), z];
  }, (x, _y, z, _nx, ny) => {
    const n = fbm(x * 9, 1, z * 9, 3), m = vnoise(x * 22 + 5, 0, z * 22), [f1] = worley(x * 34, 0, z * 34);
    let c = mx(o.top, o.moss, sst(0.4, 0.68, n));
    c = mx(c, o.soil, sst(0.55, 0.8, m) * 0.6 + sst(0.95, 0.7, ny) * 0.5);
    if (f1 < 0.18 && !o.sand) c = mx(c, '#a69b8a', 0.6);
    return sh(c, 0.94 + vnoise(x * 60, 3, z * 60) * 0.12);
  }, false, [0, 1, 0]);
  // Skirt: vertical banded strata from the rim down to y=0
  const pal = o.strata ?? ['#7a5d43', '#8e6f50', '#6b513b', '#a08362', '#5d4634'];
  surf(gp, 5, segs, (u, v) => {
    const a = v * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R, top = Math.max(H(x, z), o.wl ?? 0);
    return [x * (1 - u * 0.02), top * (1 - u), z * (1 - u * 0.02)];
  }, (x, y, z) => (o.wl !== undefined && y > H(x, z) + 0.002 ? mx('#2f6f86', '#16384a', sst(o.wl, o.wl - 0.03, y))
    : pal[Math.abs(Math.floor(y * 70 + fbm(x * 10, y * 4, z * 10, 2) * 2.2)) % pal.length]), false);
  // Bottom plate
  surf(gp, 1, segs, (u, v) => { const a = v * Math.PI * 2; return [Math.cos(a) * R * 0.98 * (1 - u), 0, Math.sin(a) * R * 0.98 * (1 - u)]; }, () => '#3b2d22', false, [0, -1, 0]);
  return H;
}

// ---- Hide painters ----
interface Hide { top: string; side: string; belly: string; pat?: (x: number, y: number, z: number, u: number, s: number) => number; patC?: string; grain?: number; scales?: number }
function hide(h: Hide): BP {
  return (x, y, z, _nx, _ny, _nz, u, a) => {
    const s = Math.sin(a);
    let c = s < 0 ? mx(h.side, h.belly, sst(0.1, 0.75, -s)) : mx(h.side, h.top, sst(0.15, 0.95, s));
    if (h.pat) { const t = h.pat(x, y, z, u, s); if (t > 0) c = mx(c, h.patC!, t); }
    if (h.scales) { const [f1, f2] = worley(x * h.scales, y * h.scales, z * h.scales); c = mx(c, sh(c, 0.72), sst(0.12, 0.02, f2 - f1) * 0.6); }
    return sh(c, 1 + (vnoise(x * 70, y * 70, z * 70) - 0.5) * (h.grain ?? 0.16));
  };
}
/** Limb painter derived from a hide: flank colour on the outside, paler inside, darker toward the feet. */
const limbHide = (h: Hide, dark = '#3c3128'): BP => (x, y, z, nx, ny) => {
  let c = mx(h.side, h.top, sst(0.2, 1, ny) * 0.6);
  c = mx(c, h.belly, sst(0.3, -0.9, nx * Math.sign(x || 1)) * 0.5);
  if (h.pat) { const t = h.pat(x, y, z, 0.5, 0.3); if (t > 0) c = mx(c, h.patC!, t * 0.7); }
  c = mx(c, dark, sst(0.06, 0.0, y) * 0.35);
  return sh(c, 1 + (vnoise(x * 70, y * 70, z * 70) - 0.5) * (h.grain ?? 0.16));
};

// ---- Limbs (2-bone IK in the leg plane) ----
interface Leg {
  hip: V3; foot: V3; L: [number, number]; bend: 1 | -1;
  /** metatarsus / hand length and its tilt from vertical (ankle sits behind the toes) */
  meta?: number; tilt?: number;
  /** half-widths at hip, knee, ankle, foot */
  w: [number, number, number, number];
  type: 'bird' | 'pad' | 'hoof' | 'hand' | 'none';
  toe?: number; nails?: string; fingers?: number; yaw?: number; sickle?: boolean; spread?: number;
  /** stride: foot z offset per side (+ left forward) */
  stride?: number; lift?: number; muscle?: number;
}
function ik(A: V3, C: V3, L1: number, L2: number, bend: number): V3 {
  const a = new THREE.Vector3(...A), c = new THREE.Vector3(...C), d = c.clone().sub(a), D = d.length();
  if (D >= L1 + L2 - 1e-4) return lerp3(A, C, L1 / (L1 + L2));
  const along = (L1 * L1 - L2 * L2 + D * D) / (2 * D), hgt = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  const dn = d.clone().normalize(), perp = new THREE.Vector3(0, 0, bend).addScaledVector(dn, -dn.z * bend).normalize();
  const k = a.addScaledVector(dn, along).addScaledVector(perp, hgt);
  return [k.x, k.y, k.z];
}
function legPair(gp: THREE.Object3D, L: Leg, paint: BP, flip = 1): void {
  for (const sx of [-1, 1]) {
    const s = (L.stride ?? 0) * sx * flip, hip: V3 = [sx * L.hip[0], L.hip[1], L.hip[2]];
    const foot: V3 = [sx * L.foot[0], L.foot[1] + (s < 0 ? L.lift ?? 0 : 0), L.foot[2] + s];
    const meta = L.meta ?? 0, tilt = (L.tilt ?? 0) + (s < 0 && L.lift ? 0.5 : 0);
    const ank: V3 = [foot[0], foot[1] + meta * Math.cos(tilt) + L.w[3], foot[2] - meta * Math.sin(tilt) * L.bend];
    const knee = ik(hip, ank, L.L[0], L.L[1], L.bend), mus = L.muscle ?? 1.15;
    const root: V3 = [sx * L.hip[0] * 0.3, L.hip[1] + L.w[0] * 0.35, L.hip[2]];
    const st: St[] = [
      { p: root, w: L.w[0] * 0.6, h: L.w[0] * 0.7 },
      { p: hip, w: L.w[0], h: L.w[0] * 1.1 },
      { p: lerp3(hip, knee, 0.45), w: L.w[0] * 0.92, h: L.w[0] * mus },
      { p: knee, w: L.w[1], h: L.w[1] * 1.1 },
      { p: lerp3(knee, ank, 0.45), w: (L.w[1] + L.w[2]) * 0.5, h: (L.w[1] + L.w[2]) * 0.55 },
      { p: ank, w: L.w[2], h: L.w[2] * 1.05 },
    ];
    const fp: V3 = [foot[0], foot[1] + L.w[3] * 0.8, foot[2]];
    if (L.type !== 'none') st.push({ p: fp, w: L.w[3], h: L.w[3] * 0.9 });
    loft(gp, st, paint, { nu: st.length * 5, nv: 13 });
    foot_(gp, L, fp, sx, paint, s < 0 && Boolean(L.lift));
  }
}
function foot_(gp: THREE.Object3D, L: Leg, fp: V3, sx: number, paint: BP, lifted: boolean): void {
  const nail = L.nails ?? '#2c241d', toe = L.toe ?? 0.04, yaw0 = (L.yaw ?? 0) * sx, y = fp[1] - L.w[3] * 0.8;
  const skin = paint(fp[0], fp[1], fp[2], 0, 1, 0, 0.5, 1.2);
  if (L.type === 'bird') {
    const sp = L.spread ?? 0.42;
    for (const [i, k] of [[-1, 0.8], [0, 1], [1, 0.82]] as const) {
      const th = yaw0 + i * sp * (lifted ? 0.6 : 1), tl = toe * k, r = L.w[3] * (0.5 - Math.abs(i) * 0.06);
      const tip: V3 = [fp[0] + Math.sin(th) * tl, y + r * 0.6 + (lifted ? 0.004 : 0), fp[2] + Math.cos(th) * tl];
      const mid: V3 = [fp[0] + Math.sin(th) * tl * 0.5, y + r * 0.9, fp[2] + Math.cos(th) * tl * 0.5];
      loft(gp, [{ p: [fp[0], fp[1] - L.w[3] * 0.3, fp[2]], w: r * 1.1 }, { p: mid, w: r * 0.95 }, { p: tip, w: r * 0.7 }], paint, { nu: 6, nv: 7 });
      el(gp, sh(skin, 0.95), mid[0], mid[1], mid[2], r * 1.05);
      claw(gp, nail, [tip[0], tip[1], tip[2]], [tip[0] + Math.sin(th) * toe * 0.35, y + 0.001, tip[2] + Math.cos(th) * toe * 0.35], r * 0.8, [0, 1, 0]);
    }
    if (L.sickle) {
      // raised killing claw on the second toe (dromaeosaurs)
      const th = yaw0 - sx * 0.5, base: V3 = [fp[0] + Math.sin(th) * toe * 0.25, y + L.w[3] * 1.3, fp[2] + Math.cos(th) * toe * 0.25];
      el(gp, skin, base[0], base[1], base[2], L.w[3] * 0.5);
      claw(gp, nail, base, [base[0] + Math.sin(th) * toe * 0.3, base[1] + toe * 0.55, base[2] + Math.cos(th) * toe * 0.55], L.w[3] * 0.55, [0, 0, -1]);
    }
  } else if (L.type === 'pad') {
    el(gp, sh(skin, 0.92), fp[0], y + L.w[3] * 0.55, fp[2] + L.w[3] * 0.15, L.w[3] * 1.15, L.w[3] * 0.62, L.w[3] * 1.2);
    const n = L.fingers ?? 3;
    for (let i = 0; i < n; i++) {
      const th = yaw0 + (i / Math.max(1, n - 1) - 0.5) * 1.3;
      const b: V3 = [fp[0] + Math.sin(th) * L.w[3] * 1.0, y + L.w[3] * 0.32, fp[2] + Math.cos(th) * L.w[3] * 1.05];
      drop(gp, nail, b, [b[0] + Math.sin(th) * toe * 0.5, y + 0.002, b[2] + Math.cos(th) * toe * 0.55], L.w[3] * 0.24, L.w[3] * 0.2);
    }
  } else if (L.type === 'hoof' || L.type === 'hand') {
    const n = L.fingers ?? 3, sp = L.spread ?? 0.35;
    for (let i = 0; i < n; i++) {
      const th = yaw0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * sp), tl = toe * (L.type === 'hand' ? 1 : 0.8);
      const r = L.w[3] * (L.type === 'hand' ? 0.32 : 0.42);
      const base: V3 = [fp[0], fp[1] - L.w[3] * 0.2, fp[2]];
      const tip: V3 = L.type === 'hand' && fp[1] > 0.03
        ? [fp[0] + Math.sin(th) * tl * 0.6, fp[1] - tl * 0.75, fp[2] + Math.cos(th) * tl * 0.6]
        : [fp[0] + Math.sin(th) * tl, y + r * 0.7, fp[2] + Math.cos(th) * tl];
      loft(gp, [{ p: base, w: r * 1.1 }, { p: lerp3(base, tip, 0.55), w: r }, { p: tip, w: r * 0.8 }], paint, { nu: 6, nv: 7 });
      const dir: V3 = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]], dl = Math.hypot(...dir);
      if (L.type === 'hoof') el(gp, nail, tip[0], tip[1] - r * 0.1, tip[2], r * 0.95, r * 0.75, r * 0.95, th);
      else claw(gp, nail, tip, [tip[0] + dir[0] / dl * tl * 0.4, tip[1] + dir[1] / dl * tl * 0.4 - tl * 0.08, tip[2] + dir[2] / dl * tl * 0.4], r * 0.75, [0, 1, 0]);
    }
  }
}

// =============================================================================================================
// Bases
// =============================================================================================================
interface Scene { H: HF; L: Leaves }
function forestFloor(gp: THREE.Group, seed: number, o: Partial<GroundO> & { ferns?: [number, number, number][]; cycads?: [number, number, number][]; rocks?: [number, number, number][]; tree?: [number, number, number][]; horse?: [number, number, number][]; bones?: [number, number, number] } = {}): Scene {
  const H = ground(gp, { top: '#6f7d3e', moss: '#56702f', soil: '#8a6f4c', ...o });
  const L = new Leaves();
  for (const [x, z, s] of o.ferns ?? []) fern(L, x, H(x, z) - 0.004, z, s, '#4d7d32', Math.round(x * 100 + z * 37));
  for (const [x, z, s] of o.cycads ?? []) cycad(gp, L, x, H(x, z) - 0.004, z, s, '#3f6b2c', Math.round(x * 50 + z * 77));
  for (const [x, z, s] of o.tree ?? []) treeFern(gp, L, x, H(x, z) - 0.004, z, s, seed);
  for (const [x, z, s] of o.horse ?? []) horsetail(gp, x, H(x, z) - 0.004, z, s, Math.round(x * 31 + z * 7));
  (o.rocks ?? []).forEach(([x, z, s], i) => rock(gp, x, H(x, z) + s * 0.1, z, s, '#8f8476', seed + i * 5));
  if (o.bones) fossils(gp, o.bones[0], H(o.bones[0], o.bones[1]), o.bones[1], 0.035, o.bones[2]);
  return { H, L };
}

// =============================================================================================================
// Species
// =============================================================================================================

/** Tyrannosaurus rex mid-stride: massive deep skull with open toothy jaws, tiny two-fingered arms, tail held out. */
const trex: Builder = gp => {
  const S = forestFloor(gp, 3, {
    ferns: [[-0.3, 0.22, 0.12], [0.3, -0.25, 0.11], [0.33, 0.18, 0.08], [-0.12, -0.36, 0.09]],
    cycads: [[-0.32, -0.12, 0.2]], rocks: [[0.22, 0.34, 0.045], [-0.38, 0.05, 0.035], [0.36, -0.02, 0.03]],
    horse: [[0.12, -0.38, 0.12]], bones: [0.05, 0.36, 0.6],
  });
  const y0 = S.H(0, 0) - 0.002, d = new THREE.Group(); d.position.y = y0; gp.add(d);
  const H: Hide = {
    top: '#463f2a', side: '#7d6c44', belly: '#d6c79c', patC: '#2f2a1c', scales: 120, grain: 0.14,
    pat: (x, y, z, u, s) => (u < 0.86 ? sst(0.45, 0.8, Math.sin(z * 55 + Math.sin(y * 30) * 0.8)) * sst(-0.2, 0.4, s) * 0.85 : 0),
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.12, 0.2, -0.52], w: 0.004, h: 0.005 }, { p: [0.09, 0.215, -0.43], w: 0.013, h: 0.016 },
    { p: [0.045, 0.24, -0.31], w: 0.023, h: 0.031 }, { p: [0.012, 0.262, -0.18], w: 0.038, h: 0.052 },
    { p: [0, 0.28, -0.06], w: 0.06, h: 0.08 }, { p: [0, 0.272, 0.04], w: 0.07, h: 0.09 },
    { p: [0, 0.272, 0.12], w: 0.062, h: 0.08 }, { p: [0, 0.292, 0.185], w: 0.049, h: 0.06 },
    { p: [0, 0.326, 0.225], w: 0.044, h: 0.05 }, { p: [0, 0.356, 0.262], w: 0.056, h: 0.066 },
    { p: [0, 0.356, 0.31], w: 0.047, h: 0.058 }, { p: [0, 0.35, 0.362], w: 0.034, h: 0.046 },
    { p: [0, 0.344, 0.396], w: 0.027, h: 0.036 }, { p: [0, 0.34, 0.41], w: 0.014, h: 0.02 },
  ];
  const uS = 9 / 13; // skull starts here
  const B = loft(d, st, P, {
    nu: 96, nv: 26,
    shape: (u, a) => {
      const s = Math.sin(a);
      let m = s < 0 ? 1 - 0.18 * (-s) * (u < uS ? 1 : 0) : 1;
      if (u > uS) m *= s < -0.2 ? 0.72 : 1;  // flat palate: upper skull only, the lower jaw hangs below
      if (u > 0.35 && u < uS) m += 0.03 * Math.pow(Math.max(0, s), 8);
      return m;
    },
  });
  // Lower jaw hinged under the ear, dropped open a little
  const hinge = B.at(uS + 0.01, -Math.PI / 2, 0.55), chin: V3 = [0, hinge[1] - 0.055, 0.405];
  const jaw = loft(d, [{ p: [0, hinge[1] + 0.012, hinge[2] - 0.012], w: 0.044, h: 0.026 }, { p: lerp3(hinge, chin, 0.45), w: 0.036, h: 0.022 }, { p: chin, w: 0.024, h: 0.018 }, { p: [0, chin[1] + 0.003, chin[2] + 0.012], w: 0.01, h: 0.009 }],
    (x, y, z, nx, ny, nz) => (ny > 0.55 ? '#7a3a34' : P(x, y, z, nx, ny, nz, 0.9, ny > 0 ? 0 : -1.4)), { nu: 18, nv: 18, shape: (_u, a) => (Math.sin(a) > 0.3 ? 0.85 : 1) });
  el(d, '#6b2a28', 0, hinge[1] - 0.02, 0.37, 0.026, 0.02, 0.05);
  el(d, '#b8656a', 0, hinge[1] - 0.026, 0.38, 0.016, 0.008, 0.04);
  // Teeth: upper row along the jaw line, lower row along the jaw rim
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const u = uS + 0.03 + i * 0.032, b = B.at(u, sx > 0 ? -0.35 : Math.PI + 0.35, 0.98), L = 0.012 + (i > 1 && i < 6 ? 0.004 : 0);
      tooth(d, b, [b[0], b[1] - L, b[2] + 0.002], 0.0032);
    }
    for (let i = 0; i < 7; i++) {
      const t = 0.2 + i * 0.11, b = jaw.at(t, sx > 0 ? 0.55 : Math.PI - 0.55, 0.92), L = 0.01;
      tooth(d, b, [b[0], b[1] + L, b[2] + 0.002], 0.0028, '#efe5c8');
    }
  }
  // Eyes under a heavy brow, nostrils at the snout tip
  for (const sx of [-1, 1]) {
    const e = B.at(uS + 0.025, sx > 0 ? 0.55 : Math.PI - 0.55, 0.93);
    eye(d, e, [sx * 0.7, 0.1, 0.6], 0.0085, '#d79a2a');
    const br = B.at(uS + 0.02, sx > 0 ? 0.85 : Math.PI - 0.85, 0.98);
    el(d, sh(H.top, 0.9), br[0], br[1] + 0.003, br[2], 0.016, 0.009, 0.02);
    const n = B.at(0.975, sx > 0 ? 0.8 : Math.PI - 0.8, 0.95);
    el(d, '#1d1712', n[0], n[1], n[2] + 0.002, 0.0045, 0.003, 0.006);
  }
  // Tiny two-fingered arms
  for (const sx of [-1, 1]) {
    const sh0: V3 = [sx * 0.055, 0.24, 0.165], elb: V3 = [sx * 0.07, 0.205, 0.175], wr: V3 = [sx * 0.064, 0.2, 0.215];
    loft(d, [{ p: sh0, w: 0.016 }, { p: elb, w: 0.011 }, { p: wr, w: 0.009 }], limbHide(H), { nu: 10, nv: 10 });
    for (const k of [0, 1]) claw(d, '#2c241d', [wr[0], wr[1] + 0.003 - k * 0.006, wr[2] + 0.004], [wr[0] - sx * 0.002, wr[1] - 0.004 - k * 0.006, wr[2] + 0.018], 0.0035, [sx, 0, 0]);
  }
  // Powerful legs mid-stride
  legPair(d, { hip: [0.045, 0.29, -0.03], foot: [0.075, 0, 0.0], L: [0.14, 0.13], bend: 1, meta: 0.08, tilt: 0.42, w: [0.056, 0.028, 0.018, 0.016],
    type: 'bird', toe: 0.05, stride: 0.075, lift: 0.012, muscle: 1.45, nails: '#2a221b' }, limbHide(H));
  S.L.done(gp);
};

/** Horn from base a toward tip b, ivory tip on a skin-coloured base. */
function horn(p: THREE.Object3D, a: V3, b: V3, r: number, base = '#8a7a5a', tip = '#efe3c4', bend: V3 = [0, 1, 0]): void {
  const m = lerp3(a, b, 0.5), k = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.12;
  const mid: V3 = [m[0] + bend[0] * k, m[1] + bend[1] * k, m[2] + bend[2] * k];
  loft(p, [{ p: a, w: r }, { p: mid, w: r * 0.62 }, { p: b, w: r * 0.06 }], (_x, y, z) => mx(base, tip, sst(0, 1, Math.hypot(y - a[1], z - a[2]) / Math.hypot(b[1] - a[1], b[2] - a[2]))), { nu: 10, nv: 9, side: Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]) ? [0, 0, 1] : [1, 0, 0] });
}

/** Triceratops: huge bony frill with scalloped edge, two long brow horns, a short nose horn and a parrot beak. */
const triceratops: Builder = gp => {
  const S = forestFloor(gp, 7, {
    top: '#7d8040', moss: '#5d7330', soil: '#9a7c52',
    ferns: [[-0.32, 0.2, 0.11], [0.3, 0.26, 0.1], [-0.25, -0.3, 0.09]], cycads: [[0.33, -0.18, 0.18]],
    rocks: [[-0.36, -0.05, 0.04], [0.18, -0.36, 0.035], [0.4, 0.08, 0.025]], horse: [[-0.08, -0.4, 0.1]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d);
  const H: Hide = {
    top: '#5d4a33', side: '#8c7350', belly: '#cdb88f', patC: '#4a3826', scales: 130, grain: 0.14,
    pat: (x, y, z, _u, s) => sst(0.55, 0.85, fbm(x * 30, y * 30, z * 30, 2)) * sst(-0.3, 0.3, s) * 0.8,
  };
  const P = hide(H);
  const st: St[] = [
    { p: [-0.08, 0.13, -0.42], w: 0.005 }, { p: [-0.05, 0.15, -0.34], w: 0.016, h: 0.02 }, { p: [-0.015, 0.18, -0.24], w: 0.034, h: 0.044 },
    { p: [0, 0.21, -0.13], w: 0.068, h: 0.075 }, { p: [0, 0.215, -0.02], w: 0.088, h: 0.084 }, { p: [0, 0.2, 0.08], w: 0.082, h: 0.078 },
    { p: [0, 0.18, 0.15], w: 0.06, h: 0.062 }, { p: [0, 0.17, 0.19], w: 0.046, h: 0.05 },
  ];
  loft(d, st, P, { nu: 60, nv: 24, shape: (_u, a) => (Math.sin(a) < 0 ? 1 - 0.12 * -Math.sin(a) : 1) });
  // Head: deep, tapering to the beak
  const hs: St[] = [
    { p: [0, 0.195, 0.18], w: 0.046, h: 0.052 }, { p: [0, 0.195, 0.23], w: 0.048, h: 0.056 }, { p: [0, 0.183, 0.28], w: 0.033, h: 0.047 },
    { p: [0, 0.165, 0.325], w: 0.021, h: 0.035 }, { p: [0, 0.15, 0.352], w: 0.008, h: 0.012 },
  ];
  const Hd = loft(d, hs, (x, y, z, nx, ny, nz, u, a) => (u > 0.82 ? '#3b3129' : P(x, y, z, nx, ny, nz, 0.9, a)), { nu: 28, nv: 20 });
  drop(d, '#3b3129', [0, 0.14, 0.32], [0, 0.132, 0.352], 0.014, 0.016); // lower beak
  // Frill: a fan behind the skull, leaning back
  const fo: [number, number][] = [];
  for (let i = 0; i <= 12; i++) { const t = Math.PI * (i / 12); fo.push([Math.cos(t) * 0.13, Math.sin(t) * 0.14 - 0.01]); }
  fo.push([-0.05, -0.04], [0.05, -0.04]);
  fo.splice(13, 0, [-0.12, -0.03]); fo.unshift([0.12, -0.03]);
  const fa: V3 = [0, 0.215, 0.165], tilt = -0.7;
  vslab(d, fo, 0.012, (_x, _y, _z, lx, ly) => {
    const r = Math.hypot(lx / 0.13, (ly + 0.01) / 0.14);
    let c = mx(H.side, '#b0563a', sst(0.55, 0.85, r) * 0.7);
    c = mx(c, '#e2c27a', sst(0.86, 0.97, r) * 0.6);
    return sh(c, 0.95 + vnoise(lx * 60, ly * 60, 1) * 0.1);
  }, fa, [tilt, 0, 0]);
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI * (i / 12), lx = Math.cos(t) * 0.132, ly = Math.sin(t) * 0.142 - 0.01;
    el(d, '#d9c48e', lx, fa[1] + ly * Math.cos(tilt), fa[2] + ly * Math.sin(tilt), 0.011, 0.011, 0.007);
  }
  // Horns
  for (const sx of [-1, 1]) {
    const b = Hd.at(0.28, sx > 0 ? 1.15 : Math.PI - 1.15, 0.92);
    horn(d, b, [sx * 0.045, b[1] + 0.065, b[2] + 0.1], 0.012, H.top, '#efe3c4', [0, 1, -0.4]);
    eye(d, Hd.at(0.36, sx > 0 ? 0.45 : Math.PI - 0.45, 0.95), [sx * 0.8, 0.15, 0.4], 0.0075, '#6b4218');
  }
  horn(d, Hd.at(0.72, Math.PI / 2, 0.9), [0, 0.22, 0.34], 0.01, H.top);
  // Legs: knees forward, elbows back
  const LP = limbHide(H);
  legPair(d, { hip: [0.055, 0.21, -0.12], foot: [0.085, 0, -0.1], L: [0.11, 0.1], bend: 1, meta: 0.035, tilt: 0.25, w: [0.058, 0.034, 0.025, 0.023], type: 'hoof', fingers: 3, toe: 0.025, stride: 0.04, lift: 0.01, muscle: 1.3, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.065, 0.18, 0.1], foot: [0.095, 0, 0.12], L: [0.095, 0.085], bend: -1, w: [0.046, 0.03, 0.023, 0.021], type: 'hoof', fingers: 4, spread: 0.45, toe: 0.02, stride: -0.035, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Plate outline (kite with rounded top) for stegosaur back plates. */
const PLATE: [number, number][] = [[-0.5, 0], [-0.45, 0.35], [-0.2, 0.8], [0.05, 1], [0.3, 0.75], [0.48, 0.3], [0.5, 0]];

/** Stegosaurus: high-arched back with two alternating rows of tall plates, tiny head held low and a four-spiked tail. */
const stegosaurus: Builder = gp => {
  const S = forestFloor(gp, 11, {
    ferns: [[-0.3, 0.25, 0.11], [0.32, 0.22, 0.1], [0.28, -0.3, 0.1]], cycads: [[-0.34, -0.15, 0.2]], tree: [[0.3, -0.05, 0.22]],
    rocks: [[-0.15, 0.36, 0.04], [0.05, -0.38, 0.03]], horse: [[-0.38, 0.08, 0.1]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d);
  const H: Hide = {
    top: '#5b5a37', side: '#8f7a48', belly: '#d8c89c', patC: '#c06a2c', scales: 130, grain: 0.14,
    pat: (x, y, z, _u, s) => { const [f1] = worley(x * 26, y * 26, z * 26); return sst(0.32, 0.18, f1) * sst(-0.4, 0.2, s) * 0.55; },
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.1, 0.23, -0.47], w: 0.006 }, { p: [0.075, 0.24, -0.4], w: 0.014, h: 0.016 }, { p: [0.04, 0.25, -0.3], w: 0.028, h: 0.034 },
    { p: [0.01, 0.27, -0.18], w: 0.05, h: 0.062 }, { p: [0, 0.27, -0.07], w: 0.072, h: 0.09 }, { p: [0, 0.235, 0.04], w: 0.07, h: 0.08 },
    { p: [0, 0.19, 0.13], w: 0.052, h: 0.056 }, { p: [0, 0.15, 0.2], w: 0.03, h: 0.032 }, { p: [0, 0.125, 0.25], w: 0.024, h: 0.024 },
    { p: [0, 0.115, 0.29], w: 0.02, h: 0.019 }, { p: [0, 0.104, 0.325], w: 0.012, h: 0.011 }, { p: [0, 0.1, 0.335], w: 0.004, h: 0.004 },
  ];
  const B = loft(d, st, P, { nu: 84, nv: 22, shape: (u, a) => (Math.sin(a) < 0 && u < 0.7 ? 1 - 0.12 * -Math.sin(a) : 1) });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.88, sx > 0 ? 0.5 : Math.PI - 0.5, 0.92), [sx * 0.9, 0.2, 0.3], 0.005, '#3a2614');
  }
  el(d, '#4a3a28', 0, 0.098, 0.326, 0.008, 0.005, 0.008);
  // Plates: two alternating rows, tallest over the hips
  const plate = (u: number, side: number, sz: number) => {
    const b = B.at(u, Math.PI / 2, 0.82), T = B.F(u).T;
    const o = PLATE.map(([x, y]) => [x * sz * 0.9, y * sz] as [number, number]);
    vslab(d, o, 0.006, (_x, _y, _z, _lx, ly) => {
      const t = ly / sz;
      let c = mx(H.side, '#c8622e', sst(0.15, 0.6, t));
      c = mx(c, '#5a2c1c', sst(0.8, 1, t) * 0.6);
      return sh(c, 0.95 + vnoise(_lx * 90, ly * 90, 2) * 0.12);
    }, [b[0] + side * 0.011, b[1] - sz * 0.15, b[2]], [0, Math.atan2(T.x, T.z) + Math.PI / 2, -Math.atan2(T.y, Math.hypot(T.x, T.z)) * 0 + side * 0.14], 0.002, 'ZYX');
  };
  const N = 15;
  for (let i = 0; i < N; i++) {
    const u = 0.16 + i * (0.66 / (N - 1)), sz = 0.03 + 0.07 * Math.pow(Math.sin(Math.PI * Math.min(1, (u - 0.1) / 0.68)), 1.4);
    plate(u, i % 2 ? 1 : -1, sz);
  }
  // Thagomizer: four tail spikes splayed up and out
  for (const sx of [-1, 1]) for (const [u, k] of [[0.045, 1], [0.09, 0.9]] as const) {
    const b = B.at(u, sx > 0 ? 0.6 : Math.PI - 0.6, 0.8);
    horn(d, b, [b[0] + sx * 0.06 * k, b[1] + 0.045 * k, b[2] - 0.035], 0.008, '#8f7a48', '#efe3c4');
  }
  const LP = limbHide(H);
  legPair(d, { hip: [0.05, 0.26, -0.08], foot: [0.075, 0, -0.07], L: [0.13, 0.11], bend: 1, meta: 0.03, tilt: 0.25, w: [0.048, 0.026, 0.02, 0.018], type: 'hoof', fingers: 3, toe: 0.022, stride: 0.035, lift: 0.008, muscle: 1.3, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.05, 0.17, 0.12], foot: [0.075, 0, 0.13], L: [0.085, 0.08], bend: -1, w: [0.032, 0.021, 0.016, 0.016], type: 'hoof', fingers: 4, spread: 0.45, toe: 0.016, stride: -0.03, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Ankylosaurus: low, wide tank of bony studs with side spikes, horned triangular head and a heavy two-lobed tail club. */
const ankylosaurus: Builder = gp => {
  const S = forestFloor(gp, 13, {
    top: '#76803f', ferns: [[-0.3, 0.26, 0.1], [0.34, 0.2, 0.1], [0.3, -0.28, 0.1], [-0.33, -0.2, 0.09]], cycads: [[0.36, -0.02, 0.17]],
    rocks: [[-0.4, 0.04, 0.04], [0.1, 0.38, 0.035], [-0.1, -0.4, 0.03]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d);
  const H: Hide = { top: '#5e5236', side: '#8a7550', belly: '#cbb68e', patC: '#3e3424', scales: 140, grain: 0.15 };
  const P = hide(H);
  const st: St[] = [
    { p: [0.1, 0.09, -0.46], w: 0.012, h: 0.012 }, { p: [0.07, 0.1, -0.38], w: 0.016, h: 0.016 }, { p: [0.03, 0.12, -0.27], w: 0.032, h: 0.03 },
    { p: [0, 0.14, -0.15], w: 0.085, h: 0.055 }, { p: [0, 0.15, -0.03], w: 0.11, h: 0.064 }, { p: [0, 0.14, 0.09], w: 0.1, h: 0.058 },
    { p: [0, 0.125, 0.17], w: 0.06, h: 0.042 }, { p: [0, 0.125, 0.21], w: 0.05, h: 0.036 },
  ];
  const B = loft(d, st, P, { nu: 60, nv: 26, shape: (_u, a) => (Math.sin(a) < 0 ? 1 - 0.25 * -Math.sin(a) : 1) });
  // Osteoderm studs in rows across the back
  const stud = sh(H.top, 0.85);
  for (let i = 0; i < 9; i++) {
    const u = 0.38 + i * 0.065, n = i < 1 || i > 7 ? 3 : 5;
    for (let j = 0; j < n; j++) {
      const a = Math.PI / 2 + (j - (n - 1) / 2) * 0.42 + (i % 2) * 0.12, p = B.at(u, a, 1.0), r = 0.012 + (Math.abs(j - (n - 1) / 2) < 1 ? 0.002 : 0);
      el(d, mx(stud, '#a4936c', ((i + j) % 3) * 0.2), p[0], p[1] + 0.002, p[2], r, r * 0.55, r * 1.2);
    }
  }
  // Side spikes along the flanks and shoulder
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
    const u = 0.4 + i * 0.075, b = B.at(u, sx > 0 ? 0.15 : Math.PI - 0.15, 0.96), L = i > 4 ? 0.04 : 0.028;
    horn(d, b, [b[0] + sx * L, b[1] - 0.004, b[2] - 0.01], 0.009, '#8a7550', '#e5d8b5');
  }
  // Tail club: two big lobes + centre
  const tc = B.at(0, 0, 0);
  for (const sx of [-1, 1]) vblob(d, tc[0] + sx * 0.026, tc[1], tc[2] + 0.004, 0.032, 0.022, 0.028, (_x, y) => mx('#7d6a48', '#b9a57c', sst(0.08, 0.13, y)), { seg: 12, bump: 0.25, seed: 21 });
  el(d, '#6d5c3e', tc[0], tc[1] + 0.004, tc[2] - 0.02, 0.022, 0.018, 0.03);
  // Head: wide, beaked, with horns at the back corners
  const hs: St[] = [{ p: [0, 0.125, 0.2], w: 0.05, h: 0.034 }, { p: [0, 0.12, 0.25], w: 0.048, h: 0.032 }, { p: [0, 0.105, 0.3], w: 0.032, h: 0.022 }, { p: [0, 0.097, 0.318], w: 0.012, h: 0.01 }];
  const Hd = loft(d, hs, P, { nu: 18, nv: 20 });
  for (const sx of [-1, 1]) {
    const b = Hd.at(0.15, sx > 0 ? 0.35 : Math.PI - 0.35, 0.96);
    horn(d, b, [b[0] + sx * 0.03, b[1] + 0.006, b[2] - 0.022], 0.01, '#8a7550', '#e5d8b5');
    const b2 = Hd.at(0.2, sx > 0 ? 1.0 : Math.PI - 1.0, 0.96);
    horn(d, b2, [b2[0] + sx * 0.02, b2[1] + 0.018, b2[2] - 0.02], 0.007, '#8a7550', '#e5d8b5');
    eye(d, Hd.at(0.45, sx > 0 ? 0.35 : Math.PI - 0.35, 0.95), [sx, 0.1, 0.3], 0.0055, '#5a3414');
  }
  const LP = limbHide(H);
  legPair(d, { hip: [0.075, 0.12, -0.13], foot: [0.1, 0, -0.12], L: [0.058, 0.052], bend: 1, meta: 0.02, tilt: 0.2, w: [0.05, 0.034, 0.028, 0.025], type: 'hoof', fingers: 3, toe: 0.022, stride: 0.03, muscle: 1.25, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.075, 0.11, 0.1], foot: [0.1, 0, 0.12], L: [0.055, 0.05], bend: -1, w: [0.042, 0.03, 0.025, 0.023], type: 'hoof', fingers: 4, spread: 0.45, toe: 0.018, stride: -0.03, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Monkey-puzzle style conifer: straight trunk with whorls of drooping branch tufts. */
function araucaria(p: THREE.Object3D, L: Leaves, x: number, y: number, z: number, h: number, seed = 0): void {
  loft(p, [{ p: [x, y - 0.01, z], w: h * 0.04 }, { p: [x, y + h * 0.5, z], w: h * 0.028 }, { p: [x, y + h, z], w: h * 0.01 }], (_x, yy, _z, nx, _ny, nz) => sh('#6b4e33', 0.85 + 0.25 * vnoise(nx * 4, yy * 120, nz * 4)), { nu: 8, nv: 8 });
  for (let k = 0; k < 4; k++) {
    const yy = y + h * (0.55 + k * 0.14), len = h * (0.34 - k * 0.07);
    for (let i = 0; i < 6; i++) frond(L, [x, yy, z], i * 1.05 + k * 0.5 + seed, len, len * 0.15, len * 0.5, len * 0.22, k % 2 ? '#2f5a2c' : '#3a6a32', 6, 0.5, seed + k * 7 + i);
  }
}

/** Brachiosaurus: giraffe-like sauropod with long front legs, near-vertical neck and an arched nasal crest; conifer to browse. */
const brachiosaurus: Builder = gp => {
  const S = forestFloor(gp, 17, {
    ferns: [[-0.3, 0.28, 0.1], [0.3, 0.3, 0.09], [0.32, -0.3, 0.1]], cycads: [[-0.35, -0.2, 0.18]],
    rocks: [[-0.4, 0.05, 0.04], [0.42, 0.05, 0.03]], horse: [[0.1, -0.4, 0.1]],
  });
  araucaria(gp, S.L, 0.18, S.H(0.18, 0.3) - 0.004, 0.3, 0.62, 2);
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d); d.rotation.y = -0.25;
  const H: Hide = {
    top: '#5e6656', side: '#86866a', belly: '#cfc6a6', patC: '#4c5446', scales: 120, grain: 0.13,
    pat: (x, y, z, u, s) => (u < 0.5 ? sst(0.5, 0.8, Math.sin(z * 40 + y * 10)) * sst(-0.2, 0.5, s) * 0.6 : sst(0.55, 0.8, fbm(x * 25, y * 25, z * 25, 2)) * 0.5),
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.06, 0.1, -0.44], w: 0.005 }, { p: [0.04, 0.14, -0.36], w: 0.014, h: 0.016 }, { p: [0.015, 0.19, -0.25], w: 0.03, h: 0.036 },
    { p: [0, 0.24, -0.14], w: 0.06, h: 0.07 }, { p: [0, 0.27, -0.04], w: 0.074, h: 0.085 }, { p: [0, 0.3, 0.06], w: 0.072, h: 0.082 },
    { p: [0, 0.35, 0.13], w: 0.05, h: 0.052 }, { p: [0, 0.43, 0.17], w: 0.032, h: 0.034 }, { p: [0, 0.53, 0.19], w: 0.024, h: 0.025 },
    { p: [0, 0.62, 0.2], w: 0.02, h: 0.021 }, { p: [0, 0.68, 0.215], w: 0.018, h: 0.022 }, { p: [0, 0.695, 0.245], w: 0.019, h: 0.024 },
    { p: [0, 0.688, 0.28], w: 0.014, h: 0.016 }, { p: [0, 0.682, 0.295], w: 0.006, h: 0.007 },
  ];
  const B = loft(d, st, P, { nu: 100, nv: 20, shape: (u, a) => (Math.sin(a) < 0 && u < 0.5 ? 1 - 0.1 * -Math.sin(a) : 1) });
  // Nasal crest arch above the eyes
  const c0 = B.at(0.93, Math.PI / 2, 0.9);
  el(d, sh(H.top, 0.95), c0[0], c0[1] + 0.007, c0[2] - 0.004, 0.012, 0.012, 0.016);
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.925, sx > 0 ? 0.35 : Math.PI - 0.35, 0.95), [sx, 0.2, 0.2], 0.0045, '#3a2614');
    const n = B.at(0.94, sx > 0 ? 1.1 : Math.PI - 1.1, 1.0);
    el(d, '#2b241c', n[0], n[1] + 0.009, n[2], 0.003, 0.002, 0.004);
  }
  // Columnar legs: front ones longer
  const LP = limbHide(H);
  legPair(d, { hip: [0.036, 0.27, -0.1], foot: [0.065, 0, -0.1], L: [0.123, 0.107], bend: 1, meta: 0.02, tilt: 0.1, w: [0.039, 0.028, 0.025, 0.024], type: 'pad', fingers: 3, toe: 0.02, stride: 0.03, muscle: 1.2, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.04, 0.31, 0.08], foot: [0.07, 0, 0.1], L: [0.143, 0.127], bend: -1, w: [0.033, 0.026, 0.023, 0.022], type: 'pad', fingers: 1, toe: 0.02, stride: -0.03, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Flat water surface with ripple rings around given points; slightly glossy. */
function water(gp: THREE.Object3D, y: number, rings: [number, number][] = [], R = 0.479, deep = '#2b6a84', shallow = '#5fa6b4', opacity?: number): void {
  const m = surf(gp, 10, 56, (u, v) => { const a = v * Math.PI * 2, r = R * Math.pow(u, 0.8); return [Math.cos(a) * r, y, Math.sin(a) * r]; }, (x, _y, z) => {
    let c = mx(deep, shallow, 0.35 + 0.5 * fbm(x * 7, 2, z * 7, 2) - 0.2);
    for (const [rx, rz] of rings) { const d = Math.hypot(x - rx, z - rz); c = mx(c, '#d9eef0', sst(0.55, 0.95, Math.cos(d * 90)) * sst(0.1, 0.02, d) * 0.6); }
    return c;
  }, false, [0, 1, 0]);
  m.material = mat('#ffffff', { flat: false, vc: true, rough: 0.12, metal: 0.15, ...(opacity !== undefined ? { transparent: opacity } : {}) });
}
/** Mesh water ring: a few rings of ripples rising slightly around a point (splash collar). */
function ripples(gp: THREE.Object3D, x: number, y: number, z: number, r: number): void {
  for (let k = 0; k < 2; k++) {
    const rr = r * (1 + k * 0.7);
    const m = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0025, 4, 28), mat('#e3f3f5', { flat: false, rough: 0.2 }));
    m.rotation.x = Math.PI / 2; m.position.set(x, y + 0.001, z); gp.add(m);
  }
}
/** Row of overlapping feathers (two-sided quads) rooted along a→b, pointing along `dir(t)`. */
function feathers(F: Leaves, a: V3, b: V3, dir: (t: number) => V3, n: number, len: (t: number) => number, w: number, col: (i: number, t: number) => string): void {
  const e = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), q = lerp3(a, b, t), d = dir(t), l = len(t), c = col(i, t), p: V3 = [q[0], q[1] + i * 0.0003, q[2]];
    const tip: V3 = [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l];
    const p0: V3 = [p[0] - e.x * w * 0.5, p[1] - e.y * w * 0.5, p[2] - e.z * w * 0.5], p1: V3 = [p[0] + e.x * w * 0.5, p[1] + e.y * w * 0.5, p[2] + e.z * w * 0.5];
    const t0: V3 = [tip[0] - e.x * w * 0.45, tip[1] - e.y * w * 0.45, tip[2] - e.z * w * 0.45], t1: V3 = [tip[0] + e.x * w * 0.45, tip[1] + e.y * w * 0.45, tip[2] + e.z * w * 0.45];
    const pt: V3 = [tip[0] + d[0] * w * 0.35, tip[1] + d[1] * w * 0.35, tip[2] + d[2] * w * 0.35];
    F.tri(p0, p1, t1, c); F.tri(p0, t1, t0, c); F.tri(t0, t1, pt, sh(c, 0.85));
  }
}
const nrm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Parasaurolophus: duck-billed browser on all fours with a long backward tubular crest; striped flanks. */
const parasaurolophus: Builder = gp => {
  const S = forestFloor(gp, 19, {
    top: '#6c7f3d', ferns: [[-0.3, 0.26, 0.11], [0.3, 0.28, 0.1], [0.34, -0.22, 0.1], [-0.08, -0.4, 0.09]], tree: [[-0.32, -0.12, 0.24]],
    rocks: [[0.4, 0.05, 0.035], [-0.4, 0.15, 0.03]], horse: [[0.18, -0.36, 0.12], [-0.22, 0.36, 0.1]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d);
  const H: Hide = {
    top: '#4e5a2e', side: '#a3953f', belly: '#e2d6a4', patC: '#8c3b22', scales: 120, grain: 0.13,
    pat: (_x, y, z, u, s) => (u < 0.72 ? sst(0.6, 0.9, Math.sin(z * 70 + y * 20)) * sst(-0.35, 0.25, s) * sst(0.0, 0.2, u) * 0.75 : 0),
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.08, 0.22, -0.46], w: 0.005, h: 0.008 }, { p: [0.05, 0.235, -0.38], w: 0.012, h: 0.022 }, { p: [0.02, 0.25, -0.27], w: 0.026, h: 0.042 },
    { p: [0, 0.26, -0.13], w: 0.054, h: 0.07 }, { p: [0, 0.245, -0.03], w: 0.062, h: 0.075 }, { p: [0, 0.22, 0.06], w: 0.05, h: 0.06 },
    { p: [0, 0.235, 0.12], w: 0.032, h: 0.038 }, { p: [0, 0.285, 0.16], w: 0.022, h: 0.026 }, { p: [0, 0.318, 0.185], w: 0.022, h: 0.026 },
    { p: [0, 0.315, 0.22], w: 0.019, h: 0.022 }, { p: [0, 0.302, 0.258], w: 0.015, h: 0.014 }, { p: [0, 0.295, 0.283], w: 0.017, h: 0.009 },
    { p: [0, 0.292, 0.294], w: 0.009, h: 0.005 },
  ];
  const B = loft(d, st, (x, y, z, nx, ny, nz, u, a) => (u > 0.93 ? '#4a3c2c' : P(x, y, z, nx, ny, nz, u, a)), { nu: 96, nv: 20, shape: (u, a) => (Math.sin(a) < 0 && u < 0.6 ? 1 - 0.1 * -Math.sin(a) : 1) });
  // The crest: a hollow-sounding tube sweeping back from the snout over the neck
  const c0 = B.at(0.8, Math.PI / 2, 0.6);
  loft(d, [{ p: [0, c0[1] - 0.004, c0[2] + 0.03], w: 0.008, h: 0.011 }, { p: [0, c0[1] + 0.014, c0[2] - 0.005], w: 0.009, h: 0.012 }, { p: [0, c0[1] + 0.032, c0[2] - 0.06], w: 0.009, h: 0.011 }, { p: [0, c0[1] + 0.045, c0[2] - 0.11], w: 0.008, h: 0.009 }, { p: [0, c0[1] + 0.048, c0[2] - 0.125], w: 0.004, h: 0.004 }],
    (x, y, z, _nx, ny) => sh(mx('#7a3a3c', '#c3624a', sst(0.6, 0.3, (c0[2] - z) / 0.12) * 0.7 + sst(-0.2, 0.8, ny) * 0.2), 0.95 + vnoise(x * 80, y * 80, z * 80) * 0.1), { nu: 24, nv: 12 });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.73, sx > 0 ? 0.4 : Math.PI - 0.4, 0.95), [sx, 0.2, 0.3], 0.0055, '#5a3414');
    const n = B.at(0.93, sx > 0 ? 0.6 : Math.PI - 0.6, 0.95); el(d, '#2a2018', n[0], n[1], n[2], 0.003, 0.002, 0.005);
  }
  const LP = limbHide(H);
  legPair(d, { hip: [0.045, 0.25, -0.12], foot: [0.07, 0, -0.1], L: [0.13, 0.11], bend: 1, meta: 0.05, tilt: 0.35, w: [0.05, 0.028, 0.018, 0.016], type: 'hoof', fingers: 3, toe: 0.03, stride: 0.05, lift: 0.012, muscle: 1.35, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.04, 0.2, 0.07], foot: [0.06, 0, 0.12], L: [0.11, 0.1], bend: -1, w: [0.022, 0.016, 0.012, 0.011], type: 'hoof', fingers: 3, spread: 0.3, toe: 0.015, stride: -0.035, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Velociraptor: turkey-sized feathered hunter with folded wing feathers, a stiff fan tail and the raised sickle claw; Gobi sand. */
const velociraptor: Builder = gp => {
  const S = forestFloor(gp, 23, {
    top: '#d6a466', moss: '#c48f55', soil: '#b9784a', sand: true, strata: ['#b5653a', '#c97a48', '#a35632', '#d9925c', '#9a4f2e'],
    hf: (x, z) => 0.022 * Math.sin(x * 7 + z * 3) * sst(0.15, 0.4, Math.hypot(x, z)) + 0.006 * vnoise(x * 12, 1, z * 12),
    bones: [-0.2, 0.3, 1.1],
  });
  for (const [x, z, sc, i] of [[0.32, -0.22, 0.06, 0], [0.38, -0.06, 0.035, 1], [-0.34, -0.12, 0.05, 2], [0.28, 0.28, 0.03, 3]] as const)
    rock(gp, x, S.H(x, z) + sc * 0.1, z, sc, i % 2 ? '#b8683f' : '#c97b4a', 40 + i, 0.9);
  // Protoceratops skull half-buried in the sand
  const sk: V3 = [0.12, S.H(0.12, 0.3), 0.3];
  el(gp, '#e8dcc0', sk[0], sk[1] + 0.006, sk[2], 0.03, 0.016, 0.022, 0.6);
  el(gp, '#e8dcc0', sk[0] - 0.02, sk[1] + 0.012, sk[2] - 0.02, 0.028, 0.022, 0.006, 0.6);
  el(gp, '#3a2c20', sk[0] + 0.008, sk[1] + 0.012, sk[2] + 0.01, 0.006);
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d); d.rotation.y = 0.15; d.scale.setScalar(1.3); d.position.z = 0.03;
  // Skin under the plumage (visible between feathers and on the face/feet)
  const H: Hide = { top: '#4a3020', side: '#8a5e36', belly: '#ddcba6', grain: 0.2 };
  const P = hide(H);
  const st: St[] = [
    { p: [0, 0.25, -0.44], w: 0.005 }, { p: [0, 0.238, -0.33], w: 0.011, h: 0.012 }, { p: [0, 0.226, -0.21], w: 0.018, h: 0.021 },
    { p: [0, 0.214, -0.1], w: 0.032, h: 0.04 }, { p: [0, 0.206, -0.02], w: 0.042, h: 0.052 }, { p: [0, 0.196, 0.06], w: 0.036, h: 0.048 },
    { p: [0, 0.21, 0.1], w: 0.022, h: 0.026 }, { p: [0, 0.243, 0.122], w: 0.016, h: 0.018 }, { p: [0, 0.268, 0.15], w: 0.02, h: 0.022 },
    { p: [0, 0.262, 0.18], w: 0.013, h: 0.016 }, { p: [0, 0.256, 0.21], w: 0.0085, h: 0.011 }, { p: [0, 0.257, 0.235], w: 0.0055, h: 0.0065 },
    { p: [0, 0.26, 0.25], w: 0.002, h: 0.0025 },
  ];
  // Long, low, narrow snout with a concave (upturned) top line
  const B = loft(d, st, (x, y, z, nx, ny, nz, u, a) => (u > 0.68 && Math.abs(Math.sin(a) + 0.35) < 0.08 ? '#2a1a14' : P(x, y, z, nx, ny, nz, u, a)), { nu: 72, nv: 16 });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.69, sx > 0 ? 0.5 : Math.PI - 0.5, 0.92), [sx, 0.15, 0.35], 0.005, '#d4a020');
    for (let i = 0; i < 6; i++) { const b = B.at(0.73 + i * 0.035, sx > 0 ? -0.45 : Math.PI + 0.45, 0.98); tooth(d, b, [b[0], b[1] - 0.005, b[2] - 0.001], 0.0015); }
    const n = B.at(0.94, sx > 0 ? 0.8 : Math.PI - 0.8, 0.96); el(d, '#21160f', n[0], n[1], n[2], 0.0018, 0.0012, 0.003);
  }
  const F = new Leaves();
  /** One vaned feather: two-tone quad + pointed tip, rooted at p, lying along dir, width across wv. */
  const plume = (p: V3, dir: V3, wv: V3, len: number, wd: number, c1: string, c2: string) => {
    const at = (k: number, s: number): V3 => [p[0] + dir[0] * len * k + wv[0] * wd * s, p[1] + dir[1] * len * k + wv[1] * wd * s, p[2] + dir[2] * len * k + wv[2] * wd * s];
    const b0 = at(0, -0.5), b1 = at(0, 0.5), m0 = at(0.68, -0.5), m1 = at(0.68, 0.5);
    F.tri(b0, b1, m1, c1); F.tri(b0, m1, m0, c1); F.tri(m0, m1, at(1, 0), c2);
  };
  // Contour-feather coat: overlapping plumes over trunk, neck and back of the head, lying back along the body
  const coat = (u: number, s: number): [string, string] => {
    if (u > 0.5 && s < 0.1) return ['#efe4cc', '#d8c8a8'];                       // pale throat and neck
    if (s < -0.45) return ['#e2d0aa', '#cdb88e'];                                   // cream belly
    if (u < 0.3) return Math.sin(u * 70) > 0.2 ? ['#3a2618', '#2a1a12'] : ['#b5743a', '#8a5226']; // banded tail
    if (s > 0.35) return Math.sin(u * 120) > 0.5 ? ['#3c2717', '#2c1c12'] : ['#5a3b24', '#3e2818']; // dark barred back
    return ['#9b6a3a', '#7a5230'];                                                   // tan flanks
  };
  for (let i = 0; i <= 50; i++) {
    const u = 0.035 + i * 0.0127, R = B.F(u), na = u > 0.6 ? 9 : 12;
    for (let j = 0; j < na; j++) {
      const a = (j + (i % 2) * 0.5 + (hash3(i, j, 5) - 0.5) * 0.4) / na * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      if (u < 0.3 && sa < -0.5) continue;
      const rad = R.S.clone().multiplyScalar(ca).addScaledVector(R.N, sa).normalize(), tan = R.S.clone().multiplyScalar(-sa).addScaledVector(R.N, ca).normalize();
      const fl = 0.3 + hash3(i, j, 7) * 0.15, p = B.at(u, a, 0.95), dir = nrm([-R.T.x + rad.x * fl, -R.T.y + rad.y * fl - 0.08, -R.T.z + rad.z * fl]);
      const sz = Math.min(R.w, R.h), [c1, c2] = coat(u, sa), k = 0.86 + hash3(i, j, 9) * 0.28;
      plume(p, dir, [tan.x, tan.y, tan.z], (0.014 + sz * 0.5) * (0.85 + hash3(j, i, 3) * 0.3), 0.004 + sz * 0.2, sh(c1, k), sh(c2, k));
    }
  }
  // Feathered tail fan: rectrices spreading sideways along the distal half of the stiff tail
  for (const sx of [-1, 1]) for (let i = 0; i < 11; i++) {
    const t = i / 10, u = 0.005 + t * 0.26, p = B.at(u, sx > 0 ? 0 : Math.PI, 0.7), dir = nrm([sx * (0.7 - t * 0.15), 0.03, -0.75 + t * 0.15]);
    plume(p, dir, [0, 0, 1], 0.05 - Math.abs(t - 0.45) * 0.03, 0.013, i % 3 === 0 ? '#3a2618' : '#b0703a', '#2a1a12');
  }
  for (let k = -1; k <= 1; k++) plume(B.at(0.01, Math.PI / 2, 0.5), nrm([k * 0.25, 0.02, -1]), [1, 0, 0], 0.045, 0.012, '#8a5226', '#2a1a12');
  // Feathered thighs ("trousers") over the upper legs
  for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) {
    const a = (i / 9 - 0.5) * 2.4, p: V3 = [sx * (0.03 + 0.04 * Math.cos(a)), 0.2 + 0.03 * Math.sin(a) * 0.3, -0.02 + 0.042 * Math.sin(a)];
    plume(p, nrm([sx * 0.3 * Math.cos(a), -1, -0.3 + Math.sin(a) * 0.3]), [-Math.sin(a) * sx, 0, Math.cos(a)], 0.07, 0.022, i % 2 ? '#8a5e36' : '#7a5230', '#4a3020');
  }
  // Wings: arm folded at the side, secondaries on the forearm, long primaries on the hand; palms face inward
  const LP = limbHide(H);
  for (const sx of [-1, 1]) {
    const sh0: V3 = [sx * 0.03, 0.2, 0.075], elb: V3 = [sx * 0.07, 0.186, 0.035], wr: V3 = [sx * 0.098, 0.196, 0.078], hd: V3 = [sx * 0.112, 0.19, 0.106];
    loft(d, [{ p: sh0, w: 0.013 }, { p: elb, w: 0.008 }, { p: wr, w: 0.006 }, { p: hd, w: 0.0045 }], LP, { nu: 12, nv: 8 });
    // three clawed fingers stacked vertically, claws curling toward the midline
    for (let k = 0; k < 3; k++) {
      const f0: V3 = [hd[0], hd[1] + 0.004 - k * 0.004, hd[2]], f1: V3 = [hd[0], f0[1] - 0.003, hd[2] + 0.012 - k * 0.002];
      loft(d, [{ p: f0, w: 0.0022 }, { p: f1, w: 0.0016 }], () => '#4a3a2c', { nu: 2, nv: 6, caps: false });
      claw(d, '#1e140e', f1, [f1[0] - sx * 0.002, f1[1] - 0.004, f1[2] + 0.009], 0.0019, [sx, 0, 0]);
    }
    for (let i = 0; i < 8; i++) { const t = i / 7, p = lerp3(elb, wr, t); plume([p[0], p[1] - 0.002, p[2]], nrm([sx * (0.15 + t * 0.2), -0.35, -1]), [sx * 0.3, 0.2, 1], 0.05 + t * 0.008, 0.013, sh('#7a6450', 0.9 + (i % 3) * 0.08), '#2e221a'); }
    for (let i = 0; i < 9; i++) { const t = i / 8, p = lerp3(wr, hd, t); plume([p[0], p[1] - 0.002, p[2]], nrm([sx * (0.35 + t * 0.35), -0.3, -1 + t * 0.25]), [sx * 0.3, 0.2, 1], 0.064 + t * 0.022, 0.013, sh('#6d6a63', 0.92 + (i % 2) * 0.1), '#1e1c1a'); }
    for (let i = 0; i < 9; i++) { const t = i / 8, p = lerp3(sh0, hd, t); plume([p[0], p[1] + 0.003, p[2]], nrm([sx * (0.2 + t * 0.3), -0.2, -1]), [sx * 0.3, 0.2, 1], 0.026, 0.014, i % 2 ? '#9a5a2e' : '#a8683a', '#6a3a1e'); }
  }
  // Short crest of fluffy feathers on the head and nape
  for (let i = 0; i < 5; i++) plume(B.at(0.6 + i * 0.016, Math.PI / 2, 0.95), nrm([0, 0.5, -1]), [1, 0, 0], 0.018, 0.008, '#3c2717', '#2c1c12');
  F.done(d);
  // Scaly lower legs, feathered upper legs, raised sickle claw on toe II
  const LPf: BP = (x, y, z, nx, ny, nz) => (y > 0.12 ? sh(mx('#8a5e36', '#5a3b24', sst(0.0, 1, ny)), 0.95 + vnoise(x * 90, y * 90, z * 90) * 0.1) : y > 0.1 ? '#6a4a30' : sh('#4a3a2c', 0.9 + vnoise(x * 200, y * 200, z * 200) * 0.2));
  legPair(d, { hip: [0.03, 0.2, -0.02], foot: [0.05, 0, 0.0], L: [0.09, 0.085], bend: 1, meta: 0.06, tilt: 0.45, w: [0.034, 0.018, 0.011, 0.01], type: 'bird', toe: 0.035, sickle: true, stride: 0.05, lift: 0.012, muscle: 1.3, nails: '#1e140e' }, LPf);
  S.L.done(gp);
};

/** Spinosaurus: tall sail of skin over spines, crocodile snout gripping a fish, paddle tail trailing into a river. */
const spinosaurus: Builder = gp => {
  const wl = 0.05;
  const S = forestFloor(gp, 29, {
    top: '#8a7a50', moss: '#5f7032', soil: '#6e553a', wl,
    hf: (x, z) => 0.036 * sst(-0.15, 0.18, z + 0.3 * x) - 0.024 + 0.005 * vnoise(x * 14, 2, z * 14),
    ferns: [[0.3, 0.27, 0.1], [-0.12, 0.38, 0.09]], horse: [[0.22, 0.36, 0.1], [0.4, 0.12, 0.1]], rocks: [[0.05, 0.42, 0.03], [-0.3, 0.3, 0.035]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, -0.02) - 0.004; gp.add(d); d.rotation.y = -0.15;
  const H: Hide = {
    top: '#3c443d', side: '#857256', belly: '#dccaa6', patC: '#4a3c30', scales: 120, grain: 0.15,
    pat: (x, y, z, _u, s) => sst(0.55, 0.8, fbm(x * 28, y * 28, z * 28, 2)) * sst(-0.2, 0.4, s) * 0.7,
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.07, 0.1, -0.48], w: 0.003, h: 0.01 }, { p: [0.055, 0.105, -0.4], w: 0.006, h: 0.018 }, { p: [0.035, 0.115, -0.3], w: 0.011, h: 0.026 },
    { p: [0.015, 0.132, -0.19], w: 0.028, h: 0.042 }, { p: [0, 0.148, -0.08], w: 0.048, h: 0.056 }, { p: [0, 0.155, 0.02], w: 0.054, h: 0.062 },
    { p: [0, 0.162, 0.11], w: 0.045, h: 0.055 }, { p: [0, 0.19, 0.17], w: 0.028, h: 0.032 }, { p: [0, 0.215, 0.2], w: 0.024, h: 0.028 },
    { p: [0, 0.223, 0.226], w: 0.022, h: 0.027 }, { p: [0, 0.214, 0.27], w: 0.014, h: 0.019 }, { p: [0, 0.206, 0.32], w: 0.01, h: 0.012 },
    { p: [0, 0.204, 0.348], w: 0.012, h: 0.011 }, { p: [0, 0.201, 0.362], w: 0.004, h: 0.004 },
  ];
  const B = loft(d, st, (x, y, z, nx, ny, nz, u, a) => (u > 0.72 && Math.abs(Math.sin(a) + 0.3) < 0.07 ? '#3a1e1a' : P(x, y, z, nx, ny, nz, u, a)), { nu: 100, nv: 20 });
  // Sail along the back
  const o: [number, number][] = [], top: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const u = 0.27 + i * 0.044, b = B.at(u, Math.PI / 2, 0.6), t = i / 10, hg = 0.012 + 0.15 * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.15 * t);
    o.push([-b[2], b[1]]); top.unshift([-b[2] + 0.01 * Math.sin(t * 3), b[1] + hg]);
  }
  vslab(d, [...o, ...top], 0.008, (_x, y, _z, lx) => {
    let c = mx(H.side, '#c75a2e', sst(0.24, 0.33, y));
    c = mx(c, '#3a2a22', sst(0.345, 0.37, y) * 0.7);
    c = mx(c, sh(c, 0.7), sst(0.8, 1, Math.cos(lx * 240)) * 0.6);
    return sh(c, 0.95 + vnoise(lx * 90, y * 90, 4) * 0.1);
  }, [0, 0, 0], [0, Math.PI / 2, 0], 0.002);
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.69, sx > 0 ? 0.55 : Math.PI - 0.55, 0.92), [sx, 0.3, 0.3], 0.005, '#c88a20');
    for (let i = 0; i < 6; i++) { const b = B.at(0.74 + i * 0.035, sx > 0 ? -0.4 : Math.PI + 0.4, 0.98); tooth(d, b, [b[0], b[1] - 0.008, b[2] + 0.001], 0.0019); }
  }
  // Paddle tail: tall, flat fin of skin over long neural spines and chevrons (Ibrahim et al. 2020)
  const fin = (u: number) => { const t = u / 0.33; return [0.012 + 0.085 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (0.6 + 0.4 * (1 - t)), 0.01 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) * (1 - t * 0.5)]; };
  sheet(d, 30, 5, (u, v) => { const uu = 0.005 + u * 0.33, R = B.F(uu), [up, dn] = fin(uu); return [R.P.x, R.P.y - dn + (up + dn) * v, R.P.z]; },
    (x, y, z, u, v) => { let c = mx(sh(H.side, 0.8), '#3c443d', sst(0.45, 0.85, v)); c = mx(c, '#a8482a', sst(0.75, 0.97, v) * 0.45); return sh(c, 0.9 + 0.12 * sst(0.6, 1, Math.cos(u * 140)) + (vnoise(x * 90, y * 90, z * 90) - 0.5) * 0.1); });
  // A fish caught in the jaws
  drop(d, '#b9c3c4', [-0.035, 0.198, 0.338], [0.04, 0.2, 0.345], 0.009, 0.006, [0, 1, 0]);
  const F = new Leaves();
  F.tri([-0.034, 0.198, 0.338], [-0.05, 0.21, 0.336], [-0.05, 0.186, 0.338], '#8a9698');
  F.tri([0.0, 0.208, 0.342], [0.012, 0.208, 0.342], [-0.004, 0.218, 0.341], '#7c8a8c');
  F.done(d);
  // Robust clawed arms
  const LP = limbHide(H);
  for (const sx of [-1, 1]) {
    const s0: V3 = [sx * 0.04, 0.15, 0.12], e0: V3 = [sx * 0.058, 0.115, 0.1], w0: V3 = [sx * 0.055, 0.095, 0.145];
    loft(d, [{ p: s0, w: 0.018 }, { p: e0, w: 0.012 }, { p: w0, w: 0.009 }], LP, { nu: 10, nv: 9 });
    for (let k = 0; k < 3; k++) claw(d, '#2a221b', [w0[0], w0[1] + 0.005 - k * 0.005, w0[2] + 0.004], [w0[0] - sx * 0.003, w0[1] - 0.004 - k * 0.006, w0[2] + 0.02], 0.0034 + (k === 0 ? 0.0012 : 0), [sx, 0, 0]);
  }
  // Short hind legs (2020 reconstruction): the body rides low
  legPair(d, { hip: [0.04, 0.15, -0.07], foot: [0.068, 0, -0.05], L: [0.082, 0.072], bend: 1, meta: 0.032, tilt: 0.35, w: [0.044, 0.023, 0.015, 0.014], type: 'bird', toe: 0.045, spread: 0.5, stride: 0.04, muscle: 1.3, nails: '#2a221b' }, LP);
  water(gp, wl, [[-0.03, -0.38], [0.06, -0.05], [-0.07, 0.0]]);
  S.L.done(gp);
};

/** Argentinosaurus: colossal long-necked titanosaur, heavy columnar legs and mottled hide on dry Patagonian ground. */
const argentinosaurus: Builder = gp => {
  const S = forestFloor(gp, 31, {
    top: '#b0935f', moss: '#8a8a4a', soil: '#b07a4e', strata: ['#a85e3a', '#c27a4c', '#8f4f32', '#d39663', '#7a4630'],
    ferns: [[-0.32, 0.26, 0.09], [0.36, -0.22, 0.08]], cycads: [[0.34, 0.24, 0.15]], rocks: [[-0.4, -0.08, 0.045], [0.08, -0.42, 0.035], [0.42, 0.02, 0.03]],
  });
  araucaria(gp, S.L, -0.3, S.H(-0.3, -0.26) - 0.004, -0.26, 0.4, 5);
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d); d.rotation.y = 0.35;
  const H: Hide = {
    top: '#5d5040', side: '#8f7a5c', belly: '#d2bf9a', patC: '#4a3d30', scales: 110, grain: 0.14,
    pat: (x, y, z, _u, s) => { const [f1] = worley(x * 20, y * 20, z * 20); return sst(0.3, 0.15, f1) * sst(-0.3, 0.3, s) * 0.6; },
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.17, 0.14, -0.44], w: 0.005 }, { p: [0.12, 0.18, -0.37], w: 0.012, h: 0.014 }, { p: [0.06, 0.23, -0.27], w: 0.028, h: 0.032 },
    { p: [0.015, 0.27, -0.15], w: 0.058, h: 0.066 }, { p: [0, 0.29, -0.04], w: 0.076, h: 0.084 }, { p: [0, 0.285, 0.06], w: 0.072, h: 0.08 },
    { p: [0, 0.285, 0.13], w: 0.05, h: 0.055 }, { p: [0, 0.31, 0.19], w: 0.032, h: 0.034 }, { p: [0, 0.35, 0.245], w: 0.024, h: 0.025 },
    { p: [0, 0.395, 0.29], w: 0.02, h: 0.021 }, { p: [0, 0.418, 0.322], w: 0.019, h: 0.021 }, { p: [0, 0.414, 0.352], w: 0.015, h: 0.016 },
    { p: [0, 0.41, 0.372], w: 0.006, h: 0.006 },
  ];
  const B = loft(d, st, P, { nu: 96, nv: 22, shape: (u, a) => (Math.sin(a) < 0 && u < 0.55 ? 1 - 0.1 * -Math.sin(a) : 1) });
  // Low osteoderm bumps along the back
  for (let i = 0; i < 12; i++) { const p = B.at(0.2 + i * 0.035, Math.PI / 2, 0.98); el(d, sh(H.top, 0.9), p[0], p[1], p[2], 0.008, 0.005, 0.01); }
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.9, sx > 0 ? 0.4 : Math.PI - 0.4, 0.95), [sx, 0.2, 0.3], 0.0045, '#3a2614');
    const n = B.at(0.93, sx > 0 ? 1.0 : Math.PI - 1.0, 1.0); el(d, '#2b241c', n[0], n[1], n[2], 0.003, 0.002, 0.004);
  }
  const LP = limbHide(H);
  legPair(d, { hip: [0.04, 0.29, -0.05], foot: [0.07, 0, -0.04], L: [0.131, 0.115], bend: 1, meta: 0.02, tilt: 0.1, w: [0.044, 0.031, 0.028, 0.027], type: 'pad', fingers: 3, toe: 0.02, stride: 0.035, muscle: 1.2, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.042, 0.29, 0.11], foot: [0.07, 0, 0.13], L: [0.133, 0.119], bend: -1, w: [0.038, 0.029, 0.027, 0.026], type: 'pad', fingers: 1, toe: 0.02, stride: -0.035, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Mamenchisaurus: record-long neck sweeping out to one side, small body, banded hide; Sichuan horsetail swamp. */
const mamenchisaurus: Builder = gp => {
  const S = forestFloor(gp, 37, {
    top: '#64793a', moss: '#4f6c2c', ferns: [[-0.32, 0.22, 0.1], [0.3, -0.3, 0.1], [-0.05, -0.4, 0.09]], tree: [[-0.32, -0.18, 0.22]],
    rocks: [[0.4, -0.05, 0.035], [-0.42, 0.04, 0.03]], horse: [[0.36, 0.22, 0.13], [0.42, 0.12, 0.11], [-0.2, 0.36, 0.12]],
  });
  const d = new THREE.Group(); d.position.set(0.017, S.H(0, 0) - 0.002, -0.036); gp.add(d); d.rotation.y = -0.45;
  const H: Hide = {
    top: '#6b5a3a', side: '#b08a55', belly: '#e6d4ac', patC: '#3a2c1e', scales: 110, grain: 0.14,
    pat: (_x, _y, _z, u, s) => sst(0.35, 0.8, Math.sin(u * 95)) * sst(-0.4, 0.3, s) * 0.85,
  };
  const P = hide(H);
  const st: St[] = [
    { p: [-0.15, 0.15, -0.4], w: 0.004 }, { p: [-0.11, 0.175, -0.34], w: 0.011, h: 0.012 }, { p: [-0.055, 0.21, -0.26], w: 0.024, h: 0.028 },
    { p: [-0.015, 0.245, -0.17], w: 0.05, h: 0.058 }, { p: [0, 0.26, -0.07], w: 0.064, h: 0.072 }, { p: [0, 0.255, 0.02], w: 0.062, h: 0.07 },
    // Extremely long neck: about half the animal's total length
    { p: [0.005, 0.255, 0.08], w: 0.042, h: 0.046 }, { p: [0.02, 0.29, 0.14], w: 0.027, h: 0.028 }, { p: [0.045, 0.345, 0.2], w: 0.022, h: 0.023 },
    { p: [0.08, 0.4, 0.25], w: 0.019, h: 0.02 }, { p: [0.12, 0.445, 0.29], w: 0.017, h: 0.018 }, { p: [0.165, 0.478, 0.322], w: 0.015, h: 0.016 },
    { p: [0.21, 0.495, 0.35], w: 0.014, h: 0.016 }, { p: [0.238, 0.49, 0.37], w: 0.012, h: 0.013 }, { p: [0.252, 0.485, 0.382], w: 0.005, h: 0.005 },
  ];
  const B = loft(d, st, P, { nu: 110, nv: 20, shape: (u, a) => (Math.sin(a) < 0 && u < 0.5 ? 1 - 0.1 * -Math.sin(a) : 1) });
  for (const sx of [-1, 1]) eye(d, B.at(0.94, sx > 0 ? 0.4 : Math.PI - 0.4, 0.95), [sx * 0.8, 0.2, 0.5], 0.0042, '#3a2614');
  const LP = limbHide(H);
  legPair(d, { hip: [0.032, 0.27, -0.07], foot: [0.06, 0, -0.06], L: [0.123, 0.107], bend: 1, meta: 0.02, tilt: 0.1, w: [0.039, 0.028, 0.025, 0.024], type: 'pad', fingers: 3, toe: 0.02, stride: 0.035, muscle: 1.2, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.033, 0.26, 0.06], foot: [0.06, 0, 0.08], L: [0.119, 0.105], bend: -1, w: [0.033, 0.026, 0.023, 0.022], type: 'pad', fingers: 1, toe: 0.02, stride: -0.035, nails: '#3a3026' }, LP);
  S.L.done(gp);
};

/** Tree stump with bark grooves and a ringed top. */
function stump(p: THREE.Object3D, x: number, y: number, z: number, r: number, h: number): void {
  loft(p, [{ p: [x, y - 0.01, z], w: r * 1.3 }, { p: [x, y + h * 0.3, z], w: r * 1.05 }, { p: [x, y + h, z], w: r }], (xx, yy, zz, nx, ny, nz) => {
    if (ny > 0.9) return mx('#c9a679', '#8a6440', sst(0.5, 1, Math.cos(Math.hypot(xx - x, zz - z) * 260)) * 0.5);
    return sh('#5e4430', 0.8 + 0.35 * sst(0.4, 0.8, vnoise(Math.atan2(nz, nx) * 6, yy * 30, 1)));
  }, { nu: 6, nv: 16 });
}

/** Microraptor: crow-sized four-winged glider, glossy black with a blue sheen, swooping off a stump on a slim stand. */
const microraptor: Builder = gp => {
  const S = forestFloor(gp, 41, {
    ferns: [[-0.3, 0.24, 0.12], [0.3, 0.28, 0.1], [0.32, -0.25, 0.11], [-0.28, -0.3, 0.1]], tree: [[0.34, -0.02, 0.2]],
    rocks: [[-0.4, 0.02, 0.035], [0.1, 0.4, 0.03]], horse: [[-0.12, 0.38, 0.1]],
  });
  const sx0 = -0.06, sz0 = -0.12, sy0 = S.H(sx0, sz0);
  stump(gp, sx0, sy0, sz0, 0.055, 0.12);
  const d = new THREE.Group(); gp.add(d); d.position.set(0.02, -0.03, 0.06); d.rotation.set(0.12, 0.35, -0.12); d.scale.setScalar(1.18);
  // Display stand from the stump top to the belly
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), mat('#3a2c22', { flat: false }));
  const tw = new THREE.Vector3(0, 0.285, -0.01).applyMatrix4(new THREE.Matrix4().compose(d.position, d.quaternion, d.scale));
  const bot = new THREE.Vector3(sx0, sy0 + 0.118, sz0), mid = bot.clone().add(tw).multiplyScalar(0.5);
  stand.position.copy(mid); stand.scale.y = tw.distanceTo(bot); stand.quaternion.setFromUnitVectors(_Y, tw.clone().sub(bot).normalize()); gp.add(stand);
  const blk = '#121419', blu = '#2d5a92';
  const P: BP = (x, y, z, _nx, ny) => sh(mx(mx(blk, '#1c2230', sst(-0.5, 0.2, ny)), blu, sst(0.55, 0.95, ny) * (0.45 + 0.4 * Math.sin(x * 120 + z * 90))), 1 + (vnoise(x * 90, y * 90, z * 90) - 0.5) * 0.25);
  const st: St[] = [
    { p: [0, 0.29, -0.3], w: 0.003 }, { p: [0, 0.295, -0.2], w: 0.005, h: 0.005 }, { p: [0, 0.3, -0.1], w: 0.009, h: 0.01 },
    { p: [0, 0.3, -0.03], w: 0.022, h: 0.024 }, { p: [0, 0.302, 0.04], w: 0.024, h: 0.026 }, { p: [0, 0.312, 0.085], w: 0.012, h: 0.013 },
    { p: [0, 0.318, 0.105], w: 0.014, h: 0.015 }, { p: [0, 0.314, 0.13], w: 0.009, h: 0.009 }, { p: [0, 0.312, 0.145], w: 0.003, h: 0.003 },
  ];
  const B = loft(d, st, P, { nu: 60, nv: 16 });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.78, sx > 0 ? 0.45 : Math.PI - 0.45, 0.95), [sx, 0.2, 0.4], 0.0042, '#c9a227');
    for (let i = 0; i < 3; i++) { const b = B.at(0.84 + i * 0.04, sx > 0 ? -0.5 : Math.PI + 0.5, 0.98); tooth(d, b, [b[0], b[1] - 0.004, b[2]], 0.0012); }
  }
  const F = new Leaves();
  const fc = (i: number, t: number) => (i % 4 === 0 ? '#1f3a66' : t > 0.6 && i % 2 ? '#2b4f86' : i % 3 === 0 ? '#0f1014' : '#171a22');
  for (const sx of [-1, 1]) {
    const s0: V3 = [sx * 0.018, 0.305, 0.05], e0: V3 = [sx * 0.07, 0.315, 0.035], w0: V3 = [sx * 0.13, 0.312, 0.05], h0: V3 = [sx * 0.17, 0.31, 0.055];
    loft(d, [{ p: s0, w: 0.009 }, { p: e0, w: 0.006 }, { p: w0, w: 0.004 }, { p: h0, w: 0.002 }], P, { nu: 12, nv: 7, side: [0, 0, 1] });
    feathers(F, s0, e0, t => nrm([sx * 0.1, -0.02, -1]), 6, t => 0.035 + t * 0.012, 0.024, fc);
    feathers(F, e0, h0, t => nrm([sx * (0.15 + t * 0.6), -0.02, -1]), 11, t => 0.05 + t * 0.035, 0.022, fc);
    // Hind-limb wings
    const hp: V3 = [sx * 0.02, 0.295, -0.03], kn: V3 = [sx * 0.05, 0.29, -0.06], an: V3 = [sx * 0.07, 0.286, -0.105], ft: V3 = [sx * 0.075, 0.284, -0.13];
    loft(d, [{ p: hp, w: 0.011 }, { p: kn, w: 0.007 }, { p: an, w: 0.004 }, { p: ft, w: 0.003 }], P, { nu: 12, nv: 7 });
    for (let k = -1; k <= 1; k++) claw(d, '#0c0c0e', ft, [ft[0] + k * 0.005, ft[1] - 0.004, ft[2] - 0.016], 0.0018, [0, 1, 0]);
    feathers(F, kn, an, t => nrm([sx * 0.8, -0.03, -0.6 - t * 0.3]), 7, t => 0.04 + t * 0.012, 0.02, fc);
    // Tail-tip diamond fan
    feathers(F, B.at(0.0, 0, 0), B.at(0.12, 0, 0), t => nrm([sx * 0.8, 0, -0.7 + t * 0.5]), 5, t => 0.03 - t * 0.012, 0.018, fc);
  }
  feathers(F, B.at(0.7, Math.PI / 2, 0.9), B.at(0.8, Math.PI / 2, 0.9), () => nrm([0, 0.5, -1]), 4, () => 0.012, 0.01, fc);
  F.done(d);
  S.L.done(gp);
};

/** Iguanodon: bulky beaked plant-eater on all fours, nibbling a fern; famous thumb spikes; Bernissart swamp. */
const iguanodon: Builder = gp => {
  const S = forestFloor(gp, 43, {
    top: '#617a3a', ferns: [[0.06, 0.36, 0.13], [-0.3, 0.24, 0.1], [0.34, -0.22, 0.1]], tree: [[0.32, 0.12, 0.22]],
    rocks: [[-0.4, -0.06, 0.035], [0.12, -0.4, 0.03]], horse: [[-0.24, -0.34, 0.12], [-0.4, 0.16, 0.1]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d); d.rotation.y = 0.1;
  const H: Hide = {
    top: '#4b3946', side: '#80654f', belly: '#ddcfb2', patC: '#3c2c38', scales: 120, grain: 0.14,
    pat: (x, y, z, _u, s) => sst(0.58, 0.82, fbm(x * 26, y * 26, z * 26, 2)) * sst(-0.3, 0.3, s) * 0.7,
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0.08, 0.21, -0.47], w: 0.005 }, { p: [0.05, 0.225, -0.38], w: 0.013, h: 0.024 }, { p: [0.02, 0.24, -0.27], w: 0.03, h: 0.046 },
    { p: [0, 0.255, -0.13], w: 0.058, h: 0.075 }, { p: [0, 0.24, -0.02], w: 0.066, h: 0.08 }, { p: [0, 0.21, 0.07], w: 0.052, h: 0.064 },
    { p: [0, 0.205, 0.13], w: 0.034, h: 0.04 }, { p: [0, 0.215, 0.17], w: 0.026, h: 0.03 }, { p: [0, 0.22, 0.195], w: 0.022, h: 0.028 },
    { p: [0, 0.208, 0.235], w: 0.019, h: 0.026 }, { p: [0, 0.192, 0.27], w: 0.015, h: 0.018 }, { p: [0, 0.184, 0.29], w: 0.011, h: 0.012 },
    { p: [0, 0.182, 0.298], w: 0.005, h: 0.005 },
  ];
  const B = loft(d, st, (x, y, z, nx, ny, nz, u, a) => (u > 0.94 ? '#3a3028' : P(x, y, z, nx, ny, nz, u, a)), { nu: 96, nv: 20, shape: (u, a) => (Math.sin(a) < 0 && u < 0.6 ? 1 - 0.1 * -Math.sin(a) : 1) });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.74, sx > 0 ? 0.45 : Math.PI - 0.45, 0.94), [sx, 0.2, 0.3], 0.0055, '#5a3414');
    const n = B.at(0.92, sx > 0 ? 0.7 : Math.PI - 0.7, 0.96); el(d, '#2a2018', n[0], n[1], n[2], 0.003, 0.002, 0.005);
  }
  const LP = limbHide(H);
  legPair(d, { hip: [0.045, 0.25, -0.12], foot: [0.07, 0, -0.1], L: [0.13, 0.11], bend: 1, meta: 0.045, tilt: 0.3, w: [0.054, 0.03, 0.02, 0.018], type: 'hoof', fingers: 3, toe: 0.03, stride: 0.04, lift: 0.01, muscle: 1.35, nails: '#3a3026' }, LP);
  legPair(d, { hip: [0.045, 0.19, 0.07], foot: [0.065, 0, 0.12], L: [0.105, 0.09], bend: -1, w: [0.03, 0.021, 0.016, 0.015], type: 'hoof', fingers: 3, spread: 0.3, toe: 0.018, stride: -0.03, nails: '#3a3026' }, LP);
  // Thumb spikes pointing up and in from each wrist
  for (const sx of [-1, 1]) {
    const s = -0.03 * sx, w0: V3 = [sx * 0.065 - sx * 0.012, 0.035, 0.12 + s];
    horn(d, w0, [w0[0] - sx * 0.012, w0[1] + 0.03, w0[2] + 0.01], 0.006, H.side, '#efe3c4');
  }
  S.L.done(gp);
};

/** Archaeopteryx: feathered bird-dinosaur perched on a limestone block in the Solnhofen lagoon, wings half open, long bony tail. */
const archaeopteryx: Builder = gp => {
  const wl = 0.05;
  const S = forestFloor(gp, 47, {
    top: '#cfc59d', moss: '#7f8a45', soil: '#b9ab86', wl, strata: ['#e3dcc6', '#cfc6ab', '#ece6d3', '#bdb397'],
    hf: (x, z) => 0.034 * sst(0.38, 0.12, Math.hypot(x * 1.1, z)) - 0.022 + 0.004 * vnoise(x * 14, 3, z * 14),
    ferns: [[0.18, 0.15, 0.08], [-0.2, -0.12, 0.08]], cycads: [[-0.16, 0.14, 0.13]],
  });
  water(gp, wl, [[0.3, 0.25], [-0.32, -0.2]]);
  // Layered Solnhofen limestone block as the perch
  const ry = S.H(0.03, -0.02);
  for (let k = 0; k < 3; k++) el(gp, ['#e2d9bf', '#d4caad', '#ebe4cf'][k], 0.03 + k * 0.004, ry + 0.012 + k * 0.022, -0.02, 0.1 - k * 0.012, 0.012, 0.075 - k * 0.008, 0.3 + k * 0.1);
  const d = new THREE.Group(); d.position.set(0.03, ry + 0.066, -0.01); d.scale.setScalar(1.7); d.rotation.y = 0.35; gp.add(d);
  const H: Hide = {
    top: '#3a2c22', side: '#7a5a3c', belly: '#d9c7a4', patC: '#2a1e17', grain: 0.24,
    pat: (_x, _y, z, _u, s) => sst(0.5, 0.9, Math.sin(z * 260)) * sst(0, 0.6, s) * 0.5,
  };
  const P = hide(H);
  const st: St[] = [
    { p: [0, 0.045, -0.2], w: 0.004 }, { p: [0, 0.055, -0.13], w: 0.006, h: 0.006 }, { p: [0, 0.065, -0.06], w: 0.011, h: 0.013 },
    { p: [0, 0.075, -0.02], w: 0.022, h: 0.026 }, { p: [0, 0.085, 0.025], w: 0.024, h: 0.03 }, { p: [0, 0.108, 0.05], w: 0.013, h: 0.015 },
    { p: [0, 0.128, 0.062], w: 0.012, h: 0.013 }, { p: [0, 0.138, 0.078], w: 0.014, h: 0.014 }, { p: [0, 0.135, 0.098], w: 0.008, h: 0.009 },
    { p: [0, 0.131, 0.115], w: 0.003, h: 0.003 },
  ];
  const B = loft(d, st, P, { nu: 64, nv: 16 });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.83, sx > 0 ? 0.4 : Math.PI - 0.4, 0.92), [sx, 0.2, 0.3], 0.0035, '#d8a52a');
    for (let i = 0; i < 3; i++) { const b = B.at(0.88 + i * 0.03, sx > 0 ? -0.5 : Math.PI + 0.5, 0.98); tooth(d, b, [b[0], b[1] - 0.003, b[2]], 0.001); }
  }
  const F = new Leaves();
  const fc = (i: number, t: number) => (t > 0.7 && i % 2 ? '#1a1310' : i % 3 === 0 ? '#5a4030' : i % 3 === 1 ? '#3b2a20' : '#2a1d16');
  for (const sx of [-1, 1]) {
    // Tail feather pairs along the bony tail
    feathers(F, B.at(0.0, 0, 0), B.at(0.3, 0, 0), t => nrm([sx * 0.7, 0.02, -0.5 - t * 0.2]), 11, t => 0.03 - t * 0.008, 0.017, (i) => (i % 2 ? '#3b2a20' : '#5a4030'));
    // Half-open wings
    const s0: V3 = [sx * 0.02, 0.095, 0.03], e0: V3 = [sx * 0.055, 0.112, 0.0], w0: V3 = [sx * 0.095, 0.128, 0.03], h0: V3 = [sx * 0.105, 0.13, 0.05];
    loft(d, [{ p: s0, w: 0.008 }, { p: e0, w: 0.005 }, { p: w0, w: 0.003 }], () => '#3b2a20', { nu: 10, nv: 7, side: [0, 0, 1] });
    for (let k = 0; k < 3; k++) claw(d, '#1a1310', [w0[0], w0[1] + k * 0.003, w0[2]], [h0[0] + sx * 0.004, h0[1] + k * 0.004, h0[2] + 0.006], 0.0016, [0, 1, 0]);
    feathers(F, s0, e0, () => nrm([sx * 0.15, -0.35, -1]), 5, () => 0.035, 0.018, fc);
    feathers(F, e0, w0, t => nrm([sx * (0.2 + t * 0.6), -0.3, -1 + t * 0.3]), 9, t => 0.045 + t * 0.02, 0.017, fc);
  }
  F.done(d);
  legPair(d, { hip: [0.018, 0.072, -0.01], foot: [0.022, 0, 0.012], L: [0.042, 0.038], bend: 1, meta: 0.024, tilt: 0.3, w: [0.013, 0.007, 0.0045, 0.004], type: 'bird', toe: 0.016, nails: '#1a1310', muscle: 1.2 }, (x, y, z, nx, ny, nz) => (y > 0.05 ? P(x, y, z, nx, ny, nz, 0.4, 1) : '#4a3a2c'));
  S.L.done(gp);
};

/** Open two-sided grid (wing membranes, flippers): f(u, v) for u, v ∈ [0, 1]; both faces get their own normals. */
function sheet(p: THREE.Object3D, nu: number, nv: number, f: (u: number, v: number) => V3, paint: (x: number, y: number, z: number, u: number, v: number) => string): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = [], n = (nu + 1) * (nv + 1);
  for (let side = 0; side < 2; side++) for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const P = f(i / nu, j / nv), c = vc(paint(P[0], P[1], P[2], i / nu, j / nv));
    pos.push(...P); col.push(c.r, c.g, c.b);
  }
  for (let side = 0; side < 2; side++) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const o = side * n, a = o + i * (nv + 1) + j, b = a + 1, c2 = a + nv + 1, d = c2 + 1;
    if (side) idx.push(a, b, c2, b, d, c2); else idx.push(a, c2, b, b, c2, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return add(p, geo, VCM(), 0, 0, 0, 1, 1, 1);
}

/** Pteranodon: toothless long beak and swept-back crest, soaring on huge membrane wings above a chalk sea cliff. */
const pteranodon: Builder = gp => {
  const wl = 0.05;
  const S = forestFloor(gp, 53, {
    top: '#e6dfc6', moss: '#a8ad6e', soil: '#d8cfb3', wl, strata: ['#ece6d4', '#d9d1bb', '#f4efe0', '#c9bfa6', '#e0d8c2'],
    hf: (x, z) => 0.13 * sst(-0.02, 0.06, x + 0.06 * Math.sin(z * 9)) - 0.03 + 0.005 * vnoise(x * 16, 1, z * 16),
    rocks: [[0.22, 0.32, 0.03], [0.36, -0.18, 0.025], [-0.25, -0.15, 0.03]],
  });
  water(gp, wl, [[-0.2, 0.25], [-0.3, -0.05]]);
  // Fish leaping near the cliff
  drop(gp, '#b9c3c4', [-0.22, wl + 0.01, 0.12], [-0.19, wl + 0.035, 0.14], 0.007, 0.005, [0, 1, 0]);
  const d = new THREE.Group(); gp.add(d); d.position.set(-0.04, 0.33, 0.0); d.rotation.set(0.15, 1.2, -0.1);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), mat('#3a2c22', { flat: false }));
  const tw = new THREE.Vector3(0, -0.012, -0.01).applyMatrix4(new THREE.Matrix4().compose(d.position, d.quaternion, d.scale));
  const bot = new THREE.Vector3(0.18, S.H(0.18, -0.05) - 0.005, -0.05);
  stand.position.copy(bot.clone().add(tw).multiplyScalar(0.5)); stand.scale.y = tw.distanceTo(bot); stand.quaternion.setFromUnitVectors(_Y, tw.clone().sub(bot).normalize()); gp.add(stand);
  const body: BP = (x, y, z, _nx, ny) => sh(mx('#d8d4c8', '#5b4a3c', sst(-0.1, 0.8, ny) * 0.55), 1 + (vnoise(x * 90, y * 90, z * 90) - 0.5) * 0.12);
  const B = loft(d, [
    { p: [0, 0.0, -0.075], w: 0.004 }, { p: [0, 0.0, -0.05], w: 0.011, h: 0.01 }, { p: [0, 0.002, -0.0], w: 0.018, h: 0.017 }, { p: [0, 0.006, 0.04], w: 0.014, h: 0.014 },
    { p: [0, 0.016, 0.075], w: 0.008, h: 0.009 }, { p: [0, 0.03, 0.1], w: 0.011, h: 0.013 },
  ], body, { nu: 30, nv: 14 });
  void B;
  // Beak and crest form one long blade through the head
  const hd: V3 = [0, 0.03, 0.105];
  loft(d, [{ p: [0, 0.031, 0.1], w: 0.01, h: 0.012 }, { p: [0, 0.026, 0.13], w: 0.006, h: 0.009 }, { p: [0, 0.018, 0.18], w: 0.003, h: 0.005 }, { p: [0, 0.012, 0.215], w: 0.0008, h: 0.001 }],
    (_x, _y, z) => mx('#d9b65c', '#7a5a2c', sst(0.17, 0.215, z)), { nu: 16, nv: 9 });
  vslab(d, [[0, 0], [0.04, 0.012], [0.085, 0.03], [0.1, 0.036], [0.08, 0.022], [0.02, -0.004]], 0.004, (_x, _y, _z, lx) => mx('#d0482a', '#7a2618', sst(0.03, 0.1, lx)), [0, hd[1] + 0.005, hd[2] + 0.005], [0, Math.PI / 2, 0], 0.0015);
  for (const sx of [-1, 1]) eye(d, [sx * 0.008, 0.035, 0.108], [sx, 0.2, 0.3], 0.003, '#c98a1c');
  // Wings: leading-edge arm + membrane to the ankle, wrist finger out to the tip
  for (const sx of [-1, 1]) {
    const lead = new THREE.CatmullRomCurve3([[sx * 0.014, 0.006, 0.02], [sx * 0.08, 0.025, 0.04], [sx * 0.15, 0.03, 0.035], [sx * 0.28, 0.02, 0.0], [sx * 0.4, -0.01, -0.06]].map(v => new THREE.Vector3(...(v as V3))));
    const trail = new THREE.CatmullRomCurve3([[sx * 0.012, 0.0, -0.05], [sx * 0.06, 0.004, -0.07], [sx * 0.16, 0.012, -0.05], [sx * 0.28, 0.008, -0.04], [sx * 0.4, -0.01, -0.06]].map(v => new THREE.Vector3(...(v as V3))));
    sheet(d, 18, 5, (u, v) => {
      const a = lead.getPoint(u), b = trail.getPoint(u), p = a.lerp(b, v);
      return [p.x, p.y - 0.008 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u), p.z];
    }, (x, _y, z, u, v) => sh(mx(mx('#7a4e34', '#a8714a', v * 0.6), '#4a2e20', sst(0.85, 1, u) * 0.5), 0.92 + 0.12 * vnoise(x * 60, 1, z * 60) - 0.08 * sst(0.7, 1, Math.cos(u * 60))));
    loft(d, Array.from({ length: 6 }, (_, i) => { const P = lead.getPoint(i / 5); return { p: [P.x, P.y + 0.001, P.z] as V3, w: 0.007 * (1 - i / 6) + 0.0015 }; }), body, { nu: 20, nv: 7, side: [0, 0, 1] });
    for (let k = 0; k < 3; k++) { const w0 = lead.getPoint(0.36); claw(d, '#2a221b', [w0.x, w0.y, w0.z], [w0.x + sx * 0.004, w0.y - 0.004, w0.z + 0.014 + k * 0.002], 0.0015, [0, 1, 0]); }
    loft(d, [{ p: [sx * 0.01, -0.002, -0.04], w: 0.005 }, { p: [sx * 0.03, -0.006, -0.065], w: 0.003 }, { p: [sx * 0.04, -0.008, -0.08], w: 0.002 }], body, { nu: 8, nv: 6 });
  }
  S.L.done(gp);
};

/** Ammonite: coiled shell (tapering spiral tube) lying on a rock. */
function ammonite(p: THREE.Object3D, x: number, y: number, z: number, r: number, rot: V3): void {
  const g0 = new THREE.Group(); g0.position.set(x, y, z); g0.rotation.set(...rot); p.add(g0);
  const st: St[] = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18, a = t * Math.PI * 5, rr = r * Math.pow(0.32, 1 - t); st.push({ p: [Math.cos(a) * rr, 0, Math.sin(a) * rr], w: rr * 0.42 + 0.0005, h: rr * 0.42 + 0.0005 }); }
  loft(g0, st, (xx, yy, zz) => mx('#b89a6c', '#7a5a3a', sst(0.6, 1, Math.cos(Math.atan2(zz, xx) * 14 + yy * 300))), { nu: 54, nv: 8, side: [0, 1, 0] });
}

/** Plesiosaurus: swimming at the surface with its long neck stretched out level ahead, four hydrofoil flippers, short tail; Lyme Regis sea. */
const plesiosaurus: Builder = gp => {
  const wl = 0.06;
  ground(gp, { top: '#5e6a6e', moss: '#4e5a5c', soil: '#6a6458', wl, y0: 0.035, strata: ['#5b6166', '#6f757a', '#4d5358', '#80868a'] });
  water(gp, wl, [[0.02, 0.0], [0.1, 0.33], [-0.04, -0.2]], 0.479, '#2b6a84', '#5fa6b4', 0.5);
  // Blue lias ledge with ammonites at the back
  for (let k = 0; k < 4; k++) el(gp, ['#5b6166', '#7d8387', '#4d5358', '#8a8a7c'][k], -0.29 + k * 0.01, wl - 0.005 + k * 0.016, -0.24 + k * 0.008, 0.13 - k * 0.02, 0.012, 0.09 - k * 0.012, 0.6 + k * 0.08);
  ammonite(gp, -0.26, wl + 0.06, -0.22, 0.026, [0.1, 0.4, 0.15]);
  ammonite(gp, -0.36, wl + 0.03, -0.16, 0.016, [0.2, 1.2, 0.1]);
  const d = new THREE.Group(); gp.add(d); d.position.set(0.04, wl, 0.0); d.rotation.y = 0.3;
  const H: Hide = {
    top: '#34485a', side: '#6d8796', belly: '#dfe0d2', patC: '#22303c', scales: 0, grain: 0.12,
    pat: (x, y, z, _u, s) => { const [f1] = worley(x * 30, y * 30, z * 30); return sst(0.25, 0.12, f1) * sst(-0.1, 0.5, s) * 0.6; },
  };
  const P = hide(H);
  // Broad flat turtle-like trunk riding at the surface, short tail, and a long neck held level just above the water
  const st: St[] = [
    { p: [0, -0.012, -0.3], w: 0.003 }, { p: [0, -0.008, -0.255], w: 0.01, h: 0.009 }, { p: [0, -0.004, -0.19], w: 0.024, h: 0.019 },
    { p: [0, -0.001, -0.115], w: 0.05, h: 0.03 }, { p: [0, 0.0, -0.03], w: 0.064, h: 0.036 }, { p: [0, 0.0, 0.05], w: 0.058, h: 0.034 },
    { p: [0, 0.004, 0.11], w: 0.032, h: 0.024 }, { p: [0.012, 0.011, 0.17], w: 0.019, h: 0.018 }, { p: [-0.01, 0.016, 0.23], w: 0.015, h: 0.015 },
    { p: [0.006, 0.02, 0.29], w: 0.012, h: 0.012 }, { p: [0, 0.023, 0.335], w: 0.011, h: 0.011 }, { p: [0, 0.025, 0.355], w: 0.013, h: 0.011 },
    { p: [0, 0.022, 0.38], w: 0.009, h: 0.007 }, { p: [0, 0.019, 0.402], w: 0.005, h: 0.004 }, { p: [0, 0.018, 0.41], w: 0.0015, h: 0.0015 },
  ];
  const B = loft(d, st, (x, y, z, nx, ny, nz, u, a) => (u > 0.8 && Math.abs(Math.sin(a) + 0.3) < 0.08 ? '#2a1e1e' : P(x, y, z, nx, ny, nz, u, a)),
    { nu: 112, nv: 18, shape: (u, a) => (u < 0.45 && Math.sin(a) < 0 ? 1 - 0.12 * -Math.sin(a) : 1) });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.8, sx > 0 ? 0.55 : Math.PI - 0.55, 0.92), [sx, 0.35, 0.3], 0.0034, '#2a2a20');
    const n = B.at(0.88, sx > 0 ? 1.0 : Math.PI - 1.0, 0.95); el(d, '#1e2226', n[0], n[1], n[2], 0.0016, 0.001, 0.0022);
    // Interlocking needle teeth jutting out of the slim jaws (fish-trap)
    for (let i = 0; i < 5; i++) { const b = B.at(0.82 + i * 0.03, sx > 0 ? -0.3 : Math.PI + 0.3, 0.95); tooth(d, b, [b[0] + sx * 0.003, b[1] - 0.004, b[2] + 0.003], 0.0009); }
  }
  // Four long, narrow hydrofoil flippers (chord along z, thin along y) swept back, just under the surface
  const FP: BP = (x, y, z, _nx, ny) => sh(mx(mx(H.belly, H.side, 0.4), mx(H.top, H.side, 0.5), sst(-0.2, 0.6, ny) * 0.8), 0.95 + vnoise(x * 90, y * 90, z * 90) * 0.1);
  const flipper = (root: V3, tip: V3, chord: number, lift: number) => {
    const st2: St[] = [0, 0.18, 0.4, 0.62, 0.82, 1].map(t => {
      const q = lerp3(root, tip, t), bow = Math.sin(t * Math.PI) * 0.18 * Math.hypot(tip[0] - root[0], tip[2] - root[2]);
      const ch = chord * (t < 0.3 ? 0.75 + t : 1.05 - Math.pow((t - 0.3) / 0.7, 1.6) * 0.95);
      return { p: [q[0], q[1] + lift * Math.sin(t * Math.PI), q[2] + bow] as V3, w: ch, h: Math.max(0.0012, 0.0045 * (1 - t * 0.8)) };
    });
    loft(d, st2, FP, { nu: 24, nv: 10, side: [0, 0, 1] });
  };
  for (const sx of [-1, 1]) {
    flipper([sx * 0.05, -0.008, 0.055], [sx * 0.2, sx > 0 ? 0.012 : -0.016, -0.045], 0.024, sx > 0 ? 0.004 : -0.002);
    flipper([sx * 0.044, -0.01, -0.12], [sx * 0.165, -0.012, -0.215], 0.021, -0.002);
  }
  // Small fish scattering ahead of the jaws
  for (const [x, y, z, yw] of [[-0.05, -0.014, 0.4, 0.6], [-0.075, -0.02, 0.37, 0.9], [-0.04, -0.024, 0.44, 0.4], [0.07, -0.018, 0.42, -0.5]] as const)
    drop(d, '#b9c6c8', [x, y, z], [x + Math.sin(yw) * 0.018, y, z + Math.cos(yw) * 0.018], 0.0035, 0.0022, [0, 1, 0]);
  // Wake rings around the neck base and trailing behind the body
  d.updateMatrix();
  const w = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(d.matrix);
  for (const [x, z, r] of [[0, 0.11, 0.022], [0, -0.06, 0.075], [0, 0.3, 0.012]] as const) { const v = w(x, z); ripples(gp, v.x, wl, v.z, r); }
};

/** Muttaburrasaurus: bulky Australian iguanodontian walking on all fours, toothless beak and big hollow nasal bulge; Queensland red soil and cycads. */
const muttaburrasaurus: Builder = gp => {
  const S = forestFloor(gp, 59, {
    top: '#a8784a', moss: '#7d7d3a', soil: '#9a5a38', strata: ['#a85e3a', '#c27a4c', '#8f4f32', '#d39663', '#7a4630'],
    cycads: [[-0.32, -0.18, 0.2], [0.36, -0.1, 0.16]], ferns: [[-0.3, 0.26, 0.1], [0.32, -0.3, 0.1]], rocks: [[0.4, 0.12, 0.04], [-0.1, 0.4, 0.03], [-0.4, 0.06, 0.03]],
  });
  const d = new THREE.Group(); d.position.y = S.H(0, 0) - 0.002; gp.add(d); d.rotation.y = -0.15;
  const H: Hide = {
    top: '#4e5a3a', side: '#7a7a52', belly: '#d0c8a2', patC: '#3a4230', scales: 120, grain: 0.14,
    pat: (x, y, z, _u, s) => sst(0.55, 0.8, fbm(x * 22, y * 22, z * 22, 2)) * sst(-0.4, 0.2, s) * 0.7,
  };
  const P = hide(H);
  // Deep heavy trunk, hips above the shoulders, tail held straight out (stiffened by ossified tendons)
  const st: St[] = [
    { p: [0.04, 0.225, -0.47], w: 0.005 }, { p: [0.028, 0.237, -0.37], w: 0.014, h: 0.026 }, { p: [0.012, 0.25, -0.26], w: 0.032, h: 0.048 },
    { p: [0, 0.262, -0.13], w: 0.062, h: 0.08 }, { p: [0, 0.25, -0.02], w: 0.072, h: 0.086 }, { p: [0, 0.228, 0.07], w: 0.06, h: 0.072 },
    { p: [0, 0.216, 0.13], w: 0.036, h: 0.044 }, { p: [0, 0.222, 0.17], w: 0.027, h: 0.033 }, { p: [0, 0.226, 0.2], w: 0.025, h: 0.033 },
    { p: [0, 0.214, 0.235], w: 0.02, h: 0.028 }, { p: [0, 0.2, 0.268], w: 0.016, h: 0.022 }, { p: [0, 0.188, 0.293], w: 0.012, h: 0.014 },
    { p: [0, 0.183, 0.304], w: 0.005, h: 0.005 },
  ];
  // Broad rounded nasal bulge swelling up from the snout in front of the eyes
  const bulge = (u: number) => Math.exp(-Math.pow((u - 0.8) / 0.06, 2));
  const B = loft(d, st, (x, y, z, nx, ny, nz, u, a) => (u > 0.915 ? '#3a3026' : u > 0.7 && Math.abs(Math.sin(a) + 0.3) < 0.06 ? '#3a2c22' : P(x, y, z, nx, ny, nz, u, a)), {
    nu: 104, nv: 22,
    shape: (u, a) => { const s = Math.sin(a); return (s < 0 && u < 0.6 ? 1 - 0.1 * -s : 1) + 1.9 * bulge(u) * Math.pow(Math.max(0, s), 1.2); },
  });
  for (const sx of [-1, 1]) {
    eye(d, B.at(0.71, sx > 0 ? 0.5 : Math.PI - 0.5, 0.93), [sx, 0.2, 0.3], 0.0055, '#6a3a12');
    const n = B.at(0.86, sx > 0 ? 0.9 : Math.PI - 0.9, 0.97); el(d, '#2a2018', n[0], n[1], n[2], 0.0035, 0.0025, 0.007);
  }
  const LP = limbHide(H, '#3a3024');
  legPair(d, { hip: [0.048, 0.262, -0.12], foot: [0.072, 0, -0.1], L: [0.135, 0.115], bend: 1, meta: 0.045, tilt: 0.3, w: [0.056, 0.031, 0.021, 0.019], type: 'hoof', fingers: 3, toe: 0.032, stride: 0.04, lift: 0.01, muscle: 1.35, nails: '#3a3026' }, LP);
  // Long sturdy forelimbs carrying weight on hoof-like fingers
  legPair(d, { hip: [0.047, 0.205, 0.075], foot: [0.068, 0, 0.12], L: [0.112, 0.096], bend: -1, w: [0.032, 0.022, 0.017, 0.016], type: 'hoof', fingers: 3, spread: 0.3, toe: 0.019, stride: -0.03, nails: '#3a3026' }, LP);
  // Conical thumb spikes on the inner side of each wrist
  for (const sx of [-1, 1]) {
    const w0: V3 = [sx * 0.056, 0.036, 0.12 - 0.03 * sx + 0.004];
    horn(d, w0, [w0[0] - sx * 0.01, w0[1] + 0.022, w0[2] + 0.012], 0.0055, H.side, '#e6dcc0');
  }
  S.L.done(gp);
};

export const H_DINOS: Record<string, Builder> = {
  dn_pteranodon: pteranodon,
  dn_plesiosaurus: plesiosaurus,
  dn_muttaburrasaurus: muttaburrasaurus,
  dn_mamenchisaurus: mamenchisaurus,
  dn_microraptor: microraptor,
  dn_iguanodon: iguanodon,
  dn_archaeopteryx: archaeopteryx,
  dn_parasaurolophus: parasaurolophus,
  dn_velociraptor: velociraptor,
  dn_spinosaurus: spinosaurus,
  dn_argentinosaurus: argentinosaurus,
  dn_trex: trex,
  dn_triceratops: triceratops,
  dn_stegosaurus: stegosaurus,
  dn_ankylosaurus: ankylosaurus,
  dn_brachiosaurus: brachiosaurus,
};
