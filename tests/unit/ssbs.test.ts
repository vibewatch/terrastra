import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { countryAt } from '../../src/client/globe/borders.ts';
import { loadCountries } from '../../src/client/globe/painter.ts';
import { CATALOGS, lessonById, nextLesson, subjectOf } from '../../src/client/lessons/data.ts';
import { EXAM_LESSON, MC_BANK, SSBS_LESSONS, makeExam, pointsOf, ssbsCourse } from '../../src/client/lessons/ssbs/index.ts';
import { COUNTRIES, ISLANDS } from '../../src/client/lessons/ssbs/countries.ts';
import { TERMS } from '../../src/client/lessons/ssbs/terms.ts';
import { drillQuiz } from '../../src/client/lessons/ssbs/l-maps.ts';
import { seeded } from '../../src/client/lessons/ssbs/helpers.ts';
import { ssbsOn } from '../../src/client/lib/ssbs.ts';
import { save } from '../../src/client/lib/storage.ts';
import { checkQuiz, checkStep, okLL, okPair } from './lesson-check.ts';

const shapes = (res: string) => loadCountries(JSON.parse(readFileSync(`public/data/countries-${res}.json`, 'utf8')) as Topology);

describe('SSBS class (private)', () => {
  it('is off by default and hides its lessons until switched on', () => {
    expect(ssbsOn()).toBe(false);
    expect(lessonById('ssbs-exam')).toBeUndefined();
    save('ssbs', true);
    try {
      expect(lessonById('ssbs-exam')?.exam).toBe(true);
      expect(subjectOf('ssbs-west')).toBe('ssbs');
    } finally { save('ssbs', false); }
  });

  it('covers the review sheet: 17 terms and 25 countries (16 west, 9 central)', () => {
    expect(TERMS.length).toBe(17);
    expect(new Set(TERMS.map(x => x.term[0])).size).toBe(17);
    expect(TERMS.every(x => okPair(x.term) && okPair(x.def))).toBe(true);
    expect(COUNTRIES.length).toBe(25);
    expect(new Set(COUNTRIES.map(x => x.a2)).size).toBe(25);
    expect(COUNTRIES.filter(x => x.region === 'west').length).toBe(16);
    expect(COUNTRIES.every(x => okPair(x.name) && okPair(x.capital) && okPair(x.fact) && okLL(x.ll) && okLL(x.cap) && x.tolKm > 0)).toBe(true);
  });

  it('puts every country\'s point inside it (and its capital in no other country) on the detailed map, and paints the mainland ones on the coarse one', () => {
    const c50 = shapes('50m'), a110 = new Set(shapes('110m').map(c => c.a2));
    for (const x of COUNTRIES) {
      expect(countryAt(c50, x.ll[0], x.ll[1])?.a2, `${x.a2} point`).toBe(x.a2);
      // coastal capitals (Banjul, Monrovia, Libreville) may sit just off the outline, but never in a neighbour
      expect([x.a2, undefined], `${x.a2} capital`).toContain(countryAt(c50, x.cap[0], x.cap[1])?.a2);
      if (!ISLANDS.has(x.a2)) expect(a110.has(x.a2), `${x.a2} painted`).toBe(true);
    }
  });

  it('has well-formed lessons in a three-part course', () => {
    const ids = SSBS_LESSONS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.startsWith('ssbs-'))).toBe(true);
    expect(ssbsCourse().flatMap(g => g.lessons).map(l => l.id)).toEqual(ids);
    expect(nextLesson('ssbs-terms', CATALOGS.ssbs.def(false))?.id).toBe('ssbs-land');
    for (const l of SSBS_LESSONS) {
      expect(okPair(l.title) && okPair(l.blurb) && l.keys.every(okPair), l.id).toBe(true);
      const made = l.gen ? [l, l.gen(), l.gen()] : [l];
      for (const v of made) {
        expect(v.quiz.length, l.id).toBeGreaterThanOrEqual(3);
        v.steps.forEach((s, j) => checkStep(s, `${l.id} step ${j}`));
        v.quiz.forEach((q, j) => checkQuiz(q, `${l.id} q${j}`));
      }
    }
    // every tagged choice question can go into the practice test
    expect(MC_BANK.length).toBeGreaterThanOrEqual(25);
    expect(MC_BANK.every(q => q.answer === 0 && okPair(q.tag!))).toBe(true);
  });

  it('draws a 30-point practice test: 10 matching, 10 choice, 10 map', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { quiz } = makeExam(seeded(seed));
      const by = (s: string) => quiz.filter(q => q.sec?.[0] === s).reduce((n, q) => n + pointsOf(q), 0);
      expect([by('Matching'), by('Multiple choice'), by('Map')]).toEqual([10, 10, 10]);
      expect(quiz.filter(q => q.at).every(q => q.a2 && !ISLANDS.has(q.a2))).toBe(true);
      expect(new Set(quiz.filter(q => q.match).flatMap(q => q.match!.map(m => m[0][0]))).size).toBe(10);
    }
    expect(EXAM_LESSON.quiz.reduce((n, q) => n + pointsOf(q), 0)).toBe(30);
  });

  it('drills every country once, never asking to find an island', () => {
    const q = drillQuiz(seeded('x'));
    expect(new Set(q.map(x => x.tag![0])).size).toBe(25);
    expect(q.filter(x => x.at).every(x => !ISLANDS.has(x.a2!))).toBe(true);
  });
});
