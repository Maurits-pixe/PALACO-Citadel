import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = 'https://palaco-ambassades.onrender.com';
const assets = [
  ['/rio/', 'ambassades/rio/palaco-rio-start-v0.1.html', 'text/html'],
  ['/rio/download', 'ambassades/rio/palaco-rio-start-v0.1.html', 'application/octet-stream'],
  ['/rio/manifest.webmanifest', 'ambassades/rio/manifest.webmanifest', 'application/manifest+json'],
  ['/rio/sw.js', 'ambassades/rio/sw.js', 'text/javascript'],
  ['/rio/icon-192.png', 'ambassades/rio/icon-192.png', 'image/png'],
  ['/rio/icon-512.png', 'ambassades/rio/icon-512.png', 'image/png'],
];
const protectedPaths = ['/auth/server.mjs', '/.env', '/package.json', '/rio/start.spec.mjs'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function requireResult(value, code, path) {
  if (!value) throw new Error(code + ' ' + path);
}
async function request(path) {
  try {
    const response = await fetch(origin + path, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: { Accept: '*/*', 'Cache-Control': 'no-cache' },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, bytes };
  } catch {
    throw new Error('HTTPS_FETCH_FAILED ' + path);
  }
}
async function verifyAsset([path, filename, type]) {
  const expected = await readFile(new URL('../' + filename, import.meta.url));
  const { response, bytes } = await request(path);
  requireResult(response.status === 200, 'HTTP_STATUS_MISMATCH', path);
  requireResult(bytes.equals(expected), 'PUBLISHED_BYTES_MISMATCH', path);
  requireResult((response.headers.get('content-type') || '').split(';')[0].trim() === type, 'CONTENT_TYPE_MISMATCH', path);
  requireResult(response.headers.get('x-content-type-options') === 'nosniff', 'NOSNIFF_MISSING', path);
  if (path === '/rio/download') {
    requireResult(response.headers.get('content-disposition') === 'attachment; filename="PALACO-RIO-v0.1.html"', 'DOWNLOAD_ATTACHMENT_MISMATCH', path);
  }
  if (path === '/rio/') {
    const csp = response.headers.get('content-security-policy') || '';
    const scriptDirective = csp.split(';').map(value => value.trim()).find(value => value.startsWith('script-src ')) || '';
    const sources = new Set(scriptDirective.split(/\s+/).slice(1));
    requireResult(sources.has("'self'") && !sources.has("'unsafe-inline'") && !sources.has("'unsafe-eval'"), 'SCRIPT_POLICY_MISMATCH', path);
    let count = 0;
    for (const match of expected.toString('utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
      count++;
      const hash = "'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'";
      requireResult(sources.has(hash), 'APP_SCRIPT_HASH_MISSING', path);
    }
    requireResult(count > 0, 'APP_SCRIPT_NOT_FOUND', path);
  }
  if (path === '/rio/manifest.webmanifest') {
    const manifest = JSON.parse(bytes.toString('utf8'));
    requireResult(manifest.id === '/rio/' && manifest.scope === '/rio/' && manifest.start_url === '/rio/' && manifest.display === 'standalone', 'MANIFEST_SCOPE_MISMATCH', path);
  }
  if (path === '/rio/sw.js') {
    requireResult(response.headers.get('service-worker-allowed') === '/rio/', 'WORKER_SCOPE_MISMATCH', path);
  }
  return 'PUBLIC_ASSET_OK path=' + path + ' status=200 bytes=' + bytes.length + ' sha256=' + digest(bytes);
}
async function verifyHealth() {
  const path = '/healthz';
  const { response, bytes } = await request(path);
  requireResult(response.status === 200 && JSON.parse(bytes.toString('utf8')).ok === true, 'HEALTH_CHECK_FAILED', path);
  return 'PUBLIC_HEALTH_OK path=/healthz status=200';
}
async function verifyClosed(path, status, error) {
  const { response, bytes } = await request(path);
  requireResult(response.status === status, 'CLOSED_ENDPOINT_STATUS_MISMATCH', path);
  requireResult(JSON.parse(bytes.toString('utf8')).error === error, 'CLOSED_ENDPOINT_BODY_MISMATCH', path);
  return 'CLOSED_ENDPOINT_OK path=' + path + ' status=' + status;
}

const checks = await Promise.allSettled([
  ...assets.map(verifyAsset),
  verifyHealth(),
  verifyClosed('/api/me', 503, 'AUTH_NOT_CONFIGURED'),
  ...protectedPaths.map(path => verifyClosed(path, 404, 'NOT_FOUND')),
]);
let failed = false;
for (const result of checks) {
  if (result.status === 'fulfilled') console.log(result.value);
  else {
    failed = true;
    const reason = result.reason?.message;
    // Only fixed codes and known public paths reach the logs. Never print response bodies or configuration.
    console.error(typeof reason === 'string' && /^(HTTPS_FETCH_FAILED|HTTP_STATUS_MISMATCH|PUBLISHED_BYTES_MISMATCH|CONTENT_TYPE_MISMATCH|NOSNIFF_MISSING|DOWNLOAD_ATTACHMENT_MISMATCH|SCRIPT_POLICY_MISMATCH|APP_SCRIPT_HASH_MISSING|APP_SCRIPT_NOT_FOUND|MANIFEST_SCOPE_MISMATCH|WORKER_SCOPE_MISMATCH|HEALTH_CHECK_FAILED|CLOSED_ENDPOINT_STATUS_MISMATCH|CLOSED_ENDPOINT_BODY_MISMATCH) \/[a-zA-Z0-9/._-]+$/.test(reason) ? reason : 'PUBLISHED_CHECK_FAILED');
  }
}
if (failed) process.exitCode = 1;
else console.log('PALACO_RIO_PUBLISHED_OK real_https=true assets=6 health=1 closed_endpoints=5');
