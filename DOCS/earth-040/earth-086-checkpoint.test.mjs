import test from 'node:test';
import assert from 'node:assert/strict';
import {createGISReviewReceipt} from './earth-084-review-receipt.mjs';
import {appendReviewRecord} from './earth-085-review-chain.mjs';
import {verifyPinnedReviewCheckpoint} from './earth-086-checkpoint.mjs';
test('pinned checkpoint detects truncation and replacement',async()=>{
 const receipt=await createGISReviewReceipt({});
 const a=appendReviewRecord([],receipt),b=appendReviewRecord([a],receipt);
 const checkpoint={length:2,headHash:b.recordHash};
 assert.equal(verifyPinnedReviewCheckpoint([a,b],checkpoint).status,'CHECKPOINT_MATCH');
 assert.equal(verifyPinnedReviewCheckpoint([a],checkpoint).reason,'CHAIN_LENGTH_MISMATCH');
 assert.equal(verifyPinnedReviewCheckpoint([a,b],{length:2,headHash:'a'.repeat(64)}).reason,'CHAIN_HEAD_MISMATCH');
 assert.equal(verifyPinnedReviewCheckpoint([a,b],null).reason,'CHECKPOINT_MISSING');
});
