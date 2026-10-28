/**
 * Runs the expensive part of the Earth painting (the per-pixel satellite land fill, the night lights) in a worker,
 * then seeds the painter's caches with the results so `paintEarth` / `paintNightLights` only have the cheap work
 * left. Resolves false where workers can't paint (no OffscreenCanvas): the painters then do it all on the page.
 */
import type { Topology } from 'topojson-specification';
import { primeLand, primeNightLights, type CountryInfo } from './painter.ts';
import type { LandReply, LandRequest } from './paint.worker.ts';

const toCanvas = (bmp: ImageBitmap): HTMLCanvasElement => {
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  cv.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return cv;
};

export function paintOffThread(topo: Topology, countries: CountryInfo[], req: Omit<LandRequest, 'topo'>): Promise<boolean> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>(ok => {
    let w: Worker;
    try { w = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module' }); } catch { ok(false); return; }
    const done = (v: boolean) => { w.terminate(); ok(v); };
    w.onerror = () => done(false);
    w.onmessage = (e: MessageEvent<LandReply | { error: string }>) => {
      if ('error' in e.data) { done(false); return; }
      const { land, night } = e.data;
      primeLand(countries, req.political, toCanvas(land));
      if (night) primeNightLights(toCanvas(night));
      done(true);
    };
    w.postMessage({ topo, ...req } satisfies LandRequest);
  });
}
