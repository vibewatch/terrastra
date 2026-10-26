import { h, openModal, closeModal } from './dom.ts';
import { t, lang } from '../lib/i18n.ts';
import { store } from '../store.ts';
import { BY_KEY } from '../../shared/data/catalogue.ts';
import { tr, type CatalogueItem } from '../../shared/data/types.ts';
import { PASSPORTS, bookProgress, type PassportBook } from '../../shared/data/passports.ts';
import { haversineKm } from '../../shared/lib/geo.ts';
import { load, save } from '../lib/storage.ts';
import { icon } from './icons.ts';

interface PassportHooks {
  /** current globe position, used to pick the nearest next stop */
  here: () => [number, number];
  /** fly to an item and open its card, drawing a flight arc from `from` */
  travel: (it: CatalogueItem, from: [number, number]) => void;
}

/** Unstamped place in the book closest to `here`. */
function nextStop(b: PassportBook, seen: Record<string, number>, here: [number, number]): CatalogueItem | null {
  let best: CatalogueItem | null = null, bestKm = Infinity;
  for (const k of b.keys) {
    if (k in seen) continue;
    const it = BY_KEY.get(k);
    if (!it) continue;
    const km = haversineKm(here[0], here[1], it.lat, it.lon);
    if (km < bestKm) { bestKm = km; best = it; }
  }
  return best;
}

export function openPassport(hooks: PassportHooks): void {
  let cur = load<string>('passportBook', PASSPORTS[0].id);
  if (!PASSPORTS.some(b => b.id === cur)) cur = PASSPORTS[0].id;
  const tabs = h('div', { class: 'seg-row passport-tabs', role: 'tablist' });
  const page = h('div', { class: 'passport-page' });
  const render = () => {
    const l = lang(), seen = store.progress.seen;
    const b = PASSPORTS.find(x => x.id === cur)!;
    tabs.replaceChildren(...PASSPORTS.map(x => {
      const done = bookProgress(x, seen);
      return h('button', { class: 'pill' + (x.id === cur ? ' active' : '') + (done === x.keys.length ? ' done' : ''), role: 'tab', 'aria-selected': String(x.id === cur), 'data-testid': 'book-' + x.id,
        onclick: () => { cur = x.id; save('passportBook', cur); render(); } }, h('span', { class: 'holo', 'aria-hidden': 'true' }, x.emoji), ' ' + tr(x.name, l), h('small', {}, ` ${done}/${x.keys.length}`));
    }));
    const got = bookProgress(b, seen);
    const next = nextStop(b, seen, hooks.here());
    page.replaceChildren(
      h('div', { class: 'passport-head' },
        h('div', {},
          h('h3', {}, h('span', { class: 'holo', 'aria-hidden': 'true' }, b.emoji), ' ' + tr(b.name, l)),
          h('p', { class: 'muted' }, t('stamps', { n: got, t: b.keys.length }))),
        next ? h('button', { class: 'cta cta-sm', 'data-testid': 'next-stop', html: icon('arrow', 15),
          onclick: () => { closeModal('passport'); closeModal('collection'); hooks.travel(next, hooks.here()); } }, h('span', {}, t('nextStop', { p: tr(next.name, l) })))
          : h('span', { class: 'ok' }, t('bookDone'))),
      h('div', { class: 'passport-bar' }, h('span', { style: `width:${(100 * got / b.keys.length).toFixed(1)}%` })),
      h('div', { class: 'stamp-grid' }, ...b.keys.map(k => BY_KEY.get(k)).filter((x): x is CatalogueItem => !!x).map((it, i) => {
        const at = seen[it.key];
        return h('button', { class: 'stamp' + (at ? ' have' : ''), 'data-testid': 'stamp-' + it.key, style: `--r:${((i * 37) % 13) - 6}deg`,
          onclick: () => { closeModal('passport'); closeModal('collection'); hooks.travel(it, hooks.here()); } },
          h('span', { class: 'stamp-emoji', 'aria-hidden': 'true' }, it.emoji),
          h('span', { class: 'stamp-name' }, tr(it.name, l)),
          h('small', {}, at ? new Date(at).toLocaleDateString(l) : '—'));
      })));
  };
  render();
  requestAnimationFrame(() => tabs.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  openModal('passport', t('passport'), h('div', { class: 'passport' }, tabs, page), { wide: true });
}
