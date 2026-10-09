import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Trust one ephemeral loopback test certificate in a fresh child process.
// TLS verification stays enabled; production settings and global trust are never changed.
const directory = mkdtempSync(join(tmpdir(), 'palaco-oidc-integration-'));
try {
  const certificate = join(directory, 'certificate.pem');
  const key = join(directory, 'key.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', certificate, '-days', '1',
    '-subj', '/CN=PALACO loopback integration',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign',
  ], { stdio: 'ignore', timeout: 30000 });
  const env = {
    ...process.env,
    NODE_EXTRA_CA_CERTS: certificate,
    PALACO_TEST_TLS_CERT_FILE: certificate,
    PALACO_TEST_TLS_KEY_FILE: key,
    PALACO_TEST_PRIVATE_DIR: directory,
  };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  const child = spawnSync(process.execPath, [
    '--test', fileURLToPath(new URL('./oidc-flow.test.mjs', import.meta.url)),
  ], { env, stdio: 'inherit', timeout: 90000 });
  if (child.error) throw child.error;
  process.exitCode = child.status === 0 ? 0 : 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
