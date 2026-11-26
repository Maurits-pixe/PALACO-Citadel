'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {sha,canonical}=require('./github-custodian-key-registry.cjs');
const {LIMIT}=require('./github-registry-checkpoint.cjs');
const {CONTEXT}=require('./github-checkpoint-witness.cjs');
const {base,verifyLedger}=require('./github-incident-ledger.cjs');
const {authenticatedAppend}=require('./github-authenticated-incident.cjs');
const keys=[crypto.generateKeyPairSync('ed25519'),crypto.generateKeyPairSync('ed25519')];
const trust=keys.map((k,i)=>({observerId:'observer-'+(i+1),
 publicKeyPem:k.publicKey.export({format:'pem',type:'spki'}),
 spkiSha256:sha(k.publicKey.export({format:'der',type:'spki'}))}));
const registry=canonical({schema:'palaco.citadel.atelier.custodian-key-registry/1',
 version:1,previous_sha256:null,keys:[{key_id:'archive-key',
 custodian_id:'archive-custodian',public_key_pem:trust[0].publicKeyPem,
 spki_sha256:trust[0].spkiSha256,status:'ACTIVE',
 valid_from:'2026-01-01T00:00:00Z',valid_until:null}],
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false});
const cp=canonical({schema:'palaco.citadel.atelier.registry-checkpoint/1',
 repository:'Maurits-pixe/PALACO-Citadel',registry_version:1,
 registry_sha256:sha(registry),checkpoint_sequence:1,
 previous_checkpoint_sha256:null,decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,limitation:LIMIT});
function signed(i,change={}){
 const payload={schema:'palaco.citadel.atelier.checkpoint-witness/1',
 observer_id:trust[i].observerId,repository:'Maurits-pixe/PALACO-Citadel',
 checkpoint_sequence:1,checkpoint_sha256:sha(cp),registry_version:1,
 registry_sha256:sha(registry),observation_nonce:(i?'b':'a').repeat(64),
 ...change};
 return canonical({payload,signature:crypto.sign(null,
 Buffer.concat([Buffer.from(CONTEXT),canonical(payload)]),
 keys[i].privateKey).toString('base64url')});
}
function evidence(conflict=false){
 return {first:signed(0),second:signed(1,conflict?{checkpoint_sha256:'f'.repeat(64)}:{}),
 trustA:trust[0],trustB:trust[1],registry,checkpoint:cp,
 registryPin:sha(registry),checkpointPin:sha(cp),minSequence:1};
}
const empty=()=>canonical(base());
test('signed conflicting witnesses open an incident and remain HOLD',()=>{
 const r=authenticatedAppend(empty(),'OPEN','incident-001',evidence(true));
 assert.equal(r.report.incident,true);
 assert.equal(r.ledger.records.length,1);
 assert.equal(r.proof.release_approved,false);
 assert.equal(r.proof.first_witness_sha256,sha(evidence(true).first));
 assert.equal(verifyLedger(canonical(r.ledger)).open.has('incident-001'),true);
});
test('agreement cannot fabricate OPEN; disagreement cannot fabricate recovery',()=>{
 assert.throws(()=>authenticatedAppend(empty(),'OPEN','incident-001',evidence()),/does not authorize/);
 const opened=authenticatedAppend(empty(),'OPEN','incident-001',evidence(true));
 assert.throws(()=>authenticatedAppend(canonical(opened.ledger),
 'RECOVERY_RECORDED','incident-001',evidence(true)),/does not authorize/);
});
test('verified agreement records recovery but never grants release',()=>{
 const opened=authenticatedAppend(empty(),'OPEN','incident-001',evidence(true));
 const recovered=authenticatedAppend(canonical(opened.ledger),
 'RECOVERY_RECORDED','incident-001',evidence());
 assert.equal(recovered.ledger.records.length,2);
 assert.equal(verifyLedger(canonical(recovered.ledger)).open.size,0);
 assert.equal(recovered.proof.publication,'DENY');
});
test('modified signature or wrong trusted pin are rejected',()=>{
 const e=evidence(true);
 const tampered=JSON.parse(e.first);tampered.payload.observation_nonce='e'.repeat(64);
 e.first=canonical(tampered);
 assert.throws(()=>authenticatedAppend(empty(),'OPEN','incident-001',e),/signature/);
 const wrong=evidence(true);wrong.trustB={...wrong.trustB,spkiSha256:'d'.repeat(64)};
 assert.throws(()=>authenticatedAppend(empty(),'OPEN','incident-001',wrong),/Untrusted/);
});
test('duplicate incident and externally pinned ledger rollback are refused',()=>{
 const opened=authenticatedAppend(empty(),'OPEN','incident-001',evidence(true));
 assert.throws(()=>authenticatedAppend(canonical(opened.ledger),
 'OPEN','incident-001',evidence(true)),/Duplicate/);
 assert.throws(()=>authenticatedAppend(empty(),'OPEN','incident-002',evidence(true),
 {sequence:1,head:opened.ledger.records[0].record_sha256}),/truncated/);
});
test('forged JSON reports cannot substitute for signed witness inputs',()=>{
 const e=evidence(true);
 e.first=canonical({schema:'palaco.citadel.atelier.checkpoint-witness-incident/1',incident:true});
 assert.throws(()=>authenticatedAppend(empty(),'OPEN','incident-001',e),/Noncanonical/);
 assert.throws(()=>authenticatedAppend(empty(),'OPEN','incident-001',{}),/Raw signed/);
});
