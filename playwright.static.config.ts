import { defineConfig, devices } from '@playwright/test';

/** Smoke tests against the static (GitHub Pages) build, served below a sub-path. Build first: VITE_STATIC=1 BASE_PATH=/terrastra/ npm run build */
const PORT = 8791;
const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/static',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/terrastra/`,
    headless: !process.env.DISPLAY,
    launchOptions: { args: gl },
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node scripts/serve-static.ts',
    env: { PORT: String(PORT), BASE_PATH: '/terrastra/' },
    url: `http://localhost:${PORT}/terrastra/`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
