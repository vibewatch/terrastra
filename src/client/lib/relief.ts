/**
 * Relief maps (land height, ocean depth) as single-channel R8 textures. The source WebPs are grayscale,
 * so keeping only the red channel quarters their GPU memory versus RGBA. Decoding happens in a worker
 * where possible, and each file is decoded once even when the globe and the flat map both use it.
 */
import * as THREE from 'three';
import { decodeRed, type RedPixels } from './relief-decode.ts';

const cache = new Map<string, Promise<RedPixels>>();

function decodeInWorker(src: string): Promise<RedPixels> {
  return new Promise((ok, fail) => {
    const w = new Worker(new URL('./relief.worker.ts', import.meta.url), { type: 'module' });
    const done = () => w.terminate();
    w.onmessage = (e: MessageEvent<RedPixels | { error: string }>) => {
      done();
      if ('error' in e.data) fail(new Error(e.data.error)); else ok(e.data);
    };
    w.onerror = err => { done(); fail(err); };
    w.postMessage(src);
  });
}

function pixels(src: string): Promise<RedPixels> {
  let p = cache.get(src);
  if (!p) {
    const abs = new URL(src, location.href).href;
    p = (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
      ? decodeInWorker(abs).catch(() => decodeRed(abs))
      : decodeRed(abs));
    p.catch(() => cache.delete(src));
    cache.set(src, p);
  }
  return p;
}

/** A mip-mapped R8 texture for a grayscale relief image; shaders read it via `.r`. */
export async function loadRelief(src: string, opts: { repeatX?: boolean; anisotropy?: number } = {}): Promise<THREE.DataTexture> {
  const { data, width, height } = await pixels(src);
  const tx = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.magFilter = THREE.LinearFilter;
  tx.generateMipmaps = true;
  if (opts.repeatX) tx.wrapS = THREE.RepeatWrapping;
  if (opts.anisotropy) tx.anisotropy = opts.anisotropy;
  tx.needsUpdate = true;
  return tx;
}
