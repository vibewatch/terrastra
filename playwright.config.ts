import { defineConfig, devices } from '@playwright/test';

const PORT = 8790;
// WebGL in CI/containers: run headed under Xvfb (xvfb-run) with SwiftShader.
const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: !process.env.DISPLAY,
    launchOptions: { args: gl },
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: { args: gl } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { args: gl } }, grep: /@mobile/ },
  ],
  webServer: {
    // the built app (`npm run build:web`) on a fresh SQLite database
    command: `npx prisma db push && npx next start web -p ${PORT}`,
    env: { DATABASE_URL: `file:/tmp/terrastra-e2e-${Date.now()}.db`, DEV_LOGIN: '1', NEXTAUTH_URL: `http://localhost:${PORT}`, NEXTAUTH_SECRET: 'e2e-only-secret' },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
