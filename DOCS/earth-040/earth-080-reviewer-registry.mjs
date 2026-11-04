// EARTH-080: review identities are resolved against caller-supplied trusted registry.
// Never populate the registry from the untrusted review dossier.
import {evaluateGISPromotion} from './earth-079-promotion-gate.mjs';
export function evaluateRegisteredPromotion({cryptographicResult,sourceReview,releaseReview,registry}) {
 const reasons=[];
 if(!(registry instanceof Map)) reasons.push('TRUSTED_REGISTRY_REQUIRED');
 const source=registry instanceof Map?registry.get(sourceReview?.reviewerId):undefined;
 const release=registry instanceof Map?registry.get(releaseReview?.reviewerId):undefined;
 if(source?.active!==true||!Array.isArray(source.roles)||!source.roles.includes('GIS_SOURCE_REVIEWER')) reasons.push('SOURCE_REVIEWER_NOT_AUTHORIZED');
 if(release?.active!==true||!Array.isArray(release.roles)||!release.roles.includes('GIS_RELEASE_APPROVER')) reasons.push('RELEASE_REVIEWER_NOT_AUTHORIZED');
 if(sourceReview?.reviewerId===releaseReview?.reviewerId) reasons.push('SEPARATION_OF_DUTIES_REQUIRED');
 const basic=evaluateGISPromotion({cryptographicResult,sourceReview,releaseReview});
 reasons.push(...basic.reasons);
 return Object.freeze({status:reasons.length?'HOLD':'ELIGIBLE_FOR_MANUAL_PROMOTION',reasons:[...new Set(reasons)]});
}
