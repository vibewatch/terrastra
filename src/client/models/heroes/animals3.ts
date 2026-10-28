import * as THREE from 'three';
import type { Builder, Paint, V3 } from '../prims.ts';
import { add, mat, g, sweep as sweep0, slab, vnoise, fbm, hash3, worley } from '../prims.ts';
import { type LS, type SpSt, VCM, barkP, leaf, lerp3, lit, mx, psurf, sh, speck, sst, vpaint } from '../kit/sculpt.ts';

// Wave-4 animal miniatures (pack animals3): lofted spine bodies, jointed limbs, glossy eyes and per-vertex painted
// coats on compact habitat bases. Helpers follow animals2.ts with lower default segment counts for the mobile budget
// (≤15k triangles per model). Front +z, base at y=0, the animal dominates a ~1-unit box.

/** Smooth painted ellipsoid in model space (own geometry, so paint patterns line up across parts). */
function blob(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, paint?: Paint, rot: V3 = [0, 0, 0], seg = 14): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
  geo.deleteAttribute('uv');
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), new THREE.Vector3(rx, ry, rz)));
  return vpaint(add(p, geo, VCM(), 0, 0, 0, 1, 1, 1), c, paint);
}
/** Light shared ellipsoid (eyes, toes, claws, pebbles). */
const ESEG = [[6, 5], [9, 6], [12, 8]];
function el(p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, ry0 = 0, rx0 = 0, rz0 = 0): THREE.Mesh {
  const r = Math.max(rx, ry, rz), [a, b] = ESEG[r < 0.014 ? 0 : r < 0.035 ? 1 : 2];
  return add(p, g('a3-sph' + a, () => new THREE.SphereGeometry(1, a, b)), mat(c, { flat: false }), x, y, z, rx, ry, rz, ry0, rx0, rz0);
}
/** Smooth vertex-painted sweep through stations (limbs, necks, tails, beaks). */
function sw(p: THREE.Object3D, st: { p: V3; w: number; h?: number }[], c: string, paint?: Paint, o: { radial?: number; sub?: number; up?: V3; caps?: boolean } = {}): THREE.Mesh {
  const m = sweep0(p, st, c, { radial: o.radial ?? 10, sub: o.sub ?? 4, up: o.up, caps: o.caps, flat: false });
  return paint ? vpaint(m, c, paint) : m;
}
/** Limb loft through joint stations [point, lateral half-width, front-back half-depth]. */
const limb = (p: THREE.Object3D, c: string, st: LS[], paint?: Paint, radial = 10) =>
  sw(p, st.map(([pt, w, h]) => ({ p: pt, w, h: h ?? w })), c, paint, { radial, sub: 4, up: [0, 0, 1] });
/** Tube with ball ends. */
function tube(p: THREE.Object3D, pts: V3[], r0: number, r1: number, c: string, paint?: Paint, radial = 8): THREE.Mesh {
  const m = sw(p, pts.map((pt, i) => ({ p: pt, w: r0 + (r1 - r0) * (i / Math.max(1, pts.length - 1)) })), c, paint, { radial, sub: 3 });
  el(p, c, ...pts[pts.length - 1], r1 * 0.98);
  return m;
}
/** Body lofted along a spine with elliptical sections; `shape(u, a)` returns a radial multiplier (a = angle, π/2 = up). */
function spine(p: THREE.Object3D, st: SpSt[], c: string, paint?: Paint, o: { nu?: number; nv?: number; side?: V3; shape?: (u: number, a: number) => number } = {}): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(...s.p)), false, 'centripetal');
  const nu = o.nu ?? (st.length - 1) * 5, nv = o.nv ?? 18;
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
const DROP = () => g('a3-drop', () => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector2(Math.max(1e-4, 0.5 * Math.sin(Math.PI * Math.pow(t, 0.62))), t)); }
  const lg = new THREE.LatheGeometry(pts, 6);
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
/** Glossy eye: dark rim, iris, pupil, catch-light, optional lid; looks along local +z rotated by yaw. */
function eye(p: THREE.Object3D, x: number, y: number, z: number, r: number, yaw: number, iris: string, lid?: string, pupil = 0.5): void {
  const e = grp(p, [x, y, z], [0, yaw, 0]);
  el(e, '#17110d', 0, 0, -r * 0.05, r * 1.16, r * 1.04, r * 0.7);
  el(e, iris, 0, 0, r * 0.1, r, r * 0.95, r * 0.6);
  el(e, '#070707', 0, 0, r * 0.36, r * pupil, r * pupil * 1.1, r * 0.34);
  lit(el(e, '#ffffff', r * 0.34, r * 0.36, r * 0.6, r * 0.2));
  if (lid) el(e, lid, 0, r * 0.7, r * 0.02, r * 1.28, r * 0.5, r * 0.86, 0, -0.28);
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
  }), [0, 0, 0], 24);
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
  }, [0, yaw, 0], 12);
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
  }, [0, 0, 0], 28);
}
/** Broad tropical leaf with a midrib, lying from `at` along yaw, drooping. */
function bigLeaf(gp: THREE.Object3D, at: V3, yaw: number, len: number, wid: number, c: string, droop = 0.4, pitch = 0.3): void {
  const lg = grp(gp, at, [0, yaw, 0]);
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([0, Math.sin(pitch) * len * t - droop * len * t * t, Math.cos(pitch) * len * t]); }
  // Leaf blade as a thin flattened sweep (wide in x, thin in y)
  sw(lg, pts.map((pt, i) => ({ p: pt, w: wid * Math.sin(Math.PI * Math.min(1, (i / 6) * 0.94 + 0.04)) ** 0.8, h: 0.004 })), c,
    (x, _y, z) => (Math.abs(x) < wid * 0.06 ? mx(c, '#d8e6a0', 0.5) : mx(c, sh(c, 0.8), sst(0.3, 0.9, Math.abs(Math.sin(z / len * 9 - Math.abs(x) / wid * 3))) * 0.4)),
    { radial: 6, sub: 3 });
}

// ---- Shared limb pieces ----
/** Cloven hoof (two toes with a split) at ground level. */
function hoof(gp: THREE.Object3D, c: string, x: number, z: number, r: number): void {
  for (const k of [-1, 1]) blob(gp, c, x + k * r * 0.42, r * 0.62, z + r * 0.15, r * 0.5, r * 0.62, r * 0.95, (_x, y) => (y < r * 0.25 ? sh(c, 0.75) : null), [-0.2, 0, 0], 10);
}

// ---- Extra pieces for this pack ----
const INK = '#14100d';
/** Leopard-style spot mask (0..1) from Worley cells; k = cells per unit, r = spot radius in cell units. */
const spotK = (x: number, y: number, z: number, k: number, r: number) => sst(r, r * 0.7, worley(x * k, y * k, z * k)[0]);
/** Flat-topped savanna acacia: forked trunk and layered umbrella crowns. */
function acacia(gp: THREE.Object3D, x: number, z: number, h: number, s: number, leafC = '#6f8a3a'): void {
  const bark = '#5a4636';
  tube(gp, [[x, 0, z], [x + 0.01 * s, h * 0.5, z], [x - 0.04 * s, h * 0.86, z + 0.01]], 0.014 * s, 0.008 * s, bark);
  tube(gp, [[x + 0.01 * s, h * 0.5, z], [x + 0.06 * s, h * 0.82, z - 0.02], [x + 0.09 * s, h * 0.9, z - 0.03]], 0.009 * s, 0.005 * s, bark);
  for (const [dx, dy, dz, rx] of [[-0.04, 0.9, 0.01, 0.1], [0.07, 0.93, -0.03, 0.09], [0.01, 0.98, -0.01, 0.08]] as const)
    blob(gp, leafC, x + dx * s, h * dy, z + dz * s, rx * s, 0.026 * s, rx * 0.85 * s, (px, py, pz, _nx, ny) => speck(mx(sh(leafC, 0.7), mx(leafC, '#a8b860', 0.3), sst(-0.3, 0.8, ny)), px * 2, py * 2, pz * 2, 0.12), [0, dx * 9, 0], 11);
}
/** Paw: a soft pad blob with three toe bumps (cats, dogs, devils). */
function paw(gp: THREE.Object3D, c: string, x: number, z: number, r: number, yaw = 0, claw?: string): void {
  blob(gp, c, x, r * 0.5, z, r, r * 0.6, r * 1.2, undefined, [0, yaw, 0], 9);
  for (let i = -1; i <= 1; i++) {
    const a = yaw + i * 0.45, tx = x + Math.sin(a) * r * 0.95, tz = z + Math.cos(a) * r * 0.95;
    el(gp, c, tx, r * 0.4, tz, r * 0.42, r * 0.38, r * 0.45);
    if (claw) drop(gp, claw, [tx + Math.sin(a) * r * 0.25, r * 0.35, tz + Math.cos(a) * r * 0.25], [tx + Math.sin(a) * r * 0.65, r * 0.08, tz + Math.cos(a) * r * 0.65], r * 0.14);
  }
}
/** Savanna / steppe ground with dry and green patches. */
const savanna = (gp: THREE.Object3D, seed: number, cols: [string, string, string] = ['#c9a85e', '#a88a48', '#8a8a4a'], rx = 0.46, rz = 0.44) => ground(gp, rx, rz, cols, { seed });

// ---- Species ----

/** Cheetah: slim deep-chested sprinter on long legs, small round head, black tear lines, solid spots, ringed white-tipped tail. */
const cheetah: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#d9a75a', belly = '#f2e6cc';
  savanna(gp, 3);
  acacia(gp, -0.3, -0.27, 0.3, 1.0);
  for (const [x, z, s] of [[-0.33, 0.12, 1.6], [0.32, 0.2, 1.4], [0.3, -0.24, 1.6], [-0.1, 0.34, 1.1], [0.12, -0.34, 1.3], [-0.36, -0.08, 1.2]] as const) grass(gp, x, z, ['#e0c070', '#b09048'], s, 6, x * 9 + z);
  rock(gp, '#a8907a', 0.26, 0.0, 0.04, 0.07, 0.04, 0.06, 0.6);
  const ch = grp(gp, [0.03, 0, 0.02], [0, 0.55, 0]);
  ch.scale.set(1.08, 0.94, 1.08);
  const coat: Paint = (x, y, z, nx, ny) => {
    let col = ny < -0.25 ? mx(c, belly, sst(-0.25, -0.65, ny)) : mx(c, sh(c, 1.08), sst(0.4, 1, ny) * 0.4);
    col = mx(col, INK, spotK(x, y, z, 42, 0.36) * (ny < -0.5 ? 0.3 : 0.95));
    return speck(col, x, y, z, 0.05 + nx * 0);
  };
  spine(ch, [
    { p: [0, 0.37, -0.255], w: 0.03, h: 0.03 }, { p: [0, 0.375, -0.225], w: 0.06, h: 0.07 }, { p: [0, 0.38, -0.15], w: 0.062, h: 0.074 },
    { p: [0, 0.39, -0.065], w: 0.052, h: 0.062 }, { p: [0, 0.375, 0.03], w: 0.06, h: 0.1 }, { p: [0, 0.385, 0.11], w: 0.06, h: 0.1 },
    { p: [0, 0.41, 0.165], w: 0.046, h: 0.066 }, { p: [0, 0.435, 0.185], w: 0.02, h: 0.025 },
  ], c, coat, { nv: 26, nu: 48 });
  for (const sx of [-1, 1]) {
    blob(ch, c, sx * 0.034, 0.365, -0.19, 0.04, 0.072, 0.06, coat, [0.25, 0, 0], 16);
    blob(ch, c, sx * 0.036, 0.38, 0.11, 0.032, 0.07, 0.045, coat, [-0.2, 0, 0], 16);
  }
  // Long straight forelegs, angled hind legs with high hocks
  const legP: Paint = (x, y, z, nx, ny, nz) => (y < 0.06 ? mx(c, belly, 0.4) : coat(x, y, z, nx, ny, nz));
  for (const sx of [-1, 1]) {
    const st = sx * 0.02;
    limb(ch, c, [[[sx * 0.04, 0.38, 0.11], 0.03, 0.042], [[sx * 0.044, 0.28, 0.105], 0.021, 0.028], [[sx * 0.04, 0.17, 0.11 + st], 0.014, 0.016], [[sx * 0.04, 0.07, 0.115 + st], 0.011, 0.012], [[sx * 0.04, 0.025, 0.125 + st], 0.012, 0.014]], legP, 9);
    paw(ch, sh(c, 0.95), sx * 0.04, 0.14 + st, 0.016, 0, '#2a2420');
    limb(ch, c, [[[sx * 0.042, 0.38, -0.19], 0.038, 0.06], [[sx * 0.048, 0.28, -0.14], 0.028, 0.038], [[sx * 0.045, 0.19, -0.2 - st], 0.017, 0.022], [[sx * 0.043, 0.135, -0.225 - st], 0.012, 0.016], [[sx * 0.042, 0.06, -0.205 - st], 0.011, 0.012], [[sx * 0.042, 0.025, -0.19 - st], 0.012, 0.014]], legP, 9);
    paw(ch, sh(c, 0.95), sx * 0.042, -0.175 - st, 0.016, 0, '#2a2420');
  }
  // Tail: spotted, then black rings, white tip, sweeping down and curling up
  const tailPts: V3[] = [[0, 0.385, -0.25], [0, 0.34, -0.31], [0.005, 0.25, -0.35], [0.012, 0.15, -0.36], [0.02, 0.08, -0.34], [0.03, 0.06, -0.3], [0.035, 0.085, -0.27]];
  const tc = new THREE.CatmullRomCurve3(tailPts.map(q => new THREE.Vector3(...q)));
  const tp = (i: number): V3 => { const q = tc.getPoint(i / 20); return [q.x, q.y, q.z]; };
  const tw = (i: number) => 0.016 - i * 0.00035;
  sw(ch, Array.from({ length: 12 }, (_, i) => ({ p: tp(i), w: tw(i) })), c, (x, y, z) => mx(c, INK, spotK(x, y, z, 55, 0.36)), { radial: 9, sub: 3 });
  for (let i = 11; i < 20; i++) {
    const col = i >= 18 ? '#f6f2ea' : i % 2 ? INK : '#f0e2c4';
    sw(ch, [{ p: tp(i), w: tw(i) }, { p: tp(i + 1), w: tw(i + 1) }], col, undefined, { radial: 9, sub: 1, caps: i === 19 });
  }
  // Neck and small rounded head with short muzzle
  sw(ch, [{ p: [0, 0.41, 0.13], w: 0.044, h: 0.06 }, { p: [0, 0.45, 0.19], w: 0.035, h: 0.044 }, { p: [0, 0.48, 0.235], w: 0.03, h: 0.034 }], c, coat, { radial: 14, sub: 4 });
  const h = grp(ch, [0, 0.495, 0.255], [0.1, -0.35, 0]);
  const face: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, belly, sst(-0.01, -0.025, y) * 0.9 + sst(0.035, 0.05, z) * 0.5);
    col = mx(col, INK, spotK(x, y, z, 120, 0.3) * sst(0.0, 0.02, y + z * 0.2) * 0.9);
    if (ny > 0.3) col = mx(col, sh(c, 0.95), 0.3);
    return speck(col, x, y, z, 0.04);
  };
  blob(h, c, 0, 0, 0, 0.038, 0.034, 0.04, face, [0, 0, 0], 14);
  sw(h, [{ p: [0, -0.008, 0.02], w: 0.026, h: 0.024 }, { p: [0, -0.014, 0.045], w: 0.02, h: 0.018 }, { p: [0, -0.016, 0.058], w: 0.013, h: 0.013 }], c, face, { radial: 10, sub: 3, caps: true });
  el(h, '#2a1a16', 0, -0.006, 0.062, 0.008, 0.006, 0.005);
  el(h, '#f6efe4', 0, -0.03, 0.04, 0.016, 0.008, 0.014);
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.019, 0.01, 0.032, 0.0075, sx * 0.35, '#c88a2a', c, 0.42);
    el(h, '#f8f0e0', sx * 0.019, 0.003, 0.036, 0.009, 0.003, 0.004); // pale under-eye
    tube(h, [[sx * 0.013, 0.004, 0.039], [sx * 0.016, -0.012, 0.05], [sx * 0.019, -0.026, 0.049]], 0.0028, 0.0024, INK, undefined, 5); // tear line
    ear(h, [sx * 0.026, 0.026, -0.012], [-0.2, sx * 0.4, -sx * 0.6], 0.014, 0.018, sh(c, 0.75), '#e8d8b8');
  }
};

/** White rhinoceros: barrel body with a shoulder hump, head held low with a wide square lip, two horns, tube ears. */
const rhino: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#9a958c', dk = sh(c, 0.68);
  ground(gp, 0.46, 0.44, ['#b07a52', '#9a6a46', '#8a8a4e'], { seed: 5 });
  for (const [x, z, s] of [[-0.34, 0.16, 1.4], [0.34, 0.18, 1.2], [0.3, -0.26, 1.5], [-0.3, -0.26, 1.3], [0.05, -0.38, 1.1], [-0.16, 0.36, 1]] as const) grass(gp, x, z, ['#c8b060', '#8a8a40'], s, 6, x * 7 + z);
  for (const [x, z, s] of [[0.33, -0.05, 0.05], [-0.36, -0.02, 0.04]]) rock(gp, '#9a8a78', x, 0, z, s, s * 0.6, s * 0.8, x * 5);
  blob(gp, '#5a7a3a', -0.3, 0.04, -0.3, 0.07, 0.06, 0.06, (x, y, z) => speck('#5f7e3c', x * 2, y * 2, z * 2, 0.15), [0, 0, 0], 10);
  const R = grp(gp, [0.0, 0, -0.02], [0, 0.5, 0]);
  const skin: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.3 ? mx(c, dk, sst(-0.3, -0.8, ny) * 0.6) : mx(c, sh(c, 1.1), sst(0.3, 1, ny) * 0.4);
    col = mx(col, '#9a7058', sst(0.16, 0.06, y) * 0.55); // red dust on the legs
    col = mx(col, sh(c, 0.75), sst(0.75, 0.95, Math.sin(y * 90 + Math.sin(z * 20) * 2)) * sst(0.24, 0.14, y) * 0.6); // leg wrinkles
    col = mx(col, sh(c, 0.82), sst(0.5, 0.8, fbm(x * 30, y * 30, z * 30, 2)) * 0.4);
    return speck(col, x, y, z, 0.04);
  };
  spine(R, [
    { p: [0, 0.3, -0.33], w: 0.05, h: 0.05 }, { p: [0, 0.3, -0.3], w: 0.11, h: 0.12 }, { p: [0, 0.29, -0.21], w: 0.135, h: 0.145 },
    { p: [0, 0.28, -0.09], w: 0.145, h: 0.15 }, { p: [0, 0.29, 0.03], w: 0.14, h: 0.15 }, { p: [0, 0.31, 0.12], w: 0.12, h: 0.14 }, { p: [0, 0.3, 0.17], w: 0.08, h: 0.1 },
  ], c, skin, { nv: 20 });
  blob(R, c, 0, 0.4, 0.07, 0.085, 0.06, 0.09, skin, [0, 0, 0], 12); // shoulder hump
  for (const sx of [-1, 1]) {
    blob(R, c, sx * 0.09, 0.27, 0.07, 0.06, 0.1, 0.075, skin, [0, 0, 0], 12);
    blob(R, c, sx * 0.09, 0.29, -0.22, 0.065, 0.11, 0.09, skin, [0.15, 0, 0], 12);
    // skin fold rings behind the shoulder and in front of the thigh
    el(R, sh(c, 0.86), sx * 0.13, 0.25, -0.01, 0.014, 0.1, 0.01, 0, 0, sx * 0.05);
  }
  const legs: [number, number, number][] = [[-1, 0.075, 0.02], [1, 0.075, -0.02], [-1, -0.215, -0.02], [1, -0.215, 0.02]];
  for (const [sx, z0, st] of legs) {
    const hind = z0 < 0;
    limb(R, c, [[[sx * 0.09, 0.27, z0], hind ? 0.06 : 0.055, hind ? 0.08 : 0.065], [[sx * 0.095, 0.15, z0 + (hind ? 0.02 : 0.005)], 0.045, 0.05], [[sx * 0.095, 0.07, z0 + st], 0.037, 0.04], [[sx * 0.095, 0.022, z0 + st], 0.042, 0.045]], skin, 10);
    for (let k = -1; k <= 1; k++) el(R, '#5a5048', sx * 0.095 + k * 0.022, 0.012, z0 + st + 0.036 - Math.abs(k) * 0.008, 0.013, 0.011, 0.011);
  }
  tube(R, [[0, 0.33, -0.32], [0, 0.27, -0.35], [0.01, 0.2, -0.345]], 0.012, 0.007, c, skin);
  tuft(R, '#2a2420', [0.01, 0.2, -0.345], [0, -1, 0], 0.03, 0.006, 4, 0.3);
  // Neck flowing into a long low head
  sw(R, [{ p: [0, 0.32, 0.12], w: 0.1, h: 0.12 }, { p: [0, 0.28, 0.2], w: 0.085, h: 0.1 }, { p: [0, 0.24, 0.24], w: 0.075, h: 0.09 }], c, skin, { radial: 14, sub: 3 });
  const h = grp(R, [0, 0.24, 0.24], [0.75, 0, 0]);
  const hp: Paint = (x, y, z, nx, ny, nz) => mx(skin(x, y, z, nx, ny, nz)!, sh(c, 0.85), sst(0.6, 0.9, Math.sin(z * 120 + x * 40)) * 0.25);
  sw(h, [{ p: [0, 0.0, -0.02], w: 0.07, h: 0.085 }, { p: [0, -0.005, 0.06], w: 0.062, h: 0.075 }, { p: [0, -0.012, 0.15], w: 0.052, h: 0.062 }, { p: [0, -0.02, 0.23], w: 0.056, h: 0.054 }, { p: [0, -0.024, 0.27], w: 0.062, h: 0.046 }], c, hp, { radial: 14, sub: 4, caps: true });
  // Broad square lip and nostrils
  blob(h, sh(c, 0.92), 0, -0.035, 0.27, 0.064, 0.03, 0.022, undefined, [0, 0, 0], 12);
  el(h, '#3a3430', 0, -0.05, 0.285, 0.05, 0.004, 0.01);
  for (const sx of [-1, 1]) el(h, '#2a2420', sx * 0.03, 0.0, 0.282, 0.008, 0.012, 0.005, 0, 0, sx * 0.5);
  // Horns: long curved front horn, short rear horn
  const horn: Paint = (_x, y) => mx('#7a6a58', '#b4a48c', sst(0.03, 0.2, y));
  sw(h, [{ p: [0, 0.035, 0.205], w: 0.034, h: 0.04 }, { p: [0, 0.09, 0.225], w: 0.023, h: 0.026 }, { p: [0, 0.15, 0.25], w: 0.013, h: 0.014 }, { p: [0, 0.2, 0.285], w: 0.004, h: 0.004 }], '#8a7a66', horn, { radial: 9, sub: 3, caps: true });
  sw(h, [{ p: [0, 0.045, 0.105], w: 0.03, h: 0.034 }, { p: [0, 0.08, 0.115], w: 0.016, h: 0.018 }, { p: [0, 0.105, 0.125], w: 0.004, h: 0.004 }], '#8a7a66', horn, { radial: 9, sub: 2, caps: true });
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.056, 0.005, 0.1, 0.009, sx * 1.2, '#2a1a10', sh(c, 0.9));
    const e = ear(h, [sx * 0.05, 0.065, -0.03], [-0.75, sx * 0.3, -sx * 0.4], 0.028, 0.085, sh(c, 0.95), '#6a5e54', true);
    el(e, '#2a2420', 0, 0.07, 0, 0.004, 0.012, 0.004);
  }
  // Red-billed oxpecker riding on the back
  const b = grp(R, [0.03, 0.44, -0.08], [0, 1.1, 0]);
  blob(b, '#6a5440', 0, 0.018, 0, 0.012, 0.012, 0.022, (_x, _y, _z, _nx, ny) => (ny < -0.3 ? '#c8aa84' : '#6a5440'), [-0.3, 0, 0], 8);
  el(b, '#6a5440', 0, 0.034, 0.018, 0.01);
  drop(b, '#d8281e', [0, 0.034, 0.026], [0, 0.03, 0.044], 0.004);
  for (const sx of [-1, 1]) el(b, '#f2c420', sx * 0.007, 0.037, 0.024, 0.0035);
  blade(b, '#4a3a2c', [0, 0.018, -0.018], [0, 0.012, -0.045], 0.008, 0.002, [0, 1, 0]);
};

/** Panther chameleon: casqued head, turret eyes, laterally flat banded body with a white stripe, curled tail, tongue shooting at a cricket. */
const chameleon: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#3fae4a', teal = '#1f8a8a', bar = '#7fd06a', stripe = '#f2f6e8', red = '#e0502a';
  ground(gp, 0.44, 0.42, ['#4e5a2a', '#3a4a22', '#6e5a32'], { seed: 9 });
  for (const [x, z, yaw, l, c2] of [[-0.3, -0.26, 2.4, 0.2, '#2f7a34'], [-0.3, -0.26, 3.6, 0.17, '#3f8a3a'], [0.32, -0.24, -2.4, 0.18, '#2f7034'], [0.3, 0.26, 1.2, 0.15, '#3a8a3a'], [-0.32, 0.22, 0.6, 0.14, '#2f7a34']] as const)
    bigLeaf(gp, [x, 0, z], yaw, l, 0.05, c2, 0.9, 0.9);
  for (const [x, z, s] of [[0.0, 0.34, 1.0], [0.14, -0.33, 1.2], [-0.12, -0.34, 1]] as const) grass(gp, x, z, ['#6fa040', '#3f6a26'], s, 6, x * 5);
  // Branch: rises from the ground on the left, runs across at chameleon height, with a leafy twig on the right
  const bark = '#6a5038', bp = barkP(bark, 1.3);
  sw(gp, [{ p: [-0.36, -0.01, -0.06], w: 0.035 }, { p: [-0.33, 0.14, -0.04], w: 0.026 }, { p: [-0.27, 0.27, -0.02], w: 0.02 }, { p: [-0.15, 0.32, 0.0], w: 0.017 }, { p: [0.05, 0.33, 0.01], w: 0.015 }, { p: [0.22, 0.34, 0.02], w: 0.012 }, { p: [0.33, 0.37, 0.03], w: 0.008 }], bark, bp, { radial: 9, sub: 4 });
  tube(gp, [[0.2, 0.34, 0.02], [0.27, 0.4, 0.06], [0.33, 0.43, 0.1]], 0.006, 0.004, bark);
  for (const [at, rot] of [[[0.33, 0.43, 0.1], [-0.3, 1.2, 0.2]], [[0.29, 0.41, 0.07], [0.5, 2.2, -0.6]], [[0.33, 0.37, 0.03], [-0.6, 0.4, 0.1]]] as [V3, V3][]) leaf(gp, '#4f9a3a', at, 0.03, 0.08, rot, 0.005, 0.2);
  // Cricket on the twig — the tongue's target
  const k = grp(gp, [0.335, 0.445, 0.105], [0, -0.6, 0]);
  blob(k, '#7a5a2a', 0, 0.006, 0, 0.006, 0.006, 0.016, undefined, [0, 0, 0], 8);
  el(k, '#6a4a22', 0, 0.008, 0.016, 0.006);
  for (const sx of [-1, 1]) { tube(k, [[sx * 0.004, 0.008, -0.004], [sx * 0.012, 0.022, -0.012], [sx * 0.014, 0.004, -0.024]], 0.0018, 0.0012, '#6a4a22', undefined, 4); tube(k, [[sx * 0.003, 0.012, 0.02], [sx * 0.012, 0.02, 0.04]], 0.0006, 0.0005, '#4a3418', undefined, 3); }

  const ch = grp(gp, [-0.13, 0.338, 0.008], [0, Math.PI / 2 - 0.12, 0]);
  ch.scale.setScalar(2.3);
  const skin: Paint = (x, y, z, _nx, ny) => {
    const yc = y - 0.055;
    let col = mx(c, teal, sst(0.2, 0.9, Math.sin(z * 95 + 0.8)) * 0.55); // vertical bands
    col = mx(col, bar, sst(0.75, 0.95, Math.sin(z * 95 + 2.2)) * 0.5);
    col = mx(col, stripe, sst(0.009, 0.004, Math.abs(yc + 0.012 + z * 0.05)) * sst(-0.11, -0.07, z) * 0.95); // white lateral stripe
    col = mx(col, sh(c, 0.7), sst(0.2, 0.9, -ny) * 0.4);
    const [f1] = worley(x * 600, y * 600, z * 600);
    return mx(col, sh(col, 1.18), sst(0.3, 0.1, f1) * 0.5);
  };
  spine(ch, [
    { p: [0, 0.03, -0.1], w: 0.014, h: 0.018 }, { p: [0, 0.045, -0.085], w: 0.024, h: 0.042 }, { p: [0, 0.058, -0.04], w: 0.03, h: 0.058 },
    { p: [0, 0.062, 0.02], w: 0.03, h: 0.06 }, { p: [0, 0.058, 0.065], w: 0.025, h: 0.05 }, { p: [0, 0.058, 0.09], w: 0.02, h: 0.036 },
  ], c, skin, { nv: 16 });
  // Dorsal crest of small cones
  for (let i = 0; i < 11; i++) { const z = 0.08 - i * 0.016, y = 0.058 + 0.058 * Math.cos((z - 0.0) * 6) * 0.98 - 0.002; drop(ch, '#c8e870', [0, y, z], [0, y + 0.012 - i * 0.0006, z - 0.004], 0.0035); }
  // Head with a raised casque, toothy jaw line and bulging turret eyes
  sw(ch, [{ p: [0, 0.058, 0.085], w: 0.021, h: 0.034 }, { p: [0, 0.058, 0.12], w: 0.022, h: 0.03 }, { p: [0, 0.052, 0.15], w: 0.015, h: 0.02 }, { p: [0, 0.048, 0.163], w: 0.006, h: 0.008 }], c, skin, { radial: 12, sub: 3, caps: true });
  sw(ch, [{ p: [0, 0.075, 0.12], w: 0.006, h: 0.014 }, { p: [0, 0.09, 0.095], w: 0.008, h: 0.012 }, { p: [0, 0.098, 0.075], w: 0.004, h: 0.004 }], c, (x, y, z) => mx(c, red, sst(0.08, 0.098, y) * 0.6 + 0 * x * z), { radial: 8, sub: 2, caps: true });
  el(ch, red, 0, 0.04, 0.12, 0.016, 0.004, 0.04); // orange-red lip line
  for (const sx of [-1, 1]) {
    blob(ch, c, sx * 0.019, 0.066, 0.125, 0.014, 0.014, 0.014, (_x, y) => (y > 0.06 ? mx(c, red, 0.35) : c), [0, 0, 0], 10);
    el(ch, '#120c08', sx * 0.03, 0.068, 0.13, 0.004, 0.004, 0.004);
    lit(el(ch, '#ffffff', sx * 0.032, 0.07, 0.132, 0.0013));
  }
  // Tongue shooting out to the cricket
  ch.updateMatrix();
  const lt = new THREE.Vector3(0.335, 0.453, 0.105).applyMatrix4(ch.matrix.clone().invert());
  tube(ch, [[0, 0.045, 0.16], [lt.x * 0.5, (0.045 + lt.y) * 0.5 + 0.004, (0.16 + lt.z) * 0.5], [lt.x, lt.y, lt.z - 0.006]], 0.0028, 0.0025, '#e88aa0', undefined, 6);
  el(ch, '#f0a0b4', lt.x, lt.y, lt.z - 0.006, 0.006);
  // Akimbo legs with mitten feet clasping the branch
  for (const [sx, z0, z1] of [[-1, 0.06, 0.075], [1, 0.06, 0.05], [-1, -0.055, -0.07], [1, -0.055, -0.045]] as const) {
    limb(ch, c, [[[sx * 0.022, 0.045, z0], 0.01, 0.012], [[sx * 0.036, 0.032, (z0 + z1) / 2 + 0.008], 0.008, 0.008], [[sx * 0.016, 0.005, z1], 0.006, 0.006]], skin, 7);
    for (const s2 of [-1, 1]) el(ch, sh(c, 0.85), sx * 0.008 + s2 * 0.008, -0.001, z1 + s2 * 0.004, 0.006, 0.004, 0.007);
  }
  // Prehensile tail spiralling under the branch
  const tpts: V3[] = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * Math.PI * 2.4, rr = 0.045 * (1 - t * 0.7); tpts.push([0, -0.0 + 0.03 - (1 - Math.cos(a)) * rr * 0.9 - t * 0.02, -0.095 - Math.sin(a) * rr * 0.9]); }
  sw(ch, tpts.map((q, i) => ({ p: q, w: 0.012 * (1 - i / 16) + 0.002 })), c, skin, { radial: 8, sub: 2, caps: true });
};

/** Fennec fox: tiny cream fox with gigantic ears, dark eye streaks and a black-tipped bushy tail, on a rippled Sahara dune. */
const fennec: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#e6c391', pale = '#f7f0e2', dk = '#a87a4a';
  const sand: Paint = (x, y, z) => {
    let col = mx('#e8b878', '#d49a5a', sst(0.4, 0.9, Math.sin(x * 70 + Math.sin(z * 12) * 3 + z * 20) * 0.5 + 0.5) * 0.5);
    col = mx(col, '#f2cc90', sst(0.5, 0.8, vnoise(x * 8, y * 8, z * 8)) * 0.4);
    return speck(col, x, y, z, 0.03);
  };
  ground(gp, 0.46, 0.44, ['#e8b878', '#d49a5a', '#f2cc90'], { seed: 13, paint: sand });
  blob(gp, '#e0aa6a', -0.16, -0.02, -0.22, 0.26, 0.09, 0.16, sand, [0, 0.5, 0], 16); // dune behind
  blob(gp, '#e0aa6a', 0.24, -0.02, 0.2, 0.18, 0.06, 0.14, sand, [0, -0.4, 0], 12);
  // Dry desert shrub and a few pebbles
  for (let k = 0; k < 7; k++) { const a = k * 0.9; tube(gp, [[0.28, 0.0, -0.2], [0.28 + Math.cos(a) * 0.03, 0.06, -0.2 + Math.sin(a) * 0.03], [0.28 + Math.cos(a) * 0.07, 0.1 + (k % 3) * 0.02, -0.2 + Math.sin(a) * 0.07]], 0.005, 0.002, '#7a5a3a', undefined, 5); }
  for (const [x, y, z] of [[0.25, 0.1, -0.17], [0.31, 0.11, -0.23], [0.27, 0.12, -0.25]]) blob(gp, '#8a8a4a', x, y, z, 0.025, 0.015, 0.025, undefined, [0, 0, 0], 8);
  for (const [x, z] of [[-0.3, 0.2], [-0.25, 0.28], [0.1, 0.34]]) rock(gp, '#b08a62', x, 0, z, 0.025, 0.015, 0.02, x * 9);
  for (let i = 0; i < 5; i++) el(gp, '#c08850', 0.06 + i * 0.05, 0.002, 0.3 - i * 0.03 + (i % 2) * 0.02, 0.008, 0.003, 0.01); // paw prints
  const F = grp(gp, [0.02, 0.0, 0.04], [0, 0.35, 0]);
  F.scale.setScalar(1.55);
  const fur: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.2 ? mx(c, pale, sst(-0.2, -0.6, ny)) : mx(c, sh(c, 1.06), sst(0.3, 1, ny) * 0.5);
    col = mx(col, dk, sst(0.7, 1, ny) * 0.15);
    return speck(col, x, y, z, 0.07);
  };
  spine(F, [
    { p: [0, 0.15, -0.125], w: 0.024, h: 0.024 }, { p: [0, 0.153, -0.105], w: 0.044, h: 0.048 }, { p: [0, 0.158, -0.045], w: 0.046, h: 0.05 },
    { p: [0, 0.158, 0.025], w: 0.043, h: 0.054 }, { p: [0, 0.168, 0.075], w: 0.038, h: 0.048 }, { p: [0, 0.185, 0.1], w: 0.018, h: 0.02 },
  ], c, fur, { nv: 16 });
  const legP: Paint = (x, y, z, nx, ny, nz) => (y < 0.05 ? speck(mx(pale, c, sst(0.03, 0.05, y)), x, y, z, 0.05) : fur(x, y, z, nx, ny, nz));
  for (const sx of [-1, 1]) {
    const st = sx * 0.012;
    limb(F, c, [[[sx * 0.026, 0.15, 0.07], 0.018, 0.022], [[sx * 0.028, 0.09, 0.075], 0.011, 0.012], [[sx * 0.028, 0.035, 0.078 + st], 0.008, 0.009], [[sx * 0.028, 0.012, 0.082 + st], 0.009, 0.01]], legP, 8);
    paw(F, pale, sx * 0.028, 0.09 + st, 0.01);
    limb(F, c, [[[sx * 0.03, 0.155, -0.085], 0.026, 0.036], [[sx * 0.034, 0.1, -0.06], 0.018, 0.022], [[sx * 0.032, 0.055, -0.1 - st], 0.009, 0.011], [[sx * 0.031, 0.028, -0.095 - st], 0.008, 0.009], [[sx * 0.031, 0.012, -0.085 - st], 0.009, 0.01]], legP, 8);
    paw(F, pale, sx * 0.031, -0.075 - st, 0.01);
  }
  // Bushy tail drooping to the sand, dark tip
  sw(F, [{ p: [0, 0.155, -0.12], w: 0.016 }, { p: [0.004, 0.13, -0.16], w: 0.026 }, { p: [0.012, 0.085, -0.2], w: 0.034 }, { p: [0.022, 0.04, -0.22], w: 0.03 }, { p: [0.03, 0.018, -0.2], w: 0.016 }, { p: [0.032, 0.015, -0.185], w: 0.004 }], c,
    (x, y, z) => speck(mx(c, '#2a1e16', sst(0.045, 0.03, y) * sst(-0.21, -0.19, z) + sst(0.035, 0.022, y)), x, y, z, 0.08), { radial: 10, sub: 3, caps: true });
  // Neck and head with huge ears
  sw(F, [{ p: [0, 0.17, 0.07], w: 0.03, h: 0.036 }, { p: [0, 0.2, 0.1], w: 0.026, h: 0.03 }, { p: [0, 0.225, 0.12], w: 0.024, h: 0.026 }], c, fur, { radial: 10, sub: 3 });
  const h = grp(F, [0, 0.235, 0.13], [0.15, -0.25, 0]);
  const face: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, pale, sst(0.0, -0.015, y) + sst(0.02, 0.04, z) * 0.6);
    if (ny > 0.5) col = mx(col, c, 0.5);
    return speck(col, x, y, z, 0.04);
  };
  blob(h, c, 0, 0, 0, 0.033, 0.03, 0.032, face, [0, 0, 0], 14);
  sw(h, [{ p: [0, -0.006, 0.018], w: 0.02, h: 0.018 }, { p: [0, -0.011, 0.045], w: 0.011, h: 0.01 }, { p: [0, -0.013, 0.062], w: 0.005, h: 0.005 }], pale, face, { radial: 10, sub: 3, caps: true });
  el(h, '#141010', 0, -0.012, 0.064, 0.005, 0.004, 0.004);
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.016, 0.006, 0.026, 0.0085, sx * 0.4, '#3a2410', pale, 0.55);
    tube(h, [[sx * 0.01, 0.0, 0.032], [sx * 0.011, -0.007, 0.04], [sx * 0.012, -0.011, 0.044]], 0.0025, 0.002, '#7a4a2a', undefined, 5); // dark streak
    const e = ear(h, [sx * 0.022, 0.022, -0.006], [-0.15, sx * 0.25, -sx * 0.5], 0.04, 0.115, c, '#f2d8cc', true);
    for (let k = 0; k < 4; k++) drop(e, '#fbf6ee', [sx * 0.004 * k, 0.012 + k * 0.012, 0.012], [sx * 0.012, 0.04 + k * 0.014, 0.018], 0.004);
    el(h, pale, sx * 0.03, -0.012, 0.012, 0.01, 0.008, 0.01);
  }
};

/** Wild yak: massive black-brown ox with a shoulder hump, a long shaggy skirt to its ankles, grey muzzle and up-curving horns. */
const yak: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#2a221e', lt = '#5a4636', grey = '#8a8478';
  ground(gp, 0.46, 0.44, ['#a8925a', '#8a7a48', '#6e7a42'], { seed: 17 });
  water(gp, 0.16, 0.1, [[0.25, 0.25, 0.03]], '#4a7aa0', 0.24, 0.24, -0.01);
  // Snowy Himalayan crags behind
  for (const [x, z, s, yaw] of [[-0.27, -0.28, 0.12, 0.4], [-0.15, -0.35, 0.08, 1.3], [0.3, -0.27, 0.08, 2.1]] as const) {
    const top = s * 1.5;
    blob(gp, '#6e665e', x, 0.0, z, s, top, s * 0.8, (px, py, pz, _nx, ny) => mx(speck(mx('#625a52', '#3e3a36', sst(0.3, 0.8, vnoise(px * 30, py * 30, pz * 30))), px, py, pz, 0.08), '#eef2f6', sst(top * 0.88, top * 0.96, py + (vnoise(px * 50, 1, pz * 50) - 0.5) * 0.05) * sst(-0.1, 0.5, ny)), [0.15, yaw, 0.1], 12);
    rock(gp, '#5e5850', x + s * 0.7, 0, z + s * 0.4, s * 0.5, s * 0.5, s * 0.5, yaw);
  }
  for (const [x, z, s] of [[-0.36, 0.1, 1.2], [0.34, -0.02, 1.1], [-0.1, 0.36, 1], [0.12, 0.38, 1.1], [-0.36, -0.14, 1.2]] as const) grass(gp, x, z, ['#c8b070', '#8a8048'], s, 6, x * 7 + z);
  const Y = grp(gp, [0.0, 0, 0.02], [0, 0.6, 0]);
  const hair: Paint = (x, y, z, _nx, ny) => {
    const s = vnoise(x * 70 + z * 20, y * 7, z * 70);
    let col = mx(c, lt, sst(0.55, 0.9, s) * 0.55 + sst(0.6, 1, ny) * 0.3);
    col = mx(col, sh(c, 0.7), sst(0.18, 0.08, y) * 0.5);
    return col;
  };
  // Body loft whose lower half drops into a long fringed skirt
  spine(Y, [
    { p: [0, 0.33, -0.3], w: 0.05, h: 0.05 }, { p: [0, 0.34, -0.27], w: 0.12, h: 0.11 }, { p: [0, 0.34, -0.18], w: 0.14, h: 0.125 },
    { p: [0, 0.355, -0.06], w: 0.145, h: 0.13 }, { p: [0, 0.38, 0.05], w: 0.14, h: 0.14 }, { p: [0, 0.38, 0.13], w: 0.12, h: 0.13 }, { p: [0, 0.35, 0.19], w: 0.08, h: 0.09 },
  ], c, hair, { nv: 24, nu: 42, shape: (u, a) => {
    const s = Math.sin(a);
    if (s >= 0) return 1;
    const body = sst(0.03, 0.18, u) * sst(0.98, 0.84, u);
    const fr = 0.93 + 0.07 * Math.sin(u * 90 + a * 7) * Math.sin(u * 37);
    return 1 + body * Math.pow(-s, 1.4) * 1.2 * fr;
  } });
  blob(Y, c, 0, 0.47, 0.06, 0.1, 0.07, 0.11, hair, [0.2, 0, 0], 12); // hump
  // Hair locks hanging around the hem
  // Short sturdy legs showing below the skirt
  for (const [sx, z0] of [[-1, 0.1], [1, 0.08], [-1, -0.2], [1, -0.22]] as const) {
    limb(Y, c, [[[sx * 0.085, 0.16, z0], 0.04, 0.045], [[sx * 0.088, 0.07, z0], 0.03, 0.032], [[sx * 0.088, 0.025, z0], 0.026, 0.028]], hair, 9);
    hoof(Y, '#1a1612', sx * 0.088, z0, 0.024);
  }
  tube(Y, [[0, 0.36, -0.29], [0.0, 0.3, -0.32], [0.01, 0.22, -0.33]], 0.016, 0.012, c, hair);
  tuft(Y, c, [0.01, 0.22, -0.33], [0, -1, -0.1], 0.13, 0.02, 6, 0.35, lt);
  // Low-held head with a grey muzzle and wide horns
  sw(Y, [{ p: [0, 0.38, 0.15], w: 0.1, h: 0.12 }, { p: [0, 0.34, 0.22], w: 0.085, h: 0.1 }, { p: [0, 0.3, 0.27], w: 0.07, h: 0.085 }], c, hair, { radial: 12, sub: 3 });
  const h = grp(Y, [0, 0.29, 0.28], [0.55, 0, 0]);
  const fp: Paint = (x, y, z, nx, ny, nz) => (z > 0.1 ? speck(mx(c, grey, sst(0.1, 0.15, z)), x, y, z, 0.05) : hair(x, y, z, nx, ny, nz));
  sw(h, [{ p: [0, 0.01, -0.02], w: 0.066, h: 0.07 }, { p: [0, 0.0, 0.06], w: 0.06, h: 0.064 }, { p: [0, -0.01, 0.14], w: 0.048, h: 0.05 }, { p: [0, -0.015, 0.18], w: 0.044, h: 0.042 }], c, fp, { radial: 12, sub: 3, caps: true });
  el(h, '#3a3430', 0, -0.012, 0.188, 0.03, 0.022, 0.01);
  for (const sx of [-1, 1]) {
    el(h, '#141210', sx * 0.016, -0.004, 0.19, 0.006, 0.008, 0.004);
    eye(h, sx * 0.05, 0.02, 0.06, 0.008, sx * 1.1, '#2a1a10', c);
    ear(h, [sx * 0.06, 0.03, -0.0], [0, sx * 0.4, -sx * 1.4], 0.016, 0.04, c, '#4a3a30');
    // Horn: out sideways, sweeping up and forward, pale with dark tip
    const hp: V3[] = [[sx * 0.04, 0.06, -0.01], [sx * 0.1, 0.075, -0.03], [sx * 0.15, 0.12, -0.02], [sx * 0.16, 0.18, 0.02], [sx * 0.13, 0.22, 0.05]];
    sw(h, hp.map((p, i) => ({ p, w: 0.02 * (1 - i / 4.6) + 0.002 })), '#d8ccb0', undefined, { radial: 8, sub: 3, caps: true });
    el(h, '#2a2420', hp[4][0], hp[4][1], hp[4][2], 0.004);
  }
  // Shaggy forelock between the horns
  tuft(h, c, [0, 0.07, 0.0], [0, 0.4, 1], 0.06, 0.016, 5, 0.6, lt);
};

/** Pangolin: a living pine cone — overlapping brown scales over body and long tail, tiny pointed head, walking on curled claws by a termite mound. */
const pangolin: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#a07a4a', skinC = '#c8a088';
  ground(gp, 0.44, 0.42, ['#6a5a3a', '#4f4a2a', '#8a6a42'], { seed: 19 });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, rr = 0.22 + hash3(i, 3, 5) * 0.18, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    blade(gp, ['#8a5a2a', '#6b4a2a', '#a07a3a', '#5e6a32'][i % 4], [x, 0.005, z], [x + Math.cos(a * 3) * 0.045, 0.007, z + Math.sin(a * 3) * 0.045], 0.016, 0.003, [0, 1, 0]);
  }
  // Termite mound with tunnel holes
  const mound: Paint = (x, y, z) => speck(mx('#a8744a', '#8a5a36', sst(0.4, 0.8, fbm(x * 30, y * 12, z * 30, 2))), x, y, z, 0.05);
  blob(gp, '#a8744a', -0.27, 0.0, -0.24, 0.11, 0.07, 0.1, mound, [0, 0.3, 0], 12);
  sw(gp, [{ p: [-0.27, 0.0, -0.24], w: 0.085 }, { p: [-0.27, 0.12, -0.245], w: 0.06 }, { p: [-0.275, 0.24, -0.25], w: 0.035 }, { p: [-0.28, 0.32, -0.26], w: 0.012 }], '#a8744a', mound, { radial: 10, sub: 3, caps: true });
  sw(gp, [{ p: [-0.19, 0.0, -0.28], w: 0.045 }, { p: [-0.195, 0.1, -0.285], w: 0.028 }, { p: [-0.2, 0.17, -0.29], w: 0.008 }], '#a8744a', mound, { radial: 8, sub: 3, caps: true });
  for (const [x, y, z] of [[-0.215, 0.07, -0.185], [-0.245, 0.17, -0.21], [-0.16, 0.05, -0.25]]) el(gp, '#2a1a10', x, y, z, 0.012, 0.012, 0.008, 0.6);
  for (let i = 0; i < 12; i++) el(gp, '#1a1210', -0.16 + i * 0.022, 0.004, -0.1 + Math.sin(i * 1.3) * 0.02 + i * 0.01, 0.004, 0.003, 0.006);
  for (const [x, z, s] of [[0.33, -0.18, 1.2], [0.3, 0.24, 1], [-0.32, 0.18, 1.1]] as const) grass(gp, x, z, ['#6f9a3a', '#3f6a26'], s, 6, x * 5);
  bigLeaf(gp, [0.3, 0, -0.26], -2.4, 0.16, 0.05, '#3f7a34', 0.9, 0.9);
  const P = grp(gp, [0.04, 0, 0.04], [0, 0.75, 0]);
  P.scale.setScalar(1.15);
  const ROWS = 30, COLS = 14;
  const scaleF = (u: number, a: number) => {
    const col = Math.floor(((a / (Math.PI * 2)) * COLS + 100)) % 2;
    const f = (u * ROWS + col * 0.5) % 1;
    return { f, col };
  };
  const armour = (u: number) => sst(0.18, 0.22, u) * sst(1.0, 0.96, u);
  const st: SpSt[] = [
    { p: [0, 0.045, 0.31], w: 0.006, h: 0.006 }, { p: [0, 0.055, 0.27], w: 0.018, h: 0.018 }, { p: [0, 0.07, 0.21], w: 0.034, h: 0.032 },
    { p: [0, 0.1, 0.14], w: 0.05, h: 0.05 }, { p: [0, 0.135, 0.06], w: 0.075, h: 0.075 }, { p: [0, 0.155, -0.03], w: 0.085, h: 0.085 },
    { p: [0, 0.14, -0.12], w: 0.08, h: 0.078 }, { p: [0, 0.11, -0.2], w: 0.064, h: 0.058 }, { p: [0, 0.07, -0.27], w: 0.05, h: 0.04 },
    { p: [0.01, 0.045, -0.34], w: 0.038, h: 0.028 }, { p: [0.04, 0.032, -0.4], w: 0.026, h: 0.02 }, { p: [0.09, 0.026, -0.43], w: 0.014, h: 0.012 }, { p: [0.13, 0.024, -0.43], w: 0.005, h: 0.005 },
  ];
  const body = spine(P, st, c, undefined, { nu: 96, nv: 28, shape: (u, a) => {
    const s = -Math.sin(a), w = armour(u) * sst(-0.45, -0.1, s);
    const { f } = scaleF(u, a);
    return 1 + w * (0.05 + 0.11 * f);
  } });
  // Per-vertex colour from the same grid (rows × columns), matching psurf's vertex order
  {
    const col = body.geometry.getAttribute('color') as THREE.BufferAttribute;
    const nu = 96, nv = 28, cc = new THREE.Color();
    for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) {
      const k = i * nv + j, u = i / nu, a = (j / nv) * Math.PI * 2, s = -Math.sin(a);
      const w = armour(u) * sst(-0.45, -0.1, s), { f, col: cl } = scaleF(u, a);
      let h2 = mx(skinC, '#8a6a58', 0.3);
      if (w > 0.5) h2 = mx(mx(sh(c, 0.62), mx(c, '#d8b07a', 0.35), sst(0.15, 0.95, f)), sh(c, 0.8), cl * 0.25 + hash3(Math.floor(u * ROWS), cl, j) * 0.25);
      cc.set(h2); col.setXYZ(k, cc.r, cc.g, cc.b);
    }
    col.needsUpdate = true;
  }
  // Short legs: scaled forearms, front feet walking on curled claws, hind feet flat with claws
  const legC = sh(c, 0.85);
  for (const [sx, z0, front] of [[-1, 0.07, true], [1, 0.05, true], [-1, -0.13, false], [1, -0.15, false]] as const) {
    limb(P, legC, [[[sx * 0.06, 0.12, z0], 0.03, 0.034], [[sx * 0.072, 0.06, z0 + 0.01], 0.022, 0.024], [[sx * 0.07, 0.02, z0 + 0.025], 0.018, 0.02]], undefined, 8);
    for (let k = -1; k <= 1; k++) {
      const x = sx * 0.07 + k * 0.011;
      if (front) tube(P, [[x, 0.022, z0 + 0.035], [x, 0.012, z0 + 0.05], [x, 0.004, z0 + 0.04]], 0.005, 0.003, '#d8cbb0', undefined, 5);
      else drop(P, '#d8cbb0', [x, 0.01, z0 + 0.04], [x + k * 0.006, 0.004, z0 + 0.065], 0.005);
    }
  }
  // Face: tiny eye, small ear opening, pink-grey nose tip
  for (const sx of [-1, 1]) {
    el(P, '#0e0a08', sx * 0.03, 0.085, 0.2, 0.006, 0.006, 0.006);
    lit(el(P, '#ffffff', sx * 0.032, 0.088, 0.204, 0.0016));
    el(P, '#7a5a48', sx * 0.04, 0.1, 0.15, 0.008, 0.01, 0.006);
  }
  el(P, '#5a4038', 0, 0.045, 0.313, 0.006, 0.005, 0.004);
};

/** Gharial: slim olive crocodilian with a needle-thin snout full of teeth and a bulbous 'ghara' knob, basking on a river sandbank. */
const gharial: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#6e7454', belly = '#d8d0a0', dk = '#3e4232';
  const sand: Paint = (x, y, z) => speck(mx('#d8c08a', '#bfa070', sst(0.4, 0.8, vnoise(x * 12, 2, z * 12)) * 0.6), x, y, z, 0.03);
  ground(gp, 0.46, 0.42, ['#d8c08a', '#bfa070', '#c8b080'], { seed: 23, paint: sand });
  water(gp, 0.24, 0.13, [[0.22, 0.3, 0.02], [0.05, 0.33, 0.025]], '#4f7f74', 0.14, 0.3, -0.014);
  for (const [x, z, s] of [[-0.36, -0.12, 1.4], [-0.3, -0.26, 1.2], [0.34, -0.2, 1.3]] as const) grass(gp, x, z, ['#9aa04a', '#6a7a32'], s, 7, x * 6);
  for (const [x, z] of [[0.3, 0.1], [-0.36, 0.08]]) rock(gp, '#9a8a70', x, 0, z, 0.03, 0.018, 0.025, x * 7);
  const G = grp(gp, [0.0, 0, -0.04], [0, 0.95, 0]);
  G.scale.setScalar(1.3);
  const skin: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.2 ? mx(c, belly, sst(-0.2, -0.6, ny)) : mx(c, sh(c, 1.12), sst(0.4, 1, ny) * 0.4);
    col = mx(col, dk, sst(0.55, 0.85, Math.sin(z * 55 + x * 6)) * sst(-0.05, -0.15, z) * sst(-0.3, 0.2, ny) * 0.6); // tail bands
    col = mx(col, sh(c, 0.8), sst(0.5, 0.75, vnoise(x * 60, y * 60, z * 60)) * 0.4);
    return speck(col, x, y, z, 0.05);
  };
  // Body loft from tail tip (curving) to the back of the head; tail flattened sideways
  spine(G, [
    { p: [-0.12, 0.018, -0.36], w: 0.004, h: 0.012 }, { p: [-0.08, 0.022, -0.33], w: 0.01, h: 0.024 }, { p: [-0.03, 0.03, -0.27], w: 0.018, h: 0.034 },
    { p: [0, 0.04, -0.19], w: 0.032, h: 0.036 }, { p: [0, 0.048, -0.1], w: 0.058, h: 0.04 }, { p: [0, 0.052, -0.01], w: 0.068, h: 0.044 },
    { p: [0, 0.05, 0.07], w: 0.062, h: 0.042 }, { p: [0, 0.046, 0.13], w: 0.042, h: 0.034 }, { p: [0, 0.046, 0.16], w: 0.038, h: 0.03 },
  ], c, skin, { nv: 18, nu: 50 });
  // Back armour: paired rows of bony scutes merging into a single tail crest
  for (let i = 0; i < 26; i++) {
    const t = i / 25, z = 0.12 - t * 0.47, curve = z < -0.19 ? (z + 0.19) * (z < -0.27 ? 1.1 : 0.5) : 0;
    const x0 = z < -0.27 ? -0.03 + (z + 0.27) * 1.0 : z < -0.19 ? curve * 0.5 : 0;
    const y = z < -0.19 ? 0.045 + (z + 0.19) * 0.18 + 0.02 : 0.088 - Math.abs(z - 0.0) * 0.04;
    if (z > -0.17) for (const sx of [-1, 1]) el(G, dk, sx * 0.018, y - 0.004, z, 0.008, 0.007, 0.012);
    else el(G, dk, x0, y, z, 0.004, 0.011, 0.012);
  }
  // Splayed legs with webbed toes
  for (const [sx, z0, front] of [[-1, 0.08, true], [1, 0.07, true], [-1, -0.1, false], [1, -0.11, false]] as const) {
    const fx = sx * (front ? 0.12 : 0.13), fz = z0 + (front ? 0.05 : -0.03);
    limb(G, c, [[[sx * 0.045, 0.045, z0], 0.022, 0.02], [[sx * 0.09, 0.04, z0 + 0.01], 0.015, 0.014], [[fx, 0.012, fz], 0.011, 0.012]], skin, 8);
    for (let k = -2; k <= 2; k++) { const a = (front ? 0.3 : -0.5) * sx + k * 0.35; tube(G, [[fx, 0.008, fz], [fx + Math.sin(a) * 0.03 * sx, 0.004, fz + Math.cos(a) * 0.03]], 0.005, 0.003, sh(c, 0.85), undefined, 5); }
  }
  // Head: small skull with raised eyes, very long thin snout ending in a bulbous ghara
  const h = grp(G, [0, 0.048, 0.165], [-0.12, 0.15, 0]);
  blob(h, c, 0, 0.002, 0.005, 0.04, 0.026, 0.04, skin, [0, 0, 0], 14);
  sw(h, [{ p: [0, -0.002, 0.03], w: 0.022, h: 0.016 }, { p: [0, -0.004, 0.08], w: 0.012, h: 0.01 }, { p: [0, -0.005, 0.15], w: 0.01, h: 0.0085 }, { p: [0, -0.006, 0.2], w: 0.011, h: 0.009 }], c, skin, { radial: 9, sub: 3 });
  blob(h, c, 0, -0.004, 0.214, 0.02, 0.014, 0.02, skin, [0, 0, 0], 12);
  blob(h, '#5a5442', 0, 0.008, 0.212, 0.016, 0.013, 0.016, undefined, [0, 0, 0], 10); // ghara knob
  for (const sx of [-1, 1]) {
    el(h, c, sx * 0.019, 0.022, 0.0, 0.013, 0.011, 0.014);
    eye(h, sx * 0.022, 0.026, 0.006, 0.006, sx * 1.2, '#a8a040', c, 0.25);
    // Interlocking needle teeth along the jaw
    for (let k = 0; k < 9; k++) {
      const z = 0.05 + k * 0.018, w = z < 0.08 ? 0.018 - (z - 0.03) * 0.15 : 0.011;
      drop(h, '#f2ecd8', [sx * w * 0.95, -0.006, z + (sx > 0 ? 0 : 0.008)], [sx * w * 1.25, -0.016 + (k % 2) * 0.016, z + 0.004 + (sx > 0 ? 0 : 0.008)], 0.0022);
    }
    drop(h, '#f2ecd8', [sx * 0.016, -0.006, 0.212], [sx * 0.024, -0.014, 0.214], 0.0026);
  }
};

/** Saiga: sandy steppe antelope with a bulbous, drooping trunk-like nose and translucent amber ringed horns. */
const saiga: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#c89a62', belly = '#f2ece0', horn = '#e8c88a';
  ground(gp, 0.46, 0.44, ['#b8ac6a', '#9a9a58', '#c8b478'], { seed: 29 });
  // Feather-grass and wormwood tussocks of the steppe
  for (const [x, z, s] of [[-0.33, 0.14, 1.6], [0.32, 0.18, 1.3], [0.3, -0.24, 1.7], [-0.14, 0.33, 1.2], [0.06, -0.34, 1.4], [-0.34, -0.14, 1.5], [0.18, 0.34, 1.1]] as const) grass(gp, x, z, ['#d8d098', '#9aa060'], s, 7, x * 9 + z);
  for (const [x, z] of [[-0.3, -0.3], [0.36, -0.04], [-0.06, -0.38]]) {
    for (let k = 0; k < 5; k++) { const a = k * 1.26; tube(gp, [[x, 0, z], [x + Math.cos(a) * 0.03, 0.05, z + Math.sin(a) * 0.03], [x + Math.cos(a) * 0.05, 0.11, z + Math.sin(a) * 0.05]], 0.0015, 0.001, '#e8e0c0', undefined, 4); }
    blob(gp, '#9aa0a0', x, 0.02, z, 0.035, 0.025, 0.035, undefined, [0, 0, 0], 8);
  }
  const A = grp(gp, [0.02, 0, 0.02], [0, 0.6, 0]);
  A.scale.setScalar(1.2);
  const coat: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.2 ? mx(c, belly, sst(-0.2, -0.55, ny)) : mx(c, sh(c, 1.08), sst(0.4, 1, ny) * 0.5);
    return speck(col, x, y, z, 0.05);
  };
  spine(A, [
    { p: [0, 0.27, -0.2], w: 0.025, h: 0.025 }, { p: [0, 0.27, -0.18], w: 0.055, h: 0.06 }, { p: [0, 0.27, -0.11], w: 0.064, h: 0.072 },
    { p: [0, 0.27, -0.02], w: 0.064, h: 0.074 }, { p: [0, 0.28, 0.07], w: 0.06, h: 0.076 }, { p: [0, 0.29, 0.12], w: 0.045, h: 0.06 }, { p: [0, 0.3, 0.14], w: 0.02, h: 0.025 },
  ], c, coat, { nv: 20 });
  for (const sx of [-1, 1]) blob(A, c, sx * 0.03, 0.27, -0.14, 0.035, 0.065, 0.055, coat, [0.2, 0, 0], 12);
  const legP: Paint = (x, y, z, nx, ny, nz) => (y > 0.2 ? coat(x, y, z, nx, ny, nz) : speck(mx(c, sh(c, 0.85), 0.3), x, y, z, 0.04));
  for (const sx of [-1, 1]) {
    const st = sx * 0.015;
    limb(A, c, [[[sx * 0.035, 0.27, 0.08], 0.024, 0.034], [[sx * 0.038, 0.2, 0.08], 0.016, 0.02], [[sx * 0.036, 0.12, 0.085 + st], 0.009, 0.011], [[sx * 0.036, 0.04, 0.09 + st], 0.007, 0.008], [[sx * 0.036, 0.018, 0.094 + st], 0.008, 0.009]], legP, 8);
    hoof(A, '#2a2420', sx * 0.036, 0.098 + st, 0.012);
    limb(A, c, [[[sx * 0.036, 0.28, -0.14], 0.03, 0.05], [[sx * 0.042, 0.2, -0.11], 0.022, 0.03], [[sx * 0.038, 0.13, -0.16 - st], 0.01, 0.014], [[sx * 0.037, 0.05, -0.15 - st], 0.007, 0.008], [[sx * 0.037, 0.018, -0.143 - st], 0.008, 0.009]], legP, 8);
    hoof(A, '#2a2420', sx * 0.037, -0.138 - st, 0.012);
  }
  tube(A, [[0, 0.29, -0.2], [0, 0.27, -0.22], [0, 0.24, -0.225]], 0.01, 0.007, c);
  // Neck and the bulging, overhanging nose
  sw(A, [{ p: [0, 0.3, 0.1], w: 0.04, h: 0.056 }, { p: [0, 0.34, 0.15], w: 0.034, h: 0.042 }, { p: [0, 0.37, 0.18], w: 0.03, h: 0.035 }], c, coat, { radial: 12, sub: 3 });
  const h = grp(A, [0, 0.385, 0.19], [0.35, -0.2, 0]);
  const face: Paint = (x, y, z, _nx, ny) => speck(mx(c, belly, sst(-0.012, -0.03, y) * 0.8 + (ny > 0.6 ? 0 : 0)), x, y, z, 0.04);
  blob(h, c, 0, 0, 0, 0.03, 0.03, 0.035, face, [0, 0, 0], 12);
  sw(h, [{ p: [0, -0.004, 0.02], w: 0.026, h: 0.028 }, { p: [0, -0.004, 0.05], w: 0.031, h: 0.034 }, { p: [0, -0.012, 0.072], w: 0.033, h: 0.033 }, { p: [0, -0.03, 0.086], w: 0.028, h: 0.026 }, { p: [0, -0.046, 0.088], w: 0.021, h: 0.018 }], c, face, { radial: 12, sub: 3, caps: true });
  for (const sx of [-1, 1]) {
    el(h, '#2a2018', sx * 0.01, -0.054, 0.088, 0.006, 0.004, 0.006); // nostrils point down
    eye(h, sx * 0.025, 0.012, 0.012, 0.009, sx * 1.0, '#2a1a10', c);
    el(h, sh(c, 0.75), sx * 0.024, 0.003, 0.028, 0.007, 0.005, 0.012); // dark cheek stripe
    ear(h, [sx * 0.026, 0.024, -0.016], [-0.3, sx * 0.3, -sx * 0.9], 0.012, 0.03, c, '#f2e2d0', true);
    // Lyre-shaped ringed horns, translucent amber
    const hp: V3[] = [[sx * 0.012, 0.022, -0.006], [sx * 0.018, 0.06, -0.02], [sx * 0.024, 0.1, -0.022], [sx * 0.018, 0.13, -0.008]];
    const hc = new THREE.CatmullRomCurve3(hp.map(q => new THREE.Vector3(...q)));
    sw(h, Array.from({ length: 10 }, (_, i) => { const q = hc.getPoint(i / 9); return { p: [q.x, q.y, q.z] as V3, w: (0.008 - i * 0.0006) * (i < 7 && i % 2 ? 1.18 : 1) }; }), horn,
      (_x, y) => mx(horn, '#fbe8c0', sst(0.08, 0.13, y)), { radial: 8, sub: 2, caps: true });
  }
};

/** Przewalski's horse (takhi): stocky dun wild horse with an upright black mane, pale mealy muzzle, dark legs and a dorsal stripe. */
const takhi: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#c8a066', mealy = '#efe2c4', dk = '#2e241c', belly = '#e2cfa4';
  ground(gp, 0.46, 0.44, ['#a8a05e', '#8a9050', '#b8a870'], { seed: 31 });
  for (const [x, z, s] of [[-0.34, 0.16, 1.4], [0.34, 0.12, 1.2], [0.28, -0.28, 1.5], [-0.12, 0.35, 1.1], [-0.36, -0.12, 1.3], [0.08, -0.36, 1.2]] as const) grass(gp, x, z, ['#c8c078', '#8a9048'], s, 7, x * 9 + z);
  for (const [x, z] of [[0.3, 0.26], [-0.26, -0.3]]) rock(gp, '#8a8274', x, 0, z, 0.04, 0.025, 0.035, x * 5);
  const H = grp(gp, [0.0, 0, 0.0], [0, 0.6, 0]);
  const coat: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.3 ? mx(c, belly, sst(-0.3, -0.7, ny)) : mx(c, sh(c, 1.06), sst(0.4, 1, ny) * 0.4);
    col = mx(col, '#4a3626', sst(0.92, 0.98, ny) * sst(0.025, 0.012, Math.abs(x))); // dorsal stripe
    return speck(col, x, y, z, 0.05);
  };
  spine(H, [
    { p: [0, 0.35, -0.24], w: 0.04, h: 0.04 }, { p: [0, 0.355, -0.215], w: 0.08, h: 0.09 }, { p: [0, 0.35, -0.14], w: 0.09, h: 0.1 },
    { p: [0, 0.34, -0.04], w: 0.09, h: 0.104 }, { p: [0, 0.35, 0.06], w: 0.088, h: 0.106 }, { p: [0, 0.37, 0.13], w: 0.074, h: 0.096 },
    { p: [0, 0.39, 0.165], w: 0.04, h: 0.05 },
  ], c, coat, { nv: 22 });
  for (const sx of [-1, 1]) blob(H, c, sx * 0.045, 0.34, -0.16, 0.05, 0.09, 0.075, coat, [0.2, 0, 0], 14);
  const legP: Paint = (x, y, z, nx, ny, nz) => (y > 0.24 ? coat(x, y, z, nx, ny, nz) : speck(mx(c, dk, sst(0.24, 0.17, y)), x, y, z, 0.04));
  const hoofH = (x: number, z: number) => sw(H, [{ p: [x, 0.0, z + 0.004], w: 0.02, h: 0.022 }, { p: [x, 0.026, z], w: 0.016, h: 0.017 }], '#2a2420', undefined, { radial: 10, sub: 1, caps: true, up: [0, 0, 1] });
  for (const sx of [-1, 1]) {
    const st = sx * 0.025;
    limb(H, c, [[[sx * 0.05, 0.36, 0.12], 0.038, 0.05], [[sx * 0.052, 0.27, 0.115], 0.028, 0.034], [[sx * 0.05, 0.17, 0.12 + st], 0.017, 0.02], [[sx * 0.05, 0.1, 0.123 + st], 0.014, 0.015], [[sx * 0.05, 0.055, 0.125 + st], 0.017, 0.018], [[sx * 0.05, 0.028, 0.13 + st], 0.016, 0.017]], legP, 10);
    hoofH(sx * 0.05, 0.13 + st);
    limb(H, c, [[[sx * 0.05, 0.36, -0.16], 0.048, 0.075], [[sx * 0.056, 0.26, -0.13], 0.036, 0.05], [[sx * 0.052, 0.18, -0.18 - st], 0.019, 0.026], [[sx * 0.05, 0.1, -0.17 - st], 0.014, 0.015], [[sx * 0.05, 0.055, -0.165 - st], 0.017, 0.018], [[sx * 0.05, 0.028, -0.16 - st], 0.016, 0.017]], legP, 10);
    hoofH(sx * 0.05, -0.158 - st);
  }
  // Tail: short dun dock hairs, then long black switch
  tube(H, [[0, 0.37, -0.23], [0, 0.33, -0.27], [0.004, 0.27, -0.28]], 0.02, 0.016, c, (x, y, z) => mx(c, dk, sst(0.33, 0.28, y)));
  tuft(H, dk, [0.004, 0.28, -0.28], [0.02, -1, -0.12], 0.16, 0.02, 6, 0.25, '#4a3a2c');
  // Thick neck, upright mane, heavy head
  sw(H, [{ p: [0, 0.38, 0.12], w: 0.065, h: 0.085 }, { p: [0, 0.44, 0.18], w: 0.05, h: 0.07 }, { p: [0, 0.5, 0.22], w: 0.042, h: 0.058 }, { p: [0, 0.545, 0.245], w: 0.04, h: 0.05 }], c, coat, { radial: 14, sub: 4 });
  const mane: V3[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13, y = 0.44 + t * 0.15, z = 0.135 + t * 0.12;
    const base: V3 = [0, y - 0.005 + t * 0.002, z - 0.03 - t * 0.02];
    mane.push(base);
    blade(H, i % 2 ? dk : '#3a2c20', base, [0, base[1] + 0.045 - t * 0.008, base[2] - 0.022], 0.012, 0.006, [1, 0, 0]);
  }
  const h = grp(H, [0, 0.575, 0.26], [1.15, 0, 0]);
  const face: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, mealy, sst(0.1, 0.13, z) + sst(-0.012, -0.03, y) * sst(0.06, 0.1, z));
    col = mx(col, '#4a3a2c', sst(0.17, 0.185, z) * 0.7);
    if (ny > 0.6 && z < 0.08) col = mx(col, sh(c, 0.9), 0.3);
    return speck(col, x, y, z, 0.04);
  };
  sw(h, [{ p: [0, 0.005, -0.02], w: 0.04, h: 0.048 }, { p: [0, 0.005, 0.04], w: 0.038, h: 0.046 }, { p: [0, -0.004, 0.12], w: 0.03, h: 0.036 }, { p: [0, -0.008, 0.17], w: 0.031, h: 0.034 }, { p: [0, -0.01, 0.19], w: 0.024, h: 0.026 }], c, face, { radial: 14, sub: 3, caps: true });
  for (const sx of [-1, 1]) {
    el(h, '#2a2018', sx * 0.017, 0.0, 0.188, 0.006, 0.009, 0.004);
    eye(h, sx * 0.037, 0.018, 0.035, 0.0095, sx * 1.15, '#2a1a10', c);
    el(h, mealy, sx * 0.037, 0.012, 0.04, 0.011, 0.007, 0.012); // pale eye ring
    ear(h, [sx * 0.022, 0.04, -0.03], [-0.85, sx * 0.2, -sx * 0.25], 0.013, 0.04, c, '#3a2c20', true);
  }
  // Mane continues to the poll as an upright brush between the ears (no forelock)
  blade(h, dk, [0, 0.03, -0.045], [0, 0.07, -0.055], 0.012, 0.006, [1, 0, 0]);
};

/** Philippine tarsier: palm-sized primate with enormous goggle eyes, papery ears, long padded fingers and a thin tail, clinging to an upright stem. */
const tarsier: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#9a8268', lt = '#c8b49a', skin = '#c8a090';
  ground(gp, 0.42, 0.42, ['#4f4a2a', '#3a3a20', '#5e6a32'], { seed: 37 });
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39, rr = 0.2 + hash3(i, 4, 5) * 0.18, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    blade(gp, ['#8a5a2a', '#6b4a2a', '#a07a3a', '#5e6a32'][i % 4], [x, 0.006, z], [x + Math.cos(a * 3) * 0.05, 0.008, z + Math.sin(a * 3) * 0.05], 0.018, 0.003, [0, 1, 0]);
  }
  for (const [x, z, yaw, l, c2] of [[0.26, -0.24, -2.5, 0.2, '#3f7a34'], [0.26, -0.24, -1.4, 0.17, '#4f8e3c'], [-0.3, 0.16, 0.9, 0.18, '#3f7a34'], [-0.3, 0.16, 2.2, 0.15, '#4a8a3a']] as const) bigLeaf(gp, [x, 0, z], yaw, l, 0.055, c2, 0.9, 0.9);
  for (const [x, z, s] of [[0.3, 0.2, 1.1], [-0.25, -0.28, 1.2]] as const) grass(gp, x, z, ['#6f9a3a', '#3f6a26'], s, 7, x * 9);
  // Upright sapling with a side twig and leaves
  const bark = barkP('#6a5040');
  sw(gp, [{ p: [-0.02, 0, -0.06], w: 0.03 }, { p: [-0.01, 0.2, -0.065], w: 0.024 }, { p: [-0.015, 0.42, -0.06], w: 0.02 }, { p: [-0.03, 0.62, -0.05], w: 0.014 }], '#6a5040', bark, { radial: 10, sub: 4, caps: true });
  tube(gp, [[-0.015, 0.47, -0.06], [-0.1, 0.55, -0.07], [-0.16, 0.6, -0.06]], 0.008, 0.004, '#6a5040');
  for (const [x, y, z, yaw] of [[-0.16, 0.6, -0.06, -1.2], [-0.12, 0.57, -0.07, 2.3], [-0.03, 0.62, -0.05, 0.4]] as const) bigLeaf(gp, [x, y, z], yaw, 0.08, 0.03, '#4f8e3c', 0.5, 0.4);
  const T = grp(gp, [-0.015, 0, 0.0], [0, 0.35, 0]);
  T.scale.setScalar(1.7);
  const fur: Paint = (x, y, z, _nx, ny) => speck(mx(mx(c, lt, sst(0.2, -0.4, ny) * 0.4), sh(c, 0.85), sst(0.5, 0.8, vnoise(x * 120, y * 120, z * 120)) * 0.3), x, y, z, 0.06);
  // Body hugging the stem (stem at local z≈-0.035)
  blob(T, c, 0, 0.17, -0.005, 0.034, 0.05, 0.03, fur, [-0.1, 0, 0], 14);
  blob(T, lt, 0, 0.16, 0.012, 0.022, 0.034, 0.014, fur, [-0.1, 0, 0], 10);
  // Long frog-like hind legs folded, gripping lower down
  for (const sx of [-1, 1]) {
    limb(T, c, [[[sx * 0.022, 0.135, -0.005], 0.02, 0.024], [[sx * 0.04, 0.12, 0.025], 0.015, 0.016], [[sx * 0.035, 0.085, 0.018], 0.01, 0.01], [[sx * 0.026, 0.07, -0.01], 0.008, 0.008], [[sx * 0.018, 0.066, -0.028], 0.006, 0.006]], fur, 8);
    for (let k = 0; k < 3; k++) { const y = 0.064 - k * 0.008; tube(T, [[sx * 0.016, y, -0.03], [sx * 0.014, y - 0.002, -0.046], [sx * 0.006, y - 0.004, -0.054]], 0.0026, 0.002, skin, undefined, 5); el(T, skin, sx * 0.006, y - 0.004, -0.054, 0.0036); }
    // Arms reaching to the stem with long padded fingers
    limb(T, c, [[[sx * 0.026, 0.2, 0.0], 0.011, 0.012], [[sx * 0.034, 0.205, -0.015], 0.007, 0.007], [[sx * 0.02, 0.215, -0.03], 0.005, 0.005]], fur, 7);
    for (let k = 0; k < 4; k++) { const y = 0.222 - k * 0.006; tube(T, [[sx * 0.018, 0.215, -0.03], [sx * 0.016, y, -0.042], [sx * 0.005, y - 0.002, -0.05]], 0.0018, 0.0015, skin, undefined, 5); el(T, skin, sx * 0.005, y - 0.002, -0.05, 0.003); }
  }
  // Long thin naked tail with a sparse tuft, hanging down the stem
  tube(T, [[0, 0.13, -0.03], [0.004, 0.08, -0.035], [0.006, 0.02, -0.02], [0.0, -0.04, -0.012]], 0.004, 0.0025, sh(c, 0.85));
  tuft(T, c, [0.0, -0.035, -0.012], [0, -1, 0.1], 0.03, 0.004, 4, 0.25);
  // Round head turned to the viewer, huge eyes, big ears
  const h = grp(T, [0, 0.245, 0.006], [0.0, 0.25, 0]);
  blob(h, c, 0, 0, 0, 0.036, 0.034, 0.032, fur, [0, 0, 0], 16);
  blob(h, lt, 0, -0.01, 0.022, 0.03, 0.022, 0.014, undefined, [0, 0, 0], 12);
  for (const sx of [-1, 1]) {
    const e = grp(h, [sx * 0.0145, 0.004, 0.026], [0, sx * 0.25, 0]);
    el(e, '#5a4630', 0, 0, -0.004, 0.017, 0.017, 0.012);
    el(e, '#c89a3a', 0, 0, 0.002, 0.0155, 0.0155, 0.01);
    el(e, '#0c0806', 0, 0, 0.007, 0.011, 0.011, 0.007);
    lit(el(e, '#ffffff', -0.004, 0.005, 0.0135, 0.0028));
    ear(h, [sx * 0.028, 0.024, -0.01], [-0.1, sx * 0.4, -sx * 0.55], 0.018, 0.032, skin, '#e8c0b0');
  }
  el(h, '#5a3a30', 0, -0.012, 0.035, 0.005, 0.0035, 0.004);
  tube(h, [[-0.006, -0.02, 0.033], [0, -0.022, 0.035], [0.006, -0.02, 0.033]], 0.0012, 0.0012, '#5a3a30', undefined, 4);
};

/** Iberian lynx: spotted tawny cat with long black ear tufts, a barred beard ruff and a short black-tipped tail, on a Mediterranean rock. */
const lynx: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#c89a5a', belly = '#f0e6d2';
  ground(gp, 0.46, 0.44, ['#a89060', '#8a7a48', '#7a8a48'], { seed: 41 });
  // Scrub: rock outcrop, rosemary/lentisk bushes, a small cork-oak sapling
  rock(gp, '#a8a090', -0.2, 0.0, -0.2, 0.15, 0.11, 0.12, 0.4, '#8a9a5a');
  rock(gp, '#9a9282', 0.22, 0.0, -0.18, 0.08, 0.06, 0.07, 1.2);
  for (const [x, z, s] of [[0.26, -0.22, 0.09], [0.32, 0.14, 0.07], [-0.3, 0.2, 0.06]] as const)
    blob(gp, '#4f6a34', x, s * 0.5, z, s, s * 0.8, s, (px, py, pz, _nx, ny) => speck(mx('#3e5a2c', '#7a9a4a', sst(-0.2, 0.9, ny) * 0.6), px * 3, py * 3, pz * 3, 0.15), [0, x * 4, 0], 10);
  for (const [x, z, s] of [[0.36, -0.06, 1.2], [-0.36, 0.0, 1.3], [0.16, 0.34, 1.0], [-0.12, 0.36, 1.1]] as const) grass(gp, x, z, ['#c8b870', '#8a8a48'], s, 6, x * 9 + z);
  const L = grp(gp, [0.03, 0, 0.04], [0, 0.5, 0]);
  L.scale.setScalar(1.15);
  const coat: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.25 ? mx(c, belly, sst(-0.25, -0.65, ny)) : mx(c, sh(c, 1.06), sst(0.4, 1, ny) * 0.3);
    col = mx(col, INK, spotK(x, y, z, 34, 0.36) * (ny < -0.5 ? 0.5 : 0.85));
    return speck(col, x, y, z, 0.05);
  };
  spine(L, [
    { p: [0, 0.26, -0.19], w: 0.03, h: 0.03 }, { p: [0, 0.265, -0.165], w: 0.058, h: 0.064 }, { p: [0, 0.27, -0.1], w: 0.06, h: 0.07 },
    { p: [0, 0.27, -0.02], w: 0.058, h: 0.072 }, { p: [0, 0.27, 0.06], w: 0.058, h: 0.078 }, { p: [0, 0.285, 0.12], w: 0.046, h: 0.062 }, { p: [0, 0.3, 0.14], w: 0.02, h: 0.024 },
  ], c, coat, { nv: 30, nu: 48 });
  for (const sx of [-1, 1]) blob(L, c, sx * 0.034, 0.255, -0.13, 0.038, 0.066, 0.056, coat, [0.2, 0, 0], 14);
  const legP: Paint = (x, y, z, nx, ny, nz) => coat(x, y, z, nx, ny, nz);
  for (const sx of [-1, 1]) {
    const st = sx * 0.02;
    limb(L, c, [[[sx * 0.036, 0.27, 0.07], 0.026, 0.036], [[sx * 0.04, 0.19, 0.07], 0.02, 0.025], [[sx * 0.038, 0.1, 0.075 + st], 0.014, 0.016], [[sx * 0.038, 0.035, 0.08 + st], 0.012, 0.013], [[sx * 0.038, 0.016, 0.088 + st], 0.014, 0.016]], legP, 9);
    paw(L, sh(c, 0.95), sx * 0.038, 0.1 + st, 0.017);
    limb(L, c, [[[sx * 0.038, 0.27, -0.13], 0.032, 0.05], [[sx * 0.044, 0.19, -0.1], 0.025, 0.034], [[sx * 0.04, 0.12, -0.15 - st], 0.014, 0.018], [[sx * 0.039, 0.05, -0.14 - st], 0.012, 0.013], [[sx * 0.039, 0.016, -0.128 - st], 0.014, 0.016]], legP, 9);
    paw(L, sh(c, 0.95), sx * 0.039, -0.115 - st, 0.017);
  }
  // Short bobbed tail with a black tip
  sw(L, [{ p: [0, 0.27, -0.18], w: 0.016 }, { p: [0, 0.255, -0.22], w: 0.017 }, { p: [0, 0.23, -0.245], w: 0.015 }, { p: [0, 0.215, -0.252], w: 0.008 }], c,
    (x, y, z) => mx(mx(c, INK, spotK(x, y, z, 60, 0.3)), INK, sst(0.236, 0.226, y)), { radial: 10, sub: 3, caps: true });
  sw(L, [{ p: [0, 0.29, 0.1], w: 0.04, h: 0.052 }, { p: [0, 0.32, 0.15], w: 0.034, h: 0.044 }, { p: [0, 0.345, 0.18], w: 0.03, h: 0.036 }], c, coat, { radial: 12, sub: 3 });
  const h = grp(L, [0, 0.36, 0.195], [0.05, -0.3, 0]);
  const face: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, belly, sst(-0.008, -0.022, y) * 0.9 + sst(0.03, 0.045, z) * 0.4);
    col = mx(col, INK, spotK(x, y, z, 130, 0.28) * sst(0.0, 0.02, y + z * 0.3) * 0.8);
    if (ny > 0.4) col = mx(col, sh(c, 0.92), 0.3);
    return speck(col, x, y, z, 0.04);
  };
  blob(h, c, 0, 0, 0, 0.038, 0.034, 0.036, face, [0, 0, 0], 14);
  sw(h, [{ p: [0, -0.008, 0.018], w: 0.024, h: 0.022 }, { p: [0, -0.012, 0.04], w: 0.019, h: 0.017 }, { p: [0, -0.014, 0.05], w: 0.012, h: 0.012 }], c, face, { radial: 10, sub: 3, caps: true });
  el(h, '#4a2a26', 0, -0.006, 0.054, 0.007, 0.005, 0.004);
  el(h, belly, 0, -0.026, 0.036, 0.014, 0.008, 0.012);
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.018, 0.01, 0.029, 0.0075, sx * 0.35, '#a8902a', c, 0.4);
    // Beard ruff: pale flare with black bars hanging below the cheeks
    const rp: V3 = [sx * 0.036, -0.022, 0.0];
    drop(h, belly, [sx * 0.028, -0.004, 0.006], [rp[0] * 1.15, rp[1] - 0.012, rp[2]], 0.016, 0.008);
    for (let k = 0; k < 2; k++) tube(h, [[sx * (0.03 + k * 0.004), 0.0 - k * 0.01, 0.012 - k * 0.004], [sx * (0.04 + k * 0.004), -0.018 - k * 0.008, 0.006 - k * 0.004]], 0.0024, 0.0018, INK, undefined, 5);
    const e = ear(h, [sx * 0.024, 0.028, -0.01], [-0.15, sx * 0.3, -sx * 0.35], 0.016, 0.032, sh(c, 0.85), '#efe2cc', true);
    tube(e, [[0, 0.03, 0], [0, 0.045, 0.002], [0, 0.058, 0.004]], 0.003, 0.0012, INK, undefined, 5); // black ear tuft
  }
};

/** Arabian oryx: brilliant white antelope with chocolate legs, a black face mask and very long straight horns, on desert dunes. */
const oryx: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#f2efe8', dk = '#3a2a22', brown = '#6a4a36';
  const sand: Paint = (x, y, z) => speck(mx(mx('#e8c088', '#d4a068', sst(0.4, 0.9, Math.sin(x * 60 + Math.sin(z * 10) * 3 + z * 26) * 0.5 + 0.5) * 0.45), '#f0d09a', sst(0.5, 0.8, vnoise(x * 8, y * 8, z * 8)) * 0.4), x, y, z, 0.03);
  ground(gp, 0.46, 0.44, ['#e8c088', '#d4a068', '#f0d09a'], { seed: 43, paint: sand });
  blob(gp, '#e0b07a', 0.18, -0.02, -0.25, 0.26, 0.09, 0.14, sand, [0, -0.5, 0], 14);
  for (const [x, z] of [[-0.32, -0.18], [0.32, 0.18]]) { for (let k = 0; k < 6; k++) { const a = k * 1.05; tube(gp, [[x, 0, z], [x + Math.cos(a) * 0.03, 0.04, z + Math.sin(a) * 0.03], [x + Math.cos(a) * 0.055, 0.06, z + Math.sin(a) * 0.055]], 0.003, 0.0015, '#8a7a50', undefined, 4); } blob(gp, '#9aa060', x, 0.045, z, 0.04, 0.025, 0.04, undefined, [0, 0, 0], 8); }
  const O = grp(gp, [0.0, 0, 0.03], [0, 0.6, 0]);
  O.scale.setScalar(1.08);
  const coat: Paint = (x, y, z, _nx, ny) => speck(mx(c, '#e2dccf', sst(-0.2, -0.8, ny) * 0.4), x, y, z, 0.03);
  spine(O, [
    { p: [0, 0.32, -0.21], w: 0.03, h: 0.03 }, { p: [0, 0.325, -0.185], w: 0.062, h: 0.07 }, { p: [0, 0.32, -0.12], w: 0.07, h: 0.08 },
    { p: [0, 0.32, -0.03], w: 0.07, h: 0.082 }, { p: [0, 0.335, 0.06], w: 0.068, h: 0.086 }, { p: [0, 0.35, 0.12], w: 0.054, h: 0.07 }, { p: [0, 0.36, 0.145], w: 0.025, h: 0.03 },
  ], c, coat, { nv: 20 });
  for (const sx of [-1, 1]) blob(O, c, sx * 0.034, 0.31, -0.15, 0.038, 0.07, 0.06, coat, [0.2, 0, 0], 12);
  // Legs: dark brown upper legs and a dark band at the knee, white below, black hooves
  const legP: Paint = (x, y, z, nx, ny, nz) => {
    if (y > 0.27) return coat(x, y, z, nx, ny, nz);
    let col = mx(dk, brown, 0.3);
    col = mx(col, c, sst(0.12, 0.1, y) * sst(0.02, 0.04, y));
    col = mx(col, dk, sst(0.04, 0.03, y));
    return speck(mx(col, c, sst(0.27, 0.29, y)), x, y, z, 0.03);
  };
  for (const sx of [-1, 1]) {
    const st = sx * 0.018;
    limb(O, c, [[[sx * 0.036, 0.32, 0.09], 0.026, 0.036], [[sx * 0.04, 0.24, 0.09], 0.018, 0.022], [[sx * 0.038, 0.15, 0.095 + st], 0.011, 0.013], [[sx * 0.038, 0.06, 0.1 + st], 0.009, 0.01], [[sx * 0.038, 0.022, 0.105 + st], 0.01, 0.011]], legP, 8);
    hoof(O, '#1a1612', sx * 0.038, 0.11 + st, 0.014);
    limb(O, c, [[[sx * 0.038, 0.33, -0.15], 0.032, 0.054], [[sx * 0.044, 0.24, -0.12], 0.024, 0.034], [[sx * 0.04, 0.16, -0.17 - st], 0.012, 0.016], [[sx * 0.039, 0.06, -0.16 - st], 0.009, 0.01], [[sx * 0.039, 0.022, -0.15 - st], 0.01, 0.011]], legP, 8);
    hoof(O, '#1a1612', sx * 0.039, -0.145 - st, 0.014);
  }
  tube(O, [[0, 0.33, -0.205], [0.002, 0.29, -0.225], [0.004, 0.23, -0.23]], 0.009, 0.007, c);
  tuft(O, dk, [0.004, 0.235, -0.23], [0, -1, -0.05], 0.06, 0.01, 5, 0.3);
  // Neck with a dark throat patch, head with black mask
  sw(O, [{ p: [0, 0.35, 0.1], w: 0.044, h: 0.06 }, { p: [0, 0.39, 0.15], w: 0.036, h: 0.048 }, { p: [0, 0.43, 0.185], w: 0.031, h: 0.038 }], c,
    (x, y, z, _nx, ny) => speck(mx(c, brown, sst(-0.3, -0.7, ny) * sst(0.36, 0.4, y) * 0.8), x, y, z, 0.03), { radial: 12, sub: 3 });
  const h = grp(O, [0, 0.445, 0.2], [0.55, -0.15, 0]);
  const face: Paint = (x, y, z, _nx, ny) => {
    // Black forehead patch, black bands from eye down to cheek, black nose band, white elsewhere
    const ax = Math.abs(x);
    let k = sst(0.02, 0.03, y) * sst(0.02, 0.0, z) * sst(0.024, 0.016, ax); // forehead
    k = Math.max(k, sst(0.008, 0.002, Math.abs(y + 0.003 - (0.03 - z) * 0.25)) * sst(0.014, 0.02, ax) * sst(0.075, 0.06, z)); // eye-to-cheek band
    k = Math.max(k, sst(0.06, 0.068, z) * sst(0.088, 0.08, z) * sst(-0.4, 0.2, ny)); // nose band
    return speck(mx(c, dk, k), x, y, z, 0.02);
  };
  blob(h, c, 0, 0, 0, 0.03, 0.032, 0.034, face, [0, 0, 0], 14);
  sw(h, [{ p: [0, -0.002, 0.02], w: 0.025, h: 0.026 }, { p: [0, -0.005, 0.06], w: 0.019, h: 0.02 }, { p: [0, -0.007, 0.095], w: 0.016, h: 0.016 }], c, face, { radial: 12, sub: 3, caps: true });
  for (const sx of [-1, 1]) {
    el(h, '#1a1410', sx * 0.008, -0.004, 0.1, 0.004, 0.003, 0.003);
    eye(h, sx * 0.026, 0.008, 0.022, 0.0075, sx * 1.0, '#2a1a10', dk);
    ear(h, [sx * 0.024, 0.022, -0.018], [-0.5, sx * 0.4, -sx * 0.9], 0.012, 0.032, c, '#e8dcd0', true);
    // Long, nearly straight ringed horns sweeping back
    const n = 12, a0: V3 = [sx * 0.012, 0.024, -0.008], a1: V3 = [sx * 0.03, 0.2, -0.13];
    sw(h, Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return { p: lerp3(a0, a1, t), w: (0.0075 - t * 0.0055) * (t < 0.45 && i % 2 ? 1.18 : 1) }; }), '#2a2420', undefined, { radial: 8, sub: 1, caps: true });
  }
};

/** Giant anteater: long tube snout, grey coat with a white-edged black shoulder stripe, pale forelegs on curled claws and a huge bushy flag tail. */
const anteater: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#9c907c', dk = '#2a2420', pale = '#ece6d6';
  ground(gp, 0.46, 0.44, ['#a8985a', '#8a8448', '#b89a68'], { seed: 47 });
  // Cerrado: tall termite mound, tussock grass, a stunted twisted shrub
  const mound: Paint = (x, y, z) => speck(mx('#b8784a', '#9a5a36', sst(0.4, 0.8, fbm(x * 30, y * 12, z * 30, 2))), x, y, z, 0.05);
  sw(gp, [{ p: [-0.3, 0.0, -0.22], w: 0.1 }, { p: [-0.3, 0.12, -0.225], w: 0.075 }, { p: [-0.305, 0.25, -0.23], w: 0.05 }, { p: [-0.31, 0.34, -0.235], w: 0.022 }, { p: [-0.31, 0.37, -0.235], w: 0.004 }], '#b8784a', mound, { radial: 10, sub: 3, caps: true });
  blob(gp, '#b8784a', -0.3, 0.0, -0.22, 0.13, 0.05, 0.12, mound, [0, 0, 0], 12);
  sw(gp, [{ p: [-0.22, 0.0, -0.29], w: 0.05 }, { p: [-0.225, 0.1, -0.29], w: 0.032 }, { p: [-0.23, 0.18, -0.29], w: 0.01 }], '#b8784a', mound, { radial: 8, sub: 3, caps: true });
  for (const [x, y, z, sz] of [[-0.25, 0.08, -0.18, 0.04], [-0.33, 0.16, -0.18, 0.035], [-0.27, 0.22, -0.22, 0.03]] as const) blob(gp, '#a86a40', x, y, z, sz, sz * 0.8, sz * 0.7, mound, [0, x * 9, 0], 8);
  el(gp, '#3a2216', -0.22, 0.05, -0.17, 0.02, 0.016, 0.012, 0.8);
  for (const [x, z, s] of [[0.32, 0.16, 1.6], [0.3, -0.24, 1.5], [-0.34, 0.12, 1.4], [-0.08, 0.36, 1.2], [0.12, -0.36, 1.4]] as const) grass(gp, x, z, ['#d8c070', '#9a9048'], s, 8, x * 9 + z);
  const A = grp(gp, [0.04, 0, 0.0], [0, 0.6, 0]);
  A.scale.setScalar(1.05);
  // Diagonal black band from throat up over the shoulder, bordered in white
  const bandD = (y: number, z: number) => z - 0.15 + (y - 0.18) * 0.9;
  const coat: Paint = (x, y, z, _nx, ny) => {
    let col = mx(c, sh(c, 0.85), sst(0.0, -0.15, z) * 0.5);
    if (ny < -0.4) col = mx(col, dk, 0.4);
    const d = bandD(y, z);
    const taper = 1 - sst(0.24, 0.34, y) * 0.5;
    col = mx(col, pale, sst(0.08, 0.058, Math.abs(d) / taper));
    col = mx(col, dk, sst(0.04, 0.02, Math.abs(d) / taper));
    col = mx(col, sh(c, 0.75), sst(0.6, 0.85, vnoise(x * 80, y * 20, z * 80)) * 0.3);
    return speck(col, x, y, z, 0.06);
  };
  spine(A, [
    { p: [0, 0.24, -0.16], w: 0.04, h: 0.04 }, { p: [0, 0.25, -0.13], w: 0.068, h: 0.08 }, { p: [0, 0.26, -0.06], w: 0.075, h: 0.088 },
    { p: [0, 0.27, 0.02], w: 0.074, h: 0.09 }, { p: [0, 0.26, 0.09], w: 0.066, h: 0.084 }, { p: [0, 0.235, 0.14], w: 0.048, h: 0.058 },
    { p: [0, 0.22, 0.17], w: 0.036, h: 0.04 },
  ], c, coat, { nv: 40, nu: 56, shape: (u, a) => (Math.sin(a) > 0.7 ? 1 + 0.12 * sst(0.7, 1, Math.sin(a)) * sst(0.2, 0.5, u) * sst(0.95, 0.7, u) : 1) });
  // Legs: pale forelegs with a black wrist band, knuckle-walking on curled claws; dark hind legs
  const fl: Paint = (x, y, z) => speck(mx(pale, dk, sst(0.07, 0.06, y) * sst(0.03, 0.04, y)), x, y, z, 0.05);
  for (const sx of [-1, 1]) {
    const st = sx * 0.02;
    limb(A, pale, [[[sx * 0.05, 0.25, 0.1], 0.034, 0.042], [[sx * 0.06, 0.16, 0.1], 0.026, 0.03], [[sx * 0.058, 0.07, 0.105 + st], 0.02, 0.022], [[sx * 0.056, 0.025, 0.11 + st], 0.02, 0.024]], fl, 9);
    for (let k = -1; k <= 1; k++) tube(A, [[sx * 0.056 + k * 0.009, 0.03, 0.125 + st], [sx * 0.058 + k * 0.01, 0.012, 0.13 + st], [sx * 0.054 + k * 0.009, 0.006, 0.116 + st]], 0.005, 0.003, '#3a3028', undefined, 5);
    limb(A, c, [[[sx * 0.05, 0.25, -0.11], 0.04, 0.06], [[sx * 0.06, 0.15, -0.09], 0.03, 0.036], [[sx * 0.056, 0.06, -0.12 - st], 0.02, 0.022], [[sx * 0.055, 0.018, -0.11 - st], 0.018, 0.024]], (x, y, z) => speck(mx(sh(c, 0.85), dk, sst(0.12, 0.05, y)), x, y, z, 0.05), 9);
    blob(A, dk, sx * 0.055, 0.01, -0.095 - st, 0.02, 0.01, 0.03, undefined, [0, 0, 0], 9);
  }
  // Huge flag tail: tall, flat, long coarse hair streaming down
  const tailP: Paint = (x, y, z) => speck(mx(mx('#3a322a', '#7a6e5e', sst(0.4, 0.8, vnoise(x * 30, y * 200, z * 30)) * 0.7), c, sst(0.18, 0.28, y) * 0.5), x, y, z, 0.1);
  sw(A, [{ p: [0, 0.25, -0.15], w: 0.03, h: 0.05 }, { p: [0, 0.23, -0.22], w: 0.028, h: 0.085 }, { p: [0, 0.2, -0.3], w: 0.024, h: 0.1 }, { p: [0.01, 0.17, -0.37], w: 0.018, h: 0.09 }, { p: [0.02, 0.14, -0.42], w: 0.008, h: 0.05 }], dk, tailP, { radial: 12, sub: 4, caps: true });
  for (let i = 0; i < 9; i++) { const z = -0.2 - i * 0.025, y = 0.14 - i * 0.008; blade(A, i % 2 ? '#3a322a' : '#6a5e50', [0, y + 0.04, z], [0, y - 0.04 + i * 0.004, z - 0.03], 0.016, 0.004, [1, 0, 0]); }
  // Head: tapering, slightly down-curved tube snout, tiny eye and round ear, black nose
  const h = grp(A, [0, 0.21, 0.18], [0.28, 0, 0]);
  const hp: Paint = (x, y, z, _nx, ny) => speck(mx(mx(c, '#a89a88', 0.3), dk, sst(0.18, 0.2, z) + (ny < -0.6 ? 0.2 : 0)), x, y, z, 0.04);
  sw(h, [{ p: [0, 0.0, -0.01], w: 0.036, h: 0.04 }, { p: [0, -0.002, 0.04], w: 0.026, h: 0.028 }, { p: [0, -0.008, 0.1], w: 0.017, h: 0.018 }, { p: [0, -0.016, 0.16], w: 0.012, h: 0.012 }, { p: [0, -0.026, 0.205], w: 0.009, h: 0.009 }], c, hp, { radial: 10, sub: 3, caps: true });
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.022, 0.012, 0.03, 0.0045, sx * 1.1, '#1a1210');
    el(h, sh(c, 0.85), sx * 0.026, 0.024, 0.0, 0.011, 0.013, 0.006, 0, 0, 0);
  }
  tube(h, [[0, -0.03, 0.205], [0, -0.04, 0.215], [0.006, -0.048, 0.225]], 0.0022, 0.0012, '#c87080', undefined, 4); // tongue flick
};

/** Andean condor: huge black vulture with a white neck ruff, bald comb-topped head and white wing panels, spreading its wings on an Andean crag. */
const condor: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#1c1a1c', wh = '#f2f0ea', skin = '#8a5a50';
  ground(gp, 0.44, 0.42, ['#8a8a5a', '#7a7048', '#9a9a6a'], { seed: 53 });
  // Crag rising in the middle, puna bunch-grass, distant snowy peak
  const rp: Paint = (x, y, z, _nx, ny) => { let col = mx('#7a7068', '#58504a', sst(0.3, 0.8, vnoise(x * 25, y * 25, z * 25))); col = mx(col, '#9a9a6a', sst(0.7, 0.95, ny) * 0.5); return speck(col, x, y, z, 0.06); };
  blob(gp, '#6e665e', 0.0, 0.0, 0.0, 0.17, 0.2, 0.14, rp, [0, 0.4, 0.06], 14);
  blob(gp, '#6e665e', -0.1, 0.0, 0.06, 0.1, 0.12, 0.09, rp, [0, 1.2, 0], 12);
  blob(gp, '#6e665e', 0.09, 0.0, -0.08, 0.09, 0.1, 0.08, rp, [0, 0.2, 0], 12);
  rock(gp, '#6e665e', -0.26, 0.0, -0.24, 0.08, 0.1, 0.07, 0.8, '#8a9a5a');
  for (const [x, z, s] of [[0.3, 0.2, 1.6], [-0.3, 0.18, 1.5], [0.28, -0.22, 1.4], [0.04, 0.34, 1.3], [-0.34, -0.06, 1.2]] as const) grass(gp, x, z, ['#d8c890', '#a89a58'], s, 9, x * 9 + z);
  const B = grp(gp, [0.0, 0.19, 0.0], [0, -0.35, 0]);
  B.scale.setScalar(1.15);
  const plum: Paint = (x, y, z) => speck(mx(c, '#3a3a40', sst(0.5, 0.8, vnoise(x * 90, y * 90, z * 90)) * 0.4), x, y, z, 0.06);
  // Body upright-ish, tail down behind the rock top
  spine(B, [
    { p: [0, 0.01, -0.08], w: 0.03, h: 0.02 }, { p: [0, 0.03, -0.06], w: 0.06, h: 0.05 }, { p: [0, 0.07, -0.03], w: 0.075, h: 0.07 },
    { p: [0, 0.11, 0.0], w: 0.072, h: 0.07 }, { p: [0, 0.15, 0.02], w: 0.055, h: 0.055 }, { p: [0, 0.17, 0.03], w: 0.04, h: 0.04 },
  ], c, plum, { nv: 18 });
  blade(B, c, [0, 0.03, -0.07], [0, -0.04, -0.15], 0.04, 0.008, [0, 0.4, -1]);
  // Fluffy white ruff collar
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; el(B, wh, Math.cos(a) * 0.032, 0.175 + Math.sin(a * 2) * 0.004, 0.035 + Math.sin(a) * 0.028, 0.017, 0.014, 0.017); }
  // Bare neck and head with fleshy comb
  sw(B, [{ p: [0, 0.18, 0.04], w: 0.018 }, { p: [0, 0.21, 0.055], w: 0.016 }, { p: [0, 0.23, 0.075], w: 0.016 }], skin, (x, y, z) => mx(skin, '#5a3a36', sst(0.5, 0.8, vnoise(x * 200, y * 200, z * 200))), { radial: 10, sub: 3 });
  const h = grp(B, [0, 0.24, 0.085], [0.2, -0.5, 0]);
  blob(h, '#4a3632', 0, 0, 0, 0.024, 0.022, 0.03, (x, y, z) => mx('#5a3c36', '#7a5048', sst(0.5, 0.8, vnoise(x * 200, y * 200, z * 200))), [0, 0, 0], 12);
  sw(h, [{ p: [0, -0.002, 0.022], w: 0.012, h: 0.014 }, { p: [0, -0.003, 0.042], w: 0.009, h: 0.012 }, { p: [0, -0.012, 0.054], w: 0.005, h: 0.006 }], '#d8ccb0', (_x, _y, z) => mx('#d8ccb0', '#4a3a30', sst(0.03, 0.02, z)), { radial: 8, sub: 3, caps: true });
  sw(h, [{ p: [0, 0.018, -0.012], w: 0.004, h: 0.008 }, { p: [0, 0.03, 0.006], w: 0.005, h: 0.014 }, { p: [0, 0.024, 0.03], w: 0.004, h: 0.008 }], '#3a2826', undefined, { radial: 8, sub: 3, caps: true }); // comb
  for (const sx of [-1, 1]) eye(h, sx * 0.019, 0.006, 0.012, 0.005, sx * 1.2, '#a82a1a');
  // Half-spread wings: dark coverts, white secondary panel, splayed black primary 'fingers'
  for (const sx of [-1, 1]) {
    const W = grp(B, [sx * 0.06, 0.15, 0.0], [0.1, 0, sx * 0.35]);
    sw(W, [{ p: [0, 0, 0], w: 0.026, h: 0.016 }, { p: [sx * 0.08, 0.03, -0.01], w: 0.022, h: 0.012 }, { p: [sx * 0.17, 0.04, -0.02], w: 0.016, h: 0.01 }, { p: [sx * 0.24, 0.035, -0.03], w: 0.01, h: 0.008 }], c, plum, { radial: 8, sub: 3, caps: true });
    for (let k = 0; k < 8; k++) {
      const t = k / 7, x = sx * (0.02 + t * 0.2), y = 0.03 + Math.sin(t * Math.PI) * 0.012;
      blade(W, k % 2 ? '#e8e6e0' : wh, [x, y - 0.005, -0.02], [x + sx * 0.008, y - 0.13 + t * 0.03, -0.05], 0.026, 0.004, [0, 0.1, 1]);
      blade(W, c, [x, y + 0.008, -0.012], [x + sx * 0.006, y - 0.06, -0.03], 0.03, 0.005, [0, 0.1, 1]);
    }
    for (let k = 0; k < 6; k++) {
      const a = -0.5 + k * 0.22;
      blade(W, c, [sx * 0.23, 0.035, -0.03], [sx * (0.23 + Math.cos(a) * 0.15), 0.035 + Math.sin(a) * 0.15, -0.06], 0.017, 0.004, [0, 0.1, 1]);
    }
  }
  // Grey feet gripping the crag
  for (const sx of [-1, 1]) {
    tube(B, [[sx * 0.03, 0.04, 0.0], [sx * 0.032, 0.0, 0.01], [sx * 0.032, -0.012, 0.016]], 0.009, 0.007, '#6a6460');
    for (let k = -1; k <= 1; k++) tube(B, [[sx * 0.032, -0.012, 0.016], [sx * 0.032 + k * 0.016, -0.016, 0.04]], 0.004, 0.003, '#6a6460', undefined, 5);
  }
};

/** Scarlet macaw: brilliant red parrot with yellow and blue wings, white bare face and a long pointed tail, perched in the Amazon canopy. */
const macaw: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#e0201a', yel = '#f6c21a', blu = '#1e5ac8', face = '#f4f0ea';
  ground(gp, 0.4, 0.4, ['#4e6e2e', '#3a5a26', '#6e7a3a'], { seed: 59 });
  for (const [x, z, yaw, l, c2] of [[0.26, -0.2, -2.6, 0.2, '#3f7a34'], [0.26, -0.2, -1.4, 0.16, '#4f8e3c'], [0.28, 0.2, 2.4, 0.15, '#3f7a34'], [-0.12, 0.3, 0.6, 0.14, '#4a8a3a']] as const) bigLeaf(gp, [x, 0, z], yaw, l, 0.055, c2, 0.9, 0.9);
  for (const [x, z, s] of [[-0.05, -0.32, 1.2], [0.3, 0.02, 1.0]] as const) grass(gp, x, z, ['#6f9a3a', '#3f6a26'], s, 7, x * 9);
  // Curving tree limb with a fork, vine and a few clay-lick red nuts
  const bark = '#6a4a32', bp = barkP(bark, 1.2);
  sw(gp, [{ p: [-0.28, -0.01, -0.04], w: 0.055 }, { p: [-0.26, 0.12, -0.04], w: 0.04 }, { p: [-0.2, 0.26, -0.04], w: 0.032 }, { p: [-0.08, 0.33, -0.04], w: 0.028 }, { p: [0.08, 0.35, -0.04], w: 0.024 }, { p: [0.22, 0.37, -0.04], w: 0.016 }, { p: [0.28, 0.39, -0.04], w: 0.008 }], bark, bp, { radial: 12, sub: 4 });
  tube(gp, [[-0.21, 0.25, -0.04], [-0.27, 0.36, -0.08], [-0.3, 0.46, -0.1]], 0.014, 0.006, bark, bp);
  for (const [at, rot] of [[[-0.3, 0.46, -0.1], [-0.5, -0.6, 0]], [[-0.28, 0.4, -0.09], [0.3, 1.2, -0.4]], [[0.28, 0.39, -0.04], [-0.2, 1.6, 0]], [[0.2, 0.37, -0.04], [0.6, 2.4, 0.2]]] as [V3, V3][]) leaf(gp, '#3f8a3a', at, 0.04, 0.1, rot, 0.006, 0.2);
  tube(gp, [[0.12, 0.355, -0.04], [0.14, 0.25, -0.02], [0.13, 0.12, -0.03], [0.15, 0.0, -0.02]], 0.004, 0.004, '#4a6a2a', undefined, 5);
  const b = grp(gp, [0.0, 0.345, -0.04], [0, 0.5, 0]);
  b.scale.setScalar(1.25);
  const plum: Paint = (x, y, z) => speck(c, x, y, z, 0.05);
  // Body upright on the perch
  spine(b, [
    { p: [0, 0.03, -0.07], w: 0.026, h: 0.026 }, { p: [0, 0.05, -0.055], w: 0.045, h: 0.045 }, { p: [0, 0.09, -0.03], w: 0.055, h: 0.055 },
    { p: [0, 0.13, -0.008], w: 0.052, h: 0.052 }, { p: [0, 0.165, 0.005], w: 0.042, h: 0.042 }, { p: [0, 0.185, 0.01], w: 0.032, h: 0.032 },
  ], c, plum, { nv: 20 });
  blob(b, c, 0, 0.2, 0.015, 0.04, 0.04, 0.044, plum, [0, 0, 0], 16);
  // Folded wings: red shoulder, yellow coverts with green fringe, blue flight feathers reaching the tail
  for (const sx of [-1, 1]) {
    const wp: Paint = (x, y, z) => {
      let col = c;
      col = mx(col, yel, sst(0.135, 0.12, y) * sst(0.06, 0.075, y + z * 0.3));
      col = mx(col, blu, sst(0.07, 0.055, y + z * 0.3));
      return speck(col, x, y, z, 0.05);
    };
    sw(b, [{ p: [sx * 0.05, 0.16, 0.0], w: 0.012, h: 0.03 }, { p: [sx * 0.056, 0.12, -0.03], w: 0.013, h: 0.04 }, { p: [sx * 0.05, 0.07, -0.07], w: 0.011, h: 0.036 }, { p: [sx * 0.035, 0.02, -0.11], w: 0.008, h: 0.022 }, { p: [sx * 0.018, -0.02, -0.13], w: 0.004, h: 0.01 }], c, wp, { radial: 10, sub: 4 });
  }
  // Long graduated tail: red with blue tips, hanging below the branch
  for (const [dx, len, w] of [[0, 0.3, 0.022], [-0.016, 0.24, 0.018], [0.016, 0.24, 0.018]] as const)
    blade(b, c, [dx, 0.03, -0.075], [dx * 1.6, 0.03 - len, -0.12], w, 0.005, [0, 0.15, -1]);
  for (const [dx, len] of [[0, 0.3], [-0.016, 0.24], [0.016, 0.24]] as const)
    blade(b, blu, [dx * 1.5, 0.03 - len * 0.62, -0.112], [dx * 1.6, 0.03 - len - 0.004, -0.122], 0.015, 0.005, [0, 0.15, -1]);
  blob(b, blu, 0, 0.03, -0.06, 0.03, 0.02, 0.025, undefined, [0.4, 0, 0], 10); // blue rump
  // Feet gripping the branch
  for (const sx of [-1, 1]) for (const k of [-1, 1]) tube(b, [[sx * 0.022, 0.02, -0.01], [sx * 0.024, 0.008, k * 0.016], [sx * 0.024, -0.008, k * 0.022]], 0.004, 0.003, '#5a5a5a', undefined, 5);
  // Head: white bare face with fine feather lines, pale hooked upper bill and black lower mandible
  const h = grp(b, [0, 0.205, 0.03], [0.1, 0.35, 0]);
  for (const sx of [-1, 1]) {
    el(h, face, sx * 0.022, -0.004, 0.018, 0.012, 0.016, 0.018);
    for (let k = 0; k < 3; k++) tube(h, [[sx * 0.031, 0.006 - k * 0.006, 0.01], [sx * 0.033, 0.004 - k * 0.006, 0.026]], 0.0008, 0.0008, '#c83a2a', undefined, 3);
    eye(h, sx * 0.03, 0.006, 0.012, 0.0055, sx * 1.25, '#f0e8c0', face, 0.45);
  }
  const bk: V3[] = [[0, 0.004, 0.03], [0, 0.002, 0.05], [0, -0.012, 0.064], [0, -0.032, 0.066], [0, -0.042, 0.058]];
  sw(h, bk.map((p, i) => ({ p, w: 0.016 * (1 - i / 4.5) + 0.002, h: 0.02 * (1 - i / 4.5) + 0.002 })), '#e8dccc', (_x, y) => mx('#efe6d8', '#3a3230', sst(-0.03, -0.04, y)), { radial: 10, sub: 3, caps: true });
  blob(h, '#1e1a1a', 0, -0.022, 0.04, 0.014, 0.012, 0.016, undefined, [0.3, 0, 0], 10);
};

/** Tasmanian devil: stocky black marsupial with a white chest band, glowing pink ears and a wide-open toothy 'yawn', on a mossy log. */
const tasdevil: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#1c1a1a', wh = '#f4f0e8', pink = '#e89a9a';
  ground(gp, 0.44, 0.42, ['#4e5a2e', '#3a4224', '#6a5a3a'], { seed: 61 });
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39, rr = 0.22 + hash3(i, 6, 5) * 0.17, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    blade(gp, ['#8a6a3a', '#6b5a3a', '#a0803a', '#5e6a32'][i % 4], [x, 0.006, z], [x + Math.cos(a * 3) * 0.045, 0.008, z + Math.sin(a * 3) * 0.045], 0.014, 0.003, [0, 1, 0]);
  }
  // Fallen mossy log behind, tree-fern fronds
  const bp: Paint = (x, y, z, nx, ny, nz) => { const col = barkP('#5a4636', 1.2)(x, y, z, nx, ny, nz)!; return mx(col, '#5e8a34', sst(0.5, 0.9, ny) * sst(0.4, 0.6, vnoise(x * 30, y * 30, z * 30))); };
  sw(gp, [{ p: [-0.36, 0.05, -0.12], w: 0.06 }, { p: [-0.1, 0.055, -0.24], w: 0.055 }, { p: [0.16, 0.05, -0.32], w: 0.05 }], '#5a4636', bp, { radial: 12, sub: 4, caps: true });
  el(gp, '#c8a87a', -0.36, 0.05, -0.12, 0.05, 0.05, 0.012, 1.1);
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.3; bigLeaf(gp, [0.3, 0, 0.12], a, 0.15, 0.035, k % 2 ? '#3f7a34' : '#4f8e3c', 0.7, 0.8); }
  for (const [x, z] of [[-0.3, 0.22], [0.14, 0.34]]) rock(gp, '#7a7466', x, 0, z, 0.04, 0.025, 0.035, x * 5, '#5e7a3a');
  const D = grp(gp, [0.0, 0, 0.04], [0, 0.45, 0]);
  D.scale.setScalar(1.3);
  const fur: Paint = (x, y, z, _nx, ny) => speck(mx(c, '#3a3434', sst(0.4, 1, ny) * 0.4 + sst(0.6, 0.85, vnoise(x * 120, y * 120, z * 120)) * 0.3), x, y, z, 0.06);
  // Chunky body sloping down to the rump
  const bodyP: Paint = (x, y, z, nx, ny, nz) => {
    const col = fur(x, y, z, nx, ny, nz)!;
    // White chest band across the front
    const band = sst(0.016, 0.008, Math.abs(z - 0.075 + (y - 0.1) * 0.35)) * sst(0.0, 0.2, nz + 0.3);
    return mx(col, wh, band);
  };
  spine(D, [
    { p: [0, 0.14, -0.15], w: 0.03, h: 0.03 }, { p: [0, 0.145, -0.13], w: 0.058, h: 0.056 }, { p: [0, 0.15, -0.07], w: 0.066, h: 0.066 },
    { p: [0, 0.155, 0.0], w: 0.068, h: 0.07 }, { p: [0, 0.16, 0.06], w: 0.064, h: 0.07 }, { p: [0, 0.165, 0.1], w: 0.05, h: 0.056 },
  ], c, bodyP, { nv: 22, nu: 36 });
  for (const sx of [-1, 1]) {
    const st = sx * 0.012;
    limb(D, c, [[[sx * 0.04, 0.14, 0.06], 0.025, 0.03], [[sx * 0.048, 0.07, 0.07], 0.017, 0.018], [[sx * 0.048, 0.02, 0.075 + st], 0.015, 0.017]], fur, 8);
    paw(D, '#2a2424', sx * 0.048, 0.085 + st, 0.014, sx * 0.2, '#d8ccc0');
    limb(D, c, [[[sx * 0.042, 0.14, -0.1], 0.03, 0.04], [[sx * 0.05, 0.08, -0.08], 0.02, 0.024], [[sx * 0.048, 0.04, -0.11 - st], 0.014, 0.016], [[sx * 0.048, 0.015, -0.1 - st], 0.014, 0.017]], fur, 8);
    paw(D, '#2a2424', sx * 0.048, -0.088 - st, 0.014, sx * 0.2, '#d8ccc0');
  }
  // Thick tail (fat store)
  sw(D, [{ p: [0, 0.14, -0.14], w: 0.024 }, { p: [0, 0.12, -0.19], w: 0.022 }, { p: [0.01, 0.09, -0.23], w: 0.015 }, { p: [0.02, 0.07, -0.25], w: 0.006 }], c, fur, { radial: 10, sub: 3, caps: true });
  // Big head, mouth agape showing pink inside and white teeth
  const h = grp(D, [0, 0.19, 0.12], [-0.2, -0.35, 0]);
  blob(h, c, 0, 0, 0, 0.05, 0.044, 0.048, fur, [0, 0, 0], 16);
  // Upper jaw/snout
  sw(h, [{ p: [0, 0.0, 0.025], w: 0.04, h: 0.03 }, { p: [0, 0.004, 0.06], w: 0.03, h: 0.022 }, { p: [0, 0.006, 0.08], w: 0.022, h: 0.016 }], c, fur, { radial: 12, sub: 3, caps: true });
  el(h, '#d88a8a', 0, 0.012, 0.09, 0.012, 0.008, 0.008); // pink nose
  blob(h, '#c8706a', 0, -0.015, 0.05, 0.028, 0.006, 0.032, undefined, [0, 0, 0], 10); // palate
  // Lower jaw dropped open
  const j = grp(h, [0, -0.022, 0.012], [0.65, 0, 0]);
  sw(j, [{ p: [0, 0.0, 0.0], w: 0.034, h: 0.016 }, { p: [0, 0.0, 0.04], w: 0.026, h: 0.012 }, { p: [0, 0.002, 0.066], w: 0.018, h: 0.01 }], c, fur, { radial: 10, sub: 3, caps: true });
  blob(j, '#d87a7a', 0, 0.008, 0.035, 0.02, 0.005, 0.028, undefined, [0, 0, 0], 10); // tongue
  for (const sx of [-1, 1]) {
    drop(h, wh, [sx * 0.016, -0.012, 0.074], [sx * 0.017, -0.032, 0.076], 0.0042); // upper canines
    drop(j, wh, [sx * 0.014, 0.008, 0.06], [sx * 0.015, 0.024, 0.062], 0.0036); // lower canines
    for (let k = 0; k < 3; k++) { drop(h, wh, [sx * (0.02 + k * 0.003), -0.012, 0.062 - k * 0.012], [sx * (0.02 + k * 0.003), -0.021, 0.062 - k * 0.012], 0.0032); drop(j, wh, [sx * (0.017 + k * 0.003), 0.008, 0.048 - k * 0.012], [sx * (0.017 + k * 0.003), 0.016, 0.048 - k * 0.012], 0.003); }
    eye(h, sx * 0.03, 0.02, 0.034, 0.008, sx * 0.55, '#0e0a0a', c);
    ear(h, [sx * 0.036, 0.034, -0.012], [-0.25, sx * 0.4, -sx * 0.55], 0.022, 0.03, '#5a3a3a', pink);
    for (let k = 0; k < 3; k++) tube(h, [[sx * 0.04, 0.0 + k * 0.004, 0.068], [sx * (0.06 + k * 0.004), -0.002 + k * 0.006, 0.075]], 0.0008, 0.0006, '#3a3434', undefined, 3);
  }
};

/** Quokka: round, smiling little wallaby of Rottnest Island, sitting up on its haunches nibbling a leaf. */
const quokka: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#8a7058', lt = '#b8a088', dk = '#4a3a30';
  const sand: Paint = (x, y, z) => speck(mx('#e0cc9a', '#c8b07a', sst(0.4, 0.8, vnoise(x * 12, 2, z * 12)) * 0.6), x, y, z, 0.03);
  ground(gp, 0.44, 0.42, ['#e0cc9a', '#c8b07a', '#d8c08a'], { seed: 67, paint: sand });
  // Coastal heath shrubs, a limestone rock and spinifex tufts
  for (const [x, z, sz] of [[-0.26, -0.24, 0.1], [0.28, -0.2, 0.08], [-0.3, 0.16, 0.07]] as const)
    blob(gp, '#5a7a3a', x, sz * 0.6, z, sz, sz * 0.8, sz, (px, py, pz, _nx, ny) => speck(mx('#4a6a30', '#8aa858', sst(-0.2, 0.9, ny) * 0.6), px * 3, py * 3, pz * 3, 0.15), [0, x * 4, 0], 10);
  rock(gp, '#d8d0b8', 0.24, 0, 0.14, 0.07, 0.05, 0.06, 0.6);
  for (const [x, z, s] of [[0.04, -0.34, 1.3], [0.34, 0.0, 1.1], [-0.14, 0.34, 1.0], [0.18, 0.32, 1.1]] as const) grass(gp, x, z, ['#a8b060', '#7a8a40'], s, 8, x * 9 + z);
  const Q = grp(gp, [-0.01, 0, 0.03], [0, -0.25, 0]);
  Q.scale.setScalar(1.7);
  const fur: Paint = (x, y, z, _nx, ny, nz) => {
    let col = mx(c, lt, sst(0.0, 0.6, nz) * sst(0.05, 0.12, y) * 0.5);
    col = mx(col, sh(c, 0.85), sst(0.6, 0.85, vnoise(x * 150, y * 150, z * 150)) * 0.3);
    return speck(col, x, y, z, 0.06);
  };
  // Pear-shaped sitting body
  blob(Q, c, 0, 0.075, -0.01, 0.055, 0.07, 0.05, fur, [-0.25, 0, 0], 16);
  blob(Q, c, 0, 0.045, -0.02, 0.06, 0.045, 0.055, fur, [0, 0, 0], 14);
  // Big hind feet flat on the ground and thighs
  for (const sx of [-1, 1]) {
    blob(Q, c, sx * 0.04, 0.04, -0.01, 0.03, 0.035, 0.045, fur, [0, 0, 0], 12);
    sw(Q, [{ p: [sx * 0.04, 0.008, -0.03], w: 0.014, h: 0.01 }, { p: [sx * 0.042, 0.007, 0.03], w: 0.012, h: 0.008 }, { p: [sx * 0.042, 0.006, 0.05], w: 0.008, h: 0.006 }], dk, undefined, { radial: 8, sub: 3, caps: true });
  }
  // Short tail lying behind
  tube(Q, [[0, 0.02, -0.06], [0.01, 0.01, -0.1], [0.03, 0.006, -0.14]], 0.012, 0.005, sh(c, 0.85));
  // Small forearms held up to the mouth, holding a leaf
  for (const sx of [-1, 1]) {
    limb(Q, c, [[[sx * 0.03, 0.115, 0.025], 0.011, 0.011], [[sx * 0.022, 0.1, 0.05], 0.008, 0.008], [[sx * 0.01, 0.112, 0.062], 0.006, 0.006]], fur, 7);
    el(Q, dk, sx * 0.008, 0.114, 0.064, 0.006, 0.005, 0.006);
  }
  leaf(Q, '#5a9a3a', [0.0, 0.1, 0.07], 0.012, 0.04, [-0.5, 0.3, 0.2], 0.003, 0.25);
  // Round head: short muzzle, black nose, little smile, round ears
  const h = grp(Q, [0, 0.165, 0.025], [0.05, -0.2, 0]);
  blob(h, c, 0, 0, 0, 0.04, 0.036, 0.038, fur, [0, 0, 0], 16);
  sw(h, [{ p: [0, -0.006, 0.02], w: 0.026, h: 0.022 }, { p: [0, -0.009, 0.04], w: 0.019, h: 0.016 }, { p: [0, -0.01, 0.05], w: 0.012, h: 0.01 }], c, fur, { radial: 10, sub: 3, caps: true });
  el(h, '#1a1414', 0, -0.004, 0.053, 0.009, 0.007, 0.005);
  tube(h, [[-0.012, -0.022, 0.041], [-0.006, -0.025, 0.046], [0, -0.022, 0.048], [0.006, -0.025, 0.046], [0.012, -0.022, 0.041]], 0.0014, 0.0014, '#2a1a18', undefined, 4); // smile
  for (const sx of [-1, 1]) {
    eye(h, sx * 0.019, 0.01, 0.029, 0.0075, sx * 0.45, '#140e0c', c, 0.5);
    ear(h, [sx * 0.026, 0.03, -0.01], [-0.1, sx * 0.4, -sx * 0.45], 0.017, 0.022, c, '#a88a7a');
  }
};

/** Orca: black-and-white killer whale porpoising out of a Pacific swell — tall dorsal fin, white eye patch and belly, grey saddle. */
const orca: Builder = (gp, r) => {
  const c = (r.color as string) ?? '#14161a', wh = '#f4f6f8', grey = '#9aa2aa';
  water(gp, 0.46, 0.44, [[-0.2, -0.24, 0.04], [0.22, 0.24, 0.04], [0.0, 0.0, 0.06]], '#2a6a94', 0, 0, -0.01);
  // Rocky islet with conifers at the back (Salish Sea coast)
  rock(gp, '#5a5650', -0.28, 0, -0.3, 0.12, 0.07, 0.09, 0.4, '#5e7a3a');
  for (const [x, z, hgt] of [[-0.31, -0.31, 0.2], [-0.24, -0.33, 0.15]] as const) {
    tube(gp, [[x, 0.04, z], [x, 0.04 + hgt, z]], 0.006, 0.004, '#4a3a2a', undefined, 5);
    for (let k = 0; k < 3; k++) drop(gp, k % 2 ? '#2a5a34' : '#336a3c', [x, 0.06 + k * hgt * 0.25, z], [x, 0.06 + k * hgt * 0.25 + hgt * 0.45, z], 0.035 - k * 0.008);
  }
  const O = grp(gp, [0.02, 0, 0.04], [0, 0.95, 0]);
  // Body arc: tail fluke dipping into the water behind, head arching down in front
  const NU = 60, NV = 24;
  const body = spine(O, [
    { p: [0, 0.02, -0.33], w: 0.012, h: 0.016 }, { p: [0, 0.08, -0.27], w: 0.028, h: 0.034 }, { p: [0, 0.15, -0.18], w: 0.05, h: 0.06 },
    { p: [0, 0.2, -0.07], w: 0.068, h: 0.08 }, { p: [0, 0.215, 0.03], w: 0.072, h: 0.084 }, { p: [0, 0.2, 0.12], w: 0.064, h: 0.074 },
    { p: [0, 0.16, 0.2], w: 0.048, h: 0.054 }, { p: [0, 0.12, 0.245], w: 0.03, h: 0.032 }, { p: [0, 0.1, 0.262], w: 0.012, h: 0.012 },
  ], c, undefined, { nu: NU, nv: NV });
  {
    const col = body.geometry.getAttribute('color') as THREE.BufferAttribute, cc = new THREE.Color();
    for (let i = 0; i <= NU; i++) for (let j = 0; j < NV; j++) {
      const u = i / NU, a = (j / NV) * Math.PI * 2, s = Math.sin(a), ca = Math.abs(Math.cos(a));
      let k = sst(-0.45, -0.6, s) * sst(0.36, 0.42, u) * sst(0.98, 0.94, u); // belly and chin
      k = Math.max(k, sst(0.0, -0.15, s - (sst(0.3, 0.42, u) * sst(0.56, 0.46, u)) * 0.45) * sst(0.3, 0.36, u) * sst(0.56, 0.5, u)); // flank lobe
      k = Math.max(k, sst(0.022, 0.012, Math.hypot((u - 0.86) * 0.9, (s - 0.32) * 0.06)) * sst(0.4, 0.6, ca)); // eye patch
      let hex = mx(c, wh, k);
      hex = mx(hex, grey, sst(0.7, 0.85, s) * sst(0.38, 0.42, u) * sst(0.54, 0.48, u) * 0.85); // saddle
      cc.set(hex); col.setXYZ(i * NV + j, cc.r, cc.g, cc.b);
    }
    col.needsUpdate = true;
  }
  // Tall dorsal fin
  const fin = slab(O, [[-0.05, 0], [0.035, 0], [0.012, 0.06], [-0.005, 0.13], [-0.018, 0.17], [-0.03, 0.1]], 0.012, c, 0.004);
  fin.position.set(0, 0.27, 0.0); fin.rotation.set(0, -Math.PI / 2, -0.02);
  // Pectoral paddles and tail flukes
  for (const sx of [-1, 1]) {
    const pf = slab(O, [[0, 0.02], [0.03, 0.03], [0.07, 0.02], [0.08, -0.01], [0.05, -0.03], [0, -0.02]], 0.008, c, 0.003);
    pf.position.set(sx * 0.055, 0.14, 0.15); pf.rotation.set(0.3, sx * -2.0, sx * -0.6);
    const fl = slab(O, [[0, 0.012], [0.04, 0.03], [0.075, 0.02], [0.07, 0.0], [0.03, -0.012], [0, -0.008]], 0.008, c, 0.003);
    fl.position.set(sx * 0.004, 0.025, -0.33); fl.rotation.set(-Math.PI / 2 + 0.7, 0, sx > 0 ? 0 : Math.PI); fl.scale.set(1, sx, 1);
  }
  eye(O, 0.034, 0.165, 0.2, 0.0045, 1.1, '#1a1210');
  eye(O, -0.034, 0.165, 0.2, 0.0045, -1.1, '#1a1210');
  // Splash: white spray where the body leaves and re-enters the water
  for (let k = 0; k < 12; k++) {
    const a = k * 0.52, rr = 0.05 + hash3(k, 1, 2) * 0.04, z0 = k < 6 ? 0.26 : -0.3;
    const x = Math.cos(a) * rr, z = z0 + Math.sin(a) * rr * 0.6;
    drop(O, k % 2 ? '#e8f4fa' : '#ffffff', [x, 0.0, z], [x * 1.4, 0.03 + hash3(k, 4, 1) * 0.05, z + (z - z0) * 0.4], 0.009);
  }
  el(O, '#e0f0f8', 0, 0.0, 0.27, 0.07, 0.008, 0.05);
  el(O, '#e0f0f8', 0, 0.0, -0.31, 0.05, 0.008, 0.04);
};

// ---- Pack ----
export const H_ANIMALS3: Record<string, Builder> = {
  an_cheetah: cheetah,
  an_rhino: rhino,
  an_chameleon: chameleon,
  an_fennec: fennec,
  an_yak: yak,
  an_pangolin: pangolin,
  an_gharial: gharial,
  an_saiga: saiga,
  an_takhi: takhi,
  an_tarsier: tarsier,
  an_lynx: lynx,
  an_oryx: oryx,
  an_anteater: anteater,
  an_condor: condor,
  an_macaw: macaw,
  an_tasdevil: tasdevil,
  an_quokka: quokka,
  an_orca: orca,
};
