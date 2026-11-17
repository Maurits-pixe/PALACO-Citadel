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
  await page.locator('#repairOffline').click();
  await expect(page.locator('#offlineBadge')).toHaveText('Offline gereed');
  await expect(page.locator('#offlineStatus')).toContainText('1 ontbrekende bestanden hersteld');
  const restored = await page.evaluate(async () => {
    const cache = await caches.open('palaco-rio-shell-v6');
    return Boolean(await cache.match('/atelier/panorama.html'));
  });
  expect(restored).toBe(true);
});

test('Atelier: offline herstel weigert stilzwijgend een netwerkloze reparatie', async ({ page, context }) => {
  await page.goto('/atelier/regiekamer.html');
  await expect(page.locator('#offlineBadge')).toHaveText('Offline gereed');
  await context.setOffline(true);
  try {
    await expect(page.locator('#offlineBadge')).toHaveText('Offline actief');
    await page.locator('#repairOffline').click();
    await expect(page.locator('#offlineStatus')).toContainText('alleen met internet');
    await expect(page.locator('#repairOffline')).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }
});

test('Atelier: importvergelijking is zichtbaar en annuleren bewaart het bestaande ontwerp', async ({page})=>{
  await page.goto('/atelier/studio.html');
  await page.locator('#map .cell').first().click();
  await page.goto('/atelier/regiekamer.html');
  const valid=await page.evaluate(()=>{
    const api=window.PalacoAtelierBundle;
    const old=api.read(localStorage);
    const next=api.parse(JSON.stringify(old));
    next.exterior.cells[0]=null;
    next.note='Inkomend concept';
    return JSON.stringify(next);
  });
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#bundleImport').setInputFiles({
    name:'replacement.json',mimeType:'application/json',buffer:Buffer.from(valid)
  });
  await expect(page.locator('#bundleStatus')).toContainText('Veranderende vakken: 1');
  await expect(page.locator('#bundleStatus')).toContainText('Leeg te maken vakken: 1');
  await expect(page.locator('#outUsed')).toHaveText('1');
  await page.goto('/atelier/studio.html');
  await expect(page.locator('#count')).toHaveText('1');
});

test('Atelier: bevestigde import bewaart een herstelkopie en vorige versie kan terug', async ({page})=>{
  await page.goto('/atelier/studio.html');
  await page.locator('#map .cell').first().click();
  await page.goto('/atelier/regiekamer.html');
  const replacement=await page.evaluate(()=>{
    const b=window.PalacoAtelierBundle.read(localStorage);
    b.exterior.cells[0]=null;
    b.note='Nieuw DRAFT-concept';
    return JSON.stringify(b);
  });
  await expect(page.locator('#undoImport')).toBeDisabled();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#bundleImport').setInputFiles({name:'changed.json',mimeType:'application/json',buffer:Buffer.from(replacement)});
  await expect(page.locator('#bundleStatus')).toContainText('hersteld');
  await expect(page.locator('#outUsed')).toHaveText('0');
  await expect(page.locator('#undoImport')).toBeEnabled();
  await expect(page.locator('#exportRecovery')).toBeEnabled();
  const recoveryDownload=page.waitForEvent('download');
  await page.locator('#exportRecovery').click();
  const recoveryFile=await recoveryDownload;
  const recoveryBytes=await (await import('node:fs/promises')).readFile(await recoveryFile.path());
  const recoveryJson=JSON.parse(recoveryBytes.toString('utf8'));
  expect(recoveryJson.schema).toBe('palaco.citadel.atelier.portable/1');
  expect(recoveryJson.authority).toBe('NONE');
  expect(recoveryJson.exterior.cells[0]).toBe('royal');
  expect(recoveryJson.note).toBe('');
  expect(recoveryJson.savedAt).toBeUndefined();
  await expect(page.locator('#outUsed')).toHaveText('0');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#undoImport').click();
  await expect(page.locator('#bundleStatus')).toContainText('Vorige Atelier-versie teruggezet');
  await expect(page.locator('#outUsed')).toHaveText('1');
  await expect(page.locator('#statement')).toHaveValue('');
});

test('Atelier: dossiercontrole toont echte SHA-256 en wijzigt geen lokaal project', async ({page})=>{
  const {createHash}=await import('node:crypto');
  await page.goto('/atelier/studio.html');
  await page.locator('#map .cell').first().click();
  await page.goto('/atelier/regiekamer.html');
  const packageString=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
  const bytes=Buffer.from(packageString,'utf8');
  const expected=createHash('sha256').update(bytes).digest('hex');
  await page.locator('#bundleVerify').setInputFiles({name:'inspectie.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('Geldig creatief DRAFT-project');
  await expect(page.locator('#verifyStatus')).toContainText(expected);
  await expect(page.locator('#verifyStatus')).toContainText('geen digitale handtekening');
  await expect(page.locator('#verifyStatus')).toContainText('Geen eerdere referentie ingevoerd');
  await expect(page.locator('#exportFingerprint')).toBeEnabled();
  const receiptPromise=page.waitForEvent('download');
  await page.locator('#exportFingerprint').click();
  const receiptDownload=await receiptPromise;
  const receiptBytes=await (await import('node:fs/promises')).readFile(await receiptDownload.path());
  const receiptText=receiptBytes.toString('utf8');
  expect(receiptText).toContain('SHA-256: '+expected);
  expect(receiptText).toContain('Bestand: inspectie.json');
  expect(receiptText).toContain('geen digitale handtekening');

  await page.locator('#expectedFingerprint').fill(expected.toUpperCase());
  await page.locator('#bundleVerify').setInputFiles({name:'gelijk.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('REFERENTIE KOMT OVEREEN');
  await page.locator('#expectedFingerprint').fill('0'.repeat(64));
  await page.locator('#bundleVerify').setInputFiles({name:'anders.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('WAARSCHUWING: SHA-256 KOMT NIET OVEREEN');
  await page.locator('#expectedFingerprint').fill('not-a-sha');
  await page.locator('#bundleVerify').setInputFiles({name:'ongeldig.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('Controle afgewezen');
  await expect(page.locator('#verifyStatus')).toContainText('precies 64');
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
  await page.locator('#expectedFingerprint').fill('');
  await expect(page.locator('#outUsed')).toHaveText('1');
  await expect(page.locator('#undoImport')).toBeDisabled();
  const before=await page.evaluate(()=>localStorage.getItem('palaco.citadel.atelier.grand-studio.v1'));
  await page.locator('#bundleVerify').setInputFiles({
    name:'bevoegdheid.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({...JSON.parse(packageString),authority:'OWNER'}))
  });
  await expect(page.locator('#verifyStatus')).toContainText('Controle afgewezen');
  await expect(page.locator('#outUsed')).toHaveText('1');
  expect(await page.evaluate(()=>localStorage.getItem('palaco.citadel.atelier.grand-studio.v1'))).toBe(before);
});
