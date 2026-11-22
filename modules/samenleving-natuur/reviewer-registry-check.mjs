import { createHash, createPublicKey, verify } from 'node:crypto';

export const REGISTRY_SCHEMA = 'palaco-citadel-reviewer-registry-check-v1';
const DOMAIN = Buffer.from('PALACO-CITADEL-REVIEWER-REGISTRY-V1\n');
// A freshly signed snapshot is required, but trusted clock and current revocation
// still need independent server-side validation before any authorization.
export const MAX_REGISTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const hex64 = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const time = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length &&
  keys.every(k => Object.hasOwn(v, k));
const denied = reason => ({
  schema: REGISTRY_SCHEMA, localRegistryCheckPassed: false, reason,
  trust: 'NOT_ESTABLISHED', authorization: 'DENY',
  executionAllowed: false, releaseAllowed: false
});

/**
 * Validates an externally supplied, signed registry snapshot using an issuer pin.
 * The issuer pin, revision floor and evaluation time MUST be supplied by a trusted
 * integration for any security meaning. This reference never establishes that trust.
 */
export function checkSignedReviewerRegistry({
  registryBytes, signatureBase64Url, issuerPublicJwk,
  expectedIssuerFingerprint, minimumRevision, evaluationTime,
  reviewerFingerprint
} = {}) {
  try {
    if (!(registryBytes instanceof Uint8Array) || !registryBytes.length ||
        registryBytes.length > 65536) return denied('INVALID_REGISTRY_BYTES');
    if (!exact(issuerPublicJwk, ['kty','crv','x','y']) ||
        issuerPublicJwk.kty !== 'EC' || issuerPublicJwk.crv !== 'P-256') return denied('INVALID_ISSUER_KEY');
    if (!hex64(expectedIssuerFingerprint) || !hex64(reviewerFingerprint) ||
        !Number.isSafeInteger(minimumRevision) || minimumRevision < 1 ||
        !time(evaluationTime)) return denied('INVALID_POLICY_INPUT');
    if (typeof signatureBase64Url !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(signatureBase64Url)) return denied('INVALID_SIGNATURE_ENCODING');
    const sig = Buffer.from(signatureBase64Url, 'base64url');
    if (sig.length < 8 || sig.length > 80 ||
        sig.toString('base64url') !== signatureBase64Url) return denied('INVALID_SIGNATURE_ENCODING');
    const key = createPublicKey({key:issuerPublicJwk,format:'jwk'});
    if (key.asymmetricKeyType !== 'ec' ||
        key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return denied('INVALID_ISSUER_KEY');
    const fingerprint = createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
    if (fingerprint !== expectedIssuerFingerprint) return denied('ISSUER_PIN_MISMATCH');
    const bytes = Buffer.from(registryBytes);
    if (!verify('sha256',Buffer.concat([DOMAIN,bytes]),{key,dsaEncoding:'der'},sig))
      return denied('REGISTRY_SIGNATURE_INVALID');
    const registry = JSON.parse(bytes.toString('utf8'));
    if (!exact(registry,['schema','revision','issuedAt','expiresAt','reviewers']) ||
        registry.schema !== REGISTRY_SCHEMA ||
        !Number.isSafeInteger(registry.revision) || registry.revision < minimumRevision ||
        !time(registry.issuedAt) || !time(registry.expiresAt) ||
        !(registry.issuedAt <= evaluationTime && evaluationTime < registry.expiresAt) ||
        !Array.isArray(registry.reviewers) || registry.reviewers.length > 256)
      return denied('REGISTRY_POLICY_REJECTED');
    const issuedAtMs = Date.parse(registry.issuedAt);
    const evaluationMs = Date.parse(evaluationTime);
    if (Date.parse(registry.expiresAt) <= issuedAtMs)
      return denied('INVALID_REGISTRY_VALIDITY_WINDOW');
    if (evaluationMs - issuedAtMs > MAX_REGISTRY_AGE_MS)
      return denied('REGISTRY_SNAPSHOT_TOO_OLD');
    const seen = new Set();
    let selected;
    for (const entry of registry.reviewers) {
      if (!exact(entry,['fingerprint','role','status','notBefore','notAfter']) ||
          !hex64(entry.fingerprint) || entry.role !== 'receipt-reviewer' ||
          !['active','revoked'].includes(entry.status) ||
          !time(entry.notBefore) || !time(entry.notAfter) ||
          entry.notBefore >= entry.notAfter ||
          seen.has(entry.fingerprint)) return denied('INVALID_REGISTRY_ENTRY');
      seen.add(entry.fingerprint);
      if (entry.fingerprint === reviewerFingerprint) selected = entry;
    }
    if (!selected) return denied('REVIEWER_NOT_LISTED');
    if (selected.status !== 'active') return denied('REVIEWER_REVOKED');
    if (!(selected.notBefore <= evaluationTime && evaluationTime < selected.notAfter))
      return denied('REVIEWER_NOT_CURRENT');
    return {
      schema: REGISTRY_SCHEMA, localRegistryCheckPassed: true,
      registryRevision: registry.revision, issuerFingerprint: fingerprint,
      reviewerFingerprint, trust: 'NOT_ESTABLISHED',
      authorization: 'DENY', executionAllowed: false, releaseAllowed: false
    };
  } catch {
    return denied('MALFORMED_UNTRUSTED_REGISTRY');
  }
}
