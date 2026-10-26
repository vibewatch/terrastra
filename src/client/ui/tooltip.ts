/**
 * App-wide tooltip in the HUD style, replacing the browser's own `title` tooltip and copying its behaviour:
 * - every `title` attribute (now or later, in any scene) moves to `data-tip`, so the native one never shows;
 * - shows after the mouse rests on an element for a moment, at the pointer, just under the cursor, and stays put;
 * - hides when the pointer leaves, and on click, key press, wheel or scroll; it stays hidden on that element
 *   until the pointer leaves it;
 * - once one has shown, moving quickly onto the next titled element shows its tooltip at once;
 * - mouse, plus keyboard focus (anchored under the element); touch and pen never show it, so a tooltip is
 *   never the only way to learn what a control does: every icon control also gets an accessible name;
 * - `title=""` switches off an ancestor's tooltip.
 */
const DELAY = 500;
const WARM = 400;
const CURSOR_H = 20;
const EDGE = 4;

let tip: HTMLDivElement;
let target: Element | null = null;
let timer = 0;
let shown = false;
let lastHide = -Infinity;
let px = 0, py = 0;
let byKey = false;

function adopt(el: Element): void {
  const v = el.getAttribute('title');
  if (v === null) return;
  el.removeAttribute('title');
  el.setAttribute('data-tip', v);
  // the title was also the accessible name of icon-only buttons
  // (marked, so a later title change, e.g. a language switch, renames it too)
  const own = el.hasAttribute('data-tip-label');
  if (own || (v && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !spokenText(el))) {
    el.setAttribute('aria-label', v);
    el.setAttribute('data-tip-label', '');
  }
  if (el === target && shown) place();
}

/** Text a screen reader would read from the element's content: `aria-hidden` subtrees (decorative emoji, icons) do not count. */
function spokenText(el: Element): string {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? '';
    else if (n instanceof Element && n.getAttribute('aria-hidden') !== 'true' && !(n instanceof SVGElement)) out += n.getAttribute('aria-label') ?? spokenText(n);
  }
  return out.trim();
}

function adoptTree(root: ParentNode): void {
  if (root instanceof Element && root.hasAttribute('title')) adopt(root);
  for (const el of root.querySelectorAll('[title]')) adopt(el);
}

function place(): void {
  const text = target?.getAttribute('data-tip');
  if (!target?.isConnected || !text) { hide(); return; }
  tip.textContent = text;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let ax = px, ay = py, below = CURSOR_H, above = 6;
  if (byKey) {
    // keyboard focus has no pointer: anchor under the element instead
    const r = target.getBoundingClientRect();
    ax = r.left + r.width / 2 - w / 2; ay = r.bottom; below = 6; above = r.height + 6;
  }
  let x = ax, y = ay + below;
  if (y + h > innerHeight - EDGE) y = ay - h - above;
  x = Math.max(EDGE, Math.min(x, innerWidth - EDGE - w));
  y = Math.max(EDGE, y);
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  shown = true;
}

function hide(): void {
  window.clearTimeout(timer);
  if (shown) lastHide = performance.now();
  shown = false;
  tip.hidden = true;
}

/** Hide without forgetting the element: the tooltip comes back only after the pointer leaves it. */
function dismiss(): void {
  hide();
  lastHide = -Infinity;
}

function enter(el: Element | null, key = false): void {
  if (el === target && key === byKey) return;
  hide();
  target = el;
  byKey = key;
  if (!el?.getAttribute('data-tip')) return;
  if (performance.now() - lastHide < WARM) place();
  else timer = window.setTimeout(place, DELAY);
}

export function initTooltips(): void {
  if (tip) return;
  tip = document.createElement('div');
  tip.className = 'pp-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  document.body.append(tip);
  adoptTree(document);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'attributes') { adopt(m.target as Element); if (m.target === target && shown) place(); }
      else for (const n of m.addedNodes) if (n instanceof Element) adoptTree(n);
    }
    if (target && !target.isConnected) { hide(); target = null; }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title', 'data-tip'] });

  window.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') { enter(null); return; }
    // content sliding under a resting mouse (e.g. a dialog closing) must not steal a keyboard tooltip
    if (byKey && e.clientX === px && e.clientY === py) return;
    px = e.clientX; py = e.clientY;
    enter((e.target as Element).closest?.('[data-tip]') ?? null);
  }, true);
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !shown) { px = e.clientX; py = e.clientY; } }, { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', () => enter(null));
  for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) addEventListener(ev, dismiss, { capture: true, passive: true });
  // only a scroll that moves the element under the pointer (code nudging some other strip's scrollLeft does not count)
  window.addEventListener('scroll', e => { const n = e.target; if (target && (n === document || (n instanceof Node && n.contains(target)))) { if (byKey) { if (shown) place(); } else dismiss(); } }, { capture: true, passive: true });
  window.addEventListener('blur', () => enter(null));
  // keyboard users get the same hint when tabbing onto a control
  document.addEventListener('focusin', e => {
    const el = e.target as Element;
    if (!el.matches?.(':focus-visible')) return;
    enter(el.closest('[data-tip]'), true);
  });
  document.addEventListener('focusout', () => { if (byKey) enter(null); });
}
