#!/usr/bin/env bash
# Dedicated disposable PostgreSQL CI job. Never run against shared databases.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" || "$CITADEL_POSTGRES_CRASH_JOB_ONLY" != "1" ||
 "$PGHOST" != "127.0.0.1" || "$PGPORT" != "5432" || "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: dedicated disposable crash job required' >&2; exit 64
fi
ids="$(docker ps --filter ancestor=postgres:16 --format '{{.ID}}')"
if [[ -z "$ids" || "$(echo "$ids" | wc -l)" -ne 1 ||
 "$(docker inspect --format '{{.Config.Image}}' "$ids")" != 'postgres:16' ]]; then
 echo 'DENY: exactly one disposable postgres:16 container required' >&2; exit 64
fi
tmp="$(mktemp -d)"
cleanup() {
 docker start "$ids" >/dev/null 2>&1 || true
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_postmaster_crash_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_postmaster_crash_ci;
CREATE TABLE citadel_postmaster_crash_ci.checkpoint (
 registry_key text PRIMARY KEY, version integer NOT NULL,
 revision integer NOT NULL, head char(64) NOT NULL);
CREATE TABLE citadel_postmaster_crash_ci.receipt (
 recovery_id text PRIMARY KEY, digest char(64) NOT NULL,
 from_version integer NOT NULL, to_version integer NOT NULL,
 revision integer NOT NULL, head char(64) NOT NULL,
 UNIQUE(to_version));
CREATE TABLE citadel_postmaster_crash_ci.audit (
 recovery_id text PRIMARY KEY, version integer NOT NULL UNIQUE);
INSERT INTO citadel_postmaster_crash_ci.checkpoint VALUES ('ci-only',12,8,repeat('a',64));
BEGIN;
UPDATE citadel_postmaster_crash_ci.checkpoint SET
 version=13,revision=9,head=repeat('b',64) WHERE version=12;
INSERT INTO citadel_postmaster_crash_ci.receipt VALUES
 ('committed-001',repeat('c',64),12,13,9,repeat('b',64));
INSERT INTO citadel_postmaster_crash_ci.audit VALUES ('committed-001',13);
COMMIT;
SQL
# Another connection stages a full transaction but cannot commit.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/pending.log" 2>&1 <<SQL &
BEGIN;
UPDATE citadel_postmaster_crash_ci.checkpoint SET version=14,
 revision=10,head=repeat('d',64) WHERE version=13;
INSERT INTO citadel_postmaster_crash_ci.receipt VALUES
 ('pending-002',repeat('e',64),13,14,10,repeat('d',64));
INSERT INTO citadel_postmaster_crash_ci.audit VALUES ('pending-002',14);
\! touch "$tmp/staged"
SELECT pg_sleep(60);
SQL
pending_pid=$!
for i in $(seq 1 100); do
 [[ -f "$tmp/staged" ]] && break
 if ! kill -0 "$pending_pid" 2>/dev/null; then cat "$tmp/pending.log" >&2; exit 1; fi
 sleep .05
done
[[ -f "$tmp/staged" ]] || { echo 'FAIL: pending transaction not staged' >&2; exit 1; }
# Crash only the uniquely identified service container in this dedicated job.
docker kill --signal=KILL "$ids" >/dev/null
if wait "$pending_pid"; then
 echo 'FAIL: pending connection completed despite server kill' >&2; exit 1
fi
docker start "$ids" >/dev/null
ready=0
for i in $(seq 1 120); do
 if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then ready=1; break; fi
 sleep .25
done
[[ "$ready" == "1" ]] || { echo 'FAIL: postmaster did not restart' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE changed integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.checkpoint
  WHERE version=13 AND revision=9 AND head=repeat('b',64))
 OR NOT EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.receipt
  WHERE recovery_id='committed-001' AND to_version=13 AND digest=repeat('c',64))
 OR NOT EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.audit
  WHERE recovery_id='committed-001' AND version=13)
 THEN RAISE EXCEPTION 'FAIL: committed state lost after crash'; END IF;
 IF EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.receipt WHERE recovery_id='pending-002')
 OR EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.audit WHERE recovery_id='pending-002')
 THEN RAISE EXCEPTION 'FAIL: pending evidence survived crash'; END IF;
 UPDATE citadel_postmaster_crash_ci.checkpoint SET version=14,
 revision=10,head=repeat('d',64)
 WHERE version=13 AND revision=9 AND head=repeat('b',64);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'FAIL: recovery CAS mismatch'; END IF;
 INSERT INTO citadel_postmaster_crash_ci.receipt VALUES
 ('pending-002',repeat('e',64),13,14,10,repeat('d',64));
 INSERT INTO citadel_postmaster_crash_ci.audit VALUES ('pending-002',14);
END $test$;
DO $test$
DECLARE changed integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.receipt
  WHERE recovery_id='pending-002' AND digest=repeat('e',64)
  AND from_version=13 AND to_version=14 AND revision=10 AND head=repeat('d',64))
 THEN RAISE EXCEPTION 'FAIL: committed retry evidence missing'; END IF;
 UPDATE citadel_postmaster_crash_ci.checkpoint SET version=15 WHERE version=13;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 OR (SELECT count(*) FROM citadel_postmaster_crash_ci.receipt)<>2
 OR (SELECT count(*) FROM citadel_postmaster_crash_ci.audit)<>2
 OR NOT EXISTS (SELECT 1 FROM citadel_postmaster_crash_ci.checkpoint
  WHERE version=14 AND revision=10 AND head=repeat('d',64))
 THEN RAISE EXCEPTION 'FAIL: replay or duplicate after crash'; END IF;
 RAISE NOTICE 'PASS: committed data survives server crash, pending data rolls back, retry commits once';
END $test$;
SQL
echo 'PASS: dedicated disposable PostgreSQL crash recovery; production HOLD unchanged'
