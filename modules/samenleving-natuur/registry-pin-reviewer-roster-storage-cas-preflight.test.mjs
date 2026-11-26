import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterStorageCasPreflight as inspect} from './registry-pin-reviewer-roster-storage-cas-preflight.mjs';
import {inspectReviewerRosterCheckpointAdvance,REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
import {ROSTER_STORAGE_RECEIPT_SCHEMA} from './registry-pin-reviewer-roster-storage-receipt.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const storage=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=k=>sha(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
function roster(revision,members){
 const bytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members}));
 return {bytes,signature:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),bytes]),issuer.privateKey).toString('base64url')};
}
const members=[{reviewerId:'one',fingerprint:'a'.repeat(64),status:'ACTIVE'},
 {reviewerId:'two',fingerprint:'b'.repeat(64),status:'ACTIVE'}];
const before=roster(8,members),after=roster(9,[{...members[0],status:'REVOKED'},members[1]]);
const pin={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:4,revision:8,
 issuerFingerprint:fp(issuer),rosterSha256:sha(before.bytes),headSha256:'c'.repeat(64)};
const transition={previousBytes:before.bytes,previousSignatureBase64Url:before.signature,
 candidateBytes:after.bytes,candidateSignatureBase64Url:after.signature,
 issuerPublicJwk:jwk(issuer),expectedIssuerFingerprint:fp(issuer),
 expectedPreviousSha256:sha(before.bytes),minimumRevision:8};
const advance=inspectReviewerRosterCheckpointAdvance({currentPin:pin,expectedPin:pin,transition});
assert.equal(advance.checkpointMatched,true);
function receipt(checkpoint,storeVersion,committedAt,signer=storage){
 const payload={schema:ROSTER_STORAGE_RECEIPT_SCHEMA,storeId:'citadel-local-draft',
  storeVersion,checkpoint,committedAt};
 return {...payload,signatureBase64Url:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-STORAGE-RECEIPT-V1\n'),
 Buffer.from(JSON.stringify(payload))]),signer.privateKey).toString('base64url')};
}
const state=()=>({storeId:'citadel-local-draft',storeVersion:12,checkpoint:{...pin}});
const base=()=>({expectedState:state(),observedState:state(),
 previousReceipt:receipt(pin,12,'2026-11-23T06:00:00Z'),
 candidateReceipt:receipt(advance.proposedCheckpoint,13,'2026-11-23T07:00:00Z'),
 storagePublicJwk:jwk(storage),expectedStorageFingerprint:fp(storage),
 expectedStoreId:'citadel-local-draft',previousCheckpoint:{...pin},
 transition:{...transition},nowUtc:'2026-11-23T08:00:00Z'});
function denied(input,reason){
 const x=inspect(input);assert.equal(x.preflightValid,false,JSON.stringify(x));
 assert.equal(x.reason,reason);assert.equal(x.authorization,'DENY');assert.equal(x.stateChanged,false);
}
test('matching signed version increment passes preflight but never authorizes',()=>{
 const x=inspect(base());assert.equal(x.preflightValid,true,JSON.stringify(x));
 assert.equal(x.candidateStoreVersion,13);assert.equal(x.authorization,'DENY');
 assert.equal(x.trust,'NOT_ESTABLISHED');assert.equal(x.stateChanged,false);
});
test('concurrent writer advanced version yields CAS conflict',()=>{
 const x=base();x.observedState.storeVersion=13;denied(x,'CAS_CONFLICT');
});
test('same version with another observed checkpoint yields CAS conflict',()=>{
 const x=base();x.observedState.checkpoint.headSha256='d'.repeat(64);
 denied(x,'CAS_CONFLICT');
});
test('changed observed store identity yields CAS conflict',()=>{
 const x=base();x.observedState.storeId='other-draft-store';denied(x,'CAS_CONFLICT');
});
test('incorrect previous checkpoint cannot use valid original receipts',()=>{
 const x=base();x.previousCheckpoint.revision=7;
 denied(x,'EXPECTED_CHECKPOINT_MISMATCH');
});
test('stale caller version floor is rejected against signed prior receipt',()=>{
 const x=base();x.expectedState.storeVersion=13;x.observedState.storeVersion=13;
 denied(x,'STORAGE_PREVIOUS_STORE_VERSION_ROLLBACK');
});
test('future candidate cannot skip a store version',()=>{
 const x=base();x.candidateReceipt=receipt(advance.proposedCheckpoint,14,'2026-11-23T07:00:00Z');
 denied(x,'STORAGE_NON_CONSECUTIVE_STORE_VERSION');
});
test('forged storage signer is denied',()=>{
 const x=base();x.candidateReceipt=receipt(advance.proposedCheckpoint,13,'2026-11-23T07:00:00Z',other);
 denied(x,'STORAGE_CANDIDATE_INVALID_RECEIPT_SIGNATURE');
});
test('signed roster rollback cannot be accepted by CAS preflight',()=>{
 const x=base();x.transition.expectedPreviousSha256='f'.repeat(64);
 denied(x,'STORAGE_TRANSITION_CHECKPOINT_PIN_MISMATCH');
});
test('malformed input and injected accessor are fail closed',()=>{
 denied({},'INVALID_INPUT');
 const x=base();let called=0;
 Object.defineProperty(x,'observedState',{get(){called++;throw Error('accessed');}});
 denied(x,'INVALID_INPUT');assert.equal(called,0);
 denied({...base(),[Symbol('unexpected')]:true},'INVALID_INPUT');
});
