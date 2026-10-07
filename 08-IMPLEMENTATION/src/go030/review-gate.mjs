// GO-030: pure fail-closed review decision; not a GitHub branch protection substitute.
export const OUTCOMES = Object.freeze(["APPROVED","FINDINGS","INCONCLUSIVE"]);
export function evaluateReviewGate({envelope,current,review,authorization}) {
  const deny=(reason)=>Object.freeze({allowed:false,reason});
  if (!envelope || !current || !review || !authorization) return deny("MISSING_EVIDENCE");
  if (!envelope.head || !envelope.base || !envelope.baseBranch) return deny("INCOMPLETE_ENVELOPE");
  if (envelope.head!==current.head || envelope.base!==current.base || envelope.baseBranch!==current.baseBranch) return deny("IDENTITY_DRIFT");
  if (!envelope.workflowDigest || envelope.workflowDigest!==current.workflowDigest) return deny("WORKFLOW_DRIFT");
  if (!envelope.evidenceDigest || envelope.evidenceDigest!==current.evidenceDigest) return deny("EVIDENCE_DRIFT");
  if (!Array.isArray(current.requiredChecks) || current.requiredChecks.length===0 || current.requiredChecks.some(c=>c!=="PASS")) return deny("CHECKS_NOT_PASS");
  if (!OUTCOMES.includes(review.outcome) || review.outcome!=="APPROVED") return deny("REVIEW_NOT_APPROVED");
  if (!review.reviewerId || !review.reviewId || review.head!==envelope.head || review.base!==envelope.base) return deny("REVIEW_NOT_BOUND");
  if (!Number.isSafeInteger(review.unresolvedFindings) || review.unresolvedFindings!==0) return deny("UNRESOLVED_FINDINGS");
  if (authorization.authorized!==true || !authorization.actorId || authorization.head!==envelope.head || authorization.base!==envelope.base) return deny("MERGE_NOT_AUTHORIZED");
  return Object.freeze({allowed:true,reason:"ELIGIBLE_FOR_SEPARATE_MERGE_EXECUTION"});
}
