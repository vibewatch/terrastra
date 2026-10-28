/**
 * Kit "sun": the Sun close up and Sun–Earth space weather. The photosphere is a procedural shader (boiling granules,
 * limb darkening, sunspots with umbra and penumbra, faculae); a red chromosphere rim, a streaked corona, a prominence
 * loop, flares and the solar wind sit around it. Other modes follow a coronal mass ejection to Earth's magnetosphere,
 * show the auroral oval close up, and the effects of a magnetic storm.
 */
import * as THREE from 'three';
import { D2R, body, canvasTex, clamp, glow, line, ramp, rng, starfield, sunLight, dirLight } from './draw.ts';
import { sunspotNumber, cyclePhase } from './sunspots.ts';
import type { KitFactory, Label } from './types.ts';

export interface Opts {
  /**
   * - `energy`: the Sun shining in every direction and the tiny share that reaches Earth
   * - `layers`: photosphere (granules, sunspots), chromosphere, corona, a prominence, a flare and the solar wind;
   *   with a `date` clock the number of sunspots follows the 11-year cycle (readout: the sunspot number)
   * - `flare`: a flare and a coronal mass ejection crossing to Earth's magnetosphere (clock: `hour`s after the flare)
   * - `aurora`: Earth's north polar region at night with the auroral oval
   * - `effects`: a magnetic storm at Earth: radio blackout, satellites and GPS, power grids, aurora
   */
  mode: 'energy' | 'layers' | 'flare' | 'aurora' | 'effects';
  /** `layers`: which labels (default `layers`: the three layers; `features`: sunspot, flare, prominence, wind) */
  labels?: 'layers' | 'features' | 'none';
}

const yearOf = (ms: number) => 1970 + ms / (365.2425 * 864e5);

// ------------------------------------------------------------------------------------------------ shaders
const NOISE = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i).x, hash3(i + vec3(1, 0, 0)).x, f.x), mix(hash3(i + vec3(0, 1, 0)).x, hash3(i + vec3(1, 1, 0)).x, f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)).x, hash3(i + vec3(1, 0, 1)).x, f.x), mix(hash3(i + vec3(0, 1, 1)).x, hash3(i + vec3(1, 1, 1)).x, f.x), f.y), f.z);
}
vec2 worley(vec3 p, float t) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash3(i + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}`;
const MAXS = 48;
const PHOTO_V = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main() {
  vP = position; vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const PHOTO_F = /* glsl */ `
uniform float uTime; uniform float uGran; uniform float uCount; uniform vec4 uSpots[${MAXS}];
varying vec3 vP; varying vec3 vN; varying vec3 vV;
${NOISE}
void main() {
  vec3 p = normalize(vP);
  vec2 w = worley(p * uGran, uTime);
  float lane = smoothstep(0.03, 0.30, w.y - w.x);
  float m = vnoise(p * 7.0 + uTime * 0.01) * 0.6 + vnoise(p * 17.0) * 0.4;
  float I = 0.70 + 0.24 * lane + 0.14 * (m - 0.5);
  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float limb = 0.30 + 0.70 * pow(mu, 0.6);
  float pen = 0.0, umb = 0.0, fac = 0.0;
  for (int i = 0; i < ${MAXS}; i++) {
    if (float(i) >= uCount) break;
    vec4 s = uSpots[i];
    float d = acos(clamp(dot(p, s.xyz), -1.0, 1.0)) / s.w;
    umb = max(umb, 1.0 - smoothstep(0.36, 0.5, d));
    pen = max(pen, 1.0 - smoothstep(0.85, 1.05, d));
    fac = max(fac, 1.0 - smoothstep(1.0, 3.2, d));
  }
  float fib = 0.75 + 0.25 * vnoise(p * 300.0);
  vec3 hot = vec3(1.0, 0.94, 0.76), warm = vec3(1.0, 0.66, 0.26), deep = vec3(0.80, 0.27, 0.05);
  vec3 c = mix(deep, mix(warm, hot, smoothstep(0.5, 0.95, I * mu)), smoothstep(0.0, 0.7, mu)) * I * limb * 1.12;
  c += hot * fac * (1.0 - mu) * 0.35;
  c *= mix(1.0, 0.45 * fib, pen);
  c = mix(c, vec3(0.20, 0.05, 0.01), umb * 0.88);
  gl_FragColor = vec4(c, 1.0);
}`;
const RIM_V = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec3 vW;
void main() {
  vP = position; vN = normalize(normalMatrix * normal); vW = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const RIM_F = /* glsl */ `
uniform vec3 uC; uniform float uPow; uniform float uStr; uniform float uNoise; uniform float uTime; uniform vec3 uSun;
varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec3 vW;
${NOISE}
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = pow(f, uPow) * uStr;
  if (uNoise > 0.0) a *= 1.0 - uNoise + uNoise * 1.7 * vnoise(normalize(vP) * 9.0 + uTime * 0.15);
  if (dot(uSun, uSun) > 0.0) a *= smoothstep(-0.2, 0.5, dot(normalize(vW), uSun));
  gl_FragColor = vec4(uC, clamp(a, 0.0, 1.0));
}`;
/** An additive fresnel glow: bright at the edges as seen (atmospheres, shells, clouds). `sun`: light only the day side. */
function rimMat(color: string, pow: number, str: number, o: { side?: THREE.Side; noise?: number; sun?: THREE.Vector3 } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uPow: { value: pow }, uStr: { value: str }, uNoise: { value: o.noise ?? 0 }, uTime: { value: 0 }, uSun: { value: o.sun ?? new THREE.Vector3() } },
    vertexShader: RIM_V, fragmentShader: RIM_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: o.side ?? THREE.FrontSide,
  });
}
const AURORA_V = /* glsl */ `
attribute float aA; attribute float aV; attribute vec3 aOut;
uniform float uT; uniform float uR; uniform vec3 uSun;
varying float vA; varying float vV; varying float vDay;
void main() {
  vA = aA; vV = aV;
  float fold = sin(aA * 6.2831 * 9.0 + uT * 0.35) + 0.5 * sin(aA * 6.2831 * 23.0 - uT * 0.6) + 0.25 * sin(aA * 6.2831 * 51.0 + uT);
  vec3 p = position + aOut * uR * 0.011 * fold;
  vDay = smoothstep(-0.15, 0.45, dot(normalize(mat3(modelMatrix) * position), uSun));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const AURORA_F = /* glsl */ `
uniform float uT; uniform float uI;
varying float vA; varying float vV; varying float vDay;
void main() {
  float rays = 0.55 + 0.45 * sin(vA * 6.2831 * 170.0 + uT * 1.1 + 3.0 * sin(vA * 37.0 + uT * 0.2));
  float band = 0.3 + 0.7 * smoothstep(0.15, 0.7, 0.5 + 0.5 * sin(vA * 6.2831 * 4.0 - uT * 0.22) * sin(vA * 6.2831 * 7.0 + uT * 0.13 + 1.0));
  float h = smoothstep(0.0, 0.07, vV) * pow(1.0 - vV, 1.4);
  vec3 c = mix(vec3(0.30, 1.0, 0.55), vec3(1.0, 0.28, 0.42), smoothstep(0.4, 0.95, vV));
  float a = h * rays * band * uI * (1.0 - 0.75 * vDay);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;

// ------------------------------------------------------------------------------------------------ the Sun
/** A streaked corona painted once: helmet streamers near the equator, thin plumes near the poles. */
function coronaTex(): THREE.Texture {
  return canvasTex(512, 512, c => {
    const R = rng(11), cx = 256, r0 = 256 / 3.6;
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(cx, cx, r0 * 0.95, cx, cx, 256);
    g.addColorStop(0, 'rgba(255,236,214,0.55)'); g.addColorStop(0.18, 'rgba(255,220,190,0.2)'); g.addColorStop(0.5, 'rgba(255,205,175,0.05)'); g.addColorStop(1, 'rgba(255,200,170,0)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 64; i++) {
      const eq = i < 38;
      const a = eq ? (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 1.3 : (R() < 0.5 ? 1 : -1) * Math.PI / 2 + (R() - 0.5) * 0.9;
      const len = r0 * (eq ? 1.4 + R() * 1.9 : 0.9 + R() * 0.9), w = eq ? 0.08 + R() * 0.2 : 0.03 + R() * 0.04;
      c.save(); c.translate(cx, cx); c.rotate(a);
      const lg = c.createLinearGradient(r0 * 0.9, 0, r0 + len, 0);
      lg.addColorStop(0, `rgba(255,234,212,${eq ? 0.16 : 0.12})`); lg.addColorStop(1, 'rgba(255,220,200,0)');
      c.fillStyle = lg;
      c.beginPath(); c.moveTo(r0 * 0.92, -r0 * w);
      c.quadraticCurveTo(r0 * 1.35, -r0 * w * 1.15, r0 + len, 0);
      c.quadraticCurveTo(r0 * 1.35, r0 * w * 1.15, r0 * 0.92, r0 * w);
      c.closePath(); c.fill(); c.restore();
    }
  });
}

interface Sun {
  group: THREE.Group;
  /** the photosphere (rotates); anchors on it rotate with it */
  mesh: THREE.Mesh;
  /** an anchor at the biggest sunspot */
  spot: THREE.Object3D;
  /** groups of spots shown */
  groups: number;
  setSpots(sn: number, phase: number): void;
  update(el: number): void;
}
/** Sunspot groups: a leader, a follower and a small third spot, at fixed longitudes (latitude follows the cycle). */
const POOL = (() => {
  const R = rng(5);
  return Array.from({ length: 16 }, (_, g) => ({
    sgn: g % 2 ? -1 : 1,
    lon: g < 4 ? -90 + [-14, 22, -40, 44][g] + (R() - 0.5) * 8 : R() * 360 - 180,
    jit: (R() - 0.5) * 9,
    r: g === 0 ? 0.05 : 0.022 + R() * 0.02,
    tail: 5 + R() * 5,
  }));
})();

function makeSun(R: number, gran: number, o: { corona?: boolean; chromo?: boolean; wind?: boolean; low: boolean }): Sun {
  const group = new THREE.Group();
  const spots = Array.from({ length: MAXS }, () => new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGran: { value: gran }, uCount: { value: 0 }, uSpots: { value: spots } },
    vertexShader: PHOTO_V, fragmentShader: PHOTO_F,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), mat);
  group.add(mesh);
  if (o.chromo !== false) {
    const ch = new THREE.Mesh(new THREE.SphereGeometry(R * 1.022, 96, 48), rimMat('#ff4a68', 3, 1.5, { side: THREE.BackSide, noise: 0.6 }));
    group.add(ch);
  }
  if (o.corona !== false) {
    const cm = new THREE.SpriteMaterial({ map: coronaTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
    const cs = new THREE.Sprite(cm);
    cs.scale.setScalar(R * 7.2);
    group.add(cs, glow('#ffb45a', R * 4.2, 0.45));
  } else group.add(glow('#ffb45a', R * 3.4, 0.7));
  const spot = new THREE.Object3D();
  mesh.add(spot);
  const dir = (lat: number, lon: number, out: THREE.Vector3) => out.set(Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R));
  const tmp = new THREE.Vector3();
  // the solar wind: particles streaming out of the corona
  let wind: THREE.Points | null = null;
  const NW = o.wind ? (o.low ? 160 : 420) : 0, wdir: THREE.Vector3[] = [], wph: number[] = [];
  if (NW) {
    const Rn = rng(3), g = new THREE.BufferGeometry();
    for (let i = 0; i < NW; i++) {
      const z = Rn() * 2 - 1, a = Rn() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      wdir.push(new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), z * 0.8).normalize());
      wph.push(Rn());
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
    wind = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    wind.frustumCulled = false;
    group.add(wind);
  }
  const sun: Sun = {
    group, mesh, spot, groups: 0,
    setSpots(sn, phase) {
      const n = Math.max(0, Math.min(POOL.length, Math.round(sn / 13)));
      sun.groups = n;
      const base = 30 - 22 * phase;
      let k = 0;
      for (let g = 0; g < n; g++) {
        const p = POOL[g], lat = p.sgn * Math.max(4, base + p.jit);
        dir(lat, p.lon, tmp); spots[k++].set(tmp.x, tmp.y, tmp.z, p.r);
        dir(lat + p.sgn * 1.5, p.lon - p.tail, tmp); spots[k++].set(tmp.x, tmp.y, tmp.z, p.r * 0.7);
        dir(lat - p.sgn * 1, p.lon - p.tail * 0.45, tmp); spots[k++].set(tmp.x, tmp.y, tmp.z, p.r * 0.4);
        if (g === 0) spot.position.copy(dir(lat, p.lon, tmp)).multiplyScalar(R * 1.01);
      }
      mat.uniforms.uCount.value = k;
    },
    update(el) {
      mat.uniforms.uTime.value = el * 0.25;
      mesh.rotation.z = el * 0.012;
      if (wind) {
        const pa = wind.geometry.getAttribute('position') as THREE.BufferAttribute, ca = wind.geometry.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < NW; i++) {
          const f = (wph[i] + el * 0.07) % 1, r = R * (1.15 + f * 4.5), b = Math.sin(f * Math.PI) * 0.55;
          pa.setXYZ(i, wdir[i].x * r, wdir[i].y * r, wdir[i].z * r);
          ca.setXYZ(i, b, b * 0.85, b * 0.65);
        }
        pa.needsUpdate = true; ca.needsUpdate = true;
      }
    },
  };
  sun.setSpots(130, 0.35);
  return sun;
}

/** A prominence: a few glowing strands arching off the limb at direction `base`, spreading along `along`. */
function prominence(R: number, base: THREE.Vector3, along: THREE.Vector3): THREE.Group {
  const g = new THREE.Group(), Rn = rng(9), side = new THREE.Vector3().crossVectors(base, along).normalize();
  for (let k = 0; k < 6; k++) {
    const h = 0.2 + Rn() * 0.12, w = 0.1 + Rn() * 0.06, off = (Rn() - 0.5) * 0.05, ph = Rn() * 6;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (Math.PI * i) / 40, rr = R * (0.99 + h * Math.sin(a) * (1 + 0.12 * Math.sin(a * 3 + ph)));
      pts.push(base.clone().multiplyScalar(rr).addScaledVector(along, -Math.cos(a) * w * R).addScaledVector(side, off * R));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, R * (0.006 + Rn() * 0.01), 6),
      new THREE.MeshBasicMaterial({ color: '#ff6b86', transparent: true, opacity: 0.3 + Rn() * 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(tube);
  }
  const gl = glow('#ff5070', R * 0.5, 0.35);
  gl.position.copy(base).multiplyScalar(R * 1.12);
  g.add(gl);
  return g;
}

// ------------------------------------------------------------------------------------------------ Earth's magnetosphere
type FieldLine = { closed: true; L: number; s: number; phi: number } | { closed: false; lam: number; s: number; hemi: number; phi: number };
interface Magneto {
  group: THREE.Group;
  /** the nose of the bow shock and the top of the magnetosphere (label anchors) */
  nose: THREE.Object3D; top: THREE.Object3D;
  /** `S`: storm strength 0 … 1 (compresses the day side, lights the aurora) */
  update(S: number, el: number): void;
}
const NP = 72;
/**
 * Earth's field bent by the solar wind (Sun toward −x): dipole lines squeezed on the day side and stretched into a
 * tail on the night side, open lines from the polar caps, a bow shock, the solar wind flowing round it, particles
 * bouncing along the field lines, and small auroral ovals at both poles. Illustrative, not to scale.
 */
function magneto(E: THREE.Vector3, Re: number, o: { xa: number; xb: number; width: number; tail: number; low: boolean }): Magneto {
  const group = new THREE.Group();
  const specs: FieldLine[] = [];
  for (const phi of o.low ? [0] : [0, -0.7, 0.7]) {
    for (const L of [1.8, 2.6, 3.6, 4.8]) for (const s of [-1, 1]) specs.push({ closed: true, L, s, phi });
    for (const hemi of [-1, 1]) {
      for (const lam of [71, 75, 79]) specs.push({ closed: false, lam, s: 1, hemi, phi });
      for (const lam of [81, 85]) specs.push({ closed: false, lam, s: -1, hemi, phi });
    }
  }
  const lines = specs.map(sp => {
    const l = line(Array.from({ length: NP }, () => [0, 0, 0] as [number, number, number]), '#74c0fc', { opacity: sp.phi === 0 ? 0.55 : 0.18 });
    l.frustumCulled = false;
    group.add(l);
    return l;
  });
  const fill = (sp: FieldLine, S: number, a: THREE.BufferAttribute) => {
    const kd = 0.28 + 0.3 * S, kn = 0.02 + 0.012 * S, c = Math.cos(sp.phi), sn = Math.sin(sp.phi);
    for (let i = 0; i < NP; i++) {
      const t = i / (NP - 1);
      let x: number, z: number;
      if (sp.closed) {
        const l0 = Math.acos(Math.sqrt(1 / sp.L)), lam = -l0 + 2 * l0 * t, r = sp.L * Math.cos(lam) ** 2, h = r * Math.cos(lam);
        x = sp.s * (sp.s < 0 ? h / (1 + kd * h) : h * (1 + kn * h * h)); z = r * Math.sin(lam);
      } else {
        const l = sp.lam * D2R, p0x = sp.s * Math.cos(l), p0z = sp.hemi * Math.sin(l);
        const p1x = sp.s > 0 ? 2.4 : -0.7, p1z = sp.hemi * (sp.s > 0 ? 1.7 + (sp.lam - 70) * 0.1 : 3.5 - 0.6 * S);
        const p2x = o.tail, p2z = sp.hemi * (sp.s > 0 ? (1.4 + (sp.lam - 70) * 0.12) * (1 - 0.12 * S) : 2.9 - 0.3 * S);
        const u = 1 - t;
        x = u * u * p0x + 2 * u * t * p1x + t * t * p2x; z = u * u * p0z + 2 * u * t * p1z + t * t * p2z;
      }
      a.setXYZ(i, E.x + Re * x * c, E.y + Re * x * sn, E.z + Re * z);
    }
    a.needsUpdate = true;
  };
  // bow shock: a paraboloid of unit nose distance, scaled
  const shock = new THREE.Group();
  {
    const NR = 18, NA = 40, c = 1.3, rmax = 2.9, pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
      const r = (rmax * i) / NR, a = (2 * Math.PI * j) / NA;
      pos.push(-1 + (r * r) / (2 * c), r * Math.cos(a), r * Math.sin(a));
      if (i < NR && j < NA) { const k = i * (NA + 1) + j; idx.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    shock.add(new THREE.Mesh(g, rimMat('#a5d8ff', 2.5, 0.4, { side: THREE.DoubleSide })));
    const arc = Array.from({ length: 61 }, (_, i) => { const r = -rmax + (2 * rmax * i) / 60; return [-1 + (r * r) / (2 * c), 0, r] as [number, number, number]; });
    shock.add(line(arc, '#a5d8ff', { opacity: 0.45 }));
    shock.position.copy(E);
    group.add(shock);
  }
  const nose = new THREE.Object3D(); group.add(nose);
  const top = new THREE.Object3D(); top.position.set(E.x + Re * 0.4, E.y, E.z + Re * 2.2); group.add(top);
  // auroral ovals at the poles
  const ovals = [1, -1].map(h => {
    const m = new THREE.Mesh(new THREE.RingGeometry(Re * 0.22, Re * 0.34, 48), new THREE.MeshBasicMaterial({ color: '#69db7c', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(E.x, E.y, E.z + h * Re * 0.965);
    group.add(m);
    return m;
  });
  // solar wind flowing round the bow shock
  const NW = o.low ? 260 : 650, Rn = rng(21), wb: number[] = [], wa: number[] = [], wp: number[] = [];
  for (let i = 0; i < NW; i++) { wb.push(o.width * Math.sqrt(Rn())); wa.push(Rn() * Math.PI * 2); wp.push(Rn()); }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
  wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NW * 3), 3));
  const wind = new THREE.Points(wg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  wind.frustumCulled = false;
  group.add(wind);
  // charged particles bouncing along closed field lines
  const closedIdx = specs.map((s, i) => (s.closed && s.L > 3 ? i : -1)).filter(i => i >= 0);
  const NB = o.low ? 60 : 140, bl: number[] = [], bp: number[] = [];
  for (let i = 0; i < NB; i++) { bl.push(closedIdx[Math.floor(Rn() * closedIdx.length)]); bp.push(Rn()); }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
  const bounce = new THREE.Points(bg, new THREE.PointsMaterial({ color: '#ffe066', size: 2.6, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  bounce.frustumCulled = false;
  group.add(bounce);
  let lastS = -1, spd = 1;
  return {
    group, nose, top,
    update(S, el) {
      if (Math.abs(S - lastS) > 0.004) {
        lastS = S;
        specs.forEach((sp, i) => fill(sp, S, lines[i].geometry.getAttribute('position') as THREE.BufferAttribute));
        lines.forEach(l => l.geometry.computeBoundingSphere());
        const dn = 2.6 - 0.6 * S;
        shock.scale.setScalar(dn * Re);
        nose.position.set(E.x - dn * Re, E.y, E.z);
        for (const m of ovals) (m.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.75 * S;
        (bounce.material as THREE.PointsMaterial).opacity = S;
        bounce.visible = S > 0.02;
      }
      spd = 1 + S;
      const dn = (2.6 - 0.6 * S) * Re, Rc = 1.3 * dn, span = o.xb - o.xa;
      const pa = wg.getAttribute('position') as THREE.BufferAttribute, ca = wg.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < NW; i++) {
        const f = (wp[i] + el * 0.06 * spd) % 1, x = o.xa + f * span, dx = x - E.x;
        const rs = dx > -dn ? Math.sqrt(2 * Rc * (dx + dn)) : 0, b = wb[i], rr = b < rs ? rs + b * 0.25 : b;
        pa.setXYZ(i, x, E.y + rr * Math.cos(wa[i]), E.z + rr * Math.sin(wa[i]));
        const k = Math.min(1, f * 8, (1 - f) * 6) * 0.5;
        ca.setXYZ(i, k, k * (0.85 - 0.25 * S), k * (0.7 - 0.4 * S));
      }
      pa.needsUpdate = true; ca.needsUpdate = true;
      if (bounce.visible) {
        const ba = bg.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < NB; i++) {
          const la = lines[bl[i]].geometry.getAttribute('position') as THREE.BufferAttribute;
          const p = (0.5 - 0.5 * Math.cos(2 * Math.PI * (bp[i] + el * 0.3))) * (NP - 1), k = Math.floor(p), t = p - k, k2 = Math.min(NP - 1, k + 1);
          ba.setXYZ(i, la.getX(k) + (la.getX(k2) - la.getX(k)) * t, la.getY(k) + (la.getY(k2) - la.getY(k)) * t, la.getZ(k) + (la.getZ(k2) - la.getZ(k)) * t);
        }
        ba.needsUpdate = true;
      }
    },
  };
}

/** Earth with its painted map, turned so longitude `lon` faces world direction angle `at` (deg, from +x). */
function earth(Re: number, lon: number, at: number): { spin: THREE.Group; mesh: THREE.Mesh } {
  const spin = new THREE.Group(), mesh = body('earth', Re, '#3b6ea5', 1024);
  spin.add(mesh);
  spin.rotation.z = (at - lon) * D2R;
  return { spin, mesh };
}
/** A point on a sphere of radius r at (lat, lon) in the frame of `earth()`'s spin group. */
const llv = (lat: number, lon: number, r: number) => new THREE.Vector3(r * Math.cos(lat * D2R) * Math.cos(lon * D2R), r * Math.cos(lat * D2R) * Math.sin(lon * D2R), r * Math.sin(lat * D2R));

/** Auroral curtains round the magnetic pole `C` (unit, spin frame): wider on the night side (`anti`: away from the Sun). */
function auroraOval(Re: number, C: THREE.Vector3, anti: THREE.Vector3, sun: THREE.Vector3, low: boolean): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; front: (az: number, v: number) => THREE.Vector3 } {
  const e1 = anti.clone().addScaledVector(C, -C.dot(anti)).normalize(), e2 = new THREE.Vector3().crossVectors(C, e1);
  const N = low ? 160 : 320, pos: number[] = [], A: number[] = [], V: number[] = [], out: number[] = [], idx: number[] = [];
  const g = new THREE.Vector3(), t = new THREE.Vector3(), rad = new THREE.Vector3();
  const colat = (az: number, d: number) => (18 + 4.5 * Math.cos(az) + d) * D2R;
  const point = (az: number, d: number, h: number, o?: THREE.Vector3) => {
    const c = colat(az, d);
    rad.copy(e1).multiplyScalar(Math.cos(az)).addScaledVector(e2, Math.sin(az));
    g.copy(C).multiplyScalar(Math.cos(c)).addScaledVector(rad, Math.sin(c));
    if (o) o.copy(C).multiplyScalar(-Math.sin(c)).addScaledVector(rad, Math.cos(c));
    return g.clone().multiplyScalar(Re * (1 + h));
  };
  [[0, 0], [-2, 0.37]].forEach(([d, sh], layer) => {
    const base = pos.length / 3;
    for (let j = 0; j <= N; j++) {
      const az = (2 * Math.PI * j) / N;
      for (const v of [0, 1]) {
        const p = point(az, d, v ? 0.085 : 0.016, t);
        pos.push(p.x, p.y, p.z); A.push(j / N + sh); V.push(v); out.push(t.x, t.y, t.z);
      }
      if (j < N) { const k = base + j * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    void layer;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aA', new THREE.Float32BufferAttribute(A, 1));
  geo.setAttribute('aV', new THREE.Float32BufferAttribute(V, 1));
  geo.setAttribute('aOut', new THREE.Float32BufferAttribute(out, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uR: { value: Re }, uSun: { value: sun }, uI: { value: 1 } },
    vertexShader: AURORA_V, fragmentShader: AURORA_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return { mesh: new THREE.Mesh(geo, mat), mat, front: (az, v) => point(az, 0, v) };
}

// ------------------------------------------------------------------------------------------------ the kit
type Ctx = Parameters<KitFactory<Opts>>[0];
type Run = ReturnType<KitFactory<Opts>>;
const facing = (ctx: Ctx, o: THREE.Object3D, centre: THREE.Vector3, v: THREE.Vector3) => {
  o.getWorldPosition(v);
  const n = v.clone().sub(centre);
  return n.dot(ctx.camera.position.clone().sub(v)) > 0;
};

function layersMode(ctx: Ctx, o: Opts & { clock?: { unit: string } }): Run {
  const R = 3, sun = makeSun(R, 30, { wind: true, low: ctx.low });
  ctx.root.add(sun.group);
  const pb = new THREE.Vector3(-Math.cos(50 * D2R), 0, Math.sin(50 * D2R)), pal = new THREE.Vector3(Math.sin(50 * D2R), 0, Math.cos(50 * D2R));
  const prom = prominence(R, pb, pal);
  ctx.root.add(prom);
  // a flare beside the second spot group
  const flare = new THREE.Object3D();
  flare.position.copy(llv(16, POOL[1].lon + 3, R * 1.01));
  const f1 = glow('#ffffff', R * 0.28, 0), f2 = glow('#a5d8ff', R * 0.9, 0);
  flare.add(f1, f2);
  sun.mesh.add(flare);
  const cyc = o.clock?.unit === 'date';
  const which = o.labels ?? 'layers', O = new THREE.Vector3();
  const ls: { l: Label; obj?: THREE.Object3D }[] = [];
  if (which === 'layers') {
    ctx.label(new THREE.Vector3(0.25, -1, -0.35).normalize().multiplyScalar(R), ['Photosphere', '光球层'], { c: '#ffd24a', big: true });
    ctx.label(new THREE.Vector3(Math.cos(-25 * D2R), 0, Math.sin(-25 * D2R)).multiplyScalar(R * 1.03), ['Chromosphere', '色球层'], { c: '#ff8fa3', dx: 52, t: 0.8 });
    ctx.label(new THREE.Vector3(R * 1.75, 0, R * 1.25), ['Corona', '日冕层'], { c: '#e9ecef', t: 1.4 });
  } else if (which === 'features') {
    ls.push({ l: ctx.label(sun.spot, ['Sunspots', '黑子'], { c: '#ffd24a', dy: -22 }), obj: sun.spot });
    ls.push({ l: ctx.label(flare, ['Flare', '耀斑'], { c: '#a5d8ff', dy: 20, t: 0.6 }), obj: flare });
    ctx.label(pb.clone().multiplyScalar(R * 1.4), ['Prominence', '日珥'], { c: '#ff8fa3', t: 1.2 });
    ctx.label(new THREE.Vector3(R * 2.5, 0, R * 0.9), ['Solar wind', '太阳风'], { c: '#ffe8cc', t: 1.8 });
  }
  ctx.pickable(sun.spot, 'sunspot');
  ctx.pickable(prom, 'prominence');
  ctx.view([0, -1, 0.12], 17, [0, 0, 0], true);
  let sn = 130, lastY = -1;
  return {
    update(v, _dt, el) {
      if (cyc) {
        const y = yearOf(v);
        if (Math.abs(y - lastY) > 0.02) { lastY = y; sn = sunspotNumber(y); sun.setSpots(sn, cyclePhase(y)); }
      }
      sun.update(el);
      (prom.children as THREE.Mesh[]).forEach((m, i) => { const mm = m.material as THREE.MeshBasicMaterial | THREE.SpriteMaterial; mm.opacity = (0.3 + 0.12 * Math.sin(el * 0.7 + i * 1.7)) * ramp(el, 0.3, 1.2); });
      const t = el % 7, f = t < 0.3 ? t / 0.3 : Math.exp(-(t - 0.3) * 1.4);
      (f1.material as THREE.SpriteMaterial).opacity = f; (f2.material as THREE.SpriteMaterial).opacity = f * 0.8;
      f2.scale.setScalar(R * (0.6 + 0.6 * f));
      for (const x of ls) if (x.obj) x.l.on = facing(ctx, x.obj, O.set(0, 0, 0), new THREE.Vector3()) && (x.obj !== sun.spot || sun.groups > 0);
    },
    readout: cyc ? () => [`sunspot number ≈ ${Math.round(sn)}`, `太阳黑子数 ≈ ${Math.round(sn)}`] : undefined,
  };
}

function energyMode(ctx: Ctx): Run {
  const R = 1.8, S0 = new THREE.Vector3(-6.5, 0, 0), E = new THREE.Vector3(6.5, 0, 0), Re = 0.42;
  const sun = makeSun(R, 22, { low: ctx.low });
  sun.group.position.copy(S0);
  ctx.root.add(sun.group, sunLight([S0.x, S0.y, S0.z], 2.8, 0.05));
  // light in every direction
  const N = 140, pos = new Float32Array(N * 6), colr = new Float32Array(N * 6), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const z = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - z * z), a = i * ga, d = [r * Math.cos(a), r * Math.sin(a), z];
    for (let k = 0; k < 3; k++) { pos[i * 6 + k] = S0.getComponent(k) + d[k] * R * 1.25; pos[i * 6 + 3 + k] = S0.getComponent(k) + d[k] * R * 5.2; }
    colr.set([0.75, 0.6, 0.3, 0, 0, 0], i * 6);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rg.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const rays = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ctx.root.add(rays);
  const { spin } = earth(Re, 110, -90);
  spin.position.copy(E);
  const air = new THREE.Mesh(new THREE.SphereGeometry(Re * 1.04, 48, 24), rimMat('#74c0fc', 3, 0.9));
  air.position.copy(E);
  ctx.root.add(spin, air);
  // the beam that reaches the Earth, and photons along it
  for (const z of [-1, 0, 1]) ctx.root.add(line([[S0.x + R * 1.02, 0, z * R * 0.5], [E.x, 0, z * Re]], '#ffd24a', { opacity: 0.22 }));
  const NPH = ctx.low ? 30 : 70, Rn = rng(4), ph: number[] = [], off: [number, number][] = [];
  for (let i = 0; i < NPH; i++) { ph.push(Rn()); off.push([(Rn() - 0.5) * 2, (Rn() - 0.5) * 2]); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NPH * 3), 3));
  const photons = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffe066', size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  photons.frustumCulled = false;
  ctx.root.add(photons);
  ctx.label(new THREE.Vector3(S0.x, 0, R * 1.5), ['Sun', '太阳'], { c: '#ffd24a', big: true });
  ctx.label(new THREE.Vector3(E.x, 0, Re * 2.4), ['Earth', '地球'], { c: '#74c0fc', big: true, t: 0.4 });
  ctx.label(new THREE.Vector3(0, 0, 0.75), ['Solar radiation', '太阳辐射'], { c: '#ffe066', t: 0.9 });
  ctx.label(new THREE.Vector3(E.x, 0, -Re * 2.6), ['Earth gets ≈ 1/2 200 000 000 of it', '地球只得到约二十二亿分之一'], { t: 1.6 });
  ctx.label(new THREE.Vector3(E.x, 0, -Re * 2.6), ['≈ 1361 W/m² above the atmosphere', '大气上界约 1361 W/m²'], { t: 2.2, dy: 20, c: '#ffd8a8' });
  ctx.view([0, -1, 0.22], 17, [0, 0, 0], true);
  return {
    update(_v, _dt, el) {
      sun.update(el);
      spin.rotation.z = (-90 - 110) * D2R + el * 0.05;
      const a = pg.getAttribute('position') as THREE.BufferAttribute, x0 = S0.x + R * 1.05, x1 = E.x - Re * 0.9;
      for (let i = 0; i < NPH; i++) {
        const f = (ph[i] + el * 0.18) % 1, w = R * 0.5 * (1 - f) + Re * 0.8 * f;
        a.setXYZ(i, x0 + (x1 - x0) * f, off[i][0] * w * 0.6, off[i][1] * w);
      }
      a.needsUpdate = true;
      (rays.material as THREE.LineBasicMaterial).opacity = ramp(el, 0, 1.5);
    },
  };
}

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Hours from the flare until the CME's shock reaches Earth (fast CMEs take 1–3 days). */
const ARRIVE = 40;

function flareMode(ctx: Ctx): Run {
  const R = 2.2, SX = -8, E = new THREE.Vector3(7, 0, 0), Re = 0.55;
  const sun = makeSun(R, 24, { low: ctx.low });
  sun.group.position.set(SX, 0, 0);
  sun.setSpots(150, 0.4);
  ctx.root.add(sun.group, sunLight([SX, 0, 0], 2.6, 0.06));
  const { spin } = earth(Re, 110, -90);
  spin.position.copy(E);
  const air = new THREE.Mesh(new THREE.SphereGeometry(Re * 1.05, 48, 24), rimMat('#74c0fc', 3, 0.9));
  air.position.copy(E);
  ctx.root.add(spin, air);
  const mag = magneto(E, Re, { xa: SX + R * 1.05, xb: 14, width: 3.4, tail: 12, low: ctx.low });
  ctx.root.add(mag.group);
  // the flare, on the side facing Earth
  const fp = new THREE.Vector3(0.72, -0.55, 0.42).normalize().multiplyScalar(R * 1.02).add(sun.group.position);
  const f1 = glow('#ffffff', R * 0.45, 0), f2 = glow('#a5d8ff', R * 1.5, 0);
  f1.position.copy(fp); f2.position.copy(fp);
  ctx.root.add(f1, f2);
  // the CME: a glowing shell with a cloud of plasma inside
  const cme = new THREE.Group(), shellMat = rimMat('#ffa94d', 1.3, 1.0, { noise: 0.55 });
  const NC = ctx.low ? 160 : 380, cp = new Float32Array(NC * 3), Rn = rng(8);
  for (let i = 0; i < NC; i++) {
    const z = Rn() * 2 - 1, a = Rn() * Math.PI * 2, s = Math.sqrt(1 - z * z), r = 0.55 + 0.45 * Math.sqrt(Rn());
    cp.set([r * s * Math.cos(a), r * s * Math.sin(a), r * z], i * 3);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  const cpm = new THREE.PointsMaterial({ color: '#ffc078', size: 2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  cme.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), shellMat), new THREE.Points(cg, cpm));
  ctx.root.add(cme);
  ctx.pickable(cme, 'cme');
  const lFlare = ctx.label(fp, ['Flare: its light reaches Earth in 8 min', '耀斑：光约 8 分钟到达地球'], { c: '#a5d8ff', dy: -26 });
  ctx.label(new THREE.Vector3(SX, 0, -R * 1.35), ['Sun', '太阳'], { c: '#ffd24a', big: true });
  const lCme = ctx.label(cme, ['Coronal mass ejection', '日冕物质抛射'], { c: '#ffc078', dy: -12 });
  ctx.label(mag.nose, ['Bow shock', '弓形激波'], { c: '#a5d8ff', dx: -44, dy: -40, t: 1 });
  ctx.label(mag.top, ['Magnetosphere', '磁层'], { c: '#74c0fc', t: 1.4 });
  ctx.label(new THREE.Vector3(E.x, 0, -Re * 1.9), ['Earth', '地球'], { c: '#e9ecef', t: 0.6 });
  const lAur = ctx.label(new THREE.Vector3(E.x, 0, Re * 1.25), ['Aurora', '极光'], { c: '#69db7c', dx: 34 });
  ctx.view([0, -1, 0.3], 21, [2, 0, 0], true);
  const xs = SX + R, nose0 = E.x - 2.6 * Re;
  return {
    update(v, _dt, el) {
      sun.update(el);
      spin.rotation.z = (-90 - 110) * D2R + el * 0.04;
      const fI = v < 0.2 ? 1 : Math.exp(-(v - 0.2) / 2.5);
      (f1.material as THREE.SpriteMaterial).opacity = fI; (f2.material as THREE.SpriteMaterial).opacity = fI * 0.8;
      f2.scale.setScalar(R * (0.8 + 1.2 * fI));
      lFlare.on = v < 8;
      const xf = xs + ((nose0 - xs) * v) / ARRIVE, rc = 0.35 + (2.6 * Math.min(v, 52)) / ARRIVE;
      cme.position.set(xf - rc * 0.55, 0, 0);
      cme.scale.set(rc * 0.55, rc, rc);
      const a = clamp(v / 1.5) * (1 - smooth(46, 58, v));
      cme.visible = a > 0.01;
      shellMat.uniforms.uStr.value = a; shellMat.uniforms.uTime.value = el;
      cpm.opacity = 0.7 * a;
      lCme.on = a > 0.3;
      const S = smooth(ARRIVE - 3, ARRIVE + 2, v) * (1 - smooth(60, 72, v));
      mag.update(S, el);
      lAur.on = S > 0.4;
    },
    readout(v) {
      if (v < ARRIVE) { const d = Math.max(0, 150 * (1 - v / ARRIVE)); return [`CME ≈ ${Math.round(d)} million km from Earth`, `日冕物质抛射距地球约 ${Math.round(d / 10) / 10 || 0} 亿千米`]; }
      return v < 60 ? ['magnetic storm', '磁暴'] : ['the storm dies down', '磁暴减弱'];
    },
  };
}

/** A dipole field line in the north, from the ground (latitude `lam0`) up to radius `rmax` (in Re), round axis `C`. */
function footLine(C: THREE.Vector3, rad: THREE.Vector3, lam0: number, Re: number, rmax: number): THREE.Vector3[] {
  const L = 1 / Math.cos(lam0) ** 2, pts: THREE.Vector3[] = [];
  for (let lam = lam0; lam > 0; lam -= 0.02) {
    const r = L * Math.cos(lam) ** 2;
    if (r > rmax) break;
    pts.push(C.clone().multiplyScalar(r * Math.sin(lam) * Re).addScaledVector(rad, r * Math.cos(lam) * Re));
  }
  return pts;
}

function auroraMode(ctx: Ctx): Run {
  const Re = 2, sunW = new THREE.Vector3(-1, 0, 0.12).normalize();
  ctx.root.add(dirLight([sunW.x * 10, sunW.y * 10, sunW.z * 10], 2.3, 0.05));
  const { spin } = earth(Re, -95, 0);
  ctx.root.add(spin);
  const air = new THREE.Mesh(new THREE.SphereGeometry(Re * 1.025, 64, 32), rimMat('#4dabf7', 2.6, 0.9, { sun: sunW }));
  ctx.root.add(air);
  const rz = spin.rotation.z, anti = new THREE.Vector3(Math.cos(-rz), Math.sin(-rz), 0), C = llv(80.7, -72.7, 1);
  const oval = auroraOval(Re, C, anti, sunW, ctx.low);
  spin.add(oval.mesh);
  ctx.pickable(oval.mesh, 'aurora');
  const e1 = anti.clone().addScaledVector(C, -C.dot(anti)).normalize(), e2 = new THREE.Vector3().crossVectors(C, e1);
  for (let k = 0; k < 12; k++) {
    const az = (2 * Math.PI * k) / 12, rad = e1.clone().multiplyScalar(Math.cos(az)).addScaledVector(e2, Math.sin(az));
    const lam0 = (90 - 18 - 4.5 * Math.cos(az)) * D2R;
    spin.add(line(footLine(C, rad, lam0, Re, 2.3), '#74c0fc', { opacity: 0.2 }));
  }
  const from: [number, number, number] = [0.95, -0.42, 0.9], target: [number, number, number] = [0.6, 0, 1.25];
  ctx.view(from, 8.2, target, true);
  // label the part of the oval nearest the camera
  spin.updateMatrixWorld(true);
  const cam = new THREE.Vector3(...from).normalize();
  let best = 0, bd = -2;
  for (let i = 0; i < 72; i++) { const az = (2 * Math.PI * i) / 72, d = spin.localToWorld(oval.front(az, 0)).normalize().dot(cam); if (d > bd) { bd = d; best = az; } }
  ctx.label(spin.localToWorld(oval.front(best, 0.09)), ['Auroral oval', '极光带'], { c: '#69db7c', big: true, dy: -18, t: 1 });
  ctx.label(spin.localToWorld(oval.front(best + 0.7, 0.02)), ['Green: oxygen, ~100–200 km up', '绿光：氧原子，约 100–200 千米高'], { c: '#8ce99a', dy: 18, t: 1.8 });
  ctx.label(spin.localToWorld(oval.front(best - 0.7, 0.085)), ['Red: oxygen, higher up', '红光：更高处的氧原子'], { c: '#ffa8a8', dy: -14, t: 2.4 });
  ctx.label(spin.localToWorld(C.clone().multiplyScalar(Re * 1.02)), ['N magnetic pole', '北磁极'], { c: '#a5d8ff', t: 3 });
  return {
    update(_v, _dt, el) {
      oval.mat.uniforms.uT.value = el;
      oval.mat.uniforms.uI.value = 0.25 + 0.75 * ramp(el, 0.2, 2.5);
    },
  };
}

function effectsMode(ctx: Ctx): Run {
  const Re = 1.4, E = new THREE.Vector3(), sunW = new THREE.Vector3(-1, 0, 0);
  ctx.root.add(dirLight([-10, 0, 1], 2.4, 0.06));
  const { spin } = earth(Re, -72, -60);
  ctx.root.add(spin);
  const iono = new THREE.Mesh(new THREE.SphereGeometry(Re * 1.08, 64, 32), rimMat('#b197fc', 1.6, 1.1, { sun: sunW }));
  ctx.root.add(iono);
  const mag = magneto(E, Re, { xa: -10, xb: 10, width: 4.5, tail: 6.5, low: ctx.low });
  ctx.root.add(mag.group);
  // satellites on a tilted orbit
  const orbit = new THREE.Group();
  orbit.rotation.x = 55 * D2R;
  orbit.add(line(Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return [Re * 2.1 * Math.cos(a), Re * 2.1 * Math.sin(a), 0] as [number, number, number]; }), '#e9ecef', { opacity: 0.25 }));
  const sats = Array.from({ length: 5 }, (_, i) => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: '#e9ecef' })),
      new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: '#4dabf7' })), glow(i ? '#ffffff' : '#ff6b6b', i ? 0.25 : 0.5, 0.6));
    orbit.add(s);
    return s;
  });
  ctx.root.add(orbit);
  ctx.pickable(sats[0], 'satellite');
  const grid = new THREE.Object3D();
  grid.position.copy(llv(50, -72, Re * 1.01));
  const gGlow = glow('#ff922b', 0.35, 0.8);
  grid.add(gGlow);
  spin.add(grid);
  ctx.label(new THREE.Vector3(-Re * 0.95, 0, Re * 0.75), ['Shortwave radio blackout (day side)', '短波通信中断（白昼半球）'], { c: '#d0bfff', dx: -40, dy: -30, t: 0.6 });
  ctx.label(sats[0], ['Satellites and GPS disturbed', '卫星和导航定位受干扰'], { c: '#ff8787', dy: -20, t: 1.2 });
  ctx.label(grid, ['Power grids: 1989 Québec blackout', '电网：1989 年魁北克大停电'], { c: '#ffc078', dot: true, t: 1.8 });
  ctx.label(new THREE.Vector3(0, 0, Re * 1.3), ['Aurora', '极光'], { c: '#69db7c', dx: 36, t: 2.4 });
  ctx.label(mag.top, ['Magnetic storm', '磁暴'], { c: '#74c0fc', big: true, t: 0.2 });
  ctx.view([0, -1, 0.28], 15.5, [0.8, 0, 0], true);
  return {
    update(_v, _dt, el) {
      mag.update(0.85, el);
      sats.forEach((s, i) => { const a = el * 0.12 + (i * Math.PI * 2) / 5 - 1.2; s.position.set(Re * 2.1 * Math.cos(a), Re * 2.1 * Math.sin(a), 0); });
      (sats[0].children[2] as THREE.Sprite).material.opacity = 0.4 + 0.4 * Math.sin(el * 6);
      gGlow.material.opacity = 0.5 + 0.4 * Math.sin(el * 4.3);
    },
  };
}

const kit: KitFactory<Opts & { clock?: { unit: string } }> = (ctx, o) => {
  ctx.root.add(starfield(ctx.low ? 1200 : 2500));
  switch (o.mode) {
    case 'energy': return energyMode(ctx);
    case 'flare': return flareMode(ctx);
    case 'aurora': return auroraMode(ctx);
    case 'effects': return effectsMode(ctx);
    default: return layersMode(ctx, o);
  }
};
export default kit;
