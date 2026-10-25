/** Shared types and small builders for the lesson data files. */
import type { IconName } from '../ui/icons.ts';
import type { LL, Line, Mark, Pair, StageScene } from './stage.ts';
import type { Fig } from './figs.ts';
import type { AstroScene } from './astro/types.ts';

export type { LL, Pair, Fig, AstroScene };

export interface Quiz {
  q: Pair;
  /** choice question */
  options?: Pair[]; answer?: number;
  /** "find it on the globe" question: tap within `tolKm` of `at` */
  at?: LL; tolKm?: number;
  /** with `at`: "find this country" — a tap anywhere inside the country (ISO a2) is right too */
  a2?: string;
  /** what the globe shows with the question, instead of the default view (e.g. "name the highlighted country") */
  show?: StageScene;
  /** practice tests: the exam section the question belongs to */
  sec?: Pair;
  /** what to review when this is missed (a term, a country…) */
  tag?: Pair;
  /** a chart or diagram to read (a climate graph to identify, a pyramid to interpret…) */
  fig?: Fig;
  /** astronomy: the 3D scene shown with the question (instead of the globe) */
  astro?: AstroScene;
  /** "find it in the scene" question: tap the object the kit tagged with this name (`ctx.pickable`) */
  pick?: string;
  /** with `options`: several right answers (indices); all of them, and only them, must be picked */
  multi?: number[];
  /** "put in order": the items as written are the right order; they are shown shuffled */
  order?: Pair[];
  /** "match the pairs": [left, right] as written belong together; the right column is shown shuffled */
  match?: (readonly [Pair, Pair])[];
  /** "work it out": a number typed in, right within ± `tol` */
  num?: { answer: number; tol: number; unit?: Pair };
  /** "label the map": tap where each label goes on the globe; right when every one is within its `tolKm` (default 500) */
  place?: { text: Pair; at: LL; tolKm?: number }[];
  why: Pair;
}
interface StepText {
  title: Pair; body: Pair;
  /** the drawing is a simplified sketch, not measured data */
  sketch?: boolean;
  /** offer a button into the sky theatre's seasons model */
  sky?: 'seasons';
  /** a chart or diagram shown in the card, next to what the globe draws */
  fig?: Fig;
  /** "try it": something for the learner to do in the scene (turn the globe, drag a slider…) */
  task?: Pair;
}
/** A step draws on the globe (`StageScene`) or, in astronomy lessons, runs a 3D kit on its own board (`astro`). */
export type Step = (StepText & StageScene & { astro?: undefined }) | (StepText & { astro: AstroScene });
/**
 * Volumes of the Chinese PEP (人教版) geography textbooks: middle school (grades 7–8), and senior high school
 * (`h1` compulsory volume 1, `h2` elective volume 1: physical geography).
 */
export type Grade = 'g7a' | 'g7b' | 'g8a' | 'g8b' | 'h1' | 'h2';
/** The big themes every curriculum shares; the "all topics" view and the international tracks group by these. */
export type Strand = 'maps' | 'physical' | 'climate' | 'human' | 'world' | 'china';
/** Astronomy themes. */
export type AstroStrand = 'earthmoon' | 'solar' | 'sky' | 'motion' | 'earthsun' | 'stars' | 'cosmos';
/** Astronomy lessons: junior (age 11–15) or senior secondary (age 15–18). */
export type Level = 'jr' | 'sr';
/** Other middle-school (age 11–14) curricula: England KS3, US grades 6–8, IB MYP / Cambridge, Australia years 7–8. */
export type Track = 'uk' | 'us' | 'ib' | 'au';
export interface Lesson {
  /** astronomy lesson ids start with `a-` */
  id: string; strand: Strand | AstroStrand;
  /** astronomy: junior or senior secondary */
  level?: Level;
  /** the Chinese textbook volume; absent when the topic is not in the Chinese middle-school course */
  grade?: Grade;
  /** other curricula that teach this topic (astronomy: at the lesson's level, e.g. `uk` = KS3 for junior, GCSE for senior) */
  tracks: Track[];
  unit: Pair; title: Pair; blurb: Pair; icon: IconName; minutes: number;
  /** the take-aways, shown with the score */
  keys: Pair[];
  steps: Step[]; quiz: Quiz[];
  /** a lesson about the learner's own place: steps and quiz are made once the learner says where they live */
  build?: (home: Home) => { steps: Step[]; quiz: Quiz[] };
  /** steps and quiz drawn afresh each time the lesson starts (practice tests, drills) */
  gen?: () => { steps: Step[]; quiz: Quiz[] };
  /** a practice test: each matching pair is a point, and the score card adds up the sections */
  exam?: boolean;
}
/** The learner's home, and what the map says about it. */
export interface Home {
  ll: LL;
  /** the country it is in (ISO a2 and name), when on land */
  country?: { a2: string; name: Pair };
  climate?: import('./climate.ts').Climate;
  biome?: import('./climate.ts').Biome;
}

export const C = {
  gold: '#ffd24a', red: '#ff6b6b', blue: '#4dabf7', green: '#51cf66', teal: '#3bc9db', violet: '#b197fc',
  orange: '#ff922b', white: '#f1f3f5', pink: '#f783ac', ice: '#a5d8ff', brown: '#d9a066', lime: '#c0eb75',
} as const;

/** A whole parallel, drawn west to east. */
export const par = (lat: number, c: string, t = 0, extra: Partial<Line> = {}): Line => ({ pts: [[lat, -180], [lat, 0], [lat, 180]], c, t, rhumb: true, dur: 2.2, ...extra });
/** A meridian from the South Pole to the North Pole. */
export const mer = (lon: number, c: string, t = 0, extra: Partial<Line> = {}): Line => ({ pts: [[-89.9, lon], [89.9, lon]], c, t, rhumb: true, dur: 2, ...extra });
/** A label (optionally with a dot). */
export const mk = (ll: LL, en: string, zh: string, extra: Partial<Mark> = {}): Mark => ({ ll, text: [en, zh], ...extra });
/** Short flow arrows (winds, motion), each a separate line. */
export const arrows = (paths: LL[][], c: string, t = 0, w = 1.6): Line[] => paths.map((pts, i) => ({ pts, c, t: t + i * 0.25, flow: true, arrow: true, w, dur: 1.2 }));

/** Moments used by the clocks (UTC). 04:00 UTC puts the noon Sun over 120°E, above China. */
export const T = {
  marchNoonChina: Date.UTC(2025, 2, 20, 4),
  janChina: Date.UTC(2025, 0, 15, 4),
  julChina: Date.UTC(2025, 6, 15, 4),
  dawnBeijing: Date.UTC(2025, 2, 20, 22),
  juneDawn: Date.UTC(2025, 5, 21, 0),
};
