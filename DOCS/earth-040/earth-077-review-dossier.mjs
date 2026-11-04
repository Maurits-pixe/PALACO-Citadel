// EARTH-077: review dossier validation; metadata checks are NOT signature verification.
// This function must not authorize browser rendering or issue sourceApproved.
const SHA=/^[a-f0-9]{64}$/;
export function assessGISReviewDossier(dossier) {
  const reasons=[];
  if(!dossier || typeof dossier!=='object' || Array.isArray(dossier)) return {status:'HOLD',reasons:['DOSSIER_MISSING']};
  const source=dossier.source;
  const conversion=dossier.conversion;
  const review=dossier.review;
  if(!source || typeof source!=='object' || !SHA.test(source.sha256??'')) reasons.push('SOURCE_HASH_MISSING');
  if(!conversion || typeof conversion!=='object' || !SHA.test(conversion.sourceSHA256??'') || !SHA.test(conversion.outputSHA256??'')) reasons.push('CONVERSION_HASH_MISSING');
  if(source?.sha256 && conversion?.sourceSHA256 && source.sha256!==conversion.sourceSHA256) reasons.push('SOURCE_HASH_MISMATCH');
  if(conversion?.rendererCompatible!==true) reasons.push('TOPOLOGY_NOT_CONFIRMED');
  if(!review || review.decision!=='ACCEPT' || typeof review.reviewerId!=='string' || !review.reviewerId.trim() || typeof review.evidenceRef!=='string' || !review.evidenceRef.trim()) reasons.push('REVIEW_NOT_DOCUMENTED');
  // Even a complete metadata dossier is insufficient for independent trust.
  return {status:'HOLD',reasons:reasons.length?reasons:['INDEPENDENT_SIGNATURE_VERIFICATION_REQUIRED']};
}
