import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4187',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node elixer-engine/preview/server.mjs',
    url: 'http://127.0.0.1:4187',
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    reuseExistingServer: false,
    timeout: 20_000,
    env: { PORT: '4187' },
  },
});
