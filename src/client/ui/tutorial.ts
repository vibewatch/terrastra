import { h, confetti, trapTab } from './dom.ts';
import { t } from '../lib/i18n.ts';
import { save } from '../lib/storage.ts';

const STEPS: { n: number; target?: string }[] = [
  { n: 1, target: '#globe' }, { n: 2, target: '#btn-zoom-in' }, { n: 3, target: '#globe' },
  { n: 4, target: '#btn-hub' }, { n: 5, target: '#btn-hub' }, { n: 6, target: '#btn-menu' }, { n: 7 },
];

let close: (() => void) | null = null;
/** Closes the walkthrough (and its key handler) if it is open. */
export function closeTutorial(): void { close?.(); }

export function openTutorial(openTours?: () => void): void {
  closeTutorial();
  let i = 0;
  const ring = h('div', { class: 'tut-ring', 'aria-hidden': 'true' });
  const card = h('div', { class: 'tut-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tut-title', 'data-testid': 'tutorial' });
  const root = h('div', { class: 'tutorial' }, ring, card);
  const dismiss = () => {
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    close = null;
  };
  const finish = (celebrate: boolean) => {
    save('tutorial', 'done');
    dismiss();
    if (celebrate) confetti(50);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') trapTab(e, card);
    else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    // Enter on a focused button (Skip, Tours) belongs to that button
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(e.target as Element | null)?.closest?.('button'))) { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  const go = (k: number) => {
    if (k < 0) return;
    if (k >= STEPS.length) return finish(true);
    i = k;
    const st = STEPS[i];
    const el = st.target ? document.querySelector(st.target) : null;
    const r = el?.getBoundingClientRect();
    if (r && st.target !== '#globe') {
      Object.assign(ring.style, { display: 'block', left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    } else ring.style.display = 'none';
    const last = i === STEPS.length - 1;
    card.replaceChildren(
      h('p', { class: 'muted small' }, t('tutStep', { i: i + 1, n: STEPS.length })),
      h('h2', { id: 'tut-title' }, t(`tut${st.n}t`)),
      h('p', {}, t(`tut${st.n}b`)),
      h('div', { class: 'dots', 'aria-hidden': 'true' }, ...STEPS.map((_, j) => h('span', { class: j === i ? 'on' : '' }))),
      h('div', { class: 'row' },
        last ? null : h('button', { class: 'link', 'data-testid': 'tut-skip', onclick: () => finish(false) }, t('skip')),
        last && openTours ? h('button', { class: 'pill', 'data-testid': 'tut-tours', onclick: () => { finish(false); openTours(); } }, t('tourStart')) : null,
        h('button', { class: 'cta', 'data-testid': 'tut-next', onclick: () => go(i + 1) }, last ? t('done') : t('next'))));
    (card.querySelector('.cta') as HTMLButtonElement).focus();
  };
  document.body.append(root);
  document.addEventListener('keydown', onKey, true);
  close = dismiss;
  go(0);
}
