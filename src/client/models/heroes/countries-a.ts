import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type Paint, type V3, CYL, g, add, mat, box, cyl, cone, rbox, rod, prism, panel, archPath, lathe, tbox, gable, shade, mix, fbm, hash3, vnoise } from '../prims.ts';
import { type HFn, sstep } from '../nature.ts';
import { grp, type MOpts, place, pbox, skirt, column } from '../kit/town.ts';

// Hero builders for country landmarks (Europe, Middle East, Asia): Belém Tower, Hungarian Parliament, Preikestolen,
// Cliffs of Moher, Santa Claus Village, Walls of Dubrovnik, Registan, Sigiriya, Chocolate Hills, Elephant Rock.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.

// ---- local helpers ----------------------------------------------------------------------------------------
const Y0 = 0.035;
const LO = () => g('ca:sph8', () => new THREE.SphereGeometry(0.5, 8, 6));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const TINY = () => g('ca:sph6', () => new THREE.SphereGeometry(0.5, 6, 4));
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, Math.max(sx, sy, sz) < 0.0065 ? TINY() : LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
const frac = (v: number) => v - Math.floor(v);

const SKINS = ['#c58c64', '#e0b18f', '#8d5a3b', '#f1c9a5'];
function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, s = 1, skinC = SKINS[Math.floor(hash3(x * 91, z * 37, 3) * 4)]): void {
  passerby(p, x, y, z, 0.0168 * s, 1, { top: c, skin: skinC });
}
const SHIRTS = ['#dc2626', '#2563eb', '#f8fafc', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];
function crowd(p: THREE.Object3D, pts: [number, number][], y: number | ((x: number, z: number) => number), s = 1): void {
  pts.forEach(([x, z], i) => person(p, x, typeof y === 'number' ? y : y(x, z), z, SHIRTS[(i * 3 + Math.floor(Math.abs(x * 97))) % SHIRTS.length], s));
}
/** Square-grid heightfield clipped to a disc of radius R. */
function field(p: THREE.Object3D, R: number, n: number, h: HFn, base: string, paint: Paint, o: MOpts = {}, y0 = Y0): THREE.Mesh {
  const pos: number[] = [], idx: number[] = [], N = n + 1, cs = (2 * R) / n;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    let x = -R + cs * i, z = -R + cs * j;
    const r = Math.hypot(x, z);
    if (r > R) { x *= R / r; z *= R / r; }
    pos.push(x, y0 + h(x, z), z);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = -R + cs * (i + 0.5), cz = -R + cs * (j + 0.5);
    if (Math.hypot(cx, cz) > R + cs * 0.7) continue;
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return place(p, geo, base, paint, { flat: o.flat ?? false, metal: o.metal, rough: o.rough ?? 0.85 });
}
/** Superellipse radius at angle a for semi-axes A (x) and B (z). */
const sup = (a: number, A: number, B: number, pw = 3) => 1 / ((Math.abs(Math.cos(a)) / A) ** pw + (Math.abs(Math.sin(a)) / B) ** pw) ** (1 / pw);
/** Faceted broken-stone chunk (icosahedron with jittered vertices). */
function chunk(p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, ry = 0): THREE.Mesh {
  const geo = g('ca:chunk' + (seed % 5), () => {
    const ig = new THREE.IcosahedronGeometry(1, 1), pos = ig.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i), b = pos.getY(i), e = pos.getZ(i);
      const k = 0.72 + 0.45 * hash3(Math.round(a * 9) + (seed % 5) * 13, Math.round(b * 9), Math.round(e * 9));
      pos.setXYZ(i, a * k, b * k, e * k);
    }
    ig.computeVertexNormals();
    return ig;
  });
  return add(p, geo, mat(c), x, y, z, sx, sy, sz, ry);
}
function bush(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  blob(p, c, x, y + s * 0.35, z, s * 0.55, s * 0.4, s * 0.5);
  blob(p, shade(c, 1.15), x + s * 0.15, y + s * 0.55, z + s * 0.1, s * 0.3);
}
function leafy(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#5b4030', x, y, z, s * 0.07, s * 0.55, 5);
  blob(p, c, x, y + s * 0.72, z, s * 0.42, s * 0.34, s * 0.42);
  blob(p, shade(c, 1.14), x + s * 0.12, y + s * 0.9, z + s * 0.08, s * 0.26);
  blob(p, shade(c, 0.9), x - s * 0.16, y + s * 0.66, z - s * 0.06, s * 0.24);
}
function spruce(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, snow = false): void {
  cyl(p, '#4a3426', x, y, z, s * 0.06, s * 0.2, 5);
  for (let k = 0; k < 3; k++) {
    const yy = y + s * (0.12 + k * 0.28), r = s * (0.32 - k * 0.08);
    cone(p, c, x, yy, z, r, s * (0.5 - k * 0.08), 7, k);
    if (snow) cone(p, '#f4f8fc', x, yy + s * (0.5 - k * 0.08) * 0.45, z, r * 0.62, s * (0.5 - k * 0.08) * 0.55, 7, k);
  }
}
/** Iterates edges of a closed [x,z] plan with the outward normal. */
function edges(plan: [number, number][], f: (ax: number, az: number, bx: number, bz: number, len: number, nx: number, nz: number) => void): void {
  let cx = 0, cz = 0;
  for (const [x, z] of plan) { cx += x / plan.length; cz += z / plan.length; }
  plan.forEach(([ax, az], i) => {
    const [bx, bz] = plan[(i + 1) % plan.length], len = Math.hypot(bx - ax, bz - az);
    let nx = (bz - az) / len, nz = -(bx - ax) / len;
    if (((ax + bx) / 2 - cx) * nx + ((az + bz) / 2 - cz) * nz < 0) { nx = -nx; nz = -nz; }
    f(ax, az, bx, bz, len, nx, nz);
  });
}
/** Y-rotation that maps local +z (a facade's outward normal) onto the direction (nx, nz). */
const faceRy = (nx: number, nz: number) => Math.atan2(nx, nz);
const WATERP = (c: string): Paint => (x, _y, z) => {
  const w = Math.sin(x * 70 + Math.sin(z * 31) * 2.2 + z * 18);
  return w > 0.94 ? mix(c, '#e2f3fb', 0.5) : hash3(Math.floor(x * 70), 0, Math.floor(z * 70)) > 0.88 ? shade(c, 1.1) : fbm(x * 6, 1, z * 6, 2) > 0.6 ? shade(c, 0.93) : c;
};
/**
 * Flat facade sheet in local (u, v) facing local +z, placed at (x, y, z) rotated ry. Cells between the u/v breakpoints
 * are coloured by col(u, v) at the cell centre; equal-coloured neighbours along a row merge into one quad.
 */
const COLC = new Map<string, THREE.Color>();
function wallGrid(p: THREE.Object3D, x: number, y: number, z: number, ry: number, us: number[], vs: number[], col: (u: number, v: number) => string): THREE.Mesh {
  const pos: number[] = [], cols: number[] = [];
  for (let j = 0; j + 1 < vs.length; j++) {
    const v0 = vs[j], v1 = vs[j + 1], vm = (v0 + v1) / 2;
    let i = 0;
    while (i + 1 < us.length) {
      const c = col((us[i] + us[i + 1]) / 2, vm);
      let k = i + 1;
      while (k + 1 < us.length && col((us[k] + us[k + 1]) / 2, vm) === c) k++;
      const u0 = us[i], u1 = us[k];
      pos.push(u0, v0, 0, u1, v0, 0, u1, v1, 0, u0, v0, 0, u1, v1, 0, u0, v1, 0);
      let cc = COLC.get(c);
      if (!cc) { cc = new THREE.Color(c); COLC.set(c, cc); }
      for (let n = 0; n < 6; n++) cols.push(cc.r, cc.g, cc.b);
      i = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return add(p, geo, mat('#ffffff', { vc: true, flat: true }), x, y, z, 1, 1, 1, ry);
}
const tbx = tbox;
const gab = gable;
const sailMat = (c: string) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7 });
/** Small sailing boat (hull along x), for scale on water. */
function sailboat(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s: number, sail = '#f8fafc'): void {
  const q = grp(p, x, y, z, ry);
  prism(q, [[-0.05 * s, -0.012 * s], [0.035 * s, -0.012 * s], [0.06 * s, 0], [0.035 * s, 0.012 * s], [-0.05 * s, 0.012 * s]], -0.004 * s, 0.012 * s, '#f1f5f9');
  box(q, '#1e3a5f', 0, 0.0075 * s, 0, 0.11 * s, 0.002 * s, 0.026 * s);
  rod(q, [0, 0.008 * s, 0], [0, 0.09 * s, 0], 0.0012 * s, '#6b7280', 4);
  const tri = (pts: [number, number][]) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a * s, b * s))));
  add(q, tri([[0.002, 0.012], [0.002, 0.088], [0.045, 0.014]]), sailMat(sail), 0, 0, 0, 1, 1, 1);
  add(q, tri([[-0.002, 0.07], [-0.002, 0.014], [-0.04, 0.012]]), sailMat(shade(sail, 0.95)), 0, 0, 0, 1, 1, 1);
}

// =========================================================================================================
// Belém Tower — Manueline bastion and four-storey tower standing in the Tagus, shield merlons with the cross of the
// Order of Christ, ribbed-dome sentry turrets, the arcaded Renaissance loggia and a wooden footbridge from the beach.
function merlons(p: THREE.Object3D, plan: [number, number][], y: number, step: number, c: string, cross = true, h = 0.02): void {
  edges(plan, (ax, az, bx, bz, len, nx, nz) => {
    const n = Math.max(1, Math.round(len / step)), ry = faceRy(nx, nz);
    box(p, c, (ax + bx) / 2, y - 0.002, (az + bz) / 2, len, 0.008, 0.01, ry + Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const w = Math.min(step * 0.55, 0.018);
      box(p, c, x, y, z, w, h * 0.72, 0.009, ry);
      add(p, TINY(), mat(c, { flat: false }), x, y + h * 0.72, z, w, h * 0.6, 0.009, ry);
      if (cross) {
        const ox = x + nx * 0.0048, oz = z + nz * 0.0048;
        box(p, '#b4232a', ox, y + h * 0.28, oz, w * 0.18, h * 0.5, 0.0014, ry);
        box(p, '#b4232a', ox, y + h * 0.48, oz, w * 0.55, h * 0.12, 0.0014, ry);
      }
    }
  });
}
function garita(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, dome = c): void {
  lathe(p, [[0, -0.5 * s], [0.12 * s, -0.5 * s], [0.42 * s, -0.08 * s], [0.5 * s, 0], [0.5 * s, 0.85 * s], [0.6 * s, 0.9 * s], [0.6 * s, 1.0 * s], [0, 1.0 * s]], c, x, y, z, 10);
  lathe(p, [[0.54 * s, 0], [0.52 * s, 0.18 * s], [0.42 * s, 0.4 * s], [0.24 * s, 0.56 * s], [0.08 * s, 0.64 * s], [0, 0.66 * s]], dome, x, y + 1.0 * s, z, 8);
  blob(p, dome, x, y + 1.72 * s, z, 0.09 * s, 0.12 * s, 0.09 * s);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    box(p, '#4b4038', x + Math.cos(a) * 0.49 * s, y + 0.35 * s, z + Math.sin(a) * 0.49 * s, 0.22 * s, 0.4 * s, 0.05 * s, -a + Math.PI / 2);
  }
}
/** Round-headed recessed window in a facade group (local +z is outward). */
function archWin(q: THREE.Object3D, x: number, y: number, w: number, h: number, frame: string, dark = '#3d342c', twin = false): void {
  box(q, frame, x, y - 0.003, 0.0012, w + 0.007, h + 0.006 - w / 2, 0.003);
  add(q, CYL(10), mat(frame), x, y + h - w / 2, 0.0012, w + 0.007, 0.003, w + 0.007, 0, Math.PI / 2);
  box(q, dark, x, y, 0.0024, w, h - w / 2, 0.003);
  add(q, CYL(10), mat(dark), x, y + h - w / 2, 0.0024, w, 0.003, w, 0, Math.PI / 2);
  if (twin) box(q, frame, x, y, 0.0036, w * 0.14, h - w * 0.2, 0.002);
}
const ca_belem: Builder = gp => {
  const ST = '#ebe2cf', ST2 = '#ddd2b8', WET = '#8b8572', RIVER = '#3f8296';
  const beach = (x: number, z: number) => -(x * 0.8 + z * 0.6) - 0.3 + 0.03 * Math.sin(x * 14 + z * 9);
  const hf: HFn = (x, z) => { const d = beach(x, z); return d > 0 ? 0.004 + 0.016 * sstep(0, 0.1, d) : 0.004 * sstep(-0.03, 0, d); };
  field(gp, 0.5, 64, hf, RIVER, (x, y, z) => {
    const d = beach(x, z);
    if (d < -0.012) return WATERP(RIVER)(x, y, z, 0, 1, 0);
    if (d < 0.004) return Math.sin(x * 200) > 0.2 ? '#e7f1f2' : '#bfd8dc';
    if (d > 0.13) return fbm(x * 20, 0, z * 20, 2) > 0.55 ? '#6f9a52' : '#7fa95d';
    return hash3(Math.floor(x * 120), 1, Math.floor(z * 120)) > 0.75 ? '#dcc79a' : '#e8d6aa';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y, x, z) => (beach(x, z) > 0 && y > Y0 * 0.5 ? '#c9b48a' : y > Y0 * 0.5 ? '#2f6a7c' : '#4a3628'), 96, 2);

  // Bastion: hexagonal prow pointing out into the river
  const BP: [number, number][] = [[-0.16, -0.17], [0.16, -0.17], [0.16, 0.09], [0.085, 0.21], [-0.085, 0.21], [-0.16, 0.09]];
  const BH = 0.13;
  prism(gp, BP.map(([x, z]) => [x * 1.06, z * 1.05 + 0.002] as [number, number]), Y0 - 0.004, 0.016, WET);
  prism(gp, BP, Y0, BH, ST);
  // Stone courses, cannon ports and the twisted-rope moulding band
  for (const yy of [0.045, 0.098]) prism(gp, BP.map(([x, z]) => [x * 1.012, z * 1.01] as [number, number]), Y0 + yy, 0.004, ST2);
  edges(BP, (ax, az, bx, bz, len, nx, nz) => {
    const q = grp(gp, (ax + bx) / 2 + nx * 0.0005, Y0, (az + bz) / 2 + nz * 0.0005, faceRy(nx, nz));
    const n = Math.max(1, Math.round(len / 0.05));
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (len * (i + 0.5)) / n;
      box(q, '#3d342c', u, 0.06, 0.0012, 0.011, 0.012, 0.003);
      box(q, ST2, u, 0.073, 0.0014, 0.016, 0.004, 0.004);
    }
  });
  // Royal arms over the prow
  const pq = grp(gp, 0, Y0, 0.21, 0);
  rbox(pq, '#d6ccb5', 0, 0.104, 0.002, 0.03, 0.022, 0.006, 0.003);
  blob(pq, '#b8ad96', 0, 0.128, 0.004, 0.009, 0.006, 0.003);
  merlons(gp, BP.map(([x, z]) => [x * 0.985, z * 0.985] as [number, number]), Y0 + BH, 0.028, ST);
  for (const [x, z] of BP) garita(gp, x * 1.02, Y0 + BH - 0.004, z * 1.02, 0.026, ST);

  // Tower (four storeys) at the back of the bastion
  const TZ = -0.075, TW = 0.17, TH = 0.4;
  pbox(gp, TW, TH, TW, 0, Y0, TZ, ST, (x, y, z) => {
    const h = hash3(Math.floor(x * 140), Math.floor(y * 90), Math.floor(z * 140));
    return frac(y * 70) < 0.08 ? ST2 : h > 0.93 ? shade(ST, 0.95) : h < 0.05 ? shade(ST, 1.03) : null;
  }, [8, 36, 8]);
  box(gp, ST2, 0, Y0 + 0.215, TZ, TW + 0.006, 0.006, TW + 0.006);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as [number, number][]) {
    const q = grp(gp, nx * TW / 2, Y0, TZ + nz * TW / 2, faceRy(nx, nz));
    if (nz !== 1) {
      archWin(q, 0, 0.27, 0.03, 0.05, ST2, '#3d342c', true);
      archWin(q, 0, 0.165, 0.018, 0.03, ST2);
    }
    archWin(q, -0.04, 0.345, 0.016, 0.028, ST2);
    archWin(q, 0.04, 0.345, 0.016, 0.028, ST2);
    // armillary-sphere reliefs
    blob(q, '#c9bea6', -0.05, 0.3, 0.002, 0.007, 0.007, 0.003);
    blob(q, '#c9bea6', 0.05, 0.3, 0.002, 0.007, 0.007, 0.003);
  }
  // Renaissance loggia on the river face
  {
    const q = grp(gp, 0, Y0, TZ + TW / 2, 0), LW = 0.15, LY = 0.215, LH = 0.075, LD = 0.034;
    box(q, '#463a30', 0, LY, 0.002, LW - 0.01, LH, 0.003);
    box(q, ST, 0, LY - 0.006, LD / 2, LW + 0.012, 0.008, LD + 0.004);
    const holes: THREE.Path[] = [];
    for (let i = 0; i < 6; i++) holes.push(archPath(-LW / 2 + LW * (i + 0.5) / 6, 0.016, LW / 6 - 0.008, 0.042));
    panel(q, LW, LH - 0.004, 0.006, ST, holes, 0, LY + 0.002, LD);
    for (const s of [-1, 1]) panel(q, LD, LH - 0.004, 0.006, ST, [archPath(0, 0.016, LD - 0.012, 0.042)], s * LW / 2, LY + 0.002, LD / 2, Math.PI / 2);
    box(q, ST2, 0, LY + LH - 0.002, LD / 2, LW + 0.014, 0.008, LD + 0.008);
    // balustrade on the loggia roof
    box(q, ST, 0, LY + LH + 0.018, LD + 0.002, LW + 0.01, 0.003, 0.004);
    for (let i = 0; i < 15; i++) cyl(q, ST, -LW / 2 + LW * (i + 0.5) / 15, LY + LH + 0.006, LD + 0.002, 0.0018, 0.012, 5);
    box(q, ST2, 0, LY + 0.004, LD + 0.002, LW + 0.008, 0.012, 0.004);
  }
  // Corbelled terrace with merlons and corner turrets, then the upper storey and top terrace
  tbx(gp, TW, TW, TW + 0.022, TW + 0.022, 0.016, ST2, 0, Y0 + TH - 0.016, TZ);
  const sq = (w: number): [number, number][] => [[-w / 2, TZ - w / 2], [w / 2, TZ - w / 2], [w / 2, TZ + w / 2], [-w / 2, TZ + w / 2]];
  merlons(gp, sq(TW + 0.016), Y0 + TH, 0.026, ST);
  for (const [x, z] of sq(TW + 0.022)) garita(gp, x, Y0 + TH - 0.006, z, 0.026, ST);
  const UW = 0.13, UH = 0.085;
  pbox(gp, UW, UH, UW, 0, Y0 + TH, TZ, ST, (_x, y) => (frac(y * 70) < 0.08 ? ST2 : null), [1, 10, 1]);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as [number, number][]) {
    const q = grp(gp, nx * UW / 2, Y0 + TH, TZ + nz * UW / 2, faceRy(nx, nz));
    archWin(q, -0.026, 0.024, 0.016, 0.034, ST2, '#3d342c');
    archWin(q, 0.026, 0.024, 0.016, 0.034, ST2, '#3d342c');
  }
  tbx(gp, UW, UW, UW + 0.018, UW + 0.018, 0.012, ST2, 0, Y0 + TH + UH - 0.012, TZ);
  merlons(gp, sq(UW + 0.012), Y0 + TH + UH, 0.024, ST, true, 0.017);
  for (const [x, z] of sq(UW + 0.016)) garita(gp, x, Y0 + TH + UH - 0.004, z, 0.02, ST);
  box(gp, '#d8cfbb', 0, Y0 + TH + UH, TZ, UW, 0.003, UW);
  rod(gp, [0.03, Y0 + TH + UH, TZ - 0.03], [0.03, Y0 + TH + UH + 0.09, TZ - 0.03], 0.0012, '#6b7280', 4);
  box(gp, '#1f7a3a', 0.044, Y0 + TH + UH + 0.072, TZ - 0.03, 0.028, 0.017, 0.0015);
  box(gp, '#c8102e', 0.052, Y0 + TH + UH + 0.072, TZ - 0.0298, 0.016, 0.017, 0.0016);
  blob(gp, '#facc15', 0.039, Y0 + TH + UH + 0.0805, TZ - 0.029, 0.0035, 0.0035, 0.001);

  // Wooden footbridge from the beach to the bastion door
  const BY = Y0 + 0.028, bx0 = -0.42, bx1 = -0.16, bz = -0.02;
  box(gp, '#3d342c', -0.161, Y0 + 0.006, bz, 0.004, 0.034, 0.024);
  box(gp, '#9a7652', (bx0 + bx1) / 2, BY, bz, bx1 - bx0, 0.004, 0.04);
  for (let x = bx0 + 0.015; x < bx1; x += 0.03) {
    for (const s of [-1, 1]) {
      rod(gp, [x, Y0 - 0.002, bz + s * 0.018], [x, BY, bz + s * 0.018], 0.0022, '#5b4433', 4);
      rod(gp, [x, BY, bz + s * 0.019], [x, BY + 0.013, bz + s * 0.019], 0.0009, '#3f3f46', 3);
    }
  }
  for (const s of [-1, 1]) box(gp, '#52525b', (bx0 + bx1) / 2, BY + 0.012, bz + s * 0.019, bx1 - bx0, 0.0014, 0.0014);
  crowd(gp, [[-0.33, -0.012], [-0.27, -0.028], [-0.24, -0.01], [-0.38, -0.025]], BY + 0.004, 1.15);
  crowd(gp, [[-0.04, 0.16], [0.05, 0.13], [0.11, 0.05], [0.12, -0.12]], Y0 + BH, 1.15);
  crowd(gp, [[-0.4, -0.2], [-0.33, -0.32], [-0.2, -0.38]], (x, z) => Y0 + hf(x, z), 1.1);
  sailboat(gp, 0.3, Y0 + 0.004, 0.28, 0.5, 1.3);
  sailboat(gp, -0.2, Y0 + 0.004, 0.38, -0.3, 1.0, '#fde68a');
  for (const [x, z] of [[-0.3, -0.36], [-0.12, -0.45], [-0.42, -0.2]] as [number, number][]) leafy(gp, x, Y0 + hf(x, z), z, 0.06, '#4e7d3a');
};

// =========================================================================================================
// Hungarian Parliament — Gothic-Revival river front on the Danube: ribbed red dome on a 16-sided drum, twin needle
// spires, steep-roofed chamber pavilions with corner turrets, arcaded ground floor and pinnacled buttress bays.
const ca_parliament: Builder = gp => {
  const ST = '#f1e9d8', ST2 = '#d9cdb6', ROOF = '#8e3d2f', SLATE = '#5d4a45', GOLD = '#d6a640', DARK = '#4a4038', GLASS = '#5a6470';
  const RIV = 0.2;
  const hf: HFn = (_x, z) => (z < RIV ? 0.018 : 0);
  field(gp, 0.5, 58, hf, '#cfc6b4', (x, y, z) => {
    if (z > RIV + 0.004) return WATERP('#4f8aa3')(x, y, z, 0, 1, 0);
    if (z > RIV - 0.004) return '#a39a88';
    if (z > 0.17) return Math.abs(z - 0.185) < 0.002 ? '#e5e7eb' : '#8b8d91';
    if (z < -0.2 && Math.abs(x) > 0.08 && Math.abs(x) < 0.38) return frac(x * 40) < 0.05 ? '#cfc6b4' : '#6f9a50';
    return hash3(Math.floor(x * 80), 2, Math.floor(z * 80)) > 0.8 ? '#c6bca8' : null;
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y, _x, z) => (z > RIV && y > Y0 * 0.5 ? '#3a6f86' : y > Y0 * 0.5 ? '#b8ad98' : '#6b5f50'), 96, 2);
  box(gp, '#b5aa94', 0, Y0, RIV - 0.003, 0.96, 0.02, 0.006);
  const G = Y0 + 0.018;
  /** Facade colour at (u along wall from its left end, v above ground): buttress strips, pointed-arch arcade, two storeys of windows. */
  const facade = (bay: number, top: number) => (u: number, v: number): string => {
    const f = frac(u / bay);
    if (v < 0.004 || v > top - 0.008 || (v > 0.034 && v < 0.04)) return ST2;
    if (f < 0.16 || f > 0.84) return ST2;
    if (v > 0.006 && v < 0.024) return f > 0.24 && f < 0.76 ? DARK : ST;
    if (v > 0.024 && v < 0.03) return f > 0.3 && f < 0.7 ? DARK : ST;
    if ((v > 0.046 && v < top * 0.62) || (v > top * 0.68 && v < top - 0.012)) return f > 0.3 && f < 0.7 ? GLASS : ST;
    return ST;
  };
  /** A building range: box w×d×h centred (x,z) with facade sheets on all four walls. */
  const range = (x: number, z: number, w: number, d: number, h: number, bay = 0.022) => {
    box(gp, ST, x, G, z, w, h, d);
    const vs = [0, 0.004, 0.006, 0.024, 0.03, 0.034, 0.04, 0.046, h * 0.62, h * 0.68, h - 0.012, h - 0.008, h];
    const sheet = (len: number, px: number, pz: number, ry: number) => {
      const n = Math.max(1, Math.round(len / bay)), b = len / n, us: number[] = [];
      for (let i = 0; i < n; i++) for (const f of [0, 0.16, 0.24, 0.3, 0.7, 0.76, 0.84]) us.push(-len / 2 + (i + f) * b);
      us.push(len / 2);
      const fp = facade(b, h);
      wallGrid(gp, px, G, pz, ry, us, vs, (u, v) => fp(u + len / 2, v));
    };
    const e = 0.0006;
    sheet(w, x, z + d / 2 + e, 0); sheet(w, x, z - d / 2 - e, Math.PI);
    sheet(d, x + w / 2 + e, z, Math.PI / 2); sheet(d, x - w / 2 - e, z, -Math.PI / 2);
  };
  const pinn = (x: number, y: number, z: number, s: number, c = ST, tip = SLATE) => {
    cyl(gp, c, x, y, z, 0.0045 * s, 0.02 * s, 6);
    cone(gp, tip, x, y + 0.02 * s, z, 0.0055 * s, 0.03 * s, 6);
    blob(gp, GOLD, x, y + 0.05 * s, z, 0.0016 * s);
  };
  /** Buttress pinnacles along the top of a facade (x0..x1 at depth z). */
  const crest = (x0: number, x1: number, z: number, y: number, bay = 0.022) => {
    for (let x = x0 + bay / 2; x < x1; x += bay) {
      box(gp, ST2, x, G, z, 0.004, y - G + 0.004, 0.005);
      pinn(x, y, z, 0.55);
    }
    box(gp, ST2, (x0 + x1) / 2, y - 0.002, z, x1 - x0, 0.006, 0.006);
  };
  const hip = (x: number, z: number, w: number, d: number, y: number, h: number, ridge = 0.3) => {
    tbx(gp, w, d, w * ridge, d * 0.08, h, ROOF, x, y, z);
    box(gp, GOLD, x, y + h, z, w * ridge, 0.003, 0.003);
  };
  const D = 0.27, H1 = 0.13;
  for (const s of [-1, 1]) {
    // Long wing ranges (river and city fronts) roofed over the courtyards, with dormers
    range(s * 0.32, 0, 0.14, D - 0.02, H1);
    for (const fz of [-1, 1]) crest(s > 0 ? 0.25 : -0.39, s > 0 ? 0.39 : -0.25, fz * (D / 2 - 0.008), G + H1);
    tbx(gp, 0.14, D - 0.02, 0.13, 0.03, 0.04, ROOF, s * 0.32, G + H1, 0);
    for (let k = 0; k < 4; k++) {
      const x = s * (0.265 + k * 0.034);
      box(gp, ST, x, G + H1 + 0.006, D / 2 - 0.038, 0.012, 0.016, 0.01);
      gab(gp, 0.016, 0.012, 0.012, ROOF, x, G + H1 + 0.022, D / 2 - 0.038, Math.PI / 2);
    }
    range(s * 0.12, 0, 0.06, D - 0.02, H1);
    for (const fz of [-1, 1]) crest(s > 0 ? 0.09 : -0.15, s > 0 ? 0.15 : -0.09, fz * (D / 2 - 0.008), G + H1);
    tbx(gp, 0.06, D - 0.02, 0.05, 0.03, 0.04, ROOF, s * 0.12, G + H1, 0);
    // Chamber pavilions: tall blocks, steep hipped roofs, corner turrets with spires
    const px = s * 0.2;
    range(px, 0, 0.1, D + 0.01, 0.17, 0.02);
    hip(px, 0, 0.1, D + 0.01, G + 0.17, 0.08, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = px + sx * 0.046, tz = sz * (D / 2 + 0.002);
      cyl(gp, ST, tx, G, tz, 0.009, 0.2, 8);
      cyl(gp, ST2, tx, G + 0.2, tz, 0.011, 0.006, 8);
      cone(gp, SLATE, tx, G + 0.206, tz, 0.01, sz > 0 ? 0.075 : 0.05, 8);
      blob(gp, GOLD, tx, G + 0.206 + (sz > 0 ? 0.077 : 0.052), tz, 0.0025);
    }
    for (const sz of [-1, 1]) {
      box(gp, ST, px, G + 0.17, sz * (D / 2 - 0.004), 0.034, 0.03, 0.008);
      gab(gp, 0.036, 0.024, 0.012, ST2, px, G + 0.2, sz * (D / 2 - 0.004), Math.PI / 2);
      pinn(px, G + 0.222, sz * (D / 2 - 0.004), 0.5);
    }
    rod(gp, [px, G + 0.25, 0], [px, G + 0.3, 0], 0.0011, '#6b7280', 4);
    box(gp, '#c8102e', px + 0.011, G + 0.291, 0, 0.02, 0.0045, 0.0012);
    box(gp, '#f8fafc', px + 0.011, G + 0.2865, 0, 0.02, 0.0045, 0.0012);
    box(gp, '#2f7d3a', px + 0.011, G + 0.282, 0, 0.02, 0.0045, 0.0012);
    // End pavilions
    const ex = s * 0.42;
    range(ex, 0, 0.06, D + 0.02, 0.15, 0.02);
    hip(ex, 0, 0.06, D + 0.02, G + 0.15, 0.05, 0.4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = ex + sx * 0.027, tz = sz * (D / 2 + 0.006);
      cyl(gp, ST, tx, G, tz, 0.007, 0.17, 8);
      cone(gp, SLATE, tx, G + 0.17, tz, 0.008, 0.04, 8);
      blob(gp, GOLD, tx, G + 0.212, tz, 0.002);
    }
  }
  // Central block: projecting river frontispiece with gables and grand windows
  range(0, 0, 0.18, D + 0.03, 0.16, 0.02);
  tbx(gp, 0.18, D + 0.03, 0.15, 0.1, 0.03, ROOF, 0, G + 0.16, 0);
  {
    const q = grp(gp, 0, G, D / 2 + 0.015, 0);
    for (const x of [-0.045, 0, 0.045]) {
      box(q, ST, x, 0.16, 0.0, 0.034, 0.03, 0.006);
      gab(q, 0.036, 0.03, 0.008, ST, x, 0.19, 0, Math.PI / 2);
      archWin(q, x, 0.165, 0.012, 0.02, ST2, GLASS);
    }
    for (const x of [-0.045, 0, 0.045]) pinn(x, G + 0.22, D / 2 + 0.015, 0.6);
    for (const x of [-0.034, 0, 0.034]) archWin(q, x, 0.085, 0.018, 0.05, ST2, GLASS, true);
  }
  // Twin needle spires flanking the dome
  for (const s of [-1, 1]) {
    const x = s * 0.07, z = D / 2 + 0.01;
    cyl(gp, ST, x, G, z, 0.011, 0.28, 8);
    for (let k = 0; k < 3; k++) cyl(gp, ST2, x, G + 0.17 + k * 0.035, z, 0.0135, 0.004, 8);
    lathe(gp, [[0.012, 0], [0.01, 0.02], [0.006, 0.07], [0.002, 0.11], [0, 0.12]], ST, x, G + 0.28, z, 8);
    blob(gp, GOLD, x, G + 0.403, z, 0.003);
    for (const sx of [-1, 1]) cone(gp, SLATE, x + sx * 0.012, G + 0.28, z, 0.004, 0.03, 6);
  }
  const DY = G + 0.19;
  box(gp, ST, 0, G + 0.16, 0, 0.15, 0.03, 0.15);
  // 16-sided drum with tall lancet windows and a ring of buttress pinnacles
  const DR = 0.074, DH = 0.075;
  lathe(gp, [[0, 0], [DR, 0], [DR, DH], [DR + 0.004, DH], [DR + 0.004, DH + 0.006], [0, DH + 0.006]], ST, 0, DY, 0, 16);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.PI / 16, ca = Math.cos(a), sa = Math.sin(a);
    const q = grp(gp, ca * DR * 0.985, DY, sa * DR * 0.985, faceRy(ca, sa));
    box(q, GLASS, 0, 0.012, 0.001, 0.014, 0.046, 0.003);
    cone(q, GLASS, 0, 0.058, 0.001, 0.007, 0.008, 4, Math.PI / 4);
    const b = a + Math.PI / 16, bx = Math.cos(b) * (DR + 0.004), bz = Math.sin(b) * (DR + 0.004);
    box(gp, ST2, bx, DY, bz, 0.006, DH + 0.008, 0.006, -b);
    pinn(bx, DY + DH + 0.008, bz, 0.5);
  }
  // Ribbed dome (16 facets), gold ribs, lantern, spire
  const DP: [number, number][] = [[DR - 0.002, 0], [0.074, 0.02], [0.07, 0.045], [0.06, 0.07], [0.045, 0.09], [0.026, 0.106], [0.012, 0.114], [0, 0.116]];
  lathe(gp, DP, ROOF, 0, DY + DH + 0.006, 0, 16);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (let i = 0; i < DP.length - 2; i++) {
      const [r0, y0] = DP[i], [r1, y1] = DP[i + 1];
      rod(gp, [Math.cos(a) * (r0 + 0.0012), DY + DH + 0.006 + y0, Math.sin(a) * (r0 + 0.0012)], [Math.cos(a) * (r1 + 0.0012), DY + DH + 0.006 + y1, Math.sin(a) * (r1 + 0.0012)], 0.0013, '#c9a46a', 3);
    }
  }
  const LY = DY + DH + 0.006 + 0.11;
  cyl(gp, ST, 0, LY, 0, 0.016, 0.03, 12);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; box(gp, GLASS, Math.cos(a) * 0.0155, LY + 0.006, Math.sin(a) * 0.0155, 0.005, 0.016, 0.002, -a + Math.PI / 2); }
  cone(gp, SLATE, 0, LY + 0.03, 0, 0.018, 0.012, 12);
  lathe(gp, [[0.008, 0], [0.006, 0.02], [0.002, 0.055], [0, 0.065]], ROOF, 0, LY + 0.042, 0, 8);
  blob(gp, GOLD, 0, LY + 0.108, 0, 0.003);
  rod(gp, [0, LY + 0.1, 0], [0, LY + 0.12, 0], 0.0008, GOLD, 3);
  // Embankment details: tram, trees, strollers, a river cruiser
  box(gp, '#facc15', -0.1, G, 0.183, 0.07, 0.016, 0.014);
  box(gp, '#9ca3af', -0.1, G + 0.016, 0.183, 0.066, 0.002, 0.012);
  for (let x = -0.44; x < 0.45; x += 0.06) if (Math.abs(x + 0.1) > 0.05) leafy(gp, x, G, 0.162, 0.032, '#5b8a43');
  crowd(gp, [[0.05, 0.172], [0.12, 0.176], [0.25, 0.17], [-0.3, 0.174], [0.02, -0.19], [-0.05, -0.2], [0.07, -0.21]], G, 1.05);
  for (const [x, z] of [[-0.24, -0.27], [0.24, -0.27], [-0.32, -0.25], [0.32, -0.25], [-0.16, -0.3], [0.16, -0.3]] as [number, number][]) leafy(gp, x, G, z, 0.04, '#4e7d3a');
  sailboat(gp, 0.22, Y0 + 0.003, 0.33, 0.1, 1.1);
  {
    const q = grp(gp, -0.2, Y0, 0.36, 0.05);
    prism(q, [[-0.08, -0.018], [0.07, -0.018], [0.09, 0], [0.07, 0.018], [-0.08, 0.018]], -0.003, 0.014, '#f8fafc');
    box(q, '#1e3a8a', 0, 0.01, 0, 0.17, 0.003, 0.036);
    box(q, '#e2e8f0', -0.01, 0.011, 0, 0.1, 0.014, 0.03);
    for (let k = 0; k < 7; k++) box(q, '#334155', -0.055 + k * 0.015, 0.016, 0.0151, 0.009, 0.005, 0.001);
  }
};

// =========================================================================================================
// Elephant Rock (Jabal AlFil) — a wind-carved sandstone block in the AlUla desert whose "trunk" reaches the sand,
// leaving a tall arch beneath the head; fluted vertical weathering, banded strata, sunset seating pits, a camel.
const ROCKPAL = ['#cf9f66', '#d6aa70', '#c4935c', '#d2a46b', '#c99962'];
const ca_elephant: Builder = gp => {
  const SAND = '#e3c08c';
  const hf: HFn = (x, z) => 0.004 * fbm(x * 5, 0, z * 5, 3) + 0.003 * Math.sin(x * 40 + z * 18 + fbm(x * 3, 2, z * 3, 2) * 4);
  field(gp, 0.5, 56, hf, SAND, (x, _y, z) => {
    const n = fbm(x * 12, 5, z * 12, 2);
    return Math.sin(x * 40 + z * 18 + n * 4) > 0.7 ? '#d6b07a' : n > 0.6 ? '#ecca97' : null;
  });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y) => (y > Y0 * 0.6 ? '#c9a06a' : '#8a6a44'), 96, 2);
  const RH = 0.47, base = Y0 - 0.004;
  const rockPaint: Paint = (x, y, z, nx, ny, nz) => {
    const a = Math.atan2(nz, nx), st = ROCKPAL[Math.abs(Math.floor(y * 55 + fbm(x * 9, y * 2, z * 9, 2) * 1.6)) % ROCKPAL.length];
    if (ny > 0.75) return fbm(x * 30, 1, z * 30, 2) > 0.5 ? '#d9b07a' : '#c89a64';
    if (y < Y0 + 0.02) return mix('#a8784a', st, sstep(Y0, Y0 + 0.02, y));
    const fl = hash3(Math.floor(a * 30 + Math.sin(y * 9)), 3, Math.floor(y * 12));
    return fl > 0.86 ? shade(st, 0.86) : fl < 0.1 ? shade(st, 1.08) : st;
  };
  // Body + head: superellipse rings; above the arch the plan grows towards -x to form the head over the trunk
  const head = (t: number) => sstep(0.62, 0.78, t);
  const flute = (a: number, t: number, sd: number) => 1 + 0.045 * (vnoise(a * 7 + sd, t * 2.5, sd) - 0.5) + 0.018 * Math.sin(a * 46 + t * 3)
    + 0.009 * Math.sin(t * 55 + a) * (t > 0.05 ? 1 : 0) + 0.012 * Math.sin(a * 23 + Math.sin(t * 7) * 2);
  column(gp, 0, 0, base, RH, (a, t) => {
    const e = head(t), A = 0.24 + 0.13 * e, B = 0.155 - 0.01 * e;
    const top = t > 0.74 ? 1 - ((t - 0.74) / 0.26) ** 2.4 * 0.42 : 1;
    const foot = t < 0.04 ? 1.04 : 1;
    const lean = 1 + 0.06 * Math.cos(a) * t;
    return sup(a, A, B, 3.2) * top * foot * lean * flute(a, t, 1);
  }, ROCKPAL[0], rockPaint, 52, 30, t => [0.135 - 0.135 * head(t) + 0.01 * Math.sin(t * 6), 0], false);
  // Trunk: curls down from the head to a wide foot in the sand
  column(gp, -0.325, 0.005, base, 0.4, (a, t) => {
    const w = 0.066 - 0.02 * Math.sin(Math.min(1, t * 1.25) * Math.PI) + (t < 0.08 ? 0.014 * (1 - t / 0.08) : 0) + 0.02 * sstep(0.75, 1, t);
    return sup(a, w * 0.85, w * 1.15, 2.4) * flute(a, t, 7);
  }, ROCKPAL[1], rockPaint, 30, 18, t => [-0.012 * Math.sin(t * Math.PI) + 0.03 * t * t, 0.01 * Math.sin(t * 3)], false);
  // Fallen boulders at the foot
  for (const [x, z, s, sd] of [[0.3, 0.16, 0.03, 1], [0.36, 0.08, 0.02, 2], [-0.2, -0.17, 0.022, 3], [0.22, -0.2, 0.026, 4]] as [number, number, number, number][]) chunk(gp, ROCKPAL[sd % 5], x, Y0 + s * 0.3, z, s, s * 0.7, s * 0.9, sd);
  // Distant mesa outcrops on the rim
  for (const [x, z, h, r, sd] of [[-0.38, -0.27, 0.11, 0.06, 2], [0.4, -0.25, 0.08, 0.05, 5], [-0.08, -0.43, 0.06, 0.05, 8]] as [number, number, number, number, number][]) {
    column(gp, x, z, base, h, (a, t) => r * (t > 0.8 ? 1 - ((t - 0.8) / 0.2) ** 2 * 0.4 : 1) * (1 + 0.15 * (vnoise(a * 2 + sd, t * 3, sd) - 0.5)), ROCKPAL[2], rockPaint, 16, 6);
  }
  // Sunset seating: sunken pits with cushions around a fire bowl
  for (const [x, z] of [[0.08, 0.32], [-0.1, 0.36], [0.26, 0.3]] as [number, number][]) {
    lathe(gp, [[0, 0], [0.04, 0], [0.042, 0.006], [0.036, 0.007], [0, 0.002]], '#cfa874', x, Y0 - 0.001, z, 14);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; rbox(gp, k % 2 ? '#e7d8c0' : '#b45309', x + Math.cos(a) * 0.026, Y0 + 0.002, z + Math.sin(a) * 0.026, 0.012, 0.005, 0.01, 0.002, -a); }
    cyl(gp, '#3f3f46', x, Y0 + 0.002, z, 0.007, 0.006, 8);
    blob(gp, '#f97316', x, Y0 + 0.01, z, 0.004, 0.006, 0.004).material = mat('#f97316', { emissive: '#f97316' });
  }
  crowd(gp, [[-0.2, 0.2], [-0.17, 0.215], [0.06, 0.29], [0.11, 0.3], [-0.12, 0.33], [0.24, 0.27]], Y0, 1.25);
  // Camel resting near the trunk
  {
    const q = grp(gp, -0.3, Y0, 0.24, 0.6), C = '#b8875a';
    blob(q, C, 0, 0.034, 0, 0.032, 0.016, 0.014);
    blob(q, shade(C, 1.05), -0.002, 0.052, 0, 0.016, 0.014, 0.011);
    for (const [lx, lz] of [[-0.022, -0.008], [-0.022, 0.008], [0.022, -0.008], [0.022, 0.008]]) rod(q, [lx, 0.03, lz], [lx * 1.05, 0.0, lz], 0.0028, shade(C, 0.9), 4);
    rod(q, [0.03, 0.036, 0], [0.045, 0.06, 0], 0.005, C, 5);
    rod(q, [0.045, 0.06, 0], [0.052, 0.07, 0], 0.0045, C, 5);
    blob(q, C, 0.058, 0.069, 0, 0.011, 0.0055, 0.006);
    box(q, '#b91c1c', 0, 0.045, 0, 0.022, 0.003, 0.03);
  }
  for (let i = 0; i < 14; i++) {
    const a = hash3(i, 7, 1) * Math.PI * 2, d = 0.3 + hash3(i, 7, 2) * 0.17, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 0.2 && Math.abs(x) < 0.3) continue;
    bush(gp, x, Y0 + hf(x, z) - 0.002, z, 0.016 + hash3(i, 7, 3) * 0.01, i % 2 ? '#8a8a4a' : '#6f7a40');
  }
};

// =========================================================================================================
// Shared: a vertical cliff curtain hung along a coastline polyline so faces carry crisp horizontal strata.
function curtain(p: THREE.Object3D, line: [number, number][], y0: number, top: (x: number, z: number) => number, nv: number,
  push: (x: number, z: number, v: number) => number, paint: Paint, base: string): void {
  const pos: number[] = [], idx: number[] = [];
  line.forEach(([x, z], i) => {
    const [px, pz] = line[Math.max(0, i - 1)], [qx, qz] = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(qx - px, qz - pz) || 1, nx = (qz - pz) / l, nz = -(qx - px) / l;
    const t = top(x, z);
    for (let k = 0; k <= nv; k++) {
      const v = k / nv, o = push(x, z, v);
      pos.push(x + nx * o, y0 + (t - y0) * v, z + nz * o);
    }
  });
  for (let i = 0; i < line.length - 1; i++) for (let k = 0; k < nv; k++) {
    const a = i * (nv + 1) + k, b = a + nv + 1, c = a + 1, d = b + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  place(p, geo, base, paint);
}
/** Seagull in flight: two angled wing slivers. */
function gull(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s = 1): void {
  const q = grp(p, x, y, z, ry);
  for (const k of [-1, 1]) box(q, '#f8fafc', k * 0.007 * s, 0, 0, 0.014 * s, 0.0012 * s, 0.004 * s, 0, 0, -k * 0.35);
  box(q, '#e5e7eb', 0, -0.001 * s, 0, 0.003 * s, 0.002 * s, 0.008 * s);
}

// =========================================================================================================
// Cliffs of Moher — a concave sweep of dark, finely layered shale and sandstone cliffs dropping into the Atlantic,
// emerald grass on top, the Branaunmore sea stack, O'Brien's Tower on the highest point and the flagstone fence.
const ca_moher: Builder = gp => {
  const zc0 = (x: number) => 0.04 + 0.34 * x * x - 0.05 * x + 0.018 * Math.sin(x * 11 + 1) + 0.016 * (fbm(x * 8, 3, 1, 2) - 0.5);
  const ZT = Array.from({ length: 257 }, (_, i) => zc0(-0.52 + (1.04 * i) / 256));
  const zc = (x: number) => { const f = Math.min(255.999, Math.max(0, ((x + 0.52) / 1.04) * 256)), i = Math.floor(f); return ZT[i] + (ZT[i + 1] - ZT[i]) * (f - i); };
  const CH = (x: number) => 0.15 + 0.09 * sstep(-0.35, 0.3, x);
  const hf: HFn = (x, z) => {
    const d = zc(x) - z;
    if (d > 0.006) return CH(x) - 0.012 * sstep(0.05, 0.4, d) + 0.006 * vnoise(x * 9, 0, z * 9);
    if (d > -0.02) return d > 0 ? CH(x) * sstep(0, 0.006, d) : 0.004 * sstep(-0.02, 0, d);
    return 0;
  };
  const PAL = ['#4b4842', '#57534a', '#3f3d38', '#625c50', '#4f4b43', '#5a5448'];
  const stratum = (y: number, x: number, z: number) => {
    const n = vnoise(x * 14, y * 3, z * 14);
    if (frac(y * 46 + n * 0.4) < 0.1) return '#7a7362';
    return PAL[Math.abs(Math.floor(y * 92 + n * 1.3)) % PAL.length];
  };
  const SEA = '#24548c';
  field(gp, 0.5, 64, hf, SEA, (x, y, z, _nx, ny) => {
    const h = y - Y0, d = zc(x) - z;
    if (h < 0.005) {
      const f = -d, wv = Math.sin(f * 160 + vnoise(x * 10, 1, z * 10) * 4);
      if (f < 0.03 + 0.01 * Math.sin(x * 30)) return wv > -0.3 ? '#f1f7fa' : '#9cc6dc';
      if (f < 0.09 && wv > 0.8) return '#cfe4f0';
      if (hash3(Math.floor(x * 60), 4, Math.floor(z * 60)) > 0.988) return '#e8f2f8';
      return mix('#2f6aa6', '#1d4478', sstep(0.05, 0.4, f));
    }
    if (ny < 0.55) return stratum(y, x, z);
    if (d > 0.022 && d < 0.036) return hash3(Math.floor(x * 200), 1, Math.floor(z * 200)) > 0.5 ? '#b9ae96' : '#a89d86';
    if (d > 0.07 && (frac(x * 7 + z * 1.5 + 0.3) < 0.035 || frac(z * 6 - x * 0.8) < 0.035)) return '#8c8a80';
    const n = vnoise(x * 16, 0, z * 16);
    return n > 0.66 ? '#5f9a35' : n < 0.32 ? '#86b54a' : '#73a83f';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y, x, z) => (zc(x) - z > 0 && y > Y0 + 0.006 ? stratum(y, x, z) : y > Y0 * 0.5 ? '#1d4478' : '#2a2724'), 120, 6);
  const line: [number, number][] = [];
  for (let x = -0.5; x <= 0.5; x += 0.007) if (Math.hypot(x, zc(x) - 0.004) < 0.497) line.push([x, zc(x) - 0.004]);
  curtain(gp, line, Y0 + 0.003, (x) => Y0 + CH(x) - 0.002, 22, (x, _z, v) => {
    const ledge = Math.sin(v * 20 + x * 3) > 0.92 ? 0.004 : 0;
    return -0.002 + 0.004 * vnoise(x * 30, v * 7, 2) + ledge + (v < 0.12 ? -0.003 * (1 - v / 0.12) : 0);
  }, (x, y, z) => {
    const h = y - Y0, top = CH(x);
    if (h > top - 0.009) return '#6f9a3a';
    if (h < 0.01) return '#2f2c28';
    if (h > top * 0.35 && h < top * 0.62 && hash3(Math.floor(x * 70), 9, Math.floor(h * 50)) > 0.8) return '#6e8f3a';
    return stratum(y, x, z);
  }, PAL[0]);
  // Sea stacks: Branaunmore (tall, grass-capped) and a smaller one, notched by surf
  for (const [x, dz, H, R, sd] of [[-0.14, 0.12, 0.85, 0.032, 1], [-0.3, 0.1, 0.45, 0.02, 2]] as [number, number, number, number, number][]) {
    const z = zc(x) + dz, top = CH(x) * H;
    column(gp, x, z, Y0 - 0.004, top, (a, t) => {
      const notch = t < 0.08 ? 0.8 + t * 2.5 : 1, cap = t > 0.9 ? 1 - ((t - 0.9) / 0.1) ** 2 * 0.3 : 1;
      return R * notch * cap * (1 - 0.15 * t) * (1 + 0.16 * (vnoise(a * 2.5 + sd * 3, t * 3, sd) - 0.5));
    }, PAL[0], (px, py, pz, _nx, ny) => (ny > 0.55 && py > Y0 + top * 0.85 ? '#73a83f' : py < Y0 + 0.008 ? '#2f2c28' : stratum(py, px, pz)), 14, 22,
    t => [0.004 * Math.sin(t * 4 + sd), 0.003 * Math.cos(t * 3 + sd)]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + sd;
      blob(gp, k % 2 ? '#f1f7fa' : '#d4e6f0', x + Math.cos(a) * R * 1.05, Y0 + 0.002, z + Math.sin(a) * R * 1.05, R * 0.45, 0.0014, R * 0.3, -a + Math.PI / 2);
    }
  }
  for (const [x, dz, sc] of [[0.05, 0.03, 0.014], [0.24, 0.025, 0.012], [-0.22, 0.04, 0.01], [0.33, 0.035, 0.011]] as [number, number, number][]) {
    chunk(gp, '#3f3d38', x, Y0 + 0.001, zc(x) + dz, sc, sc * 0.7, sc, Math.round(x * 100 + 7));
    blob(gp, '#eef6fa', x, Y0 + 0.002, zc(x) + dz, sc * 1.6, 0.0014, sc * 1.1);
  }
  // Flagstone fence along the cliff-top path
  for (let x = -0.42; x < 0.44; x += 0.018) {
    const z = zc(x) - 0.019, z2 = zc(x + 0.016) - 0.019, y = Y0 + hf(x, z);
    if (Math.hypot(x, z) > 0.47) continue;
    box(gp, hash3(x * 50, 1, 2) > 0.5 ? '#6f6c62' : '#5f5c54', x + 0.008, y - 0.002, (z + z2) / 2, 0.016, 0.013, 0.003, -Math.atan2(z2 - z, 0.016));
  }
  // O'Brien's Tower: round crenellated tower on the summit, with its little walled yard
  {
    const x = 0.17, z = zc(0.17) - 0.06, y = Y0 + hf(x, z) - 0.002, TS = '#8a857a';
    cyl(gp, TS, x, y, z, 0.021, 0.07, 14);
    cyl(gp, shade(TS, 0.92), x, y + 0.07, z, 0.0235, 0.006, 14);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; box(gp, TS, x + Math.cos(a) * 0.021, y + 0.076, z + Math.sin(a) * 0.021, 0.008, 0.008, 0.005, -a + Math.PI / 2); }
    box(gp, '#3b342d', x, y, z + 0.0205, 0.009, 0.018, 0.003);
    for (const [wx, wy] of [[0, 0.035], [-0.01, 0.054]]) box(gp, '#2e2a26', x + wx, y + wy, z + 0.0202, 0.004, 0.008, 0.002);
    cyl(gp, shade(TS, 0.95), x + 0.012, y + 0.07, z - 0.012, 0.006, 0.016, 8);
    for (const [bx, bz, w, d] of [[x - 0.035, z, 0.003, 0.05], [x + 0.035, z, 0.003, 0.05], [x, z - 0.025, 0.07, 0.003]] as [number, number, number, number][]) box(gp, '#7d786c', bx, y, bz, w, 0.01, d);
  }
  // Visitors on the path, cows in the fields, gulls over the sea
  const pp: [number, number][] = [];
  for (const x of [-0.36, -0.29, -0.2, -0.06, 0.02, 0.08, 0.26, 0.31, 0.37]) pp.push([x, zc(x) - 0.03]);
  crowd(gp, pp, (x, z) => Y0 + hf(x, z) - 0.001, 1.2);
  for (const [x, z] of [[-0.25, -0.25], [-0.2, -0.3], [0.32, -0.24], [-0.05, -0.38]] as [number, number][]) {
    const y = Y0 + hf(x, z), q = grp(gp, x, y, z, hash3(x, z, 1) * 3);
    blob(q, '#f8fafc', 0, 0.012, 0, 0.012, 0.007, 0.007);
    blob(q, '#1f2937', 0.012, 0.014, 0, 0.005, 0.004, 0.004);
    for (const [lx, lz] of [[-0.007, -0.004], [-0.007, 0.004], [0.007, -0.004], [0.007, 0.004]]) cyl(q, '#1f2937', lx, 0, lz, 0.0016, 0.008, 4);
  }
  for (const [x, y, z, r] of [[-0.05, 0.27, 0.3, 0.4], [0.1, 0.31, 0.25, -0.3], [-0.25, 0.23, 0.33, 1.2], [0.3, 0.33, 0.2, 0.7]] as [number, number, number, number][]) gull(gp, x, y, z, r, 1.4);
};

// =========================================================================================================
// Preikestolen (Pulpit Rock) — a flat-topped, square granite block thrust out 604 m above the turquoise Lysefjord,
// with the deep crack behind it, a hiker trail over glacier-smoothed slabs, pines, and a ferry far below.
const ca_preikestolen: Builder = gp => {
  const R2 = Math.SQRT1_2;
  // s: across the fjord (positive = towards the water, front-left), u: along the fjord
  const S = (x: number, z: number) => (-x + z) * R2, U = (x: number, z: number) => (x + z) * R2;
  const edge = (u: number) => 0.05 + 0.025 * Math.sin(u * 7 + 1) + 0.02 * (vnoise(u * 6, 2, 0) - 0.5) - 0.09 * Math.exp(-((u + 0.014) ** 2) / 0.006);
  const FAR = 0.62;
  const hf: HFn = (x, z) => {
    const s = S(x, z), u = U(x, z), e = edge(u);
    const n = vnoise(x * 7, 1, z * 7), slab = 0.012 * Math.abs(Math.sin(x * 24 + n * 3) * Math.sin(z * 19 - n * 2));
    if (s < e) {
      const back = sstep(0, 0.45, e - s);
      return 0.25 + 0.12 * back + 0.05 * (n - 0.5) * back + slab;
    }
    if (s < e + 0.045) return 0.25 * (1 - sstep(e, e + 0.045, s)) ** 0.8;
    if (s > FAR) return 0.05 * sstep(FAR, FAR + 0.06, s) * (0.7 + 0.5 * n);
    return 0;
  };
  const GR = ['#9a9890', '#8a877e', '#a8a59b', '#7d7a72', '#b3b0a6'];
  const granite = (x: number, y: number, z: number) => {
    const h = hash3(Math.floor(x * 90 + y * 30), Math.floor(y * 140), Math.floor(z * 90 - y * 20));
    return h > 0.9 ? '#6f6c64' : GR[Math.floor(vnoise(x * 20, y * 25, z * 20) * 4.99)];
  };
  const FJ = '#2c8f95';
  field(gp, 0.5, 62, hf, FJ, (x, y, z, _nx, ny) => {
    const h = y - Y0, s = S(x, z), n = vnoise(x * 9, 3, z * 9);
    if (h < 0.004) {
      const w = Math.sin(U(x, z) * 80 + n * 3);
      return w > 0.93 ? '#5fc0c4' : mix('#2a9aa0', '#17646f', sstep(0.05, 0.3, s - edge(U(x, z))));
    }
    if (s > FAR - 0.02) return n > 0.55 ? '#3e6a3a' : '#577a45';
    if (ny < 0.6) return n > 0.7 && h < 0.18 ? '#4d6a3a' : granite(x, y, z);
    if (n > 0.66) return '#5d7a3e';
    if (n < 0.16) return '#8f7a4a';
    return granite(x, y, z);
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y, x, z) => (y > Y0 + 0.006 ? granite(x, y, z) : y > Y0 * 0.5 ? '#17646f' : '#3a352e'), 96, 4);
  // The pulpit: square block, sheer faces with vertical joints, flat top at plateau height, crack behind
  const PX = -0.075, PZ = 0.055, PA = Math.PI / 4, TOP = Y0 + 0.255;
  const pr = (a: number, t: number) => {
    const sq = sup(a - PA, 0.105, 0.085, 6), lip = t > 0.93 ? 1.02 : 1;
    return sq * lip * (1 + 0.025 * (vnoise(a * 5, t * 2, 3) - 0.5)) * (t < 0.15 ? 0.9 + t * 0.66 : 1);
  };
  column(gp, PX, PZ, Y0 - 0.004, TOP - Y0 + 0.004, pr, GR[0], (x, y, z, _nx, ny) => {
    if (ny > 0.7) return hash3(Math.floor(x * 220), 2, Math.floor(z * 220)) > 0.85 ? '#8d8a82' : '#a9a69c';
    const j = Math.abs(Math.sin((x - z) * 140 + Math.sin(y * 12) * 0.6));
    return j > 0.985 ? '#57544e' : y < Y0 + 0.02 ? '#4f5a48' : granite(x, y, z);
  }, 36, 18);
  {
    // Crack: dark slot cutting into the plateau behind the pulpit
    const q = grp(gp, PX + 0.055 * R2, TOP + 0.0005, PZ - 0.055 * R2, -PA);
    box(q, '#2e2c29', 0, -0.006, 0, 0.17, 0.0065, 0.006);
  }
  // Hiker trail across the slabs, hikers on the pulpit, a few at the trail
  const hikers: [number, number][] = [[-0.095, 0.055], [-0.065, 0.085], [-0.045, 0.025], [-0.115, 0.025], [-0.075, 0.005], [-0.135, 0.075], [-0.025, 0.075]];
  crowd(gp, hikers, TOP, 1.3);
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = 0.02 + t * 0.32, z = -0.06 - t * 0.22 + 0.03 * Math.sin(t * 7);
    blob(gp, '#b9a98a', x, Y0 + hf(x, z) + 0.001, z, 0.012, 0.0015, 0.008, t * 2);
    if (i % 3 === 1) person(gp, x, Y0 + hf(x, z), z, SHIRTS[i % SHIRTS.length], 1.3);
  }
  // Pines on the plateau and on the far bank; heather boulders
  for (let i = 0; i < 46; i++) {
    const x = -0.46 + hash3(i, 31, 1) * 0.92, z = -0.46 + hash3(i, 31, 2) * 0.92;
    if (Math.hypot(x, z) > 0.46) continue;
    const s = S(x, z), e = edge(U(x, z));
    if (Math.hypot(x - PX, z - PZ) < 0.14) continue;
    if (s < e - 0.06 || s > FAR + 0.04) spruce(gp, x, Y0 + hf(x, z) - 0.003, z, 0.035 + hash3(i, 31, 3) * 0.03, i % 3 ? '#2f5236' : '#3d6340');
  }
  for (let i = 0; i < 10; i++) {
    const x = -0.1 + hash3(i, 41, 1) * 0.5, z = -0.4 + hash3(i, 41, 2) * 0.5;
    if (S(x, z) > edge(U(x, z)) - 0.04 || Math.hypot(x, z) > 0.45) continue;
    chunk(gp, GR[i % 5], x, Y0 + hf(x, z), z, 0.014, 0.009, 0.012, i);
  }
  // Ferry on the fjord, far below
  {
    const q = grp(gp, -0.28, Y0 + 0.002, 0.24, -Math.PI / 4);
    prism(q, [[-0.04, -0.01], [0.03, -0.01], [0.045, 0], [0.03, 0.01], [-0.04, 0.01]], -0.003, 0.01, '#f8fafc');
    box(q, '#b91c1c', 0, 0.006, 0, 0.085, 0.003, 0.021);
    box(q, '#e2e8f0', -0.008, 0.009, 0, 0.04, 0.009, 0.016);
    box(q, '#1f2937', -0.008, 0.013, 0.0081, 0.036, 0.003, 0.001);
    blob(q, '#d4f1f2', -0.055, 0, 0, 0.02, 0.001, 0.008);
  }
  sailboat(gp, -0.12, Y0 + 0.002, 0.38, 0.9, 0.8);
};

// =========================================================================================================
// Sigiriya (Lion Rock) — a sheer orange-and-grey granite monolith rising from the jungle, its flat summit crowned by
// palace ruins and trees; the giant lion paws guard the staircase terrace, and symmetric water gardens lead in.
const ca_sigiriya: Builder = gp => {
  const RX = 0, RZ = -0.12, RA = 0.24, RB = 0.145, RH = 0.27;
  const mound = (x: number, z: number) => {
    const d = Math.hypot((x - RX) / 1.25, z - RZ);
    return 0.06 * (1 - sstep(0.14, 0.32, d));
  };
  const POOLS: [number, number, number, number][] = [];
  for (const sx of [-1, 1]) for (const [z0, z1] of [[0.14, 0.24], [0.28, 0.44]]) POOLS.push([sx * 0.045, sx * 0.21, z0, z1]);
  const inPool = (x: number, z: number) => POOLS.some(([a, b, z0, z1]) => x > Math.min(a, b) && x < Math.max(a, b) && z > z0 && z < z1);
  const hf: HFn = (x, z) => 0.012 + mound(x, z) + (inPool(x, z) ? -0.008 : 0) + 0.004 * fbm(x * 8, 0, z * 8, 2);
  field(gp, 0.5, 60, hf, '#6c9a3a', (x, y, z) => {
    if (inPool(x, z)) return WATERP('#4f7f6a')(x, y, z, 0, 1, 0);
    if (Math.abs(x) < 0.026 && z > 0.07) return hash3(Math.floor(x * 300), 2, Math.floor(z * 300)) > 0.7 ? '#d08a52' : '#c97d45';
    if (z > 0.08 && Math.abs(x) < 0.23 && z < 0.47) return frac(z * 12) < 0.06 ? '#9a6a46' : vnoise(x * 30, 0, z * 30) > 0.6 ? '#79a843' : '#88b44c';
    const n = vnoise(x * 14, 0, z * 14);
    return n > 0.6 ? '#3f7a32' : n < 0.35 ? '#5f8f38' : '#4f8636';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y) => (y > Y0 * 0.6 ? '#7a5a3a' : '#4a3628'), 96, 2);
  // Brick borders around the pools
  for (const [a, b, z0, z1] of POOLS) {
    const x0 = Math.min(a, b), x1 = Math.max(a, b), y = Y0 + 0.004;
    for (const zz of [z0, z1]) box(gp, '#9a5a3a', (x0 + x1) / 2, y, zz, x1 - x0 + 0.006, 0.01, 0.006);
    for (const xx of [x0, x1]) box(gp, '#9a5a3a', xx, y, (z0 + z1) / 2, 0.006, 0.01, z1 - z0);
  }
  // The rock: superellipse plan, slight upper bulge (overhang), domed vegetated summit, granite streaks
  const ROCK = ['#7d6e64', '#8f6a55', '#6a5d55', '#b8693a', '#94806f'];
  const base = Y0 + 0.045;
  column(gp, RX, RZ, base, RH, (a, t) => {
    const top = t > 0.88 ? Math.sqrt(Math.max(0, 1 - ((t - 0.88) / 0.12) ** 2)) * 0.22 + 0.78 : 1;
    const bulge = 1 + 0.08 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (0.6 + 0.4 * Math.sin(a)) - (t < 0.15 ? 0.06 * (1 - t / 0.15) : 0);
    return sup(a, RA, RB, 2.2) * top * bulge * (1 + 0.04 * (vnoise(a * 6, t * 3, 2) - 0.5)) * (t < 0.08 ? 1.05 : 1);
  }, ROCK[0], (x, y, z, nx, ny, nz) => {
    if (ny > 0.6) return vnoise(x * 30, 0, z * 30) > 0.5 ? '#5a8a36' : '#6f9a40';
    const a = Math.atan2(nz, nx), v = (y - base) / RH, ai = Math.round((a / (Math.PI * 2)) * 60);
    const streak = vnoise(ai * 0.55, v * 1.6, 1);
    if (v > 0.24 && v < 0.34 && Math.sin(a) > 0.2 && Math.cos(a) < -0.1) return '#e2c89a';
    if (v < 0.14 && streak > 0.4) return streak > 0.7 ? '#a8693f' : '#c4733d';
    const patch = vnoise(ai * 0.45, v * 2.6, 7);
    if (patch > 0.7) return streak > 0.5 ? '#b0744c' : '#a8653e';
    return streak > 0.66 ? '#4f4640' : streak > 0.5 ? ROCK[2] : streak < 0.28 ? ROCK[4] : ROCK[0];
  }, 60, 24, t => [0.012 * Math.sin(t * 3), -0.01 * t], false);
  // Summit: brick palace terraces, a pool, trees
  const TY = base + RH - 0.006;
  for (const [x, z, w, d] of [[-0.06, -0.14, 0.08, 0.05], [0.04, -0.1, 0.06, 0.06], [0.0, -0.18, 0.1, 0.03], [0.09, -0.16, 0.04, 0.04]] as [number, number, number, number][]) {
    for (const zz of [z - d / 2, z + d / 2]) box(gp, '#a45a3a', x, TY, zz, w, 0.008, 0.004);
    for (const xx of [x - w / 2, x + w / 2]) box(gp, '#a45a3a', xx, TY, z, 0.004, 0.008, d);
  }
  box(gp, '#4f7f8a', -0.02, TY + 0.001, -0.06, 0.04, 0.003, 0.025);
  for (const [x, z, s] of [[-0.13, -0.12, 0.05], [0.12, -0.09, 0.045], [0.09, -0.17, 0.04], [-0.08, -0.18, 0.05], [0.02, -0.05, 0.035], [-0.12, -0.07, 0.04]] as [number, number, number][]) leafy(gp, x, TY, z, s, '#4a7d34');
  // Lion terrace on the north (front) face: platform, giant paws, staircase up the face
  const LZ = RZ + RB + 0.02, LY = Y0 + 0.07;
  prism(gp, [[-0.12, LZ - 0.05], [0.12, LZ - 0.05], [0.13, LZ + 0.03], [-0.13, LZ + 0.03]], Y0 + 0.01, LY - Y0 - 0.01, '#a0603a');
  box(gp, '#b9a58a', 0, LY, LZ - 0.01, 0.24, 0.002, 0.08);
  for (const sx of [-1, 1]) {
    const x = sx * 0.04;
    rbox(gp, '#c9b49a', x, LY, LZ + 0.012, 0.035, 0.028, 0.04, 0.008);
    for (let k = 0; k < 3; k++) blob(gp, '#e7dccb', x - 0.011 + k * 0.011, LY + 0.006, LZ + 0.034, 0.0045, 0.006, 0.006);
  }
  for (let k = 0; k < 6; k++) box(gp, '#b98a62', 0, Y0 + 0.01 + k * 0.01, LZ + 0.03 + (5 - k) * 0.008, 0.035, 0.01, 0.01);
  for (let k = 0; k < 7; k++) box(gp, '#a07050', 0, LY + k * 0.007, LZ - 0.022 - k * 0.006, 0.026, 0.006, 0.008);
  {
    // Zig-zag steel stairway clinging to the face up to the summit
    const pts: V3[] = [];
    for (let k = 0; k <= 8; k++) {
      const v = k / 8, y = LY + 0.05 + v * (TY - LY - 0.09), zf = RZ + RB * (1 + 0.08 * Math.sin(v * Math.PI)) + 0.014;
      pts.push([k % 2 ? 0.05 : -0.05, y, zf]);
    }
    for (let k = 0; k < pts.length - 1; k++) rod(gp, pts[k], pts[k + 1], 0.0022, '#3f3f46', 4);
    rod(gp, [0, LY, LZ - 0.06], pts[0], 0.0022, '#3f3f46', 4);
  }
  // Ruin bases at the foot, jungle trees around the mound, visitors on the path
  for (let i = 0; i < 46; i++) {
    const a = hash3(i, 61, 1) * Math.PI * 2, d = 0.22 + hash3(i, 61, 2) * 0.25, x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 0.95 - 0.06;
    if (Math.hypot(x, z) > 0.47 || (z > 0.06 && Math.abs(x) < 0.25) || (x / 0.29) ** 2 + ((z - RZ) / 0.18) ** 2 < 1) continue;
    leafy(gp, x, Y0 + hf(x, z) - 0.002, z, 0.05 + hash3(i, 61, 3) * 0.035, ['#3e7a2f', '#4f8a36', '#2f6a2a'][i % 3]);
  }
  for (const [x, z] of [[-0.28, 0.12], [0.28, 0.12], [-0.3, 0.3], [0.3, 0.32], [-0.24, 0.42], [0.24, 0.42]] as [number, number][]) leafy(gp, x, Y0 + hf(x, z), z, 0.06, '#4a8a36');
  for (let k = 0; k < 18; k++) {
    const a = Math.PI * (0.92 + (k / 17) * 1.16) + hash3(k, 3, 3) * 0.1, x = RX + Math.cos(a) * (RA + 0.045), z = RZ + Math.sin(a) * (RB + 0.04);
    if (Math.hypot(x, z) < 0.47) leafy(gp, x, Y0 + hf(x, z) - 0.003, z, 0.06 + hash3(k, 3, 4) * 0.03, ['#3e7a2f', '#4f8a36', '#2f6a2a'][k % 3]);
  }
  crowd(gp, [[0.006, 0.2], [-0.008, 0.26], [0.01, 0.34], [-0.006, 0.4], [0.0, 0.12], [-0.01, LZ + 0.05]], (x, z) => Y0 + hf(x, z), 1.15);
  crowd(gp, [[-0.06, -0.12], [0.05, -0.15]], TY, 1.1);
};

// =========================================================================================================
// Registan — three madrasas around Samarkand's great square: Ulugh Beg (west), Sher-Dor with its tiger-and-sun
// mosaics (east) and the turquoise-domed Tilya-Kori (north); towering tiled portals, fluted domes, slender minarets.
const TILE = ['#2a5d9f', '#3fb0b5', '#c8a06a', '#efe6d2', '#1f3f78'];
/** Girih-style mosaic colour for facade coordinates (u, v), cell size c. */
const mosaic = (u: number, v: number, c: number, warm = false): string => {
  const a = Math.floor((u + v) / c), b = Math.floor((u - v) / c), k = ((a % 4) + 4 + ((b % 3) + 3)) % 5;
  return warm ? ['#c8a06a', '#2a5d9f', '#c8a06a', '#3fb0b5', '#d8b47c'][k] : TILE[k];
};
/** Even breakpoints from a to b at roughly step c. */
const steps = (a: number, b: number, c: number) => { const n = Math.max(1, Math.round((b - a) / c)), o: number[] = []; for (let i = 0; i <= n; i++) o.push(a + ((b - a) * i) / n); return o; };
/** Ribbed melon dome (column with fluted radius) on a drum, both tiled. */
function melonDome(p: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, ribs: number, c: string, drumH: number): void {
  column(p, x, z, y, drumH, () => r * 0.86, '#2a5d9f', (_px, py) => {
    const v = (py - y) / drumH;
    return v > 0.35 && v < 0.65 ? (frac(Math.atan2(_px - x, 1) * 6) < 0.3 ? '#efe6d2' : '#1f3f78') : v > 0.9 ? '#c8a06a' : '#2a5d9f';
  }, 18, 3);
  column(p, x, z, y + drumH, h, (a, t) => {
    const prof = t < 0.25 ? 0.86 + 0.6 * t : Math.sqrt(Math.max(0, 1 - ((t - 0.25) / 0.75) ** 2)) * (1.01 - 0.0 * t);
    return r * Math.max(0.02, prof) * (1 + 0.06 * Math.abs(Math.cos((a * ribs) / 2)));
  }, c, (px, _py, pz) => (Math.abs(Math.cos((Math.atan2(pz - z, px - x) * ribs) / 2)) > 0.85 ? shade(c, 1.12) : shade(c, 0.94)), ribs * 2, 9, undefined, false);
  cyl(p, '#c8a06a', x, y + drumH + h - 0.002, z, 0.0025, 0.012, 5);
  blob(p, '#d6a640', x, y + drumH + h + 0.012, z, 0.003);
}
function minaret(p: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, cap: 'flat' | 'dome'): void {
  column(p, x, z, y, h, (_a, t) => r * (1 - 0.18 * t), '#c8a06a', (px, py, pz) => {
    const a = Math.atan2(pz - z, px - x), v = (py - y) / h;
    if (v < 0.06) return '#b08a58';
    if (frac(v * 8) < 0.1) return '#2a5d9f';
    return frac(a / Math.PI * 3 + v * 22) < 0.35 ? '#2a5d9f' : frac(a / Math.PI * 3 - v * 22) < 0.25 ? '#3fb0b5' : '#c8a06a';
  }, 12, 16);
  lathe(p, [[r * 0.8, 0], [r * 1.25, 0.02], [r * 1.25, 0.03], [r * 0.9, 0.032], [0, 0.032]], '#cfae78', x, y + h, z, 12);
  if (cap === 'dome') { lathe(p, [[r * 0.75, 0], [r * 0.7, r * 0.6], [r * 0.35, r * 1.2], [0, r * 1.35]], '#3fb0b5', x, y + h + 0.032, z, 12); }
}
interface MadOpts { W: number; D: number; H: number; PW: number; PH: number; tiger?: boolean; mins?: boolean; towers?: boolean }
/** Madrasa in a local group facing +z: two-storey niche facade, central pishtaq with a pointed iwan, mosaic panels. */
function madrasa(q: THREE.Object3D, o: MadOpts): void {
  const { W, D, H, PW, PH } = o, BR = '#c8a06a', NICHE = '#2b3446';
  box(q, BR, 0, 0, -D / 2, W, H, D);
  box(q, '#b8925e', 0, H, -D / 2, W - 0.004, 0.004, D - 0.004);
  // Arcade facade sheets: front, sides, back
  const vs = [0, 0.008, 0.012, 0.038, 0.046, 0.052, 0.056, 0.082, 0.088, H - 0.008, H];
  const arcade = (u: number, v: number, bay: number) => {
    const f = frac(u / bay);
    if (v < 0.008) return '#b08a58';
    if (v > H - 0.008 || (v > 0.046 && v < 0.052)) return '#2a5d9f';
    const lo = v > 0.012 && v < 0.046, hi = v > 0.056 && v < 0.088;
    if ((lo || hi) && f > 0.22 && f < 0.78) {
      const top = lo ? 0.038 : 0.082;
      return v < top || (f > 0.36 && f < 0.64) ? NICHE : '#3fb0b5';
    }
    return mosaic(u, v, 0.012, true);
  };
  const sheet = (len: number, px: number, pz: number, ry: number, skip = 0) => {
    const us: number[] = [], bay = len / Math.max(1, Math.round(len / 0.03));
    for (let u = 0; u < len - 1e-6; u += bay) for (const f of [0, 0.22, 0.36, 0.64, 0.78]) us.push(-len / 2 + u + f * bay);
    us.push(len / 2);
    wallGrid(q, px, 0, pz, ry, us, vs, (u, v) => (Math.abs(u) < skip ? '#c8a06a' : arcade(u + len / 2, v, bay)));
  };
  const e = 0.0006;
  sheet(W, 0, e, 0, PW / 2);
  sheet(D, W / 2 + e, -D / 2, Math.PI / 2); sheet(D, -W / 2 - e, -D / 2, -Math.PI / 2); sheet(W, 0, -D - e, Math.PI);
  // Pishtaq: projecting portal with a pointed iwan, mosaic frame, spandrels, inscription band
  const PD = 0.034, AW = PW * 0.56, AH = PH * 0.7;
  panel(q, PW, PH, PD, BR, [archPath(0, 0, AW, AH, true)], 0, 0, 0.012 - PD / 2 + PD / 2);
  box(q, '#3a5f8f', 0, 0, -PD / 2 - 0.004, AW + 0.004, AH, 0.006);
  {
    const us = steps(-AW / 2, AW / 2, 0.006), vsI = steps(0, AH, 0.008);
    wallGrid(q, 0, 0, -PD / 2 + 0.0002, 0, us, vsI, (u, v) => (v < AH * 0.36 ? (Math.abs(u) < AW * 0.16 ? '#3b2a1e' : mosaic(u, v, 0.01)) : v < AH * 0.42 ? '#efe6d2' : (Math.abs(u) / (AW / 2)) ** 1.6 + ((v - AH * 0.42) / (AH * 0.58)) * 0.85 > 0.95 ? '#2a5d9f' : (frac(v * 70) < 0.5 ? '#3fb0b5' : '#efe6d2')));
  }
  const FZ = 0.012 + PD / 2 + 0.0006;
  const piers = (x0: number, x1: number, v0: number, v1: number) => wallGrid(q, 0, 0, FZ, 0, steps(x0, x1, 0.006), steps(v0, v1, 0.008), (u, v) => mosaic(u, v, 0.012));
  piers(-PW / 2, -AW / 2 - 0.006, 0, PH); piers(AW / 2 + 0.006, PW / 2, 0, PH); piers(-AW / 2 - 0.006, AW / 2 + 0.006, AH + 0.004, PH);
  for (const s of [-1, 1]) {
    box(q, '#3fb0b5', s * (AW / 2 + 0.003), 0, FZ, 0.006, AH, 0.003);
    box(q, '#efe6d2', s * (PW / 2 - 0.003), 0, FZ + 0.0008, 0.005, PH, 0.003);
  }
  box(q, '#efe6d2', 0, PH - 0.016, FZ + 0.0008, PW, 0.01, 0.003);
  box(q, '#3fb0b5', 0, AH + 0.001, FZ, AW + 0.012, 0.005, 0.003);
  if (o.tiger) {
    // Sher-Dor: tigers chasing deer beneath a rising human-faced sun in each spandrel
    for (const s of [-1, 1]) {
      const sx = s * AW * 0.34, sy = AH * 0.86;
      blob(q, '#f59e0b', sx, sy, FZ + 0.002, 0.011, 0.005, 0.002);
      for (const k of [-1, 1]) box(q, '#1f2937', sx + k * 0.004, sy - 0.004, FZ + 0.0035, 0.0015, 0.008, 0.001);
      blob(q, '#f8fafc', sx - s * 0.012, sy - 0.002, FZ + 0.002, 0.005, 0.004, 0.002);
      add(q, CYL(12), mat('#facc15'), sx + s * 0.006, sy + 0.012, FZ + 0.0025, 0.012, 0.002, 0.012, 0, Math.PI / 2);
      blob(q, '#fde68a', sx + s * 0.006, sy + 0.012, FZ + 0.004, 0.0035, 0.0035, 0.001);
    }
  }
  box(q, BR, 0, PH, 0.012, PW + 0.004, 0.006, PD);
  if (o.mins) for (const s of [-1, 1]) minaret(q, s * (W / 2 - 0.004), 0, 0.006, 0.017, H + 0.2, 'flat');
  if (o.towers) for (const s of [-1, 1]) minaret(q, s * (W / 2 - 0.006), 0, -0.002, 0.012, H + 0.05, 'dome');
  for (const s of [-1, 1]) minaret(q, s * (PW / 2 + 0.002), 0, 0.012 + PD / 2, 0.006, PH + 0.012, 'dome');
}
const ca_registan: Builder = g0 => {
  const gp = grp(g0, 0, 0, 0, -0.6);
  const hf: HFn = (x, z) => (Math.abs(x) < 0.17 && z > -0.12 && z < 0.2 ? -0.004 : 0) + (z > 0.3 ? 0.002 : 0);
  field(gp, 0.5, 50, hf, '#d8c7a8', (x, _y, z) => {
    if (z > 0.3) return Math.hypot(x, z - 0.4) < 0.045 ? '#5fb3c8' : frac(x * 18) < 0.1 || frac(z * 18) < 0.1 ? '#b9a689' : '#cdb894';
    if (Math.abs(x) < 0.17 && z > -0.12 && z < 0.2) return Math.abs(x) < 0.018 || (frac(x * 12) < 0.06 && frac(z * 12) < 0.06) ? '#efe6d2' : frac((x + z) * 10) < 0.5 ? '#d4b79a' : '#cfb08f';
    return frac(x * 22) < 0.07 || frac(z * 22) < 0.07 ? '#c8b493' : '#ddcdb0';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y) => (y > Y0 * 0.5 ? '#c8b493' : '#8a7458'), 96, 2);
  madrasa(grp(gp, -0.26, Y0, 0, Math.PI / 2), { W: 0.34, D: 0.17, H: 0.1, PW: 0.13, PH: 0.21, mins: true });
  madrasa(grp(gp, 0.26, Y0, 0, -Math.PI / 2), { W: 0.34, D: 0.17, H: 0.1, PW: 0.13, PH: 0.21, mins: true, tiger: true });
  madrasa(grp(gp, 0, Y0, -0.26, 0), { W: 0.36, D: 0.17, H: 0.09, PW: 0.12, PH: 0.17, towers: true });
  // Domes: Sher-Dor's twin fluted domes, Tilya-Kori's great turquoise dome, Ulugh Beg's small ochre dome
  for (const s of [-1, 1]) melonDome(gp, 0.33, Y0 + 0.1, s * 0.11, 0.04, 0.07, 14, '#2fa3a8', 0.04);
  melonDome(gp, -0.1, Y0 + 0.09, -0.34, 0.055, 0.075, 16, '#38b2b0', 0.05);
  lathe(gp, [[0.04, 0], [0.038, 0.02], [0.028, 0.04], [0.012, 0.052], [0, 0.055]], '#c9a46a', -0.35, Y0 + 0.1, -0.1, 14);
  // Sunken square kerbs, fountain, trees, visitors
  for (const [x, z, w, d] of [[0, -0.12, 0.34, 0.006], [0, 0.2, 0.34, 0.006], [-0.17, 0.04, 0.006, 0.32], [0.17, 0.04, 0.006, 0.32]] as [number, number, number, number][]) box(gp, '#b9a689', x, Y0 - 0.004, z, w, 0.006, d);
  lathe(gp, [[0, 0], [0.05, 0], [0.05, 0.012], [0.043, 0.012], [0.043, 0.004], [0, 0.004]], '#c8b493', 0, Y0 + 0.002, 0.4, 20);
  for (const [x, z] of [[-0.2, 0.26], [0.2, 0.26], [-0.12, 0.3], [0.12, 0.3], [-0.38, 0.24], [0.38, 0.24], [-0.22, -0.2], [0.22, -0.2]] as [number, number][]) leafy(gp, x, Y0, z, 0.05, '#4e8a3a');
  crowd(gp, [[0.0, 0.1], [0.03, 0.05], [-0.05, 0.14], [0.08, -0.02], [-0.09, 0.0], [0.1, 0.16], [-0.03, -0.06], [0.05, 0.26], [-0.08, 0.3]], (x, z) => Y0 + hf(x, z), 1.3);
};

// =========================================================================================================
// Dubrovnik — the walled "Pearl of the Adriatic": limestone walls girdling a promontory of terracotta roofs, the
// round Minčeta tower, Bokar and St John fortresses, Lovrijenac on its own sea rock, the Stradun and the bell tower.
const ca_dubrovnik: Builder = gp => {
  const bump = (t: number) => (Math.abs(t) < 1 ? (1 - Math.abs(t) ** 4) ** 0.25 : 0);
  const edge = (x: number) => -0.14 + 0.35 * bump((x + 0.04) / 0.3) + 0.008 * Math.sin(x * 40);
  const WB = -0.16;
  const LX = -0.41, LZ = 0.08;
  const hf: HFn = (x, z) => {
    const e = edge(x), hill = 0.24 * sstep(-0.22, -0.5, z) * (0.8 + 0.4 * vnoise(x * 6, 0, z * 6));
    const lov = 0.07 * (1 - sstep(0.03, 0.075, Math.hypot(x - LX, z - LZ)));
    if (z < e) return Math.max(0.03 * sstep(0, 0.02, e - z) + hill, lov);
    return Math.max(lov, 0.004 * sstep(0.02, 0, z - e));
  };
  const SEA = '#1f6fa6';
  field(gp, 0.5, 70, hf, SEA, (x, y, z, _nx, ny) => {
    const h = y - Y0, e = edge(x);
    if (h < 0.005) {
      const f = z - e;
      if (f < 0.02 && f > -0.01) return hash3(Math.floor(x * 120), 2, Math.floor(z * 120)) > 0.4 ? '#e8f4f8' : '#9fd0e0';
      return WATERP(mix('#2a8ac0', '#1b5e8f', sstep(0.05, 0.3, f)))(x, y, z, 0, 1, 0);
    }
    if (Math.hypot(x - LX, z - LZ) < 0.08 || ny < 0.6) return hash3(Math.floor(x * 90), Math.floor(y * 90), Math.floor(z * 90)) > 0.5 ? '#b9ad94' : '#a39880';
    if (z < -0.2) { const n = vnoise(x * 12, 1, z * 12); return n > 0.6 ? '#4f6b3a' : n < 0.3 ? '#9a9884' : '#6f7d4f'; }
    return '#cfc4ae';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y) => (y > Y0 + 0.008 ? '#a39880' : y > Y0 * 0.5 ? '#1b5e8f' : '#4a3a2c'), 96, 3);
  const ST = '#e6dcc8', ST2 = '#d4c8b0';
  const town = (x: number, z: number) => z < edge(x) - 0.03 && z > WB + 0.015 && x > -0.33 && x < 0.24;
  // Walls: seaward curve then the landward line, walkway parapet and merlons
  const wall: [number, number][] = [];
  for (let x = -0.33; x <= 0.245; x += 0.025) wall.push([x, Math.max(WB, edge(x) - 0.014)]);
  wall.push([0.245, WB]); wall.push([-0.33, WB]);
  const TY = Y0 + 0.03;
  for (let i = 0; i < wall.length; i++) {
    const [ax, az] = wall[i], [bx, bz] = wall[(i + 1) % wall.length], len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const ry = -Math.atan2(bz - az, bx - ax), land = i >= wall.length - 2, h = land ? 0.07 : 0.085, y = land ? TY : Y0 + 0.004;
    box(gp, ST, (ax + bx) / 2, y, (az + bz) / 2, len + 0.012, h, 0.016, ry);
    box(gp, ST2, (ax + bx) / 2, y + h, (az + bz) / 2, len + 0.012, 0.004, 0.02, ry);
    const n = Math.max(1, Math.round(len / 0.016));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; box(gp, ST, ax + (bx - ax) * t, y + h + 0.004, az + (bz - az) * t, 0.007, 0.008, 0.004, ry); }
  }
  // Towers and fortresses
  const roundTower = (x: number, z: number, r: number, h: number, y = TY) => {
    lathe(gp, [[r * 1.12, 0], [r, h * 0.35], [r, h], [r * 1.08, h], [r * 1.08, h + 0.006], [0, h + 0.006]], ST, x, y, z, 18);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; box(gp, ST, x + Math.cos(a) * r * 1.02, y + h + 0.006, z + Math.sin(a) * r * 1.02, 0.008, 0.009, 0.005, -a + Math.PI / 2); }
  };
  roundTower(-0.22, WB - 0.01, 0.04, 0.13);
  cyl(gp, ST, -0.22, TY + 0.136, WB - 0.01, 0.022, 0.03, 12);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; box(gp, ST, -0.22 + Math.cos(a) * 0.021, TY + 0.166, WB - 0.01 + Math.sin(a) * 0.021, 0.006, 0.008, 0.004, -a + Math.PI / 2); }
  roundTower(-0.33, 0.04, 0.03, 0.08, Y0 + 0.004);
  roundTower(0.24, 0.0, 0.045, 0.085, Y0 + 0.004);
  box(gp, ST, 0.21, TY - 0.004, WB - 0.02, 0.07, 0.085, 0.05);
  // Lovrijenac on its rock
  {
    const ly = Y0 + 0.07, plan: [number, number][] = [[LX - 0.045, LZ - 0.035], [LX + 0.04, LZ - 0.04], [LX + 0.05, LZ + 0.02], [LX, LZ + 0.05], [LX - 0.05, LZ + 0.025]];
    prism(gp, plan, ly - 0.01, 0.07, ST);
    prism(gp, plan.map(([x, z]) => [LX + (x - LX) * 1.04, LZ + (z - LZ) * 1.04] as [number, number]), ly + 0.058, 0.006, ST2);
    for (const [x, z] of plan) box(gp, ST, x, ly + 0.064, z, 0.008, 0.008, 0.008);
    rod(gp, [LX, ly + 0.064, LZ], [LX, ly + 0.11, LZ], 0.001, '#6b7280', 4);
    box(gp, '#c8102e', LX + 0.01, ly + 0.098, LZ, 0.02, 0.006, 0.001);
    box(gp, '#f8fafc', LX + 0.01, ly + 0.092, LZ, 0.02, 0.006, 0.0011);
    box(gp, '#1e40af', LX + 0.01, ly + 0.086, LZ, 0.02, 0.006, 0.0012);
  }
  // Houses: tight grid of limestone houses with terracotta hip roofs; the Stradun runs east-west down the middle
  const ROOFS = ['#d4562f', '#c94a28', '#e0703f', '#b9452a', '#d9663a'];
  const WALLS = ['#efe6d6', '#e8dcc4', '#f3ece0', '#e2d3b6'];
  for (let x = -0.3; x < 0.22; x += 0.034) for (let z = WB + 0.03; z < 0.22; z += 0.03) {
    const jx = x + (hash3(x * 50, z * 50, 1) - 0.5) * 0.006, jz = z + (hash3(x * 50, z * 50, 2) - 0.5) * 0.006;
    if (!town(jx, jz) || Math.abs(jz - 0.0) < 0.016 || Math.hypot(jx - 0.15, jz - 0.08) < 0.04 || Math.hypot(jx - 0.17, jz + 0.03) < 0.02) continue;
    const w = 0.026 + hash3(x * 50, z * 50, 3) * 0.006, d = 0.022 + hash3(x * 50, z * 50, 4) * 0.004, h = 0.03 + hash3(x * 50, z * 50, 5) * 0.025;
    const c = WALLS[Math.floor(hash3(x * 50, z * 50, 6) * 4)], y = TY - 0.004;
    box(gp, c, jx, y, jz, w, h, d);
    tbx(gp, w + 0.004, d + 0.004, w * 0.5, 0.002, 0.014, ROOFS[Math.floor(hash3(x * 50, z * 50, 7) * 5)], jx, y + h, jz);
    box(gp, '#3f4a5a', jx, y + h * 0.55, jz + d / 2 + 0.0006, w * 0.5, 0.005, 0.001);
  }
  box(gp, '#f1ebdf', -0.04, TY - 0.003, 0.0, 0.54, 0.003, 0.026);
  // Bell tower, cathedral dome, Franciscan belfry
  box(gp, ST, 0.17, TY - 0.004, -0.03, 0.02, 0.1, 0.02);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) box(gp, '#3f3a34', 0.17 + nx * 0.0101, TY + 0.07, -0.03 + nz * 0.0101, nz ? 0.008 : 0.001, 0.014, nx ? 0.008 : 0.001);
  lathe(gp, [[0.012, 0], [0.011, 0.01], [0.006, 0.02], [0, 0.026]], '#6e8f6f', 0.17, TY + 0.096, -0.03, 10);
  box(gp, ST, 0.15, TY - 0.004, 0.08, 0.06, 0.05, 0.04);
  gab(gp, 0.06, 0.016, 0.042, '#d4562f', 0.15, TY + 0.046, 0.08);
  cyl(gp, ST, 0.15, TY + 0.046, 0.08, 0.016, 0.016, 12);
  lathe(gp, [[0.017, 0], [0.016, 0.01], [0.01, 0.02], [0, 0.024]], '#9aa59a', 0.15, TY + 0.062, 0.08, 12);
  box(gp, ST, -0.27, TY - 0.004, -0.03, 0.016, 0.075, 0.016);
  cone(gp, '#8a8f88', -0.27, TY + 0.071, -0.03, 0.012, 0.03, 8);
  // Harbour: breakwater, boats; the hill behind with cypresses and villas
  box(gp, ST2, 0.33, Y0, -0.06, 0.12, 0.012, 0.018, 0.4);
  for (const [x, z, r, c] of [[0.3, 0.06, 0.4, '#f8fafc'], [0.36, -0.02, -0.3, '#fde68a'], [0.42, 0.1, 1.1, '#f8fafc']] as [number, number, number, string][]) sailboat(gp, x, Y0 + 0.003, z, r, 0.9, c);
  for (let i = 0; i < 30; i++) {
    const x = -0.45 + hash3(i, 81, 1) * 0.9, z = -0.22 - hash3(i, 81, 2) * 0.26;
    if (Math.hypot(x, z) > 0.47) continue;
    const y = Y0 + hf(x, z);
    if (i % 3 === 0) { box(gp, '#f3ece0', x, y - 0.003, z, 0.02, 0.016, 0.016); tbx(gp, 0.023, 0.019, 0.01, 0.002, 0.009, '#d4562f', x, y + 0.013, z); }
    else if (i % 3 === 1) { cyl(gp, '#4a3a2a', x, y - 0.002, z, 0.0025, 0.01, 4); cone(gp, '#2f5a32', x, y + 0.006, z, 0.008, 0.045, 6); }
    else bush(gp, x, y - 0.002, z, 0.022, '#557a3a');
  }
  for (let i = 0; i < 16; i++) {
    const x = -0.36 + i * 0.04, z = edge(x) + 0.004;
    if (x > 0.25 || x < -0.35) continue;
    chunk(gp, i % 2 ? '#b9ad94' : '#a39880', x, Y0 - 0.004, z, 0.022, 0.024, 0.016, i);
  }
  crowd(gp, [[-0.2, 0.0], [-0.12, 0.004], [-0.02, -0.004], [0.06, 0.003], [0.1, -0.003]], TY - 0.001, 1.1);
  crowd(gp, [[-0.06, edge(-0.06) - 0.014], [0.04, edge(0.04) - 0.014], [-0.16, edge(-0.16) - 0.014]], Y0 + 0.093, 1.1);
};

// =========================================================================================================
// Santa Claus Village — on the Arctic Circle at Rovaniemi: the log Santa's Office with its tall glowing pyramid
// spire, snowy cabins strung with lights, the painted Arctic Circle line, reindeer and sleigh, and Santa himself.
/** Many small glowing bulbs merged into one emissive mesh (emissive meshes are not baked, so keep them together). */
function bulbs(p: THREE.Object3D, pts: V3[], c: string, r = 0.003): void {
  if (!pts.length) return;
  const base = new THREE.OctahedronGeometry(r, 0), bp = base.getAttribute('position');
  const pos = new Float32Array(pts.length * bp.count * 3);
  pts.forEach(([x, y, z], i) => { for (let k = 0; k < bp.count; k++) { const o = (i * bp.count + k) * 3; pos[o] = bp.getX(k) + x; pos[o + 1] = bp.getY(k) + y; pos[o + 2] = bp.getZ(k) + z; } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  add(p, geo, mat(c, { emissive: c }), 0, 0, 0, 1, 1, 1);
}
function reindeer(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s = 1): void {
  const q = grp(p, x, y, z, ry), C = '#7a5536';
  blob(q, C, 0, 0.03 * s, 0, 0.022 * s, 0.012 * s, 0.01 * s);
  blob(q, '#efe6d6', -0.004 * s, 0.026 * s, 0, 0.012 * s, 0.008 * s, 0.009 * s);
  rod(q, [0.016 * s, 0.034 * s, 0], [0.026 * s, 0.05 * s, 0], 0.005 * s, C, 5);
  blob(q, C, 0.032 * s, 0.052 * s, 0, 0.008 * s, 0.0055 * s, 0.005 * s);
  blob(q, '#1f2937', 0.04 * s, 0.05 * s, 0, 0.002 * s);
  for (const k of [-1, 1]) {
    rod(q, [0.026 * s, 0.056 * s, k * 0.003 * s], [0.022 * s, 0.075 * s, k * 0.012 * s], 0.0012 * s, '#d6c3a0', 3);
    rod(q, [0.024 * s, 0.066 * s, k * 0.007 * s], [0.032 * s, 0.074 * s, k * 0.01 * s], 0.001 * s, '#d6c3a0', 3);
    rod(q, [0.02 * s, 0.07 * s, k * 0.01 * s], [0.012 * s, 0.078 * s, k * 0.014 * s], 0.001 * s, '#d6c3a0', 3);
  }
  for (const [lx, lz] of [[-0.014, -0.005], [-0.014, 0.005], [0.014, -0.005], [0.014, 0.005]]) rod(q, [lx * s, 0.026 * s, lz * s], [lx * s, 0, lz * s], 0.0022 * s, '#5a3e28', 4);
}
const ca_santa: Builder = gp => {
  const hf: HFn = (x, z) => 0.008 + 0.01 * vnoise(x * 6, 0, z * 6) + (Math.hypot(x, z + 0.05) > 0.4 ? 0.01 * sstep(0.4, 0.5, Math.hypot(x, z + 0.05)) : 0);
  const LINE = 0.2;
  field(gp, 0.5, 48, hf, '#f4f7fb', (x, _y, z) => {
    if (Math.abs(z - LINE) < 0.008) return frac(x * 25) < 0.5 ? '#1e3a8a' : '#f8fafc';
    if (Math.abs(x) < 0.05 && z > 0.05) return '#d9e2ec';
    return vnoise(x * 20, 0, z * 20) > 0.65 ? '#e3eaf3' : null;
  });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y) => (y > Y0 * 0.6 ? '#e8eef5' : '#7a8794'), 96, 2);
  const G = Y0 + 0.008, LOG = '#5b3a24', LOG2 = '#4a2e1c', SNOW = '#f6f9fc', WARM = '#fbbf24';
  const glow: V3[] = [];
  // Santa's Office: octagonal log hall, wide snowy eave, tall glowing pyramid spire
  const CX = 0, CZ = -0.12;
  column(gp, CX, CZ, G - 0.004, 0.1, () => 0.1, LOG, (_x, y) => (frac(y * 160) < 0.25 ? LOG2 : null), 8, 10);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, q = grp(gp, CX + Math.cos(a) * 0.093, G, CZ + Math.sin(a) * 0.093, faceRy(Math.cos(a), Math.sin(a)));
    box(q, '#fde68a', 0, 0.035, 0.001, 0.034, 0.03, 0.002).material = mat('#fcd34d', { emissive: '#f59e0b' });
    box(q, LOG2, 0, 0.049, 0.0025, 0.002, 0.03, 0.002);
    box(q, LOG2, 0, 0.034, 0.0025, 0.036, 0.003, 0.003);
  }
  lathe(gp, [[0, 0], [0.13, 0], [0.135, 0.008], [0.11, 0.03], [0.055, 0.06], [0, 0.06]], SNOW, CX, G + 0.1, CZ, 8);
  lathe(gp, [[0.06, 0], [0.058, 0.05], [0.03, 0.16], [0.006, 0.23], [0, 0.24]], '#e9a23b', CX, G + 0.13, CZ, 8);
  lathe(gp, [[0.075, 0], [0.065, 0.03], [0.055, 0.04], [0, 0.04]], SNOW, CX, G + 0.125, CZ, 8);
  blob(gp, '#facc15', CX, G + 0.375, CZ, 0.006);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; glow.push([CX + Math.cos(a) * 0.132, G + 0.105, CZ + Math.sin(a) * 0.132]); }
  for (let k = 0; k < 10; k++) { const t = k / 10; glow.push([CX + 0.06 * (1 - t * 0.9) * Math.cos(1.2), G + 0.13 + t * 0.22, CZ + 0.06 * (1 - t * 0.9) * Math.sin(1.2)]); glow.push([CX + 0.06 * (1 - t * 0.9) * Math.cos(1.95), G + 0.13 + t * 0.22, CZ + 0.06 * (1 - t * 0.9) * Math.sin(1.95)]); }
  // Log cabins (shops, post office) with snowy gable roofs and string lights
  const cabin = (x: number, z: number, w: number, d: number, ry: number) => {
    const q = grp(gp, x, G, z, ry);
    box(q, LOG, 0, 0, 0, w, 0.05, d);
    for (let k = 1; k < 6; k++) box(q, LOG2, 0, k * 0.0085, d / 2 + 0.0004, w, 0.0016, 0.001);
    gab(q, w + 0.016, 0.035, d + 0.02, SNOW, 0, 0.05, 0);
    box(q, '#fcd34d', -w * 0.25, 0.02, d / 2 + 0.001, 0.016, 0.014, 0.002).material = mat('#fcd34d', { emissive: '#f59e0b' });
    box(q, '#3b2416', w * 0.2, 0, d / 2 + 0.001, 0.014, 0.03, 0.002);
    const wp = new THREE.Vector3();
    for (let k = 0; k <= 8; k++) { wp.set(-w / 2 - 0.008 + ((w + 0.016) * k) / 8, 0.049, d / 2 + 0.011).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); glow.push([x + wp.x, G + wp.y, z + wp.z]); }
  };
  cabin(-0.25, -0.02, 0.15, 0.08, 0.35);
  cabin(0.26, -0.03, 0.14, 0.08, -0.35);
  cabin(-0.2, -0.3, 0.12, 0.07, 0.6);
  // Arctic Circle marker: lamp line and signpost
  for (let x = -0.4; x <= 0.41; x += 0.1) {
    if (Math.abs(x) < 0.05) continue;
    const y = Y0 + hf(x, LINE);
    cyl(gp, '#1f2937', x, y - 0.002, LINE, 0.0025, 0.05, 6);
    glow.push([x, y + 0.052, LINE]);
  }
  {
    const x = 0.08, z = LINE - 0.02, y = Y0 + hf(x, z);
    cyl(gp, '#5b3a24', x, y - 0.002, z, 0.004, 0.09, 6);
    for (const [yy, r, c] of [[0.078, 0.4, '#1e3a8a'], [0.064, -0.6, '#b91c1c'], [0.05, 2.2, '#166534']] as [number, number, string][]) {
      const q = grp(gp, x, y + yy, z, r);
      box(q, c, 0.022, 0, 0, 0.04, 0.01, 0.003);
      box(q, '#f8fafc', 0.022, 0.0035, 0.0018, 0.03, 0.0015, 0.0005);
    }
    box(gp, SNOW, x, y + 0.088, z, 0.012, 0.004, 0.012);
  }
  // Snowy spruces with fairy lights
  for (let i = 0; i < 26; i++) {
    const a = hash3(i, 91, 1) * Math.PI * 2, d = 0.3 + hash3(i, 91, 2) * 0.17, x = Math.cos(a) * d, z = Math.sin(a) * d - 0.04;
    if (Math.hypot(x, z) > 0.47 || (z > 0.12 && Math.abs(x) < 0.3) || Math.abs(z - LINE) < 0.04) continue;
    const s = 0.06 + hash3(i, 91, 3) * 0.05, y = Y0 + hf(x, z) - 0.003;
    spruce(gp, x, y, z, s, '#2f5236', true);
    if (i % 3 === 0) for (let k = 0; k < 6; k++) { const b = k * 2.1 + i, t = 0.25 + (k / 6) * 0.6; glow.push([x + Math.cos(b) * s * 0.3 * (1 - t), y + s * (0.15 + t * 0.75), z + Math.sin(b) * s * 0.3 * (1 - t)]); }
  }
  // Sleigh with two reindeer, Santa at the door, snowman, lamp posts, visitors
  {
    const q = grp(gp, -0.2, Y0 + hf(-0.2, 0.32), 0.32, -0.25);
    for (const k of [-1, 1]) rod(q, [-0.04, 0.002, k * 0.015], [0.05, 0.002, k * 0.015], 0.002, '#d6a640', 4);
    for (const k of [-1, 1]) rod(q, [0.05, 0.002, k * 0.015], [0.058, 0.014, k * 0.015], 0.002, '#d6a640', 4);
    rbox(q, '#b91c1c', 0, 0.006, 0, 0.07, 0.024, 0.036, 0.006);
    rbox(q, '#b91c1c', -0.028, 0.006, 0, 0.018, 0.042, 0.036, 0.006);
    box(q, '#d6a640', 0, 0.029, 0.0185, 0.07, 0.003, 0.002);
    box(q, '#7c2d12', 0.005, 0.03, 0, 0.03, 0.004, 0.03);
    reindeer(q, 0.11, 0, -0.016, 0, 0.9);
    reindeer(q, 0.11, 0, 0.016, 0, 0.9);
    rod(q, [0.06, 0.012, 0], [0.095, 0.026, 0], 0.0012, '#7c2d12', 3);
  }
  {
    const x = 0.04, z = CZ + 0.12, y = G;
    cyl(gp, '#b91c1c', x, y, z, 0.011, 0.03, 10);
    blob(gp, '#f8fafc', x, y + 0.006, z, 0.012, 0.004, 0.012);
    blob(gp, '#b91c1c', x, y + 0.034, z, 0.01, 0.009, 0.009);
    blob(gp, '#f1c9a5', x, y + 0.046, z + 0.002, 0.006);
    blob(gp, '#f8fafc', x, y + 0.04, z + 0.006, 0.006, 0.007, 0.004);
    cone(gp, '#b91c1c', x, y + 0.05, z, 0.006, 0.014, 8);
    blob(gp, '#f8fafc', x, y + 0.065, z, 0.0025);
    box(gp, '#1f2937', x, y + 0.022, z, 0.023, 0.003, 0.023);
  }
  for (const [x, z] of [[0.22, 0.3]] as [number, number][]) {
    const y = Y0 + hf(x, z);
    blob(gp, SNOW, x, y + 0.012, z, 0.016); blob(gp, SNOW, x, y + 0.034, z, 0.011); blob(gp, SNOW, x, y + 0.05, z, 0.008);
    cone(gp, '#f97316', x, y + 0.05, z + 0.012, 0.0018, 0.008, 5);
    cyl(gp, '#1f2937', x, y + 0.057, z, 0.006, 0.008, 8);
    box(gp, '#dc2626', x, y + 0.042, z, 0.02, 0.003, 0.02);
  }
  for (const [x, z] of [[-0.07, 0.1], [0.07, 0.1], [-0.07, 0.3], [0.07, 0.3]] as [number, number][]) {
    const y = Y0 + hf(x, z);
    cyl(gp, '#1f2937', x, y - 0.002, z, 0.0022, 0.06, 6);
    box(gp, '#1f2937', x, y + 0.058, z, 0.012, 0.016, 0.012);
    box(gp, '#fcd34d', x, y + 0.06, z, 0.009, 0.012, 0.0125).material = mat('#fcd34d', { emissive: '#f59e0b' });
  }
  crowd(gp, [[-0.03, 0.12], [0.02, 0.17], [-0.02, 0.24], [0.13, 0.22], [-0.12, 0.2], [0.04, 0.36], [-0.1, 0.06], [0.16, 0.08]], (x, z) => Y0 + hf(x, z), 1.3);
  bulbs(gp, glow, WARM, 0.0035);
};

// =========================================================================================================
// Chocolate Hills — hundreds of near-identical grassy domes on Bohol, turned chocolate-brown in the dry season,
// rising from green rice paddies and coconut palms; a viewing deck with a long stair crowns the tallest hill.
function palm(p: THREE.Object3D, x: number, y: number, z: number, s: number, lean: number): void {
  const tx = x + Math.cos(lean) * s * 0.18, tz = z + Math.sin(lean) * s * 0.18, ty = y + s;
  rod(p, [x, y, z], [(x + tx) / 2 + Math.cos(lean) * s * 0.02, y + s * 0.5, (z + tz) / 2], s * 0.035, '#8a6a48', 5);
  rod(p, [(x + tx) / 2 + Math.cos(lean) * s * 0.02, y + s * 0.5, (z + tz) / 2], [tx, ty, tz], s * 0.03, '#8a6a48', 5);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + lean;
    rod(p, [tx, ty, tz], [tx + Math.cos(a) * s * 0.38, ty - s * 0.12, tz + Math.sin(a) * s * 0.38], s * 0.03, k % 2 ? '#3f8a33' : '#4f9a3a', 3);
  }
  blob(p, '#6b4f2a', tx, ty - s * 0.03, tz, s * 0.05);
}
const ca_chocolate: Builder = gp => {
  const hills: [number, number, number, number][] = [];
  const MX = 0.0, MZ = -0.06, MR = 0.085, MH = 0.13;
  hills.push([MX, MZ, MR, MH]);
  for (let i = 0; i < 260 && hills.length < 40; i++) {
    const x = -0.44 + hash3(i, 71, 1) * 0.88, z = -0.46 + hash3(i, 71, 2) * 0.72, r = 0.042 + hash3(i, 71, 3) * 0.034;
    if (Math.hypot(x, z) > 0.47 - r || hills.some(([hx, hz, hr]) => Math.hypot(x - hx, z - hz) < (r + hr) * 0.92) || (z > 0.08 && Math.abs(x) < 0.3)) continue;
    hills.push([x, z, r, r * (0.95 + hash3(i, 71, 4) * 0.4)]);
  }
  const hill = (x: number, z: number) => hills.find(([hx, hz, r]) => Math.hypot(x - hx, z - hz) < r * 1.1);
  const prof = (t: number) => (1 - t ** 2.4) ** 0.55 * (t < 0.14 ? 1 + (0.14 - t) * 1.6 : 1);
  const hf: HFn = (x, z) => 0.006 + 0.004 * vnoise(x * 10, 0, z * 10);
  field(gp, 0.5, 56, hf, '#5f9a3a', (x, _y, z) => {
    if (z > 0.08 && Math.abs(x) < 0.4) {
      if (frac(x * 14 + 0.5 * Math.floor(z * 10)) < 0.08 || frac(z * 10) < 0.08) return '#6b8a3a';
      return hash3(Math.floor(x * 14 + 0.5 * Math.floor(z * 10)), 1, Math.floor(z * 10)) > 0.5 ? '#86c04f' : '#76b24a';
    }
    const n = vnoise(x * 16, 0, z * 16);
    return n > 0.6 ? '#3f7a32' : '#4f8a36';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y) => (y > Y0 * 0.6 ? '#6b4a2e' : '#4a3628'), 96, 2);
  // The hills: bell-shaped grassy cones, sun-scorched brown with green skirts and patches
  hills.forEach(([hx, hz, r, H], i) => {
    const y0 = Y0 + hf(hx, hz) - 0.003, sd = i * 7.3;
    column(gp, hx, hz, y0, H, (a, t) => r * prof(t) * (1 + 0.05 * (vnoise(a * 2 + sd, t * 2, 3) - 0.5)), '#8a552a', (px, py, pz) => {
      const v = (py - y0) / H, n = vnoise(px * 40 + sd, py * 40, pz * 40);
      if (v < 0.12 + 0.1 * n) return n > 0.5 ? '#4f8a36' : '#5f8f38';
      if (v < 0.3 && n > 0.62) return '#6f7a35';
      return n > 0.7 ? '#6e4020' : n < 0.3 ? '#9c6534' : '#86522a';
    }, 16, 8, undefined, false);
  });
  // Viewing deck on the tallest hill with the long staircase climbing its face
  const top = Y0 + hf(MX, MZ) - 0.003 + MH;
  lathe(gp, [[0, 0], [0.03, 0], [0.03, 0.006], [0, 0.006]], '#e5e7eb', MX, top - 0.004, MZ, 16);
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; rod(gp, [MX + Math.cos(a) * 0.029, top + 0.002, MZ + Math.sin(a) * 0.029], [MX + Math.cos(a) * 0.029, top + 0.013, MZ + Math.sin(a) * 0.029], 0.0008, '#6b7280', 3); }
  lathe(gp, [[0.0295, 0], [0.0295, 0.0015], [0.028, 0.0015], [0.028, 0]], '#6b7280', MX, top + 0.012, MZ, 16);
  for (let k = 1; k < 20; k++) {
    const t = 1 - k / 20, z = MZ + MR * prof(t) + 0.002;
    box(gp, '#e5e7eb', MX, top - MH + t * MH - 0.006, z, 0.016, 0.006, 0.007);
  }
  crowd(gp, [[MX - 0.012, MZ - 0.01], [MX + 0.014, MZ + 0.004], [MX, MZ + 0.016]], () => top + 0.002, 1.2);
  crowd(gp, [[MX + 0.004, MZ + MR * prof(0.5) + 0.004]], () => top - MH * 0.5, 1.2);
  // Palms and forest clumps in the lowland, a road with a jeepney, farmers in the paddies
  for (let i = 0; i < 40; i++) {
    const x = -0.46 + hash3(i, 73, 1) * 0.92, z = -0.46 + hash3(i, 73, 2) * 0.92;
    if (Math.hypot(x, z) > 0.46 || hill(x, z)) continue;
    if (z > 0.1 && Math.abs(x) < 0.4 && i % 3) continue;
    if (i % 2) palm(gp, x, Y0 + hf(x, z) - 0.002, z, 0.06 + hash3(i, 73, 3) * 0.03, hash3(i, 73, 4) * 6);
    else leafy(gp, x, Y0 + hf(x, z) - 0.002, z, 0.04, '#3f7a32');
  }
  for (const [x, z] of [[-0.42, 0.12], [0.43, 0.14], [-0.3, 0.36], [0.3, 0.36], [0.0, 0.45]] as [number, number][]) palm(gp, x, Y0 + hf(x, z) - 0.002, z, 0.08, x);
  {
    const q = grp(gp, 0.18, Y0 + hf(0.18, 0.26), 0.26, 0.2);
    box(q, '#e11d48', 0, 0.006, 0, 0.05, 0.016, 0.022);
    box(q, '#f8fafc', 0, 0.022, 0, 0.054, 0.003, 0.024);
    box(q, '#facc15', 0.02, 0.012, 0.0112, 0.012, 0.006, 0.001);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(q, '#1f2937', sx * 0.016, 0, sz * 0.011, 0.005, 0.004, 8);
  }
  crowd(gp, [[-0.2, 0.2], [-0.1, 0.3], [0.08, 0.22], [-0.3, 0.26]], (x, z) => Y0 + hf(x, z), 1.2);
  for (const [x, z] of [[-0.2, 0.2], [-0.1, 0.3], [0.08, 0.22], [-0.3, 0.26]] as [number, number][]) cone(gp, '#e7d39a', x, Y0 + hf(x, z) + 0.016, z, 0.008, 0.005, 8);
};

/** Detailed builders keyed by catalogue item key (recipe.hero). */
export const H_COUNTRIES_A: Record<string, Builder> = {
  ca_belem, ca_parliament, ca_elephant, ca_moher, ca_preikestolen, ca_sigiriya, ca_registan, ca_dubrovnik, ca_santa, ca_chocolate,
};
