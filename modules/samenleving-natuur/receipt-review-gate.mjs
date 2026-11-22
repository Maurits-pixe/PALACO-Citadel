/**
 * Local, read-only security assessment for a Citadel receipt.
 * This is NOT a production trust verifier, approval, or authorization service.
 * Inputs are untrusted, including flags claiming cryptographic verification.
 */
export const REVIEW_SCHEMA = 'palaco-citadel-local-review-assessment-v1';

const checks = [
  'ledgerBound', 'checkpointBound', 'signatureCryptographicallyValid',
  'reviewerRegistrySignatureValid', 'reviewerActive', 'reviewerIndependent',
  'issuerIndependentlyTrusted', 'revocationFresh', 'policyMatched'
];

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function assessLocalReceiptReview(input) {
  const record = input !== null && typeof input === 'object' &&
    !Array.isArray(input) ? input : {};
  const observed = {};
  for (const name of checks) observed[name] = own(record, name) && record[name] === true;
  const failedChecks = checks.filter(name => !observed[name]);
  const consistency = typeof record.receiptDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(record.receiptDigest) &&
    typeof record.checkpointDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(record.checkpointDigest) &&
    record.receiptDigest === record.checkpointDigest;
  if (!consistency) failedChecks.push('digestMismatchOrMissing');
  const localChecksReportedPass = failedChecks.length === 0;

  // Claims and manually imported registry files are untrusted. No trust anchor,
  // authenticated identity, signed policy decision or execution authority exists here.
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
      ? 'All claimed local checks align; independent trust and authorization remain unverified.'
      : 'Local consistency or claimed controls are incomplete; fail closed.'
  };
}
