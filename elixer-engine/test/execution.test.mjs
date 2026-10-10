import test from 'node:test';
import assert from 'node:assert/strict';
import { createLab, bindExecution, FIXED_NOW } from '../src/fixtures.mjs';
import { packageDigest } from '../src/integrity.mjs';
import { actionDigest, validateOperation, validateExecutionAuthorization, validateActionReceipt } from '../src/execution.mjs';

const clone = value => structuredClone(value);
const run = lab => lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });
const initialResources = new WeakMap();
const authorized = options => {
  const lab = createLab({ scenario: 'execution-authorized', ...options });
  initialResources.set(lab, clone(lab.executionBoundary.resources()));
  return lab;
};
const assertNoCommit = (lab, result) => {
  assert.notEqual(result.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.notEqual(result.state.execution, 'COMMITTED');
  assert.equal(result.executionReceipt ?? null, null);
  assert.deepEqual(lab.executionBoundary.resources(), initialResources.get(lab));
  assert.equal(lab.executionBoundary.receipts().length, 0);
};
const snapshotOf = lab => ({
  policy: clone(lab.records.policy), consent: clone(lab.records.consent),
  revocation: clone(lab.records.revocation), authorization: clone(lab.records.authorization), household: clone(lab.records.household),
  dependencyAvailable: true,
});

test('explicit host authorization commits one synthetic consumer maintenance update with a valid immutable receipt', async () => {
  const lab = authorized();
  assert.equal(validateOperation(lab.request.operation).valid, true);
  assert.equal(validateExecutionAuthorization(lab.records.authorization).valid, true);
  assert.equal(lab.records.authorization.actionDigest, actionDigest({ manifest: lab.manifest, request: lab.request }));
  const result = await run(lab);
  assert.equal(result.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.equal(result.state.execution, 'COMMITTED');
  assert.equal(result.authorization.status, 'GRANTED');
  assert.equal(result.consent.status, 'GRANTED');
  assert.equal(result.state.authority, 'NONE');
  assert.equal(result.state.distribution, 'NOT_ALLOWED');
  assert.equal(result.state.activation, 'ACTIVE');
  assert.ok(result.scope.includes('consumer.maintenance.write'));
  assert.equal(validateActionReceipt(result.executionReceipt).valid, true);
  assert.equal(lab.executionBoundary.resources().length, 1);
  assert.equal(lab.executionBoundary.receipts().length, 1);
  const after = lab.executionBoundary.resources()[0];
  assert.equal(after.version, '0.1.1');
  assert.equal(after.title, lab.request.operation.payload.title);
  assert.equal(after.summary, lab.request.operation.payload.summary);
  assert.equal(after.accessibilityLabel, lab.request.operation.payload.accessibilityLabel);
  assert.equal(result.executionReceipt.beforeDigest, lab.request.operation.payload.expectedBeforeDigest);
  assert.equal(result.executionReceipt.afterDigest, packageDigest(after));
  assert.equal(result.executionReceipt.previousVersion, '0.1.0');
  assert.equal(result.executionReceipt.appliedVersion, '0.1.1');
  assert.equal(result.executionReceipt.externalSideEffect, false);
  assert.equal(result.executionReceipt.storage, 'PROCESS_MEMORY');
  assert.deepEqual(lab.executionBoundary.receipts()[0], result.executionReceipt);
  assert.equal(lab.contextReads.length, 0);
  assert.equal(result.personaResults.length, 0);
  assert.equal(Object.isFrozen(result.executionReceipt), true);
  assert.equal(Object.isFrozen(lab.executionBoundary.receipts()), true);
  assert.equal(Object.isFrozen(lab.executionBoundary.resources()), true);
  assert.equal(lab.engine.journal.verify(), true);
});

test('request authorization reference cannot create a missing host grant', async () => {
  const lab = authorized();
  lab.records.authorization = null;
  assertNoCommit(lab, await run(lab));
});

test('explicit null authorization remains pending and produces no side effect', async () => {
  const lab = authorized();
  lab.request.authorization = null;
  const result = await run(lab);
  assert.equal(result.resultType, 'EXECUTION_PENDING_AUTHORIZATION');
  assert.equal(result.state.execution, 'AUTH_PENDING');
  assertNoCommit(lab, result);
});

test('ordinary read consent does not authorize a consumer maintenance write', async () => {
  const lab = authorized();
  lab.records.consent.scopes = ['household.read'];
  assertNoCommit(lab, await run(lab));
});

test('missing consent cannot be replaced by an authorization grant', async () => {
  const lab = authorized();
  lab.request.consentReference = null;
  assertNoCommit(lab, await run(lab));
});

test('manifest and policy must both allow execution', async () => {
  const lab = authorized();
  lab.records.policy.allowedActions = ['READ', 'EXPLAIN', 'PROPOSE'];
  assertNoCommit(lab, await run(lab));
});

test('consumer maintenance write scope is required even with an otherwise valid grant', async () => {
  const lab = authorized();
  lab.request.scope = ['public.read'];
  assertNoCommit(lab, await run(lab));
});

for (const [label, mutate] of [
  ['title', lab => { lab.request.operation.payload.title = 'Andere fictieve consumententitel'; }],
  ['target', lab => { lab.request.operation.targetId = 'lab-other-consumer'; }],
  ['summary', lab => { lab.request.operation.payload.summary = 'Andere fictieve samenvatting'; }],
  ['idempotency key', lab => { lab.request.operation.idempotencyKey = 'lab-other-operation'; }],
]) {
  test('an authorization cannot be reused after changing the operation ' + label, async () => {
    const lab = authorized();
    const before = lab.records.authorization.actionDigest;
    mutate(lab);
    assert.notEqual(actionDigest({ manifest: lab.manifest, request: lab.request }), before);
    assertNoCommit(lab, await run(lab));
  });
}

test('a synthetic execution request cannot carry production data', async () => {
  const lab = authorized();
  lab.request.operation.payload.classification = 'PRODUCTION';
  assert.equal(validateOperation(lab.request.operation).valid, false);
  assertNoCommit(lab, await run(lab));
});

test('unsupported executable actions are rejected before any write', async () => {
  const lab = authorized();
  lab.request.operation.action = 'consumer.delete';
  assert.equal(validateOperation(lab.request.operation).valid, false);
  assertNoCommit(lab, await run(lab));
});

test('unexpected payload fields are rejected rather than persisted', async () => {
  const lab = authorized();
  lab.request.operation.payload.authority = 'ISSUED';
  assert.equal(validateOperation(lab.request.operation).valid, false);
  assertNoCommit(lab, await run(lab));
});

test('maintenance rejects a stale resource base even with a newly bound grant', async () => {
  const lab = authorized();
  lab.request.operation.payload.expectedBeforeDigest = 'sha256:' + '0'.repeat(64);
  bindExecution(lab);
  assertNoCommit(lab, await run(lab));
});

test('maintenance rejects a resource type that does not match the target', async () => {
  const lab = authorized();
  lab.request.operation.payload.resourceType = 'APP';
  bindExecution(lab);
  assertNoCommit(lab, await run(lab));
});

test('maintenance requires a new resource version', async () => {
  const lab = authorized();
  lab.request.operation.payload.version = '0.1.0';
  bindExecution(lab);
  assertNoCommit(lab, await run(lab));
});

for (const [field, value] of [
  ['actorId', 'lab-other-actor'], ['tenantId', 'lab-other-tenant'],
  ['worldId', 'lab-other-world'], ['citadelId', 'lab-other-citadel'],
  ['elixerId', 'lab-other-elixer'], ['version', '0.0.0'],
  ['packageDigest', 'sha256:' + '0'.repeat(64)],
  ['policyVersion', 'lab-other-policy'], ['consentReference', 'lab-other-consent'],
]) {
  test('authorization is bound to ' + field, async () => {
    const lab = authorized();
    lab.records.authorization[field] = value;
    assertNoCommit(lab, await run(lab));
  });
}

test('grant scope cannot be widened by request scope', async () => {
  const lab = authorized();
  lab.records.authorization.scope = ['public.read'];
  assertNoCommit(lab, await run(lab));
});

test('revoked authorization is rejected', async () => {
  const lab = authorized();
  lab.records.authorization.revoked = true;
  assertNoCommit(lab, await run(lab));
});

test('authorization expiry is checked at the actual commit boundary', async () => {
  const lab = authorized();
  lab.records.authorization.expiresAt = FIXED_NOW;
  assertNoCommit(lab, await run(lab));
});

test('authorization issued in the future is rejected', async () => {
  const lab = authorized();
  lab.records.authorization.issuedAt = '2026-10-10T10:30:00.000Z';
  assertNoCommit(lab, await run(lab));
});

test('a revoked grant reference is rejected even if the grant object is otherwise valid', async () => {
  const lab = authorized();
  lab.records.revocation.revokedRefs.push(lab.request.authorization);
  assertNoCommit(lab, await run(lab));
});

test('unknown revocation state prevents execution', async () => {
  const lab = authorized();
  lab.records.revocation.state = 'UNKNOWN';
  assertNoCommit(lab, await run(lab));
});

test('same operation and idempotency key return the original receipt without a duplicate write', async () => {
  const lab = authorized();
  const first = await run(lab);
  assert.equal(first.resultType, 'EXECUTED_WITH_RECEIPT');
  lab.request.correlationId = 'lab-execution-replay-002';
  const second = await run(lab);
  assert.equal(second.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.deepEqual(second.executionReceipt, first.executionReceipt);
  assert.equal(lab.executionBoundary.resources().length, 1);
  assert.equal(lab.executionBoundary.resources()[0].version, '0.1.1');
  assert.equal(lab.executionBoundary.receipts().length, 1);
  assert.equal(lab.engine.history().length, 2);
});

test('parallel requests with one idempotency key perform exactly one write', async () => {
  const lab = authorized();
  const firstInput = { manifest: lab.manifest, package: lab.package, request: clone(lab.request) };
  const secondInput = { manifest: lab.manifest, package: lab.package, request: { ...clone(lab.request), correlationId: 'lab-parallel-002' } };
  const [first, second] = await Promise.all([lab.engine.run(firstInput), lab.engine.run(secondInput)]);
  assert.equal(first.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.equal(second.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.deepEqual(second.executionReceipt, first.executionReceipt);
  assert.equal(lab.executionBoundary.resources().length, 1);
  assert.equal(lab.executionBoundary.receipts().length, 1);
});

test('a new valid grant cannot reuse an idempotency key for a different operation', async () => {
  const lab = authorized();
  const first = await run(lab);
  assert.equal(first.resultType, 'EXECUTED_WITH_RECEIPT');
  lab.request.operation.payload.title = 'Andere synthetische opdracht';
  lab.request.correlationId = 'lab-idempotency-conflict-002';
  bindExecution(lab);
  const second = await run(lab);
  assert.notEqual(second.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.notEqual(second.state.execution, 'COMMITTED');
  assert.equal(second.executionReceipt ?? null, null);
  assert.equal(lab.executionBoundary.resources().length, 1);
  assert.deepEqual(lab.executionBoundary.receipts(), [first.executionReceipt]);
});

test('a committed receipt remains truthful if the clock expires before result rendering', async () => {
  let lab;
  lab = authorized({ now: () => lab?.executionBoundary.resources()[0].version === '0.1.1' ? '2026-10-10T12:00:00.000Z' : FIXED_NOW });
  const result = await run(lab);
  assert.equal(result.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.equal(result.state.execution, 'COMMITTED');
  assert.equal(validateActionReceipt(result.executionReceipt).valid, true);
  assert.equal(lab.executionBoundary.resources().length, 1);
  assert.deepEqual(lab.executionBoundary.receipts()[0], result.executionReceipt);
  assert.ok(result.scope.includes('consumer.maintenance.write'));
});

for (const [name, transform] of [
  ['missing', () => null],
  ['malformed policy', snapshot => ({ ...snapshot, policy: null })],
  ['malformed consent', snapshot => ({ ...snapshot, consent: null })],
  ['missing authorization', snapshot => ({ ...snapshot, authorization: null })],
  ['offline dependency', snapshot => ({ ...snapshot, dependencyAvailable: false })],
  ['unknown revocation', snapshot => ({ ...snapshot, revocation: { ...snapshot.revocation, state: 'UNKNOWN' } })],
]) {
  test('commit fails closed with a ' + name + ' host snapshot', async () => {
    let lab;
    lab = authorized({ loadExecutionSnapshot: () => transform(snapshotOf(lab)) });
    assertNoCommit(lab, await run(lab));
  });
}

test('an asynchronous host snapshot is rejected before execution', async () => {
  let lab;
  lab = authorized({ loadExecutionSnapshot: async () => snapshotOf(lab) });
  assertNoCommit(lab, await run(lab));
});

test('host snapshot loader failures are reported without a side effect', async () => {
  const lab = authorized({ loadExecutionSnapshot: () => { throw new Error('Unavailable synthetic state'); } });
  assertNoCommit(lab, await run(lab));
});

test('legacy read-only profile cannot gain execution from a supplied authorization reference', async () => {
  const lab = createLab({ scenario: 'execution' });
  lab.request.authorization = 'lab-auth-001';
  const result = await run(lab);
  assert.notEqual(result.resultType, 'EXECUTED_WITH_RECEIPT');
  assert.equal(result.state.execution, 'DENIED');
  assert.equal(result.executionReceipt ?? null, null);
  assert.equal(lab.contextReads.length, 0);
});

test('receipt exports cannot modify stored execution history', async () => {
  const lab = authorized();
  const result = await run(lab);
  const receipt = lab.executionBoundary.receipts()[0];
  assert.throws(() => { receipt.receiptId = 'rewritten'; }, TypeError);
  assert.throws(() => { lab.executionBoundary.resources().push({}); }, TypeError);
  assert.deepEqual(lab.executionBoundary.receipts()[0], result.executionReceipt);
});
