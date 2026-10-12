import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../server.mjs';

const ISSUER = 'https://identity.example.invalid/';
const SUBJECT = 'PRIVATE_SAFETY_TEST_IDENTITY_318';
const SECRET = 'PRIVATE_SAFETY_TEST_DIAGNOSTIC_814';
const APPROVED = Object.freeze({
  required: true, available: true, outcome: 'APPROVED', reason: null,
  loginAllowed: true, signupAllowed: true,
});
const HOLD = Object.freeze({
  required: true, available: false, outcome: 'HOLD', reason: 'TRUSTED_SAFETY_APPROVAL_MISSING',
  loginAllowed: false, signupAllowed: false,
});
const environment = () => ({
  NODE_ENV: 'production', OIDC_ISSUER_BASE_URL: ISSUER,
  OIDC_CLIENT_ID: 'controlled-safety-fixture-client',
  OIDC_CLIENT_SECRET: 'controlled-safety-fixture-secret',
  PALACO_BASE_URL: 'https://ambassades.example.invalid',
  PALACO_SESSION_SECRET: '0123456789abcdef'.repeat(4),
  PALACO_MEMBERS_FILE: join(tmpdir(), 'controlled-safety-members.private.json'),
});
const registry = () => ({ version: 1, members: [{
  issuer: ISSUER, subject: SUBJECT, seat: 'PALACO-AMB-01', status: 'enabled',
}] });
function decision(context, overrides = {}) {
  const now = Date.now();
  return {
    schemaVersion: 'palaco-auth-safety-decision/0.1', outcome: 'APPROVED',
    context: { ...context },
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 30000).toISOString(), ...overrides,
  };
}
async function serve(t, overrides = {}) {
  const seen = { sdk: 0, login: 0, registry: 0 };
  const app = buildApp({
    env: environment(),
    registryLoader: async () => { seen.registry += 1; return registry(); },
    authMiddleware: (req, res, next) => {
      seen.sdk += 1;
      req.oidc = { isAuthenticated: () => true, idTokenClaims: { iss: ISSUER, sub: SUBJECT } };
      res.oidc = {
        login: options => { seen.login += 1; res.status(200).json({ fixtureLogin: options }); },
        logout: () => res.status(204).end(),
      };
      next();
    },
    ...overrides,
  });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  t.after(async () => {
    app.locals.novaReception.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = (path, options = {}) => fetch(origin + path, { redirect: 'manual', ...options });
  return { request, seen, app };
}
async function denied(response) {
  assert.equal(response.status, 503);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('location'), null);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { error: 'SAFETY_APPROVAL_REQUIRED' });
  for (const privateValue of [SUBJECT, SECRET, 'controlled-safety-fixture-secret']) assert.equal(body.includes(privateValue), false);
}
async function blockedStatus(request) {
  const response = await request('/api/auth/status');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const data = await response.json();
  assert.equal(data.configured, true);
  assert.equal(data.available, false);
  assert.equal(data.authenticated, false);
  assert.equal(Object.hasOwn(data, 'seat'), false);
  assert.deepEqual(data.securityApproval, HOLD);
  assert.equal(JSON.stringify(data).includes(SUBJECT), false);
}

test('production defaults block login, signup and callback before identity middleware or provider side effects', async t => {
  const f = await serve(t);
  for (const path of ['/login?seat=PALACO-AMB-01', '/signup?seat=PALACO-AMB-01', '/callback?code=forged&state=forged', '/LOGIN/?seat=PALACO-AMB-01', '/SIGNUP/?seat=PALACO-AMB-01', '/CALLBACK/?code=forged&state=forged']) {
    await denied(await f.request(path));
  }
  assert.equal(f.seen.sdk, 0);
  assert.equal(f.seen.login, 0);
  await blockedStatus(f.request);
  assert.equal((await f.request('/healthz')).status, 200);
  assert.equal((await f.request('/toegang.html')).status, 200);
});

test('query, headers, cookies and environment declarations cannot fabricate trusted safety approval', async t => {
  const f = await serve(t, { env: {
    ...environment(), PALACO_AUTH_SAFETY_APPROVED: 'true', PALACO_SECURITY_APPROVAL: 'APPROVED',
  } });
  const headers = {
    'X-PALACO-Safety-Approval': 'APPROVED', 'X-Security-Approval': 'PASS',
    Authorization: 'Bearer client-supplied-approval', Cookie: 'securityApproval=APPROVED; palacoAuthSafety=client-supplied',
  };
  for (const path of ['/login?seat=PALACO-AMB-01&securityApproval=APPROVED&outcome=PASS',
    '/signup?seat=PALACO-AMB-01&approved=true',
    '/callback?code=client&state=client&securityApproval=APPROVED']) {
    await denied(await f.request(path, { headers }));
  }
  assert.equal(f.seen.sdk, 0);
  assert.equal(f.seen.login, 0);
  await blockedStatus(f.request);
});

test('HOLD or an unavailable safety evaluator masks even an existing authenticated principal', async t => {
  for (const evaluator of [
    async context => decision(context, { outcome: 'HOLD' }),
    async () => { throw new Error(SECRET); },
  ]) {
    const f = await serve(t, { authSafetyEvaluator: evaluator });
    await denied(await f.request('/api/me'));
    await denied(await f.request('/api/seats/PALACO-AMB-01'));
    await blockedStatus(f.request);
  }
});

test('malformed, expired, overlong or context-mismatched decisions remain HOLD', async t => {
  const invalid = [
    async () => true,
    async context => decision(context, { outcome: 'PASS' }),
    async context => ({ ...decision(context), extra: 'unexpected' }),
    async context => decision(context, { schemaVersion: 'unsupported/1' }),
    async context => decision(context, { context: { ...context, seat: 'PALACO-AMB-12' } }),
    async context => decision(context, { context: { ...context, requestId: '0'.repeat(32) } }),
    async context => decision(context, { context: { ...context, phase: 'SESSION' } }),
    async context => decision(context, { expiresAt: new Date(Date.now() - 1000).toISOString() }),
    async context => decision(context, { issuedAt: new Date(Date.now() + 10000).toISOString() }),
    async context => decision(context, { expiresAt: new Date(Date.now() + 120000).toISOString() }),
  ];
  for (const evaluator of invalid) {
    const f = await serve(t, { authSafetyEvaluator: evaluator });
    await denied(await f.request('/login?seat=PALACO-AMB-01'));
    assert.equal(f.seen.login, 0);
    await blockedStatus(f.request);
  }
});

test('only a deliberate internal evaluator can approve a fresh immutable request context', async t => {
  const contexts = [];
  const f = await serve(t, { authSafetyEvaluator: async context => {
    assert.equal(Object.isFrozen(context), true);
    contexts.push({ ...context });
    return decision(context);
  } });
  const ready = await (await f.request('/api/auth/status')).json();
  assert.deepEqual(ready.securityApproval, APPROVED);
  const login = await f.request('/login?seat=PALACO-AMB-01');
  assert.equal(login.status, 200);
  assert.equal(f.seen.login, 1);
  const begin = contexts.find(context => context.phase === 'BEGIN');
  assert.ok(begin);
  assert.equal(begin.schemaVersion, 'palaco-auth-safety-context/0.1');
  assert.equal(begin.action, 'login');
  assert.equal(begin.seat, 'PALACO-AMB-01');
  assert.match(begin.requestId, /^[a-f0-9]{32}$/);
  assert.match(begin.flowId, /^[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(await login.json()).includes('sessionBinding'), false);
});

test('revoking approval denies the very next private request and removes seat from status', async t => {
  let allow = true;
  const f = await serve(t, { authSafetyEvaluator: async context => decision(context, { outcome: allow ? 'APPROVED' : 'HOLD' }) });
  assert.equal((await f.request('/api/me')).status, 200);
  allow = false;
  await denied(await f.request('/api/me'));
  await denied(await f.request('/api/seats/PALACO-AMB-01'));
  await blockedStatus(f.request);
  await denied(await f.request('/login?seat=PALACO-AMB-01'));
  await denied(await f.request('/signup?seat=PALACO-AMB-01'));
});

test('replaying a previous trusted decision cannot authorize a new request or action', async t => {
  let saved;
  const f = await serve(t, { authSafetyEvaluator: async context => {
    if (context.phase === 'READINESS') return decision(context);
    if (!saved) saved = decision(context);
    return saved;
  } });
  assert.equal((await f.request('/login?seat=PALACO-AMB-01')).status, 200);
  await denied(await f.request('/login?seat=PALACO-AMB-01'));
  await denied(await f.request('/signup?seat=PALACO-AMB-01'));
  await denied(await f.request('/api/me'));
  await blockedStatus(f.request);
});

test('approval of signup cannot bypass private seat enrollment or create governance authority', async t => {
  const f = await serve(t, {
    authSafetyEvaluator: async context => decision(context),
    registryLoader: async () => ({ version: 1, members: [] }),
  });
  const response = await f.request('/api/me');
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.equal(Object.hasOwn(data, 'seat'), false);
  assert.equal(Object.hasOwn(data, 'governanceAuthority'), false);
  const ready = await (await f.request('/api/auth/status')).json();
  assert.equal(ready.authenticated, false);
  assert.equal(Object.hasOwn(ready, 'seat'), false);
});

test('logout remains available to abandon an existing session while safety approval is HOLD', async t => {
  const f = await serve(t);
  const response = await f.request('/logout', { method: 'POST', headers: { Origin: environment().PALACO_BASE_URL } });
  assert.equal(response.status, 204);
  await denied(await f.request('/api/me'));
});

test('approval expiring during the final registry await cannot reveal an existing private session', async t => {
  let clock = Date.now();
  let registryReads = 0;
  const f = await serve(t, {
    authSafetyNow: () => clock,
    authSafetyEvaluator: async context => decision(context, {
      issuedAt: new Date(clock - 1000).toISOString(),
      expiresAt: new Date(clock + 30000).toISOString(),
    }),
    registryLoader: async () => {
      registryReads += 1;
      // The first read precedes evaluation; the second is the final asynchronous membership recheck.
      if (registryReads % 2 === 0) clock += 31000;
      return registry();
    },
  });
  await denied(await f.request('/api/me'));
  await blockedStatus(f.request);
  assert.equal(registryReads, 4);
});

test('a same-principal seat transfer during final membership loading cannot expose an unapproved new seat', async t => {
  let reads = 0;
  const f = await serve(t, {
    authSafetyEvaluator: async context => decision(context),
    registryLoader: async () => {
      reads += 1;
      return { version: 1, members: [{
        issuer: ISSUER, subject: SUBJECT, seat: reads % 2 === 0 ? 'PALACO-AMB-02' : 'PALACO-AMB-01', status: 'enabled',
      }] };
    },
  });
  const privateResponse = await f.request('/api/me');
  assert.ok([403, 503].includes(privateResponse.status));
  const privateBody = await privateResponse.text();
  assert.equal(privateBody.includes(SUBJECT), false);
  assert.equal(privateBody.includes('PALACO-AMB-02'), false);
  await blockedStatus(f.request);
});
