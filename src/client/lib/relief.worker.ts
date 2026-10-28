/// <reference lib="webworker" />
/** Decodes a grayscale relief image off the main thread and replies with its red channel. */
import { decodeRed } from './relief-decode.ts';

self.onmessage = async (e: MessageEvent<string>) => {
  try {
    const px = await decodeRed(e.data);
    (self as DedicatedWorkerGlobalScope).postMessage(px, [px.data.buffer]);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ error: String(err) });
  }
};
