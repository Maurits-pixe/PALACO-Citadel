import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFile, writeFile, mkdtemp, chmod, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { buildApp } from '../server.mjs';
import { createAuthSafetyProvider, createControlledAuthSafetyProvider, authSafetySigningBytes, authSafetyDigest } from '../auth-safety-provider.mjs';

const APPLICATION_ORIGIN = 'https://consumer.example.invalid';
const POLICY = 'PALACO-AUTH-SAFETY-1';
const TOKEN = 'controlled-interface-fixture-bearer-token';
const ROLES = ['SERVICE_READINESS', 'CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK', 'PRINCIPAL_BINDING', 'DECISION', 'REVOCATION'];
const REQUIRED = {
  READINESS: ['SERVICE_READINESS', 'ACCESS_POLICY'],
  BEGIN: ['CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK'],
  CALLBACK: ['CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK'],
  COMPLETE: ['CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK', 'PRINCIPAL_BINDING'],
  SESSION: ['CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK', 'PRINCIPAL_BINDING'],
};
const hex = bytes => randomBytes(bytes).toString('hex');
const iso = time => new Date(time).toISOString();
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const signingBytes = body => Buffer.from('PALACO/AUTH-SAFETY/SIGNED-PROOF/v0.1\0' + canonical(body), 'utf8');
function context(phase = 'READINESS', action = phase === 'SESSION' ? 'session' : 'login') {
  return Object.freeze({
    schemaVersion: 'palaco-auth-safety-context/0.1', requestId: hex(16), action, phase,
    seat: phase === 'READINESS' ? null : 'PALACO-AMB-01',
    flowId: ['BEGIN', 'CALLBACK', 'COMPLETE'].includes(phase) ? hex(16) : null,
    sessionBinding: phase === 'READINESS' ? null : hex(32),
    principalBinding: ['COMPLETE', 'SESSION'].includes(phase) ? hex(32) : null,
  });
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return 'https://127.0.0.1:' + server.address().port;
}
async function close(server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
function json(res, body, status = 200, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function fixture(t, options = {}) {
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  assert.ok(process.env.NODE_EXTRA_CA_CERTS, 'Run through integration/run.mjs with the ephemeral trusted CA');
  const directory = await mkdtemp(join(process.env.PALACO_TEST_PRIVATE_DIR, 'signed-safety-'));
  const tls = options.tls || {
    key: await readFile(process.env.PALACO_TEST_TLS_KEY_FILE),
    cert: await readFile(process.env.PALACO_TEST_TLS_CERT_FILE),
  };
  const state = { clock: Date.now(), requests: [], redirectHits: 0, transform: null, revocationTransform: null, beforeReply: null, transport: null };
  const keys = new Map(ROLES.map(role => [role, generateKeyPairSync('ed25519')]));
  let configuration;
  const issuer = role => configuration.enrollments.find(record => record.role === role);
  const signed = (role, body) => ({
    algorithm: 'Ed25519', body,
    signature: sign(null, signingBytes(body), keys.get(role).privateKey).toString('base64url'),
  });
  function proof(request, kind, role, control, result, proofSetDigest) {
    return {
      schemaVersion: 'palaco-auth-safety-proof/0.1', classification: 'TEST_ONLY',
      id: hex(16), issuerId: issuer(role).id, kind, control,
      action: request.context?.action, phase: request.context?.phase,
      requestDigest: request.requestDigest || digest(request),
      policyVersion: configuration.policyVersion, enrollmentEpoch: configuration.enrollmentEpoch,
      trustRevision: configuration.revision, result, proofSetDigest,
      issuedAt: iso(state.clock), expiresAt: iso(state.clock + 20000),
    };
  }
  const server = createServer(tls, async (req, res) => {
    try {
      const url = new URL(req.url, 'https://127.0.0.1');
      if (url.pathname === '/redirected') { state.redirectHits += 1; return json(res, {}); }
      if (!['/decision', '/revocation'].includes(url.pathname)) {
        if (options.otherHandler) return await options.otherHandler(req, res);
        return json(res, { error: 'not_found' }, 404);
      }
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, 'Bearer ' + TOKEN);
      assert.equal(req.headers['accept-encoding'], 'identity');
      assert.match(req.headers['content-type'] || '', /application\/json/);
      let raw = '';
      for await (const part of req) raw += part;
      const request = JSON.parse(raw);
      state.requests.push({ path: url.pathname, request });
      if (state.transport === 'redirect') { res.writeHead(307, { Location: '/redirected' }); return res.end(); }
      if (state.transport === 'timeout') return;
      if (state.transport === 'oversized') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(' '.repeat(32769)); }
      let response;
      if (url.pathname === '/decision') {
        assert.equal(request.schemaVersion, 'palaco-auth-safety-request/0.1');
        const controls = REQUIRED[request.context.phase].map(control =>
          signed(control, proof(request, 'CONTROL', control, control, 'PASS', null)));
        const proofSetDigest = digest([...controls].sort((a, b) => a.body.control.localeCompare(b.body.control)));
        response = { schemaVersion: 'palaco-auth-safety-response/0.1', controls,
          decision: signed('DECISION', proof(request, 'DECISION', 'DECISION', null, 'APPROVED', proofSetDigest)) };
        if (state.transform) response = await state.transform(response, request, signed);
      } else {
        assert.equal(request.schemaVersion, 'palaco-auth-revocation-request/0.1');
        const decisionRequest = state.requests.filter(entry => entry.path === '/decision').at(-1).request;
        const body = {
          ...proof({ ...request, context: decisionRequest.context }, 'REVOCATION', 'REVOCATION', null, 'CURRENT', request.proofSetDigest),
          decisionId: request.decisionId, challenge: request.challenge, observedAt: iso(state.clock),
          revokedEnrollmentIds: [], revokedDecisionIds: [],
          expiresAt: iso(state.clock + 4500),
        };
        response = { schemaVersion: 'palaco-auth-revocation-response/0.1', revocation: signed('REVOCATION', body) };
        if (state.revocationTransform) response = await state.revocationTransform(response, request, signed);
      }
      if (state.beforeReply) await state.beforeReply(url.pathname, response, request);
      if (state.transport === 'compressed') res.setHeader('Content-Encoding', 'gzip');
      if (state.transport === 'bad-status') return json(res, response, 503);
      return json(res, response, 200, state.transport === 'bad-type' ? 'text/plain' : 'application/json');
    } catch {
      if (!res.headersSent) return json(res, { error: 'synthetic_provider_fixture_failure' }, 500);
      res.destroy();
    }
  });
  const origin = await listen(server);
  const configurationFile = join(directory, 'provider.private.json');
  configuration = {
    schemaVersion: 'palaco-auth-safety-provider/0.1', classification: 'TEST_ONLY',
    revision: 'revision-1', applicationOrigin: options.applicationOrigin || APPLICATION_ORIGIN,
    decisionEndpoint: origin + '/decision', revocationEndpoint: origin + '/revocation',
    policyVersion: POLICY, enrollmentEpoch: 'epoch-1', authorizationToken: TOKEN,
    issuedAt: iso(state.clock - 1000), expiresAt: iso(state.clock + 3600000),
    enrollments: ROLES.map((role, index) => ({
      id: 'test-issuer-' + index, role, publicKeyPem: keys.get(role).publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      status: 'ACTIVE', enrollmentId: 'test-enrollment-' + index, provenanceRef: 'urn:palaco:test-only:' + role,
      issuedAt: iso(state.clock - 1000), expiresAt: iso(state.clock + 3600000),
    })),
    revokedEnrollmentIds: [], revokedDecisionIds: [],
  };
  async function save() { await writeFile(configurationFile, JSON.stringify(configuration), { mode: 0o600 }); }
  await save();
  const provider = createControlledAuthSafetyProvider({
    configurationFile, repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
    applicationOrigin: configuration.applicationOrigin, now: () => state.clock,
  });
  t.after(async () => { provider.close(); await close(server); });
  return { state, provider, server, origin, configuration, configurationFile, directory, tls, save, signed, issuer,
    resign(envelope, role, changes) { return signed(role, { ...envelope.body, ...changes }); },
  };
}
async function expectRejected(f, input = context()) {
  await assert.rejects(() => f.provider.evaluate(input));
}


test('canonical signing domain and digests agree with an independent Node crypto implementation', () => {
  const vector = { z: ['a', 7, null], a: true };
  assert.equal(authSafetySigningBytes(vector).toString('utf8'), 'PALACO/AUTH-SAFETY/SIGNED-PROOF/v0.1\0{"a":true,"z":["a",7,null]}');
  assert.equal(authSafetyDigest(vector), createHash('sha256').update('{"a":true,"z":["a",7,null]}').digest('hex'));
});

test('genuine HTTPS and seven independent Ed25519 keys verify every legal phase with explicit TEST_ONLY enrollment', async t => {
  const f = await fixture(t);
  assert.equal(new Set(f.configuration.enrollments.map(record => record.publicKeyPem)).size, 7);
  for (const phase of ['READINESS', 'BEGIN', 'CALLBACK', 'COMPLETE', 'SESSION']) {
    const input = context(phase);
    const result = await f.provider.evaluate(input);
    assert.deepEqual(Object.keys(result).sort(), ['schemaVersion', 'outcome', 'context', 'issuedAt', 'expiresAt'].sort());
    assert.equal(result.schemaVersion, 'palaco-auth-safety-decision/0.1');
    assert.equal(result.outcome, 'APPROVED');
    assert.deepEqual(result.context, input);
    assert.ok(Date.parse(result.expiresAt) <= f.state.clock + 4500);
    assert.doesNotThrow(() => f.provider.assertCurrent(result));
  }
  assert.equal(f.state.requests.filter(entry => entry.path === '/decision').length, 5);
  assert.equal(f.state.requests.filter(entry => entry.path === '/revocation').length, 5);
});

test('normal production factory rejects TEST_ONLY enrollment and an inactive bearer configuration makes no request', async t => {
  const f = await fixture(t);
  await assert.rejects(async () => {
    const production = createAuthSafetyProvider({
      configurationFile: f.configurationFile, repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      applicationOrigin: APPLICATION_ORIGIN, now: () => f.state.clock,
    });
    try { await production.evaluate(context()); } finally { production.close(); }
  });
  assert.equal(f.state.requests.length, 0);
  f.configuration.authorizationToken = null;
  await f.save();
  await expectRejected(f);
  assert.equal(f.state.requests.length, 0);
});

test('incorrect signatures, signed body tampering and caller-supplied verification keys cannot approve', async t => {
  const mutations = [
    (response, f) => { response.controls[0].signature = sign(null, signingBytes(response.controls[0].body), generateKeyPairSync('ed25519').privateKey).toString('base64url'); return response; },
    response => { response.controls[0].body.result = 'UNKNOWN'; return response; },
    (response, f) => { response.controls[0].publicKeyPem = f.configuration.enrollments[0].publicKeyPem; return response; },
    response => { response.decision.signature += '='; return response; },
  ];
  for (const mutate of mutations) {
    const f = await fixture(t);
    f.state.transform = response => mutate(response, f);
    await expectRejected(f);
  }
});

function recertifySet(response, f) {
  const sorted = [...response.controls].sort((a, b) => a.body.control.localeCompare(b.body.control));
  response.decision = f.resign(response.decision, 'DECISION', { proofSetDigest: digest(sorted) });
  return response;
}

test('missing, duplicated, UNKNOWN, extra or wrongly assigned signed controls fail exact phase coverage', async t => {
  for (const fault of ['missing', 'duplicate', 'unknown', 'extra', 'wrong-issuer']) {
    const f = await fixture(t);
    f.state.transform = response => {
      if (fault === 'missing') response.controls.pop();
      if (fault === 'duplicate') response.controls.push(f.resign(response.controls[0], response.controls[0].body.control, { id: hex(16) }));
      if (fault === 'unknown') response.controls[0] = f.resign(response.controls[0], response.controls[0].body.control, { result: 'UNKNOWN' });
      if (fault === 'extra') response.controls.push(f.signed('PRINCIPAL_BINDING', { ...response.controls[0].body, id: hex(16), control: 'PRINCIPAL_BINDING', issuerId: f.issuer('PRINCIPAL_BINDING').id }));
      if (fault === 'wrong-issuer') response.controls[0] = f.signed('ABUSE_RISK', { ...response.controls[0].body, issuerId: f.issuer('ABUSE_RISK').id });
      return recertifySet(response, f);
    };
    await expectRejected(f);
  }
});

test('cryptographically valid proofs cannot swap action, phase, request digest or enrollment checkpoint', async t => {
  for (const changes of [
    { action: 'signup' }, { phase: 'COMPLETE' }, { requestDigest: '0'.repeat(64) },
    { policyVersion: 'caller-policy' }, { enrollmentEpoch: 'epoch-2' }, { trustRevision: 'revision-2' },
    { classification: 'PRODUCTION' },
  ]) {
    const f = await fixture(t);
    f.state.transform = response => {
      response.controls[0] = f.resign(response.controls[0], response.controls[0].body.control, changes);
      return recertifySet(response, f);
    };
    await expectRejected(f);
  }
});

test('missing decision, wrong proof-set digest and unknown response fields cannot authorize', async t => {
  for (const fault of ['missing', 'set-digest', 'extra-field']) {
    const f = await fixture(t);
    f.state.transform = response => {
      if (fault === 'missing') delete response.decision;
      if (fault === 'set-digest') response.decision = f.resign(response.decision, 'DECISION', { proofSetDigest: '0'.repeat(64) });
      if (fault === 'extra-field') response.publicKeyPem = f.configuration.enrollments[0].publicKeyPem;
      return response;
    };
    await expectRejected(f);
  }
});

test('expired, future and overlong signed controls remain closed despite valid signatures', async t => {
  for (const fault of ['expired', 'future', 'overlong']) {
    const f = await fixture(t);
    f.state.transform = response => {
      const changes = fault === 'expired'
        ? { issuedAt: iso(f.state.clock - 2000), expiresAt: iso(f.state.clock - 1) }
        : fault === 'future'
          ? { issuedAt: iso(f.state.clock + 5000), expiresAt: iso(f.state.clock + 10000) }
          : { issuedAt: iso(f.state.clock), expiresAt: iso(f.state.clock + 30001) };
      response.controls[0] = f.resign(response.controls[0], response.controls[0].body.control, changes);
      return recertifySet(response, f);
    };
    await expectRejected(f);
  }
});

test('a response captured from an earlier request cannot approve a fresh context and nonce', async t => {
  const f = await fixture(t);
  let captured;
  f.state.transform = response => { captured = structuredClone(response); return response; };
  await f.provider.evaluate(context());
  f.state.transform = () => captured;
  await expectRejected(f, context());
});

test('signed revocation witness must match its fresh nonce, decision, proof set and request digest', async t => {
  for (const field of ['challenge', 'decisionId', 'proofSetDigest', 'requestDigest']) {
    const f = await fixture(t);
    f.state.revocationTransform = response => {
      response.revocation = f.resign(response.revocation, 'REVOCATION', { [field]: '0'.repeat(field === 'decisionId' ? 32 : 64) });
      return response;
    };
    await expectRejected(f);
  }
});

test('remote revocation of any used enrollment or decision blocks a correctly signed decision', async t => {
  for (const fault of ['enrollment', 'decision', 'revocation-signer']) {
    const f = await fixture(t);
    f.state.revocationTransform = (response, request) => {
      const changes = fault === 'decision' ? { revokedDecisionIds: [request.decisionId] }
        : { revokedEnrollmentIds: [f.issuer(fault === 'enrollment' ? 'ACCESS_POLICY' : 'REVOCATION').enrollmentId] };
      response.revocation = f.resign(response.revocation, 'REVOCATION', changes);
      return response;
    };
    await expectRejected(f);
  }
});

test('unknown, old, overlong or incorrectly signed revocation testimony never establishes CURRENT', async t => {
  for (const fault of ['unknown', 'old', 'overlong', 'wrong-key']) {
    const f = await fixture(t);
    f.state.revocationTransform = response => {
      if (fault === 'wrong-key') response.revocation.signature = sign(null, signingBytes(response.revocation.body), generateKeyPairSync('ed25519').privateKey).toString('base64url');
      else {
        const changes = fault === 'unknown' ? { result: 'UNKNOWN' }
          : fault === 'old'
            ? { issuedAt: iso(f.state.clock - 6000), observedAt: iso(f.state.clock - 6000), expiresAt: iso(f.state.clock - 1000) }
            : { expiresAt: iso(f.state.clock + 5001) };
        response.revocation = f.resign(response.revocation, 'REVOCATION', changes);
      }
      return response;
    };
    await expectRejected(f);
  }
});

test('local trust revocation or revision changes during real HTTPS validation invalidate approval', async t => {
  for (const fault of ['revoked-enrollment', 'revision', 'epoch']) {
    const f = await fixture(t);
    f.state.beforeReply = async path => {
      if (path !== '/decision') return;
      if (fault === 'revoked-enrollment') f.configuration.revokedEnrollmentIds.push(f.issuer('DECISION').enrollmentId);
      if (fault === 'revision') f.configuration.revision = 'revision-2';
      if (fault === 'epoch') f.configuration.enrollmentEpoch = 'epoch-2';
      await f.save();
    };
    await expectRejected(f);
  }
});

test('final synchronous proof check rereads private trust and never reuses missing or changed enrollment', async t => {
  for (const fault of ['revoked-enrollment', 'revoked-decision', 'revision', 'missing']) {
    const f = await fixture(t);
    let decisionId;
    f.state.revocationTransform = response => { decisionId = response.revocation.body.decisionId; return response; };
    const decision = await f.provider.evaluate(context());
    assert.doesNotThrow(() => f.provider.assertCurrent(decision));
    if (fault === 'missing') await unlink(f.configurationFile);
    else {
      if (fault === 'revoked-enrollment') f.configuration.revokedEnrollmentIds.push(f.issuer('CONTEXT_BINDING').enrollmentId, f.issuer('DECISION').enrollmentId);
      if (fault === 'revoked-decision') f.configuration.revokedDecisionIds.push(decisionId);
      if (fault === 'revision') f.configuration.revision = 'revision-2';
      await f.save();
    }
    assert.throws(() => f.provider.assertCurrent(decision));
  }
});

test('the five-second remote witness lifetime limits final admission without renewing its evidence', async t => {
  const f = await fixture(t);
  const decision = await f.provider.evaluate(context('SESSION'));
  f.state.clock += 4500;
  assert.throws(() => f.provider.assertCurrent(decision));
});

test('unsafe enrollment file locations, public permissions and duplicate independent keys remain closed', async t => {
  for (const fault of ['public-mode', 'duplicate-key', 'inside-repository']) {
    const f = await fixture(t);
    if (fault === 'public-mode') await chmod(f.configurationFile, 0o644);
    if (fault === 'duplicate-key') { f.configuration.enrollments[1].publicKeyPem = f.configuration.enrollments[0].publicKeyPem; await f.save(); }
    if (fault === 'inside-repository') {
      await assert.rejects(async () => {
        const inside = createControlledAuthSafetyProvider({ configurationFile: f.configurationFile, repositoryRoot: f.directory, applicationOrigin: APPLICATION_ORIGIN, now: () => f.state.clock });
        try { await inside.evaluate(context()); } finally { inside.close(); }
      });
    } else await expectRejected(f);
    assert.equal(f.state.requests.length, 0);
  }
});

test('HTTP endpoint changes, redirects and unsupported response status, type or encoding are rejected', async t => {
  for (const fault of ['redirect', 'bad-status', 'bad-type', 'compressed']) {
    const f = await fixture(t);
    f.state.transport = fault;
    await expectRejected(f);
    assert.equal(f.state.redirectHits, 0);
  }
  const f = await fixture(t);
  f.configuration.revocationEndpoint = 'https://different-provider.example.invalid/revocation';
  await f.save();
  await expectRejected(f);
  assert.equal(f.state.requests.length, 0);
});

test('response byte limits and the combined real transport timeout fail closed', { timeout: 12000 }, async t => {
  for (const fault of ['oversized', 'timeout', 'combined-deadline']) {
    const f = await fixture(t);
    if (fault === 'combined-deadline') f.state.beforeReply = async () => { await new Promise(resolve => setTimeout(resolve, 1700)); };
    else f.state.transport = fault;
    await expectRejected(f);
  }
});

test('normal TLS certificate verification rejects an independently generated untrusted endpoint', async t => {
  const directory = await mkdtemp(join(process.env.PALACO_TEST_PRIVATE_DIR, 'untrusted-safety-tls-'));
  const key = join(directory, 'key.pem'), cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=Untrusted controlled safety fixture', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore', timeout: 30000 });
  const f = await fixture(t, { tls: { key: await readFile(key), cert: await readFile(cert) } });
  await expectRejected(f);
  assert.equal(f.state.requests.length, 0, 'No authenticated HTTP request reaches an untrusted TLS endpoint');
});

test('otherwise valid signed timestamps cannot place the decision before controls or revocation before the decision', async t => {
  for (const fault of ['decision-order', 'witness-order']) {
    const f = await fixture(t);
    f.configuration.issuedAt = iso(f.state.clock - 10000);
    f.configuration.enrollments.forEach(record => { record.issuedAt = iso(f.state.clock - 10000); });
    await f.save();
    if (fault === 'decision-order') f.state.transform = response => {
      response.decision = f.resign(response.decision, 'DECISION', { issuedAt: iso(f.state.clock - 1000), expiresAt: iso(f.state.clock + 19000) });
      return response;
    };
    else f.state.revocationTransform = response => {
      response.revocation = f.resign(response.revocation, 'REVOCATION', {
        issuedAt: iso(f.state.clock - 1000), observedAt: iso(f.state.clock - 1000), expiresAt: iso(f.state.clock + 3000),
      });
      return response;
    };
    await expectRejected(f);
  }
});

async function sdkFixture(t, options = {}) {
  const client = 'controlled-signed-safety-client', secret = 'controlled-signed-safety-client-secret';
  const subject = 'controlled-signed-safety-person', seat = 'PALACO-AMB-01';
  const pair = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'controlled-signed-safety-rsa', use: 'sig', alg: 'RS256' };
  const tls = { key: await readFile(process.env.PALACO_TEST_TLS_KEY_FILE), cert: await readFile(process.env.PALACO_TEST_TLS_CERT_FILE) };
  const appServer = createServer(tls);
  const appOrigin = await listen(appServer);
  const codes = new Map();
  let f;
  const activity = { exchanges: 0, registryReads: 0, armed: false, discoveryArmed: false };
  async function oidc(req, res) {
    const url = new URL(req.url, f.origin);
    if (url.pathname === '/.well-known/openid-configuration') {
      if (activity.discoveryArmed && options.onDiscovery) await options.onDiscovery(f);
      return json(res, {
        issuer: f.origin, authorization_endpoint: f.origin + '/authorize', token_endpoint: f.origin + '/token', jwks_uri: f.origin + '/jwks',
        response_types_supported: ['code'], response_modes_supported: ['query'], subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.pathname === '/jwks') return json(res, { keys: [jwk] });
    if (url.pathname === '/authorize') {
      const params = url.searchParams;
      assert.equal(params.get('response_type'), 'code');
      assert.equal(params.get('client_id'), client);
      assert.equal(params.get('redirect_uri'), appOrigin + '/callback');
      assert.equal(params.get('code_challenge_method'), 'S256');
      assert.match(params.get('code_challenge') || '', /^[A-Za-z0-9_-]{43}$/);
      const code = hex(24);
      codes.set(code, new URLSearchParams(params));
      const callback = new URL(appOrigin + '/callback');
      callback.searchParams.set('code', code); callback.searchParams.set('state', params.get('state'));
      res.writeHead(302, { Location: callback.href }); return res.end();
    }
    if (url.pathname === '/token') {
      assert.equal(req.method, 'POST');
      assert.match(req.headers.authorization || '', /^Basic [A-Za-z0-9+/]+=*$/);
      const [encodedClient, encodedSecret, ...extraCredentials] =
        Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8').split(':');
      assert.equal(extraCredentials.length, 0);
      // OAuth Basic credentials are form-encoded before base64 (RFC 6749 section 2.3.1).
      assert.equal(new URLSearchParams('v=' + encodedClient).get('v'), client);
      assert.equal(new URLSearchParams('v=' + encodedSecret).get('v'), secret);
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = new URLSearchParams(raw), request = codes.get(body.get('code'));
      assert.ok(request); codes.delete(body.get('code'));
      assert.equal(body.get('redirect_uri'), appOrigin + '/callback');
      assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), request.get('code_challenge'));
      activity.exchanges += 1;
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ iss: f.origin, sub: subject, aud: client, nonce: request.get('nonce'), iat: now, exp: now + 300 })
        .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' }).sign(pair.privateKey);
      return json(res, { access_token: hex(24), id_token: token, token_type: 'Bearer', expires_in: 300 });
    }
    return json(res, { error: 'not_found' }, 404);
  }
  f = await fixture(t, { applicationOrigin: appOrigin, otherHandler: oidc });
  const membersFile = join(f.directory, 'members.private.json');
  await writeFile(membersFile, JSON.stringify({ version: 1, members: [{ issuer: f.origin, subject, seat, status: 'enabled' }] }), { mode: 0o600 });
  const app = buildApp({
    env: {
      NODE_ENV: 'production', OIDC_ISSUER_BASE_URL: f.origin, OIDC_CLIENT_ID: client, OIDC_CLIENT_SECRET: secret,
      PALACO_BASE_URL: appOrigin, PALACO_SESSION_SECRET: hex(32), PALACO_MEMBERS_FILE: membersFile,
    },
    authSafetyEvaluator: f.provider.evaluate,
    authSafetyAssertCurrent: options.asyncAssert ? async decision => f.provider.assertCurrent(decision) : f.provider.assertCurrent,
    authSafetyNow: () => f.state.clock,
    registryLoader: async () => {
      const members = JSON.parse(await readFile(membersFile, 'utf8'));
      if (activity.armed && ++activity.registryReads === 2 && options.onFinalRegistry) await options.onFinalRegistry(f);
      return members;
    },
  });
  appServer.on('request', app);
  t.after(async () => { app.locals.authSafetyApproval.close(); app.locals.novaReception.close(); await close(appServer); });
  const cookies = new Map();
  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (cookies.size) headers.set('Cookie', [...cookies].map(([key, value]) => key + '=' + value).join('; '));
    const response = await fetch(new URL(path, appOrigin), { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0], split = pair.indexOf('='), name = pair.slice(0, split), value = pair.slice(split + 1);
      if (!value || /Max-Age=0(?:;|$)/i.test(raw)) cookies.delete(name); else cookies.set(name, value);
    }
    return response;
  }
  async function authorize() {
    const login = await request('/login?seat=' + seat);
    assert.equal(login.status, 302, await login.clone().text());
    const target = new URL(login.headers.get('location'));
    assert.equal(target.origin, f.origin);
    const response = await fetch(target, { redirect: 'manual' });
    assert.equal(response.status, 302);
    return response.headers.get('location');
  }
  return { f, app, appOrigin, activity, cookies, request, authorize, seat };
}

test('paired signed HTTPS provider performs a real PKCE and RS256 OIDC login without granting operational authority', async t => {
  const s = await sdkFixture(t);
  const callback = await s.authorize();
  const login = await s.request(callback);
  assert.equal(login.status, 302, await login.clone().text());
  assert.equal(s.activity.exchanges, 1);
  assert.ok(s.cookies.get('__Host-palacoSession'));
  const me = await s.request('/api/me');
  assert.equal(me.status, 200, await me.clone().text());
  assert.deepEqual(await me.json(), {
    seat: s.seat, access: 'personal-workspace-read-only', governanceAuthority: false, mergeAuthority: false, releaseAuthority: false, executionAuthority: false,
  });
  const phases = new Set(s.f.state.requests.filter(entry => entry.path === '/decision').map(entry => entry.request.context.phase));
  for (const phase of ['READINESS', 'BEGIN', 'CALLBACK', 'COMPLETE', 'SESSION']) assert.ok(phases.has(phase));
});

test('changed private enrollment during the final real callback registry await cannot admit a session', async t => {
  const s = await sdkFixture(t, { onFinalRegistry: async f => { f.configuration.revision = 'revision-2'; await f.save(); } });
  const callback = await s.authorize();
  s.activity.armed = true;
  const response = await s.request(callback);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'SAFETY_APPROVAL_REQUIRED' });
  assert.equal(s.activity.exchanges, 1);
  assert.equal(s.cookies.has('__Host-palacoSession'), false);
});

test('changed private enrollment during the final real session registry await cannot reveal private metadata', async t => {
  const s = await sdkFixture(t, { onFinalRegistry: async f => { f.configuration.revokedEnrollmentIds.push(f.issuer('ACCESS_POLICY').enrollmentId); await f.save(); } });
  assert.equal((await s.request(await s.authorize())).status, 302);
  s.activity.armed = true;
  const response = await s.request('/api/me');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'SAFETY_APPROVAL_REQUIRED' });
  const status = await (await s.request('/api/auth/status')).json();
  assert.equal(status.authenticated, false);
  assert.equal(status.available, false);
  assert.equal(status.securityApproval.outcome, 'HOLD');
  assert.equal(Object.hasOwn(status, 'seat'), false);
});

test('enrollment changed while real SDK discovery awaited prevents authorization redirect', async t => {
  const s = await sdkFixture(t, { onDiscovery: async f => { f.configuration.revision = 'revision-2'; await f.save(); } });
  s.activity.discoveryArmed = true;
  const response = await s.request('/login?seat=' + s.seat);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'SAFETY_APPROVAL_REQUIRED' });
  assert.equal(response.headers.get('location'), null);
  assert.equal(s.activity.exchanges, 0);
  assert.equal(s.cookies.has('__Host-palacoSession'), false);
});

test('an asynchronous metadata assertion hook cannot authorize even with genuine signed transport evidence', async t => {
  const s = await sdkFixture(t, { asyncAssert: true });
  const response = await s.request('/login?seat=' + s.seat);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'SAFETY_APPROVAL_REQUIRED' });
  assert.equal(s.activity.exchanges, 0);
});

test('final SDK redirect dispatch cannot outlive its signed lease or changed private enrollment', async t => {
  for (const fault of ['lease-expiry', 'trust-change']) {
    const tls = { key: await readFile(process.env.PALACO_TEST_TLS_KEY_FILE), cert: await readFile(process.env.PALACO_TEST_TLS_CERT_FILE) };
    const server = createServer(tls);
    const origin = await listen(server);
    const f = await fixture(t, { applicationOrigin: origin });
    let sdkCalls = 0;
    const app = buildApp({
      env: {
        NODE_ENV: 'production', OIDC_ISSUER_BASE_URL: 'https://identity.example.invalid',
        OIDC_CLIENT_ID: 'controlled-final-dispatch-client', OIDC_CLIENT_SECRET: 'controlled-final-dispatch-secret',
        PALACO_BASE_URL: origin, PALACO_SESSION_SECRET: hex(32), PALACO_MEMBERS_FILE: join(f.directory, 'members.private.json'),
      },
      authSafetyEvaluator: f.provider.evaluate, authSafetyAssertCurrent: f.provider.assertCurrent,
      authSafetyNow: () => f.state.clock,
      registryLoader: async () => ({ version: 1, members: [] }),
      authMiddleware: (req, res, next) => {
        sdkCalls += 1;
        req.oidc = { isAuthenticated: () => false };
        res.oidc = {
          login: async () => {
            // Genuine BEGIN signatures have passed. Model the asynchronous work before final SDK dispatch.
            await new Promise(resolve => setImmediate(resolve));
            if (fault === 'lease-expiry') f.state.clock += 4500;
            else { f.configuration.revision = 'revision-2'; await f.save(); }
            return res.redirect(302, f.origin + '/authorize');
          },
        };
        next();
      },
    });
    server.on('request', app);
    t.after(async () => { app.locals.authSafetyApproval.close(); app.locals.novaReception.close(); await close(server); });
    const response = await fetch(origin + '/login?seat=PALACO-AMB-01', { redirect: 'manual' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('location'), null);
    assert.deepEqual(await response.json(), { error: 'SAFETY_APPROVAL_REQUIRED' });
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.some(cookie => cookie.startsWith('__Host-palacoAuthSafety=; Max-Age=0')));
    const initial = cookies.find(cookie => /^__Host-palacoAuthSafety=[a-f0-9]{64};/.test(cookie));
    assert.ok(initial);
    assert.equal(sdkCalls, 1);
    if (fault === 'trust-change') { f.configuration.revision = 'revision-1'; await f.save(); }
    const replay = await fetch(origin + '/callback?code=never-issued&state=never-issued', {
      headers: { Cookie: initial.split(';')[0] }, redirect: 'manual',
    });
    assert.equal(replay.status, 503);
    assert.equal(sdkCalls, 1, 'Discarded pending flow must not re-enter identity middleware');
  }
});
