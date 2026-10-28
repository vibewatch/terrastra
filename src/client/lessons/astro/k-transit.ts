/**
 * Kit "transit": finding planets around other stars. A planet crossing its star with the light curve drawn live
 * below (dip depth (Rp/R*)²), a star wobbling round the barycentre with its spectrum lines shifting and the
 * radial-velocity curve, and the compact TRAPPIST-1 system with its habitable zone.
 */
import * as THREE from 'three';
import type { BodyId } from '../../../shared/data/solar.ts';
import { Arrow, ball, body, circlePts, clamp, glow, line, ramp, ring, starfield, sunLight, tempColor, Panel, FONT } from './draw.ts';
import type { AstroClock, KitCtx, KitFactory, KitRun } from './types.ts';

export interface Opts {
  /**
   * - `transit`: a planet crossing its star and the light curve; clock unit `day`
   * - `rv`: radial velocity: star and planet round their barycentre, spectrum lines and the velocity curve; clock `day`
   * - `hz`: TRAPPIST-1's seven planets and the habitable zone; clock `day`
   */
  mode: 'transit' | 'rv' | 'hz';
  /** transit: planet radius / star radius (default 0.1, a hot Jupiter: a 1 % dip) */
  rp?: number;
  /** transit / rv: orbital period in days (default 3, rv 4.23 like 51 Pegasi b) */
  period?: number;
  /** transit / rv: the planet's texture (default jupiter) */
  planet?: BodyId;
  /** rv: the star's speed in m/s (default 56, 51 Pegasi) */
  k?: number;
}

/** A star whose disc darkens toward the edge (limb darkening), plus a soft glow. */
function ldStar(r: number, color: THREE.Color, glowSize = 3.2): THREE.Group {
  const m = new THREE.ShaderMaterial({
    uniforms: { uC: { value: color } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uC; varying vec3 vN; varying vec3 vW;
      void main() { float mu = clamp(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0, 1.0);
        float I = 1.0 - 0.6 * (1.0 - mu) - 0.15 * (1.0 - mu) * (1.0 - mu);
        gl_FragColor = vec4(mix(uC * 0.55, mix(uC, vec3(1.0), 0.35), I) * (0.55 + 0.6 * I), 1.0); }`,
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), m), glow(color.getHex(), r * glowSize, 0.75));
  return g;
}

/** Area of overlap of a unit circle and a circle of radius p whose centre is d away. */
function overlap(d: number, p: number): number {
  if (d >= 1 + p) return 0;
  if (d <= 1 - p) return Math.PI * p * p;
  const k0 = Math.acos(clamp((p * p + d * d - 1) / (2 * p * d), -1, 1)), k1 = Math.acos(clamp((1 + d * d - p * p) / (2 * d), -1, 1));
  return p * p * k0 + k1 - 0.5 * Math.sqrt(Math.max(0, (-d + p + 1) * (d + p - 1) * (d - p + 1) * (d + p + 1)));
}

const kit: KitFactory<Opts & { clock?: AstroClock }> = (ctx, o) => {
  ctx.root.add(starfield(ctx.low ? 900 : 2200, 900, 17, 1.3));
  const span: [number, number] = o.clock ? [o.clock.from, o.clock.to] : [0, 9];
  switch (o.mode) {
    case 'rv': return rv(ctx, o, span);
    case 'hz': return hz(ctx);
    default: return transit(ctx, o, span);
  }
};
export default kit;

// ------------------------------------------------------------------------------------------------ transit

function transit(ctx: KitCtx, o: Opts, span: [number, number]): KitRun {
  const RS = 1.5, A = 5.5, p = o.rp ?? 0.1, P = o.period ?? 3, B = 0.25;
  const inc = Math.asin((B * RS) / A);
  const starG = ldStar(RS, tempColor(5800));
  ctx.root.add(starG, sunLight([0, 0, 0], 3, 0.06));
  ctx.pickable(starG.children[0], 'star');
  const planet = body(o.planet ?? 'jupiter', Math.max(0.06, p * RS), '#c8a27a');
  ctx.root.add(planet);
  ctx.pickable(planet, 'planet');
  const orbit = line(circlePts(A, 160).map(v => new THREE.Vector3(v.x, v.y * Math.cos(inc), -v.y * Math.sin(inc))), '#adb5bd', { opacity: 0.22 });
  ctx.root.add(orbit);
  ctx.label(starG, ['Star', '恒星'], { c: '#ffe8a3', dy: -RS * 30 - 10, t: 0.6 });
  ctx.label(planet, ['Planet', '行星'], { c: '#ffd8a8', dy: -22, t: 1 });

  /** planet position at day t: in front of the star (−y, toward us) at t = P/2, 3P/2… */
  const pos = (t: number, out: THREE.Vector3) => {
    const ph = ((t / P) - 0.5) * Math.PI * 2;
    return out.set(A * Math.sin(ph), -A * Math.cos(ph) * Math.cos(inc), -A * Math.cos(ph) * Math.sin(inc));
  };
  const tmp = new THREE.Vector3();
  const flux = (t: number) => {
    pos(t, tmp);
    if (tmp.y > 0) return 1;
    const d = Math.hypot(tmp.x, tmp.z) / RS, f = overlap(d, p) / Math.PI;
    if (f <= 0) return 1;
    const mu = Math.sqrt(Math.max(0, 1 - Math.min(1, d) ** 2));
    return 1 - (f * (1 - 0.6 * (1 - mu))) / (1 - 0.6 / 3);
  };
  const NS = 600, curve = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) curve[i] = flux(span[0] + (i / NS) * (span[1] - span[0]));
  const depth = p * p, lo = 1 - depth * 1.45, hi = 1 + depth * 0.35;

  const pn = new Panel(7.6, 2.5, ctx.low ? 620 : 900);
  ctx.root.add(pn.mesh);
  const draw = (v: number) => {
    const g = pn.card(), W = pn.W, H = pn.H, x0 = W * 0.13, x1 = W * 0.97, y0 = H * 0.22, y1 = H * 0.8;
    const X = (t: number) => x0 + ((t - span[0]) / (span[1] - span[0])) * (x1 - x0), Y = (f: number) => y1 - ((f - lo) / (hi - lo)) * (y1 - y0);
    g.font = `600 ${Math.round(H * 0.1)}px ${FONT}`; g.fillStyle = '#e9ecef';
    g.fillText(ctx.L(['Light curve: brightness of the star', '光变曲线：恒星的亮度']), W * 0.03, H * 0.13);
    g.font = `${Math.round(H * 0.075)}px ${FONT}`; g.fillStyle = '#8fa0b2'; g.textAlign = 'right';
    g.fillText('100%', x0 - 8, Y(1) + 6);
    g.fillText(`${(100 - depth * 100).toFixed(depth < 0.01 ? 2 : 1)}%`, x0 - 8, Y(1 - depth) + 6);
    g.textAlign = 'center';
    g.fillText(ctx.L(['time (days) →', '时间（天）→']), (x0 + x1) / 2, H * 0.95);
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.5;
    for (const f of [1, 1 - depth]) { g.beginPath(); g.moveTo(x0, Y(f)); g.lineTo(x1, Y(f)); g.stroke(); }
    for (let d = Math.ceil(span[0]); d <= span[1]; d++) { g.beginPath(); g.moveTo(X(d), y1); g.lineTo(X(d), y1 + 6); g.stroke(); }
    const n = Math.round(((v - span[0]) / (span[1] - span[0])) * NS);
    g.strokeStyle = '#ffd24a'; g.lineWidth = 3.5; g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i <= Math.min(NS, n); i++) { const x = X(span[0] + (i / NS) * (span[1] - span[0])), y = Y(curve[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    // depth and period, once a dip has been drawn
    const t1 = P / 2, t2 = 1.5 * P;
    if (v > t1 + P * 0.08 && t1 < span[1]) {
      g.strokeStyle = '#ff8787'; g.fillStyle = '#ff8787'; g.lineWidth = 2;
      const xd = X(t1) + W * 0.035;
      g.beginPath(); g.moveTo(xd, Y(1)); g.lineTo(xd, Y(1 - depth)); g.stroke();
      g.textAlign = 'left'; g.font = `600 ${Math.round(H * 0.08)}px ${FONT}`;
      g.fillText(ctx.L([`dip ${(depth * 100).toFixed(depth < 0.01 ? 2 : 1)}% = (Rp/R*)²`, `变暗 ${(depth * 100).toFixed(depth < 0.01 ? 2 : 1)}% = (Rp/R*)²`]), xd + 8, Y(1 - depth / 2) + 6);
    }
    if (v > t2 + P * 0.08 && t2 < span[1]) {
      g.strokeStyle = '#74c0fc'; g.fillStyle = '#74c0fc'; g.lineWidth = 2;
      const yb = Y(1 - depth) + H * 0.09;
      g.beginPath(); g.moveTo(X(t1), yb - 6); g.lineTo(X(t1), yb); g.lineTo(X(t2), yb); g.lineTo(X(t2), yb - 6); g.stroke();
      g.textAlign = 'center'; g.font = `600 ${Math.round(H * 0.08)}px ${FONT}`;
      g.fillText(ctx.L([`period ${P} days`, `周期 ${P} 天`]), (X(t1) + X(t2)) / 2, yb + H * 0.085);
    }
    const f = flux(v);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X(v), Y(f), 6, 0, Math.PI * 2); g.fill();
    pn.commit();
  };
  let lastV = NaN;
  ctx.view([0, -1, 0.14], 14, [0, 0, -1.1], true);
  return {
    update(v, _dt, el) {
      pos(v, planet.position);
      planet.rotation.y = v * 2;
      pn.face(ctx.camera, starG.position, 0, -3.35);
      (pn.mesh.material as THREE.MeshBasicMaterial).opacity = ramp(el, 0.3, 0.8);
      if (v !== lastV) { lastV = v; draw(v); }
    },
    readout: v => [`brightness ${(flux(v) * 100).toFixed(2)}%`, `亮度 ${(flux(v) * 100).toFixed(2)}%`],
  };
}

// ------------------------------------------------------------------------------------------------ radial velocity

const LINES = [434.0, 486.1, 517.3, 589.3, 656.3];
function nmColor(nm: number): string {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (750 - nm) / 50 : 1;
  return `rgb(${[r, g, b].map(x => Math.round(255 * clamp(x * f) ** 0.8)).join(',')})`;
}

function rv(ctx: KitCtx, o: Opts, span: [number, number]): KitRun {
  const P = o.period ?? 4.23, K = o.k ?? 56, AS = 0.55, AP = 5, RS = 1;
  const starG = ldStar(RS, tempColor(5770), 2.8);
  ctx.root.add(starG, sunLight([0, 0, 0], 3, 0.06));
  ctx.pickable(starG.children[0], 'star');
  const planet = body(o.planet ?? 'jupiter', 0.32, '#c8a27a');
  ctx.root.add(planet);
  ctx.pickable(planet, 'planet');
  ctx.root.add(line(circlePts(AP, 160), '#adb5bd', { opacity: 0.22 }), line(circlePts(AS, 96), '#ffd24a', { opacity: 0.55 }));
  const cross = new THREE.Group();
  cross.add(line([[-0.18, 0, 0], [0.18, 0, 0]], '#ffffff', { opacity: 0.9 }), line([[0, -0.18, 0], [0, 0.18, 0]], '#ffffff', { opacity: 0.9 }));
  ctx.root.add(cross);
  ctx.label(new THREE.Vector3(0, 0, 0), ['Centre of mass', '质心'], { c: '#ffffff', dy: 34, t: 1.2 });
  ctx.label(planet, ['Planet', '行星'], { c: '#ffd8a8', dy: -20, t: 0.8 });
  const sLbl = ctx.label(starG, '', { dy: -48 });
  const arrow = new Arrow('#ffffff', 0.04);
  ctx.root.add(arrow);
  const arrowM = (arrow.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
  ctx.label(new THREE.Vector3(0, -AP - 0.9, 0), ['↓ towards us', '↓ 朝向我们'], { c: '#8fa0b2', t: 1.6 });

  const th = (t: number) => (t / P) * Math.PI * 2;
  /** the star's velocity along the line of sight (m/s, + away from us) */
  const vr = (t: number) => -K * Math.sin(th(t));
  const pn = new Panel(7.6, 2.9, ctx.low ? 620 : 900);
  ctx.root.add(pn.mesh);
  const draw = (v: number) => {
    const g = pn.card(), W = pn.W, H = pn.H, x0 = W * 0.05, x1 = W * 0.95;
    const s = vr(v) / K;
    // spectrum strip with lines shifted (much exaggerated)
    const sy = H * 0.15, sh = H * 0.17, X = (nm: number) => x0 + ((nm - 420) / (680 - 420)) * (x1 - x0);
    for (let x = x0; x < x1; x += 2) { g.fillStyle = nmColor(420 + ((x - x0) / (x1 - x0)) * 260); g.fillRect(x, sy, 2.5, sh); }
    g.fillStyle = 'rgba(0,0,0,0.9)';
    for (const l of LINES) g.fillRect(X(l) + s * W * 0.022 - 2.5, sy, 5, sh);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    for (const l of LINES) { g.beginPath(); g.moveTo(X(l), sy - 6); g.lineTo(X(l), sy); g.stroke(); }
    g.font = `600 ${Math.round(H * 0.075)}px ${FONT}`; g.textAlign = 'left';
    g.fillStyle = '#e9ecef'; g.fillText(ctx.L(['Star’s spectrum (shift exaggerated)', '恒星光谱（移动已放大）']), x0, H * 0.11);
    g.textAlign = 'right';
    g.fillStyle = s > 0.05 ? '#ff8787' : s < -0.05 ? '#74c0fc' : '#ced4da';
    g.fillText(ctx.L(s > 0.05 ? ['moving away: redshift', '远离：红移'] : s < -0.05 ? ['approaching: blueshift', '靠近：蓝移'] : ['across our view: no shift', '横向运动：不移动']), x1, H * 0.11);
    // velocity curve
    const cx0 = W * 0.12, cy0 = H * 0.44, cy1 = H * 0.88, mid = (cy0 + cy1) / 2;
    const CX = (t: number) => cx0 + ((t - span[0]) / (span[1] - span[0])) * (x1 - cx0), CY = (u: number) => mid - (u / K) * (cy1 - cy0) * 0.45;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx0, mid); g.lineTo(x1, mid); g.stroke();
    g.font = `${Math.round(H * 0.065)}px ${FONT}`; g.fillStyle = '#8fa0b2'; g.textAlign = 'right';
    g.fillText(`+${K}`, cx0 - 8, CY(K) + 6); g.fillText('0', cx0 - 8, mid + 6); g.fillText(`−${K}`, cx0 - 8, CY(-K) + 6);
    g.textAlign = 'left';
    g.fillText(ctx.L(['star’s speed toward / away (m/s)', '恒星的视向速度（米/秒）']), cx0 + 6, cy0 - 4);
    g.strokeStyle = '#ffd24a'; g.lineWidth = 3.5; g.beginPath();
    const n = 300, end = Math.min(n, Math.round(((v - span[0]) / (span[1] - span[0])) * n));
    for (let i = 0; i <= end; i++) { const t = span[0] + (i / n) * (span[1] - span[0]); if (i) g.lineTo(CX(t), CY(vr(t))); else g.moveTo(CX(t), CY(vr(t))); }
    g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(CX(v), CY(vr(v)), 6, 0, Math.PI * 2); g.fill();
    pn.commit();
  };
  const vel = new THREE.Vector3();
  let lastV = NaN, lastS = 0;
  ctx.view([0, -1, 0.42], 15, [0, -0.4, -1.4], true);
  return {
    update(v, _dt, el) {
      const a = th(v);
      planet.position.set(AP * Math.sin(a), -AP * Math.cos(a), 0);
      starG.position.set(-AS * Math.sin(a), AS * Math.cos(a), 0);
      vel.set(-Math.cos(a), -Math.sin(a), 0).multiplyScalar(1.4 * ramp(el, 0.6, 0.6));
      arrow.set(starG.position.clone().addScaledVector(vel, (RS + 0.1) / Math.max(1e-6, vel.length())), vel);
      const s = vr(v) / K;
      arrowM.color.set(s > 0.05 ? '#ff8787' : s < -0.05 ? '#74c0fc' : '#ced4da');
      const sg = s > 0.05 ? 1 : s < -0.05 ? -1 : 0;
      if (sg !== lastS || !sLbl.el.textContent) {
        lastS = sg;
        sLbl.set(sg > 0 ? ['Star moving away', '恒星在远离'] : sg < 0 ? ['Star approaching', '恒星在靠近'] : ['Star', '恒星']);
        sLbl.el.style.setProperty('--c', sg > 0 ? '#ff8787' : sg < 0 ? '#74c0fc' : '#ffe8a3');
      }
      pn.face(ctx.camera, new THREE.Vector3(0, 0, 0), 0, -4.1);
      if (v !== lastV) { lastV = v; draw(v); }
    },
    readout: v => [`star: ${vr(v) >= 0 ? '+' : '−'}${Math.abs(vr(v)).toFixed(0)} m/s`, `恒星：${vr(v) >= 0 ? '+' : '−'}${Math.abs(vr(v)).toFixed(0)} 米/秒`],
  };
}

// ------------------------------------------------------------------------------------------------ habitable zone

/** TRAPPIST-1 planets: semi-major axis (AU), period (days), colour, in the habitable zone. */
const TRAPPIST: [id: string, a: number, P: number, c: string, hz: boolean][] = [
  ['b', 0.01154, 1.51, '#b07a52', false], ['c', 0.0158, 2.42, '#a9876a', false], ['d', 0.02227, 4.05, '#c7b08f', false],
  ['e', 0.02925, 6.1, '#6f9fb8', true], ['f', 0.03849, 9.21, '#7fa7c9', true], ['g', 0.04683, 12.35, '#93b5d6', true],
  ['h', 0.06189, 18.77, '#c9d6e3', false],
];

function hz(ctx: KitCtx): KitRun {
  const AU = 100;
  const sc = tempColor(2566);
  const st = new THREE.Group();
  st.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 24), new THREE.MeshBasicMaterial({ color: sc })), glow(sc.getHex(), 3.4, 0.9));
  ctx.root.add(st, sunLight([0, 0, 0], 3.2, 0.1));
  ctx.pickable(st.children[0], 'star');
  const zone = ring(0.026 * AU, 0.05 * AU, '#51cf66', 0.16, 160);
  ctx.root.add(zone);
  ctx.label(new THREE.Vector3(0, -0.044 * AU, 0.2), ['Habitable zone', '宜居带'], { c: '#8ce99a', t: 1 });
  ctx.label(st, ['TRAPPIST-1 · red dwarf · 40 ly', 'TRAPPIST-1 · 红矮星 · 40 光年'], { c: '#ffc078', dy: -34 });
  const pl = TRAPPIST.map(([id, a, P, c, inHz]) => {
    const m = ball(0.17, c, { rough: 0.85 });
    ctx.root.add(m, line(circlePts(a * AU, 128), inHz ? '#8ce99a' : '#adb5bd', { opacity: inHz ? 0.45 : 0.2 }));
    ctx.pickable(m, inHz ? 'hz' : 'out');
    ctx.label(m, id, { c: inHz ? '#8ce99a' : '#ced4da', dy: -16 });
    return { m, a: a * AU, P, ph: (id.charCodeAt(0) * 1.7) % (Math.PI * 2) };
  });
  ctx.view([0.15, -1, 1.25], 16, [0, 0, 0], true);
  return {
    update(v) {
      for (const p of pl) { const a = p.ph + (v / p.P) * Math.PI * 2; p.m.position.set(p.a * Math.cos(a), p.a * Math.sin(a), 0); }
    },
  };
}
