/**
 * Kit "life": the life of a star. One star through its stages on a clock (a Sun-like star: nebula → protostar → main
 * sequence → red giant → planetary nebula → white dwarf; a massive star: … → red supergiant → supernova → neutron
 * star or black hole), both paths side by side, or hydrogen fusing to helium in a star's core.
 * Also home to a few drawing helpers shared by the star kits (a limb-darkened star ball, sized point clouds).
 */
import * as THREE from 'three';
import { Arrow, canvasTex, clamp, ease, glow, lerp, ramp, rng, starfield, tempColor, dirLight } from './draw.ts';
import type { KitCtx, KitFactory, Pair } from './types.ts';

export interface Opts {
  /**
   * - `sun` / `massive`: one star through its life; the clock runs 0 → 5 through the six stages
   *   (use `unit: 'x'` with a `fmt` that has no `{v}`: the readout names the stage and its age)
   * - `both`: the two paths from a nebula, laid out as two rows
   * - `fusion`: four hydrogen nuclei fuse into helium in the core (loops by itself)
   */
  mode: 'sun' | 'massive' | 'both' | 'fusion';
  /** how the massive star ends (default neutron star) */
  end?: 'ns' | 'bh';
}

// ------------------------------------------------------------------------------------------------ shared helpers

/** A soft round dot (for point sprites). */
export function dotTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, c => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
}

/** A mottled grey map (granulation / convection cells) for star surfaces. */
export function grainTex(seed = 3, w = 256): THREE.CanvasTexture {
  const R = rng(seed), h = w / 2;
  const t = canvasTex(w, h, c => {
    c.fillStyle = '#b4b4b4'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < w * 3; i++) {
      const x = R() * w, y = R() * h, r = 1.5 + R() * w * 0.025, v = R() < 0.5 ? 255 : 90;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${v},${v},${v},.35)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const ballVS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const ballFS = `uniform vec3 uC; uniform sampler2D uMap; uniform float uShift; uniform float uGrain;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
  float limb = 0.35 + 0.65 * pow(mu, 0.55);
  float g = texture2D(uMap, vUv * vec2(2.0, 1.0) + vec2(uShift, 0.0)).r;
  vec3 c = uC * limb * mix(1.0, 0.55 + 0.75 * g, uGrain) * 1.15;
  c += vec3(1.0) * pow(mu, 3.0) * 0.12;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** A glowing star: a limb-darkened, granulated ball with two halos. Set its temperature and radius each frame. */
export class StarBall extends THREE.Group {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private inner: THREE.Sprite; private outer: THREE.Sprite;
  private c = new THREE.Color();
  halo = 1;
  constructor(T = 5800, r = 1, grain: THREE.Texture, seg = 48) {
    super();
    const m = new THREE.ShaderMaterial({ vertexShader: ballVS, fragmentShader: ballFS, uniforms: { uC: { value: new THREE.Color() }, uMap: { value: grain }, uShift: { value: 0 }, uGrain: { value: 1 } } });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg / 2), m);
    this.mesh.userData.keepMap = true;
    this.inner = glow('#ffffff', 1, 0.85); this.outer = glow('#ffffff', 1, 0.35);
    this.add(this.mesh, this.inner, this.outer);
    this.set(T, r);
  }
  /** temperature (K), radius (scene units), glow strength */
  set(T: number, r: number, g = this.halo, flow = 0): this {
    this.halo = g;
    this.c.copy(tempColor(T));
    const u = this.mesh.material.uniforms;
    (u.uC.value as THREE.Color).copy(this.c);
    u.uShift.value = flow;
    u.uGrain.value = r < 0.15 ? 0 : 1;
    this.mesh.scale.setScalar(Math.max(r, 1e-4));
    const gs = Math.max(r, 0.12);
    this.inner.material.color.copy(this.c); this.outer.material.color.copy(this.c);
    this.inner.scale.setScalar(gs * 2.6 * g); this.outer.scale.setScalar(gs * 7 * g);
    this.inner.material.opacity = 0.85 * clamp(g, 0, 1.4); this.outer.material.opacity = 0.32 * clamp(g, 0, 1.4);
    return this;
  }
  set alpha(a: number) {
    this.visible = a > 0.01;
    this.inner.material.opacity *= a; this.outer.material.opacity *= a;
    this.mesh.scale.multiplyScalar(Math.max(a, 1e-3) ** 0.3);
  }
}

const ptsVS = `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale;
void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 64.0); gl_Position = projectionMatrix * mv; }`;
const ptsFS = `uniform sampler2D uMap; uniform float uA; varying vec3 vC;
void main(){ float a = texture2D(uMap, gl_PointCoord).a * uA; if (a < 0.004) discard; gl_FragColor = vec4(vC, a);
  #include <colorspace_fragment>
}`;

/** Points with their own size (scene units) and colour, drawn with a soft dot. Call `pointScale(ctx, pts)` each frame. */
export function sizedPoints(pos: Float32Array, color: Float32Array, size: Float32Array, tex: THREE.Texture, o: { additive?: boolean; opacity?: number } = {}): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: ptsVS, fragmentShader: ptsFS, transparent: true, depthWrite: false,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { uMap: { value: tex }, uScale: { value: 400 }, uA: { value: o.opacity ?? 1 } },
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.userData.keepMap = true;
  return p;
}
/** Keep point sizes in scene units whatever the canvas size. */
export function pointScale(ctx: KitCtx, ...pts: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>[]): void {
  const h = ctx.renderer.domElement.height, k = h / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
  for (const p of pts) p.material.uniforms.uScale.value = k;
}
/** Set the opacity of sized points. */
export const pointAlpha = (p: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>, a: number) => { p.material.uniforms.uA.value = a; p.visible = a > 0.005; };

// ------------------------------------------------------------------------------------------------ parts of a star's life

type P = THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

/** A clumpy cloud of glowing gas plus dark dust: the nebula a star is born in. */
function nebula(n: number, R: number, tex: THREE.Texture, seed = 11): THREE.Group {
  const r = rng(seed), g = new THREE.Group();
  const blobs = Array.from({ length: 9 }, () => [(r() - 0.5) * R * 1.1, (r() - 0.5) * R * 1.1, (r() - 0.5) * R * 0.7, R * (0.25 + r() * 0.3)]);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  const make = (m: number, dust: boolean) => {
    const pos = new Float32Array(m * 3), col = new Float32Array(m * 3), sz = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const b = blobs[Math.floor(r() * blobs.length)];
      const x = b[0] + gauss() * b[3], y = b[1] + gauss() * b[3], z = b[2] + gauss() * b[3] * 0.8;
      pos.set([x, y, z], i * 3);
      const d = Math.hypot(x, y, z) / R;
      if (dust) { col.set([0.03, 0.02, 0.02], i * 3); sz[i] = R * (0.08 + r() * 0.1); }
      else {
        const t = r(), k = (0.25 + 0.5 * r()) * (1 - 0.5 * clamp(d));
        const c = t < 0.62 ? [1, 0.32, 0.5] : t < 0.85 ? [0.45, 0.62, 1] : [1, 0.75, 0.55];
        col.set([c[0] * k, c[1] * k, c[2] * k], i * 3); sz[i] = R * (0.05 + r() * 0.12);
      }
    }
    return sizedPoints(pos, col, sz, tex, { additive: !dust, opacity: dust ? 0.55 : 0.5 });
  };
  g.add(make(n, false), make(Math.round(n * 0.3), true));
  g.children[1].renderOrder = 2;
  return g;
}

/** An expanding shell of gas. `ring`: a planetary nebula (a thick ring, teal inside and red outside); else a supernova remnant with filaments. */
function shell(n: number, tex: THREE.Texture, ring: boolean, seed = 5): P {
  const r = rng(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  const lobes = Array.from({ length: 14 }, () => { const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), s * Math.sin(a), z]; });
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number, rad: number;
    if (ring) {
      const a = r() * Math.PI * 2, u = r();
      const torus = r() < 0.75;
      if (torus) { rad = 0.7 + 0.35 * u; const h = (r() - 0.5) * 0.55; x = Math.cos(a) * rad; y = Math.sin(a) * rad; z = h; }
      else { const zz = r() * 2 - 1, s = Math.sqrt(1 - zz * zz); rad = 0.9 + r() * 0.25; x = s * Math.cos(a) * rad; y = s * Math.sin(a) * rad; z = zz * rad * 1.3; }
      const k = 0.35 + 0.45 * r(), outer = clamp((rad - 0.7) / 0.4);
      col.set([lerp(0.25, 1, outer) * k, lerp(0.85, 0.3, outer) * k, lerp(0.8, 0.35, outer) * k], i * 3);
      sz[i] = 0.06 + r() * 0.08;
    } else {
      const zz = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - zz * zz);
      x = s * Math.cos(a); y = s * Math.sin(a); z = zz;
      let f = 0;
      for (const l of lobes) f = Math.max(f, x * l[0] + y * l[1] + z * l[2]);
      rad = 0.72 + 0.28 * f ** 6 + (r() - 0.5) * 0.08;
      if (r() < 0.25) rad *= 0.4 + r() * 0.5;
      x *= rad; y *= rad; z *= rad;
      const hot = clamp((rad - 0.6) / 0.4), k = 0.3 + 0.6 * r();
      const c = r() < 0.3 ? [0.55, 0.75, 1] : [1, lerp(0.35, 0.7, hot), lerp(0.25, 0.35, hot)];
      col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
      sz[i] = 0.05 + r() * 0.07;
    }
    pos.set([x, y, z], i * 3);
  }
  return sizedPoints(pos, col, sz, tex);
}

/** A spiky starburst sprite texture for the supernova flash. */
function burstTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, c => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,255,255,.9)'); g.addColorStop(0.3, 'rgba(200,220,255,.25)'); g.addColorStop(1, 'rgba(160,190,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      c.save(); c.translate(128, 128); c.rotate((k * Math.PI) / 3 + (k % 2) * 0.2);
      const L = k % 2 ? 90 : 126, s = c.createLinearGradient(0, 0, L, 0);
      s.addColorStop(0, 'rgba(255,255,255,.9)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = s; c.beginPath(); c.moveTo(0, -2.5); c.lineTo(L, 0); c.lineTo(0, 2.5); c.closePath(); c.fill();
      c.rotate(Math.PI); c.beginPath(); c.moveTo(0, -2.5); c.lineTo(L, 0); c.lineTo(0, 2.5); c.closePath(); c.fill();
      c.restore();
    }
  });
}

/** A pulsar: a tiny hot star with two beams sweeping round a tilted axis. */
function pulsar(r: number, grain: THREE.Texture): { g: THREE.Group; spin: THREE.Group; ball: StarBall } {
  const g = new THREE.Group(), spin = new THREE.Group();
  const ball = new StarBall(40000, r, grain, 24);
  ball.set(40000, r, 1.6);
  const beamTex = canvasTex(16, 128, c => {
    const s = c.createLinearGradient(0, 128, 0, 0);
    s.addColorStop(0, 'rgba(255,255,255,.95)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = s; c.fillRect(0, 0, 16, 128);
  });
  for (const d of [1, -1]) {
    const L = r * 40;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(L * 0.14, L, 24, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: '#9cc8ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.z = (d * L) / 2; cone.rotation.x = d > 0 ? -Math.PI / 2 : Math.PI / 2;
    spin.add(cone);
  }
  spin.rotation.x = 0.55;
  const tiltWrap = new THREE.Group();
  tiltWrap.add(spin);
  g.add(tiltWrap, ball);
  return { g, spin: tiltWrap, ball };
}

/** A black hole: a black ball inside a glowing, turning accretion disc and a thin photon ring. */
function blackHole(r: number): { g: THREE.Group; disc: THREE.Mesh } {
  const g = new THREE.Group();
  const tex = canvasTex(256, 256, c => {
    const R = rng(4);
    const gr = c.createRadialGradient(128, 128, 30, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,.95)'); gr.addColorStop(0.6, 'rgba(230,110,40,.5)'); gr.addColorStop(1, 'rgba(120,40,10,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const rad = 35 + R() * 90, a0 = R() * Math.PI * 2;
      c.strokeStyle = `rgba(0,0,0,${0.15 + R() * 0.35})`; c.lineWidth = 1 + R() * 3;
      c.beginPath(); c.arc(128, 128, rad, a0, a0 + 0.6 + R() * 1.6); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,1)'; c.beginPath(); c.arc(128, 128, 30, 0, Math.PI * 2); c.fill();
  });
  const disc = new THREE.Mesh(new THREE.RingGeometry(r * 1.25, r * 4.2, 96, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  // RingGeometry UVs are planar over [-r1, r1]: the radial texture lines up with the ring
  const hole = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const photon = glow('#ffcf8a', r * 3.1, 0.55);
  const tilt = new THREE.Group();
  tilt.rotation.x = 1.25;
  tilt.add(disc);
  g.add(photon, tilt, hole);
  hole.renderOrder = 3;
  return { g, disc };
}

/** Display radius for a real radius (Sun radii): squeezed so a white dwarf and a supergiant fit on one screen. */
const dispR = (R: number, k = 0.55) => Math.max(0.06, k * R ** 0.33);

interface Stage { R: number; T: number; name: Pair; age: Pair }
const SUN_PATH: Stage[] = [
  { R: 0, T: 3000, name: ['Nebula', '星云'], age: ['a cold cloud of gas and dust', '由气体和尘埃组成的冷云'] },
  { R: 6, T: 3300, name: ['Protostar', '原恒星'], age: ['gravity pulls the cloud in', '引力使云团收缩'] },
  { R: 1, T: 5800, name: ['Main sequence', '主序星'], age: ['~10 billion yr (the Sun is 4.6 billion yr old)', '约 100 亿年（太阳现在约 46 亿岁）'] },
  { R: 150, T: 3400, name: ['Red giant', '红巨星'], age: ['from ~10 billion yr: core hydrogen runs out', '约 100 亿年后：核心的氢耗尽'] },
  { R: 0.1, T: 60000, name: ['Planetary nebula', '行星状星云'], age: ['outer layers drift away (~10 000s of yr)', '外层气体向外飘散（持续几万年）'] },
  { R: 0.012, T: 20000, name: ['White dwarf', '白矮星'], age: ['Earth-sized, cools for trillions of yr', '大小和地球相当，慢慢冷却'] },
];
const BIG_PATH: Stage[] = [
  { R: 0, T: 3000, name: ['Nebula', '星云'], age: ['a cold cloud of gas and dust', '由气体和尘埃组成的冷云'] },
  { R: 9, T: 4000, name: ['Protostar', '原恒星'], age: ['a big clump collapses fast', '大团气体快速收缩'] },
  { R: 7, T: 30000, name: ['Main sequence (massive)', '大质量主序星'], age: ['only ~10 million yr', '只有约 1000 万年'] },
  { R: 900, T: 3500, name: ['Red supergiant', '红超巨星'], age: ['fuses up to iron in its core', '核心一直聚变到铁'] },
  { R: 0, T: 30000, name: ['Supernova', '超新星爆发'], age: ['the core collapses in under a second', '核心在不到一秒内坍缩'] },
  { R: 0.0002, T: 40000, name: ['Neutron star', '中子星'], age: ['~20 km across, spinning fast', '直径约 20 千米，高速自转'] },
];
const BH_END: Stage = { R: 0, T: 0, name: ['Black hole', '黑洞'], age: ['for the most massive stars', '质量最大的恒星的归宿'] };

// ------------------------------------------------------------------------------------------------ the kit

const kit: KitFactory<Opts> = (ctx, o) => {
  const low = ctx.low, tex = dotTex(), grain = grainTex();
  const root = ctx.root;
  root.add(starfield(low ? 1500 : 2600, 900, 7, 1.4));
  // the dot and grain textures are shared by many materials: dispose them once, at the end
  const own = [tex, grain];
  if (o.mode === 'both') return both(ctx, tex, grain, own);
  if (o.mode === 'fusion') return fusion(ctx, grain, own);

  const big = o.mode === 'massive', bh = big && o.end === 'bh';
  const path = big ? BIG_PATH.slice() : SUN_PATH;
  if (bh) path[5] = BH_END;

  const neb = nebula(low ? 2600 : 6000, 7, tex, big ? 21 : 11);
  const star = new StarBall(5800, 1, grain);
  const pn = shell(low ? 2500 : 6000, tex, true, 9);
  pn.rotation.x = 1.05;
  const sn = shell(low ? 3000 : 8000, tex, false, 13);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flash2 = glow('#cfe0ff', 1, 1);
  const ns = pulsar(0.07, grain);
  const hole = blackHole(0.4);
  root.add(neb, star, pn, sn, flash, flash2, ns.g, hole.g);
  ctx.pickable(star.mesh, 'star');

  const name = ctx.label(new THREE.Vector3(), path[0].name, { big: true, c: '#ffd24a' });
  ctx.view([0, -1, 0.22], 28, [0, 0, 0], true);
  const bg = new THREE.Color();
  ctx.scene.background = bg;
  let stageNow = 0;

  return {
    update(v, _dt, el) {
      pointScale(ctx, neb.children[0] as P, neb.children[1] as P, pn, sn);
      const s = clamp(Math.floor(v), 0, 4), f = v - s, t = ease((f - 0.5) / 0.5);
      const a = path[s], b = path[s + 1];
      stageNow = t > 0.5 ? s + 1 : s;
      if (v >= 5) stageNow = 5;
      // star size and colour (log-interpolated between stages)
      const Ra = a.R || b.R, Rb = b.R || a.R;
      let R = Math.exp(lerp(Math.log(Ra || 1), Math.log(Rb || 1), t));
      let T = Math.exp(lerp(Math.log(a.T), Math.log(b.T), t));
      let shown = 1, halo = 1;
      if (s === 0) { shown = t; halo = 1.5; }
      if (s === 1 && t < 1) halo = lerp(1.5, 1, t);
      let r = dispR(R);
      // nebula: collapses into a flattened disc around the protostar, then clears
      const nebA = s === 0 ? 1 - 0.35 * t : s === 1 ? 0.65 * (1 - t) : 0;
      const sq = s === 0 ? t : 1;
      neb.scale.set(lerp(1, 0.4, sq), lerp(1, 0.4, sq), lerp(1, 0.1, sq));
      neb.rotation.z = el * 0.02;
      for (const c of neb.children) pointAlpha(c as P, nebA * (c === neb.children[1] ? 0.55 : 0.5));
      // endings
      let pnA = 0, snA = 0, F = 0, holeA = 0, nsA = 0;
      if (!big && v > 3.5) {
        const u = clamp((v - 3.55) / 1.45);
        pn.scale.setScalar(lerp(dispR(150) * 0.9, 9, 1 - (1 - u) ** 2));
        pnA = ramp(v, 3.55, 0.25) * (1 - 0.7 * ramp(v, 4.3, 0.7));
        if (v > 4.5) { R = 0.012; T = lerp(60000, 20000, ease((v - 4.5) / 0.5)); r = dispR(R); }
      }
      if (big && v >= 3.55) {
        // the supergiant swells and flickers, the core collapses, the star blows apart
        const pre = ramp(v, 3.55, 0.4);
        r = dispR(900) * (1 + 0.06 * pre * Math.sin(el * 9));
        T = 3500;
        F = v < 4 ? Math.exp(-(((v - 4) / 0.05) ** 2)) : Math.exp(-(v - 4) / 0.22);
        if (v >= 3.97) shown = 0;
        snA = v >= 3.97 ? clamp((v - 3.97) / 0.05) * (1 - 0.55 * ramp(v, 4.4, 0.6)) : 0;
        sn.scale.setScalar(0.5 + 9 * (1 - Math.exp(-Math.max(0, v - 3.97) * 2.3)));
        sn.rotation.z = (v - 4) * 0.2;
        const rem = ramp(v, 4.35, 0.4);
        if (bh) holeA = rem; else nsA = rem;
      }
      star.set(T, r, halo, el * 0.004);
      star.alpha = shown;
      pointAlpha(pn, pnA); pointAlpha(sn, snA);
      flash.visible = flash2.visible = F > 0.01;
      flash.scale.setScalar(4 + 30 * F); flash.material.opacity = Math.min(1, F * 1.4); flash.material.rotation = v * 0.3;
      flash2.scale.setScalar(6 + 46 * F); flash2.material.opacity = F;
      bg.setRGB(0.02 * F + 0.008, 0.025 * F + 0.016, 0.04 * F + 0.04);
      ns.g.visible = nsA > 0.01; ns.g.scale.setScalar(Math.max(nsA, 0.01)); ns.spin.rotation.z = el * 2.6;
      hole.g.visible = holeA > 0.01; hole.g.scale.setScalar(Math.max(holeA, 0.01)); hole.disc.rotation.z = -el * 0.6;
      // the stage name floats above whatever is biggest
      const top = Math.max(shown > 0.05 ? r : 0, s === 0 ? 4.5 : 0, pnA > 0.2 ? pn.scale.x * 0.8 : 0, snA > 0.2 ? sn.scale.x * 0.7 : 0, nsA + holeA > 0.2 ? 1.6 : 0);
      name.pos.set(0, 0, top + 1.1);
      name.set(path[stageNow].name);
    },
    readout() {
      const p = path[stageNow];
      return [`${p.name[0]} · ${p.age[0]}`, `${p.name[1]} · ${p.age[1]}`];
    },
    dispose() { for (const t of own) t.dispose(); },
  };
};
export default kit;

/** The two paths as two rows: one nebula, then a Sun-like star above and a massive star below. */
function both(ctx: KitCtx, tex: THREE.Texture, grain: THREE.Texture, own: THREE.Texture[]) {
  const root = ctx.root, low = ctx.low;
  const X = [-14, -8.6, -3.4, 1.8, 7.2, 12.6], ZT = 3.4, ZB = -3.4;
  const neb = nebula(low ? 1600 : 3500, 2.4, tex, 11);
  neb.position.set(X[0], 0, 0);
  root.add(neb);
  ctx.pickable(neb, 'nebula');
  const items: { o: THREE.Object3D; t: number; at: THREE.Vector3; text: Pair; c: string; r: number }[] = [];
  const add = (obj: THREE.Object3D, x: number, z: number, r: number, text: Pair, c: string, i: number, tag?: string) => {
    obj.position.set(x, 0, z); root.add(obj);
    if (tag) ctx.pickable(obj, tag);
    items.push({ o: obj, t: 0.4 + i * 0.45, at: new THREE.Vector3(x, 0, z - r - 0.75), text, c, r });
  };
  // Sun-like
  const proto1 = new StarBall(3300, 0.55, grain, 32); proto1.set(3300, 0.55, 1.6);
  const ms1 = new StarBall(5800, 0.5, grain, 32);
  const rg = new StarBall(3400, 1.5, grain); rg.set(3400, 1.5, 0.9);
  const pnG = new THREE.Group(); const pnS = shell(low ? 1500 : 3000, tex, true, 9); pnS.scale.setScalar(1.35); pnS.rotation.x = 1.0;
  const pnCore = new StarBall(60000, 0.07, grain, 16); pnCore.set(60000, 0.07, 1.4); pnG.add(pnS, pnCore);
  const wd = new StarBall(20000, 0.13, grain, 24); wd.set(20000, 0.13, 1.5);
  add(proto1, X[1], ZT, 0.55, ['Protostar', '原恒星'], '#ffb27a', 1);
  add(ms1, X[2], ZT, 0.5, ['Main sequence', '主序星'], '#ffd24a', 2, 'ms');
  add(rg, X[3], ZT, 1.5, ['Red giant', '红巨星'], '#ff8a6b', 3, 'rg');
  add(pnG, X[4], ZT, 1.35, ['Planetary nebula', '行星状星云'], '#3bc9db', 4, 'pn');
  add(wd, X[5], ZT, 0.13, ['White dwarf', '白矮星'], '#e7f5ff', 5, 'wd');
  // massive
  const proto2 = new StarBall(4000, 0.75, grain, 32); proto2.set(4000, 0.75, 1.6);
  const ms2 = new StarBall(30000, 0.8, grain, 32);
  const rsg = new StarBall(3500, 2.1, grain); rsg.set(3500, 2.1, 0.9);
  const snG = new THREE.Group(); const snS = shell(low ? 2000 : 4000, tex, false, 13); snS.scale.setScalar(1.6);
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); snG.add(snS, fl);
  const nsP = pulsar(0.06, grain);
  const bhB = blackHole(0.3);
  add(proto2, X[1], ZB, 0.75, ['Protostar', '原恒星'], '#ffb27a', 1);
  add(ms2, X[2], ZB, 0.8, ['Massive main sequence', '大质量主序星'], '#a5d8ff', 2, 'ms2');
  add(rsg, X[3], ZB, 2.1, ['Red supergiant', '红超巨星'], '#ff6b6b', 3, 'rsg');
  add(snG, X[4], ZB, 1.6, ['Supernova', '超新星'], '#ffd24a', 4, 'sn');
  add(nsP.g, X[5], ZB + 1.5, 0.3, ['Neutron star', '中子星'], '#a5d8ff', 5, 'ns');
  add(bhB.g, X[5], ZB - 1.9, 0.9, ['Black hole', '黑洞'], '#ffa94d', 5.4, 'bh');
  // arrows between the stages
  const arrows: { a: Arrow; t: number }[] = [];
  const arrow = (x0: number, z0: number, x1: number, z1: number, t: number, c = '#8aa0b8') => {
    const d = new THREE.Vector3(x1 - x0, 0, z1 - z0), a = new Arrow(c, 0.045);
    a.set([x0, 0, z0], d); root.add(a); arrows.push({ a, t });
  };
  arrow(X[0] + 1.9, 0.9, X[1] - 0.9, ZT - 0.3, 0.3); arrow(X[0] + 1.9, -0.9, X[1] - 1.1, ZB + 0.3, 0.3);
  const rr = [0.55, 0.5, 1.5, 1.35, 0.13], rb = [0.75, 0.8, 2.1, 1.6];
  for (let i = 0; i < 4; i++) arrow(X[i + 1] + rr[i] + 0.35, ZT, X[i + 2] - rr[i + 1] - 0.4, ZT, 0.6 + i * 0.45);
  for (let i = 0; i < 3; i++) arrow(X[i + 1] + rb[i] + 0.35, ZB, X[i + 2] - rb[i + 1] - 0.4, ZB, 0.6 + i * 0.45);
  arrow(X[4] + 1.7, ZB + 0.3, X[5] - 0.7, ZB + 1.4, 2.4); arrow(X[4] + 1.7, ZB - 0.3, X[5] - 1.2, ZB - 1.7, 2.6);
  ctx.label(new THREE.Vector3(X[0], 0, -3.1), ['Nebula', '星云'], { c: '#f783ac', t: 0.2 });
  ctx.label(new THREE.Vector3(X[1] - 0.6, 0, ZT + 2.1), ['Sun-like star', '类太阳恒星'], { big: true, c: '#ffd24a', t: 0.4 });
  ctx.label(new THREE.Vector3(X[1] - 0.6, 0, ZB + 1.75), ['Massive star (over ~8 Suns)', '大质量恒星（约 8 倍太阳质量以上）'], { big: true, c: '#a5d8ff', t: 0.4 });
  for (const it of items) ctx.label(it.at, it.text, { c: it.c, t: it.t + 0.2 });
  ctx.view([0, -1, 0.1], 36, [-0.6, 0, 0], true);
  return {
    update(_v: number, _dt: number, el: number) {
      pointScale(ctx, neb.children[0] as P, neb.children[1] as P, pnS, snS);
      for (const it of items) { const k = ramp(el, it.t, 0.6); it.o.visible = k > 0.01; it.o.scale.setScalar(Math.max(k, 0.01)); }
      for (const a of arrows) { const k = ramp(el, a.t, 0.5); a.a.visible = k > 0.01; a.a.opacity = 0.8 * k; }
      ms1.set(5800, 0.5, 1, el * 0.004); ms2.set(30000, 0.8, 1, el * 0.004);
      rg.set(3400, 1.5, 0.9, el * 0.002); rsg.set(3500, 2.1, 0.9, el * 0.002);
      // the supernova flares every few seconds
      const ph = (el % 5) / 5, F = Math.exp(-ph * 9);
      fl.scale.setScalar(1.8 + 6 * F); fl.material.opacity = 0.35 + 0.65 * F; fl.material.rotation = el * 0.1;
      snS.scale.setScalar(1.25 + 0.45 * ease(ph * 1.5)); snS.rotation.z = el * 0.05;
      pnS.rotation.z = el * 0.08;
      nsP.spin.rotation.z = el * 2.6; bhB.disc.rotation.z = -el * 0.6;
      neb.rotation.z = el * 0.03;
    },
    dispose() { for (const t of own) t.dispose(); },
  };
}

/** Hydrogen fusing to helium: the star with its hot core, and the reaction drawn large beside it. */
function fusion(ctx: KitCtx, grain: THREE.Texture, own: THREE.Texture[]) {
  const root = ctx.root;
  root.add(dirLight([0.4, -1, 0.6], 2.2, 0.35));
  const sun = new StarBall(5800, 2.6, grain);
  sun.position.set(-6, 0, 0);
  const core = glow('#fff6d0', 3.2, 0.95);
  core.position.set(-6, -2.7, 0);
  core.renderOrder = 5;
  root.add(sun, core);
  const C0 = new THREE.Vector3(4.2, 0, 0);
  const zoom = [line2([-6, -2.6, 0.55], [C0.x - 3.4, 0, 3.2]), line2([-6, -2.6, -0.55], [C0.x - 3.4, 0, -3.2])];
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-3.4, 3.2], [3.4, 3.2], [3.4, -3.2], [-3.4, -3.2]].map(([x, z]) => new THREE.Vector3(C0.x + x, 0, z))), new THREE.LineBasicMaterial({ color: '#8aa0b8', transparent: true, opacity: 0.45 }));
  root.add(...zoom, frame);
  const proton = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 12), new THREE.MeshStandardMaterial({ color: '#ff6b6b', emissive: '#5a1010', roughness: 0.5 })); return m; };
  const neutron = () => new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 12), new THREE.MeshStandardMaterial({ color: '#adb5bd', emissive: '#202428', roughness: 0.5 }));
  const H = [0, 1, 2, 3].map(() => proton());
  const he = new THREE.Group();
  [proton(), neutron(), proton(), neutron()].forEach((m, i) => { const a = (i * Math.PI) / 2; m.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.12, Math.sin(a) * 0.27); he.add(m); });
  he.position.copy(C0);
  const fl = glow('#ffffff', 1, 1); fl.position.copy(C0);
  const gam = Array.from({ length: 6 }, () => glow('#ffe066', 0.5, 1));
  root.add(...H, he, fl, ...gam);
  const dirs = [0, 1, 2, 3].map(i => { const a = Math.PI / 4 + (i * Math.PI) / 2; return new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); });
  const gdirs = gam.map((_, i) => { const a = (i / 6) * Math.PI * 2 + 0.3; return new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); });
  ctx.label(new THREE.Vector3(-6, 0, 3.4), ['A star like the Sun', '类似太阳的恒星'], { c: '#ffd24a', big: true });
  ctx.label(new THREE.Vector3(-6, -2.7, -0.9), ['Core ≈ 15 million °C', '核心约 1500 万 °C'], { c: '#ffe8a3', dy: 6 });
  ctx.label(new THREE.Vector3(C0.x, 0, -3.9), ['4 hydrogen nuclei → 1 helium nucleus + energy', '4 个氢核 → 1 个氦核 + 能量'], { big: true, c: '#ffd24a' });
  const lp = ctx.label(H[0], ['hydrogen nucleus (proton)', '氢原子核（质子）'], { c: '#ff8787', dy: -18 });
  const lh = ctx.label(he, ['helium nucleus', '氦原子核'], { c: '#ced4da', dy: -22 });
  ctx.view([0, -1, 0.12], 22, [-0.8, 0, 0], true);
  return {
    update(_v: number, _dt: number, el: number) {
      sun.set(5800, 2.6, 1, el * 0.004);
      core.material.opacity = 0.8 + 0.15 * Math.sin(el * 3);
      const T = 3.6, p = el % T;
      const come = ease(p / 1.5);
      H.forEach((h, i) => { h.position.copy(C0).addScaledVector(dirs[i], lerp(2.6, 0.32, come)); h.visible = p < 1.55; });
      he.visible = p >= 1.55 && p < T - 0.2;
      he.rotation.z = el * 0.8;
      const F = p >= 1.45 ? Math.exp(-(p - 1.5) * 3.5) : 0;
      fl.visible = F > 0.02; fl.scale.setScalar(1 + 5 * F); fl.material.opacity = Math.min(1, F * 1.2);
      gam.forEach((g, i) => {
        const q = p - 1.5;
        g.visible = q > 0;
        g.position.copy(C0).addScaledVector(gdirs[i], 0.4 + q * 1.6);
        g.material.opacity = clamp(1 - q / 1.9);
      });
      lp.on = p < 1.2; lh.on = he.visible;
    },
    dispose() { for (const t of own) t.dispose(); },
  };
}

function line2(a: [number, number, number], b: [number, number, number]): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#8aa0b8', transparent: true, opacity: 0.4 }));
}
