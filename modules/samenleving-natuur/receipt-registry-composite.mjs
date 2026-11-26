import { assessSignedReceipt } from './receipt-evidence-bridge.mjs';
import { checkSignedReviewerRegistry } from './reviewer-registry-check.mjs';
import { verifyReceiptSignature } from './receipt-crypto-verifier.mjs';

/**
 * Read-only composition of two local cryptographic checks.
 * "Consistent" is NOT authenticated identity, independent trust, authorization,
 * revocation freshness, or a deployable decision.
 */
export const COMPOSITE_SCHEMA = 'palaco-citadel-receipt-registry-composite-v1';
const denied = (reason, receipt = null, registry = null) => ({
  schema: COMPOSITE_SCHEMA, cryptographicBindingsConsistent: false,
  receiptSignatureVerified: receipt?.cryptographicallyValid === true,
  registrySignatureVerified: registry?.localRegistryCheckPassed === true,
  failedChecks: [reason],
  trust: 'NOT_ESTABLISHED', authorization: 'DENY',
  executionAllowed: false, releaseAllowed: false, reviewRequired: true
});
const fields = [
  'ledgerBound', 'checkpointBound', 'reviewerIndependent',
  'policyMatched', 'makerId', 'reviewerId', 'makerKeyFingerprint',
  'reviewerKeyFingerprint', 'checkpointDigest'
];
function extractPlainClaims(claims) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
      Object.getPrototypeOf(claims) !== Object.prototype) return null;
  const out = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(claims, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    out[field] = descriptor.value;
  }
  return out;
}

/**
 * Registry inputs require an independently maintained issuer pin, revision
 * floor and trusted time to have any significance beyond local consistency.
 */
export function assessReceiptWithRegistry(input = {}) {
  try {
    const { payloadBytes, envelope, reviewerPublicJwk, claims, registryBytes,
      registrySignatureBase64Url, issuerPublicJwk, expectedIssuerFingerprint,
      minimumRevision, evaluationTime } = input;
    const receipt = verifyReceiptSignature(payloadBytes, envelope, reviewerPublicJwk);
    if (!receipt.cryptographicallyValid) return denied('RECEIPT_SIGNATURE_INVALID', receipt);
    const plain = extractPlainClaims(claims);
    if (!plain) return denied('CLAIMS_NOT_PLAIN_DATA', receipt);
    const registry = checkSignedReviewerRegistry({
      registryBytes, signatureBase64Url: registrySignatureBase64Url,
      issuerPublicJwk, expectedIssuerFingerprint, minimumRevision,
      evaluationTime, reviewerFingerprint: receipt.keyFingerprintSha256
    });
    if (!registry.localRegistryCheckPassed)
      return denied('REGISTRY_' + registry.reason, receipt, registry);
    if (plain.reviewerKeyFingerprint !== receipt.keyFingerprintSha256)
      return denied('REVIEWER_KEY_BINDING_MISMATCH', receipt, registry);
    const bridge = assessSignedReceipt({
      payloadBytes, envelope, publicJwk: reviewerPublicJwk,
      claims: {
        ...plain,
        // Derived locally; never accept caller assertions for these controls.
        reviewerRegistrySignatureValid: true,
        reviewerActive: true,
        signatureCryptographicallyValid: true,
        // Local registry cannot establish these independently.
        issuerIndependentlyTrusted: false,
        revocationFresh: false
      }
    });
    const blockedOnlyByUnestablishedTrust = bridge.failedChecks.length === 2 &&
      bridge.failedChecks.includes('issuerIndependentlyTrusted') &&
      bridge.failedChecks.includes('revocationFresh');
    if (!blockedOnlyByUnestablishedTrust || !bridge.cryptographicallyValid ||
        !bridge.reviewerSigningKeyMatchesClaim)
      return denied('RECEIPT_REVIEW_CONSISTENCY_FAILED', receipt, registry);

    return {
      schema: COMPOSITE_SCHEMA,
      cryptographicBindingsConsistent: true,
      receiptSignatureVerified: true,
      registrySignatureVerified: true,
      receiptDigest: receipt.payloadSha256,
      reviewerFingerprint: receipt.keyFingerprintSha256,
      registryRevision: registry.registryRevision,
      failedChecks: [],
      unresolvedGates: ['INDEPENDENT_ISSUER_TRUST', 'REVOCATION_FRESHNESS',
        'REVIEWER_IDENTITY', 'AUTHORIZATION_POLICY'],
      trust: 'NOT_ESTABLISHED', authorization: 'DENY',
      executionAllowed: false, releaseAllowed: false, reviewRequired: true
    };
  } catch {
    return denied('MALFORMED_COMPOSITE_INPUT');
  }
}
