import { type Builder, type Paint, type V3, lathe, tbox, shade, mix, fbm, hash3 } from '../prims.ts';
import { island, strataSide, sstep } from '../nature.ts';
import { pblob } from '../animals.ts';
import { Mesh3, type Xf, xform, ID, frame } from '../kit/euro.ts';

// Hero builders for the three oldest "postcard" landmarks: pyramids (Giza), eiffel, taj. Keyed by recipe.hero.
// Everything rigid is emitted into one Mesh3 per model (flat, per-face coloured), which keeps the bake fast.

const TAU = Math.PI * 2;

/** Square-section member from a to b (width w), 4 side faces — the lattice/girder primitive. */
function beam(m: Mesh3, a: V3, b: V3, w: number, c: string): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / l, dy / l, dz / l];
  const up: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: V3 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  const ul = Math.hypot(...u) || 1;
  u = [(u[0] / ul) * (w / 2), (u[1] / ul) * (w / 2), (u[2] / ul) * (w / 2)];
  const v: V3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const P = (o: V3, s: number, t: number): V3 => [o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t];
  const sides: [number, number, number, number][] = [[1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1]];
  for (const [s0, t0, s1, t1] of sides) {
    const ox = (s0 + s1) / 2, oy = (t0 + t1) / 2, out: V3 = [u[0] * ox + v[0] * oy, u[1] * ox + v[1] * oy, u[2] * ox + v[2] * oy];
    const lit = 0.9 + 0.15 * Math.max(-1, Math.min(1, (out[1] * 2 + out[2]) / (w || 1)));
    m.quad(P(a, s0, t0), P(b, s0, t0), P(b, s1, t1), P(a, s1, t1), shade(c, lit), out);
  }
}

/** Lathe in a Mesh3 (flat facets): profile [r, y] revolved n times about (x, y, z). */
function rev(m: Mesh3, T: Xf, prof: [number, number][], x: number, y: number, z: number, n: number, c: string | ((i: number) => string)): void {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], cc = typeof c === 'string' ? c : c(i);
    for (let j = 0; j < n; j++) {
      const a0 = (j / n) * TAU, a1 = ((j + 1) / n) * TAU, am = (a0 + a1) / 2;
      const P = (r: number, yy: number, a: number): V3 => T([x + Math.cos(a) * r, y + yy, z + Math.sin(a) * r]);
      const lit = shade(cc, 0.93 + 0.1 * Math.cos(am - 2.2));
      const out: V3 = [Math.cos(am), (r0 - r1) / (Math.hypot(r0 - r1, y1 - y0) || 1), Math.sin(am)];
      if (r0 < 1e-6) m.tri(P(r0, y0, a0), P(r1, y1, a1), P(r1, y1, a0), lit, out);
      else if (r1 < 1e-6) m.tri(P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a0), lit, out);
      else m.quad(P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), lit, out);
    }
  }
}

/** Flat ground rectangle (top face only) slightly above y — lawns, paths, water. */
function flat(m: Mesh3, x0: number, z0: number, x1: number, z1: number, y: number, c: string): void {
  m.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], c, [0, 1, 0]);
}

/** Small stylised tree: 6-sided canopy frustum + cone (rows of plane trees, cypresses with tall/narrow params). */
function tree(m: Mesh3, x: number, y: number, z: number, r: number, h: number, c: string, trunk = 0.25): void {
  if (trunk > 0) m.prism(ID, x, y, z, r * 0.12, h * trunk, 4, '#5b4632');
  const yb = y + h * trunk, hh = h - h * trunk, a0 = hash3(x * 97, z * 61, 3) * TAU;
  m.prism(ID, x, yb, z, r * 0.7, hh * 0.45, 6, shade(c, 0.95), r, a0, false);
  m.prism(ID, x, yb + hh * 0.45, z, r, hh * 0.55, 6, shade(c, 1.05), 0, a0, false);
}

// ---------------------------------------------------------------------------------------------------------
// EIFFEL TOWER — 330 m wrought-iron lattice: four curved legs (exponential profile) meeting at the 2nd floor,
// decorative arches on the first stage, two gallery platforms, tapering upper shaft, top cabin and antenna.
// ---------------------------------------------------------------------------------------------------------
const eiffel: Builder = (gp) => {
  const K = 0.0034, G = 0.03, m = new Mesh3(), L = new Mesh3();
  const IRON = '#6e5642', IRON2 = '#7d6450', DECK = '#5f4a39';
  const W = (y: number) => (57.5 * Math.exp(-y / 87.6) + 5) * K;      // outer half-width at height y (m)
  const LW = (y: number) => (y < 115 ? 25 - 10 * (y / 115) : 15 - 10 * Math.min(1, (y - 115) / 161)) * K;
  const Y = (y: number) => G + y * K;
  const wC = 2.6 * K, wD = 1.5 * K;

  // ground: Champ de Mars lawn in front, gravel esplanade, Seine embankment behind
  const H = 0.46;
  m.box(ID, 0, 0, 0, H * 2, G, H * 2, '#8d7b62');
  flat(m, -H, -H, H, H, G + 0.0003, '#d9cfb6');
  flat(m, -H, -H, H, -0.36, G + 0.0006, '#3f7fa6');
  flat(m, -H, -0.36, H, -0.345, G + 0.0009, '#b9ad94');
  for (const sx of [-1, 1]) {
    flat(m, sx * 0.045, 0.27, sx * 0.2, H - 0.02, G + 0.0006, '#6f9a4c');
    flat(m, sx * 0.06, 0.29, sx * 0.185, H - 0.035, G + 0.0009, '#7aa856');
    flat(m, sx * 0.29, -0.32, sx * 0.44, 0.26, G + 0.0006, '#6f9a4c');
    for (let z = 0.29; z < H - 0.01; z += 0.035) { tree(m, sx * 0.23, G, z, 0.016, 0.05, '#4f7d3c'); tree(m, sx * 0.43, G, z, 0.016, 0.05, '#4a7638'); }
    for (let z = -0.3; z < 0.25; z += 0.04) tree(m, sx * 0.36, G, z + 0.02 * sx, 0.018, 0.055, '#4d7a3b');
  }
  for (let x = -0.24; x <= 0.24; x += 0.04) tree(m, x, G, -0.315, 0.015, 0.045, '#517f3e');

  // legs: four curved box-section columns, each with 4 chords, X-braced faces and horizontal ties
  const lower = [0, 7, 14, 21, 29, 37, 46, 57, 66, 76, 86, 96, 105, 115];
  const upper = [115, 126, 138, 150, 163, 176, 190, 204, 219, 234, 249, 263, 276];
  const legPt = (sx: number, sz: number, y: number, ix: number, iz: number): V3 => {
    const w = W(y), lw = LW(y);
    return [sx * (w - ix * lw), Y(y), sz * (w - iz * lw)];
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const corners: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let k = 0; k < lower.length - 1; k++) {
      const y0 = lower[k], y1 = lower[k + 1];
      for (const [ix, iz] of corners) beam(m, legPt(sx, sz, y0, ix, iz), legPt(sx, sz, y1, ix, iz), wC, IRON);
      for (let f = 0; f < 4; f++) {
        const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
        beam(L, legPt(sx, sz, y0, ax, az), legPt(sx, sz, y1, bx, bz), wD, IRON2);
        beam(L, legPt(sx, sz, y0, bx, bz), legPt(sx, sz, y1, ax, az), wD, IRON2);
        beam(L, legPt(sx, sz, y1, ax, az), legPt(sx, sz, y1, bx, bz), wD, IRON2);
        // secondary diamond lattice inside each braced panel (reads as fine ironwork from afar)
        if (y1 <= 57) {
          const mid = (yy: number): V3 => { const p = legPt(sx, sz, yy, ax, az), q = legPt(sx, sz, yy, bx, bz); return [(p[0] + q[0]) / 2, p[1], (p[2] + q[2]) / 2]; };
          const ym = (y0 + y1) / 2;
          beam(L, mid(y0), legPt(sx, sz, ym, ax, az), wD * 0.7, IRON2);
          beam(L, mid(y0), legPt(sx, sz, ym, bx, bz), wD * 0.7, IRON2);
          beam(L, mid(y1), legPt(sx, sz, ym, ax, az), wD * 0.7, IRON2);
          beam(L, mid(y1), legPt(sx, sz, ym, bx, bz), wD * 0.7, IRON2);
        }
      }
    }
    // masonry pier under each foot
    const lw0 = LW(0), cx = sx * (W(0) - lw0 / 2), cz = sz * (W(0) - lw0 / 2);
    m.box(ID, cx, G, cz, lw0 * 1.15, 0.006, lw0 * 1.15, '#b7aa93');
  }

  // upper shaft: 4 corner columns + X-braced faces spanning between them
  for (let k = 0; k < upper.length - 1; k++) {
    const y0 = upper[k], y1 = upper[k + 1];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (const [ix, iz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as [number, number][]) beam(m, legPt(sx, sz, y0, ix, iz), legPt(sx, sz, y1, ix, iz), wC * 0.85, IRON);
    }
    for (let f = 0; f < 4; f++) {
      const a = (f / 4) * TAU, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
      const fp = (y: number, t: number): V3 => { const w = W(y), e = w - LW(y); return [c * w - s * e * t, Y(y), s * w + c * e * t]; };
      beam(L, fp(y0, -1), fp(y1, 1), wD, IRON2);
      beam(L, fp(y0, 1), fp(y1, -1), wD, IRON2);
      beam(L, fp(y1, -1), fp(y1, 1), wD, IRON2);
      // inner faces of the corner columns
      for (const t of [-1, 1]) {
        const ip = (y: number, u: number): V3 => { const w = W(y), e = w - LW(y); return [c * (w - (w - e) * u) - s * e * t, Y(y), s * (w - (w - e) * u) + c * e * t]; };
        beam(L, ip(y0, 0), ip(y1, 1), wD * 0.8, IRON2);
      }
    }
  }

  // first-stage arches on each face: double ring (intrados + extrados) with radial lacing and hangers to the frieze
  for (let f = 0; f < 4; f++) {
    const T = xform(0, 0, 0, (f / 4) * TAU);
    const zf = (y: number) => W(y) - 0.3 * LW(y);
    const N = 20, inner: V3[] = [], outer: V3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI, ci = Math.cos(t), si = Math.sin(t);
      const yi = 2 + 38 * si, yo = 2 + 43 * si;
      inner.push(T([39 * K * ci, Y(yi), zf(yi)]));
      outer.push(T([41 * K * ci, Y(yo), zf(yo)]));
    }
    for (let i = 0; i < N; i++) {
      beam(m, inner[i], inner[i + 1], wC * 1.1, IRON);
      beam(m, outer[i], outer[i + 1], wC * 0.8, IRON);
      beam(L, i % 2 ? inner[i] : outer[i], i % 2 ? outer[i + 1] : inner[i + 1], wD * 0.8, IRON2);
    }
    for (let i = 3; i <= N - 3; i++) {
      const o = outer[i], x = 41 * K * Math.cos((i / N) * Math.PI);
      if (Math.abs(x) < W(50) - LW(50)) beam(L, o, T([x, Y(50), zf(50)]), wD * (i % 2 ? 0.7 : 1), IRON2);
    }
  }

  // platforms: deck ring, arcaded frieze, railing and pavilions
  const platform = (y: number, ext: number, fh: number, nA: number, pav: boolean) => {
    const w = W(y) + ext, inn = Math.max(0.01, W(y) - LW(y) * 0.9);
    for (let f = 0; f < 4; f++) {
      const ry = (f / 4) * TAU, T = xform(0, 0, 0, ry);
      m.box(T, 0, Y(y) - 0.004, (w + inn) / 2, w * 2, 0.004, w - inn, DECK);
      const Tf = xform(Math.sin(ry) * w, Y(y) - fh * K, Math.cos(ry) * w, ry);
      const aw = (w * 2) / nA;
      for (let i = 0; i < nA; i++) m.arch(Tf, -w + aw * (i + 0.5), 0, aw, fh * K, 0.0025, aw * 0.62, fh * K * 0.12, fh * K * 0.68, '#86694f', 'arch', 4, true, false);
      m.box(T, 0, Y(y), w - 0.001, w * 2, 0.0035, 0.0015, '#5b4636');
      if (pav) {
        m.box(T, 0, Y(y), w * 0.62, w * 0.9, 6 * K, w * 0.22, '#a9bccb');
        m.box(T, 0, Y(y) + 6 * K, w * 0.62, w * 0.94, 0.0015, w * 0.25, '#6e5642');
      }
    }
  };
  platform(57, 1.5 * K, 7, 15, true);
  platform(115, 1.5 * K, 5, 9, false);
  // 2nd floor upper deck pavilion
  m.box(ID, 0, Y(115), 0, W(115) * 1.1, 5 * K, W(115) * 1.1, '#9fb2c0');

  // summit: platform, cabin, lantern, antenna
  const yt = 276;
  m.box(ID, 0, Y(yt) - 0.004, 0, W(yt) * 2.5, 0.006, W(yt) * 2.5, '#7a604a');
  m.box(ID, 0, Y(yt) + 0.002, 0, W(yt) * 1.8, 10 * K, W(yt) * 1.8, '#a5b4bf');
  m.box(ID, 0, Y(yt + 10), 0, W(yt) * 2.0, 0.003, W(yt) * 2.0, '#6e5642');
  m.prism(ID, 0, Y(yt + 11), 0, 4 * K, 9 * K, 8, '#7d6450', 3 * K);
  m.prism(ID, 0, Y(yt + 20), 0, 2.4 * K, 8 * K, 8, '#c9c4ba');
  m.prism(ID, 0, Y(yt + 28), 0, 1.6 * K, 12 * K, 6, '#d8d3ca', 1.0 * K);
  m.prism(ID, 0, Y(yt + 40), 0, 0.9 * K, 14 * K, 6, '#e6e1d8', 0.4 * K);
  for (const a of [0.4, 2.3, 4.1]) m.prism(ID, Math.cos(a) * 2.2 * K, Y(yt + 32), Math.sin(a) * 2.2 * K, 1.3 * K, 1.2 * K, 6, '#e8e4dc');

  m.build(gp, 0.25);
  L.build(gp, 0.25);
};

// ---------------------------------------------------------------------------------------------------------
// GIZA — Khufu (truncated, stepped core), Khafre (casing cap at the apex), Menkaure + three queens' pyramids,
// the Great Sphinx facing east (+z) in its quarry enclosure, causeway, valley temple, mastabas, dunes, camels.
// Mapping: east = +z, north = -x.
// ---------------------------------------------------------------------------------------------------------
const LIME = ['#d7b679', '#cfac6c', '#dcbd84', '#c9a465', '#d3b073'];

/** Stepped pyramid: n courses, each a vertical riser broken into blocks + a sunlit tread; optional smooth cap. */
function stepPyramid(m: Mesh3, cx: number, y: number, cz: number, b: number, h: number, n: number,
  o: { cap?: number; capC?: string; top?: number; pal?: string[]; granite?: number; seed?: number } = {}): void {
  const pal = o.pal ?? LIME, capY = o.cap ? h * (1 - o.cap) : h, topY = h * (1 - (o.top ?? 0)), sd = o.seed ?? 1;
  const half = (yy: number) => (b / 2) * (1 - yy / h);
  const dirs: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * h, y1 = ((i + 1) / n) * h;
    if (y0 >= capY - 1e-6 || y0 >= topY - 1e-6) break;
    const yy1 = Math.min(y1, capY, topY), s0 = half(y0) + (b / n) * 0.18, s1 = half(yy1) + (b / n) * 0.18;
    const gran = o.granite && i < o.granite;
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = dirs[f], tx = -dz, tz = dx;
      const nb = Math.max(2, Math.round((s0 * 2) / (b * 0.09)));
      for (let k = 0; k < nb; k++) {
        const u0 = -s0 + (2 * s0 * k) / nb, u1 = -s0 + (2 * s0 * (k + 1)) / nb;
        const hv = hash3(i * 7 + f, k, sd);
        // weathered blocks: slight random set-back on the riser and tone change
        const inset = hv > 0.8 ? (b / n) * 0.12 : 0, sf = s0 - inset;
        const c = gran ? shade('#9c6b55', 0.9 + 0.15 * hv) : shade(pal[Math.floor(hv * pal.length)], 0.86 + 0.08 * hash3(k, i, sd + 3));
        const P = (u: number, yy: number, r: number): V3 => [cx + dx * r + tx * u, y + yy, cz + dz * r + tz * u];
        m.quad(P(u0, y0, sf), P(u1, y0, sf), P(u1, yy1, sf), P(u0, yy1, sf), c, [dx, 0, dz]);
      }
      // tread (top of the course), lit from above
      const P = (u: number, r: number): V3 => [cx + dx * r + tx * u, y + yy1, cz + dz * r + tz * u];
      const tc = gran ? '#a87862' : shade(pal[(i + f) % pal.length], 1.06);
      m.quad(P(-s0, s0), P(s0, s0), P(s1, s1), P(-s1, s1), tc, [0, 1, 0]);
    }
  }
  if (o.cap && capY < topY) {
    // surviving Tura-limestone casing: smooth, paler faces from capY to the apex, slightly proud of the core
    const s0 = half(capY) + (b / n) * 0.25, cc = o.capC ?? '#e8d6b0';
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = dirs[f], tx = -dz, tz = dx;
      const P = (u: number, r: number, yy: number): V3 => [cx + dx * r + tx * u, y + yy, cz + dz * r + tz * u];
      m.tri(P(-s0, s0, capY), P(s0, s0, capY), P(0, 0, h), shade(cc, f === 0 ? 1.02 : f === 1 ? 1.06 : 0.92), [dx, 0.5, dz]);
    }
  } else if (topY < h) {
    const s1 = half(topY) + (b / n) * 0.18;
    m.box(ID, cx, y + topY, cz, s1 * 1.2, b * 0.004, s1 * 1.2, '#c9a465');
  }
}

const pyramids: Builder = (root) => {
  // Composed like the classic plateau panorama: Menkaure and its queens in front, Khafre (casing cap) in the
  // middle, Khufu behind; the Sphinx crouches front-right. Local +x ≈ screen right, +z ≈ toward the viewer.
  const gp = frame(root, 0, 0, 0, -0.8), m = new Mesh3();
  const hf = (x: number, z: number) => {
    const r = Math.hypot(x, z), rim = sstep(0.47, 0.56, r);
    const dune = 0.5 + 0.5 * Math.sin(x * 22 - z * 14 + fbm(x * 4, 0, z * 4) * 3);
    return rim * (0.01 + 0.02 * dune) + 0.0025 * fbm(x * 18, 1, z * 18);
  };
  const sand: Paint = (x, y, z) => {
    const rip = Math.sin(x * 160 + z * 90 + fbm(x * 9, 0, z * 9) * 5);
    const base = mix(mix('#e0c28b', '#d6b67c', fbm(x * 6, 2, z * 6)), '#cfa86b', sstep(0.045, 0.07, y));
    return shade(base, 1 + 0.025 * rip);
  };
  island(gp, 0.56, hf, '#ddbf87', sand, { rings: 30, segs: 96, side: strataSide(['#b8915a', '#a9814e', '#c49c63', '#9c7646']) });
  const G = (x: number, z: number) => 0.035 + hf(x, z) - 0.001;

  // Khufu (stripped of casing, flattened top), Khafre on higher rock with its surviving casing cap, Menkaure with the
  // granite-cased lower courses, and Menkaure's three queens' pyramids (the eastern one larger, the others stepped ruins)
  stepPyramid(m, 0.21, G(0.21, -0.15), -0.15, 0.42, 0.31, 54, { top: 0.025, seed: 1 });
  stepPyramid(m, -0.21, G(-0.21, -0.01) + 0.01, -0.01, 0.4, 0.3, 52, { cap: 0.2, capC: '#ecdcb4', seed: 2 });
  stepPyramid(m, -0.27, G(-0.27, 0.3), 0.3, 0.19, 0.14, 28, { granite: 5, seed: 3 });
  stepPyramid(m, -0.1, G(-0.1, 0.33), 0.33, 0.07, 0.048, 9, { seed: 4 });
  stepPyramid(m, -0.02, G(-0.02, 0.36), 0.36, 0.055, 0.034, 6, { seed: 5, top: 0.3 });
  stepPyramid(m, 0.05, G(0.05, 0.39), 0.39, 0.055, 0.032, 6, { seed: 6, top: 0.35 });

  // mortuary temples at the east faces, a few low mastabas, the valley temple beside the Sphinx
  const ruin = (x: number, z: number, w: number, d: number, h: number, c = '#c7a56f') => m.box(ID, x, G(x, z), z, w, h, d, c);
  ruin(0.2, 0.075, 0.07, 0.03, 0.008);
  ruin(-0.2, 0.2, 0.06, 0.026, 0.007);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = 0.43 + j * 0.03, z = -0.06 + i * 0.045 + j * 0.02;
    ruin(x, z, 0.016, 0.032, 0.005 + 0.003 * hash3(i, j, 5), shade('#c9a46a', 0.92 + 0.1 * hash3(j, i, 6)));
  }
  for (let i = 0; i < 3; i++) ruin(-0.45 + i * 0.03, -0.14 + (i % 2) * 0.03, 0.015, 0.03, 0.005, '#c2a067');

  // Great Sphinx: lion body with outstretched paws and tucked haunches, nemes headdress, in its quarried enclosure
  const sx = 0.22, sz = 0.245, sry = 0.55, L = 0.32, sy = G(sx, sz) - 0.006, S = xform(sx, sy, sz, sry), sgp = frame(gp, sx, 0, sz, sry);
  m.box(S, 0, 0, 0.04 * L, 0.52 * L, 0.0062, 1.06 * L, '#c9a874');
  for (const k of [-1, 1]) m.box(S, k * 0.28 * L, 0, 0.02 * L, 0.04 * L, 0.011, 1.02 * L, shade('#bf9a62', k < 0 ? 0.95 : 1));
  m.box(S, 0, 0, -0.5 * L, 0.6 * L, 0.012, 0.04 * L, '#b8935c');
  m.box(S, 0.45 * L, 0, 0.32 * L, 0.18 * L, 0.014, 0.26 * L, '#a48466');
  const sb = 0.006 + sy;
  const strata: Paint = (_x, y) => ['#c0915a', '#b2844f', '#cba06a', '#aa7d49', '#c39860'][(Math.floor((y - sb) * 500) % 5 + 5) % 5];
  const B = (x: number, y: number, z: number, rx: number, ry: number, rz: number, seg = 14, c = '#c99f63') =>
    pblob(sgp, c, x * L, sb + y * L, z * L, rx * L, ry * L, rz * L, strata, [0, 0, 0], seg);
  B(0, 0.1, -0.1, 0.1, 0.085, 0.3, 18);
  B(0, 0.1, -0.33, 0.12, 0.08, 0.11);
  B(0, 0.13, 0.1, 0.095, 0.11, 0.11);
  for (const k of [-1, 1]) {
    B(k * 0.048, 0.032, 0.32, 0.04, 0.034, 0.2, 10, '#c49a5e');
    B(k * 0.048, 0.03, 0.5, 0.04, 0.028, 0.035, 8, '#c49a5e');
    B(k * 0.11, 0.035, -0.32, 0.032, 0.036, 0.1, 10, '#c49a5e');
  }
  B(0.12, 0.012, -0.2, 0.012, 0.012, 0.14, 6, '#bb9058');
  // head: trapezoid nemes with flaring lappets, rounded crown, flat face and dark eye band
  tbox(sgp, 0.18 * L, 0.1 * L, 0.11 * L, 0.1 * L, 0.13 * L, '#c49a5e', 0, sb + 0.15 * L, 0.18 * L, 0, 0, 0);
  B(0, 0.29, 0.18, 0.06, 0.06, 0.065, 12, '#c49a5e');
  const H = xform(sx, sb, sz, sry);
  m.box(H, 0, 0.19 * L, 0.235 * L, 0.075 * L, 0.12 * L, 0.04 * L, '#d0a96f');
  m.box(H, 0, 0.27 * L, 0.255 * L, 0.065 * L, 0.012 * L, 0.004 * L, '#6e5236');
  m.box(H, 0, 0.225 * L, 0.257 * L, 0.014 * L, 0.03 * L, 0.006 * L, '#b48c58');
  m.box(H, 0, 0.15 * L, 0.23 * L, 0.035 * L, 0.045 * L, 0.04 * L, '#b48c58');

  // a small caravan of camels crossing the sand in front of the queens
  const camel = (x: number, z: number, ry: number) => {
    const T = xform(x, G(x, z), z, ry), C = '#9b7148';
    for (const [lx, lz] of [[-0.003, -0.006], [0.003, -0.006], [-0.003, 0.006], [0.003, 0.006]]) m.box(T, lx, 0, lz, 0.0016, 0.011, 0.0016, shade(C, 0.85));
    m.box(T, 0, 0.011, 0, 0.007, 0.006, 0.018, C);
    m.prism(T, 0, 0.017, -0.001, 0.0035, 0.004, 5, shade(C, 1.06), 0.001);
    m.strut((v) => T([v[2], v[1], v[0]]), 0.008, 0.014, 0.013, 0.022, 0.003, 0.003, C);
    m.box(T, 0, 0.02, 0.016, 0.0035, 0.003, 0.007, C);
  };
  camel(-0.22, 0.44, 1.6); camel(-0.18, 0.445, 1.6); camel(-0.14, 0.45, 1.65);
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// TAJ MAHAL — chamfered-square marble mausoleum on its plinth: pishtaq iwans on every face, double-stacked
// side alcoves, onion dome on a drum with gilt finial, four chhatris, four outward-leaning minarets; the red
// sandstone mosque and jawab flanking; the charbagh garden with the long reflecting pool and cypress rows.
// ---------------------------------------------------------------------------------------------------------
const taj: Builder = (gp) => {
  const m = new Mesh3(), F = 0.4, G = 0.02, zc = -0.1, yT = G + 0.012, yP = yT + 0.12 * F;
  const WM = '#f2eee4', WM2 = '#e4ded1', RED = '#b0583e', GOLD = '#c9a24a', INLAY = '#8f8a7f';
  const C = xform(0, yP, zc);

  // ground, river Yamuna behind, red riverfront terrace
  m.box(ID, 0, 0, 0, 0.96, G, 0.96, '#8b7a63');
  flat(m, -0.48, -0.48, 0.48, 0.48, G + 0.0003, '#6f9a4c');
  flat(m, -0.48, -0.48, 0.48, -0.44, G + 0.0006, '#6c95ad');
  m.box(ID, 0, G, -0.0925, 0.94, 0.012, 0.695, RED);
  flat(m, -0.47, -0.44, 0.47, 0.255, yT + 0.0003, '#c06a4c');

  // plinth with blind arcade on all four sides
  m.box(ID, 0, yT, zc, 1.72 * F, 0.12 * F, 1.72 * F, WM);
  for (let k = 0; k < 4; k++) {
    const ry = (k / 4) * TAU, d = 0.86 * F, T = xform(Math.sin(ry) * d, yT, zc + Math.cos(ry) * d, ry), n = 11, w = (1.72 * F) / n, h = 0.12 * F;
    m.box(T, 0, h * 0.12, 0.0002, 1.72 * F - 0.004, h * 0.72, 0.0004, '#cdc4b4');
    for (let i = 0; i < n; i++) m.arch(T, -0.86 * F + w * (i + 0.5), 0, w, h, 0.003, w * 0.62, h * 0.14, h * 0.66, WM, 'pointed', 4, false, false);
  }

  // mausoleum core (shadowed iwan backs) — chamfered octagon inset behind the façade panels
  const c = 0.15 * F, e = 0.05 * F, hs = F / 2 - e, hc = 0.36 * F;
  m.plan(C, [[hs, hs - c + e], [hs - c + e, hs], [-(hs - c + e), hs], [-hs, hs - c + e], [-hs, -(hs - c + e)], [-(hs - c + e), -hs], [hs - c + e, -hs], [hs, -(hs - c + e)]], 0, hc, '#d3ccbf');
  for (let k = 0; k < 4; k++) {
    const ry = (k / 4) * TAU, T = xform(Math.sin(ry) * (F / 2), yP, zc + Math.cos(ry) * (F / 2), ry);
    const Tb = (v: V3): V3 => T([v[0], v[1], v[2] - 0.025 * F]), Tp = (v: V3): V3 => T([v[0], v[1], v[2] - 0.0175 * F]);
    for (const sx of [-1, 1]) {
      const bx = sx * 0.2625 * F;
      m.arch(Tb, bx, 0, 0.175 * F, 0.18 * F, 0.05 * F, 0.105 * F, 0.02 * F, 0.135 * F, WM, 'pointed', 6, false, false);
      m.arch(Tb, bx, 0.18 * F, 0.175 * F, 0.18 * F, 0.05 * F, 0.105 * F, 0.02 * F, 0.135 * F, WM, 'pointed', 6, true, false);
      m.box(T, sx * 0.17 * F, 0, 0, 0.018 * F, 0.4 * F, 0.034 * F, WM2);
      // guldasta pinnacles flanking the pishtaq
      m.prism(T, sx * 0.17 * F, 0.4 * F, 0, 0.011 * F, 0.05 * F, 8, WM, 0.009 * F);
      m.prism(T, sx * 0.17 * F, 0.45 * F, 0, 0.013 * F, 0.025 * F, 8, WM2, 0);
    }
    m.arch(Tp, 0, 0, 0.35 * F, 0.4 * F, 0.065 * F, 0.25 * F, 0, 0.31 * F, WM, 'pointed', 10, true, false);
    // iwan back wall: doorway and jali screen; calligraphy frame (alfiz) around the arch
    const zb = -0.0495 * F, zf = 0.0153 * F;
    m.tq(T, [-0.035 * F, 0, zb], [0.035 * F, 0, zb], [0.035 * F, 0.1 * F, zb], [-0.035 * F, 0.1 * F, zb], '#5e5446', [0, 0, 1]);
    m.tq(T, [-0.055 * F, 0.13 * F, zb], [0.055 * F, 0.13 * F, zb], [0.055 * F, 0.21 * F, zb], [-0.055 * F, 0.21 * F, zb], '#9c9384', [0, 0, 1]);
    for (const sx of [-1, 1]) m.tq(T, [sx * 0.137 * F, 0, zf], [sx * 0.145 * F, 0, zf], [sx * 0.145 * F, 0.345 * F, zf], [sx * 0.137 * F, 0.345 * F, zf], INLAY, [0, 0, 1]);
    m.tq(T, [-0.145 * F, 0.337 * F, zf], [0.145 * F, 0.337 * F, zf], [0.145 * F, 0.345 * F, zf], [-0.145 * F, 0.345 * F, zf], INLAY, [0, 0, 1]);
    // chamfered corner faces: two stacked alcoves each
    const ra = ry + Math.PI / 4, dc = Math.SQRT2 * (F / 2 - c / 2), Tc0 = xform(Math.sin(ra) * dc, yP, zc + Math.cos(ra) * dc, ra);
    const Tc = (v: V3): V3 => Tc0([v[0], v[1], v[2] - 0.025 * F]), wc = c * Math.SQRT2;
    m.arch(Tc, 0, 0, wc, 0.18 * F, 0.05 * F, 0.13 * F, 0.02 * F, 0.135 * F, WM, 'pointed', 6, false, false);
    m.arch(Tc, 0, 0.18 * F, wc, 0.18 * F, 0.05 * F, 0.13 * F, 0.02 * F, 0.135 * F, WM, 'pointed', 6, true, false);
    // slender corner turrets where façade planes meet
    for (const [px, pz] of [[F / 2 - c, F / 2], [F / 2, F / 2 - c]]) {
      const cs = Math.cos(ry), sn = Math.sin(ry), x = px * cs + pz * sn, z = -px * sn + pz * cs;
      m.prism(C, x, 0, z, 0.012 * F, 0.42 * F, 8, WM2, 0.01 * F);
      m.prism(C, x, 0.42 * F, z, 0.013 * F, 0.03 * F, 8, WM, 0);
    }
  }

  // drum, onion dome, lotus crown and gilt finial
  m.prism(C, 0, hc, 0, 0.205 * F, 0.175 * F, 28, WM, 0.205 * F);
  m.prism(C, 0, 0.5 * F, 0, 0.214 * F, 0.012 * F, 28, WM2, 0.214 * F);
  const dome: [number, number][] = [[0.185, 0.535], [0.205, 0.555], [0.225, 0.585], [0.236, 0.625], [0.238, 0.665], [0.231, 0.71], [0.213, 0.755], [0.185, 0.8], [0.148, 0.843], [0.108, 0.88], [0.07, 0.91], [0.04, 0.932], [0.018, 0.946], [0.001, 0.954]];
  lathe(gp, dome.map(([r, y]) => [r * F, y * F]), WM, 0, yP, zc, 36);
  const fin: [number, number][] = [[0.026, 0.938], [0.034, 0.95], [0.014, 0.964], [0.021, 0.984], [0.01, 1.006], [0.015, 1.026], [0.005, 1.046], [0.0035, 1.075], [0.001, 1.095]];
  rev(m, C, fin.map(([r, y]) => [r * F, y * F]), 0, 0, 0, 8, GOLD);

  // four chhatris on the roof
  const kiosk = (T: Xf, x: number, y: number, z: number, r: number, hcol: number, col: string, domeC: string, ox = 0, oz = 0) => {
    m.prism(T, x, y, z, r * 1.15, r * 0.4, 8, col, r * 1.1, Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      m.prism(T, x + Math.cos(a) * r * 0.85, y + r * 0.4, z + Math.sin(a) * r * 0.85, r * 0.09, hcol, 4, col);
    }
    m.prism(T, x, y + r * 0.4 + hcol, z, r * 1.25, r * 0.12, 8, shade(col, 0.95), r * 1.05, Math.PI / 8);
    const p0 = T([x, y + r * 0.52 + hcol, z]);
    lathe(gp, [[r * 0.95, 0], [r * 1.02, r * 0.35], [r * 0.85, r * 0.75], [r * 0.45, r * 1.05], [0.0005, r * 1.18]], domeC, p0[0] + ox, p0[1], p0[2] + oz, 14);
    m.prism(ID, p0[0] + ox, p0[1] + r * 1.15, p0[2] + oz, r * 0.08, r * 0.35, 4, GOLD, 0.0002);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kiosk(C, sx * 0.3 * F, hc, sz * 0.3 * F, 0.075 * F, 0.09 * F, WM, WM);

  // minarets: three tapering stages with balconies, crowning chhatri; each leans slightly outward
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * 0.79 * F, cz = zc + sz * 0.79 * F, lx = sx * 0.022, lz = sz * 0.022;
    const T: Xf = (v) => [cx + v[0] + v[1] * lx, yP + v[1], cz + v[2] + v[1] * lz];
    m.prism(T, 0, 0, 0, 0.08 * F, 0.03 * F, 8, WM2, 0.075 * F, Math.PI / 8);
    const stages: [number, number, number, number][] = [[0.03, 0.235, 0.056, 0.052], [0.25, 0.48, 0.05, 0.047], [0.495, 0.715, 0.046, 0.043]];
    for (const [y0, y1, r0, r1] of stages) {
      m.prism(T, 0, y0 * F, 0, r0 * F, (y1 - y0) * F, 12, WM, r1 * F);
      m.prism(T, 0, (y0 + (y1 - y0) * 0.5) * F, 0, r0 * F * 1.02, 0.004 * F, 12, INLAY, r0 * F * 1.0, 0, false);
      m.prism(T, 0, y1 * F - 0.018 * F, 0, r1 * F, 0.018 * F, 12, WM2, 0.075 * F, 0, false);
      m.prism(T, 0, y1 * F, 0, 0.075 * F, 0.015 * F, 12, WM, 0.075 * F);
    }
    kiosk(T, 0, 0.73 * F, 0, 0.042 * F, 0.065 * F, WM, WM, 0.77 * F * lx, 0.77 * F * lz);
  }

  // mosque (west) and jawab (east): red sandstone halls with three white domes, corner kiosks, inward iwan
  for (const sx of [-1, 1]) {
    const x = sx * 0.415, T = xform(x, yT, zc, -sx * Math.PI / 2);
    m.box(T, 0, 0, 0, 0.2, 0.06, 0.075, RED);
    m.box(T, 0, 0.06, 0, 0.205, 0.004, 0.08, '#e9e2d4');
    const Tf = (v: V3): V3 => T([v[0], v[1], v[2] + 0.0395]);
    m.arch(Tf, 0, 0, 0.06, 0.08, 0.006, 0.038, 0, 0.062, '#a5513a', 'pointed', 8, true, false);
    for (const bx of [-0.065, 0.065]) m.arch(Tf, bx, 0, 0.05, 0.05, 0.004, 0.028, 0.004, 0.036, '#a5513a', 'pointed', 6, false, false);
    for (const [dz, r] of [[-0.06, 0.018], [0, 0.026], [0.06, 0.018]]) {
      const p = T([dz, 0.064, 0]);
      m.prism(ID, p[0], p[1], p[2], r * 0.95, 0.008, 16, WM);
      lathe(gp, [[r, 0], [r * 1.08, r * 0.45], [r * 0.85, r * 0.95], [r * 0.4, r * 1.3], [0.0005, r * 1.45]], WM, p[0], p[1] + 0.008, p[2], 18);
      m.prism(ID, p[0], p[1] + 0.008 + r * 1.42, p[2], 0.0015, 0.008, 4, GOLD, 0.0002);
    }
    for (const ex of [-0.095, 0.095]) for (const ez of [-0.032, 0.032]) kiosk(T, ex, 0.064, ez, 0.009, 0.014, RED, WM);
  }

  // charbagh: reflecting pool on the main axis, cross channel, marble tank, sandstone walks, cypress rows
  const zg0 = 0.255, zg1 = 0.48, zx = (zg0 + zg1) / 2, yg = G + 0.0003;
  for (const sx of [-1, 1]) {
    for (const [x0, x1] of [[0.05, 0.24], [0.262, 0.46]]) for (const [z0, z1] of [[zg0 + 0.008, zx - 0.01], [zx + 0.01, zg1 - 0.005]]) {
      flat(m, sx * x0, z0, sx * x1, z1, yg + 0.0003, '#5f8f43');
      flat(m, sx * (x0 + 0.01), z0 + 0.01, sx * (x1 - 0.01), z1 - 0.01, yg + 0.0006, '#6ea24d');
    }
    flat(m, sx * 0.012, zg0, sx * 0.02, zg1, yg + 0.0012, '#e7e1d4');
    flat(m, sx * 0.02, zg0, sx * 0.05, zg1, yg + 0.0009, '#d8c29a');
    flat(m, sx * 0.24, zg0, sx * 0.262, zg1, yg + 0.0009, '#d8c29a');
    for (let z = zg0 + 0.018; z < zg1 - 0.01; z += 0.024) {
      if (Math.abs(z - zx) < 0.028) continue;
      for (const x of [0.058, 0.232]) tree(m, sx * x, yg, z, 0.0075, 0.05, '#2f5a35', 0.08);
    }
    for (let i = 0; i < 4; i++) tree(m, sx * (0.3 + 0.13 * hash3(i, sx, 4)), yg, zg0 + 0.03 + 0.17 * hash3(i, sx, 5), 0.018, 0.04, '#4b7a3a');
  }
  flat(m, -0.012, zg0, 0.012, zg1, yg + 0.0012, '#5b93b4');
  flat(m, -0.46, zx - 0.006, 0.46, zx + 0.006, yg + 0.0012, '#d8c29a');
  flat(m, -0.46, zx - 0.003, 0.46, zx + 0.003, yg + 0.0015, '#5b93b4');
  m.box(ID, 0, yg, zx, 0.07, 0.005, 0.07, '#ebe5d8');
  flat(m, -0.028, zx - 0.028, 0.028, zx + 0.028, yg + 0.0053, '#5b93b4');
  m.prism(ID, 0, yg + 0.005, zx, 0.004, 0.004, 6, '#ebe5d8');

  m.build(gp);
};

export const CLASSICS: Record<string, Builder> = { pyramids, eiffel, taj };
