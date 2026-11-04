// EARTH-084: deterministic, non-authorizing audit receipt for offline verification.
// Never store private keys or raw signatures in the receipt.
import {createHash} from 'node:crypto';
import {evaluateGISAdmissionCandidate} from './earth-083-admission-pipeline.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function createGISReviewReceipt(input) {
 const result=await evaluateGISAdmissionCandidate(input);
 const dossier=input?.dossier;
 const receipt={
  protocol:'EARTH-084-v1',
  sourceSHA256:typeof dossier?.source?.sha256==='string'?dossier.source.sha256:null,
  outputSHA256:typeof dossier?.conversion?.outputSHA256==='string'?dossier.conversion.outputSHA256:null,
  reviewerId:typeof dossier?.review?.reviewerId==='string'?dossier.review.reviewerId:null,
  trustedEpoch:Number.isSafeInteger(input?.trustedEpoch)?input.trustedEpoch:null,
  minimumAcceptedEpoch:Number.isSafeInteger(input?.minimumAcceptedEpoch)?input.minimumAcceptedEpoch:null,
  status:result.status,
  stage:result.stage,
  reasons:[...result.reasons]
 };
 const canonical=JSON.stringify(receipt);
 return Object.freeze({...receipt,receiptSHA256:sha(canonical)});
}
