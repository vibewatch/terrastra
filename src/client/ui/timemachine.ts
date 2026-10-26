import { h } from './dom.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { tr, type CatalogueItem } from '../../shared/data/types.ts';
import { STOPS, visibleAt, appearingAt, type Stop } from '../../shared/lib/timeline.ts';
import type { Globe } from '../globe/scene.ts';
import { sfx } from '../lib/sfx.ts';
import { icon } from './icons.ts';

/** Formats a time-machine stop for display. */
function stopLabel(s: Stop): string {
  if (s === 'now') return t('tmNow');
  if (s === 'dino') return t('tmDino');
  return s < 0 ? t('bce', { n: fmtNum(-s) }) : s === 1 ? t('ce1') : String(s);
}

/** Bottom bar with a timeline slider that filters the globe to things that existed at that time. */
export class TimeMachine {
  readonly el = h('div', { class: 'time-bar hidden', 'data-testid': 'time-bar', role: 'group' });
  private idx = STOPS.length - 1;
  constructor(private globe: Globe, private go: (it: CatalogueItem) => void) {}

  get open(): boolean { return !this.el.classList.contains('hidden'); }

  toggle(force?: boolean): void {
    const show = force ?? !this.open;
    this.el.classList.toggle('hidden', !show);
    document.body.classList.toggle('time-travel', show);
    if (show) { this.idx = STOPS.length - 1; this.render(); }
    this.apply(show ? STOPS[this.idx] : 'now');
  }

  refresh(): void { if (this.open) this.render(); }

  private apply(stop: Stop): void {
    this.globe.setItemFilter(stop === 'now' ? null : it => visibleAt(it, stop));
  }

  /** One slider for the bar's lifetime: replacing it while it is dragged or focused would end the drag and drop focus. */
  private readonly range = (() => {
    const r = h('input', { type: 'range', min: '0', max: String(STOPS.length - 1), step: '1', 'data-testid': 'time-range' }) as HTMLInputElement;
    r.addEventListener('input', () => { this.idx = Number(r.value); sfx.tap(); this.apply(STOPS[this.idx]); this.render(); });
    return r;
  })();

  private render(): void {
    const l = lang(), stop = STOPS[this.idx], range = this.range;
    range.value = String(this.idx);
    range.setAttribute('aria-label', t('timeMachine'));
    range.setAttribute('aria-valuetext', stopLabel(stop));
    const shown = CATALOGUE.filter(it => visibleAt(it, stop)).length;
    const fresh = appearingAt(CATALOGUE, this.idx).slice(0, 4);
    for (const n of [...this.el.children]) if (n !== range) n.remove();
    if (!range.isConnected) this.el.append(range);
    range.before(
      h('div', { class: 'time-head' },
        h('span', { class: 'time-ico', html: icon('clock', 16) }),
        h('strong', { class: 'time-year', 'data-testid': 'time-year' }, stopLabel(stop)),
        h('span', { class: 'muted', title: t('tmNote') }, t('tmCount', { n: shown })),
        h('button', { class: 'icon-btn', 'aria-label': t('close'), 'data-testid': 'time-close', html: icon('close', 15), onclick: () => this.toggle(false) })));
    range.after(...[
      h('div', { class: 'time-ticks', 'aria-hidden': 'true' }, ...STOPS.map((s, i) => h('span', { class: i === this.idx ? 'on' : '' }, i === 0 ? h('b', { html: icon('dino', 13) }) : s === 'now' ? '•' : ''))),
      fresh.length ? h('div', { class: 'time-new' }, h('span', { class: 'muted' }, t('tmAppear')),
        ...fresh.map(it => h('button', { class: 'chip chip-ico', title: tr(it.name, l), 'aria-label': tr(it.name, l), onclick: () => this.go(it) }, h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, it.emoji)))) : null,
    ].filter((n): n is HTMLDivElement => !!n));
  }
}
