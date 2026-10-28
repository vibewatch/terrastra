import { passerby } from '../human.ts';
import * as THREE from 'three';
import { type Builder, type V3, add, g, mat, box, ball, cyl, cone, rod, slab, mix, fbm, hash3 } from '../prims.ts';
import { type HFn, island, strataSide, EARTH, sstep, ridged } from '../nature.ts';
import { type Xf, Mesh3, xform, ID, frame, shade } from '../kit/euro.ts';

// Hero builders for: colosseum, parthenon, brandenburg, pisa, bigben, towerbridge. Keyed by catalogue item key (recipe.hero).
// Each is a scale-model diorama: correct silhouette first (tiers, column counts, arcade rhythms), then signature details.

const TAU = Math.PI * 2;

// ---- local helpers -------------------------------------------------------------------------------------

/** Equal-arc-length parameters θ_k (k = 0..n) around the ellipse x = a cosθ, z = b sinθ. */
function ellipseStations(a: number, b: number, n: number, th0 = 0): number[] {
  const M = 720, cum = [0];
  for (let i = 1; i <= M; i++) {
    const t0 = th0 + ((i - 1) / M) * TAU, t1 = th0 + (i / M) * TAU;
    cum.push(cum[i - 1] + Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), b * (Math.sin(t1) - Math.sin(t0))));
  }
  const L = cum[M], out: number[] = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * L;
    while (j < M - 1 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push(th0 + ((j + u) / M) * TAU);
  }
  return out;
}

/**
 * Rectangular-section band following an ellipse (outer semi-axes a,b; thickness t inward) from y0 to y0+h over
 * the parameter range th0..th1. `color` may vary per segment (weathering). Open arcs get end caps.
 */
function ellBand(m: Mesh3, a: number, b: number, t: number, y0: number, h: number, color: string | ((th: number, i: number) => string | null),
  th0 = 0, th1 = TAU, segs = 96, ths?: number[], inner = true): void {
  if (ths) { th0 = ths[0]; th1 = ths[ths.length - 1]; segs = ths.length - 1; }
  const full = Math.abs(th1 - th0 - TAU) < 1e-6;
  const O = (th: number, y: number): V3 => [a * Math.cos(th), y, b * Math.sin(th)];
  const I = (th: number, y: number): V3 => [(a - t) * Math.cos(th), y, (b - t) * Math.sin(th)];
  const y1 = y0 + h;
  for (let i = 0; i < segs; i++) {
    const ta = ths ? ths[i] : th0 + ((th1 - th0) * i) / segs, tb = ths ? ths[i + 1] : th0 + ((th1 - th0) * (i + 1)) / segs, tm = (ta + tb) / 2;
    const c = typeof color === 'string' ? color : color(tm, i);
    if (!c) continue;
    const rad: V3 = [Math.cos(tm), 0, Math.sin(tm)], inn: V3 = [-rad[0], 0, -rad[2]];
    m.quad(O(ta, y0), O(tb, y0), O(tb, y1), O(ta, y1), c, rad);
    if (inner) m.quad(I(ta, y0), I(tb, y0), I(tb, y1), I(ta, y1), shade(c, 0.9), inn);
    m.quad(O(ta, y1), O(tb, y1), I(tb, y1), I(ta, y1), shade(c, 1.04), [0, 1, 0]);
  }
  if (!full) {
    for (const [th, s] of [[th0, -1], [th1, 1]] as const) {
      const tg: V3 = [-a * Math.sin(th) * s, 0, b * Math.cos(th) * s];
      const c = (typeof color === 'string' ? color : color(th, 0)) ?? '#999999';
      m.quad(O(th, y0), I(th, y0), I(th, y1), O(th, y1), shade(c, 0.92), tg);
    }
  }
}

const umbrellaPine = (p: THREE.Object3D, x: number, y: number, z: number, s: number) => {
  rod(p, [x, y, z], [x + s * 0.12, y + s * 0.9, z], s * 0.05, '#6b4b33', 5);
  ball(p, '#3d6a35', x + s * 0.12, y + s * 0.98, z, s * 0.84, s * 0.26, s * 0.8);
  ball(p, '#4c7c3f', x + s * 0.18, y + s * 1.07, z + s * 0.05, s * 0.56, s * 0.18, s * 0.52);
};
const person = (p: THREE.Object3D, x: number, y: number, z: number, c: string, s = 0.012) => {
  passerby(p, x, y, z, s * 1.55, 1, { top: c });
};

// ---------------------------------------------------------------------------------------------------------
// Colosseum: elliptical 4-storey travertine shell (80 bays; Tuscan/Ionic/Corinthian orders, attic with pilasters &
// corbels), the collapsed southern outer ring exposing the lower inner ring, a ruined brick cavea and the hypogeum.
const colosseum: Builder = (gp) => {
  const TRAV = '#d8c5a1', BRICK = '#a96d4f';
  const tones = ['#d8c5a1', '#cdb894', '#e1d1b2', '#c4ae8a', '#d3bf9c'];
  const tone = (k: number, t: number) => tones[Math.floor(hash3(k, t, 3) * tones.length)];

  // Piazza: travertine apron around the monument, sampietrini cobbles, lawns and umbrella pines
  const hf: HFn = (x, z) => 0.004 + 0.002 * fbm(x * 18, 0, z * 18);
  island(gp, 0.5, hf, '#b9ab90', (x, _y, z) => {
    const e = (x / 0.43) ** 2 + (z / 0.36) ** 2;
    if (e < 1) return (x / 0.19) ** 2 + (z / 0.122) ** 2 < 1 ? '#7a5a44' : '#a3907a';
    if (e < 1.32) return (Math.floor(x * 70) + Math.floor(z * 70)) % 2 ? '#d9ccb2' : '#cfc1a5';
    if ((x < -0.28 && z > 0.18) || (x > 0.3 && z < -0.2)) return fbm(x * 20, 1, z * 20) > 0.5 ? '#6f8f47' : '#7c9a50';
    return hash3(Math.floor(x * 90), 2, Math.floor(z * 90)) > 0.5 ? '#8f877c' : '#9d9488';
  }, { rings: 16, segs: 72, side: strataSide(EARTH) });
  const Y0 = 0.039;
  for (const [x, z, s] of [[-0.4, 0.27, 0.11], [-0.46, 0.15, 0.1], [0.4, -0.27, 0.11], [0.31, -0.37, 0.1], [0.45, 0.16, 0.1]] as const) umbrellaPine(gp, x, Y0, z, s);
  for (let i = 0; i < 9; i++) { const a = 1.2 + i * 0.22, rr = 0.45 + hash3(i, 1, 1) * 0.03; person(gp, Math.cos(a) * rr, Y0, Math.sin(a) * rr * 0.86, ['#1e3a8a', '#b91c1c', '#f8fafc', '#0f766e'][i % 4]); }

  const A = 0.4, B = 0.33, N = 80, D = 0.016;
  const st = ellipseStations(A, B, N);
  const P = (th: number, off = 0): V3 => {
    const nx = Math.cos(th) / A, nz = Math.sin(th) / B, l = Math.hypot(nx, nz);
    return [A * Math.cos(th) + (nx / l) * off, 0, B * Math.sin(th) + (nz / l) * off];
  };
  const bw = Math.hypot(P(st[1])[0] - P(st[0])[0], P(st[1])[2] - P(st[0])[2]) * 1.012;
  const deg = (th: number) => ((th * 180) / Math.PI + 360) % 360;
  // Surviving outer ring: the northern arc (screen-left / back in the default 3/4 view); stepped break at each end
  const tiersAt = (d: number) => {
    if (d >= 132 && d <= 300) return 4;
    const gap = d < 132 ? 132 - d : d - 300;
    const step = Math.floor(gap / 4.5);
    return step === 0 ? 3 : step === 1 ? 2 : step === 2 ? 1 : 0;
  };
  const tiersOf = (k: number) => tiersAt(deg((st[k] + st[k + 1]) / 2));

  const m = new Mesh3();
  const Y1 = Y0 + 0.009;
  const TH = [0.062, 0.062, 0.06, 0.07];
  const ty = [Y1, Y1 + TH[0], Y1 + TH[0] + TH[1], Y1 + TH[0] + TH[1] + TH[2]];
  // Two-step travertine footing all round
  ellBand(m, A + 0.016, B + 0.016, 0.03, Y0 - 0.003, 0.006, '#cbbd9f');
  ellBand(m, A + 0.01, B + 0.01, 0.03, Y0 + 0.003, 0.006, '#d6c7a8');

  const capC = (o: number, c: string) => (o === 2 ? shade(c, 1.06) : c);
  for (let k = 0; k < N; k++) {
    const th = (st[k] + st[k + 1]) / 2, nt = tiersOf(k);
    const a0 = P(st[k]), a1 = P(st[k + 1]);
    const T = xform((a0[0] + a1[0]) / 2, 0, (a0[2] + a1[2]) / 2, Math.atan2(Math.cos(th) / A, Math.sin(th) / B));
    if (nt === 0) {
      // Robbed-out outer ring: only pier stumps and the footing remain
      if (k % 2 === 0) m.box(T, -bw / 2, Y1, 0, 0.012, 0.006 + hash3(k, 4, 4) * 0.02, D, tone(k, 9));
      continue;
    }
    for (let t = 0; t < Math.min(nt, 3); t++) {
      const c = tone(k, t), y = ty[t];
      // Arched bay (ground: tall arch; upper: pedestal course under the arch)
      // Upper-tier back faces of full-height bays sit behind the brick backing panel
      m.arch(T, 0, y, bw, TH[t] - 0.009, D, bw * (t ? 0.6 : 0.62), t ? 0.011 : 0, t ? TH[t] - 0.03 : TH[t] - 0.02, c, 'arch', 4, false, !(t && nt === 4));
      // Engaged half-column on the pier (Tuscan / Ionic / Corinthian) with its capital
      const cy = y + (t ? 0.011 : 0), ch = TH[t] - 0.009 - (t ? 0.011 : 0) - 0.004;
      m.prism(T, -bw / 2, cy, D / 2, 0.0036, ch, 5, c, 0.0036, 0, false);
      m.box(T, -bw / 2, cy + ch, D / 2 + 0.001, 0.0095, t === 2 ? 0.006 : 0.004, 0.006, capC(t, shade(c, 1.05)), false, false);
    }
    if (nt === 4) {
      const c = tone(k, 3), y = ty[3];
      // Attic: blind wall with small rectangular windows in alternate bays, Corinthian pilasters and corbels
      if (k % 2) m.arch(T, 0, y, bw, TH[3] - 0.012, D, bw * 0.3, 0.03, 0.014, c, 'rect');
      else m.box(T, 0, y, 0, bw, TH[3] - 0.012, D, c);
      m.box(T, -bw / 2, y + 0.004, D / 2, 0.006, TH[3] - 0.02, 0.003, shade(c, 1.04), false, false);
      m.box(T, -bw / 2, y + TH[3] - 0.016, D / 2 + 0.001, 0.008, 0.004, 0.004, shade(c, 1.08), false, false);
      for (const dx of [-0.25, 0.25]) m.box(T, dx * bw, y + TH[3] - 0.02, D / 2 + 0.002, 0.003, 0.004, 0.004, shade(c, 0.95), false, false);
      // Brick backing of the upper storeys (inner face + top only; the rest is buried in the shell)
      const zb = -D / 2 - 0.0035, yb = ty[1] + TH[1] + TH[2] + TH[3] - 0.004, bc = shade(BRICK, 1.1);
      m.tq(T, [-bw / 2, ty[1], zb], [bw / 2, ty[1], zb], [bw / 2, yb, zb], [-bw / 2, yb, zb], shade(bc, 0.9), [0, 0, -1]);
      m.tq(T, [-bw / 2, yb, zb], [bw / 2, yb, zb], [bw / 2, yb, -D / 2], [-bw / 2, yb, -D / 2], shade(bc, 1.05), [0, 1, 0]);
    } else {
      // Jagged top of a broken bay
      m.box(T, 0, ty[nt], 0, bw * 0.9, 0.004 + hash3(k, 2, 2) * 0.01, D * 0.9, mix(tone(k, 5), BRICK, 0.35));
    }
  }
  // Continuous entablatures, cornices and pedestal courses following the surviving tiers
  const bandC = (t: number, f: number) => (_th: number, i: number) => (tiersOf(i) > t ? shade(tone(i, t), f) : null);
  const Ao = A + D / 2, Bo = B + D / 2;
  for (let t = 0; t < 3; t++) {
    ellBand(m, Ao + 0.002, Bo + 0.002, D + 0.004, ty[t] + TH[t] - 0.009, 0.006, bandC(t, 1.02), 0, 0, 0, st, false);
    ellBand(m, Ao + 0.004, Bo + 0.004, D + 0.008, ty[t] + TH[t] - 0.003, 0.003, bandC(t, 1.1), 0, 0, 0, st, false);
    if (t) ellBand(m, Ao + 0.0015, Bo + 0.0015, 0.004, ty[t], 0.011, bandC(t, 1.05), 0, 0, 0, st, false);
  }
  ellBand(m, Ao + 0.001, Bo + 0.001, D + 0.003, ty[3] + TH[3] - 0.012, 0.009, bandC(3, 1.06), 0, 0, 0, st, false);
  ellBand(m, Ao + 0.002, Bo + 0.002, D + 0.004, ty[3] + TH[3] - 0.003, 0.004, bandC(3, 0.96), 0, 0, 0, st, false);
  // Vaulted ambulatory floors behind the arcades (shadowed galleries read through the arches)
  for (const y of [ty[1], ty[2]]) ellBand(m, A - D / 2, B - D / 2, 0.04, y - 0.004, 0.004, bandC(3, 0.8), 0, 0, 0, st);
  // Brick buttresses (Stern & Valadier) sealing the two break ends with a sloping spur
  const top = ty[3] + TH[3];
  for (const [kIn, dir] of [[ellipseIdx(st, 132, true), -1], [ellipseIdx(st, 300, false), 1]] as const) {
    const e0 = dir < 0 ? P(st[kIn]) : P(st[kIn + 1]);
    const kOut = dir < 0 ? Math.max(0, kIn - 3) : Math.min(N, kIn + 4);
    const e1 = P(st[kOut]);
    const L = Math.hypot(e1[0] - e0[0], e1[2] - e0[2]);
    const f = frame(gp, e0[0], 0, e0[2], Math.atan2(-(e1[2] - e0[2]), e1[0] - e0[0]));
    slab(f, [[0, Y1], [0, top], [0.012, top], [L * 0.98, Y1 + 0.01], [L, Y1]], D + 0.008, BRICK, 0, false);
    for (let i = 1; i < 5; i++) box(f, shade(BRICK, 0.85), L * (i / 5.5), Y1, D / 2 + 0.004, 0.006, (top - Y1) * (1 - i / 5.2), 0.003);
  }

  // Inner (second) ring: arcaded where the outer shell is gone, plain where hidden behind it
  const A2 = A - 0.052, B2 = B - 0.052, st2 = ellipseStations(A2, B2, N), H2 = TH[0] + TH[1] + 0.045;
  const bw2 = Math.hypot(A2 * (Math.cos(st2[1]) - Math.cos(st2[0])), B2 * (Math.sin(st2[1]) - Math.sin(st2[0]))) * 1.015;
  for (let k = 0; k < N; k++) {
    const th = (st2[k] + st2[k + 1]) / 2;
    const d = deg(th);
    const hidden = d > 140 && d < 292;
    const x0 = A2 * Math.cos(st2[k]), z0 = B2 * Math.sin(st2[k]), x1 = A2 * Math.cos(st2[k + 1]), z1 = B2 * Math.sin(st2[k + 1]);
    const T = xform((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(Math.cos(th) / A2, Math.sin(th) / B2));
    const c = mix(tone(k, 7), BRICK, 0.25 + hash3(k, 8, 1) * 0.25);
    if (hidden) {
      // Plain wall behind the intact shell: neighbours hide the side faces
      const h = Y1 + H2, w = bw2 / 2;
      m.tq(T, [-w, Y1, 0.007], [w, Y1, 0.007], [w, h, 0.007], [-w, h, 0.007], '#4d3a2c', [0, 0, 1]);
      m.tq(T, [-w, Y1, -0.007], [w, Y1, -0.007], [w, h, -0.007], [-w, h, -0.007], shade('#4d3a2c', 0.9), [0, 0, -1]);
      m.tq(T, [-w, h, -0.007], [w, h, -0.007], [w, h, 0.007], [-w, h, 0.007], shade('#4d3a2c', 1.05), [0, 1, 0]);
      continue;
    }
    m.arch(T, 0, Y1, bw2, TH[0], 0.014, bw2 * 0.58, 0, TH[0] - 0.016, c, 'arch', 3, false, false);
    m.arch(T, 0, Y1 + TH[0], bw2, TH[1], 0.014, bw2 * 0.56, 0.008, TH[1] - 0.024, c, 'arch', 3, false, false);
    m.arch(T, 0, Y1 + TH[0] + TH[1], bw2, 0.045, 0.014, bw2 * 0.28, 0.016, 0.014, mix(c, BRICK, 0.4), 'rect', 2, true);
    m.box(T, 0, Y1 + TH[0] - 0.004, 0.002, bw2, 0.004, 0.018, shade(c, 1.08));
    m.box(T, 0, Y1 + TH[0] + TH[1] - 0.004, 0.002, bw2, 0.004, 0.018, shade(c, 1.08));
    m.box(T, -bw2 / 2, Y1, 0.008, 0.006, TH[0] - 0.004, 0.003, shade(c, 1.04), false, false);
    // Radial ambulatory walls (stumps of the vaults that once joined the outer ring)
    if (k % 2 === 0) m.box(T, -bw2 / 2, Y1, 0.03, 0.008, 0.02 + hash3(k, 6, 6) * 0.06, 0.044, mix(BRICK, TRAV, 0.3));
  }
  // Vault roof over the surviving ambulatories
  ellBand(m, A - 0.008, B - 0.008, 0.05, ty[2] + TH[2] - 0.006, 0.006, (th) => (deg(th) > 134 && deg(th) < 298 ? '#9c6a50' : null), 0, TAU, 96);

  // Cavea: ruined brick terraces stepping down to the podium, cut by radial walls
  const ar = 0.19, br = 0.122, K = 7, yTop = Y1 + H2 - 0.004, yPod = Y0 + 0.036;
  const lerpE = (u: number): [number, number, number] => [A2 - 0.012 + (ar + 0.012 - (A2 - 0.012)) * u, B2 - 0.012 + (br + 0.012 - (B2 - 0.012)) * u, yTop + (yPod - yTop) * Math.pow(u, 0.85)];
  for (let s = 0; s < K; s++) {
    const [a0, b0, y0] = lerpE(s / K), [a1, b1, y1] = lerpE((s + 1) / K);
    const seg = 64;
    for (let i = 0; i < seg; i++) {
      const ta = (i / seg) * TAU, tb = ((i + 1) / seg) * TAU, tm = (ta + tb) / 2;
      const n = fbm(Math.cos(tm) * 3 + s, s * 0.7, Math.sin(tm) * 3);
      const c = n > 0.62 ? '#d9cbb0' : n > 0.48 ? mix(BRICK, '#c9a27f', 0.4) : n > 0.3 ? BRICK : '#8e5940';
      m.quad([a0 * Math.cos(ta), y0, b0 * Math.sin(ta)], [a0 * Math.cos(tb), y0, b0 * Math.sin(tb)], [a1 * Math.cos(tb), y0, b1 * Math.sin(tb)], [a1 * Math.cos(ta), y0, b1 * Math.sin(ta)], c, [0, 1, 0]);
      m.quad([a1 * Math.cos(ta), y0, b1 * Math.sin(ta)], [a1 * Math.cos(tb), y0, b1 * Math.sin(tb)], [a1 * Math.cos(tb), y1, b1 * Math.sin(tb)], [a1 * Math.cos(ta), y1, b1 * Math.sin(ta)], shade(c, 0.78), [-Math.cos(tm), 0, -Math.sin(tm)]);
    }
  }
  for (let k = 0; k < N; k += 2) {
    const th = st2[k], [a0, b0] = lerpE(0), [a1, b1] = lerpE(1);
    const tg: V3 = [-Math.sin(th) * 0.0025, 0, Math.cos(th) * 0.0025];
    const o0: V3 = [a0 * Math.cos(th), yTop + 0.004, b0 * Math.sin(th)], i0: V3 = [a1 * Math.cos(th), yPod + 0.008, b1 * Math.sin(th)];
    const o1: V3 = [o0[0], yPod - 0.01, o0[2]], i1: V3 = [i0[0], yPod - 0.01, i0[2]];
    const c = hash3(k, 3, 9) > 0.5 ? '#9a5f45' : '#b07454';
    const sh = (v: V3, s: number): V3 => [v[0] + tg[0] * s, v[1], v[2] + tg[2] * s];
    m.quad(sh(o0, 1), sh(i0, 1), sh(i1, 1), sh(o1, 1), c, tg);
    m.quad(sh(o0, -1), sh(i0, -1), sh(i1, -1), sh(o1, -1), shade(c, 0.9), [-tg[0], 0, -tg[2]]);
    m.quad(sh(o0, 1), sh(o0, -1), sh(i0, -1), sh(i0, 1), shade(c, 1.1), [0, 1, 0]);
  }
  // Podium wall around the arena with its marble parapet
  ellBand(m, ar + 0.012, br + 0.012, 0.008, Y0, yPod - Y0, '#cdbb98', 0, TAU, 64);
  ellBand(m, ar + 0.014, br + 0.014, 0.012, yPod, 0.004, '#efe6d2', 0, TAU, 64);

  // Hypogeum: parallel brick corridors in the open pit, partial reconstructed timber arena floor at the east end
  const yA = Y0 + 0.024;
  ellBand(m, ar, br, 0.006, Y0, yA - Y0 - 0.002, '#9c6448', 0, TAU, 64);
  for (let i = -5; i <= 5; i++) {
    const z = i * 0.0205 + (i === 0 ? 0 : Math.sign(i) * 0.004);
    if (i === 0) continue;
    const hx = ar * Math.sqrt(Math.max(0, 1 - (z / br) ** 2)) * 0.93;
    if (hx < 0.02) continue;
    box(gp, hash3(i, 2, 7) > 0.5 ? '#a0674a' : '#8b553d', -0.015, Y0, z, hx * 2 - 0.03, yA - Y0 - 0.004, 0.0045);
  }
  for (const x of [-0.12, -0.06, 0.0, 0.06]) box(gp, '#93593f', x, Y0, 0, 0.0045, yA - Y0 - 0.006, br * 1.6);
  const deck: [number, number][] = [];
  for (let i = 0; i <= 14; i++) { const t = -1.15 + (i / 14) * 2.3; deck.push([Math.max(0.085, ar * 0.97 * Math.cos(t)), br * 0.97 * Math.sin(t)]); }
  deck.push([0.085, br * 0.9], [0.085, -br * 0.9]);
  const dk = new THREE.Shape(deck.map(([x, z]) => new THREE.Vector2(x, -z)));
  const dg = new THREE.ExtrudeGeometry(dk, { depth: 0.003, bevelEnabled: false });
  dg.rotateX(-Math.PI / 2);
  add(gp, dg, mat('#c39463'), 0, yA - 0.003, 0, 1, 1, 1);
  for (let i = 0; i < 6; i++) box(gp, '#9e7247', 0.095 + i * 0.016, yA, 0, 0.0015, 0.0008, br * 1.4);
  m.build(gp);
};

/** Index of the last bay inside (fromBelow=true: first bay ≥ deg) the surviving arc boundary. */
function ellipseIdx(st: number[], d: number, fromBelow: boolean): number {
  const degOf = (k: number) => ((((st[k] + st[k + 1]) / 2) * 180) / Math.PI + 360) % 360;
  for (let k = 0; k < st.length - 1; k++) {
    if (fromBelow && degOf(k) >= d) return k;
    if (!fromBelow && degOf(k) > d) return k - 1;
  }
  return st.length - 2;
}
// ---------------------------------------------------------------------------------------------------------
// Parthenon (Athens): Doric peripteral octastyle temple, 8 × 17 columns on a three-step crepidoma, on the
// Acropolis rock. Ruined state: no roof, broken mid-south colonnade (1687 explosion), gutted cella with the
// western cross wall standing, gaps in the north entablature, pediments with surviving corner figures; the
// Propylaea gateway at the west brow of the rock and olive trees on the slopes below.
const parthenon: Builder = (gp) => {
  const MARBLE = '#e6dcc6';
  const tones = ['#e6dcc6', '#dccfb2', '#ebe3d0', '#d6c6a4', '#efe9db', '#e0d2b5'];
  const tone = (a: number, b: number) => tones[Math.floor(hash3(a, b, 11) * tones.length)];
  const PX = 0.395, PZ = 0.2, HP = 0.13;
  const se = (x: number, z: number) => Math.pow(Math.pow(Math.abs(x / PX), 4) + Math.pow(Math.abs(z / PZ), 4), 0.25);
  const hf: HFn = (x, z) => {
    const e = se(x - 0.01, z) * (1 + 0.05 * (fbm(x * 9, 4, z * 9) - 0.5));
    if (e < 1) return HP + 0.003 * fbm(x * 14, 0, z * 14);
    const cliff = HP - (HP - 0.04) * sstep(1, 1.1, e) - 0.038 * sstep(1.1, 1.42, e);
    return Math.max(0.002, cliff + 0.01 * (ridged(x * 22, z * 22) - 0.5) * sstep(1, 1.08, e) * (1 - sstep(1.2, 1.4, e)));
  };
  island(gp, 0.46, hf, '#b8a586', (x, y, z) => {
    const h = y - 0.035;
    if (h > HP - 0.006) {
      if (Math.abs(z + 0.005) < 0.012 && x < -0.2) return '#cbbd9c';
      return fbm(x * 30, 2, z * 30) > 0.62 ? '#bfae8c' : hash3(Math.floor(x * 80), 1, Math.floor(z * 80)) > 0.5 ? '#d3c6a8' : '#cbbd9f';
    }
    if (h > 0.04) return ['#b29c7c', '#a48d6e', '#bba584', '#9b8466'][Math.abs(Math.floor(h * 160 + fbm(x * 12, 1, z * 12) * 2)) % 4];
    const n = fbm(x * 16, 3, z * 16);
    return n > 0.56 ? '#78804c' : n > 0.44 ? '#8f9259' : '#ab9f7c';
  }, { rings: 28, segs: 96, side: strataSide(['#a48d6e', '#8f7a5d', '#b29c7c', '#7d6a50']) });
  // Olive trees and cypress on the lower slopes
  for (let i = 0; i < 40; i++) {
    const a = hash3(i, 7, 1) * TAU, rr = 0.3 + hash3(i, 2, 3) * 0.14;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (se(x - 0.01, z) < 1.2 || (x < -0.3 && Math.abs(z) < 0.12)) continue;
    const y = 0.035 + hf(x, z) - 0.002, s = 0.022 + hash3(i, 5, 5) * 0.012;
    if (i % 5 === 0) { cone(gp, '#3f5a32', x, y, z, s * 0.3, s * 2.2, 6); continue; }
    rod(gp, [x, y, z], [x, y + s * 0.8, z], s * 0.12, '#6e5a44', 4);
    ball(gp, i % 2 ? '#7d8f5a' : '#8a9a66', x, y + s * 1.05, z, s * 1.6, s * 0.95, s * 1.5);
  }

  const m = new Mesh3();
  const yR = 0.035 + HP, CX = 0.07;
  const T0 = xform(CX, 0, 0);
  const s0 = 0.0285, r = 0.0063, HC = 0.069;
  const ax = 8 * s0, az = 3.5 * s0;
  // Crepidoma: three steps
  const ST = 0.0055;
  for (let k = 0; k < 3; k++) {
    const e = 0.0215 - k * 0.0055;
    m.box(T0, 0, yR + k * ST - 0.006 * (k === 0 ? 1 : 0), 0, (ax + e) * 2, ST + (k === 0 ? 0.006 : 0), (az + e) * 2, shade(MARBLE, 0.96 + k * 0.03));
  }
  const yS = yR + 3 * ST;
  // Cella floor (worn)
  m.box(T0, 0, yS, 0, (ax - 0.02) * 2, 0.0008, (az - 0.02) * 2, '#d4c6a6');

  // Peristyle (46 columns). South middle (−z, i 6..10) blown out; a few restored drums are whiter.
  const yC = yS + HC;
  const southGap = (i: number) => i >= 6 && i <= 10;
  for (let i = 0; i <= 16; i++) for (let j = 0; j <= 7; j++) {
    if (!(i === 0 || i === 16 || j === 0 || j === 7)) continue;
    const x = (i - 8) * s0, z = (j - 3.5) * s0, c = hash3(i, j, 5) > 0.88 ? '#f4f0e6' : tone(i, j);
    if (j === 0 && southGap(i)) {
      const hh = (0.006 + hash3(i, 1, 9) * 0.016) * (i === 8 ? 0.4 : 1);
      m.prism(T0, x, yS, z, r, hh, 12, c, r * 0.98);
      continue;
    }
    m.doric(T0, x, yS, z, r, HC, c);
  }

  // Entablature: architrave, triglyph frieze, cornice; with ruin gaps
  const ew = r * 2.4;
  const gapS = (x: number) => x > (5 - 8) * s0 && x < (11 - 8) * s0;
  const gapN = (x: number, layer: number) => (layer === 0 ? x > (7 - 8) * s0 && x < (9 - 8) * s0 : x > (6 - 8) * s0 && x < (10 - 8) * s0);
  const longRun = (z: number, y: number, h: number, d: number, c: string, layer: number, out = 0) => {
    const xs: number[] = [];
    for (let i = 0; i < 16; i++) xs.push((i - 8) * s0, (i - 7) * s0);
    for (let i = 0; i < 16; i++) {
      const x0 = (i - 8) * s0 - (i === 0 ? r * 1.25 + out : 0), x1 = (i - 7) * s0 + (i === 15 ? r * 1.25 + out : 0), xm = (x0 + x1) / 2;
      if (z < 0 && gapS(xm)) continue;
      if (z > 0 && gapN(xm, layer)) continue;
      m.box(T0, xm, y, z, x1 - x0, h, d, shade(c, 0.97 + hash3(i, layer, z > 0 ? 1 : 2) * 0.06));
    }
  };
  const yF = yC + 0.009, yK = yF + 0.009;
  for (const zs of [-1, 1]) {
    longRun(zs * az, yC, 0.009, ew, MARBLE, 0);
    longRun(zs * (az - 0.0005), yF, 0.009, ew - 0.001, shade(MARBLE, 0.98), 1);
    longRun(zs * (az + 0.001), yK, 0.0045, ew + 0.006, shade(MARBLE, 1.04), 2, 0.004);
  }
  for (const xs of [-1, 1]) {
    m.box(T0, xs * ax, yC, 0, ew, 0.009, az * 2 + ew, MARBLE);
    m.box(T0, xs * (ax - 0.0005), yF, 0, ew - 0.001, 0.009, az * 2 + ew - 0.001, shade(MARBLE, 0.98));
    m.box(T0, xs * (ax + 0.001), yK, 0, ew + 0.006, 0.0045, az * 2 + ew + 0.012, shade(MARBLE, 1.04));
  }
  // Triglyphs (over each column and mid-span) with dark glyph grooves; regulae/guttae band under the frieze
  const TG = '#c9b994';
  for (let i = 0; i <= 32; i++) {
    const x = (i / 2 - 8) * s0;
    for (const zs of [-1, 1]) {
      if (zs < 0 && gapS(x)) continue;
      if (zs > 0 && gapN(x, 1)) continue;
      const z = zs * (az + ew / 2 - 0.0002);
      m.box(T0, x, yF + 0.0005, z, 0.0056, 0.0082, 0.0016, TG);
      m.box(T0, x, yF + 0.0015, z + zs * 0.0008, 0.0012, 0.006, 0.0006, '#a8977a');
    }
  }
  for (let j = 0; j <= 14; j++) {
    const z = (j / 2 - 3.5) * s0;
    for (const xs of [-1, 1]) {
      const T = xform(CX + xs * (ax + ew / 2 - 0.0002), 0, z, xs > 0 ? Math.PI / 2 : -Math.PI / 2);
      m.box(T, 0, yF + 0.0005, 0, 0.0056, 0.0082, 0.0016, TG);
      m.box(T, 0, yF + 0.0015, 0.0008, 0.0012, 0.006, 0.0006, '#a8977a');
    }
  }
  // Pediments (east and west): recessed tympanum, raking cornices; surviving corner sculpture on the west
  const yP = yK + 0.0045, PH = 0.026, pw = az + ew / 2 + 0.005;
  for (const xs of [-1, 1]) {
    const T = xform(CX + xs * ax, 0, 0, xs * Math.PI / 2);
    // local x runs along the façade (z), local z outward
    m.poly(T, [[-pw + 0.006, yP], [pw - 0.006, yP], [0, yP + PH - 0.004]], -0.006, 0.002, shade(MARBLE, 0.93));
    const L = Math.hypot(pw, PH), ang = Math.atan2(PH, pw);
    for (const sd of [-1, 1]) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const p0: [number, number] = [sd * pw, yP], p1: [number, number] = [0, yP + PH];
      const nx = -sd * sa, ny = ca;
      const th = 0.0045;
      m.poly(T, [p0, p1, [p1[0] + nx * th * 0 , p1[1] + th / ca], [p0[0] + nx * th, p0[1] + ny * th]], -0.008, 0.0065, shade(MARBLE, 1.05));
      void L;
    }
    if (xs < 0) {
      // west pediment: Kekrops group (left corner) and river-god fragments (right)
      for (const [u, hh, w] of [[-0.075, 0.009, 0.012], [-0.06, 0.012, 0.009], [0.07, 0.008, 0.016], [0.05, 0.011, 0.008]] as const) {
        m.box(T, u, yP, -0.0005, w, hh * (1 - Math.abs(u) / pw * 0.4), 0.006, '#d8ccb0');
      }
    } else {
      for (const [u, hh, w] of [[-0.08, 0.006, 0.014], [0.078, 0.007, 0.012], [0.066, 0.009, 0.006]] as const) m.box(T, u, yP, -0.0005, w, hh, 0.006, '#d8ccb0');
    }
  }

  // Cella: western cross wall standing to the architrave, long walls ruined down toward the east
  const cz = 0.068, cx0 = -0.172, cx1 = 0.168, WT = 0.009, yTop = yC + 0.009;
  const Tw = xform(CX + cx0, 0, 0, Math.PI / 2);
  m.arch(Tw, 0, yS, cz * 2 + WT, yTop - yS, WT, 0.022, 0, 0.05, '#e0d3b6', 'rect', 2, true);
  for (const zs of [-1, 1]) {
    const nSeg = 12;
    for (let k = 0; k < nSeg; k++) {
      const x0 = cx0 + ((cx1 - cx0) * k) / nSeg, x1 = cx0 + ((cx1 - cx0) * (k + 1)) / nSeg;
      const f = k / nSeg;
      let hh = f < 0.16 ? yTop - yS : (yTop - yS) * Math.max(0.05, 0.75 - f * 1.1 + 0.25 * (hash3(k, zs, 3) - 0.5));
      if (zs > 0 && f > 0.3) hh *= 0.5;
      m.box(T0, (x0 + x1) / 2, yS, zs * cz, x1 - x0 + 0.0005, hh, WT, tone(k, zs + 7), true);
    }
  }
  m.box(T0, cx1, yS, -cz * 0.55, WT, 0.012, cz * 0.9, tone(3, 3));
  m.box(T0, cx1, yS, cz * 0.7, WT, 0.008, cz * 0.6, tone(4, 3));
  // Prostyle porches: 6 columns at each end (west complete under its architrave, east partly re-erected)
  const pr = 0.0056, ph = HC - 0.004;
  for (const xs of [-1, 1]) {
    const px = xs * 0.2;
    m.box(T0, px, yS, 0, 0.022, 0.003, 0.17, shade(MARBLE, 0.97));
    for (let k = 0; k < 6; k++) {
      const z = (k - 2.5) * 0.0288;
      if (xs > 0 && (k === 1 || k === 2 || k === 4)) { m.prism(T0, px, yS + 0.003, z, pr, 0.008 + hash3(k, 4, 4) * 0.01, 12, tone(k, 9)); continue; }
      m.doric(T0, px, yS + 0.003, z, pr, ph - 0.003, tone(k, 8 + xs), 14);
    }
    if (xs < 0) m.box(T0, px, yC, 0, ew - 0.002, 0.009, 0.17, MARBLE);
  }
  // Fallen drums and blocks around the stylobate
  for (let i = 0; i < 26; i++) {
    const a = hash3(i, 3, 1) * TAU, rr = 0.6 + hash3(i, 4, 2) * 0.5;
    const x = CX + Math.cos(a) * (ax + 0.04) * rr * 1.25, z = Math.sin(a) * (az + 0.05) * rr * 1.3;
    if (se(x - 0.01, z) > 0.9 || (Math.abs(x - CX) < ax + 0.03 && Math.abs(z) < az + 0.03)) continue;
    if (i % 3 === 0) m.prism(ID, x, yR + 0.002, z, 0.0055, 0.006, 10, tone(i, 1));
    else m.box(xform(x, 0, z, hash3(i, 8, 8) * 3), 0, yR + 0.002, 0, 0.012, 0.006, 0.007, tone(i, 2));
  }

  // Propylaea: Doric hexastyle west portico with pediment, flanking Pinakotheke and Nike bastion, stepped approach
  const PXc = -0.355, yPr = yR;
  const Tp = xform(PXc, 0, 0, -Math.PI / 2);
  m.box(Tp, 0, yPr, 0.004, 0.14, 0.006, 0.03, shade(MARBLE, 0.96));
  for (let k = 0; k < 6; k++) m.doric(Tp, (k - 2.5) * 0.021 + (k === 2 || k === 3 ? (k === 2 ? -0.003 : 0.003) : 0), yPr + 0.006, 0.006, 0.0045, 0.05, tone(k, 20), 12);
  m.box(Tp, 0, yPr + 0.056, 0.006, 0.13, 0.012, 0.012, MARBLE);
  m.poly(Tp, [[-0.066, yPr + 0.068], [0.066, yPr + 0.068], [0, yPr + 0.087]], -0.004, 0.01, shade(MARBLE, 0.96));
  m.box(Tp, 0, yPr + 0.006, -0.04, 0.11, 0.05, 0.06, '#d9cbac');
  m.box(Tp, 0, yPr + 0.006, -0.012, 0.024, 0.04, 0.004, '#6f6250');
  m.poly(Tp, [[-0.062, yPr + 0.058], [0.062, yPr + 0.058], [0, yPr + 0.072]], -0.07, -0.01, '#cfc0a0');
  // Pinakotheke (north wing) and the Nike temple on its bastion (south)
  m.box(Tp, -0.105, yPr, -0.005, 0.06, 0.038, 0.05, '#d9cbac');
  for (let k = 0; k < 3; k++) m.prism(Tp, -0.09 + k * 0.012, yPr, 0.024, 0.0032, 0.03, 8, MARBLE);
  m.box(Tp, 0.1, yR - 0.03, 0.03, 0.05, 0.035, 0.05, '#c2b08e');
  m.box(Tp, 0.1, yR + 0.005, 0.03, 0.026, 0.022, 0.034, '#e2d7bf');
  for (let k = 0; k < 4; k++) m.prism(Tp, 0.091 + k * 0.006, yR + 0.005, 0.049, 0.0018, 0.018, 6, MARBLE);
  // Approach: switchback ramp/steps descending the west slope
  for (let k = 0; k < 9; k++) m.box(Tp, 0, yPr - 0.004 - k * 0.0095, 0.04 + k * 0.01, 0.07, 0.006, 0.012, shade('#cfc2a3', 1 - k * 0.02));
  // Visitors
  for (let i = 0; i < 8; i++) person(gp, CX - 0.28 + i * 0.05 + hash3(i, 1, 1) * 0.02, yR, 0.15 + hash3(i, 2, 2) * 0.03, ['#1e3a8a', '#b91c1c', '#f8fafc', '#0f766e'][i % 4], 0.009);
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Brandenburg Gate (Berlin): six fluted Doric columns per face on pedestals forming five passages (wider centre),
// pylon walls between the column rows, triglyph entablature, stepped attic with the relief panel, the copper
// Quadriga (four horses abreast, chariot, Victoria with the iron-cross standard) facing Pariser Platz (+z),
// the two Torhäuser side wings, granite paving, lamps and the Tiergarten behind.
const PATINA = '#5f9c86';
function horse(p: THREE.Object3D, x: number, y: number, z: number, s: number, rear: number, turn: number): void {
  const c = PATINA, d = shade(PATINA, 0.85);
  const f = frame(p, x, y, z, turn);
  ball(f, c, 0, s * 1.0, 0, s * 0.42, s * 0.5, s * 1.15, 0, -rear * 0.5);
  // neck + head raised; front legs lifted when rearing
  ball(f, c, 0, s * 1.38 + rear * s * 0.1, s * 0.5, s * 0.26, s * 0.62, s * 0.3, 0, 0.55);
  ball(f, d, 0, s * 1.72 + rear * s * 0.12, s * 0.72, s * 0.2, s * 0.22, s * 0.46, 0, 0.5);
  rod(f, [0, s * 1.88, s * 0.42], [0, s * 1.5, s * 0.25], s * 0.05, d, 4);
  for (const sx of [-1, 1]) {
    rod(f, [sx * s * 0.12, s * 0.9, -s * 0.38], [sx * s * 0.13, 0, -s * 0.42], s * 0.06, d, 4);
    rod(f, [sx * s * 0.12, s * 0.95, s * 0.36], [sx * s * 0.12, s * (0.45 + rear * 0.5), s * (0.62 + rear * 0.2)], s * 0.06, d, 4);
    rod(f, [sx * s * 0.12, s * (0.45 + rear * 0.5), s * (0.62 + rear * 0.2)], [sx * s * 0.12, s * (0.2 + rear * 0.55), s * (0.5 + rear * 0.45)], s * 0.05, d, 4);
  }
  rod(f, [0, s * 1.05, -s * 0.55], [0, s * 0.55, -s * 0.72], s * 0.07, d, 4);
}
const brandenburg: Builder = (gp) => {
  const SAND = '#d9cbb0';
  const Y0 = 0.04;
  island(gp, 0.5, () => 0.003, '#c9c2b5', (x, _y, z) => {
    if (Math.abs(x) > 0.36 && z < -0.12) return fbm(x * 20, 0, z * 20) > 0.5 ? '#5f8f4a' : '#6c9a52';
    if (z > 0.2 && Math.abs(x) > 0.27 && Math.abs(x) < 0.4) return '#7aa35a';
    const gx = Math.floor((x + 1) * 40), gz = Math.floor((z + 1) * 40);
    return (gx + gz) % 2 ? '#d6d0c4' : hash3(gx, 2, gz) > 0.85 ? '#bdb6a8' : '#cfc8bb';
  }, { rings: 14, segs: 64, side: strataSide(EARTH) });
  // Tiergarten trees behind (west), street lamps and visitors on Pariser Platz
  for (let i = 0; i < 16; i++) {
    const x = -0.44 + (i % 8) * 0.125 + hash3(i, 1, 2) * 0.03, z = -0.3 - Math.floor(i / 8) * 0.09 - hash3(i, 3, 1) * 0.03;
    if (Math.hypot(x, z) > 0.46) continue;
    rod(gp, [x, Y0, z], [x, Y0 + 0.05, z], 0.005, '#5b4636', 5);
    ball(gp, i % 3 ? '#4f7f3f' : '#5e8c48', x, Y0 + 0.075, z, 0.075, 0.07, 0.075);
  }
  for (const x of [-0.42, -0.24, 0.24, 0.42]) for (const z of [0.18, 0.32]) {
    if (Math.hypot(x, z) > 0.47) continue;
    cyl(gp, '#2b2f36', x, Y0, z, 0.002, 0.06, 5);
    box(gp, '#f5e6b8', x, Y0 + 0.06, z, 0.008, 0.01, 0.008);
  }
  for (let i = 0; i < 14; i++) person(gp, -0.3 + hash3(i, 4, 4) * 0.6, Y0, 0.14 + hash3(i, 5, 5) * 0.24, ['#1e3a8a', '#b91c1c', '#f8fafc', '#0f766e', '#ca8a04'][i % 5], 0.011);

  const m = new Mesh3();
  const XS = [-0.28, -0.172, -0.0674, 0.0674, 0.172, 0.28], ZR = 0.062, r = 0.0165;
  // Low platform and the five carriageway strips
  m.box(ID, 0, Y0 - 0.002, 0, 0.66, 0.006, 0.22, '#c8bfae');
  const yB = Y0 + 0.004, yP = yB + 0.02, yC = 0.272;
  for (const x of XS) for (const zs of [-1, 1]) {
    const z = zs * ZR;
    // pedestal with cornice, Attic base, fluted Doric shaft
    m.box(ID, x, yB, z, r * 3, 0.016, r * 3, shade(SAND, 0.96));
    m.box(ID, x, yB + 0.016, z, r * 3.2, 0.004, r * 3.2, shade(SAND, 1.04));
    m.prism(ID, x, yP, z, r * 1.3, 0.004, 16, shade(SAND, 1.02), r * 1.15, 0, false);
    m.prism(ID, x, yP + 0.004, z, r * 1.12, 0.003, 16, SAND, r * 1.02, 0, false);
    m.doric(ID, x, yP + 0.007, z, r, yC - yP - 0.007, SAND, 18);
  }
  // Pylon walls joining front and back columns (passage walls) with relief panels and mouldings
  for (const x of XS) {
    m.box(ID, x, yB, 0, r * 1.7, yC - yB, ZR * 2, shade(SAND, 0.93));
    if (Math.abs(x) < 0.25) for (const sx of [-1, 1]) {
      m.box(ID, x + sx * r * 0.85, yB + 0.07, 0, 0.002, 0.06, ZR * 1.2, shade(SAND, 0.86));
      m.box(ID, x + sx * r * 0.86, yB + 0.16, 0, 0.002, 0.004, ZR * 1.4, shade(SAND, 1.04));
    }
  }
  // Entablature: architrave, triglyph frieze, cornice
  const EW = 0.312, ED = ZR + r * 1.35;
  m.box(ID, 0, yC, 0, EW * 2, 0.02, ED * 2, SAND);
  m.box(ID, 0, yC + 0.02, 0, EW * 2 - 0.002, 0.003, ED * 2 + 0.002, shade(SAND, 1.05));
  m.box(ID, 0, yC + 0.023, 0, EW * 2 - 0.004, 0.019, ED * 2 - 0.002, shade(SAND, 0.98));
  m.box(ID, 0, yC + 0.042, 0, EW * 2 + 0.01, 0.008, ED * 2 + 0.012, shade(SAND, 1.06));
  const tg: number[] = [];
  for (let i = 0; i < XS.length; i++) { tg.push(XS[i]); if (i < XS.length - 1) { if (i === 2) tg.push(XS[i] + (XS[i + 1] - XS[i]) / 3, XS[i] + (2 * (XS[i + 1] - XS[i])) / 3); else tg.push((XS[i] + XS[i + 1]) / 2); } }
  for (const x of tg) for (const zs of [-1, 1]) {
    m.box(ID, x, yC + 0.024, zs * (ED - 0.001), 0.013, 0.017, 0.004, shade(SAND, 0.9));
    m.box(ID, x, yC + 0.026, zs * (ED + 0.001), 0.003, 0.013, 0.001, shade(SAND, 0.72));
  }
  for (let i = 0; i < tg.length - 1; i++) for (const zs of [-1, 1]) m.box(ID, (tg[i] + tg[i + 1]) / 2, yC + 0.027, zs * (ED - 0.0015), 0.008, 0.011, 0.002, shade(SAND, 1.04));
  for (const xs of [-1, 1]) for (const z of [-ZR, 0, ZR]) m.box(ID, xs * (EW - 0.001), yC + 0.024, z, 0.004, 0.017, 0.013, shade(SAND, 0.9));
  // Attic: stepped mass with the relief panel and the quadriga pedestal
  const yA = yC + 0.05;
  m.box(ID, 0, yA, 0, EW * 2 - 0.02, 0.006, ED * 2 - 0.01, shade(SAND, 0.95));
  m.box(ID, 0, yA + 0.006, 0, EW * 2 - 0.04, 0.03, ED * 2 - 0.024, SAND);
  m.box(ID, 0, yA + 0.036, 0, EW * 2 - 0.034, 0.005, ED * 2 - 0.018, shade(SAND, 1.06));
  for (const zs of [-1, 1]) {
    m.box(ID, 0, yA + 0.01, zs * (ED - 0.012), 0.2, 0.022, 0.002, shade(SAND, 0.82));
    for (let i = 0; i < 22; i++) m.box(ID, -0.095 + i * 0.009, yA + 0.012, zs * (ED - 0.011), 0.005, 0.012 + hash3(i, zs, 1) * 0.006, 0.002, shade(SAND, 1.02));
  }
  for (const xs of [-1, 1]) m.poly(xform(xs * (EW - 0.06), 0, 0, Math.PI / 2), [[-ED + 0.012, yA + 0.041], [ED - 0.012, yA + 0.041], [ED - 0.03, yA + 0.05], [-ED + 0.03, yA + 0.05]], -0.05, 0.05, shade(SAND, 0.97));
  m.box(ID, 0, yA + 0.041, 0, 0.21, 0.012, 0.09, shade(SAND, 0.98));
  m.box(ID, 0, yA + 0.053, 0, 0.17, 0.016, 0.075, SAND);
  m.box(ID, 0, yA + 0.069, 0, 0.176, 0.003, 0.08, shade(SAND, 1.06));
  const yQ = yA + 0.072;

  // Side wings (Torhäuser): Doric temple fronts facing the passage, flat attic roofs; low linking walls
  for (const xs of [-1, 1]) {
    const cx = xs * 0.41;
    m.box(ID, cx, yB, -0.01, 0.1, 0.14, 0.1, shade(SAND, 0.94));
    for (let k = 0; k < 4; k++) m.doric(ID, cx - 0.039 + k * 0.026, yB, 0.052, 0.0075, 0.13, SAND, 12);
    m.box(ID, cx, yB + 0.13, 0.015, 0.104, 0.018, 0.06 + 0.026, SAND);
    m.box(ID, cx, yB + 0.148, 0.01, 0.11, 0.005, 0.11, shade(SAND, 1.06));
    m.box(ID, cx, yB + 0.153, -0.005, 0.09, 0.012, 0.08, shade(SAND, 0.92));
    m.box(ID, xs * 0.335, yB, -0.01, 0.05, 0.075, 0.06, shade(SAND, 0.9));
  }

  // Quadriga in copper patina: plinth, four horses abreast, chariot, Victoria with wreath, iron cross and eagle
  const Q = frame(gp, 0, yQ, -0.004);
  Q.scale.setScalar(1.45);
  for (let i = 0; i < 4; i++) horse(Q, -0.027 + i * 0.018, 0, 0.012 + (i === 0 || i === 3 ? -0.003 : 0), 0.026, i % 2 ? 0.55 : 0.75, (i - 1.5) * 0.06);
  // chariot body and wheels
  box(Q, shade(PATINA, 0.9), 0, 0.012, -0.022, 0.03, 0.022, 0.018);
  for (const sx of [-1, 1]) add(Q, g('eu:wheel', () => new THREE.TorusGeometry(0.0095, 0.0018, 4, 10)), mat(shade(PATINA, 0.8)), sx * 0.017, 0.0105, -0.024, 1, 1, 1, Math.PI / 2);
  // Victoria: robed figure, spread wings, raised standard
  const vf = frame(Q, 0, 0.033, -0.026);
  ball(vf, PATINA, 0, 0.018, 0, 0.012, 0.04, 0.011);
  ball(vf, shade(PATINA, 1.05), 0, 0.042, 0, 0.007, 0.009, 0.007);
  for (const sx of [-1, 1]) ball(vf, shade(PATINA, 0.9), sx * 0.012, 0.034, -0.004, 0.022, 0.03, 0.004, 0, 0, sx * -0.5);
  rod(vf, [0.004, 0.032, 0.004], [0.012, 0.075, 0.016], 0.0011, shade(PATINA, 0.8), 4);
  add(vf, g('eu:wreath', () => new THREE.TorusGeometry(0.0055, 0.0012, 4, 12)), mat(PATINA), 0.012, 0.07, 0.016, 1, 1, 1);
  box(vf, shade(PATINA, 0.75), 0.012, 0.066, 0.0165, 0.0055, 0.0015, 0.0012);
  box(vf, shade(PATINA, 0.75), 0.012, 0.0635, 0.0165, 0.0015, 0.0065, 0.0012);
  ball(vf, shade(PATINA, 0.9), 0.012, 0.081, 0.016, 0.007, 0.006, 0.004);
  for (const sx of [-1, 1]) ball(vf, shade(PATINA, 0.9), 0.012 + sx * 0.005, 0.083, 0.016, 0.006, 0.003, 0.002, 0, 0, sx * 0.6);
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Leaning Tower of Pisa: blind-arcaded ground storey (15 arches with lozenges and the door), six open loggias of
// 30 columns each under round arcades, the narrower belfry with its 12 bell openings and bells, cornices per
// storey; ~4° lean with the slight "banana" correction of the upper storeys. Set on the lawn of the Piazza dei
// Miracoli with marble paths and the striped apse/transept of the Duomo behind.
const pisa: Builder = (gp) => {
  const MAR = '#f1ece0', GREY = '#b9b8ad';
  const Y0 = 0.035 + 0.002;
  island(gp, 0.32, () => 0.002, '#6c9b48', (x, _y, z) => {
    if (Math.hypot(x - 0.06, z - 0.03) < 0.15) return hash3(Math.floor(x * 70), 1, Math.floor(z * 70)) > 0.5 ? '#ebe6d8' : '#e2dccb';
    return fbm(x * 18, 2, z * 18) > 0.55 ? '#6a9a46' : '#76a650';
  }, { rings: 18, segs: 72, side: strataSide(EARTH) });
  for (let i = 0; i < 10; i++) person(gp, -0.12 + hash3(i, 1, 7) * 0.3, Y0, 0.18 + hash3(i, 2, 7) * 0.08, ['#1e3a8a', '#b91c1c', '#f8fafc', '#0f766e', '#ca8a04'][i % 5], 0.011);

  // Duomo (east end, facing the tower): double-aisled choir with lean-to roofs and arcaded clerestory, transept
  // with apsidal ends, the main apse in two arcaded tiers, and the elliptical lead dome on its arcaded drum over
  // the crossing. White Carrara marble striped with grey bands, blind arcades with dark recesses.
  const d = new Mesh3(), LEAD = '#8a8f94', BAND = '#a3a197';
  const Tap = xform(-0.12, 0, -0.11, Math.PI * 0.25);
  const sub = (T0: Xf, x: number, z: number, ry: number): Xf => { const L = xform(x, 0, z, ry); return v => T0(L(v)); };
  const bands = (T: Xf, x: number, z: number, w: number, dd: number, y0: number, y1: number) => {
    for (let y = y0 + 0.011; y < y1 - 0.004; y += 0.0135) d.box(T, x, y, z, w + 0.0016, 0.0034, dd + 0.0016, BAND);
  };
  /** Row of blind arches along a wall whose outward face is local +z of frame T, spanning x0..x1. */
  const arcade = (T: Xf, x0: number, x1: number, y: number, h: number, n: number, ow = 0.62, oh = 0.8) => {
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) d.arch(T, x0 + (i + 0.5) * w, y, w, h, 0.004, w * ow, h * 0.05, h * oh, MAR, 'arch', 4, true, false);
  };
  /** Half-round apse of radius r facing +z of frame T, `tiers` = [y0, h, openFraction][] */
  const apse = (T: Xf, r: number, tiers: [number, number, number][], roofY: number) => {
    const n = 9;
    for (let k = 0; k < n; k++) {
      const am = ((k + 0.5) / n) * Math.PI, w = 2 * r * Math.sin(Math.PI / n / 2) * 1.04;
      const Tk = sub(T, Math.cos(am) * r * Math.cos(Math.PI / n / 2), Math.sin(am) * r * Math.cos(Math.PI / n / 2), Math.atan2(Math.cos(am), Math.sin(am)));
      for (const [y0, h, of] of tiers) d.arch(Tk, 0, y0, w, h, 0.005, w * of, h * 0.06, h * 0.78, MAR, 'arch', 4, true, false);
    }
    d.prism(T, 0, Y0, 0, r - 0.004, roofY - Y0, 18, shade(MAR, 0.8), r - 0.004, 0, false);
    for (let y = Y0 + 0.011; y < roofY - 0.004; y += 0.0135) d.prism(T, 0, y, 0, r + 0.0018, 0.0034, 18, BAND, r + 0.0018, 0, false);
    d.prism(T, 0, roofY, 0, r + 0.004, 0.003, 18, shade(MAR, 1.04), r + 0.004, 0);
    d.prism(T, 0, roofY + 0.003, 0, r + 0.002, r * 0.55, 18, LEAD, 0.003, 0, false);
  };
  // marble plinth
  d.box(Tap, 0, Y0 - 0.002, -0.05, 0.2, 0.005, 0.17, '#e4dfd2');
  d.box(Tap, 0, Y0 - 0.002, -0.06, 0.4, 0.005, 0.09, '#e4dfd2');
  // aisles (double, under lean-to roofs) and the clerestory of the choir/nave
  const AY = Y0 + 0.1, NY = Y0 + 0.17, NW = 0.04, AW = 0.095, Z0 = -0.135, Z1 = 0.03, TZc = -0.06, TD = 0.08, TL = 0.17;
  d.box(Tap, 0, Y0, (Z0 + Z1) / 2, AW * 2, AY - Y0, Z1 - Z0, MAR);
  bands(Tap, 0, (Z0 + Z1) / 2, AW * 2, Z1 - Z0, Y0, AY);
  for (const sx of [-1, 1]) {
    const Ts = sub(Tap, sx * (AW + 0.0005), 0, sx * Math.PI / 2);
    // wall stretches not covered by the transept, mapped into the side frame's x (= -z on the +x side)
    const runs = ([[TZc + TD / 2, Z1, 1], [Z0, TZc - TD / 2, 1]] as const).map(([za, zb, n]) => (sx > 0 ? [-zb, -za, n] : [za, zb, n]) as [number, number, number]);
    for (const [xa, xb, n] of runs) arcade(Ts, xa, xb, Y0 + 0.006, 0.086, n);
    d.tq(Tap, [sx * (AW + 0.004), AY, Z0], [sx * (AW + 0.004), AY, Z1 + 0.003], [sx * NW, AY + 0.028, Z1 + 0.003], [sx * NW, AY + 0.028, Z0], LEAD, [sx, 1, 0]);
    const Tc = sub(Tap, sx * (NW + 0.0005), 0, sx * Math.PI / 2);
    for (const [za, zb] of runs) {
      const n = 1, w = (zb - za) / n;
      for (let i = 0; i < n; i++) d.arch(Tc, za + (i + 0.5) * w, AY + 0.028, w, NY - AY - 0.028, 0.004, w * 0.36, 0.008, 0.026, MAR, 'arch', 4, false, false);
    }
  }
  d.box(Tap, 0, AY, (Z0 + Z1) / 2, NW * 2, NY - AY, Z1 - Z0, MAR);
  bands(Tap, 0, (Z0 + Z1) / 2, NW * 2, Z1 - Z0, AY + 0.02, NY);
  d.box(Tap, 0, NY - 0.003, (Z0 + Z1) / 2, NW * 2 + 0.006, 0.004, Z1 - Z0 + 0.004, shade(MAR, 1.04));
  d.poly(Tap, [[-NW - 0.004, NY], [NW + 0.004, NY], [0, NY + 0.03]], Z0, Z1, LEAD);
  // transept with apsidal ends and gabled lead roof
  d.box(Tap, 0, Y0, TZc, TL * 2, NY - 0.005 - Y0, TD, MAR);
  bands(Tap, 0, TZc, TL * 2, TD, Y0, NY - 0.005);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const Tf = sub(Tap, 0, TZc + sz * (TD / 2 + 0.0005), sz > 0 ? 0 : Math.PI);
    arcade(Tf, sx > 0 ? AW + 0.004 : -TL, sx > 0 ? TL : -AW - 0.004, Y0 + 0.006, 0.09, 2);
    arcade(Tf, sx > 0 ? AW + 0.004 : -TL, sx > 0 ? TL : -AW - 0.004, Y0 + 0.1, 0.06, 4, 0.4, 0.62);
  }
  const Tt = sub(Tap, 0, TZc, Math.PI / 2);
  d.poly(Tt, [[-TD / 2 - 0.004, NY - 0.005], [TD / 2 + 0.004, NY - 0.005], [0, NY + 0.025]], -TL, TL, LEAD);
  for (const sx of [-1, 1]) {
    d.poly(Tt, [[-TD / 2, NY - 0.005], [TD / 2, NY - 0.005], [0, NY + 0.021]], sx * TL - 0.002, sx * TL + 0.002, MAR);
    d.prism(Tap, sx * TL, NY + 0.021, TZc, 0.003, 0.012, 6, MAR, 0.001);
    apse(sub(Tap, sx * TL, TZc, sx * Math.PI / 2), 0.032, [[Y0 + 0.004, 0.07, 0.6], [Y0 + 0.078, 0.046, 0.5]], Y0 + 0.124);
  }
  // main apse, two arcaded tiers with the upper open gallery
  apse(sub(Tap, 0, Z1, 0), NW + 0.004, [[Y0 + 0.004, 0.1, 0.62], [Y0 + 0.108, 0.058, 0.55]], NY - 0.004);
  // crossing: arcaded drum and elliptical ribbed lead dome with lantern
  const Te: Xf = v => Tap([v[0] * 0.86, v[1], TZc + v[2] * 1.12]);
  const DY = NY + 0.042;
  d.prism(Te, 0, NY - 0.005, 0, 0.042, DY - NY + 0.005, 16, MAR, 0.042, 0, false);
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) / 16) * TAU, w = 2 * 0.044 * Math.sin(Math.PI / 16) * 1.04;
    d.arch(sub(Te, Math.cos(a) * 0.044, Math.sin(a) * 0.044, Math.atan2(Math.cos(a), Math.sin(a))), 0, DY - 0.026, w, 0.024, 0.004, w * 0.55, 0.003, 0.017, MAR, 'arch', 4, false, false);
  }
  d.prism(Te, 0, DY - 0.002, 0, 0.047, 0.004, 16, shade(MAR, 1.04), 0.047, 0);
  const prof: [number, number][] = [[0.044, 0], [0.043, 0.014], [0.039, 0.03], [0.032, 0.045], [0.022, 0.057], [0.01, 0.064], [0.006, 0.065]];
  for (let i = 0; i < prof.length - 1; i++) d.prism(Te, 0, DY + 0.002 + prof[i][1], 0, prof[i][0], prof[i + 1][1] - prof[i][1], 16, i % 2 ? shade(LEAD, 0.94) : LEAD, prof[i + 1][0], Math.PI / 16, i === prof.length - 2);
  d.prism(Te, 0, DY + 0.067, 0, 0.0065, 0.012, 8, MAR, 0.006);
  d.prism(Te, 0, DY + 0.079, 0, 0.0075, 0.003, 8, LEAD, 0.004);
  d.prism(Te, 0, DY + 0.082, 0, 0.0012, 0.012, 4, '#b08d3a');
  // marble paths across the lawn
  d.box(xform(0.17, 0, 0.18, -0.6), 0, Y0 - 0.0015, 0, 0.02, 0.0025, 0.2, '#e9e4d6');
  d.box(xform(-0.12, 0, 0.12, 1.2), 0, Y0 - 0.0015, 0, 0.02, 0.0025, 0.2, '#e9e4d6');
  d.build(gp);

  // Tower (local frame, then leaned): r = outer radius per storey
  const tw = new THREE.Group();
  const TX = 0.06, TZ = 0.03;
  tw.position.set(TX, Y0, TZ);
  const dir = new THREE.Vector3(0.83, 0, 0.56).normalize();
  tw.quaternion.setFromAxisAngle(new THREE.Vector3(dir.z, 0, -dir.x), (4 * Math.PI) / 180);
  gp.add(tw);
  const m = new Mesh3();
  const radial = (r: number, a: number, y = 0, sh = 0): Xf => xform(Math.cos(a) * r + sh * dir.x, y, Math.sin(a) * r + sh * dir.z, Math.atan2(Math.cos(a), Math.sin(a)));
  // Plinth steps
  m.prism(ID, 0, -0.012, 0, 0.13, 0.016, 40, '#e6e0d0', 0.13, 0);
  m.prism(ID, 0, 0.004, 0, 0.121, 0.006, 40, shade(MAR, 1.02), 0.121, 0);
  // Ground storey: core, 15 blind arches with engaged columns, lozenges, door
  const G = 0.158, R0 = 0.108, yg = 0.01;
  m.prism(ID, 0, yg, 0, R0 - 0.003, G, 30, shade(MAR, 0.97), R0 - 0.003, 0, false);
  for (let k = 0; k < 15; k++) {
    const a = ((k + 0.5) / 15) * TAU, w = 2 * R0 * Math.sin(Math.PI / 15) * 1.03;
    const T = radial(R0, a, yg);
    m.arch(T, 0, 0, w, G - 0.012, 0.004, w * 0.72, 0, G - 0.03, MAR, 'arch', 6, false, false);
    m.poly(T, [[0, G - 0.045], [0.006, G - 0.035], [0, G - 0.025], [-0.006, G - 0.035]], -0.001, 0.0015, GREY);
    m.prism(radial(R0 + 0.001, (k / 15) * TAU, yg), 0, 0.004, 0, 0.0062, G - 0.035, 8, MAR, 0.0058, 0, false);
    m.box(radial(R0 + 0.003, (k / 15) * TAU, yg), 0, G - 0.031, 0, 0.016, 0.006, 0.01, shade(MAR, 1.04));
    if (k === 9) m.box(T, 0, 0, -0.0005, 0.03, 0.07, 0.0035, '#4b3f33');
  }
  let y = yg + G - 0.012;
  const corn = (yy: number, rr: number) => {
    m.prism(ID, 0, yy, 0, rr - 0.002, 0.004, 40, shade(MAR, 0.96), rr, 0);
    m.prism(ID, 0, yy + 0.004, 0, rr, 0.006, 40, shade(MAR, 1.04), rr, 0);
  };
  corn(y, 0.117);
  y += 0.01;
  // Six loggias: 30 columns under round arches around an inner arcaded wall
  const GH = 0.0875, NC = 30, RC = 0.103, RW = 0.084;
  for (let st = 0; st < 6; st++) {
    const sh = -0.0012 * st * st * 0.25;
    const Ts = (v: V3): V3 => [v[0] + sh * dir.x, v[1], v[2] + sh * dir.z];
    const tone = st % 2 ? MAR : shade(MAR, 0.985);
    m.prism(Ts, 0, y, 0, RW, GH, 30, '#77716a', RW, 0, false);
    // blind arches on the inner wall (deep shadow inside the gallery)
    for (let k = 0; k < 15; k++) {
      const a = ((k + 0.5) / 15) * TAU, w = 2 * RW * Math.sin(Math.PI / 15) * 1.03;
      const T = radial(RW, a, y, sh);
      m.arch(T, 0, 0, w, GH - 0.012, 0.003, w * 0.6, 0, GH - 0.03, '#8a847b', 'arch', 4, false, false);
    }
    const ch = GH - 0.036;
    for (let k = 0; k < NC; k++) {
      const a = (k / NC) * TAU, T = radial(RC, a, y, sh);
      m.prism(T, 0, 0.002, 0, 0.0043, ch, 6, tone, 0.0039, 0, false);
      m.box(T, 0, 0.002 + ch, 0, 0.011, 0.004, 0.011, shade(tone, 1.05));
      const Tb = radial(RC, a + Math.PI / NC, y, sh);
      const w = 2 * RC * Math.sin(Math.PI / NC) * 1.04;
      m.arch(Tb, 0, ch + 0.006, w, GH - ch - 0.006 - 0.008, 0.008, w - 0.011, 0, 0.008, tone, 'arch', 4, false, true);
    }
    // ceiling of the gallery (dark), then the storey cornice / next floor
    y += GH - 0.008;
    m.prism(Ts, 0, y - 0.001, 0, RC + 0.004, 0.001, 30, '#6d675a', RC + 0.004, 0);
    corn2(m, Ts, y, 0.114, tone);
    y += 0.008;
  }
  // Belfry: 12 arched openings over a dark interior with bells; cornice and top railing
  const RB = 0.072, BH = 0.088;
  m.prism(ID, 0, y, 0, RB - 0.012, BH, 24, '#3d352c', RB - 0.012, 0);
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * TAU, w = 2 * RB * Math.sin(Math.PI / 12) * 1.03;
    const T = radial(RB, a, y);
    m.arch(T, 0, 0, w, BH - 0.01, 0.01, w * 0.55, 0.016, BH - 0.04, MAR, 'arch', 6, false, true);
    m.prism(radial(RB + 0.004, (k / 12) * TAU, y), 0, 0.016, 0, 0.0038, BH - 0.036, 6, MAR, 0.0034, 0, false);
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    m.prism(ID, Math.cos(a) * 0.045, y + 0.045, Math.sin(a) * 0.045, 0.004, 0.012, 8, '#9a6b2f', 0.009, 0);
  }
  corn2(m, ID, y + BH - 0.01, RB + 0.008, MAR);
  y += BH;
  m.prism(ID, 0, y - 0.002, 0, RB + 0.006, 0.004, 24, shade(MAR, 0.95), RB + 0.006, 0);
  // Railings: at the top and around the belfry terrace
  for (const [ry, rr, n] of [[y + 0.002, RB + 0.004, 24], [y - BH, 0.112, 40]] as const) {
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; m.box(xform(Math.cos(a) * rr, 0, Math.sin(a) * rr, a), 0, ry, 0, 0.0012, 0.011, 0.0012, '#5b5b5b'); }
    m.prism(ID, 0, ry + 0.011, 0, rr + 0.0008, 0.0012, n, '#5b5b5b', rr + 0.0008, 0, false);
  }
  m.build(tw);
};
function corn2(m: Mesh3, T: Xf, yy: number, rr: number, c: string): void {
  m.prism(T, 0, yy, 0, rr - 0.003, 0.003, 40, shade(c, 0.95), rr, 0, false);
  m.prism(T, 0, yy + 0.003, 0, rr, 0.005, 40, shade(c, 1.05), rr, 0);
}

// ---------------------------------------------------------------------------------------------------------
// Elizabeth Tower ("Big Ben", London): Gothic Revival shaft with corner buttresses, vertical panelling, string
// courses and lancets; tracery band; clock stage with gilded square surrounds, white dials with radial tracery,
// numerals and hands; arcaded belfry; steep slate roof with dormers and corner pinnacles; gilded Ayrton lantern,
// spire and finial. With a slice of the Palace of Westminster's river front, the Thames, its embankment and the
// green-painted Westminster Bridge with a red bus.
const GOLD = '#d2a845';
/** Calls f with an outward-facing frame for each of the four faces of a square plan (half-size h) at (cx,cz). */
function faces4(cx: number, cz: number, h: number, f: (T: Xf, i: number) => void): void {
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; f(xform(cx + Math.sin(a) * h, 0, cz + Math.cos(a) * h, a), i); }
}
const bigben: Builder = (gp) => {
  const STONE = '#cdb27e', DARK = '#3a3226', SLATE = '#3f4955';
  const Y0 = 0.04, RIVER = 0.13;
  island(gp, 0.4, (_x, z) => (z > RIVER ? -0.014 : 0.004), '#7f8c6a', (x, y, z) => {
    if (y < 0.03) return hash3(Math.floor(x * 50), 3, Math.floor(z * 50)) > 0.8 ? '#58797d' : '#4f6f73';
    if (x < -0.17 && z < 0.08) return fbm(x * 20, 1, z * 20) > 0.5 ? '#6d9a4c' : '#78a656';
    if (Math.abs(x + 0.12) < 0.04) return '#4b4f55';
    return (Math.floor(x * 60) + Math.floor(z * 60)) % 2 ? '#bdb7aa' : '#b3ad9f';
  }, { rings: 16, segs: 72, side: strataSide(EARTH) });
  const m = new Mesh3();
  // Embankment wall with lamps
  m.box(ID, 0, Y0 - 0.026, RIVER + 0.003, 0.76, 0.032, 0.008, '#8e8a80');
  for (let i = 0; i < 9; i++) { const x = -0.04 + i * 0.055; if (Math.hypot(x, RIVER) < 0.37) { m.prism(ID, x, Y0, RIVER + 0.004, 0.0015, 0.03, 5, '#2f3b36'); m.box(ID, x, Y0 + 0.03, RIVER + 0.004, 0.006, 0.008, 0.006, '#f4e3a8'); } }
  // Westminster Bridge: green segmental arches, granite piers, white parapets, a red bus
  const BX = -0.21, BW = 0.085;
  m.box(ID, BX, Y0 - 0.002, 0.235, BW, 0.008, 0.21, '#6f7276');
  for (const sx of [-1, 1]) {
    const Tb = xform(BX + sx * BW / 2, 0, 0, sx * Math.PI / 2);
    for (let k = 0; k < 2; k++) {
      m.arch(Tb, -sx * (0.19 + k * 0.1), Y0 - 0.03, 0.1, 0.03, 0.006, 0.08, 0, 0.022, '#3f7f62', 'arch', 8, false, false);
      m.box(Tb, -sx * (0.24 + k * 0.1), Y0 - 0.032, -0.002, 0.016, 0.032, 0.014, '#9b968a');
    }
    m.box(Tb, -sx * 0.235, Y0 + 0.006, 0, 0.21, 0.008, 0.004, '#e9e5da');
    for (let k = 0; k < 4; k++) m.prism(Tb, -sx * (0.16 + k * 0.055), Y0 + 0.006, 0, 0.0012, 0.03, 4, '#2f3b36');
  }
  const bus = (x: number, z: number) => {
    m.box(ID, x, Y0 + 0.007, z, 0.022, 0.042, 0.075, '#c8102e');
    for (const y of [0.016, 0.034]) m.box(ID, x, Y0 + 0.007 + y, z, 0.0225, 0.007, 0.07, '#22262b');
  };
  bus(BX - 0.017, 0.25);
  m.box(ID, BX + 0.018, Y0 + 0.006, 0.2, 0.016, 0.014, 0.03, '#111111');
  // Parliament Square plane trees and road traffic
  for (let i = 0; i < 9; i++) {
    const x = -0.35 + (i % 3) * 0.07 + hash3(i, 1, 1) * 0.02, z = -0.2 + Math.floor(i / 3) * 0.09;
    if (Math.hypot(x, z) > 0.37) continue;
    rod(gp, [x, Y0, z], [x, Y0 + 0.05, z], 0.004, '#5b4636', 4);
    ball(gp, i % 2 ? '#4f7f3f' : '#5d8c47', x, Y0 + 0.075, z, 0.06, 0.06, 0.06);
  }
  bus(-0.12, -0.16);

  // Palace of Westminster river front: Perpendicular Gothic bays between buttress shafts that rise into
  // pinnacles, three tiers of pointed traceried windows with panelled spandrels, pierced crenellated parapet,
  // projecting end pavilions with steep iron-crested roofs and corner turrets, the steep slate roof with
  // cresting, and the octagonal Central Tower with its spire and pinnacle ring rising behind.
  const PX0 = 0.1, PX1 = 0.37, PZ = 0.09, PH = 0.15, LT = shade(STONE, 1.06), WIN = '#3b3428';
  m.box(ID, (PX0 + PX1) / 2, Y0, -0.01, PX1 - PX0, PH, 0.2, shade(STONE, 0.96));
  const pf = xform(0, 0, PZ + 0.0001, 0);
  const bayW = 0.0225, nb = Math.floor((PX1 - PX0 - 0.01) / bayW);
  const pav = (i: number) => i < 2 || i >= nb - 2 || i === 5 || i === 6;
  for (let i = 0; i <= nb; i++) {
    const x = PX0 + 0.006 + i * bayW;
    const proj = (i <= 2 || i >= nb - 2 || (i >= 5 && i <= 7)) ? 0.006 : 0;
    m.box(pf, x, Y0, proj / 2, 0.0045, PH + 0.014, 0.005 + proj, LT);
    m.prism(pf, x, Y0 + PH + 0.014, proj / 2, 0.003, 0.02, 4, LT, 0.0004, Math.PI / 4);
    if (i === nb) break;
    const xc = x + bayW / 2, dz = pav(i) ? 0.006 : 0;
    // windows: pointed heads in three tiers with dark glazing and stone mullion/transom
    for (const [wy, wh] of [[0.016, 0.026], [0.054, 0.034], [0.1, 0.026]] as const) {
      m.arch(xform(xc, 0, PZ + dz + 0.002, 0), 0, Y0 + wy - 0.004, bayW - 0.0045, wh + 0.008, 0.004, 0.011, 0.004, wh, STONE, 'pointed', 4, false, false);
      m.box(pf, xc, Y0 + wy, dz - 0.001, 0.011, wh - 0.002, 0.001, WIN);
      m.box(pf, xc, Y0 + wy, dz - 0.0005, 0.0012, wh - 0.004, 0.0015, LT);
      m.box(pf, xc, Y0 + wy + wh * 0.55, dz - 0.0005, 0.011, 0.0012, 0.0015, LT);
    }
    if (dz) m.box(pf, xc, Y0, dz / 2, bayW - 0.0044, PH, dz, shade(STONE, 0.98));
    // pierced parapet: merlons over each bay
    for (let k = 0; k < 3; k++) m.box(pf, x + 0.0045 + k * 0.0068, Y0 + PH + 0.002, dz + 0.001, 0.0036, 0.008, 0.004, LT);
  }
  for (const y of [0.012, 0.048, 0.094, PH - 0.006]) m.box(pf, (PX0 + PX1) / 2, Y0 + y, 0.004, PX1 - PX0, 0.003, 0.009, shade(STONE, 1.1));
  // west end wall (seen past the clock tower): same window tiers between buttress shafts
  const ef = xform(PX0 - 0.0001, 0, -0.01, -Math.PI / 2), efa = xform(PX0 - 0.0021, 0, -0.01, -Math.PI / 2), en = 8, ew = 0.19 / en;
  for (let i = 0; i <= en; i++) {
    const x = -0.095 + i * ew;
    m.box(ef, x, Y0, 0, 0.004, PH + 0.006, 0.004, LT, false, false);
    if (i === en) break;
    for (const [wy, wh] of [[0.016, 0.026], [0.054, 0.034], [0.1, 0.026]] as const) {
      m.arch(efa, x + ew / 2, Y0 + wy - 0.004, ew - 0.004, wh + 0.008, 0.003, 0.01, 0.004, wh, STONE, 'pointed', 4, false, false);
      m.box(ef, x + ew / 2, Y0 + wy, 0.0005, 0.01, wh - 0.002, 0.001, WIN, false, false);
      m.box(ef, x + ew / 2, Y0 + wy, 0.001, 0.0012, wh - 0.004, 0.0015, LT, false, false);
    }
  }
  for (const y of [0.012, 0.048, 0.094, PH - 0.006]) m.box(ef, 0, Y0 + y, 0.002, 0.2, 0.003, 0.005, shade(STONE, 1.1), false, false);
  // steep slate roof with gilded cresting
  m.poly(xform((PX0 + PX1) / 2, 0, -0.01, Math.PI / 2), [[-0.09, Y0 + PH], [0.09, Y0 + PH], [0.025, Y0 + PH + 0.05], [-0.025, Y0 + PH + 0.05]], -(PX1 - PX0) / 2 + 0.004, (PX1 - PX0) / 2 - 0.004, SLATE);
  for (let x = PX0 + 0.01; x < PX1 - 0.005; x += 0.012) m.prism(ID, x, Y0 + PH + 0.05, -0.01, 0.0012, 0.008, 4, GOLD, 0.0003);
  // end pavilions: steep pyramidal roofs with iron cresting and corner turrets
  for (const tx of [PX0 + 0.006 + bayW, PX0 + 0.006 + bayW * 6, PX1 - 0.006 - bayW * 1.5]) {
    const tz = PZ - 0.012;
    m.box(ID, tx, Y0, tz - 0.004, 0.034, PH + 0.03, 0.034, STONE);
    for (const y of [0.05, 0.1]) m.box(ID, tx, Y0 + PH + 0.03 - 0.03 + y * 0.2, tz + 0.0135, 0.022, 0.003, 0.004, LT);
    m.prism(ID, tx, Y0 + PH + 0.03, tz - 0.004, 0.026, 0.05, 4, SLATE, 0.003, Math.PI / 4);
    m.prism(ID, tx, Y0 + PH + 0.08, tz - 0.004, 0.0012, 0.012, 4, GOLD, 0.0003);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      m.prism(ID, tx + dx * 0.0165, Y0 + PH - 0.01, tz - 0.004 + dz * 0.0165, 0.004, 0.05, 8, LT, 0.004);
      m.prism(ID, tx + dx * 0.0165, Y0 + PH + 0.04, tz - 0.004 + dz * 0.0165, 0.0045, 0.022, 8, shade(STONE, 1.02), 0.0006);
    }
  }
  // Central Tower: octagonal lantern with tall lancets, pinnacle ring and the spire
  const CX = 0.29, CZ = -0.07, cy0 = Y0 + PH + 0.01, cr = 0.03;
  m.prism(ID, CX, Y0 + PH - 0.02, CZ, cr + 0.004, 0.03, 8, STONE, cr + 0.004, Math.PI / 8);
  m.prism(ID, CX, cy0, CZ, cr, 0.085, 8, STONE, cr * 0.96, Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, T = xform(CX + Math.sin(a) * cr * 0.93, 0, CZ + Math.cos(a) * cr * 0.93, a);
    m.arch(T, 0, cy0 + 0.012, 0.02, 0.06, 0.004, 0.011, 0.004, 0.05, STONE, 'pointed', 4, false, false);
    const ac = a + Math.PI / 8, px = CX + Math.sin(ac) * cr * 1.04, pz = CZ + Math.cos(ac) * cr * 1.04;
    m.prism(ID, px, cy0, pz, 0.0035, 0.09, 6, LT, 0.003);
    m.prism(ID, px, cy0 + 0.09, pz, 0.004, 0.026, 6, LT, 0.0005);
  }
  m.prism(ID, CX, cy0 + 0.085, CZ, cr + 0.002, 0.005, 8, LT, cr + 0.002, Math.PI / 8);
  m.prism(ID, CX, cy0 + 0.09, CZ, cr * 0.82, 0.12, 8, shade(STONE, 0.92), 0.002, Math.PI / 8);
  for (let k = 0; k < 4; k++) m.prism(ID, CX, cy0 + 0.1 + k * 0.025, CZ, cr * (0.72 - k * 0.17), 0.003, 8, LT, cr * (0.72 - k * 0.17), Math.PI / 8);
  m.prism(ID, CX, cy0 + 0.21, CZ, 0.001, 0.02, 4, GOLD, 0.0002);
  // link wing between palace and tower
  m.box(ID, 0.06, Y0, -0.02, 0.1, 0.12, 0.1, shade(STONE, 0.94));

  // ---- Elizabeth Tower --------------------------------------------------------------------------------
  const W = 0.13, H = W / 2;
  m.box(ID, 0, Y0, 0, W + 0.018, 0.03, W + 0.018, shade(STONE, 0.92));
  const yS0 = Y0 + 0.03, yS1 = 0.49;
  m.box(ID, 0, yS0, 0, W, yS1 - yS0, W, STONE);
  faces4(0, 0, H, (T) => {
    // corner buttresses, vertical ribs, string courses, lancets and blind panels
    for (const sx of [-1, 1]) m.box(T, sx * (H - 0.006), yS0, 0.002, 0.014, yS1 - yS0, 0.006, shade(STONE, 1.04));
    for (let k = 0; k < 7; k++) m.box(T, -H + 0.016 + (k * (W - 0.032)) / 6, yS0, 0.0012, 0.0028, yS1 - yS0, 0.0024, shade(STONE, 1.08));
    for (let y = yS0 + 0.06; y < yS1; y += 0.075) m.box(T, 0, y, 0.0015, W, 0.004, 0.004, shade(STONE, 1.1));
    for (let y = yS0 + 0.075; y < yS1 - 0.04; y += 0.075) for (const f of [0.32, 0.41, 0.59, 0.68]) m.box(T, -H + f * W, y, 0.0006, 0.0055, 0.03, 0.0012, DARK);
    for (let y = yS0 + 0.012; y < yS1; y += 0.075) for (let k = 0; k < 6; k++) m.box(T, -H + 0.016 + ((k + 0.5) * (W - 0.032)) / 6, y, 0.0008, 0.0085, 0.04, 0.001, shade(STONE, 0.88));
  });
  // Tracery band and clock stage
  const yC0 = 0.52, yC1 = 0.65, WC = 0.142, HC = WC / 2;
  m.box(ID, 0, yS1, 0, W + 0.006, yC0 - yS1, W + 0.006, shade(STONE, 1.03));
  m.box(ID, 0, yC0, 0, WC, yC1 - yC0, WC, STONE);
  const yc = (yC0 + yC1) / 2 - 0.002, R = 0.047;
  faces4(0, 0, HC, (T, fi) => {
    for (let k = 0; k < 10; k++) m.arch(T, -HC + 0.007 + k * 0.0142, yS1 + 0.006, 0.0142, 0.022, 0.002, 0.008, 0.002, 0.016, shade(STONE, 1.05), 'pointed', 4, false, false);
    // gilded square surround with spandrels
    m.box(T, 0, yc - 0.06, 0.001, 0.124, 0.12, 0.002, GOLD);
    m.box(T, 0, yc - 0.057, 0.0022, 0.114, 0.114, 0.0012, shade(GOLD, 0.82));
    const dial: [number, number][] = [];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; dial.push([Math.cos(a) * R, yc + Math.sin(a) * R]); }
    m.poly(T, dial, 0.0022, 0.0036, '#f3eedf', false);
    const ring = (rr: number, w: number, c: string, z: number) => {
      for (let k = 0; k < 24; k++) {
        const a0 = (k / 24) * TAU, a1 = ((k + 1) / 24) * TAU;
        m.poly(T, [[Math.cos(a0) * rr, yc + Math.sin(a0) * rr], [Math.cos(a1) * rr, yc + Math.sin(a1) * rr], [Math.cos(a1) * (rr - w), yc + Math.sin(a1) * (rr - w)], [Math.cos(a0) * (rr - w), yc + Math.sin(a0) * (rr - w)]], z, z + 0.0008, c, false);
      }
    };
    ring(R + 0.003, 0.004, '#2a2a2a', 0.0036);
    ring(R * 0.62, 0.0018, '#3a3a3a', 0.0036);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, c = Math.cos(a), sn = Math.sin(a), px = -sn * 0.0006, py = c * 0.0006;
      m.poly(T, [[c * R * 0.16 + px, yc + sn * R * 0.16 + py], [c * R * 0.62 + px, yc + sn * R * 0.62 + py], [c * R * 0.62 - px, yc + sn * R * 0.62 - py], [c * R * 0.16 - px, yc + sn * R * 0.16 - py]], 0.0036, 0.0042, '#4a4a4a', false);
      const nx = -sn * 0.0018, ny = c * 0.0018;
      m.poly(T, [[c * R * 0.74 + nx, yc + sn * R * 0.74 + ny], [c * R * 0.92 + nx, yc + sn * R * 0.92 + ny], [c * R * 0.92 - nx, yc + sn * R * 0.92 - ny], [c * R * 0.74 - nx, yc + sn * R * 0.74 - ny]], 0.0036, 0.0044, '#1f1f1f', false);
    }
    // hands (ten past ten), slightly different per face
    const hand = (ang: number, len: number, w: number) => {
      const c = Math.cos(ang), sn = Math.sin(ang), px = -sn * w, py = c * w;
      m.poly(T, [[px - c * 0.006, yc + py - sn * 0.006], [c * len, yc + sn * len], [-px - c * 0.006, yc - py - sn * 0.006]], 0.0044, 0.0054, '#151515', false);
    };
    hand(Math.PI / 2 - (10 + fi * 0.02) * (TAU / 12), R * 0.62, 0.0026);
    hand(Math.PI / 2 - (2 + fi * 0.05) * (TAU / 12), R * 0.9, 0.0018);
    m.box(T, 0, yc + R + 0.011, 0.002, 0.11, 0.004, 0.002, GOLD);
    m.box(T, 0, yc - R - 0.012, 0.002, 0.11, 0.004, 0.002, GOLD);
  });
  // Clock-stage corner pinnacles
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    m.prism(ID, dx * (HC - 0.004), yC1, dz * (HC - 0.004), 0.007, 0.012, 8, STONE, 0.007, Math.PI / 8);
    m.prism(ID, dx * (HC - 0.004), yC1 + 0.012, dz * (HC - 0.004), 0.007, 0.04, 8, shade(STONE, 1.06), 0.0005, Math.PI / 8);
  }
  // Belfry: five pointed openings per face over a dark chamber
  const yB0 = yC1, yB1 = 0.705, WB = 0.128;
  m.box(ID, 0, yB0 - 0.004, 0, WC + 0.006, 0.008, WC + 0.006, shade(STONE, 1.08));
  m.box(ID, 0, yB0, 0, WB - 0.014, yB1 - yB0, WB - 0.014, DARK);
  faces4(0, 0, WB / 2 - 0.003, (T) => {
    for (let k = 0; k < 5; k++) m.arch(T, -WB / 2 + 0.0128 + k * 0.0256, yB0 + 0.004, 0.0256, yB1 - yB0 - 0.004, 0.006, 0.014, 0.006, 0.036, STONE, 'pointed', 4, false, false);
    m.box(T, 0, yB1 - 0.006, 0.003, WB, 0.006, 0.004, shade(STONE, 1.1));
    for (let k = 0; k < 13; k++) m.box(T, -WB / 2 + 0.005 + k * 0.0098, yB1, 0.002, 0.003, 0.009, 0.003, GOLD);
  });
  // Slate roof with two rows of dormers and gilded corner pinnacles
  const yR0 = yB1, yR1 = 0.78, w0 = WB / 2 + 0.004, w1 = 0.034;
  faces4(0, 0, 0, (T) => {
    m.tq(T, [-w0, yR0, w0], [w0, yR0, w0], [w1, yR1, w1], [-w1, yR1, w1], SLATE, [0, (w0 - w1) / (yR1 - yR0), 1]);
    for (const [f, n] of [[0.25, 3], [0.62, 2]] as const) {
      const yy = yR0 + f * (yR1 - yR0), ww = w0 + (w1 - w0) * f, zz = ww;
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * ww * 0.6;
        m.box(T, x, yy, zz - 0.002, 0.012, 0.014, 0.01, shade(STONE, 1.04));
        m.box(T, x, yy + 0.002, zz + 0.0032, 0.007, 0.009, 0.001, '#1d2329');
        m.poly(T, [[x - 0.007, yy + 0.014], [x + 0.007, yy + 0.014], [x, yy + 0.022]], zz - 0.007, zz + 0.003, GOLD);
      }
    }
  });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    m.prism(ID, dx * w0, yR0, dz * w0, 0.0055, 0.03, 6, STONE, 0.0055);
    m.prism(ID, dx * w0, yR0 + 0.03, dz * w0, 0.0055, 0.03, 6, GOLD, 0.0004);
  }
  // Ayrton Light lantern, spire and finial
  const yL0 = yR1, yL1 = 0.845, WL = 0.062;
  m.box(ID, 0, yL0, 0, WL - 0.01, yL1 - yL0, WL - 0.01, '#2a241a');
  faces4(0, 0, WL / 2 - 0.002, (T) => {
    for (let k = 0; k < 3; k++) m.arch(T, -WL / 2 + 0.0103 + k * 0.0207, yL0 + 0.004, 0.0207, yL1 - yL0 - 0.012, 0.004, 0.011, 0.004, 0.034, GOLD, 'pointed', 4, false, false);
    m.box(T, 0, yL1 - 0.008, 0.002, WL, 0.008, 0.004, shade(GOLD, 1.06));
  });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.prism(ID, dx * (WL / 2 - 0.002), yL1 - 0.008, dz * (WL / 2 - 0.002), 0.004, 0.028, 6, GOLD, 0.0003);
  const yP1 = 0.985;
  faces4(0, 0, 0, (T) => {
    m.tq(T, [-WL / 2 + 0.003, yL1, WL / 2 - 0.003], [WL / 2 - 0.003, yL1, WL / 2 - 0.003], [0.002, yP1, 0.002], [-0.002, yP1, 0.002], SLATE, [0, 0.2, 1]);
    for (const f of [0.2, 0.42, 0.62]) {
      const ww = (WL / 2 - 0.003) * (1 - f) + 0.002 * f, yy = yL1 + f * (yP1 - yL1);
      for (let k = -1; k <= 1; k++) if (f < 0.6 || k === 0) m.box(T, k * ww * 0.5, yy, ww + 0.0006, 0.003, 0.004, 0.002, GOLD);
    }
  });
  m.prism(ID, 0, yP1, 0, 0.0035, 0.018, 6, GOLD, 0.001);
  m.box(ID, 0, yP1 + 0.024, 0, 0.0018, 0.02, 0.0018, GOLD);
  m.box(ID, 0, yP1 + 0.034, 0, 0.01, 0.0018, 0.0018, GOLD);
  ball(gp, GOLD, 0, yP1 + 0.02, 0, 0.007);
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Tower Bridge (London): two Gothic stone-clad towers on boat-shaped granite piers, each with four octagonal
// corner turrets under slate spirelets with gilded finials, a steep central roof and the pointed road arch; the
// lifting bascules (raised slightly), the two high-level lattice walkways, the curved suspension chains of the
// side spans with hangers, abutment towers, embankments and a Thames tour boat. Blue & white paintwork.
/** Faces of a rectangular plan (half-extents hx,hz): T maps local +z outward; `along` = half the face width. */
function rect4(cx: number, cz: number, hx: number, hz: number, f: (T: Xf, i: number, along: number) => void): void {
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, d = i % 2 ? hx : hz;
    f(xform(cx + Math.sin(a) * d, 0, cz + Math.cos(a) * d, a), i, i % 2 ? hz : hx);
  }
}
const towerbridge: Builder = (gp) => {
  const STONE = '#d8d0bf', GRAN = '#9c978c', SLATE = '#4a5560', BLUE = '#8ec3e6', WHITE = '#f1f5f9', ROAD = '#55595f';
  const SH = 0.335, Y0 = 0.035, IR = 0.46;
  island(gp, IR, (x) => (Math.abs(x) > SH ? 0.006 : -0.014), '#7f8c6a', (x, y, z) => {
    if (y < 0.03) return fbm(x * 9, 4, z * 30) > 0.58 ? '#56777a' : '#4a6b6e';
    if (Math.abs(z) < 0.03) return ROAD;
    if (Math.abs(x) < SH + 0.035 || Math.abs(z) < 0.045) return (Math.floor(x * 60) + Math.floor(z * 60)) % 2 ? '#bdb7aa' : '#b3ad9f';
    return fbm(x * 20, 1, z * 20) > 0.5 ? '#6d9a4c' : '#78a656';
  }, { rings: 16, segs: 72, side: strataSide(EARTH) });
  const m = new Mesh3();
  const yW = Y0 - 0.014, yD = 0.075, EL = 2 * Math.sqrt(IR * IR - SH * SH) - 0.03;
  for (const sx of [-1, 1]) {
    m.box(ID, sx * (SH + 0.004), yW - 0.004, 0, 0.008, Y0 + 0.006 - yW + 0.004, EL, '#8e8a80');
    for (let k = -3; k <= 3; k++) if (Math.abs(k) > 0) { const z = k * 0.08; m.prism(ID, sx * (SH + 0.006), Y0 + 0.006, z, 0.0013, 0.026, 4, '#2f3b36'); m.box(ID, sx * (SH + 0.006), Y0 + 0.032, z, 0.005, 0.006, 0.005, '#f4e3a8'); }
  }
  // Thames tour boat (in front of the bridge)
  m.plan(ID, [[-0.07, 0.19], [0.03, 0.19], [0.06, 0.2], [0.03, 0.21], [-0.07, 0.21]], yW - 0.002, yW + 0.008, '#f3f4f6');
  m.box(ID, -0.025, yW + 0.008, 0.2, 0.07, 0.011, 0.016, '#1e3a5f');
  for (let k = 0; k < 6; k++) m.box(ID, -0.052 + k * 0.011, yW + 0.012, 0.2081, 0.007, 0.005, 0.0004, '#a9d3ee');
  m.box(ID, -0.025, yW + 0.019, 0.2, 0.072, 0.002, 0.018, WHITE);
  // Tower of London hint on the north bank (White Tower with four cupola turrets) and plane trees
  {
    const wx = -0.4, wz = -0.17;
    m.box(ID, wx, Y0, wz, 0.06, 0.055, 0.07, '#e4dccb');
    rect4(wx, wz, 0.03, 0.035, (T, i, along) => {
      for (let k = 0; k < 3; k++) m.arch(T, (k - 1) * along * 0.6, Y0 + 0.022, 0.012, 0.016, 0.001, 0.006, 0, 0.012, '#e4dccb', 'arch', 4, false, false);
      for (let k = 0; k < 5; k++) m.box(T, (k - 2) * along * 0.4, Y0 + 0.055, -0.002, 0.006, 0.006, 0.004, '#e4dccb');
      void i;
    });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      m.prism(ID, wx + dx * 0.03, Y0, wz + dz * 0.035, 0.008, 0.07, 8, '#e9e2d3', 0.008, Math.PI / 8);
      ball(gp, SLATE, wx + dx * 0.03, Y0 + 0.074, wz + dz * 0.035, 0.016, 0.016, 0.016);
      m.prism(ID, wx + dx * 0.03, Y0 + 0.08, wz + dz * 0.035, 0.0012, 0.01, 4, GOLD, 0.0003);
    }
  }
  const trees: [number, number][] = [[-0.39, 0.1], [-0.42, 0.17], [-0.37, 0.24], [0.38, -0.12], [0.41, -0.2], [0.37, 0.12], [0.42, 0.06], [0.38, 0.22]];
  for (const [x, z] of trees) {
    if (Math.hypot(x, z) > IR - 0.03) continue;
    rod(gp, [x, Y0 + 0.006, z], [x, Y0 + 0.04, z], 0.0035, '#5b4636', 4);
    ball(gp, hash3(x * 9, z * 9, 1) > 0.5 ? '#4f7f3f' : '#5d8c47', x, Y0 + 0.058, z, 0.045, 0.045, 0.045);
  }

  const TXc = 0.135, TW = 0.07, TD = 0.09, RW = 0.036, yT = 0.25;
  for (const sx of [-1, 1]) {
    const cx = sx * TXc;
    // Granite pier with cutwaters (pointed up- and downstream)
    m.plan(ID, [[cx - TW / 2 - 0.006, -TD / 2 - 0.004], [cx, -TD / 2 - 0.05], [cx + TW / 2 + 0.006, -TD / 2 - 0.004], [cx + TW / 2 + 0.006, TD / 2 + 0.004], [cx, TD / 2 + 0.05], [cx - TW / 2 - 0.006, TD / 2 + 0.004]], yW - 0.004, yD - 0.004, GRAN);
    // Tower body: two side blocks, pointed road arch faces, upper storey
    for (const zs of [-1, 1]) m.box(ID, cx, yD - 0.004, zs * (RW / 2 + (TD / 2 - RW / 2) / 2), TW, 0.07, TD / 2 - RW / 2, STONE);
    for (const fx of [-1, 1]) m.arch(xform(cx + fx * (TW / 2 - 0.004), 0, 0, Math.PI / 2), 0, yD - 0.004, TD, 0.07, 0.008, RW, 0, 0.055, STONE, 'pointed', 6, false, true);
    m.box(ID, cx, yD + 0.05, 0, TW - 0.008, 0.016, RW, '#2b2a28');
    m.box(ID, cx, yD + 0.066, 0, TW, yT - yD - 0.066, TD, STONE);
    // String courses, gothic windows on all four faces
    rect4(cx, 0, TW / 2, TD / 2, (T, i, along) => {
      for (const y of [yD + 0.066, yD + 0.102, yD + 0.138, yT - 0.004]) m.box(T, 0, y, 0.001, along * 2, 0.004, 0.003, shade(STONE, 1.08));
      for (const [y, h] of [[yD + 0.072, 0.02], [yD + 0.108, 0.022], [yD + 0.144, 0.02], [yT - 0.028, 0.018]] as const) {
        const n = i % 2 ? 3 : 2;
        for (let k = 0; k < n; k++) m.box(T, (k - (n - 1) / 2) * along * 0.6, y, 0.0005, 0.0075, h, 0.001, '#2c3440');
      }
    });
    // Corner turrets with slate spirelets and gilded finials
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + dx * (TW / 2 - 0.004), z = dz * (TD / 2 - 0.004);
      m.prism(ID, x, yD + 0.066, z, 0.0105, yT + 0.022 - yD - 0.066, 8, shade(STONE, 1.02), 0.0105, Math.PI / 8);
      m.prism(ID, x, yT + 0.022, z, 0.0125, 0.004, 8, shade(STONE, 1.1), 0.0125, Math.PI / 8);
      m.prism(ID, x, yT + 0.026, z, 0.0115, 0.036, 8, SLATE, 0.0006, Math.PI / 8);
      m.prism(ID, x, yT + 0.062, z, 0.0015, 0.012, 4, GOLD, 0.0003);
    }
    // Central steep roof with dormer gables
    rect4(cx, 0, 0, 0, (T, i) => {
      const a = i % 2 ? TD / 2 - 0.006 : TW / 2 - 0.006, b = i % 2 ? TW / 2 - 0.006 : TD / 2 - 0.006;
      m.tq(T, [-a, yT, b], [a, yT, b], [0.004, yT + 0.05, 0.004], [-0.004, yT + 0.05, 0.004], SLATE, [0, 0.5, 1]);
      m.poly(T, [[-0.013, yT], [0.013, yT], [0, yT + 0.024]], b - 0.012, b + 0.002, STONE);
      m.box(T, 0, yT + 0.003, b + 0.0021, 0.006, 0.011, 0.001, '#2c3440');
    });
    m.prism(ID, cx, yT + 0.05, 0, 0.002, 0.016, 4, GOLD, 0.0004);
  }
  // Bascules (lowered) with blue/white fascia girders, seam at mid-span
  const xi = TXc - TW / 2;
  for (const sx of [-1, 1]) {
    const x0 = sx * 0.0008, x1 = sx * xi;
    m.box(ID, (x0 + x1) / 2, yD - 0.006, 0, Math.abs(x1 - x0), 0.006, RW + 0.006, ROAD);
    for (const zs of [-1, 1]) {
      m.box(ID, (x0 + x1) / 2, yD - 0.014, zs * (RW / 2 + 0.004), Math.abs(x1 - x0), 0.014, 0.004, BLUE);
      m.box(ID, (x0 + x1) / 2, yD, zs * (RW / 2 + 0.004), Math.abs(x1 - x0), 0.006, 0.0025, WHITE);
    }
  }
  // High-level walkways (lattice girders) on both sides
  const yw0 = 0.205, yw1 = 0.229;
  for (const zs of [-1, 1]) {
    const z = zs * (TD / 2 - 0.012), T = ID;
    m.box(T, 0, yw0, z, xi * 2, 0.004, 0.016, BLUE);
    m.box(T, 0, yw1 - 0.004, z, xi * 2, 0.004, 0.016, BLUE);
    m.box(T, 0, yw0 + 0.004, z, xi * 2, yw1 - yw0 - 0.008, 0.012, '#5c6b78');
    const nb = 10;
    for (const fz of [-1, 1]) {
      const zz = z + fz * 0.0075;
      for (let k = 0; k <= nb; k++) {
        const x = -xi + (k * 2 * xi) / nb;
        m.box(T, x, yw0, zz, 0.0025, yw1 - yw0, 0.0016, WHITE);
        if (k < nb) {
          const xn = -xi + ((k + 1) * 2 * xi) / nb;
          m.strut(T, x, yw0 + 0.003, xn, yw1 - 0.003, 0.0016, 0.0014, BLUE, zz);
          m.strut(T, x, yw1 - 0.003, xn, yw0 + 0.003, 0.0016, 0.0014, BLUE, zz);
        }
      }
    }
  }
  // Side spans: deck, suspension chains (lattice girders curving down to the abutments) and hangers
  const xo = TXc + TW / 2, xa = SH - 0.004;
  for (const sx of [-1, 1]) {
    m.box(ID, sx * (xo + xa) / 2, yD - 0.006, 0, xa - xo, 0.006, RW + 0.006, ROAD);
    for (const zs of [-1, 1]) {
      const z = zs * (RW / 2 + 0.004);
      m.box(ID, sx * (xo + xa) / 2, yD - 0.014, z, xa - xo, 0.014, 0.004, BLUE);
      m.box(ID, sx * (xo + xa) / 2, yD, z, xa - xo, 0.006, 0.0025, WHITE);
      const cz = zs * (TD / 2 - 0.012);
      const N = 12, chain = (t: number) => yD + 0.03 + (yw0 - 0.01 - yD - 0.03) * Math.pow(1 - t, 1.9);
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N;
        const x0 = sx * (xo + (xa - xo) * t0), x1 = sx * (xo + (xa - xo) * t1);
        const d0 = 0.016 * (1 - t0) + 0.006, d1 = 0.016 * (1 - t1) + 0.006;
        m.strut(ID, x0, chain(t0), x1, chain(t1), 0.004, 0.009, BLUE, cz);
        m.strut(ID, x0, chain(t0) - d0, x1, chain(t1) - d1, 0.003, 0.008, WHITE, cz);
        m.strut(ID, x0, chain(t0), x1, chain(t1) - d1, 0.0016, 0.006, BLUE, cz);
        m.box(ID, x1, yD + 0.006, cz, 0.0018, chain(t1) - d1 - yD - 0.006, 0.0018, '#5c6b78');
      }
    }
    // Abutment tower on the shore
    const ax = sx * (SH + 0.02);
    for (const zs of [-1, 1]) m.box(ID, ax, Y0, zs * 0.0265, 0.04, yD + 0.04 - Y0, 0.017, STONE);
    m.box(ID, ax, yD + 0.026, 0, 0.04, 0.014, RW, STONE);
    for (const fx of [-1, 1]) m.arch(xform(ax + fx * 0.0195, 0, 0, Math.PI / 2), 0, Y0, 0.07, yD + 0.04 - Y0, 0.004, RW, 0, yD + 0.026 - Y0, STONE, 'pointed', 6, false, false);
    m.box(ID, ax, yD + 0.04, 0, 0.044, 0.004, 0.074, shade(STONE, 1.08));
    for (const dz of [-1, 1]) {
      m.prism(ID, ax, Y0, dz * 0.035, 0.009, yD + 0.05 - Y0, 8, shade(STONE, 1.03), 0.009, Math.PI / 8);
      m.prism(ID, ax, yD + 0.05, dz * 0.035, 0.0105, 0.025, 8, SLATE, 0.0005, Math.PI / 8);
    }
  }
  // Lamps on the bascule parapets
  for (let k = -4; k <= 4; k++) for (const zs of [-1, 1]) if (Math.abs(k * 0.04) < xi - 0.005 || Math.abs(k * 0.04) > xo + 0.01) m.prism(ID, k * 0.04, yD + 0.006, zs * (RW / 2 + 0.004), 0.0012, 0.016, 4, '#2f3b36');
  m.build(gp);
};

export const EUROPE: Record<string, Builder> = { colosseum, parthenon, brandenburg, pisa, bigben, towerbridge };
