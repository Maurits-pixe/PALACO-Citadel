import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createLab } from '../src/fixtures.mjs';
import { projectSurfaces } from '../src/surfaces.mjs';

const configuredPort = process.env.PORT ?? '4187';
if (!/^\d{4,5}$/.test(configuredPort) || Number(configuredPort) < 1024 || Number(configuredPort) > 65535) {
  throw new Error('PORT must be an integer from 1024 through 65535.');
}
const port = Number(configuredPort);
const permittedHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
const permittedOrigins = new Set([...permittedHosts].map((host) => 'http://' + host));
const scenarios = new Set(['ready', 'no-consent', 'revoked', 'expired', 'offline', 'conflict', 'unauthorized', 'tampered', 'execution']);
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const securityHeaders = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

function respond(response, status, body, contentType = 'application/json; charset=utf-8', head = false, extra = {}) {
  response.writeHead(status, { ...securityHeaders, 'Content-Type': contentType, ...extra });
  response.end(head ? undefined : body);
}

export const server = createServer(async (request, response) => {
  const head = request.method === 'HEAD';
  if (!permittedHosts.has(request.headers.host) ||
      (request.headers.origin && !permittedOrigins.has(request.headers.origin)) ||
      request.headers['sec-fetch-site'] === 'cross-site') {
    respond(response, 403, JSON.stringify({ error: 'LOCAL_ORIGIN_REQUIRED' }), undefined, head);
    return;
  }
  if (request.method !== 'GET' && !head) {
    respond(response, 405, JSON.stringify({ error: 'READ_ONLY_ENDPOINT' }), undefined, false, { Allow: 'GET, HEAD' });
    return;
  }
  if (!request.url || request.url.length > 2048) {
    respond(response, 400, JSON.stringify({ error: 'INVALID_URL' }), undefined, head);
    return;
  }
  let target;
  try { target = new URL(request.url, 'http://127.0.0.1:' + port); }
  catch { respond(response, 400, JSON.stringify({ error: 'INVALID_URL' }), undefined, head); return; }
  try {
    if (target.pathname === '/api/state') {
      const queryKeys = [...target.searchParams.keys()];
      const scenario = target.searchParams.get('scenario') ?? 'ready';
      if (queryKeys.some((key) => key !== 'scenario') || target.searchParams.getAll('scenario').length > 1 || !scenarios.has(scenario)) {
        respond(response, 400, JSON.stringify({ error: 'UNKNOWN_SCENARIO' }), undefined, head);
        return;
      }
      const lab = createLab({ scenario });
      const canonical = await lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });
      const projections = projectSurfaces(canonical);
      respond(response, 200, JSON.stringify({ canonical, full: projections.full, widget: projections.widget }), undefined, head);
      return;
    }
    const asset = staticFiles.get(target.pathname);
    if (!asset || target.search) {
      respond(response, 404, JSON.stringify({ error: 'NOT_FOUND' }), undefined, head);
      return;
    }
    const content = await readFile(new URL(asset[0], import.meta.url));
    respond(response, 200, content, asset[1], head);
  } catch (error) {
    console.error('Synthetic preview failed:', error instanceof Error ? error.message : 'unknown failure');
    respond(response, 500, JSON.stringify({ error: 'PREVIEW_UNAVAILABLE' }), undefined, head);
  }
});

server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.maxHeadersCount = 30;
server.keepAliveTimeout = 5_000;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  server.listen(port, '127.0.0.1', () => {
    console.log('ELIXER synthetic lab: http://127.0.0.1:' + port);
  });
}
