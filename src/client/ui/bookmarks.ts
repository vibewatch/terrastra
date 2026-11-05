/** Saved views: keep a place, object or sky event on this device and share a link that reopens it. */
import { h, openModal, closeModal, toast } from './dom.ts';
import { icon } from './icons.ts';
import { t, lang } from '../lib/i18n.ts';
import { tr, type Lang } from '../../shared/data/types.ts';
import { bookmarks, addBookmark, removeBookmark, encodeView, viewUrl, type Bookmark } from '../lib/viewlink.ts';

export interface BookmarkHost {
  /** What is on screen now, or null when there is nothing worth saving (a game, a loading scene). */
  current: () => Promise<Bookmark | null>;
  open: (hash: string) => void;
}

export async function copyText(text: string, okMsg: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { prompt(okMsg, text); }
}

function formatBmCoord(b: Bookmark): string {
  if (!b.cam) return b.route.split('/')[0] || 'globe';
  const { lat, lon } = b.cam;
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function formatBookmarksMarkdown(bs: readonly Bookmark[], l: Lang = lang()): string {
  const title = l === 'zh' ? '# 寰星收藏视图行程单' : '# Terrastra Saved Views Itinerary';
  const lines = [title, ''];
  bs.forEach((b, idx) => {
    const dateStr = new Date(b.at).toISOString().slice(0, 10);
    const meta = formatBmCoord(b);
    lines.push(`${idx + 1}. **${tr(b.label, l)}** (${meta} · ${dateStr}) — \`#${encodeView(b)}\``);
  });
  lines.push('');
  return lines.join('\n');
}

export function openBookmarks(host: BookmarkHost): void {
  const list = h('div', { class: 'tour-list bm-list', 'data-testid': 'bm-list' });
  const exportBtn = h('button', {
    class: 'pill',
    'data-testid': 'bm-export-md',
    onclick: () => {
      const bs = bookmarks();
      if (!bs.length) { toast(t('bmNothing')); return; }
      void copyText(formatBookmarksMarkdown(bs, lang()), t('bmExportedMd'));
    },
  }, h('span', { html: icon('book', 15) }), t('bmExportMd')) as HTMLButtonElement;

  const row = (b: Bookmark) => {
    const dateStr = new Date(b.at).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en');
    const subStr = `${formatBmCoord(b)} · ${dateStr}`;
    return h('div', { class: 'tour-row' },
      h('button', { class: 'tour-pick', 'data-testid': 'bm-open', onclick: () => { closeModal('bookmarks'); host.open(encodeView(b)); } },
        h('span', { class: 'tile', html: icon(b.route.startsWith('sky') ? 'eclipse' : /^(solar|nearbystars|milkyway|localgroup|laniakea|universe)/.test(b.route) ? 'planet' : 'pin', 20) }),
        h('span', { class: 'grow' }, h('strong', {}, tr(b.label, lang())), h('span', { class: 'muted small' }, subStr))),
      h('button', { class: 'icon-btn tour-link', 'aria-label': t('bmCopy'), title: t('bmCopy'), html: icon('share', 16), onclick: () => void copyText(viewUrl(b), t('bmCopied')) }),
      h('button', { class: 'icon-btn tour-link', 'data-testid': 'bm-remove', 'aria-label': t('bmRemove'), title: t('bmRemove'), html: icon('trash', 16), onclick: () => { removeBookmark(b); render(); } }));
  };
  const render = () => {
    const bs = bookmarks();
    exportBtn.disabled = bs.length === 0;
    list.replaceChildren(...(bs.length ? bs.map(row) : [h('p', { class: 'muted' }, t('bmEmpty'))]));
  };
  const here = async (fn: (b: Bookmark) => void) => {
    const b = await host.current();
    if (b) fn(b); else toast(t('bmNothing'));
  };
  render();
  openModal('bookmarks', t('bookmarks'), h('div', {},
    h('p', { class: 'muted' }, t('bmIntro')),
    h('div', { class: 'row bm-actions' },
      h('button', { class: 'pill', 'data-testid': 'bm-save', onclick: () => void here(b => { addBookmark(b); render(); toast(t('bmSaved')); }) }, h('span', { html: icon('pin', 15) }), t('bmSave')),
      h('button', { class: 'pill', 'data-testid': 'bm-share', onclick: () => void here(b => void copyText(viewUrl(b), t('bmCopied'))) }, h('span', { html: icon('share', 15) }), t('bmCopy')),
      exportBtn),
    list));
}
