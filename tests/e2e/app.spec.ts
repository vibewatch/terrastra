import { test, expect, type Page } from '@playwright/test';
import { fromHub, pickOption, openApp, flyTo, clickItem, shot } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

test('home: globe, top bar, zoom readout, hints @mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  await expect(page.locator('h1')).toHaveText('Terrastra');
  await expect(page.getByTestId('zoom')).toHaveText('×4.0');
  for (const id of ['btn-search', 'btn-photo', 'btn-map', 'btn-hub', 'btn-menu', 'level-switch']) await expect(page.getByTestId(id)).toBeVisible();
  // one Explore hub holds every activity, on four shelves; the top bar keeps only search, photo, flat map, hub and settings
  await expect(page.locator('.topbar .tool:visible')).toHaveCount(5);
  await page.getByTestId('btn-hub').click();
  for (const [tab, ids] of [['learn', ['menu-lessons', 'menu-tours']], ['look', ['menu-sky', 'menu-tonight', 'menu-time', 'menu-compare', 'menu-bookmarks']], ['play', ['menu-daily', 'menu-placeit', 'menu-quiz']], ['me', ['menu-passport', 'menu-collection', 'menu-album']]] as const) {
    await page.getByTestId('hub-tab-' + tab).click();
    await expect(page.getByTestId('hub-tab-' + tab)).toHaveAttribute('aria-selected', 'true');
    for (const id of ids) await expect(page.getByTestId(id)).toBeVisible();
  }
  await shot(page, `${info.project.name}_03b_hub`);
  // opening settings closes the hub; the hub remembers its shelf
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('hub')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-hub').click();
  await expect(page.getByTestId('menu-passport')).toBeVisible();
  await page.getByTestId('hub-tab-learn').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hub')).toBeHidden();
  await expect(page.locator('canvas.globe-canvas')).toBeVisible();
  // terrain: the elevation maps load after the globe and the relief shading fades in
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.earthUniforms.uReliefMix.value), { timeout: 20_000 }).toBeGreaterThan(0.5);
  // stars draw before the globe, so they can never show through it
  expect(await page.evaluate(() => { const g = (window as any).__pp.globe; return g.stars.renderOrder < g.earth.renderOrder; })).toBe(true);
  await page.locator('#btn-help').click();
  await expect(page.locator('#hints')).toBeVisible();
  await shot(page, `${info.project.name}_01_home`);
  await page.locator('#btn-zoom-in').click();
  await expect.poll(async () => parseFloat((await page.getByTestId('zoom').textContent())!.slice(1))).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('tutorial shows on first visit and can be completed', async ({ page }) => {
  await openApp(page, '/?lowfx=1');
  const tut = page.getByTestId('tutorial');
  await expect(tut).toBeVisible();
  await shot(page, 'desktop_02_tutorial');
  for (let i = 0; i < 7; i++) await page.getByTestId('tut-next').click();
  await expect(tut).toHaveCount(0);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!(window as any).__pp?.ready), { timeout: 90_000 }).toBe(true);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
});

test('hovering or tapping a country outlines it and names it', async ({ page }) => {
  await openApp(page);
  await flyTo(page, 46.6, 2.4, 1.2);
  const box = (await page.locator('canvas.globe-canvas').boundingBox())!;
  const tag = page.locator('.country-tag');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(tag).toContainText('France');
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.hiShown?.a2)).toBe('FR');
  await page.mouse.down();
  await page.mouse.up();
  // the tapped country stays outlined after the pointer leaves
  await page.locator('canvas.globe-canvas').dispatchEvent('pointerleave');
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.hoverCountry)).toBeNull();
  await expect(tag).toContainText('France');
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.hiShown?.a2)).toBe('FR');
  // the finer 1:50m shapes (small states included) arrive once the globe is idle
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.borderShapes?.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(200);
});

test('flat world map: projections, zoom, countries, pins, back to the globe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  await flyTo(page, 46.6, 2.4, 2);
  await page.getByTestId('btn-map').click();
  const map = page.getByTestId('flatmap');
  await expect(map).toBeVisible();
  // the map opens on the meridian the globe was looking at (the whole world fits, so it stays vertically centred)
  const [, lon] = await page.evaluate(() => (window as any).__pp.map().center());
  expect(Math.abs(lon - 2.4)).toBeLessThan(3);
  await page.getByTestId('proj-mercator').click();
  await expect(page.getByTestId('proj-mercator')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('proj-equalearth')).toHaveAttribute('aria-checked', 'false');
  const z0 = await page.evaluate(() => (window as any).__pp.map().zoom);
  const france = () => page.evaluate(() => (window as any).__pp.map().toScreen(46.6, 2.4) as [number, number]);
  // the wheel zooms about the cursor, so France stays under it; hovering names the country
  let [fx, fy] = await france();
  await page.mouse.move(fx, fy);
  await page.mouse.wheel(0, -600);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.map().zoom)).toBeGreaterThan(z0 * 1.2);
  [fx, fy] = await france();
  await page.mouse.move(fx + 1, fy);
  await expect(page.getByTestId('map-country-tag')).toContainText('France');
  await shot(page, 'desktop_05b_flatmap');
  // "hide names": hovering only outlines a country, a tap reveals its name until "hide again"
  const tag = page.getByTestId('map-country-tag');
  await page.getByTestId('map-quiz').click();
  await expect(page.getByTestId('map-quiz')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.fm-labels .lb-country:visible')).toHaveCount(0);
  await expect(tag).toBeHidden();
  [fx, fy] = await france();
  await page.mouse.click(fx, fy);
  await expect(tag).toContainText('France');
  await expect(page.locator('.lb-revealed')).toHaveText('FRANCE');
  // tapping a revealed country hides it again (re-read France: a quick second tap may also zoom)
  [fx, fy] = await france();
  await page.mouse.click(fx, fy);
  await expect(page.locator('.lb-revealed')).toHaveCount(0);
  await expect(tag).toBeHidden();
  [fx, fy] = await france();
  await page.mouse.click(fx, fy);
  await expect(page.locator('.lb-revealed')).toHaveText('FRANCE');
  await page.getByTestId('map-quiz-reset').click();
  await expect(page.locator('.lb-revealed')).toHaveCount(0);
  await page.getByTestId('map-quiz').click();
  await expect(page.locator('.fm-labels .lb-country:visible').first()).toBeVisible();
  // a pin opens the same info card as on the globe
  const pin = page.getByTestId('map-pin').first();
  await expect(pin).toBeVisible();
  await pin.click();
  await expect(page.getByTestId('info')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('info')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();
  await expect(page.locator('canvas.globe-canvas')).toBeVisible();
  // deep link straight into the map (the hash is consumed, as for lessons and tours)
  await openApp(page, '/?lowfx=1&notut#map');
  await expect(page.getByTestId('flatmap')).toBeVisible();
  expect(errors).toEqual([]);
});

test('menu: toggles layers & names, language persists', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('btn-menu').click();
  await expect(page.locator('#menu')).toBeVisible();
  await shot(page, 'desktop_03_menu');
  await page.locator('label.switch-card', { has: page.getByTestId('set-names') }).click();
  await expect(page.locator('.labels')).toBeHidden();
  await page.locator('label.switch-card', { has: page.getByTestId('set-names') }).click();
  await expect(page.locator('.labels')).toBeVisible();
  const landmarkVisible = () => page.evaluate(() => [...(window as any).__pp.globe.placed.entries()].some(([, p]: any) => p.item.type === 'landmark' && p.obj.visible));
  await expect.poll(landmarkVisible).toBe(true);
  await page.locator('label.switch-card', { has: page.getByTestId('set-landmarks') }).click();
  await expect.poll(landmarkVisible).toBe(false);
  await page.locator('label.switch-card', { has: page.getByTestId('set-landmarks') }).click();
  await expect.poll(landmarkVisible).toBe(true);
  await page.getByTestId('aura-aurora').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.settings.auraPreset)).toBe('aurora');
  await page.getByTestId('mode-minimal').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.settings.surfaceMode)).toBe('minimal');
  await page.getByTestId('mode-realistic').click();
  // the language dropdown works from the keyboard: open, move, pick; Esc only closes the list
  const langSel = page.getByTestId('lang-select');
  await langSel.focus();
  await page.keyboard.press('ArrowDown');
  await expect(langSel).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(langSel).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#menu')).toBeVisible();
  await pickOption(page, 'lang-select', 'zh');
  await expect(page.locator('h1')).toHaveText('寰星');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('寰星', { timeout: 90_000 });
  await page.getByTestId('btn-menu').click();
  await pickOption(page, 'lang-select', 'en');
  await expect(page.locator('h1')).toHaveText('Terrastra');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
});

test('tap a landmark opens info card; deep link; Esc closes', async ({ page }) => {
  await openApp(page);
  await flyTo(page, 48.858, 2.294, 1.6);
  await clickItem(page, 'eiffel');
  await expect(page.getByTestId('info-name')).toHaveText('Eiffel Tower');
  await expect(page.locator('#info-preview')).toBeVisible();
  await expect(page).toHaveURL(/#eiffel$/);
  await shot(page, 'desktop_04_info_landmark');
  await page.getByTestId('react-like').click();
  await expect(page.getByTestId('react-like')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('info')).toBeHidden();
  await expect(page).not.toHaveURL(/#eiffel/);
  await openApp(page, '/?lowfx=1&notut#an_lion');
  await expect(page.getByTestId('info-name')).toHaveText('Lion');
});

test('collect an animal into the dex and earn a sticker', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#an_lion');
  await expect(page.getByTestId('info-name')).toHaveText('Lion');
  await expect(page.getByTestId('add-dex')).toHaveCount(0);
  await page.getByTestId('zoom-close').click();
  await page.getByTestId('add-dex').click();
  await expect(page.locator('#toast')).toContainText('Sticker unlocked: 🐾 First find');
  await expect(page.locator('#toast')).toContainText('Lion');
  await shot(page, 'desktop_05_dex_added');
  await page.keyboard.press('Escape');
  await fromHub(page, 'me', 'menu-collection');
  await expect(page.getByTestId('hub-animals')).toContainText('1 / ');
  await shot(page, 'desktop_06_collection');
  await page.getByTestId('hub-animals').click();
  await expect(page.getByTestId('dex-an_lion')).toHaveClass(/have/);
  await page.keyboard.press('Escape');
  await page.getByTestId('hub-stickers').click();
  await expect(page.locator('.sticker.have').first()).toBeVisible();
});

test('passport stamps, time machine and sounds', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#eiffel');
  await expect(page.getByTestId('info-name')).toHaveText('Eiffel Tower');
  await page.getByTestId('say-hello').click();
  await expect(page.locator('#toast')).toContainText('Hello in French');
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-hub').click();
  await page.getByTestId('hub-tab-me').click();
  await expect(page.getByTestId('menu-passport')).toContainText('1 / ');
  await page.getByTestId('menu-passport').click();
  await page.getByTestId('book-europe').click();
  await expect(page.getByTestId('stamp-eiffel')).toHaveClass(/have/);
  await shot(page, 'desktop_06b_passport');
  await page.getByTestId('next-stop').click();
  await expect(page.getByTestId('info-name')).not.toHaveText('Eiffel Tower');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = 'an_lion'; });
  await expect(page.getByTestId('hear-it')).toBeVisible();
  await page.getByTestId('hear-it').click();
  await page.keyboard.press('Escape');

  await fromHub(page, 'look', 'menu-time');
  await expect(page.getByTestId('time-bar')).toBeVisible();
  await expect(page.getByTestId('time-year')).toHaveText('Today');
  await page.getByTestId('time-range').fill('0');
  await expect(page.getByTestId('time-year')).toHaveText('Age of dinosaurs');
  expect(await page.evaluate(() => (window as any).__pp.globe.itemFilter !== null)).toBe(true);
  await shot(page, 'desktop_06c_time_machine');
  await page.getByTestId('time-close').click();
  await expect(page.getByTestId('time-bar')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__pp.globe.itemFilter)).toBeNull();

  // live radio: the dock opens with the station count (no stream is played in CI)
  await fromHub(page, 'look', 'menu-radio');
  await expect(page.getByTestId('radio-bar')).toBeVisible();
  await expect(page.getByTestId('radio-bar')).toContainText(/[\d,]+ stations · \d+ countries/);
  await fromHub(page, 'look', 'menu-radio');
  await expect(page.getByTestId('radio-bar')).toBeHidden();
});

test('vehicle ride mode', async ({ page }) => {
  await openApp(page);
  const key = await page.evaluate(() => { const g = (window as any).__pp.globe; return [...g.placed.keys(), ...g.pending.keys()].find((k: string) => k.startsWith('vh_')); });
  expect(key).toBeTruthy();
  await page.evaluate(k => { location.hash = k; }, key);
  await expect(page.getByTestId('ride')).toBeVisible();
  await page.getByTestId('ride').click();
  await expect(page.getByTestId('ride-bar')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'desktop_07_ride');
  await page.getByTestId('ride-exit').click();
  await expect(page.getByTestId('ride-bar')).toBeHidden();
});

test('photo mode saves to album', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('btn-photo').click();
  await page.getByTestId('shutter').click();
  await expect(page.locator('#toast')).toContainText(/album/i);
  await page.getByTestId('photo-album').click();
  await expect(page.getByTestId('album-grid').locator('img')).toHaveCount(1);
  await shot(page, 'desktop_08_album');
});

test('Place it! full game (practice)', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('btn-hub').click();
  await page.getByTestId('hub-tab-play').click();
  await shot(page, 'desktop_09_games');
  await page.getByTestId('menu-placeit').click();
  await page.getByTestId('diff-practice').click();
  for (let r = 0; r < 10; r++) {
    await expect(page.getByTestId('placeit-target')).toBeVisible();
    if (r === 0) await page.getByTestId('placeit-hint').click();
    await page.mouse.click(640 + (r % 3) * 20, 430);
    await expect(page.getByTestId('placeit-confirm')).toBeEnabled();
    if (r === 0) await shot(page, 'desktop_10_placeit_guess');
    await page.getByTestId('placeit-confirm').click();
    await expect(page.getByTestId('placeit-result')).toBeVisible();
    if (r === 0) await shot(page, 'desktop_11_placeit_reveal');
    await page.getByTestId('placeit-next').click();
  }
  await expect(page.getByTestId('placeit-results')).toBeVisible();
  await shot(page, 'desktop_12_placeit_results');
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('pp.progress')!).placeit.practice.plays);
  expect(best).toBe(1);
});

test('Quiz: 2 players pass-and-play to podium', async ({ page }) => {
  await openApp(page);
  await fromHub(page, 'play', 'menu-quiz');
  await page.getByTestId('players-2').click();
  await page.getByTestId('level-hard').click();
  await shot(page, 'desktop_13_quiz_setup');
  await page.getByTestId('quiz-start').click();
  for (let q = 0; q < 10; q++) {
    await expect(page.getByTestId('quiz-prompt')).toBeVisible();
    await expect(page.getByTestId('quiz-opt')).toHaveCount(5);
    const sel = q % 2 === 0 ? '[data-correct="true"]' : '[data-correct="false"]';
    await page.locator(`[data-testid="quiz-opt"]${sel}`).first().click();
    if (q === 0) await shot(page, 'desktop_14_quiz_answer');
    await page.getByTestId('quiz-next').click();
  }
  await expect(page.getByTestId('quiz-results')).toBeVisible();
  await expect(page.locator('.podium .s1')).toContainText('Player 1');
  await shot(page, 'desktop_15_quiz_results');
});

test('Daily Planet: guesses, hints, share, persisted state', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut');
  await fromHub(page, 'play', 'menu-daily');
  await expect(page.getByTestId('daily-input')).toBeVisible();
  await page.getByTestId('daily-pick').click();
  await expect(page.getByTestId('daily-pick-hud')).toBeVisible();
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height / 2 + 40);
  await expect(page.getByTestId('daily-rows').locator('li:not(.empty)')).toHaveCount(1);
  await expect(page.getByTestId('daily-rows')).toContainText('⌖');
  const guesses = ['Tokyo', 'Lima', 'Nairobi', 'Reykjavik', 'Sydney', 'Anchorage'];
  for (const g of guesses) {
    if (await page.getByTestId('daily-result').isVisible()) break;
    await page.getByTestId('daily-input').fill(g);
    await page.getByTestId('daily-submit').click();
  }
  await expect(page.getByTestId('daily-result')).toBeVisible();
  await expect(page.locator('.share-text')).toContainText('Terrastra Daily');
  await shot(page, 'desktop_16_daily_done');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!(window as any).__pp?.ready), { timeout: 90_000 }).toBe(true);
  await fromHub(page, 'play', 'menu-daily');
  await expect(page.getByTestId('daily-result')).toBeVisible();
});

test('account: magic link sign-in, nickname, sync, guestbook', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#an_lion');
  await page.getByTestId('zoom-close').click();
  await page.getByTestId('add-dex').click();
  await page.keyboard.press('Escape');
  await fromHub(page, 'me', 'menu-account');
  await page.getByTestId('email').fill('kid.explorer@example.com');
  await page.getByTestId('send-link').click();
  const link = await page.getByTestId('dev-link').getAttribute('href');
  expect(link).toContain('/api/auth/verify?token=');
  await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''));
  // the redirect lands on #signed-in, which the app handles once and clears
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await expect.poll(() => page.evaluate(() => fetch('/api/me').then(r => r.json()).then(j => j.user?.email))).toBe('kid.explorer@example.com');
  await expect(page.getByTestId('handle')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('handle').fill('Explorer_01');
  await page.getByTestId('handle').press('Enter');
  await page.getByTestId('sync-now').click();
  await expect(page.locator('#toast')).toContainText(/synced/i);
  const server = await page.evaluate(() => fetch('/api/progress').then(r => r.json()));
  expect(Object.keys(server.progress.dex)).toContain('an_lion');
  await shot(page, 'desktop_17_account');
  await page.keyboard.press('Escape');
  await fromHub(page, 'me', 'menu-guestbook');
  await page.getByTestId('gb-text').fill('Hello from the e2e test! https://spam.example');
  await page.getByTestId('gb-post').click();
  await expect(page.getByTestId('gb-list')).toContainText('Hello from the e2e test! 🔗');
  await expect(page.getByTestId('gb-list')).toContainText('Explorer_01');
  await shot(page, 'desktop_18_guestbook');
});

test('encyclopedia static pages link back to the globe', async ({ page }) => {
  await page.goto('/landmarks/');
  await expect(page.locator('h1 .en')).toHaveText('Landmarks');
  await page.locator('#q').fill('eiffel');
  await page.getByRole('link', { name: /Eiffel Tower/ }).first().click();
  await expect(page.locator('h1 .en')).toHaveText('Eiffel Tower');
  await page.locator('[data-set=zh]').click();
  await expect(page.locator('h1 .zh')).toBeVisible();
  await expect(page.locator('h1 .en')).toBeHidden();
  await page.locator('[data-set=en]').click();
  await shot(page, 'desktop_19_encyclopedia');
  await page.getByRole('link', { name: /See it on the 3D globe/ }).click();
  await expect(page).toHaveURL(/\/#eiffel$/);
  const res = await page.request.get('/does-not-exist');
  expect(res.status()).toBe(404);
});

test('read more expands a Wikipedia reader in the chosen language', async ({ page }) => {
  const seen: string[] = [];
  await page.route('**/*.wikipedia.org/**', async route => {
    const u = new URL(route.request().url());
    seen.push(u.hostname);
    const zh = u.hostname.startsWith('zh');
    const extract = zh
      ? '埃菲尔铁塔是一座铁塔。\n== 历史 ==\n它建于1889年。\n== 设计 ==\n高330米。\n== 参考文献 ==\n略'
      : 'The Eiffel Tower is a wrought-iron tower.\n== History ==\nBuilt for the 1889 fair.\n== Design ==\nIt is 330 m tall.\n== Tourism ==\nMillions visit.\n== Height ==\nTall.\n== Lighting ==\nSparkles.\n== References ==\nx';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: [{ title: zh ? '艾菲爾鐵塔' : 'Eiffel Tower', varianttitles: { 'zh-cn': '埃菲尔铁塔' }, extract, description: zh ? '巴黎的铁塔' : 'Tower in Paris' }] } }) });
  });
  await openApp(page, '/?lowfx=1&notut#eiffel');
  await expect(page.getByTestId('info-name')).toHaveText('Eiffel Tower');
  const before = (await page.getByTestId('info').boundingBox())!.width;
  await page.getByTestId('read-more').click();
  await expect(page.getByTestId('reader-title')).toHaveText('Eiffel Tower');
  await expect.poll(async () => (await page.getByTestId('info').boundingBox())!.width).toBeGreaterThan(before * 1.8);
  await expect(page.getByTestId('info-name')).toBeVisible();
  await expect(page.getByTestId('reader-article')).toContainText('Built for the 1889 fair.');
  await expect(page.getByTestId('reader-article')).not.toContainText('References');
  await page.getByTestId('reader-continue').click();
  await expect(page.getByTestId('reader-article')).toContainText('Sparkles.');
  await expect(page.getByTestId('reader-near').first()).toBeVisible();
  await shot(page, 'desktop_20_reader');
  await page.getByTestId('reader-lang-zh').click();
  await expect(page.getByTestId('reader-title')).toHaveText('埃菲尔铁塔');
  await expect(page.getByTestId('reader-article')).toContainText('它建于1889年。');
  expect(seen).toContain('zh.wikipedia.org');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader')).toBeHidden();
  await expect(page.getByTestId('info-name')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('info')).toBeHidden();
});

test('graticule toggles from the layers menu', async ({ page }) => {
  await openApp(page);
  const on = () => page.evaluate(() => (window as any).__pp.globe.settings.graticule);
  expect(await on()).toBe(true);
  await expect(page.locator('.lb-grid').first()).toBeVisible();
  await page.getByTestId('btn-menu').click();
  await page.locator('label.switch-card', { has: page.getByTestId('set-graticule') }).click();
  await expect.poll(on).toBe(false);
  await expect(page.locator('.lb-grid:visible')).toHaveCount(0);
});

test('mobile layout: info card as bottom sheet @mobile', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await openApp(page, '/?lowfx=1&notut#pyramids');
  await expect(page.getByTestId('info-name')).toBeVisible();
  const box = await page.getByTestId('info').boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.y + box!.height).toBeGreaterThan(vp.height - 20);
  await shot(page, 'mobile_02_info');
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-menu').click();
  await shot(page, 'mobile_03_menu');
  await page.getByTestId('btn-hub').click();
  await expect(page.getByTestId('menu-lessons')).toBeVisible();
  await shot(page, 'mobile_03b_hub');
});

test('solar system: zoom out from Earth, visit Mars and a feature, land back on Earth @mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*.wikipedia.org/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ query: { pages: [{ title: 'Mars', extract: 'Mars is the fourth planet.\n== Geography ==\nRed dust.', description: 'Planet' }] } }) }));
  await openApp(page);
  const mobile = info.project.name === 'mobile';
  // Wheeling on past the widest globe view opens the Solar System.
  await page.mouse.move(400, 400);
  if (mobile) await level(page, 'solar');
  else for (let i = 0; i < 60 && !(await page.evaluate(() => document.body.classList.contains('solar'))); i++) {
    await page.mouse.wheel(0, 120); await page.waitForTimeout(80);
  }
  await expect(page.getByTestId('sp-earth')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).toHaveClass(/solar/);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.paused)).toBe(true);
  await page.waitForTimeout(2500);
  await shot(page, `${info.project.name}_30_solar_earth`);
  // Constellation overlay toggles on and off and remembers the choice.
  const cst = page.getByTestId('solar-cst');
  const on = await cst.getAttribute('aria-pressed');
  await cst.click();
  await expect(cst).toHaveAttribute('aria-pressed', on === 'true' ? 'false' : 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pp.cst'))).not.toBeNull();
  await cst.click();
  await expect(cst).toHaveAttribute('aria-pressed', String(on));
  // Display options: orbit lines and names switch off, are remembered, and switch back on.
  const orbits = page.getByTestId('solar-orbits'), names = page.getByTestId('solar-names');
  const orbitShown = () => page.evaluate(() => [...(window as any).__pp.solar().view.rts.values()].some((r: any) => r.orbit?.visible));
  await expect(orbits).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(orbitShown).toBe(true);
  await orbits.click();
  await expect(orbits).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(orbitShown).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pp.solarOrbits'))).toBe('false');
  await orbits.click();
  await expect.poll(orbitShown).toBe(true);
  await expect.poll(() => page.locator('.sb-label:not(.on):visible').count()).toBeGreaterThan(0);
  await names.click();
  await expect(names).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.sb-label:not(.on):visible')).toHaveCount(0);
  await names.click();
  await expect(names).toHaveAttribute('aria-pressed', 'true');
  if (!mobile) {
    // Icon-only dock: names come from the HUD tooltip, which stands in for the native title one.
    expect(await page.locator('[title]').count()).toBe(0);
    await expect(page.getByTestId('sp-mars')).toHaveAttribute('aria-label', 'Mars');
    await page.getByTestId('sp-mars').hover();
    await expect(page.locator('.pp-tip')).toHaveText('Mars');
    await page.mouse.down();
    await expect(page.locator('.pp-tip')).toBeHidden();
    await page.mouse.up();
  }

  await page.getByTestId('sp-mars').click();
  await expect(page.getByTestId('solar-name')).toHaveText('Mars');
  await expect(page).toHaveURL(/#solar\/mars$/);
  await page.waitForTimeout(2500);
  await shot(page, `${info.project.name}_31_solar_mars`);
  const feat = page.locator('[data-testid^="feat-sf_mars_"]').first();
  const featName = (await feat.textContent())!.replace(/^\S+\s*/u, '').trim();
  await feat.click();
  await expect(page.getByTestId('solar-name')).toContainText(featName.slice(0, 4));
  await expect(page.getByTestId('solar-back-body')).toContainText('Mars');
  await page.waitForTimeout(2200);
  await shot(page, `${info.project.name}_32_solar_feature`);
  await page.getByTestId('solar-read-more').click();
  await expect(page.getByTestId('reader')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('solar-info')).toBeHidden();

  // picking the current level again returns to its overview
  await level(page, 'solar');
  await page.waitForTimeout(2200);
  await shot(page, `${info.project.name}_33_solar_overview`);
  await page.getByTestId('sp-earth').click();
  await page.getByTestId('solar-enter-earth').click();
  await expect(page.getByTestId('sp-earth')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/solar/);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.paused)).toBe(false);
  await expect(page.locator('canvas.globe-canvas')).toBeVisible();

  // Deep link straight to a body.
  await page.goto('/?lowfx=1&notut#solar/saturn');
  await expect(page.getByTestId('solar-name')).toHaveText('Saturn', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('solar: distance meter @mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const mobile = info.project.name === 'mobile';
  await openApp(page, '/?lowfx=1&notut#solar/jupiter');
  await expect(page.getByTestId('solar-name')).toHaveText('Jupiter', { timeout: 30_000 });

  // The meter (the toolbar's ruler) measures from Earth to the picked body, live with the clock.
  // (phones: its sheet takes the card's place)
  await page.getByTestId('btn-measure').click();
  await expect(page.getByTestId('btn-measure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('meter-b')).toHaveAttribute('data-value', 'jupiter');
  if (mobile) await expect(page.getByTestId('solar-info')).toBeHidden();
  await expect(page.getByTestId('meter-out')).toContainText('km');
  await expect(page.getByTestId('meter-label')).toBeVisible();
  await pickOption(page, 'meter-b', 'moon');
  await expect(page.getByTestId('meter-out')).toContainText(/(3[5-9]\d|40\d),\d{3} km/);
  await pickOption(page, 'meter-b', 'mars');
  await page.getByTestId('meter-swap').click();
  await expect(page.getByTestId('meter-a')).toHaveAttribute('data-value', 'mars');
  await page.waitForTimeout(1500);
  await shot(page, `${info.project.name}_37_solar_meter`);
  await page.getByTestId('meter-close').click();
  await expect(page.getByTestId('meter-label')).toBeHidden();
  await expect(page.getByTestId('btn-measure')).toHaveAttribute('aria-pressed', 'false');

  expect(errors).toEqual([]);
});

const level = async (page: Page, l: string) => { await page.getByTestId('level-switch').click(); await page.getByTestId('rail-' + l).click(); };

test('scale ladder: rail climbs from Earth to the universe and back @mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  await expect(page.getByTestId('rail-earth')).toHaveClass(/on/);

  // the switcher shows only the current level; the others sit in its popup list
  await expect(page.getByTestId('level-switch')).toContainText('Earth');
  await expect(page.getByTestId('level-list')).toBeHidden();
  await level(page, 'galaxy');
  await expect(page.getByTestId('level-list')).toBeHidden();
  await expect(page).toHaveURL(/#milkyway$/, { timeout: 30_000 });
  await expect(page.getByTestId('level-switch')).toContainText('Milky Way');
  if (info.project.name === 'mobile') await level(page, 'galaxy');
  await expect(page.getByTestId('solar-name')).toHaveText('Milky Way');
  await expect(page.getByTestId('rail-galaxy')).toHaveClass(/on/);
  await page.waitForTimeout(2000);
  await shot(page, `${info.project.name}_34_milkyway`);
  await page.getByTestId('solar-info-close').click();
  await page.getByTestId('dc-dp_orion_nebula').click();
  await expect(page.getByTestId('solar-name')).toHaveText('Orion Nebula');
  await expect(page).toHaveURL(/#milkyway\/dp_orion_nebula$/);

  await level(page, 'universe');
  await expect(page).toHaveURL(/#universe$/);
  await page.waitForTimeout(2000);
  await shot(page, `${info.project.name}_35_universe`);
  await page.goto('/?lowfx=1&notut#localgroup/dp_m31');
  await expect(page.getByTestId('solar-name')).toHaveText('Andromeda Galaxy', { timeout: 30_000 });

  await level(page, 'solar');
  await expect(page).toHaveURL(/#solar/);
  await expect(page.getByTestId('sp-sun')).toBeVisible();
  await level(page, 'earth');
  await expect(page.locator('body')).not.toHaveClass(/solar/, { timeout: 20_000 });
  await expect(page.getByTestId('rail-earth')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('deep space: nearby stars, Messier list and light-year meter @mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const mobile = info.project.name === 'mobile';
  await openApp(page, '/?lowfx=1&notut#nearbystars/dp_sirius');
  await expect(page.getByTestId('solar-name')).toHaveText('Sirius', { timeout: 30_000 });
  await expect(page.getByTestId('solar-info')).toContainText('White star');
  await expect(page.getByTestId('rail-stars')).toHaveClass(/on/);

  // light-year meter: from us to the picked star; out here the clock bar is gone (no extra row)
  await expect(page.locator('.solar-time')).toBeHidden();
  await page.getByTestId('btn-measure').click();
  await expect(page.getByTestId('meter-a')).toHaveAttribute('data-value', 'home');
  await expect(page.getByTestId('meter-b')).toHaveAttribute('data-value', 'dp_sirius');
  await expect(page.getByTestId('meter-out')).toContainText('8.6 light-years');
  await expect(page.getByTestId('deep-meter-label')).toBeVisible();
  await pickOption(page, 'meter-a', 'dp_alpha_centauri');
  await expect(page.getByTestId('meter-out')).toContainText(/9\.\d light-years/);
  await page.waitForTimeout(1200);
  await shot(page, `${info.project.name}_38_ly_meter`);

  // the Messier list (at the end of the dock) replaces the meter, filters by type and flies to the pick on its own scale
  await page.getByTestId('solar-messier').click();
  await expect(page.getByTestId('btn-measure')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('solar-meter')).toBeHidden();
  await expect(page.getByTestId('messier-count')).toHaveText('110');
  await page.getByTestId('mf-globular').click();
  await expect(page.getByTestId('messier-count')).toHaveText('29');
  await page.getByTestId('mf-all').click();
  await page.getByTestId('mx-27').click();
  await expect(page.getByTestId('solar-name')).toHaveText('Dumbbell Nebula (M27)', { timeout: 30_000 });
  await expect(page).toHaveURL(/#milkyway\/dp_m27$/);
  await expect(page.getByTestId('solar-info')).toContainText('M27');
  if (mobile) await page.getByTestId('solar-info-close').click();
  await page.getByTestId('mx-81').click();
  await expect(page).toHaveURL(/#laniakea\/dp_m81$/, { timeout: 30_000 });
  await expect(page.getByTestId('solar-name')).toHaveText("Bode's Galaxy (M81)");
  if (mobile) await page.getByTestId('solar-info-close').click();
  await expect(page.getByTestId('mx-81')).toHaveClass(mobile ? /messier-item/ : /on/);
  await page.waitForTimeout(1500);
  await shot(page, `${info.project.name}_39_messier`);
  await page.getByTestId('messier-close').click();
  await expect(page.getByTestId('messier-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('sky theatre: eclipse deep link, space view, calendar pick, close', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page, '/?lowfx=1&notut#sky/solar-eclipse-2026-08-12');
  const sky = page.getByTestId('sky');
  await expect(sky).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#sky-title')).toContainText(/eclipse/i);
  // opens on the "how it works" model, labelled and on a clock of days
  await expect(page.getByTestId('sky-view-model')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sky-mlabels .m-earth')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'desktop_39_sky_eclipse_model');
  await page.getByTestId('sky-view-space').click();
  await expect(page.getByTestId('sky-view-space')).toHaveAttribute('aria-selected', 'true');
  await page.waitForTimeout(1500);
  await shot(page, 'desktop_40_sky_eclipse_space');
  await page.getByTestId('sky-cal').click();
  await expect(sky).toHaveClass(/cal-open/);
  await page.locator('.skycal-list button[data-kind="lunar-eclipse"]').first().click();
  await expect(page.locator('#sky-title')).toContainText(/lunar/i);
  await page.getByTestId('sky-close').click();
  await expect(sky).toHaveCount(0);
  await fromHub(page, 'look', 'menu-sky');
  await expect(page.getByTestId('sky')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
