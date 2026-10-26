import { expect, test } from '@playwright/test';

test('launches each concept preview in the same screen and returns to module choices', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.locator('.hero-preview a[href="/citadel/"]').click();

  await expect(page).toHaveTitle('Citadel · Module launcher');
  await expect(page.locator('h1')).toHaveText('CITADEL LAUNCHER');
  await expect(page.locator('#boundary-title')).toHaveText('CONCEPT PREVIEWS · NOT OPERATIONAL SERVICES');
  await expect(page.locator('.module-card')).toHaveCount(3);
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#boundary-title')).toHaveText('CONCEPTVOORBEELDEN · GEEN OPERATIONELE DIENSTEN');

  const modules = [
    { id: 'iii6v9', heading: 'III6V9', warning: '#notice-title', warningCopy: 'NIETS IS BESCHERMD' },
    { id: 'bastion', heading: 'BASTION', warning: '#demo-notice-title', warningCopy: 'ALLEEN SIMULATIE' },
    { id: 'aegis', heading: 'AEGIS', warning: '#notice-title', warningCopy: 'ALLEEN SIMULATIE' }
  ];

  for (const module of modules) {
    const choice = page.locator(`[data-module="${module.id}"]`);
    await choice.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#module-menu')).toBeHidden();
    await expect(page.locator('#module-view')).toBeVisible();
    await expect(page.locator('#module-frame')).toHaveAttribute('title', new RegExp(module.heading, 'i'));
    const frame = page.frameLocator('#module-frame');
    await expect(frame.locator('h1')).toHaveText(module.heading);
    await expect(frame.locator(module.warning)).toContainText(module.warningCopy);
    await expect(page).toHaveURL(/\/citadel\/$/);
    await expect(page.locator('#standalone-link')).toHaveAttribute('href', `/citadel/${module.id}/`);
    await page.locator('#return-button').click();
    await expect(page.locator('#module-menu')).toBeVisible();
    await expect(choice).toBeFocused();
  }

  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#menu-title')).toHaveText('Elektu Citadel-antaŭrigardon');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
