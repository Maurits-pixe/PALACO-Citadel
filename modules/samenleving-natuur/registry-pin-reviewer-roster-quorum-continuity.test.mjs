import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterQuorumContinuity as inspect} from './registry-pin-reviewer-roster-quorum-continuity.mjs';
import {inspectReviewerRosterCheckpointAdvance,REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
import {ROSTER_ATTESTATION_SCHEMA} from './registry-pin-reviewer-roster-attestation.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const witnesses=Array.from({length:3},()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}));
const fp=k=>sha(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const v=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:v.x,y:v.y};};
function roster(revision,members){
 const bytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members}));
 const signature=sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),bytes]),issuer.privateKey).toString('base64url');
 return {bytes,signature};
}
const members=[{reviewerId:'one',fingerprint:'a'.repeat(64),status:'ACTIVE'},
 {reviewerId:'two',fingerprint:'b'.repeat(64),status:'ACTIVE'}];
const before=roster(8,members);
const after=roster(9,[{...members[0],status:'REVOKED'},members[1]]);
const prior={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:4,revision:8,
 issuerFingerprint:fp(issuer),rosterSha256:sha(before.bytes),headSha256:'c'.repeat(64)};
const transition={previousBytes:before.bytes,previousSignatureBase64Url:before.signature,
 candidateBytes:after.bytes,candidateSignatureBase64Url:after.signature,
 issuerPublicJwk:jwk(issuer),expectedIssuerFingerprint:fp(issuer),
 expectedPreviousSha256:sha(before.bytes),minimumRevision:8};
const advance=inspectReviewerRosterCheckpointAdvance({currentPin:prior,expectedPin:prior,transition});
assert.equal(advance.checkpointMatched,true);
function attest(checkpoint,key){
 const payload={schema:ROSTER_ATTESTATION_SCHEMA,checkpoint,
  issuedAt:'2026-11-23T07:00:00Z',expiresAt:'2026-11-23T09:00:00Z'};
 return {...payload,signatureBase64Url:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-ATTESTATION-V1\n'),
 Buffer.from(JSON.stringify(payload))]),key.privateKey).toString('base64url')};
}
function signedEntry(checkpoint,key){return {attestation:attest(checkpoint,key),
 witnessPublicJwk:jwk(key),expectedWitnessFingerprint:fp(key)};}
const base=()=>({previousCheckpoint:{...prior},transition:{...transition},
 previousAttestations:witnesses.slice(0,2).map(k=>signedEntry({...prior},k)),
 candidateAttestations:witnesses.slice(0,2).map(k=>signedEntry({...advance.proposedCheckpoint},k)),
 expectedWitnessFingerprints:witnesses.slice(0,2).map(fp),
 nowUtc:'2026-11-23T08:00:00Z'});
function denied(x,reason){
 const r=inspect(x);assert.equal(r.continuityValid,false,JSON.stringify(r));
 assert.equal(r.reason,reason);assert.equal(r.authorization,'DENY');assert.equal(r.stateChanged,false);
}
test('signed 2-witness prior and candidate quorums verify signed transition without authorization',()=>{
 const r=inspect(base());assert.equal(r.continuityValid,true,JSON.stringify(r));
 assert.equal(r.witnessCount,2);assert.equal(r.candidateRevision,9);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.stateChanged,false);assert.equal(r.executionAllowed,false);
});
test('three witnesses can verify the same transition',()=>{
 const x=base();x.expectedWitnessFingerprints.push(fp(witnesses[2]));
 x.previousAttestations.push(signedEntry(prior,witnesses[2]));
 x.candidateAttestations.push(signedEntry(advance.proposedCheckpoint,witnesses[2]));
 assert.equal(inspect(x).witnessCount,3);
});
test('missing candidate witness is not downgraded',()=>{
 const x=base();x.candidateAttestations.pop();
 denied(x,'CANDIDATE_INVALID_QUORUM_POLICY');
});
test('stale candidate state rejected despite valid signatures',()=>{
 const x=base();x.candidateAttestations=x.candidateAttestations.map((_,i)=>signedEntry(prior,witnesses[i]));
 denied(x,'CANDIDATE_WITNESS_CHECKPOINT_HEAD_MISMATCH');
});
test('previous witness quorum must exactly match trusted caller pin',()=>{
 const x=base();x.previousCheckpoint={...prior,revision:7};
 denied(x,'PREVIOUS_CHECKPOINT_MISMATCH');
});
test('forged candidate attestation rejected',()=>{
 const x=base();x.candidateAttestations[1]={...x.candidateAttestations[1],
 attestation:attest(advance.proposedCheckpoint,witnesses[2])};
 denied(x,'CANDIDATE_WITNESS_INVALID_ATTESTATION_SIGNATURE');
});
test('candidate signing different revision but same head rejected',()=>{
 const x=base();x.candidateAttestations=x.candidateAttestations.map((_,i)=>
 signedEntry({...advance.proposedCheckpoint,revision:10},witnesses[i]));
 denied(x,'CANDIDATE_CHECKPOINT_MISMATCH');
});
test('tampered transition rejected regardless of signed quorums',()=>{
 const x=base();x.transition={...transition,expectedPreviousSha256:'f'.repeat(64)};
 denied(x,'TRANSITION_CHECKPOINT_PIN_MISMATCH');
});
test('duplicate witness cannot inflate quorum',()=>{
 const x=base();x.candidateAttestations[1]=signedEntry(advance.proposedCheckpoint,witnesses[0]);
 denied(x,'CANDIDATE_DUPLICATE_ATTESTING_WITNESS');
});
test('untrusted malformed and accessor objects rejected',()=>{
 denied({},'INVALID_INPUT');
 const x=base();let called=0;
 Object.defineProperty(x,'previousCheckpoint',{get(){called++;throw Error('getter');}});
 denied(x,'INVALID_INPUT');assert.equal(called,0);
 denied({...base(),[Symbol('bad')]:1},'INVALID_INPUT');
});
