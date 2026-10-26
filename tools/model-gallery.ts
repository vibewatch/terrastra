// Dev-only visual QA harness: `npx vite` then open /tools/model-gallery.html
// Query params: ?type=landmark|animal|discovery|vehicle  &keys=eiffel,lion  &cols=4  &size=320  &yaw=0.6  &pitch=0.35  &lod=far  &zoom=2.5  &cy=0.6 (look-at height as a fraction of model height)
import * as THREE from 'three';
import { CATALOGUE } from '../src/shared/data/catalogue.ts';
import { buildFresh, whenModelReady } from '../src/client/models/kit.ts';
import { setupStudio } from '../src/client/models/preview.ts';
import { setModelDetail } from '../src/client/models/library.ts';
import { human, type HumanPose } from '../src/client/models/human.ts';

const q = new URLSearchParams(location.search);
const type = q.get('type');
const keys = q.get('keys')?.split(',');
const size = Number(q.get('size') ?? 256);
const yaw = Number(q.get('yaw') ?? 0.6);
const pitch = Number(q.get('pitch') ?? 0.32);
const far = q.get('lod') === 'far';
const zoom = Number(q.get('zoom') ?? 1);
const cy = Number(q.get('cy') ?? 0.5);
document.documentElement.style.setProperty('--cols', q.get('cols') ?? '8');

// ?rig=human renders every pose of the shared human (detail via &detail=lo|hi)
const POSES: HumanPose[] = ['stand', 'relax', 'walk', 'run', 'sit', 'sitGround', 'kneel', 'crouch', 'wave', 'point', 'cheer', 'carry', 'pray', 'photo', 'reach', 'row'];
const rig = q.get('rig') === 'human';
const items = rig
  ? POSES.map(pose => ({ key: pose, emoji: '🧍', model: { kind: 'rig', pose } }) as unknown as (typeof CATALOGUE)[number])
  : CATALOGUE.filter(i => (!type || i.type === type) && (!keys || keys.includes(i.key)));
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(size, size, false);
const scene = new THREE.Scene();
setupStudio(renderer, scene);
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
const grid = document.getElementById('grid')!;

if (!rig) await Promise.all(items.map(i => whenModelReady(i.model)));
const timings: [string, number][] = [];
for (const item of items) {
  const t0 = performance.now();
  let model: THREE.Object3D;
  if (rig) {
    model = new THREE.Group();
    const pose = (item.model as unknown as { pose: HumanPose }).pose;
    human(model, 0, 0, 0, { h: 1, pose, phase: 0.25, top: '#2563eb', bottom: '#374151', hair: '#3b2a20', shoes: '#1f2937', detail: (q.get('detail') as 'lo' | 'hi') ?? 'hi', sleeve: Number(q.get('sleeve') ?? 1), shorts: q.has('shorts') });
  } else {
    model = buildFresh(item.model);
    setModelDetail(model, far);
  }
  timings.push([item.key, performance.now() - t0]);
  const box = new THREE.Box3().setFromObject(model);
  const s = new THREE.Vector3(), c = new THREE.Vector3();
  box.getSize(s); box.getCenter(c);
  const k = 1 / Math.max(s.x, s.y, s.z);
  model.scale.setScalar(k);
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = yaw;
  scene.add(pivot);
  const d = 2.6 / zoom;
  camera.position.set(0, s.y * k * cy + Math.sin(pitch) * d, Math.cos(pitch) * d);
  camera.lookAt(0, s.y * k * cy, 0);
  renderer.render(scene, camera);
  scene.remove(pivot);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  cv.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = `${item.emoji} ${item.key} · ${item.model.kind}`;
  fig.append(cv, cap);
  grid.append(fig);
}
timings.sort((a, b) => b[1] - a[1]);
console.info(`build total ${timings.reduce((a, t) => a + t[1], 0).toFixed(0)}ms; slowest ${timings.slice(0, 6).map(([k, t]) => `${k}:${t.toFixed(0)}`).join(' ')}`);
document.body.dataset.ready = '1';
