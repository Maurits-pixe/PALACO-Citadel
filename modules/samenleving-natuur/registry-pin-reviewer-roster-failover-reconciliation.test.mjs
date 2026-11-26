import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterFailoverReconciliation as inspect} from './registry-pin-reviewer-roster-failover-reconciliation.mjs';
import {ROSTER_STORAGE_RECEIPT_SCHEMA as SCHEMA} from './registry-pin-reviewer-roster-storage-receipt.mjs';
import {REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
const nodeA=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const nodeB=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const sha=x=>createHash('sha256').update(x).digest('hex');
const fingerprint=k=>sha(k.publicKey.export({format:'der',type:'spki'}));
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const cp={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:5,revision:9,
 issuerFingerprint:'a'.repeat(64),rosterSha256:'b'.repeat(64),headSha256:'c'.repeat(64)};
function receipt(checkpoint,signer,version=12,committedAt='2026-11-23T07:00:00Z'){
 const p={schema:SCHEMA,storeId:'citadel-test-replicas',storeVersion:version,checkpoint,committedAt};
 return {...p,signatureBase64Url:sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-STORAGE-RECEIPT-V1\n'),
  Buffer.from(JSON.stringify(p))]),signer.privateKey).toString('base64url')};
}
const observation=(nodeId,key,checkpoint=cp,version=12)=>({
 nodeId,receipt:receipt(checkpoint,key,version),storagePublicJwk:jwk(key),
 expectedStorageFingerprint:fingerprint(key)});
const base=()=>({observations:[observation('archive-one',nodeA),observation('archive-two',nodeB)],
 expectedCheckpoint:{...cp},expectedStoreId:'citadel-test-replicas',
 minimumStoreVersion:12,nowUtc:'2026-11-23T08:00:00Z',
 requiredNodeIds:['archive-one','archive-two']});
function denied(x,reason){
 const v=inspect(x);assert.equal(v.reconciled,false,JSON.stringify(v));
 assert.equal(v.reason,reason);assert.equal(v.authorization,'DENY');assert.equal(v.stateChanged,false);
}
test('distinct signed matching observations remain non-authoritative',()=>{
 const v=inspect(base());assert.equal(v.reconciled,true,JSON.stringify(v));
 assert.equal(v.observedStoreVersion,12);assert.equal(v.authorization,'DENY');
 assert.equal(v.trust,'NOT_ESTABLISHED');assert.equal(v.stateChanged,false);
});
test('newer signed version on one node is a split view, not a win',()=>{
 const x=base();x.observations[1]=observation('archive-two',nodeB,cp,13);
 denied(x,'SIGNED_SPLIT_VIEW');
});
test('different signed checkpoint head on one node is a split view',()=>{
 const x=base();x.observations[1]=observation('archive-two',nodeB,{...cp,headSha256:'d'.repeat(64)});
 denied(x,'SIGNED_SPLIT_VIEW');
});
test('same node state but different from pinned checkpoint cannot pass',()=>{
 const x=base();x.expectedCheckpoint={...cp,revision:8};
 denied(x,'PINNED_CHECKPOINT_MISMATCH');
});
test('missing required node rejected',()=>{
 const x=base();x.observations[1]=observation('unlisted-node',nodeB);
 denied(x,'INVALID_OBSERVATION');
});
test('duplicate node identity rejected',()=>{
 const x=base();x.observations[1]=observation('archive-one',nodeB);
 denied(x,'INVALID_OBSERVATION');
});
test('reusing one storage signing key across distinct nodes is denied',()=>{
 const x=base();x.observations[1]=observation('archive-two',nodeA);
 denied(x,'DUPLICATE_OR_INVALID_STORAGE_SIGNER');
});
test('forged signed observation denied',()=>{
 const x=base();x.observations[1]={...observation('archive-two',nodeB),
 receipt:receipt(cp,attacker)};
 denied(x,'INVALID_SIGNED_OBSERVATION_INVALID_RECEIPT_SIGNATURE');
});
test('rollback below pinned version floor denied',()=>{
 const x=base();x.minimumStoreVersion=13;
 denied(x,'INVALID_SIGNED_OBSERVATION_STORE_VERSION_ROLLBACK');
});
test('malformed and accessor-bearing observations fail closed',()=>{
 denied({},'INVALID_INPUT');
 const x=base();let hit=0;
 Object.defineProperty(x.observations[0],'receipt',{get(){hit++;throw Error('accessor');}});
 denied(x,'INVALID_OBSERVATION');assert.equal(hit,0);
 denied({...base(),[Symbol('extra')]:true},'INVALID_INPUT');
});
