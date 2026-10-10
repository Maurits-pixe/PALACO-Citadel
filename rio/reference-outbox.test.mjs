import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { makeBrigadeFixture } from './test-support/brigade-fixtures.mjs';
import { openRioReferenceOutbox } from './reference-outbox.mjs';
import { makeRioOutboxFixture, rebindRioEvidence } from './test-support/rio-outbox-fixtures.mjs';

function referenceOnly(result) {
  assert.equal(result.mode, 'REFERENCE_ONLY');
  assert.equal(result.classification, 'SYNTHETIC_ONLY');
  assert.equal(result.operativeAuthority, 'NONE');
  assert.equal(result.canOpenContact, false);
  assert.equal(result.externalSideEffect, false);
}
function status(result, expected) {
  assert.equal(result.status, expected);
  referenceOnly(result);
  return result;
}
function setup(t, fixture = makeRioOutboxFixture()) {
  const directory = mkdtempSync(join(tmpdir(), 'palaco-rio-reference-'));
  const databasePath = join(directory, 'outbox.sqlite');
  const handles = [];
  t.after(() => {
    for (const handle of handles) { try { handle.close(); } catch {} }
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    fixture, databasePath,
    open(extra = {}) {
      const handle = openRioReferenceOutbox(fixture.options(databasePath, extra));
      handles.push(handle);
      return handle;
    },
    rows(sql, ...parameters) {
      const database = new DatabaseSync(databasePath);
      try { return database.prepare(sql).all(...parameters); }
      finally { database.close(); }
    },
    change(sql, ...parameters) {
      const database = new DatabaseSync(databasePath);
      try { return database.prepare(sql).run(...parameters); }
      finally { database.close(); }
    }
  };
}
function counts(context) {
  return {
    messages: context.rows('SELECT count(*) AS count FROM rio_messages')[0].count,
    challenges: context.rows('SELECT count(*) AS count FROM rio_challenges')[0].count,
    inbox: context.rows('SELECT count(*) AS count FROM rio_inbox')[0].count
  };
}
function noPayload(result, fixture) {
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(fixture.message.opaquePayload));
  assert.ok(!serialized.includes('BEGIN PUBLIC KEY'));
  assert.ok(!serialized.includes('BEGIN PRIVATE KEY'));
  assert.ok(!serialized.includes('issuerId'));
  assert.ok(!serialized.includes('reasonCodes'));
}

test('the storage fixture independently satisfies both message-bound reference gates', () => {
  const fixture = makeRioOutboxFixture();
  for (const evidence of [fixture.commitEvidence, fixture.deliveryEvidence]) {
    assert.equal(evidence.evaluate().contactEligibility, 'REFERENCE_GATE_SATISFIED');
    assert.equal(evidence.input.request.schemaVersion, '6ri9ade-transfer-reference/0.2');
    assert.deepEqual(evidence.input.request.transferBinding, fixture.transferBinding);
  }
  assert.notEqual(fixture.commitEvidence.input.request.challengeId,
    fixture.deliveryEvidence.input.request.challengeId);
});

test('a queued opaque message and consumed commit challenge survive close and reopen', t => {
  const context = setup(t);
  const first = context.open();
  status(first.commit(context.fixture.message), 'QUEUED');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
  first.close();
  const restarted = context.open();
  status(restarted.status(context.fixture.message.messageId), 'QUEUED');
  assert.ok(!JSON.stringify(restarted.inbox(context.fixture.message.messageId))
    .includes(context.fixture.message.opaquePayload));
});

test('delivery survives restart and repeated delivery cannot create a second inbox row', t => {
  const context = setup(t);
  const first = context.open();
  status(first.commit(context.fixture.message), 'QUEUED');
  status(first.deliver(context.fixture.message.messageId), 'DELIVERED');
  first.close();
  const restarted = context.open();
  const duplicate = status(restarted.deliver(context.fixture.message.messageId), 'DELIVERED');
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(counts(context), { messages: 1, challenges: 2, inbox: 1 });
  assert.ok(JSON.stringify(restarted.inbox(context.fixture.message.messageId))
    .includes(context.fixture.message.opaquePayload));
});

test('two live database connections agree on one idempotent committed message', t => {
  const context = setup(t);
  const first = context.open(), second = context.open();
  status(first.commit(context.fixture.message), 'QUEUED');
  const result = status(second.commit(structuredClone(context.fixture.message)), 'QUEUED');
  assert.equal(result.duplicate, true);
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('two live database connections cannot duplicate local inbox delivery', t => {
  const context = setup(t);
  const first = context.open(), second = context.open();
  first.commit(context.fixture.message);
  status(first.deliver(context.fixture.message.messageId), 'DELIVERED');
  const result = status(second.deliver(context.fixture.message.messageId), 'DELIVERED');
  assert.equal(result.duplicate, true);
  assert.deepEqual(counts(context), { messages: 1, challenges: 2, inbox: 1 });
});

test('a missing final human confirmation cannot enqueue bytes or consume a challenge', t => {
  const context = setup(t);
  context.fixture.commitEvidence.input.finalReceipts.pop();
  status(context.open().commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('one missing receiver bodyguard cannot enqueue otherwise signed bytes', t => {
  const context = setup(t);
  context.fixture.commitEvidence.input.evidence.pop();
  status(context.open().commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('a valid signed guard rejection closes the attempt without enqueuing data', t => {
  const context = setup(t);
  context.fixture.commitEvidence.replaceEvidence(0, { status: 'FAIL' }, { rebuildFinal: true });
  status(context.open().commit(context.fixture.message), 'CLOSED');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('changing opaque bytes after human signing cannot borrow the previous payload consent', t => {
  const context = setup(t);
  const altered = { ...context.fixture.message,
    opaquePayload: Buffer.from('SYNTHETIC_DIFFERENT_BYTES').toString('base64url') };
  status(context.open().commit(altered), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

for (const [label, opaquePayload] of [
  ['padded base64 instead of canonical base64url', 'YQ=='],
  ['empty payload', ''],
  ['payload beyond the 4096-byte reference bound', Buffer.alloc(4097, 5).toString('base64url')],
  ['invalid base64url symbols', '!!!']
]) {
  test(label + ' cannot enter the outbox', t => {
    const context = setup(t);
    status(context.open().commit({ ...context.fixture.message, opaquePayload }), 'HOLD');
    assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
  });
}

test('a request-JSON human boolean cannot bypass exact message schema validation', t => {
  const context = setup(t);
  status(context.open().commit({ ...context.fixture.message, humanConfirmed: true }), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('opening a production-classified database is rejected at the factory boundary', t => {
  const context = setup(t);
  assert.throws(() => context.open({ classification: 'PRODUCTION' }));
});

test('an unknown message cannot trigger evidence loading or database delivery', t => {
  const context = setup(t);
  let reads = 0;
  const outbox = context.open({ loadEvidence: () => { reads += 1; throw new Error('unused'); } });
  status(outbox.deliver('synthetic-unknown-message'), 'NOT_FOUND');
  status(outbox.status('synthetic-unknown-message'), 'NOT_FOUND');
  assert.equal(reads, 0);
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('service-commit evidence cannot be reused as queued-delivery evidence', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  context.fixture.deliveryEvidence = context.fixture.commitEvidence;
  status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('even freshly signed delivery evidence cannot reuse the consumed commit challenge', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  rebindRioEvidence(context.fixture.deliveryEvidence, {
    challengeId: context.fixture.commitEvidence.input.request.challengeId
  });
  assert.equal(context.fixture.deliveryEvidence.evaluate().contactEligibility, 'REFERENCE_GATE_SATISFIED');
  status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('repeated missing delivery evidence is bounded to three attempts and persists closure', t => {
  const context = setup(t);
  const first = context.open();
  first.commit(context.fixture.message);
  context.fixture.deliveryEvidence.input.evidence.pop();
  status(first.deliver(context.fixture.message.messageId), 'HOLD');
  context.fixture.advance();
  status(first.deliver(context.fixture.message.messageId), 'HOLD');
  context.fixture.advance();
  status(first.deliver(context.fixture.message.messageId), 'CLOSED');
  assert.equal(context.rows('SELECT attempts FROM rio_messages')[0].attempts, 3);
  first.close();
  status(context.open().status(context.fixture.message.messageId), 'CLOSED');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('an early retry cannot consume another attempt or override the durable retry time', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  context.fixture.deliveryEvidence.input.finalReceipts = [];
  status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
  const before = context.rows('SELECT attempts,retry_at FROM rio_messages')[0];
  const result = status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
  assert.equal(result.databaseMutated, false);
  assert.deepEqual(context.rows('SELECT attempts,retry_at FROM rio_messages')[0], before);
});

test('durable revocation between queue and delivery remains closed after restart', t => {
  const context = setup(t);
  const first = context.open();
  first.commit(context.fixture.message);
  status(first.revoke(context.fixture.message.requestId), 'CLOSED');
  first.close();
  const restarted = context.open();
  status(restarted.deliver(context.fixture.message.messageId), 'CLOSED');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('revoking an unknown request stores a tombstone that prevents later commit', t => {
  const context = setup(t);
  const first = context.open();
  status(first.revoke(context.fixture.message.requestId), 'CLOSED');
  first.close();
  status(context.open().commit(context.fixture.message), 'CLOSED');
  assert.equal(context.rows('SELECT revoked FROM rio_rights WHERE request_id=?',
    context.fixture.message.requestId)[0].revoked, 1);
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('fresh trusted revocation immediately before delivery cannot be ignored', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  context.fixture.deliveryEvidence.snapshot.contactState = 'REVOKED';
  status(outbox.deliver(context.fixture.message.messageId), 'CLOSED');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('trusted state changing during verification cannot deliver a previously passing input', t => {
  const context = setup(t);
  let reads = 0;
  const outbox = context.open({
    loadEvidence(checkpoint) {
      const loaded = context.fixture.loadEvidence(checkpoint);
      if (checkpoint !== 'QUEUED_DELIVERY') return loaded;
      reads += 1;
      return reads === 1 ? loaded : {
        input: loaded.input,
        snapshot: { ...loaded.snapshot, revision: 'synthetic-trust-changed' }
      };
    }
  });
  outbox.commit(context.fixture.message);
  status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
  assert.equal(counts(context).inbox, 0);
});

for (const [label, change] of [
  ['receiver WORLD', fixture => ({
    receiver: { ...fixture.input.request.receiver, worldId: 'synthetic-other-world' }
  })],
  ['policy version', () => ({ policyVersion: 'synthetic-policy-v2' })],
  ['receiver device key version', fixture => ({
    receiver: { ...fixture.input.request.receiver, keyVersion: 'synthetic-key-v2' }
  })]
]) {
  test('newly signed ' + label + ' cannot change the queued immutable transfer context', t => {
    const context = setup(t);
    const outbox = context.open();
    outbox.commit(context.fixture.message);
    rebindRioEvidence(context.fixture.deliveryEvidence, change(context.fixture.deliveryEvidence));
    assert.equal(context.fixture.deliveryEvidence.evaluate().contactEligibility, 'REFERENCE_GATE_SATISFIED');
    status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
    assert.equal(counts(context).inbox, 0);
  });
}

test('delivery with its own fresh signed challenge and exact queued transfer succeeds locally', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  rebindRioEvidence(context.fixture.deliveryEvidence, { challengeId: 'synthetic-fresh-delivery-challenge' });
  status(outbox.deliver(context.fixture.message.messageId), 'DELIVERED');
  assert.equal(context.rows('SELECT challenge_id FROM rio_challenges WHERE checkpoint=?',
    'QUEUED_DELIVERY')[0].challenge_id, 'synthetic-fresh-delivery-challenge');
});

test('persisted payload tampering is detected before local inbox insertion', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  const tampered = { ...context.fixture.message,
    opaquePayload: Buffer.from('SYNTHETIC_DATABASE_TAMPER').toString('base64url') };
  context.change('UPDATE rio_messages SET message_json=? WHERE message_id=?',
    JSON.stringify(tampered), context.fixture.message.messageId);
  status(outbox.deliver(context.fixture.message.messageId), 'CLOSED');
  assert.equal(counts(context).inbox, 0);
});

test('sender status projections do not disclose opaque payload, evidence, keys or retry internals', t => {
  const context = setup(t);
  const outbox = context.open();
  const queued = outbox.commit(context.fixture.message);
  noPayload(queued, context.fixture);
  context.fixture.deliveryEvidence.input.evidence.pop();
  noPayload(outbox.deliver(context.fixture.message.messageId), context.fixture);
  const projection = outbox.status(context.fixture.message.messageId);
  noPayload(projection, context.fixture);
  assert.ok(!Object.hasOwn(projection, 'attempts'));
  assert.ok(!Object.hasOwn(projection, 'retryAt'));
});

test('closed and never-delivered messages expose no opaque inbox bytes', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  outbox.revoke(context.fixture.message.requestId);
  const inbox = outbox.inbox(context.fixture.message.messageId);
  assert.ok(!JSON.stringify(inbox).includes(context.fixture.message.opaquePayload));
});

for (const point of ['AFTER_CHALLENGE', 'AFTER_OUTBOX', 'BEFORE_COMMIT']) {
  test('commit fault at ' + point + ' atomically rolls back challenge and outbox rows', t => {
    const context = setup(t);
    const failing = context.open({ fault: actual => {
      if (actual === point) throw new Error('SYNTHETIC_FAULT');
    } });
    status(failing.commit(context.fixture.message), 'HOLD');
    assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
    failing.close();
    status(context.open().commit(context.fixture.message), 'QUEUED');
    assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
  });
}

for (const point of ['AFTER_CHALLENGE', 'AFTER_INBOX', 'BEFORE_COMMIT']) {
  test('delivery fault at ' + point + ' rolls back delivery challenge and inbox insertion', t => {
    const context = setup(t);
    const first = context.open();
    first.commit(context.fixture.message);
    first.close();
    const failing = context.open({ fault: actual => {
      if (actual === point) throw new Error('SYNTHETIC_FAULT');
    } });
    status(failing.deliver(context.fixture.message.messageId), 'HOLD');
    assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
    failing.close();
    status(context.open().deliver(context.fixture.message.messageId), 'DELIVERED');
    assert.deepEqual(counts(context), { messages: 1, challenges: 2, inbox: 1 });
  });
}

test('an asynchronous fault hook is rejected and cannot leave a partial transaction', t => {
  const context = setup(t);
  const outbox = context.open({ fault: () => Promise.resolve() });
  status(outbox.commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('a consumed commit challenge cannot authorize a different valid transfer', t => {
  const context = setup(t);
  const first = context.open();
  first.commit(context.fixture.message);
  const other = makeRioOutboxFixture({
    messageId: 'synthetic-message-002', requestId: 'synthetic-request-002',
    idempotencyKey: 'synthetic-idempotency-002'
  });
  rebindRioEvidence(other.commitEvidence, {
    challengeId: context.fixture.commitEvidence.input.request.challengeId
  });
  const second = openRioReferenceOutbox(other.options(context.databasePath));
  try { status(second.commit(other.message), 'CLOSED'); }
  finally { second.close(); }
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

for (const conflict of ['requestId', 'idempotencyKey']) {
  test('a different valid message cannot reuse the durable ' + conflict, t => {
    const context = setup(t);
    const first = context.open();
    first.commit(context.fixture.message);
    const other = makeRioOutboxFixture({
      messageId: 'synthetic-message-002', requestId: 'synthetic-request-002',
      idempotencyKey: 'synthetic-idempotency-002',
      [conflict]: context.fixture.message[conflict]
    });
    const second = openRioReferenceOutbox(other.options(context.databasePath));
    try { status(second.commit(other.message), 'CLOSED'); }
    finally { second.close(); }
    status(first.status(context.fixture.message.messageId), 'QUEUED');
    assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
  });
}

test('changing bytes on an existing idempotency key closes only the conflicting attempt', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  const altered = { ...context.fixture.message,
    opaquePayload: Buffer.from('SYNTHETIC_IDEMPOTENCY_CONFLICT').toString('base64url') };
  status(outbox.commit(altered), 'CLOSED');
  status(outbox.status(context.fixture.message.messageId), 'QUEUED');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('a failed trusted loader keeps private failure details out of output and storage', t => {
  const context = setup(t);
  const outbox = context.open({ loadEvidence: () => {
    throw new Error('SYNTHETIC_PRIVATE_FAILURE_DETAILS');
  } });
  const result = status(outbox.commit(context.fixture.message), 'HOLD');
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_FAILURE_DETAILS'));
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('an asynchronous evidence loader cannot create a durable message', t => {
  const context = setup(t);
  const outbox = context.open({ loadEvidence: checkpoint =>
    Promise.resolve(context.fixture.loadEvidence(checkpoint)) });
  status(outbox.commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('a rights change in the final commit hook rolls back every queued row', t => {
  const context = setup(t);
  const outbox = context.open({ fault: point => {
    if (point === 'BEFORE_COMMIT') context.fixture.commitEvidence.snapshot.contactState = 'REVOKED';
  } });
  status(outbox.commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('key revocation in the final delivery hook rolls back the local inbox and challenge', t => {
  const context = setup(t);
  const first = context.open();
  first.commit(context.fixture.message);
  first.close();
  const delivery = context.open({ fault: point => {
    if (point === 'BEFORE_COMMIT') context.fixture.deliveryEvidence.snapshot.issuers[0].status = 'REVOKED';
  } });
  status(delivery.deliver(context.fixture.message.messageId), 'HOLD');
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('an expired queued request is durably closed before any evidence loader is called', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  context.fixture.now = context.fixture.commitEvidence.input.request.expiresAt;
  let reads = 0;
  const expired = context.open({ loadEvidence: () => { reads += 1; throw new Error('must not load'); } });
  status(expired.deliver(context.fixture.message.messageId), 'CLOSED');
  assert.equal(reads, 0);
  assert.equal(counts(context).inbox, 0);
});

test('tampering with delivered inbox bytes suppresses trusted-host inspection', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  outbox.deliver(context.fixture.message.messageId);
  context.change('UPDATE rio_inbox SET opaque_payload=? WHERE message_id=?',
    Buffer.from('SYNTHETIC_INBOX_TAMPER').toString('base64url'), context.fixture.message.messageId);
  assert.equal(outbox.inbox(context.fixture.message.messageId), null);
});

test('revocation cannot erase or unsend an already delivered historical reference record', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  outbox.deliver(context.fixture.message.messageId);
  const before = outbox.inbox(context.fixture.message.messageId);
  status(outbox.revoke(context.fixture.message.requestId), 'CLOSED');
  status(outbox.status(context.fixture.message.messageId), 'DELIVERED');
  assert.deepEqual(outbox.inbox(context.fixture.message.messageId), before);
  assert.equal(counts(context).inbox, 1);
});

test('a retry delay is durable across process-style close and reopen', t => {
  const context = setup(t);
  const first = context.open();
  first.commit(context.fixture.message);
  context.fixture.deliveryEvidence.input.evidence.pop();
  status(first.deliver(context.fixture.message.messageId), 'HOLD');
  const before = context.rows('SELECT attempts,retry_at FROM rio_messages')[0];
  first.close();
  const restarted = context.open();
  const result = status(restarted.deliver(context.fixture.message.messageId), 'HOLD');
  assert.equal(result.databaseMutated, false);
  assert.deepEqual(context.rows('SELECT attempts,retry_at FROM rio_messages')[0], before);
});

for (const [phase, point, expected] of [
  ['commit', 'AFTER_OUTBOX', { messages: 0, challenges: 0, inbox: 0 }],
  ['delivery', 'AFTER_INBOX', { messages: 1, challenges: 1, inbox: 0 }]
]) {
  test('real child-process exit at ' + point + ' recovers an uncommitted SQLite journal on reopen', t => {
    const context = setup(t);
    const outboxUrl = new URL('./reference-outbox.mjs', import.meta.url).href;
    const fixtureUrl = new URL('./test-support/rio-outbox-fixtures.mjs', import.meta.url).href;
    const source = [
      'import { openRioReferenceOutbox } from ' + JSON.stringify(outboxUrl) + ';',
      'import { makeRioOutboxFixture } from ' + JSON.stringify(fixtureUrl) + ';',
      'const fixture = makeRioOutboxFixture();',
      'let armed = ' + JSON.stringify(phase === 'commit') + ';',
      'const outbox = openRioReferenceOutbox(fixture.options(' + JSON.stringify(context.databasePath) + ', {',
      'fault(point) { if (armed && point === ' + JSON.stringify(point) + ') process.exit(72); }',
      '}));',
      'outbox.commit(fixture.message);',
      phase === 'delivery' ? 'armed = true; outbox.deliver(fixture.message.messageId);' : '',
      'process.exit(73);'
    ].join('\n');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8', timeout: 15_000
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 72, child.stderr);
    const recovered = context.open();
    assert.deepEqual(counts(context), expected);
    if (phase === 'commit') {
      status(recovered.commit(context.fixture.message), 'QUEUED');
    }
    status(recovered.deliver(context.fixture.message.messageId), 'DELIVERED');
    assert.deepEqual(counts(context), { messages: 1, challenges: 2, inbox: 1 });
  });
}

test('an external SQLite write transaction forces HOLD without partial inserts', t => {
  const context = setup(t);
  const outbox = context.open();
  const blocker = new DatabaseSync(context.databasePath);
  try {
    blocker.exec('BEGIN IMMEDIATE');
    status(outbox.commit(context.fixture.message), 'HOLD');
    assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
    blocker.exec('ROLLBACK');
    status(outbox.commit(context.fixture.message), 'QUEUED');
  } finally {
    try { blocker.exec('ROLLBACK'); } catch {}
    blocker.close();
  }
});

test('trusted callback reentry cannot mutate or close a transaction already in progress', t => {
  const context = setup(t);
  let outbox;
  let callbacks = 0;
  outbox = context.open({ fault: point => {
    if (point !== 'AFTER_OUTBOX') return;
    callbacks += 1;
    status(outbox.commit(context.fixture.message), 'HOLD');
    status(outbox.revoke(context.fixture.message.requestId), 'HOLD');
    status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
    status(outbox.status(context.fixture.message.messageId), 'HOLD');
    assert.equal(outbox.inbox(context.fixture.message.messageId), null);
    assert.equal(outbox.close(), false);
  } });
  status(outbox.commit(context.fixture.message), 'QUEUED');
  assert.equal(callbacks, 1);
  assert.deepEqual(counts(context), { messages: 1, challenges: 1, inbox: 0 });
});

test('the final commit hook cannot move the trusted clock backwards', t => {
  const context = setup(t);
  const outbox = context.open({ fault: point => {
    if (point === 'BEFORE_COMMIT') context.fixture.now = '2026-10-10T09:59:59.000Z';
  } });
  status(outbox.commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('proof expiry in the final commit hook cannot be masked by a fresh trust snapshot', t => {
  const context = setup(t);
  const outbox = context.open({ fault: point => {
    if (point !== 'BEFORE_COMMIT') return;
    context.fixture.now = '2026-10-10T10:01:00.000Z';
    context.fixture.commitEvidence.snapshot.observedAt = context.fixture.now;
    context.fixture.commitEvidence.snapshot.expiresAt = '2026-10-10T10:01:20.000Z';
  } });
  status(outbox.commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

test('an unrelated version-zero database is rejected while its existing user table is preserved', t => {
  const context = setup(t);
  context.change('CREATE TABLE user_notes (text TEXT)');
  context.change('INSERT INTO user_notes VALUES (?)', 'SYNTHETIC_USER_NOTE');
  assert.throws(() => context.open());
  assert.equal(context.rows('SELECT text FROM user_notes')[0].text, 'SYNTHETIC_USER_NOTE');
  assert.equal(context.rows("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE 'rio_%'")[0].count, 0);
});

test('a version-one database without a reference-classification record is rejected', t => {
  const context = setup(t);
  context.change('PRAGMA user_version=1');
  assert.throws(() => context.open());
  assert.equal(context.rows("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE 'rio_%'")[0].count, 0);
});

test('new delivery signatures cannot extend the original queued request expiry', t => {
  const context = setup(t);
  const outbox = context.open();
  outbox.commit(context.fixture.message);
  rebindRioEvidence(context.fixture.deliveryEvidence, { expiresAt: '2026-10-10T10:06:00.000Z' });
  assert.equal(context.fixture.deliveryEvidence.evaluate().contactEligibility, 'REFERENCE_GATE_SATISFIED');
  status(outbox.deliver(context.fixture.message.messageId), 'HOLD');
  assert.equal(counts(context).inbox, 0);
});

test('valid legacy v0.1 gate signatures cannot authorize an unbound outbox message', t => {
  const context = setup(t);
  context.fixture.commitEvidence = makeBrigadeFixture({ final: true });
  assert.equal(context.fixture.commitEvidence.evaluate().contactEligibility, 'REFERENCE_GATE_SATISFIED');
  status(context.open().commit(context.fixture.message), 'HOLD');
  assert.deepEqual(counts(context), { messages: 0, challenges: 0, inbox: 0 });
});

for (const [label, change] of [
  ['an extra authority field', binding => ({ ...binding, authority: 'ALL' })],
  ['a textual byte length', binding => ({ ...binding, payloadByteLength: String(binding.payloadByteLength) })],
  ['a zero byte length', binding => ({ ...binding, payloadByteLength: 0 })],
  ['an excessive byte length', binding => ({ ...binding, payloadByteLength: 4097 })],
  ['a noncanonical digest', binding => ({ ...binding, payloadDigest: binding.payloadDigest.toUpperCase() })],
  ['an unsupported encoding', binding => ({ ...binding, payloadEncoding: 'utf8' })],
  ['a non-token idempotency key', binding => ({ ...binding, idempotencyKey: null })],
  ['a missing message identifier', binding => {
    const { messageId, ...remaining } = binding;
    return remaining;
  }]
]) {
  test('the v0.2 signed gate rejects ' + label + ' in transferBinding', () => {
    const fixture = makeRioOutboxFixture();
    rebindRioEvidence(fixture.commitEvidence, {
      transferBinding: change(fixture.commitEvidence.input.request.transferBinding)
    });
    assert.equal(fixture.commitEvidence.evaluate().contactEligibility, 'HOLD');
  });
}

test('a signed delivery replay from another transfer closes without a second inbox entry', t => {
  const context = setup(t);
  const first = context.open();
  status(first.commit(context.fixture.message),'QUEUED');
  status(first.deliver(context.fixture.message.messageId),'DELIVERED');
  const other = makeRioOutboxFixture({
    messageId:'synthetic-message-002',requestId:'synthetic-request-002',
    idempotencyKey:'synthetic-idempotency-002'
  });
  rebindRioEvidence(other.deliveryEvidence,{
    challengeId:context.fixture.deliveryEvidence.input.request.challengeId
  });
  const second = openRioReferenceOutbox(other.options(context.databasePath));
  try {
    status(second.commit(other.message),'QUEUED');
    status(second.deliver(other.message.messageId),'CLOSED');
    status(second.deliver(other.message.messageId),'CLOSED');
  } finally { second.close(); }
  assert.deepEqual(counts(context),{messages:2,challenges:3,inbox:1});
});
