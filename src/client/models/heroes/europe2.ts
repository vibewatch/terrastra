import * as THREE from 'three';
import { type Builder, type V3, add, g, mat, cone, rod, paintFaces, mix, fbm, hash3 } from '../prims.ts';
import { island, strataSide, EARTH, sstep, ridged, WATER } from '../nature.ts';
import { shade, type Xf, xform, ID, dirOf, Mesh3, rect4, person, car, leafTree, house, pinnacle } from '../kit/euro.ts';

// Hero builders for: arcdetriomphe, montsaintmichel, stpeters, rialto, alhambra, cologne, santorini, atomium.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.
// Each is a scale-model diorama: correct silhouette first, then the signature details from reference photos.

const TAU = Math.PI * 2;

/** Frame whose local +z faces outward from the origin towards (x,z) — for objects facing away from a centre. */
const facing = (x: number, z: number, y = 0): Xf => xform(x, y, z, Math.atan2(x, z));

const rect = (cx: number, cz: number, hx: number, hz: number): [number, number][] => [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
function cypress(m: Mesh3, x: number, y: number, z: number, h: number, c = '#2e4a2c'): void {
  m.prism(ID, x, y, z, h * 0.03, h * 0.12, 4, '#4a3a2a');
  m.rev(ID, x, y + h * 0.06, z, [[h * 0.07, 0], [h * 0.11, h * 0.25], [h * 0.1, h * 0.55], [h * 0.055, h * 0.82], [0, h]], 7, (i, j) => shade(c, 0.9 + 0.08 * ((i + j) % 3)));
}

// ---------------------------------------------------------------------------------------------------------
// Arc de Triomphe (Paris): the 50 m arch on the round Place de l'Étoile. Four piers with the lateral arches,
// the coffered barrel vault of the great arch, impost cornices, the four high-relief sculpture groups on their
// pedestals, framed relief panels, spandrel Fames, the processional frieze, the bracketed main cornice and the
// attic with its row of shields and palmette crest. Around it: cobbled central island, the ring road with
// traffic, twelve radiating avenues with plane trees and the Haussmann façades that frame them.
const arcdetriomphe: Builder = (gp) => {
  const ST = '#e4ddcc', SCU = '#d0c7b2', Y0 = 0.035, IR = 0.5;
  const AV: [number, number][] = [];
  for (let k = 0; k < 12; k++) AV.push([(k * TAU) / 12 + (k % 2 ? 0.05 : 0), k === 0 ? 0.062 : k === 6 ? 0.05 : k % 3 === 0 ? 0.042 : 0.032]);
  const inAvenue = (x: number, z: number): number => {
    for (let k = 0; k < 12; k++) {
      const [a, w] = AV[k], al = x * Math.sin(a) + z * Math.cos(a), pp = Math.abs(x * Math.cos(a) - z * Math.sin(a));
      if (al > 0 && pp < w) return pp / w;
    }
    return -1;
  };
  island(gp, IR, () => 0.002, '#9a958c', (x, _y, z) => {
    const r = Math.hypot(x, z);
    if (r < 0.205) {
      if (r < 0.17 && Math.abs(x) < 0.25) return hash3(Math.floor(x * 90), 1, Math.floor(z * 90)) > 0.5 ? '#c3bcae' : '#b9b2a4';
      return '#a49d90';
    }
    if (r < 0.215) return '#d6d1c6';
    if (r < 0.37) return fbm(x * 30, 2, z * 30) > 0.62 ? '#5c5e62' : '#54565a';
    const av = inAvenue(x, z);
    if (av >= 0) return av > 0.82 ? '#cfc9bc' : '#56585c';
    return '#c9c3b6';
  }, { rings: 22, segs: 96, side: strataSide(EARTH) });
  const yG = Y0 + 0.002;
  const m = new Mesh3();

  // Lane dashes on the ring road and down the avenues; traffic
  for (const rr of [0.265, 0.315]) for (let k = 0; k < 44; k++) {
    const a = (k / 44) * TAU;
    m.box(facing(Math.sin(a) * rr, Math.cos(a) * rr), 0, yG, 0, 0.012, 0.0004, 0.0016, '#e5e2da');
  }
  const CARS = ['#f4f4f2', '#1f2937', '#9ca3af', '#b91c1c', '#1d4ed8', '#e5e7eb', '#111827', '#d4a72c'];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU + hash3(k, 3, 1) * 0.2, rr = 0.24 + (k % 3) * 0.045;
    car(m, xform(Math.sin(a) * rr, 0, Math.cos(a) * rr, a + Math.PI / 2), 0, yG, 0, CARS[k % CARS.length]);
  }
  // Avenues: centre dashes, plane trees along the pavements; Haussmann blocks between them
  for (let k = 0; k < 12; k++) {
    const [a, w] = AV[k];
    const T = xform(0, 0, 0, a);
    for (let d = 0.39; d < 0.49; d += 0.025) m.box(T, 0, yG, d, 0.0016, 0.0004, 0.011, '#e5e2da');
    for (const sx of [-1, 1]) {
      const P = T([sx * (w - 0.007), 0, 0.43 + (k % 2) * 0.03]);
      leafTree(m, P[0], yG, P[2], 0.038, hash3(k, 9, sx) > 0.5 ? '#567f3c' : '#4c7536');
    }
    if (k === 0) for (let j = 0; j < 3; j++) car(m, T, (j - 1) * 0.022, yG, 0.43 + j * 0.02, CARS[(j + 3) % CARS.length]);
  }
  const MANS = '#66707c', FAC = '#ddd1b8';
  for (let k = 0; k < 12; k++) {
    const [a0, w0] = AV[k], [a1n, w1] = AV[(k + 1) % 12], a1 = k === 11 ? a1n + TAU : a1n;
    const r0 = 0.395, r1 = 0.488;
    const b0 = a0 + Math.asin(w0 / r0) + 0.012, b1 = a1 - Math.asin(w1 / r0) - 0.012;
    const c0 = a0 + Math.asin(w0 / r1) + 0.012, c1 = a1 - Math.asin(w1 / r1) - 0.012;
    if (b1 - b0 < 0.08) continue;
    const P = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];
    const base: [number, number][] = [P(b0, r0), P(b1, r0), P(c1, r1), P(c0, r1)];
    const H = 0.05 + hash3(k, 1, 5) * 0.008;
    m.plan(ID, base, yG, yG + H, FAC);
    let cx = 0, cz = 0;
    for (const [x, z] of base) { cx += x / 4; cz += z / 4; }
    const top = base.map(([x, z]) => [x + (cx - x) * 0.2, z + (cz - z) * 0.2] as [number, number]);
    for (let i = 0; i < 4; i++) {
      const A = base[i], B = base[(i + 1) % 4], C = top[(i + 1) % 4], D = top[i];
      m.quad([A[0], yG + H, A[1]], [B[0], yG + H, B[1]], [C[0], yG + H + 0.02, C[1]], [D[0], yG + H + 0.02, D[1]], MANS, [(A[0] + B[0]) / 2 - cx, 0.6, (A[1] + B[1]) / 2 - cz]);
    }
    m.plan(ID, top, yG + H + 0.02, yG + H + 0.021, shade(MANS, 0.9));
    // façade toward the place: balcony line, window grid, dormers, chimneys
    const [ax, az] = base[0], [bx, bz] = base[1], L = Math.hypot(bx - ax, bz - az);
    const Tf = xform((ax + bx) / 2, 0, (az + bz) / 2, Math.atan2(-(ax + bx) / 2, -(az + bz) / 2));
    const nwin = Math.max(2, Math.floor(L / 0.016));
    m.box(Tf, 0, yG, 0.0005, L, 0.012, 0.0012, shade(FAC, 0.92));
    m.box(Tf, 0, yG + 0.031, 0.002, L, 0.0016, 0.004, '#3a3f45');
    for (const y of [0.004, 0.017, 0.028, 0.039]) m.box(Tf, 0, yG + y, 0.0006, L - 0.006, y < 0.01 ? 0.008 : 0.0075, 0.001, y < 0.01 ? '#5b4a3a' : '#3c4652');
    for (let i = 0; i <= nwin; i++) {
      const x = -L / 2 + 0.003 + (i * (L - 0.006)) / nwin;
      m.box(Tf, x, yG + 0.012, 0.0012, 0.0075, H - 0.014, 0.0012, FAC);
      if (i % 2 === 1) m.box(Tf, x - (L - 0.006) / nwin / 2, yG + H + 0.004, -0.004, 0.005, 0.007, 0.006, shade(MANS, 1.15));
    }
    for (const f of [0.3, 0.7]) m.box(ID, cx + (top[0][0] - cx) * f * 0.3, yG + H + 0.012, cz + (top[0][1] - cz) * f * 0.3, 0.006, 0.016, 0.004, '#b08a6a');
  }
  // Granite bollards ringing the central island
  for (let k = 0; k < 56; k++) { const a = (k / 56) * TAU; m.prism(ID, Math.sin(a) * 0.207, yG, Math.cos(a) * 0.207, 0.0018, 0.008, 5, '#3b3d40'); }

  // ---- The arch ----------------------------------------------------------------------------------------
  const W = 0.4, D = 0.196, HW = W / 2, HD = D / 2;
  const yb = yG + 0.01, OW = 0.13, RA = OW / 2, ySpr = yG + 0.193, yTop = yG + 0.3;
  const LW = 0.075, LH = 0.166 - 0.01, PW = (W - OW) / 2, PX = OW / 2 + PW / 2, FT = 0.012;
  m.box(ID, 0, yG, 0, W + 0.016, 0.01, D + 0.016, shade(ST, 0.86));
  m.box(ID, 0, yG, 0, W + 0.03, 0.004, D + 0.03, shade(ST, 0.8));
  // Front and back faces with the great arch (archivolt ring, keystone)
  for (const s of [1, -1]) {
    const T = xform(0, 0, s * (HD - FT / 2), s > 0 ? 0 : Math.PI);
    m.arch(T, 0, yb, W, yTop - yb, FT, OW, 0, ySpr + RA - yb, ST, 'arch', 14, false, false, shade(ST, 0.7));
    for (let i = 0; i < 14; i++) {
      const t0 = (i / 14) * Math.PI, t1 = ((i + 1) / 14) * Math.PI, r0 = RA, r1 = RA + 0.008;
      m.poly(T, [[Math.cos(t0) * r0, ySpr + Math.sin(t0) * r0], [Math.cos(t0) * r1, ySpr + Math.sin(t0) * r1], [Math.cos(t1) * r1, ySpr + Math.sin(t1) * r1], [Math.cos(t1) * r0, ySpr + Math.sin(t1) * r0]], FT / 2, FT / 2 + 0.0025, shade(ST, 1.04));
    }
    m.box(T, 0, ySpr + RA - 0.004, FT / 2, 0.014, 0.022, 0.006, shade(ST, 1.06));
    // spandrel Fames: reclining winged figures with trumpets
    for (const sx of [-1, 1]) {
      m.blob(T, sx * 0.058, ySpr + RA + 0.012, FT / 2 + 0.003, 0.026, 0.0065, 0.004, SCU);
      m.blob(T, sx * 0.04, ySpr + RA + 0.006, FT / 2 + 0.004, 0.006, 0.006, 0.004, SCU);
      m.poly(T, [[sx * 0.07, ySpr + RA + 0.015], [sx * 0.095, ySpr + RA + 0.034], [sx * 0.085, ySpr + RA + 0.02]], FT / 2, FT / 2 + 0.003, SCU);
      m.strut(T, sx * 0.03, ySpr + RA + 0.014, sx * 0.012, ySpr + RA + 0.028, 0.0018, 0.002, SCU, FT / 2 + 0.003);
    }
  }
  // Side strips beside the front faces, the side faces above the lateral piers
  for (const sx of [-1, 1]) {
    for (const s of [-1, 1]) m.quad([sx * HW, yb, s * (HD - FT)], [sx * HW, yb, s * HD], [sx * HW, yTop, s * HD], [sx * HW, yTop, s * (HD - FT)], shade(ST, 0.95), [sx, 0, 0]);
    m.quad([sx * HW, ySpr, -HD + FT], [sx * HW, ySpr, HD - FT], [sx * HW, yTop, HD - FT], [sx * HW, yTop, -HD + FT], shade(ST, 0.95), [sx, 0, 0]);
    // Piers pierced by the lateral arches (outer face toward ±x, inner face lines the great passage)
    const T = xform(sx * PX, 0, 0, sx * Math.PI / 2);
    m.arch(T, 0, yb, D - FT * 2, ySpr - yb, PW, LW, 0, LH, ST, 'arch', 10, false, true, shade(ST, 0.66));
    const Ts = xform(sx * HW, 0, 0, sx * Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const t0 = (i / 10) * Math.PI, t1 = ((i + 1) / 10) * Math.PI, r0 = LW / 2, r1 = LW / 2 + 0.006, yc = yb + LH - LW / 2;
      m.poly(Ts, [[Math.cos(t0) * r0, yc + Math.sin(t0) * r0], [Math.cos(t0) * r1, yc + Math.sin(t0) * r1], [Math.cos(t1) * r1, yc + Math.sin(t1) * r1], [Math.cos(t1) * r0, yc + Math.sin(t1) * r0]], 0, 0.0022, shade(ST, 1.04));
    }
  }
  // Coffered barrel vault of the great arch (frames, sunk panels and rosettes)
  {
    const NA = 8, NZ = 6, SUB = 4, z0 = -HD + FT, z1 = HD - FT;
    const FR = shade(ST, 0.82), REC = shade(ST, 0.62), ROS = shade(ST, 0.95);
    for (let i = 0; i < NA * SUB; i++) for (let j = 0; j < NZ * SUB; j++) {
      const a0 = (i / (NA * SUB)) * Math.PI, a1 = ((i + 1) / (NA * SUB)) * Math.PI;
      const za = z0 + ((z1 - z0) * j) / (NZ * SUB), zb = z0 + ((z1 - z0) * (j + 1)) / (NZ * SUB);
      const fi = i % SUB, fj = j % SUB;
      const c = fi === 0 || fj === 0 ? FR : fi === 2 && fj === 2 ? ROS : REC;
      const am = (a0 + a1) / 2;
      m.quad([Math.cos(a0) * RA, ySpr + Math.sin(a0) * RA, za], [Math.cos(a1) * RA, ySpr + Math.sin(a1) * RA, za],
        [Math.cos(a1) * RA, ySpr + Math.sin(a1) * RA, zb], [Math.cos(a0) * RA, ySpr + Math.sin(a0) * RA, zb], c, [-Math.cos(am), -Math.sin(am), 0]);
    }
  }
  // Tomb of the Unknown Soldier under the arch
  m.box(ID, 0, yb, 0.012, 0.03, 0.0015, 0.05, '#5a5650');
  m.prism(ID, 0, yb + 0.0015, 0.04, 0.006, 0.002, 10, '#8a6a3a');
  cone(gp, '#ff8a3d', 0, yb + 0.0035, 0.04, 0.0025, 0.007, 6).material = mat('#ff8a3d', { emissive: '#ff6a1a' });

  // Impost cornices (two-step) around piers, into the passage and across the sides
  const cornice = (y: number) => {
    for (const s of [-1, 1]) for (const sx of [-1, 1]) {
      m.box(ID, sx * PX, y, s * HD, PW + 0.004, 0.006, 0.006, shade(ST, 1.02));
      m.box(ID, sx * PX, y + 0.006, s * HD, PW + 0.008, 0.006, 0.01, shade(ST, 1.06));
    }
    for (const sx of [-1, 1]) {
      m.box(ID, sx * HW, y, 0, 0.006, 0.006, D + 0.004, shade(ST, 1.02));
      m.box(ID, sx * HW, y + 0.006, 0, 0.01, 0.006, D + 0.008, shade(ST, 1.06));
      m.box(ID, sx * RA, y + 0.003, 0, 0.006, 0.006, D - FT * 2, shade(ST, 1.02));
    }
  };
  cornice(ySpr - 0.014);
  // Sculpture groups on pedestals (front & back of each pier): standing heroes, kneeling figures, a winged genius
  for (const s of [1, -1]) for (const sx of [-1, 1]) {
    const T = xform(sx * PX, 0, s * HD, s > 0 ? 0 : Math.PI), seed = s * 3 + sx;
    const y0 = yb + 0.03, j = (k: number) => (hash3(seed, k, 7) - 0.5) * 0.008;
    m.box(T, 0, yb, 0.012, 0.085, 0.03, 0.026, shade(ST, 0.97));
    m.box(T, 0, yb + 0.026, 0.012, 0.09, 0.004, 0.028, shade(ST, 1.05));
    m.blob(T, 0, y0 + 0.06, 0.006, 0.034, 0.062, 0.008, shade(SCU, 0.92));
    m.blob(T, j(1), y0 + 0.045, 0.02, 0.011, 0.036, 0.009, SCU);
    m.blob(T, j(1), y0 + 0.088, 0.02, 0.0055, 0.0065, 0.0055, SCU);
    m.blob(T, -0.022 + j(2), y0 + 0.024, 0.017, 0.01, 0.024, 0.009, SCU);
    m.blob(T, -0.022 + j(2), y0 + 0.054, 0.018, 0.005, 0.006, 0.005, SCU);
    m.blob(T, 0.022 + j(3), y0 + 0.036, 0.016, 0.009, 0.032, 0.008, SCU);
    m.blob(T, 0.022 + j(3), y0 + 0.073, 0.017, 0.005, 0.006, 0.005, SCU);
    m.strut(T, 0.026 + j(3), y0 + 0.06, 0.036, y0 + 0.09, 0.003, 0.003, SCU, 0.016);
    m.blob(T, 0.0, y0 + 0.002, 0.022, 0.032, 0.006, 0.008, shade(SCU, 0.95));
    // winged genius above
    const gx = sx * 0.006;
    m.blob(T, gx, y0 + 0.112, 0.017, 0.008, 0.017, 0.007, SCU);
    m.blob(T, gx, y0 + 0.132, 0.017, 0.0045, 0.005, 0.0045, SCU);
    m.poly(T, [[gx - 0.004, y0 + 0.12], [gx - 0.036, y0 + 0.142], [gx - 0.03, y0 + 0.124], [gx - 0.006, y0 + 0.105]], 0.009, 0.013, SCU);
    m.poly(T, [[gx + 0.004, y0 + 0.12], [gx + 0.006, y0 + 0.105], [gx + 0.03, y0 + 0.124], [gx + 0.036, y0 + 0.142]], 0.009, 0.013, SCU);
    m.strut(T, gx + 0.004, y0 + 0.124, gx + 0.012 * sx, y0 + 0.152, 0.0022, 0.002, SCU, 0.017);
  }
  // Framed relief panels (front/back above the impost; sides above the lateral arches)
  const relief = (T: Xf, w: number, y: number, h: number, seed: number) => {
    m.box(T, 0, y, 0.001, w, h, 0.003, shade(ST, 1.05));
    m.box(T, 0, y + 0.004, 0.0015, w - 0.008, h - 0.008, 0.003, shade(ST, 0.86));
    const n = Math.floor(w / 0.011);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.008 + ((i + 0.5) * (w - 0.016)) / n, hh = h * (0.45 + hash3(seed, i, 2) * 0.25);
      m.blob(T, x, y + 0.006 + hh / 2, 0.003, 0.0035, hh / 2, 0.002, SCU);
      m.blob(T, x, y + 0.008 + hh, 0.003, 0.0022, 0.0025, 0.002, SCU);
    }
  };
  for (const s of [1, -1]) for (const sx of [-1, 1]) relief(xform(sx * PX, 0, s * HD, s > 0 ? 0 : Math.PI), 0.105, yG + 0.218, 0.062, s * 5 + sx);
  for (const sx of [-1, 1]) relief(xform(sx * HW, 0, 0, sx * Math.PI / 2), 0.13, yG + 0.218, 0.062, 11 + sx);

  // Frieze (processional relief), main cornice with modillions, attic with shields, crest
  m.box(ID, 0, yTop, 0, W + 0.006, 0.03, D + 0.006, ST);
  rect4(0, 0, HW + 0.003, HD + 0.003, (T, i, along) => {
    const n = Math.floor((along * 2) / 0.0075);
    for (let k = 0; k < n; k++) {
      const x = -along + 0.004 + ((k + 0.5) * (along * 2 - 0.008)) / n + (hash3(i, k, 1) - 0.5) * 0.002, hh = 0.014 + hash3(i, k, 2) * 0.006;
      m.box(T, x, yTop + 0.006, 0.0008, 0.0034, hh, 0.0018, SCU);
    }
    m.box(T, 0, yTop + 0.003, 0.001, along * 2, 0.002, 0.003, shade(ST, 1.05));
    m.box(T, 0, yTop + 0.027, 0.001, along * 2, 0.003, 0.003, shade(ST, 1.05));
  });
  const yC = yTop + 0.03;
  m.box(ID, 0, yC, 0, W + 0.012, 0.006, D + 0.012, shade(ST, 1.02));
  m.box(ID, 0, yC + 0.006, 0, W + 0.026, 0.012, D + 0.026, shade(ST, 1.06));
  rect4(0, 0, HW + 0.006, HD + 0.006, (T, _i, along) => {
    for (let x = -along + 0.004; x <= along - 0.002; x += 0.0085) m.box(T, x, yC + 0.0015, 0.0035, 0.0035, 0.0045, 0.007, shade(ST, 0.98));
  });
  const yA = yC + 0.018, HA = 0.068;
  m.box(ID, 0, yA, 0, W - 0.002, HA, D - 0.002, ST);
  rect4(0, 0, HW - 0.001, HD - 0.001, (T, i, along) => {
    const n = i % 2 ? 4 : 6, sp = (along * 2) / n;
    for (let k = 0; k <= n; k++) m.box(T, -along + k * sp, yA, 0.0012, 0.008, HA, 0.0025, shade(ST, 1.04));
    for (let k = 0; k < n; k++) {
      const x = -along + (k + 0.5) * sp, yc = yA + HA * 0.48, R = Math.min(0.0125, sp * 0.3);
      const disc = (rr: number): [number, number][] => Array.from({ length: 12 }, (_, q) => [x + Math.cos((q / 12) * TAU) * rr, yc + Math.sin((q / 12) * TAU) * rr]);
      m.poly(T, disc(R), 0, 0.003, shade(ST, 1.06));
      m.poly(T, disc(R * 0.62), 0.003, 0.0042, shade(ST, 0.92));
      m.box(T, x, yA + 0.006, 0.0012, sp * 0.7, 0.004, 0.002, shade(ST, 0.94));
    }
    m.box(T, 0, yA + HA - 0.008, 0.0015, along * 2, 0.004, 0.003, shade(ST, 1.06));
  });
  const yK = yA + HA;
  m.box(ID, 0, yK, 0, W + 0.006, 0.006, D + 0.006, shade(ST, 1.04));
  m.box(ID, 0, yK + 0.006, 0, W + 0.014, 0.007, D + 0.014, shade(ST, 1.08));
  rect4(0, 0, HW + 0.005, HD + 0.005, (T, _i, along) => {
    for (let x = -along + 0.004; x <= along - 0.002; x += 0.012) m.prism(T, x, yK + 0.013, 0, 0.0028, 0.008, 4, shade(ST, 1.02), 0.0008, Math.PI / 4);
  });
  // Roof terrace: museum skylight and railing posts
  m.box(ID, 0, yK + 0.013, 0, 0.12, 0.006, 0.08, '#b8b2a4');
  m.box(ID, 0, yK + 0.019, 0, 0.11, 0.0012, 0.07, '#7e8b96');
  for (let k = -9; k <= 9; k++) for (const s of [-1, 1]) m.box(ID, k * 0.02, yK + 0.013, s * (HD - 0.004), 0.0012, 0.009, 0.0012, '#4b4f55');
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Atomium (Brussels, 1958): an iron crystal cell magnified 165 billion times — nine stainless-steel spheres in a
// body-centred cube standing on one corner, twenty connecting tubes (12 edges + 8 body diagonals, with sleeve
// collars), the vertical diagonal through bottom, centre and top spheres; the tapered staircase pylon to the
// central sphere, three bipod stair legs under the lower spheres, the panoramic window band of the top sphere,
// all on a paved plaza with lawns, trees and the entrance pavilion.
const atomium: Builder = (gp) => {
  const Y0 = 0.032, IR = 0.5, STEEL = '#dfe5ec', PAINT = '#d9dee4';
  island(gp, IR, () => 0, '#8e8a84', (x, _y, z) => {
    const r = Math.hypot(x, z);
    if (r < 0.3) {
      if (Math.abs(r - 0.2) < 0.008 || Math.abs(r - 0.28) < 0.006) return '#9d9890';
      return (Math.floor(x * 55) + Math.floor(z * 55)) % 2 ? '#c8c3b9' : '#bfbab0';
    }
    if (Math.abs(x) < 0.035 && z > 0) return '#c4bfb5';
    if (Math.abs(z + x * 0.6) < 0.025 && x < 0) return '#c4bfb5';
    return fbm(x * 18, 3, z * 18) > 0.55 ? '#6f9a4e' : '#7aa657';
  }, { rings: 26, segs: 104, side: strataSide(EARTH) });
  const m = new Mesh3();
  const tubes = new Mesh3();

  // Body-centred cube on its corner: (1,1,1) diagonal vertical
  const E = 0.42, RS = 0.084;
  const n0 = new THREE.Vector3(1, 1, 1).normalize(), u1 = new THREE.Vector3(1, -1, 0).normalize(), u2 = new THREE.Vector3(1, 1, -2).normalize();
  const yC = Y0 + RS * 1.3 + (Math.sqrt(3) / 2) * E, rot = 0.52;
  const P = (cx: number, cy: number, cz: number): V3 => {
    const v = new THREE.Vector3(cx, cy, cz).multiplyScalar(E / 2);
    const a = v.dot(u1), b = v.dot(u2), h = v.dot(n0);
    return [a * Math.cos(rot) - b * Math.sin(rot), yC + h, a * Math.sin(rot) + b * Math.cos(rot)];
  };
  const corners: V3[] = [];
  for (const cx of [-1, 1]) for (const cy of [-1, 1]) for (const cz of [-1, 1]) corners.push(P(cx, cy, cz));
  const centre: V3 = [0, yC, 0];
  const steel = mat('#ffffff', { vc: true, metal: 0.85, rough: 0.28, flat: false });
  const sphere = (c: V3, top: boolean, seed: number) => {
    const geo = paintFaces(top ? new THREE.SphereGeometry(1, 30, 14) : new THREE.IcosahedronGeometry(1, 3), STEEL, (x, y, z) => {
      if (top && y > 0.02 && y < 0.2) return Math.floor((Math.atan2(z, x) / TAU + 0.5) * 30) % 2 ? '#2e3a48' : '#3b4a5a';
      const h = hash3(Math.floor(x * 9), Math.floor(y * 9) + seed, Math.floor(z * 9));
      return h > 0.85 ? '#f4f7fa' : h < 0.2 ? '#c9d0d8' : null;
    });
    add(gp, geo, steel, c[0], c[1], c[2], RS, RS, RS);
  };
  corners.forEach((c, i) => sphere(c, c[1] > yC + E * 0.8, i));
  sphere(centre, false, 9);

  // Tubes: 12 cube edges + 8 body diagonals, with collars where they meet the spheres
  const tubeGeo = g('eu2-atom-tube', () => new THREE.CylinderGeometry(1, 1, 1, 14, 1, true));
  const metalM = mat(PAINT, { metal: 0.8, rough: 0.3, flat: false });
  const up = new THREE.Vector3(0, 1, 0);
  const tube = (a: V3, b: V3, r: number) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), len = d.length();
    const mesh = add(gp, tubeGeo, metalM, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r, len, r);
    mesh.quaternion.setFromUnitVectors(up, d.normalize());
  };
  const link = (a: V3, b: V3) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va).normalize();
    const pa = va.clone().addScaledVector(d, RS * 0.9), pb = vb.clone().addScaledVector(d, -RS * 0.9);
    tube(pa.toArray() as V3, pb.toArray() as V3, 0.0118);
    for (const [p0, sg] of [[pa, 1], [pb, -1]] as const) {
      const q0 = p0.clone().addScaledVector(d, sg * 0.004), q1 = p0.clone().addScaledVector(d, sg * 0.016);
      tube(q0.toArray() as V3, q1.toArray() as V3, 0.0152);
    }
  };
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if ([1, 2, 4].includes(i ^ j)) link(corners[i], corners[j]);
  for (const c of corners) link(centre, c);

  // Staircase pylon under the central sphere: four tapered legs, ring frames, zig-zag flights, cross bracing
  const yTopP = yC - RS * 0.92, hb = 0.072, ht = 0.026;
  const leg = (t: number, sx: number, sz: number): V3 => {
    const w = hb + (ht - hb) * t;
    return [sx * w, Y0 + (yTopP - Y0) * t, sz * w];
  };
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(gp, leg(0, sx, sz), leg(1, sx, sz), 0.006, PAINT, 6);
  const NL = 9;
  for (let k = 0; k <= NL; k++) {
    const t = k / NL, [w] = leg(t, 1, 1), y = Y0 + (yTopP - Y0) * t;
    for (let f = 0; f < 4; f++) {
      const T = xform(0, 0, 0, (f * Math.PI) / 2);
      tubes.box(T, 0, y, w, w * 2, 0.0035, 0.004, PAINT);
      if (k < NL) {
        const [w1] = leg((k + 1) / NL, 1, 1), y1 = Y0 + (yTopP - Y0) * ((k + 1) / NL);
        if (f % 2 === k % 2) tubes.strut(T, -w, y, w1, y1, 0.0022, 0.0022, PAINT, (w + w1) / 2);
        if (f === 0 || f === 2) tubes.strut(T, (k % 2 ? -1 : 1) * w * 0.8, y + 0.003, (k % 2 ? 1 : -1) * w1 * 0.8, y1, 0.007, 0.001, '#8a939c', (w + w1) / 2 - 0.006);
      }
    }
  }
  // Bipod stair legs under the three lower spheres
  const lower = corners.filter((c) => c[1] < yC - 0.01 && c[1] > yC - E * 0.8);
  for (const c of lower) {
    const a = Math.atan2(c[0], c[2]), T = xform(c[0], 0, c[2], a + Math.PI / 2), yt = c[1] - RS * 0.95;
    for (const sx of [-1, 1]) tubes.strut(T, sx * 0.05, Y0, sx * 0.008, yt, 0.012, 0.014, PAINT);
    for (let k = 1; k < 6; k++) {
      const t = k / 6, w = 0.05 + (0.008 - 0.05) * t, y = Y0 + (yt - Y0) * t;
      tubes.box(T, 0, y, 0, w * 2, 0.003, 0.012, PAINT);
      tubes.strut(T, -w * 0.85, y - (yt - Y0) / 6 + 0.003, w * 0.85, y, 0.004, 0.006, '#8a939c');
    }
    tubes.box(T, 0, Y0, 0, 0.13, 0.004, 0.03, '#9ea3a8');
  }
  tubes.build(gp, 0.6, 0.35);

  // Entrance pavilion beneath the bottom sphere, plaza furniture, trees and visitors
  m.box(ID, 0, Y0, -0.02, 0.2, 0.004, 0.17, '#b4afa6');
  m.box(ID, 0.0, Y0 + 0.004, -0.09, 0.16, 0.028, 0.06, '#24364a');
  m.box(ID, 0.0, Y0 + 0.032, -0.09, 0.17, 0.004, 0.07, '#e8eaec');
  for (let k = 0; k < 9; k++) m.box(ID, -0.07 + k * 0.0175, Y0 + 0.004, -0.0595, 0.0016, 0.028, 0.0012, '#cfd6dd');
  for (let k = 0; k < 6; k++) m.prism(ID, -0.15 + k * 0.06, Y0, 0.31, 0.0016, 0.03, 4, '#3f4650');
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + 0.2, rr = 0.39 + hash3(k, 1, 2) * 0.06;
    if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue;
    leafTree(m, Math.sin(a) * rr, Y0, Math.cos(a) * rr, 0.06 + hash3(k, 2, 2) * 0.02, hash3(k, 3, 3) > 0.5 ? '#4f7f3f' : '#5d8c47');
  }
  for (let k = 0; k < 14; k++) {
    const a = hash3(k, 4, 1) * TAU, rr = 0.12 + hash3(k, 5, 1) * 0.16;
    person(m, Math.sin(a) * rr, Y0, Math.cos(a) * rr, k);
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Cologne Cathedral: the dark, weathered High Gothic church on the Domplatte. Twin west towers — square
// stages with stepped corner buttresses, tracery windows and gablets, the octagonal belfry ringed by
// pinnacles, and the openwork spires with crocketed ribs and huge finials. West front with the deep central
// portal and the great tracery window under its gable; long nave with clerestory, double aisles and
// two-stage flying buttresses, transept with gable fronts and corner turrets, slender crossing flèche and
// the polygonal choir with its chapel ring and radiating flyers.
const cologne: Builder = (gp) => {
  const ST = '#5d584d', HI = '#7a7466', ROOF = '#40464d', GL = '#2b2f37', VOID = '#24211d';
  island(gp, 0.5, () => 0.002, '#a9a59c', (x, _y, z) => (hash3(Math.floor(x * 50), 2, Math.floor(z * 50)) > 0.5 ? '#b4b0a7' : '#aca89f'), { rings: 14, segs: 72, side: strataSide(EARTH) });
  const yG = 0.037, m = new Mesh3();
  for (const sx of [-1, 1]) {
    m.plan(ID, [[sx * 0.29, 0.06], [sx * 0.42, 0.06], [sx * 0.42, -0.2], [sx * 0.29, -0.3]], yG - 0.003, yG + 0.0015, '#5a8549');
    m.plan(ID, [[sx * 0.2, -0.36], [sx * 0.33, -0.3], [sx * 0.2, -0.43]], yG - 0.003, yG + 0.0015, '#5a8549');
  }
  const gable = (T: Xf, x: number, y: number, w: number, h: number, zf: number, c = HI): void => m.poly(T, [[x - w / 2, y], [x + w / 2, y], [x, y + h]], zf, zf + 0.004, c);
  const tracery = (T: Xf, x: number, y: number, w: number, h: number, n: number): void => {
    for (let k = 1; k < n; k++) m.box(T, x - w / 2 + (k * w) / n, y, 0.0016, 0.0022, h, 0.0016, HI);
  };

  // ---- West towers ------------------------------------------------------------------------------------
  const TW = 0.12, TZ = 0.13, yQ = yG + 0.45, yO = yQ + 0.13, yS = yG + 0.86;
  for (const tx of [-0.105, 0.105]) {
    m.box(ID, tx, yG, TZ, TW, yQ - yG, TW, ST);
    rect4(tx, TZ, TW / 2, TW / 2, (T, i, along) => {
      for (const bx of [-along + 0.009, along - 0.009]) for (let s = 0; s < 3; s++) {
        const y0 = yG + s * 0.15, dd = 0.024 - s * 0.006;
        m.box(T, bx, y0, dd / 2, 0.018, 0.15, dd, s % 2 ? ST : shade(ST, 1.05));
        pinnacle(m, T, bx, y0 + 0.15, dd / 2 + 0.002, 0.006, 0.035, ST, HI);
      }
      for (let s = 1; s < 3; s++) m.box(T, 0, yG + s * 0.15 - 0.004, 0.002, along * 2 - 0.03, 0.006, 0.006, HI);
      if (i === 0) {
        m.win(T, 0, yG + 0.004, 0.044, 0.105, 0, VOID, HI, 'pointed');
        gable(T, 0, yG + 0.1, 0.064, 0.05, 0.002);
      } else {
        m.win(T, 0, yG + 0.035, 0.032, 0.095, 0, GL, HI, 'pointed');
      }
      for (const wx of [-0.018, 0.018]) {
        m.win(T, wx, yG + 0.165, 0.026, 0.11, 0, GL, HI, 'pointed');
        tracery(T, wx, yG + 0.165, 0.026, 0.08, 2);
        gable(T, wx, yG + 0.268, 0.034, 0.04, 0.002);
      }
      for (const wx of [-0.03, 0, 0.03]) for (const yy of [0.15, 0.3]) pinnacle(m, T, wx, yG + yy + 0.002, 0.004, 0.003, 0.022, HI);
      for (const wx of [-0.017, 0.017]) {
        m.win(T, wx, yG + 0.312, 0.023, 0.105, 0, GL, HI, 'pointed');
        gable(T, wx, yG + 0.415, 0.03, 0.03, 0.002);
      }
      m.box(T, 0, yQ, 0.002, along * 2 + 0.004, 0.012, 0.008, HI);
    });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pinnacle(m, ID, tx + sx * 0.056, yQ, TZ + sz * 0.056, 0.009, 0.08, ST, HI);
    // Octagonal belfry
    const R8 = 0.05;
    m.prism(ID, tx, yQ, TZ, R8, yO - yQ, 8, ST, R8 * 0.96, Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const am = (k + 1) * (Math.PI / 4), dd = R8 * Math.cos(Math.PI / 8) - 0.001;
      const T = xform(tx + Math.cos(am) * dd, 0, TZ + Math.sin(am) * dd, Math.atan2(Math.cos(am), Math.sin(am)));
      m.win(T, 0, yQ + 0.015, 0.022, 0.095, 0, VOID, HI, 'pointed');
      gable(T, 0, yQ + 0.105, 0.034, 0.045, 0.001);
      const ac = Math.PI / 8 + k * (Math.PI / 4);
      pinnacle(m, ID, tx + Math.cos(ac) * (R8 + 0.004), yQ, TZ + Math.sin(ac) * (R8 + 0.004), 0.006, 0.16, ST, HI);
    }
    // Openwork spire: dark core, eight crocketed ribs, tracery bands, finial
    const RS0 = 0.047, H = yS - yO;
    m.prism(ID, tx, yO, TZ, RS0 * 0.82, H, 8, '#34312b', 0, Math.PI / 8);
    for (const f of [0.16, 0.36, 0.56, 0.74]) {
      const rr = RS0 * (1 - f);
      m.prism(ID, tx, yO + f * H - 0.003, TZ, rr, 0.007, 8, HI, rr * 0.96, Math.PI / 8, false);
    }
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + k * (Math.PI / 4), ca = Math.cos(a), sa = Math.sin(a);
      m.beam([tx + ca * RS0, yO, TZ + sa * RS0], [tx, yS, TZ], 0.008, ST);
      for (let f = 0.07; f < 0.93; f += 0.085) {
        const rr = RS0 * (1 - f) + 0.004;
        m.box(ID, tx + ca * rr, yO + f * H, TZ + sa * rr, 0.0065, 0.005, 0.0065, HI);
      }
    }
    m.box(ID, tx, yS - 0.01, TZ, 0.006, 0.045, 0.006, HI);
    m.box(ID, tx, yS + 0.012, TZ, 0.032, 0.007, 0.007, HI);
    m.box(ID, tx, yS + 0.012, TZ, 0.007, 0.007, 0.032, HI);
    m.blob(ID, tx, yS + 0.038, TZ, 0.006, 0.008, 0.006, HI);
  }

  // ---- West front between the towers ----------------------------------------------------------------
  const ZF = TZ + TW / 2 - 0.008;
  m.box(ID, 0, yG, TZ, 0.09, 0.3, TW - 0.016, ST);
  const Tf = xform(0, 0, ZF);
  m.win(Tf, 0, yG + 0.004, 0.05, 0.125, 0, VOID, HI, 'pointed');
  gable(Tf, 0, yG + 0.12, 0.076, 0.07, 0.002);
  m.win(Tf, 0, yG + 0.16, 0.062, 0.13, 0, GL, HI, 'pointed');
  tracery(Tf, 0, yG + 0.16, 0.062, 0.09, 4);
  m.poly(Tf, [[-0.045, yG + 0.3], [0.045, yG + 0.3], [0, yG + 0.4]], -0.1, 0, ST);
  m.win(Tf, 0, yG + 0.31, 0.022, 0.04, 0, GL, HI, 'pointed');
  m.box(ID, 0, yG + 0.395, ZF - 0.004, 0.005, 0.03, 0.005, HI);
  m.box(ID, 0, yG + 0.415, ZF - 0.004, 0.018, 0.005, 0.005, HI);
  m.box(Tf, 0, yG + 0.3, 0.002, 0.09, 0.01, 0.006, HI);
  for (const sx of [-1, 1]) pinnacle(m, ID, sx * 0.043, yG + 0.3, ZF, 0.006, 0.08, ST, HI);
  for (let k = 0; k < 3; k++) m.box(ID, 0, yG, ZF + 0.03 + k * 0.012, 0.44 - k * 0.04, 0.008 - k * 0.0025, 0.05 - k * 0.012, '#9b978e');

  // ---- Nave, aisles, flying buttresses --------------------------------------------------------------
  const yE = yG + 0.25, ZT = -0.13, ZA = -0.33, NZ0 = TZ - TW / 2 + 0.002;
  m.box(ID, 0, yG, (NZ0 + ZA) / 2, 0.1, 0.25, NZ0 - ZA, ST);
  m.poly(ID, [[-0.057, yE - 0.001], [0.057, yE - 0.001], [0, yE + 0.1]], ZA, NZ0, ROOF);
  m.box(ID, 0, yE + 0.098, (NZ0 + ZA) / 2, 0.004, 0.006, NZ0 - ZA, HI);
  const bays: number[] = [];
  for (let z = NZ0 - 0.03; z > ZA + 0.01; z -= 0.052) if (Math.abs(z - ZT) > 0.055) bays.push(z);
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [[NZ0, ZT + 0.045], [ZT - 0.045, ZA + 0.03]]) {
      m.box(ID, sx * 0.1, yG, (z0 + z1) / 2, 0.1, 0.13, z0 - z1, ST);
      m.poly(ID, sx > 0 ? [[0.05, yG + 0.13], [0.153, yG + 0.13], [0.05, yG + 0.185]] : [[-0.153, yG + 0.13], [-0.05, yG + 0.13], [-0.05, yG + 0.185]], z1, z0, ROOF);
    }
    m.box(ID, sx * 0.05, yE, (NZ0 + ZA) / 2, 0.006, 0.012, NZ0 - ZA, HI);
    for (const zb of bays) {
      m.win(xform(sx * 0.05, 0, zb, (sx * Math.PI) / 2), 0, yG + 0.19, 0.03, 0.055, 0, GL, HI, 'pointed');
      m.win(xform(sx * 0.15, 0, zb, (sx * Math.PI) / 2), 0, yG + 0.025, 0.03, 0.08, 0, GL, HI, 'pointed');
      const zp = zb - 0.026, T = xform(0, 0, zp);
      m.box(ID, sx * 0.16, yG, zp, 0.02, 0.2, 0.022, ST);
      pinnacle(m, ID, sx * 0.16, yG + 0.2, zp, 0.008, 0.065, ST, HI);
      m.box(ID, sx * 0.1, yG + 0.13, zp, 0.012, 0.08, 0.016, ST);
      pinnacle(m, ID, sx * 0.1, yG + 0.21, zp, 0.006, 0.045, ST, HI);
      m.strut(T, sx * 0.152, yG + 0.185, sx * 0.105, yG + 0.2, 0.008, 0.008, HI);
      m.strut(T, sx * 0.095, yG + 0.2, sx * 0.052, yG + 0.232, 0.008, 0.008, HI);
      pinnacle(m, ID, sx * 0.05, yE, zp, 0.005, 0.04, ST, HI);
    }
  }

  // ---- Transept --------------------------------------------------------------------------------------
  m.box(ID, 0, yG, ZT, 0.48, 0.25, 0.09, ST);
  m.poly(xform(0, 0, ZT, Math.PI / 2), [[-0.052, yE - 0.001], [0.052, yE - 0.001], [0, yE + 0.095]], -0.24, 0.24, ROOF);
  for (const sx of [-1, 1]) {
    const Tt = xform(sx * 0.24, 0, ZT, (sx * Math.PI) / 2);
    m.win(Tt, 0, yG + 0.004, 0.036, 0.1, 0, VOID, HI, 'pointed');
    gable(Tt, 0, yG + 0.095, 0.05, 0.04, 0.002);
    m.win(Tt, 0, yG + 0.125, 0.05, 0.11, 0, GL, HI, 'pointed');
    tracery(Tt, 0, yG + 0.125, 0.05, 0.075, 3);
    m.poly(Tt, [[-0.046, yE], [0.046, yE], [0, yE + 0.1]], 0, 0.004, ST);
    m.win(Tt, 0, yE + 0.012, 0.02, 0.04, 0.004, GL, HI, 'pointed');
    for (const sz of [-1, 1]) {
      m.prism(ID, sx * 0.24, yG, ZT + sz * 0.046, 0.012, 0.31, 8, ST);
      m.prism(ID, sx * 0.24, yG + 0.31, ZT + sz * 0.046, 0.013, 0.07, 8, HI, 0);
    }
  }
  m.prism(ID, 0, yE + 0.06, ZT, 0.016, 0.065, 8, ROOF, 0.016, Math.PI / 8);
  m.prism(ID, 0, yE + 0.125, ZT, 0.019, 0.24, 8, ROOF, 0, Math.PI / 8);
  m.blob(ID, 0, yE + 0.37, ZT, 0.007, 0.007, 0.007, '#d4a537');

  // ---- Choir with chapel ring and radiating flyers ----------------------------------------------------
  m.prism(ID, 0, yG, ZA, 0.055, 0.25, 8, ST, 0.055, Math.PI / 8, false);
  m.prism(ID, 0, yE - 0.001, ZA, 0.06, 0.1, 8, ROOF, 0, Math.PI / 8);
  m.prism(ID, 0, yG, ZA + 0.01, 0.148, 0.12, 14, ST, 0.148, 0, false);
  m.prism(ID, 0, yG + 0.12, ZA + 0.01, 0.152, 0.05, 14, ROOF, 0.08);
  for (let k = -3; k <= 3; k++) {
    const a = Math.PI + (k * Math.PI) / 7.5, T = xform(0, 0, ZA, a - Math.PI / 2);
    const px = Math.sin(a) * 0.155, pz = ZA + Math.cos(a) * 0.155;
    m.box(ID, px, yG, pz, 0.016, 0.19, 0.016, ST);
    pinnacle(m, ID, px, yG + 0.19, pz, 0.007, 0.06, ST, HI);
    m.strut(T, 0.15, yG + 0.175, 0.058, yG + 0.23, 0.008, 0.008, HI);
  }

  // ---- Domplatte: people, trees, lamp posts ---------------------------------------------------------
  for (let i = 0; i < 26; i++) {
    const x = (hash3(i, 1, 7) - 0.5) * 0.7, z = 0.3 + hash3(i, 2, 7) * 0.13;
    person(m, x, yG, z, i, 0.01);
  }
  for (const [x, z] of [[-0.36, -0.05], [-0.4, -0.15], [-0.34, -0.25], [0.36, -0.06], [0.4, -0.17], [0.33, -0.27], [-0.26, -0.36], [0.26, -0.37]] as [number, number][]) {
    leafTree(m, x, yG, z, 0.06, hash3(x * 9, z * 9, 1) > 0.5 ? '#567f3c' : '#4c7536');
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// St Peter's Basilica and Square (Vatican): Michelangelo's ribbed, lead-sheathed dome on its drum of paired
// columns with lantern, two minor domes, Maderno's travertine façade with giant order, pediment, attic,
// statues of Christ and the apostles and the two clocks; Bernini's elliptical colonnade four columns deep with
// its statue-lined roof, the straight corridors back to the façade, the obelisk, the two fountains and the
// radial travertine paving lines. Apostolic Palace to the right, Vatican Gardens with stone pines behind.
const stpeters: Builder = (gp) => {
  const TR = '#e9dfc7', TR2 = '#d3c7ab', LEAD = '#8d9ca5', VOID = '#4a4237', yG = 0.037, m = new Mesh3();
  const ZC = 0.22, EA = 0.37, EB = 0.19;
  island(gp, 0.5, () => 0.002, '#a59c8d', (x, _y, z) => {
    const e = (x / EA) ** 2 + ((z - ZC) / EB) ** 2;
    if (e < 1.05 || (z > -0.06 && z < 0.12 && Math.abs(x) < 0.24)) return hash3(Math.floor(x * 70), 5, Math.floor(z * 70)) > 0.5 ? '#aaa193' : '#a1988a';
    if (z < -0.02 && Math.abs(x) > 0.24) return hash3(Math.floor(x * 30), 6, Math.floor(z * 30)) > 0.5 ? '#5e8a48' : '#557f42';
    if (z < -0.42) return '#5e8a48';
    return '#c4bba9';
  }, { rings: 18, segs: 84, side: strataSide(EARTH) });
  // Radial travertine lines and the ellipse border
  for (let k = 0; k < 16; k++) {
    const a = (k * TAU) / 16, re = 1 / Math.hypot(Math.sin(a) / EA, Math.cos(a) / EB), L = re - 0.04;
    m.box(xform(Math.sin(a) * (0.025 + L / 2), 0, ZC + Math.cos(a) * (0.025 + L / 2), a), 0, yG - 0.0012, 0, 0.003, 0.0016, L - 0.03, '#e3dccd');
  }
  // ---- Colonnade arms --------------------------------------------------------------------------------
  const CD = 0.05, yC = yG + 0.048, F0 = 0.62, F1 = 2.42, NS = 14;
  const E = (f: number, sx: number, d: number): V3 => [sx * (EA + d) * Math.sin(f), 0, ZC + (EB + d) * Math.cos(f)];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < NS; i++) {
      const f0 = F0 + ((F1 - F0) * i) / NS, f1 = F0 + ((F1 - F0) * (i + 1)) / NS;
      const a0 = E(f0, sx, 0), a1 = E(f1, sx, 0), b0 = E(f0, sx, CD), b1 = E(f1, sx, CD);
      const Y = (p: V3, y: number): V3 => [p[0], y, p[2]];
      const nIn: V3 = [-sx * Math.sin((f0 + f1) / 2), 0, -Math.cos((f0 + f1) / 2)];
      m.quad(Y(a0, yC), Y(a1, yC), Y(b1, yC), Y(b0, yC), shade(TR, 1.05), [0, 1, 0]);
      m.quad(Y(a0, yC - 0.012), Y(a1, yC - 0.012), Y(a1, yC + 0.004), Y(a0, yC + 0.004), TR2, nIn);
      m.quad(Y(b0, yC - 0.012), Y(b1, yC - 0.012), Y(b1, yC + 0.004), Y(b0, yC + 0.004), shade(TR2, 0.9), [-nIn[0], 0, -nIn[2]]);
      m.quad(Y(a0, yC + 0.004), Y(a1, yC + 0.004), Y(a1, yC), Y(a0, yC), TR2, nIn);
      const s0 = E((f0 + f1) / 2, sx, 0.004);
      m.box(ID, s0[0], yC + 0.004, s0[2], 0.004, 0.011, 0.004, TR2);
      m.blob(ID, s0[0], yC + 0.017, s0[2], 0.0022, 0.0025, 0.0022, TR2, 5);
    }
    const NC = 18;
    for (let i = 0; i <= NC; i++) {
      const f = F0 + ((F1 - F0) * i) / NC;
      for (const d of [0.005, 0.019, 0.032, 0.045]) {
        const p = E(f, sx, d);
        m.prism(ID, p[0], yG, p[2], 0.0036, yC - yG - 0.012, 6, d === 0.005 ? TR : shade(TR, 0.92), 0.0036, 0, false);
      }
    }
    for (const f of [F0, F1]) {
      const p = E(f, sx, CD / 2);
      m.box(xform(p[0], 0, p[2], Math.atan2(sx * Math.sin(f), Math.cos(f))), 0, yG, 0, 0.022, 0.058, CD + 0.006, TR);
    }
    // Straight corridor back to the façade
    const pA = E(F1, sx, CD / 2), pB: V3 = [sx * 0.215, 0, -0.06];
    const L = Math.hypot(pB[0] - pA[0], pB[2] - pA[2]), ang = Math.atan2(pB[0] - pA[0], pB[2] - pA[2]);
    const Tc = xform((pA[0] + pB[0]) / 2, 0, (pA[2] + pB[2]) / 2, ang);
    m.box(Tc, 0, yG, 0, 0.04, 0.05, L, TR);
    m.box(Tc, 0, yG + 0.05, 0, 0.046, 0.005, L + 0.004, TR2);
    m.poly(Tc, [[-0.023, yG + 0.055], [0.023, yG + 0.055], [0, yG + 0.068]], -L / 2, L / 2, '#b9a587');
    for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) for (const wy of [0.01, 0.03]) m.win((v: V3): V3 => Tc([sd * (0.02 + v[2]), v[1], -sd * v[0]]), -L / 2 + ((k + 0.5) * L) / 6, yG + wy, 0.009, 0.012, 0, VOID, undefined, wy > 0.02 ? 'rect' : 'arch');
  }

  // ---- Basilica body ---------------------------------------------------------------------------------
  const ZF = -0.05, yT = yG + 0.135;
  m.box(ID, 0, yG, ZF - 0.04, 0.46, 0.16, 0.08, TR);
  m.box(ID, 0, yG, ZF - 0.04 + 0.006, 0.26, 0.16, 0.08, TR);
  m.box(ID, 0, yG, -0.18, 0.2, 0.15, 0.1, TR);
  m.poly(ID, [[-0.1, yG + 0.15], [0.1, yG + 0.15], [0, yG + 0.19]], -0.23, -0.13, '#9aa6ab');
  m.box(ID, 0, yG, -0.33, 0.36, 0.15, 0.17, TR);
  m.box(ID, 0, yG + 0.15, -0.33, 0.35, 0.008, 0.16, '#a7a9a3');
  for (const [px, pz] of [[-0.18, -0.33], [0.18, -0.33], [0, -0.41]] as [number, number][]) {
    m.prism(ID, px, yG, pz, 0.08, 0.15, 14, TR, 0.08, 0, false);
    m.prism(ID, px, yG + 0.12, pz, 0.084, 0.03, 14, TR2, 0.084, 0, false);
    m.prism(ID, px, yG + 0.15, pz, 0.086, 0.022, 14, '#9aa6ab', 0.045);
    for (let k = 0; k < 14; k++) {
      const a = (k * TAU) / 14, ac = a + Math.PI / 14, rr = 0.08 * Math.cos(Math.PI / 14);
      const T = xform(px + Math.cos(a) * 0.081, 0, pz + Math.sin(a) * 0.081, Math.atan2(Math.cos(a), Math.sin(a)));
      m.box(T, 0, yG, 0, 0.008, 0.12, 0.004, shade(TR, 1.03));
      const Tw = xform(px + Math.cos(ac) * rr, 0, pz + Math.sin(ac) * rr, Math.atan2(Math.cos(ac), Math.sin(ac)));
      m.win(Tw, 0, yG + 0.025, 0.012, 0.03, 0, VOID, TR2, 'arch');
      m.win(Tw, 0, yG + 0.08, 0.01, 0.018, 0, VOID, TR2, 'rect');
    }
  }
  // Façade: giant order, doors, benediction loggia, entablature, pediment, attic, statues, clocks
  const Tf = xform(0, 0, ZF + 0.006);
  m.box(ID, 0, yG, ZF + 0.004, 0.47, 0.012, 0.014, TR2);
  for (const x of [-0.2, -0.155, -0.12, -0.085, -0.05, -0.017, 0.017, 0.05, 0.085, 0.12, 0.155, 0.2]) {
    const col = Math.abs(x) < 0.13;
    if (col) m.prism(ID, x, yG + 0.012, ZF + 0.012, 0.0075, yT - yG - 0.018, 8, TR, 0.0068);
    else m.box(ID, x, yG + 0.012, ZF + 0.003, 0.014, yT - yG - 0.018, 0.006, TR);
    m.box(ID, x, yT - 0.007, ZF + (col ? 0.012 : 0.004), 0.019, 0.007, col ? 0.019 : 0.01, TR2);
  }
  for (const x of [-0.1025, -0.0675, -0.0335, 0, 0.0335, 0.0675, 0.1025]) {
    if (Math.abs(x) < 0.08) m.win(Tf, x, yG + 0.014, 0.016, 0.042, 0, VOID, TR2, 'rect');
    m.win(Tf, x, yG + 0.074, 0.016, 0.038, 0, Math.abs(x) < 0.01 ? '#3a3127' : VOID, TR2, 'arch');
  }
  const Tf0 = xform(0, 0, ZF);
  for (const x of [-0.18, 0.18]) { m.win(Tf0, x, yG + 0.02, 0.018, 0.04, 0, VOID, TR2, 'arch'); m.win(Tf0, x, yG + 0.08, 0.016, 0.032, 0, VOID, TR2, 'rect'); }
  m.box(ID, 0, yT, ZF, 0.48, 0.014, 0.05, TR2);
  m.box(ID, 0, yT + 0.014, ZF, 0.49, 0.005, 0.056, TR);
  m.poly(xform(0, 0, ZF + 0.024), [[-0.072, yT + 0.019], [0.072, yT + 0.019], [0, yT + 0.05]], -0.03, 0, TR);
  m.box(ID, 0, yT + 0.019, ZF - 0.03, 0.46, 0.028, 0.06, TR);
  for (let k = -3; k <= 3; k++) if (k !== 0) m.win(Tf0, k * 0.032, yT + 0.026, 0.01, 0.01, 0, VOID, undefined, 'rect');
  for (let k = -6; k <= 6; k++) {
    const x = k * 0.019, y = k === 0 ? yT + 0.05 : yT + 0.047, sc = k === 0 ? 1.25 : 1;
    m.box(ID, x, y, ZF - 0.005, 0.006 * sc, 0.016 * sc, 0.005, TR2);
    m.blob(ID, x, y + 0.019 * sc, ZF - 0.005, 0.0028 * sc, 0.003 * sc, 0.0028 * sc, TR2, 5);
  }
  for (const sx of [-1, 1]) {
    m.box(ID, sx * 0.205, yT + 0.047, ZF - 0.02, 0.04, 0.032, 0.035, TR);
    m.prism((v) => [sx * 0.205 + v[0], yT + 0.064 + v[2], ZF - 0.0025 + v[1]], 0, 0, 0, 0.011, 0.002, 12, '#f0e2b0');
    m.prism(ID, sx * 0.205, yT + 0.079, ZF - 0.02, 0.012, 0.02, 8, LEAD, 0);
  }
  for (let k = 0; k < 4; k++) m.box(ID, 0, yG, ZF + 0.02 + k * 0.012, 0.3 - k * 0.04, 0.009 - k * 0.002, 0.05 - k * 0.012, '#d9d2c2');

  // ---- Domes -----------------------------------------------------------------------------------------
  const dome = (cx: number, cz: number, y0: number, R: number, H: number, n: number, ribs: number, drumH: number, lan: number): void => {
    m.prism(ID, cx, y0, cz, R * 1.16, 0.02 * R / 0.1, n / 2, TR2, R * 1.16, 0);
    const yd = y0 + 0.02 * R / 0.1;
    m.rev(ID, cx, yd, cz, [[R, 0], [R, drumH]], n, (i) => (i % 2 ? '#62594b' : TR));
    for (let k = 0; k < n / 2; k++) {
      const a = ((2 * k + 0.5) * TAU) / n;
      const T = xform(cx + Math.cos(a) * R, 0, cz + Math.sin(a) * R, Math.atan2(Math.cos(a), Math.sin(a)));
      m.box(T, 0, yd, 0.004, R * 0.16, drumH, R * 0.1, TR);
    }
    m.prism(ID, cx, yd + drumH, cz, R * 1.1, R * 0.08, n, TR2, R * 1.08, 0);
    const ya = yd + drumH + R * 0.08;
    m.rev(ID, cx, ya, cz, [[R, 0], [R, R * 0.16]], n, TR);
    const yb = ya + R * 0.16, prof: [number, number][] = [];
    for (let k = 0; k <= 9; k++) { const t = (k / 9) * Math.acos(0.25); prof.push([R * Math.cos(t), H * Math.sin(t)]); }
    m.rev(ID, cx, yb, cz, prof, ribs * 3, (i) => (i % 3 === 0 ? '#ddd3bd' : LEAD), Math.PI / ribs / 3 * 0.5);
    if (lan > 0) for (let row = 0; row < 3; row++) for (let k = 0; k < ribs; k++) {
      const t = (0.18 + row * 0.22) * Math.acos(0.25), a = Math.PI / ribs / 3 * 0.5 + ((3 * k + 2) * TAU) / (ribs * 3);
      const rr = R * Math.cos(t) + 0.002;
      m.box(ID, cx + Math.cos(a) * rr, yb + H * Math.sin(t) - 0.004, cz + Math.sin(a) * rr, 0.0055 - row * 0.001, 0.006, 0.0055 - row * 0.001, '#cfc6b2');
    }
    const yl = yb + H * Math.sin(Math.acos(0.25)), rl = R * 0.25;
    m.prism(ID, cx, yl, cz, rl * 1.05, 0.006, 12, TR2);
    m.rev(ID, cx, yl + 0.006, cz, [[rl * 0.9, 0], [rl * 0.9, rl * 1.5]], 16, (i) => (i % 2 ? '#5d5446' : TR));
    m.prism(ID, cx, yl + 0.006 + rl * 1.5, cz, rl * 1.05, 0.005, 12, TR2);
    m.rev(ID, cx, yl + 0.011 + rl * 1.5, cz, [[rl * 0.95, 0], [rl * 0.7, rl * 0.6], [rl * 0.25, rl * 1.1], [rl * 0.12, rl * 1.7], [0, rl * 1.8]], 12, LEAD);
    const yt = yl + 0.011 + rl * 3.3;
    m.blob(ID, cx, yt + 0.004, cz, rl * 0.18, rl * 0.18, rl * 0.18, '#d6a83a', 6);
    if (lan > 0) { m.box(ID, cx, yt + 0.006, cz, 0.0025, lan, 0.0025, '#d6a83a'); m.box(ID, cx, yt + 0.006 + lan * 0.62, cz, 0.012, 0.0025, 0.0025, '#d6a83a'); }
  };
  dome(0, -0.33, yG + 0.15, 0.098, 0.15, 32, 16, 0.07, 0.022);
  for (const sx of [-1, 1]) dome(sx * 0.14, -0.235, yG + 0.15, 0.03, 0.035, 16, 8, 0.03, 0);

  // ---- Obelisk and fountains -------------------------------------------------------------------------
  m.box(ID, 0, yG, ZC, 0.03, 0.006, 0.03, TR2);
  m.box(ID, 0, yG + 0.006, ZC, 0.02, 0.018, 0.02, '#cbbd9f');
  m.prism(ID, 0, yG + 0.024, ZC, 0.0085 * Math.SQRT2, 0.12, 4, '#cdb68c', 0.0055 * Math.SQRT2, Math.PI / 4, false);
  m.prism(ID, 0, yG + 0.144, ZC, 0.0055 * Math.SQRT2, 0.009, 4, '#cdb68c', 0, Math.PI / 4);
  m.box(ID, 0, yG + 0.15, ZC, 0.0018, 0.014, 0.0018, '#c9a443');
  m.box(ID, 0, yG + 0.159, ZC, 0.008, 0.0018, 0.0018, '#c9a443');
  for (const sx of [-1, 1]) {
    const fx = sx * 0.16;
    m.rev(ID, fx, yG, ZC, [[0.026, 0], [0.026, 0.006], [0.022, 0.006], [0.022, 0.004], [0, 0.004]], 16, (_i, j) => (j >= 3 ? '#7fb3cf' : TR2));
    m.prism(ID, fx, yG + 0.004, ZC, 0.004, 0.022, 8, TR2);
    m.rev(ID, fx, yG + 0.022, ZC, [[0.003, 0], [0.013, 0.006], [0.0125, 0.007], [0, 0.007]], 12, (_i, j) => (j >= 2 ? '#9cc8de' : TR2));
    m.blob(ID, fx, yG + 0.035, ZC, 0.009, 0.007, 0.009, '#d7ecf6', 7);
    m.blob(ID, fx, yG + 0.044, ZC, 0.004, 0.006, 0.004, '#eef8fc', 6);
  }
  for (let i = 0; i < 40; i++) {
    const a = hash3(i, 1, 9) * TAU, rr = Math.sqrt(hash3(i, 2, 9)) * 0.85;
    person(m, Math.sin(a) * EA * rr, yG, ZC + Math.cos(a) * EB * rr, i, 0.008);
  }

  // ---- Apostolic Palace and the Vatican Gardens ------------------------------------------------------
  const Tp = xform(0.33, 0, -0.17, 0);
  house(m, Tp, 0, yG, 0, 0.12, 0.1, 0.15, '#dcc8a0', '#b5653f', 0.35);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) m.box(Tp, -0.05 + k * 0.02, yG + 0.015 + r * 0.022, 0.075, 0.007, 0.011, 0.0015, '#5c4a38');
  house(m, ID, 0.39, yG, 0.02, 0.07, 0.08, 0.08, '#d9c39a', '#b5653f', 0.35, 3);
  const pine2 = (x: number, z: number, s: number): void => {
    m.prism(ID, x, yG, z, s * 0.04, s * 0.8, 5, '#6b5240', s * 0.03);
    m.blob(ID, x, yG + s * 0.85, z, s * 0.38, s * 0.13, s * 0.38, '#3f6a35', 8);
  };
  for (const [x, z, s] of [[-0.3, -0.08, 0.075], [-0.38, -0.16, 0.07], [-0.28, -0.24, 0.08], [-0.4, -0.06, 0.065], [-0.2, -0.44, 0.07], [0.22, -0.44, 0.065], [0.36, -0.3, 0.06], [-0.33, -0.33, 0.07]] as [number, number, number][]) {
    if (s > 0.068) pine2(x, z, s); else leafTree(m, x, yG, z, s, '#4f7a3c');
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Mont-Saint-Michel: the granite tidal island rising from the sand flats of the bay. Medieval ramparts with
// round towers ring the south side; the village climbs the slope in two rows of slate-roofed granite houses;
// the abbey crowns the summit — massive foundation walls, the Merveille on the north, the abbey lodgings on
// the south, the church with its flamboyant choir and flying buttresses and the neo-Gothic belfry and spire
// with the gilded Saint Michael. Wooded north slope, tidal channels and wet sand mirrors, the footbridge.
const montsaintmichel: Builder = (gp) => {
  const GR = '#958a76', GR2 = '#ada089', SLATE = '#4b515a', yB = 0.035, ZR = -0.03, RC = 0.255, HR = 0.24;
  const hR = (x: number, z: number): number => {
    const r = Math.hypot(x, z - ZR), t = 1 - r / (RC + (z > ZR ? 0.02 * ((z - ZR) / r) : 0));
    const flats = 0.002 + 0.002 * (fbm(x * 12, 0, z * 12) - 0.5);
    if (t <= 0) return flats;
    return flats + HR * sstep(0.04, 0.66, t) * (1 + 0.14 * (fbm(x * 26, 2, z * 26) - 0.5));
  };
  const SEA = mix(WATER, '#a9b8bb', 0.55);
  island(gp, 0.5, hR, '#c9bfa6', (x, y, z) => {
    const r = Math.hypot(x, z - ZR);
    if (y > yB + 0.012) {
      if ((z < ZR + 0.03 || x < -0.12) && fbm(x * 30, 1, z * 30) > 0.38) return fbm(x * 50, 4, z * 50) > 0.5 ? '#4d6b3a' : '#57773f';
      return fbm(x * 40, 3, z * 40) > 0.5 ? '#80786a' : '#8e8576';
    }
    if (r < RC + 0.03) return '#b8ad93';
    const f = fbm(x * 7, 3, z * 7) + (Math.abs(x + 0.3 + 0.05 * Math.sin(z * 8)) < 0.04 ? -0.2 : 0);
    if (f > 0.53) return hash3(Math.floor(x * 40), 1, Math.floor(z * 40)) > 0.5 ? '#cdc3a8' : '#c5bb9f';
    if (f > 0.49) return '#b9b39f';
    return hash3(Math.floor(x * 50), 2, Math.floor(z * 50)) > 0.85 ? shade(SEA, 1.1) : SEA;
  }, { rings: 28, segs: 96, side: strataSide(['#7d6e57', '#6d604c', '#8a7b62', '#5f533f']) });
  const m = new Mesh3(), gold = new Mesh3();
  const yAt = (x: number, z: number): number => yB + hR(x, z);
  const P = (a: number, r: number): [number, number] => [Math.sin(a) * r, ZR + Math.cos(a) * r];

  // ---- Ramparts with round towers and the King's Gate ------------------------------------------------
  const RW = 0.25, A0 = -1.95, A1 = 1.75, NSEG = 30;
  for (let i = 0; i < NSEG; i++) {
    const a = A0 + ((i + 0.5) * (A1 - A0)) / NSEG, [x, z] = P(a, RW), ch = (2 * RW * Math.sin((A1 - A0) / NSEG / 2)) + 0.002;
    const yb = yAt(x, z) - 0.004, T = xform(x, 0, z, a);
    m.box(T, 0, yb, 0, ch, 0.044, 0.013, GR);
    m.box(T, 0, yb + 0.044, 0.005, ch, 0.004, 0.004, GR2);
    for (const dx of [-ch / 4, ch / 4]) m.box(T, dx, yb + 0.048, 0.005, 0.007, 0.006, 0.004, GR2);
  }
  for (const [a, rr, hh, roof] of [[-1.85, 0.021, 0.06, 0], [-1.3, 0.02, 0.058, 1], [-0.7, 0.022, 0.062, 0], [0.15, 0.019, 0.056, 0], [0.62, 0.024, 0.068, 1], [1.12, 0.02, 0.058, 0], [1.62, 0.022, 0.07, 1]] as [number, number, number, number][]) {
    const [x, z] = P(a, RW + 0.006), yb = yAt(x, z) - 0.004;
    m.prism(ID, x, yb, z, rr, hh, 10, GR2);
    m.prism(ID, x, yb + hh, z, rr + 0.002, 0.006, 10, GR, rr + 0.002, 0, !roof);
    if (roof) m.prism(ID, x, yb + hh + 0.006, z, rr + 0.003, 0.03, 10, SLATE, 0);
  }
  // King's Gate (Porte du Roi) facing the footbridge
  const AG = -0.28, [gx, gz] = P(AG, RW + 0.01), Tg = xform(gx, 0, gz, AG), ygb = yAt(gx, gz) - 0.004;
  m.box(Tg, 0, ygb, 0, 0.05, 0.07, 0.03, GR2);
  m.win(Tg, 0, ygb, 0.018, 0.03, 0.015, '#2c2924', GR, 'arch');
  house(m, Tg, 0, ygb + 0.07, 0, 0.052, 0.012, 0.032, GR, SLATE, 0.9);
  for (const sx of [-1, 1]) { m.prism(Tg, sx * 0.028, ygb, 0.012, 0.011, 0.085, 8, GR2); m.prism(Tg, sx * 0.028, ygb + 0.085, 0.012, 0.012, 0.025, 8, SLATE, 0); }

  // ---- Village: two rows of houses climbing the Grande Rue ------------------------------------------
  const WALLS = ['#9a9283', '#878072', '#a8a090', '#b5aa94', '#8f8779', '#c2b8a2'];
  const ROOFS = ['#4b515a', '#555b63', '#434850', '#5c6168', '#6b5a4c'];
  for (let row = 0; row < 3; row++) {
    const N = [17, 13, 9][row];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N, a = -0.45 + t * [2.3, 1.9, 1.5][row] + row * 0.12, r = [0.222, 0.188, 0.155][row] - t * 0.025;
      const [x, z] = P(a, r), [xo, zo] = P(a, r + 0.018);
      const yb = yAt(xo, zo) - 0.004, ytop = yAt(x, z) + 0.03 + hash3(i, row, 3) * 0.012;
      const w = 0.03 + hash3(i, row, 4) * 0.016, k = Math.floor(hash3(i, row, 5) * 60);
      house(m, xform(x, 0, z, a), 0, yb, 0, w, ytop - yb, 0.03, WALLS[k % WALLS.length], ROOFS[k % ROOFS.length], 0.75, 2);
      if (k % 3 === 0) m.box(xform(x, 0, z, a), w * 0.3, ytop + 0.006, -0.004, 0.004, 0.01, 0.004, GR);
    }
  }
  for (let i = 0; i < 34; i++) {
    const a = i < 26 ? 1.7 + hash3(i, 7, 1) * 3.4 : -0.3 + hash3(i, 7, 1) * 1.6, r = i < 26 ? 0.09 + hash3(i, 7, 2) * 0.15 : 0.12 + hash3(i, 7, 2) * 0.02, [x, z] = P(a, r);
    leafTree(m, x, yAt(x, z) - 0.006, z, 0.035 + hash3(i, 7, 3) * 0.015, hash3(i, 7, 4) > 0.5 ? '#4d6b3a' : '#5a7a42');
  }

  // ---- The abbey -------------------------------------------------------------------------------------
  const YT = yB + HR + 0.002, YF = YT + 0.022;
  m.box(ID, -0.01, YT - 0.1, ZR, 0.22, 0.122, 0.12, GR);
  for (let k = 0; k < 7; k++) m.box(ID, -0.1 + k * 0.03, YT - 0.1, ZR + 0.06, 0.008, 0.115, 0.008, shade(GR, 1.05));
  house(m, ID, 0.035, YT - 0.14, ZR - 0.085, 0.17, 0.2, 0.05, GR, SLATE, 0.55);
  for (let k = 0; k < 6; k++) m.box(ID, -0.04 + k * 0.03, YT - 0.14, ZR - 0.112, 0.008, 0.19, 0.006, shade(GR, 1.06));
  const Tl = xform(0.005, 0, ZR + 0.078);
  house(m, Tl, 0, YT - 0.12, 0, 0.13, 0.175, 0.044, GR2, SLATE, 0.6);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) m.win(Tl, -0.052 + k * 0.021, YT - 0.06 + r * 0.035, 0.006, 0.018, 0.022, '#2f3238', undefined, r === 2 ? 'arch' : 'rect');
  m.prism(ID, 0.075, YT - 0.12, ZR + 0.098, 0.016, 0.19, 8, GR2);
  m.prism(ID, 0.075, YT + 0.07, ZR + 0.098, 0.017, 0.025, 8, SLATE, 0);
  // Church: Romanesque nave, transept, flamboyant choir with flyers, apse
  house(m, ID, -0.07, YF, ZR, 0.13, 0.055, 0.05, GR2, SLATE, 1);
  house(m, xform(-0.003, 0, ZR, Math.PI / 2), 0, YF, 0, 0.11, 0.055, 0.042, GR2, SLATE, 1);
  house(m, ID, 0.06, YF, ZR, 0.1, 0.075, 0.062, GR2, SLATE, 0.95);
  m.prism(ID, 0.11, YF, ZR, 0.032, 0.075, 7, GR2, 0.032, 0, false);
  m.prism(ID, 0.11, YF + 0.075, ZR, 0.034, 0.03, 7, SLATE, 0);
  for (const sz of [-1, 1]) for (const xb of [0.028, 0.056, 0.084]) {
    pinnacle(m, ID, xb, YF - 0.01, ZR + sz * 0.058, 0.006, 0.1, GR2, GR);
    m.strut(xform(xb, 0, 0, -Math.PI / 2), ZR + sz * 0.055, YF + 0.06, ZR + sz * 0.03, YF + 0.073, 0.005, 0.005, GR2);
    m.win(xform(xb + 0.014, 0, ZR + sz * 0.031, sz > 0 ? 0 : Math.PI), 0, YF + 0.02, 0.012, 0.045, 0, '#30343b', undefined, 'pointed');
  }
  for (let k = 0; k < 4; k++) m.win(xform(-0.12 + k * 0.03, 0, ZR + 0.025), 0, YF + 0.018, 0.009, 0.026, 0, '#30343b', undefined, 'arch');
  m.box(ID, -0.135, YF, ZR, 0.012, 0.07, 0.056, GR2);
  // Belfry and spire with Saint Michael
  const TX = -0.003;
  m.box(ID, TX, YF, ZR, 0.044, 0.115, 0.044, GR2);
  rect4(TX, ZR, 0.022, 0.022, (T) => {
    m.win(T, -0.009, YF + 0.083, 0.008, 0.026, 0, '#2a2c30', undefined, 'arch');
    m.win(T, 0.009, YF + 0.083, 0.008, 0.026, 0, '#2a2c30', undefined, 'arch');
    m.box(T, 0, YF + 0.115, 0.001, 0.046, 0.006, 0.004, GR);
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pinnacle(m, ID, TX + sx * 0.021, YF + 0.115, ZR + sz * 0.021, 0.004, 0.05, GR2, GR);
  const yS0 = YF + 0.12, yS1 = YF + 0.34;
  m.prism(ID, TX, yS0, ZR, 0.021, yS1 - yS0, 8, SLATE, 0, Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * TAU) / 8;
    for (let f = 0.1; f < 0.9; f += 0.12) {
      const rr = 0.021 * (1 - f) + 0.002;
      m.box(ID, TX + Math.cos(a) * rr, yS0 + f * (yS1 - yS0), ZR + Math.sin(a) * rr, 0.003, 0.003, 0.003, '#6d737b');
    }
  }
  gold.box(ID, TX, yS1 - 0.004, ZR, 0.004, 0.018, 0.004, '#e2b545');
  gold.blob(ID, TX, yS1 + 0.016, ZR, 0.0025, 0.003, 0.0025, '#e2b545', 5);
  for (const sx of [-1, 1]) gold.strut(ID, TX + sx * 0.002, yS1 + 0.01, TX + sx * 0.009, yS1 + 0.02, 0.003, 0.0015, '#e2b545');
  gold.box(ID, TX + 0.002, yS1 + 0.016, ZR + 0.002, 0.0012, 0.016, 0.0012, '#f0d27a');

  // ---- Footbridge with the shuttle and visitors ------------------------------------------------------
  const Tb = xform(-0.085, 0, 0.37, -0.1), L = 0.25;
  m.box(Tb, 0, yB + 0.012, 0, 0.032, 0.003, L, '#8f877a');
  for (const sx of [-1, 1]) m.box(Tb, sx * 0.015, yB + 0.015, 0, 0.0015, 0.005, L, '#6d6a66');
  for (let k = 0; k < 8; k++) for (const sx of [-1, 1]) m.box(Tb, sx * 0.012, yB - 0.002, -L / 2 + 0.02 + k * 0.037, 0.003, 0.014, 0.003, '#5d5850');
  car(m, Tb, -0.006, yB + 0.015, 0.06, '#d9cfb8', 1.3);
  for (let i = 0; i < 9; i++) { const q = Tb([0.008 * ((i % 3) - 1), 0, -0.1 + i * 0.024]); person(m, q[0], yB + 0.015, q[2], i, 0.009); }
  m.build(gp);
  gold.build(gp, 0.75, 0.3);
};

// ---------------------------------------------------------------------------------------------------------
// Rialto Bridge (Venice): the single segmental Istrian-stone arch over the Grand Canal with its archivolt,
// keystone and string course; the two stepped rows of arcaded shops under pitched roofs climbing to the
// central portico with its great arch and pediment; balustraded outer walkways. Gothic and Renaissance
// palazzi line both banks — ochre, red, rose and cream façades with arched windows, cornices and funnel
// chimneys — above stone fondamenta with striped mooring poles, café tables, gondolas and a vaporetto.
const rialto: Builder = (gp) => {
  const yB = 0.035, yW = yB + 0.002, yQ = yB + 0.012, CW = 0.2, ST = '#ebe3d1', ST2 = '#d3c8b1', ROOF = '#b9673f', VOID = '#2c2a28';
  const WV = '#3f8c8a';
  island(gp, 0.5, () => 0.002, '#bfb39c', (x, _y, z) => {
    if (Math.abs(x) >= CW + 0.01) return '#bfb39c';
    const hsh = hash3(Math.floor(x * 45), 7, Math.floor(z * 45));
    return hsh > 0.9 ? shade(WV, 1.1) : hsh < 0.08 ? mix(WV, '#cfe9ea', 0.25) : WV;
  }, { rings: 18, segs: 80, side: strataSide(EARTH) });
  const m = new Mesh3();
  const RQ = 0.497, f0 = Math.asin(CW / RQ);
  for (const sx of [-1, 1]) {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 14; k++) { const f = f0 + ((Math.PI - 2 * f0) * k) / 14; pts.push([sx * RQ * Math.sin(f), RQ * Math.cos(f)]); }
    m.plan(ID, pts, yB, yQ, '#b3a891');
    for (let k = 0; k < 40; k++) m.box(ID, sx * (CW + 0.004), yQ, -0.44 + k * 0.022, 0.008, 0.0012, 0.02, '#e2dccd');
  }

  // ---- The bridge ------------------------------------------------------------------------------------
  const S = 0.18, RISE = 0.088, HZ = 0.075, XE = 0.335, RR = (S * S + RISE * RISE) / (2 * RISE), yc = yW + RISE - RR;
  const yI = (x: number): number => (Math.abs(x) <= S ? yc + Math.sqrt(RR * RR - x * x) : yQ - 0.002);
  const yD = (x: number): number => { const ax = Math.abs(x); return ax < 0.045 ? yW + 0.12 : yW + 0.12 - ((ax - 0.045) * 0.09) / (XE - 0.045); };
  const xs: number[] = [];
  for (let k = 0; k <= 3; k++) xs.push(-XE + ((XE - S) * k) / 3);
  for (let k = 1; k <= 18; k++) xs.push(-S + (2 * S * k) / 18);
  for (let k = 1; k <= 3; k++) xs.push(S + ((XE - S) * k) / 3);
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], b0 = yI(x0), b1 = yI(x1), t0 = yD(x0), t1 = yD(x1), arch = Math.abs((x0 + x1) / 2) < S;
    for (const sz of [-1, 1]) {
      const z = sz * HZ;
      m.quad([x0, b0, z], [x1, b1, z], [x1, t1, z], [x0, t0, z], ST, [0, 0, sz]);
      if (arch) m.quad([x0, b0, z + sz * 0.001], [x1, b1, z + sz * 0.001], [x1, b1 + 0.013, z + sz * 0.001], [x0, b0 + 0.013, z + sz * 0.001], '#f4eee1', [0, 0, sz]);
      m.quad([x0, t0 - 0.008, z + sz * 0.003], [x1, t1 - 0.008, z + sz * 0.003], [x1, t1 - 0.003, z + sz * 0.003], [x0, t0 - 0.003, z + sz * 0.003], '#f4eee1', [0, 0, sz]);
      m.quad([x0, t0 - 0.003, z], [x1, t1 - 0.003, z], [x1, t1 - 0.003, z + sz * 0.003], [x0, t0 - 0.003, z + sz * 0.003], '#f4eee1', [0, 1, 0]);
      const zb = sz * (HZ - 0.003);
      m.quad([x0, t0, zb + sz * 0.003], [x1, t1, zb + sz * 0.003], [x1, t1 + 0.013, zb + sz * 0.003], [x0, t0 + 0.013, zb + sz * 0.003], ST2, [0, 0, sz]);
      m.quad([x0, t0, zb - sz * 0.003], [x1, t1, zb - sz * 0.003], [x1, t1 + 0.013, zb - sz * 0.003], [x0, t0 + 0.013, zb - sz * 0.003], shade(ST2, 0.9), [0, 0, -sz]);
      m.quad([x0, t0 + 0.013, zb - sz * 0.004], [x1, t1 + 0.013, zb - sz * 0.004], [x1, t1 + 0.016, zb + sz * 0.004], [x0, t0 + 0.016, zb + sz * 0.004], '#f4eee1', [0, 1, 0]);
    }
    m.quad([x0, b0, -HZ], [x1, b1, -HZ], [x1, b1, HZ], [x0, b0, HZ], shade(ST, 0.6), [0, -1, 0]);
    m.quad([x0, t0, -HZ], [x1, t1, -HZ], [x1, t1, HZ], [x0, t0, HZ], '#d6ccb6', [0, 1, 0]);
    if (i % 2 === 0) for (const sz of [-1, 1]) m.box(ID, (x0 + x1) / 2, (t0 + t1) / 2, sz * (HZ - 0.003), 0.002, 0.012, 0.004, '#a69c88');
  }
  for (const sx of [-1, 1]) m.quad([sx * XE, yQ, -HZ], [sx * XE, yQ, HZ], [sx * XE, yD(XE), HZ], [sx * XE, yD(XE), -HZ], ST, [sx, 0, 0]);
  for (const sz of [-1, 1]) m.box(ID, 0, yc + RR - 0.004, sz * (HZ + 0.002), 0.012, 0.02, 0.004, '#f4eee1');
  // Shop rows stepping up to the central portico
  for (const sx of [-1, 1]) for (let j = 0; j < 6; j++) {
    const xa = 0.048 + j * 0.044, xb = xa + 0.044, xm = sx * (xa + xb) / 2, yb = yD(xb) - 0.004, top = yD(xa) + 0.038;
    house(m, ID, xm, yb, 0, 0.0445, top - yb, 0.11, ST, ROOF, 0.32);
    for (const sz of [-1, 1]) {
      const T = xform(xm, 0, sz * 0.055, sz > 0 ? 0 : Math.PI);
      m.win(T, 0, yD((xa + xb) / 2) + 0.004, 0.026, 0.025, 0, VOID, '#f4eee1', 'arch');
      m.box(T, -0.0215, yb, 0.002, 0.004, top - yb, 0.004, '#f4eee1');
    }
  }
  const yP = yD(0), PT = yP + 0.075;
  m.box(ID, 0, yP - 0.004, 0, 0.094, PT - yP + 0.004, 0.124, ST);
  m.poly(ID, [[-0.051, PT], [0.051, PT], [0, PT + 0.026]], -0.064, 0.064, '#f1ebdd');
  for (const sz of [-1, 1]) {
    const T = xform(0, 0, sz * 0.062, sz > 0 ? 0 : Math.PI);
    m.win(T, 0, yP, 0.042, 0.052, 0, VOID, '#f4eee1', 'arch');
    for (const px of [-0.036, 0.036]) m.box(T, px, yP, 0.002, 0.008, PT - yP, 0.004, '#f4eee1');
    m.box(T, 0, PT - 0.006, 0.003, 0.1, 0.006, 0.006, '#f4eee1');
    m.prism(ID, 0, PT + 0.026, sz * 0.06, 0.003, 0.012, 6, '#f1ebdd', 0.001);
  }
  for (const sx of [-1, 1]) m.tq(ID, [sx * 0.002, PT + 0.027, -0.066], [sx * 0.002, PT + 0.027, 0.066], [sx * 0.054, PT - 0.001, 0.066], [sx * 0.054, PT - 0.001, -0.066], ROOF, [sx, 1.8, 0]);

  // ---- Palazzi along both banks ---------------------------------------------------------------------
  const PAL = ['#d9a35b', '#b5523b', '#dc9c8c', '#e8d7b2', '#e08f6a', '#efe7d8', '#c97b5a', '#e3c08c', '#c9a27a'];
  const GLASS = '#2d3138', FR = '#f3eee4';
  const palazzo = (sx: number, z0: number, z1: number, h: number, k: number): void => {
    const zf = Math.max(Math.abs(z0), Math.abs(z1)), depth = Math.min(0.13, Math.sqrt(0.485 * 0.485 - zf * zf) - CW - 0.008);
    if (depth < 0.035) return;
    const w = z1 - z0, zc = (z0 + z1) / 2, col = PAL[k % PAL.length];
    const T = xform(sx * (CW + 0.006), 0, zc, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    house(m, T, 0, yQ, -depth / 2, w - 0.002, h, depth, col, k % 3 ? ROOF : '#a85a3a', 0.35);
    m.box(T, 0, yQ + h - 0.005, 0.001, w, 0.005, 0.004, FR);
    const nF = Math.max(2, Math.floor((h - 0.02) / 0.026)), nW = Math.max(2, Math.floor(w / 0.017));
    for (let f = 0; f < nF; f++) {
      const y = yQ + 0.018 + f * 0.026, nob = f === 1 && nW >= 4;
      for (let i = 0; i < nW; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / nW + (nob ? (i < nW / 2 ? 1 : -1) * 0.002 : 0);
        m.win(T, x, y, nob ? 0.0075 : 0.0065, nob ? 0.017 : 0.014, 0, GLASS, FR, k % 4 === 1 ? 'pointed' : 'arch');
      }
      if (nob) m.box(T, 0, y - 0.003, 0.003, w * 0.5, 0.0025, 0.006, FR);
    }
    m.win(T, 0, yQ, 0.014, 0.014, 0, '#3a3530', FR, 'arch');
    const yT = yQ + h;
    for (const cx of [-w * 0.3, w * 0.3]) {
      m.prism(T, cx, yT, -depth * 0.3, 0.0028, 0.016, 6, '#c9a68a');
      m.prism(T, cx, yT + 0.016, -depth * 0.3, 0.003, 0.008, 6, '#9e4a32', 0.0065);
    }
    // windows on the end and back faces
    const Te = xform(sx * (CW + 0.006 + depth / 2), 0, z1, 0), Tb = xform(sx * (CW + 0.006 + depth), 0, zc, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (let f = 0; f < nF; f++) {
      const y = yQ + 0.018 + f * 0.026;
      for (let i = 0; i < Math.floor(depth / 0.022); i++) m.win(Te, -depth / 2 + 0.012 + i * 0.022, y, 0.006, 0.013, 0, GLASS, undefined, 'rect');
      for (let i = 0; i < nW; i++) m.win(Tb, -w / 2 + ((i + 0.5) * w) / nW, y, 0.006, 0.013, 0, GLASS, undefined, 'rect');
    }
  };
  const BANK: [number, number, number, number][] = [
    [1, -0.46, -0.37, 0.1], [1, -0.37, -0.27, 0.15], [1, -0.27, -0.12, 0.13], [1, 0.11, 0.2, 0.12], [1, 0.2, 0.27, 0.15], [1, 0.27, 0.35, 0.11], [1, 0.35, 0.43, 0.13],
    [-1, -0.45, -0.36, 0.13], [-1, -0.36, -0.28, 0.1], [-1, -0.28, -0.19, 0.14], [-1, -0.19, -0.11, 0.11], [-1, 0.24, 0.31, 0.08], [-1, 0.31, 0.4, 0.07],
  ];
  BANK.forEach(([sx, z0, z1, h], k) => palazzo(sx, z0, z1, h * 0.85, k * 5 + 2));
  // Mooring poles, gondolas, vaporetto, café tables and people
  const POLE = [['#f3f0ea', '#2a4f8f'], ['#f3f0ea', '#b3322e'], ['#e9c64a', '#1f2a44']];
  for (let i = 0; i < 9; i++) {
    const sx = i % 2 ? 1 : -1, z = -0.4 + i * 0.09 + (Math.abs(-0.4 + i * 0.09) < 0.1 ? 0.2 : 0), pc = POLE[i % 3];
    for (let j = 0; j < 3; j++) {
      const x = sx * (CW - 0.012), zz = z + (j - 1) * 0.012;
      for (let b = 0; b < 4; b++) m.prism(ID, x, yW + b * 0.013, zz, 0.0022, 0.013, 6, pc[b % 2], 0.0022, 0, b === 3);
    }
  }
  const gondola = (x: number, z: number, ry: number, rower: boolean): void => {
    const T = xform(x, yW, z, ry), B = '#141619';
    m.box(T, 0, 0, 0, 0.009, 0.004, 0.05, B);
    m.beam(T([0, 0.003, 0.024]), T([0, 0.011, 0.036]), 0.004, B, 0.003);
    m.beam(T([0, 0.003, -0.024]), T([0, 0.009, -0.033]), 0.004, B, 0.003);
    m.box(T, 0, 0.009, 0.034, 0.0012, 0.008, 0.004, '#dcdcdc');
    m.box(T, 0, 0.004, 0.004, 0.007, 0.002, 0.012, '#8a2b2b');
    if (rower) { const q = T([0.001, 0, -0.02]); person(m, q[0], q[1] + 0.004, q[2], 2, 0.01); }
  };
  gondola(-0.09, 0.22, 0.12, true); gondola(0.06, 0.34, -0.2, true); gondola(0.12, -0.25, 0.05, true); gondola(-0.15, -0.3, 0.02, false); gondola(-0.165, -0.27, 0.0, false); gondola(0.16, 0.15, 3.1, false);
  const Tv = xform(0.03, yW, -0.38, 0.06);
  m.box(Tv, 0, 0, 0, 0.034, 0.008, 0.1, '#e8e8e4', true);
  m.box(Tv, 0, 0.008, -0.005, 0.028, 0.012, 0.06, '#f2f2ee');
  m.box(Tv, 0, 0.012, -0.005, 0.0285, 0.005, 0.058, '#3b4651');
  m.box(Tv, 0, 0.0, 0, 0.0345, 0.002, 0.1005, '#c9a43a');
  for (let i = 0; i < 4; i++) {
    const x = -0.26 - (i % 2) * 0.04, z = 0.13 + Math.floor(i / 2) * 0.05;
    m.prism(ID, x, yQ, z, 0.001, 0.02, 4, '#6b6b6b', 0.001, 0, false);
    m.prism(ID, x, yQ + 0.02, z, 0.017, 0.007, 8, i % 2 ? '#f2efe8' : '#a3392f', 0);
    m.prism(ID, x, yQ, z, 0.008, 0.008, 8, '#d9d3c6');
  }
  for (let i = 0; i < 26; i++) {
    const on = i < 12, x = on ? (hash3(i, 1, 2) - 0.5) * 0.56 : (i % 2 ? 1 : -1) * (0.23 + hash3(i, 3, 2) * 0.08), z = on ? (i % 2 ? 1 : -1) * (0.064 + hash3(i, 4, 1) * 0.004) : -0.08 + hash3(i, 5, 2) * 0.17;
    person(m, x, on ? yD(x) + 0.002 : yQ, z, i, 0.01);
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Alhambra (Granada), seen from the Albaicín: the long walled plateau of the Sabika hill above the wooded slopes
// and the Darro valley. Red-ochre crenellated curtain walls and towers; the Alcazaba with the Torre de la Vela
// (belfry and flags) at the west prow; the massive Torre de Comares over the Court of the Myrtles and its long
// pool; the Court of the Lions with its slender colonnade, pavilions and fountain; Charles V's square palace with
// its round courtyard; Santa María; the Partal; cypress-lined gardens; and the snowy Sierra Nevada behind.
const alhambra: Builder = (gp) => {
  const yB = 0.035, HP = 0.11, ZC = -0.02, AX = 0.42, yP = yB + HP, E = 0.965;
  const WL = '#b9704a', WL2 = '#c47e55', WL3 = '#a8633f', ROOF = '#b25a36', STO = '#d6bb93', STU = '#e6d7bc', VOID = '#3a2a22';
  const azf = (x: number): number => 0.17 - 0.06 * Math.min(1, (x / AX) ** 2);
  const dE = (x: number, z: number): number => Math.hypot(x / AX, (z - ZC) / azf(x));
  const riv = (x: number): number => 0.35 + 0.025 * Math.sin(x * 7 + 1);
  const hA = (x: number, z: number): number => {
    const d = dE(x, z);
    let h = HP * (1 - sstep(1, 1.6, d)) + 0.016 * (fbm(x * 18, 1, z * 18) - 0.5) * sstep(1, 1.2, d) * (1 - sstep(1.4, 1.75, d));
    const mz = sstep(-0.3, -0.47, z);
    if (mz > 0) h = Math.max(h, 0.17 * mz * (0.4 + 0.6 * ridged(x * 7 + 3, z * 3)) * (0.75 + 0.25 * Math.cos(x * 5)));
    return Math.max(0.002, h);
  };
  island(gp, 0.5, hA, '#8f8a5c', (x, y, z, _nx, ny) => {
    const d = dE(x, z), f = fbm(x * 30, 2, z * 30);
    if (z < -0.29 && y > yB + 0.03) {
      if (y > yB + 0.1 + 0.03 * f) return ny > 0.6 ? '#f2f4f6' : '#d9dfe6';
      if (y > yB + 0.055) return f > 0.5 ? '#8b7f72' : '#7b7065';
      return f > 0.5 ? '#5f6e45' : '#6b7650';
    }
    if (d < 0.985) return f > 0.62 ? '#6d8a45' : f > 0.45 ? '#c7a57a' : '#bf9b70';
    if (y > yB + 0.008) { if (ny < 0.6 && f > 0.58) return '#a86e4a'; return f > 0.55 ? '#3e6a33' : f > 0.42 ? '#4a7a3b' : '#355d2d'; }
    if (Math.abs(z - riv(x)) < 0.013) return '#5d8a87';
    return f > 0.5 ? '#9a9466' : '#8e8a5e';
  }, { rings: 30, segs: 110, side: strataSide(['#8a5a3c', '#7a4f35', '#9a6a48', '#6a4630']) });
  const m = new Mesh3();
  const yAt = (x: number, z: number): number => yB + hA(x, z);
  const C2 = (A: Xf, B: Xf): Xf => (v) => A(B(v));
  const zN = (x: number): number => ZC + E * azf(x) * Math.sqrt(Math.max(0, 1 - (x / (E * AX)) ** 2));
  const zS = (x: number): number => 2 * ZC - zN(x);
  const ryAt = (x: number, z: number): number => Math.atan2(x / (AX * AX), (z - ZC) / azf(x) ** 2);
  const crenel = (T: Xf, hx: number, hz: number, y: number, c: string): void => rect4(0, 0, hx, hz, (Tf, _i, al) => {
    const n = Math.max(2, Math.round((2 * al) / 0.011)), F = C2(T, Tf);
    for (let k = 0; k < n; k++) m.box(F, -al + ((k + 0.5) * 2 * al) / n, y, -0.002, 0.0042, 0.0055, 0.004, c);
  });
  const tower = (x: number, z: number, w: number, h: number, ry: number, c = WL2, wins = 1, d = w): Xf => {
    const T = xform(x, 0, z, ry), yb = yP - 0.05;
    m.box(T, 0, yb, 0, w, yP + h - yb, d, c);
    m.box(T, 0, yP + h, 0, w + 0.003, 0.0018, d + 0.003, shade(c, 1.06));
    crenel(T, w / 2 - 0.0005, d / 2 - 0.0005, yP + h + 0.0018, c);
    for (let k = 0; k < wins; k++) m.win(T, (k - (wins - 1) / 2) * w * 0.3, yP + h * 0.55, 0.0055, 0.011, d / 2, VOID, shade(c, 1.12));
    return T;
  };
  const wallRun = (T: Xf, L: number, hw: number, c: string): void => {
    m.box(T, 0, yP - 0.035, 0, L + 0.005, 0.035 + hw, 0.008, c);
    const n = Math.max(1, Math.round(L / 0.011));
    for (let k = 0; k < n; k++) m.box(T, -L / 2 + ((k + 0.5) * L) / n, yP + hw, 0.002, 0.0042, 0.0055, 0.004, c);
  };
  // curtain wall circuit with towers
  const NW = 48;
  for (let i = 0; i < NW; i++) {
    const th0 = (i / NW) * TAU, th1 = ((i + 1) / NW) * TAU;
    const ax = E * AX * Math.cos(th0), az = ZC + E * azf(ax) * Math.sin(th0), bx = E * AX * Math.cos(th1), bz = ZC + E * azf(bx) * Math.sin(th1);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az);
    let nx = (bz - az) / L, nz = -(bx - ax) / L;
    if (nx * mx + nz * (mz - ZC) < 0) { nx = -nx; nz = -nz; }
    wallRun(xform(mx, 0, mz, Math.atan2(nx, nz)), L, mz > ZC ? 0.028 : 0.022, i % 3 ? WL : WL3);
    const special = (Math.abs(ax - 0.03) < 0.07 && az > ZC) || ax > 0.22 || (Math.abs(ax + 0.15) < 0.04 && az > ZC);
    if (i % 3 === 0 && !special) tower(ax, az, 0.026, 0.038 + hash3(i, 3, 1) * 0.018, ryAt(ax, az), i % 2 ? WL2 : WL);
  }
  // Alcazaba: cross wall, Torre de la Vela, Torre del Homenaje, Torre Quebrada and the plaza de armas ruins
  const xa = 0.225;
  wallRun(xform(xa, 0, (zN(xa) + zS(xa)) / 2, Math.PI / 2), zN(xa) - zS(xa), 0.03, WL3);
  tower(xa, ZC + 0.02, 0.03, 0.045, Math.PI / 2, WL2);
  const vela = tower(0.345, 0.012, 0.055, 0.07, ryAt(0.345, 0.012) * 0.5, WL2, 3, 0.045);
  const yv = yP + 0.0728;
  m.arch(vela, 0, yv, 0.016, 0.018, 0.004, 0.009, 0, 0.012, STU);
  m.blob(vela, 0, yv + 0.007, 0, 0.003, 0.0035, 0.003, '#5b4a2e', 5);
  m.prism(vela, 0, yv + 0.018, 0, 0.012, 0.004, 4, ROOF, 0, Math.PI / 4);
  m.beam(vela([0.022, yv, 0.017]), vela([0.022, yv + 0.04, 0.017]), 0.0014, '#4a4038');
  [['#c8102e', 0.034], ['#f1bf00', 0.029], ['#c8102e', 0.024]].forEach(([c, y]) => m.box(vela, 0.034, yv + (y as number), 0.017, 0.022, 0.0052, 0.001, c as string));
  m.beam(vela([-0.022, yv, 0.017]), vela([-0.022, yv + 0.034, 0.017]), 0.0014, '#4a4038');
  [['#13854b', 0.028], ['#f8f8f2', 0.023], ['#13854b', 0.018]].forEach(([c, y]) => m.box(vela, -0.034, yv + (y as number), 0.017, 0.022, 0.0052, 0.001, c as string));
  tower(0.3, -0.07, 0.042, 0.085, ryAt(0.3, -0.07), WL, 2);
  tower(0.27, zN(0.27) - 0.012, 0.034, 0.066, ryAt(0.27, 0.07), WL3, 2);
  tower(0.37, -0.045, 0.03, 0.05, ryAt(0.37, -0.045), WL2);
  for (let i = 0; i < 4; i++) m.box(ID, 0.248 + i * 0.022, yP, 0.004, 0.0025, 0.007, 0.07, '#a87a52');
  for (let j = 0; j < 4; j++) m.box(ID, 0.282, yP, -0.03 + j * 0.022, 0.07, 0.007, 0.0025, '#a87a52');
  // Torre de Comares (north wall) over the Court of the Myrtles
  const MX = 0.03, MZ = 0.052;
  const cmz = zN(MX) - 0.024, cry = ryAt(MX, cmz);
  const com = tower(MX, cmz, 0.07, 0.1, cry, WL2, 3);
  for (let k = 0; k < 3; k++) m.win(com, (k - 1) * 0.021, yP + 0.03, 0.006, 0.012, 0.035, VOID, shade(WL2, 1.12));
  const comW = xform(MX, 0, cmz, cry - Math.PI / 2);
  for (let k = 0; k < 3; k++) { m.win(comW, (k - 1) * 0.021, yP + 0.055, 0.0055, 0.011, 0.035, VOID, shade(WL2, 1.12)); m.win(comW, (k - 1) * 0.021, yP + 0.03, 0.006, 0.012, 0.035, VOID, shade(WL2, 1.12)); }
  m.prism(com, 0, yP + 0.1018, 0, 0.036, 0.008, 4, ROOF, 0, Math.PI / 4);
  for (const sx of [-1, 1]) house(m, xform(MX + sx * 0.031, 0, MZ, Math.PI / 2), 0, yP, 0, 0.074, 0.022, 0.012, STO, ROOF, 0.5);
  house(m, ID, MX, yP, MZ - 0.043, 0.074, 0.028, 0.014, STO, ROOF, 0.5);
  for (let k = 0; k < 5; k++) m.win(ID, MX + (k - 2) * 0.012, yP + 0.003, 0.007, 0.016, MZ - 0.036, VOID, STU);
  m.plan(ID, rect(MX, MZ, 0.024, 0.036), yP, yP + 0.0012, '#e4d7bf');
  m.plan(ID, rect(MX, MZ - 0.002, 0.008, 0.031), yP, yP + 0.0018, '#3f8392');
  for (const sx of [-1, 1]) m.box(ID, MX + sx * 0.0125, yP, MZ - 0.002, 0.004, 0.005, 0.062, '#3f6a2f');
  // Court of the Lions
  const LX = -0.062, LZ = 0.058, LW = 0.068, LD = 0.044, wg = 0.013, hL = 0.02;
  for (const sz of [-1, 1]) house(m, ID, LX, yP, LZ + sz * (LD / 2 + wg / 2), LW + 2 * wg, hL, wg, STO, ROOF, 0.5);
  for (const sx of [-1, 1]) house(m, xform(LX + sx * (LW / 2 + wg / 2), 0, LZ, Math.PI / 2), 0, yP, 0, LD, hL, wg, STO, ROOF, 0.5);
  m.plan(ID, rect(LX, LZ, LW / 2, LD / 2), yP, yP + 0.0012, '#ddcdb0');
  const ix = LW / 2 - 0.004, iz = LD / 2 - 0.004;
  rect4(LX, LZ, ix, iz, (Tf, _i, al) => {
    const n = Math.round((2 * al) / 0.0075);
    for (let k = 0; k < n; k++) m.prism(Tf, -al + (k * 2 * al) / n, yP, 0, 0.0009, 0.012, 4, '#f1e9da', 0.0009, Math.PI / 4, false);
    m.box(Tf, 0, yP + 0.012, 0.002, 2 * al + 0.004, 0.004, 0.006, STU);
  });
  for (const sx of [-1, 1]) {
    m.box(ID, LX + sx * (ix - 0.005), yP, LZ, 0.012, 0.016, 0.016, STU);
    m.prism(ID, LX + sx * (ix - 0.005), yP + 0.016, LZ, 0.012, 0.011, 4, ROOF, 0, Math.PI / 4);
  }
  m.box(ID, LX, yP + 0.0012, LZ, LW - 0.012, 0.0006, 0.0018, '#4a8d9a');
  m.box(ID, LX, yP + 0.0012, LZ, 0.0018, 0.0006, LD - 0.008, '#4a8d9a');
  m.prism(ID, LX, yP, LZ, 0.0065, 0.003, 10, '#ece5d6');
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; m.blob(ID, LX + Math.cos(a) * 0.0058, yP + 0.0036, LZ + Math.sin(a) * 0.0058, 0.0014, 0.0016, 0.0014, '#e8dcc4', 4); }
  m.prism(ID, LX, yP + 0.003, LZ, 0.0012, 0.004, 5, '#ece5d6');
  m.prism(ID, LX, yP + 0.007, LZ, 0.004, 0.0015, 10, '#ece5d6', 0.0045);
  // other Nasrid palace roofs
  for (const [x, z, w, d, h] of [[0.088, 0.096, 0.036, 0.04, 0.024], [-0.012, -0.004, 0.05, 0.026, 0.02], [-0.11, 0.042, 0.03, 0.04, 0.018], [0.04, -0.005, 0.03, 0.022, 0.02], [-0.016, 0.105, 0.026, 0.024, 0.026]] as const) house(m, ID, x, yP, z, w, h, d, STO, ROOF, 0.45, 2, VOID);
  // Charles V palace with its round courtyard
  const PX = 0.125, PZ = -0.056, PS = 0.106, PH = 0.042, ri = 0.027, ti = 0.032;
  const pc = '#d9c19b';
  m.box(ID, PX, yP, PZ + (PS / 2 + ti) / 2, PS, PH, PS / 2 - ti, pc);
  m.box(ID, PX, yP, PZ - (PS / 2 + ti) / 2, PS, PH, PS / 2 - ti, pc);
  for (const sx of [-1, 1]) m.box(ID, PX + sx * (PS / 2 + ti) / 2, yP, PZ, PS / 2 - ti, PH, 2 * ti, pc);
  const NR = 16;
  for (let i = 0; i < NR; i++) {
    const a0 = (i / NR) * TAU, a1 = ((i + 1) / NR) * TAU;
    const sq = (a: number): V3 => { const k = ti / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); return [PX + Math.cos(a) * k, yP + PH + 0.0004, PZ + Math.sin(a) * k]; };
    const ci = (a: number): V3 => [PX + Math.cos(a) * ri, yP + PH + 0.0004, PZ + Math.sin(a) * ri];
    m.quad(ci(a0), ci(a1), sq(a1), sq(a0), shade(ROOF, 1.05), [0, 1, 0]);
  }
  m.rev(ID, PX, yP, PZ, [[ri, 0], [ri, PH]], 24, (i) => (i % 2 ? shade(pc, 0.85) : '#5d4a3a'), 0, true);
  m.plan(ID, Array.from({ length: 12 }, (_, i): [number, number] => [PX + Math.cos((i / 12) * TAU) * ri, PZ + Math.sin((i / 12) * TAU) * ri]), yP, yP + 0.001, '#cdbb98');
  rect4(PX, PZ, PS / 2, PS / 2, (Tf) => {
    m.box(Tf, 0, yP + PH * 0.48, 0.0004, PS, 0.0016, 0.002, shade(pc, 1.08));
    for (let k = 0; k < 7; k++) for (const [yy, hh] of [[0.008, 0.009], [0.028, 0.008]]) m.win(Tf, -PS / 2 + ((k + 0.5) * PS) / 7, yP + yy, 0.0045, hh, 0.0006, '#4a3a30', undefined, 'rect');
  });
  m.box(ID, PX, yP + PH, PZ + PS / 2 - 0.006, PS + 0.002, 0.0025, 0.012, shade(ROOF, 0.95));
  // Santa María church and bell tower, the Partal, the Parador
  house(m, ID, -0.03, yP, -0.065, 0.07, 0.034, 0.034, '#dccaa6', ROOF, 0.5, 4, VOID);
  m.box(ID, -0.073, yP, -0.05, 0.016, 0.06, 0.016, '#dccaa6');
  m.win(ID, -0.073, yP + 0.044, 0.006, 0.01, -0.042, VOID);
  m.prism(ID, -0.073, yP + 0.06, -0.05, 0.0125, 0.012, 4, ROOF, 0, Math.PI / 4);
  const dx = -0.15, damas = tower(dx, zN(dx) - 0.018, 0.04, 0.045, ryAt(dx, zN(dx)), WL2, 2);
  for (let k = 0; k < 5; k++) m.arch(damas, (k - 2) * 0.008, yP, 0.008, 0.016, 0.004, 0.0055, 0, 0.012, STU, 'arch', 6, true, true);
  m.plan(ID, rect(dx, zN(dx) - 0.07, 0.022, 0.016), yP, yP + 0.0016, '#3f8392');
  house(m, ID, -0.255, yP, -0.04, 0.06, 0.026, 0.03, '#efe7d6', ROOF, 0.5, 4, VOID);
  // gardens: cypress rows and orchards in the east half, woods on the slopes, Albaicín houses below
  for (let x = -0.36; x <= -0.13; x += 0.026) for (const z of [-0.095, 0.04]) cypress(m, x, yP, z, 0.036 + hash3(Math.round(x * 100), 4, 1) * 0.01);
  const TREES = ['#3b6a31', '#2f5a2a', '#4b7a3a', '#557f3f'];
  let t = 0;
  for (let gx = -0.5; gx <= 0.5; gx += 0.025) for (let gz = -0.31; gz <= 0.5; gz += 0.025) {
    const h1 = hash3(Math.round(gx * 400), 5, Math.round(gz * 400)), h2 = hash3(Math.round(gx * 400), 6, Math.round(gz * 400));
    const x = gx + (h1 - 0.5) * 0.02, z = gz + (h2 - 0.5) * 0.02;
    if (Math.hypot(x, z) > 0.47) continue;
    const d = dE(x, z), y = yAt(x, z);
    if (d > 1.05 && z > -0.3 && y > yB + 0.007 && h1 > 0.12) {
      const s = 0.012 + h2 * 0.007;
      m.blob(ID, x, y + s * 0.45, z, s, s * 0.9, s, TREES[t++ % 4], 5);
    } else if (d < 0.9 && x < -0.12 && x > -0.36 && z > -0.08 && z < 0.025 && !(x < -0.215 && z < -0.02) && h1 > 0.35) {
      leafTree(m, x, yP, z, 0.022, TREES[t++ % 4]);
    } else if (z > riv(x) + 0.03 && h1 > 0.6) {
      const k = Math.round(h2 * 10);
      house(m, xform(x, 0, z, (h2 - 0.5) * 0.6), 0, yB + 0.002, 0, 0.026 + h2 * 0.01, 0.014 + h1 * 0.006, 0.02, '#f1ece2', k % 3 ? '#b8643e' : '#a95a37', 0.5, 2, '#4a4a4a');
    } else if (z > riv(x) + 0.03 && h1 < 0.08) cypress(m, x, yB + 0.002, z, 0.03);
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Oia (Santorini): the caldera rim — red, black and ochre volcanic strata plunging to the deep Aegean — with the
// whitewashed village cascading down its upper slope: cubic houses and barrel-vaulted cave houses (a few in ochre
// and pink), roof pools, blue-domed churches with arched bell towers, the windmills on the ridge, and yachts,
// caiques and a catamaran in the caldera beside the dark rock islet.
const santorini: Builder = (gp) => {
  const yB = 0.035, HT = 0.25, WH = '#f5f3ee', BLUE = '#1f5cc4', SEA = '#1d4c8c';
  const CL = ['#7c3b2b', '#55443b', '#9c5038', '#3c302b', '#86664c', '#a8704f', '#6b4a3a'];
  const zE = (x: number): number => 0.07 + 0.3 * x * x + 0.03 * Math.sin(x * 6) + 0.012 * Math.sin(x * 15 + 1);
  const zEd = (x: number): number => 0.6 * x + 0.18 * Math.cos(x * 6) + 0.18 * Math.cos(x * 15 + 1);
  const hS = (x: number, z: number): number => {
    const s = z - zE(x), n = fbm(x * 16, 3, z * 16) - 0.5;
    const c0 = 0.004 + 0.02 * Math.sin(x * 13 + 0.5) + n * 0.025, c1 = c0 + 0.1 + 0.03 * Math.sin(x * 7);
    const h = HT - 0.12 * sstep(-0.22, 0.01, s) - 0.14 * sstep(c0, c1, s) + (s > c0 - 0.02 && s < c1 + 0.02 ? 0.03 * n + 0.012 * Math.sin(x * 37 + z * 9) : 0);
    return Math.max(0.0015, h);
  };
  island(gp, 0.5, hS, SEA, (x, y, z, _nx, ny) => {
    const s = z - zE(x), f = fbm(x * 30, 2, z * 30);
    if (y < yB + 0.004) { const hh = hash3(Math.floor(x * 45), 7, Math.floor(z * 45)); return s < 0.135 ? '#2d7896' : hh > 0.92 ? '#2f63a3' : SEA; }
    if (ny < 0.72 || s > 0.02) return CL[Math.abs(Math.floor((y - yB) * 34 + f * 1.6)) % CL.length];
    if (s > -0.215) return f > 0.55 ? '#e8e0d0' : '#ddd3bf';
    return f > 0.6 ? '#9b8d63' : f > 0.45 ? '#b8a27c' : '#a99372';
  }, { rings: 34, segs: 120, side: strataSide(CL) });
  const m = new Mesh3();
  const yAt = (x: number, z: number): number => yB + hS(x, z);
  const frame = (x: number, s: number): Xf => xform(x, 0, zE(x) + s, Math.atan2(-zEd(x), 1));
  const pane = (T: Xf, x: number, y: number, z: number, w: number, h: number, c: string): void => m.tq(T, [x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], c, [0, 0, 1]);
  const PAL = ['#e9b44f', '#e8a99b', '#f1d5a5', '#dccaa4', '#c8714c', '#f0e0c0'];
  const dome = (T: Xf, x: number, y: number, z: number, r: number, n = 14): void => {
    m.rev(T, x, y, z, [[r, 0], [r * 0.95, r * 0.32], [r * 0.8, r * 0.62], [r * 0.55, r * 0.85], [r * 0.28, r * 0.97], [0, r]], n, (_i, j) => shade(BLUE, 0.9 + j * 0.05));
    m.box(T, x, y + r, z, 0.0012, r * 0.6, 0.0012, '#f3ead2');
    m.box(T, x, y + r + r * 0.38, z, r * 0.36, 0.0011, 0.0011, '#f3ead2');
  };
  const C2 = (A: Xf, B: Xf): Xf => (v) => A(B(v));
  const belfry = (T: Xf, x: number, yb: number, z: number, hb: number, top: number): void => {
    const Tb = (v: V3): V3 => T([v[0] + x, v[1], v[2] + z]);
    m.box(Tb, 0, yb, 0, 2 * hb, top - yb, 2 * hb, WH);
    for (const [y0, sc] of [[top, 1], [top + hb * 2.4, 0.78]]) {
      const hh = hb * sc;
      rect4(0, 0, hh, hh, (Tf) => m.arch(C2(Tb, Tf), 0, y0, 2 * hh + 0.002, hh * 2.3, 0.0018, hh * 1.1, 0, hh * 1.7, WH, 'arch', 6, false, true, '#c9c3b6'));
      m.box(Tb, 0, y0 + hh * 2.3, 0, 2 * hh + 0.004, 0.0015, 2 * hh + 0.004, WH);
      m.box(Tb, 0, y0 + hh * 1.1, 0, 0.0012, hh * 1.2, 0.0012, '#7a5a2e');
      m.blob(Tb, 0, y0 + hh * 1.05, 0, hh * 0.32, hh * 0.38, hh * 0.32, '#8a6a2e', 5);
    }
    dome(Tb, 0, top + hb * 2.4 + hb * 0.78 * 2.3 + 0.0015, 0, hb * 0.85, 10);
  };
  const church = (x: number, s: number, sc: number, bell: number): [number, number] => {
    const T = frame(x, s), z = zE(x) + s, w = 0.042 * sc, d = 0.038 * sc;
    const yb = Math.min(yAt(x, z + d / 2), yAt(x, z - d / 2)) - 0.006, yt = yAt(x, z - d / 2) + 0.024 * sc;
    m.box(T, 0, yb, 0, w, yt - yb, d, WH);
    m.box(T, 0, yt, 0, w + 0.002, 0.0016, d + 0.002, WH);
    m.prism(T, 0, yt, 0, 0.0135 * sc, 0.009 * sc, 14, WH);
    for (let k = 0; k < 4; k++) m.win(T, Math.cos(k * 0.6 - 1) * 0.0125 * sc, yt + 0.002 * sc, 0.0028 * sc, 0.005 * sc, Math.sin(k * 0.6 + 0.6) * 0.0125 * sc - 0.002, '#2c4f8a');
    dome(T, 0, yt + 0.009 * sc, 0, 0.0145 * sc);
    m.win(T, 0, yt - 0.02 * sc, 0.007 * sc, 0.013 * sc, d / 2, '#3d5f9a', '#ffffff');
    for (const sx of [-1, 1]) m.win(T, sx * 0.013 * sc, yt - 0.011 * sc, 0.004 * sc, 0.007 * sc, d / 2, '#2c4f8a');
    if (bell) belfry(T, bell * (w / 2 + 0.008 * sc), yb, d * 0.2, 0.0075 * sc, yt - 0.004);
    return [x, z];
  };
  const spots = [church(-0.1, -0.05, 1.4, 1), church(0.08, -0.12, 1.45, -1), church(0.25, -0.045, 1.25, 1), church(-0.28, -0.14, 1.2, 0)];
  const belT = frame(0.0, -0.035), bz = zE(0) - 0.035;
  belfry(belT, 0, yAt(0, bz + 0.01) - 0.004, 0, 0.008, yAt(0, bz - 0.01) + 0.012);
  spots.push([0, bz]);
  // cascading houses
  let k = 0;
  for (let row = 0; row < 12; row++) {
    const s0 = row < 9 ? -0.2 + row * 0.024 : -0.27 - (row - 9) * 0.05, sparse = row >= 9;
    for (let x = -0.47 + (row % 2) * 0.017; x < 0.47; x += 0.034) {
      k++;
      const h1 = hash3(k, 1, row), h2 = hash3(k, 2, row), h3 = hash3(k, 3, row);
      const xx = x + (h1 - 0.5) * 0.012, s = s0 + (h2 - 0.5) * 0.008, z = zE(xx) + s;
      if (Math.hypot(xx, z) > 0.46 || h1 < 0.1 || (sparse && h3 < 0.55)) continue;
      if (spots.some(([cx, cz]) => Math.hypot(cx - xx, cz - z) < 0.045)) continue;
      const w = 0.022 + h3 * 0.013, d = 0.02 + h2 * 0.006, hh = 0.013 + h1 * 0.012;
      const T = frame(xx, s), yF = yAt(xx, z + d / 2), yK = yAt(xx, z - d / 2);
      const y0 = Math.min(yF, yK) - 0.006, y1 = Math.max(yF, yK) + hh;
      const col = h3 > 0.82 ? PAL[k % PAL.length] : h3 > 0.74 ? '#ebe6dc' : WH;
      m.box(T, 0, y0, 0, w, y1 - y0, d, col);
      const fz = d / 2 + 0.0005;
      pane(T, -w * 0.22, yF, fz, 0.0055, 0.0105, h2 > 0.5 ? '#2c5ea8' : '#5b4636');
      pane(T, w * 0.2, yF + 0.004, fz, 0.0055, 0.0055, '#3a3f48');
      if (y1 - yF > 0.03) pane(T, 0, y1 - 0.012, fz, 0.006, 0.0065, '#3a3f48');
      if (h2 > 0.72) {
        const rw = w * 0.46, P: [number, number][] = [];
        for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; P.push([-Math.cos(a) * rw, y1 + Math.sin(a) * rw * 0.75]); }
        m.poly(T, P, -d / 2, d / 2, col);
      } else {
        m.box(T, 0, y1, 0, w + 0.0012, 0.0012, d + 0.0012, shade(col, 1.03));
        if (h1 > 0.9) m.plan(T, rect(0, 0.002, w * 0.3, d * 0.25), y1, y1 + 0.0016, '#45c4cf');
        else if (h1 < 0.22) m.box(T, w * 0.3, y1, -d * 0.2, 0.004, 0.006, 0.004, col);
      }
    }
  }
  // windmills on the ridge
  for (const [x, s] of [[-0.36, -0.235], [0.39, -0.24]]) {
    const z = zE(x) + s, y0 = yAt(x, z) - 0.003;
    m.prism(ID, x, y0, z, 0.016, 0.036, 10, WH);
    m.prism(ID, x, y0 + 0.036, z, 0.0175, 0.014, 10, '#7b5a3a', 0);
    const dx = -0.5, dz = 0.866, H: V3 = [x + dx * 0.018, y0 + 0.03, z + dz * 0.018];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, q = (r: number, da = 0): V3 => [H[0] + dz * Math.cos(a + da) * r, H[1] + Math.sin(a + da) * r, H[2] - dx * Math.cos(a + da) * r];
      m.beam(H, q(0.032), 0.0012, '#6b4f35');
      for (const sg of [1, -1]) m.tri(q(0.009), q(0.032), q(0.027, 0.35), '#f3efe4', [dx * sg, 0, dz * sg]);
    }
    m.box(ID, H[0], H[1] - 0.002, H[2], 0.004, 0.004, 0.004, '#6b4f35');
  }
  // the caldera: rock islet, catamaran, yachts and caiques
  m.blob(ID, 0.13, yB - 0.004, 0.37, 0.035, 0.022, 0.024, '#4a3c34', 7);
  m.blob(ID, 0.17, yB - 0.002, 0.39, 0.016, 0.012, 0.014, '#5a463a', 6);
  const yW = yB + 0.0015;
  const boat = (x: number, z: number, ry: number, L: number, c: string, kind: number): void => {
    const T = xform(x, 0, z, ry), w = L * 0.17;
    const hull = (ox: number, ww: number): void => m.plan(T, [[ox - ww, -L / 2], [ox + ww, -L / 2], [ox + ww, L * 0.22], [ox, L / 2], [ox - ww, L * 0.22]], yW - 0.001, yW + L * 0.12, c);
    if (kind === 2) {
      for (const sx of [-1, 1]) hull(sx * w * 1.3, w * 0.5);
      m.box(T, 0, yW + L * 0.1, -L * 0.05, w * 3.2, L * 0.05, L * 0.6, '#f4f4f2');
      m.beam(T([0, yW + L * 0.15, 0.0]), T([0, yW + L * 1.3, 0.0]), 0.0012, '#dddddd');
      m.tri(T([0, yW + L * 0.2, 0.003]), T([0, yW + L * 1.25, 0.002]), T([0, yW + L * 0.2, -L * 0.42]), '#f7f5ee', dirOf(T, [1, 0, 0]));
      m.tri(T([0, yW + L * 0.2, 0.003]), T([0, yW + L * 1.25, 0.002]), T([0, yW + L * 0.2, -L * 0.42]), '#e9e6dd', dirOf(T, [-1, 0, 0]));
    } else {
      hull(0, w);
      m.box(T, 0, yW + L * 0.12, -L * 0.08, w * 1.2, L * 0.1, L * 0.35, kind === 1 ? '#f4f4f2' : '#e0c35a');
      if (kind === 1) { m.beam(T([0, yW + L * 0.1, L * 0.08]), T([0, yW + L * 1.1, L * 0.08]), 0.001, '#dddddd'); m.tri(T([0, yW + L * 0.2, L * 0.1]), T([0, yW + L * 1.05, L * 0.09]), T([0, yW + L * 0.2, -L * 0.38]), '#f7f5ee', dirOf(T, [-1, 0, 0])); }
    }
    m.plan(T, rect(0, -L * 0.85, w * 0.6, L * 0.35), yW - 0.0005, yW + 0.0003, '#9cc4dc');
  };
  boat(-0.2, 0.36, 0.5, 0.05, '#f4f4f2', 2);
  boat(-0.33, 0.24, -0.3, 0.036, '#f4f4f2', 1);
  boat(0.28, 0.33, 2.2, 0.03, '#ffffff', 0);
  boat(0.02, 0.44, 1.2, 0.026, '#2d6fb5', 0);
  boat(-0.06, 0.27, -1.1, 0.022, '#c9472f', 0);
  m.build(gp);
};

export const EUROPE2: Record<string, Builder> = { arcdetriomphe, montsaintmichel, stpeters, rialto, alhambra, cologne, santorini, atomium };
