/// <reference lib="webworker" />
/** Paints the globe's land fill and night lights on OffscreenCanvases, off the main thread (see paint-offthread.ts). */
import type { Topology } from 'topojson-specification';
import { loadCountries, paintLand, paintNightLights } from './painter.ts';

export interface LandRequest { topo: Topology; political: boolean; width: number; nightW?: number }
export interface LandReply { land: ImageBitmap; night: ImageBitmap | null }

const bitmap = (cv: HTMLCanvasElement) => (cv as unknown as OffscreenCanvas).transferToImageBitmap();

self.onmessage = (e: MessageEvent<LandRequest>) => {
  const { topo, political, width, nightW } = e.data;
  const scope = self as DedicatedWorkerGlobalScope;
  try {
    const countries = loadCountries(topo);
    const land = bitmap(paintLand(topo, countries, political, width));
    const night = nightW ? bitmap(paintNightLights(countries, nightW)) : null;
    scope.postMessage({ land, night } satisfies LandReply, night ? [land, night] : [land]);
  } catch (err) {
    scope.postMessage({ error: String(err) });
  }
};
