import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterWitnessContinuity as inspect} from './registry-pin-reviewer-roster-witness-continuity.mjs';
import {inspectReviewerRosterCheckpointAdvance,REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
import {ROSTER_ATTESTATION_SCHEMA} from './registry-pin-reviewer-roster-attestation.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),witness=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),intruder=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=k=>hash(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const v=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:v.x,y:v.y};};
function roster(revision,members){
 const bytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members}));
 return {bytes,signature:sign('sha256',Buffer.concat([Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),bytes]),issuer.privateKey).toString('base64url')};
}
const members=[{reviewerId:'a',fingerprint:'a'.repeat(64),status:'ACTIVE'},
 {reviewerId:'b',fingerprint:'b'.repeat(64),status:'ACTIVE'}];
const prior=roster(8,members),next=roster(9,[{...members[0],status:'REVOKED'},members[1]]);
const pin={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:4,revision:8,
 issuerFingerprint:fp(issuer),rosterSha256:hash(prior.bytes),headSha256:'c'.repeat(64)};
const transition={previousBytes:prior.bytes,previousSignatureBase64Url:prior.signature,
 candidateBytes:next.bytes,candidateSignatureBase64Url:next.signature,
 issuerPublicJwk:jwk(issuer),expectedIssuerFingerprint:fp(issuer),
 expectedPreviousSha256:hash(prior.bytes),minimumRevision:8};
const proposal=inspectReviewerRosterCheckpointAdvance({currentPin:pin,expectedPin:pin,transition});
assert.equal(proposal.checkpointMatched,true);
function attest(checkpoint,issuedAt='2026-11-23T07:00:00Z',signer=witness){
 const base={schema:ROSTER_ATTESTATION_SCHEMA,checkpoint,issuedAt,expiresAt:'2026-11-23T08:00:00Z'};
 return {...base,signatureBase64Url:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-ATTESTATION-V1\n'),
 Buffer.from(JSON.stringify(base))]),signer.privateKey).toString('base64url')};
}
const base=()=>({previousAttestation:attest({...pin}),candidateAttestation:attest({...proposal.proposedCheckpoint},'2026-11-23T07:10:00Z'),
 witnessPublicJwk:jwk(witness),expectedWitnessFingerprint:fp(witness),
 expectedPreviousHeadSha256:pin.headSha256,nowUtc:'2026-11-23T07:20:00Z',transition:{...transition}});
function denied(x,expected){const v=inspect(x);assert.equal(v.continuityValid,false,JSON.stringify(v));
 assert.equal(v.reason,expected);assert.equal(v.authorization,'DENY');assert.equal(v.stateChanged,false);}
test('two signed checkpoints bind to verified roster transition without authority',()=>{
 const v=inspect(base());assert.equal(v.continuityValid,true,JSON.stringify(v));
 assert.equal(v.candidateSequence,5);assert.equal(v.authorization,'DENY');
 assert.equal(v.trust,'NOT_ESTABLISHED');assert.equal(v.stateChanged,false);
});
test('stale candidate checkpoint is rejected',()=>{
 const v=base();v.candidateAttestation=attest(pin,'2026-11-23T07:10:00Z');
 denied(v,'CANDIDATE_CHECKPOINT_MISMATCH');
});
test('candidate must commit to exact transition derived hash',()=>{
 const v=base();v.candidateAttestation=attest({...proposal.proposedCheckpoint,headSha256:'f'.repeat(64)},'2026-11-23T07:10:00Z');
 denied(v,'CANDIDATE_CHECKPOINT_MISMATCH');
});
test('different witnessed signer fails closed',()=>{
 const v=base();v.candidateAttestation=attest(proposal.proposedCheckpoint,'2026-11-23T07:10:00Z',intruder);
 denied(v,'CANDIDATE_INVALID_ATTESTATION_SIGNATURE');
});
test('untrusted original head fails closed',()=>{
 denied({...base(),expectedPreviousHeadSha256:'0'.repeat(64)},'PREVIOUS_CHECKPOINT_HEAD_MISMATCH');
});
test('prior witness issuedAt must not move backwards',()=>{
 const v=base();v.previousAttestation=attest(pin,'2026-11-23T07:15:00Z');
 denied(v,'WITNESS_TIME_ROLLBACK');
});
test('modified register transition cannot advance checkpoint',()=>{
 const v=base();v.transition={...transition,expectedPreviousSha256:'f'.repeat(64)};
 denied(v,'TRANSITION_CHECKPOINT_PIN_MISMATCH');
});
test('malformed and accessor inputs fail closed',()=>{
 denied({},'INVALID_INPUT');
 let calls=0;const a=base();
 Object.defineProperty(a,'previousAttestation',{get(){calls++;throw Error('getter');}});
 denied(a,'INVALID_INPUT');assert.equal(calls,0);
});
