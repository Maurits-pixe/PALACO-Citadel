/**
 * Read-only local consistency assessment for a Citadel receipt.
 * WARNING: claims and identifiers are untrusted; this does not authenticate anyone.
 */
export const REVIEW_SCHEMA = 'palaco-citadel-local-review-assessment-v1';

const checks = [
  'ledgerBound', 'checkpointBound', 'signatureCryptographicallyValid',
  'reviewerRegistrySignatureValid', 'reviewerActive', 'reviewerIndependent',
  'issuerIndependentlyTrusted', 'revocationFresh', 'policyMatched'
];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identity = value => typeof value === 'string' &&
  /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value);

export function assessLocalReceiptReview(input) {
  // JSON-like records only; getters, proxies, and unknown object types are not
  // an authenticated source and must not be trusted by downstream consumers.
  let failedChecks = [];
  try {
    const record = input !== null && typeof input === 'object' &&
      !Array.isArray(input) && Object.getPrototypeOf(input) === Object.prototype
      ? input : {};
    for (const name of checks) {
      if (!own(record, name) || record[name] !== true) failedChecks.push(name);
    }
    if (!digest(record.receiptDigest) || !digest(record.checkpointDigest) ||
        record.receiptDigest !== record.checkpointDigest) {
      failedChecks.push('digestMismatchOrMissing');
    }
    // Distinct IDs alone do not establish a real person's identity. Reject even
    // locally claimed independence if the same key is reused under another ID.
    if (!identity(record.makerId) || !identity(record.reviewerId) ||
        record.makerId === record.reviewerId) {
      failedChecks.push('makerReviewerIdentityNotDistinct');
    }
    if (!digest(record.makerKeyFingerprint) ||
        !digest(record.reviewerKeyFingerprint) ||
        record.makerKeyFingerprint === record.reviewerKeyFingerprint) {
      failedChecks.push('makerReviewerKeyNotDistinct');
    }
  } catch {
    failedChecks = ['unreadableUntrustedInput'];
  }
  const localChecksReportedPass = failedChecks.length === 0;
  return {
    schema: REVIEW_SCHEMA,
    localChecksReportedPass,
    failedChecks,
    trust: 'NOT_ESTABLISHED',
    authorization: 'DENY',
    executionAllowed: false,
    releaseAllowed: false,
    reviewRequired: true,
    explanation: localChecksReportedPass
      ? 'Self-reported controls and local separation constraints match; independently authenticated trust is absent.'
      : 'Local consistency or self-reported controls are incomplete; fail closed.'
  };
}
