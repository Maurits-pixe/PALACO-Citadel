#!/usr/bin/env bash
# Disposable PostgreSQL CI: atomic one-time nonce consumption, no production access.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" ||
 "$PGHOST" != "127.0.0.1" || "$PGPORT" != "5432" ||
 "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: disposable localhost PostgreSQL CI only' >&2; exit 64
fi
tmp="$(mktemp -d)"
holder=''
cleanup(){
 if [[ -n "$holder" ]]; then kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true; fi
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_anchor_nonce_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_anchor_nonce_ci;
CREATE TABLE citadel_anchor_nonce_ci.consumed (
 registry_key text NOT NULL,
 nonce_sha256 char(64) NOT NULL,
 reader_id text NOT NULL,
 observation_sha256 char(64) NOT NULL,
 anchor_sha256 char(64) NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>0),
 PRIMARY KEY(registry_key,nonce_sha256)
);
-- This is an atomic consumption fixture, NOT an authentication/verifier.
-- The caller must independently establish signature validity, time,
-- reader identity, nonce issuance and anchoring before this boundary.
CREATE FUNCTION citadel_anchor_nonce_ci.consume(
 p_registry text,p_nonce char(64),p_reader text,
 p_observation char(64),p_anchor char(64),p_epoch bigint)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
 IF p_registry !~ '^[a-z0-9-]{3,80}$' OR
    p_reader !~ '^[a-z0-9-]{3,80}$' OR
    p_nonce !~ '^[0-9a-f]{64}$' OR
    p_observation !~ '^[0-9a-f]{64}$' OR
    p_anchor !~ '^[0-9a-f]{64}$' OR
    p_epoch<1 THEN RETURN 'DENY_INVALID'; END IF;
 INSERT INTO citadel_anchor_nonce_ci.consumed
 VALUES(p_registry,p_nonce,p_reader,p_observation,p_anchor,p_epoch)
 ON CONFLICT(registry_key,nonce_sha256) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_NONCE_REPLAY'; END IF;
 RETURN 'CONSUMED';
END $fn$;
SQL

# Session A stages consumption but does not commit for 3 seconds.
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/a.log" 2>&1 <<SQL &
BEGIN;
SELECT citadel_anchor_nonce_ci.consume(
 'citadel-draft',repeat('a',64),'reader-east',repeat('b',64),repeat('c',64),8);
\! touch "$tmp/staged"
SELECT pg_sleep(3);
COMMIT;
SQL
holder=$!
for i in $(seq 1 100); do
 [[ -e "$tmp/staged" ]] && break
 if ! kill -0 "$holder" 2>/dev/null; then cat "$tmp/a.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -e "$tmp/staged" ]] || { echo 'FAIL: first consumption not staged' >&2; exit 1; }

# The same nonce, different reader/evidence, on a second connection.
# Unique constraint must serialize and refuse the second consumer.
loser="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_anchor_nonce_ci.consume('citadel-draft',repeat('a',64),'reader-west',repeat('d',64),repeat('e',64),9)")"
wait "$holder"
holder=''
grep -qx 'CONSUMED' "$tmp/a.log" || { cat "$tmp/a.log" >&2; exit 1; }
[[ "$loser" == 'DENY_NONCE_REPLAY' ]] || {
 echo "FAIL: competing consumer accepted: $loser" >&2; exit 1
}
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
DECLARE result text;
BEGIN
 result:=citadel_anchor_nonce_ci.consume(
  'citadel-draft',repeat('a',64),'reader-east',repeat('b',64),repeat('c',64),8);
 IF result<>'DENY_NONCE_REPLAY' THEN
  RAISE EXCEPTION 'FAIL: identical replay accepted: %',result; END IF;
 result:=citadel_anchor_nonce_ci.consume(
  'citadel-draft',repeat('a',64),'reader-east',repeat('f',64),repeat('c',64),8);
 IF result<>'DENY_NONCE_REPLAY' THEN
  RAISE EXCEPTION 'FAIL: mutated receipt reused nonce: %',result; END IF;
 IF (SELECT count(*) FROM citadel_anchor_nonce_ci.consumed)<>1 OR
 NOT EXISTS (SELECT 1 FROM citadel_anchor_nonce_ci.consumed
  WHERE registry_key='citadel-draft' AND nonce_sha256=repeat('a',64)
   AND reader_id='reader-east' AND observation_sha256=repeat('b',64)
   AND anchor_sha256=repeat('c',64) AND epoch=8)
 THEN RAISE EXCEPTION 'FAIL: competing nonce modified original evidence'; END IF;
 RAISE NOTICE 'PASS: committed nonce is never reused, even across readers';
END $check$;

-- An uncommitted reservation must leave no consumed nonce.
BEGIN;
DO $speculative$
BEGIN
 IF citadel_anchor_nonce_ci.consume(
 'citadel-draft',repeat('1',64),'reader-east',repeat('2',64),repeat('3',64),9)
 <> 'CONSUMED' THEN RAISE EXCEPTION 'FAIL: speculative reservation'; END IF;
END $speculative$;
ROLLBACK;
DO $retry$
DECLARE result text;
BEGIN
 IF EXISTS (SELECT 1 FROM citadel_anchor_nonce_ci.consumed
 WHERE nonce_sha256=repeat('1',64)) THEN
 RAISE EXCEPTION 'FAIL: rolled-back nonce survived'; END IF;
 result:=citadel_anchor_nonce_ci.consume(
 'citadel-draft',repeat('1',64),'reader-east',repeat('2',64),repeat('3',64),9);
 IF result<>'CONSUMED' THEN RAISE EXCEPTION 'FAIL: retry after rollback: %',result; END IF;
 result:=citadel_anchor_nonce_ci.consume(
 'citadel-draft',repeat('1',64),'reader-east',repeat('2',64),repeat('3',64),9);
 IF result<>'DENY_NONCE_REPLAY' THEN RAISE EXCEPTION 'FAIL: duplicate retry: %',result; END IF;
 IF (SELECT count(*) FROM citadel_anchor_nonce_ci.consumed)<>2
 THEN RAISE EXCEPTION 'FAIL: wrong durable consumption count'; END IF;
 RAISE NOTICE 'PASS: rolled-back reservation can be committed once on retry';
END $retry$;
SQL
echo 'PASS: isolated nonce consumption race, replay denial, rollback retry; HOLD intact'
