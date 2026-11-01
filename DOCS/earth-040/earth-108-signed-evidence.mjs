// EARTH-108: read-only, fail-closed receipt and chain evidence verification.
// Caller supplies independently authenticated keys, revocation state and floor.
import {createPublicKey, verify, createHash} from 'node:crypto';
import {verifyReviewChain} from './earth-085-review-chain.mjs';
import {verifyMonotoneCheckpoint} from './earth-087-monotone-checkpoint.mjs';
const HEX=/^[0-9a-f]{64}$/;
const B64=/^[A-Za-z0-9+/]{86}==$/;
const fail=reason=>Object.freeze({status:'HOLD',reason});
export function verifySignedAuditEvidence({chain,receipts,signatures,trustAnchors,revokedReviewers,checkpoint,trustedFloor,trustedEpoch,minimumAcceptedEpoch}={}) {
 if(!Array.isArray(chain)||!Array.isArray(receipts)||!Array.isArray(signatures)||chain.length===0||chain.length!==receipts.length||chain.length!==signatures.length) return fail('EVIDENCE_MISSING');
 if(!Number.isSafeInteger(trustedEpoch)||trustedEpoch<0||!Number.isSafeInteger(minimumAcceptedEpoch)||minimumAcceptedEpoch<0||trustedEpoch<minimumAcceptedEpoch) return fail('EPOCH_UNTRUSTED');
 if(!(trustAnchors instanceof Map)||!(revokedReviewers instanceof Set)) return fail('TRUST_CONTEXT_MISSING');
 if(!verifyReviewChain(chain).valid) return fail('CHAIN_INVALID');
 if(verifyMonotoneCheckpoint(chain,checkpoint,trustedFloor).status!=='MONOTONE_CHECKPOINT_MATCH') return fail('CHECKPOINT_UNTRUSTED');
 for(let i=0;i<chain.length;i++){
  const receipt=receipts[i],sig=signatures[i],record=chain[i];
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||!HEX.test(receipt.receiptSHA256??'')||receipt.receiptSHA256!==record.receiptSHA256||receipt.status!==record.status||receipt.stage!==record.stage) return fail('RECEIPT_MISMATCH');
  const reviewer=receipt.reviewerId;
  if(typeof reviewer!=='string'||!reviewer||revokedReviewers.has(reviewer)) return fail('REVIEWER_UNTRUSTED');
  const pem=trustAnchors.get(reviewer);
  if(typeof pem!=='string'||!B64.test(sig??'')) return fail('SIGNATURE_MISSING');
  const {receiptSHA256,...payload}=receipt;
  if(createHash('sha256').update(JSON.stringify(payload)).digest('hex')!==receiptSHA256) return fail('RECEIPT_TAMPERED');
  try{
   const key=createPublicKey(pem);
   if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(receiptSHA256,'hex'),key,Buffer.from(sig,'base64'))) return fail('SIGNATURE_INVALID');
  }catch{return fail('SIGNATURE_INVALID');}
 }
 return Object.freeze({status:'CRYPTOGRAPHIC_EVIDENCE_MATCH',reason:null});
}
