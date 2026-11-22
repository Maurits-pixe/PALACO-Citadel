import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLocalReceiptReview, REVIEW_SCHEMA } from './receipt-review-gate.mjs';

const digest = 'a'.repeat(64);
const complete = () => ({
  ledgerBound: true, checkpointBound: true, signatureCryptographicallyValid: true,
  reviewerRegistrySignatureValid: true, reviewerActive: true,
  reviewerIndependent: true, issuerIndependentlyTrusted: true,
  revocationFresh: true, policyMatched: true,
  receiptDigest: digest, checkpointDigest: digest,
  makerId: 'maker-001', reviewerId: 'reviewer-002',
  makerKeyFingerprint: 'b'.repeat(64), reviewerKeyFingerprint: 'c'.repeat(64)
});

test('all locally claimed checks never grant authority', () => {
  const result = assessLocalReceiptReview(complete());
  assert.equal(result.schema, REVIEW_SCHEMA);
  assert.equal(result.localChecksReportedPass, true);
  assert.deepEqual(result.failedChecks, []);
  assert.equal(result.authorization, 'DENY');
  assert.equal(result.trust, 'NOT_ESTABLISHED');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.releaseAllowed, false);
  assert.equal(result.reviewRequired, true);
});

test('missing, malformed and null inputs fail closed', () => {
  for (const value of [undefined, null, [], {}, false, 'verified', Object.create(null)]) {
    const r = assessLocalReceiptReview(value);
    assert.equal(r.localChecksReportedPass, false);
    assert.equal(r.authorization, 'DENY');
    assert.ok(r.failedChecks.length > 0);
  }
});

test('each missing or falsified boolean control fails closed', () => {
  const keys = [
    'ledgerBound', 'checkpointBound', 'signatureCryptographicallyValid',
    'reviewerRegistrySignatureValid', 'reviewerActive', 'reviewerIndependent',
    'issuerIndependentlyTrusted', 'revocationFresh', 'policyMatched'
  ];
  for (const key of keys) {
    for (const value of [undefined, false, 1, 'true', null]) {
      const claims = complete();
      if (value === undefined) delete claims[key]; else claims[key] = value;
      const result = assessLocalReceiptReview(claims);
      assert.equal(result.localChecksReportedPass, false, key);
      assert.ok(result.failedChecks.includes(key), key);
    }
  }
});

test('digest mismatch and malformed digests fail closed', () => {
  for (const value of ['b'.repeat(64), 'A'.repeat(64), '', null, 3]) {
    const claims = complete();
    claims.checkpointDigest = value;
    const r = assessLocalReceiptReview(claims);
    assert.equal(r.localChecksReportedPass, false);
    assert.ok(r.failedChecks.includes('digestMismatchOrMissing'));
  }
});

test('same maker and reviewer identity is rejected despite independence claim', () => {
  const claims = complete();
  claims.reviewerId = claims.makerId;
  const r = assessLocalReceiptReview(claims);
  assert.equal(r.localChecksReportedPass, false);
  assert.ok(r.failedChecks.includes('makerReviewerIdentityNotDistinct'));
});

test('different IDs with reused reviewer key are rejected', () => {
  const claims = complete();
  claims.reviewerKeyFingerprint = claims.makerKeyFingerprint;
  const r = assessLocalReceiptReview(claims);
  assert.equal(r.localChecksReportedPass, false);
  assert.ok(r.failedChecks.includes('makerReviewerKeyNotDistinct'));
});

test('missing and noncanonical identities and fingerprints are rejected', () => {
  for (const [field, values, failure] of [
    ['makerId', ['', 'Maker-001', ' maker-001', null, 'x'.repeat(129)], 'makerReviewerIdentityNotDistinct'],
    ['reviewerId', ['', 'reviewer 2', null], 'makerReviewerIdentityNotDistinct'],
    ['makerKeyFingerprint', ['', 'B'.repeat(64), null, 'b'.repeat(63)], 'makerReviewerKeyNotDistinct'],
    ['reviewerKeyFingerprint', [null, 12, 'c'.repeat(65)], 'makerReviewerKeyNotDistinct']
  ]) {
    for (const value of values) {
      const claims = complete();
      claims[field] = value;
      const r = assessLocalReceiptReview(claims);
      assert.equal(r.localChecksReportedPass, false);
      assert.ok(r.failedChecks.includes(failure));
    }
  }
});

test('unreadable getter fails closed without throwing', () => {
  const claims = complete();
  Object.defineProperty(claims, 'makerId', {get() { throw new Error('untrusted'); }});
  const r = assessLocalReceiptReview(claims);
  assert.deepEqual(r.failedChecks, ['unreadableUntrustedInput']);
  assert.equal(r.authorization, 'DENY');
});

test('untrusted approval claims cannot override DENY', () => {
  const result = assessLocalReceiptReview({
    ...complete(), authorization: 'ALLOW', trust: 'TRUSTED',
    executionAllowed: true, releaseAllowed: true
  });
  assert.equal(result.authorization, 'DENY');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.releaseAllowed, false);
});
