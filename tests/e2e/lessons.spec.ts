import { test, expect, type Page } from '@playwright/test';
import { fromHub, openApp } from './helpers.ts';

type W = { __lesson?: { painted: boolean; lineCount: number; sunLat: number; now: number; playing: boolean } | null; __pp: { globe: { h: number; zoomRange: [number, number] | null; captureTaps: boolean; forceNight: boolean; simTime: number | null; ev: { onGlobeTap?: (a: number, b: number) => void } } } };
const lesson = (page: Page) => page.evaluate(() => { const l = (window as unknown as W).__lesson; return l ? { painted: l.painted, lines: l.lineCount, sunLat: l.sunLat, now: l.now, playing: l.playing } : null; });
/** A point on the scene beside the lesson card, for wheel and pointer input. */
const beside = async (page: Page) => {
  const b = (await page.getByTestId('lesson').boundingBox())!, W = page.viewportSize()!.width, H = page.viewportSize()!.height;
  return b.x > W / 2 ? { x: b.x / 2, y: H / 2 } : { x: (b.x + b.width + W) / 2, y: H / 2 };
};
const globe = (page: Page) => page.evaluate(() => { const g = (window as unknown as W).__pp.globe; return { capture: g.captureTaps, night: g.forceNight, sim: g.simTime }; });

type QW = W & { __quiz?: () => { options?: unknown[]; multi?: number[]; order?: unknown[]; match?: unknown[]; num?: { answer: number }; place?: { at: [number, number] }[]; at?: [number, number]; pick?: string } | null };
/** The current question's type and what answers it (read from the lesson data). */
const question = (page: Page) => page.evaluate(() => {
  const q = (window as unknown as QW).__quiz?.();
  if (!q) return null;
  const kind = q.multi ? 'multi' : q.options ? 'choice' : q.order ? 'order' : q.match ? 'match' : q.num ? 'num' : q.place ? 'place' : q.pick ? 'pick' : 'at';
  return { kind, n: q.order?.length ?? q.match?.length ?? 0, num: q.num?.answer ?? 0, place: q.place?.map(p => p.at) ?? [], at: q.at ?? null };
});
const tapGlobe = (page: Page, [lat, lon]: [number, number]) => page.evaluate(([a, b]) => (window as unknown as W).__pp.globe.ev.onGlobeTap!(a, b), [lat, lon]);
/** Answers the current question correctly, whatever its type; returns the type. */
async function answer(page: Page): Promise<string> {
  const card = page.getByTestId('lesson'), q = (await question(page))!;
  const check = () => card.getByTestId('lesson-check').click();
  if (q.kind === 'choice') await card.locator('[data-testid="lesson-opt"][data-right="true"]').click();
  else if (q.kind === 'multi') {
    const n = await card.locator('[data-testid="lesson-opt"][data-right="true"]').count();
    for (let j = 0; j < n; j++) await card.locator('[data-testid="lesson-opt"][data-right="true"]').nth(j).click();
    await check();
  } else if (q.kind === 'order') {
    for (let p = 0; p < q.n; p++) await card.locator(`[data-testid="lesson-order-item"][data-pos="${p}"]`).click();
    await check();
  } else if (q.kind === 'match') {
    for (let j = 0; j < q.n; j++) {
      const l = card.locator(`[data-testid="lesson-match-l"][data-pos="${j}"]`);
      if (!/\bon\b/.test((await l.getAttribute('class')) ?? '')) await l.click();
      await card.locator(`[data-testid="lesson-match-r"][data-pos="${j}"]`).click();
    }
    await check();
  } else if (q.kind === 'num') {
    await card.getByTestId('lesson-num').fill(String(q.num));
    await check();
  } else if (q.kind === 'place') {
    await expect.poll(async () => (await globe(page)).capture).toBe(true);
    for (let j = 0; j < q.place.length; j++) { await card.locator(`[data-testid="lesson-place-chip"][data-pos="${j}"]`).click(); await tapGlobe(page, q.place[j]); }
    await check();
  } else if (q.kind === 'at') {
    await expect.poll(async () => (await globe(page)).capture).toBe(true);
    await tapGlobe(page, q.at!);
  } else throw new Error('pick questions are answered on the astronomy board');
  await expect(card.getByTestId('lesson-why')).toHaveClass(/ok/);
  return q.kind;
}
/** From a lesson's steps to its quiz; answers every question and returns their types. */
async function answerAll(page: Page): Promise<string[]> {
  const card = page.getByTestId('lesson'), kinds: string[] = [];
  for (let i = 0; i < 12 && !(await question(page)); i++) await card.getByTestId('lesson-next').click();
  while (await question(page)) { kinds.push(await answer(page)); await card.getByTestId('lesson-next').click(); }
  await expect(card.getByTestId('lesson-score')).toContainText(`${kinds.length} of ${kinds.length}`);
  return kinds;
}

test('geography class: pick a lesson, watch the steps, answer the quiz, leave cleanly', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);

  // the picker, from the menu: all topics by theme, or one curriculum (the Chinese one by textbook volume)
  await fromHub(page, 'learn', 'menu-lessons');
  await expect(page.getByTestId('lesson-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.lesson-grade')).toHaveCount(6);
  await page.getByTestId('lesson-track').click();
  await page.getByRole('option', { name: /China · PEP grades/ }).click();
  await expect(page.locator('.lesson-grade')).toHaveCount(4);
  await expect(page.getByTestId('lesson-usa')).toBeVisible();
  // the senior course has its own two volumes
  await page.getByTestId('lesson-track').click();
  await page.getByRole('option', { name: /China · PEP senior/ }).click();
  await expect(page.locator('.lesson-grade')).toHaveCount(2);
  await expect(page.getByTestId('lesson-h-layers')).toBeVisible();
  await expect(page.getByTestId('lesson-usa')).toHaveCount(0);
  await page.getByTestId('lesson-track').click();
  await page.getByRole('option', { name: /England/ }).click();
  await expect(page.getByTestId('lesson-usa')).toHaveCount(0);
  await expect(page.getByTestId('lesson-rivers')).toBeVisible();
  await page.getByTestId('lesson-track').click();
  await page.getByRole('option', { name: /All topics/ }).click();
  await page.getByTestId('lesson-zones').click();

  const card = page.getByTestId('lesson');
  await expect(card).toBeVisible();
  // step 1: a painted band and lines, a label that follows the globe
  await expect.poll(async () => (await lesson(page))?.painted, { timeout: 30_000 }).toBe(true);
  expect((await lesson(page))!.lines).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('lesson-mark').first()).toBeVisible({ timeout: 30_000 });
  // zooming is bounded by the step's framing; wheeling far out never leaves Earth for the Solar System
  await expect(page.getByTestId('scale-rail')).toBeHidden();
  const range = await page.evaluate(() => (window as unknown as W).__pp.globe.zoomRange);
  expect(range).not.toBeNull();
  const p = await beside(page);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(30); }
  await page.waitForTimeout(800);
  const hOut = await page.evaluate(() => (window as unknown as W).__pp.globe.h);
  expect(hOut).toBeLessThanOrEqual(range![1] + 1e-6);
  expect(hOut).toBeGreaterThan(Math.min(range![1], 4.5) - 1e-3);
  expect(page.url()).not.toContain('#solar');
  await expect(card).toBeVisible();
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(30); }
  expect(await page.evaluate(() => (window as unknown as W).__pp.globe.h)).toBeGreaterThanOrEqual(range![0] - 1e-6);
  // a step with a year clock: the overhead Sun moves, and the user can pause and scrub it
  for (let i = 0; i < 10 && !((await card.getByTestId('lesson-range').count()) && (await page.getByTestId('lesson-sun').count())); i++) {
    await card.getByTestId('lesson-next').click();
    await page.waitForTimeout(600);
  }
  await expect(card.getByTestId('lesson-range')).toBeVisible();
  await expect(page.getByTestId('lesson-sun')).toBeVisible({ timeout: 30_000 });
  const t0 = (await lesson(page))!.now;
  await expect.poll(async () => (await lesson(page))!.now, { timeout: 30_000 }).toBeGreaterThan(t0);
  expect((await globe(page)).sim).not.toBeNull();
  await card.getByTestId('lesson-play').click();
  expect((await lesson(page))!.playing).toBe(false);
  await card.getByTestId('lesson-range').fill('250'); // about three months after the March equinox
  await expect.poll(async () => (await lesson(page))!.sunLat).toBeGreaterThan(20);
  await page.screenshot({ path: info.outputPath('zones-clock.png') });

  // quiz: every question gives feedback and unlocks "next"
  await card.getByTestId('lesson-next').click();
  await expect(card.getByTestId('lesson-next')).toBeDisabled();
  expect((await answerAll(page)).length).toBeGreaterThanOrEqual(5);
  // the score card sums up the lesson and offers the next one in the course
  expect(await card.getByTestId('lesson-keys').locator('li').count()).toBeGreaterThanOrEqual(3);
  await expect(card.getByTestId('lesson-nextlesson')).toBeVisible();
  await card.getByTestId('lesson-exit').click();
  await expect(card).toHaveCount(0);
  // everything the lesson switched on is put back
  expect(await lesson(page)).toBeNull();
  expect(await globe(page)).toEqual({ capture: false, night: false, sim: null });
  expect(await page.evaluate(() => (window as unknown as W).__pp.globe.zoomRange)).toBeNull();
  await expect(page.getByTestId('scale-rail')).toBeVisible();
  await expect(page.getByTestId('lesson-mark')).toHaveCount(0);

  // a teacher's deep link opens a lesson; a "find it" question takes a tap on the globe
  await page.evaluate(() => { location.hash = 'lesson/continents'; });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/continents/i);
  for (let i = 0; i < 12 && !(await question(page)); i++) await card.getByTestId('lesson-next').click();
  // a wrong answer is explained too
  if ((await question(page))!.kind === 'choice') {
    await card.locator('[data-testid="lesson-opt"][data-right="false"]').first().click();
    await expect(card.getByTestId('lesson-why')).toHaveClass(/no/);
    await card.getByTestId('lesson-next').click();
  }
  let found = false;
  while (await question(page)) {
    const q = (await question(page))!;
    if (q.kind === 'at' && !found) {
      found = true;
      await expect.poll(async () => (await globe(page)).capture).toBe(true);
      await tapGlobe(page, q.at!);
      await expect(card.getByTestId('lesson-why')).toHaveClass(/ok/);
      await expect(card.getByTestId('lesson-why')).toContainText(/km/);
      expect((await globe(page)).capture).toBe(false);
      await page.screenshot({ path: info.outputPath('continents-locate.png') });
    } else await answer(page);
    await card.getByTestId('lesson-next').click();
  }
  expect(found).toBe(true);
  await expect(card.getByTestId('lesson-score')).toBeVisible();
  // leaving the globe for the Solar System ends the lesson
  await page.evaluate(() => { location.hash = 'solar'; });
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  expect(await lesson(page)).toBeNull();
  // lessons carry charts and diagrams: a climate graph draws in the card
  await page.evaluate(() => { location.hash = 'lesson/climates'; });
  await expect(card).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 8 && !(await card.getByTestId('lesson-fig').count()); i++) await card.getByTestId('lesson-next').click();
  await expect(card.getByTestId('lesson-fig').locator('svg, .fig-key').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('climates-fig.png') });
  await card.getByTestId('lesson-exit').click();
  expect(errors).toEqual([]);
});

type AW = { __astro?: () => { zoom: { dist: number; min: number; max: number }; shown: boolean; kitId: string | null; value: number; pickScreen(tag: string): { x: number; y: number } | null } | null; __pp: { globe: { paused: boolean } } };
const board = (page: Page) => page.evaluate(() => { const b = (window as unknown as AW).__astro?.(); return b ? { shown: b.shown, kit: b.kitId, v: b.value } : null; });

test('astronomy class: its own course, 3D models on a board of their own, "tap it" questions', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);

  await fromHub(page, 'learn', 'menu-astro');
  await expect(page.getByTestId('lesson-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.lesson-grade')).toHaveCount(7);
  await page.getByTestId('lesson-track').click();
  await page.getByRole('option', { name: /China · senior/ }).click();
  await expect(page.getByTestId('lesson-a-kepler')).toBeVisible();
  await expect(page.getByTestId('lesson-a-phases')).toHaveCount(0);
  await page.getByTestId('lesson-track').click();
  await page.getByRole('option', { name: /All topics/ }).click();
  await page.getByTestId('lesson-a-phases').click();

  // the step runs a kit on the astronomy board, over the paused globe; its clock moves
  const card = page.getByTestId('lesson');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('astro-board')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await board(page))?.kit, { timeout: 30_000 }).toBeTruthy();
  expect(await page.evaluate(() => (window as unknown as AW).__pp.globe.paused)).toBe(true);
  await card.getByTestId('lesson-next').click();
  await expect.poll(async () => (await board(page))?.kit, { timeout: 30_000 }).toBeTruthy();
  // the board's zoom stays within the step's framing too
  const zoom = () => page.evaluate(() => (window as unknown as AW).__astro!()!.zoom);
  const z0 = await zoom();
  expect(z0.max / z0.min).toBeLessThan(10);
  const q = await beside(page);
  await page.mouse.move(q.x, q.y);
  for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(30); }
  await expect.poll(async () => { const z = await zoom(); return z.dist <= z.max * 1.001; }).toBe(true);
  for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(30); }
  await expect.poll(async () => { const z = await zoom(); return z.dist >= z.min * 0.999; }).toBe(true);
  expect(page.url()).not.toContain('#solar');
  await page.screenshot({ path: info.outputPath('astro-step.png') });
  await card.getByTestId('lesson-exit').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('astro-board')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as AW).__pp.globe.paused)).toBe(false);

  // a deep link into the Pole Star lesson: the "tap it" question takes a tap on the star
  await page.evaluate(() => { location.hash = 'lesson/a-polaris'; });
  await expect(card).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 20 && (await question(page))?.kind !== 'pick'; i++) {
    if (await question(page)) await answer(page);
    await card.getByTestId('lesson-next').click();
  }
  await expect(card.locator('.lesson-tap')).toBeVisible();
  // wait for the star to stop moving on screen (the camera eases into the view)
  const where = () => page.evaluate(() => (window as unknown as AW).__astro?.()?.pickScreen('polaris') ?? null);
  let at: { x: number; y: number } | null = null;
  await expect.poll(async () => {
    const a = await where();
    await page.waitForTimeout(400);
    const b = await where();
    at = b;
    return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
  }, { timeout: 30_000 }).toBe(true);
  await page.mouse.click(at!.x, at!.y);
  await expect(card.getByTestId('lesson-why')).toHaveClass(/ok/);
  await page.screenshot({ path: info.outputPath('astro-pick.png') });
  await card.getByTestId('lesson-exit').click();
  expect(errors).toEqual([]);
});

type LW = { __astro?: () => { lab: { params: { id: string; min: number; max: number; step?: number }[]; tasks: { done: (p: Record<string, number>, v: number) => boolean }[] } | null; value: number } | null };

test('lesson activities: every question type, a hands-on lab, a lesson about where you live', async ({ page }, info) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  const card = page.getByTestId('lesson');

  // multi-select, ordering, matching, numbers and labelling the map, each answered the right way
  const kinds = new Set<string>();
  for (const id of ['revolution', 'zones', 'continents']) {
    await page.evaluate(x => { location.hash = 'lesson/' + x; }, id);
    await expect(card).toBeVisible({ timeout: 30_000 });
    for (const k of await answerAll(page)) kinds.add(k);
    await card.getByTestId('lesson-exit').click();
    await expect(card).toHaveCount(0);
  }
  for (const k of ['multi', 'order', 'match', 'num', 'place']) expect(kinds, k).toContain(k);

  // a lab: sliders in the card drive the 3D model, and a task ticks itself once it is done
  await page.evaluate(() => { location.hash = 'lesson/a-gnomon'; });
  await expect(card).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 10 && !(await card.getByTestId('lesson-lab').count()); i++) await card.getByTestId('lesson-next').click();
  await expect(card.getByTestId('lesson-lab')).toBeVisible();
  await expect(card.getByTestId('lab-task').first()).not.toHaveAttribute('data-done', 'true');
  // find slider settings that do the first task (the lab's own rule), then set them like a learner would
  const set = await page.evaluate(() => {
    const b = (window as unknown as LW).__astro!()!, lab = b.lab!, ps = lab.params, N = 20;
    const vals = (p: typeof ps[number]) => Array.from({ length: N + 1 }, (_, k) => { const st = p.step ?? (p.max - p.min) / 100, x = p.min + (k * (p.max - p.min)) / N; return p.min + Math.round((x - p.min) / st) * st; });
    const grid = ps.reduce<Record<string, number>[]>((acc, p) => acc.flatMap(a => vals(p).map(v => ({ ...a, [p.id]: v }))), [{}]);
    return grid.find(g => lab.tasks[0].done(g, b.value)) ?? null;
  });
  expect(set).not.toBeNull();
  for (const [id, v] of Object.entries(set!)) await card.getByTestId('lab-' + id).fill(String(v));
  await expect(card.getByTestId('lab-task').first()).toHaveAttribute('data-done', 'true');
  await page.screenshot({ path: info.outputPath('lab.png') });
  await card.getByTestId('lesson-exit').click();

  // "where I live": pick a place on the globe, and the lesson is written about it
  await page.evaluate(() => { location.hash = 'lesson/home'; });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await globe(page)).capture).toBe(true);
  await tapGlobe(page, [31.23, 121.47]);
  await expect(card).toContainText(/31\.2°N/);
  await page.screenshot({ path: info.outputPath('home.png') });
  expect((await answerAll(page)).length).toBeGreaterThanOrEqual(5);
  // another place: the last one is remembered
  await card.getByTestId('lesson-home-again').click();
  await expect(card.getByTestId('lesson-home-last')).toBeVisible();
  await card.getByTestId('lesson-exit').click();
  expect(errors).toEqual([]);
});

test('SSBS class: hidden unless switched on, map questions on a blank map, a 30-point practice test', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // off by default: no entry, and links into it do nothing
  await openApp(page, '/?lowfx=1&notut#lesson/ssbs-exam');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('lesson')).toHaveCount(0);
  await page.getByTestId('btn-hub').click();
  await page.getByTestId('hub-tab-learn').click();
  await expect(page.getByTestId('menu-astro')).toBeVisible();
  await expect(page.getByTestId('menu-ssbs')).toHaveCount(0);

  // ?ssbs=1 switches it on (and remembers it)
  await openApp(page, '/?lowfx=1&notut&ssbs=1');
  await fromHub(page, 'learn', 'menu-ssbs');
  await expect(page.getByTestId('lesson-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.lesson-grade')).toHaveCount(3);
  await page.getByTestId('lesson-ssbs-west').click();
  const card = page.getByTestId('lesson');
  await expect(card).toBeVisible();
  await expect.poll(async () => (await lesson(page))?.painted, { timeout: 30_000 }).toBe(true);
  // a "find the country" question: a tap anywhere inside it is right, not just near its middle
  for (let i = 0; i < 6 && !(await question(page)); i++) await card.getByTestId('lesson-next').click();
  expect((await question(page))?.kind).toBe('at');
  await expect.poll(async () => (await globe(page)).capture).toBe(true);
  await tapGlobe(page, [12.5, 4.5]); // north-west Nigeria, ~600 km from the middle
  await expect(card.getByTestId('lesson-why')).toHaveClass(/ok/);
  await card.getByTestId('lesson-next').click();
  // a wrong tap names the country tapped
  await expect.poll(async () => (await globe(page)).capture).toBe(true);
  await tapGlobe(page, [13.5, 2.1]); // Niger, asked for Mali
  await expect(card.getByTestId('lesson-why')).toHaveClass(/no/);
  await expect(card.getByTestId('lesson-why')).toContainText('Niger');
  await card.getByTestId('lesson-exit').click();

  // the practice test: 30 points in three parts; a missed country is listed to review
  await page.evaluate(() => { location.hash = 'lesson/ssbs-exam'; });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId('lesson-next').click();
  let missed = false, n = 0;
  while (await question(page)) {
    const q = (await question(page))!;
    if (q.kind === 'at' && !missed) {
      await expect.poll(async () => (await globe(page)).capture).toBe(true);
      await tapGlobe(page, [-20, -10]);
      await expect(card.getByTestId('lesson-why')).toHaveClass(/no/);
      missed = true;
    } else await answer(page);
    await card.getByTestId('lesson-next').click();
    n++;
  }
  expect(n).toBe(22);
  await expect(card.getByTestId('lesson-score')).toContainText('29 / 30 points');
  await expect(card.getByTestId('exam-secs').locator('li')).toHaveText([/Matching 10 \/ 10/, /Multiple choice 10 \/ 10/, /Map 9 \/ 10/]);
  await expect(card.getByTestId('exam-review')).not.toBeEmpty();
  // "again" draws a fresh test
  const first = await page.evaluate(() => document.querySelector('[data-testid="exam-review"]')?.textContent);
  await card.getByTestId('lesson-again').click();
  await expect(card.getByTestId('lesson-step')).toContainText('1 / 1');
  expect(first).toBeTruthy();
  await card.getByTestId('lesson-exit').click();

  // ?ssbs=0 switches it off again
  await openApp(page, '/?lowfx=1&notut&ssbs=0');
  await page.getByTestId('btn-hub').click();
  await page.getByTestId('hub-tab-learn').click();
  await expect(page.getByTestId('menu-ssbs')).toHaveCount(0);
  expect(errors).toEqual([]);
});
