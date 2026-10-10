import express from 'express';
import { auth } from 'express-openid-connect';
import { createIdTokenVerifier } from './token-verification.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeSeat, isSeat, parseRegistry } from './access-policy.mjs';
import { MemorySessionStore } from './session-store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const repositoryRoot = realpathSync(resolve(here, '../..'));
const requiredSettings = [
  'OIDC_ISSUER_BASE_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET',
  'PALACO_BASE_URL', 'PALACO_SESSION_SECRET', 'PALACO_MEMBERS_FILE',
];

function within(root, filename) {
  const path = relative(root, filename);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
}

export function readConfiguration(env = process.env) {
  const missing = requiredSettings.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) return { configured: false, missing };
  const invalid = key => { throw new TypeError('Invalid configuration: ' + key); };
  const development = env.NODE_ENV === 'development';
  let issuer;
  let base;
  try { issuer = new URL(env.OIDC_ISSUER_BASE_URL); } catch { invalid('OIDC_ISSUER_BASE_URL'); }
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password
      || env.OIDC_ISSUER_BASE_URL.includes('?') || env.OIDC_ISSUER_BASE_URL.includes('#')) invalid('OIDC_ISSUER_BASE_URL');
  try { base = new URL(env.PALACO_BASE_URL); } catch { invalid('PALACO_BASE_URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(development && base.protocol === 'http:' && loopback))
      || base.username || base.password || base.pathname !== '/'
      || env.PALACO_BASE_URL !== base.origin) invalid('PALACO_BASE_URL');
  if (!/^[a-f0-9]{64}$/i.test(env.PALACO_SESSION_SECRET)) invalid('PALACO_SESSION_SECRET');
  if (!isAbsolute(env.PALACO_MEMBERS_FILE)
      || within(repositoryRoot, resolve(env.PALACO_MEMBERS_FILE))) invalid('PALACO_MEMBERS_FILE');
  let trustProxy = false;
  if (env.PALACO_TRUST_PROXY) {
    trustProxy = env.PALACO_TRUST_PROXY.split(',').map(value => value.trim());
    if (trustProxy.some(value => !value || /^(true|false|\d+)$/i.test(value))) invalid('PALACO_TRUST_PROXY');
  }
  return {
    configured: true,
    development,
    issuerBaseURL: env.OIDC_ISSUER_BASE_URL,
    baseURL: base.origin,
    clientID: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    sessionSecret: env.PALACO_SESSION_SECRET,
    membersFile: resolve(env.PALACO_MEMBERS_FILE),
    trustProxy,
    secure: base.protocol === 'https:',
  };
}

function accessMetadata(member) {
  return {
    seat: member.seat,
    access: 'personal-workspace-read-only',
    governanceAuthority: false,
    mergeAuthority: false,
    releaseAuthority: false,
    executionAuthority: false,
  };
}

function httpError(status, code) {
  return Object.assign(new Error(code), { status, safeCode: code });
}

export function makeAfterCallback(loadMembers, verifyIdToken) {
  if (typeof loadMembers !== 'function' || typeof verifyIdToken !== 'function') {
    throw new TypeError('Callback requires membership and token verifiers.');
  }
  return async function afterCallback(req, res, session, decodedState) {
    const target = typeof decodedState?.returnTo === 'string'
      ? /^\/toegang\.html\?seat=(PALACO-AMB-(?:0[1-9]|1[0-2]))$/.exec(decodedState.returnTo) : null;
    if (!target) throw httpError(400, 'INVALID_LOGIN_TARGET');
    let claims;
    try {
      // Verify THIS incoming token rather than a potentially stale prior-session SDK cache.
      claims = await verifyIdToken(session?.id_token);
    } catch {
      throw httpError(400, 'INVALID_AUTHENTICATION_CALLBACK');
    }
    if (!authorizeSeat(claims, await loadMembers(), target[1])) {
      throw httpError(403, 'SEAT_ACCESS_DENIED');
    }
    return session;
  };
}

const publicFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/toegang.html', ['toegang.html', 'text/html']],
  ['/portal.js', ['portal.js', 'text/javascript']],
  ['/i18n.js', ['i18n.js', 'text/javascript']],
  ['/locales.json', ['locales.json', 'application/json']],
  ['/access-slots.json', ['access-slots.json', 'application/json']],
  ['/rio/', ['rio/palaco-rio-start-v0.1.html', 'text/html']],
  ['/rio/index.html', ['rio/palaco-rio-start-v0.1.html', 'text/html']],
  ['/rio/download', ['rio/palaco-rio-start-v0.1.html', 'application/octet-stream', true]],
  ['/rio/manifest.webmanifest', ['rio/manifest.webmanifest', 'application/manifest+json']],
  ['/rio/sw.js', ['rio/sw.js', 'text/javascript']],
  ['/rio/icon-192.png', ['rio/icon-192.png', 'image/png']],
  ['/rio/icon-512.png', ['rio/icon-512.png', 'image/png']],
]);

function contentSecurityPolicy() {
  const hashes = new Set();
  for (const filename of ['index.html', 'toegang.html', 'rio/palaco-rio-start-v0.1.html']) {
    try {
      const source = readFileSync(resolve(siteRoot, filename), 'utf8');
      for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=/i.test(match[1]) && match[2].trim()) {
          hashes.add("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
        }
      }
    } catch {
      // Missing public documents return 404; no script hash is granted.
    }
  }
  return "default-src 'self'; script-src 'self' " + [...hashes].join(' ')
    + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';"
    + " connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'; manifest-src 'self'";
}

export function buildApp({ env = process.env, registryLoader, authMiddleware, sessionStore } = {}) {
  const config = readConfiguration(env);
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', config.trustProxy || false);
  app.locals.configuration = config;
  const csp = contentSecurityPolicy();
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': csp,
    });
    if (config.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  async function registry() {
    if (!config.configured) throw httpError(503, 'AUTH_NOT_CONFIGURED');
    try {
      if (registryLoader) return parseRegistry(await registryLoader());
      // Re-read on every authorization; missing, revoked, or invalid records never fall back to a cache.
      const filename = await realpath(config.membersFile);
      if (within(repositoryRoot, filename)) throw new Error('Private registry is inside repository.');
      const information = await stat(filename);
      if (!information.isFile() || information.size > 65536) throw new Error('Invalid registry file.');
      return parseRegistry(await readFile(filename, 'utf8'));
    } catch {
      throw httpError(503, 'ACCESS_REGISTRY_UNAVAILABLE');
    }
  }

  function requireConfiguration(req, res, next) {
    if (!config.configured) return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
    next();
  }

  if (config.configured) {
    const oidcConfig = {
      issuerBaseURL: config.issuerBaseURL,
      baseURL: config.baseURL,
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      secret: config.sessionSecret,
      authRequired: false,
      clientAuthMethod: 'client_secret_basic',
      idTokenSigningAlg: 'RS256',
      enableTelemetry: false,
      idpLogout: false,
      legacySameSiteCookie: false,
      clockTolerance: 30,
      authorizationParams: {
        response_type: 'code',
        response_mode: 'query',
        scope: 'openid',
      },
      routes: { login: false, logout: false, callback: '/callback', postLogoutRedirect: '/toegang.html' },
      transactionCookie: { name: 'palacoAuthVerification', sameSite: 'Lax' },
      session: {
        name: config.secure ? '__Host-palacoSession' : 'palacoSession',
        store: sessionStore || new MemorySessionStore(),
        signSessionStoreCookie: true,
        requireSignedSessionStoreCookie: true,
        rolling: true,
        rollingDuration: 1800,
        absoluteDuration: 28800,
        cookie: { secure: config.secure, httpOnly: true, sameSite: 'Lax', path: '/' },
      },
      afterCallback: makeAfterCallback(registry, createIdTokenVerifier(config)),
    };
    app.use(authMiddleware || auth(oidcConfig));
  }

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/api/auth/status', async (req, res) => {
    if (!config.configured) return res.json({ configured: false, available: false, authenticated: false });
    let members;
    try { members = await registry(); } catch {
      return res.json({ configured: true, available: false, authenticated: false });
    }
    const member = req.oidc?.isAuthenticated()
      ? authorizeSeat(req.oidc.idTokenClaims, members) : null;
    return res.json({
      configured: true,
      available: true,
      authenticated: Boolean(member),
      ...(member ? { seat: member.seat } : {}),
    });
  });

  app.get('/login', requireConfiguration, async (req, res) => {
    const seat = req.query.seat;
    if (!isSeat(seat)) return res.status(400).json({ error: 'INVALID_SEAT' });
    await registry();
    return res.oidc.login({
      returnTo: '/toegang.html?seat=' + seat,
      authorizationParams: { prompt: 'login' },
    });
  });

  async function privateAccess(req, res, next) {
    if (!req.oidc?.isAuthenticated()) return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
    const member = authorizeSeat(req.oidc.idTokenClaims, await registry(), req.params.seat);
    if (!member) return res.status(403).json({ error: 'SEAT_ACCESS_DENIED' });
    res.locals.member = member;
    next();
  }
  app.get('/api/me', requireConfiguration, privateAccess, (req, res) => res.json(accessMetadata(res.locals.member)));
  app.get('/api/seats/:seat', requireConfiguration, privateAccess, (req, res) => res.json(accessMetadata(res.locals.member)));

  app.post('/logout', requireConfiguration, (req, res) => {
    if (req.get('Origin') !== config.baseURL) return res.status(403).json({ error: 'INVALID_ORIGIN' });
    // Clear the SDK's local session before provider discovery, so outage cannot retain the browser session.
    req[config.secure ? '__Host-palacoSession' : 'palacoSession'] = undefined;
    return res.oidc.logout({ returnTo: '/toegang.html' });
  });
  app.all('/callback', requireConfiguration, (req, res) => res.status(400).json({ error: 'INVALID_AUTHENTICATION_CALLBACK' }));

  // Serve an explicit public allowlist. Never serve the auth directory, private registry, or repository root.
  app.get('/rio', (req,res,next) => req.path === '/rio' ? res.redirect(302,'/rio/') : next());
  for (const [route, [filename, type, download]] of publicFiles) {
    app.get(route, async (req, res) => {
      try {
        const content = await readFile(resolve(siteRoot, filename));
        if(download)res.set('Content-Disposition','attachment; filename="PALACO-RIO-v0.1.html"');
        if(route==='/rio/sw.js')res.set('Service-Worker-Allowed','/rio/');
        return res.type(type).send(content);
      } catch {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
    });
  }
  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.safeCode ? error.status : 400;
    return res.status(status).json({ error: error.safeCode || 'AUTHENTICATION_FAILED' });
  });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const app = buildApp();
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log('PALACO ambassador portal listening on port ' + port));
}
