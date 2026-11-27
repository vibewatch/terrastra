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
  maskLicenseEmail,
  maskRedeemCode,
  maxSessionsForPlan,
  normalizeRedeemCode,
  skyEventYear,
} from '../../src/shared/lib/entitlements.ts';
import {
  emptySyncExtras,
  filterIncomingExtrasForPlan,
  fitSyncExtras,
  isSyncExtras,
  mergeSyncExtras,
} from '../../src/shared/lib/sync-extras.ts';
import { emptyProgress, MAX_SYNC_REQUEST_BYTES } from '../../src/shared/lib/progress.ts';
import {
  clearMasteredMistakes,
  formatMistakeSheetMarkdown,
  recordLessonFinish,
  recordLessonStep,
  recordMistake,
  recordMistakeReview,
  type LessonJournal,
  type MistakeBook,
} from '../../src/shared/lib/journal.ts';
import { openDb } from '../../src/server/db.ts';
import { formatCodesCsv, getUserEntitlement, listRedemptionCodes, redeemCodeForUser } from '../../src/server/billing.ts';

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

    expect(isFreeSkyYear(2025, 2026)).toBe(true);
    expect(isFreeSkyYear(2026, 2026)).toBe(true);
    expect(isFreeSkyYear(2027, 2026)).toBe(true);
    expect(isFreeSkyYear(2024, 2026)).toBe(false);
    expect(isFreeSkyYear(2030, 2026)).toBe(false);

    expect(skyEventYear('solar-eclipse-1999-08-11')).toBe(1999);
    expect(skyEventYear('transit-venus-2117-12-11')).toBe(2117);
    expect(skyEventYear('invalid-event')).toBeNull();

    expect(isFreeTimeStop('now')).toBe(true);
    expect(isFreeTimeStop('dino')).toBe(true);
    expect(isFreeTimeStop(2000)).toBe(true);
    expect(isFreeTimeStop(1969)).toBe(false);

    expect(maskLicenseEmail('teacher@school.edu')).toBe('t***r@school.edu');
    expect(maskLicenseEmail('ab@x.cn')).toBe('a***@x.cn');
    expect(maskRedeemCode('trst-abcd-2345-hjkl')).toBe('TRST-••••-••••-HJKL');
    expect(maskRedeemCode('invalid')).toBeNull();
  });

  it('clears mastered mistakes and exports bilingual Markdown revision sheets', () => {
    let book: MistakeBook = {};
    book = recordMistake(book, 'plates', {
      q: ['Which trench is the deepest?', '世界上最深的海沟是？'],
      options: [['Mariana Trench', '马里亚纳海沟'], ['Java Trench', '爪哇海沟']],
      answer: 0,
      why: ['Subduction of the Pacific Plate.', '太平洋板块俯冲形成。'],
    }, 1000);
    book = recordMistake(book, 'continents', {
      q: ['Largest ocean?', '面积最大的大洋是？'],
      options: [['Pacific Ocean', '太平洋'], ['Atlantic Ocean', '大西洋']],
      answer: 0,
      why: ['Covers nearly half of Earth’s water surface.', '约占世界海洋总面积的一半。'],
    }, 2000);
    const firstKey = Object.keys(book).find(k => k.startsWith('plates::'))!;
    book = recordMistakeReview(book, firstKey, true, 2100);
    book = recordMistakeReview(book, firstKey, true, 2200);
    expect(book[firstKey]?.mastered).toBe(true);

    const entries = Object.values(book);
    const mdZh = formatMistakeSheetMarkdown(entries, {
      lang: 'zh',
      subjectTitle: '地理课',
      lessonTitleOf: id => id === 'plates' ? '板块的运动' : '七大洲和四大洋',
      lockedCount: 2,
      licensedEmail: 't***r@school.edu',
    });
    expect(mdZh).toContain('# 错题复习单 · 地理课');
    expect(mdZh).toContain('马里亚纳海沟');
    expect(mdZh).toContain('太平洋板块俯冲形成');
    expect(mdZh).toContain('板块的运动');
    expect(mdZh).toContain('另有 2 道错题');
    expect(mdZh).toContain('t***r@school.edu');

    const mdEn = formatMistakeSheetMarkdown(entries, { lang: 'en', subjectTitle: 'Geography' });
    expect(mdEn).toContain('# Mistake Revision Sheet · Geography');
    expect(mdEn).toContain('Mariana Trench');

    const remaining = clearMasteredMistakes(book);
    expect(Object.keys(remaining)).toHaveLength(1);
    expect(Object.values(remaining)[0]?.lessonId).toBe('continents');
  });

  it('guarantees at least one free starter lesson in every curriculum view and routes all 122 lessons cleanly across packs', async () => {
    const { ALL_GEO_META, ALL_ASTRO_META, VIEWS, ASTRO_VIEWS, geoCourseMeta, astroCourseMeta, loadLessonById } = await import('../../src/client/lessons/catalog.ts');
    for (const v of Object.keys(VIEWS) as (keyof typeof VIEWS)[]) {
      const geoFree = geoCourseMeta(v).flatMap(g => g.lessons).filter(m => isFreeLesson(m.id));
      expect(geoFree.length, `Geography view ${v} must include a free starter`).toBeGreaterThanOrEqual(1);
    }
    for (const v of Object.keys(ASTRO_VIEWS) as (keyof typeof ASTRO_VIEWS)[]) {
      const astroFree = astroCourseMeta(v).flatMap(g => g.lessons).filter(m => isFreeLesson(m.id));
      expect(astroFree.length, `Astronomy view ${v} must include a free starter`).toBeGreaterThanOrEqual(1);
    }

    const allMeta = [...ALL_GEO_META, ...ALL_ASTRO_META];
    expect(allMeta.length).toBeGreaterThanOrEqual(120);
    for (const m of allMeta) {
      const loaded = await loadLessonById(m.id);
      expect(loaded?.id, `Lesson ${m.id} (${m.strand}) failed to resolve from its pack`).toBe(m.id);
    }
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

  it('fits oversized SyncExtras under 64 KB by trimming mastered mistakes before active mistakes and in-progress lessons', () => {
    let mistakes: MistakeBook = {};
    const pad = '地理与天文详细解析 '.repeat(25);
    for (let i = 0; i < 90; i++) {
      mistakes = recordMistake(
        mistakes,
        'shape',
        {
          q: [`Question ${i}: ${pad}?`, `问题 ${i}：${pad}？`],
          options: [['Option A ' + pad, '选项 A ' + pad], ['Option B', '选项 B']],
          answer: 0,
          why: [`Explanation ${i}: ${pad}`, `解析 ${i}：${pad}`],
        },
        1000 + i,
      );
      if (i < 75) {
        const key = Object.keys(mistakes).find(k => mistakes[k]!.q[0].startsWith(`Question ${i}:`))!;
        mistakes = recordMistakeReview(mistakes, key, true, 2000 + i);
      }
    }
    let journal: LessonJournal = {};
    for (let i = 0; i < 40; i++) {
      journal = recordLessonFinish(journal, `lesson-${i}`, 4, 5, [['Topic ' + i, '考点 ' + i]], 6, 3000 + i);
    }
    journal = recordLessonStep(journal, 'active-mid-lesson', 3, 8, 9999);

    const rawExtras = {
      lessonsDone: ['shape', 'usa'],
      toursDone: ['cosmos'],
      mistakeBook: mistakes,
      lessonJournal: journal,
      bookmarks: [{ route: '', cam: { lat: 31.2, lon: 121.5, h: 1.4 }, label: { en: 'Shanghai' }, at: 5000 }],
    };
    const rawBytes = new TextEncoder().encode(JSON.stringify({ progress: emptyProgress(), extras: rawExtras })).byteLength;
    expect(rawBytes).toBeGreaterThan(MAX_SYNC_REQUEST_BYTES);

    const fitted = fitSyncExtras(emptyProgress(), rawExtras, MAX_SYNC_REQUEST_BYTES);
    const fittedBytes = new TextEncoder().encode(JSON.stringify({ progress: emptyProgress(), extras: fitted })).byteLength;
    expect(fittedBytes).toBeLessThanOrEqual(MAX_SYNC_REQUEST_BYTES);
    expect(isSyncExtras(fitted)).toBe(true);
    // All 15 active (unmastered) mistakes and the mid-lesson resume position are preserved!
    const keptMistakes = Object.values(fitted.mistakeBook ?? {});
    expect(keptMistakes.filter(m => !m.mastered)).toHaveLength(15);
    expect(fitted.lessonJournal?.['active-mid-lesson']?.stepIndex).toBe(3);
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
      const created = run('create', '--plan', 'pro', '--count', '2', '--note', 'batch-test', '--expires-days', '90');
      expect(created.status, created.stderr).toBe(0);
      const codes = created.stdout.trim().split('\n').filter(l => l.startsWith('TRST-'));
      expect(codes).toHaveLength(2);
      expect(normalizeRedeemCode(codes[0]!)).toBe(codes[0]);

      const rawCreated = run('create', '--plan', 'pro', '--count', '1', '--raw');
      expect(rawCreated.status, rawCreated.stderr).toBe(0);
      expect(rawCreated.stdout.trim().split('\n')).toHaveLength(1);
      expect(normalizeRedeemCode(rawCreated.stdout.trim())).toBeTruthy();

      const linkedRaw = run('create', '--plan', 'pro', '--count', '1', '--raw', '--links', '--base-url', 'https://terrastra.example/');
      expect(linkedRaw.status, linkedRaw.stderr).toBe(0);
      expect(linkedRaw.stdout.trim()).toMatch(/^https:\/\/terrastra\.example\/#redeem=TRST-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

      const csvCreated = run('create', '--plan', 'classroom', '--count', '1', '--csv', '--base-url', 'https://terrastra.example/', '--note', '=school, "A"');
      expect(csvCreated.status, csvCreated.stderr).toBe(0);
      const csvLines = csvCreated.stdout.trim().split('\n');
      expect(csvLines[0]).toBe('code,plan,redeem_url,expires_at,note');
      expect(csvLines[1]).toContain(',classroom,https://terrastra.example/#redeem=TRST-');
      // Formula prefix '=' is neutralized with leading apostrophe and quotes/commas are RFC 4180 escaped
      expect(csvLines[1]).toContain(`"'=school, ""A"""`);

      const inspected = run('inspect', codes[0]!);
      expect(inspected.status, inspected.stderr).toBe(0);
      expect(inspected.stdout).toContain('Status:     AVAILABLE');
      expect(inspected.stdout).toContain('batch-test');

      const listed = run('list');
      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain('AVAILABLE');
      expect(listed.stdout).toContain('batch-test');

      const revoked = run('revoke', codes[0]!);
      expect(revoked.status).toBe(0);
      expect(run('list').stdout).toContain('REVOKED');
      expect(run('list', '--status', 'revoked').stdout).toContain('REVOKED');
      expect(run('list', '--status', 'revoked').stdout).not.toContain('AVAILABLE');
      expect(run('list', '--status', 'available', '--plan', 'classroom').stdout).toContain('classroom');
      expect(run('list', '--status', 'available', '--plan', 'classroom').stdout).not.toContain(' pro ');
      expect(run('inspect', codes[0]!).stdout).toContain('Status:     REVOKED');

      const statsOut = run('stats');
      expect(statsOut.status, statsOut.stderr).toBe(0);
      expect(statsOut.stdout).toContain('Codes:');

      const granted = run('grant', '--email', 'teacher@school.edu', '--plan', 'classroom');
      expect(granted.status, granted.stderr).toBe(0);
      const db = openDb(dbPath);
      try {
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get('teacher@school.edu') as { id: number };
        const ent = getUserEntitlement(db, u.id);
        expect(ent.plan).toBe('classroom');
        expect(ent.maxSessions).toBe(10);

        // Also verify --revoke-user rolls back a redeemed user cleanly without wiping cli-grant accounts
        db.prepare('INSERT INTO users (email) VALUES (?)').run('buyer@example.com');
        const buyer = db.prepare('SELECT id FROM users WHERE email = ?').get('buyer@example.com') as { id: number };
        redeemCodeForUser(db, buyer.id, codes[1]!);
        expect(getUserEntitlement(db, buyer.id).plan).toBe('pro');
      } finally {
        db.close();
      }
      const revokedBuyer = run('revoke', codes[1]!, '--revoke-user');
      expect(revokedBuyer.status, revokedBuyer.stderr).toBe(0);
      const db2 = openDb(dbPath);
      try {
        const buyer = db2.prepare('SELECT id FROM users WHERE email = ?').get('buyer@example.com') as { id: number };
        expect(getUserEntitlement(db2, buyer.id).plan).toBe('free');
        expect(listRedemptionCodes(db2, { status: 'revoked' }).every(r => r.status === 'revoked')).toBe(true);
      } finally {
        db2.close();
      }
      expect(formatCodesCsv(['TRST-ABCD-2345-HJKL'], { plan: 'pro', baseUrl: 'https://t.co/', note: '+promo' })).toBe(
        `code,plan,redeem_url,expires_at,note\nTRST-ABCD-2345-HJKL,pro,https://t.co/#redeem=TRST-ABCD-2345-HJKL,,'+promo`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
