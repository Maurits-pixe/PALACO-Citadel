import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { CSP } from '../../scripts/build-rio-unified-preview.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
export async function startStaticFixture(directory, { rootWorker, csp = CSP, allowCrossOrigin = false } = {}) {
  const root = await realpath(directory);
  const requests = [];
  const server = createServer(async (request, response) => {
    const headers = {
      'Content-Security-Policy': csp, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (allowCrossOrigin) headers['Access-Control-Allow-Origin'] = '*';
    try {
      // Malformed absolute request targets must produce a closed response rather
      // than an unhandled async rejection that terminates the local review server.
      const url = new URL(request.url, 'http://fixture.invalid');
      requests.push({ method: request.method, path: url.pathname, search: url.search });
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, headers); response.end(); return;
      }
      // The optional fixed legacy worker is the only fixture override. Every page/asset
      // is read from the generated public directory, never from repository sources.
      if (url.pathname === '/sw.js' && rootWorker) {
        response.writeHead(200, { ...headers, 'Content-Type': TYPES['.js'], 'Service-Worker-Allowed': '/' });
        response.end(request.method === 'HEAD' ? undefined : await rootWorker()); return;
      }
      let path = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (path !== root && !path.startsWith(root + sep)) throw new Error('OUTSIDE_PUBLIC_ROOT');
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const actual = await realpath(path);
      if (actual !== root && !actual.startsWith(root + sep)) throw new Error('OUTSIDE_PUBLIC_ROOT');
      const body = await readFile(actual);
      const download = url.pathname === '/rio/download';
      const contentType = download ? 'application/octet-stream' : TYPES[extname(actual)] || 'application/octet-stream';
      if (download) headers['Content-Disposition'] = 'attachment; filename="PALACO-RIO-v0.1.html"';
      if (url.pathname.endsWith('/sw.js')) headers['Service-Worker-Allowed'] = url.pathname === '/sw.js' ? '/' : '/rio/';
      response.writeHead(200, { ...headers, 'Content-Type': contentType });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, headers); response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: 'http://127.0.0.1:' + server.address().port, requests,
    async close() { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); },
  };
}
