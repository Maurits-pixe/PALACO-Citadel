'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {canonical,sha}=require('./github-custodian-key-registry.cjs');
const {checkCheckpoint,checkAdvance,LIMIT}=require('./github-registry-checkpoint.cjs');
const pub=crypto.generateKeyPairSync('ed25519').publicKey;
const key={key_id:'test-key',custodian_id:'test-custodian',
 public_key_pem:pub.export({type:'spki',format:'pem'}),
 spki_sha256:sha(pub.export({type:'spki',format:'der'})),status:'ACTIVE',
 valid_from:'2026-01-01T00:00:00Z',valid_until:null};
const registry=(version=1,previous=null)=>canonical({
 schema:'palaco.citadel.atelier.custodian-key-registry/1',
 version,previous_sha256:previous,keys:[key],
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false});
const cp=(registryBytes,sequence=1,prior=null,overrides={})=>canonical({
 schema:'palaco.citadel.atelier.registry-checkpoint/1',
 repository:'Maurits-pixe/PALACO-Citadel',
 registry_version:JSON.parse(registryBytes).version,registry_sha256:sha(registryBytes),
 checkpoint_sequence:sequence,previous_checkpoint_sha256:prior,
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:LIMIT,...overrides});
test('exact externally pinned checkpoint and registry match with HOLD',()=>{
 const r=registry(),c=cp(r),v=checkCheckpoint(r,sha(r),c,sha(c),1);
 assert.equal(v.result,'PINNED_CHECKPOINT_MATCH_CUSTODY_UNPROVEN');
 assert.equal(v.release_approved,false);
});
test('historically valid older checkpoint refused by pinned newer floor',()=>{
 const old=registry(),a=cp(old),next=registry(2,sha(old)),b=cp(next,2,sha(a));
 assert.throws(()=>checkCheckpoint(old,sha(old),a,sha(a),2),/rolled back/);
 assert.equal(checkCheckpoint(next,sha(next),b,sha(b),2).checkpoint_sequence,2);
});
test('uncheckpointed registry, changed pin and mismatched registry hash fail closed',()=>{
 const old=registry(),a=cp(old),next=registry(2,sha(old));
 assert.throws(()=>checkCheckpoint(next,sha(next),a,sha(a),1),/does not match/);
 assert.throws(()=>checkCheckpoint(old,sha(old),a,'0'.repeat(64),1),/Unpinned/);
 assert.throws(()=>checkCheckpoint(old,'0'.repeat(64),a,sha(a),1),/independently pinned/);
});
test('forged release flag and extra checkpoint field are refused',()=>{
 const r=registry(),a=cp(r,1,null,{release_approved:true});
 assert.throws(()=>checkCheckpoint(r,sha(r),a,sha(a),1),/authorization/);
 const b=cp(r,1,null,{new_authority:'GO'});
 assert.throws(()=>checkCheckpoint(r,sha(r),b,sha(b),1),/schema/);
});
test('checkpoint chain rejects forks, skipped sequence, rollback and wrong pin',()=>{
 const r=registry(),a=cp(r),next=registry(2,sha(r)),b=cp(next,2,sha(a));
 assert.equal(checkAdvance(a,sha(a),b,sha(b)).checkpoint_sequence,2);
 const skipped=cp(next,3,sha(a));
 assert.throws(()=>checkAdvance(a,sha(a),skipped,sha(skipped)),/rollback|fork|skipped/);
 const fork=cp(next,2,'f'.repeat(64));
 assert.throws(()=>checkAdvance(a,sha(a),fork,sha(fork)),/rollback|fork|skipped/);
 assert.throws(()=>checkAdvance(a,'0'.repeat(64),b,sha(b)),/not pinned/);
});
test('noncanonical checkpoint, absent minimum and forged sequence fail closed',()=>{
 const r=registry(),a=cp(r);
 assert.throws(()=>checkCheckpoint(r,sha(r),Buffer.concat([a,Buffer.from(' ')]),
 sha(Buffer.concat([a,Buffer.from(' ')])),1),/schema/);
 assert.throws(()=>checkCheckpoint(r,sha(r),a,sha(a),0),/minimum/);
 assert.throws(()=>checkCheckpoint(r,sha(r),a,sha(a),2),/rolled back/);
});
