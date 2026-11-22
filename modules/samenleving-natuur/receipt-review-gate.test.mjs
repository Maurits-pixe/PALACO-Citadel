import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLocalReceiptReview, REVIEW_SCHEMA } from './receipt-review-gate.mjs';

const digest = 'a'.repeat(64);
const complete = () => ({
  ledgerBound: true, checkpointBound: true, signatureCryptographicallyValid: true,
  reviewerRegistrySignatureValid: true, reviewerActive: true,
  reviewerIndependent: true, issuerIndependentlyTrusted: true,
  revocationFresh: true, policyMatched: true,
  receiptDigest: digest, checkpointDigest: digest
});

test('all locally claimed checks never grant authority', () => {
  const result = assessLocalReceiptReview(complete());
  assert.equal(result.schema, REVIEW_SCHEMA);
  assert.equal(result.localChecksReportedPass, true);
  assert.equal(result.authorization, 'DENY');
  assert.equal(result.trust, 'NOT_ESTABLISHED');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.releaseAllowed, false);
  assert.equal(result.reviewRequired, true);
});

test('missing, malformed and null inputs fail closed', () => {
  for (const value of [undefined, null, [], {}, false, 'verified']) {
    const r = assessLocalReceiptReview(value);
    assert.equal(r.localChecksReportedPass, false);
    assert.equal(r.authorization, 'DENY');
    assert.ok(r.failedChecks.length > 0);
  }
});

test('each missing or falsified control fails closed', () => {
  for (const key of Object.keys(complete()).filter(k => !k.endsWith('Digest'))) {
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

test('unexpected claimed approval cannot override explicit DENY', () => {
  const result = assessLocalReceiptReview({
    ...complete(), authorization: 'ALLOW', trust: 'TRUSTED',
    executionAllowed: true, releaseAllowed: true
  });
  assert.equal(result.authorization, 'DENY');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.releaseAllowed, false);
});
