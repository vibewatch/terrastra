import * as THREE from 'three';
import { currentQuality } from '../globe/quality.ts';
import type { CatalogueItem } from '../../shared/data/types.ts';
import { buildModel, modelReady, whenModelReady } from './library.ts';
import { outdoorEnvironment } from './environment.ts';
import { h } from '../ui/dom.ts';

interface ActivePreview {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  item: CatalogueItem;
  group: THREE.Group;
  yaw: number;
  pitch: number;
  dragging: boolean;
  clock: number;
}

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedFailed = false;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
let sharedRoot: THREE.Group | null = null;
let rafId = 0;
const activePreviews = new Set<ActivePreview>();

/** Configures the shared 3-point studio lighting rig used by every miniature turntable preview. */
export function setupStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const key = new THREE.DirectionalLight(0xfffbeb, 3.0);
  key.position.set(2.8, 4.2, 3.4);
  const fill = new THREE.DirectionalLight(0xc7d2fe, 0.9);
  fill.position.set(-3.2, 1.8, -2.0);
  const rimLight = new THREE.DirectionalLight(0xfde68a, 0.9);
  rimLight.position.set(0.5, 2.5, -3.5);
  const amb = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.3);
  scene.add(key, fill, rimLight, amb);
  scene.environment = outdoorEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  // filmic roll-off keeps pale stone and sunlit tops from clipping to flat white (only models live in this scene)
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  if (currentQuality().tier !== 'low') {
    // the turntable model is normalised to ~1 unit, so one small fixed shadow box covers it
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const c = key.shadow.camera;
    c.left = c.bottom = -1; c.right = c.top = 1; c.near = 2; c.far = 10;
    key.shadow.normalBias = 0.006;
    key.shadow.intensity = 0.85;
  }
}

function ensureRenderer(w: number, hPx: number): THREE.WebGLRenderer | null {
  if (sharedFailed) return null;
  if (!sharedRenderer) {
    try {
      const q = currentQuality();
      sharedRenderer = new THREE.WebGLRenderer({ antialias: q.tier !== 'low', alpha: true, powerPreference: 'high-performance' });
      sharedRenderer.debug.checkShaderErrors = import.meta.env.DEV;
      sharedRenderer.setPixelRatio(Math.min(q.dprMax, window.devicePixelRatio || 1));
      sharedScene = new THREE.Scene();
      sharedCamera = new THREE.PerspectiveCamera(28, w / hPx, 0.05, 20);
      setupStudio(sharedRenderer, sharedScene);
      sharedRoot = new THREE.Group();
      sharedScene.add(sharedRoot);
    } catch {
      sharedFailed = true;
      return null;
    }
  }
  sharedRenderer.setSize(w, hPx, false);
  if (sharedCamera) {
    sharedCamera.aspect = w / hPx;
    sharedCamera.updateProjectionMatrix();
  }
  return sharedRenderer;
}

let shadowGeo: THREE.BufferGeometry | null = null, shadowMat: THREE.Material | null = null;
/** A soft disc under the turntable; one geometry and material shared by every preview. */
function contactShadow(): THREE.Mesh {
  if (!shadowGeo || !shadowMat) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    shadowGeo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.position.y = -0.004;
  return m;
}

function buildPreviewScene(item: CatalogueItem): THREE.Group {
  const wrap = new THREE.Group();
  const model = buildModel(item.model);
  // Normalise so the longest side is ~1 unit, base on y=0, centred on the turntable axis
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = 1.06 / Math.max(0.38, size.x, size.y, size.z);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  wrap.userData.fitH = size.y * scale;
  wrap.userData.fitW = Math.hypot(size.x, size.z) * scale;
  model.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m)) o.castShadow = o.receiveShadow = !m.transparent;
  });
  wrap.add(contactShadow(), model);
  return wrap;
}

/** Empty turntable shown for the moment it takes to fetch a model's hero pack. */
function placeholderGroup(): THREE.Group {
  const g = new THREE.Group();
  g.userData.fitH = 0.6; g.userData.fitW = 1;
  g.add(contactShadow());
  return g;
}

const isLowFx = () => typeof document !== 'undefined' && document.body.classList.contains('lowfx');

function renderOne(p: ActivePreview): void {
  p.group.rotation.y = p.yaw;
  p.group.rotation.x = p.pitch;
  const w = p.canvas.width || 220;
  const hPx = p.canvas.height || 140;
  const renderer = ensureRenderer(w / 2, hPx / 2);
  if (renderer && sharedScene && sharedCamera && sharedRoot && p.ctx) {
    sharedRoot.clear();
    sharedRoot.add(p.group);
    // Fit the turntable's bounding cylinder to the frame for any aspect ratio
    const H = p.group.userData.fitH as number, W = p.group.userData.fitW as number;
    const tv = Math.tan(THREE.MathUtils.degToRad(sharedCamera.fov / 2)), elev = 0.32;
    const dist = Math.max((H * 0.5 + 0.08) / tv, (W * 0.5 + 0.04) / (tv * sharedCamera.aspect), 1.1) + W * 0.25;
    const cy = H * 0.46;
    sharedCamera.position.set(0, cy + Math.sin(elev) * dist, Math.cos(elev) * dist);
    sharedCamera.lookAt(0, cy, 0);
    renderer.render(sharedScene, sharedCamera);
    p.ctx.clearRect(0, 0, w, hPx);
    p.ctx.drawImage(renderer.domElement, 0, 0, w, hPx);
  }
}

let lastTime = performance.now();
function tick(): void {
  rafId = 0;
  if (isLowFx()) return;
  const now = performance.now();
  const dt = Math.min(64, now - lastTime);
  lastTime = now;

  for (const p of [...activePreviews]) {
    if (!p.canvas.isConnected) {
      activePreviews.delete(p);
      continue;
    }
    p.clock += dt;
    if (!p.dragging) {
      p.yaw += dt * 0.00085;
    }
    p.group.traverse(o => {
      if (o.name === 'spin') o.rotation.z += dt * 0.0025;
      if (o.name === 'flap') o.rotation.z = Math.sin(p.clock * 0.005) * 0.22;
    });
    renderOne(p);
  }

  if (activePreviews.size > 0) {
    rafId = requestAnimationFrame(tick);
  }
}

/** Creates an interactive 3D turntable preview widget (like myearthtoy.com's #info-preview / #placeit-preview). */
export function createModelPreview(item: CatalogueItem, opts: { width?: number; height?: number; id?: string } = {}): HTMLElement {
  const w = opts.width ?? 220;
  const hPx = opts.height ?? 132;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h('canvas', {
    class: 'model-preview-canvas',
    width: String(Math.round(w * dpr)),
    height: String(Math.round(hPx * dpr)),
    ...(opts.id ? { id: opts.id } : {}),
  }) as HTMLCanvasElement;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${hPx}px`;

  const ctx = canvas.getContext('2d');
  const preview: ActivePreview = {
    canvas,
    ctx,
    item,
    group: modelReady(item.model) ? buildPreviewScene(item) : placeholderGroup(),
    yaw: 0.45,
    pitch: 0.08,
    dragging: false,
    clock: 0,
  };

  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    preview.dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!preview.dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    preview.yaw += dx * 0.014;
    preview.pitch = Math.max(-0.25, Math.min(0.45, preview.pitch + dy * 0.008));
    if (isLowFx()) renderOne(preview);
  });
  const stopDrag = () => { preview.dragging = false; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  renderOne(preview);
  if (!modelReady(item.model)) void whenModelReady(item.model, true).then(() => { preview.group = buildPreviewScene(item); renderOne(preview); }, () => {});
  if (!isLowFx()) {
    activePreviews.add(preview);
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  return h('div', { class: 'model-stage' },
    canvas,
    h('span', { class: 'model-stage-badge' }, item.emoji),
    h('span', { class: 'model-stage-hint' }, '3D · 360°'),
  );
}
