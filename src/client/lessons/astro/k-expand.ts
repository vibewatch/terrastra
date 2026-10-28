/**
 * Kit "expand": the expanding universe. Galaxies on a stretching grid (every galaxy sees the others recede, the
 * farther the faster), a galaxy's spectrum sliding to the red as it recedes, the history of the universe as a widening
 * cone from the Big Bang to today, and the cosmic microwave background all around us.
 */
import * as THREE from 'three';
import { Arrow, body, canvasTex, clamp, dirLight, glow, lerp, line, ramp, rng, setLine, starfield, Panel, FONT } from './draw.ts';
import type { AstroClock, KitCtx, KitFactory, KitRun, Pair, V3 } from './types.ts';

export interface Opts {
  /**
   * - `grid`: galaxies on a grid whose spacing grows with the scale factor; the clock (unit `gyr`, from now) is the
   *   time: distances grow about ×e every 14 billion years
   * - `redshift`: a receding galaxy and its spectrum; the clock (unit `x`, 0 … 0.3) is the redshift z
   * - `timeline`: the history of the universe as a widening cone; the clock (unit `gyr`, 0 … 13.8) is the age
   * - `cmb`: the cosmic microwave background as a sphere around us
   * - `ladder`: the cosmic distance ladder on a logarithmic distance axis (1 AU … 10 Gpc): radar, parallax, Cepheids,
   *   Type Ia supernovae and Hubble's law, each rung overlapping (and calibrated by) the one below; the clock (unit `x`,
   *   0 … 5) reveals the rungs one by one. Pickable: `cepheid`, `snia`
   */
  mode: 'grid' | 'redshift' | 'timeline' | 'cmb' | 'ladder';
  /** grid: the galaxy the arrows are measured from (index into the grid, default the middle one); `cycle` moves it */
  center?: number | 'cycle';
}

/** A small face-on spiral galaxy (sprite texture). */
function galaxyTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, g => {
    const c = 64, gr = g.createRadialGradient(c, c, 0, c, c, 60);
    gr.addColorStop(0, 'rgba(255,244,220,1)'); gr.addColorStop(0.15, 'rgba(255,226,180,0.8)');
    gr.addColorStop(0.45, 'rgba(160,190,255,0.22)'); gr.addColorStop(1, 'rgba(120,150,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const R = rng(5);
    for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 420; i++) {
      const t = R() * 1, th = arm * Math.PI + t * 4.2 + (R() - 0.5) * 0.5, r = 6 + t * 52 + (R() - 0.5) * 6;
      g.fillStyle = `rgba(${190 + R() * 60},${205 + R() * 40},255,${0.22 * (1 - t)})`;
      g.beginPath(); g.arc(c + r * Math.cos(th), c + r * Math.sin(th), 1.2 + R() * 1.6, 0, Math.PI * 2); g.fill();
    }
  });
}
function galaxySprite(tex: THREE.Texture, size: number, color: string | number = '#ffffff', rot = 0): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: rot }));
  s.scale.setScalar(size);
  return s;
}

const kit: KitFactory<Opts & { clock?: AstroClock }> = (ctx, o) => {
  ctx.root.add(starfield(ctx.low ? 900 : 2200, 900, 11, 1.3));
  switch (o.mode) {
    case 'redshift': return redshift(ctx);
    case 'timeline': return timeline(ctx);
    case 'cmb': return cmb(ctx);
    case 'ladder': return ladder(ctx);
    default: return grid(ctx, o.center ?? 'cycle');
  }
};
export default kit;

// ------------------------------------------------------------------------------------------------ stretching grid

function grid(ctx: KitCtx, center: number | 'cycle'): KitRun {
  const NX = 7, NY = 5, S = 1.7, R = rng(3), tex = galaxyTex();
  const p0: THREE.Vector3[] = [], gals: THREE.Sprite[] = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const p = new THREE.Vector3((i - (NX - 1) / 2) * S + (R() - 0.5) * 0.4, (j - (NY - 1) / 2) * S + (R() - 0.5) * 0.4, 0);
    p0.push(p);
    const s = galaxySprite(tex, 0.75 + R() * 0.35, R() < 0.3 ? '#ffe3c4' : '#ffffff', R() * 6);
    gals.push(s);
    ctx.root.add(s);
  }
  const idx = (i: number, j: number) => j * NX + i;
  // the "fabric": lines between neighbours, stretched with the galaxies
  const links: [number, number][] = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (i < NX - 1) links.push([idx(i, j), idx(i + 1, j)]);
    if (j < NY - 1) links.push([idx(i, j), idx(i, j + 1)]);
  }
  const lp = new Float32Array(links.length * 6);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const mesh = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#4dabf7', transparent: true, opacity: 0.16, depthWrite: false }));
  mesh.frustumCulled = false;
  ctx.root.add(mesh);
  const arrows = p0.map(() => { const a = new Arrow('#ff8787', 0.03); ctx.root.add(a); return a; });
  const mark = new THREE.Object3D();
  const ringM = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 64), new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  mark.add(ringM);
  ctx.root.add(mark);
  ctx.label(mark, ['Seen from here', '从这个星系看'], { c: '#ffd24a', dy: -30 });
  const mid = idx(3, 2), centers = [mid, idx(1, 1), idx(5, 3), idx(0, 4), idx(6, 0)];
  const far = new THREE.Object3D();
  ctx.root.add(far);
  const farLbl = ctx.label(far, ['Farther away: faster', '越远，退行越快'], { c: '#ff8787', t: 1.5, dy: -18 });
  const pos = p0.map(p => p.clone()), d = new THREE.Vector3();
  let curA = 1;
  ctx.view([0, -0.75, 1], 17, [0, 0, 0], true);
  return {
    update(v, _dt, el) {
      const a = Math.exp(Math.max(0, v) / 14);
      curA = a;
      for (let k = 0; k < p0.length; k++) { pos[k].copy(p0[k]).multiplyScalar(a); gals[k].position.copy(pos[k]); }
      links.forEach(([p, q], k) => { lp.set([pos[p].x, pos[p].y, 0, pos[q].x, pos[q].y, 0], k * 6); });
      lg.getAttribute('position').needsUpdate = true;
      const c = center === 'cycle' ? centers[Math.floor(el / 4.5) % centers.length] : clamp(center, 0, p0.length - 1);
      mark.position.copy(pos[c]);
      ringM.quaternion.copy(ctx.camera.quaternion);
      const show = ramp(el, 0.8, 1);
      let best = -1, bd = 0;
      for (let k = 0; k < p0.length; k++) {
        if (k === c) { arrows[k].visible = false; continue; }
        d.copy(pos[k]).sub(pos[c]);
        const L = d.length();
        if (L > 6.5 * a) { arrows[k].visible = false; continue; }
        if (L > bd) { bd = L; best = k; }
        // v = H0·d: the arrow grows with the distance from the chosen galaxy
        arrows[k].set(pos[k].clone().addScaledVector(d, 0.32 / L), d.multiplyScalar(0.17 * show));
        arrows[k].opacity = 0.85;
      }
      if (best >= 0) { far.position.copy(pos[best]); }
      farLbl.on = show > 0.9;
    },
    readout: () => [`distances × ${curA.toFixed(2)}`, `距离 × ${curA.toFixed(2)}`],
  };
}

// ------------------------------------------------------------------------------------------------ redshift

/** Approximate colour of light of wavelength `nm`. */
function nmColor(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (750 - nm) / 50 : 1;
  return [r * f, g * f, b * f].map(x => Math.round(255 * clamp(x) ** 0.8)) as [number, number, number];
}
/** Absorption lines (nm): Ca K, Ca H, Hδ, Hγ, Hβ, Mg b, Na D, Hα. */
const LINES = [393.4, 396.8, 410.2, 434.0, 486.1, 517.3, 589.3, 656.3];

function redshift(ctx: KitCtx): KitRun {
  const tex = galaxyTex();
  const gal = galaxySprite(tex, 2.4, '#ffffff', 0.5);
  ctx.root.add(gal, dirLight([1, -1, 1], 1.8, 0.4));
  const earth = body('earth', 0.35, '#4d7cc4');
  earth.position.set(0, -1.5, -0.4);
  ctx.root.add(earth);
  ctx.label(earth, ['Us', '我们'], { c: '#a5d8ff', dy: 22 });
  const arrow = new Arrow('#ff8787', 0.05);
  ctx.root.add(arrow);
  const gl = ctx.label(gal, ['Galaxy moving away', '正在远离的星系'], { c: '#ffc9c9', dy: -46 });
  const sight = line([[0, -1.5, -0.4], [0, 3, 0]], '#adb5bd', { opacity: 0.25, dashed: true, dash: 0.12 });
  ctx.root.add(sight);
  const pn = new Panel(6.4, 2.3, ctx.low ? 560 : 820);
  ctx.root.add(pn.mesh);
  const anchor = new THREE.Vector3(0, 3, 0);
  let lastZ = -1;
  const draw = (z: number) => {
    const g = pn.card(), W = pn.W, H = pn.H, x0 = W * 0.04, x1 = W * 0.96, sw = x1 - x0;
    const X = (nm: number) => x0 + ((nm - 380) / (750 - 380)) * sw;
    const strip = (y: number, h: number, zz: number, title: string) => {
      for (let px = 0; px < sw; px += 2) { const [r, gg, b] = nmColor(380 + (px / sw) * 370); g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(x0 + px, y, 2.5, h); }
      g.fillStyle = 'rgba(0,0,0,0.92)';
      for (const l of LINES) { const x = X(l * (1 + zz)); if (x < x1) g.fillRect(x - 2.5, y, 5, h); }
      g.font = `600 ${Math.round(H * 0.085)}px ${FONT}`; g.fillStyle = '#e9ecef'; g.textAlign = 'left';
      g.fillText(title, x0, y - H * 0.03);
    };
    const h = H * 0.2;
    strip(H * 0.16, h, 0, ctx.L(['Spectrum in the lab (at rest)', '实验室中的光谱（静止）']));
    strip(H * 0.56, h, z, ctx.L(['Spectrum of the galaxy', '这个星系的光谱']));
    // guides from each lab line to where it is now
    g.strokeStyle = 'rgba(255,135,135,0.85)'; g.lineWidth = 2; g.setLineDash([5, 4]);
    for (const l of [434.0, 486.1, 656.3]) {
      const xa = X(l), xb = X(l * (1 + z));
      if (xb > x1) continue;
      g.beginPath(); g.moveTo(xa, H * 0.16 + h + 2); g.lineTo(xb, H * 0.56 - H * 0.12); g.stroke();
    }
    g.setLineDash([]);
    g.font = `${Math.round(H * 0.075)}px ${FONT}`; g.fillStyle = '#8fa0b2';
    g.textAlign = 'left'; g.fillText(ctx.L(['400 nm  blue', '400 纳米  蓝']), x0, H * 0.93);
    g.textAlign = 'right'; g.fillText(ctx.L(['red  700 nm', '红  700 纳米']), x1, H * 0.93);
    g.textAlign = 'center'; g.fillStyle = '#ffc9c9';
    g.fillText(ctx.L([`every line shifted to longer wavelength: ×${(1 + z).toFixed(2)}`, `每条谱线都向长波方向移动：×${(1 + z).toFixed(2)}`]), W / 2, H * 0.93);
    pn.commit();
  };
  ctx.view([0.55, -1, 0.5], 12, [0, 2.2, 0.8], true);
  const tail = new THREE.Vector3(), dir = new THREE.Vector3(0, 1, 0.08).normalize();
  return {
    update(v, _dt, el) {
      const z = clamp(v, 0, 0.5);
      gal.position.set(0, 3 + 30 * z, 0.25 + 2.4 * z);
      (gal.material as THREE.SpriteMaterial).opacity = ramp(el, 0.1, 1);
      tail.copy(gal.position).addScaledVector(dir, 1.0);
      arrow.set(tail, dir.clone().multiplyScalar(0.6 + 6 * z));
      setLine(sight, [earth.position, gal.position]);
      gl.on = true;
      pn.face(ctx.camera, anchor, 0, -2.6);
      if (Math.abs(z - lastZ) > 0.0004) { lastZ = z; draw(z); }
    },
    readout: v => {
      const kms = Math.round((299792 * v) / 100) * 100, mpc = Math.round(kms / 70 / 10) * 10;
      const k = kms.toLocaleString('en-US'), kz = kms.toLocaleString('zh-CN');
      return [`v ≈ cz ≈ ${k} km/s · d = v/H0 ≈ ${mpc} Mpc`, `v ≈ cz ≈ ${kz} 千米/秒 · 距离 ≈ ${mpc} 百万秒差距`];
    },
  };
}

// ------------------------------------------------------------------------------------------------ timeline cone

/** Age (Gyr) → position along the cone (0 … 1); stretched early on so the first moments get room. */
const KEYS: [number, number][] = [[0, 0], [1e-9, 0.05], [3.8e-4, 0.14], [0.18, 0.32], [1, 0.47], [13.8, 1]];
function ageX(t: number): number {
  for (let i = 1; i < KEYS.length; i++) {
    const [ta, xa] = KEYS[i - 1], [tb, xb] = KEYS[i];
    if (t <= tb) return lerp(xa, xb, clamp((t - ta) / (tb - ta)));
  }
  return 1;
}
/** Radius of the cone at x (inflation flare, slowing expansion, then speeding up again). */
const coneR = (x: number) => 2.4 * (0.3 * Math.min(1, x / 0.05) ** 0.5 + 0.48 * x ** 0.7 + 0.22 * x ** 3);

const CONE_FRAG = /* glsl */`
uniform float uX, uA; uniform vec3 uC;
varying vec3 vW; varying vec3 vN;
void main() {
  if (vW.x > uX) discard;
  float f = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
  float a = (0.05 + 0.5 * pow(1.0 - f, 2.5)) * uA;
  gl_FragColor = vec4(uC * a, 1.0);
}`;
const CONE_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

function cmbTex(w: number, seed: number, amp = 1): THREE.CanvasTexture {
  const h = w / 2, R = rng(seed);
  const perm = Array.from({ length: 512 }, () => R());
  const hash = (x: number, y: number, z: number) => perm[(((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 512];
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const L = (a: number, b: number, t: number) => a + (b - a) * t;
    return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf),
      L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  };
  // Planck-like colours: deep blue, pale, orange, red
  const stops: [number, number, number, number][] = [[0, 10, 30, 110], [0.3, 70, 140, 230], [0.5, 235, 230, 210], [0.7, 250, 150, 50], [1, 170, 20, 10]];
  const cmap = (t: number) => {
    t = clamp(t);
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
      const [ta, ...a] = stops[i - 1], [tb, ...b] = stops[i], f = (t - ta) / (tb - ta);
      return a.map((v, k) => v + (b[k] - v) * f);
    }
    return stops[stops.length - 1].slice(1);
  };
  return canvasTex(w, h, g => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const th = (y / h) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let x = 0; x < w; x++) {
        const ph = (x / w) * Math.PI * 2, dx = st * Math.cos(ph), dy = st * Math.sin(ph), dz = ct;
        let n = 0, f = 3, a = 1, tot = 0;
        for (let o = 0; o < 5; o++) { n += a * noise(dx * f + 11, dy * f + 7, dz * f + 3); tot += a; f *= 2.1; a *= 0.55; }
        n /= tot;
        const [r, gg, b] = cmap(0.5 + (n - 0.5) * 2.6 * amp);
        const i = (y * w + x) * 4;
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

function timeline(ctx: KitCtx): KitRun {
  const LEN = 12, N = 80;
  const prof = Array.from({ length: N + 1 }, (_, i) => { const x = i / N; return new THREE.Vector2(Math.max(0.001, coneR(x)), x * LEN); });
  const geo = new THREE.LatheGeometry(prof, ctx.low ? 40 : 72);
  geo.rotateZ(-Math.PI / 2);
  // LatheGeometry runs along +y; after rotateZ(-90°) it runs along +x
  const cm = new THREE.ShaderMaterial({ uniforms: { uX: { value: 0 }, uA: { value: 0 }, uC: { value: new THREE.Color('#74c0fc') } }, vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(geo, cm);
  ctx.root.add(cone);
  const X = (t: number) => ageX(t) * LEN;
  // Big Bang flash and inflation
  const bang = glow('#ffffff', 2.2, 1);
  ctx.root.add(bang);
  // the CMB: the first light, a wall of glowing gas
  const xc = X(3.8e-4), rc = coneR(xc / LEN);
  const cmbDisc = new THREE.Mesh(new THREE.CircleGeometry(rc * 0.98, 64), new THREE.MeshBasicMaterial({ map: cmbTex(ctx.low ? 128 : 256, 4, 0.8), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  cmbDisc.rotation.y = Math.PI / 2;
  cmbDisc.position.x = xc;
  ctx.root.add(cmbDisc);
  // stars and galaxies inside the cone, sorted by x so a draw range reveals them in time order
  const R = rng(9), NS = ctx.low ? 500 : 1400, sp: number[][] = [];
  for (let i = 0; i < NS; i++) {
    const x = lerp(0.32, 1, R() ** 0.8), r = coneR(x) * 0.88 * Math.sqrt(R()), a = R() * Math.PI * 2;
    sp.push([x * LEN, r * Math.cos(a), r * Math.sin(a)]);
  }
  sp.sort((p, q) => p[0] - q[0]);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp.flat()), 3));
  const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: '#fff4d6', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
  ctx.root.add(stars);
  const tex = galaxyTex(), gals: THREE.Sprite[] = [];
  for (let i = 0; i < (ctx.low ? 22 : 40); i++) {
    const x = lerp(0.5, 0.99, R()), r = coneR(x) * 0.8 * Math.sqrt(R()), a = R() * Math.PI * 2;
    const s = galaxySprite(tex, 0.35 + x * 0.45, '#ffffff', R() * 6);
    s.position.set(x * LEN, r * Math.cos(a), r * Math.sin(a));
    gals.push(s);
    ctx.root.add(s);
  }
  const front = line(Array.from({ length: 97 }, (_, i) => { const a = (i / 96) * Math.PI * 2; return [0, Math.cos(a), Math.sin(a)] as V3; }), '#ffd24a', { opacity: 0.8 });
  ctx.root.add(front);
  // the time axis under the cone
  const axisZ = -coneR(1) - 0.4;
  ctx.root.add(line([[0, 0, axisZ], [LEN, 0, axisZ]], '#adb5bd', { opacity: 0.35 }));
  const top = (t: number) => new THREE.Vector3(X(t), 0, coneR(ageX(t)) + 0.25);
  const bot = (t: number) => new THREE.Vector3(X(t), 0, -coneR(ageX(t)) - 0.25);
  const st: { t: number; l: ReturnType<KitCtx['label']> }[] = [
    { t: 0, l: ctx.label(new THREE.Vector3(-0.2, 0, -0.9), ['Big Bang', '大爆炸'], { c: '#ffffff', big: true }) },
    { t: 1e-9, l: ctx.label(top(1e-9).add(new THREE.Vector3(0, 0, 0.5)), ['Inflation', '暴胀'], { c: '#ffd8a8' }) },
    { t: 3.8e-4, l: ctx.label(bot(3.8e-4), ['CMB: 380 000 yr', '宇宙微波背景：38 万年'], { c: '#ffa94d' }) },
    { t: 0.18, l: ctx.label(top(0.18), ['First stars', '第一代恒星'], { c: '#fff3bf' }) },
    { t: 1, l: ctx.label(bot(1), ['Galaxies form', '星系形成'], { c: '#a5d8ff' }) },
    { t: 13.8, l: ctx.label(top(13.8), ['Today: 13.8 billion yr', '今天：138 亿年'], { c: '#ffd24a', big: true }) },
  ];
  ctx.label(new THREE.Vector3(LEN * 0.5, 0, axisZ - 0.35), ['time →', '时间 →'], { c: '#8fa0b2' });
  ctx.view([0.12, -1, 0.3], 18, [LEN / 2, 0, 0], true);
  return {
    update(v, _dt, el) {
      const t = clamp(v, 0, 13.8), x = X(t), a = ramp(el, 0, 0.8);
      cm.uniforms.uX.value = x + 0.001;
      cm.uniforms.uA.value = a;
      (bang.material as THREE.SpriteMaterial).opacity = 0.35 + 0.65 * Math.exp(-t * 60);
      cmbDisc.visible = x >= xc;
      let n = 0;
      while (n < sp.length && sp[n][0] <= x) n++;
      sGeo.setDrawRange(0, n);
      for (const s of gals) s.visible = s.position.x <= x;
      const r = coneR(x / LEN);
      front.position.x = x; front.scale.set(1, r, r);
      front.visible = t < 13.79;
      for (const s of st) s.l.on = t >= s.t && el > 0.4;
    },
  };
}

// ------------------------------------------------------------------------------------------------ CMB sphere

function cmb(ctx: KitCtx): KitRun {
  const tex = cmbTex(ctx.low ? 256 : 512, 21);
  const R = 3;
  const sph = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48, Math.PI, Math.PI * 1.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
  sph.rotation.x = Math.PI / 2;
  ctx.root.add(sph);
  ctx.pickable(sph, 'cmb');
  const earth = body('earth', 0.32, '#4d7cc4');
  ctx.root.add(earth, glow('#a5d8ff', 1.4, 0.5), dirLight([1, -1, 0.6], 1.8, 0.4));
  ctx.label(earth, ['Us, at the centre', '我们（在中心）'], { c: '#a5d8ff', dy: 24, t: 1 });
  ctx.label(new THREE.Vector3(-R * 0.6, R * 0.25, R * 0.82), ['2.7 K in every direction', '各个方向都是 2.7 K'], { c: '#ffe8cc', big: true, t: 1.4 });
  ctx.label(new THREE.Vector3(R * 0.2, R * 0.75, -R * 0.75), ['Hot and cold spots differ by only ±0.0002 K', '冷热斑点的温差只有 ±0.0002 K'], { c: '#ced4da', t: 2.4 });
  ctx.view([1, -1, 0.55], 11, [0, 0, 0], true);
  return {
    update(_v, _dt, el) {
      (sph.material as THREE.MeshBasicMaterial).opacity = ramp(el, 0.2, 1.2);
    },
  };
}

// ------------------------------------------------------------------------------------------------ distance ladder

/** log10(distance / pc) → x */
const LX = (lg: number) => -12 + (lg + 6) * 1.45;
const RUNGS: { a: number; b: number; c: string; tag: string; name: Pair; how: Pair }[] = [
  { a: -6, b: -3.6, c: '#63e6be', tag: 'radar', name: ['Radar and spacecraft', '雷达和航天器'], how: ['radar echoes time the AU: 149.6 million km', '雷达回波计时，测出 1 天文单位 = 1.496 亿千米'] },
  { a: -0.4, b: 4.0, c: '#ffd24a', tag: 'parallax', name: ['Parallax (Gaia)', '三角视差（盖亚卫星）'], how: ['d = 1/p, using Earth’s 1 AU orbit as the baseline: out to ~10 000 pc', 'd = 1/p，以 1 天文单位为基线：可测到约 1 万秒差距'] },
  { a: 2.6, b: 7.6, c: '#e599f7', tag: 'cepheid', name: ['Cepheid variables', '造父变星'], how: ['period → luminosity (Leavitt’s law), calibrated by parallax: out to ~40 Mpc', '周期 → 光度（勒维特定律），用视差校准：可测到约 4000 万秒差距'] },
  { a: 6.3, b: 9.9, c: '#ff8787', tag: 'snia', name: ['Type Ia supernovae', 'Ia 型超新星'], how: ['all peak near M = −19.3, calibrated by Cepheids: out to billions of pc', '峰值绝对星等都约为 −19.3，用造父变星校准：可测到几十亿秒差距'] },
  { a: 7.0, b: 10.25, c: '#74c0fc', tag: 'hubble', name: ['Hubble’s law (redshift)', '哈勃定律（红移）'], how: ['d = v / H0 with H0 ≈ 70 km/s/Mpc, calibrated by supernovae', 'd = v / H0，H0 ≈ 70 千米/秒/百万秒差距，用超新星校准'] },
];
const LANDMARKS: [lg: number, c: string, n: Pair][] = [
  [-5.31, '#ffd24a', ['Sun · 1 AU', '太阳 · 1 天文单位']],
  [0.11, '#ff9a7a', ['Proxima Cen · 4.2 ly', '比邻星 · 4.2 光年']],
  [2.12, '#fff1d6', ['Polaris · 433 ly', '北极星 · 433 光年']],
  [3.91, '#ffe3c4', ['Galactic centre · 26 000 ly', '银河系中心 · 2.6 万光年']],
  [4.70, '#d0ebff', ['LMC · 160 000 ly', '大麦哲伦云 · 16 万光年']],
  [5.89, '#d0ebff', ['Andromeda · 2.5 million ly', '仙女星系 · 250 万光年']],
  [7.21, '#d0ebff', ['M100 (Virgo Cluster) · 55 million ly', 'M100（室女座星系团）· 5500 万光年']],
  [8.0, '#d0ebff', ['Coma Cluster · 330 million ly', '后发星系团 · 3.3 亿光年']],
  [9.8, '#ffc9c9', ['Supernovae at z ≈ 1 · light 8 billion years old', 'z ≈ 1 的超新星 · 光走了约 80 亿年']],
];

function ladder(ctx: KitCtx): KitRun {
  const root = ctx.root, tex = galaxyTex();
  root.add(line([[LX(-6), 0, 0], [LX(10.3), 0, 0]], '#ced4da', { opacity: 0.8 }));
  const ticks: [number, Pair][] = [[-5.31, ['1 AU', '1 天文单位']], [0, ['1 pc = 3.26 ly', '1 秒差距 = 3.26 光年']], [3, ['1 kpc', '1 千秒差距']], [6, ['1 Mpc', '1 百万秒差距']], [9, ['1 Gpc', '1 十亿秒差距']]];
  for (const [lg, t] of ticks) {
    root.add(line([[LX(lg), 0.01, 0.25], [LX(lg), 0.01, -6.2]], '#ffffff', { opacity: 0.08 }), line([[LX(lg), 0, 0.2], [LX(lg), 0, -0.2]], '#ced4da', { opacity: 0.9 }));
    ctx.label(new THREE.Vector3(LX(lg), 0, -0.25), t, { c: '#9aa7b4', dy: 12 });
  }
  ctx.label(new THREE.Vector3(LX(2), 0, -6.6), ['distance (each grid line ×1000) →', '距离（每条竖线相差 1000 倍）→'], { c: '#ced4da' });
  LANDMARKS.forEach(([lg, c, n], i) => {
    const x = LX(lg), up = i % 2 ? 2.45 : 1.15;
    const s = lg > 4.5 && lg < 9 ? galaxySprite(tex, 0.75, c, i) : glow(c, 0.55, 0.95);
    s.position.set(x, 0, 0);
    root.add(s, line([[x, 0, 0.3], [x, 0, up]], c, { opacity: 0.4 }));
    ctx.label(new THREE.Vector3(x, 0, up), n, { c, dy: -10, t: 0.2 + i * 0.12 });
  });
  const bars = RUNGS.map((r, k) => {
    const z = -1.3 - k * 1.05, x0 = LX(r.a), x1 = LX(r.b);
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.52), new THREE.MeshBasicMaterial({ color: r.c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.position.set((x0 + x1) / 2, 0, z);
    g.add(m, line([[x0, 0, z - 0.26], [x1, 0, z - 0.26], [x1, 0, z + 0.26], [x0, 0, z + 0.26]], r.c, { opacity: 0.9, closed: true }));
    if (k > 0) {
      // the overlap with the rung below, where it is calibrated
      const p = RUNGS[k - 1], xa = LX(Math.max(r.a, p.a)), xb = LX(Math.min(r.b, p.b)), zp = z + 1.05;
      g.add(line([[xa, 0, zp - 0.3], [xa, 0, z + 0.3]], '#ffffff', { opacity: 0.55, dashed: true, dash: 0.12 }), line([[xb, 0, zp - 0.3], [xb, 0, z + 0.3]], '#ffffff', { opacity: 0.55, dashed: true, dash: 0.12 }));
    }
    ctx.pickable(m, r.tag);
    root.add(g);
    const lb = ctx.label(new THREE.Vector3((x0 + x1) / 2, 0, z), r.name, { c: r.c });
    return { g, m, lb };
  });
  ctx.view([0, -1, 0.1], 29, [0.2, 0, -1.6], true);
  return {
    update(v, _dt, el) {
      const k = clamp(v, 0, 5);
      bars.forEach((b, i) => {
        const a = clamp(k - i, 0, 1) * ramp(el, 0.3 + i * 0.05, 0.6);
        b.g.visible = a > 0.02;
        b.m.material.opacity = 0.18 + 0.45 * a * (Math.floor(Math.min(k, 4.999)) === i ? 1 : 0.7);
        b.lb.on = a > 0.5;
      });
    },
    readout(v) {
      const r = RUNGS[clamp(Math.floor(Math.min(v, 4.999)), 0, 4)];
      return [`${r.name[0]}: ${r.how[0]}`, `${r.name[1]}：${r.how[1]}`];
    },
    dispose() { tex.dispose(); },
  };
}
