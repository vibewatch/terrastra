import type { CatalogueItem, I18n, Lang } from '../data/types.ts';
import { tr } from '../data/types.ts';
import { shuffle, pick } from '../lib/rng.ts';
import { CITIES, cityName } from '../data/cities.ts';
import { CONTINENT_NAMES } from '../data/iso.ts';

export type QuizSet = 'mixed' | 'animals' | 'geo' | 'landmarks' | 'secrets';
export type QuizLevel = 'easy' | 'normal' | 'hard';
export const LEVEL_OPTIONS: Record<QuizLevel, number> = { easy: 2, normal: 3, hard: 5 };
export const QUIZ_SETS: QuizSet[] = ['mixed', 'animals', 'geo', 'landmarks', 'secrets'];

export interface Question {
  id: string;
  set: Exclude<QuizSet, 'mixed'>;
  prompt: I18n;
  options: string[];
  answer: number;
  focus?: { lat: number; lon: number };
}

interface Ctx { items: CatalogueItem[]; lang: Lang; rnd: () => number; nOpts: number; country: (a2: string) => string }

type Template = { id: string; set: Question['set']; make: (c: Ctx) => Question | null };

function build(id: string, set: Question['set'], prompt: I18n, correct: string, wrongPool: string[], c: Ctx, focus?: Question['focus']): Question | null {
  const wrong = shuffle([...new Set(wrongPool.filter(w => w && w !== correct))], c.rnd).slice(0, c.nOpts - 1);
  if (wrong.length < c.nOpts - 1) return null;
  const options = shuffle([correct, ...wrong], c.rnd);
  return { id, set, prompt, options, answer: options.indexOf(correct), focus };
}

const by = (c: Ctx, type: CatalogueItem['type']) => c.items.filter(i => i.type === type);
const nm = (c: Ctx, i: CatalogueItem) => tr(i.name, c.lang);

const TEMPLATES: Template[] = [
  { id: 'lm_country', set: 'landmarks', make: c => {
    const lms = by(c, 'landmark').filter(i => i.country); const it = pick(lms, c.rnd);
    return build('lm_country', 'landmarks', { en: `In which country is ${tr(it.name, 'en')}?`, zh: `${tr(it.name, 'zh')}在哪个国家？` },
      c.country(it.country!), lms.map(l => c.country(l.country!)), c, it);
  } },
  { id: 'lm_tallest', set: 'landmarks', make: c => {
    const lms = shuffle(by(c, 'landmark').filter(i => i.facts?.heightM && i.sub !== 'mountain' && i.sub !== 'volcano'), c.rnd).slice(0, c.nOpts);
    if (lms.length < c.nOpts) return null;
    const top = lms.reduce((a, b) => (a.facts!.heightM! >= b.facts!.heightM! ? a : b));
    return build('lm_tallest', 'landmarks', { en: 'Which of these is the tallest?', zh: '下面哪一个最高？' }, nm(c, top), lms.map(l => nm(c, l)), c);
  } },
  { id: 'lm_oldest', set: 'landmarks', make: c => {
    const lms = shuffle(by(c, 'landmark').filter(i => i.facts?.built !== undefined), c.rnd).slice(0, c.nOpts);
    if (lms.length < c.nOpts) return null;
    const old = lms.reduce((a, b) => (a.facts!.built! <= b.facts!.built! ? a : b));
    return build('lm_oldest', 'landmarks', { en: 'Which of these was built first?', zh: '下面哪一个最早建成？' }, nm(c, old), lms.map(l => nm(c, l)), c);
  } },
  { id: 'an_diet', set: 'animals', make: c => {
    if (c.nOpts > 3) return null;
    const an = by(c, 'animal'); const it = pick(an, c.rnd); const diets = ['carnivore', 'herbivore', 'omnivore'];
    const label = (d: string) => ({ carnivore: { en: 'Meat-eater', zh: '吃肉' }, herbivore: { en: 'Plant-eater', zh: '吃植物' }, omnivore: { en: 'Eats everything', zh: '什么都吃' } } as Record<string, I18n>)[d];
    return build('an_diet', 'animals', { en: `What does the ${tr(it.name, 'en').toLowerCase()} eat?`, zh: `${tr(it.name, 'zh')}吃什么？` },
      tr(label(it.diet!), c.lang), diets.map(d => tr(label(d), c.lang)), c, it);
  } },
  { id: 'an_endangered', set: 'animals', make: c => {
    const an = by(c, 'animal'); const risky = an.filter(a => a.status === 'EN' || a.status === 'CR'); const safe = an.filter(a => a.status === 'LC');
    const it = pick(risky, c.rnd);
    return build('an_endangered', 'animals', { en: 'Which animal is endangered?', zh: '哪种动物濒临灭绝？' }, nm(c, it), safe.map(a => nm(c, a)), c);
  } },
  { id: 'an_heaviest', set: 'animals', make: c => {
    const an = shuffle(by(c, 'animal').filter(a => a.facts?.weightKg), c.rnd).slice(0, c.nOpts);
    if (an.length < c.nOpts) return null;
    const top = an.reduce((a, b) => (a.facts!.weightKg! >= b.facts!.weightKg! ? a : b));
    return build('an_heaviest', 'animals', { en: 'Which animal is the heaviest?', zh: '哪种动物最重？' }, nm(c, top), an.map(a => nm(c, a)), c);
  } },
  { id: 'an_where', set: 'animals', make: c => {
    const an = by(c, 'animal').filter(a => a.continent !== 'ocean' && a.continent !== 'antarctica'); const it = pick(an, c.rnd);
    const conts = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania'] as const;
    const label = (k: CatalogueItem['continent']) => CONTINENT_NAMES[k][c.lang];
    return build('an_where', 'animals', { en: `On which continent can you find the wild ${tr(it.name, 'en').toLowerCase()} on our globe?`, zh: `在地球仪上，野生的${tr(it.name, 'zh')}生活在哪个大洲？` },
      label(it.continent), conts.map(label), c, it);
  } },
  { id: 'geo_capital', set: 'geo', make: c => {
    const caps = CITIES.filter(x => x[5]); const it = pick(caps, c.rnd);
    return build('geo_capital', 'geo', { en: `What is the capital of ${c.country(it[1])}?`, zh: `${c.country(it[1])}的首都是哪里？` }, cityName(it[0], c.lang), caps.map(x => cityName(x[0], c.lang)), c, { lat: it[2], lon: it[3] });
  } },
  { id: 'geo_northmost', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts); const top = cs.reduce((a, b) => (a[2] >= b[2] ? a : b));
    return build('geo_northmost', 'geo', { en: 'Which city is furthest north?', zh: '哪座城市最靠北？' }, cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c);
  } },
  { id: 'geo_southmost', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts); const top = cs.reduce((a, b) => (a[2] <= b[2] ? a : b));
    return build('geo_southmost', 'geo', { en: 'Which city is furthest south?', zh: '哪座城市最靠南？' }, cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c);
  } },
  { id: 'geo_equator', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts); const top = cs.reduce((a, b) => (Math.abs(a[2]) <= Math.abs(b[2]) ? a : b));
    return build('geo_equator', 'geo', { en: 'Which city is closest to the equator?', zh: '哪座城市离赤道最近？' }, cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c);
  } },
  { id: 'sec_kind', set: 'secrets', make: c => {
    const ds = by(c, 'discovery'); const it = pick(ds, c.rnd);
    const kinds: Record<string, I18n> = { wreck: { en: 'A shipwreck', zh: '一艘沉船' }, mystery: { en: 'A mystery', zh: '一个未解之谜' }, cryptid: { en: 'A legendary creature', zh: '一种传说中的生物' }, deepsea: { en: 'A deep-sea place', zh: '一个深海地点' }, extreme: { en: 'An extreme place', zh: '一个极端的地方' }, restricted: { en: 'A secret base', zh: '一个秘密基地' } };
    if (!kinds[it.sub]) return null;
    return build('sec_kind', 'secrets', { en: `What is “${tr(it.name, 'en')}”?`, zh: `“${tr(it.name, 'zh')}”是什么？` },
      tr(kinds[it.sub], c.lang), Object.values(kinds).map(k => tr(k, c.lang)), c, it);
  } },
  { id: 'sec_deepest', set: 'secrets', make: c => {
    const ds = shuffle(by(c, 'discovery').filter(d => d.facts?.depthM), c.rnd).slice(0, c.nOpts);
    if (ds.length < c.nOpts) return null;
    const top = ds.reduce((a, b) => (a.facts!.depthM! >= b.facts!.depthM! ? a : b));
    return build('sec_deepest', 'secrets', { en: 'Which of these lies deepest underwater?', zh: '下面哪一个位于最深的海底？' }, nm(c, top), ds.map(d => nm(c, d)), c);
  } },
];

export function generateQuiz(items: CatalogueItem[], set: QuizSet, level: QuizLevel, n: number, lang: Lang,
  country: (a2: string) => string, rnd: () => number = Math.random): Question[] {
  const c: Ctx = { items, lang, rnd, nOpts: LEVEL_OPTIONS[level], country };
  const tpls = TEMPLATES.filter(t => set === 'mixed' || t.set === set);
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const q = pick(tpls, rnd).make(c);
    if (!q) continue;
    const sig = q.prompt.en + '|' + q.options[q.answer];
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(q);
  }
  return out;
}

export interface PlayerScore { name: string; score: number; streak: number; bestStreak: number }
export function applyAnswer(p: PlayerScore, correct: boolean): PlayerScore {
  const streak = correct ? p.streak + 1 : 0;
  return { ...p, score: p.score + (correct ? 1 : 0), streak, bestStreak: Math.max(p.bestStreak, streak) };
}
export function ranking(players: PlayerScore[]): PlayerScore[] {
  return players.slice().sort((a, b) => b.score - a.score || b.bestStreak - a.bestStreak);
}
