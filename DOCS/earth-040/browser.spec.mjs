import { test, expect } from '@playwright/test';
test('EARTH globe navigation and atlas data', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.getByRole('heading', { name: /EARTH/ })).toBeVisible();
  await page.getByRole('link', { name: 'World Atlas' }).click();
  await expect(page).toHaveURL(/atlas\.html/);
  await expect(page.getByText(/SVG-regio's geladen uit gevalideerde demonstratie-GeoJSON/)).toBeVisible();
  await page.locator('[data-id="europe"]').click();
  await expect(page.locator('#region')).toHaveText('Europa');
  await page.locator('#scale').selectOption('4');
  await expect(page.locator('#scale-note')).toContainText('4×4');
  await page.getByRole('button', { name: 'Selectie wissen' }).click();
  await expect(page.locator('#region')).toHaveText('Selecteer een regio');
});
test('globe region controls and animation', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Peace' }).click();
  await expect(page.locator('#region-title')).toHaveText('Peace');
  await page.getByRole('button', { name: 'Animatie pauzeren' }).click();
  await expect(page.locator('#stage')).toHaveClass(/paused/);
});

test('Android-sized viewport supports Atlas navigation', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/index.html');
  await expect(page.getByRole('link', { name: 'World Atlas' })).toBeVisible();
  await page.getByRole('link', { name: 'World Atlas' }).click();
  await expect(page.getByText(/SVG-regio's geladen uit gevalideerde demonstratie-GeoJSON/)).toBeVisible();
  await expect(page.locator('[data-id="europe"]')).toBeVisible();
});
test('GeoJSON failure preserves fallback and exposes alert', async ({ page }) => {
  await page.route('**/geo-demo.json', route => route.abort());
  await page.goto('/atlas.html');
  await expect(page.getByRole('alert')).toContainText('GeoJSON niet beschikbaar');
  await expect(page.locator('.land').first()).toHaveAttribute('d', /.+/);
});
