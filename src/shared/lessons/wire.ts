/**
 * The lesson wire format: what the server sends a learner's browser. Lesson content (steps, questions, answers, lab
 * rules) lives on the server; the browser gets one lesson at a time with its figures drawn, its questions without
 * their answers (choices shuffled) and its lab tasks without their rules. Answers and lab tasks are checked by the
 * server. Types only: nothing here ships lesson content to the client bundle.
 */
import type { BoardScene } from '../../client/lessons/astro/types.ts';
import type { Home, LL, Pair, Step } from '../../client/lessons/kit.ts';
import type { IconName } from '../../client/ui/icons.ts';

export type { Home, LL, Pair };
export type Subject = 'geo' | 'astro';

/** A figure drawn on the server, in English and Chinese. */
export interface WireFig { html: Pair }
/** A 3D board scene; lab tasks keep their text, their rule stays on the server. */
export type WireScene = BoardScene;
type StepText = { title: Pair; body: Pair; sketch?: boolean; sky?: 'seasons'; task?: Pair; fig?: WireFig };
export type WireStep = (Omit<Extract<Step, { astro?: undefined }>, 'fig'> & StepText) | (StepText & { astro: WireScene });

export type QuizKind = 'choice' | 'multi' | 'order' | 'match' | 'num' | 'place' | 'pick' | 'at';
export interface WireQuiz {
  kind: QuizKind;
  q: Pair;
  fig?: WireFig;
  astro?: WireScene;
  /** choice / multi: the options in display order */
  options?: Pair[];
  /** order: the items in display order (shuffled) */
  items?: Pair[];
  /** match: the left column as written, the right column shuffled */
  left?: Pair[]; right?: Pair[];
  /** num: the unit of the answer */
  unit?: Pair;
  /** place: the labels to put on the map */
  labels?: Pair[];
  /** place / at: a loose box around the answers to frame the camera (never the answers themselves) */
  frame?: [LL, LL];
}

/** A learner's answer, in display terms (indices into what the question showed). */
export type QuizResponse =
  | { pick: number } // choice
  | { picks: number[] } // multi
  | { seq: number[] } // order: display indices in the learner's order
  | { pairs: number[] } // match: for each left item, the display index of its right item
  | { value: number } // num
  | { at: LL[] } // place: one point per label
  | { at: LL } // at: the tap
  | { tag: string }; // pick

/** What the server says about an answer: right or not, why, and the right answer to show. */
export interface Graded {
  ok: boolean;
  why: Pair;
  reveal:
    | { kind: 'choice'; right: number }
    | { kind: 'multi'; right: number[] }
    | { kind: 'order'; right: number[] }
    | { kind: 'match'; right: number[] }
    | { kind: 'num'; answer: number; unit?: Pair }
    | { kind: 'place'; at: LL[]; km: number[]; ok: boolean[] }
    | { kind: 'at'; at: LL; km: number }
    | { kind: 'pick'; tag: string };
}

export interface WireLesson {
  id: string;
  subject: Subject;
  icon: IconName;
  title: Pair;
  minutes: number;
  /** open without an account */
  free: boolean;
  /** a lesson about the learner's own place: steps and quiz come empty until `POST …/start` says where home is */
  build: boolean;
  steps: WireStep[];
  quiz: WireQuiz[];
  /** development and end-to-end tests only (`DEV_LOGIN=1`): the right response to each question */
  dev?: QuizResponse[];
}

export interface LessonSummary {
  id: string; icon: IconName; title: Pair; unit: Pair; blurb: Pair; minutes: number; free: boolean;
}
/** A learner's record of a lesson, as the catalogue shows it. */
export interface LessonMark { done: boolean; best: number; of: number; step: number }
export interface Catalogue {
  subject: Subject;
  /** where the picked curriculum is saved on the device, and the default for English and Chinese readers */
  key: string; def: { en: string; zh: string };
  views: { id: string; name: Pair; note: Pair; groups: { name: Pair; lessons: string[] }[] }[];
  lessons: Record<string, LessonSummary>;
  /** signed in: the learner's records */
  marks?: Record<string, LessonMark>;
  signedIn: boolean;
}

/** The end of a run: its score, the learner's best, and the lesson's take-aways. */
export interface Finished { score: number; total: number; best: number; keys: Pair[]; recorded: boolean }
