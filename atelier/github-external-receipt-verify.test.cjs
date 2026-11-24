'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {verifyReceipt,canonical,MSG,SCHEMA}=require('./github-external-receipt-verify.cjs');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const pem=publicKey.export({format:'pem',type:'spki'});
const pin=crypto.createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex');
const handoff={schema:'palaco.citadel.atelier.custody-handoff/1',
 custody_state:'NOT_EXTERNALLY_ACKNOWLEDGED',decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,repository:'Maurits-pixe/PALACO-Citadel',
 pr_number:60,candidate_sha:'a'.repeat(40),run_id:123,run_attempt:1,
 source_artifact_id:456,diagnostic_artifact_id:789,
 archive_zip_sha256:'b'.repeat(64),archive_manifest_sha256:'c'.repeat(64)};
const handoffBytes=canonical(handoff);
function signed(patch={}){
 const payload={schema:SCHEMA,custodian_id:'test-custodian',
 handoff_sha256:crypto.createHash('sha256').update(handoffBytes).digest('hex'),
 archive_zip_sha256:handoff.archive_zip_sha256,
 archive_manifest_sha256:handoff.archive_manifest_sha256,
 repository:handoff.repository,pr_number:60,candidate_sha:handoff.candidate_sha,
 run_id:123,run_attempt:1,source_artifact_id:456,diagnostic_artifact_id:789,
 received_at:'2026-11-24T10:00:00Z',receipt_nonce:'d'.repeat(64),...patch};
 const signature=crypto.sign(null,Buffer.concat([Buffer.from(MSG),canonical(payload)]),privateKey).toString('base64url');
 return canonical({payload,signature});
}
const check=(receipt,other=handoffBytes,key=pem,who='test-custodian',fingerprint=pin)=>
 verifyReceipt(receipt,other,key,who,fingerprint);
test('synthetic independently signed receipt validates signature but never grants GO',()=>{
 const r=check(signed());
 assert.equal(r.result,'SIGNATURE_VALID_NOT_INDEPENDENT_CUSTODY_PROVEN');
 assert.equal(r.decision,'HOLD');assert.equal(r.release_approved,false);
});
test('modified receipt signature and payload are rejected',()=>{
 const a=JSON.parse(signed());a.payload.receipt_nonce='e'.repeat(64);
 assert.throws(()=>check(canonical(a)),/signature/);
 const b=JSON.parse(signed());b.signature='A'.repeat(86);
 assert.throws(()=>check(canonical(b)),/signature/);
});
test('mismatched ZIP, run and artifact binding never pass',()=>{
 for(const patch of [{archive_zip_sha256:'e'.repeat(64)},{run_id:124},
 {diagnostic_artifact_id:790},{candidate_sha:'f'.repeat(40)}])
 assert.throws(()=>check(signed(patch)),/mismatch/);
});
test('different signer key, key pin and custodian identity denied',()=>{
 const other=crypto.generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'});
 assert.throws(()=>check(signed(),handoffBytes,other),/Untrusted/);
 assert.throws(()=>check(signed(),handoffBytes,pem,'different-custodian'),/Invalid external receipt identity/);
 assert.throws(()=>check(signed(),handoffBytes,pem,'test-custodian','0'.repeat(64)),/Untrusted/);
});
test('missing, noncanonical, extra fields and forged authority rejected',()=>{
 assert.throws(()=>check(Buffer.alloc(0)),/Missing/);
 assert.throws(()=>check(Buffer.concat([signed(),Buffer.from(' ')])),/Noncanonical/);
 const a=JSON.parse(signed());a.payload.release_approved=true;
 assert.throws(()=>check(canonical(a)),/Noncanonical/);
 const b=JSON.parse(signed());b.extra='false';
 assert.throws(()=>check(canonical(b)),/Noncanonical/);
 const h={...handoff,release_approved:true};
 assert.throws(()=>check(signed(),canonical(h)),/mismatch/);
});
