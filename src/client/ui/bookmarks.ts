/** Saved views: keep a place, object or sky event on this device and share a link that reopens it. */
import { h, openModal, closeModal, toast, copyText } from './dom.ts';
import { icon } from './icons.ts';
import { t, lang } from '../lib/i18n.ts';
import { tr, type Lang } from '../../shared/data/types.ts';
import { bookmarks, addBookmark, removeBookmark, renameBookmark, encodeView, viewUrl, type Bookmark } from '../lib/viewlink.ts';
import { scheduleSync } from '../store.ts';

export interface BookmarkHost {
  /** What is on screen now, or null when there is nothing worth saving (a game, a loading scene). */
  current: () => Promise<Bookmark | null>;
  open: (hash: string) => void;
}

export { copyText };

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
    const hash = `#${encodeView(b)}`;
    const link = typeof location !== 'undefined' && location.origin && location.origin !== 'null'
      ? `[**${tr(b.label, l)}**](${viewUrl(b)})`
      : `**${tr(b.label, l)}**`;
    lines.push(`${idx + 1}. ${link} (${meta} · ${dateStr}) — \`${hash}\``);
  });
  lines.push('');
  return lines.join('\n');
}

export function openBookmarks(host: BookmarkHost): void {
  let query = '';
  let editingKey: string | null = null;
  const list = h('div', { class: 'tour-list bm-list', 'data-testid': 'bm-list' });
  const searchInp = h('input', {
    class: 'search-input',
    type: 'search',
    placeholder: t('bmSearch'),
    'aria-label': t('bmSearch'),
    'data-testid': 'bm-search',
    style: 'width:100%;margin:8px 0 6px',
    oninput: (e: Event) => {
      query = (e.target as HTMLInputElement).value;
      render();
    },
  }) as HTMLInputElement;
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
    const key = encodeView(b);
    const dateStr = new Date(b.at).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en');
    const subStr = `${formatBmCoord(b)} · ${dateStr}`;
    if (editingKey === key) {
      const inp = h('input', {
        class: 'search-input grow',
        type: 'text',
        value: tr(b.label, lang()),
        maxLength: '120',
        'aria-label': t('bmRename'),
        'data-testid': 'bm-rename-input',
        onkeydown: (e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter') { ke.preventDefault(); commit(); }
          else if (ke.key === 'Escape') { ke.preventDefault(); editingKey = null; render(); }
        },
      }) as HTMLInputElement;
      const commit = () => {
        if (renameBookmark(b, inp.value)) {
          scheduleSync();
          toast(t('bmRenamed'));
        }
        editingKey = null;
        render();
      };
      setTimeout(() => inp.select(), 0);
      return h('div', { class: 'tour-row', style: 'gap:6px;padding:6px' },
        inp,
        h('button', { class: 'pill pill-sm', 'data-testid': 'bm-rename-save', onclick: commit }, t('done')),
        h('button', { class: 'pill pill-sm', onclick: () => { editingKey = null; render(); } }, t('cancel')));
    }
    return h('div', { class: 'tour-row' },
      h('button', { class: 'tour-pick', 'data-testid': 'bm-open', onclick: () => { closeModal('bookmarks'); host.open(key); } },
        h('span', { class: 'tile', html: icon(b.route.startsWith('sky') ? 'eclipse' : /^(solar|nearbystars|milkyway|localgroup|laniakea|universe)/.test(b.route) ? 'planet' : 'pin', 20) }),
        h('span', { class: 'grow' }, h('strong', {}, tr(b.label, lang())), h('span', { class: 'muted small' }, subStr))),
      h('button', { class: 'icon-btn tour-link', 'data-testid': 'bm-rename', 'aria-label': t('bmRename'), title: t('bmRename'), html: icon('tag', 16), onclick: () => { editingKey = key; render(); } }),
      h('button', { class: 'icon-btn tour-link', 'aria-label': t('bmCopy'), title: t('bmCopy'), html: icon('share', 16), onclick: () => void copyText(viewUrl(b), t('bmCopied')) }),
      h('button', { class: 'icon-btn tour-link', 'data-testid': 'bm-remove', 'aria-label': t('bmRemove'), title: t('bmRemove'), html: icon('trash', 16), onclick: () => { removeBookmark(b); scheduleSync(); render(); } }));
  };
  const render = () => {
    const all = bookmarks();
    exportBtn.disabled = all.length === 0;
    searchInp.style.display = all.length > 1 || query.trim().length > 0 ? '' : 'none';
    const q = query.trim().toLowerCase();
    const bs = q
      ? all.filter(b => `${b.label.en} ${b.label.zh ?? ''} ${b.route} ${formatBmCoord(b)}`.toLowerCase().includes(q))
      : all;
    list.replaceChildren(...(bs.length ? bs.map(row) : [h('p', { class: 'muted' }, all.length ? t('dexEmptyFilter') : t('bmEmpty'))]));
  };
  const here = async (fn: (b: Bookmark) => void) => {
    const b = await host.current();
    if (b) fn(b); else toast(t('bmNothing'));
  };
  render();
  openModal('bookmarks', t('bookmarks'), h('div', {},
    h('p', { class: 'muted' }, t('bmIntro')),
    h('div', { class: 'row bm-actions' },
      h('button', { class: 'pill', 'data-testid': 'bm-save', onclick: () => void here(b => { addBookmark(b); scheduleSync(); render(); toast(t('bmSaved')); }) }, h('span', { html: icon('pin', 15) }), t('bmSave')),
      h('button', { class: 'pill', 'data-testid': 'bm-share', onclick: () => void here(b => void copyText(viewUrl(b), t('bmCopied'))) }, h('span', { html: icon('share', 15) }), t('bmCopy')),
      exportBtn),
    searchInp,
    list));
}
