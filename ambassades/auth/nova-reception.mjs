import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const mountedApps = new WeakSet();
const TOKEN = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[a-f0-9]{32}$/;
const LIVE = new Set(['RECEIVED', 'AT_RECEPTION', 'FIRST_ACCEPTED', 'ON_HOLD']);
const PREFIX = '/api/rio/nova';

function fail(status, code, retryAfter) {
  return Object.assign(new Error(code), { novaStatus: status, novaCode: code, retryAfter });
}

function exactObject(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function boundedInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError('Invalid NOVA configuration: ' + name);
  }
  return value;
}

function configuration(options) {
  const {
    baseURL = 'https://palaco-ambassades.onrender.com', development = false,
    now = Date.now, sessionTtlMs = 900000, requestTtlMs = 300000,
    maxSessions = 256, maxRequests = 4, creationLimit = 30,
    actionLimit = 60, rateWindowMs = 60000,
  } = options;
  let base;
  try { base = new URL(baseURL); } catch { throw new TypeError('Invalid NOVA configuration: baseURL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (typeof baseURL !== 'string' || typeof development !== 'boolean'
      || base.username || base.password || base.pathname !== '/'
      || baseURL !== base.origin || base.search || base.hash
      || (base.protocol !== 'https:' && !(development && base.protocol === 'http:' && loopback))) {
    throw new TypeError('Invalid NOVA configuration: baseURL');
  }
  if (typeof now !== 'function') throw new TypeError('Invalid NOVA configuration: now');
  return {
    baseURL: base.origin, secure: base.protocol === 'https:', now,
    sessionTtlMs: boundedInteger(sessionTtlMs, 'sessionTtlMs', 900000),
    requestTtlMs: boundedInteger(requestTtlMs, 'requestTtlMs', 300000),
    maxSessions: boundedInteger(maxSessions, 'maxSessions', 256),
    maxRequests: boundedInteger(maxRequests, 'maxRequests', 4),
    creationLimit: boundedInteger(creationLimit, 'creationLimit', 30),
    actionLimit: boundedInteger(actionLimit, 'actionLimit', 60),
    rateWindowMs: boundedInteger(rateWindowMs, 'rateWindowMs', 60000),
  };
}

function cookieValue(req, name) {
  const header = req.headers.cookie;
  if (header === undefined) return null;
  if (typeof header !== 'string' || header.length > 8192) throw fail(400, 'NOVA_INVALID_COOKIE');
  const values = header.split(';').map(part => part.trim()).filter(part => {
    const separator = part.indexOf('=');
    return (separator < 0 ? part : part.slice(0, separator).trim()) === name;
  });
  if (!values.length) return null;
  if (values.length !== 1) throw fail(400, 'NOVA_INVALID_COOKIE');
  if (!values[0].startsWith(name + '=')) throw fail(400, 'NOVA_INVALID_COOKIE');
  const value = values[0].slice(name.length + 1);
  if (!TOKEN.test(value)) throw fail(400, 'NOVA_INVALID_COOKIE');
  return value;
}

function clearReceiptContent(receipt) {
  receipt.text = '';
  receipt.resumeTo = null;
  receipt.firstAcceptance = null;
}

function copyReceipt(receipt) {
  return {
    id: receipt.id, status: receipt.status, text: receipt.text,
    createdAt: new Date(receipt.createdAt).toISOString(),
    expiresAt: new Date(receipt.expiresAt).toISOString(), revision: receipt.revision,
    resumeTo: receipt.resumeTo,
    firstAcceptance: receipt.firstAcceptance ? {
      acceptedAt: new Date(receipt.firstAcceptance.acceptedAt).toISOString(),
      scope: receipt.firstAcceptance.scope, actor: receipt.firstAcceptance.actor,
    } : null,
  };
}

/**
 * A bounded, transient reception desk. Each mounted app has its own state.
 * No recipient connection, accounts, private-room access, or chat is opened here.
 * Returns a shutdown hook for tests or hosts that dispose of an app instance.
 */
export function mountNovaReception(app, options = {}) {
  if (!app || typeof app.use !== 'function' || mountedApps.has(app)) {
    throw new TypeError('NOVA requires an app that has not already mounted its reception.');
  }
  const config = configuration(options);
  const anchor = config.now();
  if (!Number.isFinite(anchor) || Math.abs(anchor) > 8640000000000000) {
    throw new TypeError('Invalid NOVA configuration: now');
  }
  const monotonicAnchor = performance.now();
  let lastTime = anchor;
  function clock() {
    // Production deadlines follow elapsed monotonic time, not wall-clock corrections.
    // Tests can inject a deterministic wall-clock function; backwards movement is clamped.
    const value = config.now === Date.now
      ? anchor + Math.floor(performance.now() - monotonicAnchor) : config.now();
    if (!Number.isFinite(value) || Math.abs(value) > 8640000000000000) {
      throw fail(503, 'NOVA_CLOCK_UNAVAILABLE');
    }
    lastTime = Math.max(lastTime, value);
    return lastTime;
  }
  const sessions = new Map();
  const creations = [];
  const cookieName = config.secure ? '__Host-palacoNova' : 'palacoNova';
  const cookieAttributes = '; Path=/; HttpOnly; SameSite=Strict' + (config.secure ? '; Secure' : '');
  const router = express.Router({ caseSensitive: true, strict: true });
  mountedApps.add(app);

  function destroySession(id, session) {
    for (const receipt of session.requests.values()) clearReceiptContent(receipt);
    session.requests.clear();
    session.keys.clear();
    session.actions.length = 0;
    session.csrf = '';
    sessions.delete(id);
  }
  function cleanup(time) {
    for (const [id, session] of sessions) {
      if (time >= session.expiresAt) {
        destroySession(id, session);
        continue;
      }
      for (const receipt of session.requests.values()) {
        if (LIVE.has(receipt.status) && time >= receipt.expiresAt) {
          receipt.status = 'EXPIRED';
          clearReceiptContent(receipt);
          receipt.revision += 1;
        }
      }
      while (session.actions.length && session.actions[0] <= time - config.rateWindowMs) session.actions.shift();
    }
    while (creations.length && creations[0] <= time - config.rateWindowMs) creations.shift();
  }
  function runtime(time) {
    return {
      component: 'NOVA_RECEPTION', version: '0.2', running: true,
      serverTime: new Date(time).toISOString(), storage: 'volatile-memory',
      sessionTtlSeconds: config.sessionTtlMs / 1000,
      requestTtlSeconds: config.requestTtlMs / 1000,
      maxRequests: config.maxRequests, receptionEnabled: true,
      firstAcceptanceEnabled: true, chatEnabled: false,
    };
  }
  function readSession(req) {
    const id = cookieValue(req, cookieName);
    const session = id ? sessions.get(id) : null;
    if (!session) throw fail(401, 'NOVA_SESSION_REQUIRED');
    return { id, session };
  }
  function setCookie(res, id, expiresAt, time) {
    const seconds = Math.max(1, Math.ceil((expiresAt - time) / 1000));
    res.set('Set-Cookie', cookieName + '=' + id + '; Max-Age=' + seconds + cookieAttributes);
  }
  function clearCookie(res) {
    res.set('Set-Cookie', cookieName + '=; Max-Age=0' + cookieAttributes);
  }
  function requirePrivateRead(req, res, next) {
    const origin = req.get('Origin');
    const site = req.get('Sec-Fetch-Site');
    if ((origin !== undefined && origin !== config.baseURL)
        || (site !== undefined && !['same-origin', 'none'].includes(site))) {
      return next(fail(403, 'NOVA_INVALID_ORIGIN'));
    }
    next();
  }
  function requireWrite(req, res, next) {
    const site = req.get('Sec-Fetch-Site');
    if (req.get('Origin') !== config.baseURL
        || (site !== undefined && !['same-origin', 'none'].includes(site))) {
      return next(fail(403, 'NOVA_INVALID_ORIGIN'));
    }
    const contentType = req.get('Content-Type') || '';
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
      return next(fail(415, 'NOVA_JSON_REQUIRED'));
    }
    next();
  }
  function requireCsrf(req, session) {
    const supplied = req.get('X-NOVA-CSRF');
    if (typeof supplied !== 'string' || !TOKEN.test(supplied)
        || !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(session.csrf, 'hex'))) {
      throw fail(403, 'NOVA_CSRF_REQUIRED');
    }
  }
  function useActionRate(session, time) {
    if (session.actions.length >= config.actionLimit) {
      const retry = Math.max(1, Math.ceil((session.actions[0] + config.rateWindowMs - time) / 1000));
      throw fail(429, 'NOVA_RATE_LIMITED', retry);
    }
    session.actions.push(time);
  }
  function useCreationRate(time) {
    if (creations.length >= config.creationLimit) {
      const retry = Math.max(1, Math.ceil((creations[0] + config.rateWindowMs - time) / 1000));
      throw fail(429, 'NOVA_RATE_LIMITED', retry);
    }
    creations.push(time);
  }
  const json = express.json({ limit: '4kb', strict: true, type: () => true, inflate: false });
  function refreshTime(req, res, next) {
    try {
      res.locals.novaTime = clock();
      cleanup(res.locals.novaTime);
      next();
    } catch (error) { next(error); }
  }
  const parseWrite = [requireWrite, json, refreshTime];
  const protectRead = [requirePrivateRead];

  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store', 'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Vary': 'Origin, Cookie',
    });
    try {
      res.locals.novaTime = clock();
      cleanup(res.locals.novaTime);
      next();
    } catch (error) { next(error); }
  });

  router.get('/runtime', (req, res) => res.json(runtime(res.locals.novaTime)));
  router.post('/session', ...parseWrite, (req, res) => {
    if (!exactObject(req.body, [])) throw fail(400, 'NOVA_INVALID_BODY');
    const time = res.locals.novaTime;
    const oldId = cookieValue(req, cookieName);
    let id = oldId;
    let session = oldId ? sessions.get(oldId) : null;
    if (!session) {
      if (sessions.size >= config.maxSessions) throw fail(503, 'NOVA_CAPACITY_REACHED', 60);
      useCreationRate(time);
      id = randomBytes(32).toString('hex');
      session = {
        csrf: randomBytes(32).toString('hex'), expiresAt: time + config.sessionTtlMs,
        requests: new Map(), keys: new Map(), actions: [],
      };
      sessions.set(id, session);
    } else {
      useActionRate(session, time);
    }
    setCookie(res, id, session.expiresAt, time);
    res.json({
      session: { expiresAt: new Date(session.expiresAt).toISOString(), csrfToken: session.csrf },
      runtime: runtime(time), requests: [...session.requests.values()].map(copyReceipt),
    });
  });

  router.get('/requests', ...protectRead, (req, res) => {
    const { session } = readSession(req);
    res.json({
      requests: [...session.requests.values()].map(copyReceipt),
      session: { expiresAt: new Date(session.expiresAt).toISOString() },
      serverTime: new Date(res.locals.novaTime).toISOString(),
    });
  });

  router.post('/requests', ...parseWrite, (req, res) => {
    if (!exactObject(req.body, ['text', 'idempotencyKey'])
        || typeof req.body.text !== 'string' || !req.body.text.trim()
        || [...req.body.text].length > 512
        || typeof req.body.idempotencyKey !== 'string'
        || !REQUEST_ID.test(req.body.idempotencyKey)) throw fail(400, 'NOVA_INVALID_BODY');
    const { session } = readSession(req);
    requireCsrf(req, session);
    const time = res.locals.novaTime;
    useActionRate(session, time);
    const existingId = session.keys.get(req.body.idempotencyKey);
    if (existingId) {
      const existing = session.requests.get(existingId);
      if (!existing || !LIVE.has(existing.status)) throw fail(410, 'NOVA_REQUEST_CLOSED');
      if (existing.text !== req.body.text) throw fail(409, 'NOVA_IDEMPOTENCY_CONFLICT');
      return res.json({ request: copyReceipt(existing), replayed: true });
    }
    if (session.requests.size >= config.maxRequests) throw fail(503, 'NOVA_CAPACITY_REACHED', 60);
    const receipt = {
      id: randomBytes(16).toString('hex'), status: 'RECEIVED', text: req.body.text,
      createdAt: time, expiresAt: Math.min(time + config.requestTtlMs, session.expiresAt),
      revision: 1, resumeTo: null, firstAcceptance: null,
    };
    session.requests.set(receipt.id, receipt);
    session.keys.set(req.body.idempotencyKey, receipt.id);
    return res.status(201).json({ request: copyReceipt(receipt), replayed: false });
  });

  router.post('/requests/:id/actions', ...parseWrite, (req, res) => {
    if (!exactObject(req.body, ['action', 'revision'])
        || !['to_reception', 'accept', 'refuse', 'hold', 'resume', 'withdraw'].includes(req.body.action)
        || !Number.isSafeInteger(req.body.revision) || req.body.revision < 1) {
      throw fail(400, 'NOVA_INVALID_BODY');
    }
    const { session } = readSession(req);
    requireCsrf(req, session);
    useActionRate(session, res.locals.novaTime);
    const receipt = REQUEST_ID.test(req.params.id) ? session.requests.get(req.params.id) : null;
    if (!receipt) throw fail(404, 'NOVA_REQUEST_NOT_FOUND');
    if (!LIVE.has(receipt.status)) throw fail(410, 'NOVA_REQUEST_CLOSED');
    if (receipt.revision !== req.body.revision) throw fail(409, 'NOVA_REVISION_CONFLICT');
    let nextStatus = null;
    let resumeTo = null;
    let firstAcceptance = null;
    switch (req.body.action) {
      case 'to_reception':
        if (receipt.status === 'RECEIVED') nextStatus = 'AT_RECEPTION';
        break;
      case 'accept':
        if (receipt.status === 'AT_RECEPTION') {
          nextStatus = 'FIRST_ACCEPTED';
          firstAcceptance = {
            acceptedAt: res.locals.novaTime,
            scope: 'reception-only', actor: 'browser-test-session',
          };
        }
        break;
      case 'refuse':
        if (receipt.status === 'AT_RECEPTION') nextStatus = 'REFUSED';
        break;
      case 'hold':
        if (receipt.status !== 'ON_HOLD') {
          nextStatus = 'ON_HOLD';
          // Pausing acceptance always returns to reception and needs a fresh choice.
          resumeTo = receipt.status === 'RECEIVED' ? 'RECEIVED' : 'AT_RECEPTION';
        }
        break;
      case 'resume':
        if (receipt.status === 'ON_HOLD'
            && ['RECEIVED', 'AT_RECEPTION'].includes(receipt.resumeTo)) {
          nextStatus = receipt.resumeTo;
        }
        break;
      case 'withdraw':
        nextStatus = 'WITHDRAWN';
        break;
    }
    if (!nextStatus) throw fail(409, 'NOVA_INVALID_TRANSITION');
    receipt.status = nextStatus;
    receipt.resumeTo = resumeTo;
    receipt.firstAcceptance = firstAcceptance;
    receipt.revision += 1;
    if (nextStatus === 'WITHDRAWN' || nextStatus === 'REFUSED') clearReceiptContent(receipt);
    return res.json({ request: copyReceipt(receipt) });
  });

  router.delete('/session', ...parseWrite, (req, res) => {
    if (!exactObject(req.body, [])) throw fail(400, 'NOVA_INVALID_BODY');
    const { id, session } = readSession(req);
    requireCsrf(req, session);
    // Ending a session must remain available even when the action budget is exhausted.
    destroySession(id, session);
    clearCookie(res);
    res.json({ ended: true });
  });

  router.use((req, res) => res.status(404).json({ error: 'NOVA_NOT_FOUND' }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.novaStatus || (error.type === 'entity.too.large' ? 413
      : error.type === 'encoding.unsupported' ? 415 : 400);
    const code = error.novaCode || (status === 413 ? 'NOVA_BODY_TOO_LARGE'
      : status === 415 ? 'NOVA_JSON_REQUIRED' : 'NOVA_INVALID_JSON');
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    return res.status(status).json({ error: code });
  });
  app.use(PREFIX, router);
  const sweepTimer = setInterval(() => {
    try { cleanup(clock()); } catch {
      // Invalid clocks fail closed and erase pending content; no payload is logged.
      for (const [id, session] of sessions) destroySession(id, session);
    }
  }, Math.min(1000, config.requestTtlMs, config.sessionTtlMs));
  sweepTimer.unref();
  return {
    close() {
      clearInterval(sweepTimer);
      for (const [id, session] of sessions) destroySession(id, session);
    },
  };
}
