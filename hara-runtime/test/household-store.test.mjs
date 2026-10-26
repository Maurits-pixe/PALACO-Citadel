import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createHouseholdStore } from '../src/household-store.mjs';

const context = Object.freeze({ actorId: 'maurits-local', householdId: 'household-test', sessionId: 'session-one' });
const add = (kind = 'task', title = 'Planten water geven') => ({ operation: 'add', kind, title, details: '', dueDate: null });
const code = (expected) => (error) => error instanceof Error && error.code === expected && !/SQLITE|SELECT|INSERT|secret/i.test(error.message);
const approve = (store, proposal, session = context) => store.approve(session, { proposalId: proposal.id, digest: proposal.digest });
const fileResources = new Map();

function setup(t, options = {}) {
  const store = createHouseholdStore({ actorId: context.actorId, householdId: context.householdId, ...options });
  t.after(() => store.close());
  fileResources.get(options.filename)?.add(store);
  return store;
}

function fileSetup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'hara-household-store-'));
  const filename = join(directory, 'household.sqlite');
  fileResources.set(filename, new Set());
  t.after(() => {
    for (const resource of fileResources.get(filename)) resource.close();
    fileResources.delete(filename);
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('hara-household-store-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return filename;
}

function inspectFile(filename) {
  const inspector = new DatabaseSync(filename);
  fileResources.get(filename).add(inspector);
  return inspector;
}

test('read and propose are separate from an explicitly approved household change', (t) => {
  const timestamp = Date.parse('2026-10-26T08:00:00Z');
  const store = setup(t, { clock: () => timestamp });
  assert.deepEqual(store.identity, { actorId: context.actorId, householdId: context.householdId });
  assert.ok(Object.isFrozen(store.identity));
  assert.deepEqual(store.read(context), { id: context.householdId, label: 'Mijn huishouden', revision: 0, items: [] });
  const proposal = store.propose(context, { operation: 'add', kind: 'task', title: '  Planten water geven  ', dueDate: '2026-10-27' });
  assert.equal(proposal.status, 'PENDING');
  assert.equal(proposal.action.title, 'Planten water geven');
  assert.equal(proposal.action.details, '');
  assert.equal(proposal.baseRevision, 0);
  assert.equal(Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt), 600_000);
  assert.match(proposal.digest, /^[a-f0-9]{64}$/);
  assert.equal(store.read(context).items.length, 0);
  assert.deepEqual(store.pending(context), [proposal]);
  assert.deepEqual(store.receipts(context), []);
  const receipt = approve(store, proposal);
  assert.deepEqual({ ...receipt, id: 'receipt', proposalId: 'proposal' }, {
    id: 'receipt', proposalId: 'proposal', actorId: context.actorId, householdId: context.householdId,
    operation: 'add', revision: 1, at: '2026-10-26T08:00:00.000Z', actionDigest: proposal.digest,
  });
  const snapshot = store.read(context);
  assert.equal(snapshot.revision, 1);
  assert.deepEqual({ ...snapshot.items[0], id: 'item' }, {
    id: 'item', kind: 'task', title: 'Planten water geven', details: '', dueDate: '2026-10-27', done: false,
    version: 1, createdAt: '2026-10-26T08:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z',
  });
  assert.deepEqual(store.pending(context), []);
  assert.deepEqual(store.receipts(context), [receipt]);
});

test('items, pending proposals, receipts and exact idempotency survive a SQLite restart', (t) => {
  const filename = fileSetup(t);
  let timestamp = Date.parse('2026-10-26T08:00:00Z');
  const first = setup(t, { filename, clock: () => timestamp });
  const proposal = first.propose(context, add('shopping', 'Melk'));
  first.close();
  const second = setup(t, { filename, clock: () => timestamp });
  assert.deepEqual(second.pending(context), [proposal]);
  const receipt = approve(second, proposal);
  second.close();
  timestamp += 3_600_000;
  const third = setup(t, { filename, clock: () => timestamp });
  const later = third.propose(context, add('memory', 'Voorkeur: thee'));
  approve(third, later);
  assert.deepEqual(approve(third, proposal), receipt, 'retry returns its original receipt even after expiry and later changes');
  assert.equal(third.read(context).revision, 2);
  assert.equal(third.read(context).items.length, 2);
  assert.equal(third.receipts(context).length, 2);
  assert.throws(() => third.approve(context, { proposalId: proposal.id, digest: '0'.repeat(64) }), code('NOT_ALLOWED'));
});

test('every store method requires exact actor, household and nonempty trusted session scope', (t) => {
  const store = setup(t);
  const proposal = store.propose(context, add());
  const methods = [
    (scope) => store.read(scope), (scope) => store.propose(scope, add()), (scope) => store.pending(scope),
    (scope) => approve(store, proposal, scope), (scope) => store.reject(scope, { proposalId: proposal.id }),
    (scope) => store.revokeSession(scope), (scope) => store.receipts(scope),
  ];
  for (const method of methods) {
    assert.throws(() => method({ ...context, actorId: 'another-person' }), code('NOT_ALLOWED'));
    assert.throws(() => method({ ...context, householdId: 'another-household' }), code('NOT_ALLOWED'));
    for (const sessionId of ['', ' ', 42, null, ' session', 'session\n']) {
      assert.throws(() => method({ ...context, sessionId }), code('INVALID_INPUT'));
    }
    assert.throws(() => method({ ...context, extra: true }), code('INVALID_INPUT'));
    assert.throws(() => method(Object.create(context)), code('INVALID_INPUT'));
  }
  const otherSession = { ...context, sessionId: 'session-two' };
  assert.deepEqual(store.pending(otherSession), []);
  assert.throws(() => approve(store, proposal, otherSession), code('NOT_FOUND'));
  assert.throws(() => store.reject(otherSession, { proposalId: proposal.id }), code('NOT_FOUND'));
  assert.equal(store.read(context).revision, 0);
});

test('a database can hold separate household scopes without leaking items or proposals', (t) => {
  const filename = fileSetup(t);
  const first = setup(t, { filename });
  const firstProposal = first.propose(context, add('memory', 'Privécontext één'));
  approve(first, firstProposal);
  const secondScope = { actorId: 'second-actor', householdId: 'second-household', sessionId: 'second-session' };
  const second = setup(t, { filename, actorId: secondScope.actorId, householdId: secondScope.householdId });
  assert.deepEqual(second.read(secondScope).items, []);
  assert.deepEqual(second.receipts(secondScope), []);
  assert.throws(() => approve(second, firstProposal, secondScope), code('NOT_FOUND'));
  const proposal = second.propose(secondScope, add('task', 'Eigen huishouden'));
  approve(second, proposal, secondScope);
  assert.equal(first.read(context).items[0].title, 'Privécontext één');
  assert.equal(first.read(context).revision, 1);
});

test('returned snapshots, proposal actions and receipts never mutate stored bytes', (t) => {
  const store = setup(t);
  const proposal = store.propose(context, add('memory', 'Origineel'));
  proposal.action.title = 'Gewijzigd in client';
  proposal.digest = '0'.repeat(64);
  const pending = store.pending(context);
  assert.equal(pending[0].action.title, 'Origineel');
  const storedProposal = pending[0];
  pending[0].action.kind = 'task';
  assert.equal(store.pending(context)[0].action.kind, 'memory');
  const receipt = approve(store, store.pending(context)[0]);
  receipt.revision = 99;
  const snapshot = store.read(context);
  snapshot.items[0].title = 'Andere titel';
  snapshot.items.push({ kind: 'task' });
  assert.equal(store.read(context).items.length, 1);
  assert.equal(store.read(context).items[0].title, 'Origineel');
  const receipts = store.receipts(context);
  receipts[0].operation = 'execute';
  assert.equal(store.receipts(context)[0].operation, 'add');
  assert.equal(store.receipts(context)[0].revision, 1);
  assert.equal(storedProposal.action.kind, 'task', 'local objects may change without changing persistence');
});

test('digest mismatch, extra approval keys and fabricated proposal IDs have no household effect', (t) => {
  const store = setup(t);
  const proposal = store.propose(context, add());
  assert.throws(() => store.approve(context, { proposalId: proposal.id, digest: 'f'.repeat(64) }), code('NOT_ALLOWED'));
  for (const digest of ['', 'f'.repeat(63), 'F'.repeat(64), 42]) {
    assert.throws(() => store.approve(context, { proposalId: proposal.id, digest }), code('INVALID_INPUT'));
  }
  assert.throws(() => store.approve(context, { proposalId: proposal.id, digest: proposal.digest, action: add() }), code('INVALID_INPUT'));
  assert.throws(() => store.approve(context, { proposalId: 'unknown', digest: proposal.digest }), code('NOT_FOUND'));
  assert.equal(store.read(context).revision, 0);
  assert.deepEqual(store.receipts(context), []);
  assert.equal(store.pending(context).length, 1);
});

test('expiry is fail closed exactly at ten minutes, while explicit rejection remains harmless', (t) => {
  let timestamp = 1000;
  const store = setup(t, { clock: () => timestamp });
  const proposal = store.propose(context, add());
  timestamp += 600_000;
  assert.throws(() => approve(store, proposal), code('EXPIRED_PROPOSAL'));
  assert.deepEqual(store.pending(context), []);
  assert.equal(store.read(context).revision, 0);
  assert.deepEqual(store.receipts(context), []);
  assert.equal(store.reject(context, { proposalId: proposal.id }).status, 'REJECTED');
  assert.equal(store.reject(context, { proposalId: proposal.id }).status, 'REJECTED');
  assert.throws(() => approve(store, proposal), code('NOT_ALLOWED'));
});

test('a second connection changing household revision invalidates the older approval', (t) => {
  const filename = fileSetup(t);
  const first = setup(t, { filename });
  const second = setup(t, { filename });
  const stale = first.propose(context, add('task', 'Oud voorstel'));
  const current = second.propose(context, add('shopping', 'Brood'));
  approve(second, current);
  assert.throws(() => approve(first, stale), code('STALE_PROPOSAL'));
  assert.equal(first.read(context).revision, 1);
  assert.equal(first.read(context).items[0].title, 'Brood');
  assert.equal(first.receipts(context).length, 1);
  assert.equal(first.reject(context, { proposalId: stale.id }).status, 'REJECTED');
});

test('complete is versioned and forget is restricted to memory, never tasks or shopping', (t) => {
  let timestamp = 1000;
  const store = setup(t, { clock: () => timestamp });
  for (const kind of ['task', 'shopping', 'memory']) approve(store, store.propose(context, add(kind, kind)));
  const items = store.read(context).items;
  for (const item of items.filter((entry) => entry.kind !== 'memory')) {
    assert.throws(() => store.propose(context, { operation: 'forget', itemId: item.id }), code('NOT_ALLOWED'));
  }
  const task = items.find((entry) => entry.kind === 'task');
  timestamp += 1000;
  approve(store, store.propose(context, { operation: 'complete', itemId: task.id, done: true }));
  const completed = store.read(context).items.find((entry) => entry.id === task.id);
  assert.equal(completed.done, true);
  assert.equal(completed.version, 2);
  assert.notEqual(completed.updatedAt, completed.createdAt);
  approve(store, store.propose(context, { operation: 'complete', itemId: task.id, done: false }));
  assert.equal(store.read(context).items.find((entry) => entry.id === task.id).version, 3);
  const memory = items.find((entry) => entry.kind === 'memory');
  const forgetting = store.propose(context, { operation: 'forget', itemId: memory.id });
  assert.equal(store.read(context).items.length, 3, 'proposing forget does not remove memory');
  approve(store, forgetting);
  assert.equal(store.read(context).items.length, 2);
  assert.equal(store.read(context).revision, 6);
  assert.equal(store.receipts(context).at(-1).operation, 'forget');
  assert.throws(() => store.propose(context, { operation: 'complete', itemId: 'missing', done: true }), code('NOT_FOUND'));
});

test('memory cannot be completed or reopened and rejected proposals leave its state unchanged', (t) => {
  const store = setup(t);
  approve(store, store.propose(context, add('memory', 'Voorkeur: thee')));
  const before = store.read(context);
  const receipts = store.receipts(context);
  const memory = before.items[0];
  for (const done of [true, false]) {
    assert.throws(() => store.propose(context, { operation: 'complete', itemId: memory.id, done }), code('NOT_ALLOWED'));
  }
  assert.deepEqual(store.read(context), before);
  assert.deepEqual(store.pending(context), []);
  assert.deepEqual(store.receipts(context), receipts);
});

test('invalid action shapes, malformed dates and prototype/getter tricks are rejected before persistence', (t) => {
  const store = setup(t);
  const invalid = [null, [], 'add', {}, { ...add(), unexpected: true }, { ...add(), kind: 'calendar' },
    { ...add(), title: '' }, { ...add(), title: ' ' }, { ...add(), title: 'x'.repeat(241) },
    { ...add(), title: 'regel\nregel' }, { ...add(), details: 'x'.repeat(801) }, { ...add(), details: null },
    { ...add(), dueDate: '2026-02-29' }, { ...add(), dueDate: '2026-02-30' }, { ...add(), dueDate: '2026-2-02' },
    { ...add(), dueDate: '2026-10-26T00:00:00Z' }, { ...add(), dueDate: undefined },
    { operation: 'complete', itemId: 'x', done: 'true' }, { operation: 'complete', itemId: 'x', done: false, kind: 'memory' },
    { operation: 'forget', itemId: '' }, { operation: 'forget', itemId: 'x', title: 'extra' },
    Object.assign(Object.create(null), add()), Object.assign(Object.create({ inherited: true }), add()),
    JSON.parse('{"operation":"add","kind":"task","title":"x","__proto__":{"allowed":true}}'),
  ];
  for (const action of invalid) assert.throws(() => store.propose(context, action), code('INVALID_INPUT'));
  let getterRead = false;
  const getter = { ...add() };
  Object.defineProperty(getter, 'title', { get() { getterRead = true; throw new Error('secret'); } });
  assert.throws(() => store.propose(context, getter), code('INVALID_INPUT'));
  assert.equal(getterRead, false);
  const symbol = { ...add(), [Symbol('hidden')]: true };
  assert.throws(() => store.propose(context, symbol), code('INVALID_INPUT'));
  for (const operation of ['execute', 'authorize', 'publish', 'activate', 'delete', 'update']) {
    assert.throws(() => store.propose(context, { operation }), code('NOT_ALLOWED'));
  }
  assert.deepEqual(store.pending(context), []);
  assert.equal(store.read(context).revision, 0);
  const leap = store.propose(context, { ...add(), dueDate: '2028-02-29', title: 'x'.repeat(240), details: 'y'.repeat(800) });
  assert.equal(leap.action.dueDate, '2028-02-29');
});

test('session revocation persists, invalidates pending proposals, and preserves completed history', (t) => {
  const filename = fileSetup(t);
  const first = setup(t, { filename });
  const accepted = first.propose(context, add('task', 'Bewaren'));
  const receipt = approve(first, accepted);
  const pending = first.propose(context, add('task', 'Intrekken'));
  const otherSession = { ...context, sessionId: 'new-session' };
  const otherPending = first.propose(otherSession, add('shopping', 'Andere sessie'));
  assert.deepEqual(first.revokeSession(context), { sessionId: context.sessionId, revoked: true, rejectedCount: 1 });
  assert.throws(() => first.read(context), code('NOT_ALLOWED'));
  assert.throws(() => approve(first, pending), code('NOT_ALLOWED'));
  assert.throws(() => approve(first, accepted), code('NOT_ALLOWED'));
  assert.deepEqual(first.revokeSession(context), { sessionId: context.sessionId, revoked: true, rejectedCount: 0 });
  first.close();
  const second = setup(t, { filename });
  assert.throws(() => second.propose(context, add()), code('NOT_ALLOWED'));
  assert.deepEqual(second.receipts(otherSession), [receipt]);
  assert.deepEqual(second.pending(otherSession), [otherPending]);
  approve(second, otherPending, otherSession);
  assert.equal(second.read(otherSession).revision, 2);
});

test('receipt failure rolls back the entire item, revision, proposal and audit approval transaction', (t) => {
  const filename = fileSetup(t);
  const store = setup(t, { filename });
  const proposal = store.propose(context, add());
  const inspector = inspectFile(filename);
  inspector.exec("CREATE TRIGGER test_receipt_failure BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'private injected failure'); END");
  assert.throws(() => approve(store, proposal), code('STORAGE_ERROR'));
  assert.equal(store.read(context).revision, 0);
  assert.equal(store.read(context).items.length, 0);
  assert.deepEqual(store.pending(context), [proposal]);
  assert.deepEqual(store.receipts(context), []);
  assert.deepEqual(inspector.prepare('SELECT event FROM audit ORDER BY sequence').all().map((row) => row.event), ['PROPOSED']);
  inspector.exec('DROP TRIGGER test_receipt_failure');
  approve(store, proposal);
  assert.equal(store.read(context).revision, 1);
  assert.equal(store.read(context).items.length, 1);
  assert.deepEqual(inspector.prepare('SELECT event FROM audit ORDER BY sequence').all().map((row) => row.event), ['PROPOSED', 'APPROVED']);
});

test('stored action tampering cannot reuse an earlier reviewed digest', (t) => {
  const filename = fileSetup(t);
  const store = setup(t, { filename });
  const proposal = store.propose(context, add('memory', 'Toegestane herinnering'));
  const editor = inspectFile(filename);
  editor.prepare('UPDATE proposals SET action_json = ? WHERE id = ?').run(JSON.stringify(add('memory', 'Andere inhoud')), proposal.id);
  assert.throws(() => approve(store, proposal), code('NOT_ALLOWED'));
  assert.equal(store.read(context).revision, 0);
  assert.deepEqual(store.receipts(context), []);
});

test('SQL-looking user strings remain ordinary data and never change the schema', (t) => {
  const store = setup(t);
  const title = "Melk'); DROP TABLE households; --";
  const details = 'SELECT * FROM receipts; <script>alert(1)</script>\nGewone tekst.';
  const proposal = store.propose(context, { ...add('shopping', title), details });
  approve(store, proposal);
  assert.equal(store.read(context).items[0].title, title);
  assert.equal(store.read(context).items[0].details, details);
  approve(store, store.propose(context, add('task', 'De opslag werkt nog')));
  assert.equal(store.read(context).revision, 2);
});

test('configuration, clock and closed-store failures are safe and do not leave partial proposals', (t) => {
  for (const options of [null, [], { actorId: '' }, { householdId: '' }, { filename: '' }, { clock: 'now' }, { unknown: true }]) {
    assert.throws(() => createHouseholdStore(options), code('INVALID_INPUT'));
  }
  let timestamp = NaN;
  const store = setup(t, { clock: () => timestamp });
  assert.throws(() => store.propose(context, add()), code('INVALID_INPUT'));
  timestamp = 1000;
  assert.deepEqual(store.pending(context), []);
  store.close();
  store.close();
  assert.throws(() => store.read(context), code('STORE_CLOSED'));
  assert.throws(() => store.propose(context, add()), code('STORE_CLOSED'));
});
