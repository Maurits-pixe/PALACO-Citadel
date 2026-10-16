import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectDesignAction, validateDesignSnapshot } from './reference.mjs';

const fixture = JSON.parse(await readFile(new URL('./draft.json', import.meta.url), 'utf8'));
const snapshot = () => structuredClone(fixture);
const action = (person = 'ALPHA') => ({
  session_ref: `TST-SESSION-${person}`, claimed_actor_person_id: `TST-PERSON-${person}`,
  shared_palaco_id: 'TST-PROJECT-PALACO', provider: 'TST-PROVIDER-LOCAL',
  provider_user_ref: `TST-PROVIDER-USER-${person}`, action: 'TST-ACTION-REVIEW',
  scope: 'TST-SCOPE-PROJECT-DRAFT', at_ms: 1800000001000, audit_ref: `TST-AUDIT-NEW-${person}`,
});
function held(result) {
  assert.equal(result.mode, 'DESIGN_ONLY');
  assert.equal(result.decisionStatus, 'ADVISORY_HUMAN_DECISION_REQUIRED');
  assert.equal(result.canAuthorize, false);
}
function rejected(input, request = action(), reason = 'INVALID_SNAPSHOT') {
  const result = inspectDesignAction(input, request);
  held(result);
  assert.equal(result.designMatch, false);
  assert.equal(result.receipt, null);
  assert.equal(result.reason, reason);
}

test('one shared project keeps two distinct synthetic persons, provider principals and attributed receipts', () => {
  const source = snapshot();
  const before = structuredClone(source);
  const valid = validateDesignSnapshot(source);
  held(valid);
  assert.equal(valid.valid, true);
  const alpha = inspectDesignAction(source, action());
  const beta = inspectDesignAction(source, action('BETA'));
  for (const result of [alpha, beta]) {
    held(result); held(result.receipt);
    assert.equal(result.designMatch, true);
    assert.equal(result.reason, 'SIMULATED_DESIGN_MATCH');
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.receipt), true);
  }
  assert.equal(alpha.receipt.shared_palaco_id, beta.receipt.shared_palaco_id);
  assert.notEqual(alpha.receipt.actor_person_id, beta.receipt.actor_person_id);
  assert.notEqual(alpha.receipt.provider_user_ref, beta.receipt.provider_user_ref);
  assert.deepEqual(source, before);
});

test('the actor comes from the session; claims, group IDs and another provider principal cannot impersonate it', () => {
  const source = snapshot();
  const unclaimed = inspectDesignAction(source, { ...action(), claimed_actor_person_id: null });
  held(unclaimed);
  assert.equal(unclaimed.receipt.actor_person_id, 'TST-PERSON-ALPHA');
  rejected(source, { ...action(), claimed_actor_person_id: 'TST-PERSON-BETA' }, 'ACTOR_SESSION_MISMATCH');
  rejected(source, { ...action(), claimed_actor_person_id: 'TST-PROJECT-PALACO' }, 'GROUP_CANNOT_ACT');
  rejected(source, { ...action(), session_ref: 'TST-SESSION-BETA' }, 'ACTOR_SESSION_MISMATCH');
  rejected(source, { ...action(), session_ref: 'TST-SESSION-UNKNOWN' }, 'SESSION_UNKNOWN');
  rejected(source, { ...action(), provider_user_ref: 'TST-PROVIDER-USER-BETA' }, 'PROVIDER_SESSION_MISMATCH');
  rejected(source, { ...action(), provider: 'TST-PROVIDER-OTHER' }, 'PROVIDER_SESSION_MISMATCH');
});

test('an identical provider user reference in two distinct provider namespaces does not conflate persons', () => {
  const source = snapshot();
  source.providerBindings[1].provider = 'TST-PROVIDER-OTHER';
  source.providerBindings[1].provider_user_ref = 'TST-PROVIDER-USER-ALPHA';
  source.sessions[1].provider = 'TST-PROVIDER-OTHER';
  source.sessions[1].provider_user_ref = 'TST-PROVIDER-USER-ALPHA';
  assert.equal(validateDesignSnapshot(source).valid, true);
  const alpha = inspectDesignAction(source, action());
  const beta = inspectDesignAction(source, {
    ...action('BETA'), provider: 'TST-PROVIDER-OTHER', provider_user_ref: 'TST-PROVIDER-USER-ALPHA',
  });
  held(alpha); held(beta);
  assert.equal(alpha.designMatch, true);
  assert.equal(beta.designMatch, true);
  assert.notEqual(alpha.receipt.actor_person_id, beta.receipt.actor_person_id);
  assert.notEqual(alpha.receipt.provider, beta.receipt.provider);
  assert.equal(alpha.receipt.provider_user_ref, beta.receipt.provider_user_ref);
});

test('revoking one membership denies only that person and never rewrites historical or previously returned receipts', () => {
  const source = snapshot();
  const history = structuredClone(source.historicalReceipts);
  const priorReceipt = inspectDesignAction(source, action()).receipt;
  const prior = structuredClone(priorReceipt);
  const revoked = snapshot();
  revoked.memberships[0].status = 'REVOKED';
  assert.equal(validateDesignSnapshot(revoked).valid, true);
  rejected(revoked, action(), 'MEMBERSHIP_NOT_ACTIVE');
  const beta = inspectDesignAction(revoked, action('BETA'));
  held(beta);
  assert.equal(beta.designMatch, true);
  assert.deepEqual(revoked.historicalReceipts, history);
  assert.deepEqual(priorReceipt, prior);
  assert.equal(priorReceipt.actor_person_id, 'TST-PERSON-ALPHA');
  assert.equal(priorReceipt.at_ms, 1800000001000);
  assert.equal(priorReceipt.audit_ref, 'TST-AUDIT-NEW-ALPHA');
  revoked.sessions[0].status = 'CLOSED';
  assert.equal(validateDesignSnapshot(revoked).valid, true);
  rejected(revoked, action(), 'SESSION_NOT_ACTIVE');
  assert.deepEqual(revoked.historicalReceipts, history);
});

test('a valid project, active membership and exact known action/scope are all independently required', () => {
  const source = snapshot();
  source.groups.push({ shared_palaco_id: 'TST-PROJECT-OTHER', kind: 'PROJECT', status: 'DESIGN_ONLY' });
  rejected(source, { ...action(), shared_palaco_id: 'TST-PROJECT-OTHER' }, 'MEMBERSHIP_REQUIRED');
  rejected(source, { ...action(), shared_palaco_id: 'TST-PROJECT-UNKNOWN' }, 'GROUP_UNKNOWN');
  source.memberships[0].permissions = [];
  rejected(source, action(), 'PERMISSION_REQUIRED');
  assert.equal(inspectDesignAction(source, action('BETA')).designMatch, true);
  rejected(source, { ...action(), action: 'TST-ACTION-EXECUTE' }, 'INVALID_ACTION');
  rejected(source, { ...action(), scope: 'TST-SCOPE-ADMIN' }, 'INVALID_ACTION');
  rejected(source, { ...action(), audit_ref: 'TST-AUDIT-HISTORY-ALPHA' }, 'PERMISSION_REQUIRED');
  rejected(snapshot(), { ...action(), audit_ref: 'TST-AUDIT-HISTORY-ALPHA' }, 'AUDIT_REFERENCE_REUSED');
});

test('duplicate person, project, provider pair, per-person provider binding, membership edge and session IDs reject the whole snapshot', () => {
  for (const modify of [
    value => value.persons.push(structuredClone(value.persons[0])),
    value => value.groups.push(structuredClone(value.groups[0])),
    value => { value.providerBindings[1].provider_user_ref = value.providerBindings[0].provider_user_ref; },
    value => value.providerBindings.push({ ...value.providerBindings[0], provider_user_ref: 'TST-PROVIDER-USER-OTHER' }),
    value => { value.sessions[1].session_ref = value.sessions[0].session_ref; },
    value => { value.memberships[1].membership_id = value.memberships[0].membership_id; },
    value => value.memberships.push({ ...structuredClone(value.memberships[0]), membership_id: 'TST-MEMBERSHIP-OTHER' }),
    value => value.historicalReceipts.push(structuredClone(value.historicalReceipts[0])),
    value => value.memberships[0].permissions.push(structuredClone(value.memberships[0].permissions[0])),
  ]) {
    const source = snapshot(); modify(source);
    held(validateDesignSnapshot(source));
    assert.equal(validateDesignSnapshot(source).valid, false);
    rejected(source);
  }
});

test('missing actors and cross-person/group/provider references cannot be repaired or inferred', () => {
  for (const modify of [
    value => value.persons.splice(0, 1),
    value => value.providerBindings.splice(0, 1),
    value => { value.providerBindings[0].person_id = 'TST-PERSON-MISSING'; },
    value => { value.sessions[0].person_id = 'TST-PERSON-BETA'; },
    value => { value.sessions[0].provider_user_ref = 'TST-PROVIDER-USER-BETA'; },
    value => { value.memberships[0].person_id = 'TST-PERSON-MISSING'; },
    value => { value.memberships[0].shared_palaco_id = 'TST-PROJECT-MISSING'; },
    value => { value.groups[0].shared_palaco_id = value.persons[0].person_id; },
    value => { value.persons[0].person_id = value.groups[0].shared_palaco_id; },
    value => { value.historicalReceipts[0].actor_person_id = 'TST-PERSON-BETA'; },
    value => { value.historicalReceipts[0].provider_user_ref = 'TST-PROVIDER-USER-BETA'; },
    value => { value.historicalReceipts[0].shared_palaco_id = 'TST-PROJECT-MISSING'; },
  ]) {
    const source = snapshot(); modify(source);
    const before = structuredClone(source);
    rejected(source);
    assert.deepEqual(source, before);
  }
});

test('open authority flags, real identifiers and unknown fields remain invalid at every record boundary', () => {
  for (const modify of [
    value => { value.oauthEnabled = true; }, value => { value.accountActive = true; },
    value => { value.canOpenContact = true; }, value => { value.operativeAuthority = 'OWNER'; },
    value => { value.mode = 'PRODUCTION'; }, value => { value.decisionStatus = 'APPROVED'; },
    value => { value.persons[0].person_id = 'real-person-id'; },
    value => { value.providerBindings[0].provider = 'github'; },
    value => { value.providerBindings[0].provider_user_ref = '12345678'; },
    value => { value.sessions[0].session_ref = 'eyJraw.cookie.or.token'; },
    value => { value.groups[0].shared_palaco_id = 'PALACO-REAL'; },
    value => { value.historicalReceipts[0].canAuthorize = true; },
    value => { value.historicalReceipts[0].decisionStatus = 'APPROVED'; },
    value => { value.extra = 'PRIVATE_CANARY'; },
    value => { value.persons[0].display_name = 'PRIVATE_CANARY'; },
    value => { value.groups[0].seat = 'PALACO-AMB-01'; },
    value => { value.providerBindings[0].verified = true; },
    value => { value.sessions[0].cookie = 'PRIVATE_CANARY'; },
    value => { value.memberships[0].role = 'ADMIN'; },
    value => { value.memberships[0].permissions[0].action = 'TST-ACTION-EXECUTE'; },
    value => { value.memberships[0].permissions[0].authority = true; },
    value => { value.historicalReceipts[0].signature = 'PRIVATE_CANARY'; },
  ]) {
    const source = snapshot(); modify(source);
    const result = validateDesignSnapshot(source);
    held(result); assert.equal(result.valid, false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_CANARY'), false);
    rejected(source);
  }
});

test('unsafe timestamps, unknown action fields and raw credentials cannot enter proposed receipts', () => {
  for (const at_ms of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 8_640_000_000_000_001, '1800000001000', null]) {
    rejected(snapshot(), { ...action(), at_ms }, 'INVALID_ACTION');
    const source = snapshot(); source.historicalReceipts[0].at_ms = at_ms;
    rejected(source);
  }
  for (const request of [
    { ...action(), cookie: 'PRIVATE_CANARY' }, { ...action(), claimed_actor_person_id: undefined },
    { ...action(), actor_person_id: 'TST-PERSON-BETA' },
    { ...action(), audit_ref: 'real-audit-ref' }, { ...action(), session_ref: 'raw-cookie' },
    null, [], 'PRIVATE_CANARY',
  ]) rejected(snapshot(), request, 'INVALID_ACTION');
});

test('bounded datasets, holes, extra array fields, getters, inherited keys and poisoned proxies fail closed without echo', () => {
  for (const name of ['persons', 'groups', 'providerBindings']) {
    const source = snapshot(); source[name] = Array(33).fill(source[name][0]); rejected(source);
  }
  for (const name of ['sessions', 'memberships', 'historicalReceipts']) {
    const source = snapshot(); source[name] = Array(65).fill(source[name][0]); rejected(source);
  }
  const large = snapshot(); large.persons[0].person_id = 'TST-PERSON-' + 'A'.repeat(100000); rejected(large);
  const hole = snapshot(); delete hole.persons[0]; rejected(hole);
  const extra = snapshot(); extra.persons.extra = true; rejected(extra);
  let called = false;
  const getter = snapshot(); Object.defineProperty(getter.persons[0], 'person_id', { enumerable: true, get() { called = true; throw new Error('PRIVATE_CANARY'); } });
  rejected(getter); assert.equal(called, false);
  const actionGetter = action(); Object.defineProperty(actionGetter, 'session_ref', { enumerable: true, get() { called = true; throw new Error('PRIVATE_CANARY'); } });
  rejected(snapshot(), actionGetter, 'INVALID_ACTION'); assert.equal(called, false);
  const poisonedPermission = snapshot();
  poisonedPermission.memberships[0].permissions[0].action = { toJSON() { called = true; throw new Error('PRIVATE_CANARY'); } };
  rejected(poisonedPermission); assert.equal(called, false);
  const poisonedGetter = snapshot();
  const invalidAction = {};
  Object.defineProperty(invalidAction, 'toJSON', { get() { called = true; throw new Error('PRIVATE_CANARY'); } });
  poisonedGetter.memberships[0].permissions[0].action = invalidAction;
  rejected(poisonedGetter); assert.equal(called, false);
  const inherited = Object.create(snapshot()); rejected(inherited);
  const symbol = snapshot(); symbol[Symbol('PRIVATE_CANARY')] = true; rejected(symbol);
  const proxy = new Proxy({}, { ownKeys() { throw new Error('PRIVATE_CANARY'); } }); rejected(proxy);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); rejected(revoked.proxy);
  assert.equal(JSON.stringify(validateDesignSnapshot(proxy)).includes('PRIVATE_CANARY'), false);
});

test('deeply frozen inputs remain unchanged and results expose no mutable snapshot aliases or authorization claim', () => {
  const source = snapshot();
  const request = action();
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  freeze(source); freeze(request);
  assert.equal(validateDesignSnapshot(source).valid, true);
  const result = inspectDesignAction(source, request);
  held(result); held(result.receipt);
  assert.throws(() => { result.canAuthorize = true; }, TypeError);
  assert.throws(() => { result.receipt.actor_person_id = 'TST-PERSON-BETA'; }, TypeError);
  assert.deepEqual(source, fixture);
  assert.equal(result.receipt.at_ms, request.at_ms);
  assert.equal(result.receipt.audit_ref, request.audit_ref);
  assert.equal(Object.hasOwn(result, 'execute'), false);
});
