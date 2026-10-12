import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const POLICY = 'PALACO-AUTH-SAFETY-1';
const DOMAIN = 'PALACO/AUTH-SAFETY/SIGNED-PROOF/v0.1\0';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const SHORT_ID = /^[a-f0-9]{32}$/;
const SEAT = /^PALACO-AMB-(?:0[1-9]|1[0-2])$/;
const ROLES = Object.freeze(['SERVICE_READINESS', 'CONTEXT_BINDING', 'ACCESS_POLICY',
  'ABUSE_RISK', 'PRINCIPAL_BINDING', 'DECISION', 'REVOCATION']);
const CONTEXT_KEYS = ['schemaVersion', 'requestId', 'action', 'phase', 'seat',
  'flowId', 'sessionBinding', 'principalBinding'];
const PROOF_KEYS = ['schemaVersion', 'classification', 'id', 'issuerId', 'kind',
  'control', 'action', 'phase', 'requestDigest', 'policyVersion', 'enrollmentEpoch',
  'trustRevision', 'result', 'proofSetDigest', 'issuedAt', 'expiresAt'];
const REVOCATION_KEYS = [...PROOF_KEYS, 'decisionId', 'challenge', 'observedAt',
  'revokedEnrollmentIds', 'revokedDecisionIds'];
const MAX_CONFIG_BYTES = 65536;
const MAX_RESPONSE_BYTES = 32768;

function unavailable() {
  return Object.assign(new Error('SAFETY_APPROVAL_REQUIRED'), {
    status: 503, safeCode: 'SAFETY_APPROVAL_REQUIRED',
  });
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  throw unavailable();
}
export function authSafetyDigest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function authSafetySigningBytes(body) {
  return Buffer.from(DOMAIN + canonical(body), 'utf8');
}
function byteDigest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function token(value) { return typeof value === 'string' && ID.test(value); }
function stamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}
function window(value, time, maximum = Infinity) {
  const issuedAt = stamp(value?.issuedAt), expiresAt = stamp(value?.expiresAt);
  return Number.isFinite(issuedAt) && Number.isFinite(expiresAt)
    && issuedAt <= time && time < expiresAt && issuedAt < expiresAt
    && expiresAt - issuedAt <= maximum;
}
function list(value) {
  return Array.isArray(value) && value.length <= 256 && value.every(token)
    && new Set(value).size === value.length;
}
function within(root, filename) {
  const path = relative(root, filename);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
}
function httpsOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw unavailable(); }
  if (typeof value !== 'string' || url.protocol !== 'https:' || url.origin !== value
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw unavailable();
  return url.origin;
}
function httpsEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw unavailable(); }
  if (typeof value !== 'string' || value.length > 2048 || url.protocol !== 'https:'
      || url.username || url.password || url.search || url.hash || url.href !== value) throw unavailable();
  return url;
}
function requiredControls(context) {
  if (['login', 'signup'].includes(context.action)
      && ['READINESS', 'BEGIN', 'CALLBACK', 'COMPLETE'].includes(context.phase)) {
    if (context.phase === 'READINESS') return ['SERVICE_READINESS', 'ACCESS_POLICY'];
    const controls = ['CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK'];
    return context.phase === 'COMPLETE' ? [...controls, 'PRINCIPAL_BINDING'] : controls;
  }
  if (context.action === 'session' && context.phase === 'SESSION') {
    return ['CONTEXT_BINDING', 'ACCESS_POLICY', 'ABUSE_RISK', 'PRINCIPAL_BINDING'];
  }
  throw unavailable();
}
function contextValid(context) {
  if (!exact(context, CONTEXT_KEYS) || context.schemaVersion !== 'palaco-auth-safety-context/0.1'
      || typeof context.requestId !== 'string' || !SHORT_ID.test(context.requestId)) return false;
  try { requiredControls(context); } catch { return false; }
  if (context.phase === 'READINESS') {
    return context.seat === null && context.flowId === null
      && context.sessionBinding === null && context.principalBinding === null;
  }
  if (typeof context.seat !== 'string' || !SEAT.test(context.seat)
      || typeof context.sessionBinding !== 'string' || !HASH.test(context.sessionBinding)) return false;
  if (context.phase === 'SESSION') {
    return context.flowId === null && typeof context.principalBinding === 'string' && HASH.test(context.principalBinding);
  }
  if (typeof context.flowId !== 'string' || !SHORT_ID.test(context.flowId)) return false;
  return context.phase === 'COMPLETE'
    ? typeof context.principalBinding === 'string' && HASH.test(context.principalBinding)
    : context.principalBinding === null;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function makeProvider({ configurationFile, repositoryRoot, applicationOrigin, now = Date.now } = {}, classification) {
  if (typeof now !== 'function' || typeof configurationFile !== 'string'
      || !isAbsolute(configurationFile) || typeof repositoryRoot !== 'string'
      || !isAbsolute(repositoryRoot)) throw new TypeError('AUTH_SAFETY_PRIVATE_CONFIGURATION_REQUIRED');
  const expectedOrigin = httpsOrigin(applicationOrigin);
  const root = realpathSync(repositoryRoot);
  const filename = resolve(configurationFile);
  if (within(root, filename)) throw new TypeError('AUTH_SAFETY_PRIVATE_CONFIGURATION_REQUIRED');
  const tickets = new WeakMap();
  const active = new Set();
  let closed = false;
  let lastTime = -Infinity;
  function clock() {
    if (closed || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw unavailable();
    const time = now();
    if (!Number.isFinite(time) || Math.abs(time) > 8640000000000000 || time < lastTime) throw unavailable();
    lastTime = time;
    return time;
  }
  function readConfiguration(time) {
    // Resolve and bound a dedicated private regular file on every check. Its bytes,
    // not an HTTP field or cached allow flag, form the current trust revision.
    if (lstatSync(filename).isSymbolicLink()) throw unavailable();
    const resolved = realpathSync(filename);
    if (within(root, resolved)) throw unavailable();
    const info = statSync(resolved);
    if (!info.isFile() || info.size < 1 || info.size > MAX_CONFIG_BYTES
        || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw unavailable();
    const bytes = readFileSync(resolved);
    if (bytes.length > MAX_CONFIG_BYTES) throw unavailable();
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const keys = ['schemaVersion', 'classification', 'revision', 'applicationOrigin',
      'decisionEndpoint', 'revocationEndpoint', 'policyVersion', 'enrollmentEpoch',
      'authorizationToken', 'issuedAt', 'expiresAt', 'enrollments',
      'revokedEnrollmentIds', 'revokedDecisionIds'];
    if (!exact(data, keys) || data.schemaVersion !== 'palaco-auth-safety-provider/0.1'
        || data.classification !== classification || !token(data.revision)
        || data.applicationOrigin !== expectedOrigin || data.policyVersion !== POLICY
        || !token(data.enrollmentEpoch) || !window(data, time)
        || typeof data.authorizationToken !== 'string'
        || !/^[A-Za-z0-9._~+/=-]{16,2048}$/.test(data.authorizationToken)
        || !list(data.revokedEnrollmentIds) || !list(data.revokedDecisionIds)
        || !Array.isArray(data.enrollments) || data.enrollments.length !== ROLES.length) throw unavailable();
    const decisionEndpoint = httpsEndpoint(data.decisionEndpoint);
    const revocationEndpoint = httpsEndpoint(data.revocationEndpoint);
    if (decisionEndpoint.origin !== revocationEndpoint.origin
        || decisionEndpoint.href === revocationEndpoint.href) throw unavailable();
    const byRole = new Map(), byId = new Map(), enrollmentIds = new Set(), fingerprints = new Set();
    for (const record of data.enrollments) {
      if (!exact(record, ['id', 'role', 'publicKeyPem', 'status', 'enrollmentId',
        'provenanceRef', 'issuedAt', 'expiresAt'])
          || !token(record.id) || !ROLES.includes(record.role) || record.status !== 'ACTIVE'
          || !token(record.enrollmentId) || typeof record.provenanceRef !== 'string'
          || !record.provenanceRef.trim() || record.provenanceRef !== record.provenanceRef.trim()
          || record.provenanceRef.length > 256 || /[\u0000-\u001f\u007f]/.test(record.provenanceRef)
          || !window(record, time) || data.revokedEnrollmentIds.includes(record.enrollmentId)
          || typeof record.publicKeyPem !== 'string' || record.publicKeyPem.length > 4096
          || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(record.publicKeyPem)
          || byRole.has(record.role) || byId.has(record.id) || enrollmentIds.has(record.enrollmentId)) throw unavailable();
      const key = createPublicKey(record.publicKeyPem);
      if (key.asymmetricKeyType !== 'ed25519') throw unavailable();
      const fingerprint = byteDigest(key.export({ type: 'spki', format: 'der' }));
      if (fingerprints.has(fingerprint)) throw unavailable();
      fingerprints.add(fingerprint); enrollmentIds.add(record.enrollmentId);
      byRole.set(record.role, { record, key }); byId.set(record.id, { record, key });
    }
    if (ROLES.some(role => !byRole.has(role))) throw unavailable();
    return { data, digest: byteDigest(bytes), byRole, byId };
  }
  function sameConfiguration(original, time) {
    const current = readConfiguration(time);
    if (current.digest !== original.digest) throw unavailable();
    return current;
  }
  async function post(endpoint, body, configuration, controller) {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'Accept-Encoding': 'identity', 'Authorization': 'Bearer ' + configuration.data.authorizationToken,
      },
      body: canonical(body),
    });
    if (response.status !== 200
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') || '')
        || !['', 'identity'].includes((response.headers.get('content-encoding') || '').toLowerCase())) throw unavailable();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw unavailable();
    if (!response.body) throw unavailable();
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw unavailable();
        chunks.push(Buffer.from(part.value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  }
  function signedProof(envelope, { configuration, context, requestDigest, time, role, kind,
    result, proofSetDigest = null, extra }) {
    if (!exact(envelope, ['algorithm', 'body', 'signature'])
        || envelope.algorithm !== 'Ed25519' || typeof envelope.signature !== 'string'
        || !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)) throw unavailable();
    const body = envelope.body;
    const keys = kind === 'REVOCATION' ? REVOCATION_KEYS : PROOF_KEYS;
    if (!exact(body, keys) || body.schemaVersion !== 'palaco-auth-safety-proof/0.1'
        || body.classification !== classification || !token(body.id) || !token(body.issuerId)
        || body.kind !== kind || body.control !== (kind === 'CONTROL' ? role : null)
        || body.action !== context.action || body.phase !== context.phase
        || body.requestDigest !== requestDigest || body.policyVersion !== POLICY
        || body.enrollmentEpoch !== configuration.data.enrollmentEpoch
        || body.trustRevision !== configuration.data.revision || body.result !== result
        || body.proofSetDigest !== proofSetDigest
        || !window(body, time, kind === 'REVOCATION' ? 5000 : 30000)
        || configuration.data.revokedDecisionIds.includes(body.id)) throw unavailable();
    const assignment = configuration.byRole.get(role);
    if (!assignment || assignment.record.id !== body.issuerId
        || stamp(body.issuedAt) < stamp(assignment.record.issuedAt)
        || stamp(body.expiresAt) > stamp(assignment.record.expiresAt)
        || stamp(body.issuedAt) < stamp(configuration.data.issuedAt)
        || stamp(body.expiresAt) > stamp(configuration.data.expiresAt)) throw unavailable();
    if (kind === 'REVOCATION') {
      if (body.decisionId !== extra.decisionId || body.challenge !== extra.challenge
          || body.observedAt !== body.issuedAt || time - stamp(body.observedAt) > 5000
          || !list(body.revokedEnrollmentIds) || !list(body.revokedDecisionIds)) throw unavailable();
    }
    const signature = Buffer.from(envelope.signature, 'base64url');
    if (signature.length !== 64 || signature.toString('base64url') !== envelope.signature
        || !verify(null, authSafetySigningBytes(body), assignment.key, signature)) throw unavailable();
    return body;
  }
  async function evaluate(contextInput) {
    const controller = new AbortController();
    let timeout;
    if (active.size >= 32) throw unavailable();
    active.add(controller);
    timeout = setTimeout(() => controller.abort(), 3000);
    timeout.unref();
    try {
      const began = clock();
      if (!contextValid(contextInput)) throw unavailable();
      const context = freeze(JSON.parse(canonical(contextInput)));
      const configuration = readConfiguration(began);
      const request = {
        schemaVersion: 'palaco-auth-safety-request/0.1', audience: expectedOrigin,
        policyVersion: POLICY, enrollmentEpoch: configuration.data.enrollmentEpoch,
        trustRevision: configuration.data.revision, context, challenge: randomBytes(32).toString('hex'),
      };
      const requestDigest = authSafetyDigest(request);
      const response = await post(configuration.data.decisionEndpoint, request, configuration, controller);
      const afterDecision = clock();
      sameConfiguration(configuration, afterDecision);
      if (controller.signal.aborted || afterDecision - began >= 3000
          || !exact(response, ['schemaVersion', 'controls', 'decision'])
          || response.schemaVersion !== 'palaco-auth-safety-response/0.1'
          || !Array.isArray(response.controls)) throw unavailable();
      const required = requiredControls(context);
      if (response.controls.length !== required.length) throw unavailable();
      const controls = [], ids = new Set();
      const usedEnrollments = new Set();
      for (const role of required) {
        const matches = response.controls.filter(envelope => envelope?.body?.control === role);
        if (matches.length !== 1) throw unavailable();
        const body = signedProof(matches[0], {
          configuration, context, requestDigest, time: afterDecision, role, kind: 'CONTROL', result: 'PASS',
        });
        if (ids.has(body.id)) throw unavailable();
        ids.add(body.id); usedEnrollments.add(configuration.byRole.get(role).record.enrollmentId);
        controls.push(matches[0]);
      }
      controls.sort((a, b) => a.body.control < b.body.control ? -1 : a.body.control > b.body.control ? 1 : 0);
      const proofSetDigest = authSafetyDigest(controls);
      const decisionBody = signedProof(response.decision, {
        configuration, context, requestDigest, time: afterDecision,
        role: 'DECISION', kind: 'DECISION', result: 'APPROVED', proofSetDigest,
      });
      if (ids.has(decisionBody.id)
          || stamp(decisionBody.issuedAt) < Math.max(...controls.map(item => stamp(item.body.issuedAt)))) throw unavailable();
      ids.add(decisionBody.id); usedEnrollments.add(configuration.byRole.get('DECISION').record.enrollmentId);
      // A separate, unpredictable challenge is created only after every required
      // control and the policy-bound aggregate decision have been authenticated.
      const revocationRequest = {
        schemaVersion: 'palaco-auth-revocation-request/0.1', audience: expectedOrigin,
        policyVersion: POLICY, enrollmentEpoch: configuration.data.enrollmentEpoch,
        trustRevision: configuration.data.revision, requestDigest, decisionId: decisionBody.id,
        proofSetDigest, challenge: randomBytes(32).toString('hex'),
      };
      const revocationResponse = await post(configuration.data.revocationEndpoint,
        revocationRequest, configuration, controller);
      const finished = clock();
      sameConfiguration(configuration, finished);
      if (controller.signal.aborted || finished - began >= 3000
          || !exact(revocationResponse, ['schemaVersion', 'revocation'])
          || revocationResponse.schemaVersion !== 'palaco-auth-revocation-response/0.1') throw unavailable();
      const witness = signedProof(revocationResponse.revocation, {
        configuration, context, requestDigest, time: finished,
        role: 'REVOCATION', kind: 'REVOCATION', result: 'CURRENT',
        proofSetDigest, extra: { decisionId: decisionBody.id, challenge: revocationRequest.challenge },
      });
      if (ids.has(witness.id) || stamp(witness.observedAt) < stamp(decisionBody.issuedAt)) throw unavailable();
      usedEnrollments.add(configuration.byRole.get('REVOCATION').record.enrollmentId);
      if ([...usedEnrollments].some(id => witness.revokedEnrollmentIds.includes(id))
          || [...ids, witness.id].some(id => witness.revokedDecisionIds.includes(id))) throw unavailable();
      const issuedAt = Math.max(...[...controls.map(item => item.body), decisionBody, witness].map(item => stamp(item.issuedAt)));
      const expiresAt = Math.min(stamp(configuration.data.expiresAt),
        ...configuration.data.enrollments.map(record => stamp(record.expiresAt)),
        ...[...controls.map(item => item.body), decisionBody, witness].map(item => stamp(item.expiresAt)));
      if (finished >= expiresAt) throw unavailable();
      const decision = freeze({
        schemaVersion: 'palaco-auth-safety-decision/0.1', outcome: 'APPROVED',
        context, issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
      });
      tickets.set(decision, { configuration, expiresAt, witnessIssuedAt: stamp(witness.issuedAt) });
      assertCurrent(decision);
      return decision;
    } catch { throw unavailable(); }
    finally {
      clearTimeout(timeout); active.delete(controller); controller.abort();
    }
  }
  function assertCurrent(decision) {
    const ticket = tickets.get(decision);
    const current = clock();
    if (!ticket || current >= ticket.expiresAt || current - ticket.witnessIssuedAt > 5000) throw unavailable();
    sameConfiguration(ticket.configuration, current);
    return true;
  }
  // Wiring requires an already complete private enrollment snapshot. Missing,
  // inactive or fixture configuration is closed before any SDK route is mounted.
  try { readConfiguration(clock()); } catch { throw unavailable(); }
  return Object.freeze({
    evaluate, assertCurrent,
    close() { closed = true; for (const controller of active) controller.abort(); active.clear(); },
  });
}

/** Normal runtime never accepts fixture classifications or enrolls any signer. */
export function createAuthSafetyProvider(options) {
  return makeProvider(options, 'PRODUCTION');
}
/** Explicit internal HTTPS/crypto harness; normal startup never calls this factory. */
export function createControlledAuthSafetyProvider(options) {
  return makeProvider(options, 'TEST_ONLY');
}
