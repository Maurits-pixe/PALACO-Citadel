// EARTH-082: bind the trusted signature key to the registered reviewer identity.
// This is an additional precondition, not a replacement for EARTH-078 signature verification.
import {createHash,createPublicKey} from 'node:crypto';
import {evaluateCurrentPromotion} from './earth-081-revocation.mjs';
export function reviewerKeyFingerprint(pem) {
 const key=createPublicKey(pem);
 if(key.asymmetricKeyType!=='ed25519') throw Error('UNSUPPORTED_REVIEWER_KEY');
 return createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
export function evaluateKeyBoundPromotion(input) {
 const reasons=[];
 const registry=input?.registry,anchors=input?.trustAnchors;
 const reviewerId=input?.sourceReview?.reviewerId;
 const entry=registry instanceof Map?registry.get(reviewerId):undefined;
 const pem=anchors instanceof Map?anchors.get(reviewerId):undefined;
 try {
  if(typeof pem!=='string'||!entry||typeof entry.keyFingerprint!=='string'||entry.keyFingerprint!==reviewerKeyFingerprint(pem)) reasons.push('SOURCE_REVIEWER_KEY_BINDING_INVALID');
 }catch{reasons.push('SOURCE_REVIEWER_KEY_BINDING_INVALID')}
 const basic=evaluateCurrentPromotion(input);
 reasons.push(...basic.reasons);
 return Object.freeze({status:reasons.length?'HOLD':'ELIGIBLE_FOR_MANUAL_PROMOTION',reasons:[...new Set(reasons)]});
}
