import { expect, test } from '@playwright/test';

test('builds and opens the standalone React launcher without replacing the static launcher', async ({ page }) => {
  await page.goto('/citadel/react/');

  await expect(page).toHaveTitle('PALACO Hoofdkantoor · React launcher');
  await expect(page.getByRole('heading', { name: 'PALACO HOOFDKANTOOR', exact: true })).toBeVisible();
  await expect(page.locator('.module-card')).toHaveCount(3);
  await expect(page.locator('#boundary-title')).toContainText('GEEN OPERATIONELE DIENSTEN');

  const moduleCases = [
    { id: 'aether', heading: 'AETHER', route: '/citadel/iii6v9/' },
    { id: 'bastion', heading: 'BASTION', route: '/citadel/bastion-app/' },
    { id: 'scriptie', heading: '5CRIPTIE', route: '/citadel/aegis/' }
  ];

  for (const module of moduleCases) {
    const card = page.locator(`[data-module="${module.id}"]`);
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.module-toolbar h1')).toHaveText(module.heading);
    await expect(page.locator('.module-frame')).toHaveAttribute('src', module.route);
    await expect(page.frameLocator('.module-frame').locator('h1')).toHaveText(module.heading);
    if (module.id === 'bastion') {
      await expect(page.frameLocator('.module-frame').locator('#prototype-notice'))
        .toContainText('NIET VOOR VERTROUWELIJKE GEGEVENS');
    }
    await page.getByRole('button', { name: 'Terug naar PALACO' }).click();
    await expect(card).toBeFocused();
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
