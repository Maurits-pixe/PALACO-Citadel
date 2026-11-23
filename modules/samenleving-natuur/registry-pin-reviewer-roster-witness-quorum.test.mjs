import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterWitnessQuorum as inspect} from './registry-pin-reviewer-roster-witness-quorum.mjs';
import {ROSTER_ATTESTATION_SCHEMA} from './registry-pin-reviewer-roster-attestation.mjs';
import {REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const keys=Array.from({length:3},()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}));
const fp=k=>hash(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const x=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:x.x,y:x.y};};
const cp={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:5,revision:9,
 issuerFingerprint:'a'.repeat(64),rosterSha256:'b'.repeat(64),headSha256:'c'.repeat(64)};
function signed(checkpoint,key,expiresAt='2026-11-23T09:00:00Z'){
 const data={schema:ROSTER_ATTESTATION_SCHEMA,checkpoint,issuedAt:'2026-11-23T07:00:00Z',expiresAt};
 return {...data,signatureBase64Url:sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-ATTESTATION-V1\n'),
 Buffer.from(JSON.stringify(data))]),key.privateKey).toString('base64url')};
}
const item=(key,checkpoint=cp)=>({attestation:signed(checkpoint,key),
 witnessPublicJwk:jwk(key),expectedWitnessFingerprint:fp(key)});
const baseline=()=>({attestations:[item(keys[0]),item(keys[1])],
 expectedWitnessFingerprints:[fp(keys[0]),fp(keys[1])],
 expectedCheckpointHeadSha256:cp.headSha256,nowUtc:'2026-11-23T08:00:00Z'});
function denied(arg,reason){
 const x=inspect(arg);assert.equal(x.quorumValid,false,JSON.stringify(x));
 assert.equal(x.reason,reason);assert.equal(x.authorization,'DENY');assert.equal(x.stateChanged,false);
}
test('two distinct signed matching witnesses produce evidence without authorization',()=>{
 const x=inspect(baseline());assert.equal(x.quorumValid,true,JSON.stringify(x));
 assert.equal(x.witnessCount,2);assert.equal(x.authorization,'DENY');
 assert.equal(x.trust,'NOT_ESTABLISHED');assert.equal(x.executionAllowed,false);
});
test('three expected independent fingerprints work under local preflight',()=>{
 const x=baseline();x.attestations.push(item(keys[2]));x.expectedWitnessFingerprints.push(fp(keys[2]));
 assert.equal(inspect(x).witnessCount,3);
});
test('duplicate allowed witness fingerprint denied',()=>{
 const x=baseline();x.expectedWitnessFingerprints[1]=x.expectedWitnessFingerprints[0];
 denied(x,'DUPLICATE_EXPECTED_WITNESS');
});
test('same witness cannot be counted twice',()=>{
 const x=baseline();x.attestations[1]=item(keys[0]);
 denied(x,'DUPLICATE_ATTESTING_WITNESS');
});
test('unknown witness cannot replace an enrolled signer',()=>{
 const x=baseline();x.attestations[1]=item(keys[2]);
 denied(x,'UNENROLLED_WITNESS');
});
test('different signed checkpoint state with equal head is denied',()=>{
 const x=baseline();x.attestations[1]=item(keys[1],{...cp,revision:10});
 denied(x,'WITNESS_CHECKPOINT_DISAGREEMENT');
});
test('forged witness attestation denied',()=>{
 const x=baseline();x.attestations[1]={...item(keys[1]),attestation:signed(cp,keys[2])};
 denied(x,'WITNESS_INVALID_ATTESTATION_SIGNATURE');
});
test('expired witness denied and quorum never downgraded',()=>{
 const x=baseline();x.attestations[1].attestation=signed(cp,keys[1],'2026-11-23T07:30:00Z');
 denied(x,'WITNESS_ATTESTATION_NOT_CURRENT');
 const y=baseline();y.attestations.pop();denied(y,'INVALID_QUORUM_POLICY');
});
test('invalid external head and malformed inputs fail closed',()=>{
 denied({...baseline(),expectedCheckpointHeadSha256:'d'.repeat(64)},'WITNESS_CHECKPOINT_HEAD_MISMATCH');
 denied({},'INVALID_QUORUM_INPUT');
});
test('accessors and symbol injection not evaluated',()=>{
 const x=baseline();let count=0;
 Object.defineProperty(x.attestations,'0',{get(){count++;throw Error('getter');}});
 denied(x,'INVALID_WITNESS_ENTRY');assert.equal(count,0);
 denied({...baseline(),[Symbol('extra')]:true},'INVALID_QUORUM_INPUT');
});
