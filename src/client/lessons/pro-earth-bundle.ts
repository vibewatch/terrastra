/** Dynamic entry point for Pro Earth, Maps, Physical, Climate & Senior geography lessons (`pro-lessons-earth` chunk). */
import { EARTH_B } from './l-earth2.ts';
import { MAPS } from './l-maps.ts';
import { PHYSICAL } from './l-physical.ts';
import { CLIMATE_L } from './l-climate.ts';
import { SENIOR_A } from './l-senior1.ts';
import { SENIOR_B } from './l-senior2.ts';
import type { Lesson, Quiz } from './kit.ts';

export const PRO_EARTH_LESSONS: Lesson[] = [
  ...EARTH_B,
  ...MAPS,
  ...PHYSICAL,
  ...CLIMATE_L,
  ...SENIOR_A,
  ...SENIOR_B,
];

export function proEarthLessonById(id: string): Lesson | undefined {
  return PRO_EARTH_LESSONS.find(l => l.id === id);
}

export function proFindEarthCanonicalQuiz(lessonId: string, qEn: string): Quiz | undefined {
  const direct = proEarthLessonById(lessonId)?.quiz.find(q => q.q[0] === qEn);
  if (direct) return direct;
  for (const l of PRO_EARTH_LESSONS) {
    const found = l.quiz.find(q => q.q[0] === qEn);
    if (found) return found;
  }
  return undefined;
}
