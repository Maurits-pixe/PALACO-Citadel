// EARTH-086: verify a ledger against an externally pinned checkpoint.
// Checkpoint authenticity and durable storage are external responsibilities.
import {verifyReviewChain} from './earth-085-review-chain.mjs';
const HEX=/^[a-f0-9]{64}$/;
export function verifyPinnedReviewCheckpoint(chain,checkpoint) {
 const result=verifyReviewChain(chain);
 if(!result.valid) return Object.freeze({status:'HOLD',reason:'CHAIN_INVALID'});
 if(!checkpoint||!Number.isSafeInteger(checkpoint.length)||checkpoint.length<1||!HEX.test(checkpoint.headHash??'')) return Object.freeze({status:'HOLD',reason:'CHECKPOINT_MISSING'});
 if(chain.length!==checkpoint.length) return Object.freeze({status:'HOLD',reason:'CHAIN_LENGTH_MISMATCH'});
 if(result.headHash!==checkpoint.headHash) return Object.freeze({status:'HOLD',reason:'CHAIN_HEAD_MISMATCH'});
 return Object.freeze({status:'CHECKPOINT_MATCH',reason:null});
}
