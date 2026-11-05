import { describe, it, expect } from 'vitest';
import { haversineKm, bearingDeg, arrow8, latLonToVec, vecToLatLon, formatKm } from '../../src/shared/lib/geo.ts';
import { mulberry32 } from '../../src/shared/lib/rng.ts';
import { DIFFS, scoreFor, effectiveKm, verdict, pickRounds, updateRecord, ROUNDS } from '../../src/shared/games/placeit.ts';
import { generateQuiz, applyAnswer, ranking, LEVEL_OPTIONS, QUIZ_SETS } from '../../src/shared/games/quiz.ts';
import { buildPool, dayIndex, puzzleFor, evaluate, applyGuess, finishStats, hintsUnlocked, shareText, EMPTY_STATS, type DailyState } from '../../src/shared/games/daily.ts';
import { emptyProgress, mergeProgress, isProgress, isOn, countOn, fitsSyncRequest, MAX_SYNC_REQUEST_BYTES } from '../../src/shared/lib/progress.ts';
import { newlyEarned } from '../../src/shared/lib/stickers.ts';
import { CATALOGUE, BY_KEY, BY_SLUG, LANDMARKS } from '../../src/shared/data/catalogue.ts';
import { EN_KEYS, ZH_KEYS, hasKey, t } from '../../src/client/lib/i18n.ts';
import { SKY_TEXT } from '../../src/client/sky/text.ts';
import { haversineKm as hk } from '../../src/shared/lib/geo.ts';
import { buildFresh } from '../../src/client/models/kit.ts';
import { heroBuilder, loadHeroesFor, PACK_IDS } from '../../src/client/models/heroes/index.ts';
import { AURA_PRESETS } from '../../src/client/globe/scene.ts';
import { parseExtract, articleUrl } from '../../src/client/lib/wikipedia.ts';
import { WIKI } from '../../src/shared/data/wiki.ts';
import { graticuleStep } from '../../src/client/globe/layers.ts';
import { antipodeOf, greatCircleSummary, nearestCatalogueItem, solarTimeOffsetHours, wrapLon } from '../../src/shared/lib/geodesic.ts';
import { analyzeQuakeTectonics, pointToSegmentKm } from '../../src/shared/lib/tectonics.ts';
import { computeExplorerStats, formatFieldLogMarkdown } from '../../src/shared/lib/field-log.ts';
import { STOPS, eraNote } from '../../src/shared/lib/timeline.ts';
import { issElevationAndAzimuth, predictIssPasses } from '../../src/client/lib/iss.ts';
import { backupOf, readBackupFull, mergeBookmarks } from '../../src/client/lib/backup-file.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('geo', () => {
  it('haversine: Paris→London ≈ 344 km, symmetric, zero on same point', () => {
    expect(haversineKm(48.8566, 2.3522, 51.5074, -0.1278)).toBeCloseTo(344, -1);
    expect(haversineKm(10, 20, -30, 40)).toBeCloseTo(haversineKm(-30, 40, 10, 20), 6);
    expect(haversineKm(1, 2, 1, 2)).toBe(0);
  });
  it('bearing + 8-way arrows', () => {
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(0, 3);
    expect(bearingDeg(0, 0, 0, 10)).toBeCloseTo(90, 3);
    expect(arrow8(0)).toBe('⬆️'); expect(arrow8(90)).toBe('➡️'); expect(arrow8(180)).toBe('⬇️'); expect(arrow8(270)).toBe('⬅️'); expect(arrow8(350)).toBe('⬆️');
  });
  it('latLon ↔ vector round trip; lon 0 on +Z, north pole on +Y', () => {
    const [x, y, z] = latLonToVec(0, 0);
    expect([x, y, z].map(v => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 1]);
    expect(latLonToVec(90, 0)[1]).toBeCloseTo(1);
    const [la, lo] = vecToLatLon(...latLonToVec(37.5, -122.3));
    expect(la).toBeCloseTo(37.5); expect(lo).toBeCloseTo(-122.3);
  });
  it('formatKm', () => { expect(formatKm(1234.4)).toMatch(/1,234 km/); expect(formatKm(0.4)).toMatch(/km|m/); });
});

describe('Place it! scoring', () => {
  it('full score inside fullKm, zero past zeroKm, monotone in between', () => {
    for (const d of Object.values(DIFFS)) {
      expect(scoreFor(0, d)).toBe(1000);
      expect(scoreFor(d.fullKm, d)).toBe(1000);
      expect(scoreFor(d.zeroKm, d)).toBe(0);
      let prev = 1001;
      for (let km = d.fullKm; km <= d.zeroKm; km += (d.zeroKm - d.fullKm) / 20) { const s = scoreFor(km, d); expect(s).toBeLessThanOrEqual(prev); prev = s; }
    }
  });
  it('large sites get a distance allowance', () => {
    const wall = { lat: 40, lon: 116, area: 500 };
    expect(effectiveKm(wall, 40, 116)).toBe(0);
    expect(effectiveKm(wall, 40, 122)).toBeCloseTo(hk(40, 116, 40, 122) - 500, 3);
  });
  it('verdict bands', () => { expect(verdict(1000)).toBe('perfect'); expect(verdict(700)).toBe('great'); expect(verdict(300)).toBe('good'); expect(verdict(0)).toBe('tryAgain'); });
  it('pickRounds respects tiers, no vehicles, unique', () => {
    const r = pickRounds(CATALOGUE, 'easy', mulberry32(1));
    expect(r).toHaveLength(ROUNDS);
    expect(new Set(r.map(i => i.key)).size).toBe(ROUNDS);
    expect(r.every(i => i.tier === 1 && i.type !== 'vehicle')).toBe(true);
  });
  it('records track best and plays', () => {
    const a = updateRecord(undefined, 5000);
    expect(a).toEqual({ rec: { best: 5000, plays: 1 }, isNew: true });
    expect(updateRecord(a.rec, 4000)).toEqual({ rec: { best: 5000, plays: 2 }, isNew: false });
  });
});

describe('quiz', () => {
  it.each(QUIZ_SETS)('generates valid questions for set %s at every level', set => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const qs = generateQuiz(CATALOGUE, set, level, 10, 'en', a => a, mulberry32(7));
      expect(qs.length).toBeGreaterThanOrEqual(set === 'mixed' ? 10 : 5);
      for (const q of qs) {
        expect(q.options).toHaveLength(LEVEL_OPTIONS[level]);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.prompt.en.length).toBeGreaterThan(5);
        if (set !== 'mixed') expect(q.set).toBe(set);
      }
      expect(new Set(qs.map(q => q.prompt.en + q.options[q.answer])).size).toBe(qs.length);
    }
  });
  it('streaks and ranking', () => {
    let p = { name: 'A', score: 0, streak: 0, bestStreak: 0 };
    for (const ok of [true, true, false, true]) p = applyAnswer(p, ok);
    expect(p).toMatchObject({ score: 3, streak: 1, bestStreak: 2 });
    const r = ranking([{ name: 'x', score: 3, streak: 0, bestStreak: 1 }, { name: 'y', score: 3, streak: 0, bestStreak: 3 }, { name: 'z', score: 5, streak: 0, bestStreak: 0 }]);
    expect(r.map(x => x.name)).toEqual(['z', 'y', 'x']);
  });
});

describe('daily', () => {
  const pool = buildPool(CATALOGUE);
  it('pool is deterministic, all landmarks, neighbours mostly far apart', () => {
    expect(buildPool(CATALOGUE).map(i => i.key)).toEqual(pool.map(i => i.key));
    expect(pool).toHaveLength(LANDMARKS.length);
    let far = 0;
    for (let i = 1; i < pool.length; i++) if (haversineKm(pool[i - 1].lat, pool[i - 1].lon, pool[i].lat, pool[i].lon) >= 1200) far++;
    expect(far / (pool.length - 1)).toBeGreaterThan(0.85);
  });
  it('day index is local-calendar based and wraps the pool', () => {
    expect(dayIndex(new Date(2026, 0, 1, 23, 59))).toBe(0);
    expect(dayIndex(new Date(2026, 0, 2, 0, 1))).toBe(1);
    expect(puzzleFor(pool, pool.length + 3)).toBe(pool[3]);
    expect(puzzleFor(pool, -1)).toBe(pool[pool.length - 1]);
  });
  it('bands and arrows', () => {
    const tgt = { lat: 48.858, lon: 2.294 };
    expect(evaluate(tgt, { key: 'a', lat: 48.85, lon: 2.35 }).band).toBe('hit');
    expect(evaluate(tgt, { key: 'b', lat: 41.9, lon: 12.5 }).band).toBe('mild');
    expect(evaluate(tgt, { key: 'c', lat: 52.52, lon: 13.4 }).band).toBe('warm');
    const far = evaluate(tgt, { key: 'd', lat: -33.9, lon: 151.2 });
    expect(far.band).toBe('cold');
    expect(evaluate(tgt, { key: 'e', lat: 30, lon: 2.294 }).arrow).toBe('⬆️');
  });
  it('hints unlock after 2/4/5 misses', () => {
    expect(hintsUnlocked(1)).toEqual([]);
    expect(hintsUnlocked(2)).toEqual(['continent']);
    expect(hintsUnlocked(5)).toEqual(['continent', 'country', 'name']);
  });
  it('game ends on hit or after 6 guesses; stats & streaks; share text', () => {
    let s: DailyState = { day: 10, guesses: [], done: false, won: false };
    const miss = { key: 'm', km: 5000, band: 'cold' as const, arrow: '⬆️' };
    s = applyGuess(s, miss); s = applyGuess(s, { key: 'h', km: 10, band: 'hit', arrow: '🎯' });
    expect(s).toMatchObject({ done: true, won: true });
    expect(applyGuess(s, miss)).toBe(s);
    let st = finishStats({ ...EMPTY_STATS, dist: [...EMPTY_STATS.dist], streak: 2, maxStreak: 2, lastWonDay: 9 }, s);
    expect(st).toMatchObject({ played: 1, won: 1, streak: 3, maxStreak: 3, lastWonDay: 10 });
    expect(st.dist[1]).toBe(1);
    st = finishStats(st, { day: 12, guesses: [], done: true, won: true });
    expect(st.streak).toBe(1);
    expect(shareText(s)).toBe('Terrastra Daily #11 2/6\n🟥⬆️\n🟩🎯');
    let lose: DailyState = { day: 0, guesses: [], done: false, won: false };
    for (let i = 0; i < 6; i++) lose = applyGuess(lose, miss);
    expect(lose).toMatchObject({ done: true, won: false });
    expect(shareText(lose)).toMatch(/X\/6/);
  });
});

describe('progress merge (sync)', () => {
  it('unions collections keeping the earliest time, keeps max records', () => {
    const a = emptyProgress(), b = emptyProgress();
    a.dex = { an_lion: 100, an_panda: 300 }; b.dex = { an_lion: 50, an_koala: 10 };
    a.placeit = { easy: { best: 5000, plays: 2 } }; b.placeit = { easy: { best: 7000, plays: 1 }, hard: { best: 100, plays: 1 } };
    a.quiz = { answered: 10, correct: 7, bySet: { geo: 3 } }; b.quiz = { answered: 20, correct: 5, bySet: { geo: 1, animals: 4 } };
    const m = mergeProgress(a, b);
    expect(m.dex).toEqual({ an_lion: 50, an_panda: 300, an_koala: 10 });
    expect(m.placeit.easy).toEqual({ best: 7000, plays: 2 });
    expect(m.placeit.hard.best).toBe(100);
    expect(m.quiz.answered).toBe(20); expect(m.quiz.correct).toBe(7); expect(m.quiz.bySet).toEqual({ geo: 3, animals: 4 });
  });
  it('unions found/seen and tolerates older saves without them', () => {
    const a = emptyProgress(); a.found = { d1: 5 }; a.seen = { eiffel: 9 };
    const old = { ...emptyProgress() } as Partial<ReturnType<typeof emptyProgress>>;
    delete old.found; delete old.seen;
    const m = mergeProgress(old as ReturnType<typeof emptyProgress>, a);
    expect(m.found).toEqual({ d1: 5 }); expect(m.seen).toEqual({ eiffel: 9 });
  });
  it('is idempotent and commutative for collections', () => {
    const a = emptyProgress(); a.dex = { x: 1 }; a.logs = { y: 2 };
    const b = emptyProgress(); b.dex = { z: 3 };
    expect(mergeProgress(a, a).dex).toEqual(a.dex);
    expect(mergeProgress(a, b).dex).toEqual(mergeProgress(b, a).dex);
  });
  it('likes merge per key: a newer device without them keeps them, an un-like wins only if it is later', () => {
    const a = emptyProgress(); a.likes = { eiffel: 100, sphinx: 100 }; a.updatedAt = 100;
    const b = emptyProgress(); b.likes = { sphinx: -50, taj: 300 }; b.updatedAt = 300;
    expect(mergeProgress(a, b).likes).toEqual({ eiffel: 100, sphinx: 100, taj: 300 });
    b.likes.sphinx = -200;
    const m = mergeProgress(a, b);
    expect(m.likes).toEqual(mergeProgress(b, a).likes);
    expect([isOn(m.likes, 'eiffel'), isOn(m.likes, 'sphinx'), isOn(m.likes, 'taj')]).toEqual([true, false, true]);
    expect(countOn(m.likes)).toBe(2);
  });
  it('merges keys that also name inherited object properties without corrupting progress', () => {
    const a = emptyProgress(), b = emptyProgress();
    const stamps = JSON.parse('{"__proto__":9,"constructor":7,"toString":5}') as Record<string, number>;
    b.dex = stamps;
    b.likes = stamps;
    b.quiz.bySet = stamps;
    b.placeit = JSON.parse('{"__proto__":{"best":12,"plays":2},"constructor":{"best":8,"plays":1}}');
    const m = mergeProgress(a, b);
    expect(m.dex).toEqual(stamps);
    expect(m.likes).toEqual(stamps);
    expect(m.quiz.bySet).toEqual(stamps);
    expect(m.placeit).toEqual(b.placeit);
    expect(Object.getPrototypeOf(m.placeit)).toBe(Object.prototype);
    expect(isProgress(m)).toBe(true);
  });
  it('measures sync requests in UTF-8 bytes rather than characters', () => {
    const p = emptyProgress();
    p.seen = Object.fromEntries(Array.from({ length: 1450 }, (_, i) => [`${'星'.repeat(60)}${String(i).padStart(4, '0')}`, 1]));
    expect(isProgress(p)).toBe(true);
    expect(JSON.stringify({ progress: p }).length).toBeLessThan(MAX_SYNC_REQUEST_BYTES);
    expect(fitsSyncRequest(p)).toBe(false);
  });
  it('validates shape', () => {
    expect(isProgress(emptyProgress())).toBe(true);
    expect(isProgress({ v: 2 })).toBe(false);
    expect(isProgress(null)).toBe(false);
    expect(isProgress({ ...emptyProgress(), dex: null })).toBe(false);
    expect(isProgress({ ...emptyProgress(), seen: { eiffel: 'x' } })).toBe(false);
    expect(isProgress({ ...emptyProgress(), likes: Object.fromEntries(Array.from({ length: 5001 }, (_, i) => ['k' + i, 1])) })).toBe(false);
    expect(isProgress({ ...emptyProgress(), placeit: [] })).toBe(false);
    expect(isProgress({ ...emptyProgress(), placeit: { ['x'.repeat(65)]: { best: 1, plays: 1 } } })).toBe(false);
    const daily = emptyProgress().daily;
    expect(isProgress({ ...emptyProgress(), daily: { ...daily, dist: Array(1e5).fill(0) } })).toBe(false);
    expect(isProgress({ ...emptyProgress(), daily: { ...daily, dist: [0, 0, 0, 0, 0, 'x'] } })).toBe(false);
    expect(isProgress({ ...emptyProgress(), daily: { ...daily, played: 'many' } })).toBe(false);
    expect(isProgress({ ...emptyProgress(), daily: { ...daily, lastWonDay: 20000 } })).toBe(true);
  });
});

describe('stickers', () => {
  it('awards each sticker once', () => {
    const p = emptyProgress();
    p.dex = { an_lion: 1 };
    const got = newlyEarned(p, { animals: 33, discoveries: 14 }, 5);
    expect(got).toEqual(['first_animal']);
    expect(p.stickers.first_animal).toBe(5);
    expect(newlyEarned(p, { animals: 33, discoveries: 14 })).toEqual([]);
  });
});

describe('catalogue & i18n integrity', () => {
  it('keys and slugs are unique, coordinates valid, every item fully named', () => {
    expect(BY_KEY.size).toBe(CATALOGUE.length);
    expect(BY_SLUG.size).toBe(CATALOGUE.length);
    for (const i of CATALOGUE) {
      expect(Math.abs(i.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(i.lon)).toBeLessThanOrEqual(180);
      for (const l of ['en', 'zh'] as const) expect(i.name[l], `${i.key} ${l}`).toBeTruthy();
      expect(i.desc.en.length, i.key).toBeGreaterThan(30);
      expect(i.desc.zh, i.key).toMatch(/[\u4e00-\u9fff]/);
      if (i.funFact) expect(i.funFact.zh, i.key).toMatch(/[\u4e00-\u9fff]/);
      if (i.habitat) expect(i.habitat.zh, i.key).toMatch(/[\u4e00-\u9fff]/);
      expect(i.slug).toMatch(/^[a-z0-9-]+$/);
      if (i.route) expect(i.route.pts.length, i.key).toBeGreaterThanOrEqual(2);
      if (i.season) expect(i.season.month >= 1 && i.season.month <= 12 && i.season.day >= 1 && i.season.day <= 31, i.key).toBe(true);
    }
  });
  it('every hero reference names a lazily loadable pack/builder', async () => {
    await loadHeroesFor(CATALOGUE.map(i => i.model.hero));
    for (const i of CATALOGUE) {
      if (i.model.hero === undefined) continue;
      expect(String(i.model.hero), i.key).toMatch(/^[a-z0-9-]+\/[A-Za-z0-9_]+$/);
      expect(PACK_IDS, i.key).toContain(String(i.model.hero).split('/')[0]);
      expect(heroBuilder(i.model.hero), `${i.key} hero`).toBeTypeOf('function');
    }
    for (const i of CATALOGUE) if (!['landmark', 'animal', 'discovery', 'vehicle'].includes(i.type)) expect(i.model.hero, i.key).toBeTruthy();
  });
  it('Chinese dictionary covers every English key', () => {
    const missing = EN_KEYS.filter(k => !hasKey(k, 'zh'));
    expect(missing).toEqual([]);
  });
  it('keeps the two dictionaries in parity: same keys, same {placeholders}', () => {
    expect(ZH_KEYS.filter(k => !hasKey(k, 'en'))).toEqual([]);
    const vars = (x: string) => [...x.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    // deliberate: Chinese counts in 万 ({w}) where English counts millions ({n}); the caller passes both
    const UNIT_SWAP = new Set(['myaAgo']);
    const bad = EN_KEYS.filter(k => !UNIT_SWAP.has(k) && vars(t(k, undefined, 'en')) !== vars(t(k, undefined, 'zh')));
    const badSky = Object.entries(SKY_TEXT).filter(([, p]) => !p.en || !p.zh || vars(p.en) !== vars(p.zh)).map(([k]) => k);
    expect([...bad, ...badSky]).toEqual([]);
  });
  it('interpolates variables and falls back to English', () => {
    expect(t('round', { r: 2, n: 10 }, 'en')).toBe('Round 2 / 10');
    expect(t('round', { r: 2, n: 10 }, 'zh')).toContain('2');
    expect(t('no_such_key', {}, 'en')).toBe('no_such_key');
  });
  it('builds a valid 3D mesh group for every catalogue item and defines 5 Aura presets', async () => {
    expect(Object.keys(AURA_PRESETS)).toHaveLength(5);
    await loadHeroesFor(CATALOGUE.map(i => i.model.hero));
    for (const item of CATALOGUE) {
      const g = buildFresh(item.model);
      expect(g.children.length, item.key).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe('festival season', async () => {
  const { isHappening, LEAD_DAYS } = await import('../../src/shared/lib/season.ts');
  const nye = { season: { month: 12, day: 31, days: 3 } };
  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);
  it('wraps around the new year (Dec 31 → Jan 2)', () => {
    expect(isHappening(nye, d(2026, 12, 31))).toBe(true);
    expect(isHappening(nye, d(2027, 1, 2))).toBe(true);
    expect(isHappening(nye, d(2027, 1, 3 + LEAD_DAYS))).toBe(false);
  });
  it('multi-day festivals glow for their whole run plus the lead window', () => {
    const f = { season: { month: 7, day: 10, days: 5 } };
    expect(isHappening(f, d(2026, 7, 14))).toBe(true);
    expect(isHappening(f, d(2026, 7, 10 - LEAD_DAYS))).toBe(true);
    expect(isHappening(f, d(2026, 7, 10 - LEAD_DAYS - 1))).toBe(false);
    expect(isHappening(f, d(2026, 7, 15 + LEAD_DAYS - 1))).toBe(true);
    expect(isHappening(f, d(2026, 7, 15 + LEAD_DAYS))).toBe(false);
  });
  it('is not happening far from its date or without a season', () => {
    expect(isHappening({ season: { month: 4, day: 1 } }, d(2026, 10, 19))).toBe(false);
    expect(isHappening({}, d(2026, 10, 19))).toBe(false);
  });
});

describe('wikipedia reader', () => {
  it('splits extracts into lead and sections, dropping references and empty headings', () => {
    const r = parseExtract('Lead one.\n\nLead two.\n== History ==\nOld.\n=== Early ===\nVery old.\n== Gallery ==\n== See also ==\nX\n=== Sub ===\nY\n== Design ==\nTall.');
    expect(r.lead).toEqual(['Lead one.', 'Lead two.']);
    expect(r.sections.map(s => s.title)).toEqual(['History', 'Early', 'Design']);
    expect(r.sections[1].level).toBe(3);
  });
  it('builds language-specific article URLs', () => {
    expect(articleUrl('en', 'Eiffel Tower')).toBe('https://en.wikipedia.org/wiki/Eiffel_Tower');
    expect(articleUrl('zh', '埃菲尔铁塔')).toMatch(/^https:\/\/zh\.wikipedia\.org\/wiki\/.+\?variant=zh-cn$/);
  });
  it('maps every catalogue item to a Wikipedia title', () => {
    for (const i of CATALOGUE) expect(WIKI[i.key]?.[0], i.key).toBeTruthy();
  });
  it('graticule step refines as the camera gets closer', () => {
    expect(graticuleStep(3)).toBeGreaterThan(graticuleStep(1));
    expect(graticuleStep(1)).toBeGreaterThanOrEqual(graticuleStep(0.2));
  });
});

describe('model pipeline (worker transfer + level of detail)', async () => {
  const THREE = await import('three');
  const { packModel, unpackModel } = await import('../../src/client/models/pack.ts');
  const lib = await import('../../src/client/models/library.ts');
  const eiffel = BY_KEY.get('eiffel')!.model, liberty = BY_KEY.get('liberty')!.model;
  const meshes = (o: import('three').Object3D) => {
    const out: import('three').Mesh[] = [];
    o.traverse(x => { if ((x as import('three').Mesh).isMesh) out.push(x as import('three').Mesh); });
    return out;
  };

  it('pack → unpack preserves the tree, geometry, draw ranges and LOD data', async () => {
    await loadHeroesFor([eiffel.hero]);
    const src = buildFresh(eiffel);
    const { model, transfer } = packModel(src);
    expect(transfer.length).toBeGreaterThan(0);
    const back = unpackModel(structuredClone(model));
    const a = meshes(src), b = meshes(back);
    expect(b.length).toBe(a.length);
    a.forEach((m, i) => {
      expect(b[i].geometry.getAttribute('position').count).toBe(m.geometry.getAttribute('position').count);
      expect(b[i].geometry.drawRange.count).toBe(m.geometry.drawRange.count);
      expect(b[i].geometry.userData.lod).toEqual(m.geometry.userData.lod);
      expect(b[i].name).toBe(m.name);
    });
    expect(back.userData.radius).toBeCloseTo(src.userData.radius);
  });

  it('far detail draws a much smaller appended range, and switching back restores full detail', async () => {
    await lib.whenModelReady(liberty); // no Worker in node: falls back to building on the main thread
    expect(lib.modelReady(liberty)).toBe(true);
    const obj = lib.buildModel(liberty);
    const lodMeshes = meshes(obj).filter(m => m.geometry.userData.lod);
    expect(lodMeshes.length).toBeGreaterThan(0);
    const near = (m: import('three').Mesh) => Math.min(m.geometry.drawRange.count, m.geometry.getAttribute('position').count);
    const full = lodMeshes.map(near);
    lib.setModelDetail(obj, true);
    lodMeshes.forEach((m, i) => {
      const [start, count] = m.geometry.userData.lod as [number, number];
      expect(m.geometry.drawRange.start).toBe(start);
      expect(m.geometry.drawRange.count).toBe(count);
      expect(start + count).toBeLessThanOrEqual(m.geometry.getAttribute('position').count);
      expect(count).toBeLessThan(full[i]);
    });
    // instances own their draw range: a second instance is unaffected
    const other = meshes(lib.buildModel(liberty)).filter(m => m.geometry.userData.lod);
    expect(other.map(near)).toEqual(full);
    lib.setModelDetail(obj, false);
    expect(lodMeshes.map(near)).toEqual(full);
    expect(lodMeshes.every(m => m.geometry.drawRange.start === 0)).toBe(true);
  });

  it('the far level keeps thin structures (no part vanishes from the silhouette)', async () => {
    const obj = lib.buildModel(liberty);
    lib.setModelDetail(obj, true);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of meshes(obj)) {
      if (!m.visible) continue;
      const g = m.geometry, p = g.getAttribute('position'), v = new THREE.Vector3();
      for (let i = g.drawRange.start; i < g.drawRange.start + Math.min(g.drawRange.count, p.count); i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
    }
    const full = new THREE.Box3().setFromObject(lib.buildModel(liberty));
    expect(box.max.y).toBeGreaterThan(full.max.y * 0.8); // the raised torch survives
  });
});

describe('living planet real-time layers (ISS orbit, earthquakes, solar/weather)', async () => {
  const { solarStatusAt, describeWmoCode, parseNoaaKp } = await import('../../src/client/lib/weather.ts');
  const {
    ISS_FRESH_TTL_MS,
    propagateIss,
    currentIssOrbitPts,
    refreshIssTelemetry,
    inferAscending,
    resetIssTelemetryForTest,
  } = await import('../../src/client/lib/iss.ts');
  const {
    parseUsgsQuakes,
    quakeColorRgb,
    fallbackQuakes,
    fetchRecentQuakes,
    getQuakeFeedStatus,
    resetQuakeFeedForTest,
  } = await import('../../src/client/lib/earthquakes.ts');

  it('classifies solar daylight vs night and translates all solar/weather/Kp keys in EN and ZH (#2)', () => {
    const noonUtc = Date.UTC(2026, 2, 20, 12, 0, 0); // vernal equinox 12:00 UTC
    const london = solarStatusAt(51.5, 0, noonUtc);
    const auckland = solarStatusAt(-36.8, 174.8, noonUtc);
    expect(london.phase).toBe('day');
    expect(auckland.phase).toBe('night');
    expect(describeWmoCode(0, true).icon).toBe('☀️');
    expect(describeWmoCode(95, false).icon).toBe('⛈️');

    const keys = [
      london.labelKey,
      auckland.labelKey,
      ...[0, 2, 45, 51, 61, 71, 80, 95].map(c => describeWmoCode(c, true).labelKey),
      ...[1, 4, 6].map(k => parseNoaaKp([['time', 'Kp'], ['2026-01-01', String(k)]])!.levelKey),
    ];
    for (const k of keys) {
      expect(hasKey(k, 'en'), `${k} en`).toBe(true);
      expect(hasKey(k, 'zh'), `${k} zh`).toBe(true);
      expect(t(k, undefined, 'en')).not.toBe(k);
      expect(t(k, undefined, 'zh')).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('infers ISS ascending vs descending branch from chronological observations (#4)', () => {
    const t0 = Date.UTC(2026, 3, 20, 0, 0, 0);
    // Ascending pass crossing equator northward (lat -5° -> +5°)
    expect(
      inferAscending(
        { lat: -5, lon: 10, tsMs: t0, ascending: false, hasDirection: false },
        5,
        17,
        t0 + 180_000,
      ).ascending,
    ).toBe(true);
    // Descending pass crossing equator southward (lat +5° -> -5°) even if prior state was ascending=true
    expect(
      inferAscending(
        { lat: 5, lon: 10, tsMs: t0, ascending: true, hasDirection: true },
        -5,
        17,
        t0 + 180_000,
      ).ascending,
    ).toBe(false);
  });

  it('tracks ISS telemetry freshness, staleness TTL, and unavailable fallback (#5, #8)', async () => {
    resetIssTelemetryForTest();
    const t0 = Date.now() - 10_000;
    const est = propagateIss(t0);
    expect(est.status).toBe('estimated');
    expect(est.live).toBe(false);
    expect(est.observedAtMs).toBeNull();
    expect(Math.abs(est.lat)).toBeLessThanOrEqual(52);
    expect(Math.abs(est.lon)).toBeLessThanOrEqual(180);
    expect(est.altitudeKm).toBeGreaterThan(350);

    const origFetch = globalThis.fetch;
    try {
      const obsSec = Math.floor(t0 / 1000);
      globalThis.fetch = (async () => ({
        ok: true,
        json: async () => ({
          latitude: 12.4,
          longitude: 45.8,
          altitude: 419.2,
          velocity: 27585,
          timestamp: obsSec,
        }),
      })) as unknown as typeof fetch;

      await refreshIssTelemetry();
      const fresh = propagateIss(obsSec * 1000 + 10_000);
      expect(fresh.status).toBe('fresh');
      expect(fresh.live).toBe(true);
      expect(fresh.observedAtMs).toBe(obsSec * 1000);
      expect(fresh.ageMs).toBe(10_000);

      // Advancing past ISS_FRESH_TTL_MS transitions telemetry to stale (live: false)
      const stale = propagateIss(obsSec * 1000 + ISS_FRESH_TTL_MS + 60_000);
      expect(stale.status).toBe('stale');
      expect(stale.live).toBe(false);
      expect(stale.ageMs).toBe(ISS_FRESH_TTL_MS + 60_000);

      // When no live fix was ever observed and fetch fails, status is 'unavailable'
      resetIssTelemetryForTest();
      globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
      const unavail = await refreshIssTelemetry();
      expect(unavail.status).toBe('unavailable');
      expect(unavail.live).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
      resetIssTelemetryForTest();
    }

    const orbit = currentIssOrbitPts(t0);
    expect(orbit.pts.length).toBe(16);
    expect(orbit.seg).toBeGreaterThanOrEqual(0);
    expect(orbit.seg).toBeLessThan(16);
    expect(orbit.t).toBeGreaterThanOrEqual(0);
    expect(orbit.t).toBeLessThanOrEqual(1);
  });

  it('distinguishes empty USGS earthquake feeds from fetch failures and avoids fake fallback timestamps (#9)', async () => {
    const parsed = parseUsgsQuakes({
      features: [
        { id: 'q1', properties: { mag: 6.2, place: 'Tonga Trench', time: 1710000000000 }, geometry: { coordinates: [-175.2, -21.1, 410] } },
        { id: 'q2', properties: { mag: 4.5, place: 'Iceland', time: 1710000500000 }, geometry: { coordinates: [-22.4, 63.9, 8] } },
        { id: 'bad', properties: { mag: 1.0 }, geometry: { coordinates: [0, 0, 5] } },
      ],
    });
    expect(parsed.map(q => q.id)).toEqual(['q1', 'q2']);
    expect(quakeColorRgb(10)[0]).toBeGreaterThan(quakeColorRgb(400)[0]); // shallow = redder, deep = bluer
    const fb = fallbackQuakes();
    expect(fb.length).toBeGreaterThanOrEqual(10);
    expect(fb.every(q => q.live === false && q.timeMs === 0)).toBe(true);

    const origFetch = globalThis.fetch;
    try {
      resetQuakeFeedForTest();
      globalThis.fetch = (async () => ({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      })) as unknown as typeof fetch;
      const empty = await fetchRecentQuakes(1710000000000);
      expect(empty).toEqual([]);
      expect(getQuakeFeedStatus()).toBe('empty');

      resetQuakeFeedForTest();
      globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
      const fallback = await fetchRecentQuakes(1710000000000);
      expect(fallback.length).toBeGreaterThanOrEqual(10);
      expect(fallback.every(q => !q.live)).toBe(true);
      expect(getQuakeFeedStatus()).toBe('unavailable');
    } finally {
      globalThis.fetch = origFetch;
      resetQuakeFeedForTest();
    }
  });
});

describe('cross-tab progress store reconciliation (#3)', async () => {
  const { store, updateProgress } = await import('../../src/client/store.ts');
  const toggleStamp = (m: Record<string, number>, k: string) => {
    m[k] = isOn(m, k) ? -Date.now() : Date.now();
  };

  it('merges concurrent localStorage changes from another tab before saving local mutations', () => {
    const storeMap = new Map<string, string>();
    const origStorage = (globalThis as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => { storeMap.set(k, v); },
        removeItem: (k: string) => { storeMap.delete(k); },
      },
    });
    try {
      store.progress = emptyProgress();
      updateProgress(p => { p.dex.an_panda = Date.now(); });
      expect(store.progress.dex.an_panda).toBeGreaterThan(0);

      // Simulate Tab B writing a new seen/like entry directly into localStorage
      const tabB = JSON.parse(storeMap.get('pp.progress')!);
      tabB.seen.taj_mahal = Date.now() + 10;
      tabB.likes.eiffel = Date.now() + 10;
      tabB.updatedAt = Date.now() + 10;
      storeMap.set('pp.progress', JSON.stringify(tabB));

      // Tab A now toggles visited on a different item without reloading
      updateProgress(p => toggleStamp(p.visited, 'colosseum'));
      expect(store.progress.seen.taj_mahal).toBe(tabB.seen.taj_mahal);
      expect(isOn(store.progress.likes, 'eiffel')).toBe(true);
      expect(isOn(store.progress.visited, 'colosseum')).toBe(true);

      // Rapid same-millisecond toggle on -> off preserves the off state after merge
      updateProgress(p => toggleStamp(p.likes, 'sphinx'));
      expect(isOn(store.progress.likes, 'sphinx')).toBe(true);
      updateProgress(p => toggleStamp(p.likes, 'sphinx'));
      expect(isOn(store.progress.likes, 'sphinx')).toBe(false);
      updateProgress(() => {});
      expect(isOn(store.progress.likes, 'sphinx')).toBe(false);
    } finally {
      store.progress = emptyProgress();
      if (origStorage !== undefined) {
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: origStorage });
      }
    }
  });

  it('merges a Daily Planet loss (streak reset to 0 with higher played count) over an older winning state', async () => {
    const { mergeProgress } = await import('../../src/shared/lib/progress.ts');
    const olderWin = emptyProgress();
    olderWin.updatedAt = 1000;
    olderWin.daily = { played: 4, won: 3, streak: 3, maxStreak: 3, lastWonDay: 100, dist: [1, 1, 1, 0, 0, 0] };

    const newerLoss = emptyProgress();
    newerLoss.updatedAt = 2000;
    newerLoss.daily = { played: 5, won: 3, streak: 0, maxStreak: 3, lastWonDay: 100, dist: [1, 1, 1, 0, 0, 0] };

    expect(mergeProgress(olderWin, newerLoss).daily?.streak).toBe(0);
    expect(mergeProgress(olderWin, newerLoss).daily?.played).toBe(5);
    expect(mergeProgress(newerLoss, olderWin).daily?.streak).toBe(0);
    expect(mergeProgress(newerLoss, olderWin).daily?.played).toBe(5);
  });
});

describe('learning journal, earthquake filters, and observing planner', async () => {
  const {
    recordLessonStep,
    recordLessonFinish,
    mergeLessonJournal,
    pickContinueLesson,
  } = await import('../../src/shared/lib/journal.ts');
  const { backupOf, readBackupFull } = await import('../../src/client/lib/backup-file.ts');
  const { filterQuakes } = await import('../../src/client/lib/earthquakes.ts');
  const { parseNightCloudForecast } = await import('../../src/client/lib/weather.ts');
  const { buildObservingIcs } = await import('../../src/client/ui/tonight.ts');

  it('records lesson steps, quiz scores, missed review topics, and merges journals monotonically', () => {
    let jA = recordLessonStep({}, 'latlon', 2, 6, 1000);
    expect(jA.latlon.stepIndex).toBe(2);
    expect(pickContinueLesson(jA)?.id).toBe('latlon');

    let jB = recordLessonStep({}, 'latlon', 4, 6, 1500);
    jB = recordLessonFinish(jB, 'latlon', 3, 4, [['Equator', '赤道']], 6, 2000);
    expect(jB.latlon.bestScore).toBe(3);
    expect(jB.latlon.attempts).toBe(1);
    expect(jB.latlon.missedTopics).toEqual([['Equator', '赤道']]);

    // Retrying with a higher score updates bestScore and replaces missedTopics
    const jRetry = recordLessonFinish(jB, 'latlon', 4, 4, [], 6, 3000);
    expect(jRetry.latlon.bestScore).toBe(4);
    expect(jRetry.latlon.attempts).toBe(2);
    expect(jRetry.latlon.missedTopics).toEqual([]);

    const merged = mergeLessonJournal(jA, jB);
    expect(merged.latlon.bestScore).toBe(3);
    expect(merged.latlon.completedAt).toBe(2000);

    // Backup round-trip preserves lessonsDone and lessonJournal
    const raw = JSON.stringify(backupOf(emptyProgress(), 2500, { lessonsDone: ['latlon'], lessonJournal: merged }));
    const full = readBackupFull(raw);
    expect(full?.lessonsDone).toEqual(['latlon']);
    expect(full?.lessonJournal.latlon.bestScore).toBe(3);
  });

  it('filters earthquakes by minimum magnitude and depth band', () => {
    const sample = [
      { id: 's1', place: 'Shallow 3.2', mag: 3.2, depthKm: 18, lat: 10, lon: 20, timeMs: 100, live: true },
      { id: 'i1', place: 'Inter 5.0', mag: 5.0, depthKm: 140, lat: -10, lon: 120, timeMs: 200, live: true },
      { id: 'd1', place: 'Deep 6.1', mag: 6.1, depthKm: 480, lat: -20, lon: -175, timeMs: 300, live: true },
    ];
    expect(filterQuakes(sample, { minMag: 4.5, depth: 'all' }).map(q => q.id)).toEqual(['i1', 'd1']);
    expect(filterQuakes(sample, { minMag: 2.5, depth: 'shallow' }).map(q => q.id)).toEqual(['s1']);
    expect(filterQuakes(sample, { minMag: 4.5, depth: 'deep' }).map(q => q.id)).toEqual(['d1']);
  });

  it('parses hourly nighttime cloud cover and builds valid RFC 5545 .ics calendar reminders', () => {
    const t0 = Date.UTC(2026, 7, 12, 20, 0, 0);
    const startMs = t0;
    const endMs = t0 + 4 * 3600_000;
    const fc = parseNightCloudForecast({
      hourly: {
        time: [0, 1, 2, 3, 4].map(h => Math.floor((t0 + h * 3600_000) / 1000)),
        cloud_cover: [60, 40, 10, 14, 30],
      },
    }, startMs, endMs);
    expect(fc).not.toBeNull();
    expect(fc!.bestCloudPct).toBe(12);
    expect(fc!.meanCloudPct).toBe(31);
    expect(fc!.verdictKey).toBe('wxPartly');
    expect(fc!.bestWindow).toEqual([t0 + 2 * 3600_000, t0 + 4 * 3600_000]);

    const ics = buildObservingIcs({
      city: 'Beijing, China',
      startMs,
      endMs,
      summary: 'Terrastra Stargazing · Beijing',
      description: 'Best window: 21:00–01:00\nTop targets: Saturn, Perseids',
      nowMs: t0 - 3600_000,
    });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20260812T200000Z\r\n');
    expect(ics).toContain('DTEND:20260813T000000Z\r\n');
    expect(ics).toContain('LOCATION:Beijing\\, China\r\n');
    expect(ics).toContain('DESCRIPTION:Best window: 21:00–01:00\\nTop targets: Saturn\\, Perseids\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });
});

describe('static i18n key coverage, geodesic lab, quake tectonics & explorer field log', () => {
  it('every static t("...") call across src/client resolves in both en and zh dictionaries', () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.isFile() && p.endsWith('.ts')) out.push(p);
      }
      return out;
    };
    const missing: string[] = [];
    const re = /\bt\(\s*(['"])([a-zA-Z0-9_.-]+)\1\s*[,)]/g;
    for (const f of walk(path.resolve('src/client'))) {
      if (f.endsWith(path.join('ssbs', 'terms.ts'))) continue;
      const src = fs.readFileSync(f, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const k = m[2];
        if (!hasKey(k, 'en') || !hasKey(k, 'zh')) {
          missing.push(`${path.relative(process.cwd(), f)}:${k}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('geodesic: antipodes, solar time offset, great-circle summary, and nearest catalogue item', () => {
    expect(wrapLon(180)).toBe(180);
    expect(wrapLon(-180)).toBe(-180);
    expect(wrapLon(190)).toBe(-170);
    expect(antipodeOf(0, 0)).toEqual([0, 180]);
    expect(antipodeOf(39.9, 116.4)).toEqual([-39.9, -63.6]);
    expect(solarTimeOffsetHours(0, 120)).toBe(8);
    expect(solarTimeOffsetHours(170, -170)).toBe(1.3);

    const eiffel = BY_KEY.get('eiffel')!;
    const liberty = BY_KEY.get('liberty')!;
    const sum = greatCircleSummary(eiffel, liberty);
    expect(sum.distanceKm).toBeGreaterThan(5800);
    expect(sum.distanceKm).toBeLessThan(5900);
    expect(sum.circumferencePct).toBeCloseTo((sum.distanceKm / 40075) * 100, 3);
    expect(sum.travelHours.jet).toBeCloseTo(sum.distanceKm / 900, 4);
    expect(sum.travelHours.walk).toBeGreaterThan(sum.travelHours.train);
    expect(sum.lightMs).toBeGreaterThan(19);

    const nearSelf = nearestCatalogueItem(eiffel.lat, eiffel.lon, CATALOGUE);
    expect(nearSelf?.item.key).toBe('eiffel');
    expect(nearSelf?.distanceKm).toBeCloseTo(0, 3);
    const nearOther = nearestCatalogueItem(eiffel.lat, eiffel.lon, CATALOGUE, 'eiffel');
    expect(nearOther?.item.key).not.toBe('eiffel');
    expect(nearOther?.distanceKm).toBeGreaterThan(0);
  });

  it('tectonics: identifies subduction trenches, mid-ocean ridges, intraplate quakes, and nearby volcanoes', () => {
    expect(pointToSegmentKm(0, 5, 0, 0, 0, 10)).toBeCloseTo(0, 1);

    // Off the coast of Honshu (38.1°N, 142.9°E): near Japan Trench and Mount Fuji
    const honshu = analyzeQuakeTectonics(38.1, 142.9);
    expect(honshu.boundaryKind).toBe('trench');
    expect(honshu.boundaryName).toMatch(/Japan Trench/);
    expect(honshu.boundaryDistanceKm).toBeLessThan(200);
    expect(honshu.nearestVolcano).not.toBeNull();

    // Central Mid-Atlantic Ridge (24°N, 45.5°W)
    const mar = analyzeQuakeTectonics(24, -45.5);
    expect(mar.boundaryKind).toBe('ridge');
    expect(mar.boundaryName).toMatch(/Mid-Atlantic Ridge/);
    expect(mar.boundaryDistanceKm).toBeLessThan(50);

    // Central Australia (-25°S, 134°E): far from plate boundaries -> intraplate
    const oz = analyzeQuakeTectonics(-25, 134);
    expect(oz.boundaryKind).toBe('intraplate');
    expect(oz.boundaryDistanceKm).toBeGreaterThan(650);
  });

  it('explorer field log: computes continent/country reach and exports bilingual Markdown', () => {
    const p = emptyProgress();
    p.seen = { eiffel: 1700000000000, greatwall: 1700000100000, machupicchu: 1700000200000 };
    p.dex = { an_panda: 1700000000000 };
    p.stickers = { first_look: 1700000000000 };

    const stats = computeExplorerStats(p);
    expect(stats.stampsCount).toBe(3);
    expect(stats.continentsVisited.sort()).toEqual(['asia', 'europe', 'south-america']);
    expect(stats.countriesVisited).toEqual(['CN', 'FR', 'PE']);
    expect(stats.northernmost?.key).toBe('eiffel');
    expect(stats.southernmost?.key).toBe('machupicchu');

    const mdEn = formatFieldLogMarkdown(p, undefined, 'en', Date.UTC(2026, 7, 12));
    expect(mdEn).toContain('# Terrastra Explorer Field Log (2026-08-12)');
    expect(mdEn).toContain('Continents visited**: 3 / 7');
    expect(mdEn).toContain('Eiffel Tower');
    expect(mdEn).toContain('Machu Picchu');

    const mdZh = formatFieldLogMarkdown(p, undefined, 'zh', Date.UTC(2026, 7, 12));
    expect(mdZh).toContain('# 寰星探索者野外日志 (2026-08-12)');
    expect(mdZh).toContain('3 / 7');
  });

  it('iss pass predictor: computes elevation/azimuth and predicts 24h passes for mid-latitude vs polar observers', () => {
    const overhead = issElevationAndAzimuth(35, 139, 35, 139, 418);
    expect(overhead.elevationDeg).toBeCloseTo(90, 3);
    expect(overhead.slantRangeKm).toBeCloseTo(418, 3);

    const nadir = issElevationAndAzimuth(35, 139, -35, -41, 418);
    expect(nadir.elevationDeg).toBeCloseTo(-90, 2);

    const startMs = Date.UTC(2026, 7, 12, 12, 0, 0);
    const midLatPasses = predictIssPasses(39.9, 116.4, startMs, 24, 10);
    expect(midLatPasses.length).toBeGreaterThan(0);
    for (const p of midLatPasses) {
      expect(p.maxElDeg).toBeGreaterThanOrEqual(10);
      expect(p.durationMin).toBeGreaterThanOrEqual(1);
      expect(['visible', 'daylight', 'eclipsed']).toContain(p.quality);
      expect(p.visible).toBe(p.quality === 'visible');
    }

    // Because ISS orbital inclination is 51.64°, an observer at 89°N never sees the ISS above 10° elevation
    const polarPasses = predictIssPasses(89, 0, startMs, 24, 10);
    expect(polarPasses).toEqual([]);
  });

  it('timeline era notes and backup round-trip for toursDone and bookmarks', () => {
    for (const stop of STOPS) {
      const note = eraNote(stop);
      expect(note.en.length).toBeGreaterThan(20);
      expect(note.zh.length).toBeGreaterThan(10);
    }

    const b1 = [{ route: 'eiffel', cam: { lat: 48.85, lon: 2.35, h: 1.5 }, label: { en: 'Paris', zh: '巴黎' }, at: 1000 }];
    const b2 = [
      { route: 'eiffel', cam: { lat: 48.85, lon: 2.35, h: 1.5 }, label: { en: 'Paris Updated', zh: '巴黎更新' }, at: 2000 },
      { route: 'greatwall', cam: { lat: 39.9, lon: 116.4, h: 1.6 }, label: { en: 'Beijing', zh: '北京' }, at: 1500 },
    ];
    const mergedBm = mergeBookmarks(b1, b2);
    expect(mergedBm.map(b => b.route)).toEqual(['eiffel', 'greatwall']);
    expect(mergedBm[0].label.en).toBe('Paris Updated');

    const raw = JSON.stringify(backupOf(emptyProgress(), 1200, {
      lessonsDone: ['latlon'],
      toursDone: ['wonders', 'oceans'],
      bookmarks: mergedBm,
    }));
    const parsed = readBackupFull(raw);
    expect(parsed?.toursDone).toEqual(['wonders', 'oceans']);
    expect(parsed?.bookmarks).toHaveLength(2);
    expect(parsed?.bookmarks[0].route).toBe('eiffel');
  });
});



