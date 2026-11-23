import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterStorageReceipt as inspect,ROSTER_STORAGE_RECEIPT_SCHEMA as SCHEMA} from './registry-pin-reviewer-roster-storage-receipt.mjs';
import {REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fingerprint=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const cp={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:5,revision:9,
 issuerFingerprint:'a'.repeat(64),rosterSha256:'b'.repeat(64),headSha256:'c'.repeat(64)};
function receipt(checkpoint=cp,signer=key,version=12){
 const fields={schema:SCHEMA,storeId:'citadel-offline-prototype',storeVersion:version,
 checkpoint,committedAt:'2026-11-23T07:00:00Z'};
 const signatureBase64Url=sign('sha256',Buffer.concat([
 Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-STORAGE-RECEIPT-V1\n'),
 Buffer.from(JSON.stringify(fields))]),signer.privateKey).toString('base64url');
 return {...fields,signatureBase64Url};
}
const base=()=>({receipt:receipt(),storagePublicJwk:jwk(key),
 expectedStorageFingerprint:fingerprint(key),expectedCheckpoint:{...cp},
 expectedStoreId:'citadel-offline-prototype',minimumStoreVersion:12,
 nowUtc:'2026-11-23T08:00:00Z'});
function denied(input,reason){
 const x=inspect(input);
 assert.equal(x.receiptValid,false,JSON.stringify(x));assert.equal(x.reason,reason);
 assert.equal(x.authorization,'DENY');assert.equal(x.stateChanged,false);
}
test('matching signed storage receipt is only preflight evidence',()=>{
 const x=inspect(base());assert.equal(x.receiptValid,true,JSON.stringify(x));
 assert.equal(x.storeVersion,12);assert.equal(x.authorization,'DENY');
 assert.equal(x.trust,'NOT_ESTABLISHED');assert.equal(x.stateChanged,false);
});
test('store replay below externally supplied floor denied',()=>{
 const x=base();x.receipt=receipt(cp,key,11);denied(x,'STORE_VERSION_ROLLBACK');
});
test('store identity substitution denied',()=>{
 denied({...base(),expectedStoreId:'other-offline-store'},'STORE_ID_MISMATCH');
});
test('signed mismatching checkpoint rejected',()=>{
 const x=base();x.receipt=receipt({...cp,revision:10});
 denied(x,'CHECKPOINT_MISMATCH');
});
test('tampered receipt cannot retain valid signature',()=>{
 const x=base();x.receipt={...x.receipt,committedAt:'2026-11-23T07:01:00Z'};
 denied(x,'INVALID_RECEIPT_SIGNATURE');
});
test('forged signature rejected',()=>{
 const x=base();x.receipt=receipt(cp,attacker);
 denied(x,'INVALID_RECEIPT_SIGNATURE');
});
test('storage public key substitution rejected',()=>{
 denied({...base(),storagePublicJwk:jwk(attacker.publicKey?{publicKey:attacker.publicKey}:attacker)},'STORAGE_KEY_SUBSTITUTION');
});
test('future receipt denied',()=>{
 denied({...base(),nowUtc:'2026-11-23T06:00:00Z'},'FUTURE_COMMIT');
});
test('malformed inputs fail closed with no authorization',()=>{
 denied({},'INVALID_INPUT');
 denied({...base(),minimumStoreVersion:0},'INVALID_RECEIPT');
});
test('getter and symbol injection cannot bypass validation',()=>{
 const x=base();let count=0;
 Object.defineProperty(x,'receipt',{get(){count++;throw Error('getter');}});
 denied(x,'INVALID_INPUT');assert.equal(count,0);
 denied({...base(),[Symbol('extra')]:true},'INVALID_INPUT');
});
