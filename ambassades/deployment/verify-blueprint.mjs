import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const blueprint = JSON.parse(await readFile(new URL('./render.yaml', import.meta.url), 'utf8'));
assert.equal(blueprint.services.length, 1);
const service = blueprint.services[0];
assert.equal(service.type, 'web');
assert.equal(service.runtime, 'node');
assert.equal(service.plan, 'free');
assert.equal(service.autoDeployTrigger, 'off');
assert.equal(service.numInstances, 1);
assert.equal(service.healthCheckPath, '/healthz');
assert.equal(service.buildCommand, 'npm ci --prefix ambassades/auth --omit=dev --ignore-scripts');
assert.equal(service.startCommand, 'node ambassades/auth/server.mjs');
assert.equal(service.repo, 'https://github.com/Maurits-pixe/PALACO-Citadel');
assert.equal(service.branch, 'codex/palaco-ambassade-website');
assert.equal(service.disk, undefined);
assert.equal(service.scaling, undefined);
const settings = new Map(service.envVars.map(entry => [entry.key, entry]));
for (const key of ['OIDC_ISSUER_BASE_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'PALACO_BASE_URL', 'PALACO_SESSION_SECRET']) {
  assert.deepEqual(settings.get(key), { key, sync: false });
}
assert.equal(settings.get('HOST').value, '0.0.0.0');
assert.equal(settings.get('NODE_VERSION').value, '24');
assert.equal(settings.get('PALACO_MEMBERS_FILE').value, '/etc/secrets/palaco-members.json');
console.log('Hosting blueprint boundaries passed; this check does not provision a Render service.');
