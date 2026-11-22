-- Runs ONLY against the ephemeral PostgreSQL service in GitHub Actions.
-- Never run against PALACO MONO, staging or a shared database.
\set ON_ERROR_STOP on
\ir registry-pin-cas-draft.sql

BEGIN;
DO $test$
DECLARE
  failed boolean;
  actual_state text;
  audit_count integer;
BEGIN
  -- Validate the exact database version of row-security and triggers.
  IF (SELECT count(*) FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='citadel_pin_draft'
        AND c.relname IN ('pin_state','pin_history')
        AND c.relrowsecurity AND c.relforcerowsecurity) <> 2 THEN
    RAISE EXCEPTION 'FAIL: FORCE RLS not present on both tables';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='citadel_pin_draft' AND NOT t.tgisinternal
        AND t.tgenabled='O' AND t.tgname IN
          ('pin_history_no_insert','pin_history_no_mutation',
           'pin_history_no_truncate','pin_state_no_write',
           'pin_state_no_truncate')) <> 5 THEN
    RAISE EXCEPTION 'FAIL: expected enabled HOLD triggers are missing';
  END IF;

  -- A correctly named trigger can still silently lose protection if its
  -- event mask changes. Assert the exact BEFORE/ROW/STATEMENT event masks.
  -- PostgreSQL tgtype bits: ROW=1, BEFORE=2, INSERT=4, DELETE=8,
  -- UPDATE=16, TRUNCATE=32.
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='citadel_pin_draft' AND NOT t.tgisinternal
      AND (
        (c.relname='pin_history' AND t.tgname='pin_history_no_insert'
          AND t.tgtype <> 7)
        OR (c.relname='pin_history' AND t.tgname='pin_history_no_mutation'
          AND t.tgtype <> 27)
        OR (c.relname='pin_history' AND t.tgname='pin_history_no_truncate'
          AND t.tgtype <> 34)
        OR (c.relname='pin_state' AND t.tgname='pin_state_no_write'
          AND t.tgtype <> 31)
        OR (c.relname='pin_state' AND t.tgname='pin_state_no_truncate'
          AND t.tgtype <> 34)
      )
  ) THEN
    RAISE EXCEPTION 'FAIL: HOLD trigger event mask drift';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='citadel_pin_draft' AND NOT t.tgisinternal
      AND t.tgname IN ('pin_history_no_insert','pin_history_no_mutation',
        'pin_history_no_truncate','pin_state_no_write','pin_state_no_truncate')
      AND t.tgtype IN (7,27,31,34)
  ) <> 5 THEN
    RAISE EXCEPTION 'FAIL: HOLD trigger event contracts incomplete';
  END IF;

  -- HOLD is not just a runtime exception: no RLS policy may implicitly
  -- grant read/write access, and the guard routines must remain invoker-only.
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='citadel_pin_draft'
      AND c.relname IN ('pin_state','pin_history')
  ) THEN
    RAISE EXCEPTION 'FAIL: unexpected RLS policy in inert HOLD schema';
  END IF;

  IF (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='citadel_pin_draft'
        AND p.proname IN ('cas_pin_update_disabled',
          'reject_state_mutation','reject_history_mutation')
        AND p.prokind='f' AND NOT p.prosecdef) <> 3 THEN
    RAISE EXCEPTION 'FAIL: security definer or missing HOLD guard function';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname='citadel_pin_draft'
      AND p.proname IN ('cas_pin_update_disabled',
        'reject_state_mutation','reject_history_mutation')
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: PUBLIC can execute a HOLD guard function';
  END IF;

  -- An invoker-only guard also needs an explicit, restricted search_path.
  -- Reject drift in its function definition, not just runtime outcomes.
  IF (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='citadel_pin_draft'
        AND p.proname IN ('cas_pin_update_disabled',
          'reject_state_mutation','reject_history_mutation')
        AND p.proconfig @> ARRAY['search_path=pg_catalog, citadel_pin_draft']::text[]
      ) <> 3 THEN
    RAISE EXCEPTION 'FAIL: HOLD guard function search_path drift';
  END IF;

  -- No public schema visibility or direct table privileges are appropriate
  -- while the registry-pin writer is intentionally disabled.
  IF EXISTS (
    SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
    WHERE n.nspname='citadel_pin_draft' AND acl.grantee=0
      AND acl.privilege_type IN ('USAGE','CREATE')
  ) THEN
    RAISE EXCEPTION 'FAIL: PUBLIC can access the HOLD schema';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
    WHERE n.nspname='citadel_pin_draft'
      AND c.relname IN ('pin_state','pin_history')
      AND acl.grantee=0
  ) THEN
    RAISE EXCEPTION 'FAIL: PUBLIC has privileges on HOLD tables';
  END IF;

  failed := false;
  BEGIN
    PERFORM citadel_pin_draft.cas_pin_update_disabled();
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state = 'PALACO_CITADEL_HOLD_NO_AUTHORIZED_WRITER';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: CAS function did not deny execution'; END IF;

  failed := false;
  BEGIN
    INSERT INTO citadel_pin_draft.pin_state
      (registry_key,issuer_fingerprint,revision,registry_sha256,head_sha256)
    VALUES ('ephemeral',repeat('a',64),1,repeat('b',64),repeat('0',64));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state = 'PALACO_CITADEL_PIN_STATE_FROZEN';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: state INSERT was not rejected'; END IF;

  failed := false;
  BEGIN
    INSERT INTO citadel_pin_draft.pin_history
      (registry_key,sequence,previous_head_sha256,new_head_sha256,
       from_revision,to_revision,from_registry_sha256,to_registry_sha256)
    VALUES ('ephemeral',1,repeat('0',64),repeat('d',64),1,2,repeat('b',64),repeat('c',64));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state = 'PALACO_CITADEL_AUDIT_IMMUTABLE';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: audit INSERT was not rejected'; END IF;

  -- A bare state TRUNCATE is rejected first by the history foreign key.
  failed := false;
  BEGIN
    TRUNCATE citadel_pin_draft.pin_state;
  EXCEPTION WHEN SQLSTATE '0A000' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state LIKE 'cannot truncate a table referenced in a foreign key constraint%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: FK did not reject bare state TRUNCATE'; END IF;

  -- With CASCADE, PostgreSQL can reach our HOLD statement-level triggers.
  -- Either state or history trigger may reject first depending on firing order.
  failed := false;
  BEGIN
    TRUNCATE citadel_pin_draft.pin_state CASCADE;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state IN
      ('PALACO_CITADEL_PIN_STATE_FROZEN','PALACO_CITADEL_AUDIT_IMMUTABLE');
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: cascading state TRUNCATE bypassed HOLD'; END IF;

  -- Truncating both referencing tables together passes FK preflight, but
  -- must still be denied by the read-only HOLD statement triggers.
  failed := false;
  BEGIN
    TRUNCATE citadel_pin_draft.pin_state, citadel_pin_draft.pin_history;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state IN
      ('PALACO_CITADEL_PIN_STATE_FROZEN','PALACO_CITADEL_AUDIT_IMMUTABLE');
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: multi-table TRUNCATE bypassed HOLD'; END IF;

  failed := false;
  BEGIN
    TRUNCATE citadel_pin_draft.pin_history;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual_state = MESSAGE_TEXT;
    failed := actual_state = 'PALACO_CITADEL_AUDIT_IMMUTABLE';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAIL: audit TRUNCATE was not rejected'; END IF;

  SELECT count(*) INTO audit_count FROM citadel_pin_draft.pin_history;
  IF audit_count <> 0 OR (SELECT count(*) FROM citadel_pin_draft.pin_state) <> 0
  THEN RAISE EXCEPTION 'FAIL: denied writes left residual state'; END IF;

  RAISE NOTICE 'PASS: FORCE RLS, active triggers, CAS deny, INSERT deny, TRUNCATE deny, no residual writes';
END
$test$;
ROLLBACK;
