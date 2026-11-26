import test from 'node:test';
import assert from 'node:assert/strict';
import {FENCING_ANCHOR_SCHEMA as SCHEMA,computeFencingAnchorHash as hash,
 inspectFencingEpochAnchorChain as inspect} from './registry-pin-fencing-epoch-anchor-chain.mjs';
const prev={schema:SCHEMA,registryKey:'citadel-draft',epoch:7,leaderId:'leader-old',
 tokenSha256:'a'.repeat(64),checkpointHeadSha256:'b'.repeat(64),anchorSha256:'c'.repeat(64)};
const s1={registryKey:'citadel-draft',previousEpoch:7,epoch:8,
 leaderId:'leader-new',tokenSha256:'d'.repeat(64),checkpointHeadSha256:'e'.repeat(64)};
const s2={registryKey:'citadel-draft',previousEpoch:8,epoch:9,
 leaderId:'leader-later',tokenSha256:'f'.repeat(64),checkpointHeadSha256:'1'.repeat(64)};
const final=(steps=[s1,s2])=>{
 let p={...prev};
 for(const s of steps)p={schema:SCHEMA,registryKey:s.registryKey,epoch:s.epoch,leaderId:s.leaderId,
 tokenSha256:s.tokenSha256,checkpointHeadSha256:s.checkpointHeadSha256,
 anchorSha256:hash(p.anchorSha256,s)};
 return p;
};
const base=()=>({previousAnchor:{...prev},transitions:[{...s1},{...s2}],
 expectedFinalAnchor:final(),minimumEpoch:7});
function denied(x,reason){
 const out=inspect(x);assert.equal(out.chainValid,false,JSON.stringify(out));
 assert.equal(out.reason,reason);assert.equal(out.authorization,'DENY');
 assert.equal(out.stateChanged,false);
}
test('two consecutive hash linked epochs are evidence only',()=>{
 const out=inspect(base());assert.equal(out.chainValid,true,JSON.stringify(out));
 assert.equal(out.finalEpoch,9);assert.equal(out.authorization,'DENY');
 assert.equal(out.trust,'NOT_ESTABLISHED');assert.equal(out.stateChanged,false);
});
test('missing transition cannot skip an epoch',()=>{
 const x=base();x.transitions=[{...s2}];denied(x,'NON_CONSECUTIVE_EPOCH');
});
test('duplicate fencing epoch cannot repeat',()=>{
 const x=base();x.transitions[1]={...s2,previousEpoch:7,epoch:8};
 denied(x,'NON_CONSECUTIVE_EPOCH');
});
test('old anchor below externally pinned floor denied',()=>{
 const x=base();x.minimumEpoch=8;denied(x,'EXTERNAL_EPOCH_FLOOR');
});
test('tampered candidate leader diverges from pinned hash',()=>{
 const x=base();x.transitions[1].leaderId='leader-rogue';
 denied(x,'PINNED_FINAL_ANCHOR_MISMATCH');
});
test('token substitution diverges from pinned hash',()=>{
 const x=base();x.transitions[1].tokenSha256='2'.repeat(64);
 denied(x,'PINNED_FINAL_ANCHOR_MISMATCH');
});
test('checkpoint head substitution diverges from pinned hash',()=>{
 const x=base();x.transitions[0].checkpointHeadSha256='3'.repeat(64);
 denied(x,'PINNED_FINAL_ANCHOR_MISMATCH');
});
test('wrong expected final epoch or hash denied',()=>{
 const x=base();x.expectedFinalAnchor.epoch=10;
 denied(x,'PINNED_FINAL_ANCHOR_MISMATCH');
 const y=base();y.expectedFinalAnchor.anchorSha256='4'.repeat(64);
 denied(y,'PINNED_FINAL_ANCHOR_MISMATCH');
});
test('registry substitution denied',()=>{
 const x=base();x.transitions[0].registryKey='other-draft';
 denied(x,'REGISTRY_MISMATCH');
});
test('untrusted accessor and symbol rejected without invocation',()=>{
 denied({},'INVALID_INPUT');
 const x=base();let calls=0;
 Object.defineProperty(x.transitions[0],'leaderId',{get(){calls++;throw Error('getter');}});
 denied(x,'NON_CONSECUTIVE_EPOCH');assert.equal(calls,0);
 denied({...base(),[Symbol('extra')]:true},'INVALID_INPUT');
});
test('malformed hash, overflow and overlong chains fail closed',()=>{
 assert.equal(hash('bad',s1),null);
 const x=base();x.transitions=[...x.transitions,...Array.from({length:7},()=>({...s2}))];
 denied(x,'INVALID_INPUT');
 const y=base();y.previousAnchor.anchorSha256='bad';
 denied(y,'INVALID_ANCHOR');
});
