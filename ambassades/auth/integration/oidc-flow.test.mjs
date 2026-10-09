import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { buildApp } from '../server.mjs';

// A controlled loopback OIDC provider, not a production provider or enrolled account.
// No identity middleware is injected: discovery, authorization-code exchange, PKCE,
// nonce/state/claim verification, callback membership and SDK cookies run over real HTTPS.
const CLIENT_ID = 'palaco-local-integration-client';
const CLIENT_SECRET = 'local-integration-secret-not-an-account-credential';
const SUBJECT_ONE = 'synthetic-ambassador-one';
const SUBJECT_TWO = 'synthetic-ambassador-two';
const SEAT_ONE = 'PALACO-AMB-01';
const SEAT_TWO = 'PALACO-AMB-02';
const SESSION_COOKIE = '__Host-palacoSession';
let issuer, origin, tls, signingKey, wrongSigningKey, jwk, membersFile;
let providerServer, appServer, nextToken = {}, tokenExchanges = 0;
const codes = new Map();

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'https://127.0.0.1:' + server.address().port;
}
async function close(server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function members(overrides = {}) {
  await writeFile(membersFile, JSON.stringify({
    version: 1,
    members: [
      { issuer, subject: SUBJECT_ONE, seat: SEAT_ONE, status: 'enabled', ...overrides },
      { issuer, subject: SUBJECT_TWO, seat: SEAT_TWO, status: 'enabled' },
    ],
  }), { mode: 0o600 });
}
async function provider(req, res) {
  try {
    const url = new URL(req.url, issuer);
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer,
        authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token',
        jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] });
    if (url.pathname === '/authorize') {
      const params = url.searchParams;
      assert.equal(params.get('response_type'), 'code');
      assert.equal(params.get('response_mode'), 'query');
      assert.equal(params.get('client_id'), CLIENT_ID);
      assert.equal(params.get('redirect_uri'), origin + '/callback');
      assert.equal(params.get('prompt'), 'select_account');
      assert.equal(params.get('code_challenge_method'), 'S256');
      assert.match(params.get('code_challenge') || '', /^[A-Za-z0-9_-]{43}$/);
      assert.ok((params.get('nonce') || '').length >= 16);
      assert.ok((params.get('state') || '').length >= 16);
      const code = randomBytes(24).toString('base64url');
      codes.set(code, { params, token: { ...nextToken } });
      const callback = new URL(params.get('redirect_uri'));
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', params.get('state'));
      res.writeHead(302, { Location: callback.href });
      return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      assert.equal(req.headers.authorization,
        'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'));
      let body = '';
      for await (const part of req) {
        body += part;
        assert.ok(body.length < 65536);
      }
      const params = new URLSearchParams(body);
      assert.equal(params.get('grant_type'), 'authorization_code');
      const entry = codes.get(params.get('code'));
      assert.ok(entry, 'authorization code must exist and be single-use');
      codes.delete(params.get('code'));
      assert.equal(params.get('redirect_uri'), origin + '/callback');
      const verifier = params.get('code_verifier');
      assert.match(verifier || '', /^[A-Za-z0-9._~-]{43,128}$/);
      assert.equal(createHash('sha256').update(verifier).digest('base64url'),
        entry.params.get('code_challenge'), 'the SDK must exchange with matching PKCE verifier');
      tokenExchanges += 1;
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: issuer, sub: entry.token.subject || SUBJECT_ONE, aud: CLIENT_ID,
        nonce: entry.params.get('nonce'), iat: now, exp: now + 300,
        ...entry.token.claims,
      };
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })
        .sign(entry.token.wrongSignature ? wrongSigningKey : signingKey);
      return json(res, 200, {
        access_token: randomBytes(24).toString('base64url'),
        id_token: idToken, token_type: 'Bearer', expires_in: 300,
      });
    }
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    // Fail the exchange explicitly rather than allowing a provider assertion to hang the test.
    return json(res, 500, { error: 'integration_provider_assertion', detail: error.message });
  }
}

class Browser {
  cookies = new Map();
  lastSetCookies = [];
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) headers.set('Cookie',
      [...this.cookies].map(([key, value]) => key + '=' + value).join('; '));
    const response = await fetch(new URL(path, origin), {
      ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    this.lastSetCookies = response.headers.getSetCookie();
    for (const value of this.lastSetCookies) {
      const pair = value.slice(0, value.indexOf(';') < 0 ? value.length : value.indexOf(';'));
      const split = pair.indexOf('=');
      const name = pair.slice(0, split), content = pair.slice(split + 1);
      if (!content || /max-age=0(?:;|$)/i.test(value)
        || /expires=Thu, 01 Jan 1970/i.test(value)) this.cookies.delete(name);
      else this.cookies.set(name, content);
    }
    return response;
  }
  async authorize(seat = SEAT_ONE) {
    const login = await this.request('/login?seat=' + seat + '&returnTo=https://untrusted.invalid');
    assert.equal(login.status, 302, await login.clone().text());
    const authorization = new URL(login.headers.get('location'));
    assert.equal(authorization.origin, issuer);
    assert.equal(authorization.pathname, '/authorize');
    assert.equal(authorization.searchParams.get('redirect_uri'), origin + '/callback');
    const response = await fetch(authorization, {
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 302, await response.clone().text());
    return new URL(response.headers.get('location'));
  }
  async login(seat = SEAT_ONE) {
    return this.request((await this.authorize(seat)).href);
  }
}
async function expectDenied(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const body = await response.text();
  for (const value of [SUBJECT_ONE, SUBJECT_TWO, CLIENT_SECRET]) {
    assert.equal(body.includes(value), false, 'public error must not reveal private identity');
  }
}
async function expectAnonymous(browser) {
  await expectDenied(await browser.request('/api/me'), 401);
  assert.deepEqual(await (await browser.request('/api/auth/status')).json(), {
    configured: true, available: true, authenticated: false,
  });
}
function metadata(seat) {
  return {
    seat, access: 'personal-workspace-read-only',
    governanceAuthority: false, mergeAuthority: false,
    releaseAuthority: false, executionAuthority: false,
  };
}

before(async () => {
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  assert.ok(process.env.NODE_EXTRA_CA_CERTS, 'launch using integration/run.mjs for test-only CA trust');
  tls = {
    key: await readFile(process.env.PALACO_TEST_TLS_KEY_FILE),
    cert: await readFile(process.env.PALACO_TEST_TLS_CERT_FILE),
  };
  membersFile = join(process.env.PALACO_TEST_PRIVATE_DIR, 'members.private.json');
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  wrongSigningKey = (await generateKeyPair('RS256')).privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'loopback-integration-key', use: 'sig', alg: 'RS256' };
  providerServer = createServer(tls, provider);
  issuer = await listen(providerServer);
  // Reserve the HTTPS socket first so the application configuration uses its exact real origin.
  appServer = createServer(tls);
  origin = await listen(appServer);
  await members();
  const env = {
    NODE_ENV: 'production',
    OIDC_ISSUER_BASE_URL: issuer,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: CLIENT_SECRET,
    PALACO_BASE_URL: origin,
    PALACO_SESSION_SECRET: randomBytes(32).toString('hex'),
    PALACO_MEMBERS_FILE: membersFile,
  };
  appServer.on('request', buildApp({ env }));
});
beforeEach(async () => {
  nextToken = {};
  await members();
});
after(async () => {
  await close(appServer);
  await close(providerServer);
});

test('real HTTPS code flow verifies PKCE and admits only its enrolled read-only seat', async () => {
  const browser = new Browser();
  await expectAnonymous(browser);
  const exchangesBefore = tokenExchanges;
  const callback = await browser.login();
  assert.equal(callback.status, 302, await callback.clone().text());
  assert.equal(new URL(callback.headers.get('location'), origin).href,
    origin + '/toegang.html?seat=' + SEAT_ONE);
  assert.equal(tokenExchanges, exchangesBefore + 1);
  const cookie = browser.lastSetCookies.find(value => value.startsWith(SESSION_COOKIE + '='));
  assert.ok(cookie);
  for (const attribute of [/;\s*Secure(?:;|$)/i, /;\s*HttpOnly(?:;|$)/i,
    /;\s*SameSite=Lax(?:;|$)/i, /;\s*Path=\/(?:;|$)/i]) assert.match(cookie, attribute);
  assert.equal(cookie.includes(SUBJECT_ONE), false);
  assert.ok(browser.cookies.get(SESSION_COOKIE).length < 512, 'session cookie contains only a signed identifier');
  assert.deepEqual(await (await browser.request('/api/me')).json(), metadata(SEAT_ONE));
  assert.deepEqual(await (await browser.request('/api/seats/' + SEAT_ONE)).json(), metadata(SEAT_ONE));
  await expectDenied(await browser.request('/api/seats/' + SEAT_TWO), 403);
});

for (const [label, mode] of [
  ['wrong RSA signing key', { wrongSignature: true }],
  ['wrong nonce', { claims: { nonce: 'not-the-request-nonce' } }],
  ['wrong audience', { claims: { aud: 'different-client' } }],
  ['wrong issuer', { claims: { iss: 'https://another-issuer.invalid' } }],
  ['expired ID token', { claims: { iat: 1000, exp: 2000 } }],
]) {
  test('real callback denies ' + label + ' without creating a login session', async () => {
    nextToken = mode;
    const browser = new Browser();
    await expectDenied(await browser.login(), 400);
    assert.equal(browser.cookies.has(SESSION_COOKIE), false);
    await expectAnonymous(browser);
  });
}

test('callback state mismatch fails before code exchange and cannot create a session', async () => {
  const browser = new Browser();
  const callback = await browser.authorize();
  callback.searchParams.set('state', 'caller-supplied-wrong-state');
  const exchangesBefore = tokenExchanges;
  await expectDenied(await browser.request(callback.href), 400);
  assert.equal(tokenExchanges, exchangesBefore);
  await expectAnonymous(browser);
});

test('callback without the signed transaction cookie fails before code exchange', async () => {
  const owner = new Browser();
  const callback = await owner.authorize();
  const attacker = new Browser();
  const exchangesBefore = tokenExchanges;
  await expectDenied(await attacker.request(callback.href), 400);
  assert.equal(tokenExchanges, exchangesBefore);
  await expectAnonymous(attacker);
});

test('cryptographically valid but unenrolled principal cannot become a seat member', async () => {
  nextToken = { subject: 'synthetic-unlisted-principal' };
  const browser = new Browser();
  await expectDenied(await browser.login(), 403);
  assert.equal(browser.cookies.has(SESSION_COOKIE), false);
  await expectAnonymous(browser);
});

test('valid enrolled principal cannot log into another selected seat', async () => {
  const browser = new Browser();
  await expectDenied(await browser.login(SEAT_TWO), 403);
  assert.equal(browser.cookies.has(SESSION_COOKIE), false);
  await expectAnonymous(browser);
});

test('switching real accounts replaces seat identity and revokes the previous session cookie', async () => {
  const browser = new Browser();
  assert.equal((await browser.login()).status, 302);
  const previousCookie = browser.cookies.get(SESSION_COOKIE);
  assert.ok(previousCookie);
  nextToken = { subject: SUBJECT_TWO };
  const callback = await browser.login(SEAT_TWO);
  assert.equal(callback.status, 302, await callback.clone().text());
  assert.equal(new URL(callback.headers.get('location'), origin).href,
    origin + '/toegang.html?seat=' + SEAT_TWO);
  assert.notEqual(browser.cookies.get(SESSION_COOKIE), previousCookie);
  assert.deepEqual(await (await browser.request('/api/me')).json(), metadata(SEAT_TWO));
  await expectDenied(await browser.request('/api/seats/' + SEAT_ONE), 403);
  const previousBrowser = new Browser();
  previousBrowser.cookies.set(SESSION_COOKIE, previousCookie);
  await expectAnonymous(previousBrowser);
});

test('private registry revocation denies the very next request from a real logged-in session', async () => {
  const browser = new Browser();
  assert.equal((await browser.login()).status, 302);
  assert.deepEqual(await (await browser.request('/api/me')).json(), metadata(SEAT_ONE));
  await members({ status: 'revoked' });
  await expectDenied(await browser.request('/api/me'), 403);
  await expectDenied(await browser.request('/api/seats/' + SEAT_ONE), 403);
  assert.deepEqual(await (await browser.request('/api/auth/status')).json(), {
    configured: true, available: true, authenticated: false,
  });
});

test('same-origin POST logout clears the real session and rejects replay of its signed cookie', async () => {
  const browser = new Browser();
  assert.equal((await browser.login()).status, 302);
  const previousCookie = browser.cookies.get(SESSION_COOKIE);
  assert.equal((await browser.request('/logout')).status, 404);
  await expectDenied(await browser.request('/logout', {
    method: 'POST', headers: { Origin: 'https://untrusted.invalid' },
  }), 403);
  assert.deepEqual(await (await browser.request('/api/me')).json(), metadata(SEAT_ONE));
  const response = await browser.request('/logout', { method: 'POST', headers: { Origin: origin } });
  assert.equal(response.status, 302, await response.clone().text());
  assert.equal(new URL(response.headers.get('location'), origin).href, origin + '/toegang.html');
  assert.equal(browser.cookies.has(SESSION_COOKIE), false);
  await expectAnonymous(browser);
  const replay = new Browser();
  replay.cookies.set(SESSION_COOKIE, previousCookie);
  await expectAnonymous(replay);
});
