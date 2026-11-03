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

/**
 * A scene failed to load: say so and offer a retry. Browsers may remember a failed module fetch for the
 * life of the page, so a second failure also offers a reload that comes back to the same place (`hash`).
 */
export function showLoadError(what: string, retry: (attempt: number) => void, hash = '', attempt = 1): void {
  document.getElementById('load-error')?.remove();
  const close = () => box.remove();
  const reload = () => { history.replaceState(null, '', location.pathname + location.search + (hash ? '#' + hash : '')); location.reload(); };
  const box = h('div', { id: 'load-error', class: 'load-error', role: 'alert', 'data-testid': 'load-error', 'data-tries': String(attempt) },
    h('p', {}, t('loadFail', { s: what })),
    navigator.onLine ? null : h('p', { class: 'muted small', 'data-testid': 'load-offline' }, t('offlineMissing')),
    h('div', { class: 'row' },
      h('button', { class: 'cta', 'data-testid': 'load-retry', onclick: () => { close(); retry(attempt + 1); } }, t('retry')),
      attempt > 1 ? h('button', { class: 'pill', 'data-testid': 'load-reload', onclick: reload }, t('reloadPage')) : null,
      h('button', { class: 'link', onclick: close }, t('close'))));
  document.body.append(box);
  (box.querySelector('.cta') as HTMLElement).focus();
}
