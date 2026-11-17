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

test('a local observation survives a page reload without server synchronization', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Testboom in het woud');
  await page.locator('#notes').fill('Lokaal en zonder account geregistreerd');
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('lokaal opgeslagen');
  await page.reload();
  await page.getByRole('button', { name: 'Levend register' }).click();
  await expect(page.locator('#records')).toContainText('Testboom in het woud');
  await expect(page.locator('#count')).toHaveText('1');
});

test('invalid transfer is rejected without mutating stored observations', async ({ page }) => {
  const before = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  const malformed = {
    schema: 'palaco-citadel-handoff-v1', source: 'citadel/samenleving-natuur',
    privacy: 'full-user-controlled',
    records: [{ id:'bad-date', title:'Test', category:'Flora',
      conceptualArea:'Het Woud', verification:'nog te verifiëren',
      description:'', observedAt:'2999-01-01T00:00:00Z' }]
  };
  await page.locator('#handoffFile').setInputFiles({
    name:'invalid.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(malformed))
  });
  await expect(page.locator('#handoffStatus')).toContainText('afgewezen');
  await expect(page.locator('#handoffAccept')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'))).toBe(before);
});

test('default handoff export omits private note, title, and record IDs', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('VERTROUWELIJKE TITEL');
  await page.locator('#notes').fill('VERTROUWELIJKE INHOUD');
  await page.locator('#entryform button[type="submit"]').click();
  await page.getByRole('button', { name: 'Leefwereldatlas' }).click();
  await expect(page.locator('#packetMinimal')).toBeChecked();
  const pending = page.waitForEvent('download');
  await page.locator('#packetExport').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('citadel-leefwereld-minimaal.json');
  const { readFile } = await import('node:fs/promises');
  const json = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(json.privacy).toBe('minimal-user-controlled');
  expect(json.records).toHaveLength(1);
  expect(json.records[0]).not.toHaveProperty('title');
  expect(json.records[0]).not.toHaveProperty('description');
  expect(json.records[0]).not.toHaveProperty('id');
  expect(JSON.stringify(json)).not.toContain('VERTROUWELIJKE');
});

test('a pending handoff is invalidated when another tab modifies the register', async ({ page, context }) => {
  const record = { id:'external-001', title:'Andere eik', category:'Flora',
    conceptualArea:'Het Woud', verification:'nog te verifiëren',
    description:'Cross-tab controle', observedAt:'2026-11-01T12:00:00Z' };
  await page.locator('#handoffFile').setInputFiles({
    name:'pending.json', mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',
      source:'citadel/samenleving-natuur', privacy:'full-user-controlled',
      records:[record]
    }))
  });
  await expect(page.locator('#handoffNew')).toHaveText('1');
  await page.locator('#handoffConsent').check();
  await expect(page.locator('#handoffAccept')).toBeEnabled();
  const second = await context.newPage();
  await second.goto(origin);
  await second.getByRole('button', { name:'Levend register' }).click();
  await second.locator('#title').fill('Waarneming vanuit tweede tab');
  await second.locator('#entryform button[type="submit"]').click();
  await expect(second.locator('#message')).toContainText('lokaal opgeslagen');
  await expect(page.locator('#handoffPreview')).toBeHidden();
  await expect(page.locator('#handoffAccept')).toBeDisabled();
  await expect(page.locator('#records')).toContainText('Waarneming vanuit tweede tab');
  await second.close();
});

test('stale storage snapshot cannot overwrite a newer register', async ({ page }) => {
  await page.getByRole('button', { name:'Levend register' }).click();
  await page.locator('#title').fill('Oud voorstel');
  await page.evaluate(() => {
    const key = 'palaco.citadel.samenleving-natuur.v1';
    localStorage.setItem(key, JSON.stringify([{
      id:'preserved-001', title:'Bewaar deze observatie', kind:'Flora',
      area:'Het Woud', verification:'persoonlijke observatie',
      notes:'Nieuwe gegevens', time:'2026-11-01T12:00:00Z'
    }]));
  });
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('overschrijving geweigerd');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('palaco.citadel.samenleving-natuur.v1')));
  expect(saved).toHaveLength(1);
  expect(saved[0].title).toBe('Bewaar deze observatie');
});

test('chapter navigation remains keyboard accessible and reports active section', async ({ page }) => {
  await page.getByRole('button', { name:'Samenleving' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#society')).toBeVisible();
  await expect(page.locator('nav [data-tab="society"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#inbox')).toBeHidden();
  await page.getByRole('button', { name:'Seizoenen & ecologie' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#seasons')).toBeVisible();
});

test('mobile layout avoids horizontal page overflow across chapters', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'mobile-chromium') return;
  const ids = ['overview','nature','society','species','seasons','atlas','timeline','inbox','register'];
  for (const id of ids) {
    await page.locator('nav [data-tab="'+id+'"]').click();
    await expect(page.locator('#'+id)).toBeVisible();
    const sizes = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(sizes.documentWidth, 'overflow in chapter '+id).toBeLessThanOrEqual(sizes.viewportWidth + 2);
  }
});

test('keyboard skip link moves focus to main chapter content', async ({ page }) => {
  await page.reload();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Direct naar hoofdstukinhoud' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page).toHaveURL(/#main-content$/);
});

test('user provided markup is displayed as text, never executed', async ({ page }) => {
  await page.getByRole('button', { name:'Levend register' }).click();
  await page.locator('#title').fill('<img src=x onerror=alert(1)>');
  await page.locator('#notes').fill('<script>window.CITADEL_XSS=1</script>');
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('lokaal opgeslagen');
  await expect(page.locator('#records')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#records')).toContainText('<script>window.CITADEL_XSS=1</script>');
  await expect(page.locator('#records img')).toHaveCount(0);
  await expect(page.locator('#records script')).toHaveCount(0);
  expect(await page.evaluate(() => window.CITADEL_XSS)).toBeUndefined();
});

test('invalid handoff cannot activate import confirmation', async ({ page }) => {
  await page.locator('#handoffFile').setInputFiles({
    name:'wrong-schema.json', mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({schema:'other',source:'citadel/samenleving-natuur',records:[]}))
  });
  await expect(page.locator('#handoffStatus')).toContainText('afgewezen');
  await expect(page.locator('#handoffPreview')).toBeHidden();
  await expect(page.locator('#handoffAccept')).toBeDisabled();
});

const backupRecord = (id, title = 'Eik uit back-up') => ({
  id, title, kind: 'Flora', area: 'Het Woud',
  verification: 'persoonlijke observatie', notes: 'Herstelcontrole',
  time: '2026-11-01T12:00:00Z'
});
const backupFile = entries => ({
  name:'citadel-backup.json', mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({schema:'palaco-citadel-natuur-v1',entries}))
});

test('duplicate backup record IDs are rejected without replacing local data', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Bestaande registratie');
  await page.locator('#entryform button[type="submit"]').click();
  const before = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  await page.locator('#importFile').setInputFiles(backupFile([
    backupRecord('duplicate-01'), backupRecord('duplicate-01','Een andere titel')
  ]));
  await expect(page.locator('#message')).toContainText('Back-up afgewezen');
  expect(await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'))).toBe(before);
});

test('malformed timestamp in backup is rejected', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#importFile').setInputFiles(backupFile([
    {...backupRecord('invalid-time'),time:'2999-01-01T12:00:00Z'}
  ]));
  await expect(page.locator('#message')).toContainText('Back-up afgewezen');
  await expect(page.locator('#count')).toHaveText('0');
});

test('cancelled backup restore preserves the existing register', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Niet overschrijven');
  await page.locator('#entryform button[type="submit"]').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#importFile').setInputFiles(backupFile([backupRecord('restore-cancel')]));
  await expect(page.locator('#message')).toContainText('Herstel geannuleerd');
  await expect(page.locator('#records')).toContainText('Niet overschrijven');
  await expect(page.locator('#count')).toHaveText('1');
});

test('explicitly approved backup restore replaces local records', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Oude observatie');
  await page.locator('#entryform button[type="submit"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles(backupFile([backupRecord('restore-approved')]));
  await expect(page.locator('#message')).toContainText('Back-up veilig hersteld');
  await expect(page.locator('#records')).toContainText('Eik uit back-up');
  await expect(page.locator('#records')).not.toContainText('Oude observatie');
  await expect(page.locator('#count')).toHaveText('1');
});
