import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectFencingWitnessReconciliation as inspect,FENCING_WITNESS_SCHEMA} from './registry-pin-fencing-witness-reconciliation.mjs';

const a=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const b=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const forged=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fingerprint=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const claim={schema:FENCING_WITNESS_SCHEMA,registryKey:'citadel-draft',
 epoch:8,leaderId:'leader-east',tokenSha256:'a'.repeat(64),storeVersion:13,
 checkpointHeadSha256:'b'.repeat(64)};
function observation(witnessId,key,claimed=claim,signer=key){
 const signatureBase64Url=sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-FENCING-WITNESS-V1\n'),
  Buffer.from(JSON.stringify({claim:claimed,witnessId}))]),signer.privateKey).toString('base64url');
 return {claim:claimed,witnessId,witnessPublicJwk:jwk(key),
  expectedWitnessFingerprint:fingerprint(key),signatureBase64Url};
}
const base=()=>({observations:[observation('archive-east',a),observation('archive-west',b)],
 requiredWitnessIds:['archive-east','archive-west'],expectedClaim:{...claim},minimumEpoch:8});
const denied=(x,reason)=>{
 const out=inspect(x);assert.equal(out.consistent,false,JSON.stringify(out));
 assert.equal(out.reason,reason);assert.equal(out.authorization,'DENY');
 assert.equal(out.stateChanged,false);
};
test('matching signed witnesses are evidence only, never authority',()=>{
 const out=inspect(base());assert.equal(out.consistent,true,JSON.stringify(out));
 assert.equal(out.observedEpoch,8);assert.equal(out.authorization,'DENY');
 assert.equal(out.trust,'NOT_ESTABLISHED');assert.equal(out.stateChanged,false);
});
test('two signed different leaders on same epoch are split-view',()=>{
 const x=base();x.observations[1]=observation('archive-west',b,{...claim,leaderId:'leader-west'});
 denied(x,'SIGNED_LEADER_SPLIT_VIEW');
});
test('higher signed epoch is not automatically a winner',()=>{
 const x=base();x.observations[1]=observation('archive-west',b,{...claim,epoch:9});
 denied(x,'SIGNED_LEADER_SPLIT_VIEW');
});
test('same epoch but different token is split-view',()=>{
 const x=base();x.observations[1]=observation('archive-west',b,{...claim,tokenSha256:'c'.repeat(64)});
 denied(x,'SIGNED_LEADER_SPLIT_VIEW');
});
test('same leader and epoch with inconsistent checkpoint is split-view',()=>{
 const x=base();x.observations[1]=observation('archive-west',b,{...claim,checkpointHeadSha256:'d'.repeat(64)});
 denied(x,'SIGNED_LEADER_SPLIT_VIEW');
});
test('matching evidence cannot substitute the caller pin',()=>{
 const x=base();x.expectedClaim.leaderId='leader-west';
 denied(x,'PINNED_FENCE_MISMATCH');
});
test('stale epoch below external floor is rejected',()=>{
 const x=base();x.minimumEpoch=9;denied(x,'EXPECTED_EPOCH_ROLLBACK');
});
test('duplicate witness keys cannot simulate independent signers',()=>{
 const x=base();x.observations[1]=observation('archive-west',a);
 denied(x,'INVALID_WITNESS_EVIDENCE');
});
test('forged signature is rejected',()=>{
 const x=base();x.observations[1]=observation('archive-west',b,claim,forged);
 denied(x,'INVALID_WITNESS_SIGNATURE');
});
test('missing and duplicate witness IDs rejected',()=>{
 const x=base();x.observations[1]=observation('archive-east',b);
 denied(x,'INVALID_OBSERVATION');
 const y=base();y.requiredWitnessIds=['archive-east','archive-east'];
 denied(y,'INVALID_WITNESS_ROSTER');
});
test('getter and symbol injection fail closed without evaluating accessor',()=>{
 denied({},'INVALID_INPUT');
 const x=base();let hits=0;
 Object.defineProperty(x.observations[0],'claim',{get(){hits++;throw Error('trap');}});
 denied(x,'INVALID_OBSERVATION');assert.equal(hits,0);
 denied({...base(),[Symbol('extra')]:true},'INVALID_INPUT');
});
