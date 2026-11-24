#!/usr/bin/env bash
# EPHEMERAL CI ONLY — two-connection idempotent recovery race fixture.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" || "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" || "${PGDATABASE:-}" != "postgres" ]]; then
 echo 'DENY: disposable PostgreSQL service required' >&2; exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
contender_pid=''
cleanup(){
 for pid in "$holder_pid" "$contender_pid"; do
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
 done
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_roster_retry_race_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_roster_retry_race_ci;
CREATE TABLE citadel_roster_retry_race_ci.state (
 registry_key text PRIMARY KEY,
 store_version integer NOT NULL,
 head_sha256 char(64) NOT NULL
);
CREATE TABLE citadel_roster_retry_race_ci.receipt (
 registry_key text NOT NULL, recovery_id text NOT NULL,
 digest char(64) NOT NULL, expected_version integer NOT NULL,
 target_version integer NOT NULL, target_head char(64) NOT NULL,
 PRIMARY KEY(registry_key,recovery_id), UNIQUE(registry_key,target_version)
);
CREATE TABLE citadel_roster_retry_race_ci.audit (
 registry_key text NOT NULL, recovery_id text NOT NULL,
 store_version integer NOT NULL,
 PRIMARY KEY(registry_key,recovery_id), UNIQUE(registry_key,store_version)
);
INSERT INTO citadel_roster_retry_race_ci.state VALUES('ci-only',12,repeat('a',64));
CREATE FUNCTION citadel_roster_retry_race_ci.attempt(
 id text,digest char(64),expected integer,target integer,head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE prior citadel_roster_retry_race_ci.receipt%ROWTYPE; changed integer;
BEGIN
 IF id !~ '^[a-z0-9-]{1,80}$' OR digest !~ '^[0-9a-f]{64}$'
 OR head !~ '^[0-9a-f]{64}$' OR expected<1 OR target<>expected+1
 THEN RETURN 'DENY_INVALID'; END IF;
 PERFORM 1 FROM citadel_roster_retry_race_ci.state WHERE registry_key='ci-only' FOR UPDATE;
 SELECT * INTO prior FROM citadel_roster_retry_race_ci.receipt
 WHERE registry_key='ci-only' AND recovery_id=id;
 IF FOUND THEN
  IF prior.digest=digest AND prior.expected_version=expected
   AND prior.target_version=target AND prior.target_head=head THEN
   RETURN 'ALREADY_COMMITTED'; END IF;
  RETURN 'DENY_KEY_REUSE';
 END IF;
 UPDATE citadel_roster_retry_race_ci.state
 SET store_version=target,head_sha256=head
 WHERE registry_key='ci-only' AND store_version=expected;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_STALE'; END IF;
 INSERT INTO citadel_roster_retry_race_ci.receipt VALUES
 ('ci-only',id,digest,expected,target,head);
 INSERT INTO citadel_roster_retry_race_ci.audit VALUES('ci-only',id,target);
 RETURN 'COMMITTED';
END $fn$;
SQL

# First connection holds the row lock and commits the operation.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/holder.log" 2>&1 <<SQL &
BEGIN;
SELECT store_version FROM citadel_roster_retry_race_ci.state
 WHERE registry_key='ci-only' FOR UPDATE;
\! touch "$tmp/locked"
SELECT pg_sleep(3);
DO \$test\$
BEGIN
 IF citadel_roster_retry_race_ci.attempt('same-001',repeat('b',64),12,13,repeat('c',64))
  <> 'COMMITTED' THEN RAISE EXCEPTION 'first writer failed'; END IF;
END \$test\$;
COMMIT;
SQL
holder_pid=$!
for i in $(seq 1 100); do
 [[ -f "$tmp/locked" ]] && break
 if ! kill -0 "$holder_pid" 2>/dev/null; then cat "$tmp/holder.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -f "$tmp/locked" ]] || { echo 'FAIL: no holder lock' >&2; exit 1; }

# Separate connection begins its identical retry while holder still owns lock.
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/contender.log" 2>&1 <<'SQL' &
SET lock_timeout='12s';
SELECT citadel_roster_retry_race_ci.attempt('same-001',repeat('b',64),12,13,repeat('c',64));
SQL
contender_pid=$!
wait "$holder_pid"; holder_pid=''
wait "$contender_pid"; contender_pid=''
grep -qx 'ALREADY_COMMITTED' "$tmp/contender.log" || {
 cat "$tmp/holder.log" "$tmp/contender.log" >&2; exit 1;
}

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE result text;
BEGIN
 result:=citadel_roster_retry_race_ci.attempt('same-001',repeat('d',64),12,13,repeat('c',64));
 IF result<>'DENY_KEY_REUSE' THEN RAISE EXCEPTION 'changed concurrent identity accepted: %',result; END IF;
 result:=citadel_roster_retry_race_ci.attempt('other-002',repeat('e',64),12,13,repeat('f',64));
 IF result<>'DENY_STALE' THEN RAISE EXCEPTION 'stale concurrent operation accepted: %',result; END IF;
 IF (SELECT count(*) FROM citadel_roster_retry_race_ci.receipt)<>1
 OR (SELECT count(*) FROM citadel_roster_retry_race_ci.audit)<>1
 OR NOT EXISTS (SELECT 1 FROM citadel_roster_retry_race_ci.state
 WHERE registry_key='ci-only' AND store_version=13 AND head_sha256=repeat('c',64))
 THEN RAISE EXCEPTION 'duplicate receipt, audit or wrong final checkpoint'; END IF;
 RAISE NOTICE 'PASS: concurrent identical retry has one effect; mutated key and stale retry denied';
END $test$;
SQL
echo 'PASS: disposable PostgreSQL two-session idempotency race'
