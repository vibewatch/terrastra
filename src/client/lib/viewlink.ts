/**
 * Saved views and share links. A link is the scene route (item key, `solar/mars`,
 * `sky/<id>`…) plus an optional versioned camera suffix for the globe:
 * `#paris@v1:48.86,2.35,0.800`. Unknown versions or bad numbers drop the camera
 * and keep the route, so old or mangled links still open something sensible.
 */
import type { I18n } from '../../shared/data/types.ts';
import { load, save } from './storage.ts';

const VIEW_VERSION = 1;
const MAX = 40;

interface Cam { lat: number; lon: number; h: number }
export interface View { route: string; cam?: Cam }
export interface Bookmark extends View { label: I18n; at: number }

const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN);

/** Split a decoded hash into its route and camera. `bad` is set when a camera suffix was present but unusable. */
export function parseView(hash: string): View & { bad: boolean } {
  const at = hash.lastIndexOf('@');
  if (at < 0) return { route: hash, bad: false };
  const route = hash.slice(0, at), tail = hash.slice(at + 1);
  const m = /^v(\d+):([^,]+),([^,]+),([^,]+)$/.exec(tail);
  if (!m || Number(m[1]) !== VIEW_VERSION) return { route, bad: true };
  const [lat, lon, h] = [num(m[2]), num(m[3]), num(m[4])];
  if (![lat, lon, h].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 360 || h <= 0) return { route, bad: true };
  return { route, cam: { lat: Math.max(-85, Math.min(85, lat)), lon: Math.abs(lon) > 180 ? ((lon + 540) % 360) - 180 : lon, h: Math.min(h, 20) }, bad: false };
}

export function encodeView(v: View): string {
  const c = v.cam;
  return v.route + (c ? `@v${VIEW_VERSION}:${c.lat.toFixed(2)},${c.lon.toFixed(2)},${c.h.toFixed(3)}` : '');
}

export function viewUrl(v: View): string {
  return location.origin + location.pathname + location.search + '#' + encodeView(v);
}

export const bookmarks = (): Bookmark[] => load<Bookmark[]>('bookmarks', []).filter(b => b && typeof b.route === 'string' && b.label);

/** Save a view (newest first). Saving the same place again moves it to the top. */
export function addBookmark(b: Bookmark): void {
  const key = encodeView(b);
  save('bookmarks', [b, ...bookmarks().filter(x => encodeView(x) !== key)].slice(0, MAX));
}

export function removeBookmark(b: View): void {
  const key = encodeView(b);
  save('bookmarks', bookmarks().filter(x => encodeView(x) !== key));
}
