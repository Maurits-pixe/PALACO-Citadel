import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGISReviewReceipt} from './earth-084-review-receipt.mjs';
test('missing evidence generates stable HOLD receipt without granting admission',async()=>{
 const a=await createGISReviewReceipt({});
 const b=await createGISReviewReceipt({});
 assert.deepEqual(a,b);
 assert.equal(a.status,'HOLD');
 assert.equal(a.stage,'CRYPTOGRAPHY');
 assert.match(a.receiptSHA256,/^[a-f0-9]{64}$/);
 const {receiptSHA256,...payload}=a;
 assert.equal(receiptSHA256,createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
 assert.equal(Object.hasOwn(a,'sourceApproved'),false);
});
test('receipt does not include raw signatures or private keys',async()=>{
 const r=await createGISReviewReceipt({signature:'secret-signature',privateKey:'secret-private-key'});
 assert.equal(JSON.stringify(r).includes('secret-'),false);
});
