#!/usr/bin/env bash
# PALACO CITADEL: ONLY disposable local PostgreSQL CI. No production writer.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" || "$PGHOST" != "127.0.0.1" || "$PGPORT" != "5432" || "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: disposable CI PostgreSQL required' >&2; exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
cleanup() {
 if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_backend_kill_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_backend_kill_ci;
CREATE TABLE citadel_backend_kill_ci.checkpoint (
 registry_key text PRIMARY KEY, version integer NOT NULL, revision integer NOT NULL,
 head char(64) NOT NULL
);
CREATE TABLE citadel_backend_kill_ci.receipt (
 registry_key text NOT NULL, recovery_id text NOT NULL, digest char(64) NOT NULL,
 from_version integer NOT NULL, to_version integer NOT NULL, revision integer NOT NULL,
 head char(64) NOT NULL,
 PRIMARY KEY(registry_key,recovery_id), UNIQUE(registry_key,to_version)
);
CREATE TABLE citadel_backend_kill_ci.audit (
 registry_key text NOT NULL, recovery_id text NOT NULL, version integer NOT NULL,
 PRIMARY KEY(registry_key,recovery_id), UNIQUE(registry_key,version)
);
INSERT INTO citadel_backend_kill_ci.checkpoint VALUES('ci-only',12,8,repeat('a',64));
CREATE FUNCTION citadel_backend_kill_ci.attempt(
 p_id text,p_digest char(64),p_old integer,p_new integer,p_rev integer,p_head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE prior citadel_backend_kill_ci.receipt%ROWTYPE; n integer;
BEGIN
 IF p_id !~ '^[a-z0-9-]{1,80}$' OR p_digest !~ '^[0-9a-f]{64}$'
 OR p_head !~ '^[0-9a-f]{64}$' OR p_old<1 OR p_new<>p_old+1 OR p_rev<1
 THEN RETURN 'DENY_INVALID'; END IF;
 PERFORM 1 FROM citadel_backend_kill_ci.checkpoint WHERE registry_key='ci-only' FOR UPDATE;
 SELECT * INTO prior FROM citadel_backend_kill_ci.receipt
 WHERE registry_key='ci-only' AND recovery_id=p_id;
 IF FOUND THEN
  IF prior.digest=p_digest AND prior.from_version=p_old AND prior.to_version=p_new
   AND prior.revision=p_rev AND prior.head=p_head THEN RETURN 'ALREADY_COMMITTED'; END IF;
  RETURN 'DENY_KEY_REUSE';
 END IF;
 UPDATE citadel_backend_kill_ci.checkpoint SET version=p_new,revision=p_rev,head=p_head
 WHERE registry_key='ci-only' AND version=p_old AND revision<p_rev;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE'; END IF;
 INSERT INTO citadel_backend_kill_ci.receipt VALUES ('ci-only',p_id,p_digest,p_old,p_new,p_rev,p_head);
 INSERT INTO citadel_backend_kill_ci.audit VALUES ('ci-only',p_id,p_new);
 RETURN 'COMMITTED';
END $fn$;
SQL
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/holder.log" 2>&1 <<SQL &
SET application_name='citadel_backend_kill_ci_holder';
BEGIN;
DO \$test\$
BEGIN
 IF citadel_backend_kill_ci.attempt(
  'recovery-001',repeat('b',64),12,13,9,repeat('c',64)) <> 'COMMITTED'
 THEN RAISE EXCEPTION 'FAIL: staging checkpoint'; END IF;
END \$test\$;
\! touch "$tmp/staged"
SELECT pg_sleep(15);
COMMIT;
SQL
holder_pid=$!
for attempt in $(seq 1 100); do
 [[ -f "$tmp/staged" ]] && break
 if ! kill -0 "$holder_pid" 2>/dev/null; then cat "$tmp/holder.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -f "$tmp/staged" ]] || { echo 'FAIL: staged transaction not ready' >&2; exit 1; }
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/terminated" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE application_name='citadel_backend_kill_ci_holder'
 AND datname=current_database() AND pid<>pg_backend_pid()
 AND state='active' AND query LIKE '%pg_sleep%';
SQL
grep -qx 't' "$tmp/terminated" || { echo 'FAIL: target backend was not terminated' >&2; exit 1; }
if wait "$holder_pid"; then
 holder_pid=''
 echo 'FAIL: killed connection committed unexpectedly' >&2; exit 1
fi
holder_pid=''
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE result text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM citadel_backend_kill_ci.checkpoint
  WHERE version=12 AND revision=8 AND head=repeat('a',64))
 OR (SELECT count(*) FROM citadel_backend_kill_ci.receipt)<>0
 OR (SELECT count(*) FROM citadel_backend_kill_ci.audit)<>0
 THEN RAISE EXCEPTION 'FAIL: killed backend left partial transaction'; END IF;
 result:=citadel_backend_kill_ci.attempt('recovery-001',repeat('b',64),12,13,9,repeat('c',64));
 IF result<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: recovery retry: %',result; END IF;
 result:=citadel_backend_kill_ci.attempt('recovery-001',repeat('b',64),12,13,9,repeat('c',64));
 IF result<>'ALREADY_COMMITTED' THEN RAISE EXCEPTION 'FAIL: repeated retry: %',result; END IF;
 result:=citadel_backend_kill_ci.attempt('recovery-001',repeat('d',64),12,13,9,repeat('c',64));
 IF result<>'DENY_KEY_REUSE' THEN RAISE EXCEPTION 'FAIL: changed retry: %',result; END IF;
 IF NOT EXISTS (SELECT 1 FROM citadel_backend_kill_ci.checkpoint
  WHERE version=13 AND revision=9 AND head=repeat('c',64))
 OR (SELECT count(*) FROM citadel_backend_kill_ci.receipt)<>1
 OR (SELECT count(*) FROM citadel_backend_kill_ci.audit)<>1
 THEN RAISE EXCEPTION 'FAIL: post-recovery state not exactly-once'; END IF;
 RAISE NOTICE 'PASS: terminated backend rolled back and retried exactly once';
END $test$;
SQL
echo 'PASS: isolated backend termination recovery, production HOLD unchanged'
