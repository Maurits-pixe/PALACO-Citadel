import {createServer} from 'node:http';
import {once} from 'node:events';
import {existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Standalone on purpose: this exact file also runs beside a portable public/ folder.
export const REVIEW_FILES = Object.freeze(['index.html', 'styles.css', 'app.js', 'sw.js',
  'manifest.webmanifest', 'icon-192.svg', 'icon-512.svg', 'citadel-icon.png', 'hara-icon.png', 'rio-engine-web.mjs', 'engine.mjs',
  'chat-preview.mjs', 'integration.mjs', 'rio/index.html', 'rio/start.js', 'rio/download',
  'rio/sw.js', 'rio/manifest.webmanifest', 'rio/icon-192.png', 'rio/icon-512.png',
  'rio/reception/index.html', 'rio/reception/app.css', 'rio/reception/app.js', 'rio/reception/nova.png']);
export const REVIEW_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const here = dirname(fileURLToPath(import.meta.url));
export function defaultReviewPaths() {
  return existsSync(resolve(here, 'build-manifest.json'))
    ? {directory:resolve(here, 'public'), manifestPath:resolve(here, 'build-manifest.json')}
    : {directory:resolve(here, '../render-dist'), manifestPath:resolve(here, '../artifacts/rio-unified-preview-build.json')};
}

export function loadReviewSnapshot({directory, manifestPath}) {
  if (lstatSync(directory).isSymbolicLink()) throw Error('UNSAFE_PUBLIC_DIRECTORY');
  const root = realpathSync(directory);
  if (lstatSync(manifestPath).size > 1024 * 1024) throw Error('INVALID_BUILD_MANIFEST');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 'palaco-rio-unified-preview-build/0.1'
      || manifest.mode !== 'STATIC_PREVIEW' || manifest.backendPublished !== false
      || manifest.accountActive !== false || manifest.canOpenContact !== false
      || manifest.operativeAuthority !== 'NONE' || manifest.onlineInlineScripts !== false
      || manifest.downloadInlineScripts !== true || manifest.csp !== REVIEW_CSP
      || !Array.isArray(manifest.files) || manifest.files.length !== REVIEW_FILES.length) throw Error('INVALID_BUILD_MANIFEST');
  const remaining = new Set(REVIEW_FILES), snapshot = new Map();
  for (const file of manifest.files) {
    if (!remaining.delete(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0
        || file.bytes > 4 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(file.sha256)) throw Error('INVALID_BUILD_MANIFEST');
    const target = resolve(root, file.path);
    if (realpathSync(target) !== target || !lstatSync(target).isFile()
        || lstatSync(target).isSymbolicLink() || lstatSync(target).size !== file.bytes) throw Error('UNSAFE_PUBLIC_FILE');
    const body = readFileSync(target);
    if (body.length !== file.bytes || createHash('sha256').update(body).digest('hex') !== file.sha256) throw Error('BUILD_HASH_MISMATCH');
    snapshot.set('/' + file.path, body);
  }
  // Keep verified bytes in memory, so later filesystem edits cannot change served content.
  // Hashes prove package consistency, not a signature, identity, or permission to publish.
  return snapshot;
}

export async function startReviewServer({port = 4173, ...paths} = defaultReviewPaths()) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('INVALID_PORT');
  const snapshot = loadReviewSnapshot(paths);
  let origin;
  const server = createServer((request, response) => {
    const headers = {'Content-Security-Policy':REVIEW_CSP, 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'};
    const end = (status, more = {}, body) => {
      response.writeHead(status, {...headers, ...more});
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (request.headers.host !== new URL(origin).host
        || (request.headers.origin && request.headers.origin !== origin)) return end(403);
    if (request.method !== 'GET' && request.method !== 'HEAD') return end(405, {Allow:'GET, HEAD'});
    // Exact raw paths deliberately avoid URL normalisation and encoded traversal aliases.
    let path = request.url;
    // The standalone app already accepts these public language codes. Permit
    // only this exact raw query, without decoding or accepting other fields.
    if (/^\/rio\/\?lang=(nl|en|de|fr|es|it|pt|ru|zh|ar|eo)$/.test(path)) path = '/rio/';
    if (typeof path !== 'string' || !path.startsWith('/') || /[%?\\\x00-\x20]/.test(path)) return end(400);
    const route = {'/':'/index.html', '/rio/':'/rio/index.html', '/rio/reception/':'/rio/reception/index.html'}[path] || path;
    if (!snapshot.has(route)) return end(404);
    if (route === '/rio/download') {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Disposition'] = 'attachment; filename="PALACO-RIO-v0.1.html"';
    } else headers['Content-Type'] = TYPES[extname(route)] || 'application/octet-stream';
    if (route.endsWith('/sw.js')) headers['Service-Worker-Allowed'] = route === '/sw.js' ? '/' : '/rio/';
    headers['Content-Length'] = snapshot.get(route).length;
    end(200, {}, snapshot.get(route));
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  return {origin, async close() {server.closeAllConnections(); await new Promise(done => server.close(done));}};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length && !/^--port=\d{1,5}$/.test(args[0]))) throw Error('Gebruik: node review-server.mjs [--port=4173]');
    const port = args.length ? Number(args[0].split('=')[1]) : 4173;
    const review = await startReviewServer({...defaultReviewPaths(), port});
    console.log('RIO DRAFT: ' + review.origin + ' — alleen deze computer. Stop met Ctrl+C.');
    console.log('Geen publicatie, registratie of chatdienst gestart.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {review.close().then(() => process.exit(0));});
  } catch (error) {
    console.error('RIO-preview niet gestart: ' + (error.code || error.message)); process.exitCode = 1;
  }
}
