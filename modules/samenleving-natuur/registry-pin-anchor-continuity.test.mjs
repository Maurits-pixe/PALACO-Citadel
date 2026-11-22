import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectAuditAnchorContinuity,ANCHOR_CONTINUITY_SCHEMA} from './registry-pin-anchor-continuity.mjs';
import {AUDIT_ANCHOR_SCHEMA} from './registry-pin-audit-anchor.mjs';
import {computeRegistryPinEntryHash} from './registry-pin-ledger.mjs';
import {PIN_SCHEMA} from './registry-snapshot-pin.mjs';

const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=key.publicKey.export({format:'jwk'});
const anchorPublicJwk={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
const sha=b=>createHash('sha256').update(b).digest('hex');
const expectedAnchorKeyFingerprint=sha(key.publicKey.export({format:'der',type:'spki'}));
const pin=(n,d)=>({schema:PIN_SCHEMA,issuerFingerprint:'a'.repeat(64),
  revision:n,registrySha256:d.repeat(64)});
const genesisPin=pin(1,'b'),mid=pin(2,'c'),latest=pin(3,'d');
const e1={sequence:1,previousHash:'0'.repeat(64),fromPin:genesisPin,toPin:mid};
const h1=computeRegistryPinEntryHash(e1);
const e2={sequence:2,previousHash:h1,fromPin:mid,toPin:latest};
const h2=computeRegistryPinEntryHash(e2);
const entries=[e1,e2];
function signed(document) {
 const bytes=Buffer.from(JSON.stringify(document));
 return {bytes,signatureBase64Url:sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),bytes
 ]),key.privateKey).toString('base64url')};
}
const anchor=(sequence,headHash,currentPin)=>signed({
 schema:AUDIT_ANCHOR_SCHEMA,sequence,headHash,genesisPin,currentPin
});
const previousAnchor=anchor(1,h1,mid),candidateAnchor=anchor(2,h2,latest);
const base=()=>({
 previousAnchor,candidateAnchor,genesisPin,entries,anchorPublicJwk,
 expectedAnchorKeyFingerprint,trustedPreviousAnchorSha256:sha(previousAnchor.bytes),
 trustedPreviousSequence:1
});
const inspect=change=>inspectAuditAnchorContinuity({...base(),...change});
test('signed monotone checkpoint continuity is locally valid but never authorizes',()=>{
 const r=inspect({});
 assert.equal(r.schema,ANCHOR_CONTINUITY_SCHEMA);
 assert.equal(r.continuityVerified,true,JSON.stringify(r));
 assert.equal(r.previousSequence,1);assert.equal(r.candidateSequence,2);
 assert.equal(r.candidateHeadHash,h2);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.releaseAllowed,false);assert.equal(r.stateChanged,false);
});
test('substituted old checkpoint cannot replace a pinned digest',()=>{
 const substituted=anchor(1,h1,{...mid,registrySha256:'e'.repeat(64)});
 assert.equal(inspect({previousAnchor:substituted}).reason,'PREVIOUS_ANCHOR_SUBSTITUTED');
});
test('truncated history and stale latest checkpoint rejected',()=>{
 assert.equal(inspect({entries:[e1]}).continuityVerified,false);
 assert.equal(inspect({candidateAnchor:previousAnchor}).continuityVerified,false);
});
test('old checkpoint cannot be swapped even when signed with same key',()=>{
 const forged=anchor(1,'f'.repeat(64),mid);
 assert.equal(inspect({previousAnchor:forged}).reason,'PREVIOUS_ANCHOR_SUBSTITUTED');
});
test('candidate signature and modified history fail closed',()=>{
 assert.equal(inspect({candidateAnchor:{...candidateAnchor,signatureBase64Url:'AQID'}}).continuityVerified,false);
 assert.equal(inspect({entries:[e1,{...e2,toPin:{...latest,registrySha256:'e'.repeat(64)}}]}).continuityVerified,false);
});
test('anchor signing key mismatch and sequence floor tampering rejected',()=>{
 assert.equal(inspect({expectedAnchorKeyFingerprint:'f'.repeat(64)}).continuityVerified,false);
 assert.equal(inspect({trustedPreviousSequence:0}).continuityVerified,false);
});
test('missing, malformed and dangerous inputs always deny',()=>{
 for(const value of [null,undefined,{},[],{...base(),previousAnchor:null},
   {...base(),trustedPreviousAnchorSha256:'bad'}]){
  const r=inspectAuditAnchorContinuity(value);
  assert.equal(r.continuityVerified,false);
  assert.equal(r.authorization,'DENY');
  assert.equal(r.executionAllowed,false);
 }
});
