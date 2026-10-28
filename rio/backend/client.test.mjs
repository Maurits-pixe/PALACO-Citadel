import test from 'node:test';
import assert from 'node:assert/strict';
import { createRioWorkspace, validateRioConfiguration } from './client.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PERSON = '33333333-3333-4333-8333-333333333333';
const NOTE = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const configuration = { provider: 'supabase', configured: true, url: 'https://rio-synthetic.supabase.co', publishableKey: 'sb_publishable_SYNTHETIC_TEST_ONLY_123456' };
const verifiedUser = () => ({ id: USER, email: 'synthetic@example.test', email_confirmed_at: '2026-10-27T00:00:00Z', is_anonymous: false });
const noteInput = () => ({ title: 'Een gedachte', body: 'Alleen synthetische testtekst.', consent: true });
const stored = args => ({ id: NOTE, title: args.p_title, body: args.p_body, client_request_id: args.p_client_request_id, created_at: '2026-10-27T12:00:00Z' });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(overrides = {}) {
  const calls = [];
  const clients = [];
  const mock = { user: verifiedUser(), person: PERSON, ...overrides };
  const createClientImpl = (url, key, options) => {
    const instance = { url, key, options, callback: null };
    const auth = {
      async signInWithOtp(args) { calls.push(['otp', args]); return mock.otp ? mock.otp(args) : { data: {}, error: null }; },
      async verifyOtp(args) { calls.push(['verify', args]); return mock.verify ? mock.verify(args) : { data: { user: { id: OTHER }, session: { access_token: 'synthetic-ignored' } }, error: null }; },
      async getUser() { calls.push(['getUser']); return mock.getUser ? mock.getUser() : { data: { user: mock.user }, error: null }; },
      async signOut(args) { calls.push(['signOut', args, clients.indexOf(instance)]); return { error: null }; },
      stopAutoRefresh() { calls.push(['stopAutoRefresh', clients.indexOf(instance)]); },
      onAuthStateChange(callback) { instance.callback = callback; return { data: { subscription: { unsubscribe() { instance.callback = null; } } } }; },
    };
    const client = { auth,
      async rpc(name, args) {
        calls.push(['rpc', name, args]);
        if (name === 'rio_current_person') return mock.mapping ? mock.mapping() : { data: mock.person, error: null };
        if (name === 'rio_create_note') return mock.create ? mock.create(args) : { data: [stored(args)], error: null };
        throw new Error('Unexpected RPC');
      },
      from(table) { calls.push(['from', table]); return {
        select(fields) { calls.push(['select', fields]); return this; },
        order(field, options) { calls.push(['order', field, options]); return this; },
        async limit(limit) { calls.push(['limit', limit]); return mock.read ? mock.read() : { data: [], error: null }; },
      }; },
    };
    Object.assign(instance, client); clients.push(instance); return client;
  };
  const workspace = createRioWorkspace({ configuration, createClientImpl });
  return { workspace, calls, mock, clients, async login() { assert.deepEqual(await workspace.verifyCode({ email: 'synthetic@example.test', token: '123456' }), { ok: true }); } };
}

test('unconfigured and unsafe configurations fail closed without constructing an SDK client', async () => {
  const rejected = [undefined, { ...configuration, configured: false }, { ...configuration, provider: 'firebase' },
    { ...configuration, url: 'http://rio-synthetic.supabase.co' }, { ...configuration, url: 'https://rio-synthetic.supabase.co.evil.test' },
    { ...configuration, url: 'https://rio-synthetic.supabase.co/path' }, { ...configuration, url: 'https://a:b@rio-synthetic.supabase.co' },
    { ...configuration, url: 'https://rio-synthetic.supabase.co/?x=1' }, { ...configuration, url: 'https://rio-synthetic.supabase.co/#token' },
    { ...configuration, publishableKey: 'sb_secret_SYNTHETIC_TEST_ONLY' }, { ...configuration, publishableKey: 'eyJhbGciOiJIUzI1NiJ9.synthetic.signature' },
    { ...configuration, publishableKey: 'service_role' }];
  for (const value of rejected) {
    assert.equal(validateRioConfiguration(value), null);
    const workspace = createRioWorkspace({ configuration: value, createClientImpl() { assert.fail('SDK must not be constructed'); } });
    assert.equal(workspace.snapshot().phase, 'not_configured');
    assert.deepEqual(await workspace.requestCode('synthetic@example.test'), { ok: false, error: 'not_configured' });
  }
});

test('SDK session is memory-only, URL sessions are disabled, and initialization sends nothing', () => {
  const { workspace, clients, calls } = fixture();
  assert.deepEqual(clients[0].options, { auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true } });
  assert.deepEqual(calls, []);
  assert.equal(workspace.snapshot().phase, 'signed_out');
  assert.doesNotMatch(JSON.stringify(workspace.snapshot()), /access_token|refresh_token|publishableKey|SYNTHETIC_TEST_ONLY/);
});

test('only explicit code request sends an email request and never creates a user', async () => {
  const { workspace, calls } = fixture();
  assert.deepEqual(await workspace.requestCode('synthetic@example.test'), { ok: true });
  assert.deepEqual(calls, [['otp', { email: 'synthetic@example.test', options: { shouldCreateUser: false } }]]);
  assert.equal(workspace.snapshot().phase, 'code_sent');
  assert.equal(workspace.snapshot().user, null);
});

test('invalid email and OTP never reach the provider', async () => {
  const { workspace, calls } = fixture();
  assert.equal((await workspace.requestCode('not-an-email')).error, 'invalid_email');
  for (const token of ['12345', '123456789', 'abc123', '123 456', null]) {
    assert.equal((await workspace.verifyCode({ email: 'synthetic@example.test', token })).error, 'invalid_code');
  }
  assert.deepEqual(calls, []);
});

test('OTP response is not an authorization source: fresh getUser and database mapping determine identity', async () => {
  const { workspace, calls, login } = fixture();
  await login();
  assert.deepEqual(calls.map(call => call[0]), ['verify', 'getUser', 'rpc']);
  assert.deepEqual(calls[0][1], { email: 'synthetic@example.test', token: '123456', type: 'email' });
  assert.equal(workspace.snapshot().user.id, USER);
  assert.equal(workspace.snapshot().personId, PERSON);
  assert.doesNotMatch(JSON.stringify(workspace.snapshot()), /access_token|synthetic-ignored/);
});

test('anonymous, unverified and user-metadata claims cannot create account authority', async () => {
  for (const user of [{ ...verifiedUser(), is_anonymous: true },
    { id: USER, email: 'synthetic@example.test', user_metadata: { email_verified: true, person_id: PERSON } }, null]) {
    const { workspace, calls } = fixture({ user });
    assert.equal((await workspace.verifyCode({ email: 'synthetic@example.test', token: '123456' })).ok, false);
    assert.equal(workspace.snapshot().personId, null);
    assert.equal(calls.some(call => call[0] === 'rpc'), false);
  }
});

test('verified phone is accepted only with a fresh server-returned person mapping', async () => {
  const { workspace, login } = fixture({ user: { id: USER, phone: '+31000000000', phone_confirmed_at: '2026-10-27T00:00:00Z', is_anonymous: false } });
  await login();
  assert.equal(workspace.snapshot().phase, 'ready');
  assert.equal(workspace.snapshot().user.label, '+31000000000');
});

test('missing or denied enrollment clears private state and blocks private table access', async () => {
  for (const override of [{ person: null }, { mapping: () => ({ data: PERSON, error: { message: 'secret provider detail' } }) }]) {
    const { workspace, calls } = fixture(override);
    const result = await workspace.verifyCode({ email: 'synthetic@example.test', token: '123456' });
    assert.equal(result.ok, false);
    assert.equal(workspace.snapshot().personId, null);
    await workspace.listNotes();
    assert.equal(calls.some(call => call[0] === 'from'), false);
    assert.doesNotMatch(JSON.stringify(workspace.snapshot()), /secret provider detail/);
  }
});

test('notes read uses only the owned-note projection and rechecks server identity and mapping afterwards', async () => {
  const { workspace, calls, login } = fixture({ read: () => ({ data: [stored({ p_title: '<script>synthetic</script>', p_body: 'Text only', p_client_request_id: REQUEST })], error: null }) });
  await login(); calls.length = 0;
  const result = await workspace.listNotes();
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['getUser'], ['rpc', 'rio_current_person', undefined], ['from', 'rio_notes'],
    ['select', 'id,title,body,created_at,client_request_id'], ['order', 'created_at', { ascending: false }], ['limit', 100],
    ['getUser'], ['rpc', 'rio_current_person', undefined]]);
  assert.equal(workspace.snapshot().notes[0].title, '<script>synthetic</script>');
});

test('mapping revoked during read suppresses the late private response', async () => {
  const { workspace, mock, login } = fixture();
  await login();
  mock.read = () => { mock.person = null; return { data: [stored({ p_title: 'Private', p_body: 'Never publish', p_client_request_id: REQUEST })], error: null }; };
  assert.equal((await workspace.listNotes()).error, 'enrollment_required');
  assert.deepEqual(workspace.snapshot().notes, []);
  assert.equal(workspace.snapshot().phase, 'enrollment_required');
});

test('server account switch or revoked mapping blocks a new save before mutation', async () => {
  for (const mutate of [mock => { mock.user = { ...verifiedUser(), id: OTHER }; }, mock => { mock.person = null; }]) {
    const { workspace, mock, calls, login } = fixture();
    await login(); mutate(mock);
    assert.equal((await workspace.saveNote(noteInput())).ok, false);
    assert.equal(calls.some(call => call[0] === 'rpc' && call[1] === 'rio_create_note'), false);
    assert.equal(workspace.snapshot().personId, null);
  }
});

test('explicit consent and valid note are required before any private request', async () => {
  const { workspace, calls, login } = fixture();
  await login(); calls.length = 0;
  for (const input of [{ ...noteInput(), consent: false }, { ...noteInput(), title: '   ' },
    { ...noteInput(), body: '\n  ' }, { ...noteInput(), title: '😀'.repeat(121) }, { ...noteInput(), body: 'x'.repeat(8001) }]) {
    assert.equal((await workspace.saveNote(input)).ok, false);
  }
  assert.deepEqual(calls, []);
});

test('RPC saves only explicit note fields, preserves exact Unicode/whitespace and never imports RIO or HARAM context', async () => {
  const { workspace, calls, login } = fixture();
  await login(); calls.length = 0;
  const input = { title: '😀'.repeat(120), body: '  My exact thought\n', consent: true, temporaryChat: 'NEVER SEND', household: 'NEVER SEND', actor: OTHER };
  const result = await workspace.saveNote(input);
  assert.equal(result.ok, true);
  const rpc = calls.find(call => call[1] === 'rio_create_note');
  assert.deepEqual(Object.keys(rpc[2]).sort(), ['p_body', 'p_client_request_id', 'p_consent', 'p_title']);
  assert.equal(rpc[2].p_title, input.title); assert.equal(rpc[2].p_body, input.body); assert.equal(rpc[2].p_consent, true);
  assert.doesNotMatch(JSON.stringify(calls), /NEVER SEND|temporaryChat|household/);
  assert.equal(calls.filter(call => call[0] === 'getUser').length, 2);
});

test('uncertain save retry reuses its request UUID; successful save creates a new intent', async () => {
  let attempt = 0;
  const { workspace, calls, login } = fixture({ create: args => ++attempt === 1 ? Promise.reject(new Error('network')) : { data: [stored(args)], error: null } });
  await login();
  assert.equal((await workspace.saveNote(noteInput())).ok, false);
  assert.equal((await workspace.saveNote(noteInput())).ok, true);
  assert.equal((await workspace.saveNote(noteInput())).ok, true);
  const ids = calls.filter(call => call[1] === 'rio_create_note').map(call => call[2].p_client_request_id);
  assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]);
});

test('editing a failed draft or changing consent replaces its intent even if the text is later restored', async () => {
  const { workspace, calls, login } = fixture({ create: () => ({ data: null, error: { message: 'Unavailable' } }) });
  await login(); await workspace.saveNote(noteInput());
  workspace.updateDraft({ ...noteInput(), title: 'Changed' }); workspace.updateDraft(noteInput());
  await workspace.saveNote(noteInput());
  workspace.updateDraft({ ...noteInput(), consent: false }); workspace.updateDraft(noteInput());
  await workspace.saveNote(noteInput());
  const ids = calls.filter(call => call[1] === 'rio_create_note').map(call => call[2].p_client_request_id);
  assert.equal(new Set(ids).size, 3);
});

test('concurrent save is rejected without sending a second create request', async () => {
  const pending = deferred();
  const { workspace, calls, login } = fixture({ create: () => pending.promise });
  await login(); const first = workspace.saveNote(noteInput()); await settle();
  assert.equal((await workspace.saveNote(noteInput())).error, 'busy');
  const args = calls.find(call => call[1] === 'rio_create_note')[2]; pending.resolve({ data: [stored(args)], error: null });
  assert.equal((await first).ok, true);
  assert.equal(calls.filter(call => call[1] === 'rio_create_note').length, 1);
});

test('logout immediately clears private state and ignores late note reads', async () => {
  const pending = deferred(); const { workspace, clients, calls, login } = fixture({ read: () => pending.promise });
  await login(); const loading = workspace.listNotes(); await settle();
  assert.equal((await workspace.signOut()).ok, true);
  assert.equal(clients.length, 2); assert.equal(workspace.snapshot().phase, 'signed_out');
  pending.resolve({ data: [stored({ p_title: 'Late private', p_body: 'Must stay absent', p_client_request_id: REQUEST })], error: null });
  assert.equal((await loading).error, 'stale_result'); assert.deepEqual(workspace.snapshot().notes, []);
  assert.deepEqual(calls.find(call => call[0] === 'signOut')[1], { scope: 'local' });
});

test('logout ignores late save responses and never claims that uncertain server writes were undone', async () => {
  const pending = deferred(); const { workspace, calls, login } = fixture({ create: () => pending.promise });
  await login(); const saving = workspace.saveNote(noteInput()); await settle();
  const args = calls.find(call => call[1] === 'rio_create_note')[2]; await workspace.signOut();
  pending.resolve({ data: [stored(args)], error: null });
  assert.deepEqual(await saving, { ok: false, error: 'stale_result' }); assert.equal(workspace.snapshot().user, null);
  assert.deepEqual(workspace.snapshot().notes, []);
});

test('late OTP cannot restore the discarded session or sign out the replacement client', async () => {
  const pending = deferred(); const { workspace, clients, calls } = fixture({ verify: () => pending.promise });
  const verifying = workspace.verifyCode({ email: 'synthetic@example.test', token: '123456' }); await settle();
  await workspace.signOut(); pending.resolve({ data: { session: { access_token: 'late' } }, error: null });
  assert.equal((await verifying).error, 'stale_result');
  assert.equal(workspace.snapshot().phase, 'signed_out'); assert.equal(clients.length, 2);
  assert.ok(calls.filter(call => call[0] === 'signOut').every(call => call[2] === 0));
  assert.equal(calls.some(call => call[0] === 'getUser'), false);
});

test('provider signout event invalidates an already pending private response', async () => {
  const pending = deferred(); const { workspace, clients, login } = fixture({ read: () => pending.promise });
  await login(); const reading = workspace.listNotes(); await settle(); clients[0].callback('SIGNED_OUT', null);
  pending.resolve({ data: [], error: null });
  assert.equal((await reading).error, 'stale_result'); assert.equal(workspace.snapshot().phase, 'signed_out');
});

test('provider failure details and malformed rows never become displayed private state', async () => {
  const { workspace, mock, login } = fixture(); await login();
  mock.read = () => ({ data: [{ id: NOTE, title: 'broken' }], error: null });
  assert.equal((await workspace.listNotes()).error, 'invalid_response'); assert.deepEqual(workspace.snapshot().notes, []);
  mock.read = () => ({ data: null, error: { message: 'Authorization: Bearer secret' } });
  assert.equal((await workspace.listNotes()).error, 'notes_read_failed');
  assert.doesNotMatch(JSON.stringify(workspace.snapshot()), /Bearer secret/);
});
