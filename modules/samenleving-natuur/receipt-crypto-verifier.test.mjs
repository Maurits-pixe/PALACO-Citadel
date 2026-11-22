import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { verifyReceiptSignature, CRYPTO_SCHEMA } from './receipt-crypto-verifier.mjs';

const DOMAIN = Buffer.from('PALACO-CITADEL-RECEIPT-V1\n');
const { privateKey, publicKey } = generateKeyPairSync('ec', {namedCurve:'prime256v1'});
const jwk = publicKey.export({format:'jwk'});
const publicJwk = {kty:'EC', crv:'P-256', x:jwk.x, y:jwk.y};
const bytes = Buffer.from('{"receipt":"offline-example","sequence":1}', 'utf8');
const sha256 = x => createHash('sha256').update(x).digest('hex');
const signed = (payload=bytes) => ({
  schema:CRYPTO_SCHEMA,
  payloadSha256:sha256(payload),
  signatureBase64Url:sign('sha256', Buffer.concat([DOMAIN,payload]), privateKey).toString('base64url')
});

test('valid signature and exact bytes verified without granting trust or release', () => {
  const actual = verifyReceiptSignature(bytes, signed(), publicJwk);
  assert.equal(actual.cryptographicallyValid, true);
  assert.equal(actual.payloadSha256, sha256(bytes));
  assert.match(actual.keyFingerprintSha256, /^[a-f0-9]{64}$/);
  assert.equal(actual.trust, 'NOT_ESTABLISHED');
  assert.equal(actual.authorization, 'DENY');
  assert.equal(actual.executionAllowed, false);
  assert.equal(actual.releaseAllowed, false);
});

test('tampered payload and digest both fail closed', () => {
  const envelope = signed();
  assert.equal(verifyReceiptSignature(Buffer.from('{"altered":true}'), envelope, publicJwk).reason, 'PAYLOAD_DIGEST_MISMATCH');
  assert.equal(verifyReceiptSignature(bytes, {...envelope,payloadSha256:'0'.repeat(64)}, publicJwk).reason, 'PAYLOAD_DIGEST_MISMATCH');
});

test('wrong key, signature, and cryptographic domain fail', () => {
  const other = generateKeyPairSync('ec', {namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
  const foreign = {kty:'EC',crv:'P-256',x:other.x,y:other.y};
  assert.equal(verifyReceiptSignature(bytes, signed(), foreign).reason,'SIGNATURE_INVALID');
  const envelope = signed();
  const wrongDomain = sign('sha256',bytes,privateKey).toString('base64url');
  assert.equal(verifyReceiptSignature(bytes,{...envelope,signatureBase64Url:wrongDomain},publicJwk).reason,'SIGNATURE_INVALID');
  assert.equal(verifyReceiptSignature(bytes,{...envelope,signatureBase64Url:'%%%'} ,publicJwk).reason,'INVALID_ENVELOPE');
});

test('reject wrong schemas, extra fields and private JWK content', () => {
  const envelope=signed();
  assert.equal(verifyReceiptSignature(bytes,{...envelope, schema:'legacy'},publicJwk).reason,'INVALID_ENVELOPE');
  assert.equal(verifyReceiptSignature(bytes,{...envelope,authorization:'ALLOW'},publicJwk).reason,'INVALID_ENVELOPE');
  assert.equal(verifyReceiptSignature(bytes,envelope,{...publicJwk,d:'bogus'}).reason,'INVALID_PUBLIC_KEY');
  assert.equal(verifyReceiptSignature(bytes,envelope,{...publicJwk,crv:'P-384'}).reason,'INVALID_PUBLIC_KEY');
});

test('reject oversized, empty and non-byte payloads', () => {
  const envelope=signed();
  for (const payload of [new Uint8Array(), new Uint8Array(2 * 1024 * 1024 + 1), 'text', null]) {
    assert.equal(verifyReceiptSignature(payload,envelope,publicJwk).reason,'INVALID_PAYLOAD');
  }
});

test('untrusted throwing properties cannot trigger execution or crash', () => {
  const envelope=signed();
  Object.defineProperty(envelope,'schema',{get(){throw new Error('bad');},enumerable:true});
  const result=verifyReceiptSignature(bytes,envelope,publicJwk);
  assert.equal(result.authorization,'DENY');
  assert.equal(result.cryptographicallyValid,false);
  assert.equal(result.reason,'MALFORMED_UNTRUSTED_INPUT');
});
