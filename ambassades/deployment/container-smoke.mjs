import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, chmod, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const run = promisify(execFile);
const image = process.argv[2] || 'palaco-ambassador-access:ci';
const folder = await mkdtemp(join(tmpdir(), 'palaco-container-smoke-'));
const privateDir = join(folder, 'private');
await mkdir(privateDir, { mode: 0o755 });
await chmod(privateDir, 0o755);
await writeFile(join(privateDir, 'members.json'), '{"version":1,"members":[]}\n', { mode: 0o444 });
await chmod(join(privateDir, 'members.json'), 0o444);

async function request(base, path) {
  return fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
}

try {
  for (const configured of [false, true]) {
    const name = 'palaco-smoke-' + process.pid + '-' + Number(configured);
    const envFile = join(folder, name + '.env');
    const env = {
      NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '3000',
      ...(configured ? {
        OIDC_ISSUER_BASE_URL: 'https://issuer.invalid',
        OIDC_CLIENT_ID: 'local-smoke-fixture',
        OIDC_CLIENT_SECRET: 'local-smoke-fixture',
        PALACO_BASE_URL: 'https://portal.invalid',
        PALACO_SESSION_SECRET: randomBytes(32).toString('hex'),
        PALACO_MEMBERS_FILE: '/private/members.json',
      } : {}),
    };
    await writeFile(envFile, Object.entries(env).map(([key, value]) => key + '=' + value).join('\n') + '\n', { mode: 0o600 });
    try {
      await run('docker', [
        'run', '--detach', '--rm', '--name', name, '--read-only',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '64',
        '--publish', '127.0.0.1::3000', '--env-file', envFile,
        '--mount', 'type=bind,src=' + privateDir + ',target=/private,readonly', image,
      ]);
      const { stdout: portOutput } = await run('docker', ['port', name, '3000/tcp']);
      const match = /^127\.0\.0\.1:(\d+)$/m.exec(portOutput.trim());
      assert.ok(match, 'Smoke container must publish on loopback only.');
      const base = 'http://127.0.0.1:' + match[1];
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const response = await request(base, '/healthz');
          ready = response.ok && (await response.json()).ok === true;
          if (ready) break;
        } catch {}
        await delay(250);
      }
      assert.ok(ready, 'Container must start under its read-only runtime restrictions.');
      const { stdout: user } = await run('docker', ['exec', name, 'id', '-u']);
      assert.equal(user.trim(), '1000', 'Runtime must use the unprivileged Node user.');
      const health = await request(base, '/healthz');
      assert.equal(health.status, 200);
      const home = await request(base, '/');
      assert.equal(home.status, 200);
      assert.ok((await home.text()).includes('PALACO'));
      assert.equal(home.headers.get('cache-control'), 'no-store');
      assert.ok(home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
      const access = await request(base, '/toegang.html');
      assert.equal(access.status, 200);
      for (const path of ['/auth/server.mjs', '/auth/.env', '/auth/package-lock.json', '/private/members.json']) {
        assert.equal((await request(base, path)).status, 404, 'Private/runtime path must not be published: ' + path);
      }
      const status = await request(base, '/api/auth/status');
      const state = await status.json();
      assert.equal(state.configured, configured);
      assert.equal(state.authenticated, false);
      assert.equal(state.seat, undefined);
      if (configured) {
        assert.equal(status.status, 200);
        assert.equal(state.available, true);
        assert.equal((await request(base, '/api/me')).status, 401);
        assert.equal((await request(base, '/api/seats/PALACO-AMB-01')).status, 401);
        await writeFile(join(privateDir, 'members.next'), 'invalid-fixture-registry\n', { mode: 0o444 });
        await rename(join(privateDir, 'members.next'), join(privateDir, 'members.json'));
        const unavailable = await request(base, '/api/auth/status');
        assert.equal(unavailable.status, 200);
        assert.deepEqual(await unavailable.json(), { configured: true, available: false, authenticated: false });
      } else {
        assert.equal(status.status, 200);
        assert.equal(state.available, false);
        assert.equal((await request(base, '/api/me')).status, 503);
        assert.equal((await request(base, '/login?seat=PALACO-AMB-01')).status, 503);
      }
      console.log('Container smoke passed: ' + (configured ? 'configured empty private registry' : 'unconfigured access closed'));
    } finally {
      await run('docker', ['rm', '--force', name]).catch(() => {});
    }
  }
} finally {
  await rm(folder, { recursive: true, force: true });
}
