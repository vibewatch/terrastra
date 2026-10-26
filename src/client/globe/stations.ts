/**
 * Radio stations on the globe: one Points draw call for every station dot, plus a highlight pair
 * (the playing station and the one under the pointer). Picking is done in screen space on the CPU.
 */
import * as THREE from 'three';
import { latLonToVec } from '../../shared/lib/geo.ts';
import { RENDER_ORDER } from './layers.ts';

const R = 1.0035;

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aFav;
  uniform float uTime;
  uniform float uPx;
  uniform float uSize;
  varying float vFace;
  varying float vFav;
  varying float vTw;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 toCam = normalize(cameraPosition - wp.xyz);
    vFace = dot(normalize(wp.xyz), toCam);
    vFav = aFav;
    vTw = 0.75 + 0.25 * sin(uTime * 2.1 + aSeed * 40.0);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (1.0 + aFav * 0.5) * uPx / -mv.z, 2.5, 9.0);
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFavColor;
  uniform float uAlpha;
  varying float vFace;
  varying float vFav;
  varying float vTw;
  void main() {
    if (vFace < 0.02) discard;
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float core = smoothstep(0.62, 0.38, r);
    float halo = smoothstep(1.0, 0.5, r) * 0.3;
    vec3 c = mix(uColor, uFavColor, vFav);
    float a = (core + halo) * smoothstep(0.02, 0.25, vFace) * uAlpha * vTw;
    gl_FragColor = vec4(c * (0.7 + core * 0.6), a);
  }`;

const HI_VERT = /* glsl */ `
  attribute float aKind;
  uniform float uPx;
  varying float vKind;
  varying float vFace;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vFace = dot(normalize(wp.xyz), normalize(cameraPosition - wp.xyz));
    vKind = aKind;
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((aKind > 0.5 ? 0.05 : 0.036) * uPx / -mv.z, 18.0, 46.0);
  }`;

const HI_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  varying float vKind;
  varying float vFace;
  void main() {
    if (vFace < 0.02) discard;
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    vec3 c;
    float a;
    if (vKind > 0.5) {
      // playing: bright core, a ring that breathes with the music, and a ripple running outwards
      float beat = 0.62 + uLevel * 0.3;
      float ring = smoothstep(0.09, 0.0, abs(r - beat));
      float rip = fract(uTime * 0.6);
      float ripple = smoothstep(0.07, 0.0, abs(r - rip)) * (1.0 - rip);
      float core = smoothstep(0.3, 0.05, r);
      c = mix(vec3(0.35, 1.0, 0.82), vec3(1.0), core);
      a = core + ring * 0.9 + ripple * 0.7;
    } else {
      float ring = smoothstep(0.1, 0.0, abs(r - 0.7));
      c = vec3(0.9, 1.0, 0.97);
      a = ring * 0.85 + smoothstep(0.32, 0.1, r) * 0.6;
    }
    gl_FragColor = vec4(c, a * smoothstep(0.02, 0.2, vFace));
  }`;

export class StationDots {
  readonly group = new THREE.Group();
  private pts: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private fav: THREE.BufferAttribute;
  private hi: THREE.Points;
  private hiMat: THREE.ShaderMaterial;
  private hiPos: THREE.BufferAttribute;
  /** Unit-sphere positions (x, y, z per station) for picking. */
  readonly pos: Float32Array;
  private m = new THREE.Matrix4();
  playing = -1;
  hover = -1;

  constructor(lat: Float32Array, lon: Float32Array) {
    const n = lat.length;
    this.pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.pos.set(latLonToVec(lat[i], lon[i]), i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.map(x => x * R), 3));
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) seed[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.fav = new THREE.BufferAttribute(new Float32Array(n), 1);
    g.setAttribute('aFav', this.fav);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uPx: { value: 800 }, uSize: { value: 0.0075 }, uAlpha: { value: 1 },
        uColor: { value: new THREE.Color('#34d399') }, uFavColor: { value: new THREE.Color('#fbbf24') },
      },
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = RENDER_ORDER.overlay + 1;

    const hg = new THREE.BufferGeometry();
    this.hiPos = new THREE.BufferAttribute(new Float32Array(6), 3);
    hg.setAttribute('position', this.hiPos);
    hg.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array([1, 0]), 1));
    hg.setDrawRange(0, 0);
    this.hiMat = new THREE.ShaderMaterial({
      vertexShader: HI_VERT, fragmentShader: HI_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 800 }, uLevel: { value: 0 } },
    });
    this.hi = new THREE.Points(hg, this.hiMat);
    this.hi.frustumCulled = false;
    this.hi.renderOrder = RENDER_ORDER.overlay + 2;
    this.group.add(this.pts, this.hi);
  }

  setFavourites(on: (i: number) => boolean): void {
    const a = this.fav.array as Float32Array;
    for (let i = 0; i < a.length; i++) a[i] = on(i) ? 1 : 0;
    this.fav.needsUpdate = true;
  }

  /** Per frame: pixel scale for point sizes, twinkle clock, and the music level for the playing ring. */
  update(timeMs: number, camera: THREE.PerspectiveCamera, heightPx: number, level: number): void {
    const px = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const u = this.mat.uniforms, hu = this.hiMat.uniforms;
    u.uTime.value = hu.uTime.value = timeMs / 1000;
    u.uPx.value = hu.uPx.value = px;
    // dots shrink a little as you zoom out so the continents don't turn into a green carpet
    const alt = camera.position.length() - 1;
    u.uSize.value = 0.0075 * Math.min(1.6, Math.max(0.55, alt / 1.4));
    hu.uLevel.value = level;
    const a = this.hiPos.array as Float32Array;
    // slot 0 is drawn as "playing", slot 1 as "hover" (aKind); an empty slot 0 is parked at the origin, inside the Earth
    if (this.playing >= 0) a.set(this.pos.subarray(this.playing * 3, this.playing * 3 + 3).map(x => x * R), 0);
    else a.set([0, 0, 0], 0);
    let k = 1;
    if (this.hover >= 0 && this.hover !== this.playing) { a.set(this.pos.subarray(this.hover * 3, this.hover * 3 + 3).map(x => x * R), 3); k = 2; }
    this.hiPos.needsUpdate = true;
    this.hi.geometry.setDrawRange(0, k);
  }

  /** Nearest front-facing station within `maxPx` of a screen point, or -1. */
  pick(x: number, y: number, camera: THREE.PerspectiveCamera, w: number, h: number, maxPx = 14): number {
    const m = this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const c = camera.position, p = this.pos;
    let best = -1, bd = maxPx * maxPx;
    for (let i = 0; i < p.length; i += 3) {
      const px = p[i], py = p[i + 1], pz = p[i + 2];
      // facing the camera: n · (cam - p) > 0, with |n| = 1
      if (px * (c.x - px) + py * (c.y - py) + pz * (c.z - pz) < 0.02) continue;
      const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      if (cw <= 0) continue;
      const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / cw + 1) * 0.5 * w;
      const sy = (1 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / cw) * 0.5 * h;
      const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
      if (d < bd) { bd = d; best = i / 3; }
    }
    return best;
  }
}
