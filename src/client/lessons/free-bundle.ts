/** Free starter lessons and private SSBS class lessons, bundled into public chunks without importing Pro lesson modules. */
import { EARTH_A } from './l-earth.ts';
import { LAND } from './l-land.ts';
import { HOME } from './l-home.ts';
import { SENIOR_FREE } from './free-senior.ts';
import { A_EARTHMOON } from './astro/l-earthmoon.ts';
import { A_SOLAR_FREE } from './astro/free-solar.ts';
import { SSBS_LESSONS } from './ssbs/index.ts';
import { ssbsOn } from '../lib/ssbs.ts';
import { isFreeLesson } from '../../shared/lib/entitlements.ts';
import type { Lesson, Quiz } from './kit.ts';

const FREE_LESSONS: Lesson[] = [
  ...EARTH_A,
  ...LAND,
  ...HOME,
  ...SENIOR_FREE,
  ...A_EARTHMOON,
  ...A_SOLAR_FREE,
].filter(l => isFreeLesson(l.id));

export function freeLessonById(id: string): Lesson | undefined {
  if (id.startsWith('ssbs-')) return ssbsOn() ? SSBS_LESSONS.find(l => l.id === id) : undefined;
  return FREE_LESSONS.find(l => l.id === id);
}

export function findFreeCanonicalQuiz(lessonId: string, qEn: string): Quiz | undefined {
  const direct = freeLessonById(lessonId)?.quiz.find(q => q.q[0] === qEn);
  if (direct) return direct;
  for (const l of FREE_LESSONS) {
    const found = l.quiz.find(q => q.q[0] === qEn);
    if (found) return found;
  }
  if (ssbsOn()) {
    for (const l of SSBS_LESSONS) {
      const found = l.quiz.find(q => q.q[0] === qEn);
      if (found) return found;
    }
  }
  return undefined;
}
