// EARTH-083: one fail-closed verification pipeline for offline/CI review.
// Never return runtime sourceApproved or APPROVED_FOR_RENDER from this pipeline.
import {verifyGISDecision} from './earth-078-verify-decision.mjs';
import {evaluateKeyBoundPromotion} from './earth-082-reviewer-key-binding.mjs';
export async function evaluateGISAdmissionCandidate(input) {
 try {
  const crypto=await verifyGISDecision(input);
  if(crypto.status!=='CRYPTOGRAPHICALLY_VERIFIED') return Object.freeze({status:'HOLD',stage:'CRYPTOGRAPHY',reasons:crypto.reasons});
  const governance=evaluateKeyBoundPromotion({...input,cryptographicResult:crypto});
  if(governance.status!=='ELIGIBLE_FOR_MANUAL_PROMOTION') return Object.freeze({status:'HOLD',stage:'GOVERNANCE',reasons:governance.reasons});
  return Object.freeze({status:'AWAITING_EXPLICIT_MANUAL_ADMISSION',stage:'MANUAL_DECISION',reasons:[]});
 } catch {
  return Object.freeze({status:'HOLD',stage:'INTERNAL_ERROR',reasons:['VERIFICATION_FAILED_CLOSED']});
 }
}
