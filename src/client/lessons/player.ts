/**
 * Geography class: the lesson picker, the step card (with the lesson clock) and the quiz. The drawing is done by
 * `LessonStage`; this file only sequences steps and talks to the user. Like a tour, the card is not modal: the globe
 * stays live, so the user can turn it, zoom in and open the models while a lesson runs.
 */
import { h, openModal, closeModal, confetti, toast } from '../ui/dom.ts';
import { Select } from '../ui/select.ts';
import { icon } from '../ui/icons.ts';
import { t, lang, onLang } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { classroomLink } from '../lib/classroom.ts';
import { ssbsLink } from '../lib/ssbs.ts';
import { countryAt } from '../globe/borders.ts';
import { haversineKm } from '../../shared/lib/geo.ts';
import { skyEvents } from '../../shared/lib/astro/events.ts';
import type { Globe } from '../globe/scene.ts';
import { LessonStage, fitView } from './stage.ts';
import { AstroStage } from './astro/stage.ts';
import { CATALOGS, lessonById, nextLesson, subjectOf, type Lesson, type Quiz, type Step, type Subject } from './data.ts';
import { renderFig, type Fig } from './figs.ts';
import { optionOrder, shuffled } from './shuffle.ts';
import type { AstroScene, Home, LL, Pair } from './kit.ts';

/** Where the learner tapped, how far from the answer, and the country tapped ("find the country" questions). */
type Tap = { ll: LL; km: number; a2?: string | null };
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
}

const done = () => new Set(load<string[]>('lessonsDone', []));
/** The curriculum picked in a subject's lesson list; Chinese readers start with the Chinese course. */
const view = (sub: Subject): string => { const c = CATALOGS[sub], v = load<string>(c.key, ''); return v in c.views ? v : c.def(lang() === 'zh'); };
const figure = (f: Fig | undefined) => f ? h('figure', { class: 'lesson-fig', 'data-testid': 'lesson-fig', html: renderFig(f, L) }) : '';

let active: { stop: () => void } | null = null;
export const lessoning = () => active !== null;
export function stopLesson(): void { active?.stop(); }

export function startLesson(id: string, host: LessonHost): void {
  const lesson = lessonById(id);
  if (!lesson || host.blocked()) return;
  stopLesson();
  document.querySelector('.tutorial')?.remove();
  host.toEarth(() => run(lesson, host));
}

function run(lesson: Lesson, host: LessonHost): void {
  stopLesson();
  const g = host.globe;
  const stage = new LessonStage(g, { low: host.low, lang, frame: () => freeArea(card) });
  // astronomy steps run on their own 3D board over the paused globe (made on first use)
  let astro: AstroStage | null = null;
  const astroBoard = () => astro ??= new AstroStage({ low: host.low, lang, frame: () => freeArea(card),
    onActive: on => { g.paused = on; if (!on) g.markDirty(); }, countries: () => g.countryShapes() });
  /** Whichever board the current step uses (its clock drives the card's clock row). */
  const board = (): LessonStage | AstroStage => (astro?.shown ? astro : stage);
  // for the end-to-end tests: what the stages drew
  const w = window as { __lesson?: LessonStage | null; __astro?: () => AstroStage | null; __quiz?: () => Quiz | null };
  w.__lesson = stage;
  w.__astro = () => astro;
  w.__quiz = () => quiz[i - steps.length] ?? null;
  const sub = subjectOf(lesson.id);
  // a lesson about the learner's own place is made once they say where they live (`pickHome`); practice tests are drawn afresh
  let steps = lesson.steps, quiz = lesson.quiz;
  if (lesson.gen) ({ steps, quiz } = lesson.gen());
  /** 0 … steps-1 are steps; steps … steps+quiz-1 are questions; steps+quiz is the score card. */
  let i = 0;
  let answers: (boolean | null)[] = quiz.map(() => null);
  /** The last answer to the current question: the option picked, or the tap and its distance. */
  let picked: number | null = null;
  let tap: Tap | null = null;
  /** Work in progress on the current question (the other question types). */
  const fresh = () => ({ seq: [] as number[], sel: null as number | null, pairs: new Map<number, number>(), multi: new Set<number>(), num: '', placed: [] as (LL | null)[], cur: 0 });
  let work = fresh();
  /** What was done on each answered question, so going Back shows it as it was. */
  const kept: ({ picked: number | null; tap: Tap | null; work: ReturnType<typeof fresh> } | undefined)[] = [];
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

  /** A lab's sliders and its self-ticking tasks (astronomy board scenes with `params`). */
  const labRows = () => {
    const b = astro?.shown ? astro : null, lab = b?.lab;
    if (!b || !lab) return '';
    const rows = lab.params.map(p => {
      const read = h('span', { class: 'lesson-time' });
      const show = () => { read.textContent = (p.fmt ? L(p.fmt) : '{v}').replace('{v}', (Math.round(b.params[p.id] * 10 ** (p.dp ?? 0)) / 10 ** (p.dp ?? 0)).toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en-US')); };
      const range = h('input', { type: 'range', min: String(p.min), max: String(p.max), step: String(p.step ?? (p.max - p.min) / 100), value: String(b.params[p.id]),
        'aria-label': L(p.name), 'data-testid': 'lab-' + p.id }) as HTMLInputElement;
      range.oninput = () => { b.setParam(p.id, +range.value); show(); };
      show();
      return h('label', { class: 'lab-row' }, h('span', { class: 'lab-name' }, L(p.name)), range, read);
    });
    const items = lab.tasks.map(tk => h('li', { 'data-testid': 'lab-task' }, L(tk.text)));
    const tick = () => b.tasksDone().forEach((d, j) => { if (d && !items[j].classList.contains('done')) { items[j].classList.add('done'); items[j].setAttribute('data-done', 'true'); } });
    const prev = b.onClock;
    b.onClock = () => { prev?.(); tick(); };
    tick();
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

  const renderQuiz = () => {
    const k = i - steps.length, q = quiz[k], ans = answers[k];
    stage.onClock = null;
    if (astro) astro.onClock = null;
    const check = (ok: boolean) => { answers[k] = ok; renderQuiz(); };
    const checkBtn = (ready: boolean, run: () => void) => ans === null
      ? h('button', { class: 'cta lesson-check', 'data-testid': 'lesson-check', disabled: !ready, onclick: run }, t('lessonCheck')) : '';
    /** What the right answer was, for the question types where the learner built an answer. */
    let reveal: string | HTMLElement = '';
    let body: HTMLElement;
    if (q.options && q.multi) {
      const right = new Set(q.multi);
      body = h('div', { class: 'lesson-opts' }, h('p', { class: 'muted small' }, t('lessonMulti')), ...optionOrder(q.q[0], k, q.options!.length).map(j => h('button', {
        class: 'pill lesson-opt lesson-multi' + (work.multi.has(j) ? ' on' : '') + (ans !== null && right.has(j) ? ' right' : '') + (ans !== null && work.multi.has(j) && !right.has(j) ? ' wrong' : ''),
        'data-testid': 'lesson-opt', 'data-right': String(right.has(j)), 'aria-pressed': String(work.multi.has(j)), disabled: ans !== null,
        onclick: () => { if (work.multi.has(j)) work.multi.delete(j); else work.multi.add(j); renderQuiz(); },
      }, L(q.options![j]))), checkBtn(work.multi.size > 0, () => check(work.multi.size === right.size && [...work.multi].every(j => right.has(j)))));
    } else if (q.options) {
      body = h('div', { class: 'lesson-opts' }, ...optionOrder(q.q[0], k, q.options!.length).map(j => h('button', {
        class: 'pill lesson-opt' + (ans !== null && j === q.answer ? ' right' : '') + (ans !== null && j === picked && j !== q.answer ? ' wrong' : ''),
        'data-testid': 'lesson-opt', 'data-right': String(j === q.answer), disabled: ans !== null,
        onclick: () => { picked = j; answers[k] = j === q.answer; renderQuiz(); },
      }, L(q.options![j]))));
    } else if (q.order) {
      const items = q.order, n = items.length, pool = shuffled(n, q.q[0], k);
      body = h('div', { class: 'lesson-order' },
        h('ol', { class: 'lesson-seq', 'data-testid': 'lesson-seq' }, ...work.seq.map((j, p) => h('li', {}, h('button', {
          class: 'pill lesson-chip' + (ans !== null ? (j === p ? ' right' : ' wrong') : ''), disabled: ans !== null, 'data-testid': 'lesson-order-picked',
          onclick: () => { work.seq.splice(p, 1); renderQuiz(); },
        }, L(items[j]))))),
        ans === null ? h('div', { class: 'lesson-pool' }, ...pool.filter(j => !work.seq.includes(j)).map(j => h('button', {
          class: 'pill lesson-chip', 'data-testid': 'lesson-order-item', 'data-pos': String(j),
          onclick: () => { work.seq.push(j); renderQuiz(); },
        }, L(items[j])))) : '',
        checkBtn(work.seq.length === n, () => check(work.seq.every((j, p) => j === p))));
      if (ans === false) reveal = h('p', { class: 'lesson-reveal' }, t('lessonOrderIs') + ' ', items.map(L).join(' → '));
    } else if (q.match) {
      const pairs = q.match, n = pairs.length, right = shuffled(n, q.q[0], k + 1000);
      const tag = (j: number) => h('span', { class: 'lesson-badge', style: `--c:${MATCH_C[j % MATCH_C.length]}` }, String(j + 1));
      const leftOf = (r: number) => [...work.pairs].find(([, v]) => v === r)?.[0];
      // definitions (long right-hand items) get most of the width
      body = h('div', { class: 'lesson-match' + (pairs.some(p => L(p[1]).length > 40) ? ' long' : '') },
        h('div', { class: 'lesson-col' }, ...pairs.map((p, j) => h('button', {
          class: 'pill lesson-chip' + (work.sel === j ? ' on' : '') + (ans !== null ? (work.pairs.get(j) === j ? ' right' : ' wrong') : ''),
          'data-testid': 'lesson-match-l', 'data-pos': String(j), disabled: ans !== null,
          onclick: () => { work.sel = work.sel === j ? null : j; renderQuiz(); },
        }, tag(j), h('span', {}, L(p[0]))))),
        h('div', { class: 'lesson-col' }, ...right.map(r => { const l = leftOf(r); return h('button', {
          class: 'pill lesson-chip' + (l !== undefined ? ' paired' : ''), 'data-testid': 'lesson-match-r', 'data-pos': String(r), disabled: ans !== null || (work.sel === null && l === undefined),
          onclick: () => {
            if (work.sel === null) { if (l !== undefined) work.pairs.delete(l); }
            else { if (l !== undefined) work.pairs.delete(l); work.pairs.set(work.sel, r); work.sel = pairs.findIndex((_, j) => !work.pairs.has(j)); if (work.sel < 0) work.sel = null; }
            renderQuiz();
          },
        }, l !== undefined ? tag(l) : h('span', { class: 'lesson-badge empty' }, '?'), h('span', {}, L(pairs[r][1]))); })),
        checkBtn(work.pairs.size === n, () => check(pairs.every((_, j) => work.pairs.get(j) === j))));
      if (ans === false) reveal = h('ul', { class: 'lesson-reveal' }, ...pairs.map(p => h('li', {}, `${L(p[0])} — ${L(p[1])}`)));
    } else if (q.num) {
      const nq = q.num;
      const input = h('input', { type: 'number', inputmode: 'decimal', step: 'any', class: 'lesson-num', 'data-testid': 'lesson-num', value: work.num, disabled: ans !== null, 'aria-label': L(q.q) }) as HTMLInputElement;
      const go1 = () => { const v = parseFloat(input.value); if (Number.isFinite(v)) { work.num = input.value; check(Math.abs(v - nq.answer) <= nq.tol); } };
      input.oninput = () => { work.num = input.value; btn.toggleAttribute('disabled', !Number.isFinite(parseFloat(input.value))); };
      input.onkeydown = e => { if (e.key === 'Enter') go1(); };
      const btn = h('button', { class: 'cta lesson-check', 'data-testid': 'lesson-check', disabled: !Number.isFinite(parseFloat(work.num)), onclick: go1 }, t('lessonCheck'));
      body = h('div', { class: 'lesson-numrow' + (ans === null ? '' : ans ? ' right' : ' wrong') }, input, nq.unit ? h('span', { class: 'muted' }, L(nq.unit)) : '', ans === null ? btn : '');
      if (ans !== null) reveal = h('p', { class: 'lesson-reveal' }, t('lessonAnswerIs', { v: `${fmtN(nq.answer)}${nq.unit ? ' ' + L(nq.unit) : ''}` }));
      if (ans === null) queueMicrotask(() => input.focus({ preventScroll: true }));
    } else if (q.place) {
      const pl = q.place, done = ans !== null;
      body = h('div', { class: 'lesson-place' },
        h('p', { class: 'lesson-tap', html: icon('pin', 14) }, h('span', {}, done ? '' : t('lessonPlace'))),
        h('div', { class: 'lesson-pool' }, ...pl.map((p, j) => {
          const at = work.placed[j], km = at ? haversineKm(at[0], at[1], p.at[0], p.at[1]) : 0, ok = !!at && km <= (p.tolKm ?? 500);
          return h('button', {
            class: 'pill lesson-chip' + (!done && work.cur === j ? ' on' : '') + (at && !done ? ' paired' : '') + (done ? (ok ? ' right' : ' wrong') : ''),
            'data-testid': 'lesson-place-chip', 'data-pos': String(j), disabled: done,
            onclick: () => { work.cur = j; renderQuiz(); },
          }, tagN(j), h('span', {}, L(p.text)), done && at ? h('small', {}, ` ${Math.round(km).toLocaleString()} km`) : '');
        })),
        checkBtn(pl.every((_, j) => !!work.placed[j]), () => {
          const ok = pl.every((p, j) => haversineKm(work.placed[j]![0], work.placed[j]![1], p.at[0], p.at[1]) <= (p.tolKm ?? 500));
          g.captureTaps = false; g.ev.onGlobeTap = undefined;
          stage.show({ cam: [g.lat, g.lon, g.h], wide: true,
            lines: pl.flatMap((p, j) => haversineKm(work.placed[j]![0], work.placed[j]![1], p.at[0], p.at[1]) > 30 ? [{ pts: [work.placed[j]!, p.at], c: '#f1f3f5', dur: 1 }] : []),
            marks: pl.flatMap((p, j) => [{ ll: work.placed[j]!, text: [`${j + 1}`, `${j + 1}`] as Pair, dot: true, c: '#ff6b6b' }, { ll: p.at, text: p.text, dot: true, big: true, c: '#ffd24a', t: 0.6 }]) });
          check(ok);
        }));
    } else {
      body = h('p', { class: 'lesson-tap', html: icon('pin', 14) }, h('span', {}, ans === null ? t(q.pick ? 'lessonPick' : 'lessonTap') : ''));
    }
    const why = ans === null ? '' : h('div', { class: 'lesson-why ' + (ans ? 'ok' : 'no'), 'aria-live': 'polite', 'data-testid': 'lesson-why' },
      h('p', {}, h('strong', {}, t(ans ? 'lessonRight' : 'lessonWrong') + ' '), tap && q.a2 ? (ans ? '' : tap.a2 && tap.a2 !== q.a2 ? t('lessonTapped', { c: L(regionName(tap.a2)) }) + ' ' : '') : tap ? t('lessonKm', { km: Math.round(tap.km).toLocaleString() }) + ' ' : '', L(q.why)), reveal);
    card.replaceChildren(
      head(t('lessonQ', { i: k + 1, n: quiz.length })),
      h('h2', { id: 'lesson-title' }, L(q.q)),
      figure(q.fig),
      q.astro ? clockRow() : '',
      body, why,
      nav(() => go(i - 1), () => go(i + 1), k === quiz.length - 1 ? t('tourFinish') : t('next'), ans === null));
  };

  /** A practice test's score: a point per matching pair, the parts added up, and what to review. */
  const examScore = () => {
    const secs = new Map<string, { name: Pair; s: number; n: number }>();
    const miss: string[] = [];
    let s = 0, n = 0;
    quiz.forEach((q, k) => {
      let got: number, of: number;
      if (q.match) {
        const pairs = kept[k]?.work.pairs;
        of = q.match.length;
        got = q.match.filter((p, j) => { const ok = pairs?.get(j) === j; if (!ok) miss.push(L(p[0])); return ok; }).length;
      } else {
        of = 1; got = answers[k] ? 1 : 0;
        if (!got && q.tag) miss.push(L(q.tag));
      }
      s += got; n += of;
      const key = q.sec ? q.sec[0] : '';
      const sec = secs.get(key) ?? { name: q.sec ?? ['Other', '其他'], s: 0, n: 0 };
      sec.s += got; sec.n += of;
      secs.set(key, sec);
    });
    const review = [...new Set(miss)];
    return [
      h('h2', { id: 'lesson-title', 'data-testid': 'lesson-score' }, t('examScore', { s, n })),
      h('ul', { class: 'lesson-keys exam-secs', 'data-testid': 'exam-secs' }, ...[...secs.values()].map(x => h('li', {}, h('strong', {}, L(x.name)), ` ${x.s} / ${x.n}`))),
      h('p', { class: 'lesson-keys-h' }, t(review.length ? 'examReview' : 'examPerfect')),
      review.length ? h('p', { class: 'muted small exam-review', 'data-testid': 'exam-review' }, review.join(lang() === 'zh' ? '、' : ', ')) : '',
    ];
  };

  const renderScore = () => {
    const s = answers.filter(Boolean).length;
    const v = view(sub), nx = nextLesson(lesson.id, v) ?? (v === 'all' ? undefined : nextLesson(lesson.id, 'all'));
    const again = () => {
      if (lesson.gen) { ({ steps, quiz } = lesson.gen()); answers = quiz.map(() => null); kept.length = 0; }
      else answers.fill(null);
      go(0);
    };
    card.replaceChildren(
      head(t('lessonQuiz'), 1),
      ...(lesson.exam ? examScore() : [h('h2', { id: 'lesson-title', 'data-testid': 'lesson-score' }, t('lessonScore', { s, n: quiz.length }))]),
      h('p', { class: 'lesson-keys-h' }, t('lessonKeys')),
      h('ul', { class: 'lesson-keys', 'data-testid': 'lesson-keys' }, ...lesson.keys.map(k => h('li', {}, L(k)))),
      h('div', { class: 'row' },
        h('button', { class: 'pill', 'data-testid': 'lesson-more', onclick: () => { stop(); openLessons(host, sub); } }, t('lessonMore')),
        h('button', { class: 'pill', 'data-testid': 'lesson-again', onclick: again }, t('lessonAgain')),
        lesson.build ? h('button', { class: 'pill', 'data-testid': 'lesson-home-again', onclick: () => askHome() }, t('lessonHomeOther')) : '',
        nx ? h('button', { class: 'cta', 'data-testid': 'lesson-nextlesson', title: L(nx.title), onclick: () => { stop(); startLesson(nx.id, host); } }, t('lessonNextOne'))
          : h('button', { class: 'cta', 'data-testid': 'lesson-done', onclick: () => stop() }, t('tourFinish'))));
  };

  const render = () => (picking ? renderHome() : i < steps.length ? renderStep() : i < steps.length + quiz.length ? renderQuiz() : renderScore());

  // ---- a lesson about the learner's own place: ask where that is first ----
  let picking = !!lesson.build;
  let locating = false;
  const setHome = (ll: LL) => {
    const at = stage.here(ll[0], ll[1]);
    const nm = (l: string) => { try { return new Intl.DisplayNames([l], { type: 'region' }).of(at.a2!) ?? at.a2!; } catch { return at.a2!; } };
    const home: Home = { ll, climate: at.climate, biome: at.biome, country: at.a2 ? { a2: at.a2, name: [nm('en'), nm('zh')] } : undefined };
    save('home', ll);
    const b = lesson.build!(home);
    steps = b.steps; quiz = b.quiz;
    answers = quiz.map(() => null);
    picking = false;
    g.captureTaps = false; g.ev.onGlobeTap = undefined;
    go(0);
  };
  const askHome = () => {
    picking = true;
    astro?.hide();
    const last = load<LL | null>('home', null);
    stage.show({ cam: last ? [last[0], last[1], 2.4] : [g.lat, g.lon, Math.max(g.h, 2.6)], wide: true,
      marks: last ? [{ ll: last, text: ['Last time', '上次的位置'], dot: true, big: true, c: '#ffd24a' }] : [] });
    g.captureTaps = true;
    g.ev.onGlobeTap = (lat, lon) => { if (picking) setHome([lat, lon]); };
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
        last ? h('button', { class: 'pill lesson-opt', 'data-testid': 'lesson-home-last', html: icon('flag', 14), onclick: () => setHome(last) },
          h('span', {}, t('lessonHomeLast', { ll: `${Math.abs(last[0]).toFixed(1)}°${last[0] >= 0 ? 'N' : 'S'} ${Math.abs(last[1]).toFixed(1)}°${last[1] >= 0 ? 'E' : 'W'}` }))) : ''),
      h('p', { class: 'muted small' }, t('lessonHomePrivacy')));
  };

  /** A step's or question's 3D scene on the astronomy board; the globe is cleared underneath. */
  const showAstro = (s: AstroScene) => {
    stage.show({ cam: [g.lat, g.lon, Math.max(g.h, 3)] });
    const b = astroBoard();
    b.onClock = null; // the last card's clock row is gone; render() hooks up the new one
    void b.show(s);
  };
  const showStep = (st: Step) => {
    if (st.astro) showAstro(st.astro);
    else { astro?.hide(); stage.show(st); }
  };
  /** Quiz scenes: a plain globe, the answer region in view for "find it" questions (but not centred). */
  const quizScene = (q: Quiz) => {
    if (q.astro) { showAstro(q.astro); return; }
    astro?.hide();
    if (q.show) { stage.show(q.show); return; }
    if (q.place) {
      // frame every answer, without showing them
      const f = fitView(q.place.map(p => p.at), innerWidth * 0.55, innerHeight * 0.8, innerHeight, g.camera.fov, 0.6);
      stage.show({ cam: f ? [f[0], f[1], Math.max(f[2] * 1.15, 1.3)] : [20, q.place[0].at[1], 4.2], wide: true });
      return;
    }
    if (!q.at) { stage.show({ cam: [g.lat, g.lon, Math.max(g.h, 3)] }); return; }
    stage.show({ cam: [Math.max(-60, Math.min(60, q.at[0] * 0.6)), q.at[1] + 32, 4.2] });
  };
  const listen = (k: number) => {
    const q = quiz[k];
    if (astro) astro.onPick = null;
    if (q.pick && answers[k] === null) {
      astroBoard().onPick = tag => {
        if (answers[k] !== null || !tag) return;
        answers[k] = tag === q.pick;
        picked = null;
        const b = astroBoard();
        b.onPick = null;
        if (tag !== q.pick) b.flag(tag, ['Your pick', '你点的'], '#ff6b6b');
        b.flag(q.pick!, ['Answer', '正确答案'], '#ffd24a');
        renderQuiz();
      };
      return;
    }
    if (q.place && answers[k] === null) {
      g.captureTaps = true;
      g.ev.onGlobeTap = (lat, lon) => {
        if (answers[k] !== null) return;
        work.placed[work.cur] = [lat, lon];
        const nx = q.place!.findIndex((_, j) => !work.placed[j]);
        if (nx >= 0) work.cur = nx;
        stage.show({ cam: [g.lat, g.lon, g.h], wide: true,
          marks: q.place!.flatMap((p, j) => work.placed[j] ? [{ ll: work.placed[j]!, text: p.text, dot: true, c: MATCH_C[j % MATCH_C.length] }] : []) });
        renderQuiz();
      };
      return;
    }
    g.captureTaps = !!q.at && answers[k] === null;
    g.ev.onGlobeTap = g.captureTaps ? (lat, lon) => {
      if (answers[k] !== null || !q.at) return;
      const km = haversineKm(lat, lon, q.at[0], q.at[1]);
      g.captureTaps = false;
      g.ev.onGlobeTap = undefined;
      if (q.a2) {
        // "find this country": anywhere inside it counts; the reveal paints it and names the country tapped
        const hit = countryAt(g.fineShapes(), lat, lon)?.a2 ?? null;
        tap = { ll: [lat, lon], km, a2: hit };
        answers[k] = hit === q.a2 || km <= (q.tolKm ?? 60);
        const nm = hit && hit !== q.a2 ? regionName(hit) : null;
        const base = q.show ?? { cam: [q.at[0], q.at[1], 2.6] as [number, number, number], wide: true };
        stage.show({ ...base,
          paint: [...(base.paint ?? []), { fill: { k: 'land', a2: [q.a2], c: '#ffd24a' }, a: 0.8 }],
          marks: [{ ll: [lat, lon], text: nm ?? ['Your tap', '你点的位置'], dot: true, c: answers[k] ? '#51cf66' : '#ff6b6b' },
            { ll: q.at, text: q.tag ?? ['Answer', '正确位置'], dot: true, big: true, c: '#ffd24a', t: 0.5 }] });
        renderQuiz();
        return;
      }
      tap = { ll: [lat, lon], km };
      answers[k] = km <= (q.tolKm ?? 500);
      stage.show({
        cam: [q.at[0], q.at[1], 2.6],
        lines: km > 30 ? [{ pts: [[lat, lon], q.at], c: '#f1f3f5', dur: 1 }] : [],
        marks: [{ ll: [lat, lon], text: ['Your tap', '你点的位置'], dot: true, c: answers[k] ? '#51cf66' : '#ff6b6b' },
          { ll: q.at, text: ['Answer', '正确位置'], dot: true, big: true, c: '#ffd24a', t: 0.8 }],
      });
      renderQuiz();
    } : undefined;
  };

  const go = (k: number) => {
    if (k < 0 || k > steps.length + quiz.length) return;
    const qi = (n: number) => (n >= steps.length && n < steps.length + quiz.length ? n - steps.length : -1);
    if (qi(i) >= 0) kept[qi(i)] = { picked, tap, work };
    i = k;
    const was = qi(i) >= 0 && answers[qi(i)] !== null ? kept[qi(i)] : undefined;
    picked = was?.picked ?? null; tap = was?.tap ?? null; work = was?.work ?? fresh();
    g.captureTaps = false; g.ev.onGlobeTap = undefined;
    if (astro) astro.onPick = null;
    if (i < steps.length) showStep(steps[i]);
    else if (i < steps.length + quiz.length) {
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
    if (answers.filter(Boolean).length >= quiz.length - 1) confetti(40);
  };

  const stop = () => {
    stopped = true;
    offLang();
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
/** A country's name in both languages, from its ISO code. */
function regionName(a2: string): Pair {
  const nm = (l: string) => { try { return new Intl.DisplayNames([l], { type: 'region' }).of(a2) ?? a2; } catch { return a2; } };
  return [nm('en'), nm('zh')];
}
const fmtN = (v: number) => v.toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 });

function nextSolstice(): string | undefined {
  const now = Date.now();
  return skyEvents(now, now + 400 * DAY, { kinds: ['solstice'] })[0]?.id;
}

/** The lesson picker of a subject: pick a curriculum, then its lessons in groups (textbook volumes, or themes). */
export function openLessons(host: LessonHost, sub: Subject = 'geo'): void {
  const seen = done(), cat = CATALOGS[sub];
  const list = h('div', { class: 'tour-list lesson-list', 'data-testid': 'lesson-list' });
  const note = h('p', { class: 'muted small' });
  const fill = (v: string) => {
    note.textContent = L(cat.views[v].note);
    const groups = cat.course(v).map(gr => h('section', { class: 'lesson-group' },
      h('h3', { class: 'lesson-grade' }, h('span', {}, L(gr.name)), h('small', {}, `${gr.lessons.filter(x => seen.has(x.id)).length}/${gr.lessons.length}`)),
      ...gr.lessons.map(x => h('div', { class: 'tour-row lesson-row' + (seen.has(x.id) ? ' done' : '') },
        h('button', { class: 'tour-pick', 'data-testid': 'lesson-' + x.id, onclick: () => { closeModal('lessons'); startLesson(x.id, host); } },
          h('span', { class: 'tile', html: icon(x.icon, 18) }),
          h('span', { class: 'grow' }, h('strong', {}, L(x.title)), h('span', { class: 'muted small' }, `${L(x.unit)} · ${L(x.blurb)}`)),
          h('span', { class: 'meta' }, (seen.has(x.id) ? '✓ ' : '') + t('minutesN', { n: x.minutes }))),
        h('button', { class: 'icon-btn tour-link', 'aria-label': t('classLink'), title: t('classLink'), html: icon('share', 14),
          onclick: () => void copyLink(sub === 'ssbs' ? ssbsLink(x.id) : classroomLink(x.id, 'lesson')) })))));
    list.replaceChildren(...groups);
  };
  const sel = new Select({ label: t('lessonTrack'), testid: 'lesson-track', icon: 'book', value: view(sub),
    options: Object.keys(cat.views).map(v => ({ value: v, label: L(cat.views[v].name) })),
    onChange: v => { save(cat.key, v); fill(v); } });
  fill(view(sub));
  openModal('lessons', t(sub === 'astro' ? 'astroLessons' : sub === 'ssbs' ? 'ssbsLessons' : 'lessons'), h('div', { class: 'lesson-pickwrap' }, h('p', { class: 'muted' }, t(sub === 'astro' ? 'astroIntro' : sub === 'ssbs' ? 'ssbsIntro' : 'lessonsIntro')),
    h('div', { class: 'lesson-track' }, sel.el, note), list));
}

async function copyLink(link: string): Promise<void> {
  try { await navigator.clipboard.writeText(link); toast(t('classLinkCopied')); }
  catch { prompt(t('classLink'), link); }
}
