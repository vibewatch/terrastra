/**
 * "How it works": each sky event's geometry as a small 3D model, in the ecliptic frame of date (z → ecliptic north).
 *
 * Two stages share one scene:
 * - local (Earth at the origin, unit = one Earth radius, the Moon's distance shrunk to 1/4): eclipses and phases, with
 *   the Moon's tilted orbit, the ecliptic plane and its nodes, shadow cones and a stream of sunlight;
 * - helio (the Sun at the origin, 1 AU = 10 units, bodies enlarged): planets with their orbits and lines of sight,
 *   Earth's tilted axis through the year, and a meteor shower's debris stream, whose orbit is worked out from the
 *   shower's radiant and speed (Geminids → a ≈ 1.4 AU, e ≈ 0.88, i ≈ 22°, like their parent Phaethon).
 *
 * Positions are real (from the same ephemerides as the rest of the theatre); only sizes and the Earth–Moon distance are
 * exaggerated, and the shading of Earth and Moon is computed from the drawn geometry so shadows match what is drawn.
 */
import * as THREE from 'three';
import { sunGeo, moonGeo, planetGeo, gast, obliquity, type PlanetId } from '../../shared/lib/astro/index.ts';
import { toEcef } from '../../shared/lib/astro/ephem.ts';
import type { MeteorShower } from '../../shared/data/showers.ts';
import { CONSTELLATIONS } from '../../shared/data/constellations.ts';
import { D2R, R_EARTH, R_MOON, R_SUN, R_SHADOW, bodyTexture, glowTexture } from './common.ts';
import { earthMaterial, moonMaterial, moonBasis } from './bodies.ts';
import { lang } from '../lib/i18n.ts';
import type { OrbitControls } from './controls.ts';

export type ModelKind = 'solar' | 'lunar' | 'phases' | 'seasons' | 'planets' | 'meteors';
export interface ModelSetup {
  kind: ModelKind;
  /** The event's moment (orbits are drawn around it). */
  t: number;
  planets?: PlanetId[];
  /** Draw lines of sight from Earth to these bodies (planets, or 'sun'). */
  sight?: string[];
  /** Mark the angle at Earth between the Sun and this planet. */
  arc?: PlanetId;
  /** Show perigee / apogee on the Moon's orbit. */
  apsides?: boolean;
  shower?: MeteorShower;
  lowfx?: boolean;
}

/** Scene units per AU (helio) and the Earth–Moon distance factor (local). */
const AUS = 10;
const KM = 1 / 4;
const AU_KM = 149_597_870.7;
const MU_SUN = 1.32712440018e11;
/** Angular radius of the Sun seen from Earth (mean), the half-angle of the shadow cones. */
const SUN_ANG = R_SUN / AU_KM;
/** Drawn cone half-angle: distances are shrunk by KM, so the taper is steepened by 1/KM and each shadow has its true size where it lands. */
const CONE_ANG = SUN_ANG / KM;
/** Drawn length of the Moon's penumbra cone (≈ the drawn Earth–Moon distance; stretched to it every frame). */
const PEN_L = 15;

const PLANET_LOOK: Record<PlanetId, { r: number; color: number; period: number }> = {
  mercury: { r: 0.13, color: 0xa39e97, period: 87.969 },
  venus: { r: 0.22, color: 0xe9d4a4, period: 224.701 },
  mars: { r: 0.17, color: 0xc8653e, period: 686.98 },
  jupiter: { r: 0.62, color: 0xd9b88f, period: 4332.59 },
  saturn: { r: 0.54, color: 0xe6d29e, period: 10759.22 },
  uranus: { r: 0.36, color: 0xa6dce4, period: 30688.5 },
  neptune: { r: 0.35, color: 0x5f86e3, period: 60182 },
};

const ecl = (lonDeg: number, latDeg: number, r: number, out = new THREE.Vector3()) => {
  const l = lonDeg * D2R, b = latDeg * D2R, cb = Math.cos(b);
  return out.set(r * cb * Math.cos(l), r * cb * Math.sin(l), r * Math.sin(b));
};
/** Earth's heliocentric position (AU). */
const earthHelio = (ms: number, out = new THREE.Vector3()) => { const s = sunGeo(ms); return ecl(s.lon, s.lat, -s.distKm / AU_KM, out); };
/** A planet's heliocentric position (AU). */
function planetHelio(id: PlanetId, ms: number, out = new THREE.Vector3()) {
  const p = planetGeo(id, ms);
  return ecl(p.lon, p.lat, p.distAu, out).add(earthHelio(ms));
}
/** The Moon relative to Earth (km). */
const moonRel = (ms: number, out = new THREE.Vector3()) => { const m = moonGeo(ms); return ecl(m.lon, m.lat, m.distKm, out); };

/** Translucent shadow cone that shows mostly its outline (a rim), so it never fogs the whole view. */
function coneMaterial(color: number, op: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: op } },
    vertexShader: /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vT;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  vT = uv.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor; uniform float uOp;
varying vec3 vN; varying vec3 vV; varying float vT;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
  float a = uOp * (0.18 + 0.82 * rim) * smoothstep(1.0, 0.75, 1.0 - vT);
  gl_FragColor = vec4(uColor * a, a);
}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/** A cone along +y from radius r0 (at y = 0) to r1 (at y = len); uv.y runs 0 → 1 from the base. */
function cone(r0: number, r1: number, len: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r1, r0, len, 72, 1, true);
  g.translate(0, len / 2, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i) / len);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  return m;
}

/** Frees the geometries and materials of a removed subtree (shared textures such as the glow map are kept). */
function disposeTree(o: THREE.Object3D): void {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
  });
}

function line(color: number, op: number, dashed = false): THREE.Line {
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: op, depthWrite: false, dashSize: 0.5, gapSize: 0.35 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false });
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1e-3)]), mat);
  l.frustumCulled = false;
  l.renderOrder = 2;
  return l;
}

function setLine(l: THREE.Line, pts: THREE.Vector3[]): void {
  const g = l.geometry, pa = g.attributes.position as THREE.BufferAttribute | undefined;
  if (pa && pa.count === pts.length) {
    pts.forEach((p, i) => pa.setXYZ(i, p.x, p.y, p.z));
    pa.needsUpdate = true;
    g.computeBoundingSphere();
  } else {
    // a different point count needs a new buffer: setFromPoints on the old one would cut the line short
    g.dispose();
    l.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
  if (l.material instanceof THREE.LineDashedMaterial) l.computeLineDistances();
}

/** `edge`: an off-stage body (the far Sun): kept on screen at the edge, with an arrow pointing to it. */
/** `r`: the body's radius: the label sits just below it on screen (above if negative), whatever the view angle. */
interface MLabel { el: HTMLElement; pos: THREE.Vector3; on: boolean; edge?: string; r?: number; hw?: number }

export class ModelScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 6000);
  readonly labelHost: HTMLElement;
  private setup: ModelSetup = { kind: 'phases', t: 0 };
  private time = 0;
  private eps = 23.44 * D2R;

  // shared
  private stars: THREE.Points;
  private earthHold = new THREE.Group();
  private tilt = new THREE.Group();
  private earth: THREE.Mesh<THREE.SphereGeometry, ReturnType<typeof earthMaterial>>;
  private axis: THREE.Line;
  private equator: THREE.LineLoop;
  private labels = new Map<string, MLabel>();
  private extra = new THREE.Group();

  // local stage
  private local = new THREE.Group();
  private moon: THREE.Mesh<THREE.SphereGeometry, ReturnType<typeof moonMaterial>>;
  private moonOrbit: THREE.Line;
  private eclPlane: THREE.Group;
  private farSun = new THREE.Group();
  private rays: THREE.Points;
  private rayData: Float32Array;
  private dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
  private orbitAt = NaN;
  private moonCones = new THREE.Group();
  private earthCones = new THREE.Group();
  private ghosts = new THREE.Group();
  private nodes: THREE.Vector3[] = [];

  // helio stage
  private helio = new THREE.Group();
  private sun: THREE.Group;
  private earthGlow: THREE.Sprite;
  /** Phase diagram moons: a crisp day / night split, the lit half always toward the Sun. */
  private ghostMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: /* glsl */ `varying vec3 vN; void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; varying vec3 vN;
void main() { float d = dot(normalize(vN), uSun); float lit = smoothstep(-0.04, 0.08, d); gl_FragColor = vec4(mix(vec3(0.07, 0.08, 0.1), vec3(0.86, 0.84, 0.8) * (0.75 + 0.25 * d), lit), 1.0); }`,
  });
  private earthOrbit: THREE.Line;
  private planets = new Map<PlanetId, THREE.Object3D>();
  private orbits = new THREE.Group();
  private sights = new Map<string, THREE.Line>();
  private arcLine: THREE.Line;
  private sunRay: THREE.Line;
  private seasonGhosts = new THREE.Group();
  private stream: { pts: THREE.Points; m0: Float32Array; off: Float32Array; a: number; e: number; n: number; P: THREE.Vector3; Q: THREE.Vector3; t: number } | null = null;
  private radLine: THREE.Line;

  /** Positions of this frame (scene units), for acts' captions and cameras. */
  readonly at = { earth: new THREE.Vector3(), moon: new THREE.Vector3(), sunDir: new THREE.Vector3(1, 0, 0), planets: new Map<string, THREE.Vector3>() };

  constructor() {
    this.labelHost = document.createElement('div');
    this.labelHost.className = 'sky-labels sky-mlabels';
    this.labelHost.setAttribute('aria-hidden', 'true');
    this.scene.add(this.camera);
    this.stars = this.starField();
    this.scene.add(this.stars);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.12));

    // ---- Earth: Earth-fixed mesh, spun by sidereal time inside an equator → ecliptic tilt
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), earthMaterial());
    this.earth.material.uniforms.uDay.value = new THREE.DataTexture(new Uint8Array([30, 60, 110, 255]), 1, 1);
    this.earth.material.uniforms.uDay.value.needsUpdate = true;
    bodyTexture('earth', 2048).then(t => { this.earth.material.uniforms.uDay.value = t; }).catch(() => {});
    this.earth.renderOrder = 1;
    this.tilt.add(this.earth);
    this.axis = line(0xe0f2fe, 0.85);
    setLine(this.axis, [new THREE.Vector3(0, 0, -1.65), new THREE.Vector3(0, 0, 1.65)]);
    this.tilt.add(this.axis);
    const eq: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; eq.push(new THREE.Vector3(Math.cos(a) * 1.015, Math.sin(a) * 1.015, 0)); }
    this.equator = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(eq), new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.6, depthWrite: false }));
    this.tilt.add(this.equator);
    this.earthHold.add(this.tilt);
    // seen from far (Sun-centred views) Earth is a few pixels: a blue glint keeps it visible
    this.earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7dd3fc, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    this.earthGlow.scale.setScalar(0.055);
    this.earthHold.add(this.earthGlow);
    this.scene.add(this.earthHold);

    // ---- local stage
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(R_MOON / R_EARTH, 64, 32), moonMaterial());
    this.moon.material.transparent = false;
    this.moon.material.blending = THREE.NormalBlending;
    this.moon.renderOrder = 1;
    bodyTexture('moon').then(t => { this.moon.material.uniforms.uMap.value = t; this.moon.material.uniforms.uReady.value = 1; }).catch(() => {});
    this.local.add(this.moon);
    this.moonOrbit = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.moonOrbit.frustumCulled = false;
    this.local.add(this.moonOrbit);
    this.eclPlane = this.planeGrid(19, 0x7dd3fc);
    this.local.add(this.eclPlane);
    const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1c9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunCore.scale.setScalar(26);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb547, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunHalo.scale.setScalar(90);
    this.farSun.add(sunHalo, sunCore);
    this.local.add(this.farSun);
    // sunlight: motes streaming from the Sun's side past Earth and the Moon
    const NR = 420;
    this.rayData = new Float32Array(NR * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < NR; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 22; this.rayData[i * 3] = Math.cos(a) * r; this.rayData[i * 3 + 1] = Math.sin(a) * r; this.rayData[i * 3 + 2] = rnd(); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NR * 3), 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NR * 3), 3));
    this.rays = new THREE.Points(rg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture() }));
    this.rays.frustumCulled = false;
    this.local.add(this.rays);
    this.local.add(this.dirLight, this.dirLight.target);
    this.local.add(this.moonCones, this.earthCones, this.ghosts);
    // the Moon's shadow: umbra converges, penumbra spreads (half-angle = the Sun's angular radius)
    const mr = R_MOON / R_EARTH;
    this.moonCones.add(cone(mr, 0, mr / CONE_ANG, coneMaterial(0xffb547, 0.6)), cone(mr, mr + PEN_L * CONE_ANG, PEN_L, coneMaterial(0x7dd3fc, 0.24)));
    // a faint halo so the small Moon can be found at a glance
    const mGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdbe7ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    mGlow.scale.setScalar(0.05);
    this.moon.add(mGlow);
    const EL = 22, er = R_SHADOW / R_EARTH;
    this.earthCones.add(cone(er, er - EL * CONE_ANG, EL, coneMaterial(0xff6a3a, 0.3)), cone(1, 1 + EL * CONE_ANG, EL, coneMaterial(0x7dd3fc, 0.16)));
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), this.ghostMat);
      this.ghosts.add(g);
    }
    this.scene.add(this.local);

    // ---- helio stage
    this.sun = new THREE.Group();
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main() { float mu = max(dot(normalize(vN), normalize(vV)), 0.0); float ld = 1.0 - 0.55 * (1.0 - mu) - 0.15 * (1.0 - mu) * (1.0 - mu); gl_FragColor = vec4(mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.93, 0.74), ld) * (0.75 + 0.45 * ld), 1.0); }`,
    }));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc46b, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunGlow.scale.setScalar(7.5);
    this.sun.add(sunBall, sunGlow);
    this.sun.scale.setScalar(0.7);
    this.helio.add(this.sun);
    const pl = new THREE.PointLight(0xffffff, 3.2, 0, 0);
    this.helio.add(pl);
    this.earthOrbit = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.55, depthWrite: false }));
    this.helio.add(this.earthOrbit, this.orbits, this.seasonGhosts);
    this.arcLine = line(0xffb547, 0.9);
    this.sunRay = line(0xffd27a, 0.9, true);
    this.radLine = line(0xfbbf24, 0.9, true);
    this.helio.add(this.arcLine, this.sunRay, this.radLine);
    this.scene.add(this.helio);
    this.scene.add(this.extra);
  }

  // ------------------------------------------------------------------------------------------------ building

  private starField(): THREE.Points {
    const pos: number[] = [], col: number[] = [], ce = Math.cos(this.eps), se = Math.sin(this.eps);
    const push = (x: number, y: number, z: number, b: number) => { pos.push(x * 3000, (y * ce + z * se) * 3000, (-y * se + z * ce) * 3000); col.push(b, b, b * 1.05); };
    for (const c of CONSTELLATIONS) for (const [ra, dec, m] of c.stars) {
      const cd = Math.cos(dec * D2R);
      push(cd * Math.cos(ra * D2R), cd * Math.sin(ra * D2R), Math.sin(dec * D2R), Math.max(0.15, Math.min(1, (5 - m) / 4.5)));
    }
    let seed = 11;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2200; i++) {
      const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      push(s * Math.cos(a), s * Math.sin(a), z, 0.08 + Math.pow(r(), 4) * 0.4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true }));
    p.frustumCulled = false;
    p.renderOrder = -1;
    return p;
  }

  /** A faint polar grid in the ecliptic plane (rings and spokes). */
  private planeGrid(R: number, color: number): THREE.Group {
    const g = new THREE.Group(), mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false });
    for (const r of [R * 0.25, R * 0.5, R * 0.75, R]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25, 0), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0)]), mat));
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
    g.add(disc);
    return g;
  }

  /** A pinned screen label (created once per key). */
  label(key: string, text: string, cls = ''): MLabel {
    let l = this.labels.get(key);
    if (!l) {
      const el = document.createElement('div');
      el.className = 'sky-lbl sky-mlbl ' + cls;
      el.appendChild(document.createElement('span'));
      this.labelHost.appendChild(el);
      l = { el, pos: new THREE.Vector3(), on: true };
      this.labels.set(key, l);
    }
    const sp = l.el.firstChild as HTMLElement;
    if (l.edge === undefined && sp.textContent !== text) sp.textContent = text;
    l.on = true;
    return l;
  }

  private pin(key: string, text: string, p: THREE.Vector3, cls = '', r?: number): void {
    const l = this.label(key, text, cls);
    l.pos.copy(p); l.r = r;
  }
  private unpin(key: string): void { const l = this.labels.get(key); if (l) l.on = false; }

  /** Stage a new event. */
  configure(setup: ModelSetup, names: Record<string, string>): void {
    this.setup = setup;
    this.names = names;
    for (const l of this.labels.values()) l.el.remove();
    this.labels.clear();
    this.orbitAt = NaN;
    this.eps = obliquity(setup.t) * D2R;
    this.tilt.rotation.set(-this.eps, 0, 0);
    const k = setup.kind, isLocal = k === 'solar' || k === 'lunar' || k === 'phases';
    this.local.visible = isLocal;
    this.helio.visible = !isLocal;
    this.moonCones.visible = k === 'solar';
    this.earthCones.visible = k === 'lunar';
    this.ghosts.visible = k === 'phases';
    this.eclPlane.visible = k !== 'phases';
    this.moon.scale.setScalar(k === 'phases' ? 2.2 : 1);
    this.axis.visible = k === 'seasons' || k === 'phases';
    this.equator.visible = k === 'seasons';
    this.earthHold.scale.setScalar(isLocal ? 1 : k === 'seasons' ? 1.1 : k === 'meteors' ? 0.55 : 0.32);
    this.earthGlow.visible = !isLocal && k !== 'seasons';
    this.earth.material.uniforms.uShadow.value = k === 'solar' ? 1 : 0;

    // helio: orbits of Earth and the planets involved
    for (const o of [...this.orbits.children]) { this.orbits.remove(o); disposeTree(o); }
    for (const p of this.planets.values()) { this.helio.remove(p); disposeTree(p); }
    this.planets.clear();
    for (const s of this.sights.values()) { this.helio.remove(s); disposeTree(s); }
    this.sights.clear();
    this.at.planets.clear();
    if (this.stream) { this.helio.remove(this.stream.pts); disposeTree(this.stream.pts); this.stream = null; }
    for (const c of [...this.seasonGhosts.children]) { this.seasonGhosts.remove(c); disposeTree(c); }
    if (!isLocal) {
      const ep: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) ep.push(earthHelio(setup.t + (i / 160 - 0.5) * 365.25 * 864e5).multiplyScalar(AUS));
      this.earthOrbit.geometry.dispose();
      this.earthOrbit.geometry = new THREE.BufferGeometry().setFromPoints(ep);
      for (const id of setup.planets ?? []) this.addPlanet(id, setup.t);
      for (const id of setup.sight ?? []) {
        const l = line(id === 'sun' ? 0xffd27a : 0x7dd3fc, 0.85, true);
        this.sights.set(id, l);
        this.helio.add(l);
      }
    }
    this.arcLine.visible = !!setup.arc;
    this.sunRay.visible = k === 'seasons';
    this.radLine.visible = k === 'meteors';
    if (k === 'seasons') this.buildSeasonGhosts();
    if (k === 'meteors' && setup.shower) this.buildStream(setup.shower, setup.t, !!setup.lowfx);
  }
  private names: Record<string, string> = {};
  private nm = (id: string) => this.names[id] ?? id;

  private addPlanet(id: PlanetId, t: number): void {
    const look = PLANET_LOOK[id];
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.85, metalness: 0 }));
    g.add(m);
    if (id === 'saturn') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.3, 96), new THREE.MeshBasicMaterial({ color: 0xd9c79a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      // ring plane ⟂ Saturn's pole (RA 40.6°, Dec 83.5°), in ecliptic coordinates
      const ra = 40.59 * D2R, de = 83.54 * D2R, x = Math.cos(de) * Math.cos(ra), y = Math.cos(de) * Math.sin(ra), z = Math.sin(de);
      const pole = new THREE.Vector3(x, y * Math.cos(this.eps) + z * Math.sin(this.eps), -y * Math.sin(this.eps) + z * Math.cos(this.eps));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pole);
      g.add(ring);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: look.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
    glow.scale.setScalar(0.035);
    g.add(glow);
    g.scale.setScalar(look.r);
    this.planets.set(id, g);
    this.helio.add(g);
    const pts: THREE.Vector3[] = [];
    const N = 200;
    for (let i = 0; i <= N; i++) pts.push(planetHelio(id, t + (i / N - 0.5) * look.period * 864e5).multiplyScalar(AUS));
    const o = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: look.color, transparent: true, opacity: 0.45, depthWrite: false }));
    this.orbits.add(o);
  }

  private buildSeasonGhosts(): void {
    const seasons = [['march', 0], ['june', 90], ['september', 180], ['december', 270]] as const;
    for (const [key, sunLon] of seasons) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), new THREE.MeshStandardMaterial({ color: 0x5d8fd6, roughness: 0.8, transparent: true, opacity: 0.8 }));
      const t = new THREE.Group();
      t.rotation.x = -this.eps;
      const ax = line(0xe0f2fe, 0.6);
      setLine(ax, [new THREE.Vector3(0, 0, -0.95), new THREE.Vector3(0, 0, 0.95)]);
      t.add(ax);
      g.add(ball, t);
      g.position.copy(ecl(sunLon + 180, 0, AUS));
      g.userData.key = key;
      this.seasonGhosts.add(g);
    }
  }

  /**
   * A meteor stream: the orbit that passes through Earth's position at the peak with the velocity implied by the
   * radiant (meteoroids arrive *from* it) and the entry speed, minus Earth's pull; dust spread around that orbit.
   */
  private buildStream(sh: MeteorShower, t: number, low: boolean): void {
    const r = earthHelio(t).multiplyScalar(AU_KM);
    const dt = 3600_000, vE = earthHelio(t + dt).sub(earthHelio(t - dt)).multiplyScalar(AU_KM / (2 * dt / 1000));
    const cd = Math.cos(sh.dec * D2R), x = cd * Math.cos(sh.ra * D2R), y = cd * Math.sin(sh.ra * D2R), z = Math.sin(sh.dec * D2R);
    const rad = new THREE.Vector3(x, y * Math.cos(this.eps) + z * Math.sin(this.eps), -y * Math.sin(this.eps) + z * Math.cos(this.eps));
    this.radDir = rad.clone();
    const vg = Math.sqrt(Math.max(1, sh.speedKms ** 2 - 11.2 ** 2));
    const v = vE.clone().addScaledVector(rad, -vg);
    const h = new THREE.Vector3().crossVectors(r, v), rl = r.length();
    const evec = new THREE.Vector3().crossVectors(v, h).divideScalar(MU_SUN).addScaledVector(r, -1 / rl);
    let e = evec.length();
    const p = h.lengthSq() / MU_SUN, q = p / (1 + e);
    // long-period parents (Thatcher, Halley…) come out (near-)parabolic: keep the perihelion, cap the size
    if (e > 0.97) e = 0.97;
    const a = q / (1 - e);
    const P = evec.clone().normalize(), W = h.clone().normalize(), Q = new THREE.Vector3().crossVectors(W, P);
    const n = Math.sqrt(MU_SUN / (a * a * a));
    // where Earth meets the stream: true → eccentric → mean anomaly
    const nu = Math.atan2(r.dot(Q), r.dot(P));
    const E0 = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    const M0 = E0 - e * Math.sin(E0);
    const N = low ? 1400 : 3200;
    const m0 = new Float32Array(N), off = new Float32Array(N * 3);
    let seed = 3;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
    for (let i = 0; i < N; i++) {
      m0[i] = i % 5 < 3 ? M0 + gauss() * 0.35 : rnd() * Math.PI * 2;
      off[i * 3] = gauss() * 0.035; off[i * 3 + 1] = gauss() * 0.035; off[i * 3 + 2] = gauss() * 0.02;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const b = 0.45 + rnd() * 0.55; col[i * 3] = b * 0.85; col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture() }));
    pts.frustumCulled = false;
    this.helio.add(pts);
    this.stream = { pts, m0, off, a, e, n, P, Q, t };
    // the stream's path
    const op: THREE.Vector3[] = [];
    const bb = a * Math.sqrt(1 - e * e);
    for (let i = 0; i <= 360; i++) {
      const E = (i / 360) * Math.PI * 2, pos = P.clone().multiplyScalar(a * (Math.cos(E) - e)).addScaledVector(Q, bb * Math.sin(E));
      if (pos.length() < 14 * AU_KM) op.push(pos.multiplyScalar(AUS / AU_KM)); else if (op.length && op[op.length - 1].x !== Infinity) op.push(new THREE.Vector3(Infinity, 0, 0));
    }
    const segs: THREE.Vector3[][] = [[]];
    for (const v3 of op) { if (v3.x === Infinity) segs.push([]); else segs[segs.length - 1].push(v3); }
    for (const sgm of segs) if (sgm.length > 1) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sgm), new THREE.LineBasicMaterial({ color: 0xa5b4fc, transparent: true, opacity: 0.35, depthWrite: false }));
      this.orbits.add(l);
    }
    this.streamInfo = { a: a / AU_KM, e, i: Math.acos(W.z) / D2R };
  }
  private radDir = new THREE.Vector3();
  /** Orbital elements of the meteor stream (AU, –, degrees). */
  streamInfo: { a: number; e: number; i: number } | null = null;

  // ------------------------------------------------------------------------------------------------ per frame

  update(ms: number, dt = 0): void {
    this.time += dt;
    const k = this.setup.kind, isLocal = k === 'solar' || k === 'lunar' || k === 'phases';
    const sg = sunGeo(ms), sunDir = ecl(sg.lon, sg.lat, 1), th = gast(ms);
    this.at.sunDir.copy(sunDir);
    this.earth.rotation.set(0, 0, th * D2R);
    const sunKm = sunDir.clone().multiplyScalar(sg.distKm);
    const sunE = toEcef(this.toEq(sunKm), th);
    const eu = this.earth.material.uniforms;
    eu.uSunRel.value.set(sunE[0], sunE[1], sunE[2]);
    if (isLocal) this.updateLocal(ms, sunDir, sunKm, th);
    else this.updateHelio(ms, sunDir);
    this.stars.position.copy(this.camera.position);
  }

  /** Ecliptic → equatorial. */
  private toEq(v: THREE.Vector3): [number, number, number] {
    const c = Math.cos(this.eps), s = Math.sin(this.eps);
    return [v.x, v.y * c - v.z * s, v.y * s + v.z * c];
  }

  private updateLocal(ms: number, sunDir: THREE.Vector3, sunKm: THREE.Vector3, th: number): void {
    const k = this.setup.kind;
    this.earthHold.position.set(0, 0, 0);
    this.at.earth.set(0, 0, 0);
    const mReal = moonRel(ms);
    const mDraw = mReal.clone().multiplyScalar(KM / R_EARTH);
    this.moon.position.copy(mDraw);
    this.at.moon.copy(mDraw);
    // shade with the real geometry: same directions as drawn, and shadows the size the cones show where they land
    const mKm = mReal;
    const mu = this.moon.material.uniforms;
    mu.uSunRel.value.copy(sunKm).sub(mKm);
    mu.uEarthRel.value.copy(mKm).negate();
    moonBasis(mu.uEarthRel.value, new THREE.Vector3(0, 0, 1), mu.uBasis.value);
    mu.uOcc.value = 1; mu.uEarthshine.value = 1; mu.uGain.value = 1.15;
    const mE = toEcef(this.toEq(mKm), th);
    this.earth.material.uniforms.uMoonRel.value.set(mE[0], mE[1], mE[2]);

    this.farSun.position.copy(sunDir).multiplyScalar(420);
    this.dirLight.position.copy(sunDir).multiplyScalar(100);
    this.moonCones.position.copy(mDraw);
    // the penumbra reaches Earth and stops there
    this.moonCones.children[1].scale.y = mDraw.length() / PEN_L;
    this.moonCones.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir.clone().negate());
    this.earthCones.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir.clone().negate());

    // sunlight motes, flowing away from the Sun
    const pa = this.rays.geometry.attributes.position as THREE.BufferAttribute, ca = this.rays.geometry.attributes.color as THREE.BufferAttribute;
    const u = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 0, 1)).normalize(), w = new THREE.Vector3().crossVectors(u, sunDir);
    const L = 60;
    for (let i = 0; i < pa.count; i++) {
      const f = (this.rayData[i * 3 + 2] + this.time * 0.09) % 1, along = (0.5 - f) * L + 12;
      const b = Math.sin(f * Math.PI) * 0.5;
      pa.setXYZ(i, sunDir.x * along + u.x * this.rayData[i * 3] + w.x * this.rayData[i * 3 + 1],
        sunDir.y * along + u.y * this.rayData[i * 3] + w.y * this.rayData[i * 3 + 1],
        sunDir.z * along + u.z * this.rayData[i * 3] + w.z * this.rayData[i * 3 + 1]);
      ca.setXYZ(i, b, b * 0.85, b * 0.55);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;

    // the Moon's orbit for ±15 days, brighter above the ecliptic than below; the nodes where it crosses
    if (!(Math.abs(ms - this.orbitAt) < 2 * 864e5)) {
      this.orbitAt = ms;
      const pts: THREE.Vector3[] = [], cols: number[] = [];
      this.nodes = [];
      let prev: THREE.Vector3 | null = null;
      for (let i = -160; i <= 160; i++) {
        const p = moonRel(ms + i * 0.1 * 864e5).multiplyScalar(KM / R_EARTH);
        pts.push(p);
        const up = p.z >= 0;
        cols.push(up ? 0.49 : 0.3, up ? 0.83 : 0.45, up ? 0.99 : 0.62);
        if (prev && (prev.z < 0) !== (p.z < 0)) {
          const f = prev.z / (prev.z - p.z);
          this.nodes.push(prev.clone().lerp(p, f));
        }
        prev = p;
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      this.moonOrbit.geometry.dispose();
      this.moonOrbit.geometry = g;
      this.apsides = null;
      if (this.setup.apsides) {
        let lo = Infinity, hi = 0, pLo = new THREE.Vector3(), pHi = new THREE.Vector3(), dLo = 0, dHi = 0;
        for (let i = -150; i <= 150; i++) {
          const m = moonGeo(ms + i * 0.1 * 864e5);
          if (m.distKm < lo) { lo = m.distKm; dLo = m.distKm; pLo = ecl(m.lon, m.lat, m.distKm * KM / R_EARTH); }
          if (m.distKm > hi) { hi = m.distKm; dHi = m.distKm; pHi = ecl(m.lon, m.lat, m.distKm * KM / R_EARTH); }
        }
        this.apsides = { lo: pLo, hi: pHi, dLo, dHi };
      }
    }

    // labels
    const zh = lang() === 'zh';
    this.pin('earth', this.nm('earth'), new THREE.Vector3(), 'm-earth', 1);
    this.pin('moon', this.nm('moon'), mDraw, 'm-moon', (R_MOON / R_EARTH) * this.moon.scale.x);
    this.pin('sun', this.nm('sun'), sunDir.clone().multiplyScalar(420), 'm-sun');
    this.labels.get('sun')!.edge = this.nm('sun');
    if (k !== 'phases') {
      this.nodes.slice(0, 2).forEach((p, i) => this.pin('node' + i, zh ? '交点' : 'node', p, 'm-node', -0.3));
      for (let i = this.nodes.length; i < 2; i++) this.unpin('node' + i);
    }
    if (k === 'solar') this.pin('shadow', zh ? '月影' : "Moon's shadow", mDraw.clone().lerp(new THREE.Vector3(), 0.55).add(new THREE.Vector3(0, 0, 0.9)), 'm-note');
    if (k === 'lunar') this.pin('shadow', zh ? '地球的影子' : "Earth's shadow", sunDir.clone().multiplyScalar(-9).add(new THREE.Vector3(0, 0, 1.6)), 'm-note');
    if (k === 'phases') {
      const flat = new THREE.Vector3(sunDir.x, sunDir.y, 0).normalize(), R = 384_400 * KM / R_EARTH;
      const names = zh ? ['新月', '上弦月', '满月', '下弦月'] : ['New', 'First quarter', 'Full', 'Last quarter'];
      this.ghostMat.uniforms.uSun.value.copy(sunDir);
      this.ghosts.children.forEach((g, i) => {
        const p = flat.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), (i * Math.PI) / 4).multiplyScalar(R);
        g.position.copy(p);
        g.visible = p.distanceTo(mDraw) > 2.2;
        if (i % 2 === 0) this.pin('ph' + i, names[i / 2], p.clone().multiplyScalar(1.13), 'm-note');
      });
      if (this.apsides) {
        const fmt = (d: number) => `${Math.round(d / 1000).toLocaleString()}${zh ? ' 千公里' : 'k km'}`;
        this.pin('peri', (zh ? '近地点 ' : 'perigee ') + fmt(this.apsides.dLo), this.apsides.lo, 'm-node');
        this.pin('apo', (zh ? '远地点 ' : 'apogee ') + fmt(this.apsides.dHi), this.apsides.hi, 'm-node');
      }
    }
  }
  private apsides: { lo: THREE.Vector3; hi: THREE.Vector3; dLo: number; dHi: number } | null = null;

  private updateHelio(ms: number, sunDir: THREE.Vector3): void {
    const k = this.setup.kind, zh = lang() === 'zh';
    const E = earthHelio(ms).multiplyScalar(AUS);
    this.earthHold.position.copy(E);
    this.at.earth.copy(E);
    this.earth.material.uniforms.uMoonRel.value.set(1e9, 0, 0);
    const es = this.earthHold.scale.x;
    this.pin('sun', this.nm('sun'), new THREE.Vector3(), 'm-sun', this.sun.scale.x);
    this.labels.get('sun')!.edge = undefined;
    this.pin('earth', this.nm('earth'), E, 'm-earth', es);
    for (const [id, g] of this.planets) {
      const p = planetHelio(id, ms).multiplyScalar(AUS);
      g.position.copy(p);
      this.at.planets.set(id, p);
      this.pin('p-' + id, this.nm(id), p, 'm-planet', g.scale.x);
    }
    for (const [id, l] of this.sights) {
      const tgt = id === 'sun' ? new THREE.Vector3() : this.at.planets.get(id);
      if (!tgt) continue;
      const far = tgt.clone().sub(E);
      setLine(l, [E, E.clone().addScaledVector(far, id === 'sun' ? 1 : 1.12)]);
    }
    if (this.setup.arc) {
      const P = this.at.planets.get(this.setup.arc);
      if (P) {
        const a = sunDir.clone(), b = P.clone().sub(E).normalize(), ang = a.angleTo(b), R = Math.min(4, P.distanceTo(E) * 0.45);
        const n = new THREE.Vector3().crossVectors(a, b).normalize(), pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 40; i++) pts.push(E.clone().addScaledVector(a.clone().applyAxisAngle(n, (ang * i) / 40), R));
        setLine(this.arcLine, pts);
        this.pin('arc', `${(ang / D2R).toFixed(0)}°`, E.clone().addScaledVector(a.clone().applyAxisAngle(n, ang / 2), R * 1.18), 'm-angle');
      }
    }
    if (k === 'seasons') {
      setLine(this.sunRay, [E.clone().addScaledVector(sunDir, E.length() - 0.8), E.clone().addScaledVector(sunDir, es * 1.02)]);
      const names: Record<string, [string, string]> = { march: ['春分', 'March equinox'], june: ['夏至', 'June solstice'], september: ['秋分', 'September equinox'], december: ['冬至', 'December solstice'] };
      for (const g of this.seasonGhosts.children) {
        const key = g.userData.key as string, near = g.position.distanceTo(E) < 2.2;
        g.visible = !near;
        this.pin('s-' + key, names[key][zh ? 0 : 1], g.position.clone().add(new THREE.Vector3(0, 0, near ? 2.2 : 1.3)), 'm-node');
      }
      // where the Sun is overhead
      this.pin('subsolar', zh ? '太阳直射点' : 'Sun overhead', E.clone().addScaledVector(sunDir, es * 1.02).add(new THREE.Vector3(0, 0, 0.35)), 'm-note');
    }
    if (this.stream) {
      const s = this.stream, pa = s.pts.geometry.attributes.position as THREE.BufferAttribute;
      const dts = (ms - s.t) / 1000, b = s.a * Math.sqrt(1 - s.e * s.e), k2 = AUS / AU_KM;
      for (let i = 0; i < s.m0.length; i++) {
        const M = s.m0[i] + s.n * dts;
        let Ea = M;
        for (let j = 0; j < 6; j++) Ea -= (Ea - s.e * Math.sin(Ea) - M) / (1 - s.e * Math.cos(Ea));
        const x = s.a * (Math.cos(Ea) - s.e), y = b * Math.sin(Ea), r = Math.hypot(x, y) * k2;
        pa.setXYZ(i,
          (s.P.x * x + s.Q.x * y) * k2 + s.off[i * 3] * r * 3, (s.P.y * x + s.Q.y * y) * k2 + s.off[i * 3 + 1] * r * 3, (s.P.z * x + s.Q.z * y) * k2 + s.off[i * 3 + 2] * r * 3);
      }
      pa.needsUpdate = true;
      setLine(this.radLine, [E, E.clone().addScaledVector(this.radDir, 3.2)]);
      this.pin('radiant', zh ? '辐射点方向' : 'toward the radiant', E.clone().addScaledVector(this.radDir, 3.5), 'm-angle');
      this.pin('stream', this.nm('stream'), this.streamLabelPos(E), 'm-note');
    }
  }

  private streamLabelPos(E: THREE.Vector3): THREE.Vector3 {
    const s = this.stream!, k2 = AUS / AU_KM, b = s.a * Math.sqrt(1 - s.e * s.e);
    // a point on the stream's path ~40° of eccentric anomaly before the crossing
    let best = E.clone(), bd = Infinity;
    for (let i = 0; i < 72; i++) {
      const Ea = (i / 72) * Math.PI * 2, p = s.P.clone().multiplyScalar(s.a * (Math.cos(Ea) - s.e) * k2).addScaledVector(s.Q, b * Math.sin(Ea) * k2);
      const d = Math.abs(p.distanceTo(E) - 6);
      if (d < bd && p.length() < 30) { bd = d; best = p; }
    }
    return best.add(new THREE.Vector3(0, 0, 0.6));
  }

  /** Frame the model for its kind at the event's moment. */
  aim(o: OrbitControls, ms: number, snap = true): void {
    this.update(ms);
    const k = this.setup.kind, z = new THREE.Vector3(0, 0, 1), sd = this.at.sunDir.clone();
    const side = new THREE.Vector3().crossVectors(sd, z).normalize();
    o.up.set(0, 0, 1);
    // portrait screens: back off so the scene still fits across
    const fit = Math.min(2.3, Math.max(1, 1.3 / this.camera.aspect));
    if (k === 'solar' || k === 'lunar') {
      o.target.copy(this.at.moon).multiplyScalar(k === 'solar' ? 0.5 : 0.45);
      o.minDist = 4; o.maxDist = 140;
      o.place(side.multiplyScalar(0.85).addScaledVector(sd, k === 'solar' ? 0.2 : 0.3).addScaledVector(z, 0.38), 26 * fit, snap);
    } else if (k === 'phases') {
      o.target.set(0, 0, 0); o.minDist = 6; o.maxDist = 160;
      o.place(z.clone().multiplyScalar(0.95).addScaledVector(sd, -0.3), 60 * fit, snap);
    } else if (k === 'seasons') {
      o.target.set(0, 0, 0); o.minDist = 3; o.maxDist = 200;
      const e = this.at.earth.clone().normalize();
      o.place(e.applyAxisAngle(z, -0.75).multiplyScalar(0.85).addScaledVector(z, 0.5), 33 * fit, snap);
    } else if (k === 'meteors') {
      o.target.copy(this.at.earth).multiplyScalar(0.55); o.minDist = 2; o.maxDist = 400;
      o.place(this.at.earth.clone().normalize().multiplyScalar(-0.35).addScaledVector(z, 0.8).addScaledVector(side, 0.3), 34 * fit, snap);
    } else {
      // Sun, Earth and the planets involved: frame their bounding box from above and a little aside
      const box = new THREE.Box3().expandByPoint(new THREE.Vector3()).expandByPoint(this.at.earth);
      for (const p of this.at.planets.values()) box.expandByPoint(p);
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
      o.target.copy(c); o.minDist = 2; o.maxDist = 800;
      const e = this.at.earth.clone().normalize();
      o.place(z.clone().multiplyScalar(0.85).addScaledVector(e, -0.25).addScaledVector(new THREE.Vector3().crossVectors(z, e), 0.3), Math.max(18, size * 2) * fit, snap);
    }
  }

  /** Pin labels to the screen (after the camera moved). */
  placeLabels(w: number, h: number, avoid: DOMRect[] = []): void {
    const v = new THREE.Vector3();
    const hidden = (x: number, y: number) => avoid.some(r => x > r.left && x < r.right && y > r.top && y < r.bottom);
    const placed: { x: number; y: number }[] = [];
    let edge: MLabel | null = null;
    this.camera.updateMatrixWorld();
    for (const l of this.labels.values()) {
      if (l.edge !== undefined && l.on) { edge = l; continue; }
      v.copy(l.pos).project(this.camera);
      const on = l.on && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      l.el.style.display = on ? '' : 'none';
      if (!on) continue;
      let dy = 0;
      if (l.r !== undefined) {
        const d = Math.max(1e-3, l.pos.distanceTo(this.camera.position));
        const px = Math.max(3, (Math.abs(l.r) / (d * Math.tan((this.camera.fov * D2R) / 2))) * (h / 2));
        dy = Math.sign(l.r) * (px + 11);
      }
      const px = ((v.x + 1) / 2) * w, py = ((1 - v.y) / 2) * h + dy;
      if (hidden(px, py)) { l.el.style.display = 'none'; continue; }
      placed.push({ x: px, y: py });
      l.el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
    }
    if (edge) {
      // an off-stage body (the far Sun): pinned inside the screen, with an arrow toward it
      const l = edge;
      v.copy(l.pos).project(this.camera);
      if (v.z > 1) v.multiplyScalar(-1); // behind the camera the projection flips
      const inside = Math.abs(v.x) < 0.86 && Math.abs(v.y) < 0.5;
      const k = inside ? 1 : 1 / Math.max(Math.abs(v.x) / 0.86, Math.abs(v.y) / 0.5, 1e-6);
      const x = v.x * k, y = v.y * k;
      const arrow = inside ? '' : Math.abs(x) * w > Math.abs(y) * h ? (x > 0 ? ' →' : '← ') : (y > 0 ? '↑ ' : '↓ ');
      const sp = l.el.firstChild as HTMLElement, txt = arrow === ' →' || arrow === '' ? l.edge + arrow : arrow + l.edge;
      if (sp.textContent !== txt) { sp.textContent = txt; l.hw = 0; }
      l.el.style.display = '';
      l.hw ||= sp.offsetWidth / 2;
      const px = Math.max(14 + l.hw!, Math.min(w - 14 - l.hw!, ((x + 1) / 2) * w));
      let py = ((1 - y) / 2) * h;
      // step aside from labels already there
      for (let i = 0; i < 4 && placed.some(p => Math.abs(p.x - px) < l.hw! + 40 && Math.abs(p.y - py) < 16); i++) py += 20;
      l.el.style.display = hidden(px, py) ? 'none' : '';
      l.el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
    }
  }

  render(r: THREE.WebGLRenderer): void { r.render(this.scene, this.camera); }

  dispose(): void {
    disposeTree(this.scene);
    this.labelHost.remove();
    this.labels.clear();
  }
}
