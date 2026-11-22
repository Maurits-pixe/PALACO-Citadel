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
 // Distinct content with equal filenames, ignoring case or Unicode composition, must not masquerade as independent dossier files.
 for(const collidingName of ['inspection.json','INSPECTION.JSON','InspectIon.JsOn']){
   await page.locator('#reportVerify').setInputFiles([reportFile,txtFile,{...jsonFile,name:collidingName}]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('verschillende JSON-bestandsnamen hebben');
   await expect(page.locator('#reportVerifyStatus')).toContainText('Drievoudige controle geweigerd');
   await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','rejected');
 }
 const composedReport={...reportFile,name:'café.json'};
 const unicodeNames=['cafe\u0301.json','CAFÉ.JSON'];
 for(const collidingName of unicodeNames){
   await page.locator('#reportVerify').setInputFiles([composedReport,txtFile,{...jsonFile,name:collidingName}]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('verschillende JSON-bestandsnamen hebben');
   await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','rejected');
 }
 await page.locator('#reportVerify').setInputFiles([reportFile,txtFile,jsonFile]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
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

test('Atelier: alle JSON-verificatieroutes weigeren misleidende bestandsnamen',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const data=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(data).digest('hex');
 const badNames=['misleidend\u202e.json','stil\u200b.json','begin\ufeff.json','mark\u061c.json','map\\ontwerp.json','map/ontwerp.json','CON.json','LPT1.json','COM¹.json','file?.json','naam .json','naam..json','CON .json','controle.txt','a'.repeat(121)+'.json'];
 for(const name of badNames){
   const file={name,mimeType:'application/json',buffer:data};
   await page.locator('#bundleVerify').setInputFiles(file);
   await expect(page.locator('#verifyStatus')).toContainText('Ongeldige of misleidende JSON-bestandsnaam');
   await expect(page.locator('#exportFingerprint')).toBeDisabled();
   await page.locator('#pairVerify').setInputFiles([
     file,{name:'controle.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: '+name+'\n')}
   ]);
   await expect(page.locator('#pairStatus')).toContainText('Paarcontrole geweigerd');
   await expect(page.locator('#pairReportSave')).toBeDisabled();
 }
 const validFile={name:'geldig.json',mimeType:'application/json',buffer:data};
 await page.locator('#bundleVerify').setInputFiles(validFile);
 await expect(page.locator('#verifyStatus')).toContainText('Geldig creatief DRAFT-project');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: losse TXT-referentie weigert onveilige bestandsnaam zonder SHA-256 te activeren',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const data=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(data).digest('hex');
 const names=['../overig.json','overig\\ontwerp.json','naam\u202e.json','onzichtbaar\u2060.json','zacht\u00ad.json','NUL.json','prn.json','port|naam.json','naam .json','naam..json','eindigt-op.txt','a'.repeat(121)+'.json'];
 for(const name of names){
   await page.locator('#fingerprintReceipt').setInputFiles({
     name:'bad-receipt.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: '+name+'\n')
   });
   await expect(page.locator('#referenceStatus')).toContainText('Referentie geweigerd');
   await expect(page.locator('#expectedFingerprint')).toHaveValue('');
   await expect(page.locator('#exportFingerprint')).toBeDisabled();
 }
 await page.locator('#fingerprintReceipt').setInputFiles({
   name:'valid-receipt.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: veilig.json\n')
 });
 await expect(page.locator('#referenceStatus')).toContainText('SHA-256-referentie geladen');
});

test('Atelier: annuleren na succesvolle paarcontrole maakt oud DRAFT-rapport ongeldig',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const snapshot=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const data=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(data).digest('hex');
 await page.locator('#pairVerify').setInputFiles([
   {name:'ontwerp.json',mimeType:'application/json',buffer:data},
   {name:'hash.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ontwerp.json\n')}
 ]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 await page.locator('#pairVerify').dispatchEvent('cancel');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 await expect(page.locator('#pairStatus')).toContainText('Bestandskeuze geannuleerd');
 await page.locator('#reportVerify').dispatchEvent('cancel');
 await expect(page.locator('#reportVerifyStatus')).toContainText('geen actuele drievoudige controle');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(snapshot);
});

test('Atelier: annuleren SHA-256-TXT of JSON trekt oude referentie en bewijsdownload in',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const data=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(data).digest('hex');
 const json={name:'ontwerp.json',mimeType:'application/json',buffer:data};
 await page.locator('#bundleVerify').setInputFiles(json);
 await expect(page.locator('#exportFingerprint')).toBeEnabled();
 await page.locator('#bundleVerify').dispatchEvent('cancel');
 await expect(page.locator('#exportFingerprint')).toBeDisabled();
 await expect(page.locator('#verifyStatus')).toContainText('Bestandskeuze geannuleerd');
 await page.locator('#fingerprintReceipt').setInputFiles({
   name:'controlebewijs.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ontwerp.json\n')
 });
 await expect(page.locator('#expectedFingerprint')).toHaveValue(hash);
 await page.locator('#fingerprintReceipt').dispatchEvent('cancel');
 await expect(page.locator('#expectedFingerprint')).toHaveValue('');
 await expect(page.locator('#exportFingerprint')).toBeDisabled();
 await expect(page.locator('#referenceStatus')).toContainText('Bestandskeuze geannuleerd');
 await page.locator('#bundleVerify').setInputFiles(json);
 await expect(page.locator('#verifyStatus')).toContainText('Geen eerdere referentie ingevoerd');
});

test('Atelier: annuleren exporthercontrole behoudt export maar markeert vergelijkingsresultaat ongeldig',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const dl=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 const exportFile=await dl;
 const bytes=await (await import('node:fs/promises')).readFile(await exportFile.path());
 await expect(page.locator('#exportBundleReceipt')).toBeEnabled();
 await page.locator('#checkExportFile').setInputFiles({
   name:'hercontrole.json',mimeType:'application/json',buffer:bytes
 });
 await expect(page.locator('#exportCheckStatus')).toContainText('CONTROLE GESLAAGD');
 await page.locator('#checkExportFile').dispatchEvent('cancel');
 await expect(page.locator('#exportCheckStatus')).toContainText('Bestandskeuze geannuleerd');
 await expect(page.locator('#exportBundleReceipt')).toBeEnabled();
});

test('Atelier: onveilige TXT-bestandsnamen worden geweigerd bij losse, paar- en drievoudige controle',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const jsonFile={name:'veilig.json',mimeType:'application/json',buffer:bytes};
 const txtBytes=Buffer.from('SHA-256: '+hash+'\nBestand: veilig.json\n');
 const goodTxt={name:'bewijs.txt',mimeType:'text/plain',buffer:txtBytes};
 await page.locator('#pairVerify').setInputFiles([jsonFile,goodTxt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const reportBytes=await fs.readFile(await (await dl).path());
 const reportFile={name:'rapport.json',mimeType:'application/json',buffer:reportBytes};
 for(const badName of ['bedrieglijk\u202e.txt','verborgen\u200d.txt','richting\u200f.txt','een map\\bewijs.txt','NUL.txt','COM2.txt','receipt?.txt','receipt .txt','receipt..txt','NUL .txt','a'.repeat(121)+'.txt']){
   const badTxt={...goodTxt,name:badName};
   await page.locator('#fingerprintReceipt').setInputFiles(badTxt);
   await expect(page.locator('#referenceStatus')).toContainText('Ongeldige of misleidende TXT-bestandsnaam');
   await expect(page.locator('#expectedFingerprint')).toHaveValue('');
   await page.locator('#pairVerify').setInputFiles([jsonFile,badTxt]);
   await expect(page.locator('#pairStatus')).toContainText('Ongeldige of misleidende TXT-bestandsnaam');
   await expect(page.locator('#pairReportSave')).toBeDisabled();
   await page.locator('#reportVerify').setInputFiles([jsonFile,reportFile,badTxt]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('Ongeldige of misleidende TXT-bestandsnaam');
 }
 await page.locator('#fingerprintReceipt').setInputFiles({...goodTxt,name:'ander.csv'});
 await expect(page.locator('#referenceStatus')).toContainText('Ongeldige of misleidende TXT-bestandsnaam');
 await page.locator('#pairVerify').setInputFiles([jsonFile,goodTxt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 await page.locator('#reportVerify').setInputFiles([jsonFile,reportFile,goodTxt]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 for(const badName of ['rapport\u202e.json','rapport\u200b.json','rapport\u034f.json','folder\\rapport.json','AUX.json','lpt9.json','report*.json','report .json','report..json','AUX .json',' rapport.json','a'.repeat(121)+'.json']){
   await page.locator('#reportVerify').setInputFiles([jsonFile,{...reportFile,name:badName},goodTxt]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('Drievoudige controle geweigerd');
   await expect(page.locator('#reportVerifyStatus')).toContainText('Ongeldige of misleidende JSON-bestandsnaam');
 }
 await page.locator('#reportVerify').setInputFiles([jsonFile,reportFile,goodTxt]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: SHA-256-TXT vereist vaste regelvolgorde en maximaal één PALACO-header',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const project={name:'creatief.json',mimeType:'application/json',buffer:bytes};
 const base='SHA-256: '+hash+'\nBestand: creatief.json\n';
 const txt={name:'referentie.txt',mimeType:'text/plain',buffer:Buffer.from(base)};
 await page.locator('#pairVerify').setInputFiles([project,txt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const reportPromise=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const report={name:'inspectie.json',mimeType:'application/json',buffer:await fs.readFile(await (await reportPromise).path())};
 const invalid=[
   'Bestand: creatief.json\nSHA-256: '+hash+'\n',
   'PALACO ATELIER DRAFT SHA-256 REFERENTIE\n'+base+'PALACO ATELIER · DRAFT SHA-256 REFERENTIE\n',
   base+'PALACO ATELIER DRAFT SHA-256 REFERENTIE\n',
   'Controle: bestandsbytes, geen digitale handtekening of officiële goedkeuring.\n'+base,
   base+'Bewaar deze referentie afzonderlijk van het projectbestand.\nControle: bestandsbytes, geen digitale handtekening of officiële goedkeuring.\n'
 ];
 for(const contents of invalid){
   const altered={...txt,buffer:Buffer.from(contents)};
   await page.locator('#fingerprintReceipt').setInputFiles(altered);
   await expect(page.locator('#referenceStatus')).toContainText('ongeldige regelvolgorde');
   await expect(page.locator('#expectedFingerprint')).toHaveValue('');
   await page.locator('#pairVerify').setInputFiles([project,altered]);
   await expect(page.locator('#pairStatus')).toContainText('ongeldige regelvolgorde');
   await expect(page.locator('#pairReportSave')).toBeDisabled();
   await page.locator('#reportVerify').setInputFiles([report,project,altered]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('ongeldige regelvolgorde');
 }
 await page.locator('#pairVerify').setInputFiles([project,txt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 await page.locator('#reportVerify').setInputFiles([report,project,txt]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: lege TXT-regels worden geweigerd, enkel afsluitend regeleinde blijft geldig',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const json={name:'creatief.json',mimeType:'application/json',buffer:bytes};
 const base='SHA-256: '+hash+'\nBestand: creatief.json\n';
 const txt={name:'bewijs.txt',mimeType:'text/plain',buffer:Buffer.from(base)};
 await page.locator('#pairVerify').setInputFiles([json,txt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const report={name:'inspectie.json',mimeType:'application/json',buffer:await fs.readFile(await (await dl).path())};
 const invalid=[
   '\n'+base,
   'SHA-256: '+hash+'\n\nBestand: creatief.json\n',
   base+'\n',
   'PALACO ATELIER DRAFT SHA-256 REFERENTIE\n\n'+base,
   base+'Controle: bestandsbytes, geen digitale handtekening of officiële goedkeuring.\n\nBewaar deze referentie afzonderlijk van het projectbestand.\n'
 ];
 for(const contents of invalid){
   const changed={...txt,buffer:Buffer.from(contents)};
   await page.locator('#fingerprintReceipt').setInputFiles(changed);
   await expect(page.locator('#referenceStatus')).toContainText('lege of extra regels');
   await expect(page.locator('#expectedFingerprint')).toHaveValue('');
   await page.locator('#pairVerify').setInputFiles([json,changed]);
   await expect(page.locator('#pairStatus')).toContainText('lege of extra regels');
   await expect(page.locator('#pairReportSave')).toBeDisabled();
   await page.locator('#reportVerify').setInputFiles([json,report,changed]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('lege of extra regels');
 }
 for(const [i,contents] of [base,base.replaceAll('\n','\r\n'),base.trimEnd()].entries()){
   const valid={name:'geldig-'+i+'.txt',mimeType:'text/plain',buffer:Buffer.from(contents)};
   await page.locator('#fingerprintReceipt').setInputFiles(valid);
   await expect(page.locator('#referenceStatus')).toContainText('SHA-256-referentie geladen');
   await page.locator('#pairVerify').setInputFiles([json,valid]);
   await expect(page.locator('#pairReportSave')).toBeEnabled();
 }
 await page.locator('#reportVerify').setInputFiles([json,report,txt]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: drievoudig inspectiepaneel toont MATCH, MISMATCH, GEWEIGERD en reset read-only',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const project={name:'ontwerp.json',mimeType:'application/json',buffer:bytes};
 const receipt={name:'checksum.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ontwerp.json\n')};
 const panel=page.locator('#inspectionResult');
 await expect(panel).toHaveAttribute('data-result','idle');
 await expect(page.locator('#inspectionResultTitle')).toContainText('Nog geen actuele controle');
 await page.locator('#pairVerify').setInputFiles([project,receipt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const reportBytes=await fs.readFile(await (await dl).path());
 const report={name:'rapport.json',mimeType:'application/json',buffer:reportBytes};
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await expect(panel).toHaveAttribute('data-result','match');
 await expect(page.locator('#inspectionResultTitle')).toContainText('MATCH');
 await expect(page.locator('#inspectionResultDetail')).toContainText('ontwerp.json');
 await expect(page.locator('#inspectionResultDetail')).toContainText('checksum.txt');
 await expect(page.locator('#inspectionResultDetail')).toContainText('rapport.json');
 await expect(page.locator('#inspectionResultDetail')).toContainText('AUTHORITY NONE');
 await page.locator('#reportVerify').setInputFiles([
   project,receipt,{...report,buffer:Buffer.from(JSON.stringify({...JSON.parse(reportBytes.toString('utf8')),sha256:'0'.repeat(64)}))}
 ]);
 await expect(panel).toHaveAttribute('data-result','mismatch');
 await expect(page.locator('#inspectionResultTitle')).toContainText('MISMATCH');
 await page.locator('#reportVerify').setInputFiles([project,receipt,{...report,buffer:Buffer.from('not-json')}]);
 await expect(panel).toHaveAttribute('data-result','rejected');
 await expect(page.locator('#inspectionResultTitle')).toContainText('GEWEIGERD');
 await page.locator('#reportVerify').dispatchEvent('cancel');
 await expect(panel).toHaveAttribute('data-result','idle');
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await expect(panel).toHaveAttribute('data-result','match');
 await page.locator('#clearInspections').click();
 await expect(panel).toHaveAttribute('data-result','idle');
 await expect(page.locator('#inspectionResultDetail')).toContainText('gewist');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: drie SHA-256-waarden zichtbaar bij match en mismatch maar gewist na annuleren',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const project={name:'design.json',mimeType:'application/json',buffer:bytes};
 const receipt={name:'receipt.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: design.json\n')};
 await page.locator('#pairVerify').setInputFiles([project,receipt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const reportBytes=await fs.readFile(await (await dl).path());
 const report={name:'inspection.json',mimeType:'application/json',buffer:reportBytes};
 const comparison=page.locator('#inspectionHashes');
 await expect(comparison).toBeHidden();
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','match');
 await expect(comparison).toBeVisible();
 await expect(page.locator('#inspectionHashActual')).toHaveText(hash);
 await expect(page.locator('#inspectionHashReceipt')).toHaveText(hash);
 await expect(page.locator('#inspectionHashReport')).toHaveText(hash);
 const wrongHash='0'.repeat(64);
 await page.locator('#reportVerify').setInputFiles([
   project,receipt,{...report,buffer:Buffer.from(JSON.stringify({...JSON.parse(reportBytes.toString('utf8')),sha256:wrongHash}))}
 ]);
 await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','mismatch');
 await expect(page.locator('#inspectionHashActual')).toHaveText(hash);
 await expect(page.locator('#inspectionHashReceipt')).toHaveText(hash);
 await expect(page.locator('#inspectionHashReport')).toHaveText(wrongHash);
 await page.locator('#reportVerify').setInputFiles([project,receipt,{...report,buffer:Buffer.from('broken')}]);
 await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','rejected');
 await expect(comparison).toBeHidden();
 await expect(page.locator('#inspectionHashActual')).toHaveText('');
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await expect(comparison).toBeVisible();
 await page.locator('#reportVerify').dispatchEvent('cancel');
 await expect(comparison).toBeHidden();
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await expect(comparison).toBeVisible();
 await page.locator('#clearInspections').click();
 await expect(comparison).toBeHidden();
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: dubbele top-level JSON-velden en Unicode-aliassen worden bij dossiercontrole geweigerd',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const project={name:'ontwerp.json',mimeType:'application/json',buffer:bytes};
 const txt={name:'bewijs.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ontwerp.json\n')};
 await page.locator('#pairVerify').setInputFiles([project,txt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const saved=await fs.readFile(await (await dl).path());
 const raw=JSON.stringify(JSON.parse(saved.toString('utf8')));
 const report={name:'inspectie.json',mimeType:'application/json',buffer:Buffer.from(raw)};
 await page.locator('#reportVerify').setInputFiles([project,txt,report]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 const invalid=[
   '{"authority":"OWNER",'+raw.slice(1),
   '{"result":"REJECTED",'+raw.slice(1),
   '{"sha256":"'+('f'.repeat(64))+'",'+raw.slice(1),
   '{"\\u0061uthority":"OWNER",'+raw.slice(1)
 ];
 for(const malformed of invalid){
   await page.locator('#reportVerify').setInputFiles([
     project,txt,{...report,buffer:Buffer.from(malformed)}
   ]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('Dossier-JSON bevat dubbele velden');
   await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','rejected');
   await expect(page.locator('#inspectionHashes')).toBeHidden();
 }
 const escapedKey=raw.replace('"authority"','"\\u0061uthority"');
 await page.locator('#reportVerify').setInputFiles([project,txt,{...report,buffer:Buffer.from(escapedKey)}]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: brongewijze SHA-256-afwijkingen zijn afzonderlijk zichtbaar en verdwijnen bij reset',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const bytes=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const project={name:'ontwerp.json',mimeType:'application/json',buffer:bytes};
 const receipt={name:'referentie.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: ontwerp.json\n')};
 await page.locator('#pairVerify').setInputFiles([project,receipt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const reportBytes=await fs.readFile(await (await dl).path());
 const report={name:'rapport.json',mimeType:'application/json',buffer:reportBytes};
 const receiptVerdict=page.locator('#inspectionReceiptMatch');
 const reportVerdict=page.locator('#inspectionReportMatch');
 const check=async (txtLabel,reportLabel)=>{
   await expect(receiptVerdict).toHaveText(txtLabel);
   await expect(reportVerdict).toHaveText(reportLabel);
 };
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await check('KOMT OVEREEN','KOMT OVEREEN');
 await expect(receiptVerdict).toHaveAttribute('data-match','yes');
 await expect(reportVerdict).toHaveAttribute('data-match','yes');
 const wrong='f'.repeat(64);
 const changedReceipt={...receipt,buffer:Buffer.from('SHA-256: '+wrong+'\nBestand: ontwerp.json\n')};
 await page.locator('#reportVerify').setInputFiles([project,changedReceipt,report]);
 await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','mismatch');
 await check('WIJKT AF','KOMT OVEREEN');
 await expect(receiptVerdict).toHaveAttribute('data-match','no');
 const changedReport={...report,buffer:Buffer.from(JSON.stringify({...JSON.parse(reportBytes.toString('utf8')),sha256:wrong}))};
 await page.locator('#reportVerify').setInputFiles([project,receipt,changedReport]);
 await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','mismatch');
 await check('KOMT OVEREEN','WIJKT AF');
 await page.locator('#reportVerify').setInputFiles([project,changedReceipt,changedReport]);
 await check('WIJKT AF','WIJKT AF');
 await page.locator('#reportVerify').dispatchEvent('cancel');
 await check('','');
 await expect(receiptVerdict).not.toHaveAttribute('data-match','no');
 await page.locator('#reportVerify').setInputFiles([project,receipt,report]);
 await check('KOMT OVEREEN','KOMT OVEREEN');
 await page.locator('#clearInspections').click();
 await check('','');
 await expect(page.locator('#inspectionHashes')).toBeHidden();
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: dubbele geneste JSON-sleutels en Unicode-aliassen worden in beide dossierbestanden geweigerd',async ({page})=>{
 const {createHash}=await import('node:crypto');
 const fs=await import('node:fs/promises');
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const rawProject=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const projectBytes=Buffer.from(rawProject);
 const hash=createHash('sha256').update(projectBytes).digest('hex');
 const project={name:'atelier.json',mimeType:'application/json',buffer:projectBytes};
 const txt={name:'referentie.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: atelier.json\n')};
 await page.locator('#pairVerify').setInputFiles([project,txt]);
 await expect(page.locator('#pairReportSave')).toBeEnabled();
 const dl=page.waitForEvent('download');
 await page.locator('#pairReportSave').click();
 const report={name:'inspectie.json',mimeType:'application/json',buffer:await fs.readFile(await (await dl).path())};
 await page.locator('#reportVerify').setInputFiles([project,txt,report]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 const badNested=[
   '{"nested":{"status":"DRAFT","status":"APPROVED"}}',
   '{"nested":[{"authority":"NONE","authority":"OWNER"}]}',
   '{"nested":{"authority":"NONE","\\u0061uthority":"OWNER"}}',
   '{"nested":{"inner":{"sha256":"a","sha256":"b"}}}'
 ];
 for(const addition of badNested){
   const reportText=JSON.stringify({...JSON.parse(report.buffer.toString('utf8')),probe:JSON.parse(addition)});
   // JSON.stringify would remove duplicate keys, so append the unmodified raw nested object.
   const withDuplicate=reportText.replace('"probe":'+JSON.stringify(JSON.parse(addition)),'"probe":'+addition);
   await page.locator('#reportVerify').setInputFiles([project,txt,{...report,buffer:Buffer.from(withDuplicate)}]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('Dossier-JSON bevat dubbele velden');
   await expect(page.locator('#inspectionResult')).toHaveAttribute('data-result','rejected');
   await expect(page.locator('#inspectionHashes')).toBeHidden();
 }
 const nestedProject=rawProject.slice(0,-1)+',"untrusted":{"x":1,"x":2}}';
 await page.locator('#reportVerify').setInputFiles([
   {...project,buffer:Buffer.from(nestedProject)},txt,report
 ]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('Dossier-JSON bevat dubbele velden');
 await page.locator('#reportVerify').setInputFiles([project,txt,report]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('DRIEVOUDIGE CONTROLE GESLAAGD');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: dubbele geneste JSON-sleutels worden ook bij losse, paar-, export- en herstelcontrole geweigerd',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const malformed=valid.slice(0,-1)+',"probe":[{"authority":"NONE","\\u0061uthority":"OWNER"}]}';
 const bytes=Buffer.from(malformed);
 const hash=createHash('sha256').update(bytes).digest('hex');
 const json={name:'dossier.json',mimeType:'application/json',buffer:bytes};
 const receipt={name:'bewijs.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: dossier.json\n')};
 await page.locator('#bundleVerify').setInputFiles(json);
 await expect(page.locator('#verifyStatus')).toContainText('Dossier-JSON bevat dubbele velden');
 await expect(page.locator('#exportFingerprint')).toBeDisabled();
 await page.locator('#pairVerify').setInputFiles([json,receipt]);
 await expect(page.locator('#pairStatus')).toContainText('Dossier-JSON bevat dubbele velden');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 await page.locator('#bundleImport').setInputFiles(json);
 await expect(page.locator('#bundleStatus')).toContainText('Dossier-JSON bevat dubbele velden');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 const dl=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await dl;
 await expect(page.locator('#checkExportFile')).toBeEnabled();
 await page.locator('#checkExportFile').setInputFiles(json);
 await expect(page.locator('#exportCheckStatus')).toContainText('Dossier-JSON bevat dubbele velden');
 await page.locator('#bundleVerify').setInputFiles({...json,buffer:Buffer.from(valid)});
 await expect(page.locator('#verifyStatus')).toContainText('Geldig creatief DRAFT-project');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: maximum 64 JSON-niveaus vóór parsing, ook bij controles en herstel',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const original=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const nested=level=>'['.repeat(level)+'0'+']'.repeat(level);
 const deep=valid.slice(0,-1)+',"probe":'+nested(65)+'}';
 const bytes=Buffer.from(deep);
 const json={name:'diep.json',mimeType:'application/json',buffer:bytes};
 const hash=createHash('sha256').update(bytes).digest('hex');
 const txt={name:'controle.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: diep.json\n')};
 await page.locator('#bundleVerify').setInputFiles(json);
 await expect(page.locator('#verifyStatus')).toContainText('maximale nestingdiepte van 64');
 await page.locator('#pairVerify').setInputFiles([json,txt]);
 await expect(page.locator('#pairStatus')).toContainText('maximale nestingdiepte van 64');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 await page.locator('#bundleImport').setInputFiles(json);
 await expect(page.locator('#bundleStatus')).toContainText('maximale nestingdiepte van 64');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
 const dl=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await dl;
 await page.locator('#checkExportFile').setInputFiles(json);
 await expect(page.locator('#exportCheckStatus')).toContainText('maximale nestingdiepte van 64');
 await page.locator('#reportVerify').setInputFiles([
   json,txt,{name:'rapport.json',mimeType:'application/json',buffer:Buffer.from('{}')}
 ]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('maximale nestingdiepte van 64');
 // Braces in a JSON string are not structural depth; exactly 64 brackets must not trigger the depth guard.
 const borderline=valid.slice(0,-1)+',"probe":'+nested(63)+'}';
 await page.locator('#bundleVerify').setInputFiles({...json,buffer:Buffer.from(borderline)});
 await expect(page.locator('#verifyStatus')).not.toContainText('maximale nestingdiepte van 64');
 await page.locator('#bundleVerify').setInputFiles({name:'gewoon.json',mimeType:'application/json',buffer:Buffer.from(valid)});
 await expect(page.locator('#verifyStatus')).toContainText('Geldig creatief DRAFT-project');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(original);
});

test('Atelier: maximum 4096 JSON-objectvelden vóór parsing in alle dossierinvoer',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const props=length=>'{'+Array.from({length},(_,i)=>'"field'+i+'":0').join(',')+'}';
 const overload=valid.slice(0,-1)+',"probe":'+props(4097)+'}';
 const bytes=Buffer.from(overload);
 const project={name:'te-veel-velden.json',mimeType:'application/json',buffer:bytes};
 const hash=createHash('sha256').update(bytes).digest('hex');
 const receipt={name:'bewijs.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+hash+'\nBestand: te-veel-velden.json\n')};
 for(const [selector,status] of [
   ['#bundleVerify','#verifyStatus'],
   ['#bundleImport','#bundleStatus']
 ]){
   await page.locator(selector).setInputFiles(project);
   await expect(page.locator(status)).toContainText('maximum van 4096 objectvelden');
 }
 await page.locator('#pairVerify').setInputFiles([project,receipt]);
 await expect(page.locator('#pairStatus')).toContainText('maximum van 4096 objectvelden');
 await expect(page.locator('#pairReportSave')).toBeDisabled();
 const download=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await download;
 await page.locator('#checkExportFile').setInputFiles(project);
 await expect(page.locator('#exportCheckStatus')).toContainText('maximum van 4096 objectvelden');
 await page.locator('#reportVerify').setInputFiles([
   project,receipt,{name:'rapport.json',mimeType:'application/json',buffer:Buffer.from('{}')}
 ]);
 await expect(page.locator('#reportVerifyStatus')).toContainText('maximum van 4096 objectvelden');
 const below=valid.slice(0,-1)+',"probe":'+props(100)+'}';
 await page.locator('#bundleVerify').setInputFiles({...project,buffer:Buffer.from(below)});
 await expect(page.locator('#verifyStatus')).not.toContainText('maximum van 4096 objectvelden');
 await page.locator('#bundleVerify').setInputFiles({name:'geldig.json',mimeType:'application/json',buffer:Buffer.from(valid)});
 await expect(page.locator('#verifyStatus')).toContainText('Geldig creatief DRAFT-project');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: JSON-objectvelden maximaal 256 tekens, ook Unicode-escaped en in geneste objecten',async ({page})=>{
 const {createHash}=await import('node:crypto');
 await page.goto('/atelier/regiekamer.html');
 const baseline=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage)));
 const extra=key=>valid.slice(0,-1)+',"probe":{"'+key+'":0}}';
 const tooLong='x'.repeat(257);
 const escaped='\\u0078'.repeat(257);
 const rejected=[extra(tooLong),extra(escaped)];
 for(const raw of rejected){
   const bytes=Buffer.from(raw);
   const json={name:'te-lange-sleutel.json',mimeType:'application/json',buffer:bytes};
   const digest=createHash('sha256').update(bytes).digest('hex');
   const txt={name:'bewijs.txt',mimeType:'text/plain',buffer:Buffer.from('SHA-256: '+digest+'\nBestand: te-lange-sleutel.json\n')};
   await page.locator('#bundleVerify').setInputFiles(json);
   await expect(page.locator('#verifyStatus')).toContainText('veldnaam langer dan 256 tekens');
   await page.locator('#pairVerify').setInputFiles([json,txt]);
   await expect(page.locator('#pairStatus')).toContainText('veldnaam langer dan 256 tekens');
   await expect(page.locator('#pairReportSave')).toBeDisabled();
   await page.locator('#bundleImport').setInputFiles(json);
   await expect(page.locator('#bundleStatus')).toContainText('veldnaam langer dan 256 tekens');
   await page.locator('#reportVerify').setInputFiles([json,txt,{name:'inspectie.json',mimeType:'application/json',buffer:Buffer.from('{}')}]);
   await expect(page.locator('#reportVerifyStatus')).toContainText('veldnaam langer dan 256 tekens');
 }
 const download=page.waitForEvent('download');
 await page.locator('#bundleSave').click();
 await download;
 await page.locator('#checkExportFile').setInputFiles({
   name:'export.json',mimeType:'application/json',buffer:Buffer.from(extra(tooLong))
 });
 await expect(page.locator('#exportCheckStatus')).toContainText('veldnaam langer dan 256 tekens');
 // A long ordinary string VALUE is not a field name; exactly 256 key characters pass the scanner.
 const withinLimit=extra('x'.repeat(256));
 await page.locator('#bundleVerify').setInputFiles({name:'grens.json',mimeType:'application/json',buffer:Buffer.from(withinLimit)});
 await expect(page.locator('#verifyStatus')).not.toContainText('veldnaam langer dan 256 tekens');
 await page.locator('#bundleVerify').setInputFiles({name:'geldig.json',mimeType:'application/json',buffer:Buffer.from(valid)});
 await expect(page.locator('#verifyStatus')).toContainText('Geldig creatief DRAFT-project');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(baseline);
});

test('Atelier: lokale import weigert beschadigde UTF-8-bytes zonder herstel of stille tekstvervanging',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const project=await page.evaluate(()=>window.PalacoAtelierBundle.read(localStorage));
 const original=Buffer.from(JSON.stringify({...project,note:'SCHILDERIJ'}),'utf8');
 const marker=Buffer.from('SCHILDERIJ');
 const offset=original.indexOf(marker);
 expect(offset).toBeGreaterThan(0);
 const malformedBytes=[
   Buffer.from(original),
   Buffer.from(original),
   Buffer.from(original)
 ];
 malformedBytes[0][offset]=0xff;
 malformedBytes[1][offset]=0xc3;
 malformedBytes[1][offset+1]=0x28;
 malformedBytes[2][offset]=0xed;
 malformedBytes[2][offset+1]=0xa0;
 malformedBytes[2][offset+2]=0x80;
 let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
 for(const buffer of malformedBytes){
   await page.locator('#bundleImport').setInputFiles({name:'beschadigd.json',mimeType:'application/json',buffer});
   await expect(page.locator('#bundleStatus')).toContainText('Herstel geweigerd: Projectbestand bevat ongeldige UTF-8-bytes');
   expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 }
 expect(dialogs).toBe(0);
 const valid=Buffer.from(JSON.stringify({...project,note:'Muzenhof — café en tuinen 🌿'}),'utf8');
 await page.locator('#bundleImport').setInputFiles({name:'geldig.json',mimeType:'application/json',buffer:valid});
 await expect(page.locator('#bundleStatus')).toContainText('DRAFT-pakket');
 expect(dialogs).toBe(1);
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: trage import wordt genegeerd na nieuw bestand, annulering en controle-reset',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
 await page.evaluate(()=>{
   const native=File.prototype.arrayBuffer;
   window.atelierPendingImports=[];
   File.prototype.arrayBuffer=function(){
     if(this.name.startsWith('traag-')){
       return new Promise((resolve,reject)=>{
         window.atelierPendingImports.push(()=>native.call(this).then(resolve,reject));
       });
     }
     return native.call(this);
   };
 });
 const input=page.locator('#bundleImport');
 await input.setInputFiles({name:'traag-eerst.json',mimeType:'application/json',buffer:valid});
 await expect.poll(()=>page.evaluate(()=>window.atelierPendingImports.length)).toBe(1);
 await input.setInputFiles({name:'nieuw.json',mimeType:'application/json',buffer:valid});
 await expect(page.locator('#bundleStatus')).toContainText('DRAFT-pakket');
 const currentStatus=await page.locator('#bundleStatus').textContent();
 await page.evaluate(()=>window.atelierPendingImports.shift()());
 await expect(page.locator('#bundleStatus')).toHaveText(currentStatus);
 expect(dialogs).toBe(1);
 await input.setInputFiles({name:'traag-annuleer.json',mimeType:'application/json',buffer:valid});
 await expect.poll(()=>page.evaluate(()=>window.atelierPendingImports.length)).toBe(1);
 await input.dispatchEvent('cancel');
 await expect(page.locator('#bundleStatus')).toContainText('Projectimport geannuleerd');
 await page.evaluate(()=>window.atelierPendingImports.shift()());
 await expect(page.locator('#bundleStatus')).toContainText('Projectimport geannuleerd');
 expect(dialogs).toBe(1);
 await input.setInputFiles({name:'traag-reset.json',mimeType:'application/json',buffer:valid});
 await expect.poll(()=>page.evaluate(()=>window.atelierPendingImports.length)).toBe(1);
 await page.locator('#clearInspections').click();
 await expect(page.locator('#bundleStatus')).toContainText('Tijdelijke controle-uitkomsten gewist');
 await page.evaluate(()=>window.atelierPendingImports.shift()());
 await expect(page.locator('#bundleStatus')).toContainText('Tijdelijke controle-uitkomsten gewist');
 expect(dialogs).toBe(1);
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});

test('Atelier: ander tabblad trekt lopende bestandsimport in vóór herstel',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const valid=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 await page.evaluate(()=>{
   const native=File.prototype.arrayBuffer;
   window.pendingCrossTab=[];
   File.prototype.arrayBuffer=function(){
     if(this.name==='traag-ander-tabblad.json')
       return new Promise((resolve,reject)=>window.pendingCrossTab.push(()=>native.call(this).then(resolve,reject)));
     return native.call(this);
   };
 });
 let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await page.locator('#bundleImport').setInputFiles({name:'traag-ander-tabblad.json',mimeType:'application/json',buffer:valid});
 await expect.poll(()=>page.evaluate(()=>window.pendingCrossTab.length)).toBe(1);
 await other.locator('#statement').fill('Werk uit ander tabblad, aangepast');
 await other.locator('#saveNote').click();
 await expect(page.locator('#bundleStatus')).toContainText('Projectimport onderbroken');
 await page.evaluate(()=>window.pendingCrossTab.shift()());
 await expect(page.locator('#bundleStatus')).toContainText('Projectimport onderbroken');
 expect(dialogs).toBe(0);
 await expect(page.locator('#statement')).toHaveValue('Werk uit ander tabblad, aangepast');
 await other.close();
});


test('Atelier v6.8: lokale notitiebewerking annuleert een vertraagde import zonder herstel',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 await page.evaluate(()=>{
   const native=File.prototype.arrayBuffer;
   window.pendingLocalEdit=[];
   File.prototype.arrayBuffer=function(){
     if(this.name==='traag-lokale-bewerking.json')
       return new Promise((resolve,reject)=>window.pendingLocalEdit.push(()=>native.call(this).then(resolve,reject)));
     return native.call(this);
   };
 });
 let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
 await page.locator('#bundleImport').setInputFiles({name:'traag-lokale-bewerking.json',mimeType:'application/json',buffer:valid});
 await expect.poll(()=>page.evaluate(()=>window.pendingLocalEdit.length)).toBe(1);
 await page.locator('#statement').fill('Mijn onopgeslagen ontwerpwijziging');
 await expect(page.locator('#bundleStatus')).toContainText('Projectimport onderbroken');
 await expect(page.locator('#bundleImport')).toHaveValue('');
 await page.evaluate(()=>window.pendingLocalEdit.shift()());
 await expect(page.locator('#bundleStatus')).toContainText('de ontwerpnotitie is tijdens het lezen aangepast');
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen ontwerpwijziging');
 expect(dialogs).toBe(0);
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});


test('Atelier v6.9: import weigert onveilige bestandsnamen vóór herstel',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
 for(const name of ['ontwerp.txt','ontwerp..json','CON.json','ontwerp\\u200B.json']){
   await page.locator('#bundleImport').setInputFiles({name,mimeType:'application/json',buffer:valid});
   await expect(page.locator('#bundleStatus')).toContainText('Ongeldige of misleidende JSON-bestandsnaam');
   expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 }
 expect(dialogs).toBe(0);
 await page.locator('#bundleImport').setInputFiles({name:'Geldig-ontwerp.json',mimeType:'application/json',buffer:valid});
 await expect(page.locator('#bundleStatus')).toContainText('DRAFT-pakket');
 await expect.poll(()=>dialogs).toBe(1);
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
});


test('Atelier v6.12: import weigert gewijzigde herstelkopie tussen preview en bevestiging',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 const valid=Buffer.from(await page.evaluate(()=>JSON.stringify(window.PalacoAtelierBundle.read(localStorage))));
 await page.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   window.confirm=()=>{
     localStorage.setItem(api.RECOVERY,'concurrent-herstelpunt');
     return true;
   };
 });
 await page.locator('#bundleImport').setInputFiles({name:'ontwerp.json',mimeType:'application/json',buffer:valid});
 await expect(page.locator('#bundleStatus')).toContainText('Herstelkopie gewijzigd sinds de controle');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.RECOVERY))).toBe('concurrent-herstelpunt');
});


test('Atelier v6.14: undo weigert een herstelkopie vervangen tijdens de bevestiging',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   localStorage.setItem(api.NOTE,'origineel ontwerp');
   api.restoreWithRecovery(localStorage,api.create(null,null,'actueel ontwerp'));
 });
 await page.reload();
 await expect(page.locator('#undoImport')).toBeEnabled();
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 await page.evaluate(()=>{
   window.confirm=()=>{
     const api=window.PalacoAtelierBundle;
     const modified=JSON.parse(localStorage.getItem(api.RECOVERY));
     modified.draft.note='nieuw herstelpunt uit ander tabblad';
     localStorage.setItem(api.RECOVERY,JSON.stringify(modified));
     return true;
   };
 });
 await page.locator('#undoImport').click();
 await expect(page.locator('#bundleStatus')).toContainText('Herstelkopie gewijzigd sinds het herstelvoorstel');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(window.PalacoAtelierBundle.RECOVERY)).draft.note)).toBe('nieuw herstelpunt uit ander tabblad');
});


test('Atelier v6.15: andere tab overschrijft geen onopgeslagen ontwerpnotitie',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn onopgeslagen creatieve notitie');
 await other.locator('#statement').fill('Wijziging uit tweede tabblad');
 await other.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Je onopgeslagen tekst blijft staan');
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen creatieve notitie');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Wijziging uit tweede tabblad');
 // A manual edit matching the stored text does not acknowledge an earlier conflict.
 // Reload explicitly adopts the persisted revision and resets the save baseline.
 await page.reload();
 await expect(page.locator('#statement')).toHaveValue('Wijziging uit tweede tabblad');
 await other.locator('#statement').fill('Vervolgwijziging in tweede tabblad');
 await other.locator('#saveNote').click();
 await expect(page.locator('#statement')).toHaveValue('Vervolgwijziging in tweede tabblad');
 await expect(page.locator('#feedback')).toContainText('bijgewerkt vanuit een ander tabblad');
 await other.close();
});


test('Atelier v6.16: opslaan weigert een conflicterende notitie uit ander tabblad',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn onopgeslagen versie');
 await other.locator('#statement').fill('Nieuwere bewaarde versie');
 await other.locator('#saveNote').click();
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen versie');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Nieuwere bewaarde versie');
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen versie');
 await page.reload();
 await expect(page.locator('#statement')).toHaveValue('Nieuwere bewaarde versie');
 await page.locator('#statement').fill('Veilig bijgewerkte versie');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('lokaal bewaard');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Veilig bijgewerkte versie');
 await other.close();
});


test('Atelier v6.17: expliciet laden lost notitieconflict op zonder stille overschrijving',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn onopgeslagen notitie');
 await other.locator('#statement').fill('Bewaarde versie uit tweede tab');
 await other.locator('#saveNote').click();
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen notitie');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('#loadSavedNote').click();
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen notitie');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Bewaarde versie uit tweede tab');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#loadSavedNote').click();
 await expect(page.locator('#statement')).toHaveValue('Bewaarde versie uit tweede tab');
 await expect(page.locator('#feedback')).toContainText('Opgeslagen ontwerpnotitie geladen');
 await page.locator('#statement').fill('Mijn bewuste volgende versie');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('lokaal bewaard');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Mijn bewuste volgende versie');
 await other.close();
});


test('Atelier v6.19: stille mislukte notitie-opslag mag geen succes melden',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Creatieve notitie die bewaard moet blijven');
 await page.evaluate(()=>{
   const native=Storage.prototype.setItem;
   window.restoreNoteWrite=()=>{Storage.prototype.setItem=native;};
   Storage.prototype.setItem=function(key,value){
     if(key===window.PalacoAtelierBundle.NOTE)return;
     return native.call(this,key,value);
   };
 });
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan niet bevestigd');
 await expect(page.locator('#statement')).toHaveValue('Creatieve notitie die bewaard moet blijven');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBeNull();
 await page.evaluate(()=>window.restoreNoteWrite());
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Ontwerpnotitie lokaal bewaard');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Creatieve notitie die bewaard moet blijven');
});

test('Atelier v6.19: afwijkende notitie na schrijfactie blijft een conflict',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn nieuwe ontwerpnotitie');
 await page.evaluate(()=>{
   const native=Storage.prototype.setItem;
   window.restoreNoteWrite=()=>{Storage.prototype.setItem=native;};
   Storage.prototype.setItem=function(key,value){
     if(key===window.PalacoAtelierBundle.NOTE)return native.call(this,key,'Concurrerende versie');
     return native.call(this,key,value);
   };
 });
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan niet bevestigd');
 await page.evaluate(()=>window.restoreNoteWrite());
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
 await expect(page.locator('#statement')).toHaveValue('Mijn nieuwe ontwerpnotitie');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Concurrerende versie');
});


test('Atelier v6.20: herstelrapport is toetsenbordbereikbaar en bevat geen projecttekst',async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 await page.evaluate(()=>{
   window.showRollbackReport({
     code:'ATELIER_RESTORE_REVIEW_REQUIRED',
     rollback:{exterior:'conflict',interior:'failed',note:'untouched'},
     message:'PRIVÉ ONTWERPTEKST MAG NIET WORDEN GETOOND'
   });
 });
 await expect(page.locator('#rollbackReport')).toBeVisible();
 await expect(page.locator('#rollbackGuide')).toBeVisible();
 await expect(page.locator('#rollbackItems li')).toHaveCount(3);
 await expect(page.locator('#rollbackSteps li')).toHaveCount(5);
 await expect(page.locator('#rollbackItems')).toContainText('Exterieur: Conflict');
 await expect(page.locator('#rollbackItems')).toContainText('Interieur: Herstel mislukt');
 await expect(page.locator('#rollbackItems')).not.toContainText('PRIVÉ ONTWERPTEKST');
 await expect(page.locator('#rollbackReport')).toHaveAttribute('aria-live','polite');
 await expect(page.locator('#rollbackReport')).toHaveAttribute('tabindex','-1');
 await expect(page.locator('#rollbackReport')).toBeFocused();
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 await page.evaluate(()=>window.showRollbackReport(null));
 await expect(page.locator('#rollbackReport')).toBeHidden();
 await expect(page.locator('#rollbackSteps li')).toHaveCount(0);
});

test('Atelier v6.20: gecontroleerde rollback toont korte checklist op desktop',async ({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await page.goto('/atelier/regiekamer.html');
 await page.evaluate(()=>window.showRollbackReport({
   code:'ATELIER_RESTORE_ROLLED_BACK',
   rollback:{exterior:'restored',interior:'original',note:'untouched'}
 }));
 await expect(page.locator('#rollbackHeading')).toHaveText('Terugdraaien gecontroleerd');
 await expect(page.locator('#rollbackSteps li')).toHaveCount(2);
 await expect(page.locator('#rollbackReport')).toBeFocused();
 await expect(page.locator('#rollbackGuide')).toBeVisible();
});


test('Atelier v6.21: echte importfout toont gecontroleerde rollback en bewaart originele ontwerpen',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const payload=await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  const old=api.create(null,null,'Bewaard ontwerp');
  api.restore(localStorage,old);
  const exterior={schema:'palaco.citadel.atelier.studio/1',state:'DRAFT',authority:'NONE',name:'Controle',scale:'Dorp',style:'PALACO · Emerald & Gold',mood:'Gouden uur',cells:Array(96).fill(null)};
  exterior.cells[0]='park';
  return JSON.stringify(api.create(exterior,null,'Nieuw ontwerp'));
 });
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 await page.evaluate(()=>{
  const native=Storage.prototype.setItem;
  let failed=false;
  window.restoreAtelierWrites=()=>{Storage.prototype.setItem=native;};
  Storage.prototype.setItem=function(key,value){
   if(key===window.PalacoAtelierBundle.NOTE&&!failed){failed=true;throw Error('simulated quota failure');}
   return native.call(this,key,value);
  };
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#bundleImport').setInputFiles({name:'veilig-ontwerp.json',mimeType:'application/json',buffer:Buffer.from(payload)});
 await expect(page.locator('#rollbackReport')).toBeVisible();
 await expect(page.locator('#rollbackHeading')).toHaveText('Terugdraaien gecontroleerd');
 await expect(page.locator('#rollbackItems')).toContainText('Exterieur: Teruggezet');
 await expect(page.locator('#rollbackSteps li')).toHaveCount(2);
 await expect(page.locator('#rollbackReport')).toBeFocused();
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 await page.evaluate(()=>window.restoreAtelierWrites());
});

test('Atelier v6.21: concurrerend ontwerp tijdens import blijft intact en vraagt beoordeling',async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/atelier/regiekamer.html');
 const payload=await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  api.restore(localStorage,api.create(null,null,'Oorspronkelijke notitie'));
  const exterior={schema:'palaco.citadel.atelier.studio/1',state:'DRAFT',authority:'NONE',name:'Nieuw plan',scale:'Dorp',style:'PALACO · Emerald & Gold',mood:'Gouden uur',cells:Array(96).fill(null)};
  return JSON.stringify(api.create(exterior,null,'Nieuw ontwerp'));
 });
 await page.evaluate(()=>{
  const native=Storage.prototype.setItem;
  window.restoreAtelierWrites=()=>{Storage.prototype.setItem=native;};
  Storage.prototype.setItem=function(key,value){
   if(key===window.PalacoAtelierBundle.NOTE){
    native.call(this,window.PalacoAtelierBundle.EX,'concurrerende-ontwerpwijziging');
    throw Error('simulated concurrent write');
   }
   return native.call(this,key,value);
  };
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#bundleImport').setInputFiles({name:'veilig-ontwerp.json',mimeType:'application/json',buffer:Buffer.from(payload)});
 await expect(page.locator('#rollbackHeading')).toHaveText('Handmatige herstelcontrole noodzakelijk');
 await expect(page.locator('#rollbackItems')).toContainText('Exterieur: Conflict');
 await expect(page.locator('#rollbackSteps li')).toHaveCount(5);
 await expect(page.locator('#rollbackReport')).toBeFocused();
 await expect(page.locator('#rollbackItems')).not.toContainText('concurrerende-ontwerpwijziging');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.EX))).toBe('concurrerende-ontwerpwijziging');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Oorspronkelijke notitie');
 await page.evaluate(()=>window.restoreAtelierWrites());
});


test('Atelier v6.22: andere opslagversie tijdens bevestiging wordt niet geladen',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn onopgeslagen ontwerpnotitie');
 await page.evaluate(()=>{
   localStorage.setItem(window.PalacoAtelierBundle.NOTE,'Eerste opgeslagen versie');
   window.confirm=()=>{
     localStorage.setItem(window.PalacoAtelierBundle.NOTE,'Tweede opgeslagen versie');
     return true;
   };
 });
 await page.locator('#loadSavedNote').click();
 await expect(page.locator('#feedback')).toContainText('Laden geweigerd');
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen ontwerpnotitie');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Tweede opgeslagen versie');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
});



test('Atelier v6.24: echte tweede tab onderbreekt lopende import vóór bevestiging',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 const payload=await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  return JSON.stringify(api.create(null,null,'Te importeren versie'));
 });
 await page.locator('#statement').fill('Mijn onopgeslagen creatieve tekst');
 await page.evaluate(()=>{
   const original=File.prototype.arrayBuffer;
   window.pendingCrossTabImport=[];
   File.prototype.arrayBuffer=function(){
     if(this.name==='traag-project.json')
       return new Promise((resolve,reject)=>window.pendingCrossTabImport.push(()=>original.call(this).then(resolve,reject)));
     return original.call(this);
   };
 });
 let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
 await page.locator('#bundleImport').setInputFiles({name:'traag-project.json',mimeType:'application/json',buffer:Buffer.from(payload)});
 await expect.poll(()=>page.evaluate(()=>window.pendingCrossTabImport.length)).toBe(1);
 await other.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   localStorage.setItem(api.NOTE,'Nieuwere notitie vanuit tweede tab');
 });
 await expect(page.locator('#bundleStatus')).toContainText('Projectimport onderbroken');
 await page.evaluate(()=>window.pendingCrossTabImport.shift()());
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen creatieve tekst');
 expect(dialogs).toBe(0);
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Nieuwere notitie vanuit tweede tab');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.RECOVERY))).toBeNull();
 await other.close();
});

test('Atelier v6.24: herstelknoppen volgen wijziging van herstelkopie uit tweede tab',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await expect(page.locator('#undoImport')).toBeDisabled();
 await other.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   localStorage.setItem(api.NOTE,'Vóór import');
   api.restoreWithRecovery(localStorage,api.create(null,null,'Huidig ontwerp'));
 });
 await expect(page.locator('#undoImport')).toBeEnabled();
 await expect(page.locator('#exportRecovery')).toBeEnabled();
 await other.evaluate(()=>{
   localStorage.removeItem(window.PalacoAtelierBundle.RECOVERY);
 });
 await expect(page.locator('#undoImport')).toBeDisabled();
 await expect(page.locator('#exportRecovery')).toBeDisabled();
 await expect(page.locator('#recoveryStatus')).toContainText('Nog geen lokale herstelkopie');
 await other.close();
});


test('Atelier v6.25: herhaald notitieconflict tussen tabbladen behoudt onopgeslagen werk',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn lokaal onopgeslagen ontwerp');
 for(const value of ['Tweede tab revisie A','Tweede tab revisie B','Tweede tab revisie C']){
  await other.locator('#statement').fill(value);
  await other.locator('#saveNote').click();
  await expect(other.locator('#feedback')).toContainText('lokaal bewaard');
  await expect(page.locator('#statement')).toHaveValue('Mijn lokaal onopgeslagen ontwerp');
  expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe(value);
 }
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
 await expect(page.locator('#statement')).toHaveValue('Mijn lokaal onopgeslagen ontwerp');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Tweede tab revisie C');
 await other.close();
});

test('Atelier v6.25: browserherladen bewaart laatste DRAFT herstelkopie en ontwerpen',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  localStorage.setItem(api.NOTE,'Originele opgeslagen notitie');
  api.restoreWithRecovery(localStorage,api.create(null,null,'Geïmporteerde ontwerpnotitie'));
 });
 const state=await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  return {before:api.snapshot(localStorage),rawRecovery:localStorage.getItem(api.RECOVERY)};
 });
 await page.reload();
 await expect(page.locator('#undoImport')).toBeEnabled();
 await expect(page.locator('#exportRecovery')).toBeEnabled();
 await expect(page.locator('#statement')).toHaveValue('Geïmporteerde ontwerpnotitie');
 const after=await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  return {before:api.snapshot(localStorage),rawRecovery:localStorage.getItem(api.RECOVERY),note:api.getRecovery(localStorage).draft.note};
 });
 expect(after.before).toEqual(state.before);
 expect(after.rawRecovery).toBe(state.rawRecovery);
 expect(after.note).toBe('Originele opgeslagen notitie');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#undoImport').click();
 await expect(page.locator('#bundleStatus')).toContainText('Vorige Atelier-versie teruggezet');
 await expect(page.locator('#statement')).toHaveValue('Originele opgeslagen notitie');
});


test('Atelier v6.26: schone ontwerpnotitie wordt geleegd door opslagwisactie in tweede tab',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await other.locator('#statement').fill('Opgeslagen creatieve notitie');
 await other.locator('#saveNote').click();
 await expect(page.locator('#statement')).toHaveValue('Opgeslagen creatieve notitie');
 await other.evaluate(()=>localStorage.clear());
 await expect(page.locator('#statement')).toHaveValue('');
 await expect(page.locator('#feedback')).toContainText('bijgewerkt vanuit een ander tabblad');
 await page.locator('#statement').fill('Nieuwe notitie na wissen');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('lokaal bewaard');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Nieuwe notitie na wissen');
 await other.close();
});

test('Atelier v6.26: opslagwisactie in tweede tab behoudt onopgeslagen ontwerptekst',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await other.locator('#statement').fill('Bewaarde uitgangstekst');
 await other.locator('#saveNote').click();
 await expect(page.locator('#statement')).toHaveValue('Bewaarde uitgangstekst');
 await page.locator('#statement').fill('Mijn onopgeslagen schets');
 await other.evaluate(()=>localStorage.clear());
 await expect(page.locator('#feedback')).toContainText('onopgeslagen tekst blijft staan');
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen schets');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBeNull();
 await other.close();
});

test('Atelier v6.31: vertraagd storage-event gebruikt actuele opgeslagen notitie',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   // Simulate a queued event for an older revision; persisted storage is newer.
   localStorage.setItem(api.NOTE,'Nieuwste werkelijk opgeslagen versie');
   window.dispatchEvent(new StorageEvent('storage',{
     key:api.NOTE,oldValue:null,newValue:'Verouderde gebeurtenis',storageArea:localStorage,url:location.href
   }));
 });
 await expect(page.locator('#statement')).toHaveValue('Nieuwste werkelijk opgeslagen versie');
 await page.locator('#statement').fill('Vervolg na actualiseren');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('lokaal bewaard');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Vervolg na actualiseren');
});

test('Atelier v6.31: verouderd event overschrijft geen onopgeslagen notitie',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn onopgeslagen creatieve werk');
 await page.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   localStorage.setItem(api.NOTE,'Nieuwste opgeslagen versie');
   window.dispatchEvent(new StorageEvent('storage',{
     key:api.NOTE,oldValue:null,newValue:'Oude versie',storageArea:localStorage,url:location.href
   }));
 });
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen creatieve werk');
 await expect(page.locator('#feedback')).toContainText('onopgeslagen tekst blijft staan');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Nieuwste opgeslagen versie');
});

test('Atelier v6.33: verouderd event veroorzaakt geen vals conflict bij onopgeslagen notitie',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn nog onopgeslagen versie');
 const initial=await page.locator('#feedback').textContent();
 await page.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   // The event carries an obsolete change, but the actual stored note
   // still matches the baseline of this editor.
   window.dispatchEvent(new StorageEvent('storage',{
     key:api.NOTE,oldValue:'Voorheen',newValue:'Oude eventversie',
     storageArea:localStorage,url:location.href
   }));
 });
 await expect(page.locator('#statement')).toHaveValue('Mijn nog onopgeslagen versie');
 expect(await page.locator('#feedback').textContent()).toBe(initial);
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('lokaal bewaard');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Mijn nog onopgeslagen versie');
});

test('Atelier v6.33: werkelijk opslagconflict blijft zichtbaar ondanks oude eventpayload',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.locator('#statement').fill('Mijn onopgeslagen ontwerp');
 await page.evaluate(()=>{
   const api=window.PalacoAtelierBundle;
   localStorage.setItem(api.NOTE,'Werkelijk andere opgeslagen versie');
   window.dispatchEvent(new StorageEvent('storage',{
     key:api.NOTE,oldValue:null,newValue:null,
     storageArea:localStorage,url:location.href
   }));
 });
 await expect(page.locator('#statement')).toHaveValue('Mijn onopgeslagen ontwerp');
 await expect(page.locator('#feedback')).toContainText('onopgeslagen tekst blijft staan');
 await page.locator('#saveNote').click();
 await expect(page.locator('#feedback')).toContainText('Opslaan geweigerd');
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.NOTE))).toBe('Werkelijk andere opgeslagen versie');
});


test('Atelier v6.34: beschadigde herstelkopie uit tweede tab blokkeert undo',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  localStorage.setItem(api.NOTE,'Oorspronkelijke ontwerpnotitie');
  api.restoreWithRecovery(localStorage,api.create(null,null,'Huidig creatief ontwerp'));
 });
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 await expect(page.locator('#undoImport')).toBeEnabled();
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 await other.evaluate(()=>{
  localStorage.setItem(window.PalacoAtelierBundle.RECOVERY,'{ongeldige JSON');
 });
 await expect(page.locator('#undoImport')).toBeDisabled();
 await expect(page.locator('#recoveryStatus')).toContainText('Herstelkopie kon niet worden gelezen');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  let blocked=false;
  try{api.undoLastImport(localStorage,api.snapshot(localStorage));}catch{blocked=true;}
  if(!blocked)throw Error('Beschadigde herstelkopie onterecht geaccepteerd');
 });
 expect(await page.evaluate(()=>localStorage.getItem(window.PalacoAtelierBundle.RECOVERY))).toBe('{ongeldige JSON');
 await other.close();
});

test('Atelier v6.34: herstelfout door tweede tab behoudt ongeautoriseerd DRAFT-record',async ({page})=>{
 await page.goto('/atelier/regiekamer.html');
 await page.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  localStorage.setItem(api.NOTE,'Huidig ontwerp');
 });
 const other=await page.context().newPage();
 await other.goto('/atelier/regiekamer.html');
 const before=await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage));
 await other.evaluate(()=>{
  const api=window.PalacoAtelierBundle;
  const record={
   schema:'palaco.citadel.atelier.recovery/1',
   state:'DRAFT',authority:'OWNER',savedAt:'2026-11-22T12:00:00.000Z',
   draft:api.create(null,null,'Oud ontwerp')
  };
  localStorage.setItem(api.RECOVERY,JSON.stringify(record));
 });
 await expect(page.locator('#undoImport')).toBeDisabled();
 await expect(page.locator('#recoveryStatus')).toContainText('Onbekende herstelkopie');
 expect(await page.evaluate(()=>window.PalacoAtelierBundle.snapshot(localStorage))).toEqual(before);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(window.PalacoAtelierBundle.RECOVERY)).authority)).toBe('OWNER');
 await other.close();
});
