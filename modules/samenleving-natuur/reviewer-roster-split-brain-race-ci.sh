#!/usr/bin/env bash
# Disposable PostgreSQL CI only; two rival promotions, one epoch.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" || "$PGHOST" != "127.0.0.1" || "$PGPORT" != "5432" || "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: requires disposable CI PostgreSQL' >&2; exit 64
fi
tmp="$(mktemp -d)"
a=''
z=''
cleanup(){
 for pid in "$a" "$z"; do
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
 done
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_split_brain_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_split_brain_ci;
CREATE TABLE citadel_split_brain_ci.lease(
 key text PRIMARY KEY, epoch bigint NOT NULL, leader text NOT NULL,
 token char(64) NOT NULL
);
CREATE TABLE citadel_split_brain_ci.state(
 key text PRIMARY KEY, version bigint NOT NULL, head char(64) NOT NULL
);
CREATE TABLE citadel_split_brain_ci.audit(
 key text NOT NULL, version bigint NOT NULL, epoch bigint NOT NULL,
 leader text NOT NULL, PRIMARY KEY(key,version)
);
INSERT INTO citadel_split_brain_ci.lease VALUES
 ('ci-only',7,'leader-old',repeat('a',64));
INSERT INTO citadel_split_brain_ci.state VALUES
 ('ci-only',12,repeat('b',64));
CREATE FUNCTION citadel_split_brain_ci.promote(
 old_epoch bigint,new_epoch bigint,new_leader text,new_token char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
 IF old_epoch<1 OR new_epoch<>old_epoch+1
 OR new_leader !~ '^[a-z0-9-]{3,80}$'
 OR new_token !~ '^[0-9a-f]{64}$' THEN RETURN 'DENY_INVALID'; END IF;
 UPDATE citadel_split_brain_ci.lease SET
 epoch=new_epoch,leader=new_leader,token=new_token
 WHERE key='ci-only' AND epoch=old_epoch AND leader='leader-old';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE_PROMOTION'; END IF;
 RETURN 'PROMOTED';
END $fn$;
CREATE FUNCTION citadel_split_brain_ci.advance(
 claimant text,claimed_epoch bigint,claimed_token char(64),
 expected_version bigint,next_version bigint,next_head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE lease_row citadel_split_brain_ci.lease%ROWTYPE; n integer;
BEGIN
 IF claimant !~ '^[a-z0-9-]{3,80}$' OR claimed_epoch<1
 OR claimed_token !~ '^[0-9a-f]{64}$' OR expected_version<1
 OR next_version<>expected_version+1
 OR next_head !~ '^[0-9a-f]{64}$' THEN RETURN 'DENY_INVALID'; END IF;
 SELECT * INTO lease_row FROM citadel_split_brain_ci.lease
 WHERE key='ci-only' FOR UPDATE;
 IF lease_row.leader<>claimant OR lease_row.epoch<>claimed_epoch
 OR lease_row.token<>claimed_token THEN RETURN 'DENY_FENCED_LEADER'; END IF;
 UPDATE citadel_split_brain_ci.state SET version=next_version,head=next_head
 WHERE key='ci-only' AND version=expected_version;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE_CHECKPOINT'; END IF;
 INSERT INTO citadel_split_brain_ci.audit VALUES
 ('ci-only',next_version,claimed_epoch,claimant);
 RETURN 'COMMITTED';
END $fn$;
SQL
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/a.log" 2>&1 <<SQL &
BEGIN;
SELECT citadel_split_brain_ci.promote(
 7,8,'leader-east',repeat('c',64));
\! touch "$tmp/ready"
SELECT pg_sleep(3);
COMMIT;
SQL
a=$!
for i in $(seq 1 100); do
 [[ -f "$tmp/ready" ]] && break
 if ! kill -0 "$a" 2>/dev/null; then cat "$tmp/a.log" >&2; exit 1; fi
 sleep .05
done
[[ -f "$tmp/ready" ]] || { echo 'FAIL: first promotion not staged' >&2; exit 1; }
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/b.log" 2>&1 <<'SQL' &
SET lock_timeout='12s';
SELECT citadel_split_brain_ci.promote(
 7,8,'leader-west',repeat('d',64));
SQL
z=$!
wait "$a"; a=''
wait "$z"; z=''
grep -qx 'PROMOTED' "$tmp/a.log" || { cat "$tmp/a.log" >&2; exit 1; }
grep -qx 'DENY_STALE_PROMOTION' "$tmp/b.log" || { cat "$tmp/b.log" >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE status text;
BEGIN
 status:=citadel_split_brain_ci.advance(
  'leader-west',8,repeat('d',64),12,13,repeat('e',64));
 IF status<>'DENY_FENCED_LEADER' THEN RAISE EXCEPTION 'FAIL: loser wrote: %',status; END IF;
 status:=citadel_split_brain_ci.advance(
  'leader-old',7,repeat('a',64),12,13,repeat('e',64));
 IF status<>'DENY_FENCED_LEADER' THEN RAISE EXCEPTION 'FAIL: old leader wrote: %',status; END IF;
 status:=citadel_split_brain_ci.advance(
  'leader-east',8,repeat('c',64),12,13,repeat('f',64));
 IF status<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: winner did not commit: %',status; END IF;
 status:=citadel_split_brain_ci.advance(
  'leader-east',8,repeat('c',64),12,13,repeat('f',64));
 IF status<>'DENY_STALE_CHECKPOINT' THEN RAISE EXCEPTION 'FAIL: duplicate write: %',status; END IF;
 IF NOT EXISTS (SELECT 1 FROM citadel_split_brain_ci.lease
  WHERE epoch=8 AND leader='leader-east' AND token=repeat('c',64))
 OR NOT EXISTS (SELECT 1 FROM citadel_split_brain_ci.state
  WHERE version=13 AND head=repeat('f',64))
 OR (SELECT count(*) FROM citadel_split_brain_ci.audit)<>1
 OR NOT EXISTS (SELECT 1 FROM citadel_split_brain_ci.audit
  WHERE version=13 AND epoch=8 AND leader='leader-east')
 THEN RAISE EXCEPTION 'FAIL: split-brain state diverged'; END IF;
 RAISE NOTICE 'PASS: exactly one winner and one checkpoint audit';
END $test$;
SQL
echo 'PASS: disposable PostgreSQL split-brain fencing regression'
