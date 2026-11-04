// EARTH-081: revocation and monotone authority epochs.
// Caller must provide a current trusted registry snapshot and independent epoch floor.
import {evaluateRegisteredPromotion} from './earth-080-reviewer-registry.mjs';
export function evaluateCurrentPromotion(input) {
 const reasons=[];
 const epoch=input?.trustedEpoch;
 const floor=input?.minimumAcceptedEpoch;
 if(!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(floor)||floor<0||epoch<floor) reasons.push('STALE_OR_UNTRUSTED_REGISTRY_EPOCH');
 const registry=input?.registry;
 for(const id of [input?.sourceReview?.reviewerId,input?.releaseReview?.reviewerId]) {
  const entry=registry instanceof Map?registry.get(id):undefined;
  if(entry?.revoked===true) reasons.push('REVIEWER_REVOKED');
  if(!entry || !Number.isSafeInteger(entry.validFromEpoch) || entry.validFromEpoch>epoch) reasons.push('REVIEWER_EPOCH_INVALID');
 }
 const basic=evaluateRegisteredPromotion(input);
 reasons.push(...basic.reasons);
 return Object.freeze({status:reasons.length?'HOLD':'ELIGIBLE_FOR_MANUAL_PROMOTION',reasons:[...new Set(reasons)]});
}
