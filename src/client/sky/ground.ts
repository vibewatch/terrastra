/**
 * The sky from one spot on the ground. Everything is placed in the local horizon frame (+x east, +y up, −z north)
 * from double-precision ephemerides: a sky dome whose colour follows the Sun's altitude and how much of it is still
 * visible (so totality turns day into a deep-blue dusk with a sunset all around the horizon), stars and the Milky Way
 * that fade in as the sky darkens, the planets, the Sun's disc (where solar eclipses are drawn exactly) and the Moon
 * (where lunar eclipses fall out of Earth's shadow), meteors from a radiant, and a dark hilly horizon.
 */
import * as THREE from 'three';
import { CONSTELLATIONS } from '../../shared/data/constellations.ts';
import { galToEq } from '../../shared/lib/sky.ts';
import { gast, sunEcef, moonEcef, planetGeo, radec, type PlanetId } from '../../shared/lib/astro/ephem.ts';
import type { GeoPoint, Vec3 } from '../../shared/lib/astro/types.ts';
import { lang } from '../lib/i18n.ts';
import { MILKY_WAY_GLSL } from '../lib/milkyway.ts';
import {
  D2R, R_MOON, R_SUN, horizonMatrix, obsEcef, toHorizon, altOf, azOf, norm, len, angle, overlap, precess,
  glowTexture, bodyTexture,
} from './common.ts';
import { sunDiscMaterial, moonMaterial, moonBasis, SUN_SPAN } from './bodies.ts';

const SKY_R = 900, SUN_D = 600, MOON_D = 400, STAR_R = 850;
export const PLANETS: { id: PlanetId; name: { en: string; zh: string }; H: number; a: number; tint: number; rKm: number }[] = [
  { id: 'mercury', name: { en: 'Mercury', zh: '水星' }, H: -0.6, a: 0.387, tint: 0xd9cbb8, rKm: 2439.7 },
  { id: 'venus', name: { en: 'Venus', zh: '金星' }, H: -4.47, a: 0.723, tint: 0xfff3d6, rKm: 6051.8 },
  { id: 'mars', name: { en: 'Mars', zh: '火星' }, H: -1.52, a: 1.524, tint: 0xffa070, rKm: 3389.5 },
  { id: 'jupiter', name: { en: 'Jupiter', zh: '木星' }, H: -9.4, a: 5.2, tint: 0xfff0dc, rKm: 69911 },
  { id: 'saturn', name: { en: 'Saturn', zh: '土星' }, H: -8.88, a: 9.58, tint: 0xffe6b0, rKm: 58232 },
  { id: 'uranus', name: { en: 'Uranus', zh: '天王星' }, H: -7.19, a: 19.2, tint: 0xc8f0ff, rKm: 25362 },
  { id: 'neptune', name: { en: 'Neptune', zh: '海王星' }, H: -6.87, a: 30.1, tint: 0xa8c4ff, rKm: 24622 },
];
const AU = 149_597_870.7;

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Sky state after `update`, for acts to read. */
export interface SkyState {
  sun: Vec3; moon: Vec3; sunAlt: number; sunAz: number; moonAlt: number; moonAz: number;
  /** Angular radii and separation (degrees). */
  rs: number; rm: number; sep: number;
  /** Fraction of the Sun's disc still visible and of the Moon's disc in Earth's umbra-ish shadow (0..1). */
  vis: number;
  /** How bright the sky is (0 night … 1 full day) and how deep totality is (0..1). */
  day: number; tot: number;
  planets: Record<string, { alt: number; az: number; dir: Vec3; mag: number; rDeg: number }>;
}

export interface Meteor { radiant: Vec3; born: number; life: number; start: Vec3; axis: Vec3; len: number; bright: number }

interface Label { el: HTMLElement; dir: THREE.Vector3; on: boolean }

export class GroundSky {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2000);
  obs: GeoPoint = { lat: 40, lon: 116 };
  state!: SkyState;
  /** Solar-filter mode (transits): the sky goes dark and only the filtered Sun shows. */
  filter = false;
  /** Meteor radiant (equatorial unit vector of date) and rate (meteors per real second), or null. */
  shower: { radiant: Vec3; perSec: number } | null = null;
  /** A meteor radiant to label (equatorial unit vector) and where it is now in the local sky. */
  radiant: { dir: Vec3; name: string } | null = null;
  radiantHz: { az: number; alt: number } | null = null;
  /** Bodies whose labels are emphasised. */
  highlight: string[] = [];
  /** Draw a dashed circle the size of an average Full Moon around the Moon (degrees radius; 0 = off). */
  avgMoon = 0;
  /** A planet crossing the Sun's disc (transits). */
  transit: PlanetId | null = null;
  private bodyLabels = new Map<string, Label>();
  private radLabel: Label | null = null;
  private avgRing: THREE.LineLoop;
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private eqGroup = new THREE.Group();
  private sunMesh: THREE.Mesh<THREE.PlaneGeometry, ReturnType<typeof sunDiscMaterial>>;
  private moonMesh: THREE.Mesh<THREE.SphereGeometry, ReturnType<typeof moonMaterial>>;
  private ring: THREE.Sprite;
  private planetSprites: THREE.Sprite[] = [];
  private ground: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private meteorMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private meteors: Meteor[] = [];
  private spawnAcc = 0;
  private labels: Label[] = [];
  private labelHost: HTMLElement;
  private year = 0;
  private time = 0;

  constructor(labelHost: HTMLElement) {
    this.labelHost = labelHost;
    this.scene.add(this.camera);
    // ---- dome
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 64, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        uSun: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 1 }, uTot: { value: 0 }, uSunAlt: { value: 30 },
        uH2G: { value: new THREE.Matrix3() }, uFilter: { value: 0 }, uVis: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
uniform vec3 uSun; uniform float uDay, uTot, uSunAlt, uFilter, uVis; uniform mat3 uH2G;
varying vec3 vD;
${MILKY_WAY_GLSL}
void main() {
  vec3 d = normalize(vD);
  float h = max(d.y, 0.0);
  float cosg = dot(d, uSun);
  float sa = uSunAlt;
  // daylight: deep blue zenith to pale horizon, Mie glow around the Sun
  vec3 zen = vec3(0.10, 0.27, 0.66), hor = vec3(0.56, 0.70, 0.88);
  vec3 day = mix(hor, zen, pow(h, 0.45));
  day += vec3(1.0, 0.92, 0.78) * (0.55 * pow(max(cosg, 0.0), 24.0) + 0.18 * pow(max(cosg, 0.0), 4.0)) * uVis;
  // twilight: orange band toward the Sun, the blue Earth shadow and pink Venus belt opposite
  float tw = smoothstep(-14.0, -2.0, sa) * (1.0 - smoothstep(4.0, 14.0, sa));
  float toward = 0.5 + 0.5 * cosg;
  vec3 twc = mix(vec3(0.05, 0.08, 0.22), vec3(1.0, 0.45, 0.16), pow(toward, 3.0) * exp(-h * 5.0));
  twc += vec3(0.5, 0.25, 0.3) * (1.0 - toward) * exp(-pow((h - 0.12) / 0.08, 2.0)) * 0.4;
  twc = mix(twc, vec3(0.03, 0.06, 0.16), smoothstep(0.0, 0.6, h) * 0.7);
  vec3 night = vec3(0.004, 0.007, 0.018) + vec3(0.01, 0.012, 0.02) * exp(-h * 6.0);
  vec3 col = mix(night, twc, tw * smoothstep(-16.0, -6.0, sa) * (1.0 - uTot));
  col = mix(col, day, uDay);
  // totality: a deep-blue dome and a 360° sunset glow on the horizon (light from outside the shadow)
  vec3 totc = mix(vec3(1.0, 0.55, 0.22) * 0.55, vec3(0.03, 0.06, 0.16), smoothstep(0.0, 0.22, h));
  col = mix(col, totc, uTot * smoothstep(-8.0, 2.0, sa));
  // the Milky Way at night: a soft band along the galactic equator, brighter toward the centre in Sagittarius
  vec3 g = uH2G * d;
  float b = asin(clamp(g.z, -1.0, 1.0));
  float l = atan(g.y, g.x);
  float dark = (1.0 - smoothstep(0.0, 0.08, uDay)) * smoothstep(0.0, 0.25, h + 0.02);
  col += milkyWay(normalize(g)) * 0.16 * dark * (1.0 - uFilter);
  col = mix(col, vec3(0.0), uFilter);
  gl_FragColor = vec4(col, 1.0);
}`,
    }));
    this.dome.renderOrder = 0;
    this.scene.add(this.dome);

    // ---- stars (equatorial of date; the group carries the equatorial → horizon rotation)
    this.eqGroup.matrixAutoUpdate = false;
    this.scene.add(this.eqGroup);
    this.stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uLimit: { value: 6 }, uScale: { value: 1 }, uFovK: { value: 1 } },
      vertexShader: /* glsl */ `
attribute float aMag; attribute vec3 aCol; uniform float uLimit, uScale, uFovK;
varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float m = aMag - 2.5 * log(uFovK) / log(10.0);
  vA = clamp((uLimit - m) / 1.8, 0.0, 1.0);
  vC = aCol;
  gl_PointSize = clamp((4.6 - aMag * 0.55) * uScale * (1.0 + 0.4 * log(uFovK)), 1.4, 9.0 * uScale);
}`,
      fragmentShader: /* glsl */ `
varying vec3 vC; varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
  if (r > 1.0) discard;
  float a = exp(-r * 4.5) + 0.25 * exp(-r * 1.2);
  gl_FragColor = vec4(vC * a * vA, 1.0);
}`,
    }));
    this.stars.renderOrder = 1;
    this.eqGroup.add(this.stars);
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0x7dd3fc, transparent: true, opacity: 0.14, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lines.renderOrder = 1;
    this.eqGroup.add(this.lines);

    // ---- planets
    for (const p of PLANETS) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: p.tint, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sp.renderOrder = 2;
      this.planetSprites.push(sp);
      this.scene.add(sp);
    }

    // ---- Sun and Moon
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * SUN_SPAN, 2 * SUN_SPAN), sunDiscMaterial());
    this.sunMesh.renderOrder = 5;
    this.sunMesh.matrixAutoUpdate = false;
    this.scene.add(this.sunMesh);
    this.ring = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.ring.renderOrder = 7;
    this.scene.add(this.ring);
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), moonMaterial());
    this.moonMesh.material.depthTest = false;
    this.moonMesh.renderOrder = 6;
    this.scene.add(this.moonMesh);
    bodyTexture('moon').then(t => { this.moonMesh.material.uniforms.uMap.value = t; this.moonMesh.material.uniforms.uReady.value = 1; }).catch(() => {});

    // ---- meteors: up to 48 streaks, rebuilt on the CPU each frame (cheap) as camera-facing quads
    const N = 48, mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(N * 4 * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    mg.setIndex(idx);
    this.meteorMesh = new THREE.Mesh(mg, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute vec2 aT; varying vec2 vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
varying vec2 vT;
void main() {
  // x: 0 tail … 1 head; y: brightness (sign = side)
  float side = 1.0 - abs(fract(vT.y) * 2.0 - 1.0);
  float a = pow(vT.x, 2.2) * smoothstep(0.0, 0.8, side) * floor(vT.y) / 100.0;
  vec3 c = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.98, 0.9), vT.x);
  gl_FragColor = vec4(c * a, 1.0);
}`,
    }));
    this.meteorMesh.frustumCulled = false;
    this.meteorMesh.renderOrder = 3;
    this.scene.add(this.meteorMesh);

    // ---- ground: a dark band of hills, trees and a few roofs, drawn last over everything below the horizon
    const segs = 720, pos: number[] = [], ind: number[] = [], r = rng(7);
    const hill = (a: number) => 0.6 + 0.9 * Math.sin(a * 3 + 1) * 0.5 + 0.7 * Math.sin(a * 7 + 2) * 0.3 + 0.4 * Math.sin(a * 17) * 0.2;
    let tree = 0, roof = 0;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      let h = Math.max(0.25, hill(a));
      if (tree > 0) { h += 0.9 * Math.sin((tree / 9) * Math.PI) * (0.8 + 0.4 * r()); tree--; }
      else if (roof > 0) { h += 0.55; roof--; }
      else { const q = r(); if (q < 0.03) tree = 9; else if (q < 0.036) roof = 6; }
      const t = h * D2R, cb = Math.cos(t), sb = Math.sin(t);
      pos.push(Math.sin(a) * cb * 800, sb * 800, -Math.cos(a) * cb * 800);
      pos.push(Math.sin(a) * 2, -800, -Math.cos(a) * 2);
      if (i < segs) ind.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setIndex(ind);
    this.ground = new THREE.Mesh(gg, new THREE.ShaderMaterial({
      // transparent only so it sorts after the (transparent) stars by renderOrder; it is fully opaque
      side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true,
      uniforms: { uCol: { value: new THREE.Color(0x05070c) }, uRim: { value: new THREE.Color(0x000000) } },
      vertexShader: /* glsl */ `varying float vY; void main() { vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uCol, uRim; varying float vY;
void main() { gl_FragColor = vec4(uCol + uRim * smoothstep(-0.02, 0.02, vY), 1.0); }`,
    }));
    this.ground.renderOrder = 10;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    // ---- the average-Moon ring (supermoon comparisons)
    const rp: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) rp.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), Math.sin((i / 96) * Math.PI * 2), 0));
    this.avgRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rp),
      new THREE.LineDashedMaterial({ color: 0xffb547, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
    this.avgRing.computeLineDistances();
    this.avgRing.renderOrder = 8;
    this.avgRing.visible = false;
    this.scene.add(this.avgRing);

    // ---- labels: cardinal points, Sun, Moon, planets
    const zh = lang() === 'zh';
    this.bodyLabels.set('sun', this.label(zh ? '太阳' : 'Sun', 'sky-lbl sky-lbl-sun'));
    this.bodyLabels.set('moon', this.label(zh ? '月亮' : 'Moon'));
    for (const p of PLANETS) this.bodyLabels.set(p.id, this.label(zh ? p.name.zh : p.name.en));
    ([['N', '北', 0], ['E', '东', 90], ['S', '南', 180], ['W', '西', 270]] as const).forEach(([en, z, az]) => {
      const el = this.label(zh ? z : en, 'sky-lbl sky-lbl-dir');
      el.dir.set(Math.sin(az * D2R), 0.01, -Math.cos(az * D2R)).normalize();
    });
  }

  /** Forget everything an act set up. */
  reset(): void {
    this.filter = false; this.shower = null; this.radiant = null; this.radiantHz = null; this.highlight = []; this.avgMoon = 0; this.transit = null;
    this.meteors = []; this.spawnAcc = 0;
    if (this.radLabel) { this.radLabel.el.remove(); this.labels = this.labels.filter(l => l !== this.radLabel); this.radLabel = null; }
  }

  /** Show or hide all of this scene's labels. */
  showLabels(on: boolean): void { for (const l of this.labels) if (!on) l.el.style.display = 'none'; }

  /** A screen label pinned to a direction (horizon frame). */
  label(text: string, cls = 'sky-lbl'): Label {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    this.labelHost.appendChild(el);
    const l: Label = { el, dir: new THREE.Vector3(), on: true };
    this.labels.push(l);
    return l;
  }

  private buildStars(year: number): void {
    this.year = year;
    const pos: number[] = [], mag: number[] = [], col: number[] = [], lp: number[] = [];
    const add = (ra: number, dec: number, m: number, c: [number, number, number]) => {
      const [r, d] = precess(ra, dec, year), v = radec(r, d, STAR_R);
      pos.push(v[0], v[1], v[2]); mag.push(m); col.push(...c);
      return v;
    };
    const tint = (seed: number): [number, number, number] => {
      const t = seed % 1;
      return t < 0.15 ? [1.0, 0.78, 0.6] : t < 0.35 ? [1.0, 0.92, 0.8] : t < 0.8 ? [0.95, 0.97, 1.0] : [0.75, 0.85, 1.0];
    };
    for (const c of CONSTELLATIONS) {
      const vs = c.stars.map(([ra, dec, m]) => add(ra, dec, m, tint(ra * 7.31 + dec * 3.17)));
      for (const [a, b] of c.lines) lp.push(...vs[a], ...vs[b]);
    }
    // a seeded field of fainter stars, thicker along the Milky Way
    const r = rng(42);
    for (let i = 0; i < 5200; i++) {
      const m = 6.6 - Math.pow(r(), 0.42) * 3.4;
      let v: Vec3;
      if (r() < 0.45) {
        const l = r() * 360, b = (r() + r() + r() - 1.5) * 14;
        v = galToEq([Math.cos(b * D2R) * Math.cos(l * D2R), Math.cos(b * D2R) * Math.sin(l * D2R), Math.sin(b * D2R)]);
      } else {
        const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        v = [s * Math.cos(a), s * Math.sin(a), z];
      }
      const ra = Math.atan2(v[1], v[0]) / D2R, dec = Math.asin(v[2]) / D2R;
      add(ra, dec, m, tint(r()));
    }
    const g = this.stars.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aMag', new THREE.Float32BufferAttribute(mag, 1));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.lines.geometry.computeBoundingSphere();
  }

  /** Compute and place everything for instant `ms`. `dtReal` (s) and `rate` (sim s per real s) drive meteors. */
  update(ms: number, dtReal = 0, rate = 1): SkyState {
    this.time += dtReal;
    const year = new Date(ms).getUTCFullYear();
    if (year !== this.year) this.buildStars(year);
    const o = this.obs, at = obsEcef(o), th = gast(ms);
    const sun = toHorizon(sunEcef(ms), o, at), moon = toHorizon(moonEcef(ms), o, at);
    const sd = norm(sun), md = norm(moon);
    const ds = len(sun), dm = len(moon);
    const rs = Math.asin(R_SUN / ds), rm = Math.asin(R_MOON / dm), sep = angle(sun, moon);
    const vis = 1 - overlap(rs, rm, sep);
    const sunAlt = altOf(sun), moonAlt = altOf(moon);
    // how bright the sky is, and how deep into totality we are
    const d0 = THREE.MathUtils.smoothstep(sunAlt, -12, 8);
    const day = this.filter ? 0 : d0 * (0.03 + 0.97 * Math.pow(vis, 0.45));
    const tot = this.filter ? 0 : d0 * (1 - THREE.MathUtils.smoothstep(vis, 0, 0.002)) * (rm > rs ? 1 : 0);

    // equatorial-of-date → horizon
    const H = horizonMatrix(th + o.lon, o.lat);
    this.eqGroup.matrix.copy(H);
    this.eqGroup.matrixWorldNeedsUpdate = true;
    const h3 = new THREE.Matrix3().setFromMatrix4(H);
    // horizon → galactic (for the Milky Way glow): galactic = EQ2GAL · Hᵀ · d
    const ex = galToEqBasis();
    this.dome.material.uniforms.uH2G.value.copy(ex).multiply(h3.clone().transpose());
    const u = this.dome.material.uniforms;
    u.uSun.value.set(sd[0], sd[1], sd[2]); u.uDay.value = day; u.uTot.value = tot; u.uSunAlt.value = sunAlt;
    u.uFilter.value = this.filter ? 1 : 0; u.uVis.value = vis;

    // stars: limiting magnitude follows the sky brightness; zooming in (telescope) shows fainter stars
    const fovK = Math.max(1, 60 / this.camera.fov);
    const limit = this.filter ? -30 : 6.2 - 26 * Math.sqrt(day) - 1.5 * THREE.MathUtils.smoothstep(sunAlt, -18, -6) * (1 - tot);
    this.stars.material.uniforms.uLimit.value = limit;
    this.stars.material.uniforms.uFovK.value = Math.min(fovK, 30);
    this.stars.material.uniforms.uScale.value = Math.min(window.devicePixelRatio || 1, 2);
    this.lines.material.opacity = 0.14 * THREE.MathUtils.clamp((limit - 1) / 3, 0, 1);

    // planets
    const planets: SkyState['planets'] = {};
    const pxK = 2 * STAR_R * Math.tan((this.camera.fov * D2R) / 2) / Math.max(this.rendererH, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    PLANETS.forEach((p, i) => {
      const g = planetGeo(p.id, ms);
      const v = radec(g.ra, g.dec, 1), hv = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix3(h3).normalize();
      // brightness from distances only (H + 5 log rΔ), good to a few tenths of a magnitude
      const mag = p.H + 5 * Math.log10(p.a * g.distAu);
      const dir: Vec3 = [hv.x, hv.y, hv.z];
      planets[p.id] = { alt: altOf(dir), az: azOf(dir), dir, mag, rDeg: Math.atan(p.rKm / (g.distAu * AU)) / D2R };
      const sp = this.planetSprites[i];
      sp.position.set(hv.x * STAR_R, hv.y * STAR_R, hv.z * STAR_R);
      // magnification darkens the sky background but not a point source, so a telescope digs planets out of twilight
      const show = THREE.MathUtils.clamp((limit + 2.5 * Math.log10(Math.min(fovK, 30)) - mag) / 2, 0, 1);
      sp.material.opacity = show;
      sp.visible = show > 0.01;
      sp.scale.setScalar((7 + Math.max(0, 2 - mag) * 3.4) * dpr * pxK);
      const lb = this.bodyLabels.get(p.id)!;
      lb.dir.copy(hv);
      lb.on = !this.filter && show > 0.25 && hv.y > -0.01 && (mag < 1.8 || this.highlight.includes(p.id) || this.camera.fov < 20);
      lb.el.classList.toggle('hi', this.highlight.includes(p.id));
    });

    // Sun billboard: basis (r, u, -f) so the moon offset is measured in the same "upright" frame as the screen
    const f = new THREE.Vector3(sd[0], sd[1], sd[2]);
    let rr = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    if (rr.lengthSq() < 1e-6) rr.set(1, 0, 0);
    rr.normalize();
    const uu = new THREE.Vector3().crossVectors(rr, f);
    const sz = SUN_D * Math.tan(rs);
    const m4 = new THREE.Matrix4().makeBasis(rr.clone().multiplyScalar(sz), uu.clone().multiplyScalar(sz), f.clone().multiplyScalar(-sz));
    m4.setPosition(f.clone().multiplyScalar(SUN_D));
    this.sunMesh.matrix.copy(m4);
    this.sunMesh.matrixWorldNeedsUpdate = true;
    const mv = new THREE.Vector3(md[0], md[1], md[2]);
    const mf = mv.dot(f);
    const su = this.sunMesh.material.uniforms;
    su.uMoon.value.set(Math.atan2(mv.dot(rr), mf) / rs, Math.atan2(mv.dot(uu), mf) / rs);
    if (mf < 0) su.uMoon.value.set(99, 99);
    su.uK.value = rm / rs;
    su.uPx.value = Math.tan(rs) / Math.tan((this.camera.fov * D2R) / 2) * this.rendererH / 2;
    const corona = 1 - THREE.MathUtils.smoothstep(vis, 0, 0.0015);
    su.uCorona.value = this.filter ? 0 : corona * (rm > rs ? 1 : 0);
    su.uChromo.value = this.filter ? 0 : (1 - THREE.MathUtils.smoothstep(vis, 0, 0.02)) * (rm > rs ? 1 : 0.3);
    su.uGlare.value = this.filter ? 0 : Math.pow(vis, 1.5) * Math.min(1, 40 / Math.max(su.uPx.value, 1)) * THREE.MathUtils.smoothstep(sunAlt, -2, 3);
    su.uTime.value = this.time;
    su.uFilter.value = this.filter ? 1 : 0;
    this.sunMesh.visible = sunAlt > -2 - rs / D2R;

    // a planet in front of the Sun
    su.uPlanet.value.set(99, 99, 0);
    if (this.transit) {
      const pv = new THREE.Vector3(...planets[this.transit].dir), pf = pv.dot(f);
      if (pf > 0) su.uPlanet.value.set(Math.atan2(pv.dot(rr), pf) / rs, Math.atan2(pv.dot(uu), pf) / rs, (planets[this.transit].rDeg * D2R) / rs);
    }

    // diamond ring / Baily's beads flash on the side where the last sliver of Sun remains
    const ringI = rm > rs ? THREE.MathUtils.smoothstep(vis, 0, 2e-4) * (1 - THREE.MathUtils.smoothstep(vis, 0.002, 0.02)) : 0;
    this.ring.visible = ringI > 0.01 && this.sunMesh.visible && !this.filter;
    if (this.ring.visible) {
      const om = su.uMoon.value.clone();
      const dir = om.lengthSq() > 1e-8 ? om.normalize().multiplyScalar(-1) : new THREE.Vector2(1, 0);
      const p = f.clone().multiplyScalar(SUN_D).addScaledVector(rr, dir.x * sz).addScaledVector(uu, dir.y * sz);
      this.ring.position.copy(p);
      this.ring.scale.setScalar(sz * 3.2);
      this.ring.material.opacity = ringI;
    }

    // Moon: hidden near the Sun (the Sun's shader draws the Moon's silhouette there)
    const mm = this.moonMesh, mu = mm.material.uniforms;
    mm.visible = sep > 3 * D2R && moonAlt > -2;
    mm.position.copy(mv).multiplyScalar(MOON_D);
    mm.scale.setScalar(MOON_D * Math.sin(rm));
    const centre = toHorizon([0, 0, 0], o, at);
    const earthRel = new THREE.Vector3(centre[0] - moon[0], centre[1] - moon[1], centre[2] - moon[2]);
    mu.uSunRel.value.set(sun[0] - moon[0], sun[1] - moon[1], sun[2] - moon[2]);
    mu.uEarthRel.value.copy(earthRel);
    const ncp = new THREE.Vector3(0, Math.sin(o.lat * D2R), -Math.cos(o.lat * D2R));
    moonBasis(earthRel, ncp, mu.uBasis.value);
    mu.uOcc.value = 1 - day * 0.9;
    mu.uGain.value = 1;

    // labels for the Sun and Moon (not when zoomed onto them: they'd sit on the disc)
    const sl = this.bodyLabels.get('sun')!, ml = this.bodyLabels.get('moon')!;
    sl.dir.copy(f); sl.on = sunAlt > -1 && !this.filter && this.camera.fov > 8;
    ml.dir.copy(mv); ml.on = moonAlt > -1 && this.camera.fov > 8 && (mm.visible || this.highlight.includes('moon'));
    ml.el.classList.toggle('hi', this.highlight.includes('moon'));

    // average-size Moon ring, centred on the Moon
    this.avgRing.visible = this.avgMoon > 0 && moonAlt > -1;
    if (this.avgRing.visible) {
      this.avgRing.position.copy(mv).multiplyScalar(MOON_D * 0.98);
      this.avgRing.lookAt(0, 0, 0);
      this.avgRing.scale.setScalar(MOON_D * 0.98 * Math.tan(this.avgMoon * D2R));
      (this.avgRing.material as THREE.LineDashedMaterial).scale = 1;
    }

    // meteor radiant
    if (this.radiant) {
      const rv = new THREE.Vector3(...this.radiant.dir).applyMatrix4(H).normalize();
      this.radiantHz = { az: azOf([rv.x, rv.y, rv.z]), alt: Math.asin(rv.y) / D2R };
      this.radLabel ??= this.label(this.radiant.name, 'sky-lbl sky-lbl-rad');
      this.radLabel.dir.copy(rv);
      this.radLabel.on = rv.y > -0.02;
    }

    // meteors
    this.stepMeteors(dtReal, rate, H);

    // ground tint: lit by the sky
    const gl = 0.02 + 0.2 * day;
    this.ground.material.uniforms.uCol.value.setRGB(gl * 0.35, gl * 0.4, gl * 0.5);

    this.state = {
      sun, moon, sunAlt, sunAz: azOf(sun), moonAlt, moonAz: azOf(moon), rs: rs / D2R, rm: rm / D2R, sep: sep / D2R,
      vis, day, tot, planets,
    };
    return this.state;
  }

  private stepMeteors(dt: number, rate: number, H: THREE.Matrix4): void {
    const sh = this.shower;
    if (sh && dt > 0) {
      const rad = new THREE.Vector3(...sh.radiant).applyMatrix4(H).normalize();
      const alt = Math.asin(rad.y);
      const dark = 1 - THREE.MathUtils.smoothstep(this.state?.day ?? 0, 0, 0.15);
      this.spawnAcc += Math.min(4, sh.perSec * Math.max(0, Math.sin(alt)) * rate) * dt * dark;
      while (this.spawnAcc >= 1 && this.meteors.length < 48) {
        this.spawnAcc -= 1;
        // a point 8–60° from the radiant, moving away from it along the great circle
        const d = (8 + Math.random() * 52) * D2R, pa = Math.random() * Math.PI * 2;
        const e1 = new THREE.Vector3().crossVectors(rad, new THREE.Vector3(0, 1, 0));
        if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
        e1.normalize();
        const e2 = new THREE.Vector3().crossVectors(rad, e1);
        const off = e1.multiplyScalar(Math.cos(pa)).addScaledVector(e2, Math.sin(pa));
        const start = rad.clone().multiplyScalar(Math.cos(d)).addScaledVector(off, Math.sin(d));
        if (start.y < 0.03) continue;
        const axis = new THREE.Vector3().crossVectors(rad, start).normalize();
        this.meteors.push({
          radiant: [rad.x, rad.y, rad.z], born: this.time, life: 0.35 + Math.random() * 0.8,
          start: [start.x, start.y, start.z], axis: [axis.x, axis.y, axis.z], len: (4 + Math.random() * 16) * D2R * Math.sin(d) * 1.4,
          bright: 0.35 + Math.pow(Math.random(), 3) * 0.65,
        });
      }
      this.spawnAcc = Math.min(this.spawnAcc, 4);
    }
    const g = this.meteorMesh.geometry, P = g.attributes.position as THREE.BufferAttribute, T = g.attributes.aT as THREE.BufferAttribute;
    (P.array as Float32Array).fill(0); (T.array as Float32Array).fill(0);
    this.meteors = this.meteors.filter(m => this.time - m.born < m.life);
    const width = STAR_R * Math.tan(0.06 * D2R) * Math.max(0.6, this.camera.fov / 60);
    this.meteors.forEach((m, i) => {
      const k = (this.time - m.born) / m.life;
      const s = new THREE.Vector3(...m.start), ax = new THREE.Vector3(...m.axis);
      const head = s.clone().applyAxisAngle(ax, m.len * k).normalize();
      const tail = s.clone().applyAxisAngle(ax, m.len * Math.max(0, k - 0.45)).normalize();
      const side = new THREE.Vector3().crossVectors(head, ax).normalize().multiplyScalar(width * (0.6 + m.bright));
      const fade = Math.sin(Math.min(1, k) * Math.PI) * m.bright;
      const b = Math.floor(fade * 99) + 0.0;
      const pts = [tail.clone().multiplyScalar(STAR_R).sub(side), tail.clone().multiplyScalar(STAR_R).add(side), head.clone().multiplyScalar(STAR_R).sub(side), head.clone().multiplyScalar(STAR_R).add(side)];
      pts.forEach((p, j) => {
        P.setXYZ(i * 4 + j, p.x, p.y, p.z);
        T.setXY(i * 4 + j, j < 2 ? 0 : 1, b + (j % 2 ? 0.999 : 0.0));
      });
    });
    P.needsUpdate = true; T.needsUpdate = true;
  }

  /** Height of the drawing buffer in CSS px (set by the theatre on resize), for pixel-accurate sizes. */
  rendererH = 800;

  /** Pin labels: call after the camera has its final orientation for the frame. */
  placeLabels(w: number, h: number, extra: (l: Label) => void = () => {}): void {
    const v = new THREE.Vector3();
    this.camera.updateMatrixWorld(); // the controls just moved it; render() would only refresh this afterwards
    for (const l of this.labels) {
      extra(l);
      v.copy(l.dir).multiplyScalar(100).project(this.camera);
      const on = l.on && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      l.el.style.display = on ? '' : 'none';
      if (on) l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  render(r: THREE.WebGLRenderer): void { r.render(this.scene, this.camera); }

  dispose(): void {
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    for (const l of this.labels) l.el.remove();
    this.labels = [];
  }
}

/** EQ→GAL as a three Matrix3 (rows: galactic axes in equatorial coordinates). */
let G3: THREE.Matrix3 | null = null;
function galToEqBasis(): THREE.Matrix3 {
  if (G3) return G3;
  // columns of galToEq are the galactic axes expressed in equatorial; its transpose maps equatorial → galactic
  const x = galToEq([1, 0, 0]), y = galToEq([0, 1, 0]), z = galToEq([0, 0, 1]);
  G3 = new THREE.Matrix3().set(x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]);
  return G3;
}

