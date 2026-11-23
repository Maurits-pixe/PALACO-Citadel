import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectWitnessIssuerRotation,ISSUER_ROTATION_SCHEMA} from './registry-pin-witness-issuer-rotation.mjs';
import {WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const old=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const newer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const another=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=k=>hash(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const p=k.publicKey.export({format:'jwk'});
  return {kty:'EC',crv:'P-256',x:p.x,y:p.y};};
const members=[
 {witnessId:'alpha',fingerprint:'a'.repeat(64),status:'REVOKED'},
 {witnessId:'beta',fingerprint:'b'.repeat(64),status:'ACTIVE'}];
function registry(epoch,list,key){
 const bytes=Buffer.from(JSON.stringify({schema:WITNESS_REGISTRY_SCHEMA,epoch,members:list}));
 return {bytes,signature:sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n'),bytes]),
  key.privateKey).toString('base64url')};
}
const previous=registry(4,members,old);
const candidate=registry(5,members,newer);
function rotation(before=previous,after=candidate,oldKey=old,newKey=newer,
  statementOverrides={}){
 const statementBytes=Buffer.from(JSON.stringify({
  schema:ISSUER_ROTATION_SCHEMA,oldIssuerFingerprint:fp(oldKey),
  newIssuerFingerprint:fp(newKey),previousSha256:hash(before.bytes),
  candidateSha256:hash(after.bytes),previousEpoch:4,candidateEpoch:5,
  ...statementOverrides
 }));
 const message=Buffer.concat([
  Buffer.from('PALACO-CITADEL-ISSUER-ROTATION-V1\n'),statementBytes]);
 return {statementBytes,
  oldSignature:sign('sha256',message,oldKey.privateKey).toString('base64url'),
  newSignature:sign('sha256',message,newKey.privateKey).toString('base64url')};
}
const signed=rotation();
const base=()=>({
 previousBytes:previous.bytes,previousSignatureBase64Url:previous.signature,
 candidateBytes:candidate.bytes,candidateSignatureBase64Url:candidate.signature,
 oldIssuerPublicJwk:jwk(old),newIssuerPublicJwk:jwk(newer),
 pinnedOldIssuerFingerprint:fp(old),expectedPreviousSha256:hash(previous.bytes),
 minimumEpoch:4,rotationStatementBytes:signed.statementBytes,
 oldRotationSignatureBase64Url:signed.oldSignature,
 newRotationSignatureBase64Url:signed.newSignature
});
const run=overrides=>inspectWitnessIssuerRotation({...base(),...overrides});
test('both issuer signatures bind exact snapshots, but no authority is created',()=>{
 const r=run({});
 assert.equal(r.rotationConsistent,true,JSON.stringify(r));
 assert.equal(r.candidateEpoch,5);assert.equal(r.previousEpoch,4);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.releaseAllowed,false);assert.equal(r.stateChanged,false);
});
test('old and new issuer approvals are individually indispensable',()=>{
 assert.equal(run({oldRotationSignatureBase64Url:'AQID'}).reason,'ROTATION_DUAL_SIGNATURE_REQUIRED');
 assert.equal(run({newRotationSignatureBase64Url:'AQID'}).reason,'ROTATION_DUAL_SIGNATURE_REQUIRED');
});
test('old issuer pin cannot be silently replaced',()=>{
 assert.equal(run({pinnedOldIssuerFingerprint:fp(another)}).reason,'UNPINNED_OLD_ISSUER');
});
test('candidate issuer substitution rejected',()=>{
 assert.equal(run({newIssuerPublicJwk:jwk(another)}).reason,'INVALID_NEW_ISSUER');
});
test('previous signed snapshot cannot be replaced even with old issuer signature',()=>{
 const switched=registry(4,[members[0],{...members[1],status:'REVOKED'}],old);
 assert.equal(run({previousBytes:switched.bytes,
  previousSignatureBase64Url:switched.signature}).reason,'PREVIOUS_SNAPSHOT_SUBSTITUTION');
});
test('stale epoch and same-key rotation rejected',()=>{
 assert.equal(run({minimumEpoch:5}).reason,'STALE_PREVIOUS_EPOCH');
 const statement=rotation(previous,candidate,old,newer,{candidateEpoch:4});
 assert.equal(run({rotationStatementBytes:statement.statementBytes,
  oldRotationSignatureBase64Url:statement.oldSignature,
  newRotationSignatureBase64Url:statement.newSignature}).reason,'INVALID_ROTATION_BINDING');
});
test('reinstating revoked witness under new issuer key is forbidden',()=>{
 const changed=registry(5,[{...members[0],status:'ACTIVE'},members[1]],newer);
 const attest=rotation(previous,changed);
 assert.equal(run({candidateBytes:changed.bytes,candidateSignatureBase64Url:changed.signature,
  rotationStatementBytes:attest.statementBytes,
  oldRotationSignatureBase64Url:attest.oldSignature,
  newRotationSignatureBase64Url:attest.newSignature}).reason,'REVOCATION_ROLLBACK');
});
test('witness key rebound is rejected under dual-signed issuer rotation',()=>{
 const changed=registry(5,[members[0],{...members[1],fingerprint:'c'.repeat(64)}],newer);
 const attest=rotation(previous,changed);
 assert.equal(run({candidateBytes:changed.bytes,candidateSignatureBase64Url:changed.signature,
  rotationStatementBytes:attest.statementBytes,
  oldRotationSignatureBase64Url:attest.oldSignature,
  newRotationSignatureBase64Url:attest.newSignature}).reason,'WITNESS_KEY_REBOUND');
});
test('null, accessors and extra metadata fail closed',()=>{
 const hostile={...base()};let getterRuns=0;
 Object.defineProperty(hostile,'minimumEpoch',{enumerable:true,
  get(){getterRuns++;throw Error('unsafe');}});
 for(const value of [null,undefined,{},[],hostile,
  {...base(),[Symbol('extra')]:true}]){
  const r=inspectWitnessIssuerRotation(value);
  assert.equal(r.rotationConsistent,false);
  assert.equal(r.authorization,'DENY');
 }
 assert.equal(getterRuns,0);
});
