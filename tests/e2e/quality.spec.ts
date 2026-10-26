import { test, expect, type Page } from '@playwright/test';
import { fromHub, pickOption, openApp } from './helpers.ts';

/** Buttons and links a screen reader would announce without a name (decorative `aria-hidden` content does not count). */
async function nameless(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const spoken = (el: Element): string => {
      let out = '';
      for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? '';
        else if (n instanceof Element && n.getAttribute('aria-hidden') !== 'true' && !(n instanceof SVGElement)) out += n.getAttribute('aria-label') ?? n.getAttribute('alt') ?? spoken(n);
      }
      return out.trim();
    };
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed';
    return [...document.querySelectorAll('button, a[href], [role="button"]')]
      .filter(el => visible(el) && !el.closest('[aria-hidden="true"], [hidden], .hidden'))
      .filter(el => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || spoken(el)))
      .map(el => el.outerHTML.slice(0, 120));
  });
}

test('every visible control has an accessible name (Earth, Solar System, Milky Way, sky)', async ({ page }) => {
  await openApp(page);
  expect(await nameless(page)).toEqual([]);
  await page.goto('/?lowfx=1&notut#solar');
  await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 90_000 });
  expect(await nameless(page)).toEqual([]);
  await page.evaluate(() => { location.hash = '#milkyway'; });
  await expect(page.locator('[data-testid^="dc-"]').first()).toBeVisible({ timeout: 30_000 });
  expect(await nameless(page)).toEqual([]);
  const chip = page.locator('[data-testid^="dc-"]').first();
  await expect(chip).toHaveAttribute('aria-label', /.+/);
  await expect(chip).toHaveAttribute('aria-pressed', /true|false/);
  await page.goto('/?lowfx=1&notut#sky');
  await expect(page.getByTestId('sky')).toBeVisible({ timeout: 60_000 });
  expect(await nameless(page)).toEqual([]);
});

test('keyboard: Tab stays inside a dialog and focus shows the tooltip', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  const dlg = page.locator('.modal-panel[role="dialog"]');
  await expect(dlg).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.modal-panel'))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.modal-panel'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // tab onto a titled toolbar button: the HUD tooltip appears for keyboard users too
  await page.locator('#btn-hub').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.pp-tip')).toBeVisible({ timeout: 10_000 });
});

test('a failed Solar System load can be retried', async ({ page }) => {
  let blocked = 0;
  await page.route(/\/assets\/ui-[^/]+\.js$/, route => { if (blocked++ === 0) return route.abort(); return route.continue(); });
  await openApp(page);
  await page.getByTestId('level-switch').click();
  await page.getByTestId('rail-solar').click();
  await expect(page.getByTestId('load-error')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.body.classList.contains('solar'))).toBe(false);
  // the Earth is still usable
  await expect(page.locator('#btn-zoom-in')).toBeEnabled();
  await page.getByTestId('load-retry').click();
  // a browser may cache the failed module: then the second failure offers a reload that keeps the place
  const ok = await page.locator('body.solar').waitFor({ state: 'attached', timeout: 30_000 }).then(() => true, () => false);
  if (!ok) {
    await expect(page.getByTestId('load-reload')).toBeVisible();
    await page.getByTestId('load-reload').click();
    await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 90_000 });
  }
  expect(await page.evaluate(() => document.body.classList.contains('solar'))).toBe(true);
});

test('links: lowfx=0 wins over reduced motion; an unknown hash falls back to the Earth', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, '/?lowfx=0&notut');
  expect(await page.evaluate(() => document.body.classList.contains('lowfx'))).toBe(false);
  await page.goto('/?lowfx=1&notut#no-such-thing');
  await expect.poll(() => page.evaluate(() => !!(window as any).__pp?.ready), { timeout: 90_000 }).toBe(true);
  await expect(page.locator('#toast')).toContainText(/🧭/);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.goto('/?lowfx=1&notut#%E0%A4%A');
  await expect.poll(() => page.evaluate(() => !!(window as any).__pp?.ready), { timeout: 90_000 }).toBe(true);
});

test('narrow phone: dock chips stay comfortably tappable and scroll @mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?lowfx=1&notut#milkyway');
  await expect(page.locator('[data-testid^="dc-"]').first()).toBeVisible({ timeout: 90_000 });
  const m = await page.evaluate(() => {
    const d = document.querySelector('.solar-dock .dock-list') as HTMLElement;
    const b = d.querySelector('button')!.getBoundingClientRect();
    return { w: b.width, h: b.height, scroll: d.scrollWidth > d.clientWidth, cue: d.classList.contains('more-r') };
  });
  expect(m.w).toBeGreaterThanOrEqual(43.5);
  expect(m.h).toBeGreaterThanOrEqual(43.5);
  expect(m.scroll).toBe(true);
  expect(m.cue).toBe(true);
});

test('radio asks before the first stream; “not now” makes no request', async ({ page }) => {
  const streams: string[] = [];
  await openApp(page);
  page.on('request', r => { if (!r.url().startsWith('http://localhost')) streams.push(r.url()); });
  await fromHub(page, 'look', 'menu-radio');
  await expect(page.getByTestId('radio-bar')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('radio-play').click();
  await expect(page.locator('#radio-consent')).toBeVisible();
  await page.getByTestId('radio-no').click();
  await expect(page.locator('#radio-consent')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(streams).toEqual([]);
  await expect(page.getByTestId('radio-bar')).not.toHaveAttribute('data-state', /connecting|playing/);
});

test('item cards say where the data comes from', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#an_lion');
  await expect(page.getByTestId('info-name')).toHaveText('Lion');
  await page.locator('#info details.more summary').click();
  await expect(page.getByTestId('provenance')).toBeVisible();
  await expect(page.getByTestId('provenance')).not.toHaveText('');
});

test('progress backup: save a file, then load it back through a preview', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#an_lion');
  await expect(page.getByTestId('info-name')).toHaveText('Lion');
  await page.keyboard.press('Escape');
  await page.locator('#btn-menu').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
  const file = await dl.path();
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
  expect(saved.kind).toBe('terrastra-progress');
  expect(Object.keys(saved.progress.seen)).toContain('an_lion');

  // a bad file changes nothing
  await page.getByTestId('backup-import').click();
  await page.getByTestId('backup-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
  await expect(page.getByTestId('backup-preview')).toHaveCount(0);

  // a good file from another device merges after the preview
  saved.progress.seen.an_tiger = Date.now();
  if (!(await page.getByTestId('backup-import').isVisible())) await page.locator('#btn-menu').click();
  await page.getByTestId('backup-import').click();
  await page.getByTestId('backup-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByTestId('backup-preview')).toBeVisible();
  await page.getByTestId('backup-merge').click();
  await expect(page.getByTestId('backup-preview')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pp.progress') ?? '{}').seen ?? {}))).toContain('an_tiger');
});

test('search: catalogue numbers and Chinese aliases, each result says its level', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-search');
  const input = page.locator('.search-modal input');
  await input.fill('M31');
  const first = page.locator('.search-grid .dex-card').first();
  await expect(first).toContainText('Andromeda Galaxy');
  await expect(first.locator('small')).toContainText('Local Group');
  await input.fill('故宫');
  await expect(page.locator('.search-grid .dex-card').first()).toContainText('Forbidden City');
  await expect(page.locator('.search-grid .dex-card').first().locator('small')).toContainText('Earth');
  await first.click();
  await expect(page).toHaveURL(/#localgroup\/dp_m31|#forbidden/);
});

test('search button opens the search window; its random hop jumps somewhere and closes it', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#btn-search')).toHaveAccessibleName(/Search/);
  await page.click('#btn-search');
  await expect(page.locator('.search-modal input')).toBeFocused();
  const before = page.url();
  await page.getByTestId('btn-random').click();
  await expect(page.locator('.search-modal')).toHaveCount(0);
  await expect.poll(() => page.url()).not.toBe(before);
});

test('classroom mode: link turns it on for the visit, hides third-party content, pauses motion', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut&class=1');
  await expect(page.locator('html')).toHaveClass(/classroom/);
  await expect(page.getByTestId('class-badge')).toBeVisible();
  await page.getByTestId('btn-hub').click();
  await page.getByTestId('hub-tab-look').click();
  await expect(page.getByTestId('menu-sky')).toBeVisible();
  await expect(page.getByTestId('menu-radio')).toHaveCount(0);
  await page.getByTestId('hub-tab-me').click();
  await expect(page.getByTestId('menu-passport')).toBeVisible();
  await expect(page.getByTestId('menu-guestbook')).toHaveCount(0);
  await page.getByTestId('hub-tab-learn').click();
  await page.goto('/?lowfx=1&notut&class=1#eiffel');
  await expect(page.locator('.info:not(.hidden)')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('read-more')).toBeHidden();
  await page.click('#btn-menu');
  await page.getByTestId('set-still').check({ force: true });
  await expect(page.locator('body')).toHaveClass(/still/);
  const clock = () => page.evaluate(() => (window as any).__pp.globe.clock as number);
  // (lowfx ticks the world about once a second)
  const c0 = await clock();
  await page.waitForTimeout(2200);
  expect(await clock()).toBe(c0);
  await page.getByTestId('set-still').uncheck({ force: true });
  await expect.poll(clock, { timeout: 5000 }).toBeGreaterThan(c0);
  // the link does not stick: a plain visit is back to normal
  await page.goto('/?lowfx=1&notut');
  await expect(page.locator('html')).not.toHaveClass(/classroom/);
  // the menu switch does stick, and teachers get a shareable link per tour
  await page.click('#btn-menu');
  await page.getByTestId('set-classroom').check({ force: true });
  await expect(page.locator('html')).toHaveClass(/classroom/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/classroom/);
  await page.goto('/?lowfx=1&notut#tour');
  await expect(page.getByTestId('tour-link-eclipse')).toBeVisible();
});

test('saved views: a versioned link restores the camera, bad links fall back, bookmarks reopen', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#eiffel@v1:30.00,10.00,1.500');
  await expect(page.locator('.info:not(.hidden)')).toBeVisible({ timeout: 30_000 });
  const cam = () => page.evaluate(() => { const g = (window as any).__pp.globe; return [Math.round(g.lat), Math.round(g.lon), +g.h.toFixed(1)]; });
  await expect.poll(cam, { timeout: 10_000 }).toEqual([30, 10, 1.5]);
  // the item stays selected and the hash is cleaned back to the plain route
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#eiffel');
  // a mangled camera still opens the item
  await page.goto('/?lowfx=1&notut#eiffel@v7:zz');
  await expect(page.locator('.info:not(.hidden)')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.toast').last()).toContainText('could not be restored');
  // save it, go elsewhere, reopen from the list
  await fromHub(page, 'look', 'menu-bookmarks');
  await page.getByTestId('bm-save').click();
  await expect(page.getByTestId('bm-open')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.goto('/?lowfx=1&notut#solar/mars');
  await page.waitForFunction(() => location.hash === '#solar/mars');
  await fromHub(page, 'look', 'menu-bookmarks');
  await page.getByTestId('bm-save').click();
  await expect(page.getByTestId('bm-open')).toHaveCount(2);
  await expect(page.getByTestId('bm-list')).toContainText(/Mars/);
  await page.getByTestId('bm-open').nth(1).click();
  await expect(page.locator('.info:not(.solar-info):not(.hidden)')).toContainText('Eiffel', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#eiffel');
});

test('photos from every scene: Solar System and sky theatre save captioned postcards', async ({ page }) => {
  await openApp(page, '/?lowfx=1&notut#solar/mars');
  await page.waitForFunction(() => location.hash === '#solar/mars');
  await page.getByTestId('btn-photo').click();
  await expect(page.locator('.solar-time')).toBeHidden();
  await page.getByTestId('shutter').click();
  await expect(page.locator('#toast')).toContainText(/album/i);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shutter')).toHaveCount(0);
  await page.goto('/?lowfx=1&notut#sky');
  await page.getByTestId('sky-photo').click();
  await page.getByTestId('shutter').click();
  await expect(page.locator('#toast')).toContainText(/album/i);
  await page.getByTestId('photo-album').click();
  await expect(page.getByTestId('album-grid').locator('img')).toHaveCount(2);
  const places = await page.evaluate(() => new Promise<string[]>(res => {
    const r = indexedDB.open('pp-photos');
    r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => res(q.result.map((p: { place: string }) => p.place)); };
  }));
  expect(places[0]).toBe('Mars');
  expect(places[1]).toMatch(/\d{4}/);
  // a postcard is taller than the frame: the caption band is drawn under it
  const first = page.getByTestId('album-grid').locator('img').first();
  await expect.poll(() => first.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  const [w, h] = await first.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight]);
  expect(h / w).toBeGreaterThan(800 / 1280);
});

test('compare bench: one measure per group, true scale vs clearly marked enlarged view', async ({ page }) => {
  await openApp(page);
  await fromHub(page, 'look', 'menu-compare');
  const cmp = page.getByTestId('compare');
  await expect(cmp).toBeVisible();
  await expect(page.getByTestId('cmp-ratio')).toContainText(/diameter of Earth is about 3\.7 times that of (the )?Moon/);
  await expect(page.getByTestId('cmp-stage')).toHaveAttribute('data-scale', 'true');
  await page.getByTestId('cmp-zoom').click();
  await expect(page.getByTestId('cmp-stage')).toHaveAttribute('data-scale', 'zoom');
  await expect(page.getByTestId('cmp-note')).toContainText(/Not true scale.*enlarged ×3\.7/);
  // a child next to the Burj Khalifa is under a pixel at true scale, and the bench says so
  await page.getByTestId('cmp-g-tall').click();
  await page.getByTestId('cmp-true').click();
  await pickOption(page, 'cmp-pick-1', 'child');
  await expect(page.getByTestId('cmp-ratio')).toContainText(/height of Burj Khalifa is about 637 times/);
  await expect(page.getByTestId('cmp-note')).toContainText(/less than a pixel/);
  await page.getByTestId('modal-close').click();
  // an item card opens the bench with that item already picked
  await page.evaluate(() => { location.hash = 'an_panda'; });
  await page.getByTestId('info-compare').click();
  await expect(page.getByTestId('cmp-g-long')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cmp-pick-0')).toHaveAttribute('data-value', 'an_panda');
  // C01 vehicles pack: speed is its own group (animals next to vehicles, in km/h)
  await page.getByTestId('cmp-g-fast').click();
  await expect(page.getByTestId('cmp-ratio')).toContainText(/speed of Bullet train is about 2\.6 times that of Cheetah/);
});

test('narration: user-started, highlights the sentence being read, stoppable, text stays readable', async ({ page }) => {
  // a stand-in speech engine (headless browsers have no voices): records what is said and plays each line for 300 ms
  await page.addInitScript(() => {
    const said: string[] = []; (window as any).__said = said;
    let q: any[] = [], timer = 0;
    const next = () => { const u = q.shift(); if (!u) return; said.push(u.text); u.onstart?.(); timer = window.setTimeout(() => { u.onend?.(); next(); }, 300); };
    (window as any).SpeechSynthesisUtterance = class { text: string; lang = ''; rate = 1; voice = null; onstart: any; onend: any; onerror: any; constructor(t: string) { this.text = t; } };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [], speak: (u: any) => { q.push(u); if (q.length === 1 && !timer) next(); },
      cancel: () => { clearTimeout(timer); timer = 0; const old = q; q = []; old.forEach(u => u.onerror?.({ error: 'canceled' })); },
    } });
  });
  await openApp(page);
  expect(await page.evaluate(() => (window as any).__said.length)).toBe(0);
  await page.evaluate(() => { location.hash = 'eiffel'; });
  const btn = page.getByTestId('info-listen');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('info-desc').locator('.say.now')).toHaveCount(1);
  expect((await page.evaluate(() => (window as any).__said))[0]).toMatch(/Eiffel Tower/);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.say.now')).toHaveCount(0);
  // played to the end it resets by itself
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
  await expect(page.getByTestId('info-desc')).not.toBeEmpty();
});

test('tonight from my city: hand-picked city, peak vs local view, says there is no weather', async ({ page }) => {
  await openApp(page);
  await fromHub(page, 'look', 'menu-tonight');
  await expect(page.getByTestId('tn-empty')).toBeVisible();
  await pickOption(page, 'tn-city', 'beijing');
  for (const s of ['night', 'moon', 'planets', 'showers', 'events']) await expect(page.getByTestId('tn-' + s)).toBeVisible();
  await expect(page.getByTestId('tn-night')).toContainText(/Sunset \d\d:\d\d/);
  await expect(page.getByTestId('tn-weather')).toContainText(/No weather data/);
  // the choice is remembered, and an event opens in the sky theatre
  await page.getByTestId('modal-close').click();
  await fromHub(page, 'look', 'menu-tonight');
  await expect(page.getByTestId('tn-city')).toHaveAttribute('data-value', 'beijing');
  const ev = page.getByTestId('tn-event').first();
  if (await ev.count()) {
    await ev.click();
    await expect(page.getByTestId('sky')).toBeVisible({ timeout: 30_000 });
  }
});

test('vehicles theme pack: cards say how each moves, label usual speed and flag demo routes', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { location.hash = '#vh_bullet'; });
  await expect(page.getByTestId('info-name')).toContainText(/Bullet/);
  await expect(page.locator('.stats-row')).toContainText(/Usual speed/i);
  await page.locator('details.more summary').click();
  await expect(page.getByTestId('info-how')).toContainText(/pantograph/);
  await expect(page.getByTestId('provenance')).toContainText(/simplified from the real path/);
  await page.evaluate(() => { location.hash = '#vh_balloon'; });
  await expect(page.getByTestId('info-name')).toContainText(/balloon/i);
  await expect(page.getByTestId('provenance')).toContainText(/demonstration/);
  await expect(page.getByTestId('info-compare')).toHaveCount(0);
});

test('more room: cards fold and stay folded, the name unfolds them, H hides every control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.evaluate(() => { location.hash = '#eiffel'; });
  await expect(page.getByTestId('info-name')).toBeVisible();
  await page.getByTestId('card-fold').click();
  const card = page.locator('#info');
  await expect(card).toHaveClass(/\bmini\b/);
  expect((await card.boundingBox())!.height).toBeLessThan(90);
  await expect(page.locator('.br')).toBeVisible();
  await page.evaluate(() => { location.hash = '#solar/mars'; });
  await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 60_000 });
  const solar = page.getByTestId('solar-info');
  await expect(solar).toHaveClass(/\bmini\b/);
  await expect(page.locator('.solar-bottom')).toBeVisible();
  await solar.locator('h2').click();
  await expect(solar).not.toHaveClass(/\bmini\b/);
  await page.keyboard.press('h');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(solar).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar')).toBeVisible();
  await page.keyboard.press('h');
  await page.getByTestId('immersive-exit').click();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('offline use is switched off: no worker is registered and the menu has no switch', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('reset')).toBeVisible();
  await expect(page.getByTestId('set-offline')).toHaveCount(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test('models draw without WebGL errors on the high tier (real-time shadows on)', async ({ page }) => {
  await openApp(page, '/?notut&q=high');
  // count draw calls the GPU rejects (e.g. a sampler/texture mismatch silently drops a model)
  await page.evaluate(() => {
    const r = (window as any).__pp.globe.renderer, gl = r.getContext(), draw = r.renderBufferDirect.bind(r);
    (window as any).__glErr = 0;
    r.renderBufferDirect = (...a: unknown[]) => { gl.getError(); draw(...a); if (gl.getError()) (window as any).__glErr++; };
  });
  expect(await page.evaluate(() => (window as any).__pp.globe.renderer.shadowMap.enabled)).toBe(true);
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__pp.globe.flyTo(48.86, 2.29, 0.25, 10));
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window as any).__glErr)).toBe(0);
});
