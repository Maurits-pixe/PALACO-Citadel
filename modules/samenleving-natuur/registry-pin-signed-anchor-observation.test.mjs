import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectSignedAnchorObservation as inspect,ANCHOR_OBSERVATION_SCHEMA as SCHEMA} from './registry-pin-signed-anchor-observation.mjs';
const signer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fingerprint=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const domain=Buffer.from('PALACO-CITADEL-ANCHOR-OBSERVATION-V1\n');
const observation=()=>({schema:SCHEMA,registryKey:'citadel-draft',
 epoch:8,anchorSha256:'a'.repeat(64),nonceSha256:'b'.repeat(64),
 observedAtUtc:'2026-11-25T06:00:00.000Z',expiresAtUtc:'2026-11-25T06:01:00.000Z'});
function fixture(){
 const o=observation(),readerId='anchor-reader-one';
 const signatureBase64Url=sign('sha256',Buffer.concat([domain,
  Buffer.from(JSON.stringify({observation:o,readerId}))]),signer.privateKey).toString('base64url');
 return {envelope:{observation:o,readerId,readerPublicJwk:jwk(signer),
  expectedReaderFingerprint:fingerprint(signer),signatureBase64Url},
  expectedRegistryKey:o.registryKey,expectedEpoch:o.epoch,expectedAnchorSha256:o.anchorSha256,
  expectedNonceSha256:o.nonceSha256,expectedReaderId:readerId,
  expectedReaderFingerprint:fingerprint(signer),nowUtc:'2026-11-25T06:00:30.000Z',maxAgeMs:60000};
}
function denied(x,reason){const out=inspect(x);assert.equal(out.observationValid,false,JSON.stringify(out));
 assert.equal(out.reason,reason);assert.equal(out.authorization,'DENY');assert.equal(out.stateChanged,false);}
test('matching nonce-bound signed anchor is inspection only',()=>{
 const out=inspect(fixture());assert.equal(out.observationValid,true,JSON.stringify(out));
 assert.equal(out.observedEpoch,8);assert.equal(out.trust,'NOT_ESTABLISHED');
 assert.equal(out.authorization,'DENY');assert.equal(out.executionAllowed,false);
});
test('old nonce replay denied',()=>{const x=fixture();x.expectedNonceSha256='c'.repeat(64);denied(x,'NONCE_MISMATCH');});
test('old anchor hash rejected',()=>{const x=fixture();x.expectedAnchorSha256='c'.repeat(64);denied(x,'ANCHOR_CONFLICT');});
test('higher epoch is not automatically accepted',()=>{const x=fixture();x.expectedEpoch=9;denied(x,'ANCHOR_CONFLICT');});
test('expired observation denied',()=>{const x=fixture();x.nowUtc='2026-11-25T06:01:00.000Z';denied(x,'EXPIRED_OBSERVATION');});
test('future observation denied',()=>{const x=fixture();x.nowUtc='2026-11-25T05:59:59.999Z';denied(x,'FUTURE_OBSERVATION');});
test('excessive validity window denied',()=>{const x=fixture();x.maxAgeMs=1000;denied(x,'EXPIRED_OBSERVATION');});
test('reader identity substitution denied',()=>{const x=fixture();x.expectedReaderId='other-reader';denied(x,'READER_PIN_MISMATCH');});
test('reader key substitution denied',()=>{const x=fixture();x.envelope.readerPublicJwk=jwk(attacker);denied(x,'READER_KEY_SUBSTITUTION');});
test('forged signature denied',()=>{const x=fixture();x.envelope.signatureBase64Url=sign('sha256',Buffer.from('other'),attacker.privateKey).toString('base64url');denied(x,'INVALID_OBSERVATION_SIGNATURE');});
test('changed signed timestamp denied',()=>{const x=fixture();x.envelope.observation.observedAtUtc='2026-11-25T06:00:01.000Z';denied(x,'INVALID_OBSERVATION_SIGNATURE');});
test('malformed dates fail closed',()=>{const x=fixture();x.nowUtc='2026-11-25T06:00:30Z';denied(x,'INVALID_TIME');});
test('accessors and symbols rejected without invocation',()=>{
 denied({},'INVALID_INPUT');const x=fixture();let n=0;
 Object.defineProperty(x.envelope,'readerId',{get(){n++;throw Error('getter');}});
 denied(x,'INVALID_OBSERVATION');assert.equal(n,0);
 denied({...fixture(),[Symbol('extra')]:true},'INVALID_INPUT');
});


test('signed anchor reader rejects trailing DER bytes even with adjusted outer length',()=>{
 const x=fixture();
 const der=Buffer.from(x.envelope.signatureBase64Url,'base64url');
 const changed=Buffer.concat([der,Buffer.from([0])]);
 changed[1]=der[1]+1;
 x.envelope.signatureBase64Url=changed.toString('base64url');
 denied(x,'INVALID_SIGNATURE_ENCODING');
});

test('signed anchor reader rejects noncanonical DER INTEGER tags',()=>{
 const x=fixture();
 const der=Buffer.from(x.envelope.signatureBase64Url,'base64url');
 assert.equal(der[2],0x02);
 der[2]=0x03;
 x.envelope.signatureBase64Url=der.toString('base64url');
 denied(x,'INVALID_SIGNATURE_ENCODING');
});

test('signed anchor reader rejects DER sequence-length disagreement',()=>{
 const x=fixture();
 const der=Buffer.from(x.envelope.signatureBase64Url,'base64url');
 assert.equal(der[1],der.length-2);
 der[1]-=1;
 x.envelope.signatureBase64Url=der.toString('base64url');
 denied(x,'INVALID_SIGNATURE_ENCODING');
});
