/**
 * Kit "compact": the dead cores of massive stars. A black hole with its glowing accretion disc (the lensed far side
 * arching over the shadow, one side Doppler-brightened), gravitational lensing turning a background galaxy into an
 * Einstein ring, a spinning pulsar sweeping its beams past the Earth, and the Event Horizon Telescope's two images.
 */
import * as THREE from 'three';
import { Arrow, body, clamp, dirLight, ease, glow, line, ramp, setLine, starfield, Panel, FONT } from './draw.ts';
import type { AstroClock, KitCtx, KitFactory, KitRun, V3 } from './types.ts';

export interface Opts {
  /**
   * - `hole`: a black hole and its accretion disc; with a clock (unit `x`) the value is the mass in suns and the
   *   readout gives the Schwarzschild radius
   * - `lens`: gravitational lensing; the clock (0 … 100 %) lines the background galaxy up behind the lens
   * - `pulsar`: a spinning neutron star with its two beams and the pulses they make at the Earth
   * - `eht`: the Event Horizon Telescope images of M87* (2019) and Sgr A* (2022)
   */
  mode: 'hole' | 'lens' | 'pulsar' | 'eht';
}

const VERT = /* glsl */`
varying vec2 vP; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() {
  vP = position.xy; vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const NOISE = /* glsl */`
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const additive = (uniforms: Record<string, THREE.IUniform>, frag: string) => new THREE.ShaderMaterial({
  uniforms, vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

const kit: KitFactory<Opts & { clock?: AstroClock }> = (ctx, o) => {
  ctx.root.add(starfield(ctx.low ? 900 : 2200));
  switch (o.mode) {
    case 'lens': return lens(ctx);
    case 'pulsar': return pulsar(ctx);
    case 'eht': return eht(ctx);
    default: return hole(ctx, !!o.clock);
  }
};
export default kit;

// ------------------------------------------------------------------------------------------------ black hole

const DISC_FRAG = /* glsl */`
uniform float uT, uIn, uOut, uA; uniform vec3 uN;
varying vec2 vP; varying vec3 vW;
${NOISE}
vec3 heat(float t) { return mix(mix(vec3(0.42, 0.05, 0.02), vec3(1.0, 0.42, 0.1), smoothstep(0.0, 0.5, t)), vec3(1.0, 0.94, 0.8), smoothstep(0.5, 1.0, t)); }
void main() {
  float r = length(vP), x = clamp((r - uIn) / (uOut - uIn), 0.0, 1.0);
  float a = atan(vP.y, vP.x) - uT * 1.1 * pow(uIn / r, 1.5);
  vec3 q = vec3(cos(a) * 1.3, sin(a) * 1.3, r * 4.5);
  float n = 0.55 * n3(q) + 0.3 * n3(q * 2.3 + 7.0) + 0.15 * n3(q * 5.1 + 3.0);
  float I = pow(1.0 - x, 1.7) * smoothstep(0.0, 0.05, x) * (0.45 + 1.0 * n);
  vec3 v = normalize(cross(uN, vW));
  float d = dot(v, normalize(cameraPosition - vW));
  float g = pow(1.0 + 0.6 * d, 2.6);
  vec3 c = heat(clamp(1.05 - x * 1.25 + 0.2 * d, 0.0, 1.0));
  gl_FragColor = vec4(c * I * g * uA * 1.1, 1.0);
}`;
const HALO_FRAG = /* glsl */`
uniform float uSide, uInc, uA;
varying vec2 vP;
void main() {
  float r = length(vP), ang = atan(vP.y, vP.x), s = sin(ang);
  float ring = exp(-pow((r - 1.03) / 0.028, 2.0)) * 1.4;
  float arc = exp(-pow((r - 1.36) / 0.17, 2.0)) * mix(0.18, 1.0, smoothstep(-0.3, 0.95, s));
  float under = exp(-pow((r - 1.13) / 0.05, 2.0)) * 0.7 * smoothstep(0.1, -0.7, s);
  float face = exp(-pow((r - 1.3) / 0.2, 2.0)) * 0.8;
  float I = mix(arc + under, face, uInc);
  float dop = pow(max(0.05, 1.0 + 0.55 * uSide * cos(ang) * (1.0 - uInc)), 2.4);
  vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.9, 0.74), clamp(I * dop * 0.8, 0.0, 1.0));
  float haze = 0.12 * exp(-(r - 1.0) * 2.2) * step(1.0, r);
  float edge = smoothstep(2.6, 2.1, r);
  gl_FragColor = vec4((c * I * dop + vec3(1.0, 0.85, 0.65) * ring * mix(1.0, dop, 0.5) + vec3(1.0, 0.5, 0.2) * haze) * uA * edge, 1.0);
}`;

function hole(ctx: KitCtx, withMass: boolean): KitRun {
  const g = new THREE.Group();
  ctx.root.add(g);
  const shadow = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  g.add(shadow);
  ctx.pickable(shadow, 'horizon');
  const disc = new THREE.Mesh(new THREE.RingGeometry(1.5, 6, 160, 24), additive({ uT: { value: 0 }, uIn: { value: 1.5 }, uOut: { value: 6 }, uA: { value: 0 }, uN: { value: new THREE.Vector3(0, 0, 1) } }, DISC_FRAG));
  // a slight tilt, like the Interstellar view
  disc.rotation.x = 0.06;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), additive({ uSide: { value: 1 }, uInc: { value: 0 }, uA: { value: 0 } }, HALO_FRAG));
  g.add(disc, halo);
  const dm = disc.material as THREE.ShaderMaterial, hm = halo.material as THREE.ShaderMaterial;
  const N = new THREE.Vector3(), R = new THREE.Vector3(), V = new THREE.Vector3(), Z = new THREE.Vector3();
  disc.updateMatrixWorld();
  N.set(0, 0, 1).applyQuaternion(disc.quaternion);
  dm.uniforms.uN.value.copy(N);

  ctx.label(new THREE.Vector3(0, 0, 0), ['Event horizon', '事件视界'], { c: '#ffe8cc', t: 1.2 });
  ctx.label(new THREE.Vector3(5.2, 0, 0.35), ['Accretion disc', '吸积盘'], { c: '#ffa94d', t: 1.8 });
  ctx.label(new THREE.Vector3(-0.2, 0, 1.75), ['Light bent over the top', '被弯折的光'], { c: '#ffd8a8', t: 2.6 });
  ctx.view([0, -1, 0.1], 13, [0, 0, 0.15], true);
  return {
    update(_v, _dt, el) {
      const a = ramp(el, 0.2, 1.4);
      dm.uniforms.uA.value = a; hm.uniforms.uA.value = a;
      dm.uniforms.uT.value = el;
      halo.quaternion.copy(ctx.camera.quaternion);
      V.copy(ctx.camera.position).normalize();
      hm.uniforms.uInc.value = Math.abs(V.dot(N)) ** 1.5;
      // which screen side moves toward us: the velocity at the screen-right edge of the disc
      R.set(1, 0, 0).applyQuaternion(ctx.camera.quaternion);
      Z.crossVectors(N, R);
      hm.uniforms.uSide.value = Math.sign(Z.dot(V)) || 1;
    },
    readout: withMass ? (v: number) => {
      const r = 2.95 * v, s = r < 100 ? r.toFixed(1) : Math.round(r).toLocaleString('en-US');
      return [`Rs = 2.95 km × ${v.toFixed(0)} = ${s} km`, `史瓦西半径 = 2.95 千米 × ${v.toFixed(0)} = ${s} 千米`];
    } : undefined,
  };
}

// ------------------------------------------------------------------------------------------------ lensing

const LENS_FRAG = /* glsl */`
uniform vec2 uB; uniform float uE, uA;
varying vec2 vUv;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 th = vUv * 2.0 - 1.0;
  float r = length(th), r2 = dot(th, th) + 1e-5;
  vec2 be = th - uE * uE * th / r2;
  // the background galaxy (a small tilted ellipse) seen through the lens
  vec2 d = be - uB;
  d = mat2(0.87, -0.5, 0.5, 0.87) * d;
  float gal = exp(-dot(d * vec2(1.0, 1.7), d * vec2(1.0, 1.7)) / 0.0042);
  float core = exp(-dot(d, d) / 0.0006);
  // faint background stars, lensed too
  vec2 cell = floor(be * 26.0), f = fract(be * 26.0) - 0.5;
  float hs = h2(cell);
  vec2 off = vec2(h2(cell + 3.1), h2(cell + 7.7)) - 0.5;
  float st = step(0.93, hs) * exp(-dot(f - off * 0.6, f - off * 0.6) / 0.004) * (hs - 0.9) * 9.0;
  // the lensing mass: a yellowish elliptical galaxy in front
  float lensG = exp(-r2 / 0.006) * 0.9 + exp(-r2 / 0.05) * 0.18;
  vec3 c = vec3(0.55, 0.75, 1.0) * gal * 1.5 + vec3(0.85, 0.92, 1.0) * core * 0.8 + vec3(0.8, 0.85, 1.0) * st + vec3(1.0, 0.8, 0.5) * lensG;
  float vig = smoothstep(1.0, 0.9, r);
  gl_FragColor = vec4(c * vig * uA, vig * uA);
}`;

function lens(ctx: KitCtx): KitRun {
  const E = 0.32, PZ = 1.5, DZ = -2.5, DL = 4, hE = 0.62;
  // the view from the Earth (an exact point-lens image, computed per pixel)
  const pm = new THREE.ShaderMaterial({ uniforms: { uB: { value: new THREE.Vector2() }, uE: { value: E }, uA: { value: 0 } }, vertexShader: VERT, fragmentShader: LENS_FRAG, transparent: true, depthWrite: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), pm);
  panel.rotation.x = Math.PI / 2;
  panel.position.set(0, 0, PZ);
  const rim = line(Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return [2.3 * Math.cos(a), -0.01, PZ + 2.3 * Math.sin(a)] as V3; }), '#8fa0b2', { opacity: 0.35 });
  ctx.root.add(panel, rim);
  ctx.label(new THREE.Vector3(0, 0, PZ + 2.55), ['What we see from Earth', '从地球上看到的景象'], { c: '#dee2e6' });
  const ringLbl = ctx.label(new THREE.Vector3(0.9, 0, PZ + 0.62), ['Einstein ring', '爱因斯坦环'], { c: '#a5d8ff' });

  // side view: Earth — lens — galaxy, with two light paths
  const earth = body('earth', 0.2, '#4d7cc4');
  earth.position.set(-DL, 0, DZ);
  const lensG = glow('#ffd8a8', 1.3, 0.95), src = glow('#91c8ff', 0.9, 1);
  lensG.position.set(0, 0, DZ);
  ctx.root.add(earth, lensG, src, dirLight([-1, -1, 1], 1.8, 0.5));
  const axis = line([[-DL, 0, DZ], [DL, 0, DZ]], '#ffffff', { opacity: 0.12, dashed: true, dash: 0.12 });
  const straight = line([[-DL, 0, DZ], [DL, 0, DZ]], '#adb5bd', { opacity: 0.4, dashed: true, dash: 0.1 });
  const rayA = line([[0, 0, 0], [0, 0, 0], [0, 0, 0]], '#ffd24a', { opacity: 0.95 });
  const rayB = line([[0, 0, 0], [0, 0, 0], [0, 0, 0]], '#ffd24a', { opacity: 0.95 });
  ctx.root.add(axis, straight, rayA, rayB);
  ctx.label(earth, ['Earth', '地球'], { c: '#a5d8ff', dy: 18 });
  ctx.label(lensG, ['Massive galaxy (lens)', '大质量星系（透镜）'], { c: '#ffd8a8', dy: 22 });
  const srcLbl = ctx.label(src, ['Distant galaxy', '遥远的星系'], { c: '#91c8ff', dy: -18 });

  const pA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], pB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const pS = [new THREE.Vector3(-DL, 0, DZ), new THREE.Vector3()];
  ctx.view([0, -1, 0.04], 11.5, [0, 0, -0.2], true);
  return {
    update(v, _dt, el) {
      const a = ramp(el, 0.1, 1.2);
      pm.uniforms.uA.value = a;
      const b = 1.7 * (1 - ease(clamp(v / 100)));
      (pm.uniforms.uB.value as THREE.Vector2).set(0, b * E);
      // images: θ± = θE (b ± √(b² + 4)) / 2, as heights at the lens plane
      const s = Math.sqrt(b * b + 4), hp = (hE * (b + s)) / 2, hm = (hE * (b - s)) / 2;
      const ys = b * hE * 2; // source height (source twice as far as the lens)
      src.position.set(DL, 0, DZ + ys);
      pA[0].set(-DL, 0, DZ); pA[1].set(0, 0, DZ + hp); pA[2].set(DL, 0, DZ + ys);
      pB[0].set(-DL, 0, DZ); pB[1].set(0, 0, DZ + hm); pB[2].set(DL, 0, DZ + ys);
      setLine(rayA, pA); setLine(rayB, pB);
      pS[1].set(DL, 0, DZ + ys); setLine(straight, pS);
      const r = ramp(el, 0.6, 1.2);
      for (const l of [rayA, rayB]) (l.material as THREE.LineBasicMaterial).opacity = 0.9 * r;
      ringLbl.on = b < 0.2;
      srcLbl.on = true;
    },
  };
}

// ------------------------------------------------------------------------------------------------ pulsar

const BEAM_FRAG = /* glsl */`
uniform vec3 uC; uniform float uA;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() {
  float along = 1.0 - vUv.y;
  float f = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
  float a = pow(1.0 - along, 1.6) * pow(f, 1.4) * uA;
  gl_FragColor = vec4(uC * a, 1.0);
}`;

function pulsar(ctx: KitCtx): KitRun {
  const ALPHA = 45 * Math.PI / 180, SPIN = 0.55, BEAM = 6;
  const spin = new THREE.Group(), tilt = new THREE.Group();
  spin.add(tilt);
  tilt.rotation.x = Math.PI / 2 - ALPHA; // magnetic axis ALPHA from the spin axis
  ctx.root.add(spin, dirLight([1, -1.2, 0.8], 1.6, 0.35));
  const ns = new THREE.Mesh(new THREE.SphereGeometry(0.36, 48, 24), new THREE.MeshStandardMaterial({ color: '#dbe8ff', emissive: '#6f8fc8', roughness: 0.5 }));
  tilt.add(ns, glow('#b8d4ff', 2.2, 0.8));
  ctx.pickable(ns, 'pulsar');
  for (const s of [1, -1]) {
    const geo = new THREE.ConeGeometry(0.85, BEAM, 40, 1, true);
    geo.rotateX(Math.PI); geo.translate(0, BEAM / 2, 0);
    const beam = new THREE.Mesh(geo, additive({ uC: { value: new THREE.Color('#9ec5ff') }, uA: { value: 0 } }, BEAM_FRAG));
    if (s < 0) beam.rotation.x = Math.PI;
    tilt.add(beam);
    ctx.pickable(beam, 'beam');
    const hot = glow('#e7f0ff', 0.5, 1);
    hot.position.set(0, 0.37 * s, 0);
    tilt.add(hot);
  }
  // dipole field lines r = L sin²θ around the magnetic axis (local y)
  for (const L of [0.9, 1.6]) for (let k = 0; k < 4; k++) {
    const ph = (k / 4) * Math.PI * 2, pts: V3[] = [];
    for (let i = 0; i <= 64; i++) {
      const th = 0.25 + (i / 64) * (Math.PI - 0.5), r = L * Math.sin(th) ** 2 + 0.36 * 0.3;
      pts.push([r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]);
    }
    tilt.add(line(pts, '#63e6be', { opacity: 0.22 }));
  }
  tilt.add(line([[0, -1.6, 0], [0, 1.6, 0]], '#63e6be', { opacity: 0.4 }));
  ctx.root.add(line([[0, 0, -1.9], [0, 0, 1.9]], '#ced4da', { opacity: 0.45, dashed: true, dash: 0.1 }));
  ctx.label(new THREE.Vector3(0, 0, 2.05), ['Spin axis', '自转轴'], { c: '#ced4da', t: 1 });
  ctx.label(ns, ['≈ 20 km across: the size of a city', '直径约 20 千米，和一座城市差不多大'], { c: '#dbe4ff', dy: 26, t: 0.6 });

  // the Earth sits where one beam sweeps past once per turn
  const elev = Math.PI / 2 - ALPHA, toEarth = new THREE.Vector3(Math.cos(elev), 0, Math.sin(elev));
  const earth = body('earth', 0.28, '#4d7cc4');
  earth.position.copy(toEarth).multiplyScalar(5.2);
  const flash = glow('#cfe2ff', 1.6, 0);
  flash.position.copy(earth.position);
  ctx.root.add(earth, flash);
  ctx.label(earth, ['Earth (far away)', '地球（非常遥远）'], { c: '#a5d8ff', dy: 22, t: 1.2 });
  const arrow = new Arrow('#a5d8ff', 0.018);
  arrow.set(toEarth.clone().multiplyScalar(0.6), toEarth.clone().multiplyScalar(4.1));
  arrow.opacity = 0.35;
  ctx.root.add(arrow);

  const pn = new Panel(5.4, 1.5, ctx.low ? 480 : 720, 'rgba(8,14,24,0.78)');
  ctx.root.add(pn.mesh);
  const beamDir = new THREE.Vector3(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Zz = new THREE.Vector3(0, 0, 1);
  /** brightness at the Earth at time t (s) */
  const pulse = (t: number) => {
    qs.setFromAxisAngle(Zz, t * SPIN * Math.PI * 2);
    q.setFromAxisAngle(X, Math.PI / 2 - ALPHA);
    beamDir.set(0, 1, 0).applyQuaternion(q).applyQuaternion(qs);
    const d = Math.acos(clamp(Math.abs(beamDir.dot(toEarth)), -1, 1));
    return Math.exp(-((d / 0.13) ** 2));
  };
  const anchor = new THREE.Vector3(0.6, 0, -2.6);
  let lastDraw = -1;
  ctx.view([0.25, -1, 0.32], 13, [0.8, 0, -0.2], true);
  const beams = tilt.children.filter(c => (c as THREE.Mesh).material instanceof THREE.ShaderMaterial) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  return {
    update(_v, _dt, el) {
      const a = ramp(el, 0.3, 1.2);
      spin.rotation.z = el * SPIN * Math.PI * 2;
      for (const b of beams) b.material.uniforms.uA.value = a;
      const I = pulse(el) * a;
      (flash.material as THREE.SpriteMaterial).opacity = I;
      flash.scale.setScalar(0.8 + 1.6 * I);
      pn.face(ctx.camera, anchor);
      if (el - lastDraw < (ctx.low ? 0.08 : 0.03)) return;
      lastDraw = el;
      const g = pn.card(), W = pn.W, H = pn.H, x0 = W * 0.04, x1 = W * 0.96, y0 = H * 0.32, y1 = H * 0.8;
      g.font = `600 ${Math.round(H * 0.13)}px ${FONT}`; g.fillStyle = '#e9ecef'; g.textBaseline = 'alphabetic';
      g.fillText(ctx.L(['Radio pulses received on Earth', '地球上接收到的射电脉冲']), x0, H * 0.2);
      g.font = `${Math.round(H * 0.105)}px ${FONT}`; g.fillStyle = '#8fa0b2'; g.textAlign = 'right';
      g.fillText(ctx.L(['one pulse per turn · shown slowed down', '每转一圈一个脉冲 · 已放慢'] ), x1, H * 0.95);
      g.textAlign = 'left';
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x0, y1); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#9ec5ff'; g.lineWidth = 3; g.beginPath();
      const span = 4.5, n = 240;
      for (let i = 0; i <= n; i++) {
        const t = el - span + (i / n) * span, x = x0 + (i / n) * (x1 - x0), y = y1 - (t < 0.3 ? 0 : pulse(t)) * (y1 - y0);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x1, y1 - I * (y1 - y0), 5, 0, Math.PI * 2); g.fill();
      pn.commit();
    },
  };
}

// ------------------------------------------------------------------------------------------------ EHT images

const EHT_FRAG = /* glsl */`
uniform float uKind, uA;
varying vec2 vUv;
${NOISE}
vec3 afm(float t) { return clamp(vec3(2.0 * t, 2.0 * t - 0.5, 2.0 * t - 1.0), 0.0, 1.0); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), ang = atan(p.y, p.x);
  float R = uKind < 0.5 ? 0.46 : 0.5, w = uKind < 0.5 ? 0.15 : 0.14;
  float ring = exp(-pow((r - R) / w, 2.0));
  float m = uKind < 0.5
    ? 0.35 + 0.75 * smoothstep(0.6, -0.9, sin(ang + 0.35))
    : 0.45 + 0.6 * pow(0.5 + 0.5 * cos(3.0 * ang - 0.9), 2.0);
  float n = 0.85 + 0.3 * n3(vec3(p * 6.0, uKind * 5.0));
  float v = ring * m * n * 0.85;
  float vig = smoothstep(1.0, 0.86, r);
  gl_FragColor = vec4(afm(v) * vig * uA, vig * uA);
}`;

function eht(ctx: KitCtx): KitRun {
  const imgs: THREE.Mesh[] = [];
  const mk = (kind: number, x: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.ShaderMaterial({ uniforms: { uKind: { value: kind }, uA: { value: 0 } }, vertexShader: VERT, fragmentShader: EHT_FRAG, transparent: true, depthWrite: false }));
    m.position.set(x, 0, 0);
    ctx.root.add(m);
    imgs.push(m);
    return m;
  };
  ctx.pickable(mk(0, -1.65), 'm87');
  ctx.pickable(mk(1, 1.65), 'sgra');
  ctx.label(new THREE.Vector3(-1.65, 0, 1.65), ['M87* · 2019', 'M87* · 2019 年'], { c: '#ffd8a8', big: true });
  ctx.label(new THREE.Vector3(1.65, 0, 1.65), ['Sgr A* · 2022', '人马座 A* · 2022 年'], { c: '#ffd8a8', big: true });
  ctx.label(new THREE.Vector3(-1.65, 0, -1.6), ['6.5 billion Suns · 55 million ly', '65 亿个太阳质量 · 5500 万光年'], { c: '#ced4da', t: 0.8 });
  ctx.label(new THREE.Vector3(1.65, 0, -1.6), ['4 million Suns · our galaxy’s centre', '400 万个太阳质量 · 银河系中心'], { c: '#ced4da', t: 0.8 });
  ctx.label(new THREE.Vector3(0, 0, -2.15), ['Dark centre: the black hole’s shadow', '中间的暗区：黑洞的“阴影”'], { c: '#ffe8cc', t: 1.6 });
  ctx.view([0, -1, 0], 9.5, [0, 0, -0.1], true);
  return {
    update(_v, _dt, el) {
      imgs.forEach((m, i) => {
        m.quaternion.copy(ctx.camera.quaternion);
        ((m.material as THREE.ShaderMaterial).uniforms.uA.value) = ramp(el, 0.2 + i * 0.5, 1.2);
      });
    },
  };
}
