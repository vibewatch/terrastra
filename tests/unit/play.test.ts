import { describe, it, expect } from 'vitest';
import { CATALOGUE, BY_KEY } from '../../src/shared/data/catalogue.ts';
import { PASSPORTS, bookProgress, bookDone } from '../../src/shared/data/passports.ts';
import { STOPS, visibleAt, appearingAt, dateOf } from '../../src/shared/lib/timeline.ts';
import { GREETINGS } from '../../src/shared/data/greetings.ts';
import { newlyEarned } from '../../src/shared/lib/stickers.ts';
import { emptyProgress } from '../../src/shared/lib/progress.ts';
import type { CatalogueItem } from '../../src/shared/data/types.ts';

const item = (o: Partial<CatalogueItem>): CatalogueItem => ({ ...CATALOGUE[0], facts: {}, ...o }) as CatalogueItem;

describe('passport books', () => {
  it('are non-empty, unique and reference real catalogue keys', () => {
    expect(new Set(PASSPORTS.map(b => b.id)).size).toBe(PASSPORTS.length);
    for (const b of PASSPORTS) {
      expect(b.keys.length).toBeGreaterThan(0);
      for (const k of b.keys) expect(BY_KEY.has(k), `${b.id}:${k}`).toBe(true);
    }
    expect(PASSPORTS.find(b => b.id === 'wonders')!.keys).toHaveLength(8);
  });
  it('counts stamps and completion', () => {
    const b = PASSPORTS[0];
    const seen = Object.fromEntries(b.keys.slice(1).map(k => [k, 1]));
    expect(bookProgress(b, seen)).toBe(b.keys.length - 1);
    expect(bookDone(b, seen)).toBe(false);
    seen[b.keys[0]] = 1;
    expect(bookDone(b, seen)).toBe(true);
  });
  it('awards passport stickers', () => {
    const p = emptyProgress();
    for (const k of PASSPORTS[0].keys) p.seen[k] = 1;
    for (const it of CATALOGUE.slice(0, 10)) p.seen[it.key] = 1;
    const got = newlyEarned(p, { animals: 999, discoveries: 999 });
    expect(got).toContain('passport_10');
    expect(got).toContain('book_done');
  });
});

describe('time machine', () => {
  it('shows dinosaurs only in the dino era and hides future buildings', () => {
    const dino = item({ type: 'dino', facts: { mya: 66 } });
    const old = item({ type: 'landmark', facts: { built: -2560 } });
    const modern = item({ type: 'landmark', facts: { built: 1889 } });
    const timeless = item({ type: 'animal', facts: {} });
    expect(visibleAt(dino, 'dino')).toBe(true);
    expect(visibleAt(dino, 1000)).toBe(false);
    expect(visibleAt(old, 'dino')).toBe(false);
    expect(visibleAt(old, -500)).toBe(true);
    expect(visibleAt(modern, 1800)).toBe(false);
    expect(visibleAt(modern, 1900)).toBe(true);
    expect(visibleAt(timeless, 1)).toBe(true);
    for (const x of [dino, old, modern, timeless]) expect(visibleAt(x, 'now')).toBe(true);
  });
  it('lists each dated item at exactly one stop', () => {
    const dated = CATALOGUE.filter(i => i.facts?.mya === undefined && dateOf(i) !== undefined && dateOf(i)! <= 2000);
    const listed = STOPS.flatMap((_, i) => (STOPS[i] === 'dino' ? [] : appearingAt(CATALOGUE, i)));
    expect(listed.length).toBe(dated.length);
    expect(new Set(listed.map(i => i.key)).size).toBe(listed.length);
  });
});

describe('greetings', () => {
  it('have text, language and pronunciation for most catalogue countries', () => {
    for (const [c, g] of Object.entries(GREETINGS)) {
      expect(c).toMatch(/^[A-Z]{2}$/);
      expect(g[0] && g[1] && g[2], c).toBeTruthy();
    }
    const countries = [...new Set(CATALOGUE.map(i => i.country).filter(Boolean))] as string[];
    const covered = countries.filter(c => c in GREETINGS).length;
    expect(covered / countries.length).toBeGreaterThan(0.9);
  });
});

describe('render quality tiers', async () => {
  const { pickTier, AdaptiveResolution, lowFxFrom } = await import('../../src/client/globe/quality.ts');
  it('lowfx=0 overrides the reduced-motion preference, lowfx forces it on', () => {
    const p = (s: string) => new URLSearchParams(s);
    expect(lowFxFrom(p('lowfx=0'), true)).toBe(false);
    expect(lowFxFrom(p('lowfx'), false)).toBe(true);
    expect(lowFxFrom(p('lowfx=1'), false)).toBe(true);
    expect(lowFxFrom(p(''), true)).toBe(true);
    expect(lowFxFrom(p(''), false)).toBe(false);
  });
  it('treats phones and small-memory devices as medium, very weak ones as low, and honours ?q / ?lowfx', () => {
    expect(pickTier({ coarse: false, screenMin: 1080, memoryGB: 8, cores: 8 })).toBe('high');
    expect(pickTier({ coarse: true, screenMin: 390, memoryGB: 8, cores: 8 })).toBe('medium');
    expect(pickTier({ mobileUA: true, cores: 8 })).toBe('medium');
    expect(pickTier({ coarse: false, screenMin: 1080, memoryGB: 4, cores: 8 })).toBe('medium');
    expect(pickTier({ coarse: true, screenMin: 390, memoryGB: 2, cores: 8 })).toBe('low');
    expect(pickTier({ lowfx: true })).toBe('low');
    expect(pickTier({ query: 'high', mobileUA: true })).toBe('high');
  });
  it('lowers the pixel ratio under sustained slow frames, ignores stalls, and recovers with headroom', () => {
    const a = new AdaptiveResolution(1, 2);
    for (let i = 0; i < 200; i++) expect(a.sample(1000)).toBeNull();
    let r: number | null = null;
    for (let i = 0; i < 200 && r === null; i++) r = a.sample(50);
    expect(r).toBe(1.75);
    for (let i = 0; i < 2000; i++) a.sample(50);
    expect(a.ratio).toBe(1);
    for (let i = 0; i < 4000; i++) a.sample(10);
    expect(a.ratio).toBe(2);
  });
});

describe('sub-category names', () => {
  it('have a Chinese name for every catalogue sub-category', async () => {
    const { SUB_ZH, subName } = await import('../../src/shared/data/subs.ts');
    const missing = [...new Set(CATALOGUE.map(i => i.sub))].filter(s => !SUB_ZH[s]);
    expect(missing).toEqual([]);
    expect(subName('old-town', 'en')).toBe('Old town');
  });
});

describe('progress backup file', async () => {
  const { backupOf, readBackup, summary } = await import('../../src/client/lib/backup-file.ts');
  const { emptyProgress } = await import('../../src/shared/lib/progress.ts');
  it('round-trips, and rejects anything that is not a backup', () => {
    const p = emptyProgress();
    p.seen = { eiffel: 1, panda: 2 }; p.stickers = { first: 3 };
    const back = readBackup(JSON.stringify(backupOf(p, 5)));
    expect(back && summary(back)).toEqual({ seen: 2, found: 0, stickers: 1, likes: 0 });
    expect(readBackup('not json')).toBeNull();
    expect(readBackup(JSON.stringify(p))).toBeNull();
    expect(readBackup(JSON.stringify({ kind: 'terrastra-progress', v: 1, progress: { v: 2 } }))).toBeNull();
    expect(readBackup(JSON.stringify({ ...backupOf(p, 5), kind: 'other-app' }))).toBeNull();
  });
});
