import { human, soupOf } from '../human.ts';
import { type Builder, type V3, add, mat, mix, fbm, hash3, SPH } from '../prims.ts';
import { island, strataSide, EARTH } from '../nature.ts';
import { shade, type Xf, xform, ID, dirOf, Mesh3, rect4, person, car, leafTree, house, pinnacle } from '../kit/euro.ts';

// Hero builders for: notredame, charlesbridge, trevi, hallgrimskirkja, londoneye.
// Keyed by catalogue item key (recipe.hero). Front faces +z, base at y=0, footprint radius ≈0.5.
// Each is a scale-model diorama: correct silhouette first, then the signature details from reference photos.

const TAU = Math.PI * 2;

/** Calm river/basin water: mostly flat with sparse glints and soft current streaks. */
const calm = (c: string) => (x: number, _y: number, z: number): string => {
  const h = hash3(Math.floor(x * 80), 3, Math.floor(z * 80));
  return h > 0.95 ? mix(c, '#e2f3f5', 0.35) : h < 0.12 ? shade(c, 0.95) : fbm(x * 14, 1, z * 14, 2) > 0.62 ? shade(c, 1.06) : c;
};
/** Convex polygon [x,z] of the disc (radius R, n segments) clipped to the box x∈[x0,x1], z∈[z0,z1]. */
function clipDisc(R: number, x0: number, x1: number, z0 = -1, z1 = 1, n = 72): [number, number][] {
  let poly: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; poly.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const clip = (ax: 0 | 1, v: number, keepGreater: boolean): void => {
    const out: [number, number][] = [];
    const inside = (p: [number, number]): boolean => (keepGreater ? p[ax] >= v : p[ax] <= v);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (v - a[ax]) / (b[ax] - a[ax]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    poly = out;
  };
  clip(0, x0, true); clip(0, x1, false); clip(1, z0, true); clip(1, z1, false);
  return poly;
}
/** Flat annulus (or disc when r0=0) on the local plane z=zf of frame T, facing +z. */
function annulus(m: Mesh3, T: Xf, x: number, y: number, r0: number, r1: number, zf: number, c: string, n = 16, a0 = 0, a1 = TAU): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, b = a0 + ((a1 - a0) * (i + 1)) / n, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    if (r0 <= 0) m.tri(T([x, y, zf]), T([x + ca * r1, y + sa * r1, zf]), T([x + cb * r1, y + sb * r1, zf]), c, dirOf(T, [0, 0, 1]));
    else m.tq(T, [x + ca * r0, y + sa * r0, zf], [x + cb * r0, y + sb * r0, zf], [x + cb * r1, y + sb * r1, zf], [x + ca * r1, y + sa * r1, zf], c, [0, 0, 1]);
  }
}
/** Gothic rose window: moulded frame, dark glass, two tracery rings, radiating mullions and a central boss. */
function rose(m: Mesh3, T: Xf, x: number, y: number, r: number, zf: number, glass: string, frame: string, spokes = 12): void {
  annulus(m, T, x, y, r, r * 1.14, zf, shade(frame, 0.92), 24);
  annulus(m, T, x, y, 0, r, zf, glass, 24);
  annulus(m, T, x, y, r * 0.9, r, zf + 0.0006, frame, 24);
  annulus(m, T, x, y, r * 0.5, r * 0.58, zf + 0.0006, frame, 18);
  annulus(m, T, x, y, 0, r * 0.18, zf + 0.0008, frame, 10);
  const w = Math.max(0.0008, r * 0.05);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU, c = Math.cos(a), s = Math.sin(a);
    m.strut(T, x + c * r * 0.16, y + s * r * 0.16, x + c * r * 0.92, y + s * r * 0.92, w, 0.0012, frame, zf + 0.0008);
    const a2 = a + Math.PI / spokes;
    m.strut(T, x + Math.cos(a2) * r * 0.56, y + Math.sin(a2) * r * 0.56, x + Math.cos(a2) * r * 0.92, y + Math.sin(a2) * r * 0.92, w * 0.7, 0.001, frame, zf + 0.0007);
  }
}
/** Recessed Gothic portal: stepped archivolts, sculpted tympanum, twin doors and trumeau. */
function portal(m: Mesh3, T: Xf, x: number, y: number, w: number, h: number, zf: number, st: string, hi: string, door: string, steps = 4): void {
  for (let k = steps; k >= 1; k--) m.win(T, x, y, w + k * w * 0.11, h + k * w * 0.1, zf + (steps - k) * 0.0012, k % 2 ? shade(st, 0.86) : hi, undefined, 'pointed');
  const zt = zf + steps * 0.0012;
  m.win(T, x, y, w, h, zt, shade(st, 0.8), undefined, 'pointed');
  const ly = y + h * 0.5;
  m.win(T, x, ly, w * 0.86, h * 0.5 - w * 0.08, zt + 0.0006, shade(hi, 0.92), undefined, 'pointed');
  for (const f of [0.62, 0.76]) m.box(T, x, y + h * f, zt + 0.0012, w * 0.84 * (1 - (f - 0.5) * 0.9), 0.0012, 0.0012, shade(st, 0.75));
  m.box(T, x, ly - 0.003, zt + 0.0004, w * 0.92, 0.003, 0.002, hi);
  for (const s of [-1, 1]) m.win(T, x + s * w * 0.23, y, w * 0.38, ly - y - 0.004, zt + 0.0006, door, undefined, 'rect');
  m.box(T, x, y, zt + 0.001, w * 0.07, ly - y - 0.003, 0.002, hi);
}

// ---------------------------------------------------------------------------------------------------------
// Notre-Dame de Paris on the Île de la Cité. West front: two square flat-topped towers with paired lancet
// belfry openings and corner buttresses, the three deep portals, the Gallery of Kings, the rose window behind
// the Virgin gallery and the open Grand Gallery tying the towers together. Nave and choir with clerestory, double
// aisles under lean-to roofs and long single-span flying buttresses; transept fronts with rose windows, gables
// and pinnacle turrets; the apse with its ring of radiating flyers; lead-grey roofs with seams and cresting;
// Viollet-le-Duc's restored oak-and-lead crossing spire with the green copper apostles stepping down the roofs.
// Around it: the parvis, the gardens with trees, the Seine on both sides between stone quays, a bateau-mouche,
// the Pont au Double and Haussmann fronts on the left and right banks.
const notredame: Builder = (gp) => {
  const ST = '#ddd2b8', ST2 = '#cdbfa2', HI = '#ece4d0', LEAD = '#8f9ba5', LEAD2 = '#7d8993', GL = '#3b4050', VOID = '#2f2b26';
  const SPIRE = '#5c656e', COP = '#6aa58c', QUAY = '#c3b8a5';
  const yB = 0.035, RQ = 0.497, CX = 0.25, SX = 0.37, yQ = yB + 0.016, Y = yQ;
  island(gp, 0.5, () => 0.002, '#5d8a8c', calm('#5d8a8c'), { rings: 16, segs: 80, side: strataSide(EARTH) });
  const m = new Mesh3();
  // ---- Île de la Cité, quays and banks ----------------------------------------------------------------
  m.plan(ID, clipDisc(RQ, -CX, CX), yB, yQ, QUAY);
  m.plan(ID, clipDisc(RQ, SX, 1), yB, yQ, QUAY);
  m.plan(ID, clipDisc(RQ, -1, -SX), yB, yQ, QUAY);
  for (const sx of [-1, 1]) for (const xq of [CX, SX]) {
    const xx = sx * xq, zl = Math.sqrt(RQ * RQ - xq * xq) - 0.004, side = sx * (xq === CX ? 1 : -1);
    m.box(ID, xx + side * 0.0005, yB + 0.003, 0, 0.0012, 0.003, 2 * zl, '#9c937f');
    for (let z = -zl + 0.03; z < zl; z += 0.06) m.box(ID, xx + side * 0.0006, yB + 0.002, z, 0.0012, 0.012, 0.004, '#d6cdbb');
  }
  const GRASS = '#6f9550';
  m.plan(ID, [[0.145, -0.29], [0.235, -0.29], [0.235, 0.2], [0.145, 0.2]], yQ, yQ + 0.0012, GRASS);
  m.plan(ID, [[-0.235, -0.27], [-0.145, -0.27], [-0.145, 0.16], [-0.235, 0.16]], yQ, yQ + 0.0012, GRASS);
  m.plan(ID, clipDisc(RQ - 0.012, -0.22, 0.22, -1, -0.36), yQ, yQ + 0.0012, GRASS);
  m.plan(ID, clipDisc(RQ - 0.008, -0.23, 0.23, 0.3, 1), yQ, yQ + 0.0008, '#d3cab9');
  for (let i = 0; i < 9; i++) m.box(ID, -0.2 + i * 0.05, yQ + 0.0008, 0.39, 0.0012, 0.0004, 0.17, '#bdb3a0');
  const TREE = ['#5d8a43', '#4f7c3a', '#6a9449'];
  for (let i = 0; i < 9; i++) leafTree(m, 0.19 + (i % 2) * 0.025, yQ, -0.26 + i * 0.054, 0.055, TREE[i % 3]);
  for (let i = 0; i < 7; i++) leafTree(m, -0.2 + (i % 2) * 0.02, yQ, -0.24 + i * 0.06, 0.05, TREE[(i + 1) % 3]);
  for (let i = 0; i < 6; i++) leafTree(m, -0.15 + i * 0.06, yQ, -0.41 - (i % 2) * 0.03, 0.05, TREE[i % 3]);
  for (const sx of [-1, 1]) for (let z = -0.28; z <= 0.29; z += 0.07) leafTree(m, sx * 0.392, yQ, z, 0.045, TREE[Math.abs(Math.round(z * 50)) % 3]);
  // Haussmann fronts on both banks
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = -0.15 + i * 0.1, xb = 0.425, T = xform(sx * xb, 0, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    house(m, T, 0, yQ, 0, 0.094, 0.07, 0.05, i % 2 ? '#e7dcc6' : '#ddd0b6', '#6c7a86', 0.8);
    for (let f = 0; f < 4; f++) for (let k = 0; k < 6; k++) m.win(T, -0.039 + k * 0.0156, yQ + 0.01 + f * 0.015, 0.0065, 0.01, 0.025, '#4a5160', undefined, 'rect');
    m.box(T, 0, yQ + 0.052, 0.026, 0.094, 0.0015, 0.003, '#2f3338');
  }
  // Pont au Double and a bateau-mouche
  m.arch(xform((CX + SX) / 2, 0, 0.29), 0, yB, SX - CX + 0.02, yQ - yB + 0.004, 0.034, SX - CX - 0.02, 0, 0.011, '#d4cab5', 'arch', 8, true);
  for (const sz of [-1, 1]) m.box(ID, (CX + SX) / 2, yQ + 0.004, 0.29 + sz * 0.016, SX - CX + 0.02, 0.004, 0.002, '#4b4f55');
  const Tb = xform(-0.31, yB + 0.002, 0.02, 0);
  m.box(Tb, 0, 0, 0, 0.03, 0.006, 0.14, '#f2f2ee', true);
  m.box(Tb, 0, 0.006, -0.005, 0.026, 0.008, 0.11, '#6e8da6');
  m.box(Tb, 0, 0.014, -0.005, 0.027, 0.0012, 0.112, '#e8e8e4');
  m.box(Tb, 0, 0.0005, 0, 0.0305, 0.0015, 0.1405, '#2b3a55');

  // ---- West front --------------------------------------------------------------------------------------
  const ZW = 0.27, TD = 0.075, FW = 0.225, ZT = ZW - TD / 2, T0 = xform(0, 0, ZW);
  m.box(ID, 0, Y, ZT, FW, 0.265, TD, ST);
  for (const bx of [-0.0375, 0.0375, -0.1095, 0.1095]) {
    m.box(T0, bx, Y, 0.007, 0.013, 0.104, 0.014, ST2);
    m.box(T0, bx, Y + 0.124, 0.004, 0.011, 0.101, 0.008, ST2);
    m.prism(T0, bx, Y + 0.104, 0.007, 0.0092, 0.004, 4, HI, 0.007, Math.PI / 4);
  }
  portal(m, T0, 0, Y, 0.04, 0.088, 0.0002, ST, HI, '#3a2f27', 4);
  for (const sx of [-1, 1]) portal(m, T0, sx * 0.075, Y, 0.032, 0.078, 0.0002, ST, HI, '#3a2f27', 3);
  m.box(T0, 0, Y + 0.098, 0.006, FW + 0.004, 0.006, 0.012, HI);
  // Gallery of Kings
  m.box(T0, 0, Y + 0.104, 0.004, FW, 0.02, 0.008, shade(ST2, 0.95));
  for (let i = 0; i < 28; i++) {
    const x = -FW / 2 + 0.004 + ((i + 0.5) * (FW - 0.008)) / 28;
    m.win(T0, x, Y + 0.106, 0.0058, 0.016, 0.008, '#7a705f', undefined, 'arch');
    m.box(T0, x, Y + 0.106, 0.0085, 0.0034, 0.0098, 0.0018, '#e2d7bf');
    m.box(T0, x, Y + 0.1158, 0.0085, 0.0022, 0.0026, 0.0018, '#e2d7bf');
  }
  m.box(T0, 0, Y + 0.124, 0.008, FW + 0.006, 0.005, 0.018, HI);
  for (let i = 0; i <= 44; i++) m.box(T0, -FW / 2 + (i * FW) / 44, Y + 0.129, 0.015, 0.0012, 0.006, 0.0012, HI);
  m.box(T0, 0, Y + 0.135, 0.015, FW, 0.0012, 0.0016, HI);
  // Rose window behind the Virgin and angels
  m.win(T0, 0, Y + 0.138, 0.07, 0.078, 0, ST2, undefined, 'arch');
  rose(m, T0, 0, Y + 0.176, 0.027, 0.0016, GL, HI, 16);
  for (const [px, s] of [[0, 1.15], [-0.016, 0.9], [0.016, 0.9], [-0.06, 0.95], [0.06, 0.95]] as [number, number][]) {
    m.box(T0, px, Y + 0.129, 0.011, 0.0042 * s, 0.011 * s, 0.003, '#e8dfca');
    m.box(T0, px, Y + 0.129 + 0.011 * s, 0.011, 0.0026 * s, 0.003 * s, 0.0026, '#e8dfca');
  }
  for (const sx of [-1, 1]) {
    const x = sx * 0.075;
    m.win(T0, x, Y + 0.138, 0.05, 0.084, 0.0002, ST2, undefined, 'pointed');
    for (const dx of [-0.0118, 0.0118]) m.win(T0, x + dx, Y + 0.141, 0.0155, 0.06, 0.0016, VOID, HI, 'pointed');
    annulus(m, T0, x, Y + 0.207, 0, 0.0072, 0.0018, VOID, 10);
    annulus(m, T0, x, Y + 0.207, 0.0072, 0.0092, 0.0018, HI, 10);
  }
  // Grand Gallery (open arcade) wrapping the front and the outer tower faces
  const gallery = (T: Xf, w: number): void => {
    m.box(T, 0, Y + 0.226, 0.001, w, 0.026, 0.002, '#4c463d');
    const n = Math.round(w / 0.0062);
    for (let i = 0; i <= n; i++) m.box(T, -w / 2 + (i * w) / n, Y + 0.226, 0.003, 0.0016, 0.022, 0.0022, HI);
    for (let i = 0; i < n; i++) m.win(T, -w / 2 + ((i + 0.5) * w) / n, Y + 0.243, (w / n) * 0.8, 0.008, 0.0035, HI, undefined, 'pointed');
    m.box(T, 0, Y + 0.222, 0.004, w + 0.004, 0.004, 0.008, HI);
    m.box(T, 0, Y + 0.248, 0.003, w, 0.012, 0.004, ST);
    m.box(T, 0, Y + 0.26, 0.004, w + 0.004, 0.003, 0.009, HI);
    for (let i = 0; i <= n * 2; i++) m.box(T, -w / 2 + (i * w) / (2 * n), Y + 0.263, 0.006, 0.0011, 0.006, 0.0011, HI);
    m.box(T, 0, Y + 0.269, 0.006, w, 0.0012, 0.0016, HI);
  };
  gallery(T0, FW);
  for (const sx of [-1, 1]) gallery(xform(sx * FW / 2, 0, ZT, (sx * Math.PI) / 2), TD);
  // Outer tower flanks below the gallery
  for (const sx of [-1, 1]) {
    const T = xform(sx * FW / 2, 0, ZT, (sx * Math.PI) / 2);
    for (const bx of [-0.031, 0.031]) m.box(T, bx, Y, 0.006, 0.012, 0.222, 0.012, ST2);
    m.win(T, 0, Y + 0.02, 0.016, 0.06, 0, VOID, HI, 'pointed');
    for (const dx of [-0.009, 0.009]) m.win(T, dx, Y + 0.14, 0.012, 0.06, 0, VOID, HI, 'pointed');
    m.box(T, 0, Y + 0.124, 0.004, TD, 0.004, 0.008, HI);
  }
  // Towers: belfry stage with paired louvred lancets, corner buttresses, cornice and parapet
  const YT0 = Y + 0.27, YT1 = Y + 0.375, TW = 0.07;
  for (const tx of [-0.075, 0.075]) {
    m.box(ID, tx, YT0 - 0.004, ZT, TW, YT1 - YT0 + 0.004, TW, ST);
    rect4(tx, ZT, TW / 2, TW / 2, (T, _i, along) => {
      for (const bx of [-along + 0.005, along - 0.005]) {
        m.box(T, bx, YT0, 0.004, 0.01, YT1 - YT0 - 0.01, 0.008, ST2);
        pinnacle(m, T, bx, YT1 + 0.008, 0.002, 0.003, 0.016, HI);
      }
      for (const dx of [-0.012, 0.012]) {
        m.win(T, dx, YT0 + 0.008, 0.0165, 0.088, 0, ST2, HI, 'pointed');
        m.win(T, dx, YT0 + 0.011, 0.012, 0.08, 0.0016, VOID, undefined, 'pointed');
        for (let k = 0; k < 7; k++) m.box(T, dx, YT0 + 0.016 + k * 0.009, 0.0028, 0.012, 0.0014, 0.001, '#6c6457');
      }
      m.win(T, 0, YT0 + 0.075, 0.006, 0.022, 0.0016, VOID, HI, 'pointed');
      m.box(T, 0, YT1 - 0.006, 0.003, along * 2 + 0.004, 0.006, 0.006, HI);
      for (let k = -3; k <= 3; k++) m.box(T, k * 0.009, YT1 - 0.009, 0.006, 0.0025, 0.004, 0.004, '#bfb197');
      m.box(T, 0, YT1, 0.002, along * 2 + 0.004, 0.009, 0.004, ST2);
      for (let k = 0; k < 9; k++) m.win(T, -along + 0.007 + k * ((along * 2 - 0.014) / 8), YT1 + 0.0015, 0.004, 0.0055, 0.0042, '#7d7363', undefined, 'arch');
    });
    m.box(ID, tx, YT1, ZT, TW - 0.002, 0.004, TW - 0.002, LEAD2);
  }
  // Stair turret on the north tower
  m.prism(ID, -0.104, YT1, ZT - 0.03, 0.006, 0.012, 8, ST, 0.006);
  m.prism(ID, -0.104, YT1 + 0.012, ZT - 0.03, 0.007, 0.01, 8, LEAD2, 0);

  // ---- Nave, aisles, transept, choir ------------------------------------------------------------------
  const NV = 0.034, AW = 0.112, YE = Y + 0.185, YR = Y + 0.235, ZN0 = ZW - TD, ZX0 = -0.04, ZX1 = -0.115, ZC = (ZX0 + ZX1) / 2, ZA = -0.29, XT = 0.135;
  m.box(ID, 0, Y, (ZN0 + ZA) / 2, 2 * NV, YE - Y, ZN0 - ZA, ST);
  m.box(ID, 0, YE - 0.004, (ZN0 + ZA) / 2, 2 * NV + 0.006, 0.006, ZN0 - ZA, HI);
  m.poly(ID, [[-NV - 0.005, YE], [NV + 0.005, YE], [0, YR]], ZA, ZN0 - 0.002, LEAD);
  m.poly(xform(0, 0, ZC, Math.PI / 2), [[-(ZX0 - ZX1) / 2 - 0.005, YE], [(ZX0 - ZX1) / 2 + 0.005, YE], [0, YR]], -XT, XT, LEAD);
  m.box(ID, 0, YE - 0.004, ZC, 2 * XT, 0.006, ZX0 - ZX1 + 0.006, HI);
  m.box(ID, 0, Y, ZC, 2 * XT, YE - Y, ZX0 - ZX1, ST);
  // roof seams and ridge cresting
  const seam = (x0: number, z: number, along: 'z' | 'x'): void => {
    for (const s of [-1, 1]) {
      const a: V3 = along === 'z' ? [s * (x0 + 0.005), YE + 0.0006, z] : [z, YE + 0.0006, s * x0 + ZC];
      const b: V3 = along === 'z' ? [0, YR + 0.0006, z] : [z, YR + 0.0006, ZC];
      const d: V3 = along === 'z' ? [0, 0, 0.0007] : [0.0007, 0, 0];
      m.quad([a[0] - d[0], a[1], a[2] - d[2]], [a[0] + d[0], a[1], a[2] + d[2]], [b[0] + d[0], b[1], b[2] + d[2]], [b[0] - d[0], b[1], b[2] - d[2]], '#a6b1ba', [along === 'z' ? s : 0, 1, along === 'x' ? s : 0]);
    }
  };
  for (let z = ZN0 - 0.01; z > ZA; z -= 0.011) if (z > ZX0 + 0.004 || z < ZX1 - 0.004) seam(NV, z, 'z');
  for (let x = -XT + 0.008; x < XT; x += 0.011) if (Math.abs(x) > NV + 0.004) seam((ZX0 - ZX1) / 2, x, 'x');
  m.box(ID, 0, YR - 0.001, (ZN0 + ZA) / 2, 0.003, 0.005, ZN0 - ZA, '#6f7a83');
  m.box(ID, 0, YR - 0.001, ZC, 2 * XT, 0.005, 0.003, '#6f7a83');
  // aisles
  const YA = Y + 0.092, YAi = Y + 0.126;
  for (const sx of [-1, 1]) for (const [z0, z1] of [[ZN0, ZX0], [ZX1, ZA]]) {
    m.box(ID, sx * (NV + AW) / 2, Y, (z0 + z1) / 2, AW - NV, YA - Y, z0 - z1, ST);
    m.tq(ID, [sx * NV, YAi, z1], [sx * NV, YAi, z0], [sx * (AW + 0.004), YA, z0], [sx * (AW + 0.004), YA, z1], LEAD2, [sx, 2, 0]);
    m.poly(xform(0, 0, 0, 0), sx > 0 ? [[NV, YA], [AW + 0.004, YA], [NV, YAi]] : [[-AW - 0.004, YA], [-NV, YA], [-NV, YAi]], z1, z0, ST, false);
  }
  // bays: clerestory windows, aisle windows, flying buttresses with pinnacled piers
  const bays: number[] = [];
  for (let z = ZN0 - 0.02; z > ZX0 + 0.012; z -= 0.038) bays.push(z);
  for (let z = ZX1 - 0.022; z > ZA + 0.005; z -= 0.04) bays.push(z);
  for (const sx of [-1, 1]) {
    for (const zb of bays) {
      const Tc = xform(sx * NV, 0, zb, (sx * Math.PI) / 2), Ta = xform(sx * AW, 0, zb, (sx * Math.PI) / 2);
      m.win(Tc, 0, Y + 0.132, 0.015, 0.046, 0, GL, HI, 'pointed');
      m.win(Ta, 0, Y + 0.022, 0.017, 0.052, 0, GL, HI, 'pointed');
      annulus(m, Ta, 0, Y + 0.081, 0, 0.005, 0.0012, GL, 8);
      const zp = zb - 0.019;
      if (zp < ZX0 + 0.004 && zp > ZX1 - 0.004) continue;
      m.box(ID, sx * 0.124, Y, zp, 0.016, 0.148, 0.013, ST2);
      m.box(ID, sx * 0.124, Y, zp, 0.019, 0.05, 0.016, ST2);
      pinnacle(m, ID, sx * 0.124, Y + 0.148, zp, 0.007, 0.045, ST, HI);
      m.box(ID, sx * 0.072, YA, zp, 0.01, 0.045, 0.011, ST2);
      pinnacle(m, ID, sx * 0.072, YA + 0.045, zp, 0.005, 0.028, ST, HI);
      m.beam([sx * 0.118, Y + 0.142, zp], [sx * (NV + 0.002), Y + 0.176, zp], 0.0055, ST2, 0.007);
      m.beam([sx * 0.118, Y + 0.13, zp], [sx * 0.08, Y + 0.142, zp], 0.004, ST2, 0.006);
      m.box(ID, sx * (NV + 0.002), Y + 0.12, zp, 0.006, YE - Y - 0.12, 0.008, ST2);
    }
  }
  // transept fronts: portal, rose, gable, pinnacle turrets
  for (const sx of [-1, 1]) {
    const T = xform(sx * XT, 0, ZC, (sx * Math.PI) / 2), hw = (ZX0 - ZX1) / 2;
    portal(m, T, 0, Y, 0.028, 0.07, 0.0002, ST, HI, '#3a2f27', 3);
    m.poly(T, [[-0.022, Y + 0.074], [0.022, Y + 0.074], [0, Y + 0.104]], 0.002, 0.005, HI);
    annulus(m, T, 0, Y + 0.086, 0, 0.005, 0.0052, GL, 8);
    m.box(T, 0, Y + 0.104, 0.003, 2 * hw, 0.004, 0.006, HI);
    for (let i = 0; i < 9; i++) m.win(T, -hw + 0.008 + i * ((2 * hw - 0.016) / 8), Y + 0.108, 0.0055, 0.013, 0.0005, GL, undefined, 'pointed');
    m.win(T, 0, Y + 0.124, 0.066, 0.064, 0.0002, ST2, undefined, 'rect');
    rose(m, T, 0, Y + 0.156, 0.027, 0.0016, GL, HI, 16);
    m.box(T, 0, YE - 0.004, 0.003, 2 * hw + 0.004, 0.006, 0.008, HI);
    m.poly(T, [[-hw, YE + 0.002], [hw, YE + 0.002], [0, YR + 0.012]], 0, 0.004, ST);
    m.poly(T, [[-hw - 0.003, YE + 0.002], [-hw + 0.003, YE + 0.002], [0, YR + 0.017], [-0.004, YR + 0.017]], 0.004, 0.006, HI);
    m.poly(T, [[hw - 0.003, YE + 0.002], [hw + 0.003, YE + 0.002], [0.004, YR + 0.017], [0, YR + 0.017]], 0.004, 0.006, HI);
    rose(m, T, 0, YE + 0.022, 0.009, 0.0045, GL, HI, 8);
    for (const dx of [-0.013, 0.013]) m.win(T, dx, YE + 0.006, 0.006, 0.014, 0.0045, GL, undefined, 'pointed');
    m.box(T, 0, YR + 0.012, 0.003, 0.002, 0.016, 0.002, HI);
    for (const bx of [-hw - 0.004, hw + 0.004]) {
      m.prism(T, bx, Y, 0.002, 0.009, YE - Y + 0.035, 4, ST2, 0.008, Math.PI / 4);
      m.prism(T, bx, YE + 0.035, 0.002, 0.009, 0.006, 8, HI, 0.009);
      m.prism(T, bx, YE + 0.041, 0.002, 0.008, 0.038, 8, ST, 0);
      for (let k = 0; k < 3; k++) m.win(T, bx, Y + 0.03 + k * 0.05, 0.004, 0.022, 0.0115, VOID, undefined, 'pointed');
    }
  }
  // apse, ambulatory ring and radiating flyers
  m.prism(ID, 0, Y, ZA, NV, YE - Y, 12, ST, NV, 0, false);
  m.prism(ID, 0, YE - 0.004, ZA, NV + 0.003, 0.006, 12, HI, NV + 0.003, 0, false);
  m.prism(ID, 0, YE, ZA, NV + 0.005, YR - YE, 12, LEAD, 0);
  m.prism(ID, 0, Y, ZA, AW, YA - Y, 18, ST, AW, 0, false);
  m.prism(ID, 0, YA, ZA, AW + 0.004, YAi - YA, 18, LEAD2, NV);
  for (let k = -3; k <= 3; k++) {
    const a = (k * Math.PI) / 7.2, sa = Math.sin(a), ca = Math.cos(a);
    const P = (r: number): [number, number] => [sa * r, ZA - ca * r];
    const [px, pz] = P(0.126), [wx, wz] = P(NV + 0.002), [ix, iz] = P(0.075);
    m.prism(ID, px, Y, pz, 0.0085, 0.145, 4, ST2, 0.0085, a + Math.PI / 4);
    pinnacle(m, ID, px, Y + 0.145, pz, 0.007, 0.045, ST, HI);
    m.beam([px, Y + 0.14, pz], [wx, Y + 0.176, wz], 0.0055, ST2, 0.007);
    m.prism(ID, ix, YA, iz, 0.005, 0.04, 4, ST2, 0.005, a + Math.PI / 4);
    const Tw = xform(sa * AW, 0, ZA - ca * AW, Math.PI + a);
    m.win(Tw, 0, Y + 0.022, 0.016, 0.05, 0.001, GL, HI, 'pointed');
    const Tc = xform(sa * NV * 0.97, 0, ZA - ca * NV * 0.97, Math.PI + a);
    if (Math.abs(k) < 3) m.win(Tc, 0, Y + 0.132, 0.011, 0.044, 0.001, GL, HI, 'pointed');
  }

  // ---- Crossing spire (Viollet-le-Duc, restored) and the copper apostles ----------------------------------
  const SY0 = YR - 0.012, SY1 = Y + 0.27, SY2 = Y + 0.305, SY3 = Y + 0.515;
  m.prism(ID, 0, SY0, ZC, 0.018, SY1 - SY0, 8, SPIRE, 0.017, Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const am = (k + 0.5) * (Math.PI / 4) + Math.PI / 8, dd = 0.0168;
    const T = xform(Math.cos(am) * dd, 0, ZC + Math.sin(am) * dd, Math.atan2(Math.cos(am), Math.sin(am)));
    m.win(T, 0, SY0 + 0.01, 0.007, 0.024, 0, '#262a2f', '#7a858e', 'pointed');
    m.poly(T, [[-0.0065, SY1 - 0.001], [0.0065, SY1 - 0.001], [0, SY1 + 0.013]], -0.001, 0.001, '#6f7a84');
    const ac = k * (Math.PI / 4) + Math.PI / 8;
    m.prism(ID, Math.cos(ac) * 0.019, SY0 + 0.012, ZC + Math.sin(ac) * 0.019, 0.0022, 0.03, 4, '#6f7a84', 0.0022, 0, false);
    m.prism(ID, Math.cos(ac) * 0.019, SY0 + 0.042, ZC + Math.sin(ac) * 0.019, 0.0028, 0.016, 4, '#6f7a84', 0);
  }
  m.prism(ID, 0, SY1, ZC, 0.014, SY2 - SY1, 8, '#4c545c', 0.0125, Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = k * (Math.PI / 4) + Math.PI / 8;
    m.box(ID, Math.cos(a) * 0.0138, SY1, ZC + Math.sin(a) * 0.0138, 0.0022, SY2 - SY1, 0.0022, '#7a858e');
  }
  m.prism(ID, 0, SY2 - 0.003, ZC, 0.0145, 0.004, 8, '#7a858e', 0.0145, Math.PI / 8);
  m.prism(ID, 0, SY2, ZC, 0.0128, SY3 - SY2, 8, SPIRE, 0, Math.PI / 8);
  for (const f of [0.12, 0.3, 0.5]) m.prism(ID, 0, SY2 + f * (SY3 - SY2) - 0.002, ZC, 0.0128 * (1 - f) + 0.0012, 0.004, 8, '#7a858e', 0.0128 * (1 - f) + 0.001, Math.PI / 8, false);
  for (let k = 0; k < 8; k++) {
    const a = k * (Math.PI / 4) + Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a);
    for (let f = 0.05; f < 0.9; f += 0.09) {
      const rr = 0.0128 * (1 - f) + 0.0016;
      m.box(ID, ca * rr, SY2 + f * (SY3 - SY2), ZC + sa * rr, 0.0024, 0.003, 0.0024, '#7a858e');
    }
  }
  m.box(ID, 0, SY3 - 0.004, ZC, 0.0014, 0.022, 0.0014, '#5a636b');
  m.box(ID, 0, SY3 + 0.01, ZC, 0.009, 0.0014, 0.0014, '#5a636b');
  m.blob(ID, 0, SY3 + 0.02, ZC, 0.0025, 0.002, 0.0015, '#6aa58c', 5);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
    for (let k = 0; k < 3; k++) {
      const t = 0.026 + k * 0.012, x = dx * t * 0.68, z = ZC + dz * t * 0.74;
      const yv = YR - (YR - YE) * Math.max(Math.abs(x) / (NV + 0.005), 0) - 0.002;
      m.box(ID, x, yv, z, 0.0042, 0.011, 0.0042, COP);
      m.box(ID, x, yv + 0.011, z, 0.0028, 0.003, 0.0028, shade(COP, 1.08));
      m.box(ID, x, yv - 0.004, z, 0.006, 0.005, 0.006, '#5f6a73');
    }
  }

  // ---- Parvis: people and the Charlemagne statue -------------------------------------------------------
  for (let i = 0; i < 30; i++) person(m, (hash3(i, 1, 9) - 0.5) * 0.38, yQ + 0.0008, 0.3 + hash3(i, 2, 9) * 0.14, i, 0.0095);
  m.box(ID, 0.17, yQ, 0.36, 0.022, 0.01, 0.014, '#9c968a');
  m.blob(ID, 0.17, yQ + 0.018, 0.36, 0.009, 0.008, 0.005, '#4f6f5f', 6);
  m.box(ID, 0.17, yQ + 0.024, 0.36, 0.003, 0.01, 0.003, '#4f6f5f');
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Charles Bridge (Prague): a stretch of the sandstone bridge over the Vltava — round arches with voussoir rings,
// massive piers with pointed cutwaters under stone hoods, wooden ice-breakers upstream, the cornice and parapets
// lined with blackened Baroque statues on pedestals, lanterns and crowds on the deck. At the east end the Gothic
// Old Town Bridge Tower: pointed gate passage, band of coats of arms, sculpted gable, tracery storey, corbelled
// gallery, the steep slate roof with gilt finials and four slender corner turrets. Red-roofed Old Town houses and
// the green dome of St Francis on the east bank; Malá Strana houses and a hint of Prague Castle and St Vitus to
// the west.
const charlesbridge: Builder = (gp) => {
  const SAND = '#8d806b', SAND2 = '#796e5c', CAP = '#5d5850', STAT = '#3b3934', DECK = '#8a8070';
  const TST = '#575047', TST2 = '#71695c', SLATE = '#3a3e45', GOLD = '#d8ab3c', ROOF = '#b8562f';
  const yB = 0.035, yW = 0.037, RQ = 0.497, EX = 0.27, WX = -0.37, yD = yW + 0.096, yK = yD - 0.003, yL = yW + 0.034, HD = 0.034;
  island(gp, 0.5, () => 0.002, '#5a7d76', calm('#5a7d76'), { rings: 16, segs: 80, side: strataSide(EARTH) });
  const m = new Mesh3();
  // ---- Banks with embankment walls --------------------------------------------------------------------
  m.plan(ID, clipDisc(RQ, EX, 1), yB, yK, '#857b6b');
  m.plan(ID, clipDisc(RQ, -1, WX, -0.14, 1), yB, yL, '#857b6b');
  m.plan(ID, clipDisc(RQ, -1, WX, -1, -0.14), yB, yL + 0.035, '#6f7a52');
  for (const [xq, top, sg] of [[EX, yK, 1], [WX, yL, -1]] as [number, number, number][]) {
    const zl = Math.sqrt(RQ * RQ - xq * xq) - 0.004;
    for (let y = yW + 0.012; y < top - 0.004; y += 0.012) m.box(ID, xq - sg * 0.0005, y, 0, 0.001, 0.0012, 2 * zl, '#6f6656');
    m.box(ID, xq - sg * 0.0005, yW, 0, 0.0012, 0.006, 2 * zl, '#4f4a40');
  }
  m.plan(ID, clipDisc(RQ - 0.004, EX + 0.004, 0.345), yK, yK + 0.0008, '#9a8f7d');
  // ---- Bridge: arches, spandrels, piers with cutwaters and hoods ----------------------------------------
  const S = 0.08, BAY = 0.11, R = S / 2, yS = yW + 0.03;
  const xc: number[] = [];
  for (let k = 0; k < 7; k++) xc.push(EX - R - k * BAY);
  for (let k = 0; k < 7; k++) {
    const c = shade(SAND, 0.94 + 0.1 * hash3(k, 3, 1));
    m.arch(ID, xc[k], yW - 0.002, BAY + 0.0006, yD - yW + 0.002, 2 * HD, S, 0, yS - yW + 0.002 + R, c, 'arch', 14, true, true, '#4a443b');
    for (const sz of [-1, 1]) {
      const Tf = sz > 0 ? xform(0, 0, HD) : xform(0, 0, -HD, Math.PI), lx = sz * xc[k];
      annulus(m, Tf, lx, yS, R, R + 0.0075, 0.0005, shade(c, 0.86), 14, 0, Math.PI);
      for (let j = 0; j < 14; j += 2) {
        const a = ((j + 0.5) / 14) * Math.PI;
        m.strut(Tf, lx + Math.cos(a) * R, yS + Math.sin(a) * R, lx + Math.cos(a) * (R + 0.0075), yS + Math.sin(a) * (R + 0.0075), 0.0016, 0.0008, shade(c, 0.72), 0.0006);
      }
      for (let j = 0; j < 12; j++) {
        const px = lx + (hash3(k, j, sz) - 0.5) * (BAY - 0.01), py = yW + 0.004 + hash3(j, k, sz + 3) * (yD - yW - 0.012);
        const dx = Math.abs(px - lx);
        if (dx < R + 0.01 && py < yS + Math.sqrt(Math.max(0, (R + 0.01) ** 2 - dx * dx))) continue;
        m.box(Tf, px, py, 0.0003, 0.008 + hash3(j, 2, k) * 0.008, 0.0035, 0.0008, shade(c, hash3(j, k, 5) > 0.5 ? 0.86 : 1.1));
      }
    }
  }
  const XE0 = -0.496, XE1 = EX + 0.02;
  m.box(ID, (XE0 + xc[6] - BAY / 2) / 2, yW, 0, xc[6] - BAY / 2 - XE0, yD - yW, 2 * HD - 0.002, SAND);
  const XM = (XE0 + XE1) / 2, LB = XE1 - XE0;
  m.box(ID, XM, yD, 0, LB, 0.0008, 2 * HD - 0.01, DECK);
  for (const sz of [-1, 1]) {
    m.box(ID, XM, yD - 0.008, sz * (HD + 0.0005), LB, 0.005, 0.004, SAND2);
    m.box(ID, XM, yD, sz * (HD - 0.003), LB, 0.013, 0.006, SAND2);
    m.box(ID, XM, yD + 0.013, sz * (HD - 0.003), LB, 0.0025, 0.0078, '#9c917e');
  }
  for (let k = 0; k < 6; k++) {
    const xp = xc[k] - BAY / 2;
    for (const sz of [-1, 1]) {
      const z0 = sz * (HD - 0.004), z1 = sz * (HD + 0.026), z2 = sz * (HD + 0.052);
      const pent: [number, number][] = [[xp - 0.019, z0], [xp + 0.019, z0], [xp + 0.019, z1], [xp, z2], [xp - 0.019, z1]];
      m.plan(ID, [[xp - 0.022, z0], [xp + 0.022, z0], [xp + 0.022, z1 + sz * 0.002], [xp, z2 + sz * 0.005], [xp - 0.022, z1 + sz * 0.002]], yW - 0.002, yW + 0.006, '#5e574b');
      m.plan(ID, pent, yW + 0.006, yW + 0.042, SAND2);
      for (const yy of [0.016, 0.03]) m.plan(ID, pent.map(([x, z]) => [x + (x - xp) * 0.04, z + (z - z0) * 0.04] as [number, number]), yW + yy, yW + yy + 0.0012, '#6a6254', false);
      const h0 = yW + 0.042, h1 = yW + 0.066;
      const A: V3 = [xp - 0.0195, h0, z0], B: V3 = [xp - 0.0195, h0, z1], C: V3 = [xp, h0, z2 + sz * 0.0008], D: V3 = [xp + 0.0195, h0, z1], E: V3 = [xp + 0.0195, h0, z0];
      const R0: V3 = [xp, h1, z0], R1: V3 = [xp, h1 - 0.005, sz * (HD + 0.022)];
      m.quad(A, B, R1, R0, CAP, [-1, 1, 0]); m.tri(B, C, R1, shade(CAP, 1.05), [-1, 1, sz]);
      m.tri(C, D, R1, shade(CAP, 0.9), [1, 1, sz]); m.quad(D, E, R0, R1, shade(CAP, 0.92), [1, 1, 0]);
      // statue pedestals above the piers
      m.box(ID, xp, yD - 0.004, sz * (HD + 0.002), 0.019, 0.026, 0.017, SAND2);
      m.box(ID, xp, yD + 0.022, sz * (HD + 0.002), 0.022, 0.0035, 0.02, '#9c917e');
    }
    // ice-breakers upstream
    const zi = -(HD + 0.085);
    m.box(ID, xp, yW - 0.001, zi, 0.03, 0.004, 0.034, '#4f4234');
    for (let j = -2; j <= 2; j++) m.beam([xp + j * 0.0055, yW + 0.003, zi - 0.02], [xp + j * 0.0055, yW + 0.016, zi + 0.014], 0.0038, j % 2 ? '#7c6c56' : '#6e604c');
  }
  // statues, lanterns, crowds
  const statue = (x: number, y: number, z: number, k: number): void => {
    const t = k % 5, Ts: Xf = (v) => [x + (v[0] - x) * 1.25, y + (v[1] - y) * 1.25, z + (v[2] - z) * 1.25];
    const m0 = m;
    const ms = { box: (_T: Xf, a: number, b: number, c: number, w: number, h: number, d: number, col: string) => m0.box(Ts, a, b, c, w, h, d, col),
      prism: (_T: Xf, a: number, b: number, c: number, r: number, h: number, n: number, col: string, r1?: number) => m0.prism(Ts, a, b, c, r, h, n, col, r1),
      blob: (_T: Xf, a: number, b: number, c: number, rx: number, ry: number, rz: number, col: string, n?: number) => m0.blob(Ts, a, b, c, rx, ry, rz, col, n),
      beam: (A: V3, B: V3, w: number, col: string) => m0.beam(Ts(A), Ts(B), w * 1.25, col) };
    ms.box(ID, x, y, z, 0.01, 0.004, 0.008, STAT);
    ms.prism(ID, x, y + 0.004, z, 0.0042, 0.017, 6, STAT, 0.0026);
    ms.blob(ID, x, y + 0.024, z, 0.0026, 0.0032, 0.0026, STAT, 5);
    if (t === 0) { ms.box(ID, x + 0.0035, y + 0.006, z, 0.0012, 0.024, 0.0012, STAT); ms.box(ID, x + 0.0035, y + 0.023, z, 0.008, 0.0012, 0.0012, STAT); }
    else if (t === 1) { ms.prism(ID, x - 0.0045, y + 0.004, z, 0.0034, 0.009, 6, STAT, 0.0024); ms.blob(ID, x - 0.0045, y + 0.016, z, 0.002, 0.0025, 0.002, STAT, 5); }
    else if (t === 2) { ms.beam([x, y + 0.016, z], [x + 0.006, y + 0.026, z], 0.0018, STAT); }
    else if (t === 3) { for (let j = 0; j < 5; j++) { const a = (j / 4) * Math.PI; ms.box(ID, x + Math.cos(a) * 0.0048, y + 0.025 + Math.sin(a) * 0.0048, z, 0.0016, 0.0016, 0.0016, GOLD); } }
    else { ms.prism(ID, x + 0.004, y + 0.004, z, 0.0032, 0.014, 6, STAT, 0.002); ms.blob(ID, x + 0.004, y + 0.02, z, 0.0022, 0.0028, 0.0022, STAT, 5); ms.blob(ID, x - 0.001, y + 0.008, z, 0.006, 0.004, 0.004, STAT, 5); }
  };
  for (let k = 0; k < 6; k++) for (const sz of [-1, 1]) statue(xc[k] - BAY / 2, yD + 0.0255, sz * (HD + 0.002), k * 2 + (sz > 0 ? 1 : 0));
  for (let k = 0; k < 7; k++) for (const sz of [-1, 1]) {
    const x = xc[k] + sz * 0.012, z = sz * (HD - 0.003);
    m.prism(ID, x, yD + 0.015, z, 0.001, 0.024, 4, '#2c2e32', 0.0008, 0, false);
    m.box(ID, x, yD + 0.039, z, 0.0042, 0.006, 0.0042, '#efe0a8');
    m.prism(ID, x, yD + 0.045, z, 0.0034, 0.004, 4, '#2c2e32', 0, Math.PI / 4);
  }
  for (let i = 0; i < 64; i++) person(m, XE0 + 0.02 + hash3(i, 7, 3) * (XE1 - XE0 - 0.03), yD + 0.0008, (hash3(i, 8, 3) - 0.5) * 0.048, i, 0.0095);

  // ---- Old Town Bridge Tower ----------------------------------------------------------------------------
  const xT = 0.31, TX = 0.05, TZ = 0.076, yT0 = yK, yP = yT0 + 0.08, yT1 = yT0 + 0.205;
  m.arch(xform(xT, 0, 0, Math.PI / 2), 0, yT0, TZ, yP - yT0, TX, 0.042, 0, 0.07, TST, 'pointed', 10, false, true, '#3a352f');
  m.box(ID, xT, yP, 0, TX, yT1 - yP, TZ, TST);
  for (const sx of [-1, 1]) {
    const T = xform(xT + (sx * TX) / 2, 0, 0, (sx * Math.PI) / 2), main = sx > 0;
    for (const bx of [-0.034, 0.034]) m.box(T, bx, yT0, 0.002, 0.008, yT1 - yT0 - 0.02, 0.004, TST2);
    const SH = ['#b03a2e', '#e8e2d6', '#d8ab3c', '#2f4f8f', '#b03a2e', '#e8e2d6', '#d8ab3c', '#2f4f8f', '#b03a2e'];
    for (let i = 0; i < 9; i++) m.box(T, -0.022 + i * 0.0055, yP + 0.003, 0.0006, 0.0042, 0.005, 0.0012, SH[i]);
    if (main) {
      m.win(T, 0, yP + 0.011, 0.05, 0.05, 0.0004, TST2, undefined, 'pointed');
      m.win(T, 0, yP + 0.013, 0.043, 0.044, 0.0016, '#4a443c', undefined, 'pointed');
      for (const [px, h] of [[0, 0.02], [-0.011, 0.016], [0.011, 0.016], [-0.02, 0.012], [0.02, 0.012]] as [number, number][]) {
        m.box(T, px, yP + 0.016, 0.003, 0.0045, h, 0.0025, '#b3a68c');
        m.box(T, px, yP + 0.016 + h, 0.003, 0.003, 0.004, 0.0025, '#b3a68c');
      }
      for (let i = 0; i < 6; i++) { const f = i / 5; m.box(T, -0.025 + f * 0.025, yP + 0.012 + Math.sin(f * Math.PI / 2) * 0.045, 0.0025, 0.0025, 0.0025, 0.002, TST2); m.box(T, 0.025 - f * 0.025, yP + 0.012 + Math.sin(f * Math.PI / 2) * 0.045, 0.0025, 0.0025, 0.0025, 0.002, TST2); }
    } else {
      for (const px of [-0.012, 0.012]) m.win(T, px, yP + 0.02, 0.008, 0.024, 0.0005, '#2e2a25', TST2, 'pointed');
    }
    m.box(T, 0, yP + 0.064, 0.002, TZ + 0.002, 0.004, 0.005, TST2);
    for (const px of [-0.02, -0.0067, 0.0067, 0.02]) m.win(T, px, yP + 0.07, 0.0075, 0.034, 0.0005, '#3d516a', TST2, 'pointed');
    if (main) for (const px of [-0.0133, 0.0133]) { m.box(T, px, yP + 0.074, 0.003, 0.004, 0.014, 0.0025, '#b3a68c'); m.box(T, px, yP + 0.088, 0.003, 0.0028, 0.0035, 0.0025, '#b3a68c'); }
    for (let i = 0; i < 8; i++) m.win(T, -0.0245 + i * 0.007, yP + 0.103, 0.005, 0.009, 0.0005, '#4a443c', undefined, 'pointed');
  }
  for (const sz of [-1, 1]) {
    const T = xform(xT, 0, (sz * TZ) / 2, sz > 0 ? 0 : Math.PI);
    m.win(T, 0, yP + 0.03, 0.006, 0.02, 0, '#2e2a25', TST2, 'pointed');
    m.win(T, 0, yP + 0.075, 0.008, 0.03, 0, '#3d516a', TST2, 'pointed');
  }
  m.box(ID, xT, yT1 - 0.012, 0, TX + 0.006, 0.012, TZ + 0.006, TST2);
  rect4(xT, 0, TX / 2 + 0.003, TZ / 2 + 0.003, (T, _i, along) => {
    const n = Math.round(along / 0.0045);
    for (let i = 0; i < n; i++) m.win(T, -along + 0.004 + (i * (2 * along - 0.008)) / Math.max(1, n - 1), yT1 - 0.0105, 0.0035, 0.0075, 0, '#3a352f', undefined, 'pointed');
    for (let i = 0; i <= n; i++) m.prism(T, -along + (i * 2 * along) / n, yT1 - 0.017, 0.001, 0.0008, 0.005, 4, TST2, 0.0018, 0, false);
  });
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
    const x = xT + (cx * TX) / 2, z = (cz * TZ) / 2;
    m.prism(ID, x, yT1 - 0.04, z, 0.0015, 0.014, 8, TST, 0.0075, 0, false);
    m.prism(ID, x, yT1 - 0.026, z, 0.0075, 0.04, 8, TST);
    m.prism(ID, x, yT1 + 0.004, z, 0.0085, 0.004, 8, TST2, 0.0085);
    m.prism(ID, x, yT1 + 0.008, z, 0.0082, 0.056, 8, SLATE, 0);
    m.box(ID, x, yT1 + 0.062, z, 0.0008, 0.012, 0.0008, '#8a7a50');
    m.blob(ID, x, yT1 + 0.07, z, 0.0024, 0.0024, 0.0024, GOLD, 6);
  }
  const yr0 = yT1, yr1 = yT1 + 0.11, rx = 0.021, rz = 0.033, rr = 0.008;
  const P00: V3 = [xT - rx, yr0, -rz], P10: V3 = [xT + rx, yr0, -rz], P11: V3 = [xT + rx, yr0, rz], P01: V3 = [xT - rx, yr0, rz], Ra: V3 = [xT, yr1, -rr], Rb: V3 = [xT, yr1, rr];
  m.quad(P00, P01, Rb, Ra, SLATE, [-1, 0.4, 0]); m.quad(P10, P11, Rb, Ra, shade(SLATE, 0.9), [1, 0.4, 0]);
  m.tri(P00, P10, Ra, shade(SLATE, 0.95), [0, 0.4, -1]); m.tri(P01, P11, Rb, shade(SLATE, 0.95), [0, 0.4, 1]);
  m.box(ID, xT, yr1 - 0.001, 0, 0.0022, 0.0022, 2 * rr, '#2c2f34');
  for (const z of [-rr, rr]) { m.box(ID, xT, yr1, z, 0.001, 0.016, 0.001, '#8a7a50'); m.blob(ID, xT, yr1 + 0.018, z, 0.0034, 0.0034, 0.0034, GOLD, 6); }
  for (const s of [-1, 1]) { const T = xform(xT + s * 0.012, 0, 0, (s * Math.PI) / 2); m.box(T, 0, yr0 + 0.045, -0.002, 0.008, 0.008, 0.008, SLATE); m.win(T, 0, yr0 + 0.046, 0.004, 0.005, 0.002, '#cfd6dc', undefined, 'rect'); }

  // ---- Old Town (east bank): red-roofed houses and St Francis dome -------------------------------------
  const WALL = ['#e8d9b5', '#d9b77f', '#efe6d2', '#c9a37a', '#e3c9a0', '#f1ead8', '#d6a46e'];
  let hk = 0;
  for (const x of [0.375, 0.445]) for (let z = -0.33; z <= 0.33; z += 0.072) {
    if (Math.abs(z) < 0.05 && x < 0.4) continue;
    if (Math.hypot(x + 0.03, Math.abs(z) + 0.035) > RQ) continue;
    if (x < 0.4 && z > 0.07 && z < 0.2) continue;
    const h = 0.045 + hash3(x * 10, z * 10, 1) * 0.03, T = xform(x, 0, z, -Math.PI / 2);
    house(m, T, 0, yK, 0, 0.068, h, 0.06, WALL[hk % WALL.length], shade(ROOF, 0.9 + 0.15 * hash3(hk, 1, 1)), 0.9);
    for (let f = 0; f < Math.floor(h / 0.014); f++) for (let i = 0; i < 4; i++) m.win(T, -0.024 + i * 0.016, yK + 0.008 + f * 0.014, 0.0055, 0.0085, 0.03, '#3a3f46', undefined, 'rect');
    hk++;
  }
  const xF = 0.375, zF = 0.135;
  m.box(ID, xF, yK, zF, 0.06, 0.05, 0.06, '#e6dcc4');
  for (let i = 0; i < 3; i++) m.win(xform(xF - 0.03, 0, zF, -Math.PI / 2), -0.018 + i * 0.018, yK + 0.012, 0.008, 0.024, 0, '#3a3f46', '#f4efe2', 'arch');
  m.prism(ID, xF, yK + 0.05, zF, 0.022, 0.016, 12, '#e6dcc4');
  m.rev(ID, xF, yK + 0.066, zF, [[0.024, 0], [0.022, 0.012], [0.015, 0.024], [0.006, 0.03], [0, 0.031]], 12, (i) => (i % 3 ? '#5c9a83' : '#6dab93'));
  m.prism(ID, xF, yK + 0.096, zF, 0.004, 0.012, 8, '#5c9a83', 0.001);
  m.box(ID, xF, yK + 0.108, zF, 0.0012, 0.012, 0.0012, GOLD);

  // ---- Malá Strana (west bank) and a hint of Prague Castle with St Vitus -------------------------------
  for (const [x, z] of [[-0.41, 0.09], [-0.41, 0.17], [-0.41, 0.25], [-0.46, 0.13], [-0.46, 0.06]] as [number, number][]) {
    if (Math.hypot(x - 0.03, Math.abs(z) + 0.035) > RQ) continue;
    const h = 0.04 + hash3(x * 9, z * 9, 2) * 0.02, T = xform(x, 0, z, Math.PI / 2);
    house(m, T, 0, yL, 0, 0.068, h, 0.05, WALL[hk++ % WALL.length], ROOF, 0.9);
    for (let i = 0; i < 4; i++) m.win(T, -0.024 + i * 0.016, yL + 0.016, 0.0055, 0.0085, 0.025, '#3a3f46', undefined, 'rect');
  }
  for (const [x, z] of [[-0.395, -0.075], [-0.385, -0.115], [-0.385, 0.32]] as [number, number][]) leafTree(m, x, yL, z, 0.05, '#55803f');
  // Lesser Town Bridge Tower: gate passage under a tall Gothic tower with steep slate roof and turrets
  const xL = -0.445, LX = 0.046, yL1 = yD + 0.15;
  m.arch(xform(xL, 0, 0, Math.PI / 2), 0, yD - 0.004, TZ, 0.07, LX, 2 * HD - 0.012, 0, 0.055, TST, 'pointed', 10, false, true, '#3a352f');
  m.box(ID, xL, yD + 0.066, 0, LX, yL1 - yD - 0.066, TZ, TST);
  m.box(ID, xL, yD - 0.004, 0, LX, 0.004, TZ, TST2);
  for (const sx of [-1, 1]) {
    const T = xform(xL + (sx * LX) / 2, 0, 0, (sx * Math.PI) / 2);
    m.box(T, 0, yD + 0.066, 0.001, TZ + 0.002, 0.004, 0.003, TST2);
    for (const px of [-0.018, 0, 0.018]) m.win(T, px, yD + 0.085, 0.007, 0.026, 0.0005, '#3d516a', TST2, 'pointed');
    for (let i = 0; i < 6; i++) m.win(T, -0.026 + i * 0.0104, yD + 0.125, 0.005, 0.01, 0.0005, '#3a352f', undefined, 'pointed');
  }
  m.box(ID, xL, yL1 - 0.01, 0, LX + 0.005, 0.01, TZ + 0.005, TST2);
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
    const x = xL + (cx * LX) / 2, z = (cz * TZ) / 2;
    m.prism(ID, x, yL1 - 0.01, z, 0.0055, 0.016, 6, TST);
    m.prism(ID, x, yL1 + 0.006, z, 0.006, 0.034, 6, SLATE, 0);
  }
  const P0: V3 = [xL - 0.018, yL1, -0.03], P1: V3 = [xL + 0.018, yL1, -0.03], P2: V3 = [xL + 0.018, yL1, 0.03], P3: V3 = [xL - 0.018, yL1, 0.03], Qa: V3 = [xL, yL1 + 0.085, -0.006], Qb: V3 = [xL, yL1 + 0.085, 0.006];
  m.quad(P0, P3, Qb, Qa, SLATE, [-1, 0.4, 0]); m.quad(P1, P2, Qb, Qa, shade(SLATE, 0.9), [1, 0.4, 0]);
  m.tri(P0, P1, Qa, shade(SLATE, 0.95), [0, 0.4, -1]); m.tri(P3, P2, Qb, shade(SLATE, 0.95), [0, 0.4, 1]);
  for (const z of [-0.006, 0.006]) m.blob(ID, xL, yL1 + 0.09, z, 0.003, 0.003, 0.003, GOLD, 6);
  const yC = yL + 0.035;
  for (const [x, z] of [[-0.385, -0.17], [-0.39, -0.24], [-0.385, -0.31]] as [number, number][]) leafTree(m, x, yC, z, 0.045, '#4f7a3a');
  m.box(ID, -0.44, yC, -0.25, 0.04, 0.032, 0.16, '#ece4d0');
  m.poly(xform(-0.44, 0, -0.25), [[-0.023, yC + 0.032], [0.023, yC + 0.032], [0, yC + 0.046]], -0.08, 0.08, '#5f7f74');
  for (let f = 0; f < 2; f++) for (let i = 0; i < 10; i++) m.win(xform(-0.42, 0, -0.25, Math.PI / 2), -0.072 + i * 0.016, yC + 0.008 + f * 0.012, 0.005, 0.007, 0, '#3a3f46', undefined, 'rect');
  m.box(ID, -0.455, yC, -0.36, 0.03, 0.05, 0.05, '#cfc7b4');
  m.prism(ID, -0.455, yC + 0.05, -0.36, 0.012, 0.03, 8, '#cfc7b4');
  m.rev(ID, -0.455, yC + 0.08, -0.36, [[0.014, 0], [0.012, 0.012], [0.005, 0.022], [0.003, 0.03], [0, 0.05]], 8, '#5c9a83');
  for (const z of [-0.335, -0.315]) m.prism(ID, -0.47, yC + 0.02, z, 0.007, 0.075, 4, '#4f4b45', 0, Math.PI / 4);
  m.box(ID, -0.47, yC, -0.325, 0.022, 0.05, 0.03, '#58534b');
  // tour boat
  const Tb = xform(-0.06, yW, -0.2, 0.3);
  m.box(Tb, 0, 0, 0, 0.024, 0.006, 0.09, '#f1efe8', true);
  m.box(Tb, 0, 0.006, -0.004, 0.02, 0.008, 0.06, '#3f4d5c');
  m.box(Tb, 0, 0.014, -0.004, 0.021, 0.0012, 0.062, '#c2412d');
  const Tc = xform(0.12, yW, 0.24, -0.5);
  m.box(Tc, 0, 0, 0, 0.022, 0.005, 0.075, '#3c4a5a', true);
  m.box(Tc, 0, 0.005, 0.006, 0.018, 0.007, 0.04, '#efe9da');
  for (let i = 0; i < 5; i++) person(m, 0.11 + i * 0.006, yW + 0.005, 0.2 + i * 0.012, i + 3, 0.007);
  for (const [x, z, a] of [[-0.18, 0.3, 0.8], [0.02, 0.38, -0.3], [-0.26, -0.33, 0.2]] as [number, number, number][]) {
    const T = xform(x, yW, z, a);
    m.poly(xform(x, yW, z, a + Math.PI / 2), [[-0.014, 0.004], [0.014, 0.004], [0.01, 0], [-0.01, 0]], -0.0045, 0.0045, a > 0 ? '#6b4b2e' : '#2f6f8f');
    m.box(T, 0, 0.002, 0, 0.004, 0.002, 0.004, '#f2efe6');
  }
  for (const [x, z] of [[-0.12, 0.17], [-0.105, 0.185], [0.05, -0.27]] as [number, number][]) {
    m.blob(ID, x, yW + 0.002, z, 0.004, 0.0028, 0.006, '#f6f4ee', 5);
    m.beam([x, yW + 0.004, z + 0.004], [x, yW + 0.011, z + 0.007], 0.0018, '#f6f4ee');
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Trevi Fountain, Rome. Palazzo Poli's travertine front: wings of three bays with giant Corinthian pilasters,
// pedimented piano-nobile windows with balconies, mezzanine and attic windows, balustrade; the projecting
// triumphal-arch centre with four free-standing Corinthian columns, the coffered exedra holding Oceanus on his
// shell chariot, side niches with Abundance and Health, reliefs above, the attic with four statues, the
// inscription and the papal crest held by two Fames. In front the scogliera: tumbled travertine reefs with the
// agitated and the calm sea horse, tritons, cascades into the turquoise basin; rim, steps, crowds and the
// ochre palazzi that hem the tiny piazza in.

/** Horizontal band between an inner and outer curve sampled over t0..t1: top at y1, inner (1) / outer (2) walls from y0. */
function band(m: Mesh3, inner: (t: number) => [number, number], outer: (t: number) => [number, number], t0: number, t1: number, n: number, y0: number, y1: number, c: string | ((i: number) => string), walls = 1): void {
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n, b = t0 + ((t1 - t0) * (i + 1)) / n, cc = typeof c === 'string' ? c : c(i);
    const [ax, az] = inner(a), [bx, bz] = inner(b), [cx, cz] = outer(b), [dx, dz] = outer(a);
    const ox = cx + dx - ax - bx, oz = cz + dz - az - bz;
    m.tri([ax, y1, az], [cx, y1, cz], [dx, y1, dz], shade(cc, 1.04), [0, 1, 0]);
    if (Math.hypot(bx - ax, bz - az) > 1e-6) m.tri([ax, y1, az], [bx, y1, bz], [cx, y1, cz], shade(cc, 1.04), [0, 1, 0]);
    if (walls & 1) m.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], shade(cc, 0.86), [-ox, 0, -oz]);
    if (walls & 2) m.quad([dx, y0, dz], [cx, y0, cz], [cx, y1, cz], [dx, y1, dz], shade(cc, 0.9), [ox, 0, oz]);
  }
}
/** Small marble figure (world coords) facing +z: drapery, torso, head and a gesturing arm. */
/** Carved statue on the human rig, all one stone colour: 0 arm out, 1 arm raised, 2/3 holding an urn/shell. */
function figure(m: Mesh3, x: number, y: number, z: number, h: number, c: string, pose = 0): void {
  const s = pose % 2 ? 1 : -1, hold = pose >= 2;
  const lead: V3 = pose === 1 ? [s * 0.22, 1.06, 0.08] : hold ? [s * 0.1, 0.6, 0.16] : [s * 0.33, 0.66, 0.12];
  const rest: V3 = hold ? [-s * 0.1, 0.62, 0.16] : [-s * 0.19, 0.5, 0.05];
  const hands: [V3, V3] = s > 0 ? [rest, lead] : [lead, rest];
  soupOf(m.pos, m.col, g => {
    human(g, x, y, z, { h, ry: 0, pose: 'stand', top: c, bottom: c, skin: c, hair: shade(c, 0.94), shoes: c, dress: 'ankle', sleeve: 0.3, hands, detail: 'lo' });
    if (hold) add(g, SPH(6), mat(shade(c, 0.95)), x, y + h * 0.6, z + h * 0.2, h * 0.22, h * 0.26, h * 0.16);
  });
}
const cobble = (base: string) => (x: number, _y: number, z: number): string => {
  const h = hash3(Math.floor(x * 70), 5, Math.floor(z * 70));
  return shade(base, 0.93 + h * 0.12);
};

const trevi: Builder = (gp) => {
  const TRV = '#eee4cf', TRV2 = '#dccfb6', TRV3 = '#c9bb9f', MARB = '#f6f2e8', ROCK = '#e2d7bf', WIN = '#53625a';
  const WATER = '#38bdb5', FALL = '#d9f4f1';
  const Y = 0.037, ZF = -0.025, A = 0.27, BZ = 0.235, RQ = 0.497, PY = Y + 0.03;
  island(gp, 0.5, () => 0.002, '#b9ab92', cobble('#b9ab92'), { rings: 14, segs: 72, side: strataSide(EARTH) });
  const m = new Mesh3();
  // ---- Basin, rim, walkway, steps and raised piazza ----------------------------------------------------
  const E = (a: number, b: number) => (t: number): [number, number] => [a * Math.cos(t), ZF + b * Math.sin(t)];
  const D = (t: number): [number, number] => {
    const c = Math.cos(t), s = Math.sin(t), k = -ZF * s + Math.sqrt(ZF * ZF * s * s - ZF * ZF + (RQ - 0.002) ** 2);
    return [c * k, ZF + s * k];
  };
  const N = 40;
  band(m, E(0, 0), E(A, BZ), 0, Math.PI, N, Y, Y + 0.004, (i) => (hash3(i, 2, 9) > 0.8 ? shade(WATER, 1.08) : WATER), 0);
  band(m, E(A * 0.55, BZ * 0.55), E(A * 0.75, BZ * 0.7), 0.3, Math.PI - 0.3, 18, Y, Y + 0.0045, (i) => (i % 3 ? '#4fcac2' : '#6fd6cf'), 0);
  band(m, E(A, BZ), E(A + 0.012, BZ + 0.012), 0, Math.PI, N, Y, Y + 0.016, TRV, 3);
  band(m, E(A + 0.012, BZ + 0.012), E(A + 0.044, BZ + 0.044), 0, Math.PI, N, Y, Y + 0.006, '#c9bea6', 0);
  for (let k = 0; k < 4; k++) {
    const r0 = A + 0.044 + k * 0.011, b0 = BZ + 0.044 + k * 0.011;
    band(m, E(r0, b0), E(r0 + 0.011, b0 + 0.011), 0, Math.PI, N, Y, Y + 0.006 * (k + 2), k % 2 ? TRV2 : '#e0d8c6', 1);
  }
  band(m, E(A + 0.088, BZ + 0.088), D, 0, Math.PI, N, Y, PY, (i) => shade('#c4b69b', 0.98 + 0.03 * hash3(i, 4, 4)), 2);

  // ---- Palazzo Poli -------------------------------------------------------------------------------------
  const T = xform(0, 0, ZF);
  const H0 = Y + 0.03, H1 = Y + 0.215, H2 = Y + 0.24, H3 = Y + 0.285, H4 = Y + 0.315, FW = 0.6;
  m.box(ID, 0, Y, ZF - 0.125, FW, H3 - Y, 0.25, TRV);
  m.plan(ID, [[-0.3, ZF - 0.25], [0.3, ZF - 0.25], [0.3, ZF], [-0.3, ZF]], H3, H3 + 0.003, TRV2);
  for (const [z0, z1] of [[ZF - 0.12, ZF - 0.02], [ZF - 0.24, ZF - 0.13]]) {
    const P0: V3 = [-0.29, H3 + 0.003, z0], P1: V3 = [0.29, H3 + 0.003, z0], P2: V3 = [0.29, H3 + 0.003, z1], P3: V3 = [-0.29, H3 + 0.003, z1];
    const R0: V3 = [-0.25, H3 + 0.016, (z0 + z1) / 2], R1: V3 = [0.25, H3 + 0.016, (z0 + z1) / 2];
    m.quad(P0, P1, R1, R0, '#9c6b52', [0, 1, -1]); m.quad(P3, P2, R1, R0, '#a8735a', [0, 1, 1]);
    m.tri(P0, P3, R0, '#94654d', [-1, 1, 0]); m.tri(P1, P2, R1, '#94654d', [1, 1, 0]);
  }
  m.box(T, 0, Y, 0.003, FW, H0 - Y, 0.006, TRV2);
  m.box(T, 0, H0 - 0.004, 0.0035, FW, 0.004, 0.008, TRV3);
  m.box(T, 0, H1, 0.004, FW, H2 - H1, 0.008, TRV2);
  m.box(T, 0, H1 + 0.009, 0.0085, FW + 0.002, 0.0012, 0.001, TRV3);
  m.box(T, 0, H2 - 0.004, 0.006, FW + 0.012, 0.005, 0.014, MARB);
  m.box(T, 0, H3 - 0.003, 0.004, FW + 0.006, 0.004, 0.01, TRV2);
  for (const sx of [-1, 1]) {
    for (const px of [0.18, 0.24, 0.293]) {
      const x = sx * px;
      m.box(T, x, H0, 0.008, 0.016, H1 - H0, 0.006, MARB);
      m.box(T, x, H0, 0.009, 0.02, 0.006, 0.008, TRV2);
      m.box(T, x, H1 - 0.012, 0.012, 0.022, 0.012, 0.006, TRV2);
      for (let j = 0; j < 3; j++) m.blob(ID, x + (j - 1) * 0.007, H1 - 0.007, ZF + 0.016, 0.004, 0.005, 0.003, MARB, 4);
      m.box(T, x, H2, 0.006, 0.014, H3 - H2, 0.006, TRV2);
    }
    for (const bx of [0.15, 0.21, 0.27]) {
      const x = sx * bx;
      m.win(T, x, H0 + 0.01, 0.02, 0.02, 0.006, WIN, MARB, 'rect');
      m.box(T, x, H0 + 0.006, 0.009, 0.03, 0.004, 0.008, TRV2);
      m.box(T, x, H0 + 0.044, 0.01, 0.034, 0.003, 0.012, TRV2);
      for (let b = 0; b < 5; b++) m.box(T, x - 0.012 + b * 0.006, H0 + 0.047, 0.014, 0.0025, 0.007, 0.0025, MARB);
      m.box(T, x, H0 + 0.054, 0.014, 0.034, 0.002, 0.004, MARB);
      m.win(T, x, H0 + 0.05, 0.024, 0.042, 0.006, WIN, MARB, 'rect');
      m.box(T, x, H0 + 0.096, 0.008, 0.034, 0.003, 0.006, MARB);
      m.poly(T, [[x - 0.018, H0 + 0.099], [x + 0.018, H0 + 0.099], [x, H0 + 0.111]], 0.005, 0.011, MARB);
      m.win(T, x, H0 + 0.125, 0.022, 0.032, 0.006, WIN, MARB, 'rect');
      m.box(T, x, H0 + 0.161, 0.008, 0.03, 0.003, 0.005, MARB);
      m.win(T, x, H2 + 0.012, 0.02, 0.016, 0.006, WIN, MARB, 'rect');
    }
    for (let b = 0; b < 22; b++) m.box(T, sx * (0.125 + b * 0.0082), H3 + 0.003, 0.003, 0.003, 0.008, 0.003, MARB);
    m.box(T, sx * 0.21, H3 + 0.011, 0.003, 0.18, 0.003, 0.006, MARB);
    for (const px of [0.18, 0.24, 0.293]) m.box(T, sx * px, H3 + 0.003, 0.003, 0.008, 0.011, 0.006, MARB);
    for (const px of [0.18, 0.24, 0.293]) m.prism(ID, sx * px, H3 + 0.014, ZF + 0.003, 0.004, 0.01, 6, MARB, 0.002);
  }
  // projecting centre: triumphal arch
  const CW = 0.25, CZ = 0.014;
  m.box(T, 0, Y, CZ / 2, CW, H4 - Y, CZ, TRV);
  m.box(T, 0, H1, CZ + 0.004, CW + 0.006, H2 - H1, 0.008, TRV2);
  m.box(T, 0, H2 - 0.004, CZ + 0.006, CW + 0.016, 0.005, 0.014, MARB);
  m.box(T, 0, H4 - 0.004, CZ + 0.002, CW + 0.006, 0.005, 0.01, MARB);
  const CX = [-0.105, -0.05, 0.05, 0.105];
  for (const x of CX) {
    const zc = ZF + CZ + 0.014;
    m.box(ID, x, Y, zc - 0.004, 0.028, H0 - Y + 0.012, 0.034, TRV2);
    m.prism(ID, x, H0 + 0.012, zc, 0.012, 0.006, 10, MARB);
    m.prism(ID, x, H0 + 0.018, zc, 0.0095, H1 - H0 - 0.034, 10, MARB, 0.0085);
    m.prism(ID, x, H1 - 0.016, zc, 0.0088, 0.012, 10, '#e2dccd', 0.0135);
    for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; m.blob(ID, x + Math.cos(a) * 0.009, H1 - 0.01, zc + Math.sin(a) * 0.009, 0.004, 0.005, 0.004, MARB, 4); }
    m.box(ID, x, H1 - 0.004, zc, 0.03, 0.004, 0.03, TRV2);
    m.box(ID, x, H1, zc - 0.004, 0.032, H2 - H1, 0.038, TRV2);
    m.box(ID, x, H2 - 0.004, zc - 0.004, 0.036, 0.005, 0.044, MARB);
    m.box(ID, x, H2 + 0.001, zc - 0.006, 0.02, 0.008, 0.016, TRV2);
    figure(m, x, H2 + 0.009, zc - 0.004, 0.042, MARB, (CX.indexOf(x) % 2) + 1);
  }
  // exedra with coffered half-dome, inner columns and Oceanus
  const zN = CZ + 0.0005, aw = 0.072, sY = H0 + 0.12;
  m.win(T, 0, H0 - 0.004, aw + 0.012, sY - H0 + 0.004 + aw * 0.5, zN, MARB, undefined, 'arch');
  m.win(T, 0, H0, aw, sY - H0 + aw * 0.5, zN + 0.0006, '#b3a68f', undefined, 'arch');
  annulus(m, T, 0, sY, 0, aw / 2 - 0.002, zN + 0.0016, '#a3967e', 12, 0, Math.PI);
  for (const r of [0.012, 0.022, 0.031]) annulus(m, T, 0, sY, r, r + 0.0018, zN + 0.0022, '#d6ccb7', 12, 0, Math.PI);
  for (let j = 1; j < 6; j++) { const a = (j / 6) * Math.PI; m.strut(T, Math.cos(a) * 0.006, sY + Math.sin(a) * 0.006, Math.cos(a) * 0.033, sY + Math.sin(a) * 0.033, 0.0016, 0.0008, '#d6ccb7', zN + 0.0024); }
  for (const x of [-0.028, -0.016, 0.016, 0.028]) m.prism(ID, x, H0, ZF + zN + 0.004, 0.0035, sY - H0, 8, MARB);
  m.box(T, 0, sY - 0.004, zN + 0.004, aw, 0.004, 0.008, TRV2);
  for (const sx of [-1, 1]) {
    const x = sx * 0.0775;
    m.win(T, x, H0 + 0.018, 0.026, 0.07, zN, '#c3b79f', MARB, 'arch');
    m.box(T, x, H0 + 0.016, zN + 0.004, 0.02, 0.004, 0.008, TRV2);
    figure(m, x, H0 + 0.02, ZF + zN + 0.006, 0.055, MARB, sx > 0 ? 0 : 3);
    m.box(T, x, H0 + 0.115, zN + 0.001, 0.032, 0.036, 0.002, MARB);
    m.box(T, x, H0 + 0.118, zN + 0.003, 0.026, 0.03, 0.001, '#ddd5c4');
    for (let j = 0; j < 3; j++) m.blob(ID, x - 0.008 + j * 0.008, H0 + 0.125 + (j % 2) * 0.006, ZF + zN + 0.005, 0.0035, 0.0065, 0.0016, MARB, 4);
  }
  // attic: inscription, balustrade, papal crest with two Fames
  m.box(T, 0, H2 + 0.012, CZ + 0.001, 0.07, 0.03, 0.002, MARB);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) if (hash3(r, i, 3) > 0.2) m.box(T, -0.028 + i * 0.007, H2 + 0.03 - r * 0.007, CZ + 0.0025, 0.005, 0.0026, 0.0008, '#6a6355');
  for (let b = 0; b < 30; b++) m.box(T, -0.12 + b * 0.0083, H4, CZ - 0.002, 0.003, 0.009, 0.003, MARB);
  m.box(T, 0, H4 + 0.009, CZ - 0.002, CW, 0.003, 0.006, MARB);
  const cY = H4 + 0.004, cz = ZF + CZ + 0.002;
  m.box(ID, 0, H4 - 0.004, cz - 0.004, 0.06, 0.012, 0.014, TRV2);
  m.poly(xform(0, 0, cz), [[-0.017, cY + 0.006], [0.017, cY + 0.006], [0.02, cY + 0.03], [0.013, cY + 0.045], [-0.013, cY + 0.045], [-0.02, cY + 0.03]], -0.003, 0.004, MARB);
  m.poly(xform(0, 0, cz), [[-0.011, cY + 0.012], [0.011, cY + 0.012], [0.012, cY + 0.033], [0, cY + 0.038], [-0.012, cY + 0.033]], 0.004, 0.006, '#e3dccc');
  m.prism(ID, 0, cY + 0.045, cz, 0.009, 0.006, 8, MARB, 0.008);
  m.prism(ID, 0, cY + 0.051, cz, 0.008, 0.006, 8, MARB, 0.0065);
  m.prism(ID, 0, cY + 0.057, cz, 0.0065, 0.008, 8, MARB, 0.002);
  m.blob(ID, 0, cY + 0.067, cz, 0.0025, 0.0025, 0.0025, MARB, 5);
  for (const sx of [-1, 1]) {
    m.blob(ID, sx * 0.03, cY + 0.02, cz + 0.002, 0.007, 0.013, 0.006, MARB, 5);
    m.blob(ID, sx * 0.031, cY + 0.037, cz + 0.002, 0.004, 0.005, 0.004, MARB, 5);
    m.beam([sx * 0.026, cY + 0.032, cz + 0.002], [sx * 0.012, cY + 0.06, cz + 0.004], 0.0035, MARB);
    m.beam([sx * 0.035, cY + 0.033, cz + 0.004], [sx * 0.048, cY + 0.04, cz + 0.006], 0.0018, '#e3dccc');
    m.blob(ID, sx * 0.037, cY + 0.028, cz - 0.004, 0.003, 0.012, 0.007, '#e3dccc', 4);
    m.blob(ID, sx * 0.04, cY + 0.006, cz + 0.004, 0.014, 0.005, 0.007, MARB, 5);
  }

  // ---- Scogliera: travertine reefs, sea horses, tritons, Oceanus, cascades ------------------------------
  for (let i = 0; i < 160; i++) {
    const u = hash3(i, 1, 7) * 2 - 1, x = u * 0.29, fall = 1 - Math.min(1, Math.abs(x) / 0.3);
    const zd = 0.01 + hash3(i, 2, 7) * (0.025 + 0.075 * fall * fall), yt = Y + 0.008 + (0.4 + 0.6 * hash3(i, 3, 7)) * (0.016 + 0.05 * fall) * (1 - zd / 0.16);
    const r = 0.009 + hash3(i, 4, 7) * 0.012, zz = ZF + 0.012 + zd;
    if (Math.abs(x) < A - 0.01 || zz < ZF + 0.02) {
      const c = hash3(i, 5, 7) > 0.6 ? shade(ROCK, 0.88) : hash3(i, 6, 7) > 0.5 ? ROCK : TRV2;
      m.blob(ID, x, Math.max(Y, yt - r * 0.5), zz, r * 1.2, r * 0.75 + (yt - Y) * 0.4, r, c, 6);
    }
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
    const x = sx * (0.13 + i * 0.026), zz = ZF + 0.012 + hash3(i, sx, 3) * 0.015;
    m.blob(ID, x, Y, zz, 0.018, 0.02 + hash3(i, sx, 4) * 0.018, 0.013, i % 2 ? ROCK : TRV2, 6);
  }
  // Oceanus on the shell chariot
  const zO = ZF + CZ + 0.03, yO = Y + 0.05;
  m.blob(ID, 0, Y + 0.02, zO + 0.01, 0.04, 0.032, 0.03, ROCK, 7);
  m.rev(ID, 0, yO - 0.004, zO + 0.004, [[0.004, 0], [0.024, 0.004], [0.026, 0.008], [0, 0.01]], 10, (i) => (i % 2 ? MARB : '#e3dccc'));
  m.prism(ID, 0, yO + 0.006, zO, 0.009, 0.026, 6, MARB, 0.006);
  m.box(ID, 0, yO + 0.03, zO, 0.016, 0.016, 0.009, MARB);
  m.blob(ID, 0, yO + 0.052, zO + 0.001, 0.0045, 0.0055, 0.0045, MARB, 5);
  m.blob(ID, 0, yO + 0.046, zO + 0.004, 0.004, 0.004, 0.002, '#e3dccc', 4);
  m.beam([0.008, yO + 0.042, zO], [0.016, yO + 0.03, zO + 0.006], 0.0035, MARB);
  m.beam([-0.008, yO + 0.042, zO], [-0.012, yO + 0.03, zO + 0.004], 0.0035, MARB);
  m.beam([-0.014, yO + 0.01, zO + 0.006], [-0.012, yO + 0.068, zO + 0.004], 0.0016, MARB);
  m.blob(ID, 0.006, yO + 0.024, zO - 0.006, 0.014, 0.02, 0.006, '#e8e2d4', 5);
  // sea horses (agitated left, calm right) and tritons
  for (const sx of [-1, 1]) {
    const k = 1.55, x = sx * 0.078, z = ZF + 0.125, y = Y + 0.02, rear = sx < 0;
    m.blob(ID, x, Y, z - 0.01, 0.024, 0.016, 0.026, ROCK, 6);
    m.blob(ID, x, y, z, 0.01 * k, 0.009 * k, 0.017 * k, MARB, 6);
    const nk: V3 = [x, y + (rear ? 0.026 : 0.019) * k, z + 0.018 * k];
    m.beam([x, y + 0.006 * k, z + 0.01 * k], nk, 0.009 * k, MARB, 0.008 * k);
    m.blob(ID, nk[0], nk[1] + 0.003 * k, nk[2] + 0.005 * k, 0.0045 * k, 0.005 * k, 0.009 * k, MARB, 5);
    m.box(ID, nk[0], nk[1] - 0.004 * k, nk[2] - 0.004 * k, 0.002 * k, 0.012 * k, 0.006 * k, '#e3dccc');
    for (const lx of [-0.004, 0.004]) {
      const kn: V3 = [x + lx * k, y + (rear ? 0.014 : -0.002) * k, z + 0.026 * k];
      m.beam([x + lx * k, y + 0.002 * k, z + 0.012 * k], kn, 0.0035 * k, MARB);
      m.beam(kn, [x + lx * k, y + (rear ? 0.004 : -0.01) * k, z + (rear ? 0.034 : 0.028) * k], 0.003 * k, MARB);
    }
    for (let j = 0; j < 4; j++) m.blob(ID, x + sx * (0.006 + j * 0.006) * k, y + (-0.002 + j * 0.006) * k, z - (0.014 + j * 0.007) * k, (0.006 - j * 0.001) * k, (0.005 - j * 0.0008) * k, 0.006 * k, '#e8e2d4', 5);
    const tx = sx * 0.13, tz = ZF + 0.1;
    m.blob(ID, tx, Y, tz - 0.005, 0.02, 0.022, 0.018, ROCK, 6);
    m.blob(ID, tx, Y + 0.036, tz, 0.011, 0.016, 0.009, MARB, 5);
    m.blob(ID, tx, Y + 0.058, tz + 0.001, 0.0055, 0.0065, 0.0055, MARB, 5);
    m.beam([tx - sx * 0.008, Y + 0.046, tz], [x + sx * 0.012, Y + 0.05, z + 0.025], 0.004, MARB);
    if (sx > 0) m.prism(ID, tx + 0.008, Y + 0.048, tz + 0.004, 0.004, 0.02, 5, MARB, 0.0014);
    else m.beam([tx + 0.008, Y + 0.046, tz], [tx + 0.014, Y + 0.06, tz + 0.006], 0.0035, MARB);
    m.beam([tx, Y + 0.026, tz], [tx + sx * 0.016, Y + 0.012, tz - 0.016], 0.008, '#e8e2d4');
  }
  // cascades
  m.box(ID, 0, Y + 0.004, ZF + 0.118, 0.11, 0.012, 0.004, FALL);
  m.box(ID, 0, Y + 0.016, ZF + 0.106, 0.075, 0.014, 0.004, FALL);
  m.box(ID, 0, Y + 0.03, ZF + 0.088, 0.04, 0.016, 0.003, FALL);
  m.plan(ID, [[-0.055, ZF + 0.106], [0.055, ZF + 0.106], [0.055, ZF + 0.118], [-0.055, ZF + 0.118]], Y + 0.0155, Y + 0.016, '#7fdad3', true);
  m.plan(ID, [[-0.038, ZF + 0.088], [0.038, ZF + 0.088], [0.038, ZF + 0.106], [-0.038, ZF + 0.106]], Y + 0.0295, Y + 0.03, '#7fdad3', true);
  for (const sx of [-1, 1]) for (const [x, z, h] of [[0.15, ZF + 0.07, 0.02], [0.2, ZF + 0.05, 0.016], [0.035, ZF + 0.12, 0.008]]) m.box(ID, sx * x, Y + 0.003, z, 0.024, h, 0.003, FALL);
  for (let i = 0; i < 16; i++) { const t = 0.4 + hash3(i, 1, 2) * (Math.PI - 0.8), r = 0.3 + hash3(i, 2, 2) * 0.55; const [x, z] = E(A * r, BZ * r)(t); m.box(ID, x, Y + 0.004, z, 0.0016, 0.0003, 0.0016, i % 3 ? '#e2c26a' : '#c9cdd2'); }

  // ---- Piazza: tourists, ochre palazzi --------------------------------------------------------------------
  for (let i = 0; i < 110; i++) {
    const t = 0.15 + hash3(i, 1, 4) * (Math.PI - 0.3), w = hash3(i, 2, 4);
    const [x, z] = w < 0.35 ? E(A + 0.02 + w * 0.06, BZ + 0.02 + w * 0.06)(t) : E(A + 0.1 + (w - 0.35) * 0.3, BZ + 0.1 + (w - 0.35) * 0.3)(t);
    if (Math.hypot(x, z) > RQ - 0.02 || Math.abs(x) > 0.33) continue;
    person(m, x, w < 0.35 ? Y + 0.006 : PY, z, i, 0.0095);
  }
  const OCH = ['#d58a4c', '#c9703f', '#e2a95f', '#d99a5b', '#c4633a', '#e4b77a'];
  for (const sx of [-1, 1]) {
    const blocks: [number, number, number][] = [[-0.38, -0.18, 0.19], [-0.18, 0.02, 0.22], [0.02, 0.2, 0.17]];
    blocks.forEach(([z0, z1, h], k) => {
      const c = OCH[(k + (sx > 0 ? 3 : 0)) % OCH.length], x0 = 0.338, yb = z1 <= ZF ? Y : Y;
      const pts = clipDisc(RQ - 0.006, x0, 1, z0, z1, 48).map(([x, z]) => [sx * x, z] as [number, number]);
      if (sx < 0) pts.reverse();
      const top = PY + h;
      m.plan(ID, pts, yb, top, c);
      m.plan(ID, pts.map(([x, z]) => [x + (x > 0 ? 0.002 : -0.002) * 0, z] as [number, number]), top, top + 0.006, '#b4623c');
      const Tf = xform(sx * x0, 0, (z0 + z1) / 2, -sx * Math.PI / 2), L = z1 - z0, nw = Math.floor(L / 0.03);
      for (let f = 0; f < 5; f++) for (let i = 0; i < nw; i++) {
        const wx = -L / 2 + (i + 0.5) * (L / nw), wy = PY + 0.012 + f * 0.032;
        if (wy + 0.022 > top) continue;
        if (f === 0) { m.win(Tf, wx, PY, 0.016, 0.022, 0, '#3d3a36', undefined, 'arch'); continue; }
        m.win(Tf, wx, wy, 0.011, 0.018, 0, '#3a4a40', '#efe6d2', 'rect');
        m.box(Tf, wx - 0.0085, wy, 0.0006, 0.005, 0.018, 0.0012, '#3f6b4a');
        m.box(Tf, wx + 0.0085, wy, 0.0006, 0.005, 0.018, 0.0012, '#3f6b4a');
      }
      m.box(Tf, 0, top - 0.006, 0.002, L, 0.006, 0.004, shade(c, 1.12));
      if (k === 2) {
        const zf = z1, xs = Math.sqrt((RQ - 0.006) ** 2 - zf * zf), W = xs - x0, Tz = xform(sx * (x0 + W / 2), 0, zf);
        for (let f = 1; f < 5; f++) for (let i = 0; i < Math.floor(W / 0.03); i++) {
          const wx = -W / 2 + 0.015 + i * 0.03, wy = PY + 0.012 + f * 0.032;
          if (wy + 0.022 > top) continue;
          m.win(Tz, wx, wy, 0.011, 0.018, 0, '#3a4a40', '#efe6d2', 'rect');
        }
        m.win(Tz, 0, PY, 0.04, 0.02, 0, '#2f3a34', undefined, 'rect');
        m.box(Tz, 0, PY + 0.02, 0.006, 0.05, 0.002, 0.012, '#2e5b3c');
      }
    });
  }
  for (const [x, z] of [[-0.12, 0.33], [0.14, 0.31], [0.0, 0.4]] as [number, number][]) {
    m.prism(ID, x, PY, z, 0.0014, 0.05, 5, '#2b2d30');
    m.box(ID, x, PY + 0.05, z, 0.006, 0.008, 0.006, '#f1e2b2');
  }
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// Hallgrímskirkja, Reykjavík. Guðjón Samúelsson's white concrete church: the tall fluted tower with the deep
// pointed portal, slit window and four clock faces, crowned by a stepped cluster of columns pierced by belfry
// openings; the symmetrical wings whose basalt-column steps fall in a concave curve from the tower, with dark
// roofs behind; the long nave with ribbed walls, tall pointed windows and steep slate roof ending in a ribbed
// apse. In front the patterned plaza and Leif Erikson on his red-granite prow; little Reykjavík houses with
// bright corrugated roofs, streets and cars all around.
const hallgrimskirkja: Builder = (gp) => {
  const CON = '#e4e4df', CON2 = '#cfd0cb', ROOFD = '#4b4f55', GLASS = '#55606b';
  const Y = 0.037, RQ = 0.497, ZT = 0.12, TW = 0.1, TD = 0.1, YS = Y + 0.47;
  island(gp, 0.5, () => 0.002, '#8d9a7c', cobble('#8d9a7c'), { rings: 14, segs: 72, side: strataSide(EARTH) });
  const m = new Mesh3();
  // ---- streets, plaza and pattern -------------------------------------------------------------------------
  const ASPH = '#5d6066';
  for (const sx of [-1, 1]) m.plan(ID, clipDisc(RQ - 0.004, sx > 0 ? 0.24 : -0.29, sx > 0 ? 0.29 : -0.24), Y, Y + 0.002, ASPH);
  m.plan(ID, clipDisc(RQ - 0.004, -0.24, 0.24, 0.42, 1), Y, Y + 0.002, ASPH);
  m.plan(ID, clipDisc(RQ - 0.004, -0.24, 0.24, -1, -0.42), Y, Y + 0.002, ASPH);
  m.plan(ID, [[-0.24, 0.13], [0.24, 0.13], [0.24, 0.42], [-0.24, 0.42]], Y, Y + 0.004, '#c9ccca');
  m.plan(ID, [[-0.24, -0.42], [0.24, -0.42], [0.24, 0.13], [-0.24, 0.13]], Y, Y + 0.003, '#b9bdb8');
  for (let k = -5; k <= 5; k++) {
    const c = k % 2 ? '#9aa09f' : '#a7adab';
    for (const sg of [-1, 1]) {
      const x0 = k * 0.05, z0 = 0.13, L = 0.29;
      const pts: [number, number][] = [];
      for (const t of [0, 1]) pts.push([x0 + sg * t * L, z0 + t * L]);
      const [[ax, az], [bx]] = pts;
      const cx = Math.max(-0.235, Math.min(0.235, bx)), tz = az + Math.abs(cx - ax);
      if (Math.abs(cx - ax) > 0.01) m.beam([ax, Y + 0.0045, az], [cx, Y + 0.0045, Math.min(0.415, tz)], 0.004, c, 0.0006);
    }
  }
  // ---- Tower -------------------------------------------------------------------------------------------
  const zT0 = ZT - TD, zc = ZT - TD / 2;
  m.box(ID, 0, Y, zc, TW, YS - Y, TD, CON);
  const Tf = xform(0, 0, ZT);
  // portal: stepped pointed arches with fluting
  for (let k = 5; k >= 0; k--) m.win(Tf, 0, Y + 0.004, 0.026 + k * 0.007, 0.13 + k * 0.009, 0.0008 + (5 - k) * 0.0007, k % 2 ? CON2 : CON, undefined, 'pointed');
  m.win(Tf, 0, Y + 0.004, 0.026, 0.13, 0.0052, '#9ea29f', undefined, 'pointed');
  m.win(Tf, 0, Y + 0.004, 0.016, 0.05, 0.0058, '#3c3a36', undefined, 'rect');
  m.win(Tf, 0, Y + 0.065, 0.01, 0.055, 0.0058, GLASS, undefined, 'pointed');
  m.win(Tf, 0, Y + 0.19, 0.008, 0.2, 0.0008, '#8d9297', CON2, 'rect');
  for (let i = 0; i < 8; i++) m.box(Tf, 0, Y + 0.2 + i * 0.024, 0.0012, 0.009, 0.002, 0.0012, CON2);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = sx * (0.022 + i * 0.0085);
    m.prism(ID, x, i === 0 ? Y + 0.17 : Y, ZT, 0.0036, YS - (i === 0 ? Y + 0.17 : Y) - 0.002, 6, CON);
  }
  m.prism(ID, 0, Y + 0.395, ZT, 0.0036, YS - Y - 0.397, 6, CON);
  rect4(0, zc, TW / 2, TD / 2, (T, i) => {
    if (i !== 0) for (let j = 0; j < 9; j++) { const x = -0.04 + j * 0.01; m.prism(T, x, Y + (i === 2 ? 0 : 0.2), 0, 0.0034, YS - Y - (i === 2 ? 0 : 0.2) - 0.002, 6, CON2); }
    // clock
    annulus(m, T, 0, YS - 0.035, 0, 0.016, 0.001, '#f4f4f0', 16);
    annulus(m, T, 0, YS - 0.035, 0.0145, 0.017, 0.0016, '#2b2d30', 16);
    m.strut(T, 0, YS - 0.035, 0.0, YS - 0.024, 0.0016, 0.0008, '#2b2d30', 0.002);
    m.strut(T, 0, YS - 0.035, 0.008, YS - 0.039, 0.0016, 0.0008, '#2b2d30', 0.002);
  });
  // stepped columnar crown with belfry openings and copper tip
  m.box(ID, 0, YS - 0.006, zc, TW + 0.006, 0.006, TD + 0.006, CON2);
  const NL = 8, LH = 0.024;
  for (let l = 0; l < NL; l++) {
    const s = TW * (1 - (l / NL) * 0.82), y0 = YS + l * LH, h = l === 0 ? LH * 1.6 : LH;
    m.box(ID, 0, y0, zc, s - 0.006, h + 0.002, s - 0.006, l % 2 ? CON2 : CON);
    rect4(0, zc, s / 2 - 0.003, s / 2 - 0.003, (T) => {
      const n = Math.max(2, Math.round(s / 0.0095));
      for (let j = 0; j < n; j++) {
        const x = -s / 2 + 0.004 + (j * (s - 0.008)) / (n - 1), mid = 1 - Math.abs(x) / (s / 2);
        m.prism(T, x, y0, 0, 0.0032, h + mid * 0.006, 6, CON, 0.0028);
      }
      if (l === 0) for (const x of [-0.026, -0.009, 0.009, 0.026]) m.win(T, x, y0 + 0.006, 0.0075, 0.03, 0.0035, '#2b2e33', undefined, 'pointed');
      if (l === 2 || l === 4) for (const x of [-0.008, 0.008]) m.win(T, x, y0 + 0.006, 0.005, 0.012, 0.0035, '#2b2e33', undefined, 'pointed');
    });
  }
  const yTop = YS + NL * LH;
  m.prism(ID, 0, yTop, zc, 0.012, 0.012, 4, CON, 0.009, Math.PI / 4);
  m.prism(ID, 0, yTop + 0.012, zc, 0.009, 0.03, 4, '#5e9c86', 0, Math.PI / 4);
  m.box(ID, 0, yTop + 0.042, zc, 0.0022, 0.03, 0.0022, '#d9d9d4');
  m.box(ID, 0, yTop + 0.062, zc, 0.014, 0.0022, 0.0022, '#d9d9d4');
  // ---- Basalt-column wings ----------------------------------------------------------------------------
  const NS = 9, SW = 0.0195, ZW1 = ZT - 0.012, ZW0 = -0.05;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < NS; i++) {
      const f = i / (NS - 1), h = 0.1 + 0.3 * (1 - f) ** 2.1, xc = sx * (TW / 2 + (i + 0.5) * SW);
      m.box(ID, xc, Y, ZW1 - 0.015, SW, h, 0.03, i % 2 ? CON : shade(CON, 0.98));
      for (const o of [-0.25, 0.25]) m.prism(ID, xc + o * SW, Y, ZW1, SW * 0.26, h, 8, CON);
      m.blob(ID, xc, Y + h, ZW1 - 0.008, SW * 0.5, 0.004, 0.016, CON2, 6);
      if (i === NS - 1) for (let j = 0; j < 6; j++) m.prism(ID, sx * (TW / 2 + NS * SW), Y, ZW1 - 0.03 - j * 0.026, 0.0065, h - 0.004, 6, CON);
    }
    const xa = sx * TW / 2, xb = sx * (TW / 2 + NS * SW), yw = Y + 0.095, yr = Y + 0.135, zm = (ZW0 + ZW1 - 0.03) / 2;
    m.plan(ID, [[Math.min(xa, xb), ZW0], [Math.max(xa, xb), ZW0], [Math.max(xa, xb), ZW1 - 0.03], [Math.min(xa, xb), ZW1 - 0.03]], Y, yw, CON2);
    const P0: V3 = [xa, yw, ZW0 - 0.004], P1: V3 = [xb, yw, ZW0 - 0.004], P2: V3 = [xb, yw, ZW1 - 0.026], P3: V3 = [xa, yw, ZW1 - 0.026], Ra: V3 = [xa, yr, zm], Rb: V3 = [xb - sx * 0.004, yr, zm];
    m.quad(P0, P1, Rb, Ra, ROOFD, [0, 1, -1]); m.quad(P3, P2, Rb, Ra, shade(ROOFD, 1.08), [0, 1, 1]);
    m.tri(P1, P2, Rb, CON2, [sx, 0, 0]);
    for (let j = 0; j < 6; j++) m.prism(ID, sx * (TW / 2 + 0.01 + j * 0.028), Y, ZW0 - 0.002, 0.006, 0.09, 6, CON);
  }
  // ---- Nave and apse ----------------------------------------------------------------------------------
  const NV = 0.088, ZN0 = zT0 + 0.002, ZN1 = -0.33, yE = Y + 0.14, yR = Y + 0.27, nb = 7;
  m.box(ID, 0, Y, (ZN0 + ZN1) / 2, 2 * NV, yE - Y, ZN0 - ZN1, CON);
  for (const sx of [-1, 1]) {
    const T = xform(sx * NV, 0, (ZN0 + ZN1) / 2, (sx * Math.PI) / 2), L = ZN0 - ZN1;
    for (let b = 0; b <= nb; b++) {
      const x = -L / 2 + (b * L) / nb;
      if (b > 0 && b < nb) m.box(T, x, Y, 0.007, 0.012, yE - Y - 0.004, 0.014, CON);
      if (b > 0 && b < nb) m.prism(T, x, Y, 0.014, 0.006, yE - Y - 0.004, 8, CON);
      if (b < nb) {
        const wx = x + L / nb / 2;
        if (Math.abs(wx - (sx > 0 ? -1 : 1) * (L / 2 - 0.13)) < 0.03 && b < 3) continue;
        m.win(T, wx, Y + 0.03, 0.014, 0.095, 0.0005, GLASS, CON2, 'pointed');
      }
    }
    m.box(T, 0, yE - 0.006, 0.003, L, 0.006, 0.008, CON2);
  }
  const RP = (z: number, s: number): V3 => [s * (NV + 0.006), yE, z];
  m.quad(RP(ZN0, -1), RP(ZN1, -1), [0, yR, ZN1], [0, yR, ZN0], ROOFD, [-1, 0.8, 0]);
  m.quad(RP(ZN0, 1), RP(ZN1, 1), [0, yR, ZN1], [0, yR, ZN0], shade(ROOFD, 1.1), [1, 0.8, 0]);
  m.box(ID, 0, yR - 0.002, (ZN0 + ZN1) / 2, 0.003, 0.003, ZN0 - ZN1, '#3a3d42');
  m.prism(ID, 0, Y, ZN1, NV, yE - Y - 0.01, 16, CON);
  m.rev(ID, 0, yE - 0.01, ZN1, [[NV + 0.004, 0], [NV * 0.6, 0.06], [0, 0.12]], 16, (i) => (i % 2 ? ROOFD : shade(ROOFD, 1.06)));
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI, x = Math.cos(a) * (NV + 0.004), z = ZN1 + Math.sin(a) * (NV + 0.004);
    m.prism(ID, x, Y, z, 0.007, yE - Y - 0.012, 6, CON);
    if (k < 8) { const b = a + Math.PI / 16; m.box(xform(Math.cos(b) * NV, 0, ZN1 + Math.sin(b) * NV, Math.atan2(Math.cos(b), Math.sin(b))), 0, Y + 0.03, 0.001, 0.012, 0.07, 0.002, GLASS); }
  }
  // ---- Leif Erikson ---------------------------------------------------------------------------------------
  const zL = 0.3, GRAN = '#a7695a';
  m.plan(ID, [[-0.026, zL - 0.022], [0.026, zL - 0.022], [0.026, zL + 0.012], [0, zL + 0.034], [-0.026, zL + 0.012]], Y, Y + 0.012, shade(GRAN, 0.92));
  m.plan(ID, [[-0.018, zL - 0.016], [0.018, zL - 0.016], [0.018, zL + 0.008], [0, zL + 0.026], [-0.018, zL + 0.008]], Y + 0.012, Y + 0.05, GRAN);
  m.plan(ID, [[-0.014, zL - 0.012], [0.014, zL - 0.012], [0.014, zL + 0.006], [0, zL + 0.018], [-0.014, zL + 0.006]], Y + 0.05, Y + 0.072, shade(GRAN, 1.05));
  m.box(ID, 0, Y + 0.072, zL, 0.024, 0.003, 0.02, shade(GRAN, 0.85));
  const BR = '#3f6f5c';
  figure(m, 0, Y + 0.075, zL, 0.046, BR, 2);
  m.beam([0.008, Y + 0.075, zL + 0.004], [0.012, Y + 0.13, zL + 0.004], 0.002, BR);
  m.blob(ID, -0.004, Y + 0.098, zL - 0.006, 0.01, 0.018, 0.004, shade(BR, 0.9), 5);
  m.prism(ID, 0, Y + 0.115, zL, 0.0045, 0.006, 6, BR, 0.003);
  for (let i = 0; i < 26; i++) {
    const x = (hash3(i, 1, 6) - 0.5) * 0.42, z = 0.15 + hash3(i, 2, 6) * 0.25;
    if (Math.abs(x) < 0.04 && Math.abs(z - zL) < 0.05) continue;
    person(m, x, Y + 0.004, z, i, 0.011);
  }
  for (const sx of [-1, 1]) for (const z of [0.18, 0.26, 0.34]) {
    m.prism(ID, sx * 0.225, Y + 0.004, z, 0.0016, 0.05, 5, '#3a3d42');
    m.box(ID, sx * 0.225, Y + 0.054, z, 0.006, 0.004, 0.006, '#f2f0e6');
  }
  // ---- Reykjavík houses, trees and cars -------------------------------------------------------------
  const WALLS = ['#f3f3ef', '#ecd98a', '#b9d4e3', '#d9d9d3', '#f1c9a3', '#c8dfc3', '#f6f6f2', '#e7b8b8'];
  const ROOFS = ['#c0392b', '#2f5f9e', '#3e7d5a', '#a8322a', '#3a6fb0', '#7a3b2e', '#c7472f', '#4f5a66'];
  let hk = 0;
  for (const sx of [-1, 1]) for (const xc of [0.33, 0.42]) for (let z = -0.4; z <= 0.4; z += 0.075) {
    const x = sx * (xc + (hash3(hk, 5, 3) - 0.5) * 0.02), zz = z + (hash3(hk, 6, 3) - 0.5) * 0.015, w = 0.042 + hash3(hk, 3, 3) * 0.02, d = 0.04;
    if (Math.hypot(Math.abs(x) + 0.03, Math.abs(zz) + 0.03) > RQ) continue;
    if (hash3(hk, 7, 3) > 0.84) { leafTree(m, x, Y, zz, 0.045, '#6b8f4e'); hk++; continue; }
    const h = 0.022 + hash3(hk, 4, 3) * 0.022, T = xform(x, 0, zz, (sx * Math.PI) / 2 + (hash3(hk, 8, 3) > 0.7 ? Math.PI / 2 : 0));
    house(m, T, 0, Y, 0, w, h, d, WALLS[hk % WALLS.length], ROOFS[(hk * 3) % ROOFS.length], 1.0);
    for (let i = 0; i < 3; i++) m.win(T, -w / 2 + (i + 0.5) * (w / 3), Y + h * 0.4, 0.007, 0.01, d / 2, '#3c4652', '#ffffff', 'rect');
    hk++;
  }
  for (const x of [-0.18, -0.09, 0, 0.09, 0.18]) for (const z of [-0.46, -0.39]) {
    if (Math.hypot(Math.abs(x) + 0.03, Math.abs(z) + 0.025) > RQ) continue;
    house(m, xform(x, 0, z), 0, Y, 0, 0.065, 0.032, 0.045, WALLS[hk % WALLS.length], ROOFS[(hk * 3) % ROOFS.length], 1.0, 3);
    hk++;
  }
  for (const [x, z] of [[-0.2, -0.36], [0.2, -0.37], [-0.21, 0.02], [0.21, -0.1], [0.37, 0.27], [-0.37, 0.27]] as [number, number][]) leafTree(m, x, Y, z, 0.05, '#6b8f4e');
  for (const [x, z, c] of [[-0.255, -0.2, '#c0392b'], [0.275, 0.1, '#f2f2f2'], [0.255, -0.25, '#2f5f9e'], [-0.275, 0.3, '#3c3f44']] as [number, number, string][]) car(m, xform(x, 0, z, z > 0 ? 0 : Math.PI), 0, Y + 0.002, 0, c, 1.2);
  m.build(gp);
};

// ---------------------------------------------------------------------------------------------------------
// London Eye on the South Bank. The cantilevered wheel: a triangular-section rim truss of white tubes with zigzag
// bracing, 64 cable spokes fanning from the long hub spindle, 32 ovoid glass capsules mounted outside the rim;
// the raked A-frame of two tapering legs on the landward side only, tied back by cables; the boarding pier on
// the Thames with its two raised platforms; the Queen's Walk with plane trees and lamps, Jubilee Gardens, the
// Shell Centre slab behind, a slice of County Hall's Portland-stone river front, and a tour boat on the river.
const londoneye: Builder = (gp) => {
  const WH = '#f3f4f2', WH2 = '#d9dcdd', GLS = '#bcd6e2', STEEL = '#9aa2a8';
  const yB = 0.035, Y = 0.037, RQ = 0.497, ZE = 0.12, YL = Y + 0.024;
  island(gp, 0.5, () => 0.002, '#5f7471', calm('#5f7471'), { rings: 14, segs: 72, side: strataSide(EARTH) });
  const m = new Mesh3();
  // ---- South Bank: walk, gardens, embankment ------------------------------------------------------------
  m.plan(ID, clipDisc(RQ, -1, 1, -1, ZE), yB, YL, '#b3ab9c');
  m.plan(ID, clipDisc(RQ - 0.004, -1, 0.2, -1, ZE - 0.05), YL, YL + 0.002, '#7da05a');
  m.plan(ID, [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.0], [-0.12, 0.0]], YL, YL + 0.0028, '#c9c1b0');
  for (const [a, b] of [[[-0.42, -0.2], [-0.12, -0.06]], [[-0.3, -0.38], [-0.12, -0.1]]] as [number, number][][]) m.beam([a[0], YL + 0.0025, a[1]], [b[0], YL + 0.0025, b[1]], 0.014, '#cdc5b3', 0.001);
  const zl = Math.sqrt(RQ * RQ - ZE * ZE) - 0.004;
  m.box(ID, 0, Y - 0.002, ZE - 0.003, 2 * zl, YL - Y + 0.006, 0.006, '#8b8478');
  for (let x = -zl + 0.02; x < zl; x += 0.05) {
    m.prism(ID, x, YL + 0.004, ZE - 0.004, 0.0015, 0.03, 5, '#2f3b36');
    m.box(ID, x, YL + 0.034, ZE - 0.004, 0.006, 0.006, 0.006, '#f2e6b8');
  }
  for (let x = -zl + 0.045; x < zl - 0.02; x += 0.07) if (x < 0.2 || x > 0.45) leafTree(m, x, YL, ZE - 0.035, 0.055, '#5f8a45');
  for (const [x, z] of [[-0.3, -0.05], [-0.38, -0.12], [-0.22, -0.15], [-0.32, -0.25], [-0.17, -0.27], [-0.4, -0.3], [-0.06, -0.3], [0.05, -0.37]] as [number, number][]) leafTree(m, x, YL, z, 0.06, '#5a8640');
  for (let i = 0; i < 50; i++) {
    const x = (hash3(i, 1, 5) - 0.5) * 0.85, z = ZE - 0.012 - hash3(i, 2, 5) * 0.02;
    if (Math.abs(x) < zl - 0.02) person(m, x, YL + 0.002, z, i, 0.01);
  }
  // ---- Shell Centre and County Hall --------------------------------------------------------------------
  const xS = -0.2, zS = -0.36;
  m.box(ID, xS, YL, zS, 0.12, 0.29, 0.06, '#d3cfc3');
  for (const [T, w] of [[xform(xS, 0, zS + 0.03), 0.11], [xform(xS + 0.06, 0, zS, Math.PI / 2), 0.05]] as [Xf, number][]) {
    for (let f = 0; f < 26; f++) m.box(T, 0, YL + 0.012 + f * 0.0105, 0.0006, w, 0.004, 0.0012, '#5a646e');
  }
  const CH = '#dacfb8', CHR = '#3c3936', x0 = 0.24, zF = 0.07;
  const chp = clipDisc(RQ - 0.008, x0, 1, -0.32, zF, 48);
  m.plan(ID, chp, YL, YL + 0.11, CH);
  m.plan(ID, clipDisc(RQ - 0.016, x0 + 0.008, 1, -0.31, zF - 0.008, 48), YL + 0.11, YL + 0.135, CHR);
  m.plan(ID, clipDisc(RQ - 0.03, x0 + 0.02, 1, -0.3, zF - 0.02, 48), YL + 0.135, YL + 0.148, shade(CHR, 0.9));
  const xR = Math.sqrt((RQ - 0.008) ** 2 - zF * zF), W = xR - x0, Tc = xform((x0 + xR) / 2, 0, zF);
  m.box(Tc, 0, YL, 0.002, W, 0.03, 0.004, shade(CH, 0.92));
  for (let i = 0; i < Math.floor(W / 0.014); i++) {
    const x = -W / 2 + 0.008 + i * 0.014;
    for (let f = 0; f < 4; f++) m.win(Tc, x, YL + 0.012 + f * 0.024, 0.006, f === 3 ? 0.008 : 0.012, 0.004, '#3f4650', undefined, f === 1 ? 'arch' : 'rect');
    if (i % 4 === 1) for (let r = 0; r < 4; r++) m.prism(Tc, x + 0.007 + r * 0.0, YL + 0.032, 0.008, 0.0026, 0.07, 6, '#e6dcc6');
  }
  for (let i = 0; i < Math.floor(W / 0.014); i += 2) { m.box(Tc, -W / 2 + 0.008 + i * 0.014, YL + 0.112, -0.011, 0.008, 0.012, 0.006, CH); m.win(Tc, -W / 2 + 0.008 + i * 0.014, YL + 0.114, 0.004, 0.007, -0.0079, '#3f4650', undefined, 'arch'); }
  for (let i = 0; i < 5; i++) {
    const x = x0 + 0.03 + i * 0.045, z = -0.05 - (i % 2) * 0.12;
    if (Math.hypot(x, z) < RQ - 0.04) m.box(ID, x, YL + 0.14, z, 0.01, 0.03, 0.022, '#c3b69d');
  }
  m.box(Tc, 0, YL + 0.03, 0.01, 0.07, 0.08, 0.006, '#e6dcc6');
  for (let j = 0; j < 7; j++) m.prism(ID, (x0 + xR) / 2 - 0.03 + j * 0.01, YL + 0.03, zF + 0.016, 0.0025, 0.075, 6, '#efe7d4');
  // ---- Boarding pier ------------------------------------------------------------------------------------
  const ZW = 0.2;
  m.box(ID, 0, Y - 0.002, ZW, 0.5, 0.012, 0.075, '#4c5258', true);
  m.box(ID, 0, Y + 0.01, ZW, 0.5, 0.004, 0.075, '#b8b7b1');
  for (const sx of [-1, 1]) {
    const x = sx * 0.13;
    m.box(ID, x, Y + 0.014, ZW, 0.11, 0.004, 0.06, '#b9b7b0');
    m.box(ID, x, Y + 0.018, ZW, 0.1, 0.022, 0.05, WH2);
    m.box(ID, x, Y + 0.04, ZW, 0.11, 0.003, 0.06, '#c94a3b');
    for (let i = 0; i < 6; i++) person(m, x - 0.04 + i * 0.016, Y + 0.043, ZW + (i % 2 ? 0.012 : -0.01), i + 2, 0.008);
  }
  for (const x of [-0.05, 0.05]) m.beam([x, Y + 0.014, ZW - 0.035], [x, YL + 0.004, ZE - 0.01], 0.012, '#9a988f', 0.004);
  // ---- Wheel ---------------------------------------------------------------------------------------------
  const R = 0.36, YH = Y + 0.425, NR = 64, HZ = 0.012, RI = R - 0.026;
  const Tz: Xf = (v) => [v[0], YH - v[2], ZW + v[1]];
  const P = (r: number, a: number, z: number): V3 => [Math.cos(a) * r, YH + Math.sin(a) * r, ZW + z];
  for (let i = 0; i < NR; i++) {
    const a = (i / NR) * TAU, b = ((i + 1) / NR) * TAU, am = (a + b) / 2;
    m.beam(P(R, a, HZ), P(R, b, HZ), 0.0042, WH);
    m.beam(P(R, a, -HZ), P(R, b, -HZ), 0.0042, WH);
    m.beam(P(RI, a, 0), P(RI, b, 0), 0.0042, WH);
    m.beam(P(RI, a, 0), P(R, am, HZ), 0.0022, WH);
    m.beam(P(R, am, HZ), P(RI, b, 0), 0.0022, WH);
    m.beam(P(RI, a, 0), P(R, am, -HZ), 0.0022, WH);
    m.beam(P(R, am, -HZ), P(RI, b, 0), 0.0022, WH);
    if (i % 2 === 0) m.beam(P(R, a, HZ), P(R, a, -HZ), 0.002, WH);
    m.beam(P(RI, a, 0), P(0.024, a, i % 2 ? 0.04 : -0.04), 0.001, '#c9cfd3');
  }
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * TAU + TAU / 128, [cx, cy] = [Math.cos(a) * (R + 0.024), YH + Math.sin(a) * (R + 0.024)];
    m.beam(P(R, a, 0), [Math.cos(a) * (R + 0.013), YH + Math.sin(a) * (R + 0.013), ZW], 0.003, STEEL);
    m.blob(ID, cx, cy - 0.006, ZW, 0.0125, 0.0125, 0.024, k % 8 === 0 ? '#e1edf2' : GLS, 8);
    m.prism(Tz, cx, -0.026, YH - cy + 0.006, 0.006, 0.004, 8, STEEL);
    m.prism(Tz, cx, 0.022, YH - cy + 0.006, 0.006, 0.004, 8, STEEL);
  }
  // hub spindle (axis along z) and A-frame on the landward side
  m.prism(Tz, 0, -0.045, 0, 0.014, 0.09, 12, WH2);
  m.prism(Tz, 0, -0.02, 0, 0.026, 0.04, 12, WH);
  m.prism(Tz, 0, -0.065, 0, 0.006, 0.02, 10, WH2, 0.014);
  m.prism(Tz, 0, 0.045, 0, 0.014, 0.02, 10, WH2, 0.006);
  const Zf = ZW - 0.27, top: V3 = [0, YH - 0.004, ZW - 0.06];
  m.beam([0, YH, ZW - 0.045], top, 0.02, WH);
  for (const sx of [-1, 1]) {
    const foot: V3 = [sx * 0.085, YL, Zf], mid: V3 = [sx * 0.042, (YH + YL) / 2, (Zf + ZW - 0.06) / 2];
    m.beam(top, mid, 0.017, WH, 0.015);
    m.beam(mid, foot, 0.021, WH, 0.018);
    m.box(ID, foot[0], YL, foot[2], 0.04, 0.012, 0.04, '#a7a39a');
    for (const dz of [-0.14, -0.2]) m.beam([0, YH - 0.01, ZW - 0.06], [sx * 0.02, YL, ZW + dz - 0.1], 0.0014, '#7f878d');
  }
  const tb = 0.3, zb = top[2] + ((Zf + ZW - 0.06) / 2 - top[2]) * tb, yb = YH - 0.004 - ((YH - YL) / 2) * tb;
  m.beam([-0.042 * tb, yb, zb], [0.042 * tb, yb, zb], 0.007, WH);
  // ---- River traffic ------------------------------------------------------------------------------------
  const Tb = xform(0.12, Y, 0.37, Math.PI / 2 + 0.06);
  m.poly(xform(0.12, Y, 0.37, 0.06), [[-0.012, 0], [0.012, 0], [0.014, 0.01], [-0.014, 0.01]], -0.06, 0.07, '#f4f4f0');
  m.box(Tb, 0, 0.01, 0, 0.11, 0.01, 0.02, '#e9ecef');
  for (let i = 0; i < 9; i++) m.box(Tb, -0.045 + i * 0.011, 0.012, 0.0102, 0.008, 0.006, 0.0006, '#3f5a73');
  m.box(Tb, 0, 0.0205, 0, 0.1, 0.0015, 0.022, '#1f5aa6');
  const Tr = xform(-0.25, Y, 0.31, 0.2);
  m.box(Tr, 0, 0, 0, 0.018, 0.006, 0.05, '#2c3e50', true);
  m.box(Tr, 0, 0.006, -0.006, 0.014, 0.008, 0.02, '#e4e4de');
  m.build(gp);
};

export const EUROPE3: Record<string, Builder> = { notredame, charlesbridge, trevi, hallgrimskirkja, londoneye };
