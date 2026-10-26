import * as THREE from 'three';
import { CONSTELLATIONS } from '../../shared/data/constellations.ts';
import { galToEq } from '../../shared/lib/sky.ts';
import { buildMilkyWay } from './milkyway.ts';

/** Deep-space clear colour shared by the Earth and Solar System views. */
export const SPACE_BG = 0x020306;

/** Maps an equatorial unit vector (x → RA 0h, z → celestial north) into the scene frame. */
export type SkyFrame = (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3;

const VS = /* glsl */ `
attribute float aMag;
attribute vec3 aCol;
uniform float uPr;
varying vec3 vC;
varying float vA;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vA = clamp(1.3 - 0.17 * aMag, 0.16, 1.0);
  vC = aCol;
  gl_PointSize = clamp(4.8 - 0.55 * aMag, 1.6, 7.5) * uPr;
}`;
const FS = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float a = exp(-r * 4.5) + 0.22 * exp(-r * 1.3);
  gl_FragColor = vec4(vC * a * vA, 1.0);
}`;

/** Seeded PRNG so every view shows the same sky. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Rough stellar colours by spectral class: K/M orange, G/F cream, A white, B/O blue. */
export function tint(t: number): [number, number, number] {
  return t < 0.15 ? [1.0, 0.78, 0.6] : t < 0.35 ? [1.0, 0.92, 0.8] : t < 0.8 ? [0.95, 0.97, 1.0] : [0.75, 0.85, 1.0];
}

/** The fixed colour of a catalogue star, so every view tints it the same. */
export const starTint = (ra: number, dec: number) => tint((ra * 7.31 + dec * 3.17) % 1);

/**
 * The night sky at infinity: the real bright stars of the constellation figures plus `n` seeded fainter stars,
 * thicker along the Milky Way, over the Milky Way's diffuse glow. It follows the camera like a skybox and draws first,
 * behind everything.
 */
export function buildStarField(n: number, frame: SkyFrame, radius: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const pos: number[] = [], mag: number[] = [], col: number[] = [];
  const v = new THREE.Vector3();
  const add = (x: number, y: number, z: number, m: number, c: [number, number, number]) => {
    frame(x, y, z, v).setLength(radius);
    pos.push(v.x, v.y, v.z); mag.push(m); col.push(...c);
  };
  const D2R = Math.PI / 180;
  for (const c of CONSTELLATIONS) {
    for (const [ra, dec, m] of c.stars) {
      const cd = Math.cos(dec * D2R);
      add(cd * Math.cos(ra * D2R), cd * Math.sin(ra * D2R), Math.sin(dec * D2R), m, starTint(ra, dec));
    }
  }
  const r = rng(42);
  for (let i = 0; i < n; i++) {
    const m = 6.6 - Math.pow(r(), 0.42) * 3.6;
    if (r() < 0.45) {
      const l = r() * Math.PI * 2, b = (r() + r() + r() - 1.5) * 14 * D2R;
      const e = galToEq([Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]);
      add(e[0], e[1], e[2], m, tint(r()));
    } else {
      const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      add(s * Math.cos(a), s * Math.sin(a), z, m, tint(r()));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aMag', new THREE.Float32BufferAttribute(mag, 1));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  // Additive but in the opaque pass, so it draws first (renderOrder) and never over the bodies.
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPr: { value: 1 } }, vertexShader: VS, fragmentShader: FS,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  // below every scene layer (the globe itself is -10): a tie lets three.js draw the nearer Earth first and the stars over it
  pts.renderOrder = -1000;
  pts.frustumCulled = false;
  const follow = (camera: THREE.Camera) => {
    pts.position.setFromMatrixPosition(camera.matrixWorld);
    pts.updateMatrixWorld();
  };
  pts.onBeforeRender = (renderer, _s, camera) => {
    mat.uniforms.uPr.value = renderer.getPixelRatio();
    follow(camera);
  };
  // the glow rides along as a child (sharing any sky rotation) and draws just before the stars
  const glow = buildMilkyWay(frame, radius * 0.98);
  glow.renderOrder = -1001;
  glow.onBeforeRender = (_r, _s, camera) => follow(camera);
  pts.add(glow);
  return pts;
}

/** Greenwich mean sidereal time in radians (IAU 1982, good to about a second this century). */
export function gmstRad(ms: number): number {
  const d = ms / 864e5 + 2440587.5 - 2451545;
  return ((280.46061837 + 360.98564736629 * d) % 360) * Math.PI / 180;
}
