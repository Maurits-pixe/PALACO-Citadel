import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {FENCING_ANCHOR_SCHEMA,computeFencingAnchorHash} from './registry-pin-fencing-epoch-anchor-chain.mjs';
import {inspectSignedAnchorCasPreflight as inspect} from './registry-pin-signed-anchor-cas-preflight.mjs';

const keys=[generateKeyPairSync('ec',{namedCurve:'prime256v1'}),
 generateKeyPairSync('ec',{namedCurve:'prime256v1'})];
const fprint=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
function fixture(){
 const current={schema:FENCING_ANCHOR_SCHEMA,registryKey:'citadel-draft',
  epoch:7,leaderId:'leader-old',tokenSha256:'a'.repeat(64),
  checkpointHeadSha256:'b'.repeat(64),anchorSha256:'c'.repeat(64)};
 const step={registryKey:'citadel-draft',previousEpoch:7,epoch:8,
  leaderId:'leader-new',tokenSha256:'d'.repeat(64),
  checkpointHeadSha256:'e'.repeat(64)};
 const candidate={schema:FENCING_ANCHOR_SCHEMA,registryKey:'citadel-draft',
  epoch:8,leaderId:step.leaderId,tokenSha256:step.tokenSha256,
  checkpointHeadSha256:step.checkpointHeadSha256,
  anchorSha256:computeFencingAnchorHash(current.anchorSha256,step)};
 const payload={previousAnchorSha256:current.anchorSha256,
  step,candidateAnchorSha256:candidate.anchorSha256};
 const ids=['witness-east','witness-west'];
 const witnesses=ids.map((witnessId,i)=>({
  witnessId,witnessPublicJwk:jwk(keys[i]),expectedWitnessFingerprint:fprint(keys[i]),
  signatureBase64Url:sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-SIGNED-FENCING-TRANSITION-V1\n'),
   Buffer.from(JSON.stringify({payload,witnessId}))]),keys[i].privateKey).toString('base64url')
 }));
 return {signedTransitionChain:{previousAnchor:{...current},
  batches:[{payload,witnesses}],expectedFinalAnchor:{...candidate},
  minimumEpoch:7,requiredWitnessIds:ids,
  witnessKeyPins:{'witness-east':fprint(keys[0]),'witness-west':fprint(keys[1])}},
  observedAnchor:{registryKey:current.registryKey,epoch:7,anchorSha256:current.anchorSha256},
  expectedCurrentAnchor:{...current},expectedCandidateAnchor:{...candidate}};
}
function denied(x,reason){
 const out=inspect(x);
 assert.equal(out.preflightValid,false,JSON.stringify(out));
 assert.equal(out.reason,reason);
 assert.equal(out.authorization,'DENY');
 assert.equal(out.stateChanged,false);
}
test('matching signed transition and observed anchor yield non-executable proposal',()=>{
 const out=inspect(fixture());
 assert.equal(out.preflightValid,true,JSON.stringify(out));
 assert.equal(out.proposedCompareAndSwap.expectedEpoch,7);
 assert.equal(out.proposedCompareAndSwap.nextEpoch,8);
 assert.equal(out.authorization,'DENY');assert.equal(out.stateChanged,false);
 assert.equal(out.executionAllowed,false);
});
test('observed anchor rollback denied even with valid signatures',()=>{
 const x=fixture();x.observedAnchor.epoch=6;
 denied(x,'OBSERVED_ANCHOR_CONFLICT');
});
test('observed anchor fork denied even with valid signatures',()=>{
 const x=fixture();x.observedAnchor.anchorSha256='f'.repeat(64);
 denied(x,'OBSERVED_ANCHOR_CONFLICT');
});
test('observed registry substitution rejected',()=>{
 const x=fixture();x.observedAnchor.registryKey='other-draft';
 denied(x,'OBSERVED_ANCHOR_CONFLICT');
});
test('candidate fork cannot alter pinned final hash',()=>{
 const x=fixture();x.expectedCandidateAnchor.anchorSha256='f'.repeat(64);
 denied(x,'SIGNED_CHAIN_PIN_MISMATCH');
});
test('previous pinned anchor cannot silently diverge',()=>{
 const x=fixture();x.expectedCurrentAnchor.anchorSha256='f'.repeat(64);
 denied(x,'SIGNED_CHAIN_PIN_MISMATCH');
});
test('modified transition signature is refused',()=>{
 const x=fixture();x.signedTransitionChain.batches[0].witnesses[0].signatureBase64Url=
 x.signedTransitionChain.batches[0].witnesses[1].signatureBase64Url;
 denied(x,'SIGNED_TRANSITION_INVALID_TRANSITION_SIGNATURE');
});
test('missing witness is refused before emitting CAS proposal',()=>{
 const x=fixture();x.signedTransitionChain.batches[0].witnesses.pop();
 denied(x,'SIGNED_TRANSITION_INVALID_BATCH');
});
test('replayed input with a newer observed epoch is refused',()=>{
 const x=fixture();x.observedAnchor.epoch=8;
 denied(x,'OBSERVED_ANCHOR_CONFLICT');
});
test('candidate must advance epoch',()=>{
 const x=fixture();x.expectedCandidateAnchor.epoch=7;
 denied(x,'SIGNED_CHAIN_PIN_MISMATCH');
});
test('malformed and accessor-bearing outer input is denied without calling getter',()=>{
 denied({},'INVALID_INPUT');
 const x=fixture();let invoked=0;
 Object.defineProperty(x,'observedAnchor',{get(){invoked++;throw Error('trap');}});
 denied(x,'INVALID_INPUT');assert.equal(invoked,0);
 denied({...fixture(),[Symbol('unexpected')]:true},'INVALID_INPUT');
});
