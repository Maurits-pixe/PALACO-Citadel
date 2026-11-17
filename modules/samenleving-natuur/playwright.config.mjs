import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'module.spec.mjs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['line'], ['junit', { outputFile: 'test-results/junit.xml' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true
  },
  projects: [
    {name: 'desktop-chromium', use: {browserName: 'chromium', viewport: {width: 1440, height: 900}}},
    {name: 'mobile-chromium', use: {browserName: 'chromium', viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}}
  ],
  webServer: {
    command: 'python3 -m http.server 4177 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4177/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
