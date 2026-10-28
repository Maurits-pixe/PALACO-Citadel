import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// This harness creates objects only in an empty, disposable synthetic database.
// It never resets, truncates or drops an existing schema or database.
export async function openDatabaseHarness() {
  const mode = process.env.RIO_TEST_DATABASE_MODE;
  const databaseUrl = process.env.RIO_TEST_DATABASE_URL;
  let raw;
  let connectionFactory;
  let engine;
  if (mode === 'pglite') {
    assert.equal(databaseUrl, undefined, 'Do not combine PGlite mode with a database URL.');
    const { PGlite } = await import('@electric-sql/pglite');
    raw = new PGlite();
    await raw.waitReady;
    engine = 'PGlite in-memory PostgreSQL; not hosted Supabase';
  } else {
    assert.ok(!mode || mode === 'postgres', 'Unknown RIO_TEST_DATABASE_MODE.');
    assert.ok(databaseUrl, 'Set RIO_TEST_DATABASE_URL for disposable PostgreSQL, or explicitly select RIO_TEST_DATABASE_MODE=pglite.');
    const parsed = new URL(databaseUrl);
    assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'Expected a PostgreSQL URL.');
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'Test fixtures may only target local disposable PostgreSQL.');
    assert.match(decodeURIComponent(parsed.pathname.slice(1)), /^rio_backend_test_[a-z0-9_]+$/, 'Use a dedicated rio_backend_test_* database.');
    const { Client } = await import('pg');
    connectionFactory = async () => {
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      return client;
    };
    raw = await connectionFactory();
    engine = 'PostgreSQL; synthetic Supabase Auth fixture';
  }
  const db = {
    engine,
    canOpenParallelConnections: Boolean(connectionFactory),
    query: (sql, parameters) => raw.query(sql, parameters),
    script: (sql) => mode === 'pglite' ? raw.exec(sql) : raw.query(sql),
    close: () => mode === 'pglite' ? raw.close() : raw.end(),
    newConnection: connectionFactory,
  };
  try {
    const { rows } = await db.query("select to_regclass('auth.users') as auth_users, to_regclass('public.rio_notes') as rio_notes");
    assert.equal(rows[0].auth_users, null, 'Refusing to modify an existing Auth schema.');
    assert.equal(rows[0].rio_notes, null, 'Refusing to modify an existing RIO schema.');
    await db.script(await readFile(new URL('./database-fixture.sql', import.meta.url), 'utf8'));
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    const names = (await readdir(migrations)).filter(name => /^\d{14}_[a-z_]+\.sql$/.test(name)).sort();
    assert.equal(names.length, 2, 'Expected the two reviewed migrations.');
    for (const name of names) await db.script(await readFile(new URL(name, migrations), 'utf8'));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export const subjects = Object.freeze({
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  unverified: '33333333-3333-4333-8333-333333333333',
  phone: '44444444-4444-4444-8444-444444444444',
  anonymous: '55555555-5555-4555-8555-555555555555',
  banned: '66666666-6666-4666-8666-666666666666',
  revoked: '77777777-7777-4777-8777-777777777777',
  unbound: '88888888-8888-4888-8888-888888888888',
});

export function personFor(subject) { return `a${subject.slice(1)}`; }
export function sessionFor(subject) { return `b${subject.slice(1)}`; }
export function claimsFor(subject, extra = {}) {
  return { sub: subject, role: 'authenticated', session_id: sessionFor(subject), ...extra };
}

export async function setIdentity(connection, subject, { role = 'authenticated', claims = {} } = {}) {
  assert.ok(['authenticated', 'anon'].includes(role));
  await connection.query(`set local role ${role}`);
  await connection.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [subject ?? '', JSON.stringify(subject ? claimsFor(subject, claims) : claims)]);
}

export async function transaction(db, callback) {
  await db.query('begin');
  try { return await callback(db); }
  finally { await db.query('rollback'); }
}

export function asUser(db, subject, callback, identity) {
  return transaction(db, async connection => {
    await setIdentity(connection, subject, identity);
    return callback(connection);
  });
}

export function createNote(connection, requestId, title = 'Synthetische notitie', body = 'Alleen testinhoud.', consent = true) {
  return connection.query('select * from public.rio_create_note($1::uuid, $2::text, $3::text, $4::boolean)', [requestId, title, body, consent]);
}

export async function expectDatabaseError(operation, code, message) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, code);
    if (message) assert.equal(error.message, message);
    return true;
  });
}
