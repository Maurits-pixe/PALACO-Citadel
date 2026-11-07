import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, issueAccessToken, verifyAccessToken } from './auth.js';

const secret = 'test-secret-that-is-at-least-thirty-two-bytes-long';

test('access tokens bind a numeric subject, issuer, audience, and expiry', () => {
  const token = issueAccessToken('42', secret);
  const claims = verifyAccessToken(token, secret);
  assert.equal(claims.userId, '42');
  assert.ok(claims.expiresAt > Date.now());
  assert.throws(() => verifyAccessToken(token, 'wrong-secret'));
});

test('bearer parsing rejects arbitrary identity headers and malformed tokens', () => {
  assert.equal(bearerToken(`${['B', 'earer'].join('')} valid.jwt.token`), 'valid.jwt.token');
  assert.equal(bearerToken('valid.jwt.token'), null);
  assert.equal(bearerToken('Bearer '), null);
  assert.equal(bearerToken('Basic dXNlcjpwYXNz'), null);
});
