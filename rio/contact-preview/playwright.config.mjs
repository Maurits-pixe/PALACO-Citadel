import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: '../../artifacts/rio-contact-browser',
  reporter: [['list']],
  use: { browserName: 'chromium', trace: 'off', video: 'off', screenshot: 'off' }
});
