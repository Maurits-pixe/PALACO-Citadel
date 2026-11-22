-- PALACO CITADEL — populated-table denial and transaction rollback QA.
-- EPHEMERAL GitHub Actions PostgreSQL only. NEVER use on shared databases.
\set ON_ERROR_STOP on
BEGIN;
-- Controlled fixture seeding: only the disposable CI superuser may temporarily
-- disable user triggers. This demonstrates why privileged DB accounts must never
-- be given production application credentials.
ALTER TABLE citadel_pin_draft.pin_state DISABLE TRIGGER USER;
ALTER TABLE citadel_pin_draft.pin_history DISABLE TRIGGER USER;
INSERT INTO citadel_pin_draft.pin_state
  (registry_key,issuer_fingerprint,revision,registry_sha256,head_sha256)
VALUES ('ephemeral-filled',repeat('a',64),2,repeat('c',64),repeat('d',64));
INSERT INTO citadel_pin_draft.pin_history
  (registry_key,sequence,previous_head_sha256,new_head_sha256,
   from_revision,to_revision,from_registry_sha256,to_registry_sha256)
VALUES ('ephemeral-filled',1,repeat('0',64),repeat('d',64),
        1,2,repeat('b',64),repeat('c',64));
ALTER TABLE citadel_pin_draft.pin_history ENABLE TRIGGER USER;
ALTER TABLE citadel_pin_draft.pin_state ENABLE TRIGGER USER;

DO $test$
DECLARE
  accepted boolean;
  message text;
BEGIN
  IF (SELECT count(*) FROM citadel_pin_draft.pin_state
      WHERE registry_key='ephemeral-filled') <> 1 OR
     (SELECT count(*) FROM citadel_pin_draft.pin_history
      WHERE registry_key='ephemeral-filled') <> 1 THEN
    RAISE EXCEPTION 'FAIL: fixture not populated';
  END IF;

  accepted:=false;
  BEGIN
    UPDATE citadel_pin_draft.pin_state SET revision=3
    WHERE registry_key='ephemeral-filled';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
    accepted:= message='PALACO_CITADEL_PIN_STATE_FROZEN';
  END;
  IF NOT accepted THEN RAISE EXCEPTION 'FAIL: populated state UPDATE was allowed'; END IF;

  accepted:=false;
  BEGIN
    DELETE FROM citadel_pin_draft.pin_state WHERE registry_key='ephemeral-filled';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
    accepted:= message='PALACO_CITADEL_PIN_STATE_FROZEN';
  END;
  IF NOT accepted THEN RAISE EXCEPTION 'FAIL: populated state DELETE was allowed'; END IF;

  accepted:=false;
  BEGIN
    UPDATE citadel_pin_draft.pin_history SET to_revision=3
    WHERE registry_key='ephemeral-filled' AND sequence=1;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
    accepted:= message='PALACO_CITADEL_AUDIT_IMMUTABLE';
  END;
  IF NOT accepted THEN RAISE EXCEPTION 'FAIL: populated history UPDATE was allowed'; END IF;

  accepted:=false;
  BEGIN
    DELETE FROM citadel_pin_draft.pin_history
    WHERE registry_key='ephemeral-filled' AND sequence=1;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
    accepted:= message='PALACO_CITADEL_AUDIT_IMMUTABLE';
  END;
  IF NOT accepted THEN RAISE EXCEPTION 'FAIL: populated history DELETE was allowed'; END IF;

  IF (SELECT revision FROM citadel_pin_draft.pin_state
      WHERE registry_key='ephemeral-filled') <> 2 OR
     (SELECT to_revision FROM citadel_pin_draft.pin_history
      WHERE registry_key='ephemeral-filled' AND sequence=1) <> 2 THEN
    RAISE EXCEPTION 'FAIL: denied DML mutated populated fixture';
  END IF;
  RAISE NOTICE 'PASS: populated-table UPDATE/DELETE rejected; fixture unchanged';
END
$test$;
-- Rollback the *entire* transaction, including fixture setup.
ROLLBACK;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM citadel_pin_draft.pin_state
             WHERE registry_key='ephemeral-filled') OR
     EXISTS (SELECT 1 FROM citadel_pin_draft.pin_history
             WHERE registry_key='ephemeral-filled') THEN
    RAISE EXCEPTION 'FAIL: fixture survived explicit rollback';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='citadel_pin_draft' AND NOT t.tgisinternal
        AND t.tgenabled='O' AND t.tgname IN
          ('pin_history_no_insert','pin_history_no_mutation',
           'pin_history_no_truncate','pin_state_no_write',
           'pin_state_no_truncate')) <> 5 THEN
    RAISE EXCEPTION 'FAIL: triggers not fully enabled following rollback';
  END IF;
  RAISE NOTICE 'PASS: transaction rollback removed fixture; all HOLD triggers enabled';
END
$verify$;
