import { h, openModal, closeModal, toast } from './dom.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { store } from '../store.ts';
import { BY_KEY } from '../../shared/data/catalogue.ts';
import { tr, type CatalogueItem } from '../../shared/data/types.ts';
import { PASSPORTS, bookProgress, type PassportBook } from '../../shared/data/passports.ts';
import { haversineKm } from '../../shared/lib/geo.ts';
import { computeExplorerStats, formatFieldLogMarkdown } from '../../shared/lib/field-log.ts';
import { formatCoordPair } from '../../shared/lib/geodesic.ts';
import { isLessonJournal, type LessonJournal } from '../../shared/lib/journal.ts';
import { load, save } from '../lib/storage.ts';
import { sfx } from '../lib/sfx.ts';
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
  let stampFilter: 'all' | 'stamped' | 'unvisited' = 'all';
  const summaryBar = h('div', { class: 'passport-summary', 'data-testid': 'passport-summary' });
  const tabs = h('div', { class: 'seg-row passport-tabs', role: 'tablist' });
  const page = h('div', { class: 'passport-page' });
  const exportMarkdown = () => {
    sfx.tap();
    const rawJ = load<unknown>('lessonJournal', {});
    const j: LessonJournal = isLessonJournal(rawJ) ? rawJ : {};
    const done = load<string[]>('lessonsDone', []);
    const md = formatFieldLogMarkdown(store.progress, j, lang(), Date.now(), done);
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terrastra-field-log-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('passport.exportedMd'));
  };
  const render = () => {
    const l = lang(), seen = store.progress.seen;
    const rawJ = load<unknown>('lessonJournal', {});
    const done = load<string[]>('lessonsDone', []);
    const stats = computeExplorerStats(store.progress, isLessonJournal(rawJ) ? rawJ : undefined, done);
    const peakM = stats.highestPeak?.facts?.heightM;
    summaryBar.replaceChildren(
      h('div', { class: 'passport-summary-text' },
        h('strong', { 'data-testid': 'passport-summary-stats' }, t('passport.summaryStats', {
          cont: stats.continentsVisited.length,
          countries: stats.countriesVisited.length,
          stamps: stats.stampsCount,
        })),
        stats.northernmost && stats.southernmost ? h('small', { class: 'muted', 'data-testid': 'passport-extremes' }, t('passport.extremes', {
          north: `${stats.northernmost.emoji} ${tr(stats.northernmost.name, l)} (${formatCoordPair(stats.northernmost.lat, stats.northernmost.lon)})`,
          south: `${stats.southernmost.emoji} ${tr(stats.southernmost.name, l)} (${formatCoordPair(stats.southernmost.lat, stats.southernmost.lon)})`,
        })) : null,
        stats.highestPeak && typeof peakM === 'number' ? h('small', { class: 'muted', 'data-testid': 'passport-highest-peak' }, t('passport.highestPeak', {
          name: `${stats.highestPeak.emoji} ${tr(stats.highestPeak.name, l)}`,
          m: fmtNum(peakM),
        })) : null,
        stats.antipodalPair && stats.antipodalSpanKm > 0 ? h('small', { class: 'muted', 'data-testid': 'passport-span' }, t('passport.span', {
          km: fmtNum(stats.antipodalSpanKm),
          a: `${stats.antipodalPair[0].emoji} ${tr(stats.antipodalPair[0].name, l)}`,
          b: `${stats.antipodalPair[1].emoji} ${tr(stats.antipodalPair[1].name, l)}`,
        })) : null),
      h('button', {
        class: 'pill pill-sm',
        'data-testid': 'passport-export-md',
        onclick: exportMarkdown,
      }, h('span', { html: icon('download', 13) }), ' ', t('passport.exportMd')),
    );
    const b = PASSPORTS.find(x => x.id === cur)!;
    tabs.replaceChildren(...PASSPORTS.map(x => {
      const done = bookProgress(x, seen);
      return h('button', { class: 'pill' + (x.id === cur ? ' active' : '') + (done === x.keys.length ? ' done' : ''), role: 'tab', 'aria-selected': String(x.id === cur), 'data-testid': 'book-' + x.id,
        onclick: () => { cur = x.id; save('passportBook', cur); render(); } }, h('span', { class: 'holo', 'aria-hidden': 'true' }, x.emoji), ' ' + tr(x.name, l), h('small', {}, ` ${done}/${x.keys.length}`));
    }));
    const got = bookProgress(b, seen);
    const next = nextStop(b, seen, hooks.here());
    const bookItems = b.keys.map(k => BY_KEY.get(k)).filter((x): x is CatalogueItem => !!x);
    if (stampFilter === 'stamped' && got === 0) stampFilter = 'all';
    if (stampFilter === 'unvisited' && got === bookItems.length) stampFilter = 'all';
    const filteredItems = bookItems.filter(it => {
      const has = Boolean(seen[it.key]);
      return stampFilter === 'all' ? true : stampFilter === 'stamped' ? has : !has;
    });
    page.replaceChildren(
      h('div', { class: 'passport-head' },
        h('div', {},
          h('h3', {}, h('span', { class: 'holo', 'aria-hidden': 'true' }, b.emoji), ' ' + tr(b.name, l)),
          h('p', { class: 'muted' }, t('stamps', { n: got, t: b.keys.length }))),
        next ? h('button', { class: 'cta cta-sm', 'data-testid': 'next-stop', html: icon('arrow', 15),
          onclick: () => { closeModal('passport'); closeModal('collection'); hooks.travel(next, hooks.here()); } }, h('span', {}, t('nextStop', { p: tr(next.name, l) })))
          : h('span', { class: 'ok' }, t('bookDone'))),
      h('div', { class: 'passport-bar' }, h('span', { style: `width:${(100 * got / b.keys.length).toFixed(1)}%` })),
      h('div', { class: 'passport-filter-row', 'data-testid': 'passport-filters' },
        ...([
          { id: 'all' as const, label: t('passport.filterAll', { n: bookItems.length }) },
          { id: 'stamped' as const, label: t('passport.filterStamped', { n: got }), hide: got === 0 },
          { id: 'unvisited' as const, label: t('passport.filterUnvisited', { n: bookItems.length - got }), hide: got === bookItems.length },
        ]).filter(x => !x.hide).map(f => h('button', {
          type: 'button',
          class: 'pill pill-sm' + (stampFilter === f.id ? ' on' : ''),
          'aria-pressed': String(stampFilter === f.id),
          'data-testid': 'passport-filter-' + f.id,
          onclick: () => { stampFilter = f.id; render(); },
        }, f.label))),
      h('div', { class: 'stamp-grid' }, ...filteredItems.map((it, i) => {
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
  openModal('passport', t('passport'), h('div', { class: 'passport' }, summaryBar, tabs, page), { wide: true });
}
