/** A single-channel image, rows ordered bottom-up (texture space, so no upload-time flip is needed). */
export interface RedPixels { data: Uint8Array; width: number; height: number }

/** Fetches and decodes an image, keeping only its red channel (the relief maps are grayscale). */
export async function decodeRed(src: string): Promise<RedPixels> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${res.status} ${src}`);
  const bmp = await createImageBitmap(await res.blob());
  const { width, height } = bmp;
  const cv = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const src0 = (height - 1 - y) * width * 4, dst0 = y * width;
    for (let x = 0; x < width; x++) data[dst0 + x] = rgba[src0 + x * 4];
  }
  return { data, width, height };
}
