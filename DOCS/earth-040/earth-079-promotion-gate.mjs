// EARTH-079: independently recorded promotion decision. This is a review gate,
// not a browser-side authorization mechanism or a production deployment trigger.
export function evaluateGISPromotion({cryptographicResult,sourceReview,releaseReview}) {
 const reasons=[];
 if(cryptographicResult?.status!=='CRYPTOGRAPHICALLY_VERIFIED') reasons.push('CRYPTOGRAPHIC_VERIFICATION_REQUIRED');
 if(sourceReview?.decision!=='ACCEPT'||sourceReview?.independent!==true||!sourceReview?.recordId) reasons.push('INDEPENDENT_SOURCE_REVIEW_REQUIRED');
 if(releaseReview?.decision!=='APPROVE'||releaseReview?.authorized!==true||!releaseReview?.recordId) reasons.push('AUTHORIZED_RELEASE_REVIEW_REQUIRED');
 if(sourceReview?.reviewerId && releaseReview?.reviewerId && sourceReview.reviewerId===releaseReview.reviewerId) reasons.push('SEPARATION_OF_DUTIES_REQUIRED');
 // No runtime permission is issued by this evaluator.
 return Object.freeze({status:reasons.length?'HOLD':'ELIGIBLE_FOR_MANUAL_PROMOTION',reasons});
}
