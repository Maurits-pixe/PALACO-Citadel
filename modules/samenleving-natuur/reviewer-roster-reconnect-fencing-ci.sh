#!/usr/bin/env bash
# DISPOSABLE CI ONLY: reconnect using stale leadership after epoch promotion.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" || "$PGHOST" != "127.0.0.1" ||
 "$PGPORT" != "5432" || "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: disposable PostgreSQL CI environment required' >&2; exit 64
fi
cleanup(){
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_reconnect_fence_ci CASCADE' >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_reconnect_fence_ci;
CREATE TABLE citadel_reconnect_fence_ci.lease(
 registry_key text PRIMARY KEY, epoch bigint NOT NULL CHECK(epoch>0),
 leader text NOT NULL, token_hash char(64) NOT NULL
);
CREATE TABLE citadel_reconnect_fence_ci.state(
 registry_key text PRIMARY KEY, version bigint NOT NULL CHECK(version>0),
 head char(64) NOT NULL
);
CREATE TABLE citadel_reconnect_fence_ci.audit(
 registry_key text NOT NULL, version bigint NOT NULL,
 epoch bigint NOT NULL, leader text NOT NULL,
 PRIMARY KEY(registry_key,version)
);
INSERT INTO citadel_reconnect_fence_ci.lease VALUES
 ('ci-only',7,'leader-original',repeat('a',64));
INSERT INTO citadel_reconnect_fence_ci.state VALUES
 ('ci-only',12,repeat('b',64));

CREATE FUNCTION citadel_reconnect_fence_ci.advance(
 p_leader text,p_epoch bigint,p_token char(64),p_old bigint,p_new bigint,p_head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE lease_row citadel_reconnect_fence_ci.lease%ROWTYPE; n integer;
BEGIN
 IF p_leader !~ '^[a-z0-9-]{3,80}$' OR p_epoch<1
 OR p_token !~ '^[0-9a-f]{64}$' OR p_head !~ '^[0-9a-f]{64}$'
 OR p_old<1 OR p_new<>p_old+1 THEN RETURN 'DENY_INVALID'; END IF;
 SELECT * INTO lease_row FROM citadel_reconnect_fence_ci.lease
 WHERE registry_key='ci-only' FOR UPDATE;
 IF lease_row.epoch<>p_epoch OR lease_row.leader<>p_leader
 OR lease_row.token_hash<>p_token THEN RETURN 'DENY_STALE_LEADER'; END IF;
 UPDATE citadel_reconnect_fence_ci.state SET
 version=p_new,head=p_head WHERE registry_key='ci-only' AND version=p_old;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE_VERSION'; END IF;
 INSERT INTO citadel_reconnect_fence_ci.audit VALUES('ci-only',p_new,p_epoch,p_leader);
 RETURN 'COMMITTED';
END $fn$;
CREATE FUNCTION citadel_reconnect_fence_ci.promote(
 p_epoch bigint,p_new_epoch bigint,p_previous text,p_new_leader text,p_new_token char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
 IF p_epoch<1 OR p_new_epoch<>p_epoch+1 OR
 p_previous !~ '^[a-z0-9-]{3,80}$' OR
 p_new_leader !~ '^[a-z0-9-]{3,80}$' OR
 p_new_token !~ '^[0-9a-f]{64}$'
 THEN RETURN 'DENY_INVALID'; END IF;
 UPDATE citadel_reconnect_fence_ci.lease SET
 epoch=p_new_epoch,leader=p_new_leader,token_hash=p_new_token
 WHERE registry_key='ci-only' AND epoch=p_epoch AND leader=p_previous;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE_PROMOTION'; END IF;
 RETURN 'PROMOTED';
END $fn$;
SQL

# Session A captures a lease snapshot then closes. This models lost access,
# not an actual network partition; no lease lock persists across disconnection.
snapshot="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT leader||'|'||epoch||'|'||token_hash FROM citadel_reconnect_fence_ci.lease WHERE registry_key='ci-only'")"
[[ "$snapshot" == "leader-original|7|$(printf 'a%.0s' {1..64})" ]] ||
 { echo 'FAIL: old leader snapshot missing' >&2; exit 1; }

# Independent session promotes while the original leader is disconnected.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE result text;
BEGIN
 result:=citadel_reconnect_fence_ci.promote(
 7,8,'leader-original','leader-successor',repeat('c',64));
 IF result<>'PROMOTED' THEN RAISE EXCEPTION 'FAIL: independent promotion: %',result; END IF;
END $test$;
SQL

# Returning old leader knows the correct current store version. Still DENY.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE result text;
BEGIN
 result:=citadel_reconnect_fence_ci.advance(
  'leader-original',7,repeat('a',64),12,13,repeat('d',64));
 IF result<>'DENY_STALE_LEADER' THEN
 RAISE EXCEPTION 'FAIL: stale leader returned after reconnect: %',result; END IF;
 result:=citadel_reconnect_fence_ci.advance(
  'leader-original',8,repeat('a',64),12,13,repeat('d',64));
 IF result<>'DENY_STALE_LEADER' THEN
 RAISE EXCEPTION 'FAIL: epoch edit bypassed token+leader pin: %',result; END IF;
 result:=citadel_reconnect_fence_ci.advance(
  'leader-successor',8,repeat('a',64),12,13,repeat('d',64));
 IF result<>'DENY_STALE_LEADER' THEN
 RAISE EXCEPTION 'FAIL: stolen identity with old token accepted: %',result; END IF;
 IF (SELECT count(*) FROM citadel_reconnect_fence_ci.audit)<>0 OR
 NOT EXISTS (SELECT 1 FROM citadel_reconnect_fence_ci.state
 WHERE version=12 AND head=repeat('b',64)) THEN
 RAISE EXCEPTION 'FAIL: denied stale writers left side effects'; END IF;

 result:=citadel_reconnect_fence_ci.advance(
  'leader-successor',8,repeat('c',64),12,13,repeat('d',64));
 IF result<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: successor commit: %',result; END IF;
 result:=citadel_reconnect_fence_ci.advance(
  'leader-original',7,repeat('a',64),13,14,repeat('e',64));
 IF result<>'DENY_STALE_LEADER' THEN
 RAISE EXCEPTION 'FAIL: former leader wrote with fresh checkpoint version: %',result; END IF;
 result:=citadel_reconnect_fence_ci.promote(
 7,8,'leader-original','leader-original',repeat('a',64));
 IF result<>'DENY_STALE_PROMOTION' THEN
 RAISE EXCEPTION 'FAIL: replayed promotion accepted: %',result; END IF;

 IF (SELECT count(*) FROM citadel_reconnect_fence_ci.audit)<>1 OR
 NOT EXISTS (SELECT 1 FROM citadel_reconnect_fence_ci.audit
 WHERE version=13 AND epoch=8 AND leader='leader-successor') OR
 NOT EXISTS (SELECT 1 FROM citadel_reconnect_fence_ci.state
 WHERE version=13 AND head=repeat('d',64)) THEN
 RAISE EXCEPTION 'FAIL: post-reconnect state or audit diverged'; END IF;
 RAISE NOTICE 'PASS: reconnect cannot revive old leader, even with current checkpoint version';
END $test$;
SQL
echo 'PASS: disposable PostgreSQL reconnect fencing regression; HOLD unchanged'
