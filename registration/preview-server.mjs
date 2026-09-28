import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

// An in-process caller supplies trusted operator configuration and the adapter.
// No import/upload endpoint, directory listing or arbitrary file serving.
export async function startLocalPreview(adapter) {
  const token = randomBytes(32).toString('hex');
  const server = createServer(async (req, res) => {
    const address = server.address();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== `127.0.0.1:${address.port}` || req.method !== 'GET') { res.writeHead(403); res.end('Denied'); return; }
    const match = req.url?.match(/^\/([a-f0-9]{64})\/([A-Za-z0-9_-]{1,80})\/([a-f0-9]{64})$/);
    if (!match || match[1] !== token) { res.writeHead(403); res.end('Denied'); return; }
    try {
      const result = await adapter.preview(match[2], match[3]);
      res.writeHead(200, result.headers); res.end(result.html);
    } catch { res.writeHead(403, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Preview unavailable: verification required'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, urlFor(citadelId, manifestSha256) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(citadelId) || !/^[a-f0-9]{64}$/.test(manifestSha256)) throw Error('invalid preview identity');
    return `http://127.0.0.1:${server.address().port}/${token}/${citadelId}/${manifestSha256}`;
  } };
}
