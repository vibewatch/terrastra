import * as THREE from 'three';
import { type Builder, type Paint, type V3, g, add, mat, box, cyl, cone, rod, slab, hash3, fbm, worley, paintFaces } from '../prims.ts';
import { island, sstep, type HFn } from '../nature.ts';
import { H_SPACE } from './space.ts';
import { type P2, mx, sh, batched, hcyl, RODS } from '../kit/orbit.ts';

// Hero builders for the Solar System view: landers, rovers and crewed sites on other worlds (round diorama bases of
// radius ≈0.46, ground at y≈0.03), plus orbiters and deep-space probes (no base, centred at the origin, ≈0.9 across).
// Front faces +z. Real-world sizes are modelled in metres inside a scaled group wherever that helps proportions.

const TAU = Math.PI * 2;
const grp = (p: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => {
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.set(rx, ry, rz); q.scale.setScalar(s); p.add(q); return q;
};

/** Lathe of a [radius, y] profile with per-face colours. */
function plathe(p: THREE.Object3D, prof: P2[], base: string, paint?: Paint, seg = 20, x = 0, y = 0, z = 0, o: { flat?: boolean; metal?: number; rough?: number } = {}): THREE.Mesh {
  const lg = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg);
  lg.computeVertexNormals();
  return add(p, paintFaces(lg, base, paint), mat('#ffffff', { vc: true, flat: o.flat ?? false, metal: o.metal, rough: o.rough }), x, y, z, 1, 1, 1);
}

/** Thin cylinder between two points; batched into one vertex-coloured mesh per model. */
function bar(p: THREE.Object3D, a: V3, b: V3, r: number, c: string, seg = 5): void {
  if (RODS) RODS.push({ p, a, b, r, c, seg }); else rod(p, a, b, r, c, seg);
}
const _inv = new THREE.Matrix4(), _v = new THREE.Vector3();

/** Lattice girder between a and b: 4 longerons on a w×d rectangle, n bays with rings and zig-zag diagonals. */
function truss(p: THREE.Object3D, a: V3, b: V3, w: number, d: number, n: number, c: string, r = 0.003): void {
  const A = new THREE.Vector3(...a), D = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const R = new THREE.Vector3(...(Math.abs(D.y) / D.length() > 0.9 ? [1, 0, 0] as V3 : [0, 1, 0] as V3));
  const S = new THREE.Vector3().crossVectors(D, R).normalize(), U = new THREE.Vector3().crossVectors(S, D).normalize();
  const sg = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const pt = (i: number, t: number): V3 => {
    const [su, ss] = sg[i % 4];
    return [A.x + D.x * t + U.x * su * w * 0.5 + S.x * ss * d * 0.5, A.y + D.y * t + U.y * su * w * 0.5 + S.y * ss * d * 0.5, A.z + D.z * t + U.z * su * w * 0.5 + S.z * ss * d * 0.5];
  };
  for (let i = 0; i < 4; i++) bar(p, pt(i, 0), pt(i, 1), r * 1.25, c, 4);
  for (let k = 0; k <= n; k++) {
    const t = k / n, t2 = (k + 1) / n;
    for (let i = 0; i < 4; i++) {
      bar(p, pt(i, t), pt(i + 1, t), r * 0.8, c, 3);
      if (k < n) bar(p, (k + i) % 2 ? pt(i, t) : pt(i + 1, t), (k + i) % 2 ? pt(i + 1, t2) : pt(i, t2), r * 0.7, c, 3);
    }
  }
}

/** Paraboloid dish (concave up, vertex at the origin): panelled front, grey back. */
function dish(p: THREE.Object3D, R: number, depth: number, c = '#eef0f1', rings = 5, seg = 20, t = 0.006, back = '#b8bcc0'): THREE.Mesh {
  const yAt = (r: number) => depth * (r / R) ** 2;
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
/** Dish in a group pointing along the group's +y, centred at (x,y,z), tilted by rx/rz, with a feed and struts. */
function antennaDish(p: THREE.Object3D, x: number, y: number, z: number, R: number, depth: number, rx = 0, rz = 0, ry = 0, c = '#eef0f1', feed = true, back = '#b8bcc0'): THREE.Group {
  const q = grp(p, x, y, z, ry, rx, rz);
  dish(q, R, depth, c, 5, 20, Math.max(0.0025, R * 0.04), back);
  if (feed) {
    const f = R * 0.55;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; bar(q, [Math.sin(a) * R * 0.8, depth * 0.64, Math.cos(a) * R * 0.8], [0, f, 0], R * 0.018, '#d9d9d6', 3); }
    cyl(q, '#cfd2d4', 0, f - R * 0.04, 0, R * 0.09, R * 0.08, 8);
  }
  return q;
}

const SPH = (s: number) => g('pl:sph' + s, () => new THREE.SphereGeometry(1, s, Math.max(4, Math.round(s * 0.7))));
/** Smooth ellipsoid with segment count scaled to its size (prims' ellip is heavy). */
const ell = (p: THREE.Object3D, c: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, roty = 0, rotx = 0, rotz = 0) => {
  const r = Math.max(rx, ry, rz);
  const s = r > 0.06 ? 18 : r > 0.03 ? 13 : r > 0.012 ? 9 : 6;
  return add(p, SPH(s), mat(c, { flat: false }), x, y, z, rx, ry, rz, roty, rotx, rotz);
};
const metal = <T extends THREE.Mesh>(m: T, c: string, k = 0.7, rough = 0.35): T => { m.material = mat(c, { metal: k, rough }); return m; };
const glow = <T extends THREE.Mesh>(m: T, c: string): T => { m.material = mat(c, { emissive: c }); return m; };

/** Solar-array blanket lying flat (local y up), long side along `ax`, painted as a grid of cells. */
function pv(p: THREE.Object3D, x: number, y: number, z: number, W: number, L: number, c: string, ax: 'x' | 'z', tilt = 0, cell = 0.012, frame = '#9aa0a6'): THREE.Mesh {
  const nl = Math.max(2, Math.round(L / cell)), nw = Math.max(2, Math.round(W / cell));
  const geo = g(`pl:pv:${c}:${W.toFixed(3)}:${L.toFixed(3)}:${cell}:${frame}`, () => paintFaces(new THREE.BoxGeometry(W, Math.min(0.004, W * 0.05), L, nw, 1, nl), c, (fx, _fy, fz, _nx, ny) => {
    if (Math.abs(ny) < 0.5) return frame;
    if (ny < 0) return '#c9ccd0';
    const i = Math.floor((fx / W + 0.5) * nw), j = Math.floor((fz / L + 0.5) * nl);
    return (i + j) % 2 ? sh(c, 1.08) : sh(c, 0.86);
  }));
  return add(p, geo, mat('#ffffff', { vc: true, metal: 0.4, rough: 0.35 }), x, y, z, 1, 1, 1, ax === 'x' ? Math.PI / 2 : 0, ax === 'x' ? tilt : 0, ax === 'z' ? tilt : 0);
}
const GOLD = '#d9a63c', GOLD2 = '#c8892a', SILVER = '#c9ccd1', BLACKF = '#2a2b2f';
/** Crinkled thermal blanket box (MLI foil) — vertex-coloured metal so it glints like the real thing. */
function foil(p: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, c = GOLD, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  const n = (s: number) => Math.max(1, Math.min(6, Math.round(s / 0.025)));
  const key = `pl:foil:${c}:${sx.toFixed(3)}:${sy.toFixed(3)}:${sz.toFixed(3)}`;
  const geo = g(key, () => paintFaces(new THREE.BoxGeometry(sx, sy, sz, n(sx), n(sy), n(sz)), c, (fx, fy, fz) => {
    const h = hash3(Math.round(fx * 300), Math.round(fy * 300), Math.round(fz * 300));
    return h > 0.7 ? sh(c, 1.14) : h < 0.3 ? sh(c, 0.84) : null;
  }));
  return add(p, geo, mat('#ffffff', { vc: true, metal: 0.72, rough: 0.34 }), x, y + sy / 2, z, 1, 1, 1, ry, rx, rz);
}
/** Crinkled foil cylinder / prism (`seg` sides) standing on y. */
function foilCyl(p: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, seg = 8, c = GOLD, ry = 0): THREE.Mesh {
  const key = `pl:foilc:${c}:${seg}:${r.toFixed(3)}:${h.toFixed(3)}`;
  const geo = g(key, () => paintFaces(new THREE.CylinderGeometry(r, r, h, seg, Math.max(1, Math.min(5, Math.round(h / 0.025)))), c, (fx, fy, fz) => {
    const hh = hash3(Math.round(fx * 300), Math.round(fy * 300), Math.round(fz * 300));
    return hh > 0.7 ? sh(c, 1.14) : hh < 0.3 ? sh(c, 0.84) : null;
  }));
  return add(p, geo, mat('#ffffff', { vc: true, metal: 0.72, rough: 0.34 }), x, y + h / 2, z, 1, 1, 1, ry);
}
const shiny = (m: THREE.Mesh, c: string) => metal(m, c, 0.55, 0.4);

/** Five-pointed star outline (radius r) in the XY plane. */
const starPts = (r: number, rot = 0): P2[] => Array.from({ length: 10 }, (_, i) => {
  const a = rot + Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r;
  return [Math.cos(a) * rr, Math.sin(a) * rr] as P2;
});
type FlagKind = 'us' | 'cn' | 'in' | 'jp';
/**
 * Flat flag of width w, height h in the local XY plane of a group at (x,y,z) (hoist edge at x=0, flying towards +x,
 * top edge at y=0), both faces painted.
 */
function flag(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, kind: FlagKind, ry = 0): THREE.Group {
  const q = grp(p, x, y - h, z, ry);
  const t = Math.max(0.0012, h * 0.025);
  if (kind === 'us') {
    box(q, '#f4f4f2', w / 2, 0, 0, w, h, t);
    for (let i = 0; i < 7; i++) box(q, '#b22234', w / 2, h - (i * 2 + 1) * (h / 13), 0, w, h / 13, t * 1.4);
    const cw = w * 0.4, ch = h * (7 / 13);
    box(q, '#3c3b6e', cw / 2, h - ch, 0, cw, ch, t * 1.8);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) box(q, '#ffffff', cw * (0.12 + i * 0.19), h - ch * (0.2 + j * 0.22) - h * 0.012, 0, h * 0.025, h * 0.025, t * 2.2);
  } else if (kind === 'cn') {
    box(q, '#de2910', w / 2, 0, 0, w, h, t);
    const st = (sx: number, sy: number, r: number, rot: number) => {
      for (const s of [-1, 1]) { const m = slab(q, starPts(r, rot), t * 0.4, '#ffde00', 0, false); m.position.set(sx, sy, s * t * 0.6); }
    };
    st(w * 0.167, h * 0.75, h * 0.15, 0);
    for (const [sx, sy] of [[0.333, 0.9], [0.4, 0.8], [0.4, 0.65], [0.333, 0.55]] as P2[]) st(w * sx, h * sy, h * 0.05, 0.3);
  } else if (kind === 'in') {
    box(q, '#ff9933', w / 2, h * 2 / 3, 0, w, h / 3, t);
    box(q, '#ffffff', w / 2, h / 3, 0, w, h / 3, t);
    box(q, '#138808', w / 2, 0, 0, w, h / 3, t);
    hcyl(q, '#000080', w / 2, h / 2, 0, h * 0.12, t * 1.6, 'z', 12);
  } else {
    box(q, '#ffffff', w / 2, 0, 0, w, h, t);
    hcyl(q, '#bc002d', w / 2, h / 2, 0, h * 0.3, t * 1.6, 'z', 16);
  }
  return q;
}

/** Wheel with its axle along x, centre at (x,y,z): dark tyre band, lighter grousers, hub. */
function wheel(p: THREE.Object3D, x: number, y: number, z: number, r: number, w: number, c = '#b9bcc0', grousers = 12, gc?: string): void {
  const m = hcyl(p, c, x, y, z, r, w, 'x', 16);
  shiny(m, c);
  const q = grp(p, x, y, z);
  for (let i = 0; i < grousers; i++) {
    const a = (i / grousers) * TAU;
    box(q, gc ?? sh(c, 0.7), 0, Math.cos(a) * r - r * 0.04, Math.sin(a) * r, w * 1.02, r * 0.08, r * 0.1, 0, a);
  }
  hcyl(p, sh(c, 0.6), x + Math.sign(x || 1) * w * 0.3, y, z, r * 0.35, w * 0.6, 'x', 8);
}

// ---- terrain -----------------------------------------------------------------------------------------------
export interface Crater { x: number; z: number; r: number; d: number }
interface TerrainOpts {
  /** base, dark, light colours of the soil */
  pal: [string, string, string];
  craters?: Crater[];
  /** soft hills [x, z, radius, height] */
  hills?: [number, number, number, number][];
  amp?: number; freq?: number;
  extra?: HFn;
  /** extra per-face paint (return null to keep the soil colour) */
  paint?: (x: number, y: number, z: number, ny: number) => string | null;
  side?: [string, string];
  rings?: number; segs?: number; R?: number;
}
const Y0 = 0.03;
const craterH = (q: number, d: number) => {
  const rim = d * 0.35;
  return q < 1 ? (d + rim) * q * q - d : rim * Math.exp(-(((q - 1) / 0.45) ** 2));
};
/** Round regolith base; returns the surface height function y(x, z). */
function terrain(gp: THREE.Object3D, o: TerrainOpts): (x: number, z: number) => number {
  const amp = o.amp ?? 0.006, fq = o.freq ?? 7, cr = o.craters ?? [], hl = o.hills ?? [];
  const h: HFn = (x, z) => {
    let y = (fbm(x * fq + 3.1, 1.7, z * fq, 3) - 0.5) * amp * 2;
    for (const c of cr) { const q = Math.hypot(x - c.x, z - c.z) / c.r; if (q < 2.2) y += craterH(q, c.d); }
    for (const [hx, hz, hr, hh] of hl) { const q = Math.hypot(x - hx, z - hz) / hr; if (q < 1) y += hh * (1 - q * q) ** 2; }
    return y + (o.extra ? o.extra(x, z) : 0);
  };
  const [base, dark, light] = o.pal;
  island(gp, o.R ?? 0.46, h, base, (x, y, z, _nx, ny) => {
    const extra = o.paint?.(x, y, z, ny);
    if (extra) return extra;
    for (const c of cr) {
      const q = Math.hypot(x - c.x, z - c.z) / c.r;
      if (q < 0.8) return mx(dark, base, q * 0.9 + fbm(x * 40, 2, z * 40, 2) * 0.3);
      if (q < 1.15) return mx(light, base, Math.abs(q - 1) * 4);
    }
    const n = fbm(x * 14, 4.2, z * 14, 3), s = hash3(Math.floor(x * 90), 3, Math.floor(z * 90));
    return s > 0.96 ? mx(base, light, 0.55) : mx(base, dark, n * 1.8 - 0.5 + (1 - ny) * 3);
  }, { rings: o.rings ?? 26, segs: o.segs ?? 72, base: Y0, side: (yy: number) => (yy > Y0 * 0.55 ? (o.side?.[0] ?? sh(dark, 0.85)) : (o.side?.[1] ?? sh(dark, 0.65))) });
  return (x, z) => Y0 + h(x, z);
}
const ICO = () => g('pl:ico', () => new THREE.IcosahedronGeometry(1, 0));
const DODE = () => g('pl:dode', () => new THREE.DodecahedronGeometry(1, 0));
/** Scattered angular rocks sitting on the ground. */
function rocks(p: THREE.Object3D, ground: (x: number, z: number) => number, n: number, seed: number, c: string, size: number, keep?: (x: number, z: number) => boolean, R = 0.42, round = false): void {
  for (let i = 0; i < n; i++) {
    const a = hash3(i, seed, 1) * TAU, d = Math.sqrt(hash3(i, seed, 2)) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (keep && !keep(x, z)) continue;
    const s = size * (0.35 + hash3(i, seed, 3) ** 2 * 1.3);
    const cc = hash3(i, seed, 5) > 0.5 ? c : sh(c, 0.82);
    add(p, round ? SPH(7) : hash3(i, seed, 6) > 0.5 ? ICO() : DODE(), mat(cc, { flat: !round }), x, ground(x, z) + s * 0.25, z,
      s * (0.8 + hash3(i, seed, 7) * 0.6), s * (0.45 + hash3(i, seed, 8) * 0.4), s * (0.8 + hash3(i, seed, 9) * 0.5), hash3(i, seed, 4) * TAU, 0.3, 0.2);
  }
}
/** A single boulder (non-uniform icosahedron). */
const boulder = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) =>
  add(p, ICO(), mat(c), x, y, z, sx, sy, sz, ry, 0.2, 0.1);

/** Wheel-track ribbon (two ruts with tread stripes) along a 2D polyline, draped on the ground. */
function tracks(p: THREE.Object3D, pts: P2[], ground: (x: number, z: number) => number, gauge: number, w: number, c: string, c2: string, step = 0.008): void {
  const pos: number[] = [], col: number[] = [];
  const A = new THREE.Color(c), B = new THREE.Color(c2);
  for (const side of [-1, 1]) {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
      const tx = (x1 - x0) / L, tz = (z1 - z0) / L, nx = -tz, nz = tx;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const ax = x0 + (x1 - x0) * t0 + nx * side * gauge / 2, az = z0 + (z1 - z0) * t0 + nz * side * gauge / 2;
        const bx = x0 + (x1 - x0) * t1 + nx * side * gauge / 2, bz = z0 + (z1 - z0) * t1 + nz * side * gauge / 2;
        const q: V3[] = [[ax - nx * w / 2, 0, az - nz * w / 2], [ax + nx * w / 2, 0, az + nz * w / 2], [bx + nx * w / 2, 0, bz + nz * w / 2], [bx - nx * w / 2, 0, bz - nz * w / 2]];
        for (const v of q) v[1] = ground(v[0], v[2]) + 0.0012;
        const cc = Math.floor((s + L * t0) / (step * 0.999)) % 2 ? A : B;
        for (const idx of [0, 2, 1, 0, 3, 2]) { pos.push(...q[idx]); col.push(cc.r, cc.g, cc.b); }
      }
      s += L;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  add(p, geo, mat('#ffffff', { vc: true, flat: true, rough: 0.95 }), 0, 0, 0, 1, 1, 1);
}
/** Bootprints along a path (alternating left/right), as small dark ovals pressed into the dust. */
function prints(p: THREE.Object3D, pts: P2[], ground: (x: number, z: number) => number, c: string, step = 0.02, s = 0.006): void {
  let carry = 0, k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    for (let d = carry; d < L; d += step, k++) {
      const side = k % 2 ? 1 : -1, x = x0 + tx * d - tz * side * s * 0.9, z = z0 + tz * d + tx * side * s * 0.9;
      add(p, g('pl:print', () => new THREE.CylinderGeometry(1, 1, 1, 7)), mat(c), x, ground(x, z) + 0.0004, z, s * 0.75, 0.0016, s * 1.5, Math.atan2(tx, tz));
    }
    carry = (carry - L) % step; if (carry < 0) carry += step;
  }
}

/** Little Apollo astronaut (height ≈ 1.85·s), facing +z, with backpack, gold visor and red commander stripes. */
function astronaut(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry = 0, pose: 'stand' | 'salute' | 'walk' = 'stand'): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const W = '#f1f0ea', G = '#bfc3c7';
  const lg = pose === 'walk' ? 0.12 : 0;
  for (const sx of [-1, 1]) {
    box(q, '#dfe3e8', sx * 0.11, 0, 0.03 + sx * lg, 0.13, 0.12, 0.28);
    box(q, '#3b5fa8', sx * 0.11, 0, 0.03 + sx * lg, 0.135, 0.03, 0.285);
    bar(q, [sx * 0.11, 0.1, sx * lg * 0.8], [sx * 0.12, 0.85, 0], 0.085, W, 7);
  }
  ell(q, W, 0, 1.15, 0, 0.27, 0.36, 0.2);
  box(q, '#d7d9db', 0, 1.0, 0.16, 0.22, 0.14, 0.08);
  box(q, W, 0, 0.82, -0.32, 0.5, 0.66, 0.24);
  box(q, '#e6e6e0', 0, 1.48, -0.3, 0.4, 0.16, 0.2);
  ell(q, W, 0, 1.62, 0.02, 0.17, 0.18, 0.17);
  metal(ell(q, '#d8a52a', 0, 1.61, 0.07, 0.145, 0.13, 0.13), '#d9a520', 0.85, 0.18);
  for (const sx of [-1, 1]) {
    const salute = pose === 'salute' && sx > 0;
    const sh0: V3 = [sx * 0.27, 1.38, 0], el: V3 = salute ? [sx * 0.42, 1.38, 0.16] : [sx * 0.33, 1.05, 0.05];
    const hd: V3 = salute ? [sx * 0.2, 1.62, 0.18] : [sx * 0.32, 0.78, 0.12];
    bar(q, sh0, el, 0.07, W, 6); bar(q, el, hd, 0.065, W, 6);
    ell(q, G, ...hd, 0.06);
    if (sx < 0) box(q, '#c8102e', sx * 0.3, 1.26, 0, 0.12, 0.04, 0.14);
  }
}

/** Centres a builder's output at the origin (orbiters reused from other packs). */
const centred = (fn: Builder, scale = 1): Builder => (gp, r) => {
  const q = new THREE.Group(); fn(q, r); q.scale.setScalar(scale);
  q.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(q).getCenter(new THREE.Vector3());
  q.position.sub(c); gp.add(q);
};

// ---- Moon hardware ------------------------------------------------------------------------------------------
const MOON: [string, string, string] = ['#9d9b96', '#74726d', '#c2c0ba'];
const MOON_SIDE: [string, string] = ['#6d6b66', '#55534f'];

/** Apollo Lunar Module (metres, group scale s): gold-foil descent stage, optionally with the ascent stage on top. */
function lunarModule(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, ascent: boolean): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const B0 = 1.2, BH = 1.65, TOP = B0 + BH;
  foilCyl(q, 0, B0, 0, 2.3, BH, 8, GOLD, Math.PI / 8);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, a2 = a + Math.PI / 4;
    foil(q, Math.sin(a) * 2.12, B0 + 0.12, Math.cos(a) * 2.12, 1.55, BH - 0.24, 0.12, k % 2 ? GOLD2 : '#e0b44e', a);
    foil(q, Math.sin(a2) * 2.12, B0 + 0.2, Math.cos(a2) * 2.12, 1.1, BH - 0.4, 0.1, k === 1 ? SILVER : BLACKF, a2);
  }
  box(q, '#3b3b3e', 0, TOP, 0, 3.2, 0.08, 3.2, Math.PI / 4);
  // descent engine bell
  plathe(q, [[0.95, 0.35], [0.8, 0.6], [0.6, 0.95], [0.5, B0]], '#5c5d61', undefined, 14, 0, 0, 0, { metal: 0.5 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, ca = Math.sin(a), sa = Math.cos(a), ox = Math.cos(a), oz = -Math.sin(a);
    const P = (r: number, yy: number, lat = 0): V3 => [ca * r + ox * lat, yy, sa * r + oz * lat];
    const fp = P(4.25, 0.12);
    bar(q, P(2.1, TOP - 0.2), [fp[0], 0.32, fp[2]], 0.12, '#d6a641', 6);
    for (const l of [-1, 1]) {
      bar(q, P(1.75, B0 + 0.1, l * 1.0), P(3.55, 1.0), 0.06, '#b9bcc0', 4);
      bar(q, P(2.2, B0 + 0.55, l * 1.2), P(3.0, 1.55), 0.045, '#9da1a6', 4);
    }
    plathe(q, [[0, 0], [0.42, 0], [0.48, 0.1], [0.3, 0.2], [0, 0.22]], '#c9c4b5', undefined, 12, fp[0], 0, fp[2], { metal: 0.4 });
    if (k > 0) bar(q, [fp[0], 0.05, fp[2]], P(5.0, 0.02, 0.6), 0.025, '#8a8d91', 3);
    if (k === 0) {
      for (let i = 0; i < 8; i++) {
        const t = 0.15 + i * 0.1, r0 = 2.1 + (4.25 - 2.1) * t, yy = TOP - 0.2 + (0.32 - (TOP - 0.2)) * t;
        bar(q, P(r0 + 0.1, yy, -0.35), P(r0 + 0.1, yy, 0.35), 0.03, '#c9c9c9', 3);
      }
      box(q, '#b8bbbf', ...P(2.55, TOP - 0.1), 1.0, 0.06, 0.8);
      metal(box(q, '#d7d9db', ...P(2.62, 1.9), 0.5, 0.35, 0.03), '#e3e5e7', 0.8, 0.25);
    }
  }
  if (!ascent) {
    for (const [px, pz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as P2[]) cyl(q, '#55565a', px * 0.9, TOP, pz * 0.9, 0.12, 0.25, 6);
    return;
  }
  const A0 = TOP + 0.05, AS = '#b6bac0';
  const plan: P2[] = [[-1.2, 1.1], [1.2, 1.1], [1.55, 0.35], [1.55, -0.5], [-1.55, -0.5], [-1.55, 0.35]];
  const cab = new THREE.Group(); cab.position.y = A0; q.add(cab);
  const shp = new THREE.Shape(plan.map(([px, pz]) => new THREE.Vector2(px, -pz)));
  const eg = new THREE.ExtrudeGeometry(shp, { depth: 2.2, bevelEnabled: false }); eg.rotateX(-Math.PI / 2);
  add(cab, paintFaces(eg, AS, (fx, fy, fz, nx, ny, nz) => {
    if (ny > 0.9) return '#9fa4aa';
    if (nz > 0.5 && fy > 1.05) return '#2d2e31';
    if (nz > 0.3 && Math.abs(nx) > 0.3) return fy > 1.0 ? '#3a3b3f' : '#a8adb3';
    return hash3(Math.round(fx * 3), Math.round(fy * 3), Math.round(fz * 3)) > 0.6 ? '#c4c8cd' : null;
  }), mat('#ffffff', { vc: true, metal: 0.45, rough: 0.4 }), 0, 0, 0, 1, 1, 1);
  for (const sx of [-1, 1]) {
    const w = slab(cab, [[0, 0], [0.55, 0], [0.1, 0.55]], 0.04, '#141518', 0, false);
    w.position.set(sx * 0.55, 1.35, 1.12); w.scale.x = sx * -1;
  }
  box(cab, '#8c9096', 0, 0.25, 1.12, 0.8, 0.8, 0.06);
  foil(cab, 0, 0.3, -1.25, 2.4, 1.6, 1.5, BLACKF);
  foil(cab, 0, 0.6, -0.75, 2.0, 1.2, 0.5, SILVER);
  hcyl(cab, '#9fa4aa', 0, 2.35, 0.2, 0.55, 0.35, 'y', 12);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as P2[]) {
    const rx = sx * 1.85, rz = sz * 0.95, ry0 = 1.55;
    bar(cab, [sx * 1.4, ry0, sz * 0.5], [rx, ry0, rz], 0.06, '#8d9196', 4);
    box(cab, '#d4d6d8', rx, ry0 - 0.2, rz, 0.4, 0.4, 0.4);
    for (const [dx, dy, dz, rrx, rrz] of [[0.3, 0, 0, 0, -Math.PI / 2], [0, 0.32, 0, 0, 0], [0, -0.32, 0, Math.PI, 0], [0, 0, sz * 0.3, sz * Math.PI / 2, 0]] as [number, number, number, number, number][]) {
      const c = cone(cab, '#6b6e72', rx + sx * dx, ry0 + dy - 0.1, rz + dz, 0.08, 0.18, 6); c.rotation.set(rrx, 0, rrz * sx);
    }
  }
  antennaDish(cab, 0.95, 2.5, 0.65, 0.35, 0.1, 0.5, -0.4, 0, '#e8e6df');
  bar(cab, [-1.2, 2.0, -0.3], [-1.6, 2.6, -0.3], 0.03, '#a0a3a8', 3);
  antennaDish(cab, -1.6, 2.65, -0.3, 0.32, 0.08, 0.2, 0.6, 0, '#ecebe6', false);
  for (const sx of [-1, 1]) bar(cab, [sx * 1.0, 2.2, -1.6], [sx * 1.2, 3.0, -1.8], 0.02, '#d6d6d6', 3);
}

/** Lunar Roving Vehicle (metres, scale s), driver side −x, front +z. */
function lrv(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const R = 0.41, WB = 1.145, TR = 0.915;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    wheel(q, sx * TR, R, sz * WB, R, 0.23, '#a3a5a6', 16, '#d9d2b8');
    add(q, g('pl:fender', () => new THREE.CylinderGeometry(1, 1, 1, 10, 1, true, 0, Math.PI)), mat('#a9adb2'),
      sx * TR, R, sz * WB, R + 0.07, 0.3, R + 0.07, 0, 0, Math.PI / 2);
    bar(q, [sx * 0.55, 0.55, sz * WB], [sx * (TR - 0.12), R, sz * WB], 0.04, '#7a7d81', 4);
    bar(q, [sx * 0.55, 0.62, sz * (WB - 0.3)], [sx * (TR - 0.12), R + 0.05, sz * WB], 0.03, '#7a7d81', 4);
  }
  box(q, '#b4b7b9', 0, 0.5, 0, 1.15, 0.1, 2.35);
  box(q, '#8f9396', 0, 0.6, 0, 1.1, 0.03, 1.6);
  for (const sx of [-1, 1]) {
    box(q, '#6c7a92', sx * 0.3, 0.68, -0.2, 0.48, 0.06, 0.48);
    box(q, '#6c7a92', sx * 0.3, 0.7, -0.46, 0.48, 0.45, 0.05, 0, -0.25);
    bar(q, [sx * 0.55, 0.72, -0.45], [sx * 0.55, 0.8, 0.1], 0.02, '#c9cbcd', 3);
  }
  bar(q, [0, 0.6, 0.35], [0, 1.0, 0.45], 0.035, '#9a9da1', 4);
  box(q, '#2f3134', 0, 0.98, 0.42, 0.42, 0.22, 0.12, 0, -0.3);
  bar(q, [0, 0.72, 0.15], [0, 0.95, 0.2], 0.02, '#202124', 3);
  foil(q, 0, 0.6, 0.9, 1.0, 0.25, 0.5, '#e8e6df');
  box(q, '#d9d9d4', 0.25, 0.85, 1.05, 0.4, 0.28, 0.3);
  bar(q, [0.35, 0.8, 1.15], [0.35, 1.75, 1.15], 0.025, '#b0b3b6', 4);
  const um = antennaDish(q, 0.35, 1.72, 1.15, 0.5, 0.18, 0.15, 0, 0, '#d7d3c4', false, '#a9a59a');
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; bar(um, [0, 0.02, 0], [Math.sin(a) * 0.5, 0.2, Math.cos(a) * 0.5], 0.01, '#8a8780', 3); }
  bar(q, [-0.25, 0.8, 1.05], [-0.25, 1.25, 1.1], 0.03, '#a0a3a6', 4);
  box(q, '#f0f0ec', -0.25, 1.25, 1.1, 0.18, 0.15, 0.3);
  hcyl(q, '#1a1b1d', -0.25, 1.32, 1.27, 0.05, 0.06, 'z', 8);
  bar(q, [-0.45, 0.8, 1.0], [-0.5, 1.6, 1.0], 0.012, '#d0d0d0', 3);
  box(q, '#9a9d9f', 0, 0.6, -1.25, 1.0, 0.3, 0.35);
  for (let i = 0; i < 4; i++) bar(q, [-0.35 + i * 0.22, 0.85, -1.3], [-0.35 + i * 0.22, 1.25, -1.35], 0.015, '#c4c6c8', 3);
}

/** Surveyor lander (metres, scale s): tubular tripod frame, thermal boxes, TV camera, solar panel + flat antenna on the mast. */
function surveyor(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, tilt = 0): void {
  const q = grp(p, x, y, z, ry, tilt, 0, s);
  const AL = '#c7c9c3', top = 3.1;
  const corner = (k: number, r: number, yy: number): V3 => { const a = (k / 3) * TAU; return [Math.sin(a) * r, yy, Math.cos(a) * r]; };
  for (let k = 0; k < 3; k++) {
    bar(q, corner(k, 0.85, 0.75), corner(k + 1, 0.85, 0.75), 0.04, AL, 4);
    bar(q, corner(k, 0.85, 0.75), corner(k + 1, 0.85, 1.25), 0.03, AL, 4);
    bar(q, corner(k, 0.85, 0.75), [0, top - 0.2, 0], 0.035, AL, 4);
    const fp = corner(k, 2.05, 0.12);
    bar(q, corner(k, 0.85, 0.75), fp, 0.06, AL, 5);
    bar(q, corner(k, 0.5, 1.1), corner(k, 1.55, 0.35), 0.05, '#8f9294', 4);
    plathe(q, [[0, 0], [0.25, 0], [0.3, 0.1], [0.15, 0.2], [0, 0.22]], '#d3d1c8', undefined, 10, fp[0], 0, fp[2]);
    const vb = corner(k + 0.5, 0.6, 0.62);
    plathe(q, [[0.1, 0], [0.06, 0.15], [0.05, 0.2]], '#4a4b4e', undefined, 8, vb[0], vb[1] - 0.2, vb[2]);
  }
  bar(q, [0, 0.7, 0], [0, top, 0], 0.05, AL, 6);
  box(q, '#f2f2ee', 0.55, 0.85, 0.05, 0.5, 0.45, 0.55, 0.6);
  box(q, '#f2f2ee', -0.5, 0.85, 0.25, 0.45, 0.4, 0.45, -0.4);
  const cam = grp(q, 0.1, 1.05, -0.7, 0.3);
  cyl(cam, '#e5e5df', 0, 0, 0, 0.12, 0.55, 10);
  metal(box(cam, '#cfd4d8', 0, 0.55, 0, 0.18, 0.16, 0.18, 0.7), '#dde2e6', 0.8, 0.2);
  const pnl = grp(q, 0, top, 0, 0.4, -0.35);
  pv(pnl, 0, 0.05, -0.45, 0.85, 0.9, '#28366b', 'z', 0, 0.12);
  metal(box(pnl, '#cdd0d2', 0, 0.02, 0.45, 0.9, 0.04, 0.9), '#d5d8da', 0.6, 0.35);
  bar(q, [-0.6, 1.0, 0.6], [-1.2, 1.15, 1.3], 0.03, '#9da0a3', 3);
  box(q, '#8a8d90', -1.25, 1.05, 1.35, 0.15, 0.1, 0.2);
}

/** Chang'e lander (metres, scale s): gold body, four legs, two raised solar wings, flag on the front, camera mast. */
function changeLander(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, ce5 = false): THREE.Group {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const B0 = 0.95, H = ce5 ? 1.2 : 1.35, W = ce5 ? 2.9 : 2.4;
  foilCyl(q, 0, B0, 0, W * 0.62, H, 8, GOLD, Math.PI / 8);
  box(q, '#c3c6c9', 0, B0 + H, 0, W * 0.95, 0.08, W * 0.95, Math.PI / 4);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, ca = Math.sin(a), sa = Math.cos(a);
    const fp: V3 = [ca * 2.15, 0.1, sa * 2.15];
    bar(q, [ca * 1.3, B0 + H * 0.7, sa * 1.3], [fp[0], 0.3, fp[2]], 0.085, '#d8d6cf', 5);
    for (const l of [-1, 1]) bar(q, [ca * 1.1 + sa * l * 0.5, B0 + 0.05, sa * 1.1 - ca * l * 0.5], [ca * 1.8, 0.75, sa * 1.8], 0.045, '#a9acb0', 4);
    plathe(q, [[0, 0], [0.38, 0], [0.42, 0.08], [0.25, 0.18], [0, 0.2]], '#d0ccc0', undefined, 10, fp[0], 0, fp[2]);
  }
  plathe(q, [[0.42, 0.45], [0.3, 0.75], [0.25, B0]], '#55565a', undefined, 12);
  flag(q, -0.5, B0 + H * 0.8, W * 0.62 * Math.cos(Math.PI / 8) + 0.02, 0.9, 0.6, 'cn');
  for (const sx of [-1, 1]) {
    const h = grp(q, sx * W * 0.45, B0 + H, 0, 0, 0, sx * -0.95);
    pv(h, sx * 0.85, 0, 0, 1.6, 1.5, '#1f2c5a', 'z', 0, 0.2);
  }
  bar(q, [0.6, B0 + H, -0.6], [0.6, B0 + H + 0.9, -0.6], 0.04, '#c9cbcd', 4);
  box(q, '#2a2b2e', 0.6, B0 + H + 0.9, -0.6, 0.3, 0.2, 0.22);
  return q;
}

/** Yutu / Yutu-2 rover (metres, scale s): gold body, two solar wings angled up, mast with camera head and dish. */
function yutu(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const R = 0.15;
  for (const sx of [-1, 1]) {
    for (const zz of [-0.55, 0, 0.55]) wheel(q, sx * 0.62, R, zz, R, 0.14, '#b7babd', 10);
    bar(q, [sx * 0.45, 0.45, 0.0], [sx * 0.62, R, 0.55], 0.03, '#8d9094', 3);
    bar(q, [sx * 0.45, 0.45, 0.0], [sx * 0.62, R, -0.55], 0.03, '#8d9094', 3);
  }
  foil(q, 0, 0.35, 0, 0.9, 0.4, 1.4, GOLD);
  box(q, '#c7cacc', 0, 0.75, 0, 0.92, 0.04, 1.42);
  for (const sx of [-1, 1]) {
    const h = grp(q, sx * 0.46, 0.77, 0, 0, 0, sx * -0.55);
    pv(h, sx * 0.5, 0, 0, 1.0, 1.35, '#24346a', 'z', 0, 0.17);
  }
  bar(q, [0, 0.77, 0.6], [0, 1.45, 0.6], 0.035, '#d0d0cc', 4);
  box(q, '#e4e2dc', 0, 1.45, 0.6, 0.45, 0.16, 0.16);
  for (const sx of [-1, 1]) hcyl(q, '#141518', sx * 0.15, 1.53, 0.69, 0.04, 0.04, 'z', 8);
  antennaDish(q, -0.2, 1.1, -0.45, 0.22, 0.06, -0.6, 0, 0, '#ecebe6', false);
  bar(q, [-0.2, 0.77, -0.45], [-0.2, 1.1, -0.45], 0.025, '#c0c0c0', 3);
  bar(q, [0, 0.4, 0.72], [0, 0.4, 0.95], 0.03, '#9a9d9f', 3);
}

/** Chang'e 5/6 ascender stacked on the lander, with the sampling arm and the fabric flag. */
function change5(gp: THREE.Group, far: boolean): void {
  const y = terrain(gp, { pal: MOON, side: MOON_SIDE, craters: [{ x: 0.28, z: -0.2, r: 0.09, d: 0.02 }, { x: -0.3, z: 0.25, r: 0.06, d: 0.012 }], amp: 0.008 });
  const s = 0.075, lx = -0.02, lz = -0.03;
  const q = changeLander(gp, lx, y(lx, lz) - 0.004, lz, s, 0.35, true);
  const T = 0.95 + 1.2 + 0.05;
  foilCyl(q, 0, T, 0, 0.85, 0.9, 8, SILVER, Math.PI / 8);
  plathe(q, [[0.85, 0], [0.7, 0.35], [0.25, 0.6], [0, 0.65]], '#e2dfd4', undefined, 8, 0, T + 0.9, 0);
  for (const sx of [-1, 1]) pv(q, sx * 1.15, T + 0.5, 0, 0.6, 0.45, '#24346a', 'x', 0, 0.15);
  hcyl(q, '#4a4b4e', 0, T + 1.6, 0, 0.12, 0.2, 'y', 8);
  bar(q, [0.9, T - 0.2, 0.9], [1.9, T + 0.8, 1.2], 0.06, '#e8e8e4', 5);
  bar(q, [1.9, T + 0.8, 1.2], [2.5, 0.35, 1.9], 0.055, '#e8e8e4', 5);
  box(q, '#bfc2c5', 2.5, 0.12, 1.9, 0.35, 0.25, 0.3);
  bar(q, [-1.3, 0.3, 1.0], [-1.3, 2.1, 1.0], 0.06, '#c8c8c8', 4);
  // the flag stands on a mast above the lander side
  bar(q, [-1.8, 0.95, -0.2], [-1.8, 3.9, -0.2], 0.035, '#e2e2de', 4);
  flag(q, -1.8, 3.85, -0.2, 2.0, 1.3, 'cn', -0.9);
  rocks(gp, y, 26, far ? 61 : 7, '#85837d', 0.02, (rx, rz) => Math.hypot(rx - lx, rz - lz) > 0.18);
}

const changeScene = (gp: THREE.Group, far: boolean) => {
  const rim = (x: number, z: number) => (far ? 0.05 * sstep(0.25, 0.45, -z + x * 0.3) * (0.6 + fbm(x * 8, 3, z * 4, 3) * 0.8) : 0);
  const y = terrain(gp, {
    pal: far ? ['#8f8d88', '#6c6a65', '#b9b7b1'] : MOON, side: MOON_SIDE, extra: rim,
    craters: far ? [{ x: 0.25, z: 0.22, r: 0.07, d: 0.015 }, { x: -0.32, z: 0.1, r: 0.05, d: 0.01 }] : [{ x: 0.3, z: -0.18, r: 0.08, d: 0.018 }],
  });
  const s = 0.072, lx = -0.1, lz = -0.08;
  changeLander(gp, lx, y(lx, lz) - 0.004, lz, s, far ? 0.6 : 0.2);
  const path: P2[] = far ? [[-0.02, 0.0], [0.1, 0.07], [0.19, 0.16], [0.17, 0.27]] : [[-0.02, 0.02], [0.1, 0.1], [0.2, 0.12]];
  const end = path[path.length - 1], prev = path[path.length - 2];
  tracks(gp, path, y, 0.075, 0.016, '#6a6863', '#5a5853');
  yutu(gp, end[0], y(end[0], end[1]) - 0.002, end[1], 0.08, Math.atan2(end[0] - prev[0], end[1] - prev[1]));
  rocks(gp, y, 30, far ? 41 : 9, '#83817b', 0.022, (rx, rz) => Math.hypot(rx - lx, rz - lz) > 0.2 && Math.hypot(rx - end[0], rz - end[1]) > 0.08);
};

/** Lunokhod 1 (metres, scale s): eight-wheeled tub with its round solar lid swung open. */
function lunokhod(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const R = 0.255;
  for (const sx of [-1, 1]) for (const zz of [-1.2, -0.4, 0.4, 1.2]) {
    wheel(q, sx * 1.0, R, zz, R, 0.2, '#a8abae', 8, '#6f7275');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; bar(q, [sx * 1.0, R, zz], [sx * 1.0, R + Math.cos(a) * R * 0.9, zz + Math.sin(a) * R * 0.9], 0.015, '#d0d2d4', 3); }
  }
  box(q, '#6f7276', 0, 0.38, 0, 1.75, 0.12, 2.9);
  const tub = new THREE.CylinderGeometry(1, 0.78, 1, 16, 2);
  tub.scale(1.05, 0.72, 1.2);
  add(q, paintFaces(tub, '#c4c2ba', (fx, fy) => (fy > 0.3 ? '#d6d4cc' : hash3(Math.round(fx * 8), Math.round(fy * 8), 2) > 0.6 ? '#b5b3ab' : null)),
    mat('#ffffff', { vc: true, metal: 0.55, rough: 0.4 }), 0, 0.86, 0, 1, 1, 1);
  plathe(q, [[0, 0], [1.08, 0], [1.12, 0.06], [0, 0.08]], '#9fa2a5', undefined, 18, 0, 1.22, 0);
  const lid = grp(q, 0, 1.3, -1.15, 0, -1.9);
  plathe(lid, [[0, 0.32], [0.55, 0.28], [0.95, 0.15], [1.12, 0.02], [1.12, 0], [0, 0]], '#c9c7bf', undefined, 18, 0, 0, 1.12, { metal: 0.5, rough: 0.4 });
  pv(lid, 0, -0.01, 1.12, 1.45, 1.45, '#25356e', 'z', Math.PI, 0.12);
  for (const sx of [-1, 1]) {
    hcyl(q, '#151618', sx * 0.35, 1.02, 1.28, 0.08, 0.1, 'z', 8);
    metal(box(q, '#e0e2e4', sx * 0.35, 0.9, 1.2, 0.26, 0.24, 0.12), '#e3e5e6', 0.6, 0.3);
  }
  const ant = grp(q, -0.7, 1.3, 0.8, 0, 0.4);
  cone(ant, '#d7d5ce', 0, 0, 0, 0.18, 0.95, 10);
  bar(q, [0.75, 1.25, 0.6], [0.75, 2.1, 0.6], 0.03, '#d0d0cc', 4);
  hcyl(q, '#d8d8d2', 0.75, 2.0, 0.6, 0.06, 0.4, 'y', 8);
  metal(box(q, '#e0e4e8', 0.55, 0.95, 1.33, 0.4, 0.2, 0.1, 0, -0.3), '#e7eaec', 0.85, 0.15);
  bar(q, [0, 0.4, -1.45], [0, 0.2, -1.85], 0.03, '#999999', 3);
  wheel(q, 0, 0.12, -1.9, 0.12, 0.05, '#9a9da0', 6);
}

/** Chandrayaan-3: Vikram lander (box, gold & black foil, side solar panel, ramp) and the Pragyan rover. */
function vikram(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const B0 = 0.95, H = 1.15;
  foil(q, 0, B0, 0, 2.0, H, 2.0, '#d9b04a');
  foil(q, 0, B0 + 0.1, -1.0, 1.4, H - 0.2, 0.06, BLACKF);
  foil(q, -1.0, B0 + 0.15, 0, 0.06, H - 0.3, 1.2, BLACKF);
  box(q, '#bfc2c4', 0, B0 + H, 0, 2.05, 0.06, 2.05);
  pv(q, 0.2, B0 + H + 0.08, 0.1, 1.2, 1.2, '#1c2652', 'z', 0, 0.15);
  const sp = grp(q, 1.05, B0 + H * 0.5, 0, 0, 0, Math.PI / 2);
  pv(sp, 0, 0, 0, 1.0, 1.7, '#1c2652', 'z', 0, 0.15);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, ca = Math.sin(a), sa = Math.cos(a);
    const fp: V3 = [ca * 1.9, 0.08, sa * 1.9];
    bar(q, [ca * 1.2, B0 + 0.5, sa * 1.2], [fp[0], 0.25, fp[2]], 0.07, '#d4d4cf', 5);
    bar(q, [ca * 0.9, B0, sa * 0.9], [ca * 1.6, 0.6, sa * 1.6], 0.045, '#a6a9ad', 4);
    plathe(q, [[0, 0], [0.32, 0], [0.36, 0.07], [0.2, 0.15], [0, 0.17]], '#d5d1c5', undefined, 10, fp[0], 0, fp[2]);
  }
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; plathe(q, [[0.14, 0.55], [0.09, 0.75], [0.08, B0]], '#4f5054', undefined, 8, Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55); }
  plathe(q, [[0.18, 0.5], [0.12, 0.75], [0.1, B0]], '#4f5054', undefined, 8);
  flag(q, -0.5, B0 + H * 0.82, 1.03, 0.75, 0.5, 'in');
  for (const sx of [-1, 1]) bar(q, [sx * 0.35, B0 + 0.05, 1.0], [sx * 0.35, 0.03, 2.7], 0.04, '#cfd1d2', 4);
  box(q, '#b9bcbf', 0, 0.02, 2.75, 0.8, 0.03, 0.15);
  bar(q, [-0.6, B0 + H, -0.6], [-0.6, B0 + H + 0.5, -0.6], 0.03, '#cccccc', 3);
  antennaDish(q, -0.6, B0 + H + 0.5, -0.6, 0.22, 0.06, 0.4, 0, 0, '#eeeeea', false);
}
function pragyan(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  for (const sx of [-1, 1]) for (const zz of [-0.32, 0.02, 0.36]) wheel(q, sx * 0.42, 0.1, zz, 0.1, 0.1, '#b8bbbe', 8);
  foil(q, 0, 0.18, 0.02, 0.62, 0.32, 0.8, '#d9b04a');
  const sp = grp(q, 0, 0.52, -0.38, 0, -1.0);
  pv(sp, 0, 0, 0.3, 0.75, 0.6, '#1c2652', 'z', 0, 0.12);
  bar(q, [0, 0.5, 0.35], [0, 0.72, 0.35], 0.025, '#cccccc', 3);
  box(q, '#2d2e31', 0, 0.72, 0.35, 0.3, 0.1, 0.1);
}

/** SLIM resting on its nose on a slope: main engines pointing up, solar cells on one face, LEV-1 and LEV-2 nearby. */
function slim(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const b = grp(q, 0, 0.85, 0, 0, Math.PI * 0.94, 0.12);
  foil(b, 0, -1.2, 0, 1.7, 2.4, 1.5, GOLD);
  foil(b, 0, -1.2, 0.77, 1.4, 2.3, 0.05, BLACKF);
  const sc = grp(b, 0.87, 0, 0, 0, 0, -Math.PI / 2);
  pv(sc, 0, 0, 0, 2.2, 1.4, '#1e2a57', 'x', 0, 0.16);
  for (const sx of [-1, 1]) {
    hcyl(b, '#dedcd5', sx * 0.45, -1.35, 0, 0.42, 0.25, 'y', 12);
    plathe(b, [[0.12, 0], [0.18, -0.25], [0.32, -0.6]], '#3f4044', undefined, 12, sx * 0.45, -1.4, 0, { metal: 0.5 });
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    bar(b, [Math.sin(a) * 0.6, -1.2, Math.cos(a) * 0.55], [Math.sin(a) * 1.0, -1.7, Math.cos(a) * 0.9], 0.07, '#b5b8bb', 4);
    box(b, '#a8abae', Math.sin(a) * 1.0, -1.8, Math.cos(a) * 0.9, 0.22, 0.18, 0.22);
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; cone(b, '#555659', Math.sin(a) * 0.8, 1.1, Math.cos(a) * 0.7, 0.05, 0.12, 6); }
  bar(b, [0.3, 1.2, -0.3], [0.3, 1.6, -0.3], 0.025, '#cccccc', 3);
}

// ---- Mars hardware ------------------------------------------------------------------------------------------
const MARS: [string, string, string] = ['#b8693f', '#8e4a2b', '#d4925f'];
const MARS_SIDE: [string, string] = ['#8a4a2e', '#6a3722'];
const MARS_ROCK = '#7d4a33';

/** Six wheels on rocker-bogie suspension (metres): wheels at x=±X, axle height R, z = zf / zm / zr. */
function rockerBogie(q: THREE.Object3D, X: number, R: number, w: number, zf: number, zm: number, zr: number, pivY: number, c: string, wc: string, grousers = 12, gc?: string): void {
  for (const sx of [-1, 1]) {
    for (const zz of [zf, zm, zr]) wheel(q, sx * X, R, zz, R, w, wc, grousers, gc);
    const xi = sx * (X - w * 0.5 - 0.05), hi = R + (pivY - R) * 0.55;
    const piv: V3 = [sx * (X - 0.3), pivY, (zf + zr) * 0.12], bog: V3 = [xi, pivY * 0.72, (zm + zr) / 2];
    bar(q, piv, [xi, hi, zf], 0.045, c, 5); bar(q, [xi, hi, zf], [xi, R, zf], 0.04, c, 5);
    bar(q, piv, bog, 0.045, c, 5); bar(q, bog, [xi, R + 0.06, zm], 0.04, c, 5); bar(q, bog, [xi, R + 0.06, zr], 0.04, c, 5);
    bar(q, [xi, R + 0.06, zm], [xi, R, zm], 0.035, c, 4); bar(q, [xi, R + 0.06, zr], [xi, R, zr], 0.035, c, 4);
  }
}

/** Round "UltraFlex" fan-fold solar array (Phoenix, InSight, Cygnus): decagon with alternating gores. */
function ultraflex(p: THREE.Object3D, x: number, y: number, z: number, R: number, ry = 0, rx = 0, rz = 0, c = '#27356c'): THREE.Group {
  const q = grp(p, x, y, z, ry, rx, rz);
  const geo = g(`pl:uflex:${c}`, () => paintFaces(new THREE.CylinderGeometry(1, 1, 0.012, 10, 1), c, (fx, _fy, fz, _nx, ny) => {
    if (Math.abs(ny) < 0.5) return '#b9a46a';
    if (ny < 0) return '#c8c4b8';
    const a = Math.floor(((Math.atan2(fx, fz) + Math.PI) / TAU) * 10);
    return a % 2 ? sh(c, 1.1) : sh(c, 0.85);
  }));
  add(q, geo, mat('#ffffff', { vc: true, metal: 0.4, rough: 0.35 }), 0, 0, 0, R, 1, R, Math.PI / 10);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; bar(q, [0, 0.008, 0], [Math.sin(a) * R, 0.008, Math.cos(a) * R], R * 0.012, '#c9b27a', 3); }
  cyl(q, '#b8b2a4', 0, -0.02, 0, R * 0.12, 0.05, 8);
  return q;
}

/** Curiosity / Perseverance (metres): six big wheels, RTG at the back, remote-sensing mast, hexagonal HGA, arm. */
function mslRover(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, percy: boolean): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const body = percy ? '#e6e3dc' : '#d2cbbd', R = percy ? 0.265 : 0.25;
  rockerBogie(q, 1.35, R, 0.4, 1.05, 0.05, -0.95, 0.85, percy ? '#e9e7e2' : '#d4d1ca', '#bfc2c5', 14, '#7f8386');
  box(q, '#6b665d', 0, 0.6, 0.05, 1.6, 0.1, 2.0);
  box(q, body, 0, 0.68, 0.05, 1.75, 0.5, 2.15);
  box(q, sh(body, 1.05), 0, 1.18, 0.05, 1.9, 0.05, 2.3);
  foil(q, 0.0, 0.7, 1.14, 1.3, 0.38, 0.05, percy ? SILVER : GOLD);
  box(q, '#bdb6a8', 0.45, 1.23, -0.15, 0.55, 0.16, 0.75);
  box(q, '#a49e92', -0.45, 1.23, 0.4, 0.5, 0.12, 0.55);
  box(q, '#8f8b84', -0.35, 1.23, -0.55, 0.4, 0.1, 0.4);
  // RTG leaning out of the back, with radiator fins
  const rt = grp(q, 0, 1.0, -1.3, 0, -0.8);
  hcyl(rt, '#4c4d50', 0, 0, 0, 0.2, 1.0, 'y', 10);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; box(rt, '#3b3c3f', Math.sin(a) * 0.27, -0.48, Math.cos(a) * 0.27, 0.025, 0.96, 0.17, a); }
  for (const sx of [-1, 1]) box(q, '#aaa59c', sx * 0.55, 0.8, -1.2, 0.08, 0.08, 0.5);
  hcyl(q, '#aaa59c', 0, 0.85, -1.3, 0.04, 1.2, 'x', 6);
  // remote-sensing mast with ChemCam / SuperCam head and two Mastcam eyes
  const mxp = 0.55, mzp = 0.85;
  bar(q, [mxp, 1.2, mzp], [mxp, 2.0, mzp], 0.06, '#e7e5e0', 8);
  const hd = grp(q, mxp, 2.0, mzp, -0.15);
  box(hd, '#ece9e2', 0, 0, -0.05, 0.42, 0.24, 0.42);
  hcyl(hd, percy ? '#d8d6d0' : '#e5e2da', 0, 0.3, -0.02, 0.15, 0.38, 'z', 12);
  hcyl(hd, '#151619', 0, 0.3, 0.18, 0.1, 0.02, 'z', 12);
  for (const sx of [-1, 1]) { box(hd, '#6d7075', sx * 0.13, 0.04, 0.16, 0.12, 0.13, 0.08); hcyl(hd, '#0f1012', sx * 0.13, 0.1, 0.2, 0.035, 0.02, 'z', 8); }
  // hexagonal high-gain antenna and UHF antenna
  bar(q, [-0.55, 1.23, -0.3], [-0.55, 1.5, -0.3], 0.05, '#a9a49a', 5);
  add(q, g('pl:hex', () => new THREE.CylinderGeometry(1, 1, 1, 6)), mat('#cbc7be'), -0.55, 1.55, -0.3, 0.3, 0.05, 0.3, 0, 0.5, 0.3);
  cyl(q, '#d9d6cf', 0.15, 1.23, -0.85, 0.08, 0.25, 8);
  // robotic arm reaching to the ground, with the instrument turret
  const sh0: V3 = [0.55, 0.85, 1.25], el: V3 = [0.3, 1.0, 1.95], wr: V3 = [-0.1, 0.55, 2.15];
  bar(q, sh0, el, 0.06, '#e2ded5', 6); bar(q, el, wr, 0.055, '#e2ded5', 6);
  const tu = grp(q, wr[0], wr[1], wr[2], 0.3);
  box(tu, '#bdb8ae', -0.15, -0.1, -0.15, 0.3, 0.25, 0.3);
  box(tu, '#8d8a85', -0.0, -0.33, 0.0, 0.12, 0.2, 0.12);
  hcyl(tu, '#5e6064', 0.18, -0.05, 0, 0.07, 0.2, 'x', 8);
  if (percy) cyl(tu, '#c9c6bf', -0.15, -0.32, 0.1, 0.07, 0.22, 8);
}

/** Ingenuity (metres): box fuselage, four thin legs, two counter-rotating rotors and a solar panel on top. */
function ingenuity(p: THREE.Object3D, x: number, y: number, z: number, s: number): void {
  const q = grp(p, x, y, z, 0, 0, 0, s);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; bar(q, [Math.sin(a) * 0.07, 0.2, Math.cos(a) * 0.07], [Math.sin(a) * 0.33, 0.0, Math.cos(a) * 0.33], 0.01, '#d5d5d0', 3); }
  foil(q, 0, 0.13, 0, 0.17, 0.14, 0.17, '#e3e1da');
  bar(q, [0, 0.27, 0], [0, 0.68, 0], 0.016, '#9fa2a5', 5);
  for (const [hy, a0] of [[0.38, 0.4], [0.5, 1.4]] as P2[]) {
    const sp = new THREE.Group(); sp.name = 'spin'; sp.position.set(0, hy, 0); sp.rotation.set(-Math.PI / 2, 0, a0); q.add(sp);
    for (const sx of [-1, 1]) add(sp, g('pl:blade', () => new THREE.BoxGeometry(1, 1, 1)), mat('#e8e6dc'), sx * 0.3, 0, 0, 0.6, 0.06, 0.01);
    cyl(q, '#4b4d50', 0, hy - 0.02, 0, 0.035, 0.04, 8);
  }
  pv(q, 0, 0.69, 0, 0.36, 0.2, '#25305e', 'z', 0, 0.05);
  bar(q, [0.06, 0.2, 0], [0.12, 0.3, 0.0], 0.006, '#cfcfcf', 3);
}

/** Viking lander (metres): hexagonal body on three legs, two RTGs, HGA, twin facsimile cameras, sampler boom. */
function viking(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const B0 = 0.55, H = 0.45, R = 0.85;
  const bd = cyl(q, '#d7d4cc', 0, B0, 0, R, H, 6); bd.rotation.y = Math.PI / 6;
  const tp = cyl(q, '#bdb9b0', 0, B0 + H, 0, R * 1.03, 0.05, 6); tp.rotation.y = Math.PI / 6;
  foil(q, 0, B0 - 0.06, 0, 1.1, 0.08, 1.1, '#9a7d4a');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI, ca = Math.sin(a), sa = Math.cos(a), fp: V3 = [ca * 1.4, 0.1, sa * 1.4];
    bar(q, [ca * R * 0.9, B0 + 0.2, sa * R * 0.9], fp, 0.06, '#c9c7c0', 5);
    for (const l of [-1, 1]) bar(q, [ca * R * 0.7 + sa * l * 0.35, B0, sa * R * 0.7 - ca * l * 0.35], [ca * 1.3, 0.25, sa * 1.3], 0.035, '#a9aaa8', 4);
    plathe(q, [[0, 0], [0.2, 0], [0.22, 0.06], [0, 0.08]], '#b5b2aa', undefined, 10, fp[0], 0, fp[2]);
  }
  // two RTGs under their finned wind covers, one with the US flag
  for (const sx of [-1, 1]) {
    const rx = sx * 0.62, rz = -0.15;
    box(q, '#e2dfd8', rx, B0 + H, rz, 0.32, 0.38, 0.62, sx * 0.5);
    for (let i = 0; i < 5; i++) box(q, '#b8b4ab', rx, B0 + H + 0.38, rz - 0.24 + i * 0.12, 0.34, 0.03, 0.03, sx * 0.5);
  }
  flag(q, -0.66, B0 + H + 0.3, 0.17, 0.2, 0.12, 'us', -0.5 + Math.PI / 2);
  // high-gain dish on its mast
  bar(q, [0.1, B0 + H, -0.55], [0.1, B0 + H + 0.75, -0.55], 0.04, '#cfcdc6', 5);
  antennaDish(q, 0.1, B0 + H + 0.8, -0.55, 0.38, 0.1, -0.9, 0, 0.3, '#f1efe9', true);
  // twin cameras
  for (const sx of [-1, 1]) {
    cyl(q, '#c9c6be', sx * 0.32, B0 + H, 0.5, 0.11, 0.55, 12);
    box(q, '#16171a', sx * 0.32, B0 + H + 0.32, 0.6, 0.05, 0.14, 0.04);
    cone(q, '#b5b2aa', sx * 0.32, B0 + H + 0.55, 0.5, 0.11, 0.06, 12);
  }
  // sampler boom reaching out to a dug trench, meteorology boom
  box(q, '#bcb9b1', 0.55, B0 + 0.1, 0.55, 0.3, 0.25, 0.3, 0.5);
  bar(q, [0.6, B0 + 0.25, 0.65], [1.25, 0.45, 1.9], 0.035, '#d6d3cc', 5);
  box(q, '#8d8a84', 1.25, 0.25, 1.9, 0.14, 0.2, 0.18, 0.5);
  bar(q, [-0.45, B0 + H, -0.55], [-0.45, B0 + H + 0.6, -0.55], 0.025, '#d0d0cc', 4);
  bar(q, [-0.45, B0 + H + 0.6, -0.55], [-0.8, B0 + H + 0.65, -0.65], 0.02, '#d0d0cc', 3);
  box(q, '#e2e2de', -0.8, B0 + H + 0.6, -0.65, 0.1, 0.08, 0.1);
}

/** Mars Pathfinder (metres): three opened solar petals, the base petal with the camera mast, deflated airbags. */
function pathfinder(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const L = 0.95, tri = (sc: number): P2[] => [0, 1, 2].map(i => { const a = (i / 3) * TAU; return [Math.sin(a) * sc, Math.cos(a) * sc] as P2; });
  const flat = (o: P2[], c: string, yy: number, d = 0.05) => { const m = slab(q, o, d, c, 0, false); m.rotation.x = -Math.PI / 2; m.position.y = yy; return m; };
  flat(tri(L * 0.55), '#7c7a76', 0.32);
  foil(q, 0, 0.32, 0, 0.55, 0.3, 0.5, GOLD);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 3, ca = Math.sin(a), sa = Math.cos(a);
    const pg = grp(q, ca * L * 0.55, 0.1, sa * L * 0.55, a);
    slab(pg, [[-0.95, 0], [0.95, 0], [0, 1.45]], 0.05, '#7a7874', 0, false).rotation.x = Math.PI / 2;
    for (const [px, pz, w] of [[0, 0.32, 1.2], [0, 0.75, 0.6]] as V3[]) pv(pg, px, 0.03, pz, w, 0.35, '#22305f', 'z', 0, 0.12);
    // crumpled airbag lobes along the petal edges
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4, bx = -0.95 + t * 0.95 * (i % 2 ? 1 : 0.6), bz = t * 1.45 * 0.6;
      for (const m of [1, -1]) add(pg, SPH(8), mat(i % 2 ? '#d6d1c4' : '#c9c3b4'), m * (bx * 1.05 - 0.05), 0.08, bz, 0.21, 0.1, 0.18, m * i);
    }
    bar(q, [ca * L * 0.3, 0.38, sa * L * 0.3], [ca * L * 0.55, 0.12, sa * L * 0.55], 0.025, '#9b9893', 3);
  }
  // IMP camera on its mast
  bar(q, [0, 0.6, 0], [0, 1.45, 0], 0.035, '#d5d5d0', 6);
  box(q, '#e2e0da', 0, 1.42, 0, 0.3, 0.12, 0.14);
  for (const sx of [-1, 1]) { box(q, '#d0cec6', sx * 0.12, 1.4, 0.04, 0.1, 0.16, 0.14); hcyl(q, '#121315', sx * 0.12, 1.48, 0.12, 0.03, 0.02, 'z', 8); }
  antennaDish(q, -0.25, 0.75, -0.2, 0.15, 0.04, 0.7, 0, 1.2, '#efede7', false);
  bar(q, [0.25, 0.62, -0.15], [0.25, 1.0, -0.15], 0.015, '#d0d0cc', 3);
  // the two ramps Sojourner drove down
  for (const sx of [-1, 1]) bar(q, [sx * 0.2, 0.15, 1.4], [sx * 0.2, 0.02, 2.0], 0.02, '#bfc1c3', 3);
}

/** Sojourner (metres): small six-wheeled rover with a flat solar panel deck. */
function sojourner(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  for (const sx of [-1, 1]) for (const zz of [-0.25, 0.0, 0.25]) wheel(q, sx * 0.24, 0.065, zz, 0.065, 0.07, '#b9babc', 10);
  for (const sx of [-1, 1]) { bar(q, [sx * 0.2, 0.2, 0.05], [sx * 0.2, 0.07, 0.25], 0.012, '#9da0a3', 3); bar(q, [sx * 0.2, 0.2, 0.05], [sx * 0.2, 0.07, -0.25], 0.012, '#9da0a3', 3); }
  foil(q, 0, 0.13, 0, 0.3, 0.1, 0.42, GOLD);
  pv(q, 0, 0.26, -0.02, 0.48, 0.58, '#24326a', 'z', 0, 0.06);
  bar(q, [0.12, 0.26, -0.2], [0.12, 0.42, -0.2], 0.006, '#d0d0cc', 3);
  box(q, '#2e2f33', 0, 0.16, 0.24, 0.12, 0.05, 0.03);
  box(q, '#cbc8c0', -0.05, 0.14, -0.27, 0.08, 0.08, 0.05);
}

/** Spirit / Opportunity (metres): flat-winged solar deck, Pancam mast, small HGA and low-gain rod. */
function merRover(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  rockerBogie(q, 0.62, 0.13, 0.16, 0.6, 0.0, -0.55, 0.42, '#c8c4bb', '#c4c0b7', 10, '#8d8a85');
  foil(q, 0, 0.3, 0, 0.75, 0.32, 1.1, GOLD);
  box(q, '#cdc8bd', 0, 0.62, 0, 0.82, 0.04, 1.15);
  const PV = '#26346b';
  pv(q, 0, 0.67, -0.05, 1.0, 1.25, PV, 'z', 0, 0.09);
  for (const sx of [-1, 1]) { pv(q, sx * 0.8, 0.68, 0.05, 0.6, 0.9, PV, 'z', sx * -0.04, 0.09); pv(q, sx * 0.55, 0.69, -0.85, 0.5, 0.4, PV, 'z', 0, 0.09); }
  pv(q, 0, 0.68, 0.7, 0.75, 0.25, PV, 'z', 0, 0.09);
  bar(q, [-0.2, 0.68, 0.55], [-0.2, 1.42, 0.55], 0.03, '#e1ddd3', 6);
  const hd = grp(q, -0.2, 1.42, 0.55);
  box(hd, '#dcd9d1', 0, 0, 0, 0.4, 0.1, 0.1);
  for (const sx of [-1, 1]) { box(hd, '#8c8f93', sx * 0.15, 0.0, 0.04, 0.08, 0.09, 0.06); hcyl(hd, '#101113', sx * 0.15, 0.05, 0.08, 0.02, 0.02, 'z', 6); }
  bar(q, [0.3, 0.68, -0.25], [0.3, 0.86, -0.25], 0.03, '#b5b1a8', 4);
  add(q, g('pl:hex', () => new THREE.CylinderGeometry(1, 1, 1, 6)), mat('#d7d3ca'), 0.3, 0.9, -0.25, 0.14, 0.03, 0.14, 0, 0.4);
  bar(q, [-0.3, 0.68, -0.4], [-0.3, 1.1, -0.4], 0.01, '#d0d0cc', 3);
  bar(q, [0.25, 0.4, 0.6], [0.15, 0.3, 0.85], 0.025, '#d9d5cc', 4);
  box(q, '#a29e96', 0.1, 0.2, 0.85, 0.1, 0.1, 0.1);
}

/** Phoenix / InSight lander (metres): deck on three legs with two round UltraFlex arrays and a robotic arm. */
function polarLander(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number, insight: boolean): THREE.Group {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const B0 = 0.75, AR = insight ? 1.1 : 0.95;
  const dk = cyl(q, '#d6d1c4', 0, B0, 0, 0.78, 0.12, 8); dk.rotation.y = Math.PI / 8;
  foilCyl(q, 0, B0 - 0.3, 0, 0.62, 0.3, 8, GOLD, Math.PI / 8);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 3, ca = Math.sin(a), sa = Math.cos(a), fp: V3 = [ca * 1.0, 0.05, sa * 1.0];
    bar(q, [ca * 0.6, B0, sa * 0.6], fp, 0.05, '#cfcac0', 5);
    plathe(q, [[0, 0], [0.16, 0], [0.18, 0.05], [0, 0.07]], '#b9b4a8', undefined, 10, fp[0], 0, fp[2]);
  }
  for (const sx of [-1, 1]) {
    bar(q, [sx * 0.7, B0 + 0.06, 0], [sx * (0.75 + AR * 0.9), B0 + 0.12, 0], 0.03, '#c4bfb4', 4);
    ultraflex(q, sx * (0.8 + AR), B0 + 0.12, 0, AR, 0, 0, sx * -0.05);
  }
  box(q, '#c9c4b8', 0.25, B0 + 0.12, -0.3, 0.35, 0.25, 0.3);
  box(q, '#b4ae9f', -0.25, B0 + 0.12, -0.25, 0.3, 0.18, 0.3);
  foil(q, 0, B0 + 0.12, 0.25, 0.5, 0.15, 0.3, insight ? SILVER : GOLD);
  if (!insight) {
    bar(q, [-0.35, B0 + 0.12, 0.35], [-0.35, B0 + 1.3, 0.35], 0.035, '#e2e0da', 6);
    box(q, '#e2e0da', -0.35, B0 + 1.3, 0.35, 0.28, 0.12, 0.16);
    for (const sx of [-1, 1]) hcyl(q, '#121315', -0.35 + sx * 0.08, B0 + 1.36, 0.44, 0.03, 0.02, 'z', 8);
    bar(q, [0.4, B0 + 0.12, -0.45], [0.4, B0 + 1.1, -0.45], 0.012, '#d0d0cc', 3);
    bar(q, [0.4, B0 + 1.1, -0.45], [0.4, B0 + 1.1, -0.65], 0.01, '#d0d0cc', 3);
  }
  return q;
}

/** Zhurong (metres): blue butterfly solar wings, mast camera, heat-collector windows, six wheels. */
function zhurongRover(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  rockerBogie(q, 0.95, 0.15, 0.2, 0.8, 0.0, -0.8, 0.6, '#d8d8d6', '#c7c9cc', 12, '#8a8d90');
  box(q, '#e9e9e6', 0, 0.45, 0, 1.25, 0.45, 1.8);
  box(q, '#c6cbd2', 0, 0.9, 0, 1.3, 0.04, 1.85);
  pv(q, 0, 0.95, -0.15, 1.15, 1.2, '#1f3c8c', 'z', 0, 0.12, '#cfd3d8');
  for (const sz of [-1, 1]) hcyl(q, '#ececea', sz * 0.3, 0.97, 0.6, 0.15, 0.02, 'y', 14);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = grp(q, sx * 0.62, 0.92, sz * 0.48, 0, sz * 0.12, sx * 0.45);
    pv(w, sx * 0.55, 0, 0, 1.1, 0.85, '#1f3c8c', 'z', 0, 0.12, '#cfd3d8');
  }
  bar(q, [0.0, 0.92, 0.82], [0.0, 1.75, 0.82], 0.035, '#e5e5e2', 6);
  box(q, '#f0f0ee', 0, 1.72, 0.82, 0.38, 0.14, 0.16);
  for (const sx of [-1, 1]) hcyl(q, '#121315', sx * 0.11, 1.79, 0.91, 0.035, 0.02, 'z', 8);
  antennaDish(q, -0.35, 1.05, -0.65, 0.16, 0.04, -0.5, 0, 0, '#f2f2ef', false);
  bar(q, [-0.35, 0.92, -0.65], [-0.35, 1.05, -0.65], 0.02, '#ccc', 3);
}

/** Tianwen-1 landing platform (metres): gold body on four legs with the two ramps folded down to the ground. */
function tianwenLander(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  const B0 = 0.55;
  foilCyl(q, 0, B0, 0, 1.4, 0.55, 8, GOLD, Math.PI / 8);
  const tp = cyl(q, '#c3c4c6', 0, B0 + 0.55, 0, 1.45, 0.06, 8); tp.rotation.y = Math.PI / 8;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, ca = Math.sin(a), sa = Math.cos(a), fp: V3 = [ca * 1.9, 0.06, sa * 1.9];
    bar(q, [ca * 1.2, B0 + 0.35, sa * 1.2], fp, 0.07, '#d6d5d0', 5);
    plathe(q, [[0, 0], [0.3, 0], [0.33, 0.06], [0, 0.08]], '#c8c4ba', undefined, 10, fp[0], 0, fp[2]);
  }
  plathe(q, [[0.6, 0.0], [0.4, 0.3], [0.3, B0]], '#4a4b4e', undefined, 12);
  for (const sx of [-1, 1]) {
    const r0: V3 = [sx * 0.42, B0 + 0.6, 1.2], r1: V3 = [sx * 0.42, 0.02, 2.9];
    bar(q, r0, r1, 0.06, '#c4c6c9', 4);
    bar(q, [r0[0] + sx * 0.12, r0[1], r0[2]], [r1[0] + sx * 0.12, r1[1], r1[2]], 0.03, '#a3a5a8', 3);
  }
  flag(q, -0.4, B0 + 0.45, 1.36, 0.6, 0.4, 'cn', 0);
  bar(q, [0.6, B0 + 0.6, -0.6], [0.6, B0 + 1.1, -0.6], 0.03, '#ccc', 3);
  box(q, '#2b2c2f', 0.6, B0 + 1.1, -0.6, 0.16, 0.12, 0.12);
}

// =============================================================================================================
export const H_PLANETS_MOON: Record<string, Builder> = {
  // Tranquility Base today: Eagle's descent stage, the flag, bootprint trails, the laser reflector and seismometer.
  apollo11: batched(gp => {
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, craters: [{ x: 0.3, z: -0.28, r: 0.1, d: 0.025 }, { x: -0.33, z: 0.22, r: 0.05, d: 0.01 }, { x: 0.05, z: 0.38, r: 0.035, d: 0.008 }] });
    const lx = -0.13, lz = -0.1;
    lunarModule(gp, lx, y(lx, lz) - 0.005, lz, 0.07, 0.45, false);
    const fx = 0.16, fz = -0.06, fy = y(fx, fz);
    bar(gp, [fx, fy - 0.01, fz], [fx, fy + 0.2, fz], 0.0028, '#e8e8e4', 5);
    bar(gp, [fx, fy + 0.195, fz], [fx + 0.11, fy + 0.195, fz + 0.03], 0.002, '#e8e8e4', 4);
    flag(gp, fx, fy + 0.192, fz, 0.115, 0.072, 'us', -0.26);
    // laser ranging retroreflector: a tilted panel of 100 corner cubes
    const rx = 0.17, rz = 0.17, ry = y(rx, rz);
    const lr = grp(gp, rx, ry + 0.02, rz, -0.4, -0.5);
    metal(box(lr, '#9da2a7', 0, 0, 0, 0.07, 0.008, 0.07), '#a9aeb3', 0.6, 0.3);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) metal(hcyl(lr, '#e9eef2', -0.026 + i * 0.013, 0.006, -0.026 + j * 0.013, 0.0045, 0.003, 'y', 6), '#f2f6f8', 0.9, 0.1);
    for (const sx of [-1, 1]) bar(gp, [rx + sx * 0.03, ry, rz], [rx + sx * 0.03, ry + 0.02, rz], 0.002, '#9da2a7', 3);
    // passive seismometer with its two solar wings
    const sx0 = -0.03, sz0 = 0.25, sy0 = y(sx0, sz0);
    foilCyl(gp, sx0, sy0, sz0, 0.014, 0.025, 8, GOLD);
    for (const s of [-1, 1]) pv(gp, sx0 + s * 0.04, sy0 + 0.008, sz0, 0.06, 0.035, '#2a3a74', 'x', 0, 0.008);
    bar(gp, [sx0, sy0 + 0.025, sz0], [sx0 + 0.006, sy0 + 0.05, sz0], 0.0015, '#d6d6d6', 3);
    // the little TV camera on its tripod
    const tx = 0.3, tz = 0.08, ty = y(tx, tz);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; bar(gp, [tx + Math.sin(a) * 0.015, ty, tz + Math.cos(a) * 0.015], [tx, ty + 0.05, tz], 0.0015, '#b8b8b8', 3); }
    box(gp, '#d5d5d0', tx, ty + 0.05, tz, 0.02, 0.016, 0.03, -0.9);
    const ladder: P2 = [lx + Math.sin(0.45) * 0.26, lz + Math.cos(0.45) * 0.26];
    prints(gp, [ladder, [0.02, 0.06], [fx - 0.02, fz + 0.02]], y, '#5e5c58');
    prints(gp, [ladder, [0.05, 0.16], [rx - 0.04, rz]], y, '#5e5c58');
    prints(gp, [[0.0, 0.1], [sx0 + 0.02, sz0 - 0.03]], y, '#5e5c58');
    prints(gp, [[fx, fz + 0.03], [0.23, -0.15], [0.26, -0.21]], y, '#5e5c58');
    prints(gp, [[0.08, 0.12], [tx - 0.02, tz]], y, '#5e5c58');
    rocks(gp, y, 22, 3, '#7f7d78', 0.018, (x, z) => Math.hypot(x - lx, z - lz) > 0.28 && Math.hypot(x - fx, z - fz) > 0.05);
  }),

  // Apollo 12: Pete Conrad visiting Surveyor 3 in its crater, with the lunar module Intrepid on the rim.
  apollo12: batched(gp => {
    const sc = { x: 0.1, z: 0.06, r: 0.25, d: 0.05 };
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, craters: [sc, { x: -0.34, z: 0.25, r: 0.05, d: 0.01 }] });
    const sx = 0.16, sz = 0.12;
    surveyor(gp, sx, y(sx, sz) - 0.005, sz, 0.075, 0.5, 0.12);
    astronaut(gp, 0.0, y(0.0, 0.2), 0.2, 0.06, 1.2, 'walk');
    const lx = -0.24, lz = -0.2;
    lunarModule(gp, lx, y(lx, lz) - 0.004, lz, 0.045, 0.7, true);
    prints(gp, [[lx + 0.12, lz + 0.12], [-0.12, 0.05], [-0.02, 0.18]], y, '#5e5c58');
    const fx = -0.36, fz = -0.02, fy = y(fx, fz);
    bar(gp, [fx, fy - 0.01, fz], [fx, fy + 0.16, fz], 0.0025, '#e8e8e4', 5);
    bar(gp, [fx, fy + 0.155, fz], [fx + 0.09, fy + 0.155, fz + 0.02], 0.0018, '#e8e8e4', 4);
    flag(gp, fx, fy + 0.153, fz, 0.09, 0.057, 'us', -0.22);
    rocks(gp, y, 24, 12, '#7f7d78', 0.016, (x, z) => Math.hypot(x - lx, z - lz) > 0.22 && Math.hypot(x - sx, z - sz) > 0.12);
  }),

  // Apollo 15 at Hadley Rille: Jim Irwin salutes the flag beside the Falcon and the first Lunar Roving Vehicle.
  apollo15: batched(gp => {
    const rille = (x: number, z: number) => { const c = z + 0.34 + Math.sin(x * 6) * 0.03; return -0.045 * Math.exp(-((c / 0.06) ** 2)); };
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, extra: rille, rings: 24, segs: 64, hills: [[-0.3, -0.42, 0.25, 0.06]], craters: [{ x: 0.32, z: 0.2, r: 0.06, d: 0.012 }],
      paint: (x, _y, z) => (rille(x, z) < -0.02 ? mx('#7a7873', '#5f5d59', -rille(x, z) * 12) : null) });
    const lx = -0.17, lz = -0.04;
    lunarModule(gp, lx, y(lx, lz) - 0.004, lz, 0.055, 0.5, true);
    const rx = 0.17, rz = 0.0;
    lrv(gp, rx, y(rx, rz), rz, 0.08, -0.5);
    tracks(gp, [[0.42, -0.15], [0.33, -0.1], [0.25, -0.06], [rx + 0.03, rz - 0.03]], y, 0.12, 0.018, '#6d6b66', '#5d5b56');
    tracks(gp, [[rx - 0.06, rz + 0.06], [0.04, 0.22], [-0.12, 0.33]], y, 0.12, 0.018, '#6d6b66', '#5d5b56');
    const fx = 0.03, fz = 0.12, fy = y(fx, fz);
    bar(gp, [fx, fy - 0.01, fz], [fx, fy + 0.17, fz], 0.0025, '#e8e8e4', 5);
    bar(gp, [fx, fy + 0.165, fz], [fx + 0.095, fy + 0.165, fz + 0.02], 0.0018, '#e8e8e4', 4);
    flag(gp, fx, fy + 0.163, fz, 0.095, 0.06, 'us', -0.2);
    astronaut(gp, 0.1, y(0.1, 0.24), 0.24, 0.06, Math.PI + 0.5, 'salute');
    prints(gp, [[lx + 0.1, lz + 0.12], [-0.02, 0.2], [0.08, 0.26]], y, '#5e5c58');
    rocks(gp, y, 26, 21, '#807e79', 0.016, (x, z) => Math.hypot(x - lx, z - lz) > 0.2 && Math.hypot(x - rx, z - rz) > 0.12 && rille(x, z) > -0.03);
  }),

  // Apollo 17 in the Taurus-Littrow valley: Jack Schmitt at the split boulder (Tracy's Rock), the rover nearby,
  // and the famous orange soil around Shorty crater.
  apollo17: batched(gp => {
    const shorty = { x: 0.28, z: 0.2, r: 0.075, d: 0.02 };
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, hills: [[-0.15, -0.5, 0.35, 0.12], [0.3, -0.48, 0.25, 0.08]], craters: [shorty],
      paint: (x, _y, z) => { const d = Math.hypot(x - 0.2, z - 0.12); return d < 0.045 + fbm(x * 30, 1, z * 30, 2) * 0.04 ? mx('#d9822e', '#b8692b', fbm(x * 70, 2, z * 70, 2)) : null; } });
    const bx = -0.16, bz = -0.12, by = y(bx, bz);
    boulder(gp, '#8a8781', bx - 0.05, by + 0.05, bz, 0.1, 0.085, 0.1, 0.3);
    boulder(gp, '#7e7b75', bx + 0.06, by + 0.04, bz + 0.02, 0.08, 0.07, 0.09, 1.4);
    boulder(gp, '#85827c', bx + 0.03, by + 0.02, bz + 0.12, 0.05, 0.035, 0.05, 0.9);
    astronaut(gp, bx + 0.08, y(bx + 0.08, bz + 0.14), bz + 0.14, 0.062, -0.9);
    const rx = 0.12, rz = 0.04;
    lrv(gp, rx, y(rx, rz), rz, 0.08, 0.9);
    tracks(gp, [[0.42, 0.25], [0.3, 0.1], [0.2, 0.05], [rx + 0.06, rz + 0.01]], y, 0.12, 0.018, '#6d6b66', '#5d5b56');
    prints(gp, [[rx - 0.07, rz - 0.02], [-0.02, 0.0], [bx + 0.08, bz + 0.12]], y, '#5e5c58');
    rocks(gp, y, 30, 31, '#807e79', 0.018, (x, z) => Math.hypot(x - bx, z - bz) > 0.2 && Math.hypot(x - rx, z - rz) > 0.13);
  }),

  // Luna 9: the first soft landing — a little ball that opened four petals and sent home the first photos.
  luna9: batched(gp => {
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, craters: [{ x: -0.25, z: -0.2, r: 0.09, d: 0.02 }, { x: 0.3, z: 0.18, r: 0.05, d: 0.01 }] });
    const q = grp(gp, 0, y(0, 0) + 0.004, 0, 0.3, 0, 0, 0.32);
    ell(q, '#d5d6d2', 0, 0.3, 0, 0.29, 0.3, 0.29);
    shiny(ell(q, '#c3c6c9', 0, 0.3, 0, 0.3, 0.06, 0.3), '#b7babd');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU, pg = grp(q, Math.sin(a) * 0.25, 0.22, Math.cos(a) * 0.25, a, 0.25);
      const petal = slab(pg, [[-0.14, 0], [0.14, 0], [0.2, 0.3], [0.1, 0.55], [-0.1, 0.55], [-0.2, 0.3]], 0.025, '#bfc2c5', 0, false);
      petal.rotation.x = Math.PI / 2; shiny(petal, '#c6c9cc');
      const ta = a + Math.PI / 4;
      bar(q, [Math.sin(ta) * 0.22, 0.45, Math.cos(ta) * 0.22], [Math.sin(ta) * 0.75, 1.05, Math.cos(ta) * 0.75], 0.012, '#d9d9d4', 3);
    }
    cyl(q, '#9fa3a6', 0, 0.58, 0, 0.05, 0.22, 10);
    metal(box(q, '#e5e9ec', 0, 0.8, 0, 0.09, 0.08, 0.09, 0.6, 0.4), '#eef2f4', 0.9, 0.1);
    rocks(gp, y, 26, 51, '#7f7d78', 0.02, (x, z) => Math.hypot(x, z) > 0.2);
  }),

  // Lunokhod 1: the first robot rover on another world, driving across the Sea of Rains with its lid open.
  lunokhod: batched(gp => {
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, craters: [{ x: 0.25, z: -0.22, r: 0.09, d: 0.02 }, { x: -0.3, z: 0.22, r: 0.06, d: 0.012 }] });
    tracks(gp, [[-0.42, -0.2], [-0.25, -0.12], [-0.12, -0.04], [-0.04, 0.02]], y, 0.16, 0.035, '#6c6a65', '#5b5955');
    lunokhod(gp, 0.02, y(0.02, 0.06), 0.06, 0.11, 0.95);
    rocks(gp, y, 26, 71, '#7f7d78', 0.02, (x, z) => Math.hypot(x - 0.02, z - 0.06) > 0.22);
  }),

  change3: batched(gp => changeScene(gp, false)),
  change4: batched(gp => changeScene(gp, true)),
  change5: batched(gp => change5(gp, false)),

  // Chandrayaan-3 near the south pole: Vikram with its ramp, Pragyan rolling away.
  chandrayaan3: batched(gp => {
    const y = terrain(gp, { pal: ['#a09e99', '#76746f', '#c6c4be'], side: MOON_SIDE, amp: 0.01, craters: [{ x: 0.28, z: -0.25, r: 0.1, d: 0.025 }, { x: -0.32, z: 0.24, r: 0.06, d: 0.012 }] });
    const lx = -0.1, lz = -0.1;
    vikram(gp, lx, y(lx, lz) - 0.004, lz, 0.088, 0.4);
    const path: P2[] = [[0.0, 0.1], [0.08, 0.17], [0.18, 0.2]];
    tracks(gp, path, y, 0.06, 0.012, '#6a6863', '#5d5b56', 0.006);
    pragyan(gp, 0.2, y(0.2, 0.21), 0.21, 0.11, 1.6);
    rocks(gp, y, 30, 81, '#82807a', 0.02, (x, z) => Math.hypot(x - lx, z - lz) > 0.2 && Math.hypot(x - 0.2, z - 0.2) > 0.07);
  }),

  // SLIM: Japan's "Moon sniper" landed within 100 m of its target — but ended up standing on its nose.
  slim: batched(gp => {
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, extra: (x, z) => (x * 0.05 + z * 0.03), craters: [{ x: -0.28, z: 0.22, r: 0.07, d: 0.015 }] });
    const x0 = 0.0, z0 = -0.02;
    slim(gp, x0, y(x0, z0) - 0.01, z0, 0.105, 0.6);
    // LEV-2 "SORA-Q": a baseball-sized ball that splits into two wheels
    const bx = 0.2, bz = 0.18, by = y(bx, bz);
    const b2 = grp(gp, bx, by + 0.018, bz, -0.7);
    for (const s of [-1, 1]) shiny(ell(b2, '#c9ccd0', s * 0.012, 0, 0, 0.012, 0.018, 0.018), '#c3c7cb');
    box(b2, '#2c2d30', 0, -0.012, 0, 0.016, 0.022, 0.02);
    bar(b2, [0, 0, -0.01], [0, -0.01, -0.035], 0.002, '#a7a9ac', 3);
    // LEV-1 hopper
    const hx = -0.2, hz = 0.12, hy = y(hx, hz);
    foil(gp, hx, hy, hz, 0.035, 0.03, 0.035, GOLD, 0.4);
    bar(gp, [hx, hy + 0.03, hz], [hx, hy + 0.07, hz], 0.0015, '#d0d0d0', 3);
    rocks(gp, y, 22, 91, '#7f7d78', 0.022, (x, z) => Math.hypot(x - x0, z - z0) > 0.18);
    boulder(gp, '#878580', 0.27, y(0.27, -0.12) + 0.02, -0.12, 0.05, 0.04, 0.05);
  }),

  // Water ice hiding in the never-sunlit floor of a south-pole crater, its rim catching low sunlight.
  ice_crater: batched(gp => {
    const cr = { x: 0, z: 0, r: 0.3, d: 0.1 };
    const lit = (x: number, z: number) => x * 0.8 + z * 0.6;
    const y = terrain(gp, { pal: MOON, side: MOON_SIDE, craters: [cr], rings: 34, segs: 90,
      paint: (x, _y, z) => {
        const q = Math.hypot(x, z) / cr.r;
        if (q < 0.55) return fbm(x * 30, 5, z * 30, 3) > 0.55 ? mx('#a9c6d8', '#d9ecf6', fbm(x * 80, 1, z * 80, 2)) : mx('#2b2c31', '#3a3b41', fbm(x * 20, 2, z * 20, 2));
        if (q < 1.12) return mx('#34353a', '#c4c2bc', sstep(0.05, 0.5, lit(x, z) / (Math.hypot(x, z) + 1e-3)) * (0.6 + 0.4 * sstep(0.5, 1.0, q)));
        return null;
      } });
    for (let i = 0; i < 40; i++) {
      const a = hash3(i, 5, 1) * TAU, d = Math.sqrt(hash3(i, 5, 2)) * cr.r * 0.5, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.006 + hash3(i, 5, 3) * 0.012;
      metal(add(gp, ICO(), mat('#cfe8f6'), x, y(x, z) + s * 0.3, z, s, s * 0.6, s, hash3(i, 5, 4) * 3), '#d7eefa', 0.35, 0.12);
    }
    for (let i = 0; i < 9; i++) {
      const a = hash3(i, 9, 1) * TAU, d = Math.sqrt(hash3(i, 9, 2)) * cr.r * 0.45, x = Math.cos(a) * d, z = Math.sin(a) * d;
      glow(add(gp, g('pl:oct', () => new THREE.OctahedronGeometry(1, 0)), mat('#ffffff'), x, y(x, z) + 0.012, z, 0.004, 0.009, 0.004), '#e6f6ff');
    }
    rocks(gp, y, 20, 13, '#8a8883', 0.02, (x, z) => Math.hypot(x, z) > cr.r * 1.15);
  }),
};

/** Point given in a (y-rotated, uniformly scaled) child group's frame, expressed in its parent's frame. */
const local = (q: THREE.Object3D, v: V3): V3 => {
  const c = Math.cos(q.rotation.y), sn = Math.sin(q.rotation.y), k = q.scale.x;
  return [q.position.x + (v[0] * c + v[2] * sn) * k, q.position.y + v[1] * k, q.position.z + (-v[0] * sn + v[2] * c) * k];
};
const marsRocks = (gp: THREE.Group, y: (x: number, z: number) => number, n: number, seed: number, size: number, keep?: (x: number, z: number) => boolean) =>
  rocks(gp, y, n, seed, MARS_ROCK, size, keep);
const layered = (base: string, h: number) => mx(sh(base, 0.86), sh(base, 1.12), (Math.sin(h * 260) + 1) / 2);

export const H_PLANETS_MARS: Record<string, Builder> = {
  // Viking lander on the boulder-strewn plains (Viking 1 at Chryse, Viking 2 at Utopia).
  viking: batched(gp => {
    const y = terrain(gp, { pal: MARS, side: MARS_SIDE, amp: 0.008, hills: [[0.3, -0.42, 0.2, 0.04]] });
    const lx = -0.05, lz = -0.05;
    viking(gp, lx, y(lx, lz), lz, 0.15, 0.5);
    boulder(gp, '#6f412d', -0.3, y(-0.3, 0.15) + 0.03, 0.15, 0.08, 0.05, 0.06, 0.7);
    const tx = 0.15, tz = 0.25;
    add(gp, g('pl:trench', () => new THREE.BoxGeometry(1, 1, 1)), mat('#6e3a24'), tx, y(tx, tz) - 0.002, tz, 0.035, 0.008, 0.06, 0.5);
    marsRocks(gp, y, 60, 101, 0.022, (x, z) => Math.hypot(x - lx, z - lz) > 0.22);
  }),

  // Mars Pathfinder's opened petals, with little Sojourner sniffing the rock "Yogi".
  pathfinder: batched(gp => {
    const y = terrain(gp, { pal: MARS, side: MARS_SIDE, amp: 0.008, hills: [[-0.2, -0.5, 0.16, 0.07], [0.05, -0.52, 0.14, 0.06]] });
    const lx = -0.1, lz = -0.06;
    pathfinder(gp, lx, y(lx, lz) - 0.004, lz, 0.13, 0.3);
    const rx = 0.24, rz = 0.18;
    tracks(gp, [[lx + 0.13, lz + 0.22], [0.1, 0.24], [rx - 0.03, rz + 0.01]], y, 0.06, 0.012, '#8d4a2c', '#7c3f25', 0.006);
    sojourner(gp, rx, y(rx, rz), rz, 0.22, 1.3);
    boulder(gp, '#7a4630', rx + 0.1, y(rx + 0.1, rz - 0.04) + 0.03, rz - 0.04, 0.06, 0.05, 0.05, 0.2);
    marsRocks(gp, y, 55, 111, 0.02, (x, z) => Math.hypot(x - lx, z - lz) > 0.24 && Math.hypot(x - rx, z - rz) > 0.07);
  }),

  // Spirit / Opportunity, the twin solar-powered geologists.
  mer: batched(gp => {
    const y = terrain(gp, { pal: MARS, side: MARS_SIDE, amp: 0.006, craters: [{ x: 0.28, z: -0.22, r: 0.12, d: 0.03 }],
      paint: (x, _y, z) => (Math.hypot(x - 0.28, z + 0.22) < 0.09 ? mx('#c69a74', '#b88a66', fbm(x * 50, 3, z * 50, 2)) : null) });
    const rx = -0.04, rz = 0.04;
    tracks(gp, [[-0.42, 0.25], [-0.25, 0.18], [-0.12, 0.08], [rx - 0.02, rz]], y, 0.2, 0.03, '#8e4b2d', '#7a3e24', 0.01);
    merRover(gp, rx, y(rx, rz), rz, 0.19, -1.0 + Math.PI);
    for (let i = 0; i < 26; i++) {
      const a = hash3(i, 3, 3) * TAU, d = 0.1 + hash3(i, 4, 4) * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d;
      ell(gp, '#4b4b55', x, y(x, z) + 0.004, z, 0.006);
    }
    marsRocks(gp, y, 35, 121, 0.02, (x, z) => Math.hypot(x - rx, z - rz) > 0.2);
  }),

  // Phoenix on the polygon-patterned arctic plain, scraping water ice out of its trench.
  phoenix: batched(gp => {
    const poly = (x: number, z: number) => { const [a, b] = worley(x * 9, 0.5, z * 9); return b - a; };
    const tx = 0.12, tz = 0.17;
    const trench = (x: number, z: number) => (Math.abs(x - tx) < 0.05 && Math.abs(z - tz) < 0.025 ? 1 : 0);
    const y = terrain(gp, { pal: ['#b8835f', '#8f6247', '#d2a586'], side: MARS_SIDE, amp: 0.004,
      extra: (x, z) => -0.012 * (1 - sstep(0.0, 0.12, poly(x, z))) - trench(x, z) * 0.012,
      paint: (x, _y, z) => (trench(x, z) ? (fbm(x * 90, 1, z * 90, 2) > 0.45 ? '#f1f4f6' : '#e2e6e8') : poly(x, z) < 0.05 ? '#9b6c50' : null) });
    const lx = -0.08, lz = -0.06;
    const q = polarLander(gp, lx, y(lx, lz) - 0.003, lz, 0.105, 0.35, false);
    const elbow = local(q, [0.3, 1.4, 0.9]), hand: V3 = [tx, y(tx, tz) + 0.02, tz];
    bar(gp, local(q, [0.35, 0.87, 0.55]), elbow, 0.006, '#e0ddd5', 5);
    bar(gp, elbow, hand, 0.0055, '#e0ddd5', 5);
    box(gp, '#9a9894', hand[0], hand[1] - 0.012, hand[2], 0.02, 0.018, 0.025, 0.4);
    rocks(gp, y, 14, 131, '#7b5a45', 0.015, (x, z) => Math.hypot(x - lx, z - lz) > 0.3 && !trench(x, z));
  }),

  // Curiosity climbing the layered slopes of Mount Sharp in Gale crater.
  curiosity: batched(gp => {
    const y = terrain(gp, { pal: MARS, side: MARS_SIDE, amp: 0.007, hills: [[-0.12, -0.55, 0.42, 0.2], [0.3, -0.5, 0.2, 0.08]],
      paint: (x, yy, z) => (z < -0.12 && yy > 0.05 ? layered('#c0784c', yy) : null) });
    const rx = 0.03, rz = 0.08;
    tracks(gp, [[-0.4, 0.05], [-0.25, 0.0], [-0.12, 0.02], [rx - 0.06, rz - 0.03]], y, 0.33, 0.05, '#8e4b2d', '#7a3e24', 0.012);
    mslRover(gp, rx, y(rx, rz) - 0.003, rz, 0.12, 1.1, false);
    marsRocks(gp, y, 40, 141, 0.024, (x, z) => Math.hypot(x - rx, z - rz) > 0.24);
  }),

  // InSight with its seismometer under the dome and the "mole" heat probe beside it.
  insight: batched(gp => {
    const y = terrain(gp, { pal: ['#b56d47', '#8d4f33', '#cd8c64'], side: MARS_SIDE, amp: 0.004, craters: [{ x: 0.3, z: -0.25, r: 0.08, d: 0.012 }] });
    const lx = -0.05, lz = -0.12;
    polarLander(gp, lx, y(lx, lz) - 0.003, lz, 0.085, 0, true);
    const sx = -0.06, sz = 0.16, sy = y(sx, sz);
    plathe(gp, [[0, 0], [0.065, 0], [0.062, 0.006], [0.048, 0.03], [0.03, 0.045], [0, 0.05]], '#dcd8ce', undefined, 18, sx, sy - 0.003, sz);
    const hx = 0.07, hz = 0.18, hy = y(hx, hz);
    box(gp, '#d9d6cd', hx, hy + 0.012, hz, 0.03, 0.04, 0.03);
    for (const [ax, az] of [[-1, -1], [1, -1], [0, 1]] as P2[]) bar(gp, [hx + ax * 0.012, hy + 0.012, hz + az * 0.012], [hx + ax * 0.022, hy, hz + az * 0.022], 0.0015, '#bbb', 3);
    bar(gp, [lx + 0.05, y(lx, lz) + 0.08, lz + 0.05], [0.0, y(0, 0.04) + 0.1, 0.04], 0.0045, '#e2ded5', 5);
    bar(gp, [0.0, y(0, 0.04) + 0.1, 0.04], [0.05, y(0.05, 0.08) + 0.04, 0.08], 0.004, '#e2ded5', 5);
    tracks(gp, [[lx + 0.02, lz + 0.1], [hx, hz - 0.01]], y, 0.0, 0.003, '#8a8478', '#8a8478', 0.004);
    marsRocks(gp, y, 18, 151, 0.016, (x, z) => Math.hypot(x - lx, z - lz) > 0.3 && Math.hypot(x - sx, z - sz) > 0.08);
  }),

  // Perseverance in Jezero crater's ancient river delta, with the Ingenuity helicopter.
  perseverance: batched(gp => {
    const y = terrain(gp, { pal: ['#b7714a', '#8a4d30', '#d29a70'], side: MARS_SIDE, amp: 0.007, hills: [[-0.3, -0.5, 0.28, 0.12], [0.1, -0.56, 0.25, 0.09]],
      paint: (x, yy, z) => (z < -0.18 && yy > 0.05 ? layered('#c58258', yy) : null) });
    const rx = -0.06, rz = 0.06;
    tracks(gp, [[-0.42, 0.22], [-0.3, 0.2], [-0.16, 0.12], [rx - 0.03, rz + 0.02]], y, 0.33, 0.05, '#8e4b2d', '#7a3e24', 0.012);
    mslRover(gp, rx, y(rx, rz) - 0.003, rz, 0.12, 0.9, true);
    const ix = 0.27, iz = 0.0;
    ingenuity(gp, ix, y(ix, iz), iz, 0.2);
    marsRocks(gp, y, 40, 161, 0.024, (x, z) => Math.hypot(x - rx, z - rz) > 0.24 && Math.hypot(x - ix, z - iz) > 0.08);
  }),

  // Zhurong rolled down the ramps of the Tianwen-1 lander onto Utopia Planitia.
  zhurong: batched(gp => {
    const y = terrain(gp, { pal: MARS, side: MARS_SIDE, amp: 0.005, craters: [{ x: 0.32, z: -0.18, r: 0.07, d: 0.015 }] });
    const lx = -0.14, lz = -0.16;
    tianwenLander(gp, lx, y(lx, lz) - 0.003, lz, 0.085, 0.5);
    const rx = 0.14, rz = 0.18;
    tracks(gp, [[lx + 0.13, lz + 0.22], [0.02, 0.12], [rx - 0.05, rz - 0.03]], y, 0.2, 0.03, '#8e4b2d', '#7a3e24', 0.01);
    zhurongRover(gp, rx, y(rx, rz), rz, 0.14, 0.9);
    marsRocks(gp, y, 30, 171, 0.02, (x, z) => Math.hypot(x - lx, z - lz) > 0.25 && Math.hypot(x - rx, z - rz) > 0.2);
  }),

  // Olympus Mons: the biggest volcano in the Solar System, ringed by cliffs and crowned with nested calderas.
  olympus: batched(gp => {
    const shield = (x: number, z: number) => {
      const r = Math.hypot(x, z) * (1 + 0.08 * (fbm(Math.atan2(x, z) * 2 + 5, 1, 1, 3) - 0.5));
      return r < 0.34 ? 0.045 + 0.15 * (1 - (r / 0.34) ** 1.5) : 0.045 * (1 - sstep(0.34, 0.37, r));
    };
    const cal: Crater[] = [{ x: 0.0, z: 0.0, r: 0.06, d: 0.045 }, { x: 0.05, z: 0.03, r: 0.04, d: 0.03 }, { x: -0.04, z: 0.04, r: 0.035, d: 0.025 }];
    const y = terrain(gp, { pal: ['#c27a4e', '#8f4f32', '#d9a07a'], side: MARS_SIDE, amp: 0.004, extra: shield, rings: 36, segs: 90,
      paint: (x, yy, z, ny) => {
        const r = Math.hypot(x, z);
        if (r < 0.09) return mx('#6e3b28', '#86503a', fbm(x * 40, 1, z * 40, 2));
        if (r > 0.32 && r < 0.39 && ny < 0.9) return mx('#7e4630', '#5e3121', fbm(x * 30, 2, z * 30, 2));
        if (r < 0.34) return mx('#b8704a', '#8c4d32', sstep(0.4, 0.75, fbm(Math.atan2(x, z) * 9, r * 14, 3, 3)));
        return null;
      }, craters: cal });
    marsRocks(gp, y, 16, 181, 0.014, (x, z) => Math.hypot(x, z) > 0.38);
  }),
};

// ---- spacecraft without a base -----------------------------------------------------------------------------
/** Builds a craft in metres inside a group, then scales it so its largest dimension is `span` and centres it. */
const craft = (span: number, fn: (q: THREE.Group) => void): Builder => batched(gp => {
  const q = new THREE.Group(); gp.add(q);
  const n0 = RODS!.length;
  fn(q);
  gp.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(q);
  for (const it of RODS!.slice(n0)) for (const v of [it.a, it.b]) bb.expandByPoint(_v.set(v[0], v[1], v[2]).applyMatrix4(it.p.matrixWorld));
  bb.applyMatrix4(_inv.copy(gp.matrixWorld).invert());
  const s = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), k = span / Math.max(s.x, s.y, s.z);
  q.scale.setScalar(k); q.position.copy(c).multiplyScalar(-k);
});
/** Rectangular solar wing of n panels along +x from (x0,y,z) (cells facing +y), with a yoke. */
function wing(q: THREE.Object3D, x0: number, y: number, z: number, dir: 1 | -1, n: number, pw: number, pl: number, c: string, gap = 0.08, rx = 0, yoke = 0.6, cell = 0.25): void {
  const w = grp(q, x0, y, z, 0, rx);
  bar(w, [0, 0, 0], [dir * yoke, 0, 0], 0.05, '#bfc3c7', 5);
  for (let i = 0; i < n; i++) pv(w, dir * (yoke + pw / 2 + i * (pw + gap)), 0, 0, pw, pl, c, 'z', 0, cell);
}
/** Finned RTG (metres) along +y, centred at the origin of a group. */
function rtg(p: THREE.Object3D, x: number, y: number, z: number, L: number, r: number, ry = 0, rx = 0, rz = 0, c = '#3a3b3e'): void {
  const q = grp(p, x, y, z, ry, rx, rz);
  hcyl(q, c, 0, 0, 0, r, L, 'y', 10);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; box(q, sh(c, 0.85), Math.sin(a) * r * 1.4, -L * 0.48, Math.cos(a) * r * 1.4, r * 0.12, L * 0.96, r * 0.9, a); }
  for (const e of [-1, 1]) hcyl(q, sh(c, 1.3), 0, e * L * 0.5, 0, r * 1.1, L * 0.06, 'y', 10);
}
/** Square-cell magnetometer / instrument boom (lattice). */
const boom = (q: THREE.Object3D, a: V3, b: V3, w: number, c = '#c9c6bd') => truss(q, a, b, w, w, Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (w * 3))), c, w * 0.08);

export const H_PLANETS_CRAFT: Record<string, Builder> = {
  // Mars Reconnaissance Orbiter: a huge 3 m dish, two big solar panels and the HiRISE telescope pointing down.
  mro: craft(0.9, q => {
    foil(q, 0, -1.2, 0, 2.0, 2.4, 1.8, BLACKF);
    foil(q, 0, -1.25, 0.92, 1.6, 1.6, 0.06, GOLD);
    hcyl(q, '#d6d3cb', 0.3, -1.6, -0.2, 0.42, 0.9, 'y', 16);
    hcyl(q, '#141518', 0.3, -2.06, -0.2, 0.36, 0.03, 'y', 16);
    for (const sx of [-1, 1] as const) {
      wing(q, sx * 1.0, -0.2, 0, sx, 1, 5.3, 2.5, '#26305e', 0.08, sx * 0.25, 0.9, 0.35);
    }
    antennaDish(q, 0, 0.9, -0.3, 1.5, 0.55, -0.35, 0, 0, '#efeee8', true, '#c9c6bd');
    bar(q, [0, 0.0, -0.1], [0, 0.85, -0.3], 0.1, '#bdbab2', 6);
    bar(q, [-1.0, -2.3, 0.6], [-5.0, -2.3, 0.6], 0.025, '#d8d6cf', 4);
    bar(q, [1.0, -2.3, 0.6], [5.0, -2.3, 0.6], 0.025, '#d8d6cf', 4);
    box(q, '#a39f96', 0, -2.4, 0.6, 2.0, 0.12, 0.2);
  }),

  // Tianwen-1 orbiter: gold hexagonal body, two three-panel solar wings and a 2.5 m dish.
  tianwen1: craft(0.9, q => {
    foilCyl(q, 0, -1.5, 0, 1.4, 3.0, 6, GOLD, Math.PI / 6);
    hcyl(q, '#d8d6cf', 0, 1.53, 0, 1.45, 0.06, 'y', 6).rotation.y = Math.PI / 6;
    plathe(q, [[0.15, 0], [0.4, -0.5], [0.55, -0.9]], '#4b4c50', undefined, 14, 0, -1.5, 0, { metal: 0.5 });
    for (const sx of [-1, 1] as const) wing(q, sx * 1.25, 0.2, 0, sx, 3, 2.0, 2.4, '#1f2d63', 0.1, 0, 0.9, 0.3);
    bar(q, [0, 1.5, 0.4], [0, 2.4, 0.6], 0.1, '#c9c6bd', 6);
    antennaDish(q, 0, 2.5, 0.6, 1.25, 0.4, 0.5, 0, 0, '#f0eee8', true);
    box(q, '#e6e3db', 0.8, 1.55, -0.6, 0.5, 0.5, 0.5);
  }),

  // Akatsuki: a gold box with two solar paddles and a flat high-gain antenna, studying Venus' clouds.
  akatsuki: craft(0.9, q => {
    foil(q, 0, -0.7, 0, 1.4, 1.45, 1.05, GOLD);
    foil(q, 0, -0.65, 0.54, 1.2, 1.3, 0.04, SILVER);
    for (const sx of [-1, 1] as const) wing(q, sx * 0.7, 0, 0, sx, 2, 1.25, 1.4, '#22305e', 0.06, 0.6, 0.4, 0.2);
    box(q, '#e9e6de', 0, 0.75, 0.0, 0.85, 0.06, 0.85, 0.3);
    bar(q, [0, 0.75, 0], [0, 0.95, 0], 0.08, '#bbb', 6);
    box(q, '#d6d1c3', 0, 0.95, 0, 0.75, 0.04, 0.75, 0.3);
    for (const [cx, cz] of [[0.35, 0.53], [-0.3, 0.53], [0.0, 0.53]] as P2[]) hcyl(q, '#1d1e22', cx, -0.3, cz + 0.05, 0.1, 0.12, 'z', 10);
    plathe(q, [[0.12, 0], [0.18, -0.15], [0.26, -0.35]], '#4b4c50', undefined, 12, 0, -0.72, 0, { metal: 0.5 });
  }),

  // MESSENGER: hiding behind its big white sunshade, with mirror-striped solar panels and a magnetometer boom.
  messenger: craft(0.9, q => {
    foil(q, 0, -0.7, 0, 1.85, 1.3, 1.25, GOLD);
    const ss = g('pl:sunshade', () => new THREE.CylinderGeometry(2.4, 2.4, 2.0, 18, 1, true, -0.55, 1.1));
    add(q, ss, mat('#ece4cf'), 0, 0, -1.5, 1, 1, 1);
    for (let i = 0; i < 3; i++) bar(q, [-0.8 + i * 0.8, 0.6, 0.6], [-0.8 + i * 0.8, 0.6, 0.85], 0.03, '#bbb', 3);
    for (const sx of [-1, 1] as const) {
      const w = grp(q, sx * 0.95, 0, 0);
      bar(w, [0, 0, 0], [sx * 0.6, 0, 0], 0.05, '#bbb', 4);
      const pg = grp(w, sx * 1.4, 0, 0, 0, 0.2);
      for (let i = 0; i < 6; i++) { const col = i % 2 ? '#24306a' : '#d9dde1'; metal(box(pg, col, 0, -0.02, -0.75 + i * 0.25 + 0.125, 1.5, 0.04, 0.25), col, i % 2 ? 0.4 : 0.9, 0.2); }
    }
    boom(q, [0, -0.1, -0.65], [0, -0.1, -4.0], 0.12);
    box(q, '#d7d4ca', 0, -0.2, -4.05, 0.25, 0.2, 0.15);
    for (const sz of [-1, 1]) box(q, '#e8e6e0', 0, 0.62, sz * 0.4, 0.5, 0.06, 0.3);
    plathe(q, [[0.12, 0], [0.2, -0.25]], '#4b4c50', undefined, 12, 0, -0.7, 0, { metal: 0.5 });
  }),

  // Juno: a spinning hexagon with three giant solar wings (one carrying the magnetometers) and a big white dish.
  juno: craft(0.9, q => {
    foilCyl(q, 0, -1.6, 0, 1.75, 3.2, 6, BLACKF, Math.PI / 6);
    foilCyl(q, 0, 1.6, 0, 0.9, 0.6, 6, GOLD);
    box(q, '#b7b3a8', 0, 1.6, 0, 1.2, 0.6, 1.2);
    antennaDish(q, 0, 2.25, 0, 1.25, 0.35, 0, 0, 0, '#f2f1ec', true);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + Math.PI / 6, w = grp(q, Math.cos(a) * 1.5, 0.3, -Math.sin(a) * 1.5, a);
      const n = k === 0 ? 3 : 4;
      for (let i = 0; i < n; i++) pv(w, 0.2 + 1.35 + i * 2.75, 0, 0, 2.65, 2.6, '#1f2b5e', 'z', 0, 0.3);
      if (k === 0) { boom(w, [8.4, 0, 0], [10.6, 0, 0], 0.4, '#d2cfc6'); box(w, '#e6e3db', 10.7, -0.2, 0, 0.4, 0.4, 0.4); }
    }
    plathe(q, [[0.25, 0], [0.45, -0.6]], '#4b4c50', undefined, 12, 0, -1.6, 0, { metal: 0.5 });
  }),

  // Europa Clipper: enormous solar wings, a 3 m dish on a tall body, radar antennas and a magnetometer boom.
  clipper: craft(0.9, q => {
    hcyl(q, '#d9d6ce', 0, 0, 0, 0.8, 3.2, 'y', 14);
    foilCyl(q, 0, -1.6, 0, 0.82, 1.4, 14, GOLD);
    box(q, '#a9a59c', 0, 1.0, 0.75, 1.1, 0.9, 0.5);
    antennaDish(q, 0, 1.75, 0, 1.5, 0.45, 0, 0, 0, '#f1f0eb', true);
    for (const sx of [-1, 1] as const) {
      const w = grp(q, sx * 0.8, -0.2, 0);
      bar(w, [0, 0, 0], [sx * 1.0, 0, 0], 0.06, '#bbb', 5);
      for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) pv(w, sx * (1.0 + 1.25 + i * 2.5), 0, sz * 1.05, 2.4, 2.0, '#1f2c62', 'z', 0, 0.3);
      for (const sz of [-1, 1]) box(w, '#c9c4b5', sx * 7.3, 0.1, sz * 2.25, 12.0, 0.05, 0.25);
    }
    boom(q, [0, -0.8, -0.8], [0, -0.8, -8.0], 0.25);
    plathe(q, [[0.2, 0], [0.4, -0.5]], '#4b4c50', undefined, 12, 0, -1.6, 0, { metal: 0.5 });
  }),

  // Cassini: the tall stack with its 4 m dish on top, gold propulsion module, black RTGs and the Huygens probe.
  cassini: craft(0.9, q => {
    antennaDish(q, 0, 2.6, 0, 2.0, 0.55, 0, 0, 0, '#f3f2ee', true);
    bar(q, [0, 2.3, 0], [0, 2.7, 0], 0.4, '#d0ccc2', 8);
    foilCyl(q, 0, 1.5, 0, 0.9, 0.8, 12, BLACKF);
    foilCyl(q, 0, -1.6, 0, 1.1, 3.1, 12, GOLD);
    foilCyl(q, 0, -1.9, 0, 0.9, 0.3, 12, BLACKF);
    for (const sx of [-1, 1]) plathe(q, [[0.15, 0], [0.22, -0.35], [0.35, -0.75]], '#4a4b4f', undefined, 12, sx * 0.4, -1.9, 0.6, { metal: 0.5 });
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.9; rtg(q, Math.sin(a) * 1.35, -1.4, Math.cos(a) * 1.35, 1.1, 0.22, a, 0, 0.7); }
    // Huygens, still riding on the side
    const h = grp(q, 1.35, 0.1, 0.0, 0, 0, -Math.PI / 2);
    plathe(h, [[0, 0.0], [1.35, 0], [1.3, 0.12], [0.5, 0.45], [0, 0.5]], GOLD2, undefined, 18, 0, 0, 0, { metal: 0.7, rough: 0.35 });
    boom(q, [-0.9, 1.1, 0], [-6.0, 1.1, 0], 0.2, '#3a3a3c');
    box(q, '#d7d4ca', 0.4, 1.0, 0.95, 0.6, 0.5, 0.25);
  }),

  // Dawn: a small box with giant solar wings, gently pushed by a blue ion engine.
  dawn: craft(0.9, q => {
    foil(q, 0, -0.8, 0, 1.6, 1.6, 1.3, GOLD);
    foil(q, 0, -0.75, 0.66, 1.3, 1.3, 0.04, BLACKF);
    for (const sx of [-1, 1] as const) wing(q, sx * 0.8, 0, 0, sx, 5, 1.6, 2.3, '#222f63', 0.07, 0, 0.6, 0.3);
    antennaDish(q, 0, 0.3, 0.9, 0.76, 0.2, Math.PI / 2, 0, 0, '#f2f1ec', true);
    glow(plathe(q, [[0, 0], [0.32, 0], [0.42, -0.9], [0, -1.1]], '#7fb6ff', undefined, 14, 0, -0.8, 0), '#7fb6ff');
    hcyl(q, '#4a4b4f', 0, -0.85, 0, 0.36, 0.1, 'y', 14);
  }),

  // New Horizons: a piano-sized triangle with a big dish and its plutonium RTG sticking out like a tail.
  new_horizons: craft(0.9, q => {
    const tri = (r: number): P2[] => [0, 1, 2].map(i => { const a = (i / 3) * TAU; return [Math.sin(a) * r, Math.cos(a) * r] as P2; });
    const body = slab(q, tri(1.3), 0.75, GOLD, 0, false); body.rotation.x = -Math.PI / 2; body.position.y = -0.4;
    body.material = mat(GOLD, { metal: 0.7, rough: 0.35 });
    foilCyl(q, 0, -0.4, 0, 0.45, 0.78, 8, BLACKF);
    antennaDish(q, 0, 0.45, 0, 1.05, 0.3, 0, 0, 0, '#f3f2ee', true);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI / 3; bar(q, [Math.sin(a) * 0.4, 0.35, Math.cos(a) * 0.4], [Math.sin(a) * 0.9, 0.5, Math.cos(a) * 0.9], 0.03, '#bbb', 3); }
    rtg(q, 0, -0.05, -1.5, 1.1, 0.22, 0, Math.PI / 2 - 0.25, 0);
    bar(q, [0, -0.05, -0.65], [0, -0.05, -1.0], 0.05, '#aaa', 4);
    hcyl(q, '#ddd9cf', 0.6, -0.2, 0.55, 0.13, 0.6, 'z', 12);
    box(q, '#2c2d31', -0.55, -0.4, 0.5, 0.35, 0.3, 0.3);
  }),

  // Parker Solar Probe: a thick white heat shield faces the Sun while the spacecraft hides in its shadow.
  parker: craft(0.9, q => {
    plathe(q, [[0, 0], [1.15, 0], [1.15, 0.115], [0, 0.115]], '#2b2b2d', (_x, y) => (y > 0.1 ? '#f4f2ec' : null), 28, 0, 0.9, 0);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; bar(q, [Math.sin(a) * 0.35, -0.3, Math.cos(a) * 0.35], [Math.sin(a) * 0.75, 0.9, Math.cos(a) * 0.75], 0.03, '#9b9b9b', 4); }
    foilCyl(q, 0, -1.3, 0, 0.55, 1.0, 6, SILVER);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; box(q, '#e2e2de', Math.sin(a) * 0.4, -0.3, Math.cos(a) * 0.4, 0.5, 0.06, 0.5, a); }
    for (const sx of [-1, 1]) {
      const w = grp(q, sx * 0.55, -0.75, 0, 0, 0, sx * 0.35);
      pv(w, sx * 0.55, 0, 0, 1.1, 0.7, '#1e2a5e', 'z', 0, 0.15);
    }
    boom(q, [0, -1.3, 0], [0, -3.5, 0], 0.12);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; bar(q, [Math.sin(a) * 0.5, 0.5, Math.cos(a) * 0.5], [Math.sin(a) * 2.1, 0.5, Math.cos(a) * 2.1], 0.015, '#d4cba0', 3); }
    antennaDish(q, 0.35, -1.6, 0.4, 0.3, 0.08, Math.PI / 2, 0, 0, '#f2f1ec', false);
  }),

  // International Space Station and China's Tiangong, re-centred from the Earth pack.
  iss: batched(centred(H_SPACE.sp_iss, 0.94)),
  tiangong: batched(centred(H_SPACE.sp_tiangong, 0.95)),

  // Hubble: a silver tube with its aperture door open and two solar wings.
  hubble: craft(0.9, q => {
    const tube = foilCyl(q, 0, 0, 0, 2.1, 8.0, 18, SILVER); tube.rotation.z = Math.PI / 2; tube.position.y = 0;
    hcyl(q, '#b9bcc1', -4.6, 0, 0, 2.2, 1.6, 'x', 18);
    hcyl(q, '#1a1b1e', 4.02, 0, 0, 1.95, 0.05, 'x', 18);
    const door = grp(q, 4.0, 2.1, 0, 0, 0, 2.6);
    hcyl(door, '#d9dcdf', 0, -2.1, 0, 2.1, 0.1, 'x', 18);
    for (const sz of [-1, 1]) {
      const w = grp(q, -1.0, 0, sz * 2.2);
      bar(w, [0, 0, 0], [0, 0, sz * 1.0], 0.08, '#c4c4c4', 5);
      const pg = grp(w, 0, 0, sz * (1.0 + 3.55), 0, 0, 0);
      add(pg, g('pl:hubpv', () => paintFaces(new THREE.BoxGeometry(2.6, 0.05, 7.1, 6, 1, 16), '#3b4f8f', (fx, _fy, fz, _nx, ny) => (Math.abs(ny) < 0.5 ? '#a7a39a' : ((Math.floor((fx + 1.3) / 0.45) + Math.floor((fz + 3.55) / 0.45)) % 2 ? '#4a5aa0' : '#5b4e86')))),
        mat('#ffffff', { vc: true, metal: 0.45, rough: 0.35 }), 0, 0, 0, 1, 1, 1, 0, 0, 0);
    }
    for (const sy of [-1, 1]) { bar(q, [0.0, sy * 2.1, 0], [0.0, sy * 3.6, 0], 0.07, '#c4c4c4', 4); antennaDish(q, 0.0, sy * 3.65, 0, 0.6, 0.15, sy < 0 ? Math.PI : 0, 0, 0, '#ececea', false); }
  }),

  // James Webb Space Telescope: 18 gold hexagonal mirror segments above a five-layer, tennis-court-sized sunshield.
  jwst: craft(0.9, q => {
    const shield: P2[] = [[-10.5, 0], [-6, 6], [6, 6], [10.5, 0], [6, -6], [-6, -6]];
    for (let i = 0; i < 5; i++) {
      const sc = 1 - i * 0.03, m = slab(q, shield.map(([x, z]) => [x * sc, z * sc] as P2), 0.04, i % 2 ? '#d6c1d3' : '#cfd3da', 0, false);
      m.rotation.x = -Math.PI / 2; m.position.y = i * 0.32; metal(m, i === 4 ? '#b9a2bd' : '#a9acb6', 0.6, 0.35);
    }
    const mg = grp(q, 0, 1.8, 0, 0, -0.18);
    const hexG = g('pl:hexseg', () => new THREE.CylinderGeometry(1, 1, 1, 6));
    const gold = mat('#e2b34a', { metal: 0.95, rough: 0.18 });
    const hs = 0.95, dx = hs * Math.sqrt(3);
    for (let r = -2; r <= 2; r++) {
      const n = 5 - Math.abs(r);
      for (let c = 0; c < n; c++) {
        if (r === 0 && c === 2) continue;
        const x = (c - (n - 1) / 2) * dx;
        add(mg, hexG, gold, x, 3.0 + r * hs * 1.5, 0, hs * 0.98, 0.12, hs * 0.98, 0, Math.PI / 2);
      }
    }
    box(mg, '#2d2e33', 0, 0, -0.5, 3.5, 6.2, 0.5);
    for (const [ax, ay] of [[-2.2, 0.5], [2.2, 0.5], [0, 6.2]] as P2[]) bar(mg, [ax, ay, 0.1], [0, 3.6, 7.0], 0.06, '#3a3b40', 4);
    hcyl(mg, '#e2b34a', 0, 3.6, 7.0, 0.38, 0.15, 'z', 6);
    foil(q, 0, -1.6, 0, 3.0, 1.5, 3.0, BLACKF);
    pv(q, 0, -1.65, -2.4, 5.5, 1.8, '#20295a', 'x', 0, 0.3);
    antennaDish(q, 1.2, -1.9, 1.2, 0.3, 0.08, Math.PI, 0, 0, '#ddd', false);
  }),

  // Voyager: the 3.7 m dish over a ten-sided bus, golden record, RTG boom, science boom and magnetometer boom.
  voyager: craft(0.9, q => {
    antennaDish(q, 0, 0.55, 0, 1.85, 0.5, 0, 0, 0, '#f2f1ec', true);
    foilCyl(q, 0, -0.1, 0, 0.9, 0.5, 10, SILVER, Math.PI / 10);
    foilCyl(q, 0, -0.3, 0, 0.5, 0.25, 10, BLACKF);
    const rec = grp(q, 0.0, 0.15, 0.88, 0);
    plathe(rec, [[0, 0], [0.16, 0], [0.16, 0.02], [0, 0.02]], '#e6b84a', undefined, 18, 0, 0, 0, { metal: 0.9, rough: 0.2 }).rotation.x = Math.PI / 2;
    // RTG boom with three RTGs
    bar(q, [-0.8, -0.05, -0.2], [-3.4, -0.4, -0.8], 0.04, '#cfcfcf', 4);
    for (let i = 0; i < 3; i++) rtg(q, -1.8 - i * 0.6, -0.2 - i * 0.07, -0.42 - i * 0.14, 0.55, 0.2, 0, 0, Math.PI / 2 + 0.13);
    // science boom with the scan platform
    bar(q, [0.8, -0.05, -0.2], [2.6, -0.3, -0.7], 0.05, '#cfcfcf', 4);
    box(q, '#e2ddce', 2.6, -0.55, -0.7, 0.55, 0.45, 0.45, 0.4);
    hcyl(q, '#2a2b2f', 2.6, -0.3, -0.38, 0.12, 0.35, 'z', 10);
    box(q, '#c9b98b', 2.0, -0.3, -0.5, 0.25, 0.25, 0.25);
    boom(q, [0.4, -0.1, -0.85], [1.6, -0.5, -4.6], 0.14, '#e3dfd5');
    for (const sx of [-1, 1]) bar(q, [sx * 0.3, -0.25, 0.7], [sx * 2.0, -1.0, 2.2], 0.02, '#ddd', 3);
  }),

  // Pioneer 10/11: a big dish over a hexagonal box, two RTG booms, a magnetometer boom and the famous plaque.
  pioneer: craft(0.9, q => {
    antennaDish(q, 0, 0.25, 0, 1.37, 0.4, 0, 0, 0, '#f2f1ec', true);
    foilCyl(q, 0, -0.45, 0, 0.75, 0.4, 6, SILVER);
    box(q, '#c4b68d', 0.3, -0.45, 0.7, 0.4, 0.4, 0.3);
    for (const k of [-1, 1]) {
      const a = Math.PI / 2 + k * 0.55, dir: V3 = [Math.sin(a), 0, Math.cos(a)];
      bar(q, [dir[0] * 0.6, -0.3, dir[2] * 0.6], [dir[0] * 3.2, -0.3, dir[2] * 3.2], 0.03, '#cfcfcf', 4);
      for (const d of [2.3, 3.0]) rtg(q, dir[0] * d, -0.3, dir[2] * d, 0.6, 0.18, a, 0, Math.PI / 2);
    }
    bar(q, [-0.6, -0.3, 0], [-6.0, -0.3, 0], 0.025, '#cfcfcf', 3);
    box(q, '#d7d4ca', -6.1, -0.4, 0, 0.25, 0.2, 0.2);
    metal(box(q, '#e2b34a', 0.0, 0.15, 0.55, 0.23, 0.15, 0.01, 0, -0.5), '#e2b34a', 0.9, 0.2);
    plathe(q, [[0.1, 0], [0.16, -0.25]], '#4b4c50', undefined, 10, 0, -0.45, 0, { metal: 0.5 });
  }),
};

// ---- Venus, Titan and Ceres --------------------------------------------------------------------------------
const VENUS: [string, string, string] = ['#b07a3c', '#7a5024', '#c99a5c'];
const VENUS_SIDE: [string, string] = ['#7d5428', '#5e3d1d'];
/** Flat, platy rock slabs (Venus) lying almost level on the ground. */
function slabs(gp: THREE.Object3D, y: (x: number, z: number) => number, n: number, seed: number, keep?: (x: number, z: number) => boolean): void {
  for (let i = 0; i < n; i++) {
    const a = hash3(i, seed, 1) * TAU, d = Math.sqrt(hash3(i, seed, 2)) * 0.42, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (keep && !keep(x, z)) continue;
    const s = 0.03 + hash3(i, seed, 3) * 0.05, c = mx('#9a6a35', '#c4935a', hash3(i, seed, 4));
    add(gp, DODE(), mat(c, { flat: true }), x, y(x, z) + 0.002, z, s, 0.012, s * (0.6 + hash3(i, seed, 5) * 0.5), hash3(i, seed, 6) * TAU, (hash3(i, seed, 7) - 0.5) * 0.15, (hash3(i, seed, 8) - 0.5) * 0.15);
  }
}

/** Venera 13 (metres): pressure sphere on the toothed landing ring, drag disc and helical antenna on top. */
function venera(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0, 0, s);
  add(q, g('pl:vring', () => new THREE.TorusGeometry(1.0, 0.13, 8, 28)), mat('#a4a7a8', { metal: 0.5, rough: 0.45 }), 0, 0.14, 0, 1, 1, 1, 0, Math.PI / 2);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    add(q, g('pl:tooth', () => new THREE.ConeGeometry(1, 1, 3)), mat('#b9bcbd', { metal: 0.5, rough: 0.45 }), Math.sin(a) * 1.12, 0.3, Math.cos(a) * 1.12, 0.09, 0.22, 0.035, a);
  }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; bar(q, [Math.sin(a) * 0.95, 0.2, Math.cos(a) * 0.95], [Math.sin(a) * 0.45, 0.65, Math.cos(a) * 0.45], 0.04, '#8f9294', 4); }
  ell(q, '#d5d8da', 0, 1.15, 0, 0.8, 0.78, 0.8);
  metal(ell(q, '#9ea6ae', 0, 1.15, 0, 0.81, 0.15, 0.81), '#a3abb3', 0.6, 0.35);
  for (const sx of [-1, 1]) {
    const cg = grp(q, sx * 0.55, 0.8, 0.45, sx * 0.6, 0.5);
    hcyl(cg, '#2a2c30', 0, 0, 0, 0.12, 0.25, 'z', 10);
    hcyl(cg, '#8fc7e8', 0, 0, 0.13, 0.08, 0.02, 'z', 10);
  }
  plathe(q, [[0, 0], [1.05, 0], [1.08, 0.05], [0.5, 0.12], [0, 0.14]], '#c6c9cb', undefined, 24, 0, 1.85, 0, { metal: 0.45, rough: 0.45 });
  hcyl(q, '#dadcd8', 0, 2.25, 0, 0.18, 0.45, 'y', 12);
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 4) * TAU * 0.5, a1 = ((i + 1) / 4) * TAU * 0.5;
    bar(q, [Math.sin(a0) * 0.24, 2.05 + i * 0.03, Math.cos(a0) * 0.24], [Math.sin(a1) * 0.24, 2.08 + i * 0.03, Math.cos(a1) * 0.24], 0.02, '#e0c47a', 3);
  }
  cone(q, '#c8cbcd', 0, 2.52, 0, 0.16, 0.2, 10);
  // PrOP-V penetrometer arm and the ejected camera lens cap lying on the ground
  bar(q, [0.9, 0.3, -0.4], [1.6, 0.05, -0.8], 0.03, '#c7c9ca', 4);
  box(q, '#8c8f91', 1.6, 0.0, -0.8, 0.12, 0.1, 0.12);
  plathe(q, [[0, 0], [0.22, 0], [0.2, 0.08], [0, 0.1]], '#e3e5e6', undefined, 12, 1.5, 0.0, 1.1);
}

/** Huygens descent module (metres) as it sits on Titan, with its parachute lying beside it. */
function huygens(p: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const q = grp(p, x, y, z, ry, 0.08, 0.05, s);
  plathe(q, [[0, 0], [0.65, 0], [0.66, 0.22], [0.58, 0.32], [0, 0.34]], '#c8cacb', (_x, yy) => (yy < 0.18 ? '#b18a3c' : null), 22, 0, 0, 0, { metal: 0.6, rough: 0.35 });
  foil(q, 0.2, 0.32, 0.05, 0.3, 0.14, 0.24, GOLD);
  box(q, '#e2e2de', -0.2, 0.32, 0.1, 0.25, 0.1, 0.2);
  cyl(q, '#2b2c30', -0.15, 0.32, -0.28, 0.08, 0.16, 10);
  for (const sx of [-1, 1]) { bar(q, [sx * 0.6, 0.18, 0], [sx * 1.05, 0.25, 0.15], 0.015, '#d6d6d2', 3); box(q, '#c0c2c4', sx * 1.05, 0.2, 0.15, 0.08, 0.06, 0.06); }
}

export const H_PLANETS_WORLDS: Record<string, Builder> = {
  // Venera 13 on the scorching orange plains of Venus — it survived 127 minutes.
  venera13: batched(gp => {
    const y = terrain(gp, { pal: VENUS, side: VENUS_SIDE, amp: 0.005 });
    const vx = -0.04, vz = -0.04;
    venera(gp, vx, y(vx, vz), vz, 0.13, 0.4);
    slabs(gp, y, 70, 201, (x, z) => Math.hypot(x - vx, z - vz) > 0.17);
  }),

  // Maat Mons, Venus' tallest volcano — and maybe still active today.
  maat: batched(gp => {
    const shield = (x: number, z: number) => {
      const r = Math.hypot(x, z) * (1 + 0.1 * (fbm(Math.atan2(x, z) * 2 + 9, 2, 1, 3) - 0.5));
      return 0.26 * Math.exp(-((r / 0.2) ** 1.6));
    };
    const y = terrain(gp, { pal: VENUS, side: VENUS_SIDE, amp: 0.004, extra: shield, rings: 34, segs: 88, craters: [{ x: 0.0, z: 0.0, r: 0.035, d: 0.02 }],
      paint: (x, yy, z) => {
        const r = Math.hypot(x, z), ang = Math.atan2(x, z);
        if (r < 0.035) return '#5a3a1e';
        if (r < 0.4) { const f = fbm(ang * 7, r * 9, 4, 3); return f > 0.55 ? mx('#5d3f22', '#73502c', fbm(x * 40, 1, z * 40, 2)) : f < 0.38 ? mx('#d0a066', '#b98a52', yy * 3) : null; }
        return null;
      } });
    glow(add(gp, g('pl:vent', () => new THREE.CylinderGeometry(1, 1, 1, 10)), mat('#ff8a2a'), 0, y(0, 0) + 0.002, 0, 0.012, 0.004, 0.012), '#ff7a1a');
    slabs(gp, y, 30, 211, (x, z) => Math.hypot(x, z) > 0.33);
  }),

  // Huygens on Titan: orange ground strewn with rounded ice pebbles, 1.2 billion km from home.
  huygens: batched(gp => {
    const y = terrain(gp, { pal: ['#b06c32', '#7f4a22', '#c9894a'], side: ['#7d4c25', '#5d371a'], amp: 0.004 });
    const hx = 0.0, hz = -0.02;
    huygens(gp, hx, y(hx, hz) - 0.012, hz, 0.18, 0.5);
    const cx = 0.17, cz = 0.2;
    add(gp, SPH(14), mat('#e98a2c'), cx, y(cx, cz) + 0.008, cz, 0.12, 0.018, 0.09, 0.6);
    add(gp, SPH(10), mat('#f1ede4'), cx + 0.05, y(cx + 0.05, cz + 0.03) + 0.012, cz + 0.03, 0.06, 0.015, 0.05, 0.6);
    for (let i = 0; i < 6; i++) bar(gp, [hx + 0.05, y(hx, hz) + 0.04, hz + 0.05], [cx - 0.08 + i * 0.015, y(cx, cz) + 0.004, cz - 0.05 + i * 0.01], 0.0012, '#dedbd2', 3);
    for (let i = 0; i < 70; i++) {
      const a = hash3(i, 221, 1) * TAU, d = Math.sqrt(hash3(i, 221, 2)) * 0.42, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - hx, z - hz) < 0.14) continue;
      const s = 0.008 + hash3(i, 221, 3) ** 2 * 0.03;
      add(gp, SPH(9), mat(mx('#d8b088', '#b88552', hash3(i, 221, 4))), x, y(x, z) + s * 0.25, z, s, s * 0.6, s * 0.85, hash3(i, 221, 5) * TAU);
    }
  }),

  // Dragonfly: a car-sized eight-rotor drone that will hop between Titan's dunes (launch 2028, arrival 2034).
  dragonfly: batched(gp => {
    const dune = (x: number, z: number) => 0.035 * Math.max(0, Math.sin(z * 13 + x * 3 + fbm(x * 3, 1, z * 3, 2) * 2)) ** 2;
    const y = terrain(gp, { pal: ['#a9783f', '#4f3826', '#c28d55'], side: ['#6d4c2c', '#4d331d'], amp: 0.003, extra: (x, z) => (Math.abs(z - 0.02) < 0.2 && Math.abs(x) < 0.3 ? dune(x, z) * sstep(0.2, 0.12, Math.abs(z - 0.02)) : dune(x, z)),
      paint: (x, yy, z) => (yy - Y0 > 0.012 ? mx('#4e3a2a', '#3b2b1f', fbm(x * 30, 1, z * 30, 2)) : null) });
    const dx = 0.0, dz = 0.02;
    const q = grp(gp, dx, y(dx, dz), dz, 0.5, 0, 0, 0.1);
    for (const sx of [-1, 1]) {
      bar(q, [sx * 0.75, 0.05, -1.4], [sx * 0.75, 0.05, 1.4], 0.06, '#c9c6bd', 5);
      for (const sz of [-0.9, 0.9]) bar(q, [sx * 0.75, 0.05, sz], [sx * 0.55, 0.5, sz * 0.8], 0.05, '#b8b5ac', 4);
    }
    foil(q, 0, 0.5, 0, 1.4, 0.85, 2.6, '#e9e2cf');
    box(q, '#d8d1bd', 0, 1.35, 0, 1.2, 0.08, 2.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const hx = sx * 1.65, hz = sz * 1.55;
      bar(q, [sx * 0.6, 1.0, sz * 1.0], [hx, 1.05, hz], 0.07, '#a7a49b', 5);
      bar(q, [hx, 0.85, hz], [hx, 1.35, hz], 0.06, '#7d7a73', 5);
      for (const [hy, a0] of [[0.88, 0.3 + sx], [1.32, 1.1 + sz]] as P2[]) {
        cyl(q, '#4a4b4f', hx, hy - 0.04, hz, 0.1, 0.08, 8);
        for (const b of [0, Math.PI]) box(q, '#2f3033', hx + Math.sin(a0 + b) * 0.33, hy, hz + Math.cos(a0 + b) * 0.33, 0.1, 0.03, 0.66, a0 + b);
      }
    }
    rtg(q, 0, 1.0, -1.55, 1.0, 0.24, 0, -0.9);
    antennaDish(q, 0, 1.45, 0.4, 0.5, 0.1, 0, 0, 0, '#efeee8', false);
    for (const sx of [-1, 1]) hcyl(q, '#141518', sx * 0.3, 0.75, 1.32, 0.07, 0.05, 'z', 8);
    rocks(gp, y, 16, 231, '#8a6a48', 0.014, (x, z) => Math.hypot(x - dx, z - dz) > 0.28, 0.42, true);
  }),

  // Ahuna Mons: a lonely ice volcano on the dwarf planet Ceres, streaked with bright salts.
  ahuna: batched(gp => {
    const dome = (x: number, z: number) => {
      const r = Math.hypot(x * 0.85, z) * (1 + 0.06 * (fbm(Math.atan2(x, z) * 2 + 1, 3, 1, 3) - 0.5));
      return 0.17 * (1 - sstep(0.15, 0.25, r)) + 0.012 * (1 - sstep(0.0, 0.15, r));
    };
    const y = terrain(gp, { pal: ['#6d6a64', '#4d4a45', '#8d8982'], side: ['#55524d', '#403e3a'], amp: 0.005, extra: dome, rings: 32, segs: 84,
      craters: [{ x: 0.32, z: 0.2, r: 0.07, d: 0.018 }, { x: -0.3, z: -0.25, r: 0.06, d: 0.014 }, { x: 0.28, z: -0.3, r: 0.04, d: 0.01 }],
      paint: (x, yy, z, ny) => {
        const r = Math.hypot(x * 0.85, z), ang = Math.atan2(x, z);
        if (r > 0.13 && r < 0.27 && ny < 0.85) return fbm(ang * 7, r * 6, 2, 3) > 0.62 ? mx('#f0eee8', '#d9d6cf', fbm(x * 60, yy * 60, z * 60, 2)) : mx('#7a7064', '#625a50', fbm(x * 40, 1, z * 40, 2));
        if (r <= 0.15) return worley(x * 30, 1, z * 30)[1] - worley(x * 30, 1, z * 30)[0] < 0.08 ? '#4b453e' : mx('#8f8577', '#7b7266', fbm(x * 30, 2, z * 30, 2));
        return null;
      } });
    rocks(gp, y, 14, 241, '#5f5c57', 0.014, (x, z) => Math.hypot(x * 0.85, z) > 0.3);
  }),
};
