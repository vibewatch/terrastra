import { h } from './dom.ts';
import { t } from '../lib/i18n.ts';

/** Memoise a lazy load, but forget a failure so the next call really tries again. */
export function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => p ??= load().catch((e: unknown) => { p = null; throw e; });
}

let busy = 0;
/** Show the “loading a scene” cue while `p` runs. */
export async function withBusy<T>(p: Promise<T>): Promise<T> {
  if (busy++ === 0) document.body.classList.add('scene-loading');
  try { return await p; } finally { if (--busy === 0) document.body.classList.remove('scene-loading'); }
}

const RELOAD_KEY = 'pp.buildReload';

function currentEntryScript(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return el ? new URL(el.getAttribute('src')!, location.href).pathname : null;
}

/**
 * Checks whether a newer deployment is live on the server by comparing the entry module script in fresh `index.html`
 * against the running page's entry module script. If a new build was deployed (causing old lazy chunk hashes to 404),
 * reloads once into the new build (preserving `hash`).
 */
export async function reloadIfBuildChanged(hash = ''): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.onLine) return false;
  const cur = currentEntryScript();
  if (!cur) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    if (Date.now() - last < 15_000) return false;
    const res = await fetch(location.pathname, { cache: 'no-store' });
    if (!res.ok) return false;
    const html = await res.text();
    const m = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/i.exec(html);
    if (!m) return false;
    const next = new URL(m[1], location.href).pathname;
    if (next && next !== cur) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      if (hash) history.replaceState(null, '', location.pathname + location.search + '#' + hash);
      location.reload();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    void reloadIfBuildChanged(location.hash.slice(1));
  });
}

/**
 * A scene failed to load: say so and offer a retry. Browsers may remember a failed module fetch for the
 * life of the page, so a failure also offers a reload that comes back to the same place (`hash`).
 */
export function showLoadError(what: string, retry: (attempt: number) => void, hash = '', attempt = 1): void {
  void reloadIfBuildChanged(hash).then(reloading => {
    if (reloading) return;
    document.getElementById('load-error')?.remove();
    const close = () => box.remove();
    const reload = () => { history.replaceState(null, '', location.pathname + location.search + (hash ? '#' + hash : '')); location.reload(); };
    const box = h('div', { id: 'load-error', class: 'load-error', role: 'alert', 'data-testid': 'load-error', 'data-tries': String(attempt) },
      h('p', {}, t('loadFail', { s: what })),
      navigator.onLine ? null : h('p', { class: 'muted small', 'data-testid': 'load-offline' }, t('offlineMissing')),
      h('div', { class: 'row' },
        h('button', { class: 'cta', 'data-testid': 'load-retry', onclick: () => { close(); retry(attempt + 1); } }, t('retry')),
        h('button', { class: 'pill', 'data-testid': 'load-reload', onclick: reload }, t('reloadPage')),
        h('button', { class: 'link', onclick: close }, t('close'))));
    document.body.append(box);
    (box.querySelector('.cta') as HTMLElement).focus();
  });
}
