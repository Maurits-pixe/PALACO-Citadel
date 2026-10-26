import { expect, test } from '@playwright/test';

test('keeps Aegis as a fictional monitoring simulation with synthetic local data', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-26T00:00:00Z') });
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/citadel/aegis/');

  await expect(page).toHaveTitle('Aegis · Monitoring simulation');
  await expect(page.locator('h1')).toHaveText('AEGIS');
  await expect(page.locator('#notice-title')).toHaveText('SIMULATION ONLY · NO LIVE MONITORING');
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('does not connect to a network');
  await expect(page.locator('#traffic-map')).toContainText('SYNTHETIC SIGNALS');
  await expect(page.locator('#map-points .map-point')).toHaveCount(8);
  await expect(page.locator('#alert-list .alert-item')).toHaveCount(3);
  await expect(page.locator('.alert-status').first()).toHaveText('SIMULATED · NOT BLOCKED');
  await expect(page.locator('#cpu-value')).toHaveText('32%');
  await expect(page.locator('#memory-value')).toHaveText('54%');
  await expect(page.locator('#network-value')).toHaveText('41%');

  await page.clock.fastForward(1500);
  await expect(page.locator('#cpu-value')).toHaveText('31%');
  await expect(page.locator('#map-points .map-point')).toHaveCount(9);
  await page.clock.fastForward(3000);
  await expect(page.locator('#alert-list .alert-item')).toHaveCount(4);
  await expect(page.locator('#alert-count')).toHaveText('04 EVENTS');

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('#notice-title')).toHaveText('ALLEEN SIMULATIE · GEEN LIVE MONITORING');
  await expect(page.locator('#health-title')).toHaveText('Systeemstatus');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#alerts-title')).toHaveText('Demo-atentigoj');

  await expect.poll(() => page.locator('#map-points .map-point').count()).toBeLessThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
