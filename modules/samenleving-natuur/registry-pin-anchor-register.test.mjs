import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectAnchorRegisterAdvance,ANCHOR_REGISTER_SCHEMA} from './registry-pin-anchor-register.mjs';
import {AUDIT_ANCHOR_SCHEMA} from './registry-pin-audit-anchor.mjs';
import {PIN_SCHEMA} from './registry-snapshot-pin.mjs';
import {computeRegistryPinEntryHash} from './registry-pin-ledger.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const pub=key.publicKey.export({format:'jwk'});
const anchorPublicJwk={kty:'EC',crv:'P-256',x:pub.x,y:pub.y};
const expectedAnchorKeyFingerprint=sha(key.publicKey.export({format:'der',type:'spki'}));
const pin=(revision,x)=>({schema:PIN_SCHEMA,issuerFingerprint:'a'.repeat(64),revision,registrySha256:x.repeat(64)});
const genesisPin=pin(1,'b'),mid=pin(2,'c'),latest=pin(3,'d');
const e1={sequence:1,previousHash:'0'.repeat(64),fromPin:genesisPin,toPin:mid};
const h1=computeRegistryPinEntryHash(e1);
const e2={sequence:2,previousHash:h1,fromPin:mid,toPin:latest};
const h2=computeRegistryPinEntryHash(e2);
const entries=[e1,e2];
function signed(sequence,headHash,currentPin){
  const bytes=Buffer.from(JSON.stringify({schema:AUDIT_ANCHOR_SCHEMA,sequence,
    headHash,genesisPin,currentPin}));
  return {bytes,signatureBase64Url:sign('sha256',Buffer.concat([
    Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),bytes
  ]),key.privateKey).toString('base64url')};
}
const previousAnchor=signed(1,h1,mid),candidateAnchor=signed(2,h2,latest);
const storedRecord={schema:ANCHOR_REGISTER_SCHEMA,sequence:1,
 anchorSha256:sha(previousAnchor.bytes),ledgerHeadSha256:h1,
 anchorKeyFingerprint:expectedAnchorKeyFingerprint};
const base=()=>({storedRecord:{...storedRecord},expectedRecord:{...storedRecord},
 candidateAnchor,previousAnchor,genesisPin,entries,anchorPublicJwk,expectedAnchorKeyFingerprint});
const run=change=>inspectAnchorRegisterAdvance({...base(),...change});
test('monotone candidate produces a hypothetical record but no authority or state change',()=>{
 const input=base();const result=inspectAnchorRegisterAdvance(input);
 assert.equal(result.candidateAccepted,true,JSON.stringify(result));
 assert.equal(result.proposedRecord.sequence,2);
 assert.equal(result.proposedRecord.ledgerHeadSha256,h2);
 assert.deepEqual(input.storedRecord,storedRecord);
 assert.equal(result.authorization,'DENY');assert.equal(result.stateChanged,false);
 assert.equal(result.releaseAllowed,false);
});
test('stale writer is rejected after hypothetical advancement',()=>{
 const next=run({});
 const result=run({storedRecord:next.proposedRecord});
 assert.equal(result.reason,'CAS_CONFLICT');
});
test('substituted stored checkpoint or stored head rejected',()=>{
 assert.equal(run({storedRecord:{...storedRecord,anchorSha256:'f'.repeat(64)},
   expectedRecord:{...storedRecord,anchorSha256:'f'.repeat(64)}}).reason,'STORED_ANCHOR_MISMATCH');
 assert.equal(run({storedRecord:{...storedRecord,ledgerHeadSha256:'f'.repeat(64)},
   expectedRecord:{...storedRecord,ledgerHeadSha256:'f'.repeat(64)}}).reason,'STORED_LEDGER_HEAD_MISMATCH');
});
test('changed signing key or broken signed continuity is rejected',()=>{
 assert.equal(run({expectedAnchorKeyFingerprint:'f'.repeat(64)}).candidateAccepted,false);
 assert.equal(run({candidateAnchor:{...candidateAnchor,signatureBase64Url:'AQID'}}).candidateAccepted,false);
});
test('omitted revisions, stale sequence and invalid expected snapshot are rejected',()=>{
 assert.equal(run({entries:[e1]}).candidateAccepted,false);
 assert.equal(run({candidateAnchor:previousAnchor}).candidateAccepted,false);
 assert.equal(run({expectedRecord:{...storedRecord,sequence:0}}).reason,'CAS_CONFLICT');
});
test('hostile null and malformed inputs fail closed',()=>{
 for(const input of [undefined,null,{},[],{...base(),storedRecord:null}]){
  const result=inspectAnchorRegisterAdvance(input);
  assert.equal(result.authorization,'DENY');
  assert.equal(result.candidateAccepted,false);
  assert.equal(result.stateChanged,false);
 }
});
