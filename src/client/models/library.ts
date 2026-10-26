import * as THREE from 'three';
import type { ModelRecipe } from '../../shared/data/types.ts';
import { unpackModel, type PackedModel } from './pack.ts';

/**
 * Main-thread model library. Models are built and AO-baked in Web Workers (build.worker.ts) and cached here as
 * prototypes; `buildModel` hands out cheap clones. Without Worker support (or if a model can't be serialised)
 * the builder core (kit.ts) is loaded lazily and the model is built on the main thread instead.
 */
type Kit = typeof import('./kit.ts');

const protos = new Map<string, THREE.Group>();
const waits = new Map<string, Promise<void>>();
/** Models built with a generic stand-in because their hero pack failed to load, and when that was last tried. */
const provisional = new Map<string, number>();
const RETRY_MS = 60e3;
const keyOf = (r: ModelRecipe) => JSON.stringify(r);

let kit: Promise<Kit> | null = null;
const loadKit = () => (kit ??= import('./kit.ts').catch((e: unknown) => { kit = null; throw e; }));

interface Built { g: THREE.Group; final: boolean }
interface Job { id: number; recipe: ModelRecipe; resolve: (b: Built) => void; reject: (e: Error) => void }
interface Slot { w: Worker; busy: Job | null; alive: boolean }
const queue: Job[] = [];
let slots: Slot[] | null = null;
let nextId = 1;
let workersBroken = typeof Worker === 'undefined';

function pool(): Slot[] {
  if (slots) return slots;
  const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
  slots = [];
  for (let i = 0; i < n; i++) {
    let w: Worker;
    try { w = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' }); } catch {
      // e.g. a sandboxed or file:// origin: everything waiting goes to the main thread instead
      workersBroken = true;
      if (!slots.length) for (const j of queue.splice(0)) j.reject(new Error('no workers'));
      break;
    }
    const slot: Slot = { w, busy: null, alive: false };
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; model?: PackedModel; final?: boolean; err?: string }>) => {
      const job = slot.busy;
      slot.busy = null;
      slot.alive = true;
      if (job && job.id === e.data.id) {
        if (e.data.ok) {
          try { job.resolve({ g: unpackModel(e.data.model!), final: e.data.final !== false }); } catch (err) { job.reject(err as Error); }
        } else job.reject(new Error(e.data.err));
      }
      pump();
    };
    w.onerror = ev => {
      // A worker that fails to start (e.g. blocked module workers) disables the pool; queued jobs go to the main thread.
      ev.preventDefault();
      if (slot.alive) {
        // a stray error in a worker that already delivered models: only the job in hand is lost
        slot.busy?.reject(new Error('worker error'));
        slot.busy = null;
        pump();
        return;
      }
      workersBroken = true;
      const jobs = [...(slot.busy ? [slot.busy] : []), ...queue.splice(0)];
      slot.busy = null;
      for (const j of jobs) j.reject(new Error('worker failed'));
    };
    slots.push(slot);
  }
  return slots;
}

function pump(): void {
  for (const s of pool()) {
    if (s.busy || !queue.length) continue;
    const job = queue.shift()!;
    s.busy = job;
    s.w.postMessage({ id: job.id, recipe: job.recipe });
  }
}

function buildInWorker(recipe: ModelRecipe, urgent: boolean): Promise<Built> {
  return new Promise((resolve, reject) => {
    const job = { id: nextId++, recipe, resolve, reject };
    if (urgent) queue.unshift(job); else queue.push(job);
    pump();
  });
}

async function buildOnMain(recipe: ModelRecipe): Promise<Built> {
  const k = await loadKit();
  await k.whenModelReady(recipe);
  return { g: k.buildFresh(recipe), final: k.modelReady(recipe) };
}

/** True when `buildModel(recipe)` can return the final model immediately. */
export const modelReady = (recipe: ModelRecipe): boolean => protos.has(keyOf(recipe));

/** Builds (in a worker when possible) and caches the recipe's model; resolves once `modelReady` is true. */
export function whenModelReady(recipe: ModelRecipe, urgent = false): Promise<void> {
  const key = keyOf(recipe);
  if (protos.has(key)) return Promise.resolve();
  return build(key, recipe, urgent);
}

function build(key: string, recipe: ModelRecipe, urgent: boolean): Promise<void> {
  let p = waits.get(key);
  if (p && urgent) {
    // Jump an already-queued job to the front (e.g. something the user just opened).
    const i = queue.findIndex(j => keyOf(j.recipe) === key);
    if (i > 0) queue.unshift(...queue.splice(i, 1));
  }
  if (!p) {
    const viaWorker = workersBroken ? Promise.reject(new Error('no workers')) : buildInWorker(recipe, urgent);
    p = viaWorker.catch(() => buildOnMain(recipe)).then(b => {
      // a stand-in still beats nothing, but the hero pack is tried again later (see buildModel)
      if (b.final) provisional.delete(key); else provisional.set(key, performance.now());
      if (b.final || !protos.has(key)) protos.set(key, b.g);
    }).finally(() => waits.delete(key));
    waits.set(key, p);
  }
  return p;
}

/**
 * Returns a fresh instance of a ready model (call `whenModelReady` first). Baked meshes that carry a level-of-detail
 * split get their own geometry view (sharing the GPU buffers) so each instance can switch detail independently.
 */
export function buildModel(recipe: ModelRecipe): THREE.Group {
  const key = keyOf(recipe), proto = protos.get(key);
  if (!proto) throw new Error('model not ready: ' + recipe.kind);
  const tried = provisional.get(key);
  if (tried !== undefined && performance.now() - tried > RETRY_MS && !waits.has(key)) {
    provisional.set(key, performance.now());
    void build(key, recipe, false).catch(() => {});
  }
  const obj = proto.clone(true);
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.userData.lod) m.geometry = geometryView(m.geometry);
  });
  return obj;
}

function geometryView(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
  if (src.index) g.setIndex(src.index);
  g.drawRange = { ...src.drawRange };
  g.boundingSphere = src.boundingSphere;
  g.boundingBox = src.boundingBox;
  g.userData = src.userData;
  return g;
}

/**
 * Switches an instance between full detail and its far level of detail (large parts only, small loose meshes hidden).
 * Returns nothing; cheap enough to call only when the level changes.
 */
export function setModelDetail(obj: THREE.Object3D, far: boolean): void {
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const lod = m.geometry.userData.lod as [number, number] | undefined;
    if (lod) {
      if (far) m.geometry.setDrawRange(lod[0], lod[1]);
      else m.geometry.setDrawRange(0, lod[0] || m.geometry.getAttribute('position').count);
    }
    if (m.userData.lodHide) m.visible = !far;
  });
}
