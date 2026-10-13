import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mountDeviceTest } from './device-test.mjs';

const API = '/api/rio/device-test';
const SCOPE = 'RIO_DEVICE_CHALLENGE_V1';
const hex32 = /^[a-f0-9]{32}$/;
const hex64 = /^[a-f0-9]{64}$/;

// Real HTTP fixtures; never print cookie, invite or CSRF credentials in assertion diagnostics.
async function fixture(t, overrides = {}) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const app = express();
  let time = 1_900_000_000_000;
  let serial = 0;
  const lifecycle = mountDeviceTest(app, {
    baseURL: origin, development: true, now: () => time, ...overrides,
  });
  server.on('request', app);
  t.after(async () => {
    lifecycle.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const key = () => (++serial).toString(16).padStart(32, '0');
  async function call(path, { method = 'GET', guest, body, rawBody, headers = {},
    sendOrigin = method !== 'GET', sendCsrf = true } = {}) {
    const final = {
      ...(sendOrigin ? { Origin: origin } : {}),
      ...(guest ? { Cookie: guest.cookie } : {}),
      ...(guest && sendCsrf ? { 'X-Device-Test-CSRF': guest.csrf } : {}),
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    };
    const response = await fetch(origin + API + path, {
      method, headers: final, redirect: 'error',
      ...(body !== undefined || rawBody !== undefined ? { body: rawBody ?? JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { status: response.status, data, headers: response.headers, text };
  }
  async function session() {
    const result = await call('/session', { method: 'POST', body: {} });
    assert.equal(result.status, 200, 'guest bootstrap succeeds');
    const cookie = result.headers.get('set-cookie');
    assert.ok(typeof cookie === 'string', 'guest has an opaque cookie');
    assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'), 'guest cookie is restricted');
    assert.ok(!cookie.includes('Domain='), 'guest cookie is host-only');
    const credential = cookie.split(';')[0].split('=')[1];
    assert.ok(hex64.test(credential), 'guest cookie has 256-bit shape');
    assert.ok(hex64.test(result.data.session.csrfToken), 'guest CSRF has 256-bit shape');
    assert.ok(!result.text.includes(credential), 'cookie credential never appears in JSON');
    return { cookie: cookie.split(';')[0], csrf: result.data.session.csrfToken, result };
  }
  const read = guest => call('/pair', { guest });
  const create = (guest, idempotencyKey = key()) => call('/pair', {
    method: 'POST', guest, body: { idempotencyKey },
  });
  const join = (guest, inviteToken, idempotencyKey = key()) => call('/join', {
    method: 'POST', guest, body: { inviteToken, idempotencyKey },
  });
  async function action(guest, name, extra = {}, idempotencyKey = key()) {
    const current = await read(guest);
    assert.equal(current.status, 200, 'participant can inspect current pair');
    return call('/pair/actions', { method: 'POST', guest, body: {
      action: name, pairId: current.data.pair.id, revision: current.data.pair.revision, idempotencyKey, ...extra,
    } });
  }
  async function active() {
    const a = await session();
    const b = await session();
    const created = await create(a);
    assert.equal(created.status, 201, 'A creates a diagnostic pair');
    assert.ok(hex64.test(created.data.inviteToken), 'invitation has 256-bit shape');
    const joined = await join(b, created.data.inviteToken);
    assert.equal(joined.status, 200, 'distinct B joins');
    assert.equal((await action(a, 'accept', { scope: SCOPE })).status, 200);
    const accepted = await action(b, 'accept', { scope: SCOPE });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.pair.state, 'ACTIVE_TEST');
    return { a, b, pair: accepted.data.pair, invite: created.data.inviteToken };
  }
  return { app, lifecycle, origin, call, session, read, create, join, action, active, key,
    now: () => time, advance: amount => { time += amount; } };
}

test('runtime and guest bootstrap leave all account, identity and contact gates closed', async t => {
  const commit = 'a'.repeat(40);
  const f = await fixture(t, { buildCommit: commit });
  const runtime = await f.call('/runtime');
  assert.equal(runtime.status, 200);
  assert.equal(runtime.data.mode, 'TEST_ONLY');
  assert.equal(runtime.data.authenticatedIdentity, false);
  assert.equal(runtime.data.accountActive, false);
  assert.equal(runtime.data.account1, 'HOLD');
  assert.equal(runtime.data.accountAccess, 'CLOSED');
  assert.equal(runtime.data.auth, 'HOLD');
  assert.equal(runtime.data.serverReadable, true);
  assert.equal(runtime.data.canOpenContact, false);
  assert.equal(runtime.data.operativeAuthority, 'NONE');
  assert.equal(runtime.data.endToEndEncrypted, false);
  assert.equal(runtime.data.generatedCodesOnly, true);
  assert.equal(runtime.data.storage, 'volatile-memory');
  assert.equal(runtime.data.buildCommit, commit);
  assert.ok(Number.isFinite(Date.parse(runtime.data.serverTime)), 'runtime provides a server clock');
  assert.ok(runtime.headers.get('cache-control')?.includes('no-store'));
  assert.equal(runtime.headers.get('access-control-allow-origin'), null);
  const a = await f.session();
  assert.ok(!a.result.data.pair, 'bootstrap does not invent a pair');
  assert.equal((await f.read(a)).status, 404);
  assert.equal((await f.call('/pair')).status, 401);
  assert.ok(!Object.hasOwn(a.result.data, 'identity'), 'guest has no identity claim');
});

test('two independent guest sessions transfer a generated challenge and reply with recipient ACKs', async t => {
  const f = await fixture(t);
  const { a, b } = await f.active();
  assert.ok(a.cookie !== b.cookie, 'guest sessions are distinct');
  assert.ok(a.csrf !== b.csrf, 'CSRF tokens are session-specific');
  const sent = await f.action(a, 'challenge');
  assert.equal(sent.status, 200);
  const received = await f.read(b);
  const challenge = received.data.pair.messages[0];
  assert.ok(hex32.test(challenge.id) && hex32.test(challenge.code), 'only generated diagnostic identifiers and codes');
  assert.equal(challenge.kind, 'CHALLENGE');
  assert.equal(challenge.from, 'A');
  assert.equal(challenge.sequence, 1);
  assert.equal(challenge.acknowledged, false);
  assert.equal((await f.action(a, 'ack', { messageId: challenge.id })).status, 404, 'sender cannot ACK its own message');
  assert.equal((await f.action(b, 'reply', { messageId: challenge.id })).status, 409, 'reply needs recipient ACK');
  assert.equal((await f.action(b, 'ack', { messageId: challenge.id })).status, 200);
  const reply = await f.action(b, 'reply', { messageId: challenge.id });
  assert.equal(reply.status, 200);
  const back = (await f.read(a)).data.pair.messages[1];
  assert.equal(back.kind, 'REPLY');
  assert.equal(back.from, 'B');
  assert.equal(back.sequence, 2);
  assert.ok(back.replyTo === challenge.id, 'reply binds the exact challenge');
  assert.ok(back.code === challenge.code, 'reply echoes the server-generated challenge');
  assert.equal(back.acknowledged, false);
  assert.equal((await f.action(a, 'ack', { messageId: back.id })).status, 200);
  const completed = (await f.read(b)).data.pair;
  assert.ok(completed.messages.every(item => item.acknowledged), 'both recipients have explicitly ACKed');
  assert.equal((await f.action(b, 'reply', { messageId: challenge.id })).status, 409, 'only one reply per challenge');
});

test('single-use invitation requires a distinct session and cannot be recovered on create replay', async t => {
  const f = await fixture(t);
  const a = await f.session(), b = await f.session(), outsider = await f.session();
  const createKey = f.key(), joinKey = f.key();
  const created = await f.create(a, createKey);
  const self = await f.join(a, created.data.inviteToken);
  assert.ok([403, 404, 409].includes(self.status), 'A cannot join its own invitation');
  const replay = await f.create(a, createKey);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.ok(!Object.hasOwn(replay.data, 'inviteToken'), 'invitation is returned only once');
  const joined = await f.join(b, created.data.inviteToken, joinKey);
  assert.equal(joined.status, 200);
  const repeated = await f.join(b, created.data.inviteToken, joinKey);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.replayed, true);
  assert.equal((await f.join(outsider, created.data.inviteToken)).status, 404);
  assert.equal((await f.read(outsider)).status, 404);
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: outsider,
    body: { action: 'challenge', pairId: joined.data.pair.id, revision: joined.data.pair.revision, idempotencyKey: f.key() } })).status, 404);
  const guessed = await f.call('/pair', { guest: outsider, headers: { 'X-Pair-ID': joined.data.pair.id } });
  assert.equal(guessed.status, 404, 'browser claims cannot select another session pair');
});

test('acceptance binds the exact pair revision and scope and requires both sessions', async t => {
  const f = await fixture(t);
  const a = await f.session(), b = await f.session();
  const created = await f.create(a);
  assert.equal((await f.action(a, 'accept', { scope: SCOPE })).status, 409);
  assert.equal((await f.action(a, 'challenge')).status, 409);
  const joined = await f.join(b, created.data.inviteToken);
  assert.equal((await f.action(a, 'accept', { scope: 'CHAT_OR_ACCOUNT_ACCESS' })).status, 400);
  const first = await f.action(a, 'accept', { scope: SCOPE });
  assert.equal(first.status, 200);
  assert.equal(first.data.pair.state, 'WAITING_ACCEPT');
  assert.equal(first.data.pair.consent.A, true);
  assert.equal(first.data.pair.consent.B, false);
  assert.equal((await f.action(a, 'challenge')).status, 409);
  const stale = await f.call('/pair/actions', { method: 'POST', guest: b,
    body: { action: 'accept', pairId: joined.data.pair.id, scope: SCOPE, revision: joined.data.pair.revision, idempotencyKey: f.key() } });
  assert.equal(stale.status, 409, 'stale consent revision cannot activate a pair');
  const final = await f.action(b, 'accept', { scope: SCOPE });
  assert.equal(final.data.pair.state, 'ACTIVE_TEST');
  assert.equal((await f.action(a, 'accept', { scope: SCOPE })).status, 409);
});

test('idempotent message replay precedes stale revision checks and conflicts stay isolated', async t => {
  const f = await fixture(t);
  const { a, b } = await f.active();
  const initial = await f.read(a), requestKey = f.key();
  const body = { action: 'challenge', pairId: initial.data.pair.id, revision: initial.data.pair.revision, idempotencyKey: requestKey };
  const sent = await f.call('/pair/actions', { method: 'POST', guest: a, body });
  assert.equal(sent.status, 200);
  const replay = await f.call('/pair/actions', { method: 'POST', guest: a,
    body: { idempotencyKey: requestKey, pairId: body.pairId, revision: body.revision, action: 'challenge' } });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.ok(replay.data.messageId === sent.data.messageId, 'replay returns the original effect');
  assert.equal(replay.data.pair.messages.length, 1);
  const conflict = await f.call('/pair/actions', { method: 'POST', guest: a,
    body: { ...body, revision: sent.data.pair.revision } });
  assert.equal(conflict.status, 409);
  const current = await f.read(b);
  const peer = await f.call('/pair/actions', { method: 'POST', guest: b,
    body: { action: 'challenge', pairId: current.data.pair.id, revision: current.data.pair.revision, idempotencyKey: requestKey } });
  assert.equal(peer.status, 200, 'idempotency namespace belongs to the actual sender session');
  assert.equal(peer.data.pair.messages.length, 2);
});

test('Origin, private-read context, CSRF ownership and exact host protect the guest boundary', async t => {
  const f = await fixture(t);
  const a = await f.session(), b = await f.session();
  for (const origin of ['https://attacker.example', f.origin + '.attacker.example', 'null']) {
    assert.equal((await f.call('/session', { method: 'POST', body: {}, headers: { Origin: origin } })).status, 403);
  }
  assert.equal((await f.call('/session', { method: 'POST', body: {}, sendOrigin: false })).status, 403);
  assert.equal((await f.create(a)).status, 201);
  assert.equal((await f.call('/pair', { guest: a, headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await f.call('/pair', { guest: a, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await f.call('/pair', { method: 'POST', guest: b, body: { idempotencyKey: f.key() }, sendCsrf: false })).status, 403);
  assert.equal((await f.call('/pair', { method: 'POST', guest: b, body: { idempotencyKey: f.key() },
    headers: { 'X-Device-Test-CSRF': a.csrf } })).status, 403);
  assert.equal((await f.call('/runtime', { headers: { Host: 'attacker.example' } })).status, 400);
  assert.equal((await f.call('/pair', { guest: a, headers: { Cookie: a.cookie + '; ' + a.cookie } })).status, 400);
});

test('bounded strict request schemas reject personal text, claims, token queries and malformed bodies', async t => {
  const f = await fixture(t);
  const { a } = await f.active();
  const current = (await f.read(a)).data.pair;
  for (const body of [
    { action: 'challenge', pairId: current.id, revision: current.revision, idempotencyKey: f.key(), text: 'PERSONAL_TEXT_MUST_NOT_RELAY' },
    { action: 'challenge', pairId: current.id, revision: current.revision, idempotencyKey: f.key(), verified: true },
    { action: 'challenge', pairId: current.id, revision: current.revision, idempotencyKey: [f.key()] },
    { action: 'challenge', pairId: current.id, revision: '4', idempotencyKey: f.key() },
    { action: 'accept', pairId: current.id, revision: current.revision, idempotencyKey: f.key(), scope: 'OTHER_SCOPE' },
    null, [], 'not-an-object',
  ]) {
    assert.equal((await f.call('/pair/actions', { method: 'POST', guest: a, body })).status, 400);
  }
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: a, rawBody: '{broken' })).status, 400);
  assert.equal((await f.call('/session', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.call('/session', { method: 'POST', rawBody: JSON.stringify({ text: 'x'.repeat(1500) }) })).status, 413);
  assert.equal((await f.call('/pair?token=blocked', { guest: a })).status, 400);
  assert.equal((await f.call('/pair/', { guest: a })).status, 404);
  assert.equal((await f.read(a)).data.pair.messages.length, 0, 'rejected payloads never enter relay storage');
});

test('pair and message capacities are enforced and closing erases content and both bindings', async t => {
  const f = await fixture(t, { maxPairs: 1, maxMessages: 2 });
  const { a, b } = await f.active();
  const outsider = await f.session();
  assert.equal((await f.create(outsider)).status, 503);
  assert.equal((await f.action(a, 'challenge')).status, 200);
  assert.equal((await f.action(b, 'challenge')).status, 200);
  assert.equal((await f.action(a, 'challenge')).status, 429);
  const before = (await f.read(a)).data.pair;
  assert.equal(before.messages.length, 2);
  const closed = await f.action(a, 'close');
  assert.equal(closed.status, 200);
  assert.equal(closed.data.pair.state, 'CLOSED');
  assert.equal(closed.data.pair.messages.length, 0, 'close response contains no codes');
  assert.equal((await f.read(a)).status, 404, 'A loses the pair binding');
  assert.equal((await f.read(b)).status, 404, 'B loses the pair binding');
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: b,
    body: { action: 'ack', pairId: before.id, revision: before.revision, idempotencyKey: f.key(), messageId: before.messages[0].id } })).status, 404);
  assert.equal((await f.create(outsider)).status, 201, 'closed pair frees capacity');
});

test('close revokes both peers even at stale revision, and replay cannot close a newer pair', async t => {
  const f = await fixture(t);
  const a = await f.session(), b = await f.session();
  const created = await f.create(a);
  const oldBody = { action: 'close', pairId: created.data.pair.id, revision: created.data.pair.revision, idempotencyKey: f.key() };
  assert.equal((await f.join(b, created.data.inviteToken)).status, 200);
  const closed = await f.call('/pair/actions', { method: 'POST', guest: a, body: oldBody });
  assert.equal(closed.status, 200, 'negative revocation wins despite a newer pair revision');
  assert.equal((await f.read(a)).status, 404);
  assert.equal((await f.read(b)).status, 404);
  const fresh = await f.create(a);
  assert.equal(fresh.status, 201);
  const repeated = await f.call('/pair/actions', { method: 'POST', guest: a, body: oldBody });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.replayed, true);
  const current = await f.read(a);
  assert.ok(current.data.pair.id === fresh.data.pair.id, 'old close replay cannot revoke the newer pair');
  assert.equal((await f.action(a, 'close')).status, 200);
  assert.equal((await f.join(b, fresh.data.inviteToken)).status, 404, 'closed invitation cannot enroll a peer');
});

test('pair expiry destroys messages and invitations using a fixed deadline without poll extensions', async t => {
  const f = await fixture(t, { pairTtlMs: 1500, sessionTtlMs: 10000 });
  const { a, b, invite } = await f.active();
  assert.equal((await f.action(a, 'challenge')).status, 200);
  const deadline = (await f.read(b)).data.pair.expiresAt;
  f.advance(1000);
  assert.equal((await f.read(b)).data.pair.expiresAt, deadline);
  f.advance(501);
  assert.equal((await f.read(a)).status, 404);
  assert.equal((await f.read(b)).status, 404);
  assert.equal((await f.join(await f.session(), invite)).status, 404);
  const resumed = await f.call('/session', { method: 'POST', guest: a, body: {} });
  assert.equal(resumed.status, 200);
  assert.ok(!resumed.data.pair, 'expired pair is not recovered by bootstrap');
});

test('session expiry removes peer capability and a new guest session does not resurrect the old pair', async t => {
  const f = await fixture(t, { sessionTtlMs: 1000, pairTtlMs: 5000 });
  const a = await f.session();
  const created = await f.create(a);
  f.advance(100);
  const b = await f.session();
  assert.equal((await f.join(b, created.data.inviteToken)).status, 200);
  f.advance(901);
  assert.equal((await f.read(a)).status, 401);
  assert.equal((await f.read(b)).status, 404, 'unexpired peer has no surviving pair capability');
  const renewed = await f.session();
  assert.ok(renewed.cookie !== a.cookie, 'expired session gets a fresh opaque credential');
  assert.equal((await f.read(renewed)).status, 404);
});

test('explicit session end clears both sides and cookie capabilities immediately', async t => {
  const f = await fixture(t);
  const { a, b } = await f.active();
  assert.equal((await f.action(a, 'challenge')).status, 200);
  assert.equal((await f.call('/session/end', { method: 'POST', guest: b, body: {}, sendCsrf: false })).status, 403);
  const ended = await f.call('/session/end', { method: 'POST', guest: b, body: {} });
  assert.equal(ended.status, 200);
  assert.ok(ended.headers.get('set-cookie')?.includes('Max-Age=0'), 'guest cookie is revoked');
  assert.equal((await f.read(b)).status, 401);
  assert.equal((await f.read(a)).status, 404);
});

test('creation and session-action rates are bounded and close remains available at action exhaustion', async t => {
  const f = await fixture(t, { creationLimit: 1, actionLimit: 1 });
  const a = await f.session();
  assert.equal((await f.call('/session', { method: 'POST', body: {} })).status, 503);
  const created = await f.create(a);
  assert.equal(created.status, 201);
  assert.equal((await f.create(a)).status, 429);
  const closed = await f.call('/pair/actions', { method: 'POST', guest: a,
    body: { action: 'close', pairId: created.data.pair.id, revision: created.data.pair.revision, idempotencyKey: f.key() } });
  assert.equal(closed.status, 200);
  f.advance(60001);
  assert.equal((await f.call('/session', { method: 'POST', body: {} })).status, 200, 'global creation window expires');
});

test('independent mounted apps cannot share guest sessions, pairs or invitations', async t => {
  const one = await fixture(t), two = await fixture(t);
  const a = await one.session(), b = await two.session();
  const created = await one.create(a);
  assert.equal((await two.read(a)).status, 401, 'cookie from another app has no server-side session');
  assert.equal((await two.join(b, created.data.inviteToken)).status, 404, 'invitation belongs to one app only');
  assert.throws(() => mountDeviceTest(one.app), TypeError);
  one.lifecycle.close();
  assert.equal((await one.call('/runtime')).status, 503, 'closed app never resumes a test');
});

test('configuration forbids insecure remote origins, unbounded lifetimes and invalid build evidence', () => {
  for (const options of [
    { baseURL: 'http://192.168.1.20:8088', development: true },
    { baseURL: 'https://example.test/path' },
    { baseURL: 'https://example.test?token=blocked' },
    { baseURL: 'https://example.test', sessionTtlMs: 900001 },
    { baseURL: 'https://example.test', pairTtlMs: 300001 },
    { baseURL: 'https://example.test', maxMessages: 21 },
    { baseURL: 'https://example.test', buildCommit: 'not-a-commit' },
  ]) assert.throws(() => mountDeviceTest(express(), options), TypeError);
});

test('requests from a previous pair cannot consent or close a newer pair after tombstone expiry', async t => {
  const f = await fixture(t, { pairTtlMs: 1500, sessionTtlMs: 10000 });
  const a = await f.session(), b = await f.session();
  const first = await f.create(a);
  const joined = await f.join(b, first.data.inviteToken);
  const oldAcceptance = { action: 'accept', pairId: first.data.pair.id, scope: SCOPE,
    revision: joined.data.pair.revision, idempotencyKey: f.key() };
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: a, body: oldAcceptance })).status, 200);
  const oldPair = (await f.read(a)).data.pair;
  const oldClose = { action: 'close', pairId: oldPair.id, revision: oldPair.revision, idempotencyKey: f.key() };
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: a, body: oldClose })).status, 200);
  f.advance(1000);
  const second = await f.create(a);
  assert.equal((await f.join(b, second.data.inviteToken)).status, 200);
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: a, body: oldAcceptance })).status, 404,
    'old consent is bound to its exact previous pair, even when revisions coincide');
  const untouched = (await f.read(a)).data.pair;
  assert.equal(untouched.consent.A, false);
  assert.equal(untouched.consent.B, false);
  f.advance(501);
  assert.equal((await f.call('/pair/actions', { method: 'POST', guest: a, body: oldClose })).status, 404,
    'expired close tombstone cannot turn an old request into authority over a new pair');
  const current = await f.read(a);
  assert.equal(current.status, 200);
  assert.ok(current.data.pair.id === second.data.pair.id, 'new pair survives requests for the old pair');
  assert.equal(current.data.pair.state, 'WAITING_ACCEPT');
});
