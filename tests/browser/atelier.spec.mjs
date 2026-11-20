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
  await expect(page.locator('#exportBundleReceipt')).toBeEnabled();
  const shaDownloadPromise=page.waitForEvent('download');
  await page.locator('#exportBundleReceipt').click();
  const shaDownload=await shaDownloadPromise;
  const shaText=(await (await import('node:fs/promises')).readFile(await shaDownload.path())).toString('utf8');
  const {createHash}=await import('node:crypto');
  const expectedHash=createHash('sha256').update(buffer).digest('hex');
  expect(shaText).toContain('SHA-256: '+expectedHash);
  expect(shaText).toContain('Bestand: PALACO-Atelier-Compleet-Project-DRAFT.json');
  expect(shaText).toContain('geen digitale handtekening');
  await expect(page.locator('#checkExportFile')).toBeEnabled();
  await page.locator('#checkExportFile').setInputFiles({name:'gedownload.json',mimeType:'application/json',buffer});
  await expect(page.locator('#exportCheckStatus')).toContainText('CONTROLE GESLAAGD');
  await expect(page.locator('#exportCheckStatus')).toContainText(expectedHash);
  const changed=Buffer.from(JSON.stringify({...parsed,note:'Andere DRAFT versie'},null,2));
  await page.locator('#checkExportFile').setInputFiles({name:'aangepast.json',mimeType:'application/json',buffer:changed});
  await expect(page.locator('#exportCheckStatus')).toContainText('WAARSCHUWING');
  await page.locator('#checkExportFile').setInputFiles({name:'onbevoegd.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...parsed,authority:'OWNER'}))});
  await expect(page.locator('#exportCheckStatus')).toContainText('Exportcontrole geweigerd');


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
  await page.locator('#fingerprintReceipt').setInputFiles({name:'controlebewijs.txt',mimeType:'text/plain',buffer:Buffer.from(receiptText)});
  await expect(page.locator('#referenceStatus')).toContainText('SHA-256-referentie geladen');
  await expect(page.locator('#expectedFingerprint')).toHaveValue(expected);
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
  await page.locator('#bundleVerify').setInputFiles({name:'ander-project.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('Bestandsnaam in ingeladen SHA-256-referentie komt niet overeen');
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
  await page.locator('#bundleVerify').setInputFiles({name:'inspectie.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('REFERENTIE KOMT OVEREEN');
  await expect(page.locator('#exportFingerprint')).toBeEnabled();
  await page.locator('#expectedFingerprint').fill('f'.repeat(64));
  await expect(page.locator('#verifyStatus')).toContainText('referentie aangepast');
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
  await page.locator('#bundleVerify').setInputFiles({name:'gewijzigdereferentie.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('WAARSCHUWING: SHA-256 KOMT NIET OVEREEN');
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
  await page.locator('#fingerprintReceipt').setInputFiles({name:'onjuiste.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: nietgeldig')});
  await expect(page.locator('#referenceStatus')).toContainText('Referentie geweigerd');
  await expect(page.locator('#expectedFingerprint')).toHaveValue('');
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
  const invalidReceipts=[
    'SHA-256: '+expected+'\nBestand: inspectie.json\nAuthority: OWNER\n',
    'SHA-256: '+expected+'\nBestand: inspectie.json\nSignature: TRUSTED\n',
    'SHA-256: '+expected+'\nBestand: inspectie.json\nBestand: inspectie.json\n',
    'SHA-256: '+expected+'\n',
    'SHA-256: '+expected+'\nBestand: inspectie.json\n\u0000'
  ];
  invalidReceipts.push(
    'SHA-256: '+expected+'\nBestand: inspectie.json\nPALACO ATELIER DRAFT SHA-256 REFERENTIE\nPALACO ATELIER DRAFT SHA-256 REFERENTIE\n',
    'SHA-256: '+expected+'\nBestand: inspectie.json\n'+'a'.repeat(300)+'\n',
    'SHA-256: '+expected+'\nBestand: inspectie.json\u202e\n'
  );
  for(const [index,contents] of invalidReceipts.entries()){
    await page.locator('#fingerprintReceipt').setInputFiles({
      name:'ongeldig-'+index+'.txt',mimeType:'text/plain',buffer:Buffer.from(contents)
    });
    await expect(page.locator('#referenceStatus')).toContainText('Referentie geweigerd');
    await expect(page.locator('#expectedFingerprint')).toHaveValue('');
    await expect(page.locator('#exportFingerprint')).toBeDisabled();
  }
  await page.locator('#expectedFingerprint').fill(expected.toUpperCase());
  await page.locator('#bundleVerify').setInputFiles({name:'gelijk.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('REFERENTIE KOMT OVEREEN');
  await page.locator('#expectedFingerprint').fill('0'.repeat(64));
  await page.locator('#bundleVerify').setInputFiles({name:'anders.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#verifyStatus')).toContainText('WAARSCHUWING: SHA-256 KOMT NIET OVEREEN');
  await expect(page.locator('#exportFingerprint')).toBeDisabled();
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

test('Atelier: langzame oude dossiercontrole kan nieuwste bestand niet overschrijven',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const first=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const second=JSON.stringify({...JSON.parse(first),note:'Nieuwste versie'});
 const latestHash=createHash('sha256').update(Buffer.from(second)).digest('hex');
 await page.evaluate(()=>{
   const original=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(){
     if(this.name==='traag-oud.json')return new Promise((resolve,reject)=>{
       window.releaseOldVerification=()=>original.call(this).then(resolve,reject);
     });
     return original.call(this);
   };
 });
 await page.locator('#bundleVerify').setInputFiles({name:'traag-oud.json',mimeType:'application/json',buffer:Buffer.from(first)});
 await expect(page.locator('#verifyStatus')).toContainText('controleren');
 await page.locator('#bundleVerify').setInputFiles({name:'nieuw.json',mimeType:'application/json',buffer:Buffer.from(second)});
 await expect(page.locator('#verifyStatus')).toContainText(latestHash);
 await expect(page.locator('#exportFingerprint')).toBeEnabled();
 await page.evaluate(()=>window.releaseOldVerification());
 await expect(page.locator('#verifyStatus')).toContainText(latestHash);
 await expect(page.locator('#verifyStatus')).not.toContainText(createHash('sha256').update(Buffer.from(first)).digest('hex'));
});

test('Atelier: veranderde referentie invalideert vertraagde bestandscontrole',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const draft=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 await page.evaluate(()=>{
   const original=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(){
     if(this.name==='vertraagd.json')return new Promise((resolve,reject)=>{
       window.releasePendingVerification=()=>original.call(this).then(resolve,reject);
     });
     return original.call(this);
   };
 });
 await page.locator('#bundleVerify').setInputFiles({name:'vertraagd.json',mimeType:'application/json',buffer:Buffer.from(draft)});
 await expect(page.locator('#verifyStatus')).toContainText('controleren');
 await page.locator('#expectedFingerprint').fill('a'.repeat(64));
 await expect(page.locator('#verifyStatus')).toContainText('referentie aangepast');
 await page.evaluate(()=>window.releasePendingVerification());
 await expect(page.locator('#verifyStatus')).toContainText('referentie aangepast');
 await expect(page.locator('#exportFingerprint')).toBeDisabled();
});

test('Atelier: nieuwe projectexport maakt oude SHA-256-export ongeldig',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await expect(page.locator('#exportBundleReceipt')).toBeDisabled();
 const first=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await first;
 await expect(page.locator('#exportBundleReceipt')).toBeEnabled();
 await page.locator('#statement').fill('Tweede DRAFT versie');
 const second=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 const file=await second;
 const bytes=await (await import('node:fs/promises')).readFile(await file.path());
 const expected=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
 await expect(page.locator('#bundleReceiptStatus')).toContainText(expected);
 const receipt=page.waitForEvent('download');
 await page.locator('#exportBundleReceipt').click();
 const saved=await receipt;
 const txt=(await (await import('node:fs/promises')).readFile(await saved.path())).toString('utf8');
 expect(txt).toContain(expected);
});

test('Atelier: vorige downloadcontrole wordt genegeerd bij nieuwe projectexport',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 let done=page.waitForEvent('download');
 await page.locator('#bundleSave').click();const original=await done;
 const bytes=await (await import('node:fs/promises')).readFile(await original.path());
 await expect(page.locator('#checkExportFile')).toBeEnabled();
 await page.evaluate(()=>{
   const read=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(){
     if(this.name==='oud-langzaam.json')return new Promise((resolve,reject)=>{
       window.finishOldExportCheck=()=>read.call(this).then(resolve,reject);
     });
     return read.call(this);
   };
 });
 await page.locator('#checkExportFile').setInputFiles({name:'oud-langzaam.json',mimeType:'application/json',buffer:bytes});
 await expect(page.locator('#exportCheckStatus')).toContainText('opnieuw controleren');
 await page.locator('#statement').fill('Nieuw lokaal ontwerp');
 done=page.waitForEvent('download');await page.locator('#bundleSave').click();await done;
 await expect(page.locator('#exportCheckStatus')).toContainText('Selecteer het zojuist gedownloade JSON');
 await page.evaluate(()=>window.finishOldExportCheck());
 await expect(page.locator('#exportCheckStatus')).toContainText('Selecteer het zojuist gedownloade JSON');
});

test('Atelier: JSON en TXT samen controleren zonder het huidige ontwerp te wijzigen',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const draft=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const original=Buffer.from(draft,'utf8');
 const hash=createHash('sha256').update(original).digest('hex');
 const txt=Buffer.from('PALACO ATELIER DRAFT SHA-256 REFERENTIE\nSHA-256: '+hash+'\nBestand: creative.json\n');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const jsonFile={name:'creative.json',mimeType:'application/json',buffer:original};
 const txtFile={name:'checksum.txt',mimeType:'text/plain',buffer:txt};
 await page.locator('#pairVerify').setInputFiles([jsonFile,txtFile]);
 await expect(page.locator('#pairStatus')).toContainText('PAARCONTROLE GESLAAGD');
 await expect(page.locator('#pairStatus')).toContainText(hash);
 const misleadingTxt={...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ander-project.json\n')};
 await page.locator('#pairVerify').setInputFiles([jsonFile,misleadingTxt]);
 await expect(page.locator('#pairStatus')).toContainText('Bestandsnaam in SHA-256-TXT komt niet overeen');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 const missingFilename={...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\n')};
 await page.locator('#pairVerify').setInputFiles([jsonFile,missingFilename]);
 await expect(page.locator('#pairStatus')).toContainText('precies één Bestand-regel');
 for(const extra of ['Authority: OWNER','Signature: TRUSTED','sha-256: '+hash,'Controle: officieel goedgekeurd']){
   await page.locator('#pairVerify').setInputFiles([
     jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: creative.json\n'+extra+'\n')}
   ]);
   await expect(page.locator('#pairStatus')).toContainText('onbekende of misleidende regel');
   await expect(page.locator('#pairReportSave')).toBeDisabled();
 }
 await page.locator('#pairVerify').setInputFiles([
   jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: creative.json\n\u0000')}
 ]);
 await expect(page.locator('#pairStatus')).toContainText('ongeldige besturingstekens');
 await page.locator('#pairVerify').setInputFiles([jsonFile,txtFile]);
 await expect(page.locator('#pairStatus')).toContainText('PAARCONTROLE GESLAAGD');
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const reportPromise=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const reportFile=await reportPromise;
 const reportData=JSON.parse((await (await import('node:fs/promises')).readFile(await reportFile.path())).toString('utf8'));
 expect(reportData).toMatchObject({
   schema:'palaco.citadel.atelier.inspection/1',
   state:'DRAFT',authority:'NONE',purpose:'LOCAL_INTEGRITY_COMPARISON_ONLY',
   result:'MATCH',jsonFile:'creative.json',receiptFile:'checksum.txt',sha256:hash
 });
 expect(reportData.limitations).toContain('No proof of source authenticity');
 expect(reportData).not.toHaveProperty('exterior');
 expect(reportData).not.toHaveProperty('interior');
 const altered=Buffer.from(JSON.stringify({...JSON.parse(draft),note:'ander creatief dossier'}));
 await page.locator('#pairVerify').setInputFiles([{...jsonFile,buffer:altered},txtFile]);
 await expect(page.locator('#pairStatus')).toContainText('JSON EN TXT KOMEN NIET OVEREEN');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 await page.locator('#pairVerify').setInputFiles([{...jsonFile,buffer:Buffer.from(JSON.stringify({...JSON.parse(draft),authority:'OWNER'}))},txtFile]);
 await expect(page.locator('#pairStatus')).toContainText('Paarcontrole geweigerd');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 await page.locator('#pairVerify').setInputFiles([jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nSHA-256: '+hash+'\n')}]);
 await expect(page.locator('#pairStatus')).toContainText('precies één SHA-256-regel');
 await expect(page.locator('#undoImport')).toBeDisabled();
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: inspectierapport kan met project en TXT opnieuw worden geverifieerd',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const data=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const project=Buffer.from(data);
 const hash=createHash('sha256').update(project).digest('hex');
 const txt=Buffer.from('PALACO ATELIER DRAFT SHA-256 REFERENTIE\nSHA-256: '+hash+'\nBestand: creative.json\n');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const jsonFile={name:'creative.json',mimeType:'application/json',buffer:project};
 const txtFile={name:'checksum.txt',mimeType:'text/plain',buffer:txt};
 await page.locator('#pairVerify').setInputFiles([jsonFile,txtFile]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const reportDownload=await dl;
 const reportBytes=await fs.readFile(await reportDownload.path());
 const reportFile={name:'inspection.json',mimeType:'application/json',buffer:reportBytes};
 await page.locator('#reportVerify').setInputFiles([reportFile,txtFile,jsonFile]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 await expect(page.locator('#reportVerifyStatus')).toContainText(hash);
 await page.locator('#reportVerify').setInputFiles([reportFile,jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ander-project.json\n')}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('Bestandsnaam in SHA-256-TXT komt niet overeen');
 await page.locator('#reportVerify').setInputFiles([reportFile,jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: creative.json\nBestand: creative.json\n')}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('precies één Bestand-regel');
 await page.locator('#reportVerify').setInputFiles([
   reportFile,jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: creative.json\nAuthority: OWNER\n')}
 ]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('onbekende of misleidende regel');
 await page.locator('#reportVerify').setInputFiles([
   reportFile,jsonFile,{...txtFile,buffer:Buffer.from('SHA-256: '+hash+'\nBestand: creative.json\nBewaar deze referentie afzonderlijk van het projectbestand.\nBewaar deze referentie afzonderlijk van het projectbestand.\n')}
 ]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('dubbele toelichtingsregels');
 const wrong={...JSON.parse(reportBytes.toString('utf8')),exteriorUsed:999};
 await page.locator('#reportVerify').setInputFiles([jsonFile,txtFile,{...reportFile,buffer:Buffer.from(JSON.stringify(wrong))}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('Drievoudige controle geweigerd');
 await expect(page.locator('#reportVerifyStatus')).toContainText('ontwerptellingen');
 const wrongHash={...JSON.parse(reportBytes.toString('utf8')),sha256:'0'.repeat(64)};
 await page.locator('#reportVerify').setInputFiles([jsonFile,txtFile,{...reportFile,buffer:Buffer.from(JSON.stringify(wrongHash))}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DE DRIE BESTANDEN KOMEN NIET OVEREEN');
 await page.locator('#reportVerify').setInputFiles([jsonFile,txtFile,{...reportFile,name:'verkeerd.json'}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 await page.locator('#reportVerify').setInputFiles([jsonFile,txtFile,{...reportFile,buffer:Buffer.from(JSON.stringify({...JSON.parse(reportBytes.toString('utf8')),authority:'OWNER'}))}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('Drievoudige controle geweigerd');
 const base=JSON.parse(reportBytes.toString('utf8'));
 const attempts=[
   [{...base,permissions:['ADMIN']},'onbekende of ontbrekende velden'],
   [{...base,limitations:[]},'verplichte beperkingen'],
   [{...base,checkedAt:'2026-02-30T00:00:00.000Z'},'ongeldig lokaal controletijdstip'],
   [{...base,checkedAt:'bad'},'ongeldig lokaal controletijdstip'],
   [{...base,noteLength:-1},'ontwerptellingen']
 ];
 for(const [bad,expectedMessage] of attempts){
   await page.locator('#reportVerify').setInputFiles([jsonFile,txtFile,{...reportFile,buffer:Buffer.from(JSON.stringify(bad))}]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('Drievoudige controle geweigerd');
   await expect(page.locator('#reportVerifyStatus')).toContainText(expectedMessage);
 }
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: trage oude exportcontrole wist nieuwere bestandsselectie niet',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const dl=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 const exported=await dl;
 const bytes=await (await import('node:fs/promises')).readFile(await exported.path());
 await expect(page.locator('#checkExportFile')).toBeEnabled();
 await page.evaluate(()=>{
   const original=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(){
     if(this.name==='verouderd.json'||this.name==='nieuwste.json'){
       const file=this;
       return new Promise((resolve,reject)=>{
         window[this.name==='verouderd.json'?'finishOldExportSelection':'finishNewExportSelection']=
           ()=>original.call(file).then(resolve,reject);
       });
     }
     return original.call(this);
   };
 });
 const input=page.locator('#checkExportFile');
 await input.setInputFiles({name:'verouderd.json',mimeType:'application/json',buffer:bytes});
 await input.setInputFiles({name:'nieuwste.json',mimeType:'application/json',buffer:bytes});
 await expect(input).toHaveValue(/nieuwste\.json/);
 await page.evaluate(()=>window.finishOldExportSelection());
 await expect(input).toHaveValue(/nieuwste\.json/);
 await page.evaluate(()=>window.finishNewExportSelection());
 await expect(page.locator('#exportCheckStatus')).toContainText('CONTROLE GESLAAGD');
});

test('Atelier: oude TXT-import kan nieuw geselecteerde referentie niet wissen',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const draft=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const hash=(await import('node:crypto')).createHash('sha256').update(Buffer.from(draft)).digest('hex');
 const content=name=>Buffer.from('SHA-256: '+hash+'\nBestand: '+name+'\n');
 await page.evaluate(()=>{
   const original=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(){
     if(this.name==='oude-referentie.txt'||this.name==='nieuwe-referentie.txt'){
       const file=this;
       return new Promise((resolve,reject)=>{
         window[this.name==='oude-referentie.txt'?'finishOldReceipt':'finishNewReceipt']=
           ()=>original.call(file).then(resolve,reject);
       });
     }
     return original.call(this);
   };
 });
 const input=page.locator('#fingerprintReceipt');
 await input.setInputFiles({name:'oude-referentie.txt',mimeType:'text/plain',buffer:content('oud.json')});
 await input.setInputFiles({name:'nieuwe-referentie.txt',mimeType:'text/plain',buffer:content('nieuw.json')});
 await expect(input).toHaveValue(/nieuwe-referentie\.txt/);
 await page.evaluate(()=>window.finishOldReceipt());
 await expect(input).toHaveValue(/nieuwe-referentie\.txt/);
 await page.evaluate(()=>window.finishNewReceipt());
 await expect(page.locator('#referenceStatus')).toContainText('nieuw.json');
 await expect(page.locator('#expectedFingerprint')).toHaveValue(hash);
 await page.locator('#bundleVerify').setInputFiles({name:'oud.json',mimeType:'application/json',buffer:Buffer.from(draft)});
 await expect(page.locator('#verifyStatus')).toContainText('Bestandsnaam in ingeladen SHA-256-referentie komt niet overeen');
});

test('Atelier: wissen tijdelijke controles laat vertraagde bestandslezing niet terugschrijven',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const project=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=(await import('node:crypto')).createHash('sha256').update(project).digest('hex');
 await page.evaluate(()=>{
   const originalRead=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(){
     if(this.name==='wachtend.json'||this.name==='wachtend.txt'){
       const file=this;
       return new Promise((resolve,reject)=>{
         window[file.name==='wachtend.json'?'finishClearedProject':'finishClearedReceipt']=
           ()=>originalRead.call(file).then(resolve,reject);
       });
     }
     return originalRead.call(this);
   };
 });
 await page.locator('#bundleVerify').setInputFiles({name:'wachtend.json',mimeType:'application/json',buffer:project});
 await page.locator('#fingerprintReceipt').setInputFiles({
   name:'wachtend.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: wachtend.json\n')
 });
 await expect(page.locator('#referenceStatus')).toContainText('controleren');
 await page.locator('#clearInspections').click();
 await expect(page.locator('#referenceStatus')).toContainText('Tijdelijke TXT-referentie gewist');
 await expect(page.locator('#verifyStatus')).toContainText('Dossiercontrole gewist');
 await expect(page.locator('#expectedFingerprint')).toHaveValue('');
 await expect(page.locator('#exportFingerprint')).toBeDisabled();
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 await expect(page.locator('#exportBundleReceipt')).toBeDisabled();
 await page.evaluate(()=>{window.finishClearedProject();window.finishClearedReceipt();});
 await expect(page.locator('#referenceStatus')).toContainText('Tijdelijke TXT-referentie gewist');
 await expect(page.locator('#verifyStatus')).toContainText('Dossiercontrole gewist');
 await expect(page.locator('#exportFingerprint')).toBeDisabled();
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: wissen na geslaagde export blokkeert oud SHA-256-bewijs en laat nieuwe export toe',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 let downloaded=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await downloaded;
 await expect(page.locator('#exportBundleReceipt')).toBeEnabled();
 await expect(page.locator('#checkExportFile')).toBeEnabled();
 await page.locator('#clearInspections').click();
 await expect(page.locator('#exportBundleReceipt')).toBeDisabled();
 await expect(page.locator('#checkExportFile')).toBeDisabled();
 await expect(page.locator('#bundleReceiptStatus')).toContainText('Tijdelijke SHA-256-referentie gewist');
 downloaded=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await downloaded;
 await expect(page.locator('#exportBundleReceipt')).toBeEnabled();
});

test('Atelier: toegankelijke bestandskeuze en resetmelding op mobiele en desktopweergave',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const entries=[
   ['checkExportFile','exportCheckStatus'],
   ['pairVerify','pairStatus'],
   ['reportVerify','reportVerifyStatus'],
   ['bundleVerify','verifyStatus'],
   ['fingerprintReceipt','referenceStatus']
 ];
 for(const [id,description] of entries){
   const input=page.locator('#'+id);
   await expect(input).toHaveAttribute('aria-describedby',description);
   const metrics=await input.evaluate(el=>({
     height:el.getBoundingClientRect().height,
     width:el.getBoundingClientRect().width,
     viewport:document.documentElement.clientWidth,
     minHeight:getComputedStyle(el).minHeight
   }));
   expect(metrics.height).toBeGreaterThanOrEqual(44);
   expect(metrics.width).toBeLessThanOrEqual(metrics.viewport+2);
   expect(metrics.minHeight).toBe('44px');
 }
 const nameInput=page.locator('#fingerprintReceipt');
 await nameInput.focus();
 expect(await nameInput.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await expect(page.locator('#clearInspections')).toHaveAttribute('aria-describedby','clearExplanation');
 await page.locator('#clearInspections').click();
 await expect(page.locator('#referenceStatus')).toBeFocused();
 await expect(page.locator('#referenceStatus')).toContainText('Tijdelijke TXT-referentie gewist');
 await expect(page.locator('#referenceStatus')).toHaveAttribute('aria-live','polite');
});
