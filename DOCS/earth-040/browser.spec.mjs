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

test('EARTH-073 atlas blocks unadmitted physical GIS layer while retaining demo', async ({page}) => {
  await page.goto('/atlas.html');
  await expect(page.locator('#physical-status')).toContainText('niet toegelaten');
  await expect(page.locator('#physical-preview')).toBeHidden();
  await expect(page.locator('#physical-paths path')).toHaveCount(0);
  await expect(page.locator('.land')).toHaveCount(6);
});

test('EARTH-075 browser globals cannot authorize physical rendering', async ({page}) => {
  await page.addInitScript(() => {
    window.sourceApproved=true;
    window.renderAdmission='APPROVED_FOR_RENDER';
    window.physicalEvidence={admission:'VERIFIED_SOURCE',render_admission:'APPROVED_FOR_RENDER',renderer_compatible:true};
  });
  await page.goto('/atlas.html');
  await expect(page.locator('#physical-status')).toContainText('niet toegelaten');
  await expect(page.locator('#physical-preview')).toBeHidden();
  await expect(page.locator('#physical-paths path')).toHaveCount(0);
});
