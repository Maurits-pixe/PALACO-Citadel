#!/usr/bin/env bash
# DRAFT/HOLD: fencing epoch regression in disposable PostgreSQL CI only.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" || "$PGHOST" != "127.0.0.1" ||
 "$PGPORT" != "5432" || "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: isolated local disposable PostgreSQL required' >&2; exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
cleanup() {
 if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_fence_epoch_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_fence_epoch_ci;
CREATE TABLE citadel_fence_epoch_ci.lease (
 registry_key text PRIMARY KEY,
 epoch bigint NOT NULL CHECK(epoch>0),
 leader_id text NOT NULL,
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_fence_epoch_ci.state (
 registry_key text PRIMARY KEY REFERENCES citadel_fence_epoch_ci.lease(registry_key),
 version bigint NOT NULL CHECK(version>0),
 head char(64) NOT NULL CHECK(head ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_fence_epoch_ci.audit (
 registry_key text NOT NULL,
 version bigint NOT NULL,
 epoch bigint NOT NULL,
 leader_id text NOT NULL,
 head char(64) NOT NULL,
 PRIMARY KEY(registry_key,version)
);
INSERT INTO citadel_fence_epoch_ci.lease VALUES
 ('ci-only',7,'leader-old',repeat('a',64));
INSERT INTO citadel_fence_epoch_ci.state VALUES
 ('ci-only',12,repeat('b',64));
-- Test-only function performs row-locked compare-and-swap within one DB transaction.
-- Caller-controlled tokens do NOT establish real leader authority.
CREATE FUNCTION citadel_fence_epoch_ci.advance(
 p_leader text,p_epoch bigint,p_token_hash char(64),
 p_expected bigint,p_next bigint,p_head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE current_lease citadel_fence_epoch_ci.lease%ROWTYPE; changed integer;
BEGIN
 IF p_leader !~ '^[a-z0-9-]{3,80}$' OR
  p_token_hash !~ '^[0-9a-f]{64}$' OR p_head !~ '^[0-9a-f]{64}$'
  OR p_epoch<1 OR p_expected<1 OR p_next<>p_expected+1
 THEN RETURN 'DENY_INVALID'; END IF;
 SELECT * INTO current_lease FROM citadel_fence_epoch_ci.lease
 WHERE registry_key='ci-only' FOR UPDATE;
 IF current_lease.epoch<>p_epoch OR current_lease.leader_id<>p_leader
  OR current_lease.token_hash<>p_token_hash
 THEN RETURN 'DENY_STALE_FENCE'; END IF;
 UPDATE citadel_fence_epoch_ci.state SET version=p_next,head=p_head
 WHERE registry_key='ci-only' AND version=p_expected;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_STALE_CHECKPOINT'; END IF;
 INSERT INTO citadel_fence_epoch_ci.audit
 VALUES ('ci-only',p_next,p_epoch,p_leader,p_head);
 RETURN 'COMMITTED';
END $fn$;
-- Promotion requires exact expected epoch, leader and token, and writes the
-- new epoch under the same row lock used by every checkpoint writer.
CREATE FUNCTION citadel_fence_epoch_ci.promote(
 p_old_epoch bigint,p_new_epoch bigint,
 p_old_leader text,p_new_leader text,p_new_token char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
 IF p_old_epoch<1 OR p_new_epoch<>p_old_epoch+1
 OR p_new_leader !~ '^[a-z0-9-]{3,80}$'
 OR p_new_token !~ '^[0-9a-f]{64}$'
 THEN RETURN 'DENY_INVALID'; END IF;
 UPDATE citadel_fence_epoch_ci.lease SET
 epoch=p_new_epoch,leader_id=p_new_leader,token_hash=p_new_token
 WHERE registry_key='ci-only' AND epoch=p_old_epoch AND leader_id=p_old_leader;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE_PROMOTION'; END IF;
 RETURN 'PROMOTED';
END $fn$;
SQL
# A writer still connected before promotion may write only while it owns
# the lease lock. Promotion will wait for that transaction's commit.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/old-writer.log" 2>&1 <<SQL &
BEGIN;
DO \$test\$
BEGIN
 IF citadel_fence_epoch_ci.advance(
 'leader-old',7,repeat('a',64),12,13,repeat('c',64))<>'COMMITTED'
 THEN RAISE EXCEPTION 'FAIL: initial writer'; END IF;
END \$test\$;
\! touch "$tmp/locked"
SELECT pg_sleep(3);
COMMIT;
SQL
holder_pid=$!
for i in $(seq 1 100); do
 [[ -e "$tmp/locked" ]] && break
 if ! kill -0 "$holder_pid" 2>/dev/null; then cat "$tmp/old-writer.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -e "$tmp/locked" ]] || { echo 'FAIL: writer lock not held' >&2; exit 1; }

# A real second connection attempts promotion while writer A holds the lock.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL lock_timeout='400ms';
DO $test$
DECLARE blocked boolean := false;
BEGIN
 BEGIN
  PERFORM citadel_fence_epoch_ci.promote(7,8,'leader-old','leader-new',repeat('d',64));
 EXCEPTION WHEN lock_not_available THEN
  blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL: promotion bypassed active writer lock'; END IF;
 RAISE NOTICE 'PASS: promotion cannot overtake in-flight fenced writer';
END $test$;
ROLLBACK;
SQL
wait "$holder_pid"
holder_pid=''
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE outcome text;
BEGIN
 outcome:=citadel_fence_epoch_ci.promote(7,8,'leader-old','leader-new',repeat('d',64));
 IF outcome<>'PROMOTED' THEN RAISE EXCEPTION 'FAIL: promotion after writer: %',outcome; END IF;
 outcome:=citadel_fence_epoch_ci.promote(7,8,'leader-old','leader-new',repeat('d',64));
 IF outcome<>'DENY_STALE_PROMOTION' THEN RAISE EXCEPTION 'FAIL: repeated promotion: %',outcome; END IF;
 outcome:=citadel_fence_epoch_ci.advance('leader-old',7,repeat('a',64),13,14,repeat('e',64));
 IF outcome<>'DENY_STALE_FENCE' THEN RAISE EXCEPTION 'FAIL: old leader still writes: %',outcome; END IF;
 outcome:=citadel_fence_epoch_ci.advance('leader-new',8,repeat('a',64),13,14,repeat('e',64));
 IF outcome<>'DENY_STALE_FENCE' THEN RAISE EXCEPTION 'FAIL: wrong token still writes: %',outcome; END IF;
 outcome:=citadel_fence_epoch_ci.advance('leader-new',8,repeat('d',64),12,14,repeat('e',64));
 IF outcome<>'DENY_INVALID' THEN RAISE EXCEPTION 'FAIL: version jump allowed: %',outcome; END IF;
 outcome:=citadel_fence_epoch_ci.advance('leader-new',8,repeat('d',64),13,14,repeat('e',64));
 IF outcome<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: new leader write: %',outcome; END IF;
 outcome:=citadel_fence_epoch_ci.advance('leader-new',8,repeat('d',64),13,14,repeat('e',64));
 IF outcome<>'DENY_STALE_CHECKPOINT' THEN RAISE EXCEPTION 'FAIL: stale new leader replay: %',outcome; END IF;
 IF NOT EXISTS (SELECT 1 FROM citadel_fence_epoch_ci.lease
   WHERE epoch=8 AND leader_id='leader-new' AND token_hash=repeat('d',64))
 OR NOT EXISTS (SELECT 1 FROM citadel_fence_epoch_ci.state
   WHERE version=14 AND head=repeat('e',64))
 OR (SELECT count(*) FROM citadel_fence_epoch_ci.audit)<>2
 OR NOT EXISTS (SELECT 1 FROM citadel_fence_epoch_ci.audit
   WHERE version=13 AND epoch=7 AND leader_id='leader-old')
 OR NOT EXISTS (SELECT 1 FROM citadel_fence_epoch_ci.audit
   WHERE version=14 AND epoch=8 AND leader_id='leader-new')
 THEN RAISE EXCEPTION 'FAIL: fenced audit or state inconsistent'; END IF;
 RAISE NOTICE 'PASS: old leader fenced after monotonic promotion and new leader CAS committed once';
END $test$;
SQL
echo 'PASS: disposable PostgreSQL fencing epoch concurrency; no production writer'
