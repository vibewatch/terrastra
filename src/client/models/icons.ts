import * as THREE from 'three';
import {
  type Builder, type V3, mat, box, cyl, ellip, rbox, rod, skin, sweep, lathe, prism, gable, slab, tube,
  shade, mix, fbm, hash3,
} from './prims.ts';
import { pblob } from './animals.ts';
import { type HFn, island, sstep, ridged, ripple, strataSide, EARTH, scatter, onGround, pine } from './nature.ts';

// Hero landmarks rebuilt as sculpted scale models: lofted statues, Y-plan supertall towers and rock-cut facades,
// each sitting on its real-world terrain. Front is +z, base at y=0.

/** Y / trefoil floor plan: three rounded wings of length L[k] and half-width w around a core. */
function yPlan(L: [number, number, number], w: number, rot = 0, arc = 5): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < 3; k++) {
    const th = rot + (k * Math.PI * 2) / 3, dx = Math.cos(th), dz = Math.sin(th), Lk = Math.max(L[k], w * 1.2);
    for (let i = 0; i <= arc; i++) {
      const a = th - Math.PI / 2 + (i / arc) * Math.PI;
      out.push([dx * Lk + Math.cos(a) * w, dz * Lk + Math.sin(a) * w]);
    }
    const ca = th + Math.PI / 3, rc = w / Math.sin(Math.PI / 3);
    out.push([Math.cos(ca) * rc, Math.sin(ca) * rc]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
const redeemer: Builder = (gp, r) => {
  const c = r.color!;
  // Corcovado: forested granite pinnacle above Rio, Tijuca rainforest on the flanks, Guanabara Bay at its foot
  const PK = 0.42;
  const hf: HFn = (x, z) => {
    const rr = Math.hypot(x * 1.1, z + 0.02);
    let y = PK * Math.pow(Math.max(0, 1 - rr / 0.42), 1.35) + 0.04 * ridged(x * 7, z * 7) * sstep(0.05, 0.3, rr);
    y = Math.min(y, PK - 0.005);
    const bay = sstep(0.32, 0.44, z + Math.sin(x * 6) * 0.03);
    return Math.max(0.004, y * (1 - bay) + 0.015 * (1 - bay));
  };
  island(gp, 0.5, hf, '#3f6b3a', (x, y, z, _nx, ny) => {
    const t = y - 0.035;
    if (t < 0.008 && ny > 0.97) return ripple('#2b7fae')(x, y, z, 0, 1, 0);
    if (t > PK - 0.02 && ny > 0.9) return '#cfc8b8';
    if (ny < 0.62 || (t > 0.28 && ny < 0.8)) return fbm(x * 30, y * 30, z * 30) > 0.55 ? '#6b7280' : '#8a8f98';
    if (t < 0.03) return hash3(Math.floor(x * 70), 0, Math.floor(z * 70)) > 0.6 ? '#e5e0d4' : '#c9b8a0';
    return fbm(x * 16, y * 16, z * 16) > 0.55 ? '#2f5a2e' : '#3f6b3a';
  }, { rings: 48, segs: 104, side: strataSide(EARTH) });
  const gy = onGround(hf);
  scatter(22, 61, (x, z) => { const h = hf(x, z); if (h > 0.05 && h < 0.26) pine(gp, x, gy(x, z), z, 0.05, '#2f6a3a'); }, 0.4);
  // City blocks along the bay shore
  for (let i = 0; i < 12; i++) { const x = -0.36 + i * 0.065, z = 0.3 + hash3(i, 5, 1) * 0.04; if (hf(x, z) < 0.03) rbox(gp, hash3(i, 5, 2) > 0.5 ? '#f1f5f9' : '#e2d6c2', x, 0.04, z, 0.035, 0.03 + hash3(i, 5, 3) * 0.06, 0.03, 0.003); }
  // Art Deco pedestal & chapel
  const Y = 0.035 + PK - 0.008;
  const oct = (rad: number): [number, number][] => Array.from({ length: 8 }, (_, i) => [Math.cos((i + 0.5) * Math.PI / 4) * rad, Math.sin((i + 0.5) * Math.PI / 4) * rad]);
  prism(gp, oct(0.085), Y, 0.02, '#d6d0c2', 0.003);
  prism(gp, oct(0.065), Y + 0.02, 0.016, '#e2dccd', 0.003);
  prism(gp, oct(0.05), Y + 0.036, 0.07, '#ebe6d9', 0.003);
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; box(gp, '#d8d2c4', Math.cos(a) * 0.05, Y + 0.04, Math.sin(a) * 0.05, 0.008, 0.06, 0.008, -a); }
  // Statue: flared robe with folds, draped sleeves on outstretched arms, bowed head
  const S = Y + 0.106;
  const robe = lathe(gp, [[0.04, 0], [0.043, 0.012], [0.038, 0.08], [0.033, 0.16], [0.034, 0.21], [0.04, 0.245], [0.042, 0.26], [0.03, 0.272], [0, 0.274]], c, 0, S, 0, 24);
  robe.scale.z = 0.72;
  for (let i = 0; i < 7; i++) { const x = -0.03 + i * 0.01; rod(gp, [x, S + 0.005, 0.03 - Math.abs(x) * 0.25], [x * 0.8, S + 0.15, 0.024 - Math.abs(x) * 0.2], 0.0028, shade(c, 0.93), 4); }
  ellip(gp, shade(c, 0.95), 0, S + 0.17, 0.02, 0.012, 0.014, 0.006);
  const arm = (sx: number): { p: V3; w: number; h: number }[] => [
    { p: [0, S + 0.255, 0], w: 0.028, h: 0.022 },
    { p: [sx * 0.07, S + 0.252, 0], w: 0.02, h: 0.026 },
    { p: [sx * 0.13, S + 0.248, 0], w: 0.016, h: 0.022 },
    { p: [sx * 0.175, S + 0.25, 0.002], w: 0.012, h: 0.014 },
    { p: [sx * 0.2, S + 0.252, 0.004], w: 0.008, h: 0.009 },
  ];
  sweep(gp, [...arm(-1).reverse(), ...arm(1).slice(1)], c, { radial: 16, sub: 4 });
  for (const sx of [-1, 1]) {
    // Sleeve drape hanging under each forearm
    slab(gp, [[sx * 0.04, 0], [sx * 0.12, 0], [sx * 0.11, -0.016], [sx * 0.06, -0.03]], 0.012, shade(c, 0.97), 0.003, false).position.set(0, S + 0.242, -0.006);
    ellip(gp, c, sx * 0.212, S + 0.252, 0.004, 0.012, 0.016, 0.007);
  }
  rod(gp, [0, S + 0.27, 0], [0, S + 0.29, 0.004], 0.011, c, 10);
  pblob(gp, c, 0, S + 0.31, 0.008, 0.022, 0.027, 0.023, undefined, [0.25, 0, 0], 18);
  ellip(gp, shade(c, 0.94), 0, S + 0.314, -0.006, 0.024, 0.028, 0.02);
  ellip(gp, shade(c, 0.94), 0, S + 0.296, 0.022, 0.012, 0.012, 0.008);
};

// ---------------------------------------------------------------------------------------------------------
const burj: Builder = (gp, r) => {
  const c = r.color!;
  // Downtown Dubai: Burj Lake with the fountain, plaza podium, then the buttressed Y-core spiralling up in setbacks
  const hf: HFn = (x, z) => {
    const lake = 1 - ((x - 0.05) / 0.36) ** 2 - ((z - 0.22) / 0.16) ** 2;
    return lake > 0 ? 0.002 : 0.012 + 0.002 * fbm(x * 30, 0, z * 30);
  };
  island(gp, 0.5, hf, '#e2d3b5', (x, y, z, _nx, ny) => {
    if (y < 0.04 && ny > 0.97) return ripple('#1d8fc4')(x, y, z, 0, 1, 0);
    return (Math.floor(x * 40) + Math.floor(z * 40)) % 2 ? '#e8dcc2' : '#ddcfb2';
  }, { rings: 36, segs: 96, side: () => '#c8b48f' });
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = -0.25 + t * 0.6, z = 0.22 + Math.sin(t * Math.PI * 2) * 0.05;
    cyl(gp, '#e0f2fe', x, 0.037, z, 0.006, 0.04 + Math.sin(t * Math.PI) * 0.06, 6).material = mat('#e0f2fe', { transparent: 0.75, emissive: '#7dd3fc' });
  }
  for (const [x, z] of [[-0.34, -0.1], [-0.3, 0.05], [0.34, -0.12], [0.3, 0.02], [-0.22, -0.3], [0.2, -0.32]] as const) {
    rod(gp, [x, 0.047, z], [x + 0.01, 0.11, z], 0.004, '#8a6a45', 5);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const l = slab(gp, [[0, 0], [0.03, 0.006], [0.05, -0.008], [0.025, -0.004]], 0.003, '#3f7a3a'); l.position.set(x + 0.01, 0.11, z); l.rotation.set(0, a, -0.3); }
  }
  // Podium
  prism(gp, yPlan([0.16, 0.16, 0.16], 0.07, Math.PI / 2), 0.047, 0.03, '#cbd5e1', 0.004);
  prism(gp, yPlan([0.13, 0.13, 0.13], 0.06, Math.PI / 2), 0.077, 0.02, '#94a3b8', 0.003);
  // Tower: 3 wings set back in a spiral, each tier a glazed band with a light spandrel cap
  const N = 21, base = 0.097, H = 1.06, w0 = 0.042;
  let y = base, Ls: [number, number, number] = [0.13, 0.13, 0.13];
  for (let i = 0; i < N; i++) {
    const t = i / N, th = H * (0.07 - t * 0.03);
    const k = i % 3;
    if (i > 0) Ls = Ls.map((L, j) => (j === k ? Math.max(0.03, L * (0.9 - t * 0.05)) : L)) as [number, number, number];
    const w = w0 * (1 - t * 0.55);
    prism(gp, yPlan(Ls, w, Math.PI / 2), y, th, mix(c, '#5b7590', 0.25 + (i % 2) * 0.08), 0.002);
    prism(gp, yPlan(Ls.map(L => L * 1.01) as [number, number, number], w * 1.04, Math.PI / 2), y + th - 0.004, 0.004, '#e2e8f0');
    y += th;
  }
  // Pinnacle: tapering spire with a maintenance ring
  lathe(gp, [[0.022, 0], [0.018, 0.08], [0.012, 0.16], [0.006, 0.24], [0.002, 0.3], [0, 0.31]], '#e2e8f0', 0, y, 0, 12);
  cyl(gp, '#94a3b8', 0, y + 0.1, 0, 0.017, 0.006, 12);
};

// ---------------------------------------------------------------------------------------------------------
const cnTower: Builder = (gp, r) => {
  const c = r.color!;
  // Toronto harbourfront: Lake Ontario, Rogers Centre dome, the tower's hexagonal Y-shaft, SkyPod & antenna mast
  const hf: HFn = (_x, z) => (z > 0.22 ? 0.002 : 0.012 + 0.002 * fbm(_x * 30, 0, z * 30));
  island(gp, 0.5, hf, '#9aa3ad', (x, y, z, _nx, ny) => {
    if (y < 0.04 && ny > 0.97) return ripple('#2c6f99')(x, y, z, 0, 1, 0);
    return hash3(Math.floor(x * 50), 0, Math.floor(z * 50)) > 0.85 ? '#5f8a4a' : (Math.floor(x * 30) + Math.floor(z * 30)) % 2 ? '#a3acb6' : '#959ea8';
  }, { rings: 36, segs: 96, side: () => '#6b7280' });
  // Rogers Centre
  cyl(gp, '#d1d5db', 0.26, 0.047, -0.08, 0.15, 0.04, 28);
  const dome = lathe(gp, Array.from({ length: 9 }, (_, i) => [0.15 * Math.cos((i / 8) * Math.PI / 2), 0.07 * Math.sin((i / 8) * Math.PI / 2)] as [number, number]), '#f1f5f9', 0.26, 0.087, -0.08, 28);
  dome.material = mat('#f1f5f9', { flat: false });
  for (let i = 0; i < 4; i++) rod(gp, [0.26 - 0.15, 0.087, -0.08 + (i - 1.5) * 0.06], [0.26 + 0.15, 0.087, -0.08 + (i - 1.5) * 0.06], 0.003, '#94a3b8');
  for (let i = 0; i < 6; i++) rbox(gp, '#64748b', -0.34 + (i % 3) * 0.08, 0.047, -0.25 + Math.floor(i / 3) * 0.09, 0.05, 0.08 + hash3(i, 2, 1) * 0.12, 0.05, 0.003);
  // Shaft: Y cross-section lofted from wide buttressed base to the slim upper column
  const cx = -0.06, cz = 0.02, B0 = 0.047;
  const rings: V3[][] = [];
  const heights = [0, 0.05, 0.12, 0.22, 0.34, 0.48, 0.6, 0.66];
  for (const hy of heights) {
    const t = hy / 0.66, Lw = 0.13 * Math.pow(1 - t, 1.6) + 0.032, w = 0.026 * (1 - t * 0.35);
    rings.push(yPlan([Lw, Lw, Lw], w, Math.PI / 2, 4).map(([x, z]) => [cx + x, B0 + hy, cz + z] as V3));
  }
  skin(gp, rings, c, { caps: true, paint: (x, y, z, nx, _ny, nz) => (Math.abs(Math.atan2(nz, nx)) % 0.6 < 0.04 ? shade(c, 0.85) : null) });
  // Main pod: lower ring, glazed band, white upper drum, then the 360 restaurant lip
  const PY = B0 + 0.66;
  lathe(gp, [[0.03, 0], [0.09, 0.02], [0.1, 0.04]], '#e5e7eb', cx, PY - 0.04, cz, 28);
  cyl(gp, '#1e3a5f', cx, PY, cz, 0.1, 0.035, 28).material = mat('#1e3a5f', { metal: 0.6, rough: 0.2 });
  cyl(gp, '#f1f5f9', cx, PY + 0.035, cz, 0.104, 0.012, 28);
  lathe(gp, [[0.096, 0], [0.085, 0.03], [0.04, 0.05], [0.03, 0.055]], '#e5e7eb', cx, PY + 0.047, cz, 28);
  cyl(gp, '#1e293b', cx, PY + 0.013, cz, 0.107, 0.003, 28);
  // Upper column, SkyPod & banded antenna
  cyl(gp, c, cx, PY + 0.1, cz, 0.018, 0.2, 14);
  cyl(gp, '#f1f5f9', cx, PY + 0.29, cz, 0.032, 0.025, 18);
  cyl(gp, '#1e3a5f', cx, PY + 0.299, cz, 0.033, 0.008, 18);
  const AY = PY + 0.315;
  lathe(gp, [[0.012, 0], [0.01, 0.1], [0.006, 0.22], [0.002, 0.3], [0, 0.31]], '#f8fafc', cx, AY, cz, 10);
  for (let i = 0; i < 5; i++) cyl(gp, '#dc2626', cx, AY + 0.03 + i * 0.055, cz, 0.012 - i * 0.0018, 0.02, 10);
  ellip(gp, '#ef4444', cx, AY + 0.31, cz, 0.006).material = mat('#ef4444', { emissive: '#ef4444' });
};

// ---------------------------------------------------------------------------------------------------------
const petra: Builder = (gp, r) => {
  const c = r.color!;
  // Al-Khazneh: a two-storey Hellenistic facade cut into a rose-red cliff at the mouth of the Siq gorge
  const CL = 0.82;
  const zc = (x: number) => -0.06 + 0.16 * sstep(0.2, 0.28, Math.abs(x)) + 0.02 * Math.sin(x * 9);
  const hf: HFn = (x, z) => {
    const face = sstep(zc(x) - 0.04, zc(x) - 0.09, z);
    const siq = Math.exp(-(((x - 0.36) / 0.035) ** 2)) * sstep(0.05, 0.12, z);
    const top = CL * (0.92 + 0.12 * ridged(x * 4, z * 4)) * (1 - siq * 0.9);
    return 0.01 + 0.006 * fbm(x * 30, 0, z * 30) + (top - 0.01) * face + 0.02 * fbm(x * 9, 3, z * 9) * face;
  };
  const band = (y: number, x: number, z: number) => {
    const v = Math.sin(y * 70 + fbm(x * 6, y * 4, z * 6) * 7);
    return v > 0.6 ? '#c46a4e' : v > 0.1 ? '#d88a68' : v > -0.4 ? '#b8584a' : '#e0a080';
  };
  island(gp, 0.5, hf, '#d9a27a', (x, y, z, _nx, ny) => (ny > 0.85 && y < 0.08 ? mix('#dcae86', '#c99470', fbm(x * 14, 0, z * 14)) : band(y, x, z)), {
    rings: 54, segs: 120, side: strataSide(['#b8584a', '#c46a4e', '#a04a3e']),
  });
  // Banded sandstone curtain wall in front of the steep heightfield face. Rows sit at uniform heights so both
  // triangles of a quad land in the same stratum (no sawtooth).
  const DY = 0.02, plateau = (x: number) => 0.035 + hf(x, zc(x) - 0.12);
  const rows: V3[][] = [];
  for (let i = 0; 0.04 + (i - 1) * DY < 0.035 + CL * 1.1; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= 64; j++) {
      const x = -0.47 + (j / 64) * 0.94, top = plateau(x), y = Math.min(0.04 + i * DY, top), t = (y - 0.04) / Math.max(0.01, top - 0.04);
      const n = fbm(x * 14, y * 10, 1.7);
      row.push([x + (n - 0.5) * 0.008, y, zc(x) + 0.005 - 0.035 * t + (n - 0.5) * 0.02]);
    }
    rows.push(row);
  }
  rows.push(rows[rows.length - 1].map(([x, y]) => [x, y, zc(x) - 0.1] as V3));
  skin(gp, rows, '#c46a4e', { closed: false, flat: true, inward: true, paint: (x, y, _z, _nx, ny) => {
    if (ny > 0.7) return '#d88a68';
    const i = Math.floor((y - 0.04) / DY);
    const v = Math.sin(i * 0.95 + Math.sin(x * 3) * 0.5 + fbm(x * 2, i * 0.3, 0.5) * 1.2);
    return v > 0.55 ? '#c46a4e' : v > 0.05 ? '#d88a68' : v > -0.5 ? '#b8584a' : '#e0a080';
  } });
  // Facade (sits in the recess, carved colour slightly paler than the cliff)
  const F = shade(c, 1.08), Fd = shade(c, 0.9), z0 = zc(0) + 0.012, Y0 = 0.045;
  box(gp, Fd, 0, Y0 - 0.01, z0 + 0.02, 0.44, 0.02, 0.06);
  box(gp, '#3b1d17', 0, Y0, z0 - 0.004, 0.09, 0.16, 0.012);
  for (let i = 0; i < 6; i++) {
    const x = -0.2 + i * 0.08;
    if (i === 2 || i === 3) continue;
    lathe(gp, [[0.017, 0], [0.019, 0.006], [0.015, 0.012], [0.015, 0.25], [0.021, 0.27], [0.024, 0.285]], F, x, Y0, z0 + 0.03, 12);
  }
  for (const x of [-0.04, 0.04]) lathe(gp, [[0.017, 0], [0.019, 0.006], [0.015, 0.012], [0.015, 0.25], [0.021, 0.27], [0.024, 0.285]], F, x, Y0, z0 + 0.04, 12);
  rbox(gp, F, 0, Y0 + 0.285, z0 + 0.03, 0.46, 0.04, 0.05, 0.003);
  box(gp, Fd, 0, Y0 + 0.297, z0 + 0.056, 0.44, 0.012, 0.004);
  gable(gp, 0.06, 0.06, 0.2, F, 0, Y0 + 0.325, z0 + 0.04, Math.PI / 2);
  // Upper storey: broken-pediment pavilions + central tholos with conical roof and urn
  const U = Y0 + 0.39;
  for (const sx of [-1, 1]) {
    const px = sx * 0.15;
    for (const dx of [-0.04, 0.04]) lathe(gp, [[0.013, 0], [0.012, 0.2], [0.017, 0.215], [0.019, 0.225]], F, px + dx, U, z0 + 0.028, 10);
    rbox(gp, F, px, U + 0.225, z0 + 0.026, 0.12, 0.03, 0.04, 0.003);
    const hp = slab(gp, [[0, 0], [sx * -0.06, 0], [0, 0.05]], 0.04, F, 0.002, false);
    hp.position.set(px + sx * 0.06, U + 0.255, z0 + 0.026);
  }
  for (let i = 0; i < 6; i++) { const a = -Math.PI * 0.5 + (i / 5) * Math.PI; lathe(gp, [[0.012, 0], [0.011, 0.2], [0.016, 0.215], [0.017, 0.225]], F, Math.sin(a) * 0.06, U, z0 + 0.03 + Math.cos(a) * 0.04, 10); }
  cyl(gp, Fd, 0, U, z0 + 0.03, 0.05, 0.225, 18);
  cyl(gp, F, 0, U + 0.225, z0 + 0.03, 0.068, 0.025, 18);
  lathe(gp, [[0.064, 0], [0.04, 0.05], [0.01, 0.075], [0, 0.08]], F, 0, U + 0.25, z0 + 0.03, 18);
  lathe(gp, [[0.006, 0], [0.018, 0.012], [0.022, 0.03], [0.012, 0.05], [0.016, 0.06], [0, 0.064]], shade(F, 1.06), 0, U + 0.33, z0 + 0.03, 12);
  // Camel & handler for scale
  const cm = new THREE.Group(); cm.position.set(0.12, 0.016, 0.22); cm.rotation.y = -0.7; gp.add(cm);
  pblob(cm, '#c8a273', 0, 0.075, 0, 0.03, 0.026, 0.05, undefined, [0, 0, 0], 14);
  pblob(cm, '#bf9666', 0, 0.105, -0.005, 0.02, 0.022, 0.026, undefined, [0, 0, 0], 12);
  sweep(cm, [{ p: [0, 0.08, 0.04], w: 0.012 }, { p: [0, 0.11, 0.07], w: 0.009 }, { p: [0, 0.13, 0.075], w: 0.008 }], '#c8a273', { radial: 10, sub: 4 });
  ellip(cm, '#bf9666', 0, 0.132, 0.088, 0.008, 0.008, 0.016);
  for (const [x, z] of [[-0.015, -0.035], [0.015, -0.035], [-0.015, 0.035], [0.015, 0.035]] as const) tube(cm, [[x, 0.06, z], [x, 0.0, z]], 0.005, 0.004, '#b08a5a');
  rbox(gp, '#1e3a8a', 0.2, 0.016, 0.24, 0.016, 0.05, 0.012, 0.004);
  ellip(gp, '#f8fafc', 0.2, 0.074, 0.24, 0.009);
};

export const ICON_BUILDERS = { redeemer, burj, cnTower, petra };
