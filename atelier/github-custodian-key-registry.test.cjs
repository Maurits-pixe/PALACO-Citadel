'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseRegistry,checkEvolution,verifyWithRegistry,canonical,sha}=require('./github-custodian-key-registry.cjs');
const {MSG,SCHEMA}=require('./github-external-receipt-verify.cjs');
const keys=Array.from({length:2},()=>crypto.generateKeyPairSync('ed25519'));
const entries=keys.map((pair,i)=>({
 key_id:'key-'+(i+1),custodian_id:'custodian-test',
 public_key_pem:pair.publicKey.export({format:'pem',type:'spki'}),
 spki_sha256:sha(pair.publicKey.export({format:'der',type:'spki'})),
 status:i===0?'ACTIVE':'REVOKED',valid_from:'2026-01-01T00:00:00Z',valid_until:null
}));
const registry=(version=1,previous=null,records=entries)=>({
 schema:'palaco.citadel.atelier.custodian-key-registry/1',version,previous_sha256:previous,keys:records,
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false});
const handoff={schema:'palaco.citadel.atelier.custody-handoff/1',custody_state:'NOT_EXTERNALLY_ACKNOWLEDGED',
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 repository:'Maurits-pixe/PALACO-Citadel',pr_number:60,candidate_sha:'a'.repeat(40),
 run_id:123,run_attempt:1,source_artifact_id:456,diagnostic_artifact_id:789,
 archive_zip_sha256:'b'.repeat(64),archive_manifest_sha256:'c'.repeat(64)};
const handoffBytes=canonical(handoff);
function signed(receivedAt='2026-11-24T10:00:00Z',pair=keys[0]){
 const p={schema:SCHEMA,custodian_id:'custodian-test',
 handoff_sha256:sha(handoffBytes),archive_zip_sha256:handoff.archive_zip_sha256,
 archive_manifest_sha256:handoff.archive_manifest_sha256,repository:handoff.repository,
 pr_number:60,candidate_sha:handoff.candidate_sha,run_id:123,run_attempt:1,
 source_artifact_id:456,diagnostic_artifact_id:789,
 received_at:receivedAt,receipt_nonce:'f'.repeat(64)};
 return canonical({payload:p,signature:crypto.sign(null,Buffer.concat([Buffer.from(MSG),canonical(p)]),pair.privateKey).toString('base64url')});
}
test('pinned registry validates valid signature but remains HOLD',()=>{
 const b=canonical(registry()),out=verifyWithRegistry(signed(),handoffBytes,b,sha(b),'custodian-test','key-1');
 assert.equal(out.result,'PINNED_REGISTRY_SIGNATURE_VALID_CUSTODY_UNPROVEN');
 assert.equal(out.registry_version,1);assert.equal(out.release_approved,false);
});
test('unknown registry hash, changed bytes and forged approval are denied',()=>{
 const b=canonical(registry());
 assert.throws(()=>parseRegistry(b,'0'.repeat(64)),/independently pinned/);
 const bad=canonical({...registry(),release_approved:true});
 assert.throws(()=>parseRegistry(bad,sha(bad)),/HOLD/);
 assert.throws(()=>verifyWithRegistry(signed(),handoffBytes,b,'0'.repeat(64),'custodian-test','key-1'),/pinned/);
});
test('revoked and unknown signer keys are refused even with valid signature',()=>{
 const b=canonical(registry());
 assert.throws(()=>verifyWithRegistry(signed(undefined,keys[1]),handoffBytes,b,sha(b),'custodian-test','key-2'),/revoked/);
 assert.throws(()=>verifyWithRegistry(signed(),handoffBytes,b,sha(b),'custodian-test','missing-key'),/revoked/);
});
test('rotation cutoff and historical receipt time are enforced',()=>{
 const old=canonical(registry()),newRecords=[{...entries[0],status:'RETIRED',valid_until:'2026-11-24T09:00:00Z'},entries[1]];
 const next=canonical(registry(2,sha(old),newRecords));
 assert.equal(checkEvolution(old,sha(old),next,sha(next)).version,2);
 assert.throws(()=>verifyWithRegistry(signed(),handoffBytes,next,sha(next),'custodian-test','key-1'),/outside/);
 const previous=verifyWithRegistry(signed('2026-11-24T08:00:00Z'),handoffBytes,next,sha(next),'custodian-test','key-1');
 assert.equal(previous.decision,'HOLD');
});
test('rollback, resurrection, substitution and duplicate IDs are refused',()=>{
 const old=canonical(registry());
 const badVersion=canonical(registry(3,sha(old)));
 assert.throws(()=>checkEvolution(old,sha(old),badVersion,sha(badVersion)),/monotonic/);
 const revive=canonical(registry(2,sha(old),[entries[0],{...entries[1],status:'ACTIVE'}]));
 assert.throws(()=>checkEvolution(old,sha(old),revive,sha(revive)),/resurrected/);
 const swap=canonical(registry(2,sha(old),[{...entries[0],public_key_pem:entries[1].public_key_pem,spki_sha256:entries[1].spki_sha256},entries[1]]));
 assert.throws(()=>checkEvolution(old,sha(old),swap,sha(swap)),/Duplicate|identity/);
 const duplicate=canonical(registry(1,null,[entries[0],entries[0]]));
 assert.throws(()=>parseRegistry(duplicate,sha(duplicate)),/Duplicate/);
});
test('malformed time windows and noncanonical records fail closed',()=>{
 const bad=canonical(registry(1,null,[{...entries[0],valid_from:'2026-02-30T00:00:00Z'}]));
 assert.throws(()=>parseRegistry(bad,sha(bad)),/UTC/);
 const malformed=Buffer.concat([canonical(registry()),Buffer.from(' ')]);
 assert.throws(()=>parseRegistry(malformed,sha(malformed)),/schema/);
});
