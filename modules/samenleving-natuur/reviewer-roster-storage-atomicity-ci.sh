#!/usr/bin/env bash
# EPHEMERAL CI ONLY. No PALACO MONO, staging, or shared PostgreSQL.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" ||
      "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "postgres" ]]; then
  echo 'DENY: disposable CI PostgreSQL guards not satisfied' >&2
  exit 64
fi
cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_roster_atomicity_ci CASCADE' >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_roster_atomicity_ci;
CREATE TABLE citadel_roster_atomicity_ci.checkpoint (
 registry_key text PRIMARY KEY,
 store_version bigint NOT NULL CHECK (store_version > 0),
 sequence bigint NOT NULL CHECK (sequence > 0),
 revision bigint NOT NULL CHECK (revision > 0),
 head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_roster_atomicity_ci.history (
 registry_key text NOT NULL,
 store_version bigint NOT NULL,
 head_sha256 char(64) NOT NULL,
 CONSTRAINT reject_test_corrupt_history CHECK (head_sha256 <> repeat('f',64)),
 PRIMARY KEY (registry_key,store_version)
);
INSERT INTO citadel_roster_atomicity_ci.checkpoint VALUES
 ('test-only',12,4,8,repeat('a',64));

-- Exception blocks in PL/pgSQL are subtransactions. A failed audit insert
-- must revert the preceding checkpoint UPDATE in the very same transaction.
BEGIN;
DO $test$
DECLARE
 caught boolean := false;
 n integer;
BEGIN
 BEGIN
  UPDATE citadel_roster_atomicity_ci.checkpoint
   SET store_version=13,sequence=5,revision=9,head_sha256=repeat('f',64)
   WHERE registry_key='test-only' AND store_version=12 AND sequence=4
    AND revision=8 AND head_sha256=repeat('a',64);
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'unexpected pre-fault CAS update result'; END IF;
  INSERT INTO citadel_roster_atomicity_ci.history
   VALUES ('test-only',13,repeat('f',64));
 EXCEPTION WHEN check_violation THEN
  caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: history constraint did not fail'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM citadel_roster_atomicity_ci.checkpoint
   WHERE registry_key='test-only' AND store_version=12 AND sequence=4
    AND revision=8 AND head_sha256=repeat('a',64)
 ) THEN RAISE EXCEPTION 'FAIL: checkpoint update survived failed audit append'; END IF;
 IF (SELECT count(*) FROM citadel_roster_atomicity_ci.history)<>0 THEN
   RAISE EXCEPTION 'FAIL: failed append left audit rows';
 END IF;
 RAISE NOTICE 'PASS: failed audit append rolls back checkpoint CAS in same transaction';
END $test$;
COMMIT;

-- Then validate that a well-formed checkpoint and history can commit together.
BEGIN;
DO $test$
DECLARE n integer;
BEGIN
 UPDATE citadel_roster_atomicity_ci.checkpoint
 SET store_version=13,sequence=5,revision=9,head_sha256=repeat('b',64)
 WHERE registry_key='test-only' AND store_version=12 AND sequence=4
  AND revision=8 AND head_sha256=repeat('a',64);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'FAIL: valid checkpoint CAS did not update once'; END IF;
 INSERT INTO citadel_roster_atomicity_ci.history VALUES ('test-only',13,repeat('b',64));
END $test$;
COMMIT;

DO $assert$
BEGIN
 IF (SELECT count(*) FROM citadel_roster_atomicity_ci.checkpoint
   WHERE store_version=13 AND sequence=5 AND revision=9 AND head_sha256=repeat('b',64))<>1
 OR (SELECT count(*) FROM citadel_roster_atomicity_ci.history
   WHERE store_version=13 AND head_sha256=repeat('b',64))<>1
 THEN RAISE EXCEPTION 'FAIL: successful atomic commit did not persist both records'; END IF;
 RAISE NOTICE 'PASS: successful checkpoint and audit append commit together';
END $assert$;
SQL
echo 'PASS: disposable PostgreSQL audit-append atomicity regression; HOLD unchanged'
