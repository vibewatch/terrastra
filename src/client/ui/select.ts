/**
 * The app's dropdown, used instead of the native <select> so every picker carries the HUD look.
 * Follows the WAI-ARIA "select-only combobox" pattern: focus stays on the trigger, the active option is
 * announced with aria-activedescendant. The list opens in the top layer (popover) so clip-path slabs and
 * scrolling panels never cut it off; it stays a DOM child of the picker, so "click outside" checks of the
 * menu, hub and modals still see it as inside.
 */
import { h } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { sfx } from '../lib/sfx.ts';

interface SelectOption { value: string; label: string }
interface SelectOpts {
  options: SelectOption[];
  value: string;
  /** Accessible name of the picker. */
  label: string;
  onChange: (value: string) => void;
  testid?: string;
  className?: string;
  /** Leading icon inside the trigger. */
  icon?: IconName;
  /** Shown when no option matches the value. */
  placeholder?: string;
}

let uid = 0;
const POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

export class Select {
  readonly el: HTMLElement;
  private btn: HTMLButtonElement;
  private text: HTMLElement;
  private list: HTMLElement;
  private opts: SelectOption[];
  private cur: string;
  private active = -1;
  private typed = '';
  private typedAt = 0;
  private id = 'xsel-' + ++uid;

  constructor(private o: SelectOpts) {
    this.opts = o.options;
    this.cur = o.value;
    this.text = h('span', { class: 'xsel-text' });
    this.btn = h('button', {
      type: 'button', class: 'xsel-btn', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': this.id,
      'aria-label': o.label, 'data-testid': o.testid,
      onclick: () => { sfx.tap(); this.toggle(); },
    },
      o.icon ? h('span', { class: 'xsel-ico', html: icon(o.icon, 15) }) : null,
      this.text,
      h('span', { class: 'xsel-caret', 'aria-hidden': 'true' })) as HTMLButtonElement;
    this.list = h('div', { id: this.id, class: 'xsel-list', role: 'listbox', 'aria-label': o.label, tabindex: '-1', popover: POPOVER ? 'manual' : undefined });
    // keep focus on the trigger while the list is clicked
    this.list.addEventListener('mousedown', e => e.preventDefault());
    this.el = h('div', { class: 'xsel' + (o.className ? ' ' + o.className : '') }, this.btn, this.list);
    this.btn.addEventListener('keydown', this.onKey);
    this.paint();
  }

  get value(): string { return this.cur; }
  set value(v: string) { this.cur = v; this.paint(); }
  get open(): boolean { return this.btn.getAttribute('aria-expanded') === 'true'; }

  setOptions(options: SelectOption[], value = this.cur): void {
    this.opts = options;
    this.cur = value;
    this.paint();
    if (this.open) this.renderList();
  }

  private paint(): void {
    const hit = this.opts.find(x => x.value === this.cur);
    this.text.textContent = hit?.label ?? this.o.placeholder ?? '';
    this.btn.dataset.value = this.cur;
    this.btn.classList.toggle('xsel-empty', !hit);
  }

  private renderList(): void {
    this.list.replaceChildren(...this.opts.map((x, i) => h('div', {
      id: `${this.id}-${i}`, class: 'xsel-opt', role: 'option', 'data-value': x.value, 'aria-selected': String(x.value === this.cur),
      onclick: () => this.pick(i),
      onpointermove: () => this.setActive(i, false),
    }, h('span', {}, x.label))));
  }

  toggle(show = !this.open): void {
    if (show === this.open) return;
    this.btn.setAttribute('aria-expanded', String(show));
    this.el.classList.toggle('open', show);
    if (show) {
      this.renderList();
      this.list.classList.add('on');
      if (POPOVER) this.list.showPopover();
      this.place();
      this.setActive(Math.max(0, this.opts.findIndex(x => x.value === this.cur)));
      document.addEventListener('pointerdown', this.onOutside, true);
      addEventListener('scroll', this.onScroll, true);
      addEventListener('resize', this.onResize);
    } else {
      this.list.classList.remove('on');
      if (POPOVER && this.list.matches(':popover-open')) this.list.hidePopover();
      this.btn.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', this.onOutside, true);
      removeEventListener('scroll', this.onScroll, true);
      removeEventListener('resize', this.onResize);
    }
  }

  /** Below the trigger, or above it when there is more room there; never off-screen. */
  private place(): void {
    const r = this.btn.getBoundingClientRect(), vh = innerHeight, vw = innerWidth, gap = 4;
    const below = vh - r.bottom - gap - 8, above = r.top - gap - 8;
    const want = Math.min(this.list.scrollHeight, 320);
    const up = below < want && above > below;
    const s = this.list.style;
    s.minWidth = r.width + 'px';
    s.maxHeight = Math.max(120, Math.min(320, up ? above : below)) + 'px';
    if (!POPOVER) { s.top = up ? 'auto' : `calc(100% + ${gap}px)`; s.bottom = up ? `calc(100% + ${gap}px)` : 'auto'; return; }
    const w = this.list.offsetWidth;
    s.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    s.top = up ? 'auto' : r.bottom + gap + 'px';
    s.bottom = up ? vh - r.top + gap + 'px' : 'auto';
  }

  private setActive(i: number, scroll = true): void {
    if (i < 0 || i >= this.opts.length) return;
    this.active = i;
    const kids = this.list.children;
    for (let k = 0; k < kids.length; k++) kids[k].classList.toggle('active', k === i);
    this.btn.setAttribute('aria-activedescendant', `${this.id}-${i}`);
    if (scroll) (kids[i] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }

  private pick(i: number): void {
    const v = this.opts[i]?.value;
    this.toggle(false);
    this.btn.focus();
    if (v === undefined || v === this.cur) return;
    sfx.tap();
    this.value = v;
    this.o.onChange(v);
  }

  private onOutside = (e: Event): void => { if (!this.el.contains(e.target as Node)) this.toggle(false); };
  private onScroll = (e: Event): void => { if (e.target !== this.list) this.place(); };
  private onResize = (): void => this.toggle(false);

  private onKey = (e: KeyboardEvent): void => {
    const n = this.opts.length;
    const keys: Record<string, () => void> = this.open ? {
      ArrowDown: () => this.setActive(Math.min(n - 1, this.active + 1)),
      ArrowUp: () => this.setActive(Math.max(0, this.active - 1)),
      Home: () => this.setActive(0),
      End: () => this.setActive(n - 1),
      PageDown: () => this.setActive(Math.min(n - 1, this.active + 8)),
      PageUp: () => this.setActive(Math.max(0, this.active - 8)),
      Enter: () => this.pick(this.active),
      ' ': () => this.typed ? this.type(' ') : this.pick(this.active),
      Escape: () => this.toggle(false),
    } : {
      ArrowDown: () => this.toggle(true), ArrowUp: () => this.toggle(true), Enter: () => this.toggle(true), ' ': () => this.toggle(true),
    };
    if (e.key === 'Tab') { this.toggle(false); return; }
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); this.type(e.key); }
  };

  /** Typeahead: jump to the first option starting with what was typed in the last half second. */
  private type(ch: string): void {
    const now = performance.now();
    this.typed = (now - this.typedAt > 500 ? '' : this.typed) + ch.toLowerCase();
    this.typedAt = now;
    const norm = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
    const start = this.typed.length === 1 ? this.active + 1 : this.active;
    for (let k = 0; k < this.opts.length; k++) {
      const i = (start + k) % this.opts.length;
      if (norm(this.opts[i].label).startsWith(this.typed)) {
        if (this.open) this.setActive(i);
        else { this.value = this.opts[i].value; this.o.onChange(this.cur); }
        return;
      }
    }
  }
}
