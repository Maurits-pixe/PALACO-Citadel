'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {canonical,sha}=require('./github-custodian-key-registry.cjs');
const {verify,DOMAIN}=require('./github-manual-recovery-review.cjs');
const pairs=[crypto.generateKeyPairSync('ed25519'),crypto.generateKeyPairSync('ed25519')];
const trusts=pairs.map((k,i)=>({reviewerId:'reviewer-'+i,
 publicKeyPem:k.publicKey.export({format:'pem',type:'spki'}),
 spkiSha256:sha(k.publicKey.export({format:'der',type:'spki'}))}));
const assessment=canonical({schema:'palaco.citadel.atelier.recovery-assessment/1',
 result:'QUARANTINED_ARCHIVE_INTEGRITY_CHECK_PASSED',
 recovery_authorized:false,promotion_performed:false,
 sequence:1,head_sha256:'a'.repeat(64),commit_name:'commit-000001-bbbbbbbbbbbbbbbb',
 stage_name:'.prepare-commit-000001-bbbbbbbbbbbbbbbb',
 archive_manifest_sha256:'c'.repeat(64),
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:'Local assessment only'});
const id='d'.repeat(64);
function signed(i,changes={}){
 const payload={schema:'palaco.citadel.atelier.manual-recovery-review/1',
 reviewer_id:trusts[i].reviewerId,assessment_sha256:sha(assessment),
 stage_name:'.prepare-commit-000001-bbbbbbbbbbbbbbbb',sequence:1,
 ledger_head_sha256:'a'.repeat(64),decision_id:id,
 action:'ASSESSMENT_ACCEPTED_FOR_MANUAL_REVIEW',
 created_at:'2026-11-26T10:00:00Z',expires_at:'2026-11-27T10:00:00Z',...changes};
 return canonical({payload,signature:crypto.sign(null,Buffer.concat([Buffer.from(DOMAIN),canonical(payload)]),
 pairs[i].privateKey).toString('base64url')});
}
const at=Date.parse('2026-11-26T12:00:00Z');
const check=(one=signed(0),two=signed(1),a=assessment,t=trusts,consumed=[])=>
 verify(a,[one,two],t,consumed,at);
test('two pinned signatures accept review only, never archive promotion',()=>{
 const r=check();assert.equal(r.result,'TWO_SIGNED_MANUAL_REVIEW_DECISIONS_VALID');
 assert.equal(r.decision,'HOLD');assert.equal(r.recovery_authorized,false);
 assert.equal(r.promotion_performed,false);assert.equal(r.release_approved,false);
});
test('tampered payload, signer key or forged authorization denied',()=>{
 const x=JSON.parse(signed(0));x.payload.ledger_head_sha256='e'.repeat(64);
 assert.throws(()=>check(canonical(x)),/binding/);
 const y=JSON.parse(signed(0));y.payload.release_approved=true;
 assert.throws(()=>check(canonical(y)),/binding/);
 assert.throws(()=>check(undefined,undefined,undefined,[{...trusts[0],spkiSha256:'f'.repeat(64)},trusts[1]]),/Untrusted/);
});
test('replay of already consumed review ID and divergent reviewer IDs denied',()=>{
 assert.throws(()=>check(undefined,undefined,undefined,trusts,[id]),/Replay/);
 assert.throws(()=>check(signed(0),signed(1,{decision_id:'e'.repeat(64)})),/same review decision/);
});
test('expired, future or malformed validity window denied',()=>{
 assert.throws(()=>check(signed(0,{expires_at:'2026-11-26T11:00:00Z'})),/validity/);
 assert.throws(()=>check(signed(0,{created_at:'2026-11-26T13:00:00Z'})),/validity/);
 assert.throws(()=>check(signed(0,{created_at:'2026-02-30T00:00:00Z'})),/canonical review time/);
});
test('same reviewer or key cannot masquerade as independent signatures',()=>{
 assert.throws(()=>check(undefined,undefined,undefined,[trusts[0],trusts[0]]),/identity|binding/);
 assert.throws(()=>check(undefined,undefined,undefined,
 [trusts[0],{...trusts[1],spkiSha256:trusts[0].spkiSha256}]),/Untrusted/);
});
test('noncanonical or elevated assessment cannot pass despite valid signatures',()=>{
 assert.throws(()=>check(undefined,undefined,Buffer.concat([assessment,Buffer.from(' ')])),/Noncanonical/);
 const a={...JSON.parse(assessment),recovery_authorized:true};
 assert.throws(()=>check(undefined,undefined,canonical(a)),/authority/);
});
