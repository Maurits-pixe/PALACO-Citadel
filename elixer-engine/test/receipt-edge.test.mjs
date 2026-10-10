import test from 'node:test';
import assert from 'node:assert/strict';
import { createLab, FIXED_NOW } from '../src/fixtures.mjs';
import { createPersonaAdapters } from '../src/personas.mjs';
import { packageDigest } from '../src/integrity.mjs';

const run = lab => lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });

test('revocation freshness remains mandatory at the final receipt time', async () => {
  let finishing = false, finalCalls = 0;
  const adapters = createPersonaAdapters();
  const hannie = adapters['hannie-v0-1'];
  adapters['hannie-v0-1'] = async args => { const result = await hannie(args); finishing = true; return result; };
  const lab = createLab({
    adapters,
    now: () => finishing && ++finalCalls >= 3 ? '2026-10-10T10:01:01.000Z' : FIXED_NOW,
  });
  const result = await run(lab);
  assert.equal(result.resultType, 'STALE');
  assert.equal(result.state.freshness, 'STALE');
  assert.deepEqual(result.scope, []);
  assert.deepEqual(result.personaResults, []);
});

test('a historical result can be checked against its receipt result digest', async () => {
  const lab = createLab();
  const result = await run(lab);
  const body = { ...result };
  delete body.trace;
  assert.equal(lab.engine.journal.entries()[0].event.resultDigest, packageDigest(body));
  assert.deepEqual(lab.engine.history()[0], result);
  assert.equal(Object.isFrozen(lab.engine.history()[0]), true);
});

test('an unknown host clock emits an explicit unknown timestamp without inventing time', async () => {
  const lab = createLab({ now: () => 'unavailable' });
  const result = await run(lab);
  assert.equal(result.resultType, 'REVIEW_REQUIRED');
  assert.equal(result.state.freshness, 'STALE');
  assert.equal(lab.engine.journal.entries()[0].event.timestamp, null);
  assert.deepEqual(result.scope, []);
});

test('different canonical outcomes have different content-derived result identifiers', async () => {
  const ready = createLab(), revoked = createLab({ scenario: 'revoked' });
  const left = await run(ready), right = await run(revoked);
  assert.notEqual(left.resultId, right.resultId);
});
