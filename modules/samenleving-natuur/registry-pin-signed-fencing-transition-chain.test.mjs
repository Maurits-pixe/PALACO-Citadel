import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {computeFencingAnchorHash,FENCING_ANCHOR_SCHEMA} from './registry-pin-fencing-epoch-anchor-chain.mjs';
import {inspectSignedFencingTransitionChain as inspect} from './registry-pin-signed-fencing-transition-chain.mjs';
const keys=[generateKeyPairSync('ec',{namedCurve:'prime256v1'}),
 generateKeyPairSync('ec',{namedCurve:'prime256v1'})];
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=k=>createHash('sha256').update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const jwk=k=>{const j=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const first={schema:FENCING_ANCHOR_SCHEMA,registryKey:'citadel-draft',
 epoch:7,leaderId:'leader-old',tokenSha256:'a'.repeat(64),
 checkpointHeadSha256:'b'.repeat(64),anchorSha256:'c'.repeat(64)};
const steps=[
 {registryKey:'citadel-draft',previousEpoch:7,epoch:8,leaderId:'leader-east',
  tokenSha256:'d'.repeat(64),checkpointHeadSha256:'e'.repeat(64)},
 {registryKey:'citadel-draft',previousEpoch:8,epoch:9,leaderId:'leader-west',
  tokenSha256:'f'.repeat(64),checkpointHeadSha256:'1'.repeat(64)}
];
const names=['witness-one','witness-two'];
const pins=()=>({'witness-one':fp(keys[0]),'witness-two':fp(keys[1])});
function make(){
 let cursor={...first};
 const batches=[];
 for(const step of steps){
  const candidateAnchorSha256=computeFencingAnchorHash(cursor.anchorSha256,step);
  const payload={previousAnchorSha256:cursor.anchorSha256,step:{...step},candidateAnchorSha256};
  const witnesses=names.map((witnessId,i)=>{
   const signed=Buffer.from(JSON.stringify({payload,witnessId}));
   const signatureBase64Url=sign('sha256',Buffer.concat([
    Buffer.from('PALACO-CITADEL-SIGNED-FENCING-TRANSITION-V1\n'),signed]),keys[i].privateKey).toString('base64url');
   return {witnessId,witnessPublicJwk:jwk(keys[i]),expectedWitnessFingerprint:fp(keys[i]),
    signatureBase64Url};
  });
  batches.push({payload,witnesses});
  cursor={schema:FENCING_ANCHOR_SCHEMA,registryKey:step.registryKey,epoch:step.epoch,
   leaderId:step.leaderId,tokenSha256:step.tokenSha256,
   checkpointHeadSha256:step.checkpointHeadSha256,anchorSha256:candidateAnchorSha256};
 }
 return {previousAnchor:{...first},batches,expectedFinalAnchor:cursor,
  minimumEpoch:7,requiredWitnessIds:[...names],witnessKeyPins:pins()};
}
function denied(input,reason){
 const out=inspect(input);assert.equal(out.verified,false,JSON.stringify(out));
 assert.equal(out.reason,reason);assert.equal(out.authorization,'DENY');
 assert.equal(out.stateChanged,false);
}
test('two consecutive transitions with two distinct signatures remain DENY-only',()=>{
 const x=inspect(make());assert.equal(x.verified,true,JSON.stringify(x));
 assert.equal(x.finalEpoch,9);assert.equal(x.witnessCount,2);
 assert.equal(x.transitionCount,2);assert.equal(x.authorization,'DENY');
 assert.equal(x.trust,'NOT_ESTABLISHED');assert.equal(x.stateChanged,false);
});
test('missing intermediate transition is denied',()=>{
 const x=make();x.batches.splice(0,1);denied(x,'ANCHOR_CHAIN_DISCONTINUITY');
});
test('modified signed leader name fails hash binding',()=>{
 const x=make();x.batches[0].payload.step.leaderId='leader-rogue';
 denied(x,'INVALID_CANDIDATE_ANCHOR');
});
test('tampering candidate anchor fails before signature check',()=>{
 const x=make();x.batches[1].payload.candidateAnchorSha256='2'.repeat(64);
 denied(x,'INVALID_CANDIDATE_ANCHOR');
});
test('substitution with a valid but unpinned witness key denied',()=>{
 const x=make();x.batches[0].witnesses[1].witnessPublicJwk=jwk(attacker);
 denied(x,'WITNESS_KEY_SUBSTITUTION');
});
test('forged witness signature denied',()=>{
 const x=make();x.batches[0].witnesses[1].signatureBase64Url=
 sign('sha256',Buffer.from('not-original'),attacker.privateKey).toString('base64url');
 denied(x,'INVALID_TRANSITION_SIGNATURE');
});
test('witness signature replay across consecutive transitions denied',()=>{
 const x=make();x.batches[1].witnesses[0].signatureBase64Url=x.batches[0].witnesses[0].signatureBase64Url;
 denied(x,'INVALID_TRANSITION_SIGNATURE');
});
test('duplicate signer identity cannot count twice',()=>{
 const x=make();x.batches[0].witnesses[1].witnessId='witness-one';
 denied(x,'INVALID_WITNESS_EVIDENCE');
});
test('same public key for both required signers denied',()=>{
 const x=make();x.witnessKeyPins['witness-two']=x.witnessKeyPins['witness-one'];
 denied(x,'DUPLICATE_OR_INVALID_WITNESS_KEY_PIN');
});
test('final pinned anchor substitution denied',()=>{
 const x=make();x.expectedFinalAnchor.epoch=10;
 denied(x,'PINNED_FINAL_ANCHOR_MISMATCH');
});
test('external epoch floor rejects rollback',()=>{
 const x=make();x.minimumEpoch=8;
 denied(x,'EXTERNAL_EPOCH_FLOOR');
});
test('extra unknown field and accessor rejected without getter execution',()=>{
 const x=make();let count=0;
 Object.defineProperty(x.batches[0].witnesses[0],'witnessId',{get(){count++;throw Error('getter');}});
 denied(x,'INVALID_WITNESS_EVIDENCE');assert.equal(count,0);
 denied({...make(),[Symbol('extra')]:1},'INVALID_INPUT');
});
test('missing required signer, invalid roster and empty input are denied',()=>{
 const x=make();x.batches[0].witnesses.pop();denied(x,'INVALID_BATCH');
 const y=make();y.requiredWitnessIds=['witness-one','witness-one'];
 denied(y,'INVALID_WITNESS_ROSTER');
 denied({},'INVALID_INPUT');
});


test('duplicate witness roster fails before attacker-owned key-pin enumeration',()=>{
 const x=make();
 x.requiredWitnessIds=['witness-one','witness-one'];
 let pinEnumerations=0;
 x.witnessKeyPins=new Proxy(pins(),{
  ownKeys(){pinEnumerations++;throw Error('duplicate roster must not inspect PIN map');}
 });
 denied(x,'INVALID_WITNESS_ROSTER');
 assert.equal(pinEnumerations,0);
});

test('invalid witness roster identifier fails before attacker-owned key-pin enumeration',()=>{
 const x=make();
 x.requiredWitnessIds=['witness-one','BAD ID'];
 let pinEnumerations=0;
 x.witnessKeyPins=new Proxy(pins(),{
  ownKeys(){pinEnumerations++;throw Error('invalid witness ID must not inspect PIN map');}
 });
 denied(x,'INVALID_WITNESS_ROSTER');
 assert.equal(pinEnumerations,0);
});


test('verified signed fencing evidence and unresolved trust gates are immutable',()=>{
 const out=inspect(make());
 assert.equal(out.verified,true,JSON.stringify(out));
 assert.equal(Object.isFrozen(out),true);
 assert.equal(Object.isFrozen(out.unresolvedGates),true);
 assert.throws(()=>{out.authorization='ALLOW';},TypeError);
 assert.throws(()=>{out.executionAllowed=true;},TypeError);
 assert.throws(()=>{out.finalEpoch=999;},TypeError);
 assert.throws(()=>{out.unresolvedGates.pop();},TypeError);
 assert.equal(out.authorization,'DENY');
 assert.equal(out.executionAllowed,false);
 assert.equal(out.finalEpoch,9);
 assert.equal(out.unresolvedGates.length,5);
});

test('denied signed fencing evidence cannot be rewritten as authorized',()=>{
 const input=make();
 input.batches[0].witnesses.pop();
 const out=inspect(input);
 assert.equal(out.reason,'INVALID_BATCH');
 assert.equal(Object.isFrozen(out),true);
 assert.throws(()=>{out.verified=true;},TypeError);
 assert.throws(()=>{out.authorization='ALLOW';},TypeError);
 assert.throws(()=>{out.releaseAllowed=true;},TypeError);
 assert.throws(()=>{out.reason='AUTHORIZED';},TypeError);
 assert.equal(out.verified,false);
 assert.equal(out.authorization,'DENY');
 assert.equal(out.releaseAllowed,false);
});


test('witness DER signature with appended trailing byte fails canonical transport validation',()=>{
 const x=make();
 const original=Buffer.from(x.batches[0].witnesses[0].signatureBase64Url,'base64url');
 const changed=Buffer.concat([original,Buffer.from([0])]);
 changed[1]=original[1]+1;
 x.batches[0].witnesses[0].signatureBase64Url=changed.toString('base64url');
 denied(x,'INVALID_SIGNATURE_ENCODING');
});

test('witness DER signature with invalid INTEGER tag is denied before verification',()=>{
 const x=make();
 const changed=Buffer.from(x.batches[0].witnesses[0].signatureBase64Url,'base64url');
 assert.equal(changed[2],0x02);
 changed[2]=0x03;
 x.batches[0].witnesses[0].signatureBase64Url=changed.toString('base64url');
 denied(x,'INVALID_SIGNATURE_ENCODING');
});

test('witness DER signature with noncanonical sequence length is denied',()=>{
 const x=make();
 const changed=Buffer.from(x.batches[0].witnesses[0].signatureBase64Url,'base64url');
 assert.equal(changed[1],changed.length-2);
 changed[1]--;
 x.batches[0].witnesses[0].signatureBase64Url=changed.toString('base64url');
 denied(x,'INVALID_SIGNATURE_ENCODING');
});


test('witness roster indexed accessor cannot execute during verification',()=>{
 const x=make();
 let reads=0;
 Object.defineProperty(x.requiredWitnessIds,'0',{get(){
  reads++;
  throw Error('untrusted witness array getter must not execute');
 }});
 denied(x,'INVALID_WITNESS_ROSTER');
 assert.equal(reads,0);
});

test('witness roster proxy index get trap cannot execute during verification',()=>{
 const x=make();
 let reads=0;
 x.requiredWitnessIds=new Proxy([...x.requiredWitnessIds],{
  get(target,property,receiver){
   if(property==='0'||property===Symbol.iterator){
    reads++;
    throw Error('untrusted witness array get trap must not execute');
   }
   return Reflect.get(target,property,receiver);
  }
 });
 const out=inspect(x);
 assert.equal(reads,0);
 assert.equal(out.verified,true,JSON.stringify(out));
 assert.equal(out.authorization,'DENY');
 assert.equal(out.releaseAllowed,false);
});

test('sparse witness roster is rejected without reading witness key pins',()=>{
 const x=make();
 delete x.requiredWitnessIds[0];
 let pinReads=0;
 x.witnessKeyPins=new Proxy(pins(),{
  ownKeys(){pinReads++;throw Error('sparse roster must fail before key pins');}
 });
 denied(x,'INVALID_WITNESS_ROSTER');
 assert.equal(pinReads,0);
});

test('symbol-bearing witness roster is rejected before key-pin inspection',()=>{
 const x=make();
 x.requiredWitnessIds[Symbol('hidden')]='witness-rogue';
 let pinReads=0;
 x.witnessKeyPins=new Proxy(pins(),{
  ownKeys(){pinReads++;throw Error('invalid roster must fail before key pins');}
 });
 denied(x,'INVALID_WITNESS_ROSTER');
 assert.equal(pinReads,0);
});
