import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { newCitadel, recordStep, template } from '../atelier/builder.mjs';
import { digest } from '../citadel-proof/proof.mjs';
import { createDraftPackage, eraPayload } from './preview.mjs';
import { ContractGateway } from './contract-gateway.mjs';
import { TrustRegistry, trustDigest } from './trust-registry.mjs';
import { packageEnvelope, signedPayload } from '../contracts/atelier-registration-v1/contract.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const sign = data => { const s = createSign('SHA256'); s.update(data); s.end(); return s.sign(keys.privateKey).toString('base64'); };
const signed = (kind, value) => ({ ...value, signature: sign(signedPayload(kind, value)) });
const start = '2026-09-28T06:00:00Z';
const expires = '2026-09-29T06:00:00Z';

function snapshot(state) {
  const value = { ...state, previous_digest: state.previous_digest ?? null };
  return { ...value, registry_digest: trustDigest(value) };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'palaco-remediation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const principal = { user_id: 'U1', tenant_id: 'T1', project_id: 'P1', maker_id: 'M1', assurance: 'LOCAL_OPERATOR' };
  let project = newCitadel({ makerId: 'M1', name: 'L.A. remediation', intention: 'security regression', projectId: 'P1', citadelId: 'C1' });
  for (const step of template.required_steps) project = recordStep(project, 'M1', step, 'answer');
  const state = { generation: 1, bindings: [], revoked_keys: [], revoked_grants: [], previous_digest: null };
  for (const [key_id, purpose] of [['issuer', 'PREVIEW_ISSUER'], ['era', 'ERA_WITNESS']]) {
    state.bindings.push(signed('KEY_BINDING', {
      key_id, purpose, tenant_id: 'T1', project_id: 'P1', identity_id: 'AUTHORITY1',
      allowed_makers: ['M1'], public_key: publicKey, status: 'ACTIVE',
      not_before: start, expires_at: expires, authority_evidence: 'a'.repeat(64)
    }));
  }
  let clock = '2026-09-28T07:00:00Z';
  const config = {
    root, allowedRoot: root, enabled: true, authenticate: async token => token === 'valid' ? principal : null,
    readTrust: async () => snapshot(state), trustRootKey: publicKey, clock: () => clock
  };
  const gateway = new ContractGateway(config);
  function request(exportSequence = 1, grantExpiry = expires) {
    const pkg = createDraftPackage(project, 'M1', {}, exportSequence);
    const envelope = packageEnvelope(pkg, principal);
    const grant = signed('GRANT', {
      grant_id: 'G' + exportSequence, key_id: 'issuer', tenant_id: 'T1', project_id: 'P1',
      user_id: 'U1', maker_id: 'M1', citadel_id: 'C1', action: 'PREVIEW',
      contract_digest: digest(envelope), not_before: start, expires_at: grantExpiry
    });
    const evidence = {
      citadelId: 'C1', makerId: 'M1', manifestSha256: digest(pkg.manifest), exportSequence,
      observedAt: start, validUntil: expires, keyId: 'era'
    };
    evidence.signature = sign(eraPayload(evidence));
    const era = signed('ERA', { key_id: 'era', tenant_id: 'T1', project_id: 'P1', contract_digest: digest(envelope), evidence });
    return { envelope, grant, era, expected_sequence: 0 };
  }
  const query = requestValue => ({ tenant_id: 'T1', project_id: 'P1', citadel_id: 'C1', contract_digest: digest(requestValue.envelope) });
  return { root, state, config, gateway, request, query, setClock: value => { clock = value; } };
}

function rewriteRecord(record) {
  const { recordHash, ...body } = record;
  return { ...body, recordHash: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

test('expired grants cannot be resurrected after local clock rollback', async t => {
  const f = await fixture(t);
  const request = f.request(1, '2026-09-28T07:45:00Z');
  assert.equal((await f.gateway.commit('valid', request)).outcome, 'ALLOW_FOR_PREVIEW_ONLY');
  f.setClock('2026-09-28T08:00:00Z');
  assert.equal((await f.gateway.preview('valid', f.query(request))).code, 'GRANT_EXPIRED');
  f.setClock('2026-09-28T07:30:00Z');
  assert.equal((await new ContractGateway(f.config).preview('valid', f.query(request))).code, 'CLOCK_ROLLBACK');
  const files = await readdir(join(f.root, 'tenants', 'T1', 'projects', 'P1', 'citadels', 'C1', 'events'));
  assert.equal(files.filter(name => name.endsWith('.json')).length, 2);
});

test('receipt semantics are checked after an attacker recomputes local hashes', async t => {
  const f = await fixture(t);
  const request = f.request();
  await f.gateway.commit('valid', request);
  const path = join(f.root, 'tenants', 'T1', 'projects', 'P1', 'citadels', 'C1', 'events', '000000000001.json');
  const record = JSON.parse(await readFile(path, 'utf8'));
  record.event.receipt.scope = 'FOREIGN_SCOPE';
  record.event.evidenceSha256 = digest(record.event.receipt);
  await writeFile(path, JSON.stringify(rewriteRecord(record)));
  const result = await f.gateway.preview('valid', f.query(request));
  assert.equal(result.outcome, 'DENY');
  assert.equal(result.code, 'RECEIPT_SEMANTIC_MISMATCH');
  assert.equal(Object.hasOwn(result, 'html'), false);
});

test('same-epoch trust mutation and rollback are fail-closed', async t => {
  const conflict = await fixture(t);
  const request = conflict.request();
  await conflict.gateway.commit('valid', request);
  conflict.state.revoked_grants.push('G1');
  assert.equal((await conflict.gateway.preview('valid', conflict.query(request))).code, 'TRUST_CONFLICT');

  const rollback = await fixture(t);
  rollback.state.generation = 2;
  const second = rollback.request();
  await rollback.gateway.commit('valid', second);
  rollback.state.generation = 1;
  rollback.state.previous_digest = null;
  assert.equal((await rollback.gateway.preview('valid', rollback.query(second))).code, 'TRUST_ROLLBACK');
});

test('receipt-loss recovery returns the same receipt without a duplicate event', async t => {
  const f = await fixture(t);
  const request = f.request();
  const interrupted = new ContractGateway({ ...f.config, fault: async point => { if (point === 'after-contract-commit') throw Error('response lost'); } });
  assert.equal((await interrupted.commit('valid', request)).code, 'COMMIT_OUTCOME_UNKNOWN');
  const recovered = await f.gateway.commit('valid', request);
  assert.equal(recovered.outcome, 'ALLOW_FOR_PREVIEW_ONLY');
  assert.equal(recovered.idempotency_key, digest({ contract_digest: digest(request.envelope), grant_id: request.grant.grant_id, era_digest: digest(request.era) }));
  const events = await f.gateway.registry({ tenant_id: 'T1', project_id: 'P1', maker_id: 'M1', user_id: 'U1' }).then(registry => registry.events('C1'));
  assert.equal(events.filter(record => record.event.type === 'CONTRACT_PREVIEW_COMMITTED').length, 1);
});

test('trust registry rejects rollback, conflicts and broken predecessor links', async t => {
  const root = await mkdtemp(join(tmpdir(), 'palaco-trust-'));
  try {
    const registry = new TrustRegistry(root, root);
    const one = snapshot({ generation: 1, bindings: [], revoked_keys: [], revoked_grants: [], previous_digest: null });
    await registry.publish(one);
    const two = snapshot({ generation: 2, bindings: [], revoked_keys: ['old'], revoked_grants: [], previous_digest: one.registry_digest });
    await registry.publish(two);
    await assert.rejects(registry.publish(one), /TRUST_ROLLBACK/);
    const conflict = snapshot({ generation: 2, bindings: [], revoked_keys: ['different'], revoked_grants: [], previous_digest: one.registry_digest });
    await assert.rejects(registry.publish(conflict), /TRUST_CONFLICT/);
    const broken = snapshot({ generation: 3, bindings: [], revoked_keys: [], revoked_grants: [], previous_digest: '0'.repeat(64) });
    await assert.rejects(registry.publish(broken), /TRUST_CHAIN_BREAK/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
