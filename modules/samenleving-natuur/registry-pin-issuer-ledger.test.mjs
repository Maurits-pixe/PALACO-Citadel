import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectIssuerPinLedgerAdvance,ISSUER_PIN_LEDGER_SCHEMA} from './registry-pin-issuer-ledger.mjs';
import {WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';
import {ISSUER_ROTATION_SCHEMA} from './registry-pin-witness-issuer-rotation.mjs';
const h=b=>createHash('sha256').update(b).digest('hex');
const oldKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const newKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});
 return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const fp=k=>h(k.publicKey.export({format:'der',type:'spki'}));
const members=[
 {witnessId:'one',fingerprint:'a'.repeat(64),status:'REVOKED'},
 {witnessId:'two',fingerprint:'b'.repeat(64),status:'ACTIVE'}
];
function snap(epoch,key){
 const bytes=Buffer.from(JSON.stringify({schema:WITNESS_REGISTRY_SCHEMA,epoch,members}));
 return {bytes,signature:sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n'),bytes]),
  key.privateKey).toString('base64url')};
}
const previous=snap(4,oldKey),candidate=snap(5,newKey);
const statementBytes=Buffer.from(JSON.stringify({
 schema:ISSUER_ROTATION_SCHEMA,oldIssuerFingerprint:fp(oldKey),
 newIssuerFingerprint:fp(newKey),previousSha256:h(previous.bytes),
 candidateSha256:h(candidate.bytes),previousEpoch:4,candidateEpoch:5
}));
const rotationMessage=Buffer.concat([
 Buffer.from('PALACO-CITADEL-ISSUER-ROTATION-V1\n'),statementBytes
]);
const rotationProof={
 previousBytes:previous.bytes,previousSignatureBase64Url:previous.signature,
 candidateBytes:candidate.bytes,candidateSignatureBase64Url:candidate.signature,
 oldIssuerPublicJwk:jwk(oldKey),newIssuerPublicJwk:jwk(newKey),
 pinnedOldIssuerFingerprint:fp(oldKey),
 expectedPreviousSha256:h(previous.bytes),minimumEpoch:4,
 rotationStatementBytes,
 oldRotationSignatureBase64Url:sign('sha256',rotationMessage,oldKey.privateKey).toString('base64url'),
 newRotationSignatureBase64Url:sign('sha256',rotationMessage,newKey.privateKey).toString('base64url')
};
const pin={schema:ISSUER_PIN_LEDGER_SCHEMA,sequence:3,epoch:4,
 issuerFingerprint:fp(oldKey),snapshotSha256:h(previous.bytes),headSha256:'c'.repeat(64)};
const base=()=>({oldPin:{...pin},expectedPin:{...pin},rotationProof:{...rotationProof}});
const check=extra=>inspectIssuerPinLedgerAdvance({...base(),...extra});
test('verified rotation advances hypothetical pin without granting authority',()=>{
 const result=check({});
 assert.equal(result.transitionAccepted,true,JSON.stringify(result));
 assert.equal(result.proposedPin.sequence,4);
 assert.equal(result.proposedPin.epoch,5);
 assert.equal(result.proposedPin.issuerFingerprint,fp(newKey));
 assert.equal(result.proposedPin.snapshotSha256,h(candidate.bytes));
 assert.equal(result.authorization,'DENY');assert.equal(result.trust,'NOT_ESTABLISHED');
 assert.equal(result.stateChanged,false);assert.equal(result.releaseAllowed,false);
 assert.deepEqual(base().oldPin,pin);
});
test('stale caller compare-and-swap cannot overwrite changed stored pin',()=>{
 assert.equal(check({oldPin:{...pin,sequence:4}}).reason,'PIN_CAS_CONFLICT');
});
test('old pinned key and snapshot mismatch cannot be overridden by caller proof',()=>{
 assert.equal(check({rotationProof:{...rotationProof,pinnedOldIssuerFingerprint:'f'.repeat(64)}}).reason,
  'ROTATION_PIN_MISMATCH');
 assert.equal(check({rotationProof:{...rotationProof,expectedPreviousSha256:'f'.repeat(64)}}).reason,
  'ROTATION_PIN_MISMATCH');
});
test('rotated proof cannot be replayed over an earlier epoch',()=>{
 assert.equal(check({oldPin:{...pin,epoch:3},expectedPin:{...pin,epoch:3}})
  .reason,'ROTATION_PIN_MISMATCH');
});
test('bad joint rotation signatures fail closed',()=>{
 assert.equal(check({rotationProof:{...rotationProof,newRotationSignatureBase64Url:'AQID'}})
  .transitionAccepted,false);
});
test('ledger head chaining is sensitive to independently pinned old head',()=>{
 const result=check({});
 const changed=check({oldPin:{...pin,headSha256:'d'.repeat(64)},
  expectedPin:{...pin,headSha256:'d'.repeat(64)}});
 assert.equal(changed.transitionAccepted,true);
 assert.notEqual(result.proposedPin.headSha256,changed.proposedPin.headSha256);
});
test('hostile objects and descriptors reject without executing getters',()=>{
 const hostile={...base()};let getterReads=0;
 Object.defineProperty(hostile,'oldPin',{enumerable:true,
  get(){getterReads++;throw Error('no getter');}});
 for(const input of [null,undefined,{},[],hostile,{...base(),[Symbol('unexpected')]:true}]){
  const r=inspectIssuerPinLedgerAdvance(input);
  assert.equal(r.transitionAccepted,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
 assert.equal(getterReads,0);
});
