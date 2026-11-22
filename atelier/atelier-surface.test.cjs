'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const atelier=__dirname;
const read=name=>fs.readFileSync(path.join(atelier,name),'utf8');
const routes=['wizard.html','studio.html','panorama.html','interieur.html','regiekamer.html'];
test('all five historic and new Atelier pages remain present with valid document envelopes',()=>{
  for(const route of routes){
    const html=read(route);
    assert.match(html,/<!doctype html>/i,route);
    assert.match(html,/<html lang="nl">/i,route);
    assert.match(html,/<\/html>\s*$/i,route);
    assert.match(html,/<meta name="viewport"/i,route);
  }
});
test('every route has a reversible navigation path back to Regiekamer',()=>{
  for(const route of routes.slice(0,4))
    assert.match(read(route),/href="\.\/regiekamer\.html"/,route);
  const hub=read('regiekamer.html');
  for(const route of routes.slice(0,4))
    assert.ok(hub.includes('href="./'+route+'"'),route);
});
test('all inline Atelier scripts parse without executing browser side effects',()=>{
  for(const route of routes){
    const source=read(route);
    for(const [,script] of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
      if(!script.trim())continue;
      assert.doesNotThrow(()=>new vm.Script(script,{filename:route}),route);
    }
  }
});
test('gallery and bundle dependencies resolve as local static scripts',()=>{
  const html=read('regiekamer.html');
  assert.match(html,/src="\.\/regiekamer-gallery\.js"/);
  assert.match(html,/src="\.\/regiekamer-bundle\.js"/);
  assert.ok(fs.existsSync(path.join(atelier,'regiekamer-gallery.js')));
  assert.ok(fs.existsSync(path.join(atelier,'regiekamer-bundle.js')));
});
test('shared browser modules keep read-only and DRAFT contracts',()=>{
  const bundle=read('regiekamer-bundle.js');
  const gallery=read('regiekamer-gallery.js');
  assert.match(bundle,/authority==='NONE'/);
  assert.match(bundle,/state==='DRAFT'/);
  assert.match(gallery,/authority==='NONE'/);
  assert.match(gallery,/state==='DRAFT'/);
  assert.match(read('regiekamer.html'),/api\.restoreWithRecovery\(localStorage,pack,current,expectedRecovery\)/);
  assert.match(read('regiekamer.html'),/const expectedRecovery=localStorage\.getItem\(api\.RECOVERY\)/);
  assert.match(read('regiekamer.html'),/api\.undoLastImport\(localStorage,before,previewedRecovery\)/);
  assert.match(read('regiekamer.html'),/const previewedRecovery=localStorage\.getItem\(api\.RECOVERY\)/);
  assert.match(read('regiekamer.html'),/id="exportRecovery" disabled/);
  assert.match(read('regiekamer.html'),/api\.getRecovery\(localStorage\)/);
  assert.match(read('regiekamer.html'),/id="bundleVerify"/);
  assert.match(read('regiekamer.html'),/crypto\.subtle\.digest\('SHA-256',bytes\)/);
  assert.match(read('regiekamer.html'),/id="expectedFingerprint"/);
  assert.match(read('regiekamer.html'),/fingerprint===reference\.toLowerCase\(\)/);
  assert.match(read('regiekamer.html'),/WAARSCHUWING: SHA-256 KOMT NIET OVEREEN/);
  assert.match(read('regiekamer.html'),/id="exportFingerprint" disabled/);
  assert.match(read('regiekamer.html'),/id="exportBundleReceipt" disabled/);
  assert.match(read('regiekamer.html'),/id="checkExportFile"[^>]*disabled/);
  assert.match(read('regiekamer.html'),/id="pairVerify"/);
  assert.match(read('regiekamer.html'),/PAARCONTROLE GESLAAGD/);
  assert.match(read('regiekamer.html'),/id="pairReportSave"[^>]*disabled/);
  assert.match(read('regiekamer.html'),/id="reportVerify"/);
  assert.match(read('regiekamer.html'),/DRIEVOUDIGE CONTROLE GESLAAGD/);
  assert.match(read('regiekamer.html'),/function parseBoundReceipt\(/);
  assert.match(read('regiekamer.html'),/function parseReceiptFields\(/);
  assert.match(read('regiekamer.html'),/function parseUniqueTopLevelJson\(source\)/);
  assert.match(read('regiekamer.html'),/if\(stack\.length>64\)/);
  assert.match(read('regiekamer.html'),/let propertyCount=0/);
  assert.match(read('regiekamer.html'),/\+\+propertyCount>4096/);
  assert.match(read('regiekamer.html'),/key\.length>256/);
  assert.match(read('regiekamer.html'),/veldnaam langer dan 256 tekens/);
  assert.match(read('regiekamer.html'),/maximum van 4096 objectvelden/);
  assert.match(read('regiekamer.html'),/Dossier-JSON overschrijdt maximale nestingdiepte van 64/);
  assert.match(read('regiekamer.html'),/parseUniqueTopLevelJson\(content\)/);
  assert.match(read('regiekamer.html'),/parseUniqueTopLevelJson\(projectText\)/);
  assert.match(read('regiekamer.html'),/parseUniqueTopLevelJson\(contents\)/);
  assert.match(read('regiekamer.html'),/parseUniqueTopLevelJson\(importText\)/);
  assert.match(read('regiekamer.html'),/let importRevision=0/);
  assert.match(read('regiekamer.html'),/let importReadPending=false/);
  assert.match(read('regiekamer.html'),/importReadPending=true/);
  assert.match(read('regiekamer.html'),/Projectimport onderbroken: lokale ontwerpgegevens/);
  assert.match(read('regiekamer.html'),/const revision=\+\+importRevision/);
  assert.match(read('regiekamer.html'),/if\(revision!==importRevision\)return/);
  assert.match(read('regiekamer.html'),/bundleImport'\)\.addEventListener\('cancel'/);
  assert.match(read('regiekamer.html'),/\+\+importRevision/);
  assert.match(read('regiekamer.html'),/const importBytes=await file\.arrayBuffer\(\)/);
  assert.match(read('regiekamer.html'),/importText=new TextDecoder\('utf-8',\{fatal:true\}\)\.decode\(importBytes\)/);
  assert.match(read('regiekamer.html'),/Projectbestand bevat ongeldige UTF-8-bytes/);
  assert.match(read('regiekamer.html'),/frame\.keys\.has\(key\)/);
  assert.match(read('regiekamer.html'),/stack\.push\(\{keys:new Set\(\)\}\)/);
  assert.match(read('regiekamer.html'),/stack\.push\(\{keys:null\}\)/);
  assert.match(read('regiekamer.html'),/Dossier-JSON bevat dubbele velden/);
  assert.match(read('regiekamer.html'),/value:parseUniqueTopLevelJson\(decoder\.decode\(item\.bytes\)\)/);
  assert.match(read('regiekamer.html'),/const orderedLines=\[/);
  assert.match(read('regiekamer.html'),/presentHeaders\.length>1/);
  assert.match(read('regiekamer.html'),/ongeldige regelvolgorde/);
  assert.match(read('regiekamer.html'),/if\(lines\[lines\.length-1\]===''\)lines\.pop\(\)/);
  assert.match(read('regiekamer.html'),/TXT-bewijs bevat lege of extra regels/);
  assert.match(read('regiekamer.html'),/function safeProjectFilename\(name\)/);
  assert.match(read('regiekamer.html'),/jsonFiles\.forEach\(file=>safeProjectFilename\(file\.name\)\)/);
  assert.match(read('regiekamer.html'),/file\.name\.normalize\('NFC'\)\.toLowerCase\(\)/);
  assert.match(read('regiekamer.html'),/comparableName\(jsonFiles\[0\]\)===comparableName\(jsonFiles\[1\]\)/);
  assert.match(read('regiekamer.html'),/verschillende JSON-bestandsnamen hebben/);
  assert.match(read('regiekamer.html'),/function safeReceiptFilename\(name\)/);
  assert.match(read('regiekamer.html'),/function isWindowsReservedFilename\(name\)/);
  assert.match(read('regiekamer.html'),/function hasAmbiguousExtensionSeparator\(name\)/);
  assert.match(read('regiekamer.html'),/hasAmbiguousExtensionSeparator\(name\)/);
  assert.match(read('regiekamer.html'),/isWindowsReservedFilename\(name\)/);
  assert.match(read('regiekamer.html'),/com\[1-9¹²³\]/);
  assert.match(read('regiekamer.html'),/lpt\[1-9¹²³\]/);
  assert.match(read('regiekamer.html'),/\\u200b-\\u200f/);
  assert.match(read('regiekamer.html'),/\\u2060\\u2066-\\u206f/);
  assert.match(read('regiekamer.html'),/\\ufeff/);
  assert.match(read('regiekamer.html'),/safeReceiptFilename\(txtFiles\[0\]\.name\)/);
  assert.match(read('regiekamer.html'),/safeReceiptFilename\(txt\.name\)/);
  assert.match(read('regiekamer.html'),/safeReceiptFilename\(file\.name\)/);
  assert.match(read('regiekamer.html'),/receiptFile:receiptFilename/);
  assert.match(read('regiekamer.html'),/const projectFilename=safeProjectFilename\(file\.name\)/);
  assert.match(read('regiekamer.html'),/filename:safeProjectFilename\(nameLines\[0\]/);
  assert.match(read('regiekamer.html'),/const expected=safeProjectFilename\(projectFilename\)/);
  assert.match(read('regiekamer.html'),/misleidende Unicode-richtingstekens/);
  assert.match(read('regiekamer.html'),/dubbele toelichtingsregels/);
  assert.match(read('regiekamer.html'),/te veel of te lange regels/);
  assert.match(read('regiekamer.html'),/const reference=parseReceiptFields\(content\)/);
  assert.match(read('regiekamer.html'),/let loadedReceiptFilename=null/);
  assert.match(read('regiekamer.html'),/Bestandsnaam in ingeladen SHA-256-referentie komt niet overeen/);
  assert.match(read('regiekamer.html'),/allowedNotes\.includes\(line\)/);
  assert.match(read('regiekamer.html'),/onbekende of misleidende regel/);
  assert.match(read('regiekamer.html'),/ongeldige besturingstekens/);
  assert.match(read('regiekamer.html'),/parseBoundReceipt\(receipt,projectEntry\.file\.name\)/);
  assert.match(read('regiekamer.html'),/parseBoundReceipt\(receipt,json\.name\)/);
  assert.match(read('regiekamer.html'),/if\(revision!==reportVerifyRevision\)return/);
  assert.match(read('regiekamer.html'),/report\.authority!=='NONE'/);
  assert.match(read('regiekamer.html'),/reportFields\.includes\(key\)/);
  assert.match(read('regiekamer.html'),/requiredLimitations/);
  assert.match(read('regiekamer.html'),/new Date\(report\.checkedAt\)\.toISOString\(\)/);
  assert.match(read('regiekamer.html'),/LOCAL_INTEGRITY_COMPARISON_ONLY/);
  assert.match(read('regiekamer.html'),/lastPairReport=null/);
  assert.match(read('regiekamer.html'),/JSON EN TXT KOMEN NIET OVEREEN/);
  assert.match(read('regiekamer.html'),/const projectText=decode\.decode\(jsonBytes\)/);
  assert.match(read('regiekamer.html'),/parseUniqueTopLevelJson\(projectText\)/);
  assert.match(read('regiekamer.html'),/api\.parse\(projectText\)/);
  assert.match(read('regiekamer.html'),/CONTROLE GESLAAGD/);
  assert.match(read('regiekamer.html'),/revision!==exportRevision/);
  assert.match(read('regiekamer.html'),/let exportCheckRevision=0/);
  assert.match(read('regiekamer.html'),/id="clearInspections"/);
  assert.match(read('regiekamer.html'),/id="inspectionResult" class="inspection-result" data-result="idle"/);
  assert.match(read('regiekamer.html'),/id="inspectionHashes" class="inspection-hashes" hidden/);
  assert.match(read('regiekamer.html'),/function showInspectionHashes\(actual,reference,reported\)/);
  assert.match(read('regiekamer.html'),/id="inspectionReceiptMatch"/);
  assert.match(read('regiekamer.html'),/id="inspectionReportMatch"/);
  assert.match(read('regiekamer.html'),/actual===reference/);
  assert.match(read('regiekamer.html'),/actual===reported/);
  assert.match(read('regiekamer.html'),/KOMT OVEREEN/);
  assert.match(read('regiekamer.html'),/WIJKT AF/);
  assert.match(read('regiekamer.html'),/showInspectionHashes\(actual,expected,report\.sha256\)/);
  assert.match(read('regiekamer.html'),/inspectionHashes'\)\.hidden=true/);
  assert.match(read('regiekamer.html'),/function showInspectionResult\(result,heading,detail\)/);
  assert.match(read('regiekamer.html'),/showInspectionResult\(matched\?'match':'mismatch'/);
  assert.match(read('regiekamer.html'),/showInspectionResult\('rejected'/);
  assert.match(read('regiekamer.html'),/showInspectionResult\('idle'/);
  assert.match(read('regiekamer.html'),/\$\('checkExportFile'\)\.addEventListener\('cancel'/);
  assert.match(read('regiekamer.html'),/\$\('pairVerify'\)\.addEventListener\('cancel'/);
  assert.match(read('regiekamer.html'),/\$\('reportVerify'\)\.addEventListener\('cancel'/);
  assert.match(read('regiekamer.html'),/\$\('bundleVerify'\)\.addEventListener\('cancel'/);
  assert.match(read('regiekamer.html'),/\$\('fingerprintReceipt'\)\.addEventListener\('cancel'/);
  assert.match(read('regiekamer.html'),/id="clearInspections" aria-describedby="clearExplanation"/);
  assert.match(read('regiekamer.html'),/id="referenceStatus" role="status" aria-live="polite" tabindex="-1"/);
  assert.match(read('regiekamer.html'),/referenceStatus'\)\.focus\(\{preventScroll:true\}\)/);
  assert.match(read('regiekamer.html'),/id="pairVerify" aria-describedby="pairStatus"/);
  assert.match(read('regiekamer.html'),/min-height:44px/);
  assert.match(read('regiekamer.html'),/\$\('clearInspections'\)\.addEventListener\('click'/);
  assert.match(read('regiekamer.html'),/\+\+reportVerifyRevision/);
  assert.match(read('regiekamer.html'),/\+\+dossierRevision/);
  assert.match(read('regiekamer.html'),/lastPairReport=null/);
  assert.match(read('regiekamer.html'),/selection!==exportCheckRevision/);
  assert.match(read('regiekamer.html'),/revision===exportRevision&&selection===exportCheckRevision/);
  assert.match(read('regiekamer.html'),/revision===dossierRevision\)event\.target\.value/);
  assert.match(read('regiekamer.html'),/revision===pairRevision\)event\.target\.value/);
  assert.match(read('regiekamer.html'),/revision===reportVerifyRevision\)event\.target\.value/);
  assert.match(read('regiekamer.html'),/new TextEncoder\(\)\.encode\(serialized\)/);
  assert.match(read('regiekamer.html'),/lastExportFingerprint=\{hash\}/);
  assert.match(read('regiekamer.html'),/verifiedFingerprint=null/);
  assert.match(read('regiekamer.html'),/PALACO-Atelier-SHA256-Referentie-DRAFT\.txt/);
  assert.match(read('regiekamer.html'),/id="fingerprintReceipt"/);
  assert.match(read('regiekamer.html'),/Referentie geweigerd/);
  assert.match(read('regiekamer.html'),/addEventListener\('input'/);
  assert.match(read('regiekamer.html'),/const matchesReference=reference===/);
  assert.match(read('regiekamer.html'),/let dossierRevision=0/);
  assert.match(read('regiekamer.html'),/if\(revision!==dossierRevision\)return/);
  assert.match(read('regiekamer.html'),/verifiedFingerprint=matchesReference\?/);
  assert.match(read('regiekamer.html'),/safeProjectFilename\(file\.name\)/);
});
test('original New Citadel identity wizard is still linked and cannot authorize',()=>{
  const wizard=read('wizard.html');
  assert.match(wizard,/New Citadel/);
  assert.match(wizard,/RIO/);
  assert.match(wizard,/DRAFT/);
  assert.match(wizard,/href="\.\/studio\.html"/);
  assert.match(wizard,/href="\.\/regiekamer\.html"/);
});

test('Atelier import must validate the JSON filename before reading bytes',()=>{
  const html=read('regiekamer.html');
  const begin=html.indexOf("$('bundleImport').addEventListener('change',async event=>{");
  const end=html.indexOf("$('bundleImport').addEventListener('cancel'",begin);
  assert.ok(begin>=0&&end>begin,'import change handler must be present');
  const handler=html.slice(begin,end);
  const validation=handler.indexOf('safeProjectFilename(file.name)');
  const reading=handler.indexOf('await file.arrayBuffer()');
  assert.ok(validation>=0,'unsafe imported file names must be rejected');
  assert.ok(reading>validation,'filename validation must precede file read');
});


test('Atelier note synchronization must preserve unsaved edits from local tab',()=>{
 const html=read('regiekamer.html');
 const begin=html.lastIndexOf("window.addEventListener('storage',e=>{");
 assert.ok(begin>=0,'cross-tab storage handler exists');
 const handler=html.slice(begin);
 assert.match(handler,/const locallyEdited=noteValue\(\)!==/);
 assert.match(handler,/if\(locallyEdited\)/);
 assert.match(handler,/onopgeslagen tekst blijft staan/);
 assert.match(handler,/typeof e\.newValue==='string'\?e\.newValue\.slice\(0,6000\):''/);
});


test('Atelier note save must reject a stale stored baseline before writing',()=>{
 const html=read('regiekamer.html');
 const begin=html.indexOf('function saveNote(){');
 const end=html.indexOf('function getSummary()',begin);
 assert.ok(begin>=0&&end>begin);
 const handler=html.slice(begin,end);
 assert.match(handler,/current!==noteBaseline/);
 assert.ok(handler.indexOf('current!==noteBaseline')<handler.indexOf('localStorage.setItem(NOTE,value)'));
 assert.match(handler,/Opslaan geweigerd/);
 assert.match(html,/noteBaseline=e.newValue/);
});


test('Regiekamer displays privacy-safe rollback diagnosis in accessible live region',()=>{
 const html=read('regiekamer.html');
 assert.match(html,/id="rollbackReport"[^>]*role="status" aria-live="polite" aria-atomic="true"[^>]*hidden/);
 assert.match(html,/id="rollbackReport"[^>]*tabindex="-1"/);
 assert.match(html,/id="rollbackHeading"/);
 assert.match(html,/id="rollbackItems"/);
 assert.match(html,/function showRollbackReport\(error\)/);
 assert.match(html,/ATELIER_RESTORE_ROLLED_BACK/);
 assert.match(html,/ATELIER_RESTORE_REVIEW_REQUIRED/);
 assert.match(html,/document\.createElement\('li'\)/);
 assert.match(html,/item\.textContent=label\+': '\+status/);
 assert.doesNotMatch(html,/item\.innerHTML=/);
 assert.match(html,/panel\.hidden=false/);
 assert.match(html,/panel\.hidden=true/);
});

test('Atelier import and undo show rollback report without leaking error details into diagnostic panel',()=>{
 const html=read('regiekamer.html');
 assert.match(html,/showRollbackReport\(err\)\?'Controleer de herstelstatus hieronder\.'/);
 assert.match(html,/showRollbackReport\(null\);\s*api\.restoreWithRecovery/);
 assert.match(html,/showRollbackReport\(null\);\s*api\.undoLastImport/);
 assert.match(html,/Object\.prototype\.hasOwnProperty\.call\(statuses,record\[key\]\)/);
 assert.match(html,/Geen ontwerpgegevens|geen ontwerpgegevens/i);
});


test('Atelier explicit note reload requires confirmation and updates baseline only after reading',()=>{
 const html=read('regiekamer.html');
 assert.match(html,/id="loadSavedNote"/);
 const begin=html.indexOf("$('loadSavedNote').addEventListener('click'");
 const end=html.indexOf("$('saveNote').addEventListener('click'",begin);
 assert.ok(begin>=0&&end>begin);
 const handler=html.slice(begin,end);
 assert.match(handler,/confirm\('De huidige onopgeslagen notitie vervangen/);
 assert.match(handler,/const latest=localStorage\.getItem\(NOTE\)/);
 assert.ok(handler.indexOf('noteBaseline=latest')>handler.indexOf('const latest=localStorage.getItem(NOTE)'));
 assert.doesNotMatch(handler,/localStorage\.setItem\(/);
});


test('guided recovery checklist is read-only, accessible and uses fixed Dutch advice',()=>{
 const html=read('regiekamer.html');
 assert.match(html,/id="rollbackGuide" aria-labelledby="rollbackGuideTitle" hidden/);
 assert.match(html,/id="rollbackSteps"/);
 assert.match(html,/const needsReview=code==='ATELIER_RESTORE_REVIEW_REQUIRED'/);
 assert.match(html,/steps\.replaceChildren\(\)/);
 assert.match(html,/item\.textContent=sentence/);
 assert.match(html,/stop met bewerken/i);
 assert.match(html,/Importeer of herstel pas opnieuw/);
 assert.match(html,/Laad opgeslagen notitie/);
 assert.match(html,/\$\('rollbackGuide'\)\.hidden=false/);
 assert.match(html,/\$\('rollbackGuide'\)\.hidden=true/);
 const start=html.indexOf(" const needsReview=code==='ATELIER_RESTORE_REVIEW_REQUIRED'");
 const end=html.indexOf(' panel.hidden=false;',start);
 assert.ok(start>0&&end>start);
 const guide=html.slice(start,end);
 assert.doesNotMatch(guide,/localStorage\.(setItem|removeItem)/);
 assert.doesNotMatch(guide,/\.innerHTML\s*=/);
});


test('Atelier note save verifies persisted content before advancing baseline',()=>{
 const html=read('regiekamer.html');
 const begin=html.indexOf('function saveNote(){');
 const end=html.indexOf('function getSummary()',begin);
 assert.ok(begin>=0&&end>begin);
 const handler=html.slice(begin,end);
 const write=handler.indexOf('localStorage.setItem(NOTE,value)');
 const verify=handler.indexOf('localStorage.getItem(NOTE)!==value');
 const baseline=handler.indexOf('noteBaseline=value');
 assert.ok(write>=0&&verify>write&&baseline>verify,'save acknowledgement must follow read-back verification');
 assert.match(handler,/Opslaan niet bevestigd/);
});


test('rollback report can receive programmatic keyboard focus without changing tab order',()=>{
 const html=read('regiekamer.html');
 assert.match(html,/id="rollbackReport"[^>]*tabindex="-1" hidden/);
 const start=html.indexOf('function showRollbackReport(error)');
 const end=html.indexOf('let importRevision=',start);
 assert.ok(start>=0&&end>start);
 const handler=html.slice(start,end);
 assert.match(handler,/panel\.hidden=false;[\s\S]*?panel\.focus\(\{preventScroll:true\}\)/);
 assert.match(handler,/panel\.hidden=true/);
 assert.doesNotMatch(handler,/localStorage\.(setItem|removeItem)/);
});


test('Atelier note reload must refuse a revision changed during confirmation',()=>{
 const html=read('regiekamer.html');
 const start=html.indexOf("$('loadSavedNote').addEventListener('click'");
 const end=html.indexOf("$('saveNote').addEventListener('click'",start);
 assert.ok(start>=0&&end>start);
 const handler=html.slice(start,end);
 const original=handler.indexOf('const stored=localStorage.getItem(NOTE)');
 const latest=handler.indexOf('const latest=localStorage.getItem(NOTE)');
 const compare=handler.indexOf('if(latest!==stored)');
 const baseline=handler.indexOf('noteBaseline=latest');
 assert.ok(original>=0&&latest>original&&compare>latest&&baseline>compare);
 assert.match(handler,/Laden geweigerd/);
});
