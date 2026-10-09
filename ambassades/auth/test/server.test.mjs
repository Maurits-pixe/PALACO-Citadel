import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp, readConfiguration } from '../server.mjs';

// These fixtures test application authorization and HTTP boundaries only.
// They do not validate provider tokens or replace a real OIDC login/callback test.
const ISSUER = 'https://identity.example.invalid/';
const BASE_URL = 'https://ambassades.example.invalid';
const PRIVATE_SUBJECT = 'private-fixture-subject-do-not-publish';
const privateRecord = (overrides = {}) => ({
  issuer: ISSUER,
  subject: PRIVATE_SUBJECT,
  seat: 'PALACO-AMB-01',
  status: 'enabled',
  expiresAt: '2099-01-01T00:00:00Z',
  ...overrides,
});
const registry = (records = [privateRecord()]) => ({ version: 1, members: records });
const environment = (overrides = {}) => ({
  NODE_ENV: 'production',
  OIDC_ISSUER_BASE_URL: ISSUER,
  OIDC_CLIENT_ID: 'fixture-client',
  OIDC_CLIENT_SECRET: 'fixture-client-secret-for-tests-only',
  PALACO_BASE_URL: BASE_URL,
  PALACO_SESSION_SECRET: '0123456789abcdef'.repeat(4),
  PALACO_MEMBERS_FILE: join(tmpdir(), 'palaco-private-test-membership.json'),
  ...overrides,
});

function identityMiddleware(identity) {
  return (req, res, next) => {
    req.oidc = {
      isAuthenticated: () => Boolean(identity),
      idTokenClaims: identity ?? undefined,
    };
    res.oidc = {
      login: (options) => res.status(200).json({ fixtureLogin: options }),
      logout: () => res.status(204).end(),
    };
    next();
  };
}

async function serve(t, options) {
  const app = buildApp(options);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.closeIdleConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return (path, options) => fetch(origin + path, { redirect: 'manual', ...options });
}

async function assertDenied(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
  const body = await response.text();
  for (const value of [PRIVATE_SUBJECT, ISSUER, 'fixture-client-secret-for-tests-only']) {
    assert.equal(body.includes(value), false, 'error leaked a private value');
  }
}

test('incomplete configuration remains explicitly unavailable', () => {
  const config = readConfiguration({});
  assert.equal(config.configured, false);
  assert.ok(Array.isArray(config.missing) && config.missing.length > 0);
  for (const key of ['OIDC_ISSUER_BASE_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET',
    'PALACO_BASE_URL', 'PALACO_SESSION_SECRET', 'PALACO_MEMBERS_FILE']) {
    const env = environment();
    delete env[key];
    assert.equal(readConfiguration(env).configured, false, key);
  }
});

test('production configuration requires HTTPS, a valid session secret and private storage', () => {
  assert.equal(readConfiguration(environment()).configured, true);
  const invalid = [
    { PALACO_BASE_URL: 'http://ambassades.example.invalid' },
    { PALACO_BASE_URL: 'http://localhost:3000' },
    { PALACO_BASE_URL: BASE_URL + '/nested' },
    { PALACO_BASE_URL: BASE_URL + '?redirect=1' },
    { PALACO_BASE_URL: 'https://user:password@ambassades.example.invalid' },
    { OIDC_ISSUER_BASE_URL: 'http://identity.example.invalid/' },
    { OIDC_ISSUER_BASE_URL: 'https://user:password@identity.example.invalid/' },
    { PALACO_SESSION_SECRET: 'too-short' },
    { PALACO_SESSION_SECRET: 'z'.repeat(64) },
    { PALACO_MEMBERS_FILE: 'relative-membership.json' },
    { PALACO_MEMBERS_FILE: fileURLToPath(new URL('../../access-slots.json', import.meta.url)) },
  ];
  for (const overrides of invalid) {
    assert.throws(() => readConfiguration(environment(overrides)));
  }
});

test('development HTTP is restricted to loopback origins', () => {
  for (const baseURL of ['http://127.0.0.1:3000', 'http://localhost:3000']) {
    assert.equal(readConfiguration(environment({
      NODE_ENV: 'development', PALACO_BASE_URL: baseURL,
    })).configured, true);
  }
  assert.throws(() => readConfiguration(environment({
    NODE_ENV: 'development', PALACO_BASE_URL: 'http://ambassades.example.invalid',
  })));
});

test('configuration errors do not echo supplied secrets', () => {
  const secret = 'secret-input-that-must-not-be-echoed';
  assert.throws(() => readConfiguration(environment({
    PALACO_SESSION_SECRET: secret,
  })), (error) => {
    assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes('fixture-client-secret-for-tests-only'), false);
    return true;
  });
});

test('missing provider configuration keeps public pages readable and protected APIs unavailable', async t => {
  const request = await serve(t, { env: {} });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/healthz')).status, 200);
  const status = await request('/api/auth/status');
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), {
    configured: false, available: false, authenticated: false,
  });
  for (const path of ['/login?seat=PALACO-AMB-01', '/api/me', '/api/seats/PALACO-AMB-01']) {
    await assertDenied(await request(path), 503);
  }
});

test('anonymous direct API calls and caller-supplied identity headers cannot authorize', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry(),
    authMiddleware: identityMiddleware(null),
  });
  const headers = {
    'x-forwarded-user': PRIVATE_SUBJECT,
    'x-oidc-sub': PRIVATE_SUBJECT,
    'x-oidc-issuer': ISSUER,
    authorization: 'Bearer caller-supplied-fixture',
  };
  await assertDenied(await request('/api/me', { headers }), 401);
  await assertDenied(await request('/api/seats/PALACO-AMB-01', { headers }), 401);
});

test('an authenticated but unlisted principal receives no seat access', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry([]),
    authMiddleware: identityMiddleware({ iss: ISSUER, sub: PRIVATE_SUBJECT }),
  });
  await assertDenied(await request('/api/me'), 403);
  await assertDenied(await request('/api/seats/PALACO-AMB-01'), 403);
  const status = await (await request('/api/auth/status')).json();
  assert.equal(status.authenticated, false);
  assert.equal(Object.hasOwn(status, 'seat'), false);
});

test('authorized access returns only its own seat and read-only application metadata', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry(),
    authMiddleware: identityMiddleware({ iss: ISSUER, sub: PRIVATE_SUBJECT }),
  });
  const expected = {
    seat: 'PALACO-AMB-01',
    access: 'personal-workspace-read-only',
    governanceAuthority: false,
    mergeAuthority: false,
    releaseAuthority: false,
    executionAuthority: false,
  };
  for (const path of ['/api/me', '/api/seats/PALACO-AMB-01',
    '/api/me?seat=PALACO-AMB-02&subject=caller-supplied']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
    assert.deepEqual(await response.json(), expected);
  }
  await assertDenied(await request('/api/seats/PALACO-AMB-02'), 403);
});

test('wrong issuer and email-only verified-identity fixtures still fail membership checks', async t => {
  for (const identity of [
    { iss: 'https://another-identity.example.invalid/', sub: PRIVATE_SUBJECT },
    { email: 'fixture@example.invalid', sub: PRIVATE_SUBJECT },
  ]) {
    const request = await serve(t, {
      env: environment(),
      registryLoader: async () => registry(),
      authMiddleware: identityMiddleware(identity),
    });
    await assertDenied(await request('/api/me'), 403);
  }
});

test('revocation is effective on the next request with the same existing identity session', async t => {
  let current = registry();
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => current,
    authMiddleware: identityMiddleware({ iss: ISSUER, sub: PRIVATE_SUBJECT }),
  });
  assert.equal((await request('/api/me')).status, 200);
  current = registry([privateRecord({ status: 'revoked' })]);
  await assertDenied(await request('/api/me'), 403);
  await assertDenied(await request('/api/seats/PALACO-AMB-01'), 403);
  const status = await (await request('/api/auth/status')).json();
  assert.equal(status.authenticated, false);
  assert.equal(Object.hasOwn(status, 'seat'), false);
});

test('suspension, expiration and replacement cannot be bypassed using a prior session', async t => {
  let current = registry();
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => current,
    authMiddleware: identityMiddleware({ iss: ISSUER, sub: PRIVATE_SUBJECT }),
  });
  assert.equal((await request('/api/me')).status, 200);
  for (const overrides of [
    { status: 'suspended' },
    { expiresAt: '2000-01-01T00:00:00Z' },
    { subject: 'private-fixture-successor' },
  ]) {
    current = registry([privateRecord(overrides)]);
    await assertDenied(await request('/api/me'), 403);
  }
});

test('malformed or unavailable private registry fails closed without leaking diagnostics', async t => {
  let current = registry();
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => {
      if (current instanceof Error) throw current;
      return current;
    },
    authMiddleware: identityMiddleware({ iss: ISSUER, sub: PRIVATE_SUBJECT }),
  });
  assert.equal((await request('/api/me')).status, 200);
  for (const failure of ['{invalid', { version: 99, members: [] },
    new Error('private-loader-error-' + PRIVATE_SUBJECT)]) {
    current = failure;
    await assertDenied(await request('/api/me'), 503);
    await assertDenied(await request('/login?seat=PALACO-AMB-01'), 503);
    const response = await request('/api/auth/status');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      configured: true, available: false, authenticated: false,
    });
  }
});

test('static publication excludes backend sources, dependencies and private records', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry(),
    authMiddleware: identityMiddleware(null),
  });
  for (const path of ['/auth/server.mjs', '/auth/access-policy.mjs',
    '/auth/package.json', '/auth/test/server.test.mjs', '/auth/.env',
    '/.env', '/members.private.json', '/PERSONAL-ACCESS.md',
    '/%2e%2e/auth/server.mjs', '/node_modules/express/package.json']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal((await response.text()).includes(PRIVATE_SUBJECT), false);
  }
  for (const path of ['/index.html', '/toegang.html', '/access-slots.json']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const body = await response.text();
    for (const value of [PRIVATE_SUBJECT, 'fixture-client-secret-for-tests-only']) {
      assert.equal(body.includes(value), false, path + ' leaked private identity or secret');
    }
  }
});

test('logout cannot be triggered by cross-site navigation or an untrusted Origin', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry(),
    authMiddleware: identityMiddleware({ iss: ISSUER, sub: PRIVATE_SUBJECT }),
  });
  assert.equal((await request('/logout')).status, 404);
  await assertDenied(await request('/logout', { method: 'POST' }), 403);
  await assertDenied(await request('/logout', {
    method: 'POST', headers: { Origin: 'https://untrusted.example.invalid' },
  }), 403);
  assert.equal((await request('/logout', {
    method: 'POST', headers: { Origin: BASE_URL },
  })).status, 204);
});

test('login rejects invalid seat parameters and URL-shaped redirect attempts', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry(),
    authMiddleware: identityMiddleware(null),
  });
  for (const value of ['PALACO-AMB-13', '../PALACO-AMB-01',
    'https://untrusted.example.invalid', '//untrusted.example.invalid']) {
    await assertDenied(await request('/login?seat=' + encodeURIComponent(value)), 400);
  }
});

test('login uses a fixed internal selected-seat return target and ignores caller returnTo', async t => {
  const request = await serve(t, {
    env: environment(),
    registryLoader: async () => registry(),
    authMiddleware: identityMiddleware(null),
  });
  const response = await request('/login?seat=PALACO-AMB-01&returnTo=' +
    encodeURIComponent('https://untrusted.example.invalid'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.fixtureLogin.returnTo, '/toegang.html?seat=PALACO-AMB-01');
  assert.equal(body.fixtureLogin.authorizationParams.prompt, 'select_account');
});
