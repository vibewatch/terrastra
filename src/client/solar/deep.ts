/**
 * The scales above the Solar System, drawn by the Solar view's renderer: the Milky Way, the Local Group, the
 * Laniakea Supercluster and the observable universe. Each level is its own scene in galactic coordinates
 * (three.js (x, z, −y), so the galactic plane is XZ) with its own unit, built on first visit. Everything is additive
 * light on black, so levels cross-fade simply by scaling their brightness. See ADR-017.
 */
import { motion } from '../lib/classroom.ts';
import * as THREE from 'three';
import { textW, underUI } from '../ui/occluders.ts';
import { DEEP_OBJECTS, type DeepObject, type DeepScale, type DeepKind } from '../../shared/data/cosmos.ts';
import { galVec, NCP_GAL, eqToGal } from '../../shared/lib/sky.ts';
import { starColor, starClass } from '../../shared/data/nearby-stars.ts';
import { buildMilkyWay, MILKY_WAY_SPACE } from '../lib/milkyway.ts';
import type { Vec3 } from '../../shared/lib/orbits.ts';
import { tr } from '../../shared/data/types.ts';
import { lang, t } from '../lib/i18n.ts';
import { fmtLy } from './fmt.ts';
import type { Quality } from '../globe/quality.ts';
import { buildNebula, hasNebulaModel, paintNebulaArt, type NebulaModel } from './nebulae.ts';
import { buildGalaxyModel, galaxyExtentLy, hasGalaxyModel, paintGalaxyArt } from './galaxies.ts';
import { MILKY_WAY, genericSpiral, gauss, glowCanvas, hashStr, paintBlob, paintCMB, paintDisc, paintNebula, rng, sampleDisc, type DiscDef, type StarCloud } from './cosmos-paint.ts';
import { cssFont } from '../lib/fonts.ts';
import { warmShaders } from '../lib/gpu.ts';
import { KINDS, Transients, type TransientSource } from './transients.ts';

const D2R = Math.PI / 180;
/** Local Group: galaxies are drawn this many times their true size. */
const GROUP_EX = 2.4;
const TAU = Math.PI * 2;
/** Nebula close-ups (galaxy level, 1 unit = 1000 ly): model radius and the camera distance it is shown from. */
const NEB_R = 0.075;
/** Close-up camera distance, in model display radii. */
const MODEL_VIEW = 3.33;
/** Kinds that get a 3D galaxy / cluster / quasar model when picked (outside the Milky Way level). */
const GAL_KINDS: DeepKind[] = ['galaxy', 'dwarf', 'cluster', 'group', 'quasar', 'blackhole'];
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

interface LevelDef {
  /** Light-years per scene unit. */
  unit: number;
  /** Zooming in on the home spot below this distance (ly) goes down a scale; out past `upLy` goes up one. */
  downLy: number; upLy: number;
  /** Resting camera distance (ly) and elevation. */
  defLy: number; el: number;
}
export const LEVELS: Record<DeepScale, LevelDef> = {
  // The Sun's neighbourhood: 1 unit = 1 ly. In past the Oort Cloud's edge is the Solar System; out past ~400 ly, the Milky Way.
  stars: { unit: 1, downLy: 1.2, upLy: 420, defLy: 58, el: 0.5 },
  galaxy: { unit: 1e3, downLy: 260, upLy: 3.4e5, defLy: 1.25e5, el: 0.9 },
  group: { unit: 2e4, downLy: 2.3e5, upLy: 1.1e7, defLy: 6.2e6, el: 0.42 },
  laniakea: { unit: 1e6, downLy: 7e6, upLy: 1.6e9, defLy: 8.5e8, el: 0.5 },
  // We sit at the centre of our own observable universe: the camera stays inside the CMB shell (465 units), so it fills the sky.
  universe: { unit: 1e8, downLy: 1.1e9, upLy: 4.3e10, defLy: 3.3e10, el: 0.32 },
};
/** Distance (ly) from the Sun to the Galactic Centre (Sgr A*). */
const GC_LY = 26_670;
const CMB_R = 465;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Galactic (ly from the Sun) → three.js scene units for a level. */
function scenePos(l: number, b: number, distLy: number, lv: DeepScale, out = new THREE.Vector3()): THREE.Vector3 {
  const g = galVec(l, b, distLy), u = LEVELS[lv].unit;
  out.set(g[0], g[2], -g[1]).divideScalar(u);
  // The Milky Way and Local Group scenes are centred on the Galactic Centre.
  if (lv === 'galaxy' || lv === 'group') out.x -= GC_LY / u;
  return out;
}
const galToThree = (v: Vec3) => new THREE.Vector3(v[0], v[2], -v[1]);

const KIND_COLOR: Record<DeepKind, string> = {
  blackhole: '#ffb86b', arm: '#7dd3fc', bar: '#fcd9a0', region: '#fda4af', nebula: '#f9a8d4', remnant: '#fdba74', starcluster: '#93c5fd', globular: '#fde68a', star: '#fef3c7',
  galaxy: '#c4b5fd', dwarf: '#a5b4fc', group: '#a7f3d0', cluster: '#fcd34d', supercluster: '#fda4af', wall: '#f9a8d4', void: '#94a3b8',
  quasar: '#67e8f9', cmb: '#fca5a5', deepfield: '#e9d5ff',
};
const kindColor = (k: DeepKind) => KIND_COLOR[k] ?? '#e5e7eb';

/** Known disc orientations: position angle and inclination (deg), matched against the object's key. */
const ORIENT: [RegExp, number, number][] = [
  [/m31|andromeda_galaxy|andromeda$/, 38, 77], [/m33|triangulum/, 23, 54], [/lmc|large_magellanic/, 170, 34], [/m81|bode/, 157, 59],
  [/m101|pinwheel/, 39, 18], [/m51|whirlpool/, 163, 22], [/sombrero|m104/, 90, 84], [/centaurus_a|ngc_?5128/, 35, 70], [/m82|cigar/, 65, 80],
];

const POINT_VS = /* glsl */ `
attribute float aSize; attribute vec3 aColor;
uniform float uScale; uniform float uFade; uniform float uMinPx; uniform float uPr; uniform float uGain; uniform float uMaxPx;
uniform float uTime;
#ifdef FLOW
attribute vec3 aEnd; attribute float aPhase;
#endif
#ifdef ORBIT
// axis (unit) and angular speed (rad/s): the point turns about the object's origin (its host galaxy's centre)
attribute vec4 aOrbit;
#endif
varying vec3 vC;
void main() {
  vec3 p = position; float k = 1.0;
#ifdef FLOW
  float f = fract(uTime * 0.035 + aPhase);
  p = mix(position, aEnd, f * f * (3.0 - 2.0 * f) * 0.85 + f * 0.15);
  k = sin(3.14159 * f);
#endif
#ifdef ORBIT
  float oa = uTime * aOrbit.w, oc = cos(oa), os = sin(oa);
  p = p * oc + cross(aOrbit.xyz, p) * os + aOrbit.xyz * dot(aOrbit.xyz, p) * (1.0 - oc);
#endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
#ifdef SCREEN
  gl_PointSize = aSize * uPr;
#else
  float px = aSize * uScale / max(1e-6, -mv.z);
  float d = clamp(px / uMinPx, 0.0, 1.0);
  k *= d * d;
  // Big (close) sprites spread their light: dimmer per pixel, so a crowded disc doesn't burn out to white.
  k *= clamp(pow(2.2 * uPr / max(px, uMinPx), 1.6), 0.1, 1.0);
  gl_PointSize = clamp(px, uMinPx, uMaxPx * uPr);
#endif
#ifdef TWINKLE
  float h = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  k *= 0.72 + 0.28 * sin(uTime * (1.2 + 2.6 * h) + h * 60.0);
#endif
  vC = aColor * uFade * uGain * k;
}`;
const POINT_FS = /* glsl */ `
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-dot(d, d) * 14.0) - 0.03;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vC * a, 1.0);
  #include <colorspace_fragment>
}`;
const CMB_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CMB_FS = /* glsl */ `
uniform sampler2D uMap; uniform float uFade; uniform float uR;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  float mu = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
  float inside = step(length(cameraPosition), uR);
  // From inside (where we really are) the CMB is the infinitely distant sky: sample by view direction, not by the shell.
  vec3 d = normalize(vW - cameraPosition);
  vec2 uv = inside > 0.5 ? vec2(atan(d.z, d.x) * 0.1591549 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.3183099 + 0.5) : vUv;
  float a = mix(0.02 + 0.3 * pow(1.0 - mu, 3.0), 0.045, inside);
  vec3 t = texture2D(uMap, uv).rgb;
  // seen from inside, wash the false-colour map toward the deep-space blue-violet so it reads as a sky, not a poster
  t = mix(t, dot(t, vec3(0.3, 0.59, 0.11)) * vec3(0.55, 0.6, 1.3), 0.85 * inside);
  gl_FragColor = vec4(t * a * uFade, 1.0);
  #include <colorspace_fragment>
}`;

interface ObjRT { o: DeepObject; pos: THREE.Vector3; label: HTMLButtonElement; rank: number }
interface LevelRT {
  id: DeepScale;
  /** Background shader compile: pending until linked, then 'ready'. */
  warm?: Promise<void> | 'ready';
  def: LevelDef;
  scene: THREE.Scene;
  labels: HTMLDivElement;
  objs: ObjRT[];
  homeLabel: HTMLButtonElement;
  home: THREE.Vector3;
  defTarget: THREE.Vector3;
  target: THREE.Vector3;
  dist: number;
  tween: { t: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromD: number; toD: number } | null;
  /** Point materials (fade + scale uniforms) and other materials with a base opacity. */
  pts: THREE.ShaderMaterial[];
  fades: [THREE.Material & { opacity: number }, number][];
  cmb?: THREE.ShaderMaterial;
  w: number;
  /** Everything that turns with the level's own rotation (galaxy level: the whole Milky Way about its centre). */
  root: THREE.Group;
  /** rad/s about +y for `root` (positions, home and camera target are carried along). */
  spin: number;
  /** Accumulated `spin` (rad). */
  angle: number;
  /** Objects spinning about their own local y (galaxy discs about their normals), rad/s. */
  spinners: [THREE.Object3D, number][];
  /** Re-painters of in-scene text tags (run on language change). */
  texts: (() => void)[];
  pulse?: THREE.Sprite;
  /** Supernovae, novae, flares, bursts: brief flashes at their real relative rates. */
  events?: Transients;
  /** Sprites whose brightness wanders (quasars): material, seed. */
  flicker: [THREE.SpriteMaterial, number][];
  /** A sky sphere (the Milky Way's glow) kept centred on the camera. */
  sky?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
}

interface DeepEvents {
  onSelect?: (o: DeepObject | null) => void;
  /** Zoomed in on the home spot (go down one scale) / out past the level (go up one). */
  onDown?: () => void;
  onUp?: () => void;
}

const HOME_KEY: Record<DeepScale, RegExp> = {
  stars: /^$/,
  galaxy: /^$/,
  group: /milky_way|milkyway/,
  laniakea: /local_group/,
  universe: /laniakea/,
};

export class DeepStage {
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  private levels = new Map<DeepScale, LevelRT>();
  private layer: HTMLDivElement;
  level: DeepScale = 'galaxy';
  sel: DeepObject | null = null;
  az = 0.6; el = 0.6;
  private time = 0;
  private mwCloud: StarCloud | null = null;
  private mwTex: THREE.CanvasTexture | null = null;
  private screen = { w: 1, h: 1, pr: 1 };
  private placed: { o: DeepObject | 'home'; x: number; y: number }[] = [];
  /** The 3D close-up model of the picked object (a nebula in the Milky Way; a galaxy, cluster or quasar further out). */
  private model: { key: string; L: LevelRT; m: NebulaModel; a: number; R: number } | null = null;
  /** The stand-in visuals of an object (painted disc, star swarm, blob) that give way to its model. */
  private stand = new Map<string, THREE.Material[]>();
  private tweenAz: { from: number; to: number; t: number } | null = null;

  /** While the Messier list is open its objects are labelled first. */
  boostMessier = false;
  /** The light-year meter: a dashed line between two objects (or `'home'`) of one level. */
  readonly meterLabel = document.createElement('span');
  private meas: { L: LevelRT; a: string; b: string; line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial> } | null = null;

  constructor(root: HTMLElement, readonly quality: Quality, public ev: DeepEvents) {
    this.layer = document.createElement('div');
    this.layer.className = 'deep-labels';
    this.meterLabel.className = 'meter-label';
    this.meterLabel.dataset.testid = 'deep-meter-label';
    this.meterLabel.hidden = true;
    this.layer.append(this.meterLabel);
    root.append(this.layer);
  }

  /** Draws the light-year meter on the active level (null removes it). */
  setMeasure(pair: [string, string] | null): void {
    if (this.meas) {
      this.meas.L.scene.remove(this.meas.line);
      this.meas.line.geometry.dispose();
      this.meas.line.material.dispose();
      this.meas = null;
    }
    this.meterLabel.hidden = true;
    if (!pair || pair[0] === pair[1]) return;
    const L = this.current;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, dashSize: 1, gapSize: 0.6 }));
    line.frustumCulled = false;
    line.renderOrder = 50;
    L.scene.add(line);
    this.meas = { L, a: pair[0], b: pair[1], line };
  }

  /** Keeps the meter line on its two (turning) ends and its label over the visible middle. */
  private updateMeasure(L: LevelRT): void {
    const m = this.meas;
    if (!m || m.L !== L) { this.meterLabel.hidden = true; return; }
    const at = (k: string) => (k === 'home' ? L.home : L.objs.find(x => x.o.key === k)?.pos);
    const p0 = at(m.a), p1 = at(m.b);
    if (!p0 || !p1) { this.meterLabel.hidden = true; return; }
    const pos = m.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, p0.x, p0.y, p0.z);
    pos.setXYZ(1, p1.x, p1.y, p1.z);
    pos.needsUpdate = true;
    m.line.computeLineDistances();
    const span = Math.max(1e-4, Math.min(p0.distanceTo(p1), L.dist * 0.8));
    m.line.material.dashSize = span / 24;
    m.line.material.gapSize = span / 40;
    const W = this.screen.w, H = this.screen.h, q = new THREE.Vector3(), N = 64;
    let lo = -1, hi = -1;
    for (let i = 0; i <= N; i++) {
      q.copy(p0).lerp(p1, i / N).project(this.camera);
      if (q.z < 1 && q.z > -1 && Math.abs(q.x) < 0.9 && Math.abs(q.y) < 0.9) { if (lo < 0) lo = i; hi = i; }
    }
    const show = lo >= 0 && Boolean(this.meterLabel.textContent);
    this.meterLabel.hidden = !show;
    if (!show) return;
    q.copy(p0).lerp(p1, (lo + hi) / 2 / N).project(this.camera);
    this.meterLabel.style.transform = `translate(${((q.x + 1) / 2 * W).toFixed(1)}px, ${((1 - q.y) / 2 * H).toFixed(1)}px) translate(-50%, -130%)`;
  }

  /** How far the Milky Way has turned (rad about +y): camera angles in galactic coordinates are relative to it. */
  get galSpin(): number { return this.levels.get('galaxy')?.angle ?? 0; }

  /** How far the current level's camera sits from its target, in light-years (≈ the width of the view). */
  spanLy(): number {
    const L = this.levels.get(this.level);
    return L ? L.dist * L.def.unit : 0;
  }

  private get n(): number { return this.quality.tier === 'high' ? 1 : this.quality.tier === 'medium' ? 0.42 : 0.28; }

  // ---------- building ----------
  private ensure(id: DeepScale): LevelRT {
    let L = this.levels.get(id);
    if (L) return L;
    const labels = document.createElement('div');
    labels.className = 'deep-level';
    labels.hidden = true;
    this.layer.append(labels);
    const homeLabel = document.createElement('button');
    homeLabel.className = 'dl-label home';
    homeLabel.dataset.testid = 'deep-home';
    homeLabel.hidden = true;
    homeLabel.onclick = () => this.ev.onDown?.();
    labels.append(homeLabel);
    L = { id, def: LEVELS[id], scene: new THREE.Scene(), labels, objs: [], homeLabel, home: new THREE.Vector3(), defTarget: new THREE.Vector3(),
      target: new THREE.Vector3(), dist: LEVELS[id].defLy / LEVELS[id].unit, tween: null, pts: [], fades: [], w: 0, root: new THREE.Group(), spin: 0, angle: 0, spinners: [], texts: [], flicker: [] };
    L.scene.add(L.root);
    this.levels.set(id, L);
    if (id === 'stars') this.buildStars(L);
    else if (id === 'galaxy') this.buildGalaxy(L);
    else if (id === 'group') this.buildGroup(L);
    else if (id === 'laniakea') this.buildLaniakea(L);
    else this.buildUniverse(L);
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== id || HOME_KEY[id].test(o.key)) continue;
      const label = document.createElement('button');
      label.className = 'dl-label k-' + o.kind;
      label.dataset.testid = o.key;
      label.style.setProperty('--c', kindColor(o.kind));
      label.innerHTML = '<i></i><span></span>';
      label.hidden = true;
      label.onclick = () => this.select(o);
      labels.append(label);
      L.objs.push({ o, pos: scenePos(o.l, o.b, o.distLy, id), label, rank: o.rank ?? 1 });
    }
    this.addMarkers(L);
    L.target.copy(L.defTarget);
    this.relabel();
    return L;
  }

  private pointsMat(L: LevelRT, defines: Record<string, string> = {}): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uFade: { value: 1 }, uMinPx: { value: 1.4 }, uPr: { value: 1 }, uGain: { value: 1 }, uMaxPx: { value: this.quality.tier === 'high' ? 40 : 22 }, uTime: { value: 0 } },
      vertexShader: POINT_VS, fragmentShader: POINT_FS, defines,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    L.pts.push(m);
    return m;
  }

  private points(L: LevelRT, pos: Float32Array, col: Float32Array, size: Float32Array, n = size.length, defines: Record<string, string> = {}, extra?: (g: THREE.BufferGeometry) => void): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size.subarray(0, n), 1));
    extra?.(g);
    const p = new THREE.Points(g, this.pointsMat(L, defines));
    p.frustumCulled = false;
    L.root.add(p);
    return p;
  }

  /** Per-point orbit (axis ⟂ position, ω from a flat rotation curve: v/r). `share` points move together (a knot). */
  private static orbits(pos: Float32Array, n: number, w0: number, r: () => number, share = 1, axis?: (i: number, v: THREE.Vector3) => THREE.Vector3 | null): Float32Array {
    const o = new Float32Array(n * 4), v = new THREE.Vector3(), a = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < n; i += share) {
      v.fromArray(pos, i * 3);
      const d = Math.max(1e-3, v.length()), fixed = axis?.(i, v);
      if (fixed) a.copy(fixed);
      else {
        a.crossVectors(v, q.set(gauss(r), gauss(r), gauss(r))).normalize();
        if (r() < 0.5) a.negate(); // halo orbits have no common sense of rotation
      }
      const w = w0 / d;
      for (let k = i; k < Math.min(n, i + share); k++) o.set([a.x, a.y, a.z, w], k * 4);
    }
    return o;
  }

  private fadeMat<M extends THREE.Material & { opacity: number }>(L: LevelRT, m: M): M { L.fades.push([m, m.opacity]); return m; }

  /** Glowing textured disc (a galaxy seen in 3D) lying in the plane with the given normal. */
  private disc(L: LevelRT, tex: THREE.Texture, size: number, at: THREE.Vector3, normal: THREE.Vector3, opacity: number, spin = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      this.fadeMat(L, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide })));
    m.position.copy(at);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
    m.rotateY(spin);
    L.root.add(m);
    return m;
  }

  private sprite(L: LevelRT, tex: THREE.Texture, size: number, at: THREE.Vector3, color: string | number, opacity: number): THREE.Sprite {
    const s = new THREE.Sprite(this.fadeMat(L, new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })));
    s.position.copy(at);
    s.scale.setScalar(size);
    L.root.add(s);
    return s;
  }

  private milkyWay(): { cloud: StarCloud; tex: THREE.CanvasTexture } {
    if (!this.mwCloud) {
      this.mwCloud = sampleDisc(MILKY_WAY, Math.round(90_000 * this.n), 42, 0.42);
      const S = this.quality.tier === 'low' ? 256 : 512;
      this.mwTex = new THREE.CanvasTexture(paintDisc(MILKY_WAY, this.mwCloud, S, 1.1));
      this.mwTex.colorSpace = THREE.SRGBColorSpace;
    }
    return { cloud: this.mwCloud, tex: this.mwTex! };
  }

  /** Disc → three (x, z, −y) in place, scaled. */
  private static discToThree(c: StarCloud, k: number): Float32Array {
    const out = new Float32Array(c.n * 3);
    for (let i = 0; i < c.n; i++) { out[i * 3] = c.pos[i * 3] * k; out[i * 3 + 1] = c.pos[i * 3 + 2] * k; out[i * 3 + 2] = -c.pos[i * 3 + 1] * k; }
    return out;
  }

  /**
   * The Sun's neighbourhood, Sun at the centre, 1 unit = 1 light-year: the real nearest stars in their colours (sized
   * roughly by brightness), each on a stalk down to the galactic plane like a 3D star chart, distance rings, faint
   * field stars around and the Milky Way's glow behind, as it looks from here.
   */
  private buildStars(L: LevelRT): void {
    const r = rng(23), glow = new THREE.CanvasTexture(glowCanvas());
    L.home.set(0, 0, 0);
    L.defTarget.set(0, 0, 0);
    // the Sun, and the Oort Cloud: a faint swarm of comets out to ~1.6 ly
    this.sprite(L, glow, 1.1, L.home, '#fff1d8', 0.95);
    const no = Math.round(1400 * this.n), op = new Float32Array(no * 3), oc = new Float32Array(no * 3), os = new Float32Array(no);
    for (let i = 0; i < no; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(0.25 + 1.35 * Math.cbrt(r()));
      op.set([v.x, v.y, v.z], i * 3);
      oc.set([0.32, 0.42, 0.55], i * 3);
      os[i] = 0.02;
    }
    maxPx(this.points(L, op, oc, os, no), 2.5);
    this.text(L, () => t('oortCloud'), new THREE.Vector3(0, 1.9, 0), 0.32);
    // the named stars: a glow whose size follows the kind of star, a stalk to the plane and a little foot ring
    const stalk: number[] = [], feet: number[] = [];
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== 'stars') continue;
      const at = scenePos(o.l, o.b, o.distLy, 'stars'), k = starClass(o.spec ?? 'G');
      const size = { red_dwarf: 0.55, brown_dwarf: 0.4, white_dwarf: 0.45, orange_dwarf: 0.8, yellow_dwarf: 1, white_star: 1.4, blue_star: 1.8, giant: 2.2 }[k];
      this.sprite(L, glow, size, at, starColor(o.spec ?? 'G'), 0.9);
      stalk.push(at.x, at.y, at.z, at.x, 0, at.z);
      const rr = 0.35;
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
        feet.push(at.x + Math.cos(a0) * rr, 0, at.z + Math.sin(a0) * rr, at.x + Math.cos(a1) * rr, 0, at.z + Math.sin(a1) * rr);
      }
    }
    for (const [arr, op2] of [[stalk, 0.28], [feet, 0.32]] as const) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      L.root.add(new THREE.LineSegments(g, this.fadeMat(L, new THREE.LineBasicMaterial({ color: '#9ad8ff', transparent: true, opacity: op2, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))));
    }
    this.distanceRings(L, [10, 20, 30, 40, 50, 60, 70], [1.6, 70], d => 0.4 + d * 0.022);
    // which way the Galactic Centre is (l = 0: +x)
    const arrow = [72, 0, 0, 84, 0, 0, 84, 0, 0, 81, 0, 1.4, 84, 0, 0, 81, 0, -1.4];
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(arrow, 3));
    L.root.add(new THREE.LineSegments(ag, this.fadeMat(L, new THREE.LineBasicMaterial({ color: '#ffd59a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))));
    this.text(L, () => t('towardGC'), new THREE.Vector3(80, 2.2, 0), 1.8);
    // field stars: the thousands of unnamed neighbours (mostly dim red dwarfs), thinning out with distance
    const nf = Math.round(5000 * this.n), fp = new Float32Array(nf * 3), fc = new Float32Array(nf * 3), fs = new Float32Array(nf);
    for (let i = 0; i < nf; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(16 + 380 * Math.pow(r(), 0.75));
      v.y *= 0.75;
      fp.set([v.x, v.y, v.z], i * 3);
      const u = r(), f = 0.35 + r() * 0.5;
      const cc = u < 0.7 ? [1, 0.7, 0.45] : u < 0.85 ? [1, 0.85, 0.65] : u < 0.95 ? [1, 0.96, 0.88] : [0.8, 0.88, 1];
      fc.set([cc[0] * f, cc[1] * f, cc[2] * f], i * 3);
      fs[i] = 0.35 + r() * 0.5;
    }
    maxPx(gain(this.points(L, fp, fc, fs, nf, { TWINKLE: '' }), 0.8), 3);
    L.sky = buildMilkyWay((x, y, z, out) => { const g = eqToGal([x, y, z]); return out.set(g[0], g[2], -g[1]); }, 3000);
    L.sky.renderOrder = -1001;
    L.scene.add(L.sky);
  }

  private buildGalaxy(L: LevelRT): void {
    const { cloud, tex } = this.milkyWay();
    this.disc(L, tex, MILKY_WAY.R * 2, new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.27);
    maxPx(gain(this.points(L, DeepStage.discToThree(cloud, 1), cloud.col, cloud.size, cloud.n, { TWINKLE: '' }), 0.18), 10);
    // The whole Galaxy turns about its centre (clockwise seen from the north, the Sun heading for l = 90°);
    // sped up enormously: one turn every ~9 minutes instead of 230 million years.
    L.spin = -0.012;
    // Halo: old globular clusters and faint halo stars
    const r = rng(9), nh = Math.round(2400 * this.n);
    const hp = new Float32Array(nh * 3), hc = new Float32Array(nh * 3), hs = new Float32Array(nh);
    for (let i = 0; i < nh; i++) {
      const R = 6 + Math.abs(gauss(r)) * 32, th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1);
      hp.set([R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph) * 0.8, R * Math.sin(ph) * Math.sin(th)], i * 3);
      const glob = i % 12 === 0;
      hc.set(glob ? [1, 0.85, 0.55] : [0.5, 0.48, 0.45], i * 3);
      hs[i] = glob ? 0.9 : 0.35;
    }
    // Halo stars and globular clusters don't share the disc's turn: each swings round the centre on its own tilted
    // orbit (the Sun's 230 Myr turn at r = 26 sets the pace; flat rotation curve, so ω ∝ 1/r).
    const ho = DeepStage.orbits(hp, nh, Math.abs(L.spin) * 26, r);
    for (let i = 0; i < nh; i++) ho[i * 4 + 3] = Math.min(ho[i * 4 + 3], 0.03);
    L.scene.add(maxPx(this.points(L, hp, hc, hs, nh, { TWINKLE: '', ORBIT: '' }, g => g.setAttribute('aOrbit', new THREE.BufferAttribute(ho, 4))), 5));
    // the same deep-space dress as the Local Group: dark-matter halo glow, faint gas, radar rings, far galaxies
    this.sprite(L, new THREE.CanvasTexture(haloCanvas()), 2 * 1.3e5 / L.def.unit, new THREE.Vector3(), '#5b7cff', 0.32);
    this.gas(L, [
      [new THREE.Vector3(-70, -45, 60), 260, ['#3049b8', '#6a2fa0'], 0.16],
      [new THREE.Vector3(80, 50, -70), 220, ['#2a6fb0', '#7a3fb0'], 0.12],
    ], 400);
    this.distanceRings(L, [1e4, 2e4, 3e4, 4e4, 5e4], [3, 62], 2.6);
    this.backdrop(L, 1800, 900, 0.9);
    const sun = scenePos(0, 0, 0, 'galaxy');
    L.home.copy(sun);
    L.defTarget.set(0, 0, 0);
    // "You are here" glow around the Sun
    this.sprite(L, new THREE.CanvasTexture(glowCanvas()), 1.6, sun, '#ffe9a8', 0.9);
    // Sgr A*: a softly breathing glow at the very centre
    L.pulse = this.sprite(L, new THREE.CanvasTexture(glowCanvas()), 2.4, new THREE.Vector3(), '#ffb86b', 0.6);
    // Nebulae glow pink, remnants orange: a soft sprite under their markers
    const glow = new THREE.CanvasTexture(glowCanvas());
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== 'galaxy' || (o.kind !== 'nebula' && o.kind !== 'remnant' && o.kind !== 'starcluster')) continue;
      this.stand.set(o.key, [this.sprite(L, glow, Math.max(0.35, Math.min(1.6, (o.sizeLy ?? 100) / 120)), scenePos(o.l, o.b, o.distLy, 'galaxy'), kindColor(o.kind), 0.5).material]);
    }
    // Core-collapse supernovae go off among young blue stars in the arms; white-dwarf (Ia) ones anywhere in the disc;
    // novae crowd the old bulge. Real rates ~2 SNe per century vs ~50 novae a year: novae are far more frequent.
    const P = DeepStage.discToThree(cloud, 1), young: number[] = [], bulge: number[] = [];
    for (let i = 0; i < cloud.n; i++) {
      if (cloud.col[i * 3 + 2] > cloud.col[i * 3] * 1.08) young.push(i);
      if (Math.hypot(P[i * 3], P[i * 3 + 2]) < MILKY_WAY.R * 0.3) bulge.push(i);
    }
    const star = (list: number[] | null) => () => {
      const i = list?.length ? list[Math.floor(Math.random() * list.length)] : Math.floor(Math.random() * cloud.n);
      return new THREE.Vector3().fromArray(P, i * 3);
    };
    this.addEvents(L, [
      { kind: KINDS.snII, site: star(young), every: 20 },
      { kind: KINDS.snIa, site: star(null), every: 38 },
      { kind: KINDS.nova, site: star(bulge.length ? bulge : null), every: 7 },
      { kind: KINDS.sgrA, site: () => new THREE.Vector3(), every: 18 },
    ]);
  }

  private addEvents(L: LevelRT, src: TransientSource[], max = 4): void {
    if (document.body.classList.contains('lowfx')) return; // flashes: not with reduced motion / photosensitivity
    L.events = new Transients(L.root, L.labels, src, max);
  }

  /** A random point in a galaxy's disc (centre c, radius R, plane given by quaternion q), denser toward the middle. */
  private static inDisc(c: THREE.Vector3, R: number, q: THREE.Quaternion, inner = 1): THREE.Vector3 {
    const rr = R * inner * Math.sqrt(Math.random()) * (0.15 + 0.85 * Math.random()), th = Math.random() * Math.PI * 2;
    return new THREE.Vector3(rr * Math.cos(th), 0, rr * Math.sin(th)).applyQuaternion(q).add(c);
  }

  private buildGroup(L: LevelRT): void {
    const u = L.def.unit, q = this.n, low = this.quality.tier === 'low';
    const { cloud, tex } = this.milkyWay();
    // Galaxies are drawn GROUP_EX× their true size (true size they would be a few pixels across); positions are real.
    const k = (1e3 / u) * GROUP_EX;
    const glow = new THREE.CanvasTexture(glowCanvas());
    const halo = new THREE.CanvasTexture(haloCanvas());
    const origin = new THREE.Vector3();
    const mw = this.disc(L, tex, MILKY_WAY.R * 2 * k, origin, new THREE.Vector3(0, 1, 0), 0.85);
    const discs: { c: THREE.Vector3; R: number; q: THREE.Quaternion; w: number; key: string }[] = [{ c: origin, R: MILKY_WAY.R * k, q: mw.quaternion.clone(), w: 1, key: 'mw' }];
    const sub = Math.min(cloud.n, Math.round(14_000 * q));
    const mwPts = maxPx(gain(this.points(L, DeepStage.discToThree(cloud, k), cloud.col, cloud.size.map(s => s * (1e3 / u) * 2.6), sub, { TWINKLE: '' }), 0.22), 5);
    L.spinners.push([mw, -0.03], [mwPts, -0.03]);
    this.sprite(L, glow, 3.2, origin, '#ffd9a0', 0.5);
    L.home.set(0, 0, 0);
    const at = new Map<string, THREE.Vector3>();
    const r = rng(5);
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== 'group' || HOME_KEY.group.test(o.key)) continue;
      const p = scenePos(o.l, o.b, o.distLy, 'group');
      at.set(o.key, p);
      if (o.kind !== 'galaxy' && o.kind !== 'dwarf') {
        if (o.kind === 'nebula' && o.sizeLy) this.sprite(L, glow, 1.2, p, '#ff7ab8', 0.7);
        continue;
      }
      const size = Math.max(o.kind === 'dwarf' ? 1.3 : 2, ((o.sizeLy ?? 3000) / u) * GROUP_EX);
      const seed = hashStr(o.key);
      if (o.morph === 'spiral' || o.morph === 'barred') {
        const def = genericSpiral(2, 13 + (seed % 9), o.morph === 'barred', seed);
        const c = sampleDisc(def, 9000, seed, 0.02);
        const tx = new THREE.CanvasTexture(paintDisc(def, c, 256, 1.1));
        tx.colorSpace = THREE.SRGBColorSpace;
        const d = this.disc(L, tx, size, p, this.discNormal(o, r), 0.85, r() * 6);
        discs.push({ c: p, R: size / 2, q: d.quaternion.clone(), w: (o.rank ?? 1) >= 3 ? 1 : 0.3, key: o.key });
        const mats: THREE.Material[] = [d.material as THREE.Material];
        // A 3D swarm of its brightest stars over the painted disc
        const nStar = Math.round((o.rank ?? 1) >= 3 && size > 5 ? 7000 * q : 2500 * q);
        const pts = maxPx(gain(this.points(L, DeepStage.discToThree(c, size / 2), c.col, c.size.map(s => s * size * 0.4), Math.min(c.n, nStar), { TWINKLE: '' }), 0.16), 5);
        pts.position.copy(p);
        pts.quaternion.copy(d.quaternion);
        const w = -(0.02 + (seed % 7) * 0.004); // same sense as the Milky Way's, so the arms trail
        L.spinners.push([d, w], [pts, w]);
        mats.push(pts.material as THREE.Material, this.sprite(L, glow, size * 0.2, p, '#ffe2b0', 0.45).material);
        this.stand.set(o.key, mats);
      } else {
        const tx = new THREE.CanvasTexture(paintBlob(o.morph ?? 'dwarf', 128, seed));
        tx.colorSpace = THREE.SRGBColorSpace;
        const m = o.morph === 'irregular' ? this.disc(L, tx, size, p, this.discNormal(o, r), 0.95, r() * 6) : this.sprite(L, tx, size, p, '#ffffff', o.morph === 'dwarf' ? 0.8 : 1);
        this.stand.set(o.key, [m.material as THREE.Material]);
      }
    }
    const m31 = at.get('dp_m31') ?? new THREE.Vector3(60, -40, -90);
    const m33 = at.get('dp_m33') ?? m31.clone().add(new THREE.Vector3(20, -10, 20));
    const lmc = at.get('dp_lmc') ?? new THREE.Vector3(0, -4, -6);
    const smc = at.get('dp_smc') ?? lmc.clone().add(new THREE.Vector3(1, -2, 1));
    // Hot gas coronae / dark-matter haloes: each big galaxy sits in a glow about a million light-years across.
    this.sprite(L, halo, 2 * 1e6 / u, origin, '#5b7cff', 0.34);
    this.sprite(L, halo, 2 * 1.15e6 / u, m31, '#7b6cff', 0.38);
    this.sprite(L, halo, 2 * 0.45e6 / u, m33, '#5fb0ff', 0.26);
    this.stellarHalo(L, origin, 34, 2600, 11);
    this.stellarHalo(L, m31, 40, 3000, 12);
    this.satellites(L, origin, 46, 50, 13, null);
    // The Great Plane of Andromeda: we see it almost exactly edge-on, so our line of sight lies in it
    this.satellites(L, m31, 50, 42, 14, m31.clone().normalize().cross(new THREE.Vector3(0, 1, 0)).normalize());
    this.satellites(L, m33, 16, 6, 15, null);
    this.satellites(L, m31.clone().multiplyScalar(0.5), 150, 26, 16, null);
    this.magellanicStream(L, lmc, smc);
    this.giantStream(L, m31);
    this.bridge(L, m31, m33, 900, [0.35, 0.8, 0.75], 0.9, 17);
    this.approach(L, m31);
    if (!low) this.intragroupGas(L, m31);
    this.distanceRings(L, [1e6, 2e6, 3e6, 4e6, 5e6], [12, 250], 4.2);
    this.neighbourGroups(L);
    L.defTarget.copy(m31).multiplyScalar(0.42);
    this.backdrop(L, 4200, 1600, 1.1);
    // Supernovae in the big spirals (weighted by size); Andromeda's bulge throws off a nova every few days in reality
    const tot = discs.reduce((a, d) => a + d.w * d.R, 0);
    const pick = () => { let x = Math.random() * tot; for (const d of discs) { x -= d.w * d.R; if (x <= 0) return d; } return discs[0]; };
    const a31 = discs.find(d => /m31|andromeda_galaxy/.test(d.key));
    this.addEvents(L, [
      { kind: KINDS.snII, site: () => { const d = pick(); return DeepStage.inDisc(d.c, d.R, d.q); }, every: 11 },
      { kind: KINDS.snIa, site: () => { const d = pick(); return DeepStage.inDisc(d.c, d.R, d.q); }, every: 19 },
      ...(a31 ? [{ kind: KINDS.nova, site: () => DeepStage.inDisc(a31.c, a31.R, a31.q, 0.25), every: 4.5 }] : []),
    ]);
  }

  /** Old halo stars and globular clusters: a faint, slightly flattened cloud around a galaxy. */
  private stellarHalo(L: LevelRT, c: THREE.Vector3, R: number, n: number, seed: number): void {
    const r = rng(seed), N = Math.round(n * this.n);
    const p = new Float32Array(N * 3), col = new Float32Array(N * 3), s = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r) * 0.8, gauss(r)).normalize().multiplyScalar(1.5 + R * r() ** 2.2);
      p.set([v.x, v.y, v.z], i * 3);
      const glob = i % 14 === 0, w = glob ? 0.9 : 0.32 + r() * 0.2;
      col.set(glob ? [w, w * 0.86, w * 0.6] : [w * 0.85, w * 0.85, w], i * 3);
      s[i] = glob ? 0.3 : 0.14;
    }
    const o = DeepStage.orbits(p, N, 0.32, r);
    for (let i = 0; i < N; i++) o[i * 4 + 3] = Math.min(o[i * 4 + 3], 0.06);
    maxPx(this.points(L, p, col, s, N, { TWINKLE: '', ORBIT: '' }, g => g.setAttribute('aOrbit', new THREE.BufferAttribute(o, 4))), 4).position.copy(c);
  }

  /**
   * Faint dwarf satellites (most real ones are too dim to name): small fuzzy knots of stars. With `plane`, half of
   * them crowd into a thin sheet, as Andromeda's do.
   */
  private satellites(L: LevelRT, c: THREE.Vector3, R: number, n: number, seed: number, plane: THREE.Vector3 | null): void {
    const r = rng(seed), per = 7, N = Math.round(n * Math.max(0.5, this.n));
    const p = new Float32Array(N * per * 3), col = new Float32Array(N * per * 3), s = new Float32Array(N * per);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    if (plane) { a.set(1, 0, 0).cross(plane).normalize(); b.copy(plane).cross(a); }
    let j = 0;
    const inPlane: boolean[] = [];
    for (let i = 0; i < N; i++) {
      const d = 3 + R * Math.sqrt(r());
      inPlane.push(!!plane && i % 2 === 0);
      const v = plane && i % 2 === 0
        ? a.clone().multiplyScalar(gauss(r)).addScaledVector(b, gauss(r)).normalize().multiplyScalar(d).addScaledVector(plane, gauss(r) * 0.8)
        : new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(d);
      const tint = r(), w = 0.45 + r() * 0.35, big = 0.5 + r() * 0.6;
      const cc = tint < 0.6 ? [1, 0.88, 0.7] : [0.75, 0.85, 1];
      for (let k = 0; k < per; k++) {
        const sp = k === 0 ? 0 : big * 0.45;
        p.set([v.x + gauss(r) * sp, v.y + gauss(r) * sp, v.z + gauss(r) * sp], j * 3);
        const f = k === 0 ? w : w * 0.45;
        col.set([cc[0] * f, cc[1] * f, cc[2] * f], j * 3);
        s[j++] = k === 0 ? big * 0.6 : big * 0.22;
      }
    }
    // Each dwarf swings round its host as one knot; the ones in Andromeda's thin plane all go the same way round.
    const o = DeepStage.orbits(p, j, 0.3, r, per, i => inPlane[i / per] ? plane : null);
    for (let i = 0; i < j; i++) o[i * 4 + 3] = Math.min(o[i * 4 + 3], 0.05);
    maxPx(this.points(L, p, col, s, j, { ORBIT: '' }, g => g.setAttribute('aOrbit', new THREE.BufferAttribute(o, 4))), 6).position.copy(c);
  }

  /** Points moving from `pos` to `end` over and over (gas streams, infall), built by `fill(i, pos, end) → colour`. */
  private flow(L: LevelRT, n: number, size: number, seed: number, fill: (r: () => number, p: THREE.Vector3, e: THREE.Vector3) => [number, number, number]): void {
    const r = rng(seed), N = Math.round(n * this.n);
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N), e = new Float32Array(N * 3), ph = new Float32Array(N);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      c.set(fill(r, a, b), i * 3);
      p.set([a.x, a.y, a.z], i * 3);
      e.set([b.x, b.y, b.z], i * 3);
      s[i] = size * (0.6 + r() * 0.8);
      ph[i] = r();
    }
    maxPx(this.points(L, p, c, s, N, { FLOW: '' }, g => {
      g.setAttribute('aEnd', new THREE.BufferAttribute(e, 3));
      g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    }), 8);
  }

  /**
   * The Magellanic Stream: a river of hydrogen trailing the Clouds through the south galactic pole and more than
   * halfway round the Milky Way, plus the shorter Leading Arm ahead of them and the Bridge between the two Clouds.
   */
  private magellanicStream(L: LevelRT, lmc: THREE.Vector3, smc: THREE.Vector3): void {
    const R0 = lmc.length(), A = lmc.clone().normalize();
    const B = new THREE.Vector3(0, -1, 0).addScaledVector(A, A.y).normalize(); // toward the south galactic pole
    const N = A.clone().cross(B).normalize();
    const at = (th: number, out: THREE.Vector3) => out.copy(A).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th)).multiplyScalar(R0 * (1 + 0.55 * Math.max(0, th) / Math.PI));
    const span = 3.3, lead = -1.0;
    this.flow(L, 3600, 0.32, 21, (r, p, e) => {
      const th = lead + (span - lead) * r() ** 0.8;
      at(th, p);
      at(th - 0.22, e);
      const w = 0.35 + 0.9 * Math.abs(th) / span, off = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(w * 0.6).addScaledVector(N, gauss(r) * w * 0.5);
      p.add(off); e.add(off);
      const f = (0.3 + r() * 0.25) * (1 - 0.5 * Math.max(0, th) / span);
      return th < 0 ? [0.55 * f, 0.6 * f, 1 * f] : [1 * f, 0.42 * f, 0.78 * f];
    });
    this.bridge(L, lmc, smc, 500, [0.9, 0.5, 0.85], 0.5, 22);
  }

  /** A faint, wavy band of gas or stars between two galaxies. */
  private bridge(L: LevelRT, a: THREE.Vector3, b: THREE.Vector3, n: number, col: [number, number, number], width: number, seed: number): void {
    const r = rng(seed), N = Math.round(n * this.n), d = b.clone().sub(a), len = d.length();
    const side = d.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N), v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const t = r();
      v.copy(a).addScaledVector(d, t).addScaledVector(side, Math.sin(t * Math.PI) * len * 0.12);
      const w = width * (0.6 + Math.sin(t * Math.PI));
      p.set([v.x + gauss(r) * w, v.y + gauss(r) * w, v.z + gauss(r) * w], i * 3);
      const f = 0.25 + r() * 0.3;
      c.set([col[0] * f, col[1] * f, col[2] * f], i * 3);
      s[i] = 0.25 + r() * 0.3;
    }
    maxPx(this.points(L, p, c, s, N, { TWINKLE: '' }), 5);
  }

  /** Andromeda's Giant Stellar Stream: the long golden trail of a small galaxy it shredded. */
  private giantStream(L: LevelRT, m31: THREE.Vector3): void {
    const r = rng(23), N = Math.round(1800 * this.n);
    // It runs south-east on our sky and reaches some 300,000 ly behind Andromeda (away from us)
    const away = m31.clone().normalize(), south = new THREE.Vector3(0, -1, 0).addScaledVector(away, away.y).normalize();
    const dir = away.clone().multiplyScalar(0.75).addScaledVector(south, 0.66).normalize(), bend = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N), v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const t = r() ** 0.7, len = 22;
      v.copy(m31).addScaledVector(dir, t * len).addScaledVector(bend, Math.sin(t * 2.2) * 5);
      const w = 0.4 + t * 1.6;
      p.set([v.x + gauss(r) * w, v.y + gauss(r) * w * 0.5, v.z + gauss(r) * w], i * 3);
      const f = (0.35 + r() * 0.35) * (1 - t * 0.5);
      c.set([f, f * 0.78, f * 0.5], i * 3);
      s[i] = 0.2 + r() * 0.2;
    }
    maxPx(this.points(L, p, c, s, N, { TWINKLE: '' }), 4);
  }

  /** Andromeda is falling toward us at 110 km/s: a slow current of light along the line between the two. */
  private approach(L: LevelRT, m31: THREE.Vector3): void {
    const side = m31.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), up = side.clone().cross(m31).normalize();
    this.flow(L, 420, 0.45, 24, (r, p, e) => {
      const t = 0.1 + r() * 0.72, j = gauss(r) * 1.2, k = gauss(r) * 1.2;
      p.copy(m31).multiplyScalar(1 - t).addScaledVector(side, j).addScaledVector(up, k);
      e.copy(m31).multiplyScalar(1 - t - 0.1).addScaledVector(side, j).addScaledVector(up, k);
      const f = 0.45 + r() * 0.3;
      return [0.45 * f, 0.85 * f, 1 * f];
    });
  }

  /** Very faint, lumpy warm gas filling the space between the galaxies. */
  private intragroupGas(L: LevelRT, m31: THREE.Vector3): void {
    this.gas(L, [
      [m31.clone().multiplyScalar(0.45), 260, ['#3049b8', '#6a2fa0'], 0.22],
      [m31.clone().multiplyScalar(0.9).add(new THREE.Vector3(20, 25, -10)), 160, ['#2a6fb0', '#7a3fb0'], 0.16],
      [new THREE.Vector3(-30, -20, 25), 150, ['#2d4fb8', '#a0306e'], 0.14],
    ], 300);
  }

  /** Soft blue-violet gas clouds (the shared deep-space "atmosphere" of every level). */
  private gas(L: LevelRT, blobs: [THREE.Vector3, number, [string, string], number][], seed: number): void {
    if (this.quality.tier === 'low') blobs = blobs.slice(0, 2);
    const S = this.quality.tier === 'high' ? 256 : 128;
    blobs.forEach(([p, size, hues, op], i) => {
      const tx = new THREE.CanvasTexture(paintNebula(S, seed + i, hues, false, false));
      tx.colorSpace = THREE.SRGBColorSpace;
      this.sprite(L, tx, size, p, '#ffffff', op);
    });
  }

  /**
   * Distance rings (light-years) round the level's centre in the galactic plane, like a radar scope, with tags and
   * spokes. `h`: tag height (scene units), or a function of the ring's radius in ly (tags that grow with their ring).
   */
  private distanceRings(L: LevelRT, ly: number[], spokes: [number, number], h: number | ((ly: number) => number)): void {
    const seg = 160, mat = this.fadeMat(L, new THREE.LineBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    const tick = this.fadeMat(L, new THREE.LineBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    const pts: number[] = [], rings: number[] = [];
    const Rmax = ly[ly.length - 1] / L.def.unit;
    for (const d of ly) {
      const R = d / L.def.unit;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        rings.push(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R);
      }
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2, t = Rmax * (i % 6 === 0 ? 0.02 : 0.008);
        pts.push(Math.cos(a) * (R - t), 0, Math.sin(a) * (R - t), Math.cos(a) * R, 0, Math.sin(a) * R);
      }
      const a = -Math.PI * 0.62, th = typeof h === 'number' ? h : h(d);
      this.text(L, () => fmtLy(d, lang()), new THREE.Vector3(Math.cos(a) * R, th * 0.36, Math.sin(a) * R), th);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(Math.cos(a) * spokes[0], 0, Math.sin(a) * spokes[0], Math.cos(a) * spokes[1], 0, Math.sin(a) * spokes[1]);
    }
    for (const [arr, m] of [[rings, mat], [pts, tick]] as const) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      L.root.add(new THREE.LineSegments(g, m));
    }
  }

  /** A small text tag in the scene (re-painted on language change). */
  private text(L: LevelRT, label: () => string, at: THREE.Vector3, h: number): void {
    const cv = document.createElement('canvas'), tx = new THREE.CanvasTexture(cv);
    const s = new THREE.Sprite(this.fadeMat(L, new THREE.SpriteMaterial({ map: tx, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })));
    s.position.copy(at);
    const paint = () => {
      const txt = label(), ctx = cv.getContext('2d')!, font = `500 30px ${cssFont('--font-hud')}`;
      ctx.font = font;
      cv.width = Math.ceil(ctx.measureText(txt).width) + 24; cv.height = 44;
      ctx.font = font; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9ee3ff';
      ctx.fillText(txt, 12, 23);
      tx.dispose(); tx.needsUpdate = true;
      s.scale.set((h * cv.width) / cv.height, h, 1);
    };
    paint();
    L.texts.push(paint);
    L.root.add(s);
  }

  /** The nearest galaxy groups just outside ours: a bright main galaxy and its companions, far out in the dark. */
  private neighbourGroups(L: LevelRT): void {
    const r = rng(31), N = 14, groups = DEEP_OBJECTS.filter(o => o.scale === 'laniakea' && /sculptor_group|m81_group|maffei_group|centaurus_a/.test(o.key));
    const extra: [number, number, number][] = [[138.2, 10.6, 10.7e6], [255, 30, 4.3e6], [123, 76, 13e6]]; // IC 342 group, Antlia–Sextans & Canes Venatici clouds
    const where = [...groups.map(o => [o.l, o.b, Math.min(o.distLy, 1.3e7)] as [number, number, number]), ...extra];
    const n = where.length * (N + 1), p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
    let j = 0;
    for (const [l, b, d] of where) {
      const at = scenePos(l, b, d, 'group');
      p.set([at.x, at.y, at.z], j * 3); // the group's soft glow
      c.set([0.1, 0.13, 0.22], j * 3);
      s[j++] = 40;
      for (let i = 0; i < N; i++) {
        const R = i === 0 ? 0 : 3 + 22 * r();
        p.set([at.x + gauss(r) * R, at.y + gauss(r) * R * 0.6, at.z + gauss(r) * R], j * 3);
        const f = i === 0 ? 1 : 0.4 + r() * 0.4, warm = r() < 0.5;
        c.set(warm ? [f, f * 0.86, f * 0.66] : [f * 0.78, f * 0.86, f], j * 3);
        s[j++] = i === 0 ? 6 : 1.6 + r() * 2.6;
      }
    }
    this.points(L, p, c, s, j);
  }

  /** Disc normal from the sky position angle / inclination (or a seeded random one). */
  private discNormal(o: DeepObject, r: () => number): THREE.Vector3 {
    const hit = ORIENT.find(([re]) => re.test(o.key));
    if (!hit) return new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize();
    const [, pa, inc] = hit;
    const p = new THREE.Vector3(...galVec(o.l, o.b));
    const ncp = new THREE.Vector3(...NCP_GAL);
    const north = ncp.clone().addScaledVector(p, -ncp.dot(p)).normalize();
    const east = ncp.clone().cross(p).normalize();
    const major = north.multiplyScalar(Math.cos(pa * D2R)).addScaledVector(east, Math.sin(pa * D2R));
    const minor = p.clone().cross(major).normalize();
    const n = p.multiplyScalar(Math.cos(inc * D2R)).addScaledVector(minor, Math.sin(inc * D2R));
    return galToThree([n.x, n.y, n.z]);
  }

  /** Faint, very distant galaxies all around (a sense of depth). */
  private backdrop(L: LevelRT, n: number, R: number, size: number): void {
    const r = rng(77 + n), N = Math.round(n * this.n);
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(R * (0.7 + r() * 0.6));
      p.set([v.x, v.y, v.z], i * 3);
      const w = 0.25 + r() * 0.35;
      c.set(r() < 0.5 ? [w, w * 0.92, w * 0.8] : [w * 0.8, w * 0.88, w], i * 3);
      s[i] = size * (0.6 + r() * 1.2);
    }
    this.points(L, p, c, s);
  }

  /**
   * A cosmic web: nodes (known clusters plus random ones) linked to their nearest neighbours, galaxies strung
   * along the links and piled up in the nodes.
   */
  private web(L: LevelRT, opts: { R: number; nodes: THREE.Vector3[]; extra: number; n: number; width: number; size: number; seed: number; centre?: THREE.Vector3; maxLink: number }): THREE.Vector3[] {
    const r = rng(opts.seed);
    const nodes = [...opts.nodes];
    const c0 = opts.centre ?? new THREE.Vector3();
    for (let i = 0; i < opts.extra; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(opts.R * Math.cbrt(r())).add(c0);
      nodes.push(v);
    }
    const links: [number, number][] = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => [j, a.distanceTo(b)] as const).filter(([j, d]) => j !== i && d < opts.maxLink).sort((x, y) => x[1] - y[1]).slice(0, 3);
      for (const [j] of near) if (!links.some(([x, y]) => (x === j && y === i))) links.push([i, j]);
    });
    const N = Math.round(opts.n * this.n);
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let w = opts.width, bright = 0.35 + r() * 0.4;
      if (i % 4 === 0) { // node blobs
        tmp.copy(nodes[Math.floor(r() * nodes.length)]);
        w *= 1.6; bright *= 1.25;
      } else {
        const [a, b] = links[Math.floor(r() * links.length)] ?? [0, 0];
        tmp.lerpVectors(nodes[a], nodes[b], r());
      }
      tmp.x += gauss(r) * w; tmp.y += gauss(r) * w; tmp.z += gauss(r) * w;
      if (tmp.distanceTo(c0) > opts.R * 1.15) { i--; continue; }
      p.set([tmp.x, tmp.y, tmp.z], i * 3);
      const tt = r();
      const col = tt < 0.45 ? [1, 0.82, 0.6] : tt < 0.8 ? [0.75, 0.82, 1] : [1, 0.95, 0.9];
      c.set([col[0] * bright, col[1] * bright, col[2] * bright], i * 3);
      s[i] = opts.size * (0.6 + r() * 1.1);
    }
    maxPx(gain(this.points(L, p, c, s, N, { TWINKLE: '' }), 0.24), 5);
    return nodes;
  }

  private buildLaniakea(L: LevelRT): void {
    const known: THREE.Vector3[] = [];
    let ga: THREE.Vector3 | null = null;
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== 'laniakea' || !['cluster', 'group', 'supercluster', 'region'].includes(o.kind)) continue;
      const v = scenePos(o.l, o.b, o.distLy, 'laniakea');
      known.push(v);
      if (/norma|great_attractor/.test(o.key) && !ga) ga = v.clone();
    }
    ga ??= scenePos(307, 9, 2.5e8, 'laniakea');
    const centre = ga.clone().multiplyScalar(0.8);
    const nodes = this.web(L, { R: 420, nodes: known, extra: 150, n: 46_000, width: 7, size: 2.4, seed: 11, centre, maxLink: 170 });
    const near = (j: number) => () => nodes[Math.floor(Math.random() * nodes.length)].clone().add(new THREE.Vector3(gauss(Math.random), gauss(Math.random), gauss(Math.random)).multiplyScalar(j));
    // Across 100 million galaxies a supernova goes off every few seconds; mergers and star-shredding are rarer
    this.addEvents(L, [
      { kind: KINDS.snIa, site: near(10), every: 3.2 },
      { kind: KINDS.snII, site: near(12), every: 4.5 },
      { kind: KINDS.tde, site: near(8), every: 24 },
      { kind: KINDS.kilonova, site: near(10), every: 36 },
    ], 5);
    // Galaxies streaming toward the Great Attractor (the "immeasurable heaven" basin)
    const r = rng(3), N = Math.round(2600 * this.n);
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), s = new Float32Array(N), e = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r) * 0.6, gauss(r)).normalize().multiplyScalar(265 * Math.cbrt(0.15 + r() * 0.85)).add(centre);
      p.set([v.x, v.y, v.z], i * 3);
      const end = v.clone().lerp(ga, 0.55 + r() * 0.25);
      e.set([end.x, end.y, end.z], i * 3);
      c.set([0.35, 0.75, 1], i * 3);
      s[i] = 1.8;
      ph[i] = r();
    }
    maxPx(this.points(L, p, c, s, N, { FLOW: '' }, g => {
      g.setAttribute('aEnd', new THREE.BufferAttribute(e, 3));
      g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    }), 5);
    // The basin's edge: a faint, lumpy shell
    const NS = Math.round(1800 * this.n), sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), ss = new Float32Array(NS);
    for (let i = 0; i < NS; i++) {
      const v = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize();
      const rad = 265 * (1 + 0.16 * Math.sin(v.x * 5 + 1) * Math.cos(v.z * 4) + 0.08 * Math.sin(v.y * 7));
      v.multiplyScalar(rad).add(centre);
      sp.set([v.x, v.y, v.z], i * 3);
      sc.set([0.3, 0.38, 0.85], i * 3);
      ss[i] = 2.2;
    }
    maxPx(gain(this.points(L, sp, sc, ss, NS, { TWINKLE: '' }), 0.7), 4);
    this.sprite(L, new THREE.CanvasTexture(haloCanvas()), 760, centre, '#5b7cff', 0.3);
    this.gas(L, [
      [ga.clone(), 380, ['#3049b8', '#6a2fa0'], 0.4],
      [centre.clone().multiplyScalar(0.4), 460, ['#2a6fb0', '#7a3fb0'], 0.3],
      [new THREE.Vector3(-90, 40, 110), 360, ['#2d4fb8', '#a0306e'], 0.22],
    ], 500);
    this.distanceRings(L, [1e8, 2e8, 3e8, 4e8], [10, 420], 11);
    this.backdrop(L, 4000, 2600, 0.9);
    L.home.set(0, 0, 0);
    L.defTarget.copy(centre).multiplyScalar(0.55);
    this.sprite(L, new THREE.CanvasTexture(glowCanvas()), 14, new THREE.Vector3(), '#a7f3d0', 0.8);
  }

  private buildUniverse(L: LevelRT): void {
    const known: THREE.Vector3[] = [];
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== 'universe' || o.kind === 'cmb' || o.kind === 'void' || o.kind === 'deepfield' || o.distLy > 3e9) continue;
      known.push(scenePos(o.l, o.b, o.distLy, 'universe'));
    }
    // a finer web close to home (where the named superclusters are) inside the coarse web of the whole bubble
    this.web(L, { R: 40, nodes: known, extra: 90, n: 16_000, width: 0.55, size: 0.5, seed: 21, maxLink: 14 });
    // galaxies only formed a few hundred million years after the CMB was released: a dark gap before that sphere
    const far = this.web(L, { R: CMB_R * 0.88, nodes: [], extra: 520, n: 52_000, width: 3.2, size: 3.4, seed: 23, maxLink: 120 });
    // Only gamma-ray bursts shine across the whole observable universe (satellites catch about one a day)
    this.addEvents(L, [{ kind: KINDS.grb, site: () => far[Math.floor(Math.random() * far.length)].clone().add(new THREE.Vector3(gauss(Math.random), gauss(Math.random), gauss(Math.random)).multiplyScalar(4)), every: 5 }], 3);
    const tex = new THREE.CanvasTexture(paintCMB(this.quality.tier === 'low' ? 512 : 1024));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false; // no mip seam where the view-direction longitude wraps
    tex.minFilter = THREE.LinearFilter;
    const cmb = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uFade: { value: 1 }, uR: { value: CMB_R } }, vertexShader: CMB_VS, fragmentShader: CMB_FS,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    L.cmb = cmb;
    L.scene.add(new THREE.Mesh(new THREE.SphereGeometry(CMB_R, 96, 48), cmb));
    this.gas(L, [
      [new THREE.Vector3(0, 0, 0), 70, ['#3049b8', '#6a2fa0'], 0.16],
      [new THREE.Vector3(150, 60, -120), 420, ['#2a6fb0', '#7a3fb0'], 0.1],
      [new THREE.Vector3(-170, -80, 140), 420, ['#2d4fb8', '#a0306e'], 0.08],
    ], 700);
    this.distanceRings(L, [1e10, 2e10, 3e10, 4e10], [6, CMB_R * 0.9], 7);
    L.home.set(0, 0, 0);
    L.defTarget.set(0, 0, 0);
    this.sprite(L, new THREE.CanvasTexture(glowCanvas()), 7, new THREE.Vector3(), '#a7f3d0', 0.9);
    // Quasars: an accretion-disc glow that brightens and fades by tens of percent over days to months
    const qg = new THREE.CanvasTexture(glowCanvas());
    for (const o of DEEP_OBJECTS) {
      if (o.scale !== 'universe' || o.kind !== 'quasar') continue;
      const s = this.sprite(L, qg, 3.2, scenePos(o.l, o.b, o.distLy, 'universe'), kindColor(o.kind), 0.75);
      L.flicker.push([s.material, hashStr(o.key) % 1000]);
    }
  }

  /** Bright screen-size markers on every named object. */
  private addMarkers(L: LevelRT): void {
    const n = L.objs.length + 1;
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n), col = new THREE.Color();
    L.objs.forEach((x, i) => {
      p.set([x.pos.x, x.pos.y, x.pos.z], i * 3);
      col.set(x.o.spec ? starColor(x.o.spec) : kindColor(x.o.kind));
      c.set([col.r, col.g, col.b], i * 3);
      s[i] = x.o.kind === 'cmb' || x.o.kind === 'void' ? 0 : 5 + x.rank * 2;
    });
    p.set([L.home.x, L.home.y, L.home.z], (n - 1) * 3);
    c.set([1, 0.95, 0.7], (n - 1) * 3);
    s[n - 1] = 10;
    this.points(L, p, c, s, n, { SCREEN: '' });
  }

  // ---------- camera ----------
  /** Puts level `id` in charge. `how`: arriving from the scale below (zooming out), above (zooming in), or a jump. */
  enter(id: DeepScale, how: 'up' | 'down' | 'jump', fromLy?: number): void {
    const L = this.ensure(id);
    this.level = id;
    this.sel = null;
    const def = L.def, toD = this.restDist(L);
    if (how === 'up') {
      L.target.copy(L.home);
      L.dist = Math.max(def.downLy * 1.5, Math.min(def.defLy * 0.5, fromLy ?? def.downLy * 2)) / def.unit;
      this.tweenTo(L, L.defTarget, toD, 2600);
    } else if (how === 'down') {
      L.target.copy(L.home);
      L.dist = Math.min(def.upLy * 0.8, fromLy ?? def.upLy * 0.6) / def.unit;
      this.tweenTo(L, L.defTarget, toD, 2200);
    } else {
      L.target.copy(L.defTarget);
      L.dist = Math.min(toD * 2.2, def.upLy / def.unit);
      this.tweenTo(L, L.defTarget, toD, 1800);
      this.el = def.el * 0.8;
    }
    if (how !== 'jump') this.tweenEl = { from: this.el, to: def.el, t: 0 };
    this.relabel();
  }
  private tweenEl: { from: number; to: number; t: number } | null = null;

  /** Resting camera distance (scene units). The Local Group (Milky Way and Andromeda side by side) backs off on tall screens. */
  private restDist(L: LevelRT): number {
    const d = L.def.defLy / L.def.unit, a = innerWidth / Math.max(1, innerHeight);
    return L.id === 'group' && a < 1 ? d * Math.min(1.7, a ** -0.6) : d;
  }

  private tweenTo(L: LevelRT, to: THREE.Vector3, toD: number, dur: number): void {
    L.tween = { t: 0, dur, fromT: L.target.clone(), toT: to.clone(), fromD: L.dist, toD };
  }

  get current(): LevelRT { return this.ensure(this.level); }
  /** Camera distance of the active level in light-years. */
  get distLy(): number { const L = this.current; return L.dist * L.def.unit; }
  get busy(): boolean { return Boolean(this.current.tween || this.tweenEl); }

  select(o: DeepObject | null, emit = true): void {
    const L = this.current;
    this.sel = o;
    if (o) {
      const x = L.objs.find(v => v.o === o);
      if (!x) return;
      const R = this.showModel(L, o, x.pos);
      const want = R ? R * MODEL_VIEW : L.id === 'stars' ? 7.5
        : Math.max(L.def.downLy * 1.4, Math.min(L.def.defLy * 0.4, (o.sizeLy ?? L.def.defLy * 0.05) * 3.2 * (L.id === 'group' ? GROUP_EX : 1))) / L.def.unit;
      this.tweenTo(L, x.pos, o.kind === 'cmb' ? L.def.defLy / L.def.unit : want, R ? 2200 : 1500);
    }
    if (emit) this.ev.onSelect?.(o);
  }

  /** Display radius (scene units) of `o`'s 3D model on level `L`, or 0 when it has none there. */
  private modelRadius(L: LevelRT, o: DeepObject): number {
    if (L.id === 'galaxy') return hasNebulaModel(o.key) ? NEB_R : 0;
    if (!hasGalaxyModel(o.key) && !GAL_KINDS.includes(o.kind)) return 0;
    if (o.kind === 'blackhole' && !hasGalaxyModel(o.key)) return 0;
    const ly = galaxyExtentLy(o.key, { kind: o.kind, morph: o.morph, sizeLy: o.sizeLy }) / 2;
    // the Local Group draws its galaxies GROUP_EX× life size: the model takes over at the drawn size
    if (L.id === 'group') return Math.max(o.kind === 'dwarf' ? 0.65 : 1, (ly / L.def.unit) * GROUP_EX);
    return ly / L.def.unit;
  }

  /**
   * Builds (once) the picked object's 3D model where its marker is — +Z (the face in the famous photos) toward Earth,
   * +Y toward celestial north, as we see it in the sky — and swings the camera round to Earth's side so it arrives
   * on that view. Returns its display radius in scene units (0: no model, keep the old close-up).
   */
  private showModel(L: LevelRT, o: DeepObject, at: THREE.Vector3): number {
    const R = this.modelRadius(L, o);
    if (!R) { this.dropModel(); return 0; }
    if (this.model?.key !== o.key || this.model.L !== L) {
      this.dropModel();
      const m = L.id === 'galaxy' ? buildNebula(o.key, this.quality.tier) : buildGalaxyModel(o.key, this.quality.tier, { kind: o.kind, morph: o.morph });
      if (!m) return 0;
      m.group.scale.setScalar(R / m.radius);
      L.root.updateMatrixWorld(true);
      const pos = scenePos(o.l, o.b, o.distLy, L.id), home = L.root.worldToLocal(L.home.clone());
      m.group.position.copy(pos);
      const z = home.sub(pos).normalize(), north = galToThree(NCP_GAL);
      const y = north.addScaledVector(z, -north.dot(z)).normalize(), x = y.clone().cross(z);
      m.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      m.group.traverse(c => { c.renderOrder += 20; });
      L.root.add(m.group);
      m.setOpacity(0);
      this.model = { key: o.key, L, m, a: 0, R };
    }
    const d = L.home.clone().sub(at).normalize();
    const az = Math.atan2(d.x, d.z);
    this.tweenAz = { from: this.az, to: this.az + ((((az - this.az) % TAU) + TAU * 1.5) % TAU - Math.PI), t: 0 };
    this.tweenEl = { from: this.el, to: Math.max(-1.2, Math.min(1.2, Math.asin(d.y))), t: 0 };
    return R;
  }

  private dropModel(): void {
    if (!this.model) return;
    this.model.m.group.removeFromParent();
    this.model.m.dispose();
    this.model = null;
  }

  /** Back to the level's resting view. */
  overview(): void {
    const L = this.current;
    this.sel = null;
    this.tweenTo(L, L.defTarget, this.restDist(L), 1400);
  }

  /** Last user input (ms): after a while without any, the camera drifts round on its own. */
  private input = 0;

  rotate(dx: number, dy: number): void {
    this.input = performance.now();
    this.current.tween = null;
    this.az -= dx * 0.005;
    this.el = Math.max(-1.45, Math.min(1.45, this.el + dy * 0.005));
    this.tweenEl = null; this.tweenAz = null;
  }

  zoomBy(f: number): void {
    this.input = performance.now();
    const L = this.current, def = L.def;
    if (L.tween) { L.target.copy(L.tween.toT); L.tween = null; }
    if (f < 1 && !this.sel) L.target.lerp(L.home, Math.min(1, (1 - f) * 1.4));
    const nearHome = L.target.distanceTo(L.home) < L.dist * 0.25;
    L.dist *= f;
    const ly = L.dist * def.unit;
    const md = this.model?.L === L && this.sel?.key === this.model.key ? this.model : null;
    const close = md ? md.R * 1.2 * def.unit : def.downLy;
    if (f < 1 && ly < close) {
      if (nearHome && !this.sel) { this.ev.onDown?.(); return; }
      L.dist = close / def.unit;
    }
    if (f > 1 && ly > def.upLy) {
      if (this.level !== 'universe') { this.ev.onUp?.(); return; }
      L.dist = def.upLy / def.unit;
    }
  }

  /** Nearest label or marker within 18 px. */
  pickAt(x: number, y: number): DeepObject | 'home' | null {
    let best: DeepObject | 'home' | null = null, bd = 18;
    for (const p of this.placed) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p.o; } }
    return best;
  }

  // ---------- frame ----------
  /** Advances tweens of every visible level (`dt` in ms). */
  update(dt: number): void {
    // Classroom "pause motion": galaxies stop turning and events hold; camera tweens still run.
    const sec = motion.still ? 0 : dt / 1000;
    this.time += sec;
    // Idle: a slow cinematic orbit, easing in.
    const idle = (performance.now() - this.input - 6000) / 4000;
    if (idle > 0 && !this.current.tween) this.az += sec * 0.022 * Math.min(1, idle);
    for (const L of this.levels.values()) {
      if (L.spin) {
        const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, L.spin * sec);
        L.root.quaternion.premultiply(q);
        L.angle = (L.angle + L.spin * sec) % (Math.PI * 2);
        for (const x of L.objs) x.pos.applyQuaternion(q);
        for (const v of [L.home, L.target, L.defTarget]) v.applyQuaternion(q);
        if (L.tween) { L.tween.fromT.applyQuaternion(q); L.tween.toT.applyQuaternion(q); }
      }
      for (const [o, w] of L.spinners) o.rotateY(w * sec);
      if (L.events) { if (L.id === this.level) L.events.update(sec); else if (L.events.count) L.events.clear(); }
    }
    if (this.tweenAz) {
      this.tweenAz.t = Math.min(1, this.tweenAz.t + dt / 2200);
      this.az = this.tweenAz.from + (this.tweenAz.to - this.tweenAz.from) * ease(this.tweenAz.t);
      if (this.tweenAz.t >= 1) this.tweenAz = null;
    }
    const md = this.model;
    if (md) {
      // in while it is selected and the camera is close; out (and freed) otherwise
      const v = md.R * MODEL_VIEW;
      const on = this.sel?.key === md.key && this.level === md.L.id ? THREE.MathUtils.smoothstep(v * 8, v * 2, md.L.dist) : 0;
      md.a += (on - md.a) * Math.min(1, dt / 1000 * 3);
      if (on === 0 && md.a < 0.01 && (this.sel?.key !== md.key || this.level !== md.L.id)) this.dropModel();
    }
    if (this.tweenEl) {
      this.tweenEl.t = Math.min(1, this.tweenEl.t + dt / 2200);
      this.el = this.tweenEl.from + (this.tweenEl.to - this.tweenEl.from) * ease(this.tweenEl.t);
      if (this.tweenEl.t >= 1) this.tweenEl = null;
    }
    for (const L of this.levels.values()) {
      const tw = L.tween;
      if (!tw) continue;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = ease(tw.t);
      L.target.lerpVectors(tw.fromT, tw.toT, e);
      L.dist = Math.exp(Math.log(tw.fromD) + (Math.log(tw.toD) - Math.log(tw.fromD)) * e);
      if (tw.t >= 1) L.tween = null;
    }
  }

  /** Scales a fading-out level's camera with the zoom so it keeps "moving" while it fades. */
  drift(id: DeepScale, f: number): void { const L = this.levels.get(id); if (L) L.dist *= f; }

  setScreen(w: number, h: number, pr: number): void { this.screen = { w, h, pr }; }

  /** Whether level `id` can draw without stalling on shader compiles; starts compiling them in the background if not. */
  ready(renderer: THREE.WebGLRenderer, id: DeepScale): boolean {
    const L = this.levels.get(id);
    if (!L) return false;
    L.warm ??= warmShaders(renderer, L.scene, this.camera).then(() => { L.warm = 'ready'; });
    return L.warm === 'ready';
  }

  /** Draws level `id` at brightness `w` (0..1) over whatever is in the frame buffer. */
  render(renderer: THREE.WebGLRenderer, id: DeepScale, w: number, fov: number): void {
    const L = this.levels.get(id);
    if (!L || w <= 0.001 || !this.ready(renderer, id)) return;
    L.w = w;
    const cam = this.camera;
    cam.fov = fov;
    cam.aspect = this.screen.w / this.screen.h;
    const off = new THREE.Vector3(Math.cos(this.el) * Math.sin(this.az), Math.sin(this.el), Math.cos(this.el) * Math.cos(this.az)).multiplyScalar(L.dist);
    cam.position.copy(L.target).add(off);
    // close up on a model, roll so celestial north is up, as in the famous pictures
    const md = this.model?.L === L ? this.model : null;
    cam.up.set(0, 1, 0);
    if (md && md.a > 0.003) {
      const n = new THREE.Vector3(0, 1, 0).applyQuaternion(md.m.group.getWorldQuaternion(new THREE.Quaternion()));
      const v = off.clone().normalize();
      n.addScaledVector(v, -n.dot(v));
      if (n.lengthSq() > 0.04) cam.up.lerp(n.normalize(), md.a).normalize();
    }
    cam.lookAt(L.target);
    cam.near = Math.max(1e-3, L.dist * 0.002);
    cam.far = L.dist * 6 + 4000;
    cam.updateProjectionMatrix();
    const scale = (this.screen.h * this.screen.pr) / (2 * Math.tan((fov * D2R) / 2));
    // at close range the level's star field is a wall of oversized blobs; dim it behind the model
    const bg = md ? 1 - 0.8 * md.a : 1;
    for (const m of L.pts) {
      m.uniforms.uScale.value = scale;
      m.uniforms.uFade.value = w * bg;
      m.uniforms.uPr.value = this.screen.pr;
      m.uniforms.uMinPx.value = 1.3 * this.screen.pr;
      m.uniforms.uTime.value = this.time;
    }
    for (const [m, base] of L.fades) m.opacity = base * w * bg;
    if (L.sky) { L.sky.position.copy(cam.position); L.sky.material.uniforms.uI.value = MILKY_WAY_SPACE * w; }
    if (L.cmb) L.cmb.uniforms.uFade.value = w * 0.9 * (md ? 1 - 0.7 * md.a : 1);
    if (L.pulse) (L.pulse.material as THREE.SpriteMaterial).opacity = w * (0.45 + 0.25 * Math.sin(this.time * 1.7));
    for (const [m, k] of L.flicker) {
      const t = this.time * 0.35 + k;
      m.opacity *= 0.82 + 0.12 * Math.sin(t) + 0.06 * Math.sin(t * 2.7 + 1.3) + 0.05 * Math.sin(t * 6.1 + k);
    }
    L.events?.frame(cam, this.screen.h, w * bg);
    if (md) {
      md.m.group.visible = md.a > 0.003;
      md.m.setOpacity(md.a * w);
      md.m.update(this.time, cam);
      // its stand-in (painted disc, glow) gives way to it; the neighbours' (say, Andromeda's disc behind M32) fade back
      for (const [k, mats] of this.stand) {
        const f = 1 - (k === md.key ? 1 : 0.85) * md.a;
        for (const m of mats) {
          if (m instanceof THREE.ShaderMaterial) m.uniforms.uFade.value *= f;
          else m.opacity *= f;
        }
      }
      // the model's dust occludes with depth; nothing else in the deep scenes writes or tests it
      if (md.m.group.visible) renderer.clearDepth();
    }
    renderer.render(L.scene, cam);
  }

  /** Positions the labels of level `id` (call right after rendering it); hides every other level's labels. */
  labels(id: DeepScale | null): void {
    for (const L of this.levels.values()) L.labels.hidden = L.id !== id;
    this.placed = [];
    if (!id) { this.meterLabel.hidden = true; return; }
    const L = this.levels.get(id)!;
    this.render0(L);
    this.updateMeasure(L);
    const W = this.screen.w, H = this.screen.h;
    const p = new THREE.Vector3();
    const boxes: [number, number, number][] = [];
    const max = W < 700 ? 12 : 22;
    const fits = (x0: number, y0: number, w: number) => !boxes.some(([bx, by, bw]) => x0 < bx + bw + 6 && x0 + w + 6 > bx && Math.abs(by - y0) < 20);
    const show = (el: HTMLButtonElement, pos: THREE.Vector3, o: DeepObject | 'home', force: boolean): boolean => {
      p.copy(pos).project(this.camera);
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return false;
      const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H;
      const tw = textW(el.textContent ?? '', o === 'home' ? 9 : 8) + (o === 'home' ? 34 : 24);
      // Name to the right of its dot, or to the left when the right side is off-screen or under the chrome.
      const box = (flip: boolean) => flip ? x - tw + 6 : x - 6;
      const ok = (flip: boolean) => { const b = box(flip); return b > 4 && b + tw < W - 4 && !underUI(b, y - 10, tw, 20); };
      let flip = x + tw > W - 6;
      if (!force) {
        if (boxes.length >= max) return false;
        if (!ok(flip) || !fits(box(flip), y, tw)) {
          flip = !flip;
          if (!ok(flip) || !fits(box(flip), y, tw)) return false;
        }
      }
      boxes.push([box(flip), y, tw]);
      this.placed.push({ o, x, y });
      el.classList.toggle('flip', flip);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      return true;
    };
    L.homeLabel.hidden = !show(L.homeLabel, L.home, 'home', true);
    const meas = this.meas?.L === L ? [this.meas.a, this.meas.b] : [];
    const rank = (x: ObjRT) => x.rank + (this.boostMessier && x.o.messier ? 4 : 0) + (meas.includes(x.o.key) ? 8 : 0);
    const order = [...L.objs].sort((a, b) => (b.o === this.sel ? 1 : 0) - (a.o === this.sel ? 1 : 0) || rank(b) - rank(a) || a.pos.distanceTo(L.target) - b.pos.distanceTo(L.target));
    for (const x of order) {
      x.label.hidden = !show(x.label, x.pos, x.o, x.o === this.sel);
      x.label.classList.toggle('on', x.o === this.sel);
    }
    L.events?.tagsAt(this.camera, W, H, lang(), boxes);
  }

  /** Re-applies the camera of level L (labels project with it). */
  private render0(L: LevelRT): void {
    const off = new THREE.Vector3(Math.cos(this.el) * Math.sin(this.az), Math.sin(this.el), Math.cos(this.el) * Math.cos(this.az)).multiplyScalar(L.dist);
    this.camera.position.copy(L.target).add(off);
    this.camera.lookAt(L.target);
    this.camera.updateMatrixWorld();
  }

  relabel(): void {
    const l = lang();
    const HOME: Record<DeepScale, string> = { stars: 'youAreHere', galaxy: 'youAreHere', group: 'sc_galaxy', laniakea: 'sc_group', universe: 'sc_laniakea' };
    for (const L of this.levels.values()) {
      L.homeLabel.textContent = t(HOME[L.id]);
      for (const x of L.objs) x.label.querySelector('span')!.textContent = tr(x.o.name, l);
      for (const paint of L.texts) paint();
    }
  }

  objectsOf(id: DeepScale): DeepObject[] { return DEEP_OBJECTS.filter(o => o.scale === id && !HOME_KEY[id].test(o.key)); }

  /** The Milky Way's painted disc (for card pictures). */
  milkyWayCanvas(): HTMLCanvasElement { return this.milkyWay().tex.image as HTMLCanvasElement; }
}

let haloCv: HTMLCanvasElement | null = null;
/** A broad, soft glow with no bright core (gas haloes). */
function haloCanvas(): HTMLCanvasElement {
  if (haloCv) return haloCv;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!, g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.3, 'rgba(255,255,255,0.22)'); g.addColorStop(0.65, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return (haloCv = c);
}

function gain(p: THREE.Points, g: number): THREE.Points { (p.material as THREE.ShaderMaterial).uniforms.uGain.value = g; return p; }
/** Caps the on-screen size of a point layer (CSS px), so it stays crisp when the camera comes close. */
function maxPx(p: THREE.Points, px: number): THREE.Points { (p.material as THREE.ShaderMaterial).uniforms.uMaxPx.value = px; return p; }

// ---------- card pictures ----------
const thumbCache = new Map<string, HTMLCanvasElement>();

/** A 2:1 picture for a deep object's card, drawn procedurally by kind / shape. */
export function deepThumb(o: DeepObject, mw: () => HTMLCanvasElement, W = 720, H = 360): HTMLCanvasElement {
  const hit = thumbCache.get(o.key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!, seed = hashStr(o.key), r = rng(seed);
  ctx.fillStyle = '#05060b'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.5})`; ctx.fillRect(r() * W, r() * H, 1, 1); }
  ctx.globalCompositeOperation = 'lighter';
  const cx = W / 2, cy = H / 2, glow = glowCanvas();
  const blob = (x: number, y: number, s: number, color: string, a = 1) => { ctx.globalAlpha = a; ctx.drawImage(tint(glow, color), x - s / 2, y - s / 2, s, s); ctx.globalAlpha = 1; };
  const putDisc = (img: HTMLCanvasElement, s: number, tilt: number, rot: number) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, tilt); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
  };
  // galaxies, clusters and quasars with a 3D model: the card shows the model's own portrait
  const art = o.scale !== 'galaxy' && !/milky_way|milkyway/.test(o.key) && (hasGalaxyModel(o.key) || (GAL_KINDS.includes(o.kind) && o.kind !== 'blackhole'))
    ? paintGalaxyArt(o.key, H, { kind: o.kind, morph: o.morph }) : null;
  if (art) {
    ctx.drawImage(art, cx - H / 2, 0, H, H);
    ctx.globalCompositeOperation = 'source-over';
    thumbCache.set(o.key, cv);
    return cv;
  }
  switch (o.kind) {
    case 'galaxy': case 'dwarf': {
      if (/milky_way|milkyway/.test(o.key)) { putDisc(mw(), H * 1.05, 0.55, -0.3); break; }
      if (o.morph === 'spiral' || o.morph === 'barred') {
        const def: DiscDef = genericSpiral(2, 13 + (seed % 9), o.morph === 'barred', seed);
        putDisc(paintDisc(def, sampleDisc(def, 20000, seed, 0.02), 256, 1.3), H * 0.95, 0.35 + r() * 0.5, r() * 3);
      } else putDisc(paintBlob(o.morph ?? 'dwarf', 256, seed), H * 0.9, 1, 0);
      break;
    }
    case 'arm': case 'bar': putDisc(mw(), H * 1.05, 0.55, -0.3); break;
    case 'nebula': case 'remnant': if (hasNebulaModel(o.key)) { const art = paintNebulaArt(o.key, H); if (art) { ctx.drawImage(art, cx - H / 2, 0, H, H); break; } }
      if (o.kind === 'remnant') { ctx.drawImage(paintNebula(256, seed, ['#ff8a3d', '#5cc8ff'], true), cx - H / 2, 0, H, H); break; }
      ctx.drawImage(paintNebula(256, seed, r() < 0.5 ? ['#ff5c8a', '#4fd1c5'] : ['#e05297', '#7aa2ff'], /ring|helix|cat|planetary/i.test(o.wiki)), cx - H / 2, 0, H, H); break;
    case 'starcluster': case 'globular': {
      const glob = o.kind === 'globular';
      for (let i = 0; i < (glob ? 1400 : 60); i++) {
        const rr = glob ? Math.abs(gauss(r)) * H * 0.16 : Math.abs(gauss(r)) * H * 0.22, a = r() * Math.PI * 2;
        blob(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, glob ? 3 + r() * 6 : 8 + r() * 26, glob ? '#ffe6a8' : '#a9c8ff', glob ? 0.6 : 0.9);
      }
      break;
    }
    case 'star': {
      const c = o.spec ? starColor(o.spec) : /betelgeuse|antares|uy_scuti|vy_|proxima|red/i.test(o.key + o.wiki) ? '#ff9a5c' : /rigel|vega|sirius|eta/i.test(o.key) ? '#bcd4ff' : '#fff1c4';
      // bigger, brighter stars get a bigger glow (a red dwarf is a small ember next to Sirius)
      const k = o.spec ? { red_dwarf: 0.62, brown_dwarf: 0.5, white_dwarf: 0.55, orange_dwarf: 0.8, yellow_dwarf: 0.9, white_star: 1, blue_star: 1, giant: 1.1 }[starClass(o.spec)] : 1;
      blob(cx, cy, H * 0.9 * k, c, 0.9); blob(cx, cy, H * 0.3 * k, '#ffffff', 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - H * 0.6, cy); ctx.lineTo(cx + H * 0.6, cy); ctx.moveTo(cx, cy - H * 0.45); ctx.lineTo(cx, cy + H * 0.45); ctx.stroke();
      break;
    }
    case 'blackhole': case 'quasar': {
      const q = o.kind === 'quasar';
      if (o.key === 'dp_gaia_bh1') { // a quiet black hole: no gas falling in, so no glowing disc — just bent starlight
        ctx.strokeStyle = 'rgba(220,235,255,0.55)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, H * 0.2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, H * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        blob(cx + H * 0.55, cy - H * 0.1, H * 0.25, '#fff1c4', 0.9); // its Sun-like companion star
        break;
      }
      if (q) { ctx.strokeStyle = 'rgba(120,220,255,0.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 40, cy + H * 0.48); ctx.lineTo(cx + 40, cy - H * 0.48); ctx.stroke(); }
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, q ? 0.35 : 0.85);
      const g = ctx.createRadialGradient(0, 0, H * 0.14, 0, 0, H * 0.4);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, 'rgba(255,190,90,1)'); g.addColorStop(0.45, 'rgba(255,110,30,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, H * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, H * (q ? 0.05 : 0.15), 0, Math.PI * 2); ctx.fill();
      if (q) { ctx.globalCompositeOperation = 'lighter'; blob(cx, cy, H * 0.35, '#e0f7ff', 1); }
      break;
    }
    case 'cmb': ctx.drawImage(paintCMB(512), 0, 0, W, H); break;
    case 'void': {
      for (let i = 0; i < 900; i++) { const a = r() * Math.PI * 2, rr = H * (0.42 + Math.abs(gauss(r)) * 0.18); blob(cx + Math.cos(a) * rr * 1.5, cy + Math.sin(a) * rr, 4 + r() * 6, '#ffd9a8', 0.5); }
      break;
    }
    default: { // group / cluster / supercluster / wall / deep field: lots of little galaxies
      const wall = o.kind === 'wall', field = o.kind === 'deepfield';
      for (let i = 0; i < (field ? 380 : 700); i++) {
        let x: number, y: number;
        if (field) { x = r() * W; y = r() * H; }
        else if (wall) { const u = r(); x = W * (0.08 + u * 0.84); y = cy + Math.sin(u * 7 + seed) * H * 0.18 + gauss(r) * H * 0.06; }
        else { const rr = Math.abs(gauss(r)) * H * (o.kind === 'supercluster' ? 0.32 : 0.2), a = r() * Math.PI * 2; x = cx + Math.cos(a) * rr * 1.5; y = cy + Math.sin(a) * rr; }
        const cc = r() < 0.5 ? '#ffd6a0' : r() < 0.5 ? '#bcd0ff' : '#ff9fc4';
        blob(x, y, (field ? 3 + r() * 12 : 3 + r() * 9) * (r() < 0.04 ? 2.5 : 1), cc, 0.85);
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  thumbCache.set(o.key, cv);
  return cv;
}

const tintCache = new Map<string, HTMLCanvasElement>();
function tint(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const k = color;
  let c = tintCache.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  tintCache.set(k, c);
  return c;
}
