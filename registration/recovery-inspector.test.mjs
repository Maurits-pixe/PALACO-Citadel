import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile, readFile, readdir, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalRegistry } from './registry.mjs';
import { inspectIncidentState } from './recovery-inspector.mjs';

const now = '2026-10-08T00:00:00.000Z';
const hash = 'a'.repeat(64);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'palaco-recovery-inspection-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  const registry = new LocalRegistry(root, { allowedRoot:root, clock:() => now });
  await registry.append({
    type:'IDENTITY_REGISTERED',
    subjectId:'maker',
    actorId:'issuer',
    citadelId:'C1',
    evidenceSha256:hash
  }, 0);
  return { root, registry, dir:join(root, 'citadels', 'C1', 'events') };
}

async function names(dir) {
  return (await readdir(dir)).sort();
}

test('clean committed ledger inspects as CLEAN without mutation', async t => {
  const f = await fixture(t);
  const before = await names(f.dir);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'CLEAN');
  assert.equal(result.durable_ledger.verified, true);
  assert.equal(result.durable_ledger.event_count, 1);
  assert.equal(result.writer_lock.present, false);
  assert.deepEqual(result.pending_residue, []);
  assert.deepEqual(result.mutations_performed, []);
  assert.deepEqual(await names(f.dir), before);
});

test('writer lock is RECOVERY_REQUIRED but never declared stale', async t => {
  const f = await fixture(t);
  await writeFile(join(f.dir, '.writer.lock'), '', { mode:0o600 });
  const before = await names(f.dir);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'RECOVERY_REQUIRED');
  assert.equal(result.writer_lock.present, true);
  assert.equal(result.writer_lock.stale_status, 'NOT_ESTABLISHED');
  assert.equal(result.recommended_transition, 'OPERATOR_REVIEW');
  assert.deepEqual(await names(f.dir), before);
});

test('pending residue is preserved, hashed and never promoted to a committed event', async t => {
  const f = await fixture(t);
  const path = join(f.dir, '.pending-stale');
  const residue = '{"candidate":"uncommitted"}\n';
  await writeFile(path, residue, { mode:0o600 });
  const before = await names(f.dir);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'RECOVERY_REQUIRED');
  assert.equal(result.pending_residue.length, 1);
  assert.equal(result.pending_residue[0].status, 'UNCOMMITTED_RESIDUE');
  assert.equal(result.pending_residue[0].stable_read, true);
  assert.equal(result.durable_ledger.event_count, 1);
  assert.equal(result.recommended_transition, 'EVIDENCE_PRESERVATION_REQUIRED');
  assert.equal(await readFile(path, 'utf8'), residue);
  assert.deepEqual(await names(f.dir), before);
});

test('lock plus pending residue is IN_DOUBT and remains untouched', async t => {
  const f = await fixture(t);
  await writeFile(join(f.dir, '.writer.lock'), '', { mode:0o600 });
  await writeFile(join(f.dir, '.pending-inflight'), '{"inflight":true}\n', { mode:0o600 });
  const before = await names(f.dir);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'IN_DOUBT');
  assert.equal(result.writer_lock.present, true);
  assert.equal(result.pending_residue.length, 1);
  assert.deepEqual(await names(f.dir), before);
});

test('durable DRAFT_REGISTERED survives lock incident without invented retry or PREVIEW_READY', async t => {
  const f = await fixture(t);
  await f.registry.append({
    type:'DRAFT_REGISTERED',
    subjectId:'maker',
    actorId:'maker',
    citadelId:'C1',
    projectId:'P1',
    evidenceSha256:hash,
    manifestSha256:hash,
    exportSequence:1,
    package:{ fixture:true },
    verification:{ fixture:true }
  }, 1);
  await writeFile(join(f.dir, '.writer.lock'), '', { mode:0o600 });
  const before = await names(f.dir);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'RECOVERY_REQUIRED');
  assert.equal(result.durable_ledger.last_event_type, 'DRAFT_REGISTERED');
  assert.equal(result.durable_ledger.event_count, 2);
  assert.equal(result.recommended_transition, 'OPERATOR_REVIEW');
  assert.deepEqual(await names(f.dir), before);
  assert.equal((await names(f.dir)).some(name => name === '000000000003.json'), false);
});

test('tampered committed evidence returns LEDGER_UNVERIFIED', async t => {
  const f = await fixture(t);
  const eventPath = join(f.dir, '000000000001.json');
  const original = await readFile(eventPath, 'utf8');
  await writeFile(eventPath, original.replace('"maker"', '"attacker"'), { mode:0o600 });
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'LEDGER_UNVERIFIED');
  assert.equal(result.durable_ledger.verified, false);
  assert.match(result.durable_ledger.error, /ledger integrity failure/);
});

test('unsafe pending symlink fails closed and is not removed', async t => {
  const f = await fixture(t);
  const outside = join(f.root, 'outside.txt');
  await writeFile(outside, 'outside', { mode:0o600 });
  const link = join(f.dir, '.pending-unsafe');
  await symlink(outside, link);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'LEDGER_UNVERIFIED');
  assert.equal(result.pending_residue.length, 0);
  assert.equal(result.artifact_errors.length, 1);
  assert.deepEqual(result.mutations_performed, []);
  assert.equal((await names(f.dir)).includes('.pending-unsafe'), true);
});

test('permissive pending artifact fails closed instead of being trusted', async t => {
  const f = await fixture(t);
  const path = join(f.dir, '.pending-permissive');
  await writeFile(path, '{"unsafe":true}\n', { mode:0o600 });
  await chmod(path, 0o644);
  const result = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(result.state, 'LEDGER_UNVERIFIED');
  assert.equal(result.artifact_errors.length, 1);
  assert.equal((await names(f.dir)).includes('.pending-permissive'), true);
});

test('repeated read-only inspection is stable and does not rewrite incident evidence', async t => {
  const f = await fixture(t);
  await writeFile(join(f.dir, '.pending-stale'), '{"same":true}\n', { mode:0o600 });
  const beforeNames = await names(f.dir);
  const beforeBytes = await readFile(join(f.dir, '.pending-stale'), 'utf8');
  const first = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  const second = await inspectIncidentState(f.registry, 'C1', { clock:() => now });
  assert.equal(first.inspection_id, second.inspection_id);
  assert.equal(first.state, second.state);
  assert.deepEqual(await names(f.dir), beforeNames);
  assert.equal(await readFile(join(f.dir, '.pending-stale'), 'utf8'), beforeBytes);
  assert.deepEqual(first.mutations_performed, []);
  assert.deepEqual(second.mutations_performed, []);
});
