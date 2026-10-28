import * as THREE from 'three';
import { type Builder, type V3, type MatOpts, type Paint, g, add, mat, box, cyl, cone, rod, tbox, gable, skin, prism, panel, archPath, shadeQ as shade, mixQ as mix, qn, hash3 } from '../prims.ts';
import { type HFn, island, sstep, strataSide, EARTH, onGround, pine } from '../nature.ts';
import { grp, hip, plathe, person, crowd } from '../kit/town.ts';
import { Mesher as BaseMesher } from '../kit/mesher.ts';

// Hero builders for the wave-4 landmark pack (keys lm4_*). Each is a compact diorama on its real setting:
// front is +z, base at y=0, footprint radius ≈ 0.5. Mobile budget: ≤ 15k triangles, ≤ 80 ms per model, so
// small repeated details (windows, logs, merlons, steps) go into one vertex-coloured triangle soup (Mesher).

// ---- local helpers ----------------------------------------------------------------------------------------
const hv = (a: number, b: number, c: number) => hash3(Math.floor(a), Math.floor(b), Math.floor(c));
/** Water ripple paint with memoised colours. */
const rip = (c: string, x: number, z: number) =>
  Math.sin(x * 90 + Math.sin(z * 40) * 2) > 0.93 ? mix(c, '#d6f0ff', 0.25) : hv(x * 60, 0, z * 60) > 0.9 ? shade(c, 1.06) : c;
const S9 = () => g('lm4:s9', () => new THREE.SphereGeometry(0.5, 9, 6));
const S6 = () => g('lm4:s6', () => new THREE.SphereGeometry(0.5, 6, 4));
/** Smooth low-poly ellipsoid with semi-axes (sx, sy, sz). */
const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  add(p, S9(), mat(c, { flat: false }), x, y, z, sx * 2, sy * 2, sz * 2, ry, rx, rz);
/** Very cheap faceted ellipsoid (heads, stones, bushes far from the camera). */
const pebble = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0) =>
  add(p, S6(), mat(c), x, y, z, sx * 2, sy * 2, sz * 2, ry);
/** Terrain disc with a low triangle count (rings × segs) and banded earth skirt. */
function ground(gp: THREE.Object3D, hf: HFn, base: string, paint: Paint, rings = 16, segs = 56, side = strataSide(EARTH)): void {
  island(gp, 0.5, hf, base, paint, { rings, segs, side });
}
const Y0 = 0.035;

/** Shared triangle soup plus box/log/frustum primitives. */
class Mesher extends BaseMesher {
  /** Like `build`, but skips empty soups. */
  buildIfAny(p: THREE.Object3D, o: MatOpts = {}): THREE.Mesh | null { return this.pos.length ? this.build(p, o) : null; }
  /** Box without a bottom face (10 triangles), rotated by ry about its vertical axis; y = base. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, ry = 0, top?: string): void {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const hw = w / 2, hd = d / 2;
    const a = P(-hw, 0, hd), b = P(hw, 0, hd), e = P(hw, 0, -hd), f = P(-hw, 0, -hd);
    const a2 = P(-hw, h, hd), b2 = P(hw, h, hd), e2 = P(hw, h, -hd), f2 = P(-hw, h, -hd);
    const nz: V3 = [s, 0, c], nx: V3 = [c, 0, -s];
    this.quad(a, b, b2, a2, color, nz);
    this.quad(e, f, f2, e2, shade(color, 0.97), [-nz[0], 0, -nz[2]]);
    this.quad(b, e, e2, b2, shade(color, 0.94), nx);
    this.quad(f, a, a2, f2, shade(color, 0.94), [-nx[0], 0, -nx[2]]);
    this.quad(a2, b2, e2, f2, top ?? shade(color, 1.04), [0, 1, 0]);
  }
  /** Horizontal square-section log from a to b (8 triangles + 2 end caps; the bottom face is skipped). */
  log(a: V3, b: V3, r: number, color: string): void {
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L;
    const A = (p: V3, sx: number, sy: number): V3 => [p[0] + px * r * sx, p[1] + r * sy, p[2] + pz * r * sx];
    const s0 = [A(a, -1, -1), A(a, 1, -1), A(a, 1, 1), A(a, -1, 1)], s1 = [A(b, -1, -1), A(b, 1, -1), A(b, 1, 1), A(b, -1, 1)];
    const nrm: V3[] = [[0, -1, 0], [px, 0, pz], [0, 1, 0], [-px, 0, -pz]];
    for (let i = 1; i < 4; i++) { const j = (i + 1) % 4; this.quad(s0[i], s0[j], s1[j], s1[i], i === 2 ? shade(color, 1.08) : color, nrm[i === 1 ? 1 : i === 2 ? 2 : 3]); }
    this.quad(s0[0], s0[1], s0[2], s0[3], shade(color, 0.88), [-dx, 0, -dz]);
    this.quad(s1[0], s1[1], s1[2], s1[3], shade(color, 0.88), [dx, 0, dz]);
  }
  /** n-sided frustum (r1 = 0 → cone) standing at y; `top` colours the cap (null = no cap). */
  cyl(x: number, y: number, z: number, r0: number, r1: number, h: number, n: number, color: string, top?: string | null, a0 = 0, paint?: (i: number) => string): void {
    const ap: V3 = [x, y + h, z];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2, b = a0 + ((i + 1) / n) * Math.PI * 2, m = (a + b) / 2;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const c = paint ? paint(i) : color, nn: V3 = [Math.cos(m), (r0 - r1) / Math.max(h, 1e-4) * 0.5, Math.sin(m)];
      const p0: V3 = [x + ca * r0, y, z + sa * r0], p1: V3 = [x + cb * r0, y, z + sb * r0];
      if (r1 > 0) {
        const q0: V3 = [x + ca * r1, y + h, z + sa * r1], q1: V3 = [x + cb * r1, y + h, z + sb * r1];
        this.quad(p0, p1, q1, q0, c, nn);
        if (top !== null) this.tri(q0, q1, ap, top ?? shade(color, 1.05), [0, 1, 0]);
      } else this.tri(p0, p1, ap, c, nn);
    }
  }
}

/** Battlement merlons along a straight wall top from a to b (into the Mesher). */
function merlons(M: Mesher, a: [number, number], b: [number, number], y: number, c: string, step = 0.016, s = 0.008, h = 0.009, t = 0.008): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step)), ry = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i <= n; i++) { const f = i / n; M.box(a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f, s, h, t, c, ry); }
}
/** Frustum (cached) with bottom radius r0 and top radius r1. */
function frust(p: THREE.Object3D, c: string, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 12, o: MatOpts = {}): THREE.Mesh {
  const k = (r1 / r0).toFixed(3);
  return add(p, g(`lm4:fr:${seg}:${k}`, () => new THREE.CylinderGeometry(0.5 * r1 / r0, 0.5, 1, seg)), mat(c, o), x, y + h / 2, z, r0 * 2, h, r0 * 2);
}
/** Dome: upper hemisphere (squashable), cached. */
function dome(p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, h = r, seg = 12, o: MatOpts = {}): THREE.Mesh {
  return add(p, g(`lm4:dome:${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2)), mat(c, { flat: false, ...o }), x, y, z, r, h, r);
}

/** Two-blob broadleaf tree. */
function leafTree(p: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, seed = 0): void {
  cyl(p, '#5b4636', x, y, z, s * 0.09, s * 0.55, 5);
  blob(p, shade(c, 0.92 + hash3(seed, 1, 3) * 0.16), x, y + s * 0.66, z, s * 0.36, s * 0.27, s * 0.36);
  pebble(p, shade(c, 1.1), x + s * 0.12, y + s * 0.85, z + s * 0.06, s * 0.22);
}
/** Drooping palm frond: a V-ribbed leaf strip along +x (cached, double-sided by duplicated faces). */
const FROND = () => g('lm4:frond', () => {
  const pos: number[] = [], st = 5;
  const P = (i: number, side: number): V3 => {
    const t = i / st, w = 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
    return [t, 0.22 * t - 0.5 * t * t + (side === 0 ? 0.02 : -0.012), side * w];
  };
  for (let i = 0; i < st; i++) for (const sd of [-1, 1]) {
    const a = P(i, 0), b = P(i + 1, 0), c = P(i + 1, sd), d = P(i, sd);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
});
function palm(p: THREE.Object3D, x: number, y: number, z: number, h: number, lean = 0.12, ang = 0, c = '#4f8a3a', seed = 0, n = 8): void {
  const top: V3 = [x + Math.cos(ang) * lean * h, y + h, z + Math.sin(ang) * lean * h];
  rod(p, [x, y, z], [x + Math.cos(ang) * lean * h * 0.4, y + h * 0.55, z + Math.sin(ang) * lean * h * 0.4], h * 0.035, '#8a7458', 5);
  rod(p, [x + Math.cos(ang) * lean * h * 0.4, y + h * 0.55, z + Math.sin(ang) * lean * h * 0.4], top, h * 0.03, '#7d6a50', 5);
  const L = h * 0.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash3(seed, i, 7) * 0.5;
    add(p, FROND(), mat(shade(c, 0.85 + hash3(seed, i, 9) * 0.3)), top[0], top[1], top[2], L, L, L, a, 0, (hash3(seed, i, 8) - 0.4) * 0.5);
  }
  pebble(p, '#6b5a3a', top[0], top[1] - h * 0.02, top[2], h * 0.05);
}
/** Slim cypress / poplar. */
function cypress(p: THREE.Object3D, x: number, y: number, z: number, h: number, c = '#335c3a'): void {
  cyl(p, '#5b4636', x, y, z, h * 0.03, h * 0.15, 5);
  add(p, S9(), mat(c, { flat: false }), x, y + h * 0.55, z, h * 0.22, h * 0.9, h * 0.22);
}

// ===========================================================================================================
// ---- Meroë: steep Kushite pyramids with pylon chapels on rippled desert sand --------------------------------
const SANDC = '#d9a86c';
/** Banded pyramid (restored = smooth faces with faint courses, ruined = stepped courses and a broken top). */
function kushPyr(M: Mesher, x: number, y: number, z: number, w: number, h: number, cut: number, c: string, seed: number): void {
  const n = Math.round(h / (cut ? 0.0095 : 0.016)), top = h * (1 - cut);
  M.box(x, y, z, w + 0.012, 0.012, w + 0.012, shade(c, 0.93), 0, shade(c, 1.02));
  const hw = (yy: number) => (w / 2) * (1 - yy / h);
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * h, y1 = Math.min(top, ((i + 1) / n) * h);
    if (y0 >= top) break;
    const col = shade(c, 0.9 + hash3(seed, i, 1) * 0.16);
    if (cut === 0) {
      const a = hw(y0), b = hw(y1);
      for (const [ux, uz] of [[1, 0], [0, -1], [-1, 0], [0, 1]] as [number, number][]) {
        const nx = -uz, nz = ux; // outward normal for this side
        const P = (s: number, yy: number, r: number): V3 => [x + ux * s * r + nx * r, y + yy, z + uz * s * r + nz * r];
        M.quad(P(-1, y0, a), P(1, y0, a), P(1, y1, b), P(-1, y1, b), shade(col, nz > 0 ? 1.03 : 0.98), [nx, 0.4, nz]);
      }
    } else {
      // stepped course: riser + tread, with ragged corners on the ruined ones
      const a = hw(y0) * (0.97 + hash3(seed, i, 2) * 0.05);
      M.box(x, y + y0, z, a * 2, y1 - y0 + 0.0005, a * 2, col, 0, shade(col, 1.08));
    }
  }
  if (cut > 0) for (let k = 0; k < 4; k++) {
    const r = hw(top) * 0.8;
    M.box(x + (hash3(seed, k, 3) - 0.5) * r, y + top, z + (hash3(seed, k, 4) - 0.5) * r, 0.012 + hash3(seed, k, 5) * 0.012, 0.008 + hash3(seed, k, 6) * 0.012, 0.012, shade(c, 0.85));
  } else M.box(x, y + top - 0.006, z, 0.008, 0.008, 0.008, shade(c, 1.1));
}
/** Small pylon-gate chapel in front (+z) of a pyramid of base width w. */
function chapel(M: Mesher, x: number, y: number, z: number, w: number, c: string): void {
  const s = w / 0.14, fz = z + w / 2 + 0.03 * s;
  M.box(x, y, fz - 0.012 * s, 0.05 * s, 0.04 * s, 0.05 * s, shade(c, 0.97));
  M.box(x, y + 0.04 * s, fz - 0.012 * s, 0.054 * s, 0.004 * s, 0.054 * s, shade(c, 1.05));
  for (const sx of [-1, 1]) {
    M.box(x + sx * 0.026 * s, y, fz + 0.018 * s, 0.032 * s, 0.062 * s, 0.016 * s, c);
    M.box(x + sx * 0.026 * s, y + 0.062 * s, fz + 0.018 * s, 0.034 * s, 0.005 * s, 0.018 * s, shade(c, 1.07));
  }
  M.rect([x, y, fz + 0.0105 * s], [1, 0], [0, 1], 0.016 * s, 0.038 * s, '#3a2a1e');
  M.box(x, y + 0.04 * s, fz + 0.018 * s, 0.022 * s, 0.022 * s, 0.012 * s, shade(c, 0.93));
}
function camel(p: THREE.Object3D, x: number, y: number, z: number, ry: number, s = 1): void {
  const q = grp(p, x, y, z, ry), C = '#b8875a';
  blob(q, C, 0, 0.042 * s, 0, 0.026 * s, 0.014 * s, 0.012 * s);
  blob(q, shade(C, 1.05), -0.004 * s, 0.056 * s, 0, 0.012 * s, 0.011 * s, 0.009 * s);
  rod(q, [0.02 * s, 0.045 * s, 0], [0.034 * s, 0.07 * s, 0], 0.004 * s, C, 5);
  blob(q, C, 0.04 * s, 0.072 * s, 0, 0.009 * s, 0.005 * s, 0.005 * s);
  for (const [lx, lz] of [[0.016, 0.006], [0.016, -0.006], [-0.016, 0.006], [-0.016, -0.006]]) rod(q, [lx * s, 0.036 * s, lz * s], [lx * s, 0, lz * s], 0.0022 * s, shade(C, 0.9), 4);
}
const meroe: Builder = gp => {
  const hf: HFn = (x, z) => 0.008 * qn(x * 6, 1, z * 6) + 0.05 * sstep(-0.12, -0.5, z) * (0.6 + 0.4 * Math.sin(x * 7 + 1)) + 0.025 * sstep(0.2, 0.5, Math.abs(x)) * sstep(0.1, 0.4, z);
  ground(gp, hf, SANDC, (x, y, z, _nx, ny) => {
    if (hv(x * 70, 3, z * 70) > 0.965) return '#7a5a40';
    if (ny < 0.93) return shade(SANDC, 0.9);
    return Math.sin(x * 55 + z * 20 + Math.sin(z * 9) * 2) > 0.6 ? shade(SANDC, 1.06) : mix(SANDC, '#e3b77e', qn(x * 9, 0, z * 9));
  }, 16, 56, strataSide(['#c9955f', '#b98552', '#d6a46c']));
  const gy = onGround(hf);
  const M = new Mesher();
  const RU = '#8e5f3c', RE = '#d9a578';
  const P: [number, number, number, number, number, string][] = [
    [0.03, 0.02, 0.19, 0.36, 0, RE], [-0.25, -0.02, 0.14, 0.26, 0, shade(RE, 0.96)], [0.27, -0.04, 0.16, 0.28, 0.22, RU],
    [-0.09, -0.24, 0.16, 0.28, 0.2, shade(RU, 1.05)], [0.14, -0.29, 0.14, 0.25, 0.3, RU], [-0.32, -0.26, 0.12, 0.2, 0.35, shade(RU, 0.95)],
    [0.35, -0.28, 0.1, 0.17, 0.18, shade(RU, 1.08)],
  ];
  P.forEach(([x, z, w, h, cut, c], i) => {
    const y = gy(x, z);
    kushPyr(M, x, y - 0.002, z, w, h, cut, c, i + 1);
    if (i < 4) chapel(M, x, gy(x, z + w / 2 + 0.03), z, w, cut ? shade(RU, 1.15) : '#e2b386');
  });
  // Tumbled stones and low rubble walls between the tombs
  for (let k = 0; k < 26; k++) {
    const x = (hash3(k, 1, 7) - 0.5) * 0.8, z = (hash3(k, 2, 7) - 0.5) * 0.7;
    if (Math.hypot(x, z) > 0.44 || P.some(q => Math.abs(x - q[0]) < q[2] * 0.6 && Math.abs(z - q[1]) < q[2] * 0.9)) continue;
    M.box(x, gy(x, z), z, 0.01 + hash3(k, 3, 7) * 0.012, 0.006 + hash3(k, 4, 7) * 0.008, 0.01 + hash3(k, 5, 7) * 0.01, shade(RU, 0.9 + hash3(k, 6, 7) * 0.3), hash3(k, 7, 7) * 3);
  }
  M.buildIfAny(gp, { rough: 0.85 });
  camel(gp, -0.17, gy(-0.17, 0.3), 0.3, 0.5, 1.2);
  person(gp, -0.12, gy(-0.12, 0.33), 0.33, '#f8fafc', 2, 1.3);
  camel(gp, 0.22, gy(0.22, 0.27), 0.27, 2.6, 1.0);
  for (const [x, z] of [[-0.38, 0.17], [0.4, 0.12], [0.1, 0.38]]) { pebble(gp, '#7d8a4a', x, gy(x, z) + 0.008, z, 0.02, 0.012, 0.018); pebble(gp, '#6b7a40', x + 0.015, gy(x, z) + 0.006, z + 0.01, 0.012); }
};

// ---- Leptis Magna: four-way Arch of Septimius Severus on the colonnaded street, sea behind ------------------
const LS = '#d9bc8f', LSD = '#bfa077', LSL = '#e8d2ad';
function sevArch(p: THREE.Object3D, M: Mesher, x: number, y: number, z: number): void {
  const S = 0.27, H = 0.24, T = 0.055;
  const holes = () => [archPath(0, 0, 0.12, 0.18)];
  for (const [ox, oz, ry] of [[0, S / 2 - T / 2, 0], [0, -S / 2 + T / 2, 0], [S / 2 - T / 2, 0, Math.PI / 2], [-S / 2 + T / 2, 0, Math.PI / 2]] as number[][])
    panel(p, S, H, T, LS, holes(), x + ox, y, z + oz, ry);
  box(p, LSD, x, y, z, S + 0.012, 0.012, S + 0.012);
  box(p, LSL, x, y + H, z, S + 0.02, 0.014, S + 0.02);
  box(p, LS, x, y + H + 0.014, z, S - 0.004, 0.05, S - 0.004);
  box(p, LSL, x, y + H + 0.064, z, S + 0.008, 0.01, S + 0.008);
  box(p, LSD, x, y + H + 0.074, z, S - 0.06, 0.03, S - 0.06);
  box(p, LSL, x, y + H + 0.104, z, S - 0.05, 0.006, S - 0.05);
  // Each face: two pairs of Corinthian columns on pedestals with projecting entablature and a broken pediment
  for (const [ux, uz, nx, nz] of [[1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, 1, 0], [0, 1, -1, 0]]) {
    const fx = x + nx * (S / 2 + 0.014), fz = z + nz * (S / 2 + 0.014);
    for (const s of [-1, 1]) {
      for (const k of [0.072, 0.112]) {
        const cx = fx + ux * s * k, cz = fz + uz * s * k;
        M.box(cx, y, cz, 0.026, 0.05, 0.026, LSL);
        cyl(p, shade(LS, 1.04), cx, y + 0.05, cz, 0.0085, 0.15, 8);
        M.box(cx, y + 0.2, cz, 0.022, 0.016, 0.022, '#e9d6b2');
      }
      const ex = fx + ux * s * 0.092, ez = fz + uz * s * 0.092, ry = uz === 0 ? 0 : Math.PI / 2;
      M.box(ex, y + 0.216, ez, 0.07, 0.024, 0.026, LSL, ry);
      gable(p, 0.074, 0.022, 0.026, LS, ex, y + 0.24, ez, ry);
      // carved relief panels on the attic
      M.rect([x + nx * (S / 2 + 0.0005) + ux * s * 0.07, y + H + 0.022, z + nz * (S / 2 + 0.0005) + uz * s * 0.07], [ux, uz], [nx, nz], 0.09, 0.034, '#c9a97e');
    }
    for (let k = 0; k < 7; k++) M.rect([x + nx * (S / 2 + 0.001) + ux * (k - 3) * 0.018, y + H + 0.026, z + nz * (S / 2 + 0.001) + uz * (k - 3) * 0.018], [ux, uz], [nx, nz], 0.006, 0.02, '#b39268');
  }
}
const leptis: Builder = gp => {
  const sea = (x: number, z: number) => z + 0.04 * Math.sin(x * 6) < -0.32;
  const hf: HFn = (x, z) => sea(x, z) ? -0.018 : 0.003 * qn(x * 10, 2, z * 10) - 0.012 * sstep(-0.25, -0.32, z + 0.04 * Math.sin(x * 6));
  ground(gp, hf, '#cfb487', (x, y, z) => {
    if (y < Y0 - 0.012) return rip('#2f8fb3', x, z);
    if (y < Y0 - 0.004) return '#e3cfa2';
    if (Math.abs(x) < 0.07 || (Math.abs(z - 0.04) < 0.06 && Math.abs(x) < 0.4)) return (Math.floor(x * 45) + Math.floor(z * 45)) % 2 ? '#d8c6a4' : '#cdb994';
    return hv(x * 50, 1, z * 50) > 0.85 ? '#9a9a5a' : mix('#cfb487', '#bfa576', qn(x * 7, 0, z * 7));
  }, 18, 56, strataSide(['#c9ab7c', '#b8996b', '#d6bb8e']));
  const gy = onGround(hf);
  const M = new Mesher();
  sevArch(gp, M, 0, gy(0, 0.04), 0.04);
  // Via Colonnata: two rows of columns marching back toward the sea, several broken off
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    const x = sx * 0.1, z = -0.15 - k * 0.042, y = gy(x, z), hgt = hash3(k, sx, 5) > 0.35 ? 0.15 : 0.04 + hash3(k, sx, 6) * 0.06;
    M.box(x, y, z, 0.022, 0.012, 0.022, LSL);
    cyl(gp, shade(LS, 0.95 + hash3(k, sx, 3) * 0.1), x, y + 0.012, z, 0.0085, hgt, 8);
    if (hgt > 0.1) { M.box(x, y + 0.012 + hgt, z, 0.02, 0.014, 0.02, '#e9d6b2'); if (k % 2 === 0) M.box(x, y + 0.026 + hgt, z - 0.021, 0.024, 0.012, 0.066, LSL); }
  }
  // Cross street colonnade (front, east-west)
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const x = sx * (0.22 + k * 0.05), z = 0.15, y = gy(x, z), hgt = k === 2 ? 0.05 : 0.13;
    M.box(x, y, z, 0.022, 0.012, 0.022, LSL);
    cyl(gp, shade(LS, 0.97), x, y + 0.012, z, 0.008, hgt, 8);
    if (hgt > 0.1) M.box(x, y + 0.012 + hgt, z, 0.02, 0.013, 0.02, '#e9d6b2');
  }
  // Fragment of the Severan basilica wall with arched windows (back-left)
  const bw = grp(gp, -0.28, gy(-0.28, -0.12), -0.12, 0.35);
  panel(bw, 0.2, 0.17, 0.03, shade(LS, 0.94), [archPath(-0.05, 0.02, 0.05, 0.11), archPath(0.05, 0.02, 0.05, 0.11)], 0, 0, 0, 0);
  for (let k = 0; k < 6; k++) box(bw, shade(LS, 0.85 + hash3(k, 9, 1) * 0.2), -0.1 + k * 0.04, 0.17, 0, 0.04, 0.012 + hash3(k, 3, 1) * 0.02, 0.03);
  // Fallen column drums and capitals
  for (let k = 0; k < 9; k++) {
    const x = (hash3(k, 4, 2) - 0.5) * 0.7, z = 0.12 + hash3(k, 5, 2) * 0.24;
    if (Math.abs(x) < 0.09 || Math.hypot(x, z) > 0.44) continue;
    add(gp, g('cyl8', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), mat(shade(LS, 0.9 + hash3(k, 6, 2) * 0.15)), x, gy(x, z) + 0.008, z, 0.017, 0.03 + hash3(k, 7, 2) * 0.03, 0.017, hash3(k, 8, 2) * 3, 0, Math.PI / 2);
  }
  M.buildIfAny(gp, { rough: 0.8 });
  for (const [x, z, h] of [[0.33, -0.08, 0.17], [0.38, 0.0, 0.14], [-0.38, 0.06, 0.15]]) palm(gp, x, gy(x, z), z, h, 0.1, hash3(x, z, 1) * 6, '#5a8a3a', Math.round(x * 100));
  crowd(gp, 5, 3, i => { const x = -0.04 + i * 0.02, z = 0.24 + (i % 2) * 0.02; return [x, gy(x, z), z]; }, 1.2);
};

// ---- Fiat Tagliero: Futurist aeroplane petrol station with 15 m cantilevered concrete wings ------------------
const FW = '#efeae0', FWD = '#d9d2c4';
const fiat: Builder = gp => {
  ground(gp, () => 0, '#6f6f72', (x, _y, z) => {
    if (z > 0.19 || z < -0.3) return z > 0.19 ? (hv(x * 60, 0, z * 60) > 0.92 ? '#66666a' : '#6f6f72') : (hv(x * 40, 1, z * 40) > 0.6 ? '#a07a5a' : '#b08a66');
    return Math.abs(x) < 0.05 && z > 0.1 ? '#cfc8bb' : '#bdb6a8';
  }, 12, 48, strataSide(['#77777a', '#5f5f63']));
  const Y = Y0;
  const M = new Mesher();
  // Ground-floor showroom and service bay
  box(gp, FW, 0, Y, 0, 0.17, 0.085, 0.12);
  M.windows([0, Y, 0.0601], [1, 0], [0, 1], 3, 0.045, [0.012], 0.038, 0.05, '#2b3a44', '#ffffff');
  M.windows([0.0851, Y, 0], [0, -1], [1, 0], 2, 0.045, [0.012], 0.034, 0.05, '#2b3a44', '#ffffff');
  M.windows([-0.0851, Y, 0], [0, 1], [-1, 0], 2, 0.045, [0.012], 0.034, 0.05, '#2b3a44', '#ffffff');
  // The two cantilevered wings: tapered planform, thicker at the root, with a thin fascia
  const wing = (s: number) => {
    const pl: [number, number][] = [[s * 0.05, -0.07], [s * 0.44, -0.035], [s * 0.465, -0.02], [s * 0.465, 0.03], [s * 0.44, 0.04], [s * 0.05, 0.075]];
    prism(gp, s > 0 ? pl : pl.slice().reverse(), Y + 0.083, 0.016, FW);
    const root: [number, number][] = [[s * 0.05, -0.065], [s * 0.2, -0.05], [s * 0.2, 0.055], [s * 0.05, 0.07]];
    prism(gp, s > 0 ? root : root.slice().reverse(), Y + 0.077, 0.008, FWD);
  };
  wing(1); wing(-1);
  box(gp, FWD, 0, Y + 0.082, 0, 0.12, 0.016, 0.16);
  // Upper "cockpit": rounded drum with a ribbon window band
  prism(gp, [[-0.06, -0.045], [0.04, -0.045], [0.065, -0.02], [0.065, 0.02], [0.04, 0.05], [-0.06, 0.05]], Y + 0.097, 0.06, FW);
  box(gp, FWD, -0.003, Y + 0.157, 0.002, 0.13, 0.008, 0.1);
  for (let k = 0; k < 9; k++) M.rect([-0.056 + k * 0.012, Y + 0.106, 0.0505], [1, 0], [0, 1], 0.009, 0.036, '#30414c');
  for (let k = 0; k < 3; k++) { const a = -0.35 + k * 0.35; M.rect([0.052 + Math.cos(a) * 0.014, Y + 0.112, Math.sin(a) * 0.035], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.012, 0.034, '#30414c'); }
  // Tower fin with stepped shoulders, FIAT lettering and two masts
  const fin = grp(gp, -0.015, 0, -0.005, 0);
  const sl: [number, number][] = [[-0.035, Y + 0.16], [0.04, Y + 0.16], [0.04, Y + 0.24], [0.028, Y + 0.255], [0.022, Y + 0.33], [0.012, Y + 0.38], [-0.035, Y + 0.38]];
  const shape = new THREE.Shape(sl.map(([a, b]) => new THREE.Vector2(a, b)));
  const eg = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false });
  eg.translate(0, 0, -0.0225);
  add(fin, eg, mat(FW), 0, 0, 0, 1, 1, 1);
  const F2 = new Mesher();
  for (let k = 0; k < 4; k++) F2.box(-0.012, Y + 0.33 - k * 0.022, 0.0228, 0.012, 0.016, 0.002, '#b3261e');
  F2.box(-0.012, Y + 0.235, 0.0228, 0.004, 0.022, 0.002, '#b3261e');
  F2.tri([-0.02, Y + 0.24, 0.025], [-0.004, Y + 0.24, 0.025], [-0.012, Y + 0.225, 0.025], '#b3261e', [0, 0, 1]);
  F2.box(-0.012, Y + 0.355, 0.0228, 0.02, 0.012, 0.002, '#b3261e');
  for (let k = 0; k < 4; k++) F2.box(0.0402, Y + 0.3 - k * 0.012, 0.0, 0.002, 0.009, 0.006, '#b3261e');
  F2.buildIfAny(fin);
  for (const sx of [-0.025, 0.002]) rod(fin, [sx, Y + 0.38, 0], [sx, Y + 0.47, 0], 0.0016, '#d9d9d9', 4);
  // Forecourt: pump islands, cars and people
  for (const sx of [-1, 1]) for (const k of [0.17, 0.3]) {
    const x = sx * k;
    M.box(x, Y, 0.0, 0.05, 0.006, 0.02, '#d8d2c4');
    for (const dx of [-0.012, 0.012]) { M.box(x + dx, Y + 0.006, 0, 0.01, 0.028, 0.008, k > 0.2 ? '#c62828' : '#f2f2f2'); M.box(x + dx, Y + 0.034, 0, 0.012, 0.006, 0.01, '#f2c94c'); }
  }
  const car = (x: number, z: number, c: string, ry: number) => {
    const q = grp(gp, x, Y, z, ry);
    const C = new Mesher();
    C.box(0, 0.006, 0, 0.06, 0.014, 0.028, c); C.box(-0.004, 0.02, 0, 0.032, 0.012, 0.025, c);
    C.rect([0.0121, 0.021, 0], [0, -1], [1, 0], 0.022, 0.009, '#2b3a44'); C.rect([-0.0201, 0.021, 0], [0, 1], [-1, 0], 0.022, 0.009, '#2b3a44');
    C.rect([-0.004, 0.021, 0.0126], [1, 0], [0, 1], 0.028, 0.008, '#2b3a44');
    C.buildIfAny(q);
    for (const [wx, wz] of [[0.018, 0.014], [-0.018, 0.014], [0.018, -0.014], [-0.018, -0.014]]) add(q, g('lm4:wheel', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), mat('#1f1f1f'), wx, 0.007, wz, 0.014, 0.006, 0.014, 0, Math.PI / 2, 0);
  };
  for (let k = 0; k < 8; k++) M.quad([-0.42 + k * 0.11, Y + 0.0015, 0.29], [-0.37 + k * 0.11, Y + 0.0015, 0.29], [-0.37 + k * 0.11, Y + 0.0015, 0.275], [-0.42 + k * 0.11, Y + 0.0015, 0.275], '#f2f2f2', [0, 1, 0]);
  for (let k = 0; k < 8; k++) M.rect([-0.03 + k * 0.0085, Y + 0.148, 0.0506], [1, 0], [0, 1], 0.006, 0.007, '#7a2a24');
  car(0.25, 0.22, '#f2c418', 0); car(-0.2, 0.06, '#2f6fb3', 0.2); car(-0.3, 0.24, '#e5e5e5', Math.PI);
  M.buildIfAny(gp, { rough: 0.55 });
  palm(gp, -0.4, Y, -0.12, 0.2, 0.08, 0.3, '#4f8a3a', 1);
  palm(gp, 0.4, Y, -0.16, 0.17, 0.1, 2.5, '#4f8a3a', 2);
  for (const [x, z] of [[-0.25, -0.22], [0.22, -0.22], [0.0, -0.25]]) { box(gp, x === 0 ? '#c4a27e' : '#a4553a', x, Y, z, 0.13, 0.07, 0.07); box(gp, shade('#a4553a', 0.85), x, Y + 0.07, z, 0.135, 0.006, 0.075); }
  const spots = [[0.1, 0.12], [-0.12, 0.14], [0.36, 0.1], [0.05, 0.3], [-0.35, 0.05]];
  crowd(gp, spots.length, 9, i => [spots[i][0], Y, spots[i][1]], 1.3);
};

// ---- Maqam Echahid (Martyrs' Memorial), Algiers: three concrete palm leaves around a lantern turret --------
const MQ = '#dcc6a0';
const maqam: Builder = gp => {
  const sea = (x: number, z: number) => z + 0.03 * Math.sin(x * 7) < -0.36;
  const hf: HFn = (x, z) => sea(x, z) ? -0.03 : -0.026 * sstep(-0.22, -0.36, z + 0.03 * Math.sin(x * 7)) + 0.004 * qn(x * 9, 1, z * 9);
  ground(gp, hf, '#6d9a4a', (x, y, z) => {
    if (y < Y0 - 0.026) return rip('#2b7fae', x, z);
    if (Math.hypot(x, z - 0.02) < 0.27 || (Math.abs(x) < 0.07 && z > 0)) return (Math.floor(x * 40) + Math.floor(z * 40)) % 2 ? '#d9d2c3' : '#cfc7b6';
    return mix('#6d9a4a', '#4f7f3a', qn(x * 8, 0, z * 8));
  }, 16, 56, strataSide(['#8a6f52', '#7a6046', '#9a7c5c']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  // Plaza: two stepped round terraces and a front stair
  M.cyl(0, Y - 0.004, 0.02, 0.25, 0.25, 0.012, 28, '#d6cfbf', '#e2dccd');
  M.cyl(0, Y + 0.008, 0.02, 0.21, 0.21, 0.01, 28, '#d0c8b6', '#e6e0d2');
  for (let k = 0; k < 4; k++) M.box(0, Y - 0.004 + k * 0.0045, 0.29 - k * 0.012, 0.12, 0.0045, 0.014, '#d9d2c3');
  const B = Y + 0.018, H = 0.44;
  // Three leaves: crescent-section shells that splay out at the foot and rise almost vertically to pointed tips
  for (let k = 0; k < 3; k++) {
    const th = -Math.PI / 2 + k * (Math.PI * 2 / 3), R: [number, number] = [Math.cos(th), Math.sin(th)], T: [number, number] = [-R[1], R[0]];
    const rings: V3[][] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, y = B + t * H, r = 0.058 + 0.15 * Math.pow(1 - t, 2.6);
      const w = (0.15 - 0.105 * t) * (t > 0.86 ? Math.max(0.08, (1 - t) / 0.14) : 1), d = 0.028 - 0.014 * t, bow = 0.026 * (1 - 0.4 * t);
      const ring: V3[] = [];
      for (const [u, side] of [[-1, 1], [-0.4, 1], [0.4, 1], [1, 1], [1, -1], [0.4, -1], [-0.4, -1], [-1, -1]] as [number, number][]) {
        const rr = r + side * d / 2 - bow * u * u + (side < 0 ? 0 : 0.004 * (1 - u * u));
        ring.push([R[0] * rr + T[0] * u * w / 2, y, 0.02 + R[1] * rr + T[1] * u * w / 2]);
      }
      rings.push(ring);
    }
    skin(gp, rings, MQ, { caps: true, flat: true, paint: (x, y, z) => (Math.floor(y * 70) % 5 === 0 ? shade(MQ, 0.95) : hv(x * 90, y * 90, z * 90) > 0.94 ? shade(MQ, 1.04) : MQ) });
    // bronze soldier statue at the foot of each leaf
    const sx = R[0] * 0.25, sz = 0.02 + R[1] * 0.25;
    M.box(sx, Y + 0.008, sz, 0.03, 0.02, 0.03, '#cfc7b6', th);
    const q = grp(gp, sx, Y + 0.028, sz, -th + Math.PI / 2);
    cyl(q, '#4a3b2a', 0, 0, 0, 0.007, 0.03, 6);
    pebble(q, '#4a3b2a', 0, 0.036, 0, 0.0065);
    rod(q, [0.006, 0.024, 0], [0.012, 0.05, 0.004], 0.0022, '#4a3b2a', 4);
  }
  // Dark inner core and the lantern turret held between the leaves
  M.cyl(0, B, 0.02, 0.05, 0.03, 0.26, 10, '#5a4a3a', null);
  M.cyl(0, B + 0.26, 0.02, 0.026, 0.026, 0.07, 12, '#e3d3b2', null);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; M.rect([Math.cos(a) * 0.0262, B + 0.29, 0.02 + Math.sin(a) * 0.0262], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.007, 0.018, '#3b3026'); }
  for (let k = 0; k < 6; k++) M.rect([0.0, B + 0.13 + k * 0.022, 0.02 + 0.0352], [1, 0], [0, 1], 0.006, 0.016, '#8a6a46');
  M.cyl(0, B + 0.33, 0.02, 0.032, 0.03, 0.008, 12, '#efe3c8');
  dome(gp, '#e9dcc0', 0, B + 0.338, 0.02, 0.024, 0.018, 10);
  // antenna lattice mast
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; rod(gp, [Math.cos(a) * 0.008, B + 0.35, 0.02 + Math.sin(a) * 0.008], [Math.cos(a) * 0.002, B + 0.43, 0.02 + Math.sin(a) * 0.002], 0.0012, '#8c8c8c', 3); }
  for (let k = 0; k < 6; k++) M.cyl(0, B + 0.36 + k * 0.012, 0.02, 0.008 - k * 0.001, 0.008 - k * 0.001, 0.0015, 6, '#9a9a9a', null);
  // eternal flame
  M.cyl(0, Y + 0.018, 0.02, 0.014, 0.014, 0.006, 8, '#6b5a48');
  cone(gp, '#ff9a3c', 0, Y + 0.024, 0.02, 0.008, 0.03, 6).material = mat('#ff9a3c', { emissive: '#ff7a1a' });
  M.buildIfAny(gp, { rough: 0.85 });
  for (const [x, z, h] of [[-0.3, 0.16, 0.17], [-0.36, 0.06, 0.15], [0.3, 0.18, 0.16], [0.37, 0.08, 0.17], [-0.2, 0.33, 0.13], [0.21, 0.34, 0.14]]) palm(gp, x, gy(x, z), z, h, 0.06, hash3(x * 10, z * 10, 1) * 6, '#3f7d35', Math.round(x * 100 + z * 10), 7);
  for (const [x, z] of [[-0.33, -0.2], [0.32, -0.22], [0.0, -0.3]]) leafTree(gp, x, gy(x, z), z, 0.08, '#3f6f35', Math.round(x * 50));
  crowd(gp, 6, 21, i => { const x = -0.06 + i * 0.024, z = 0.2 + (i % 2) * 0.02; return [x, Y + 0.018, z]; }, 1.2);
};

// ---- Aït Benhaddou: mud-brick ksar climbing a hill, granary on top, palm oasis and stony river bed ----------
const ADB = '#b8754c';
const aitbenhaddou: Builder = gp => {
  const hill = (x: number, z: number) => 0.22 * Math.exp(-((x + 0.08) ** 2 / 0.05 + (z + 0.24) ** 2 / 0.025));
  const hf: HFn = (x, z) => hill(x, z) + 0.03 * sstep(0.2, -0.1, z) - 0.012 * sstep(0.2, 0.26, z) * sstep(0.46, 0.38, z) + 0.004 * qn(x * 12, 1, z * 12);
  ground(gp, hf, '#c48d62', (x, y, z, _nx, ny) => {
    if (z > 0.3 && z < 0.34 + 0.02 * Math.sin(x * 9)) return rip('#5f8fa0', x, z);
    if (z > 0.22) return hv(x * 80, 2, z * 80) > 0.7 ? '#cfb49a' : mix('#b99a7c', '#a88a6c', qn(x * 9, 0, z * 9));
    if (z > 0.12) return mix('#5c7f3a', '#4a6b30', qn(x * 10, 0, z * 10));
    if (ny < 0.8) return mix('#c79a6c', '#d8b48a', qn(x * 6, y * 20, z * 6));
    return mix('#c48d62', '#d29c70', qn(x * 9, 0, z * 9));
  }, 18, 56, strataSide(['#b07a52', '#9c6a46', '#c48d62']));
  const gy = onGround(hf), M = new Mesher();
  const minY = (x: number, z: number, w: number, d: number) => Math.min(gy(x - w / 2, z - d / 2), gy(x + w / 2, z - d / 2), gy(x - w / 2, z + d / 2), gy(x + w / 2, z + d / 2), gy(x, z));
  // Houses: flat-roofed mud blocks stepping up the slope; some are kasbahs with tapered corner towers
  let n = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) {
    const x = -0.38 + i * 0.066 + (hash3(i, j, 1) - 0.5) * 0.02, z = -0.3 + j * 0.052 + (hash3(i, j, 2) - 0.5) * 0.02;
    const rr = Math.hypot(x + 0.02, z + 0.05);
    if (rr > 0.4 || z > 0.11 || hash3(i, j, 3) < 0.12 || hill(x, z) > 0.1) continue;
    const w = 0.045 + hash3(i, j, 4) * 0.025, d = 0.04 + hash3(i, j, 5) * 0.02, base = minY(x, z, w, d) - 0.006;
    const hgt = gy(x, z) - base + 0.035 + hash3(i, j, 6) * 0.04, c = shade(ADB, 0.88 + hash3(i, j, 7) * 0.22), ry = (hash3(i, j, 8) - 0.5) * 0.25;
    M.box(x, base, z, w, hgt, d, c, ry, shade(c, 1.1));
    const top = base + hgt, cs = Math.cos(ry), sn = Math.sin(ry);
    // small dark windows on the front face
    for (let k = 0; k < 3; k++) if (hash3(i, j, 10 + k) > 0.4) {
      const lx = (k - 1) * w * 0.3, ly = top - 0.014 - (k % 2) * 0.016;
      M.rect([x + lx * cs + (d / 2 + 0.0008) * sn, ly, z - lx * sn + (d / 2 + 0.0008) * cs], [cs, -sn], [sn, cs], 0.005, 0.008, '#3a2418');
    }
    if (hash3(i, j, 9) > 0.72 && n++ < 9) {
      // kasbah: four tapered corner towers with notched crowns and a geometric frieze
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const tx = x + (sx * w / 2) * cs + (sz * d / 2) * sn, tz = z - (sx * w / 2) * sn + (sz * d / 2) * cs, th = top - base + 0.03;
        tbox(gp, 0.022, 0.022, 0.017, 0.017, th, shade(c, 0.96), tx, base, tz, 0, 0, ry);
        for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box(tx + ex * 0.0065, base + th, tz + ez * 0.0065, 0.005, 0.008, 0.005, shade(c, 1.05), ry);
        M.rect([tx + 0.0086 * sn, base + th - 0.016, tz + 0.0086 * cs], [cs, -sn], [sn, cs], 0.012, 0.006, shade(c, 0.75));
      }
      M.rect([x + (d / 2 + 0.001) * sn, base + hgt - 0.01, z + (d / 2 + 0.001) * cs], [cs, -sn], [sn, cs], w * 0.6, 0.005, shade(c, 0.78));
    }
  }
  // Fortified granary (agadir) and a ruined wall on the hilltop
  const ax = -0.08, az = -0.24, ab = gy(ax, az) - 0.01;
  M.box(ax, ab, az, 0.07, 0.05, 0.05, '#b98a62', 0.2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box(ax + sx * 0.033, ab, az + sz * 0.024, 0.016, 0.064, 0.016, '#b07e58', 0.2);
  for (let k = 0; k < 9; k++) { const x = -0.3 + k * 0.035, z = -0.22 - 0.06 * Math.sin(k * 0.5); M.box(x, gy(x, z) - 0.01, z, 0.036, 0.022 + hash3(k, 1, 3) * 0.012, 0.012, '#c09068', 0.4 - k * 0.08); }
  // Stepping stones across the stream and a donkey with a rider
  for (let k = 0; k < 6; k++) { const x = 0.02 + k * 0.012, z = 0.3 + k * 0.008; M.box(x, gy(x, z) - 0.002, z, 0.012, 0.006, 0.01, '#bba48a', k); }
  for (let k = 0; k < 18; k++) { const x = (hash3(k, 4, 1) - 0.5) * 0.8, z = 0.24 + hash3(k, 5, 1) * 0.2; if (Math.hypot(x, z) < 0.46) M.box(x, gy(x, z) - 0.002, z, 0.008, 0.005, 0.007, '#d6c6b0', k); }
  M.buildIfAny(gp, { rough: 0.95 });
  const dk = grp(gp, 0.22, gy(0.22, 0.38), 0.38, 0.3);
  blob(dk, '#6b625a', 0, 0.022, 0, 0.016, 0.009, 0.008); blob(dk, '#6b625a', 0.018, 0.03, 0, 0.007, 0.006, 0.005);
  for (const [lx, lz] of [[0.01, 0.005], [0.01, -0.005], [-0.01, 0.005], [-0.01, -0.005]]) rod(dk, [lx, 0.016, lz], [lx, 0, lz], 0.0018, '#5a524a', 4);
  person(dk, 0, 0.022, 0, '#3b82f6', 1, 1.0);
  for (const [x, z, h] of [[-0.3, 0.16, 0.12], [-0.17, 0.18, 0.15], [-0.05, 0.15, 0.11], [0.12, 0.17, 0.14], [0.26, 0.15, 0.12], [0.36, 0.08, 0.13]]) palm(gp, x, gy(x, z), z, h, 0.08, hash3(x * 10, z * 10, 2) * 6, '#4e7d35', Math.round(x * 100), 7);
  for (let k = 0; k < 10; k++) { const x = -0.38 + k * 0.08, z = 0.18 + hash3(k, 7, 3) * 0.05; pebble(gp, shade('#4d6e30', 0.9 + hash3(k, 8, 3) * 0.2), x, gy(x, z) + 0.008, z, 0.022, 0.014, 0.018); }
};

// ---- Burana Tower: stump of an 11th-century brick minaret with blind-arched octagonal base and teal stair -----
const BRK = '#c69570', BRKD = '#a8724e';
const burana: Builder = gp => {
  const hf: HFn = (x, z) => 0.1 * sstep(-0.26, -0.46, z) * (0.6 + 0.4 * Math.sin(x * 9 + 1) * Math.sin(x * 4)) + 0.015 * Math.exp(-((x - 0.28) ** 2 + (z + 0.12) ** 2) / 0.004) + 0.012 * Math.exp(-((x + 0.3) ** 2 + (z + 0.15) ** 2) / 0.003) + 0.003 * qn(x * 12, 0, z * 12);
  ground(gp, hf, '#b9a47a', (x, y, z) => {
    if (y > Y0 + 0.07) return hv(x * 50, y * 60, z * 50) > 0.3 ? '#f4f6f8' : '#dfe6ec';
    if (y > Y0 + 0.03) return mix('#8b8a7a', '#9c9a88', qn(x * 9, y * 9, z * 9));
    if (Math.abs(x + 0.02) < 0.04 && z > 0.12) return '#c7a985';
    return hv(x * 60, 1, z * 60) > 0.75 ? '#9aa161' : mix('#b9a47a', '#a8a06c', qn(x * 7, 0, z * 7));
  }, 16, 56, strataSide(['#8f7655', '#a08562', '#7f6849']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  // White stone platform
  M.box(0, Y - 0.004, 0, 0.27, 0.014, 0.25, '#e6e1d6');
  M.box(0, Y + 0.01, 0, 0.25, 0.006, 0.23, '#cfc3ae');
  for (let k = 0; k < 9; k++) M.rect([-0.12 + k * 0.03, Y - 0.003, 0.1251], [1, 0], [0, 1], 0.028, 0.004, k % 2 ? '#d6d0c2' : '#efeae0');
  // Octagonal base with blind arches and brick lattice panels
  const B = Y + 0.016, RO = 0.105, HO = 0.09;
  M.cyl(0, B, 0, RO, RO * 0.98, HO, 8, BRK, shade(BRK, 1.05), Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k + 0.5) * Math.PI / 4, ap = RO * Math.cos(Math.PI / 8) + 0.0008;
    const n: [number, number] = [Math.cos(a), Math.sin(a)], u: [number, number] = [-n[1], n[0]], c: V3 = [n[0] * ap, B + 0.012, n[1] * ap];
    M.rect(c, u, n, 0.06, 0.066, shade(BRK, 0.9));
    M.windows([n[0] * (ap + 0.0005), B + 0.016, n[1] * (ap + 0.0005)], u, n, 1, 0, [0], 0.034, 0.03, BRKD, shade(BRK, 1.08), true);
  }
  // Tapered shaft with alternating plain and lattice-patterned brick bands
  const S0 = B + HO, HS = 0.31, r0 = 0.084, r1 = 0.064, NB = 10;
  for (let b = 0; b < NB; b++) {
    const t0 = b / NB, t1 = (b + 1) / NB, ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1, pat = b % 2 === 1;
    M.cyl(0, S0 + t0 * HS, 0, ra, rb, HS / NB, 18, BRK, b === NB - 1 ? shade(BRK, 0.95) : null, 0, i => pat ? ((i + b) % 2 ? BRKD : shade(BRKD, 1.12)) : shade(BRK, 0.97 + (i % 3) * 0.03));
  }
  M.cyl(0, S0 + HS - 0.002, 0, r1 * 0.9, r1 * 0.9, 0.002, 12, '#7a5038');
  // Spiral stair and footbridge (teal steel)
  const sx = -0.19, sz = 0.07, top = S0 - 0.002;
  M.cyl(sx, Y, sz, 0.0035, 0.0035, top - Y + 0.03, 6, '#5fb3b0', null);
  for (let k = 0; k < 20; k++) { const a = k * 0.62, y = Y + (k / 20) * (top - Y); M.box(sx + Math.cos(a) * 0.016, y, sz + Math.sin(a) * 0.016, 0.03, 0.003, 0.012, '#4f9a98', -a); }
  for (let k = 0; k < 10; k++) { const a = k * 1.24 + 0.3, b = a + 1.24, ya = Y + 0.03 + (k / 10) * (top - Y), yb = Y + 0.03 + ((k + 1) / 10) * (top - Y); rod(gp, [sx + Math.cos(a) * 0.03, ya, sz + Math.sin(a) * 0.03], [sx + Math.cos(b) * 0.03, yb, sz + Math.sin(b) * 0.03], 0.0011, '#6fc6c3', 3); }
  M.box(-0.135, top, 0.06, 0.1, 0.004, 0.022, '#4f9a98', -0.12);
  for (const dz of [-0.011, 0.011]) M.box(-0.135, top + 0.004, 0.06 + dz, 0.1, 0.014, 0.0015, '#6fc6c3', -0.12);
  rod(gp, [0.04, S0 + HS - 0.02, 0.05], [0.07, S0 + HS - 0.012, 0.075], 0.0018, '#3a2a20', 4);
  // Balbal stone warriors and grave stones
  for (let k = 0; k < 9; k++) {
    const x = 0.2 + (k % 3) * 0.05 + (hash3(k, 1, 4) - 0.5) * 0.02, z = 0.12 + Math.floor(k / 3) * 0.06, hgt = 0.03 + hash3(k, 2, 4) * 0.025;
    M.box(x, gy(x, z) - 0.003, z, 0.016, hgt, 0.009, shade('#8c8a84', 0.85 + hash3(k, 3, 4) * 0.3), (hash3(k, 4, 4) - 0.5) * 0.4);
    M.rect([x, gy(x, z) + hgt - 0.017, z + 0.0048], [1, 0], [0, 1], 0.008, 0.009, '#6e6c66');
  }
  M.buildIfAny(gp, { rough: 0.9 });
  for (let k = 0; k < 8; k++) { const x = 0.42 - k * 0.04, z = -0.24 - k * 0.012; cypress(gp, x, gy(x, z), z, 0.1 + hash3(k, 5, 1) * 0.04, k % 2 ? '#5c7a3a' : '#6e8a40'); }
  for (let k = 0; k < 5; k++) { const x = -0.42 + k * 0.035, z = -0.18 - k * 0.01; cypress(gp, x, gy(x, z), z, 0.09, '#6e8a40'); }
  crowd(gp, 4, 17, i => { const x = -0.06 + i * 0.05, z = 0.17 + (i % 2) * 0.03; return [x, gy(x, z), z]; }, 1.2);
};

// ---- Erdene Zuu Monastery: stupa-studded square wall around green-roofed temples on the steppe --------------
const EZW = '#f2efe6';
function zuuRoof(p: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, h: number, c: string): void {
  tbox(p, w + 0.03, d + 0.03, w * 0.8, d * 0.6, h * 0.35, shade(c, 0.95), x, y, z);
  tbox(p, w * 0.8, d * 0.6, w * 0.55, 0.004, h * 0.65, c, x, y + h * 0.35, z);
  box(p, '#8a6a2a', x, y + h - 0.002, z, w * 0.58, 0.006, 0.006);
  for (const sx of [-1, 1]) cone(p, '#d4a62a', x + sx * w * 0.29, y + h, z, 0.004, 0.014, 5);
}
function zuuHall(p: THREE.Object3D, M: Mesher, x: number, y: number, z: number, w: number, d: number, h: number, two: boolean): void {
  M.box(x, y, z, w + 0.016, 0.01, d + 0.016, '#cfc8bc');
  M.box(x, y + 0.01, z, w, h, d, '#b8322a');
  M.box(x, y + 0.01, z, w + 0.002, 0.012, d + 0.002, '#d9d4cc');
  M.windows([x, y + 0.01, z + d / 2 + 0.001], [1, 0], [0, 1], 5, w / 5.5, [0.014], w / 9, h * 0.5, '#2f7a6a', '#d6b24a');
  M.rect([x, y + 0.012, z + d / 2 + 0.0035], [1, 0], [0, 1], w / 7, h * 0.65, '#c43a2a');
  M.box(x, y + 0.01 + h, z, w + 0.004, 0.008, d + 0.004, '#2f6f62');
  for (let k = 0; k < 7; k++) M.rect([x - w / 2 + (k + 0.5) * w / 7, y + 0.011 + h, z + d / 2 + 0.0035], [1, 0], [0, 1], w / 9, 0.006, ['#d64545', '#2f8fd6', '#f2c94c'][k % 3]);
  const rh = d * 0.6;
  zuuRoof(p, x, y + 0.018 + h, z, w, d, rh, '#5f9a6e');
  if (two) {
    box(p, '#b8322a', x, y + 0.018 + h + rh * 0.3, z, w * 0.62, rh * 0.5, d * 0.45);
    zuuRoof(p, x, y + 0.018 + h + rh * 0.78, z, w * 0.62, d * 0.45, rh * 0.75, '#669f72');
    cone(p, '#d4a62a', x, y + 0.018 + h + rh * 1.5, z, 0.007, 0.024, 6);
  }
}
function stupa(M: Mesher, x: number, y: number, z: number, s: number, c = EZW): void {
  M.box(x, y, z, 0.03 * s, 0.012 * s, 0.03 * s, c);
  M.box(x, y + 0.012 * s, z, 0.024 * s, 0.008 * s, 0.024 * s, shade(c, 0.97));
  M.cyl(x, y + 0.02 * s, z, 0.011 * s, 0.013 * s, 0.014 * s, 8, c, shade(c, 1.03));
  M.box(x, y + 0.034 * s, z, 0.01 * s, 0.005 * s, 0.01 * s, c);
  M.cyl(x, y + 0.039 * s, z, 0.004 * s, 0.0015 * s, 0.02 * s, 6, '#d4a62a', null);
}
const erdenezuu: Builder = gp => {
  const hf: HFn = (x, z) => 0.05 * sstep(-0.3, -0.48, z) * (0.5 + 0.5 * Math.sin(x * 5 + 2)) + 0.003 * qn(x * 12, 0, z * 12);
  ground(gp, hf, '#8fa356', (x, y, z) => {
    if (Math.max(Math.abs(x), Math.abs(z)) < 0.29 && Math.abs(x) < 0.03) return '#d8cfbe';
    if (y > Y0 + 0.02) return mix('#9c9a6a', '#7f8c50', qn(x * 9, y * 9, z * 9));
    return hv(x * 70, 3, z * 70) > 0.85 ? '#b8b07a' : mix('#8fa356', '#a3ab62', qn(x * 7, 0, z * 7));
  }, 16, 56, strataSide(['#6b5a40', '#7a684a', '#5c4c36']));
  const Y = Y0, M = new Mesher(), W = 0.3;
  // Square wall with a stupa on every bay
  for (const [a, b] of [[[-W, W], [W, W]], [[W, W], [W, -W]], [[W, -W], [-W, -W]], [[-W, -W], [-W, W]]] as [number, number][][]) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx), front = a[1] === W && b[1] === W;
    const segs = front ? [[0, 0.44], [0.56, 1]] : [[0, 1]];
    for (const [f0, f1] of segs) M.box(a[0] + dx * (f0 + f1) / 2, Y, a[1] + dz * (f0 + f1) / 2, L * (f1 - f0), 0.028, 0.012, EZW, ry, '#b9a27e');
    for (let k = 0; k < 8; k++) { const f = k / 8; if (front && Math.abs(f - 0.5) < 0.07) continue; stupa(M, a[0] + dx * f, Y + 0.022, a[1] + dz * f, 0.9); }
  }
  // Gate in the front wall
  M.box(-0.035, Y, W, 0.02, 0.05, 0.022, '#b8322a'); M.box(0.035, Y, W, 0.02, 0.05, 0.022, '#b8322a');
  M.box(0, Y + 0.05, W, 0.09, 0.012, 0.026, '#c03a30');
  zuuRoof(gp, 0, Y + 0.062, W, 0.08, 0.02, 0.022, '#5f9a6e');
  // Three temples of the Zuu, the central one with a two-tier roof
  zuuHall(gp, M, 0, Y, -0.13, 0.17, 0.1, 0.055, true);
  zuuHall(gp, M, -0.17, Y, -0.1, 0.1, 0.07, 0.04, false);
  zuuHall(gp, M, 0.17, Y, -0.1, 0.1, 0.07, 0.04, false);
  // Golden Prayer stupa (big white stupa) and a Tibetan-style white temple with a dark-red parapet band
  stupa(M, 0.17, Y, 0.1, 2.3);
  M.box(-0.17, Y, 0.1, 0.11, 0.06, 0.07, '#f4f1ea');
  M.box(-0.17, Y + 0.06, 0.1, 0.112, 0.012, 0.072, '#7a2a24');
  M.windows([-0.17, Y, 0.1 + 0.0351], [1, 0], [0, 1], 4, 0.024, [0.014, 0.036], 0.01, 0.014, '#2a2422', '#2a2422');
  M.cyl(-0.17, Y + 0.072, 0.1, 0.006, 0.0, 0.03, 6, '#d4a62a');
  // Stone path and paving
  for (let k = 0; k < 9; k++) M.box(0, Y - 0.002, 0.27 - k * 0.035, 0.05, 0.003, 0.028, k % 2 ? '#d5ccbc' : '#cbc2b0');
  M.buildIfAny(gp, { rough: 0.8 });
  // Gers on the steppe outside the wall
  for (const [x, z] of [[0.38, 0.18], [0.42, 0.06], [-0.4, 0.2]]) {
    const y = onGround(hf)(x, z);
    cyl(gp, '#f5f2ea', x, y, z, 0.03, 0.026, 10);
    cone(gp, '#efe9dc', x, y + 0.026, z, 0.034, 0.02, 10);
    box(gp, '#d64a3a', x, y, z + 0.028, 0.012, 0.018, 0.004);
  }
  crowd(gp, 5, 31, i => { const x = -0.02 + (i % 3) * 0.02, z = 0.36 + Math.floor(i / 3) * 0.03; return [x, Y, z]; }, 1.2);
  for (const [x, z] of [[0.36, 0.3], [0.3, 0.35]]) { const q = grp(gp, x, Y, z, 1.2); blob(q, '#7a5a3a', 0, 0.022, 0, 0.018, 0.011, 0.009); blob(q, '#6a4a2a', 0.018, 0.03, 0, 0.007, 0.006, 0.005); for (const [lx, lz] of [[0.01, 0.005], [-0.01, -0.005]]) rod(q, [lx, 0.016, lz], [lx, 0, lz], 0.002, '#4a3a2a', 4); }
};

// ---- Shibam: the "Manhattan of the desert", mud-brick tower houses on a walled mound above the wadi ---------
const SHB = '#b78c5e';
const shibam: Builder = gp => {
  const inCity = (x: number, z: number) => Math.abs(x * 0.96 + z * 0.28) < 0.3 && Math.abs(z * 0.96 - x * 0.28) < 0.2;
  const hf: HFn = (x, z) => (inCity(x, z) ? 0.016 : 0) + 0.004 * qn(x * 10, 2, z * 10) - 0.008 * sstep(0.2, 0.3, z) * sstep(0.44, 0.38, z);
  ground(gp, hf, '#d4b48a', (x, y, z) => {
    if (inCity(x, z)) return '#b49470';
    if (z < -0.22 || (x > 0.33 && z < 0.1)) return hv(x * 30, 0, z * 30) > 0.55 ? '#5e8f3a' : '#76a245';
    if (z > 0.27 && z < 0.39) return mix('#d9c09a', '#cdb08a', qn(x * 12, 0, z * 12));
    return mix('#d4b48a', '#c6a47a', qn(x * 9, 0, z * 9));
  }, 16, 56, strataSide(['#a88a66', '#9a7c58', '#b49470']));
  const gy = onGround(hf), M = new Mesher(), ry = -0.29, cs = Math.cos(ry), sn = Math.sin(ry);
  const L = (lx: number, lz: number): [number, number] => [lx * cs + lz * sn, -lx * sn + lz * cs];
  const Yc = Y0 + 0.016 - 0.002;
  // City wall with its single gate on the south side
  for (const [a, b] of [[[-0.29, 0.19], [-0.03, 0.19]], [[0.03, 0.19], [0.29, 0.19]], [[0.29, 0.19], [0.29, -0.19]], [[0.29, -0.19], [-0.29, -0.19]], [[-0.29, -0.19], [-0.29, 0.19]]] as [number, number][][]) {
    const pa = L(a[0], a[1]), pb = L(b[0], b[1]), len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    M.box((pa[0] + pb[0]) / 2, Y0 - 0.004, (pa[1] + pb[1]) / 2, len, 0.034, 0.01, '#a98258', ry - Math.atan2(b[1] - a[1], b[0] - a[0]) * 0 + (a[0] === b[0] ? Math.PI / 2 : 0));
  }
  const gt = L(0, 0.19);
  M.box(gt[0], Y0 - 0.004, gt[1], 0.08, 0.06, 0.03, '#e8e0cc', ry);
  M.rect([gt[0] + 0.0151 * sn, Y0, gt[1] + 0.0151 * cs], [cs, -sn], [sn, cs], 0.026, 0.04, '#3a2a1e');
  // Tower houses on a tight grid with narrow lanes
  for (let i = 0; i < 10; i++) for (let j = 0; j < 7; j++) {
    const lx = -0.26 + i * 0.058 + (hash3(i, j, 1) - 0.5) * 0.008, lz = -0.155 + j * 0.052 + (hash3(i, j, 2) - 0.5) * 0.008;
    if (hash3(i, j, 3) < 0.06 || (j === 6 && Math.abs(lx) < 0.06)) continue;
    const [x, z] = L(lx, lz), w = 0.046 + hash3(i, j, 4) * 0.008, d = 0.042 + hash3(i, j, 5) * 0.008;
    const hgt = 0.12 + hash3(i, j, 6) * 0.08 + (j < 3 ? 0.02 : 0), kind = hash3(i, j, 7);
    const c = kind < 0.2 ? '#efe7d6' : shade(SHB, 0.86 + hash3(i, j, 8) * 0.24);
    M.box(x, Yc, z, w, hgt, d, c, ry, shade(c, 1.08));
    if (kind > 0.2 && kind < 0.62) M.box(x, Yc + hgt * 0.8, z, w + 0.001, hgt * 0.2, d + 0.001, '#f0e8d8', ry, '#f6f0e4');
    // window rows on the two faces that face the viewer
    for (const [nx, nz, ux, uz, half, wd] of [[sn, cs, cs, -sn, d / 2, w], [cs, -sn, -sn, -cs, w / 2, d]] as number[][]) {
      const o: V3 = [x + nx * half, Yc, z + nz * half];
      const rows: number[] = [];
      for (let r = 0.03; r < hgt - 0.012; r += 0.022) rows.push(r);
      M.windows(o, [ux, uz], [nx, nz], 2, wd * 0.42, rows, 0.006, 0.008, '#3a2a1e');
    }
  }
  M.buildIfAny(gp, { rough: 0.95 });
  // Palm groves and fields behind, a few cars on the wadi road
  for (const [x, z, h] of [[-0.3, -0.3, 0.12], [-0.2, -0.36, 0.13], [0.1, -0.38, 0.12], [0.25, -0.33, 0.13], [0.38, -0.12, 0.12], [0.4, 0.02, 0.11]]) palm(gp, x, gy(x, z), z, h, 0.07, hash3(x * 10, z * 10, 3) * 6, '#4e7d35', Math.round(x * 100 + z), 6);
  for (const [x, z] of [[-0.05, -0.32], [-0.38, -0.18], [0.36, -0.24]]) pebble(gp, '#4f7a32', x, gy(x, z) + 0.01, z, 0.03, 0.02, 0.026);
  const car = (x: number, z: number, c: string) => { const q = grp(gp, x, gy(x, z), z, 0.1); box(q, c, 0, 0.008, 0, 0.034, 0.01, 0.018); box(q, '#2b3a44', -0.003, 0.016, 0, 0.018, 0.007, 0.016); };
  car(-0.2, 0.32, '#f2f2f2'); car(0.12, 0.34, '#d64545');
  crowd(gp, 4, 41, i => { const x = -0.06 + i * 0.03, z = 0.27 + (i % 2) * 0.02; return [x, gy(x, z), z]; }, 1.2);
};

// ---- Nizwa Fort: the giant round gun tower beside the blue-domed mosque among date palms -------------------
const NZ = '#c9a77c';
const nizwa: Builder = gp => {
  const hf: HFn = (x, z) => 0.004 * qn(x * 10, 3, z * 10) + 0.06 * sstep(-0.3, -0.48, z) * (0.6 + 0.4 * Math.sin(x * 6));
  ground(gp, hf, '#d1b48c', (x, y, z) => {
    if (y > Y0 + 0.02) return mix('#8c7a66', '#a08a72', qn(x * 9, y * 20, z * 9));
    if (z > 0.18) return (Math.floor(x * 50) + Math.floor(z * 50)) % 2 ? '#d9c6a6' : '#d2bd9a';
    return mix('#d1b48c', '#c6a87e', qn(x * 9, 0, z * 9));
  }, 16, 56, strataSide(['#a88a66', '#9a7c58', '#b49470']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  // Great round tower: battered drum, string course, crenellated parapet, loopholes and a wooden door
  const tx = 0.04, tz = 0.0, R = 0.15, H = 0.19;
  M.cyl(tx, Y - 0.004, tz, R + 0.008, R, H * 0.55, 28, NZ, null, 0, i => shade(NZ, 0.95 + (i % 4) * 0.02));
  M.cyl(tx, Y - 0.004 + H * 0.55, tz, R, R - 0.004, H * 0.45, 28, shade(NZ, 1.03), shade(NZ, 0.9));
  M.cyl(tx, Y + H * 0.55 - 0.006, tz, R + 0.003, R + 0.003, 0.006, 28, shade(NZ, 1.1), null);
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2, r = R - 0.006;
    M.box(tx + Math.cos(a) * r, Y + H - 0.004, tz + Math.sin(a) * r, 0.014, 0.014, 0.008, shade(NZ, 1.05), -a + Math.PI / 2);
    M.box(tx + Math.cos(a) * r, Y + H + 0.01, tz + Math.sin(a) * r, 0.007, 0.006, 0.006, shade(NZ, 1.08), -a + Math.PI / 2);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.2, r = R + 0.0012;
    M.rect([tx + Math.cos(a) * r, Y + H * 0.72, tz + Math.sin(a) * r], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.006, 0.014, '#4a3626');
  }
  M.rect([tx + 0.02, Y, tz + R + 0.0085], [1, 0], [0, 1], 0.03, 0.05, '#6b4a2e');
  // Flag on a pole on the tower roof
  rod(gp, [tx, Y + H, tz], [tx, Y + H + 0.08, tz], 0.0018, '#d9d9d9', 4);
  box(gp, '#d32f2f', tx + 0.016, Y + H + 0.065, tz, 0.03, 0.014, 0.002);
  box(gp, '#f5f5f5', tx + 0.016, Y + H + 0.058, tz, 0.03, 0.005, 0.0022);
  box(gp, '#2e7d32', tx + 0.016, Y + H + 0.053, tz, 0.03, 0.005, 0.0022);
  // Fort courtyard buildings behind (castle) with square towers and stepped merlons
  const fb = [[-0.2, -0.12, 0.14, 0.1, 0.1], [-0.05, -0.2, 0.16, 0.08, 0.08], [0.18, -0.2, 0.12, 0.08, 0.09]];
  for (const [x, z, w, d, h] of fb) {
    M.box(x, Y - 0.004, z, w, h, d, shade(NZ, 0.97), 0, shade(NZ, 1.06));
    merlons(M, [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], Y - 0.004 + h, shade(NZ, 1.05), 0.014, 0.007, 0.009, 0.005);
    M.windows([x, Y - 0.004, z + d / 2 + 0.0005], [1, 0], [0, 1], 3, w / 3.5, [h * 0.55], 0.008, 0.016, '#4a3626', undefined, true);
  }
  for (const [x, z] of [[-0.28, -0.07], [-0.12, -0.25]]) { M.box(x, Y - 0.004, z, 0.04, 0.15, 0.04, shade(NZ, 1.02)); merlons(M, [x - 0.02, z + 0.02], [x + 0.02, z + 0.02], Y + 0.146, shade(NZ, 1.06), 0.013, 0.007, 0.01, 0.005); M.rect([x, Y + 0.1, z + 0.0205], [1, 0], [0, 1], 0.008, 0.016, '#4a3626'); }
  // Sultan Qaboos Mosque: white prayer hall, blue dome with gold finial and a slender minaret
  const mx = -0.25, mz = 0.14;
  M.box(mx, Y - 0.004, mz, 0.15, 0.06, 0.1, '#efe8da', 0, '#f6f1e6');
  M.windows([mx, Y - 0.004, mz + 0.0505], [1, 0], [0, 1], 5, 0.028, [0.012], 0.012, 0.03, '#6b8fb0', '#d9cdb4', true);
  for (let k = 0; k < 15; k++) M.box(mx - 0.07 + k * 0.01, Y + 0.056, mz + 0.048, 0.005, 0.008, 0.004, '#efe8da');
  M.cyl(mx, Y + 0.056, mz - 0.01, 0.034, 0.034, 0.02, 16, '#efe8da', null);
  dome(gp, '#2f6fb8', mx, Y + 0.076, mz - 0.01, 0.036, 0.04, 14, { metal: 0.2, rough: 0.35 });
  M.cyl(mx, Y + 0.115, mz - 0.01, 0.003, 0, 0.022, 6, '#e0b84a');
  const nx = -0.37, nzz = 0.05;
  M.cyl(nx, Y - 0.004, nzz, 0.014, 0.012, 0.16, 8, '#efe8da', null);
  M.cyl(nx, Y + 0.156, nzz, 0.02, 0.02, 0.006, 8, '#d9cdb4');
  M.cyl(nx, Y + 0.162, nzz, 0.009, 0.009, 0.03, 8, '#efe8da', null);
  dome(gp, '#2f6fb8', nx, Y + 0.192, nzz, 0.011, 0.016, 8);
  M.cyl(nx, Y + 0.207, nzz, 0.002, 0, 0.014, 5, '#e0b84a');
  M.buildIfAny(gp, { rough: 0.9 });
  for (const [x, z, h] of [[0.27, 0.16, 0.16], [0.34, 0.06, 0.14], [0.38, -0.08, 0.17], [0.26, 0.28, 0.12], [-0.38, -0.22, 0.13], [-0.09, 0.3, 0.13], [0.12, 0.33, 0.12]]) palm(gp, x, gy(x, z), z, h, 0.07, hash3(x * 10, z * 10, 4) * 6, '#4e7d35', Math.round(x * 100 + z * 7), 7);
  crowd(gp, 6, 51, i => { const x = -0.12 + i * 0.04, z = 0.24 + (i % 2) * 0.03; return [x, gy(x, z), z]; }, 1.2);
};

// ---- Baalbek: the Temple of Bacchus peristyle on its podium, six giant Jupiter columns behind ----------------
const BB = '#d8bf93', BBD = '#c2a476', BBL = '#e6d3ad';
const baalbek: Builder = gp => {
  const hf: HFn = (x, z) => 0.13 * sstep(-0.3, -0.5, z) * (0.6 + 0.4 * Math.sin(x * 5 + 1)) + 0.004 * qn(x * 10, 1, z * 10);
  ground(gp, hf, '#b6a072', (x, y, z) => {
    if (y > Y0 + 0.05) return mix('#a58f6c', '#b9a27c', qn(x * 7, y * 9, z * 7));
    if (y > Y0 + 0.015) return mix('#93a05a', '#a7a065', qn(x * 9, 0, z * 9));
    return hv(x * 60, 4, z * 60) > 0.8 ? '#8f9a52' : mix('#c7b48c', '#b6a072', qn(x * 9, 0, z * 9));
  }, 16, 56, strataSide(['#a88a66', '#9a7c58', '#b49470']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  // Temple of Bacchus: podium, peristyle 8 × 15, cella with pilasters, entablature and a broken roof edge
  const cx = -0.04, cz = 0.02, LX = 0.38, LZ = 0.17, P = Y + 0.034, CH = 0.14;
  M.box(cx, Y - 0.004, cz, LX + 0.06, 0.038, LZ + 0.06, BBD, 0, shade(BB, 1.02));
  for (let k = 0; k < 5; k++) M.box(cx + LX / 2 + 0.035 + k * 0.009, Y - 0.004, cz, 0.012, 0.034 - k * 0.007, 0.1, shade(BB, 1.03));
  M.box(cx, P, cz, LX * 0.7, CH * 0.92, LZ * 0.55, shade(BB, 0.94));
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) {
    const x = cx - LX * 0.33 + k * LX * 0.094, z = cz + s * (LZ * 0.275 + 0.001);
    M.rect([x, P, z], [1, 0], [0, s], 0.012, CH * 0.92, shade(BB, 1.03));
    if (k < 7) M.rect([x + LX * 0.047, P + 0.04, z + s * 0.0005], [1, 0], [0, s], 0.016, 0.03, shade(BB, 0.8));
  }
  const cols: [number, number][] = [];
  for (let i = 0; i < 15; i++) for (let j = 0; j < 8; j++) if (i === 0 || i === 14 || j === 0 || j === 7) cols.push([cx - LX / 2 + (i / 14) * LX, cz - LZ / 2 + (j / 7) * LZ]);
  cols.forEach(([x, z], k) => {
    const back = z < cz - LZ / 2 + 0.01, gone = back && (k % 5 === 1 || k % 7 === 3);
    M.box(x, P, z, 0.02, 0.008, 0.02, BBL);
    if (gone) { M.cyl(x, P + 0.008, z, 0.0085, 0.0085, 0.03, 8, shade(BB, 0.96)); return; }
    M.cyl(x, P + 0.008, z, 0.0088, 0.0078, CH - 0.02, 8, shade(BB, 0.96 + hash3(k, 1, 2) * 0.08), null);
    M.cyl(x, P + CH - 0.012, z, 0.0078, 0.012, 0.012, 8, BBL);
  });
  // entablature: architrave, frieze and cornice (the back-right corner has collapsed)
  const ent = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2;
    M.box((x0 + x1) / 2, P + CH, (z0 + z1) / 2, L + 0.024, 0.012, 0.022, BB, ry);
    M.box((x0 + x1) / 2, P + CH + 0.012, (z0 + z1) / 2, L + 0.024, 0.01, 0.02, shade(BB, 1.05), ry);
    M.box((x0 + x1) / 2, P + CH + 0.022, (z0 + z1) / 2, L + 0.034, 0.008, 0.03, BBL, ry);
  };
  const x0 = cx - LX / 2, x1 = cx + LX / 2, z0 = cz - LZ / 2, z1 = cz + LZ / 2;
  ent(x0, z1, x1, z1); ent(x1, z0, x1, z1); ent(x0, z0, x0, z1); ent(x0, z0, cx, z0);
  for (let k = 0; k < 14; k++) M.box(x0 + 0.01 + k * 0.027, P + CH + 0.022, z1 + 0.0151, 0.006, 0.006, 0.004, '#cbb084');
  // coffered ceiling slabs between peristyle and cella (partly fallen)
  for (let k = 0; k < 9; k++) if (k % 4 !== 2) M.box(cx - LX * 0.4 + k * LX * 0.1, P + CH - 0.003, cz + LZ * 0.39, LX * 0.09, 0.006, LZ * 0.2, shade(BB, 0.9));
  M.box(cx, P + CH * 0.92, cz, LX * 0.7, 0.02, LZ * 0.55, shade(BB, 0.97));
  // Temple of Jupiter: six columns on a tall podium with a chunk of entablature
  const jz = -0.24, jy = gy(0.12, jz) + 0.05;
  M.box(0.12, Y - 0.004, jz, 0.28, jy - Y + 0.004, 0.07, BBD, 0, shade(BB, 1.02));
  for (let k = 0; k < 6; k++) {
    const x = 0.01 + k * 0.044;
    M.box(x, jy, jz, 0.026, 0.01, 0.026, BBL);
    M.cyl(x, jy + 0.01, jz, 0.011, 0.0098, 0.2, 8, shade(BB, 0.95 + hash3(k, 3, 2) * 0.08), null);
    M.cyl(x, jy + 0.21, jz, 0.0098, 0.015, 0.014, 8, BBL);
  }
  M.box(0.12, jy + 0.224, jz, 0.25, 0.016, 0.03, BB);
  M.box(0.12, jy + 0.24, jz, 0.25, 0.014, 0.028, shade(BB, 1.05));
  M.box(0.12, jy + 0.254, jz, 0.26, 0.01, 0.036, BBL);
  // Rubble field and giant blocks
  for (let k = 0; k < 30; k++) {
    const x = (hash3(k, 7, 1) - 0.5) * 0.85, z = 0.17 + hash3(k, 8, 1) * 0.26;
    if (Math.hypot(x, z) > 0.45) continue;
    M.box(x, gy(x, z) - 0.003, z, 0.016 + hash3(k, 9, 1) * 0.02, 0.008 + hash3(k, 10, 1) * 0.012, 0.014 + hash3(k, 11, 1) * 0.016, shade(BB, 0.82 + hash3(k, 12, 1) * 0.3), hash3(k, 13, 1) * 3);
  }
  for (let k = 0; k < 4; k++) { const x = -0.3 + k * 0.06, z = 0.2 + (k % 2) * 0.05; M.cyl(x, gy(x, z), z, 0.012, 0.012, 0.012, 8, shade(BB, 0.92)); }
  M.box(-0.33, Y - 0.004, -0.18, 0.08, 0.07, 0.06, shade(BB, 0.9));
  M.rect([-0.33, Y, -0.149], [1, 0], [0, 1], 0.02, 0.04, '#3a3026');
  M.buildIfAny(gp, { rough: 0.85 });
  for (const [x, z, h] of [[0.36, 0.0, 0.2], [0.38, 0.12, 0.16], [-0.38, 0.12, 0.15]]) cypress(gp, x, gy(x, z), z, h, '#2f5a36');
  leafTree(gp, 0.3, gy(0.3, -0.12), -0.12, 0.12, '#4a7a3a', 3);
  crowd(gp, 4, 61, i => { const x = 0.12 + i * 0.03, z = 0.17 + (i % 2) * 0.02; return [x, gy(x, z), z]; }, 1.2);
};

// ---- Flame Towers, Baku: three flame-shaped glass towers on the hill above the Caspian ---------------------
const flametowers: Builder = gp => {
  const sea = (x: number, z: number) => z - 0.03 * Math.sin(x * 5) > 0.36;
  const hf: HFn = (x, z) => sea(x, z) ? -0.02 : 0.05 * sstep(0.25, -0.05, z) + 0.003 * qn(x * 10, 3, z * 10);
  ground(gp, hf, '#8aa35a', (x, y, z) => {
    if (y < Y0 - 0.015) return rip('#3b7ea8', x, z);
    if (z > 0.26) return (Math.abs(z - 0.3) < 0.012) ? '#5f5f63' : '#cfc7b4';
    if (y > Y0 + 0.045 && Math.hypot(x, z + 0.06) < 0.24) return '#c9c2b2';
    return mix('#7f9a50', '#94a95c', qn(x * 9, 0, z * 9));
  }, 16, 56, strataSide(['#a08a6a', '#8f7a5c', '#b09a78']));
  const gy = onGround(hf), M = new Mesher();
  const Yt = Y0 + 0.05;
  // Each tower: rounded-triangle plan, swelling slightly then tapering to a pointed, outward-leaning tip
  const tower = (x: number, z: number, H: number, R: number, ang: number) => {
    const dir: [number, number] = [Math.cos(ang), Math.sin(ang)], rings: V3[][] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = Yt + t * H, s = R * (1 + 0.1 * Math.sin(Math.PI * t * 0.9)) * (t < 0.55 ? 1 : Math.max(0.02, 1 - ((t - 0.55) / 0.45) ** 1.6));
      const off = R * 0.85 * (t < 0.55 ? 0 : ((t - 0.55) / 0.45) ** 1.6);
      const ring: V3[] = [];
      for (let j = 0; j < 15; j++) {
        const ph = (j / 15) * Math.PI * 2, rr = s * (1 + 0.16 * Math.cos(3 * (ph - ang)));
        ring.push([x + dir[0] * off + Math.cos(ph) * rr, y, z + dir[1] * off + Math.sin(ph) * rr]);
      }
      rings.push(ring);
    }
    skin(gp, rings, '#3f7fb8', { caps: true, metal: 0.55, rough: 0.2, paint: (_x, y) => { const r = Math.floor((y - Yt) / H * N); return r === 15 || r === 9 ? '#24486a' : r % 2 ? '#4a8cc4' : '#3f7fb8'; } });
  };
  tower(0.02, -0.16, 0.44, 0.07, -Math.PI / 2 + 0.2);
  tower(-0.15, 0.0, 0.33, 0.058, Math.PI * 0.85);
  tower(0.16, 0.0, 0.32, 0.058, 0.25);
  // Faceted stone podium buildings between the towers
  const pod = (plan: [number, number][], h: number) => prism(gp, plan, Yt - 0.004, h, '#a7ab90');
  pod([[-0.1, 0.05], [0.0, 0.08], [0.1, 0.05], [0.08, -0.05], [-0.08, -0.05]], 0.05);
  pod([[-0.2, 0.08], [-0.12, 0.12], [-0.08, 0.06], [-0.14, 0.02]], 0.035);
  pod([[0.08, 0.06], [0.14, 0.12], [0.22, 0.08], [0.18, 0.03]], 0.035);
  for (let k = 0; k < 6; k++) M.rect([-0.07 + k * 0.028, Yt + 0.006, 0.066 + 0.012 * Math.sin(k)], [1, 0], [0, 1], 0.02, 0.03, '#2b3f52');
  // Steps and the seaside boulevard
  for (let k = 0; k < 6; k++) M.box(0, Y0 + 0.05 - k * 0.008, 0.16 + k * 0.016, 0.12, 0.004, 0.016, '#d8d2c4');
  for (let k = 0; k < 8; k++) { const x = -0.38 + k * 0.11, z = 0.33; M.cyl(x, Y0, z, 0.0016, 0.0016, 0.04, 4, '#3a3a3a', null); M.cyl(x, Y0 + 0.04, z, 0.004, 0.004, 0.004, 6, '#f2e6b0'); }
  M.buildIfAny(gp, { rough: 0.6 });
  const car = (x: number, c: string) => { box(gp, c, x, Y0 + 0.006, 0.3, 0.032, 0.01, 0.016); box(gp, '#2b3a44', x - 0.003, Y0 + 0.014, 0.3, 0.018, 0.006, 0.014); };
  car(-0.2, '#f2f2f2'); car(0.06, '#c62828'); car(0.25, '#1f1f1f');
  for (const [x, z] of [[-0.32, 0.08], [-0.3, -0.12], [0.3, -0.14], [0.33, 0.1], [-0.18, 0.2], [0.2, 0.2]]) leafTree(gp, x, gy(x, z), z, 0.07, '#4a7a3a', Math.round(x * 30));
  crowd(gp, 5, 71, i => { const x = -0.12 + i * 0.06, z = 0.27; return [x, Y0, z]; }, 1.2);
};

// ---- Rila Monastery: striped Nativity church, Hrelyo's Tower and arcaded wings below forested mountains ------
const RW = '#f3eee3', RR = '#a8473a', RD = '#2f2b28';
function rilaWing(p: THREE.Object3D, M: Mesher, a: [number, number], b: [number, number], y: number, h: number, d: number): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ry = -Math.atan2(dz, dx);
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = -uz, nz = ux; // inward normal (toward the courtyard)
  M.box(mx, y, mz, L, h, d, RW, ry);
  const o: V3 = [mx + nx * (d / 2 + 0.0005), y, mz + nz * (d / 2 + 0.0005)];
  const n = Math.max(2, Math.round(L / 0.026));
  M.windows(o, [ux, uz], [nx, nz], n, L / n, [0.006, h * 0.36, h * 0.66], L / n * 0.62, h * 0.18, '#4a3a30', RD, true);
  for (const f of [0.33, 0.63]) M.box(mx + nx * (d / 2 + 0.003), y + h * f, mz + nz * (d / 2 + 0.003), L, 0.004, 0.008, '#6b4a32', ry);
  gable(p, L + 0.01, 0.035, d + 0.016, RR, mx, y + h, mz, ry);
}
const rila: Builder = gp => {
  const hf: HFn = (x, z) => 0.26 * sstep(-0.18, -0.5, z) * (0.7 + 0.3 * Math.sin(x * 6 + 1)) + 0.06 * sstep(0.3, 0.5, Math.abs(x)) * sstep(0.0, -0.3, z) + 0.004 * qn(x * 10, 2, z * 10);
  ground(gp, hf, '#cfc6b6', (x, y, z) => {
    if (y > Y0 + 0.012) return mix('#3f6f36', '#2f5a2c', qn(x * 12, y * 10, z * 12));
    return (Math.floor(x * 50) + Math.floor(z * 50)) % 2 ? '#d6cebe' : '#cbc2b0';
  }, 16, 56, strataSide(['#6b5a46', '#5a4a38', '#7a6852']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  // Residential wings wrapping the courtyard (open toward the viewer)
  const ring: [number, number][] = [[-0.42, 0.12], [-0.4, -0.08], [-0.3, -0.22], [-0.1, -0.3], [0.12, -0.3], [0.31, -0.2], [0.4, -0.04], [0.41, 0.12]];
  for (let k = 0; k < ring.length - 1; k++) rilaWing(gp, M, ring[k], ring[k + 1], Y - 0.004, 0.12, 0.06);
  // Hrelyo's Tower
  const hx = 0.17, hz = -0.15;
  M.box(hx, Y - 0.004, hz, 0.06, 0.2, 0.06, '#b8ab96', 0, '#a89a84');
  for (let r = 0; r < 4; r++) M.windows([hx, Y + 0.04 + r * 0.04, hz + 0.0305], [1, 0], [0, 1], 2, 0.022, [0], 0.006, 0.012, '#2a2622', undefined, true);
  M.box(hx, Y + 0.196, hz, 0.066, 0.008, 0.066, '#9c8e78');
  M.box(hx, Y + 0.204, hz, 0.05, 0.025, 0.05, RW);
  M.windows([hx, Y + 0.206, hz + 0.0255], [1, 0], [0, 1], 3, 0.015, [0], 0.009, 0.014, '#3a3028', RD, true);
  hip(gp, '#7d7a76', hx, Y + 0.229, hz, 0.064, 0.064, 0.03);
  cone(gp, '#d9b44a', hx, Y + 0.258, hz, 0.003, 0.016, 4);
  // Nativity church: striped walls, arcaded gallery, five domes on drums
  const cx = -0.05, cz = 0.04, W = 0.24, D = 0.13;
  M.box(cx, Y - 0.004, cz, W, 0.08, D, '#e9dfcf');
  for (let k = 0; k < 7; k++) {
    const yy = Y + 0.05 + k * 0.004;
    M.rect([cx, yy, cz + D / 2 + 0.0006], [1, 0], [0, 1], W, 0.002, k % 2 ? RW : '#b5523e');
    M.rect([cx + W / 2 + 0.0006, yy, cz], [0, -1], [1, 0], D, 0.002, k % 2 ? RW : '#b5523e');
  }
  // gallery with black-and-white striped arches on front and side
  M.box(cx, Y - 0.004, cz + D / 2 + 0.018, W + 0.04, 0.05, 0.036, RW, 0, '#8d8b88');
  M.windows([cx, Y - 0.004, cz + D / 2 + 0.0362], [1, 0], [0, 1], 8, (W + 0.04) / 8, [0.006], 0.018, 0.024, '#9c5a42', RD, true);
  M.box(cx + W / 2 + 0.018, Y - 0.004, cz + 0.006, 0.036, 0.05, D + 0.012, RW, 0, '#8d8b88');
  M.windows([cx + W / 2 + 0.0362, Y - 0.004, cz + 0.006], [0, -1], [1, 0], 4, (D + 0.012) / 4, [0.006], 0.018, 0.024, '#9c5a42', RD, true);
  for (let k = 0; k < 9; k++) M.rect([cx - W / 2 - 0.02 + k * (W + 0.04) / 8, Y - 0.004, cz + D / 2 + 0.0365], [1, 0], [0, 1], 0.004, 0.044, k % 2 ? RD : RW);
  for (let k = 0; k < 5; k++) dome(gp, '#8f949a', cx - W / 2 + 0.01 + k * 0.05, Y + 0.046, cz + D / 2 + 0.018, 0.014, 0.01, 8);
  const drum = (x: number, z: number, r: number, h: number, y: number) => {
    M.cyl(x, y, z, r, r, h, 10, '#e6c35a', null, 0, i => (i % 2 ? '#e6c35a' : '#b5523e'));
    for (let k = 0; k < 10; k++) { const a = ((k + 0.5) / 10) * Math.PI * 2; M.rect([x + Math.cos(a) * r * 0.97, y + h * 0.2, z + Math.sin(a) * r * 0.97], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], r * 0.3, h * 0.55, '#2a2420'); }
    dome(gp, '#9aa0a6', x, y + h, z, r * 1.08, r * 0.95, 10, { metal: 0.3, rough: 0.5 });
    rod(gp, [x, y + h + r * 0.9, z], [x, y + h + r * 0.9 + 0.03, z], 0.0016, '#d9b44a', 4);
    box(gp, '#d9b44a', x, y + h + r * 0.9 + 0.02, z, 0.014, 0.002, 0.002);
  };
  drum(cx, cz, 0.042, 0.06, Y + 0.076);
  drum(cx - 0.085, cz, 0.03, 0.036, Y + 0.076);
  drum(cx + 0.085, cz, 0.03, 0.036, Y + 0.076);
  M.box(cx, Y + 0.076, cz, W - 0.02, 0.006, D - 0.02, '#8f949a');
  M.buildIfAny(gp, { rough: 0.8 });
  // Forested mountainside
  for (let k = 0; k < 16; k++) {
    const x = -0.42 + (k % 8) * 0.12 + (hash3(k, 1, 9) - 0.5) * 0.05, z = -0.36 - Math.floor(k / 8) * 0.06 + (hash3(k, 2, 9) - 0.5) * 0.03;
    if (Math.hypot(x, z) < 0.47) pine(gp, x, gy(x, z), z, 0.07 + hash3(k, 3, 9) * 0.03, k % 2 ? '#2f5a36' : '#3a6a3e');
  }
  pine(gp, 0.12, Y, 0.0, 0.16, '#2f5a36');
  crowd(gp, 7, 81, i => { const x = -0.25 + i * 0.075, z = 0.2 + (i % 3) * 0.04; return [x, Y, z]; }, 1.2);
};

// ---- Trakai Island Castle: red-brick Gothic castle on an island, wooden footbridge across Lake Galvė --------
const TB = '#b5523b', TS = '#8f8a82', TR = '#9b3a2a';
const trakai: Builder = gp => {
  const isl = (x: number, z: number) => Math.hypot((x - 0.01) / 1.15, (z + 0.06) / 0.9) + 0.03 * Math.sin(Math.atan2(z, x) * 5) < 0.3;
  const shore = (z: number, x: number) => z > 0.43 - 0.02 * Math.sin(x * 8);
  const hf: HFn = (x, z) => (isl(x, z) || shore(z, x)) ? 0.004 * qn(x * 12, 1, z * 12) : -0.022;
  ground(gp, hf, '#5f8f3e', (x, y, z) => {
    if (y < Y0 - 0.016) return rip('#3d6f8e', x, z);
    if (y < Y0 - 0.004) return '#8a9a5a';
    if (Math.abs(x + 0.005) < 0.012 && z > 0.06) return '#9a9284';
    return mix('#5f8f3e', '#4f7f34', qn(x * 10, 0, z * 10));
  }, 16, 56, strataSide(['#6b5a40', '#5a4a36', '#7a684c']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  const wall = (a: [number, number], b: [number, number], h: number) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    M.box(mx, Y - 0.004, mz, L, h * 0.45, 0.016, TS, ry);
    M.box(mx, Y - 0.004 + h * 0.45, mz, L, h * 0.55, 0.014, TB, ry);
    gable(gp, L, 0.012, 0.022, TR, mx, Y - 0.004 + h, mz, ry);
  };
  const rtower = (x: number, z: number, r: number, h: number) => {
    M.cyl(x, Y - 0.004, z, r * 1.04, r, h * 0.45, 14, TS, null);
    M.cyl(x, Y - 0.004 + h * 0.45, z, r, r, h * 0.55, 14, TB, null);
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.6; M.rect([x + Math.cos(a) * r * 1.01, Y + h * 0.7, z + Math.sin(a) * r * 1.01], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.006, 0.012, '#3a2420'); }
    M.cyl(x, Y - 0.004 + h, z, r * 1.15, 0, r * 2.2, 14, TR);
  };
  // Outer bailey (forecastle): front curtain wall with gate tower and round corner towers
  const F = 0.1;
  wall([-0.17, F], [-0.03, F], 0.07); wall([0.03, F], [0.17, F], 0.07);
  wall([-0.19, F - 0.02], [-0.2, -0.1], 0.065); wall([0.19, F - 0.02], [0.2, -0.1], 0.065);
  rtower(-0.18, F, 0.032, 0.1); rtower(0.18, F, 0.032, 0.1); rtower(-0.2, -0.11, 0.028, 0.09);
  M.box(0, Y - 0.004, F, 0.06, 0.04, 0.05, TS); M.box(0, Y + 0.036, F, 0.06, 0.07, 0.05, TB);
  M.rect([0, Y - 0.004, F + 0.0256], [1, 0], [0, 1], 0.022, 0.04, '#3a2a22');
  M.tri([-0.011, Y + 0.036, F + 0.0256], [0.011, Y + 0.036, F + 0.0256], [0, Y + 0.048, F + 0.0256], '#3a2a22', [0, 0, 1]);
  M.windows([0, Y + 0.036, F + 0.0255], [1, 0], [0, 1], 3, 0.016, [0.03], 0.006, 0.014, '#3a2420', '#d9d0c0');
  hip(gp, TR, 0, Y + 0.106, F, 0.068, 0.058, 0.05, 0.03, 0.002);
  // Island castle: palace wing with a steep roof and the tall donjon
  const PZ = -0.15;
  M.box(-0.06, Y - 0.004, PZ, 0.2, 0.04, 0.08, TS); M.box(-0.06, Y + 0.036, PZ, 0.2, 0.065, 0.08, TB);
  M.windows([-0.06, Y + 0.036, PZ + 0.0405], [1, 0], [0, 1], 6, 0.03, [0.012, 0.038], 0.01, 0.016, '#3a2420', '#e0d6c4', true);
  gable(gp, 0.21, 0.06, 0.088, TR, -0.06, Y + 0.101, PZ);
  const dx = 0.09, dz = -0.17;
  M.box(dx, Y - 0.004, dz, 0.07, 0.06, 0.07, TS); M.box(dx, Y + 0.056, dz, 0.066, 0.15, 0.066, TB);
  for (let r = 0; r < 3; r++) M.windows([dx, Y + 0.08 + r * 0.04, dz + 0.0335], [1, 0], [0, 1], 2, 0.024, [0], 0.008, 0.018, '#3a2420', '#e0d6c4', true);
  M.windows([dx + 0.0335, Y + 0.12, dz], [0, -1], [1, 0], 2, 0.024, [0], 0.008, 0.018, '#3a2420', '#e0d6c4', true);
  hip(gp, TR, dx, Y + 0.206, dz, 0.076, 0.076, 0.06, 0.03, 0.002);
  wall([-0.17, -0.1], [-0.16, PZ], 0.06); wall([0.16, -0.1], [0.13, dz], 0.06);
  // Courtyard path, footbridge across the water to the shore, jetties
  for (let k = 0; k < 18; k++) {
    const z = 0.24 + k * 0.012;
    M.box(-0.005, Y + 0.003, z, 0.026, 0.004, 0.01, k % 2 ? '#a07a52' : '#94704a');
    if (k % 3 === 0) for (const s of [-1, 1]) { M.box(-0.005 + s * 0.013, Y - 0.025, z, 0.004, 0.032, 0.004, '#6b5034'); M.box(-0.005 + s * 0.013, Y + 0.007, z, 0.002, 0.012, 0.002, '#6b5034'); }
  }
  for (const s of [-1, 1]) M.box(-0.005 + s * 0.013, Y + 0.017, 0.34, 0.002, 0.002, 0.21, '#6b5034');
  for (const [x, z, ry] of [[-0.18, 0.24, 0.5], [0.17, 0.24, -0.4]]) M.box(x, Y - 0.004, z, 0.07, 0.008, 0.016, '#94704a', ry);
  M.buildIfAny(gp, { rough: 0.85 });
  // Trees on the island and the far shore, a boat
  for (const [x, z, s] of [[-0.27, 0.0, 0.1], [-0.25, 0.12, 0.09], [0.26, 0.04, 0.1], [0.24, 0.15, 0.08], [0.22, -0.12, 0.11], [-0.28, -0.12, 0.09], [-0.12, 0.2, 0.07], [0.12, 0.2, 0.07]]) leafTree(gp, x, gy(x, z), z, s, '#3f7a35', Math.round(x * 50 + z * 20));
  for (const [x, z] of [[-0.3, 0.44], [-0.18, 0.46], [0.22, 0.45], [0.33, 0.42]]) leafTree(gp, x, gy(x, z), z, 0.07, '#4a8a3a', Math.round(x * 40));
  const bt = grp(gp, 0.14, Y - 0.02, 0.36, 0.5);
  box(bt, '#f2f2f2', 0, 0.004, 0, 0.06, 0.01, 0.022); box(bt, '#d6336c', 0, 0.014, 0, 0.034, 0.012, 0.02);
  crowd(gp, 4, 91, i => [-0.005 + (i % 2 ? 0.006 : -0.006), Y + 0.005, 0.28 + i * 0.03], 1.1);
};

// ---- Lake Bled: island church with its tall bell tower in an emerald lake, castle on the cliff -------------
const bled: Builder = gp => {
  const isl = (x: number, z: number) => Math.hypot(x - 0.02, (z - 0.02) * 1.15) < 0.13;
  const lakeR = (x: number, z: number) => Math.hypot(x / 1.05, z / 0.9) + 0.03 * Math.sin(Math.atan2(z, x) * 4 + 1);
  const hf: HFn = (x, z) => {
    if (isl(x, z)) return 0.014 + 0.03 * Math.max(0, 1 - Math.hypot(x - 0.02, z - 0.01) / 0.12);
    const r = lakeR(x, z);
    if (r < 0.36) return -0.02;
    return 0.02 + 0.03 * qn(x * 8, 0, z * 8) + 0.16 * Math.exp(-((x + 0.25) ** 2 + (z + 0.33) ** 2) / 0.006);
  };
  ground(gp, hf, '#3f7a3a', (x, y, z, _nx, ny) => {
    if (y < Y0 - 0.014) return rip(mix('#2a9a8f', '#1d7f86', qn(x * 6, 0, z * 6)), x, z);
    if (ny < 0.6) return mix('#9a958a', '#b5b0a5', qn(x * 9, y * 20, z * 9));
    return mix('#3f7a3a', '#2f6a32', qn(x * 10, y * 10, z * 10));
  }, 18, 56, strataSide(['#6b5a46', '#5a4a38', '#7a6852']));
  const gy = onGround(hf), M = new Mesher();
  // Church of the Assumption: nave, apse, bell tower with a dark spire, provost house
  const cx = 0.02, cy = Y0 + 0.042, cz = -0.01;
  M.box(cx - 0.02, cy, cz, 0.1, 0.05, 0.05, '#f6f2ea');
  gable(gp, 0.104, 0.03, 0.058, '#b4553b', cx - 0.02, cy + 0.05, cz);
  M.cyl(cx - 0.07, cy, cz, 0.022, 0.022, 0.045, 8, '#f6f2ea', null, Math.PI / 8);
  M.cyl(cx - 0.07, cy + 0.045, cz, 0.026, 0, 0.022, 8, '#b4553b', undefined, Math.PI / 8);
  M.windows([cx - 0.02, cy, cz + 0.0255], [1, 0], [0, 1], 3, 0.026, [0.014], 0.008, 0.02, '#4a5866', undefined, true);
  const tx = cx + 0.045;
  M.box(tx, cy, cz, 0.036, 0.14, 0.036, '#f6f2ea');
  M.box(tx, cy + 0.1, cz, 0.04, 0.004, 0.04, '#e0d8c8');
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) M.windows([tx + nx * 0.0185, cy + 0.11, cz + nz * 0.0185], [nz === 0 ? 0 : nz, nx === 0 ? 0 : -nx], [nx, nz], 1, 0, [0], 0.012, 0.018, '#3a3a3a', undefined, true);
  M.windows([tx, cy, cz + 0.0185], [1, 0], [0, 1], 1, 0, [0.03, 0.06], 0.006, 0.012, '#4a5866');
  M.box(tx, cy + 0.14, cz, 0.04, 0.006, 0.04, '#e0d8c8');
  hip(gp, '#4b4f55', tx, cy + 0.146, cz, 0.038, 0.038, 0.016, 0.022, 0.022);
  hip(gp, '#4b4f55', tx, cy + 0.162, cz, 0.022, 0.022, 0.07);
  M.cyl(tx, cy + 0.23, cz, 0.0015, 0.0015, 0.014, 4, '#d9b44a', null);
  M.box(cx - 0.03, cy - 0.01, cz - 0.05, 0.07, 0.045, 0.04, '#efe6d2');
  hip(gp, '#b4553b', cx - 0.03, cy + 0.035, cz - 0.05, 0.076, 0.046, 0.025, 0.04, 0.004);
  // the 99 stone steps down to the south landing
  for (let k = 0; k < 12; k++) M.box(cx + 0.01, Y0 + 0.042 - k * 0.0035, 0.045 + k * 0.006, 0.05, 0.004, 0.007, '#d8d2c6');
  M.box(cx + 0.01, Y0 - 0.006, 0.12, 0.08, 0.008, 0.03, '#c9c2b4');
  // Bled Castle on its cliff (back-left)
  const kx = -0.25, kz = -0.33, ky = gy(kx, kz);
  M.box(kx, ky - 0.01, kz, 0.1, 0.04, 0.05, '#f0eadf', 0.4);
  M.box(kx + 0.04, ky - 0.01, kz + 0.02, 0.03, 0.06, 0.03, '#f0eadf', 0.4);
  M.windows([kx + 0.01, ky - 0.01, kz + 0.026], [Math.cos(0.4), -Math.sin(0.4)], [Math.sin(0.4), Math.cos(0.4)], 4, 0.02, [0.02], 0.006, 0.01, '#3a3a3a');
  gable(gp, 0.1, 0.022, 0.054, '#b4553b', kx, ky + 0.03, kz, 0.4);
  hip(gp, '#b4553b', kx + 0.04, ky + 0.05, kz + 0.02, 0.034, 0.034, 0.022, 0.002, 0.002, 0.4);
  // Pletna boats with striped awnings
  for (const [x, z, ry] of [[0.16, 0.2, 0.3], [-0.12, 0.22, -0.2], [0.25, -0.02, 1.2]]) {
    const q = grp(gp, x, Y0 - 0.018, z, ry);
    box(q, '#7a5232', 0, 0.004, 0, 0.07, 0.008, 0.02);
    cone(q, '#7a5232', 0.042, 0.006, 0, 0.008, 0.02, 4).rotation.z = -Math.PI / 2;
    for (let k = 0; k < 3; k++) box(q, k % 2 ? '#f2f2f2' : '#c62828', -0.012 + k * 0.012, 0.022, 0, 0.012, 0.003, 0.022);
    for (const [sx, sz] of [[-0.02, 0.009], [0.02, 0.009], [-0.02, -0.009], [0.02, -0.009]]) box(q, '#5a3a22', sx, 0.014, sz, 0.002, 0.012, 0.002);
  }
  M.buildIfAny(gp, { rough: 0.8 });
  // Trees on the island and forested shores
  for (const [x, z, s] of [[-0.05, 0.06, 0.06], [0.09, 0.07, 0.055], [-0.07, -0.04, 0.06], [0.11, -0.05, 0.05], [0.05, -0.09, 0.05], [-0.09, 0.01, 0.05]]) leafTree(gp, x, gy(x, z), z, s, '#3f7a35', Math.round(x * 90 + z * 40));
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + hash3(k, 1, 5) * 0.2, r = 0.41 + hash3(k, 2, 5) * 0.05, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x + 0.25, z + 0.33) < 0.08) continue;
    pine(gp, x, gy(x, z), z, 0.06 + hash3(k, 3, 5) * 0.03, k % 2 ? '#2f5a36' : '#3a6a3e');
  }
  crowd(gp, 3, 95, i => [0.0 + i * 0.016, Y0 + 0.002, 0.12], 1.1);
};

// ---- Palacio Salvo, Montevideo: eclectic skyscraper with a turreted, domed tower over Plaza Independencia -----
const PS = '#c3baa8', PSD = '#a89f8e', PSL = '#d8d0c0', MAN = '#4a5260';
const salvo: Builder = gp => {
  ground(gp, () => 0, '#bfb7a8', (x, _y, z) => {
    if (z > 0.06 && z < 0.12) return '#5f5f63';
    if (z >= 0.12 && Math.hypot(x, z - 0.32) < 0.12) return '#cfc6b4';
    if (z >= 0.12) return hv(x * 40, 0, z * 40) > 0.5 ? '#6f9a4a' : '#7fa856';
    return '#bfb7a8';
  }, 12, 48, strataSide(['#8a8276', '#7a7266']));
  const Y = Y0, M = new Mesher();
  // Main block: arcaded base, window grid, cornice and a dark mansard with dormers
  const BW = 0.5, BD = 0.22, BH = 0.16, bz = -0.1;
  M.box(0, Y, bz, BW, BH, BD, PS, 0, PSD);
  M.box(0, Y, bz, BW + 0.004, 0.022, BD + 0.004, PSD);
  M.windows([0, Y, bz + BD / 2 + 0.0025], [1, 0], [0, 1], 14, BW / 14, [0.002], 0.022, 0.012, '#2a2a2e', undefined, true);
  M.windows([0, Y, bz + BD / 2 + 0.0005], [1, 0], [0, 1], 16, BW / 16, [0.03, 0.048, 0.066, 0.084, 0.102, 0.12], 0.012, 0.011, '#3a3f48', PSL);
  M.windows([BW / 2 + 0.0005, Y, bz], [0, -1], [1, 0], 7, BD / 7, [0.03, 0.048, 0.066, 0.084, 0.102, 0.12], 0.012, 0.011, '#3a3f48', PSL);
  M.windows([-BW / 2 - 0.0005, Y, bz], [0, 1], [-1, 0], 7, BD / 7, [0.03, 0.048, 0.066, 0.084, 0.102, 0.12], 0.012, 0.011, '#3a3f48', PSL);
  for (const yy of [0.024, 0.138]) M.box(0, Y + yy, bz, BW + 0.006, 0.004, BD + 0.006, PSL);
  M.box(0, Y + BH - 0.004, bz, BW + 0.01, 0.006, BD + 0.01, PSL);
  tbox(gp, BW, BD, BW - 0.04, BD - 0.04, 0.035, MAN, 0, Y + BH + 0.002, bz);
  for (let k = 0; k < 10; k++) { const x = -0.21 + k * 0.047; if (Math.abs(x) < 0.08) continue; M.box(x, Y + BH + 0.006, bz + BD / 2 - 0.012, 0.016, 0.022, 0.012, PSL); M.rect([x, Y + BH + 0.01, bz + BD / 2 - 0.0058], [1, 0], [0, 1], 0.008, 0.012, '#2a2e36'); }
  // Tower shaft rising from the front of the block
  const TX = 0, TZ = -0.02, TW = 0.13;
  M.box(TX, Y, TZ, TW, 0.31, TW, PS, 0, PSD);
  M.rect([TX, Y + 0.022, TZ + TW / 2 + 0.0008], [1, 0], [0, 1], 0.06, 0.05, PSD);
  M.windows([TX, Y + 0.022, TZ + TW / 2 + 0.0012], [1, 0], [0, 1], 1, 0, [0], 0.05, 0.03, '#3a3f48', undefined, true);
  const rows: number[] = []; for (let r = 0.18; r < 0.3; r += 0.018) rows.push(r);
  for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0]]) M.windows([TX + nx * (TW / 2 + 0.0005), Y, TZ + nz * (TW / 2 + 0.0005)], [nz === 0 ? 0 : 1, nx === 0 ? 0 : -nx], [nx, nz], 4, TW / 4.6, rows, 0.011, 0.011, '#3a3f48', PSL);
  for (const yy of [0.165, 0.245]) M.box(TX, Y + yy, TZ, TW + 0.012, 0.006, TW + 0.012, PSL);
  // Corbelled balcony and the turreted upper stage
  M.cyl(TX, Y + 0.3, TZ, TW * 0.5, TW * 0.78, 0.014, 8, PSD, PSL, Math.PI / 8);
  M.box(TX, Y + 0.314, TZ, TW - 0.01, 0.07, TW - 0.01, PS);
  for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) M.windows([TX + nx * ((TW - 0.01) / 2 + 0.0005), Y + 0.314, TZ + nz * ((TW - 0.01) / 2 + 0.0005)], [nz === 0 ? 0 : nz, nx === 0 ? 0 : -nx], [nx, nz], 3, 0.03, [0.014, 0.04], 0.012, 0.016, '#3a3f48', PSL, true);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = TX + sx * TW * 0.52, z = TZ + sz * TW * 0.52;
    M.cyl(x, Y + 0.27, z, 0.006, 0.016, 0.03, 8, PSD, null);
    M.cyl(x, Y + 0.3, z, 0.016, 0.016, 0.1, 8, PS, null);
    M.cyl(x, Y + 0.355, z, 0.019, 0.019, 0.006, 8, PSL);
    dome(gp, PSD, x, Y + 0.4, z, 0.017, 0.028, 8);
    M.cyl(x, Y + 0.426, z, 0.003, 0, 0.014, 5, PSD);
  }
  M.box(TX, Y + 0.384, TZ, TW + 0.004, 0.008, TW + 0.004, PSL);
  // Round upper stage, lantern balcony, crown dome and spire
  M.cyl(TX, Y + 0.392, TZ, 0.048, 0.046, 0.06, 12, PS, null);
  for (let k = 0; k < 12; k++) { const a = ((k + 0.5) / 12) * Math.PI * 2; M.rect([TX + Math.cos(a) * 0.0475, Y + 0.405, TZ + Math.sin(a) * 0.0475], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.01, 0.022, '#3a3f48'); }
  M.cyl(TX, Y + 0.452, TZ, 0.054, 0.054, 0.006, 12, PSL);
  dome(gp, PS, TX, Y + 0.458, TZ, 0.046, 0.05, 12);
  M.cyl(TX, Y + 0.5, TZ, 0.012, 0.012, 0.018, 8, PSL);
  M.cyl(TX, Y + 0.518, TZ, 0.014, 0, 0.03, 8, PSD);
  // Plaza Independencia: Artigas equestrian statue, palms, street lamps
  M.box(0, Y, 0.32, 0.05, 0.03, 0.03, '#8a8a86');
  M.buildIfAny(gp, { rough: 0.75 });
  const st = grp(gp, 0, Y + 0.03, 0.32, 0.3);
  blob(st, '#3d4a3a', 0, 0.022, 0, 0.022, 0.011, 0.009); blob(st, '#3d4a3a', 0.022, 0.034, 0, 0.008, 0.01, 0.006);
  for (const [lx, lz] of [[0.012, 0.005], [0.012, -0.005], [-0.012, 0.005], [-0.012, -0.005]]) rod(st, [lx, 0.016, lz], [lx, 0, lz], 0.002, '#3d4a3a', 4);
  cyl(st, '#3d4a3a', 0, 0.03, 0, 0.005, 0.02, 6); pebble(st, '#3d4a3a', 0, 0.054, 0, 0.005);
  for (const [x, z] of [[-0.3, 0.2], [-0.18, 0.27], [0.18, 0.27], [0.3, 0.2], [-0.32, 0.36], [0.32, 0.36], [-0.12, 0.42], [0.12, 0.42]]) palm(gp, x, Y, z, 0.13, 0.04, hash3(x * 10, z * 10, 5) * 6, '#2f6a32', Math.round(x * 100 + z * 10), 9);
  for (const x of [-0.4, -0.2, 0.2, 0.4]) { rod(gp, [x, Y, 0.13], [x, Y + 0.05, 0.13], 0.0015, '#2a2a2a', 4); pebble(gp, '#f5f1e0', x, Y + 0.052, 0.13, 0.005); }
  const car = (x: number, c: string, ry: number) => { const q = grp(gp, x, Y, 0.09, ry); box(q, c, 0, 0.007, 0, 0.034, 0.01, 0.017); box(q, '#2b3a44', -0.003, 0.015, 0, 0.018, 0.007, 0.015); };
  car(-0.25, '#2f6fb3', 0); car(0.1, '#f2f2f2', Math.PI); car(0.3, '#c62828', 0);
  crowd(gp, 6, 99, i => { const x = -0.1 + i * 0.04, z = 0.22 + (i % 2) * 0.05; return [x, Y, z]; }, 1.2);
};

// ---- Cathedral of Brasília: sixteen hyperbolic concrete ribs crowned by a cross, glass in between ------------
const brasilia: Builder = gp => {
  const pool = (x: number, z: number) => { const r = Math.hypot(x, z); return r > 0.235 && r < 0.36 && z < 0.12; };
  const hf: HFn = (x, z) => (pool(x, z) ? -0.01 : 0);
  ground(gp, hf, '#c9b58f', (x, y, z) => {
    if (y < Y0 - 0.006) return rip('#4f9cc4', x, z);
    const r = Math.hypot(x, z);
    if (r > 0.38) return Math.abs(x) < 0.05 && z > 0 ? '#d9d2c4' : mix('#6a9a42', '#5a8a3a', qn(x * 9, 2, z * 9));
    if (r > 0.36 || (z > 0.12 && r > 0.24)) return hv(x * 40, 1, z * 40) > 0.5 ? '#d2c7b0' : '#c9bda4';
    return '#d9d2c4';
  }, 16, 56, strataSide(['#9a8a72', '#8a7a62']));
  const Y = Y0, M = new Mesher();
  const W = 0.19, A = 0.058, Bk = (0.2 ** 2 - A * A) ** 0.5 / W;
  const rad = (y: number) => Math.sqrt(A * A + (Bk * (y - W)) ** 2);
  // Glass shell between the ribs (up to the waist ring)
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const y = (i / 8) * W; prof.push([rad(y) - 0.004, y]); }
  prof.push([0.001, W]);
  plathe(gp, prof, 0, Y, 0, 32, '#5a8fc4', (x, y, z) => {
    const a = Math.atan2(z, x), k = Math.floor((a / (Math.PI * 2)) * 32 + 32);
    return (k + Math.floor(y * 60)) % 3 === 0 ? '#79aedb' : k % 2 ? '#4a7fb6' : '#5a8fc4';
  }, { metal: 0.4, rough: 0.25 });
  // Sixteen boomerang ribs
  for (let k = 0; k < 16; k++) {
    const th = (k / 16) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), rings: V3[][] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, y = t * 0.33, r = rad(y), w = 0.006 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.05)), d = 0.008 + 0.012 * Math.sin(Math.PI * t) ** 0.7;
      const tip = t > 0.93 ? (1 - t) / 0.07 : 1, ww = w * Math.max(0.15, tip), dd = d * Math.max(0.15, tip);
      rings.push([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [c * (r + v * dd / 2) - s * u * ww / 2, Y + y, s * (r + v * dd / 2) + c * u * ww / 2] as V3));
    }
    skin(gp, rings, '#f4f4f0', { caps: true, flat: true });
  }
  // Roof ring, cross and star
  M.cyl(0, Y + W - 0.004, 0, A + 0.006, A + 0.006, 0.008, 16, '#f4f4f0', '#e8e8e2');
  M.cyl(0, Y + W + 0.004, 0, 0.003, 0.003, 0.12, 4, '#9aa0a6', null);
  M.box(0, Y + W + 0.09, 0, 0.06, 0.0035, 0.0035, '#9aa0a6');
  for (let k = 0; k < 4; k++) M.box(0, Y + W + 0.0915, 0, 0.032, 0.0018, 0.0018, '#b8bec4', k * Math.PI / 4 + Math.PI / 8);
  // Campanile: slim concrete stem with a cross-arm holding four bells
  const cx = -0.4, cz = -0.02;
  M.box(cx, Y, cz, 0.01, 0.22, 0.03, '#f0f0ea');
  M.box(cx, Y + 0.17, cz, 0.012, 0.008, 0.11, '#f0f0ea');
  for (let k = 0; k < 4; k++) M.cyl(cx, Y + 0.15, cz - 0.045 + k * 0.03, 0.008, 0.005, 0.018, 8, '#b08a3a');
  // Four bronze evangelists on the approach
  for (let k = 0; k < 4; k++) {
    const x = -0.05 + k * 0.035, z = 0.3, q = grp(gp, x, Y, z, 0);
    frust(q, '#6e5228', 0, 0, 0, 0.011, 0.005, 0.048, 7); pebble(q, '#6e5228', 0, 0.054, 0, 0.0065); box(q, '#5e4420', 0, 0, 0, 0.026, 0.006, 0.026);
  }
  // Entrance ramp to the sunken doorway
  M.box(0, Y - 0.002, 0.27, 0.06, 0.003, 0.08, '#bfb8aa');
  M.buildIfAny(gp, { rough: 0.6 });
  for (const [x, z] of [[0.38, 0.2], [-0.4, -0.12], [0.4, -0.15]]) leafTree(gp, x, Y, z, 0.07, '#3f7a35', Math.round(x * 40));
  crowd(gp, 5, 111, i => { const x = 0.06 + i * 0.03, z = 0.33 + (i % 2) * 0.03; return [x, Y, z]; }, 1.2);
};

// ---- Nan Madol: crisscrossed basalt-log walls of a lagoon city on artificial islets, Pohnpei --------------
const BAS = '#3f3b3a';
function basaltWall(M: Mesher, a: [number, number], b: [number, number], y: number, h: number, t: number, seed: number): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, ry = -Math.atan2(dz, dx);
  const LH = 0.013, n = Math.round(h / LH);
  for (let l = 0; l < n; l++) {
    const yy = y + l * LH, col = shade(BAS, 0.88 + hash3(seed, l, 1) * 0.24);
    const taper = 1 - (l / n) * 0.25;
    if (l % 2 === 0) {
      // stretchers: long logs on both faces and a rubble core
      M.box((a[0] + b[0]) / 2, yy, (a[1] + b[1]) / 2, L, LH * 0.98, t * taper, col, ry, shade(col, 0.8));
    } else {
      // headers: logs laid across the wall, their ends sticking out on both faces
      const m = Math.max(2, Math.round(L / 0.021));
      for (let i = 0; i <= m; i++) {
        const f = (i + 0.5 * (hash3(seed, l, i) - 0.5)) / m, cx = a[0] + dx * Math.min(1, Math.max(0, f)), cz = a[1] + dz * Math.min(1, Math.max(0, f));
        const e = t * taper / 2 + 0.004;
        M.log([cx - nx * e, yy + LH / 2, cz - nz * e], [cx + nx * e, yy + LH / 2, cz + nz * e], LH * 0.5, shade(col, 0.95 + hash3(seed, l, i + 50) * 0.15));
      }
    }
  }
  // upswept corners: extra crisscross courses at both ends
  for (const [px, pz] of [a, b]) for (let l = 0; l < (h > 0.03 ? 3 : 1); l++) {
    const yy = y + n * LH + l * LH, e = t / 2 + 0.006;
    if (l % 2 === 0) M.log([px - ux * e, yy + LH / 2, pz - uz * e], [px + ux * e, yy + LH / 2, pz + uz * e], LH * 0.55, shade(BAS, 0.95));
    else M.log([px - nx * e, yy + LH / 2, pz - nz * e], [px + nx * e, yy + LH / 2, pz + nz * e], LH * 0.55, shade(BAS, 1.05));
  }
}
const nanmadol: Builder = gp => {
  const isl = (x: number, z: number) => (Math.abs(x) < 0.24 && Math.abs(z + 0.02) < 0.2) || (Math.abs(x + 0.33) < 0.08 && Math.abs(z - 0.2) < 0.07) || (Math.abs(x - 0.32) < 0.08 && Math.abs(z + 0.2) < 0.08);
  const hf: HFn = (x, z) => isl(x, z) ? 0.008 + 0.002 * qn(x * 20, 1, z * 20) : -0.016 - 0.01 * sstep(0.36, 0.48, Math.hypot(x, z));
  ground(gp, hf, '#6a8f3e', (x, y, z) => {
    if (y < Y0 - 0.018) return rip('#2f8fb0', x, z);
    if (y < Y0 - 0.008) return rip('#4fb3b8', x, z);
    return mix('#5f8a38', '#7a9a46', qn(x * 12, 0, z * 12));
  }, 18, 56, strataSide(['#4a4440', '#3d3836', '#5a524c']));
  const gy = onGround(hf), M = new Mesher(), Yb = Y0 + 0.004;
  // Outer enclosure of Nandauwas (gap for the sea gate in front)
  const X = 0.2, Z0 = -0.19, Z1 = 0.15;
  basaltWall(M, [-X, Z1], [-0.04, Z1], Yb, 0.066, 0.032, 1);
  basaltWall(M, [0.04, Z1], [X, Z1], Yb, 0.066, 0.032, 2);
  basaltWall(M, [X, Z1], [X, Z0], Yb, 0.077, 0.032, 3);
  basaltWall(M, [X, Z0], [-X, Z0], Yb, 0.088, 0.032, 4);
  basaltWall(M, [-X, Z0], [-X, Z1], Yb, 0.077, 0.032, 5);
  // Inner enclosure and the central tomb
  basaltWall(M, [-0.09, 0.04], [0.09, 0.04], Yb, 0.044, 0.024, 6);
  basaltWall(M, [0.09, 0.04], [0.09, -0.11], Yb, 0.044, 0.024, 7);
  basaltWall(M, [0.09, -0.11], [-0.09, -0.11], Yb, 0.055, 0.024, 8);
  basaltWall(M, [-0.09, -0.11], [-0.09, 0.04], Yb, 0.044, 0.024, 9);
  M.box(0, Yb, -0.035, 0.06, 0.012, 0.05, shade(BAS, 1.1));
  for (let k = 0; k < 5; k++) M.log([-0.03, Yb + 0.016, -0.055 + k * 0.01], [0.03, Yb + 0.016, -0.055 + k * 0.01], 0.0045, shade(BAS, 0.9 + k * 0.04));
  // Smaller islets with low platform walls
  basaltWall(M, [-0.4, 0.15], [-0.26, 0.15], Yb, 0.022, 0.02, 10); basaltWall(M, [-0.4, 0.26], [-0.26, 0.26], Yb, 0.022, 0.02, 11);
  basaltWall(M, [0.25, -0.27], [0.39, -0.27], Yb, 0.022, 0.02, 12); basaltWall(M, [0.39, -0.27], [0.39, -0.13], Yb, 0.022, 0.02, 13);
  // Steps up from the canal at the sea gate
  for (let k = 0; k < 3; k++) M.box(0, Yb - 0.012 + k * 0.006, Z1 + 0.04 - k * 0.012, 0.07, 0.006, 0.014, shade(BAS, 1.05));
  M.buildIfAny(gp, { rough: 0.95 });
  // Jungle: palms, breadfruit trees and ferns growing over the ruins
  for (const [x, z, h] of [[-0.14, -0.14, 0.17], [0.15, -0.06, 0.15], [0.13, 0.1, 0.14], [-0.15, 0.09, 0.15], [-0.34, 0.2, 0.13], [0.33, -0.2, 0.14]]) palm(gp, x, gy(x, z), z, h, 0.12, hash3(x * 10, z * 10, 7) * 6, '#4f8a3a', Math.round(x * 100 + z * 10), 7);
  for (const [x, z, s] of [[0.0, 0.09, 0.07], [-0.15, -0.02, 0.06], [0.15, -0.15, 0.07], [0.05, -0.15, 0.05], [-0.3, 0.22, 0.06]]) leafTree(gp, x, gy(x, z), z, s, '#3f7a35', Math.round(x * 70 + z * 30));
  for (let k = 0; k < 8; k++) { const x = (hash3(k, 1, 8) - 0.5) * 0.36, z = -0.15 + hash3(k, 2, 8) * 0.28; pebble(gp, shade('#5f9a3e', 0.9 + hash3(k, 3, 8) * 0.25), x, gy(x, z) + 0.006, z, 0.016, 0.01, 0.014); }
  // Outrigger canoe in the canal
  const cn = grp(gp, 0.12, Y0 - 0.018, 0.3, 0.3);
  blob(cn, '#7a5232', 0, 0.004, 0, 0.05, 0.006, 0.008);
  blob(cn, '#8a6242', 0, 0.002, 0.03, 0.035, 0.004, 0.004);
  for (const dx of [-0.015, 0.015]) box(cn, '#6a4a2a', dx, 0.008, 0.015, 0.003, 0.002, 0.032);
  person(cn, 0.01, 0.006, 0, '#ef4444', 2, 1.0);
};

// ---- Omar Ali Saifuddien Mosque, Bandar Seri Begawan: golden dome over a lagoon with the royal stone barge ---
const OW = '#f5f3ee', GOLD = '#e0b03a';
function goldDome(p: THREE.Object3D, x: number, y: number, z: number, r: number, seg = 12): void {
  plathe(p, [[0.001, 0], [r * 0.9, 0], [r, r * 0.35], [r * 0.95, r * 0.7], [r * 0.7, r * 1.05], [r * 0.35, r * 1.3], [r * 0.1, r * 1.5], [0.001, r * 1.62]], x, y, z, seg, GOLD, undefined, { metal: 0.7, rough: 0.25 });
}
const omaralimosque: Builder = gp => {
  const lagoon = (x: number, z: number) => z > -0.02 + 0.02 * Math.sin(x * 6) && Math.hypot(x, z) < 0.47;
  const hf: HFn = (x, z) => lagoon(x, z) ? -0.02 : 0.003 * qn(x * 10, 1, z * 10);
  ground(gp, hf, '#6f9a48', (x, y, z) => {
    if (y < Y0 - 0.012) return rip('#3c86b0', x, z);
    if (Math.abs(x) < 0.27 && z > -0.33 && z < -0.02) return '#e2ddd2';
    return mix('#6f9a48', '#5f8a3e', qn(x * 10, 0, z * 10));
  }, 16, 56, strataSide(['#6b5a46', '#5a4a38', '#7a6852']));
  const gy = onGround(hf), Y = Y0, M = new Mesher();
  // Prayer hall: two storeys with pointed-arch arcades, parapet and lagoon terrace
  const mx = 0.0, mz = -0.16;
  M.box(0, Y - 0.025, -0.01, 0.56, 0.028, 0.03, '#d8d2c4');
  M.box(mx, Y, mz, 0.3, 0.06, 0.16, OW);
  M.windows([mx, Y, mz + 0.0805], [1, 0], [0, 1], 11, 0.026, [0.008], 0.014, 0.03, '#4a5866', '#e8e2d4', true);
  M.windows([mx + 0.1505, Y, mz], [0, -1], [1, 0], 6, 0.025, [0.008], 0.014, 0.03, '#4a5866', '#e8e2d4', true);
  M.windows([mx - 0.1505, Y, mz], [0, 1], [-1, 0], 6, 0.025, [0.008], 0.014, 0.03, '#4a5866', '#e8e2d4', true);
  M.box(mx, Y + 0.06, mz, 0.31, 0.006, 0.17, '#e8e2d4');
  for (let k = 0; k < 22; k++) M.box(mx - 0.15 + k * 0.0143, Y + 0.066, mz + 0.083, 0.006, 0.008, 0.004, OW);
  M.box(mx, Y + 0.066, mz - 0.01, 0.18, 0.04, 0.11, OW);
  M.windows([mx, Y + 0.066, mz + 0.0455], [1, 0], [0, 1], 7, 0.024, [0.008], 0.012, 0.022, '#4a5866', undefined, true);
  // Drum and the golden onion dome
  M.cyl(mx, Y + 0.106, mz - 0.01, 0.05, 0.05, 0.036, 16, OW, null);
  for (let k = 0; k < 16; k++) { const a = ((k + 0.5) / 16) * Math.PI * 2; M.rect([mx + Math.cos(a) * 0.0503, Y + 0.112, mz - 0.01 + Math.sin(a) * 0.0503], [-Math.sin(a), Math.cos(a)], [Math.cos(a), Math.sin(a)], 0.008, 0.022, '#6b7d8f'); }
  M.cyl(mx, Y + 0.142, mz - 0.01, 0.054, 0.054, 0.005, 16, '#e8e2d4');
  goldDome(gp, mx, Y + 0.147, mz - 0.01, 0.05, 16);
  M.cyl(mx, Y + 0.226, mz - 0.01, 0.003, 0, 0.03, 6, GOLD);
  // Corner turrets with small gold cupolas
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = mx + sx * 0.152, z = mz + sz * 0.082;
    M.cyl(x, Y, z, 0.012, 0.011, 0.1, 8, OW, null);
    M.cyl(x, Y + 0.1, z, 0.015, 0.015, 0.004, 8, '#e8e2d4');
    goldDome(gp, x, Y + 0.104, z, 0.011, 8);
  }
  // Tall minaret (right) with balconies, a lantern stage and a golden cupola
  const nx = 0.21, nz = -0.24;
  M.box(nx, Y, nz, 0.034, 0.24, 0.034, OW);
  for (const yy of [0.1, 0.18, 0.24]) M.box(nx, Y + yy, nz, 0.046, 0.006, 0.046, '#e8e2d4');
  for (let r = 0; r < 4; r++) M.windows([nx, Y + 0.03 + r * 0.05, nz + 0.0175], [1, 0], [0, 1], 1, 0, [0], 0.008, 0.02, '#4a5866', undefined, true);
  M.cyl(nx, Y + 0.246, nz, 0.014, 0.014, 0.03, 8, OW, null);
  goldDome(gp, nx, Y + 0.276, nz, 0.016, 8);
  M.cyl(nx, Y + 0.3, nz, 0.002, 0, 0.016, 5, GOLD);
  // Royal barge (Mahligai): stone hull with a curled prow, three pavilions, bridge to the shore
  const bx = -0.17, bz = 0.15, hull: V3[][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = bx - 0.16 + t * 0.32, w = 0.045 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) + 0.004, d = 0.022;
    hull.push([[x, Y - 0.02, bz - w * 0.7], [x, Y - 0.02 + d, bz - w], [x, Y - 0.02 + d, bz + w], [x, Y - 0.02, bz + w * 0.7]]);
  }
  skin(gp, hull, '#e6dcc8', { caps: true, flat: true });
  rod(gp, [bx + 0.16, Y - 0.002, bz], [bx + 0.21, Y + 0.05, bz], 0.009, '#d9a441', 6);
  cone(gp, '#d9a441', bx + 0.215, Y + 0.05, bz, 0.01, 0.03, 6);
  M.box(bx, Y + 0.002, bz, 0.26, 0.006, 0.07, '#d9d2c4');
  for (const [px, s] of [[-0.09, 1], [0.0, 1.3], [0.09, 1]] as [number, number][]) {
    const x = bx + px;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box(x + sx * 0.018 * s, Y + 0.008, bz + sz * 0.02, 0.004, 0.03 * s, 0.004, '#f2ead8');
    M.box(x, Y + 0.008 + 0.03 * s, bz, 0.044 * s, 0.004, 0.048, '#d9a441');
    hip(gp, '#7b6f66', x, Y + 0.012 + 0.03 * s, bz, 0.05 * s, 0.054, 0.028 * s, 0.03 * s, 0.006);
    if (s > 1) { hip(gp, '#7b6f66', x, Y + 0.04 + 0.03 * s, bz, 0.03, 0.03, 0.03); cone(gp, '#d9a441', x, Y + 0.07 + 0.03 * s, bz, 0.004, 0.016, 5); }
  }
  for (let k = 0; k < 8; k++) M.box(bx + 0.04, Y - 0.006, -0.01 + k * 0.012, 0.02, 0.004, 0.012, '#d8d2c4');
  // Moored boat on the right
  M.buildIfAny(gp, { rough: 0.6 });
  const bt = grp(gp, 0.25, Y - 0.018, 0.12, -0.3);
  blob(bt, '#8a8f96', 0, 0.004, 0, 0.06, 0.008, 0.016);
  // Palms and trees around the mosque
  for (const [x, z, h] of [[0.36, -0.06, 0.15], [0.4, -0.18, 0.13], [-0.36, -0.12, 0.14], [-0.3, -0.26, 0.13], [0.3, -0.3, 0.12]]) palm(gp, x, gy(x, z), z, h, 0.06, hash3(x * 10, z * 10, 9) * 6, '#3f7d35', Math.round(x * 100 + z * 10), 7);
  for (const [x, z] of [[-0.12, -0.36], [0.1, -0.38], [-0.4, 0.0]]) leafTree(gp, x, gy(x, z), z, 0.08, '#3f6f35', Math.round(x * 50));
  crowd(gp, 4, 121, i => { const x = 0.0 + i * 0.03, z = -0.035; return [x, Y - 0.006, z]; }, 1.1);
};

export const H_LANDMARKS4: Record<string, Builder> = {
  lm4_meroe: meroe,
  lm4_leptis: leptis,
  lm4_fiat: fiat,
  lm4_maqam: maqam,
  lm4_aitbenhaddou: aitbenhaddou,
  lm4_burana: burana,
  lm4_erdenezuu: erdenezuu,
  lm4_shibam: shibam,
  lm4_nizwa: nizwa,
  lm4_baalbek: baalbek,
  lm4_flametowers: flametowers,
  lm4_rila: rila,
  lm4_trakai: trakai,
  lm4_bled: bled,
  lm4_salvo: salvo,
  lm4_brasilia: brasilia,
  lm4_nanmadol: nanmadol,
  lm4_omaralimosque: omaralimosque,
};
