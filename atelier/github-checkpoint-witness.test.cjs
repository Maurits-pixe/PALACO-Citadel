'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sha,canonical}=require('./github-custodian-key-registry.cjs');
const {LIMIT}=require('./github-registry-checkpoint.cjs');
const {inspect,requireAgreement,CONTEXT}=require('./github-checkpoint-witness.cjs');
const pairs=Array.from({length:2},()=>crypto.generateKeyPairSync('ed25519'));
const trust=pairs.map((pair,i)=>({
 observerId:'observer-'+(i+1),publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}),
 spkiSha256:sha(pair.publicKey.export({type:'spki',format:'der'}))
}));
const registry=canonical({schema:'palaco.citadel.atelier.custodian-key-registry/1',
 version:1,previous_sha256:null,keys:[{
  key_id:'test-archive-key',custodian_id:'test-custodian',
  public_key_pem:pairs[0].publicKey.export({type:'spki',format:'pem'}),
  spki_sha256:trust[0].spkiSha256,status:'ACTIVE',
  valid_from:'2026-01-01T00:00:00Z',valid_until:null}],
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false});
const cp=canonical({schema:'palaco.citadel.atelier.registry-checkpoint/1',
 repository:'Maurits-pixe/PALACO-Citadel',registry_version:1,registry_sha256:sha(registry),
 checkpoint_sequence:1,previous_checkpoint_sha256:null,decision:'HOLD',
 publication:'DENY',release_approved:false,evidence_usable:false,limitation:LIMIT});
function statement(i,patch={}){
 const payload={schema:'palaco.citadel.atelier.checkpoint-witness/1',
 observer_id:trust[i].observerId,repository:'Maurits-pixe/PALACO-Citadel',
 checkpoint_sequence:1,checkpoint_sha256:sha(cp),
 registry_version:1,registry_sha256:sha(registry),
 observation_nonce:(i?'b':'a').repeat(64),...patch};
 const signature=crypto.sign(null,Buffer.concat([Buffer.from(CONTEXT),canonical(payload)]),pairs[i].privateKey).toString('base64url');
 return canonical({payload,signature});
}
const check=(a=statement(0),b=statement(1),tA=trust[0],tB=trust[1],min=1)=>
 inspect(a,b,tA,tB,cp,registry,sha(registry),sha(cp),min);
test('two signed pinned observers agree and still deny release',()=>{
 const r=check();
 assert.equal(r.result,'TWO_PINNED_WITNESSES_AGREE');
 assert.equal(r.incident,false);assert.equal(r.publication,'DENY');
 assert.equal(r.release_approved,false);
});
test('split-view at same sequence emits incident and blocks approval',()=>{
 const b=statement(1,{checkpoint_sha256:'f'.repeat(64)});
 const r=check(statement(0),b);
 assert.equal(r.result,'CHECKPOINT_SPLIT_VIEW_OR_STALE_OBSERVATION');
 assert.equal(r.incident,true);
 assert.throws(()=>requireAgreement(statement(0),b,trust[0],trust[1],cp,registry,sha(registry),sha(cp),1),/incident/);
});
test('stale witness and independent minimum floor fail closed',()=>{
 assert.equal(check(statement(0),statement(1,{checkpoint_sequence:2})).incident,true);
 assert.throws(()=>check(undefined,undefined,undefined,undefined,2),/rolled back/);
});
test('tampered signatures, payload and duplicate witness keys are rejected',()=>{
 const a=JSON.parse(statement(0));a.payload.observation_nonce='e'.repeat(64);
 assert.throws(()=>check(canonical(a)),/signature/);
 assert.throws(()=>check(statement(0),statement(1),trust[0],trust[0]),/distinct/);
});
test('wrong pin, unknown fields and noncanonical JSON are rejected',()=>{
 assert.throws(()=>check(statement(0),statement(1),{...trust[0],spkiSha256:'f'.repeat(64)}),/Untrusted/);
 const a=JSON.parse(statement(0));a.extra='GO';
 assert.throws(()=>check(canonical(a)),/Noncanonical/);
 assert.throws(()=>check(Buffer.concat([statement(0),Buffer.from(' ')])),/Noncanonical/);
});
test('forged signature authority and wrong observer identity are rejected',()=>{
 assert.throws(()=>check(statement(0,{release_approved:true})),/Noncanonical/);
 assert.throws(()=>check(statement(0,{observer_id:'other-observer'})),/identity/);
});
