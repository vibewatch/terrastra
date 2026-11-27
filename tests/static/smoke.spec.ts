import { test, expect, type Page } from '@playwright/test';

/** The published edition: sub-path assets, lazy chunks, deep links and the generated encyclopedia, with no server API. */
const ready = (page: Page) => expect.poll(() => page.evaluate(() => !!(window as any).__pp?.ready), { timeout: 90_000 }).toBe(true);

async function stubExternalFeeds(page: Page): Promise<void> {
  await page.route('https://api.wheretheiss.at/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude: 18.4,
        longitude: 42.6,
        altitude: 418.4,
        velocity: 27582,
        timestamp: Math.floor(Date.now() / 1000) - 15,
      }),
    }),
  );
  await page.route('https://api.open-meteo.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        current: {
          temperature_2m: 19.2,
          weather_code: 0,
          wind_speed_10m: 11.4,
          is_day: 1,
        },
        hourly: {
          time: Array.from({ length: 72 }, (_, i) => Math.floor(Date.now() / 3600_000) * 3600 + (i - 24) * 3600),
          cloud_cover: Array.from({ length: 72 }, (_, i) => (i % 5) * 8),
        },
      }),
    }),
  );
  await page.route('https://services.swpc.noaa.gov/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        ['time_tag', 'Kp'],
        ['2026-04-20 00:00:00.000', '3.3'],
      ]),
    }),
  );
  await page.route('https://earthquake.usgs.gov/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            id: 'us1000test',
            properties: { mag: 5.4, place: 'Kermadec Islands', time: Date.now() - 12 * 60_000 },
            geometry: { coordinates: [-177.5, -29.8, 34] },
          },
        ],
      }),
    }),
  );
}

test('static build works below a sub-path', async ({ page }) => {
  await stubExternalFeeds(page);
  const bad: string[] = [];
  page.on('response', r => {
    const url = r.url();
    const isSameOrigin = url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:');
    if (isSameOrigin && r.status() >= 400 && !url.includes('/api/')) {
      bad.push(`${r.status()} ${url}`);
    }
  });
  page.on('pageerror', e => bad.push('pageerror ' + e.message));

  await page.goto('?lowfx=1&notut');
  await ready(page);
  const blocked = await page.evaluate(() => {
    const w = window as unknown as { injected?: boolean };
    const script = document.createElement('script');
    script.textContent = 'window.injected = true';
    document.head.append(script);
    return w.injected !== true;
  });
  expect(blocked).toBe(true);
  // the map and the catalogue loaded: an item is on the globe
  await expect.poll(() => page.evaluate(() => (window as any).__pp.itemScreen('eiffel_tower') !== null || document.querySelectorAll('canvas').length > 0)).toBe(true);

  // modal focus trap + trigger restoration when opening empty Album from #hub (#7)
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-me').click();
  await expect(page.getByTestId('menu-passport')).toBeVisible();
  await expect(page.getByTestId('menu-account')).toHaveCount(0);
  await page.getByTestId('menu-album').click();
  await expect(page.locator('#album')).toBeVisible();
  await expect(page.locator('#album [data-testid="modal-close"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#album [data-testid="modal-close"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#album')).toHaveCount(0);
  await expect(page.locator('#btn-hub')).toBeFocused();

  // localized weather/solar labels (#2) and live ISS telemetry row (#5)
  await page.evaluate(() => { location.hash = 'eiffel'; });
  await expect(page.getByTestId('live-weather')).toBeVisible();
  await expect(page.getByTestId('live-weather')).toContainText('19.2°C');
  await expect(page.getByTestId('live-weather')).not.toContainText(/solar(Day|Twilight|Night)|wx[A-Z]/);
  const chipFits = await page.locator('.solar-phase-chip').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  expect(chipFits).toBe(true);

  await page.evaluate(() => { location.hash = 'sp_iss'; });
  await expect(page.getByTestId('iss-live-box')).toBeVisible();
  await expect(page.getByTestId('iss-telemetry-text')).toContainText('km');
  await page.evaluate(() => (window as any).__pp.shell.showItem(null));

  // Live Earth monitor modal (Feature 2 + Tectonics context) & Tonight observing planner (Feature 3)
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-look').click();
  await page.getByTestId('menu-live-earth').click();
  await expect(page.getByTestId('live-earth')).toBeVisible();
  await expect(page.getByTestId('quake-feed-status')).toBeVisible();
  await expect(page.getByTestId('live-earth-export')).toBeVisible();
  await expect(page.getByTestId('live-earth-tectonics-toggle')).toBeVisible();
  await expect(page.getByTestId('live-earth-sun-card')).toBeVisible();
  await expect(page.getByTestId('quake-summary-stats')).toContainText(/TNT/);
  await expect(page.getByTestId('quake-row').first()).toContainText('Kermadec Islands');
  await expect(page.getByTestId('quake-tectonic').first()).toContainText(/Kermadec|Trench|ridge|fault/i);
  await page.getByTestId('quake-mag-5.5').click();
  await expect(page.getByTestId('quake-empty')).toBeVisible();
  await page.getByTestId('quake-mag-2.5').click();
  await expect(page.getByTestId('quake-row')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Great-circle distance & antipode lab in Compare bench + Explorer Passport summary
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-look').click();
  await page.getByTestId('menu-compare').click();
  await expect(page.getByTestId('cmp-g-dist')).toBeVisible();
  await page.getByTestId('cmp-g-dist').click();
  await expect(page.getByTestId('cmp-travel-grid')).toBeVisible();
  await expect(page.getByTestId('cmp-midpoint-line')).toContainText(/km/);
  await expect(page.getByTestId('cmp-fly-midpoint')).toBeVisible();
  await expect(page.getByTestId('cmp-dist-copy')).toBeVisible();
  await expect(page.getByTestId('cmp-antipode-card')).toBeVisible();
  await expect(page.getByTestId('cmp-ratio')).toContainText(/km/);
  await page.getByTestId('cmp-dist-swap').click();
  await expect(page.getByTestId('cmp-fly-arc')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-me').click();
  await page.getByTestId('menu-passport').click();
  await expect(page.getByTestId('passport-summary')).toBeVisible();
  await expect(page.getByTestId('passport-export-md')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-me').click();
  await page.getByTestId('menu-collection').click();
  await expect(page.getByTestId('collection-seasons')).toBeVisible();
  await page.keyboard.press('Escape');

  // Geography class: expanded grade lessons, question banks & Wrong-Question Notebook (错题本)
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-learn').click();
  await page.getByTestId('menu-lessons').click();
  await expect(page.getByTestId('mistake-book-bar')).toBeVisible();
  await expect(page.getByTestId('mistake-empty')).toBeVisible();
  await expect(page.getByTestId('lesson-se-asia')).toBeVisible();
  await expect(page.getByTestId('lesson-exam-g7a')).toBeVisible();
  await page.getByTestId('lesson-se-asia').click();
  await expect(page.getByTestId('lesson')).toBeVisible();
  // Keyboard navigation in Lesson Player: ArrowRight steps forward through explanation steps
  for (let s = 0; s < 3; s++) await page.keyboard.press('ArrowRight');
  // Purposely pick a wrong option on Question 1 so it is recorded into the Mistake Notebook
  await page.locator('[data-testid="lesson-opt"][data-right="false"]').first().click();
  await expect(page.getByTestId('lesson-why')).toHaveClass(/no/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lesson')).toHaveCount(0);

  // Open Geography Class again and verify the Mistake Notebook recorded the wrong question
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-learn').click();
  await page.getByTestId('menu-lessons').click();
  await expect(page.getByTestId('mistake-stats')).toContainText('1 to review');
  await page.getByTestId('mistake-toggle-btn').click();
  await expect(page.getByTestId('mistake-list')).toBeVisible();
  await expect(page.getByTestId('mistake-item')).toHaveCount(1);
  await expect(page.getByTestId('mistake-right-ans')).toContainText('Strait of Malacca');
  // Practice the missed question and answer it right to master it
  await page.getByTestId('mistake-practice-btn').click();
  await expect(page.getByTestId('lesson')).toBeVisible();
  await page.locator('[data-testid="lesson-opt"][data-right="true"]').click();
  await page.getByTestId('lesson-next').click();
  await expect(page.getByTestId('lesson-score')).toContainText('Mastered 1');
  await page.getByTestId('lesson-done').click();

  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-look').click();
  await page.getByTestId('menu-tonight').click();
  await page.getByTestId('tn-city').click();
  await page.locator('[role=option][data-value="beijing"]').click();
  await expect(page.getByTestId('tn-planner')).toBeVisible();
  await expect(page.getByTestId('tn-iss')).toBeVisible();
  await expect(page.getByTestId('tn-iss-track')).toBeVisible();
  await page.getByTestId('tn-forecast-btn').click();
  await expect(page.getByTestId('tn-forecast')).toBeVisible();
  await expect(page.getByTestId('tn-export-ics')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-look').click();
  await page.getByTestId('menu-time').click();
  await expect(page.getByTestId('time-bar')).toBeVisible();
  await expect(page.getByTestId('time-era-note')).toContainText(/Living Planet Today/);
  await page.getByTestId('time-prev').click();
  await expect(page.getByTestId('time-year')).toHaveText('2000');
  await expect(page.getByTestId('time-era-note')).toContainText(/Millennium/);
  await page.getByTestId('time-next').click();
  await expect(page.getByTestId('time-year')).toHaveText('Today');
  await page.getByTestId('time-close').click();

  await page.locator('#btn-menu').click();
  await expect(page.getByTestId('backup-export')).toBeVisible();
  const adminResponse = page.waitForResponse(r => r.url().endsWith('/terrastra/data/admin-1.json'));
  await page.locator('label.switch-card', { has: page.getByTestId('set-states') }).click();
  await page.evaluate(() => (window as any).__pp.globe.setH(0.8));
  expect((await adminResponse).ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminData?.regions.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(4000);
  await page.keyboard.press('Escape');

  // Textbook physical-geography gazetteer search (地中海 / 马里亚纳海沟 / 安第斯山脉), `/` shortcut, Enter selection & recent chips
  await page.keyboard.press('/');
  await expect(page.getByTestId('search-input')).toBeVisible();
  await page.getByTestId('search-filter-geo').click();
  await expect(page.getByTestId('search-place-geo:mediterranean-sea')).toBeVisible();
  await page.getByTestId('search-filter-all').click();
  await page.getByTestId('search-input').fill('马里亚纳海沟');
  await expect(page.getByTestId('search-place-geo:mariana-trench')).toBeVisible();
  await expect(page.getByTestId('search-item-dc_challenger')).toContainText('马里亚纳海沟');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#geo:mariana-trench$/);
  await page.getByTestId('info-close').click();
  await page.keyboard.press('/');
  await expect(page.getByTestId('search-recent')).toBeVisible();
  await expect(page.getByTestId('search-recent-geo:mariana-trench')).toBeVisible();
  await page.getByTestId('search-recent-clear').click();
  await expect(page.getByTestId('search-recent')).toBeHidden();
  await page.getByTestId('search-input').fill('地中海');
  await expect(page.getByTestId('search-place-geo:mediterranean-sea')).toBeVisible();
  await page.getByTestId('search-place-geo:mediterranean-sea').click();
  await expect(page).toHaveURL(/#geo:mediterranean-sea$/);
  await expect(page.locator('#info .place-hero')).toBeVisible();
  await expect(page.getByTestId('info-name')).toHaveText('Mediterranean Sea');
  await expect(page.getByTestId('place-fact')).toContainText('convergent plate boundary');
  await expect(page.getByTestId('place-nearby')).toBeVisible();
  await expect(page.locator('.lb-geo-focus')).toBeVisible({ timeout: 10_000 });
  await page.locator('#info details.more summary').click();
  await page.getByTestId('info-measure-dist').click();
  await expect(page.getByTestId('cmp-dist-details')).toBeVisible();
  await expect(page.getByTestId('cmp-ratio')).toContainText('Mediterranean Sea');
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-language').click();
  await expect(page.getByTestId('info-name')).toHaveText('地中海');
  await expect(page.getByTestId('place-fact')).toContainText('消亡边界');
  await page.getByTestId('btn-language').click();
  await page.getByTestId('info-close').click();
  await expect(page.locator('#info')).toBeHidden();

  // deep link into a lazy scene (its chunk comes from the sub-path)
  await page.goto('?lowfx=1&notut#map');
  await ready(page);
  await expect(page.locator('body.flatmap')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByTestId('map-distortion')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => { location.hash = 'geo:andes'; });
  await expect(page.getByTestId('info-name')).toHaveText('Andes Mountains');
  await expect(page.getByTestId('flatmap').locator('.lb-geo-focus')).toContainText('Andes Mountains');
  await page.getByTestId('info-close').click();
  await expect(page.locator('#info')).toBeHidden();
  await expect(page.getByTestId('flatmap').locator('.lb-geo-focus')).toHaveCount(0);
  let targetGeo: { key: string; cx: number; cy: number } | null = null;
  await expect.poll(async () => {
    targetGeo = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="flatmap"] .lb-geo[data-geo-key]'));
      for (const el of labels) {
        if (el.style.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 80 || cx > window.innerWidth - 80 || cy < 90 || cy > window.innerHeight - 130) continue;
        if (document.elementFromPoint(cx, cy)?.tagName === 'CANVAS') {
          return { key: el.dataset.geoKey!, cx, cy };
        }
      }
      return null;
    });
    return targetGeo;
  }, { timeout: 10_000 }).not.toBeNull();
  await page.mouse.click(targetGeo!.cx, targetGeo!.cy);
  await expect(page.locator('#info .place-hero')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#${targetGeo!.key}$`));
  await page.evaluate(() => { location.hash = 'city:tokyo'; });
  await expect(page.getByTestId('info-name')).toHaveText('Tokyo');
  await page.goto('?lowfx=1&notut#milkyway');
  await ready(page);
  await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 60_000 });
  await page.goto('?lowfx=1&notut#sky');
  await expect(page.getByTestId('sky')).toBeVisible({ timeout: 60_000 });
  // Direct hash jump from Sky Theatre to an Earth place closes Sky Theatre cleanly
  await page.evaluate(() => { location.hash = 'geo:andes'; });
  await expect(page.getByTestId('sky')).toHaveCount(0);
  await expect(page.getByTestId('info-name')).toHaveText('Andes Mountains');
  await page.getByTestId('info-close').click();
  // Switching language while #hub is open translates #hub immediately
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-learn').click();
  await expect(page.getByTestId('menu-lessons')).toContainText('Geography class');
  await page.getByTestId('btn-language').click();
  await expect(page.getByTestId('menu-lessons')).toContainText('地理课');
  await page.getByTestId('btn-language').click();
  await page.keyboard.press('Escape');

  // the generated encyclopedia and its way back into the app
  await page.goto('encyclopedia/');
  await expect(page.locator('a.skip[href="#main"]')).toHaveCount(1);
  await expect(page.locator('main#main')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('a[href="/terrastra/animals/"]').first().click();
  await expect(page).toHaveURL(/\/terrastra\/animals\/$/);
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('[data-set=zh]').click();
  await expect(page.locator('html')).toHaveAttribute('data-l', 'zh');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.locator('[data-set=en]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // Alias search on static section page (e.g. 马里亚纳海沟 matches Challenger Deep)
  await page.goto('discover/');
  await page.locator('#q').fill('马里亚纳海沟');
  await expect(page.locator('ul.cards a[href="/terrastra/discover/challenger-deep/"]')).toBeVisible();
  // Physical Geography encyclopedia section & feature detail page (including kind-label filtering & curriculum links)
  await page.goto('geography/');
  await expect(page.locator('h1')).toContainText('Physical Geography');
  await page.locator('#q').fill('plateau');
  await expect(page.locator('ul.cards a[href="/terrastra/geography/brazilian-highlands/"]')).toBeVisible();
  await page.locator('#q').fill('马里亚纳海沟');
  await page.locator('ul.cards a[href="/terrastra/geography/mariana-trench/"]').click();
  await expect(page.locator('h1')).toContainText('Mariana Trench');
  await expect(page.locator('.fun')).toBeVisible();
  await expect(page.locator('a[href="/terrastra/#geo:mariana-trench"]')).toBeVisible();
  await expect(page.getByTestId('geo-page-lessons')).toBeVisible();
  await expect(page.locator('[data-testid="geo-page-lessons"] a[href="/terrastra/#lesson/plates"]')).toBeVisible();
  await page.goto('animals/');
  // an item page under the category, then back into the app at the base path
  await page.locator('main a[href^="/terrastra/animals/"]').first().click();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.hero.has-3d')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('hero-3d-canvas')).toBeVisible();
  const app = page.locator('a[href^="/terrastra/?"], a[href^="/terrastra/#"]').first();
  if (await app.count()) await expect(app).toHaveAttribute('href', /^\/terrastra\//);
  // 404 page carries noindex robots directive
  const res404 = await page.request.get('404/');
  expect(res404.ok()).toBe(true);
  expect(await res404.text()).toContain('<meta name="robots" content="noindex">');
  expect(bad).toEqual([]);
});
