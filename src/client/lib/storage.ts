// Namespaced localStorage with an in-memory fallback (private mode / tests).
const NS = 'pp.';
const mem = new Map<string, string>();

function ls(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(NS + key) ?? mem.get(NS + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}

let lost = false;
let onLost: (() => void) | null = null;
/** Called once, the first time something could not be written: it then lives only until the page closes. */
export function onSessionOnly(fn: () => void): void { onLost = fn; if (lost) fn(); }
export const sessionOnly = () => lost;

export function save<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  mem.set(NS + key, raw);
  let ok = false;
  try { const s = ls(); if (s) { s.setItem(NS + key, raw); ok = true; } } catch { /* quota or disabled */ }
  if (!ok && !lost) { lost = true; onLost?.(); }
}
