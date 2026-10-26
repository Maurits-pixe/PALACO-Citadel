import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { startRuntimeServer } from '../server.mjs';

const test = (name, fn) => nodeTest(name, { timeout: 10000 }, fn);
const task = (title = 'Was ophangen') => ({ operation: 'add', kind: 'task', title, details: 'Synthetische test', dueDate: null });
const shopping = (title = 'Havermelk') => ({ operation: 'add', kind: 'shopping', title, details: '', dueDate: null });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function runtime(t, respond = async () => 'Ik denk met je mee.', options = {}) {
  const fixture = await startRuntimeServer({ port: 0, filename: ':memory:', brain: { respond }, providerConfigured: true, ...options });
  t.after(() => fixture.close());
  return fixture;
}

async function session(fixture, existingCookie) {
  let cookie = existingCookie, token;
  async function request(path, { method = 'GET', body, rawBody, headers = {} } = {}) {
    const mutation = method !== 'GET' && method !== 'HEAD';
    const requestHeaders = {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(mutation ? { Origin: fixture.origin, 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) } : {}),
      ...headers
    };
    for (const name of Object.keys(requestHeaders)) if (requestHeaders[name] === undefined) delete requestHeaders[name];
    const response = await fetch(`${fixture.origin}${path}`, {
      method, headers: requestHeaders, redirect: 'manual',
      ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';', 1)[0];
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (data?.csrfToken) token = data.csrfToken;
    if (data?.state?.csrfToken) token = data.state.csrfToken;
    return { response, status: response.status, data, text, setCookie };
  }
  const initialized = await request('/api/state');
  assert.equal(initialized.status, 200);
  return { request, initial: initialized, get cookie() { return cookie; }, get token() { return token; },
    async state() { const result = await request('/api/state'); assert.equal(result.status, 200); return result.data; },
    async consent(chat = true, household = true) { return request('/api/consent', { method: 'POST', body: { chat, household } }); },
    async chat(message) { return request('/api/chat', { method: 'POST', body: { message } }); },
    async approve(proposal) { return request(`/api/proposals/${proposal.id}/approve`, { method: 'POST', body: { digest: proposal.digest } }); },
    async reject(proposal) { return request(`/api/proposals/${proposal.id}/reject`, { method: 'POST', body: {} }); }
  };
}

function error(result, status, code) {
  assert.equal(result.status, status, result.text);
  assert.equal(result.data?.error?.code ?? result.data?.code, code, result.text);
  assert.ok(!('state' in (result.data ?? {})), 'Errors must not include the household or conversation state.');
}

async function pending(client, message = 'Maak een voorstel') {
  const result = await client.chat(message);
  assert.equal(result.status, 200, result.text);
  const proposal = result.data.state.proposals.find(row => row.status === 'PENDING');
  assert.ok(proposal?.id);
  assert.match(proposal.digest, /^(?:sha256:)?[a-f0-9]{64}$/);
  return proposal;
}

test('exhausted provider credit is a safe actionable failure without retained conversation or proposals', async t => {
  const fixture = await runtime(t, async () => { throw Object.assign(new Error('private provider diagnostic'), { code: 'credit_balance_exhausted', status: 429 }); });
  const client = await session(fixture); await client.consent();
  const result = await client.chat('Synthetische vraag');
  error(result, 503, 'PROVIDER_CREDIT_EXHAUSTED');
  assert.match(result.data.error.message, /API-tegoed/);
  assert.equal(result.text.includes('private provider diagnostic'), false);
  const state = await client.state(); assert.deepEqual(state.conversation, []); assert.deepEqual(state.proposals, []);
  assert.equal(state.runtime.providerConnection, 'UNVERIFIED');
});

test('a fresh browser gets a paused runtime, independent consent and an HTTP-only CSRF-bound session', async t => {
  const fixture = await runtime(t), client = await session(fixture), state = client.initial.data;
  assert.equal(state.runtime.state, 'PAUSED');
  assert.equal(state.runtime.providerConfigured, true);
  assert.equal(state.runtime.providerConnection, 'UNVERIFIED');
  assert.equal(state.consent.chat, false);
  assert.equal(state.consent.household, false);
  assert.deepEqual(state.conversation, []);
  assert.deepEqual(state.proposals, []);
  assert.deepEqual(state.household.items, []);
  assert.ok(state.csrfToken.length >= 32);
  assert.match(client.initial.setCookie, /^hara_session=/);
  assert.match(client.initial.setCookie, /;\s*HttpOnly/i);
  assert.match(client.initial.setCookie, /;\s*SameSite=Strict/i);
  assert.match(client.initial.setCookie, /;\s*Path=\/(?:;|$)/i);
  assert.equal(client.initial.response.headers.get('cache-control'), 'no-store');
  assert.equal(client.initial.response.headers.get('access-control-allow-origin'), null);
});

test('every mutation requires the exact browser origin and the session CSRF token', async t => {
  let calls = 0;
  const fixture = await runtime(t, async () => { calls++; return 'Antwoord'; }), client = await session(fixture);
  for (const headers of [
    { Origin: undefined }, { Origin: 'https://attacker.invalid' }, { Origin: `${fixture.origin}.attacker.invalid` },
    { 'X-CSRF-Token': undefined }, { 'X-CSRF-Token': 'wrong-token' }
  ]) {
    const result = await client.request('/api/consent', { method: 'POST', body: { chat: true, household: true }, headers });
    assert.equal(result.status, 403, result.text);
  }
  assert.equal((await client.state()).runtime.state, 'PAUSED');
  assert.equal(calls, 0);
  const other = await session(fixture);
  assert.notEqual(other.token, client.token);
  assert.equal((await other.request('/api/consent', { method: 'POST', body: { chat: true, household: true }, headers: { 'X-CSRF-Token': client.token } })).status, 403);
});

test('only exact local routes are served and API query strings cannot carry hidden context', async t => {
  const fixture = await runtime(t), client = await session(fixture);
  for (const path of ['/api/state?actor=someone', '/api/chat?x=1', '/api/state/', '/.env.local', '/server.mjs', '/package.json', '/test/server.test.mjs']) {
    const result = await client.request(path);
    assert.ok([400, 404, 405].includes(result.status), `${path}: ${result.status}`);
    assert.ok(!result.text.includes('OPENAI_API_KEY='));
    assert.ok(!result.text.includes('startRuntimeServer('));
  }
  // Native fetch controls Host itself; use a raw HTTP request to actually send the hostile header.
  const spoofed = await new Promise((resolve, reject) => {
    const request = httpRequest(`${fixture.origin}/api/state`, { headers: { Host: 'attacker.invalid', Cookie: client.cookie } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', reject);
    request.end();
  });
  assert.ok([400, 403].includes(spoofed.status), spoofed.text);
  const method = await client.request('/api/state', { method: 'DELETE', body: {} });
  assert.ok([404, 405].includes(method.status), method.text);
});

test('malformed, oversized and identity-bearing inputs are rejected without echoing their content', async t => {
  let calls = 0;
  const fixture = await runtime(t, async () => { calls++; return 'Antwoord'; }), client = await session(fixture);
  await client.consent();
  const marker = 'SYNTHETIC_PRIVATE_MARKER_872';
  for (const body of [
    { message: marker, actorId: 'another-person' }, { message: marker, sessionId: 'another-session' },
    { message: marker, householdId: 'another-household' }, { message: marker, history: [] },
    { message: marker, provider: 'other' }, { message: 12 }, { message: '' }, { message: '   ' }, [], null
  ]) {
    const result = await client.request('/api/chat', { method: 'POST', body });
    error(result, 400, 'INVALID_INPUT');
    assert.ok(!result.text.includes(marker));
  }
  const malformed = await client.request('/api/chat', { method: 'POST', rawBody: '{"message":' });
  error(malformed, 400, 'INVALID_INPUT');
  const wrongType = await client.request('/api/chat', { method: 'POST', body: { message: marker }, headers: { 'Content-Type': 'text/plain' } });
  assert.ok([400, 415].includes(wrongType.status));
  const oversized = await client.request('/api/chat', { method: 'POST', body: { message: marker.repeat(10000) } });
  error(oversized, 413, 'BODY_TOO_LARGE');
  assert.ok(!oversized.text.includes(marker));
  assert.equal(calls, 0);
  assert.deepEqual((await client.state()).conversation, []);
});

test('chat is impossible before explicit chat consent and an absent provider is not reported as connected', async t => {
  let calls = 0;
  const fixture = await runtime(t, async () => { calls++; return 'Antwoord'; }), client = await session(fixture);
  error(await client.chat('Nog geen toestemming'), 403, 'CONSENT_REQUIRED');
  assert.equal(calls, 0);
  const unavailable = await runtime(t, async () => { calls++; return 'Antwoord'; }, { providerConfigured: false });
  const withoutProvider = await session(unavailable);
  await withoutProvider.consent();
  error(await withoutProvider.chat('Geen sleutel aanwezig'), 503, 'PROVIDER_UNAVAILABLE');
  assert.equal((await withoutProvider.state()).runtime.providerConnection, 'UNVERIFIED');
  assert.equal(calls, 0);
});

test('a successful turn uses server-owned history and does not silently grant household access', async t => {
  const calls = [];
  const fixture = await runtime(t, async args => { calls.push({ input: args.input, history: structuredClone(args.history) }); return `Antwoord ${calls.length}`; });
  const client = await session(fixture);
  assert.equal((await client.consent(true, false)).status, 200);
  assert.equal((await client.chat('Eerste vraag')).status, 200);
  const result = await client.chat('Tweede vraag');
  assert.equal(result.status, 200, result.text);
  assert.deepEqual(calls.map(row => row.input), ['Eerste vraag', 'Tweede vraag']);
  assert.ok(JSON.stringify(calls[1].history).includes('Eerste vraag'));
  assert.ok(JSON.stringify(calls[1].history).includes('Antwoord 1'));
  assert.equal(result.data.state.runtime.providerConnection, 'VERIFIED');
  assert.equal(result.data.state.consent.household, false);
  assert.equal(result.data.state.conversation.length, 4);
  assert.deepEqual(result.data.state.household.items, []);
});

test('household reading and proposals each require their own explicit consent', async t => {
  for (const respond of [
    async ({ readHousehold }) => { await readHousehold(); return 'Geen toegang'; },
    async ({ proposeChange }) => { await proposeChange(task()); return 'Geen voorstel'; }
  ]) {
    const fixture = await runtime(t, respond), client = await session(fixture);
    await client.consent(true, false);
    error(await client.chat('Bekijk mijn huishouden'), 403, 'CONTEXT_CONSENT_REQUIRED');
    const state = await client.state();
    assert.deepEqual(state.household.items, []);
    assert.deepEqual(state.proposals, []);
  }
});

test('a model proposal does not mutate the household; only its exact human approval creates a receipt', async t => {
  const observed = [];
  const fixture = await runtime(t, async ({ readHousehold, proposeChange }) => {
    observed.push(await readHousehold());
    await proposeChange(task());
    return 'Wil je deze taak toevoegen?';
  }), client = await session(fixture);
  await client.consent();
  const proposal = await pending(client);
  const before = await client.state();
  assert.equal(observed.length, 1);
  assert.deepEqual(before.household.items, []);
  assert.deepEqual(before.receipts, []);
  assert.equal((await client.request(`/api/proposals/${proposal.id}/approve`, { method: 'POST', body: { digest: proposal.digest, actorId: 'pretend-human' } })).status, 400);
  error(await client.approve({ ...proposal, digest: '0'.repeat(64) }), 403, 'NOT_ALLOWED');
  const approved = await client.approve(proposal);
  assert.equal(approved.status, 200, approved.text);
  assert.equal(approved.data.state.household.items.length, 1);
  assert.equal(approved.data.state.household.items[0].title, 'Was ophangen');
  assert.equal(approved.data.state.proposals.some(row => row.id === proposal.id), false);
  assert.equal(approved.data.state.receipts.length, 1);
  const retried = await client.approve(proposal);
  assert.equal(retried.status, 200, retried.text);
  assert.deepEqual(retried.data.state.receipts, approved.data.state.receipts);
  assert.deepEqual(retried.data.state.household, approved.data.state.household);
});

test('one browser cannot approve or reject another browser’s pending change', async t => {
  const fixture = await runtime(t, async ({ proposeChange }) => { await proposeChange(shopping()); return 'Voorstel'; });
  const first = await session(fixture), second = await session(fixture);
  await first.consent(); await second.consent();
  const proposal = await pending(first);
  assert.deepEqual((await second.state()).proposals, []);
  for (const result of [await second.approve(proposal), await second.reject(proposal)]) assert.ok([403, 404].includes(result.status), result.text);
  assert.equal((await first.state()).proposals.find(row => row.id === proposal.id).status, 'PENDING');
  assert.deepEqual((await first.state()).household.items, []);
});

test('rejecting a proposal is terminal and never changes the household', async t => {
  const fixture = await runtime(t, async ({ proposeChange }) => { await proposeChange(shopping()); return 'Voorstel'; }), client = await session(fixture);
  await client.consent();
  const proposal = await pending(client), rejected = await client.reject(proposal);
  assert.equal(rejected.status, 200, rejected.text);
  assert.equal(rejected.data.state.proposals.some(row => row.id === proposal.id), false);
  assert.deepEqual(rejected.data.state.household.items, []);
  error(await client.approve(proposal), 403, 'NOT_ALLOWED');
  const retried = await client.reject(proposal);
  assert.equal(retried.status, 200, retried.text);
  assert.deepEqual(retried.data.state.household, rejected.data.state.household);
  assert.deepEqual(retried.data.state.receipts, []);
});

test('revision-bound approval refuses a stale proposal rather than overwriting a newer household', async t => {
  const fixture = await runtime(t, async ({ proposeChange }) => {
    await proposeChange(task('Eerste taak'));
    await proposeChange(shopping('Tweede voorstel'));
    return 'Twee afzonderlijke voorstellen';
  }), client = await session(fixture);
  await client.consent();
  assert.equal((await client.chat('Twee voorstellen')).status, 200);
  const proposals = (await client.state()).proposals;
  assert.equal(proposals.length, 2);
  assert.equal((await client.approve(proposals[0])).status, 200);
  error(await client.approve(proposals[1]), 409, 'STALE_PROPOSAL');
  const after = await client.state();
  assert.equal(after.household.items.length, 1);
  assert.equal(after.receipts.length, 1);
});

test('task completion and forgetting a saved memory are separate proposals requiring separate human approvals', async t => {
  const fixture = await runtime(t, async ({ input, readHousehold, proposeChange }) => {
    const snapshot = await readHousehold();
    const items = snapshot.items ?? snapshot.household?.items ?? [];
    if (input === 'Maak taak') await proposeChange(task('Raam openzetten'));
    else if (input === 'Rond taak af') await proposeChange({ operation: 'complete', itemId: items.find(row => row.kind === 'task').id, done: true });
    else if (input === 'Bewaar herinnering') await proposeChange({ operation: 'add', kind: 'memory', title: 'Plant op woensdag', details: 'Synthetische voorkeur', dueDate: null });
    else await proposeChange({ operation: 'forget', itemId: items.find(row => row.kind === 'memory').id });
    return 'Controleer dit afzonderlijke voorstel.';
  }), client = await session(fixture);
  await client.consent();
  await client.approve(await pending(client, 'Maak taak'));
  const completion = await pending(client, 'Rond taak af');
  assert.equal((await client.state()).household.items.find(row => row.kind === 'task').done, false);
  assert.equal((await client.approve(completion)).status, 200);
  assert.equal((await client.state()).household.items.find(row => row.kind === 'task').done, true);
  await client.approve(await pending(client, 'Bewaar herinnering'));
  const forgetting = await pending(client, 'Vergeet herinnering');
  assert.equal((await client.state()).household.items.filter(row => row.kind === 'memory').length, 1);
  assert.equal((await client.approve(forgetting)).status, 200);
  const after = await client.state();
  assert.equal(after.household.items.filter(row => row.kind === 'memory').length, 0);
  assert.equal(after.household.items.filter(row => row.kind === 'task').length, 1);
  assert.equal(after.receipts.length, 4);
});

test('in-flight turns are exclusive per browser and cannot publish after chat or household consent is revoked', async t => {
  for (const keepChat of [false, true]) {
    const entered = deferred(), finish = deferred();
    let aborted = false;
    const fixture = await runtime(t, async ({ signal, proposeChange }) => {
      signal.addEventListener('abort', () => { aborted = true; }, { once: true });
      await proposeChange(task());
      entered.resolve();
      await finish.promise;
      return 'LATE_OUTPUT_MUST_NOT_APPEAR';
    }), client = await session(fixture);
    await client.consent();
    const running = client.chat('Trage beurt');
    await entered.promise;
    error(await client.chat('Tweede gelijktijdige beurt'), 409, 'BUSY');
    const revoked = await client.consent(keepChat, false);
    assert.equal(revoked.status, 200, revoked.text);
    assert.equal(aborted, true, 'Revocation must reach the actual provider signal.');
    finish.resolve();
    error(await running, 409, 'TURN_CANCELLED');
    const after = await client.state();
    assert.deepEqual(after.conversation, []);
    assert.deepEqual(after.proposals, []);
    assert.deepEqual(after.household.items, []);
    assert.ok(!JSON.stringify(after).includes('LATE_OUTPUT_MUST_NOT_APPEAR'));
  }
});

test('reset aborts the active turn and clears chat and proposals while retaining confirmed household records', async t => {
  const entered = deferred(), finish = deferred();
  let count = 0, aborted = false;
  const fixture = await runtime(t, async ({ proposeChange, signal }) => {
    count++;
    if (count === 1) { await proposeChange(task()); return 'Taakvoorstel'; }
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    await proposeChange(shopping());
    entered.resolve(); await finish.promise;
    return 'LATE_RESET_OUTPUT';
  }), client = await session(fixture);
  await client.consent();
  await client.approve(await pending(client));
  const running = client.chat('Trage vervolgvraag');
  await entered.promise;
  const reset = await client.request('/api/reset', { method: 'POST', body: {} });
  assert.equal(reset.status, 200, reset.text);
  assert.equal(aborted, true);
  finish.resolve();
  error(await running, 409, 'TURN_CANCELLED');
  const state = await client.state();
  assert.deepEqual(state.conversation, []);
  assert.deepEqual(state.proposals, []);
  assert.equal(state.household.items.length, 1);
  assert.equal(state.household.items[0].title, 'Was ophangen');
  assert.equal(state.receipts.length, 1);
});

test('a provider deadline aborts the actual request even when a broken provider never settles', async t => {
  let aborted = false;
  const fixture = await runtime(t, async ({ signal }) => {
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    await new Promise(() => {});
  }, { deadlineMs: 35 }), client = await session(fixture);
  await client.consent();
  error(await client.chat('Synthetische timeout'), 504, 'PROVIDER_TIMEOUT');
  assert.equal(aborted, true);
  const state = await client.state();
  assert.notEqual(state.runtime.state, 'THINKING');
  assert.ok(!state.conversation.some(row => row.role === 'assistant'));
});

test('provider exceptions are redacted and a failed connection is never presented as verified', async t => {
  const marker = 'SYNTHETIC_PROVIDER_SECRET_193';
  const fixture = await runtime(t, async () => { throw new Error(`Provider upstream ${marker}: /private/.env.local`); });
  const client = await session(fixture);
  await client.consent();
  const failed = await client.chat('Synthetische providerfout');
  error(failed, 502, 'PROVIDER_UNAVAILABLE');
  assert.ok(!failed.text.includes(marker));
  assert.ok(!failed.text.includes('.env.local'));
  assert.ok(!failed.text.includes('upstream'));
  const state = await client.state();
  assert.equal(state.runtime.providerConnection, 'UNVERIFIED');
  assert.ok(!JSON.stringify(state).includes(marker));
});

test('confirmed data survives reopening the configured local household without restoring provider consent', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'hara-http-test-'));
  const filename = join(directory, 'household.sqlite');
  let first = await startRuntimeServer({ port: 0, filename, brain: { respond: async ({ proposeChange }) => {
    await proposeChange(task('Blijvende taak')); return 'Bewaarvoorstel';
  } }, providerConfigured: true });
  let second;
  t.after(async () => { await first?.close(); await second?.close(); await rm(directory, { recursive: true, force: true }); });
  const client = await session(first);
  await client.consent();
  assert.equal((await client.approve(await pending(client))).status, 200);
  const cookie = client.cookie;
  await first.close();
  first = undefined;
  second = await startRuntimeServer({ port: 0, filename, brain: { respond: async () => 'Antwoord' }, providerConfigured: true });
  const resumed = await session(second, cookie), state = await resumed.state();
  assert.equal(state.household.items.length, 1);
  assert.equal(state.household.items[0].title, 'Blijvende taak');
  assert.equal(state.receipts.length, 1);
  assert.equal(state.runtime.state, 'PAUSED', 'Provider consent must not silently survive a runtime restart.');
  const stranger = await session(second);
  const fresh = await stranger.state();
  assert.equal(fresh.household.items[0].title, 'Blijvende taak', 'This loopback-only runtime has one explicitly configured local household.');
  assert.equal(fresh.consent.chat, false);
  assert.equal(fresh.consent.household, false);
  error(await stranger.chat('Geen toestemming in de nieuwe browser'), 403, 'CONSENT_REQUIRED');
});
