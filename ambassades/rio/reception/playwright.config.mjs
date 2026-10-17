import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', fullyParallel: false, workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30000, retries: 0, reporter: 'line',
  outputDir: '../../../artifacts/rio-reception-browser',
  use: { trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
