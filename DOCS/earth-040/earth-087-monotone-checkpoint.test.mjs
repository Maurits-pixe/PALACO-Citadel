import test from 'node:test';
import assert from 'node:assert/strict';
import {createGISReviewReceipt} from './earth-084-review-receipt.mjs';
import {appendReviewRecord} from './earth-085-review-chain.mjs';
import {verifyMonotoneCheckpoint} from './earth-087-monotone-checkpoint.mjs';
test('trusted floor rejects rollback and forks',async()=>{
 const receipt=await createGISReviewReceipt({});
 const a=appendReviewRecord([],receipt),b=appendReviewRecord([a],receipt);
 const floor={length:2,headHash:b.recordHash};
 assert.equal(verifyMonotoneCheckpoint([a,b],floor,floor).status,'MONOTONE_CHECKPOINT_MATCH');
 assert.equal(verifyMonotoneCheckpoint([a],{length:1,headHash:a.recordHash},floor).reason,'CHECKPOINT_ROLLBACK');
 assert.equal(verifyMonotoneCheckpoint([a,b],floor,{length:1,headHash:'b'.repeat(64)}).reason,'CHECKPOINT_FORK');
 assert.equal(verifyMonotoneCheckpoint([a,b],floor,null).reason,'TRUSTED_FLOOR_MISSING');
});
