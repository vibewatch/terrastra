import { describe, it, expect } from 'vitest';
import { parseView, encodeView, addBookmark, bookmarks, renameBookmark } from '../../src/client/lib/viewlink.ts';
import { backupOf, isBookmark, mergeBookmarks, readBackupFull } from '../../src/client/lib/backup-file.ts';
import { isSyncBookmark, isSyncExtras, mergeSyncBookmarks, sanitizeSyncExtras } from '../../src/shared/lib/sync-extras.ts';
import { emptyProgress, fitProgress, isProgress, mergeProgress } from '../../src/shared/lib/progress.ts';
import {
  computeJournalMastery,
  isLessonJournal,
  mergeLessonJournal,
  mergeMistakeBook,
  recordLessonFinish,
  recordLessonStep,
  recordMistake,
  recordMistakeReview,
  type LessonJournal,
} from '../../src/shared/lib/journal.ts';
import { computeExplorerStats, formatFieldLogMarkdown } from '../../src/shared/lib/field-log.ts';
import { STICKERS } from '../../src/shared/lib/stickers.ts';
import { replaceProgress, setStickerHandler, store } from '../../src/client/store.ts';

describe('view links', () => {
  it('round-trips a globe camera on an item route', () => {
    const v = { route: 'eiffel', cam: { lat: 48.86, lon: 2.35, h: 0.8 } };
    expect(parseView(encodeView(v))).toEqual({ ...v, bad: false });
  });

  it('keeps plain routes untouched', () => {
    expect(parseView('solar/mars')).toEqual({ route: 'solar/mars', bad: false });
    expect(encodeView({ route: 'sky/solar-eclipse-2026-08-12' })).toBe('sky/solar-eclipse-2026-08-12');
  });

  it('falls back to the route for unknown versions or broken numbers', () => {
    for (const tail of ['v9:1,2,3', 'v1:abc,2,3', 'v1:95,2,1', 'v1:10,20,0', 'v1:10,20', 'garbage', 'v1:1e5,2,3'])
      expect(parseView('eiffel@' + tail)).toEqual({ route: 'eiffel', bad: true });
  });

  it('clamps and wraps the camera and strips leading # or percent-encoded routes', () => {
    expect(parseView('@v1:89,190,99').cam).toEqual({ lat: 85, lon: -170, h: 20 });
    expect(parseView('#geo%3Amariana-trench@v1:11.35,142.2,0.72')).toEqual({
      route: 'geo:mariana-trench',
      cam: { lat: 11.35, lon: 142.2, h: 0.72 },
      bad: false,
    });
  });

  it('validates root-globe camera bookmarks and sorts deterministic ties in mergeBookmarks', () => {
    const rootCam = { route: '', cam: { lat: 35.6, lon: 139.7, h: 1.5 }, label: { en: 'Tokyo view', zh: '东京视角' }, at: 1000 };
    const emptyInvalid = { route: '', label: { en: 'Nowhere' }, at: 1000 };
    expect(isBookmark(rootCam)).toBe(true);
    expect(isSyncBookmark(rootCam)).toBe(true);
    expect(isBookmark(emptyInvalid)).toBe(false);
    expect(isSyncBookmark(emptyInvalid)).toBe(false);

    const b1 = { route: 'solar/mars', label: { en: 'Mars' }, at: 2000 };
    const b2 = { route: 'eiffel', label: { en: 'Eiffel' }, at: 2000 };
    const b3 = { route: 'pyramids', label: { en: 'Pyramids' }, at: 3000 };
    expect(mergeBookmarks([b1, rootCam], [b2, b3]).map(b => b.route)).toEqual(['pyramids', 'eiffel', 'solar/mars', '']);
  });

  it('enforces non-negative progress counters and clamps merged quiz/daily ratios', () => {
    const bad = emptyProgress();
    bad.quiz = { answered: 5, correct: 8, bySet: {} };
    expect(isProgress(bad)).toBe(false);
    const neg = emptyProgress();
    neg.quiz = { answered: -1, correct: 0, bySet: {} };
    expect(isProgress(neg)).toBe(false);

    const a = emptyProgress();
    a.quiz = { answered: 10, correct: 9, bySet: {} };
    const b = emptyProgress();
    b.quiz = { answered: 6, correct: 12, bySet: {} };
    const merged = mergeProgress(a, b);
    expect(merged.quiz).toEqual({ answered: 10, correct: 10, bySet: {} });
  });

  it('clamps journal scores to quizTotal and summarizes mastery & field log elevation', () => {
    let j = recordLessonFinish({}, 'g7-earth', 99, 5, [], 8, 1000);
    expect(j['g7-earth'].bestScore).toBe(5);
    expect(j['g7-earth'].lastScore).toBe(5);
    j = mergeLessonJournal(j, {
      'g7-map': {
        id: 'g7-map', stepIndex: 0, totalSteps: 6, bestScore: 3, lastScore: 3,
        quizTotal: 4, attempts: 2, missedTopics: [], completedAt: 1200, updatedAt: 1200,
      },
    });
    expect(computeJournalMastery(j)).toEqual({
      completedCount: 2,
      inProgressCount: 0,
      perfectCount: 1,
      totalAttempts: 3,
      averageAccuracyPct: 89,
    });

    const p = emptyProgress();
    p.seen.everest = 1700000000000;
    p.seen.penguin = 1700000001000;
    p.quiz = { answered: 20, correct: 17, bySet: {} };
    p.daily = { played: 4, won: 4, streak: 4, maxStreak: 4, lastWonDay: 100, dist: [1, 2, 1, 0, 0] };
    const stats = computeExplorerStats(p, j);
    expect(stats.highestPeak?.key).toBe('everest');
    expect(stats.quizAccuracyPct).toBe(85);
    const md = formatFieldLogMarkdown(p, j, 'en', 1700000000000);
    expect(md).toContain('Highest elevation');
    expect(md).toContain('Quiz accuracy**: 85%');
  });

  it('caps LessonJournal merges at 500 preserving mid-lesson entries and breaks MistakeBook ties safely (#112)', () => {
    const a: LessonJournal = {};
    const b: LessonJournal = {};
    for (let i = 0; i < 300; i++) {
      Object.assign(a, recordLessonFinish({}, `a-${i}`, 3, 4, [], 6, 1000 + i));
      Object.assign(b, recordLessonFinish({}, `b-${i}`, 4, 4, [], 6, 2000 + i));
    }
    const withResume = recordLessonStep(a, 'in-progress-mid', 2, 8, 500);
    const merged = mergeLessonJournal(withResume, b);
    expect(Object.keys(merged).length).toBe(500);
    expect(isLessonJournal(merged)).toBe(true);
    expect(merged['in-progress-mid']?.stepIndex).toBe(2);

    const missed = recordMistake({}, 'g7-earth', { q: ['Q1', '问题1'], why: ['W1', '解析1'] }, 5000);
    const key = Object.keys(missed)[0];
    const masteredCopy = recordMistakeReview(missed, key, true, 5000);
    // Equal updatedAt tie between unmastered and mastered keeps unmastered so active mistakes aren't lost
    const tied = mergeMistakeBook(
      { [key]: { ...masteredCopy[key], updatedAt: 6000 } },
      { [key]: { ...missed[key], updatedAt: 6000, wrongCount: 3 } },
    );
    expect(tied[key].mastered).toBe(false);
    expect(tied[key].wrongCount).toBe(3);
  });

  it('sanitizes corrupt/oversized SyncExtras, Progress counters, and >100 placeit modes (#113, #115)', () => {
    const dirty = sanitizeSyncExtras({
      lessonsDone: ['ok-1', '', 123, 'x'.repeat(90), ...Array.from({ length: 520 }, (_, i) => `l-${i}`)],
      toursDone: ['tour-1', null],
      lessonJournal: { bad: { id: 'mismatch' } },
      mistakeBook: { bad: { key: 'bad' } },
      bookmarks: [
        { route: 'eiffel', label: { en: 'Eiffel' }, at: 100 },
        { route: '', label: { en: 'Invalid' }, at: 200 },
      ],
    });
    expect(isSyncExtras(dirty)).toBe(true);
    expect(dirty.lessonsDone?.length).toBe(500);
    expect(dirty.bookmarks?.length).toBe(1);

    const pA = emptyProgress();
    for (let i = 0; i < 120; i++) pA.placeit[`mode-${i}`] = { best: i * 50, plays: 1 };
    const fitted = fitProgress(pA);
    expect(Object.keys(fitted.placeit).length).toBe(100);
    expect(isProgress(fitted)).toBe(true);

    const corrupt = emptyProgress();
    (corrupt.quiz as unknown as Record<string, unknown>).answered = NaN;
    (corrupt.placeit as Record<string, unknown>).bad = { best: -50, plays: Infinity };
    const cleanMerged = mergeProgress(corrupt, emptyProgress());
    expect(isProgress(cleanMerged)).toBe(true);
    expect(cleanMerged.placeit.bad).toEqual({ best: 0, plays: 0 });
  });

  it('unlocks retroactive stickers on replaceProgress, tracks deepest/span in Field Log, and renames bookmarks (#114, #116, #117, #118, #119)', () => {
    expect(STICKERS.every(s => Boolean(s.hint.en && s.hint.zh))).toBe(true);

    const unlocked: string[] = [];
    setStickerHandler(id => unlocked.push(id));
    try {
      const p = emptyProgress();
      p.dex.an_panda = 1000;
      p.seen.everest = 1000;
      p.seen.dc_endurance = 2000;
      p.seen.dc_challenger = 3000;
      replaceProgress(p, true);
      expect(store.progress.stickers.first_animal).toBeGreaterThan(0);
      expect(unlocked).toContain('first_animal');

      const stats = computeExplorerStats(store.progress, {}, ['g7-earth', 'g7-map']);
      expect(stats.lessonsCompleted).toBe(2);
      expect(stats.antipodalSpanKm).toBeGreaterThan(10_000);
      expect(stats.antipodalPair).not.toBeNull();
      expect(stats.deepestSpot?.key).toBe('dc_challenger');
      expect(stats.deepestSpot?.facts?.depthM).toBe(10935);
      const md = formatFieldLogMarkdown(store.progress, {}, 'zh', 1700000000000, ['g7-earth']);
      expect(md).toContain('最大大圆跨度');
      expect(md).toContain('最深足迹');

      const rawBk = JSON.stringify(backupOf(store.progress, 1712345678000, { lessonsDone: ['g7-earth'] }));
      const parsed = readBackupFull(rawBk);
      expect(parsed?.exportedAt).toBe(1712345678000);
      expect(parsed?.lessonsDone).toEqual(['g7-earth']);

      addBookmark({ route: 'solar/mars', label: { en: 'Mars', zh: '火星' }, at: 1000 });
      expect(renameBookmark({ route: 'solar/mars' }, 'Olympus Mons Flyby', 2500)).toBe(true);
      const saved = bookmarks().find(b => b.route === 'solar/mars')!;
      expect(saved.label.en).toBe('Olympus Mons Flyby');
      expect(saved.at).toBe(2500);
      // CRDT merge keeps renamed title over older copy
      const synced = mergeSyncBookmarks([{ route: 'solar/mars', label: { en: 'Mars' }, at: 1000 }], [saved]);
      expect(synced[0].label.en).toBe('Olympus Mons Flyby');
    } finally {
      setStickerHandler(() => {});
      store.progress = emptyProgress();
    }
  });
});
