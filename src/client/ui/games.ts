import { subName } from '../../shared/data/subs.ts';
import { h, openModal, closeModal, toast, confetti } from './dom.ts';
import { t, lang, countryName, fmtNum } from '../lib/i18n.ts';
import { store, updateProgress } from '../store.ts';
import { api } from '../lib/api.ts';
import { CATALOGUE, LANDMARKS } from '../../shared/data/catalogue.ts';
import { CITIES, CITY_ZH, cityName } from '../../shared/data/cities.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import { tr, type CatalogueItem } from '../../shared/data/types.ts';
import { sfx } from '../lib/sfx.ts';
import { load, save } from '../lib/storage.ts';
import { formatKm } from '../../shared/lib/geo.ts';
import type { Globe } from '../globe/scene.ts';
import { createModelPreview } from '../models/preview.ts';
import { icon } from './icons.ts';
import { DIFFS, ROUNDS, effectiveKm, scoreFor, verdict, pickRounds, updateRecord, type Difficulty } from '../../shared/games/placeit.ts';
import { generateQuiz, applyAnswer, ranking, QUIZ_SETS, type QuizSet, type QuizLevel, type PlayerScore } from '../../shared/games/quiz.ts';
import { buildPool, dayIndex, puzzleFor, evaluate, applyGuess, finishStats, hintsUnlocked, shareText, MAX_GUESSES, BAND_EMOJI, type DailyState } from '../../shared/games/daily.ts';

export interface GameHost { globe: Globe; setGameMode: (on: boolean, names?: boolean) => void }

/** Starts one of the three games (the Explore hub lists them on its Play shelf). */
export function startGame(host: GameHost, kind: 'daily' | 'placeit' | 'quiz'): void {
  if (kind === 'daily') openDaily(host); else if (kind === 'placeit') placeItSetup(host); else quizSetup(host);
}

// ================= Place it! =================
function placeItSetup(host: GameHost): void {
  const recs = store.progress.placeit;
  const body = h('div', { class: 'diff-grid' }, ...(Object.keys(DIFFS) as Difficulty[]).map(d =>
    h('button', { class: 'diff', 'data-testid': 'diff-' + d, onclick: () => { closeModal('placeit-setup'); void runPlaceIt(host, d); } },
      h('strong', {}, t(d)), h('small', { html: icon('bulb', 14) }, ` × ${DIFFS[d].hints}`), recs[d] ? h('small', {}, `${t('best')}: ${fmtNum(recs[d].best)}`) : null)));
  openModal('placeit-setup', t('placeit'), body);
}

async function runPlaceIt(host: GameHost, diff: Difficulty, rnd: () => number = Math.random): Promise<void> {
  const cfg = DIFFS[diff];
  const rounds = pickRounds(CATALOGUE, diff, rnd);
  const g = host.globe;
  host.setGameMode(true, cfg.names);
  let hints = cfg.hints, total = 0, r = 0;
  const results: { item: CatalogueItem; km: number; score: number }[] = [];
  const hud = h('div', { class: 'game-hud', 'data-testid': 'placeit-hud' });
  document.body.append(hud);
  g.flyTo(20, 10, 2.6);

  const quit = () => { hud.remove(); host.setGameMode(false); g.clearPins(); };

  const playRound = () => new Promise<void>(resolve => {
    const it = rounds[r];
    let guess: [number, number] | null = null;
    let hintLevel = 0;
    const hintText = h('span', { class: 'hint-text' });
    const confirmBtn = h('button', { class: 'cta', disabled: true, 'data-testid': 'placeit-confirm', onclick: () => reveal() }, t('confirm'));
    const hintBtn = h('button', { class: 'pill', 'data-testid': 'placeit-hint', disabled: hints <= 0, onclick: () => {
      if (hints <= 0 || hintLevel >= 2) return;
      hints--; hintLevel++;
      hintText.textContent = hintLevel === 1 ? (CONTINENT_NAMES[it.continent]?.[lang()] ?? '') : (countryName(it.country) || CONTINENT_NAMES[it.continent]?.[lang()]);
      hintBtn.innerHTML = icon('bulb', 16) + ` ${hints}`;
      if (hints <= 0 || hintLevel >= 2) hintBtn.setAttribute('disabled', '');
    }, html: icon('bulb', 16) + ` ${hints}` });
    hud.replaceChildren(
      h('div', { class: 'hud-top' },
        h('span', { class: 'hud-pill' }, t('round', { r: r + 1, n: ROUNDS })),
        h('span', { class: 'hud-pill hud-score', 'data-testid': 'placeit-total' }, `${t('total')}: ${fmtNum(total)}`),
        h('button', { class: 'pill danger pill-sm', onclick: () => { g.ev.onGlobeTap = undefined; quit(); resolve(); r = ROUNDS + 1; } }, '✕')),
      h('div', { class: 'hud-main' },
        createModelPreview(it, { width: 112, height: 72, id: 'placeit-preview' }),
        h('div', { class: 'hud-info' },
          h('div', { class: 'hud-target' },
            h('span', { class: 'hud-emoji', 'aria-hidden': 'true' }, it.emoji),
            h('strong', { 'data-testid': 'placeit-target' }, tr(it.name, lang()))),
          h('p', { class: 'muted' }, t('guessHere')),
          hintText),
        h('div', { class: 'hud-actions' }, hintBtn, confirmBtn)));
    g.ev.onGlobeTap = (lat, lon) => {
      guess = [lat, lon];
      g.clearPins(); g.addPin(lat, lon, '#ff5a5a');
      confirmBtn.removeAttribute('disabled');
      sfx.tap();
    };
    function reveal() {
      if (!guess) return;
      g.ev.onGlobeTap = undefined;
      const km = effectiveKm(it, guess[0], guess[1]);
      const score = scoreFor(km, cfg);
      total += score;
      results.push({ item: it, km, score });
      g.addPin(it.lat, it.lon, '#3ad07a');
      g.addArc(guess, [it.lat, it.lon]);
      const mid: [number, number] = [(guess[0] + it.lat) / 2, (guess[1] + it.lon) / 2];
      g.flyTo(mid[0], mid[1], Math.max(0.8, Math.min(4, km / 2500 + 0.8)));
      const v = verdict(score);
      if (score >= 700) sfx.good(); else if (score === 0) sfx.bad(); else sfx.pop();
      hud.replaceChildren(
        h('div', { class: 'hud-top' },
          h('span', { class: 'hud-pill' }, t('round', { r: r + 1, n: ROUNDS })),
          h('span', { class: 'hud-pill hud-score', 'data-testid': 'placeit-total' }, `${t('total')}: ${fmtNum(total)}`)),
        h('div', { class: 'hud-main' },
          createModelPreview(it, { width: 112, height: 72, id: 'placeit-preview' }),
          h('div', { class: 'hud-info' },
            h('div', { class: 'hud-target' }, h('span', { class: 'hud-emoji' }, it.emoji), h('strong', {}, tr(it.name, lang()))),
            h('p', { class: 'result', 'data-testid': 'placeit-result' }, h('b', {}, t(v)), ' ', t('distance', { d: formatKm(km, lang()) }), ' · +', t('points', { p: fmtNum(score) }))),
          h('div', { class: 'hud-actions' },
            h('button', { class: 'cta', 'data-testid': 'placeit-next', onclick: () => { g.clearPins(); resolve(); } }, r + 1 >= ROUNDS ? t('results') : t('next')))));
    }
  });

  for (r = 0; r < ROUNDS; r++) {
    await playRound();
    if (r > ROUNDS) return;
  }
  quit();
  let isNew = false;
  updateProgress(p => { const u = updateRecord(p.placeit[diff], total); p.placeit[diff] = u.rec; isNew = u.isNew; });
  if (isNew) { confetti(); sfx.fanfare(); }
  openModal('placeit-results', t('results'), h('div', { class: 'results', 'data-testid': 'placeit-results' },
    h('p', { class: 'big-score' }, fmtNum(total), h('small', {}, ` / ${fmtNum(ROUNDS * 1000)}`)),
    isNew ? h('p', { class: 'record' }, '🏆 ' + t('newRecord')) : h('p', { class: 'muted' }, `${t('best')}: ${fmtNum(store.progress.placeit[diff].best)}`),
    h('ol', { class: 'round-list' }, ...results.map(x => h('li', {}, `${x.item.emoji} ${tr(x.item.name, lang())} — ${formatKm(x.km, lang())} · ${fmtNum(x.score)}`))),
    h('button', { class: 'cta', onclick: () => { closeModal('placeit-results'); void runPlaceIt(host, diff); } }, t('playAgain'))));
}

// ================= Quiz =================
function quizSetup(host: GameHost): void {
  let players = 1, set: QuizSet = 'mixed', level: QuizLevel = 'normal';
  const names = h('div', { class: 'names' });
  const renderNames = () => names.replaceChildren(...Array.from({ length: players }, (_, i) =>
    h('input', { class: 'name-input', maxlength: 12, value: t('player', { n: i + 1 }), 'aria-label': t('player', { n: i + 1 }) })));
  const seg = <T extends string | number>(label: string, opts: T[], cur: T, labelOf: (v: T) => string, on: (v: T) => void, id: string) => {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    const draw = (v: T) => wrap.replaceChildren(...opts.map(o => h('button', { class: o === v ? 'on' : '', role: 'radio', 'aria-checked': String(o === v), 'data-testid': `${id}-${o}`, onclick: () => { on(o); draw(o); } }, labelOf(o))));
    draw(cur);
    return h('fieldset', {}, h('legend', {}, label), wrap);
  };
  renderNames();
  openModal('quiz-setup', t('quiz'), h('div', { class: 'quiz-setup' },
    seg(t('players'), [1, 2, 3, 4], players, v => String(v), v => { players = v; renderNames(); }, 'players'), names,
    seg(t('set'), QUIZ_SETS, set, v => t('set' + v), v => (set = v), 'set'),
    seg(t('level'), ['easy', 'normal', 'hard'] as QuizLevel[], level, v => t(v), v => (level = v), 'level'),
    h('button', { class: 'cta', 'data-testid': 'quiz-start', onclick: () => {
      const ps = [...names.querySelectorAll('input')].map((i, k) => (i as HTMLInputElement).value.trim() || t('player', { n: k + 1 }));
      closeModal('quiz-setup');
      runQuiz(host, ps, set, level);
    } }, t('start'))));
}

function runQuiz(host: GameHost, names: string[], set: QuizSet, level: QuizLevel): void {
  const per = names.length === 1 ? 10 : 5;
  const qs = generateQuiz(CATALOGUE, set, level, per * names.length, lang(), a2 => countryName(a2));
  let players: PlayerScore[] = names.map(n => ({ name: n, score: 0, streak: 0, bestStreak: 0 }));
  let i = 0;
  const bySet: Record<string, number> = {};
  const ask = () => {
    if (i >= qs.length) return finish();
    const q = qs[i], pi = i % players.length, pl = players[pi];
    const opts = h('div', { class: 'opts' });
    const fb = h('p', { class: 'feedback', 'aria-live': 'polite' });
    q.options.forEach((o, k) => opts.append(h('button', { class: 'opt', 'data-testid': 'quiz-opt', 'data-correct': String(k === q.answer), onclick: () => {
      const ok = k === q.answer;
      players[pi] = applyAnswer(pl, ok);
      if (ok) bySet[q.set] = (bySet[q.set] ?? 0) + 1;
      opts.querySelectorAll('button').forEach((b, j) => { b.setAttribute('disabled', ''); if (j === q.answer) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
      fb.textContent = ok ? '✅ ' + t('correct') + (players[pi].streak >= 3 ? ` 🔥×${players[pi].streak}` : '') : '❌ ' + t('wrong', { a: q.options[q.answer] });
      ok ? sfx.good() : sfx.bad();
      if (q.focus) host.globe.flyTo(q.focus.lat, q.focus.lon, 1.6);
      next.removeAttribute('disabled');
      next.focus();
    } }, o)));
    const next = h('button', { class: 'cta', disabled: true, 'data-testid': 'quiz-next', onclick: () => { i++; closeModal('quiz'); ask(); } }, i + 1 >= qs.length ? t('results') : t('next'));
    openModal('quiz', t('question', { q: i + 1, n: qs.length }), h('div', { class: 'quiz-q' },
      players.length > 1 ? h('p', { class: 'turn' }, t('yourTurn', { p: pl.name })) : null,
      h('p', { class: 'prompt', 'data-testid': 'quiz-prompt' }, tr(q.prompt, lang())), opts, fb, next,
      h('div', { class: 'scoreline' }, ...players.map(p => h('span', {}, `${p.name}: ${p.score}`)))));
  };
  const finish = () => {
    const ranked = ranking(players);
    const correct = players.reduce((a, p) => a + p.score, 0);
    updateProgress(p => {
      p.quiz.answered += qs.length; p.quiz.correct += correct;
      for (const [k, v] of Object.entries(bySet)) p.quiz.bySet[k] = (p.quiz.bySet[k] ?? 0) + v;
    });
    confetti(40); sfx.fanfare();
    const medals = ['🥇', '🥈', '🥉', '🎖️'];
    openModal('quiz-results', t('results'), h('div', { class: 'results', 'data-testid': 'quiz-results' },
      h('div', { class: 'podium' }, ...ranked.slice(0, 3).map((p, k) => h('div', { class: 'step s' + (k + 1) }, h('span', {}, medals[k]), h('strong', {}, p.name), h('span', {}, String(p.score))))),
      h('table', { class: 'rank' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('players')), h('th', {}, t('score')), h('th', {}, '🔥'))),
        h('tbody', {}, ...ranked.map((p, k) => h('tr', {}, h('td', {}, String(k + 1)), h('td', {}, p.name), h('td', {}, `${p.score} / ${qs.length / players.length}`), h('td', {}, String(p.bestStreak)))))),
      h('button', { class: 'cta', onclick: () => { closeModal('quiz-results'); runQuiz(host, names, set, level); } }, t('playAgain'))));
  };
  void players;
  ask();
}

// ================= Daily Planet =================
const POOL = buildPool(CATALOGUE);
interface Guessable { key: string; label: string; lat: number; lon: number; aliases: string[] }
function guessables(): Guessable[] {
  const l = lang();
  const out: Guessable[] = LANDMARKS.map(i => ({ key: i.key, label: tr(i.name, l), lat: i.lat, lon: i.lon, aliases: Object.values(i.name).map(s => s!.toLowerCase()) }));
  for (const [name, cc, lat, lon] of CITIES) out.push({ key: 'city:' + name, label: `${cityName(name, l)} (${countryName(cc, l)})`, lat, lon, aliases: [name.toLowerCase(), ...(CITY_ZH[name] ? [CITY_ZH[name]] : [])] });
  return out;
}

function openDaily(host: GameHost): void {
  const day = dayIndex();
  const target = puzzleFor(POOL, day);
  let state = load<DailyState | null>('dailyState', null);
  if (!state || state.day !== day) state = { day, guesses: [], done: false, won: false };
  const list = guessables();
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const byLabel = new Map(list.map(g => [fold(g.label), g]));
  const find = (q: string) => byLabel.get(fold(q)) ?? list.find(g => g.aliases.some(a => fold(a) === fold(q)));

  const rows = h('ol', { class: 'daily-rows', 'data-testid': 'daily-rows' });
  const hintsEl = h('div', { class: 'daily-hints' });
  const input = h('input', { list: 'daily-list', placeholder: t('dailyGuess'), 'aria-label': t('dailyGuess'), 'data-testid': 'daily-input', autocomplete: 'off' });
  const dl = h('datalist', { id: 'daily-list' }, ...list.map(g => h('option', { value: g.label })));
  const labelOf = (key: string) => key.startsWith('pin:') ? '⌖ ' + key.slice(4) : list.find(x => x.key === key)?.label ?? key;
  const submitGuess = (g: { key: string; lat: number; lon: number }) => {
    if (state!.guesses.some(x => x.key === g.key)) return;
    const res = evaluate(target, g);
    state = applyGuess(state!, res);
    save('dailyState', state);
    if (state.done) {
      updateProgress(p => { p.daily = finishStats(p.daily, state!); });
      // signed in: the result is kept on the server too (streaks and the learning dashboard)
      if (store.me) void api.daily(state.day, state.won, state.guesses.length).catch(() => undefined);
      if (state.won) { confetti(); sfx.fanfare(); } else sfx.bad();
      host.globe.flyTo(target.lat, target.lon, 1.2);
    } else res.band === 'warm' ? sfx.pop() : sfx.tap();
  };
  const pickOnGlobe = () => {
    closeModal('daily');
    host.setGameMode(true, false);
    const g = host.globe;
    const hud = h('div', { class: 'game-hud', 'data-testid': 'daily-pick-hud' },
      h('div', { class: 'row' }, h('strong', { html: icon('calendar', 16) }, ' ' + t('dailyTap')),
        h('button', { class: 'pill danger', onclick: () => { hud.remove(); host.setGameMode(false); openDaily(host); } }, '✕')));
    document.body.append(hud);
    g.ev.onGlobeTap = (lat, lon) => {
      g.ev.onGlobeTap = undefined;
      g.clearPins(); g.addPin(lat, lon, '#ff5a5a');
      submitGuess({ key: `pin:${lat.toFixed(1)}°, ${lon.toFixed(1)}°`, lat, lon });
      setTimeout(() => { hud.remove(); g.clearPins(); host.setGameMode(false); openDaily(host); }, 700);
    };
  };
  const form = h('form', { class: 'daily-form', onsubmit: (e: Event) => {
    e.preventDefault();
    const g = find(input.value.trim());
    if (!g) { toast(t('notFound')); sfx.bad(); return; }
    input.value = '';
    submitGuess(g);
    render();
  } }, input, dl, h('button', { class: 'cta', type: 'submit', 'data-testid': 'daily-submit' }, '➤'),
    h('button', { class: 'pill', type: 'button', 'data-testid': 'daily-pick', title: t('dailyTap'), onclick: pickOnGlobe, html: icon('pin', 16) }, ' ' + t('dailyPick')));
  const endEl = h('div', { class: 'daily-end' });
  const facts = target.facts ?? {};
  const clue = h('div', { class: 'daily-clue' }, h('span', { class: 'big', 'aria-hidden': 'true' }, state.done ? target.emoji : '❓'),
    h('p', {}, `#${day + 1} · ${subName(target.sub, lang())}${facts.built !== undefined ? ' · ' + t('built') + ' ' + (facts.built < 0 ? t('bce', { n: -facts.built }) : facts.built) : ''}${facts.heightM ? ' · ' + fmtNum(facts.heightM) + ' m' : ''}`));

  function render() {
    const s = state!;
    rows.replaceChildren(...s.guesses.map(g => {
      const label = labelOf(g.key);
      return h('li', { class: 'band-' + g.band }, h('span', {}, BAND_EMOJI[g.band]), h('span', { class: 'grow' }, label), h('span', {}, formatKm(g.km, lang())), h('span', {}, g.arrow));
    }), ...Array.from({ length: MAX_GUESSES - s.guesses.length }, () => h('li', { class: 'empty' }, '·')));
    const misses = s.guesses.filter(g => g.band !== 'hit').length;
    const hs = hintsUnlocked(misses);
    hintsEl.replaceChildren(...hs.map(k => h('p', { class: 'hint', 'data-testid': 'daily-hint', html: icon('bulb', 15) }, ' ' + (k === 'continent' ? t('dHintCont', { c: CONTINENT_NAMES[target.continent][lang()] })
      : k === 'country' ? t('dHintCountry', { c: countryName(target.country) }) : t('dHintName', { c: tr(target.name, lang()).slice(0, 2) })))));
    form.style.display = s.done ? 'none' : '';
    if (s.done) {
      const st = store.progress.daily;
      const text = shareText(s);
      clue.querySelector('.big')!.textContent = target.emoji;
      endEl.replaceChildren(
        h('div', { class: 'daily-preview-wrap' }, createModelPreview(target, { width: 150, height: 100 })),
        h('p', { class: 'result', 'data-testid': 'daily-result' }, s.won ? '🎉 ' + t('dailyWin', { n: s.guesses.length }) : t('dailyLose', { a: tr(target.name, lang()) })),
        h('pre', { class: 'share-text' }, text),
        h('button', { class: 'cta', 'data-testid': 'daily-share', onclick: async () => {
          try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast(t('copied')); } } catch { /* cancelled */ }
        }, html: icon('share', 16) }, ' ' + t('share')),
        h('div', { class: 'stats' }, h('span', {}, `${t('played')}: ${st.played}`), h('span', {}, `${t('streak')}: ${st.streak}`), h('span', {}, `${t('best')}: ${st.maxStreak}`)),
        h('p', { class: 'muted' }, t('nextPuzzle', { t: untilMidnight() })));
    } else endEl.replaceChildren();
  }
  render();
  openModal('daily', t('daily'), h('div', { class: 'daily' }, clue, rows, hintsEl, form, endEl));
  if (!state.done) setTimeout(() => input.focus(), 50);
}

function untilMidnight(): string {
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
  const s = Math.floor((m.getTime() - n.getTime()) / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
