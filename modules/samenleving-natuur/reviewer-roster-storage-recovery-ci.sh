#!/usr/bin/env bash
# PALACO CITADEL — disposable PostgreSQL recovery integrity regression ONLY.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" ||
      "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "postgres" ]]; then
  echo 'DENY: requires disposable localhost PostgreSQL CI service' >&2
  exit 64
fi
cleanup() {
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_roster_recovery_ci CASCADE' >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_roster_recovery_ci;
CREATE TABLE citadel_roster_recovery_ci.checkpoint (
 registry_key text PRIMARY KEY,
 store_version integer NOT NULL CHECK (store_version>0),
 revision integer NOT NULL CHECK (revision>0),
 head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_roster_recovery_ci.history (
 registry_key text NOT NULL,
 store_version integer NOT NULL,
 head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY (registry_key,store_version),
 UNIQUE (registry_key,head_sha256)
);
INSERT INTO citadel_roster_recovery_ci.checkpoint
 VALUES ('ci-only',12,8,repeat('a',64));

-- A duplicate history record must abort the checkpoint change in the same
-- subtransaction, leaving only the original version 12 and audit version 13.
BEGIN;
DO $test$
DECLARE changed integer; duplicate_failed boolean := false;
BEGIN
 UPDATE citadel_roster_recovery_ci.checkpoint SET
 store_version=13,revision=9,head_sha256=repeat('b',64)
 WHERE registry_key='ci-only' AND store_version=12 AND revision=8
   AND head_sha256=repeat('a',64);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'FAIL: initial CAS must update one row'; END IF;
 INSERT INTO citadel_roster_recovery_ci.history
 VALUES ('ci-only',13,repeat('b',64));
 BEGIN
  UPDATE citadel_roster_recovery_ci.checkpoint SET
    store_version=14,revision=10,head_sha256=repeat('c',64)
  WHERE registry_key='ci-only' AND store_version=13
    AND revision=9 AND head_sha256=repeat('b',64);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'FAIL: setup for duplicate audit was not applied'; END IF;
  INSERT INTO citadel_roster_recovery_ci.history
  VALUES ('ci-only',13,repeat('c',64));
 EXCEPTION WHEN unique_violation THEN
  duplicate_failed := true;
 END;
 IF NOT duplicate_failed THEN RAISE EXCEPTION 'FAIL: duplicate audit was accepted'; END IF;
 IF NOT EXISTS (SELECT 1 FROM citadel_roster_recovery_ci.checkpoint
    WHERE registry_key='ci-only' AND store_version=13
      AND revision=9 AND head_sha256=repeat('b',64)) THEN
  RAISE EXCEPTION 'FAIL: failed audit append left mutated checkpoint';
 END IF;
 IF (SELECT count(*) FROM citadel_roster_recovery_ci.history)<>1 THEN
  RAISE EXCEPTION 'FAIL: duplicate audit changed history';
 END IF;
 RAISE NOTICE 'PASS: duplicate audit rejected and intermediate CAS rolled back';
END $test$;
COMMIT;
SQL

# Simulate a lost client connection: psql exits with an open transaction
# and PostgreSQL rolls it back. No COMMIT is sent.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE citadel_roster_recovery_ci.checkpoint SET
 store_version=14,revision=10,head_sha256=repeat('d',64)
WHERE registry_key='ci-only' AND store_version=13 AND revision=9
 AND head_sha256=repeat('b',64);
INSERT INTO citadel_roster_recovery_ci.history
 VALUES ('ci-only',14,repeat('d',64));
-- Connection closes without committing this transaction.
SQL

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $assert$
DECLARE changed integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM citadel_roster_recovery_ci.checkpoint
   WHERE registry_key='ci-only' AND store_version=13 AND revision=9
     AND head_sha256=repeat('b',64)) THEN
   RAISE EXCEPTION 'FAIL: disconnected transaction changed checkpoint';
 END IF;
 IF (SELECT count(*) FROM citadel_roster_recovery_ci.history)<>1 THEN
   RAISE EXCEPTION 'FAIL: disconnected transaction left history';
 END IF;
 UPDATE citadel_roster_recovery_ci.checkpoint
 SET store_version=14,revision=10,head_sha256=repeat('e',64)
 WHERE registry_key='ci-only' AND store_version=12
   AND revision=8 AND head_sha256=repeat('a',64);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'FAIL: stale replay advanced checkpoint'; END IF;
 IF (SELECT count(*) FROM citadel_roster_recovery_ci.history)<>1 THEN
   RAISE EXCEPTION 'FAIL: stale replay appended history';
 END IF;
 RAISE NOTICE 'PASS: disconnected transaction rolled back and stale replay denied';
END $assert$;
SQL
echo 'PASS: disposable PostgreSQL duplicate audit, disconnect rollback and stale replay'
