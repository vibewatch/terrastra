import { describe, expect, it } from 'vitest';
import { LESSONS, GRADES, STRANDS, VIEWS, course, lessonById, nextLesson, type View } from '../../src/client/lessons/data.ts';
import { CITIES, DIAGRAMS, PYRAMIDS, renderFig, type Fig } from '../../src/client/lessons/figs.ts';
import { biomeOf, climateAt } from '../../src/client/lessons/climate.ts';
import { fitView, oceanAt, tempAt } from '../../src/client/lessons/stage.ts';
import { subsolar } from '../../src/shared/lib/sun.ts';
import { BY_KEY } from '../../src/shared/data/catalogue.ts';
import type { LL, Pair } from '../../src/client/lessons/kit.ts';
import { checkQuiz, checkStep, okLL, okPair, versions } from './lesson-check.ts';
import { shuffled } from '../../src/server/lessons.ts';

describe('geography lessons data', () => {
  it('has unique ids in every grade and finds them by id', () => {
    const ids = LESSONS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of Object.keys(GRADES)) expect(LESSONS.some(l => l.grade === g)).toBe(true);
    expect(lessonById('steps')?.grade).toBe('g8a');
  });

  it('places every lesson in a theme and at least one curriculum, with take-aways', () => {
    for (const l of LESSONS) {
      expect(l.strand in STRANDS, l.id).toBe(true);
      expect(!!l.grade || l.tracks.length > 0, `${l.id} curriculum`).toBe(true);
      expect(l.tracks.every(t => t in VIEWS && t !== 'all' && t !== 'cn' && t !== 'cns'), l.id).toBe(true);
      expect(l.keys.length, `${l.id} keys`).toBeGreaterThanOrEqual(2);
      expect(l.keys.every(okPair), `${l.id} keys`).toBe(true);
    }
    // every curriculum has a real course, and "next" walks it without gaps
    for (const v of Object.keys(VIEWS) as View[]) {
      const flat = course(v).flatMap(g => g.lessons);
      expect(flat.length, v).toBeGreaterThanOrEqual(v === 'all' ? LESSONS.length : 12);
      expect(nextLesson(flat[0].id, v)?.id, v).toBe(flat[1].id);
      expect(nextLesson(flat[flat.length - 1].id, v), v).toBeUndefined();
    }
    expect(course('all').flatMap(g => g.lessons).length).toBe(LESSONS.length);
    expect(course('cn').map(g => g.lessons.length).every(n => n > 0)).toBe(true);
    expect(course('cns').map(g => g.lessons.length).every(n => n > 0)).toBe(true);
    // middle school first within a theme
    for (const g of course('all')) { const s = g.lessons.map(l => l.grade === 'h1' || l.grade === 'h2'); expect(s.indexOf(true) < 0 || s.indexOf(false, s.indexOf(true)) < 0, g.name[0]).toBe(true); }
  });

  it('draws every figure it refers to', () => {
    const figs: Fig[] = LESSONS.flatMap(versions).flatMap(l => [...l.steps.map(s => s.fig), ...l.quiz.map(q => q.fig)]).filter((f): f is Fig => !!f);
    expect(figs.length).toBeGreaterThan(20);
    for (const f of figs) {
      if (f.k === 'climo') { expect(f.city in CITIES, f.city).toBe(true); if (f.b) expect(f.b in CITIES, f.b).toBe(true); }
      if (f.k === 'pyramid') { expect(f.a in PYRAMIDS, f.a).toBe(true); if (f.b) expect(f.b in PYRAMIDS, f.b).toBe(true); }
      if (f.k === 'dia') expect((DIAGRAMS as readonly string[]).includes(f.id), f.id).toBe(true);
      for (const L of [(p: Pair) => p[0], (p: Pair) => p[1]]) {
        const out = renderFig(f, L);
        expect(out.length, f.k).toBeGreaterThan(40);
        expect(out, f.k).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it('is fully bilingual, with valid places, models and answers', () => {
    for (const l of LESSONS) for (const p of [l.title, l.blurb, l.unit]) expect(okPair(p), l.id).toBe(true);
    for (const { steps, quiz, at } of LESSONS.flatMap(versions)) {
      expect(steps.length, at).toBeGreaterThanOrEqual(3);
      expect(quiz.length, at).toBeGreaterThanOrEqual(3);
      for (const s of steps) {
        checkStep(s, at);
        if (s.astro) continue;
        expect(okLL([s.cam[0], s.cam[1]]) && s.cam[2] > 1, `${at} cam`).toBe(true);
        for (const k of s.items ?? []) expect(BY_KEY.has(k), `${at} item ${k}`).toBe(true);
        for (const m of s.marks ?? []) { expect(okLL(m.ll), `${at} mark`).toBe(true); if (m.text) expect(okPair(m.text), `${at} mark ${m.text[0]}`).toBe(true); }
        for (const ln of s.lines ?? []) { expect(ln.pts.length, at).toBeGreaterThanOrEqual(2); expect(ln.pts.every(okLL), `${at} line`).toBe(true); }
        for (const p of s.paint ?? []) if (p.fill.k === 'poly') expect(p.fill.pts.every(okLL), `${at} poly`).toBe(true);
      }
      for (const q of quiz) {
        expect(okPair(q.q) && okPair(q.why), `${at} quiz ${q.q[0]}`).toBe(true);
        checkQuiz(q, at);
      }
    }
  });
});

describe('lesson geometry', () => {
  it('zooms the camera to what a step draws, and leaves whole-globe steps alone', () => {
    // Japan, framed in a 860 × 660 px area of an 800 px tall screen
    const japan: LL[] = [[45.5, 141.7], [31, 130.5], [35.7, 139.7], [33.5, 135.8]];
    const [la, lo, h] = fitView(japan, 860, 660, 800, 35)!;
    expect(la).toBeGreaterThan(36); expect(la).toBeLessThan(40);
    expect(lo).toBeGreaterThan(134); expect(lo).toBeLessThan(138);
    expect(h).toBeGreaterThanOrEqual(0.8); expect(h).toBeLessThan(1.4);
    // a bigger region needs a higher camera; a narrower free area too
    expect(fitView([[50, -5], [36, 28], [60, 25], [40, -9]], 860, 660, 800, 35)![2]).toBeGreaterThan(h);
    expect(fitView(japan, 200, 660, 800, 35)![2]).toBeGreaterThan(h);
    // a single place still shows its surroundings
    expect(fitView([[27.99, 86.93]], 860, 660, 800, 35)![2]).toBe(0.8);
    // places around the world can't be framed from above
    expect(fitView([[0, 0], [0, 120], [0, -120]], 860, 660, 800, 35)).toBeNull();
    expect(fitView([[60, 0], [-60, 150]], 860, 660, 800, 35)).toBeNull();
  });

  it('sorts well-known cities into their textbook climate types', () => {
    const cases: [string, number, number, number, number, string][] = [
      ['Singapore', 1.3, 103.8, 1, 1, 'rainforest'], ['Manaus', -3.1, -60, 20, 15, 'rainforest'], ['Mumbai', 19, 72.9, 0.3, 15, 'tmonsoon'],
      ['Darwin', -12.5, 130.8, 1, 10, 'savanna'], ['Cairo', 30, 31.2, 30, 3, 'desert'], ['Rome', 41.9, 12.5, 1, 3, 'med'],
      ['London', 51.5, -0.1, 3, 1, 'maritime'], ['Shanghai', 31.2, 121.5, 50, 0.3, 'smonsoon'], ['Beijing', 39.9, 116.4, 40, 3, 'tmonsoon2'],
      ['Moscow', 55.8, 37.6, 20, 80, 'continental'], ['Yakutsk', 62, 129.7, 60, 20, 'subarctic'], ['Lhasa', 29.7, 91.1, 60, 30, 'highland'],
      ['Antarctica', -80, 0, 10, 10, 'icecap'],
    ];
    for (const [n, la, lo, dw, de, want] of cases) expect(climateAt(la, lo, dw, de), n).toBe(want);
    expect(biomeOf('rainforest', 0, 0, 1, 1)).toBe('rainforest');
    expect(biomeOf('subarctic', 62, 100, 50, 50)).toBe('taiga');
  });

  it('puts the overhead Sun on the tropics at the solstices and on the equator at the equinoxes', () => {
    expect(subsolar(Date.UTC(2025, 5, 21, 3))[0]).toBeCloseTo(23.44, 0);
    expect(subsolar(Date.UTC(2025, 11, 21, 15))[0]).toBeCloseTo(-23.44, 0);
    expect(Math.abs(subsolar(Date.UTC(2025, 2, 20, 9))[0])).toBeLessThan(0.5);
    // 04:00 UTC: noon over 120°E (Beijing time), give or take the equation of time
    expect(Math.abs(subsolar(Date.UTC(2025, 2, 20, 4))[1] - 120)).toBeLessThan(3);
  });

  it('names the four oceans like the textbook does', () => {
    expect(oceanAt(0, -150)).toBe('pacific');
    expect(oceanAt(10, 150)).toBe('pacific');
    expect(oceanAt(0, -30)).toBe('atlantic');
    expect(oceanAt(-20, 80)).toBe('indian');
    expect(oceanAt(80, 0)).toBe('arctic');
    expect(oceanAt(20, 38)).toBe('indian');
    expect(oceanAt(35, 18)).toBe('atlantic');
  });

  it('makes an illustrative temperature map that follows the seasons', () => {
    expect(tempAt(0, 20, true, 0)).toBeGreaterThan(tempAt(60, 20, true, 0));
    // northern land: hot in July, very cold in January, more extreme than the sea
    expect(tempAt(55, 100, true, 23) - tempAt(55, 100, true, -23)).toBeGreaterThan(tempAt(55, -30, false, 23) - tempAt(55, -30, false, -23));
  });
});

describe('quiz option order', () => {
  it('spreads the right answer (listed first in the data) over every slot, stably', () => {
    const qs = LESSONS.flatMap(l => l.quiz.flatMap((q, k) => (q.options && !q.multi ? [{ q, k, key: `${l.id}#${k}` }] : [])));
    const slot = [0, 0, 0, 0];
    for (const { q, key } of qs) {
      const o = shuffled(q.options!.length, key);
      expect([...o].sort()).toEqual([...q.options!.keys()]);
      expect(shuffled(q.options!.length, key)).toEqual(o);
      if (q.options!.length === 4) slot[o.indexOf(q.answer!)]++;
    }
    const n = slot.reduce((a, b) => a + b, 0);
    expect(n).toBeGreaterThan(100);
    for (const c of slot) expect(c / n).toBeGreaterThan(0.15);
    for (const c of slot) expect(c / n).toBeLessThan(0.35);
  });
  it('never leaves order or match chips in their solved order', () => {
    for (let n = 2; n <= 6; n++) for (const t of ['a', 'bb', 'Which comes first?']) {
      const s = shuffled(n, t + '#3');
      expect([...s].sort()).toEqual([...Array(n).keys()]);
      expect(s.some((v, j) => v !== j)).toBe(true);
    }
  });
});
