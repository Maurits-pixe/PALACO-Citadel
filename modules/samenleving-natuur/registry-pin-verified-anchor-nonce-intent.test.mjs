import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {ANCHOR_OBSERVATION_SCHEMA} from './registry-pin-signed-anchor-observation.mjs';
import {inspectVerifiedAnchorNonceIntent as inspect} from './registry-pin-verified-anchor-nonce-intent.mjs';
const signer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fingerprint=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
function fixture(){
 const observation={schema:ANCHOR_OBSERVATION_SCHEMA,registryKey:'citadel-draft',
  epoch:8,anchorSha256:'a'.repeat(64),nonceSha256:'b'.repeat(64),
  observedAtUtc:'2026-11-26T09:00:00.000Z',expiresAtUtc:'2026-11-26T09:01:00.000Z'};
 const readerId='reader-one';
 const signatureBase64Url=sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-ANCHOR-OBSERVATION-V1\n'),
  Buffer.from(JSON.stringify({observation,readerId}))]),signer.privateKey).toString('base64url');
 return {envelope:{observation,readerId,readerPublicJwk:jwk(signer),
  expectedReaderFingerprint:fingerprint(signer),signatureBase64Url},
  expectedRegistryKey:'citadel-draft',expectedEpoch:8,
  expectedAnchorSha256:'a'.repeat(64),expectedNonceSha256:'b'.repeat(64),
  expectedReaderId:readerId,expectedReaderFingerprint:fingerprint(signer),
  nowUtc:'2026-11-26T09:00:30.000Z',maxAgeMs:60000};
}
function denied(x,reason){const r=inspect(x);assert.equal(r.intentValid,false,JSON.stringify(r));
 assert.equal(r.reason,reason);assert.equal(r.authorization,'DENY');assert.equal(r.stateChanged,false);
 assert.equal(r.proposedNonceConsumption,undefined);}
test('signed and pinned observation creates only inert nonce intent',()=>{
 const x=inspect(fixture());assert.equal(x.intentValid,true,JSON.stringify(x));
 assert.equal(x.proposedNonceConsumption.nonceSha256,'b'.repeat(64));
 assert.match(x.proposedNonceConsumption.observationSha256,/^[0-9a-f]{64}$/);
 assert.equal(x.authorization,'DENY');assert.equal(x.trust,'NOT_ESTABLISHED');
 assert.equal(x.executionAllowed,false);assert.equal(x.stateChanged,false);
});
test('identical signed evidence results in stable digest',()=>{
 const a=inspect(fixture()),b=inspect(fixture());
 assert.equal(a.proposedNonceConsumption.observationSha256,b.proposedNonceConsumption.observationSha256);
});
test('nonce replay with mismatched issued challenge cannot prepare consumption',()=>{
 const x=fixture();x.expectedNonceSha256='c'.repeat(64);
 denied(x,'SIGNED_OBSERVATION_NONCE_MISMATCH');
});
test('expired evidence cannot prepare consumption',()=>{
 const x=fixture();x.nowUtc='2026-11-26T09:01:00.000Z';
 denied(x,'SIGNED_OBSERVATION_EXPIRED_OBSERVATION');
});
test('forged evidence cannot prepare consumption',()=>{
 const x=fixture();
 x.envelope.signatureBase64Url=sign('sha256',Buffer.from('forged'),attacker.privateKey).toString('base64url');
 denied(x,'SIGNED_OBSERVATION_INVALID_OBSERVATION_SIGNATURE');
});
test('mutated signed epoch cannot prepare consumption',()=>{
 const x=fixture();x.envelope.observation.epoch=9;x.expectedEpoch=9;
 denied(x,'SIGNED_OBSERVATION_INVALID_OBSERVATION_SIGNATURE');
});
test('substituted reader public key is rejected',()=>{
 const x=fixture();x.envelope.readerPublicJwk=jwk(attacker);
 denied(x,'SIGNED_OBSERVATION_READER_KEY_SUBSTITUTION');
});
test('anchor mismatch cannot prepare consumption',()=>{
 const x=fixture();x.expectedAnchorSha256='e'.repeat(64);
 denied(x,'SIGNED_OBSERVATION_ANCHOR_CONFLICT');
});
test('extra observation field fails closed',()=>{
 const x=fixture();x.envelope.observation.extra=true;
 denied(x,'INVALID_ENVELOPE');
});
test('getter injection rejected without calling accessor',()=>{
 const x=fixture();let count=0;
 Object.defineProperty(x.envelope.observation,'epoch',{get(){count++;throw Error('getter');}});
 denied(x,'INVALID_ENVELOPE');assert.equal(count,0);
});
test('symbol injection and empty input rejected',()=>{
 denied({...fixture(),[Symbol('extra')]:true},'INVALID_INPUT');
 denied({},'INVALID_INPUT');
});


test('equivalent independently signed observations have the same canonical intent digest',()=>{
 const first=fixture(),second=fixture();
 assert.notEqual(first.envelope.signatureBase64Url,second.envelope.signatureBase64Url);
 const a=inspect(first),b=inspect(second);
 assert.equal(a.intentValid,true,JSON.stringify(a));
 assert.equal(b.intentValid,true,JSON.stringify(b));
 assert.equal(a.proposedNonceConsumption.observationSha256,
   b.proposedNonceConsumption.observationSha256);
 assert.equal(a.authorization,'DENY');
 assert.equal(b.authorization,'DENY');
});

test('verified nonce intent and proposal cannot be mutated into consumption authority',()=>{
 const result=inspect(fixture());
 assert.equal(result.intentValid,true,JSON.stringify(result));
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.proposedNonceConsumption),true);
 assert.equal(Object.isFrozen(result.unresolvedGates),true);
 assert.throws(()=>{result.authorization='ALLOW';},TypeError);
 assert.throws(()=>{result.stateChanged=true;},TypeError);
 assert.throws(()=>{result.proposedNonceConsumption.nonceSha256='f'.repeat(64);},TypeError);
 assert.throws(()=>{result.unresolvedGates.pop();},TypeError);
 assert.equal(result.authorization,'DENY');
 assert.equal(result.stateChanged,false);
 assert.equal(result.proposedNonceConsumption.nonceSha256,'b'.repeat(64));
 assert.equal(result.unresolvedGates.length,6);
});

test('invalid nonce observation denial result is immutable',()=>{
 const input=fixture();
 input.expectedNonceSha256='c'.repeat(64);
 const result=inspect(input);
 assert.equal(result.intentValid,false);
 assert.equal(Object.isFrozen(result),true);
 assert.throws(()=>{result.intentValid=true;},TypeError);
 assert.throws(()=>{result.releaseAllowed=true;},TypeError);
 assert.throws(()=>{result.authorization='ALLOW';},TypeError);
 assert.equal(result.authorization,'DENY');
 assert.equal(result.releaseAllowed,false);
});
