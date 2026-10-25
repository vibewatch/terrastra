/** Building blocks for the SSBS lessons: country maps, "find it" and "name it" questions, choice questions. */
import { C } from '../kit.ts';
import type { Pair, Quiz } from '../kit.ts';
import type { Mark, Paint, StageScene } from '../stage.ts';
import { AFRICA_CAM, COUNTRIES, ISLANDS, type Country } from './countries.ts';

export const SEC = {
  match: ['Matching', '配对题'] as Pair,
  mc: ['Multiple choice', '选择题'] as Pair,
  map: ['Map', '地图题'] as Pair,
};

const PALETTE = [C.gold, C.blue, C.green, C.pink, C.orange, C.violet, C.teal, C.lime];

/** Countries painted one colour each, island states marked instead (the painted map is too coarse for them). */
export function countryLayer(list: Country[], opts: { names?: boolean; capitals?: boolean; t?: number; a?: number; colour?: string } = {}): { paint: Paint[]; marks: Mark[] } {
  const t0 = opts.t ?? 0.3;
  const paint: Paint[] = [], marks: Mark[] = [];
  list.forEach((x, i) => {
    const c = opts.colour ?? PALETTE[i % PALETTE.length], t = t0 + i * 0.15;
    if (!ISLANDS.has(x.a2)) paint.push({ fill: { k: 'land', a2: [x.a2], c }, t, a: opts.a ?? 0.55 });
    // one label per country (its capital in it too), so small neighbours' labels do not pile up
    const text: Pair | undefined = opts.names ? (opts.capitals ? [`${x.name[0]} · ${x.capital[0]}`, `${x.name[1]} · ${x.capital[1]}`] : x.name) : undefined;
    if (text || ISLANDS.has(x.a2)) marks.push({ ll: x.ll, text, c, t: t + 0.2, dot: ISLANDS.has(x.a2) });
    if (opts.capitals && !ISLANDS.has(x.a2)) marks.push({ ll: x.cap, c: C.white, dot: true, t: t + 0.4 });
  });
  return { paint, marks };
}

/** The region with every country faintly shaded and no names: the board for map questions. */
export function blankMap(extra: { paint?: Paint[]; marks?: Mark[] } = {}): StageScene {
  return {
    cam: AFRICA_CAM, names: false, borders: true,
    paint: [{ fill: { k: 'land', a2: COUNTRIES.map(x => x.a2), c: C.white }, a: 0.14 }, ...(extra.paint ?? [])],
    marks: extra.marks ?? [],
  };
}

/** "Find this country": a tap anywhere inside it (or close to a tiny one) is right. */
export const findQ = (x: Country): Quiz => ({
  q: [`Tap ${x.name[0]} on the map.`, `在地图上点出${x.name[1]}。`],
  at: x.ll, a2: x.a2, tolKm: x.tolKm, tag: x.name, show: blankMap(),
  why: [`${x.name[0]}: ${x.fact[0]}`, `${x.name[1]}：${x.fact[1]}`],
});

/** "Name the highlighted country", with three other countries of the region to choose from. */
export function nameQ(x: Country, others: Country[]): Quiz {
  const hl = { paint: ISLANDS.has(x.a2) ? [] : [{ fill: { k: 'land' as const, a2: [x.a2], c: C.gold }, a: 0.8, t: 0.2 }], marks: [{ ll: x.ll, c: C.gold, dot: true, t: 0.2 }] };
  return {
    q: ['Which country is highlighted in gold?', '金色标出的是哪个国家？'],
    options: [x.name, ...others.slice(0, 3).map(o => o.name)], answer: 0, tag: x.name, show: blankMap(hl),
    why: [`It is ${x.name[0]} (capital ${x.capital[0]}). ${x.fact[0]}`, `这是${x.name[1]}（首都${x.capital[1]}）。${x.fact[1]}`],
  };
}

/** Three other countries for a "name it" question: neighbours on the list first, so the choice is not too easy. */
export function decoys(x: Country, pool: Country[] = COUNTRIES, rand: () => number = seeded(x.a2)): Country[] {
  const rest = pool.filter(o => o.a2 !== x.a2).map(o => ({ o, d: Math.hypot(o.ll[0] - x.ll[0], o.ll[1] - x.ll[1]) + rand() * 8 }));
  return rest.sort((a, b) => a.d - b.d).slice(0, 3).map(r => r.o);
}

/** A choice question; the right answer is written first (they are shown shuffled). */
export const mcq = (q: Pair, right: Pair, wrong: Pair[], why: Pair, tag: Pair): Quiz => ({ q, options: [right, ...wrong], answer: 0, why, tag });

/** A repeatable pseudo-random sequence (so fixed lessons always look the same). */
export function seeded(s: string): () => number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return () => { x = Math.imul(x ^ (x >>> 15), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
}

/** `n` items in random order. */
export function sample<T>(list: readonly T[], n: number, rand: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** "Name — fact." lines for a group of countries, as one paragraph in each language. */
export const factsOf = (list: Country[]): Pair => [
  list.map(x => `${x.name[0]} (${x.capital[0]}): ${x.fact[0]}`).join(' '),
  list.map(x => `${x.name[1]}（${x.capital[1]}）：${x.fact[1]}`).join(''),
];
