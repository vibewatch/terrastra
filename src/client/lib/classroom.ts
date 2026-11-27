/**
 * Classroom mode: bigger text, fewer controls, no third-party content (radio,
 * Wikipedia, guestbook), and a "pause motion" switch for explaining a still frame.
 * Turned on from the menu (remembered) or by a `?class=1` link (this visit only).
 */
import { load, save } from './storage.ts';

const listeners = new Set<() => void>();
const searchParams = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
const fromLink = searchParams?.get('class') ?? null;
const stillFromLink = searchParams?.get('still') ?? null;
let on = fromLink === '1' ? true : fromLink === '0' ? false : load<boolean>('classroom', false);

/** Ambient motion switch read by the render loops (camera moves still work). */
export const motion = { still: on && stillFromLink === '1' };

export const classroom = (): boolean => on;

export function setClassroom(v: boolean): void {
  on = v;
  save('classroom', v);
  if (!v) motion.still = false;
  apply();
}

export function setStill(v: boolean): void {
  motion.still = v;
  apply();
}

export function onClassroom(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

/** The link a teacher shares: classroom on, straight into one tour or lesson, optionally paused on a still frame. */
export function classroomLink(
  id: string,
  kind: 'tour' | 'lesson' = 'tour',
  opts?: { still?: boolean; lang?: 'en' | 'zh' },
): string {
  const base = typeof location === 'undefined' ? 'https://terrastra.app/' : `${location.origin}${location.pathname}`;
  const q = new URLSearchParams({ class: '1' });
  if (opts?.still ?? motion.still) q.set('still', '1');
  if (opts?.lang) q.set('lang', opts.lang);
  return `${base}?${q.toString()}#${kind}/${encodeURIComponent(id)}`;
}

export function apply(): void {
  document.documentElement.classList.toggle('classroom', on);
  document.body.classList.toggle('still', motion.still);
  listeners.forEach(fn => fn());
}
