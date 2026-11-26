/** Dynamic entry point for Pro World & Human geography lessons (`pro-lessons-world` chunk). */
import { HUMAN } from './l-human.ts';
import { REGIONS_L } from './l-regions.ts';
import { WORLD } from './l-world.ts';
import type { Lesson, Quiz } from './kit.ts';

export const PRO_WORLD_LESSONS: Lesson[] = [
  ...HUMAN,
  ...REGIONS_L,
  ...WORLD,
];

export function proWorldLessonById(id: string): Lesson | undefined {
  return PRO_WORLD_LESSONS.find(l => l.id === id);
}

export function proFindWorldCanonicalQuiz(lessonId: string, qEn: string): Quiz | undefined {
  const direct = proWorldLessonById(lessonId)?.quiz.find(q => q.q[0] === qEn);
  if (direct) return direct;
  for (const l of PRO_WORLD_LESSONS) {
    const found = l.quiz.find(q => q.q[0] === qEn);
    if (found) return found;
  }
  return undefined;
}
