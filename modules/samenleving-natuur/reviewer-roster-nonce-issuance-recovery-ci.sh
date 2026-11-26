#!/usr/bin/env bash
# Test-only nonce issuance, atomic consume and transaction outcome inspection.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != 1 || "$PGHOST" != 127.0.0.1 ||
 "$PGPORT" != 5432 || "$PGDATABASE" != postgres ]]; then
 echo 'DENY: isolated localhost disposable CI PostgreSQL only' >&2; exit 64
fi
tmp="$(mktemp -d)"
holder=''
cleanup(){
 if [[ -n "$holder" ]]; then kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true; fi
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_nonce_issue_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_nonce_issue_ci;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE citadel_nonce_issue_ci.challenge(
 registry_key text NOT NULL,
 nonce_sha256 char(64) NOT NULL,
 reader_id text NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>0),
 anchor_sha256 char(64) NOT NULL,
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 evidence_sha256 char(64),
 PRIMARY KEY(registry_key,nonce_sha256),
 CHECK(expires_at>issued_at),
 CHECK((consumed_at IS NULL)=(evidence_sha256 IS NULL))
);
-- Fresh 256-bit random nonce generated in PostgreSQL; raw nonce returned
-- to fixture only. Production challenge issuer is NOT enabled.
CREATE FUNCTION citadel_nonce_issue_ci.issue(
 p_registry text,p_reader text,p_epoch bigint,p_anchor char(64),
 p_ttl_seconds integer DEFAULT 60)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE raw_nonce text; hashed char(64); now_at timestamptz;
BEGIN
 IF p_registry !~ '^[a-z0-9-]{3,80}$' OR p_reader !~ '^[a-z0-9-]{3,80}$'
 OR p_epoch<1 OR p_anchor !~ '^[0-9a-f]{64}$'
 OR p_ttl_seconds<1 OR p_ttl_seconds>300 THEN RETURN NULL; END IF;
 now_at:=clock_timestamp();
 raw_nonce:=encode(gen_random_bytes(32),'hex');
 hashed:=encode(digest(decode(raw_nonce,'hex'),'sha256'),'hex');
 INSERT INTO citadel_nonce_issue_ci.challenge
 VALUES(p_registry,hashed,p_reader,p_epoch,p_anchor,now_at,
 now_at+make_interval(secs=>p_ttl_seconds),NULL,NULL);
 RETURN raw_nonce;
END $fn$;
CREATE FUNCTION citadel_nonce_issue_ci.consume(
 p_registry text,p_raw_nonce text,p_reader text,p_epoch bigint,
 p_anchor char(64),p_evidence char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE changed integer; nonce_hash char(64);
BEGIN
 IF p_registry !~ '^[a-z0-9-]{3,80}$' OR
 p_raw_nonce !~ '^[0-9a-f]{64}$' OR
 p_reader !~ '^[a-z0-9-]{3,80}$' OR p_epoch<1 OR
 p_anchor !~ '^[0-9a-f]{64}$' OR
 p_evidence !~ '^[0-9a-f]{64}$' THEN RETURN 'DENY_INVALID'; END IF;
 nonce_hash:=encode(digest(decode(p_raw_nonce,'hex'),'sha256'),'hex');
 UPDATE citadel_nonce_issue_ci.challenge SET
 consumed_at=clock_timestamp(),evidence_sha256=p_evidence
 WHERE registry_key=p_registry AND nonce_sha256=nonce_hash
 AND reader_id=p_reader AND epoch=p_epoch AND anchor_sha256=p_anchor
 AND consumed_at IS NULL AND expires_at>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH'; END IF;
 RETURN 'CONSUMED';
END $fn$;
-- Read-only outcome inspection, not authorization. Does not expose secret nonce.
CREATE FUNCTION citadel_nonce_issue_ci.inspect(
 p_registry text,p_raw_nonce text)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE row_found boolean; is_used boolean; is_expired boolean;
BEGIN
 IF p_registry !~ '^[a-z0-9-]{3,80}$' OR p_raw_nonce !~ '^[0-9a-f]{64}$'
 THEN RETURN 'DENY_INVALID'; END IF;
 SELECT true,consumed_at IS NOT NULL,expires_at<=clock_timestamp()
 INTO row_found,is_used,is_expired FROM citadel_nonce_issue_ci.challenge
 WHERE registry_key=p_registry AND
 nonce_sha256=encode(digest(decode(p_raw_nonce,'hex'),'sha256'),'hex');
 IF NOT FOUND THEN RETURN 'UNKNOWN'; END IF;
 IF is_used THEN RETURN 'CONSUMED'; END IF;
 IF is_expired THEN RETURN 'EXPIRED'; END IF;
 RETURN 'ISSUED_UNUSED';
END $fn$;
SQL
issue(){
 psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_nonce_issue_ci.issue('citadel-draft','reader-east',8,repeat('a',64),60)"
}
nonce="$(issue)"
[[ "$nonce" =~ ^[0-9a-f]{64}$ ]] || { echo 'FAIL: issued nonce invalid' >&2; exit 1; }
nonce2="$(issue)"
[[ "$nonce2" =~ ^[0-9a-f]{64}$ && "$nonce2" != "$nonce" ]] || {
 echo 'FAIL: repeated issuance lacked uniqueness' >&2; exit 1
}
# Invalid reader, anchor, epoch and guessed nonce cannot consume issuance.
psql -X -v ON_ERROR_STOP=1 <<SQL
DO \$test\$
DECLARE outcome text;
BEGIN
 outcome:=citadel_nonce_issue_ci.consume('citadel-draft','$nonce',
  'reader-west',8,repeat('a',64),repeat('b',64));
 IF outcome<>'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH' THEN RAISE EXCEPTION 'wrong reader'; END IF;
 outcome:=citadel_nonce_issue_ci.consume('citadel-draft','$nonce',
  'reader-east',9,repeat('a',64),repeat('b',64));
 IF outcome<>'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH' THEN RAISE EXCEPTION 'wrong epoch'; END IF;
 outcome:=citadel_nonce_issue_ci.consume('citadel-draft','$nonce',
  'reader-east',8,repeat('c',64),repeat('b',64));
 IF outcome<>'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH' THEN RAISE EXCEPTION 'wrong anchor'; END IF;
 outcome:=citadel_nonce_issue_ci.consume('citadel-draft',repeat('f',64),
  'reader-east',8,repeat('a',64),repeat('b',64));
 IF outcome<>'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH' THEN RAISE EXCEPTION 'guessed nonce'; END IF;
 IF citadel_nonce_issue_ci.inspect('citadel-draft','$nonce')<>'ISSUED_UNUSED'
 THEN RAISE EXCEPTION 'invalid requests altered nonce'; END IF;
END \$test\$;
SQL

# Writer A has an uncommitted nonce consume; second client must wait and deny.
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/first.log" 2>&1 <<SQL &
BEGIN;
SELECT citadel_nonce_issue_ci.consume('citadel-draft','$nonce',
 'reader-east',8,repeat('a',64),repeat('b',64));
\! touch "$tmp/staged"
SELECT pg_sleep(3);
COMMIT;
SQL
holder=$!
for i in $(seq 1 100); do
 [[ -f "$tmp/staged" ]] && break
 if ! kill -0 "$holder" 2>/dev/null; then cat "$tmp/first.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -f "$tmp/staged" ]] || { echo 'FAIL: first nonce not staged' >&2; exit 1; }
loser="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_nonce_issue_ci.consume('citadel-draft','$nonce','reader-east',8,repeat('a',64),repeat('c',64))")"
wait "$holder"
holder=''
grep -qx 'CONSUMED' "$tmp/first.log" || { cat "$tmp/first.log" >&2; exit 1; }
[[ "$loser" == DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH ]] || {
 echo 'FAIL: concurrent nonce consumed twice' >&2; exit 1
}
[[ "$(psql -X -qAt -c "SELECT citadel_nonce_issue_ci.inspect('citadel-draft','$nonce')")" == CONSUMED ]] || {
 echo 'FAIL: committed nonce not visible on new connection' >&2; exit 1
}
# A speculative consume rolled back must preserve ISSUED_UNUSED.
psql -X -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DO \$test\$
BEGIN
 IF citadel_nonce_issue_ci.consume('citadel-draft','$nonce2',
 'reader-east',8,repeat('a',64),repeat('d',64))<>'CONSUMED'
 THEN RAISE EXCEPTION 'speculative consume failed'; END IF;
END \$test\$;
ROLLBACK;
SQL
[[ "$(psql -X -qAt -c "SELECT citadel_nonce_issue_ci.inspect('citadel-draft','$nonce2')")" == ISSUED_UNUSED ]] || {
 echo 'FAIL: rolled-back consumption persisted' >&2; exit 1
}
psql -X -v ON_ERROR_STOP=1 <<SQL
DO \$test\$
DECLARE result text;
BEGIN
 result:=citadel_nonce_issue_ci.consume('citadel-draft','$nonce2',
  'reader-east',8,repeat('a',64),repeat('d',64));
 IF result<>'CONSUMED' THEN RAISE EXCEPTION 'retry after rollback: %',result; END IF;
 result:=citadel_nonce_issue_ci.consume('citadel-draft','$nonce2',
  'reader-east',8,repeat('a',64),repeat('d',64));
 IF result<>'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH'
 THEN RAISE EXCEPTION 'duplicate consume after retry: %',result; END IF;
 IF (SELECT count(*) FROM citadel_nonce_issue_ci.challenge WHERE consumed_at IS NOT NULL)<>2
 THEN RAISE EXCEPTION 'wrong consumed count'; END IF;
END \$test\$;
-- Fixture-only manipulation simulates a challenge that expired before use.
UPDATE citadel_nonce_issue_ci.challenge SET
 expires_at=clock_timestamp()-interval '1 second'
 WHERE nonce_sha256=repeat('0',64);
SQL
echo 'PASS: nonce challenge issuance, concurrency, replay and rollback; DRAFT/HOLD'
