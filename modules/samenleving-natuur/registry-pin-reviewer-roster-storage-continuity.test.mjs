import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterStorageContinuity as inspect} from './registry-pin-reviewer-roster-storage-continuity.mjs';
import {inspectReviewerRosterCheckpointAdvance,REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
import {ROSTER_STORAGE_RECEIPT_SCHEMA} from './registry-pin-reviewer-roster-storage-receipt.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const storage=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=k=>sha(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
function roster(revision,members){
 const bytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members}));
 return {bytes,signature:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),bytes]),issuer.privateKey).toString('base64url')};
}
const members=[{reviewerId:'one',fingerprint:'a'.repeat(64),status:'ACTIVE'},
 {reviewerId:'two',fingerprint:'b'.repeat(64),status:'ACTIVE'}];
const before=roster(8,members);
const after=roster(9,[{...members[0],status:'REVOKED'},members[1]]);
const pin={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:4,revision:8,
 issuerFingerprint:fp(issuer),rosterSha256:sha(before.bytes),headSha256:'c'.repeat(64)};
const transition={previousBytes:before.bytes,previousSignatureBase64Url:before.signature,
 candidateBytes:after.bytes,candidateSignatureBase64Url:after.signature,
 issuerPublicJwk:jwk(issuer),expectedIssuerFingerprint:fp(issuer),
 expectedPreviousSha256:sha(before.bytes),minimumRevision:8};
const advance=inspectReviewerRosterCheckpointAdvance({
 currentPin:pin,expectedPin:pin,transition});
assert.equal(advance.checkpointMatched,true);
const next=advance.proposedCheckpoint;
function receipt(checkpoint,version,committedAt,signer=storage){
 const fields={schema:ROSTER_STORAGE_RECEIPT_SCHEMA,storeId:'citadel-local-prototype',
 storeVersion:version,checkpoint,committedAt};
 return {...fields,signatureBase64Url:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-STORAGE-RECEIPT-V1\n'),
 Buffer.from(JSON.stringify(fields))]),signer.privateKey).toString('base64url')};
}
const priorTime='2026-11-23T06:00:00Z',nextTime='2026-11-23T07:00:00Z';
const base=()=>({previousReceipt:receipt(pin,12,priorTime),
 candidateReceipt:receipt(next,13,nextTime),storagePublicJwk:jwk(storage),
 expectedStorageFingerprint:fp(storage),expectedStoreId:'citadel-local-prototype',
 minimumPreviousStoreVersion:12,previousCheckpoint:{...pin},
 transition:{...transition},nowUtc:'2026-11-23T08:00:00Z'});
function denied(x,reason){
 const v=inspect(x);assert.equal(v.continuityValid,false,JSON.stringify(v));
 assert.equal(v.reason,reason);assert.equal(v.authorization,'DENY');assert.equal(v.stateChanged,false);
}
test('two signed consecutive storage receipts bind to a verified roster transition without authority',()=>{
 const v=inspect(base());assert.equal(v.continuityValid,true,JSON.stringify(v));
 assert.equal(v.previousStoreVersion,12);assert.equal(v.candidateStoreVersion,13);
 assert.equal(v.candidateRevision,9);assert.equal(v.trust,'NOT_ESTABLISHED');
 assert.equal(v.authorization,'DENY');assert.equal(v.stateChanged,false);
});
test('same store version cannot publish another checkpoint',()=>{
 const x=base();x.candidateReceipt=receipt(next,12,nextTime);
 denied(x,'NON_CONSECUTIVE_STORE_VERSION');
});
test('store version cannot skip an unverified transition',()=>{
 const x=base();x.candidateReceipt=receipt(next,14,nextTime);
 denied(x,'NON_CONSECUTIVE_STORE_VERSION');
});
test('old receipt below externally pinned version floor rejected',()=>{
 const x=base();x.minimumPreviousStoreVersion=13;
 denied(x,'PREVIOUS_STORE_VERSION_ROLLBACK');
});
test('candidate timestamp rollback rejected',()=>{
 const x=base();x.candidateReceipt=receipt(next,13,'2026-11-23T05:00:00Z');
 denied(x,'STORAGE_COMMIT_TIME_ROLLBACK');
});
test('candidate checkpoint revision substitution is rejected even when signed',()=>{
 const x=base();x.candidateReceipt=receipt({...next,revision:10},13,nextTime);
 denied(x,'CANDIDATE_CHECKPOINT_MISMATCH');
});
test('previous checkpoint cannot be replaced without matching receipt',()=>{
 const x=base();x.previousCheckpoint={...pin,revision:7};
 denied(x,'PREVIOUS_CHECKPOINT_MISMATCH');
});
test('forged storage signer denied',()=>{
 const x=base();x.candidateReceipt=receipt(next,13,nextTime,attacker);
 denied(x,'CANDIDATE_INVALID_RECEIPT_SIGNATURE');
});
test('altered signed reviewer transition is rejected',()=>{
 const x=base();x.transition={...transition,expectedPreviousSha256:'f'.repeat(64)};
 denied(x,'TRANSITION_CHECKPOINT_PIN_MISMATCH');
});
test('invalid input, injected getter, extra symbol all fail closed',()=>{
 denied({},'INVALID_INPUT');
 const x=base();let called=0;
 Object.defineProperty(x,'previousReceipt',{get(){called++;throw Error('getter');}});
 denied(x,'INVALID_INPUT');assert.equal(called,0);
 denied({...base(),[Symbol('extra')]:true},'INVALID_INPUT');
});
