/** Build-time environment: base path (e.g. "/terrastra/" on GitHub Pages) and whether a backend exists. */
export const BASE = import.meta.env.BASE_URL;
/** `VITE_STATIC=1` builds a backend-less edition (GitHub Pages): no accounts, sync, guestbook or shared counts. */
export const HAS_API = import.meta.env.VITE_STATIC !== '1';
/** Resolves a site-root-relative path ("about/", "data/x.json") against the base path. */
export const url = (path: string): string => BASE + path.replace(/^\//, '');
/** Where the full edition (with the server: accounts, lessons) is, for links from the static edition. */
export const FULL_URL: string = import.meta.env.VITE_FULL_URL ?? '';
