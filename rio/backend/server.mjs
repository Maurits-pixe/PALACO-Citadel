import {createServer} from 'node:http';
import {once} from 'node:events';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultReviewPaths, loadReviewSnapshot, REVIEW_CSP} from '../../scripts/serve-rio-unified-preview.mjs';

const SUPABASE_ORIGIN = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,512}$/;
const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webmanifest':'application/manifest+json'};
const ROUTES = {'/':'/index.html', '/rio/':'/rio/index.html', '/rio/reception/':'/rio/reception/index.html',
  '/hara/':'/hara/index.html', '/rio/account/':'/rio/account/index.html'};

// This server never receives or uses a database password, service-role key,
// user token or provider secret. A publishable key is intentionally public;
// current database authorization and RLS must still authorize every operation.
export function readConfiguration(env = process.env) {
  const url = env.RIO_SUPABASE_URL || null;
  const publishableKey = env.RIO_SUPABASE_PUBLISHABLE_KEY || null;
  if (url !== null && (typeof url !== 'string' || !SUPABASE_ORIGIN.test(url))) throw Error('INVALID_SUPABASE_URL');
  if (publishableKey !== null && (typeof publishableKey !== 'string' || !PUBLISHABLE_KEY.test(publishableKey))) throw Error('INVALID_SUPABASE_PUBLISHABLE_KEY');
  const mode = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode)) throw Error('INVALID_RUNTIME_MODE');
  let baseUrl = env.RIO_BASE_URL || null;
  if (baseUrl !== null) {
    let parsed;
    try {parsed = new URL(baseUrl);} catch {throw Error('INVALID_BASE_URL');}
    if (parsed.origin !== baseUrl || parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.protocol !== 'https:' && !(mode !== 'production' && parsed.protocol === 'http:'
        && ['127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw Error('INVALID_BASE_URL');
  }
  if (mode === 'production' && !baseUrl) throw Error('PRODUCTION_BASE_URL_REQUIRED');
  const bindHost = env.RIO_BIND_HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(bindHost)) throw Error('LOOPBACK_BIND_REQUIRED');
  const configured = Boolean(url && publishableKey);
  return Object.freeze({provider:'supabase', configured, url:configured ? url : null,
    publishableKey:configured ? publishableKey : null, mode, baseUrl, bindHost});
}

function checkedConfiguration(configuration) {
  if (!configuration || configuration.provider !== 'supabase') throw Error('INVALID_CONFIGURATION');
  const checked = readConfiguration({NODE_ENV:configuration.mode || 'development',
    RIO_BASE_URL:configuration.baseUrl, RIO_BIND_HOST:configuration.bindHost,
    RIO_SUPABASE_URL:configuration.url, RIO_SUPABASE_PUBLISHABLE_KEY:configuration.publishableKey});
  if (checked.configured !== configuration.configured) throw Error('INVALID_CONFIGURATION');
  return checked;
}

export async function startRioBackendServer({port = 4201, configuration = readConfiguration(),
  directory, manifestPath} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('INVALID_PORT');
  const config = checkedConfiguration(configuration);
  const snapshot = loadReviewSnapshot({directory, manifestPath});
  const publicConfiguration = Buffer.from(JSON.stringify({provider:'supabase', configured:config.configured,
    url:config.url, publishableKey:config.publishableKey}) + '\n');
  const health = Buffer.from('{"ok":true}\n');
  const accountCsp = config.configured
    ? REVIEW_CSP.replace("connect-src 'self'", "connect-src 'self' " + config.url) : REVIEW_CSP;
  let origin;
  const server = createServer((request, response) => {
    const headers = {'Content-Security-Policy':REVIEW_CSP, 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
      'Cross-Origin-Resource-Policy':'same-origin'};
    const end = (status, more = {}, body) => {
      response.writeHead(status, {...headers, ...more});
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const allowedOrigin = config.baseUrl || origin;
    if (request.headers.host !== new URL(allowedOrigin).host
      || (request.headers.origin && request.headers.origin !== allowedOrigin)) return end(403);
    if (request.method !== 'GET' && request.method !== 'HEAD') return end(405, {Allow:'GET, HEAD'});
    if (request.headers.upgrade || request.headers.connection?.toLowerCase().split(',').map(part => part.trim()).includes('upgrade')) return end(400);
    let path = request.url;
    if (typeof path !== 'string' || path.length > 2048) return end(400);
    if (/^\/rio\/\?lang=(nl|en|de|fr|es|it|pt|ru|pl|zh|ar|eo)$/.test(path)) path = '/rio/';
    // Do not decode or normalize: encoded paths, query secrets and traversal
    // aliases must never become routes to the configuration or filesystem.
    if (!path.startsWith('/') || /[%?\\\x00-\x20]/.test(path)
      || path.includes('//') || path.split('/').some(part => part === '.' || part === '..')) return end(400);
    if (path === '/api/rio/backend/config') return end(200,
      {'Content-Type':'application/json; charset=utf-8', 'Content-Length':publicConfiguration.length}, publicConfiguration);
    if (path === '/healthz') return end(200,
      {'Content-Type':'application/json; charset=utf-8', 'Content-Length':health.length}, health);
    const route = ROUTES[path] || path;
    if (!snapshot.has(route)) return end(404);
    if (route === '/rio/account/index.html') headers['Content-Security-Policy'] = accountCsp;
    if (route === '/rio/download') {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Disposition'] = 'attachment; filename="PALACO-RIO-v0.1.html"';
    } else headers['Content-Type'] = TYPES[extname(route)] || 'application/octet-stream';
    if (route.endsWith('/sw.js')) headers['Service-Worker-Allowed'] = route === '/sw.js' ? '/' : '/rio/';
    const body = snapshot.get(route);
    end(200, {'Content-Length':body.length}, body);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;
  server.on('upgrade', (_request, socket) => {socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
  server.listen(port, config.bindHost);
  await once(server, 'listening');
  origin = 'http://' + (config.bindHost === '::1' ? '[::1]' : config.bindHost) + ':' + server.address().port;
  return {origin, publicOrigin:config.baseUrl || origin, async close() {
    server.closeAllConnections(); await new Promise(done => server.close(done));
  }};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length && !/^--port=\d{1,5}$/.test(args[0]))) throw Error('Gebruik: node rio/backend/server.mjs [--port=4201]');
    const backend = await startRioBackendServer({...defaultReviewPaths(), port:args.length ? Number(args[0].split('=')[1]) : 4201});
    console.log('RIO-accountpreview: ' + backend.publicOrigin);
    console.log('Configuratie geladen; dit bewijst nog geen databaseverbinding of accounttoegang.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {backend.close().then(() => process.exit(0));});
  } catch (error) {
    console.error('RIO-accountpreview niet gestart: ' + (error.code || error.message)); process.exitCode = 1;
  }
}
