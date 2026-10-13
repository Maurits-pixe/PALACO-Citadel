import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'device-test.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['./safe-reporter.mjs']],
  outputDir: '../../../artifacts/rio-device-test-private',
  preserveOutput: 'never',
  use: { trace: 'off', video: 'off', screenshot: 'off', acceptDownloads: false },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
