// EARTH-085: deterministic hash-linked review ledger, no persistence or trust anchor.
// For production, anchor the head externally and store append-only with access controls.
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const HEX=/^[a-f0-9]{64}$/;
export function appendReviewRecord(chain,receipt) {
 if(!Array.isArray(chain)||!verifyReviewChain(chain).valid) throw Error('INVALID_PRIOR_CHAIN');
 if(!receipt || !HEX.test(receipt.receiptSHA256??'')) throw Error('INVALID_RECEIPT');
 const {receiptSHA256,...payload}=receipt;
 if(hash(payload)!==receiptSHA256) throw Error('RECEIPT_HASH_MISMATCH');
 const record={index:chain.length,previousHash:chain.length?chain[chain.length-1].recordHash:null,receiptSHA256,status:receipt.status,stage:receipt.stage};
 return Object.freeze({...record,recordHash:hash(record)});
}
export function verifyReviewChain(chain) {
 if(!Array.isArray(chain)) return {valid:false,reason:'NOT_AN_ARRAY'};
 let previousHash=null;
 for(let i=0;i<chain.length;i++){
  const record=chain[i];
  if(!record||record.index!==i||record.previousHash!==previousHash||!HEX.test(record.receiptSHA256??'')) return {valid:false,reason:'BROKEN_LINK',index:i};
  const {recordHash,...payload}=record;
  if(recordHash!==hash(payload)) return {valid:false,reason:'RECORD_TAMPERED',index:i};
  previousHash=recordHash;
 }
 return {valid:true,headHash:previousHash};
}
