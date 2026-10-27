/**
 * Folding the item cards (Earth and space share it): a folded card keeps only its type, name and buttons, so the
 * scene gets the screen back without losing what you picked. The choice is remembered, so browsing item after item
 * stays folded until you open one up again. On phones a grip at the top of the sheet folds on a swipe down and
 * unfolds on a swipe up or a tap.
 */
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { t } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { invalidateUI } from './occluders.ts';

const KEY = 'cardMini';
const panels = new Set<HTMLElement>();

const folded = (panel: HTMLElement) => panel.classList.contains('mini');

function setFolded(on: boolean): void {
  save(KEY, on);
  for (const p of panels) {
    p.classList.toggle('mini', on);
    p.querySelectorAll<HTMLButtonElement>('.info-min').forEach(b => sync(b, p));
  }
  invalidateUI();
}

function sync(b: HTMLButtonElement, panel: HTMLElement): void {
  const mini = folded(panel);
  const label = t(mini ? 'cardUnfold' : 'cardFold');
  b.setAttribute('aria-expanded', String(!mini));
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = icon(mini ? 'plus' : 'minus', 16);
}

/** Registers a card panel: applies the remembered state, adds the phone grip and tap-to-unfold on the folded name. */
export function foldable(panel: HTMLElement): void {
  panels.add(panel);
  panel.classList.toggle('mini', load<boolean>(KEY, false));
  const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
  let y0 = NaN;
  grip.addEventListener('pointerdown', e => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointerup', e => {
    const dy = e.clientY - y0;
    y0 = NaN;
    if (Math.abs(dy) < 12) setFolded(!folded(panel));
    else if (dy > 30 && !folded(panel)) setFolded(true);
    else if (dy < -30 && folded(panel)) setFolded(false);
  });
  panel.prepend(grip);
  panel.addEventListener('click', e => {
    if (folded(panel) && (e.target as Element).closest('.info-body')) setFolded(false);
  });
}

/** The fold/unfold button that sits beside the card's close button. */
export function foldButton(panel: HTMLElement): HTMLButtonElement {
  const b = h('button', { class: 'icon-btn info-min', 'data-testid': 'card-fold',
    onclick: (e: Event) => { e.stopPropagation(); setFolded(!folded(panel)); } }) as HTMLButtonElement;
  sync(b, panel);
  return b;
}
