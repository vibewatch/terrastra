import { human } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type Paint, type V3, add, g, mat, box, rbox, cyl, cone, gable, lathe, rod, skin, panel, archPath, shade, mix, hash3, fbm, SPH, paintFaces, tbox, strut } from '../prims.ts';
import { island, ripple, sstep } from '../nature.ts';
import { grp, type Q, type Plan, supPlan, type StandOpts, turf, mow, SK, HR, fan } from '../kit/sport.ts';

// Sports dioramas: each venue is a compact scale model on a round base (radius ≈0.5) — the instantly readable
// shape first (stadium bowl, track, ramp, ring, wave), then signature details (Green Monster, Pagoda, Swilcan
// Bridge, hanging sumo roof), then tiny athletes for life. Distant crowds are painted as coloured seat blocks on
// stepped stands so thousands of fans cost only a few triangles. Front faces +z, base at y=0.

const TAU = Math.PI * 2;

// ---- shared helpers -------------------------------------------------------------------------------------

/** Low-poly ball (heads, hands, balls, studs). */
const dot = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, seg = 7) =>
  add(p, SPH(seg), mat(c), x, y, z, r * 2, r * 2, r * 2);
/** Light smooth ellipsoid for small organic parts. */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, rotx = 0, rotz = 0) =>
  add(p, g('sv-el', () => new THREE.SphereGeometry(1, 10, 7)), mat(c, { flat: false }), x, y, z, rx, ry, rz, roty, rotx, rotz);
const glow = (m: THREE.Mesh, c: string, e: string) => { m.material = mat(c, { emissive: e }); return m; };
/** Thin flat line on the ground from (x0,z0) to (x1,z1). */
function line(p: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, w = 0.004, c = '#f8fafc', h = 0.0016): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  add(p, BOXC(), mat(c), (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, len, h, w, -Math.atan2(z1 - z0, x1 - x0));
}
const BOXC = () => g('box', () => new THREE.BoxGeometry(1, 1, 1));
/** Flat ring line (centre circles, creases, the sumo tawara uses a fatter one). */
function ringLine(p: THREE.Object3D, x: number, y: number, z: number, r: number, w: number, c = '#f8fafc', seg = 40, tube = 4): THREE.Mesh {
  const geo = g(`sv-tor:${seg}:${tube}:${(w / r).toFixed(3)}`, () => new THREE.TorusGeometry(1, w / r, tube, seg));
  return add(p, geo, mat(c), x, y, z, r, r, r * 0.4, 0, -Math.PI / 2);
}

/** Accumulates painted quads into one vertex-coloured mesh; each quad is turned to face `want`. */
class Quads {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  quad(a: Q, b: Q, cc: Q, d: Q, color: string, want: Q): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
    const tri = flip ? [a, cc, b, a, d, cc] : [a, b, cc, a, cc, d];
    this.c.set(color);
    for (const v of tri) { this.pos.push(v[0], v[1], v[2]); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  /** Box made of quads (merged lights, signs, panels), turned by ry about its centre. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, ry = 0): void {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (u: number, v: number, w: number): Q => [x + u * cs + w * sn, v, z - u * sn + w * cs];
    const D = (u: number, w: number): Q => [u * cs + w * sn, 0, -u * sn + w * cs];
    const a = sx / 2, b = sz / 2, y1 = y + sy;
    this.quad(P(-a, y1, -b), P(a, y1, -b), P(a, y1, b), P(-a, y1, b), c, [0, 1, 0]);
    this.quad(P(-a, y, b), P(a, y, b), P(a, y1, b), P(-a, y1, b), c, D(0, 1));
    this.quad(P(-a, y, -b), P(a, y, -b), P(a, y1, -b), P(-a, y1, -b), c, D(0, -1));
    this.quad(P(a, y, -b), P(a, y, b), P(a, y1, b), P(a, y1, -b), c, D(1, 0));
    this.quad(P(-a, y, -b), P(-a, y, b), P(-a, y1, b), P(-a, y1, -b), c, D(-1, 0));
  }
  mesh(p: THREE.Object3D, opts: { rough?: number; emissive?: string } = {}): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return add(p, geo, mat('#ffffff', { vc: true, flat: true, rough: opts.rough, emissive: opts.emissive }), 0, 0, 0, 1, 1, 1);
  }
}

/** Rounded-rectangle plan (half sizes hx,hz, corner radius rc); arcs/straights keep fixed t spans so rows align. */
function rrPlan(hx: number, hz: number, rc: number): Plan {
  const sx = 2 * (hx - rc), sz = 2 * (hz - rc), ar = Math.max(rc, 0.02) * Math.PI / 2;
  const L = 2 * sx + 2 * sz + 4 * ar;
  const parts: [number, (u: number, o: number) => [number, number]][] = [
    [sz, (u, o) => [hx + o, (hz - rc) - u * sz]],
    [ar, (u, o) => { const a = -u * Math.PI / 2; return [hx - rc + (rc + o) * Math.cos(a), -(hz - rc) + (rc + o) * Math.sin(a)]; }],
    [sx, (u, o) => [(hx - rc) - u * sx, -(hz + o)]],
    [ar, (u, o) => { const a = -Math.PI / 2 - u * Math.PI / 2; return [-(hx - rc) + (rc + o) * Math.cos(a), -(hz - rc) + (rc + o) * Math.sin(a)]; }],
    [sz, (u, o) => [-(hx + o), -(hz - rc) + u * sz]],
    [ar, (u, o) => { const a = Math.PI - u * Math.PI / 2; return [-(hx - rc) + (rc + o) * Math.cos(a), (hz - rc) + (rc + o) * Math.sin(a)]; }],
    [sx, (u, o) => [-(hx - rc) + u * sx, hz + o]],
    [ar, (u, o) => { const a = Math.PI / 2 - u * Math.PI / 2; return [hx - rc + (rc + o) * Math.cos(a), (hz - rc) + (rc + o) * Math.sin(a)]; }],
  ];
  return (t, off) => {
    let s = (((t % 1) + 1) % 1) * L;
    for (const [len, f] of parts) { if (s <= len || len === parts[parts.length - 1][0] && f === parts[parts.length - 1][1]) return f(Math.min(1, s / len), off); s -= len; }
    return parts[0][1](0, off);
  };
}

/** Stepped grandstand following a plan curve: crowd-painted treads, concrete risers, front wall, back facade. */
function stands(p: THREE.Object3D, plan: Plan, o: StandOpts): void {
  const t0 = o.t0 ?? 0, t1 = o.t1 ?? 1, q = new Quads(), full = t1 - t0 >= 0.999;
  const riser = o.riser ?? '#9ca3af', wall = o.wall ?? '#e5e7eb', bh = o.backH ?? 0.01;
  const P = (t: number, off: number, y: number): Q => { const [x, z] = plan(t, off); return [x, y, z]; };
  const top = o.y0 + o.rows * o.dh, offE = o.off0 + o.rows * o.dr;
  for (let i = 0; i < o.n; i++) {
    const ta = t0 + ((t1 - t0) * i) / o.n, tb = t0 + ((t1 - t0) * (i + 1)) / o.n, tm = (ta + tb) / 2;
    const [cx, cz] = plan(tm, 0), [ox, oz] = plan(tm, 1);
    const out: Q = [ox - cx, 0, oz - cz], inn: Q = [cx - ox, 0, cz - oz];
    q.quad(P(ta, o.off0, 0), P(tb, o.off0, 0), P(tb, o.off0, o.y0), P(ta, o.off0, o.y0), wall, inn);
    for (let k = 0; k < o.rows; k++) {
      const r0 = o.off0 + k * o.dr, r1 = r0 + o.dr, y = o.y0 + k * o.dh;
      q.quad(P(ta, r0, y), P(tb, r0, y), P(tb, r0, y + o.dh), P(ta, r0, y + o.dh), shade(riser, 0.9 + (k % 2) * 0.1), inn);
      q.quad(P(ta, r0, y + o.dh), P(tb, r0, y + o.dh), P(tb, r1, y + o.dh), P(ta, r1, y + o.dh), o.seat(tm, k, i), [0, 1, 0]);
    }
    q.quad(P(ta, offE, top), P(tb, offE, top), P(tb, offE, top + bh), P(ta, offE, top + bh), wall, inn);
    q.quad(P(ta, offE, top + bh), P(tb, offE, top + bh), P(tb, offE + 0.006, top + bh), P(ta, offE + 0.006, top + bh), shade(wall, 0.92), [0, 1, 0]);
    const segs = 3;
    for (let k = 0; k < segs; k++) {
      const ya = ((top + bh) * k) / segs, yb = ((top + bh) * (k + 1)) / segs;
      q.quad(P(ta, offE + 0.006, ya), P(tb, offE + 0.006, ya), P(tb, offE + 0.006, yb), P(ta, offE + 0.006, yb), o.back ? o.back(tm, (ya + yb) / 2) : wall, out);
    }
  }
  if (!full) {
    for (const [t, sgn] of [[t0, -1], [t1, 1]] as const) {
      const [ax, az] = plan(t, 0), [bx, bz] = plan(t + sgn * 0.001, 0);
      const want: Q = [bx - ax, 0, bz - az];
      q.quad(P(t, o.off0, 0), P(t, o.off0 + o.dr, 0), P(t, o.off0 + o.dr, o.y0 + o.dh), P(t, o.off0, o.y0 + o.dh), wall, want);
      for (let k = 1; k < o.rows; k++) {
        const r0 = o.off0 + k * o.dr;
        q.quad(P(t, r0, 0), P(t, r0 + o.dr, 0), P(t, r0 + o.dr, o.y0 + (k + 1) * o.dh), P(t, r0, o.y0 + (k + 1) * o.dh), wall, want);
      }
      q.quad(P(t, offE, 0), P(t, offE + 0.006, 0), P(t, offE + 0.006, top + bh), P(t, offE, top + bh), wall, want);
    }
  }
  q.mesh(p);
}
/** Crowd seat painter: mostly team colours, some skin/hair dots, a few empty seats. */
const crowd = (pal: string[], empty = '#94a3b8', fill = 0.9, seed = 1) => (t: number, row: number, i: number) => {
  const h = hash3(i * 1.7, row * 3.1, seed);
  if (h > fill) return empty;
  const k = hash3(i * 5.3, row * 0.7, seed + 7);
  return k < 0.22 ? ['#f1c7a3', '#c58c5c', '#8d5a3b'][Math.floor(k * 13.6) % 3] : shade(pal[Math.floor(k * 97) % pal.length], 0.88 + h * 0.2);
};

/** Round flat base (lawn / snow / plaza) with an earth skirt. */
function base(gp: THREE.Object3D, R: number, top: string, paint: Paint, h = 0.03, hf: (x: number, z: number) => number = () => 0, rings = 14, segs = 72, side = '#6b5644'): void {
  island(gp, R, hf, top, paint, { rings, segs, base: h, side: (y) => (y > h * 0.55 ? side : shade(side, 0.78)) });
}

// ---- people ---------------------------------------------------------------------------------------------
interface Pose {
  c: string; b?: string; legs?: string; skin?: string; hair?: string; shoes?: string;
  /** foot & hand targets in unit-height figure space ([left, right]) */
  feet?: [V3, V3]; hands?: [V3, V3];
  /** forward lean of chest/head (unit space) */
  lean?: number; bulk?: number; hat?: (f: THREE.Group) => void; sleeve?: string;
}
/** Little athlete, h tall: two-segment limbs reaching foot/hand targets, rounded torso, head with hair. */
function fig(p: THREE.Object3D, x: number, y: number, z: number, ry: number, h: number, o: Pose): THREE.Group {
  const f = grp(p, x, y, z, ry, h);
  const sk = o.skin ?? SK[Math.floor(hash3(x * 31, z * 17, 3) * 4)], hr = o.hair ?? HR[Math.floor(hash3(x * 13, z * 7, 5) * 5)];
  // targets are given with soles at y = 0; the rig wants ankles
  const feet = o.feet ? (o.feet.map(([fx, fy, fz]) => [fx, fy + 0.032, fz]) as [V3, V3]) : undefined;
  const rig = human(f, 0, 0, 0, {
    h: 1, detail: h > 0.06 ? 'hi' : 'lo', top: o.c, skin: sk, shoes: o.shoes ?? '#27272a', build: o.bulk,
    feet, hands: o.hands, hipY: feet ? 0.46 : undefined, lean: (o.lean ?? 0) * 0.6, sleeve: 0.4,
    bottom: o.b ?? '#1f2937', shorts: !o.legs || o.legs === sk, hair: hr,
  });
  if (o.hat) {
    // hats were authored for a head at (0, 0.9, 0) of radius ≈0.11: map that frame onto the rig's head
    const k = 0.6, hf = new THREE.Group();
    hf.position.set(rig.head[0], rig.head[1] - 0.9 * k, rig.head[2]);
    hf.scale.setScalar(k);
    f.add(hf);
    o.hat(hf);
  }
  return f;
}
const RUN = (ph = 0): Pick<Pose, 'feet' | 'hands' | 'lean'> => {
  const s = ph ? -1 : 1;
  return { feet: [[-0.06, 0.06, 0.28 * s], [0.06, 0.14, -0.3 * s]], hands: [[-0.2, 0.55, -0.2 * s], [0.2, 0.58, 0.22 * s]], lean: 0.35 };
};

/** Stadium floodlight mast with a lit head. */
function mast(p: THREE.Object3D, x: number, y: number, z: number, h: number, ry: number, w = 0.05, c = '#cbd5e1'): void {
  cyl(p, c, x, y, z, 0.006, h, 6);
  const f = grp(p, x, y + h, z, ry);
  box(f, shade(c, 0.8), 0, -0.006, 0, w, w * 0.45, 0.01);
  glow(box(f, '#fff7d6', 0, -0.004, 0.0055, w * 0.88, w * 0.36, 0.003), '#fff7d6', '#fff2b0');
}
/** Pennant flag on a pole. */
function flag(p: THREE.Object3D, x: number, y: number, z: number, h: number, c: string, c2?: string, ry = 0): void {
  cyl(p, '#e5e7eb', x, y, z, 0.0025, h, 5);
  const f = grp(p, x, y + h, z, ry);
  box(f, c, 0.018, -0.024, 0, 0.034, 0.022, 0.002);
  if (c2) box(f, c2, 0.018, -0.0155, 0, 0.034, 0.005, 0.0025);
}
/** Round broadleaf tree. */
function leafy(p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#4f7d3a'): void {
  cyl(p, '#6b4c35', x, y, z, s * 0.09, s * 0.5, 5);
  blob(p, c, x, y + s * 0.62, z, s * 0.36, s * 0.3, s * 0.36);
  blob(p, shade(c, 1.12), x + s * 0.1, y + s * 0.78, z + s * 0.06, s * 0.24, s * 0.2, s * 0.24);
}
function fir(p: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#2f5a3c', snow = false): void {
  cyl(p, '#5b4030', x, y, z, s * 0.07, s * 0.22, 5);
  cone(p, c, x, y + s * 0.15, z, s * 0.3, s * 0.5, 7);
  cone(p, shade(c, 1.1), x, y + s * 0.42, z, s * 0.23, s * 0.42, 7);
  cone(p, snow ? '#f1f5f9' : shade(c, 1.2), x, y + s * 0.68, z, s * 0.14, s * 0.34, 7);
}
/** Window grid on a facade plane (local frame: facade faces +z at z). */
function windows(p: THREE.Object3D, x0: number, y0: number, z: number, cols: number, rows: number, dx: number, dy: number, w: number, h: number, c = '#1f2937', frame?: string): void {
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + i * dx, y = y0 + j * dy;
    if (frame) box(p, frame, x, y - 0.002, z, w + 0.004, h + 0.004, 0.003);
    box(p, c, x, y, z + 0.0015, w, h, 0.003);
  }
}
/** Distance from (x,z) to a polyline. */
function polyDist(pts: [number, number][], x: number, z: number): number {
  let best = 9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

// =========================================================================================================
// ANCIENT OLYMPIA — the long sandy stadium track between grassy spectator banks, stone start sills at both
// ends, the vaulted "crypt" tunnel through which athletes entered, Doric column ruins and olive trees; four
// runners race down the track while spectators sit on the grass.
// =========================================================================================================
const sv_olympia: Builder = (gp) => {
  const TX = 0.33, TZ = 0.075, Y0 = 0.03;
  const rect = (x: number, z: number) => { const dx = Math.max(Math.abs(x) - TX, 0), dz = Math.max(Math.abs(z) - TZ, 0); return Math.hypot(dx, dz); };
  const hf = (x: number, z: number) => {
    const d = rect(x, z), r = Math.hypot(x, z);
    let h = 0.085 * sstep(0.012, 0.13, d) * (1 - 0.55 * sstep(0.34, 0.5, r)) + (fbm(x * 9, 1, z * 9, 3) - 0.5) * 0.012 * sstep(0.02, 0.1, d);
    if (x < -TX + 0.01) h *= sstep(0.035, 0.07, Math.abs(z));
    return h;
  };
  const paint: Paint = (x, y, z) => {
    const d = rect(x, z);
    if (d < 0.004) return shade('#d8c296', 0.94 + fbm(x * 60, 0, z * 60, 2) * 0.12);
    if (d < 0.012) return '#cfc3a6';
    if (x < -TX && Math.abs(z) < 0.05) return '#c4ad84';
    return shade('#6f9a3f', 0.82 + fbm(x * 18, y * 30, z * 18, 3) * 0.32 + (y - Y0) * 1.2);
  };
  base(gp, 0.5, '#6f9a3f', paint, Y0, hf, 34, 96);
  // stone kerbs and the two start/finish sills (balbis) with toe grooves
  for (const sz of [-1, 1]) box(gp, '#ded5bd', 0, Y0, sz * (TZ + 0.004), TX * 2, 0.004, 0.006);
  for (const sx of [-1, 1]) {
    box(gp, '#e9e1cc', sx * (TX - 0.012), Y0, 0, 0.022, 0.005, TZ * 2);
    for (let k = -3; k <= 3; k++) box(gp, '#a8a08c', sx * (TX - 0.012), Y0 + 0.004, k * 0.02, 0.003, 0.002, 0.012);
  }
  // the crypt: stone barrel-vaulted passage cut through the west bank
  const cr = grp(gp, -TX - 0.075, Y0, 0, Math.PI / 2);
  const stone = '#c9b38c';
  const VAULT = () => g('sv-vault', () => { const c = new THREE.CylinderGeometry(0.036, 0.036, 1, 14, 1, true, -Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); return c; });
  add(cr, VAULT(), mat(shade(stone, 0.92)), 0, 0.045, 0, 1.25, 1.25, 0.15);
  for (const s of [-1, 1]) box(cr, shade(stone, 0.95), s * 0.044, 0, 0, 0.012, 0.045, 0.15);
  for (const zz of [0.075, -0.075]) {
    const pnl = panel(cr, 0.13, 0.1, 0.012, stone, [archPath(0, 0, 0.07, 0.083)], 0, 0, zz);
    pnl.geometry = paintFaces(pnl.geometry, stone, (x, y) => shade(stone, 0.9 + hash3(Math.floor(x * 60), Math.floor(y * 70), 2) * 0.18));
    pnl.material = mat('#ffffff', { vc: true });
  }
  for (const zz of [-0.03, 0, 0.03]) ringLine(cr, 0, 0.045, zz, 0.039, 0.004, shade(stone, 0.85), 16, 3).rotation.set(0, 0, 0);
  box(cr, '#4a3b2c', 0, 0, 0, 0.066, 0.002, 0.15);
  // Doric column ruins on a stylobate (Temple of Hera nod)
  const ru = grp(gp, -0.2, Y0 + 0.03, -0.31, 0.25);
  rbox(ru, '#d9cdb0', 0, -0.012, 0, 0.26, 0.022, 0.09, 0.004);
  const col = (x: number, z: number, h: number) => {
    lathe(ru, [[0, 0], [0.019, 0], [0.018, h * 0.4], [0.015, h], [0, h]], '#e2d6b8', x, 0.01, z, 12);
    box(ru, '#e8ddc1', x, 0.01 + h, z, 0.045, 0.01, 0.045);
    cyl(ru, '#e2d6b8', x, 0.01 + h - 0.008, z, 0.023, 0.008, 12);
  };
  col(-0.09, 0.02, 0.16); col(-0.03, 0.02, 0.16); col(0.04, 0.02, 0.07); col(0.1, -0.02, 0.03);
  box(ru, '#e8ddc1', -0.06, 0.18, 0.02, 0.12, 0.014, 0.05);
  const drum = add(ru, g('cyl12', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12)), mat('#d8ccae'), 0.05, 0.03, 0.06, 0.038, 0.04, 0.038, 0, 0, Math.PI / 2);
  drum.rotation.y = 0.4;
  // olive trees with grey-green crowns, cypress/pines behind the north bank
  const olive = (x: number, z: number, s: number) => {
    const y = Y0 + hf(x, z) - 0.003;
    rod(gp, [x, y, z], [x + s * 0.06, y + s * 0.35, z], s * 0.06, '#6b5a45', 5);
    rod(gp, [x + s * 0.06, y + s * 0.35, z], [x - s * 0.08, y + s * 0.55, z + s * 0.05], s * 0.04, '#6b5a45', 5);
    blob(gp, '#7d8f5a', x, y + s * 0.6, z, s * 0.34, s * 0.22, s * 0.3);
    blob(gp, '#8fa268', x + s * 0.1, y + s * 0.7, z - s * 0.05, s * 0.22, s * 0.15, s * 0.2);
  };
  for (const [x, z, s] of [[0.36, -0.28, 0.2], [0.2, -0.36, 0.18], [0.42, 0.2, 0.17], [-0.38, 0.24, 0.19], [0.0, 0.4, 0.15], [0.26, 0.36, 0.16], [-0.42, -0.12, 0.15]] as const) olive(x, z, s);
  for (const [x, z] of [[-0.02, -0.42], [0.08, -0.43], [-0.36, -0.3]] as const) {
    const y = Y0 + hf(x, z) - 0.003;
    cyl(gp, '#5b4030', x, y, z, 0.006, 0.03, 5);
    blob(gp, '#3f5f34', x, y + 0.09, z, 0.03, 0.08, 0.03);
  }
  // judges' stone platform on the south bank, altar on the north bank
  { const x = 0.05, z = 0.19, y = Y0 + hf(x, z) - 0.01; rbox(gp, '#ddd1b3', x, y, z, 0.11, 0.025, 0.045, 0.003); rbox(gp, '#e8ddc1', x, y + 0.025, z + 0.012, 0.11, 0.012, 0.02, 0.003);
    for (const k of [-1, 0, 1]) fig(gp, x + k * 0.03, y + 0.02, z - 0.008, Math.PI, 0.05, { c: '#7c2d12', b: '#7c2d12', legs: '#7c2d12', hands: [[-0.2, 0.45, 0.1], [0.2, 0.45, 0.1]] }); }
  { const x = -0.04, z = -0.2, y = Y0 + hf(x, z) - 0.006; rbox(gp, '#efe7d2', x, y, z, 0.05, 0.03, 0.035, 0.003); }
  // runners in short tunics
  const tun = ['#e5e7eb', '#dc2626', '#2563eb', '#eab308'];
  [[0.06, -0.045], [0.0, -0.015], [-0.04, 0.02], [0.03, 0.05]].forEach(([x, z], i) => {
    fig(gp, x, Y0 + 0.002, z, Math.PI / 2, 0.075, { c: tun[i], b: tun[i], skin: SK[1 + (i % 3)], shoes: SK[1 + (i % 3)], ...RUN(i % 2) });
  });
  // spectators on the grass banks
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, x = -0.28 + (i * 0.035) + hash3(i, 2, 3) * 0.02, z = side * (0.13 + hash3(i, 4, 1) * 0.06);
    fan(gp, x, Y0 + hf(x, z) - 0.004, z, 0.035, ['#f8fafc', '#b91c1c', '#1d4ed8', '#ca8a04', '#15803d', '#7c3aed'][i % 6]);
  }
};

// =========================================================================================================
// ST ANDREWS OLD COURSE — the R&A clubhouse (sandstone, slate roofs, bay windows, clock gable) behind the
// 18th fairway; the little humped Swilcan Bridge over the stone-lined burn; a flag on the green, a pot
// bunker, the West Sands beach and sea along one side; golfers crossing the bridge.
// =========================================================================================================
const sv_standrews: Builder = (gp) => {
  const Y0 = 0.03;
  const burnZ = (x: number) => 0.14 + Math.sin(x * 5 + 0.6) * 0.035;
  const hf = (x: number, z: number) => {
    let h = (fbm(x * 7, 3, z * 7, 3) - 0.5) * 0.022;
    const db = Math.abs(z - burnZ(x));
    if (x > -0.33) h -= 0.018 * (1 - sstep(0.016, 0.03, db));
    const dG = Math.hypot(x - 0.14, z + 0.06); h += 0.008 * (1 - sstep(0.05, 0.11, dG));
    const dB = Math.hypot(x + 0.02, z + 0.02); h -= 0.012 * (1 - sstep(0.012, 0.03, dB));
    if (x < -0.33) h -= 0.02 * sstep(-0.33, -0.4, x);
    return h;
  };
  const paint: Paint = (x, y, z) => {
    const db = Math.abs(z - burnZ(x));
    if (x < -0.36) return y < Y0 - 0.012 ? ripple('#3b7fa8')(x, y, z, 0, 1, 0) : shade('#e6d4a8', 0.95 + fbm(x * 50, 0, z * 50, 2) * 0.1);
    if (x < -0.31) return shade('#bfae74', 0.95 + fbm(x * 40, 0, z * 40, 2) * 0.12);
    if (x > -0.33 && db < 0.014) return ripple('#3a6f86')(x, y, z, 0, 1, 0);
    if (x > -0.33 && db < 0.02) return shade('#9b8f7c', 0.9 + hash3(Math.floor(x * 120), 0, Math.floor(z * 60)) * 0.2);
    if (Math.hypot(x + 0.02, z + 0.02) < 0.03) return '#e9d9a6';
    if (Math.hypot(x - 0.14, z + 0.06) < 0.07) return shade('#79b04a', 1 + Math.floor((x - z) * 40) % 2 * 0.05);
    if (z < -0.2) return shade('#6c9b45', 0.95 + fbm(x * 30, 0, z * 30, 2) * 0.1);
    const rough = Math.abs(x - 0.02) > 0.3;
    return rough ? shade('#8a9a52', 0.85 + fbm(x * 25, 0, z * 25, 3) * 0.3) : shade('#5f9a3a', (Math.floor((x + z * 0.4) * 22) % 2 ? 0.94 : 1.06) * (0.96 + fbm(x * 30, 0, z * 30, 2) * 0.08));
  };
  base(gp, 0.5, '#5f9a3a', paint, Y0, hf, 40, 110);
  // Swilcan Bridge: humped stone arch over the burn, span running along z
  {
    const bx = -0.12, bz = burnZ(bx), s = new THREE.Shape();
    const L = 0.085, H = 0.032;
    s.moveTo(-L, -0.01);
    for (let i = 0; i <= 12; i++) { const u = -1 + (2 * i) / 12; s.lineTo(u * L, -0.01 + (H + 0.01) * (1 - u * u) ** 0.8 + 0.004); }
    s.lineTo(L, -0.01); s.lineTo(-L, -0.01);
    const hole = new THREE.Path(); hole.moveTo(-0.022, -0.012); hole.absarc(0, 0.0, 0.022, Math.PI, 0, true); hole.lineTo(0.022, -0.012); hole.closePath();
    s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.042, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 10 });
    geo.translate(0, 0, -0.021);
    const st = '#b8ad98';
    const m = add(gp, paintFaces(geo, st, (x, y, z, nx, ny) => ny > 0.6 ? shade('#8f8a72', 0.95 + hash3(Math.floor(x * 80), 1, Math.floor(z * 80)) * 0.15) : shade(st, 0.85 + hash3(Math.floor(x * 90), Math.floor(y * 110), Math.floor(z * 50)) * 0.25)), mat('#ffffff', { vc: true }), bx, Y0 - 0.006, bz, 1, 1, 1, Math.PI / 2);
    m.castShadow = true;
    fig(gp, bx + 0.004, Y0 + 0.03, bz - 0.02, Math.PI, 0.06, { c: '#1e3a8a', b: '#d6d3d1', legs: '#d6d3d1', shoes: '#f8fafc', hat: (f) => blob(f, '#f8fafc', 0, 1.0, 0.0, 0.11, 0.05, 0.11), ...RUN(0), lean: 0.1, feet: [[-0.06, 0, 0.12], [0.06, 0.02, -0.12]] });
    const bag = grp(gp, bx - 0.03, Y0 + 0.012, bz + 0.03, 0.4);
    cyl(bag, '#7f1d1d', 0, 0, 0, 0.007, 0.03, 8).rotation.z = 0.3;
    for (const k of [-1, 0, 1]) rod(bag, [k * 0.003, 0.03, 0], [k * 0.004 - 0.006, 0.045, 0], 0.0015, '#d4d4d8', 4);
  }
  // pot bunker lip + green with flag
  ringLine(gp, -0.02, Y0 - 0.006, -0.02, 0.03, 0.004, '#6b8b3c', 20, 3);
  { const x = 0.15, z = -0.07, y = Y0 + hf(x, z); cyl(gp, '#1c1917', x, y - 0.001, z, 0.006, 0.002, 10); cyl(gp, '#f8fafc', x, y, z, 0.0022, 0.11, 5);
    const f = grp(gp, x, y + 0.11, z, 0.6); box(f, '#dc2626', 0.02, -0.03, 0, 0.04, 0.028, 0.002); box(f, '#facc15', 0.02, -0.02, 0, 0.04, 0.006, 0.0025); }
  fig(gp, 0.1, Y0 + hf(0.1, -0.03), -0.03, 0.9, 0.06, { c: '#f8fafc', b: '#334155', legs: '#334155', lean: 0.35, hands: [[-0.02, 0.36, 0.2], [0.03, 0.36, 0.2]], hat: (f) => blob(f, '#0f172a', 0, 1.0, 0.03, 0.11, 0.04, 0.13) });
  rod(gp, [0.112, Y0 + 0.022, -0.022], [0.124, Y0 + 0.002, -0.01], 0.0013, '#d4d4d8', 4);
  dot(gp, '#ffffff', 0.13, Y0 + hf(0.13, -0.05) + 0.003, -0.05, 0.003, 6);
  fig(gp, 0.21, Y0 + hf(0.21, -0.01), -0.01, -0.6, 0.06, { c: '#15803d', b: '#e7e5e4', legs: '#e7e5e4' });
  // R&A clubhouse
  const cb = grp(gp, -0.1, Y0 - 0.004, -0.33, 0.12);
  const sand = '#c9b48a', slate = '#4b5563', win = '#2a3442';
  const stonePaint = (c: string): Paint => (x, y, z) => shade(c, 0.9 + hash3(Math.floor(x * 70 + z * 70), Math.floor(y * 90), 1) * 0.16);
  const sb = (x: number, y: number, z: number, w: number, h: number, d: number) => { const m = box(cb, sand, x, y, z, w, h, d); m.geometry = paintFaces(m.geometry, sand, stonePaint(sand)); m.material = mat('#ffffff', { vc: true }); return m; };
  sb(0, 0, 0, 0.3, 0.13, 0.11);
  tbox(cb, 0.3, 0.11, 0.22, 0.04, 0.05, slate, 0, 0.13, 0);
  sb(0, 0, 0.065, 0.1, 0.15, 0.03);
  gable(cb, 0.035, 0.05, 0.105, slate, 0, 0.15, 0.065, Math.PI / 2);
  const gab = new THREE.Shape([new THREE.Vector2(-0.05, 0), new THREE.Vector2(0.05, 0), new THREE.Vector2(0, 0.05)]);
  add(cb, new THREE.ExtrudeGeometry(gab, { depth: 0.008, bevelEnabled: false }), mat(shade(sand, 1.04)), 0, 0.15, 0.076, 1, 1, 1);
  cyl(cb, '#f8fafc', 0, 0.165, 0.085, 0.012, 0.004, 14).rotation.x = Math.PI / 2;
  cyl(cb, '#78350f', 0, 0.165, 0.083, 0.014, 0.003, 14).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    sb(s * 0.115, 0, 0.06, 0.06, 0.08, 0.02);
    windows(cb, s * 0.115 - 0.015, 0.02, 0.07, 3, 1, 0.015, 0.03, 0.01, 0.04, win, '#f3efe6');
    gable(cb, 0.08, 0.035, 0.05, slate, s * 0.115, 0.13, 0.03, 0);
    box(cb, shade(sand, 0.9), s * 0.13, 0.17, -0.02, 0.022, 0.05, 0.016);
    for (const k of [0, 1, 2]) cyl(cb, '#9a5b3c', s * 0.13 - 0.007 + k * 0.007, 0.22, -0.02, 0.0025, 0.012, 5);
    windows(cb, s * 0.08 - 0.03, 0.09, 0.056, 3, 1, 0.03, 0.03, 0.014, 0.024, win, '#f3efe6');
    windows(cb, s * 0.095 - 0.045, 0.02, 0.056, 2, 2, 0.03, 0.045, 0.013, 0.028, win, '#f3efe6');
  }
  windows(cb, -0.03, 0.02, 0.081, 3, 3, 0.03, 0.04, 0.014, 0.026, win, '#f3efe6');
  box(cb, '#f3efe6', 0, 0.075, 0.085, 0.11, 0.004, 0.012);
  flag(cb, 0.14, 0.18, 0.0, 0.07, '#1e3a8a', '#f8fafc');
  for (let i = 0; i < 9; i++) { const x = -0.26 + i * 0.065; cyl(gp, '#f8fafc', x, Y0 + hf(x, -0.215) - 0.004, -0.215 - x * 0.12, 0.0018, 0.018, 4); }
  rod(gp, [-0.26, Y0 + 0.012, -0.215 + 0.031], [0.26, Y0 + 0.012, -0.215 - 0.031], 0.0015, '#f8fafc', 4);
  // Hamilton Grand (red sandstone) and grey town houses on the east side
  const hg = grp(gp, 0.3, Y0 - 0.004, -0.26, -0.5);
  box(hg, '#a5513b', 0, 0, 0, 0.16, 0.16, 0.08);
  tbox(hg, 0.16, 0.08, 0.12, 0.03, 0.04, '#3f4652', 0, 0.16, 0);
  windows(hg, -0.06, 0.02, 0.04, 5, 4, 0.03, 0.035, 0.012, 0.02, '#2a3442', '#e8d5c4');
  for (let i = 0; i < 4; i++) {
    const a = -0.35 + i * 0.13, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4;
    const hh = grp(gp, x, Y0 - 0.004, z, -a - Math.PI / 2);
    const c = ['#b3aa9a', '#9ca3af', '#c4b8a2', '#a8a29e'][i];
    box(hh, c, 0, 0, 0, 0.09, 0.08 + (i % 2) * 0.02, 0.06);
    gable(hh, 0.09, 0.035, 0.06, '#475569', 0, 0.08 + (i % 2) * 0.02, 0, 0);
    windows(hh, -0.025, 0.02, 0.03, 3, 2, 0.025, 0.03, 0.01, 0.016, '#2a3442', '#f1f5f9');
  }
  for (let i = 0; i < 5; i++) fan(gp, -0.26 + i * 0.03, Y0 - 0.006, -0.2 - i * 0.004, 0.04, ['#1d4ed8', '#b91c1c', '#f8fafc', '#facc15', '#15803d'][i]);
};

// =========================================================================================================
// MONT VENTOUX — the bald "Giant of Provence": pine forest on the lower slopes, a white limestone scree cap,
// a winding road climbing to the summit weather station with its red-and-white mast; Tour de France riders
// (yellow jersey leading) grind up the road between cheering fans.
// =========================================================================================================
const sv_ventoux: Builder = (gp) => {
  const Y0 = 0.03, PK = 0.47;
  const rr = (x: number, z: number) => Math.hypot(x / 1.18, z + 0.02);
  const hf = (x: number, z: number) => {
    const r = rr(x, z), k = Math.max(0, 1 - r / 0.49);
    return PK * Math.pow(k, 1.55) * (1 + (fbm(x * 6, 0, z * 6, 3) - 0.5) * 0.25) + (fbm(x * 18, 2, z * 18, 2) - 0.5) * 0.012 * k;
  };
  // road: spiral climbing ~1.6 turns
  const road: [number, number][] = [];
  const N = 150;
  for (let i = 0; i <= N; i++) {
    const s = i / N, th = 1.6 + s * TAU * 1.55, r = 0.44 * (1 - s) + 0.045 * s + Math.sin(s * 40) * 0.012 * (1 - s);
    road.push([Math.cos(th) * r * 1.18, Math.sin(th) * r - 0.02]);
  }
  const paint: Paint = (x, y, z) => {
    const h = y - Y0, n = fbm(x * 30, y * 20, z * 30, 3);
    if (h > 0.2 + n * 0.06) return shade('#e9e5da', 0.86 + hash3(Math.floor(x * 140), Math.floor(y * 140), Math.floor(z * 140)) * 0.16);
    if (h > 0.15 + n * 0.06) return mix('#9aa46a', '#ddd8c8', hash3(Math.floor(x * 90), 2, Math.floor(z * 90)));
    return shade('#46703a', 0.78 + n * 0.4);
  };
  base(gp, 0.5, '#46703a', paint, Y0, hf, 46, 120);
  // asphalt ribbon with centre dashes
  {
    const q = new Quads();
    const W = 0.013;
    const P = (i: number, s: number): Q => {
      const [x, z] = road[i], [x2, z2] = road[Math.min(N, i + 1)], [x0, z0] = road[Math.max(0, i - 1)];
      let tx = x2 - x0, tz = z2 - z0; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const px = x - tz * W * s, pz = z + tx * W * s;
      return [px, Y0 + hf(px, pz) + 0.004, pz];
    };
    for (let i = 0; i < N; i++) {
      q.quad(P(i, -1), P(i + 1, -1), P(i + 1, 1), P(i, 1), shade('#4b4b50', 0.95 + (i % 3) * 0.03), [0, 1, 0]);
      const a = P(i, -1), b = P(i, 1);
      q.quad(a, P(i + 1, -1), [P(i + 1, -1)[0], P(i + 1, -1)[1] - 0.012, P(i + 1, -1)[2]], [a[0], a[1] - 0.012, a[2]], '#6b6256', [a[0] - b[0], 0, a[2] - b[2]]);
      q.quad(b, P(i + 1, 1), [P(i + 1, 1)[0], P(i + 1, 1)[1] - 0.012, P(i + 1, 1)[2]], [b[0], b[1] - 0.012, b[2]], '#6b6256', [b[0] - a[0], 0, b[2] - a[2]]);
    }
    q.mesh(gp);
    for (let i = 2; i < N - 2; i += 3) {
      const [x, z] = road[i], [x2, z2] = road[i + 1];
      line(gp, x, z, x2, z2, Y0 + Math.max(hf(x, z), hf(x2, z2)) + 0.004, 0.0025, '#f8fafc', 0.0012);
    }
  }
  const onRoad = (i: number, side = 0): [number, number, number, number] => {
    const [x, z] = road[i], [x2, z2] = road[i + 1];
    const ang = Math.atan2(x2 - x, z2 - z);
    const ox = Math.cos(ang) * side, oz = -Math.sin(ang) * side;
    return [x + ox, Y0 + hf(x + ox, z + oz) + 0.004, z + oz, ang];
  };
  // forest on the lower slopes
  for (let i = 0; i < 70; i++) {
    const a = hash3(i, 3, 9) * TAU, r = 0.2 + Math.sqrt(hash3(i, 7, 1)) * 0.26, x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r;
    if (Math.hypot(x, z) > 0.47 || hf(x, z) > 0.14 || polyDist(road, x, z) < 0.03) continue;
    fir(gp, x, Y0 + hf(x, z) - 0.003, z, 0.05 + hash3(i, 1, 1) * 0.03, hash3(i, 5, 5) > 0.5 ? '#2f5a3c' : '#3d6b3a');
  }
  // summit weather station + striped mast + radome

  const top = Y0 + hf(0, -0.02);
  const st = grp(gp, 0, top - 0.02, -0.02, 0.3);
  box(st, '#d6d3d1', 0, 0, 0, 0.075, 0.06, 0.05);
  box(st, '#a8a29e', 0, 0.06, 0, 0.08, 0.006, 0.055);
  windows(st, -0.025, 0.02, 0.025, 3, 2, 0.025, 0.02, 0.012, 0.01, '#334155');
  box(st, '#e7e5e4', 0, 0.066, 0, 0.04, 0.03, 0.035);
  for (let k = 0; k < 8; k++) cyl(st, k % 2 ? '#f8fafc' : '#dc2626', 0, 0.096 + k * 0.022, 0, 0.012 - k * 0.0008, 0.022, 10);
  cyl(st, '#e5e7eb', 0, 0.272, 0, 0.0025, 0.05, 5);
  for (const yy of [0.15, 0.2]) cyl(st, '#9ca3af', 0, 0.096 + yy - 0.05, 0, 0.018, 0.004, 10);
  const rx = 0.08, rz = 0.06;
  box(gp, '#a8a29e', rx, Y0 + hf(rx, rz) - 0.01, rz, 0.03, 0.03, 0.03);
  dot(gp, '#f8fafc', rx, Y0 + hf(rx, rz) + 0.04, rz, 0.025, 12);
  // riders: yellow jersey leading a small group, fans along the road
  const rider = (i: number, side: number, jersey: string, shorts = '#111827') => {
    const [x, y, z, ang] = onRoad(i, side);
    cyclist(gp, x, y, z, ang, jersey, shorts);
  };
  rider(118, 0.002, '#facc15'); rider(113, -0.004, '#f8fafc', '#111827'); rider(110, 0.005, '#2563eb'); rider(106, -0.003, '#16a34a');
  rider(70, 0.004, '#dc2626'); rider(66, -0.004, '#f97316');
  for (let k = 0; k < 14; k++) {
    const i = 30 + k * 7, side = (k % 2 ? 1 : -1) * 0.022;
    const [x, y, z] = onRoad(i, side);
    fan(gp, x, y - 0.004, z, 0.035, ['#facc15', '#dc2626', '#f8fafc', '#2563eb', '#16a34a'][k % 5], k % 3 === 0);
  }
  flag(gp, onRoad(121, 0.024)[0], onRoad(121, 0.024)[1] - 0.004, onRoad(121, 0.024)[2], 0.06, '#1d4ed8', '#dc2626');
};
/** Road cyclist (bike + crouched rider), ~0.06 tall, riding along +z of its local frame. */
function cyclist(p: THREE.Object3D, x: number, y: number, z: number, ry: number, jersey: string, shorts = '#111827', s = 0.06): void {
  const f = grp(p, x, y, z, ry, s);
  for (const wz of [-0.32, 0.32]) {
    const w = add(f, g('sv-wheel', () => new THREE.TorusGeometry(0.2, 0.025, 4, 18)), mat('#18181b'), 0, 0.22, wz, 1, 1, 1, Math.PI / 2);
    w.castShadow = true;
  }
  const fc = '#e5e7eb';
  rod(f, [0, 0.22, -0.32], [0, 0.48, -0.05], 0.022, fc, 5);
  rod(f, [0, 0.22, -0.32], [0, 0.24, 0.02], 0.022, fc, 5);
  rod(f, [0, 0.24, 0.02], [0, 0.48, -0.05], 0.025, fc, 5);
  rod(f, [0, 0.24, 0.02], [0, 0.52, 0.24], 0.025, fc, 5);
  rod(f, [0, 0.48, -0.05], [0, 0.5, 0.25], 0.022, fc, 5);
  rod(f, [0, 0.52, 0.24], [0, 0.22, 0.32], 0.02, fc, 5);
  rod(f, [-0.09, 0.56, 0.27], [0.09, 0.56, 0.27], 0.018, '#27272a', 4);
  box(f, '#18181b', 0, 0.5, -0.1, 0.06, 0.02, 0.12);
  fig(f, 0, 0.0, -0.08, 0, 1.0, {
    c: jersey, b: shorts, legs: '#e0b48c', lean: 1.3, shoes: '#f8fafc',
    feet: [[-0.07, 0.22, 0.08], [0.07, 0.36, -0.02]], hands: [[-0.09, 0.58, 0.33], [0.09, 0.58, 0.33]],
    hat: (h) => blob(h, jersey === '#facc15' ? '#111827' : '#f8fafc', 0, 0.94, 0.33, 0.12, 0.08, 0.15),
  }).position.y = 0.06;
}

// =========================================================================================================
// HOLMENKOLLEN — Oslo's giant ski jump: a tall white steel inrun cantilevered from a top tower down to the
// take-off, the steep snow landing hill with distance lines, the outrun bowl ringed by stands and flags, a
// jumper flying in V-style and a snowy pine forest.
// =========================================================================================================
const sv_holmenkollen: Builder = (gp) => {
  const Y0 = 0.03;
  const land = (x: number) => 0.06 + 0.27 * (1 - sstep(-0.05, 0.3, x));
  const hill = (x: number) => 0.24 * (1 - sstep(-0.15, 0.32, x)) + 0.03;
  const hf = (x: number, z: number) => {
    const n = (fbm(x * 8, 1, z * 8, 3) - 0.5) * 0.03;
    const cor = 1 - sstep(0.08, 0.13, Math.abs(z));
    const hh = hill(x) + n * (1 - cor);
    const lj = x > -0.07 ? land(x) - Y0 : hh;
    let h = hh * (1 - cor) + Math.max(hh, lj) * cor;
    if (x > 0.24) h = h * (1 - sstep(0.24, 0.32, x)) + 0.03 * sstep(0.24, 0.32, x) * (cor > 0.5 ? 1 : 1) + n * 0.2;
    return Math.max(0, h * (1 - sstep(0.44, 0.5, Math.hypot(x, z)) * 0.6));
  };
  const paint: Paint = (x, y, z, _nx, ny) => {
    const cor = Math.abs(z) < 0.075 && x > -0.06;
    if (cor) {
      if (x > 0.12 && x < 0.13) return '#dc2626';
      if (x > 0.2 && x < 0.206) return '#2563eb';
      if (Math.abs(Math.abs(z) - 0.07) < 0.004) return '#3f6b45';
      return shade('#f4f8fb', 0.96 + fbm(x * 40, 0, z * 40, 2) * 0.05);
    }
    return ny < 0.75 ? shade('#d7dee6', 0.92 + fbm(x * 30, y * 30, z * 30, 2) * 0.1) : shade('#eef3f7', 0.93 + fbm(x * 25, y * 20, z * 25, 3) * 0.1);
  };
  base(gp, 0.5, '#eef3f7', paint, Y0, hf, 44, 110, '#5d4a3a');
  // inrun deck: curved box-section from the tower top to the take-off table
  const T: [number, number] = [-0.4, 0.74], C: [number, number] = [-0.13, 0.36], K: [number, number] = [-0.055, 0.345];
  const curve = (t: number): [number, number] => { const u = 1 - t; return [u * u * T[0] + 2 * u * t * C[0] + t * t * K[0], u * u * T[1] + 2 * u * t * C[1] + t * t * K[1]]; };
  const rings: V3[][] = [];
  const NS = 24, HW = 0.03;
  for (let i = 0; i <= NS; i++) {
    const [x, y] = curve(i / NS);
    const dep = 0.028 + 0.012 * Math.sin((i / NS) * Math.PI);
    rings.push([[x, y, -HW], [x, y, HW], [x, y - dep, HW * 0.85], [x, y - dep, -HW * 0.85]]);
  }
  skin(gp, rings, '#f4f6f8', { caps: true, flat: true, paint: (_x, y, z, _nx, ny) => ny > 0.6 ? (Math.abs(Math.abs(z) - 0.012) < 0.005 ? '#9fb7cf' : '#fbfdff') : ny < -0.5 ? '#cfd6de' : '#eef1f4' });
  for (const s of [-1, 1]) for (let i = 0; i < NS; i += 1) {
    const [x0, y0] = curve(i / NS), [x1, y1] = curve((i + 1) / NS);
    rod(gp, [x0, y0 + 0.014, s * HW], [x1, y1 + 0.014, s * HW], 0.0018, '#94a3b8', 4);
    if (i % 3 === 0) rod(gp, [x0, y0, s * HW], [x0, y0 + 0.014, s * HW], 0.0015, '#94a3b8', 4);
  }
  // the big inclined support leg and the top tower with its glass viewing deck
  const [mx, my] = curve(0.45);
  rbox(gp, '#e8ecef', mx - 0.01, 0, 0, 0.03, my - 0.03, 0.035, 0.006);
  for (let k = 0; k < 6; k++) box(gp, '#cbd5e1', mx - 0.01, 0.05 + k * ((my - 0.08) / 6), 0.0185, 0.032, 0.003, 0.002);
  const tw = grp(gp, T[0] - 0.01, 0, 0);
  rbox(tw, '#e8ecef', 0, 0, 0, 0.05, T[1] - 0.02, 0.05, 0.006);
  box(tw, '#d1d5db', 0, T[1] - 0.02, 0, 0.075, 0.008, 0.07);
  glow(box(tw, '#9cc6e4', 0, T[1] - 0.012, 0, 0.068, 0.04, 0.064), '#9cc6e4', '#5f8fb8');
  box(tw, '#e5e7eb', 0, T[1] + 0.028, 0, 0.078, 0.008, 0.074);
  cyl(tw, '#cbd5e1', 0.02, T[1] + 0.036, 0.0, 0.0025, 0.07, 5);
  for (let k = 0; k < 4; k++) rod(tw, [0.02, T[1] + 0.04 + k * 0.016, 0], [0.04, T[1] + 0.04 + k * 0.016, 0], 0.0015, '#cbd5e1', 4);
  flag(tw, -0.03, T[1] + 0.036, 0, 0.05, '#ba0c2f', '#00205b');
  // take-off lip & coaches' platform, judges' tower beside the landing hill
  box(gp, '#cbd5e1', K[0] + 0.005, K[1] - 0.06, 0, 0.012, 0.06, 0.06);
  const jt = grp(gp, 0.05, 0, 0.14, 0.15);
  const jy = Y0 + hf(0.05, 0.14) - 0.01;
  rbox(jt, '#e2e8f0', 0, jy, 0, 0.05, 0.12, 0.04, 0.004);
  glow(box(jt, '#9cc6e4', 0, jy + 0.07, -0.0205, 0.044, 0.04, 0.002), '#9cc6e4', '#5f8fb8');
  box(jt, '#94a3b8', 0, jy + 0.12, 0, 0.056, 0.006, 0.046);
  // outrun stands (curved) with a big crowd and a row of national flags
  const plan = supPlan(0.13, 0.17, 2.2);
  const st = grp(gp, 0.33, Y0 + 0.028, 0);
  stands(st, plan, {
    t0: 0.78, t1: 1.22, n: 30, rows: 7, off0: 0.03, dr: 0.012, y0: 0.012, dh: 0.011,
    seat: crowd(['#ba0c2f', '#00205b', '#f8fafc', '#facc15', '#1d4ed8', '#16a34a']), riser: '#cbd5e1', wall: '#e2e8f0', backH: 0.012,
  });
  const fc = [['#ba0c2f', '#00205b'], ['#006aa7', '#fecc00'], ['#dd0000', '#000000'], ['#d52b1e', '#ffffff'], ['#002395', '#ed2939'], ['#ffffff', '#c8102e']];
  for (let i = 0; i < 6; i++) { const z = -0.12 + i * 0.048; flag(gp, 0.27, Y0 + hf(0.27, z) - 0.004, z, 0.07, fc[i][0], fc[i][1], Math.PI / 2); }
  // jumper in flight, V-style
  const jp = grp(gp, 0.05, 0.4, 0, Math.PI / 2);
  jp.rotation.x = 0.0;
  const body = grp(jp, 0, 0, 0);
  body.rotation.x = 1.15;
  fig(body, 0, -0.03, 0, 0, 0.07, { c: '#dc2626', b: '#1d4ed8', legs: '#1d4ed8', lean: 0.1, hands: [[-0.16, 0.38, -0.06], [0.16, 0.38, -0.06]], hat: (f) => blob(f, '#f8fafc', 0, 0.94, 0, 0.12, 0.12, 0.12) });
  for (const s of [-1, 1]) { const sk = grp(jp, s * 0.008, -0.012, 0.01, s * 0.32); sk.rotation.x = -0.2; box(sk, '#facc15', 0, 0, 0.03, 0.006, 0.0025, 0.13); }
  // snowy pine forest on the hillside (kept clear of the jump corridor and stands)
  for (let i = 0; i < 64; i++) {
    const a = hash3(i, 3, 2) * TAU, r = 0.18 + Math.sqrt(hash3(i, 7, 4)) * 0.3, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) > 0.47 || Math.abs(z) < 0.12 || (x > 0.18 && Math.abs(z) < 0.26)) continue;
    fir(gp, x, Y0 + hf(x, z) - 0.003, z, 0.06 + hash3(i, 1, 2) * 0.035, hash3(i, 4, 4) > 0.5 ? '#2f5a3c' : '#28503a', true);
  }
};

// ---- stadium helpers --------------------------------------------------------------------------------------
/** Polyline plan for straight-ish grandstands; `off` pushes to the right of the travel direction (mitred). */
function polyPlan(pts: [number, number][]): Plan {
  const n = pts.length, seg: number[] = [], nrm: [number, number][] = [];
  let L = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1e-6;
    seg.push(l); L += l; nrm.push([dz / l, -dx / l]);
  }
  const miter = (k: number): [number, number] => {
    const a = nrm[Math.max(0, k - 1)], b = nrm[Math.min(n - 2, k)];
    let mx = a[0] + b[0], mz = a[1] + b[1];
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const d = Math.max(0.35, mx * b[0] + mz * b[1]);
    return [mx / d, mz / d];
  };
  const M = pts.map((_, k) => miter(k));
  return (t, off) => {
    let s = Math.max(0, Math.min(1, t)) * L, i = 0;
    while (i < n - 2 && s > seg[i]) { s -= seg[i]; i++; }
    const u = Math.min(1, s / seg[i]), [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const mx = M[i][0] + (M[i + 1][0] - M[i][0]) * u, mz = M[i][1] + (M[i + 1][1] - M[i][1]) * u;
    return [ax + (bx - ax) * u + mx * off, az + (bz - az) * u + mz * off];
  };
}
function inPoly(pts: [number, number][], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** Football pitch (long axis x): striped turf, white markings and goals. */
function soccer(p: THREE.Object3D, hx: number, hz: number, y: number, grass = '#3f9a3c', n = 44): void {
  const m = 0.014;
  turf(p, (x, z) => Math.abs(x) <= hx + m && Math.abs(z) <= hz + m, hx + m, hz + m, n, y, mow(grass, (hx * 2) / 12, true, 0.14));
  const ly = y + 0.0004, w = 0.0028;
  line(p, -hx, -hz, hx, -hz, ly, w); line(p, -hx, hz, hx, hz, ly, w); line(p, -hx, -hz, -hx, hz, ly, w); line(p, hx, -hz, hx, hz, ly, w);
  line(p, 0, -hz, 0, hz, ly, w);
  ringLine(p, 0, ly + 0.0008, 0, hz * 0.28, w * 0.5, '#f8fafc', 32, 3);
  dot(p, '#f8fafc', 0, ly, 0, 0.004, 6);
  for (const s of [-1, 1]) {
    const pd = hx * 0.17, pw = hz * 0.58, gd = hx * 0.06, gw = hz * 0.27;
    line(p, s * hx, -pw, s * (hx - pd), -pw, ly, w); line(p, s * hx, pw, s * (hx - pd), pw, ly, w); line(p, s * (hx - pd), -pw, s * (hx - pd), pw, ly, w);
    line(p, s * hx, -gw, s * (hx - gd), -gw, ly, w); line(p, s * hx, gw, s * (hx - gd), gw, ly, w); line(p, s * (hx - gd), -gw, s * (hx - gd), gw, ly, w);
    dot(p, '#f8fafc', s * (hx - pd * 0.7), ly, 0, 0.0035, 6);
    const gx = s * hx, W = hz * 0.15, H = 0.02, D = 0.014;
    rod(p, [gx, y, -W], [gx, y + H, -W], 0.0018, '#f8fafc', 5); rod(p, [gx, y, W], [gx, y + H, W], 0.0018, '#f8fafc', 5);
    rod(p, [gx, y + H, -W], [gx, y + H, W], 0.0018, '#f8fafc', 5);
    box(p, '#e2e8f0', gx + s * D, y, 0, 0.002, H * 0.8, W * 2);
    tbox(p, 0.002, W * 2, D, W * 2, 0.0015, '#e2e8f0', gx + s * D / 2, y + H - 0.0015, 0);
  }
}
/** Football kit pose: shirt colour plus an optional chest band (Boca stripe) or vertical stripes. */
const kit = (c: string, shorts: string, band?: string): Pose => ({
  c, b: shorts, sleeve: c, shoes: '#111827',
  hat: band ? (f) => blob(f, band, 0, 0.66, 0.02, 0.143, 0.045, 0.104) : undefined,
});
/** Small football squad: positions in pitch space, all facing the ball. */
function players(p: THREE.Object3D, y: number, pos: [number, number][], pose: (i: number) => Pose, h: number, ball: [number, number]): void {
  pos.forEach(([x, z], i) => {
    const ry = Math.atan2(ball[0] - x, ball[1] - z);
    const run = i % 3 !== 2;
    fig(p, x, y, z, ry, h, { ...pose(i), ...(run ? RUN(i % 2) : {}) });
  });
  dot(p, '#f8fafc', ball[0], y + h * 0.08, ball[1], h * 0.09, 8);
}

// =========================================================================================================
// LA BOMBONERA (Buenos Aires) — Boca Juniors' "chocolate box": three impossibly steep stands wrapped in blue
// and gold around the pitch and the famous flat fourth side of stacked VIP boxes; floodlights, a blue-and-gold
// crowd, Boca players in their gold-banded shirts, and the colourful tin houses of nearby Caminito.
// =========================================================================================================
const sv_bombonera: Builder = (gp) => {
  const Y0 = 0.03, BL = '#0b3d91', YE = '#ffd200';
  const paint: Paint = (x, _y, z) => {
    const r = Math.hypot(x, z);
    if (r > 0.42) return shade('#7c7f86', 0.9 + hash3(Math.floor(x * 70), 1, Math.floor(z * 70)) * 0.14);
    return shade('#b5ada0', 0.9 + hash3(Math.floor(x * 45), 0, Math.floor(z * 45)) * 0.14);
  };
  base(gp, 0.5, '#b5ada0', paint, Y0);
  const st = grp(gp, 0, Y0, -0.02);
  soccer(st, 0.19, 0.115, 0.001, '#3c9a3e');
  const plan = rrPlan(0.215, 0.14, 0.03);
  const tier = (row: number) => (row < 4 ? [BL, BL, YE] : row < 8 ? [YE, YE, BL, '#f8fafc'] : [BL, YE, BL]);
  const seat = (t: number, row: number, i: number) => crowd(tier(row), row % 4 === 3 ? YE : '#1e3a8a', 0.93, 3)(t, row, i);
  const back = (t: number, y: number) => (y < 0.035 ? '#e5e7eb' : Math.floor(t * 46) % 2 ? BL : YE);
  // three steep sides (U), lower on the camera side so the pitch stays visible
  stands(st, plan, { t0: 0.465, t1: 0.705, n: 26, rows: 12, off0: 0.012, dr: 0.0075, dh: 0.0112, y0: 0.012, seat, riser: '#1e3a8a', wall: '#e5e7eb', back, backH: 0.008 });
  stands(st, plan, { t0: 0.705, t1: 0.96, n: 26, rows: 6, off0: 0.012, dr: 0.0075, dh: 0.0112, y0: 0.012, seat, riser: '#1e3a8a', wall: '#e5e7eb', back, backH: 0.006 });
  stands(st, plan, { t0: 0.96, t1: 1.2, n: 26, rows: 12, off0: 0.012, dr: 0.0075, dh: 0.0112, y0: 0.012, seat, riser: '#1e3a8a', wall: '#e5e7eb', back, backH: 0.008 });
  // the flat side: a short lower tier and the vertical wall of palcos (boxes) above
  stands(st, plan, { t0: 0.198, t1: 0.465, n: 20, rows: 3, off0: 0.012, dr: 0.009, dh: 0.01, y0: 0.012, seat, riser: '#1e3a8a', wall: '#e5e7eb', backH: 0.002 });
  const pz = -0.14 - 0.012 - 0.027;
  const pc = grp(st, 0, 0, pz);
  box(pc, '#e5e7eb', 0, 0, -0.022, 0.43, 0.2, 0.034);
  for (let f = 0; f < 5; f++) {
    const y = 0.045 + f * 0.031;
    box(pc, f % 2 ? YE : BL, 0, y - 0.004, -0.004, 0.43, 0.005, 0.006);
    for (let i = 0; i < 16; i++) {
      const x = -0.2 + i * 0.0267;
      box(pc, hash3(i, f, 4) > 0.3 ? '#1f2a44' : '#334155', x, y + 0.002, -0.0055, 0.022, 0.022, 0.003);
      if (hash3(i, f, 8) > 0.55) fan(pc, x + 0.004, y + 0.001, -0.002, 0.016, [BL, YE, '#f8fafc'][i % 3]);
    }
  }
  box(pc, BL, 0, 0.2, -0.022, 0.44, 0.012, 0.04);
  box(pc, YE, 0, 0.212, -0.022, 0.44, 0.006, 0.04);
  // floodlights on the roof edge of the boxes and on the stand corners
  for (const x of [-0.17, -0.06, 0.06, 0.17]) mast(pc, x, 0.218, -0.03, 0.03, 0, 0.04);
  for (const [x, z, ry] of [[-0.29, 0.21, 2.4], [0.29, 0.21, -2.4]] as const) mast(st, x, 0, z, 0.24, ry, 0.06);
  // players (Boca: blue shirts with the gold band) and a white-shirted opponent
  players(st, 0.001, [[-0.05, 0.02], [0.02, -0.03], [-0.1, -0.05], [0.08, 0.05], [-0.16, 0.0]], (i) => (i < 3 ? kit(BL, BL, YE) : i < 4 ? kit('#f8fafc', '#111827') : kit('#16a34a', '#111827')), 0.045, [-0.02, 0.0]);
  fig(st, 0.12, 0.001, -0.06, -2.4, 0.045, { ...kit('#f8fafc', '#111827'), ...RUN(1) });
  fig(st, 0.0, 0.001, 0.07, Math.PI, 0.044, { ...kit('#facc15', '#111827') });
  // Caminito: bright corrugated-tin houses on the street in front
  const tin = ['#e11d48', '#2563eb', '#facc15', '#16a34a', '#f97316', '#0ea5e9'];
  for (let i = 0; i < 5; i++) {
    const x = -0.3 + i * 0.065, z = 0.36 + Math.abs(i - 2) * -0.012;
    const h = grp(gp, x, Y0, z, 0);
    box(h, tin[i], 0, 0, 0, 0.06, 0.07 + (i % 2) * 0.03, 0.05);
    const hh = 0.07 + (i % 2) * 0.03;
    box(h, tin[(i + 2) % 6], 0, hh, 0, 0.064, 0.006, 0.054);
    windows(h, -0.016, 0.012, 0.025, 2, i % 2 ? 2 : 1, 0.032, 0.04, 0.014, 0.024, '#1e293b', tin[(i + 3) % 6]);
    box(h, '#78350f', 0, 0.045, 0.03, 0.06, 0.003, 0.012);
  }
  for (let i = 0; i < 9; i++) { const x = 0.06 + i * 0.03, z = 0.34 + hash3(i, 2, 2) * 0.06; fan(gp, x, Y0, z, 0.032, [BL, YE][i % 2], i % 3 === 0); }
  flag(gp, 0.33, Y0, 0.32, 0.08, BL, YE);
  flag(gp, -0.36, Y0, 0.26, 0.08, '#75aadb', '#f8fafc');
};

// =========================================================================================================
// FNB STADIUM / SOCCER CITY (Johannesburg) — the giant African calabash (clay pot) bowl: a bulging facade of
// earth-coloured mosaic panels with a ring of "fire-pit" lights around its foot, a dark roof ring, the 2010
// World Cup pitch inside, fans with vuvuzelas, a white minibus taxi and a golden mine dump behind.
// =========================================================================================================
const sv_fnb: Builder = (gp) => {
  const Y0 = 0.03;
  const dump = (x: number, z: number) => Math.hypot((x + 0.28) / 1.3, z + 0.33);
  const hf = (x: number, z: number) => 0.09 * (1 - sstep(0.06, 0.14, dump(x, z)));
  const paint: Paint = (x, y, z) => {
    if (y > Y0 + 0.004 && dump(x, z) < 0.15) return shade('#d8b45a', 0.9 + fbm(x * 40, y * 40, z * 40, 2) * 0.16);
    const r = Math.hypot(x / 1.2, z);
    if (r > 0.4) return shade('#6f8f3e', 0.85 + fbm(x * 20, 0, z * 20, 3) * 0.3);
    return shade('#c8bfae', 0.92 + hash3(Math.floor(Math.atan2(z, x) * 14), Math.floor(r * 40), 1) * 0.1);
  };
  base(gp, 0.5, '#c8bfae', paint, Y0, hf, 18, 90);
  const st = grp(gp, 0, Y0, 0.0);
  soccer(st, 0.16, 0.1, 0.001, '#3f9a3c');
  const plan = supPlan(0.215, 0.155, 2.6);
  stands(st, plan, {
    n: 84, rows: 11, off0: 0.012, dr: 0.009, dh: 0.0095, y0: 0.01,
    seat: (t, row, i) => crowd(row < 5 ? ['#c2410c', '#facc15', '#16a34a'] : ['#7f1d1d', '#facc15', '#f8fafc', '#15803d'], '#9a3412', 0.9, 5)(t, row, i),
    riser: '#57534e', wall: '#d6d3d1', backH: 0.004,
  });
  // calabash shell
  const H = 0.155, OFF0 = 0.125, NR = 13, NT = 120;
  const off = (u: number) => OFF0 + 0.035 * Math.sin(Math.PI * Math.min(1, u * 1.08)) - 0.018 * sstep(0.85, 1, u);
  const rings: V3[][] = [];
  for (let k = 0; k <= NR; k++) {
    const u = k / NR, o = off(u), ring: V3[] = [];
    for (let j = 0; j < NT; j++) { const [x, z] = plan(j / NT, o); ring.push([x, u * H, z]); }
    rings.push(ring);
  }
  const earth = ['#b45309', '#92400e', '#c2410c', '#78350f', '#a16207', '#7c2d12', '#57534e', '#d97706', '#44403c', '#9a3412'];
  skin(st, rings, '#b45309', {
    flat: true, paint: (x, y, z) => {
      const a = Math.atan2(z / 0.155, x / 0.215), col = Math.floor(((a + Math.PI) / TAU) * NT), row = Math.floor((y / H) * NR);
      if (row === 1 && col % 2 === 0) return '#1c1917';
      if (row === 0) return '#57534e';
      return earth[Math.floor(hash3(col, row, 7) * earth.length)];
    },
  });
  // fire-pit lights in the dark band
  const lq = new Quads();
  for (let j = 0; j < NT; j += 2) {
    const t = (j + 0.5) / NT, o = off(1.5 / NR) + 0.001, [x, z] = plan(t, o), [x2, z2] = plan(t + 0.004, o);
    const ry = Math.atan2(x2 - x, z2 - z) + Math.PI / 2;
    lq.box(x, H * (1.15 / NR), z, 0.006, H * 0.6 / NR, 0.0015, '#fdba74', ry);
  }
  lq.mesh(st, { emissive: '#f97316' });
  // roof ring (dark, slightly sloping) with a light strip along the inner edge
  const rq = new Quads(), RN = 96;
  for (let j = 0; j < RN; j++) {
    const ta = j / RN, tb = (j + 1) / RN, oi = 0.055, oo = off(1) + 0.004;
    const [ax, az] = plan(ta, oi), [bx, bz] = plan(tb, oi), [cx, cz] = plan(tb, oo), [dx, dz] = plan(ta, oo);
    rq.quad([ax, H + 0.012, az], [bx, H + 0.012, bz], [cx, H, cz], [dx, H, dz], j % 4 ? '#3f3f46' : '#52525b', [0, 1, 0]);
    rq.quad([ax, H + 0.004, az], [bx, H + 0.004, bz], [cx, H - 0.006, cz], [dx, H - 0.006, dz], '#27272a', [0, -1, 0]);
    rq.quad([ax, H + 0.004, az], [bx, H + 0.004, bz], [bx, H + 0.012, bz], [ax, H + 0.012, az], '#f5f5f4', [-ax, 0, -az]);
    if (j % 6 === 0) { const [mx, mz] = plan(ta, 0.08); rq.box(mx, 0.11, mz, 0.004, H - 0.105, 0.004, '#a8a29e'); }
  }
  rq.mesh(st);
  const glq = new Quads();
  for (let j = 0; j < 32; j++) { const t = j / 32, [x, z] = plan(t, 0.054), [x2, z2] = plan(t + 0.01, 0.054); glq.box(x, H + 0.002, z, 0.022, 0.006, 0.004, '#fff7d6', Math.atan2(x2 - x, z2 - z) + Math.PI / 2); }
  glq.mesh(st, { emissive: '#fff2b0' });
  // fans with vuvuzelas on the plaza
  const shirts = ['#facc15', '#16a34a', '#f8fafc', '#dc2626', '#1d4ed8', '#f97316'];
  for (let i = 0; i < 16; i++) {
    const a = 0.9 + (i / 16) * 1.5 + hash3(i, 1, 1) * 0.05, r = 0.39 + hash3(i, 3, 3) * 0.05;
    const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
    if (Math.hypot(x, z) > 0.47) continue;
    fan(gp, x, Y0, z, 0.034, shirts[i % 6], i % 4 === 0);
    if (i % 2) rod(gp, [x, Y0 + 0.028, z + 0.004], [x + 0.012, Y0 + 0.036, z + 0.03], 0.0035, shirts[(i + 2) % 6], 6);
  }
  // white minibus taxi
  const mb = grp(gp, 0.33, Y0, 0.24, -0.9);
  rbox(mb, '#f8fafc', 0, 0.006, 0, 0.034, 0.03, 0.075, 0.006);
  box(mb, '#1e293b', 0, 0.022, 0.0, 0.036, 0.011, 0.06);
  box(mb, '#1e293b', 0, 0.02, 0.036, 0.03, 0.012, 0.004);
  for (const [x, z] of [[-0.017, 0.024], [0.017, 0.024], [-0.017, -0.024], [0.017, -0.024]]) add(mb, g('cyl10', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10)), mat('#18181b'), x, 0.007, z, 0.014, 0.006, 0.014, 0, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) flag(gp, -0.3 + i * 0.04, Y0, 0.36 - i * 0.012, 0.075, ['#007a4d', '#ffb612', '#de3831', '#002395'][i], '#f8fafc');
  for (const [x, z] of [[0.38, -0.2], [0.42, -0.06], [-0.43, 0.06], [0.28, -0.33]] as const) leafy(gp, x, Y0, z, 0.09, '#5b7f35');
};

/** Straight wall segment between two ground points. */
function wallSeg(p: THREE.Object3D, a: [number, number], b: [number, number], y: number, h: number, th: number, c: string): THREE.Mesh {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return box(p, c, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, Math.hypot(dx, dz) + th * 0.6, h, th, -Math.atan2(dz, dx));
}

// =========================================================================================================
// FENWAY PARK (Boston) — America's oldest ballpark: the towering Green Monster in left field with its hand-
// operated scoreboard and seats on top, the CITGO sign beyond, the diamond with its dirt infield and pitcher's
// mound, green seats and red-brick grandstands with light towers, and the Red Sox in the field.
// =========================================================================================================
const sv_fenway: Builder = (gp) => {
  const Y0 = 0.03;
  const paint: Paint = (x, _y, z) => {
    const r = Math.hypot(x, z);
    if (r > 0.43) return shade('#9ca3af', 0.95 + hash3(Math.floor(x * 60), 0, Math.floor(z * 60)) * 0.08);
    return shade('#4b4d55', 0.92 + fbm(x * 30, 0, z * 30, 2) * 0.12);
  };
  base(gp, 0.5, '#4b4d55', paint, Y0);
  const F = grp(gp, 0.0, Y0, 0.02, -0.5);
  const H: [number, number] = [0, 0.27], L: [number, number] = [-0.255, 0.015], M: [number, number] = [-0.085, -0.205], C: [number, number] = [0.03, -0.245];
  const P1: [number, number] = [0.16, -0.205], P2: [number, number] = [0.26, -0.1], R: [number, number] = [0.297, -0.027];
  const GS: [number, number][] = [[0.335, -0.005], [0.17, 0.235], [0.06, 0.325], [-0.06, 0.325], [-0.17, 0.25], [-0.275, 0.07]];
  const fence: [number, number][] = [L, M, C, P1, P2, R];
  const field: [number, number][] = [...GS, L, M, C, P1, P2, R];
  const B = [[0.071, 0.199], [0, 0.128], [-0.071, 0.199]] as const, MD: [number, number] = [0, 0.2];
  const fpaint: Paint = (x, _y, z) => {
    const vx = x - H[0], vz = z - H[1], fair = vz < 0 && Math.abs(vx) <= -vz + 0.002;
    if (Math.abs(Math.abs(vx) + vz) < 0.0022 && vz < 0) return '#f8fafc';
    if (polyDist(fence, x, z) < 0.018) return shade('#a0714a', 0.95 + hash3(Math.floor(x * 90), 1, Math.floor(z * 90)) * 0.1);
    const dm = Math.hypot(x - MD[0], z - MD[1]);
    if (Math.hypot(vx, vz) < 0.026 || dm < 0.014) return '#b07a4f';
    if (fair && dm < 0.103 && Math.abs(x) + Math.abs(z - 0.199) > 0.058) return shade('#b07a4f', 0.96 + hash3(Math.floor(x * 120), 2, Math.floor(z * 120)) * 0.08);
    const k = (Math.floor((x + z) / 0.035 + 100) + Math.floor((x - z) / 0.035 + 100)) % 2;
    return shade('#3f9a3c', (k ? 0.93 : 1.06) * (0.97 + fbm(x * 40, 0, z * 40, 2) * 0.06));
  };
  turf(F, (x, z) => inPoly(field, x, z), 0.35, 0.35, 64, 0.001, fpaint);
  for (const [x, z] of B) box(F, '#f8fafc', x, 0.001, z, 0.008, 0.003, 0.008, Math.PI / 4);
  box(F, '#f8fafc', H[0], 0.001, H[1], 0.007, 0.002, 0.007, Math.PI / 4);
  cyl(F, '#b07a4f', MD[0], 0.0, MD[1], 0.013, 0.005, 12);
  box(F, '#f8fafc', MD[0], 0.005, MD[1], 0.008, 0.001, 0.002);
  // outfield fence + bleachers along centre/right field
  for (let i = 1; i < fence.length - 1; i++) wallSeg(F, fence[i], fence[i + 1], 0, 0.016, 0.006, '#1f4d36');
  stands(F, polyPlan([C, P1, P2, R]), { n: 18, rows: 8, off0: 0.004, dr: 0.009, dh: 0.0085, y0: 0.016, seat: crowd(['#b91c1c', '#1e3a8a', '#f8fafc', '#b91c1c', '#facc15'], '#166534', 0.88, 2), riser: '#14532d', wall: '#1f4d36', back: () => '#8f3a2b', backH: 0.004 });
  // grandstand (green seats, brick back) with roof + light towers
  const gsPlan = polyPlan(GS), rows = 7, dr = 0.0085, dh = 0.0085, top = 0.008 + rows * dh, offE = 0.006 + rows * dr;
  stands(F, gsPlan, {
    n: 40, rows, off0: 0.006, dr, dh, y0: 0.008, seat: crowd(['#b91c1c', '#1e3a8a', '#f8fafc', '#b91c1c', '#0f172a'], '#166534', 0.9, 4),
    riser: '#14532d', wall: '#1f4d36', back: (_t, y) => (y > top * 0.75 ? '#d6c7b0' : '#8f3a2b'), backH: 0.012,
  });
  const rq = new Quads();
  for (let i = 0; i < 30; i++) {
    const ta = i / 30, tb = (i + 1) / 30, yr = top + 0.04;
    const a0 = gsPlan(ta, offE * 0.45), b0 = gsPlan(tb, offE * 0.45), a1 = gsPlan(ta, offE + 0.008), b1 = gsPlan(tb, offE + 0.008);
    rq.quad([a0[0], yr - 0.004, a0[1]], [b0[0], yr - 0.004, b0[1]], [b1[0], yr + 0.004, b1[1]], [a1[0], yr + 0.004, a1[1]], '#e5e7eb', [0, 1, 0]);
    rq.quad([a0[0], yr - 0.007, a0[1]], [b0[0], yr - 0.007, b0[1]], [b0[0], yr - 0.004, b0[1]], [a0[0], yr - 0.004, a0[1]], '#1f4d36', [a0[0] - a1[0], 0, a0[1] - a1[1]]);
    if (i % 3 === 0) { const c = gsPlan(ta, offE * 0.5); rq.box(c[0], top - 0.01, c[1], 0.003, 0.05, 0.003, '#1f4d36'); }
  }
  rq.mesh(F);
  for (const t of [0.05, 0.3, 0.7, 0.95]) {
    const [x, z] = gsPlan(t, offE * 0.7);
    mast(F, x, top + 0.04, z, 0.06, Math.atan2(0.0 - x, 0.0 - z), 0.06);
  }
  // THE GREEN MONSTER: tall left-field wall, manual scoreboard, seats on top, Pesky & Fisk poles
  const mx = (L[0] + M[0]) / 2, mz = (L[1] + M[1]) / 2, len = Math.hypot(M[0] - L[0], M[1] - L[1]);
  const mg = grp(F, mx, 0, mz, Math.atan2(M[1] - L[1], -(M[0] - L[0])) + Math.PI);
  mg.rotation.y = Math.atan2(-(M[1] - L[1]), M[0] - L[0]);
  const GR = '#1f5a3d', MW = 0.11;
  box(mg, GR, 0, 0, -0.012, len + 0.01, MW, 0.024);
  box(mg, '#163d2b', 0.035, 0.022, 0.0005, 0.12, 0.06, 0.002);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 11; c++) {
    if (r < 2 && c === 5) continue;
    box(mg, hash3(r, c, 3) > 0.25 ? '#f8fafc' : '#facc15', -0.012 + c * 0.0095, 0.028 + r * 0.013, 0.0016, 0.006, 0.008, 0.001);
  }
  box(mg, '#f8fafc', -0.08, 0.075, 0.0006, 0.05, 0.012, 0.002);
  for (let k = 0; k < 3; k++) {
    box(mg, '#14532d', 0, MW + k * 0.008, -0.012 - k * 0.009, len, 0.008, 0.012);
    for (let i = 0; i < 10; i++) if (hash3(i, k, 6) > 0.25) fan(mg, -len / 2 + 0.015 + i * (len - 0.03) / 9, MW + 0.008 + k * 0.008, -0.01 - k * 0.009, 0.016, ['#b91c1c', '#1e3a8a', '#f8fafc'][(i + k) % 3]);
  }
  rod(mg, [-len / 2, MW + 0.02, 0], [len / 2, MW + 0.02, 0], 0.0012, '#d4d4d8', 4);
  mast(mg, -0.06, MW + 0.03, -0.03, 0.06, 0, 0.06); mast(mg, 0.07, MW + 0.03, -0.03, 0.06, 0, 0.06);
  cyl(F, '#facc15', L[0], 0, L[1], 0.004, 0.16, 6);
  cyl(F, '#facc15', R[0], 0, R[1], 0.004, 0.07, 6);
  // CITGO sign on a brick block behind the wall
  const cg = grp(F, -0.215, 0, -0.29, mg.rotation.y);
  box(cg, '#8f3a2b', 0, 0, 0, 0.1, 0.12, 0.07);
  windows(cg, -0.035, 0.015, 0.035, 4, 3, 0.023, 0.032, 0.012, 0.018, '#1f2937', '#d6c7b0');
  for (const s of [-1, 1]) rod(cg, [s * 0.03, 0.12, 0], [s * 0.03, 0.15, 0], 0.002, '#52525b', 4);
  box(cg, '#f8fafc', 0, 0.148, 0, 0.09, 0.07, 0.004);
  box(cg, '#1d4ed8', 0, 0.152, 0.0015, 0.082, 0.04, 0.003);
  const tri = new THREE.Shape([new THREE.Vector2(-0.018, 0), new THREE.Vector2(0.018, 0), new THREE.Vector2(0, 0.032)]);
  add(cg, g('sv-citgo', () => new THREE.ExtrudeGeometry(tri, { depth: 0.003, bevelEnabled: false })), mat('#dc2626', { emissive: '#7f1d1d' }), 0, 0.156, 0.002, 1, 1, 1);
  box(cg, '#1d4ed8', 0, 0.196, 0.0015, 0.082, 0.016, 0.003);
  // brick neighbours and street trees
  for (const [x, z, w, h] of [[-0.36, -0.12, 0.08, 0.09], [0.12, -0.36, 0.1, 0.08], [0.36, 0.2, 0.08, 0.07]] as const) {
    const b = grp(F, x, 0, z, Math.atan2(x, z));
    box(b, '#9a4b36', 0, 0, 0, w, h, 0.06);
    windows(b, -w / 2 + 0.014, 0.012, 0.03, Math.round(w / 0.022), Math.round(h / 0.026), 0.022, 0.026, 0.011, 0.015, '#1f2937', '#e7dccb');
    box(b, '#57534e', 0, h, 0, w + 0.004, 0.005, 0.064);
  }
  // Red Sox fielding (white, red socks, navy caps); visiting batter in grey
  const cap = (c: string) => (f: THREE.Group) => { blob(f, c, 0, 0.98, 0.0, 0.112, 0.06, 0.112); blob(f, c, 0, 0.955, 0.09, 0.07, 0.015, 0.05); };
  const sox: Pose = { c: '#f8fafc', b: '#f8fafc', legs: '#b91c1c', shoes: '#111827', hat: cap('#0f1f4b') };
  const toward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  const fpos: [number, number][] = [[0.085, 0.17], [0.05, 0.1], [-0.05, 0.1], [-0.085, 0.17], [-0.15, -0.02], [0.0, -0.12], [0.17, -0.03]];
  for (const [x, z] of fpos) fig(F, x, 0.001, z, toward(x, z, H[0], H[1]), 0.04, { ...sox, lean: 0.3, hands: [[-0.12, 0.32, 0.12], [0.12, 0.32, 0.12]], feet: [[-0.1, 0, 0.02], [0.1, 0, 0.02]] });
  fig(F, MD[0], 0.005, MD[1], 0, 0.042, { ...sox, feet: [[-0.06, 0, -0.08], [0.08, 0.12, 0.12]], hands: [[-0.25, 0.7, -0.1], [0.22, 0.45, 0.15]], lean: 0.2 });
  fig(F, H[0] + 0.012, 0.001, H[1] - 0.004, -Math.PI / 2, 0.042, { c: '#a8a29e', b: '#a8a29e', legs: '#1e3a8a', hat: (f) => blob(f, '#1e3a8a', 0, 0.97, 0, 0.13, 0.11, 0.13), hands: [[-0.02, 0.62, 0.1], [0.04, 0.6, 0.1]], feet: [[-0.12, 0, 0], [0.12, 0, 0]] });
  rod(F, [H[0] + 0.012, 0.028, H[1] - 0.008], [H[0] + 0.026, 0.05, H[1] + 0.002], 0.0018, '#a16207', 5);
  fig(F, H[0], 0.001, H[1] + 0.016, Math.PI, 0.032, { c: '#1e3a8a', b: '#1e293b', legs: '#1e293b', lean: 0.6, hands: [[-0.15, 0.45, 0.2], [0.2, 0.5, 0.2]], feet: [[-0.15, 0, 0.05], [0.15, 0, 0.05]] });
  fig(F, H[0], 0.001, H[1] + 0.03, Math.PI, 0.04, { c: '#111827', b: '#52525b', legs: '#52525b', lean: 0.4 });
  dot(F, '#f8fafc', 0.0, 0.035, 0.24, 0.0035, 6);
};

// =========================================================================================================
// INDIANAPOLIS MOTOR SPEEDWAY — "the Brickyard": a 2.5-mile rounded-rectangle oval with white walls and catch
// fences, the strip of original bricks at the finish line, the glass Pagoda control tower and scoring pylon,
// huge grandstands along the main straight, a golf course and pond in the infield and open-wheel Indy cars
// racing three-wide.
// =========================================================================================================
/** Open-wheel Indy car, ~0.05 long, nose along local +z. */
function indycar(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c: string, c2 = '#f8fafc', s = 1): void {
  const f = grp(p, x, y, z, ry, s);
  tbox(f, 0.012, 0.03, 0.004, 0.03, 0.006, c, 0, 0.004, 0.013);
  rbox(f, c, 0, 0.003, -0.006, 0.02, 0.008, 0.026, 0.003);
  rbox(f, c2, 0, 0.008, -0.01, 0.008, 0.008, 0.018, 0.003);
  dot(f, '#111827', 0, 0.014, 0.004, 0.0035, 7);
  dot(f, c2, 0, 0.0145, 0.0045, 0.0033, 7);
  box(f, '#1f2937', 0, 0.0115, 0.009, 0.009, 0.0015, 0.004);
  box(f, '#111827', 0, 0.002, 0.03, 0.024, 0.0015, 0.006);
  box(f, c, 0, 0.015, -0.022, 0.022, 0.0015, 0.007);
  for (const sx of [-1, 1]) box(f, '#111827', sx * 0.011, 0.007, -0.022, 0.0012, 0.01, 0.008);
  for (const [wx, wz, r] of [[0.0135, 0.019, 0.0048], [-0.0135, 0.019, 0.0048], [0.0145, -0.017, 0.0058], [-0.0145, -0.017, 0.0058]] as const)
    add(f, g('cyl10', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10)), mat('#18181b'), wx, r, wz, r * 2, 0.0065, r * 2, 0, 0, Math.PI / 2);
}
const sv_indy500: Builder = (gp) => {
  const Y0 = 0.03, HX = 0.39, HZ = 0.205, RC = 0.12, TW = 0.068;
  const plan = rrPlan(HX, HZ, RC);
  const sd = (x: number, z: number) => { const qx = Math.abs(x) - (HX - RC), qz = Math.abs(z) - (HZ - RC); return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - RC; };
  const pond = (x: number, z: number) => Math.hypot((x + 0.12) / 1.6, z - 0.03);
  const paint: Paint = (x, _y, z) => {
    const d = sd(x, z);
    if (d > 0.004) return d > 0.1 ? shade('#8a8f98', 0.95 + hash3(Math.floor(x * 50), 0, Math.floor(z * 50)) * 0.06) : shade('#6a8f3e', 0.9 + fbm(x * 30, 0, z * 30, 2) * 0.15);
    if (d > -TW - 0.012) return '#9ca3af';
    if (pond(x, z) < 0.04) return ripple('#3a89b5')(x, 0, z, 0, 1, 0);
    if (pond(x, z) < 0.047) return '#d8c78f';
    const fw = Math.abs(z - 0.02 - Math.sin(x * 9) * 0.03) < 0.035;
    if (Math.hypot(x - 0.16, z - 0.05) < 0.015 || Math.hypot(x + 0.02, z + 0.04) < 0.012) return '#e7d8a6';
    if (Math.hypot(x - 0.2, z - 0.02) < 0.03) return '#7cc155';
    return fw ? shade('#62a443', Math.floor(x * 40) % 2 ? 0.96 : 1.04) : shade('#4f8a37', 0.9 + fbm(x * 25, 0, z * 25, 2) * 0.18);
  };
  base(gp, 0.5, '#4f8a37', paint, Y0, () => 0, 16, 96);
  const st = grp(gp, 0, Y0, 0);
  // asphalt ribbon with banked turns, white lines, outer SAFER wall, catch fence posts
  const q = new Quads(), N = 160;
  for (let i = 0; i < N; i++) {
    const ta = i / N, tb = (i + 1) / N;
    const A = (t: number, o: number, y: number): Q => { const [x, z] = plan(t, o); return [x, y, z]; };
    const [cx, cz] = plan((ta + tb) / 2, 0), turn = Math.abs(cx) > HX - RC && Math.abs(cz) > HZ - RC - 0.001 ? 1 : 0;
    const bank = turn ? 0.008 : 0.002;
    q.quad(A(ta, -TW, 0.002), A(tb, -TW, 0.002), A(tb, 0, 0.002 + bank), A(ta, 0, 0.002 + bank), shade('#3f3f46', 0.95 + (i % 2) * 0.04), [0, 1, 0]);
    q.quad(A(ta, -TW - 0.01, 0.0015), A(tb, -TW - 0.01, 0.0015), A(tb, -TW, 0.002), A(ta, -TW, 0.002), '#a1a1aa', [0, 1, 0]);
    q.quad(A(ta, 0, 0), A(tb, 0, 0), A(tb, 0, 0.016), A(ta, 0, 0.016), '#f8fafc', [-cx, 0, -cz]);
    q.quad(A(ta, 0, 0.016), A(tb, 0, 0.016), A(tb, 0.004, 0.016), A(ta, 0.004, 0.016), '#e5e7eb', [0, 1, 0]);
    q.quad(A(ta, 0.004, 0), A(tb, 0.004, 0), A(tb, 0.004, 0.016), A(ta, 0.004, 0.016), '#d4d4d8', [cx, 0, cz]);
    q.quad(A(ta, 0.002, 0.016), A(tb, 0.002, 0.016), A(tb, 0.002, 0.034), A(ta, 0.002, 0.034), '#94a3b8', [-cx, 0, -cz]);
    q.quad(A(ta, 0.002, 0.016), A(tb, 0.002, 0.016), A(tb, 0.002, 0.034), A(ta, 0.002, 0.034), '#94a3b8', [cx, 0, cz]);
    if (i % 2 === 0) q.quad(A(ta, -TW + 0.003, 0.0026), A(tb, -TW + 0.003, 0.0026), A(tb, -TW + 0.006, 0.0026), A(ta, -TW + 0.006, 0.0026), '#f8fafc', [0, 1, 0]);
    if (i % 2 === 0) { const [px, pz] = plan(ta, 0.002); q.box(px, 0.014, pz, 0.002, 0.024, 0.002, '#64748b'); }
  }
  q.mesh(st);
  // Yard of Bricks across the main straight (back side, z<0) at x=0
  const bz = -HZ + TW / 2;
  box(st, '#9a3412', 0, 0.0025, bz, 0.012, 0.0015, TW);
  for (let k = 0; k < 6; k++) box(st, '#c2410c', 0, 0.0036, bz - TW / 2 + 0.006 + k * 0.011, 0.012, 0.0006, 0.004);
  // main-straight grandstands (outside) with a white roof
  const gsP = polyPlan([[-0.27, -HZ - 0.008], [0.27, -HZ - 0.008]]);
  const rows = 11, dr = 0.0075, dh = 0.009, top = 0.012 + rows * dh;
  stands(st, gsP, { n: 30, rows, off0: 0.002, dr, dh, y0: 0.012, seat: crowd(['#dc2626', '#f8fafc', '#1d4ed8', '#facc15', '#111827'], '#94a3b8', 0.86, 9), riser: '#cbd5e1', wall: '#e5e7eb', backH: 0.01 });
  const rq = new Quads();
  for (let i = 0; i < 12; i++) {
    const ta = i / 12, tb = (i + 1) / 12, yr = top + 0.034;
    const a0 = gsP(ta, 0.03), b0 = gsP(tb, 0.03), a1 = gsP(ta, rows * dr + 0.012), b1 = gsP(tb, rows * dr + 0.012);
    rq.quad([a0[0], yr, a0[1]], [b0[0], yr, b0[1]], [b1[0], yr + 0.008, b1[1]], [a1[0], yr + 0.008, a1[1]], '#f8fafc', [0, 1, 0]);
    rq.quad([a0[0], yr - 0.004, a0[1]], [b0[0], yr - 0.004, b0[1]], [b0[0], yr, b0[1]], [a0[0], yr, a0[1]], '#1e3a8a', [0, 0, 1]);
    const c = gsP(ta, rows * dr * 0.7); rq.box(c[0], top - 0.03, c[1], 0.003, 0.064, 0.003, '#cbd5e1');
  }
  rq.mesh(st);
  // pit lane + garages inside the main straight
  box(st, '#71717a', 0, 0.0005, -HZ + TW + 0.024, 0.5, 0.0018, 0.028);
  for (let i = 0; i < 14; i++) box(st, i % 2 ? '#e2e8f0' : '#cbd5e1', -0.24 + i * 0.037, 0.0, -HZ + TW + 0.048, 0.034, 0.016, 0.02);
  box(st, '#1e3a8a', 0, 0.016, -HZ + TW + 0.048, 0.52, 0.004, 0.022);
  // the Pagoda: stacked glass storeys with broad white cantilevered decks
  const pg = grp(st, 0.07, 0, -HZ + TW + 0.085);
  box(pg, '#e5e7eb', 0, 0, 0, 0.07, 0.016, 0.05);
  for (let k = 0; k < 8; k++) {
    const y = 0.016 + k * 0.022, w = 0.062 - k * 0.0035, d = 0.042 - k * 0.002;
    box(pg, k % 2 ? '#3b5b7a' : '#45678a', 0, y, 0, w, 0.017, d);
    box(pg, '#f8fafc', 0, y + 0.017, 0, w + 0.018, 0.0035, d + 0.016);
    for (const s of [-1, 1]) box(pg, '#cbd5e1', s * (w / 2 + 0.006), y, d / 2 + 0.006, 0.002, 0.017, 0.002);
  }
  box(pg, '#1e3a8a', 0, 0.2, 0, 0.026, 0.02, 0.022);
  cyl(pg, '#e5e7eb', 0, 0.22, 0, 0.0018, 0.06, 5);
  flag(pg, 0.0, 0.25, 0, 0.03, '#111827', '#f8fafc');
  // scoring pylon with lit position numbers
  const py = grp(st, -0.08, 0, -HZ + TW + 0.085);
  box(py, '#1f2937', 0, 0, 0, 0.022, 0.24, 0.014);
  const lq = new Quads();
  for (let k = 0; k < 11; k++) lq.box(-0.08 - 0.005, 0.02 + k * 0.019, py.position.z + 0.0072, 0.008, 0.011, 0.0016, k < 3 ? '#facc15' : '#f8fafc');
  for (let k = 0; k < 11; k++) lq.box(-0.08 + 0.005, 0.02 + k * 0.019, py.position.z + 0.0072, 0.008, 0.011, 0.0016, '#fde68a');
  lq.mesh(st, { emissive: '#fff2b0' });
  box(py, '#facc15', 0, 0.24, 0, 0.026, 0.012, 0.016);
  // infield trees & golfers
  for (const [x, z, s] of [[-0.24, 0.03, 0.08], [-0.26, -0.02, 0.07], [0.27, -0.04, 0.08], [0.06, 0.1, 0.07], [-0.04, 0.12, 0.06], [0.2, 0.12, 0.07], [-0.2, 0.11, 0.06]] as const) leafy(st, x, 0, z, s, '#3f7a34');
  flag(st, 0.2, 0, 0.02, 0.04, '#dc2626');
  fig(st, 0.15, 0, 0.0, 0.5, 0.032, { c: '#f8fafc', b: '#1e3a8a', legs: '#1e3a8a', lean: 0.3, hands: [[0, 0.35, 0.18], [0.02, 0.35, 0.18]] });
  // the race: three-wide pack on the main straight and two leaders through turn 1
  const pal = [['#dc2626', '#f8fafc'], ['#1d4ed8', '#facc15'], ['#f8fafc', '#111827'], ['#facc15', '#111827'], ['#16a34a', '#f8fafc'], ['#f97316', '#1d4ed8'], ['#111827', '#dc2626'], ['#06b6d4', '#f8fafc'], ['#a855f7', '#facc15']];
  const onTrack = (t: number, o: number): [number, number, number] => { const [x, z] = plan(t, o), [x2, z2] = plan(t - 0.002, o); return [x, z, Math.atan2(x2 - x, z2 - z)]; };
  for (let r = 0; r < 3; r++) for (let l = 0; l < 3; l++) {
    const [x, z, ry] = onTrack(0.33 + r * 0.034, -0.014 - l * 0.024);
    indycar(st, x, 0.003, z, ry, pal[r * 3 + l][0], pal[r * 3 + l][1], 1.6);
  }
  for (const [t, o, k] of [[0.62, -0.03, 0], [0.66, -0.045, 4], [0.86, -0.03, 1], [0.08, -0.03, 2]] as const) {
    const [x, z, ry] = onTrack(t, o);
    indycar(st, x, 0.004, z, ry, pal[k][0], pal[k][1], 1.6);
  }
  // parking-lot fans and flags on the outside of turn 2/3
  for (let i = 0; i < 6; i++) flag(gp, -0.45 + i * 0.012, Y0, 0.12 + i * 0.03, 0.06, i % 2 ? '#111827' : '#f8fafc', i % 2 ? '#f8fafc' : '#111827');
};

// =========================================================================================================
// IDITAROD FINISH (Nome, Alaska) — the snowy Front Street finish chute under the famous Burled Arch with the
// widow's lamp, a team of eight huskies pulling the sled and a musher in a red parka, snow fences, cheering
// townsfolk, brightly painted wooden buildings and the frozen Bering Sea.
// =========================================================================================================
/** Husky in trotting pose, nose along local +z, ~0.03 long. */
function husky(p: THREE.Object3D, x: number, y: number, z: number, ry: number, c: string, c2: string, harness: string, ph = 0, s = 1): void {
  const f = grp(p, x, y, z, ry, s);
  blob(f, c, 0, 0.016, 0, 0.0065, 0.0065, 0.014);
  blob(f, c2, 0, 0.013, 0.004, 0.0055, 0.005, 0.009);
  blob(f, c, 0, 0.022, 0.014, 0.006, 0.0058, 0.006);
  blob(f, c2, 0, 0.0195, 0.0195, 0.0032, 0.0028, 0.0045);
  dot(f, '#111827', 0, 0.0205, 0.0238, 0.0012, 5);
  for (const sx of [-1, 1]) cone(f, c, sx * 0.0032, 0.0262, 0.0125, 0.0018, 0.0055, 4);
  rod(f, [0, 0.019, -0.012], [0, 0.028, -0.016], 0.0025, c, 5);
  blob(f, c2, 0, 0.028, -0.013, 0.003, 0.004, 0.003);
  blob(f, harness, 0, 0.0175, 0.003, 0.0068, 0.0055, 0.004);
  const sw = ph ? 1 : -1;
  for (const [lx, lz, a] of [[-0.004, 0.009, 1], [0.004, 0.009, -1], [-0.004, -0.009, -1], [0.004, -0.009, 1]] as const) {
    const k = a * sw * 0.005;
    rod(f, [lx, 0.012, lz], [lx, 0.0, lz + k], 0.0019, c2, 4);
  }
}
const sv_iditarod: Builder = (gp) => {
  const Y0 = 0.03;
  const hf = (x: number, z: number) => (z > 0.3 ? -0.004 : 0) + (fbm(x * 9, 0, z * 9, 2) - 0.5) * 0.004 * (Math.abs(z - 0.01) > 0.08 ? 1 : 0);
  const paint: Paint = (x, y, z) => {
    if (z > 0.31) return shade('#c4dfec', 0.95 + fbm(x * 12, 0, z * 12, 2) * 0.08);
    if (Math.abs(z - 0.01) < 0.075) { const tr = Math.abs(((z - 0.01) * 80) % 1); return shade('#e7edf3', tr < 0.12 ? 0.9 : 1); }
    return shade('#f8fafc', 0.95 + fbm(x * 30, y * 10, z * 30, 2) * 0.06);
  };
  base(gp, 0.5, '#f8fafc', paint, Y0, hf, 20, 96, '#5b4a3a');
  // pressure ridges on the sea ice
  for (let i = 0; i < 7; i++) { const x = -0.34 + i * 0.1 + hash3(i, 1, 1) * 0.03, z = 0.39 + hash3(i, 2, 2) * 0.05; if (Math.hypot(x, z) < 0.47) tbox(gp, 0.04, 0.02, 0.01, 0.006, 0.014, '#dbeafe', x, Y0 - 0.006, z, 0, 0, i); }
  // Front Street buildings
  const cols = ['#b91c1c', '#1d4ed8', '#facc15', '#0f766e', '#f97316', '#7c3aed'];
  for (let i = 0; i < 6; i++) {
    const x = -0.33 + i * 0.13, z = -0.2 - Math.abs(x) * 0.25;
    const b = grp(gp, x, Y0 - 0.003, z, -x * 0.25);
    const c = cols[i], h = 0.08 + (i % 3) * 0.02, w = 0.1;
    box(b, c, 0, 0, 0, w, h, 0.075);
    if (i % 2) box(b, c, 0, h, 0.03, w, 0.025, 0.012);
    else { gable(b, w + 0.008, 0.035, 0.085, '#334155', 0, h, 0, 0); box(b, '#f8fafc', 0, h, 0, w + 0.01, 0.004, 0.085); }
    windows(b, -w / 2 + 0.018, 0.04, 0.0375, 3, 1, 0.032, 0.03, 0.016, 0.02, '#1e293b', '#f8fafc');
    box(b, '#78350f', 0, 0, 0.038, 0.016, 0.03, 0.003);
    box(b, '#f8fafc', 0, h - 0.002, 0.036, w + 0.004, 0.006, 0.006);
  }
  // snow fences lining the chute, spectators behind
  for (const sz of [-1, 1]) {
    const z = 0.01 + sz * 0.085;
    for (let x = -0.4; x < 0.4; x += 0.04) {
      if (Math.hypot(x, z) > 0.46) continue;
      cyl(gp, '#78350f', x, Y0, z, 0.002, 0.022, 4);
      box(gp, '#f97316', x + 0.02, Y0 + 0.006, z, 0.04, 0.012, 0.002);
    }
    for (let i = 0; i < 14; i++) {
      const x = -0.36 + i * 0.055 + hash3(i, sz, 3) * 0.02, zz = z + sz * (0.02 + hash3(i, 4, sz) * 0.015);
      if (Math.hypot(x, zz) > 0.46 || (Math.abs(x - 0.1) < 0.03)) continue;
      fan(gp, x, Y0, zz, 0.036, ['#dc2626', '#1d4ed8', '#16a34a', '#f59e0b', '#7c3aed', '#0f172a'][i % 6], i % 4 === 1);
      if (i % 3 === 0) blob(gp, '#f8fafc', x, Y0 + 0.033, zz, 0.007, 0.004, 0.007);
    }
  }
  // the Burled Arch
  const AX = 0.1, ZA = 0.01, wood = '#8a6a43', wd = '#6b5032';
  const arch = grp(gp, AX, Y0, ZA, 0);
  const post = (z: number) => {
    rod(arch, [0, 0, z], [0.004, 0.17, z + 0.002], 0.009, wood, 7);
    for (let k = 0; k < 5; k++) blob(arch, k % 2 ? wd : wood, (hash3(k, z * 10, 1) - 0.5) * 0.012, 0.03 + k * 0.03, z + (hash3(k, 2, z * 10) - 0.5) * 0.012, 0.011, 0.012, 0.011);
  };
  post(-0.075); post(0.075);
  rod(arch, [0, 0.172, -0.1], [0, 0.178, 0.1], 0.012, wood, 8);
  for (let k = 0; k < 9; k++) blob(arch, k % 2 ? wd : wood, 0, 0.18 + (hash3(k, 3, 3) - 0.5) * 0.008, -0.09 + k * 0.0225, 0.014, 0.014, 0.011);
  rod(arch, [0, 0.19, -0.045], [0, 0.2, 0.045], 0.007, wd, 6);
  box(arch, '#f5e6c8', 0.013, 0.125, 0, 0.003, 0.03, 0.12);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) box(arch, r ? '#1d4ed8' : '#b91c1c', 0.0148, 0.132 + r * 0.012, -0.05 + k * 0.0125, 0.001, 0.006, 0.008);
  for (const s of [-1, 1]) rod(arch, [0.013, 0.155, s * 0.05], [0.004, 0.172, s * 0.05], 0.0012, '#44403c', 4);
  rod(arch, [0, 0.165, 0.05], [0.0, 0.14, 0.05], 0.001, '#111827', 3);
  glow(dot(arch, '#fde68a', 0.0, 0.134, 0.05, 0.006, 8), '#fde68a', '#f59e0b');
  box(arch, '#111827', -0.004, 0.141, 0.046, 0.008, 0.002, 0.008);
  // banners & flags along the chute
  for (let i = 0; i < 5; i++) flag(gp, -0.3 + i * 0.12, Y0, -0.09, 0.08, cols[i], '#f8fafc');
  // the team: 4 pairs on a gangline, sled & musher
  const dogC: [string, string][] = [['#4b5563', '#f8fafc'], ['#111827', '#f8fafc'], ['#9ca3af', '#f8fafc'], ['#a16207', '#fef3c7'], ['#57534e', '#e7e5e4'], ['#111827', '#e5e7eb'], ['#d6d3d1', '#f8fafc'], ['#78350f', '#fef3c7']];
  const DS = 2.1, gz = ZA;
  rod(gp, [0.07, Y0 + 0.03, gz], [-0.16, Y0 + 0.02, gz], 0.0012, '#dc2626', 4);
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const x = 0.04 - k * 0.055, i = k * 2 + (s > 0 ? 1 : 0);
    husky(gp, x, Y0, gz + s * 0.017, Math.PI / 2 + s * 0.06, dogC[i][0], dogC[i][1], i % 2 ? '#2563eb' : '#dc2626', (k + (s > 0 ? 1 : 0)) % 2, DS);
  }
  const sl = grp(gp, -0.19, Y0, gz, Math.PI / 2);
  for (const sx of [-1, 1]) {
    box(sl, '#e5e7eb', sx * 0.012, 0.001, 0, 0.003, 0.002, 0.09);
    rod(sl, [sx * 0.012, 0.002, 0.045], [sx * 0.012, 0.012, 0.055], 0.0015, '#e5e7eb', 4);
    for (const z of [-0.035, 0.0, 0.03]) rod(sl, [sx * 0.012, 0.002, z], [sx * 0.012, 0.018, z], 0.0013, '#a16207', 4);
    rod(sl, [sx * 0.012, 0.018, -0.04], [sx * 0.012, 0.045, -0.05], 0.0015, '#a16207', 4);
  }
  rod(sl, [-0.012, 0.045, -0.05], [0.012, 0.045, -0.05], 0.0015, '#a16207', 4);
  box(sl, '#1e3a8a', 0, 0.016, 0.0, 0.026, 0.012, 0.06);
  box(sl, '#a16207', 0, 0.014, 0.0, 0.028, 0.002, 0.075);
  const mu = fig(sl, 0, 0.003, -0.05, 0, 0.075, { c: '#dc2626', b: '#1f2937', legs: '#1f2937', sleeve: '#dc2626', bulk: 1.25, lean: 0.25, shoes: '#3f3f46',
    hands: [[-0.15, 0.55, 0.12], [0.15, 0.55, 0.12]], hat: (f) => { blob(f, '#e7d7b8', 0, 0.92, 0.0, 0.135, 0.14, 0.13); blob(f, '#dc2626', 0, 0.96, -0.02, 0.12, 0.11, 0.11); } });
  box(mu, '#f8fafc', 0, 0.56, 0.08, 0.16, 0.14, 0.02);
  box(mu, '#111827', 0, 0.6, 0.091, 0.07, 0.05, 0.003);
  // snow machine parked by the buildings
  const sm = grp(gp, -0.25, Y0, -0.11, 0.4);
  rbox(sm, '#1d4ed8', 0, 0.006, 0, 0.022, 0.014, 0.05, 0.004);
  box(sm, '#111827', 0, 0.0, -0.005, 0.02, 0.008, 0.035);
  for (const s of [-1, 1]) box(sm, '#9ca3af', s * 0.012, 0.0, 0.03, 0.004, 0.002, 0.02);
  box(sm, '#111827', 0, 0.02, -0.006, 0.016, 0.006, 0.02);
};

// =========================================================================================================
// BANZAI PIPELINE (Oahu, Hawaii) — the world's most famous surf break: a thick turquoise wave pitching its
// lip into a perfect hollow barrel with a surfer crouched inside, whitewater exploding where it closes out,
// the shallow lava reef below, and the North Shore beach with palms, a yellow lifeguard tower and surfboards.
// =========================================================================================================
const sv_pipeline: Builder = (gp) => {
  const Y0 = 0.03, BX = -0.3, RW = 0.75, cr = Math.cos(RW), sr = Math.sin(RW);
  const W = grp(gp, 0, 0, 0, RW);
  const hfL = (x: number, z: number) => 0.03 * sstep(BX + 0.05, BX - 0.06, x + Math.sin(z * 6) * 0.02) + (x < BX ? (fbm(x * 20, 0, z * 20, 2) - 0.5) * 0.004 : 0);
  const hf = (x: number, z: number) => hfL(x * cr - z * sr, x * sr + z * cr);
  const paint: Paint = (wx, y, wz) => {
    const x = wx * cr - wz * sr, z = wx * sr + wz * cr;
    const bx = x + Math.sin(z * 6) * 0.02;
    if (y > Y0 + 0.012) return shade('#f2deb0', 0.94 + fbm(x * 50, 0, z * 50, 2) * 0.1);
    if (y > Y0 + 0.004) return '#e8d29f';
    if (bx < BX + 0.02) return mix('#5ed6d0', '#f8fafc', Math.abs(Math.sin(z * 30)) > 0.7 ? 0.7 : 0.2);
    const reef = fbm(x * 14, 3, z * 14, 3);
    const deep = sstep(-0.1, 0.4, x);
    const base = mix(reef > 0.55 ? '#2f8e8a' : '#2bb5c0', '#1677a3', deep);
    return ripple(base)(x, y, z, 0, 1, 0);
  };
  base(gp, 0.5, '#1677a3', paint, Y0, hf, 22, 100, '#6b5a44');
  
  // wave surface (one painted strip, normals chosen per quad so the barrel interior faces outward)
  const full: [number, number][] = [[1.3, 0], [0.9, 0.12], [0.55, 0.4], [0.3, 0.72], [0.1, 0.95], [-0.1, 1.02], [-0.3, 0.98], [-0.48, 0.85], [-0.6, 0.65], [-0.66, 0.42], [-0.63, 0.28],
    [-0.57, 0.44], [-0.5, 0.64], [-0.38, 0.78], [-0.2, 0.83], [-0.05, 0.78], [0.04, 0.63], [0.07, 0.45], [0.03, 0.26], [-0.06, 0.11], [-0.22, 0.03], [-0.5, 0.0], [-0.95, 0]];
  const KC = 5, n = full.length;
  const flat: [number, number][] = full.map(([x, y], k) => {
    if (k <= KC) return [x, y];
    const u = (k - KC) / (n - 1 - KC);
    return [-0.1 - 0.85 * u, 1.02 * Math.pow(1 - u, 1.6)];
  });
  const S = 0.2, NZ = 44, Z0 = -0.36, Z1 = 0.36;
  const curl = (z: number) => 1 - sstep(0.1, 0.3, z), hgt = (z: number) => 1 - 0.75 * sstep(0.12, 0.36, z) - 0.15 * sstep(-0.1, -0.36, z);
  const ring = (z: number): Q[] => {
    const c = curl(z), h = hgt(z), sx = Math.sin(z * 3) * 0.03 - z * 0.06;
    return full.map(([fx, fy], k) => { const [ux, uy] = flat[k]; return [sx + (ux + (fx - ux) * c) * S, Y0 + 0.001 + (uy + (fy - uy) * c) * S * h, z] as Q; });
  };
  const RG: Q[][] = [];
  for (let i = 0; i <= NZ; i++) RG.push(ring(Z0 + ((Z1 - Z0) * i) / NZ));
  const wq = new Quads();
  const col = (k: number, y: number, z: number) => {
    const hy = (y - Y0) / S;
    if (k >= 8 && k <= 11 && curl(z) > 0.4) return hash3(k, Math.floor(z * 90), 2) > 0.35 ? '#f8fafc' : '#d9f6f7';
    if (k <= 4) return shade('#127a9a', 0.85 + hy * 0.5);
    if (k <= 7) return mix('#3fc8d4', '#b6f0ef', 0.4);
    if (k <= 16) return mix('#0f7f8c', '#2fb8c2', (k - 11) / 5);
    return mix('#2ad0d6', '#7fe3e3', hy);
  };
  for (let i = 0; i < NZ; i++) for (let k = 0; k < n - 1; k++) {
    const a = RG[i][k], b = RG[i + 1][k], c = RG[i + 1][k + 1], d = RG[i][k + 1];
    const tx = d[0] - a[0], ty = d[1] - a[1];
    wq.quad(a, b, c, d, col(k, (a[1] + d[1]) / 2, a[2]), [ty, -tx, 0]);
  }
  const capR = (r: Q[], want: Q) => { for (let k = 0; k < n - 1; k++) wq.quad(r[k], r[k + 1], [r[k + 1][0], Y0, r[k + 1][2]], [r[k][0], Y0, r[k][2]], '#1a8fb0', want); };
  capR(RG[NZ], [0, 0, 1]); capR(RG[0], [0, 0, -1]);
  wq.mesh(W, { rough: 0.25 });
  // whitewater where the barrel closes out + spray off the lip
  for (let i = 0; i < 26; i++) {
    const z = Z0 + 0.02 + hash3(i, 1, 4) * 0.2, x = -0.18 + hash3(i, 2, 4) * 0.2, y = Y0 + 0.01 + hash3(i, 3, 4) * 0.12 * (1 - (z - Z0) / 0.3);
    blob(W, i % 3 ? '#f8fafc' : '#e0f7fa', x, y, z, 0.03 + hash3(i, 5, 5) * 0.03, 0.025 + hash3(i, 6, 6) * 0.02, 0.03);
  }
  for (let i = 0; i < 10; i++) {
    const z = -0.12 + i * 0.03, r = ring(z)[10];
    dot(W, '#f8fafc', r[0] - 0.006, r[1] - 0.01 - hash3(i, 1, 1) * 0.015, z, 0.006 + hash3(i, 2, 2) * 0.005, 6);
  }
  for (let i = 0; i < 12; i++) { const x = -0.22 - hash3(i, 7, 7) * 0.06, z = -0.3 + i * 0.05; blob(W, '#f1fbfc', x, Y0 + 0.002, z, 0.03, 0.006, 0.02); }
  // the surfer inside the tube, riding toward the opening (+z)
  const sfz = 0.075, fr = ring(sfz), fb = fr[19];
  const sb = grp(W, fb[0] - 0.005, fb[1] + 0.002, sfz, 0);
  sb.rotation.z = -0.5;
  rbox(sb, '#f97316', 0, 0, 0, 0.012, 0.003, 0.055, 0.0014);
  box(sb, '#f8fafc', 0, 0.003, 0, 0.002, 0.0005, 0.05);
  fig(sb, 0, 0.003, 0, Math.PI / 2 - 0.4, 0.05, { c: '#111827', b: '#1d4ed8', legs: '#c58c5c', skin: '#c58c5c', lean: 0.7, feet: [[-0.15, 0, 0.05], [0.15, 0, -0.05]], hands: [[-0.35, 0.5, 0.1], [0.3, 0.42, 0.18]], hat: (f) => blob(f, '#3b2a1f', 0, 0.95, -0.02, 0.12, 0.09, 0.12) });
  // paddling surfer out the back and one on the shoulder
  const pad = grp(W, 0.3, Y0 + 0.002, -0.12, -0.6);
  rbox(pad, '#facc15', 0, 0, 0, 0.012, 0.003, 0.05, 0.0014);
  blob(pad, '#16a34a', 0, 0.006, 0.0, 0.006, 0.004, 0.015); dot(pad, '#c58c5c', 0, 0.007, 0.018, 0.005, 6);
  const sh = ring(0.3)[3];
  const s2 = grp(W, sh[0], sh[1] - 0.004, 0.3, 0); s2.rotation.z = 0.4;
  rbox(s2, '#f8fafc', 0, 0, 0, 0.012, 0.003, 0.05, 0.0014);
  fig(s2, 0, 0.003, 0, -Math.PI / 2, 0.045, { c: '#dc2626', b: '#111827', lean: 0.4, feet: [[-0.15, 0, 0.05], [0.15, 0, -0.05]], hands: [[-0.35, 0.55, 0], [0.35, 0.55, 0]] });
  // beach: palms, lifeguard tower, boards in the sand, beachgoers
  const palm = (x: number, z: number, h: number, lean: number) => {
    const y = Y0 + hfL(x, z) - 0.002;
    let px = x, py = y;
    for (let k = 0; k < 5; k++) { const nx = px + lean * 0.012 * (k + 1) / 3, ny = py + h / 5; rod(W, [px, py, z], [nx, ny, z], 0.005 - k * 0.0005, '#8b6b4a', 5); px = nx; py = ny; }
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; blob(W, k % 2 ? '#2f7d32' : '#3d9440', px + Math.cos(a) * 0.028, py - 0.008, z + Math.sin(a) * 0.028, 0.032, 0.004, 0.009, -a); }
    dot(W, '#5b3a1e', px, py - 0.006, z, 0.008, 6);
  };
  palm(-0.42, -0.18, 0.17, 1); palm(-0.4, 0.05, 0.14, 1.5); palm(-0.44, 0.22, 0.16, 0.7); palm(-0.36, -0.32, 0.12, 1.2);
  const lg = grp(W, -0.35, Y0 + 0.03, 0.14, Math.PI / 2);
  for (const [x, z] of [[-0.015, -0.012], [0.015, -0.012], [-0.015, 0.012], [0.015, 0.012]]) cyl(lg, '#facc15', x, 0, z, 0.002, 0.04, 4);
  box(lg, '#facc15', 0, 0.04, 0, 0.04, 0.025, 0.03);
  box(lg, '#1e3a8a', 0, 0.05, 0.0155, 0.03, 0.01, 0.001);
  tbox(lg, 0.05, 0.04, 0.03, 0.026, 0.01, '#dc2626', 0, 0.065, 0);
  rod(lg, [0, 0, 0.03], [0, 0.04, 0.015], 0.002, '#facc15', 4);
  for (let i = 0; i < 5; i++) {
    const x = -0.39 + (i % 2) * 0.012, z = -0.08 + i * 0.022;
    const b = grp(W, x, Y0 + hfL(x, z) + 0.022, z, Math.PI / 2 + 0.1 * i); b.rotation.x = 0.1;
    rbox(b, ['#f97316', '#38bdf8', '#f8fafc', '#facc15', '#ec4899'][i], 0, -0.022, 0, 0.012, 0.055, 0.003, 0.004);
  }
  for (let i = 0; i < 4; i++) fan(W, -0.37 - (i % 2) * 0.03, Y0 + 0.028, 0.3 - i * 0.12, 0.034, ['#ec4899', '#f8fafc', '#0ea5e9', '#facc15'][i]);
};

/** Chinese/Japanese hipped roof with curved, upturned eaves (W along x, D along z), ridge on top. */
function eaveRoof(p: THREE.Object3D, x: number, y: number, z: number, W: number, D: number, h: number, c: string, ov = 0.02, lift = 0.016, ry = 0): THREE.Group {
  const f = grp(p, x, y, z, ry), NP = 48;
  const rect = (wx: number, dz: number, yy: number, lf: number): V3[] => {
    const r: V3[] = [];
    for (let j = 0; j < NP; j++) {
      const th = (j / NP) * TAU, cc = Math.cos(th), ss = Math.sin(th);
      const cf = Math.pow(2 * Math.abs(cc * ss), 6);
      r.push([wx * Math.sign(cc) * Math.pow(Math.abs(cc), 0.25), yy + lf * cf, dz * Math.sign(ss) * Math.pow(Math.abs(ss), 0.25)]);
    }
    return r;
  };
  const hw = W / 2 + ov, hd = D / 2 + ov;
  skin(f, [rect(hw, hd, 0, lift), rect(hw, hd, 0.006, lift * 1.05), rect(hw * 0.72, hd * 0.42, h * 0.55, lift * 0.25), rect(hw * 0.6, 0.004, h, 0)], c, {
    caps: true, flat: true, paint: (px, py, pz, _nx, ny) => (ny < -0.3 ? shade(c, 0.6) : py < 0.007 ? shade(c, 0.8) : shade(c, Math.floor((Math.abs(px) + Math.abs(pz)) * 140) % 2 ? 0.92 : 1.05)),
  });
  box(f, shade(c, 0.7), 0, h - 0.004, 0, hw * 1.2, 0.012, 0.012);
  for (const s of [-1, 1]) blob(f, shade(c, 0.6), s * hw * 0.6, h + 0.01, 0, 0.007, 0.012, 0.006, 0, 0, s * 0.4);
  return f;
}

// =========================================================================================================
// SUMO (Kyushu Basho, Fukuoka) — the raised clay dohyo with its straw-bale ring and white shikiri lines under
// the hanging shinmei-style roof with purple drapes and four coloured corner tassels; two rikishi crash
// together at the tachiai while the gyoji in a bright kimono points his gunbai fan; black-robed judges,
// box seats full of fans and tall nobori banners.
// =========================================================================================================
const sv_sumo: Builder = (gp) => {
  const Y0 = 0.03, DT = 0.065, DH = 0.165;
  const paint: Paint = (x, _y, z) => shade('#9a6b43', (Math.floor(x * 45 + 100) % 2 ? 0.94 : 1.04) * (0.95 + hash3(Math.floor(x * 45), 0, Math.floor(z * 8)) * 0.1));
  base(gp, 0.5, '#9a6b43', paint, Y0);
  // dohyo
  const dq = new Quads();
  tbox(gp, DH * 2 + 0.03, DH * 2 + 0.03, DH * 2, DH * 2, DT, '#c49a66', 0, Y0, 0);
  for (const s of [-1, 1]) { tbox(gp, 0.05, 0.03, 0.05, 0.01, DT * 0.5, '#b58a58', s * 0.07, Y0, DH + 0.025); tbox(gp, 0.05, 0.03, 0.05, 0.01, DT * 0.5, '#b58a58', DH + 0.025, Y0, s * 0.07, 0, 0, Math.PI / 2); }
  box(gp, '#dcc59a', 0, Y0 + DT, 0, DH * 2 - 0.004, 0.0015, DH * 2 - 0.004);
  ringLine(gp, 0, Y0 + DT + 0.003, 0, 0.11, 0.0075, '#d9c78e', 48, 6);
  for (const [x0, z0, x1, z1] of [[-DH, -DH, DH, -DH], [-DH, DH, DH, DH], [-DH, -DH, -DH, DH], [DH, -DH, DH, DH]]) line(gp, x0 * 0.94, z0 * 0.94, x1 * 0.94, z1 * 0.94, Y0 + DT, 0.009, '#cdb67e', 0.006);
  for (const s of [-1, 1]) line(gp, s * 0.02, -0.014, s * 0.02, 0.014, Y0 + DT + 0.0005, 0.003, '#f8fafc', 0.001);
  dq.box(DH - 0.02, Y0 + DT, -DH + 0.02, 0.018, 0.01, 0.018, '#78350f');
  dq.box(-DH + 0.02, Y0 + DT, -DH + 0.02, 0.018, 0.012, 0.018, '#e7e5e4');
  dq.mesh(gp);
  // suspended roof (tsuriyane)
  const RY = Y0 + DT + 0.31, R = grp(gp, 0, RY, 0);
  const purple = '#4c1d95';
  for (const [x, z, w, d] of [[0, DH + 0.01, DH * 2 + 0.03, 0.006], [0, -DH - 0.01, DH * 2 + 0.03, 0.006], [DH + 0.01, 0, 0.006, DH * 2 + 0.03], [-DH - 0.01, 0, 0.006, DH * 2 + 0.03]] as const) {
    box(R, purple, x, -0.032, z, w, 0.032, d);
    box(R, '#f8fafc', x, -0.034, z, w + 0.001, 0.003, d + 0.001);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    for (const s of [-1, 1]) {
      const x = s * DH * 0.5 * (i % 2 ? 1 : 0) + (i === 0 ? s * 0.08 : 0), z = DH + 0.014;
      const v = grp(R, 0, 0, 0, a);
      dot(v, '#facc15', x, -0.018, z, 0.006, 8);
    }
  }
  box(R, '#e7dcc6', 0, -0.002, 0, DH * 2 + 0.03, 0.004, DH * 2 + 0.03);
  box(R, '#5b3a22', 0, 0.002, 0, DH * 2 + 0.07, 0.012, DH * 2 + 0.07);
  gable(R, DH * 2 + 0.07, 0.085, DH * 2 + 0.1, '#1c1917', 0, 0.014, 0, 0);
  for (const s of [-1, 1]) {
    rod(R, [s * (DH + 0.04), 0.014, -(DH + 0.05)], [s * (DH + 0.04), 0.13, 0.035], 0.004, '#4b3a2a', 4);
    rod(R, [s * (DH + 0.04), 0.014, DH + 0.05], [s * (DH + 0.04), 0.13, -0.035], 0.004, '#4b3a2a', 4);
  }
  box(R, '#4b3a2a', 0, 0.096, 0, DH * 2 + 0.08, 0.008, 0.016);
  for (let k = 0; k < 5; k++) rod(R, [-0.12 + k * 0.06, 0.112, -0.016], [-0.12 + k * 0.06, 0.112, 0.016], 0.006, '#c8a24a', 8);
  for (const s of [-1, 1]) rod(R, [s * 0.08, 0.1, 0], [s * 0.08, 0.2, 0], 0.0015, '#52525b', 4);
  const fusa: [number, number, string][] = [[1, -1, '#15803d'], [1, 1, '#dc2626'], [-1, 1, '#f8fafc'], [-1, -1, '#111827']];
  for (const [sx, sz, c] of fusa) {
    const x = sx * (DH + 0.01), z = sz * (DH + 0.01);
    rod(R, [x, -0.03, z], [x, -0.07, z], 0.002, c, 4);
    blob(R, c, x, -0.075, z, 0.008, 0.008, 0.008);
    cone(R, c, x, -0.13, z, 0.013, 0.055, 10).rotation.x = Math.PI;
  }
  // rikishi at the tachiai
  const sk = ['#e9b48c', '#d9a07a'];
  const topknot = (f: THREE.Group) => blob(f, '#0b0b0f', 0, 1.02, -0.01, 0.04, 0.035, 0.07);
  const ty = Y0 + DT + 0.0015;
  [[-1, '#1e1b4b'], [1, '#7c2d12']].forEach(([s, mw], i) => {
    const sgn = s as number;
    const f = fig(gp, sgn * 0.03, ty, 0.005 * sgn, -sgn * Math.PI / 2, 0.085, {
      c: sk[i], b: mw as string, legs: sk[i], sleeve: sk[i], skin: sk[i], hair: '#0b0b0f', bulk: 1.9, lean: 0.95,
      feet: [[-0.24, 0, -0.12], [0.24, 0, -0.04]], hands: [[-0.16, 0.5, 0.42], [0.18, 0.52, 0.42]], hat: topknot,
    });
    blob(f, sk[i], 0, 0.52, 0.11, 0.22, 0.17, 0.16);
    blob(f, mw as string, 0, 0.44, 0.0, 0.25, 0.06, 0.2);
    for (let k = -2; k <= 2; k++) rod(f, [k * 0.04, 0.42, 0.17], [k * 0.045, 0.3, 0.175], 0.008, mw as string, 3);
  });
  // gyoji with gunbai fan, eboshi hat
  const gy = fig(gp, 0.01, ty, -0.09, 0, 0.07, {
    c: '#0e7490', b: '#0e7490', legs: '#0e7490', sleeve: '#f59e0b', hands: [[-0.2, 0.45, 0.1], [0.24, 0.85, 0.2]],
    hat: (f) => { blob(f, '#111827', 0, 1.06, -0.02, 0.07, 0.11, 0.09); },
  });
  tbox(gy, 0.3, 0.22, 0.24, 0.16, 0.42, '#0e7490', 0, 0.02, 0);
  box(gy, '#facc15', 0, 0.2, 0.08, 0.26, 0.02, 0.01);
  rod(gy, [0.24, 0.85, 0.2], [0.24, 1.05, 0.22], 0.012, '#5b3a22', 4);
  blob(gy, '#111827', 0.24, 1.15, 0.22, 0.1, 0.12, 0.012);
  blob(gy, '#facc15', 0.24, 1.15, 0.228, 0.05, 0.06, 0.008);
  // judges on cushions around the dohyo
  for (const [x, z] of [[0, DH + 0.06], [-0.14, DH + 0.06], [0.14, DH + 0.06], [DH + 0.06, 0.05], [-DH - 0.06, 0.05]] as const) {
    box(gp, '#7c2d12', x, Y0, z, 0.026, 0.004, 0.026);
    fan(gp, x, Y0 + 0.004, z, 0.04, '#111827', false, true);
  }
  // masu-seki box seats with families on cushions
  const mq = new Quads(), C = 0.055;
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) {
    const x = i * C, z = j * C, m = Math.max(Math.abs(x), Math.abs(z));
    if (m < DH + 0.1 || Math.hypot(x, z) > 0.44) continue;
    mq.box(x - C / 2 + 0.001, Y0, z, 0.002, 0.008, C, '#5b3a22');
    mq.box(x, Y0, z - C / 2 + 0.001, C, 0.008, 0.002, '#5b3a22');
    for (let k = 0; k < 4; k++) mq.box(x + ((k % 2) - 0.5) * 0.024, Y0, z + (Math.floor(k / 2) - 0.5) * 0.024, 0.016, 0.003, 0.016, ['#be123c', '#7c3aed', '#0e7490', '#ca8a04'][(i + j + 20) % 4]);
    for (let k = 0; k < 2; k++) if (hash3(i, j, k) > 0.6) fan(gp, x + (k - 0.5) * 0.024, Y0 + 0.003, z + (hash3(j, i, 1) - 0.5) * 0.02, 0.03, ['#1e3a8a', '#f8fafc', '#be185d', '#166534', '#57534e', '#ca8a04'][Math.floor(hash3(i, j, k + 4) * 6)], false, true);
  }
  mq.mesh(gp);
  // nobori banners at the back
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 1.2 + (i / 6) * Math.PI * 0.6, x = Math.cos(a) * 0.46, z = Math.sin(a) * 0.46;
    cyl(gp, '#d6d3d1', x, Y0, z, 0.0025, 0.22, 4);
    const c = ['#dc2626', '#1d4ed8', '#16a34a', '#facc15', '#7c3aed', '#f97316', '#0e7490'][i];
    const b = grp(gp, x, Y0 + 0.08, z, -a - Math.PI / 2);
    box(b, c, 0.012, 0, 0, 0.022, 0.13, 0.002);
    for (let k = 0; k < 4; k++) box(b, '#f8fafc', 0.012, 0.03 + k * 0.025, 0.0012, 0.01, 0.012, 0.001);
  }
};

// =========================================================================================================
// SHAOLIN TEMPLE (Mount Song, Henan) — birthplace of Shaolin kung fu: the red mountain gate with its sweeping
// grey-tiled roof, black-and-gold name plaque and guardian stone lions; rows of saffron-robed monks practising
// stances, a flying kick and staff form in the courtyard, the Pagoda Forest of stone stupas and pine-clad peaks.
// =========================================================================================================
function stupa(p: THREE.Object3D, x: number, y: number, z: number, n: number, s: number, c = '#a8a29e'): void {
  const f = grp(p, x, y, z, 0, s);
  box(f, shade(c, 0.9), 0, 0, 0, 0.06, 0.02, 0.06);
  box(f, c, 0, 0.02, 0, 0.04, 0.035, 0.04);
  for (let k = 0; k < n; k++) {
    const y0 = 0.055 + k * 0.022, w = 0.058 - k * 0.006;
    box(f, shade(c, 0.85), 0, y0, 0, w, 0.006, w);
    box(f, c, 0, y0 + 0.006, 0, w * 0.6, 0.016, w * 0.6);
  }
  const yt = 0.055 + n * 0.022;
  cone(f, shade(c, 0.9), 0, yt, 0, 0.012, 0.03, 8);
  dot(f, shade(c, 0.8), 0, yt + 0.032, 0, 0.006, 6);
}
const sv_shaolin: Builder = (gp) => {
  const Y0 = 0.03;
  const hf = (x: number, z: number) => {
    const m = sstep(-0.16, -0.42, z + Math.sin(x * 5) * 0.03);
    const pk = 0.32 * Math.exp(-((x + 0.18) ** 2) / 0.03) + 0.26 * Math.exp(-((x - 0.2) ** 2) / 0.02) + 0.12;
    return m * pk * (0.85 + fbm(x * 8, 0, z * 8, 3) * 0.3) + (fbm(x * 12, 1, z * 12, 2) - 0.5) * 0.01 * (1 - sstep(0.0, 0.3, Math.abs(x)) * 0 - (Math.abs(x) < 0.3 && z > -0.2 ? 1 : 0));
  };
  const court = (x: number, z: number) => Math.abs(x) < 0.27 && z > -0.13 && z < 0.36;
  const paint: Paint = (x, y, z, _nx, ny) => {
    const h = y - Y0;
    if (court(x, z) && h < 0.003) {
      const gx = Math.abs((x * 40) % 1), gz = Math.abs((z * 30) % 1);
      return shade('#bdb5a6', gx < 0.06 || gz < 0.06 ? 0.86 : 0.98 + hash3(Math.floor(x * 40), 0, Math.floor(z * 30)) * 0.06);
    }
    if (h > 0.05) return ny < 0.75 ? shade('#8a7c6a', 0.85 + fbm(x * 30, y * 30, z * 30, 2) * 0.3) : shade('#5f7a42', 0.8 + fbm(x * 20, y * 20, z * 20, 3) * 0.35);
    return shade('#7a8f4a', 0.85 + fbm(x * 25, 0, z * 25, 2) * 0.25);
  };
  base(gp, 0.5, '#7a8f4a', paint, Y0, hf, 26, 84);
  // mountain gate (Shanmen)
  const G = grp(gp, 0, Y0, -0.16);
  rbox(G, '#a8a29e', 0, 0, 0, 0.36, 0.022, 0.15, 0.003);
  for (let k = 0; k < 3; k++) box(G, '#b8b2a7', 0, 0, 0.075 + 0.012 + k * 0.012, 0.12, 0.022 - k * 0.007, 0.012);
  const red = '#a8322d';
  box(G, red, 0, 0.022, -0.005, 0.3, 0.085, 0.1);
  box(G, '#57534e', 0, 0.022, 0.0455, 0.3, 0.006, 0.002);
  for (let k = 0; k < 6; k++) cyl(G, '#8f2622', -0.15 + k * 0.06, 0.022, 0.058, 0.0055, 0.085, 8);
  box(G, '#7f1d1d', 0, 0.022, 0.0465, 0.05, 0.062, 0.003);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) dot(G, '#facc15', -0.018 + c * 0.012, 0.034 + r * 0.013, 0.049, 0.0022, 5);
  for (const s of [-1, 1]) { box(G, '#2a1a12', s * 0.09, 0.05, 0.0465, 0.03, 0.03, 0.003); for (let k = 0; k < 4; k++) box(G, '#7f1d1d', s * 0.09 - 0.012 + k * 0.008, 0.05, 0.0485, 0.002, 0.03, 0.002); }
  box(G, '#1c1917', 0, 0.09, 0.064, 0.07, 0.024, 0.004);
  box(G, '#facc15', 0, 0.089, 0.0645, 0.074, 0.026, 0.002);
  box(G, '#1c1917', 0, 0.091, 0.066, 0.066, 0.022, 0.003);
  for (let k = 0; k < 3; k++) { box(G, '#facc15', -0.02 + k * 0.02, 0.095, 0.068, 0.012, 0.002, 0.001); box(G, '#facc15', -0.02 + k * 0.02, 0.098, 0.068, 0.002, 0.012, 0.001); box(G, '#facc15', -0.02 + k * 0.02, 0.104, 0.068, 0.01, 0.002, 0.001); }
  box(G, '#1e3a5f', 0, 0.104, -0.005, 0.32, 0.008, 0.12);
  for (let k = 0; k < 16; k++) box(G, k % 2 ? '#15803d' : '#1e40af', -0.15 + k * 0.02, 0.104, 0.056, 0.018, 0.008, 0.002);
  eaveRoof(G, 0, 0.112, -0.005, 0.32, 0.12, 0.07, '#4b5563', 0.035, 0.02);
  // compound walls with tile caps
  for (const s of [-1, 1]) {
    box(G, red, s * 0.25, 0.0, 0.0, 0.16, 0.06, 0.02);
    gable(G, 0.17, 0.014, 0.034, '#4b5563', s * 0.25, 0.06, 0, 0);
  }
  // stone lions
  for (const s of [-1, 1]) {
    const L = grp(gp, s * 0.1, Y0, -0.03, 0);
    box(L, '#a8a29e', 0, 0, 0, 0.03, 0.03, 0.035);
    blob(L, '#9ca3af', 0, 0.045, -0.003, 0.012, 0.016, 0.014);
    blob(L, '#9ca3af', 0, 0.062, 0.006, 0.013, 0.012, 0.011);
    blob(L, '#78716c', 0, 0.064, 0.002, 0.016, 0.014, 0.01);
    dot(L, '#9ca3af', s * -0.006, 0.033, 0.012, 0.006, 6);
  }
  // hall behind, up the slope
  const hy = Y0 + hf(0.05, -0.33) - 0.01;
  const Hh = grp(gp, 0.05, hy, -0.33, 0);
  box(Hh, red, 0, 0, 0, 0.24, 0.06, 0.08);
  eaveRoof(Hh, 0, 0.06, 0, 0.24, 0.08, 0.06, '#57534e', 0.03, 0.018);
  // incense burner
  const ib = grp(gp, 0, Y0, 0.0);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; rod(ib, [Math.cos(a) * 0.01, 0, Math.sin(a) * 0.01], [Math.cos(a) * 0.008, 0.012, Math.sin(a) * 0.008], 0.002, '#7c5a2a', 4); }
  lathe(ib, [[0, 0], [0.016, 0.0], [0.018, 0.012], [0.014, 0.02], [0, 0.02]], '#8a6a2f', 0, 0.01, 0, 12);
  eaveRoof(ib, 0, 0.034, 0, 0.022, 0.022, 0.014, '#8a6a2f', 0.004, 0.004);
  rod(ib, [0, 0.03, 0], [0, 0.034, 0], 0.006, '#8a6a2f', 6);
  // monks: rows in horse stance, a flying kick, a staff form, the master
  const robe = '#f59e0b', robe2 = '#ea580c';
  const shaved = (sk: string) => ({ skin: sk, hair: shade(sk, 0.92) });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const x = -0.16 + c * 0.075 + (r % 2) * 0.01, z = 0.08 + r * 0.075, pn = (r + c) % 2;
    fig(gp, x, Y0, z, 0, 0.05, { c: robe, b: robe2, legs: robe2, sleeve: robe, shoes: '#1c1917', ...shaved(SK[1 + (c % 2)]),
      feet: [[-0.19, 0, 0.0], [0.19, 0, 0.0]], hands: pn ? [[-0.12, 0.62, 0.36], [0.14, 0.5, 0.06]] : [[-0.12, 0.5, 0.06], [0.12, 0.62, 0.36]], lean: 0.05 });
  }
  const fk = grp(gp, 0.21, Y0 + 0.035, 0.27, -0.8);
  fk.rotation.z = 0.25;
  fig(fk, 0, 0, 0, 0, 0.055, { c: robe, b: robe2, legs: robe2, sleeve: robe, shoes: '#1c1917', ...shaved(SK[2]), feet: [[-0.05, 0.25, -0.1], [0.12, 0.62, 0.45]], hands: [[-0.35, 0.72, -0.05], [0.1, 0.75, 0.25]], lean: -0.2 });
  const sm = fig(gp, -0.22, Y0, 0.28, 0.7, 0.052, { c: robe, b: robe2, legs: robe2, sleeve: robe, shoes: '#1c1917', ...shaved(SK[1]), feet: [[-0.2, 0, 0.1], [0.15, 0, -0.08]], hands: [[-0.15, 0.62, 0.25], [0.15, 0.6, 0.25]] });
  rod(sm, [-0.6, 0.9, 0.3], [0.6, 0.35, 0.22], 0.025, '#7c4a1e', 5);
  fig(gp, 0.03, Y0, 0.33, Math.PI, 0.056, { c: '#78350f', b: '#57534e', legs: '#57534e', sleeve: '#78350f', shoes: '#1c1917', ...shaved(SK[2]), hands: [[-0.08, 0.5, 0.12], [0.08, 0.5, 0.12]] });
  // Pagoda Forest
  for (const [x, z, n, s] of [[-0.36, 0.04, 5, 1.0], [-0.33, 0.14, 3, 0.9], [-0.41, 0.17, 4, 0.85], [-0.36, 0.26, 2, 0.8], [-0.29, 0.22, 3, 0.75], [-0.42, -0.05, 6, 1.0], [0.37, 0.05, 4, 0.9], [0.33, 0.16, 2, 0.8]] as const) stupa(gp, x, Y0 + hf(x, z) - 0.003, z, n, s, hash3(x * 9, z * 9, 1) > 0.5 ? '#a8a29e' : '#b6a99a');
  // pines and old cypresses
  for (let i = 0; i < 32; i++) {
    const x = -0.45 + hash3(i, 1, 9) * 0.9, z = -0.45 + hash3(i, 2, 9) * 0.32;
    if (Math.hypot(x, z) > 0.47 || (Math.abs(x) < 0.2 && z > -0.42 && Math.abs(x - 0.05) < 0.16 && z > -0.4)) continue;
    fir(gp, x, Y0 + hf(x, z) - 0.004, z, 0.06 + hash3(i, 3, 3) * 0.03, hash3(i, 4, 4) > 0.5 ? '#2f5a3c' : '#3d6b3a');
  }
  for (const [x, z] of [[0.36, 0.28], [-0.2, 0.4], [0.24, 0.4], [0.42, -0.08]] as const) leafy(gp, x, Y0, z, 0.09, '#47703a');
};

// =========================================================================================================
// MELBOURNE CRICKET GROUND — the giant "G": a huge oval bowl of multicoloured seats under white roof canopies,
// six towering light towers, the big scoreboard, the tan cricket pitch with stumps in the middle of the mown
// oval, a batter, bowler, wicket-keeper and fielders in whites, and the trees of Yarra Park outside.
// =========================================================================================================
const sv_mcg: Builder = (gp) => {
  const Y0 = 0.03;
  const paint: Paint = (x, _y, z) => {
    const r = Math.hypot(x / 1.1, z);
    if (r > 0.41) return shade('#5f8f3a', 0.85 + fbm(x * 20, 0, z * 20, 3) * 0.3);
    return shade('#a8a29e', 0.94 + hash3(Math.floor(x * 50), 0, Math.floor(z * 50)) * 0.08);
  };
  base(gp, 0.5, '#a8a29e', paint, Y0);
  const st = grp(gp, 0, Y0, -0.01);
  const A = 0.235, Bz = 0.18;
  const plan = supPlan(A + 0.012, Bz + 0.012, 2.2);
  const inside = (x: number, z: number) => (x / (A + 0.01)) ** 2 + (z / (Bz + 0.01)) ** 2 <= 1;
  const fpaint: Paint = (x, _y, z) => {
    if (Math.abs(x) < 0.05 && Math.abs(z) < 0.011) return shade('#d6c08a', 0.95 + hash3(Math.floor(x * 200), 0, 1) * 0.08);
    if ((x / A) ** 2 + (z / Bz) ** 2 > 0.93) return '#4a8a35';
    return shade('#4f9a3a', (Math.floor(x / 0.03 + 100) % 2 ? 0.93 : 1.06) * (0.97 + fbm(x * 30, 0, z * 30, 2) * 0.06));
  };
  turf(st, inside, A + 0.01, Bz + 0.01, 56, 0.001, fpaint);
  ringLine(st, 0, 0.0018, 0, 0.11, 0.0012, '#f8fafc', 48, 3).scale.set(0.12, 0.09, 0.12 * 0.4);
  for (const s of [-1, 1]) {
    line(st, s * 0.036, -0.014, s * 0.036, 0.014, 0.0012, 0.0018);
    line(st, s * 0.043, -0.008, s * 0.043, 0.008, 0.0012, 0.0018);
    for (const k of [-1, 0, 1]) cyl(st, '#f5e6c8', s * 0.043, 0.001, k * 0.0028, 0.0011, 0.012, 4);
    box(st, '#f5e6c8', s * 0.043, 0.013, 0, 0.0018, 0.0012, 0.008);
  }
  // multicoloured seating bowl: tall at the back, lower at the camera side
  const sec = ['#facc15', '#2563eb', '#16a34a', '#dc2626', '#0f172a'];
  const seat = (t: number, row: number, i: number) => crowd(['#1e3a8a', '#facc15', '#f8fafc', '#16a34a', '#dc2626'], sec[Math.floor(t * 10) % 5], 0.72, 11)(t, row, i);
  const rows = 13, dr = 0.0085, dh = 0.0098, top = 0.01 + rows * dh, offE = 0.004 + rows * dr;
  stands(st, plan, { t0: 0.43, t1: 1.07, n: 64, rows, off0: 0.004, dr, dh, y0: 0.01, seat, riser: '#cbd5e1', wall: '#e2e8f0', back: (_t, y) => (y > top * 0.6 ? '#e5e7eb' : '#94a3b8'), backH: 0.03 });
  stands(st, plan, { t0: 0.07, t1: 0.43, n: 36, rows: 6, off0: 0.004, dr, dh, y0: 0.01, seat, riser: '#cbd5e1', wall: '#e2e8f0', back: () => '#94a3b8', backH: 0.008 });
  // roof canopies over the tall stands
  const rq = new Quads();
  for (let i = 0; i < 48; i++) {
    const ta = 0.45 + (i / 48) * 0.6, tb = 0.45 + ((i + 1) / 48) * 0.6, yr = top + 0.03;
    const a0 = plan(ta, offE * 0.4), b0 = plan(tb, offE * 0.4), a1 = plan(ta, offE + 0.008), b1 = plan(tb, offE + 0.008);
    rq.quad([a0[0], yr, a0[1]], [b0[0], yr, b0[1]], [b1[0], yr + 0.014, b1[1]], [a1[0], yr + 0.014, a1[1]], '#f8fafc', [0, 1, 0]);
    rq.quad([a0[0], yr, a0[1]], [b0[0], yr, b0[1]], [b1[0], yr + 0.014, b1[1]], [a1[0], yr + 0.014, a1[1]], '#94a3b8', [0, -1, 0]);
    if (i % 4 === 0) rq.box(a1[0], top, a1[1], 0.004, 0.044, 0.004, '#cbd5e1');
  }
  // six light towers with big angled light banks
  const lq = new Quads();
  for (const t of [0.0, 0.25, 0.5, 0.64, 0.75, 0.86]) {
    const [x, z] = plan(t, offE + 0.02), ry = Math.atan2(-x, -z);
    const h = 0.33;
    strut(st, [x, 0, z], [x * 0.98, h, z * 0.98], 0.008, 0.004, '#cbd5e1', 6);
    const hx = x * 0.97, hz = z * 0.97;
    rq.box(hx, h - 0.01, hz, 0.075, 0.05, 0.008, '#64748b', ry);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const u = -0.03 + c * 0.015, v = h - 0.003 + r * 0.014;
      lq.box(hx + Math.cos(ry) * u + Math.sin(ry) * 0.005, v, hz - Math.sin(ry) * u + Math.cos(ry) * 0.005, 0.011, 0.009, 0.002, '#fffbea', ry);
    }
  }
  rq.mesh(st); lq.mesh(st, { emissive: '#fff2b0' });
  // scoreboard on the back stand
  const [sx, sz] = plan(0.75, offE - 0.01);
  const sb = grp(st, sx, top + 0.045, sz, 0);
  box(sb, '#1f2937', 0, 0, 0, 0.14, 0.06, 0.012);
  glow(box(sb, '#1e3a8a', 0, 0.006, 0.0062, 0.128, 0.048, 0.001), '#1e40af', '#1e3a8a');
  // the players
  const whites: Pose = { c: '#f8fafc', b: '#f1f5f9', legs: '#f1f5f9', shoes: '#f8fafc', hat: (f) => blob(f, '#15803d', 0, 0.98, 0.01, 0.115, 0.05, 0.12) };
  const bat = fig(st, -0.047, 0.001, 0.006, Math.PI / 2, 0.042, { ...whites, c: '#f8fafc', hat: (f) => blob(f, '#1e3a8a', 0, 0.97, 0.02, 0.13, 0.12, 0.13), lean: 0.3, hands: [[0.0, 0.5, 0.15], [0.03, 0.45, 0.18]], feet: [[-0.1, 0, 0], [0.1, 0, 0.08]] });
  rod(bat, [0.02, 0.45, 0.18], [0.12, 0.08, 0.4], 0.035, '#e8d6a8', 4);
  for (const s of [-1, 1]) blob(bat, '#f8fafc', s * 0.07, 0.2, 0.04, 0.05, 0.16, 0.05);
  fig(st, 0.06, 0.001, 0.008, -Math.PI / 2, 0.042, { ...whites, ...RUN(0), hands: [[-0.2, 0.55, 0.0], [0.2, 1.05, -0.1]] });
  dot(st, '#b91c1c', 0.0, 0.012, 0.004, 0.0025, 6);
  fig(st, -0.068, 0.001, 0.0, Math.PI / 2, 0.034, { ...whites, lean: 0.7, hands: [[-0.1, 0.35, 0.25], [0.1, 0.35, 0.25]], feet: [[-0.15, 0, 0], [0.15, 0, 0]] });
  for (const [x, z] of [[-0.07, -0.025], [-0.065, -0.04], [0.02, -0.12], [-0.15, 0.08], [0.15, -0.06], [0.06, 0.13], [-0.18, -0.06]] as const) fig(st, x, 0.001, z, Math.atan2(-0.047 - x, -z), 0.04, { ...whites, lean: 0.25, hands: [[-0.15, 0.4, 0.15], [0.15, 0.4, 0.15]] });
  fig(st, 0.075, 0.001, 0.0, -Math.PI / 2, 0.04, { c: '#e5e7eb', b: '#1f2937', legs: '#1f2937', hat: (f) => { blob(f, '#f8fafc', 0, 0.98, 0, 0.17, 0.03, 0.17); blob(f, '#f8fafc', 0, 1.0, 0, 0.11, 0.06, 0.11); } });
  // Yarra Park trees & the Shane Warne statue plinth out front
  for (const [x, z, s] of [[-0.4, 0.22, 0.1], [0.4, 0.22, 0.1], [-0.3, 0.36, 0.09], [0.3, 0.36, 0.1], [0.0, 0.44, 0.08], [-0.16, 0.42, 0.08], [0.16, 0.43, 0.09], [-0.44, 0.03, 0.08], [0.45, 0.02, 0.08]] as const) leafy(gp, x, Y0, z, s, '#55803a');
  const ws = grp(gp, 0.08, Y0, 0.36, 0);
  box(ws, '#78716c', 0, 0, 0, 0.03, 0.02, 0.03);
  fig(ws, 0, 0.02, 0, 0, 0.05, { c: '#b45309', b: '#b45309', legs: '#b45309', skin: '#b45309', hair: '#92400e', shoes: '#92400e', lean: 0.2, hands: [[-0.2, 0.9, 0.05], [0.2, 0.55, 0.15]], feet: [[-0.06, 0, -0.1], [0.08, 0.1, 0.12]] });
};

/** Detailed builders keyed by catalogue item key (recipe.hero). */
export const H_SPORTS: Record<string, Builder> = {
  sv_olympia, sv_standrews, sv_ventoux, sv_holmenkollen, sv_bombonera, sv_fnb, sv_fenway,
  sv_indy500, sv_iditarod, sv_pipeline, sv_sumo, sv_shaolin, sv_mcg,
};
