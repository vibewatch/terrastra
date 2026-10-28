import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type V3, type Paint, BOX, g, add, mat, box, cyl, cone, rbox, rod, strut, sweep, prism, panel, archPath, shade, mix, fbm, hash3, vnoise } from '../prims.ts';
import { type HFn, island, sstep, ridged, strataSide } from '../nature.ts';
import { grp, type MOpts, place, pbox, skirt, column } from '../kit/town.ts';

// Hero builders for: lalibela, baobabs, monumentvalley, uyuni, torresdelpaine, morainelake, harbourbridge, twelveapostles.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.

// ---- local helpers ----------------------------------------------------------------------------------------
const LO = () => g('w3:sph8', () => new THREE.SphereGeometry(0.5, 8, 6));
/** Cheap smooth ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, LO(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
const frac = (v: number) => v - Math.floor(v);
const peak = (x: number, z: number, cx: number, cz: number, h: number, r: number, pw: number) => h * Math.max(0, 1 - Math.hypot(x - cx, z - cz) / r) ** pw;

function person(p: THREE.Object3D, x: number, y: number, z: number, c: string, s = 1, skinC = '#c58c64'): void {
  passerby(p, x, y, z, 0.0165 * s, 1, { top: c, skin: skinC });
}
/** Rectangular beam from a to b (w across, h up); roll follows the minimal rotation from +x. */
function beam(p: THREE.Object3D, a: V3, b: V3, w: number, h: number, c: string): THREE.Mesh {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length() || 1e-4;
  const m = add(p, BOX(), mat(c), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, L, h, w);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
  return m;
}
/** Faceted broken-stone chunk (icosahedron with jittered vertices). */
function chunk(p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, ry = 0, rx = 0): THREE.Mesh {
  const geo = g('w3:chunk' + (seed % 7), () => {
    const ig = new THREE.IcosahedronGeometry(1, 1), pos = ig.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i), b = pos.getY(i), e = pos.getZ(i);
      const k = 0.72 + 0.45 * hash3(Math.round(a * 9) + (seed % 7) * 13, Math.round(b * 9), Math.round(e * 9));
      pos.setXYZ(i, a * k, b * k, e * k);
    }
    ig.computeVertexNormals();
    return ig;
  });
  return add(p, geo, mat(c), x, y, z, sx, sy, sz, ry, rx);
}
function conifer(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(p, '#4a3426', x, y, z, s * 0.07, s * 0.25, 5);
  strut(p, [x, y + s * 0.12, z], [x, y + s * 1.12, z], s * 0.27, 0.001, c, 6);
}
function bush(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  blob(p, c, x, y + s * 0.35, z, s * 0.55, s * 0.4, s * 0.5);
  blob(p, shade(c, 1.15), x + s * 0.15, y + s * 0.55, z + s * 0.1, s * 0.3);
}
/**
 * Square-grid heightfield clipped to a disc of radius R (rim vertices pulled onto the circle); `keep` drops cells
 * (pits, trenches). Gives crisp axis-aligned edges that the polar `island` can't.
 */
function field(p: THREE.Object3D, R: number, n: number, h: HFn, keep: (x: number, z: number) => boolean, base: string, paint: Paint, o: MOpts = {}, y0 = 0.035): THREE.Mesh {
  const pos: number[] = [], idx: number[] = [], N = n + 1, cs = (2 * R) / n;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    let x = -R + cs * i, z = -R + cs * j;
    const r = Math.hypot(x, z);
    if (r > R) { x *= R / r; z *= R / r; }
    pos.push(x, y0 + h(x, z), z);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = -R + cs * (i + 0.5), cz = -R + cs * (j + 0.5);
    if (Math.hypot(cx, cz) > R + cs * 0.7 || !keep(cx, cz)) continue;
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return place(p, geo, base, paint, { flat: o.flat ?? false, metal: o.metal, rough: o.rough ?? 0.85 });
}
/** Subdivided vertical wall from (ax,az) to (bx,bz), optionally roughened along its normal; faces away from `face`=-1 origin or toward a point. */
function wall(p: THREE.Object3D, ax: number, az: number, bx: number, bz: number, yb: number, yt: number, nu: number, nv: number, base: string,
  paint?: Paint, disp?: (u: number, v: number) => number, toward?: [number, number]): THREE.Mesh {
  let nx = bz - az, nz = -(bx - ax);
  const l = Math.hypot(nx, nz); nx /= l; nz /= l;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const dot = toward ? (toward[0] - mx) * nx + (toward[1] - mz) * nz : mx * nx + mz * nz;
  if (dot < 0) { nx = -nx; nz = -nz; }
  const pos: number[] = [], idx: number[] = [];
  for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
    const d = disp ? disp(u / nu, v / nv) : 0;
    pos.push(ax + ((bx - ax) * u) / nu + nx * d, yb + ((yt - yb) * v) / nv, az + ((bz - az) * u) / nu + nz * d);
  }
  // (b-a)×(up) points along -n for this vertex order, so emit (a, c, b) and test once
  const tx = bx - ax, tz = bz - az, flip = -tz * nx + tx * nz > 0;
  for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
    const a = v * (nu + 1) + u, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return place(p, geo, base, paint);
}
/** Ring-shaped extrusion: outer plan minus inner plan ([x, z] lists), from y to y+h. */
function ringPrism(p: THREE.Object3D, outer: [number, number][], inner: [number, number][], y: number, h: number, c: string): THREE.Mesh {
  const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  s.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return add(p, geo, mat(c), 0, y, 0, 1, 1, 1);
}
const STAR = (cx: number, cz: number, rx: number, rz: number, n: number, wob: number, seed: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, k = 1 + wob * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2) * 0.4);
    return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k];
  });

// =========================================================================================================
// Lalibela — Bete Giyorgis: a Greek-cross church hewn down into a pit of red volcanic tuff
const crossPlan = (a: number, w: number, cx = 0, cz = 0): [number, number][] =>
  ([[w, -a], [w, -w], [a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w], [-a, -w], [-w, -w], [-w, -a]] as [number, number][])
    .map(([x, z]) => [cx + x, cz + z] as [number, number]);
const TUFF = '#8f5d45';
const tuffPaint = (top: number): Paint => (x, y, z, _nx, ny) => {
  const n = fbm(x * 30, y * 30, z * 30, 2), up = (y - 0.035) / (top - 0.035);
  if (ny > 0.8) return n > 0.62 ? '#a8836a' : n < 0.34 ? '#8a6150' : '#9b7058';
  const hh = hash3(Math.floor(x * 90), Math.floor(y * 90), Math.floor(z * 90));
  if (up > 0.6 && n > 0.6 && hh > 0.35) return hh > 0.7 ? '#a8924f' : '#8f8456';
  if (up > 0.35 && n < 0.3 && hh > 0.5) return '#a8703f';
  if (Math.sin(y * 260 + n * 5) > 0.88) return '#6e4535';
  return n > 0.55 ? '#7d4f3c' : n < 0.36 ? '#a06a50' : null;
};
/** Recessed window: dark opening inside a raised frame; ogee=true gives the pointed upper-register head. */
function lwindow(p: THREE.Object3D, w: number, h: number, ogee: boolean, c: string): void {
  if (ogee) {
    panel(p, w + 0.008, h + 0.008, 0.003, c, [archPath(0, 0.004, w, h, true)], 0, -0.004, 0.0005);
    box(p, '#2a1a14', 0, -0.002, -0.0005, w, h * 0.75, 0.001);
    cone(p, '#2a1a14', 0, h * 0.62, -0.0005, w * 0.5, h * 0.36, 4).scale.z = 0.002;
    box(p, shade(c, 1.1), 0, h + 0.004, 0.001, 0.004, 0.006, 0.003);
  } else {
    box(p, '#2a1a14', 0, 0, 0, w, h, 0.002);
    for (const s of [-1, 1]) {
      box(p, c, s * (w / 2 + 0.002), -0.002, 0.001, 0.004, h + 0.004, 0.003);
      box(p, c, 0, s > 0 ? h : -0.003, 0.001, w + 0.008, 0.003, 0.003);
      for (const t of [-1, 1]) box(p, shade(c, 1.08), s * (w / 2 + 0.004), t > 0 ? h - 0.002 : -0.004, 0.002, 0.004, 0.004, 0.004);
    }
  }
}
const lalibela: Builder = gp => {
  const Y0 = 0.035, D = 0.2, Y = Y0 + D, PX = 0.2375, PZ = 0.2375;
  const inPit = (x: number, z: number) => Math.abs(x) < PX && Math.abs(z) < PZ;
  // Access trench cut toward the west (−x), ramping down to a tunnel that pierces the pit wall
  const TZ = 0.125, TW = 0.024;
  const inTr = (x: number, z: number) => x < -PX && x > -0.44 && Math.abs(z - TZ) < TW;
  const hf: HFn = (x, z) => {
    const r = Math.hypot(x, z);
    const near = sstep(0.0, 0.05, Math.max(Math.abs(x) - PX, Math.abs(z) - PZ));
    let y = D - 0.004 + near * (0.008 * fbm(x * 14, 0, z * 14, 2) + 0.012 * sstep(0.3, 0.48, r) * fbm(x * 6, 3, z * 6, 2));
    if (inTr(x, z)) y = D - (D * 0.62) * sstep(-0.44, -0.29, x);
    return y;
  };
  field(gp, 0.5, 80, hf, (x, z) => !inPit(x, z), TUFF, (x, y, z, _nx, ny) => {
    const n = fbm(x * 9, 0, z * 9, 2), r = Math.hypot(x, z), hh = hash3(Math.floor(x * 70), 2, Math.floor(z * 70));
    if (ny < 0.7) return n > 0.5 ? '#6e4535' : '#7d4f3c';
    if (r > 0.4 && n > 0.6 && hh > 0.4) return hh > 0.75 ? '#b5a06a' : '#a3925e';
    if (hh > 0.95) return '#7a5242';
    return mix('#8f6450', '#a87e66', sstep(0.3, 0.7, n + (hh - 0.5) * 0.15));
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), strataSide(['#7d4f3c', '#8f5d45', '#6e4535', '#9c6a50'], 30)!, 96, 12);
  // Pit walls: tool-dressed tuff, lichen-stained near the rim, hermit cells cut into them
  const tp = tuffPaint(Y);
  const rough = (u: number, v: number) => 0.003 * (fbm(u * 9, v * 6, 2, 2) - 0.5) * (1 - v ** 6) * Math.min(1, u * 12, (1 - u) * 12);
  for (const [ax, az, bx, bz] of [[-PX, -PZ, PX, -PZ], [PX, -PZ, PX, PZ], [PX, PZ, -PX, PZ], [-PX, PZ, -PX, -PZ]]) wall(gp, ax, az, bx, bz, Y0, Y - 0.004, 24, 12, TUFF, tp, rough, [0, 0]);
  pbox(gp, PX * 2, 0.004, PZ * 2, 0, Y0 - 0.004, 0, '#8a6a58', (x, _y, z) => (hash3(Math.floor(x * 70), 3, Math.floor(z * 70)) > 0.8 ? '#7a5a48' : fbm(x * 20, 1, z * 20, 2) > 0.6 ? '#9a7a62' : null), [12, 1, 12]);
  for (const [x, y, z, w, h, ry] of [[-0.15, 0.05, -PZ + 0.001, 0.025, 0.035, 0], [0.12, 0.11, -PZ + 0.001, 0.02, 0.025, 0], [PX - 0.001, 0.03, -0.12, 0.03, 0.04, -Math.PI / 2], [PX - 0.001, 0.12, 0.1, 0.018, 0.024, -Math.PI / 2], [-PX + 0.001, 0.08, -0.1, 0.022, 0.03, Math.PI / 2], [0.17, 0.02, PZ - 0.001, 0.03, 0.03, Math.PI]] as number[][]) {
    const q = grp(gp, x, Y0 + y, z, ry);
    box(q, '#24160f', 0, 0, 0, w, h, 0.004);
    box(q, '#6e4535', 0, -0.003, 0.002, w + 0.006, 0.003, 0.004);
  }
  // Tunnel portal from the trench into the pit
  const tq = grp(gp, -PX + 0.001, Y0, TZ, Math.PI / 2);
  box(tq, '#1e120c', 0, 0, 0, 0.032, 0.05, 0.004);
  cyl(tq, '#1e120c', 0, 0.05, 0, 0.016, 0.004, 10).rotation.x = Math.PI / 2;
  const te = grp(gp, -0.29, Y0 + D * 0.38 - 0.002, TZ, Math.PI / 2);
  box(te, '#1e120c', 0, 0, -0.008, 0.03, 0.04, 0.004);
  for (let i = 0; i < 6; i++) box(gp, '#7d5a48', -0.3 - i * 0.022, Y0 + D * 0.38 + i * 0.013 + 0.002 - 0.004, TZ, 0.008, 0.004, TW * 1.4);

  // The church: three-stepped plinth, cross-plan monolith, string courses, two window registers, roof crosses
  const A = 0.185, W = 0.068, STEP = 0.009;
  for (let k = 0; k < 3; k++) prism(gp, crossPlan(A + 0.022 - k * 0.007, W + 0.022 - k * 0.007), Y0 + k * STEP, STEP, k % 2 ? '#8a5c46' : '#7f533f', 0.001);
  const yb = Y0 + 3 * STEP, yt = Y - 0.012, Hw = yt - yb;
  const plan = crossPlan(A, W);
  const cp: Paint = (x, y, z, _nx, ny) => {
    const n = fbm(x * 26, y * 26, z * 26, 2), t = (y - yb) / Hw;
    if (ny > 0.7) return '#9b7058';
    if (t > 0.6 && n > 0.6) return hash3(Math.floor(x * 120), Math.floor(y * 120), Math.floor(z * 120)) > 0.45 ? '#a99a58' : '#8e8a5c';
    if (t < 0.25 && n > 0.58) return '#6a4232';
    return n < 0.33 ? '#a06a50' : n > 0.55 ? '#83543f' : null;
  };
  for (let i = 0; i < 12; i++) {
    const [ax, az] = plan[i], [bx, bz] = plan[(i + 1) % 12], L = Math.hypot(bx - ax, bz - az);
    wall(gp, ax, az, bx, bz, yb, yt, Math.max(2, Math.round(L * 90)), 12, '#8f5d45', cp);
  }
  prism(gp, plan.map(([x, z]) => [x * 0.99, z * 0.99] as [number, number]), yb, Hw - 0.001, '#7a4f3c');
  // String courses and the projecting roof cornice
  for (const [t, d, h] of [[0.47, 0.004, 0.006], [0.84, 0.004, 0.005]]) ringPrism(gp, crossPlan(A + d, W + d), crossPlan(A - 0.004, W - 0.004), yb + Hw * t, h, '#9c6a52');
  ringPrism(gp, crossPlan(A + 0.006, W + 0.006), crossPlan(A - 0.004, W - 0.004), yt, 0.01, '#a2745a');
  // Roof: flat deck carved with three nested Greek crosses
  prism(gp, crossPlan(A - 0.003, W - 0.003), yt, 0.008, '#9b7462');
  const RT = yt + 0.008;
  ringPrism(gp, crossPlan(A + 0.002, W + 0.002), crossPlan(A - 0.012, W - 0.012), RT, 0.006, '#ad8670');
  ringPrism(gp, crossPlan(A - 0.03, W - 0.024), crossPlan(A - 0.041, W - 0.035), RT, 0.0045, '#a77f69');
  ringPrism(gp, crossPlan(A - 0.065, W - 0.044), crossPlan(A - 0.075, W - 0.054), RT, 0.0045, '#a77f69');
  prism(gp, crossPlan(0.052, 0.012), RT, 0.0055, '#b08b74');
  for (let i = 0; i < 20; i++) {
    const x = (hash3(i, 4, 1) - 0.5) * 0.3, z = (hash3(i, 4, 2) - 0.5) * 0.3;
    if ((Math.abs(x) < W - 0.01 || Math.abs(z) < W - 0.01) && Math.max(Math.abs(x), Math.abs(z)) < A - 0.01) blob(gp, hash3(i, 4, 3) > 0.5 ? '#9b8f5a' : '#8a7d50', x, RT + 0.001, z, 0.01, 0.0012, 0.008);
  }
  // Windows: lower register framed rectangles, upper register ogee-headed; arched doors on three arms
  for (let i = 0; i < 12; i++) {
    const [ax, az] = plan[i], [bx, bz] = plan[(i + 1) % 12];
    let nx = bz - az, nz = -(bx - ax);
    const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (mx * nx + mz * nz < 0) { nx = -nx; nz = -nz; }
    const ry = Math.atan2(nx, nz), isEnd = l > 0.1;
    const q = grp(gp, mx + nx * 0.0015, 0, mz + nz * 0.0015, ry);
    const front = isEnd && nz > 0.9, door = isEnd && (front || Math.abs(nx) > 0.9);
    if (door) {
      const dq = grp(q, 0, yb, 0);
      panel(dq, 0.042, 0.072, 0.004, '#a2745a', [archPath(0, 0, 0.03, 0.062)], 0, 0, 0.001);
      box(dq, '#22150f', 0, 0, -0.0005, 0.03, 0.062, 0.001);
      box(dq, '#5a3a24', 0, 0, 0.0002, 0.026, 0.05, 0.001);
    } else {
      const wq = grp(q, 0, yb + Hw * 0.2, 0);
      lwindow(wq, 0.018, 0.03, false, '#a2745a');
    }
    const uq = grp(q, 0, yb + Hw * 0.56, 0);
    lwindow(uq, isEnd ? 0.022 : 0.018, 0.045, true, '#a77a60');
    if (isEnd) for (const s of [-1, 1]) { const sq = grp(q, s * 0.042, yb + Hw * 0.6, 0); lwindow(sq, 0.012, 0.03, true, '#a77a60'); }
  }
  // Rim life: olive & juniper trees, dry grass, stones, a low wall, white-robed pilgrims
  for (let i = 0; i < 16; i++) {
    const a = hash3(i, 5, 1) * Math.PI * 2, r = 0.36 + hash3(i, 5, 2) * 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inTr(x, z) || Math.abs(z - TZ) < 0.06 && x < -0.2) continue;
    const y = Y0 + hf(x, z) - 0.002;
    if (z < 0.1) {
      const s = 0.05 + hash3(i, 5, 3) * 0.04;
      strut(gp, [x, y, z], [x + 0.006, y + s * 0.8, z], 0.004, 0.0025, '#5b4030', 5);
      blob(gp, i % 2 ? '#5d7a3a' : '#4f6e34', x + 0.006, y + s * 0.95, z, s * 0.45, s * 0.3, s * 0.45);
      blob(gp, '#6e8a45', x + 0.012, y + s * 1.15, z + 0.005, s * 0.28, s * 0.2, s * 0.28);
    } else bush(gp, x, y, z, 0.025, '#7d8a45');
  }
  for (let i = 0; i < 40; i++) {
    const a = hash3(i, 6, 1) * Math.PI * 2, r = 0.32 + hash3(i, 6, 2) * 0.16, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inTr(x, z) || inPit(x, z)) continue;
    blob(gp, i % 3 ? '#c2ad6c' : '#a99a5a', x, Y0 + hf(x, z) + 0.002, z, 0.008, 0.005, 0.008);
  }
  for (let i = 0; i < 9; i++) chunk(gp, '#7d5a48', -0.12 + i * 0.03, Y0 + hf(0, -0.42) + 0.003, -0.42 + Math.sin(i) * 0.01, 0.014, 0.008, 0.01, i);
  for (const [x, z, s] of [[0.27, 0.3, 1.5], [0.24, 0.32, 1.4], [-0.1, 0.29, 1.5], [0.3, -0.12, 1.4], [0.04, -0.28, 1.4], [-0.16, -0.06, 1.3]]) {
    const y = x === -0.16 ? Y0 : Y0 + hf(x, z);
    cone(gp, '#f5f2ea', x, y, z, 0.006 * s, 0.014 * s, 6);
    blob(gp, '#f8f6f0', x, y + 0.0145 * s, z, 0.0035 * s, 0.004 * s, 0.0035 * s);
    blob(gp, '#5a3a28', x, y + 0.0135 * s, z + 0.0016 * s, 0.0022 * s);
  }
};

// =========================================================================================================
// Avenue of the Baobabs — Grandidier baobabs lining the red laterite road west of Morondava, at sunset
const SUN = [0.62, 0.0, 0.78];
function baobab(p: THREE.Object3D, x: number, y: number, z: number, H: number, R: number, seed: number): void {
  const prof = [[0, 1.14], [0.03, 1.04], [0.2, 1.0], [0.5, 1.0], [0.8, 0.95], [0.93, 0.84], [1.0, 0.66]];
  const lean = (hash3(seed, 1, 1) - 0.5) * 0.02;
  sweep(p, prof.map(([t, k]) => ({ p: [x + lean * t, y - 0.004 + H * t, z] as V3, w: R * k })), '#a8806c', {
    radial: 12, sub: 2, flat: false, paint: (px, py, pz, nx, _ny, nz) => {
      const a = Math.atan2(pz - z, px - x), lit = nx * SUN[0] + nz * SUN[2], st = hash3(Math.floor(a * 6) + seed * 7, 3, 1);
      const c = lit > 0.35 ? (st > 0.7 ? '#d29c74' : '#c98d68') : lit > -0.1 ? (st > 0.7 ? '#a8806c' : '#b38a72') : st > 0.6 ? '#7d6460' : '#8a6e66';
      return py - y < H * 0.04 && st > 0.4 ? shade(c, 0.85) : c;
    },
  });
  // Crown: a flat-topped tuft of stubby limbs, forking into twigs with sparse leaf tufts
  const top = y + H * 0.97, n = 5 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash3(seed, i, 2) * 0.8, e = 0.55 + hash3(seed, i, 3) * 0.45, L = H * (0.13 + hash3(seed, i, 4) * 0.07);
    const s: V3 = [x + lean + Math.cos(a) * R * 0.3, top, z + Math.sin(a) * R * 0.3];
    const m: V3 = [s[0] + Math.cos(a) * Math.cos(e) * L, s[1] + Math.sin(e) * L, s[2] + Math.sin(a) * Math.cos(e) * L];
    strut(p, s, m, R * 0.36, R * 0.17, i % 2 ? '#9a7868' : '#a8806c', 6);
    for (let k = 0; k < 3; k++) {
      const a2 = a + (k - 1) * 0.6 + (hash3(seed, i, k) - 0.5) * 0.3, e2 = 0.25 + hash3(seed, i * 3 + k, 5) * 0.5, L2 = L * (0.5 + hash3(seed, k, i) * 0.3);
      const t: V3 = [m[0] + Math.cos(a2) * Math.cos(e2) * L2, m[1] + Math.sin(e2) * L2, m[2] + Math.sin(a2) * Math.cos(e2) * L2];
      strut(p, m, t, R * 0.15, R * 0.06, '#8f6f62', 4);
      for (const d of [-0.5, 0.5]) {
        const a3 = a2 + d, L3 = L2 * 0.5;
        rod(p, t, [t[0] + Math.cos(a3) * L3, t[1] + L3 * 0.55, t[2] + Math.sin(a3) * L3], 0.0012, '#7d6058', 3);
      }
      if ((i + k + seed) % 2 === 0) blob(p, (i + k) % 3 ? '#5f7a3a' : '#7a8a40', t[0], t[1] + L2 * 0.2, t[2], L2 * 0.34, L2 * 0.11, L2 * 0.34);
    }
  }
}
function zebu(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c: string): void {
  const q = grp(p, x, y, z, ry);
  blob(q, c, 0, 0.022, 0, 0.007, 0.0075, 0.015);
  blob(q, shade(c, 0.9), 0, 0.03, 0.009, 0.004, 0.005, 0.004);
  blob(q, shade(c, 0.95), 0, 0.017, 0.012, 0.003, 0.006, 0.004);
  blob(q, c, 0, 0.026, 0.02, 0.0035, 0.004, 0.006, 0, -0.5);
  for (const s of [-1, 1]) {
    rod(q, [s * 0.002, 0.03, 0.019], [s * 0.006, 0.037, 0.02], 0.0007, '#3b3027', 3);
    for (const fz of [-0.01, 0.01]) rod(q, [s * 0.004, 0.016, fz], [s * 0.004, 0, fz], 0.0014, shade(c, 0.75), 4);
  }
}
const baobabs: Builder = gp => {
  const Y0 = 0.035;
  const rx = (z: number) => 0.012 * Math.sin(z * 5 + 0.6);
  const ponds: [number, number, number, number][] = [[-0.27, 0.24, 0.11, 0.06], [0.29, -0.08, 0.09, 0.07], [-0.24, -0.2, 0.07, 0.045]];
  const pondK = (x: number, z: number) => Math.max(...ponds.map(([px, pz, a, b]) => 1 - ((x - px) / a) ** 2 - ((z - pz) / b) ** 2 + 0.25 * (fbm(x * 20, 1, z * 20, 2) - 0.5)));
  const hf: HFn = (x, z) => {
    const road = sstep(0.05, 0.03, Math.abs(x - rx(z)));
    const k = pondK(x, z);
    if (k > 0) return -0.006;
    return 0.008 + 0.006 * fbm(x * 8, 0, z * 8, 3) - 0.004 * road + 0.004 * sstep(-0.1, 0, k) * 0;
  };
  island(gp, 0.5, hf, '#b89c5e', (x, y, z) => {
    const d = Math.abs(x - rx(z)), n = fbm(x * 16, 0, z * 16, 2), hh = hash3(Math.floor(x * 70), 1, Math.floor(z * 70));
    if (y < Y0 - 0.003) return mix('#9fb0d8', '#f0b48a', sstep(-0.25, 0.25, -z + (hh - 0.5) * 0.2));
    if (d < 0.033) return Math.abs(d - 0.016) < 0.005 ? '#b05f3c' : n > 0.6 ? '#d68a5c' : '#c8714a';
    if (d < 0.045) return hh > 0.5 ? '#b98a54' : '#9c8a50';
    if (pondK(x, z) > -0.2) return hh > 0.5 ? '#6f7a38' : '#7f8a40';
    return n > 0.64 ? '#8f8a48' : n < 0.36 ? '#c8a868' : hh > 0.85 ? '#a8904e' : null;
  }, { rings: 40, segs: 104, side: strataSide(['#8a4a2e', '#9c5a38', '#7a4028']) });
  // Lily pads and reeds in the ponds
  for (let i = 0; i < 40; i++) {
    const [px, pz, a, b] = ponds[i % 3], t = hash3(i, 2, 1) * Math.PI * 2, r = 0.3 + hash3(i, 2, 2) * 0.75;
    const x = px + Math.cos(t) * a * r, z = pz + Math.sin(t) * b * r;
    if (r > 0.85) for (let k = 0; k < 3; k++) rod(gp, [x, Y0 - 0.006, z], [x + (k - 1) * 0.003, Y0 + 0.012 + k * 0.003, z + 0.002 * k], 0.0008, '#7f8f45', 3);
    else if (i % 2) blob(gp, '#4f7a3a', x, Y0 - 0.0055, z, 0.004, 0.0006, 0.004);
  }
  // The avenue: two staggered rows of giants, plus smaller trees across the fields
  const trees: [number, number, number, number][] = [
    [-1, -0.42, 0.72, 0.04], [1, -0.36, 0.68, 0.038], [-1, -0.25, 0.78, 0.044], [1, -0.15, 0.74, 0.042], [-1, -0.06, 0.66, 0.04],
    [1, 0.06, 0.8, 0.045], [-1, 0.16, 0.7, 0.042], [1, 0.28, 0.62, 0.038],
  ];
  trees.forEach(([s, z, H, R], i) => { const x = rx(z) + s * (0.085 + hash3(i, 7, 1) * 0.03); baobab(gp, x, Y0 + hf(x, z), z, H * 0.7, R * 0.95, i + 1); });
  for (const [x, z, H, R] of [[-0.33, -0.08, 0.36, 0.026], [0.33, 0.22, 0.32, 0.024], [0.22, -0.36, 0.4, 0.028], [-0.38, 0.06, 0.28, 0.02]] as number[][]) baobab(gp, x, Y0 + hf(x, z), z, H, R, Math.round(x * 100));
  // Scrub and dry-grass tufts
  for (let i = 0; i < 70; i++) {
    const a = hash3(i, 9, 1) * Math.PI * 2, r = Math.sqrt(hash3(i, 9, 2)) * 0.47, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x - rx(z)) < 0.06 || pondK(x, z) > 0) continue;
    if (i % 4 === 0) bush(gp, x, Y0 + hf(x, z), z, 0.03 + hash3(i, 9, 3) * 0.02, i % 8 ? '#4f6a30' : '#5f7a35');
    else blob(gp, i % 3 ? '#c4ad6a' : '#a8984f', x, Y0 + hf(x, z) + 0.003, z, 0.008, 0.006, 0.008);
  }
  // Zebu cart rolling down the road toward the viewer
  const cz = 0.05, cx = rx(cz) + 0.008;
  const cart = grp(gp, cx, Y0 + hf(cx, cz) - 0.002, cz, 0.05);
  pbox(cart, 0.026, 0.004, 0.044, 0, 0.016, 0, '#7a5232');
  for (const s of [-1, 1]) {
    pbox(cart, 0.003, 0.012, 0.044, s * 0.0125, 0.02, 0, '#6a4428', (_x, y) => (Math.floor(y * 600) % 3 === 0 ? '#5a3820' : null), [1, 3, 1]);
    const w = cyl(cart, '#5a3820', s * 0.016, 0.016, 0, 0.016, 0.003, 12);
    w.rotation.z = Math.PI / 2; w.position.y = 0.016;
    cyl(cart, '#3b2618', s * 0.016, 0.016, 0, 0.004, 0.005, 6).rotation.z = Math.PI / 2;
  }
  rod(cart, [0, 0.018, 0.02], [0, 0.026, 0.075], 0.0012, '#6a4428', 4);
  rod(cart, [-0.014, 0.03, 0.074], [0.014, 0.03, 0.074], 0.0012, '#6a4428', 4);
  person(cart, 0, 0.02, 0.014, '#e5e0d0', 1.3, '#5a3a28');
  blob(cart, '#d9c58a', 0, 0.038, 0.014, 0.0045, 0.0015, 0.0045);
  zebu(cart, -0.008, 0, 0.07, 0, '#d9d2c8');
  zebu(cart, 0.008, 0, 0.068, 0, '#b9b0a6');
  // Visitors photographing the sunset
  for (const [x, z, c] of [[-0.12, 0.36, '#2563eb'], [-0.1, 0.38, '#f8fafc'], [0.07, 0.4, '#dc2626'], [-0.14, 0.33, '#1f2937']] as [number, number, string][]) person(gp, x, Y0 + hf(x, z), z, c, 1.3, '#d9a77c');
};

// =========================================================================================================
// Monument Valley — West & East Mitten Buttes and Merrick Butte on the red desert floor, US-163 running in
interface Butte { x: number; z: number; ry: number; hw: number; hd: number; T: number; H: number; m: number; thumb: number; seed: number }
const sedist = (lx: number, lz: number, a: number, b: number, p: number) => ((Math.abs(lx) / a) ** p + (Math.abs(lz) / b) ** p) ** (1 / p);
const toLocal = (b: Butte, x: number, z: number): [number, number] => {
  const c = Math.cos(b.ry), s = Math.sin(b.ry), dx = x - b.x, dz = z - b.z;
  return [dx * c - dz * s, dx * s + dz * c];
};
const toWorld = (b: Butte, lx: number, lz: number): [number, number] => {
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
};
function talus(b: Butte, x: number, z: number): number {
  const [lx, lz] = toLocal(b, x, z), sx = lx - b.thumb * b.hw * 0.16;
  const t = sedist(sx, lz, b.hw * 1.1 + b.m, b.hd + b.m * 0.85, 2.1);
  const f = Math.max(0, Math.min(1, (1 - t) / 0.7));
  if (f <= 0) return 0;
  // Concave scree cone stepped by resistant benches, cut by radial gullies near the foot
  const g0 = 1 - (1 - f) ** 1.6, q = g0 * 5, ledge = (Math.floor(q) + sstep(0.55, 1, frac(q))) / 5;
  const a = Math.atan2(lz, lx), gully = 0.08 * ridged(a * 3 + b.seed, f + b.seed, 2);
  return b.T * (0.72 * g0 + 0.28 * ledge) * (1 - gully * (1 - g0) ** 1.5);
}
function butteRock(gp: THREE.Object3D, b: Butte): void {
  const Y0 = 0.035, base = Y0 + b.T * 0.88, top = Y0 + b.T + b.H;
  const sandstone: Paint = (x, y, z, _nx, ny) => {
    const a = Math.atan2(z - b.z, x - b.x), t = (y - base) / (top - base), st = hash3(Math.floor(a * 60) + b.seed, 1, Math.floor(y * 30));
    if (ny > 0.7) return t > 0.9 ? '#a24e2e' : '#c98a62';
    if (t < 0.07) return st > 0.5 ? '#c27e58' : '#b8724e';
    if (t > 0.94) return st > 0.5 ? '#8a3a22' : '#7c3420';
    if (st > 0.82) return t > 0.5 ? '#6a2c1c' : '#7a3420';
    const band = Math.sin(y * 140 + vnoise(x * 20, y * 4, z * 20) * 3);
    return band > 0.85 ? '#b4552e' : band < -0.9 ? '#8e3c20' : null;
  };
  const [bx, bz] = toWorld(b, 0, 0);
  column(gp, bx, bz, base, top - base, (a, t) => {
    const al = a + b.ry, r = 1 / sedist(Math.cos(al), Math.sin(al), b.hw, b.hd, 5);
    const flute = 0.05 * Math.sqrt(Math.abs(Math.sin(al * 13 + b.seed))) + 0.06 * (vnoise(al * 8 + b.seed, t * 1.5, b.seed) - 0.5);
    // Top steps down toward the thumb end; a second notch on the far end
    const ca = Math.cos(al) * (b.thumb || 1), step = (t > 0.78 && ca > 0.82 ? 0.86 : 1) * (t > 0.9 && ca < -0.9 ? 0.93 : 1);
    return r * (1 + flute) * step * (t < 0.06 ? 1.07 - t : 1 - 0.05 * t) * (t > 0.97 ? 0.95 : 1);
  }, '#a24a2a', sandstone, 64, 16);
  if (b.thumb) {
    const [tx, tz] = toWorld(b, b.thumb * (b.hw + 0.04), 0);
    column(gp, tx, tz, base, (top - base) * 0.93, (a, t) => {
      const r = 0.024 * (1 + 0.18 * (vnoise(a * 2 + b.seed, t * 3, 1) - 0.5) + 0.03 * Math.abs(Math.sin(a * 6))) * (1 - 0.22 * t);
      return r * (t > 0.92 ? 1 - (t - 0.92) * 4 : 1) * (t < 0.08 ? 1.3 - t * 3.75 : 1) * (Math.abs(Math.sin(a + b.ry)) > 0.7 ? 1.25 : 1);
    }, '#a24a2a', sandstone, 16, 14);
  }
}
const monumentvalley: Builder = gp => {
  const Y0 = 0.035;
  // Gallery camera looks along −(0.56, 0.83): Mittens set side by side across the view, Merrick off to the right
  // Gallery view: screen-right ≈ (0.83, 0.56), toward camera ≈ (−0.56, 0.83) in (x, z)
  const S = (u: number, v: number): [number, number] => [0.83 * u - 0.56 * v, 0.56 * u + 0.83 * v];
  const [wx, wz] = S(-0.22, -0.07), [ex, ez] = S(0.17, -0.2), [mx, mz] = S(0.31, 0.13);
  const B: Butte[] = [
    { x: wx, z: wz, ry: -0.6, hw: 0.108, hd: 0.052, T: 0.14, H: 0.16, m: 0.11, thumb: 1, seed: 1 },
    { x: ex, z: ez, ry: -0.52, hw: 0.1, hd: 0.05, T: 0.135, H: 0.15, m: 0.105, thumb: -1, seed: 2 },
    { x: mx, z: mz, ry: -0.85, hw: 0.064, hd: 0.042, T: 0.1, H: 0.12, m: 0.075, thumb: 0, seed: 3 },
  ];
  // US-163 running straight in toward the gap between the Mittens
  const P0 = S(-0.06, 0.465), P1 = S(-0.02, 0.03);
  const rd = (x: number, z: number) => {
    const dx = P0[0] - P1[0], dz = P0[1] - P1[1], L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - P1[0]) * dx + (z - P1[1]) * dz) / L2));
    return Math.hypot(x - P1[0] - dx * t, z - P1[1] - dz * t);
  };
  const hf: HFn = (x, z) => {
    let h = 0.004 + 0.006 * fbm(x * 5, 0, z * 5, 2);
    h = h * (1 - sstep(0.04, 0.02, rd(x, z))) + 0.004 * sstep(0.04, 0.02, rd(x, z));
    for (const b of B) h = Math.max(h, talus(b, x, z));
    return h;
  };
  island(gp, 0.5, hf, '#c8703f', (x, y, z, _nx, ny) => {
    const h = y - Y0, n = fbm(x * 6, 0, z * 6, 2);
    if (h > 0.014) {
      const band = Math.floor(h * 60 + vnoise(x * 14, h * 20, z * 14) * 0.9) % 4;
      if (ny < 0.5) return h > 0.62 * 0.14 && h < 0.68 * 0.14 ? '#c9b4a0' : band === 0 ? '#9a5034' : band === 1 ? '#b46a46' : band === 2 ? '#a86040' : '#bd7854';
      return band === 3 ? '#d2a888' : ny > 0.85 ? '#c99a78' : band === 1 ? '#b98466' : '#c3906c';
    }
    if (h > 0.009) return '#c98a5e';
    if (rd(x, z) > 0.03 && Math.abs(rd(x, z) - 0.045) < 0.006 && n > 0.45) return '#d99a68';
    return mix('#c46a3c', '#d68650', Math.round(sstep(0.3, 0.7, n) * 4) / 4);
  }, { rings: 56, segs: 136, side: strataSide(['#9c4a2a', '#b45a34', '#8a3e22', '#c46a3e'], 34) });
  for (const b of B) butteRock(gp, b);
  // Asphalt with double yellow centre line, sandy shoulders, a dirt track on into the valley
  const ry = Math.atan2(P0[0] - P1[0], P0[1] - P1[1]), len = Math.hypot(P0[0] - P1[0], P0[1] - P1[1]);
  const cx = (P0[0] + P1[0]) / 2, cz = (P0[1] + P1[1]) / 2;
  const lat = (x: number, z: number) => (x - cx) * Math.cos(ry) - (z - cz) * Math.sin(ry);
  const lon = (x: number, z: number) => (x - cx) * Math.sin(ry) + (z - cz) * Math.cos(ry);
  pbox(gp, 0.044, 0.003, len, cx, Y0 + 0.002, cz, '#3d3f44', (x, _y, z, _nx, ny) => {
    if (ny < 0.5) return '#2f3136';
    const l = lat(x, z);
    if (Math.abs(Math.abs(l) - 0.0018) < 0.0009) return Math.floor(lon(x, z) * 70) % 2 ? '#f2c230' : '#3d3f44';
    return Math.abs(Math.abs(l) - 0.0195) < 0.001 ? '#e5e7eb' : null;
  }, [24, 1, 80], ry);
  for (const s of [-1, 1]) pbox(gp, 0.008, 0.0016, len, cx + Math.cos(ry) * s * 0.026, Y0 + 0.0015, cz - Math.sin(ry) * s * 0.026, '#c99a70', undefined, [1, 1, 1], ry);
  const car = grp(gp, P1[0] + Math.sin(ry) * 0.2 + Math.cos(ry) * 0.009, Y0 + 0.005, P1[1] + Math.cos(ry) * 0.2 - Math.sin(ry) * 0.009, ry);
  rbox(car, '#b91c1c', 0, 0, 0, 0.012, 0.006, 0.026, 0.002);
  rbox(car, '#1f2937', 0, 0.006, -0.002, 0.011, 0.005, 0.014, 0.002);
  for (const [t, o, c] of [[0.4, -0.004, '#f8fafc'], [0.42, 0.003, '#2563eb'], [0.37, -0.034, '#16a34a']] as [number, number, string][]) {
    const x = P1[0] + Math.sin(ry) * t + Math.cos(ry) * o, z = P1[1] + Math.cos(ry) * t - Math.sin(ry) * o;
    person(gp, x, Y0 + 0.004, z, c, 1.3);
  }
  // Sagebrush, rabbitbrush & juniper on the flats and the lower talus
  for (let i = 0; i < 110; i++) {
    const a = hash3(i, 11, 1) * Math.PI * 2, r = Math.sqrt(hash3(i, 11, 2)) * 0.48, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (rd(x, z) < 0.04) continue;
    const y = hf(x, z);
    if (y > 0.03) continue;
    const s = 0.004 + hash3(i, 11, 3) * 0.004;
    if (i % 15 === 0) bush(gp, x, Y0 + y, z, 0.018, '#4a5d3a');
    else blob(gp, i % 3 ? '#7f8a5a' : i % 2 ? '#6c7748' : '#9a9a6e', x, Y0 + y + s * 0.4, z, s, s * 0.6, s);
  }
};

// =========================================================================================================
// Salar de Uyuni — hexagonal salt crust, a rain-wet mirror, Isla Incahuasi's giant cacti and Tunupa volcano
/** Flat polygon (plan [x,z]) at height y as a single fan-triangulated sheet. */
function sheet(p: THREE.Object3D, plan: [number, number][], y: number, c: string, o: MOpts = {}): THREE.Mesh {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(plan.map(([x, z]) => new THREE.Vector2(x, -z))));
  geo.rotateX(-Math.PI / 2);
  return add(p, geo, mat(c, { flat: o.flat ?? true, metal: o.metal, rough: o.rough }), 0, y, 0, 1, 1, 1);
}
/** Low tent-section ridges along segments [ax, az, bx, bz, y] merged into one mesh. */
function ridges(p: THREE.Object3D, segs: number[][], w: number, h: number, c: string): THREE.Mesh {
  const pos: number[] = [];
  for (const [ax, az, bx, bz, y] of segs) {
    const l = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / l) * w, nz = ((bx - ax) / l) * w;
    const A: V3 = [ax + nx, y, az + nz], B: V3 = [bx + nx, y, bz + nz], C: V3 = [bx - nx, y, bz - nz], D: V3 = [ax - nx, y, az - nz];
    const T1: V3 = [ax, y + h, az], T2: V3 = [bx, y + h, bz];
    pos.push(...A, ...T2, ...B, ...A, ...T1, ...T2, ...D, ...C, ...T2, ...D, ...T2, ...T1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return add(p, geo, mat(c, { flat: true, rough: 0.8 }), 0, 0, 0, 1, 1, 1);
}
function jeep(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c: string, load: string): void {
  const q = grp(p, x, y, z, ry);
  rbox(q, c, 0, 0.004, 0, 0.016, 0.007, 0.032, 0.002);
  rbox(q, c, 0, 0.011, -0.003, 0.0155, 0.007, 0.022, 0.0015);
  box(q, '#1f2a36', 0, 0.0125, 0.0081, 0.0145, 0.004, 0.0004);
  box(q, '#1f2a36', 0, 0.0125, -0.003, 0.0158, 0.0035, 0.018);
  box(q, '#374151', 0, 0.0185, -0.003, 0.016, 0.0008, 0.021);
  rbox(q, load, 0, 0.0195, -0.004, 0.012, 0.004, 0.016, 0.0012);
  box(q, '#1d4ed8', 0.002, 0.0225, -0.004, 0.009, 0.0008, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(q, '#111827', sx * 0.0078, 0.0045, sz * 0.0105, 0.0045, 0.003, 8).rotation.z = Math.PI / 2;
}
function cactus(p: THREE.Object3D, x: number, y: number, z: number, h: number, seed: number): void {
  const r = 0.0042 + h * 0.03, c = seed % 3 ? '#6a8a48' : '#7c9a52';
  cyl(p, c, x, y - 0.003, z, r, h, 7);
  blob(p, shade(c, 1.1), x, y + h - 0.003, z, r, r * 0.8, r);
  const n = Math.floor(hash3(seed, 4, 1) * 3.2);
  for (let i = 0; i < n; i++) {
    const a = hash3(seed, i, 2) * Math.PI * 2, by = y + h * (0.3 + hash3(seed, i, 3) * 0.3), L = 0.006 + hash3(seed, i, 4) * 0.005;
    const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L, ah = h * (0.25 + hash3(seed, i, 5) * 0.3);
    rod(p, [x, by, z], [ex, by + 0.002, ez], r * 0.75, c, 6);
    cyl(p, c, ex, by, ez, r * 0.75, ah, 6);
    blob(p, shade(c, 1.1), ex, by + ah, ez, r * 0.75, r * 0.6, r * 0.75);
  }
}
const uyuni: Builder = gp => {
  const Y0 = 0.035, IX = 0.17, IZ = -0.06;
  const isle = (x: number, z: number) => {
    const a = Math.atan2(z - IZ, x - IX), R = 0.16 * (1 + 0.18 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 5 + 2));
    return Math.hypot(x - IX, z - IZ) / R;
  };
  const hf: HFn = (x, z) => {
    let h = 0.003;
    const t = isle(x, z);
    if (t < 1) h += 0.125 * (1 - t) ** 0.9 * (0.75 + 0.5 * fbm(x * 12, 1, z * 12, 3)) * (1 - 0.35 * ridged(x * 18, z * 18, 2));
    h += peak(x, z, -0.26, -0.3, 0.2, 0.19, 1.25) * (1 - 0.18 * ridged(x * 10 + 3, z * 10, 2));
    return h;
  };
  const wet = STAR(-0.15, 0.2, 0.26, 0.17, 40, 0.12, 2);
  island(gp, 0.5, hf, '#e4e1d8', (x, y, z, _nx, ny) => {
    const h = y - Y0, n = fbm(x * 14, y * 14, z * 14, 2), hh = hash3(Math.floor(x * 90), Math.floor(y * 90), Math.floor(z * 90));
    if (h > 0.012) {
      if (Math.hypot(x + 0.26, z + 0.3) < 0.2) {
        if (h > 0.17 && ny > 0.45) return '#f8fafc';
        const band = Math.floor(h * 40 + n * 2) % 4;
        return ny < 0.6 ? (band === 0 ? '#8a5a48' : '#6e5a52') : band === 1 ? '#b0784e' : band === 2 ? '#9c8a74' : '#7d6a5e';
      }
      return ny < 0.6 ? (hh > 0.5 ? '#7a6a5e' : '#8c7b6c') : n > 0.55 ? '#a89480' : hh > 0.7 ? '#9a8a72' : '#8f8070';
    }
    if (h > 0.006) return '#d8d2c4';
    return n > 0.62 ? '#dcd8cd' : hh > 0.93 ? '#eeece6' : null;
  }, { rings: 50, segs: 120, side: strataSide(['#e9e6dc', '#d6d0c2', '#c8bfae', '#e0dccf'], 30) });
  // Rain-wet mirror: glossy sky-blue sheet reflecting drifting clouds
  sheet(gp, wet, Y0 + 0.0045, '#7fb8ea', { rough: 0.12, metal: 0 });
  sheet(gp, STAR(-0.15, 0.2, 0.29, 0.195, 40, 0.12, 2), Y0 + 0.0038, '#c9d3d8', { rough: 0.5 });
  for (const [x, z, sx, sz] of [[-0.24, 0.18, 0.07, 0.025], [-0.08, 0.26, 0.06, 0.02], [-0.18, 0.1, 0.05, 0.018], [-0.02, 0.15, 0.04, 0.015], [-0.3, 0.27, 0.035, 0.014]]) {
    blob(gp, '#d4e8f8', x, Y0 + 0.0047, z, sx * 0.6, 0.0003, sz * 0.6, 0.3);
    blob(gp, '#e8f2fb', x + sx * 0.25, Y0 + 0.0048, z + 0.006, sx * 0.3, 0.0003, sz * 0.4, 0.3);
  }
  // Hexagonal salt-crust polygons on the dry flat (pressure ridges along shared edges)
  const segs: number[][] = [], S = 0.036, inWet = (x: number, z: number) => Math.hypot((x + 0.15) / 0.31, (z - 0.2) / 0.21) < 1;
  const cell = (i: number, j: number): [number, number] => [i * S * 1.5 + (hash3(i, j, 1) - 0.5) * S * 0.25, (j + (i & 1) * 0.5) * S * Math.sqrt(3) + (hash3(i, j, 2) - 0.5) * S * 0.25];
  for (let i = -12; i <= 12; i++) for (let j = -9; j <= 9; j++) {
    const [cx, cz] = cell(i, j);
    for (const [di, dj] of (i & 1 ? [[1, 0], [1, 1], [0, 1]] : [[1, -1], [1, 0], [0, 1]])) {
      const [ox, oz] = cell(i + di, j + dj), mx = (cx + ox) / 2, mz = (cz + oz) / 2;
      if (Math.hypot(mx, mz) > 0.48 || inWet(mx, mz) || hf(mx, mz) > 0.006) continue;
      const dx = ox - cx, dz = oz - cz, k = 0.29;
      segs.push([mx - dz * k, mz + dx * k, mx + dz * k, mz - dx * k, Y0 + 0.0025]);
    }
  }
  ridges(gp, segs, 0.0026, 0.003, '#fdfcf8');
  // Isla Incahuasi: coral-rock hill bristling with columnar Echinopsis cacti and a trail
  for (let i = 0; i < 44; i++) {
    const a = hash3(i, 13, 1) * Math.PI * 2, r = Math.sqrt(hash3(i, 13, 2)) * 0.9;
    const x = IX + Math.cos(a) * r * 0.16, z = IZ + Math.sin(a) * r * 0.16;
    if (isle(x, z) > 0.9) continue;
    cactus(gp, x, Y0 + hf(x, z), z, 0.025 + hash3(i, 13, 3) * 0.035, i);
  }
  for (let i = 0; i < 14; i++) {
    const a = hash3(i, 14, 1) * Math.PI * 2, r = 0.4 + hash3(i, 14, 2) * 0.5, x = IX + Math.cos(a) * r * 0.15, z = IZ + Math.sin(a) * r * 0.15;
    chunk(gp, i % 2 ? '#8a7a68' : '#a08c76', x, Y0 + hf(x, z), z, 0.012, 0.008, 0.01, i, a);
  }
  // Salt-harvest cones in rows, 4x4 tours parked on the flat and on the mirror
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    const x = 0.12 + j * 0.03 + (i & 1) * 0.015, z = 0.2 + i * 0.03;
    cone(gp, j % 2 ? '#f4f2ec' : '#ebe7dc', x, Y0 + 0.002, z, 0.009, 0.013, 7);
  }
  jeep(gp, -0.12, Y0 + 0.004, 0.2, 0.6, '#f1f5f9', '#d97706');
  jeep(gp, -0.04, Y0 + 0.004, 0.27, -0.3, '#e5e7eb', '#1e3a8a');
  jeep(gp, 0.02, Y0 + 0.002, 0.04, 1.2, '#94a3b8', '#b91c1c');
  for (const [x, z, c] of [[-0.09, 0.24, '#dc2626'], [-0.085, 0.255, '#facc15'], [-0.07, 0.235, '#2563eb'], [0.05, 0.06, '#16a34a']] as [number, number, string][]) person(gp, x, Y0 + 0.004, z, c, 1.2);
  // Flags of visitors at the Dakar salt monument stand
  for (let i = 0; i < 5; i++) {
    const x = 0.3 + i * 0.012, z = 0.08 - i * 0.008;
    rod(gp, [x, Y0 + 0.002, z], [x, Y0 + 0.05, z], 0.0007, '#9ca3af', 3);
    box(gp, ['#dc2626', '#16a34a', '#facc15', '#2563eb', '#f97316'][i], x + 0.006, Y0 + 0.042, z, 0.012, 0.008, 0.0006);
  }
};

// =========================================================================================================
// Torres del Paine — the three granite towers with dark caps above the glacial Laguna Base Las Torres
const torresdelpaine: Builder = gp => {
  const Y0 = 0.035, LX = -0.01, LZ = 0.05, WL = 0.014;
  const lag = (x: number, z: number) => Math.hypot((x - LX) / 0.23, (z - LZ) / 0.13) + 0.12 * (fbm(x * 14, 5, z * 14, 2) - 0.5);
  const hf: HFn = (x, z) => {
    const back = sstep(0.02, -0.44, z), L = lag(x, z);
    let h = 0.045 + 0.035 * fbm(x * 6, 0, z * 6, 3) + 0.025 * sstep(0.2, 0.45, z) * fbm(x * 12, 3, z * 12, 3);
    h += 0.24 * back ** 1.5 * (0.85 + 0.3 * fbm(x * 7, 2, z * 7, 2)) * (1 - 0.15 * ridged(x * 9, z * 9, 2));
    h += peak(x, z, -0.37, -0.2, 0.2, 0.3, 1.2) * (1 - 0.25 * ridged(x * 12 + 1, z * 12, 2));
    h += peak(x, z, 0.38, -0.16, 0.26, 0.28, 1.15) * (1 - 0.25 * ridged(x * 12 + 4, z * 12, 2));
    const k = sstep(0.8, 1.45, L);
    return -0.006 * (1 - k) + h * k;
  };
  const hs: HFn = (x, z) => hf(x, z);
  field(gp, 0.5, 84, hs, () => true, '#7a756c', (x, y, z, _nx, ny) => {
    const h = y - Y0, n = fbm(x * 16, y * 16, z * 16, 2), hh = hash3(Math.floor(x * 90), Math.floor(y * 90), Math.floor(z * 90));
    if (h < WL + 0.004) return '#8a8478';
    const glacier = Math.abs(x + 0.01) < 0.14 - (z + 0.3) * 0.25 && z < -0.12 && z > -0.36 && ny > 0.4;
    if (glacier) return Math.sin(x * 160 + z * 30) > 0.85 ? '#a8bccb' : n > 0.55 ? '#e4edf3' : '#cfdde8';
    if (h > 0.22 && ny > 0.62 + 0.25 * (n - 0.5)) return '#f1f5f9';
    if (h > 0.16 && ny > 0.8 && hh > 0.55) return '#e2e8f0';
    if (ny < 0.6) return n > 0.55 ? '#5b5650' : hh > 0.5 ? '#4f4a45' : '#67615a';
    if (z > 0.1 && h < 0.09) return n > 0.6 ? '#6b7a3a' : n < 0.38 ? '#8a8a5a' : hh > 0.6 ? '#7d8a48' : '#9a9070';
    return n > 0.6 ? '#9a948a' : hh > 0.85 ? '#6e6860' : '#88827a';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hs(x, z), strataSide(['#5f5a52', '#6e6860', '#57524b', '#7a746a'], 28)!, 120, 6);
  // Glacial lagoon: milky turquoise with a pale silt rim
  sheet(gp, STAR(LX, LZ, 0.25, 0.145, 44, 0.04, 1), Y0 + WL, '#38b3b0', { rough: 0.25, metal: 0.15 });
  sheet(gp, STAR(LX, LZ, 0.2, 0.11, 44, 0.05, 3), Y0 + WL + 0.0005, '#2ea3a6', { rough: 0.25, metal: 0.15 });
  // The three towers: Sur (left, massive), Central (slender, tallest), Norte (lower, right)
  const towers: [number, number, number, number, number, number][] = [[-0.12, -0.28, 0.4, 0.05, 0.034, 1], [-0.015, -0.3, 0.43, 0.036, 0.03, 2], [0.09, -0.27, 0.34, 0.044, 0.032, 3]];
  for (const [tx, tz, H, rxx, rzz, sd] of towers) {
    const yb = Y0 + hf(tx, tz) - 0.05, cap = 0.8 - sd * 0.04;
    column(gp, tx, tz, yb, H, (a, t) => {
      const sx = rxx * (1 - 0.3 * t) * (t > 0.9 ? 1 - (t - 0.9) * 3 : 1), sz = rzz * (1 - 0.25 * t) * (t > 0.9 ? 1 - (t - 0.9) * 2.5 : 1);
      const f = 1 + 0.12 * (vnoise(a * 7 + sd * 3, t * 4, sd) - 0.5) + 0.06 * Math.sin(a * 11 + sd);
      return f / Math.hypot(Math.cos(a) / sx, Math.sin(a) / sz);
    }, '#d6d0c4', (x, y, z, _nx, ny) => {
      const t = (y - yb) / H, a = Math.atan2(z - tz, x - tx), st = hash3(Math.floor(a * 14) + sd * 5, 1, Math.floor(t * 8));
      if (t > cap + 0.03 * Math.sin(a * 5)) return st > 0.5 ? '#3a3430' : '#4a423c';
      if (ny > 0.5 && t > 0.3) return '#eef2f6';
      return st > 0.85 ? '#aaa49a' : st < 0.15 ? '#ebe6dd' : t < 0.15 ? '#b4aea2' : null;
    }, 26, 14, t => [0.012 * Math.sin(t * 3 + sd), 0]);
  }
  // Moraine boulders around the lagoon and over the foreground ridge
  for (let i = 0; i < 70; i++) {
    const a = hash3(i, 21, 1) * Math.PI * 2, r = 0.05 + Math.sqrt(hash3(i, 21, 2)) * 0.4, x = Math.cos(a) * r, z = 0.05 + Math.sin(a) * r * 0.9;
    if (Math.hypot(x, z) > 0.47 || lag(x, z) < 1.04 || z < -0.15) continue;
    const s = 0.006 + hash3(i, 21, 3) * (i % 6 ? 0.01 : 0.024);
    chunk(gp, i % 3 ? '#8a847a' : '#a8a296', x, Y0 + hf(x, z) - s * 0.3, z, s, s * 0.7, s * 0.9, i, a, a * 0.5);
  }
  // Lenga beech and calafate scrub on the lower slopes, hikers at the mirador
  for (let i = 0; i < 60; i++) {
    const a = hash3(i, 22, 1) * Math.PI * 2, r = Math.sqrt(hash3(i, 22, 2)) * 0.47, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < 0.0 || lag(x, z) < 1.2) continue;
    const y = Y0 + hf(x, z);
    if (i % 3 === 0) { rod(gp, [x, y, z], [x, y + 0.02, z], 0.0016, '#4a3a2c', 4); blob(gp, i % 2 ? '#3f5f2c' : '#4f6f32', x, y + 0.026, z, 0.013, 0.01, 0.013); }
    else bush(gp, x, y, z, 0.016 + hash3(i, 22, 3) * 0.012, i % 2 ? '#5a6e32' : '#6e7a3c');
  }
  for (const [x, z, c] of [[0.05, 0.3, '#dc2626'], [0.065, 0.31, '#2563eb'], [-0.03, 0.33, '#f59e0b'], [0.12, 0.28, '#16a34a']] as [number, number, string][]) person(gp, x, Y0 + hf(x, z), z, c, 1.2);
};

// =========================================================================================================
// Moraine Lake — turquoise lake under the Valley of the Ten Peaks, the rockpile & log jam, red canoes
const morainelake: Builder = gp => {
  const Y0 = 0.035, WL = 0.012;
  const lake = (x: number, z: number) => Math.hypot((x - 0.02) / 0.35, (z - 0.07) / 0.19) + 0.1 * (fbm(x * 10, 7, z * 10, 2) - 0.5);
  const PK: [number, number, number][] = [[-0.42, -0.24, 0.3], [-0.32, -0.33, 0.44], [-0.21, -0.37, 0.5], [-0.12, -0.36, 0.38], [-0.02, -0.38, 0.56], [0.08, -0.39, 0.42], [0.17, -0.35, 0.52], [0.27, -0.33, 0.36], [0.35, -0.29, 0.42], [0.44, -0.18, 0.26]];
  const hf: HFn = (x, z) => {
    let h = 0.03 + 0.02 * fbm(x * 8, 1, z * 8, 3) + 0.07 * sstep(0.18, 0.45, x) * sstep(0.35, -0.05, z);
    let m = 0;
    for (const [px, pz, ph] of PK) m = Math.max(m, peak(x, z, px, pz, ph, 0.24, 1.5));
    h += m * (1 - 0.3 * ridged(x * 14, z * 14, 2)) + 0.12 * sstep(-0.05, -0.34, z) * (0.8 + 0.4 * fbm(x * 9, 4, z * 9, 2));
    h += peak(x, z, -0.24, 0.33, 0.06, 0.14, 1) * (0.7 + 0.6 * ridged(x * 30, z * 30, 2));
    const L = lake(x, z);
    return L < 1 ? -0.006 : h * sstep(1, 1.25, L) + WL * 1.3 * (1 - sstep(1, 1.25, L));
  };
  field(gp, 0.5, 88, hf, () => true, '#6a655e', (x, y, z, _nx, ny) => {
    const h = y - Y0, n = fbm(x * 16, y * 16, z * 16, 2), hh = hash3(Math.floor(x * 90), Math.floor(y * 90), Math.floor(z * 90));
    if (h < WL + 0.004) return '#9a9284';
    if (h > 0.16 && ny > 0.62 + 0.15 * (n - 0.5)) return h > 0.3 || n > 0.45 ? '#f1f5f9' : '#dbe5ee';
    if (h > 0.12) {
      const band = Math.floor(h * 45 + n * 1.5) % 4;
      return ny < 0.5 ? (band === 0 ? '#3f3a36' : band === 1 ? '#57514b' : band === 2 ? '#4a4540' : '#615a52') : hh > 0.6 ? '#7a746c' : '#8a837a';
    }
    if (Math.hypot(x + 0.24, z - 0.33) < 0.13) return hh > 0.5 ? '#9a948a' : '#86807a';
    if (ny < 0.55) return n > 0.5 ? '#6a6158' : '#7d756a';
    return n > 0.6 ? '#3f5a34' : hh > 0.7 ? '#4f6a3a' : '#5d6f3f';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), strataSide(['#57514b', '#6a645c', '#4a4540', '#7a7268'], 28)!, 120, 6);
  sheet(gp, STAR(0.02, 0.07, 0.37, 0.21, 48, 0.04, 2), Y0 + WL, '#14a9c4', { rough: 0.22, metal: 0.12 });
  sheet(gp, STAR(0.05, 0.02, 0.24, 0.1, 40, 0.06, 5), Y0 + WL + 0.0005, '#1cb8cf', { rough: 0.22, metal: 0.12 });
  // Conifer forest along both shores and up the lower slopes
  for (let i = 0; i < 190; i++) {
    const a = hash3(i, 31, 1) * Math.PI * 2, r = Math.sqrt(hash3(i, 31, 2)) * 0.48, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const L = lake(x, z), y = hf(x, z);
    if (L < 1.08 || y > 0.15 || Math.hypot(x + 0.24, z - 0.33) < 0.1 || (z > 0.25 && x > -0.05 && x < 0.2)) continue;
    const sz = 0.03 + hash3(i, 31, 3) * 0.035;
    conifer(gp, x, Y0 + y - 0.002, z, sz, i % 3 ? '#21452f' : i % 2 ? '#2b5236' : '#1a3a28');
  }
  // The Rockpile: heaped quartzite blocks with the log jam at the outlet
  for (let i = 0; i < 26; i++) {
    const a = hash3(i, 32, 1) * Math.PI * 2, r = Math.sqrt(hash3(i, 32, 2)) * 0.11, x = -0.24 + Math.cos(a) * r, z = 0.33 + Math.sin(a) * r * 0.8;
    const s = 0.012 + hash3(i, 32, 3) * 0.018;
    chunk(gp, i % 3 ? '#9a948a' : '#b0a99c', x, Y0 + hf(x, z) - s * 0.3, z, s, s * 0.75, s, i, a, a * 0.7);
  }
  for (let i = 0; i < 16; i++) {
    const x = -0.1 + hash3(i, 33, 1) * 0.09, z = 0.24 + hash3(i, 33, 2) * 0.04, a = hash3(i, 33, 3) * Math.PI, L = 0.03 + hash3(i, 33, 4) * 0.03;
    rod(gp, [x - Math.cos(a) * L, Y0 + WL + 0.002 + (i % 3) * 0.002, z - Math.sin(a) * L * 0.4], [x + Math.cos(a) * L, Y0 + WL + 0.003 + (i % 2) * 0.003, z + Math.sin(a) * L * 0.4], 0.0022, i % 2 ? '#c8b89a' : '#a89478', 5);
  }
  // Dock with racked canoes, the lodge, and canoes out on the lake
  pbox(gp, 0.05, 0.003, 0.012, 0.22, Y0 + WL + 0.001, 0.22, '#8a6a48', (x) => (Math.floor(x * 400) % 2 ? '#7a5a3a' : null), [10, 1, 1], 0.4);
  const canoe = (x: number, z: number, ry: number, ppl: boolean) => {
    const q = grp(gp, x, Y0 + WL, z, ry);
    blob(q, '#dc2626', 0, 0.0015, 0, 0.004, 0.0022, 0.016);
    blob(q, '#7f1d1d', 0, 0.0028, 0, 0.0028, 0.0006, 0.013);
    if (ppl) for (const pz of [-0.007, 0.007]) person(q, 0, 0.001, pz, pz > 0 ? '#facc15' : '#1d4ed8', 0.8);
  };
  canoe(0.04, 0.12, 0.6, true); canoe(-0.08, 0.05, -0.3, true); canoe(0.14, 0.03, 1.1, true); canoe(0.2, 0.2, 0.4, false); canoe(0.23, 0.21, 0.4, false);
  const lq = grp(gp, 0.33, Y0 + hf(0.33, 0.24), 0.24, -0.5);
  pbox(lq, 0.07, 0.022, 0.035, 0, -0.006, 0, '#7a5232', (_x, y) => (Math.floor(y * 500) % 2 ? '#6a4428' : null), [1, 6, 1]);
  prism(lq, [[-0.04, -0.024], [0.04, -0.024], [0.04, 0.024], [-0.04, 0.024]], 0.016, 0.003, '#2f5e3f', 0.001);
  prism(lq, [[-0.034, -0.012], [0.034, -0.012], [0.034, 0.012], [-0.034, 0.012]], 0.019, 0.006, '#2f5e3f', 0.004);
  for (const [x, z, c] of [[-0.22, 0.4, '#dc2626'], [-0.25, 0.38, '#f8fafc'], [-0.2, 0.37, '#2563eb'], [0.2, 0.26, '#16a34a']] as [number, number, string][]) person(gp, x, Y0 + hf(x, z), z, c, 1.2);
};

// =========================================================================================================
// Sydney Harbour Bridge — the "Coathanger": two-hinged steel through-arch between granite pylons
const harbourbridge: Builder = gp => {
  const Y0 = 0.035, W = Y0 + 0.004, XB = 0.42, ZR = 0.026;
  const arc = (x: number) => Math.max(0, 1 - (x / XB) ** 2);
  const yBot = (x: number) => W + 0.008 + 0.276 * arc(x);
  const yTop = (x: number) => W + 0.1 + 0.212 * arc(x);
  const YD = W + 0.088;
  // Dawes Point & Milsons Point hold the bearings; the shores swing in front & behind to frame a narrow reach
  const shoreX = (z: number) => 0.395 - 0.24 * sstep(0.09, 0.3, Math.abs(z)) + 0.022 * Math.sin(z * 9 + 1) * sstep(0.08, 0.2, Math.abs(z)) + 0.012 * fbm(1, 2, z * 6, 2);
  const OP: [number, number] = [-0.18, 0.36];
  const hf: HFn = (x, z) => {
    if (Math.hypot(x - OP[0], z - OP[1]) < 0.07) return 0.016;
    const d = Math.abs(x) - shoreX(z);
    return d > 0 ? 0.014 + 0.016 * sstep(0, 0.1, d) + 0.005 * fbm(x * 12, 1, z * 12, 2) : 0;
  };
  island(gp, 0.5, hf, '#2a6f9a', (x, y, z, _nx, ny) => {
    const h = y - Y0;
    if (h < 0.004) { const hh = hash3(Math.floor(x * 55), 0, Math.floor(z * 140)); return hh > 0.9 ? '#4a93c0' : hh < 0.1 ? '#286c96' : '#2d79a6'; }
    if (ny < 0.6) return hash3(Math.floor(y * 220), 1, Math.floor((x + z) * 60)) > 0.5 ? '#c9a46e' : '#b8925e';
    const hh = hash3(Math.floor(x * 70), 1, Math.floor(z * 70));
    return Math.abs(z) < 0.045 ? '#9aa0a6' : hh > 0.6 ? '#5f8a45' : hh > 0.25 ? '#4f7a3a' : '#c9b48a';
  }, { rings: 52, segs: 132, side: strataSide(['#b8925e', '#c9a46e', '#a8844f', '#d4b07a'], 30) });
  const STEEL = '#7d858d', DARK = '#6a7178';
  // Arch ribs: 28 panels each, bottom & top chords, verticals and N-pattern diagonals sloping toward the crown
  const NP = 28, xs = Array.from({ length: NP + 1 }, (_, i) => -XB + (2 * XB * i) / NP);
  for (const zr of [-ZR, ZR]) {
    for (let i = 0; i < NP; i++) {
      const a = xs[i], b = xs[i + 1];
      beam(gp, [a, yBot(a), zr], [b, yBot(b), zr], 0.0064, 0.0084, STEEL);
      beam(gp, [a, yTop(a), zr], [b, yTop(b), zr], 0.0056, 0.0056, STEEL);
      const inner = Math.abs(a) > Math.abs(b);
      beam(gp, inner ? [a, yTop(a), zr] : [a, yBot(a), zr], inner ? [b, yBot(b), zr] : [b, yTop(b), zr], 0.0028, 0.0028, DARK);
    }
    for (const x of xs) beam(gp, [x, yBot(x), zr], [x, yTop(x), zr], 0.0034, 0.003, DARK);
    // Hangers above the deck, posts beneath it
    for (const x of xs) if (Math.abs(x) < XB - 0.005) {
      const yb = yBot(x);
      if (yb > YD + 0.005) rod(gp, [x, yb, zr], [x, YD, zr], 0.0014, DARK, 4);
      else beam(gp, [x, yb, zr], [x, YD, zr], 0.004, 0.004, STEEL);
    }
  }
  // Wind bracing between the ribs: crossbeams on both chords, X-braces on top
  for (let i = 0; i <= NP; i++) {
    const x = xs[i];
    beam(gp, [x, yTop(x), -ZR], [x, yTop(x), ZR], 0.0026, 0.0026, DARK);
    if (yBot(x) > YD + 0.016) beam(gp, [x, yBot(x), -ZR], [x, yBot(x), ZR], 0.0028, 0.004, DARK);
    if (i < NP && i % 2 === 0) {
      const b = xs[i + 1];
      rod(gp, [x, yTop(x), -ZR], [b, yTop(b), ZR], 0.0009, DARK, 3);
      rod(gp, [x, yTop(x), ZR], [b, yTop(b), -ZR], 0.0009, DARK, 3);
    }
  }
  // Deck: eight lanes, rail tracks on the west side, cycleway & footway
  pbox(gp, 0.99, 0.005, 0.08, 0, YD - 0.005, 0, '#5b6066', (_x, y, z, _nx, ny) => {
    if (ny < 0.5 || y < YD - 0.0005) return '#6a7178';
    if (z < -0.028) return Math.abs(z + 0.033) < 0.002 ? '#8a6a4a' : '#7a7f86';
    if (z > 0.032) return '#b7a68a';
    return Math.abs(((z + 0.028) / 0.0075) % 1) < 0.09 ? '#e5e7eb' : '#3d4147';
  }, [1, 1, 16]);
  for (const zr of [-0.04, 0.04]) beam(gp, [-0.495, YD + 0.0025, zr], [0.495, YD + 0.0025, zr], 0.0016, 0.005, STEEL);
  // Granite pylons: four towers either side of the deck, stepped crowns, arched recesses, coursed ashlar
  const PW = 0.06, PD = 0.046;
  const pylon = (x: number, z: number) => {
    const yb = Y0 + 0.012, h = W + 0.2 - yb, q = grp(gp, x, yb, z);
    pbox(q, PW, h * 0.82, PD, 0, 0, 0, '#c4b393', (_x, y) => (Math.floor((y - yb) * 260) % 3 === 0 ? '#ad9c7e' : null), [1, 14, 1]);
    pbox(q, PW * 0.92, h * 0.1, PD * 0.9, 0, h * 0.82, 0, '#cbbb9c');
    pbox(q, PW * 0.74, h * 0.08, PD * 0.72, 0, h * 0.92, 0, '#d2c3a6');
    for (const s of [-1, 1]) {
      const sq = grp(q, 0, 0, s * (PD / 2 + 0.0005), s > 0 ? 0 : Math.PI);
      box(sq, '#8a7a62', 0, h * 0.52, 0, PW * 0.48, h * 0.24, 0.001);
      cyl(sq, '#8a7a62', 0, h * 0.76, 0, PW * 0.24, 0.001, 12).rotation.x = Math.PI / 2;
      box(sq, '#d8cbb0', 0, h * 0.86, 0, PW * 0.8, 0.003, 0.002);
    }
    for (const s of [-1, 1]) box(q, '#8a7a62', s * (PW / 2 + 0.0005), h * 0.45, 0, 0.001, h * 0.3, PD * 0.46);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pylon(sx * (XB + 0.035), sz * (0.04 + PD / 2 + 0.002));
  // Abutment skewbacks under the bearings and a granite pier under each approach
  for (const sx of [-1, 1]) {
    pbox(gp, 0.04, 0.03, 0.078, sx * (XB + 0.008), Y0 - 0.005, 0, '#b8a888');
    pbox(gp, 0.016, YD - 0.005 - Y0 - 0.02, 0.07, sx * 0.485, Y0 + 0.02, 0, '#c4b393');
  }
  // Flags and bridge climbers at the crown
  for (const zr of [-ZR, ZR]) {
    rod(gp, [0, yTop(0), zr], [0, yTop(0) + 0.03, zr], 0.0008, '#e5e7eb', 3);
    box(gp, zr < 0 ? '#1e3a8a' : '#111827', 0.008, yTop(0) + 0.023, zr, 0.016, 0.009, 0.0008);
    if (zr > 0) box(gp, '#dc2626', 0.008, yTop(0) + 0.0185, zr + 0.0005, 0.016, 0.0045, 0.0008);
  }
  for (let i = 0; i < 7; i++) { const x = -0.06 - i * 0.016; person(gp, x, yTop(x) + 0.003, -ZR, '#9ca3af', 0.75); }
  // Ferry, yacht, Opera House sails on Bennelong Point, The Rocks & CBD (south), North Sydney (north)
  const fq = grp(gp, 0.06, W - 0.002, 0.24, 0.35);
  rbox(fq, '#166534', 0, 0, 0, 0.07, 0.008, 0.02, 0.003);
  rbox(fq, '#f5ecd0', 0, 0.008, 0, 0.056, 0.007, 0.017, 0.002);
  rbox(fq, '#f5ecd0', 0, 0.015, 0, 0.034, 0.005, 0.013, 0.002);
  box(fq, '#1f2937', 0, 0.01, 0, 0.052, 0.0025, 0.0172);
  cyl(fq, '#facc15', 0, 0.02, 0, 0.0025, 0.007, 8);
  const yq = grp(gp, -0.1, W, -0.24, -0.6);
  blob(yq, '#f8fafc', 0, 0.002, 0, 0.004, 0.003, 0.012);
  strut(yq, [0, 0.003, 0], [0, 0.035, 0.002], 0.0006, 0.0006, '#e5e7eb', 3);
  for (let i = 0; i < 40; i++) {
    const sx = i % 2 ? 1 : -1, x = sx * (0.16 + hash3(i, 41, 1) * 0.3), z = -0.46 + hash3(i, 41, 2) * 0.92;
    if (Math.abs(z) < 0.1 || Math.hypot(x, z) > 0.47 || Math.abs(x) - shoreX(z) < 0.02 || Math.hypot(x - OP[0], z - OP[1]) < 0.08) continue;
    const y = Y0 + hf(x, z), tall = (sx < 0 ? z < 0 : z > 0.15) && hash3(i, 41, 3) > 0.4;
    const h = tall ? 0.05 + hash3(i, 41, 4) * 0.07 : 0.016 + hash3(i, 41, 4) * 0.018;
    const c = ['#e5e7eb', '#cbd5e1', '#d6c4a8', '#94a3b8', '#b45309'][i % 5];
    pbox(gp, 0.024, h, 0.022, x, y - 0.002, z, c, (_x, yy, _z, _nx, ny) => (ny < 0.5 && Math.floor(yy * 350) % 2 ? '#3b4a5c' : null), [1, Math.max(1, Math.round(h * 120)), 1]);
  }
  for (let i = 0; i < 44; i++) {
    const sx = i % 2 ? 1 : -1, x = sx * (0.14 + hash3(i, 42, 1) * 0.34), z = -0.47 + hash3(i, 42, 2) * 0.94;
    if (Math.abs(z) < 0.075 || Math.hypot(x, z) > 0.47 || Math.abs(x) - shoreX(z) < 0.01 || Math.hypot(x - OP[0], z - OP[1]) < 0.07) continue;
    blob(gp, i % 3 ? '#3f6f35' : '#4f7f3a', x, Y0 + hf(x, z) + 0.008, z, 0.011, 0.009, 0.011);
  }
  const oq = grp(gp, OP[0], Y0 + 0.016, OP[1], -2.2);
  pbox(oq, 0.08, 0.008, 0.046, 0, 0, 0, '#c9a07a');
  for (const [z, s] of [[-0.014, 1], [0.0, 0.85], [0.014, 0.7]]) for (const x of [-0.01, 0.01]) {
    const sq = grp(oq, x, 0.008, z * 1.2, 0);
    strut(sq, [0, 0, 0.007 * s], [0, 0.028 * s, -0.007 * s], 0.009 * s, 0.001, '#f5f2e8', 5);
  }
};

// =========================================================================================================
// Twelve Apostles — limestone stacks in the Southern Ocean surf below golden cliffs, Great Ocean Road lookout
const twelveapostles: Builder = gp => {
  const Y0 = 0.035, CH = 0.2;
  const zc = (x: number) => -0.2 + 0.4 * sstep(0.12, 0.42, x) + 0.035 * Math.sin(x * 13 + 1) + 0.025 * (fbm(x * 8, 3, 1, 2) - 0.5);
  const hf: HFn = (x, z) => {
    const d = zc(x) - z;
    if (d > 0.012) return CH + 0.02 * sstep(0.02, 0.2, d) + 0.012 * fbm(x * 9, 0, z * 9, 2);
    if (d > -0.025) return d > 0.008 ? CH * sstep(0.008, 0.012, d) : 0.006 * sstep(-0.025, 0.008, d);
    return 0;
  };
  const LTOP = ['#d9a560', '#c48a48', '#e6bf80', '#b37a40', '#cf9a58'];
  const stratum = (y: number, x: number, z: number) => LTOP[Math.abs(Math.floor(y * 70 + fbm(x * 12, y * 4, z * 12, 2) * 1.2)) % LTOP.length];
  field(gp, 0.5, 96, hf, () => true, '#c48a48', (x, y, z, _nx, ny) => {
    const h = y - Y0, d = zc(x) - z;
    if (h < 0.004) {
      const f = -d, wv = Math.sin(f * 150 + fbm(x * 10, 1, z * 10, 2) * 4);
      if (f < 0.045 + 0.01 * Math.sin(x * 30)) return wv > -0.2 ? '#eef6f8' : '#8fd0d8';
      if (f < 0.11 && wv > 0.75) return '#d8eef2';
      return mix('#3aa0b4', '#1d5f80', sstep(0.05, 0.35, f));
    }
    if (h < 0.012) return hash3(Math.floor(x * 90), 0, Math.floor(z * 90)) > 0.6 ? '#e8cf9a' : '#dcc088';
    if (ny < 0.6) return h > CH - 0.012 ? '#8a7a40' : stratum(y, x, z);
    const n = fbm(x * 18, 0, z * 18, 2);
    return n > 0.6 ? '#5a6e32' : n < 0.38 ? '#8a8a48' : '#6f7f3a';
  }, { flat: true });
  skirt(gp, 0.5, (x, z) => Y0 + hf(x, z), (y, x, z) => (y > Y0 + 0.01 ? stratum(y, x, z) : '#1d5f80'), 120, 8);
  // Cliff curtain along the coastline so the face carries crisp horizontal strata, caves and notches
  {
    const pos: number[] = [], idx: number[] = [], NV = 16, xsC: number[] = [];
    for (let x = -0.5; x <= 0.5; x += 0.008) if (Math.hypot(x, zc(x) - 0.007) < 0.497) xsC.push(x);
    for (const x of xsC) for (let k = 0; k <= NV; k++) {
      const v = k / NV, top = CH + 0.02 * sstep(0.02, 0.2, 0.007) - 0.002;
      const out = 0.004 * fbm(x * 30, v * 6, 2, 2) + (v < 0.2 ? -0.004 * (1 - v / 0.2) : 0) + 0.003 * Math.sin(v * 22 + x * 9) ** 2;
      pos.push(x, Y0 + 0.004 + (top - 0.004) * v, zc(x) - 0.007 + Math.max(-0.004, out));
    }
    for (let i = 0; i < xsC.length - 1; i++) for (let k = 0; k < NV; k++) {
      const a = i * (NV + 1) + k, b = a + NV + 1, c = a + 1, d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    place(gp, geo, '#c48a48', (x, y, z) => (y > Y0 + CH + 0.012 ? '#6f7f3a' : y < Y0 + 0.012 ? '#8a6a3a' : hash3(Math.floor(x * 120), 7, Math.floor(y * 200)) > 0.93 ? '#7a5a34' : stratum(y, x, z)));
  }
  // The stacks: notched at the waterline, layered, scrub-capped
  const ST: [number, number, number, number, number][] = [
    [-0.36, 0.0, 0.12, 0.03, 1], [-0.24, -0.06, 0.17, 0.042, 2], [-0.12, 0.06, 0.15, 0.036, 3], [-0.02, -0.07, 0.18, 0.04, 4],
    [0.08, 0.06, 0.14, 0.034, 5], [-0.2, 0.22, 0.1, 0.03, 6], [0.02, 0.26, 0.08, 0.026, 7], [0.18, 0.2, 0.16, 0.038, 8],
  ];
  for (const [x, z, H, R, sd] of ST) {
    column(gp, x, z, Y0 - 0.005, H, (a, t) => {
      const notch = t < 0.12 ? 0.72 + t * 1.5 : 1, top = t > 0.85 ? 1 - ((t - 0.85) / 0.15) ** 2 * 0.55 : 1;
      return R * notch * top * (1 - 0.12 * t) * (1 + 0.22 * (vnoise(a * 2.5 + sd * 3, t * 3, sd) - 0.5) + 0.05 * Math.sin(a * 7 + t * 20));
    }, '#d9a560', (px, py, pz, _nx, ny) => {
      if (ny > 0.55 && py > Y0 + H * 0.8) return hash3(Math.floor(px * 300), sd, Math.floor(pz * 300)) > 0.4 ? '#6f7f3a' : '#8a8a48';
      if (py < Y0 + 0.008) return '#7a5a34';
      return stratum(py, px, pz);
    }, 18, 20, t => [0.006 * Math.sin(t * 4 + sd), 0.004 * Math.cos(t * 3 + sd)]);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + sd;
      blob(gp, k % 2 ? '#f1f8fa' : '#d8eef2', x + Math.cos(a) * R * 0.95, Y0 + 0.001, z + Math.sin(a) * R * 0.95, R * 0.42, 0.0012, R * 0.3, -a + Math.PI / 2);
    }
  }
  // Fallen-stack rubble and the boardwalk lookout on the headland
  for (const [x, z, s] of [[-0.3, 0.12, 0.012], [0.12, 0.3, 0.01], [-0.08, 0.16, 0.008]]) chunk(gp, '#c48a48', x, Y0 - 0.002, z, s, s * 0.6, s, Math.round(x * 100));
  const path: [number, number][] = ([[0.47, 0.17], [0.42, 0.1], [0.37, 0.06], [0.33, 0.035], [0.3, 0.028]] as [number, number][]).map(([x, o]) => [x, zc(x) - o]);
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], ya = Y0 + hf(ax, az) + 0.004, yb = Y0 + hf(bx, bz) + 0.004;
    beam(gp, [ax, ya, az], [bx, yb, bz], 0.012, 0.002, '#8a6a48');
    for (const s of [-1, 1]) {
      const l = Math.hypot(bx - ax, bz - az), ox = (-(bz - az) / l) * 0.006 * s, oz = ((bx - ax) / l) * 0.006 * s;
      beam(gp, [ax + ox, ya + 0.007, az + oz], [bx + ox, yb + 0.007, bz + oz], 0.0012, 0.0012, '#6a4a30');
      for (let k = 0; k < 4; k++) { const t = k / 4, px = ax + (bx - ax) * t + ox, pz = az + (bz - az) * t + oz; rod(gp, [px, ya + (yb - ya) * t, pz], [px, ya + (yb - ya) * t + 0.007, pz], 0.0006, '#6a4a30', 3); }
    }
  }
  const [vx, vz] = path[path.length - 1], vy = Y0 + hf(vx, vz) + 0.004;
  pbox(gp, 0.05, 0.003, 0.035, vx - 0.01, vy - 0.002, vz + 0.008, '#8a6a48', (x) => (Math.floor(x * 500) % 2 ? '#7a5a3a' : null), [8, 1, 1], 0.3);
  for (const [x, z, c] of [[vx - 0.02, vz + 0.01, '#dc2626'], [vx - 0.005, vz + 0.016, '#2563eb'], [vx - 0.025, vz - 0.002, '#f8fafc'], [0.34, -0.05, '#16a34a'], [0.37, -0.1, '#f59e0b']] as [number, number, string][]) person(gp, x, Y0 + hf(x, z) + 0.004, z, c, 1.2);
  for (let i = 0; i < 50; i++) {
    const x = -0.45 + hash3(i, 51, 1) * 0.9, z = -0.48 + hash3(i, 51, 2) * 0.9;
    if (Math.hypot(x, z) > 0.47 || zc(x) - z < 0.04) continue;
    bush(gp, x, Y0 + hf(x, z), z, 0.012 + hash3(i, 51, 3) * 0.01, i % 2 ? '#4f6a30' : '#6a7a38');
  }
};

export const WORLD3: Record<string, Builder> = { lalibela, baobabs, monumentvalley, uyuni, torresdelpaine, morainelake, harbourbridge, twelveapostles };
