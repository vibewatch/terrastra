/**
 * The diffuse glow of the Milky Way as seen from the Sun, drawn procedurally from galactic coordinates so it lines up
 * exactly with the catalogue stars and with the galaxy model above it: the bright bulge toward Sagittarius (l = 0),
 * a disc that thins and fades toward the anticentre, the big star clouds, the dark Great Rift from Cygnus down to
 * Ophiuchus, the Coalsack, and the two Magellanic Clouds. Shared by every sky (space backdrop and the ground view).
 */
import * as THREE from 'three';
import { eqToGal } from '../../shared/lib/sky.ts';
import type { SkyFrame } from './starfield.ts';

/** GLSL: `vec3 milkyWay(vec3 g)` for a galactic unit vector (x → centre, y → l = 90°, z → north pole); peak ≈ 1. */
export const MILKY_WAY_GLSL = /* glsl */ `
float mwHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float mwNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mwHash(i), mwHash(i + vec3(1, 0, 0)), f.x), mix(mwHash(i + vec3(0, 1, 0)), mwHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mwHash(i + vec3(0, 0, 1)), mwHash(i + vec3(1, 0, 1)), f.x), mix(mwHash(i + vec3(0, 1, 1)), mwHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float mwFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * mwNoise(p); p = p * 2.13 + vec3(3.1, 7.7, 1.3); a *= 0.5; } return s / 0.9375; }
vec3 mwDir(float l, float b) { return vec3(cos(b) * cos(l), cos(b) * sin(l), sin(b)); }
// a soft round patch of sky of angular radius s around direction c
float mwBlob(vec3 g, vec3 c, float s) { float d = acos(clamp(dot(g, c), -1.0, 1.0)); return exp(-d * d / (s * s)); }
vec3 milkyWay(vec3 g) {
  const float D = 0.0174533;
  float b = asin(clamp(g.z, -1.0, 1.0));
  float l = atan(g.y, g.x);
  float core = exp(-pow(l / (34.0 * D), 2.0));
  // the disc: about 4° thick toward the anticentre, twice that toward the centre
  float sig = (4.5 + 5.0 * core) * D;
  float disc = exp(-pow(b / sig, 2.0)) * (0.28 + 0.72 * core) + 0.25 * exp(-pow(b / (sig * 2.6), 2.0)) * (0.2 + 0.8 * core);
  float bulge = exp(-(pow(l / (15.0 * D), 2.0) + pow(b / (10.0 * D), 2.0)));
  // the big star clouds: Sagittarius, Scutum, Cygnus, Carina, Norma
  float clouds = 0.55 * mwBlob(g, mwDir(1.5 * D, -3.5 * D), 4.0 * D) + 0.4 * mwBlob(g, mwDir(27.0 * D, -2.0 * D), 3.0 * D)
    + 0.35 * mwBlob(g, mwDir(77.0 * D, 1.5 * D), 6.0 * D) + 0.32 * mwBlob(g, mwDir(-73.0 * D, -1.0 * D), 5.0 * D)
    + 0.25 * mwBlob(g, mwDir(-32.0 * D, -1.0 * D), 4.0 * D);
  float m = mwFbm(g * 9.0), f = mwFbm(g * 34.0 + 2.0);
  float lum = (disc + clouds * exp(-pow(b / (6.0 * D), 2.0))) * (0.35 + 0.9 * m) * (0.55 + 0.9 * f * f + 0.1 * f) + 1.1 * bulge * (0.75 + 0.4 * m);
  // dust: the Great Rift splits the band from Cygnus (l ≈ 80°) to Sagittarius, and spills north into Ophiuchus
  float rl = smoothstep(-0.38, -0.1, l) * (1.0 - smoothstep(1.25, 1.5, l));
  float b0 = (1.2 + 1.6 * sin(l * 2.3)) * D;
  float rift = exp(-pow((b - b0) / ((1.4 + 1.6 * mwNoise(g * 14.0)) * D), 2.0)) * rl;
  float oph = exp(-(pow((l + 6.0 * D) / (8.0 * D), 2.0) + pow((b - 11.0 * D) / (5.0 * D), 2.0)));
  float lanes = exp(-pow(b / (2.4 * D), 2.0)) * smoothstep(0.5, 0.78, mwFbm(g * 13.0 + 5.0));
  float coal = mwBlob(g, mwDir(-58.8 * D, -1.0 * D), 2.6 * D);
  // lighter right on the bulge, so the centre reads as a glow cut by a lane rather than a hole
  float dust = clamp((0.85 * rift * (1.0 - 0.45 * bulge) + 0.55 * oph) * (0.55 + 0.7 * mwFbm(g * 21.0)) + 0.6 * lanes + 0.8 * coal, 0.0, 0.9);
  lum *= 1.0 - dust;
  // old yellow stars toward the centre, younger bluish-white light out along the disc; dust reddens what it lets through
  vec3 col = mix(vec3(0.74, 0.8, 1.0), vec3(1.0, 0.83, 0.62), clamp(core * 0.7 + bulge, 0.0, 1.0));
  col = mix(col, col * vec3(1.0, 0.78, 0.6), dust * 0.6);
  vec3 sky = col * lum;
  // the Large and Small Magellanic Clouds, far south of the band
  vec3 lmc = mwDir(-79.5 * D, -32.9 * D), smc = mwDir(-57.2 * D, -44.3 * D);
  float mc = 0.75 * mwBlob(g, lmc, 3.4 * D) + 0.35 * mwBlob(g, lmc, 7.0 * D) + 0.45 * mwBlob(g, smc, 2.0 * D);
  sky += vec3(0.85, 0.88, 1.0) * mc * (0.7 + 0.5 * f);
  return sky;
}`;

const VS = /* glsl */ `
attribute vec3 aGal;
varying vec3 vG;
void main() {
  vG = aGal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = /* glsl */ `
uniform float uI;
varying vec3 vG;
${MILKY_WAY_GLSL}
void main() {
  vec3 c = milkyWay(normalize(vG)) * uI;
  // dither: the glow is a faint gradient that would otherwise band in 8 bits
  c += (mwHash(vec3(gl_FragCoord.xy, 7.0)) - 0.5) / 255.0;
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

/** Peak brightness of the glow on the dark space backdrop (display units, like the star sprites). */
export const MILKY_WAY_SPACE = 0.3;

/**
 * A sky sphere carrying the Milky Way glow, in the same frame as the star field (`frame` maps equatorial → scene).
 * Each vertex carries its galactic direction, so the glow is computed per pixel with no texture.
 */
export function buildMilkyWay(frame: SkyFrame, radius: number, intensity = MILKY_WAY_SPACE): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const g = new THREE.SphereGeometry(1, 96, 48);
  const p = g.getAttribute('position');
  const gal = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const e: [number, number, number] = [p.getX(i), p.getY(i), p.getZ(i)];
    const q = eqToGal(e);
    gal.set(q, i * 3);
    frame(e[0], e[1], e[2], v).setLength(radius);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.setAttribute('aGal', new THREE.BufferAttribute(gal, 3));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const mat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: intensity } }, vertexShader: VS, fragmentShader: FS,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'milky-way';
  mesh.frustumCulled = false;
  return mesh;
}
