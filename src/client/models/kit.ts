import * as THREE from 'three';
import type { ModelRecipe } from '../../shared/data/types.ts';
import {
  type Builder, num, mat, g, CYL, CONE, SPH, add, box, cyl, cone, ball, shade,
  tbox, gable, archPath, panel, loft, lathe, strut, rod, tree,
} from './prims.ts';
import { ANIMAL_BUILDERS } from './animals.ts';
import { NATURE_BUILDERS } from './nature.ts';
import { VEHICLE_BUILDERS } from './vehicles.ts';
import { DISCOVERY_BUILDERS } from './discoveries.ts';
import { ICON_BUILDERS } from './icons.ts';
import { heroBuilder, heroReady, whenHeroReady } from './heroes/index.ts';
import { PBR_ATTR, inferPbr, useVertexPbr } from './pbr.ts';

const B: Record<string, Builder> = {
  // ---------- landmarks ----------
  lattice: (gp, r) => {
    const c = r.color!;
    const dark = shade(c, 0.76);
    const light = shade(c, 1.18);
    const trim = shade(c, 0.9);
    // Champ de Mars landscaped plaza + corner lawns & trees
    box(gp, '#94a3b8', 0, 0, 0, 0.64, 0.022, 0.64);
    box(gp, '#cbd5e1', 0, 0.022, 0, 0.56, 0.014, 0.56);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(gp, '#4d7c5d', sx * 0.22, 0.023, sz * 0.22, 0.12, 0.01, 0.12);
      tree(gp, sx * 0.25, 0.032, sz * 0.25, 0.048, '#528a58');
    }
    // 4 masonry foundation shoes + inclined lattice piers (ground -> 1st deck y=0.38)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      tbox(gp, 0.11, 0.11, 0.09, 0.09, 0.045, '#b8a99a', sx * 0.20, 0.032, sz * 0.20, -sx * 0.01, -sz * 0.01);
      tbox(gp, 0.082, 0.082, 0.056, 0.056, 0.31, c, sx * 0.19, 0.075, sz * 0.19, -sx * 0.08, -sz * 0.08);
      // Corner chord struts + X-bracing diagonals on each lower leg
      const x0 = sx * 0.19, z0 = sz * 0.19, x1 = sx * 0.11, z1 = sz * 0.11;
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4, t1 = (k + 1) / 4;
        const y0 = 0.075 + t0 * 0.31, y1 = 0.075 + t1 * 0.31;
        const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
        const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
        rod(gp, [ax - 0.028, y0, az + sz * 0.028], [bx + 0.024, y1, bz + sz * 0.024], 0.0055, dark, 4);
        rod(gp, [ax + 0.028, y0, az + sz * 0.028], [bx - 0.024, y1, bz + sz * 0.024], 0.0055, dark, 4);
      }
      // Mid-section legs (1st deck y=0.43 -> 2nd deck y=0.72)
      tbox(gp, 0.052, 0.052, 0.038, 0.038, 0.29, c, sx * 0.105, 0.43, sz * 0.105, -sx * 0.05, -sz * 0.05);
    }
    // Parabolic decorative base arches on all 4 facades
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const rg = new THREE.Group(); rg.rotation.y = ry; gp.add(rg);
      const N = 10;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI;
        const p0: [number, number, number] = [-Math.cos(a0) * 0.15, 0.075 + Math.sin(a0) * 0.19, 0.165 - Math.sin(a0) * 0.035];
        const p1: [number, number, number] = [-Math.cos(a1) * 0.15, 0.075 + Math.sin(a1) * 0.19, 0.165 - Math.sin(a1) * 0.035];
        rod(rg, p0, p1, 0.009, dark, 5);
        rod(rg, [p0[0] * 0.92, p0[1] + 0.018, p0[2]], [p1[0] * 0.92, p1[1] + 0.018, p1[2]], 0.006, light, 5);
      }
    }
    // 1st observation deck + pavilion galleries
    tbox(gp, 0.34, 0.34, 0.38, 0.38, 0.028, dark, 0, 0.38, 0);
    box(gp, light, 0, 0.408, 0, 0.36, 0.024, 0.36);
    box(gp, '#fde68a', 0, 0.414, 0, 0.31, 0.012, 0.31);
    // Mid-section horizontal lacing girder & X-diagonals
    box(gp, trim, 0, 0.56, 0, 0.21, 0.02, 0.21);
    // 2nd double-tiered observation deck
    tbox(gp, 0.20, 0.20, 0.23, 0.23, 0.026, dark, 0, 0.71, 0);
    box(gp, light, 0, 0.736, 0, 0.21, 0.022, 0.21);
    box(gp, trim, 0, 0.758, 0, 0.17, 0.018, 0.17);
    // Upper tapered lattice spire shaft (y=0.776 -> 1.22) with 7 horizontal girder bands & cross-bracing
    tbox(gp, 0.135, 0.135, 0.064, 0.064, 0.44, c, 0, 0.776, 0);
    for (let i = 0; i < 6; i++) {
      const f0 = i / 6, f1 = (i + 1) / 6;
      const y0 = 0.78 + f0 * 0.42, y1 = 0.78 + f1 * 0.42;
      const w0 = 0.072 - f0 * 0.036, w1 = 0.072 - f1 * 0.036;
      box(gp, dark, 0, y0, 0, w0 * 2.08, 0.012, w0 * 2.08);
      for (const s of [-1, 1]) {
        rod(gp, [-w0, y0, s * w0], [w1, y1, s * w1], 0.0045, light, 4);
        rod(gp, [w0, y0, s * w0], [-w1, y1, s * w1], 0.0045, light, 4);
        rod(gp, [s * w0, y0, -w0], [s * w1, y1, w1], 0.0045, light, 4);
        rod(gp, [s * w0, y0, w0], [s * w1, y1, -w1], 0.0045, light, 4);
      }
    }
    // Summit observation lantern, cupola dome, and golden beacon antenna
    box(gp, light, 0, 1.215, 0, 0.095, 0.025, 0.095);
    lathe(gp, [[0.042, 0], [0.044, 0.03], [0.032, 0.065], [0.012, 0.085], [0, 0.09]], c, 0, 1.24, 0, 10);
    cyl(gp, '#f8fafc', 0, 1.325, 0, 0.009, 0.14, 6);
    ball(gp, '#fde047', 0, 1.47, 0, 0.038).material = mat('#fde047', { emissive: '#f59e0b' });
  },
  pyramid: (gp, r) => {
    const cnt = num(r.count, 3);
    if (r.glass) {
      // Louvre Pyramid: Cour Napoléon stone plaza + reflecting pools + steel lattice glass pyramid + 3 mini pyramids
      box(gp, '#cbd5e1', 0, 0, 0, 0.92, 0.026, 0.88);
      box(gp, '#38bdf8', -0.26, 0.027, 0.22, 0.28, 0.008, 0.24);
      box(gp, '#38bdf8', 0.26, 0.027, 0.22, 0.28, 0.008, 0.24);
      const glassMat = mat(r.color!, { transparent: 0.62, metal: 0.45, rough: 0.2 });
      add(gp, CONE(4), glassMat, 0, 0.24, -0.02, 0.60, 0.44, 0.60, Math.PI / 4);
      // Structural stainless-steel ridge & diamond lattice struts
      const hw = 0.212, top: [number, number, number] = [0, 0.46, -0.02];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        rod(gp, [sx * hw, 0.026, -0.02 + sz * hw], top, 0.007, '#e2e8f0', 5);
      }
      for (let i = 1; i <= 3; i++) {
        const f = i / 4, w = hw * (1 - f) * 2, y = 0.026 + f * 0.43;
        box(gp, '#e2e8f0', 0, y, -0.02, w, 0.007, w);
      }
      for (const [x, z] of [[0, 0.31], [-0.34, -0.02], [0.34, -0.02]]) {
        add(gp, CONE(4), glassMat, x, 0.095, z, 0.18, 0.14, 0.18, Math.PI / 4);
      }
      return;
    }
    // Pyramids of Giza: desert plateau + stepped Khufu, cased Khafre, Menkaure, 3 Queen pyramids + Great Sphinx
    tbox(gp, 1.04, 0.86, 0.98, 0.80, 0.035, '#e2be7e', 0, 0, 0);
    const spots: [number, number, number, boolean][] = [
      [-0.14, -0.08, 1.0, false],
      [0.28, 0.14, 0.82, true],
      [-0.40, 0.24, 0.52, false],
    ];
    for (let i = 0; i < Math.min(cnt, spots.length); i++) {
      const [px, pz, s, smoothCap] = spots[i];
      const baseW = 0.50 * s, totalH = 0.56 * s, tiers = 9;
      for (let k = 0; k < tiers; k++) {
        const f0 = k / tiers, f1 = (k + 1) / tiers;
        const w0 = baseW * (1 - f0 * 0.92), w1 = baseW * (1 - f1 * 0.92);
        const col = k >= tiers - 2 && smoothCap ? shade(r.color!, 1.16) : shade(r.color!, 0.92 + (k % 2) * 0.08);
        tbox(gp, w0, w0, w1, w1, totalH / tiers + 0.003, col, px, 0.035 + f0 * totalH, pz);
      }
      tbox(gp, baseW * 0.1, baseW * 0.1, 0.005, 0.005, 0.05 * s, shade(r.color!, 1.22), px, 0.035 + totalH, pz);
    }
    // 3 Queen satellite pyramids
    for (let q = 0; q < 3; q++) {
      tbox(gp, 0.09, 0.09, 0.01, 0.01, 0.075, shade(r.color!, 0.88), -0.46 + q * 0.10, 0.035, 0.37);
    }
    // Great Sphinx of Giza in foreground
    const sx = 0.16, sz = 0.34, sc = shade(r.color!, 0.95);
    box(gp, sc, sx, 0.035, sz, 0.09, 0.065, 0.18);
    box(gp, sc, sx - 0.03, 0.035, sz + 0.11, 0.022, 0.028, 0.08);
    box(gp, sc, sx + 0.03, 0.035, sz + 0.11, 0.022, 0.028, 0.08);
    tbox(gp, 0.085, 0.08, 0.055, 0.06, 0.075, shade(sc, 1.08), sx, 0.095, sz + 0.05);
    ball(gp, sc, sx, 0.145, sz + 0.06, 0.06, 0.065, 0.06);
  },
  statue: (gp, r) => {
    const c = r.color!;
    if (r.torch) {
      // Statue of Liberty: Fort Wood 11-point star base + Richard Morris Hunt colonnade pedestal + Lady Liberty
      cyl(gp, '#4d7c5d', 0, 0, 0, 0.34, 0.025, 12);
      for (let i = 0; i < 8; i++) {
        box(gp, '#78716c', 0, 0.02, 0, 0.42, 0.045, 0.14, (i * Math.PI) / 8);
      }
      tbox(gp, 0.30, 0.30, 0.25, 0.25, 0.12, '#a8a29e', 0, 0.065, 0);
      // Pedestal with recessed colonnade niches on all 4 faces
      box(gp, '#d6d3d1', 0, 0.185, 0, 0.23, 0.24, 0.23);
      for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        panel(gp, 0.232, 0.15, 0.018, '#b8b2a6', [archPath(0, 0.02, 0.11, 0.10)], 0, 0.22, 0.11, ry);
      }
      tbox(gp, 0.26, 0.26, 0.21, 0.21, 0.04, '#a8a29e', 0, 0.425, 0);
      // Flowing classical copper robe (lathe profile + diagonal toga folds)
      lathe(gp, [[0.105, 0], [0.098, 0.14], [0.085, 0.28], [0.092, 0.38], [0.070, 0.46], [0, 0.47]], c, 0, 0.465, 0, 12);
      tbox(gp, 0.15, 0.11, 0.11, 0.09, 0.36, shade(c, 0.92), 0, 0.50, 0.01, -0.01, 0, 0.25);
      // Head + 7-spike radiant crown
      ball(gp, c, 0, 0.96, 0.01, 0.095, 0.11, 0.095);
      cyl(gp, shade(c, 1.15), 0, 0.99, 0.01, 0.052, 0.022, 10);
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.36;
        rod(gp, [Math.sin(a) * 0.04, 1.00, 0.01 + Math.cos(a) * 0.03], [Math.sin(a) * 0.095, 1.05 + Math.cos(a) * 0.03, 0.01 + Math.cos(a) * 0.06], 0.008, shade(c, 1.18), 4);
      }
      // Left arm holding tablet + raised right arm holding golden flame torch
      box(gp, shade(c, 0.82), -0.095, 0.72, 0.055, 0.055, 0.11, 0.025, 0.28, -0.2, 0.25);
      strut(gp, [0.065, 0.86, 0.01], [0.115, 1.12, 0.03], 0.028, 0.022, c, 7);
      cyl(gp, '#ca8a04', 0.115, 1.11, 0.03, 0.032, 0.022, 8);
      lathe(gp, [[0.005, 0], [0.032, 0.03], [0.024, 0.065], [0, 0.095]], '#fde047', 0.115, 1.13, 0.03, 8)
        .material = mat('#fde047', { emissive: '#f59e0b' });
      return;
    }
    ICON_BUILDERS.redeemer(gp, r);
  },
  clocktower: (gp, r) => {
    const c = r.color!;
    const dark = shade(c, 0.78);
    const roof = '#334155';
    // Thames embankment + Westminster gothic wing
    box(gp, '#64748b', -0.12, 0, 0, 0.68, 0.04, 0.38);
    box(gp, c, -0.24, 0.04, 0, 0.32, 0.22, 0.24);
    gable(gp, 0.33, 0.09, 0.25, roof, -0.24, 0.26, 0);
    for (let i = -3; i <= 0; i++) box(gp, dark, -0.24 + i * 0.045, 0.06, 0.122, 0.016, 0.17, 0.01);
    // Main Elizabeth Tower shaft with Gothic stone piers & vertical window flutes
    box(gp, dark, 0, 0.04, 0, 0.24, 0.10, 0.24);
    box(gp, c, 0, 0.14, 0, 0.20, 0.56, 0.20);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(gp, shade(c, 1.08), sx * 0.10, 0.14, sz * 0.10, 0.028, 0.58, 0.028);
    }
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fg = new THREE.Group(); fg.rotation.y = ry; gp.add(fg);
      for (let k = 0; k < 4; k++) {
        box(fg, '#475569', -0.05 + k * 0.033, 0.18, 0.101, 0.014, 0.48, 0.006);
      }
      for (const y of [0.30, 0.48, 0.66]) box(fg, shade(c, 1.12), 0, y, 0.103, 0.215, 0.018, 0.012);
    }
    // Cantilevered belfry clock stage + 4 Great Clock dials with gold frames & hands
    box(gp, shade(c, 1.08), 0, 0.70, 0, 0.25, 0.21, 0.25);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const dg = new THREE.Group(); dg.rotation.y = ry; gp.add(dg);
      box(dg, '#eab308', 0, 0.72, 0.126, 0.18, 0.17, 0.01);
      add(dg, CYL(16), mat('#fefce8', { emissive: '#fef08a' }), 0, 0.805, 0.132, 0.145, 0.012, 0.145, 0, Math.PI / 2);
      add(dg, g('clkRing', () => new THREE.RingGeometry(0.062, 0.074, 16)), mat('#ca8a04'), 0, 0.805, 0.139, 1, 1, 1);
      box(dg, '#1e293b', 0, 0.805, 0.141, 0.008, 0.052, 0.006);
      box(dg, '#1e293b', 0.018, 0.802, 0.141, 0.038, 0.008, 0.006);
    }
    // Belfry colonnade gallery + multi-stage Ayerst cast-iron spire
    tbox(gp, 0.25, 0.25, 0.17, 0.17, 0.12, roof, 0, 0.91, 0);
    box(gp, shade(c, 1.1), 0, 1.03, 0, 0.16, 0.06, 0.16);
    tbox(gp, 0.17, 0.17, 0.02, 0.02, 0.22, roof, 0, 1.09, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cone(gp, '#eab308', sx * 0.11, 0.91, sz * 0.11, 0.016, 0.07, 4);
    }
    cyl(gp, '#eab308', 0, 1.31, 0, 0.01, 0.09, 6);
  },
  domed: (gp, r) => {
    const c = r.color!;
    const isHagia = c === '#d8a48a';
    if (isHagia) {
      // Hagia Sophia: Byzantine salmon-rose basilica + semi-domes + flying buttresses + 40-window central dome + 4 Ottoman minarets
      box(gp, '#cbd5e1', 0, 0, 0, 0.88, 0.04, 0.88);
      box(gp, c, 0, 0.04, 0, 0.52, 0.28, 0.48);
      // Flying buttresses on sides
      for (const s of [-1, 1]) {
        for (const z of [-0.14, 0.14]) tbox(gp, 0.10, 0.06, 0.04, 0.06, 0.24, shade(c, 0.86), s * 0.28, 0.04, z, -s * 0.03, 0);
        // East/West cascading semi-domes
        add(gp, SPH(12), mat('#64748b'), 0, 0.30, s * 0.20, 0.30, 0.22, 0.28);
      }
      // Central dome drum with clerestory window colonnade + pendentive lead dome
      cyl(gp, shade(c, 1.06), 0, 0.32, 0, 0.21, 0.07, 16);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        box(gp, '#1e293b', Math.cos(a) * 0.208, 0.335, Math.sin(a) * 0.208, 0.022, 0.035, 0.01, -a);
      }
      lathe(gp, [[0.21, 0], [0.20, 0.06], [0.15, 0.12], [0.06, 0.16], [0, 0.17]], '#64748b', 0, 0.39, 0, 16);
      cyl(gp, '#eab308', 0, 0.56, 0, 0.008, 0.06, 6);
      // 4 tall Ottoman stone minarets with pencil-cone lead roofs
      for (const [mx, mz] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.34], [0.36, 0.34]]) {
        box(gp, shade(c, 0.9), mx, 0.04, mz, 0.07, 0.10, 0.07);
        cyl(gp, '#e2d9c8', mx, 0.14, mz, 0.028, 0.52, 8);
        cyl(gp, '#f8fafc', mx, 0.50, mz, 0.042, 0.022, 8);
        cone(gp, '#475569', mx, 0.66, mz, 0.030, 0.15, 8);
      }
      return;
    }
    // Taj Mahal: Red sandstone base + white Makrana marble terrace + Charbagh reflecting pool + pierced iwan mausoleum
    box(gp, '#9a4a38', 0, 0, 0.05, 0.88, 0.035, 0.96);
    box(gp, shade(c, 0.95), 0, 0.035, -0.04, 0.78, 0.055, 0.76);
    // Charbagh reflecting pool + cypress trees
    box(gp, '#e2e8f0', 0, 0.036, 0.34, 0.16, 0.012, 0.34);
    box(gp, '#38bdf8', 0, 0.044, 0.34, 0.12, 0.008, 0.30);
    for (const sx of [-0.13, 0.13]) for (let k = 0; k < 3; k++) {
      tree(gp, sx, 0.035, 0.22 + k * 0.10, 0.05, '#2d6a4f', true);
    }
    // Main mausoleum body with real extruded pointed Mughal iwan arch portals on all 4 facades
    box(gp, shade(c, 0.65), 0, 0.09, -0.04, 0.38, 0.28, 0.38);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fg = new THREE.Group(); fg.position.set(0, 0.09, -0.04); fg.rotation.y = ry; gp.add(fg);
      const holes = [
        archPath(0, 0, 0.13, 0.22, true),
        archPath(-0.125, 0.01, 0.05, 0.09, true),
        archPath(-0.125, 0.13, 0.05, 0.09, true),
        archPath(0.125, 0.01, 0.05, 0.09, true),
        archPath(0.125, 0.13, 0.05, 0.09, true),
      ];
      panel(fg, 0.42, 0.28, 0.032, c, holes, 0, 0, 0.195);
      // Taller central pishtaq portal frame + decorative finials
      panel(fg, 0.19, 0.33, 0.042, shade(c, 1.02), [archPath(0, 0, 0.13, 0.23, true)], 0, 0, 0.198);
      for (const px of [-0.092, 0.092]) cyl(fg, '#eab308', px, 0.33, 0.198, 0.008, 0.04, 6);
    }
    // Central high drum + lathe-sculpted bulbous lotus onion dome + golden kalasha finial
    cyl(gp, shade(c, 0.96), 0, 0.37, -0.04, 0.135, 0.10, 16);
    lathe(gp, [[0.135, 0], [0.165, 0.07], [0.155, 0.16], [0.10, 0.24], [0.03, 0.29], [0, 0.31]], c, 0, 0.47, -0.04, 18);
    cyl(gp, '#eab308', 0, 0.78, -0.04, 0.010, 0.09, 8);
    ball(gp, '#eab308', 0, 0.81, -0.04, 0.032);
    // 4 corner domed chhatri kiosks
    for (const [cx, cz] of [[-0.14, -0.18], [0.14, -0.18], [-0.14, 0.10], [0.14, 0.10]]) {
      cyl(gp, shade(c, 0.92), cx, 0.37, cz, 0.048, 0.055, 8);
      lathe(gp, [[0.048, 0], [0.056, 0.025], [0.035, 0.06], [0, 0.075]], c, cx, 0.425, cz, 10);
      cyl(gp, '#eab308', cx, 0.50, cz, 0.006, 0.035, 6);
    }
    // 4 corner three-tiered minarets
    const mn = num(r.minarets, 4);
    for (let i = 0; i < mn; i++) {
      const a = (i / mn) * Math.PI * 2 + Math.PI / 4;
      const mx = Math.cos(a) * 0.46, mz = -0.04 + Math.sin(a) * 0.44;
      cyl(gp, shade(c, 0.92), mx, 0.09, mz, 0.042, 0.03, 8);
      tbox(gp, 0.058, 0.058, 0.042, 0.042, 0.50, c, mx, 0.12, mz);
      for (const by of [0.28, 0.44, 0.60]) cyl(gp, shade(c, 0.88), mx, by, mz, 0.038, 0.018, 10);
      lathe(gp, [[0.032, 0], [0.038, 0.02], [0.022, 0.05], [0, 0.06]], c, mx, 0.63, mz, 8);
      cyl(gp, '#eab308', mx, 0.69, mz, 0.005, 0.04, 6);
    }
  },
  wall: (gp, r) => {
    const c = r.color!;
    const dark = shade(c, 0.82);
    // Undulating green mountain ridge + winding Ming crenellated wall + 3 watchtowers
    const pts: [number, number, number][] = [
      [-0.44, 0.08, 0.10], [-0.28, 0.16, -0.06], [-0.10, 0.12, 0.08],
      [0.10, 0.22, -0.04], [0.28, 0.15, 0.09], [0.44, 0.10, -0.05],
    ];
    for (let i = 0; i < pts.length; i++) {
      const [px, py, pz] = pts[i];
      cone(gp, i % 2 ? '#3f6b4e' : '#4d7c5d', px, 0, pz, 0.22, py + 0.06, 7);
      tree(gp, px + 0.08, py * 0.4, pz + 0.10, 0.055, '#2d6a4f', true);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
      box(gp, c, mx, my, mz, len + 0.03, 0.11, 0.075, ry);
      box(gp, shade(c, 1.12), mx, my + 0.11, mz, len + 0.03, 0.015, 0.082, ry);
      // Battlement merlons along both parapets
      for (let m = -1; m <= 1; m++) {
        box(gp, dark, mx + Math.cos(-ry) * m * 0.05, my + 0.125, mz + Math.sin(-ry) * m * 0.05, 0.028, 0.025, 0.082, ry);
      }
    }
    // 3 Ming watchtowers with arched windows & upturned grey-tiled hip roofs
    for (const idx of [0, 3, 5]) {
      const [tx, ty, tz] = pts[idx];
      tbox(gp, 0.15, 0.15, 0.13, 0.13, 0.22, dark, tx, ty, tz);
      panel(gp, 0.135, 0.09, 0.136, shade(c, 0.95), [archPath(-0.03, 0.02, 0.028, 0.045), archPath(0.03, 0.02, 0.028, 0.045)], tx, ty + 0.12, tz);
      tbox(gp, 0.17, 0.17, 0.08, 0.08, 0.055, '#334155', tx, ty + 0.22, tz);
    }
  },
  needle: (gp, r) => {
    const h = num(r.h, 1);
    if (h > 1.2) return ICON_BUILDERS.cnTower(gp, r);
    if (r.saucer) {
      // Seattle Space Needle: 3 curved tripod legs + central elevator core + multi-tier flying saucer + spire
      cyl(gp, '#64748b', 0, 0, 0, 0.28, 0.035, 16);
      cyl(gp, '#cbd5e1', 0, 0.035, 0, 0.045, 0.72, 8);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const p0: [number, number, number] = [Math.cos(a) * 0.22, 0.035, Math.sin(a) * 0.22];
        const p1: [number, number, number] = [Math.cos(a) * 0.065, 0.42, Math.sin(a) * 0.065];
        const p2: [number, number, number] = [Math.cos(a) * 0.14, 0.72, Math.sin(a) * 0.14];
        strut(gp, p0, p1, 0.018, 0.024, r.color!, 6);
        strut(gp, p1, p2, 0.016, 0.018, r.color!, 6);
      }
      // Saucer observation pod
      lathe(gp, [[0.06, 0], [0.22, 0.035], [0.24, 0.06], [0.19, 0.095], [0.09, 0.12], [0, 0.13]], '#f8fafc', 0, 0.70, 0, 18);
      add(gp, CYL(18), mat('#38bdf8', { emissive: '#0284c7' }), 0, 0.76, 0, 0.46, 0.022, 0.46);
      add(gp, CYL(18), mat('#f59e0b'), 0, 0.79, 0, 0.36, 0.024, 0.36);
      cyl(gp, '#e2e8f0', 0, 0.83, 0, 0.012, 0.22, 8);
      ball(gp, '#ef4444', 0, 1.06, 0, 0.03).material = mat('#ef4444', { emissive: '#dc2626' });
      return;
    }
    // N Seoul Tower: Namsan green mountain hill + stone fortress terrace + observation pod + mast
    tbox(gp, 0.64, 0.56, 0.36, 0.32, 0.22, '#3f6b4e', 0, 0, 0);
    box(gp, '#94a3b8', 0, 0.22, 0, 0.30, 0.05, 0.24);
    cyl(gp, r.color!, 0, 0.27, 0, 0.048, 0.54, 12);
    cyl(gp, '#334155', 0, 0.66, 0, 0.12, 0.11, 16);
    add(gp, CYL(16), mat('#38bdf8', { emissive: '#0284c7' }), 0, 0.71, 0, 0.245, 0.035, 0.245);
    cyl(gp, '#cbd5e1', 0, 0.81, 0, 0.016, 0.26, 8);
    ball(gp, '#ef4444', 0, 1.08, 0, 0.028).material = mat('#ef4444', { emissive: '#dc2626' });
  },
  sails: (gp, r) => {
    const c = r.color!;
    // Sydney Opera House: Harbour water + stepped Bennelong Point granite podium + nested lofted parabolic shells
    box(gp, '#0284c7', 0, 0, 0, 0.98, 0.022, 0.64);
    box(gp, '#d6c7b2', 0, 0.022, 0, 0.84, 0.065, 0.50);
    box(gp, '#b8a68e', 0, 0.023, 0.26, 0.68, 0.04, 0.08);
    const makeShell = (x: number, z: number, w: number, h: number, d: number, tilt: number) => {
      const rings: [number, number, number][][] = [];
      const steps = 6, segs = 9;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const curW = w * (1 - t * 0.86);
        const curH = Math.sin(t * Math.PI * 0.5) * h;
        const curZ = z + t * d + Math.pow(t, 1.6) * tilt;
        const ring: [number, number, number][] = [];
        for (let i = 0; i <= segs; i++) {
          const u = (i / segs) * Math.PI;
          const px = x + Math.cos(u) * (curW / 2);
          const py = 0.087 + Math.sin(u) * curH * (1 - t * 0.12);
          ring.push([px, py, curZ]);
        }
        ring.push([x, 0.087, curZ]);
        rings.push(ring);
      }
      loft(gp, rings, c, true);
      // Bronze glass curtain wall inside shell mouth
      cone(gp, '#785a3c', x, 0.087, z + d * 0.72, w * 0.36, h * 0.62, 4);
    };
    // Concert Hall (left chain of 4 shells) + Joan Sutherland Theatre (right chain of 4 shells)
    for (const [zOff, w, h, d] of [[-0.18, 0.26, 0.42, 0.14], [-0.06, 0.24, 0.36, 0.13], [0.06, 0.20, 0.28, 0.12], [0.16, 0.15, 0.20, 0.09]] as const) {
      makeShell(-0.14, zOff, w, h, d, 0.04);
      makeShell(0.16, zOff + 0.02, w * 0.88, h * 0.86, d, 0.04);
    }
  },
  arena: (gp, r) => {
    const c = r.color!;
    const innerC = shade(c, 0.86);
    const brickC = shade(c, 0.72);
    // Roman travertine plaza + elliptical Colosseum built from 24 radial pierced-arch segments
    add(gp, CYL(24), mat('#94a3b8'), 0, 0.015, 0, 0.96, 0.03, 0.80);
    const N = 24, rx = 0.42, rz = 0.34, segW = 0.112;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      const ry = Math.atan2(nx, nz);
      // Surviving 4-story Northern outer wall (13 segments)
      if (i >= 2 && i <= 14) {
        const holes = [archPath(0, 0.01, 0.056, 0.085), archPath(0, 0.12, 0.056, 0.085), archPath(0, 0.23, 0.054, 0.08)];
        panel(gp, segW, 0.41, 0.032, c, holes, nx * rx, 0.03, nz * rz, ry);
        // Cornice bands & attic window
        for (const ly of [0.11, 0.22, 0.32, 0.41]) box(gp, shade(c, 1.12), nx * (rx + 0.012), 0.03 + ly, nz * (rz + 0.012), segW + 0.008, 0.012, 0.018, ry);
        if (i % 2 === 0) box(gp, '#1e293b', nx * (rx + 0.01), 0.36, nz * (rz + 0.01), 0.026, 0.032, 0.012, ry);
      }
      // Inner surviving 2-tier ring around full perimeter
      const inHoles = [archPath(0, 0.01, 0.05, 0.078), archPath(0, 0.11, 0.05, 0.075)];
      panel(gp, segW * 0.88, 0.25, 0.028, innerC, inHoles, nx * (rx * 0.84), 0.03, nz * (rz * 0.84), ry);
      // Sloping cavea seating wedges inside
      tbox(gp, segW * 0.78, 0.09, segW * 0.56, 0.02, 0.16, brickC, nx * (rx * 0.68), 0.03, nz * (rz * 0.68), 0, -0.03, ry);
    }
    // Elliptical arena floor + exposed underground hypogeum substructure walls
    add(gp, CYL(20), mat('#d4a373'), 0, 0.04, 0, 0.48, 0.025, 0.38);
    for (let k = -2; k <= 2; k++) box(gp, brickC, k * 0.042, 0.045, 0, 0.014, 0.028, 0.26 - Math.abs(k) * 0.04);
  },
  onions: (gp) => {
    // St. Basil's Cathedral: Red-brick Kremlin Square podium + central tented tower + 8 colorful lathe-sculpted onion domes
    box(gp, '#94a3b8', 0, 0, 0, 0.78, 0.03, 0.78);
    box(gp, '#b91c1c', 0, 0.03, 0, 0.56, 0.18, 0.56);
    box(gp, '#f8fafc', 0, 0.19, 0, 0.58, 0.025, 0.58);
    // White stone arched gallery portals on all 4 sides
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      panel(gp, 0.36, 0.14, 0.03, '#f8fafc', [archPath(-0.08, 0.01, 0.06, 0.09), archPath(0.08, 0.01, 0.06, 0.09)], 0, 0.03, 0.285, ry);
    }
    // Central high octagonal tower + steep shatyor tent spire + golden onion cupola
    cyl(gp, '#b91c1c', 0, 0.21, 0, 0.11, 0.28, 8);
    cyl(gp, '#f8fafc', 0, 0.48, 0, 0.115, 0.03, 8);
    cone(gp, '#dc2626', 0, 0.51, 0, 0.105, 0.34, 8);
    lathe(gp, [[0.035, 0], [0.065, 0.04], [0.05, 0.09], [0.015, 0.13], [0, 0.15]], '#eab308', 0, 0.84, 0, 12);
    cyl(gp, '#eab308', 0, 0.99, 0, 0.006, 0.07, 6);
    // 8 surrounding chapel towers with brightly colored onion domes
    const domes: [number, number, number, string, string][] = [
      [0, 0.23, 0.30, '#ef4444', '#f8fafc'],
      [0.23, 0, 0.28, '#10b981', '#fde047'],
      [0, -0.23, 0.29, '#3b82f6', '#f8fafc'],
      [-0.23, 0, 0.27, '#f59e0b', '#dc2626'],
      [0.17, 0.17, 0.20, '#ec4899', '#f8fafc'],
      [-0.17, 0.17, 0.21, '#06b6d4', '#fde047'],
      [-0.17, -0.17, 0.19, '#8b5cf6', '#f8fafc'],
      [0.17, -0.17, 0.20, '#22c55e', '#eab308'],
    ];
    for (const [dx, dz, dh, dc, trimC] of domes) {
      cyl(gp, '#f8fafc', dx, 0.21, dz, 0.068, dh, 8);
      cyl(gp, trimC, dx, 0.21 + dh - 0.02, dz, 0.074, 0.025, 8);
      lathe(gp, [[0.058, 0], [0.098, 0.055], [0.088, 0.12], [0.035, 0.175], [0, 0.21]], dc, dx, 0.21 + dh, dz, 12);
      cyl(gp, '#eab308', dx, 0.21 + dh + 0.20, dz, 0.005, 0.05, 6);
    }
  },
  windmill: (gp, r) => {
    const c = r.color!;
    // Dutch canal + green polder dike + octagonal smock mill + wooden stelling stage + rotating lattice sails
    box(gp, '#0284c7', 0, 0, 0.22, 0.78, 0.022, 0.24);
    box(gp, '#4d7c5d', 0, 0, -0.06, 0.78, 0.04, 0.48);
    cyl(gp, '#9a3412', 0, 0.04, -0.02, 0.22, 0.16, 8);
    // Wooden stelling gallery balcony & struts
    cyl(gp, '#d6c7b2', 0, 0.19, -0.02, 0.28, 0.022, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rod(gp, [Math.cos(a) * 0.20, 0.08, -0.02 + Math.sin(a) * 0.20], [Math.cos(a) * 0.26, 0.19, -0.02 + Math.sin(a) * 0.26], 0.008, '#f8fafc', 4);
    }
    // Tapered green-timber octagonal tower + dark thatched rotating cap
    add(gp, g('wmBody', () => new THREE.CylinderGeometry(0.13, 0.20, 0.44, 8)), mat(c), 0, 0.42, -0.02, 1, 1, 1);
    lathe(gp, [[0.14, 0], [0.15, 0.06], [0.11, 0.13], [0, 0.16]], '#44403c', 0, 0.63, -0.02, 10);
    // Spinning 4-blade Dutch lattice wind-sails
    const hub = new THREE.Group(); hub.position.set(0, 0.69, 0.14); hub.name = 'spin'; gp.add(hub);
    cyl(hub, '#f8fafc', 0, -0.02, 0, 0.028, 0.06, 8).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const bg = new THREE.Group(); bg.rotation.z = (i * Math.PI) / 2; hub.add(bg);
      box(bg, '#f8fafc', 0, 0.02, 0, 0.018, 0.48, 0.016);
      box(bg, '#b91c1c', 0.032, 0.10, 0.005, 0.05, 0.38, 0.006);
      for (let k = 0; k < 6; k++) box(bg, '#f8fafc', 0.028, 0.11 + k * 0.062, 0.008, 0.062, 0.008, 0.008);
    }
  },
  gate: (gp, r) => {
    const cols = num(r.columns, 6), c = r.color!;
    if (r.roof) {
      // Parthenon: Acropolis rocky hill + 3-step marble crepidoma + 8×6 Doric colonnade + inner cella + triangular pediment
      tbox(gp, 1.02, 0.68, 0.92, 0.56, 0.06, '#94a3b8', 0, 0, 0);
      for (let s = 0; s < 3; s++) box(gp, shade(c, 0.94 + s * 0.03), 0, 0.06 + s * 0.022, 0, 0.88 - s * 0.03, 0.022, 0.50 - s * 0.03);
      // Inner cella sanctuary walls
      box(gp, shade(c, 0.88), 0, 0.126, 0, 0.58, 0.32, 0.24);
      // Perimeter Doric columns (8 along X, 6 along Z) + capitals
      const nx = cols, nz = 6;
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          if (ix > 0 && ix < nx - 1 && iz > 0 && iz < nz - 1) continue;
          const px = -0.37 + (ix * 0.74) / (nx - 1), pz = -0.18 + (iz * 0.36) / (nz - 1);
          cyl(gp, c, px, 0.126, pz, 0.026, 0.34, 10);
          box(gp, shade(c, 1.06), px, 0.466, pz, 0.062, 0.02, 0.062);
        }
      }
      // Architrave + triglyph frieze + sculpted triangular pediments
      box(gp, c, 0, 0.486, 0, 0.82, 0.055, 0.44);
      gable(gp, 0.84, 0.13, 0.46, shade(c, 1.05), 0, 0.54, 0);
      return;
    }
    // Brandenburg Gate: Pariser Platz paving + flanking guardhouses + 12 Doric columns + attic + bronze Quadriga chariot
    box(gp, '#94a3b8', 0, 0, 0, 0.98, 0.03, 0.48);
    for (const sx of [-0.41, 0.41]) {
      box(gp, shade(c, 0.92), sx, 0.03, 0, 0.12, 0.34, 0.34);
      gable(gp, 0.13, 0.06, 0.36, '#64748b', sx, 0.37, 0, Math.PI / 2);
    }
    const xs = [-0.31, -0.20, -0.09, 0.09, 0.20, 0.31];
    for (const px of xs) {
      for (const pz of [-0.11, 0.11]) {
        cyl(gp, c, px, 0.03, pz, 0.028, 0.42, 10);
        box(gp, shade(c, 1.08), px, 0.45, pz, 0.066, 0.022, 0.066);
      }
      box(gp, shade(c, 0.88), px, 0.03, 0, 0.036, 0.42, 0.20);
    }
    // Entablature + stepped attic crown
    box(gp, c, 0, 0.47, 0, 0.72, 0.08, 0.30);
    box(gp, shade(c, 1.05), 0, 0.55, 0, 0.56, 0.055, 0.24);
    box(gp, shade(c, 0.96), 0, 0.605, 0, 0.26, 0.04, 0.18);
    // Bronze Quadriga: chariot + Victoria goddess + 4 horses
    const qCol = '#2dd4bf';
    box(gp, qCol, 0, 0.645, -0.03, 0.10, 0.06, 0.06);
    cyl(gp, qCol, 0, 0.705, -0.03, 0.022, 0.09, 6);
    for (const hx of [-0.075, -0.025, 0.025, 0.075]) {
      box(gp, qCol, hx, 0.65, 0.03, 0.024, 0.055, 0.075);
      box(gp, qCol, hx, 0.69, 0.06, 0.02, 0.045, 0.025, 0, -0.3);
    }
  },
  spires: (gp, r) => {
    const c = r.color!;
    // Sagrada Família: Cruciform basilica nave + Gothic rose window facade + 8 perforated facade spires + 4 Evangelist towers + tall central Jesus tower
    box(gp, '#94a3b8', 0, 0, 0, 0.84, 0.03, 0.64);
    box(gp, shade(c, 0.92), 0, 0.03, 0, 0.64, 0.30, 0.42);
    gable(gp, 0.64, 0.12, 0.36, '#64748b', 0, 0.33, 0);
    // Carved Nativity & Passion portals on ±Z with rose windows
    for (const sz of [-1, 1]) {
      panel(gp, 0.44, 0.34, 0.04, c, [archPath(0, 0, 0.12, 0.16, true), archPath(-0.12, 0, 0.07, 0.12, true), archPath(0.12, 0, 0.07, 0.12, true)], 0, 0.03, sz * 0.22);
      add(gp, CYL(12), mat('#38bdf8', { emissive: '#0284c7' }), 0, 0.25, sz * 0.23, 0.09, 0.015, 0.09, 0, Math.PI / 2);
      // 4 parabolic perforated bell towers per facade
      for (let i = 0; i < 4; i++) {
        const tx = -0.18 + i * 0.12;
        const th = 0.56 + (i === 1 || i === 2 ? 0.12 : 0);
        lathe(gp, [[0.048, 0], [0.046, th * 0.5], [0.034, th * 0.85], [0.012, th], [0, th + 0.02]], shade(c, 1.04), tx, 0.24, sz * 0.19, 10);
        ball(gp, '#f59e0b', tx, 0.25 + th, sz * 0.19, 0.032);
      }
    }
    // 4 Evangelist towers + soaring central Tower of Jesus Christ + white/gold cross
    for (const [ex, ez] of [[-0.10, -0.07], [0.10, -0.07], [-0.10, 0.07], [0.10, 0.07]]) {
      lathe(gp, [[0.045, 0], [0.04, 0.36], [0.02, 0.52], [0, 0.55]], shade(c, 0.96), ex, 0.34, ez, 8);
      ball(gp, '#eab308', ex, 0.90, ez, 0.03);
    }
    lathe(gp, [[0.075, 0], [0.068, 0.42], [0.042, 0.68], [0.018, 0.78], [0, 0.80]], shade(c, 1.1), 0, 0.34, 0, 12);
    box(gp, '#f8fafc', 0, 1.14, 0, 0.024, 0.11, 0.024);
    box(gp, '#fde047', 0, 1.18, 0, 0.075, 0.024, 0.075);
  },
  moai: (gp, r) => {
    const c = r.color!;
    // Rapa Nui Ahu Tongariki volcanic stone platform + 5 sculpted Moai monoliths with brow ridges, noses, arms & red scoria pukao hats
    box(gp, '#4d7c5d', 0, 0, 0, 1.06, 0.03, 0.44);
    tbox(gp, 0.98, 0.28, 0.94, 0.24, 0.075, '#57534e', 0, 0.03, 0);
    const cnt = num(r.count, 5);
    for (let i = 0; i < cnt; i++) {
      const x = -0.36 + i * 0.18;
      const s = 0.88 + ((i * 3) % 3) * 0.10;
      const col = shade(c, 0.92 + (i % 2) * 0.1);
      // Torso with carved arms at waist
      tbox(gp, 0.125 * s, 0.10 * s, 0.105 * s, 0.085 * s, 0.24 * s, col, x, 0.105, 0);
      // Elongated angular head + overhanging brow + long nose + chin + ears
      tbox(gp, 0.10 * s, 0.10 * s, 0.088 * s, 0.085 * s, 0.22 * s, shade(col, 1.06), x, 0.105 + 0.24 * s, 0.008);
      box(gp, shade(col, 1.15), x, 0.105 + 0.41 * s, 0.052 * s, 0.092 * s, 0.026 * s, 0.03 * s);
      tbox(gp, 0.032 * s, 0.035 * s, 0.022 * s, 0.025 * s, 0.11 * s, shade(col, 0.82), x, 0.105 + 0.30 * s, 0.056 * s);
      for (const sx of [-1, 1]) box(gp, shade(col, 0.88), x + sx * 0.052 * s, 0.105 + 0.30 * s, 0, 0.015 * s, 0.11 * s, 0.04 * s);
      // Red scoria pukao topknot on alternating statues
      if (i % 2 === 1 || i === 2) {
        cyl(gp, '#b91c1c', x, 0.105 + 0.46 * s, 0.008, 0.044 * s, 0.065 * s, 10);
      }
    }
  },
  suspension: (gp, r) => {
    const c = r.color!;
    // Golden Gate Bridge: Bay water + Marin/SF headlands + Art Deco twin-leg portal towers + catenary cables + suspenders
    box(gp, '#0369a1', 0, 0, 0, 1.18, 0.025, 0.44);
    cone(gp, '#4d7c5d', -0.54, 0.02, -0.06, 0.14, 0.22, 6);
    cone(gp, '#4d7c5d', 0.54, 0.02, 0.06, 0.12, 0.18, 6);
    // Shore cable anchorages
    for (const sx of [-0.54, 0.54]) box(gp, '#cbd5e1', sx, 0.025, 0, 0.08, 0.19, 0.16);
    // Truss-stiffened roadway deck
    box(gp, c, 0, 0.195, 0, 1.14, 0.028, 0.14);
    box(gp, '#334155', 0, 0.223, 0, 1.14, 0.012, 0.12);
    // Art Deco stepped twin towers with 4 horizontal portal struts
    for (const tx of [-0.30, 0.30]) {
      cyl(gp, '#cbd5e1', tx, 0.025, 0, 0.075, 0.055, 10);
      for (const tz of [-0.052, 0.052]) {
        tbox(gp, 0.048, 0.036, 0.030, 0.026, 0.72, c, tx, 0.08, tz);
      }
      for (const py of [0.14, 0.34, 0.52, 0.66, 0.77]) {
        box(gp, shade(c, 1.08), tx, py, 0, 0.042, 0.026, 0.12);
      }
    }
    // Parabolic main suspension cables + vertical suspender ropes
    for (const z of [-0.052, 0.052]) {
      const spans: [number, number, number, number, number][] = [
        [-0.54, -0.30, 0.21, 0.79, 8],
        [-0.30, 0.30, 0.79, 0.79, 16],
        [0.30, 0.54, 0.79, 0.21, 8],
      ];
      for (const [x0, x1, y0, y1, n] of spans) {
        const isMain = x0 === -0.30;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n, x = x0 + (x1 - x0) * u;
          const sag = isMain ? 4 * u * (1 - u) * 0.52 : u * (1 - u) * 0.16;
          const y = y0 + (y1 - y0) * u - sag;
          pts.push([x, y, z]);
        }
        for (let i = 0; i < n; i++) rod(gp, pts[i], pts[i + 1], 0.011, shade(c, 1.1), 5);
        for (let i = 1; i < n; i += 2) {
          const [sx, sy] = pts[i];
          if (Math.abs(Math.abs(sx) - 0.30) < 0.03) continue;
          cyl(gp, '#cbd5e1', sx, 0.22, z, 0.0035, Math.max(0.02, sy - 0.22), 4);
        }
      }
    }
  },
  ruins: (gp, r) => {
    const c = r.color!;
    // Machu Picchu: Dramatic Huayna Picchu sugar-loaf peak + stepped green Andean agricultural terraces + Inca stone temples
    for (let i = 0; i < 6; i++) {
      const w = 0.92 - i * 0.11, d = 0.66 - i * 0.07, y = i * 0.055;
      box(gp, '#94a3b8', 0, y, 0.04, w + 0.02, 0.032, d + 0.02);
      box(gp, shade('#4d7c5d', 0.92 + (i % 2) * 0.08), 0, y + 0.032, 0.04, w, 0.026, d);
    }
    // Iconic steep Huayna Picchu peak in the background + secondary ridge
    tbox(gp, 0.38, 0.32, 0.08, 0.07, 0.68, '#3f6b4e', 0.14, 0.12, -0.22, -0.03, 0);
    cone(gp, '#2d6a4f', -0.26, 0.12, -0.20, 0.16, 0.44, 6);
    // Inca trapezoidal stone enclosures & Intihuatana ritual platform on upper terraces
    const houses: [number, number, number][] = [[-0.18, 0.33, 0.08], [0.0, 0.33, 0.12], [0.18, 0.33, 0.07], [-0.12, 0.275, 0.20], [0.12, 0.275, 0.20]];
    for (const [hx, hy, hz] of houses) {
      box(gp, c, hx, hy, hz, 0.11, 0.075, 0.085);
      gable(gp, 0.115, 0.045, 0.09, shade(c, 0.78), hx, hy + 0.075, hz);
    }
  },
  steppyramid: (gp, r) => {
    const c = r.color!;
    // Chichén Itzá (El Castillo): 9 stepped limestone terraces + 4 grand balustriga staircases + Temple of Kukulcán
    box(gp, '#4d7c5d', 0, 0, 0, 0.98, 0.025, 0.98);
    for (let i = 0; i < 9; i++) {
      const w = 0.84 - i * 0.072;
      tbox(gp, w, w, w - 0.03, w - 0.03, 0.062, shade(c, 1 - (i % 2) * 0.06), 0, 0.025 + i * 0.06, 0);
    }
    // 4 cardinal staircases with balustrades + serpent heads at base
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const sg = new THREE.Group(); sg.rotation.y = ry; gp.add(sg);
      tbox(sg, 0.16, 0.08, 0.13, 0.06, 0.55, shade(c, 0.88), 0, 0.025, 0.41, 0, -0.25);
      for (const sx of [-0.075, 0.075]) {
        tbox(sg, 0.022, 0.08, 0.018, 0.05, 0.56, shade(c, 1.1), sx, 0.025, 0.415, 0, -0.25);
        box(sg, shade(c, 1.15), sx, 0.025, 0.455, 0.032, 0.042, 0.045);
      }
    }
    // Upper Temple of Kukulcán sanctuary
    box(gp, shade(c, 0.94), 0, 0.565, 0, 0.22, 0.11, 0.22);
    box(gp, shade(c, 1.12), 0, 0.675, 0, 0.24, 0.03, 0.24);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      panel(gp, 0.222, 0.09, 0.015, shade(c, 0.72), [archPath(0, 0, 0.06, 0.07)], 0, 0.565, 0.11, ry);
    }
  },
  temple: (gp, r) => {
    const c = r.color!;
    // Angkor Wat: Outer water moat + western Naga causeway + outer gallery wall + cruciform terraces + 5 lotus-bud prasat towers
    box(gp, '#0284c7', 0, 0, 0, 0.98, 0.022, 0.98);
    box(gp, '#4d7c5d', 0, 0.022, 0, 0.78, 0.02, 0.78);
    box(gp, shade(c, 1.05), 0, 0.018, 0.42, 0.12, 0.025, 0.20);
    // Outer gallery enclosure
    for (const s of [-0.34, 0.34]) {
      box(gp, shade(c, 0.88), 0, 0.042, s, 0.70, 0.065, 0.045);
      box(gp, shade(c, 0.88), s, 0.042, 0, 0.045, 0.065, 0.70);
    }
    // Raised 2nd & 3rd terraces
    box(gp, c, 0, 0.042, 0, 0.54, 0.09, 0.54);
    box(gp, shade(c, 0.94), 0, 0.132, 0, 0.38, 0.11, 0.38);
    // 5 ribbed lotus-bud towers (central Mount Meru spire + 4 corner towers)
    const towers: [number, number, number][] = [[0, 0, 0.52], [-0.15, -0.15, 0.34], [0.15, -0.15, 0.34], [-0.15, 0.15, 0.34], [0.15, 0.15, 0.34]];
    for (const [tx, tz, th] of towers) {
      box(gp, shade(c, 0.86), tx, 0.24, tz, 0.11, 0.08, 0.11);
      lathe(gp, [
        [0.068, 0], [0.062, th * 0.22], [0.070, th * 0.28], [0.052, th * 0.48],
        [0.058, th * 0.54], [0.038, th * 0.75], [0.018, th * 0.92], [0, th],
      ], shade(c, 1.06), tx, 0.32, tz, 10);
    }
  },
  leaning: (gp, r) => {
    const c = r.color!;
    // Piazza dei Miracoli emerald lawn + Leaning Tower of Pisa with 6 open colonnade galleries + belfry
    cyl(gp, '#4d7c5d', 0, 0, 0, 0.36, 0.025, 18);
    const t = new THREE.Group(); t.position.set(-0.03, 0.02, 0); t.rotation.z = -0.135; gp.add(t);
    // Solid ground floor with blind Romanesque arches
    cyl(t, shade(c, 0.92), 0, 0, 0, 0.155, 0.16, 16);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      box(t, c, Math.cos(a) * 0.156, 0.01, Math.sin(a) * 0.156, 0.016, 0.14, 0.016, -a);
    }
    // 6 open colonnade loggia floors (each with recessed inner wall + ring of 12 marble columns + cornice)
    for (let fl = 0; fl < 6; fl++) {
      const fy = 0.16 + fl * 0.11;
      cyl(t, shade(c, 0.78), 0, fy, 0, 0.125, 0.105, 14);
      cyl(t, shade(c, 1.06), 0, fy, 0, 0.162, 0.018, 18);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + (fl % 2) * 0.12;
        cyl(t, c, Math.cos(a) * 0.148, fy + 0.018, Math.sin(a) * 0.148, 0.010, 0.088, 6);
      }
    }
    cyl(t, shade(c, 1.06), 0, 0.82, 0, 0.162, 0.022, 18);
    // 8th-floor smaller belfry chamber
    cyl(t, shade(c, 0.86), 0, 0.84, 0, 0.11, 0.11, 14);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      box(t, c, Math.cos(a) * 0.112, 0.84, Math.sin(a) * 0.112, 0.018, 0.10, 0.018, -a);
    }
    cyl(t, shade(c, 1.08), 0, 0.95, 0, 0.118, 0.02, 14);
  },
  stones: (gp, r) => {
    const c = r.color!;
    // Stonehenge: Salisbury Plain circular grass earthwork + outer sarsen lintel ring + inner 5 giant trilithons + bluestones
    cyl(gp, '#4d7c5d', 0, 0, 0, 0.48, 0.03, 20);
    add(gp, g('hengeDitch', () => new THREE.RingGeometry(0.42, 0.47, 24).rotateX(-Math.PI / 2)), mat('#65a30d'), 0, 0.032, 0, 1, 1, 1);
    // Outer sarsen circle with continuous lintels on surviving northeast arc
    const N = 14;
    for (let i = 0; i < N; i++) {
      if (i === 5 || i === 6 || i === 11) continue;
      const a = (i / N) * Math.PI * 2;
      tbox(gp, 0.075, 0.048, 0.068, 0.042, 0.25, shade(c, 0.92 + (i % 3) * 0.05), Math.cos(a) * 0.34, 0.03, Math.sin(a) * 0.34, 0, 0, -a + Math.PI / 2);
      if (i < 4 || (i >= 7 && i <= 9)) {
        const a2 = ((i + 0.5) / N) * Math.PI * 2;
        box(gp, shade(c, 1.06), Math.cos(a2) * 0.34, 0.28, Math.sin(a2) * 0.34, 0.165, 0.048, 0.055, -a2 + Math.PI / 2);
      }
    }
    // 5 giant central horseshoe trilithons
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + (i / 4) * 2.4;
      const th = i === 2 ? 0.36 : 0.31;
      const cx = Math.cos(a) * 0.17, cz = Math.sin(a) * 0.17, ry = -a + Math.PI / 2;
      const g3 = new THREE.Group(); g3.position.set(cx, 0.03, cz); g3.rotation.y = ry; gp.add(g3);
      tbox(g3, 0.068, 0.055, 0.060, 0.048, th, shade(c, 0.86), -0.052, 0, 0);
      tbox(g3, 0.068, 0.055, 0.060, 0.048, th, shade(c, 0.86), 0.052, 0, 0);
      box(g3, shade(c, 1.04), 0, th, 0, 0.185, 0.052, 0.065);
    }
    // Central Altar Stone + distant Heel Stone
    box(gp, '#64748b', 0, 0.03, 0.02, 0.12, 0.025, 0.05, 0.3);
    tbox(gp, 0.055, 0.05, 0.035, 0.035, 0.16, shade(c, 0.9), 0.42, 0.03, 0.18, 0.02, 0);
  },
  skyscraper: (gp, r) => {
    if (r.taper) return ICON_BUILDERS.burj(gp, r);
    const h = num(r.h, 1.4), c = r.color!;
    // Empire State Building: 5th Ave Art Deco podium + stepped Indiana limestone setbacks + window mullions + mooring mast
    box(gp, shade(c, 0.86), 0, 0, 0, 0.44, 0.14, 0.32);
    box(gp, shade(c, 0.92), 0, 0.14, 0, 0.34, 0.10, 0.26);
    box(gp, c, 0, 0.24, 0, 0.24, 0.58, 0.20);
    // Art Deco recessed corner notches & vertical window strips
    for (const sx of [-1, 1]) {
      box(gp, shade(c, 0.95), sx * 0.13, 0.24, 0, 0.04, 0.52, 0.14);
    }
    for (const sz of [-0.102, 0.102]) {
      for (let k = -2; k <= 2; k++) box(gp, '#334155', k * 0.036, 0.26, sz, 0.014, 0.54, 0.006);
    }
    // Upper setbacks (72nd, 81st, 86th floor observatory) + silver Art Deco mooring mast + broadcast spire
    box(gp, shade(c, 1.05), 0, 0.82, 0, 0.19, 0.11, 0.16);
    box(gp, shade(c, 1.10), 0, 0.93, 0, 0.14, 0.07, 0.12);
    cyl(gp, '#cbd5e1', 0, 1.00, 0, 0.048, 0.15, 12);
    lathe(gp, [[0.048, 0], [0.042, 0.04], [0.018, 0.07], [0, 0.08]], '#e2e8f0', 0, 1.15, 0, 12);
    cyl(gp, '#f8fafc', 0, 1.22, 0, 0.008, 0.22, 6);
    void h;
  },
  pagodatower: (gp, r) => {
    const c = r.color!;
    // Taipei 101: Tapered mall podium + 8 flared bamboo-box modules with ruyi medallions + pinnacle spire
    tbox(gp, 0.36, 0.36, 0.24, 0.24, 0.24, shade(c, 0.88), 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const y = 0.24 + i * 0.10;
      tbox(gp, 0.21, 0.21, 0.26, 0.26, 0.098, shade(c, 0.95 + (i % 2) * 0.08), 0, y, 0);
      box(gp, '#cbd5e1', 0, y + 0.094, 0, 0.268, 0.010, 0.268);
      // Traditional ruyi cloud ornament on all 4 faces
      for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        box(gp, '#eab308', 0, y + 0.065, 0.132, 0.036, 0.026, 0.012, ry);
      }
    }
    tbox(gp, 0.15, 0.15, 0.10, 0.10, 0.11, shade(c, 1.1), 0, 1.04, 0);
    cyl(gp, '#e2e8f0', 0, 1.15, 0, 0.032, 0.09, 8);
    cyl(gp, '#fde047', 0, 1.24, 0, 0.010, 0.16, 6);
  },
  twin: (gp, r) => {
    const c = r.color!;
    // Petronas Twin Towers: KLCC base + 8-pointed Rub el Hizb star towers + 5 setbacks + Skybridge with V-struts
    box(gp, '#4d7c5d', 0, 0, 0, 0.68, 0.03, 0.42);
    for (const tx of [-0.17, 0.17]) {
      const tiers: [number, number, number][] = [[0.03, 0.56, 1.0], [0.59, 0.18, 0.84], [0.77, 0.14, 0.70], [0.91, 0.10, 0.54]];
      for (const [ty, th, s] of tiers) {
        // Rub el Hizb 8-pointed star: two overlapping rotated squares + 8 semi-circular flutes
        box(gp, c, tx, ty, 0, 0.17 * s, th, 0.17 * s, 0);
        box(gp, shade(c, 1.06), tx, ty, 0, 0.17 * s, th, 0.17 * s, Math.PI / 4);
        cyl(gp, '#e2e8f0', tx, ty + th - 0.015, 0, 0.115 * s, 0.016, 16);
      }
      lathe(gp, [[0.045, 0], [0.035, 0.08], [0.015, 0.18], [0, 0.24]], '#f8fafc', tx, 1.01, 0, 10);
      ball(gp, '#e2e8f0', tx, 1.14, 0, 0.032);
    }
    // Double-deck Skybridge + inclined V-support legs
    box(gp, '#e2e8f0', 0, 0.48, 0, 0.24, 0.036, 0.052);
    strut(gp, [-0.12, 0.36, 0], [0, 0.48, 0], 0.010, 0.010, '#cbd5e1', 6);
    strut(gp, [0.12, 0.36, 0], [0, 0.48, 0], 0.010, 0.010, '#cbd5e1', 6);
  },
  castle: (gp, r) => {
    const roof = (r.roof as string) ?? '#2563eb', c = r.color!;
    if (roof === '#3f6a4a') {
      // Moscow Kremlin: Red-brick swallowtail fortress wall + Spasskaya Clock Tower with green tent spire & ruby star + Cathedral domes
      box(gp, '#64748b', 0, 0, 0, 0.88, 0.03, 0.64);
      box(gp, c, 0, 0.03, 0.16, 0.82, 0.20, 0.08);
      for (let i = -5; i <= 5; i++) box(gp, shade(c, 0.9), i * 0.07, 0.23, 0.16, 0.042, 0.04, 0.082);
      // Spasskaya Savior Tower in foreground
      box(gp, shade(c, 0.94), 0, 0.03, 0.18, 0.22, 0.36, 0.22);
      box(gp, '#f8fafc', 0, 0.36, 0.18, 0.23, 0.04, 0.23);
      box(gp, c, 0, 0.40, 0.18, 0.17, 0.18, 0.17);
      // Black & gold Kremlin chimes on all 4 sides
      for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const cg = new THREE.Group(); cg.position.set(0, 0, 0.18); cg.rotation.y = ry; gp.add(cg);
        add(cg, CYL(12), mat('#1e293b'), 0, 0.49, 0.088, 0.09, 0.012, 0.09, 0, Math.PI / 2);
        add(cg, g('kRing', () => new THREE.RingGeometry(0.036, 0.046, 12)), mat('#eab308'), 0, 0.49, 0.095, 1, 1, 1);
      }
      cyl(gp, '#f8fafc', 0, 0.58, 0.18, 0.09, 0.08, 8);
      cone(gp, roof, 0, 0.66, 0.18, 0.088, 0.24, 8);
      ball(gp, '#ef4444', 0, 0.92, 0.18, 0.045).material = mat('#ef4444', { emissive: '#dc2626' });
      // Grand Kremlin Palace & golden cathedral domes behind wall
      box(gp, '#fef3c7', -0.16, 0.03, -0.08, 0.36, 0.26, 0.24);
      for (const dx of [-0.24, -0.16, -0.08]) ball(gp, '#eab308', dx, 0.33, -0.08, 0.065, 0.08, 0.065);
      cyl(gp, '#f8fafc', 0.22, 0.03, -0.08, 0.065, 0.46, 8);
      ball(gp, '#eab308', 0.22, 0.52, -0.08, 0.08, 0.10, 0.08);
      return;
    }
    // Neuschwanstein Castle: Alpine rocky ridge + red-brick gatehouse + white limestone Palas hall + fairy-tale blue-spired turrets
    tbox(gp, 0.92, 0.56, 0.78, 0.44, 0.14, '#64748b', 0, 0, 0);
    for (const [tx, tz] of [[-0.38, 0.18], [0.38, 0.16], [-0.34, -0.18]]) tree(gp, tx, 0.08, tz, 0.065, '#2d6a4f', true);
    // Red-brick Gatehouse on right (+X)
    box(gp, '#b91c1c', 0.28, 0.14, 0.04, 0.18, 0.20, 0.24);
    gable(gp, 0.19, 0.09, 0.25, '#334155', 0.28, 0.34, 0.04);
    // Creamy-white Romanesque Palas (main hall) with blue slate roof & rows of arched windows
    box(gp, c, -0.08, 0.14, -0.02, 0.44, 0.34, 0.24);
    gable(gp, 0.45, 0.16, 0.26, roof, -0.08, 0.48, -0.02);
    for (let fl = 0; fl < 3; fl++) {
      for (let w = 0; w < 5; w++) {
        box(gp, '#334155', -0.22 + w * 0.07, 0.18 + fl * 0.095, 0.102, 0.024, 0.055, 0.01);
      }
    }
    // Square watchtower + soaring circular fairy-tale turrets with conical blue spires
    box(gp, shade(c, 0.95), 0.08, 0.14, 0.10, 0.11, 0.48, 0.11);
    cone(gp, roof, 0.08, 0.62, 0.10, 0.085, 0.16, 4, Math.PI / 4);
    for (const [tx, tz, th, tr] of [[-0.28, -0.08, 0.68, 0.068], [-0.32, 0.10, 0.52, 0.052], [0.16, -0.12, 0.56, 0.055]] as const) {
      cyl(gp, c, tx, 0.14, tz, tr, th, 10);
      cyl(gp, shade(c, 1.06), tx, 0.14 + th - 0.06, tz, tr * 1.14, 0.06, 10);
      cone(gp, roof, tx, 0.14 + th, tz, tr * 1.22, 0.22, 10);
    }
  },
  carved: (gp, r) => ICON_BUILDERS.petra(gp, r),
  palace: (gp, r) => {
    const roof = (r.roof as string) ?? '#eab308', c = r.color!;
    // Forbidden City / Gyeongbokgung: 3-tier white marble Sumi terrace + triple dragon staircases + vermilion colonnade + double-eaved hip roof
    for (let t = 0; t < 3; t++) {
      const w = 0.96 - t * 0.08, d = 0.68 - t * 0.06, y = t * 0.048;
      box(gp, '#f1f5f9', 0, y, 0, w, 0.048, d);
      box(gp, '#cbd5e1', 0, y + 0.044, 0, w + 0.015, 0.014, d + 0.015);
    }
    // Triple imperial stone staircases on front (+Z) with carved central dragon ramp
    for (const sx of [-0.16, 0, 0.16]) {
      tbox(gp, sx === 0 ? 0.14 : 0.09, 0.06, sx === 0 ? 0.12 : 0.08, 0.04, 0.15, '#e2e8f0', sx, 0, 0.34, 0, -0.06);
    }
    // Vermilion throne hall + perimeter red columns + golden/emerald lintel beams
    box(gp, shade(c, 0.85), 0, 0.144, 0, 0.64, 0.20, 0.36);
    for (let ix = -4; ix <= 4; ix++) {
      for (const pz of [-0.19, 0.19]) cyl(gp, c, ix * 0.072, 0.144, pz, 0.016, 0.20, 8);
    }
    box(gp, '#10b981', 0, 0.32, 0, 0.68, 0.025, 0.40);
    // Lower upturned eave roof + upper story + grand hip-and-gable roof with golden ridge finials
    tbox(gp, 0.82, 0.52, 0.58, 0.34, 0.09, roof, 0, 0.34, 0);
    box(gp, c, 0, 0.42, 0, 0.50, 0.10, 0.28);
    box(gp, '#10b981', 0, 0.50, 0, 0.52, 0.02, 0.30);
    tbox(gp, 0.68, 0.42, 0.34, 0.04, 0.14, roof, 0, 0.52, 0);
    box(gp, '#eab308', 0, 0.655, 0, 0.38, 0.022, 0.028);
    for (const sx of [-0.18, 0.18]) box(gp, '#eab308', sx, 0.66, 0, 0.028, 0.04, 0.032);
  },
  bascule: (gp, r) => {
    const c = r.color!;
    const stone = '#d6d3d1';
    const slate = '#334155';
    // Tower Bridge (London): Thames river channel + boat piers + twin Victorian Gothic towers with pierced roadway arches + walkways + chains
    box(gp, '#0369a1', 0, 0, 0, 1.18, 0.025, 0.42);
    for (const tx of [-0.24, 0.24]) {
      // Massive boat-shaped masonry river pier
      cyl(gp, '#94a3b8', tx, 0.025, 0, 0.11, 0.10, 10);
      // Victorian Gothic tower with pierced pointed arch portal along X roadway
      panel(gp, 0.18, 0.54, 0.16, stone, [archPath(0, 0, 0.095, 0.16, true), archPath(0, 0.22, 0.06, 0.11, true), archPath(0, 0.37, 0.06, 0.10, true)], tx, 0.125, 0, Math.PI / 2);
      // 4 corner octagonal turrets + pointed slate spirelets
      for (const cx of [-0.078, 0.078]) for (const cz of [-0.078, 0.078]) {
        cyl(gp, shade(stone, 1.06), tx + cx, 0.125, cz, 0.024, 0.58, 8);
        cone(gp, slate, tx + cx, 0.705, cz, 0.030, 0.12, 8);
        cyl(gp, '#eab308', tx + cx, 0.825, cz, 0.004, 0.035, 6);
      }
      // Steep pyramidal slate roof between turrets
      tbox(gp, 0.16, 0.16, 0.04, 0.04, 0.15, slate, tx, 0.665, 0);
    }
    // Twin high-level horizontal steel lattice walkways
    for (const wz of [-0.055, 0.055]) {
      box(gp, '#cbd5e1', 0, 0.52, wz, 0.42, 0.038, 0.032);
      box(gp, c, 0, 0.515, wz, 0.42, 0.012, 0.038);
    }
    // Side suspension roadways + blue parabolic suspension chains + white vertical rods
    for (const sx of [-1, 1]) {
      box(gp, '#475569', sx * 0.42, 0.125, 0, 0.34, 0.028, 0.13);
      box(gp, c, sx * 0.42, 0.115, 0, 0.34, 0.022, 0.14);
      for (const cz of [-0.055, 0.055]) {
        const p0: [number, number, number] = [sx * 0.26, 0.52, cz];
        const p1: [number, number, number] = [sx * 0.41, 0.27, cz];
        const p2: [number, number, number] = [sx * 0.57, 0.14, cz];
        rod(gp, p0, p1, 0.014, c, 6);
        rod(gp, p1, p2, 0.014, c, 6);
        cyl(gp, '#f8fafc', sx * 0.35, 0.14, cz, 0.005, 0.22, 5);
        cyl(gp, '#f8fafc', sx * 0.45, 0.14, cz, 0.005, 0.11, 5);
      }
    }
    // Double-leaf bascule drawbridge slightly raised in center
    box(gp, c, -0.10, 0.155, 0, 0.17, 0.026, 0.12, 0, 0, 0.28);
    box(gp, c, 0.10, 0.155, 0, 0.17, 0.026, 0.12, 0, 0, -0.28);
  },
  pagoda: (gp, r) => {
    const fl = num(r.floors, 3), c = r.color!;
    // Kinkaku-ji (Golden Pavilion): Kyoko-chi mirror pond + pine island + timber deck + 3 distinct stories with upturned irimoya roofs + golden phoenix
    box(gp, '#0369a1', 0, 0, 0, 0.92, 0.022, 0.82);
    box(gp, '#78716c', -0.04, 0.022, -0.04, 0.56, 0.045, 0.52);
    box(gp, '#92400e', -0.04, 0.067, 0.02, 0.52, 0.02, 0.48);
    // Pond island with Japanese pine
    ball(gp, '#57534e', 0.30, 0.03, 0.22, 0.18, 0.05, 0.14);
    tree(gp, 0.30, 0.045, 0.22, 0.08, '#2d6a4f', true);
    const roofC = '#334155';
    for (let i = 0; i < fl; i++) {
      const y = 0.087 + i * 0.21;
      const w = 0.42 - i * 0.065;
      const wallC = i === 0 ? '#f8fafc' : c;
      box(gp, wallC, -0.04, y, -0.04, w, 0.14, w);
      // Perimeter wooden posts & lattice windows
      for (const s of [-1, 1]) {
        box(gp, '#78350f', -0.04, y + 0.01, -0.04 + s * (w / 2 + 0.004), w + 0.02, 0.018, 0.015);
        for (let k = -2; k <= 2; k++) box(gp, '#451a03', -0.04 + k * (w * 0.18), y + 0.02, -0.04 + s * (w / 2 + 0.005), 0.014, 0.10, 0.01);
      }
      // Upturned Japanese tiled roof
      const rw = w + 0.22 - i * 0.02;
      tbox(gp, rw, rw, rw * 0.52, rw * 0.52, 0.075, roofC, -0.04, y + 0.135, -0.04);
      box(gp, c, -0.04, y + 0.132, -0.04, rw + 0.01, 0.012, rw + 0.01);
    }
    const topY = 0.087 + (fl - 1) * 0.21 + 0.21;
    tbox(gp, 0.32, 0.32, 0.03, 0.03, 0.11, roofC, -0.04, topY - 0.05, -0.04);
    // Golden Hōō (Phoenix) finial at apex
    box(gp, '#fde047', -0.04, topY + 0.06, -0.04, 0.045, 0.04, 0.045);
    ball(gp, '#fde047', -0.04, topY + 0.13, -0.04, 0.06, 0.08, 0.04).material = mat('#fde047', { emissive: '#eab308' });
  },
  // ---------- discoveries ----------
};

const FALLBACK: Builder = (gp, r) => { cyl(gp, r.color ?? '#ffcc33', 0, 0, 0, 0.12, 0.5); ball(gp, r.color ?? '#ffcc33', 0, 0.6, 0, 0.3); };

Object.assign(B, ANIMAL_BUILDERS, NATURE_BUILDERS, VEHICLE_BUILDERS, DISCOVERY_BUILDERS);

// Shared vertex-colored materials for baked static meshes: smooth or flat; roughness / metalness ride per vertex.
const bakedMats = new Map<string, THREE.MeshStandardMaterial>();
function bakedMat(flat: boolean): THREE.MeshStandardMaterial {
  const k = `${flat}`;
  let m = bakedMats.get(k);
  if (!m) {
    // roughness / metalness come per vertex (see pbr.ts); these only seed the material
    m = useVertexPbr(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.04, flatShading: flat }));
    bakedMats.set(k, m);
  }
  return m;
}

/** Triangle soup; `parts` holds the first vertex of every source mesh (for per-part simplification). */
interface Bucket { pos: number[]; norm: number[]; col: number[]; pbr: number[]; parts?: number[] }

// Cosine-weighted hemisphere ray set (z-up) for the ambient-occlusion bake.
const AO_DIRS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, phi = i * 2.399963;
    const r = Math.sqrt(u);
    out.push(new THREE.Vector3(Math.cos(phi) * r, Math.sin(phi) * r, Math.sqrt(1 - u)));
  }
  return out;
})();

/**
 * Bakes ambient occlusion into vertex colors: triangles are voxelised into an occupancy grid, then a short
 * cosine-weighted ray fan is marched from every vertex. Crevices, arcades, undersides and ground contact darken.
 */
function bakeAO(buckets: Bucket[], minY: number): void {
  const bb = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const b of buckets) for (let i = 0; i < b.pos.length; i += 3) bb.expandByPoint(v.set(b.pos[i], b.pos[i + 1], b.pos[i + 2]));
  if (bb.isEmpty()) return;
  const size = bb.getSize(new THREE.Vector3());
  const R = 44;
  const cs = Math.max(size.x, size.y, size.z) / R;
  const ox = bb.min.x - cs * 2, oy = bb.min.y - cs * 2, oz = bb.min.z - cs * 2;
  const nx = Math.ceil(size.x / cs) + 5, ny = Math.ceil(size.y / cs) + 5, nz = Math.ceil(size.z / cs) + 5;
  const grid = new Uint8Array(nx * ny * nz);
  const mark = (x: number, y: number, z: number) => {
    const ix = Math.floor((x - ox) / cs), iy = Math.floor((y - oy) / cs), iz = Math.floor((z - oz) / cs);
    if (ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz) grid[ix + nx * (iy + ny * iz)] = 1;
  };
  for (const b of buckets) {
    const P = b.pos;
    for (let t = 0; t < P.length; t += 9) {
      const ax = P[t], ay = P[t + 1], az = P[t + 2], bx = P[t + 3], by = P[t + 4], bz = P[t + 5], cx = P[t + 6], cy = P[t + 7], cz = P[t + 8];
      const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
      const n = Math.min(160, Math.max(1, Math.ceil(e / (cs * 0.6))));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, w = j / n, s = 1 - u - w;
        mark(ax * s + bx * u + cx * w, ay * s + by * u + cy * w, az * s + bz * u + cz * w);
      }
    }
  }
  const occ = (x: number, y: number, z: number) => {
    if (y < minY - cs * 0.5) return true;
    const ix = Math.floor((x - ox) / cs), iy = Math.floor((y - oy) / cs), iz = Math.floor((z - oz) / cs);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return false;
    return grid[ix + nx * (iy + ny * iz)] === 1;
  };
  const N = new THREE.Vector3(), Tg = new THREE.Vector3(), Bt = new THREE.Vector3(), D = new THREE.Vector3();
  const cache = new Map<number, number>();
  const STEPS = 7;
  for (const b of buckets) {
    for (let i = 0; i < b.pos.length; i += 3) {
      const px = b.pos[i], py = b.pos[i + 1], pz = b.pos[i + 2];
      N.set(b.norm[i], b.norm[i + 1], b.norm[i + 2]);
      // Numeric spatial hash of (half-cell position, coarse normal) — vertices shared by faces reuse one sample
      const key = (Math.round(px / cs * 2) * 73856093) ^ (Math.round(py / cs * 2) * 19349663) ^ (Math.round(pz / cs * 2) * 83492791)
        ^ ((Math.round(N.x * 3) + 3) | ((Math.round(N.y * 3) + 3) << 3) | ((Math.round(N.z * 3) + 3) << 6)) * 2654435761;
      let ao = cache.get(key);
      if (ao === undefined) {
        Tg.set(Math.abs(N.y) < 0.9 ? 0 : 1, Math.abs(N.y) < 0.9 ? 1 : 0, 0).cross(N).normalize();
        Bt.crossVectors(N, Tg);
        let hit = 0;
        for (const d of AO_DIRS) {
          D.set(0, 0, 0).addScaledVector(Tg, d.x).addScaledVector(Bt, d.y).addScaledVector(N, d.z);
          for (let s = 1; s <= STEPS; s++) {
            const dist = cs * (0.9 + s * 1.3);
            if (occ(px + N.x * cs * 0.9 + D.x * dist, py + N.y * cs * 0.9 + D.y * dist, pz + N.z * cs * 0.9 + D.z * dist)) {
              hit += 1 - (s - 1) / (STEPS * 1.4);
              break;
            }
          }
        }
        ao = Math.max(0.34, 1 - 0.95 * (hit / AO_DIRS.length));
        cache.set(key, ao);
      }
      b.col[i] *= ao; b.col[i + 1] *= ao; b.col[i + 2] *= ao;
    }
  }
}

/** Far level of detail: parts with more triangles than this are simplified; smaller ones are kept as they are. */
const LOD_KEEP_TRIS = 60;
/** ... by snapping their vertices to cells of 1/LOD_CELLS of the part's size (capped at R / LOD_CELLS). */
const LOD_CELLS = 7;
const LOD_DIRS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function soupArea(pos: number[], v0: number, v1: number): number {
  let A = 0;
  for (let i = v0 * 3; i + 8 < v1 * 3; i += 9) {
    const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    A += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
  }
  return A;
}

/** Vertex clustering of vertices [s0, s1) of a soup on a grid of `cell` (origin x0,y0,z0) × 6 normal directions. */
function clusterPart(b: Bucket, s0: number, s1: number, x0: number, y0: number, z0: number, cell: number, withColor: boolean): Bucket {
  const out: Bucket = { pos: [], norm: [], col: [], pbr: [] };
  const ids = new Map<number, number>();
  const vert = new Int32Array(s1 - s0);
  const acc: number[] = []; // per cluster: x y z nx ny nz r g b count roughness metalness
  for (let i = s0; i < s1; i++) {
    const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
    const nx = b.norm[i * 3], ny = b.norm[i * 3 + 1], nz = b.norm[i * 3 + 2];
    let d = 0, best = -2;
    for (let k = 0; k < 6; k++) {
      const v = LOD_DIRS[k][0] * nx + LOD_DIRS[k][1] * ny + LOD_DIRS[k][2] * nz;
      if (v > best) { best = v; d = k; }
    }
    const key = ((Math.floor((x - x0) / cell) * 128 + Math.floor((y - y0) / cell)) * 128 + Math.floor((z - z0) / cell)) * 6 + d;
    let c = ids.get(key);
    if (c === undefined) { c = ids.size; ids.set(key, c); acc.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); }
    const o = c * 12;
    acc[o] += x; acc[o + 1] += y; acc[o + 2] += z;
    acc[o + 3] += nx; acc[o + 4] += ny; acc[o + 5] += nz;
    if (withColor) { acc[o + 6] += b.col[i * 3]; acc[o + 7] += b.col[i * 3 + 1]; acc[o + 8] += b.col[i * 3 + 2]; }
    acc[o + 9]++;
    acc[o + 10] += b.pbr[i * 2]; acc[o + 11] += b.pbr[i * 2 + 1];
    vert[i - s0] = c;
  }
  const seen = new Set<number>();
  const nc = ids.size;
  const push = (c: number) => {
    const o = c * 12, k = acc[o + 9];
    out.pos.push(acc[o] / k, acc[o + 1] / k, acc[o + 2] / k);
    const l = Math.hypot(acc[o + 3], acc[o + 4], acc[o + 5]) || 1;
    out.norm.push(acc[o + 3] / l, acc[o + 4] / l, acc[o + 5] / l);
    if (withColor) out.col.push(acc[o + 6] / k, acc[o + 7] / k, acc[o + 8] / k);
    out.pbr.push(acc[o + 10] / k, acc[o + 11] / k);
  };
  for (let t = 0; t + 2 < s1 - s0; t += 3) {
    const a = vert[t], b2 = vert[t + 1], c = vert[t + 2];
    if (a === b2 || b2 === c || a === c) continue;
    // rotate so the smallest id leads: same winding ⇒ same key
    const [p, q, r] = a < b2 && a < c ? [a, b2, c] : b2 < c ? [b2, c, a] : [c, a, b2];
    const key = (p * nc + q) * nc + r;
    if (seen.has(key)) continue;
    seen.add(key);
    push(a); push(b2); push(c);
  }
  return out;
}

/**
 * Far level of detail for a triangle soup, part by part (so thin structures never vanish and colours never bleed
 * between parts). Low-poly parts are copied as they are; high-poly (curved) parts are vertex-clustered: vertices merge
 * per (grid cell × dominant normal direction), so faces pointing different ways stay apart and the silhouette and
 * shading survive. A part whose simplified surface area shrinks by more than 30% (thin lattices, leaf clumps) is
 * retried with half-size cells and otherwise kept as it is.
 */
function clusterLod(b: Bucket, R: number, withColor: boolean): Bucket {
  const out: Bucket = { pos: [], norm: [], col: [], pbr: [] };
  const n = b.pos.length / 3;
  const starts = b.parts?.length ? b.parts : [0];
  const copy = (v0: number, v1: number) => {
    for (let k = v0 * 3; k < v1 * 3; k++) { out.pos.push(b.pos[k]); out.norm.push(b.norm[k]); }
    if (withColor) for (let k = v0 * 3; k < v1 * 3; k++) out.col.push(b.col[k]);
    for (let k = v0 * 2; k < v1 * 2; k++) out.pbr.push(b.pbr[k]);
  };
  for (let pi = 0; pi < starts.length; pi++) {
    const s0 = starts[pi], s1 = pi + 1 < starts.length ? starts[pi + 1] : n;
    if (s1 - s0 <= LOD_KEEP_TRIS * 3) { copy(s0, s1); continue; }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = s0; i < s1; i++) {
      const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    }
    const base = Math.max(1e-6, Math.min(R, Math.max(x1 - x0, y1 - y0, z1 - z0)) / LOD_CELLS);
    const area0 = soupArea(b.pos, s0, s1);
    let done = false;
    for (const cell of [base, base / 2]) {
      const part = clusterPart(b, s0, s1, x0, y0, z0, cell, withColor);
      // accept only if it actually saves triangles and keeps the surface (thin lattices collapse otherwise)
      if (part.pos.length < (s1 - s0) * 3 * 0.7 && soupArea(part.pos, 0, part.pos.length / 3) > area0 * 0.7) {
        for (const v of part.pos) out.pos.push(v);
        for (const v of part.norm) out.norm.push(v);
        for (const v of part.col) out.col.push(v);
        for (const v of part.pbr) out.pbr.push(v);
        done = true;
        break;
      }
    }
    if (!done) copy(s0, s1);
  }
  return out;
}

/** Parts smaller than this fraction of the model's radius are "detail": dropped at the far level of detail. */
const LOD_DETAIL = 0.045;

/**
 * Merges static child meshes of a built model group into a few vertex-colored meshes (smooth / flat) that keep each
 * part's roughness and metalness per vertex, baking ambient occlusion, while preserving animated sub-groups (`spin`, `flap`). Remaining emissive/transparent
 * static meshes that share a material are merged too, so a model costs only a handful of draw calls.
 *
 * Level of detail: every merged geometry holds the full-detail triangles (large parts, then small parts with
 * radius < LOD_DETAIL × model radius) followed by a coarse vertex-clustered copy of the large parts.
 * `geometry.userData.lod = [start, count]` is that far range, so a far-away instance draws only a fraction of the
 * triangles from the same GPU buffers. Small unmerged meshes get `userData.lodHide`. The model radius is stored as
 * `gp.userData.radius`.
 */
export function bakeStaticMeshes(gp: THREE.Group): void {
  gp.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gp);
  const R = Math.max(1e-6, bounds.getSize(new THREE.Vector3()).length() / 2);
  gp.userData.radius = R;
  const isDetail = (mesh: THREE.Mesh) => {
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    return geo.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis() < R * LOD_DETAIL;
  };
  type Pair = { main: Bucket; detail: Bucket };
  const newPair = (): Pair => ({ main: { pos: [], norm: [], col: [], pbr: [] }, detail: { pos: [], norm: [], col: [], pbr: [] } });
  const buckets = new Map<string, Pair>();
  const toRemove: THREE.Mesh[] = [];
  // other static meshes (emissive / transparent), grouped by material for merging
  const extra = new Map<THREE.Material, THREE.Mesh[]>();
  const tmpV = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const normMat = new THREE.Matrix3();

  const append = (b: Bucket, mesh: THREE.Mesh, color: THREE.Color | null, rough: number, metal: number) => {
    let g0 = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    if (!g0.getAttribute('normal')) { g0 = g0 === mesh.geometry ? g0.clone() : g0; g0.computeVertexNormals(); }
    const pAttr = g0.getAttribute('position');
    const nAttr = g0.getAttribute('normal');
    const cAttr = g0.getAttribute('color');
    normMat.getNormalMatrix(mesh.matrixWorld);
    const flipped = mesh.matrixWorld.determinant() < 0;
    (b.parts ??= []).push(b.pos.length / 3);
    for (let i = 0; i < pAttr.count; i++) {
      const vi = flipped ? i - (i % 3) + (2 - (i % 3)) : i;
      tmpV.fromBufferAttribute(pAttr, vi).applyMatrix4(mesh.matrixWorld);
      tmpN.fromBufferAttribute(nAttr, vi).applyMatrix3(normMat).normalize();
      b.pos.push(tmpV.x, tmpV.y, tmpV.z);
      b.norm.push(tmpN.x, tmpN.y, tmpN.z);
      b.pbr.push(rough, metal);
      if (color) {
        if (cAttr) tmpC.fromBufferAttribute(cAttr as THREE.BufferAttribute, vi).multiply(color);
        else tmpC.copy(color);
        b.col.push(tmpC.r, tmpC.g, tmpC.b);
      } else if (cAttr) {
        tmpC.fromBufferAttribute(cAttr as THREE.BufferAttribute, vi);
        b.col.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
  };

  const walk = (obj: THREE.Object3D, animated: boolean) => {
    const isAnim = animated || obj.name === 'spin' || obj.name === 'flap';
    if (!isAnim && (obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m && !Array.isArray(m) && !m.transparent && m.side === THREE.FrontSide && (!m.emissive || m.emissive.getHex() === 0)) {
        const key = `${m.flatShading}`;
        let b = buckets.get(key);
        if (!b) { b = newPair(); buckets.set(key, b); }
        const [rough, metal] = m.userData.autoPbr && !mesh.geometry.getAttribute('color') ? inferPbr(m.color) : [m.roughness ?? 0.66, m.metalness ?? 0];
        append(isDetail(mesh) ? b.detail : b.main, mesh, m.color, rough, metal);
        toRemove.push(mesh);
      } else if (m && !Array.isArray(m) && mesh.parent === gp && !mesh.geometry.morphAttributes.position) {
        let l = extra.get(m);
        if (!l) extra.set(m, (l = []));
        l.push(mesh);
      }
    }
    for (const ch of obj.children) walk(ch, isAnim);
  };
  walk(gp, false);
  for (const m of toRemove) m.parent?.remove(m);

  const minY = new THREE.Box3().setFromObject(gp).min.y;
  const list = [...buckets.values()].flatMap(b => [b.main, b.detail]);
  let lo = Infinity;
  for (const b of list) for (let i = 1; i < b.pos.length; i += 3) lo = Math.min(lo, b.pos[i]);
  bakeAO(list, Math.min(minY, lo));

  const toGeo = ({ main, detail }: Pair, withColor: boolean, withPbr = true) => {
    const near = main.pos.length + detail.pos.length;
    const far = main.pos.length ? clusterLod(main, R, withColor) : null;
    const useFar = far && far.pos.length < main.pos.length * 0.8;
    const cat = (k: 'pos' | 'norm' | 'col' | 'pbr') => main[k].concat(detail[k], useFar ? far[k] : []);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(cat('pos'), 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(cat('norm'), 3));
    if (withColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(cat('col'), 3));
    if (withPbr) geo.setAttribute(PBR_ATTR, new THREE.BufferAttribute(Uint8Array.from(cat('pbr'), v => Math.round(Math.min(1, Math.max(0, v)) * 255)), 2, true));
    if (useFar) geo.userData.lod = [near / 3, far.pos.length / 3];
    else if (detail.pos.length && main.pos.length) geo.userData.lod = [0, main.pos.length / 3];
    geo.setDrawRange(0, near / 3);
    geo.computeBoundingSphere();
    return geo;
  };
  for (const [key, b] of buckets) {
    if (!b.main.pos.length && !b.detail.pos.length) continue;
    const mesh = new THREE.Mesh(toGeo(b, true), bakedMat(key === 'true'));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    gp.add(mesh);
  }

  // Merge same-material emissive / transparent meshes that sit directly under the root (keeps nested groups intact).
  for (const [m, meshes] of extra) {
    if (meshes.length < 2) {
      if (isDetail(meshes[0])) meshes[0].userData.lodHide = true;
      continue;
    }
    const vc = !!(m as THREE.MeshStandardMaterial).vertexColors;
    if (vc && meshes.some(x => !x.geometry.getAttribute('color'))) continue;
    const pair = newPair();
    for (const x of meshes) append(isDetail(x) ? pair.detail : pair.main, x, null, 0, 0);
    const merged = new THREE.Mesh(toGeo(pair, vc, false), m);
    const first = meshes[0];
    merged.renderOrder = first.renderOrder;
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.frustumCulled = meshes.every(x => x.frustumCulled);
    if (!pair.main.pos.length) merged.userData.lodHide = true;
    for (const x of meshes) gp.remove(x);
    gp.add(merged);
  }
}

/** True when `buildFresh(recipe)` produces the final model (its hero pack is loaded). */
export const modelReady = (recipe: ModelRecipe): boolean => heroReady(recipe.hero);
/** Loads whatever `buildFresh(recipe)` needs (the recipe's hero pack). */
export const whenModelReady = (recipe: ModelRecipe): Promise<void> => whenHeroReady(recipe.hero);

/**
 * Builds and bakes a recipe's model without caching (`library.ts` caches the prototypes). Call `whenModelReady`
 * first for hero recipes; if the pack is still loading this returns the generic kind model.
 */
export function buildFresh(recipe: ModelRecipe): THREE.Group {
  const proto = new THREE.Group();
  const hero = heroBuilder(recipe.hero);
  (hero ?? B[recipe.kind] ?? FALLBACK)(proto, { color: '#cccccc', ...recipe });
  bakeStaticMeshes(proto);
  return proto;
}
