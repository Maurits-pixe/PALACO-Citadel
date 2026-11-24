#!/usr/bin/env bash
# EPHEMERAL CI ONLY — simulated PostgreSQL client disconnection before COMMIT.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" ||
      "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "postgres" ]]; then
 echo 'DENY: disposable localhost PostgreSQL CI required' >&2
 exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
contender_pid=''
cleanup() {
 for pid in "$holder_pid" "$contender_pid"; do
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
 done
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_roster_disconnect_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_roster_disconnect_ci;
CREATE TABLE citadel_roster_disconnect_ci.checkpoint (
 registry_key text PRIMARY KEY,
 store_version integer NOT NULL CHECK(store_version>0),
 revision integer NOT NULL CHECK(revision>0),
 head_sha256 char(64) NOT NULL CHECK(head_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_roster_disconnect_ci.receipt (
 registry_key text NOT NULL,
 recovery_id text NOT NULL,
 request_hash char(64) NOT NULL,
 expected_version integer NOT NULL,
 target_version integer NOT NULL,
 target_revision integer NOT NULL,
 target_head char(64) NOT NULL,
 PRIMARY KEY(registry_key,recovery_id),
 UNIQUE(registry_key,target_version)
);
CREATE TABLE citadel_roster_disconnect_ci.audit (
 registry_key text NOT NULL,
 recovery_id text NOT NULL,
 target_version integer NOT NULL,
 head_sha256 char(64) NOT NULL,
 PRIMARY KEY(registry_key,recovery_id),
 UNIQUE(registry_key,target_version)
);
INSERT INTO citadel_roster_disconnect_ci.checkpoint
 VALUES('ci-only',12,8,repeat('a',64));
CREATE FUNCTION citadel_roster_disconnect_ci.attempt(
 p_id text,p_hash char(64),p_expected integer,p_target integer,
 p_revision integer,p_head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE prior citadel_roster_disconnect_ci.receipt%ROWTYPE; changed integer;
BEGIN
 IF p_id !~ '^[a-z0-9-]{1,80}$' OR p_hash !~ '^[0-9a-f]{64}$'
 OR p_head !~ '^[0-9a-f]{64}$' OR p_expected<1
 OR p_target<>p_expected+1 OR p_revision<1
 THEN RETURN 'DENY_INVALID'; END IF;
 PERFORM 1 FROM citadel_roster_disconnect_ci.checkpoint
 WHERE registry_key='ci-only' FOR UPDATE;
 SELECT * INTO prior FROM citadel_roster_disconnect_ci.receipt
 WHERE registry_key='ci-only' AND recovery_id=p_id;
 IF FOUND THEN
  IF prior.request_hash=p_hash AND prior.expected_version=p_expected
   AND prior.target_version=p_target AND prior.target_revision=p_revision
   AND prior.target_head=p_head THEN RETURN 'ALREADY_COMMITTED'; END IF;
  RETURN 'DENY_KEY_REUSE';
 END IF;
 UPDATE citadel_roster_disconnect_ci.checkpoint
 SET store_version=p_target,revision=p_revision,head_sha256=p_head
 WHERE registry_key='ci-only' AND store_version=p_expected AND revision<p_revision;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_STALE'; END IF;
 INSERT INTO citadel_roster_disconnect_ci.receipt
 VALUES('ci-only',p_id,p_hash,p_expected,p_target,p_revision,p_head);
 INSERT INTO citadel_roster_disconnect_ci.audit
 VALUES('ci-only',p_id,p_target,p_head);
 RETURN 'COMMITTED';
END $fn$;
SQL

# Session A records speculative changes, signals readiness, then disconnects
# without sending COMMIT. PostgreSQL must release its lock and roll back.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/holder.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout='12s';
DO \$test\$
BEGIN
 IF citadel_roster_disconnect_ci.attempt(
  'restore-001',repeat('b',64),12,13,9,repeat('c',64)
 )<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: speculative update'; END IF;
END \$test\$;
\! touch "$tmp/held"
SELECT pg_sleep(3);
-- No COMMIT: psql EOF disconnects with an open transaction.
SQL
holder_pid=$!
for attempt in $(seq 1 100); do
 [[ -f "$tmp/held" ]] && break
 if ! kill -0 "$holder_pid" 2>/dev/null; then cat "$tmp/holder.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -f "$tmp/held" ]] || { echo 'FAIL: speculative holder not ready' >&2; exit 1; }

# Session B starts while A still holds the row lock; only B may commit.
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/contender.log" 2>&1 <<'SQL' &
SET lock_timeout='12s';
SELECT citadel_roster_disconnect_ci.attempt(
 'restore-001',repeat('b',64),12,13,9,repeat('c',64));
SQL
contender_pid=$!
wait "$holder_pid"; holder_pid=''
wait "$contender_pid"; contender_pid=''
grep -qx 'COMMITTED' "$tmp/contender.log" || {
 echo 'FAIL: retry was not the sole committed writer' >&2
 cat "$tmp/holder.log" "$tmp/contender.log" >&2
 exit 1
}

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE status text;
BEGIN
 status:=citadel_roster_disconnect_ci.attempt(
  'restore-001',repeat('b',64),12,13,9,repeat('c',64));
 IF status<>'ALREADY_COMMITTED' THEN
  RAISE EXCEPTION 'FAIL: retry did not recognize committed result: %',status;
 END IF;
 status:=citadel_roster_disconnect_ci.attempt(
  'restore-001',repeat('d',64),12,13,9,repeat('c',64));
 IF status<>'DENY_KEY_REUSE' THEN
  RAISE EXCEPTION 'FAIL: changed request reused recovery ID: %',status;
 END IF;
 IF (SELECT count(*) FROM citadel_roster_disconnect_ci.receipt)<>1
 OR (SELECT count(*) FROM citadel_roster_disconnect_ci.audit)<>1
 OR NOT EXISTS (SELECT 1 FROM citadel_roster_disconnect_ci.checkpoint
 WHERE registry_key='ci-only' AND store_version=13
 AND revision=9 AND head_sha256=repeat('c',64)) THEN
  RAISE EXCEPTION 'FAIL: disconnect recovery left incorrect state or duplicate evidence';
 END IF;
 RAISE NOTICE 'PASS: aborted connection rolled back; competing retry committed once';
END $test$;
SQL
echo 'PASS: disposable two-session disconnect-retry PostgreSQL recovery'
