import { motion } from '../lib/classroom.ts';
import { url } from '../lib/env.ts';
import { t } from '../lib/i18n.ts';
import * as THREE from 'three';
import { QUALITY, AdaptiveResolution, type Quality } from './quality.ts';
import type { CatalogueItem, Lang } from '../../shared/data/types.ts';
import { tr } from '../../shared/data/types.ts';
import { latLonToVec, vecToLatLon, slerpLatLon } from '../../shared/lib/geo.ts';
import { buildModel, modelReady, setModelDetail, whenModelReady } from '../models/library.ts';
import { mat } from '../models/prims.ts';
import { outdoorEnvironment, orientEnvironment } from '../models/environment.ts';
import { paintNightLights, type CountryInfo } from './painter.ts';
import { countryAt, outlinePositions } from './borders.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import { CITIES, cityName } from '../../shared/data/cities.ts';
import { TYPE_META, type LayerKey } from '../../shared/data/typemeta.ts';
import { subsolar } from '../../shared/lib/sun.ts';
import { GlobeLayers, RENDER_ORDER, graticuleStep } from './layers.ts';
import { buildStarField, gmstRad, SPACE_BG } from '../lib/starfield.ts';
import type { StationDots } from './stations.ts';

export type AuraPreset = 'waves' | 'aurora' | 'ember' | 'dusk' | 'sculpture';
export type SurfaceMode = 'realistic' | 'minimal' | 'political';

export const AURA_PRESETS: Record<AuraPreset, { label: string; colors: [string, string, string] }> = {
  waves: { label: 'auraWaves', colors: ['#38bdf8', '#1d4ed8', '#7dd3fc'] },
  aurora: { label: 'auraAurora', colors: ['#2dd4bf', '#0284c7', '#34d399'] },
  ember: { label: 'auraEmber', colors: ['#38bdf8', '#1e40af', '#fbbf24'] },
  dusk: { label: 'auraDusk', colors: ['#60a5fa', '#3730a3', '#818cf8'] },
  sculpture: { label: 'auraSculpture', colors: ['#22d3ee', '#0369a1', '#67e8f9'] },
};

export type Settings = Record<LayerKey, boolean> & {
  names: boolean; borders: boolean; shadows: boolean; sfx: boolean; bgm: boolean;
  /** globe layers: plate boundaries, drifting clouds, polar aurora */
  tectonics: boolean; clouds: boolean; aurora: boolean; graticule: boolean;
  auraPreset: AuraPreset;
  surfaceMode: SurfaceMode;
};
export const DEFAULT_SETTINGS: Settings = {
  names: true, borders: true, shadows: true,
  landmarks: true, animals: true, discoveries: true, vehicles: true,
  dinos: true, foods: true, festivals: true, space: true, plants: true, sports: true, volcanoes: true, migrations: true, voyages: true, people: true,
  tectonics: false, clouds: true, aurora: true, graticule: true,
  sfx: true, bgm: true,
  auraPreset: 'waves', surfaceMode: 'realistic',
};

export const DEFAULT_H = 2.2;
export const MIN_H = 0.07;
/** Environment (image-based) light strength on the models. */
const ENV_INTENSITY = 0.4;
/** Real-time model shadows are drawn only below this camera height, where models are big enough to show them. */
const SHADOW_MAX_H = 0.6;
const SHADOW_STRENGTH = 0.72;
export const MAX_H = 4.5;
export const TIER_ZOOM = [0, 0, 4.3, 5.3];
// zoom readout: ×4.0 at the default altitude, proportional to 1/altitude.
export const zoomFromH = (h: number) => (4 * DEFAULT_H) / h;
export const hFromZoom = (z: number) => (4 * DEFAULT_H) / z;

/** Altitude (in globe radii) at which route items travel, given their current model scale. */
export function routeAltitude(kind: NonNullable<CatalogueItem['route']>['kind'], s: number): number {
  if (kind === 'orbit') return 1.06 + s * 0.6;
  if (kind === 'plane' || kind === 'fly') return 1 + Math.max(0.01, s * 1.4);
  return 1.0;
}
export const GRID_NAMES: Record<string, Record<Lang, string>> = {
  equator: { en: 'Equator', zh: '赤道' }, tropicN: { en: 'Tropic of Cancer', zh: '北回归线' }, tropicS: { en: 'Tropic of Capricorn', zh: '南回归线' },
  arcticC: { en: 'Arctic Circle', zh: '北极圈' }, antarcticC: { en: 'Antarctic Circle', zh: '南极圈' }, prime: { en: 'Prime Meridian', zh: '本初子午线' },
};
export const OCEANS: [string, Record<Lang, string>, number, number][] = [
  ['pacific', { en: 'PACIFIC OCEAN', zh: '太平洋' }, 0, -150],
  ['pacific2', { en: 'PACIFIC OCEAN', zh: '太平洋' }, 15, 165],
  ['atlantic', { en: 'ATLANTIC OCEAN', zh: '大西洋' }, 15, -40],
  ['atlantic2', { en: 'ATLANTIC OCEAN', zh: '大西洋' }, -25, -15],
  ['indian', { en: 'INDIAN OCEAN', zh: '印度洋' }, -20, 78],
  ['arctic', { en: 'ARCTIC OCEAN', zh: '北冰洋' }, 82, 0],
  ['southern', { en: 'SOUTHERN OCEAN', zh: '南冰洋' }, -60, 60],
];

/** 1×1 stand-ins until the relief maps load (uReliefMix is 0 meanwhile anyway). */
const flat = (v: number) => { const t = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1); t.needsUpdate = true; return t; };
const FLAT_LAND = flat(0), FLAT_SEA = flat(255);

// ---- AuraFM Custom GLSL Earth Surface Shaders ----
const EARTH_VERT = `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = `
  uniform sampler2D uLandTex;
  uniform sampler2D uNightTex;
  uniform sampler2D uRelief;   // land height, square-root encoded (r² = 0..~6.4 km)
  uniform sampler2D uSea;      // 1 - ocean depth (0..~8 km)
  uniform vec2 uReliefTexel;   // one texel of the land map in uv
  uniform float uReliefMix;    // 0 until the relief map arrives, then the mode's relief strength
  uniform vec3 uSunDir;
  uniform float uLandMix;
  uniform float uNightMix;
  uniform vec3 uOceanDeep;
  uniform vec3 uOceanMid;
  uniform vec3 uRimColor;
  uniform vec3 uAuraColor;
  uniform vec3 uStationPos;
  uniform float uTime;
  uniform float uAudioBass;
  uniform float uAudioMid;

  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vWorldPos;

  // Bump mapping from screen-space derivatives (as three.js's perturbNormalArb): no tangent frame needed.
  vec3 reliefNormal(vec3 N, out float hLand, out float depth) {
    float r0 = texture2D(uRelief, vUv).r;
    hLand = r0 * r0; depth = 1.0 - texture2D(uSea, vUv).r;
    vec2 dx = dFdx(vUv), dy = dFdy(vUv);
    // Smooth uv gradient from central differences at least a texel apart (a one-pixel step turns bilinear texels into
    // flat facets), then projected onto the screen axes.
    vec2 st = max(uReliefTexel, max(abs(dx), abs(dy)));
    float e = texture2D(uRelief, vUv + vec2(st.x, 0.0)).r, w = texture2D(uRelief, vUv - vec2(st.x, 0.0)).r;
    float n = texture2D(uRelief, vUv + vec2(0.0, st.y)).r, so = texture2D(uRelief, vUv - vec2(0.0, st.y)).r;
    vec2 g = vec2((e * e - w * w) / (2.0 * st.x), (n * n - so * so) / (2.0 * st.y));
    // land relief, exaggerated so ranges read from orbit
    float k = 0.035;
    float hx = dot(g, dx) * k;
    float hy = dot(g, dy) * k;
    vec3 sx = dFdx(vWorldPos), sy = dFdy(vWorldPos);
    vec3 r1 = cross(sy, N), r2 = cross(N, sx);
    float det = dot(sx, r1);
    if (abs(det) < 1e-12) return N;
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    return normalize(abs(det) * N - grad);
  }

  void main() {
    vec3 N = normalize(vNormalWorld);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float facing = max(dot(N, V), 0.0);

    float hLand = 0.0, depth = 0.0;
    vec3 Nr = N;
    if (uReliefMix > 0.001) Nr = reliefNormal(N, hLand, depth);

    vec4 landSample = texture2D(uLandTex, vUv);
    float landMask = smoothstep(0.08, 0.55, landSample.a);

    vec3 ocean = mix(uOceanDeep, uOceanMid, 0.55 + 0.45 * facing);
    // sea floor: pale continental shelves, darker trenches
    float rel = clamp(uReliefMix, 0.0, 1.0);
    vec3 shelf = mix(vec3(0.10, 0.36, 0.48), vec3(0.08, 0.26, 0.42), (1.0 - uLandMix) * 0.6);
    ocean = mix(ocean, shelf, (1.0 - smoothstep(0.0, 0.09, depth)) * 0.75 * rel);
    ocean *= 1.0 - smoothstep(0.45, 0.95, depth) * 0.35 * rel;
    vec3 minimalLand = mix(vec3(0.09, 0.21, 0.36), vec3(0.15, 0.31, 0.50), facing);
    vec3 realisticLand = landSample.rgb * 1.18 + vec3(0.02, 0.04, 0.07);
    // elevation colours on the satellite map: bare rock up high, snow above a latitude-dependent snow line
    float lat = abs(vUv.y - 0.5) * 180.0;
    float rock = smoothstep(0.22, 0.55, hLand) * 0.5;
    realisticLand = mix(realisticLand, vec3(0.46, 0.41, 0.36), rock * rel);
    float snowLine = mix(0.86, 0.14, smoothstep(26.0, 68.0, lat));
    float snow = smoothstep(snowLine, snowLine + 0.1, hLand);
    realisticLand = mix(realisticLand, vec3(0.93, 0.95, 0.98), snow * 0.85 * rel);
    vec3 landColor = mix(minimalLand, realisticLand, uLandMix);

    vec3 base = mix(ocean, landColor, landMask);

    float sunDot = dot(N, normalize(uSunDir));
    float day = mix(1.0, smoothstep(-0.12, 0.18, sunDot), uNightMix);
    float diffuse = max(sunDot, 0.0);

    float viewLight = 0.68 + 0.32 * facing;
    float solarBoost = mix(1.0, 0.88 + 0.24 * day + 0.12 * diffuse, uNightMix);
    vec3 lit = base * viewLight * solarBoost;

    // Hill shading: light from the Sun on the day side; with day/night off, from the upper left of the view (map convention).
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 Lview = normalize(V * 0.55 + camUp * 0.75 - camRight * 0.45);
    vec3 L = normalize(mix(Lview, normalize(uSunDir), uNightMix));
    float shade = dot(Nr, L) - dot(N, L);
    float hillAmt = rel * mix(1.0, day, uNightMix) * mix(0.55, 1.0, landMask);
    // soft response: steep slopes darken but never go black
    lit *= 1.0 + (shade / (1.0 + abs(shade) * 1.6)) * 1.5 * hillAmt;

    // Warm city lights on the night hemisphere (masked to landmasses)
    float lights = texture2D(uNightTex, vUv).r;
    lights *= lights; // keep bright city cores, drop the faint haze between them
    float lightPulse = 1.0 + uAudioMid * 0.35;
    vec3 nightGlow = vec3(1.0, 0.78, 0.46) * lights * landMask * lightPulse * (1.0 - day) * uNightMix * max(0.35, uLandMix) * 0.7;
    lit += nightGlow;

    // Concentric geodesic wave rings radiating from active landmark/object
    if (length(uStationPos) > 0.5) {
      vec3 stDir = normalize(uStationPos);
      float geoDist = acos(clamp(dot(N, stDir), -1.0, 1.0));
      float wave = sin(geoDist * 42.0 - uTime * 3.4) * 0.5 + 0.5;
      float ring = smoothstep(0.84, 0.99, wave) * exp(-geoDist * 4.5);
      float core = exp(-geoDist * 20.0) * 0.38;
      float amp = 0.26 + uAudioBass * 0.48 + uAudioMid * 0.28;
      lit += uAuraColor * (ring + core) * amp;
    }

    // Subtle atmospheric Fresnel rim + preset-tinted edge glow
    float rim = pow(1.0 - facing, 2.6);
    float edgeGlow = pow(1.0 - facing, 4.8);
    lit += uRimColor * rim * (0.28 + 0.24 * day);
    lit += uAuraColor * edgeGlow * (0.24 + uAudioBass * 0.22);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

// ---- AuraFM Outer Planetary Aura / Multi-Layer Atmosphere Shaders ----
const ATMOS_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOS_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCameraDist;
  uniform float uAudioBass;
  uniform float uAudioMid;
  uniform float uAudioHigh;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  void main() {
    float r = length(vUv);
    float angle = atan(vUv.y, vUv.x);

    // Exact perspective silhouette radius of the unit sphere at camera distance
    float c2 = max(0.18, uCameraDist * uCameraDist - 1.0);
    float rLimb = uCameraDist / sqrt(c2);

    // Smoothly attenuate outer billboard when zooming very close to the surface
    float zoomFade = smoothstep(1.18, 1.55, uCameraDist);

    // Distance outward from the Earth's 3D limb
    float d = max(0.0, r - rLimb * 0.995);

    // 1. Dense Rayleigh Horizon Rim
    float rayleigh = exp(-d * 18.0) * (0.48 + uAudioBass * 0.22);

    // 2. Stratosphere Swell
    float breath = 1.0 + 0.04 * sin(uTime * 0.7) + uAudioBass * 0.14;
    float strato = exp(-d * (6.2 / breath)) * (0.26 + uAudioBass * 0.18);

    // 3. Silky Ionosphere Aurora Veil (low-order harmonic waves)
    float w1 = sin(angle * 2.0 + uTime * 0.22);
    float w2 = cos(angle * 3.0 - uTime * 0.17);
    float w3 = sin(angle * 4.0 + uTime * 0.11);
    float harmonic = (w1 * 0.45 + w2 * 0.35 + w3 * 0.20) * 0.5 + 0.5;
    float veil = exp(-pow((d - 0.045 - harmonic * 0.055) / 0.13, 2.0))
               * (0.14 + harmonic * 0.14)
               * (0.75 + uAudioMid * 0.45);

    // 4. Wide Exosphere Deep-Space Halo
    float exo = exp(-d * 2.2) * (0.09 + uAudioHigh * 0.07);

    vec3 col = uColorA * (rayleigh + strato * 0.75)
             + mix(uColorB, uColorC, harmonic) * (veil + strato * 0.35)
             + uColorB * exo;

    float outerFade = 1.0 - smoothstep(1.35, 2.35, r);
    col *= outerFade * zoomFade;

    // Smooth filmic tone mapping
    col = col / (1.0 + col * 0.65);

    float alpha = clamp((rayleigh + strato + veil + exo) * outerFade * zoomFade, 0.0, 0.88);
    gl_FragColor = vec4(col, alpha);
  }
`;

interface Placed {
  item: CatalogueItem; obj: THREE.Group; seg: number; t: number; pts: [number, number][]; heading: THREE.Vector3;
  /** surface normal (static items) for horizon culling */
  n: THREE.Vector3;
  /** sub-objects with procedural animation ('spin' / 'flap'), collected once instead of traversing every frame */
  anim: THREE.Object3D[];
  /** model radius (model units) and whether the far level of detail is active */
  radius: number;
  far: boolean;
  /** slot in the instanced plinth batch (shadow + ring), -1 if the item has no plinth */
  slot: number;
  /** hidden by the visible-model budget (too many models in view for this device) */
  cull: boolean;
}


export interface GlobeEvents {
  onPick?: (item: CatalogueItem | null) => void;
  onHover?: (item: CatalogueItem | null, screen: { x: number; y: number } | null) => void;
  onGlobeTap?: (lat: number, lon: number) => void;
  onView?: (zoom: number, lat: number, lon: number) => void;
  onFirst?: (what: 'drag' | 'zoom') => void;
  /** Kept zooming out past the widest view (wheel / pinch / zoom-out button): time to show the Solar System. */
  onBeyond?: () => void;
  /** Radio on: a station dot was tapped / hovered (index into the station list, -1 = none). */
  onStation?: (i: number) => void;
  onStationHover?: (i: number, screen: { x: number; y: number } | null) => void;
}

export class Globe {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private stars!: THREE.Points;
  earth!: THREE.Mesh;
  private earthMat!: THREE.ShaderMaterial;
  private earthUniforms!: {
    uLandTex: { value: THREE.Texture };
    uNightTex: { value: THREE.Texture };
    uRelief: { value: THREE.Texture };
    uSea: { value: THREE.Texture };
    uReliefMix: { value: number };
    uReliefTexel: { value: THREE.Vector2 };
    uSunDir: { value: THREE.Vector3 };
    uLandMix: { value: number };
    uNightMix: { value: number };
    uOceanDeep: { value: THREE.Color };
    uOceanMid: { value: THREE.Color };
    uRimColor: { value: THREE.Color };
    uAuraColor: { value: THREE.Color };
    uStationPos: { value: THREE.Vector3 };
    uTime: { value: number };
    uAudioBass: { value: number };
    uAudioMid: { value: number };
  };
  private atmosMesh!: THREE.Mesh;
  private atmosUniforms!: {
    uTime: { value: number };
    uCameraDist: { value: number };
    uAudioBass: { value: number };
    uAudioMid: { value: number };
    uAudioHigh: { value: number };
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
    uColorC: { value: THREE.Color };
  };
  private borderLines: THREE.LineSegments | null = null;
  private borderMat = new THREE.LineBasicMaterial({ color: '#f1f5f9', transparent: true, opacity: 0.5, depthWrite: false });
  /** Border opacity [widest view, close up] for the current surface style. */
  private borderTone: [number, number] = [0.42, 0.85];
  /** Shapes for hover/tap lookups and highlight outlines: the 1:50m set once it has loaded, else the painted 1:110m one. */
  private borderShapes: CountryInfo[] | null = null;
  private hoverCountry: CountryInfo | null = null;
  private pickedCountry: { c: CountryInfo; at: THREE.Vector3 } | null = null;
  private cursor: { x: number; y: number } | null = null;
  private hiShown: CountryInfo | null = null;
  private hiLines: THREE.LineSegments | null = null;
  private hiMat = new THREE.LineBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.95, depthWrite: false });
  private countryTag: HTMLDivElement;
  private tagFor = '';
  private sun = new THREE.DirectionalLight(0xfffbeb, 2.55);
  private fillLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
  private ambient = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 1.15);
  private shadowTex: THREE.CanvasTexture | null = null;
  private itemsRoot = new THREE.Group();
  private pinsRoot = new THREE.Group();
  private flightArcGroup = new THREE.Group();
  private placed = new Map<string, Placed>();
  /**
   * Items whose models are not built yet. Only items that would actually be visible (layer on, zoomed in far
   * enough, on the camera's side of the globe) are built, a few per frame, once their hero pack has loaded.
   */
  private pending = new Map<string, CatalogueItem>();
  private pendingN = new Map<string, THREE.Vector3>();
  private modelWait = new Set<string>();
  /** Every plinth (soft contact shadow + type-coloured ring) is drawn by two instanced meshes: 2 draw calls in total. */
  private plinths: { shadow: THREE.InstancedMesh; ring: THREE.InstancedMesh; size: number[]; used: number } | null = null;
  private lastDrain = 0;
  private labelsEl: HTMLDivElement;
  private labelPool: HTMLSpanElement[] = [];
  private countries: CountryInfo[] = [];
  private selRing: THREE.Group;
  private selOuterMat: THREE.MeshBasicMaterial;
  private selInnerMat: THREE.MeshBasicMaterial;
  private selected: string | null = null;
  private hoveredKey: string | null = null;
  private targetColorA = new THREE.Color('#38bdf8');
  private targetColorB = new THREE.Color('#1d4ed8');
  private targetColorC = new THREE.Color('#7dd3fc');

  lat = 25; lon = 40; h = DEFAULT_H;
  private vLat = 0; private vLon = 0;
  private fly: { from: [number, number, number]; to: [number, number, number]; t: number; dur: number } | null = null;
  ride: { key: string; yaw: number; dist: number; first: boolean } | null = null;
  settings: Settings = { ...DEFAULT_SETTINGS };
  lang: Lang = 'en';
  gameMode = false;
  /** A lesson's [min, max] camera height: zooming stays inside it and never leaves the globe. */
  zoomRange: [number, number] | null = null;
  /** While the Solar System view is up, the globe stops rendering. */
  private isPaused = false;
  get paused(): boolean { return this.isPaused; }
  set paused(v: boolean) {
    this.isPaused = v;
    if (v) { this.hoverCountry = null; this.cursor = null; this.countryTag.hidden = true; }
    this.dirty = true;
  }
  private overshoot = { v: 0, t: 0 };
  /** Optional extra visibility predicate (e.g. the time machine); selected/ridden items always stay visible. */
  private itemFilter: ((it: CatalogueItem) => boolean) | null = null;
  setItemFilter(fn: ((it: CatalogueItem) => boolean) | null): void { this.itemFilter = fn; this.dirty = true; }
  /**
   * Lesson mode (geography lessons): only these items are shown, at any zoom and whatever the layer switches say;
   * their journeys are drawn in full. `null` = normal browsing.
   */
  private lessonKeys: Set<string> | null = null;
  setLessonItems(keys: Iterable<string> | null): void { this.lessonKeys = keys ? new Set(keys) : null; this.dirty = true; }
  /** When set, the Sun (day/night line, sub-solar point, stars) is placed for this instant (UTC ms) instead of now. */
  simTime: number | null = null;
  /** Show the day/night line even when the "Day & night" setting is off (lessons about rotation and seasons). */
  forceNight = false;
  /** Called every frame before the scene renders (lesson overlays); `dt` is real milliseconds. */
  readonly frameHooks = new Set<(dt: number) => void>();
  /** Taps on the globe go to `ev.onGlobeTap` instead of picking (lesson "find it on the globe" questions). */
  captureTaps = false;
  /** Lessons: keep a top-down, map-like view at every height (no pitch toward the horizon when zoomed in). */
  flatView = false;
  /** Where the globe's centre is drawn, in px from the canvas centre (eased), so a side card does not cover it. */
  private shift = { x: 0, y: 0, tx: 0, ty: 0 };
  setViewShift(x: number, y: number): void { this.shift.tx = x; this.shift.ty = y; this.dirty = true; }
  countryShapes(): readonly CountryInfo[] { return this.countries; }
  /** The finest country shapes loaded so far (1:50m, with the small island states, once they arrive). */
  fineShapes(): readonly CountryInfo[] { return this.shapes(); }
  /** Temporary layer switches on top of the user's settings (lessons hide clouds, labels…); never saved. */
  private layerOverride: Partial<Settings> | null = null;
  private effective: Settings | null = null;
  setLayerOverride(o: Partial<Settings> | null): void { this.layerOverride = o; this.effective = null; this.pickedCountry = this.hoverCountry = null; this.dirty = true; }
  private get eff(): Settings { return this.layerOverride ? (this.effective ??= { ...this.settings, ...this.layerOverride }) : this.settings; }
  private radio: StationDots | null = null;
  /** The playing radio station (unit vector): the surface ripples spread from it when nothing is selected. */
  beacon: THREE.Vector3 | null = null;
  private audioLevel = 0;
  private layers: GlobeLayers | null = null;
  private dirty = true;
  private last = performance.now();
  private lastLabel = 0;
  private clock = 0;
  private lastBudget = -1e9;
  private lastRender = 0;
  private adapt: AdaptiveResolution | null = null;

  /** lowfx = reduced motion (frozen animations); quality = resolution / detail tier for this device. */
  constructor(private container: HTMLElement, public ev: GlobeEvents, private lowfx = false,
    readonly quality: Quality = QUALITY[lowfx ? 'low' : 'high']) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.005, 100);
    this.labelsEl = document.createElement('div');
    this.labelsEl.className = 'labels';
    this.countryTag = document.createElement('div');
    this.countryTag.className = 'country-tag';
    this.countryTag.hidden = true;

    // AuraFM dual-layer glowing selection beacon
    this.selRing = new THREE.Group();
    this.selOuterMat = new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    this.selInnerMat = new THREE.MeshBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.98, 40).rotateX(-Math.PI / 2), this.selOuterMat);
    outer.name = 'outer';
    const pulse = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    pulse.name = 'pulse';
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.76, 32).rotateX(-Math.PI / 2), this.selInnerMat);
    inner.position.y = -0.002;
    this.selRing.add(inner, outer, pulse);
    this.selRing.visible = false;
  }

  /** Returns false if WebGL is unavailable. */
  init(earthCanvas: HTMLCanvasElement, countries: CountryInfo[], items: CatalogueItem[], borderPositions?: Float32Array): boolean {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.msaa, alpha: false, powerPreference: 'high-performance' });
      // production builds skip the synchronous shader-log queries (they stall the GPU pipeline on every new program)
      this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    } catch { return false; }
    this.countries = countries;
    const r = this.renderer, q = this.quality;
    const dpr = Math.min(q.dprMax, devicePixelRatio || 1);
    r.setPixelRatio(dpr);
    // Reduced motion renders on demand, so frame intervals say nothing about cost there.
    if (!this.lowfx) this.adapt = new AdaptiveResolution(Math.min(q.dprMin, dpr), dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.className = 'globe-canvas';
    r.domElement.setAttribute('aria-label', t('globeLabel'));
    r.domElement.tabIndex = 0;
    this.container.append(r.domElement, this.labelsEl, this.countryTag);
    this.scene.background = new THREE.Color(SPACE_BG);

    const landTex = new THREE.CanvasTexture(earthCanvas);
    landTex.colorSpace = THREE.SRGBColorSpace;
    landTex.anisotropy = r.capabilities.getMaxAnisotropy();

    const nightCanvas = paintNightLights(countries, q.nightW);
    const nightTex = new THREE.CanvasTexture(nightCanvas);
    nightTex.anisotropy = r.capabilities.getMaxAnisotropy();

    this.earthUniforms = {
      uLandTex: { value: landTex },
      uNightTex: { value: nightTex },
      uRelief: { value: FLAT_LAND },
      uSea: { value: FLAT_SEA },
      uReliefMix: { value: 0 },
      uReliefTexel: { value: new THREE.Vector2(1, 1) },
      uSunDir: { value: new THREE.Vector3(1, 0.2, 0.5).normalize() },
      uLandMix: { value: this.settings.surfaceMode === 'minimal' ? 0.0 : 1.0 },
      uNightMix: { value: this.settings.shadows ? 1.0 : 0.0 },
      uOceanDeep: { value: new THREE.Color('#0c2340') },
      uOceanMid: { value: new THREE.Color('#163a63') },
      uRimColor: { value: new THREE.Color('#3d6fae') },
      uAuraColor: { value: new THREE.Color('#38bdf8') },
      uStationPos: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 },
      uAudioBass: { value: 0.12 },
      uAudioMid: { value: 0.1 },
    };

    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
      uniforms: this.earthUniforms,
    });

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, q.earthSeg[0], q.earthSeg[1]), this.earthMat);
    // Our lat/lon convention puts lon=0 on +Z; SphereGeometry's u=0 seam is at -X, so rotate by -90°.
    this.earth.rotation.y = -Math.PI / 2;
    this.earth.renderOrder = RENDER_ORDER.earth;

    if (borderPositions) this.setBorderPositions(borderPositions);

    this.loadRelief();
    this.scene.add(this.earth, this.itemsRoot, this.pinsRoot, this.flightArcGroup, this.sun, this.sun.target, this.fillLight, this.fillLight.target, this.ambient, this.selRing);
    this.setupModelLighting();
    this.addAtmosphere();
    this.addStars();
    this.layers = new GlobeLayers(r, this.scene, items, this.earthUniforms.uSunDir.value, this.lowfx, q);
    this.queuePlacement(items);
    this.applySettings(this.settings);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.bindInput(r.domElement);
    const loop = () => { if (!this.paused) this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return true;
  }

  /** Elevation + ocean depth (NASA/GEBCO) for hill shading, snow lines and sea-floor tints; loads after the globe shows. */
  private reliefReady = false;
  private loadRelief(): void {
    const load = (file: string) => new Promise<THREE.Texture>((ok, fail) => new THREE.TextureLoader().load(url('data/relief/' + file), ok, undefined, fail));
    Promise.all([load(`land-${this.quality.reliefW}.webp`), load('sea-1024.webp')]).then(([land, sea]) => {
      land.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.earthUniforms.uRelief.value = land;
      this.earthUniforms.uReliefTexel.value.set(1 / this.quality.reliefW, 2 / this.quality.reliefW);
      this.earthUniforms.uSea.value = sea;
      this.reliefReady = true;
      this.dirty = true;
    }, () => { /* stay flat: the painted map still works */ });
  }

  /** Country shapes for hover/tap lookups and highlight outlines (finer than the painted map once they load). */
  setCountryShapes(shapes: CountryInfo[]): void {
    this.borderShapes = shapes;
    this.hoverCountry = null;
    const p = this.pickedCountry;
    if (p) {
      const [la, lo] = vecToLatLon(p.at.x, p.at.y, p.at.z);
      const c = countryAt(shapes, la, lo);
      this.pickedCountry = c ? { c, at: p.at } : null;
    }
    this.dirty = true;
  }

  setBorderPositions(pos: Float32Array): void {
    if (this.borderLines) {
      this.scene.remove(this.borderLines);
      this.borderLines.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.borderLines = new THREE.LineSegments(geo, this.borderMat);
    this.borderLines.visible = this.eff.borders;
    this.scene.add(this.borderLines);
    this.dirty = true;
  }

  setEarthTexture(cv: HTMLCanvasElement): void {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.earthUniforms.uLandTex.value?.dispose();
    this.earthUniforms.uLandTex.value = tex;
    this.dirty = true;
  }

  private addAtmosphere(): void {
    this.atmosUniforms = {
      uTime: { value: 0 },
      uCameraDist: { value: 3.2 },
      uAudioBass: { value: 0.12 },
      uAudioMid: { value: 0.1 },
      uAudioHigh: { value: 0.08 },
      uColorA: { value: new THREE.Color('#38bdf8') },
      uColorB: { value: new THREE.Color('#1d4ed8') },
      uColorC: { value: new THREE.Color('#7dd3fc') },
    };
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      uniforms: this.atmosUniforms,
    });
    this.atmosMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), m);
    this.scene.add(this.atmosMesh);
  }

  private addStars(): void {
    // Real sky at infinity in the Earth-fixed frame (equatorial at Greenwich sidereal time 0), turned by the
    // real sidereal time so the stars above each place are the ones really overhead.
    this.stars = buildStarField(this.quality.stars * 2, (x, y, z, out) => out.set(y, z, x), 60);
    this.stars.rotation.y = -gmstRad(Date.now());
    this.scene.add(this.stars);
  }

  private orientAt(obj: THREE.Object3D, lat: number, lon: number, r: number, heading?: THREE.Vector3): void {
    const N = new THREE.Vector3(...latLonToVec(lat, lon));
    obj.position.copy(N).multiplyScalar(r);
    let z: THREE.Vector3;
    if (heading && heading.lengthSq() > 1e-12) z = heading.clone().sub(N.clone().multiplyScalar(heading.dot(N))).normalize();
    else { const north = this.northAt(lat, lon); z = north.negate(); }
    const x = new THREE.Vector3().crossVectors(N, z).normalize();
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, N, z));
  }

  private northAt(lat: number, lon: number): THREE.Vector3 {
    const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
    return new THREE.Vector3(-Math.sin(p) * Math.sin(l), Math.cos(p), -Math.sin(p) * Math.cos(l));
  }

  private getShadowTexture(): THREE.CanvasTexture {
    if (this.shadowTex) return this.shadowTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
    grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.shadowTex = new THREE.CanvasTexture(cv);
    return this.shadowTex;
  }

  /** Soft contact-shadow decal; each instance's colour (red channel) scales its opacity. */
  private shadowMaterial(): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ map: this.getShadowTexture(), transparent: true, depthWrite: false });
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#ifdef USE_COLOR\n  diffuseColor.a *= vColor.r;\n#endif');
    };
    m.customProgramCacheKey = () => 'shadow-alpha';
    return m;
  }

  /** Reserves a plinth slot for an item (or -1 when its type has none). */
  private plinthSlot(item: CatalogueItem): number {
    const meta = TYPE_META[item.type];
    // travellers get a ground shadow only (size -1); orbiting craft are far above any surface
    const ground = !!item.route && item.route.kind !== 'orbit';
    if (!ground && (item.route || !meta.plinth)) return -1;
    let b = this.plinths;
    if (!b || b.used === b.shadow.count) {
      const cap = Math.max(256, (b?.used ?? 0) * 2);
      const shadowMat = (b?.shadow.material as THREE.Material) ?? this.shadowMaterial();
      const ringMat = (b?.ring.material as THREE.Material) ?? new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
      const shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat, cap);
      const ring = new THREE.InstancedMesh(new THREE.RingGeometry(0.92, 1.0, 28).rotateX(-Math.PI / 2), ringMat, cap);
      ring.renderOrder = 1; // over the shadows
      for (const m of [shadow, ring]) {
        m.frustumCulled = false; // instances move every frame; their bounds are not tracked
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.matrixAutoUpdate = false;
      }
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const white = new THREE.Color();
      for (let i = 0; i < cap; i++) { shadow.setMatrixAt(i, zero); ring.setMatrixAt(i, zero); ring.setColorAt(i, white); shadow.setColorAt(i, white); }
      if (b) {
        shadow.instanceMatrix.array.set(b.shadow.instanceMatrix.array);
        shadow.instanceColor!.array.set(b.shadow.instanceColor!.array);
        ring.instanceMatrix.array.set(b.ring.instanceMatrix.array);
        ring.instanceColor!.array.set(b.ring.instanceColor!.array);
        this.itemsRoot.remove(b.shadow, b.ring);
        b.shadow.geometry.dispose(); b.ring.geometry.dispose();
        b.shadow.dispose(); b.ring.dispose();
      }
      b = this.plinths = { shadow, ring, size: b?.size ?? [], used: b?.used ?? 0 };
      this.itemsRoot.add(shadow, ring);
    }
    const slot = b.used++;
    b.size[slot] = ground ? -1 : meta.plinth;
    b.ring.setColorAt(slot, new THREE.Color(meta.color));
    b.ring.instanceColor!.needsUpdate = true;
    return slot;
  }

  /** Writes this frame's plinth transforms (hidden items get a zero matrix). */
  private updatePlinths(): void {
    const b = this.plinths;
    if (!b) return;
    const m = new THREE.Matrix4(), k = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const gp = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const p of this.placed.values()) {
      if (p.slot < 0) continue;
      if (!p.obj.visible) { b.shadow.setMatrixAt(p.slot, zero); b.ring.setMatrixAt(p.slot, zero); continue; }
      p.obj.updateMatrix();
      const r = b.size[p.slot];
      if (r < 0) {
        // ground shadow of a traveller: dropped straight down to the surface, wider and fainter the higher it flies
        const lift = Math.max(0, p.obj.position.length() - 1) / Math.max(1e-6, p.obj.scale.x);
        const w = p.radius * 1.5 * (1 + lift * 0.35) * p.obj.scale.x;
        m.compose(gp.copy(p.obj.position).normalize().multiplyScalar(1.0004), p.obj.quaternion, sc.set(w, 1, w));
        b.shadow.setMatrixAt(p.slot, m);
        b.shadow.setColorAt(p.slot, col.setScalar(Math.max(0.18, 0.85 - lift * 0.3)));
        b.ring.setMatrixAt(p.slot, zero);
        continue;
      }
      b.shadow.setMatrixAt(p.slot, m.copy(p.obj.matrix).multiply(k.makeScale(r * 2.5, 1, r * 2.5).setPosition(0, 0.004, 0)));
      b.ring.setMatrixAt(p.slot, m.copy(p.obj.matrix).multiply(k.makeScale(r, 1, r).setPosition(0, 0.006, 0)));
    }
    b.shadow.instanceMatrix.needsUpdate = b.ring.instanceMatrix.needsUpdate = true;
    b.shadow.instanceColor!.needsUpdate = true;
  }


  private queuePlacement(items: CatalogueItem[]): void {
    // Nearest-to-camera first so the visible hemisphere fills in before the far side.
    const cam = new THREE.Vector3(...latLonToVec(this.lat, this.lon));
    const nv = (it: CatalogueItem) => new THREE.Vector3(...latLonToVec(it.lat, it.lon));
    for (const it of [...items].sort((a, b) => cam.dot(nv(b)) - cam.dot(nv(a)))) { this.pending.set(it.key, it); this.pendingN.set(it.key, nv(it)); }
  }

  /** Cosine of the angle from the camera axis beyond which surface points are hidden behind the globe. */
  private horizonCos(margin: number): number { return 1 / Math.max(1.0001, this.camera.position.length()) - margin; }

  /** Whether an item should be shown right now, ignoring which side of the globe it is on. */
  /** Whether an item is switched on for browsing (its layer and any time filter), whatever the zoom: the flat map's pins. */
  listed(it: CatalogueItem): boolean {
    return this.settings[TYPE_META[it.type].layer] && (!this.itemFilter || this.itemFilter(it));
  }

  private shown(it: CatalogueItem): boolean {
    const focus = this.selected === it.key || this.ride?.key === it.key;
    if (focus) return true;
    if (this.lessonKeys) return this.lessonKeys.has(it.key);
    return !this.gameMode && this.settings[TYPE_META[it.type].layer] && this.zoom >= TIER_ZOOM[it.tier] && (!this.itemFilter || this.itemFilter(it));
  }

  private drainPlacement(budgetMs: number): void {
    const t0 = performance.now();
    const cdir = this.camera.position.clone().normalize(), hz = this.horizonCos(0.3);
    for (const [key, it] of this.pending) {
      if (!this.shown(it)) continue;
      const focus = this.selected === key || this.ride?.key === key;
      if (!it.route && !focus && this.pendingN.get(key)!.dot(cdir) < hz) continue;
      if (!modelReady(it.model)) { this.requestModel(it); continue; }
      this.pending.delete(key);
      this.pendingN.delete(key);
      this.place(it);
      this.dirty = true;
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  private requestModel(it: CatalogueItem): void {
    if (this.modelWait.has(it.key)) return;
    this.modelWait.add(it.key);
    void whenModelReady(it.model).then(() => { this.modelWait.delete(it.key); this.dirty = true; },
      () => { setTimeout(() => this.modelWait.delete(it.key), 30e3); }); // try again later rather than every frame
  }

  /** Builds an item's model immediately if it is still queued and loadable (used when the UI targets it directly). */
  private ensurePlaced(key: string | null): Placed | null {
    if (!key) return null;
    const it = this.pending.get(key);
    if (it) {
      if (!modelReady(it.model)) { this.requestModel(it); return null; }
      this.pending.delete(key); this.pendingN.delete(key); this.place(it);
    }
    return this.placed.get(key) ?? null;
  }

  /** Loads (if needed) and places an item's model so it can be targeted, e.g. before starting a ride. */
  async prepare(key: string): Promise<boolean> {
    const it = this.pending.get(key) ?? this.placed.get(key)?.item;
    if (!it) return false;
    try { await whenModelReady(it.model); } catch { return false; }
    return this.ensurePlaced(key) !== null;
  }

  private place(item: CatalogueItem): void {
    const obj = buildModel(item.model);
    obj.userData.key = item.key;
    const wrap = new THREE.Group();
    wrap.add(obj);
    const anim: THREE.Object3D[] = [];
    obj.traverse(o => {
      if (o.name === 'spin' || o.name === 'flap') anim.push(o);
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m)) o.castShadow = o.receiveShadow = !m.transparent;
    });
    const p: Placed = { item, obj: wrap, seg: 0, t: 0, pts: item.route ? item.route.pts.map(x => [x[0], x[1]] as [number, number]) : [], heading: new THREE.Vector3(),
      n: new THREE.Vector3(...latLonToVec(item.lat, item.lon)), anim, radius: obj.userData.radius ?? 0.6, far: false, slot: this.plinthSlot(item), cull: false };
    if (item.route) {
      // Spread vehicles along their routes deterministically.
      const h = [...item.key].reduce((a, c) => a + c.charCodeAt(0), 0);
      p.seg = h % Math.max(1, item.route.pts.length - 1);
      p.t = (h % 97) / 97;
    }
    this.orientAt(wrap, item.lat, item.lon, 1.0);
    this.itemsRoot.add(wrap);
    this.placed.set(item.key, p);
  }

  /** Image-based light for the models, plus real-time shadows from the key light where the tier allows. */
  private setupModelLighting(): void {
    this.scene.environment = outdoorEnvironment(this.renderer);
    this.scene.environmentIntensity = ENV_INTENSITY;
    const n = this.quality.shadowMap;
    if (!n) return;
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(n, n);
    this.sun.shadow.intensity = 0;
  }

  /** Fits the key light's shadow box to the area around `centre` (half-size `half`), or switches shadows off. */
  private frameShadows(centre: THREE.Vector3 | null, half: number, keyDir: THREE.Vector3): void {
    const sh = this.sun.shadow;
    if (!this.quality.shadowMap) return;
    const on = !!centre && this.settings.shadows;
    sh.intensity = on ? SHADOW_STRENGTH : 0;
    // until a shadow map exists three binds a placeholder that shadow-sampler arrays reject (r186), which drops every
    // lit model's draw call, so the map is rendered at least once even while shadows are off
    this.renderer.shadowMap.needsUpdate = on || !sh.map;
    if (!on) return;
    const c = sh.camera as THREE.OrthographicCamera;
    const d = half * 3;
    this.sun.position.copy(centre).addScaledVector(keyDir, d);
    this.sun.target.position.copy(centre);
    this.sun.target.updateMatrixWorld();
    c.left = c.bottom = -half; c.right = c.top = half;
    c.near = d * 0.2; c.far = d * 2;
    c.updateProjectionMatrix();
    sh.normalBias = (2 * half / this.quality.shadowMap) * 1.5;
    sh.bias = -0.0005;
  }

  applySettings(s: Settings): void {
    this.effective = null;
    this.settings = { ...DEFAULT_SETTINGS, ...s };
    this.sun.intensity = this.settings.shadows ? 2.6 : 0.9;
    this.ambient.intensity = this.settings.shadows ? 0.18 : 1.3;
    this.labelsEl.style.display = this.settings.names ? '' : 'none';
    const mode = this.settings.surfaceMode;
    this.borderMat.color.set(mode === 'minimal' ? '#7dd3fc' : '#f1f5f9');
    this.borderTone = mode === 'minimal' ? [0.6, 0.95] : mode === 'political' ? [0.5, 0.9] : [0.42, 0.85];
    if (!this.settings.borders) { this.hoverCountry = null; this.pickedCountry = null; }
    const preset = AURA_PRESETS[this.settings.auraPreset ?? 'waves'] ?? AURA_PRESETS.waves;
    this.targetColorA.set(preset.colors[0]);
    this.targetColorB.set(preset.colors[1]);
    this.targetColorC.set(preset.colors[2]);
    this.dirty = true;
  }

  /** Draws an AuraFM-style glowing orbital telemetry arc between two coordinates. */
  showFlightArc(from: [number, number], to: [number, number], keep = false): void {
    if (!keep) this.flightArcGroup.clear();
    const dist = this.angDist(from, to);
    if (dist < 0.03) return;
    const pts: THREE.Vector3[] = [];
    const n = 64;
    const peak = Math.min(0.28, (dist / Math.PI) * 0.28);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [la, lo] = slerpLatLon(from, to, t);
      const r = 1.003 + Math.sin(Math.PI * t) * peak;
      pts.push(new THREE.Vector3(...latLonToVec(la, lo, r)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.65, depthWrite: false }));
    this.flightArcGroup.add(line);
    this.dirty = true;
  }

  get zoom(): number { return zoomFromH(this.h); }

  // ---------- input ----------
  private bindInput(el: HTMLCanvasElement): void {
    const ptrs = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number } | null = null;
    let pinch0 = 0, h0 = this.h, moved = false;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); h0 = this.h; }
      this.vLat = this.vLon = 0; this.fly = null;
    });
    el.addEventListener('pointermove', e => {
      const prev = ptrs.get(e.pointerId);
      if (!prev) {
        if (this.radio && !this.gameMode && !this.ride) {
          const rect = el.getBoundingClientRect();
          const si = this.radio.pick(e.clientX - rect.left, e.clientY - rect.top, this.camera, el.clientWidth, el.clientHeight);
          if (si !== this.radio.hover) { this.radio.hover = si; this.dirty = true; }
          if (si >= 0) {
            if (this.hoveredKey) { this.hoveredKey = null; this.ev.onHover?.(null, null); }
            this.hoverCountryAt(null);
            el.style.cursor = 'pointer';
            this.ev.onStationHover?.(si, this.stationScreen(si));
            return;
          }
          this.ev.onStationHover?.(-1, null);
        }
        if (!this.gameMode && !this.ride) {
          const rect = el.getBoundingClientRect();
          const hit = this.pickAt(e.clientX - rect.left, e.clientY - rect.top);
          this.hoverCountryAt(hit ? null : e.clientX - rect.left, e.clientY - rect.top);
          const nextKey = hit?.key ?? null;
          if (nextKey !== this.hoveredKey) {
            this.hoveredKey = nextKey;
            el.style.cursor = hit ? 'pointer' : 'grab';
            this.ev.onHover?.(hit, hit ? this.itemScreen(hit.key) : null);
            this.dirty = true;
          } else if (hit) {
            this.ev.onHover?.(hit, this.itemScreen(hit.key));
          }
        }
        return;
      }
      const cur = { x: e.clientX, y: e.clientY };
      ptrs.set(e.pointerId, cur);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0 && d > 1) {
          const want = h0 * (pinch0 / d);
          this.setH(want);
          if (want > MAX_H * 1.35 && !this.ride && !this.gameMode && !this.zoomRange) { pinch0 = 0; this.ev.onBeyond?.(); }
        }
        moved = true;
        this.ev.onFirst?.('zoom');
        return;
      }
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (down && Math.hypot(cur.x - down.x, cur.y - down.y) > 6) moved = true;
      if (!moved) return;
      if (this.hoveredKey) {
        this.hoveredKey = null;
        this.ev.onHover?.(null, null);
      }
      if (this.hoverCountry) this.hoverCountryAt(null);
      if (this.ride) { this.ride.yaw -= dx * 0.008; this.dirty = true; return; }
      const k = this.degPerPx();
      this.lon -= dx * k / Math.max(0.2, Math.cos((this.lat * Math.PI) / 180));
      this.lat = Math.max(-85, Math.min(85, this.lat + dy * k));
      this.vLon = -dx * k; this.vLat = dy * k;
      this.dirty = true;
      this.ev.onFirst?.('drag');
    });
    el.addEventListener('pointerleave', () => {
      if (this.radio && this.radio.hover >= 0) { this.radio.hover = -1; this.ev.onStationHover?.(-1, null); }
      this.hoverCountryAt(null);
      if (this.hoveredKey) {
        this.hoveredKey = null;
        el.style.cursor = '';
        this.ev.onHover?.(null, null);
      }
    });
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (down && !moved && performance.now() - down.t < 600 && ptrs.size === 0) this.tap(e.clientX, e.clientY);
      if (ptrs.size === 0) down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.ride) { this.ride.dist = Math.max(0.5, Math.min(6, this.ride.dist * Math.exp(e.deltaY * 0.0015))); this.dirty = true; return; }
      this.setH(this.h * Math.exp(e.deltaY * 0.0015));
      this.ev.onFirst?.('zoom');
      // Wheeling on outward at the widest view builds up "overshoot"; enough of it opens the Solar System.
      const now = performance.now();
      if (e.deltaY > 0 && this.h >= MAX_H - 1e-3 && !this.fly && !this.gameMode && !this.zoomRange) {
        this.overshoot.v = (now - this.overshoot.t < 700 ? this.overshoot.v : 0) + Math.min(0.2, e.deltaY * 0.0015);
        this.overshoot.t = now;
        if (this.overshoot.v > 0.35) { this.overshoot.v = 0; this.ev.onBeyond?.(); }
      } else this.overshoot.v = 0;
    }, { passive: false });
    el.addEventListener('keydown', e => {
      const k = this.degPerPx() * 40;
      if (e.key === 'ArrowLeft') this.lon -= k; else if (e.key === 'ArrowRight') this.lon += k;
      else if (e.key === 'ArrowUp') this.lat = Math.min(85, this.lat + k); else if (e.key === 'ArrowDown') this.lat = Math.max(-85, this.lat - k);
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.25); else if (e.key === '-') this.zoomBy(0.8);
      else return;
      e.preventDefault(); this.dirty = true;
    });
  }

  private degPerPx(): number {
    const H = this.renderer.domElement.clientHeight || 800;
    return ((this.h * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / H) * (180 / Math.PI) * 0.9;
  }

  /** Clamp a camera height to the globe's range, narrowed by `zoomRange` when one is set. */
  private clampH(h: number): number {
    const r = this.zoomRange;
    return Math.max(r ? Math.max(MIN_H, r[0]) : MIN_H, Math.min(r ? Math.min(MAX_H, r[1]) : MAX_H, h));
  }
  setH(h: number): void { this.h = this.clampH(h); this.dirty = true; }
  zoomBy(f: number): void {
    if (f < 1 && this.h >= MAX_H - 1e-3 && !this.ride && !this.gameMode && !this.zoomRange) { this.ev.onBeyond?.(); return; }
    this.flyTo(this.lat, this.lon, this.h / f, 350);
  }

  flyTo(lat: number, lon: number, h = this.h, dur = 1200): void {
    let dl = ((lon - this.lon + 540) % 360) - 180;
    this.fly = { from: [this.lat, this.lon, this.h], to: [lat, this.lon + dl, this.clampH(h)], t: 0, dur };
    this.vLat = this.vLon = 0;
    this.dirty = true;
  }

  private tap(cx: number, cy: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    if (this.gameMode || this.captureTaps) {
      this.pickedCountry = null;
      const ll = this.screenToLatLon(x, y);
      if (ll) this.ev.onGlobeTap?.(ll[0], ll[1]);
      return;
    }
    if (this.radio) {
      const si = this.radio.pick(x, y, this.camera, rect.width, rect.height, 16);
      if (si >= 0) { this.ev.onStation?.(si); return; }
    }
    const hit = this.pickAt(x, y);
    const ll = !hit && this.countryUi() ? this.screenToLatLon(x, y) : null;
    const c = ll ? countryAt(this.shapes(), ll[0], ll[1]) : null;
    this.pickedCountry = c && ll ? { c, at: new THREE.Vector3(...latLonToVec(ll[0], ll[1], 1.0025)) } : null;
    this.dirty = true;
    this.ev.onPick?.(hit);
  }

  private shapes(): readonly CountryInfo[] { return this.borderShapes ?? this.countries; }
  /** Country hover/tap highlighting: browsing with borders on (lessons, games and rides own the globe). */
  private countryUi(): boolean {
    return this.eff.borders && !this.gameMode && !this.captureTaps && !this.ride && !this.layerOverride && !this.isPaused;
  }
  private shownCountry(): CountryInfo | null {
    return this.countryUi() ? this.hoverCountry ?? this.pickedCountry?.c ?? null : null;
  }

  /** Hovers the country under canvas point (x, y); `x = null` clears the hover. */
  private hoverCountryAt(x: number | null, y = 0): void {
    let c: CountryInfo | null = null;
    if (x !== null && this.countryUi()) {
      const ll = this.screenToLatLon(x, y);
      if (ll) c = countryAt(this.shapes(), ll[0], ll[1]);
    }
    this.cursor = x === null ? null : { x, y };
    if (c !== this.hoverCountry) { this.hoverCountry = c; this.dirty = true; }
    this.updateTag();
  }

  private countryName(c: CountryInfo): string {
    if (!c.a2 || c.a2 === 'XK') return c.name;
    try { return new Intl.DisplayNames([this.lang], { type: 'region' }).of(c.a2) ?? c.name; } catch { return c.name; }
  }

  /** The name tag of the highlighted country: at the cursor while hovering, else where it was tapped. */
  private updateTag(): void {
    const c = this.shownCountry(), tag = this.countryTag;
    let p: { x: number; y: number } | null = null;
    if (c && c === this.hoverCountry && this.cursor) p = this.cursor;
    else if (c && this.pickedCountry?.c === c) p = this.project(this.pickedCountry.at);
    if (!c || !p) { if (!tag.hidden) tag.hidden = true; return; }
    const key = this.lang + c.id;
    if (this.tagFor !== key) {
      this.tagFor = key;
      const cont = CONTINENT_NAMES[c.continent];
      tag.replaceChildren(document.createTextNode(this.countryName(c)));
      if (cont && c.a2 !== 'AQ') {
        const sub = document.createElement('small');
        sub.textContent = cont[this.lang] ?? cont.en;
        tag.append(sub);
      }
    }
    tag.hidden = false;
    tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, calc(-100% - 14px))`;
  }

  /** Border visibility, zoom-dependent strength and the highlighted country's outline. */
  private styleBorders(): void {
    const on = this.eff.borders;
    if (this.borderLines) this.borderLines.visible = on;
    // faint on the whole-planet view, crisp from about country scale inward
    const k = Math.max(0, Math.min(1, (Math.log(MAX_H) - Math.log(this.h)) / (Math.log(MAX_H) - Math.log(0.35))));
    const [far, near] = this.borderTone;
    this.borderMat.opacity = far + (near - far) * k * k * (3 - 2 * k);
    const c = this.shownCountry();
    if (c !== this.hiShown) {
      this.hiShown = c;
      if (this.hiLines) { this.scene.remove(this.hiLines); this.hiLines.geometry.dispose(); this.hiLines = null; }
      if (c) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(outlinePositions(c.feature), 3));
        this.hiLines = new THREE.LineSegments(geo, this.hiMat);
        this.hiLines.renderOrder = 5;
        this.scene.add(this.hiLines);
      }
    }
    this.updateTag();
  }

  /** Shows (or removes) the radio station layer. */
  setStations(d: StationDots | null): void {
    if (this.radio) this.scene.remove(this.radio.group);
    this.radio = d;
    if (d) this.scene.add(d.group);
    if (!d) { this.beacon = null; this.setAudio(0, 0, 0); }
    this.dirty = true;
  }

  stationScreen(i: number): { x: number; y: number } | null {
    if (!this.radio || i < 0) return null;
    const p = this.radio.pos;
    return this.project(new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
  }

  /** Live radio levels (0..1) drive the aurora, city lights and the station ripples. */
  setAudio(bass: number, mid: number, high: number): void {
    this.audioLevel = bass;
    this.earthUniforms.uAudioBass.value = 0.12 + bass * 0.9;
    this.earthUniforms.uAudioMid.value = 0.1 + mid * 0.9;
    const a = this.atmosUniforms;
    a.uAudioBass.value = 0.12 + bass * 0.8;
    a.uAudioMid.value = 0.1 + mid * 0.8;
    a.uAudioHigh.value = 0.08 + high * 0.8;
  }

  screenToLatLon(x: number, y: number): [number, number] | null {
    const el = this.renderer.domElement;
    const ndc = new THREE.Vector2((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), p)) return null;
    return vecToLatLon(p.x, p.y, p.z);
  }

  /** Screen position of a world point, or null if behind the globe / off-screen. */
  project(v: THREE.Vector3): { x: number; y: number } | null {
    const camDir = this.camera.position.clone().sub(v);
    const N = v.clone().normalize();
    if (N.dot(camDir.normalize()) < 0.05) return null;
    const p = v.clone().project(this.camera);
    if (p.z > 1) return null;
    const el = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
  }

  itemScreen(key: string): { x: number; y: number } | null {
    const p = this.ensurePlaced(key);
    if (!p || !p.obj.visible) return null;
    const c = p.obj.position.clone().add(p.obj.position.clone().normalize().multiplyScalar(this.modelScale(p.item) * 0.4));
    return this.project(c);
  }

  pickAt(x: number, y: number): CatalogueItem | null {
    let best: CatalogueItem | null = null, bd = Infinity;
    for (const p of this.placed.values()) {
      if (!p.obj.visible) continue;
      const s = this.itemScreen(p.item.key);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 34 && d < bd) { bd = d; best = p.item; }
    }
    return best;
  }

  select(key: string | null): void {
    const prev = this.selected ? this.placed.get(this.selected) : null;
    const next = this.ensurePlaced(key);
    if (prev && next && prev.item.key !== next.item.key) {
      this.showFlightArc([prev.item.lat, prev.item.lon], [next.item.lat, next.item.lon]);
    } else if (!key) {
      this.flightArcGroup.clear();
    }
    this.selected = key;
    this.dirty = true;
  }

  // ---------- pins / arcs for games ----------
  clearPins(): void { this.pinsRoot.clear(); this.dirty = true; }
  addPin(lat: number, lon: number, color: string): void {
    const g = new THREE.Group();
    const s = Math.max(0.006, this.h * 0.02);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0), mat('#eeeeee'));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat(color, { emissive: color }));
    head.position.y = 1.05;
    g.add(stick, head);
    g.scale.setScalar(s * 1.8);
    this.orientAt(g, lat, lon, 1.0);
    this.pinsRoot.add(g);
    this.dirty = true;
  }
  addArc(a: [number, number], b: [number, number], color = '#ffd24a'): void {
    const pts: THREE.Vector3[] = [];
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const t = i / n, [la, lo] = slerpLatLon(a, b, t);
      const lift = 1.002 + Math.sin(Math.PI * t) * Math.min(0.15, this.angDist(a, b) * 0.12);
      pts.push(new THREE.Vector3(...latLonToVec(la, lo, lift)));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, Math.max(0.0015, this.h * 0.0025), 5);
    this.pinsRoot.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })));
    this.dirty = true;
  }
  private angDist(a: [number, number], b: [number, number]): number {
    const va = new THREE.Vector3(...latLonToVec(a[0], a[1])), vb = new THREE.Vector3(...latLonToVec(b[0], b[1]));
    return va.angleTo(vb);
  }

  // ---------- ride ----------
  startRide(key: string): boolean {
    const p = this.ensurePlaced(key);
    if (!p?.item.route) return false;
    this.ride = { key, yaw: 0, dist: 2, first: false };
    this.select(null);
    this.dirty = true;
    return true;
  }
  setRideView(first: boolean): void { if (this.ride) { this.ride.first = first; this.dirty = true; } }
  stopRide(): void {
    if (!this.ride) return;
    const p = this.placed.get(this.ride.key);
    this.ride = null;
    if (p) { const [la, lo] = vecToLatLon(p.obj.position.x, p.obj.position.y, p.obj.position.z); this.lat = la; this.lon = lo; this.h = 0.5; }
    this.dirty = true;
  }

  // ---------- photo ----------
  capture(type = 'image/jpeg'): string {
    const labels = this.labelsEl.style.visibility;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL(type, 0.9);
    this.labelsEl.style.visibility = labels;
    return url;
  }

  // ---------- frame ----------
  private resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // Keep the globe fully visible on portrait screens.
    this.camera.fov = w < h ? 35 * Math.min(1.6, h / w) : 35;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private applyShift(dt: number): void {
    const sh = this.shift, k = 1 - Math.exp(-dt / 160);
    sh.x += (sh.tx - sh.x) * k; sh.y += (sh.ty - sh.y) * k;
    if (Math.abs(sh.tx - sh.x) < 0.5 && Math.abs(sh.ty - sh.y) < 0.5) { sh.x = sh.tx; sh.y = sh.ty; } else this.dirty = true;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if ((sh.x || sh.y) && w && h) this.camera.setViewOffset(w, h, -sh.x, -sh.y, w, h);
    else if (this.camera.view?.enabled) this.camera.clearViewOffset();
  }

  private modelScale(item: CatalogueItem): number {
    const base = TYPE_META[item.type].scale;
    return base * Math.max(0.06, Math.min(1.12, Math.pow(this.h / DEFAULT_H, 0.72)));
  }

  private updateCamera(dt: number): void {
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / this.fly.dur);
      const e = this.fly.t < 0.5 ? 2 * this.fly.t ** 2 : 1 - (-2 * this.fly.t + 2) ** 2 / 2;
      const [a, b] = [this.fly.from, this.fly.to];
      this.lat = a[0] + (b[0] - a[0]) * e;
      this.lon = a[1] + (b[1] - a[1]) * e;
      // Zoom out a little mid-flight for long hops.
      const hop = Math.min(1.2, Math.hypot(b[0] - a[0], b[1] - a[1]) / 120);
      this.h = Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * e) + Math.sin(Math.PI * e) * hop;
      if (this.fly.t >= 1) this.fly = null;
      this.dirty = true;
    } else if (Math.abs(this.vLat) + Math.abs(this.vLon) > 1e-4) {
      this.lon += this.vLon / Math.max(0.2, Math.cos((this.lat * Math.PI) / 180));
      this.lat = Math.max(-85, Math.min(85, this.lat + this.vLat));
      this.vLat *= 0.9; this.vLon *= 0.9;
      this.dirty = true;
    }
    this.lon = ((this.lon + 540) % 360) - 180;

    if (this.ride) {
      const p = this.placed.get(this.ride.key)!;
      const pos = p.obj.position.clone();
      const N = pos.clone().normalize();
      const fwd = p.heading.clone().normalize();
      const right = new THREE.Vector3().crossVectors(fwd, N).normalize();
      const s = this.modelScale(p.item);
      const yawed = fwd.clone().multiplyScalar(Math.cos(this.ride.yaw)).add(right.clone().multiplyScalar(Math.sin(this.ride.yaw)));
      if (this.ride.first) {
        this.camera.position.copy(pos).add(N.clone().multiplyScalar(s * 0.5)).add(yawed.clone().multiplyScalar(s * 0.5));
        this.camera.up.copy(N);
        this.camera.lookAt(this.camera.position.clone().add(yawed).add(N.clone().multiplyScalar(-0.05)));
      } else {
        const d = s * 6 * this.ride.dist;
        this.camera.position.copy(pos).add(yawed.clone().multiplyScalar(-d)).add(N.clone().multiplyScalar(d * 0.45));
        this.camera.up.copy(N);
        this.camera.lookAt(pos.clone().add(N.clone().multiplyScalar(s * 0.5)));
      }
      this.camera.near = 0.0005;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      return;
    }
    this.camera.near = Math.max(0.0008, this.h * 0.05);
    this.applyShift(dt);
    this.camera.updateProjectionMatrix();

    const T = new THREE.Vector3(...latLonToVec(this.lat, this.lon));
    const N = T.clone();
    const north = this.northAt(this.lat, this.lon);
    // Smoothly pitch toward the horizon as the user zooms in from orbital view.
    const z = this.zoom;
    const tilt = this.flatView || z <= 4.15 ? 0 : Math.min(0.86, Math.pow(Math.min(1, (z - 4.15) / 8.5), 0.72) * 0.86);
    const dir = N.clone().multiplyScalar(Math.cos(tilt)).add(north.clone().multiplyScalar(-Math.sin(tilt)));
    this.camera.position.copy(T).add(dir.multiplyScalar(this.h));
    this.camera.up.copy(north.clone().multiplyScalar(Math.cos(tilt)).add(N.clone().multiplyScalar(Math.sin(tilt))));
    this.camera.lookAt(T);
    this.camera.updateMatrixWorld();
  }

  private updateItems(dt: number): void {
    const cdir = this.camera.position.clone().normalize(), hz = this.horizonCos(0.12);
    // pixels per world unit at distance 1, for the level-of-detail test
    const pxK = (this.renderer.domElement.clientHeight || 800) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const lodPx = this.quality.lodPx, hzRoute = this.horizonCos(0.3);
    if (this.dirty || this.clock - this.lastBudget > 400) { this.lastBudget = this.clock; this.applyBudget(cdir, hz); }
    for (const p of this.placed.values()) {
      const it = p.item;
      const focus = this.selected === it.key || this.ride?.key === it.key;
      // Static models fully behind the horizon are skipped entirely (no draw calls, no animation).
      // Moving ones keep travelling while hidden, so they are re-tested after their position update.
      p.obj.visible = this.shown(it) && (focus || !!it.route || (!p.cull && p.n.dot(cdir) >= hz));
      if (!p.obj.visible) continue;
      const s = this.modelScale(it);
      p.obj.scale.setScalar(s);
      if (it.route) {
        const r = it.route, pts = p.pts;
        const a = pts[p.seg], b = pts[Math.min(pts.length - 1, p.seg + 1)] ?? pts[0];
        const seg = this.angDist(a, b) * (180 / Math.PI) || 1;
        p.t += (r.speed * dt) / 1000 / seg;
        if (p.t >= 1) {
          p.t = 0;
          if (r.mode === 'loop') p.seg = (p.seg + 1) % pts.length;
          else { p.seg += 1; if (p.seg >= pts.length - 1) { pts.reverse(); p.seg = 0; } }
        }
        const nb = pts[(p.seg + 1) % pts.length];
        const [la, lo] = slerpLatLon(pts[p.seg], nb, p.t);
        const [la2, lo2] = slerpLatLon(pts[p.seg], nb, Math.min(1, p.t + 0.01));
        const v1 = new THREE.Vector3(...latLonToVec(la, lo)), v2 = new THREE.Vector3(...latLonToVec(la2, lo2));
        const hd = v2.sub(v1);
        if (hd.lengthSq() > 1e-14) p.heading.copy(hd);
        const alt = routeAltitude(r.kind, s);
        this.orientAt(p.obj, la, lo, alt, p.heading);
        if (!focus && (p.cull || (r.kind !== 'orbit' && v1.normalize().dot(cdir) < hzRoute))) { p.obj.visible = false; continue; }
      }
      const inner = p.obj.children[p.obj.children.length - 1];
      if (it.type === 'animal' && !this.lowfx) inner.position.y = Math.abs(Math.sin(this.clock * 0.003 + it.lat)) * 0.06;
      else if (this.layers?.festivals.has(it.key) && !this.lowfx) inner.position.y = (0.5 + 0.5 * Math.sin(this.clock * 0.0024 + it.lon)) * 0.09;
      const isHovered = this.hoveredKey === it.key;
      inner.scale.setScalar(isHovered ? 1.14 : 1.0);
      const px = (pxK * s * p.radius) / Math.max(1e-4, this.camera.position.distanceTo(p.obj.position));
      const far = !focus && !isHovered && px < (p.far ? lodPx * 1.25 : lodPx);
      if (far !== p.far) { p.far = far; setModelDetail(inner, far); }
      for (const o of p.anim) {
        if (o.name === 'spin') o.rotation.z += dt * 0.002;
        else o.rotation.z = Math.sin(this.clock * 0.004) * 0.2;
      }
    }
    this.updatePlinths();
    const sel = this.selected ? this.placed.get(this.selected) : null;
    this.selRing.visible = !!sel?.obj.visible;
    if (sel) {
      this.selRing.position.copy(sel.obj.position).multiplyScalar(1.0008);
      this.selRing.quaternion.copy(sel.obj.quaternion);
      const s = this.modelScale(sel.item) * (1.05 + Math.sin(this.clock * 0.005) * 0.09);
      this.selRing.scale.setScalar(s);
      this.selOuterMat.color.copy(this.targetColorA);
      this.selInnerMat.color.copy(this.targetColorC);
      this.earthUniforms.uStationPos.value.copy(sel.obj.position).normalize();
    } else if (this.hoveredKey) {
      const hov = this.placed.get(this.hoveredKey);
      if (hov?.obj.visible) this.earthUniforms.uStationPos.value.copy(hov.obj.position).normalize();
      else this.earthUniforms.uStationPos.value.set(0, 0, 0);
    } else if (this.beacon) {
      this.earthUniforms.uStationPos.value.copy(this.beacon);
    } else {
      this.earthUniforms.uStationPos.value.set(0, 0, 0);
    }
  }

  /**
   * Visible-model budget: when more static models face the camera than the device tier allows, keep the ones
   * nearest the view centre (tier-1 items get a small bonus) and hide the rest until the view changes.
   * Moving (route) models have their own, smaller cap and are re-ranked from their current positions.
   */
  private applyBudget(cdir: THREE.Vector3, hz: number): void {
    const cand: [Placed, number][] = [], moving: [Placed, number][] = [], v = new THREE.Vector3();
    for (const p of this.placed.values()) {
      p.cull = false;
      if (this.selected === p.item.key || this.ride?.key === p.item.key || !this.shown(p.item)) continue;
      if (p.item.route) {
        const d = v.copy(p.obj.position).normalize().dot(cdir);
        if (d >= hz) moving.push([p, d]);
        continue;
      }
      const d = p.n.dot(cdir);
      if (d >= hz) cand.push([p, d + (p.item.tier === 1 ? 0.02 : 0)]);
    }
    for (const [list, max] of [[cand, this.quality.maxShown], [moving, this.quality.maxMoving]] as const) {
      if (list.length <= max) continue;
      list.sort((a, b) => b[1] - a[1]);
      for (let i = max; i < list.length; i++) list[i][0].cull = true;
    }
  }

  private updateSun(): void {
    // Sub-solar point from the current (or lesson) UTC time, with the equation of time
    const now = new Date(this.simTime ?? Date.now());
    const [subSolarLat, subSolarLon] = subsolar(now.getTime());
    const real = new THREE.Vector3(...latLonToVec(subSolarLat, subSolarLon));
    const cam = this.camera.position.clone().normalize();
    // The real Sun: the day/night line is where it actually is right now (the "Day & night" switch hides the night)
    this.earthUniforms.uSunDir.value.copy(real);
    this.stars.rotation.y = -gmstRad(now.getTime());

    // Viewer-relative 3-point studio lighting for 3D miniatures on the globe
    const camUp = this.camera.up.clone().normalize();
    const camRight = new THREE.Vector3().crossVectors(camUp, cam).normalize();
    const keyDir = cam.clone().multiplyScalar(0.55).add(camRight.clone().multiplyScalar(0.58)).add(camUp.clone().multiplyScalar(0.60)).normalize();
    const fillDir = cam.clone().multiplyScalar(0.45).add(camRight.clone().multiplyScalar(-0.72)).add(camUp.clone().multiplyScalar(-0.35)).normalize();
    this.fillLight.position.copy(fillDir.multiplyScalar(10));
    this.ambient.position.copy(camUp.multiplyScalar(10));
    // the environment's sky sits above the models in view: the ridden one, or the ground at the view centre
    const rideP = this.ride ? this.placed.get(this.ride.key) : undefined;
    const ground = rideP ? rideP.obj.position.clone() : new THREE.Vector3(...latLonToVec(this.lat, this.lon));
    orientEnvironment(this.scene, ground.clone().normalize());
    const near = rideP ? this.modelScale(rideP.item) * 6 : this.h < SHADOW_MAX_H ? this.h * 1.5 : 0;
    if (near) this.frameShadows(ground, near, keyDir);
    else { this.sun.position.copy(keyDir).multiplyScalar(10); this.sun.target.position.set(0, 0, 0); this.sun.target.updateMatrixWorld(); this.frameShadows(null, 0, keyDir); }

    // Update AuraFM Earth & Atmosphere shader uniforms
    const tSec = this.clock * 0.001;
    const activeBoost = this.selected ? 0.16 : this.hoveredKey ? 0.08 : 0.0;
    const bass = 0.14 + activeBoost + 0.07 * (Math.sin(tSec * 2.1) * 0.5 + 0.5);
    const mid = 0.12 + activeBoost * 0.8 + 0.06 * (Math.sin(tSec * 3.3 + 1.2) * 0.5 + 0.5);
    const high = 0.10 + activeBoost * 0.5 + 0.05 * (Math.cos(tSec * 4.5 + 0.7) * 0.5 + 0.5);

    this.earthUniforms.uTime.value = tSec;
    this.earthUniforms.uAudioBass.value = bass;
    this.earthUniforms.uAudioMid.value = mid;

    const targetLandMix = this.settings.surfaceMode === 'minimal' ? 0.0 : 1.0;
    this.earthUniforms.uLandMix.value += (targetLandMix - this.earthUniforms.uLandMix.value) * 0.12;

    // relief fades in once loaded: full on the satellite map, softer on the flat political / minimal maps
    const targetRelief = !this.reliefReady ? 0 : this.settings.surfaceMode === 'realistic' ? 1.0 : 0.6;
    const ru = this.earthUniforms.uReliefMix;
    if (Math.abs(targetRelief - ru.value) > 0.002) { ru.value += (targetRelief - ru.value) * 0.12; this.dirty = true; } else ru.value = targetRelief;

    const targetNightMix = this.settings.shadows || this.forceNight ? 1.0 : 0.0;
    this.earthUniforms.uNightMix.value += (targetNightMix - this.earthUniforms.uNightMix.value) * 0.12;
    this.earthUniforms.uAuraColor.value.lerp(this.targetColorA, 0.08);

    if (this.atmosMesh) {
      this.atmosMesh.quaternion.copy(this.camera.quaternion);
      this.atmosUniforms.uTime.value = tSec;
      this.atmosUniforms.uCameraDist.value = this.camera.position.length();
      this.atmosUniforms.uAudioBass.value = bass;
      this.atmosUniforms.uAudioMid.value = mid;
      this.atmosUniforms.uAudioHigh.value = high;
      this.atmosUniforms.uColorA.value.lerp(this.targetColorA, 0.06);
      this.atmosUniforms.uColorB.value.lerp(this.targetColorB, 0.06);
      this.atmosUniforms.uColorC.value.lerp(this.targetColorC, 0.06);
    }
  }

  private updateLabels(): void {
    if (!this.eff.names || this.ride) { for (const s of this.labelPool) s.style.display = 'none'; return; }
    const z = this.zoom;
    type L = { text: string; cls: string; x: number; y: number; pri: number; corner?: boolean };
    const out: L[] = [];
    const push = (text: string, cls: string, lat: number, lon: number, pri: number, corner = false) => {
      const s = this.project(new THREE.Vector3(...latLonToVec(lat, lon, 1.002)));
      if (s) out.push({ text, cls, x: s.x, y: s.y, pri, corner });
    };
    if (this.eff.graticule) this.pushGridLabels(push);
    if (!this.gameMode || z > 0) {
      for (const c of this.countries) {
        if (!c.a2 || c.area * z * z < 900) continue;
        push(this.countryLabel(c), 'lb-country', c.lat, c.lon, 1000 + c.area);
      }
      if (!this.gameMode) {
        const minPop = z < 3 ? Infinity : z < 5 ? 12 : z < 8 ? 4 : z < 15 ? 1.2 : 0;
        for (const [name, , la, lo, pop, cap] of CITIES) {
          if (pop < minPop && !(cap && z >= 6)) continue;
          push(cityName(name, this.lang), cap ? 'lb-city lb-cap' : 'lb-city', la, lo, pop + (cap ? 5 : 0));
        }
      }
      if (z < 12) for (const [, n, la, lo] of OCEANS) push(n[this.lang] ?? n.en, 'lb-ocean', la, lo, 2000);
    }
    out.sort((a, b) => b.pri - a.pri);
    const boxes: [number, number, number, number][] = [];
    let used = 0;
    for (const l of out) {
      const w = (l.text.length + (l.text.match(/[\u3000-\u9fff]/g)?.length ?? 0) * 0.8) * (l.cls === 'lb-country' ? 8 : 6.5) + 10, h = 16;
      const cx = l.corner ? l.x + w / 2 + 2 : l.x, cy = l.corner ? l.y - h / 2 - 1 : l.y;
      const bx: [number, number, number, number] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
      if (boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
      boxes.push(bx);
      let el = this.labelPool[used];
      if (!el) { el = document.createElement('span'); this.labelsEl.append(el); this.labelPool.push(el); }
      if (el.textContent !== l.text) el.textContent = l.text;
      if (el.className !== l.cls) el.className = l.cls;
      el.style.display = '';
      el.style.transform = `translate(${l.x.toFixed(1)}px,${l.y.toFixed(1)}px) ` + (l.corner ? 'translate(3px,-100%)' : 'translate(-50%,-50%)');
      used++;
      if (used > 140) break;
    }
    for (let i = used; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }

  /** Degree labels where the grid crosses the meridian/parallel nearest the view centre, plus named circles. */
  private pushGridLabels(push: (text: string, cls: string, lat: number, lon: number, pri: number, corner?: boolean) => void): void {
    const step = graticuleStep(this.camera.position.length() - 1);
    const snap = (v: number) => Math.round(v / step) * step;
    const lonC = ((snap(this.lon) + 540) % 360) - 180;
    const latC = Math.abs(this.lat) < step * 2.5 ? 0 : Math.max(-75, Math.min(75, snap(this.lat)));
    const fmt = (v: number, pos: string, neg: string) => v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? pos : neg}`;
    for (let la = -75; la <= 75; la += step) if (la !== latC) push(fmt(la, 'N', 'S'), 'lb-grid', la, lonC, 40, true);
    for (let k = -180 / step; k < 180 / step; k++) {
      const lo = snap(this.lon) + k * step;
      if (Math.abs(lo - this.lon) > 95) continue;
      const w = ((lo + 540) % 360) - 180;
      push(Math.abs(w) === 180 ? '180°' : fmt(w, 'E', 'W'), 'lb-grid', latC, w, 40, true);
    }
    const named: [string, number][] = [['equator', 0], ['tropicN', 23.436], ['tropicS', -23.436], ['arcticC', 66.564], ['antarcticC', -66.564]];
    const off = step * 0.5;
    for (const [k, la] of named) push(GRID_NAMES[k][this.lang] ?? GRID_NAMES[k].en, 'lb-grid lb-gridname g-' + k, la, lonC + off, 600, true);
    if (Math.abs(this.lon) < 100) push(GRID_NAMES.prime[this.lang] ?? GRID_NAMES.prime.en, 'lb-grid lb-gridname g-prime', Math.max(-60, Math.min(60, this.lat + step * 0.5)), 0, 600, true);
  }

  private names = new Map<string, string>();
  countryLabel(c: CountryInfo): string {
    const k = this.lang + c.a2;
    let s = this.names.get(k);
    if (!s) {
      try { s = new Intl.DisplayNames([this.lang], { type: 'region' }).of(c.a2) ?? c.name; } catch { s = c.name; }
      if (c.a2 === 'XK') s = c.name;
      if (this.lang === 'en') s = s.toUpperCase();
      this.names.set(k, s);
    }
    return s;
  }

  itemName(key: string): string { const it = this.placed.get(key)?.item ?? this.pending.get(key); return it ? tr(it.name, this.lang) : ''; }

  private frame(): void {
    const now = performance.now();
    // Phones: when the view is still, ambient animation (clouds, ships, bobbing) runs at a capped rate.
    const idle = !this.dirty && !this.fly && !this.ride && Math.abs(this.vLat) + Math.abs(this.vLon) <= 1e-4;
    if (idle && this.quality.idleFps && now - this.last < 1000 / this.quality.idleFps - 4) return;
    const real = Math.min(100, now - this.last);
    this.last = now;
    // Classroom "pause motion": the world clock stops; the camera still flies.
    const dt = motion.still ? 0 : real;
    this.clock += dt;
    const animate = (!this.lowfx && !motion.still) || now - this.lastLabel > 1000;
    this.updateCamera(real);
    for (const f of this.frameHooks) f(real);
    // Re-scan the queue when the view changed (or every ¼ s for moving vehicles / freshly loaded packs).
    if (this.pending.size && (this.dirty || now - this.lastDrain > 250)) { this.lastDrain = now; this.drainPlacement(this.quality.drainMs); }
    if (!animate && !this.dirty) return;
    this.updateItems(dt);
    this.updateSun();
    this.styleBorders();
    if (this.layers) {
      this.layers.setVisible(this.eff, this.gameMode);
      this.layers.update(this.clock, dt, this.camera.position.length() - 1, this.routeState, this.orbitAlt, this.placedObj);
    }
    if (this.radio) {
      this.radio.group.visible = !this.gameMode;
      this.radio.update(this.clock, this.camera, this.renderer.domElement.clientHeight, this.audioLevel);
    }
    this.renderer.render(this.scene, this.camera);
    if (this.adapt && !(idle && this.quality.idleFps)) {
      const pr = this.adapt.sample(now - this.lastRender);
      if (pr !== null) this.renderer.setPixelRatio(pr);
    }
    this.lastRender = now;
    if (this.dirty || now - this.lastLabel > (this.lowfx ? 1000 : 120)) { this.updateLabels(); this.lastLabel = now; }
    if (this.dirty) this.ev.onView?.(this.zoom, this.lat, this.lon);
    this.dirty = false;
  }

  markDirty(): void { this.dirty = true; }

  // Bound once so the per-frame layer update does not allocate closures.
  private routeState = (it: CatalogueItem): 0 | 1 | 2 => {
    if (this.lessonKeys) return this.lessonKeys.has(it.key) ? 2 : 0;
    if (this.gameMode || !this.settings[TYPE_META[it.type].layer]) return 0;
    if (this.selected === it.key || this.ride?.key === it.key) return 2;
    return !this.itemFilter || this.itemFilter(it) ? 1 : 0;
  };
  private orbitAlt = (it: CatalogueItem): number => routeAltitude('orbit', this.modelScale(it));
  private placedObj = (key: string): THREE.Object3D | undefined => this.placed.get(key)?.obj;
}
