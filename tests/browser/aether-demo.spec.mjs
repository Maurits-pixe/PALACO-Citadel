import { expect, test } from '@playwright/test';

test('presents Aether as a visual demo and only encodes fixed public sample text', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero-preview a[href="#aether-demo"]').click();

  const panel = page.locator('#aether-demo');
  await expect(panel.locator('[data-i18n="aetherDemoIntro"]')).toHaveText('This is a visual demo. Nothing here is protected.');
  await expect(panel.locator('[data-i18n="aetherLimitOne"]')).toHaveText('Base64 is reversible encoding, not encryption.');
  await expect(panel.locator('[data-i18n="aetherLimitTwo"]')).toContainText('No access code');
  await expect(panel.locator('input, textarea')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /unlock/i })).toHaveCount(0);
  await expect(panel.locator('#aether-output')).toBeHidden();

  await panel.locator('#aether-encode').click();
  const output = panel.locator('#aether-output');
  await expect(output).not.toBeEmpty();
  expect(await page.evaluate(value => atob(value), await output.textContent())).toBe('Aether visual demo only.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.locator('[data-lang="nl"]').click();
  await expect(panel.locator('[data-i18n="aetherDemoIntro"]')).toHaveText('Dit is een visuele demo. Niets hierin is beschermd.');
  await expect(panel.locator('[data-i18n="aetherLimitOne"]')).toHaveText('Base64 is omkeerbare codering, geen versleuteling.');

  await page.locator('[data-lang="eo"]').click();
  await expect(panel.locator('[data-i18n="aetherDemoIntro"]')).toHaveText('Tio estas vida demo. Nenio ĉi tie estas protektata.');
  await expect(panel.locator('[data-i18n="aetherLimitOne"]')).toHaveText('Base64 estas reigebla kodigo, ne ĉifrado.');
});
