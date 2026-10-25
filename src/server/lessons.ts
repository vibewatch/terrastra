/**
 * Lessons on the server: the catalogue, one lesson at a time in the wire format (figures drawn, answers out),
 * grading, lab-task checks and "where I live" lessons. Pure functions over the lesson data; the HTTP routes and the
 * database live in `web/`.
 */
import { CATALOGS, lessonById, subjectOf, type Lesson, type Quiz, type Step, type Subject } from '../client/lessons/data.ts';
import { renderFig, type Fig } from '../client/lessons/figs.ts';
import { BIOMES, CLIMATES, type Biome, type Climate } from '../client/lessons/climate.ts';
import type { AstroScene } from '../client/lessons/astro/types.ts';
import { haversineKm } from '../shared/lib/geo.ts';
import { mulberry32, shuffle } from '../shared/lib/rng.ts';
import type { Catalogue, Graded, Home, LL, Pair, QuizKind, QuizResponse, WireFig, WireLesson, WireQuiz, WireScene, WireStep } from '../shared/lessons/wire.ts';

export { lessonById, subjectOf };
export type { Lesson, Subject };

/** Lessons anyone can take without an account: a taste of each subject. */
export const FREE_LESSONS: ReadonlySet<string> = new Set(['shape', 'graticule', 'a-sun-moon', 'a-phases']);
export const isFree = (id: string): boolean => FREE_LESSONS.has(id);

// ---------- the catalogue ----------

const catalogues = new Map<Subject, Omit<Catalogue, 'marks' | 'signedIn'>>();
/** A subject's curricula and lesson summaries (no content). */
export function catalogue(sub: Subject): Omit<Catalogue, 'marks' | 'signedIn'> {
  let c = catalogues.get(sub);
  if (c) return c;
  const cat = CATALOGS[sub], lessons: Catalogue['lessons'] = {};
  const views = Object.entries(cat.views).map(([id, v]) => ({
    id, name: v.name, note: v.note,
    groups: cat.course(id).map(g => {
      for (const l of g.lessons) lessons[l.id] ??= { id: l.id, icon: l.icon, title: l.title, unit: l.unit, blurb: l.blurb, minutes: l.minutes, free: isFree(l.id) };
      return { name: g.name, lessons: g.lessons.map(l => l.id) };
    }),
  }));
  c = { subject: sub, key: cat.key, def: { en: cat.def(false), zh: cat.def(true) }, views, lessons };
  catalogues.set(sub, c);
  return c;
}

// ---------- serialising a lesson ----------

const EN = (p: Pair) => p[0], ZH = (p: Pair) => p[1];
const wireFig = (f: Fig): WireFig => ({ html: [renderFig(f, EN), renderFig(f, ZH)] });
const wireScene = (s: AstroScene): WireScene => {
  const { tasks, ...rest } = s;
  return tasks ? { ...rest, tasks: tasks.map(t => ({ text: t.text })) } as WireScene : rest as WireScene;
};
function wireStep(st: Step): WireStep {
  const { fig, astro, ...rest } = st;
  const out: Record<string, unknown> = { ...rest };
  if (fig) out.fig = wireFig(fig);
  if (astro) out.astro = wireScene(astro);
  return out as unknown as WireStep;
}

export function kindOf(q: Quiz): QuizKind {
  if (q.options && q.multi) return 'multi';
  if (q.options) return 'choice';
  if (q.order) return 'order';
  if (q.match) return 'match';
  if (q.num) return 'num';
  if (q.place) return 'place';
  if (q.pick) return 'pick';
  if (q.at) return 'at';
  throw new Error('a question with no way to answer it: ' + q.q[0]);
}

/** 0 … n−1 in a stable shuffled order that is never the identity (for n > 1), seeded by the lesson and question. */
export function shuffled(n: number, key: string): number[] {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);
  // mulberry32 rather than a bare LCG, whose low bits would put the (first-written) right answer in one slot half the time
  const idx = shuffle([...Array(n).keys()], mulberry32(seed >>> 0));
  if (n > 1 && idx.every((v, j) => v === j)) idx.push(idx.shift()!);
  return idx;
}
/** `perm[d]` is the data index shown at display position `d`. */
const perm = (lessonId: string, k: number, n: number) => shuffled(n, `${lessonId}#${k}`);

/** A loose box around the answers (padded and snapped to 10°), to frame the camera without giving them away. */
function looseFrame(pts: LL[]): [LL, LL] {
  const lat = pts.map(p => p[0]), lon = pts.map(p => p[1]);
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v / 10) : Math.floor(v / 10)) * 10;
  const lo: LL = [Math.max(-80, snap(Math.min(...lat) - 12, false)), snap(Math.min(...lon) - 15, false)];
  const hi: LL = [Math.min(80, snap(Math.max(...lat) + 12, true)), snap(Math.max(...lon) + 15, true)];
  return [lo, hi];
}

function wireQuiz(lessonId: string, q: Quiz, k: number): WireQuiz {
  const kind = kindOf(q), out: WireQuiz = { kind, q: q.q };
  if (q.fig) out.fig = wireFig(q.fig);
  if (q.astro) out.astro = wireScene(q.astro);
  switch (kind) {
    case 'choice': case 'multi': out.options = perm(lessonId, k, q.options!.length).map(j => q.options![j]); break;
    case 'order': out.items = perm(lessonId, k, q.order!.length).map(j => q.order![j]); break;
    case 'match': out.left = q.match!.map(p => p[0]); out.right = perm(lessonId, k, q.match!.length).map(j => q.match![j][1]); break;
    case 'num': if (q.num!.unit) out.unit = q.num!.unit; break;
    case 'place': out.labels = q.place!.map(p => p.text); out.frame = looseFrame(q.place!.map(p => p.at)); break;
    case 'at': out.frame = looseFrame([q.at!]); break;
    case 'pick': break;
  }
  return out;
}

/** The right response to a question, in display terms (for development and tests). */
export function answerKey(lessonId: string, q: Quiz, k: number): QuizResponse {
  const kind = kindOf(q);
  const n = q.options?.length ?? q.order?.length ?? q.match?.length ?? 0, p = perm(lessonId, k, n), at = (j: number) => p.indexOf(j);
  switch (kind) {
    case 'choice': return { pick: at(q.answer ?? 0) };
    case 'multi': return { picks: q.multi!.map(at) };
    case 'order': return { seq: q.order!.map((_, j) => at(j)) };
    case 'match': return { pairs: q.match!.map((_, j) => at(j)) };
    case 'num': return { value: q.num!.answer };
    case 'place': return { at: q.place!.map(x => x.at) };
    case 'at': return { at: q.at! };
    case 'pick': return { tag: q.pick! };
  }
}

/** A lesson (or, for "where I live", its steps and quiz once built) in the wire format. */
export function wireLesson(lesson: Lesson, o: { dev?: boolean; built?: { steps: Step[]; quiz: Quiz[] } } = {}): WireLesson {
  const steps = o.built?.steps ?? lesson.steps, quiz = o.built?.quiz ?? lesson.quiz;
  const out: WireLesson = {
    id: lesson.id, subject: subjectOf(lesson.id), icon: lesson.icon, title: lesson.title, minutes: lesson.minutes,
    free: isFree(lesson.id), build: !!lesson.build,
    steps: lesson.build && !o.built ? [] : steps.map(wireStep),
    quiz: lesson.build && !o.built ? [] : quiz.map((q, k) => wireQuiz(lesson.id, q, k)),
  };
  if (o.dev && (!lesson.build || o.built)) out.dev = quiz.map((q, k) => answerKey(lesson.id, q, k));
  return out;
}

// ---------- "where I live" ----------

const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isLL = (v: unknown): v is LL => Array.isArray(v) && v.length === 2 && isNum(v[0], -90, 90) && isNum(v[1], -180, 180);
const regionName = (a2: string, l: string) => { try { return new Intl.DisplayNames([l], { type: 'region' }).of(a2) ?? a2; } catch { return a2; } };

/** The learner's home from the browser's description of it; the country's name is looked up here, not trusted. */
export function parseHome(x: unknown): Home | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!isLL(o.ll)) return null;
  const home: Home = { ll: [o.ll[0], o.ll[1]] };
  if (o.climate !== undefined) { if (typeof o.climate !== 'string' || !(o.climate in CLIMATES)) return null; home.climate = o.climate as Climate; }
  if (o.biome !== undefined) { if (typeof o.biome !== 'string' || !(o.biome in BIOMES)) return null; home.biome = o.biome as Biome; }
  if (o.a2 !== undefined) {
    if (typeof o.a2 !== 'string' || !/^[A-Z]{2}$/.test(o.a2)) return null;
    home.country = { a2: o.a2, name: [regionName(o.a2, 'en'), regionName(o.a2, 'zh')] };
  }
  return home;
}

/** The steps and quiz a run is graded against: the lesson's own, or those written for the learner's home. */
export function content(lesson: Lesson, home: Home | null): { steps: Step[]; quiz: Quiz[] } | null {
  if (!lesson.build) return { steps: lesson.steps, quiz: lesson.quiz };
  return home ? lesson.build(home) : null;
}

// ---------- grading ----------

const isIdx = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
const isPermOf = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(x => isIdx(x, n)) && new Set(v).size === n;
const round1 = (km: number) => Math.round(km * 10) / 10;

/** Grades a response to question `k`; `null` when the response is not a valid answer to this kind of question. */
export function grade(lessonId: string, q: Quiz, k: number, r: unknown): Graded | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>, kind = kindOf(q);
  switch (kind) {
    case 'choice': {
      const n = q.options!.length, p = perm(lessonId, k, n);
      if (!isIdx(o.pick, n)) return null;
      return { ok: p[o.pick] === (q.answer ?? 0), why: q.why, reveal: { kind, right: p.indexOf(q.answer ?? 0) } };
    }
    case 'multi': {
      const n = q.options!.length, p = perm(lessonId, k, n), right = new Set(q.multi);
      if (!Array.isArray(o.picks) || !o.picks.length || o.picks.length > n || !o.picks.every(x => isIdx(x, n)) || new Set(o.picks).size !== o.picks.length) return null;
      const picked = (o.picks as number[]).map(d => p[d]);
      return { ok: picked.length === right.size && picked.every(j => right.has(j)), why: q.why, reveal: { kind, right: q.multi!.map(j => p.indexOf(j)) } };
    }
    case 'order': {
      const n = q.order!.length, p = perm(lessonId, k, n);
      if (!isPermOf(o.seq, n)) return null;
      return { ok: o.seq.every((d, pos) => p[d] === pos), why: q.why, reveal: { kind, right: q.order!.map((_, j) => p.indexOf(j)) } };
    }
    case 'match': {
      const n = q.match!.length, p = perm(lessonId, k, n);
      if (!isPermOf(o.pairs, n)) return null;
      return { ok: o.pairs.every((d, j) => p[d] === j), why: q.why, reveal: { kind, right: q.match!.map((_, j) => p.indexOf(j)) } };
    }
    case 'num': {
      if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return null;
      const { answer, tol, unit } = q.num!;
      return { ok: Math.abs(o.value - answer) <= tol, why: q.why, reveal: unit ? { kind, answer, unit } : { kind, answer } };
    }
    case 'place': {
      const pl = q.place!;
      if (!Array.isArray(o.at) || o.at.length !== pl.length || !o.at.every(isLL)) return null;
      const km = pl.map((x, j) => haversineKm((o.at as LL[])[j][0], (o.at as LL[])[j][1], x.at[0], x.at[1]));
      const ok = pl.map((x, j) => km[j] <= (x.tolKm ?? 500));
      return { ok: ok.every(Boolean), why: q.why, reveal: { kind, at: pl.map(x => x.at), km: km.map(round1), ok } };
    }
    case 'at': {
      if (!isLL(o.at)) return null;
      const km = haversineKm(o.at[0], o.at[1], q.at![0], q.at![1]);
      return { ok: km <= (q.tolKm ?? 500), why: q.why, reveal: { kind, at: q.at!, km: round1(km) } };
    }
    case 'pick': {
      if (typeof o.tag !== 'string' || o.tag.length > 64) return null;
      return { ok: o.tag === q.pick, why: q.why, reveal: { kind, tag: q.pick! } };
    }
  }
}

// ---------- labs ----------

/** The lab sliders' values, clamped to their ranges; `null` if any is missing or not a number. */
function labParams(scene: AstroScene, x: unknown): Record<string, number> | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>, out: Record<string, number> = {};
  for (const p of scene.params ?? []) {
    const v = o[p.id];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out[p.id] = Math.min(p.max, Math.max(p.min, v));
  }
  return out;
}

/** Which of a lab step's tasks hold for these slider values and clock value; `null` for a bad request. */
export function labCheck(step: Step | undefined, params: unknown, value: unknown): boolean[] | null {
  const scene = step?.astro;
  if (!scene?.tasks?.length || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const p = labParams(scene, params);
  if (!p) return null;
  return scene.tasks.map(t => { try { return !!t.done(p, value); } catch { return false; } });
}

/** Slider values that do task `task` at clock value `value`, searched on a grid like a learner would (tests). */
export function labSolve(step: Step | undefined, task: number, value: number): Record<string, number> | null {
  const scene = step?.astro, t = scene?.tasks?.[task];
  if (!scene || !t) return null;
  const N = 20, ps = scene.params ?? [];
  const vals = (p: (typeof ps)[number]) => Array.from({ length: N + 1 }, (_, k) => {
    const st = p.step ?? (p.max - p.min) / 100, x = p.min + (k * (p.max - p.min)) / N;
    return p.min + Math.round((x - p.min) / st) * st;
  });
  const grid = ps.reduce<Record<string, number>[]>((acc, p) => acc.flatMap(a => vals(p).map(v => ({ ...a, [p.id]: v }))), [{}]);
  return grid.find(g => { try { return t.done(g, value); } catch { return false; } }) ?? null;
}
