/**
 * The three bodies every sky act is made of, as shader materials:
 * - the Sun's disc seen from the ground (limb darkening, the Moon's mountainous limb, Baily's beads, chromosphere,
 *   prominences and a streamer corona that only shows when the photosphere is gone);
 * - the Moon (painted map, the eclipse shadow computed per pixel with Earth as the occluder, copper umbral light);
 * - Earth (the globe's own painted map, the Moon's shadow computed per pixel, twilight and an atmosphere limb that
 *   turns red when the Sun is behind it).
 */
import * as THREE from 'three';
import { OCCLUSION_GLSL, R_MOON, R_SUN, R_SHADOW, R_EARTH } from './common.ts';

const NOISE_GLSL = /* glsl */ `
float h1(float n) { return fract(sin(n) * 43758.5453123); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }`;

/** Half-size of the Sun billboard, in solar radii (room for the outer corona). */
export const SUN_SPAN = 7;

export function sunDiscMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMoon: { value: new THREE.Vector2(9, 9) }, uK: { value: 1 }, uPx: { value: 50 }, uCorona: { value: 0 }, uChromo: { value: 0 },
      uGlare: { value: 1 }, uTime: { value: 0 }, uPlanet: { value: new THREE.Vector3(9, 9, 0) }, uFilter: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
uniform vec2 uMoon; uniform float uK, uPx, uCorona, uChromo, uGlare, uTime, uFilter; uniform vec3 uPlanet;
varying vec2 vUv;
${NOISE_GLSL}
float lobe(float th, float c, float w) { float d = atan(sin(th - c), cos(th - c)); return exp(-d * d / (w * w)); }
void main() {
  vec2 q = (vUv * 2.0 - 1.0) * ${SUN_SPAN.toFixed(1)};
  float r = length(q), th = atan(q.y, q.x);
  float aa = 1.2 / uPx;
  // the Moon's limb: valleys and peaks a few km high are what let Baily's beads through
  vec2 mq = q - uMoon;
  float ma = atan(mq.y, mq.x);
  float limb = uK * (1.0 + 0.0022 * (n1(ma * 37.0) * 0.65 + n1(ma * 113.0) * 0.35 - 0.5));
  float moon = smoothstep(limb + aa, limb - aa, length(mq));
  float planet = smoothstep(uPlanet.z + aa, uPlanet.z - aa, length(q - uPlanet.xy));
  float clear = (1.0 - moon) * (1.0 - planet);
  // photosphere, limb-darkened, with faint granulation
  float disc = smoothstep(1.0 + aa, 1.0 - aa, r);
  float mu = sqrt(max(0.0, 1.0 - r * r));
  float limbDark = 1.0 - 0.6 * (1.0 - mu) - 0.15 * (1.0 - mu) * (1.0 - mu);
  vec3 photo = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.97, 0.9), limbDark) * limbDark * (0.96 + 0.04 * n2(q * 60.0));
  vec3 col = photo * disc * clear * mix(2.4, 1.0, uFilter);
  if (uFilter > 0.5) col *= vec3(1.0, 0.55, 0.18);
  // chromosphere and prominences: a pink rim that peeks out only around totality
  float above = r - 1.0;
  float chromo = smoothstep(-0.002, 0.003, above) * smoothstep(0.02, 0.004, above);
  float prom = 0.0;
  prom += lobe(th, 0.7, 0.05) * smoothstep(0.07, 0.0, above) * (0.6 + 0.4 * n1(r * 80.0));
  prom += lobe(th, 2.6, 0.035) * smoothstep(0.05, 0.0, above);
  prom += lobe(th, 4.1, 0.06) * smoothstep(0.09, 0.0, above) * (0.5 + 0.5 * n1(r * 60.0 + 3.0));
  prom += lobe(th, 5.5, 0.03) * smoothstep(0.04, 0.0, above);
  vec3 pink = vec3(1.0, 0.22, 0.38) * (chromo * 1.3 + prom * step(0.0, above) * 1.1);
  // corona: a smooth K-corona, helmet streamers near the solar equator and fine polar plumes
  float cor = 0.0;
  if (r > 1.0) {
    float k = 0.5 * pow(r, -3.2);
    float lr = log(r);
    float st = lobe(th, 0.25, 0.32 - 0.08 * lr) + lobe(th, 3.3, 0.36 - 0.08 * lr) + 0.7 * lobe(th, 2.35, 0.22) + 0.6 * lobe(th, 5.1, 0.2) + 0.45 * lobe(th, 1.1, 0.16);
    st *= 0.35 * pow(r, -2.1);
    float eq = abs(cos(th - 0.2));
    float plumes = pow(n1(th * 55.0), 3.0) * (1.0 - eq) * 0.25 * pow(r, -3.5);
    float tex = 0.75 + 0.5 * fbm(vec2(th * 9.0, lr * 2.0 - uTime * 0.01));
    cor = (k + st + plumes) * tex * smoothstep(${SUN_SPAN.toFixed(1)}, ${(SUN_SPAN * 0.55).toFixed(1)}, r);
  }
  col += (pink * uChromo + vec3(0.93, 0.95, 1.0) * cor * uCorona * 1.6) * (1.0 - moon);
  // glare around the visible Sun (scales with how much of it is left)
  if (uFilter < 0.5) col += vec3(1.0, 0.93, 0.82) * uGlare * (0.5 * exp(-max(r - 1.0, 0.0) * 2.2) + 0.25 * exp(-max(r - 1.0, 0.0) * 0.5)) * (1.0 - disc * clear);
  gl_FragColor = vec4(col, 1.0);
}`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

interface MoonUniforms {
  uMap: { value: THREE.Texture | null }; uReady: { value: number };
  uBasis: { value: THREE.Matrix3 }; uSunRel: { value: THREE.Vector3 }; uEarthRel: { value: THREE.Vector3 };
  uEarthshine: { value: number }; uGain: { value: number }; uOcc: { value: number };
}

/**
 * The Moon. `uBasis` columns are the Moon's own axes in the world frame (x → the sub-Earth point, z → north);
 * `uSunRel` / `uEarthRel` are the Sun and Earth relative to the Moon's centre, in km, in the world frame.
 */
export function moonMaterial(): THREE.ShaderMaterial & { uniforms: MoonUniforms } {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null }, uReady: { value: 0 }, uBasis: { value: new THREE.Matrix3() },
      uSunRel: { value: new THREE.Vector3(1, 0, 0) }, uEarthRel: { value: new THREE.Vector3(-1, 0, 0) }, uEarthshine: { value: 1 }, uGain: { value: 1 }, uOcc: { value: 1 },
    },
    // premultiplied: the lit surface adds to the sky; uOcc says how much of what is behind it the disc hides
    // (none of a daytime sky, which is in front of the Moon; all of the stars at night)
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true,
    vertexShader: /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D uMap; uniform float uReady, uEarthshine, uGain, uOcc; uniform mat3 uBasis; uniform vec3 uSunRel, uEarthRel;
varying vec3 vN; varying vec3 vV;
${OCCLUSION_GLSL}
void main() {
  vec3 n = normalize(vN);
  vec3 l = vec3(dot(n, uBasis[0]), dot(n, uBasis[1]), dot(n, uBasis[2]));
  float lon = atan(l.y, l.x), lat = asin(clamp(l.z, -1.0, 1.0));
  vec3 alb = uReady > 0.5 ? texture2D(uMap, vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5)).rgb : vec3(0.42);
  alb = pow(alb, vec3(2.2));
  vec3 sd = normalize(uSunRel);
  float mu0 = max(dot(n, sd), 0.0), mu = max(dot(n, normalize(vV)), 0.0);
  // Lommel–Seeliger: why the Full Moon looks like a flat disc rather than a ball
  float ls = 2.0 * mu0 / (mu0 + mu + 1e-3);
  vec2 ss = sunSeen(n * ${R_MOON.toFixed(1)}, uSunRel, ${R_SUN.toFixed(1)}, uEarthRel, ${R_SHADOW.toFixed(1)});
  vec3 lit = alb * ls * ss.x * 2.2;
  if (ss.y >= 0.0) {
    // light bent through every sunrise and sunset on Earth: copper deep inside, a turquoise ozone band at the edge
    float u = ss.y;
    lit += alb * smoothstep(0.0, 0.3, mu0 + 0.3) * (vec3(1.0, 0.3, 0.1) * 0.5 * (1.0 - 0.7 * u) + vec3(0.2, 0.42, 0.62) * 0.35 * smoothstep(0.1, 0.0, u));
  }
  lit += alb * uEarthshine * 0.015 * max(dot(n, normalize(uEarthRel)), 0.0);
  lit *= uGain;
  gl_FragColor = vec4(pow(lit, vec3(1.0 / 2.2)), uOcc);
}`,
  }) as THREE.ShaderMaterial & { uniforms: MoonUniforms };
}

/** Moon axes in a world frame: x toward Earth, z toward (celestial) north. */
export function moonBasis(toEarth: THREE.Vector3, north: THREE.Vector3, out = new THREE.Matrix3()): THREE.Matrix3 {
  const x = toEarth.clone().normalize();
  const z = north.clone().addScaledVector(x, -north.dot(x)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return out.set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
}

interface EarthUniforms {
  uDay: { value: THREE.Texture | null }; uSunRel: { value: THREE.Vector3 }; uMoonRel: { value: THREE.Vector3 }; uShadow: { value: number };
}

/**
 * Earth in the Earth-fixed frame (the mesh is rotated by sidereal time to sit in space). `uSunRel` / `uMoonRel` are
 * the Sun and Moon positions in km, Earth-fixed.
 */
export function earthMaterial(): THREE.ShaderMaterial & { uniforms: EarthUniforms } {
  return new THREE.ShaderMaterial({
    uniforms: { uDay: { value: null }, uSunRel: { value: new THREE.Vector3(1, 0, 0) }, uMoonRel: { value: new THREE.Vector3(0, 1, 0) }, uShadow: { value: 1 } },
    vertexShader: /* glsl */ `
uniform vec3 uSunRel;
varying vec3 vP; varying vec3 vWN; varying vec3 vV; varying vec3 vSW;
void main() {
  vP = position;
  vSW = normalize(mat3(modelMatrix) * normalize(uSunRel));
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D uDay; uniform vec3 uSunRel, uMoonRel; uniform float uShadow;
varying vec3 vP; varying vec3 vWN; varying vec3 vV; varying vec3 vSW;
${OCCLUSION_GLSL}
void main() {
  vec3 n = normalize(vP);
  float lon = atan(n.y, n.x), lat = asin(clamp(n.z, -1.0, 1.0));
  vec3 alb = pow(texture2D(uDay, vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5)).rgb, vec3(2.2));
  vec3 sd = normalize(uSunRel);
  float cs = dot(n, sd);
  float day = smoothstep(-0.08, 0.12, cs);
  float vis = 1.0;
  if (uShadow > 0.5) {
    vec2 ss = sunSeen(n * ${R_EARTH.toFixed(1)}, uSunRel, ${R_SUN.toFixed(1)}, uMoonRel, ${R_MOON.toFixed(1)});
    // the eye judges light logarithmically: steepen the penumbra so the shadow reads from space as it does in DSCOVR images
    vis = pow(ss.x, 1.8) * (ss.y >= 0.0 ? 0.05 : 1.0);
  }
  vec3 col = alb * (max(cs, 0.0) * 1.15 + 0.06) * day * vis;
  // twilight band
  col += alb * vec3(1.0, 0.45, 0.2) * 0.25 * exp(-pow(cs / 0.07, 2.0)) * vis;
  col += alb * vec3(0.02, 0.03, 0.06) * (1.0 - day);
  // atmosphere limb: blue on the day side, red ring when the Sun is behind Earth
  vec3 v = normalize(vV), wn = normalize(vWN);
  float rim = pow(1.0 - max(dot(wn, v), 0.0), 4.0);
  float back = smoothstep(0.96, 1.0, dot(-v, normalize(vSW)));
  col += vec3(0.25, 0.5, 1.0) * rim * 0.9 * smoothstep(-0.2, 0.4, cs) * vis;
  col += vec3(1.0, 0.35, 0.12) * pow(rim, 2.0) * back * 1.5;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`,
  }) as THREE.ShaderMaterial & { uniforms: EarthUniforms };
}
