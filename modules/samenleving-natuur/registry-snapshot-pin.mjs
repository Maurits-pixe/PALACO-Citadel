import { createHash } from 'node:crypto';
import { checkSignedReviewerRegistry } from './reviewer-registry-check.mjs';

export const PIN_SCHEMA = 'palaco-citadel-registry-snapshot-pin-v1';
const hex64 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isRecord = x => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const deny = reason => ({
  schema: PIN_SCHEMA, exactSnapshotMatched: false, reason,
  trust: 'NOT_ESTABLISHED', authorization: 'DENY',
  executionAllowed: false, releaseAllowed: false, reviewRequired: true
});

/**
 * Checks one exact locally pinned registry snapshot.
 * Independent trust in the pin, clock and issuer remains unestablished.
 * Revision advancement REQUIRES external approval: this module never pins
 * or promotes a newer snapshot automatically.
 */
export function checkPinnedRegistrySnapshot({
  registryBytes, signatureBase64Url, issuerPublicJwk,
  pinnedSnapshot, evaluationTime, reviewerFingerprint
} = {}) {
  try {
    if (!isRecord(pinnedSnapshot) ||
        Object.keys(pinnedSnapshot).length !== 4 ||
        !['schema','issuerFingerprint','revision','registrySha256']
          .every(key => Object.hasOwn(pinnedSnapshot, key)) ||
        pinnedSnapshot.schema !== PIN_SCHEMA ||
        !hex64(pinnedSnapshot.issuerFingerprint) ||
        !hex64(pinnedSnapshot.registrySha256) ||
        !Number.isSafeInteger(pinnedSnapshot.revision) ||
        pinnedSnapshot.revision < 1) return deny('INVALID_PIN');
    if (!(registryBytes instanceof Uint8Array) || registryBytes.byteLength === 0 ||
        registryBytes.byteLength > 65536) return deny('INVALID_REGISTRY_BYTES');
    // Even a valid signature for a different snapshot must not silently replace
    // the precise bytes accepted by a previous human-controlled checkpoint.
    const registrySha256 = createHash('sha256').update(registryBytes).digest('hex');
    if (registrySha256 !== pinnedSnapshot.registrySha256)
      return deny('SNAPSHOT_BYTES_DIFFER_FROM_PIN');
    const checked = checkSignedReviewerRegistry({
      registryBytes, signatureBase64Url, issuerPublicJwk,
      expectedIssuerFingerprint: pinnedSnapshot.issuerFingerprint,
      minimumRevision: pinnedSnapshot.revision,
      evaluationTime, reviewerFingerprint
    });
    if (!checked.localRegistryCheckPassed)
      return deny('REGISTRY_' + checked.reason);
    if (checked.registryRevision !== pinnedSnapshot.revision)
      return deny('REVISION_NOT_EXACTLY_PINNED');
    return {
      schema: PIN_SCHEMA,
      exactSnapshotMatched: true,
      registryRevision: checked.registryRevision,
      registrySha256,
      issuerFingerprint: checked.issuerFingerprint,
      trust: 'NOT_ESTABLISHED', authorization: 'DENY',
      executionAllowed: false, releaseAllowed: false, reviewRequired: true
    };
  } catch {
    return deny('UNTRUSTED_PIN_INPUT');
  }
}
