/** Dynamic entry point for Pro geography lessons; isolated from `astro/data.ts` so geography and astronomy Pro chunks load independently. */
import { EARTH_A } from './l-earth.ts';
import { EARTH_B } from './l-earth2.ts';
import { LAND } from './l-land.ts';
import { REGIONS_L } from './l-regions.ts';
import { CHINA } from './l-china.ts';
import { MAPS } from './l-maps.ts';
import { PHYSICAL } from './l-physical.ts';
import { CLIMATE_L } from './l-climate.ts';
import { HUMAN } from './l-human.ts';
import { WORLD } from './l-world.ts';
import { CHINA_B } from './l-china2.ts';
import { CHINA_C } from './l-china3.ts';
import { CHINA_D } from './l-china4.ts';
import { SENIOR_A } from './l-senior1.ts';
import { SENIOR_B } from './l-senior2.ts';
import { HOME } from './l-home.ts';
import { EXTRA_GRADE_LESSONS, createGradeBankLessons, ALL_EXTRA_QUIZ } from './l-grade-banks.ts';
import type { Lesson, Quiz } from './kit.ts';

const BASE_GEO: Lesson[] = [
  ...EARTH_A, ...EARTH_B, ...MAPS, ...LAND, ...PHYSICAL, ...CLIMATE_L, ...HUMAN, ...REGIONS_L, ...WORLD,
  ...CHINA, ...CHINA_B, ...CHINA_C, ...CHINA_D, ...HOME, ...SENIOR_A, ...SENIOR_B, ...EXTRA_GRADE_LESSONS,
];
const ALL_GEO: Lesson[] = [...BASE_GEO, ...createGradeBankLessons(BASE_GEO)];

export function proLessonById(id: string): Lesson | undefined {
  return ALL_GEO.find(l => l.id === id);
}

export function proFindCanonicalQuiz(lessonId: string, qEn: string): Quiz | undefined {
  const direct = proLessonById(lessonId)?.quiz.find(q => q.q[0] === qEn);
  if (direct) return direct;
  for (const l of ALL_GEO) {
    const found = l.quiz.find(q => q.q[0] === qEn);
    if (found) return found;
  }
  return ALL_EXTRA_QUIZ.find(q => q.q[0] === qEn);
}
