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
          time: Array.from({ length: 48 }, (_, i) => Math.floor(Date.now() / 3600_000) * 3600 + i * 3600),
          cloud_cover: Array.from({ length: 48 }, (_, i) => (i % 5) * 8),
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
  await expect(page.getByTestId('live-earth-tectonics-toggle')).toBeVisible();
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
  await page.getByTestId('hub-tab-look').click();
  await page.getByTestId('menu-tonight').click();
  await page.getByTestId('tn-city').click();
  await page.locator('[role=option][data-value="beijing"]').click();
  await expect(page.getByTestId('tn-planner')).toBeVisible();
  await page.getByTestId('tn-forecast-btn').click();
  await expect(page.getByTestId('tn-forecast')).toBeVisible();
  await expect(page.getByTestId('tn-export-ics')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#btn-menu').click();
  await expect(page.getByTestId('backup-export')).toBeVisible();
  const adminResponse = page.waitForResponse(r => r.url().endsWith('/terrastra/data/admin-1.json'));
  await page.locator('label.switch-card', { has: page.getByTestId('set-states') }).click();
  await page.evaluate(() => (window as any).__pp.globe.setH(0.8));
  expect((await adminResponse).ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminData?.regions.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(4000);

  // deep link into a lazy scene (its chunk comes from the sub-path)
  await page.goto('?lowfx=1&notut#milkyway');
  await ready(page);
  await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 60_000 });
  await page.goto('?lowfx=1&notut#sky');
  await expect(page.getByTestId('sky')).toBeVisible({ timeout: 60_000 });

  // the generated encyclopedia and its way back into the app
  await page.goto('encyclopedia/');
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('a[href="/terrastra/animals/"]').first().click();
  await expect(page).toHaveURL(/\/terrastra\/animals\/$/);
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('[data-set=zh]').click();
  await expect(page.locator('html')).toHaveAttribute('data-l', 'zh');
  await page.locator('[data-set=en]').click();
  // an item page under the category, then back into the app at the base path
  await page.locator('main a[href^="/terrastra/animals/"]').first().click();
  await expect(page.locator('h1')).toBeVisible();
  const app = page.locator('a[href^="/terrastra/?"], a[href^="/terrastra/#"]').first();
  if (await app.count()) await expect(app).toHaveAttribute('href', /^\/terrastra\//);
  expect(bad).toEqual([]);
});
