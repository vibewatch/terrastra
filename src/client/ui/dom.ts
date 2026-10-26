import { t } from '../lib/i18n.ts';
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function $(sel: string, root: ParentNode = document): HTMLElement { return root.querySelector(sel) as HTMLElement; }

// ---- modal stack: Esc closes the top-most, Tab/Shift+Tab stay inside it, focus is restored on close ----
interface ModalRec { el: HTMLElement; onClose?: () => void; prevFocus: Element | null }
const stack: ModalRec[] = [];

export function openModal(id: string, title: string, body: Node, opts: { onClose?: () => void; wide?: boolean; className?: string } = {}): HTMLElement {
  closeModal(id);
  const closeBtn = h('button', { class: 'icon-btn modal-x', 'aria-label': t('close'), 'data-testid': 'modal-close', onclick: () => closeModal(id) }, '✕');
  const panel = h('div', { class: 'modal-panel' + (opts.wide ? ' wide' : '') + (opts.className ? ' ' + opts.className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-title' },
    h('header', { class: 'modal-head' }, h('h2', { id: id + '-title' }, title), closeBtn), h('div', { class: 'modal-body' }, body));
  const wrap = h('div', { class: 'modal', id, onclick: (e: Event) => { if (e.target === wrap) closeModal(id); } }, panel);
  wrap.addEventListener('keydown', e => trapTab(e, panel));
  document.body.append(wrap);
  stack.push({ el: wrap, onClose: opts.onClose, prevFocus: document.activeElement });
  requestAnimationFrame(() => (panel.querySelector('button:not(.modal-x), input, select, [tabindex]') as HTMLElement | null)?.focus());
  return wrap;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), audio[controls], video[controls]';

function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('[hidden], [inert]') && el.getClientRects().length > 0);
}

/** Keep keyboard focus cycling inside `root`. */
export function trapTab(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const els = focusables(root);
  if (!els.length) { e.preventDefault(); return; }
  const first = els[0], last = els.at(-1)!, a = document.activeElement;
  const inside = a instanceof Node && root.contains(a);
  if (e.shiftKey && (a === first || !inside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (a === last || !inside)) { e.preventDefault(); first.focus(); }
}

export function closeModal(id?: string): boolean {
  const i = id ? stack.findIndex(m => m.el.id === id) : stack.length - 1;
  if (i < 0) return false;
  const [m] = stack.splice(i, 1);
  m.el.remove();
  m.onClose?.();
  (m.prevFocus as HTMLElement | null)?.focus?.();
  return true;
}

export function toast(msg: string, ms = 2600): void {
  let host = document.getElementById('toast');
  if (!host) { host = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  while (host.childElementCount >= 3) host.firstElementChild!.remove();
  const el = h('div', { class: 'toast' }, msg);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

export function confetti(n = 60): void {
  const host = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  const colors = ['#ffd24a', '#ff7a7a', '#7ad0ff', '#9be27a', '#d29bff'];
  for (let i = 0; i < n; i++) {
    host.append(h('i', { style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.4}s;transform:rotate(${Math.random() * 360}deg)` }));
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 2200);
}
