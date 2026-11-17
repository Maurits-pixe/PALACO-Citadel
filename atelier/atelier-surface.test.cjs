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
  assert.match(read('regiekamer.html'),/api\.restoreWithRecovery\(localStorage,pack,current\)/);
  assert.match(read('regiekamer.html'),/api\.undoLastImport\(localStorage,before\)/);
  assert.match(read('regiekamer.html'),/id="exportRecovery" disabled/);
  assert.match(read('regiekamer.html'),/api\.getRecovery\(localStorage\)/);
  assert.match(read('regiekamer.html'),/id="bundleVerify"/);
  assert.match(read('regiekamer.html'),/crypto\.subtle\.digest\('SHA-256',bytes\)/);
  assert.match(read('regiekamer.html'),/id="expectedFingerprint"/);
  assert.match(read('regiekamer.html'),/fingerprint===reference\.toLowerCase\(\)/);
  assert.match(read('regiekamer.html'),/WAARSCHUWING: SHA-256 KOMT NIET OVEREEN/);
});
test('original New Citadel identity wizard is still linked and cannot authorize',()=>{
  const wizard=read('wizard.html');
  assert.match(wizard,/New Citadel/);
  assert.match(wizard,/RIO/);
  assert.match(wizard,/DRAFT/);
  assert.match(wizard,/href="\.\/studio\.html"/);
  assert.match(wizard,/href="\.\/regiekamer\.html"/);
});
