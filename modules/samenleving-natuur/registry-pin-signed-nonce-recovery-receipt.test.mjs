import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {SIGNED_NONCE_RECEIPT_SCHEMA as SCHEMA,computeNonceRecoveryReceiptDigest as digest,
 inspectSignedNonceRecoveryReceipt as inspect} from './registry-pin-signed-nonce-recovery-receipt.mjs';
const signer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const x=k.publicKey.export({format:'jwk'});
 return {kty:'EC',crv:'P-256',x:x.x,y:x.y};};
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-NONCE-RECOVERY-RECEIPT-V1\n');
function fixture(){
 const receipt={schema:SCHEMA,registryKey:'citadel-draft',nonceSha256:'a'.repeat(64),
  readerId:'reader-east',epoch:8,anchorSha256:'b'.repeat(64),
  evidenceSha256:'c'.repeat(64),receiptSha256:'0'.repeat(64)};
 receipt.receiptSha256=digest(receipt);
 const signerId='receipt-witness';
 const signatureBase64Url=sign('sha256',Buffer.concat([DOMAIN,
  Buffer.from(JSON.stringify({receipt,signerId}))]),signer.privateKey).toString('base64url');
 return {envelope:{receipt,signerId,signerPublicJwk:jwk(signer),
  expectedSignerFingerprint:fp(signer),signatureBase64Url},
  expectedReceipt:{registryKey:receipt.registryKey,nonceSha256:receipt.nonceSha256,
   readerId:receipt.readerId,epoch:receipt.epoch,anchorSha256:receipt.anchorSha256,
   evidenceSha256:receipt.evidenceSha256},
  expectedSignerId:signerId,expectedSignerFingerprint:fp(signer)};
}
function denied(x,reason){
 const out=inspect(x);assert.equal(out.receiptValid,false,JSON.stringify(out));
 assert.equal(out.reason,reason);assert.equal(out.authorization,'DENY');
 assert.equal(out.stateChanged,false);assert.equal(out.executionAllowed,false);
}
test('pinned signer attests receipt hash but never authorizes recovery',()=>{
 const out=inspect(fixture());assert.equal(out.receiptValid,true,JSON.stringify(out));
 assert.equal(out.authorization,'DENY');assert.equal(out.trust,'NOT_ESTABLISHED');
 assert.equal(out.executionAllowed,false);assert.equal(out.releaseAllowed,false);
});
test('deterministic domain separated digest of receipt fields',()=>{
 const a=fixture(),b=fixture();
 assert.equal(a.envelope.receipt.receiptSha256,b.envelope.receipt.receiptSha256);
});
test('nonce replay or nonce substitution cannot match expected receipt',()=>{
 const x=fixture();x.expectedReceipt.nonceSha256='d'.repeat(64);
 denied(x,'RECEIPT_EXPECTATION_MISMATCH');
});
test('changed reader rejected',()=>{
 const x=fixture();x.expectedReceipt.readerId='reader-west';
 denied(x,'RECEIPT_EXPECTATION_MISMATCH');
});
test('different epoch and anchor rejected',()=>{
 const x=fixture();x.expectedReceipt.epoch=9;denied(x,'RECEIPT_EXPECTATION_MISMATCH');
 const y=fixture();y.expectedReceipt.anchorSha256='d'.repeat(64);
 denied(y,'RECEIPT_EXPECTATION_MISMATCH');
});
test('different evidence rejected',()=>{
 const x=fixture();x.expectedReceipt.evidenceSha256='e'.repeat(64);
 denied(x,'RECEIPT_EXPECTATION_MISMATCH');
});
test('receipt digest tampering rejected before signature validation',()=>{
 const x=fixture();x.envelope.receipt.receiptSha256='f'.repeat(64);
 denied(x,'RECEIPT_DIGEST_MISMATCH');
});
test('forged signature rejected',()=>{
 const x=fixture();x.envelope.signatureBase64Url=
 sign('sha256',Buffer.from('forged'),attacker.privateKey).toString('base64url');
 denied(x,'INVALID_RECEIPT_SIGNATURE');
});
test('signer identity substitution rejected',()=>{
 const x=fixture();x.expectedSignerId='other-witness';
 denied(x,'SIGNER_PIN_MISMATCH');
});
test('public key substitution rejected',()=>{
 const x=fixture();x.envelope.signerPublicJwk=jwk(attacker);
 denied(x,'SIGNER_KEY_SUBSTITUTION');
});
test('signature from another receipt cannot be replayed',()=>{
 const x=fixture();const y=fixture();
 y.envelope.receipt.evidenceSha256='e'.repeat(64);
 y.envelope.receipt.receiptSha256=digest(y.envelope.receipt);
 y.expectedReceipt.evidenceSha256='e'.repeat(64);
 y.envelope.signatureBase64Url=x.envelope.signatureBase64Url;
 denied(y,'INVALID_RECEIPT_SIGNATURE');
});
test('invalid input and symbol injection fail closed',()=>{
 denied({},'INVALID_INPUT');
 denied({...fixture(),[Symbol('extra')]:1},'INVALID_INPUT');
});
test('getter injection is not invoked',()=>{
 const x=fixture();let calls=0;
 Object.defineProperty(x.envelope.receipt,'nonceSha256',{get(){calls++;throw Error('getter');}});
 denied(x,'INVALID_RECEIPT_EVIDENCE');assert.equal(calls,0);
});
