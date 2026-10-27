/**
 * Living-sky effects for the Solar System view, all GPU-driven and cheap (a handful of draw calls):
 * - the asteroid belt (with Kirkwood gaps), Jupiter's Trojans and the Kuiper belt, each rock on its own Kepler orbit;
 * - the Sun's corona (equatorial streamers, polar plumes), prominence loops and eruptions: a rising prominence, a
 *   two-ribbon flare and a three-part coronal mass ejection;
 * - weather: zonal jets and storm vortices flowing on the giant planets, Venus's super-rotating clouds, Earth's
 *   cloud cover with cyclones, Martian dust storms, and aurorae on Earth, Jupiter and Saturn;
 * - Comet Encke (3.3-year orbit) whose ion and dust tails grow as it nears the Sun.
 */
import * as THREE from 'three';
import type { BodyId } from '../../shared/data/solar.ts';
import { displayOrbit } from '../../shared/lib/orbits.ts';
import type { Quality } from '../globe/quality.ts';
import { mulberry32 as rng } from '../../shared/lib/rng.ts';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

const NOISE = /* glsl */ `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
vec3 rotAbout(vec3 p, vec3 k, float a) { return p * cos(a) + cross(k, p) * sin(a) + k * dot(k, p) * (1.0 - cos(a)); }
`;

const additive = (o: Partial<THREE.ShaderMaterialParameters>) =>
  new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });

// ---------------------------------------------------------------------------------------------------------------
// Small bodies
// ---------------------------------------------------------------------------------------------------------------
const BELT_VS = /* glsl */ `
attribute vec4 aOrb;   // a (AU), phase (rad), inclination (rad), node (rad)
attribute vec2 aKind;  // kind (0 belt, 1 trojan, 2 kuiper), size
attribute vec3 aColor;
uniform float uDays; uniform float uJup; uniform float uScale; uniform float uPr;
varying vec3 vC;
void main() {
  float a = aOrb.x;
  float th = aKind.x == 1.0 ? uJup + aOrb.y : aOrb.y + uDays * 6.2831853 / (365.25 * a * sqrt(a));
  float r = 12.0 * sqrt(a);
  vec3 p = vec3(r * cos(th), r * sin(aOrb.z) * sin(th - aOrb.w), -r * sin(th));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aKind.y * uScale / max(1e-4, -mv.z);
  gl_PointSize = clamp(px, 1.0 * uPr, 3.2 * uPr);
  vC = aColor * clamp(px / uPr + 0.35, 0.35, 1.0);
}`;
const BELT_FS = /* glsl */ `
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.2, 0.5, length(d));
  gl_FragColor = vec4(vC * a, 1.0);
  #include <colorspace_fragment>
}`;

/** Main belt (2.1–3.3 AU, emptied at the Kirkwood gaps), Hildas, Jupiter's Trojans (±60°) and the Kuiper belt. */
class SmallBodies {
  readonly points: THREE.Points;
  private u = { uDays: { value: 0 }, uJup: { value: 0 }, uScale: { value: 1 }, uPr: { value: 1 } };

  constructor(scene: THREE.Scene, q: Quality) {
    const k = q.tier === 'high' ? 1 : q.tier === 'medium' ? 0.55 : 0.32;
    const nBelt = Math.round(7000 * k), nHilda = Math.round(500 * k), nTro = Math.round(1400 * k), nKui = Math.round(4200 * k);
    const n = nBelt + nHilda + nTro + nKui;
    const orb = new Float32Array(n * 4), kind = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const r = rng(2024);
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) / 0.577; };
    const gaps = [2.502, 2.825, 2.958, 3.279];
    let i = 0;
    const put = (a: number, ph: number, inc: number, kd: number, size: number, c: [number, number, number]) => {
      orb.set([a, ph, inc, r() * TAU], i * 4);
      kind.set([kd, size], i * 2);
      col.set(c, i * 3);
      i++;
    };
    while (i < nBelt) {
      const a = 2.1 + Math.pow(r(), 0.85) * 1.2;
      if (gaps.some(g => Math.abs(a - g) < 0.022 * (0.4 + r()))) continue;
      // inner belt is stony (S-type, tan), outer carbonaceous (C-type, grey)
      const t = (a - 2.1) / 1.2, b = 0.32 + r() * 0.3;
      put(a, r() * TAU, Math.abs(gauss()) * 0.12, 0, 0.05 + r() * 0.05, [b * (1.05 - 0.25 * t), b * (0.9 - 0.1 * t), b * (0.72 + 0.1 * t)]);
    }
    for (let j = 0; j < nHilda; j++) put(3.97 + gauss() * 0.04, r() * TAU, Math.abs(gauss()) * 0.1, 0, 0.05, [0.3, 0.27, 0.24]);
    for (let j = 0; j < nTro; j++) {
      const lead = j % 2 ? 1 : -1;
      put(5.2 + gauss() * 0.06, lead * 60 * D2R + gauss() * 0.22, Math.abs(gauss()) * 0.2, 1, 0.06, [0.36, 0.3, 0.26]);
    }
    for (let j = 0; j < nKui; j++) {
      const a = 39.4 + (r() < 0.25 ? gauss() * 0.4 : 3 + r() * 5.5); // plutinos at 39.4 AU, the classical belt 42–48 AU
      const b = 0.2 + r() * 0.22;
      put(a, r() * TAU, Math.abs(gauss()) * 0.17, 2, 0.16, [b * 0.8, b * 0.88, b * 1.05]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(g, additive({ uniforms: this.u, vertexShader: BELT_VS, fragmentShader: BELT_FS }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(days: number, jupAngle: number, scale: number, pr: number): void {
    this.u.uDays.value = days;
    this.u.uJup.value = jupAngle;
    this.u.uScale.value = scale;
    this.u.uPr.value = pr;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The Sun
// ---------------------------------------------------------------------------------------------------------------
const NOISE2 = /* glsl */ `
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/**
 * Flare geometry shared by the photosphere's ribbons (view.ts) and the post-flare loop arcade, so the loops stand on
 * the ribbons. Angles in radians on the unit Sun; `fa` is seconds since the flare's impulsive phase.
 */
export const FLARE_GLSL = /* glsl */ `
const float FLARE_LEN = 0.15;                                                  // half-length of the ribbons
float flareSep(float fa) { return 0.02 + 0.007 * clamp(fa, 0.0, 12.0); }     // ribbons drift apart as reconnection climbs
float flareBow(float x) { return 1.0 + 0.35 * x * x; }                         // x = along / FLARE_LEN
`;

/** Where a point lies against the solar disc: 1 when it is in front of the photosphere, 0 beyond the limb or behind. */
const DISC_GLSL = /* glsl */ `
float onDisc(vec3 w, float rLocal) {
  vec3 C = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float Rw = rLocal * length(modelMatrix[0].xyz);
  vec3 V = normalize(cameraPosition - C), rel = w - C;
  float along = dot(rel, V);
  float perp = length(rel - V * along) / Rw;
  return along > 0.0 ? 1.0 - smoothstep(0.985, 1.015, perp) : 0.0;
}`;

const CORONA_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/**
 * The corona as a coronagraph sees it, drawn on a camera-facing plane (x = screen right, y = screen up):
 * - helmet streamers bunched around the solar equator that narrow into long rays,
 * - short fine plumes over the poles,
 * - radial filaments that evolve slowly (noise sampled on the direction only, so every structure stays radial),
 * - and the classic three-part coronal mass ejection as LASCO records it: a "light bulb" whose bright, loopy leading
 *   edge sits on two legs rooted at the Sun, a dark cavity (the flux rope), a bright twisted core (the erupted
 *   prominence) and, ahead of it, the faint sheath of compressed corona behind the shock. The bulb grows
 *   self-similarly and accelerates outward; it is foreshortened by how far the eruption points towards the viewer.
 */
const CORONA_FS = /* glsl */ `
uniform float uT; uniform float uBoost; uniform float uSpan; uniform vec2 uPole; uniform vec4 uCme; // angle, age, sin(view), on
varying vec2 vUv;
${NOISE2}
float sdBulb(vec2 p, float r1, float r2, float h) {   // uneven capsule: a cone from the base circle to the bulb circle
  p.x = abs(p.x);
  float b = (r1 - r2) / h, a = sqrt(max(0.0, 1.0 - b * b));
  float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uSpan;          // in solar radii
  float r = length(p);
  if (r < 0.98) discard;
  vec2 d = p / r;
  float eq = 1.0 - abs(dot(d, uPole));         // 1 over the solar equator, 0 over the poles
  float t = uT * 0.015;
  float fil = 0.6 * vn(d * 34.0 + vec2(t, -t)) + 0.4 * vn(d * 85.0 - t * 1.7);
  float lobes = vn(d * 3.6 + vec2(1.7, t * 0.4));
  float streamer = smoothstep(0.5, 0.85, lobes) * pow(eq, 3.0);
  float narrow = mix(1.0, fil * fil * 1.8, smoothstep(1.3, 3.2, r)); // broad helmets near the limb, thin rays beyond
  float plume = pow(1.0 - eq, 3.0) * pow(vn(d * 64.0 + t), 3.0) * smoothstep(2.6, 1.2, r);
  float fall = smoothstep(uSpan, uSpan * 0.4, r);
  float ray = (0.08 + 1.6 * streamer * narrow + 0.7 * plume) * (0.45 + 0.55 * fil) * pow(1.0 / r, 2.6) * fall;
  float inner = pow(1.0 / r, 6.0);
  float k = (0.55 * inner + 0.5 * ray) * smoothstep(0.98, 1.05, r) * (1.0 + uBoost);
  vec3 col = vec3(1.0, 0.86, 0.6) * k;
  if (uCme.w > 0.0 && uCme.y > 0.0) {
    float age = uCme.y;
    vec2 ax = vec2(cos(uCme.x), sin(uCme.x)), bx = vec2(-ax.y, ax.x);
    // CME frame: x across, y outward from the Sun's centre, stretched back by the foreshortening
    vec2 q = vec2(dot(p, bx), 1.0 + (dot(p, ax) - 1.0) / max(uCme.z, 0.3));
    float top = 1.12 + 0.2 * age + 0.07 * age * age;   // leading edge (R): slow lift-off, then it races out
    float rb = 0.42 * (top - 0.95);                     // bulb radius
    float r1 = min(0.2, rb * 0.9);                      // the legs' spread at the limb
    float hh = max(top - rb - 1.0, abs(r1 - rb) + 0.02);
    float sd = sdBulb(q - vec2(0.0, 1.0), r1, rb, hh);
    float w = 0.05 + 0.02 * age;
    vec2 cq = q - vec2(0.0, 1.0 + hh);                  // from the bulb's centre
    float phi = atan(cq.x, cq.y);
    float bulb = smoothstep(-0.6, 0.2, cq.y / rb);      // the bulb is brighter than the legs
    // loop-like brightenings along the rim, streaked radially like the rest of the corona
    float loops = (0.35 + 0.65 * vn(vec2(phi * 4.0 + 3.0, age * 0.2))) * (0.45 + 0.75 * fil);
    float front = exp(-pow(sd / w, 2.0)) * loops * (0.35 + 0.65 * bulb);
    front += 0.3 * exp(-pow((sd + 2.6 * w) / (1.3 * w), 2.0)) * vn(vec2(phi * 5.0 + 11.0, age * 0.3)) * bulb * fil;
    float sheath = step(0.0, sd) * exp(-sd / (0.1 + 0.05 * age)) * smoothstep(-0.2, 0.7, cq.y / rb) * 0.2;
    float cavity = smoothstep(-w, -3.0 * w, sd);
    vec2 kq = (q - vec2(0.0, 1.0 + hh * 0.72)) / (rb * vec2(0.32, 0.3));
    float twist = 0.5 + 0.5 * sin(kq.x * 3.5 + kq.y * 5.0 - age * 0.6);
    float core = exp(-dot(kq, kq)) * (0.3 + 0.7 * twist * twist) * (0.6 + 0.4 * vn(kq * 3.0 + age));
    float fade = smoothstep(0.0, 0.7, age) * (1.0 - smoothstep(4.5, 8.0, age));
    float dim = pow(max(r, 1.0), -1.1);
    col *= 1.0 - 0.6 * cavity * fade;
    vec3 coreC = mix(vec3(1.0, 0.42, 0.22), vec3(1.0, 0.82, 0.62), smoothstep(1.5, 7.0, age)); // cool prominence gas heats up
    col += (vec3(1.0, 0.93, 0.8) * (front * 0.6 + sheath) + coreC * core * 0.7) * fade * dim;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Prominences as magnetic flux ropes: a few fine threads twisted around each loop's axis. Against space they glow
 * H-alpha red; in front of the disc they show as dark filaments, as in H-alpha photographs. The erupting rope rises
 * slowly, then runs away once the flare goes off: it swells, untwists into a kink (the top rotates), its plasma drains
 * down both legs, and it fades into the CME's core. The legs stay rooted.
 */
const PROM_VS = /* glsl */ `
attribute vec3 aTan; attribute vec3 aCtr; attribute vec4 aStr; attribute vec3 aLoop;
// position: point on the thread's axis; normal / aTan: frame; aCtr: loop centre (unit); aStr: thread phase, ring angle,
// s along the loop, thread offset from the rope axis; aLoop: period, phase offset, loop id
uniform float uT; uniform float uEid; uniform float uEage; uniform float uR; uniform float uThread; uniform float uFlareAt;
varying float vS; varying float vI; varying float vId; varying float vDisc; varying float vErupt;
varying vec3 vN; varying vec3 vV;
${DISC_GLSL}
vec3 rotK(vec3 p, vec3 k, float a) { return p * cos(a) + cross(k, p) * sin(a) + k * dot(k, p) * (1.0 - cos(a)); }
void main() {
  float s = aStr.z, hump = sin(3.14159 * s);
  float life = fract(uT / aLoop.x + aLoop.y);
  bool mine = abs(aLoop.z - uEid) < 0.5;
  float e = uEage;
  bool erupting = mine && e < 12.0;
  if (erupting) life = 0.55;
  vec3 foot = normalize(position) * uR;
  vec3 p = foot + (position - foot) * (0.45 + 0.55 * smoothstep(0.0, 0.6, life));
  float tw = 0.0, wid = 1.0;
  if (erupting) {
    float run = max(e - uFlareAt, 0.0);
    float G = 1.0 + 0.06 * e + 0.035 * (exp(1.05 * run) - 1.0);
    p = foot + (p - foot) * G;
    vec3 lat = p - aCtr * dot(p, aCtr);
    p += lat * 0.28 * (G - 1.0) * hump;                                  // the top balloons sideways
    vec3 o = aCtr * uR;
    p = o + rotK(p - o, aCtr, 0.7 * smoothstep(1.0, 7.0, e) * hump);     // kink: the apex writhes
    tw = 0.9 * smoothstep(0.0, 7.0, e);
    wid = 1.0 + 0.3 * (G - 1.0);
  }
  vec3 n1 = normal, n2 = cross(aTan, n1);
  float ph = aStr.x + 6.2831 * (0.3 * s + tw * hump);
  vec3 thread = (n1 * cos(ph) + n2 * sin(ph)) * aStr.w * wid;
  vec3 ring = n1 * cos(aStr.y) + n2 * sin(aStr.y);
  vec4 w = modelMatrix * vec4(p + thread + ring * uThread * wid, 1.0);
  vN = normalize(mat3(modelMatrix) * ring);
  vV = normalize(cameraPosition - w.xyz);
  vDisc = onDisc(w.xyz, uR);
  vS = s; vId = aLoop.z * 7.13 + aStr.x;
  vErupt = erupting ? 1.0 : 0.0;
  vI = pow(sin(3.14159 * life), 1.4) * (0.65 + 0.35 * fract(sin(aStr.x * 91.7 + aLoop.z) * 437.5));
  if (erupting) vI *= (1.0 + 0.5 * smoothstep(uFlareAt - 1.0, uFlareAt + 1.0, e)) * (1.0 - smoothstep(4.5, 8.0, e));
  else if (mine) vI *= smoothstep(13.0, 19.0, e);                    // a new prominence slowly re-forms afterwards
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const PROM_FS = /* glsl */ `
uniform float uT;
varying float vS; varying float vI; varying float vId; varying float vDisc; varying float vErupt;
varying vec3 vN; varying vec3 vV;
void main() {
  float u = abs(vS - 0.5) * 2.0;                                       // 0 at the top, 1 at the feet
  float drain = pow(0.5 + 0.5 * sin(u * 23.0 - uT * (1.2 + 2.5 * vErupt) + vId * 3.0), 2.0); // blobs sliding down both legs
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float k = 0.75 + 0.35 * drain * (0.5 + 0.5 * vErupt);
  vec3 glow = mix(vec3(0.9, 0.16, 0.1), vec3(1.0, 0.36, 0.22), drain * 0.4) * k;   // H-alpha red, hotter in the blobs
  // Premultiplied "over" with colour/alpha = glow, so stacked threads converge on H-alpha red instead of saturating to
  // white. Beyond the limb the gas shines over the corona; on the disc it only absorbs (a dark filament).
  float a = vI * rim * 0.42;
  gl_FragColor = vec4(glow * a * (1.0 - vDisc), a * mix(1.0, 1.2, vDisc));
  #include <colorspace_fragment>
}`;

/**
 * The post-flare loop arcade: hot loops that stand on the two flare ribbons, first sheared and low, then higher and
 * more upright as the ribbons separate, later raining cooled plasma down their legs. Built in a frame with the flare
 * at +Y and the ribbons along X; the mesh is turned onto the flare site.
 */
const ARC_VS = /* glsl */ `
attribute vec4 aA;   // position along the neutral line (-1..1), s along the loop, ring angle, seed
uniform float uAge; uniform float uR;
varying float vS; varying float vSeed; varying float vDisc;
${FLARE_GLSL}
${DISC_GLSL}
void main() {
  float fa = max(uAge, 0.0), s = aA.y;
  float sep = flareSep(fa) * flareBow(aA.x);
  float shear = sep * 1.6 * exp(-fa / 3.0);
  float x = aA.x * FLARE_LEN + mix(-shear, shear, s), z = mix(-sep, sep, s);
  vec3 dir = normalize(vec3(x, 1.0, z));
  vec3 ax = dir * uR * (1.0 + sep * (0.85 + 0.3 * aA.w) * sin(3.14159 * s));
  vec3 o = (vec3(1.0, 0.0, 0.0) * cos(aA.z) + dir * sin(aA.z)) * uR * 0.0055;
  vec4 w = modelMatrix * vec4(ax + o, 1.0);
  vDisc = onDisc(w.xyz, uR);
  vS = s; vSeed = aA.w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ARC_FS = /* glsl */ `
uniform float uAge; uniform float uT;
varying float vS; varying float vSeed; varying float vDisc;
void main() {
  float fa = uAge, u = abs(vS - 0.5) * 2.0;
  float env = smoothstep(0.4, 2.5, fa) * (1.0 - smoothstep(11.0, 18.0, fa)) * smoothstep(vSeed * 6.0, vSeed * 6.0 + 1.5, fa);
  float rain = smoothstep(5.0, 9.0, fa) * pow(0.5 + 0.5 * sin(u * 30.0 - uT * 2.2 + vSeed * 40.0), 10.0);
  float top = 0.55 + 0.45 * (1.0 - u * u);                             // loop tops glow brightest
  // Premultiplied "over" converging on EUV gold, so the stacked loops stay gold against the bright inner corona.
  vec3 c = mix(vec3(1.0, 0.52, 0.18), vec3(1.0, 0.72, 0.36), top * vSeed) + vec3(0.0, -0.2, -0.1) * rain;
  float a = env * (0.3 + 0.25 * vSeed) * top * mix(1.0, 0.45, vDisc) + env * rain * 0.5;
  gl_FragColor = vec4(c * a, a);
  #include <colorspace_fragment>
}`;

/**
 * The timeline of one eruption, in seconds after it starts (shared by every layer so they stay in step): the
 * prominence lifts slowly, then at `flare` the impulsive phase lights the ribbons and the rope runs away; the CME bulb
 * appears just before, and the arcade grows and cools until `end`.
 */
const ERUPT = { flare: 3.0, cme: 2.6, end: 24 };

/** Corona, prominences and eruptions, parented to the Sun's node (prominences turn with its surface). */
class SunFX {
  private corona: THREE.Mesh;
  private cu = { uT: { value: 0 }, uBoost: { value: 0 }, uSpan: { value: 6 }, uPole: { value: new THREE.Vector2(0, 1) }, uCme: { value: new THREE.Vector4(0, 0, 1, 0) } };
  private pu = { uT: { value: 0 }, uEid: { value: -1 }, uEage: { value: 99 }, uR: { value: 1 }, uThread: { value: 0.004 }, uFlareAt: { value: ERUPT.flare } };
  private au = { uT: { value: 0 }, uAge: { value: -99 }, uR: { value: 1 } };
  private arcade: THREE.Mesh;
  private loops: THREE.Vector3[] = [];
  private eDir = new THREE.Vector3(0, 1, 0);
  private flareLocal = new THREE.Vector3(0, 1, 0);
  private uFlare: { value: THREE.Vector4 } | null;
  private next = 4;
  private since = 99;
  private r = rng(7);
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(node: THREE.Object3D, private spin: THREE.Object3D, private R: number, q: Quality, mat: THREE.Material) {
    const S = this.cu.uSpan.value;
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(2 * R * S, 2 * R * S),
      additive({ uniforms: this.cu, vertexShader: CORONA_VS, fragmentShader: CORONA_FS }));
    node.add(this.corona);
    this.pu.uR.value = R;
    this.pu.uThread.value = R * 0.0032;
    spin.add(this.prominences(q.tier === 'high' ? 9 : q.tier === 'medium' ? 7 : 5, q.tier === 'low' ? 3 : 5));
    this.uFlare = (mat as THREE.ShaderMaterial).uniforms?.uFlare ?? null;
    this.au.uR.value = R;
    this.arcade = this.buildArcade(q.tier === 'low' ? 9 : 15);
    spin.add(this.arcade);
  }

  /** Magnetic flux ropes standing on the surface, each growing and fading on its own cycle. */
  private prominences(n: number, threads: number): THREE.Mesh {
    const R = this.R, SEG = 40, RING = 4;
    const pos: number[] = [], nor: number[] = [], tan: number[] = [], ctr: number[] = [], str: number[] = [], loop: number[] = [], idx: number[] = [];
    const c = new THREE.Vector3(), t = new THREE.Vector3(), ax = new THREE.Vector3(), d = new THREE.Vector3(), T = new THREE.Vector3();
    const N1 = new THREE.Vector3(), P = new THREE.Vector3(), Pn = new THREE.Vector3(), o = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      // Active regions live in two belts either side of the equator.
      const lat = (this.r() < 0.5 ? -1 : 1) * (8 + this.r() * 27) * D2R, lon = this.r() * TAU;
      c.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      this.loops.push(c.clone());
      t.set(this.r() - 0.5, this.r() - 0.5, this.r() - 0.5).cross(c).normalize();
      ax.crossVectors(c, t).normalize();
      const sep = (6 + this.r() * 10) * D2R, H0 = R * (0.14 + this.r() * 0.32), rope = R * (0.008 + this.r() * 0.008);
      const period = 16 + this.r() * 22, off = this.r();
      for (let j = 0; j < threads; j++) {
        const H = H0 * (0.9 + this.r() * 0.2), ph = (j / threads) * TAU + this.r() * 0.6, rr = rope * (0.6 + this.r() * 0.6);
        const at = (s: number, out: THREE.Vector3, dir: THREE.Vector3) => {
          dir.copy(c).applyAxisAngle(ax, (s - 0.5) * sep);
          return out.copy(dir).multiplyScalar(R * 0.995 + H * Math.sin(Math.PI * s));
        };
        const v0 = pos.length / 3;
        for (let i = 0; i <= SEG; i++) {
          const s = i / SEG;
          at(s, P, d);
          at(Math.min(1, s + 0.01), Pn, o);
          if (i === SEG) { at(s - 0.01, Pn, o); T.subVectors(P, Pn).normalize(); } else T.subVectors(Pn, P).normalize();
          N1.copy(d).addScaledVector(T, -d.dot(T)).normalize();
          const taper = 0.5 + 0.5 * Math.sin(Math.PI * s);
          for (let m = 0; m < RING; m++) {
            pos.push(P.x, P.y, P.z); nor.push(N1.x, N1.y, N1.z); tan.push(T.x, T.y, T.z); ctr.push(c.x, c.y, c.z);
            str.push(ph, (m / RING) * TAU, s, rr * taper);
            loop.push(period, off, k);
          }
        }
        for (let i = 0; i < SEG; i++) for (let m = 0; m < RING; m++) {
          const a = v0 + i * RING + m, b = v0 + i * RING + ((m + 1) % RING), c2 = a + RING, d2 = b + RING;
          idx.push(a, c2, b, b, c2, d2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute('aCtr', new THREE.Float32BufferAttribute(ctr, 3));
    g.setAttribute('aStr', new THREE.Float32BufferAttribute(str, 4));
    g.setAttribute('aLoop', new THREE.Float32BufferAttribute(loop, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, additive({ uniforms: this.pu, vertexShader: PROM_VS, fragmentShader: PROM_FS,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    m.frustumCulled = false;
    return m;
  }

  /** `n` thin loops along the neutral line; their shape is computed in the shader from the flare's age. */
  private buildArcade(n: number): THREE.Mesh {
    const SEG = 24, RING = 4, a: number[] = [], idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : (k / (n - 1)) * 2 - 1 + (this.r() - 0.5) * 0.08, seed = this.r(), v0 = a.length / 4;
      for (let i = 0; i <= SEG; i++) for (let m = 0; m < RING; m++) a.push(u, i / SEG, (m / RING) * TAU, seed);
      for (let i = 0; i < SEG; i++) for (let m = 0; m < RING; m++) {
        const p = v0 + i * RING + m, q = v0 + i * RING + ((m + 1) % RING);
        idx.push(p, p + RING, q, q, p + RING, q + RING);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(a.length / 4 * 3), 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 4));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, additive({ uniforms: this.au, vertexShader: ARC_VS, fragmentShader: ARC_FS,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    m.frustumCulled = false;
    m.visible = false;
    return m;
  }

  update(t: number, dt: number, camera: THREE.Camera, node: THREE.Object3D): void {
    this.corona.quaternion.copy(camera.quaternion);
    if (node.parent) this.corona.quaternion.premultiply(node.parent.getWorldQuaternion(this.q).invert());
    this.cu.uT.value = t;
    this.pu.uT.value = t;
    this.au.uT.value = t;
    this.next -= dt;
    this.since += dt;
    if (this.next <= 0) this.erupt(camera, node);
    const f = this.since, fl = f - ERUPT.flare, live = f < ERUPT.end;
    // Screen-space axes of the corona plane, for the solar pole and the eruption's direction.
    const e = camera.matrixWorld.elements, rx = e[0], ry = e[1], rz = e[2], ux = e[4], uy = e[5], uz = e[6], bx = e[8], by = e[9], bz = e[10];
    const pole = this.v.set(0, 1, 0).applyQuaternion(this.spin.getWorldQuaternion(this.q));
    const px = pole.x * rx + pole.y * ry + pole.z * rz, py = pole.x * ux + pole.y * uy + pole.z * uz, pl = Math.hypot(px, py);
    if (pl > 0.05) this.cu.uPole.value.set(px / pl, py / pl);
    const d = this.eDir, sinV = Math.sqrt(Math.max(0, 1 - (d.x * bx + d.y * by + d.z * bz) ** 2));
    this.cu.uCme.value.set(Math.atan2(d.x * ux + d.y * uy + d.z * uz, d.x * rx + d.y * ry + d.z * rz), f - ERUPT.cme, sinV, live ? 1 : 0);
    this.pu.uEage.value = f;
    this.au.uAge.value = fl;
    this.arcade.visible = live && fl > 0;
    if (this.uFlare) this.uFlare.value.set(this.flareLocal.x, this.flareLocal.y, this.flareLocal.z, live ? fl : -99);
    this.cu.uBoost.value = fl > 0 && fl < 8 ? 0.45 * Math.exp(-fl * 0.7) * Math.min(1, fl * 5) : 0;
  }

  /** Start an eruption from the active-region loop nearest the limb, so it is seen side-on against space. */
  private erupt(camera: THREE.Camera, node: THREE.Object3D): void {
    this.next = 18 + this.r() * 16;
    this.since = 0;
    const view = node.getWorldPosition(new THREE.Vector3()).sub(camera.getWorldPosition(this.v)).normalize();
    const sq = this.spin.getWorldQuaternion(new THREE.Quaternion());
    let best = 0, bs = Infinity;
    const w = new THREE.Vector3();
    this.loops.forEach((c, k) => {
      w.copy(c).applyQuaternion(sq);
      const s = Math.abs(w.dot(view) + 0.3) + this.r() * 0.15; // near the limb, a little towards us so the flare shows too
      if (s < bs) { bs = s; best = k; }
    });
    const c = this.loops[best];
    this.pu.uEid.value = best;
    this.eDir.copy(c).applyQuaternion(sq);
    // Arcade frame: +Y on the flare, X along the ribbons (the same tangent the photosphere shader uses).
    const tg = new THREE.Vector3().crossVectors(c, new THREE.Vector3(0, 1, 0)).normalize();
    this.arcade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tg, c, new THREE.Vector3().crossVectors(tg, c)));
    // The Sun mesh is turned −90° about Y inside its spin group (texture seam), so undo that for the flare spot.
    this.flareLocal.copy(c).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------------------------------------------
/** Zonal jets (uv-x displacement per flow cycle, as GLSL of `lat` in radians) and storm vortices [lat, lon, radius (uv), spin]. */
const FLOW: Partial<Record<BodyId, { jets: string; storms: [number, number, number, number][] }>> = {
  jupiter: { jets: '0.0045 * cos(lat * 13.0) * (1.0 - smoothstep(1.05, 1.35, abs(lat))) + 0.004 * exp(-lat * lat / 0.02)',
    storms: [[-22, -55, 0.05, 0.5], [-33, -100, 0.018, 0.6], [24, 150, 0.02, -0.5]] },
  saturn: { jets: '0.007 * exp(-lat * lat / 0.25) + 0.0016 * cos(lat * 10.0)', storms: [[89, 0, 0.06, 0.4], [-89, 0, 0.05, -0.4]] },
  uranus: { jets: '-0.002 * cos(lat) * cos(lat) + 0.002 * exp(-pow(abs(lat) - 1.0, 2.0) / 0.06)', storms: [[28, 120, 0.02, 0.4]] },
  neptune: { jets: '-0.005 * cos(lat) * cos(lat) + 0.003 * exp(-pow(abs(lat) - 1.15, 2.0) / 0.04)',
    storms: [[-20, -30, 0.04, 0.5], [-55, 60, 0.015, 0.6]] },
};
export const FLOW_BODIES = new Set<BodyId>([...Object.keys(FLOW) as BodyId[], 'venus']);

/**
 * Makes the clouds on a giant planet flow: the map is sampled twice along a flow field (jets + vortices) with
 * staggered phases and cross-faded (the classic flow-map trick), so the bands shear and storms turn forever without
 * smearing. Venus just slides its whole cloud deck around (it laps the planet every four days).
 */
function patchFlow(id: BodyId, mat: THREE.MeshStandardMaterial, uFlow: { value: number }): void {
  const f = FLOW[id];
  if (!f && id !== 'venus') return;
  mat.customProgramCacheKey = () => 'flow-' + id;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uFlow = uFlow;
    sh.fragmentShader = 'uniform float uFlow;\n' + sh.fragmentShader.replace('#include <map_fragment>', id === 'venus' ? /* glsl */ `
#ifdef USE_MAP
  diffuseColor *= texture2D(map, vMapUv + vec2(uFlow * 0.012, 0.0)); // super-rotates westward, with the planet
#endif` : /* glsl */ `
#ifdef USE_MAP
  vec2 uv0 = vMapUv;
  float lat = (uv0.y - 0.5) * 3.14159;
  float cl = max(cos(lat), 0.08);
  vec2 fl = vec2(${f!.jets}, 0.0);
  ${f!.storms.map(([la, lo, rad, spin]) => /* glsl */ `{
    vec2 d = vec2((fract(uv0.x - ${((lo + 180) / 360).toFixed(4)} + 0.5) - 0.5) * 2.0 * cl, uv0.y - ${((la + 90) / 180).toFixed(4)});
    float e = exp(-dot(d, d) / ${(rad * rad).toFixed(6)});
    fl += vec2(-d.y / (2.0 * cl), d.x) * e * ${spin.toFixed(3)};
  }`).join('\n')}
  float p0 = fract(uFlow), p1 = fract(uFlow + 0.5);
  vec4 c0 = texture2D(map, uv0 - fl * p0), c1 = texture2D(map, uv0 - fl * p1);
  diffuseColor *= mix(c0, c1, abs(1.0 - 2.0 * p0));
#endif`);
  };
}

const SHELL_VS = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main() {
  vP = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const CLOUDS_FS = /* glsl */ `
uniform float uT; uniform vec3 uSun;
varying vec3 vP; varying vec3 vN; varying vec3 vW;
${NOISE}
void main() {
  vec3 p = rotAbout(vP, vec3(0.0, 1.0, 0.0), uT * 0.004);
  float lat = asin(clamp(vP.y, -1.0, 1.0));
  // Cyclones: spiral the noise around a few drifting storm centres (anticlockwise in the north, clockwise south).
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float clat = (fi < 2.0 ? 1.0 : -1.0) * (0.3 + 0.35 * fract(fi * 0.37 + 0.2));
    float clon = fi * 1.9 - uT * 0.012 * (1.0 + 0.3 * fi);
    vec3 c = vec3(cos(clat) * cos(clon), sin(clat), cos(clat) * sin(clon));
    float e = exp(-pow(distance(p, c), 2.0) / 0.018);
    p = rotAbout(p, c, sign(clat) * e * 4.5);
  }
  float n = fbm(p * 3.2 + vec3(0.0, uT * 0.006, 0.0));
  // Wet tropics and storm tracks, dry subtropics
  float band = 0.12 * exp(-lat * lat / 0.02) - 0.1 * exp(-pow(abs(lat) - 0.45, 2.0) / 0.02) + 0.08 * exp(-pow(abs(lat) - 0.95, 2.0) / 0.05);
  float cover = smoothstep(0.52, 0.78, n + band);
  float lit = smoothstep(-0.12, 0.35, dot(normalize(vN), uSun));
  gl_FragColor = vec4(vec3(0.97, 0.98, 1.0) * (0.18 + 0.82 * lit), cover * (0.25 + 0.6 * lit));
  #include <colorspace_fragment>
}`;
const DUST_FS = /* glsl */ `
uniform float uT; uniform vec3 uSun;
varying vec3 vP; varying vec3 vN; varying vec3 vW;
${NOISE}
void main() {
  float k = floor(uT / 75.0), life = fract(uT / 75.0);
  float grow = smoothstep(0.0, 0.45, life) * (1.0 - smoothstep(0.78, 1.0, life));
  float clat = -0.2 - 0.6 * h3(vec3(k, 1.0, 2.0)), clon = 6.2831 * h3(vec3(k, 7.0, 3.0));
  vec3 c = vec3(cos(clat) * cos(clon), sin(clat), cos(clat) * sin(clon));
  float reach = 0.2 + 1.1 * grow;
  float mask = 1.0 - smoothstep(reach * 0.55, reach, distance(vP, c));
  float n = fbm(vP * 4.5 + vec3(uT * 0.02, 0.0, uT * 0.013));
  float dust = smoothstep(0.38, 0.7, n) * mask * grow;
  float lit = smoothstep(-0.1, 0.4, dot(normalize(vN), uSun));
  gl_FragColor = vec4(vec3(0.82, 0.58, 0.38) * (0.15 + 0.85 * lit), dust * 0.85);
  #include <colorspace_fragment>
}`;
const AURORA_VS = /* glsl */ `
attribute float aH;
varying vec2 vUv; varying float vH;
void main() { vUv = uv; vH = aH; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const AURORA_FS = /* glsl */ `
uniform float uT; uniform vec3 uLow; uniform vec3 uHigh; uniform float uK;
varying vec2 vUv; varying float vH;
void main() {
  float x = vUv.x * 6.2831853;
  float ripple = pow(0.5 + 0.5 * sin(x * 14.0 + uT * 1.3 + 2.0 * sin(x * 3.0 - uT * 0.4)) * sin(x * 5.0 - uT * 0.7), 2.0);
  float rays = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(x * 160.0 + 3.0 * sin(x * 21.0 + uT * 0.9)), 3.0);
  float curtain = pow(1.0 - vH, 2.2) * smoothstep(0.0, 0.08, vH);
  vec3 c = mix(uLow, uHigh, vH);
  gl_FragColor = vec4(c * curtain * ripple * rays * uK * 0.6, 1.0);
  #include <colorspace_fragment>
}`;

/** Two open curtains of light around the magnetic poles (at ±lat), parented to the pole-aligned tilt group. */
function aurora(R: number, lat: number, hFrac: number, low: string, high: string, k: number, u: { uT: { value: number } }): THREE.Mesh {
  const N = 128, pos: number[] = [], uv: number[] = [], hh: number[] = [], idx: number[] = [];
  for (const sgn of [1, -1]) {
    const v0 = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU, la = (lat + 2.5 * Math.sin(a * 3 + sgn)) * D2R;
      const x = Math.cos(la) * Math.cos(a), y = sgn * Math.sin(la), z = Math.cos(la) * Math.sin(a);
      for (const h of [0, 1]) {
        const s = R * (1.01 + h * hFrac);
        pos.push(x * s, y * s, z * s);
        uv.push(i / N, h);
        hh.push(h);
      }
    }
    for (let i = 0; i < N; i++) { const a = v0 + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx);
  return new THREE.Mesh(g, additive({
    uniforms: { uT: u.uT, uLow: { value: new THREE.Color(low) }, uHigh: { value: new THREE.Color(high) }, uK: { value: k } },
    vertexShader: AURORA_VS, fragmentShader: AURORA_FS, side: THREE.DoubleSide,
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Comet Encke
// ---------------------------------------------------------------------------------------------------------------
/** 2P/Encke (JPL): a, e, i, Ω, ω, perihelion (ms). The shortest-period bright comet: back every 3.3 years. */
const ENCKE = { a: 2.2178, e: 0.8471, i: 11.35, node: 334.19, peri: 187.27, tp: Date.UTC(2023, 9, 22, 12) };
export const COMET_NAME = { en: 'Comet Encke', zh: '恩克彗星' };

/** Heliocentric ecliptic position (AU) of Encke at time `ms`. */
function enckeAU(ms: number): [number, number, number] {
  const { a, e } = ENCKE, P = 365.25 * Math.pow(a, 1.5);
  let M = (((ms - ENCKE.tp) / 864e5) / P) * TAU;
  M = Math.atan2(Math.sin(M), Math.cos(M));
  let E = e > 0.8 ? Math.PI * Math.sign(M) : M;
  for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = ENCKE.peri * D2R, O = ENCKE.node * D2R, i = ENCKE.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [x * (cw * cO - sw * sO * ci) - y * (sw * cO + cw * sO * ci), x * (cw * sO + sw * cO * ci) + y * (cw * cO * ci - sw * sO), x * sw * si + y * cw * si];
}

const TAIL_VS = /* glsl */ `
attribute vec3 aT; // kind (0 ion, 1 dust), phase, spread
uniform float uT; uniform vec3 uAnti; uniform vec3 uBack; uniform float uLen; uniform float uK; uniform float uScale; uniform float uPr;
varying vec3 vC;
void main() {
  float f = fract(uT * (aT.x < 0.5 ? 0.22 : 0.09) + aT.y);
  vec3 side = normalize(cross(uAnti, uBack + vec3(0.0, 0.001, 0.0)));
  vec3 up = normalize(cross(side, uAnti));
  float sp = aT.z - 0.5, sq = fract(aT.y * 7.31) - 0.5;
  vec3 p;
  if (aT.x < 0.5) p = uAnti * uLen * f + (side * sp + up * sq) * uLen * 0.07 * (0.3 + f);
  else {
    vec3 dir = normalize(uAnti + uBack * f * 0.9);
    p = dir * uLen * 0.7 * f + (side * sp + up * sq) * uLen * 0.12 * f;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uLen * 0.03 * uScale / max(1e-4, -mv.z), 1.2 * uPr, 6.0 * uPr);
  vec3 c = aT.x < 0.5 ? vec3(0.45, 0.72, 1.0) : vec3(1.0, 0.92, 0.75);
  vC = c * uK * (1.0 - f) * (1.0 - f) * (aT.x < 0.5 ? 0.22 : 0.14);
}`;

class Comet {
  readonly group = new THREE.Group();
  private u = { uT: { value: 0 }, uAnti: { value: new THREE.Vector3(1, 0, 0) }, uBack: { value: new THREE.Vector3(0, 0, 1) }, uLen: { value: 1 }, uK: { value: 0 },
    uScale: { value: 1 }, uPr: { value: 1 } };
  private coma: THREE.Sprite;
  readonly orbit: THREE.Line;
  readonly pos = new THREE.Vector3();

  constructor(scene: THREE.Scene, q: Quality, now: number) {
    const n = q.tier === 'high' ? 1400 : q.tier === 'medium' ? 800 : 450;
    const at = new Float32Array(n * 3), r = rng(31);
    for (let i = 0; i < n; i++) at.set([i % 3 === 0 ? 1 : 0, r(), r()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(at, 3));
    const tails = new THREE.Points(g, additive({ uniforms: this.u, vertexShader: TAIL_VS, fragmentShader: BELT_FS }));
    tails.frustumCulled = false;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d')!, gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(235,250,255,1)'); gr.addColorStop(0.2, 'rgba(160,220,255,0.55)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.group.add(tails, this.coma);
    scene.add(this.group);
    // Its (display-compressed) orbit, a faint ellipse
    const P = 365.25 * Math.pow(ENCKE.a, 1.5) * 864e5, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      const p = enckeAU(now + (i / 256) * P), rr = Math.hypot(...p);
      pts.push(new THREE.Vector3(p[0], p[2], -p[1]).multiplyScalar(displayOrbit(rr) / rr));
    }
    this.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.14, depthWrite: false }));
    scene.add(this.orbit);
  }

  update(ms: number, t: number, scale: number, pr: number): void {
    const p = enckeAU(ms), r = Math.hypot(...p);
    this.pos.set(p[0], p[2], -p[1]).multiplyScalar(displayOrbit(r) / r);
    this.group.position.copy(this.pos);
    const p2 = enckeAU(ms + 864e5), back = new THREE.Vector3(p2[0], p2[2], -p2[1]).multiplyScalar(displayOrbit(Math.hypot(...p2)) / Math.hypot(...p2)).sub(this.pos).normalize().negate();
    const k = Math.max(0, Math.min(1, (3.2 - r) / 2.6));
    this.u.uAnti.value.copy(this.pos).normalize();
    this.u.uBack.value.copy(back);
    this.u.uLen.value = 1 + 6 * k * k;
    this.u.uK.value = 0.15 + 0.85 * k;
    this.u.uT.value = t;
    this.u.uScale.value = scale;
    this.u.uPr.value = pr;
    this.coma.scale.setScalar(0.35 + 1.1 * k);
    (this.coma.material as THREE.SpriteMaterial).opacity = 0.55 + 0.45 * k;
  }
}

// ---------------------------------------------------------------------------------------------------------------
interface FxBody { id: BodyId; R: number; tilt: THREE.Object3D; spin: THREE.Object3D; node: THREE.Object3D; mat: THREE.Material; geo: THREE.BufferGeometry }

/** All of the above, driven once per frame by the Solar System view. */
export class SolarFX {
  private belts: SmallBodies;
  private sun: SunFX | null = null;
  private sunNode: THREE.Object3D | null = null;
  readonly comet: Comet;
  private uFlow = new Map<BodyId, { value: number }>();
  private wu = { uT: { value: 0 } };
  private shells: { u: { uT: { value: number }; uSun: { value: THREE.Vector3 } }; node: THREE.Object3D }[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, bodies: FxBody[], q: Quality, now: number) {
    this.belts = new SmallBodies(scene, q);
    this.comet = new Comet(scene, q, now);
    for (const b of bodies) {
      if (b.id === 'sun') { this.sun = new SunFX(b.node, b.spin, b.R, q, b.mat); this.sunNode = b.node; continue; }
      if (FLOW_BODIES.has(b.id)) {
        const u = { value: 0 };
        this.uFlow.set(b.id, u);
        patchFlow(b.id, b.mat as THREE.MeshStandardMaterial, u);
      }
      if (b.id === 'earth') this.shell(b, 1.012, CLOUDS_FS);
      if (b.id === 'mars') this.shell(b, 1.006, DUST_FS);
      const au = b.id === 'earth' ? ['#4ade80', '#c084fc', 67, 0.07, 0.9] : b.id === 'jupiter' ? ['#a78bfa', '#60a5fa', 74, 0.05, 1.1]
        : b.id === 'saturn' ? ['#f472b6', '#a78bfa', 75, 0.05, 0.9] : null;
      if (au) b.tilt.add(aurora(b.R, au[2] as number, au[3] as number, au[0] as string, au[1] as string, au[4] as number, this.wu));
    }
  }

  private shell(b: FxBody, k: number, fs: string): void {
    const u = { uT: this.wu.uT, uSun: { value: new THREE.Vector3(1, 0, 0) } };
    const m = new THREE.Mesh(b.geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SHELL_VS, fragmentShader: fs, transparent: true, depthWrite: false }));
    m.scale.setScalar(b.R * k);
    b.spin.add(m);
    this.shells.push({ u, node: b.node });
  }

  /**
   * `dt` real seconds (0 while paused), `days` since J2000, `jup` Jupiter's heliocentric angle in the XZ plane,
   * `scale` = pixels per unit at distance 1 (for point sizes).
   */
  update(f: { dt: number; ms: number; days: number; jup: number; camera: THREE.Camera; scale: number; pr: number }): void {
    this.t += f.dt;
    this.belts.update(f.days, f.jup, f.scale, f.pr);
    this.wu.uT.value = this.t;
    for (const [id, u] of this.uFlow) u.value = this.t / (id === 'venus' ? 1 : 9);
    for (const s of this.shells) s.u.uSun.value.copy(s.node.position).negate().normalize();
    if (this.sun && this.sunNode) this.sun.update(this.t, f.dt, f.camera, this.sunNode);
    this.comet.update(f.ms, this.t, f.scale, f.pr);
  }
}
