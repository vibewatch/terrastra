/**
 * The level switcher: one button in the top bar that shows where you are (Earth, Solar System … Universe) and opens a
 * list of every level, from the whole universe down to the Earth. Picking the current level again returns to its
 * overview. Zooming also moves between levels.
 */
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { t, onLang, lang } from '../lib/i18n.ts';
import { sfx } from '../lib/sfx.ts';

export type RailLevel = 'universe' | 'laniakea' | 'group' | 'galaxy' | 'stars' | 'solar' | 'earth';
const RAIL: RailLevel[] = ['universe', 'laniakea', 'group', 'galaxy', 'stars', 'solar', 'earth'];
/** Rough size of each level, shown as a HUD readout next to its name. */
const SPAN: Record<RailLevel, { en: string; zh: string }> = {
  universe: { en: '93 bn ly', zh: '930亿光年' }, laniakea: { en: '520 M ly', zh: '5.2亿光年' }, group: { en: '10 M ly', zh: '1000万光年' },
  galaxy: { en: '87,400 ly', zh: '8.7万光年' }, stars: { en: '130 ly', zh: '130光年' }, solar: { en: '~120 AU', zh: '约120天文单位' }, earth: { en: '12,742 km', zh: '12,742 公里' },
};

const label = (l: RailLevel) => [h('i', { class: 'lv-dot', 'aria-hidden': 'true' }), h('span', { class: 'lv-text' }, h('b', {}, t('sc_' + l)), h('small', {}, SPAN[l][lang()]))];

export class ScaleRail {
  readonly el: HTMLElement;
  private cur: RailLevel = 'earth';
  private btn: HTMLButtonElement;
  private list: HTMLElement;
  private items = new Map<RailLevel, HTMLButtonElement>();

  constructor(go: (l: RailLevel) => void) {
    this.btn = h('button', { class: 'lv-cur', 'data-testid': 'level-switch', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => { sfx.tap(); this.toggle(); } }) as HTMLButtonElement;
    this.list = h('div', { class: 'lv-list hidden', role: 'menu', 'data-testid': 'level-list' });
    for (const l of RAIL) {
      const b = h('button', { class: 'lv-item sr-' + l, role: 'menuitemradio', 'data-testid': 'rail-' + l,
        onclick: () => { this.toggle(false); if (l !== this.cur || l !== 'earth') { sfx.tap(); go(l); } } }) as HTMLButtonElement;
      this.items.set(l, b);
      this.list.append(b);
    }
    this.el = h('nav', { class: 'level-switch', 'data-occludes': true, 'data-testid': 'scale-rail' }, this.btn, this.list);
    this.list.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const all = [...this.items.values()], i = all.indexOf(document.activeElement as HTMLButtonElement);
      all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.open) { e.stopImmediatePropagation(); this.toggle(false); this.btn.focus(); }
    }, true);
    document.addEventListener('pointerdown', e => { if (this.open && !this.el.contains(e.target as Node)) this.toggle(false); }, true);
    this.render();
    onLang(() => this.render());
  }

  get open(): boolean { return !this.list.classList.contains('hidden'); }

  toggle(show = !this.open): void {
    this.list.classList.toggle('hidden', !show);
    this.btn.setAttribute('aria-expanded', String(show));
    this.el.classList.toggle('open', show);
    if (show) requestAnimationFrame(() => this.items.get(this.cur)?.focus());
  }

  set(l: RailLevel): void {
    this.cur = l;
    this.render();
  }

  private render(): void {
    this.el.setAttribute('aria-label', t('scales'));
    this.btn.className = 'lv-cur sr-' + this.cur;
    this.btn.setAttribute('aria-label', `${t('scales')}: ${t('sc_' + this.cur)}`);
    this.btn.title = t('scales');
    this.btn.replaceChildren(...label(this.cur), h('span', { class: 'lv-caret', 'aria-hidden': 'true', html: icon('chevron', 14) }));
    for (const [l, b] of this.items) {
      const on = l === this.cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.replaceChildren(...label(l));
    }
  }
}
