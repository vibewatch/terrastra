import * as THREE from 'three';
import type { Builder, Paint, V3 } from '../prims.ts';
import { add, mat, g, sweep as sweep0, vnoise, fbm, hash3, worley } from '../prims.ts';
import { type LS, type SpSt, VCM, barkP, leaf, lerp3, lit, mx, psurf, sh, speck, sst, vpaint } from '../kit/sculpt.ts';

// Wave-3 animal miniatures: organic lofted bodies (spine loft + painted ellipsoid masses), jointed limbs, glossy
// eyes and per-vertex painted coats, each on a compact habitat base (grass, forest floor, ice floe, water, branch).
// Front +z, base at y=0, the animal dominates a ~1-unit box.

/** Smooth painted ellipsoid in model space (own geometry, so paint patterns line up across parts). */
function blob(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, paint?: Paint, rot: V3 = [0, 0, 0], seg = 20): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
  geo.deleteAttribute('uv');
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), new THREE.Vector3(rx, ry, rz)));
  return vpaint(add(p, geo, VCM(), 0, 0, 0, 1, 1, 1), c, paint);
}
/** Light shared ellipsoid (eyes, toes, claws, pebbles). */
const ESEG = [[8, 6], [12, 8], [16, 11]];
function el(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, ry0 = 0, rx0 = 0, rz0 = 0): THREE.Mesh {
  const r = Math.max(rx, ry, rz), [a, b] = ESEG[r < 0.014 ? 0 : r < 0.035 ? 1 : 2];
  return add(p, g('a2-sph' + a, () => new THREE.SphereGeometry(1, a, b)), mat(c, { flat: false }), x, y, z, rx, ry, rz, ry0, rx0, rz0);
}
/** Smooth vertex-painted sweep through stations (limbs, necks, tails, beaks). */
function sw(p: THREE.Object3D, st: { p: V3; w: number; h?: number }[], c: string, paint?: Paint, o: { radial?: number; sub?: number; up?: V3; caps?: boolean } = {}): THREE.Mesh {
  const m = sweep0(p, st, c, { radial: o.radial ?? 12, sub: o.sub ?? 5, up: o.up, caps: o.caps, flat: false });
  return paint ? vpaint(m, c, paint) : m;
}
/** Limb loft through joint stations [point, lateral half-width, front-back half-depth]. */
const limb = (p: THREE.Object3D, c: string, st: LS[], paint?: Paint, radial = 12) =>
  sw(p, st.map(([pt, w, h]) => ({ p: pt, w, h: h ?? w })), c, paint, { radial, sub: 5, up: [0, 0, 1] });
/** Tube with ball ends. */
function tube(p: THREE.Object3D, pts: V3[], r0: number, r1: number, c: string, paint?: Paint, radial = 10): THREE.Mesh {
  const m = sw(p, pts.map((pt, i) => ({ p: pt, w: r0 + (r1 - r0) * (i / Math.max(1, pts.length - 1)) })), c, paint, { radial, sub: 4 });
  el(p, c, ...pts[pts.length - 1], r1 * 0.98);
  return m;
}
/** Body lofted along a spine with elliptical sections; `shape(u, a)` returns a radial multiplier (a = angle, π/2 = up). */
function spine(p: THREE.Object3D, st: SpSt[], c: string, paint?: Paint, o: { nu?: number; nv?: number; side?: V3; shape?: (u: number, a: number) => number } = {}): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(...s.p)), false, 'centripetal');
  const nu = o.nu ?? (st.length - 1) * 6, nv = o.nv ?? 24;
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
  }, c, paint);
}
const DROP = () => g('a2-drop', () => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(Math.max(1e-4, 0.5 * Math.sin(Math.PI * Math.pow(t, 0.62))), t)); }
  const lg = new THREE.LatheGeometry(pts, 7);
  lg.computeVertexNormals();
  return lg;
});
const _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
/** Teardrop from base a to pointed tip b (fur locks, claws, horns, teeth, quills). */
function drop(p: THREE.Object3D, c: string, a: V3, b: V3, r: number, rz = r): THREE.Mesh {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length() || 1e-4;
  const m = add(p, DROP(), mat(c, { flat: false }), a[0], a[1], a[2], r * 2, len, rz * 2);
  m.quaternion.setFromUnitVectors(_Y, _d.normalize());
  return m;
}
/** Flattened teardrop a→b whose flat face looks along `up` (feathers, leaves, grass blades, fur locks). */
function blade(p: THREE.Object3D, c: string, a: V3, b: V3, w: number, t: number, up: V3): THREE.Mesh {
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
function grp(p: THREE.Object3D, pos: V3, rot: V3 = [0, 0, 0], order: THREE.EulerOrder = 'YXZ'): THREE.Group {
  const gg = new THREE.Group();
  gg.position.set(pos[0], pos[1], pos[2]);
  gg.rotation.set(rot[0], rot[1], rot[2], order);
  p.add(gg);
  return gg;
}
/** Make every vertex-coloured mesh under `o` glossier (wet skin, shells). */
function gloss(o: THREE.Object3D, rough: number): void {
  const m = mat('#ffffff', { flat: false, vc: true, rough });
  o.traverse(k => { const me = k as THREE.Mesh; if (me.isMesh && (me.material as THREE.MeshStandardMaterial).vertexColors) me.material = m; });
}
/** Glossy eye: dark rim, iris, pupil, catch-light, optional lid; looks along local +z rotated by yaw. */
function eye(p: THREE.Object3D, x: number, y: number, z: number, r: number, yaw: number, iris: string, lid?: string, pupil = 0.5): void {
  const e = grp(p, [x, y, z], [0, yaw, 0]);
  el(e, '#17110d', 0, 0, -r * 0.05, r * 1.16, r * 1.04, r * 0.7);
  el(e, iris, 0, 0, r * 0.1, r, r * 0.95, r * 0.6);
  el(e, '#070707', 0, 0, r * 0.36, r * pupil, r * pupil * 1.1, r * 0.34);
  lit(el(e, '#ffffff', r * 0.34, r * 0.36, r * 0.6, r * 0.2));
  if (lid) el(e, lid, 0, r * 0.7, r * 0.02, r * 1.28, r * 0.5, r * 0.86, 0, -0.28);
}
/** Small glossy bead eye with a catch-light. */
function bead(p: THREE.Object3D, x: number, y: number, z: number, r: number, c = '#0d0b09'): void {
  el(p, c, x, y, z, r);
  lit(el(p, '#ffffff', x + r * 0.3, y + r * 0.35, z + r * 0.7, r * 0.26));
}
/** Cupped ear: outer shell + recessed inner (tip along local +y, opening toward +z). */
function ear(p: THREE.Object3D, pos: V3, rot: V3, w: number, h: number, outer: string, inner: string, pointed = false): THREE.Group {
  const e = grp(p, pos, rot, 'XYZ');
  if (pointed) {
    drop(e, outer, [0, -h * 0.05, 0], [0, h, 0], w, w * 0.45);
    drop(e, inner, [0, h * 0.08, w * 0.22], [0, h * 0.86, w * 0.26], w * 0.62, w * 0.18);
  } else {
    el(e, outer, 0, h * 0.5, 0, w, h * 0.55, w * 0.42);
    el(e, inner, 0, h * 0.44, w * 0.24, w * 0.64, h * 0.38, w * 0.2);
  }
  return e;
}
/** Fan of fur locks around a point. */
function tuft(p: THREE.Object3D, c: string, at: V3, dir: V3, len: number, r: number, n = 5, spread = 0.5, c2?: string): void {
  const dl = Math.hypot(...dir) || 1, d: V3 = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = i === 0 ? 0 : spread;
    const ox = Math.cos(a) * k, oy = Math.sin(a) * k * 0.8, oz = Math.sin(a + 1) * k * 0.5;
    const L = len * (i === 0 ? 1.1 : 0.8 + hash3(i, at[0] * 50, at[2] * 50) * 0.3);
    drop(p, c2 && i % 2 ? c2 : c, [at[0] + ox * r * 0.6, at[1] + oy * r * 0.6, at[2] + oz * r * 0.6],
      [at[0] + (d[0] + ox * 0.6) * L, at[1] + (d[1] + oy * 0.6) * L, at[2] + (d[2] + oz * 0.6) * L], r);
  }
}

// ---- Habitat bases ----
/** Soft-edged ground patch (flattened painted ellipsoid, top at y≈0). */
function ground(gp: THREE.Object3D, rx: number, rz: number, cols: [string, string, string], o: { seed?: number; cx?: number; cz?: number; paint?: Paint } = {}): THREE.Mesh {
  const [g0, g1, g2] = cols, sd = o.seed ?? 1;
  return blob(gp, g0, o.cx ?? 0, -0.026, o.cz ?? 0, rx, 0.03, rz, o.paint ?? ((x, y, z) => {
    let col = mx(g0, g1, sst(0.45, 0.8, vnoise(x * 9 + sd, 1, z * 9)) * 0.65);
    col = mx(col, g2, sst(0.58, 0.85, vnoise(x * 26, 2 + sd, z * 26)) * 0.55);
    return speck(col, x, y, z, 0.03);
  }), [0, 0, 0], 30);
}
/** Grass tuft of flat blades. */
function grass(gp: THREE.Object3D, x0: number, z0: number, cols: [string, string], tall = 1, n = 5, seed = 0, y0 = 0): void {
  for (let k = 0; k < n; k++) {
    const a = k * (Math.PI * 2 / n) + seed, l = (0.045 + hash3(k, seed, 6) * 0.04) * tall;
    blade(gp, mx(cols[0], cols[1], hash3(k, seed, 7)), [x0, y0, z0], [x0 + Math.cos(a) * l * 0.4, y0 + l, z0 + Math.sin(a) * l * 0.4], 0.008, 0.003, [-Math.sin(a), 0, Math.cos(a)]);
  }
}
/** Lumpy painted boulder. */
function rock(gp: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, moss?: string): THREE.Mesh {
  return blob(gp, c, x, y, z, sx, sy, sz, (px, py, pz, _nx, ny) => {
    let col = mx(c, sh(c, 0.7), sst(0.4, 0.8, vnoise(px * 30, py * 30, pz * 30)) * 0.7);
    col = mx(col, sh(c, 1.18), sst(0.55, 0.75, fbm(px * 60, py * 60, pz * 60, 2)) * 0.4);
    if (moss) col = mx(col, moss, sst(0.35, 0.8, ny) * sst(0.4, 0.6, vnoise(px * 14, 5, pz * 14)));
    return col;
  }, [0, yaw, 0], 16);
}
/** Water patch with ripple rings around `rings` centres (top at y≈0). */
function water(gp: THREE.Object3D, rx: number, rz: number, rings: [number, number, number][] = [], c = '#2f7fb8', cx = 0, cz = 0, y = -0.008): THREE.Mesh {
  return blob(gp, c, cx, y, cz, rx, 0.026, rz, (x, _y, z) => {
    const e = Math.hypot((x - cx) / rx, (z - cz) / rz);
    let col = mx(mx(c, sh(c, 0.7), sst(0.2, 1, e) * 0.5), mx(c, '#9fd4f0', 0.4), sst(0.5, 0.7, vnoise(x * 9, 3, z * 9)) * 0.35);
    col = mx(col, '#d6f0ff', sst(0.9, 0.98, Math.sin(x * 70 + Math.sin(z * 30) * 2)) * 0.35);
    for (const [rx0, rz0, cr] of rings) {
      const d = Math.hypot(x - rx0, z - rz0) / cr;
      if (d < 4) col = mx(col, '#cfeaff', Math.max(sst(1.1, 0.5, d) * 0.5, sst(0.7, 0.98, Math.sin(d * 7)) * 0.45 * (1 - d / 4)));
    }
    return col;
  }, [0, 0, 0], 36);
}
/** Broad tropical leaf with a midrib, lying from `at` along yaw, drooping. */
function bigLeaf(gp: THREE.Object3D, at: V3, yaw: number, len: number, wid: number, c: string, droop = 0.4, pitch = 0.3): void {
  const lg = grp(gp, at, [0, yaw, 0]);
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([0, Math.sin(pitch) * len * t - droop * len * t * t, Math.cos(pitch) * len * t]); }
  // Leaf blade as a thin flattened sweep (wide in x, thin in y)
  sw(lg, pts.map((pt, i) => ({ p: pt, w: wid * Math.sin(Math.PI * Math.min(1, (i / 6) * 0.94 + 0.04)) ** 0.8, h: 0.004 })), c,
    (x, _y, z) => (Math.abs(x) < wid * 0.06 ? mx(c, '#d8e6a0', 0.5) : mx(c, sh(c, 0.8), sst(0.3, 0.9, Math.abs(Math.sin(z / len * 9 - Math.abs(x) / wid * 3))) * 0.4)),
    { radial: 8, sub: 3 });
}

// ---- Shared limb pieces ----
/** Cloven hoof (two toes with a split) at ground level. */
function hoof(gp: THREE.Object3D, c: string, x: number, z: number, r: number): void {
  for (const k of [-1, 1]) blob(gp, c, x + k * r * 0.42, r * 0.62, z + r * 0.15, r * 0.5, r * 0.62, r * 0.95, (_x, y) => (y < r * 0.25 ? sh(c, 0.75) : null), [-0.2, 0, 0], 10);
}
/** Webbed / fingered hand of small round toes splayed around `dir`. */
function toes(gp: THREE.Object3D, c: string, at: V3, yaw: number, n: number, len: number, r: number, spread = 0.45, pad?: string, y = 0.006): void {
  for (let i = 0; i < n; i++) {
    const a = yaw + (i - (n - 1) / 2) * spread, tip: V3 = [at[0] + Math.sin(a) * len, y, at[2] + Math.cos(a) * len];
    tube(gp, [at, lerp3(at, tip, 0.55), tip], r, r * 0.8, c);
    if (pad) el(gp, pad, tip[0], y, tip[2], r * 1.5, r * 1.1, r * 1.5);
  }
}

// ---- Species ----
const INKD = '#14100d';

/** Okapi: chocolate velvet body sloping from high withers, zebra-striped haunches and legs, pale giraffe-like face. */
const okapi: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#4a2a22', dk = sh(c, 0.72), cream = '#ece4d8', white = '#f3efe8';
  // Rainforest floor: leaf litter, ferny tufts and broad leaves behind
  ground(gp, 0.42, 0.48, ['#4f4a2a', '#3a3a20', '#6e5232'], { seed: 3 });
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39, rr = 0.2 + hash3(i, 2, 5) * 0.2, x = Math.cos(a) * rr, z = Math.sin(a) * rr * 1.1;
    blade(gp, ['#8a5a2a', '#6b4a2a', '#a07a3a', '#5e6a32'][i % 4], [x, 0.006, z], [x + Math.cos(a * 3) * 0.05, 0.008, z + Math.sin(a * 3) * 0.05], 0.018, 0.003, [0, 1, 0]);
  }
  for (const [x, z, s] of [[-0.3, -0.28, 1.4], [0.32, -0.2, 1.2], [-0.33, 0.2, 0.9], [0.3, 0.3, 0.8]] as const) grass(gp, x, z, ['#6f9a3a', '#3f6a26'], s, 7, x * 10);
  for (const [x, z, yaw, l, c2] of [[-0.27, -0.3, 2.5, 0.2, '#3f7a34'], [-0.27, -0.3, 3.5, 0.17, '#4a8a3a'], [-0.27, -0.3, 1.4, 0.15, '#3a6e30'], [0.3, -0.25, -2.6, 0.19, '#3f7a34'], [0.3, -0.25, -1.4, 0.15, '#4f8e3c']] as const)
    bigLeaf(gp, [x, 0.0, z], yaw, l, 0.055, c2, 0.9, 0.95);
  rock(gp, '#6f6a5c', 0.28, 0.0, 0.2, 0.06, 0.035, 0.05, 0.4, '#5d7a3a');

  const stripe = (v: number, k: number) => sst(0.05, 0.3, Math.sin(v * k));
  const body: Paint = (x, y, z, nx, ny) => {
    let col = ny > 0.55 ? mx(c, sh(c, 1.12), sst(0.55, 0.95, ny) * 0.6) : ny < -0.4 ? mx(c, dk, 0.5) : c;
    // horizontal white stripes over the haunches, fading toward the spine
    if (z < -0.11) col = mx(col, white, stripe(y + Math.sin(z * 30) * 0.006, 150) * sst(-0.11, -0.17, z) * sst(0.54, 0.47, y) * sst(0.15, 0.5, Math.abs(nx)));
    return speck(col, x, y, z, 0.05);
  };
  spine(gp, [
    { p: [0, 0.5, -0.29], w: 0.035, h: 0.035 }, { p: [0, 0.49, -0.255], w: 0.075, h: 0.085 }, { p: [0, 0.48, -0.17], w: 0.09, h: 0.105 },
    { p: [0, 0.48, -0.05], w: 0.088, h: 0.105 }, { p: [0, 0.495, 0.07], w: 0.09, h: 0.112 }, { p: [0, 0.515, 0.17], w: 0.08, h: 0.11 },
    { p: [0, 0.54, 0.235], w: 0.055, h: 0.08 }, { p: [0, 0.56, 0.26], w: 0.03, h: 0.04 },
  ], c, body, { nv: 26 });
  // shoulder & haunch masses
  for (const sx of [-1, 1]) blob(gp, c, sx * 0.05, 0.47, -0.19, 0.055, 0.11, 0.085, body, [0.2, 0, 0], 16);
  // Legs: dark upper legs barred with white, white stockings with dark fetlock bands
  const legP = (front: boolean): Paint => (x, y, z, nx, ny, nz) => {
    const top = front ? 0.34 : 0.4;
    if (y >= top) return body(x, y, z, nx, ny, nz);
    let col = c;
    if (y < top) col = y > 0.2 ? mx(c, white, stripe(y + (front ? 0 : z * 0.2), front ? 170 : 140)) : white;
    if (y < 0.2 && y > 0.05 && front && z > 0.19) col = mx(col, '#6a4a3a', 0.6);
    if (y < 0.075 && y > 0.045) col = dk;
    return speck(col, x, y, z, 0.04);
  };
  const L = (sx: number, front: boolean, st: number) => {
    const x = sx * 0.055;
    if (front) limb(gp, c, [
      [[x * 0.8, 0.5, 0.16], 0.04, 0.055], [[x * 1.05, 0.41, 0.15], 0.034, 0.05], [[x * 1.05, 0.3, 0.16 + st * 0.3], 0.025, 0.031],
      [[x, 0.19, 0.17 + st * 0.6], 0.02, 0.023], [[x, 0.11, 0.168 + st], 0.014, 0.016], [[x, 0.05, 0.172 + st], 0.016, 0.019], [[x, 0.028, 0.185 + st], 0.018, 0.021],
    ], legP(true), 12);
    else limb(gp, c, [
      [[x, 0.53, -0.19], 0.05, 0.085], [[x * 1.15, 0.42, -0.15], 0.046, 0.075], [[x * 1.1, 0.33, -0.15 + st * 0.3], 0.03, 0.045],
      [[x, 0.24, -0.215 + st * 0.6], 0.021, 0.03], [[x, 0.14, -0.205 + st], 0.015, 0.017], [[x, 0.05, -0.195 + st], 0.016, 0.019], [[x, 0.028, -0.183 + st], 0.018, 0.021],
    ], legP(false), 12);
    hoof(gp, '#2a2420', x, (front ? 0.19 : -0.178) + st, 0.022);
  };
  L(-1, true, 0.03); L(1, true, -0.02); L(-1, false, -0.02); L(1, false, 0.03);
  // Thin tail with a dark tassel
  tube(gp, [[0, 0.5, -0.285], [0.005, 0.44, -0.31], [0.012, 0.36, -0.315]], 0.011, 0.008, c);
  tuft(gp, INKD, [0.012, 0.37, -0.315], [0.02, -1, -0.1], 0.06, 0.012, 5, 0.3);
  // Neck rising from the withers
  sw(gp, [
    { p: [0, 0.535, 0.17], w: 0.062, h: 0.08 }, { p: [0, 0.6, 0.235], w: 0.054, h: 0.072 }, { p: [0, 0.7, 0.29], w: 0.043, h: 0.056 }, { p: [0, 0.785, 0.325], w: 0.038, h: 0.048 },
  ], c, (x, y, z, _nx, ny) => speck(ny < -0.3 ? mx(c, '#5a3a30', 0.4) : c, x, y, z, 0.05), { radial: 16, sub: 5 });
  // Head: pale cheeks and throat, dark forehead and nose bridge, black muzzle tip, huge ears, short ossicones
  const h = grp(gp, [0, 0.8, 0.335], [0.75, 0.25, 0]);
  const face: Paint = (x, y, z, nx, ny) => {
    let col = cream;
    if (y > 0.018 + z * 0.08 || (ny > 0.55 && Math.abs(x) < 0.025)) col = mx('#5a3226', '#3a2420', sst(0.0, 0.1, z));
    if (z > 0.15) col = mx(col, '#2a1c18', sst(0.15, 0.17, z));
    if (z < -0.01) col = mx(col, c, sst(-0.01, -0.04, z));
    return speck(col, x, y, z * 0.5 + nx * 0.001, 0.04);
  };
  blob(h, cream, 0, 0.008, 0.015, 0.045, 0.048, 0.052, face, [0, 0, 0], 18);
  sw(h, [
    { p: [0, 0.008, 0.0], w: 0.042, h: 0.044 }, { p: [0, 0.0, 0.07], w: 0.034, h: 0.038 }, { p: [0, -0.012, 0.13], w: 0.027, h: 0.03 }, { p: [0, -0.02, 0.165], w: 0.028, h: 0.029 },
  ], cream, face, { radial: 16, sub: 5 });
  blob(h, '#2a1c18', 0, -0.026, 0.168, 0.027, 0.025, 0.02, undefined, [0, 0, 0], 12);
  for (const sx of [-1, 1]) {
    el(h, '#0e0a08', sx * 0.013, -0.02, 0.186, 0.005, 0.008, 0.004, 0, 0, sx * 0.4);
    eye(h, sx * 0.039, 0.016, 0.04, 0.011, sx * 1.05, '#2b1a10', '#4a2c22');
    const e = ear(h, [sx * 0.035, 0.04, -0.005], [-0.2, sx * 0.3, -sx * 1.05], 0.032, 0.085, '#4a2c22', '#d8c8b8', true);
    el(e, '#2a1a14', 0, 0.075, 0, 0.012, 0.02, 0.008);
    tube(h, [[sx * 0.016, 0.045, 0.0], [sx * 0.02, 0.07, -0.01]], 0.009, 0.007, '#4a2c22');
    el(h, '#1a1210', sx * 0.02, 0.073, -0.011, 0.0075);
  }
  el(h, '#2a1c18', 0, -0.042, 0.15, 0.022, 0.003, 0.012);
};

/** Capybara: barrel-bodied, blunt square snout, eyes and ears high on the head; resting on a riverbank with a bird. */
const capybara: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#9a6a42', dk = sh(c, 0.7);
  // Riverbank: muddy grass on one side, water lapping the other
  water(gp, 0.46, 0.46, [[0.3, 0.22, 0.05]], '#5f8a7a', 0, 0, -0.034);
  ground(gp, 0.4, 0.36, ['#7a6a3e', '#5e5a30', '#8a7a4a'], { seed: 7, cx: -0.08, cz: -0.06, paint: (x, y, z) => {
    const e = Math.hypot((x + 0.08) / 0.4, (z + 0.06) / 0.36);
    const grassy = sst(0.5, 0.3, vnoise(x * 8, 1, z * 8) * 0.6 + e * 0.5);
    let col = mx('#8a7458', '#6a9a3e', grassy * 0.85);
    col = mx(col, '#6e5c46', sst(0.75, 1.0, e) * 0.8);
    return speck(col, x, y, z, 0.05);
  } });
  for (const [x, z, s] of [[-0.36, -0.15, 1.3], [-0.28, -0.3, 1.1], [-0.05, -0.36, 1], [0.15, -0.3, 1.2], [-0.4, 0.08, 0.9]] as const) grass(gp, x, z, ['#7aa648', '#4f7a30'], s, 7, x * 9 + z);
  for (let i = 0; i < 4; i++) { const x = 0.24 + i * 0.04, z = 0.3 - i * 0.05; for (let k = 0; k < 3; k++) tube(gp, [[x + k * 0.01, -0.01, z], [x + k * 0.012 + 0.01, 0.12 + k * 0.03, z - 0.01]], 0.004, 0.003, '#7a9a4a'); }
  const coat: Paint = (x, y, z, _nx, ny) => {
    const s = fbm(x * 60, y * 60, z * 60, 2);
    let col = ny < -0.3 ? mx(c, '#b48a5e', sst(-0.3, -0.8, ny) * 0.5) : ny > 0.5 ? mx(c, dk, sst(0.5, 1, ny) * 0.35) : c;
    col = mx(col, s > 0.5 ? sh(col, 1.1) : sh(col, 0.88), Math.min(0.6, Math.abs(s - 0.5) * 2));
    col = speck(col, x * 3, y * 3, z * 3, 0.05);
    return col;
  };
  const cg = grp(gp, [-0.04, 0, 0.02], [0, 0.95, 0]);
  cg.scale.setScalar(1.1);
  // Sitting like the classic riverbank pose: heavy rump down, chest up on straight front legs
  spine(cg, [
    { p: [0, 0.1, -0.26], w: 0.04, h: 0.04 }, { p: [0, 0.12, -0.235], w: 0.1, h: 0.1 }, { p: [0, 0.145, -0.16], w: 0.14, h: 0.135 },
    { p: [0, 0.18, -0.06], w: 0.135, h: 0.13 }, { p: [0, 0.215, 0.02], w: 0.115, h: 0.115 }, { p: [0, 0.25, 0.07], w: 0.09, h: 0.095 },
    { p: [0, 0.28, 0.1], w: 0.068, h: 0.072 }, { p: [0, 0.295, 0.115], w: 0.04, h: 0.04 },
  ], c, coat, { nv: 26 });
  for (const sx of [-1, 1]) {
    // haunch and folded hind leg with the foot flat beside the body
    blob(cg, c, sx * 0.09, 0.1, -0.15, 0.065, 0.09, 0.115, coat, [0.15, 0, 0], 16);
    limb(cg, c, [[[sx * 0.11, 0.05, -0.12], 0.025, 0.03], [[sx * 0.12, 0.022, -0.06], 0.02, 0.022], [[sx * 0.12, 0.016, -0.02], 0.02, 0.02]], coat, 10);
    toes(cg, sh(dk, 0.8), [sx * 0.12, 0.012, -0.02], 0, 3, 0.03, 0.009, 0.4, '#3a2a1e', 0.01);
    // straight front legs
    limb(cg, c, [[[sx * 0.06, 0.2, 0.06], 0.042, 0.05], [[sx * 0.064, 0.13, 0.085], 0.032, 0.036], [[sx * 0.064, 0.06, 0.1], 0.024, 0.026], [[sx * 0.064, 0.02, 0.11], 0.024, 0.027]], coat, 12);
    toes(cg, sh(dk, 0.8), [sx * 0.064, 0.012, 0.115], 0, 4, 0.03, 0.008, 0.38, '#3a2a1e', 0.01);
  }
  // Long blocky head: flat brow-to-nose line, deep blunt muzzle, eyes and little ears high and back
  const h = grp(cg, [0, 0.3, 0.12], [0.16, -0.3, 0]);
  sw(h, [
    { p: [0, 0.0, -0.05], w: 0.058, h: 0.062 }, { p: [0, 0.0, 0.0], w: 0.064, h: 0.072 }, { p: [0, -0.008, 0.07], w: 0.056, h: 0.074 },
    { p: [0, -0.016, 0.15], w: 0.048, h: 0.072 }, { p: [0, -0.02, 0.19], w: 0.044, h: 0.066 }, { p: [0, -0.02, 0.205], w: 0.034, h: 0.052 },
  ], c, coat, { radial: 18, sub: 5, caps: true });
  blob(h, c, 0, -0.02, 0.198, 0.038, 0.058, 0.024, coat, [0, 0, 0], 14);
  for (const sx of [-1, 1]) {
    blob(h, c, sx * 0.03, -0.02, 0.0, 0.035, 0.05, 0.05, coat, [0, 0, 0], 12);
    el(h, '#1a120c', sx * 0.015, 0.024, 0.212, 0.0075, 0.0045, 0.006, sx * 0.3);
    eye(h, sx * 0.05, 0.042, 0.01, 0.0095, sx * 1.15, '#2a1a10', c);
    ear(h, [sx * 0.047, 0.05, -0.04], [-0.4, sx * 1.0, -sx * 0.7], 0.017, 0.018, sh(c, 0.85), '#4a3022');
  }
  el(h, '#3a2216', 0, -0.062, 0.19, 0.022, 0.0025, 0.012);
  // A cattle tyrant bird perched on its back
  const b = grp(cg, [0.0, 0.272, -0.15], [0.05, 0.6, 0]);
  blob(b, '#6a6a5a', 0, 0.03, 0, 0.022, 0.024, 0.034, (x, y, z, _nx, ny) => (ny < -0.2 ? '#e8d46a' : speck('#7a7262', x, y, z, 0.05)), [-0.35, 0, 0], 12);
  blob(b, '#6a6a5a', 0, 0.062, 0.022, 0.018, 0.018, 0.019, (_x, y) => (y < 0.055 ? '#efe2a0' : '#6a6458'), [0, 0, 0], 12);
  drop(b, '#1a1a1a', [0, 0.062, 0.038], [0, 0.058, 0.058], 0.005);
  for (const sx of [-1, 1]) bead(b, sx * 0.012, 0.067, 0.034, 0.0035);
  blade(b, '#4a4a42', [0, 0.024, -0.025], [0, 0.012, -0.07], 0.014, 0.004, [0, 1, 0]);
  for (const sx of [-1, 1]) tube(b, [[sx * 0.008, 0.012, 0.0], [sx * 0.008, -0.005, 0.004]], 0.0025, 0.0025, '#2a2a2a');
};

/** Toco toucan: glossy black bird with a white bib, giant orange bill tipped black, blue eye-ring; perched on a branch. */
const toucan: Builder = (gp, r) => {
  const blk = (r.color as string) ?? '#141414', c = '#f7931e', bib = '#f6f2e6';
  ground(gp, 0.36, 0.34, ['#4e6e2e', '#3a5a26', '#6e7a3a'], { seed: 11 });
  for (const [x, z, s] of [[-0.25, 0.12, 1.2], [0.2, 0.2, 1], [0.26, -0.15, 1.3], [-0.1, 0.25, 0.9]] as const) grass(gp, x, z, ['#7aa648', '#3f6a26'], s, 7, x * 7 + z);
  rock(gp, '#7a7466', 0.12, 0.0, 0.18, 0.06, 0.035, 0.05, 0.3, '#5d7a3a');
  // Branch: rises from a mossy stump, bends to a horizontal perch, with a side twig of leaves
  const bark = '#6a4a32', bp = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const col = barkP(bark, 1.2)(x, y, z, nx, ny, nz)!;
    return ny > 0.6 ? mx(col, '#6e8e3a', sst(0.6, 0.9, ny) * sst(0.4, 0.6, vnoise(x * 30, y * 30, z * 30))) : col;
  };
  sw(gp, [
    { p: [-0.26, -0.01, -0.02], w: 0.06 }, { p: [-0.24, 0.1, -0.02], w: 0.042 }, { p: [-0.19, 0.2, -0.02], w: 0.034 },
    { p: [-0.09, 0.25, -0.02], w: 0.03 }, { p: [0.08, 0.262, -0.02], w: 0.027 }, { p: [0.2, 0.285, -0.02], w: 0.02 }, { p: [0.25, 0.3, -0.02], w: 0.012 },
  ], bark, bp, { radial: 12, sub: 5 });
  tube(gp, [[-0.15, 0.23, -0.02], [-0.2, 0.33, -0.07], [-0.22, 0.42, -0.1]], 0.012, 0.006, bark, bp);
  for (const [at, rot] of [[[-0.22, 0.42, -0.1], [-0.5, -0.6, 0]], [[-0.21, 0.38, -0.09], [0.3, 1.2, -0.4]], [[-0.2, 0.34, -0.07], [0.5, -2.2, 0.3]], [[0.25, 0.3, -0.02], [-0.2, 1.6, 0]]] as [V3, V3][])
    leaf(gp, '#3f8a3a', at, 0.04, 0.1, rot, 0.006, 0.2);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) blob(gp, '#5e7a34', -0.26 + sx * 0.04, 0.0, -0.02 + (k - 1) * 0.035, 0.03, 0.02, 0.025, undefined, [0, 0, 0], 8);
  // Bird group, slightly turned toward the viewer
  const b = grp(gp, [0.02, 0.262, -0.02], [0, 0.45, 0]);
  b.scale.setScalar(1.3);
  const plumage: Paint = (x, y, z) => {
    let col = speck(blk, x, y, z, 0.06);
    // white bib on throat/upper breast
    const front = z - (0.03 + (0.19 - y) * 0.5);
    if (y > 0.11 && y < 0.205) col = mx(col, bib, sst(-0.012, 0.008, front) * sst(0.105, 0.125, y));
    return col;
  };
  spine(b, [
    { p: [0, 0.03, -0.11], w: 0.03, h: 0.03 }, { p: [0, 0.045, -0.085], w: 0.058, h: 0.055 }, { p: [0, 0.08, -0.045], w: 0.072, h: 0.07 },
    { p: [0, 0.125, -0.005], w: 0.068, h: 0.068 }, { p: [0, 0.165, 0.02], w: 0.054, h: 0.055 }, { p: [0, 0.19, 0.03], w: 0.04, h: 0.04 },
  ], blk, plumage, { nv: 22 });
  blob(b, blk, 0, 0.2, 0.035, 0.05, 0.048, 0.054, plumage, [0, 0, 0], 18);
  // Wings folded on the sides, tips crossing over the tail
  for (const sx of [-1, 1]) sw(b, [
    { p: [sx * 0.06, 0.14, 0.0], w: 0.012, h: 0.035 }, { p: [sx * 0.065, 0.1, -0.05], w: 0.012, h: 0.042 }, { p: [sx * 0.05, 0.05, -0.11], w: 0.01, h: 0.028 }, { p: [sx * 0.025, 0.02, -0.15], w: 0.006, h: 0.012 },
  ], blk, (x, y, z) => speck(mx(blk, '#2a2a3a', 0.4), x, y, z, 0.08), { radial: 10, sub: 4 });
  // Long tail hanging behind the branch, white rump and red vent
  blade(b, blk, [0, 0.04, -0.1], [0, -0.14, -0.15], 0.042, 0.008, [0, 0.2, -1]);
  blob(b, bib, 0, 0.062, -0.1, 0.03, 0.018, 0.025, undefined, [0.5, 0, 0], 10);
  blob(b, '#d8231e', 0, 0.02, -0.075, 0.03, 0.02, 0.03, undefined, [0.4, 0, 0], 10);
  el(b, '#f0e070', 0, 0.12, 0.058, 0.03, 0.006, 0.01); // yellow border under the bib
  // Bill: huge, laterally compressed, with black base ring and black tip
  const bill: Paint = (x, y, z) => {
    let col = mx(c, '#ffb43a', sst(0.17, 0.205, y) * 0.6);
    col = mx(col, '#d8401a', sst(0.004, 0.0, Math.abs(y - 0.214 + (z - 0.08) * 0.08)) * sst(0.1, 0.16, z) * 0.6);
    if (z < 0.092) col = mx(col, blk, sst(0.088, 0.078, z));
    col = mx(col, blk, sst(0.25, 0.265, z + (y - 0.18) * 0.4));
    return col;
  };
  const bp2: { p: V3; w: number; h: number }[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, z = 0.075 + t * 0.22, curve = t * t * 0.04;
    bp2.push({ p: [0, 0.195 - curve - t * 0.01, z], w: 0.022 * (1 - t * 0.75), h: 0.042 * (1 - t * 0.82) + 0.002 });
  }
  sw(b, bp2, c, bill, { radial: 14, sub: 3 });
  for (const sx of [-1, 1]) {
    el(b, '#f08a2a', sx * 0.034, 0.212, 0.06, 0.006, 0.022, 0.026, 0, 0, 0);
    el(b, '#3a8ad8', sx * 0.04, 0.212, 0.056, 0.004, 0.017, 0.018);
    eye(b, sx * 0.043, 0.212, 0.056, 0.0095, sx * 1.4, '#3a8ad8');
  }
  // Zygodactyl feet gripping the perch
  for (const sx of [-1, 1]) {
    tube(b, [[sx * 0.025, 0.05, 0.0], [sx * 0.028, 0.02, 0.008]], 0.008, 0.007, '#5a6a8a');
    for (const [dz, dy] of [[0.03, -0.012], [0.026, -0.02], [-0.03, -0.01], [-0.025, -0.02]]) tube(b, [[sx * 0.028, 0.018, 0.008], [sx * 0.03, 0.01 + dy * 0.5, 0.008 + dz * 0.7], [sx * 0.03, dy, 0.008 + dz]], 0.004, 0.003, '#5a6a8a');
  }
};

/** Golden poison frog: glossy bright yellow, huge dark eyes, sticky toe pads; on a mossy rock under jungle leaves. */
const dartfrog: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#f6c21a';
  ground(gp, 0.42, 0.4, ['#3e5a2a', '#2e4a22', '#5a4a2a'], { seed: 13 });
  rock(gp, '#6c6a60', 0.0, -0.005, 0.0, 0.3, 0.085, 0.25, 0.3, '#5f8a34');
  for (const [x, z, s] of [[-0.33, 0.12, 1.1], [0.3, 0.22, 1], [0.33, -0.12, 1.2]] as const) grass(gp, x, z, ['#6fa040', '#3f6a26'], s, 6, x * 5);
  // Bromeliad rosette and big leaves behind
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.3, l = 0.16 + (i % 3) * 0.03;
    blade(gp, i % 2 ? '#5a9a3a' : '#c0402a', [-0.22, 0.02, -0.22], [-0.22 + Math.cos(a) * l * 0.6, 0.02 + l, -0.22 + Math.sin(a) * l * 0.6], 0.028, 0.004, [-Math.sin(a), 0, Math.cos(a)]);
  }
  for (const [x, z, yaw, l, c2] of [[0.22, -0.26, -2.6, 0.22, '#2f7a34'], [0.22, -0.26, -1.6, 0.2, '#3a8a3a'], [-0.3, 0.2, 0.7, 0.16, '#2f7034'], [0.3, 0.12, 1.9, 0.14, '#3a8a3a']] as const)
    bigLeaf(gp, [x, 0.0, z], yaw, l, 0.06, c2, 0.9, 0.85);
  for (const [x, y, z] of [[0.12, 0.08, 0.15], [-0.15, 0.075, 0.1], [0.2, 0.06, -0.05]]) { const d = el(gp, '#cfefff', x, y, z, 0.008, 0.006, 0.008); d.material = mat('#cfefff', { flat: false }); }

  const f = grp(gp, [0, 0.07, 0.0], [0, 0.35, 0]);
  f.scale.setScalar(1.25);
  const skin: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, '#ffe066', sst(0.3, 0.9, ny) * 0.35);
    col = mx(col, sh(c, 0.8), sst(-0.2, -0.8, ny) * 0.5);
    return speck(col, x, y, z, 0.03);
  };
  // Body: sitting pear shape, back sloping down to the rump
  spine(f, [
    { p: [0, 0.035, -0.14], w: 0.03, h: 0.025 }, { p: [0, 0.05, -0.12], w: 0.07, h: 0.045 }, { p: [0, 0.065, -0.06], w: 0.1, h: 0.06 },
    { p: [0, 0.075, 0.01], w: 0.095, h: 0.058 }, { p: [0, 0.08, 0.06], w: 0.088, h: 0.05 }, { p: [0, 0.074, 0.11], w: 0.06, h: 0.036 }, { p: [0, 0.068, 0.135], w: 0.025, h: 0.018 },
  ], c, skin, { nv: 26 });
  // Big bulging black eyes
  for (const sx of [-1, 1]) {
    blob(f, c, sx * 0.058, 0.108, 0.07, 0.03, 0.028, 0.03, skin, [0, 0, 0], 14);
    const e = el(f, '#0a0a0c', sx * 0.068, 0.118, 0.078, 0.024, 0.024, 0.024);
    e.material = mat('#0a0a0c', { flat: false, rough: 0.15 });
    lit(el(f, '#ffffff', sx * 0.074, 0.134, 0.094, 0.0055));
    el(f, '#2a1a0a', sx * 0.012, 0.087, 0.128, 0.003); // nostril
  }
  el(f, sh(c, 0.75), 0, 0.058, 0.115, 0.06, 0.0025, 0.03); // mouth line
  // Front legs with splayed fingers and round toe pads
  for (const sx of [-1, 1]) {
    limb(f, c, [[[sx * 0.07, 0.05, 0.06], 0.022, 0.022], [[sx * 0.09, 0.03, 0.09], 0.016, 0.016], [[sx * 0.095, 0.01, 0.12], 0.012, 0.012]], skin, 10);
    toes(f, sh(c, 0.92), [sx * 0.095, 0.006, 0.12], sx * 0.35, 4, 0.04, 0.0055, 0.42, sh(c, 0.85), 0.006);
    // Hind legs folded: thigh forward-out, shin back, foot forward-out
    limb(f, c, [[[sx * 0.07, 0.05, -0.09], 0.04, 0.035], [[sx * 0.12, 0.045, -0.05], 0.032, 0.028], [[sx * 0.15, 0.035, -0.005], 0.02, 0.02]], skin, 12);
    limb(f, c, [[[sx * 0.15, 0.035, -0.005], 0.02, 0.02], [[sx * 0.14, 0.028, -0.07], 0.016, 0.016], [[sx * 0.115, 0.016, -0.12], 0.012, 0.012]], skin, 10);
    toes(f, sh(c, 0.92), [sx * 0.115, 0.008, -0.12], sx * 1.2, 5, 0.06, 0.005, 0.32, sh(c, 0.85), 0.006);
  }
  gloss(f, 0.28);
};

/** Axolotl: pink smiling salamander with three feathery red gills each side and a finned tail; on a weedy lake bed. */
const axolotl: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#f2a7b4', gill = '#e0506e', pale = '#fbd6dc';
  ground(gp, 0.44, 0.42, ['#6a6a4e', '#57604a', '#8a7a5a'], { seed: 17 });
  for (const [x, z] of [[0.24, 0.24], [-0.3, -0.12], [0.3, -0.18], [-0.14, 0.3], [0.05, -0.3]]) for (let k = 0; k < 3; k++) el(gp, ['#8a8478', '#a09a8a', '#6e6a60'][k], x + k * 0.025, 0.004, z + (k % 2) * 0.02, 0.016 + k * 0.004, 0.01, 0.014);
  // Swaying water weeds behind
  for (const [x, z, n] of [[-0.25, -0.26, 5], [0.28, -0.3, 4], [-0.34, 0.12, 3]] as const) for (let k = 0; k < n; k++) {
    const a = k * 1.3 + x * 9, h = 0.22 + hash3(k, x * 9, 3) * 0.12, bx = x + Math.cos(a) * 0.025, bz = z + Math.sin(a) * 0.025;
    sw(gp, [0, 0.33, 0.66, 1].map(t => ({ p: [bx + Math.sin(t * 3 + a) * 0.02 * t, t * h, bz + Math.cos(t * 2 + a) * 0.02 * t] as V3, w: 0.006 * (1 - t * 0.6), h: 0.012 * (1 - t * 0.7) + 0.002 })), '#4f8a3a', (_x, y) => mx('#3f7a32', '#9ac25a', y / 0.34), { radial: 6, sub: 3 });
  }
  const a = grp(gp, [0.02, -0.012, 0.02], [0, 0.5, 0]);
  a.scale.setScalar(1.35);
  const skin: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.2 ? mx(c, pale, sst(-0.2, -0.7, ny) * 0.7) : mx(c, sh(c, 0.92), sst(0.4, 0.9, ny) * 0.5);
    col = mx(col, '#c87888', sst(0.72, 0.85, vnoise(x * 70, y * 70, z * 70)) * 0.45);
    return mx(col, '#ffe6a0', sst(0.82, 0.9, vnoise(x * 120, y * 120 + 7, z * 120)) * 0.35);
  };
  // Body with a gently curled tail, laterally flattened toward the tip
  spine(a, [
    { p: [0.11, 0.06, -0.33], w: 0.004, h: 0.012 }, { p: [0.07, 0.065, -0.28], w: 0.01, h: 0.04 }, { p: [0.025, 0.068, -0.2], w: 0.02, h: 0.048 },
    { p: [0.0, 0.07, -0.11], w: 0.042, h: 0.042 }, { p: [0, 0.072, -0.02], w: 0.05, h: 0.042 }, { p: [0, 0.075, 0.05], w: 0.046, h: 0.04 },
    { p: [0, 0.08, 0.1], w: 0.072, h: 0.044 }, { p: [0, 0.078, 0.16], w: 0.068, h: 0.038 }, { p: [0, 0.072, 0.195], w: 0.042, h: 0.024 }, { p: [0, 0.068, 0.205], w: 0.012, h: 0.008 },
  ], c, skin, { nv: 22 });
  // Dorsal / tail fin as a thin translucent ridge
  const fin: Paint = (_x, y) => mx(pale, c, sst(0.14, 0.1, y) * 0.5);
  sw(a, [
    { p: [0, 0.108, 0.04], w: 0.002, h: 0.002 }, { p: [0, 0.114, -0.06], w: 0.0025, h: 0.007 }, { p: [0.012, 0.118, -0.16], w: 0.0025, h: 0.014 },
    { p: [0.045, 0.11, -0.24], w: 0.0025, h: 0.018 }, { p: [0.09, 0.09, -0.31], w: 0.002, h: 0.014 }, { p: [0.12, 0.068, -0.345], w: 0.0015, h: 0.005 },
  ], pale, fin, { radial: 8, sub: 4 });
  sw(a, [
    { p: [0.03, 0.03, -0.18], w: 0.002, h: 0.002 }, { p: [0.06, 0.025, -0.25], w: 0.0025, h: 0.012 }, { p: [0.1, 0.035, -0.31], w: 0.002, h: 0.01 }, { p: [0.12, 0.055, -0.34], w: 0.0015, h: 0.004 },
  ], pale, fin, { radial: 8, sub: 4 });
  // Wide smiling face, tiny dark eyes
  for (const sx of [-1, 1]) {
    bead(a, sx * 0.052, 0.098, 0.15, 0.0095, '#1a0e12');
    tube(a, [[sx * 0.05, 0.06, 0.165], [sx * 0.035, 0.057, 0.188], [0, 0.056, 0.199]], 0.0028, 0.0028, '#b0566a');
  }
  // Three feathery gill stalks per side
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const b0: V3 = [sx * 0.062, 0.1 - k * 0.012, 0.1 - k * 0.012], ang = 0.9 - k * 0.55;
    const tip: V3 = [sx * (0.11 + k * 0.006), 0.1 + Math.sin(ang) * 0.075, 0.1 - Math.cos(ang) * 0.06 - k * 0.02];
    const mid = lerp3(b0, tip, 0.5); mid[0] += sx * 0.012;
    tube(a, [b0, mid, tip], 0.008, 0.0045, gill);
    for (let i = 1; i <= 7; i++) {
      const t = i / 8, q = t < 0.5 ? lerp3(b0, mid, t * 2) : lerp3(mid, tip, (t - 0.5) * 2);
      for (const side of [-1, 1]) {
        const out: V3 = [q[0] + sx * 0.012, q[1] + side * 0.016 * (1 - t * 0.4), q[2] + side * 0.01 - 0.008];
        drop(a, i % 2 ? gill : '#f07890', q, out, 0.0045);
      }
    }
  }
  // Little legs with slender fingers
  const legs: [number, number, number, number][] = [[-1, 0.06, 0.4, 4], [1, 0.06, -0.2, 4], [-1, -0.14, 0.3, 5], [1, -0.14, -0.4, 5]];
  for (const [sx, z, sw2, n] of legs) {
    const hip: V3 = [sx * 0.035, 0.06, z], knee: V3 = [sx * 0.075, 0.045, z + 0.01 + sw2 * 0.02], foot: V3 = [sx * 0.085, 0.022, z + 0.03 + sw2 * 0.03];
    tube(a, [hip, knee, foot], 0.015, 0.009, c, skin);
    toes(a, c, foot, sx * 0.6 + sw2 * 0.5, n, 0.02, 0.0035, 0.42, pale, 0.018);
  }
  gloss(a, 0.3);
};

/** Platypus: dark furry body, flat leathery duck bill, beaver tail and webbed front feet; at the river's edge. */
const platypus: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#6b4a32', bill = '#3a3634', belly = '#b08a62';
  water(gp, 0.46, 0.46, [[0.22, 0.28, 0.045]], '#4f7f8a', 0, 0, -0.034);
  ground(gp, 0.4, 0.34, ['#6e5a3a', '#5a6a32', '#8a7450'], { seed: 19, cx: -0.08, cz: -0.1, paint: (x, y, z) => {
    const e = Math.hypot((x + 0.08) / 0.4, (z + 0.1) / 0.34);
    let col = mx('#7a6448', '#5e8a3a', sst(0.55, 0.3, vnoise(x * 7, 4, z * 7) * 0.7 + e * 0.45) * 0.85);
    col = mx(col, '#5a4a36', sst(0.78, 1.0, e) * 0.8);
    return speck(col, x, y, z, 0.05);
  } });
  for (const [x, z, s] of [[-0.36, -0.08, 1.4], [-0.28, -0.3, 1.2], [0.02, -0.38, 1.1], [0.18, -0.32, 1.3]] as const) grass(gp, x, z, ['#8aa648', '#4f7a30'], s, 7, x * 9);
  for (let i = 0; i < 6; i++) { const x = 0.3 + (i % 3) * 0.03, z = 0.05 - i * 0.025; tube(gp, [[x, -0.01, z], [x + 0.01, 0.14 + (i % 3) * 0.04, z - 0.01]], 0.004, 0.003, '#8a9a4a'); }
  rock(gp, '#7a7468', 0.2, -0.005, 0.05, 0.07, 0.03, 0.05, 0.2);
  rock(gp, '#6a665a', -0.05, -0.01, 0.3, 0.05, 0.02, 0.04, 1.2);
  const p0 = grp(gp, [-0.03, 0.0, -0.02], [0, 0.65, 0]);
  p0.scale.setScalar(1.3);
  const fur: Paint = (x, y, z, _nx, ny) => {
    const col = ny < -0.25 ? mx(c, belly, sst(-0.25, -0.75, ny)) : mx(c, sh(c, 0.85), sst(0.3, 1, ny) * 0.4);
    return speck(col, x, y, z, 0.07);
  };
  spine(p0, [
    { p: [0, 0.06, -0.19], w: 0.05, h: 0.03 }, { p: [0, 0.075, -0.15], w: 0.09, h: 0.055 }, { p: [0, 0.085, -0.07], w: 0.105, h: 0.068 },
    { p: [0, 0.085, 0.02], w: 0.1, h: 0.066 }, { p: [0, 0.085, 0.09], w: 0.075, h: 0.055 }, { p: [0, 0.085, 0.14], w: 0.058, h: 0.046 }, { p: [0, 0.082, 0.17], w: 0.04, h: 0.032 },
  ], c, fur, { nv: 24 });
  // Beaver-like flat tail
  blob(p0, c, 0, 0.05, -0.25, 0.07, 0.018, 0.09, (x, y, z, _nx, ny) => speck(ny > 0 ? sh(c, 0.9) : mx(c, belly, 0.4), x, y, z, 0.1), [-0.08, 0, 0], 18);
  // Flat rubbery duck-bill, slightly upturned edges, nostrils near the tip
  const bp: Paint = (x, y, z, _nx, ny) => speck(ny > 0.3 ? bill : mx(bill, '#6a625c', 0.5), x, y, z, 0.05);
  sw(p0, [
    { p: [0, 0.078, 0.165], w: 0.034, h: 0.02 }, { p: [0, 0.074, 0.2], w: 0.042, h: 0.013 }, { p: [0, 0.068, 0.25], w: 0.045, h: 0.011 },
    { p: [0, 0.064, 0.285], w: 0.038, h: 0.01 }, { p: [0, 0.062, 0.3], w: 0.02, h: 0.008 },
  ], bill, bp, { radial: 16, sub: 4, caps: true });
  el(p0, sh(bill, 0.8), 0, 0.078, 0.17, 0.045, 0.024, 0.012); // fleshy shield at bill base
  for (const sx of [-1, 1]) {
    el(p0, '#141010', sx * 0.008, 0.076, 0.27, 0.004, 0.002, 0.006);
    bead(p0, sx * 0.036, 0.1, 0.145, 0.008);
    el(p0, belly, sx * 0.034, 0.093, 0.143, 0.012, 0.004, 0.012); // pale stripe around eye
  }
  // Sprawled legs: webbed front paddles, clawed back feet
  for (const sx of [-1, 1]) {
    limb(p0, c, [[[sx * 0.07, 0.06, 0.06], 0.026, 0.026], [[sx * 0.11, 0.03, 0.08], 0.018, 0.018], [[sx * 0.12, 0.015, 0.1], 0.014, 0.014]], fur, 10);
    blob(p0, bill, sx * 0.125, 0.01, 0.125, 0.032, 0.006, 0.032, undefined, [0, sx * 0.3, 0], 12);
    toes(p0, '#2a2624', [sx * 0.12, 0.01, 0.105], sx * 0.3, 5, 0.04, 0.0035, 0.32, '#ddd4c6', 0.012);
    limb(p0, c, [[[sx * 0.07, 0.06, -0.12], 0.028, 0.03], [[sx * 0.11, 0.03, -0.14], 0.02, 0.02], [[sx * 0.13, 0.014, -0.16], 0.015, 0.015]], fur, 10);
    toes(p0, '#2a2624', [sx * 0.13, 0.01, -0.16], sx * 1.6, 5, 0.035, 0.004, 0.35, '#ddd4c6', 0.01);
  }
};

/** Sea otter: floating on its back in a kelp bed, pale fluffy face, paws holding a clam on its tummy. */
const seaotter: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#5a4636', face = '#e6d8c2';
  water(gp, 0.47, 0.47, [[0.02, 0.0, 0.2], [-0.25, 0.22, 0.04]], '#2f6e88', 0, 0, -0.016);
  // Kelp fronds floating on the surface with gas floats
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 2.0, rr = 0.3 + (i % 3) * 0.04, x = Math.cos(a) * rr, z = Math.sin(a) * rr, d = a + 1.6 + (i % 2) * 0.5;
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([x + Math.cos(d) * 0.22 * t + Math.sin(t * 9 + i) * 0.012, 0.01, z + Math.sin(d) * 0.22 * t + Math.cos(t * 9 + i) * 0.012]); }
    const kc = ['#6e5a24', '#8a6a2a', '#5a5a22'][i % 3];
    sw(gp, pts.map((q, k) => ({ p: q, w: 0.006 + Math.sin(Math.PI * Math.min(1, k / 6 + 0.08)) * 0.022, h: 0.003 })), kc, (px, _py, pz) => mx(kc, '#b0903a', sst(0.6, 0.8, vnoise(px * 40, 1, pz * 40)) * 0.5), { radial: 8, sub: 3 });
    el(gp, '#8a7030', x, 0.012, z, 0.011, 0.009, 0.011);
  }
  const o = grp(gp, [0.0, 0.0, 0.0], [0, 1.15, 0]);
  o.scale.setScalar(1.3);
  const fur: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, mx(c, face, 0.35), sst(0.4, 0.95, ny) * sst(-0.05, 0.12, z));
    col = mx(col, sh(c, 0.8), sst(-0.1, -0.5, ny) * 0.5);
    return speck(col, x, y, z, 0.09);
  };
  // Body lying on its back, belly up, half in the water
  spine(o, [
    { p: [0, 0.03, -0.22], w: 0.04, h: 0.03 }, { p: [0, 0.04, -0.17], w: 0.085, h: 0.055 }, { p: [0, 0.05, -0.08], w: 0.11, h: 0.07 },
    { p: [0, 0.055, 0.02], w: 0.112, h: 0.072 }, { p: [0, 0.062, 0.1], w: 0.095, h: 0.066 }, { p: [0, 0.075, 0.16], w: 0.07, h: 0.06 },
  ], c, fur, { nv: 24 });
  // Flat tail and webbed hind flippers poking up
  blob(o, c, 0, 0.03, -0.27, 0.035, 0.013, 0.08, fur, [0.1, 0, 0], 14);
  for (const sx of [-1, 1]) {
    tube(o, [[sx * 0.05, 0.06, -0.16], [sx * 0.07, 0.1, -0.2]], 0.022, 0.016, c, fur);
    blob(o, sh(c, 0.75), sx * 0.075, 0.13, -0.215, 0.03, 0.04, 0.009, undefined, [0.3, sx * 0.3, sx * 0.15], 12);
  }
  // Head tilted up, pale fluffy face with dark eyes and a big nose
  const h = grp(o, [0, 0.115, 0.2], [-0.4, -0.75, 0]);
  const fp: Paint = (x, y, z, _nx, ny) => speck(mx(face, mx(c, face, 0.4), sst(0.0, -0.04, z) * 0.9 + sst(-0.3, -0.8, ny) * 0.3), x, y, z, 0.06);
  blob(h, face, 0, 0, 0, 0.066, 0.06, 0.06, fp, [0, 0, 0], 20);
  blob(h, face, 0, -0.018, 0.045, 0.042, 0.03, 0.03, fp, [0, 0, 0], 16);
  for (const sx of [-1, 1]) {
    blob(h, '#f2ebde', sx * 0.017, -0.022, 0.066, 0.02, 0.016, 0.014, undefined, [0, 0, 0], 12);
    for (let k = 0; k < 3; k++) tube(h, [[sx * 0.025, -0.02 - k * 0.006, 0.068], [sx * 0.07, -0.02 - k * 0.012, 0.07]], 0.0012, 0.0008, '#f8f4ea', undefined, 4);
    bead(h, sx * 0.03, 0.016, 0.052, 0.0095);
    el(h, sh(c, 0.8), sx * 0.055, 0.03, -0.01, 0.012, 0.012, 0.008);
  }
  el(h, '#1a1412', 0, -0.006, 0.076, 0.016, 0.011, 0.01);
  // Front paws on the tummy holding a clam
  for (const sx of [-1, 1]) {
    limb(o, c, [[[sx * 0.075, 0.08, 0.1], 0.022, 0.022], [[sx * 0.06, 0.125, 0.06], 0.017, 0.017], [[sx * 0.025, 0.135, 0.04], 0.016, 0.016]], fur, 10);
    el(o, sh(c, 0.7), sx * 0.022, 0.135, 0.038, 0.017, 0.013, 0.017);
  }
  const clam = grp(o, [0, 0.145, 0.03], [-0.3, 0, 0]);
  blob(clam, '#e8b8a0', 0, 0, 0, 0.026, 0.008, 0.022, (x, _y, z) => mx('#f2d2c0', '#c8826a', sst(0.4, 0.95, Math.abs(Math.sin(Math.atan2(x, z) * 9)))), [0, 0, 0], 14);
};

/** Walrus: huge wrinkly pinkish-brown body on an ice floe, long ivory tusks and a bristly moustache. */
const walrus: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#b07a5e', dk = sh(c, 0.72), pink = '#d49a84';
  water(gp, 0.47, 0.47, [[0.3, 0.3, 0.04]], '#2a5a78', 0, 0, -0.03);
  // Ice floe: chunky white slab with blue-tinted cracks and edges
  blob(gp, '#eef6fa', -0.02, -0.0, -0.02, 0.4, 0.04, 0.36, (x, y, z, _nx, ny) => {
    let col = ny > 0.7 ? mx('#f4fbff', '#dcecf4', vnoise(x * 12, 2, z * 12) * 0.8) : mx('#bfe0ee', '#8cc4dc', sst(0.5, -0.5, ny));
    col = mx(col, '#a8d0e4', sst(0.92, 0.97, Math.sin(x * 40 + Math.sin(z * 20) * 3)) * 0.5);
    return speck(col, x, y, z, 0.02);
  }, [0, 0.3, 0], 28);
  for (const [x, z, s] of [[0.28, -0.22, 0.05], [-0.3, 0.2, 0.04], [-0.32, -0.16, 0.06]]) blob(gp, '#e6f2f8', x, 0.03, z, s, s * 0.6, s * 0.8, (_x, _y, _z, _nx, ny) => (ny > 0.6 ? '#f8fcff' : '#b8dcec'), [0.2, x * 5, 0.1], 10);
  const w = grp(gp, [0.0, 0.035, 0.0], [0, 0.5, 0]);
  const skin: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, pink, sst(0.55, 0.8, vnoise(x * 10, y * 10, z * 10)) * 0.6);
    col = mx(col, dk, sst(0.0, -0.7, ny) * 0.4);
    // deep skin folds around the neck and shoulders
    col = mx(col, sh(col, 0.72), sst(0.75, 0.98, Math.sin(z * 90 + Math.sin(x * 40) * 1.5 + vnoise(x * 20, y * 20, z * 20) * 3)) * 0.6 * sst(-0.12, 0.05, z));
    return speck(col, x, y, z, 0.06);
  };
  spine(w, [
    { p: [0, 0.05, -0.33], w: 0.04, h: 0.025 }, { p: [0, 0.065, -0.28], w: 0.1, h: 0.055 }, { p: [0, 0.1, -0.18], w: 0.16, h: 0.1 },
    { p: [0, 0.14, -0.06], w: 0.18, h: 0.13 }, { p: [0, 0.18, 0.04], w: 0.165, h: 0.13 }, { p: [0, 0.23, 0.11], w: 0.12, h: 0.1 }, { p: [0, 0.27, 0.15], w: 0.09, h: 0.08 },
  ], c, skin, { nv: 28 });
  // Head with the big whisker pad, tiny eyes and tusks
  const h = grp(w, [0, 0.3, 0.17], [0.35, 0, 0]);
  blob(h, c, 0, 0, 0, 0.078, 0.07, 0.08, skin, [0, 0, 0], 20);
  for (const sx of [-1, 1]) {
    blob(h, pink, sx * 0.035, -0.035, 0.07, 0.045, 0.042, 0.04, (x, y, z) => {
      const col = speck(mx(pink, c, 0.25), x, y, z, 0.05);
      return vnoise(x * 260, y * 260, z * 260) > 0.68 ? '#5a3a2e' : col;
    }, [0, 0, 0], 18);
    for (let k = 0; k < 7; k++) {
      const a = -0.6 + k * 0.2, b0: V3 = [sx * (0.03 + Math.cos(a) * 0.035), -0.05 + Math.sin(a) * 0.025, 0.1];
      drop(h, '#f2e6c8', b0, [b0[0] + sx * 0.008, b0[1] - 0.02, b0[2] + 0.01], 0.0022);
    }
    eye(h, sx * 0.055, 0.03, 0.045, 0.008, sx * 0.9, '#2a1a10', c);
    el(h, '#3a2018', sx * 0.016, 0.012, 0.085, 0.006, 0.004, 0.004);
    // tusks: long, slightly curved ivory
    const t0: V3 = [sx * 0.022, -0.07, 0.085];
    sw(h, [{ p: t0, w: 0.012 }, { p: [sx * 0.025, -0.13, 0.095], w: 0.01 }, { p: [sx * 0.027, -0.19, 0.088], w: 0.007 }, { p: [sx * 0.026, -0.23, 0.072], w: 0.003 }], '#f0e6cc',
      (_x, y) => mx('#f6efdc', '#d8c8a4', sst(-0.08, -0.22, y)), { radial: 10, sub: 4, caps: true });
  }
  // Flippers: fore-flippers propping the chest, hind flippers splayed behind
  for (const sx of [-1, 1]) {
    limb(w, c, [[[sx * 0.12, 0.13, 0.06], 0.04, 0.05], [[sx * 0.16, 0.06, 0.1], 0.03, 0.035], [[sx * 0.18, 0.015, 0.12], 0.022, 0.022]], skin, 12);
    blob(w, dk, sx * 0.2, 0.012, 0.15, 0.035, 0.01, 0.055, undefined, [0, sx * 0.4, 0], 14);
    blob(w, dk, sx * 0.05, 0.03, -0.38, 0.03, 0.012, 0.07, undefined, [0, sx * 0.5, 0], 14);
  }
};

/** Narwhal: mottled grey-and-white whale surfacing among ice, long spiral tusk pointing skyward. */
const narwhal: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#9aa3a8', spot = '#3e444c', belly = '#eef0ee';
  water(gp, 0.47, 0.47, [[0.13, 0.12, 0.09], [-0.15, -0.2, 0.06]], '#1f4f6e', 0, 0, -0.022);
  for (const [x, z, sx, sz, yaw] of [[0.3, -0.25, 0.1, 0.06, 0.4], [-0.3, 0.2, 0.08, 0.05, 1.2], [-0.33, -0.08, 0.04, 0.03, 0.3], [0.33, 0.14, 0.045, 0.03, 2]]) {
    blob(gp, '#eef6fa', x, -0.004, z, sx, 0.018, sz, (px, _y, pz, _nx, ny) => (ny > 0.5 ? mx('#f6fbff', '#d8eaf4', vnoise(px * 30, 1, pz * 30)) : '#8cc4dc'), [0, yaw, 0], 7);
  }
  const n = grp(gp, [0.03, -0.022, -0.04], [0, -1.85, 0]);
  n.scale.setScalar(1.12);
  const skin: Paint = (x, y, z, _nx, ny) => {
    // grey back densely mottled, paling to a white belly and flanks
    const top = sst(-0.2, 0.6, ny);
    let col = mx(belly, c, top);
    const [f1] = worley(x * 70, y * 70, z * 70), [g1] = worley(x * 130 + 5, y * 130, z * 130);
    col = mx(col, spot, sst(0.32, 0.22, f1) * (0.3 + top * 0.65));
    col = mx(col, sh(spot, 0.85), sst(0.26, 0.16, g1) * top * 0.7);
    return col;
  };
  // Arched body breaking the surface, head lifted, flukes trailing
  spine(n, [
    { p: [0, 0.05, -0.36], w: 0.018, h: 0.014 }, { p: [0, 0.045, -0.3], w: 0.035, h: 0.032 }, { p: [0, 0.05, -0.2], w: 0.075, h: 0.068 },
    { p: [0, 0.06, -0.08], w: 0.105, h: 0.09 }, { p: [0, 0.07, 0.04], w: 0.11, h: 0.095 }, { p: [0, 0.085, 0.13], w: 0.095, h: 0.085 },
    { p: [0, 0.1, 0.2], w: 0.072, h: 0.07 }, { p: [0, 0.105, 0.24], w: 0.045, h: 0.045 }, { p: [0, 0.105, 0.255], w: 0.015, h: 0.015 },
  ], c, skin, { nv: 26 });
  // Flukes (heart-shaped with notch) and small pectoral flippers
  for (const sx of [-1, 1]) {
    blade(n, sh(c, 0.85), [0, 0.05, -0.355], [sx * 0.11, 0.07, -0.41], 0.038, 0.007, [0, 1, 0.1]);
    blade(n, mx(c, belly, 0.4), [sx * 0.075, 0.03, 0.1], [sx * 0.13, 0.0, 0.05], 0.022, 0.006, [sx * 0.3, 1, 0]);
    bead(n, sx * 0.062, 0.095, 0.195, 0.0075);
  }
  el(n, sh(c, 0.6), 0, 0.165, -0.0, 0.006, 0.003, 0.004); // blowhole
  // Spiral tusk (left canine) with a helical groove
  const t0 = new THREE.Vector3(-0.012, 0.1, 0.245), t1 = new THREE.Vector3(-0.03, 0.42, 0.52);
  const ax = t1.clone().sub(t0), L = ax.length(), sta: { p: V3; w: number }[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6, q = t0.clone().addScaledVector(ax, t); sta.push({ p: [q.x, q.y, q.z], w: 0.015 * (1 - t * 0.85) + 0.0015 }); }
  sw(n, sta, '#efe6cf', (_x, y) => mx('#e6d9b8', '#fbf6e8', sst(0.1, 0.4, y)), { radial: 10, sub: 3, caps: true });
  ax.normalize();
  const u = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(1, 0, 0)).normalize(), v = new THREE.Vector3().crossVectors(ax, u);
  const hel: V3[] = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44 * 0.92, rr = (0.015 * (1 - t * 0.85) + 0.0015) * 0.95, a = t * 26;
    const q = t0.clone().addScaledVector(ax, t * L).addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr);
    hel.push([q.x, q.y, q.z]);
  }
  sw(n, hel.map((q, i) => ({ p: q, w: 0.003 * (1 - i / 44 * 0.7) })), '#d6c69e', undefined, { radial: 5, sub: 1 });
  // Splash ring where the body meets the water
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63, z = -0.12 + Math.sin(a) * 0.22, x = Math.cos(a) * 0.12;
    el(n, '#e8f6ff', x, 0.024, z, 0.025, 0.006, 0.02);
  }
};

/** Manta ray: giant diamond wings with white shoulder patches and curled head fins, gliding over a coral reef. */
const manta: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#2a2a33';
  ground(gp, 0.45, 0.44, ['#d8c89a', '#c8b88a', '#e8dcb4'], { seed: 23, paint: (x, y, z) => speck(mx(mx('#dccb98', '#c4ae7c', sst(0.6, 0.95, Math.sin(x * 60 + Math.sin(z * 14) * 2.5)) * 0.6), '#6a9ab0', 0.12), x, y, z, 0.04) });
  for (const [x, z, sc] of [[0.18, 0.3, 0.05], [-0.2, 0.32, 0.04], [0.36, 0.12, 0.035]]) rock(gp, '#8a8476', x, 0.0, z, sc, sc * 0.6, sc * 0.8, x * 3, '#6a9a6a');
  // Coral heads, sea fans and sea grass
  const corals: [number, number, string, number][] = [[-0.28, -0.18, '#e86a6a', 0.075], [0.3, -0.22, '#f0a040', 0.065], [-0.32, 0.16, '#b86ad0', 0.055], [0.28, 0.24, '#f07898', 0.05], [0.05, -0.33, '#e8d070', 0.05]];
  for (const [x, z, col, rr] of corals) {
    blob(gp, col, x, 0.0, z, rr, rr * 0.8, rr, (px, py, pz) => mx(col, sh(col, 0.7), sst(0.05, 0.25, (([a, b]) => b - a)(worley(px * 60, py * 60, pz * 60))) * 0.8), [0, 0, 0], 14);
    for (let k = 0; k < 4; k++) { const a = k * 1.6 + x * 10; tube(gp, [[x, rr * 0.5, z], [x + Math.cos(a) * rr * 0.6, rr * 1.4, z + Math.sin(a) * rr * 0.6]], rr * 0.18, rr * 0.13, sh(col, 1.1)); }
  }
  for (const [x, z] of [[-0.12, -0.3], [0.33, 0.0], [-0.36, -0.02]]) for (let k = 0; k < 5; k++) {
    const a = k * 1.25 + x * 7;
    blade(gp, k % 2 ? '#5a9a4a' : '#7ab05a', [x, 0, z], [x + Math.cos(a) * 0.02, 0.09 + (k % 3) * 0.025, z + Math.sin(a) * 0.02], 0.007, 0.002, [-Math.sin(a), 0, Math.cos(a)]);
  }
  for (const [x, y, z, rr] of [[0.18, 0.35, -0.05, 0.01], [0.2, 0.42, -0.08, 0.007], [0.17, 0.48, -0.06, 0.005]]) { const b = el(gp, '#d8f2ff', x, y, z, rr); b.material = mat('#d8f2ff', { transparent: 0.6, flat: false }); }
  const m = grp(gp, [0.0, 0.24, -0.04], [0.3, -0.3, 0.05]);
  m.scale.setScalar(1.1);
  // Wings as one lofted surface across the span; leading edge swept back, thin tips curling up
  const S = 0.42, LE = (a: number) => 0.14 - 0.26 * a ** 1.2, TE = (a: number) => -0.17 + 0.05 * a ** 0.6, TH = (a: number) => 0.06 * (1 - a) ** 1.5 + 0.004;
  const wing: Paint = (x, y, z, _nx, ny) => {
    const a = Math.abs(x) / S;
    if (ny < -0.2) return mx('#f2f2ee', '#5a5a62', sst(0.85, 0.98, a) + sst(0.7, 0.75, vnoise(x * 50, 1, z * 50)) * sst(0.25, 0.5, a));
    let col = mx(c, sh(c, 0.8), sst(0.4, 1, a) * 0.6);
    // white chevron shoulder patches behind the leading edge
    const le = LE(a), d = le - z;
    col = mx(col, '#f2f2ee', sst(0.12, 0.17, a) * sst(0.4, 0.33, a) * sst(0.02, 0.04, d) * sst(0.12, 0.09, d));
    return speck(col, x, y, z, 0.04);
  };
  psurf(m, 30, 18, (uu, vv) => {
    const x = (uu * 2 - 1) * S, a = Math.min(1, Math.abs(x) / S), le = LE(a), te = TE(a), mid = (le + te) / 2, half = Math.max(0.002, (le - te) / 2);
    const ang = vv * Math.PI * 2, cz = Math.cos(ang), sy = Math.sin(ang);
    const thick = TH(a) * (sy > 0 ? 1 : 0.55) * (0.6 + 0.4 * (1 - Math.abs(cz)));
    return [x, sy * thick * Math.sqrt(Math.max(0, 1 - cz * cz)) + 0.035 * a * a - 0.01 * Math.sin(a * Math.PI), mid + cz * half];
  }, c, wing);
  // Head: curled cephalic fins either side of the wide mouth, eyes on the sides
  for (const sx of [-1, 1]) {
    sw(m, [{ p: [sx * 0.045, 0.004, 0.11], w: 0.006, h: 0.013 }, { p: [sx * 0.05, 0.0, 0.145], w: 0.005, h: 0.012 }, { p: [sx * 0.044, -0.008, 0.168], w: 0.004, h: 0.008 }, { p: [sx * 0.034, -0.016, 0.172], w: 0.003, h: 0.004 }], c, undefined, { radial: 8, sub: 3, caps: true });
    bead(m, sx * 0.058, 0.012, 0.1, 0.006, '#101014');
  }
  el(m, '#0a0a0e', 0, -0.006, 0.124, 0.036, 0.008, 0.01);
  // Whip-thin tail
  tube(m, [[0, 0.0, -0.15], [0.005, -0.005, -0.25], [0.02, -0.015, -0.34]], 0.007, 0.002, c);
  // Little reef fish escorting
  for (const [x, y, z, yaw, col] of [[0.25, 0.17, 0.2, 2.2, '#f2c430'], [0.3, 0.2, 0.14, 2.0, '#f2c430'], [-0.25, 0.12, -0.25, 0.5, '#4ab0e8']] as const) {
    const f = grp(gp, [x, y, z], [0, yaw, 0]);
    blob(f, col, 0, 0, 0, 0.008, 0.014, 0.02, undefined, [0, 0, 0], 10);
    blade(f, col, [0, 0, -0.016], [0, 0, -0.032], 0.01, 0.002, [1, 0, 0]);
  }
};

/** Meerkat sentinel family on a red Kalahari sand mound beside their burrow. */
const meerkat: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#c9a477', pale = '#ead6ae', dark = '#3a2a1e';
  ground(gp, 0.44, 0.42, ['#c8743e', '#b0602e', '#d89a5e'], { seed: 29 });
  blob(gp, '#c8743e', -0.02, -0.02, -0.04, 0.3, 0.07, 0.26, (x, y, z, _nx, ny) => speck(mx('#c46a38', '#dc945a', sst(0.3, 0.9, ny) * vnoise(x * 12, y * 12, z * 12)), x, y, z, 0.05), [0, 0.4, 0], 22);
  blob(gp, '#2a160c', 0.17, 0.035, 0.12, 0.06, 0.012, 0.045, undefined, [0.25, 0.5, 0], 14); // burrow entrance
  for (const [x, z, s] of [[-0.3, 0.2, 1.2], [0.32, -0.15, 1.4], [-0.32, -0.22, 1.1], [0.15, 0.32, 1]] as const) grass(gp, x, z, ['#d8c070', '#a89048'], s, 7, x * 9);
  // A dry thorn shrub
  for (let k = 0; k < 7; k++) { const a = k * 0.9; tube(gp, [[-0.26, 0.0, -0.18], [-0.26 + Math.cos(a) * 0.04, 0.08, -0.18 + Math.sin(a) * 0.04], [-0.26 + Math.cos(a) * 0.09, 0.13 + (k % 3) * 0.02, -0.18 + Math.sin(a) * 0.09]], 0.005, 0.0025, '#6a4a32'); }
  for (const [x, y, z] of [[-0.2, 0.13, -0.15], [-0.3, 0.14, -0.13], [-0.25, 0.15, -0.24]]) blob(gp, '#8a9a4a', x, y, z, 0.03, 0.022, 0.03, undefined, [0, 0, 0], 8);
  const fur: Paint = (x, y, z, _nx, ny, nz) => {
    let col = nz > 0.35 ? mx(c, pale, sst(0.35, 0.8, nz) * 0.75) : c;
    col = mx(col, sh(c, 0.72), sst(0.6, 0.95, Math.sin(y * 160)) * sst(-0.2, -0.6, nz) * 0.5); // faint back bands
    return speck(col, x, y, z, 0.08);
  };
  const kat = (pos: V3, yaw: number, sc: number, look: number) => {
    const k = grp(gp, pos, [0, yaw, 0]);
    k.scale.setScalar(sc);
    spine(k, [
      { p: [0, 0.035, -0.035], w: 0.025, h: 0.025 }, { p: [0, 0.06, -0.03], w: 0.058, h: 0.055 }, { p: [0, 0.12, -0.012], w: 0.062, h: 0.056 },
      { p: [0, 0.2, 0.0], w: 0.052, h: 0.048 }, { p: [0, 0.27, 0.01], w: 0.042, h: 0.04 }, { p: [0, 0.32, 0.018], w: 0.032, h: 0.032 }, { p: [0, 0.345, 0.022], w: 0.02, h: 0.02 },
    ], c, fur, { nv: 20, side: [1, 0, 0] });
    // haunches, long hind feet, slender tail propping behind
    for (const sx of [-1, 1]) {
      blob(k, c, sx * 0.042, 0.06, -0.015, 0.032, 0.05, 0.045, fur, [0.3, 0, 0], 12);
      limb(k, c, [[[sx * 0.05, 0.04, 0.0], 0.018, 0.02], [[sx * 0.045, 0.018, 0.03], 0.012, 0.012], [[sx * 0.042, 0.008, 0.07], 0.01, 0.008]], fur, 8);
      // arms held in front of the chest with dangling paws
      limb(k, c, [[[sx * 0.035, 0.29, 0.02], 0.014, 0.016], [[sx * 0.04, 0.245, 0.05], 0.011, 0.012], [[sx * 0.03, 0.225, 0.062], 0.009, 0.009]], fur, 8);
      el(k, dark, sx * 0.028, 0.214, 0.064, 0.008, 0.01, 0.007);
    }
    tube(k, [[0, 0.04, -0.06], [0.0, 0.015, -0.12], [0.02, 0.008, -0.2], [0.05, 0.008, -0.26]], 0.014, 0.004, c, (x, y, z) => (z < -0.23 ? dark : speck(c, x, y, z, 0.06)));
    // head: rounded skull, tapering snout, dark eye patches, black nose, tiny dark ears
    const h = grp(k, [0, 0.37, 0.03], [0.1, look, 0]);
    const hp: Paint = (x, y, z, _nx, ny) => speck(mx(c, pale, sst(0.0, 0.03, z) * 0.6 + sst(-0.3, -0.8, ny) * 0.3), x, y, z, 0.06);
    blob(h, c, 0, 0, 0, 0.034, 0.032, 0.036, hp, [0, 0, 0], 16);
    sw(h, [{ p: [0, -0.004, 0.02], w: 0.024, h: 0.022 }, { p: [0, -0.01, 0.05], w: 0.014, h: 0.013 }, { p: [0, -0.014, 0.075], w: 0.007, h: 0.007 }], c, hp, { radial: 12, sub: 3, caps: true });
    el(h, '#141010', 0, -0.012, 0.079, 0.006, 0.005, 0.005);
    for (const sx of [-1, 1]) {
      el(h, '#2a1a12', sx * 0.02, 0.006, 0.026, 0.011, 0.012, 0.007, sx * 0.5);
      bead(h, sx * 0.022, 0.008, 0.03, 0.006);
      el(h, dark, sx * 0.033, 0.006, -0.012, 0.007, 0.01, 0.006, sx * 1.2);
    }
  };
  kat([-0.02, 0.05, -0.02], 0.35, 1.25, -0.5);
  kat([0.19, 0.03, -0.02], -0.2, 0.85, 0.5);
};

/** Ring-tailed lemur: grey coat, white mask with black eye patches, amber eyes and a huge black-and-white ringed tail held high. */
const lemur: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#9a9590', back = '#9a8070', white = '#f4f2ee', blk = '#16161a';
  ground(gp, 0.43, 0.42, ['#a88a5e', '#8a7a4e', '#c0a272'], { seed: 31 });
  rock(gp, '#b08a62', -0.05, 0.0, -0.02, 0.26, 0.09, 0.2, 0.3, '#8a9a4a');
  rock(gp, '#9a7a56', 0.26, 0.0, -0.2, 0.09, 0.07, 0.08, 1.1);
  for (const [x, z, s] of [[-0.3, 0.22, 1.5], [0.3, 0.2, 1.4], [0.32, -0.05, 1.2], [-0.32, -0.2, 1.3], [0.05, 0.32, 1]] as const) grass(gp, x, z, ['#9ab050', '#5a7a30'], s, 8, x * 9);
  const L = grp(gp, [-0.02, 0.085, 0.0], [0, 0.5, 0]);
  const fur: Paint = (x, y, z, _nx, ny) => {
    let col = ny > 0.3 ? mx(c, back, sst(0.3, 0.8, ny) * 0.75) : ny < -0.3 ? mx(c, white, sst(-0.3, -0.8, ny) * 0.85) : c;
    col = mx(col, white, sst(0.08, 0.14, z) * sst(0.15, -0.4, ny) * 0.6); // pale chest
    return speck(col, x, y, z, 0.07);
  };
  // Walking on all fours, rump slightly higher
  spine(L, [
    { p: [0, 0.2, -0.15], w: 0.03, h: 0.03 }, { p: [0, 0.205, -0.125], w: 0.06, h: 0.06 }, { p: [0, 0.2, -0.05], w: 0.068, h: 0.068 },
    { p: [0, 0.19, 0.04], w: 0.06, h: 0.06 }, { p: [0, 0.195, 0.1], w: 0.055, h: 0.058 }, { p: [0, 0.205, 0.13], w: 0.035, h: 0.04 },
  ], c, fur, { nv: 22 });
  const legs: [number, boolean, number][] = [[-1, true, 0.03], [1, true, -0.03], [-1, false, -0.03], [1, false, 0.03]];
  for (const [sx, front, st] of legs) {
    const x = sx * 0.045, z0 = front ? 0.1 : -0.11;
    if (front) limb(L, c, [[[x * 0.8, 0.2, z0], 0.026, 0.03], [[x * 1.1, 0.12, z0 + 0.01 + st * 0.5], 0.018, 0.02], [[x * 1.1, 0.04, z0 + st], 0.014, 0.014], [[x * 1.15, 0.012, z0 + st + 0.012], 0.013, 0.016]], fur, 10);
    else limb(L, c, [[[x * 0.9, 0.2, z0], 0.036, 0.045], [[x * 1.2, 0.13, z0 + 0.03], 0.026, 0.03], [[x * 1.15, 0.07, z0 - 0.03 + st * 0.5], 0.016, 0.016], [[x * 1.15, 0.025, z0 + st], 0.013, 0.013], [[x * 1.15, 0.012, z0 + st + 0.02], 0.013, 0.018]], fur, 10);
    toes(L, blk, [x * 1.15, 0.008, z0 + st + (front ? 0.022 : 0.032)], 0, 4, 0.016, 0.0035, 0.35, undefined, 0.008);
  }
  // The famous tail: 13 alternating rings rising in a question-mark curl
  const curve = new THREE.CatmullRomCurve3([[0, 0.21, -0.15], [0, 0.26, -0.22], [0, 0.38, -0.26], [0, 0.5, -0.24], [0, 0.58, -0.16], [0, 0.57, -0.08], [0, 0.52, -0.06]].map(q => new THREE.Vector3(q[0], q[1], q[2])));
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = curve.getPoint(i / N), b = curve.getPoint((i + 1) / N), w = 0.027 * (1 - (i / N) * 0.35);
    const col = i === N - 1 || i % 2 === 1 ? blk : white;
    sw(L, [{ p: [a.x, a.y, a.z], w }, { p: [b.x, b.y, b.z], w: w * 0.98 }], col, (x, y, z) => speck(col, x, y, z, 0.06), { radial: 12, sub: 1, caps: true });
  }
  // Head: grey crown, white face mask, black triangular eye patches, black fox-like muzzle, amber eyes
  const h = grp(L, [0, 0.235, 0.15], [0.15, -0.55, 0]);
  const fp: Paint = (x, y, z, _nx, ny) => {
    let col = mx(white, '#5a5a5e', sst(0.02, 0.045, y + z * 0.3) * 0.8);
    col = mx(col, c, sst(-0.0, -0.03, z) * 0.8);
    return speck(col, x, y, z, 0.04 + ny * 0);
  };
  blob(h, white, 0, 0, 0, 0.042, 0.04, 0.042, fp, [0, 0, 0], 18);
  sw(h, [{ p: [0, -0.008, 0.025], w: 0.028, h: 0.026 }, { p: [0, -0.016, 0.055], w: 0.017, h: 0.016 }, { p: [0, -0.022, 0.08], w: 0.009, h: 0.009 }], white,
    (x, y, z) => mx(white, blk, sst(0.05, 0.065, z)), { radial: 12, sub: 3, caps: true });
  el(h, blk, 0, -0.02, 0.084, 0.008, 0.006, 0.006);
  for (const sx of [-1, 1]) {
    el(h, blk, sx * 0.021, 0.006, 0.03, 0.015, 0.012, 0.008, sx * 0.5, 0, sx * 0.5);
    eye(h, sx * 0.022, 0.008, 0.035, 0.0085, sx * 0.45, '#e88a1a', undefined, 0.42);
    const e = ear(h, [sx * 0.03, 0.03, -0.012], [-0.15, sx * 0.3, -sx * 0.55], 0.014, 0.036, '#6a6a6e', white, true);
    e.scale.setScalar(1);
  }
};

/** Golden snub-nosed monkey: shaggy golden-orange fur, sky-blue face with an upturned nose; on a snowy log in the Qinling mountains. */
const snubmonkey: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#e08a2e', gold = '#f2b450', blue = '#8fb8dc', cream = '#f4ead8';
  ground(gp, 0.43, 0.42, ['#e8eef2', '#d4dde4', '#b8b0a0'], { seed: 37, paint: (x, y, z) => speck(mx('#eef4f8', '#8a7a62', sst(0.62, 0.8, vnoise(x * 10, 3, z * 10)) * 0.7), x, y, z, 0.02) });
  // Snow-dusted fallen log
  const bark = '#5a4232';
  sw(gp, [{ p: [-0.36, 0.07, -0.06], w: 0.075 }, { p: [-0.1, 0.075, 0.0], w: 0.08 }, { p: [0.16, 0.07, 0.04], w: 0.075 }, { p: [0.34, 0.06, 0.06], w: 0.065 }], bark,
    (x, y, z, nx, ny, nz) => (ny > 0.55 && vnoise(x * 18, 1, z * 18) > 0.35 ? mx('#f4f8fb', '#dfe8ee', vnoise(x * 40, y * 40, z * 40)) : barkP(bark, 1.3)(x, y * 0.3, z, nx, ny, nz)), { radial: 16, sub: 5, up: [0, 0, 1], caps: true });
  el(gp, '#c8a07a', -0.36, 0.07, -0.06, 0.005, 0.07, 0.07, 1.2);
  for (const [x, z, h] of [[-0.3, -0.26, 0.2], [0.3, -0.24, 0.16]]) for (let k = 0; k < 4; k++) {
    const y = 0.02 + k * h * 0.22, rr = h * 0.32 * (1 - k * 0.22);
    blob(gp, '#2f5a3a', x, y + h * 0.1, z, rr, h * 0.16, rr, (_x, _y, _z, _nx, ny) => (ny > 0.5 ? '#eef4f8' : '#2f5a3a'), [0, k, 0], 9);
  }
  const m = grp(gp, [0.0, 0.135, 0.0], [0, -0.35, 0]);
  m.scale.setScalar(1.3);
  const fur: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, gold, sst(-0.2, 0.6, ny) * 0.5 + sst(0.3, 0.75, vnoise(x * 40, y * 40, z * 40)) * 0.3);
    col = mx(col, '#8a6a4a', sst(0.1, 0.0, y) * 0.3);
    return speck(col, x, y, z, 0.08);
  };
  spine(m, [
    { p: [0, 0.0, -0.01], w: 0.04, h: 0.04 }, { p: [0, 0.03, -0.01], w: 0.085, h: 0.075 }, { p: [0, 0.1, 0.0], w: 0.09, h: 0.08 },
    { p: [0, 0.17, 0.005], w: 0.08, h: 0.07 }, { p: [0, 0.23, 0.01], w: 0.07, h: 0.058 }, { p: [0, 0.26, 0.012], w: 0.04, h: 0.04 },
  ], c, fur, { nv: 22 });
  // Long shaggy golden mantle over shoulders and back
  const mant: Paint = (x, y, z) => speck(mx(gold, '#f8d080', sst(0.4, 0.8, vnoise(x * 60, y * 20, z * 60)) * 0.6), x, y, z, 0.06);
  blob(m, gold, 0, 0.2, -0.005, 0.1, 0.06, 0.082, mant, [0, 0, 0], 18);
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * (0.2 + (i / 21) * 1.6) + Math.PI * 0.5, rr = 0.088, y0 = 0.22 - (i % 3) * 0.02;
    const b0: V3 = [Math.sin(a) * rr, y0, Math.cos(a) * rr * 0.85];
    drop(m, [gold, '#f6c470', '#e8a040'][i % 3], b0, [b0[0] * 1.12, y0 - 0.12 - (i % 2) * 0.035, b0[2] * 1.12], 0.022, 0.008);
  }
  // Legs folded on the log, arms resting on the knees
  for (const sx of [-1, 1]) {
    limb(m, c, [[[sx * 0.05, 0.03, 0.0], 0.04, 0.04], [[sx * 0.075, 0.05, 0.09], 0.032, 0.032], [[sx * 0.07, -0.02, 0.12], 0.022, 0.022], [[sx * 0.065, -0.06, 0.13], 0.02, 0.02]], fur, 10);
    el(m, '#3a3a3e', sx * 0.065, -0.07, 0.14, 0.018, 0.012, 0.024);
    limb(m, c, [[[sx * 0.065, 0.19, 0.01], 0.028, 0.028], [[sx * 0.09, 0.12, 0.05], 0.024, 0.024], [[sx * 0.04, 0.08, 0.1], 0.018, 0.018]], fur, 10);
    el(m, '#3a3a3e', sx * 0.03, 0.08, 0.11, 0.016, 0.01, 0.018);
  }
  tube(m, [[0, 0.01, -0.06], [0.02, -0.06, -0.1], [0.03, -0.12, -0.08], [0.06, -0.13, 0.0]], 0.016, 0.01, c, fur);
  // Head: golden ruff, dark crown, pale blue face, white muzzle and lips, upturned nose
  const h = grp(m, [0, 0.31, 0.02], [0.1, -0.15, 0]);
  blob(h, c, 0, 0, -0.005, 0.058, 0.056, 0.052, fur, [0, 0, 0], 18);
  for (let i = 0; i < 10; i++) { const a = (i / 9 - 0.5) * 2.6; drop(h, i % 2 ? gold : '#f6c470', [Math.sin(a) * 0.045, Math.cos(a) * 0.035 - 0.005, 0.01], [Math.sin(a) * 0.075, Math.cos(a) * 0.06 - 0.01, 0.0], 0.016); }
  el(h, '#7a4a28', 0, 0.045, 0.0, 0.03, 0.014, 0.035);
  blob(h, blue, 0, 0.002, 0.04, 0.038, 0.04, 0.02, (x, y, z) => speck(mx(blue, '#b4d2ec', sst(0.0, 0.02, y)), x, y, z, 0.03), [0, 0, 0], 16);
  blob(h, cream, 0, -0.03, 0.05, 0.03, 0.02, 0.02, undefined, [0, 0, 0], 14);
  el(h, '#f0c8c0', 0, -0.035, 0.068, 0.018, 0.007, 0.006);
  blob(h, blue, 0, -0.002, 0.062, 0.013, 0.012, 0.01, undefined, [-0.4, 0, 0], 10);
  for (const sx of [-1, 1]) {
    el(h, '#1a1a2a', sx * 0.006, 0.004, 0.071, 0.003, 0.004, 0.003);
    eye(h, sx * 0.02, 0.018, 0.054, 0.0085, sx * 0.3, '#3a2414', blue);
    el(h, cream, sx * 0.05, 0.005, 0.0, 0.012, 0.018, 0.008);
  }
};

/** Bull moose: towering dark-brown deer with a shoulder hump, droopy muzzle, dewlap and broad palmate antlers; wading a boreal bog. */
const moose: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#4a3526', dk = sh(c, 0.7), leg = '#8a7a6a';
  ground(gp, 0.44, 0.44, ['#6a7a3a', '#4f6430', '#8a7a4a'], { seed: 41 });
  water(gp, 0.22, 0.16, [[0.18, 0.18, 0.04]], '#3f6a6a', 0.16, 0.16, -0.012);
  for (const [x, z, s] of [[-0.32, 0.18, 1.6], [-0.3, -0.2, 1.4], [0.33, -0.1, 1.5], [0.0, 0.34, 1.2], [0.32, 0.26, 1.3]] as const) grass(gp, x, z, ['#a8a050', '#6a7a38'], s, 8, x * 9);
  for (const [x, z, h] of [[-0.28, -0.3, 0.28], [-0.35, -0.08, 0.2]]) {
    tube(gp, [[x, 0, z], [x, h, z]], 0.008, 0.004, '#4a3424');
    for (let k = 0; k < 4; k++) { const y = 0.04 + k * h * 0.22, rr = h * 0.3 * (1 - k * 0.22); blob(gp, '#2a4a30', x, y + h * 0.08, z, rr, h * 0.14, rr, (px, py, pz) => speck('#2f5434', px, py, pz, 0.08), [0, k, 0], 9); }
  }
  const M = grp(gp, [-0.02, 0.0, 0.0], [0, 1.1, 0]);
  const fur: Paint = (x, y, z, _nx, ny) => speck(mx(ny > 0.5 ? mx(c, '#2e2018', 0.35) : c, dk, sst(-0.2, -0.8, ny) * 0.5), x, y, z, 0.07);
  // Torso: ellipse-profile loft with rounded ends, deep high chest tapering to a lower, narrower rump
  const z0 = -0.285, z1 = 0.215, tst: SpSt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, e = Math.max(0.12, Math.pow(1 - (2 * t - 1) ** 2, 0.42)), f = sst(0.25, 0.8, t);
    tst.push({ p: [0, 0.445 + 0.045 * f, z0 + (z1 - z0) * t], w: e * (0.072 + 0.024 * f), h: e * (0.078 + 0.05 * f) });
  }
  spine(M, tst, c, fur, { nv: 26, nu: 48, shape: (u, a) => 1 + 0.12 * Math.max(0, -Math.sin(a)) * sst(0.45, 0.8, u) });
  // Muscular shoulder hump sloping back from the withers
  blob(M, c, 0, 0.565, 0.085, 0.058, 0.06, 0.13, fur, [-0.28, 0, 0], 18);
  const legP: Paint = (x, y, z, nx, ny, nz) => (y > 0.36 ? fur(x, y, z, nx, ny, nz) : speck(mx(leg, c, sst(0.28, 0.36, y)), x, y, z, 0.06));
  const L = (sx: number, front: boolean, st: number) => {
    const x = sx * 0.055;
    if (front) limb(M, c, [[[x * 0.5, 0.46, 0.12], 0.045, 0.06], [[x * 1.0, 0.38, 0.13], 0.036, 0.05], [[x, 0.27, 0.13 + st * 0.3], 0.024, 0.03], [[x, 0.15, 0.13 + st * 0.6], 0.018, 0.022], [[x, 0.06, 0.13 + st], 0.015, 0.017], [[x, 0.025, 0.14 + st], 0.017, 0.019]], legP, 10);
    else limb(M, c, [[[x * 0.45, 0.43, -0.15], 0.045, 0.07], [[x * 1.0, 0.36, -0.13], 0.042, 0.065], [[x * 1.05, 0.27, -0.13 + st * 0.3], 0.026, 0.04], [[x, 0.19, -0.19 + st * 0.6], 0.018, 0.024], [[x, 0.07, -0.17 + st], 0.015, 0.017], [[x, 0.025, -0.16 + st], 0.017, 0.019]], legP, 10);
    hoof(M, '#24201c', x, (front ? 0.155 : -0.145) + st, 0.02);
  };
  L(-1, true, 0.04); L(1, true, -0.03); L(-1, false, -0.03); L(1, false, 0.03);
  tube(M, [[0, 0.47, -0.27], [0, 0.43, -0.285]], 0.012, 0.009, dk);
  // Thick neck blending out of the chest and hump
  sw(M, [{ p: [0, 0.5, 0.1], w: 0.075, h: 0.1 }, { p: [0, 0.54, 0.19], w: 0.06, h: 0.085 }, { p: [0, 0.56, 0.25], w: 0.05, h: 0.068 }, { p: [0, 0.565, 0.285], w: 0.044, h: 0.056 }], c, fur, { radial: 16, sub: 5 });
  // Long head held forward, muzzle sloping down and overhanging the chin
  const HP = 0.55, h = grp(M, [0, 0.565, 0.29], [HP, 0.3, 0]);
  const hp: Paint = (x, y, z, _nx, ny) => speck(mx(c, '#3a2a20', sst(0.06, 0.14, z) * 0.6 + sst(-0.3, -0.8, ny) * 0.2), x, y, z, 0.06);
  sw(h, [{ p: [0, 0.0, -0.03], w: 0.042, h: 0.05 }, { p: [0, 0.0, 0.05], w: 0.035, h: 0.046 }, { p: [0, -0.008, 0.12], w: 0.033, h: 0.046 }, { p: [0, -0.01, 0.17], w: 0.037, h: 0.05 }], c, hp, { radial: 16, sub: 4 });
  blob(h, c, 0, -0.008, 0.18, 0.042, 0.05, 0.038, hp, [0.1, 0, 0], 16); // bulbous overhanging muzzle
  blob(h, c, 0, -0.045, 0.15, 0.028, 0.02, 0.035, hp, [0, 0, 0], 12); // chin tucked under the lip
  for (const sx of [-1, 1]) {
    el(h, '#141010', sx * 0.019, 0.0, 0.212, 0.008, 0.013, 0.006, sx * 0.4);
    eye(h, sx * 0.037, 0.022, 0.03, 0.008, sx * 1.2, '#2a1a10', c);
    ear(h, [sx * 0.046, 0.026, -0.045], [-0.4, sx * 0.5, -sx * 1.3], 0.02, 0.05, sh(c, 0.85), '#8a7060', true);
  }
  el(h, '#2a1e18', 0, -0.05, 0.19, 0.03, 0.004, 0.016);
  // Dewlap ("bell") hanging from the throat
  drop(M, dk, [0, 0.52, 0.29], [0, 0.4, 0.3], 0.009, 0.017);
  // Palmate antlers on the skull: level group cancels the head pitch, then pedicle → beam → broad palm with rim tines
  const ant = '#d4c09a', antB = mx(ant, '#6a5a44', 0.4);
  const A = grp(h, [0, 0.042, -0.012], [-HP, 0, 0], 'XYZ');
  for (const sx of [-1, 1]) {
    tube(A, [[sx * 0.015, -0.01, 0], [sx * 0.045, 0.01, -0.005], [sx * 0.08, 0.022, -0.01]], 0.013, 0.011, antB);
    drop(A, ant, [sx * 0.05, 0.012, -0.002], [sx * 0.07, 0.02, 0.055], 0.008, 0.006); // brow tine
    // Broad cupped palm raised ~35° and tipped back so it reads as a wide shovel from the side
    const P = grp(A, [sx * 0.078, 0.022, -0.01], [-0.35, 0, sx * 0.62], 'XYZ');
    const pp: Paint = (x, y, z) => speck(mx(ant, '#a89070', sst(0.06, 0.0, Math.abs(x)) * 0.5), x, y, z, 0.06);
    blob(P, ant, sx * 0.065, 0.0, -0.02, 0.08, 0.012, 0.06, pp, [0, 0, 0], 18);
    blob(P, ant, sx * 0.12, 0.006, -0.03, 0.06, 0.011, 0.085, pp, [0, sx * 0.25, sx * 0.15], 18);
    for (let k = 0; k < 9; k++) {
      const t = -1.45 + k * 0.36, base: V3 = [sx * (0.12 + Math.cos(t) * 0.06), 0.006 + Math.max(0, Math.cos(t)) * 0.008, -0.03 + Math.sin(t) * 0.085];
      drop(P, ant, base, [base[0] + sx * Math.cos(t) * 0.04, 0.03, base[2] + Math.sin(t) * 0.034], 0.009, 0.005);
    }
  }
};

/** Galápagos giant tortoise: huge domed shell of bumpy scutes, long wrinkly neck and elephant legs; by a prickly-pear cactus. */
const tortoise: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#4d4a40', skin = '#7a7264';
  ground(gp, 0.44, 0.43, ['#9a8a62', '#7a7a4a', '#b0a072'], { seed: 43 });
  for (const [x, z, s] of [[-0.33, 0.15, 1.2], [0.3, 0.26, 1], [-0.12, 0.34, 0.9], [0.34, -0.05, 1.1]] as const) grass(gp, x, z, ['#a8a85a', '#6e7a3a'], s, 6, x * 9);
  for (const [x, z, sc] of [[0.3, 0.12, 0.04], [-0.32, -0.02, 0.035], [0.12, 0.34, 0.03]]) rock(gp, '#3a3634', x, 0.0, z, sc, sc * 0.7, sc * 0.85, x * 4);
  // Opuntia (prickly-pear) cactus with flat pads and yellow flowers
  const pad = (at: V3, rot: V3, sz: number, flower = false) => {
    const pg = grp(gp, at, rot, 'XYZ');
    blob(pg, '#5a8a3a', 0, sz, 0, sz * 0.75, sz, sz * 0.2, (x, y, z) => (vnoise(x * 300, y * 300, z * 300) > 0.78 ? '#d8d8a0' : speck('#5e9040', x, y, z, 0.06)), [0, 0, 0], 14);
    if (flower) { el(pg, '#f2d23a', 0, sz * 2, 0, 0.016, 0.01, 0.016); el(pg, '#e8a020', 0, sz * 2 + 0.006, 0, 0.007); }
    return pg;
  };
  tube(gp, [[-0.27, 0, -0.24], [-0.27, 0.1, -0.24]], 0.03, 0.026, '#8a7a5a', barkP('#8a7a5a'));
  pad([-0.27, 0.1, -0.24], [0, 0.3, 0], 0.07);
  pad([-0.27, 0.22, -0.24], [0, 0.3, 0.6], 0.055, true);
  pad([-0.27, 0.22, -0.24], [0, 0.3, -0.7], 0.05, true);
  pad([-0.27, 0.13, -0.24], [0, 1.6, 0.9], 0.05);
  const T = grp(gp, [0.04, 0.0, 0.03], [0, 0.35, 0]);
  T.scale.setScalar(1.08);
  // Shell: high dome of raised scutes with dark grooves and growth rings
  const shell: Paint = (x, y, z) => {
    const [f1, f2] = worley(x * 8, y * 8 + 0.5, z * 8), edge = f2 - f1;
    let col = mx(c, mx(c, '#8a7a5a', 0.5), sst(0.8, 0.15, f1) * 0.7);
    col = mx(col, sh(c, 0.7), sst(0.3, 0.6, Math.abs(Math.sin(f1 * 18))) * 0.35);
    col = mx(col, '#1e1c1a', sst(0.16, 0.05, edge));
    return speck(col, x, y, z, 0.04);
  };
  blob(T, c, 0, 0.17, -0.02, 0.22, 0.17, 0.27, shell, [0.05, 0, 0], 52);
  blob(T, sh(c, 0.85), 0, 0.09, -0.02, 0.235, 0.035, 0.285, (x, y, z) => speck(mx(c, '#3a3630', 0.5), x, y, z, 0.05), [0.05, 0, 0], 24); // flared marginal rim
  const sk: Paint = (x, y, z, _nx, ny) => {
    let col = mx(skin, sh(skin, 0.7), sst(0.0, -0.7, ny) * 0.4);
    col = mx(col, sh(skin, 0.78), sst(0.6, 0.9, Math.sin(x * 260 + Math.sin(z * 120) * 2) * Math.sin(z * 260 + y * 90)) * 0.6);
    return speck(col, x, y, z, 0.06);
  };
  // Elephantine legs with blunt toenails
  for (const [sx, front] of [[-1, true], [1, true], [-1, false], [1, false]] as [number, boolean][]) {
    const z = front ? 0.15 : -0.17, x = sx * 0.16;
    limb(T, skin, [[[x * 0.8, 0.12, z * 0.85], 0.05, 0.05], [[x * 1.05, 0.07, z * 1.05], 0.048, 0.048], [[x * 1.1, 0.025, z * 1.1], 0.05, 0.05], [[x * 1.1, 0.012, z * 1.1], 0.052, 0.052]], sk, 14);
    for (let k = 0; k < 4; k++) { const a = (k - 1.5) * 0.4 + (front ? 0 : Math.PI); el(T, '#d8cca8', x * 1.1 + Math.sin(a) * 0.045, 0.012, z * 1.1 + Math.cos(a) * 0.045, 0.012, 0.009, 0.012); }
  }
  // Long neck reaching forward and up; beaked, wrinkly head
  sw(T, [{ p: [0, 0.12, 0.2], w: 0.055, h: 0.05 }, { p: [0, 0.15, 0.27], w: 0.04, h: 0.04 }, { p: [0, 0.2, 0.33], w: 0.034, h: 0.034 }, { p: [0, 0.24, 0.37], w: 0.032, h: 0.032 }], skin, sk, { radial: 14, sub: 5 });
  const h = grp(T, [0, 0.255, 0.385], [0.2, -0.35, 0]);
  blob(h, skin, 0, 0, 0.0, 0.04, 0.036, 0.05, sk, [0, 0, 0], 16);
  blob(h, skin, 0, -0.008, 0.036, 0.03, 0.026, 0.026, sk, [0, 0, 0], 12);
  el(h, '#3a342e', 0, -0.022, 0.045, 0.026, 0.004, 0.022);
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.03, 0.01, 0.02, 0.0085, sx * 0.9, '#2a2016', sh(skin, 0.8));
    el(h, '#2a2420', sx * 0.008, 0.002, 0.06, 0.003);
  }
};

/** Japanese macaque ("snow monkey"): red face and thick grey-tan fur, soaking in a steaming hot spring among snowy rocks. */
const snowmonkey: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#c9b49a', face = '#e2737a', snow = '#f4f8fb';
  ground(gp, 0.44, 0.43, [snow, '#e2eaf0', '#b8c4cc'], { seed: 47 });
  // Rocky rim of the pool, capped with snow
  for (let i = 0; i < 11; i++) {
    const a = i * 0.571 + 0.2, rr = 0.3 + (i % 3) * 0.03, x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.92, sc = 0.07 + (i % 4) * 0.012;
    blob(gp, '#5a5856', x, 0.01, z, sc, sc * 0.7, sc * 0.85, (px, py, pz, _nx, ny) => (ny > 0.45 + vnoise(px * 30, py * 30, pz * 30) * 0.3 ? mx(snow, '#dce6ee', vnoise(px * 50, 1, pz * 50)) : speck(mx('#5e5a56', '#3a3836', vnoise(px * 30, py * 30, pz * 30)), px, py, pz, 0.08)), [0.1, a, 0], 12);
  }
  water(gp, 0.27, 0.25, [[0.0, 0.02, 0.15]], '#5aa8a8', 0, 0, 0.03);
  // Steam wisps
  const steam = mat('#ffffff', { transparent: 0.3, flat: false });
  for (const [x, y, z, s] of [[-0.14, 0.12, -0.12, 0.05], [-0.1, 0.2, -0.16, 0.04], [0.16, 0.14, -0.1, 0.045], [0.12, 0.24, -0.14, 0.035], [-0.16, 0.08, 0.1, 0.04]]) { const st = el(gp, '#ffffff', x, y, z, s, s * 0.7, s); st.material = steam; }
  const m = grp(gp, [0.0, 0.0, 0.0], [0, -0.4, 0]);
  m.scale.setScalar(1.25);
  const fur: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, '#9a8a78', sst(0.3, 0.8, vnoise(x * 30, y * 30, z * 30)) * 0.6);
    col = mx(col, sh(c, 0.62), sst(0.08, 0.04, y) * 0.8); // wet fur at the waterline
    return speck(mx(col, '#e8dccb', sst(0.5, 1, ny) * 0.3), x, y, z, 0.09);
  };
  spine(m, [
    { p: [0, -0.02, 0.0], w: 0.08, h: 0.07 }, { p: [0, 0.06, 0.0], w: 0.095, h: 0.08 }, { p: [0, 0.14, 0.005], w: 0.09, h: 0.075 },
    { p: [0, 0.2, 0.01], w: 0.075, h: 0.062 }, { p: [0, 0.235, 0.012], w: 0.045, h: 0.04 },
  ], c, fur, { nv: 22 });
  // Shaggy fur shoulders
  blob(m, c, 0, 0.175, 0.0, 0.1, 0.06, 0.075, fur, [0, 0, 0], 18);
  for (let i = 0; i < 16; i++) { const a = (i / 15) * Math.PI * 1.6 - Math.PI * 0.3 + Math.PI * 0.5, b0: V3 = [Math.sin(a) * 0.07, 0.19 - (i % 2) * 0.03, Math.cos(a) * 0.055]; drop(m, i % 2 ? c : '#ddd0bc', b0, [b0[0] * 1.3, b0[1] - 0.06, b0[2] * 1.25], 0.02); }
  // Arms resting on the rim, hands in front
  for (const sx of [-1, 1]) {
    limb(m, c, [[[sx * 0.075, 0.165, 0.0], 0.032, 0.032], [[sx * 0.12, 0.1, 0.06], 0.026, 0.026], [[sx * 0.08, 0.075, 0.12], 0.02, 0.02]], fur, 10);
    el(m, '#c87870', sx * 0.07, 0.072, 0.135, 0.018, 0.01, 0.022);
  }
  // Head: fluffy grey-tan, snow cap, red heart-shaped face
  const h = grp(m, [0, 0.29, 0.015], [0.15, -0.1, 0]);
  blob(h, c, 0, 0, -0.005, 0.062, 0.058, 0.056, fur, [0, 0, 0], 18);
  for (let i = 0; i < 12; i++) { const a = (i / 11 - 0.5) * 3.2; drop(h, i % 2 ? '#ddd0bc' : c, [Math.sin(a) * 0.05, Math.cos(a) * 0.04 - 0.01, 0.015], [Math.sin(a) * 0.075, Math.cos(a) * 0.065 - 0.015, 0.005], 0.017); }
  blob(h, snow, 0.006, 0.052, -0.01, 0.042, 0.018, 0.038, (x, y, z) => speck(snow, x, y, z, 0.03), [0.1, 0, 0.1], 14);
  const fp: Paint = (x, y, z) => speck(mx(face, '#c84a56', sst(0.0, -0.03, y) * 0.5), x, y, z, 0.04);
  blob(h, face, 0, 0.0, 0.04, 0.04, 0.042, 0.024, fp, [0, 0, 0], 16);
  blob(h, face, 0, -0.022, 0.052, 0.024, 0.02, 0.018, fp, [0, 0, 0], 12);
  el(h, '#b84050', 0, 0.022, 0.056, 0.03, 0.007, 0.01); // brow ridge
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.016, 0.01, 0.058, 0.0075, sx * 0.25, '#7a4a20', face);
    el(h, '#5a1e24', sx * 0.005, -0.012, 0.07, 0.003, 0.0025, 0.002);
    ear(h, [sx * 0.055, 0.008, 0.0], [0, sx * 0.9, 0], 0.012, 0.018, '#c88a80', '#a8605a');
  }
  el(h, '#8a2a34', 0, -0.035, 0.064, 0.012, 0.003, 0.004);
};

// ---- Pack ----
export const H_ANIMALS2: Record<string, Builder> = {
  an_okapi: okapi,
  an_capybara: capybara,
  an_toucan: toucan,
  an_dartfrog: dartfrog,
  an_axolotl: axolotl,
  an_platypus: platypus,
  an_seaotter: seaotter,
  an_walrus: walrus,
  an_narwhal: narwhal,
  an_manta: manta,
  an_meerkat: meerkat,
  an_lemur: lemur,
  an_snubmonkey: snubmonkey,
  an_moose: moose,
  an_tortoise: tortoise,
  an_snowmonkey: snowmonkey,
};
