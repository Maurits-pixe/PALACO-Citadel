import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  openDatabaseHarness, subjects, personFor, sessionFor, setIdentity,
  transaction, asUser, createNote, expectDatabaseError,
} from './database-harness.mjs';

test('RIO private workspace: actual SQL authorization and atomicity', async t => {
  const db = await openDatabaseHarness();
  t.diagnostic(db.engine);
  const { alice, bob, unverified, phone, anonymous, banned, revoked, unbound } = subjects;
  try {
    for (const subject of Object.values(subjects).filter(id => id !== unbound)) {
      await db.query('insert into public.rio_person_bindings (person_id, provider_subject, status) values ($1, $2, $3)', [personFor(subject), subject, subject === revoked ? 'REVOKED' : 'ACTIVE']);
    }

    await t.test('all three tables enforce RLS; grants expose only own notes and events', async () => {
      const { rows } = await db.query("select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('rio_person_bindings','rio_notes','rio_note_events') order by relname");
      assert.equal(rows.length, 3);
      assert.ok(rows.every(row => row.relrowsecurity && row.relforcerowsecurity));
      for (const table of ['rio_person_bindings', 'rio_notes', 'rio_note_events']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const result = await db.query('select has_table_privilege($1, $2, $3) as allowed', ['anon', `public.${table}`, privilege]);
          assert.equal(result.rows[0].allowed, false, `anon ${privilege} ${table}`);
          const auth = await db.query('select has_table_privilege($1, $2, $3) as allowed', ['authenticated', `public.${table}`, privilege]);
          assert.equal(auth.rows[0].allowed, privilege === 'SELECT' && table !== 'rio_person_bindings', `authenticated ${privilege} ${table}`);
        }
      }
      const functions = await db.query("select proname, prosecdef, proconfig from pg_proc where proname in ('rio_current_person','rio_create_note') order by proname");
      assert.equal(functions.rows.length, 2);
      const privileged=await db.query("select n.nspname,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','rio_backend_private')");
      assert.equal(privileged.rows.length,2);assert.ok(privileged.rows.every(row=>row.nspname==='rio_backend_private'&&row.proconfig.some(option=>/^search_path=(?:\"\"|)$/.test(option))));
      assert.ok(functions.rows.every(row => !row.prosecdef && row.proconfig.some(option => /^search_path=(?:""|)$/.test(option))));
    });

    await t.test('anonymous role cannot call either privileged RPC or read a table', async () => {
      for (const sql of ['select public.rio_current_person()', `select * from public.rio_create_note('${randomUUID()}', 'title', 'body', true)`, 'select * from public.rio_notes', 'select * from public.rio_note_events', 'select * from public.rio_person_bindings']) {
        await expectDatabaseError(() => asUser(db, null, c => c.query(sql), { role: 'anon' }), '42501');
      }
      await expectDatabaseError(() => asUser(db, null, c => createNote(c, randomUUID())), '28000', 'RIO_AUTH_REQUIRED');
    });

    await t.test('only confirmed, nonanonymous, nonbanned, actively bound people resolve', async () => {
      for (const subject of [alice, phone]) {
        const result = await asUser(db, subject, c => c.query('select public.rio_current_person() as person'));
        assert.equal(result.rows[0].person, personFor(subject));
      }
      for (const subject of [unverified, anonymous, banned, revoked, unbound]) {
        const result = await asUser(db, subject, c => c.query('select public.rio_current_person() as person'));
        assert.equal(result.rows[0].person, null);
        await expectDatabaseError(() => asUser(db, subject, c => createNote(c, randomUUID())), '28000', 'RIO_AUTH_REQUIRED');
      }
    });

    await t.test('missing, malformed, foreign, expired and deleted sessions fail closed', async () => {
      for (const session_id of [null, 'not-a-uuid', sessionFor(bob), randomUUID()]) {
        await expectDatabaseError(() => asUser(db, alice, c => createNote(c, randomUUID()), { claims: { session_id } }), '28000', 'RIO_AUTH_REQUIRED');
      }
      await transaction(db, async c => {
        await c.query("update auth.sessions set not_after = clock_timestamp() - interval '1 second' where id = $1", [sessionFor(alice)]);
        await setIdentity(c, alice);
        assert.equal((await c.query('select public.rio_current_person() as person')).rows[0].person, null);
      });
      await transaction(db, async c => {
        await c.query('delete from auth.sessions where id = $1', [sessionFor(alice)]);
        await setIdentity(c, alice);
        assert.equal((await c.query('select public.rio_current_person() as person')).rows[0].person, null);
      });
    });

    await t.test('user-editable metadata and forged person fields grant no identity or permission', async () => {
      await expectDatabaseError(() => asUser(db, unverified, c => createNote(c, randomUUID()), {
        claims: { email_confirmed_at: new Date().toISOString(), is_anonymous: false, person_id: personFor(alice), user_metadata: { verified: true, person_id: personFor(alice), role: 'admin' } },
      }), '28000', 'RIO_AUTH_REQUIRED');
      await asUser(db, bob, async c => {
        const result = await c.query('select public.rio_current_person() as person');
        assert.equal(result.rows[0].person, personFor(bob));
      }, { claims: { person_id: personFor(alice), user_metadata: { person_id: personFor(alice) } } });
    });

    await t.test('explicit per-write consent and valid nonblank bounded content are mandatory', async () => {
      for (const consent of [false, null]) {
        await expectDatabaseError(() => asUser(db, alice, c => createNote(c, randomUUID(), 'title', 'body', consent)), '42501', 'RIO_CONSENT_REQUIRED');
      }
      for (const [title, body] of [[null, 'body'], ['title', null], ['', 'body'], [' \n\t', 'body'], ['\u00a0\u2003\ufeff', 'body'], ['title', ' \r\n'], ['x'.repeat(121), 'body'], ['title', 'x'.repeat(8001)]]) {
        await expectDatabaseError(() => asUser(db, alice, c => createNote(c, randomUUID(), title, body)), '22023', 'RIO_INVALID_NOTE');
      }
      await expectDatabaseError(() => asUser(db, alice, c => createNote(c, null)), '22023', 'RIO_INVALID_NOTE');
      await expectDatabaseError(() => asUser(db, alice, c => createNote(c, 'bad-uuid')), '22P02');
      await asUser(db, alice, async c => {
        const result = await createNote(c, randomUUID(), '😀'.repeat(120), 'é'.repeat(8000));
        assert.equal([...result.rows[0].title].length, 120);
        assert.equal(result.rows[0].body.length, 8000);
      });
    });

    await t.test('create derives actor and person; events contain no note title or body', async () => {
      await asUser(db, alice, async c => {
        const requestId = randomUUID();
        const result = await createNote(c, requestId, 'Synthetische privé titel', 'Synthetische privé tekst');
        const note = result.rows[0];
        assert.equal(note.person_id, personFor(alice));
        assert.equal(note.client_request_id, requestId);
        const event = (await c.query('select * from public.rio_note_events where note_id = $1', [note.id])).rows[0];
        assert.equal(event.actor_subject, alice);
        assert.equal(event.person_id, personFor(alice));
        assert.equal(event.action, 'CREATED');
        assert.deepEqual(Object.keys(event).sort(), ['action', 'actor_subject', 'created_at', 'id', 'note_id', 'person_id']);
        assert.ok(!JSON.stringify(event).includes('Synthetische privé'));
      });
    });

    await t.test('row policies isolate two people even when the filter is omitted or forged', async () => {
      await transaction(db, async c => {
        await setIdentity(c, alice);
        const a = (await createNote(c, randomUUID(), 'Alice', 'Synthetic A')).rows[0];
        await c.query('reset role');
        await setIdentity(c, bob);
        const b = (await createNote(c, randomUUID(), 'Bob', 'Synthetic B')).rows[0];
        assert.deepEqual((await c.query('select id from public.rio_notes')).rows.map(row => row.id), [b.id]);
        assert.equal((await c.query('select * from public.rio_notes where id = $1', [a.id])).rows.length, 0);
        assert.equal((await c.query('select * from public.rio_note_events where person_id = $1', [personFor(alice)])).rows.length, 0);
        await c.query('reset role');
        await setIdentity(c, alice);
        assert.deepEqual((await c.query('select id from public.rio_notes')).rows.map(row => row.id), [a.id]);
        assert.deepEqual((await c.query('select actor_subject from public.rio_note_events')).rows.map(row => row.actor_subject), [alice]);
      });
    });

    await t.test('direct writes, binding inspection, self-grants and actor forgery are denied', async () => {
      for (const sql of [
        'select * from public.rio_person_bindings',
        `insert into public.rio_notes (person_id,title,body,client_request_id) values ('${personFor(bob)}','forged','forged','${randomUUID()}')`,
        "update public.rio_notes set title = 'changed'",
        'delete from public.rio_notes', 'truncate public.rio_notes',
        `insert into public.rio_person_bindings (person_id,provider_subject) values ('${randomUUID()}','${unbound}')`,
        `insert into public.rio_note_events (note_id,person_id,actor_subject,action) values ('${randomUUID()}','${personFor(bob)}','${bob}','CREATED')`,
        "update public.rio_note_events set actor_subject = '22222222-2222-4222-8222-222222222222'",
        'delete from public.rio_note_events',
      ]) await expectDatabaseError(() => asUser(db, alice, c => c.query(sql)), '42501');
      // PostgreSQL can report an ineffective GRANT as a warning, not an error.
      // Check the effect rather than asserting an implementation-specific error.
      await asUser(db, alice, async c => {
        await c.query('grant insert on public.rio_notes to authenticated');
        assert.equal((await c.query("select has_table_privilege('authenticated','public.rio_notes','INSERT') as allowed")).rows[0].allowed, false);
      });
    });

    await t.test('same request and exact payload retry returns one note and one creation event', async () => {
      await asUser(db, alice, async c => {
        const requestId = randomUUID();
        const a = (await createNote(c, requestId, '  exact title  ', 'exact body\n')).rows[0];
        const b = (await createNote(c, requestId, '  exact title  ', 'exact body\n')).rows[0];
        assert.deepEqual(b, a);
        assert.equal((await c.query('select * from public.rio_notes')).rows.length, 1);
        assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 1);
      });
    });

    await t.test('request reuse with different title or body is a conflict and preserves the original', async () => {
      await asUser(db, alice, async c => {
        const requestId = randomUUID();
        const original = (await createNote(c, requestId, 'Original', 'Original body')).rows[0];
        for (const [title, body] of [['Changed', 'Original body'], ['Original', 'Changed']]) {
          await c.query('savepoint conflict');
          await expectDatabaseError(() => createNote(c, requestId, title, body), '23505', 'RIO_REQUEST_CONFLICT');
          await c.query('rollback to savepoint conflict');
        }
        assert.deepEqual((await c.query('select * from public.rio_notes')).rows, [original]);
        assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 1);
      });
    });

    await t.test('the same request UUID belongs independently to each person', async () => {
      await transaction(db, async c => {
        const requestId = randomUUID();
        await setIdentity(c, alice);
        const a = (await createNote(c, requestId)).rows[0];
        await c.query('reset role');
        await setIdentity(c, bob);
        const b = (await createNote(c, requestId)).rows[0];
        assert.notEqual(a.id, b.id);
        assert.equal(a.person_id, personFor(alice));
        assert.equal(b.person_id, personFor(bob));
      });
    });

    await t.test('SQL-looking content is inert data; caller search_path cannot shadow relations', async () => {
      await asUser(db, alice, async c => {
        await c.query('create temporary table rio_notes (forged text)');
        await c.query('set local search_path = pg_temp, public');
        const payload = "'); DELETE FROM public.rio_person_bindings; --";
        const result = await createNote(c, randomUUID(), '<script>synthetic</script>', payload);
        assert.equal(result.rows[0].body, payload);
        assert.equal(result.rows[0].person_id, personFor(alice));
        assert.equal((await c.query('select public.rio_current_person() as person')).rows[0].person, personFor(alice));
      });
    });

    await t.test('revocation, confirmation removal and bans block reads and later writes', async () => {
      for (const change of [
        "update public.rio_person_bindings set status = 'REVOKED' where provider_subject = $1",
        'update auth.users set email_confirmed_at = null where id = $1',
        "update auth.users set banned_until = clock_timestamp() + interval '1 day' where id = $1",
      ]) {
        await transaction(db, async c => {
          await setIdentity(c, alice);
          await createNote(c, randomUUID());
          await c.query('reset role');
          await c.query(change, [alice]);
          await setIdentity(c, alice);
          assert.equal((await c.query('select * from public.rio_notes')).rows.length, 0);
          assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 0);
          await c.query('savepoint revoked_write');
          await expectDatabaseError(() => createNote(c, randomUUID()), '28000', 'RIO_AUTH_REQUIRED');
          await c.query('rollback to savepoint revoked_write');
        });
      }
    });

    await t.test('30 creations per minute are allowed; retry does not consume a new slot', async () => {
      await asUser(db, alice, async c => {
        let first;
        for (let i = 0; i < 30; i += 1) {
          const requestId = randomUUID();
          if (i === 0) first = requestId;
          await createNote(c, requestId);
        }
        await createNote(c, first);
        await c.query('savepoint rate_limit');
        await expectDatabaseError(() => createNote(c, randomUUID()), 'P0001', 'RIO_RATE_LIMIT');
        await c.query('rollback to savepoint rate_limit');
        assert.equal((await c.query('select * from public.rio_notes')).rows.length, 30);
        assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 30);
      });
    });

    await t.test('a different person has an independent creation budget', async () => {
      await transaction(db, async c => {
        await setIdentity(c, alice);
        for (let i = 0; i < 30; i += 1) await createNote(c, randomUUID());
        await c.query('reset role');
        await setIdentity(c, bob);
        assert.equal((await createNote(c, randomUUID())).rows.length, 1);
      });
    });

    await t.test('500 stored notes is a hard per-person limit, including direct RPC calls', async () => {
      await transaction(db, async c => {
        await c.query("insert into public.rio_notes (person_id,title,body,client_request_id,created_at) select $1, 'Synthetic seed', 'Only test fixture data', gen_random_uuid(), clock_timestamp() - interval '1 hour' from generate_series(1, 500)", [personFor(alice)]);
        await setIdentity(c, alice);
        await c.query('savepoint quota_limit');
        await expectDatabaseError(() => createNote(c, randomUUID()), '54000', 'RIO_NOTE_LIMIT');
        await c.query('rollback to savepoint quota_limit');
        assert.equal((await c.query('select * from public.rio_notes')).rows.length, 500);
      });
    });

    await t.test('failed event append rolls the note back in the same statement', async () => {
      await transaction(db, async c => {
        await c.query("create function public.rio_test_event_failure() returns trigger language plpgsql as $$ begin raise exception using errcode = '23514', message = 'SYNTHETIC_EVENT_FAILURE'; end; $$");
        await c.query('create trigger rio_test_event_failure before insert on public.rio_note_events for each row execute function public.rio_test_event_failure()');
        await setIdentity(c, alice);
        const requestId = randomUUID();
        await c.query('savepoint atomic_write');
        await expectDatabaseError(() => createNote(c, requestId), '23514', 'SYNTHETIC_EVENT_FAILURE');
        await c.query('rollback to savepoint atomic_write');
        assert.equal((await c.query('select * from public.rio_notes where client_request_id = $1', [requestId])).rows.length, 0);
        assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 0);
      });
    });

    await t.test('session expiry during the atomic write removes both note and event', async () => {
      await transaction(db, async c => {
        await c.query("update auth.sessions set not_after = clock_timestamp() + interval '1 day' where id = $1", [sessionFor(alice)]);
        // Deterministically invalidate the session only after the note insert,
        // inside the event append. This proves the final guard, even on slow CI.
        await c.query("create function public.rio_test_event_delay() returns trigger language plpgsql as $$ begin update auth.sessions set not_after = clock_timestamp() - interval '1 second' where user_id = new.actor_subject; return new; end; $$");
        await c.query('create trigger rio_test_event_delay before insert on public.rio_note_events for each row execute function public.rio_test_event_delay()');
        await setIdentity(c, alice);
        const requestId = randomUUID();
        await c.query('savepoint expiry_write');
        await expectDatabaseError(() => createNote(c, requestId), '28000', 'RIO_AUTH_REQUIRED');
        await c.query('rollback to savepoint expiry_write');
        await c.query('reset role');
        assert.equal((await c.query('select * from public.rio_notes where client_request_id = $1', [requestId])).rows.length, 0);
        assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 0);
      });
    });

    await t.test('creation events reject update and delete even by the fixture owner', async () => {
      await transaction(db, async c => {
        await setIdentity(c, alice);
        await createNote(c, randomUUID());
        await c.query('reset role');
        for (const sql of ["update public.rio_note_events set action = 'CREATED'", 'delete from public.rio_note_events']) {
          await c.query('savepoint append_only');
          await expectDatabaseError(() => c.query(sql), '42501', 'RIO_EVENT_APPEND_ONLY');
          await c.query('rollback to savepoint append_only');
        }
      });
    });

    await t.test('a timed-out write leaves neither note nor event', { skip: !db.canOpenParallelConnections && 'PGlite does not implement PostgreSQL statement_timeout cancellation; real PostgreSQL CI covers it.' }, async () => {
      await transaction(db, async c => {
        await c.query("create function public.rio_test_timeout() returns trigger language plpgsql as $$ begin perform pg_sleep(0.2); return new; end; $$");
        await c.query('create trigger rio_test_timeout before insert on public.rio_note_events for each row execute function public.rio_test_timeout()');
        await setIdentity(c, alice);
        await c.query("set local statement_timeout = '50ms'");
        const requestId = randomUUID();
        await c.query('savepoint timeout_write');
        await expectDatabaseError(() => createNote(c, requestId), '57014');
        await c.query('rollback to savepoint timeout_write');
        await c.query("set local statement_timeout = '0'");
        assert.equal((await c.query('select * from public.rio_notes where client_request_id = $1', [requestId])).rows.length, 0);
        assert.equal((await c.query('select * from public.rio_note_events')).rows.length, 0);
      });
    });

    await t.test('parallel PostgreSQL retries serialize into one note and one event', { skip: !db.canOpenParallelConnections && 'PGlite is single-connection; real PostgreSQL CI covers concurrent transactions.' }, async () => {
      const connections = await Promise.all([db.newConnection(), db.newConnection()]);
      const requestId = randomUUID();
      try {
        const rows = await Promise.all(connections.map(async c => {
          await c.query('begin');
          await setIdentity(c, alice);
          const result = await createNote(c, requestId);
          await c.query('commit');
          return result.rows[0];
        }));
        assert.equal(rows[0].id, rows[1].id);
        assert.equal((await db.query('select * from public.rio_notes where client_request_id = $1', [requestId])).rows.length, 1);
        assert.equal((await db.query('select * from public.rio_note_events where note_id = $1', [rows[0].id])).rows.length, 1);
      } finally {
        await Promise.all(connections.map(async c => { await c.query('rollback'); await c.end(); }));
      }
    });

    await t.test('a revoke committed while a write waits for its lock blocks that write', { skip: !db.canOpenParallelConnections && 'PGlite is single-connection; real PostgreSQL CI covers concurrent revocation.' }, async () => {
      const [blocker, writer] = await Promise.all([db.newConnection(), db.newConnection()]);
      const requestId = randomUUID();
      let attempt;
      try {
        await blocker.query('begin');
        await blocker.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [personFor(alice)]);
        await writer.query('begin');
        await setIdentity(writer, alice);
        const pid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
        attempt = createNote(writer, requestId).then(result => ({ result }), error => ({ error }));
        let waiting = false;
        for (let poll = 0; poll < 100; poll += 1) {
          waiting = (await db.query("select exists(select 1 from pg_locks where pid = $1 and locktype = 'advisory' and not granted) as waiting", [pid])).rows[0].waiting;
          if (waiting) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, 'Writer must actually be waiting for the person lock before revocation.');
        await db.query("update public.rio_person_bindings set status = 'REVOKED' where provider_subject = $1", [alice]);
        await blocker.query('rollback');
        const outcome = await attempt;
        assert.equal(outcome.error?.code, '28000');
        assert.equal(outcome.error?.message, 'RIO_AUTH_REQUIRED');
        await writer.query('rollback');
        assert.equal((await db.query('select * from public.rio_notes where client_request_id = $1', [requestId])).rows.length, 0);
      } finally {
        await blocker.query('rollback');
        if (attempt) await attempt;
        await writer.query('rollback');
        await Promise.all([blocker.end(), writer.end()]);
        await db.query("update public.rio_person_bindings set status = 'ACTIVE' where provider_subject = $1", [alice]);
      }
    });
  } finally { await db.close(); }
});
