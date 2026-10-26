import { expect, test } from '@playwright/test';

test('Bastion Vue client presents prototype limits and requires credentials', async ({ page }) => {
  await page.goto('/citadel/bastion-app/');
  await expect(page).toHaveTitle('Citadel Bastion · Prototype');
  await expect(page.getByRole('heading', { name: 'BASTION' })).toBeVisible();
  await expect(page.locator('#prototype-notice')).toContainText('NIET VOOR VERTROUWELIJKE GEGEVENS');
  await expect(page.getByText(/niet end-to-end versleuteld/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aanmelden bij Bastion' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Gebruikersnaam' })).toBeVisible();
  await expect(page.getByLabel('Wachtwoord', { exact: true })).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
