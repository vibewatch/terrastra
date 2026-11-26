/** Dynamic entry point for Pro astronomy lessons; isolated into `pro-lessons-astro-*.js` so opening an astronomy lesson never downloads geography chunks. */
import { ASTRO_LESSONS } from './astro/data.ts';
import type { Lesson, Quiz } from './kit.ts';

export function proAstroLessonById(id: string): Lesson | undefined {
  return ASTRO_LESSONS.find(l => l.id === id);
}

export function proFindAstroCanonicalQuiz(lessonId: string, qEn: string): Quiz | undefined {
  const direct = proAstroLessonById(lessonId)?.quiz.find(q => q.q[0] === qEn);
  if (direct) return direct;
  for (const l of ASTRO_LESSONS) {
    const found = l.quiz.find(q => q.q[0] === qEn);
    if (found) return found;
  }
  return undefined;
}
