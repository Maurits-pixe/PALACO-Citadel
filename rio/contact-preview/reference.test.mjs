import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { createRioContactReference } from './reference.mjs';
import { startRioContactPreview } from './server.mjs';

const BASE = Date.parse('2026-10-10T12:00:00.000Z');
let nextAction = 0;
const id = () => 'action-' + (++nextAction);
const latest = view => view.requests.at(-1);
const isDenied = result => assert.ok(!result.ok && ['REJECTED', 'HOLD'].includes(result.status));
const assertPrivate = value => {
  const serialized = JSON.stringify(value);
  for (const pattern of [/PRIVATE KEY/, /sessionToken/, /csrfToken/, /signatureBase64/, /publicKeyPem/, /privateReasons/, /blockList/]) {
    assert.doesNotMatch(serialized, pattern);
  }
};

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rio-contact-controller-'));
  let clock = BASE;
  let guardState = options.guardState ?? 'PASS';
  const databasePath = path.join(directory, 'contact.sqlite');
  const create = () => createRioContactReference({
    databasePath,
    classification: 'SYNTHETIC_ONLY',
    now: () => new Date(clock).toISOString(),
    simulateGuards: () => { if (guardState === 'THROW') throw new Error('SIMULATED_GUARD_UNAVAILABLE'); return guardState; }
  });
  let controller = create();
  t.after(async () => { await controller.close(); await rm(directory, { recursive: true, force: true }); });
  return {
    get controller() { return controller; },
    get databasePath() { return databasePath; },
    advance(ms) { clock += ms; },
    guards(state) { guardState = state; },
    view(side = 'SENDER') { return controller.view(side); },
    request(side = 'SENDER') { return latest(controller.view(side)); },
    async act(side, type, extra = {}) {
      clock += 10;
      const current = latest(controller.view(side));
      const body = type === 'INITIATE'
        ? { type, actionId: id(), text: 'Een afgeschermd testbericht.', ...extra }
        : { type, id: current?.id, revision: current?.revision, actionId: id(), ...extra };
      const result = await controller.act(side, body);
      assertPrivate(result);
      return result;
    },
    async restart() { await controller.close(); controller = create(); },
    create
  };
}

async function initiate(f, text = 'Een afgeschermd testbericht.') {
  assert.equal((await f.act('SENDER', 'INITIATE', { text })).status, 'APPLIED');
  assert.equal(f.request().phase, 'WAITING_NOVA');
  return f.request();
}
async function admit(f) {
  assert.equal((await f.act('RECEIVER', 'NOVA_ADMIT')).status, 'APPLIED');
  assert.equal(f.request().phase, 'COMMIT_CONFIRMATION');
  return f.request();
}
async function final(f, side) {
  const round = f.request(side);
  return f.act(side, 'FINAL_ACCEPT', { contractDigest: round.contractDigest, evidenceSetDigest: round.evidenceSetDigest });
}
async function queue(f) {
  await initiate(f);
  await admit(f);
  assert.equal((await final(f, 'SENDER')).status, 'APPLIED');
  assert.equal((await final(f, 'RECEIVER')).status, 'APPLIED');
  assert.equal(f.request().phase, 'QUEUED');
  return f.request();
}
async function deliveryRound(f) {
  await queue(f);
  assert.equal((await f.act('SENDER', 'PREPARE_DELIVERY')).status, 'APPLIED');
  assert.equal(f.request().phase, 'WAITING_DELIVERY_NOVA');
  assert.equal((await f.act('RECEIVER', 'ADMIT_DELIVERY')).status, 'APPLIED');
  assert.equal(f.request().phase, 'DELIVERY_CONFIRMATION');
  return f.request();
}

test('only an explicitly synthetic controller can be opened', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rio-contact-classification-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const classification of [undefined, 'PRODUCTION', 'LIVE', 'REFERENCE_ONLY']) {
    assert.throws(() => createRioContactReference({ databasePath: path.join(directory, String(classification) + '.sqlite'), classification }));
  }
});
test('an empty view carries no requests, proof material, or operative authority', async t => {
  const f = await fixture(t);
  for (const side of ['SENDER', 'RECEIVER']) {
    const view = f.view(side);
    assert.deepEqual(view.requests, []);
    assertPrivate(view);
    assert.notEqual(view.classification, 'PRODUCTION');
  }
});
test('initiating creates exactly one pending request without consent', async t => {
  const f = await fixture(t);
  const r = await initiate(f, 'Hoi wereld.');
  assert.deepEqual(r.confirmations, { sender: false, receiver: false });
  assert.equal(r.byteLength, Buffer.byteLength('Hoi wereld.'));
  assert.equal(f.view().requests.length, 1);
  assert.ok(r.allowedActions.includes('REVOKE'));
});
test('NOVA admission is separate from final contact agreement', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  const r = f.request();
  assert.deepEqual(r.confirmations, { sender: false, receiver: false });
  assert.ok(r.allowedActions.includes('FINAL_ACCEPT'));
  assert.notEqual(r.phase, 'QUEUED');
  assert.notEqual(r.phase, 'DELIVERED');
});
test('the receiver cannot initiate for the sender', async t => {
  const f = await fixture(t);
  isDenied(await f.act('RECEIVER', 'INITIATE'));
  assert.equal(f.view().requests.length, 0);
});
test('the sender cannot admit their own NOVA request', async t => {
  const f = await fixture(t);
  await initiate(f);
  isDenied(await f.act('SENDER', 'NOVA_ADMIT'));
  assert.equal(f.request().phase, 'WAITING_NOVA');
});
test('the first final acceptance preserves the round revision for the other party', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  const before = f.request();
  assert.equal((await final(f, 'SENDER')).status, 'APPLIED');
  assert.equal(f.request().revision, before.revision);
  assert.equal(f.request().phase, 'COMMIT_CONFIRMATION');
  assert.deepEqual(f.request().confirmations, { sender: true, receiver: false });
  assert.equal((await final(f, 'RECEIVER')).status, 'APPLIED');
  assert.equal(f.request().phase, 'QUEUED');
  assert.notEqual(f.request().revision, before.revision);
});
test('either party can provide the first final choice without granting the other', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  assert.equal((await final(f, 'RECEIVER')).status, 'APPLIED');
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: true });
  assert.equal(f.request().phase, 'COMMIT_CONFIRMATION');
});
test('an early final choice cannot bypass NOVA', async t => {
  const f = await fixture(t);
  await initiate(f);
  isDenied(await f.act('SENDER', 'FINAL_ACCEPT', { contractDigest: '0'.repeat(64), evidenceSetDigest: '0'.repeat(64) }));
  assert.equal(f.request().phase, 'WAITING_NOVA');
});
test('final choice must bind the displayed contract digest', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  isDenied(await f.act('SENDER', 'FINAL_ACCEPT', { contractDigest: '0'.repeat(64), evidenceSetDigest: f.request().evidenceSetDigest }));
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('final choice must bind the displayed evidence digest', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  isDenied(await f.act('RECEIVER', 'FINAL_ACCEPT', { contractDigest: f.request().contractDigest, evidenceSetDigest: '0'.repeat(64) }));
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('a stale revision cannot change an active round', async t => {
  const f = await fixture(t);
  const previous = await initiate(f);
  await admit(f);
  isDenied(await f.act('SENDER', 'FINAL_ACCEPT', {
    revision: previous.revision, contractDigest: f.request().contractDigest, evidenceSetDigest: f.request().evidenceSetDigest
  }));
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('refreshing guards discards both prior final choices', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f); await final(f, 'SENDER');
  const before = f.request();
  assert.equal((await f.act('SENDER', 'REFRESH_GUARDS')).status, 'APPLIED');
  const after = f.request();
  assert.notEqual(after.revision, before.revision);
  assert.notEqual(after.evidenceSetDigest, before.evidenceSetDigest);
  assert.deepEqual(after.confirmations, { sender: false, receiver: false });
  isDenied(await f.act('RECEIVER', 'FINAL_ACCEPT', { contractDigest: before.contractDigest, evidenceSetDigest: before.evidenceSetDigest }));
});
test('one simulated failing guard cannot yield final consent or queue', async t => {
  const f = await fixture(t, { guardState: 'FAIL' });
  await initiate(f);
  await f.act('RECEIVER', 'NOVA_ADMIT');
  assert.notEqual(f.request().phase, 'QUEUED');
  isDenied(await final(f, 'SENDER'));
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('an unknown guard result keeps the round closed to final acceptance', async t => {
  const f = await fixture(t, { guardState: 'UNKNOWN' });
  await initiate(f); await f.act('RECEIVER', 'NOVA_ADMIT');
  isDenied(await final(f, 'RECEIVER'));
  assert.notEqual(f.request().phase, 'QUEUED');
});
test('guard service failure clears choices and requires explicit refresh before retry', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f); await final(f, 'SENDER');
  const previous = f.request();
  f.guards('THROW');
  isDenied(await f.act('RECEIVER', 'REFRESH_GUARDS'));
  assert.equal(f.request().phase, 'HOLD');
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
  assert.equal(f.request().evidenceSetDigest, null);
  isDenied(await f.act('RECEIVER', 'FINAL_ACCEPT', { contractDigest: previous.contractDigest, evidenceSetDigest: previous.evidenceSetDigest }));
  f.guards('PASS');
  assert.equal((await f.act('SENDER', 'REFRESH_GUARDS')).status, 'APPLIED');
  assert.equal(f.request().phase, 'COMMIT_CONFIRMATION');
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('HOLD never manufactures agreement', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  assert.equal((await f.act('RECEIVER', 'HOLD')).status, 'APPLIED');
  assert.equal(f.request().phase, 'HOLD');
  isDenied(await final(f, 'SENDER'));
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('declining before NOVA returns a generic closed result', async t => {
  const f = await fixture(t);
  await initiate(f);
  assert.equal((await f.act('RECEIVER', 'DECLINE')).status, 'APPLIED');
  assert.equal(f.request().phase, 'CLOSED');
  assertPrivate(f.view('SENDER'));
  isDenied(await f.act('RECEIVER', 'NOVA_ADMIT'));
});
test('revocation closes an already queued transfer before delivery', async t => {
  const f = await fixture(t); await queue(f);
  assert.equal((await f.act('SENDER', 'REVOKE')).status, 'APPLIED');
  assert.equal(f.request().phase, 'CLOSED');
  isDenied(await f.act('SENDER', 'PREPARE_DELIVERY'));
});
test('delivery requires its own NOVA and two new final actions', async t => {
  const f = await fixture(t);
  await queue(f);
  assert.equal((await f.act('SENDER', 'PREPARE_DELIVERY')).status, 'APPLIED');
  assert.equal(f.request().phase, 'WAITING_DELIVERY_NOVA');
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
  isDenied(await final(f, 'RECEIVER'));
  assert.equal((await f.act('RECEIVER', 'ADMIT_DELIVERY')).status, 'APPLIED');
  assert.equal(f.request().phase, 'DELIVERY_CONFIRMATION');
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
  await final(f, 'SENDER');
  assert.equal(f.request().phase, 'DELIVERY_CONFIRMATION');
  await final(f, 'RECEIVER');
  assert.equal(f.request().phase, 'DELIVERED');
});
test('commit-round evidence cannot authorize the delivery round', async t => {
  const f = await fixture(t);
  await initiate(f); await admit(f);
  const commit = f.request();
  await final(f, 'SENDER'); await final(f, 'RECEIVER');
  await f.act('SENDER', 'PREPARE_DELIVERY'); await f.act('RECEIVER', 'ADMIT_DELIVERY');
  isDenied(await f.act('SENDER', 'FINAL_ACCEPT', { contractDigest: commit.contractDigest, evidenceSetDigest: commit.evidenceSetDigest }));
  assert.deepEqual(f.request().confirmations, { sender: false, receiver: false });
});
test('only the receiver can admit the delivery checkpoint', async t => {
  const f = await fixture(t); await queue(f);
  await f.act('SENDER', 'PREPARE_DELIVERY');
  isDenied(await f.act('SENDER', 'ADMIT_DELIVERY'));
  assert.equal(f.request().phase, 'WAITING_DELIVERY_NOVA');
});
test('expiry during a confirmation round prevents a final transition', async t => {
  const f = await fixture(t);
  await deliveryRound(f); await final(f, 'SENDER');
  f.advance(60 * 60 * 1000);
  isDenied(await final(f, 'RECEIVER'));
  assert.notEqual(f.request().phase, 'DELIVERED');
});
test('restart cannot retain signing keys or automatically deliver a queued request', async t => {
  const f = await fixture(t); await queue(f);
  const old = f.request();
  await f.restart();
  assert.notEqual(f.request()?.phase, 'DELIVERED');
  isDenied(await f.act('RECEIVER', 'FINAL_ACCEPT', { id: old.id, revision: old.revision,
    contractDigest: old.contractDigest, evidenceSetDigest: old.evidenceSetDigest }));
});
test('repeating an identical initiation action cannot create another request', async t => {
  const f = await fixture(t);
  const actionId = id();
  const first = await f.act('SENDER', 'INITIATE', { actionId, text: 'Zelfde testbericht.' });
  const repeated = await f.act('SENDER', 'INITIATE', { actionId, text: 'Zelfde testbericht.' });
  assert.equal(first.status, 'APPLIED');
  assert.equal(repeated.duplicate, true);
  assert.equal(f.view().requests.length, 1);
});
test('reusing an action ID with changed contents is rejected', async t => {
  const f = await fixture(t); const actionId = id();
  await f.act('SENDER', 'INITIATE', { actionId, text: 'Eerste inhoud.' });
  isDenied(await f.act('SENDER', 'INITIATE', { actionId, text: 'Gewijzigde inhoud.' }));
  assert.equal(f.view().requests.length, 1);
});
for (const [name, text] of [['empty', ''], ['oversized ASCII', 'a'.repeat(1025)], ['oversized UTF-8', '界'.repeat(342)], ['non-string', 5]]) {
  test(name + ' message input is rejected without creating a request', async t => {
    const f = await fixture(t);
    isDenied(await f.act('SENDER', 'INITIATE', { text }));
    assert.equal(f.view().requests.length, 0);
  });
}
test('the UTF-8 byte boundary accepts exactly 1024 bytes', async t => {
  const f = await fixture(t);
  const text = '界'.repeat(341) + 'x';
  assert.equal(Buffer.byteLength(text), 1024);
  await initiate(f, text);
  assert.equal(f.request().byteLength, 1024);
});
test('message markup remains exact text in the reference state', async t => {
  const f = await fixture(t);
  const text = '<img src=x onerror="globalThis.__rioXss = true">';
  await initiate(f, text); await admit(f);
  assert.equal(f.request('RECEIVER').text, text);
});
test('client supplied role and consent fields cannot replace server actions', async t => {
  const f = await fixture(t); await initiate(f);
  isDenied(await f.act('SENDER', 'NOVA_ADMIT', { side: 'RECEIVER', accepted: true, confirmations: { sender: true, receiver: true } }));
  assert.equal(f.request().phase, 'WAITING_NOVA');
});
test('malformed action payloads fail closed', async t => {
  const f = await fixture(t);
  for (const body of [null, [], {}, { type: 'EXECUTE', actionId: id() }, { type: 'INITIATE', actionId: '../bad', text: 'x' }]) {
    isDenied(await f.controller.act('SENDER', body));
  }
  assert.equal(f.view().requests.length, 0);
});
test('unknown role cannot view or act as a participant', async t => {
  const f = await fixture(t);
  isDenied(await f.controller.act('ADMIN', { type: 'INITIATE', actionId: id(), text: 'x' }));
  assert.equal(f.controller.view('ADMIN'), null);
});

async function httpFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rio-contact-http-'));
  let clock = BASE;
  const app = await startRioContactPreview({
    databasePath: path.join(directory, 'contact.sqlite'), classification: 'SYNTHETIC_ONLY',
    now: () => new Date(clock).toISOString(), port: 0
  });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const cookie = side => 'rio_' + side.toLowerCase() + '=' + app.credentials[side].sessionToken;
  return {
    app, cookie,
    async request(route, { side = 'SENDER', headers = {}, ...options } = {}) {
      return fetch(app.origin + route, { redirect: 'manual', ...options,
        headers: { 'X-RIO-Side': side, Cookie: cookie(side), ...headers } });
    },
    async action(side, body, headers = {}) {
      clock += 10;
      return this.request('/api/action', { side, method: 'POST', headers: {
        Origin: app.origin, 'X-RIO-CSRF': app.credentials[side].csrfToken,
        'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    }
  };
}
const deniedHTTP = response => assert.ok(response.status >= 400 && response.status < 500, 'expected denied HTTP response, got ' + response.status);

test('the preview listens only on the loopback origin', async t => {
  const f = await httpFixture(t);
  assert.equal(new URL(f.app.origin).hostname, '127.0.0.1');
});
test('role entries require a previously provisioned session cookie', async t => {
  const f = await httpFixture(t);
  for (const route of ['/sender/', '/receiver/']) {
    deniedHTTP(await fetch(f.app.origin + route, { redirect: 'manual' }));
  }
});
test('valid role sessions can read protected state without proof or credentials', async t => {
  const f = await httpFixture(t);
  for (const side of ['SENDER', 'RECEIVER']) {
    const response = await f.request('/api/state', { side });
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.csrfToken, f.app.credentials[side].csrfToken);
    const { csrfToken, ...projection } = state;
    assertPrivate(projection);
    for (const role of ['SENDER', 'RECEIVER']) assert.ok(!JSON.stringify(state).includes(f.app.credentials[role].sessionToken));
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
  }
});
test('a participant cannot use their own cookie with the opposite role header', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.request('/api/state', { headers: { 'X-RIO-Side': 'RECEIVER' } }));
});
test('unrecognized session cookies fail closed', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.request('/api/state', { headers: { Cookie: 'rio_sender=forged' } }));
});
test('state cannot be read with credentials in a query string', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await fetch(f.app.origin + '/api/state?side=SENDER&session=' + f.app.credentials.SENDER.sessionToken, { headers: { 'X-RIO-Side': 'SENDER' } }));
});
test('unknown Host headers are rejected to prevent DNS rebinding', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.request('/api/state', { headers: { Host: 'attacker.example' } }));
});
for (const origin of [undefined, 'https://attacker.example', 'null']) {
  test('POST rejects ' + (origin ?? 'missing') + ' Origin', async t => {
    const f = await httpFixture(t);
    deniedHTTP(await f.request('/api/action', { method: 'POST', headers: {
      ...(origin === undefined ? {} : { Origin: origin }), 'X-RIO-CSRF': f.app.credentials.SENDER.csrfToken,
      'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'INITIATE', actionId: id(), text: 'x' }) }));
    assert.equal(f.app.controller.view('SENDER').requests.length, 0);
  });
}
test('POST rejects a missing CSRF token', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.request('/api/action', { method: 'POST', headers: { Origin: f.app.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'INITIATE', actionId: id(), text: 'x' }) }));
});
test('POST rejects another participant’s CSRF token', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.action('SENDER', { type: 'INITIATE', actionId: id(), text: 'x' }, { 'X-RIO-CSRF': f.app.credentials.RECEIVER.csrfToken }));
});
test('POST rejects cross-site Fetch Metadata even with copied credentials', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.action('SENDER', { type: 'INITIATE', actionId: id(), text: 'x' }, { 'Sec-Fetch-Site': 'cross-site' }));
  assert.equal(f.app.controller.view('SENDER').requests.length, 0);
});
test('POST rejects non-JSON content and oversized request bodies', async t => {
  const f = await httpFixture(t);
  deniedHTTP(await f.action('SENDER', { type: 'INITIATE', actionId: id(), text: 'x' }, { 'Content-Type': 'text/plain' }));
  deniedHTTP(await f.action('SENDER', { type: 'INITIATE', actionId: id(), text: 'x'.repeat(20000) }));
  assert.equal(f.app.controller.view('SENDER').requests.length, 0);
});
test('POST rejects malformed UTF-8 rather than changing message contents', async t => {
  const f = await httpFixture(t);
  const malformed = Buffer.concat([
    Buffer.from('{"type":"INITIATE","actionId":"' + id() + '","text":"'),
    Buffer.from([0xc3, 0x28]), Buffer.from('"}')
  ]);
  const response = await f.request('/api/action', { method: 'POST', headers: {
    Origin: f.app.origin, 'Content-Type': 'application/json', 'X-RIO-CSRF': f.app.credentials.SENDER.csrfToken }, body: malformed });
  deniedHTTP(response);
  assert.equal(f.app.controller.view('SENDER').requests.length, 0);
});
test('POST rejects malformed JSON without reflecting its contents', async t => {
  const f = await httpFixture(t);
  const response = await f.request('/api/action', { method: 'POST', headers: {
    Origin: f.app.origin, 'Content-Type': 'application/json', 'X-RIO-CSRF': f.app.credentials.SENDER.csrfToken }, body: '{"SECRET_BROKEN_INPUT":' });
  deniedHTTP(response);
  assert.doesNotMatch(await response.text(), /SECRET_BROKEN_INPUT/);
});
test('GET requests never execute an action', async t => {
  const f = await httpFixture(t);
  await f.request('/api/action?type=INITIATE&text=should-not-send');
  assert.equal(f.app.controller.view('SENDER').requests.length, 0);
});
test('unexpected HTTP methods cannot mutate the controller', async t => {
  const f = await httpFixture(t);
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    deniedHTTP(await f.request('/api/action', { method, headers: { Origin: f.app.origin } }));
  }
  assert.equal(f.app.controller.view('SENDER').requests.length, 0);
});
test('authenticated JSON actions cannot forge the opposite role', async t => {
  const f = await httpFixture(t);
  const start = await f.action('SENDER', { type: 'INITIATE', actionId: id(), text: 'Session-bound test.' });
  assert.equal(start.status, 200);
  const r = latest(f.app.controller.view('SENDER'));
  const forged = await f.action('SENDER', { type: 'NOVA_ADMIT', actionId: id(), id: r.id, revision: r.revision, side: 'RECEIVER' });
  const result = await forged.json();
  assert.equal(result.ok, false);
  assert.equal(latest(f.app.controller.view('SENDER')).phase, 'WAITING_NOVA');
});
test('role HTML uses a restrictive CSP and cannot be framed', async t => {
  const f = await httpFixture(t);
  const response = await f.request('/sender/');
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(response.headers.get('x-content-type-options') ?? '', /nosniff/i);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
  const html = await response.text();
  for (const side of ['SENDER', 'RECEIVER']) {
    assert.ok(!html.includes(f.app.credentials[side].sessionToken));
  }
});

for (const type of ['REVOKE','DECLINE']) {
  test(type+' intent blocks old final choices while durable storage is busy',async t=>{
    const f=await fixture(t);await deliveryRound(f);await final(f,'RECEIVER');
    const blocker=new DatabaseSync(f.databasePath);
    try {
      blocker.exec('BEGIN IMMEDIATE');
      assert.equal((await f.act('RECEIVER',type)).status,'HOLD');
      const blocked=f.request();
      assert.equal(blocked.phase,'HOLD');
      assert.deepEqual(blocked.confirmations,{sender:false,receiver:false});
      assert.equal(blocked.evidenceSetDigest,null);
      isDenied(await final(f,'SENDER'));
      isDenied(await f.act('SENDER','REFRESH_GUARDS'));
      blocker.exec('ROLLBACK');
      isDenied(await final(f,'SENDER'));
      assert.equal((await f.act('RECEIVER',type)).status,'APPLIED');
      assert.equal(f.request().phase,'CLOSED');
      assert.equal(blocker.prepare('SELECT state FROM rio_messages').get().state,'CLOSED');
    } finally {try{blocker.exec('ROLLBACK');}catch{}blocker.close();}
  });
}
test('a simulated FAIL with busy storage blocks reopening until durable closure',async t=>{
  const f=await fixture(t,{guardState:'FAIL'});await initiate(f);
  const blocker=new DatabaseSync(f.databasePath);
  try {
    blocker.exec('BEGIN IMMEDIATE');
    assert.equal((await f.act('RECEIVER','NOVA_ADMIT')).status,'HOLD');
    assert.equal(f.request().phase,'HOLD');
    f.guards('PASS');
    isDenied(await f.act('SENDER','REFRESH_GUARDS'));
    isDenied(await final(f,'SENDER'));
    blocker.exec('ROLLBACK');
    assert.equal((await f.act('RECEIVER','REVOKE')).status,'APPLIED');
    assert.equal(f.request().phase,'CLOSED');
    assert.equal(blocker.prepare('SELECT revoked FROM rio_rights').get().revoked,1);
  } finally {try{blocker.exec('ROLLBACK');}catch{}blocker.close();}
});
