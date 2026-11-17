import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:4177/index.html';

test.beforeEach(async ({ page }) => {
  await page.goto(origin);
  await expect(page.locator('main')).toBeVisible();
  await page.getByRole('button', { name: 'Ontvangstruimte' }).click();
});

test('offline module navigates to the nine sections', async ({ page }) => {
  await expect(page.locator('nav [data-tab]')).toHaveCount(9);
  await expect(page.locator('#inbox')).toBeVisible();
  await page.getByRole('button', { name: 'Soortenbibliotheek' }).click();
  await expect(page.locator('#speciesCards article')).toHaveCount(8);
});

test('ten isolated receiver checks pass without changing local register', async ({ page }) => {
  const before = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  await page.locator('#handoffSelftest').click();
  await expect(page.locator('#handoffSelftestResult')).toContainText('10/10 controles geslaagd');
  const after = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  expect(after).toBe(before);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#handoffReport').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('citadel-ontvangst-qa-v08.json');
});

test('unverified full package requires consent and rejects replay', async ({ page }) => {
  const record = {
    id: 'playwright-import-001', title: 'Demo boom', category: 'Flora',
    conceptualArea: 'Het Woud', verification: 'persoonlijke observatie',
    description: 'Lokale testwaarneming', observedAt: '2026-11-01T12:00:00.000Z'
  };
  const packet = {
    schema: 'palaco-citadel-handoff-v1', source: 'citadel/samenleving-natuur',
    privacy: 'full-user-controlled', records: [record]
  };
  const file = { name: 'handoff.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) };
  await page.locator('#handoffFile').setInputFiles(file);
  await expect(page.locator('#handoffNew')).toHaveText('1');
  await expect(page.locator('#handoffAccept')).toBeDisabled();
  await page.locator('#handoffConsent').check();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#handoffAccept').click();
  await expect(page.locator('#handoffStatus')).toContainText('1 nieuwe registraties');
  await expect(page.locator('#handoffPreview')).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('palaco.citadel.samenleving-natuur.v1') || '[]'));
  expect(saved).toHaveLength(1);
  expect(saved[0].verification).toBe('nog te verifiëren');
  await page.locator('#handoffFile').setInputFiles(file);
  await expect(page.locator('#handoffNew')).toHaveText('0');
  await expect(page.locator('#handoffDuplicates')).toHaveText('1');
  await expect(page.locator('#handoffAccept')).toBeDisabled();
});

test('minimal handoff is view-only and cannot be imported', async ({ page }) => {
  const packet = {
    schema: 'palaco-citadel-handoff-v1', source: 'citadel/samenleving-natuur',
    privacy: 'minimal-user-controlled',
    records: [{sequence:1,category:'Flora',conceptualArea:'Het Woud',
      verification:'nog te verifiëren',recordedMonth:'2026-11'}]
  };
  await page.locator('#handoffFile').setInputFiles({
    name: 'minimal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#handoffStatus')).toContainText('Alleen inzage');
  await page.locator('#handoffConsent').check();
  await expect(page.locator('#handoffAccept')).toBeDisabled();
});
