import { humanSoup } from '../human.ts';
import * as THREE from 'three';
import {
  type Builder, type V3, type Paint, add, skin, sweep, mat, shade as shade0, mix, fbm, hash3,
} from '../prims.ts';
import { type HFn, island, ripple, strataSide, sstep } from '../nature.ts';
import { pblob } from '../animals.ts';
import { Mesh3, ID } from '../kit/euro.ts';

// Hero builders for: redeemer, burj, cntower, petra.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.
// Rigid parts are emitted into flat per-face-coloured Mesh3 batches (fast to build and bake); organic parts
// (statue, camels) use the smooth sweep/skin primitives.

const TAU = Math.PI * 2;
type P2 = [number, number];
const shadeMemo = new Map<string, string>();
const shade = (hex: string, f: number): string => {
  const k = hex + f.toFixed(3);
  let v = shadeMemo.get(k);
  if (v === undefined) { v = shade0(hex, f); shadeMemo.set(k, v); }
  return v;
};
const q = (v: number, s = 0.02) => Math.round(v / s) * s;

/**
 * Revolved profile [r, y] (bottom → top along the outside) about (x, y, z) with flat facets; colour may vary per
 * profile segment i and facet j (window bands, red/white antenna stripes, acanthus capitals).
 */
function rev(m: Mesh3, prof: P2[], x: number, y: number, z: number, n: number, c: string | ((i: number, j: number) => string), a0 = 0): void {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if (r0 < 1e-6 && r1 < 1e-6) continue;
    const len = Math.hypot(r1 - r0, y1 - y0) || 1, ny = (r0 - r1) / len, nr = (y1 - y0) / len;
    for (let j = 0; j < n; j++) {
      const a1 = a0 + (j / n) * TAU, a2 = a0 + ((j + 1) / n) * TAU, am = (a1 + a2) / 2;
      const cc = typeof c === 'string' ? c : c(i, j);
      const lit = shade(cc, q(0.93 + 0.1 * Math.cos(am - 2.2)));
      const P = (r: number, yy: number, a: number): V3 => [x + Math.cos(a) * r, y + yy, z + Math.sin(a) * r];
      const out: V3 = [Math.cos(am) * nr, ny, Math.sin(am) * nr];
      if (r0 < 1e-6) m.tri(P(r0, y0, a1), P(r1, y1, a2), P(r1, y1, a1), lit, out);
      else if (r1 < 1e-6) m.tri(P(r0, y0, a1), P(r0, y0, a2), P(r1, y1, a1), lit, out);
      else m.quad(P(r0, y0, a1), P(r0, y0, a2), P(r1, y1, a2), P(r1, y1, a1), lit, out);
    }
  }
}

/** Square-section member a→b of width w (lattice, rails, seams). */
function beam(m: Mesh3, a: V3, b: V3, w: number, c: string): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / l, dy / l, dz / l];
  const up: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: V3 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  const ul = Math.hypot(...u) || 1;
  u = [(u[0] / ul) * (w / 2), (u[1] / ul) * (w / 2), (u[2] / ul) * (w / 2)];
  const v: V3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const P = (o: V3, s: number, t: number): V3 => [o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t];
  for (const [s0, t0, s1, t1] of [[1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1]] as const) {
    const ox = (s0 + s1) / 2, oy = (t0 + t1) / 2, out: V3 = [u[0] * ox + v[0] * oy, u[1] * ox + v[1] * oy, u[2] * ox + v[2] * oy];
    m.quad(P(a, s0, t0), P(b, s0, t0), P(b, s1, t1), P(a, s1, t1), shade(c, out[1] > 0 ? 1.06 : 0.94), out);
  }
}

/** Horizontal polygon (any simple plan, CCW or CW) at height y, facing up (or down). */
function cap(m: Mesh3, pts: P2[], y: number, c: string, down = false): void {
  const v2 = pts.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(v2, [])) {
    m.tri([pts[a][0], y, pts[a][1]], [pts[b][0], y, pts[b][1]], [pts[d][0], y, pts[d][1]], c, [0, down ? -1 : 1, 0]);
  }
}

/** Tiny visitor for scale. */
function person(m: Mesh3, x: number, y: number, z: number, c: string, s = 1): void {
  humanSoup(m.pos, m.col, x, y, z, 0.0155 * s, 1, { top: c });
}

/** Low-poly broadleaf canopy (rainforest, parks). */
function bush(m: Mesh3, x: number, y: number, z: number, r: number, c: string): void {
  const a0 = hash3(x * 91, z * 37, 2) * TAU;
  m.prism(ID, x, y, z, r * 0.55, r * 0.55, 5, shade(c, 0.9), r, a0, false);
  m.prism(ID, x, y + r * 0.55, z, r, r * 0.75, 5, shade(c, 1.08), r * 0.35, a0, true);
}

/** Date palm: tapering trunk and drooping fronds. */
function palm(m: Mesh3, x: number, y: number, z: number, s: number): void {
  const h = 0.05 * s;
  m.prism(ID, x, y, z, 0.0022 * s, h, 5, '#8a6a48', 0.0016 * s);
  const a0 = hash3(x * 40, z * 40, 7) * TAU;
  for (let k = 0; k < 7; k++) {
    const a = a0 + (k / 7) * TAU, L = 0.022 * s, c = Math.cos(a), sn = Math.sin(a);
    const C: V3 = [x, y + h, z], M: V3 = [x + c * L * 0.55, y + h + 0.004 * s, z + sn * L * 0.55], T: V3 = [x + c * L, y + h - 0.009 * s, z + sn * L];
    const wx = -sn * 0.004 * s, wz = c * 0.004 * s;
    const col = k % 2 ? '#4f8a3c' : '#3f7a34';
    m.tri(C, [M[0] + wx, M[1], M[2] + wz], [M[0] - wx, M[1], M[2] - wz], col, [0, 1, 0]);
    m.tri([M[0] + wx, M[1], M[2] + wz], T, [M[0] - wx, M[1], M[2] - wz], col, [0, 1, 0]);
  }
}

function inPoly(pts: P2[], x: number, z: number): boolean {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

// ---------------------------------------------------------------------------------------------------------
// BURJ KHALIFA — 828 m. Y-shaped "Hymenocallis" plan of three rounded wings around a hexagonal core; the wings
// step back one at a time in an upward spiral (27 setbacks), silver-blue glass with vertical stainless fins and
// darker mechanical-floor bands, then the fin-clad crown and needle spire. Downtown Dubai at its foot: Burj Lake
// with the Dubai Fountain, Dubai Mall, Souk Al Bahar, palm promenades and smaller towers.
// ---------------------------------------------------------------------------------------------------------

/** Y plan: three wings (lengths L, half-width w) with semicircular noses, edges subdivided ≈ step. */
function wingPlan(L: [number, number, number], w: number, step: number, rot: number): P2[] {
  const out: P2[] = [], sc = w / Math.sqrt(3);
  for (let k = 0; k < 3; k++) {
    const th = rot + (k * TAU) / 3, dx = Math.cos(th), dz = Math.sin(th), nx = -dz, nz = dx;
    const Ln = Math.max(sc + 0.002, L[k] - w), ns = Math.max(1, Math.round((Ln - sc) / step));
    for (let i = 0; i < ns; i++) { const s = sc + ((Ln - sc) * i) / ns; out.push([dx * s - nx * w, dz * s - nz * w]); }
    const na = Math.max(4, Math.round((Math.PI * w) / step));
    for (let i = 0; i <= na; i++) {
      const f = (Math.PI * i) / na, cx = -Math.cos(f), cd = Math.sin(f);
      out.push([dx * Ln + (nx * cx + dx * cd) * w, dz * Ln + (nz * cx + dz * cd) * w]);
    }
    for (let i = ns - 1; i >= 1; i--) { const s = sc + ((Ln - sc) * i) / ns; out.push([dx * s + nx * w, dz * s + nz * w]); }
  }
  return out;
}

const burj: Builder = (gp, r) => {
  const GL = mix(r.color ?? '#b8c6d6', '#c3d3e3', 0.5), FIN = '#eef2f6', BAND = '#6d7d8f', CAPC = '#dfe5eb';
  const LAKE = (x: number, z: number) => ((x - 0.03) / 0.37) ** 2 + ((z - 0.22) / 0.15) ** 2;
  const hf: HFn = (x, z) => (LAKE(x, z) < 1 ? 0.0 : 0.006);
  const G = 0.041;
  island(gp, 0.5, hf, '#e2d3b5', (x, y, z, _nx, ny) => {
    if (y < 0.037 && ny > 0.9) return ripple('#2a93c4')(x, y, z, 0, 1, 0);
    const rr = Math.hypot(x, z);
    if (LAKE(x, z) < 1.12) return '#e9e2d0';
    if (Math.abs(x + 0.33 + z * 0.1) < 0.011 && z < 0.1) return '#4a4f57';
    if (rr < 0.2 && (Math.floor(x * 70) + Math.floor(z * 70)) % 2) return '#ece4d2';
    if (fbm(x * 9, 3, z * 9) > 0.6 && rr < 0.43) return '#7da35a';
    return (Math.floor(x * 45) + Math.floor(z * 45)) % 2 ? '#e3d6ba' : '#d9cbae';
  }, { rings: 30, segs: 96, side: strataSide(['#c8b48f', '#bba57f', '#d2c09c']) });

  const m = new Mesh3(), mt = new Mesh3();
  const TX = -0.035, TZ = -0.11, ROT = Math.PI / 2 + 0.35;

  // Burj Park lawns, water terraces and the Y-shaped podium/entrance pavilions
  cap(m, wingPlan([0.2, 0.2, 0.2], 0.085, 0.02, ROT).map(([x, z]) => [TX + x, TZ + z] as P2), G + 0.0008, '#86ad62');
  cap(m, wingPlan([0.17, 0.17, 0.17], 0.06, 0.02, ROT).map(([x, z]) => [TX + x, TZ + z] as P2), G + 0.0016, '#3f9fc9');
  const pod = wingPlan([0.15, 0.15, 0.15], 0.05, 0.012, ROT).map(([x, z]) => [TX + x, TZ + z] as P2);
  for (let i = 0; i < pod.length; i++) {
    const [ax, az] = pod[i], [bx, bz] = pod[(i + 1) % pod.length];
    m.quad([ax, G, az], [bx, G, bz], [bx, G + 0.02, bz], [ax, G + 0.02, az], i % 2 ? '#c9d2db' : '#7f93a8', [(ax + bx) / 2 - TX, 0, (az + bz) / 2 - TZ]);
  }
  cap(m, pod, G + 0.02, '#dfe5ea');

  // Tower: tiers between setbacks, walls = glass columns + narrow fin strips, banded at mechanical floors
  const L0 = 0.118, NS = 27, Y0 = G + 0.02, YS0 = 0.25, YS1 = 0.94, YCT = 1.0;
  const wAt = (y: number) => 0.034 - 0.009 * ((y - Y0) / (YCT - Y0));
  const Lmin = (y: number) => wAt(y) * 1.25;
  const ys = (i: number) => YS0 + (YS1 - YS0) * (1 - Math.pow(1 - i / (NS - 1), 1.3));
  const bands = [0.16, 0.29, 0.42, 0.55, 0.67, 0.78, 0.87, 0.95];
  const sky: V3 = [0.45, 0, 0.89];
  const Ls: [number, number, number] = [L0, L0, L0], cnt = [0, 0, 0];
  const tierWalls = (plan: P2[], y0: number, y1: number, next: P2[] | null, par: number) => {
    const cuts = [y0];
    for (const b of bands) { if (b > y0 && b < y1) cuts.push(b); if (b + 0.007 > y0 && b + 0.007 < y1) cuts.push(b + 0.007); }
    cuts.push(y1); cuts.sort((a, b) => a - b);
    for (let i = 0; i < plan.length; i++) {
      const [ax, az] = plan[i], [bx, bz] = plan[(i + 1) % plan.length];
      const ex = bx - ax, ez = bz - az, el = Math.hypot(ex, ez) || 1;
      let nx = ez / el, nz = -ex / el;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      const tone = q(0.9 + 0.22 * Math.max(0, nx * sky[0] + nz * sky[2]) + 0.06 * hash3(i, y0 * 50, 3), 0.03);
      const g = shade(GL, tone), fin = shade(FIN, q(0.92 + 0.1 * tone, 0.03));
      const fx = ax + ex * 0.78, fz = az + ez * 0.78;
      const P = (x: number, y: number, z: number): V3 => [TX + x, y, TZ + z];
      const o: V3 = [nx, 0, nz];
      let top = y1;
      if (next) {
        const ml = Math.hypot(mx, mz) || 1, sh = Math.max(0, 1 - 0.005 / ml);
        if (!inPoly(next, mx * sh, mz * sh)) top = y1 + par;
      }
      for (let k = 0; k < cuts.length - 1; k++) {
        const ya = cuts[k], yb = k === cuts.length - 2 ? top : cuts[k + 1];
        const band = bands.some(b => ya >= b - 1e-6 && yb <= b + 0.0071);
        mt.quad(P(ax, ya, az), P(fx, ya, fz), P(fx, yb, fz), P(ax, yb, az), band ? BAND : g, o);
        mt.quad(P(fx, ya, fz), P(bx, ya, bz), P(bx, yb, bz), P(fx, yb, fz), band ? shade(BAND, 1.25) : fin, o);
      }
      if (top > y1) {
        // parapet: thin top + inner face so the stepped wing reads as a crisp fin-capped terrace
        const d = 0.0015;
        m.quad(P(ax, top, az), P(bx, top, bz), P(bx - nx * d, top, bz - nz * d), P(ax - nx * d, top, az - nz * d), FIN, [0, 1, 0]);
        m.quad(P(ax - nx * d, y1, az - nz * d), P(bx - nx * d, y1, bz - nz * d), P(bx - nx * d, top, bz - nz * d), P(ax - nx * d, top, az - nz * d), shade(GL, 0.8), [-nx, 0, -nz]);
      }
    }
  };
  let y = Y0;
  for (let t = 0; t <= NS; t++) {
    const y1 = t < NS ? ys(t) : YCT;
    const w = wAt(y), step = 0.0095;
    const plan = wingPlan(Ls, w, step, ROT);
    let next: P2[] | null = null;
    if (t < NS) {
      const k = t % 3; cnt[k]++;
      const lm = Lmin(y1);
      Ls[k] = lm + (L0 - lm) * Math.pow(Math.max(0, 1 - cnt[k] / 9), 0.85);
      next = wingPlan(Ls, wAt(y1), step, ROT);
    }
    tierWalls(plan, y, y1, next, 0.009);
    cap(m, plan.map(([x, z]) => [TX + x, TZ + z] as P2), y1, CAPC);
    y = y1;
  }
  // Crown: fin-clad spire base, the slim tube with maintenance rings, then the needle
  const SR = wAt(YCT) * 0.85;
  rev(m, [[SR, 0], [SR * 0.8, 0.13], [SR * 0.62, 0.2]], TX, YCT, TZ, 12, (_i, j) => (j % 2 ? '#c5d0db' : '#8fa1b4'));
  for (let k = 0; k < 6; k++) {
    const a = ROT + (k * TAU) / 6 + Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
    const r0 = SR * 1.05, r1 = SR * 0.66;
    m.quad([TX + c * r0 * 0.6, YCT, TZ + s * r0 * 0.6], [TX + c * (r0 + 0.012), YCT, TZ + s * (r0 + 0.012)],
      [TX + c * r1, YCT + 0.19, TZ + s * r1], [TX + c * r1 * 0.6, YCT + 0.19, TZ + s * r1 * 0.6], FIN, [-s, 0, c]);
    m.quad([TX + c * r0 * 0.6, YCT, TZ + s * r0 * 0.6], [TX + c * (r0 + 0.012), YCT, TZ + s * (r0 + 0.012)],
      [TX + c * r1, YCT + 0.19, TZ + s * r1], [TX + c * r1 * 0.6, YCT + 0.19, TZ + s * r1 * 0.6], shade(FIN, 0.9), [s, 0, -c]);
  }
  const SY = YCT + 0.2;
  rev(m, [[SR * 0.62, 0], [SR * 0.5, 0.09], [SR * 0.36, 0.15], [SR * 0.2, 0.21], [0.002, 0.27], [0, 0.275]], TX, SY, TZ, 10,
    (i) => (i % 2 ? '#dfe6ec' : '#b9c6d3'));
  for (const [dy, rr] of [[0.04, 0.85], [0.1, 0.7], [0.16, 0.5]] as const) rev(m, [[0, 0], [SR * rr * 0.62 + 0.003, 0], [SR * rr * 0.62 + 0.003, 0.004], [0, 0.004]], TX, SY + dy, TZ, 10, '#e9eef2');
  add(gp, new THREE.SphereGeometry(0.003, 6, 4), mat('#ef4444', { emissive: '#ef4444' }), TX, SY + 0.276, TZ, 1, 1, 1);

  // Dubai Mall: low terraced block with skylights and a glazed lakeside front
  const mall: P2[] = [[0.2, -0.3], [0.33, -0.3], [0.43, -0.12], [0.43, 0.06], [0.2, 0.06]];
  m.plan(ID, mall, G, G + 0.026, '#d8cdb8');
  for (let i = 0; i < mall.length; i++) {
    const [ax, az] = mall[i], [bx, bz] = mall[(i + 1) % mall.length];
    for (const yy of [0.006, 0.016]) m.quad([ax, G + yy, az], [bx, G + yy, bz], [bx, G + yy + 0.004, bz], [ax, G + yy + 0.004, az], '#5d7387', [(ax + bx) / 2 - 0.3, 0, (az + bz) / 2 + 0.1]);
  }
  for (let i = 0; i < 4; i++) m.box(ID, 0.31, G + 0.026, -0.22 + i * 0.075, 0.18, 0.006, 0.012, '#a9c3d6');
  m.box(ID, 0.25, G + 0.026, -0.05, 0.06, 0.018, 0.05, '#cdbfa6');
  // Souk Al Bahar: low arabesque block with wind towers, on the far side of the lake
  m.box(ID, -0.2, G, 0.42, 0.13, 0.016, 0.05, '#d6b98f', false, true);
  for (let i = 0; i < 5; i++) m.box(ID, -0.255 + i * 0.027, G + 0.016, 0.42, 0.008, 0.012, 0.008, '#c9a87b');
  rev(m, [[0.012, 0], [0.012, 0.004], [0.006, 0.012], [0, 0.014]], -0.2, G + 0.016, 0.42, 8, '#e4ceaa');
  // Lake promenade palms and boardwalk
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU, px = 0.03 + Math.cos(a) * 0.39, pz = 0.22 + Math.sin(a) * 0.165;
    if (Math.hypot(px, pz) < 0.44 && !(px > 0.18 && pz < 0.08)) palm(m, px, G, pz, 0.85 + hash3(i, 2, 2) * 0.3);
  }
  for (const [px, pz] of [[-0.17, -0.02], [0.1, -0.12], [-0.2, -0.22], [0.07, -0.3], [-0.1, 0.05], [0.12, 0.02]] as const) palm(m, px, G, pz, 1);
  // Surrounding towers kept small so the Burj dominates
  const towers: [number, number, number, number, string][] = [
    [-0.33, -0.18, 0.15, 0.026, '#8aa0b4'], [-0.28, -0.3, 0.2, 0.024, '#b9c2cb'], [-0.4, -0.06, 0.1, 0.03, '#c9b89c'],
    [-0.15, -0.38, 0.13, 0.03, '#9eb0c0'], [0.05, -0.42, 0.11, 0.028, '#c0b7a6'], [0.3, 0.18, 0.21, 0.022, '#a6b8c8'],
    [-0.38, 0.12, 0.08, 0.03, '#d0c4ae'], [0.2, -0.38, 0.09, 0.026, '#8d9fb2'],
  ];
  for (const [x, z, h, s, c] of towers) {
    for (let k = 0; k < 4; k++) m.box(ID, x, G + (h * k) / 4, z, s * (1 - k * 0.06), h / 4, s * (1 - k * 0.06), k % 2 ? c : shade(c, 0.86));
    m.prism(ID, x, G + h, z, 0.002, 0.03, 4, '#cfd6dd', 0.0005);
  }
  // Fountain jets (translucent glowing water) in a sweeping arc
  const jets = new Mesh3();
  for (let i = 0; i < 26; i++) {
    const t = i / 25, x = -0.27 + t * 0.6, z = 0.2 + Math.sin(t * Math.PI * 2.2) * 0.045;
    const h = 0.025 + 0.07 * Math.pow(Math.sin(t * Math.PI), 1.5) * (0.6 + 0.4 * hash3(i, 1, 1));
    jets.prism(ID, x, G - 0.006, z, 0.0055, h, 5, '#e6f6ff', 0.0015);
  }
  jets.build(gp).material = mat('#ffffff', { vc: true, transparent: 0.72, emissive: '#7dd3fc' });
  for (const [px, pz] of [[0.1, 0.13], [-0.1, 0.06], [0.15, -0.05]] as const) person(m, px, G, pz, '#334155');
  m.build(gp);
  mt.build(gp, 0.25);
};

/** Lofted prism through equal-count horizontal plans (any orientation); out normals from polygon winding. */
function loft(m: Mesh3, lv: { pts: P2[]; y: number }[], c: (i: number, j: number, nx: number, nz: number) => string): void {
  const p0 = lv[0].pts, n = p0.length;
  let area = 0;
  for (let j = 0; j < n; j++) { const [ax, az] = p0[j], [bx, bz] = p0[(j + 1) % n]; area += ax * bz - bx * az; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < lv.length - 1; i++) {
    const A = lv[i], B = lv[i + 1];
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n, ex = A.pts[k][0] - A.pts[j][0], ez = A.pts[k][1] - A.pts[j][1], el = Math.hypot(ex, ez) || 1;
      const nx = (sg * ez) / el, nz = (-sg * ex) / el;
      m.quad([A.pts[j][0], A.y, A.pts[j][1]], [A.pts[k][0], A.y, A.pts[k][1]], [B.pts[k][0], B.y, B.pts[k][1]], [B.pts[j][0], B.y, B.pts[j][1]],
        c(i, j, nx, nz), [nx, 0.1, nz]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// CN TOWER — 553 m. Hexagonal hollow concrete core braced by three tapering legs (Y section) up to the main pod:
// white radome ring, sloped LookOut / glass-floor windows, the 360 Restaurant band and EdgeWalk ledge with red
// rails. Slim hexagonal shaft to the SkyPod, then the 102 m antenna mast. Rogers Centre with its segmented
// retractable roof at the foot, railway lands, and the Lake Ontario waterfront.
// ---------------------------------------------------------------------------------------------------------
const cntower: Builder = (gp, r) => {
  const CON = mix(r.color ?? '#d6d6d6', '#d8d4cc', 0.5), G = 0.041, K = 0.00224, TX = 0.04, TZ = -0.05;
  const shore = (x: number) => 0.17 + 0.025 * Math.sin(x * 8 + 1) + 0.012 * Math.sin(x * 23);
  const hf: HFn = (x, z) => (z > shore(x) ? 0 : 0.006);
  island(gp, 0.5, hf, '#9aa38a', (x, y, z, _nx, ny) => {
    if (y < 0.037 && ny > 0.9) return ripple('#3d7fae')(x, y, z, 0, 1, 0);
    if (z > shore(x) - 0.03) return '#b9b3a5';
    if (Math.abs(z - 0.09 - 0.05 * x) < 0.016) return '#4b4f56';
    if (Math.abs(z - 0.12 - 0.05 * x) < 0.008) return '#6b6259';
    if (Math.hypot(x - TX, z - TZ) < 0.09) return '#c9c2b4';
    if (fbm(x * 8, 1, z * 8) > 0.58) return '#6f9a52';
    return (Math.floor(x * 40) + Math.floor(z * 40)) % 2 ? '#8e9488' : '#a0a395';
  }, { rings: 28, segs: 90, side: strataSide(['#8f8577', '#7f7668', '#9b9284']) });
  const m = new Mesh3(), mg = new Mesh3();
  const Y = (h: number) => G + h * K, R = (v: number) => v * K;

  // Shaft: hexagonal core + three tapering legs (Y section), lofted from the base to the main pod
  const ROT = -Math.PI / 2 + 0.25;
  const plan = (t: number): P2[] => {
    const cr = R(7.2 - 1.4 * t), reach = R(31 - 22 * Math.pow(t, 0.75)), lw = R(4.6 - 1.4 * t), out: P2[] = [];
    for (let k = 0; k < 3; k++) {
      const th = ROT + (k * TAU) / 3, dx = Math.cos(th), dz = Math.sin(th), nx = -dz, nz = dx, a = cr * Math.cos(Math.PI / 6);
      const hv = (ang: number): P2 => [TX + Math.cos(ang) * cr, TZ + Math.sin(ang) * cr];
      out.push(hv(th - Math.PI / 6));
      out.push([TX + dx * a + nx * -lw, TZ + dz * a + nz * -lw]);
      out.push([TX + dx * reach + nx * -lw * 0.8, TZ + dz * reach + nz * -lw * 0.8]);
      out.push([TX + dx * (reach + lw * 0.45), TZ + dz * (reach + lw * 0.45)]);
      out.push([TX + dx * reach + nx * lw * 0.8, TZ + dz * reach + nz * lw * 0.8]);
      out.push([TX + dx * a + nx * lw, TZ + dz * a + nz * lw]);
      out.push(hv(th + Math.PI / 6));
      out.push(hv(th + Math.PI / 2));
    }
    return out;
  };
  const lv: { pts: P2[]; y: number }[] = [];
  const NL = 14;
  for (let i = 0; i <= NL; i++) { const t = Math.pow(i / NL, 0.8); lv.push({ pts: plan(t), y: Y(t * 330) }); }
  loft(m, lv, (i, j, nx, nz) => {
    const lit = q(0.86 + 0.18 * Math.max(0, nx * -0.6 + nz * 0.8), 0.03);
    // elevator glazing runs up one leg face; faint lift-slab rings
    if (j === 3 && i > 0 && i < NL - 1) return shade('#3b4654', lit);
    return shade(i % 3 === 1 ? shade(CON, 0.96) : CON, lit);
  });
  // Main pod (heights in metres): radome ring, LookOut glazing, white band, restaurant glazing, EdgeWalk roof
  const POD: P2[] = [[7.5, 326], [13, 331], [20, 334.5], [23, 338], [23.5, 340], [22, 342.5], [20.5, 343.5], [21.5, 346], [22.2, 348.5],
    [22.4, 350.5], [22.2, 352], [21.6, 355.5], [22.3, 356.5], [21, 357.5], [16, 360], [10, 363], [5.6, 364.5]];
  const podC = (i: number) => (i === 5 || i === 6 || i === 10 || i === 11 ? 'g' : 'w');
  rev(m, POD.filter((_, i) => i < POD.length).map(([a, b]) => [R(a), Y(b) - Y(0)] as P2), TX, Y(0), TZ, 28, (i, j) => {
    const k = podC(i);
    if (k === 'g') return j % 2 ? '#2b3644' : '#3a4757';
    return i < 4 ? shade('#eceae4', j % 2 ? 1 : 0.95) : '#d9d6cf';
  });
  // EdgeWalk: red rail ring on the pod roof ledge
  for (let j = 0; j < 28; j++) {
    const a0 = (j / 28) * TAU, a1 = ((j + 1) / 28) * TAU, rr = R(22.6);
    const P = (a: number, h: number): V3 => [TX + Math.cos(a) * rr, Y(h), TZ + Math.sin(a) * rr];
    mg.quad(P(a0, 356.6), P(a1, 356.6), P(a1, 358.6), P(a0, 358.6), '#d23a2e', [Math.cos(a0), 0, Math.sin(a0)]);
    if (j % 4 === 0) person(m, TX + Math.cos(a0 + 0.1) * R(21.8), Y(356.5), TZ + Math.sin(a0 + 0.1) * R(21.8), '#ef6c00', 0.4);
  }
  // Upper shaft to the SkyPod, SkyPod, antenna mast with red/white bands
  rev(m, [[R(5.6), 0], [R(4.6), Y(444) - Y(364)]], TX, Y(364), TZ, 6, (_i, j) => shade(CON, j % 2 ? 1 : 0.94), Math.PI / 6);
  rev(m, [[R(4.6), 0], [R(7.8), 2.5 * K], [R(8.4), 5 * K], [R(8.6), 7 * K], [R(8.4), 11 * K], [R(8.6), 12 * K], [R(7.2), 14 * K], [R(4.2), 16 * K]],
    TX, Y(441), TZ, 16, (i) => (i === 3 ? '#2d3846' : '#e3e1db'));
  const AB = 457, AT = 553, NB = 14;
  for (let b = 0; b < NB; b++) {
    const h0 = AB + ((AT - AB) * b) / NB, h1 = AB + ((AT - AB) * (b + 1)) / NB;
    const r0 = R(3.4 - 2.7 * ((h0 - AB) / (AT - AB))), r1 = R(3.4 - 2.7 * ((h1 - AB) / (AT - AB)));
    rev(m, [[r0, 0], [r1, Y(h1) - Y(h0)]], TX, Y(h0), TZ, 8, b > 4 && b % 2 ? '#d1342b' : '#f1efe9');
  }
  rev(m, [[R(4.2), 0], [R(3.4), Y(AB) - Y(457 - 1)], [R(3.4), Y(AB) - Y(456)]], TX, Y(457), TZ, 8, '#bdb8ae');
  add(gp, new THREE.SphereGeometry(0.004, 6, 4), mat('#ff3b30', { emissive: '#ff3b30' }), TX, Y(AT) + 0.002, TZ, 1, 1, 1);
  // Base pavilion around the legs
  m.prism(ID, TX, G, TZ, R(42), 0.012, 12, '#a8b0b8', R(38));
  m.prism(ID, TX, G + 0.012, TZ, R(38), 0.002, 12, '#d7d3cb');

  // Rogers Centre: drum with window band and ribs, shallow segmented dome with parallel panel seams
  const RX = -0.2, RZ = -0.1, RR = 0.15;
  rev(m, [[RR, 0], [RR, 0.012], [RR * 0.99, 0.016], [RR * 0.99, 0.026], [RR * 0.97, 0.03]], RX, G, RZ, 36, (i, j) =>
    i === 2 ? (j % 3 ? '#4a5868' : '#c8ccd0') : i === 0 ? (j % 3 ? '#d9dcdf' : '#b9bec4') : '#e6e8ea');
  const dome: P2[] = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * (Math.PI / 2); dome.push([RR * 0.97 * Math.cos(a), 0.03 + 0.05 * Math.sin(a)]); }
  rev(m, dome, RX, G, RZ, 36, (i) => (i % 2 ? '#c4c9ce' : '#d3d7db'));
  for (const off of [-0.075, -0.025, 0.025, 0.075]) {
    const pts: V3[] = [];
    const half = Math.sqrt(Math.max(0, (RR * 0.97) ** 2 - off * off));
    for (let k = 0; k <= 8; k++) {
      const zz = -half + (2 * half * k) / 8, rr = Math.hypot(off, zz) / (RR * 0.97);
      pts.push([RX + off, G + 0.03 + 0.05 * Math.sqrt(Math.max(0, 1 - rr * rr)) + 0.0015, RZ + zz]);
    }
    for (let k = 0; k < 8; k++) beam(m, pts[k], pts[k + 1], 0.0035, '#8e969e');
  }
  // Ripley's aquarium, railway roundhouse, Gardiner expressway, rail tracks and a small skyline behind
  m.box(ID, 0.2, G, 0.0, 0.11, 0.016, 0.06, '#bfc6cc');
  m.prism(ID, 0.2, G + 0.016, 0.0, 0.03, 0.006, 8, '#8fa3b5', 0.02);
  rev(m, [[0.07, 0], [0.07, 0.012], [0.045, 0.012], [0.045, 0]], 0.2, G, -0.17, 18, '#9a5a44');
  for (let k = 0; k < 9; k++) {
    const x0 = -0.46 + k * 0.105, x1 = x0 + 0.105;
    const z0 = 0.09 + 0.05 * x0, z1 = 0.09 + 0.05 * x1;
    m.quad([x0, G + 0.01, z0 - 0.009], [x1, G + 0.01, z1 - 0.009], [x1, G + 0.01, z1 + 0.009], [x0, G + 0.01, z0 + 0.009], '#5b6068', [0, 1, 0]);
    m.quad([x0, G + 0.006, z0 + 0.009], [x1, G + 0.006, z1 + 0.009], [x1, G + 0.01, z1 + 0.009], [x0, G + 0.01, z0 + 0.009], '#7b8088', [0, 0, 1]);
    for (const xx of [x0 + 0.03, x0 + 0.08]) if (Math.abs(xx) < 0.43) m.box(ID, xx, G, (z0 + z1) / 2, 0.006, 0.006, 0.012, '#7b8088');
  }
  const sky: [number, number, number, number, number, string][] = [
    [0.32, -0.12, 0.16, 0.04, 0.04, '#5f7488'], [0.36, -0.22, 0.2, 0.035, 0.035, '#8c97a3'], [0.27, -0.3, 0.24, 0.04, 0.03, '#2f3f52'],
    [0.18, -0.36, 0.13, 0.05, 0.04, '#b9b2a4'], [0.06, -0.4, 0.17, 0.04, 0.04, '#7891a8'], [0.4, -0.04, 0.1, 0.04, 0.04, '#c2b7a5'],
    [-0.08, -0.42, 0.09, 0.05, 0.04, '#a8a296'], [0.25, -0.2, 0.11, 0.03, 0.03, '#d1c9b8'], [-0.2, -0.38, 0.07, 0.06, 0.04, '#9a8f80'],
  ];
  for (const [x, z, h0, w, d, c] of sky) {
    const h = h0 * 0.65;
    const nb = 5;
    for (let k = 0; k < nb; k++) m.box(ID, x, G + (h * k) / nb, z, w, h / nb, d, k % 2 ? c : shade(c, 0.85));
  }
  // Waterfront: piers, a ferry and trees along the Harbourfront
  for (const [px, w] of [[-0.25, 0.03], [-0.05, 0.025], [0.15, 0.035], [0.33, 0.025]] as const) {
    const z0 = shore(px) - 0.01;
    m.box(ID, px, G - 0.002, z0 + 0.035, w, 0.006, 0.07, '#a39b8d', false, true);
  }
  m.box(ID, 0.05, G - 0.006, 0.3, 0.05, 0.006, 0.016, '#f2f2f2', true, true);
  m.box(ID, 0.05, G, 0.3, 0.03, 0.005, 0.01, '#3b82c4');
  for (let i = 0; i < 14; i++) {
    const x = -0.42 + i * 0.065, z = shore(x) - 0.022 - (i % 2) * 0.012;
    if (Math.hypot(x, z) < 0.45) bush(m, x, G, z, 0.009, i % 3 ? '#4c7a3a' : '#5f8c45');
  }
  for (const [x, z] of [[0.0, 0.05], [0.09, 0.03], [0.1, -0.1], [-0.02, -0.12]] as const) bush(m, x, G, z, 0.008, '#557f3f');
  for (let i = 0; i < 6; i++) person(m, TX - 0.05 + i * 0.02, G, TZ + 0.07 + (i % 2) * 0.01, ['#334155', '#b45309', '#1d4ed8'][i % 3]);
  m.build(gp);
  mg.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// CHRIST THE REDEEMER — Art Deco soapstone statue (30 m, arms 28 m) on its chamfered granite pedestal/chapel,
// with the balustraded viewing terraces, stairs and lift tower on the summit of Corcovado: a forested granite
// pinnacle above the city, with Guanabara Bay and Sugarloaf at its foot.
// ---------------------------------------------------------------------------------------------------------

/** Ring of n points around (x,z) at height y; radius per angle from fn (a=0 → +x, a=π/2 → +z front). */
function ring(n: number, x: number, z: number, fn: (a: number) => [number, number]): V3[] {
  const out: V3[] = [];
  for (let j = 0; j < n; j++) { const a = (j / n) * TAU, [rad, yy] = fn(a); out.push([x + Math.cos(a) * rad, yy, z + Math.sin(a) * rad]); }
  return out;
}

// Gallery/preview cameras look from +z with the turntable yawed ≈0.45–0.6; counter-rotate so the statue
// (facing local +z, over the bay) meets the default camera head-on with Guanabara Bay at front-right.
const redeemer: Builder = (gp, r) => {
  const g = new THREE.Group();
  g.rotation.y = -0.55;
  gp.add(g);
  redeemerScene(g, r);
};

const FOREST = Array.from({ length: 9 }, (_, i) => mix('#2a5a2e', '#4a7e3e', i / 8));
const forestAt = (x: number, y: number, z: number) => FOREST[Math.max(0, Math.min(8, Math.round((fbm(x * 6, y * 6, z * 6, 3) - 0.25) * 16)))];

const redeemerScene: Builder = (gp, r) => {
  const ST = r.color ?? '#e9e6dc';
  const PX = -0.02, PZ = -0.05, PK = 0.25, G = 0.035;
  const bayD = (x: number, z: number) => x * 0.62 + z * 0.78 + 0.03 * Math.sin(x * 9) - 0.31;
  const hf: HFn = (x, z) => {
    const dx = x - PX, dz = z - PZ, d = Math.hypot(dx, dz);
    // pinnacle with a sheer front face, Tijuca ridge running away to the back-left
    const pin = PK * Math.exp(-Math.pow(d / (dz > 0 ? 0.12 : 0.17), 1.35));
    const ax = -0.62, az = -0.78, along = dx * ax + dz * az, perp = Math.abs(dx * -az + dz * ax);
    const ridge = along > 0 ? (0.17 - 0.12 * Math.min(1, along / 0.5)) * Math.exp(-((perp / (0.07 + along * 0.25)) ** 2)) : 0;
    let y = Math.max(pin, ridge) + 0.025 * Math.abs(fbm(x * 9, 2, z * 9) - 0.5) * 2 * Math.min(1, d / 0.08);
    if (d < 0.055) y = Math.max(y, PK);
    const shore = Math.min(1, Math.max(0, bayD(x, z) / 0.06));
    y = y * (1 - shore) + 0.008 * (1 - shore) - 0.004 * shore;
    return Math.max(-0.002, Math.min(y, PK));
  };
  island(gp, 0.5, hf, '#3f6b3a', (x, y, z, _nx, ny) => {
    const t = y - G;
    if (t < 0.002 && bayD(x, z) > 0.02) return ripple('#2a7fb0')(x, y, z, 0, 1, 0);
    if (t < 0.012 && bayD(x, z) > -0.02) return bayD(x, z) > 0.005 ? '#eadcb8' : '#cfc5b4';
    if (t > PK - 0.002 && Math.hypot(x - PX, z - PZ) < 0.06) return '#9a9a90';
    if (ny < 0.6) return fbm(x * 8, y * 8, z * 8) > 0.5 ? '#77787c' : '#84858a';
    if (t < 0.015 && bayD(x, z) > -0.1) return '#d6cfc0';
    return forestAt(x, y, z);
  }, { rings: 40, segs: 100, side: strataSide(['#6a5a48', '#7a6853', '#5d4e3f']) });

  const m = new Mesh3();
  // Atlantic rainforest: rounded canopy clumps gathered in groves on the flanks
  for (let i = 0; i < 52; i++) {
    const a = hash3(i, 1, 9) * TAU, d = 0.09 + Math.sqrt(hash3(i, 2, 9)) * 0.35, cx = PX + Math.cos(a) * d, cz = PZ + Math.sin(a) * d;
    const base = forestAt(cx, 0.1, cz), n = 3 + Math.floor(hash3(i, 5, 9) * 3);
    for (let k = 0; k < n; k++) {
      const b = hash3(i, k, 11) * TAU, rr = 0.006 + hash3(i, k, 12) * 0.022, x = cx + Math.cos(b) * rr, z = cz + Math.sin(b) * rr;
      if (Math.hypot(x, z) > 0.46 || bayD(x, z) > -0.03) continue;
      const h = hf(x, z), e = 0.004, gx = (hf(x + e, z) - hf(x - e, z)) / (2 * e), gz = (hf(x, z + e) - hf(x, z - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 1.5 || h < 0.012) continue;
      const s = 0.013 + hash3(i, k, 13) * 0.011;
      pblob(gp, shade(base, 0.92 + hash3(i, k, 14) * 0.2), x, G + h + s * 0.2, z, s, s * 0.7, s, undefined, [0, 0, 0], 7);
    }
  }
  // Botafogo / Flamengo blocks on the bay shore, Sugarloaf and Urca across the water, cable car
  for (let i = 0; i < 26; i++) {
    const x = -0.3 + hash3(i, 4, 1) * 0.7, z = -0.05 + hash3(i, 4, 2) * 0.5, b = bayD(x, z);
    if (b < -0.075 || b > -0.012 || Math.hypot(x, z) > 0.45 || hf(x, z) > 0.02) continue;
    const h = 0.012 + hash3(i, 4, 3) * 0.03;
    m.box(ID, x, G + hf(x, z) - 0.003, z, 0.022, h, 0.018, ['#f2efe8', '#e6dccb', '#d9d4ca', '#f5e6c8'][i % 4]);
  }
  // Sugarloaf: steep bare-granite bullet dome with a forested foot; wooded Morro da Urca beside it
  const SLX = 0.3, SLZ = 0.24, SLH = 0.19, URX = 0.2, URZ = 0.33, URH = 0.06;
  const dome = (cx: number, cz: number, rx: number, ry: number, p: number, n: number, col: (i: number, j: number) => string) => {
    const prof: P2[] = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, y = ry * t; prof.push([k === 12 ? 0 : rx * Math.pow(1 - Math.pow(t, p), 1 / p) + 0.012 * (1 - t) ** 3, y]); }
    rev(m, prof, cx, G - 0.004, cz, n, col);
  };
  dome(SLX, SLZ, 0.05, SLH, 2.4, 18, (i, j) => i < 2 ? '#3f6b3a' : i < 3 && j % 2 ? '#4a7340' : i > 9 ? '#8e9094' : j % 6 === 1 && i < 9 ? '#74767b' : '#85878c');
  dome(URX, URZ, 0.045, URH, 1.6, 12, (i, j) => i > 7 ? '#5f6a55' : j % 2 ? '#3f6b3a' : '#4a7a42');
  m.quad([URX, G + URH - 0.002, URZ], [SLX, G + SLH - 0.004, SLZ], [SLX, G + SLH - 0.003, SLZ + 0.001], [URX, G + URH - 0.001, URZ + 0.001], '#222222', [0, 0, 1]);
  m.box(ID, (URX + SLX) / 2, G + (URH + SLH) / 2 - 0.01, (URZ + SLZ) / 2, 0.006, 0.005, 0.004, '#e11d48');
  m.box(ID, SLX, G + SLH - 0.006, SLZ, 0.014, 0.008, 0.01, '#d6d3cc');
  for (let i = 0; i < 4; i++) m.box(ID, 0.05 + i * 0.07, G - 0.004, 0.38 - i * 0.02, 0.02, 0.005, 0.008, '#f8fafc');

  // Summit: viewing terraces with balustrades, stairs and the lift tower
  const TY = G + PK, TR = (a: number) => 0.088 + 0.02 * Math.cos(2 * a - 0.6) + 0.012 * Math.cos(a - 1.2);
  const terr = ring(28, PX, PZ, (a) => [TR(a), TY + 0.004]);
  cap(m, terr.map(p => [p[0], p[2]] as P2), TY + 0.004, '#d8d1c3');
  for (let j = 0; j < terr.length; j++) {
    const A = terr[j], B = terr[(j + 1) % terr.length], o: V3 = [(A[0] + B[0]) / 2 - PX, 0, (A[2] + B[2]) / 2 - PZ];
    m.quad([A[0], TY - 0.018, A[2]], [B[0], TY - 0.018, B[2]], [B[0], TY + 0.004, B[2]], [A[0], TY + 0.004, A[2]], j % 2 ? '#b9b2a4' : '#a9a294', o);
    m.quad([A[0], TY + 0.004, A[2]], [B[0], TY + 0.004, B[2]], [B[0], TY + 0.011, B[2]], [A[0], TY + 0.011, A[2]], '#ece7dc', o);
    m.quad([A[0], TY + 0.011, A[2]], [B[0], TY + 0.011, B[2]], [B[0] * 0.97 + PX * 0.03, TY + 0.011, B[2] * 0.97 + PZ * 0.03], [A[0] * 0.97 + PX * 0.03, TY + 0.011, A[2] * 0.97 + PZ * 0.03], '#f4f1ea', [0, 1, 0]);
  }
  for (let k = 0; k < 9; k++) {
    const sx = PX - 0.075 - k * 0.011, sz = PZ + 0.06 + k * 0.012;
    m.box(ID, sx, G + hf(sx, sz) - 0.006, sz, 0.026, 0.01, 0.014, k % 2 ? '#d8d1c3' : '#cbc3b4', false, true);
  }
  m.box(ID, PX + 0.085, TY - 0.03, PZ - 0.04, 0.035, 0.065, 0.03, '#6f8d6c');
  m.box(ID, PX + 0.085, TY + 0.035, PZ - 0.04, 0.038, 0.004, 0.033, '#dfe7dc');
  m.box(ID, PX + 0.068, TY + 0.02, PZ - 0.04, 0.002, 0.012, 0.022, '#334155');
  // Visitors on the terrace
  for (let i = 0; i < 14; i++) {
    const a = 0.2 + i * 0.42, d = 0.055 + (i % 3) * 0.009;
    person(m, PX + Math.cos(a) * d, TY + 0.004, PZ + Math.sin(a) * d, ['#ef4444', '#1d4ed8', '#f59e0b', '#0f766e', '#f8fafc'][i % 5], 0.9);
  }
  // Pedestal (chapel inside): chamfered square of dark granite courses under a pale cornice
  const H = 0.4, PA = 0.064, PH = 0.112, ch = 0.32;
  const pedPlan = (a: number): P2[] => {
    const c = a * ch, out: P2[] = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      if (sx * sz > 0) { out.push([PX + sx * a, PZ + sz * (a - c)]); out.push([PX + sx * (a - c), PZ + sz * a]); }
      else { out.push([PX + sx * (a - c), PZ + sz * a]); out.push([PX + sx * a, PZ + sz * (a - c)]); }
    }
    return out;
  };
  m.plan(ID, pedPlan(PA * 1.18), TY + 0.004, TY + 0.012, '#cfc8b9');
  const NC = 7;
  for (let k = 0; k < NC; k++) {
    const y0 = TY + 0.012 + ((PH - 0.022) * k) / NC, y1 = TY + 0.012 + ((PH - 0.022) * (k + 1)) / NC;
    m.plan(ID, pedPlan(PA), y0, y1 - 0.0008, k % 2 ? '#5a4535' : '#634c3a');
    m.plan(ID, pedPlan(PA * 0.985), y1 - 0.0008, y1, '#3e2f25');
  }
  m.box(ID, PX, TY + 0.012, PZ + PA + 0.0005, 0.016, 0.026, 0.001, '#2a211b');
  m.plan(ID, pedPlan(PA * 1.06), TY + PH - 0.01, TY + PH - 0.004, '#e7e2d6');
  m.plan(ID, pedPlan(PA * 0.98), TY + PH - 0.004, TY + PH, '#d9d3c6');
  m.build(gp);

  // --- Statue -------------------------------------------------------------------------------------------
  const SY = TY + PH, X = PX, Z = PZ;
  const mosaic: Paint = (x, y, z) => { const h = hash3(Math.floor(x * 900), Math.floor(y * 900), Math.floor(z * 900)); return h > 0.8 ? shade(ST, 0.95) : h < 0.1 ? shade(ST, 1.03) : null; };
  // body / tunic: elliptical rings with fine vertical pleats, widening into the chest, rounding into the shoulders
  const body: [number, number, number, number][] = [[0, 0.098, 0.064, 1], [0.03, 0.1, 0.066, 1], [0.15, 0.098, 0.064, 1], [0.3, 0.104, 0.066, 1],
    [0.45, 0.116, 0.07, 0.6], [0.6, 0.126, 0.075, 0.4], [0.7, 0.13, 0.078, 0.3], [0.77, 0.128, 0.074, 0.2], [0.805, 0.112, 0.064, 0.1],
    [0.83, 0.075, 0.05, 0], [0.845, 0.04, 0.038, 0], [0.87, 0.034, 0.034, 0]];
  const NB = 40;
  skin(gp, body.map(([h, rx, rz, pl]) => ring(NB, X, Z, (a) => {
    const c = Math.cos(a), s = Math.sin(a), rad = (rx * rz) / Math.hypot(rz * c, rx * s);
    return [(rad + pl * 0.006 * Math.cos(a * 18) * (s > -0.2 ? 1 : 0.4)) * H, SY + h * H];
  })), ST, { caps: true, paint: mosaic });
  // mantle: hangs from the shoulders to a hem high on the right, long on the left, with deep vertical folds
  const hem = (a: number) => 0.3 - 0.1 * Math.cos(a) + (Math.sin(a) < 0 ? 0.04 : 0);
  const fold = (a: number) => 0.012 * Math.max(0, Math.cos(a * 7 + 0.5)) ** 2 + 0.005 * Math.cos(a * 13);
  const ML: number[] = [0, 0.03, 0.25, 0.5, 0.75, 0.92, 1];
  skin(gp, ML.map((t, k) => ring(NB, X, Z, (a) => {
    const c = Math.cos(a), s = Math.sin(a), y = hem(a) + (0.79 - hem(a)) * t;
    const bi = body.findIndex(b => b[0] >= y), b0 = body[Math.max(0, bi - 1)], b1 = body[Math.max(0, bi)];
    const u = b1[0] > b0[0] ? (y - b0[0]) / (b1[0] - b0[0]) : 0;
    const rx = b0[1] + (b1[1] - b0[1]) * u, rz = b0[2] + (b1[2] - b0[2]) * u;
    const rad = (rx * rz) / Math.hypot(rz * c, rx * s);
    const lip = k === 0 ? -0.004 : 0.003 + 0.013 * (1 - t);
    return [(rad + lip + fold(a) * (1 - t * 0.7)) * H, SY + y * H];
  })), shade(ST, 0.98), { paint: mosaic });
  // diagonal drape across the chest, sash folds
  sweep(gp, [
    { p: [X + 0.12 * H, SY + 0.75 * H, Z + 0.052 * H], w: 0.008 * H, h: 0.03 * H },
    { p: [X + 0.06 * H, SY + 0.665 * H, Z + 0.077 * H], w: 0.009 * H, h: 0.032 * H },
    { p: [X - 0.03 * H, SY + 0.63 * H, Z + 0.08 * H], w: 0.009 * H, h: 0.03 * H },
    { p: [X - 0.1 * H, SY + 0.66 * H, Z + 0.07 * H], w: 0.008 * H, h: 0.026 * H },
    { p: [X - 0.128 * H, SY + 0.71 * H, Z + 0.042 * H], w: 0.006 * H, h: 0.02 * H },
  ], shade(ST, 0.97), { radial: 10, sub: 5, up: [0, 0, 1] });
  // arms in wide sleeves through the shoulders, cuffs flaring before the wrists
  const arm = (sg: number) => [
    { p: [X + sg * 0.1 * H, SY + 0.745 * H, Z] as V3, w: 0.052 * H, h: 0.075 * H },
    { p: [X + sg * 0.19 * H, SY + 0.748 * H, Z] as V3, w: 0.042 * H, h: 0.066 * H },
    { p: [X + sg * 0.27 * H, SY + 0.758 * H, Z + 0.003 * H] as V3, w: 0.034 * H, h: 0.052 * H },
    { p: [X + sg * 0.335 * H, SY + 0.766 * H, Z + 0.004 * H] as V3, w: 0.028 * H, h: 0.042 * H },
    { p: [X + sg * 0.362 * H, SY + 0.776 * H, Z + 0.005 * H] as V3, w: 0.014 * H, h: 0.017 * H },
  ];
  sweep(gp, [...arm(-1).reverse(), ...arm(1)], ST, { radial: 14, sub: 4, paint: mosaic });
  for (const sg of [-1, 1]) {
    // open hand, palm forward, fingers together, thumb raised
    sweep(gp, [
      { p: [X + sg * 0.36 * H, SY + 0.778 * H, Z + 0.006 * H], w: 0.011 * H, h: 0.016 * H },
      { p: [X + sg * 0.4 * H, SY + 0.78 * H, Z + 0.008 * H], w: 0.009 * H, h: 0.023 * H },
      { p: [X + sg * 0.445 * H, SY + 0.778 * H, Z + 0.008 * H], w: 0.007 * H, h: 0.021 * H },
      { p: [X + sg * 0.485 * H, SY + 0.774 * H, Z + 0.006 * H], w: 0.005 * H, h: 0.012 * H },
    ], ST, { radial: 8, sub: 3 });
    sweep(gp, [
      { p: [X + sg * 0.385 * H, SY + 0.788 * H, Z + 0.012 * H], w: 0.005 * H },
      { p: [X + sg * 0.41 * H, SY + 0.806 * H, Z + 0.013 * H], w: 0.004 * H },
    ], ST, { radial: 6, sub: 2 });
    // feet peeking under the tunic hem
    pblob(gp, shade(ST, 0.97), X + sg * 0.035 * H, SY + 0.006 * H, Z + 0.07 * H, 0.025 * H, 0.014 * H, 0.03 * H, undefined, [0, 0, 0], 8);
  }
  // neck, bowed bearded head, long hair over the nape
  pblob(gp, ST, X, SY + 0.925 * H, Z + 0.008 * H, 0.047 * H, 0.066 * H, 0.054 * H, mosaic, [0.28, 0, 0], 14);
  pblob(gp, shade(ST, 0.92), X, SY + 0.935 * H, Z - 0.012 * H, 0.05 * H, 0.064 * H, 0.046 * H, undefined, [0.22, 0, 0], 12);
  pblob(gp, shade(ST, 0.95), X, SY + 0.88 * H, Z + 0.03 * H, 0.034 * H, 0.04 * H, 0.02 * H, undefined, [0.3, 0, 0], 10);
  pblob(gp, ST, X, SY + 0.915 * H, Z + 0.058 * H, 0.007 * H, 0.014 * H, 0.009 * H, undefined, [0.3, 0, 0], 6);
  for (const sg of [-1, 1]) pblob(gp, shade(ST, 0.72), X + sg * 0.017 * H, SY + 0.93 * H, Z + 0.05 * H, 0.009 * H, 0.005 * H, 0.004 * H, undefined, [0.3, 0, 0], 6);
  for (const sg of [-1, 1]) pblob(gp, shade(ST, 0.92), X + sg * 0.043 * H, SY + 0.885 * H, Z - 0.004 * H, 0.012 * H, 0.05 * H, 0.026 * H, undefined, [0.1, 0, sg * 0.15], 8);
};

// ---------------------------------------------------------------------------------------------------------
// AL-KHAZNEH (THE TREASURY), PETRA — Hellenistic rock-cut facade (≈25 × 39 m) in rose-red sandstone: lower
// portico of six Corinthian columns with pediment over the central four, equestrian reliefs in the outer bays,
// frieze of scrolls; upper storey with the tholos (round kiosk, conical roof, capital and urn) between broken
// half-pediments on side pavilions, relief figures in the intercolumniations, climbing notches up the margins.
// Framed by the sheer swirled walls of the canyon where the Siq opens; camels and visitors on the sandy plaza.
// ---------------------------------------------------------------------------------------------------------

/** Kneeling or standing dromedary with a striped saddle blanket, facing ry (local +x = forward). */
function camel(gp: THREE.Object3D, m: Mesh3, x: number, y: number, z: number, ry: number, kneel: boolean, blanket: string[]): void {
  const c = Math.cos(ry), s = Math.sin(ry), k = 0.0145;
  const W = (lx: number, ly: number, lz: number): V3 => [x + lx * c - lz * s, y + ly, z + lx * s + lz * c];
  const B = '#b98a5a', yb = kneel ? 0.75 * k : 1.55 * k;
  pblob(gp, B, ...W(0, yb, 0), 0.95 * k, 0.48 * k, 0.42 * k, undefined, [0, -ry, 0], 10);
  pblob(gp, shade(B, 1.04), ...W(-0.05 * k, yb + 0.45 * k, 0), 0.42 * k, 0.38 * k, 0.3 * k, undefined, [0, -ry, 0], 8);
  sweep(gp, [
    { p: W(0.75 * k, yb + 0.05 * k, 0), w: 0.24 * k },
    { p: W(1.12 * k, yb + 0.35 * k, 0), w: 0.17 * k },
    { p: W(1.25 * k, yb + 0.95 * k, 0), w: 0.14 * k },
    { p: W(1.42 * k, yb + 1.1 * k, 0), w: 0.12 * k, h: 0.14 * k },
    { p: W(1.72 * k, yb + 1.0 * k, 0), w: 0.08 * k, h: 0.09 * k },
  ], B, { radial: 7, sub: 3 });
  if (kneel) {
    for (const sz of [-1, 1]) pblob(gp, shade(B, 0.9), ...W(0.15 * k, 0.18 * k, sz * 0.4 * k), 0.9 * k, 0.18 * k, 0.16 * k, undefined, [0, -ry, 0], 6);
  } else {
    for (const [lx, lz] of [[0.6, 0.22], [0.6, -0.22], [-0.65, 0.22], [-0.65, -0.22]] as const) {
      const p = W(lx * k, 0, lz * k);
      m.prism(ID, p[0], p[1], p[2], 0.1 * k, yb, 5, shade(B, 0.85), 0.14 * k);
    }
  }
  // saddle blanket stripes draped over the hump
  for (let i = 0; i < blanket.length; i++) {
    const lx = (-0.45 + (0.9 * i) / blanket.length) * k, lx1 = lx + (0.9 / blanket.length) * k;
    for (const sz of [-1, 1]) {
      const a = W(lx, yb + 0.8 * k, sz * 0.05 * k), b = W(lx1, yb + 0.8 * k, sz * 0.05 * k), cc = W(lx1, yb - 0.05 * k, sz * 0.47 * k), d = W(lx, yb - 0.05 * k, sz * 0.47 * k);
      m.quad(a, b, cc, d, blanket[i], [-s * sz, 0.6, c * sz]);
    }
  }
}

const petra: Builder = (gp, r) => {
  const ROCK = ['#e8c4a0', '#e3ae8c', '#d9957a', '#c97b62', '#b5604f', '#a8524a', '#9c5a52', '#a8524a', '#c4705a', '#d9957a', '#e3ae8c'];
  const FC = mix(r.color ?? '#d08a6a', '#eab09a', 0.55);
  const G = 0.035, ZF = -0.15, TOP = 0.68;
  const wP = (z: number) => 0.29 + 0.11 * sstep(0.0, 0.42, z);
  const topZ = (z: number) => TOP * (1 - 0.88 * sstep(ZF + 0.02, 0.36, z));
  /** signed distance into the rock (≤0 in the plaza) */
  const sd = (x: number, z: number) => Math.max(Math.abs(x) - wP(z), ZF - z);
  const hf: HFn = (x, z) => topZ(z) * sstep(0.012, 0.085, sd(x, z));
  island(gp, 0.5, hf, '#d9a27e', (x, y, z, _nx, ny) => {
    if (y < G + 0.004) {
      const tr = Math.abs(x + 0.04 * Math.sin(z * 9)) < 0.03 && z > ZF + 0.06;
      return tr ? '#d6a582' : hash3(Math.floor(x * 60), 1, Math.floor(z * 60)) > 0.5 ? '#e3b493' : '#ddac8a';
    }
    return fbm(x * 14, 3, z * 14) > 0.5 ? '#c27c5e' : ny > 0.8 ? '#b06a52' : '#a85f4c';
  }, { rings: 40, segs: 104, side: () => '#9c5a52' });

  const m = new Mesh3(), w = new Mesh3();
  // --- canyon walls: sheer, leaning back, swirled in bands of cream, ochre, rose and plum -----------------
  const NR = 16;
  const swirl = (x: number, y: number, z: number) =>
    ROCK[Math.floor(y * 15 + 1.3 * Math.sin((x + z) * 7 + y * 6) + 1.2 * fbm(x * 4, y * 3, z * 4) + 16) % ROCK.length];
  const wall = (pts: P2[], H: (x: number, z: number) => number, openness: (x: number, z: number) => number, rough: number) => {
    const n = pts.length;
    const nrm: P2[] = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez) || 1;
      let nx = ez / el, nz = -ex / el;
      if (openness(p[0] + nx * 0.02, p[1] + nz * 0.02) < openness(p[0] - nx * 0.02, p[1] - nz * 0.02)) { nx = -nx; nz = -nz; }
      return [nx, nz];
    });
    const V = (i: number, f: number): V3 => {
      const [px, pz] = pts[i], [nx, nz] = nrm[i], h = H(px, pz);
      const bulge = rough * ((0.014 * (fbm(px * 11 + f * 3, f * 4, pz * 11) - 0.45)) * Math.sin(f * Math.PI) - 0.03 * f * h);
      return [px + nx * bulge, G - 0.004 + f * (h - G + 0.035 + 0.004), pz + nz * bulge];
    };
    for (let i = 0; i < n - 1; i++) {
      const out: V3 = [(nrm[i][0] + nrm[i + 1][0]) / 2, 0, (nrm[i][1] + nrm[i + 1][1]) / 2];
      const lit = 0.84 + 0.2 * Math.max(0, out[0] * 0.55 + out[2] * 0.83);
      for (let k = 0; k < NR; k++) {
        const f0 = k / NR, f1 = (k + 1) / NR, A = V(i, f0), Bv = V(i + 1, f0), C = V(i + 1, f1), D = V(i, f1);
        if (D[1] - A[1] < 1e-4 && C[1] - Bv[1] < 1e-4) continue;
        w.quad(A, Bv, C, D, shade(swirl(A[0], (A[1] + D[1]) / 2, A[2]), q(lit + 0.03 * (hash3(i, k, 5) - 0.5), 0.03)), out);
      }
      if (rough > 0) {
        const C = V(i + 1, 1), D = V(i, 1);
        w.quad(D, C, [C[0] - out[0] * 0.07, C[1], C[2] - out[2] * 0.07], [D[0] - out[0] * 0.07, D[1], D[2] - out[2] * 0.07], '#b8705a', [0, 1, 0]);
      }
    }
  };
  const step = 0.014, wallTop = (_x: number, z: number) => topZ(z) + 0.004, open = (x: number, z: number) => -sd(x, z);
  const xs: P2[] = [], zs: number[] = [];
  for (let k = 0, nx = Math.round((2 * wP(ZF)) / step); k <= nx; k++) xs.push([-wP(ZF) + (2 * wP(ZF) * k) / nx, ZF]);
  for (let z = ZF; ; z += step) { if (Math.hypot(wP(z), z) > 0.5) { zs.push(Math.sqrt(0.25 - wP(z) ** 2) - 0.002); break; } zs.push(z); }
  wall(xs, wallTop, open, 1);
  wall(zs.map(z => [wP(z), z] as P2), wallTop, open, 1);
  wall(zs.map(z => [-wP(z), z] as P2), wallTop, open, 1);
  // banded outer cliff around the rim of the massif (replaces the plain island skirt)
  const rim: P2[] = [];
  const a0 = Math.atan2(zs[zs.length - 1], wP(zs[zs.length - 1])), a1 = Math.PI - a0;
  for (let k = 0, nk = 120; k <= nk; k++) { const a = a1 + ((TAU - (a1 - a0)) * k) / nk; rim.push([Math.cos(a) * 0.5015, Math.sin(a) * 0.5015]); }
  wall(rim, (x, z) => hf(x / 1.003, z / 1.003) - 0.001, (x, z) => Math.hypot(x, z), 0);
  // --- the Treasury facade ----------------------------------------------------------------------------
  const U = 0.5 / 830, GB = G + 0.014;
  const X = (px: number) => (px - 478) * U, Y = (py: number) => GB + (1340 - py) * U;
  const Z0 = ZF + 0.004;
  // carved back plane (smoother, paler stone than the raw cliff) and the cut recess above
  m.box(ID, 0, G - 0.002, Z0, 0.56, Y(300) - G, 0.012, shade(FC, 0.9), false, false);
  m.box(ID, 0, Y(300), Z0 - 0.002, 0.5, 0.05, 0.008, shade(FC, 0.82), false, false);
  // podium steps
  for (let k = 0; k < 3; k++) m.box(ID, 0, G + k * 0.005, ZF + 0.07 - k * 0.012, 0.54 - k * 0.012, 0.005, 0.03, shade(FC, 1 - k * 0.03), false, false);
  const D1 = ZF + 0.048;
  const corinth = (x: number, y0: number, y1: number, z: number, rr: number, c: string) => {
    const hc = (y1 - y0) * 0.11;
    m.box(ID, x, y0, z, rr * 2.6, rr * 0.7, rr * 2.6, shade(c, 0.95));
    m.prism(ID, x, y0 + rr * 0.7, z, rr * 1.15, rr * 0.4, 10, c, rr);
    m.prism(ID, x, y0 + rr * 1.1, z, rr, y1 - y0 - hc - rr * 1.1, 10, c, rr * 0.92);
    // acanthus capital: two leaf tiers flaring under the abacus
    m.prism(ID, x, y1 - hc, z, rr * 0.95, hc * 0.5, 10, shade(c, 1.06), rr * 1.25);
    m.prism(ID, x, y1 - hc * 0.5, z, rr * 1.2, hc * 0.38, 10, shade(c, 1.1), rr * 1.5);
    m.box(ID, x, y1 - hc * 0.12, z, rr * 3.2, hc * 0.12, rr * 3.2, shade(c, 1.04));
  };
  // lower storey: outer bays with Dioscuri reliefs, recessed vestibule and door, six columns
  const LC = [110, 255, 383, 572, 697, 840];
  for (const sg of [-1, 1]) {
    const xa = X(sg < 0 ? 85 : 785), xb = X(sg < 0 ? 280 : 870);
    m.box(ID, (xa + xb) / 2, GB, ZF + 0.02, Math.abs(xb - xa), Y(960) - GB, 0.034, FC);
    // equestrian relief: rider and horse
    const rx = X(sg < 0 ? 188 : 770);
    m.box(ID, rx, Y(1270), ZF + 0.038, 0.034, 0.02, 0.006, shade(FC, 0.92));
    pblob(gp, shade(FC, 0.95), rx, Y(1180), ZF + 0.039, 0.02, 0.014, 0.006, undefined, [0, 0, 0], 8);
    pblob(gp, shade(FC, 0.97), rx + sg * 0.006, Y(1140), ZF + 0.04, 0.007, 0.016, 0.005, undefined, [0, 0, 0], 6);
  }
  m.box(ID, 0, GB, ZF + 0.008, X(700) - X(256), Y(960) - GB, 0.012, shade(FC, 0.68));
  m.box(ID, 0, GB, ZF + 0.02, 0.085, Y(1060) - GB, 0.004, shade(FC, 1.06));
  m.box(ID, 0, GB, ZF + 0.021, 0.062, Y(1100) - GB, 0.004, '#2b1a14');
  m.box(ID, 0, Y(1100), ZF + 0.022, 0.07, 0.008, 0.004, shade(FC, 1.1));
  for (const px of LC) corinth(X(px), GB, Y(960), D1, 0.0135, FC);
  // entablature: architrave, frieze with scrolls and urns, projecting cornice
  m.box(ID, 0, Y(960), ZF + 0.03, X(880) - X(70), Y(930) - Y(960), 0.042, shade(FC, 1.04));
  m.box(ID, 0, Y(930), ZF + 0.03, X(880) - X(70), Y(885) - Y(930), 0.04, FC);
  for (let k = 0; k < 14; k++) {
    const px = 100 + k * 55;
    m.box(ID, X(px), Y(925), ZF + 0.051, 0.012, 0.016, 0.003, shade(FC, k % 2 ? 1.12 : 0.88));
  }
  m.box(ID, 0, Y(885), ZF + 0.034, X(895) - X(55), Y(865) - Y(885), 0.05, shade(FC, 1.1));
  // pediment over the central four columns with raking cornices and tympanum relief
  const PZ0 = ZF + 0.035, PZ1 = ZF + 0.058;
  m.poly(ID, [[X(230), Y(865)], [X(726), Y(865)], [X(478), Y(800)]], PZ0, PZ1 - 0.006, shade(FC, 0.93));
  m.strut(ID, X(205), Y(868), X(478), Y(792), 0.009, 0.026, shade(FC, 1.1), PZ0 + 0.013);
  m.strut(ID, X(478), Y(792), X(751), Y(868), 0.009, 0.026, shade(FC, 1.1), PZ0 + 0.013);
  pblob(gp, shade(FC, 0.98), 0, Y(845), PZ1 - 0.006, 0.03, 0.01, 0.004, undefined, [0, 0, 0], 8);
  for (const px of [100, 856]) pblob(gp, shade(FC, 0.96), X(px), Y(845), ZF + 0.045, 0.014, 0.012, 0.012, undefined, [0, 0, 0], 8);

  // upper storey: attic band, tholos, side pavilions with broken half-pediments
  m.box(ID, 0, Y(865), ZF + 0.012, X(870) - X(80), Y(790) - Y(865), 0.03, shade(FC, 0.96));
  m.box(ID, 0, Y(810), ZF + 0.012, X(870) - X(80), 0.006, 0.033, shade(FC, 1.08));
  const TC = ZF + 0.022, TR = 0.06, UB = Y(790), UT = Y(550);
  rev(m, [[0.044, 0], [0.044, UT - UB]], 0, UB, TC, 16, shade(FC, 0.78), Math.PI / 16);
  for (const a of [-0.5, -1.15, -1.95, -2.64]) {
    const cx = Math.cos(a + Math.PI) * -TR, cz = TC - Math.sin(a + Math.PI) * -TR;
    if (cz > ZF + 0.004) corinth(cx, UB, UT, cz, 0.011, FC);
  }
  m.box(ID, 0, UB, TC + 0.044, 0.014, 0.012, 0.012, shade(FC, 1.05));
  pblob(gp, shade(FC, 1.02), 0, UB + 0.045, TC + 0.047, 0.009, 0.03, 0.006, undefined, [0, 0, 0], 8);
  rev(m, [[TR + 0.012, 0], [TR + 0.012, 0.014], [TR + 0.008, 0.016], [TR + 0.008, 0.03], [TR + 0.016, 0.033], [TR + 0.016, 0.04], [0, 0.04]], 0, UT, TC, 22,
    (i, j) => (i === 3 && j % 2 ? shade(FC, 0.9) : shade(FC, 1.04)));
  rev(m, [[TR + 0.004, 0], [0.04, 0.03], [0.02, Y(390) - UT - 0.04]], 0, UT + 0.04, TC, 16, shade(FC, 0.98));
  const CB = Y(390);
  rev(m, [[0.016, 0], [0.024, 0.016], [0.03, 0.026], [0.03, 0.03], [0.012, 0.032], [0.016, 0.045], [0.02, 0.058], [0.012, 0.068], [0.006, 0.074], [0, 0.076]],
    0, CB, TC, 10, (i) => (i < 4 ? shade(FC, 1.08) : shade(FC, 1.0)));
  for (const sg of [-1, 1]) {
    const xo = X(sg < 0 ? 110 : 840), xi = X(sg < 0 ? 255 : 697), cx = (xo + xi) / 2;
    m.box(ID, cx, UB, ZF + 0.016, Math.abs(xi - xo) + 0.02, UT - UB, 0.02, shade(FC, 0.9));
    corinth(xo, UB, UT, ZF + 0.04, 0.0125, FC);
    corinth(xi, UB, UT, ZF + 0.04, 0.0125, FC);
    // recessed columns between pavilion and tholos
    for (const px of sg < 0 ? [300, 395] : [565, 660]) corinth(X(px), UB, UT - 0.008, ZF + 0.022, 0.0105, shade(FC, 0.94));
    // relief figure (Amazon) on a pedestal between the pavilion columns
    m.box(ID, cx, UB, ZF + 0.03, 0.03, 0.03, 0.012, shade(FC, 1.04));
    pblob(gp, shade(FC, 0.96), cx, UB + 0.07, ZF + 0.028, 0.016, 0.036, 0.006, undefined, [0, 0, 0], 8);
    // pavilion entablature and the broken half-pediment, rising toward the tholos
    m.box(ID, cx, UT, ZF + 0.03, Math.abs(xi - xo) + 0.05, Y(500) - UT, 0.05, shade(FC, 1.04));
    m.box(ID, cx, Y(500), ZF + 0.032, Math.abs(xi - xo) + 0.06, Y(470) - Y(500), 0.056, shade(FC, 1.1));
    const xe = X(sg < 0 ? 45 : 911), xk = X(sg < 0 ? 300 : 656);
    m.poly(ID, [[xe, Y(470)], [xk, Y(470)], [xk, Y(372)]], ZF + 0.012, ZF + 0.05, shade(FC, 0.95));
    m.strut(ID, xe, Y(472), xk, Y(366), 0.008, 0.044, shade(FC, 1.1), ZF + 0.033);
    pblob(gp, shade(FC, 0.92), xk - sg * 0.01, Y(350), ZF + 0.035, 0.011, 0.014, 0.01, undefined, [0, 0, 0], 8);
    pblob(gp, shade(FC, 0.92), xe + sg * 0.01, Y(440), ZF + 0.035, 0.008, 0.01, 0.008, undefined, [0, 0, 0], 8);
    // climbing notches cut up the facade margins
    for (let k = 0; k < 22; k++) {
      const px = sg < 0 ? 30 + (k % 2) * 14 : 925 - (k % 2) * 14;
      m.box(ID, X(px), Y(1300 - k * 45), Z0 + 0.006, 0.007, 0.008, 0.002, '#7a3d33', false, false);
    }
  }
  // camels resting on the plaza, a standing one and visitors
  camel(gp, m, -0.13, G, 0.12, 0.1, true, ['#b91c1c', '#1e3a8a', '#e5e7eb', '#b91c1c']);
  camel(gp, m, 0.08, G, 0.16, 0.25, true, ['#7c2d12', '#dc2626', '#facc15', '#dc2626', '#7c2d12']);
  camel(gp, m, 0.2, G, 0.02, -2.4, false, ['#1d4ed8', '#e5e7eb', '#1d4ed8']);
  for (const [px, pz, c] of [[-0.05, 0.02, '#f8fafc'], [-0.02, 0.05, '#1e3a8a'], [0.13, 0.07, '#334155'], [0.05, -0.03, '#ef4444'], [-0.2, 0.2, '#0f766e'], [0.24, 0.24, '#f59e0b']] as const) {
    person(m, px, G, pz, c, 1.3);
  }
  m.build(gp);
  w.build(gp);
};

export const ICONS2: Record<string, Builder> = { redeemer, burj, cntower, petra };
