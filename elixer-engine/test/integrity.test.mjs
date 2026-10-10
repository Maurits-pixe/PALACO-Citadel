import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSON, packageDigest, deepFreeze } from '../src/integrity.mjs';
import { createJournal } from '../src/journal.mjs';

test('package digests are reproducible despite object insertion order', () => {
  const left = { z: ['H∆R∆', { y: 2, x: 1 }], a: false, n: null };
  const right = { n: null, a: false, z: ['H∆R∆', { x: 1, y: 2 }] };
  assert.equal(canonicalJSON(left), canonicalJSON(right));
  assert.equal(packageDigest(left), packageDigest(right));
  assert.match(packageDigest(left), /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(packageDigest(left), packageDigest({ ...right, a: true }));
});

test('canonicalization refuses values that could be silently lost or rewritten', () => {
  for (const value of [
    undefined, () => 'hidden', NaN, Infinity, -Infinity,
    { omitted: undefined }, { value: NaN }, [Infinity],
    new Date('2030-01-01T00:00:00.000Z'),
    new Map([['scope', 'private']]),
    1n,
  ]) {
    assert.throws(() => canonicalJSON(value));
    assert.throws(() => packageDigest(value));
  }
  const cycle = { name: 'cycle' };
  cycle.self = cycle;
  assert.throws(() => canonicalJSON(cycle));
});

test('deepFreeze prevents edits to nested security state', () => {
  const state = deepFreeze({ scopes: ['public.read'], consent: { granted: false } });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.scopes), true);
  assert.equal(Object.isFrozen(state.consent), true);
  assert.throws(() => { state.scopes.push('household.read'); }, TypeError);
  assert.throws(() => { state.consent.granted = true; }, TypeError);
});

test('journal receipts form a verifiable immutable history', () => {
  const journal = createJournal();
  const state = { package: 'INTEGRITY_VERIFIED', conformance: 'NOT_RUN', authority: 'NONE', distribution: 'NOT_ALLOWED', activation: 'INACTIVE', freshness: 'CURRENT', execution: 'NOT_REQUESTED' };
  const makeEvent = (correlationId, resultType, reasonCodes = []) => ({ timestamp: '2030-01-01T00:00:00.000Z', correlationId, inputDigest: null, resultDigest: packageDigest({ outcome: 'synthetic' }), resultType, reasonCodes, state: { ...state } });
  const original = makeEvent('journal-one', 'READ_RESULT');
  const first = journal.append(original);
  original.resultType = 'EXECUTED_WITH_RECEIPT';
  original.reasonCodes.push('FORGED');
  const beforeSecond = journal.entries();
  const second = journal.append(makeEvent('journal-two', 'BLOCKED', ['NO_AUTHORITY']));
  const history = journal.entries();

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.notEqual(first.hash, second.hash);
  assert.notEqual(first.receiptId, second.receiptId);
  assert.equal(journal.verify(), true);
  assert.equal(history.length, 2);
  assert.equal(beforeSecond.length, 1);
  assert.equal(history[0].event.resultType, 'READ_RESULT');
  assert.deepEqual(history[0].event.reasonCodes, []);
  assert.equal(history[1].previousHash, first.hash);
  assert.equal(Object.isFrozen(history), true);
  assert.equal(Object.isFrozen(history[0].event), true);
  assert.throws(() => { history.pop(); }, TypeError);
  assert.throws(() => { history[0].event.resultType = 'EXECUTED_WITH_RECEIPT'; }, TypeError);
  assert.equal(journal.verify(), true);
});

test('a malformed journal event never advances the receipt chain', () => {
  const journal = createJournal();
  const event = { timestamp: '2030-01-01T00:00:00.000Z', correlationId: 'valid', inputDigest: null, resultDigest: packageDigest({ outcome: 'synthetic' }), resultType: 'READ_RESULT', reasonCodes: [], state: { package: 'UNRESOLVED', conformance: 'NOT_RUN', authority: 'NONE', distribution: 'NOT_ALLOWED', activation: 'INACTIVE', freshness: 'CURRENT', execution: 'NOT_REQUESTED' } };
  journal.append(event);
  assert.throws(() => journal.append({ ...event, correlationId: 'invalid', inputDigest: undefined }));
  assert.equal(journal.entries().length, 1);
  assert.equal(journal.append({ ...event, correlationId: 'second-valid', resultType: 'BLOCKED' }).sequence, 2);
  assert.equal(journal.verify(), true);
});
