/** Dynamic entry point for Pro China geography lessons (`pro-lessons-china` chunk). */
import { CHINA } from './l-china.ts';
import { CHINA_B } from './l-china2.ts';
import { CHINA_C } from './l-china3.ts';
import { CHINA_D } from './l-china4.ts';
import type { Lesson, Quiz } from './kit.ts';

export const PRO_CHINA_LESSONS: Lesson[] = [
  ...CHINA,
  ...CHINA_B,
  ...CHINA_C,
  ...CHINA_D,
];

export function proChinaLessonById(id: string): Lesson | undefined {
  return PRO_CHINA_LESSONS.find(l => l.id === id);
}

export function proFindChinaCanonicalQuiz(lessonId: string, qEn: string): Quiz | undefined {
  const direct = proChinaLessonById(lessonId)?.quiz.find(q => q.q[0] === qEn);
  if (direct) return direct;
  for (const l of PRO_CHINA_LESSONS) {
    const found = l.quiz.find(q => q.q[0] === qEn);
    if (found) return found;
  }
  return undefined;
}
