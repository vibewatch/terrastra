import { describe, it, expect } from 'vitest';
import { parseView, encodeView } from '../../src/client/lib/viewlink.ts';
import { isBookmark, mergeBookmarks } from '../../src/client/lib/backup-file.ts';
import { isSyncBookmark } from '../../src/shared/lib/sync-extras.ts';
import { emptyProgress, isProgress, mergeProgress } from '../../src/shared/lib/progress.ts';
import { computeJournalMastery, mergeLessonJournal, recordLessonFinish } from '../../src/shared/lib/journal.ts';
import { computeExplorerStats, formatFieldLogMarkdown } from '../../src/shared/lib/field-log.ts';

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
});
