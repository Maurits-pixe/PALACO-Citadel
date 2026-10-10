import test from 'node:test';
import assert from 'node:assert/strict';
import { createLab, bindPackage, FIXED_NOW } from '../src/fixtures.mjs';
import { packageDigest } from '../src/integrity.mjs';
import { validateResult } from '../src/contracts.mjs';
import { projectSurfaces } from '../src/surfaces.mjs';

const adapterIds = ['haram-v0-1', 'chingching-v0-1', 'hannie-v0-1'];
const spyAdapters = (calls, callback) => Object.fromEntries(adapterIds.map(adapterId => [adapterId, async args => {
  calls.push({ adapterId, action: args.action, keys: Object.keys(args.context) });
  if (callback) return callback(args, adapterId);
  return { recommendation: 'READ_ONLY', message: 'Synthetic read-only advice.', contextKeys: ['public'] };
}]));
const run = lab => lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });
const readScopes = lab => lab.contextReads.flatMap(read => read.scope);
const assertNoAuthority = result => {
  assert.equal(result.state.authority, 'NONE');
  assert.equal(result.state.distribution, 'NOT_ALLOWED');
  assert.equal(result.state.activation, 'INACTIVE');
  assert.notEqual(result.state.execution, 'COMMITTED');
  assert.notEqual(result.resultType, 'EXECUTED_WITH_RECEIPT');
};
const assertNoPrivateRead = lab => assert.equal(readScopes(lab).includes('household.read'), false);

test('a ready synthetic proposal validates and grants no operational authority', async () => {
  const lab = createLab();
  lab.request.what = 'PROPOSE';
  const result = await run(lab);
  assert.deepEqual(validateResult(result), { valid: true, errors: [] });
  assert.equal(result.resultType, 'PROPOSAL');
  assert.equal(result.state.package, 'INTEGRITY_VERIFIED');
  assert.equal(result.personaResults.length, 3);
  assert.equal(result.proposal.grantsAuthority, false);
  assert.equal(result.proposal.adoptedInternallyOnly, true);
  assertNoAuthority(result);
});

test('digest and manifest binding violations stop before context or personas', async () => {
  const cases = [
    lab => { lab.package.elixerId = 'tampered-package'; },
    lab => { lab.manifest.purpose = 'Changed after digest binding'; },
    lab => { lab.package.elixerId = 'foreign-package'; lab.manifest.packageDigest = packageDigest(lab.package); lab.request.packageDigest = lab.manifest.packageDigest; },
    lab => { lab.request.elixerId = 'foreign-request'; },
  ];
  for (const alter of cases) {
    const calls = [];
    const lab = createLab({ adapters: spyAdapters(calls) });
    alter(lab);
    const result = await run(lab);
    assert.equal(result.resultType, 'BLOCKED');
    assert.equal(lab.contextReads.length, 0);
    assert.equal(calls.length, 0);
    assertNoAuthority(result);
  }
});

test('actor and each context boundary are verified before fetching data', async () => {
  for (const field of ['who', 'tenantId', 'worldId', 'citadelId']) {
    const calls = [];
    const lab = createLab({ adapters: spyAdapters(calls) });
    lab.request[field] = 'foreign-context';
    const result = await run(lab);
    assert.equal(result.resultType, 'BLOCKED', field);
    assert.equal(lab.contextReads.length, 0, field);
    assert.equal(calls.length, 0, field);
    assertNoAuthority(result);
  }
});

test('scope requests cannot create permissions absent from the policy', async () => {
  const calls = [];
  const lab = createLab({ adapters: spyAdapters(calls) });
  lab.request.scope = ['public.read', 'calendar.write'];
  const result = await run(lab);
  assert.equal(result.resultType, 'BLOCKED');
  assert.equal(lab.contextReads.length, 0);
  assert.equal(calls.length, 0);
  assertNoAuthority(result);
});

test('missing authorization is invalid, while explicit null remains a non-grant', async () => {
  const missing = createLab();
  delete missing.request.authorization;
  const denied = await run(missing);
  assert.equal(denied.resultType, 'BLOCKED');
  assert.equal(missing.contextReads.length, 0);

  const explicit = createLab();
  explicit.request.what = 'READ';
  explicit.request.authorization = null;
  const read = await run(explicit);
  assert.equal(read.resultType, 'READ_RESULT');
  assert.equal(read.authorization.status, 'NOT_PROVIDED');
  assertNoAuthority(read);
});

test('missing consent reduces a public/private request to public read-only data', async () => {
  const calls = [];
  const lab = createLab({ scenario: 'no-consent', adapters: spyAdapters(calls) });
  lab.request.what = 'READ';
  lab.request.scope = ['public.read', 'household.read'];
  const result = await run(lab);
  assert.equal(result.scope.includes('household.read'), false);
  assert.equal(result.scope.includes('public.read'), true);
  assertNoPrivateRead(lab);
  assert.equal(calls.every(call => !call.keys.includes('household')), true);
  assertNoAuthority(result);
});

test('a consent record for another actor cannot unlock private context', async () => {
  const lab = createLab();
  lab.request.what = 'READ';
  lab.records.consent.actorId = 'another-actor';
  const result = await run(lab);
  assert.equal(result.scope.includes('household.read'), false);
  assertNoPrivateRead(lab);
  assertNoAuthority(result);
});

test('expired consent never enables private context', async () => {
  const lab = createLab();
  lab.request.what = 'READ';
  lab.records.consent.expiresAt = '2000-01-01T00:00:00.000Z';
  const result = await run(lab);
  assert.equal(result.scope.includes('household.read'), false);
  assertNoPrivateRead(lab);
  assertNoAuthority(result);
});

test('revocation blocks new actions and preserves historical receipts', async () => {
  const lab = createLab();
  lab.request.what = 'READ';
  const first = await run(lab);
  const history = lab.engine.history();
  const receipts = lab.engine.journal.entries();
  assert.equal(first.resultType, 'READ_RESULT');
  lab.records.revocation.revokedRefs.push(lab.manifest.elixerId);
  lab.request.correlationId = 'after-revocation';
  const blocked = await run(lab);
  assert.equal(blocked.resultType, 'REVOKED');
  assert.equal(lab.engine.history()[0].resultId, history[0].resultId);
  assert.deepEqual(lab.engine.journal.entries()[0], receipts[0]);
  assert.equal(lab.engine.journal.verify(), true);
  assertNoAuthority(blocked);
});

test('revocation is rechecked between persona calls and discards derived output', async () => {
  const calls = [];
  let lab;
  const adapters = spyAdapters(calls, () => {
    lab.records.revocation.revokedRefs.push(lab.manifest.elixerId);
    return { recommendation: 'READ_ONLY', message: 'PRIVATE_DERIVED_SENTINEL', contextKeys: ['household'] };
  });
  lab = createLab({ adapters });
  const result = await run(lab);
  assert.equal(result.resultType, 'REVOKED');
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_DERIVED_SENTINEL'), false);
  assertNoAuthority(result);
});

test('expiration is rechecked after a persona yields', async () => {
  let clock = FIXED_NOW;
  let lab;
  const calls = [];
  const adapters = spyAdapters(calls, () => {
    clock = '2099-01-01T00:00:00.000Z';
    return { recommendation: 'READ_ONLY', message: 'EXPIRED_DERIVED_SENTINEL', contextKeys: ['household'] };
  });
  lab = createLab({ now: () => clock, adapters });
  const result = await run(lab);
  assert.equal(result.resultType, 'EXPIRED');
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes('EXPIRED_DERIVED_SENTINEL'), false);
  assertNoAuthority(result);
});

test('expired package and request stop before any context fetch', async () => {
  for (const kind of ['manifest', 'request']) {
    const calls = [];
    const lab = createLab({ adapters: spyAdapters(calls) });
    if (kind === 'manifest') {
      lab.manifest.expiresAt = '2000-01-01T00:00:00.000Z';
      bindPackage(lab);
    } else lab.request.expiration = '2000-01-01T00:00:00.000Z';
    const result = await run(lab);
    assert.equal(result.resultType, 'EXPIRED', kind);
    assert.equal(lab.contextReads.length, 0, kind);
    assert.equal(calls.length, 0, kind);
    assertNoAuthority(result);
  }
});

test('dependency outage yields public-only offline read-only state', async () => {
  const lab = createLab({ scenario: 'offline' });
  const result = await run(lab);
  assert.equal(result.resultType, 'OFFLINE_READ_ONLY');
  assert.equal(result.scope.includes('household.read'), false);
  assertNoPrivateRead(lab);
  assertNoAuthority(result);
});

test('production context is rejected before reaching a persona', async () => {
  const calls = [];
  const lab = createLab({
    adapters: spyAdapters(calls),
    loadContext: async () => ({ classification: 'PRODUCTION', public: { summary: 'PRIVATE_PRODUCTION_SENTINEL' } }),
  });
  const result = await run(lab);
  assert.equal(result.resultType, 'BLOCKED');
  assert.equal(calls.length, 0);
  assert.equal(JSON.stringify(result).includes('PRIVATE_PRODUCTION_SENTINEL'), false);
  assertNoAuthority(result);
});

test('adapter exceptions become unavailable advice without leaking exception text', async () => {
  const lab = createLab({
    adapters: { 'haram-v0-1': async () => { throw new Error('PRIVATE_ERROR_SENTINEL'); } },
  });
  const result = await run(lab);
  assert.equal(result.personaResults.some(persona => persona.personaId === 'HARAM' && persona.status === 'UNAVAILABLE'), true);
  assert.equal(JSON.stringify(result).includes('PRIVATE_ERROR_SENTINEL'), false);
  assert.notEqual(result.resultType, 'PROPOSAL');
  assertNoAuthority(result);
});

test('a persona timeout is bounded and cannot yield an accepted proposal', async () => {
  const lab = createLab({ adapters: { 'haram-v0-1': () => new Promise(() => {}) } });
  lab.manifest.personaRefs[0].timeoutMs = 20;
  bindPackage(lab);
  const result = await run(lab);
  assert.equal(result.personaResults.some(persona => persona.personaId === 'HARAM' && persona.status === 'UNAVAILABLE'), true);
  assert.notEqual(result.resultType, 'PROPOSAL');
  assertNoAuthority(result);
});

test('internal majority preserves dissent and cannot authorize execution', async () => {
  const lab = createLab({ scenario: 'conflict' });
  lab.request.what = 'PROPOSE';
  const result = await run(lab);
  assert.equal(result.dissent.length > 0, true);
  assert.equal(result.personaResults.length, 3);
  assert.equal(result.personaResults.some(persona => persona.recommendation === 'PAUSE'), true);
  if (result.proposal) assert.equal(result.proposal.grantsAuthority, false);
  assertNoAuthority(result);
});

test('consent cannot substitute for execution authorization', async () => {
  const calls = [];
  const lab = createLab({ adapters: spyAdapters(calls) });
  lab.request.what = 'EXECUTE';
  lab.request.authorization = null;
  const result = await run(lab);
  assert.equal(result.resultType, 'EXECUTION_PENDING_AUTHORIZATION');
  assert.equal(result.state.execution, 'AUTH_PENDING');
  assert.equal(lab.contextReads.length, 0);
  assert.equal(calls.length, 0);
  assertNoAuthority(result);
});

test('even a claimed authorization cannot invoke external execution in this kernel', async () => {
  const calls = [];
  const lab = createLab({ adapters: spyAdapters(calls) });
  lab.request.what = 'EXECUTE';
  lab.request.authorization = 'claimed-authorization';
  const result = await run(lab);
  assert.equal(result.resultType, 'BLOCKED');
  assert.equal(result.state.execution, 'DENIED');
  assert.equal(lab.contextReads.length, 0);
  assert.equal(calls.length, 0);
  assertNoAuthority(result);
});

test('missing provenance remains explicitly unknown', async () => {
  const lab = createLab();
  lab.manifest.provenanceRefs = [];
  lab.request.provenanceRefs = [];
  bindPackage(lab);
  const result = await run(lab);
  assert.equal(result.resultType, 'REVIEW_REQUIRED');
  assert.equal(result.evidence.provenance, 'UNKNOWN');
  assertNoAuthority(result);
});

test('full and widget projections carry the same immutable canonical result', async () => {
  for (const scenario of ['ready', 'revoked', 'expired', 'offline', 'conflict']) {
    const lab = createLab({ scenario });
    const result = await run(lab);
    const surfaces = projectSurfaces(result);
    assert.equal(surfaces.full.result, result);
    assert.equal(surfaces.widget.result, result);
    assert.equal(surfaces.full.canonicalResultId, result.resultId);
    assert.equal(surfaces.widget.canonicalResultId, result.resultId);
    assert.equal(surfaces.full.canonicalDigest, packageDigest(result));
    assert.equal(surfaces.widget.canonicalDigest, surfaces.full.canonicalDigest);
    assert.deepEqual(surfaces.widget.result.state, result.state);
    assert.deepEqual(surfaces.widget.result.uncertainty, result.uncertainty);
    assert.deepEqual(surfaces.widget.result.dissent, result.dissent);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.state), true);
    assert.throws(() => { result.state.authority = 'ISSUED_REFERENCE'; }, TypeError);
  }
});

test('trace receipts bind outcomes without copying free-form request text', async () => {
  const lab = createLab();
  lab.request.why = 'PRIVATE_REASON_SENTINEL';
  const result = await run(lab);
  const entries = lab.engine.journal.entries();
  assert.equal(JSON.stringify(entries).includes('PRIVATE_REASON_SENTINEL'), false);
  assert.equal(entries.at(-1).hash, result.trace.hash);
  assert.equal(entries.at(-1).receiptId, result.trace.receiptId);
  assert.equal(lab.engine.journal.verify(), true);
});

test('consent revocation during orchestration stops further private processing', async () => {
  const calls = [];
  let lab;
  const adapters = spyAdapters(calls, () => {
    lab.records.consent.revoked = true;
    return { recommendation: 'READ_ONLY', message: 'REVOKED_CONSENT_SENTINEL', contextKeys: ['household'] };
  });
  lab = createLab({ adapters });
  const result = await run(lab);
  assert.equal(calls.length, 1);
  assert.equal(result.personaResults.length, 0);
  assert.equal(JSON.stringify(result).includes('REVOKED_CONSENT_SENTINEL'), false);
  assert.equal(['BLOCKED', 'REVOKED', 'REVIEW_REQUIRED'].includes(result.resultType), true);
  assertNoAuthority(result);
});

test('unknown revocation status cannot be treated as current', async () => {
  const calls = [];
  const lab = createLab({ adapters: spyAdapters(calls) });
  lab.records.revocation.state = 'UNKNOWN';
  lab.request.revocationState = 'UNKNOWN';
  const result = await run(lab);
  assert.equal(['BLOCKED', 'REVIEW_REQUIRED', 'STALE'].includes(result.resultType), true);
  assert.equal(lab.contextReads.length, 0);
  assert.equal(calls.length, 0);
  assertNoAuthority(result);
});

test('a mid-run policy replacement invalidates previously derived advice', async () => {
  const calls = [];
  let lab;
  const adapters = spyAdapters(calls, () => {
    lab.records.policy.version = 'replaced-policy';
    return { recommendation: 'READ_ONLY', message: 'OLD_POLICY_SENTINEL', contextKeys: ['public'] };
  });
  lab = createLab({ adapters });
  const result = await run(lab);
  assert.equal(calls.length, 1);
  assert.equal(result.resultType, 'BLOCKED');
  assert.equal(JSON.stringify(result).includes('OLD_POLICY_SENTINEL'), false);
  assertNoAuthority(result);
});

test('trusted context metadata is minimized before loaders and personas receive it', async () => {
  const template = createLab();
  const observed = [];
  const trustedContext = {
    actorId: template.request.who,
    tenantId: template.request.tenantId,
    worldId: template.request.worldId,
    citadelId: template.request.citadelId,
    extraSecret: 'TRUSTED_CONTEXT_SECRET_SENTINEL',
  };
  const adapters = Object.fromEntries(adapterIds.map(id => [id, async ({ identity }) => {
    observed.push(identity);
    return { recommendation: 'READ_ONLY', message: 'Synthetic advice.', contextKeys: ['public'] };
  }]));
  const lab = createLab({
    trustedContext,
    adapters,
    loadContext: async ({ identity }) => {
      observed.push(identity);
      return { classification: 'SYNTHETIC_ONLY', public: { summary: 'Synthetic public context.' }, household: { schedule: [] } };
    },
  });
  const result = await run(lab);
  assert.equal(result.personaResults.length, 3);
  assert.equal(observed.length > 0, true);
  assert.equal(JSON.stringify(observed).includes('TRUSTED_CONTEXT_SECRET_SENTINEL'), false);
  assert.equal(observed.every(identity => !Object.hasOwn(identity, 'extraSecret')), true);
  assertNoAuthority(result);
});

test('context minimization removes extra fields at every household/public depth', async () => {
  const observed = [];
  const adapters = Object.fromEntries(adapterIds.map(id => [id, async ({ context }) => {
    observed.push(context);
    return { recommendation: 'READ_ONLY', message: 'Synthetic advice.', contextKeys: ['public'] };
  }]));
  const lab = createLab({
    adapters,
    loadContext: async () => ({
      classification: 'SYNTHETIC_ONLY',
      public: { summary: 'Synthetic public context.', extraSecret: 'PUBLIC_EXTRA_SECRET_SENTINEL' },
      household: {
        extraSecret: 'HOUSEHOLD_EXTRA_SECRET_SENTINEL',
        schedule: [{ label: 'Synthetic appointment', at: '2030-01-01T12:00:00.000Z', extraSecret: 'SCHEDULE_EXTRA_SECRET_SENTINEL' }],
      },
      extraSecret: 'OUTER_EXTRA_SECRET_SENTINEL',
    }),
  });
  const result = await run(lab);
  assert.equal(observed.length, 3);
  assert.equal(JSON.stringify(observed).includes('_SECRET_SENTINEL'), false);
  for (const context of observed) {
    assert.deepEqual(Object.keys(context.public), ['summary']);
    if (context.household) {
      assert.deepEqual(Object.keys(context.household), ['schedule']);
      assert.deepEqual(Object.keys(context.household.schedule[0]).sort(), ['at', 'label']);
    }
  }
  assertNoAuthority(result);
});

test('a huge unknown request key produces a valid blocked result and receipt', async () => {
  const lab = createLab();
  const key = 'UNKNOWN_KEY_SECRET_SENTINEL_' + 'x'.repeat(4096);
  lab.request[key] = 'untrusted input';
  const result = await run(lab);
  assert.equal(result.resultType, 'BLOCKED');
  assert.deepEqual(validateResult(result), { valid: true, errors: [] });
  assert.equal(JSON.stringify(result).includes('UNKNOWN_KEY_SECRET_SENTINEL'), false);
  assert.equal(JSON.stringify(lab.engine.journal.entries()).includes('UNKNOWN_KEY_SECRET_SENTINEL'), false);
  assert.equal(lab.engine.journal.verify(), true);
  assert.equal(lab.contextReads.length, 0);
  assertNoAuthority(result);
});

test('runtime callers can inspect the journal but cannot append fabricated receipts', () => {
  const lab = createLab();
  assert.equal(typeof lab.engine.journal.entries, 'function');
  assert.equal(typeof lab.engine.journal.verify, 'function');
  assert.equal(lab.engine.journal.append, undefined);
  assert.equal(Object.isFrozen(lab.engine.journal), true);
});

test('expiration at the final publication edge discards every persona output', async () => {
  let finishing = false;
  let finishingClockCalls = 0;
  const expiration = new Date(Date.parse(FIXED_NOW) + 1000).toISOString();
  const calls = [];
  const adapters = spyAdapters(calls, (_args, adapterId) => {
    if (adapterId === 'hannie-v0-1') finishing = true;
    return { recommendation: 'READ_ONLY', message: 'FINAL_EDGE_ADVICE_SENTINEL', contextKeys: ['public'] };
  });
  const now = () => {
    if (finishing && ++finishingClockCalls >= 3) return expiration;
    return FIXED_NOW;
  };
  const lab = createLab({ now, adapters });
  lab.request.expiration = expiration;
  const result = await run(lab);
  assert.equal(calls.length, 3);
  assert.equal(finishingClockCalls >= 3, true);
  assert.equal(result.resultType, 'EXPIRED');
  assert.equal(result.personaResults.length, 0);
  assert.equal(JSON.stringify(result).includes('FINAL_EDGE_ADVICE_SENTINEL'), false);
  assertNoAuthority(result);
});

test('correlation reuse is blocked without returning cached private advice', async () => {
  const lab = createLab();
  lab.request.what = 'READ';
  const first = await run(lab);
  assert.equal(first.resultType, 'READ_RESULT');
  const readsBefore = lab.contextReads.length;
  const duplicate = await run(lab);
  assert.equal(duplicate.resultType, 'BLOCKED');
  assert.equal(lab.contextReads.length, readsBefore);
  assert.equal(duplicate.personaResults.length, 0);
  assert.notEqual(duplicate.resultId, first.resultId);
  assertNoAuthority(duplicate);
});

test('a mid-run dependency outage discards private advice already derived', async () => {
  const dependencies = { 'synthetic-memory': true };
  const calls = [];
  const adapters = spyAdapters(calls, () => {
    dependencies['synthetic-memory'] = false;
    return { recommendation: 'READ_ONLY', message: 'OFFLINE_PRIVATE_ADVICE_SENTINEL', contextKeys: ['household'] };
  });
  const lab = createLab({ dependencies, adapters });
  const result = await run(lab);
  assert.equal(calls.length, 1);
  assert.equal(result.resultType, 'REVIEW_REQUIRED');
  assert.equal(result.scope.includes('household.read'), false);
  assert.equal(result.personaResults.length, 0);
  assert.equal(JSON.stringify(result).includes('OFFLINE_PRIVATE_ADVICE_SENTINEL'), false);
  assertNoAuthority(result);
});
