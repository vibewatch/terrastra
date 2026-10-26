import * as THREE from 'three';
import { PBR_ATTR, vertexPbrOf } from './pbr.ts';

/**
 * Compact, transferable form of a built model so it can be produced in a Web Worker and rebuilt on the main thread.
 * Supports the subset the model builders use: Group/Object3D/Mesh trees with plain BufferGeometry and untextured
 * MeshStandard/MeshBasic materials. Anything else throws, and callers fall back to building on the main thread.
 */
interface PackedAttr { name: string; array: Float32Array | Uint16Array | Uint32Array | Uint8Array | Int16Array | Int8Array; itemSize: number; normalized: boolean }
export interface PackedGeo { id: string; attrs?: PackedAttr[]; index?: Uint16Array | Uint32Array; groups?: { start: number; count: number; materialIndex?: number }[]; dr?: [number, number]; ud?: Record<string, unknown> }
export interface PackedMat { type: 'MeshStandardMaterial' | 'MeshBasicMaterial'; p: Record<string, unknown> }
export interface PackedNode {
  k: 0 | 1 | 2; // 0 Object3D, 1 Group, 2 Mesh
  n?: string;
  m?: number[]; // local matrix (omitted when identity)
  ud?: Record<string, unknown>;
  g?: number; mt?: number;
  f?: number; // flags: 1 castShadow, 2 receiveShadow, 4 hidden, 8 not frustum-culled
  ro?: number;
  c?: PackedNode[];
}
export interface PackedModel { root: PackedNode; geos: PackedGeo[]; mats: PackedMat[] }

const MAT_KEYS = ['color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'flatShading', 'vertexColors', 'transparent', 'opacity',
  'side', 'depthWrite', 'depthTest', 'blending', 'toneMapped', 'alphaTest', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'wireframe', 'fog'] as const;
const TEX_KEYS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'envMap', 'lightMap', 'bumpMap', 'displacementMap'];

function packMat(m: THREE.Material): PackedMat {
  const type = m.type as PackedMat['type'];
  if (type !== 'MeshStandardMaterial' && type !== 'MeshBasicMaterial') throw new Error('unsupported material ' + m.type);
  const rec = m as unknown as Record<string, unknown>;
  for (const k of TEX_KEYS) if (rec[k]) throw new Error('textured material');
  const p: Record<string, unknown> = {};
  for (const k of MAT_KEYS) {
    const v = rec[k];
    if (v === undefined) continue;
    p[k] = v instanceof THREE.Color ? v.getHex() : v;
  }
  return { type, p };
}

/**
 * Normals and vertex colours shipped as 16-bit normalised integers instead of floats: a third less GPU memory for the
 * models (millions of vertices once the globe is populated) with no visible difference. Null keeps the attribute as is.
 */
function quantized(name: string, a: THREE.BufferAttribute): Int16Array | Uint16Array | null {
  const src = a.array;
  if (!(src instanceof Float32Array) || a.normalized || a.itemSize !== 3) return null;
  if (name === 'normal') {
    for (let i = 0; i < src.length; i++) if (!(Math.abs(src[i]) <= 1.0001)) return null;
    const out = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, src[i])) * 32767);
    return out;
  }
  if (name === 'color') {
    for (let i = 0; i < src.length; i++) if (!(src[i] >= -0.0001 && src[i] <= 1.0001)) return null;
    const out = new Uint16Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.max(0, Math.min(1, src[i])) * 65535);
    return out;
  }
  return null;
}

/** Serialises a model tree. `sent` remembers geometry ids already shipped (shared cached geometries are sent once). */
export function packModel(root: THREE.Object3D, sent?: Set<string>): { model: PackedModel; transfer: ArrayBuffer[] } {
  const geos: PackedGeo[] = [], mats: PackedMat[] = [], transfer: ArrayBuffer[] = [];
  const gi = new Map<THREE.BufferGeometry, number>(), mi = new Map<THREE.Material, number>();
  // only marked as sent once the whole model packed: a throw part-way ships nothing
  const fresh: string[] = [];
  const geoIdx = (g: THREE.BufferGeometry) => {
    let i = gi.get(g);
    if (i !== undefined) return i;
    i = geos.length;
    gi.set(g, i);
    if (sent?.has(g.uuid)) { geos.push({ id: g.uuid }); return i; }
    if (Object.keys(g.morphAttributes).length) throw new Error('morph attributes');
    const attrs: PackedAttr[] = [];
    for (const [name, a] of Object.entries(g.attributes)) {
      if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new Error('interleaved attribute');
      const ba = a as THREE.BufferAttribute;
      const q = quantized(name, ba);
      const array = q ?? (ba.array as PackedAttr['array']).slice();
      transfer.push(array.buffer as ArrayBuffer);
      attrs.push({ name, array, itemSize: ba.itemSize, normalized: q ? true : ba.normalized });
    }
    const pg: PackedGeo = { id: g.uuid, attrs };
    if (g.index) { pg.index = (g.index.array as Uint16Array | Uint32Array).slice(); transfer.push(pg.index.buffer as ArrayBuffer); }
    if (g.groups.length) pg.groups = g.groups.map(x => ({ ...x }));
    if (Object.keys(g.userData).length) pg.ud = { ...g.userData };
    if (g.drawRange.start || Number.isFinite(g.drawRange.count)) pg.dr = [g.drawRange.start, g.drawRange.count];
    geos.push(pg);
    fresh.push(g.uuid);
    return i;
  };
  const matIdx = (m: THREE.Material) => {
    let i = mi.get(m);
    if (i === undefined) { i = mats.length; mi.set(m, i); mats.push(packMat(m)); }
    return i;
  };
  const walk = (o: THREE.Object3D): PackedNode => {
    const mesh = o as THREE.Mesh;
    let k: PackedNode['k'];
    if (mesh.isMesh) k = 2;
    else if ((o as THREE.Group).isGroup) k = 1;
    else if (o.type === 'Object3D') k = 0;
    else throw new Error('unsupported object ' + o.type);
    const node: PackedNode = { k };
    if (o.name) node.n = o.name;
    o.updateMatrix();
    if (!o.matrix.equals(IDENT)) node.m = o.matrix.toArray();
    if (Object.keys(o.userData).length) node.ud = { ...o.userData };
    const f = (o.castShadow ? 1 : 0) | (o.receiveShadow ? 2 : 0) | (o.visible ? 0 : 4) | (o.frustumCulled ? 0 : 8);
    if (f) node.f = f;
    if (o.renderOrder) node.ro = o.renderOrder;
    if (k === 2) {
      if (Array.isArray(mesh.material)) throw new Error('multi-material mesh');
      node.g = geoIdx(mesh.geometry);
      node.mt = matIdx(mesh.material);
    }
    if (o.children.length) node.c = o.children.map(walk);
    return node;
  };
  const model = { root: walk(root), geos, mats };
  for (const id of fresh) sent?.add(id);
  return { model, transfer };
}

const IDENT = new THREE.Matrix4();

/** Main-thread caches so identical materials / shared geometries are reused across every unpacked model. */
const matCache = new Map<string, THREE.Material>();
const geoCache = new Map<string, THREE.BufferGeometry>();

function unpackMat(pm: PackedMat): THREE.Material {
  const key = pm.type + JSON.stringify(pm.p);
  let m = matCache.get(key);
  if (!m) {
    const p = { ...pm.p };
    m = pm.type === 'MeshBasicMaterial' ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial();
    for (const [k, v] of Object.entries(p)) {
      const cur = (m as unknown as Record<string, unknown>)[k];
      if (cur instanceof THREE.Color) cur.setHex(v as number);
      else (m as unknown as Record<string, unknown>)[k] = v;
    }
    m.needsUpdate = true;
    matCache.set(key, m);
  }
  return m;
}

function unpackGeo(pg: PackedGeo): THREE.BufferGeometry {
  const have = geoCache.get(pg.id);
  if (have) return have;
  if (!pg.attrs) throw new Error('geometry ' + pg.id + ' was never received');
  const g = new THREE.BufferGeometry();
  for (const a of pg.attrs) g.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  if (pg.index) g.setIndex(new THREE.BufferAttribute(pg.index, 1));
  if (pg.groups) for (const x of pg.groups) g.addGroup(x.start, x.count, x.materialIndex);
  if (pg.ud) g.userData = pg.ud;
  if (pg.dr) g.setDrawRange(pg.dr[0], pg.dr[1]);
  g.computeBoundingSphere();
  geoCache.set(pg.id, g);
  return g;
}

export function unpackModel(pm: PackedModel): THREE.Group {
  const geos = pm.geos.map(unpackGeo), mats = pm.mats.map(unpackMat);
  const build = (n: PackedNode): THREE.Object3D => {
    const o = n.k === 2 ? new THREE.Mesh(geos[n.g!], geos[n.g!].getAttribute(PBR_ATTR) ? vertexPbrOf(mats[n.mt!]) : mats[n.mt!]) : n.k === 1 ? new THREE.Group() : new THREE.Object3D();
    if (n.n) o.name = n.n;
    if (n.m) { o.matrix.fromArray(n.m); o.matrix.decompose(o.position, o.quaternion, o.scale); }
    if (n.ud) o.userData = n.ud;
    const f = n.f ?? 0;
    o.castShadow = !!(f & 1); o.receiveShadow = !!(f & 2); o.visible = !(f & 4); o.frustumCulled = !(f & 8);
    if (n.ro) o.renderOrder = n.ro;
    if (n.c) for (const c of n.c) o.add(build(c));
    return o;
  };
  const root = build(pm.root);
  if (!(root as THREE.Group).isGroup) { const g = new THREE.Group(); g.add(root); return g; }
  return root as THREE.Group;
}
