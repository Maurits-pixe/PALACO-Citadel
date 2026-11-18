import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const root=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/la-observatorium.yml',import.meta.url),'utf8');

test('embedded Observatorium script parses as JavaScript',()=>{
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match,'inline code present');
 assert.doesNotThrow(()=>new Script(match[1],{filename:'observatorium.js'}));
});
test('Citadel contains link and translations for existing locales',()=>{
 assert.match(root,/href="\/DOCS\/la-observatorium\/"/);
 assert.match(app,/previewObservatorium: 'Observatory · read-only'/);
 assert.match(app,/previewObservatorium: 'Observatorium · alleen lezen'/);
 assert.match(app,/previewObservatorium: 'Observejo · nurlegebla'/);
});
test('observations remain self-reported and never become authorized',()=>{
 assert.match(html,/SELF_REPORTED_NOT_VERIFIED/);
 assert.match(html,/READ ONLY/);
 assert.match(html,/Live verbinding: NIET AANGESLOTEN/);
 assert.doesNotMatch(html,/fetch\s*\(|XMLHttpRequest|WebSocket\s*\(/);
});
test('local storage requires consent marker and supports deletion',()=>{
 assert.match(html,/CONSENT="palaco_la_observatory_consent_v1"/);
 assert.match(html,/getItem\(CONSENT\)==="yes"/);
 assert.match(html,/setItem\(CONSENT,"yes"\)/);
 assert.match(html,/removeItem\(CONSENT\)/);
 assert.match(html,/if\(storageEnabled\)save\(\)/);
});
test('timeline permits classification and invalid stored dates are rejected',()=>{
 assert.match(html,/id="filter"/);
 assert.match(html,/Number\.isFinite\(Date\.parse\(n\.at\)\)/);
 assert.match(html,/notes\.filter\(n=>\(selected==="ALL"\|\|n\.kind===selected\)/);
});

test('JSON journal import has strict schema, size and count limits',()=>{
 assert.match(html,/file\.size===0\|\|file\.size>262144/);
 assert.match(html,/data\.format!=="palaco-la-observatory-local-v1"/);
 assert.match(html,/data\.authority!=="SELF_REPORTED_NOT_VERIFIED"/);
 assert.match(html,/data\.notes\.length>max/);
 assert.match(html,/data\.notes\.every\(n=>ownKeysEqual\(n,\["id","at","subject","kind","reference","notes"\]\)&&valid\(n\)\)/);
 assert.match(html,/fileIds\.has\(n\.id\)/);
 assert.match(html,/notes\.length\+incoming\.length>max/);
 assert.match(html,/Import geweigerd/);
});

test('import requires explicit acknowledgement before changing journal',()=>{
 assert.match(html,/if\(!incoming\.length\)/);
 assert.match(html,/if\(!confirm\(incoming\.length/);
 const confirmation=html.indexOf('if(!confirm(incoming.length');
 const mutation=html.indexOf('notes=notes.concat(incoming)');
 assert.ok(confirmation>=0 && mutation>confirmation);
 assert.match(html,/Import geannuleerd; er zijn geen notities toegevoegd/);
});
test('import rejects empty, oversized or array-shaped envelopes',()=>{
 assert.match(html,/file\.size===0\|\|file\.size>262144/);
 assert.match(html,/new TextEncoder\(\)\.encode\(raw\)\.length>262144/);
 assert.match(html,/ownKeysEqual\(data,\["format","exported_at","authority","notes"\]\)/);
 assert.match(html,/!Array\.isArray\(n\)/);
});

test('memory search combines classification and text without changing evidence status',()=>{
 assert.match(html,/id="search" type="search"/);
 assert.match(html,/\$\("search"\)\.addEventListener\("input",render\)/);
 assert.match(html,/n\.subject,n\.notes,n\.reference/);
 assert.match(html,/SELF_REPORTED_NOT_VERIFIED/);
 assert.match(html,/small\.textContent=n\.kind/);
});

test('memory inspection navigates to proof room without elevating authority',()=>{
 assert.match(html,/id="inspection" aria-live="polite"/);
 assert.match(html,/inspect\.addEventListener\("click",\(\)=>inspectNote\(n\.id\)\)/);
 assert.match(html,/function inspectNote\(id\)/);
 assert.match(html,/showTab\("bewijs"\)/);
 assert.match(html,/inspection-subject"\)\.textContent=n\.subject/);
 assert.match(html,/inspection-reference"\)\.textContent=n\.reference/);
 assert.match(html,/Quay: NIET AANGESLOTEN/);
 assert.match(html,/ERA\/EDTR: NIET GECONTROLEERD/);
 assert.match(html,/WATERMERK: GEEN VALIDATIE/);
 assert.match(html,/Mandaat: GEEN/);
});
test('stale note inspection is cleared if local journal changes',()=>{
 assert.match(html,/if\(selectedId&&!notes\.some\(x=>x\.id===selectedId\)\)clearInspection\(\)/);
 assert.match(html,/function clearInspection\(\)/);
});

test('manual source labels never certify Quay, ERA or WATERMERK claims',()=>{
 assert.match(html,/function referenceDescriptor\(reference\)/);
 assert.match(html,/QUAY\|ERA\|WATERMERK/);
 assert.match(html,/HANDMATIG LABEL/);
 assert.match(html,/BRON ONTBREEKT/);
 assert.match(html,/inspection-reference-state/);
 assert.match(html,/NIET GEVERIFIEERD/);
});
test('conflicting duplicate IDs fail closed before any import mutation',()=>{
 assert.match(html,/if\(ids\.has\(n\.id\)\)/);
 assert.match(html,/tegenstrijdige gegevens/);
 const conflict=html.indexOf('Import geweigerd: bestaand ID heeft tegenstrijdige gegevens.');
 const mutation=html.indexOf('notes=notes.concat(incoming)');
 assert.ok(conflict>=0&&conflict<mutation);
});

test('inspection dossier is locally downloadable only with WebCrypto SHA-256',()=>{
 assert.match(html,/id="inspection-export"/);
 assert.match(html,/function downloadJSON\(data,name\)/);
 assert.match(html,/async function exportInspection\(\)/);
 assert.match(html,/crypto\.subtle\.digest\("SHA-256",bytes\)/);
 assert.match(html,/new TextEncoder\(\)\.encode\(JSON\.stringify\(content\)\)/);
 assert.match(html,/UTF8_JSON_STRINGIFY_CONTENT_V1/);
 assert.match(html,/INTEGRITY_ONLY_NOT_AUTHENTICITY/);
 assert.match(html,/source_status:"SELF_REPORTED_NOT_VERIFIED"/);
 assert.match(html,/authority:"NONE"/);
 assert.match(html,/if\(!globalThis\.crypto\|\|!crypto\.subtle/);
 assert.match(html,/exportInspection\);/);
});

test('offline dossier verifier validates strict envelope and reports integrity only',()=>{
 assert.match(html,/id="dossier-file"/);
 assert.match(html,/id="verify-dossier"/);
 assert.match(html,/function validateDossier\(packet\)/);
 assert.match(html,/ownKeysEqual\(packet,\["schema","observation","source_status","verification","integrity"\]\)/);
 assert.match(html,/packet\.integrity\.meaning==="INTEGRITY_ONLY_NOT_AUTHENTICITY"/);
 assert.match(html,/packet\.verification\.authority!=="NONE"/);
 assert.match(html,/current===packet\.integrity\.digest/);
 assert.match(html,/INTEGRITEIT KOMT OVEREEN/);
 assert.match(html,/INTEGRITEIT AFGEWEZEN/);
 assert.match(html,/authenticiteit NIET GEVERIFIEERD/);
 assert.match(html,/\$\("verify-dossier"\)\.addEventListener\("click",verifyDossier\)/);
});
test('inspection exporter and verifier share the exact serialization',()=>{
 assert.match(html,/function inspectionContent\(n\)/);
 assert.match(html,/const content=inspectionContent\(n\)/);
 assert.match(html,/const sha256=await digestContent\(content\)/);
 assert.match(html,/const current=await digestContent\(content\)/);
 assert.match(html,/new TextEncoder\(\)\.encode\(JSON\.stringify\(content\)\)/);
});

test('five observatory chapters expose keyboard accessible WAI-ARIA tab semantics',()=>{
 assert.match(html,/role="tablist" aria-label="Observatorium hoofdstukken"/);
 for(const id of ['uitkijk','bewijs','geheugen','wacht','atelier']){
  assert.match(html,new RegExp('id="tab-'+id+'" role="tab"'));
  assert.match(html,new RegExp('id="'+id+'" class="section[^"]*" role="tabpanel"'));
 }
 assert.match(html,/function activateTab\(btn\)/);
 assert.match(html,/e\.key==="ArrowRight"/);
 assert.match(html,/e\.key==="ArrowLeft"/);
 assert.match(html,/e\.key==="Home"/);
 assert.match(html,/e\.key==="End"/);
 assert.match(html,/selected\.focus\(\)/);
});

test('CI guards feature-branch pushes and remains read-only',()=>{
 assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- 'feature\/la-observatorium-readonly-20261117'/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.match(workflow,/\.\/DOCS\/la-observatorium\/node_modules\/\.bin\/playwright install --with-deps chromium/);
 assert.match(workflow,/npm install --prefix DOCS\/la-observatorium --no-save --package-lock=false --ignore-scripts playwright@1\.56\.1/);
 assert.match(workflow,/working-directory: DOCS\/la-observatorium/);
 assert.match(workflow,/version !== '1\.56\.1'/);
 assert.match(workflow,/chromium\.executablePath\(\)/);
 assert.match(workflow,/set -o pipefail/);
 assert.match(workflow,/--test-reporter=tap/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/retention-days: 14/);
 assert.doesNotMatch(workflow,/\b(?:deploy|pages: write|contents: write)\b/i);
});

test('dossier integrity verdict is invalidated on file change and stale async results discarded',()=>{
 assert.match(html,/let dossierVerificationRun=0/);
 assert.match(html,/\$\("dossier-file"\)\.addEventListener\("change"/);
 assert.match(html,/Nieuw dossier geselecteerd · controle nog niet uitgevoerd/);
 assert.match(html,/const run=\+\+dossierVerificationRun/);
 assert.match(html,/if\(run!==dossierVerificationRun\)return/);
 assert.match(html,/if\(run===dossierVerificationRun\)output\.textContent/);
 assert.match(html,/if\(run===dossierVerificationRun\)\$\("dossier-file"\)\.value=""/);
});

test('orphaned notes are removed at startup without explicit consent marker',()=>{
 assert.match(html,/else\{localStorage\.removeItem\(KEY\);localStorage\.removeItem\(CONSENT\);\}/);
 assert.match(html,/storageEnabled=localStorage\.getItem\(CONSENT\)==="yes"/);
});

test('malformed or duplicate offline journals quarantine rather than overwrite the original',()=>{
 assert.match(html,/function validStoredNotes\(value\)/);
 assert.match(html,/value\.every\(valid\)/);
 assert.match(html,/new Set\(value\.map\(n=>n\.id\)\)\.size===value\.length/);
 assert.match(html,/storageRecoveryBlocked=true;storageEnabled=false;notes=\[\]/);
 assert.match(html,/if\(storageRecoveryBlocked\)\{status\("Opslag geblokkeerd/);
 assert.match(html,/id="storage-reset"/);
 assert.match(html,/Onleesbare lokale kopie en toestemmingsmarkering definitief wissen/);
 assert.match(html,/\$\("persist"\)\.disabled=storageRecoveryBlocked/);
});

test('offline write and consent revocation must be confirmed before success',()=>{
 assert.match(html,/function save\(\)/);
 assert.match(html,/localStorage\.getItem\(KEY\)!==serialized/);
 assert.match(html,/localStorage\.getItem\(KEY\)!==null\|\|localStorage\.getItem\(CONSENT\)!==null/);
 assert.match(html,/storageRecoveryBlocked=true/);
 assert.match(html,/\$\("persist"\)\.disabled=true/);
 assert.match(html,/WISSEN NIET BEVESTIGD/);
 assert.match(html,/OPSLAG ONBEVESTIGD/);
 assert.match(html,/if\(save\(\)\)status\(/);
 assert.match(html,/Lokale opslagstatus onbekend/);
});

test('offline notes have unique IDs when randomUUID is unavailable and report storage failures accurately',()=>{
 assert.match(html,/function nextLocalId\(\)/);
 assert.match(html,/if\(random&&typeof random\.randomUUID==="function"\)/);
 assert.match(html,/do\{id="local-"/);
 assert.match(html,/while\(notes\.some\(n=>n\.id===id\)\)/);
 assert.match(html,/const persisted=save\(\)/);
 assert.match(html,/Waarneming alleen in dit tabblad toegevoegd; opslag is geblokkeerd of niet bevestigd/);
});

test('damaged offline journal can be backed up without mutation before destructive reset',()=>{
 assert.match(html,/id="storage-backup"/);
 assert.match(html,/\$\("storage-backup"\)\.addEventListener\("click"/);
 assert.match(html,/const raw=localStorage\.getItem\(KEY\)/);
 assert.match(html,/la-observatorium-onleesbare-kopie\.txt/);
 assert.match(html,/Onleesbare kopie lokaal gedownload; geen validatie of bewijsstatus/);
 assert.match(html,/\$\("storage-backup"\)\.classList\.add\("hidden"\)/);
});

test('normal import and clear cannot bypass protected corrupt-storage recovery',()=>{
 assert.match(html,/if\(storageRecoveryBlocked\)\{status\("Import geblokkeerd/);
 assert.match(html,/if\(storageRecoveryBlocked\|\|journalRevision!==startedAtRevision\)\{status\("Import afgebroken/);
 assert.match(html,/if\(storageRecoveryBlocked\)\{status\("Wissen geblokkeerd/);
 assert.match(html,/const persisted=save\(\);render\(\)/);
 assert.match(html,/blijvende opslag NIET bevestigd/);
 assert.match(html,/const cleared=save\(\);\s*if\(!cleared\)notes=pendingNotes;\s*else journalRevision\+\+;\s*render\(\)/);
 assert.match(html,/Wissen NIET bevestigd; de notities blijven in dit tabblad beschikbaar/);
});

test('clear-all revokes storage consent before reporting persistent erasure',()=>{
 assert.match(html,/Alle lokale waarnemingen in dit tabblad en de lokale opslag wissen\? Ook de bewaartoestemming wordt ingetrokken/);
 assert.match(html,/const pendingNotes=notes;\s*notes=\[\];\s*\$\("persist"\)\.checked=false;\s*const cleared=save\(\);\s*if\(!cleared\)notes=pendingNotes;\s*else journalRevision\+\+;\s*render\(\)/);
 assert.match(html,/Lokale notities, opgeslagen kopie en bewaartoestemming aantoonbaar verwijderd/);
});

test('failed clear retains local notes for inspection and manual export',()=>{
 assert.match(html,/if\(!cleared\)notes=pendingNotes/);
 assert.match(html,/Wissen NIET bevestigd; de notities blijven in dit tabblad beschikbaar voor export of herstel/);
});

test('asynchronous import aborts when local journal changes during file reading or confirmation',()=>{
 assert.match(html,/let journalRevision=0/);
 assert.match(html,/const startedAtRevision=journalRevision/);
 assert.match(html,/journalRevision!==startedAtRevision/);
 assert.match(html,/Import afgebroken: lokaal Geheugen is tijdens het lezen gewijzigd/);
 assert.match(html,/Import afgebroken: lokaal Geheugen is tijdens de bevestiging gewijzigd/);
 assert.match(html,/notes\.push\(n\);journalRevision\+\+/);
 assert.match(html,/notes=notes\.concat\(incoming\);journalRevision\+\+/);
 assert.match(html,/else journalRevision\+\+/);
});

test('inspection exports reject stale SHA-256 results after note or selection changes',()=>{
 assert.match(html,/let inspectionExportRun=0/);
 assert.match(html,/const run=\+\+inspectionExportRun/);
 assert.match(html,/const inspectedId=selectedId,startedAtRevision=journalRevision/);
 assert.match(html,/run!==inspectionExportRun\|\|selectedId!==inspectedId\|\|journalRevision!==startedAtRevision\|\|storageRecoveryBlocked/);
 assert.match(html,/Export afgebroken: selectie, Geheugen of opslagstatus is tussentijds gewijzigd/);
});

test('local journal imports reject unexpected authority-like fields and bad export metadata',()=>{
 assert.match(html,/ownKeysEqual\(data,\["format","exported_at","authority","notes"\]\)/);
 assert.match(html,/Number\.isFinite\(Date\.parse\(data\.exported_at\)\)/);
 assert.match(html,/data\.notes\.every\(n=>ownKeysEqual\(n,\["id","at","subject","kind","reference","notes"\]\)&&valid\(n\)\)/);
});

test('browser acceptance records CI-only screenshots and runtime errors when a journey fails',()=>{
 const browser=readFileSync(new URL('./browser-acceptance.test.mjs',import.meta.url),'utf8');
 assert.match(browser,/if\(process\.env\.CI\)/);
 assert.match(browser,/page\.screenshot\(\{path:prefix\+'\.png'/);
 assert.match(browser,/pageerrors=/);
 assert.match(browser,/throw error;/);
 assert.match(browser,/test-results/);
});
