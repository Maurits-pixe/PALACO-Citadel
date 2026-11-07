import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { openDatabase } from './db.js';
import { createBastionDemoApp, startBastionDemoServer } from './server.js';

const launcherOrigin = 'https://localhost:5173';

async function withApi(t, { now = () => 1_000, allowedOrigins = [launcherOrigin] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'bastion-demo-'));
  const db = openDatabase(join(directory, 'bastion.db'));
  const server = createServer(createBastionDemoApp({ db, now, allowedOrigins }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, db };
}

test('initializes persistent synthetic tasks and enables SQLite WAL with full sync', async t => {
  const { db } = await withApi(t);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(db.pragma('synchronous', { simple: true }), 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM tasks').get().count, 3);
});

test('prepares a server-owned ticket and executes only the bounded COMPLETE action once', async t => {
  const { baseUrl, db } = await withApi(t);
  const prepared = await fetch(`${baseUrl}/api/mutations/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'COMPLETE', payload: { taskId: 1 }, ownerId: 'attacker' })
  });
  assert.equal(prepared.status, 201);
  const ticket = await prepared.json();
  assert.equal(ticket.expiresAt, 31_000);
  assert.equal(db.prepare('SELECT owner_id FROM mutation_tickets WHERE id = ?').get(ticket.ticketId).owner_id, 'local-demo');

  const response = await fetch(`${baseUrl}/api/mutations/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId: ticket.ticketId })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = 1').get().status, 'COMPLETED');

  const replay = await fetch(`${baseUrl}/api/mutations/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId: ticket.ticketId })
  });
  assert.equal(replay.status, 409);
});

test('expired ticket does not mutate task and is durably marked consumed', async t => {
  let now = 100;
  const { baseUrl, db } = await withApi(t, { now: () => now });
  const prepared = await fetch(`${baseUrl}/api/mutations/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'COMPLETE', payload: { taskId: 1 } })
  });
  const ticket = await prepared.json();
  now = ticket.expiresAt;

  const response = await fetch(`${baseUrl}/api/mutations/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId: ticket.ticketId })
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'DEMO_CONSENT_EXPIRED');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = 1').get().status, 'PENDING');
  assert.equal(db.prepare('SELECT is_consumed FROM mutation_tickets WHERE id = ?').get(ticket.ticketId).is_consumed, 1);
});

test('rejects malformed payloads, unknown actions, absent tasks and malformed JSON', async t => {
  const { baseUrl, db } = await withApi(t);
  for (const body of [
    { action: 'DELETE', payload: { taskId: 1 } },
    { action: 'COMPLETE', payload: { taskId: '1' } },
    { action: 'COMPLETE', payload: { taskId: 1, status: 'COMPLETED' } }
  ]) {
    const response = await fetch(`${baseUrl}/api/mutations/prepare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 400);
  }

  const prepared = await fetch(`${baseUrl}/api/mutations/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'COMPLETE', payload: { taskId: 999 } })
  });
  const ticket = await prepared.json();
  const missingTask = await fetch(`${baseUrl}/api/mutations/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId: ticket.ticketId })
  });
  assert.equal(missingTask.status, 404);
  assert.equal(db.prepare('SELECT is_consumed FROM mutation_tickets WHERE id = ?').get(ticket.ticketId).is_consumed, 1);

  const malformed = await fetch(`${baseUrl}/api/mutations/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{'
  });
  assert.equal(malformed.status, 400);
});

test('CORS grants only configured exact origins', async t => {
  const { baseUrl } = await withApi(t);
  const allowed = await fetch(`${baseUrl}/api/tasks`, { headers: { origin: launcherOrigin } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), launcherOrigin);

  const denied = await fetch(`${baseUrl}/api/tasks`, { headers: { origin: 'https://evil.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal(denied.status, 200);
});

test('rate limits API traffic', async t => {
  const { baseUrl } = await withApi(t);
  let response;
  for (let request = 0; request < 61; request += 1) {
    response = await fetch(`${baseUrl}/api/tasks`);
  }
  assert.equal(response.status, 429);
});

test('database state survives closing and reopening the SQLite file', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bastion-restart-'));
  const filename = join(directory, 'bastion.db');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = openDatabase(filename);
  first.prepare("UPDATE tasks SET status = 'COMPLETED' WHERE id = 1").run();
  first.close();

  const reopened = openDatabase(filename);
  assert.equal(reopened.prepare('SELECT status FROM tasks WHERE id = 1').get().status, 'COMPLETED');
  reopened.close();
});

test('HTTPS startup refuses missing certificates before creating persistent data', t => {
  const directory = mkdtempSync(join(tmpdir(), 'bastion-no-cert-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'not-created.db');
  assert.throws(() => startBastionDemoServer({
    port: 0,
    certPath: join(directory, 'missing.pem'),
    keyPath: join(directory, 'missing-key.pem'),
    databasePath
  }), /ENOENT/);
  assert.equal(existsSync(databasePath), false);
});
