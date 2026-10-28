import { humanSoup } from '../human.ts';
import * as THREE from 'three';
import { type V3, add, mat, shade as shade0 } from '../prims.ts';

// Mesh-soup kit shared by the landmark packs (europe, europe2, europe3, classics, icons2): memoised shading, local frames
// and a flat-shaded per-face vertex-coloured mesh builder with architectural helpers.

const TAU = Math.PI * 2;
const shadeMemo = new Map<string, string>();
export const shade = (hex: string, f: number): string => {
  const k = hex + f;
  let v = shadeMemo.get(k);
  if (v === undefined) { v = shade0(hex, f); shadeMemo.set(k, v); }
  return v;
};
const rgbMemo = new Map<string, [number, number, number]>();

export type Xf = (v: V3) => V3;
/** Local frame transform: translate to (cx,cy,cz) after turning by ry about y (same convention as Object3D). */
export const xform = (cx: number, cy: number, cz: number, ry = 0): Xf => {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (v) => [cx + v[0] * c + v[2] * s, cy + v[1], cz - v[0] * s + v[2] * c];
};
export const ID: Xf = (v) => v;
export const dirOf = (T: Xf, v: V3): V3 => { const o = T([0, 0, 0]), q = T(v); return [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; };
/** Local frame: a child group at (x,y,z) turned by ry (local +z faces the direction (sin ry, cos ry)). */
export function frame(p: THREE.Object3D, x: number, y: number, z: number, ry = 0): THREE.Group {
  const f = new THREE.Group();
  f.position.set(x, y, z);
  f.rotation.y = ry;
  p.add(f);
  return f;
}

/** Flat-shaded, per-face vertex-coloured mesh builder (one draw per call). */
export class Mesh3 {
  pos: number[] = [];
  col: number[] = [];
  tri(a: V3, b: V3, c: V3, color: string, out?: V3): void {
    if (out) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { const t = b; b = c; c = t; }
    }
    this.pos.push(...a, ...b, ...c);
    let q = rgbMemo.get(color);
    if (!q) { const t = new THREE.Color(color); q = [t.r, t.g, t.b]; rgbMemo.set(color, q); }
    this.col.push(q[0], q[1], q[2], q[0], q[1], q[2], q[0], q[1], q[2]);
  }
  quad(a: V3, b: V3, c: V3, d: V3, color: string, out?: V3): void { this.tri(a, b, c, color, out); this.tri(a, c, d, color, out); }
  tq(T: Xf, a: V3, b: V3, c: V3, d: V3, color: string, out: V3): void { this.quad(T(a), T(b), T(c), T(d), color, dirOf(T, out)); }
  /** Box (base at y) in the local frame T; bottom face omitted unless `bottom`, back (−z) face omitted if `back` is false. */
  box(T: Xf, x: number, y: number, z: number, w: number, h: number, d: number, c: string, bottom = false, back = true): void {
    const x0 = x - w / 2, x1 = x + w / 2, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    this.tq(T, [x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1], c, [0, 0, 1]);
    if (back) this.tq(T, [x0, y, z0], [x1, y, z0], [x1, y1, z0], [x0, y1, z0], shade(c, 0.9), [0, 0, -1]);
    this.tq(T, [x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0], shade(c, 0.95), [-1, 0, 0]);
    this.tq(T, [x1, y, z0], [x1, y, z1], [x1, y1, z1], [x1, y1, z0], shade(c, 0.95), [1, 0, 0]);
    this.tq(T, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], shade(c, 1.05), [0, 1, 0]);
    if (bottom) this.tq(T, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], shade(c, 0.8), [0, -1, 0]);
  }
  /** n-sided prism / frustum (radius r → r1) standing at y, with a top cap. */
  prism(T: Xf, x: number, y: number, z: number, r: number, h: number, n: number, c: string, r1 = r, a0 = 0, cap = true): void {
    const P = (i: number, rr: number, yy: number): V3 => { const a = a0 + (i / n) * TAU; return [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr]; };
    for (let i = 0; i < n; i++) {
      const am = a0 + ((i + 0.5) / n) * TAU;
      const sl = (r - r1) / Math.max(1e-6, h);
      this.tq(T, P(i, r, y), P(i + 1, r, y), P(i + 1, r1, y + h), P(i, r1, y + h), shade(c, 0.92 + 0.12 * Math.cos(am - 2.2)), [Math.cos(am), sl, Math.sin(am)]);
      if (cap && r1 > 0) this.tri(T(P(i, r1, y + h)), T(P(i + 1, r1, y + h)), T([x, y + h, z]), shade(c, 1.05), dirOf(T, [0, 1, 0]));
    }
  }
  /** Convex polygon (local XY) extruded along z from z0 to z1, side faces included. */
  poly(T: Xf, pts: [number, number][], z0: number, z1: number, c: string, sides = true): void {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    for (let i = 1; i < n - 1; i++) {
      this.tri(T([pts[0][0], pts[0][1], z1]), T([pts[i][0], pts[i][1], z1]), T([pts[i + 1][0], pts[i + 1][1], z1]), c, dirOf(T, [0, 0, 1]));
      this.tri(T([pts[0][0], pts[0][1], z0]), T([pts[i][0], pts[i][1], z0]), T([pts[i + 1][0], pts[i + 1][1], z0]), shade(c, 0.9), dirOf(T, [0, 0, -1]));
    }
    if (!sides) return;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
      const mx = (ax + bx) / 2 - cx, my = (ay + by) / 2 - cy;
      const up = my / (Math.hypot(mx, my) || 1);
      this.tq(T, [ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], shade(c, 0.92 + 0.12 * up), [mx, my, 0]);
    }
  }
  /** Horizontal convex plan polygon [x,z] extruded from y0 to y1 (top face + sides). */
  plan(T: Xf, pts: [number, number][], y0: number, y1: number, c: string, top = true): void {
    const n = pts.length;
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x / n; cz += z / n; }
    if (top) for (let i = 1; i < n - 1; i++) this.tri(T([pts[0][0], y1, pts[0][1]]), T([pts[i][0], y1, pts[i][1]]), T([pts[i + 1][0], y1, pts[i + 1][1]]), shade(c, 1.05), dirOf(T, [0, 1, 0]));
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      this.tq(T, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], c, [(ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz]);
    }
  }
  /** Straight member in the local XY plane from (x0,y0) to (x1,y1), width w, depth d (centred on z). */
  strut(T: Xf, x0: number, y0: number, x1: number, y1: number, w: number, d: number, c: string, z = 0): void {
    const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (-(y1 - y0) / l) * (w / 2), ny = ((x1 - x0) / l) * (w / 2);
    const Tz = (v: V3): V3 => T([v[0], v[1], v[2] + z]);
    this.poly(Tz, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], -d / 2, d / 2, c);
  }
  /** Greek Doric column: fluted (alternating-radius facets) shaft with entasis, echinus and abacus. */
  doric(T: Xf, x: number, y: number, z: number, r: number, h: number, c: string, n = 16): void {
    const hs = h - r * 1.0, rows = [0, 0.45, 1];
    const R = (t: number, j: number) => r * (1 - 0.2 * Math.pow(t, 1.4)) * (j % 2 ? 0.93 : 1);
    const P = (t: number, j: number): V3 => { const a = (j / n) * TAU; return [x + Math.cos(a) * R(t, j), y + t * hs, z + Math.sin(a) * R(t, j)]; };
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < n; j++) {
      const am = ((j + 0.5) / n) * TAU;
      this.tq(T, P(rows[i], j), P(rows[i], j + 1), P(rows[i + 1], j + 1), P(rows[i + 1], j), shade(c, j % 2 ? 0.94 : 1.02), [Math.cos(am), 0, Math.sin(am)]);
    }
    this.prism(T, x, y + hs, z, r * 0.8, r * 0.45, 12, shade(c, 1.03), r * 1.22, 0, false);
    this.box(T, x, y + hs + r * 0.45, z, r * 2.5, r * 0.55, r * 2.5, shade(c, 1.06));
  }
  /** Low-poly ellipsoid knob (sculpture masses, foliage, figures). */
  blob(T: Xf, x: number, y: number, z: number, rx: number, ry: number, rz: number, c: string, n = 6): void {
    const lat = [-Math.PI / 2, -0.62, 0.15, 0.85, Math.PI / 2];
    const P = (i: number, j: number): V3 => {
      const a = (i / n) * TAU + j * 0.4, cb = Math.cos(lat[j]);
      return [x + Math.cos(a) * cb * rx, y + Math.sin(lat[j]) * ry, z + Math.sin(a) * cb * rz];
    };
    for (let j = 0; j < lat.length - 1; j++) for (let i = 0; i < n; i++) {
      const am = ((i + 0.5) / n) * TAU, lm = (lat[j] + lat[j + 1]) / 2;
      const o: V3 = [Math.cos(am) * Math.cos(lm), Math.sin(lm), Math.sin(am) * Math.cos(lm)];
      const cc = shade(c, 0.9 + 0.16 * Math.max(0, o[1]));
      if (j === 0) this.tri(T(P(i, 0)), T(P(i, 1)), T(P(i + 1, 1)), cc, dirOf(T, o));
      else if (j === lat.length - 2) this.tri(T(P(i, j)), T(P(i + 1, j)), T(P(i, j + 1)), cc, dirOf(T, o));
      else this.tq(T, P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), cc, o);
    }
  }
  /** Surface of revolution of a [r, y] profile (n segments); colour per (segment, profile step). */
  rev(T: Xf, x: number, y: number, z: number, prof: [number, number][], n: number, col: string | ((i: number, j: number) => string), a0 = 0, inward = false): void {
    for (let j = 0; j < prof.length - 1; j++) {
      const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
      if (r0 === 0 && r1 === 0) continue;
      const nr = y1 - y0, ny = -(r1 - r0), sg = inward ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU, b = a0 + ((i + 1) / n) * TAU, am = (a + b) / 2;
        const c = typeof col === 'string' ? col : col(i, j);
        const A: V3 = [x + Math.cos(a) * r0, y + y0, z + Math.sin(a) * r0], B: V3 = [x + Math.cos(b) * r0, y + y0, z + Math.sin(b) * r0];
        const C: V3 = [x + Math.cos(b) * r1, y + y1, z + Math.sin(b) * r1], D: V3 = [x + Math.cos(a) * r1, y + y1, z + Math.sin(a) * r1];
        const o: V3 = [Math.cos(am) * nr * sg, ny * sg, Math.sin(am) * nr * sg];
        if (r0 === 0) this.tri(T(A), T(C), T(D), c, dirOf(T, o));
        else if (r1 === 0) this.tri(T(A), T(B), T(C), c, dirOf(T, o));
        else this.tq(T, A, B, C, D, c, o);
      }
    }
  }
  /**
   * Wall panel w×h×d (centred on x, base y, thickness along z) pierced by one opening (width ow, sill oy above
   * base, total height oh): round, pointed or rectangular head. Intrados is darkened so openings read as voids.
   */
  arch(T: Xf, x: number, y: number, w: number, h: number, d: number, ow: number, oy: number, oh: number, c: string,
    k: 'arch' | 'pointed' | 'rect' = 'arch', n = 6, top = false, back = true, ic0?: string): void {
    const r = ow / 2, xl = x - r, xr = x + r, yt = y + h, z1 = d / 2, z0 = -d / 2;
    const Q: [number, number][] = [];
    if (k === 'rect') { Q.push([xl, y + oy + oh], [xr, y + oy + oh]); } else {
      const R = k === 'pointed' ? ow * 0.85 : r, fa = Math.acos((r - R) / R), ap = R * Math.sin(fa), ys = y + oy + oh - ap, hn = Math.max(2, Math.round(n / 2));
      for (let i = 0; i <= hn; i++) { const f = Math.PI - ((Math.PI - fa) * i) / hn; Q.push([xl + R + R * Math.cos(f), ys + R * Math.sin(f)]); }
      for (let i = hn - 1; i >= 0; i--) { const f = Math.PI - ((Math.PI - fa) * i) / hn; Q.push([xr - R - R * Math.cos(f), ys + R * Math.sin(f)]); }
    }
    const ys = Q[0][1], ysill = y + oy, mid = Math.floor(Q.length / 2);
    const faces: [number, string, number][] = [[z1, c, 1]];
    if (back) faces.push([z0, shade(c, 0.9), -1]);
    for (const [zz, cc, sg] of faces) {
      const o: V3 = [0, 0, sg];
      this.tq(T, [x - w / 2, y, zz], [xl, y, zz], [xl, yt, zz], [x - w / 2, yt, zz], cc, o);
      this.tq(T, [xr, y, zz], [x + w / 2, y, zz], [x + w / 2, yt, zz], [xr, yt, zz], cc, o);
      if (oy > 0) this.tq(T, [xl, y, zz], [xr, y, zz], [xr, ysill, zz], [xl, ysill, zz], cc, o);
      for (let i = 0; i < Q.length - 1; i++) {
        const cn: [number, number] = i < mid ? [xl, yt] : [xr, yt];
        this.tri(T([Q[i][0], Q[i][1], zz]), T([Q[i + 1][0], Q[i + 1][1], zz]), T([cn[0], cn[1], zz]), cc, dirOf(T, o));
      }
      this.tri(T([xl, yt, zz]), T([Q[mid][0], Q[mid][1], zz]), T([xr, yt, zz]), cc, dirOf(T, o));
    }
    const ic = ic0 ?? shade(c, 0.62);
    for (let i = 0; i < Q.length - 1; i++) {
      const [ax, ay] = Q[i], [bx, by] = Q[i + 1];
      this.tq(T, [ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], ic, [by - ay, -(bx - ax), 0]);
    }
    if (ys > ysill) {
      this.tq(T, [xl, ysill, z0], [xl, ys, z0], [xl, ys, z1], [xl, ysill, z1], shade(ic, 1.1), [1, 0, 0]);
      this.tq(T, [xr, ysill, z0], [xr, ys, z0], [xr, ys, z1], [xr, ysill, z1], ic, [-1, 0, 0]);
    }
    if (oy > 0) this.tq(T, [xl, ysill, z0], [xr, ysill, z0], [xr, ysill, z1], [xl, ysill, z1], shade(c, 0.95), [0, 1, 0]);
    if (top) this.tq(T, [x - w / 2, yt, z0], [x + w / 2, yt, z0], [x + w / 2, yt, z1], [x - w / 2, yt, z1], shade(c, 1.05), [0, 1, 0]);
  }
  /** Flat window/opening glyph on a facade plane (local z=zf): round/pointed/rect head, dark fill with light frame. */
  win(T: Xf, x: number, y: number, w: number, h: number, zf: number, glass: string, frame?: string, k: 'arch' | 'pointed' | 'rect' = 'arch'): void {
    const pts = (ww: number, hh: number, yy: number): [number, number][] => {
      const r = ww / 2, out: [number, number][] = [[x - r, yy], [x + r, yy]];
      if (k === 'rect') { out.push([x + r, yy + hh], [x - r, yy + hh]); return out; }
      const top = yy + hh, ys = top - (k === 'pointed' ? r * 1.4 : r);
      if (k === 'pointed') out.push([x + r, ys], [x + r * 0.75, ys + (top - ys) * 0.55], [x + r * 0.4, ys + (top - ys) * 0.88], [x, top], [x - r * 0.4, ys + (top - ys) * 0.88], [x - r * 0.75, ys + (top - ys) * 0.55]);
      else { out.push([x + r, ys]); for (let i = 1; i < 4; i++) { const f = (i / 4) * Math.PI; out.push([x + r * Math.cos(f), ys + r * Math.sin(f)]); } }
      out.push([x - r, ys]);
      return out;
    };
    if (frame) this.poly(T, pts(w * 1.35, h + w * 0.25, y - w * 0.12), zf, zf + 0.0008, frame, false);
    this.poly(T, pts(w, h, y), zf, zf + (frame ? 0.0014 : 0.0008), glass, false);
  }
  /** Square-section member between two world points (ribs, flyers, masts). */
  beam(A: V3, B: V3, w: number, c: string, h = w): void {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / L, ny = dy / L, nz = dz / L;
    let ux = nz, uz = -nx, ul = Math.hypot(ux, uz);
    if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
    ux *= w / 2 / ul; uz *= w / 2 / ul;
    let vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx *= h / 2 / vl; vy *= h / 2 / vl; vz *= h / 2 / vl;
    const P = (p: V3, s: number, t: number): V3 => [p[0] + ux * s + vx * t, p[1] + vy * t, p[2] + uz * s + vz * t];
    const S: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = S[i], [s1, t1] = S[(i + 1) % 4];
      const o: V3 = [ux * (s0 + s1) + vx * (t0 + t1), vy * (t0 + t1), uz * (s0 + s1) + vz * (t0 + t1)];
      const ol = Math.hypot(o[0], o[1], o[2]) || 1;
      this.quad(P(A, s0, t0), P(A, s1, t1), P(B, s1, t1), P(B, s0, t0), shade(c, 0.95 + 0.1 * (o[1] / ol)), o);
    }
  }
  build(p: THREE.Object3D, metal?: number, rough?: number): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return add(p, geo, mat('#ffffff', { vc: true, flat: true, metal, rough }), 0, 0, 0, 1, 1, 1);
  }
}
/** Calls f with an outward frame for each of the four faces of a rectangle (half-extents hx,hz): `along` = half face width. */
export function rect4(cx: number, cz: number, hx: number, hz: number, f: (T: Xf, i: number, along: number) => void): void {
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, d = i % 2 ? hx : hz;
    f(xform(cx + Math.sin(a) * d, 0, cz + Math.cos(a) * d, a), i, i % 2 ? hz : hx);
  }
}
const PEOPLE = ['#1e3a8a', '#b91c1c', '#f8fafc', '#0f766e', '#a16207', '#4c1d95', '#334155'];
export function person(m: Mesh3, x: number, y: number, z: number, i: number, s = 0.011): void {
  humanSoup(m.pos, m.col, x, y, z, s * 1.45, i, { top: PEOPLE[i % PEOPLE.length] });
}
export function car(m: Mesh3, T: Xf, x: number, y: number, z: number, c: string, s = 1): void {
  m.box(T, x, y + 0.0012 * s, z, 0.0085 * s, 0.0048 * s, 0.018 * s, c);
  m.box(T, x, y + 0.006 * s, z - 0.001 * s, 0.0075 * s, 0.0036 * s, 0.009 * s, '#2a3440');
  m.box(T, x, y + 0.0096 * s, z - 0.001 * s, 0.0072 * s, 0.0006 * s, 0.0085 * s, c);
}
export function leafTree(m: Mesh3, x: number, y: number, z: number, s: number, c = '#4f7f3f'): void {
  m.prism(ID, x, y, z, s * 0.09, s * 0.55, 5, '#5b4636');
  m.blob(ID, x, y + s * 0.82, z, s * 0.42, s * 0.4, s * 0.42, c, 7);
  m.blob(ID, x + s * 0.12, y + s * 1.02, z + s * 0.08, s * 0.26, s * 0.22, s * 0.26, shade(c, 1.12), 6);
}
/** Gabled house in frame T: walls w×h×d, ridge along local x, a row of `wins` windows on the +z face. */
export function house(m: Mesh3, T: Xf, x: number, y: number, z: number, w: number, h: number, d: number, wall: string, roof: string, pitch = 0.6, wins = 0, glass = '#3a3f46'): void {
  m.box(T, x, y, z, w, h, d, wall);
  const yt = y + h, rh = (d / 2) * pitch, e = 0.0015, hw = w / 2 + e, hd = d / 2 + e;
  m.poly((v) => T([x + v[2], v[1], z - v[0]]), [[-d / 2, yt], [d / 2, yt], [0, yt + rh]], -w / 2, w / 2, wall, false);
  m.tq(T, [x - hw, yt - e * pitch, z + hd], [x + hw, yt - e * pitch, z + hd], [x + hw, yt + rh, z], [x - hw, yt + rh, z], roof, [0, 1, 1]);
  m.tq(T, [x - hw, yt - e * pitch, z - hd], [x + hw, yt - e * pitch, z - hd], [x + hw, yt + rh, z], [x - hw, yt + rh, z], shade(roof, 0.85), [0, 1, -1]);
  for (let i = 0; i < wins; i++) {
    const wx = x - w / 2 + ((i + 0.5) * w) / wins;
    m.box(T, wx, y + h * 0.5, z + d / 2, Math.min(0.005, w / wins * 0.45), h * 0.28, 0.0012, glass);
  }
}
/** Gothic pinnacle: square shaft and spirelet. */
export function pinnacle(m: Mesh3, T: Xf, x: number, y: number, z: number, r: number, h: number, c: string, c2 = c): void {
  m.prism(T, x, y, z, r, h * 0.4, 4, c, r, Math.PI / 4, false);
  m.prism(T, x, y + h * 0.4, z, r * 1.1, h * 0.6, 4, c2, 0, Math.PI / 4);
}
