import { h, openModal, closeModal, toast } from './dom.ts';
import { t } from '../lib/i18n.ts';
import { sfx } from '../lib/sfx.ts';
import { icon } from './icons.ts';

interface Photo { id: number; at: number; url: string; place: string }
const DB = 'pp-photos', STORE = 'photos';

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
/** Resolves once the transaction has committed (not just when the request succeeded). */
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  try {
    return await new Promise((res, rej) => {
      const x = d.transaction(STORE, mode), q = fn(x.objectStore(STORE));
      x.oncomplete = () => res(q.result);
      x.onerror = x.onabort = () => rej(x.error ?? q.error);
    });
  } finally { d.close(); }
}
const photos = {
  /** Rejects when the album can't be read (not the same as an empty album). */
  all: () => tx<Photo[]>('readonly', s => s.getAll() as IDBRequest<Photo[]>).then(a => a.sort((x, y) => y.at - x.at)),
  add: (p: Omit<Photo, 'id'>) => tx('readwrite', s => s.add(p)),
  del: (id: number) => tx('readwrite', s => s.delete(id)),
};

/** What any scene offers the camera: a fresh frame and what the picture shows. */
export interface Shot {
  capture: () => Promise<string>;
  caption: () => Caption | Promise<Caption>;
}
/** Title (the object), where in the app it is, and an honest note about scale. */
interface Caption { title: string; level: string; note?: string }

/** Draw a caption band under the frame so a saved picture explains itself (a small science postcard). */
async function postcard(url: string, c: Caption, when = new Date()): Promise<string> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, u = Math.max(1, W / 1280);
  const band = Math.round(92 * u);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + band;
  const g = cv.getContext('2d');
  if (!g) throw new Error('Cannot create postcard');
  g.drawImage(img, 0, 0);
  g.fillStyle = '#050b14'; g.fillRect(0, H, W, band);
  g.fillStyle = '#f5b544'; g.fillRect(0, H, Math.round(64 * u), Math.max(2, Math.round(3 * u)));
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const pad = Math.round(24 * u);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#f2f6fb';
  g.font = `600 ${Math.round(26 * u)}px ${font}`;
  g.fillText(c.title || c.level, pad, H + Math.round(40 * u), W * 0.62);
  g.fillStyle = '#8fb3cf';
  g.font = `${Math.round(15 * u)}px ${font}`;
  const sub = [c.title ? c.level : '', when.toLocaleDateString(document.documentElement.lang === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'short', day: 'numeric' })].filter(Boolean).join(' · ');
  g.fillText(sub, pad, H + Math.round(66 * u), W * 0.62);
  g.textAlign = 'right';
  if (c.note) { g.fillStyle = '#c9a25a'; g.font = `${Math.round(13 * u)}px ${font}`; g.fillText(c.note, W - pad, H + Math.round(66 * u), W * 0.34); }
  g.fillStyle = '#5ec8ff';
  g.font = `600 ${Math.round(14 * u)}px ${font}`;
  g.fillText('TERRASTRA', W - pad, H + Math.round(40 * u));
  return cv.toDataURL('image/jpeg', 0.9);
}

/** Resolve a pending frame grab, or give up so a paused scene can't hang the shutter. */
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export function openPhotoMode(shot: Shot): void {
  document.body.classList.add('photo-mode');
  const exit = () => { document.body.classList.remove('photo-mode'); bar.remove(); frame.remove(); document.removeEventListener('keydown', esc, true); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); exit(); } };
  document.addEventListener('keydown', esc, true);
  const frame = h('div', { class: 'viewfinder', 'aria-hidden': 'true' }, h('i', { class: 'c tl' }), h('i', { class: 'c tr' }), h('i', { class: 'c bl' }), h('i', { class: 'c br' }));
  let busy = false;
  const bar = h('div', { class: 'photo-bar' },
    h('button', { class: 'pill', 'data-testid': 'photo-album', onclick: () => { exit(); void openAlbum(); }, html: icon('image', 16) }, ' ' + t('album')),
    h('button', { class: 'shutter', 'aria-label': t('shutter'), 'data-testid': 'shutter', onclick: async () => {
      if (busy) return;
      busy = true;
      sfx.shutter();
      frame.classList.add('flash');
      setTimeout(() => frame.classList.remove('flash'), 300);
      try {
        const c = await shot.caption();
        const url = await postcard(await within(shot.capture(), 3000), c);
        await photos.add({ at: Date.now(), url, place: c.title || c.level });
        toast('📸 ' + t('photoSaved'));
      } catch { toast('⚠️ ' + t('photoSaveFail'), 4000); }
      finally { busy = false; }
    } }),
    h('button', { class: 'pill', 'data-testid': 'photo-exit', onclick: exit }, t('close')));
  document.body.append(frame, bar);
}

export async function openAlbum(): Promise<void> {
  let list: Photo[] = [], failed = false;
  try { list = await photos.all(); } catch { failed = true; }
  const grid = h('div', { class: 'album-grid', 'data-testid': 'album-grid' });
  if (failed) grid.append(h('p', { class: 'muted', role: 'alert' }, t('albumFail')));
  else if (!list.length) grid.append(h('p', { class: 'muted' }, t('noPhotos')));
  for (const p of list) {
    grid.append(h('button', { class: 'thumb', onclick: () => view(p) }, h('img', { src: p.url, alt: p.place || t('photoAlt'), loading: 'lazy' })));
  }
  openModal('album', t('album'), grid, { wide: true });
  function view(p: Photo) {
    const dl = h('a', { class: 'pill', href: p.url, download: `terrastra-${p.id}.jpg`, html: icon('download', 16) }, ' ' + t('save'));
    const share = navigator.share ? h('button', { class: 'pill', onclick: async () => {
      const blob = await (await fetch(p.url)).blob();
      await navigator.share({ files: [new File([blob], 'terrastra.jpg', { type: blob.type })], title: t('title') }).catch(() => {});
    }, html: icon('share', 16) }, ' ' + t('share')) : null;
    openModal('photo-view', p.place || t('album'), h('div', { class: 'photo-view' }, h('img', { src: p.url, alt: p.place || t('photoAlt') }),
      h('p', { class: 'muted' }, new Date(p.at).toLocaleString()),
      h('div', { class: 'row' }, dl, share, h('button', { class: 'pill danger', onclick: async () => { try { await photos.del(p.id); } catch { toast('⚠️ ' + t('albumFail')); return; } closeModal('photo-view'); closeModal('album'); void openAlbum(); }, html: icon('trash', 16) }, ' ' + t('del')))), { wide: true });
  }
}
