/**
 * Lessons: the picker, the step card (with the lesson clock) and the quiz. The drawing is done by `LessonStage` and
 * `AstroStage`; this file sequences steps and talks to the learner. Lesson content lives on the server: a lesson is
 * fetched when it starts, answers and lab tasks are checked there, and a signed-in learner's run is recorded there.
 * Like a tour, the card is not modal: the globe stays live while a lesson runs.
 */
import { h, openModal, closeModal, confetti, toast } from '../ui/dom.ts';
import { Select } from '../ui/select.ts';
import { icon } from '../ui/icons.ts';
import { t, lang, onLang } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { classroomLink } from '../lib/classroom.ts';
import { api, ApiError } from '../lib/api.ts';
import { FULL_URL, HAS_API } from '../lib/env.ts';
import { store } from '../store.ts';
import { skyEvents } from '../../shared/lib/astro/events.ts';
import type { Catalogue, Finished, Graded, LessonMark, QuizResponse, Subject, WireFig, WireLesson, WireQuiz, WireScene, WireStep } from '../../shared/lessons/wire.ts';
import type { Globe } from '../globe/scene.ts';
import { LessonStage, fitView } from './stage.ts';
import { AstroStage } from './astro/stage.ts';
import type { Home, LL, Pair } from './kit.ts';

const L = (p: Pair) => (lang() === 'zh' ? p[1] : p[0]);
const DAY = 864e5;

export interface LessonHost {
  globe: Globe;
  low: boolean;
  /** Leave the Solar System / sky theatre / an open item card, then run `then` on the globe. */
  toEarth(then: () => void): void;
  /** Open the sky theatre's model view on an event. */
  sky(id: string | undefined): void;
  /** A game is running: lessons wait. */
  blocked(): boolean;
  /** Open the account card; a sign-in link brings the learner back to `back` (a hash route). */
  signIn(back?: string): void;
}

/** Lessons finished on this device (without an account: the free lessons). */
const done = () => new Set(load<string[]>('lessonsDone', []));
const cats: Partial<Record<Subject, Promise<Catalogue>>> = {};
/** A subject's catalogue (fetched again when the picker opens, for fresh marks). */
const catalogue = (sub: Subject, fresh = false): Promise<Catalogue> => {
  if (fresh || !cats[sub]) cats[sub] = api.catalogue(sub).catch(e => { delete cats[sub]; throw e; });
  return cats[sub]!;
};
/** The curriculum picked in a subject's lesson list; Chinese readers start with the Chinese course. */
const view = (c: Catalogue): string => { const v = load<string>(c.key, ''); return c.views.some(x => x.id === v) ? v : c.def[lang() === 'zh' ? 'zh' : 'en']; };
/** The lesson after `id` in a curriculum (or in the first one, if `id` is not in it). */
function nextLesson(c: Catalogue, id: string, v: string): string | undefined {
  const order = (vid: string) => c.views.find(x => x.id === vid)?.groups.flatMap(g => g.lessons) ?? [];
  let list = order(v);
  if (!list.includes(id)) list = order(c.views[0].id);
  const at = list.indexOf(id);
  return at >= 0 ? list[at + 1] : undefined;
}
const figure = (f: WireFig | undefined) => f ? h('figure', { class: 'lesson-fig', 'data-testid': 'lesson-fig', html: L(f.html) }) : '';

let active: { stop: () => void } | null = null;
export const lessoning = () => active !== null;
export function stopLesson(): void { active?.stop(); }

export function startLesson(id: string, host: LessonHost): void {
  if (host.blocked()) return;
  if (!HAS_API) { fullEdition(); return; }
  document.body.classList.add('busy-lesson');
  api.startLesson(id).then(r => {
    stopLesson();
    document.querySelector('.tutorial')?.remove();
    host.toEarth(() => run(r.lesson, r.attempt, host));
  }, e => {
    if (e instanceof ApiError && e.signin) signInFirst(host, id);
    else toast(t('lessonLoadFail'));
  }).finally(() => document.body.classList.remove('busy-lesson'));
}

/** A lesson that needs an account: why, and the way in (the sign-in link comes back to the lesson). */
function signInFirst(host: LessonHost, id: string): void {
  closeModal('lessons');
  openModal('lesson-signin', t('lessonSignIn'), h('div', { class: 'lesson-gate', 'data-testid': 'lesson-signin' },
    h('p', { class: 'muted' }, t('lessonSignInSub')),
    h('div', { class: 'row' }, h('button', { class: 'cta', 'data-testid': 'lesson-signin-go', onclick: () => { closeModal('lesson-signin'); host.signIn('lesson/' + id); } }, t('signIn')))));
}
/** The static edition has no server: lessons are in the full edition. */
function fullEdition(): void {
  openModal('lesson-full', t('lessonFull'), h('div', { class: 'lesson-gate', 'data-testid': 'lesson-full' },
    h('p', { class: 'muted' }, t('lessonFullSub')),
    FULL_URL ? h('div', { class: 'row' }, h('a', { class: 'cta', href: FULL_URL, rel: 'noopener' }, t('lessonFullGo'))) : ''));
}

function run(lesson: WireLesson, attempt0: string | null, host: LessonHost): void {
  stopLesson();
  const g = host.globe;
  const stage = new LessonStage(g, { low: host.low, lang, frame: () => freeArea(card) });
  // astronomy steps run on their own 3D board over the paused globe (made on first use)
  let astro: AstroStage | null = null;
  const astroBoard = () => astro ??= new AstroStage({ low: host.low, lang, frame: () => freeArea(card),
    onActive: on => { g.paused = on; if (!on) g.markDirty(); }, countries: () => g.countryShapes() });
  /** Whichever board the current step uses (its clock drives the card's clock row). */
  const board = (): LessonStage | AstroStage => (astro?.shown ? astro : stage);
  // for the end-to-end tests: what the stages drew, and (development servers only) the current question's key
  const w = window as { __lesson?: LessonStage | null; __astro?: () => AstroStage | null; __quiz?: () => (WireQuiz & { key?: QuizResponse }) | null; __run?: () => { id: string; attempt: string | null; step: number } };
  w.__lesson = stage;
  w.__astro = () => astro;
  w.__quiz = () => { const k = i - steps.length, q = quiz[k]; return q ? { ...q, key: dev?.[k] } : null; };
  w.__run = () => ({ id: lesson.id, attempt, step: i });
  const sub = lesson.subject;
  // a lesson about the learner's own place comes from the server once they say where they live (`pickHome`)
  let steps: WireStep[] = lesson.steps, quiz: WireQuiz[] = lesson.quiz, dev = lesson.dev;
  let attempt = attempt0, home: Home | null = null;
  /** 0 … steps-1 are steps; steps … steps+quiz-1 are questions; steps+quiz is the score card. */
  let i = 0;
  /** the furthest step reached (recorded on the server for a signed-in learner) */
  let reached = 0;
  /** The server's word on each answer. */
  let graded: (Graded | null)[] = quiz.map(() => null);
  let checking = false;
  let result: Finished | null = null;
  /** The last tap (an "at" question) and its distance from the answer. */
  let tap: { ll: LL; km: number } | null = null;
  /** Work in progress on the current question. */
  const fresh = () => ({ seq: [] as number[], sel: null as number | null, pairs: new Map<number, number>(), multi: new Set<number>(), pick: null as number | null, num: '', placed: [] as (LL | null)[], cur: 0 });
  let work = fresh();
  /** lab tasks the learner has done, per step */
  const labDone = new Map<number, Set<number>>();
  let labTimer = 0;
  /** What was done on each answered question, so going Back shows it as it was. */
  const kept: ({ tap: { ll: LL; km: number } | null; work: ReturnType<typeof fresh> } | undefined)[] = [];
  let stopped = false;

  const card = h('section', { class: 'tour-card lesson-card', 'data-occludes': true, 'data-testid': 'lesson', 'aria-labelledby': 'lesson-title' });
  const root = h('div', { class: 'tour lesson' }, card);

  const clockRow = () => {
    const stage = board(), c = stage.clock;
    if (!c) return '';
    const read = h('span', { class: 'lesson-time', 'data-testid': 'lesson-time' }, stage.clockText());
    if (!c.rate) return h('div', { class: 'lesson-clock' }, h('span', { class: 'lesson-ico', html: icon('calendar', 14) }), read);
    const btn = h('button', { class: 'icon-btn', 'data-testid': 'lesson-play', 'aria-label': t(stage.playing ? 'lessonPause' : 'lessonPlay'), html: icon(stage.playing ? 'pause' : 'play', 16) });
    const range = h('input', { type: 'range', min: '0', max: '1000', value: String(Math.round(stage.frac * 1000)), 'aria-label': t('lessonClock'), 'data-testid': 'lesson-range' }) as HTMLInputElement;
    btn.onclick = () => {
      stage.playing = !stage.playing;
      btn.innerHTML = icon(stage.playing ? 'pause' : 'play', 16);
      btn.setAttribute('aria-label', t(stage.playing ? 'lessonPause' : 'lessonPlay'));
      g.markDirty();
    };
    range.oninput = () => { stage.playing = false; btn.innerHTML = icon('play', 16); stage.seek(+range.value / 1000); };
    stage.onClock = () => {
      read.textContent = stage.clockText();
      if (document.activeElement !== range) range.value = String(Math.round(stage.frac * 1000));
    };
    return h('div', { class: 'lesson-clock' }, btn, range, read);
  };

  /** A lab's sliders and its tasks (astronomy board scenes with `params`); the server says when a task is done. */
  const labRows = () => {
    const b = astro?.shown ? astro : null, lab = b?.lab;
    if (!b || !lab) return '';
    const step = i, got = labDone.get(step) ?? new Set<number>();
    labDone.set(step, got);
    const rows = lab.params.map(p => {
      const read = h('span', { class: 'lesson-time' });
      const show = () => { read.textContent = (p.fmt ? L(p.fmt) : '{v}').replace('{v}', (Math.round(b.params[p.id] * 10 ** (p.dp ?? 0)) / 10 ** (p.dp ?? 0)).toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en-US')); };
      const range = h('input', { type: 'range', min: String(p.min), max: String(p.max), step: String(p.step ?? (p.max - p.min) / 100), value: String(b.params[p.id]),
        'aria-label': L(p.name), 'data-testid': 'lab-' + p.id }) as HTMLInputElement;
      range.oninput = () => { b.setParam(p.id, +range.value); show(); dirty = true; };
      show();
      return h('label', { class: 'lab-row' }, h('span', { class: 'lab-name' }, L(p.name)), range, read);
    });
    const items = lab.tasks.map((tk, j) => h('li', { 'data-testid': 'lab-task', class: got.has(j) ? 'done' : '', 'data-done': got.has(j) ? 'true' : null }, L(tk.text)));
    // the settings go to the server at most twice a second while a task is left to do
    let dirty = true, busy = false;
    const prev = b.onClock;
    b.onClock = () => { prev?.(); dirty = true; };
    clearInterval(labTimer);
    if (items.length) labTimer = window.setInterval(() => {
      if (!dirty || busy || got.size === items.length || i !== step || !b.shown) return;
      dirty = false; busy = true;
      api.lab(lesson.id, { attempt, step, params: { ...b.params }, value: b.value, home: home ?? undefined }).then(r => {
        r.done.forEach((d, j) => { if (d && !got.has(j)) { got.add(j); items[j]?.classList.add('done'); items[j]?.setAttribute('data-done', 'true'); } });
      }, () => { dirty = true; }).finally(() => { busy = false; });
    }, 450);
    return h('div', { class: 'lesson-lab', 'data-testid': 'lesson-lab' },
      h('p', { class: 'lab-kicker', html: icon('sparkle', 14) }, h('span', {}, t('lessonLab'))),
      ...rows, items.length ? h('ul', { class: 'lab-tasks' }, ...items) : '');
  };

  /** the lesson's name, where the learner is, and a hairline of progress through steps and quiz */
  const head = (sub: string, done = (i + 1) / (steps.length + quiz.length)) => h('header', { class: 'tour-head' },
    h('span', { class: 'tour-kicker', html: icon(lesson.icon, 14) }, h('span', { class: 'kick-t', title: L(lesson.title) }, L(lesson.title))),
    h('span', { class: 'lesson-step', 'data-testid': 'lesson-step' }, sub),
    h('button', { class: 'icon-btn tour-x', 'aria-label': t('lessonExit'), 'data-testid': 'lesson-exit', html: icon('close', 16), onclick: () => stop() }),
    h('i', { class: 'lesson-prog', 'aria-hidden': 'true', style: `--p:${Math.min(1, done).toFixed(3)}` }));

  const nav = (back: (() => void) | null, next: () => void, label: string, nextOff = false) => h('div', { class: 'row' },
    h('button', { class: 'pill', 'data-testid': 'lesson-back', disabled: !back, onclick: () => back?.() }, t('tourBack')),
    h('button', { class: 'cta', 'data-testid': 'lesson-next', disabled: nextOff, onclick: next }, label));

  const renderStep = () => {
    const st = steps[i];
    stage.onClock = null;
    if (astro) astro.onClock = null;
    card.replaceChildren(
      head(`${i + 1} / ${steps.length}`),
      h('h2', { id: 'lesson-title' }, L(st.title)),
      st.sketch ? h('p', { class: 'tour-track tour-sketch', 'data-testid': 'lesson-sketch', html: icon('sparkle', 14) }, h('span', {}, t('lessonSketch'))) : '',
      h('p', { class: 'tour-body', 'aria-live': 'polite' }, L(st.body)),
      figure(st.fig),
      st.task ? h('p', { class: 'lesson-task', 'data-testid': 'lesson-task', html: icon('sparkle', 14) }, h('span', {}, h('strong', {}, t('lessonTry') + ' '), L(st.task))) : '',
      clockRow(),
      labRows(),
      st.sky ? h('button', { class: 'pill pill-sm lesson-sky', 'data-testid': 'lesson-sky', html: icon('telescope', 14), onclick: () => host.sky(nextSolstice()) }, h('span', {}, t('lessonSky'))) : '',
      nav(i > 0 ? () => go(i - 1) : null, () => go(i + 1), i === steps.length - 1 ? t('lessonQuiz') : t('next')));
  };

  /** Sends an answer to the server; `after` shows what the answer means on the globe or board. */
  const submit = (k: number, response: QuizResponse, after?: (gr: Graded) => void) => {
    if (graded[k] || checking) return;
    checking = true;
    renderQuiz();
    api.answer(lesson.id, { attempt, k, response, home: home ?? undefined }).then(gr => {
      if (stopped) return;
      graded[k] = gr;
      if (i - steps.length === k) { after?.(gr); renderQuiz(); }
    }, () => { if (!stopped) toast(t('lessonLoadFail')); }).finally(() => { checking = false; if (!stopped && i - steps.length === k) renderQuiz(); });
  };

  const renderQuiz = () => {
    const k = i - steps.length, q = quiz[k], gr = graded[k], ans = gr ? gr.ok : null, rv = gr?.reveal;
    stage.onClock = null;
    if (astro) astro.onClock = null;
    const checkBtn = (ready: boolean, run: () => void) => ans === null
      ? h('button', { class: 'cta lesson-check', 'data-testid': 'lesson-check', disabled: !ready || checking, onclick: run }, t('lessonCheck')) : '';
    /** What the right answer was, for the question types where the learner built an answer. */
    let reveal: string | HTMLElement = '';
    let body: HTMLElement;
    if (q.kind === 'multi') {
      const right = new Set(rv?.kind === 'multi' ? rv.right : []);
      body = h('div', { class: 'lesson-opts' }, h('p', { class: 'muted small' }, t('lessonMulti')), ...q.options!.map((o, j) => h('button', {
        class: 'pill lesson-opt lesson-multi' + (work.multi.has(j) ? ' on' : '') + (gr && right.has(j) ? ' right' : '') + (gr && work.multi.has(j) && !right.has(j) ? ' wrong' : ''),
        'data-testid': 'lesson-opt', 'data-pos': String(j), 'aria-pressed': String(work.multi.has(j)), disabled: ans !== null || checking,
        onclick: () => { if (work.multi.has(j)) work.multi.delete(j); else work.multi.add(j); renderQuiz(); },
      }, L(o))), checkBtn(work.multi.size > 0, () => submit(k, { picks: [...work.multi] })));
    } else if (q.kind === 'choice') {
      const right = rv?.kind === 'choice' ? rv.right : -1;
      body = h('div', { class: 'lesson-opts' }, ...q.options!.map((o, j) => h('button', {
        class: 'pill lesson-opt' + (gr && j === right ? ' right' : '') + (gr && j === work.pick && j !== right ? ' wrong' : '') + (!gr && j === work.pick ? ' on' : ''),
        'data-testid': 'lesson-opt', 'data-pos': String(j), disabled: ans !== null || checking,
        onclick: () => { work.pick = j; submit(k, { pick: j }); },
      }, L(o))));
    } else if (q.kind === 'order') {
      const items = q.items!, n = items.length, right = rv?.kind === 'order' ? rv.right : [];
      body = h('div', { class: 'lesson-order' },
        h('ol', { class: 'lesson-seq', 'data-testid': 'lesson-seq' }, ...work.seq.map((j, p) => h('li', {}, h('button', {
          class: 'pill lesson-chip' + (gr ? (right[p] === j ? ' right' : ' wrong') : ''), disabled: ans !== null || checking, 'data-testid': 'lesson-order-picked',
          onclick: () => { work.seq.splice(p, 1); renderQuiz(); },
        }, L(items[j]))))),
        ans === null ? h('div', { class: 'lesson-pool' }, ...items.flatMap((it, j) => work.seq.includes(j) ? [] : [h('button', {
          class: 'pill lesson-chip', 'data-testid': 'lesson-order-item', 'data-pos': String(j), disabled: checking,
          onclick: () => { work.seq.push(j); renderQuiz(); },
        }, L(it))])) : '',
        checkBtn(work.seq.length === n, () => submit(k, { seq: [...work.seq] })));
      if (ans === false) reveal = h('p', { class: 'lesson-reveal' }, t('lessonOrderIs') + ' ', right.map(d => L(items[d])).join(' → '));
    } else if (q.kind === 'match') {
      const left = q.left!, rights = q.right!, n = left.length, right = rv?.kind === 'match' ? rv.right : [];
      const tag = (j: number) => h('span', { class: 'lesson-badge', style: `--c:${MATCH_C[j % MATCH_C.length]}` }, String(j + 1));
      const leftOf = (r: number) => [...work.pairs].find(([, v]) => v === r)?.[0];
      body = h('div', { class: 'lesson-match' },
        h('div', { class: 'lesson-col' }, ...left.map((p, j) => h('button', {
          class: 'pill lesson-chip' + (work.sel === j ? ' on' : '') + (gr ? (work.pairs.get(j) === right[j] ? ' right' : ' wrong') : ''),
          'data-testid': 'lesson-match-l', 'data-pos': String(j), disabled: ans !== null || checking,
          onclick: () => { work.sel = work.sel === j ? null : j; renderQuiz(); },
        }, tag(j), h('span', {}, L(p))))),
        h('div', { class: 'lesson-col' }, ...rights.map((p, r) => { const l = leftOf(r); return h('button', {
          class: 'pill lesson-chip' + (l !== undefined ? ' paired' : ''), 'data-testid': 'lesson-match-r', 'data-pos': String(r), disabled: ans !== null || checking || (work.sel === null && l === undefined),
          onclick: () => {
            if (work.sel === null) { if (l !== undefined) work.pairs.delete(l); }
            else { if (l !== undefined) work.pairs.delete(l); work.pairs.set(work.sel, r); work.sel = left.findIndex((_, j) => !work.pairs.has(j)); if (work.sel < 0) work.sel = null; }
            renderQuiz();
          },
        }, l !== undefined ? tag(l) : h('span', { class: 'lesson-badge empty' }, '?'), h('span', {}, L(p))); })),
        checkBtn(work.pairs.size === n, () => submit(k, { pairs: left.map((_, j) => work.pairs.get(j)!) })));
      if (ans === false) reveal = h('ul', { class: 'lesson-reveal' }, ...left.map((p, j) => h('li', {}, `${L(p)} — ${L(rights[right[j]])}`)));
    } else if (q.kind === 'num') {
      const input = h('input', { type: 'number', inputmode: 'decimal', step: 'any', class: 'lesson-num', 'data-testid': 'lesson-num', value: work.num, disabled: ans !== null || checking, 'aria-label': L(q.q) }) as HTMLInputElement;
      const go1 = () => { const v = parseFloat(input.value); if (Number.isFinite(v)) { work.num = input.value; submit(k, { value: v }); } };
      input.oninput = () => { work.num = input.value; btn.toggleAttribute('disabled', !Number.isFinite(parseFloat(input.value))); };
      input.onkeydown = e => { if (e.key === 'Enter') go1(); };
      const btn = h('button', { class: 'cta lesson-check', 'data-testid': 'lesson-check', disabled: !Number.isFinite(parseFloat(work.num)) || checking, onclick: go1 }, t('lessonCheck'));
      body = h('div', { class: 'lesson-numrow' + (ans === null ? '' : ans ? ' right' : ' wrong') }, input, q.unit ? h('span', { class: 'muted' }, L(q.unit)) : '', ans === null ? btn : '');
      if (rv?.kind === 'num') reveal = h('p', { class: 'lesson-reveal' }, t('lessonAnswerIs', { v: `${fmtN(rv.answer)}${rv.unit ? ' ' + L(rv.unit) : ''}` }));
      if (ans === null && !checking) queueMicrotask(() => input.focus({ preventScroll: true }));
    } else if (q.kind === 'place') {
      const labels = q.labels!, pr = rv?.kind === 'place' ? rv : null;
      body = h('div', { class: 'lesson-place' },
        h('p', { class: 'lesson-tap', html: icon('pin', 14) }, h('span', {}, gr ? '' : t('lessonPlace'))),
        h('div', { class: 'lesson-pool' }, ...labels.map((p, j) => {
          const at = work.placed[j];
          return h('button', {
            class: 'pill lesson-chip' + (!gr && work.cur === j ? ' on' : '') + (at && !gr ? ' paired' : '') + (pr ? (pr.ok[j] ? ' right' : ' wrong') : ''),
            'data-testid': 'lesson-place-chip', 'data-pos': String(j), disabled: !!gr || checking,
            onclick: () => { work.cur = j; renderQuiz(); },
          }, tagN(j), h('span', {}, L(p)), pr ? h('small', {}, ` ${Math.round(pr.km[j]).toLocaleString()} km`) : '');
        })),
        checkBtn(labels.every((_, j) => !!work.placed[j]), () => {
          const placed = work.placed as LL[];
          g.captureTaps = false; g.ev.onGlobeTap = undefined;
          submit(k, { at: placed }, r => {
            if (r.reveal.kind !== 'place') return;
            const ans = r.reveal.at;
            stage.show({ cam: [g.lat, g.lon, g.h], wide: true,
              lines: labels.flatMap((_, j) => r.reveal.kind === 'place' && r.reveal.km[j] > 30 ? [{ pts: [placed[j], ans[j]], c: '#f1f3f5', dur: 1 }] : []),
              marks: labels.flatMap((p, j) => [{ ll: placed[j], text: [`${j + 1}`, `${j + 1}`] as Pair, dot: true, c: '#ff6b6b' }, { ll: ans[j], text: p, dot: true, big: true, c: '#ffd24a', t: 0.6 }]) });
          });
        }));
    } else {
      body = h('p', { class: 'lesson-tap', html: icon('pin', 14) }, h('span', {}, ans === null ? t(checking ? 'lessonChecking' : q.kind === 'pick' ? 'lessonPick' : 'lessonTap') : ''));
    }
    const why = gr ? h('div', { class: 'lesson-why ' + (gr.ok ? 'ok' : 'no'), 'aria-live': 'polite', 'data-testid': 'lesson-why' },
      h('p', {}, h('strong', {}, t(gr.ok ? 'lessonRight' : 'lessonWrong') + ' '), tap ? t('lessonKm', { km: Math.round(tap.km).toLocaleString() }) + ' ' : '', L(gr.why)), reveal) : '';
    card.replaceChildren(
      head(t('lessonQ', { i: k + 1, n: quiz.length })),
      h('h2', { id: 'lesson-title' }, L(q.q)),
      figure(q.fig),
      q.astro ? clockRow() : '',
      body, why,
      nav(() => go(i - 1), () => go(i + 1), k === quiz.length - 1 ? t('tourFinish') : t('next'), ans === null));
  };

  const renderScore = () => {
    const s = result?.score ?? graded.filter(x => x?.ok).length;
    const signedIn = !!store.me;
    card.replaceChildren(
      head(t('lessonQuiz'), 1),
      h('h2', { id: 'lesson-title', 'data-testid': 'lesson-score' }, t('lessonScore', { s, n: quiz.length })),
      result?.recorded ? h('p', { class: 'muted small', 'data-testid': 'lesson-saved' }, `${t('lessonSaved')} · ${t('lessonBest', { s: result.best, n: result.total })}`)
        : !signedIn ? h('p', { class: 'muted small' }, h('button', { class: 'link', 'data-testid': 'lesson-save-signin', onclick: () => host.signIn('lesson/' + lesson.id) }, t('lessonGuest'))) : '',
      h('p', { class: 'lesson-keys-h' }, t('lessonKeys')),
      result ? h('ul', { class: 'lesson-keys', 'data-testid': 'lesson-keys' }, ...result.keys.map(k => h('li', {}, L(k)))) : h('p', { class: 'muted' }, '…'),
      h('div', { class: 'row' },
        h('button', { class: 'pill', 'data-testid': 'lesson-more', onclick: () => { stop(); openLessons(host, sub); } }, t('lessonMore')),
        h('button', { class: 'pill', 'data-testid': 'lesson-again', onclick: () => void restart(home) }, t('lessonAgain')),
        lesson.build ? h('button', { class: 'pill', 'data-testid': 'lesson-home-again', onclick: () => askHome() }, t('lessonHomeOther')) : '',
        nx ? h('button', { class: 'cta', 'data-testid': 'lesson-nextlesson', onclick: () => { stop(); startLesson(nx!, host); } }, t('lessonNextOne'))
          : h('button', { class: 'cta', 'data-testid': 'lesson-done', onclick: () => stop() }, t('tourFinish'))));
  };
  let nx: string | undefined;
  void catalogue(sub).then(c => { nx = nextLesson(c, lesson.id, view(c)); if (i >= steps.length + quiz.length && active === self) render(); }, () => undefined);

  const render = () => (picking ? renderHome() : i < steps.length ? renderStep() : i < steps.length + quiz.length ? renderQuiz() : renderScore());

  /** A new run (a new attempt on the server); for "where I live", about `at`. */
  const restart = async (at: Home | null) => {
    try {
      const r = await api.startLesson(lesson.id, at ?? undefined);
      if (active !== self) return;
      steps = r.lesson.steps; quiz = r.lesson.quiz; dev = r.lesson.dev; attempt = r.attempt;
    } catch (e) {
      if (active !== self) return;
      if (e instanceof ApiError && e.signin) { stop(); signInFirst(host, lesson.id); } else toast(t('lessonLoadFail'));
      return;
    }
    home = at;
    graded = quiz.map(() => null); result = null; reached = 0; labDone.clear();
    picking = false;
    g.captureTaps = false; g.ev.onGlobeTap = undefined;
    go(0);
  };

  // ---- a lesson about the learner's own place: ask where that is first ----
  let picking = lesson.build;
  let locating = false;
  const setHome = (ll: LL) => {
    const at = stage.here(ll[0], ll[1]);
    save('home', ll);
    locating = true; render();
    void restart({ ll, climate: at.climate, biome: at.biome, country: at.a2 ? { a2: at.a2, name: [at.a2, at.a2] } : undefined }).finally(() => { locating = false; });
  };
  const askHome = () => {
    picking = true;
    astro?.hide();
    const last = load<LL | null>('home', null);
    stage.show({ cam: last ? [last[0], last[1], 2.4] : [g.lat, g.lon, Math.max(g.h, 2.6)], wide: true,
      marks: last ? [{ ll: last, text: ['Last time', '上次的位置'], dot: true, big: true, c: '#ffd24a' }] : [] });
    g.captureTaps = true;
    g.ev.onGlobeTap = (lat, lon) => { if (picking && !locating) setHome([lat, lon]); };
    render();
  };
  const renderHome = () => {
    const last = load<LL | null>('home', null);
    const geo = () => {
      if (!navigator.geolocation) { toast(t('lessonHomeNoGeo')); return; }
      locating = true; render();
      navigator.geolocation.getCurrentPosition(
        p => { locating = false; if (picking && !stopped) setHome([p.coords.latitude, p.coords.longitude]); },
        () => { locating = false; if (picking && !stopped) { toast(t('lessonHomeNoGeo')); render(); } },
        { timeout: 12000, maximumAge: 3600e3 });
    };
    card.replaceChildren(
      head(t('lessonHome'), 0),
      h('h2', { id: 'lesson-title' }, L(lesson.title)),
      h('p', { class: 'tour-body' }, t('lessonHomeAsk')),
      h('p', { class: 'lesson-tap', html: icon('pin', 14) }, h('span', {}, t('lessonHomeTap'))),
      h('div', { class: 'lesson-opts' },
        h('button', { class: 'pill lesson-opt', 'data-testid': 'lesson-home-geo', disabled: locating, html: icon('compass', 14), onclick: geo }, h('span', {}, t(locating ? 'lessonHomeFinding' : 'lessonHomeGeo'))),
        last ? h('button', { class: 'pill lesson-opt', 'data-testid': 'lesson-home-last', disabled: locating, html: icon('flag', 14), onclick: () => setHome(last) },
          h('span', {}, t('lessonHomeLast', { ll: `${Math.abs(last[0]).toFixed(1)}°${last[0] >= 0 ? 'N' : 'S'} ${Math.abs(last[1]).toFixed(1)}°${last[1] >= 0 ? 'E' : 'W'}` }))) : ''),
      h('p', { class: 'muted small' }, t('lessonHomePrivacy')));
  };

  /** A step's or question's 3D scene on the astronomy board; the globe is cleared underneath. */
  const showAstro = (s: WireScene) => {
    stage.show({ cam: [g.lat, g.lon, Math.max(g.h, 3)] });
    const b = astroBoard();
    b.onClock = null; // the last card's clock row is gone; render() hooks up the new one
    void b.show(s);
  };
  const showStep = (st: WireStep) => {
    if (st.astro) showAstro(st.astro);
    else { astro?.hide(); stage.show(st); }
  };
  /** Quiz scenes: a plain globe, the answer region roughly in view for "find it" questions (never the answers). */
  const quizScene = (q: WireQuiz) => {
    if (q.astro) { showAstro(q.astro); return; }
    astro?.hide();
    const fr = q.frame;
    if (q.kind === 'place' && fr) {
      const corners: LL[] = [fr[0], [fr[0][0], fr[1][1]], fr[1], [fr[1][0], fr[0][1]]];
      const f = fitView(corners, innerWidth * 0.55, innerHeight * 0.8, innerHeight, g.camera.fov, 0.6);
      stage.show({ cam: f ? [f[0], f[1], Math.max(f[2] * 1.15, 1.3)] : [(fr[0][0] + fr[1][0]) / 2, (fr[0][1] + fr[1][1]) / 2, 4.2], wide: true });
      return;
    }
    if (q.kind !== 'at' || !fr) { stage.show({ cam: [g.lat, g.lon, Math.max(g.h, 3)] }); return; }
    const c: LL = [(fr[0][0] + fr[1][0]) / 2, (fr[0][1] + fr[1][1]) / 2];
    stage.show({ cam: [Math.max(-60, Math.min(60, c[0] * 0.6)), c[1] + 32, 4.2] });
  };
  const listen = (k: number) => {
    const q = quiz[k];
    if (astro) astro.onPick = null;
    if (q.kind === 'pick' && !graded[k]) {
      astroBoard().onPick = tag => {
        if (graded[k] || checking || !tag) return;
        const b = astroBoard();
        b.onPick = null;
        submit(k, { tag }, r => {
          if (r.reveal.kind !== 'pick') return;
          if (!r.ok) b.flag(tag, ['Your pick', '你点的'], '#ff6b6b');
          b.flag(r.reveal.tag, ['Answer', '正确答案'], '#ffd24a');
        });
      };
      return;
    }
    if (q.kind === 'place' && !graded[k]) {
      g.captureTaps = true;
      g.ev.onGlobeTap = (lat, lon) => {
        if (graded[k] || checking) return;
        work.placed[work.cur] = [lat, lon];
        const nx = q.labels!.findIndex((_, j) => !work.placed[j]);
        if (nx >= 0) work.cur = nx;
        stage.show({ cam: [g.lat, g.lon, g.h], wide: true,
          marks: q.labels!.flatMap((p, j) => work.placed[j] ? [{ ll: work.placed[j]!, text: p, dot: true, c: MATCH_C[j % MATCH_C.length] }] : []) });
        renderQuiz();
      };
      return;
    }
    g.captureTaps = q.kind === 'at' && !graded[k];
    g.ev.onGlobeTap = g.captureTaps ? (lat, lon) => {
      if (graded[k] || checking) return;
      g.captureTaps = false;
      g.ev.onGlobeTap = undefined;
      submit(k, { at: [lat, lon] }, r => {
        if (r.reveal.kind !== 'at') return;
        const at = r.reveal.at;
        tap = { ll: [lat, lon], km: r.reveal.km };
        stage.show({
          cam: [at[0], at[1], 2.6],
          lines: r.reveal.km > 30 ? [{ pts: [[lat, lon], at], c: '#f1f3f5', dur: 1 }] : [],
          marks: [{ ll: [lat, lon], text: ['Your tap', '你点的位置'], dot: true, c: r.ok ? '#51cf66' : '#ff6b6b' },
            { ll: at, text: ['Answer', '正确位置'], dot: true, big: true, c: '#ffd24a', t: 0.8 }],
        });
      });
      // a failed request: let the learner tap again
      const retry = () => { if (!graded[k] && i - steps.length === k && active === self) listen(k); };
      setTimeout(function wait() { if (checking) setTimeout(wait, 200); else retry(); }, 200);
    } : undefined;
  };

  const go = (k: number) => {
    if (k < 0 || k > steps.length + quiz.length) return;
    const qi = (n: number) => (n >= steps.length && n < steps.length + quiz.length ? n - steps.length : -1);
    if (qi(i) >= 0) kept[qi(i)] = { tap, work };
    i = k;
    const was = qi(i) >= 0 && graded[qi(i)] ? kept[qi(i)] : undefined;
    tap = was?.tap ?? null; work = was?.work ?? fresh();
    clearInterval(labTimer);
    g.captureTaps = false; g.ev.onGlobeTap = undefined;
    if (astro) astro.onPick = null;
    if (i < steps.length) {
      showStep(steps[i]);
      if (attempt && i + 1 > reached) { reached = i + 1; void api.step(lesson.id, attempt, reached).catch(() => undefined); }
    } else if (i < steps.length + quiz.length) {
      const q = quiz[i - steps.length];
      quizScene(q);
      listen(i - steps.length);
    } else finish();
    render();
    (card.querySelector('[data-testid="lesson-next"]:not([disabled]), .lesson-opt:not([disabled]), [data-testid="lesson-done"], [data-testid="lesson-nextlesson"]') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const finish = () => {
    astro?.hide();
    stage.show({ cam: [g.lat, g.lon, Math.max(g.h, 3)] });
    save('lessonsDone', [...done().add(lesson.id)]);
    if (result) return;
    const local = graded.filter(x => x?.ok).length;
    api.finish(lesson.id, { attempt, score: local, home: home ?? undefined }).then(r => {
      result = r;
      if (r.score >= quiz.length - 1) confetti(40);
      delete cats[sub];
      if (active === self && i >= steps.length + quiz.length) render();
    }, () => toast(t('lessonLoadFail')));
  };

  const stop = () => {
    stopped = true;
    offLang();
    clearInterval(labTimer);
    g.captureTaps = false; g.ev.onGlobeTap = undefined;
    stage.dispose();
    astro?.dispose();
    w.__lesson = null;
    w.__astro = () => null;
    w.__quiz = () => null;
    root.remove();
    document.body.classList.remove('lessoning');
    if (active === self) active = null;
  };
  const offLang = onLang(() => { stage.relabel(); astro?.relabel(); render(); });
  const self = { stop };
  active = self;
  document.body.append(root);
  document.body.classList.add('lessoning');
  if (lesson.build) askHome(); else go(0);
}

/** The biggest clear part of the screen beside the card (below the top bar, above the bottom controls). */
function freeArea(card: HTMLElement): { left: number; top: number; width: number; height: number } | null {
  const r = card.getBoundingClientRect();
  if (!r.width) return null;
  const W = innerWidth, top = 70, bottom = innerHeight - 56, gap = 12, side = 64;
  const cands = [
    { left: r.right + gap, top, width: W - side - r.right - gap, height: bottom - top },
    { left: side, top, width: r.left - gap - side, height: bottom - top },
    { left: 0, top, width: W, height: Math.min(bottom, r.top - gap) - top },
  ];
  return cands.reduce((b, c) => (c.width > 0 && c.height > 0 && c.width * c.height > b.width * b.height ? c : b), { left: 0, top: 0, width: 0, height: 0 });
}

/** Colours that tell pairs and labels apart. */
const MATCH_C = ['#ffd24a', '#4dabf7', '#51cf66', '#f783ac', '#ff922b', '#b197fc', '#3bc9db', '#c0eb75'];
const tagN = (j: number) => h('span', { class: 'lesson-badge', style: `--c:${MATCH_C[j % MATCH_C.length]}` }, String(j + 1));
const fmtN = (v: number) => v.toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 });
function nextSolstice(): string | undefined {
  const now = Date.now();
  return skyEvents(now, now + 400 * DAY, { kinds: ['solstice'] })[0]?.id;
}

/** The lesson picker of a subject: pick a curriculum, then its lessons in groups (textbook volumes, or themes). */
export function openLessons(host: LessonHost, sub: Subject = 'geo'): void {
  if (!HAS_API) { fullEdition(); return; }
  const list = h('div', { class: 'tour-list lesson-list', 'data-testid': 'lesson-list' }, h('p', { class: 'muted' }, '…'));
  const note = h('p', { class: 'muted small' });
  const track = h('div', { class: 'lesson-track' });
  openModal('lessons', t(sub === 'astro' ? 'astroLessons' : 'lessons'), h('div', { class: 'lesson-pickwrap' }, h('p', { class: 'muted' }, t(sub === 'astro' ? 'astroIntro' : 'lessonsIntro')), track, list));
  catalogue(sub, true).then(cat => {
    const seen = done(), marks: Record<string, LessonMark> = cat.marks ?? {};
    const isDone = (id: string) => marks[id]?.done ?? seen.has(id);
    const fill = (v: string) => {
      const cv = cat.views.find(x => x.id === v) ?? cat.views[0];
      note.textContent = L(cv.note);
      const groups = cv.groups.map(gr => h('section', { class: 'lesson-group' },
        h('h3', { class: 'lesson-grade' }, h('span', {}, L(gr.name)), h('small', {}, `${gr.lessons.filter(isDone).length}/${gr.lessons.length}`)),
        ...gr.lessons.flatMap(id => {
          const x = cat.lessons[id];
          if (!x) return [];
          const locked = !cat.signedIn && !x.free, m = marks[id];
          const meta = isDone(id) ? `✓ ${m ? `${m.best}/${m.of}` : t('minutesN', { n: x.minutes })}` : locked ? '' : t('minutesN', { n: x.minutes });
          return [h('div', { class: 'tour-row lesson-row' + (isDone(id) ? ' done' : '') + (locked ? ' locked' : '') },
            h('button', { class: 'tour-pick', 'data-testid': 'lesson-' + id, 'data-locked': locked ? 'true' : null,
              onclick: () => { closeModal('lessons'); if (locked) signInFirst(host, id); else startLesson(id, host); } },
              h('span', { class: 'tile', html: icon(x.icon, 18) }),
              h('span', { class: 'grow' }, h('strong', {}, L(x.title), !cat.signedIn && x.free ? h('span', { class: 'lesson-free' }, t('lessonFree')) : ''), h('span', { class: 'muted small' }, `${L(x.unit)} · ${L(x.blurb)}`)),
              locked ? h('span', { class: 'meta lesson-lock', html: icon('lock', 13), title: t('lessonLocked') }) : h('span', { class: 'meta' }, meta)),
            h('button', { class: 'icon-btn tour-link', 'aria-label': t('classLink'), title: t('classLink'), html: icon('share', 14),
              onclick: () => void copyLink(classroomLink(id, 'lesson')) }))];
        })));
      list.replaceChildren(...groups);
    };
    const sel = new Select({ label: t('lessonTrack'), testid: 'lesson-track', icon: 'book', value: view(cat),
      options: cat.views.map(v => ({ value: v.id, label: L(v.name) })),
      onChange: v => { save(cat.key, v); fill(v); } });
    track.replaceChildren(sel.el, note);
    fill(view(cat));
  }, () => list.replaceChildren(h('p', { class: 'muted' }, t('lessonLoadFail'))));
}

async function copyLink(link: string): Promise<void> {
  try { await navigator.clipboard.writeText(link); toast(t('classLinkCopied')); }
  catch { prompt(t('classLink'), link); }
}
