import { passerby } from '../human.ts';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Builder, type V3, type Paint, g, add, mat, box, cyl, rbox, rod, skin, sweep, lathe, prism, panel, archPath, paintFaces, shade, mix, fbm, hash3, tree } from '../prims.ts';
import { type HFn, island, sstep, ridged, strataSide, pine } from '../nature.ts';
import { pblob } from '../animals.ts';
import { grp } from '../kit/town.ts';

// Hero builders for: abusimbel, djenne, hassan2, rushmore, gatewayarch, teotihuacan, milford.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.

// ---- local helpers ----------------------------------------------------------------------------------------
const LO = () => g('w2:sph8', () => new THREE.SphereGeometry(0.5, 8, 6));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
const frac = (v: number) => v - Math.floor(v);
const G2 = (a: number, b: number, ca: number, cb: number, wa: number, wb: number) => Math.exp(-(((a - ca) / wa) ** 2 + ((b - cb) / wb) ** 2));

/** Moves a fresh geometry into model space (so paint sees model coordinates), paints it and adds it. */
function place(p: THREE.Object3D, geo: THREE.BufferGeometry, base: string, paint?: Paint, x = 0, y = 0, z = 0, ry = 0, o: { flat?: boolean; metal?: number; rough?: number } = {}): THREE.Mesh {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
  return add(p, paintFaces(geo, base, paint), mat('#ffffff', { vc: true, flat: o.flat ?? true, metal: o.metal, rough: o.rough }), 0, 0, 0, 1, 1, 1);
}
/** Painted box, base at y. */
function pbox(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, base: string, paint?: Paint, seg: V3 = [1, 1, 1], ry = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  geo.translate(0, h / 2, 0);
  return place(p, geo, base, paint, x, y, z, ry);
}
/** Painted tapered box (talud, battered walls): bottom w0×d0, top w1×d1 shifted by (ox, oz) in the local frame. */
function frustum(p: THREE.Object3D, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number, base: string,
  paint?: Paint, seg: V3 = [1, 1, 1], ry = 0, ox = 0, oz = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1, seg[0], seg[1], seg[2]);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5;
    pos.setXYZ(i, pos.getX(i) * (w0 + (w1 - w0) * t) + ox * t, t * h, pos.getZ(i) * (d0 + (d1 - d0) * t) + oz * t);
  }
  geo.computeVertexNormals();
  return place(p, geo, base, paint, x, y, z, ry);
}
function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, s = 1): void {
  passerby(p, x, y, z, 0.0165 * s, 1, { top: c });
}

type Disp = (x: number, y: number, z: number) => number;
const SPHERES = new Map<number, THREE.BufferGeometry>();
/** Sculpted head: a unit sphere pushed along its radius by `disp`; `paint` sees head-local coords (face toward +z). */
function sculptHead(p: THREE.Object3D, c: string, ctr: V3, s: number, rot: V3, disp: Disp, paint?: Paint, seg = 32, ax: V3 = [0.8, 1, 0.86]): THREE.Mesh {
  let base = SPHERES.get(seg);
  if (!base) {
    base = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.8));
    base.deleteAttribute('normal'); base.deleteAttribute('uv');
    base = mergeVertices(base);
    SPHERES.set(seg, base);
  }
  const geo = base.clone();
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 1 + disp(x, y, z);
    pos.setXYZ(i, x * ax[0] * k, y * ax[1] * k, z * ax[2] * k);
  }
  geo.computeVertexNormals();
  const pg = paintFaces(geo, c, paint);
  pg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...ctr), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(s, s, s)));
  return add(p, pg, mat('#ffffff', { flat: false, vc: true }), 0, 0, 0, 1, 1, 1);
}
/** Shadowed eyes and mouth slit set into a sculptHead surface — sub-facet details that still read at thumbnail scale. */
function faceFeat(p: THREE.Object3D, c: string, ctr: V3, s: number, rot: V3, disp: Disp, ax: V3 = [0.8, 1, 0.86], mouth = true, es = 1): void {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...ctr), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(s, s, s));
  const at = (x: number, y: number, k: number, sx: number, sy: number, sz: number) => {
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y)), d = (1 + disp(x, y, z)) * k;
    const v = new THREE.Vector3(x * ax[0] * d, y * ax[1] * d, z * ax[2] * d).applyMatrix4(m);
    blob(p, c, v.x, v.y, v.z, sx * s, sy * s, sz * s, rot[1], rot[0], rot[2]);
  };
  for (const sx of [-1, 1]) at(sx * 0.29, 0.14, 0.985, 0.13 * es, 0.055 * es, 0.05);
  if (mouth) at(0, -0.39, 0.985, 0.15 * es, 0.03 * es, 0.04);
}
/** Faceted broken-stone chunk (icosahedron with jittered vertices). */
function chunk(p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, ry = 0, rx = 0): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(1, 1), pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i), b = pos.getY(i), e = pos.getZ(i);
    const k = 0.72 + 0.45 * hash3(Math.round(a * 9) + seed, Math.round(b * 9), Math.round(e * 9));
    pos.setXYZ(i, a * k, b * k, e * k);
  }
  geo.computeVertexNormals();
  return add(p, geo, mat(c), x, y, z, sx, sy, sz, ry, rx);
}

interface FaceOpts { nose?: number; brow?: number; chin?: number; socket?: number; stache?: number; beard?: number; hair?: number; lips?: number; pupil?: number; glasses?: number; hollow?: number; wig?: number }
/** Generic carved human face: nose bridge & tip, deep eye sockets, brow ridge, cheekbones, mouth, chin, ears. */
function faceDisp(o: FaceOpts = {}): Disp {
  return (x, y, z) => {
    const ax = Math.abs(x), f = sstep(0.05, 0.6, z);
    let d = 0;
    d += f * (0.06 * G2(x, y, 0, 0.12, 0.08, 0.16) + (o.nose ?? 0.2) * G2(x, y, 0, -0.1, 0.085, 0.12));
    d += f * 0.05 * G2(ax, y, 0.1, -0.2, 0.05, 0.05);
    d -= f * (o.socket ?? 0.12) * G2(ax, y, 0.3, 0.15, 0.16, 0.1);
    d += f * 0.05 * G2(ax, y, 0.3, 0.14, 0.06, 0.045);
    d += f * (o.brow ?? 0.07) * G2(ax, y, 0.28, 0.31, 0.2, 0.07);
    d += f * 0.045 * G2(ax, y, 0.42, -0.1, 0.13, 0.12);
    d -= f * 0.06 * G2(x, y, 0, -0.39, 0.2, 0.022);
    d += f * (o.lips ?? 0.035) * (G2(x, y, 0, -0.34, 0.16, 0.045) + G2(x, y, 0, -0.45, 0.13, 0.04));
    d += f * (o.chin ?? 0.08) * G2(x, y, 0, -0.66, 0.2, 0.1);
    d -= 0.07 * sstep(-0.35, -0.85, y) * sstep(0.25, 0.7, ax) - 0.04 * G2(ax, y, 0.5, -0.45, 0.15, 0.15) * sstep(0, 0.4, z);
    d -= 0.05 * sstep(0.62, 0.95, y);
    d -= 0.035 * G2(ax, y, 0.68, 0.22, 0.12, 0.14) * sstep(0, 0.4, z);
    d += 0.09 * G2(z, y, -0.05, 0.02, 0.13, 0.2) * sstep(0.82, 0.97, ax);
    if (o.stache) d += f * o.stache * G2(x, y, 0, -0.3, 0.3, 0.06);
    if (o.beard) d += o.beard * sstep(-0.35, -0.7, y) * sstep(-0.2, 0.3, z) * (1 - 0.6 * G2(x, y, 0, -0.38, 0.16, 0.05));
    if (o.hair) d += o.hair * sstep(0.35, 0.7, y) * sstep(0.3, -0.2, z);
    if (o.pupil) d += f * o.pupil * G2(ax, y, 0.3, 0.14, 0.05, 0.04);
    if (o.glasses) d += f * (o.glasses * Math.exp(-(((Math.hypot(ax - 0.3, (y - 0.14) * 1.3) - 0.16) / 0.035) ** 2)) + o.glasses * G2(x, y, 0, 0.17, 0.1, 0.03));
    if (o.hollow) d -= f * o.hollow * G2(ax, y, 0.5, -0.22, 0.13, 0.16);
    if (o.wig) d += o.wig * G2(ax, y, 0.9, 0.05, 0.16, 0.35);
    return d;
  };
}

// =========================================================================================================
// Abu Simbel — Great Temple of Ramesses II
const SAND = '#e2c08a';
/** Small standing Egyptian figure (queen/prince statues at the colossi's legs). */
function figure(p: THREE.Object3D, x: number, y: number, z: number, h: number, c: string): void {
  lathe(p, [[0.0001, 0], [h * 0.12, 0], [h * 0.11, h * 0.45], [h * 0.13, h * 0.72], [h * 0.07, h * 0.8], [0.0001, h * 0.8]], c, x, y, z, 8);
  blob(p, c, x, y + h * 0.88, z, h * 0.08, h * 0.1, h * 0.08);
  blob(p, shade(c, 0.94), x, y + h * 0.9, z - h * 0.02, h * 0.1, h * 0.09, h * 0.08);
}
function colossus(p: THREE.Object3D, cx: number, y0: number, broken: boolean): void {
  const C = '#dcb27c', CL = '#e8c592', CD = '#c19461';
  const glyph: Paint = (x, y, z, nx) => (Math.abs(nx) > 0.6 && hash3(Math.floor(z * 260), Math.floor(y * 200), Math.floor(x * 3)) > 0.62 ? CD : null);
  // Throne block (merges into the facade) with carved side panels
  pbox(p, 0.15, 0.14, 0.11, cx, y0, 0.02, shade(C, 0.96), glyph, [1, 10, 8]);
  for (const s of [-1, 1]) {
    const lx = cx + s * 0.032;
    // Massive column-like shins, broad feet with toes, thighs running back to the throne
    sweep(p, [{ p: [lx, y0 + 0.004, 0.086], w: 0.019, h: 0.019 }, { p: [lx, y0 + 0.05, 0.084], w: 0.02, h: 0.022 }, { p: [lx, y0 + 0.1, 0.084], w: 0.021, h: 0.023 }, { p: [lx, y0 + 0.126, 0.086], w: 0.019, h: 0.02 }], C, { up: [0, 0, 1], radial: 10, sub: 2 });
    rbox(p, C, lx, y0, 0.098, 0.034, 0.014, 0.05, 0.005);
    blob(p, CL, lx, y0 + 0.007, 0.121, 0.016, 0.0055, 0.006);
    sweep(p, [{ p: [lx, y0 + 0.124, 0.096], w: 0.021, h: 0.016 }, { p: [lx + s * 0.002, y0 + 0.13, 0.045], w: 0.023, h: 0.019 }, { p: [lx + s * 0.004, y0 + 0.132, -0.01], w: 0.025, h: 0.02 }], C, { radial: 10, sub: 2 });
    blob(p, CL, lx, y0 + 0.124, 0.102, 0.019, 0.015, 0.01);
    if (broken) continue;
    // Arm in one piece: shoulder → elbow at the side → forearm on the thigh → flat hand on the knee
    sweep(p, [{ p: [cx + s * 0.064, y0 + 0.236, -0.002], w: 0.017 }, { p: [cx + s * 0.068, y0 + 0.19, -0.004], w: 0.015 }, { p: [cx + s * 0.062, y0 + 0.156, 0.012], w: 0.014 }, { p: [cx + s * 0.05, y0 + 0.148, 0.05], w: 0.013 }, { p: [cx + s * 0.04, y0 + 0.145, 0.08], w: 0.012 }], C, { radial: 10, sub: 3 });
    blob(p, CL, cx + s * 0.038, y0 + 0.145, 0.092, 0.013, 0.006, 0.018);
  }
  // Kilt with belt and the royal apron
  frustum(p, 0.1, 0.07, 0.085, 0.06, 0.03, cx, y0 + 0.118, 0.0, C);
  figure(p, cx, y0, 0.083, 0.1, CD);
  for (const s of [-1, 1]) figure(p, cx + s * 0.064, y0, 0.074, 0.105, CD);
  if (broken) {
    // Earthquake (27 BC): only the lap and a jagged stump remain on the throne; head and chest lie at its feet
    chunk(p, C, cx, y0 + 0.16, 0.0, 0.052, 0.04, 0.034, 3, 0.3);
    chunk(p, CD, cx + 0.02, y0 + 0.19, -0.01, 0.03, 0.025, 0.025, 7, 1.1, 0.4);
    const hx = cx + 0.02, hz = 0.185;
    // Fallen head lying face-up in the sand, still wearing the nemes and crown stump
    const fd = faceDisp({ nose: 0.14, socket: 0.11 });
    sculptHead(p, CL, [hx, 0.08, hz], 0.033, [-1.2, 0.4, 0.2], fd, undefined, 22);
    faceFeat(p, '#a87c4c', [hx, 0.08, hz], 0.033, [-1.2, 0.4, 0.2], fd);
    chunk(p, C, hx - 0.012, 0.074, hz - 0.035, 0.05, 0.03, 0.032, 11, 0.4);
    lathe(p, [[0.0001, 0], [0.026, 0], [0.025, 0.028], [0.017, 0.05], [0.0001, 0.055]], CL, 0, 0, 0, 10).position.set(cx + 0.062, 0.06, 0.195);
    chunk(p, C, cx - 0.045, 0.072, 0.17, 0.055, 0.034, 0.04, 21, 0.6);
    chunk(p, CD, cx - 0.01, 0.06, 0.24, 0.022, 0.014, 0.018, 31, 1.2);
    chunk(p, C, cx + 0.07, 0.058, 0.25, 0.016, 0.012, 0.014, 41, 0.2);
    return;
  }
  // Torso (smooth loft), broad shoulders, upper arms
  sweep(p, [{ p: [cx, y0 + 0.13, 0.0], w: 0.05, h: 0.034 }, { p: [cx, y0 + 0.165, 0.003], w: 0.043, h: 0.03 }, { p: [cx, y0 + 0.215, 0.006], w: 0.055, h: 0.032 }, { p: [cx, y0 + 0.247, 0.0], w: 0.062, h: 0.028 }], C, { up: [0, 0, 1], radial: 12, sub: 3 });
  pblob(p, CL, cx, y0 + 0.215, 0.018, 0.042, 0.03, 0.022, undefined, [0, 0, 0], 14);
  for (const s of [-1, 1]) blob(p, C, cx + s * 0.054, y0 + 0.238, -0.002, 0.02, 0.016, 0.019);
  // Nemes headcloth: striped side flaps behind the head and lappets falling on the chest
  const stripes: Paint = (_x, y) => (Math.floor(y * 380) % 2 ? CD : null);
  frustum(p, 0.105, 0.04, 0.074, 0.04, 0.065, cx, y0 + 0.23, -0.008, C, stripes, [1, 6, 1]);
  for (const s of [-1, 1]) pbox(p, 0.017, 0.068, 0.011, cx + s * 0.034, y0 + 0.212, 0.027, C, stripes, [1, 7, 1]);
  const hy = y0 + 0.29;
  const fd = faceDisp({ nose: 0.16, socket: 0.12 });
  sculptHead(p, CL, [cx, hy, 0.016], 0.034, [0.05, 0, 0], fd, undefined, 26);
  faceFeat(p, '#a87c4c', [cx, hy, 0.016], 0.034, [0.05, 0, 0], fd);
  blob(p, C, cx, hy + 0.012, -0.006, 0.036, 0.03, 0.034);
  blob(p, C, cx, hy + 0.024, 0.012, 0.031, 0.012, 0.029);
  frustum(p, 0.012, 0.01, 0.009, 0.008, 0.032, cx, hy - 0.058, 0.033, CD, stripes, [1, 3, 1]);
  blob(p, CL, cx, hy + 0.03, 0.04, 0.004, 0.007, 0.004);
  // Double crown (pschent): red deshret cylinder enclosing the bulbous white hedjet
  lathe(p, [[0.0001, 0], [0.033, 0], [0.034, 0.024], [0.03, 0.026], [0.0001, 0.026]], C, cx, hy + 0.022, -0.004, 12);
  lathe(p, [[0.0001, 0], [0.023, 0], [0.022, 0.022], [0.018, 0.046], [0.012, 0.062], [0.009, 0.068], [0.0001, 0.073]], CL, cx, hy + 0.034, -0.004, 12);
}

const abusimbel: Builder = gp => {
  const ST = '#d8b07c';
  const FZ = -0.07, FH = 0.44, FY = 0.035;
  const frontZ = (y: number) => FZ + 0.05 - 0.1023 * (y - FY);
  // Sandstone hill cut back into a recessed forecourt; rock cheeks jut forward on both flanks
  const zf = (x: number) => { const a = Math.abs(x); return a < 0.37 ? -0.075 : -0.075 + (a - 0.37) * 1.9; };
  const hf: HFn = (x, z) => {
    const a = Math.abs(x);
    const top = 0.465 - 0.2 * sstep(0.3, 0.52, a) - 0.16 * sstep(-0.22, -0.5, z) + 0.035 * ridged(x * 7, z * 7);
    let y = 0.004 + 0.006 * fbm(x * 9, 0, z * 9);
    y = Math.max(y, top * sstep(zf(x) + 0.035, zf(x) - 0.05, z));
    const lake = 1 - (((x + 0.34) / 0.22) ** 2 + ((z - 0.34) / 0.14) ** 2);
    if (lake > -0.3) y -= sstep(-0.3, 0.1, lake) * 0.014;
    return y;
  };
  island(gp, 0.5, hf, SAND, (x, y, z, _nx, ny) => {
    if (y < 0.034) return '#c9a46e';
    if (y > 0.07 && ny < 0.72) {
      const band = Math.sin(y * 150 + fbm(x * 6, y * 3, z * 6) * 5);
      return band > 0.55 ? '#c49563' : band < -0.6 ? '#e3c08c' : mix('#d4a873', '#b98a58', fbm(x * 30, y * 30, z * 30));
    }
    if (y > 0.07) return mix('#d9b582', '#c79d68', fbm(x * 14, y * 14, z * 14));
    if (Math.abs(x) < 0.035 && z > 0.12) return Math.floor(z * 120) % 3 ? '#cdb898' : '#c2ad8c';
    return mix(SAND, '#ecd2a2', fbm(x * 10, 0, z * 10));
  }, { rings: 32, segs: 88, side: strataSide(['#c8a06a', '#b38653', '#d6b07a', '#a87b4b']) });

  // Battered facade slab with ashlar coursing
  frustum(gp, 0.78, 0.1, 0.68, 0.08, FH, 0, FY, FZ, ST, (x, y, z, _nx, _ny, nz) => {
    if (nz < 0.5) return hash3(Math.floor(x * 40), Math.floor(y * 40), 1) > 0.5 ? '#cfa673' : null;
    const n = fbm(x * 22, y * 22, z * 5);
    return Math.floor(y * 90) % 4 === 0 ? '#c99f6c' : n > 0.6 ? '#e2bd89' : n < 0.38 ? '#cba06b' : null;
  }, [12, 30, 1], 0, 0, -0.035);
  // Torus moulding framing the facade edges
  for (const s of [-1, 1]) rod(gp, [s * 0.388, FY, frontZ(FY) - 0.004], [s * 0.338, FY + FH, frontZ(FY + FH) - 0.004], 0.006, '#e0bb86', 6);
  // Dedication frieze, cavetto cornice and the row of sun-worshipping baboons
  pbox(gp, 0.62, 0.032, 0.012, 0, 0.405, frontZ(0.42) + 0.004, '#d3a873', (x, y) => (hash3(Math.floor(x * 220), Math.floor(y * 160), 2) > 0.55 ? '#bf9461' : null), [44, 3, 1]);
  pbox(gp, 0.64, 0.012, 0.03, 0, 0.44, frontZ(0.45) - 0.008, '#e3bf8b');
  rod(gp, [-0.32, 0.445, frontZ(0.445) + 0.007], [0.32, 0.445, frontZ(0.445) + 0.007], 0.004, '#cfa673', 6);
  for (let i = 0; i < 22; i++) {
    const x = -0.3 + (i * 0.6) / 21, bz = frontZ(0.47) - 0.006;
    blob(gp, '#d7ad78', x, 0.465, bz, 0.009, 0.013, 0.009);
    blob(gp, '#dcb47f', x, 0.483, bz + 0.003, 0.0065, 0.0065, 0.0072);
  }
  // Terrace in front of the colossi, a few steps and a paved approach
  pbox(gp, 0.8, 0.026, 0.15, 0, FY, 0.06, '#d2ab78', (_x, y, _z, _nx, ny) => (ny < 0.5 && Math.floor(y * 400) % 3 === 0 ? '#b88d5a' : null), [1, 3, 1]);
  for (let i = 0; i < 3; i++) pbox(gp, 0.12, 0.009 * (3 - i), 0.016, 0, FY, 0.142 + i * 0.016, '#dcb987');
  const y0 = FY + 0.026;
  // Doorway into the hypostyle hall and the niche of falcon-headed Ra-Horakhty above it
  pbox(gp, 0.066, 0.122, 0.012, 0, y0, frontZ(0.1) + 0.002, '#e3c18e');
  pbox(gp, 0.044, 0.1, 0.014, 0, y0, frontZ(0.1) + 0.004, '#2a1f17');
  pbox(gp, 0.06, 0.11, 0.008, 0, 0.19, frontZ(0.24) + 0.002, '#a87d4c');
  figure(gp, 0, 0.192, frontZ(0.24) + 0.012, 0.1, '#e0bb87');
  blob(gp, '#e0bb87', 0, 0.284, frontZ(0.28) + 0.018, 0.006, 0.005, 0.009);
  cyl(gp, '#e7c693', 0, 0.296, frontZ(0.3) + 0.01, 0.011, 0.004, 12).rotation.x = Math.PI / 2;
  for (const cx of [-0.255, -0.105, 0.105, 0.255]) colossus(gp, cx, y0, cx === -0.105);
  // Lake Nasser: a smooth water sheet over the depression, clipped to the base disc
  const lakePlan: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, x = -0.34 + Math.cos(a) * 0.2, z = 0.34 + Math.sin(a) * 0.125, r = Math.hypot(x, z);
    lakePlan.push(r > 0.49 ? [(x * 0.49) / r, (z * 0.49) / r] : [x, z]);
  }
  prism(gp, lakePlan, 0, 0.037, '#3889b4');
  // Tourists on the plaza for scale
  const ppl = ['#f8fafc', '#2563eb', '#dc2626', '#f59e0b', '#0f766e', '#f8fafc'];
  for (let i = 0; i < 10; i++) {
    const x = -0.1 + hash3(i, 9, 1) * 0.36, z = 0.17 + hash3(i, 9, 2) * 0.15;
    person(gp, x, FY + hf(x, z), z, ppl[i % ppl.length], 1.8);
  }
  // Nile felucca on Lake Nasser
  const b = grp(gp, -0.33, 0.034, 0.34, 0.5);
  frustum(b, 0.05, 0.014, 0.06, 0.018, 0.008, 0, 0, 0, '#7c5a3a');
  rod(b, [0, 0.008, 0], [0.004, 0.07, 0], 0.0008, '#5b4030', 4);
  sweep(b, [{ p: [0.004, 0.012, 0], w: 0.022, h: 0.0012 }, { p: [0.005, 0.07, 0], w: 0.001, h: 0.0012 }], '#f8fafc', { up: [0, 0, 1], radial: 4, sub: 1 });
};

// =========================================================================================================
// Great Mosque of Djenné — sun-baked mud brick on a raised plinth
/** Many boxes in one mesh: items are [x, y, z, sx, sy, sz, ry] (centre-based). */
function batch(p: THREE.Object3D, items: number[][], c: string): void {
  if (!items.length) return;
  const unit = g('w2:box-ni', () => new THREE.BoxGeometry(1, 1, 1).toNonIndexed()).getAttribute('position');
  const out = new Float32Array(items.length * unit.count * 3), v = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, k) => {
    m.compose(v.set(it[0], it[1], it[2]).clone(), q.setFromAxisAngle(up, it[6] ?? 0), new THREE.Vector3(it[3], it[4], it[5]));
    for (let i = 0; i < unit.count; i++) {
      v.fromBufferAttribute(unit, i).applyMatrix4(m);
      out.set([v.x, v.y, v.z], (k * unit.count + i) * 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.computeVertexNormals();
  add(p, geo, mat(c), 0, 0, 0, 1, 1, 1);
}
/** Hand-plastered mud mass: rounded-rectangle rings (superellipse), gently battered and wobbly, softened top edge. */
function adobe(p: THREE.Object3D, x: number, y: number, z: number, w0: number, d0: number, w1: number, d1: number, h: number, c: string,
  paint?: Paint, np = 28, nr = 4, seed = 0): THREE.Mesh {
  const rings: V3[][] = [];
  const ring = (w: number, d: number, yy: number) => {
    const r: V3[] = [];
    for (let j = 0; j < np; j++) {
      const a = ((j + 0.5) / np) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const px = Math.sign(ca) * Math.abs(ca) ** 0.28 * w / 2, pz = Math.sign(sa) * Math.abs(sa) ** 0.28 * d / 2;
      const k = 1 + 0.03 * (hash3(j + seed, Math.round(yy * 300), 7) - 0.5);
      r.push([x + px * k, yy, z + pz * k]);
    }
    return r;
  };
  for (let i = 0; i <= nr; i++) { const t = i / nr; rings.push(ring(w0 + (w1 - w0) * t, d0 + (d1 - d0) * t, y + h * t)); }
  rings.push(ring(w1 - 0.012, d1 - 0.012, y + h + 0.005));
  return skin(p, rings, c, { paint, flat: false, caps: true });
}
const MUD = '#b98a5a', MUDL = '#c89a6a', MUDD = '#9c7049', STICK = '#6b5038';
const mudPaint: Paint = (x, y, z, _nx, ny) => {
  const n = fbm(x * 30, y * 30, z * 30, 2);
  if (ny > 0.8) return n > 0.55 ? '#c29364' : '#b5875a';
  return n > 0.62 ? MUDL : n < 0.36 ? MUDD : null;
};
/** Rounded mud pilaster with its cone pinnacle in one lathe (shared geometry per size). */
const pilaster = (p: THREE.Object3D, x: number, y: number, z: number, h: number, r: number, sx = 1, sz = 1) =>
  lathe(p, [[0.0001, 0], [r, 0], [r * 0.85, h], [r * 0.62, h + r * 1.1], [r * 0.25, h + r * 2.0], [0.0001, h + r * 2.2]], MUD, x, y, z, 13).scale.set(sx, 1, sz);

const djenne: Builder = gp => {
  const Y0 = 0.035, YP = 0.092, HH = 0.15;
  island(gp, 0.5, (x, z) => 0.003 * fbm(x * 8, 0, z * 8), '#dcb383', (x, _y, z) => {
    const n = fbm(x * 14, 0, z * 14, 3);
    return n > 0.62 ? '#e3bd8f' : n < 0.38 ? '#cfa474' : null;
  }, { rings: 18, segs: 64, side: strataSide(['#9c7350', '#8a6446', '#a87d58']) });
  const sticks: number[][] = [];
  const stickCol = (x: number, y0: number, z: number, y1: number, ry: number, step = 0.03) => {
    for (let y = y0; y <= y1; y += step) sticks.push([x, y, z, 0.0035, 0.0035, 0.03, ry]);
  };
  // Raised plinth with a low perimeter wall, rounded buttress posts and the central stair
  adobe(gp, 0, Y0 - 0.005, -0.1, 0.78, 0.54, 0.76, 0.52, YP - Y0 + 0.005, MUD, mudPaint, 32, 2, 1);
  const PW = 0.03;
  for (const [x, z, w, d] of [[-0.205, 0.158, 0.32, 0.02], [0.205, 0.158, 0.32, 0.02], [-0.375, -0.1, 0.02, 0.5], [0.375, -0.1, 0.02, 0.5]])
    adobe(gp, x, YP - 0.004, z, w, d, w - 0.004, d - 0.004, PW, MUD, mudPaint, 20, 1, 3);
  for (const x of [-0.375, -0.25, -0.13, -0.055, 0.055, 0.13, 0.25, 0.375]) {
    const big = Math.abs(x) < 0.06;
    lathe(gp, [[0.0001, 0], [big ? 0.026 : 0.018, 0], [big ? 0.022 : 0.015, YP - Y0 + PW], [big ? 0.016 : 0.011, YP - Y0 + PW + (big ? 0.035 : 0.014)], [0.0001, YP - Y0 + PW + (big ? 0.05 : 0.022)]], MUD, x, Y0, 0.16, 13);
  }
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    pbox(gp, 0.09, (YP - Y0) * (1 - t), 0.012, 0, Y0, 0.15 + t * 0.075, '#b8895c', (_x, _y, _z, _nx, ny) => (ny > 0.5 ? '#c49668' : null));
  }
  // Prayer hall block and the lower courtyard enclosure behind it
  const ZF = 0.06, ZB = -0.2;
  adobe(gp, 0, YP, (ZF + ZB) / 2, 0.66, ZF - ZB, 0.645, ZF - ZB - 0.012, HH, MUD, mudPaint, 32, 4, 5);
  adobe(gp, 0, YP, -0.27, 0.6, 0.14, 0.59, 0.13, 0.1, MUD, mudPaint, 28, 2, 9);
  // Roof terracotta vents (ventilation pots) and a few skylights
  for (let ix = -3; ix <= 3; ix++) for (let iz = 0; iz < 3; iz++) {
    const x = ix * 0.085, z = ZB + 0.04 + iz * 0.075;
    lathe(gp, [[0.0001, 0], [0.007, 0], [0.006, 0.01], [0.0045, 0.012], [0.0001, 0.012]], '#9a6c46', x, YP + HH + 0.003, z, 7);
  }
  // Wall pilasters with cone pinnacles: front facade (between towers), the two sides and the back
  const TX = [-0.215, 0, 0.215], TW = [0.125, 0.145, 0.125];
  const inTower = (x: number) => TX.some((tx, i) => Math.abs(x - tx) < TW[i] / 2 + 0.008);
  for (let x = -0.3; x <= 0.301; x += 0.0375) {
    if (inTower(x)) continue;
    pilaster(gp, x, YP, ZF - 0.002, HH, 0.012, 1.25, 0.7);
    stickCol(x, YP + 0.035, ZF + 0.008, YP + HH - 0.01, 0);
  }
  for (const sx of [-1, 1]) {
    for (let z = ZB + 0.02; z <= ZF - 0.01; z += 0.04) {
      pilaster(gp, sx * 0.322, YP, z, HH, 0.012, 0.7, 1.25);
      stickCol(sx * 0.334, YP + 0.035, z, YP + HH - 0.01, Math.PI / 2);
    }
    for (let z = -0.33; z <= -0.2; z += 0.045) pilaster(gp, sx * 0.294, YP, z, 0.1, 0.011, 0.7, 1.25);
  }
  for (let x = -0.27; x <= 0.271; x += 0.045) pilaster(gp, x, YP, -0.336, 0.1, 0.011, 1.25, 0.7);
  // Three great tower-minarets with rib pilasters, crenel cones and the ostrich-egg-tipped central spire
  TX.forEach((tx, i) => {
    const w = TW[i], th = i === 1 ? 0.285 : 0.255, d = 0.11, tz = ZF + 0.005;
    adobe(gp, tx, YP, tz, w, d, w * 0.78, d * 0.8, th, MUD, mudPaint, 28, 5, 11 + i);
    const top = YP + th;
    for (const f of [-0.42, -0.14, 0.14, 0.42]) {
      const fx = tx + f * w * 0.9;
      sweep(gp, [{ p: [fx, YP, tz + d / 2 - 0.002], w: 0.011, h: 0.008 }, { p: [fx * 0.98 + tx * 0.02 - f * 0.002, top - 0.004, tz + d * 0.4 - 0.002], w: 0.009, h: 0.007 }], MUD, { up: [0, 0, 1], radial: 8, sub: 1 });
      pilaster(gp, tx + f * w * 0.72, top - 0.006, tz + d * 0.36, 0.006, Math.abs(f) > 0.3 ? 0.012 : 0.011);
      for (let y = YP + 0.03; y < top - 0.01; y += 0.028) sticks.push([tx + f * w * (0.9 - 0.15 * (y - YP) / th), y, tz + d / 2 + 0.005 - 0.012 * (y - YP) / th, 0.0035, 0.0035, 0.032, 0]);
    }
    for (const sx of [-1, 1]) for (let y = YP + 0.04; y < top - 0.01; y += 0.035)
      sticks.push([tx + sx * (w / 2 - 0.012 * (y - YP) / th + 0.004), y, tz, 0.0035, 0.0035, 0.03, Math.PI / 2]);
    // Stacked spire: square mud drum, cone, then the white ostrich egg on its spike
    const sh = i === 1 ? 0.085 : 0.075;
    lathe(gp, [[0.0001, 0], [0.03, 0], [0.027, sh * 0.35], [0.021, sh * 0.42], [0.017, sh * 0.7], [0.006, sh * 0.96], [0.0001, sh]], MUD, tx, top - 0.004, tz, 13);
    for (const k of [0.3, 0.62]) sticks.push([tx, top + sh * k, tz, 0.003, 0.003, 0.07 - k * 0.04, 0], [tx, top + sh * k, tz, 0.003, 0.003, 0.07 - k * 0.04, Math.PI / 2]);
    rod(gp, [tx, top + sh - 0.004, tz], [tx, top + sh + 0.012, tz], 0.0012, STICK, 4);
    blob(gp, '#f3ead6', tx, top + sh + 0.017, tz, 0.0055, 0.0075, 0.0055);
    // Small round window/loudspeaker vent on the tower face
    cyl(gp, '#5a3d28', tx, YP + th * 0.62, tz + d * 0.43, 0.007, 0.004, 10).rotation.x = Math.PI / 2;
  });
  // Doors and small square windows
  for (const x of [-0.11, 0.11]) pbox(gp, 0.03, 0.06, 0.008, x, YP, ZF - 0.002, '#4a3222');
  for (const x of [-0.28, -0.16, 0.16, 0.28]) pbox(gp, 0.011, 0.014, 0.006, x + 0.018, YP + 0.075, ZF, '#3f2a1d');
  batch(gp, sticks, STICK);
  // Market-day life on the square: people, white goats, a couple of shade trees
  const ppl = ['#f8fafc', '#2563eb', '#f59e0b', '#7c3aed', '#dc2626', '#10b981'];
  for (let i = 0; i < 9; i++) {
    const a = 0.3 + hash3(i, 4, 1) * 2.5, r = 0.36 + hash3(i, 4, 2) * 0.1;
    person(gp, Math.cos(a) * r, Y0, Math.sin(a) * r, ppl[i % ppl.length], 1.6);
  }
  for (const [x, z, ry] of [[-0.28, 0.36, 0.3], [-0.24, 0.39, 2.0], [0.3, 0.35, 1.2]]) {
    const q = grp(gp, x, Y0, z, ry);
    blob(q, '#f1ece2', 0, 0.012, 0, 0.012, 0.0065, 0.0065);
    blob(q, '#f1ece2', 0.012, 0.018, 0, 0.0045, 0.0045, 0.0038);
    for (const [lx, lz] of [[-0.008, -0.004], [-0.008, 0.004], [0.007, -0.004], [0.007, 0.004]]) rod(q, [lx, 0, lz], [lx, 0.009, lz], 0.0012, '#e5ded1', 4);
  }
  tree(gp, -0.42, Y0, -0.2, 0.08, '#5f8a3a');
  tree(gp, 0.43, Y0, -0.12, 0.07, '#6b9442');
};

// =========================================================================================================
// Hassan II Mosque, Casablanca — the 210 m minaret over the Atlantic
/** Hipped roof (four slopes to a ridge along x) as one faceted skin; tile courses painted as stripes. */
function hip(p: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, h: number, c: string): void {
  const lx = Math.max(0.0005, (w - d) / 2), lz = Math.max(0.0005, (d - w) / 2);
  const rect: V3[] = [[x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]];
  const ridge: V3[] = [[x - lx, y + h, z - lz], [x + lx, y + h, z - lz], [x + lx, y + h, z + lz], [x - lx, y + h, z + lz]];
  const dk = shade(c, 0.86);
  skin(p, [rect, ridge], c, { flat: true, caps: false, paint: (_x, yy) => (Math.floor((yy - y) * 420) % 2 ? dk : null) });
  pbox(p, w + 0.004, 0.005, d + 0.004, x, y - 0.005, z, shade(c, 0.7));
}
/** Arcaded wall: a slab pierced by a row of horseshoe-ish arches over a dark interior core. */
function arcade(p: THREE.Object3D, w: number, h: number, n: number, x: number, y: number, z: number, ry: number, c: string, aw = 0.6, ah = 0.75): void {
  const holes: THREE.Path[] = [];
  const pitch = w / n;
  for (let i = 0; i < n; i++) holes.push(archPath(-w / 2 + pitch * (i + 0.5), 0.003, pitch * aw, h * ah, true));
  panel(p, w, h, 0.006, c, holes, x, y, z, ry);
  const k = grp(p, x, y, z, ry);
  box(k, '#3a3530', 0, h * 0.4, -0.006, w - 0.004, h * 0.8, 0.004);
}
const hassan2: Builder = gp => {
  const ST = '#e9dfca', STD = '#d4c6a8', GR = '#2f6e57', GRL = '#3f8a6c', GOLD = '#d6b25a', SEA = '#2a6f8f';
  // Atlantic all round the back and west; esplanade on the land side (front)
  const land = (x: number, z: number) => sstep(0.02, 0.07, z + 0.03 * Math.sin(x * 7)) * sstep(0.47, 0.42, Math.hypot(x, z) * (z > 0.3 ? 0.95 : 1));
  island(gp, 0.5, (x, z) => {
    const l = land(x, z);
    return l > 0.01 ? 0.004 * l : -0.012 + 0.003 * Math.sin(x * 40 + z * 25) * Math.sin(z * 31 - x * 9);
  }, SEA, (x, y, z) => {
    if (y > 0.037) return Math.floor(x * 70 + z * 70) % 2 ? '#e2d6bc' : '#d8cbb0';
    const rim = Math.hypot(x, z);
    if (Math.sin(x * 50 + z * 30 + Math.sin(z * 20) * 3) > 0.9) return '#bfe3ec';
    return rim > 0.44 ? '#246380' : fbm(x * 12, 0, z * 12, 2) > 0.6 ? '#33809f' : null;
  }, { rings: 28, segs: 84, side: strataSide(['#1f5b75', '#256a86', '#1b5068']) });
  // Platform built out over the water, breakwater rocks and surf
  const PY = 0.052;
  prism(gp, [[-0.3, -0.36], [0.33, -0.36], [0.33, 0.07], [-0.3, 0.07]], 0.02, PY - 0.02, '#d9ccb0', 0.004);
  for (let i = 0; i < 46; i++) {
    const t = i / 46, per = 2 * (0.63 + 0.43);
    let d = t * per, x: number, z: number;
    if (d < 0.63) { x = -0.3 + d; z = -0.375; } else if ((d -= 0.63) < 0.43) { x = 0.345; z = -0.36 + d; } else if ((d -= 0.43) < 0.63) { x = 0.33 - d; z = 0.08; } else { d -= 0.63; x = -0.315; z = 0.07 - d; }
    if (z > 0.06) continue;
    chunk(gp, hash3(i, 1, 1) > 0.5 ? '#6f6a63' : '#857f76', x, 0.026, z, 0.012 + hash3(i, 2, 2) * 0.008, 0.009, 0.012, i, hash3(i, 3, 3) * 3);
    if (i % 2) blob(gp, '#f1f8fb', x + (x < -0.31 ? -0.012 : (hash3(i, 5, 5) - 0.5) * 0.02), 0.024, z + (x > 0.34 ? 0.01 : z < -0.37 ? -0.012 : 0), 0.016, 0.002, 0.012);
  }
  // Esplanade: marble paving in a D, fountains and lamp posts, wings of arcades either side
  prism(gp, [[-0.37, 0.07], [0.33, 0.07], [0.37, 0.18], [0.3, 0.32], [0.12, 0.4], [-0.12, 0.4], [-0.3, 0.32], [-0.37, 0.18]], 0.036, 0.012, '#ece4d3');
  for (let ix = -4; ix <= 4; ix++) for (let iz = 0; iz < 4; iz++) {
    const x = ix * 0.075, z = 0.1 + iz * 0.075;
    if (Math.abs(x) > 0.3 - iz * 0.02) continue;
    pbox(gp, 0.05, 0.0008, 0.05, x, 0.048, z, (ix + iz) % 2 ? '#d8cdb6' : '#e1d6c0');
  }
  for (const x of [-0.17, 0.17]) {
    cyl(gp, ST, x, 0.048, 0.2, 0.026, 0.006, 16);
    cyl(gp, '#5fb6d0', x, 0.0545, 0.2, 0.022, 0.001, 16);
    cyl(gp, ST, x, 0.048, 0.2, 0.004, 0.016, 8);
  }
  for (const [x, z] of [[-0.26, 0.12], [0.26, 0.12], [-0.26, 0.27], [0.26, 0.27], [-0.08, 0.33], [0.08, 0.33]]) {
    rod(gp, [x, 0.048, z], [x, 0.09, z], 0.0016, '#3f3a33', 5);
    blob(gp, '#f2e2b0', x, 0.092, z, 0.0045);
  }
  const ppl = ['#f8fafc', '#334155', '#f8fafc', '#a16207', '#0f766e', '#be123c'];
  for (let i = 0; i < 12; i++) person(gp, -0.28 + hash3(i, 7, 1) * 0.56, 0.048, 0.1 + hash3(i, 7, 2) * 0.24, ppl[i % ppl.length], 1.5);
  for (const sx of [-1, 1]) {
    arcade(gp, 0.24, 0.05, 7, sx * 0.35, 0.048, 0.2, sx * Math.PI / 2, ST);
    pbox(gp, 0.05, 0.05, 0.24, sx * 0.375, 0.048, 0.2, STD);
    hip(gp, sx * 0.36, 0.098, 0.2, 0.07, 0.25, 0.018, GR);
  }
  // Prayer hall: arcaded ground storey, a recessed clerestory, green hipped roofs
  const HZ = -0.2, HD = 0.26, HW = 0.54;
  pbox(gp, HW - 0.02, 0.09, HD - 0.02, 0.01, PY, HZ, STD);
  arcade(gp, HW, 0.09, 10, 0.01, PY, HZ + HD / 2, 0, ST, 0.62, 0.78);
  for (const sx of [-1, 1]) arcade(gp, HD, 0.09, 5, 0.01 + sx * HW / 2, PY, HZ, Math.PI / 2, ST, 0.62, 0.78);
  pbox(gp, HW + 0.01, 0.012, HD + 0.01, 0.01, PY + 0.09, HZ, ST, (_x, y) => (y > PY + 0.098 ? '#c6a86a' : null), [1, 2, 1]);
  hip(gp, 0.01, PY + 0.102, HZ, HW + 0.01, HD + 0.01, 0.022, GR);
  pbox(gp, 0.3, 0.035, 0.14, -0.03, PY + 0.105, HZ, ST, (x, y, z, nx, _ny, nz) => {
    const u = Math.abs(nz) > 0.5 ? x : z;
    return Math.abs(nx) + Math.abs(nz) > 0.5 && y > PY + 0.112 && y < PY + 0.13 && frac(u * 40) < 0.4 ? '#3a3530' : null;
  }, [30, 4, 14]);
  hip(gp, -0.03, PY + 0.14, HZ, 0.32, 0.16, 0.04, GRL);
  // Entrance gallery along the front with bronze doors
  arcade(gp, 0.38, 0.045, 8, -0.06, PY, HZ + HD / 2 + 0.03, 0, ST, 0.62, 0.72);
  pbox(gp, 0.38, 0.006, 0.035, -0.06, PY + 0.045, HZ + HD / 2 + 0.014, GR);
  // Minaret: square shaft with stone corner piers, sebka lattice panels, green arch band, zellige crown
  const MX = 0.2, MZ = HZ + HD / 2 - 0.01, MW = 0.085, MY = PY, MH = 0.58;
  const shaftPaint: Paint = (x, y, z, nx, ny, nz) => {
    if (ny > 0.5 || ny < -0.5) return null;
    const u = (Math.abs(nz) > Math.abs(nx) ? x - MX : z - MZ) / MW, au = Math.abs(u), v = (y - MY) / MH;
    if (au > 0.4) return au < 0.43 ? '#9b8c73' : null;
    if (v > 0.93) return hash3(Math.floor(u * 30), Math.floor(v * 300), 5) > 0.55 ? GRL : hash3(Math.floor(u * 30), Math.floor(v * 300), 6) > 0.7 ? GOLD : GR;
    if (v > 0.9) return '#c9b48c';
    if (v > 0.8) {
      const arch = 0.83 + 0.05 * Math.sqrt(Math.max(0, 1 - (u / 0.34) ** 2));
      if (v > arch) return GRL;
      return v < 0.81 + 0.0 && au < 0.3 ? STD : au < 0.28 && v < 0.85 && frac(u * 7 + 0.5) < 0.5 ? '#3a3530' : null;
    }
    if (au < 0.06 && v > 0.25 && frac(v * 10) < 0.35) return '#3a3530';
    if (v > 0.12) {
      const a = frac(u * 6 + v * 26), b = frac(u * 6 - v * 26);
      return Math.min(a, b) < 0.28 ? '#b8a07a' : '#d7c49f';
    }
    return au < 0.2 && v < 0.08 ? '#3a3530' : null;
  };
  pbox(gp, MW, MH, MW, MX, MY, MZ, ST, shaftPaint, [10, 72, 10]);
  pbox(gp, MW + 0.006, 0.006, MW + 0.006, MX, MY + MH * 0.9, MZ, '#cbb68e');
  pbox(gp, MW + 0.008, 0.008, MW + 0.008, MX, MY + MH, MZ, '#d9c8a6');
  const top = MY + MH + 0.008;
  for (let i = 0; i < 6; i++) for (const sd of [0, 1, 2, 3]) {
    const t = -MW / 2 + 0.006 + (i * (MW - 0.012)) / 5, a = (sd * Math.PI) / 2;
    const [x, z] = [MX + Math.cos(a) * (MW / 2) - Math.sin(a) * t, MZ + Math.sin(a) * (MW / 2) + Math.cos(a) * t];
    lathe(gp, [[0.0001, 0], [0.005, 0], [0.005, 0.006], [0.0001, 0.012]], ST, x, top, z, 4).rotation.y = Math.PI / 4;
  }
  // Lantern (jamour): green-panelled kiosk, merlons, ribbed dome and the gilded triple-ball finial
  const LW = 0.036, LH = 0.06;
  pbox(gp, LW, LH, LW, MX, top, MZ, ST, (x, y, z, nx, ny, nz) => {
    if (Math.abs(ny) > 0.5) return null;
    const u = (Math.abs(nz) > Math.abs(nx) ? x - MX : z - MZ) / LW, v = (y - top) / LH;
    if (Math.abs(u) > 0.38) return null;
    if (v > 0.15 && v < 0.75) return v > 0.62 - 0.12 * (u * 2.6) ** 2 ? GRL : Math.abs(u) < 0.3 ? '#2c3a35' : GR;
    return v > 0.8 ? GR : null;
  }, [6, 10, 6]);
  for (let i = 0; i < 3; i++) for (const sd of [0, 1, 2, 3]) {
    const t = -LW / 2 + 0.005 + (i * (LW - 0.01)) / 2, a = (sd * Math.PI) / 2;
    lathe(gp, [[0.0001, 0], [0.004, 0], [0.004, 0.004], [0.0001, 0.009]], ST, MX + Math.cos(a) * (LW / 2) - Math.sin(a) * t, top + LH, MZ + Math.sin(a) * (LW / 2) + Math.cos(a) * t, 4);
  }
  lathe(gp, [[0.0001, 0], [0.014, 0], [0.013, 0.008], [0.009, 0.016], [0.0001, 0.021]], GR, MX, top + LH, MZ, 12);
  rod(gp, [MX, top + LH + 0.02, MZ], [MX, top + LH + 0.06, MZ], 0.0012, GOLD, 4);
  for (const [k, r] of [[0.03, 0.0055], [0.041, 0.0045], [0.051, 0.0035]] as [number, number][]) blob(gp, GOLD, MX, top + LH + k, MZ, r);
  // Fishing boats in the surf
  for (const [x, z, ry] of [[-0.4, -0.12, 0.4], [-0.38, 0.0, 1.9], [0.1, -0.44, 1.4]]) {
    const b = grp(gp, x, 0.022, z, ry);
    rbox(b, '#2563eb', 0, 0, 0, 0.04, 0.008, 0.014, 0.003);
    rbox(b, '#f8fafc', -0.004, 0.008, 0, 0.012, 0.007, 0.01, 0.002);
  }
};

// =========================================================================================================
// Mount Rushmore — four presidents carved into the granite of the Black Hills
const rushmore: Builder = gp => {
  const GRAN = '#b9b4ab', DARK = '#7d7972';
  const zf = (x: number) => -0.035 + 0.012 * Math.sin(x * 11) - 0.05 * sstep(0.3, 0.45, Math.abs(x));
  const hf: HFn = (x, z) => {
    const a = Math.abs(x), f = zf(x);
    const ground = 0.004 + 0.02 * fbm(x * 5, 0, z * 5) + 0.05 * sstep(-0.2, -0.48, z);
    const top = 0.5 + 0.075 * sstep(0.38, 0.26, a) * sstep(-0.3, -0.1, z) - 0.2 * sstep(0.3, 0.5, a) - 0.1 * sstep(-0.25, -0.48, z) + 0.05 * ridged(x * 6 + 3, z * 6) + 0.05 * sstep(0.25, 0.34, x) * sstep(0.45, 0.36, x);
    const cliff = top * sstep(f + 0.02, f - 0.005, z);
    const ledge = (0.29 - 0.08 * sstep(0.22, 0.4, a)) * sstep(f + 0.11, f + 0.035, z) + 0.01 * fbm(x * 25, 2, z * 25);
    const talus = (0.22 - 0.06 * sstep(0.1, 0.4, a)) * (1 - sstep(f + 0.09, f + 0.3, z)) * (1 - sstep(0.32, 0.48, a)) + 0.012 * fbm(x * 30, 1, z * 30);
    return Math.max(ground, cliff, ledge, talus);
  };
  island(gp, 0.5, hf, GRAN, (x, y, z, _nx, ny) => {
    const f = zf(x), n = fbm(x * 20, y * 20, z * 20, 3);
    if (y < 0.07 && ny > 0.6) return n > 0.6 ? '#5b7a3f' : n < 0.35 ? '#4a6634' : '#536f39';
    if (z > f + 0.02 && ny > 0.45 && y < 0.3) return n > 0.62 ? '#5b7a3f' : hash3(Math.floor(x * 140), Math.floor(y * 140), Math.floor(z * 140)) > 0.6 ? '#7f7a73' : n > 0.5 ? '#97928a' : '#a6a199';
    if (y > 0.26 && Math.abs(x) < 0.33 && z > f - 0.05) return n > 0.6 ? '#cfcac0' : Math.sin(y * 120 + n * 6) > 0.85 ? DARK : '#c4bfb6';
    if (y < 0.24 && ny < 0.6) return n > 0.55 ? '#6f6b66' : '#85817a';
    return n > 0.62 ? '#ccc7bd' : n < 0.35 ? '#9a958c' : Math.sin(y * 90 + x * 20) > 0.9 ? DARK : null;
  }, { rings: 40, segs: 108, side: strataSide(['#77736c', '#8a857d', '#6b665f']) });
  // Heads emerging from the granite: [x, y, forward offset, scale, pitch, yaw, roll, outline width, jaw taper, face]
  const heads: [number, number, number, number, number, number, number, number, number, FaceOpts][] = [
    [-0.2, 0.435, 0.02, 0.083, -0.03, -0.15, 0.0, 0.72, 0.1, { nose: 0.32, brow: 0.18, chin: 0.12, socket: 0.26, pupil: 0.13, wig: 0.12 }],
    [-0.095, 0.422, -0.024, 0.078, -0.12, 0.15, -0.12, 0.68, 0.14, { nose: 0.3, brow: 0.15, chin: 0.1, socket: 0.24, pupil: 0.12, hair: 0.05 }],
    [0.02, 0.395, -0.04, 0.076, 0.0, -0.1, 0.0, 0.72, 0.1, { nose: 0.32, brow: 0.16, chin: 0.08, socket: 0.22, pupil: 0.11, stache: 0.2, glasses: 0.07 }],
    [0.19, 0.408, 0.0, 0.082, 0.05, -0.15, 0.02, 0.66, 0.05, { nose: 0.32, brow: 0.2, chin: 0.05, socket: 0.27, pupil: 0.13, beard: 0.14, hollow: 0.13 }],
  ];
  // One carved surface over the whole sculpture: depth = max(rock mass bulging from the cliff, each sculpted face),
  // so heads overlap naturally and their back halves stay inside the mountain.
  const H = heads.map(([x, y, dz, sc, rx, ry, rz, w, jaw, fo]) => ({ x, y, z: zf(x) + 0.02 + dz, sc, rx, ry, rz, w, jaw, fo, disp: faceDisp(fo) }));
  type Hd = (typeof H)[number];
  const local = (h: Hd, x: number, y: number) => {
    const du = (x - h.x) / h.sc, dv = (y - h.y) / h.sc, c = Math.cos(h.rz), sn = Math.sin(h.rz);
    return [du * c + dv * sn, -du * sn + dv * c];
  };
  const faceZ = (h: Hd, u: number, v: number) => {
    let zl = (0.45 - 0.6 * sstep(0.3, 0.62, Math.abs(u))) * sstep(-0.7, -1.0, v) * (1 - sstep(-1.7, -2.4, v)) - 2;
    zl = Math.max(zl, -2);
    const A = h.w * (1 - h.jaw * sstep(-0.1, -1, v)), r = Math.abs(u / A) ** 3 + Math.abs(v / 1.12) ** 2.6;
    if (r < 1) {
      const nz = Math.sqrt(1 - r ** 1.5), d = h.disp(u / A, v / 1.12, nz);
      zl = Math.max(zl, 0.9 * nz * (1 + d) + 0.6 * d * (1 - nz));
    } else if (v > -0.7) return -9;
    return h.z + h.sc * (zl - Math.sin(h.ry) * u + 0.5 * Math.sin(h.rx) * v);
  };
  const CX0 = -0.31, CX1 = 0.3, CY0 = 0.27, CY1 = 0.6, NX = 104, NY = 62;
  const rockZ = (x: number, y: number) => {
    const ex = Math.abs((x - (CX0 + CX1) / 2) / ((CX1 - CX0) / 2)), ey = Math.abs((y - (CY0 + CY1) / 2) / ((CY1 - CY0) / 2)), e = (ex ** 2.5 + ey ** 2.5) ** 0.4 + 0.35 * (fbm(x * 9, y * 9, 7, 3) - 0.5);
    // Washington's coat and collar: a broad sloping mass below his chin
    const coat = 0.05 * G2(x, y, -0.2, 0.335, 0.085, 0.03) * (1 - 0.5 * G2(x, y, -0.19, 0.345, 0.018, 0.03)) + 0.025 * G2(x, y, -0.25, 0.35, 0.03, 0.02);
    // Rock mass left around the lower heads; above them the patch sits behind the natural cliff
    const m = (1 - sstep(0.55, 0.92, e)) * sstep(0.53, 0.45, y);
    return zf(x) - 0.015 + (0.045 - 0.028 * G2(x, y, 0.105, 0.42, 0.035, 0.12) - 0.012 * G2(x, y, 0.03, 0.4, 0.07, 0.12)) * m + coat
      + (0.012 * (fbm(x * 70, y * 5, 3, 2) - 0.5) + 0.008 * (ridged(x * 30, y * 30) - 0.5)) * m;
  };
  const cpos: number[] = [], cidx: number[] = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const x = CX0 + ((CX1 - CX0) * i) / NX, y = CY0 + ((CY1 - CY0) * j) / NY;
    let z = rockZ(x, y);
    for (const h of H) {
      const [u, v] = local(h, x, y), rr = Math.hypot(u / (h.w * 1.05), v / (v > 0 ? 1.15 : 1.15)) + 0.4 * (fbm(u * 2.5 + h.x * 20, v * 2.5, 9, 3) - 0.5);
      // Rough rock "hood" (hair mass and skull sides left in the mountain) that the face plane emerges from
      const hood = 0.5 + 0.22 * sstep(0.45, 1.0, v) * (1 - sstep(1.15, 1.5, v)) * (1 - sstep(0.45, 0.85, Math.abs(u))) + 0.08 * (fbm(u * 3 + h.x * 30, v * 2, 4, 3) - 0.5);
      z = Math.max(z, h.z + h.sc * (hood - 1.4 * sstep(0.85, 1.9, rr)));
      if (Math.abs(u) < 1.4 && v > -2.4 && v < 1.2) z = Math.max(z, faceZ(h, u, v));
    }
    // Sink the patch borders behind the cliff so no seam shows
    const edge = Math.max(Math.abs((x - (CX0 + CX1) / 2) / ((CX1 - CX0) / 2)), Math.abs((y - (CY0 + CY1) / 2) / ((CY1 - CY0) / 2)));
    cpos.push(x, y, z - 0.08 * sstep(0.86, 1, edge));
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    cidx.push(a, b, d, a, d, c);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cg.setIndex(cidx);
  cg.computeVertexNormals();
  const carvePaint: Paint = (x, y, z) => {
    for (const h of H) {
      const [u, v] = local(h, x, y);
      if (Math.abs(u) > 1 || v < -1.3 || v > 1.1 || z < faceZ(h, u, v) - 0.0015) continue;
      const un = u / h.w, vn = v / 1.12, ex = (Math.abs(un) - 0.3) / 0.13, ey = (vn - 0.15) / 0.08, e = ex * ex + ey * ey;
      if (e < 1.1) return e < 0.14 ? '#dcd7ce' : ey > 0 ? '#86817a' : '#9f9a92';
      if (h.fo.glasses && Math.abs(Math.hypot(Math.abs(un) - 0.3, (vn - 0.14) * 1.3) - 0.16) < 0.03) return '#d6d1c8';
      if (h.fo.stache && Math.abs(vn + 0.31) < 0.06 && Math.abs(un) < 0.3) return Math.abs(vn + 0.36) < 0.015 ? '#8a857c' : '#aca79e';
      if (!h.fo.stache && Math.abs(vn + 0.39) < 0.02 && Math.abs(un) < 0.15) return '#8a857c';
      if (h.fo.beard && vn < -0.5 && fbm(u * 16, v * 16, 5, 2) > 0.5) return '#9e998f';
      const n = fbm(x * 60, y * 6, 1, 3);
      return n > 0.66 ? '#b6b1a8' : n < 0.32 ? '#cdc8bf' : '#c3beb5';
    }
    const n = fbm(x * 70, y * 7, 1, 3);
    return n > 0.62 ? '#a7a299' : n < 0.34 ? '#cbc6bd' : null;
  };
  const cp = paintFaces(cg, '#bcb7ae', carvePaint);
  add(gp, cp, mat('#ffffff', { flat: false, vc: true }), 0, 0, 0, 1, 1, 1);
  // Ponderosa pines on the slopes and around the base
  for (let i = 0; i < 90; i++) {
    const a = hash3(i, 3, 1) * Math.PI * 2, r = 0.12 + Math.sqrt(hash3(i, 3, 2)) * 0.36;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 0.06;
    if (Math.hypot(x, z) > 0.47) continue;
    const y = hf(x, z), slope = Math.abs(hf(x + 0.01, z) - hf(x - 0.01, z)) + Math.abs(hf(x, z + 0.01) - hf(x, z - 0.01));
    if (y > 0.22 || slope > 0.05 || (z < zf(x) + 0.03 && y > 0.08) || (Math.abs(x) < 0.12 && z > 0.3)) continue;
    pine(gp, x, 0.035 + y - 0.003, z, 0.045 + hash3(i, 3, 3) * 0.035, hash3(i, 3, 4) > 0.5 ? '#2f5134' : '#3a5f3b');
  }
  // Grand View Terrace and the Avenue of Flags at the front
  const TY = 0.035 + hf(0, 0.4) + 0.002;
  pbox(gp, 0.2, 0.012, 0.07, 0, TY - 0.008, 0.4, '#d6cfc0');
  for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) {
    const x = sx * (0.02 + i * 0.012);
    rod(gp, [x, TY, 0.385], [x, TY + 0.045, 0.385], 0.0007, '#e5e7eb', 4);
    box(gp, ['#b91c1c', '#1d4ed8', '#f8fafc'][(i + (sx > 0 ? 1 : 0)) % 3], x + 0.005, TY + 0.039, 0.385, 0.009, 0.006, 0.001);
  }
  for (let i = 0; i < 6; i++) person(gp, -0.06 + i * 0.024, TY, 0.41 + (i % 2) * 0.012, ['#f8fafc', '#2563eb', '#dc2626'][i % 3], 1.4);
};

// =========================================================================================================
// Gateway Arch, St. Louis — weighted catenary of stainless steel over the Mississippi riverfront
const gatewayarch: Builder = gp => {
  const Y0 = 0.035, H = 0.8, HW = 0.39, A = 3.0;
  // Centroid curve (weighted catenary), resampled by arc length
  const raw: [number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const t = -1 + (2 * i) / 400;
    raw.push([HW * t, Y0 + H * (1 - (Math.cosh(A * t) - 1) / (Math.cosh(A) - 1))]);
  }
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const L = cum[cum.length - 1], N = 150, rings: V3[][] = [];
  let k = 0;
  for (let i = 0; i <= N; i++) {
    const sL = (i / N) * L;
    while (k < cum.length - 2 && cum[k + 1] < sL) k++;
    const u = (sL - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const px = raw[k][0] + (raw[k + 1][0] - raw[k][0]) * u, py = raw[k][1] + (raw[k + 1][1] - raw[k][1]) * u;
    let tx = raw[k + 1][0] - raw[k][0], ty = raw[k + 1][1] - raw[k][1];
    const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    // Inward normal (towards the arch interior) and the equilateral section shrinking from 0.07 to 0.026
    let nx = -ty, ny = tx;
    if (nx * -px + ny * 0 < 0 && Math.abs(px) > 0.001) { nx = -nx; ny = -ny; }
    if (Math.abs(px) <= 0.001) { nx = 0; ny = -1; }
    const h01 = (py - Y0) / H, side = 0.026 + (0.068 - 0.026) * (1 - h01) ** 1.3, r = side / Math.sqrt(3);
    // Apex vertex points outward (away from the opening), the flat face looks inward
    rings.push([[px - nx * r, py - ny * r, 0], [px + nx * r / 2, py + ny * r / 2, side / 2], [px + nx * r / 2, py + ny * r / 2, -side / 2]]);
  }
  skin(gp, rings, '#e8ebef', { flat: true, metal: 0.65, rough: 0.3, paint: (_x, y) => (Math.floor((y - Y0) * 180) % 6 === 0 ? '#d3d8de' : null) });
  for (const sx of [-1, 1]) cyl(gp, '#9aa1a9', sx * HW, Y0 - 0.002, 0, 0.05, 0.006, 6);
  // Observation windows at the apex
  for (let i = -3; i <= 3; i++) box(gp, '#334155', i * 0.004, Y0 + H + 0.004, 0.0115, 0.0024, 0.0016, 0.0008);
  // Park: lawn with mounds by the legs, reflecting ponds, tree-lined curving walks
  island(gp, 0.5, (x, z) => {
    const mound = 0.012 * (G2(x, z, -0.32, 0, 0.12, 0.12) + G2(x, z, 0.32, 0, 0.12, 0.12));
    const pond = G2(x, z, -0.2, -0.22, 0.07, 0.04) + G2(x, z, 0.2, -0.22, 0.07, 0.04);
    return z > 0.285 ? -0.008 - 0.01 * sstep(0.285, 0.33, z) : z > 0.24 ? 0.0 : mound - 0.01 * sstep(0.3, 0.7, pond) + 0.002;
  }, '#5f9a4a', (x, y, z) => {
    if (z > 0.24) return '#8f887c';
    if (y < 0.03) return '#4f8fb0';
    const walk = Math.abs(Math.hypot(x / 1.1, z + 0.06) - 0.33) < 0.012 || Math.abs(Math.hypot(x / 1.4, z - 0.05) - 0.18) < 0.01;
    if (walk) return '#d9d3c4';
    return fbm(x * 18, 0, z * 18, 2) > 0.6 ? '#6aa653' : null;
  }, { rings: 36, segs: 96, side: strataSide(['#5a4d3c', '#6b5c48', '#4f4434']) });
  for (const sx of [-1, 1]) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([sx * 0.2 + Math.cos(a) * 0.065, -0.22 + Math.sin(a) * 0.032]); }
    prism(gp, pts, 0.03, 0.007, '#5aa4c8');
  }
  // Rows of trees following the walks
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, rr = i % 2 ? 0.355 : 0.305;
    const x = Math.cos(a) * rr * 1.1, z = Math.sin(a) * rr - 0.06;
    if (z > 0.22 || Math.hypot(x, z) > 0.47 || Math.abs(x) < 0.06) continue;
    tree(gp, x, Y0 + 0.002, z, 0.04 + hash3(i, 2, 2) * 0.012, hash3(i, 2, 3) > 0.5 ? '#3f7d3a' : '#4f8f45');
  }
  // City side: Old Courthouse dome on axis, a few downtown blocks behind
  const OC = grp(gp, 0, Y0, -0.42);
  pbox(OC, 0.1, 0.035, 0.05, 0, 0, 0, '#e5dccb');
  pbox(OC, 0.03, 0.035, 0.1, 0, 0, 0, '#e5dccb');
  cyl(OC, '#d8cfbf', 0, 0.035, 0, 0.018, 0.018, 14);
  lathe(OC, [[0.0001, 0], [0.019, 0], [0.017, 0.012], [0.01, 0.022], [0.0001, 0.026]], '#4d7c6a', 0, 0.053, 0, 14);
  for (const [x, z, w, h, c] of [[-0.25, -0.36, 0.07, 0.16, '#8b9aa8'], [-0.16, -0.43, 0.06, 0.22, '#a7b1ba'], [0.17, -0.42, 0.06, 0.19, '#7d8a96'], [0.26, -0.35, 0.07, 0.12, '#b9aea0'], [0.33, -0.27, 0.05, 0.08, '#a38e7a']] as [number, number, number, number, string][]) {
    pbox(gp, w, h, w, x, Y0, z, c, (_x, y, _z, _nx, ny) => (Math.abs(ny) < 0.5 && Math.floor(y * 220) % 2 ? shade(c, 0.78) : null), [1, Math.round(h * 220), 1]);
  }
  // Riverfront: Leonor K. Sullivan Blvd, the cobbled levee sloping into the muddy Mississippi
  const half = (z: number) => Math.sqrt(0.495 ** 2 - z * z);
  pbox(gp, 2 * half(0.262) - 0.01, 0.003, 0.024, 0, Y0 - 0.001, 0.25, '#4b5563', (x, _y, z) => (Math.abs(z - 0.25) < 0.001 && Math.floor(x * 60) % 2 ? '#e5e7eb' : null), [40, 1, 2]);
  const rv: [number, number][] = [];
  const a0 = Math.asin(0.285 / 0.495);
  for (let i = 0; i <= 24; i++) { const a = a0 + ((Math.PI - 2 * a0) * i) / 24; rv.push([Math.cos(a) * 0.495, Math.sin(a) * 0.495]); }
  prism(gp, rv, 0, 0.031, '#7a6a4f');
  for (let i = 0; i < 9; i++) {
    const x = -0.36 + i * 0.09, z = 0.33 + hash3(i, 8, 1) * 0.1;
    if (Math.hypot(x, z) < 0.47) box(gp, '#9c8b6c', x, 0.0315, z, 0.04 + hash3(i, 8, 2) * 0.04, 0.0008, 0.0025);
  }
  // Riverfront: Leonor K. Sullivan Blvd and the cobbled levee; a paddle-wheel riverboat
  const b = grp(gp, -0.12, 0.027, 0.355, 0);
  rbox(b, '#f8fafc', 0, 0, 0, 0.12, 0.012, 0.035, 0.004);
  rbox(b, '#f1f5f9', 0.005, 0.012, 0, 0.09, 0.01, 0.03, 0.003);
  rbox(b, '#e2e8f0', 0.01, 0.022, 0, 0.06, 0.009, 0.024, 0.003);
  pbox(b, 0.092, 0.002, 0.031, 0.005, 0.0215, 0, '#b91c1c');
  for (const sz of [-0.007, 0.007]) {
    cyl(b, '#1f2937', 0.03, 0.031, sz, 0.0028, 0.03, 8);
    blob(b, '#facc15', 0.03, 0.062, sz, 0.004, 0.002, 0.004);
  }
  cyl(b, '#b91c1c', -0.068, 0.012, 0, 0.012, 0.03, 12).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) person(gp, -0.15 + i * 0.07, Y0 + 0.002, 0.2 + (i % 2) * 0.03, ['#f8fafc', '#2563eb', '#dc2626', '#f59e0b', '#16a34a'][i], 1.5);
  const bg = grp(gp, 0.12, 0.028, 0.41, 0.05);
  rbox(bg, '#57534e', 0, 0, 0, 0.11, 0.008, 0.03, 0.002);
};

// =========================================================================================================
// Teotihuacan — Avenue of the Dead, Pyramid of the Sun and Pyramid of the Moon
const STONE = '#93897a';
const stonePaint: Paint = (x, y, z, _nx, ny) => {
  if (ny > 0.9) return '#a59c8b';
  const n = fbm(x * 40, y * 40, z * 40, 2);
  return n > 0.6 ? '#857b6b' : n < 0.38 ? '#9d9384' : null;
};
/** Stair wedge climbing a talud from its outer foot (local +z) to the tier above, with raised balustrades. */
function stair(p: THREE.Object3D, w0: number, w1: number, h: number, y: number, sw: number): void {
  const d = (w0 - w1) / 2, zc = (w0 + w1) / 4 + 0.002;
  frustum(p, sw, d, sw, 0.002, h, 0, y, zc, '#b3aa99', (_x, yy) => (Math.floor(yy * 500) % 2 ? '#857b6c' : null), [1, Math.max(2, Math.round(h * 300)), 1], 0, 0, -d / 2);
  for (const sx of [-1, 1]) frustum(p, 0.006, d + 0.004, 0.006, 0.006, h + 0.003, sx * (sw / 2 + 0.003), y, zc + 0.002, '#8a8070', undefined, [1, 1, 1], 0, 0, -d / 2);
}
/** Stepped pyramid: talud tiers [base width, height, top width] with terraces; front (stairs) faces local +z. */
function pyramid(p: THREE.Object3D, x: number, z: number, ry: number, tiers: [number, number, number][], sw: number, y0: number): number {
  const q = grp(p, x, 0, z, ry);
  let y = y0;
  for (const [w0, h, w1] of tiers) {
    frustum(q, w0, w0, w1, w1, h, 0, y, 0, STONE, stonePaint, [6, 3, 6]);
    stair(q, w0, w1, h, y, sw);
    y += h;
  }
  return y;
}
/** Talud-tablero platform: sloping apron under a vertical framed panel, two storeys, stairs facing local +z. */
function talud(p: THREE.Object3D, x: number, z: number, w: number, d: number, ry: number, y0: number, lv = 2): void {
  const q = grp(p, x, 0, z, ry);
  let y = y0;
  for (let i = 0; i < lv; i++) {
    const ww = w - i * 0.016, dd = d - i * 0.016;
    frustum(q, ww, dd, ww - 0.01, dd - 0.01, 0.008, 0, y, 0, STONE, stonePaint, [2, 1, 2]);
    pbox(q, ww - 0.008, 0.013, dd - 0.008, 0, y + 0.008, 0, '#8d8372', (xx, yy, zz, nx, _ny, nz) => {
      const e = Math.abs(nz) > 0.5 ? Math.abs(xx) / ((ww - 0.008) / 2) : Math.abs(zz) / ((dd - 0.008) / 2);
      return Math.abs(nx) + Math.abs(nz) > 0.5 && e < 0.85 && yy > y + 0.0105 && yy < y + 0.0185 ? '#6d6455' : null;
    }, [4, 3, 4]);
    y += 0.021;
  }
  pbox(q, 0.018, y - y0, 0.02, 0, y0, d / 2 + 0.004, '#a59c8c', (_x, yy) => (Math.floor(yy * 600) % 2 ? '#7e7465' : null), [1, 8, 1]);
}
const teotihuacan: Builder = gp => {
  const Y0 = 0.037, AZ = 0.135;
  island(gp, 0.5, (x, z) => 0.001 + 0.003 * fbm(x * 9, 0, z * 9) * (1 - G2(x, z, 0.05, 0.05, 0.4, 0.3)) + 0.3 * G2(x, z, -0.32, -0.5, 0.3, 0.17) + 0.12 * G2(x, z, 0.32, -0.5, 0.25, 0.12) + 0.03 * ridged(x * 8, z * 8) * sstep(-0.3, -0.45, z), '#b3a46b', (x, y, z, _nx, ny) => {
    const n = fbm(x * 16, y * 16, z * 16, 3);
    if (y > 0.07) return ny < 0.75 ? (n > 0.55 ? '#6f6a48' : '#7c7550') : n > 0.55 ? '#6b7448' : '#7f8152';
    return n > 0.62 ? '#c4b57c' : n < 0.36 ? '#9e9160' : null;
  }, { rings: 30, segs: 90, side: strataSide(['#7c6a50', '#8a765a', '#6d5d45']) });
  // Avenue of the Dead
  pbox(gp, 0.74, 0.004, 0.07, 0.1, Y0 - 0.001, AZ, '#a39e92', (_x, _y, z) => (Math.abs(Math.abs(z - AZ) - 0.033) < 0.003 ? '#8d887c' : null), [2, 1, 12]);
  // Pyramid of the Sun: five talud tiers, central stair, temple platform, adosada in front
  const SX = 0.1, SZ = -0.15;
  const top = pyramid(gp, SX, SZ, 0, [[0.4, 0.06, 0.34], [0.315, 0.05, 0.265], [0.245, 0.04, 0.205], [0.185, 0.03, 0.15], [0.135, 0.024, 0.105]], 0.045, Y0);
  pbox(gp, 0.08, 0.008, 0.08, SX, top, SZ, '#9b9181');
  frustum(gp, 0.24, 0.07, 0.22, 0.06, 0.028, SX, Y0, SZ + 0.235, STONE, stonePaint, [4, 2, 2]);
  frustum(gp, 0.18, 0.055, 0.165, 0.048, 0.02, SX, Y0 + 0.028, SZ + 0.235, STONE, stonePaint, [4, 2, 2]);
  const ad = grp(gp, SX, 0, SZ + 0.235);
  stair(ad, 0.07, 0.0, 0.048, Y0, 0.045);
  // Pyramid of the Moon closing the avenue, facing down it (+x), with its own adosada
  const MX = -0.34;
  const mtop = pyramid(gp, MX, AZ, Math.PI / 2, [[0.19, 0.04, 0.16], [0.145, 0.034, 0.118], [0.106, 0.028, 0.084], [0.074, 0.022, 0.055]], 0.03, Y0);
  pbox(gp, 0.05, 0.006, 0.05, MX, mtop, AZ, '#9b9181');
  const ma = grp(gp, MX + 0.12, 0, AZ, Math.PI / 2);
  frustum(ma, 0.12, 0.06, 0.1, 0.05, 0.045, 0, Y0, 0, STONE, stonePaint, [3, 2, 2]);
  stair(ma, 0.06, 0.0, 0.045, Y0, 0.032);
  // Plaza of the Moon and the talud-tablero platforms lining the avenue
  for (const [x, z, ry] of [[-0.2, 0.235, Math.PI], [-0.2, 0.035, 0], [-0.12, 0.25, Math.PI], [-0.1, 0.025, 0]] as [number, number, number][]) talud(gp, x, z, 0.065, 0.065, ry, Y0);
  for (let x = -0.02; x < 0.42; x += 0.075) talud(gp, x, 0.228, 0.06, 0.055, Math.PI, Y0, x > 0.25 ? 1 : 2);
  for (const x of [0.33, 0.41]) talud(gp, x, 0.04, 0.06, 0.055, 0, Y0, 1);
  // Maguey and pirul scrub, tourists along the avenue
  for (let i = 0; i < 40; i++) {
    const a = hash3(i, 6, 1) * Math.PI * 2, r = 0.2 + hash3(i, 6, 2) * 0.27, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - AZ) < 0.13 || (Math.abs(x - SX) < 0.25 && z < 0.12 && z > -0.37) || Math.hypot(x - MX, z - AZ) < 0.15) continue;
    const y = Y0 - 0.002 + (0.3 * G2(x, z, -0.32, -0.5, 0.3, 0.17) + 0.12 * G2(x, z, 0.32, -0.5, 0.25, 0.12));
    if (i % 3) for (let k = 0; k < 5; k++) rod(gp, [x, y, z], [x + Math.cos(k * 1.3) * 0.009, y + 0.012, z + Math.sin(k * 1.3) * 0.009], 0.0016, '#7d9a7a', 3);
    else tree(gp, x, y, z, 0.035, '#6f8a3f');
  }
  const ppl = ['#f8fafc', '#dc2626', '#2563eb', '#f59e0b', '#7c3aed', '#16a34a', '#f8fafc'];
  for (let i = 0; i < 12; i++) person(gp, -0.2 + hash3(i, 5, 1) * 0.62, Y0 + 0.003, AZ - 0.025 + hash3(i, 5, 2) * 0.05, ppl[i % ppl.length], 1.3);
  for (let i = 0; i < 6; i++) person(gp, SX - 0.004 + (i % 2) * 0.008, Y0 + 0.06 + i * 0.022, SZ + 0.18 - i * 0.022, ppl[i % ppl.length], 1.0);
};

// =========================================================================================================
// Milford Sound — Mitre Peak rising sheer from the fjord, forested cliffs, Bowen Falls, a tour boat
const milford: Builder = gp => {
  const xc = (z: number) => 0.03 + 0.09 * sstep(0.1, -0.45, z);
  const hw = (z: number) => 0.065 + 0.17 * sstep(-0.1, 0.38, z);
  const peak = (x: number, z: number, cx: number, cz: number, h: number, r: number, pw: number) => h * Math.max(0, 1 - Math.hypot(x - cx, z - cz) / r) ** pw;
  const hf: HFn = (x, z) => {
    const dc = Math.abs(x - xc(z)) - hw(z);
    if (dc < 0) return -0.012;
    const rg = ridged(x * 7 + 1, z * 7);
    const dx = x + 0.17, dz = z + 0.13, pyr = Math.max(0, 1 - (0.55 * Math.hypot(dx, dz) + 0.32 * (Math.abs(dx + dz) + Math.abs(dx - dz))) / 0.32);
    const mitre = (0.5 * pyr ** 1.1 + 0.3 * Math.max(0, 1 - (0.5 * Math.hypot(dx, dz) + 0.35 * (Math.abs(dx + dz) + Math.abs(dx - dz))) / 0.13) ** 1.2 + peak(x, z, -0.08, -0.2, 0.12, 0.14, 1.2)) * (0.9 + 0.18 * rg);
    const lion = peak(x, z, 0.34, -0.06, 0.48, 0.34, 0.8) * (0.85 + 0.2 * rg);
    const dome = peak(x, z, -0.42, -0.32, 0.4, 0.3, 0.8) * (0.9 + 0.15 * rg);
    const back = peak(x, z, 0.22, -0.46, 0.5, 0.24, 1.0) * (0.85 + 0.2 * rg);
    const foot = peak(x, z, -0.4, 0.14, 0.24, 0.26, 0.9) * (0.85 + 0.2 * rg);
    const flats = 0.012 + 0.02 * fbm(x * 9, 0, z * 9);
    const m = Math.max(mitre, lion, dome, back, foot);
    return flats + m * sstep(0.0, 0.05, dc) + 0.006 * sstep(0, 0.01, dc);
  };
  island(gp, 0.5, hf, '#2f5a2e', (x, y, z, _nx, ny) => {
    const n = fbm(x * 18, y * 18, z * 18, 3);
    if (y < 0.03) return n > 0.68 ? '#2d6574' : n < 0.3 ? '#17404c' : '#1d4a57';
    if (y < 0.042 && ny > 0.5) return '#57584a';
    const h = y - 0.035;
    if (h > 0.42 && ny > 0.2 && ridged(x * 40, z * 40) > 0.86 - (h - 0.42) * 0.6) return '#eef2f6';
    if (h > 0.5 || ny < 0.3 || (h > 0.3 && n > 0.56)) return n > 0.55 ? '#5d625e' : n < 0.38 ? '#7b807a' : '#6c716c';
    if (h > 0.34 || ny < 0.42) return n > 0.5 ? '#4f5a48' : '#3d6235';
    return n > 0.62 ? '#3f7236' : n < 0.36 ? '#203f24' : h < 0.08 && n > 0.5 ? '#4a7a3a' : '#2c5530';
  }, { rings: 46, segs: 112, side: strataSide(['#4b4a42', '#5a584e', '#3f3e37']) });
  // Bowen Falls tumbling down the Lion's west cliff into the sound, with foam and spray
  const fz = 0.02, sx0 = xc(fz) + hw(fz);
  let xt = sx0 + 0.01;
  while (hf(xt, fz) < 0.3 && xt < 0.3) xt += 0.004;
  const st = [];
  for (let k = 0; k <= 10; k++) {
    const x = xt + (sx0 - 0.002 - xt) * (k / 10) ** 0.8;
    st.push({ p: [x - 0.004, 0.035 + Math.max(-0.008, hf(x, fz)) + 0.003, fz] as V3, w: 0.006 + 0.006 * (k / 10), h: 0.0015 });
  }
  sweep(gp, st, '#eef6fb', { up: [1, 0, 0], radial: 6, sub: 3, paint: (_x, y) => (Math.sin(y * 400) > 0.6 ? '#c7dde8' : null) });
  for (let i = 0; i < 5; i++) blob(gp, i % 2 ? '#e2eef4' : '#f8fafc', sx0 - 0.008 - (i % 3) * 0.008, 0.023, fz + (i - 2) * 0.007, 0.009, 0.003, 0.008);
  blob(gp, '#e8f1f5', sx0 - 0.006, 0.03, fz, 0.008, 0.008, 0.009);
  // Tour boat cruising out of the sound, wake fanning behind
  const bz = 0.22, bx = xc(bz) - 0.03;
  const b = grp(gp, bx, 0.023, bz, Math.PI / 2 + 0.25);
  rbox(b, '#f8fafc', 0, 0, 0, 0.1, 0.012, 0.03, 0.005);
  pbox(b, 0.1, 0.002, 0.031, 0, 0.002, 0, '#1e3a5f');
  rbox(b, '#f1f5f9', -0.008, 0.012, 0, 0.065, 0.011, 0.026, 0.003);
  pbox(b, 0.06, 0.004, 0.027, -0.006, 0.016, 0, '#1f2937');
  rbox(b, '#e2e8f0', -0.015, 0.023, 0, 0.035, 0.008, 0.02, 0.003);
  cyl(b, '#dc2626', -0.025, 0.031, 0, 0.004, 0.008, 8);
  for (const k of [-1, 1]) prism(b, [[-0.045, 0], [-0.17, k * 0.04], [-0.17, k * 0.03], [-0.05, k * 0.004]], -0.0005, 0.0012, '#d9e8ee');
  prism(b, [[-0.05, -0.008], [-0.11, -0.004], [-0.11, 0.004], [-0.05, 0.008]], -0.0005, 0.0012, '#c4dbe4');
  // Freshwater basin wharf and terminal buildings on the flats at the head of the sound
  const wx = xc(0.36) + hw(0.36) + 0.03, wy = 0.035 + hf(wx, 0.36);
  pbox(gp, 0.07, 0.004, 0.012, wx - 0.06, 0.03, 0.36, '#6b5b45');
  for (let i = 0; i < 4; i++) cyl(gp, '#4a3d2e', wx - 0.09 + i * 0.02, 0.018, 0.366, 0.0015, 0.014, 5);
  rbox(gp, '#e7e5e4', wx + 0.005, wy - 0.003, 0.37, 0.05, 0.016, 0.03, 0.002);
  prism(gp, [[wx - 0.022, 0.352], [wx + 0.032, 0.352], [wx + 0.032, 0.388], [wx - 0.022, 0.388]], wy + 0.012, 0.004, '#7f1d1d');
  rbox(gp, '#d6d3d1', wx + 0.04, wy - 0.003, 0.33, 0.025, 0.012, 0.02, 0.002);
  // Podocarp/beech trees on the lowland flats
  for (let i = 0; i < 45; i++) {
    const a = hash3(i, 9, 1) * Math.PI * 2, r = 0.15 + Math.sqrt(hash3(i, 9, 2)) * 0.33, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = hf(x, z);
    if (Math.abs(x - xc(z)) - hw(z) < 0.02 || y > 0.12 || Math.hypot(x - wx, z - 0.36) < 0.05) continue;
    const slope = Math.abs(hf(x + 0.01, z) - hf(x - 0.01, z)) + Math.abs(hf(x, z + 0.01) - hf(x, z - 0.01));
    if (slope > 0.04) continue;
    pine(gp, x, 0.035 + y - 0.002, z, 0.03 + hash3(i, 9, 3) * 0.025, hash3(i, 9, 4) > 0.5 ? '#24482a' : '#2f5a33');
  }
};

export const WORLD2: Record<string, Builder> = { abusimbel, djenne, hassan2, rushmore, gatewayarch, teotihuacan, milford };
