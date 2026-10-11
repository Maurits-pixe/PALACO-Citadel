import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mountNovaReception } from './nova-reception.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const API = '/api/rio/nova';
const key = number => number.toString(16).padStart(32, '0');

async function fixture(t, overrides = {}) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const app = express();
  let clock = 1_900_000_000_000;
  const lifecycle = mountNovaReception(app, { baseURL: origin, development: true, now: () => clock, ...overrides });
  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  server.on('request', app);
  t.after(async () => {
    lifecycle.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const call = async (path, { method = 'GET', cookie, token, body, rawBody, headers = {}, sendOrigin = method !== 'GET' } = {}) => {
    const finalHeaders = { ...(sendOrigin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(token ? { 'X-NOVA-CSRF': token } : {}), ...headers };
    if (body !== undefined || rawBody !== undefined) finalHeaders['Content-Type'] ??= 'application/json';
    const response = await fetch(origin + API + path, { method, headers: finalHeaders, ...(body !== undefined || rawBody !== undefined ? { body: rawBody ?? JSON.stringify(body) } : {}) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, data, text, headers: response.headers };
  };
  const session = async () => {
    const result = await call('/session', { method: 'POST', body: {} });
    assert.equal(result.status, 200, result.text);
    const setCookie = result.headers.get('set-cookie');
    assert.ok(setCookie, 'NOVA session must be bound to an HTTP cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\//i);
    const token = result.data.session.csrfToken;
    assert.equal(typeof token, 'string');
    assert.ok(token.length >= 32);
    return { cookie: setCookie.split(';')[0], token, ...result.data };
  };
  const create = (session, number = 1, text = 'Fictief NOVA-verzoek.') => call('/requests', { method: 'POST', cookie: session.cookie, token: session.token, body: { text, idempotencyKey: key(number) } });
  return { origin, app, server, call, session, create, now: () => clock, advance: amount => { clock += amount; } };
}

test('runtime is actual public HTTP and explicitly declares temporary reception without chat', async t => {
  const f = await fixture(t);
  const result = await f.call('/runtime');
  assert.equal(result.status, 200);
  assert.equal(result.data.running, true);
  assert.equal(result.data.component, 'NOVA_RECEPTION');
  assert.equal(result.data.storage, 'volatile-memory');
  assert.equal(result.data.version, '0.2');
  assert.equal(result.data.receptionEnabled, true);
  assert.equal(result.data.firstAcceptanceEnabled, true);
  assert.equal(result.data.chatEnabled, false);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.headers.get('access-control-allow-origin'), null);
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal((await f.call('/requests')).status, 401);
});

test('bootstrap needs exact configured origin and an empty JSON object', async t => {
  const f = await fixture(t);
  for (const headers of [{ Origin: 'https://attacker.example' }, { Origin: f.origin + '.attacker.example' }, { Origin: 'null' }]) {
    assert.equal((await f.call('/session', { method: 'POST', body: {}, headers })).status, 403);
  }
  assert.equal((await f.call('/session', { method: 'POST', body: {}, sendOrigin: false })).status, 403);
  for (const body of [null, [], { extra: 'unexpected' }, 'a']) {
    const result = await f.call('/session', { method: 'POST', body });
    assert.ok([400, 415].includes(result.status), result.text);
  }
  const result = await f.call('/session', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(result.status, 415);
  const valid = await f.session();
  assert.match(valid.cookie, /^palacoNova=/);
});

test('session resumption preserves server receipts and CSRF token without exposing cookie in JSON', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const first = await f.create(a);
  assert.equal(first.status, 201);
  const resumed = await f.call('/session', { method: 'POST', cookie: a.cookie, body: {} });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.session.csrfToken, a.token);
  assert.equal(resumed.data.session.expiresAt, a.session.expiresAt);
  assert.equal(resumed.data.requests.length, 1);
  assert.equal(resumed.data.requests[0].id, first.data.request.id);
  assert.ok(!resumed.text.includes(a.cookie.split('=')[1]), 'Cookie credential is not copied into response JSON');
  const list = await f.call('/requests', { cookie: a.cookie });
  assert.equal(list.status, 200);
  assert.ok(!('csrfToken' in list.data.session));
  assert.equal(list.data.serverTime, new Date(f.now()).toISOString());
  assert.match(list.headers.get('cache-control'), /no-store/);
});

test('real session cookie isolation rejects foreign receipt actions even with the foreign id', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const b = await f.session();
  assert.notEqual(a.cookie, b.cookie);
  assert.notEqual(a.token, b.token);
  const result = await f.create(a, 1, 'FICTITIOUS_A_ONLY_284');
  assert.equal(result.status, 201);
  const id = result.data.request.id;
  const list = await f.call('/requests', { cookie: b.cookie });
  assert.deepEqual(list.data.requests, []);
  const action = await f.call('/requests/' + id + '/actions', { method: 'POST', cookie: b.cookie, token: b.token, body: { action: 'withdraw', revision: 1 } });
  assert.equal(action.status, 404);
  const unknown = await f.call('/requests/' + key(999) + '/actions', { method: 'POST', cookie: b.cookie, token: b.token, body: { action: 'withdraw', revision: 1 } });
  assert.equal(unknown.status, 404);
  assert.deepEqual(action.data, unknown.data);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests[0].status, 'RECEIVED');
});

test('all private writes require both own CSRF token and exact origin', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const b = await f.session();
  const options = { method: 'POST', cookie: a.cookie, body: { text: 'Fictief', idempotencyKey: key(1) } };
  assert.equal((await f.call('/requests', options)).status, 403);
  assert.equal((await f.call('/requests', { ...options, token: b.token })).status, 403);
  assert.equal((await f.call('/requests', { ...options, token: a.token, sendOrigin: false })).status, 403);
  assert.equal((await f.call('/requests', { ...options, token: a.token, headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await f.call('/requests', { ...options, token: a.token, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.deepEqual((await f.call('/requests', { cookie: a.cookie })).data.requests, []);
  assert.equal((await f.call('/session', { method: 'DELETE', cookie: a.cookie, body: {} })).status, 403);
});

test('private reads reject foreign Origin and Fetch Metadata without revealing session data', async t => {
  const f = await fixture(t);
  const a = await f.session();
  await f.create(a, 1, 'FICTITIOUS_PRIVATE_492');
  for (const headers of [{ Origin: 'https://attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }]) {
    const result = await f.call('/requests', { cookie: a.cookie, headers });
    assert.equal(result.status, 403);
    assert.ok(!result.text.includes('FICTITIOUS_PRIVATE_492'));
  }
  assert.equal((await f.call('/requests', { cookie: a.cookie, headers: { Origin: f.origin } })).status, 200);
});

test('receipt creation and replay are server idempotent; conflicting replay does not overwrite', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const first = await f.create(a, 1, 'Fictief origineel');
  assert.equal(first.status, 201);
  assert.equal(first.data.replayed, false);
  assert.match(first.data.request.id, /^[a-f0-9]{32}$/);
  assert.equal(first.data.request.status, 'RECEIVED');
  assert.equal(first.data.request.revision, 1);
  assert.equal(first.data.request.createdAt, new Date(f.now()).toISOString());
  assert.equal(first.data.request.expiresAt, new Date(f.now() + 300000).toISOString());
  const replay = await f.create(a, 1, 'Fictief origineel');
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.deepEqual(replay.data.request, first.data.request);
  assert.equal((await f.create(a, 1, 'Fictief veranderd')).status, 409);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests.length, 1);
});

test('strict receipt schema bounds Unicode and retains literal markup as data', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const invalid = [
    { text: '', idempotencyKey: key(1) }, { text: '   ', idempotencyKey: key(1) },
    { text: 'a'.repeat(513), idempotencyKey: key(1) }, { text: 'a', idempotencyKey: 'bad' },
    { text: 'a', idempotencyKey: key(1), unexpected: true }, { text: 12, idempotencyKey: key(1) },
    { text: 'a' }, null, [], { __proto__: null, text: 'a', idempotencyKey: key(1), constructor: 'bad' },
  ];
  for (const body of invalid) {
    const response = await f.call('/requests', { method: 'POST', cookie: a.cookie, token: a.token, body });
    assert.equal(response.status, 400, JSON.stringify(body) + ': ' + response.text);
  }
  const unicode = await f.create(a, 2, '🪐'.repeat(512));
  assert.equal(unicode.status, 201, unicode.text);
  const markup = '<img src=x onerror="window.NOVA_XSS=1">Fictief';
  const literal = await f.create(a, 3, markup);
  assert.equal(literal.status, 201);
  assert.equal(literal.data.request.text, markup);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests.length, 2);
});

test('malformed, oversized and unsupported JSON errors are safe and leave state unchanged', async t => {
  const f = await fixture(t);
  const a = await f.session();
  for (const rawBody of ['{', '{"text":', '{"text":"' + 'x'.repeat(5000) + '","idempotencyKey":"' + key(1) + '"}']) {
    const result = await f.call('/requests', { method: 'POST', cookie: a.cookie, token: a.token, rawBody });
    assert.ok([400, 413].includes(result.status), result.text);
    assert.equal(typeof result.data.error, 'string');
    assert.ok(!/SyntaxError|node_modules|stack|Unexpected token/.test(result.text));
  }
  const wrong = await f.call('/requests', { method: 'POST', cookie: a.cookie, token: a.token, body: { text: 'Fictief', idempotencyKey: key(1) }, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(wrong.status, 415);
  assert.deepEqual((await f.call('/requests', { cookie: a.cookie })).data.requests, []);
});

test('hold and resume use optimistic revisions; stale actions cannot change state', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a)).data.request;
  const act = (action, revision) => f.call('/requests/' + created.id + '/actions', { method: 'POST', cookie: a.cookie, token: a.token, body: { action, revision } });
  const hold = await act('hold', 1);
  assert.equal(hold.status, 200);
  assert.equal(hold.data.request.status, 'ON_HOLD');
  assert.equal(hold.data.request.revision, 2);
  assert.equal((await act('resume', 1)).status, 409);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests[0].status, 'ON_HOLD');
  const resume = await act('resume', 2);
  assert.equal(resume.status, 200);
  assert.equal(resume.data.request.status, 'RECEIVED');
  assert.equal(resume.data.request.revision, 3);
  assert.equal(resume.data.request.expiresAt, created.expiresAt);
});

test('withdrawal removes text and is terminal including replay and illegal action names', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a, 1, 'FICTITIOUS_DELETE_TEXT_701')).data.request;
  const act = body => f.call('/requests/' + created.id + '/actions', { method: 'POST', cookie: a.cookie, token: a.token, body });
  for (const body of [{ action: 'open', revision: 1 }, { action: 'hold', revision: 0 }, { action: 'hold', revision: '1' }, { action: 'hold', revision: 1, extra: true }]) {
    assert.equal((await act(body)).status, 400);
  }
  const withdrawn = await act({ action: 'withdraw', revision: 1 });
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.data.request.status, 'WITHDRAWN');
  assert.ok(!withdrawn.text.includes('FICTITIOUS_DELETE_TEXT_701'));
  const list = await f.call('/requests', { cookie: a.cookie });
  assert.ok(!list.text.includes('FICTITIOUS_DELETE_TEXT_701'));
  assert.equal((await act({ action: 'resume', revision: 2 })).status, 410);
  assert.equal((await f.create(a, 1, 'FICTITIOUS_DELETE_TEXT_701')).status, 410);
});

test('server receipt expiry scrubs text and prevents transitions even while a request is held', async t => {
  const f = await fixture(t, { requestTtlMs: 1000 });
  const a = await f.session();
  const created = (await f.create(a, 1, 'FICTITIOUS_EXPIRE_TEXT_811')).data.request;
  assert.equal((await f.call('/requests/' + created.id + '/actions', { method: 'POST', cookie: a.cookie, token: a.token, body: { action: 'hold', revision: 1 } })).status, 200);
  f.advance(1001);
  const expired = await f.call('/requests', { cookie: a.cookie });
  assert.equal(expired.data.requests[0].status, 'EXPIRED');
  assert.ok(!expired.text.includes('FICTITIOUS_EXPIRE_TEXT_811'));
  assert.equal((await f.call('/requests/' + created.id + '/actions', { method: 'POST', cookie: a.cookie, token: a.token, body: { action: 'resume', revision: expired.data.requests[0].revision } })).status, 410);
  assert.equal((await f.create(a, 1, 'FICTITIOUS_EXPIRE_TEXT_811')).status, 410);
});

test('expired session cannot list or mutate receipts and bootstrap creates a fresh empty session', async t => {
  const f = await fixture(t, { sessionTtlMs: 1000, requestTtlMs: 500 });
  const a = await f.session();
  await f.create(a, 1, 'FICTITIOUS_SESSION_920');
  f.advance(1001);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).status, 401);
  assert.equal((await f.create(a, 2)).status, 401);
  const fresh = await f.call('/session', { method: 'POST', cookie: a.cookie, body: {} });
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.data.session.csrfToken, a.token);
  assert.deepEqual(fresh.data.requests, []);
});

test('ending a session invalidates its cookie and scrubs the entire server receipt collection', async t => {
  const f = await fixture(t);
  const a = await f.session();
  await f.create(a);
  const end = await f.call('/session', { method: 'DELETE', cookie: a.cookie, token: a.token, body: {} });
  assert.equal(end.status, 200);
  assert.match(end.headers.get('set-cookie'), /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).status, 401);
  assert.equal((await f.create(a, 2)).status, 401);
  const next = await f.call('/session', { method: 'POST', cookie: a.cookie, body: {} });
  assert.deepEqual(next.data.requests, []);
});

test('finite session and receipt capacity reject overflow without evicting another active session', async t => {
  const f = await fixture(t, { maxSessions: 2, maxRequests: 2 });
  const a = await f.session();
  const b = await f.session();
  assert.equal((await f.call('/session', { method: 'POST', body: {} })).status, 503);
  assert.equal((await f.create(a, 1)).status, 201);
  assert.equal((await f.create(a, 2)).status, 201);
  assert.equal((await f.create(a, 3)).status, 503);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests.length, 2);
  assert.deepEqual((await f.call('/requests', { cookie: b.cookie })).data.requests, []);
  await f.call('/session', { method: 'DELETE', cookie: b.cookie, token: b.token, body: {} });
  assert.equal((await f.call('/session', { method: 'POST', body: {} })).status, 200);
});

test('bootstrap and action rate limits reset only after the configured server interval', async t => {
  const f = await fixture(t, { creationLimit: 2, actionLimit: 2, rateWindowMs: 1000, maxSessions: 20, maxRequests: 4 });
  const a = await f.session();
  await f.session();
  assert.equal((await f.call('/session', { method: 'POST', body: {} })).status, 429);
  f.advance(1001);
  assert.equal((await f.call('/session', { method: 'POST', body: {} })).status, 200);
  assert.equal((await f.create(a, 1)).status, 201);
  assert.equal((await f.create(a, 2)).status, 201);
  const limited = await f.create(a, 3);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  f.advance(1001);
  assert.equal((await f.create(a, 3)).status, 201);
});

test('production cookie has a host prefix, Secure, HttpOnly and no Domain attribute', async t => {
  const f = await fixture(t, { baseURL: 'https://palaco-ambassades.onrender.com', development: false });
  const result = await f.call('/session', { method: 'POST', body: {}, headers: { Origin: 'https://palaco-ambassades.onrender.com' } });
  assert.equal(result.status, 200);
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /^__Host-palacoNova=/);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; SameSite=Strict/i);
  assert.match(cookie, /; Path=\//i);
  assert.doesNotMatch(cookie, /; Domain=/i);
});

test('configuration rejects insecure non-loopback origins and invalid capacity values', () => {
  for (const options of [
    { baseURL: 'http://example.com', development: true },
    { baseURL: 'http://127.0.0.1:9876', development: false },
    { baseURL: 'https://example.com/path' },
    { baseURL: 'https://user:pass@example.com' },
    { baseURL: 'https://example.com?x=1' },
    { baseURL: 'https://example.com', maxSessions: 0 },
    { baseURL: 'https://example.com', maxRequests: 0 },
    { baseURL: 'https://example.com', sessionTtlMs: -1 },
    { baseURL: 'https://example.com', requestTtlMs: 0 },
  ]) assert.throws(() => mountNovaReception(express(), options));
});

async function childServer(t) {
  const moduleURL = pathToFileURL(here + '/nova-reception.mjs').href;
  const script = [
    "import express from 'express';",
    "import {createServer} from 'node:http';",
    "import {once} from 'node:events';",
    "import {mountNovaReception} from " + JSON.stringify(moduleURL) + ";",
    "const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');",
    "const origin='http://127.0.0.1:'+server.address().port;const app=express();",
    "mountNovaReception(app,{baseURL:origin,development:true});server.on('request',app);",
    "console.log(origin);",
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: here, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child NOVA fixture did not start: ' + errors)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Child exited ' + code + ': ' + errors)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) { clearTimeout(timer); resolve(output.trim().split('\n')[0]); }
    });
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); } });
  return { child, origin };
}

test('a real Node process restart loses volatile sessions and receipts without accepting old credentials', async t => {
  const first = await childServer(t);
  const bootstrap = await fetch(first.origin + API + '/session', { method: 'POST', headers: { Origin: first.origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(bootstrap.status, 200);
  const session = await bootstrap.json();
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  const created = await fetch(first.origin + API + '/requests', { method: 'POST', headers: { Origin: first.origin, Cookie: cookie, 'X-NOVA-CSRF': session.session.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'FICTITIOUS_PROCESS_RESET_108', idempotencyKey: key(1) }) });
  assert.equal(created.status, 201);
  first.child.kill('SIGKILL');
  await once(first.child, 'exit');
  const second = await childServer(t);
  const denied = await fetch(second.origin + API + '/requests', { headers: { Cookie: cookie } });
  assert.equal(denied.status, 401);
  const fresh = await fetch(second.origin + API + '/session', { method: 'POST', headers: { Origin: second.origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(fresh.status, 200);
  assert.deepEqual((await fresh.json()).requests, []);
});

test('NOVA cannot open a chat or upgrade reception into execution authority', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a)).data.request;
  const forbidden = await f.call('/requests/' + created.id + '/actions', { method: 'POST', cookie: a.cookie, token: a.token, body: { action: 'open', revision: 1 } });
  assert.equal(forbidden.status, 400);
  assert.equal((await f.call('/requests/' + created.id + '/open', { method: 'POST', cookie: a.cookie, token: a.token, body: {} })).status, 404);
  const runtime = await f.call('/runtime');
  assert.equal(runtime.data.chatEnabled, false);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests[0].status, 'RECEIVED');
});

test('ambiguous, malformed or duplicated own cookies never authorize a session', async t => {
  const f = await fixture(t);
  const a = await f.session();
  await f.create(a, 1, 'FICTITIOUS_COOKIE_CONFUSION_294');
  for (const cookie of ['palacoNova=bad', a.cookie + '; ' + a.cookie, 'palacoNova=%00', 'palacoNova=' + 'a'.repeat(65)]) {
    const result = await f.call('/requests', { cookie });
    assert.equal(result.status, 400);
    assert.ok(!result.text.includes('FICTITIOUS_COOKIE_CONFUSION_294'));
  }
});

async function act(f, session, receipt, action, extra = {}) {
  return f.call('/requests/' + receipt.id + '/actions', {
    method: 'POST', cookie: session.cookie, token: session.token,
    body: { action, revision: receipt.revision, ...extra },
  });
}

function noConsent(receipt) {
  assert.equal(receipt.firstAcceptance, null);
  assert.equal(receipt.resumeTo, null);
}

test('a real reception step precedes first acceptance and server-recorded consent has a fixed narrow scope', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a, 1, 'Fictieve eerste ontvangstacceptatie.')).data.request;
  noConsent(created);
  assert.equal((await act(f, a, created, 'accept')).status, 409);
  const reception = await act(f, a, created, 'to_reception');
  assert.equal(reception.status, 200);
  assert.equal(reception.data.request.status, 'AT_RECEPTION');
  assert.equal(reception.data.request.revision, 2);
  noConsent(reception.data.request);
  f.advance(250);
  const accepted = await act(f, a, reception.data.request, 'accept');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.request.status, 'FIRST_ACCEPTED');
  assert.equal(accepted.data.request.revision, 3);
  assert.equal(accepted.data.request.resumeTo, null);
  assert.deepEqual(accepted.data.request.firstAcceptance, {
    acceptedAt: new Date(f.now()).toISOString(),
    scope: 'reception-only',
    actor: 'browser-test-session',
  });
  assert.equal(accepted.data.request.expiresAt, created.expiresAt, 'Acceptance never extends the receipt lifetime');
  const reread = await f.call('/requests', { cookie: a.cookie });
  assert.deepEqual(reread.data.requests[0], accepted.data.request);
  const reconnected = await f.call('/session', { method: 'POST', cookie: a.cookie, body: {} });
  assert.deepEqual(reconnected.data.requests[0], accepted.data.request);
  const runtime = await f.call('/runtime');
  assert.equal(runtime.data.chatEnabled, false);
  assert.equal((await f.call('/requests/' + created.id + '/open', { method: 'POST', cookie: a.cookie, token: a.token, body: {} })).status, 404);
});

test('strict reception transitions reject skipped steps, stale acceptance and client-supplied consent scope', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a)).data.request;
  for (const action of ['accept', 'refuse', 'resume']) assert.equal((await act(f, a, created, action)).status, 409);
  for (const extra of [{ scope: 'chat' }, { actor: 'human' }, { acceptedAt: new Date(f.now()).toISOString() }, { firstAcceptance: { scope: 'execution' } }]) {
    assert.equal((await act(f, a, created, 'to_reception', extra)).status, 400);
  }
  const atReception = (await act(f, a, created, 'to_reception')).data.request;
  assert.equal((await act(f, a, created, 'accept')).status, 409);
  assert.equal((await act(f, a, atReception, 'to_reception')).status, 409);
  assert.equal((await act(f, a, atReception, 'accept', { scope: 'chat' })).status, 400);
  assert.equal((await act(f, a, atReception, 'accept', { firstAcceptance: { actor: 'human' } })).status, 400);
  const accepted = (await act(f, a, atReception, 'accept')).data.request;
  assert.equal(accepted.status, 'FIRST_ACCEPTED');
  for (const action of ['accept', 'refuse', 'to_reception', 'resume']) assert.equal((await act(f, a, accepted, action)).status, 409);
  assert.deepEqual((await f.call('/requests', { cookie: a.cookie })).data.requests[0], accepted);
});

test('putting first acceptance on hold revokes consent; resuming requires a fresh explicit acceptance', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a)).data.request;
  const atReception = (await act(f, a, created, 'to_reception')).data.request;
  const heldReception = (await act(f, a, atReception, 'hold')).data.request;
  assert.equal(heldReception.status, 'ON_HOLD');
  assert.equal(heldReception.resumeTo, 'AT_RECEPTION');
  assert.equal(heldReception.firstAcceptance, null);
  assert.equal((await act(f, a, heldReception, 'accept')).status, 409);
  const resumedReception = (await act(f, a, heldReception, 'resume')).data.request;
  assert.equal(resumedReception.status, 'AT_RECEPTION');
  noConsent(resumedReception);
  const accepted = (await act(f, a, resumedReception, 'accept')).data.request;
  const originalAcceptance = accepted.firstAcceptance.acceptedAt;
  f.advance(1000);
  const heldAccepted = (await act(f, a, accepted, 'hold')).data.request;
  assert.equal(heldAccepted.status, 'ON_HOLD');
  assert.equal(heldAccepted.resumeTo, 'AT_RECEPTION');
  assert.equal(heldAccepted.firstAcceptance, null);
  const resumedAccepted = (await act(f, a, heldAccepted, 'resume')).data.request;
  assert.equal(resumedAccepted.status, 'AT_RECEPTION');
  noConsent(resumedAccepted);
  const reaccepted = (await act(f, a, resumedAccepted, 'accept')).data.request;
  assert.equal(reaccepted.status, 'FIRST_ACCEPTED');
  assert.notEqual(reaccepted.firstAcceptance.acceptedAt, originalAcceptance);
  assert.equal(reaccepted.expiresAt, created.expiresAt);
});

test('refusal is terminal, erases server text and prevents every transition or idempotent replay', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const text = 'FICTITIOUS_REFUSED_TEXT_572';
  const created = (await f.create(a, 1, text)).data.request;
  const atReception = (await act(f, a, created, 'to_reception')).data.request;
  const refused = await act(f, a, atReception, 'refuse');
  assert.equal(refused.status, 200);
  assert.equal(refused.data.request.status, 'REFUSED');
  assert.equal(refused.data.request.text, '');
  assert.equal(refused.data.request.revision, 3);
  noConsent(refused.data.request);
  assert.ok(!refused.text.includes(text));
  const reread = await f.call('/requests', { cookie: a.cookie });
  assert.deepEqual(reread.data.requests[0], refused.data.request);
  assert.ok(!reread.text.includes(text));
  for (const action of ['to_reception', 'accept', 'refuse', 'hold', 'resume', 'withdraw']) {
    assert.equal((await act(f, a, refused.data.request, action)).status, 410);
  }
  assert.equal((await f.create(a, 1, text)).status, 410);
  assert.equal((await f.create(a, 1, 'Different replacement')).status, 410);
  assert.equal((await f.call('/requests', { cookie: a.cookie })).data.requests.length, 1);
});

test('withdrawal or server expiry removes first acceptance and never revives permission', async t => {
  for (const closure of ['withdraw', 'expire']) {
    const f = await fixture(t, { requestTtlMs: 1000 });
    const a = await f.session();
    const text = 'FICTITIOUS_CONSENT_ERASE_' + closure;
    const created = (await f.create(a, 1, text)).data.request;
    const reception = (await act(f, a, created, 'to_reception')).data.request;
    f.advance(100);
    const accepted = (await act(f, a, reception, 'accept')).data.request;
    assert.equal(accepted.status, 'FIRST_ACCEPTED');
    assert.ok(accepted.firstAcceptance);
    let closed;
    if (closure === 'withdraw') closed = (await act(f, a, accepted, 'withdraw')).data.request;
    else {
      f.advance(901);
      closed = (await f.call('/requests', { cookie: a.cookie })).data.requests[0];
    }
    assert.equal(closed.status, closure === 'withdraw' ? 'WITHDRAWN' : 'EXPIRED');
    assert.equal(closed.text, '');
    noConsent(closed);
    assert.equal(closed.expiresAt, created.expiresAt);
    for (const action of ['accept', 'resume', 'to_reception']) assert.equal((await act(f, a, closed, action)).status, 410);
    assert.equal((await f.create(a, 1, text)).status, 410);
  }
});

test('foreign sessions cannot move, accept or refuse a known reception receipt', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const b = await f.session();
  const created = (await f.create(a)).data.request;
  const reception = (await act(f, a, created, 'to_reception')).data.request;
  for (const action of ['to_reception', 'accept', 'refuse', 'hold', 'withdraw']) {
    const foreign = await act(f, b, reception, action);
    const unknown = await act(f, b, { id: key(999), revision: reception.revision }, action);
    assert.equal(foreign.status, 404);
    assert.equal(unknown.status, 404);
    assert.deepEqual(foreign.data, unknown.data);
  }
  assert.deepEqual((await f.call('/requests', { cookie: b.cookie })).data.requests, []);
  assert.deepEqual((await f.call('/requests', { cookie: a.cookie })).data.requests[0], reception);
});

test('all new reception writes still require own CSRF and exact origin before recording consent', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const b = await f.session();
  let receipt = (await f.create(a)).data.request;
  for (const action of ['to_reception', 'accept', 'refuse']) {
    if (action === 'accept') receipt = (await act(f, a, receipt, 'to_reception')).data.request;
    const path = '/requests/' + receipt.id + '/actions';
    const options = { method: 'POST', cookie: a.cookie, body: { action, revision: receipt.revision } };
    for (const extra of [{}, { token: b.token }, { token: a.token, sendOrigin: false }, { token: a.token, headers: { Origin: 'https://attacker.example' } }, { token: a.token, headers: { 'Sec-Fetch-Site': 'cross-site' } }]) {
      assert.equal((await f.call(path, { ...options, ...extra })).status, 403);
    }
    assert.deepEqual((await f.call('/requests', { cookie: a.cookie })).data.requests[0], receipt);
  }
});

test('simultaneous acceptance and refusal cannot both succeed at the same receipt revision', async t => {
  const f = await fixture(t);
  const a = await f.session();
  const created = (await f.create(a)).data.request;
  const reception = (await act(f, a, created, 'to_reception')).data.request;
  const results = await Promise.all([act(f, a, reception, 'accept'), act(f, a, reception, 'refuse')]);
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.ok([409, 410].includes(results.find(result => result.status !== 200).status));
  const winner = results.find(result => result.status === 200).data.request;
  assert.equal(winner.revision, reception.revision + 1);
  if (winner.status === 'FIRST_ACCEPTED') assert.equal(winner.firstAcceptance.scope, 'reception-only');
  else { assert.equal(winner.status, 'REFUSED'); assert.equal(winner.text, ''); noConsent(winner); }
  assert.deepEqual((await f.call('/requests', { cookie: a.cookie })).data.requests[0], winner);
});
