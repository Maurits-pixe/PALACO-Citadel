import test from 'node:test';
import assert from 'node:assert/strict';
import {createGISReviewReceipt} from './earth-084-review-receipt.mjs';
import {appendReviewRecord} from './earth-085-review-chain.mjs';
import {commitCheckpointCAS} from './earth-088-checkpoint-cas.mjs';
test('CAS rejects competing writers and stale checkpoint versions',async()=>{
 const receipt=await createGISReviewReceipt({});
 const a=appendReviewRecord([],receipt),b=appendReviewRecord([a],receipt);
 let state={version:0,checkpoint:{length:1,headHash:a.recordHash}};
 const store={read:async()=>state,compareAndSwap:async(v,next)=>{if(state.version!==v)return false;state=next;return true}};
 const args={store,chain:[a,b],checkpoint:{length:2,headHash:b.recordHash},expectedVersion:0};
 assert.equal((await commitCheckpointCAS(args)).status,'COMMITTED');
 assert.equal((await commitCheckpointCAS(args)).reason,'CONCURRENT_UPDATE');
 assert.equal(state.version,1);
 assert.equal((await commitCheckpointCAS({...args,expectedVersion:1,chain:[a],checkpoint:{length:1,headHash:a.recordHash}})).reason,'CHECKPOINT_ROLLBACK');
});
test('missing atomic store fails closed',async()=>assert.equal((await commitCheckpointCAS({})).reason,'ATOMIC_STORE_REQUIRED'));
