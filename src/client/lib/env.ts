/** Build-time environment: base path (e.g. "/terrastra/" on GitHub Pages) and whether a backend exists. */
const BASE = import.meta.env.BASE_URL;
/** `VITE_STATIC=1` builds a backend-less edition (GitHub Pages): no accounts, sync, guestbook or shared counts. */
export const HAS_API = import.meta.env.VITE_STATIC !== '1';
/** `VITE_PAYWALL_DEMO=1` enables teaser locks on a static showcase build and points locked items to `FULL_APP_URL`. */
export const PAYWALL_DEMO = import.meta.env.VITE_PAYWALL_DEMO === '1';
export const FULL_APP_URL = String(import.meta.env.VITE_FULL_APP_URL ?? '').trim();
/** Resolves a site-root-relative path ("about/", "data/x.json") against the base path. */
export const url = (path: string): string => BASE + path.replace(/^\//, '');

