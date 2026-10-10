import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySessionStore } from '../session-store.mjs';

const START = Date.parse('2030-01-01T00:00:00Z');
const payload = (overrides = {}) => ({
  header: { iat: START / 1000, uat: START / 1000, exp: START / 1000 + 60 },
  data: { id_token: 'private-decoding-fixture', nested: { value: 'original' } },
  cookie: { expires: START + 60000, maxAge: 60000 },
  ...overrides,
});
const invoke = (store, method, ...args) => new Promise((resolve, reject) => {
  store[method](...args, (error, value) => error ? reject(error) : resolve(value));
});
const unavailable = error => error?.status === 503;

test('server sessions are private copies on both writes and reads', async () => {
  const store = new MemorySessionStore({ now: () => START });
  const submitted = payload();
  await invoke(store, 'set', 'fixture-session', submitted);
  submitted.data.nested.value = 'changed-after-write';
  submitted.header.exp = 0;
  const read = await invoke(store, 'get', 'fixture-session');
  assert.equal(read.data.nested.value, 'original');
  read.data.nested.value = 'changed-after-read';
  read.header.exp = 0;
  const again = await invoke(store, 'get', 'fixture-session');
  assert.equal(again.data.nested.value, 'original');
  assert.equal(again.header.exp, START / 1000 + 60);
});

test('missing sessions and process restarts cannot restore an old browser session ID', async () => {
  const store = new MemorySessionStore({ now: () => START });
  assert.equal(await invoke(store, 'get', 'missing-session'), null);
  await invoke(store, 'set', 'fixture-session', payload());
  const restartedStore = new MemorySessionStore({ now: () => START });
  assert.equal(await invoke(restartedStore, 'get', 'fixture-session'), null);
});

test('expiration denies the session at the exact expiry instant', async () => {
  let time = START;
  const store = new MemorySessionStore({ now: () => time });
  await invoke(store, 'set', 'fixture-session', payload());
  time = START + 59999;
  assert.ok(await invoke(store, 'get', 'fixture-session'));
  time = START + 60000;
  assert.equal(await invoke(store, 'get', 'fixture-session'), null);
  time++;
  assert.equal(await invoke(store, 'get', 'fixture-session'), null);
});

test('logout destroys the old session ID and concurrent stale writes cannot resurrect it', async () => {
  const store = new MemorySessionStore({ now: () => START });
  await invoke(store, 'set', 'fixture-session', payload());
  const concurrentRequest = await invoke(store, 'get', 'fixture-session');
  await invoke(store, 'destroy', 'fixture-session');
  assert.equal(await invoke(store, 'get', 'fixture-session'), null);
  await assert.rejects(() => invoke(store, 'set', 'fixture-session', concurrentRequest), unavailable);
  assert.equal(await invoke(store, 'get', 'fixture-session'), null);
});

test('expired sessions leave a tombstone that blocks a stale rolling write', async () => {
  let time = START;
  const store = new MemorySessionStore({ now: () => time });
  await invoke(store, 'set', 'fixture-session', payload());
  const concurrentRequest = await invoke(store, 'get', 'fixture-session');
  time = START + 60000;
  assert.equal(await invoke(store, 'get', 'fixture-session'), null);
  concurrentRequest.header.uat = time / 1000;
  concurrentRequest.header.exp = time / 1000 + 60;
  concurrentRequest.cookie.expires = time + 60000;
  await assert.rejects(() => invoke(store, 'set', 'fixture-session', concurrentRequest), unavailable);
  assert.equal(await invoke(store, 'get', 'fixture-session'), null);
});

test('capacity rejects new sessions instead of evicting an existing live session', async () => {
  const store = new MemorySessionStore({ maxSessions: 1, now: () => START });
  await invoke(store, 'set', 'fixture-session-a', payload());
  await assert.rejects(() => invoke(store, 'set', 'fixture-session-b', payload()), unavailable);
  assert.ok(await invoke(store, 'get', 'fixture-session-a'));
  assert.equal(await invoke(store, 'get', 'fixture-session-b'), null);
});

test('capacity preserves logout tombstones until their bounded retention time passes', async () => {
  let time = START;
  const store = new MemorySessionStore({ maxSessions: 1, now: () => time });
  await invoke(store, 'set', 'fixture-session-a', payload());
  await invoke(store, 'destroy', 'fixture-session-a');
  await assert.rejects(() => invoke(store, 'set', 'fixture-session-b', payload()), unavailable);
  assert.equal(await invoke(store, 'get', 'fixture-session-a'), null);
  time = START + (8 * 60 * 60 + 31) * 1000;
  const newPayload = payload({
    header: { iat: time / 1000, uat: time / 1000, exp: time / 1000 + 60 },
    cookie: { expires: time + 60000, maxAge: 60000 },
  });
  await invoke(store, 'set', 'fixture-session-b', newPayload);
  assert.ok(await invoke(store, 'get', 'fixture-session-b'));
});

test('malformed or already expired writes fail closed', async () => {
  const store = new MemorySessionStore({ now: () => START });
  for (const invalid of [null, {}, payload({ header: {} }),
    payload({ header: { iat: START / 1000, uat: START / 1000, exp: START / 1000 } }),
    payload({ header: { iat: START / 1000, uat: START / 1000, exp: Number.NaN } }),
  ]) {
    await assert.rejects(() => invoke(store, 'set', 'fixture-invalid-session', invalid), unavailable);
    assert.equal(await invoke(store, 'get', 'fixture-invalid-session'), null);
  }
});
