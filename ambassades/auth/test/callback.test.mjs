import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt } from 'jose';
import { makeAfterCallback } from '../server.mjs';
import { parseRegistry } from '../access-policy.mjs';

// The real callback receives an explicit cryptographic verifier plus the SDK's code-flow checks.
// These compact tokens and this injected decoding verifier test seat selection only;
// integration/oidc-flow.test.mjs tests actual SDK and RS256 verification over HTTPS.
const fixtureVerifier = async token => decodeJwt(token);
// Explicit trusted admission stub only for these callback membership fixtures.
const fixtureAdmission = async () => true;
const ISSUER = 'https://identity.example.invalid/';
const first = { iss: ISSUER, sub: 'fixture-person-01' };
const second = { iss: ISSUER, sub: 'fixture-person-02' };
const members = () => parseRegistry({
  version: 1,
  members: [
    { issuer: ISSUER, subject: first.sub, seat: 'PALACO-AMB-01', status: 'enabled' },
    { issuer: ISSUER, subject: second.sub, seat: 'PALACO-AMB-02', status: 'enabled' },
  ],
});
function decodingFixture(claims) {
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  return encode({ alg: 'RS256', typ: 'JWT' }) + '.' +
    encode({ exp: 4070908800, ...claims }) + '.' +
    Buffer.from('non-cryptographic-test-fixture').toString('base64url');
}
const target = seat => ({ returnTo: '/toegang.html?seat=' + seat });
const oldRequest = claims => ({ oidc: { idTokenClaims: claims } });

test('account switching authorizes the incoming validated token rather than stale request claims', async () => {
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, fixtureAdmission);
  const session = { id_token: decodingFixture(second), fixture: 'incoming-session' };
  assert.equal(await afterCallback(oldRequest(first), {}, session, target('PALACO-AMB-02')), session);
  await assert.rejects(() => afterCallback(
    oldRequest(first), {}, session, target('PALACO-AMB-01'),
  ), error => error.status === 403);
});

test('an old authorized session cannot admit a newly authenticated but unassigned person', async () => {
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, fixtureAdmission);
  const session = { id_token: decodingFixture({ iss: ISSUER, sub: 'fixture-unassigned' }) };
  await assert.rejects(() => afterCallback(
    oldRequest(first), {}, session, target('PALACO-AMB-01'),
  ), error => error.status === 403);
});

test('a stale unauthorized principal does not block an authorized incoming identity', async () => {
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, fixtureAdmission);
  const session = { id_token: decodingFixture(first) };
  assert.equal(await afterCallback(
    oldRequest({ iss: ISSUER, sub: 'fixture-unassigned' }), {},
    session, target('PALACO-AMB-01'),
  ), session);
});

test('callback targets must exactly match one internal canonical seat URL', async () => {
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, fixtureAdmission);
  const session = { id_token: decodingFixture(first) };
  for (const state of [null, undefined, {},
    { returnTo: 'https://untrusted.example.invalid/toegang.html?seat=PALACO-AMB-01' },
    { returnTo: '//untrusted.example.invalid/toegang.html?seat=PALACO-AMB-01' },
    { returnTo: '/toegang.html?seat=PALACO-AMB-13' },
    { returnTo: '/toegang.html?seat=PALACO-AMB-01&next=outside' },
    { returnTo: '/toegang.html#PALACO-AMB-01' },
    { returnTo: ['/toegang.html?seat=PALACO-AMB-01'] },
  ]) {
    await assert.rejects(() => afterCallback(
      oldRequest(first), {}, session, state,
    ), error => error.status === 400);
  }
});

test('missing or malformed incoming token does not fall back to old request identity', async () => {
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, fixtureAdmission);
  for (const session of [null, {}, { id_token: null }, { id_token: 'not-a-token' },
    { id_token: 'header.not-json.signature' }]) {
    await assert.rejects(() => afterCallback(
      oldRequest(first), {}, session, target('PALACO-AMB-01'),
    ), error => error.status === 400);
  }
});

test('wrong issuer or email-only incoming claims cannot acquire membership', async () => {
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, fixtureAdmission);
  for (const identity of [
    { iss: 'https://another-identity.example.invalid/', sub: first.sub },
    { email: 'fixture@example.invalid', sub: first.sub },
  ]) {
    await assert.rejects(() => afterCallback(
      oldRequest(first), {}, { id_token: decodingFixture(identity) },
      target('PALACO-AMB-01'),
    ), error => error.status === 403);
  }
});

test('callback authorization reloads current membership and propagates registry failure', async () => {
  let current = members();
  const afterCallback = makeAfterCallback(async () => {
    if (current instanceof Error) throw current;
    return current;
  }, fixtureVerifier, fixtureAdmission);
  const session = { id_token: decodingFixture(first) };
  assert.equal(await afterCallback(oldRequest(first), {}, session, target('PALACO-AMB-01')), session);
  current = parseRegistry({ version: 1, members: [
    { issuer: ISSUER, subject: first.sub, seat: 'PALACO-AMB-01', status: 'revoked' },
  ] });
  await assert.rejects(() => afterCallback(
    oldRequest(first), {}, session, target('PALACO-AMB-01'),
  ), error => error.status === 403);
  current = Object.assign(new Error('ACCESS_REGISTRY_UNAVAILABLE'), { status: 503 });
  await assert.rejects(() => afterCallback(
    oldRequest(first), {}, session, target('PALACO-AMB-01'),
  ), error => error.status === 503);
});

test('callback cannot create a session without a trusted safety admission dependency', async () => {
  const session = { id_token: decodingFixture(first) };
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier);
  await assert.rejects(() => afterCallback(oldRequest(first), {}, session, target('PALACO-AMB-01')),
    error => error.status === 503 && error.message === 'SAFETY_APPROVAL_REQUIRED');
});

test('callback rejects HOLD or failed safety admission after token and membership checks', async () => {
  for (const admit of [async () => false, async () => ({ outcome: 'APPROVED' }), async () => 'APPROVED',
    async () => { throw Object.assign(new Error('SAFETY_APPROVAL_REQUIRED'), { status: 503 }); }]) {
    const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, admit);
    await assert.rejects(() => afterCallback(oldRequest(first), {}, { id_token: decodingFixture(first) }, target('PALACO-AMB-01')),
      error => error.status === 503);
  }
});

test('trusted completion receives the incoming validated seat and cannot authorize an unenrolled identity', async () => {
  const seen = [];
  const session = { id_token: decodingFixture(second) };
  const incomingState = target('PALACO-AMB-02');
  const request = oldRequest(first);
  const response = {};
  const afterCallback = makeAfterCallback(async () => members(), fixtureVerifier, async (req, res, data) => {
    seen.push({ req, res, data });
    return true;
  });
  assert.equal(await afterCallback(request, response, session, incomingState), session);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].req, request);
  assert.equal(seen[0].res, response);
  assert.equal(seen[0].data.session, session);
  assert.equal(seen[0].data.decodedState, incomingState);
  assert.deepEqual(seen[0].data.claims.iss, second.iss);
  assert.deepEqual(seen[0].data.claims.sub, second.sub);
  assert.equal(seen[0].data.seat, 'PALACO-AMB-02');
  await assert.rejects(() => afterCallback(request, response,
    { id_token: decodingFixture({ iss: ISSUER, sub: 'fixture-not-enrolled' }) }, target('PALACO-AMB-02')),
    error => error.status === 403);
  assert.equal(seen.length, 1, 'Membership must be verified before trusted completion is called');
});
