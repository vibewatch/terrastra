// Namespaced localStorage with an in-memory fallback (private mode / tests).
const NS = 'pp.';
const mem = new Map<string, string>();
const pending = new Set<string>();

function ls(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function read(key: string): string | null {
  const name = NS + key;
  if (pending.has(name)) return mem.get(name) ?? null;
  try {
    const s = ls();
    if (!s) return mem.get(name) ?? null;
    const raw = s.getItem(name);
    if (raw === null) mem.delete(name); else mem.set(name, raw);
    return raw;
  } catch { return mem.get(name) ?? null; }
}

let lost = false;
let onLost: (() => void) | null = null;
/** Called once, the first time something could not be written: it then lives only until the page closes. */
export function onSessionOnly(fn: () => void): void { onLost = fn; if (lost) fn(); }
export const sessionOnly = () => lost;

function flushPending(s: Storage): void {
  if (pending.size === 0) return;
  for (const k of [...pending]) {
    const raw = mem.get(k);
    if (raw === undefined) { pending.delete(k); continue; }
    try {
      s.setItem(k, raw);
      pending.delete(k);
    } catch {
      // Keep only keys that still exceed quota in pending so smaller keys flush cleanly.
    }
  }
  if (pending.size === 0) lost = false;
}

function write(key: string, raw: string): void {
  const name = NS + key;
  mem.set(name, raw);
  let ok = false;
  try {
    const s = ls();
    if (s) {
      s.setItem(name, raw);
      ok = true;
      pending.delete(name);
      flushPending(s);
    }
  } catch { /* quota or disabled */ }
  if (!ok) pending.add(name);
  if (ok && pending.size === 0) lost = false;
  if (!ok && !lost) { lost = true; onLost?.(); }
}

export function remove(key: string): void {
  const name = NS + key;
  mem.delete(name);
  pending.delete(name);
  try {
    const s = ls();
    if (s) {
      s.removeItem(name);
      flushPending(s);
    }
  } catch { /* quota or disabled */ }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = read(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}

export function save<T>(key: string, value: T): void { write(key, JSON.stringify(value)); }

/** For existing settings stored as plain strings rather than JSON. */
export function loadText(key: string, fallback: string): string { return read(key) ?? fallback; }
export function saveText(key: string, value: string): void { write(key, value); }

/** UTF-8 byte footprint of namespaced `pp.*` entries currently persisted or buffered in memory. */
export function storageUsageBytes(): { keys: number; bytes: number; pendingKeys: number } {
  const seen = new Map<string, string>();
  try {
    const s = ls();
    if (s) {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(NS)) {
          const v = s.getItem(k);
          if (v !== null) seen.set(k, v);
        }
      }
    }
  } catch { /* fallback to mem */ }
  for (const [k, v] of mem) {
    if (k.startsWith(NS) && (!seen.has(k) || pending.has(k))) seen.set(k, v);
  }
  const enc = new TextEncoder();
  let bytes = 0;
  for (const [k, v] of seen) bytes += enc.encode(k).byteLength + enc.encode(v).byteLength;
  return { keys: seen.size, bytes, pendingKeys: pending.size };
}
