/// <reference lib="webworker" />
import type { BodyId } from '../../shared/data/solar.ts';
import { paintBody, paintRings } from './paint.ts';

// Paints body surface maps off the main thread; replies with transferable buffers.
export interface PaintRequest { id: BodyId; w: number; rings: boolean }
export interface PaintReply {
  id: BodyId; w: number; h: number; ms: number;
  color: Uint8ClampedArray; height: Uint8Array | null; rings: Uint8ClampedArray | null;
}

self.onmessage = (e: MessageEvent<PaintRequest>) => {
  const { id, w, rings } = e.data;
  const t0 = performance.now();
  const m = paintBody(id, w);
  const r = rings ? paintRings(id, 1024) : null;
  const reply: PaintReply = { id, w: m.w, h: m.h, ms: performance.now() - t0, color: m.color, height: m.height, rings: r };
  const transfer: Transferable[] = [m.color.buffer];
  if (m.height) transfer.push(m.height.buffer);
  if (r) transfer.push(r.buffer);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply, transfer);
};
