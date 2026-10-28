import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type Paint, type V3, g, add, mat, box, cyl, cone, lathe, rod, slab, tree, gable, hash3, fbm, paintFaces } from '../prims.ts';
import { island, sstep, type HFn } from '../nature.ts';
import { type P2, mx, sh, fine, bar, batched, hcyl } from '../kit/orbit.ts';

// Hero builders for the space & science collection (launch pads, telescopes, labs, a crater and two space stations).
// Front faces +z, base at y=0, ground footprint radius ≈0.48; the orbiting stations have no base.

const TAU = Math.PI * 2;
const grp = (p: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.set(rx, ry, rz); p.add(q); return q;
};
/** Group at angle `a` (0 = +z) and distance d whose local +x points radially outward. */
const radial = (p: THREE.Object3D, cx: number, cz: number, a: number, d: number, y: number) =>
  grp(p, cx + Math.sin(a) * d, y, cz + Math.cos(a) * d, a - Math.PI / 2);

/** Lathe of a [radius, y] profile with per-face colours (rocket roll patterns, dish panels, domes). */
function plathe(p: THREE.Object3D, prof: P2[], base: string, paint?: Paint, seg = 20, x = 0, y = 0, z = 0, o: { flat?: boolean; metal?: number; rough?: number } = {}): THREE.Mesh {
  const lg = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg);
  lg.computeVertexNormals();
  return add(p, paintFaces(lg, base, paint), mat('#ffffff', { vc: true, flat: o.flat ?? false, metal: o.metal, rough: o.rough }), x, y, z, 1, 1, 1);
}
const scaleProf = (prof: P2[], kr: number, ky: number): P2[] => prof.map(([r, y]) => [r * kr, y * ky]);

const PUFF = () => g('sp:puff', () => new THREE.SphereGeometry(1, 10, 7));
const puff = (p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#f3f2ee', sy = 0.82) =>
  add(p, PUFF(), mat(c, { flat: false }), x, y, z, s, s * sy, s);
/** Billowing cloud of puffs (steam, exhaust, sea of clouds). */
function cloud(p: THREE.Object3D, x: number, y: number, z: number, s: number, n: number, seed: number, c = '#f3f2ee', spread: V3 = [1, 0.6, 1]): void {
  for (let i = 0; i < n; i++) {
    const a = hash3(i, seed, 1) * TAU, d = Math.sqrt(hash3(i, seed, 2)) * s;
    const ss = s * (0.45 + 0.4 * hash3(i, seed, 3));
    puff(p, x + Math.cos(a) * d * spread[0], y + hash3(i, seed, 4) * s * spread[1], z + Math.sin(a) * d * spread[2], ss, i % 3 ? c : sh(c, 0.94));
  }
}

/** Inserts profile vertices at the given heights so painted bands get crisp, straight edges. */
function cuts(prof: P2[], ys: number[]): P2[] {
  const out: P2[] = [prof[0]];
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    const mid = ys.filter(y => y > lo + 1e-6 && y < hi - 1e-6).sort((a, b) => (y1 > y0 ? a - b : b - a));
    for (const y of mid) out.push([r0 + ((r1 - r0) * (y - y0)) / (y1 - y0), y]);
    out.push(prof[i]);
  }
  return out;
}

/** Rows at every multiple of `step` (globally aligned, so per-row checker paints stay crisp). */
function grid(prof: P2[], step: number): P2[] {
  const ys = prof.map(q => q[1]), lo = Math.min(...ys), hi = Math.max(...ys), out: number[] = [];
  for (let y = Math.ceil(lo / step) * step; y < hi; y += step) out.push(y);
  return cuts(prof, out);
}

const _A = new THREE.Vector3(), _D = new THREE.Vector3(), _S = new THREE.Vector3(), _U = new THREE.Vector3(), _R = new THREE.Vector3();
/**
 * Lattice girder between a and b: 4 longerons on a w×d rectangle, n bays with rings and zig-zag diagonals.
 * `top` scales the cross-section at b (tapered towers). For vertical trusses w runs along x and d along z.
 */
function truss(p: THREE.Object3D, a: V3, b: V3, w: number, d: number, n: number, c: string, r = 0.003, top = 1, diag = true): void {
  _A.set(...a); _D.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _R.set(...(Math.abs(_D.y) / _D.length() > 0.9 ? [1, 0, 0] as V3 : [0, 1, 0] as V3));
  _S.crossVectors(_D, _R).normalize(); _U.crossVectors(_S, _D).normalize();
  const A = _A.clone(), D = _D.clone(), S = _S.clone(), U = _U.clone();
  const sg = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const pt = (i: number, t: number): V3 => {
    const k = 1 + (top - 1) * t, [su, ss] = sg[i % 4];
    return [A.x + D.x * t + U.x * su * w * 0.5 * k + S.x * ss * d * 0.5 * k, A.y + D.y * t + U.y * su * w * 0.5 * k + S.y * ss * d * 0.5 * k,
      A.z + D.z * t + U.z * su * w * 0.5 * k + S.z * ss * d * 0.5 * k];
  };
  for (let i = 0; i < 4; i++) bar(p, pt(i, 0), pt(i, 1), r * 1.25, c, 5);
  for (let k = 0; k <= n; k++) {
    const t = k / n, t2 = (k + 1) / n;
    for (let i = 0; i < 4; i++) {
      bar(p, pt(i, t), pt(i + 1, t), r * 0.8, c, 4);
      if (diag && k < n) bar(p, (k + i) % 2 ? pt(i, t) : pt(i + 1, t), (k + i) % 2 ? pt(i + 1, t2) : pt(i, t2), r * 0.7, c, 4);
    }
  }
}

/** Rocket engine bell hanging below y (opening downward). */
function bell(p: THREE.Object3D, x: number, y: number, z: number, re: number, h: number, c = '#3b3a39'): void {
  plathe(p, [[re, 0], [re * 0.78, h * 0.35], [re * 0.5, h * 0.75], [re * 0.42, h]], c, undefined, 12, x, y - h, z);
  cyl(p, '#1d1d1f', x, y - h * 0.9, z, re * 0.7, h * 0.1, 10);
}
/** Trapezoid fin in the radial plane of group `q` (local +x outward). */
const fin = (q: THREE.Object3D, rIn: number, y0: number, root: number, span: number, tip: number, sweep: number, th: number, c: string) =>
  slab(q, [[rIn, y0], [rIn + span, y0 + sweep], [rIn + span, y0 + sweep + tip], [rIn, y0 + root]], th, c, 0, false);

/** Palm tree with a gently curved trunk and drooping fronds. */
function palm(p: THREE.Object3D, x: number, y: number, z: number, s: number, lean = 0): void {
  const pts: V3[] = [];
  for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push([x + Math.sin(lean) * s * 0.3 * t * t, y + s * t, z + Math.cos(lean) * s * 0.3 * t * t]); }
  for (let i = 0; i < 3; i++) bar(p, pts[i], pts[i + 1], s * 0.035 * (1.15 - i * 0.12), '#8a6a4a', 5);
  const [tx, ty, tz] = pts[3];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + hash3(x, z, i), c = i % 2 ? '#3f7d3a' : '#4f9145';
    const m: V3 = [tx + Math.cos(a) * s * 0.28, ty + s * 0.06, tz + Math.sin(a) * s * 0.28];
    const e: V3 = [tx + Math.cos(a) * s * 0.5, ty - s * 0.12, tz + Math.sin(a) * s * 0.5];
    bar(p, [tx, ty, tz], m, s * 0.04, c, 4);
    bar(p, m, e, s * 0.03, c, 4);
  }
  cyl(p, '#5a4a32', tx, ty - s * 0.04, tz, s * 0.06, s * 0.06, 6);
}
/** Tiny person for scale. */
function person(p: THREE.Object3D, x: number, y: number, z: number, s = 0.02, c = '#2b5d9c'): void {
  passerby(p, x, y, z, s * 0.9, 1, { top: c });
}
/** Flat terrain disc helper: island with cheaper tessellation. */
const ground = (gp: THREE.Object3D, h: HFn, paint: Paint, base = 0.035, rings = 26, segs = 72, R = 0.5, side?: (y: number) => string) =>
  island(gp, R, h, '#888888', paint, { rings, segs, base, side: side ?? ((yy: number) => (yy > base * 0.55 ? '#6b5440' : '#4f3d2e')) });

// ---- rockets ----------------------------------------------------------------------------------------------
const WHITE = '#f2f1ec', BLACK = '#1f2124';

/** Saturn V (Apollo 11 livery), base of the engine bells at y=0, k units per metre. */
function saturnV(p: THREE.Object3D, k: number, kr: number): void {
  const prof: P2[] = [[0, 5.5], [5.05, 5.5], [5.05, 41.8], [5.12, 42], [5.12, 42.3], [5.05, 42.6], [5.05, 66.8], [4.9, 67.4], [3.32, 72], [3.32, 87],
    [3.4, 87.1], [3.4, 88], [3.3, 88.1], [1.98, 96.5], [1.98, 101.3], [1.5, 102.6], [0.5, 105], [0, 105.2]];
  const sector = (x: number, z: number) => Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * 8) % 2;
  const paint: Paint = (x, y, z) => {
    const m = y / k, s = sector(x, z);
    if (m < 5.6) return '#3b3b3d';
    if (m > 6.2 && m < 22) return s ? BLACK : null;
    if (m > 32.5 && m < 36.2) return s ? null : BLACK;
    if (m > 72.2 && m < 78.5) return s ? BLACK : null;
    if (m > 86.9 && m < 88.1) return '#a7abb0';
    if (m > 41.7 && m < 42.7) return '#d6d5cf';
    if (m > 101.2) return '#dfe3e6';
    if (m > 96.4) return '#e8e9e6';
    if (Math.abs(m - 47.5) < 0.4 || Math.abs(m - 66.9) < 0.4) return '#cfcec8';
    return null;
  };
  plathe(p, cuts(fine(scaleProf(prof, k * kr, k), 1.8 * k), [5.6, 6.2, 22, 32.5, 36.2, 47.1, 47.9, 66.5, 67.3, 72.2, 78.5].map(m => m * k)), WHITE, paint, 24);
  // F-1 engines, fins and engine fairings at the four 45° quadrants
  bell(p, 0, 5.6 * k, 0, 1.85 * k * kr, 5.6 * k);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    bell(p, Math.sin(a) * 3.2 * k * kr, 5.6 * k, Math.cos(a) * 3.2 * k * kr, 1.85 * k * kr, 5.6 * k);
    const q = radial(p, 0, 0, a, 0, 0);
    plathe(q, [[0, 0], [1.7 * k * kr, 0.1 * k], [1.45 * k * kr, 7 * k], [0.3 * k * kr, 11 * k], [0, 11.2 * k]], WHITE, undefined, 10, 4.2 * k * kr, 3.6 * k, 0);
    fin(q, 4.9 * k * kr, 3.8 * k, 7 * k, 3.4 * k * kr, 2.6 * k, 1.2 * k, 0.5 * k * kr, BLACK);
  }
  // Launch escape system: lattice tower + motor + pointed nose
  const b = 104 * k, r0 = 0.95 * k * kr, r1 = 0.42 * k * kr, top = 108.2 * k;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4, a2 = a + TAU / 4;
    bar(p, [Math.sin(a) * r0, b, Math.cos(a) * r0], [Math.sin(a) * r1, top, Math.cos(a) * r1], 0.0018, '#c23b2b', 4);
    bar(p, [Math.sin(a) * r0, b, Math.cos(a) * r0], [Math.sin(a2) * r1 * 1.5, (b + top) / 2, Math.cos(a2) * r1 * 1.5], 0.0012, '#c23b2b', 4);
  }
  plathe(p, [[0.48 * k * kr, 0], [0.48 * k * kr, 2.4 * k], [0.32 * k * kr, 3.2 * k], [0.1 * k * kr, 4.6 * k], [0, 5 * k]], '#e9e7e1',
    (_x, y) => (y < 0.5 * k ? '#c23b2b' : null), 10, 0, top, 0);
}

/** Generic clustered launcher: core lathe + strap-on boosters with nose cones (Soyuz / Long March). */
interface Booster { prof: P2[]; paint?: Paint; dist: number; tilt?: number; n: number; a0?: number; fin?: [number, number, number, number, number]; bells: number; bellR: number; bellH: number }
function boosters(p: THREE.Object3D, b: Booster, k: number): void {
  for (let i = 0; i < b.n; i++) {
    const a = (b.a0 ?? 0) + (i / b.n) * TAU;
    const q = radial(p, 0, 0, a, b.dist, 0);
    const t = grp(q, 0, 0, 0, 0, 0, b.tilt ?? 0);
    plathe(t, b.prof, WHITE, b.paint, 18);
    const y0 = b.prof[0][1];
    if (b.bells === 1) bell(t, 0, y0, 0, b.bellR, b.bellH);
    else for (let j = 0; j < b.bells; j++) {
      const ba = (j / b.bells) * TAU + Math.PI / 4;
      bell(t, Math.cos(ba) * b.bellR * 1.05, y0, Math.sin(ba) * b.bellR * 1.05, b.bellR, b.bellH);
    }
    if (b.fin) { const [rIn, y, root, span, tip] = b.fin; fin(t, rIn, y, root, span, tip, root - tip, 0.12 * k * 4, WHITE); }
  }
}

/** Swing arm: a short lattice girder from tower face to rocket, with a little white access room for crew arms. */
function swingArm(p: THREE.Object3D, a: V3, b: V3, c: string, room = false): void {
  truss(p, a, b, 0.014, 0.012, 3, c, 0.0022);
  box(p, '#9aa0a6', (a[0] + b[0]) / 2, a[1] + 0.0065, (a[2] + b[2]) / 2, Math.abs(b[0] - a[0]) + 0.004, 0.0025, 0.012);
  if (room) box(p, '#eef0f0', b[0] - 0.008, a[1] - 0.004, b[2], 0.018, 0.02, 0.022);
}

// ---- telescopes -------------------------------------------------------------------------------------------
/**
 * Paraboloid dish (concave up, vertex at the origin): panelled front (subtle per-panel tint), grey back.
 * `cap` > 0 makes a spherical cap of that sphere radius instead (FAST).
 */
function dish(p: THREE.Object3D, R: number, depth: number, c = '#eef0f1', rings = 6, seg = 24, t = 0.006, back = '#b8bcc0', cap = 0): THREE.Mesh {
  const yAt = (r: number) => (cap ? cap - Math.sqrt(cap * cap - r * r) : depth * (r / R) ** 2);
  const prof: P2[] = [];
  for (let i = 0; i <= rings; i++) { const r = (R * i) / rings; prof.push([r, yAt(r) - t]); }
  prof.push([R * 1.012, yAt(R) + t * 0.2]);
  for (let i = rings; i >= 0; i--) { const r = (R * i) / rings; prof.push([r, yAt(r)]); }
  return plathe(p, prof, c, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y < yAt(Math.min(r, R)) - t * 0.5 && r < R * 0.99) return back;
    const ri = Math.floor((r / R) * rings), si = Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * seg * (ri < 2 ? 0.5 : 1));
    const hsh = hash3(ri, si, 7);
    return hsh > 0.66 ? sh(c, 0.955) : hsh < 0.2 ? sh(c, 1.025) : null;
  }, seg, 0, 0, 0, { flat: true });
}

/** Radio antenna on an alt-az mount (unit = dish radius). style: ALMA (boxy pedestal) or VLA (tapered pedestal + feed cone). */
function antenna(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, el: number, style: 'alma' | 'vla'): void {
  const q = grp(p, x, y, z, ry);
  const W = '#f4f5f4', G = '#c9ccce';
  if (style === 'alma') {
    box(q, '#b9b6b0', 0, 0, 0, 1.3 * s, 0.08 * s, 1.3 * s);
    box(q, W, 0, 0.08 * s, 0, 0.95 * s, 0.95 * s, 0.95 * s);
    box(q, G, 0, 0.5 * s, 0.48 * s, 0.5 * s, 0.3 * s, 0.03 * s);
    cyl(q, W, 0, 1.03 * s, 0, 0.6 * s, 0.22 * s, 14);
    for (const sx of [-1, 1]) box(q, W, sx * 0.62 * s, 1.2 * s, 0, 0.2 * s, 0.75 * s, 0.55 * s);
  } else {
    box(q, '#b0aaa0', 0, 0, 0, 1.2 * s, 0.1 * s, 1.2 * s);
    cyl(q, W, 0, 0.1 * s, 0, 0.36 * s, 1.1 * s, 12);
    box(q, W, 0, 1.15 * s, 0, 1.15 * s, 0.22 * s, 0.7 * s);
    for (const sx of [-1, 1]) box(q, W, sx * 0.62 * s, 1.3 * s, 0, 0.14 * s, 0.6 * s, 0.4 * s);
  }
  const axisY = (style === 'alma' ? 1.82 : 1.8) * s;
  const d = grp(q, 0, axisY, 0, 0, el);
  const depth = (style === 'alma' ? 0.3 : 0.26) * s, R = s, v = -0.35 * s;
  const dm = dish(d, R, depth, W, 4, style === 'alma' ? 20 : 18, 0.04 * s, '#d4d6d6');
  dm.position.y = v;
  bar(d, [-0.62 * s, 0, 0], [0.62 * s, 0, 0], 0.07 * s, G, 6);
  box(d, W, 0, v - 0.42 * s, 0, 0.55 * s, 0.4 * s, 0.55 * s);
  const f = (R * R) / (4 * depth) * (style === 'alma' ? 1 : 0.9);
  const sub: V3 = [0, v + f, 0];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + (style === 'alma' ? Math.PI / 4 : 0);
    bar(d, [Math.sin(a) * R * 0.92, v + depth * 0.85, Math.cos(a) * R * 0.92], sub, 0.025 * s, W, 4);
  }
  const sd = grp(d, 0, v + f, 0);
  cyl(sd, W, 0, 0, 0, 0.16 * s, 0.05 * s, 12);
  if (style === 'vla') cone(d, W, 0.1 * s, v + 0.02 * s, -0.12 * s, 0.13 * s, 0.6 * s, 10);
  else cyl(d, G, 0, v + 0.01 * s, 0, 0.2 * s, 0.12 * s, 10);
}

/** Observatory dome: drum + hemisphere with a dark observing slit (slit faces local +z). */
function obsDome(p: THREE.Object3D, x: number, y: number, z: number, r: number, drum: number, c: string, ry: number, o: { silver?: boolean; open?: boolean } = {}): void {
  const q = grp(p, x, y, z, ry);
  cyl(q, sh(c, 0.94), 0, 0, 0, r, drum, 24);
  cyl(q, sh(c, 0.82), 0, drum * 0.9, 0, r * 1.02, drum * 0.1, 24);
  const prof: P2[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push([Math.cos(a) * r * 1.01, drum + Math.sin(a) * r * 1.01]); }
  plathe(q, prof, c, (px, py, pz) => {
    if (Math.abs(px) < r * 0.17 && pz > 0 && py > drum + r * 0.08) return o.open ? '#1b1d22' : sh(c, 0.84);
    if (Math.abs(Math.abs(px) - r * 0.2) < r * 0.03 && pz > 0) return sh(c, 0.78);
    return o.silver ? (hash3(Math.floor(px * 400), Math.floor(py * 400), 1) > 0.5 ? sh(c, 1.03) : null) : null;
  }, 24, 0, 0, 0, { metal: o.silver ? 0.35 : 0.05, rough: o.silver ? 0.35 : 0.6 });
}

/** Terrain with soft cones/bumps. */
const bump = (x: number, z: number, cx: number, cz: number, r: number, h: number) => {
  const d = Math.hypot(x - cx, z - cz) / r;
  return d < 1 ? h * (1 - d * d) ** 1.6 : 0;
};

// ---- space-station parts ---------------------------------------------------------------------------------
const sph = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number) => add(p, PUFF(), mat(c, { flat: false }), x, y, z, r, r, r);
/** Solar-array blanket lying flat, long side along `ax`, painted as a grid of cells. */
function pv(p: THREE.Object3D, x: number, y: number, z: number, W: number, L: number, c: string, ax: 'x' | 'z', tilt = 0): void {
  const nl = Math.max(4, Math.round(L / 0.012)), nw = Math.max(2, Math.round(W / 0.012));
  const geo = g(`sp:pv:${c}:${W.toFixed(3)}:${L.toFixed(3)}`, () => paintFaces(new THREE.BoxGeometry(W, 0.003, L, nw, 1, nl), c, (fx, _fy, fz, _nx, ny) => {
    if (Math.abs(ny) < 0.5) return sh(c, 0.6);
    const i = Math.floor((fx / W + 0.5) * nw), j = Math.floor((fz / L + 0.5) * nl);
    return (i + j) % 2 ? sh(c, ny > 0 ? 1.06 : 0.7) : sh(c, ny > 0 ? 0.86 : 0.6);
  }));
  add(p, geo, mat('#ffffff', { vc: true, metal: 0.35, rough: 0.4 }), x, y, z, 1, 1, 1, ax === 'x' ? Math.PI / 2 : 0, ax === 'x' ? tilt : 0, ax === 'z' ? tilt : 0);
}

// ---- ground painters ----------------------------------------------------------------------------------------
const grassPaint = (base: string, dark: string, f = 9): Paint => (x, _y, z) => mx(base, dark, fbm(x * f, 3.1, z * f, 3) * 1.6 - 0.35);

// =============================================================================================================
export const H_SPACE: Record<string, Builder> = {
  // Kennedy Space Center LC-39A: Saturn V on the Mobile Launcher with its red umbilical tower, steam at the pad.
  sp_ksc: batched(gp => {
    const octD = (x: number, z: number) => { const ax = Math.abs(x), az = Math.abs(z); return Math.max(ax, az, (ax + az) * 0.75); };
    const shore = (x: number) => -0.31 + Math.sin(x * 9) * 0.02;
    const h: HFn = (x, z) => 0.034 * (1 - sstep(0.21, 0.29, octD(x, z - 0.0))) + (z < shore(x) ? -0.016 * sstep(0, 0.04, shore(x) - z) : 0)
      + (Math.abs(x - 0.04) < 0.05 && z > 0.2 ? 0.034 * (1 - sstep(0.24, 0.45, z)) : 0);
    ground(gp, h, (x, y, z) => {
      if (z < shore(x) - 0.012) return mx('#2f7fb0', '#5aa4cf', fbm(x * 30, 1, z * 30, 2) * 1.4 - 0.3);
      if (z < shore(x) + 0.03) return mx('#e3d6b0', '#cdbd91', hash3(Math.floor(x * 80), 1, Math.floor(z * 80)));
      if (octD(x, z) < 0.215) return mx('#c9c7c0', '#b5b3ab', hash3(Math.floor(x * 40), 2, Math.floor(z * 40)) * 0.6);
      if (Math.abs(x - 0.04) < 0.05 && z > 0.2) return Math.abs(Math.abs(x - 0.04) - 0.025) < 0.012 ? '#d7d3c8' : '#b9b4a6';
      return y > 0.05 ? mx('#7f9a55', '#6a8445', fbm(x * 12, 1, z * 12)) : grassPaint('#86a35a', '#5f7d3e')(x, y, z, 0, 1, 0);
    }, 0.035, 30, 80);
    const padY = 0.069;
    // flame trench across the pad and the flame deflector
    box(gp, '#3a3936', 0, padY - 0.004, 0.0, 0.5, 0.006, 0.07);
    prismWedge(gp, 0.06, padY - 0.003, 0, 0.06, 0.03, 0.06, '#77736b');
    // Mobile Launcher: grey deck on six pedestals, with a square exhaust hole
    for (const [px, pz] of [[-0.16, -0.12], [-0.16, 0.12], [0.18, -0.12], [0.18, 0.12], [0.01, -0.13], [0.01, 0.13]] as P2[]) box(gp, '#8f9194', px, padY, pz, 0.03, 0.03, 0.03);
    const dk = padY + 0.03, dt = 0.035, deckTop = dk + dt, rx = 0.07, rz = 0.02, hole = 0.1;
    box(gp, '#9a9c9f', (-0.2 + rx - hole / 2) / 2, dk, 0, rx - hole / 2 + 0.2, dt, 0.32);
    box(gp, '#9a9c9f', (0.2 + rx + hole / 2) / 2, dk, 0, 0.2 - rx - hole / 2, dt, 0.32);
    box(gp, '#96989b', rx, dk, (rz - hole / 2 - 0.16) / 2, hole, dt, rz - hole / 2 + 0.16);
    box(gp, '#96989b', rx, dk, (rz + hole / 2 + 0.16) / 2, hole, dt, 0.16 - rz - hole / 2);
    for (let i = 0; i < 9; i++) box(gp, '#7d8084', -0.19 + i * 0.048, dk + dt * 0.35, 0.161, 0.006, dt * 0.5, 0.004);
    // hold-down arms
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; box(gp, '#6d7074', rx + Math.sin(a) * 0.05, deckTop, rz + Math.cos(a) * 0.05, 0.016, 0.014, 0.016, a); }
    // Saturn V
    const k = 0.0076, kr = 1.15;
    const sv = grp(gp, rx, deckTop - 5.5 * k + 0.004, rz);
    saturnV(sv, k, kr);
    // Launch Umbilical Tower (red lattice), hammerhead crane and swing arms
    const tx = -0.115, tw = 0.09, tH = 0.88, RED = '#c0412c';
    truss(gp, [tx, deckTop, rz], [tx, deckTop + tH, rz], tw, tw, 22, RED, 0.0032);
    for (let i = 1; i < 22; i += 3) box(gp, '#8a3a2c', tx, deckTop + (tH * i) / 22, rz, tw * 0.96, 0.003, tw * 0.96);
    box(gp, RED, tx + 0.03, deckTop + tH, rz, 0.17, 0.012, 0.016);
    box(gp, '#d9d3c4', tx - 0.03, deckTop + tH + 0.012, rz, 0.03, 0.02, 0.022);
    bar(gp, [tx + 0.1, deckTop + tH, rz], [tx + 0.1, deckTop + tH - 0.05, rz], 0.0012, '#333333', 3);
    const armM = [10, 30, 49, 61, 74, 84, 99];
    armM.forEach((m, i) => {
      const yy = deckTop + (m - 5.5) * k;
      const rr = (m > 96 ? 1.98 : m > 72 ? 3.32 : 5.05) * k * kr;
      swingArm(gp, [tx + tw / 2, yy, rz], [rx - rr - 0.002, yy, rz], RED, i === armM.length - 1);
    });
    // water tower at the back left + lightning mast
    const wx = -0.3, wz = -0.2;
    truss(gp, [wx, 0.035, wz], [wx, 0.33, wz], 0.03, 0.03, 8, '#9aa3ab', 0.0025, 0.6);
    plathe(gp, [[0, 0], [0.035, 0.012], [0.045, 0.04], [0.035, 0.07], [0, 0.08]], '#e6e8ea', undefined, 16, wx, 0.32, wz);
    // steam clouds billowing from both ends of the flame trench and under the deck
    cloud(gp, 0.3, 0.07, 0.0, 0.07, 9, 1, '#f4f3ef', [1.1, 0.8, 1.3]);
    cloud(gp, -0.31, 0.07, 0.02, 0.06, 7, 2, '#f1f0ec', [1.1, 0.8, 1.3]);
    cloud(gp, rx, padY + 0.01, rz, 0.05, 6, 3, '#ecebe6', [1.4, 0.4, 1.4]);
    // crawlerway edge lamps and a few palms
    palm(gp, 0.33, 0.035, 0.26, 0.09, 0.4); palm(gp, -0.36, 0.035, 0.24, 0.08, -0.3); palm(gp, 0.38, 0.035, 0.12, 0.07, 1.2);
    person(gp, 0.12, 0.069 + 0.0, 0.22, 0.02); person(gp, 0.14, 0.069, 0.23, 0.02, '#c9a227');
  }),

  // Baikonur, Gagarin's Start: a Soyuz hanging in its four support arms over the flame pit, gantry halves swung back.
  sp_baikonur: batched(gp => {
    const pitW = 0.085, B0 = 0.075;
    const pit = (x: number, z: number) => (Math.abs(x) < pitW && z > -0.07 ? (1 - sstep(0.12, 0.47, z)) * (1 - sstep(pitW - 0.03, pitW, Math.abs(x))) : 0);
    const h: HFn = (x, z) => -0.058 * pit(x, z) + (fbm(x * 6, 2, z * 6, 2) - 0.5) * 0.006;
    ground(gp, h, (x, y, z) => {
      const p0 = pit(x, z);
      if (p0 > 0.05) return mx('#8a7a68', '#5d5248', p0);
      if (Math.abs(x) < 0.17 && Math.abs(z) < 0.15) return '#b3aea3';
      if (Math.abs(x - 0.0) < 0.022 && z < -0.15) return Math.abs(Math.abs(x) - 0.012) < 0.004 ? '#5d5650' : '#9e8f78';
      return mx('#b8a77a', '#8f8a58', fbm(x * 10, 1, z * 10, 3) * 1.5 - 0.2);
    }, B0, 34, 84);
    // concrete launch table cantilevered over the pit
    const top = B0 + 0.03;
    box(gp, '#a9a59d', -0.13, B0 - 0.01, 0.0, 0.1, 0.04, 0.3); box(gp, '#a9a59d', 0.13, B0 - 0.01, 0.0, 0.1, 0.04, 0.3);
    box(gp, '#a3a097', 0, B0 - 0.01, -0.11, 0.16, 0.04, 0.08);
    box(gp, '#8e8a82', 0, top - 0.008, 0.01, 0.17, 0.008, 0.012); // ring girder over the pit mouth
    box(gp, '#8e8a82', 0, top - 0.008, -0.06, 0.17, 0.008, 0.012);
    // Soyuz
    const k = 0.0165, kr = 1.15, sy = top + 0.012;
    const s = grp(gp, 0, sy, -0.025);
    const core: P2[] = [[0, 1.4], [1.08, 1.4], [1.08, 2], [1.47, 20], [1.47, 22.5], [1.36, 27.6], [1.36, 28.8], [1.33, 29], [1.33, 35.4], [1.5, 35.8], [1.5, 42.4],
      [1.2, 44.2], [0.62, 45.6], [0.45, 45.6], [0.3, 46.4], [0, 46.6]];
    plathe(s, fine(scaleProf(core, k * kr, k), 1.2 * k), WHITE, (x, y, z) => {
      const m = y / k, a = Math.atan2(x, z);
      if (m > 27.6 && m < 29.1) return '#3c3d40';
      if (m > 35.5 && m < 36.8) return '#d4782f';
      if (m > 40.6 && m < 41.4) return '#d4782f';
      if (m > 29 && m < 35.4) return Math.abs(Math.sin(a * 2)) < 0.25 ? '#c9c9c4' : '#dcdcd6';
      if (m < 2.1) return '#5a5b5e';
      return m > 20 && m < 22.6 ? '#d9d9d3' : null;
    }, 20);
    bell(s, 0, 1.4 * k, 0, 0.7 * k * kr, 1.6 * k);
    const bprof: P2[] = [[0, 1.4], [1.34, 1.4], [1.34, 8.5], [1.0, 14], [0.55, 18.5], [0.15, 20.6], [0, 20.8]];
    boosters(s, { prof: scaleProf(bprof, k * kr, k), dist: (1.08 + 1.34) * k * kr, tilt: 0.05, n: 4, bells: 4, bellR: 0.38 * k * kr, bellH: 1.2 * k,
      paint: (x, y) => (y < 2 * k ? '#5a5b5e' : y > 18.4 * k ? '#8f9196' : x > 1.2 * k * kr * 0.9 && y < 6 * k ? '#dcdbd5' : null),
      fin: [1.3 * k * kr, 1.6 * k, 3.2 * k, 1.1 * k * kr, 1.4 * k] }, k);
    // escape tower spire with tiny grid fins
    bar(s, [0, 46.4 * k, 0], [0, 50 * k, 0], 0.0028, '#cfcfc9', 6);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; box(s, '#9b9c98', Math.sin(a) * 0.006, 44 * k, Math.cos(a) * 0.006, 0.006, 0.008, 0.002, a); }
    // four support arms ("tulip") from the pad up to the booster shoulders
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const bx = Math.sin(a), bz = Math.cos(a);
      truss(gp, [bx * 0.075, top, -0.025 + bz * 0.075], [bx * 0.04, sy + 15 * k, -0.025 + bz * 0.04], 0.014, 0.01, 5, '#c4532f', 0.0022);
    }
    // two service gantry halves swung back, and two cable masts
    for (const sx of [-1, 1]) {
      truss(gp, [sx * 0.11, top, -0.05], [sx * 0.21, top + 0.52, -0.05], 0.05, 0.035, 12, '#b9532f', 0.003, 0.65);
      box(gp, '#d8d2c6', sx * 0.2, top + 0.47, -0.05, 0.04, 0.025, 0.035);
      truss(gp, [sx * 0.08, top, -0.13], [sx * 0.08, top + 0.3, -0.13], 0.022, 0.022, 7, '#c9cbcd', 0.0022, 0.7);
    }
    // lightning masts at the edge of the steppe
    for (const [lx, lz] of [[-0.38, -0.2], [0.4, -0.16], [0.36, 0.28]] as P2[]) {
      truss(gp, [lx, B0 - 0.005, lz], [lx, 0.9, lz], 0.035, 0.035, 18, '#c96a43', 0.0022, 0.25);
      bar(gp, [lx, 0.9, lz], [lx, 0.97, lz], 0.0015, '#666666', 3);
    }
    // a little dust from the flame pit, rail track from the assembly building
    cloud(gp, 0, B0 - 0.03, 0.32, 0.06, 8, 7, '#c8b9a3', [1.0, 0.6, 1.2]);
    for (let i = 0; i < 9; i++) box(gp, '#6a5a4a', 0, B0 + 0.001, -0.18 - i * 0.034, 0.045, 0.004, 0.008);
    person(gp, 0.17, top, 0.08, 0.02, '#e07b39'); person(gp, 0.19, top, 0.05, 0.02, '#e07b39');
  }),

  // Wenchang: Long March 5 on its orange mobile platform beside the black-and-white umbilical tower; palms by the sea.
  sp_wenchang: batched(gp => {
    const shore = (x: number) => -0.28 - Math.sin(x * 7 + 1) * 0.03;
    const h: HFn = (x, z) => (z < shore(x) ? -0.016 * sstep(0, 0.05, shore(x) - z) : 0) + 0.012 * (1 - sstep(0.24, 0.3, Math.max(Math.abs(x), Math.abs(z - 0.02))));
    ground(gp, h, (x, y, z) => {
      if (z < shore(x) - 0.01) return mx('#2c86b5', '#58b0d6', fbm(x * 30, 4, z * 30, 2) * 1.4 - 0.3);
      if (z < shore(x) + 0.03) return '#e8dcb5';
      if (Math.max(Math.abs(x), Math.abs(z - 0.02)) < 0.24) return mx('#c8c6c0', '#b7b5ae', hash3(Math.floor(x * 30), 3, Math.floor(z * 30)) * 0.6);
      return grassPaint('#5f9a45', '#3f7a35', 11)(x, y, z, 0, 1, 0);
    }, 0.035, 30, 80);
    const padY = 0.047;
    // orange mobile launch platform on dark legs
    for (const [px, pz] of [[-0.14, -0.1], [-0.14, 0.12], [0.16, -0.1], [0.16, 0.12]] as P2[]) box(gp, '#3c3d40', px, padY, pz, 0.035, 0.035, 0.035);
    box(gp, '#3a3b3e', 0.01, padY + 0.035, 0.01, 0.36, 0.02, 0.28);
    box(gp, '#ef7d22', 0.01, padY + 0.055, 0.01, 0.37, 0.05, 0.29);
    for (let i = 0; i < 16; i++) bar(gp, [-0.17 + i * 0.024, padY + 0.105, 0.155], [-0.17 + i * 0.024, padY + 0.118, 0.155], 0.0012, '#f2f2f2', 3);
    bar(gp, [-0.175, padY + 0.118, 0.155], [0.195, padY + 0.118, 0.155], 0.0012, '#f2f2f2', 3);
    for (let i = 0; i < 6; i++) box(gp, '#f2f2f2', 0.2 + i * 0.008, padY + 0.035 + i * 0.012, 0.155, 0.008, 0.003, 0.03);
    const deck = padY + 0.105, rx = 0.06, rz = 0.0;
    box(gp, '#e9832c', rx, deck, rz, 0.09, 0.022, 0.09);
    // Long March 5
    const k = 0.0138, kr = 1.0, base = deck + 0.02;
    const s = grp(gp, rx, base, rz);
    const core: P2[] = [[0, 2.4], [2.5, 2.4], [2.5, 33], [2.53, 33.2], [2.53, 34.2], [2.5, 34.4], [2.5, 44.4], [2.62, 44.8], [2.62, 50], [2.45, 52.2], [1.9, 54.4],
      [1.1, 56.1], [0.4, 56.9], [0, 57]];
    plathe(s, grid(scaleProf(core, k * kr, k), 0.75 * k), WHITE, (x, y, z) => {
      const m = y / k, a = Math.atan2(x, z);
      if (m < 4) return '#a9adb2';
      if (m > 32.9 && m < 34.5) return '#b8bcc0';
      if (m > 44.3 && m < 44.9) return '#c7b37a';
      if (Math.abs(a) < 0.3 && m > 47.4 && m < 49.4) return Math.abs(a) < 0.1 && m > 48.6 ? '#f7d63b' : '#d42a20';
      if (Math.abs(a) < 0.16 && m > 22 && m < 31) return Math.floor(m / 0.75 + 1e-3) % 2 ? '#1f3f8a' : null;
      return null;
    }, 22);
    bell(s, -0.6 * k, 2.4 * k, 0, 1.0 * k, 2.4 * k); bell(s, 0.6 * k, 2.4 * k, 0, 1.0 * k, 2.4 * k);
    const bprof: P2[] = [[0, 2], [1.675, 2], [1.675, 23.5], [1.6, 24.6], [1.3, 26.6], [0.8, 28.4], [0.3, 29.5], [0, 29.7]];
    boosters(s, { prof: grid(scaleProf(bprof, k * kr, k), 0.75 * k), dist: 4.2 * k, n: 4, a0: Math.PI / 4, bells: 2, bellR: 0.55 * k, bellH: 1.8 * k,
      paint: (x, y, z) => {
        const m = y / k, out = x / Math.hypot(x, z || 1e-6);
        if (m > 3 && m < 4.3) return '#a9adb2';
        if (out > 0.7 && Math.abs(z) < 0.9 * k && m > 6 && m < 23) return Math.floor(m / 0.75) % 2 ? '#d42a20' : null;
        return null;
      }, fin: [1.6 * k, 2 * k, 5 * k, 1.5 * k, 1.2 * k] }, k);
    // umbilical tower: black lower half, white upper, orange checker stripe; four orange swing arms
    const tx = -0.1, tw = 0.07, tH = 0.62;
    const tg = new THREE.BoxGeometry(tw, tH, tw, 3, 40, 3);
    add(gp, paintFaces(tg, WHITE, (x, y, z, nx, _ny, nz) => {
      const yy = y + tH / 2, lower = yy < tH * 0.5;
      if ((nz > 0.5 && x > tw * 0.18) || (nx > 0.5 && z > tw * 0.18)) return Math.floor(yy / 0.016) % 2 ? '#ef7d22' : lower ? '#26272a' : WHITE;
      return lower ? '#2b2c2f' : (Math.floor(yy / 0.06) % 2 ? '#e9e9e5' : '#f4f4f0');
    }), mat('#ffffff', { vc: true }), tx, deck + tH / 2, rz, 1, 1, 1);
    box(gp, '#d8d8d4', tx, deck + tH, rz, tw * 0.9, 0.04, tw * 0.9);
    bar(gp, [tx, deck + tH + 0.04, rz], [tx, deck + tH + 0.12, rz], 0.002, '#7a7a7a', 4);
    for (const m of [27, 36, 43, 47, 52]) {
      const yy = base + m * k;
      swingArm(gp, [tx + tw / 2, yy, rz], [rx - 2.5 * k - 0.004, yy, rz], '#e0742a', m === 52);
    }
    // the curved umbilical hose to the top of the rocket
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6, t1 = (i + 1) / 6, P = (t: number): V3 => [tx + tw / 2 + (rx - 2.6 * k - tx - tw / 2) * t, base + 50 * k + 0.035 * Math.sin(t * Math.PI), rz];
      bar(gp, P(t0), P(t1), 0.0028, '#1f2023', 5);
    }
    // cryogenic venting
    cloud(gp, rx + 0.04, base + 30 * k, rz + 0.02, 0.025, 4, 11, '#f6f6f4', [0.8, 1.6, 0.8]);
    cloud(gp, rx, padY + 0.0, rz + 0.18, 0.05, 6, 12, '#f1f1ee', [1.4, 0.5, 0.6]);
    // fixed service tower (grey lattice) at the back and tall lightning masts
    truss(gp, [0.32, 0.035, -0.27], [0.32, 0.7, -0.27], 0.08, 0.07, 13, '#a4abb2', 0.0026);
    for (let i = 1; i < 13; i += 2) box(gp, '#c4c9ce', 0.32, 0.035 + (0.665 * i) / 13, -0.27, 0.078, 0.004, 0.068);
    for (const [lx, lz] of [[-0.32, -0.22], [0.36, 0.2]] as P2[]) {
      truss(gp, [lx, 0.035, lz], [lx, 0.95, lz], 0.03, 0.03, 16, '#d8dadc', 0.002, 0.3);
    }
    for (const [x, z, s2, l] of [[-0.36, 0.2, 0.12, 0.3], [-0.42, 0.04, 0.1, -0.4], [0.35, 0.33, 0.11, 2.2], [0.42, 0.08, 0.09, 1.0], [-0.25, 0.36, 0.1, 0.8],
      [-0.4, -0.12, 0.1, -1.2]] as [number, number, number, number][]) palm(gp, x, 0.035, z, s2, l);
    for (const [x, z] of [[-0.3, 0.3], [0.3, 0.36], [0.44, -0.04]] as P2[]) tree(gp, x, 0.035, z, 0.05, '#3f7f3c');
  }),

  // Jiuquan: Long March 2F with Shenzhou inside the blue-grey service tower's folding platforms; VAB and rails behind.
  sp_jiuquan: batched(gp => {
    const h: HFn = (x, z) => (fbm(x * 5, 9, z * 5, 3) - 0.5) * 0.008 + 0.01 * (1 - sstep(0.18, 0.24, Math.max(Math.abs(x), Math.abs(z))));
    ground(gp, h, (x, y, z) => {
      if (Math.max(Math.abs(x), Math.abs(z)) < 0.19) return mx('#c8c3b8', '#b7b1a5', hash3(Math.floor(x * 30), 5, Math.floor(z * 30)) * 0.6);
      if (Math.abs(Math.abs(z - 0.02) - 0.05) < 0.016 && x > 0.1 && x < 0.3) return '#9b8f7d';
      if (z > 0.18 && Math.abs(x + 0.02) < 0.03) return '#8a8780';
      const n = fbm(x * 14, 2, z * 14, 3);
      return hash3(Math.floor(x * 120), 0, Math.floor(z * 120)) > 0.93 ? '#8d7b63' : mx('#d6c49a', '#b9a57c', n * 1.6 - 0.3);
    }, 0.035, 30, 80);
    const padY = 0.045;
    // mobile launch platform
    box(gp, '#7d8186', 0.03, padY, 0.02, 0.2, 0.05, 0.18);
    box(gp, '#9a9ea3', 0.03, padY + 0.05, 0.02, 0.21, 0.008, 0.19);
    const deck = padY + 0.058, rx = 0.03, rz = 0.02;
    // Long March 2F / Shenzhou
    const k = 0.0141, kr = 1.2, base = deck + 0.002;
    const s = grp(gp, rx, base, rz);
    const core: P2[] = [[0, 2], [1.675, 2], [1.675, 25], [1.7, 25.2], [1.7, 26.2], [1.675, 26.4], [1.675, 37.6], [1.9, 38.6], [1.9, 44.8], [1.2, 48.6], [0.75, 49.2],
      [0.55, 50.2], [0, 50.4]];
    plathe(s, grid(scaleProf(core, k * kr, k), 0.75 * k), WHITE, (x, y, z) => {
      const m = y / k, a = Math.atan2(x, z);
      if (m < 3) return '#a9adb2';
      if (m > 24.9 && m < 26.5) return '#9da2a8';
      if (m > 44.4 && m < 45.6) return '#1f2f6b';
      if (Math.abs(a) < 0.35 && m > 40 && m < 42.4) return Math.abs(a) < 0.12 && m > 41.6 ? '#f7d63b' : '#d42a20';
      if (Math.abs(Math.abs(a) - Math.PI / 2) < 0.14 && m > 8 && m < 37) return Math.floor(m / 0.75) % 2 ? '#d42a20' : null;
      if (Math.abs(a) < 0.2 && m > 15 && m < 23) return Math.floor(m / 1.5) % 2 ? '#1f3f8a' : null;
      return null;
    }, 22);
    bell(s, 0, 2 * k, 0, 0.9 * k * kr, 2 * k);
    // escape tower with orange nozzles and four little canard fins, grid fins on the fairing
    bar(s, [0, 50.2 * k, 0], [0, 56 * k, 0], 0.0032, '#e8e8e4', 6);
    cone(s, '#e8e8e4', 0, 56 * k, 0, 0.0032, 2.2 * k, 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      cone(s, '#d0562a', Math.sin(a) * 0.006, 51.6 * k, Math.cos(a) * 0.006, 0.0022, 0.006, 6);
      box(s, WHITE, Math.sin(a) * 0.006, 54.3 * k, Math.cos(a) * 0.006, 0.006, 0.006, 0.0015, a);
      box(s, '#c5c8cc', Math.sin(a) * 0.031, 39.2 * k, Math.cos(a) * 0.031, 0.012, 0.016, 0.003, a);
    }
    const bprof: P2[] = [[0, 2], [1.125, 2], [1.125, 15.4], [0.9, 16.8], [0.45, 18.6], [0, 19.2]];
    boosters(s, { prof: grid(scaleProf(bprof, k * kr, k), 0.75 * k), dist: (1.675 + 1.125) * k * kr, n: 4, a0: Math.PI / 4, bells: 1, bellR: 0.75 * k * kr, bellH: 1.8 * k,
      paint: (x, y, z) => {
        const m = y / k, out = x / Math.hypot(x, z || 1e-6);
        if ((m > 2 && m < 3.4) || (m > 14.4 && m < 15.4)) return '#1f2f6b';
        if (out > 0.75 && Math.abs(z) < 0.5 * k * kr && m > 4 && m < 14) return Math.floor(m / 0.75) % 2 ? '#d42a20' : null;
        return null;
      }, fin: [1.05 * k * kr, 2.2 * k, 3.6 * k, 1.4 * k * kr, 1.6 * k] }, k);
    // service tower: tall teal-grey lattice with C-shaped folding work platforms wrapped around the rocket
    const tx = -0.1, tw = 0.1, tH = 0.92, TC = '#5f8a9c';
    truss(gp, [tx, padY, rz], [tx, tH, rz], tw, tw, 24, TC, 0.0032);
    for (let i = 2; i < 24; i += 3) box(gp, '#7a9fae', tx, padY + ((tH - padY) * i) / 24, rz, tw * 0.97, 0.004, tw * 0.97);
    box(gp, '#6d95a6', tx, tH, rz, tw * 1.05, 0.03, tw * 1.05);
    bar(gp, [tx, tH + 0.03, rz], [tx, tH + 0.1, rz], 0.002, '#555555', 4);
    for (const m of [12, 20, 28, 34, 40, 46]) {
      const yy = base + m * k, rr = (m > 37 ? 1.9 : 1.675) * k * kr;
      box(gp, '#dfe3e5', (tx + tw / 2 + rx - rr) / 2, yy, rz, rx - rr - tx - tw / 2, 0.006, 0.05);
      for (const sz of [-1, 1]) box(gp, '#dfe3e5', rx, yy, rz + sz * (rr + 0.012), 2 * rr + 0.012, 0.006, 0.014);
      box(gp, '#e9eaea', rx - rr - 0.006, yy + 0.006, rz, 0.004, 0.014, 2 * rr + 0.02);
    }
    // vertical assembly building beside the pad (door facing the rails), rails to the launch platform
    const vx = 0.33, vz = 0.02;
    box(gp, '#eef0f2', vx, 0.035, vz, 0.11, 0.5, 0.2);
    box(gp, '#4f7f9f', vx - 0.057, 0.035, vz, 0.004, 0.44, 0.06);
    for (let i = 0; i < 9; i++) box(gp, '#cfd5da', vx - 0.056, 0.08 + i * 0.05, vz, 0.003, 0.004, 0.2);
    box(gp, '#e3e6e8', vx, 0.535, vz, 0.115, 0.02, 0.205);
    for (const dz of [-0.05, 0.05]) for (const e of [-0.008, 0.008]) box(gp, '#5a534c', 0.2, 0.036, vz + dz + e, 0.2, 0.004, 0.003);
    // lightning masts and the colourful roadside flags from the photos
    for (const [lx, lz] of [[-0.34, -0.22], [0.34, 0.3]] as P2[]) truss(gp, [lx, 0.035, lz], [lx, 0.78, lz], 0.025, 0.025, 14, '#c7cacd', 0.0018, 0.35);
    const fc = ['#e94b3c', '#f2c12e', '#3aa655', '#3b82f6', '#e94bb0'];
    for (let i = 0; i < 9; i++) {
      for (const sx of [-1, 1]) {
        const fx = -0.02 + sx * 0.05, fz = 0.22 + i * 0.03;
        bar(gp, [fx, 0.035, fz], [fx, 0.075, fz], 0.0012, '#dddddd', 3);
        box(gp, fc[(i + (sx > 0 ? 2 : 0)) % 5], fx + sx * 0.006, 0.062, fz, 0.012, 0.012, 0.002);
      }
    }
    for (const [x, z] of [[-0.36, 0.22], [-0.42, 0.06], [0.12, -0.36]] as P2[]) tree(gp, x, 0.035, z, 0.05, '#6c8f4a');
    person(gp, 0.15, padY, 0.15, 0.02, '#2b5d9c');
  }),
  // FAST: the 500 m dish nestled in a round karst depression, six support towers holding the feed cabin on cables.
  sp_fast: batched(gp => {
    const RD = 0.335, rimY = 0.165, cap = 0.56, dep = cap - Math.sqrt(cap * cap - RD * RD), v0 = rimY - dep;
    const cones: [number, number, number, number][] = [];
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * TAU + hash3(i, 1, 1) * 0.3, d = 0.43 + hash3(i, 2, 1) * 0.06;
      cones.push([Math.sin(a) * d, Math.cos(a) * d, 0.08 + hash3(i, 3, 1) * 0.03, 0.1 + hash3(i, 4, 1) * 0.12]);
    }
    const h: HFn = (x, z) => {
      const r = Math.hypot(x, z);
      let y = r < RD + 0.01 ? v0 - 0.035 - 0.015 + (cap - Math.sqrt(Math.max(0, cap * cap - r * r))) : rimY - 0.06 + sstep(RD, 0.5, r) * 0.08;
      for (const [cx, cz, cr, ch] of cones) y = Math.max(y, rimY - 0.06 + bump(x, z, cx, cz, cr, ch + 0.04));
      return y + (fbm(x * 18, 1, z * 18, 2) - 0.5) * 0.012;
    };
    ground(gp, h, (x, y, z, _nx, ny) => {
      const r = Math.hypot(x, z);
      if (r < RD + 0.03 && y < rimY + 0.0) return '#6f6a5c';
      const n = fbm(x * 14, y * 14, z * 14, 3);
      if (ny < 0.72 && n > 0.5) return mx('#a9a59a', '#8a867c', n);
      return mx('#4f8a3c', '#2f6430', n * 1.7 - 0.35);
    }, 0.035, 40, 96, 0.5, yy => (yy > 0.12 ? '#7a6a52' : '#5b4a38'));
    // dish surface and ring beam on columns
    const d = grp(gp, 0, v0, 0);
    dish(d, RD, dep, '#d9dde0', 9, 48, 0.006, '#9aa0a4', cap);
    const N = 40;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, a2 = ((i + 1) / N) * TAU;
      const P = (aa: number, rr: number, yy: number): V3 => [Math.sin(aa) * rr, yy, Math.cos(aa) * rr];
      bar(gp, P(a, RD + 0.006, rimY + 0.004), P(a2, RD + 0.006, rimY + 0.004), 0.004, '#f2f3f3', 4);
      bar(gp, P(a, RD + 0.016, rimY + 0.001), P(a2, RD + 0.016, rimY + 0.001), 0.003, '#e6e8e9', 4);
      bar(gp, P(a, RD + 0.006, rimY + 0.004), P(a2, RD + 0.016, rimY + 0.001), 0.0018, '#e6e8e9', 3);
      if (i % 2 === 0) bar(gp, P(a, RD + 0.01, rimY), P(a, RD + 0.01, rimY - 0.07), 0.004, '#e0e2e3', 5);
    }
    // feed cabin suspended by six cables from six lattice towers on the surrounding hills
    const cab: V3 = [0, rimY + 0.13, 0];
    cyl(gp, '#eceeef', 0, cab[1] - 0.012, 0, 0.026, 0.024, 6);
    cyl(gp, '#9aa1a6', 0, cab[1] - 0.02, 0, 0.018, 0.008, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26, tr = 0.43, tx = Math.sin(a) * tr, tz = Math.cos(a) * tr;
      const gy = 0.035 + h(tx, tz) - 0.01, top = rimY + 0.2;
      truss(gp, [tx, gy, tz], [tx, top, tz], 0.036, 0.036, Math.round((top - gy) / 0.025), '#dfe2e4', 0.0022, 0.45);
      bar(gp, [tx, top, tz], [tx, top + 0.02, tz], 0.0015, '#888888', 3);
      bar(gp, [tx, top - 0.004, tz], [Math.sin(a) * 0.026, cab[1], Math.cos(a) * 0.026], 0.0016, '#3a3d40', 4);
      bar(gp, [tx * 0.9, 0.035 + h(tx * 0.9, tz * 0.9), tz * 0.9], [Math.sin(a) * 0.12, rimY + 0.07, Math.cos(a) * 0.12], 0.0009, '#5a5d60', 3);
    }
    // tiny visitors' viewing platform on one hill
    box(gp, '#c9c2b0', -0.3, 0.035 + h(-0.3, 0.33), 0.33, 0.06, 0.012, 0.04);
    person(gp, -0.3, 0.047 + h(-0.3, 0.33), 0.33, 0.016, '#d9433b');
  }),

  // ALMA: white 12 m antennas on the red-brown Chajnantor plateau, a 28-wheel transporter and Licancabur behind.
  sp_alma: batched(gp => {
    const h: HFn = (x, z) => bump(x, z, -0.12, -0.42, 0.3, 0.3) + bump(x, z, 0.25, -0.46, 0.2, 0.12) + (fbm(x * 8, 4, z * 8, 3) - 0.5) * 0.012;
    ground(gp, h, (x, y, z, _nx, ny) => {
      const n = fbm(x * 16, y * 10, z * 16, 3);
      if (y > 0.29) return mx('#f3f1ec', '#d9d7d2', n);
      if (y > 0.07) return ny < 0.8 ? mx('#7b4f3a', '#5f3f30', n) : mx('#8d5d42', '#6f4a36', n);
      if (Math.abs(z - 0.06 - x * 0.2) < 0.018) return '#a98f78';
      return hash3(Math.floor(x * 140), 2, Math.floor(z * 140)) > 0.94 ? '#5e4232' : mx('#a46d4c', '#8a5a40', n * 1.5 - 0.2);
    }, 0.035, 36, 90);
    const spots: [number, number, number][] = [[0.04, 0.16, 0.12], [-0.22, 0.02, 0.07], [0.24, -0.04, 0.07], [-0.03, -0.14, 0.065], [0.19, -0.24, 0.055], [-0.33, -0.18, 0.05], [0.36, 0.12, 0.055]];
    for (const [x, z, sc] of spots) antenna(gp, x, 0.035 + h(x, z), z, sc, 0.5, 0.55, 'alma');
    // transporter "Otto" carrying an antenna pad
    const tq = grp(gp, -0.2, 0.035 + h(-0.2, 0.28), 0.28, 0.3);
    box(tq, '#f2c230', 0, 0.018, 0, 0.18, 0.02, 0.09);
    box(tq, '#e6b42a', 0.1, 0.018, 0, 0.03, 0.045, 0.1);
    box(tq, '#2a2c30', 0.11, 0.045, 0, 0.022, 0.016, 0.08);
    for (let i = 0; i < 7; i++) for (const sz of [-1, 1]) cyl(tq, '#1f2124', -0.075 + i * 0.026, 0.003, sz * 0.047, 0.012, 0.018, 8).rotation.x = Math.PI / 2;
  }),

  // Mauna Kea: shiny domes along the red cinder summit, high above a sea of clouds.
  sp_maunakea: batched(gp => {
    const h: HFn = (x, z) => 0.13 * (1 - sstep(0.12, 0.5, Math.hypot(x * 0.9, z + 0.05))) + bump(x, z, -0.2, -0.18, 0.16, 0.06) + bump(x, z, 0.26, 0.1, 0.13, 0.045)
      + bump(x, z, 0.05, 0.3, 0.12, 0.03) + (fbm(x * 9, 1, z * 9, 3) - 0.5) * 0.02;
    ground(gp, h, (x, y, z, _nx, ny) => {
      const n = fbm(x * 18, y * 12, z * 18, 3);
      if (Math.abs(z - 0.06 + Math.sin(x * 6) * 0.04) < 0.012 && Math.abs(x) < 0.4) return '#7a6e66';
      if (ny < 0.85) return mx('#6e3a2a', '#4f2b22', n);
      return mx('#9a5a3e', '#7a4433', n * 1.5 - 0.25);
    }, 0.06, 36, 90, 0.5, yy => (yy > 0.035 ? '#5a3a2c' : '#3f2a20'));
    const y = (x: number, z: number) => 0.06 + h(x, z) - 0.004;
    // Keck I & II, Subaru, Gemini North, CFHT, UKIRT, UH 2.2 m
    obsDome(gp, -0.12, y(-0.12, -0.02), -0.02, 0.085, 0.08, '#f4f5f5', 0.5, { open: true });
    obsDome(gp, 0.07, y(0.07, -0.08), -0.08, 0.085, 0.08, '#f2f3f3', 0.5);
    box(gp, '#e9ebeb', -0.025, y(-0.025, -0.05) - 0.004, -0.05, 0.13, 0.055, 0.055, 0.3);
    const sx = 0.22, sz = -0.18;
    cyl(gp, '#c9cdd1', sx, y(sx, sz) - 0.004, sz, 0.065, 0.13, 24).material = mat('#c9cdd1', { metal: 0.45, rough: 0.3 });
    lathe(gp, [[0, 0.0], [0.066, 0.0], [0.06, 0.024], [0, 0.03]], '#bfc4c8', sx, y(sx, sz) + 0.126, sz, 24);
    box(gp, '#9ea4a9', sx, y(sx, sz) + 0.03, sz + 0.06, 0.034, 0.095, 0.012);
    obsDome(gp, -0.3, y(-0.3, 0.12), 0.12, 0.065, 0.055, '#d4d8dc', 0.9, { silver: true, open: true });
    obsDome(gp, 0.27, y(0.27, 0.1), 0.1, 0.06, 0.085, '#f6f6f4', -0.3);
    obsDome(gp, -0.24, y(-0.24, -0.26), -0.26, 0.048, 0.045, '#eef0f0', 1.2);
    obsDome(gp, 0.06, y(0.06, 0.22), 0.22, 0.042, 0.04, '#f1f2f2', 0.2);
    // summit road with a parked car, and the sea of clouds around the mountain's flank
    box(gp, '#d9433b', 0.13, y(0.13, 0.08), 0.08, 0.03, 0.012, 0.016, 0.3);
    box(gp, '#2a2e33', 0.13, y(0.13, 0.08) + 0.012, 0.08, 0.018, 0.008, 0.015, 0.3);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + hash3(i, 9, 1) * 0.15;
      if (Math.sin(a * 2 + 1) < -0.6) continue;
      const rr = 0.5 + hash3(i, 9, 2) * 0.03, s = 0.05 + hash3(i, 9, 3) * 0.03;
      const q = grp(gp, Math.sin(a) * rr, 0.03 + hash3(i, 9, 4) * 0.012, Math.cos(a) * rr, a);
      puff(q, 0, 0, 0, s, '#f7f8fa', 0.32);
      puff(q, s * 0.8, -0.004, 0.01, s * 0.7, '#eef0f3', 0.36);
    }
  }),

  // Very Large Array: white dishes along railway arms in a Y on the New Mexico plain, with the antenna barn.
  sp_vla: batched(gp => {
    const h: HFn = (x, z) => {
      const r = Math.hypot(x, z), a = Math.atan2(x, z);
      return sstep(0.36, 0.5, r) * (0.04 + 0.05 * fbm(Math.cos(a) * 3, 2, Math.sin(a) * 3, 3)) * (z < 0 ? 1 : 0.35) + (fbm(x * 9, 5, z * 9, 2) - 0.5) * 0.006;
    };
    const arms = [Math.PI, Math.PI / 3, -Math.PI / 3].map(a => a + 0.15);
    const onArm = (x: number, z: number) => arms.some(a => {
      const t = x * Math.sin(a) + z * Math.cos(a), off = -x * Math.cos(a) + z * Math.sin(a);
      return t > 0 && Math.abs(off) < 0.012;
    });
    ground(gp, h, (x, y, z, _nx, ny) => {
      const n = fbm(x * 15, y * 9, z * 15, 3);
      if (Math.hypot(x, z) < 0.42 && onArm(x, z)) return '#a49276';
      if (y > 0.06) return ny < 0.85 ? mx('#8a7a68', '#6a5c4e', n) : mx('#9f8f6e', '#7f7058', n);
      return mx('#c9b47e', '#a99a62', n * 1.6 - 0.3);
    }, 0.035, 34, 90);
    for (const a of arms) {
      const sa = Math.sin(a), ca = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
      for (const off of [-0.005, 0.005]) bar(gp, [px * off, 0.037, pz * off], [sa * 0.44 + px * off, 0.037, ca * 0.44 + pz * off], 0.0012, '#5a5048', 3);
      for (let i = 1; i < 22; i++) box(gp, '#6a5a48', sa * i * 0.02, 0.0352, ca * i * 0.02, 0.016, 0.0015, 0.004, a);
      for (const t of [0.11, 0.25, 0.39]) antenna(gp, sa * t, 0.035, ca * t, 0.056, 0.4, 0.75, 'vla');
    }
    antenna(gp, 0.05, 0.035, 0.04, 0.056, 0.4, 0.75, 'vla');
    // antenna assembly barn and a transporter near the hub
    const bx = -0.18, bz = 0.24;
    box(gp, '#e6e2d8', bx, 0.035, bz, 0.13, 0.08, 0.09, 0.5);
    gable(gp, 0.13, 0.03, 0.09, '#b4b0a8', bx, 0.115, bz, 0.5);
    box(gp, '#8f9aa3', bx + Math.sin(0.5 + Math.PI / 2) * 0.066, 0.035, bz + Math.cos(0.5 + Math.PI / 2) * 0.066, 0.005, 0.06, 0.05, 0.5);
    for (const [x, z] of [[0.33, 0.25], [0.38, -0.05], [-0.36, 0.08], [0.12, 0.42], [-0.05, 0.44]] as P2[]) {
      cyl(gp, '#6f8a4a', x, 0.035, z, 0.012, 0.012, 7); cyl(gp, '#7c9654', x + 0.01, 0.035, z + 0.006, 0.008, 0.01, 7);
    }
  }),

  // Jodrell Bank: the white Lovell dish tilted between its two lattice towers on a circular rail track.
  sp_jodrell: batched(gp => {
    ground(gp, () => 0, (x, y, z) => {
      const r = Math.hypot(x, z);
      if (Math.abs(r - 0.33) < 0.012) return Math.abs(r - 0.33) < 0.004 ? '#5d5a55' : '#a8a49b';
      if (r < 0.06) return '#a8a49b';
      if (Math.abs(x + 0.02) < 0.02 && z > 0.33) return '#bdb6a6';
      return grassPaint('#6fa04a', '#4e8236', 10)(x, y, z, 0, 1, 0);
    }, 0.035, 30, 96);
    const RD = 0.3, depth = 0.11, AX = 0.42, el = 0.75;
    // two towers: A-frames rising to the elevation bearings, braced by lattice, with cabins on top
    const W = '#f2f3f2';
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.33, x1 = sx * 0.345;
      for (const sz of [-1, 1]) truss(gp, [x0, 0.04, sz * 0.24], [x1, AX, sz * 0.015], 0.03, 0.022, 12, W, 0.0026, 0.7);
      truss(gp, [x0, 0.04, 0], [x1, AX, 0], 0.026, 0.022, 11, W, 0.0022, 0.7);
      for (const yy of [0.14, 0.26]) truss(gp, [x0, yy, -0.24 * (1 - (yy - 0.04) / 0.38) + 0.01], [x0, yy, 0.24 * (1 - (yy - 0.04) / 0.38) - 0.01], 0.014, 0.014, 4, W, 0.002);
      box(gp, W, x1 + sx * 0.008, AX - 0.04, 0, 0.05, 0.07, 0.06);
      for (let i = 0; i < 3; i++) box(gp, '#2e3b4a', x1 + sx * 0.034, AX - 0.03 + i * 0.018, 0, 0.002, 0.008, 0.04);
      for (const sz of [-1, 1]) box(gp, '#5f6368', x0, 0.035, sz * 0.24, 0.035, 0.016, 0.03);
      box(gp, '#5f6368', x0, 0.035, 0, 0.03, 0.014, 0.03);
    }
    // the dish: rotates about the bearing axis (x), with its feed mast, back cradle and the semicircular racks
    const dq = grp(gp, 0, AX, 0, 0, el);
    const v = -0.055;
    const dm = dish(dq, RD, depth, '#f4f5f4', 8, 40, 0.008, '#c7cacc');
    dm.position.y = v;
    bar(dq, [-0.35, 0, 0], [0.35, 0, 0], 0.012, '#d9dbdc', 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      bar(dq, [Math.sin(a) * RD * 0.98, v + depth - 0.006, Math.cos(a) * RD * 0.98], [Math.sin(a) * 0.05, v - 0.07, Math.cos(a) * 0.05], 0.003, '#d2d5d7', 4);
    }
    truss(dq, [0, v - 0.07, 0], [0, v + 0.002, 0], 0.08, 0.08, 2, '#d8dadb', 0.003);
    truss(dq, [0, v, 0], [0, v + 0.2, 0], 0.016, 0.016, 7, '#f0f1f1', 0.0018, 0.6);
    box(dq, W, 0, v + 0.2, 0, 0.022, 0.022, 0.022);
    for (const sx of [-1, 1]) {
      const tg = new THREE.TorusGeometry(0.15, 0.007, 4, 18, Math.PI);
      const m = add(dq, tg, mat('#d6d8d9'), sx * 0.2, v - 0.0, 0, 1, 1, 1, Math.PI / 2, 0, Math.PI);
      m.rotation.set(0, Math.PI / 2, Math.PI);
    }
    // visitor centre path and trees
    for (const [x, z, s2] of [[-0.42, 0.18, 0.06], [-0.38, 0.3, 0.05], [0.42, 0.2, 0.06], [0.4, -0.25, 0.055], [-0.4, -0.22, 0.06], [0.2, 0.42, 0.05]] as [number, number, number][]) tree(gp, x, 0.035, z, s2, '#3f7a3a');
    person(gp, -0.02, 0.035, 0.38, 0.018); person(gp, 0.0, 0.035, 0.4, 0.018, '#c9432b');
  }),
  // CERN: the wooden Globe of Science and Innovation with its steel ribbon sculpture, Science Gateway tubes,
  // lab blocks under the Jura — and a cutaway in the ground showing the LHC tunnel with a blue dipole magnet.
  sp_cern: batched(gp => {
    const B = 0.12;
    const h: HFn = (x, z) => bump(x, z, -0.25, -0.62, 0.42, 0.16) + bump(x, z, 0.2, -0.66, 0.4, 0.12) + (fbm(x * 9, 2, z * 9, 2) - 0.5) * 0.006;
    ground(gp, h, (x, y, z) => {
      const r = Math.hypot(x, z), a = Math.atan2(x, z);
      if (Math.abs(z - 0.08 - x * 0.05) < 0.035) return Math.abs(z - 0.08 - x * 0.05) < 0.003 ? '#e8e4d8' : '#6d6f72';
      if (y > B + 0.03) return mx('#6f8a5a', '#55704a', fbm(x * 12, y * 9, z * 12, 2));
      if (Math.abs(r - 0.36) < 0.006 && Math.floor(((a + Math.PI) / TAU) * 64) % 2 === 0) return '#e9e6dc';
      if (Math.hypot(x + 0.13, z - 0.27) < 0.19) return mx('#c9c3b2', '#b9b3a2', fbm(x * 30, 1, z * 30, 2));
      return grassPaint('#76a352', '#568a3e', 11)(x, y, z, 0, 1, 0);
    }, B, 30, 90, 0.5, yy => ['#6b4f3a', '#5a4130', '#7a5a40', '#4f3a2b'][Math.floor(yy * 40) % 4]);
    // LHC cutaway on the front-right flank: tunnel mouth with the blue dipole magnet and its two beam pipes
    const ta = -0.32, tq = radial(gp, 0, 0, ta, 0.494, 0.054), tt = grp(tq, 0, 0, 0, 0, 0, -Math.PI / 2);
    cyl(tt, '#1d1f24', 0, -0.02, 0, 0.046, 0.024, 20);
    lathe(tt, [[0.045, 0.0], [0.056, 0.0], [0.056, 0.008], [0.045, 0.008]], '#d2cfc6', 0, 0.0, 0, 20);
    box(tt, '#8d8a82', 0.034, -0.02, 0, 0.012, 0.03, 0.07);
    const mag = cyl(tt, '#2f6fd1', -0.006, -0.03, 0, 0.026, 0.05, 16);
    mag.material = mat('#2f6fd1', { metal: 0.3, rough: 0.35 });
    for (const s of [-1, 1]) cyl(tt, '#d9dcdf', -0.006, 0.02, s * 0.01, 0.007, 0.006, 8);
    for (const s of [-1, 1]) box(tt, '#e0e2e4', -0.006, -0.03, s * 0.026, 0.004, 0.05, 0.004);
    // Globe of Science and Innovation: wooden slatted dome on a glass ring
    const Rg = 0.15, gx = -0.13, gz = 0.27, gy = B;
    cyl(gp, '#3a4a55', gx, gy, gz, 0.137, 0.016, 32);
    const yc = 0.0525, a0 = -Math.asin(yc / Rg), prof: P2[] = [[0, 0.016], [Math.cos(a0) * Rg * 0.94, 0.016]];
    for (let i = 0; i <= 22; i++) { const a = a0 + (i / 22) * (Math.PI / 2 - a0); prof.push([Math.cos(a) * Rg, 0.016 + yc + Math.sin(a) * Rg]); }
    plathe(gp, prof, '#8a5530', (px, py, pz) => {
      const ph = Math.atan2(px, pz), rib = Math.abs(((ph / TAU) * 18 + 10) % 1 - 0.5) < 0.045;
      if (rib && py > 0.03) return '#5e3a22';
      if (py > 0.03 && py < 0.07 && Math.abs(Math.sin(ph * 3 + 0.4)) > 0.86) return '#2a2f35';
      return Math.floor(py * 130) % 2 ? '#8f5a33' : '#764628';
    }, 36, gx, gy, gz, { rough: 0.8 });
    // "Wandering the immeasurable": a twisting steel ribbon loop
    const rb = grp(gp, 0.06, B + 0.07, 0.35, 0.5);
    const tg = new THREE.TorusGeometry(0.065, 0.005, 6, 28);
    const steel = mat('#cfd3d6', { metal: 0.75, rough: 0.25 });
    add(rb, tg, steel, 0, 0, 0, 1, 1, 4.2, 0, 0, 0.2);
    add(rb, tg, steel, 0.02, -0.012, 0, 0.62, 0.62, 3.2, 0.9, 0.2, 0);
    // flagpole
    bar(gp, [0.02, B, 0.17], [0.02, B + 0.3, 0.17], 0.0025, '#dcdfe1', 5);
    box(gp, '#d63a2e', 0.02 + 0.03, B + 0.255, 0.17, 0.06, 0.04, 0.003);
    box(gp, '#f1c232', 0.02 + 0.045, B + 0.255, 0.1715, 0.03, 0.04, 0.003);
    // Science Gateway: raised tubes with solar-panelled roofs, one bridging the road
    const tube = (cx: number, cy: number, cz: number, L: number, r: number, ry: number) => {
      const q = grp(gp, cx, cy, cz, ry);
      const t1 = cyl(q, '#e9ebec', 0, 0, 0, r, L, 18); t1.position.set(0, 0, 0); t1.rotation.z = Math.PI / 2;
      const t2 = cyl(q, '#2f3a45', 0, 0, 0, r * 0.82, L + 0.004, 14); t2.position.set(0, -r * 0.05, 0); t2.rotation.z = Math.PI / 2;
      box(q, '#1d3f73', 0, r * 0.82, 0, L * 0.96, 0.004, r * 1.6);
      for (let i = 0; i < 6; i++) box(q, '#5a7fa8', -L * 0.45 + (i / 5) * L * 0.9, r * 0.82 + 0.004, 0, 0.002, 0.001, r * 1.6);
      for (const s of [-0.35, 0, 0.35]) bar(gp, [cx + Math.cos(ry) * s * L, B, cz - Math.sin(ry) * s * L], [cx + Math.cos(ry) * s * L, cy - r, cz - Math.sin(ry) * s * L], 0.004, '#9da3a8', 5);
    };
    tube(-0.24, B + 0.075, -0.12, 0.3, 0.038, 0.1);
    tube(-0.16, B + 0.075, -0.25, 0.26, 0.034, 0.1);
    tube(-0.36, B + 0.09, 0.08, 0.2, 0.03, Math.PI / 2 - 0.05);
    // lab buildings: white blocks with ribbon windows
    const bld = (x: number, z: number, w: number, hh: number, d: number, ry: number, c = '#eeece6') => {
      const q = grp(gp, x, B, z, ry);
      box(q, c, 0, 0, 0, w, hh, d);
      for (let y = 0.012; y < hh - 0.008; y += 0.02) {
        box(q, '#3d5a78', 0, y, d / 2, w * 0.92, 0.008, 0.003);
        box(q, '#3d5a78', 0, y, -d / 2 - 0.003, w * 0.92, 0.008, 0.003);
      }
      box(q, sh(c, 0.85), 0, hh, 0, w + 0.004, 0.006, d + 0.004);
    };
    bld(0.24, -0.12, 0.2, 0.07, 0.09, -0.12);
    bld(0.34, 0.06, 0.09, 0.05, 0.14, -0.12, '#e4e0d6');
    bld(0.06, -0.22, 0.12, 0.09, 0.08, -0.12);
    // ATLAS-style surface hall over a shaft, with a crane gantry
    box(gp, '#d8d2c2', 0.26, B, 0.22, 0.12, 0.06, 0.08, -0.1);
    gable(gp, 0.12, 0.025, 0.08, '#8c9298', 0.26, B + 0.06, 0.22, -0.1);
    box(gp, '#2f6fd1', 0.26 + 0.004, B + 0.02, 0.22 + 0.041, 0.07, 0.025, 0.002, -0.1);
    // trams on the road and trees
    box(gp, '#e7e4dc', 0.06, B, 0.085, 0.12, 0.024, 0.024, -0.05);
    box(gp, '#d63a2e', 0.06, B + 0.012, 0.085, 0.121, 0.005, 0.025, -0.05);
    box(gp, '#36495a', 0.06, B + 0.015, 0.085, 0.122, 0.006, 0.0255, -0.05);
    for (const [x, z, s] of [[-0.4, -0.15, 0.06], [0.42, -0.18, 0.055], [0.15, 0.4, 0.05], [-0.36, 0.28, 0.05], [0.08, -0.4, 0.06], [-0.05, -0.36, 0.05]] as [number, number, number][]) tree(gp, x, B + h(x, z), z, s, '#4f8a42');
    person(gp, -0.02, B, 0.36, 0.018, '#2b5d9c'); person(gp, 0.0, B, 0.4, 0.018, '#e0a12b');
  }),

  // Royal Observatory Greenwich: Flamsteed House with its red time-ball, the onion-domed Great Equatorial
  // building, the brass prime meridian in the courtyard, the bronze planetarium cone and the park sloping north.
  sp_greenwich: batched(gp => {
    const h: HFn = (x, z) => 0.11 * (1 - sstep(-0.02, 0.36, z + 0.04 * Math.cos(x * 4))) + (fbm(x * 8, 7, z * 8, 2) - 0.5) * 0.008;
    const MX = 0.0;
    ground(gp, h, (x, y, z, _nx, ny) => {
      if (Math.abs(x - MX) < 0.005 && z > -0.22 && z < 0.0) return '#d8b24a';
      if (z < -0.0 && z > -0.2 && x > -0.32 && x < 0.32) return mx('#cbc3b0', '#b8b09c', fbm(x * 40, 1, z * 40, 2));
      if (Math.abs(z - 0.18 + Math.abs(x - 0.1) * 0.9) < 0.012 && x > -0.2) return '#d9cfb6';
      if (ny < 0.9) return grassPaint('#5f9442', '#467a33', 12)(x, y, z, 0, 1, 0);
      return grassPaint('#6ea54c', '#4f8a3a', 10)(x, y, z, 0, 1, 0);
    }, 0.035, 34, 90);
    const T = 0.035 + 0.11;
    const BR = '#a9483a', ST = '#efe9dc', LD = '#4d5560';
    // Flamsteed House (1676): red brick, white stone dressings, raised Octagon Room with two cupola turrets
    const f = grp(gp, -0.17, T - 0.004, -0.2);
    box(f, BR, 0, 0, 0, 0.22, 0.075, 0.09);
    box(f, ST, 0, 0.075, 0, 0.226, 0.006, 0.096);
    box(f, BR, 0, 0.081, 0, 0.11, 0.05, 0.08);
    box(f, ST, 0, 0.131, 0, 0.116, 0.006, 0.086);
    for (const sx of [-1, 1]) for (const xx of [0.108, 0.053]) box(f, ST, sx * xx, 0, 0.0455, 0.008, 0.075, 0.003);
    for (let i = 0; i < 7; i++) {
      const xx = -0.09 + i * 0.03;
      box(f, '#2b3138', xx, 0.016, 0.046, 0.012, 0.03, 0.002);
      box(f, ST, xx, 0.046, 0.046, 0.016, 0.004, 0.002);
    }
    for (let i = 0; i < 3; i++) box(f, '#2b3138', -0.03 + i * 0.03, 0.092, 0.041, 0.014, 0.03, 0.002);
    for (const sx of [-1, 1]) {
      cyl(f, BR, sx * 0.045, 0.137, -0.01, 0.014, 0.03, 8);
      lathe(f, [[0, 0], [0.017, 0], [0.015, 0.008], [0.008, 0.016], [0, 0.026]], LD, sx * 0.045, 0.167, -0.01, 8);
    }
    // time ball mast on the east turret, ball half-raised
    bar(f, [0.045, 0.19, -0.01], [0.045, 0.28, -0.01], 0.002, '#3a3f45', 4);
    for (const yy of [0.215, 0.255]) bar(f, [0.03, yy, -0.01], [0.06, yy, -0.01], 0.0012, '#3a3f45', 3);
    add(f, PUFF(), mat('#d32f2a', { metal: 0.2, rough: 0.35 }), 0.045, 0.248, -0.01, 0.016, 0.016, 0.016);
    // Meridian building (long, low) with the Great Equatorial onion dome at its east end
    const m = grp(gp, 0.14, T - 0.004, -0.24);
    box(m, BR, 0, 0, 0, 0.32, 0.055, 0.08);
    box(m, ST, 0, 0.055, 0, 0.326, 0.006, 0.086);
    gable(m, 0.3, 0.02, 0.07, LD, 0, 0.061, 0);
    for (let i = 0; i < 8; i++) box(m, '#2b3138', -0.14 + i * 0.04, 0.014, 0.0405, 0.014, 0.026, 0.002);
    box(m, '#2b3138', MX - 0.14, 0.0, 0.0405, 0.02, 0.04, 0.003);
    const ox = 0.09;
    cyl(m, BR, ox, 0.06, 0, 0.055, 0.05, 8);
    cyl(m, ST, ox, 0.11, 0, 0.058, 0.006, 8);
    const onion: P2[] = [[0.054, 0], [0.066, 0.02], [0.068, 0.04], [0.058, 0.065], [0.035, 0.088], [0.012, 0.103], [0.004, 0.112], [0.002, 0.128], [0, 0.13]];
    plathe(m, fine(onion, 0.008), '#3f3832', (px, _py, pz) => (Math.abs(((Math.atan2(px, pz) / TAU) * 16 + 10) % 1 - 0.5) < 0.06 ? '#56504a' : null), 32, ox, 0.116, 0, { metal: 0.3, rough: 0.45 });
    // Altazimuth Pavilion: small silver dome
    obsDome(gp, -0.36, T - 0.004, -0.06, 0.035, 0.03, '#cfd4d8', 0.6, { silver: true });
    // brass meridian strip and the visitors straddling it
    box(gp, '#e2bd55', MX, T - 0.001, -0.11, 0.006, 0.003, 0.2).material = mat('#e2bd55', { metal: 0.7, rough: 0.3 });
    person(gp, MX - 0.012, T, -0.1, 0.022, '#2b5d9c'); person(gp, MX + 0.014, T, -0.06, 0.022, '#c9432b'); person(gp, MX - 0.03, T, -0.04, 0.02, '#3b8a5a');
    // the green meridian laser beamed north over the park
    rod(gp, [MX, T + 0.09, -0.2], [MX, T - 0.03, 0.49], 0.0016, '#7dff6a', 4).material = mat('#7dff6a', { emissive: '#4dff3a' });
    // Peter Harrison Planetarium: bronze cone tilted towards the pole, with a glass-disc top
    const pq = grp(gp, 0.22, T - 0.02, -0.03, 0, 0.55);
    lathe(pq, [[0, 0], [0.06, 0], [0.036, 0.085], [0, 0.085]], '#c08a4c', 0, 0, 0, 20).material = mat('#c08a4c', { metal: 0.45, rough: 0.4 });
    cyl(pq, '#3c5872', 0, 0.085, 0, 0.035, 0.003, 20);
    // park trees down the slope
    for (const [x, z, s] of [[-0.36, 0.2, 0.08], [-0.22, 0.34, 0.07], [0.36, 0.3, 0.075], [0.3, 0.14, 0.065], [-0.4, 0.02, 0.06], [0.42, -0.1, 0.06], [-0.1, 0.42, 0.06], [0.16, 0.4, 0.06]] as [number, number, number][]) tree(gp, x, 0.035 + h(x, z) - 0.004, z, s, '#3f7a3a');
  }),

  // Meteor Crater, Arizona: a 1.2 km bowl with a squarish raised rim, layered walls and the visitor centre on the north rim.
  sp_meteorcrater: batched(gp => {
    const RC = 0.3;
    const h: HFn = (x, z) => {
      const th = Math.atan2(x, z), r = Math.hypot(x, z) * (1 + 0.07 * Math.cos(4 * th + 0.4)), u = r / RC;
      const n = (fbm(x * 10, 3, z * 10, 3) - 0.5) * 0.014;
      if (u < 0.92) return 0.0 + 0.105 * (u / 0.92) ** 2.2 + n * 0.6;
      if (u < 1) return 0.105 + 0.025 * Math.sin(((u - 0.92) / 0.08) * Math.PI / 2) + n;
      return 0.04 + 0.09 * Math.exp(-(((u - 1) / 0.32) ** 2) * 3) + n;
    };
    const B = 0.06;
    ground(gp, h, (x, y, z, _nx, ny) => {
      const r = Math.hypot(x, z), n = fbm(x * 18, y * 30, z * 18, 3);
      if (r < RC * 0.25 && ny > 0.9) return mx('#b9a888', '#a6977a', n);
      if (r < RC * 1.05 && ny < 0.86) {
        const band = Math.floor((y - B) * 70 + n * 1.5);
        return ['#e7dcc4', '#d9c7a4', '#c98f62', '#e2d3b4', '#b9744e'][((band % 5) + 5) % 5];
      }
      if (r < RC * 1.12) return mx('#e1cfaa', '#cdb88f', n);
      if (hash3(Math.floor(x * 120), 4, Math.floor(z * 120)) > 0.93) return '#7f8a5a';
      return mx('#cfa772', '#b98d5c', n * 1.5 - 0.25);
    }, B, 44, 110, 0.5, yy => (yy > 0.03 ? '#b07a52' : '#8c5c3c'));
    // ejecta boulders around the rim
    for (let i = 0; i < 26; i++) {
      const a = hash3(i, 5, 1) * TAU, d = RC * (1.08 + hash3(i, 5, 2) * 0.4), x = Math.sin(a) * d, z = Math.cos(a) * d;
      const s = 0.008 + hash3(i, 5, 3) * 0.014;
      box(gp, mx('#d8c7a2', '#b88a5e', hash3(i, 5, 4)), x, B + h(x, z) - s * 0.3, z, s * 1.4, s, s * 1.1, hash3(i, 5, 5) * 3, 0.2, 0.1);
    }
    // visitor centre terraced into the north (back) rim, with viewing decks and the access road
    const vz = -0.355, vy = B + h(0.02, vz);
    const v = grp(gp, 0.02, vy - 0.03, vz);
    box(v, '#c7a57a', 0, 0, -0.02, 0.2, 0.05, 0.06);
    box(v, '#d3b388', 0, 0, 0.03, 0.15, 0.035, 0.05);
    for (let i = 0; i < 6; i++) box(v, '#3a3f45', -0.06 + i * 0.024, 0.012, 0.0555, 0.016, 0.014, 0.002);
    box(v, '#9a7b58', 0, 0.035, 0.035, 0.16, 0.004, 0.06);
    for (let i = 0; i < 9; i++) bar(v, [-0.075 + i * 0.019, 0.039, 0.064], [-0.075 + i * 0.019, 0.05, 0.064], 0.001, '#4a4f55', 3);
    bar(v, [-0.075, 0.05, 0.064], [0.077, 0.05, 0.064], 0.001, '#4a4f55', 3);
    bar(v, [0.08, 0.05, -0.04], [0.08, 0.15, -0.04], 0.0018, '#d9dcde', 4);
    box(v, '#2b5d9c', 0.104, 0.12, -0.04, 0.045, 0.026, 0.002);
    box(v, '#d63a2e', 0.104, 0.124, -0.0388, 0.045, 0.004, 0.002);
    box(v, '#f2f2f2', 0.104, 0.132, -0.0388, 0.045, 0.004, 0.002);
    for (let i = 0; i < 4; i++) person(gp, -0.04 + i * 0.03, vy + 0.008, vz + 0.07, 0.016, ['#2b5d9c', '#c9432b', '#3b8a5a', '#e0a12b'][i]);
    // road curving away on the plain and a parked car
    for (let i = 0; i < 10; i++) {
      const t = i / 9, x = 0.12 + t * 0.3, z = -0.36 + Math.sin(t * 2) * 0.05 - t * 0.02;
      box(gp, '#5f5a55', x, B + h(x, z) - 0.002, z, 0.04, 0.004, 0.022, 0.2 - t * 0.6);
    }
    box(gp, '#f2f2f2', 0.17, vy - 0.01, -0.33, 0.026, 0.01, 0.014, 0.3);
    // a few junipers on the plain
    for (const [x, z] of [[-0.42, 0.18], [0.44, 0.12], [-0.3, -0.38], [0.38, -0.3], [0.08, 0.46]] as P2[]) cloud(gp, x, B + h(x, z), z, 0.016, 3, Math.round(x * 100 + z * 10), '#6e7a4a');
  }),
  // International Space Station: the long integrated truss with four pairs of golden solar-array wings,
  // white radiators, and the pressurised modules strung along the flight direction (+z = forward).
  sp_iss: batched(root => {
    const gp = grp(root, 0, 0, 0.045);
    const Y = 0.13, TY = 0.178, MW = '#ecebe5', TR = '#b8b7af';
    // modules, front to back: Harmony (+ Columbus, Kibo), Destiny, Unity (+ Tranquility/Cupola), Zarya, Zvezda, Progress
    hcyl(gp, '#d9d6cc', 0, Y, 0.215, 0.018, 0.02, 'z', 12);
    hcyl(gp, MW, 0, Y, 0.17, 0.026, 0.075, 'z', 16);
    hcyl(gp, MW, -0.05, Y, 0.17, 0.026, 0.06, 'x', 16);
    hcyl(gp, MW, 0.07, Y, 0.17, 0.027, 0.1, 'x', 16);
    box(gp, '#dcd8cc', 0.07, Y + 0.022, 0.17, 0.034, 0.03, 0.034).position.y = Y + 0.035;
    box(gp, '#9aa0a6', 0.165, Y - 0.006, 0.17, 0.08, 0.012, 0.05);
    hcyl(gp, MW, 0, Y, 0.085, 0.027, 0.095, 'z', 16);
    sph(gp, MW, 0, Y, 0.022, 0.03);
    hcyl(gp, MW, 0.055, Y, 0.022, 0.024, 0.06, 'x', 14);
    lathe(gp, [[0.016, 0], [0.012, 0.012], [0, 0.014]], '#cfd4d8', 0.06, Y - 0.02, 0.022, 7).rotation.x = Math.PI;
    hcyl(gp, '#e2ddcf', 0, Y, -0.03, 0.016, 0.03, 'z', 12);
    hcyl(gp, '#e6e2d6', 0, Y, -0.1, 0.025, 0.11, 'z', 16);
    hcyl(gp, '#e6e2d6', 0, Y, -0.215, 0.024, 0.12, 'z', 16);
    hcyl(gp, '#d8d3c6', 0, Y, -0.29, 0.03, 0.032, 'z', 16);
    hcyl(gp, '#f0efe9', 0, Y, -0.33, 0.02, 0.05, 'z', 12);
    cone(gp, '#5b6066', 0, Y - 0.02, -0.36, 0.008, 0.014, 6).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      bar(gp, [0, Y, -0.23], [s * 0.05, Y, -0.23], 0.0015, '#888888', 3);
      pv(gp, s * 0.105, Y, -0.23, 0.035, 0.11, '#3d4b8a', 'x');
    }
    // Rassvet/Poisk down- and up-ports with a Soyuz hanging below
    hcyl(gp, MW, 0, Y - 0.04, -0.09, 0.012, 0.04, 'y', 10);
    const sy = grp(gp, 0, Y - 0.06, -0.09);
    sph(sy, '#bfc4b0', 0, -0.006, 0, 0.014);
    lathe(sy, [[0.0, -0.022], [0.012, -0.022], [0.016, -0.034], [0.016, -0.05], [0.0, -0.05]], '#7f7b64', 0, 0, 0, 10);
    cyl(sy, '#cfd2d4', 0, -0.07, 0, 0.016, 0.02, 10);
    for (const s of [-1, 1]) pv(sy, s * 0.045, -0.062, 0, 0.012, 0.055, '#2c3f86', 'x');
    // integrated truss with SARJ rotary joints; lattice on the outboard segments
    bar(gp, [0, Y + 0.026, 0.085], [0, TY - 0.014, 0.085], 0.006, TR, 6);
    box(gp, TR, 0, TY - 0.014, 0, 0.46, 0.028, 0.03);
    for (const s of [-1, 1]) {
      truss(gp, [s * 0.23, TY, 0], [s * 0.47, TY, 0], 0.028, 0.028, 12, '#c4c3bb', 0.0022);
      hcyl(gp, '#9a9a92', s * 0.24, TY, 0, 0.02, 0.016, 'x', 12);
      box(gp, '#9f9e96', s * 0.35, TY - 0.012, 0, 0.12, 0.024, 0.02);
      // two solar array wings per outboard segment pair, each a mast with two golden blankets
      for (const xa of [0.3, 0.43]) for (const sz of [-1, 1]) {
        const x = s * xa;
        hcyl(gp, '#777770', x, TY, sz * 0.026, 0.008, 0.022, 'z', 8);
        bar(gp, [x, TY, sz * 0.035], [x, TY, sz * 0.36], 0.0025, '#4c4a44', 4);
        for (const sx of [-1, 1]) pv(gp, x + sx * 0.027 * Math.cos(0.3 * s), TY + sx * 0.027 * Math.sin(0.3 * s), sz * 0.2, 0.046, 0.31, '#c9822f', 'z', 0.3 * s);
      }
      // white photovoltaic radiators and the big central heat-rejection radiators (angled down)
      box(gp, '#f4f4f0', s * 0.365, TY - 0.012, -0.05, 0.03, 0.004, 0.06);
      const rq = grp(gp, s * 0.17, TY - 0.012, 0, 0, -0.75);
      for (let i = 0; i < 3; i++) box(rq, '#f6f6f2', -0.03 + i * 0.03, 0, -0.012 - 0.11 / 2, 0.026, 0.003, 0.11);
    }
    // Canadarm2 on the truss
    bar(gp, [-0.08, TY + 0.014, 0.0], [-0.13, TY + 0.06, 0.06], 0.004, '#f2f2ee', 5);
    bar(gp, [-0.13, TY + 0.06, 0.06], [-0.05, TY + 0.03, 0.13], 0.004, '#f2f2ee', 5);
    sph(gp, '#f2f2ee', -0.13, TY + 0.06, 0.06, 0.007);
    // a docked Dragon at Harmony's forward port
    hcyl(gp, '#f5f5f2', 0, Y, 0.245, 0.02, 0.026, 'z', 14);
    lathe(gp, [[0.0, 0], [0.02, 0], [0.012, 0.02], [0, 0.024]], '#f5f5f2', 0, Y, 0.258, 14).rotation.x = Math.PI / 2;
  }),

  // Tiangong: Tianhe core module with the Wentian and Mengtian labs forming a T at the docking node,
  // big orange flexible solar wings at the lab ends, Shenzhou at the front and Tianzhou at the back.
  sp_tiangong: batched(root => {
    const gp = grp(root, 0, 0, -0.07);
    const Y = 0.044, W = '#eeece4', BR = '#d9d2bf';
    // node and Tianhe core
    sph(gp, W, 0, Y, 0.08, 0.042);
    hcyl(gp, W, 0, Y, 0.0, 0.03, 0.07, 'z', 18);
    hcyl(gp, W, 0, Y, -0.14, 0.042, 0.2, 'z', 20);
    hcyl(gp, BR, 0, Y, -0.255, 0.04, 0.03, 'z', 20);
    for (const zz of [-0.06, -0.12, -0.2]) hcyl(gp, '#c9c2ad', 0, Y, zz, 0.0425, 0.004, 'z', 20);
    for (const s of [-1, 1]) {
      bar(gp, [s * 0.04, Y, -0.19], [s * 0.07, Y, -0.19], 0.002, '#7a7a74', 3);
      pv(gp, s * 0.15, Y, -0.19, 0.04, 0.16, '#b86a2a', 'x');
    }
    // Wentian (+x) and Mengtian (−x) lab modules
    for (const s of [-1, 1]) {
      hcyl(gp, W, s * 0.075, Y, 0.08, 0.03, 0.05, 'x', 18);
      hcyl(gp, W, s * 0.24, Y, 0.08, 0.043, 0.28, 'x', 20);
      hcyl(gp, BR, s * 0.39, Y, 0.08, 0.036, 0.03, 'x', 18);
      for (const xx of [0.15, 0.27]) hcyl(gp, '#c9c2ad', s * xx, Y, 0.08, 0.0435, 0.004, 'x', 20);
      box(gp, '#d8d4c6', s * 0.25, Y + 0.038, 0.08, 0.12, 0.012, 0.05);
      // the huge flexible wings at the outer end: masts along z with orange blankets
      for (const sz of [-1, 1]) {
        hcyl(gp, '#8b8b84', s * 0.43, Y, 0.08 + sz * 0.03, 0.008, 0.02, 'z', 8);
        bar(gp, [s * 0.43, Y, 0.08 + sz * 0.04], [s * 0.43, Y, 0.08 + sz * 0.42], 0.0025, '#55524a', 4);
        for (const sx of [-1, 1]) pv(gp, s * 0.43 + sx * 0.026 * Math.cos(0.3 * s), Y + sx * 0.026 * Math.sin(0.3 * s), 0.08 + sz * 0.235, 0.044, 0.36, '#c46b25', 'z', 0.3 * s);
      }
      // a small robotic arm and antennas
      bar(gp, [s * 0.18, Y + 0.05, 0.08], [s * 0.3, Y + 0.08, 0.06], 0.003, '#f2f2ee', 5);
      sph(gp, '#f0f0ea', s * 0.33, Y + 0.05, 0.1, 0.012);
    }
    // Shenzhou at the forward port: orbital module, descent capsule, service module with four panels
    const sz = grp(gp, 0, Y, 0.125);
    hcyl(sz, '#c8c8b8', 0, 0, 0.008, 0.012, 0.016, 'z', 10);
    sph(sz, '#e3e1d6', 0, 0, 0.032, 0.022);
    lathe(sz, [[0.0, 0], [0.026, 0], [0.024, 0.006], [0.016, 0.03], [0, 0.034]], '#7d7766', 0, 0, 0.088, 14).rotation.x = -Math.PI / 2;
    hcyl(sz, '#e6e6e2', 0, 0, 0.112, 0.026, 0.044, 'z', 14);
    for (const s of [-1, 1]) pv(sz, s * 0.072, 0, 0.112, 0.085, 0.024, '#2a3f7a', 'x');
    // Tianzhou cargo ship at the aft port
    hcyl(gp, '#e9e7df', 0, Y, -0.31, 0.035, 0.08, 'z', 18);
    hcyl(gp, '#c4bfae', 0, Y, -0.355, 0.03, 0.012, 'z', 18);
    for (const s of [-1, 1]) pv(gp, s * 0.1, Y, -0.32, 0.12, 0.03, '#2a3f7a', 'x');
  }),
};

/** Wedge (flame deflector) helper: triangular prism along x. */
function prismWedge(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, c: string): void {
  const s = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
  const eg = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  eg.translate(0, 0, -w / 2); eg.rotateY(Math.PI / 2); eg.computeVertexNormals();
  add(p, eg, mat(c), x, y, z, 1, 1, 1);
}
