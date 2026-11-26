import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {proposeRegistryPinTransition, TRANSITION_SCHEMA} from './registry-pin-transition.mjs';
import {PIN_SCHEMA} from './registry-snapshot-pin.mjs';
import {REGISTRY_SCHEMA} from './reviewer-registry-check.mjs';

const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const j=key.publicKey.export({format:'jwk'});
const issuerPublicJwk={kty:'EC',crv:'P-256',x:j.x,y:j.y};
const sha=x=>createHash('sha256').update(x).digest('hex');
const issuerFingerprint=sha(key.publicKey.export({format:'der',type:'spki'}));
const reviewerFingerprint='a'.repeat(64);
const currentPin=()=>({schema:PIN_SCHEMA,issuerFingerprint,revision:4,registrySha256:'b'.repeat(64)});
const record=(revision=5)=>({schema:REGISTRY_SCHEMA,revision,
 issuedAt:'2026-11-20T00:00:00.000Z',expiresAt:'2026-12-01T00:00:00.000Z',
 reviewers:[{fingerprint:reviewerFingerprint,role:'receipt-reviewer',status:'active',
 notBefore:'2026-11-01T00:00:00.000Z',notAfter:'2026-12-01T00:00:00.000Z'}]});
function setup(doc=record(), overrides={}) {
 const candidateBytes=Buffer.from(JSON.stringify(doc));
 const signatureBase64Url=sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-REGISTRY-V1\n'),candidateBytes
 ]),key.privateKey).toString('base64url');
 return {currentPin:currentPin(),expectedCurrentPin:currentPin(),candidateBytes,
 signatureBase64Url,issuerPublicJwk,reviewerFingerprint,
 evaluationTime:'2026-11-22T00:00:00.000Z',...overrides};
}
test('proposes a higher signed revision but never writes or authorizes',()=>{
 const input=setup();
 const before=JSON.stringify(input.currentPin);
 const r=proposeRegistryPinTransition(input);
 assert.equal(r.schema,TRANSITION_SCHEMA);
 assert.equal(r.candidateVerified,true,JSON.stringify(r));
 assert.equal(r.proposedPin.revision,5);
 assert.equal(r.proposedPin.registrySha256,sha(input.candidateBytes));
 assert.equal(r.stateChanged,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
 assert.equal(r.executionAllowed,false);
 assert.equal(JSON.stringify(input.currentPin),before);
 assert.ok(r.requiredBeforeCommit.includes('ATOMIC_CAS_STORAGE'));
});
test('conflicting checkpoint rejects candidate even if signed',()=>{
 const r=proposeRegistryPinTransition(setup(record(),{
 expectedCurrentPin:{...currentPin(),registrySha256:'c'.repeat(64)}}));
 assert.equal(r.reason,'CHECKPOINT_CONFLICT');
 assert.equal(r.proposedPin,null);
});
test('same and older revisions never advance',()=>{
 for(const revision of [3,4]){
  const r=proposeRegistryPinTransition(setup(record(revision)));
  assert.equal(r.candidateVerified,false);
  assert.equal(r.authorization,'DENY');
 }
});
test('revoked signer rejected before a pin can be proposed',()=>{
 const doc=record();doc.reviewers[0].status='revoked';
 assert.equal(proposeRegistryPinTransition(setup(doc)).reason,'REGISTRY_REVIEWER_REVOKED');
});
test('signature tampering and issuer switch cannot propose a pin',()=>{
 const input=setup();
 assert.equal(proposeRegistryPinTransition({...input,signatureBase64Url:'AQID'}).candidateVerified,false);
 assert.equal(proposeRegistryPinTransition({...input,currentPin:{
 ...currentPin(),issuerFingerprint:'f'.repeat(64)},
 expectedCurrentPin:{...currentPin(),issuerFingerprint:'f'.repeat(64)}}).candidateVerified,false);
});
test('stale registry and malformed pin both fail closed',()=>{
 const d=record();d.issuedAt='2026-11-01T00:00:00.000Z';
 assert.equal(proposeRegistryPinTransition(setup(d)).reason,'REGISTRY_REGISTRY_SNAPSHOT_TOO_OLD');
 for(const p of [null,{},'x',{...currentPin(),revision:0}]){
  const r=proposeRegistryPinTransition(setup(record(),{currentPin:p}));
  assert.equal(r.candidateVerified,false);
  assert.equal(r.authorization,'DENY');
 }
});
