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
 assert.match(html,/notes\.filter\(n=>n\.kind===selected\)/);
});
