import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const pageHtml=readFileSync(new URL('./index.html',import.meta.url));

async function withPage(viewport,run) {
 const server=createServer((req,res)=>{
  if(req.url==='/DOCS/la-observatorium/'||req.url==='/DOCS/la-observatorium/index.html'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(pageHtml);
  } else {res.writeHead(404);res.end('Not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 let browser;
 try {
  browser=await chromium.launch({headless:true,timeout:20000});
  const context=await browser.newContext({viewport,acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${address.port}/DOCS/la-observatorium/`,{timeout:10000});
  await run(page);
  assert.deepEqual(errors,[],'Browser should have no JS runtime errors');
 } finally {
  if(browser)await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
}

for (const width of [320,390,1280]) {
 test(`Citadel Observatory browser roundtrip and tamper check at ${width}px`,{timeout:90000},async()=>{
  await withPage({width,height:800},async page=>{
   assert.equal(await page.locator('#persist').isChecked(),false);
   assert.equal(await page.locator('[role="tab"]').count(),5);
   assert.equal(await page.locator('[role="tablist"]').count(),1);
   assert.equal(await page.locator('[role="tabpanel"]').count(),5);
   await page.locator('#tab-uitkijk').focus();
   await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('#tab-bewijs').getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('#tab-bewijs').getAttribute('tabindex'),'0');
   await page.keyboard.press('Home');
   assert.equal(await page.locator('#tab-uitkijk').getAttribute('aria-selected'),'true');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
   assert.equal(overflow,false,`Horizontal overflow at ${width}px`);
   console.log('Observatorium browser journey: chapter navigation');
   await page.locator('[data-tab="atelier"]').click();
   await page.locator('#subject').fill('Mobiele waarneming');
   await page.locator('#kind').selectOption('OBSERVED');
   await page.locator('#reference').fill('QUAY: lokaal');
   await page.locator('#notes').fill('Alleen lokaal, niet geverifieerd.');
   await page.getByRole('button',{name:'Voeg lokale waarneming toe'}).click();
   await page.locator('[data-tab="geheugen"]').click();
   assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
   await page.locator('#events button').click();
   assert.equal(await page.locator('#inspection-reference-state').innerText(),'NIET GEVERIFIEERD');
   assert.match(await page.locator('#inspection-reference-type').innerText(),/QUAY/);
   console.log('Observatorium browser journey: inspection dossier export');
   const downloadPromise=page.waitForEvent('download',{timeout:10000});
   await page.locator('#inspection-export').click();
   const download=await downloadPromise;
   const bytes=await readFile(await download.path());
   const packet=JSON.parse(bytes.toString('utf8'));
   assert.equal(packet.source_status,'SELF_REPORTED_NOT_VERIFIED');
   assert.equal(packet.verification.authority,'NONE');
   console.log('Observatorium browser journey: intact dossier verification');
   await page.locator('#dossier-file').setInputFiles({name:'dossier.json',mimeType:'application/json',buffer:bytes});
   await page.locator('#verify-dossier').click();
   await page.waitForFunction(()=>document.querySelector('#dossier-verdict')?.textContent?.includes('INTEGRITEIT KOMT OVEREEN'),null,{timeout:10000});
   console.log('Observatorium browser journey: tampered dossier rejection');
   const tampered=structuredClone(packet);
   tampered.observation.notes='Aangepaste tekst zonder nieuwe hash';
   await page.locator('#dossier-file').setInputFiles({name:'aangepast.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
   assert.match(await page.locator('#dossier-verdict').innerText(),/controle nog niet uitgevoerd/,'Previously successful verdict must reset on new file');
   await page.locator('#verify-dossier').click();
   await page.waitForFunction(()=>document.querySelector('#dossier-verdict')?.textContent?.includes('INTEGRITEIT AFGEWEZEN'),null,{timeout:10000});
   assert.match(await page.locator('#dossier-verdict').innerText(),/geen bewijs of mandaat/);
   assert.equal(await page.locator('#persist').isChecked(),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  });
 });
}

test('non-consented notes disappear after reload without device persistence',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#subject').fill('Tijdelijke notitie');
  await page.locator('#notes').fill('Geen toestemming tot bewaren');
  await page.locator('#form button[type="submit"]').click();
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  await page.reload();
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
  assert.equal(await page.locator('#persist').isChecked(),false);
 });
});

test('explicit opt-in survives reload; revocation erases saved copy',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),'yes');
  await page.locator('#subject').fill('Bewaarproef');
  await page.locator('#notes').fill('Alleen met toestemming');
  await page.locator('#form button[type="submit"]').click();
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),true);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').uncheck();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),false);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
 });
});

test('orphaned local note copy is purged when no consent marker exists',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const orphan=[{id:'orphan-1',at:'2026-11-17T07:00:00.000Z',subject:'Old copy',kind:'OBSERVED',reference:'',notes:'No current consent'}];
  await page.evaluate(items=>{
   localStorage.setItem('palaco_la_observatory_notes_v1',JSON.stringify(items));
   localStorage.removeItem('palaco_la_observatory_consent_v1');
  },orphan);
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
 });
});

test('corrupt consented local memory is quarantined until explicit reset',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const corrupt='{not valid JSON';
  await page.evaluate(raw=>{
   localStorage.setItem('palaco_la_observatory_consent_v1','yes');
   localStorage.setItem('palaco_la_observatory_notes_v1',raw);
  },corrupt);
  await page.reload();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.match(await page.locator('#storage').innerText(),/HERSTEL VEREIST/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),corrupt,
    'Damaged local copy must not be overwritten during startup');
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
  await page.locator('#tab-atelier').click();
  const recoveryDownload=page.waitForEvent('download',{timeout:10000});
  await page.locator('#storage-backup').click();
  const archived=await recoveryDownload;
  assert.equal(archived.suggestedFilename(),'la-observatorium-onleesbare-kopie.txt');
  assert.equal((await readFile(await archived.path())).toString('utf8'),corrupt);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),corrupt);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#storage-reset').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),corrupt,
    'Cancelling the reset retains the original');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#storage-reset').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  assert.equal(await page.locator('#persist').isDisabled(),false);
 });
});
test('schema-invalid consented memory is not silently filtered or overwritten',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const malformed=JSON.stringify([{id:'bad',at:'not-a-date',subject:'Bad',kind:'OBSERVED',reference:'',notes:'Invalid timestamp'}]);
  await page.evaluate(raw=>{
   localStorage.setItem('palaco_la_observatory_consent_v1','yes');
   localStorage.setItem('palaco_la_observatory_notes_v1',raw);
  },malformed);
  await page.reload();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),malformed);
 });
});

test('failed local wipe never claims success or releases storage guard',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  await page.locator('#subject').fill('Wisfout controle');
  await page.locator('#notes').fill('Alleen lokaal met toestemming');
  await page.locator('#form button[type="submit"]').click();
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  await page.evaluate(()=>{
   const remove=Storage.prototype.removeItem;
   Storage.prototype.removeItem=function(key){
    if(key==='palaco_la_observatory_notes_v1')throw new Error('Simulated storage remove failure');
    return remove.call(this,key);
   };
  });
  await page.locator('#persist').uncheck();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.match(await page.locator('#storage').innerText(),/WISSEN NIET BEVESTIGD/);
  assert.doesNotMatch(await page.locator('#announce').innerText(),/aantoonbaar verwijderd/);
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  assert.equal(await page.locator('#storage-reset').isVisible(),true);
 });
});
test('failed local write does not claim storage enabled',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.evaluate(()=>{
   const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(key==='palaco_la_observatory_notes_v1')throw new Error('Simulated storage write failure');
    return set.call(this,key,value);
   };
  });
  await page.locator('#persist').check();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.match(await page.locator('#storage').innerText(),/OPSLAG ONBEVESTIGD/);
  assert.doesNotMatch(await page.locator('#announce').innerText(),/Opslag bevestigd/);
 });
});

test('two offline observations get distinct IDs without randomUUID',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.evaluate(()=>{
   Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true});
  });
  await page.locator('#tab-atelier').click();
  for(const subject of ['Eerste offline notitie','Tweede offline notitie']){
   await page.locator('#subject').fill(subject);
   await page.locator('#notes').fill('Test zonder UUID-generator');
   await page.locator('#form button[type="submit"]').click();
  }
  const downloadEvent=page.waitForEvent('download',{timeout:10000});
  await page.locator('#export').click();
  const download=await downloadEvent;
  const journal=JSON.parse((await readFile(await download.path())).toString('utf8'));
  assert.equal(journal.notes.length,2);
  assert.notEqual(journal.notes[0].id,journal.notes[1].id);
  assert.ok(journal.notes.every(note=>note.id.startsWith('local-')));
  assert.equal(journal.authority,'SELF_REPORTED_NOT_VERIFIED');
 });
});
test('failed save of new observation retains local-only warning',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  await page.evaluate(()=>{
   const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(key==='palaco_la_observatory_notes_v1')throw Error('Forced write failure');
    return set.call(this,key,value);
   };
  });
  await page.locator('#subject').fill('Alleen tijdelijk');
  await page.locator('#notes').fill('Opslag geweigerd');
  await page.locator('#form button[type="submit"]').click();
  assert.match(await page.locator('#announce').innerText(),/alleen in dit tabblad toegevoegd/);
  assert.equal(await page.locator('#persist').isDisabled(),true);
 });
});

test('corrupt storage blocks import and ordinary clear without mutating protected copy',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const corrupt='{unreadable backup';
  await page.evaluate(raw=>{
   localStorage.setItem('palaco_la_observatory_consent_v1','yes');
   localStorage.setItem('palaco_la_observatory_notes_v1',raw);
  },corrupt);
  await page.reload();
  await page.locator('#tab-atelier').click();
  const journal={format:'palaco-la-observatory-local-v1',authority:'SELF_REPORTED_NOT_VERIFIED',
    notes:[{id:'import-1',at:'2026-11-17T07:00:00.000Z',subject:'Imported note',
      kind:'OBSERVED',reference:'',notes:'Should be blocked'}]};
  await page.locator('#import-file').setInputFiles({
   name:'import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(journal))});
  await page.locator('#import').click();
  assert.match(await page.locator('#announce').innerText(),/Import geblokkeerd/);
  await page.locator('#clear').click();
  assert.match(await page.locator('#announce').innerText(),/Wissen geblokkeerd/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),corrupt);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),'yes');
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
 });
});

test('failed journal clear does not claim confirmed local erasure',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  await page.locator('#subject').fill('Notitie voor wisproef');
  await page.locator('#notes').fill('Lokaal bewaard');
  await page.locator('#form button[type="submit"]').click();
  await page.evaluate(()=>{
   const remove=Storage.prototype.removeItem;
   Storage.prototype.removeItem=function(key){
    if(key==='palaco_la_observatory_notes_v1')throw Error('Forced clear failure');
    return remove.call(this,key);
   };
  });
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clear').click();
  assert.match(await page.locator('#announce').innerText(),/Wissen NIET bevestigd/);
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
  await page.locator('#tab-atelier').click();
  const downloadPromise=page.waitForEvent('download',{timeout:10000});
  await page.locator('#export').click();
  const download=await downloadPromise;
  const journal=JSON.parse((await readFile(await download.path())).toString('utf8'));
  assert.equal(journal.notes.length,1);
  assert.equal(journal.notes[0].subject,'Notitie voor wisproef');
 });
});

test('clear all revokes consent and removes persisted journal rather than saving empty list',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  await page.locator('#subject').fill('Te verwijderen notitie');
  await page.locator('#notes').fill('Toestemming moet ook verdwijnen');
  await page.locator('#form button[type="submit"]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),'yes');
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clear').click();
  assert.equal(await page.locator('#persist').isChecked(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  assert.match(await page.locator('#announce').innerText(),/bewaartoestemming aantoonbaar verwijderd/);
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),false);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
 });
});

test('stale async journal import cannot reintroduce notes after a local edit',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  const journal={format:'palaco-la-observatory-local-v1',authority:'SELF_REPORTED_NOT_VERIFIED',
   notes:[{id:'stale-import-1',at:'2026-11-17T10:00:00.000Z',subject:'Verouderde import',
    kind:'OBSERVED',reference:'',notes:'Mag niet worden toegevoegd'}]};
  await page.locator('#import-file').setInputFiles({
   name:'stale.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(journal))});
  await page.evaluate(()=>{
   const original=File.prototype.text;
   window.__importReadStarted=false;
   File.prototype.text=function(){
    window.__importReadStarted=true;
    return new Promise(resolve=>{window.__finishImportRead=async()=>resolve(await original.call(this));});
   };
  });
  await page.locator('#import').click();
  await page.waitForFunction(()=>window.__importReadStarted===true);
  await page.locator('#subject').fill('Nieuwe lokale wijziging');
  await page.locator('#notes').fill('Tijdens bestandsinlezen toegevoegd');
  await page.locator('#form button[type="submit"]').click();
  await page.evaluate(()=>window.__finishImportRead());
  await page.waitForFunction(()=>document.querySelector('#announce')?.textContent?.includes('Import afgebroken'));
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
  assert.match(await page.locator('#events').innerText(),/Nieuwe lokale wijziging/);
  assert.doesNotMatch(await page.locator('#events').innerText(),/Verouderde import/);
 });
});

test('pending inspection export is cancelled when another note becomes selected',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  for(const subject of ['Eerste dossier','Tweede dossier']){
   await page.locator('#subject').fill(subject);
   await page.locator('#notes').fill('Alleen lokaal, geen autorisatie');
   await page.locator('#form button[type="submit"]').click();
  }
  await page.locator('#tab-geheugen').click();
  await page.getByRole('button',{name:'Inspecteer Eerste dossier'}).click();
  await page.evaluate(()=>{
   const original=SubtleCrypto.prototype.digest;
   window.__hashStarted=false;
   SubtleCrypto.prototype.digest=function(...args){
    window.__hashStarted=true;
    return new Promise((resolve,reject)=>{
     window.__finishHash=()=>original.apply(this,args).then(resolve,reject);
    });
   };
  });
  let downloads=0;
  page.on('download',()=>{downloads++;});
  await page.locator('#inspection-export').click();
  await page.waitForFunction(()=>window.__hashStarted===true);
  await page.locator('#inspection-back').click();
  await page.getByRole('button',{name:'Inspecteer Tweede dossier'}).click();
  await page.evaluate(()=>window.__finishHash());
  await page.waitForFunction(()=>document.querySelector('#announce')?.textContent?.includes('Export afgebroken'));
  assert.equal(downloads,0,'A stale inspection must not be downloaded');
  assert.equal(await page.locator('#inspection-subject').innerText(),'Tweede dossier');
 });
});
