import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const root=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../../app.js',import.meta.url),'utf8');

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
 assert.match(html,/file\.size>262144/);
 assert.match(html,/data\.format!=="palaco-la-observatory-local-v1"/);
 assert.match(html,/data\.authority!=="SELF_REPORTED_NOT_VERIFIED"/);
 assert.match(html,/data\.notes\.length>max/);
 assert.match(html,/data\.notes\.every\(valid\)/);
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
 assert.match(html,/Array\.isArray\(data\)/);
 assert.match(html,/!Array\.isArray\(n\)/);
});

test('memory search combines classification and text without changing evidence status',()=>{
 assert.match(html,/id="search" type="search"/);
 assert.match(html,/\$\("search"\)\.addEventListener\("input",render\)/);
 assert.match(html,/n\.subject,n\.notes,n\.reference/);
 assert.match(html,/SELF_REPORTED_NOT_VERIFIED/);
 assert.match(html,/small\.textContent=n\.kind/);
});
