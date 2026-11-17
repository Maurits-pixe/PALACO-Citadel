import { test, expect } from '@playwright/test';

test('Atelier: exterieur en interieur verschijnen in de Regiekamer', async ({ page }) => {
  await page.goto('/atelier/studio.html');
  await expect(page.getByRole('heading', { name: /Het Atelier/ })).toBeVisible();
  await page.locator('#map .cell').first().click();
  await expect(page.locator('#count')).toHaveText('1');

  await page.goto('/atelier/interieur.html');
  await expect(page.getByRole('heading', { name: /Interieuratelier/ })).toBeVisible();
  await page.locator('#board .tile').first().click();
  await expect(page.locator('#occupied')).toHaveText('1 / 240');

  await page.goto('/atelier/regiekamer.html');
  await expect(page.locator('#outUsed')).toHaveText('1');
  await expect(page.locator('#inUsed')).toHaveText('1');
  await expect(page.locator('#galleryInfo')).toContainText('1 / 96');
  await page.locator('[data-view="0"]').click();
  await expect(page.locator('#galleryInfo')).toContainText('1 / 80');
  await page.locator('[data-view="2"]').click();
  await expect(page.locator('#galleryInfo')).toContainText('0 / 80');
  await expect(page.locator('#galleryFrame svg')).toBeVisible();
  await expect(page.locator('#editGallery')).toHaveAttribute('href', './interieur.html');
});

test('Atelier: portable backup, veilig herstel en ontoegankelijke bevoegdheid', async ({ page }) => {
  await page.goto('/atelier/studio.html');
  await page.locator('#map .cell').nth(3).click();
  await page.goto('/atelier/regiekamer.html');
  await page.locator('#statement').fill('De levende tuin van Locus Amoenus');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#bundleSave').click();
  const archive = await downloadPromise;
  const path = await archive.path();
  const buffer = await (await import('node:fs/promises')).readFile(path);
  const parsed = JSON.parse(buffer.toString('utf8'));
  expect(parsed.state).toBe('DRAFT');
  expect(parsed.authority).toBe('NONE');
  expect(parsed.exterior.cells[3]).toBe('royal');
  expect(parsed.note).toBe('De levende tuin van Locus Amoenus');

  await page.goto('/atelier/studio.html');
  await page.locator('#map .cell').nth(4).click();
  await page.goto('/atelier/regiekamer.html');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bundleImport').setInputFiles({ name: 'draft.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#bundleStatus')).toContainText('hersteld');
  await expect(page.locator('#outUsed')).toHaveText('1');
  await expect(page.locator('#statement')).toHaveValue('De levende tuin van Locus Amoenus');

  const unauthorized = { ...parsed, authority: 'OWNER' };
  await page.locator('#bundleImport').setInputFiles({
    name: 'denied.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(unauthorized))
  });
  await expect(page.locator('#bundleStatus')).toContainText('Herstel geweigerd');
  await expect(page.locator('#outUsed')).toHaveText('1');
});

test('Atelier: panorama blijft schematisch en navigatie werkt', async ({ page }) => {
  await page.goto('/atelier/studio.html');
  await page.locator('#map .cell').first().click();
  await page.goto('/atelier/panorama.html');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#tiles')).toHaveText('1 / 96');
  await page.locator('#right').click();
  await expect(page.locator('#angle')).toHaveText('Zuidoost');
  await page.getByRole('link', { name: 'Interieuratelier' }).click();
  await expect(page.getByRole('heading', { name: /Interieuratelier/ })).toBeVisible();
  await page.getByRole('link', { name: /Regiekamer/ }).click();
  await expect(page.getByRole('heading', { name: /Regiekamer/ })).toBeVisible();
});

test('Atelier: alle modules en gedeelde scripts blijven bereikbaar zonder netwerk', async ({ page, context }) => {
  await page.goto('/index.html');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker ontbreekt');
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  // Verify cache was populated before disconnecting. No production account is needed.
  await expect.poll(() => page.evaluate(async () => {
    const names = await caches.keys();
    const current = names.find(name => name === 'palaco-rio-shell-v6');
    if (!current) return 0;
    const cache = await caches.open(current);
    const pages = ['/atelier/studio.html','/atelier/panorama.html','/atelier/interieur.html',
      '/atelier/regiekamer.html','/atelier/regiekamer-gallery.js','/atelier/regiekamer-bundle.js'];
    const hits = await Promise.all(pages.map(url => cache.match(url)));
    return hits.filter(Boolean).length;
  })).toBe(6);

  await context.setOffline(true);
  try {
    await page.goto('/atelier/regiekamer.html');
    await expect(page.getByRole('heading', { name: /Regiekamer/ })).toBeVisible();
    await expect(page.locator('#galleryFrame svg')).toBeVisible();
    await expect(page.locator('#offlineBadge')).toHaveText('Offline actief');
    await expect(page.locator('#offlineStatus')).toContainText('zes gecontroleerde Atelier-bestanden');
    await page.goto('/atelier/studio.html');
    await expect(page.getByRole('heading', { name: /Het Atelier/ })).toBeVisible();
    await page.goto('/atelier/interieur.html');
    await expect(page.getByRole('heading', { name: /Interieuratelier/ })).toBeVisible();
    await page.goto('/atelier/panorama.html');
    await expect(page.locator('#scene')).toBeVisible();
    await page.goto('/atelier/wizard.html');
    await expect(page.getByRole('heading', { name: 'New Citadel' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('Atelier: cache-indicator maakt ontbrekende offlinebestanden expliciet', async ({ page }) => {
  await page.goto('/atelier/regiekamer.html');
  await expect(page.locator('#offlineBadge')).toHaveText('Offline gereed');
  await page.evaluate(async () => {
    const cache = await caches.open('palaco-rio-shell-v6');
    await cache.delete('/atelier/panorama.html');
  });
  await page.locator('#checkOffline').click();
  await expect(page.locator('#offlineBadge')).toHaveText('Nog niet offline gereed');
  await expect(page.locator('#offlineStatus')).toContainText('5 van 6');
});
