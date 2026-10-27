import * as THREE from 'three';
import type { Quality } from './quality.ts';
import type { CatalogueItem } from '../../shared/data/types.ts';
import { TYPE_META } from '../../shared/data/typemeta.ts';
import { latLonToVec } from '../../shared/lib/geo.ts';
import { isHappening } from '../../shared/lib/season.ts';

/**
 * Overlay layers live in the opaque pass (transparent: false + explicit blending) with a negative renderOrder,
 * so they draw after the Earth but before every model: models can never be hidden behind a cloud or a glow line.
 */
export const RENDER_ORDER = { earth: -10, clouds: -8, aurora: -7, overlay: -6 } as const;

const D2R = Math.PI / 180;
const noRaycast = () => {};
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const NOISE_GLSL = `
  uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
  }
  vec3 rand3(uvec3 v) { return vec3(pcg3d(v)) * (1.0 / 4294967295.0); }
  vec3 hash33(vec3 p) { return rand3(uvec3(ivec3(p) + 65536)) * 2.0 - 1.0; }
  // gradient noise, roughly -0.7..0.7
  float gnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
                   mix(dot(hash33(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash33(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
               mix(mix(dot(hash33(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash33(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
                   mix(dot(hash33(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash33(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y), u.z);
  }
  // fractal sum mapped to ~0..1 (mean 0.5)
  float fbm(vec3 p, int oct) {
    float a = 0.5, s = 0.0, n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= oct) break;
      s += a * gnoise(p); n += a;
      p = p * 2.07 + vec3(1.7, 9.2, 3.1);
      a *= 0.52;
    }
    return 0.5 + 0.75 * s / n;
  }
`;

// ---------- glowing ribbons (routes + plate boundaries) ----------

/** Great-circle densified unit vectors along a [lat, lon] polyline, ~stepDeg apart. Handles the antimeridian. */
export function densify(pts: [number, number][], closed: boolean, stepDeg = 0.5): THREE.Vector3[] {
  const v = pts.map(p => new THREE.Vector3(...latLonToVec(p[0], p[1])));
  if (closed && v.length > 2 && v[0].distanceToSquared(v[v.length - 1]) > 1e-10) v.push(v[0].clone());
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < v.length - 1; i++) {
    const a = v[i], b = v[i + 1];
    const om = a.angleTo(b);
    if (om < 1e-6) continue;
    const n = Math.max(1, Math.ceil(om / (stepDeg * D2R)));
    const s = Math.sin(om);
    for (let k = i === 0 || !out.length ? 0 : 1; k <= n; k++) {
      const t = k / n;
      if (s < 1e-6) { out.push(a.clone().lerp(b, t).normalize()); continue; }
      out.push(a.clone().multiplyScalar(Math.sin((1 - t) * om) / s).add(b.clone().multiplyScalar(Math.sin(t * om) / s)));
    }
  }
  return out;
}

interface RibbonPath { pts: THREE.Vector3[]; color: THREE.Color; closed: boolean }

/** Flat glow strips lying on the sphere; width is applied in the vertex shader so it can follow the zoom. */
function ribbonGeometry(paths: RibbonPath[], r: number): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  for (const p of paths) { nv += p.pts.length * 2; ni += Math.max(0, p.pts.length - 1) * 6; }
  const pos = new Float32Array(nv * 3), side = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const edge = new Float32Array(nv), along = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  const tan = new THREE.Vector3(), sv = new THREE.Vector3();
  let vi = 0, ii = 0;
  for (const p of paths) {
    const P = p.pts, n = P.length;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const prev = P[i > 0 ? i - 1 : p.closed ? n - 2 : 0], next = P[i < n - 1 ? i + 1 : p.closed ? 1 : n - 1];
      tan.subVectors(next, prev);
      if (tan.lengthSq() < 1e-14) tan.set(0, 1, 0);
      sv.crossVectors(P[i], tan).normalize();
      if (i > 0) acc += P[i].angleTo(P[i - 1]) / D2R;
      for (const e of [-1, 1]) {
        pos[vi * 3] = P[i].x * r; pos[vi * 3 + 1] = P[i].y * r; pos[vi * 3 + 2] = P[i].z * r;
        side.set([sv.x, sv.y, sv.z], vi * 3);
        col.set([p.color.r, p.color.g, p.color.b], vi * 3);
        edge[vi] = e; along[vi] = acc;
        vi++;
      }
      if (i < n - 1) {
        const a = vi - 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
        ii += 6;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const RIBBON_VERT = `
  attribute vec3 aSide;
  attribute vec3 aColor;
  attribute float aEdge;
  attribute float aAlong;
  uniform float uWidth;
  uniform float uScale;
  varying float vEdge;
  varying float vAlong;
  varying vec3 vColor;
  void main() {
    vEdge = aEdge; vAlong = aAlong; vColor = aColor;
    vec3 p = position + aSide * aEdge * uWidth * uScale / max(0.5, length(modelMatrix[0].xyz));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const RIBBON_FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uDash;
  uniform float uFlow;
  uniform float uDashMix;
  varying float vEdge;
  varying float vAlong;
  varying vec3 vColor;
  void main() {
    float e2 = vEdge * vEdge;
    float core = exp(-e2 * 14.0);
    float halo = (1.0 - e2) * (1.0 - e2);
    float w = 0.5 + 0.5 * sin((vAlong * uDash - uTime * uFlow) * 6.2831853);
    float dash = mix(1.0, 0.35 + 0.95 * smoothstep(0.25, 0.95, w), uDashMix);
    float a = (core * 0.85 + halo * 0.3) * dash * uOpacity;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.35), a);
  }
`;

function ribbonMaterial(shared: { uTime: { value: number }; uWidth: { value: number } }, opts: { dash: number; flow: number; dashMix: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    uniforms: {
      uTime: shared.uTime, uWidth: shared.uWidth, uScale: { value: 1 }, uOpacity: { value: 0.5 },
      uDash: { value: opts.dash }, uFlow: { value: opts.flow }, uDashMix: { value: opts.dashMix },
    },
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** 0 = hidden, 1 = normal, 2 = highlighted (selected / ridden). */
type RouteState = (it: CatalogueItem) => 0 | 1 | 2;

interface RoutePath { item: CatalogueItem; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; orbit: boolean; always: boolean }

/** Glowing great-circle paths for migrations, voyages and orbits (and any route item while it is selected). */
class RoutePaths {
  readonly root = new THREE.Group();
  private paths: RoutePath[] = [];
  private shared = { uTime: { value: 0 }, uWidth: { value: 0.004 } };

  constructor(items: CatalogueItem[]) {
    this.root.name = 'route-paths';
    for (const it of items) {
      const r = it.route;
      if (!r || r.pts.length < 2) continue;
      const orbit = r.kind === 'orbit';
      const pts = densify(r.pts, r.mode === 'loop');
      if (pts.length < 2) continue;
      const geo = ribbonGeometry([{ pts, color: new THREE.Color(TYPE_META[it.type].color), closed: r.mode === 'loop' }], orbit ? 1 : 1.002);
      const mat = ribbonMaterial(this.shared, { dash: 0.22, flow: 0.25 + Math.min(1.5, r.speed * 0.15), dashMix: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = RENDER_ORDER.overlay;
      mesh.raycast = noRaycast;
      mesh.visible = false;
      this.root.add(mesh);
      this.paths.push({ item: it, mesh, mat, orbit, always: orbit || it.type === 'migration' || it.type === 'voyage' });
    }
  }

  get count(): number { return this.paths.length; }

  update(time: number, camAlt: number, state: RouteState, orbitAlt: (it: CatalogueItem) => number): void {
    this.shared.uTime.value = time;
    this.shared.uWidth.value = Math.min(0.012, Math.max(0.00018, camAlt * 0.0026));
    const fade = 0.3 + 0.7 * smooth(0.08, 0.55, camAlt);
    for (const p of this.paths) {
      const st = state(p.item);
      const show = st === 2 || (st === 1 && p.always);
      p.mesh.visible = show;
      if (!show) continue;
      const u = p.mat.uniforms;
      u.uOpacity.value = st === 2 ? 1.0 : 0.4 * fade;
      u.uScale.value = st === 2 ? 1.7 : 1;
      if (p.orbit) p.mesh.scale.setScalar(orbitAlt(p.item));
    }
  }
}

/** Plate boundaries as one merged glow mesh, colour-coded by boundary type with a slow travelling pulse. */
class Tectonics {
  readonly root: THREE.Mesh;
  private shared = { uTime: { value: 0 }, uWidth: { value: 0.004 } };
  private mat: THREE.ShaderMaterial;

  private built = false;

  constructor() {
    this.mat = ribbonMaterial(this.shared, { dash: 0.05, flow: 0.12, dashMix: 0.55 });
    // the boundary data loads the first time the layer is switched on
    this.root = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.root.name = 'tectonics';
    this.root.renderOrder = RENDER_ORDER.overlay;
    this.root.raycast = noRaycast;
    this.root.visible = false;
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
    if (!on || this.built) return;
    this.built = true;
    void import('../../shared/data/plates.ts').then(({ PLATE_BOUNDARIES, BOUNDARY_COLORS }) => {
      const paths: RibbonPath[] = PLATE_BOUNDARIES.map(b => ({ pts: densify(b.pts, false), color: new THREE.Color(BOUNDARY_COLORS[b.kind]), closed: false }));
      this.root.geometry.dispose();
      this.root.geometry = ribbonGeometry(paths, 1.0025);
    }, () => { this.built = false; });
  }

  update(time: number, camAlt: number): void {
    if (!this.root.visible) return;
    this.shared.uTime.value = time;
    this.shared.uWidth.value = Math.min(0.012, Math.max(0.0002, camAlt * 0.0024));
    this.mat.uniforms.uOpacity.value = 0.62 + 0.18 * (1 - smooth(0.3, 2.5, camAlt));
  }
}

// ---------- clouds ----------

const BAKE_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = `
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    // Same parametrisation as THREE.SphereGeometry so the texture maps 1:1 onto the cloud sphere.
    float theta = (1.0 - vUv.y) * 3.14159265;
    float phi = vUv.x * 6.2831853;
    vec3 dir = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
    float lat = 90.0 - theta * 57.29578;
    float alat = abs(lat);

    // Climate bands: ITCZ (slightly north of the equator), clear subtropical highs, stormy mid-latitudes.
    float itcz = exp(-pow((lat - 6.0) / 6.0, 2.0));
    float subtrop = exp(-pow((alat - 24.0) / 7.0, 2.0));
    float storm = exp(-pow((alat - 52.0) / 11.0, 2.0));
    float polar = smoothstep(70.0, 86.0, alat);
    float cover = 0.56 + 0.26 * itcz + 0.2 * storm - 0.26 * subtrop - 0.1 * polar;

    // A few mid-latitude cyclones over the oceans (N Pacific, N Atlantic, Southern Ocean): twirl the
    // noise domain around each centre, spinning the right way per hemisphere. vec4 = lat, lon, radius, turns.
    vec3 sp = dir;
    for (int k = 0; k < 3; k++) {
      vec4 s = k == 0 ? vec4(44.0, -160.0, 0.15, 2.4) : k == 1 ? vec4(55.0, -32.0, 0.12, 2.0) : vec4(-52.0, 75.0, 0.16, -2.6);
      float clat = s.x * 0.0174533, clon = s.y * 0.0174533;
      vec3 c = vec3(cos(clat) * sin(clon), sin(clat), cos(clat) * cos(clon));
      float dd = acos(clamp(dot(sp, c), -1.0, 1.0));
      float w = exp(-pow(dd / s.z, 2.0));
      cover += 0.12 * w * smoothstep(0.0, 0.6, dd / s.z);
      float ang = s.w * w;
      float ca = cos(ang), sa = sin(ang);
      sp = sp * ca + cross(c, sp) * sa + c * dot(c, sp) * (1.0 - ca);
    }

    // East–west stretched base (zonal flow) with a gentle domain warp.
    vec3 p = sp * vec3(2.3, 3.8, 2.3);
    vec3 q = vec3(fbm(p, 3), fbm(p + vec3(5.2, 1.3, 2.8), 3), fbm(p + vec3(1.7, 9.2, 4.1), 3)) - 0.5;
    float n = fbm(p * 1.5 + (0.8 + 0.8 * itcz) * q, 6);
    // Fine wisps erode the edges; puffy convective cells in the tropics.
    float det = fbm(mix(dir, sp, 0.5) * vec3(14.0, 20.0, 14.0) + 1.5 * q, 4);
    float th = 0.5 + (0.45 - cover) * 0.32;
    // Wide, soft ramp so the edges stay thin and wispy; only the cores get dense.
    float d = smoothstep(th - 0.06, th + 0.22, n + (det - 0.5) * 0.22);
    d = d * d * (0.7 + 0.3 * det);
    gl_FragColor = vec4(d, det, 0.0, 1.0);
  }
`;

const CLOUD_VERT = `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CLOUD_FRAG = `
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vPos;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    float d = c.r;
    if (d < 0.01) discard;
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vPos);
    float sun = dot(N, normalize(uSunDir));
    float day = smoothstep(-0.16, 0.3, sun);
    float facing = max(dot(N, V), 0.0);
    vec3 dayCol = vec3(1.0, 0.99, 0.97) * (0.74 + 0.26 * max(sun, 0.0)) * (0.84 + 0.16 * c.g);
    vec3 col = mix(vec3(0.05, 0.07, 0.12), dayCol, day);
    col += vec3(0.5, 0.22, 0.08) * exp(-pow((sun - 0.02) / 0.1, 2.0)) * 0.55;
    float a = d * uOpacity * mix(0.32, 0.92, day) * (0.45 + 0.55 * smoothstep(0.0, 0.4, facing));
    gl_FragColor = vec4(col, a);
  }
`;

/** Procedurally baked (on the GPU, a strip per frame) drifting cloud shell, lit by the sun. */
class Clouds {
  readonly root: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget;
  private bake: { scene: THREE.Scene; cam: THREE.Camera; row: number; strip: number } | null;
  private ready = 0;
  private on = false;

  constructor(private renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3, q: Quality) {
    const W = q.cloudW, H = W / 2;
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
      wrapS: THREE.RepeatWrapping,
    });
    this.rt.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false }));
    quad.frustumCulled = false;
    scene.add(quad);
    this.bake = { scene, cam: new THREE.Camera(), row: 0, strip: W <= 512 ? H : H / 8 };

    this.mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: { uMap: { value: this.rt.texture }, uSunDir: { value: sunDir }, uOpacity: { value: 0 } },
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
    });
    this.root = new THREE.Mesh(new THREE.SphereGeometry(1.012, q.cloudSeg, q.cloudSeg / 2), this.mat);
    this.root.name = 'clouds';
    this.root.renderOrder = RENDER_ORDER.clouds;
    this.root.raycast = noRaycast;
    this.root.visible = false;
  }

  setVisible(on: boolean): void { this.on = on; if (!on) this.root.visible = false; }

  /** Bakes one strip of the cloud texture; returns true while baking is still in progress. */
  private bakeStep(): boolean {
    const b = this.bake;
    if (!b) return false;
    const r = this.renderer, prev = r.getRenderTarget();
    this.rt.scissorTest = true;
    this.rt.scissor.set(0, b.row, this.rt.width, b.strip);
    r.setRenderTarget(this.rt);
    r.render(b.scene, b.cam);
    r.setRenderTarget(prev);
    b.row += b.strip;
    if (b.row >= this.rt.height) {
      this.rt.scissorTest = false;
      b.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      this.bake = null;
      return false;
    }
    return true;
  }

  /** dt: world time in ms (0 while motion is paused), real: wall time in ms for the fade-in. Opacity reaches 0 by camAlt ≈ 0.6 so models are never hidden. */
  update(dt: number, real: number, camAlt: number, animate: boolean): void {
    if (!this.on) return;
    if (this.bake) { this.bakeStep(); this.root.visible = false; return; }
    this.ready = Math.min(1, this.ready + real / 900);
    const k = smooth(0.6, 1.35, camAlt) * this.ready;
    this.mat.uniforms.uOpacity.value = 0.72 * k;
    this.root.visible = k > 0.005;
    if (animate) this.root.rotation.y += dt * 0.8e-6;
  }
}

// ---------- aurora ----------

const AURORA_VERT = `
  attribute vec3 aOut;
  attribute float aU;
  attribute float aV;
  attribute float aKind;
  uniform float uTime;
  varying float vU;
  varying float vV;
  varying float vKind;
  varying vec3 vPos;
  void main() {
    vU = aU; vV = aV; vKind = aKind;
    float a = aU * 6.2831853;
    // Slowly folding curtain: the oval bends outwards/inwards, a bit more at the top.
    float fold = sin(a * 7.0 + uTime * 0.21) * 0.011 + sin(a * 17.0 - uTime * 0.37) * 0.005 + sin(a * 3.0 - uTime * 0.09) * 0.012;
    vec3 p = position + aOut * fold * (1.0 + aV * 0.6 * (1.0 - aKind));
    vPos = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const AURORA_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uSunDir;
  varying float vU;
  varying float vV;
  varying float vKind;
  varying vec3 vPos;
  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
  void main() {
    float u = vU;
    float rays = n1(u * 420.0 + uTime * 0.9) * 0.55 + n1(u * 150.0 - uTime * 0.35) * 0.45;
    float patches = smoothstep(0.25, 0.85, n1(u * 18.0 + uTime * 0.06) * 0.7 + n1(u * 5.0 - uTime * 0.03) * 0.5);
    float night = smoothstep(0.3, -0.3, dot(normalize(vPos), normalize(uSunDir)));
    float lit = mix(0.6, 1.0, night) * uIntensity * (0.3 + 0.7 * patches);
    vec3 green = vec3(0.2, 1.0, 0.55), teal = vec3(0.1, 0.85, 0.95), violet = vec3(0.62, 0.32, 1.0);
    if (vKind > 0.5) {
      // flat glow band under the curtain (what you see looking straight down)
      float g = exp(-vV * vV * 5.0);
      gl_FragColor = vec4(mix(green, teal, 0.3), g * 0.75 * lit * (0.6 + 0.4 * rays));
      return;
    }
    float v = vV;
    float prof = smoothstep(0.0, 0.07, v) * (1.0 - smoothstep(0.18, 1.0, v));
    prof *= 0.55 + 0.45 * pow(1.0 - v, 3.0);
    vec3 col = mix(green, teal, smoothstep(0.12, 0.45, v));
    col = mix(col, violet, smoothstep(0.42, 0.9, v));
    float a = prof * (0.3 + 0.7 * rays) * lit * 1.3;
    gl_FragColor = vec4(col, a);
  }
`;

const AURORA_POLES: [number, number][] = [[80.7, -72.7], [-80.7, 107.3]];

/** Curtain ribbons + soft ground band around both auroral ovals in one additive mesh. */
class Aurora {
  readonly root: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(sunDir: THREE.Vector3, q: Quality) {
    const N = q.auroraN, R0 = 1.013, R1 = 1.058, OVAL = 23 * D2R, BAND = 3.6 * D2R;
    const pos: number[] = [], out: number[] = [], us: number[] = [], vs: number[] = [], kinds: number[] = [], idx: number[] = [];
    const P = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), d = new THREE.Vector3(), o = new THREE.Vector3(), radial = new THREE.Vector3();
    const push = (v: THREE.Vector3, r: number, u: number, vv: number, kind: number) => {
      pos.push(v.x * r, v.y * r, v.z * r); out.push(o.x, o.y, o.z); us.push(u); vs.push(vv); kinds.push(kind);
      return pos.length / 3 - 1;
    };
    for (const [la, lo] of AURORA_POLES) {
      P.set(...latLonToVec(la, lo));
      e1.set(0, 1, 0).cross(P).normalize();
      e2.crossVectors(P, e1).normalize();
      const at = (ang: number, a: number) => radial.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).multiplyScalar(Math.sin(ang)).addScaledVector(P, Math.cos(ang));
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, u = i / N;
        d.copy(at(OVAL, a));
        o.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).multiplyScalar(Math.cos(OVAL)).addScaledVector(P, -Math.sin(OVAL));
        const b0 = push(d, R0, u, 0, 0); push(d, R1, u, 1, 0);
        push(at(OVAL - BAND, a), R0 - 0.001, u, -1, 1); push(d, R0 - 0.001, u, 0, 1); push(at(OVAL + BAND, a), R0 - 0.001, u, 1, 1);
        if (i < N) {
          const n = b0 + 5;
          idx.push(b0, b0 + 1, n, b0 + 1, n + 1, n);
          idx.push(b0 + 2, b0 + 3, n + 2, b0 + 3, n + 3, n + 2, b0 + 3, b0 + 4, n + 3, b0 + 4, n + 4, n + 3);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOut', new THREE.Float32BufferAttribute(out, 3));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(vs, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uSunDir: { value: sunDir } },
      blending: THREE.AdditiveBlending,
      transparent: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.root = new THREE.Mesh(g, this.mat);
    this.root.name = 'aurora';
    this.root.renderOrder = RENDER_ORDER.aurora;
    this.root.raycast = noRaycast;
    this.root.visible = false;
  }

  setVisible(on: boolean): void { this.root.visible = on; }

  update(time: number, camAlt: number): void {
    if (!this.root.visible) return;
    this.mat.uniforms.uTime.value = time;
    // Subtle from orbit, richer when zoomed towards the poles; gone at street level.
    this.mat.uniforms.uIntensity.value = (0.8 + 0.5 * (1 - smooth(0.4, 2.6, camAlt))) * smooth(0.05, 0.18, camAlt);
  }
}

// ---------- festival halos & orbit beacons ----------

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

const HALO_FRAG = `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float a = 0.0;
    for (int i = 0; i < 2; i++) {
      float ph = fract(uTime * 0.45 + float(i) * 0.5);
      float rr = 0.35 + ph * 0.65;
      a += exp(-pow((r - rr) / 0.07, 2.0)) * (1.0 - ph) * 0.8;
    }
    a += exp(-r * r * 6.0) * (0.5 + 0.25 * sin(uTime * 3.0));
    a *= 1.0 - smoothstep(0.85, 1.0, r);
    gl_FragColor = vec4(uColor, a);
  }
`;

type PlacedLookup = (key: string) => THREE.Object3D | undefined;

/** Pulsing warm halos under festivals that are happening around today's date. */
class FestivalGlow {
  readonly root = new THREE.Group();
  private keys = new Set<string>();
  private halos = new Map<string, THREE.Mesh>();
  private geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private mat: THREE.ShaderMaterial;

  constructor(private items: CatalogueItem[]) {
    this.root.name = 'festival-glow';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: HALO_FRAG,
      uniforms: { uColor: { value: new THREE.Color(TYPE_META.festival.color) }, uTime: { value: 0 } },
      blending: THREE.AdditiveBlending,
      transparent: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.refresh();
  }

  /** Re-evaluates which festivals are on (call occasionally, e.g. when the date may have changed). */
  refresh(date = new Date()): void {
    this.keys.clear();
    for (const it of this.items) if (it.type === 'festival' && isHappening(it, date)) this.keys.add(it.key);
    for (const [k, m] of this.halos) if (!this.keys.has(k)) { this.root.remove(m); this.halos.delete(k); }
  }

  has(key: string): boolean { return this.keys.has(key); }

  update(time: number, lookup: PlacedLookup): void {
    this.mat.uniforms.uTime.value = time;
    for (const key of this.keys) {
      const obj = lookup(key);
      let m = this.halos.get(key);
      if (!obj || !obj.visible) { if (m) m.visible = false; continue; }
      if (!m) {
        m = new THREE.Mesh(this.geo, this.mat);
        m.renderOrder = RENDER_ORDER.overlay;
        m.raycast = noRaycast;
        this.halos.set(key, m);
        this.root.add(m);
      }
      m.visible = true;
      m.position.copy(obj.position).multiplyScalar(1.0007);
      m.quaternion.copy(obj.quaternion);
      m.scale.setScalar(obj.scale.x * 2.6);
    }
  }
}

/** Soft glow + blinking strobe on orbiting items so they read as satellites from far away. */
class OrbitBeacons {
  readonly root = new THREE.Group();
  private list: { key: string; glow: THREE.Sprite; strobe: THREE.Sprite; phase: number }[] = [];
  private up = new THREE.Vector3();

  constructor(items: CatalogueItem[]) {
    this.root.name = 'orbit-beacons';
    const tex = glowTexture();
    for (const it of items) {
      if (it.route?.kind !== 'orbit') continue;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#bfdbfe', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      const strobe = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#fef2f2', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.raycast = strobe.raycast = noRaycast;
      glow.renderOrder = strobe.renderOrder = 5;
      this.root.add(glow, strobe);
      this.list.push({ key: it.key, glow, strobe, phase: [...it.key].reduce((a, c) => a + c.charCodeAt(0), 0) * 0.37 });
    }
  }

  update(time: number, lookup: PlacedLookup): void {
    for (const b of this.list) {
      const obj = lookup(b.key);
      const vis = !!obj?.visible;
      b.glow.visible = b.strobe.visible = vis;
      if (!vis || !obj) continue;
      const s = obj.scale.x;
      this.up.copy(obj.position).normalize();
      b.glow.position.copy(obj.position);
      b.glow.scale.setScalar(s * 2.6);
      b.strobe.position.copy(obj.position).addScaledVector(this.up, s * 0.55);
      // double flash every ~1.6 s, like a real anti-collision strobe
      const t = (time + b.phase) % 1.6;
      const flash = t < 0.08 || (t > 0.22 && t < 0.3) ? 1 : 0;
      (b.strobe.material as THREE.SpriteMaterial).opacity = flash * 0.95;
      b.strobe.scale.setScalar(s * (0.55 + flash * 0.25));
    }
  }
}

// ---------- graticule ----------

const GRID_VERT = `
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vPos;
  void main() {
    vDir = normalize(position);
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const GRID_FRAG = `
  uniform float uMinor;   // 0..1 visibility of the 5° grid
  uniform float uFine;    // 0..1 visibility of the 1° grid
  uniform float uOpacity;
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vPos;
  // Anti-aliased line at every multiple of step; d = derivative of the coordinate in degrees per pixel.
  float grid(float c, float d, float step, float px) {
    float g = abs(fract(c / step + 0.5) - 0.5) * step;
    return 1.0 - smoothstep(px * 0.5 * d, (px * 0.5 + 1.0) * d, g);
  }
  float at(float c, float d, float v, float px) {
    return 1.0 - smoothstep(px * 0.5 * d, (px * 0.5 + 1.0) * d, abs(c - v));
  }
  void main() {
    float lat = degrees(asin(clamp(vDir.y, -1.0, 1.0)));
    float lon = degrees(atan(vDir.x, vDir.z));
    float lon2 = mod(lon + 360.0, 360.0);
    float dLat = fwidth(lat);
    float dLon = min(fwidth(lon), fwidth(lon2));
    float alat = abs(lat);
    // Meridians crowd together near the poles: thin them out above 75° (keep every 90°) and stop at 89°.
    float polarFade = 1.0 - smoothstep(72.0, 80.0, alat);
    float mer15 = grid(lon2, dLon, 15.0, 1.0) * mix(grid(lon2, dLon, 90.0, 1.0), 1.0, polarFade) * step(alat, 89.0);
    float par15 = grid(lat, dLat, 15.0, 1.0);
    float major = max(mer15, par15);
    float minor = max(grid(lon2, dLon, 5.0, 0.8) * polarFade, grid(lat, dLat, 5.0, 0.8)) * uMinor;
    float fine = max(grid(lon2, dLon, 1.0, 0.6) * polarFade, grid(lat, dLat, 1.0, 0.6)) * uFine;

    vec3 col = vec3(0.86, 0.93, 1.0);
    float a = max(major * 0.34, max(minor * 0.16, fine * 0.09));
    // Prime meridian and antimeridian: sky blue.
    float pm = max(at(lon, dLon, 0.0, 1.6), at(lon2, dLon, 180.0, 1.2) * 0.7) * step(alat, 89.0);
    col = mix(col, vec3(0.49, 0.83, 0.99), pm);
    a = max(a, pm * 0.72);
    // Equator: amber, thicker.
    float eq = at(lat, dLat, 0.0, 2.0);
    col = mix(col, vec3(0.98, 0.75, 0.14), eq);
    a = max(a, eq * 0.85);
    // Tropics (warm) and polar circles (icy), dashed every 2°.
    float dash = step(0.45, fract(lon2 / 2.0));
    float tr = max(at(lat, dLat, 23.436, 1.3), at(lat, dLat, -23.436, 1.3)) * dash;
    float pc = max(at(lat, dLat, 66.564, 1.3), at(lat, dLat, -66.564, 1.3)) * dash;
    col = mix(col, vec3(0.99, 0.65, 0.35), tr);
    col = mix(col, vec3(0.65, 0.95, 0.99), pc);
    a = max(a, max(tr, pc) * 0.7);
    // Fade towards the limb so the edge of the globe stays clean.
    float facing = dot(normalize(vN), normalize(cameraPosition - vPos));
    a *= smoothstep(0.02, 0.35, facing) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/** Latitude/longitude grid drawn analytically on a thin shell: crisp at any zoom, highlights equator, tropics, polar circles and prime meridian. */
class Graticule {
  readonly root: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT, fragmentShader: GRID_FRAG,
      uniforms: { uMinor: { value: 0 }, uFine: { value: 0 }, uOpacity: { value: 1 } },
      transparent: false, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.root = new THREE.Mesh(new THREE.SphereGeometry(1.0012, 160, 96), this.mat);
    this.root.name = 'graticule';
    this.root.renderOrder = RENDER_ORDER.overlay;
    this.root.raycast = noRaycast;
  }

  setVisible(on: boolean): void { this.root.visible = on; }

  update(camAlt: number): void {
    if (!this.root.visible) return;
    const u = this.mat.uniforms;
    u.uMinor.value = 1 - smooth(0.9, 1.6, camAlt);
    u.uFine.value = 1 - smooth(0.12, 0.3, camAlt);
    u.uOpacity.value = 0.85 + 0.15 * smooth(0.3, 2.5, camAlt);
  }
}

/** Step (degrees) of the labelled grid lines for a given camera altitude, matching the drawn grid. */
export function graticuleStep(camAlt: number): number { return camAlt < 0.3 ? 1 : camAlt < 1.25 ? 5 : camAlt < 2.6 ? 15 : 30; }

/** All globe overlay layers, wired by Globe. */
export class GlobeLayers {
  readonly routes: RoutePaths;
  readonly tectonics = new Tectonics();
  readonly graticule = new Graticule();
  readonly clouds: Clouds;
  readonly aurora: Aurora;
  readonly festivals: FestivalGlow;
  readonly beacons: OrbitBeacons;
  private lastRefresh = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, items: CatalogueItem[], sunDir: THREE.Vector3, private lowfx: boolean, q: Quality) {
    this.routes = new RoutePaths(items);
    this.clouds = new Clouds(renderer, sunDir, q);
    this.aurora = new Aurora(sunDir, q);
    this.festivals = new FestivalGlow(items);
    this.beacons = new OrbitBeacons(items);
    scene.add(this.graticule.root, this.clouds.root, this.aurora.root, this.tectonics.root, this.routes.root, this.festivals.root, this.beacons.root);
  }

  setVisible(s: { clouds: boolean; aurora: boolean; tectonics: boolean; graticule: boolean }, gameMode: boolean): void {
    this.graticule.setVisible(s.graticule);
    // Games use the globe as a map, so keep it clear of clouds and plate lines.
    this.clouds.setVisible(s.clouds && !gameMode);
    this.aurora.setVisible(s.aurora);
    this.tectonics.setVisible(s.tectonics && !gameMode);
  }

  /** clockMs = scene clock, dt = world ms, real = wall ms, camAlt = camera altitude above the surface in globe radii. */
  update(clockMs: number, dt: number, real: number, camAlt: number, state: RouteState, orbitAlt: (it: CatalogueItem) => number, lookup: PlacedLookup): void {
    // Reduced-motion / low-power: freeze the animated shaders (they still draw, just stay still).
    const t = this.lowfx ? 0 : clockMs * 0.001;
    if (clockMs - this.lastRefresh > 600_000) { this.lastRefresh = clockMs; this.festivals.refresh(); }
    this.routes.update(t, camAlt, state, orbitAlt);
    this.tectonics.update(t, camAlt);
    this.graticule.update(camAlt);
    this.clouds.update(dt, real, camAlt, !this.lowfx);
    this.aurora.update(t, camAlt);
    this.festivals.update(t, lookup);
    this.beacons.update(t, lookup);
  }
}
