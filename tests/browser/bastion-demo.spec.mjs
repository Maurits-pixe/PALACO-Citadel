import { expect, test } from '@playwright/test';

test('keeps Bastion a fictional local demo with temporary in-memory messages', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-26T00:00:00Z') });
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/citadel/bastion/');

  await expect(page).toHaveTitle('Bastion · Command center demo');
  await expect(page.locator('h1')).toHaveText('BASTION');
  await expect(page.locator('#demo-notice-title')).toHaveText('SIMULATION ONLY · NOT A SECURE SERVICE');
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('nothing is sent to a team or saved');
  await expect(page.locator('[data-i18n="commsEyebrow"]')).toHaveText('LOCAL SIMULATION · NOT ENCRYPTED');
  await expect(page.locator('#task-list .task-item')).toHaveCount(4);
  await expect(page.locator('#personnel-list .personnel-item')).toHaveCount(4);

  const taskButton = page.locator('#task-list .task-action').first();
  await expect(taskButton).toHaveAttribute('aria-pressed', 'false');
  await taskButton.click();
  await expect(page.locator('#task-list .task-action').first()).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#message-input').fill('Fictional status update');
  await page.locator('#message-form button').click();
  await expect(page.locator('.message-item')).toHaveCount(1);
  await expect(page.locator('.message-text')).toHaveText('Fictional status update');
  await expect(page.locator('.message-expiry')).toHaveText('Expires in 00:30');
  await expect(page.locator('#message-status')).toHaveText('Local demo message added. It is not sent to anyone.');

  await page.clock.fastForward(29_000);
  await expect(page.locator('.message-item')).toHaveCount(1);
  await page.clock.fastForward(1_000);
  await expect(page.locator('.message-item')).toHaveCount(0);
  await expect(page.locator('#message-status')).toHaveText('A local demo message expired and was removed from this view.');

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('#demo-notice-title')).toHaveText('ALLEEN SIMULATIE · GEEN BEVEILIGDE DIENST');
  await expect(page.locator('#message-form button')).toHaveText('Lokaal versturen');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#mission-title')).toHaveText('Taskotabulo');

  await page.reload();
  await expect(page.locator('.message-item')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
