export default {
  testDir: '.',
  testMatch: 'browser.spec.mjs',
  timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:8765', browserName: 'chromium', headless: true },
  reporter: 'list',
  retries: 0,
};
