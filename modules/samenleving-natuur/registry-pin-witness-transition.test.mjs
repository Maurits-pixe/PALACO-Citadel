import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectWitnessRegistryTransition,WITNESS_TRANSITION_SCHEMA} from './registry-pin-witness-transition.mjs';
import {WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const j=issuer.publicKey.export({format:'jwk'});
const issuerPublicJwk={kty:'EC',crv:'P-256',x:j.x,y:j.y};
const expectedIssuerFingerprint=hash(issuer.publicKey.export({format:'der',type:'spki'}));
const member=(id,char,status='ACTIVE')=>({witnessId:id,fingerprint:char.repeat(64),status});
const baseMembers=[member('alpha','a'),member('beta','b')];
const doc=(epoch,members)=>({schema:WITNESS_REGISTRY_SCHEMA,epoch,members});
function signed(registry){
 const bytes=Buffer.from(JSON.stringify(registry));
 return {bytes,signature:sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n'),bytes
 ]),issuer.privateKey).toString('base64url')};
}
const old=signed(doc(4,baseMembers));
const current=signed(doc(5,[member('alpha','a','REVOKED'),member('beta','b'),member('gamma','c')]));
const base=()=>({previousBytes:old.bytes,previousSignatureBase64Url:old.signature,
 candidateBytes:current.bytes,candidateSignatureBase64Url:current.signature,
 issuerPublicJwk,expectedIssuerFingerprint,expectedPreviousSha256:hash(old.bytes),
 minimumEpoch:4});
const run=overrides=>inspectWitnessRegistryTransition({...base(),...overrides});
const next=(d)=>{const x=signed(d);return {candidateBytes:x.bytes,candidateSignatureBase64Url:x.signature};};
test('signed transition permits revocation and new identity while never authorizing',()=>{
 const r=run({});
 assert.equal(r.schema,WITNESS_TRANSITION_SCHEMA);
 assert.equal(r.transitionConsistent,true,JSON.stringify(r));
 assert.equal(r.previousEpoch,4);assert.equal(r.candidateEpoch,5);
 assert.deepEqual(r.changes,[{type:'REVOCATION',witnessId:'alpha'},
  {type:'NEW_ENROLLMENT',witnessId:'gamma'}]);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.stateChanged,false);assert.equal(r.releaseAllowed,false);
});
test('resurrecting revoked identity is denied even with a valid issuer signature',()=>{
 const previous=signed(doc(4,[member('alpha','a','REVOKED'),member('beta','b')]));
 const future=signed(doc(5,baseMembers));
 assert.equal(run({previousBytes:previous.bytes,previousSignatureBase64Url:previous.signature,
  expectedPreviousSha256:hash(previous.bytes),candidateBytes:future.bytes,
  candidateSignatureBase64Url:future.signature}).reason,'REVOCATION_ROLLBACK');
});
test('silent key replacement for an existing identity is refused',()=>{
 assert.equal(run(next(doc(5,[member('alpha','f'),member('beta','b')]))).reason,'IDENTITY_KEY_REBOUND');
});
test('deleted witness and duplicate fingerprint are denied',()=>{
 assert.equal(run(next(doc(5,[member('beta','b'),member('gamma','c')]))).reason,'ENROLLMENT_DELETION');
 assert.equal(run(next(doc(5,[member('alpha','a'),member('beta','a')]))).reason,'INVALID_SIGNED_SNAPSHOT');
});
test('stale and equal epochs are denied even with a valid new signature',()=>{
 for(const epoch of [3,4]){
  assert.equal(run(next(doc(epoch,baseMembers))).reason,'NON_MONOTONE_EPOCH');
 }
 assert.equal(run({minimumEpoch:5}).reason,'NON_MONOTONE_EPOCH');
});
test('old signed register replacement cannot bypass protected hash',()=>{
 const swapped=signed(doc(4,[member('alpha','d'),member('beta','b')]));
 assert.equal(run({previousBytes:swapped.bytes,previousSignatureBase64Url:swapped.signature})
  .reason,'PREVIOUS_SNAPSHOT_SUBSTITUTION');
});
test('issuer substitution and corrupted signatures fail closed',()=>{
 assert.equal(run({expectedIssuerFingerprint:'f'.repeat(64)}).reason,'ISSUER_KEY_SUBSTITUTION');
 assert.equal(run({candidateSignatureBase64Url:'AQID'}).reason,'INVALID_SIGNED_SNAPSHOT');
});
test('hostile getters, missing input and extra symbol metadata deny',()=>{
 const malicious={...base()};
 let calls=0;
 Object.defineProperty(malicious,'minimumEpoch',{enumerable:true,
  get(){calls++;throw Error('do not call');}});
 for(const data of [undefined,null,{},[],malicious,
   {...base(),[Symbol('unexpected')]:true}]){
  const r=inspectWitnessRegistryTransition(data);
  assert.equal(r.transitionConsistent,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
 assert.equal(calls,0);
});
