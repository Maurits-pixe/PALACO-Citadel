import { createHash, createPublicKey, verify } from 'node:crypto';

/**
 * Offline, read-only ECDSA P-256 / SHA-256 receipt verification.
 * Cryptographic validity is NOT identity, authority, or trust.
 * The signed message is fixed-domain raw UTF-8 payload bytes, not JSON reserialization.
 */
export const CRYPTO_SCHEMA = 'palaco-citadel-receipt-crypto-v1';
const DOMAIN = Buffer.from('PALACO-CITADEL-RECEIPT-V1\n', 'utf8');
const FAIL = reason => ({
  schema: CRYPTO_SCHEMA,
  cryptographicallyValid: false,
  reason,
  trust: 'NOT_ESTABLISHED',
  authorization: 'DENY',
  executionAllowed: false,
  releaseAllowed: false
});
const ownKeys = (obj, required) => obj !== null && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.getPrototypeOf(obj) === Object.prototype &&
  Object.keys(obj).length === required.length && required.every(k => Object.hasOwn(obj, k));
const b64url = str => typeof str === 'string' && /^[A-Za-z0-9_-]+$/.test(str) && str.length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/**
 * @param {Uint8Array} payloadBytes - exact raw UTF-8 receipt bytes (max 2 MiB)
 * @param {object} envelope - {schema, payloadSha256, signatureBase64Url}
 * @param {object} publicJwk - exact public P-256 JWK {kty,crv,x,y}
 */
export function verifyReceiptSignature(payloadBytes, envelope, publicJwk) {
  try {
    if (!(payloadBytes instanceof Uint8Array) || payloadBytes.byteLength === 0 ||
        payloadBytes.byteLength > 2 * 1024 * 1024) return FAIL('INVALID_PAYLOAD');
    if (!ownKeys(envelope, ['schema', 'payloadSha256', 'signatureBase64Url']) ||
        envelope.schema !== CRYPTO_SCHEMA || !digest(envelope.payloadSha256) ||
        !b64url(envelope.signatureBase64Url)) return FAIL('INVALID_ENVELOPE');
    if (!ownKeys(publicJwk, ['kty', 'crv', 'x', 'y']) ||
        publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' ||
        !b64url(publicJwk.x) || !b64url(publicJwk.y)) return FAIL('INVALID_PUBLIC_KEY');
    const bytes = Buffer.from(payloadBytes);
    const payloadSha256 = createHash('sha256').update(bytes).digest('hex');
    if (payloadSha256 !== envelope.payloadSha256) return FAIL('PAYLOAD_DIGEST_MISMATCH');
    const signature = Buffer.from(envelope.signatureBase64Url, 'base64url');
    if (signature.length < 8 || signature.length > 80 ||
        signature.toString('base64url') !== envelope.signatureBase64Url) return FAIL('INVALID_SIGNATURE_ENCODING');
    const key = createPublicKey({ key: publicJwk, format: 'jwk' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return FAIL('INVALID_PUBLIC_KEY');
    const message = Buffer.concat([DOMAIN, bytes]);
    if (!verify('sha256', message, {key, dsaEncoding: 'der'}, signature)) return FAIL('SIGNATURE_INVALID');
    return {
      schema: CRYPTO_SCHEMA,
      cryptographicallyValid: true,
      payloadSha256,
      keyFingerprintSha256: createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex'),
      trust: 'NOT_ESTABLISHED',
      authorization: 'DENY',
      executionAllowed: false,
      releaseAllowed: false
    };
  } catch {
    return FAIL('MALFORMED_UNTRUSTED_INPUT');
  }
}
