import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../server.mjs';

const PREFIX = '/rio/reception/';
const ASSETS = [
  ['', 'index.html', 'text/html'],
  ['index.html', 'index.html', 'text/html'],
  ['app.css', 'app.css', 'text/css'],
  ['app.js', 'app.js', 'text/javascript'],
  ['nova.png', 'nova.png', 'image/png'],
];

async function serve(t) {
  let privateAccesses = 0;
  const deniedPrivateAccess = () => {
    privateAccesses += 1;
    throw new Error('Public reception cannot touch private authentication storage.');
  };
  const app = buildApp({
    env: {},
    registryLoader: deniedPrivateAccess,
    sessionStore: { get: deniedPrivateAccess, set: deniedPrivateAccess, destroy: deniedPrivateAccess },
  });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  t.after(async () => {
    app.locals.novaReception.close();
    app.locals.deviceTest.close();
    app.locals.authSafetyApproval.close();
    app.locals.authSafetyProvider?.close();
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });
  function request(path, method = 'GET') {
    // Preserve traversal spelling: URL/fetch normalization must not hide the request under test.
    return new Promise((resolve, reject) => {
      const request = httpRequest({
        hostname: '127.0.0.1', port: server.address().port, path, method,
        // Use the configured public authority while connecting only to this local fixture.
        headers: { Host: 'palaco-ambassades.onrender.com' },
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.once('error', reject);
        response.once('end', () => resolve({
          status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks),
        }));
      });
      request.setTimeout(3000, () => request.destroy(new Error('HTTP fixture timed out.')));
      request.once('error', reject);
      request.end();
    });
  }
  return { request, privateAccesses: () => privateAccesses };
}

function protectedResponse(response, csp) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['content-security-policy'], csp);
}

test('the reception publishes only its exact self-hosted files with the existing security policy', async t => {
  const f = await serve(t);
  const csp = (await f.request('/healthz')).headers['content-security-policy'];
  assert.match(csp, /(?:^|;\s*)script-src 'self'/);
  assert.equal(csp.includes("'unsafe-eval'"), false);
  for (const [path, filename, type] of ASSETS) {
    const response = await f.request(PREFIX + path);
    assert.equal(response.status, 200, path || PREFIX);
    assert.equal(response.headers['content-type'].split(';')[0], type);
    protectedResponse(response, csp);
    const expected = await readFile(new URL('../../rio/reception/' + filename, import.meta.url));
    assert.deepEqual(response.body, expected, filename + ' is served without transformation');
    if (filename === 'nova.png') {
      assert.deepEqual(response.body.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
  }
  assert.equal(f.privateAccesses(), 0);
});

test('only the exact reception pathname redirects to the fixed slash location', async t => {
  const f = await serve(t);
  const csp = (await f.request('/healthz')).headers['content-security-policy'];
  for (const path of ['/rio/reception', '/rio/reception?returnTo=https://outside.example.invalid']) {
    const response = await f.request(path);
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, PREFIX);
    protectedResponse(response, csp);
  }
  for (const path of [
    '/RIO/reception', '/rio/Reception', '/rio/reception-extra', '/rio/reception//',
    '/RIO/reception/', '/rio/reception/index.HTML', '/rio/reception/app.js/',
    '/rio/reception//app.css', '/rio/reception/NOVA.png', '/rio/reception/nova.png/',
  ]) {
    const response = await f.request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.location, undefined);
    protectedResponse(response, csp);
  }
  assert.equal(f.privateAccesses(), 0);
});

test('reception paths cannot publish backend sources, private files or traversal targets', async t => {
  const f = await serve(t);
  const csp = (await f.request('/healthz')).headers['content-security-policy'];
  for (const path of [
    '/rio/reception/server.mjs', '/rio/reception/app.js.map', '/rio/reception/package.json',
    '/rio/reception/.env', '/rio/reception/test/reception.test.mjs',
    '/rio/reception/../../auth/server.mjs', '/rio/reception/../../../package.json',
    '/rio/reception/%2e%2e/%2e%2e/auth/server.mjs',
    '/rio/reception/%2e%2e%2fauth%2fserver.mjs',
    '/rio/reception/..%5c..%5cauth%5cserver.mjs',
    '/auth/server.mjs', '/auth/.env', '/members.private.json',
    '/node_modules/express/package.json',
    '/rio/identity-design/reference.mjs', '/rio/identity-design/draft.json',
    '/rio/identity-design/reference.test.mjs', '/rio/identity-design/README.md',
    '/rio/identity-design/PP-CONTACT-CHAT-DRAFT.md',
    '/auth/contact-eligibility-design.mjs', '/auth/test/fixtures/contact-eligibility-design.json',
  ]) {
    const response = await f.request(path);
    assert.equal(response.status, 404, path);
    assert.deepEqual(JSON.parse(response.body), { error: 'NOT_FOUND' });
    protectedResponse(response, csp);
  }
  for (const [path] of ASSETS) {
    const response = await f.request(PREFIX + path, 'POST');
    assert.equal(response.status, 404, path || PREFIX);
    protectedResponse(response, csp);
  }
  assert.equal(f.privateAccesses(), 0);
});

test('public reception and runtime reads create no guest cookie or private account access', async t => {
  const f = await serve(t);
  assert.equal((await f.request(PREFIX)).status, 200);
  const nova = await f.request('/api/rio/nova/runtime');
  const device = await f.request('/api/rio/device-test/runtime');
  assert.equal(nova.status, 200);
  assert.equal(device.status, 200);
  for (const response of [nova, device]) assert.equal(response.headers['set-cookie'], undefined);
  const novaRuntime = JSON.parse(nova.body);
  assert.equal(novaRuntime.finalConsentEnabled, false);
  assert.equal(novaRuntime.chatEnabled, false);
  const deviceRuntime = JSON.parse(device.body);
  assert.equal(deviceRuntime.authenticatedIdentity, false);
  assert.equal(deviceRuntime.accountAccess, 'CLOSED');
  assert.equal(deviceRuntime.accountActive, false);
  assert.equal(deviceRuntime.canOpenContact, false);
  assert.equal(deviceRuntime.operativeAuthority, 'NONE');
  for (const path of ['/api/rio/nova/session', '/api/rio/device-test/session']) {
    const response = await f.request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  for (const path of ['/api/rio/nova/requests', '/api/rio/device-test/pair']) {
    const response = await f.request(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  const status = await f.request('/api/auth/status');
  assert.equal(status.status, 200);
  const authentication = JSON.parse(status.body);
  assert.equal(authentication.configured, false);
  assert.equal(authentication.available, false);
  assert.equal(authentication.authenticated, false);
  assert.equal(authentication.securityApproval.outcome, 'HOLD');
  assert.equal(authentication.securityApproval.loginAllowed, false);
  assert.equal(authentication.securityApproval.signupAllowed, false);
  assert.equal(status.headers['set-cookie'], undefined);
  for (const path of ['/api/me', '/api/seats/PALACO-AMB-01', '/login?seat=PALACO-AMB-01', '/signup?seat=PALACO-AMB-01']) {
    const response = await f.request(path);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  assert.equal(f.privateAccesses(), 0);
});
