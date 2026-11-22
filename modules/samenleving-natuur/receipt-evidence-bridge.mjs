import { verifyReceiptSignature } from './receipt-crypto-verifier.mjs';
import { assessLocalReceiptReview } from './receipt-review-gate.mjs';

/**
 * A read-only bridge from *actual* cryptographic verification to the existing
 * self-reported review gate. Both verifiers remain non-authorizing.
 * Caller-supplied "signatureCryptographicallyValid" is ignored.
 */
export const BRIDGE_SCHEMA = 'palaco-citadel-receipt-evidence-bridge-v1';

export function assessSignedReceipt({ payloadBytes, envelope, publicJwk, claims } = {}) {
  const cryptoResult = verifyReceiptSignature(payloadBytes, envelope, publicJwk);
  let assessment;
  try {
    const acceptable = claims !== null && typeof claims === 'object' &&
      !Array.isArray(claims) && Object.getPrototypeOf(claims) === Object.prototype;
    if (!acceptable) throw new TypeError('Invalid claims');
    // Rebuild an inert plain data object: avoid forwarding arbitrary getters
    // and prevent an untrusted claim from overriding computed evidence.
    const data = Object.create(null);
    for (const key of [
      'ledgerBound', 'checkpointBound', 'reviewerRegistrySignatureValid',
      'reviewerActive', 'reviewerIndependent', 'issuerIndependentlyTrusted',
      'revocationFresh', 'policyMatched', 'makerId', 'reviewerId',
      'makerKeyFingerprint', 'checkpointDigest'
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(claims, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Missing data');
      data[key] = descriptor.value;
    }
    // A valid detached signature proves bytes were signed by this key,
    // but does not establish reviewer identity, role or signing authority.
    const receiptDigest = cryptoResult.cryptographicallyValid
      ? cryptoResult.payloadSha256 : null;
    const reviewerFingerprintMatches = cryptoResult.cryptographicallyValid &&
      data.reviewerKeyFingerprint === cryptoResult.keyFingerprintSha256;
    assessment = assessLocalReceiptReview({
      ...data,
      receiptDigest,
      signatureCryptographicallyValid: cryptoResult.cryptographicallyValid &&
        reviewerFingerprintMatches
    });
  } catch {
    assessment = assessLocalReceiptReview(null);
  }
  const failedChecks = [...assessment.failedChecks];
  if (!cryptoResult.cryptographicallyValid) failedChecks.push('actualSignatureVerificationFailed');
  if (cryptoResult.cryptographicallyValid &&
      (!claims || typeof claims !== 'object' ||
       Object.getOwnPropertyDescriptor(claims, 'reviewerKeyFingerprint')?.value !==
         cryptoResult.keyFingerprintSha256)) {
    failedChecks.push('reviewerSigningKeyMismatch');
  }
  return {
    schema: BRIDGE_SCHEMA,
    cryptographicallyValid: cryptoResult.cryptographicallyValid,
    payloadSha256: cryptoResult.cryptographicallyValid ? cryptoResult.payloadSha256 : null,
    reviewerSigningKeyMatchesClaim: cryptoResult.cryptographicallyValid &&
      !failedChecks.includes('reviewerSigningKeyMismatch'),
    localChecksReportedPass: cryptoResult.cryptographicallyValid &&
      assessment.localChecksReportedPass && failedChecks.length === 0,
    failedChecks: [...new Set(failedChecks)],
    trust: 'NOT_ESTABLISHED',
    authorization: 'DENY',
    executionAllowed: false,
    releaseAllowed: false,
    reviewRequired: true
  };
}
