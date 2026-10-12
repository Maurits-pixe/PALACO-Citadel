import { createHash, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const CONTEXT_VERSION = 'palaco-auth-safety-context/0.1';
const DECISION_VERSION = 'palaco-auth-safety-decision/0.1';
const SEAT = /^PALACO-AMB-(?:0[1-9]|1[0-2])$/;
const CAPABILITY = /^[a-f0-9]{64}$/;
const FLOW_ID = /^[a-f0-9]{32}$/;
const MAX_FLOWS = 128;
const FLOW_TTL = 300000;
const APPROVAL_TTL = 60000;
const contextKeys = ['schemaVersion', 'requestId', 'action', 'phase', 'seat',
  'flowId', 'sessionBinding', 'principalBinding'];

function error() {
  return Object.assign(new Error('SAFETY_APPROVAL_REQUIRED'), {
    status: 503, safeCode: 'SAFETY_APPROVAL_REQUIRED',
  });
}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function stamp(value) {
  if (typeof value !== 'string') return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}
function principalBinding(claims) {
  if (!claims || typeof claims.iss !== 'string' || !claims.iss
      || typeof claims.sub !== 'string' || !claims.sub) throw error();
  return digest(JSON.stringify([claims.iss, claims.sub]));
}
function cookie(req, name) {
  const value = req.headers?.cookie;
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 8192) throw error();
  const matches = value.split(';').map(part => part.trim()).filter(part =>
    part.slice(0, part.indexOf('=') < 0 ? part.length : part.indexOf('=')).trim() === name);
  if (!matches.length) return null;
  if (matches.length !== 1 || !matches[0].startsWith(name + '=')) throw error();
  return matches[0].slice(name.length + 1);
}

export function closedSecurityApproval() {
  return {
    required: true, available: false, outcome: 'HOLD',
    reason: 'TRUSTED_SAFETY_APPROVAL_MISSING', loginAllowed: false, signupAllowed: false,
  };
}

/**
 * The public process has no approval provider. evaluate is an explicit trusted-code
 * dependency for controlled tests or a future independently connected verifier.
 * No environment switch, client assertion, checkbox, key or PASS is consulted.
 */
export function createAuthSecurityApproval({
  evaluate, baseURL, secure = true, now = Date.now,
  sessionCookieName = secure ? '__Host-palacoSession' : 'palacoSession',
  allowSyntheticSessions = false,
} = {}) {
  if ((evaluate !== undefined && typeof evaluate !== 'function')
      || typeof now !== 'function' || typeof secure !== 'boolean'
      || typeof allowSyntheticSessions !== 'boolean'
      || typeof sessionCookieName !== 'string' || !sessionCookieName) {
    throw new TypeError('AUTH_SAFETY_TRUSTED_DEPENDENCY_REQUIRED');
  }
  let base;
  try { base = new URL(baseURL); } catch { throw new TypeError('AUTH_SAFETY_ORIGIN_REQUIRED'); }
  if (base.origin !== baseURL || base.username || base.password
      || base.pathname !== '/' || base.search || base.hash
      || (base.protocol !== 'https:' && !(base.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && !secure))) {
    throw new TypeError('AUTH_SAFETY_ORIGIN_REQUIRED');
  }
  const anchor = now(), monotonicAnchor = performance.now();
  if (!Number.isFinite(anchor) || Math.abs(anchor) > 8640000000000000) {
    throw new TypeError('AUTH_SAFETY_CLOCK_REQUIRED');
  }
  let lastTime = anchor;
  let closed = false;
  const flows = new Map();
  const readinessTickets = new WeakMap();
  const beginnings = new WeakMap();
  const callbacks = new WeakMap();
  const flowCookie = secure ? '__Host-palacoAuthSafety' : 'palacoAuthSafety';
  const attributes = '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
  function clock() {
    if (closed) throw error();
    const value = now === Date.now ? anchor + Math.floor(performance.now() - monotonicAnchor) : now();
    if (!Number.isFinite(value) || Math.abs(value) > 8640000000000000) throw error();
    lastTime = Math.max(lastTime, value);
    return lastTime;
  }
  function cleanup(time) {
    for (const [capability, flow] of flows) {
      if (time >= flow.expiresAt) flows.delete(capability);
    }
  }
  function clearCookie(res) {
    res.append('Set-Cookie', flowCookie + '=; Max-Age=0' + attributes);
  }
  function context({ action, phase, seat = null, flowId = null,
    sessionBinding = null, principalBinding = null }) {
    return Object.freeze({
      schemaVersion: CONTEXT_VERSION, requestId: randomBytes(16).toString('hex'),
      action, phase, seat, flowId, sessionBinding, principalBinding,
    });
  }
  async function approve(binding) {
    if (!evaluate) throw error();
    const began = clock();
    let decision;
    let timeout;
    try {
      decision = await Promise.race([
        Promise.resolve().then(() => evaluate(binding)),
        new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(error()), 5000);
          timeout.unref();
        }),
      ]);
    } catch {
      throw error();
    } finally {
      clearTimeout(timeout);
    }
    const time = clock();
    cleanup(time);
    if (time < began || !exact(decision, ['schemaVersion', 'outcome', 'context', 'issuedAt', 'expiresAt'])
        || decision.schemaVersion !== DECISION_VERSION || decision.outcome !== 'APPROVED'
        || !exact(decision.context, contextKeys)
        || contextKeys.some(key => decision.context[key] !== binding[key])) throw error();
    const issuedAt = stamp(decision.issuedAt), expiresAt = stamp(decision.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
        || issuedAt > time || time >= expiresAt || issuedAt >= expiresAt
        || expiresAt - issuedAt > APPROVAL_TTL) throw error();
    return { time, expiresAt };
  }
  function currentFlow(capability, flow, state, time) {
    return flows.get(capability) === flow && flow.state === state
      && time < flow.expiresAt;
  }
  async function readiness() {
    if (!evaluate) return closedSecurityApproval();
    try {
      const login = await approve(context({ action: 'login', phase: 'READINESS' }));
      const signup = await approve(context({ action: 'signup', phase: 'READINESS' }));
      const current = clock();
      if (current >= login.expiresAt || current >= signup.expiresAt) throw error();
      const result = Object.freeze({
        required: true, available: true, outcome: 'APPROVED',
        reason: null, loginAllowed: true, signupAllowed: true,
      });
      readinessTickets.set(result, { loginExpiresAt: login.expiresAt, signupExpiresAt: signup.expiresAt });
      return result;
    } catch { return closedSecurityApproval(); }
  }
  function assertReadiness(result) {
    const ticket = readinessTickets.get(result);
    const current = clock();
    if (!ticket || current >= ticket.loginExpiresAt || current >= ticket.signupExpiresAt) throw error();
    return true;
  }
  async function begin(req, res, action, seat) {
    if (!['login', 'signup'].includes(action) || typeof seat !== 'string' || !SEAT.test(seat)) throw error();
    const time = clock();
    cleanup(time);
    const previous = cookie(req, flowCookie);
    if (previous !== null) {
      if (!CAPABILITY.test(previous)) throw error();
      flows.delete(previous);
    }
    if (!evaluate || flows.size >= MAX_FLOWS) throw error();
    const capability = randomBytes(32).toString('hex');
    const flow = {
      flowId: randomBytes(16).toString('hex'), action, seat,
      sessionBinding: digest(capability), expiresAt: time + FLOW_TTL, state: 'PREPARING',
    };
    flows.set(capability, flow);
    try {
      const approval = await approve(context({
        action, phase: 'BEGIN', seat, flowId: flow.flowId, sessionBinding: flow.sessionBinding,
      }));
      const current = clock();
      cleanup(current);
      if (!currentFlow(capability, flow, 'PREPARING', current) || current >= approval.expiresAt) throw error();
      flow.state = 'PENDING';
      flow.beginApprovalExpiresAt = approval.expiresAt;
      beginnings.set(req, { capability, flow });
      res.append('Set-Cookie', flowCookie + '=' + capability
        + '; Max-Age=' + Math.max(1, Math.ceil((flow.expiresAt - current) / 1000)) + attributes);
      return flow.flowId;
    } catch (failure) {
      flows.delete(capability);
      throw error();
    }
  }
  function loginState(req, options) {
    const beginning = beginnings.get(req);
    const time = clock();
    cleanup(time);
    if (!beginning || !currentFlow(beginning.capability, beginning.flow, 'PENDING', time)
        || time >= beginning.flow.beginApprovalExpiresAt
        || options?.returnTo !== '/toegang.html?seat=' + beginning.flow.seat) throw error();
    return {
      returnTo: '/toegang.html?seat=' + beginning.flow.seat,
      authSafetyFlowId: beginning.flow.flowId,
    };
  }
  async function beforeCallback(req, res) {
    if (req.method !== 'GET') throw error();
    const time = clock();
    cleanup(time);
    const capability = cookie(req, flowCookie);
    const flow = capability && CAPABILITY.test(capability) ? flows.get(capability) : null;
    if (!evaluate || !flow || !currentFlow(capability, flow, 'PENDING', time)) throw error();
    // Reserve this single-use flow synchronously before awaiting the trusted checker.
    flow.state = 'PROCESSING';
    clearCookie(res);
    const discard = () => flows.delete(capability);
    res.once('finish', discard);
    res.once('close', discard);
    try {
      const approval = await approve(context({
        action: flow.action, phase: 'CALLBACK', seat: flow.seat,
        flowId: flow.flowId, sessionBinding: flow.sessionBinding,
      }));
      const current = clock();
      cleanup(current);
      if (!currentFlow(capability, flow, 'PROCESSING', current) || current >= approval.expiresAt) throw error();
      callbacks.set(req, { capability, flow });
    } catch {
      discard();
      throw error();
    }
  }
  async function complete(req, res, { decodedState, claims, seat }) {
    const entry = callbacks.get(req);
    const time = clock();
    cleanup(time);
    if (!entry || !currentFlow(entry.capability, entry.flow, 'PROCESSING', time)
        || seat !== entry.flow.seat || !FLOW_ID.test(decodedState?.authSafetyFlowId || '')
        || decodedState.authSafetyFlowId !== entry.flow.flowId
        || decodedState.returnTo !== '/toegang.html?seat=' + entry.flow.seat) throw error();
    const principal = principalBinding(claims);
    const approval = await approve(context({
      action: entry.flow.action, phase: 'COMPLETE', seat,
      flowId: entry.flow.flowId, sessionBinding: entry.flow.sessionBinding, principalBinding: principal,
    }));
    let consumed = false;
    // The caller redeems this private ticket only after its final asynchronous
    // membership read. Consumption and admission then share a synchronous check.
    return function commitAuthentication() {
      const current = clock();
      cleanup(current);
      if (consumed || !currentFlow(entry.capability, entry.flow, 'PROCESSING', current)
          || current >= approval.expiresAt || principalBinding(claims) !== principal) throw error();
      consumed = true;
      flows.delete(entry.capability);
      callbacks.delete(req);
      return true;
    };
  }
  async function approveSession(req, seat, claims) {
    if (typeof seat !== 'string' || !SEAT.test(seat)
        || !req.oidc?.isAuthenticated()) throw error();
    const principal = principalBinding(claims);
    const sessionCookie = cookie(req, sessionCookieName);
    if ((!sessionCookie || sessionCookie.length > 2048 || !/^[A-Za-z0-9._~-]+$/.test(sessionCookie))
        && !allowSyntheticSessions) throw error();
    const session = sessionCookie ? digest(sessionCookie) : null;
    const approval = await approve(context({
      action: 'session', phase: 'SESSION', seat, sessionBinding: session, principalBinding: principal,
    }));
    let consumed = false;
    return function commitSessionAccess() {
      const current = clock();
      if (consumed || current >= approval.expiresAt || !req.oidc?.isAuthenticated()
          || principalBinding(req.oidc.idTokenClaims) !== principal
          || (sessionCookie ? digest(cookie(req, sessionCookieName) || '') : null) !== session) throw error();
      consumed = true;
      return true;
    };
  }
  async function middleware(req, res, next) {
    const route = /^\/(login|signup|callback)\/*$/i.exec(req.path);
    const privateRoute = /^\/api\/(?:me|seats\/[^/]+)\/*$/i.test(req.path);
    if (!route && !privateRoute) return next();
    try {
      if (!evaluate) throw error();
      if (route?.[1].toLowerCase() === 'callback') await beforeCallback(req, res);
      else if (route) {
        const approval = await approve(context({ action: route[1].toLowerCase(), phase: 'READINESS' }));
        if (clock() >= approval.expiresAt) throw error();
      }
      next();
    } catch (failure) { next(error()); }
  }
  return Object.freeze({
    readiness, assertReadiness, begin, loginState, complete, approveSession, middleware,
    close() { closed = true; flows.clear(); },
  });
}
