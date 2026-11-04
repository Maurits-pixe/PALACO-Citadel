// EARTH-087: enforce monotone checkpoint progression against trusted external floor.
// This module does not persist the floor and cannot establish external trust.
import {verifyPinnedReviewCheckpoint} from './earth-086-checkpoint.mjs';
const HEX=/^[a-f0-9]{64}$/;
export function verifyMonotoneCheckpoint(chain,checkpoint,trustedFloor) {
 const base=verifyPinnedReviewCheckpoint(chain,checkpoint);
 if(base.status!=='CHECKPOINT_MATCH') return Object.freeze({status:'HOLD',reason:base.reason});
 if(!trustedFloor||!Number.isSafeInteger(trustedFloor.length)||trustedFloor.length<1||!HEX.test(trustedFloor.headHash??'')) return Object.freeze({status:'HOLD',reason:'TRUSTED_FLOOR_MISSING'});
 if(checkpoint.length<trustedFloor.length) return Object.freeze({status:'HOLD',reason:'CHECKPOINT_ROLLBACK'});
 if(chain[trustedFloor.length-1]?.recordHash!==trustedFloor.headHash) return Object.freeze({status:'HOLD',reason:'CHECKPOINT_FORK'});
 return Object.freeze({status:'MONOTONE_CHECKPOINT_MATCH',reason:null});
}
