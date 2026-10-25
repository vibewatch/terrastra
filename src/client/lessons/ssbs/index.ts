/** The SSBS class: a review course for the Grade 6 test on West and Central Africa (key terms, history, today, and the map). */
import type { Lesson, Pair, Quiz, Step } from '../kit.ts';
import { AFRICA_CAM, COUNTRIES, ISLANDS } from './countries.ts';
import { TERMS } from './terms.ts';
import { countryLayer, decoys, findQ, nameQ, sample, SEC } from './helpers.ts';
import { EMPIRES_LESSON, LAND_LESSON, TERMS_LESSON } from './l-study1.ts';
import { COLONIAL_LESSON, SLAVERY_LESSON } from './l-study2.ts';
import { TODAY_LESSON } from './l-today.ts';
import { CENTRAL_LESSON, DRILL_LESSON, WEST_LESSON } from './l-maps.ts';

const unit = ['SSBS · West and Central Africa', 'SSBS · 西非与中非'] as const;
const STUDY = [TERMS_LESSON, LAND_LESSON, EMPIRES_LESSON, SLAVERY_LESSON, COLONIAL_LESSON, TODAY_LESSON];
const MAPS = [WEST_LESSON, CENTRAL_LESSON, DRILL_LESSON];

/** Every tagged choice question of the study and map lessons: the bank the practice test draws from. */
export const MC_BANK: Quiz[] = [...STUDY, WEST_LESSON, CENTRAL_LESSON].flatMap(l => l.quiz).filter(q => q.options && q.tag && !q.show);

const EXAM_INTRO: Step = {
  title: ['Practice test: 30 points', '模拟测试：30 分'], cam: AFRICA_CAM, names: false, borders: true,
  ...countryLayer(COUNTRIES, { a: 0.3, t: 0.1 }),
  body: ['Like the real test: 10 matching (each pair is a point), 10 multiple choice and 10 map questions. Every time you start, the questions are drawn afresh. At the end you will see your score in each part and what to review.',
    '和正式考试一样：10 道配对题（每对 1 分）、10 道选择题和 10 道地图题。每次开始都会重新抽题。最后会显示每一部分的得分和需要复习的内容。'],
};

/** A fresh 30-point practice test: 2 × 5 matching pairs, 10 choice questions, 5 "find it" and 5 "name it". */
export function makeExam(rand: () => number = Math.random): { steps: Step[]; quiz: Quiz[] } {
  const terms = sample(TERMS, 10, rand);
  const match = [terms.slice(0, 5), terms.slice(5)].map((ts, i): Quiz => ({
    q: [`Match each term to its definition (${i + 1} of 2).`, `把每个词语和它的定义配对（第 ${i + 1} 组，共 2 组）。`],
    match: ts.map(x => [x.term, x.def] as const), sec: SEC.match,
    why: [ts.map(x => `${x.term[0]}: ${x.def[0]}`).join(' '), ts.map(x => `${x.term[1]}：${x.def[1]}`).join('')],
  }));
  const mc = sample(MC_BANK, 10, rand).map(q => ({ ...q, sec: SEC.mc }));
  const places = sample(COUNTRIES, 10, rand).sort((a, b) => Number(ISLANDS.has(a.a2)) - Number(ISLANDS.has(b.a2)));
  const map = places.map((x, i) => ({ ...(i < 5 ? findQ(x) : nameQ(x, decoys(x, COUNTRIES, rand))), sec: SEC.map }));
  return { steps: [EXAM_INTRO], quiz: [...match, ...mc, ...map] };
}

/** Points a quiz is worth: one per matching pair, otherwise one. */
export const pointsOf = (q: Quiz): number => q.match?.length ?? 1;

const first = makeExam(() => 0.5);
export const EXAM_LESSON: Lesson = {
  id: 'ssbs-exam', strand: 'world', tracks: [], unit, icon: 'trophy', minutes: 20, exam: true,
  title: ['Practice test (30 points)', '模拟测试（30 分）'],
  blurb: ['Matching, multiple choice and map questions, like the real test, drawn afresh each time.', '配对、选择和地图题，与正式考试题型相同，每次重新抽题。'],
  keys: [['Review what you missed, then take the test again: the questions change each time.', '复习做错的内容，再做一次测试：每次的题目都不一样。']],
  steps: first.steps, quiz: first.quiz, gen: () => makeExam(),
};

export const SSBS_LESSONS: Lesson[] = [...STUDY, ...MAPS, EXAM_LESSON];

export const SSBS_VIEWS: Record<string, { name: Pair; note: Pair }> = {
  ssbs: {
    name: ['SSBS · Grade 6: West & Central Africa', 'SSBS · 六年级：西非与中非'],
    note: ['Review for the World Geography test: 17 key terms, history and today, and the map of 25 countries.', '世界地理测试复习：17 个关键词、历史与现状，以及 25 个国家的地图。'],
  },
};

/** The course in three parts: study, map, practice test. */
export const ssbsCourse = (): { name: Pair; lessons: Lesson[] }[] => [
  { name: ['Study', '学习'], lessons: STUDY },
  { name: ['Map', '地图'], lessons: MAPS },
  { name: ['Practice test', '模拟测试'], lessons: [EXAM_LESSON] },
];
