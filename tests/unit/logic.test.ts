import { describe, it, expect } from 'vitest';
import { haversineKm, bearingDeg, arrow8, latLonToVec, vecToLatLon, formatKm } from '../../src/shared/lib/geo.ts';
import { mulberry32 } from '../../src/shared/lib/rng.ts';
import { DIFFS, scoreFor, effectiveKm, verdict, pickRounds, updateRecord, ROUNDS } from '../../src/shared/games/placeit.ts';
import { generateQuiz, applyAnswer, ranking, LEVEL_OPTIONS, QUIZ_SETS } from '../../src/shared/games/quiz.ts';
import { buildPool, dayIndex, puzzleFor, evaluate, applyGuess, finishStats, hintsUnlocked, shareText, EMPTY_STATS, type DailyState } from '../../src/shared/games/daily.ts';
import { emptyProgress, mergeProgress, isProgress, isOn, countOn } from '../../src/shared/lib/progress.ts';
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
  it('validates shape', () => {
    expect(isProgress(emptyProgress())).toBe(true);
    expect(isProgress({ v: 2 })).toBe(false);
    expect(isProgress(null)).toBe(false);
    expect(isProgress({ ...emptyProgress(), dex: null })).toBe(false);
    expect(isProgress({ ...emptyProgress(), seen: { eiffel: 'x' } })).toBe(false);
    expect(isProgress({ ...emptyProgress(), likes: Object.fromEntries(Array.from({ length: 5001 }, (_, i) => ['k' + i, 1])) })).toBe(false);
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
