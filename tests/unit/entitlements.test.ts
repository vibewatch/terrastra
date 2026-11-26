import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FREE_LESSON_IDS,
  FREE_MISTAKE_LIMIT,
  FREE_TOUR_IDS,
  PLANS,
  hasProAccess,
  isFreeLesson,
  isFreeSkyYear,
  isFreeTimeStop,
  isFreeTour,
  maxSessionsForPlan,
  normalizeRedeemCode,
} from '../../src/shared/lib/entitlements.ts';
import {
  emptySyncExtras,
  filterIncomingExtrasForPlan,
  isSyncExtras,
  mergeSyncExtras,
} from '../../src/shared/lib/sync-extras.ts';
import { recordLessonFinish, recordMistake, type MistakeBook } from '../../src/shared/lib/journal.ts';
import { openDb } from '../../src/server/db.ts';
import { getUserEntitlement } from '../../src/server/billing.ts';

describe('entitlements & redemption code rules', () => {
  it('normalizes valid activation codes and rejects ambiguous or malformed inputs', () => {
    expect(normalizeRedeemCode('trst-abcd-2345-hjkl')).toBe('TRST-ABCD-2345-HJKL');
    expect(normalizeRedeemCode('  trst abcd 2345 hjkl  ')).toBe('TRST-ABCD-2345-HJKL');
    expect(normalizeRedeemCode('TRSTABCD2345HJKL')).toBe('TRST-ABCD-2345-HJKL');
    // Ambiguous characters (0, O, 1, I) and bad prefixes/lengths are rejected
    expect(normalizeRedeemCode('TRST-0000-2345-HJKL')).toBeNull();
    expect(normalizeRedeemCode('TRST-OOOO-2345-HJKL')).toBeNull();
    expect(normalizeRedeemCode('TRST-1111-2345-HJKL')).toBeNull();
    expect(normalizeRedeemCode('TRST-IIII-2345-HJKL')).toBeNull();
    expect(normalizeRedeemCode('ABCD-2345-HJKL-6789')).toBeNull();
    expect(normalizeRedeemCode('TRST-ABCD-2345')).toBeNull();
  });

  it('computes Free vs Pro access across paywall states and feature gates', () => {
    expect(hasProAccess('free', false)).toBe(true);
    expect(hasProAccess(null, false)).toBe(true);
    expect(hasProAccess('free', true)).toBe(false);
    expect(hasProAccess(null, true)).toBe(false);
    expect(hasProAccess('pro', true)).toBe(true);
    expect(hasProAccess('classroom', true)).toBe(true);

    expect(maxSessionsForPlan('free')).toBe(PLANS.free.maxSessions);
    expect(maxSessionsForPlan('pro')).toBe(3);
    expect(maxSessionsForPlan('classroom')).toBe(10);

    for (const id of FREE_LESSON_IDS) expect(isFreeLesson(id)).toBe(true);
    expect(isFreeLesson('ssbs-today')).toBe(true);
    expect(isFreeLesson('usa')).toBe(false);
    expect(isFreeLesson('exam-g7a')).toBe(false);
    expect(isFreeLesson('a-mars')).toBe(false);

    for (const id of FREE_TOUR_IDS) expect(isFreeTour(id)).toBe(true);
    expect(isFreeTour('eclipse')).toBe(false);
    expect(isFreeTour('apollo11')).toBe(false);

    expect(isFreeSkyYear(2026, 2026)).toBe(true);
    expect(isFreeSkyYear(2027, 2026)).toBe(true);
    expect(isFreeSkyYear(2025, 2026)).toBe(false);
    expect(isFreeSkyYear(2030, 2026)).toBe(false);

    expect(isFreeTimeStop('now')).toBe(true);
    expect(isFreeTimeStop('dino')).toBe(true);
    expect(isFreeTimeStop(2000)).toBe(true);
    expect(isFreeTimeStop(1969)).toBe(false);
  });
});

describe('sync extras validation, merging & plan filtering', () => {
  it('validates and merges bookmarks (including bare globe views), mistake books, and lesson journals', () => {
    const base = emptySyncExtras();
    expect(isSyncExtras(base)).toBe(true);
    expect(isSyncExtras(null)).toBe(false);
    expect(isSyncExtras([])).toBe(false);

    let mistakes: MistakeBook = {};
    for (let i = 0; i < 8; i++) {
      mistakes = recordMistake(
        mistakes,
        'shape',
        { q: [`Question ${i}?`, `问题 ${i}？`], options: [['A', 'A'], ['B', 'B']], answer: 0, why: ['Because', '因为'] },
        1000 + i * 100,
      );
    }

    const deviceA = {
      lessonsDone: ['shape', 'landforms'],
      toursDone: ['cosmos'],
      bookmarks: [
        { route: '', cam: { lat: 35.68, lon: 139.69, h: 1.45 }, label: { en: 'Tokyo Orbit', zh: '东京上空' }, at: 100 },
      ],
      mistakeBook: mistakes,
      lessonJournal: recordLessonFinish({}, 'shape', 3, 4, [], 8, 500),
    };
    const deviceB = {
      lessonsDone: ['landforms', 'plates'],
      toursDone: ['tern'],
      bookmarks: [
        { route: '', cam: { lat: 35.68, lon: 139.69, h: 1.45 }, label: { en: 'Tokyo Updated' }, at: 250 },
        { route: 'item/eiffel', label: { en: 'Eiffel Tower' }, at: 200 },
      ],
      lessonJournal: recordLessonFinish({}, 'shape', 4, 4, [], 8, 900),
    };

    expect(isSyncExtras(deviceA)).toBe(true);
    expect(isSyncExtras(deviceB)).toBe(true);

    const merged = mergeSyncExtras(deviceA, deviceB);
    expect(merged.lessonsDone).toEqual(['shape', 'landforms', 'plates']);
    expect(merged.toursDone).toEqual(['cosmos', 'tern']);
    expect(merged.bookmarks).toHaveLength(2);
    expect(merged.bookmarks?.[0]?.label.en).toBe('Tokyo Updated');
    expect(merged.lessonJournal?.shape?.bestScore).toBe(4);
    expect(Object.keys(merged.mistakeBook ?? {})).toHaveLength(8);

    // Free plan under active paywall caps synced mistakes to FREE_MISTAKE_LIMIT and omits Pro-only extras
    const filteredFree = filterIncomingExtrasForPlan(merged, 'free', true);
    expect(Object.keys(filteredFree.mistakeBook ?? {})).toHaveLength(FREE_MISTAKE_LIMIT);
    expect(filteredFree.bookmarks).toBeUndefined();
    expect(filteredFree.lessonJournal).toBeUndefined();

    // Pro plan (or paywall disabled) preserves full extras
    expect(Object.keys(filterIncomingExtrasForPlan(merged, 'pro', true).mistakeBook ?? {})).toHaveLength(8);
    expect(filterIncomingExtrasForPlan(merged, 'pro', true).bookmarks).toHaveLength(2);
    expect(filterIncomingExtrasForPlan(merged, 'free', false).bookmarks).toHaveLength(2);
  });
});

describe('manage-codes CLI', () => {
  it('creates, lists, revokes, and directly grants entitlements in SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'terrastra-codes-'));
    const dbPath = join(dir, 'codes.db');
    const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/manage-codes.ts', ...args], {
      env: { ...process.env, DB_PATH: dbPath },
      encoding: 'utf8',
      timeout: 10_000,
    });
    try {
      const created = run('create', '--plan', 'pro', '--count', '2', '--note', 'batch-test');
      expect(created.status, created.stderr).toBe(0);
      const codes = created.stdout.trim().split('\n').filter(l => l.startsWith('TRST-'));
      expect(codes).toHaveLength(2);
      expect(normalizeRedeemCode(codes[0]!)).toBe(codes[0]);

      const listed = run('list');
      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain('AVAILABLE');
      expect(listed.stdout).toContain('batch-test');

      const revoked = run('revoke', codes[0]!);
      expect(revoked.status).toBe(0);
      expect(run('list').stdout).toContain('REVOKED');

      const granted = run('grant', '--email', 'teacher@school.edu', '--plan', 'classroom');
      expect(granted.status, granted.stderr).toBe(0);
      const db = openDb(dbPath);
      try {
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get('teacher@school.edu') as { id: number };
        const ent = getUserEntitlement(db, u.id);
        expect(ent.plan).toBe('classroom');
        expect(ent.maxSessions).toBe(10);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
