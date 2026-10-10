import test from 'node:test';
import assert from 'node:assert/strict';
import { createLab, bindExecution, FIXED_NOW } from '../src/fixtures.mjs';
import { createExecutionBoundary } from '../src/execution.mjs';
import { packageDigest } from '../src/integrity.mjs';
const run = lab => lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });
const snapshot = lab => structuredClone({ policy: lab.records.policy, consent: lab.records.consent, revocation: lab.records.revocation, authorization: lab.records.authorization, household: lab.records.household, dependencyAvailable: true });

test('the final synchronous gate catches an authorization revoked after the earlier gate', async () => {
  let lab, calls = 0;
  lab = createLab({ scenario: 'execution-authorized', loadExecutionSnapshot: () => {
    const state = snapshot(lab);
    if (++calls === 2) state.authorization.revoked = true;
    return state;
  }});
  const result = await run(lab);
  assert.equal(result.state.execution, 'DENIED');
  assert.equal(lab.executionBoundary.resources()[0].version, '0.1.0');
  assert.deepEqual(lab.executionBoundary.receipts(), []);
});
for (const resourceType of ['APP', 'ELIXER']) {
  test('the registered synthetic maintenance contract supports ' + resourceType + ' presentation data', () => {
    const lab = createLab({ scenario: 'execution-authorized' });
    const resource = { ...lab.executionBoundary.resources()[0], resourceType };
    Object.assign(lab.request.operation.payload, { resourceType, expectedBeforeDigest: packageDigest(resource) });
    bindExecution(lab);
    const boundary = createExecutionBoundary({
      trustedContext: { actorId: lab.request.who, tenantId: lab.request.tenantId, worldId: lab.request.worldId, citadelId: lab.request.citadelId },
      targetId: resource.targetId, initialResource: resource, now: () => FIXED_NOW, loadExecutionSnapshot: () => snapshot(lab),
    });
    const result = boundary.execute({ manifest: lab.manifest, request: lab.request });
    assert.equal(result.status, 'COMMITTED');
    assert.equal(result.receipt.resourceType, resourceType);
    assert.equal(boundary.resources()[0].version, '0.1.1');
    assert.equal(boundary.receipts().length, 1);
  });
}

for (const [field, value] of [['householdId', 'another-household'], ['worldId', 'another-world'], ['citadelId', 'another-citadel'], ['state', 'REVOKED']]) {
  test('HARA maintenance cannot cross the household ' + field + ' boundary', async () => {
    const lab = createLab({ scenario: 'execution-authorized' });
    lab.records.household[field] = value;
    const result = await run(lab);
    assert.notEqual(result.state.execution, 'COMMITTED');
    assert.equal(lab.executionBoundary.resources()[0].version, '0.1.0');
    assert.deepEqual(lab.executionBoundary.receipts(), []);
  });
}
test('a household cannot maintain an unregistered consumer target', async () => {
  const lab = createLab({ scenario: 'execution-authorized' });
  lab.records.household.registeredTargets = ['lab-other-resource'];
  bindExecution(lab);
  const result = await run(lab);
  assert.notEqual(result.state.execution, 'COMMITTED');
  assert.equal(lab.executionBoundary.resources()[0].version, '0.1.0');
});
