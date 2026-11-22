import { createHash } from 'node:crypto';
import { checkSignedReviewerRegistry } from './reviewer-registry-check.mjs';
import { PIN_SCHEMA } from './registry-snapshot-pin.mjs';

export const TRANSITION_SCHEMA = 'palaco-citadel-registry-pin-transition-v1';
const hex64 = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const own = (v, keys) => v !== null && typeof v === 'object' &&
  !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const pinValid = p => own(p,['schema','issuerFingerprint','revision','registrySha256']) &&
  p.schema === PIN_SCHEMA && hex64(p.issuerFingerprint) && hex64(p.registrySha256) &&
  Number.isSafeInteger(p.revision) && p.revision > 0;
const deny = reason => ({
  schema:TRANSITION_SCHEMA, candidateVerified:false, reason,
  proposedPin:null, stateChanged:false, trust:'NOT_ESTABLISHED',
  authorization:'DENY', executionAllowed:false, releaseAllowed:false
});

/**
 * Read-only transition candidate evaluator: this function never writes a pin.
 * currentPin is caller supplied, not an independently authenticated checkpoint.
 * Issuer pin/time/revocation still require trusted external verification.
 */
export function proposeRegistryPinTransition({
  currentPin, expectedCurrentPin, candidateBytes, signatureBase64Url,
  issuerPublicJwk, evaluationTime, reviewerFingerprint
} = {}) {
  try {
    if (!pinValid(currentPin) || !pinValid(expectedCurrentPin))
      return deny('INVALID_CURRENT_PIN');
    if (currentPin.revision !== expectedCurrentPin.revision ||
        currentPin.issuerFingerprint !== expectedCurrentPin.issuerFingerprint ||
        currentPin.registrySha256 !== expectedCurrentPin.registrySha256)
      return deny('CHECKPOINT_CONFLICT');
    if (!(candidateBytes instanceof Uint8Array) ||
        candidateBytes.length === 0 || candidateBytes.length > 65536)
      return deny('INVALID_CANDIDATE_BYTES');
    const registry = checkSignedReviewerRegistry({
      registryBytes:candidateBytes, signatureBase64Url, issuerPublicJwk,
      expectedIssuerFingerprint: currentPin.issuerFingerprint,
      minimumRevision:currentPin.revision + 1,
      evaluationTime, reviewerFingerprint
    });
    if (!registry.localRegistryCheckPassed)
      return deny('REGISTRY_' + registry.reason);
    if (registry.registryRevision <= currentPin.revision)
      return deny('NON_MONOTONIC_REVISION');
    const proposedPin = Object.freeze({
      schema:PIN_SCHEMA,
      issuerFingerprint:currentPin.issuerFingerprint,
      revision:registry.registryRevision,
      registrySha256:createHash('sha256').update(candidateBytes).digest('hex')
    });
    return {
      schema:TRANSITION_SCHEMA, candidateVerified:true, proposedPin,
      previousRevision:currentPin.revision,
      previousSnapshotSha256:currentPin.registrySha256,
      stateChanged:false,
      requiredBeforeCommit:['INDEPENDENT_ISSUER_TRUST','TRUSTED_CLOCK',
        'CURRENT_REVOCATION','AUTHORIZED_DUAL_REVIEW','ATOMIC_CAS_STORAGE'],
      trust:'NOT_ESTABLISHED',authorization:'DENY',
      executionAllowed:false,releaseAllowed:false
    };
  } catch {
    return deny('MALFORMED_UNTRUSTED_INPUT');
  }
}
