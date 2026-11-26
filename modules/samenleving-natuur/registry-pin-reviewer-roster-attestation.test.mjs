import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {inspectReviewerRosterCheckpointAttestation as inspect,ROSTER_ATTESTATION_SCHEMA as SCHEMA} from './registry-pin-reviewer-roster-attestation.mjs';
import {REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const witness=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fingerprint=hash(witness.publicKey.export({format:'der',type:'spki'}));
const jwk=key=>{const j=key.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const checkpoint={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:5,revision:9,
 issuerFingerprint:'a'.repeat(64),rosterSha256:'b'.repeat(64),headSha256:'c'.repeat(64)};
const issuedAt='2026-11-23T06:00:00Z',expiresAt='2026-11-23T08:00:00Z';
function envelope(cp=checkpoint,privateKey=witness.privateKey){
 const fields={schema:SCHEMA,checkpoint:cp,issuedAt,expiresAt};
 const signatureBase64Url=sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-ATTESTATION-V1\n'),
 Buffer.from(JSON.stringify(fields))]),privateKey).toString('base64url');
 return {...fields,signatureBase64Url};
}
const input=()=>({attestation:envelope(),witnessPublicJwk:jwk(witness.publicKey),
 expectedWitnessFingerprint:fingerprint,expectedCheckpointHeadSha256:checkpoint.headSha256,
 nowUtc:'2026-11-23T07:00:00Z'});
const denied=(x,reason)=>{const r=inspect(x);assert.equal(r.attestationValid,false);assert.equal(r.reason,reason);
 assert.equal(r.authorization,'DENY');assert.equal(r.stateChanged,false);};
test('signed pinned checkpoint is verifiable, never authorized',()=>{
 const r=inspect(input());assert.equal(r.attestationValid,true,JSON.stringify(r));
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.stateChanged,false);assert.equal(r.executionAllowed,false);
 assert.ok(r.unresolvedGates.includes('INDEPENDENT_AUTHENTICATED_CHECKPOINT_READ'));
});
test('changed checkpoint is rejected without matching signature',()=>{
 const a=input();a.attestation.checkpoint={...checkpoint,revision:10};
 denied(a,'INVALID_ATTESTATION_SIGNATURE');
});
test('unexpected head is rejected',()=>{
 denied({...input(),expectedCheckpointHeadSha256:'d'.repeat(64)},'CHECKPOINT_HEAD_MISMATCH');
});
test('witness key substitution is rejected',()=>{
 denied({...input(),witnessPublicJwk:jwk(other.publicKey)},'WITNESS_KEY_SUBSTITUTION');
});
test('forged attestation is rejected',()=>{
 denied({...input(),attestation:envelope(checkpoint,other.privateKey)},'INVALID_ATTESTATION_SIGNATURE');
});
test('expired and not-yet-valid timestamps are rejected',()=>{
 denied({...input(),nowUtc:'2026-11-23T09:00:00Z'},'ATTESTATION_NOT_CURRENT');
 denied({...input(),nowUtc:'2026-11-23T05:00:00Z'},'ATTESTATION_NOT_CURRENT');
});
test('malformed signature, timestamps and missing inputs fail closed',()=>{
 denied({...input(),attestation:{...envelope(),signatureBase64Url:'*'}},'INVALID_ATTESTATION');
 denied({...input(),nowUtc:'not-a-date'},'INVALID_ATTESTATION_WINDOW');
 denied({},'INVALID_INPUT');
});
test('accessor and symbol injection cannot execute a getter',()=>{
 let called=0;const a=input();
 Object.defineProperty(a,'attestation',{get(){called++;throw Error('getter');}});
 denied(a,'INVALID_INPUT');assert.equal(called,0);
 denied({...input(),[Symbol('extra')]:1},'INVALID_INPUT');
});
