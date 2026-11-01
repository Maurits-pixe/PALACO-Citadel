import test from 'node:test';
import assert from 'node:assert/strict';
import {createGISReviewReceipt} from './earth-084-review-receipt.mjs';
import {appendReviewRecord,verifyReviewChain} from './earth-085-review-chain.mjs';
test('links review receipts deterministically',async()=>{
 const receipt=await createGISReviewReceipt({});
 const a=appendReviewRecord([],receipt),b=appendReviewRecord([a],receipt);
 assert.equal(verifyReviewChain([a,b]).valid,true);
 assert.equal(b.previousHash,a.recordHash);
 assert.equal(appendReviewRecord([],receipt).recordHash,a.recordHash);
});
test('detects modified records and removed intermediate records',async()=>{
 const receipt=await createGISReviewReceipt({});
 const a=appendReviewRecord([],receipt),b=appendReviewRecord([a],receipt);
 assert.equal(verifyReviewChain([{...a,status:'READY'},b]).valid,false);
 assert.equal(verifyReviewChain([b]).valid,false);
});
test('rejects altered receipt',async()=>{
 const receipt=await createGISReviewReceipt({});
 assert.throws(()=>appendReviewRecord([],{...receipt,status:'APPROVED'}),/RECEIPT_HASH_MISMATCH/);
});
