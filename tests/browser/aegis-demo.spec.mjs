import { expect, test } from '@playwright/test';

test('keeps 5CRIPTIE a synthetic code-integrity simulation without live scanning', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-26T00:00:00Z') });
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/citadel/aegis/');

  await expect(page).toHaveTitle('5CRIPTIE · Integrity simulation');
  await expect(page.locator('h1')).toHaveText('5CRIPTIE');
  await expect(page.locator('#notice-title')).toHaveText('SIMULATION ONLY · NO CODE IS SCANNED');
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('does not inspect source code');
  await expect(page.locator('#code-log .log-entry')).toHaveCount(8);
  await expect(page.locator('#stream-bars .stream-bar')).toHaveCount(20);
  await expect(page.locator('#thread-count')).toHaveText('18');
  await expect(page.locator('#integrity-label')).toHaveText('SIMULATED · NO ASSESSMENT');

  await page.clock.fastForward(800);
  await expect(page.locator('#scan-percent')).toHaveText('07% · SIM');
  await expect(page.locator('.progress-track')).toHaveAttribute('aria-valuenow', '7');
  await expect(page.locator('#code-log .log-entry')).toHaveCount(9);
  await expect(page.locator('#line-count')).toHaveText('142');

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('#notice-title')).toHaveText('ALLEEN SIMULATIE · ER WORDT GEEN CODE GESCAND');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#stats-title')).toHaveText('Demo-nombriloj');
  await page.clock.fastForward(20_000);
  await expect(page.locator('#code-log .log-entry')).toHaveCount(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
