import { load, save } from './lib/storage.ts';
import { emptyProgress, isProgress, mergeProgress, type Progress } from '../shared/lib/progress.ts';
import { newlyEarned } from '../shared/lib/stickers.ts';
import { ANIMALS, DISCOVERIES } from '../shared/data/catalogue.ts';
import { DEFAULT_SETTINGS, type Settings } from './globe/scene.ts';
import type { Me } from './lib/api.ts';

type Listener = () => void;
const subs = new Set<Listener>();

const stored = load<unknown>('progress', null);
export const store = {
  progress: isProgress(stored) ? mergeProgress(emptyProgress(), stored) : emptyProgress(),
  settings: { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) } as Settings,
  me: null as Me | null,
};

export function subscribe(fn: Listener): () => void { subs.add(fn); return () => subs.delete(fn); }
function emit(): void { for (const fn of subs) fn(); }

let onSticker: (id: string) => void = () => {};
export function setStickerHandler(fn: (id: string) => void): void { onSticker = fn; }

export function updateProgress(mut: (p: Progress) => void): void {
  mut(store.progress);
  store.progress.updatedAt = Date.now();
  const earned = newlyEarned(store.progress, { animals: ANIMALS.length, discoveries: DISCOVERIES.length });
  save('progress', store.progress);
  emit();
  for (const id of earned) onSticker(id);
  scheduleSync();
}

export function replaceProgress(p: Progress): void { store.progress = p; save('progress', p); emit(); }

export function updateSettings(s: Partial<Settings>): void {
  store.settings = { ...store.settings, ...s };
  save('settings', store.settings);
  emit();
}

export function resetSettings(): void { store.settings = { ...DEFAULT_SETTINGS }; save('settings', store.settings); emit(); }
export function setMe(me: Me | null): void { store.me = me; emit(); }

let syncTimer = 0;
let syncer: (() => Promise<void>) | null = null;
export function setSyncer(fn: () => Promise<void>): void { syncer = fn; }
function scheduleSync(): void {
  if (!store.me || !syncer) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void syncer?.(), 1500);
}
