import { expect, test } from '@playwright/test';

test('launches each concept preview in the same screen and returns to module choices', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.locator('.hero-preview a[href="/citadel/"]').click();

  await expect(page).toHaveTitle('PALACO Hoofdkantoor · Launcher');
  await expect(page.locator('h1')).toHaveText('PALACO HOOFDKANTOOR');
  await expect(page.locator('#boundary-title')).toHaveText('CONCEPT PREVIEWS · NOT OPERATIONAL SERVICES');
  await expect(page.locator('.module-card')).toHaveCount(3);
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#boundary-title')).toHaveText('CONCEPTVOORBEELDEN · GEEN OPERATIONELE DIENSTEN');

  const modules = [
    { id: 'aether', heading: 'AETHER', path: '/citadel/iii6v9/', warning: '[data-i18n="noticeBody"]', warningCopy: 'geen onafhankelijk gecontroleerde kluis', backLink: '.back-link' },
    { id: 'bastion', heading: 'BASTION', path: '/citadel/bastion-app/', warning: '#prototype-notice', warningCopy: 'NIET VOOR VERTROUWELIJKE GEGEVENS', backLink: '.back-link' },
    { id: 'scriptie', heading: '5CRIPTIE', path: '/citadel/aegis/', warning: '#notice-title', warningCopy: 'ALLEEN SIMULATIE', backLink: '.back-link' }
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
    await expect(page.locator('#standalone-link')).toHaveAttribute('href', module.path);
    await frame.locator(module.backLink).click();
    await expect(page.locator('#module-menu')).toBeVisible();
    await expect(choice).toBeFocused();
  }

  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#menu-title')).toHaveText('Elektu modulan antaŭrigardon');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
