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
    if (!isRecord(pinnedSnapshot)) return deny('INVALID_PIN');
    const pinKeys = ['schema','issuerFingerprint','revision','registrySha256'];
    // Reflect.ownKeys does not invoke property-descriptor traps just to list
    // names; Object.keys would read each descriptor a second time on Proxies.
    const actualKeys = Reflect.ownKeys(pinnedSnapshot);
    if (actualKeys.length !== pinKeys.length ||
        actualKeys.some(key => typeof key !== 'string' || !pinKeys.includes(key)))
      return deny('INVALID_PIN');
    // Snapshot only own data descriptors. Accessor properties and Proxy traps
    // are untrusted, and a second property read may return changed values.
    const pin = Object.create(null);
    for (const key of pinKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(pinnedSnapshot, key);
      if (!descriptor || !Object.hasOwn(descriptor,'value'))
        return deny('INVALID_PIN');
      pin[key] = descriptor.value;
    }
    if (pin.schema !== PIN_SCHEMA ||
        !hex64(pin.issuerFingerprint) ||
        !hex64(pin.registrySha256) ||
        !Number.isSafeInteger(pin.revision) ||
        pin.revision < 1) return deny('INVALID_PIN');
    if (!(registryBytes instanceof Uint8Array) || registryBytes.byteLength === 0 ||
        registryBytes.byteLength > 65536) return deny('INVALID_REGISTRY_BYTES');
    // Copy mutable caller-owned bytes exactly once. The hash and subsequent
    // signature verification must inspect the same immutable local snapshot.
    // No input byte buffer may be promoted into authority by this comparison.
    const snapshotBytes = Buffer.from(registryBytes);
    // Even a valid signature for a different snapshot must not silently replace
    // the precise bytes accepted by a previous human-controlled checkpoint.
    const registrySha256 = createHash('sha256').update(snapshotBytes).digest('hex');
    if (registrySha256 !== pin.registrySha256)
      return deny('SNAPSHOT_BYTES_DIFFER_FROM_PIN');
    // Issuer JWK is supplied by the caller and can be a mutable Proxy.
    // Strictly snapshot own data descriptors once so key inspection, fingerprint
    // derivation and signature verification all see the identical public key.
    if (!isRecord(issuerPublicJwk)) return deny('INVALID_ISSUER_KEY');
    const jwkKeys = ['kty','crv','x','y'];
    const actualJwkKeys = Reflect.ownKeys(issuerPublicJwk);
    if (actualJwkKeys.length !== jwkKeys.length ||
        actualJwkKeys.some(key => typeof key !== 'string' || !jwkKeys.includes(key)))
      return deny('INVALID_ISSUER_KEY');
    const keySnapshot = {};
    for (const key of jwkKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(issuerPublicJwk, key);
      if (!descriptor || !Object.hasOwn(descriptor,'value') ||
          typeof descriptor.value !== 'string')
        return deny('INVALID_ISSUER_KEY');
      keySnapshot[key] = descriptor.value;
    }
    const checked = checkSignedReviewerRegistry({
      registryBytes: snapshotBytes, signatureBase64Url, issuerPublicJwk: keySnapshot,
      expectedIssuerFingerprint: pin.issuerFingerprint,
      minimumRevision: pin.revision,
      evaluationTime, reviewerFingerprint
    });
    if (!checked.localRegistryCheckPassed)
      return deny('REGISTRY_' + checked.reason);
    if (checked.registryRevision !== pin.revision)
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
