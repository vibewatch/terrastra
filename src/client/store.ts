import { load, save } from './lib/storage.ts';
import { emptyProgress, fitsSyncRequest, isProgress, mergeProgress, type Progress } from '../shared/lib/progress.ts';
import { newlyEarned } from '../shared/lib/stickers.ts';
import { ANIMALS, DISCOVERIES } from '../shared/data/catalogue.ts';
import { DEFAULT_SETTINGS, type Settings } from './globe/scene.ts';
import type { Me } from './lib/api.ts';

type Listener = () => void;
const subs = new Set<Listener>();

export class ProgressLimitError extends Error {
  constructor() { super('Merged progress exceeds supported limits'); }
}

const stored = load<unknown>('progress', null);
export const store = {
  progress: isProgress(stored) ? mergeProgress(emptyProgress(), stored) : emptyProgress(),
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) } as Settings,
  me: null as Me | null,
};
let lastSavedRef: Progress = store.progress;

function isEmptyProgress(p: Progress): boolean {
  return p.updatedAt === 0
    && Object.keys(p.dex).length === 0
    && Object.keys(p.logs).length === 0
    && Object.keys(p.likes).length === 0
    && Object.keys(p.visited).length === 0
    && Object.keys(p.stickers).length === 0
    && Object.keys(p.found).length === 0
    && Object.keys(p.seen).length === 0;
}

function bumpChangedToggles(prev: Record<string, number>, next: Record<string, number>): void {
  for (const [k, v] of Object.entries(next)) {
    const old = prev[k];
    if (old !== undefined && v !== old && Math.abs(v) <= Math.abs(old)) {
      next[k] = (v < 0 ? -1 : 1) * (Math.abs(old) + 1);
    }
  }
}

/** Reconciles in-memory progress with the latest persisted `localStorage` snapshot before mutating. */
export function reconcileProgressFromDisk(): Progress {
  if (store.progress !== lastSavedRef && isEmptyProgress(store.progress)) {
    save('progress', store.progress);
    lastSavedRef = store.progress;
    return store.progress;
  }
  const disk = load<unknown>('progress', null);
  if (isProgress(disk)) {
    store.progress = mergeProgress(disk, store.progress);
  }
  lastSavedRef = store.progress;
  return store.progress;
}

export function subscribe(fn: Listener): () => void { subs.add(fn); return () => subs.delete(fn); }
function emit(): void { for (const fn of subs) fn(); }

let onSticker: (id: string) => void = () => {};
export function setStickerHandler(fn: (id: string) => void): void { onSticker = fn; }

export function updateProgress(mut: (p: Progress) => void): void {
  reconcileProgressFromDisk();
  const prevLikes = { ...store.progress.likes };
  const prevVisited = { ...store.progress.visited };
  const prevUpdatedAt = store.progress.updatedAt;
  mut(store.progress);
  bumpChangedToggles(prevLikes, store.progress.likes);
  bumpChangedToggles(prevVisited, store.progress.visited);
  store.progress.updatedAt = Math.max(Date.now(), prevUpdatedAt + 1, store.progress.updatedAt);
  const disk = load<unknown>('progress', null);
  if (isProgress(disk)) {
    store.progress = mergeProgress(disk, store.progress);
  }
  const earned = newlyEarned(store.progress, { animals: ANIMALS.length, discoveries: DISCOVERIES.length });
  lastSavedRef = store.progress;
  save('progress', store.progress);
  emit();
  for (const id of earned) onSticker(id);
  scheduleSync();
}

export function canReplaceProgress(p: unknown): p is Progress {
  return isProgress(p) && (!store.me || fitsSyncRequest(p));
}

export function replaceProgress(p: Progress, sync = false): void {
  if (!canReplaceProgress(p)) throw new ProgressLimitError();
  store.progress = p;
  lastSavedRef = p;
  save('progress', p);
  emit();
  if (sync) scheduleSync();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', e => {
    if (e.key === 'pp.progress') {
      if (e.newValue === null) {
        store.progress = emptyProgress();
        lastSavedRef = store.progress;
        emit();
        return;
      }
      try {
        const incoming: unknown = JSON.parse(e.newValue);
        if (isProgress(incoming)) {
          store.progress = isEmptyProgress(incoming) ? emptyProgress() : mergeProgress(store.progress, incoming);
          lastSavedRef = store.progress;
          emit();
        }
      } catch { /* ignore malformed storage payload */ }
    } else if (e.key === 'pp.settings') {
      store.settings = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) } as Settings;
      emit();
    }
  });
}

export function updateSettings(s: Partial<Settings>): void {
  store.settings = { ...store.settings, ...s };
  save('settings', store.settings);
  emit();
}

export function resetSettings(): void { store.settings = { ...DEFAULT_SETTINGS }; save('settings', store.settings); emit(); }
let accountEpoch = 0;
export function getAccountEpoch(): number { return accountEpoch; }
export function setMe(me: Me | null): void {
  if (store.me?.id !== me?.id || store.me?.email !== me?.email) accountEpoch++;
  store.me = me;
  emit();
}

let syncTimer = 0;
let syncer: (() => Promise<void>) | null = null;
export function setSyncer(fn: () => Promise<void>): void { syncer = fn; }
function scheduleSync(): void {
  if (!store.me || !syncer) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void syncer?.(), 1500);
}
