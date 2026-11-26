#!/usr/bin/env bash
# Disposable test-only recovery receipts for one-time nonce consumption.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != 1 || "$PGHOST" != 127.0.0.1 ||
 "$PGPORT" != 5432 || "$PGDATABASE" != postgres ]]; then
 echo 'DENY: disposable PostgreSQL only' >&2; exit 64
fi
cleanup(){
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_nonce_receipt_ci CASCADE' >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_nonce_receipt_ci;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE citadel_nonce_receipt_ci.challenge(
 registry_key text NOT NULL,
 nonce_sha256 char(64) NOT NULL,
 reader_id text NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>0),
 anchor_sha256 char(64) NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_receipt_sha256 char(64),
 PRIMARY KEY(registry_key,nonce_sha256)
);
CREATE TABLE citadel_nonce_receipt_ci.receipt(
 registry_key text NOT NULL,
 nonce_sha256 char(64) NOT NULL,
 receipt_sha256 char(64) NOT NULL,
 evidence_sha256 char(64) NOT NULL,
 reader_id text NOT NULL,
 epoch bigint NOT NULL,
 anchor_sha256 char(64) NOT NULL,
 PRIMARY KEY(registry_key,nonce_sha256),
 UNIQUE(registry_key,receipt_sha256)
);
CREATE FUNCTION citadel_nonce_receipt_ci.issue(
 p_reader text,p_epoch bigint,p_anchor char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE raw text;
BEGIN
 IF p_reader !~ '^[a-z0-9-]{3,80}$' OR p_epoch<1 OR
 p_anchor !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 raw:=encode(gen_random_bytes(32),'hex');
 INSERT INTO citadel_nonce_receipt_ci.challenge
 VALUES('citadel-draft',encode(digest(decode(raw,'hex'),'sha256'),'hex'),
 p_reader,p_epoch,p_anchor,clock_timestamp()+interval '60 seconds',NULL);
 RETURN raw;
END $fn$;
-- The function is ONLY a synthetic evidence-hash fixture. It does NOT verify
-- real signatures, authenticate readers, or authorize real-world writes.
CREATE FUNCTION citadel_nonce_receipt_ci.commit_receipt(
 p_raw text,p_reader text,p_epoch bigint,p_anchor char(64),p_evidence char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE n char(64); receipt_hash char(64); changed integer;
BEGIN
 IF p_raw !~ '^[0-9a-f]{64}$' OR p_reader !~ '^[a-z0-9-]{3,80}$'
 OR p_epoch<1 OR p_anchor !~ '^[0-9a-f]{64}$'
 OR p_evidence !~ '^[0-9a-f]{64}$' THEN RETURN 'DENY_INVALID'; END IF;
 n:=encode(digest(decode(p_raw,'hex'),'sha256'),'hex');
 receipt_hash:=encode(digest(convert_to(
 'PALACO-CITADEL-NONCE-RECEIPT-V1'||chr(10)||
 'citadel-draft'||chr(10)||n||chr(10)||p_reader||chr(10)||
 p_epoch::text||chr(10)||p_anchor||chr(10)||p_evidence,'UTF8'),'sha256'),'hex');
 UPDATE citadel_nonce_receipt_ci.challenge
 SET consumed_receipt_sha256=receipt_hash
 WHERE registry_key='citadel-draft' AND nonce_sha256=n
 AND reader_id=p_reader AND epoch=p_epoch AND anchor_sha256=p_anchor
 AND expires_at>clock_timestamp() AND consumed_receipt_sha256 IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH'; END IF;
 INSERT INTO citadel_nonce_receipt_ci.receipt VALUES
 ('citadel-draft',n,receipt_hash,p_evidence,p_reader,p_epoch,p_anchor);
 RETURN 'COMMITTED';
END $fn$;
-- Read-after-commit reconciliation never returns a new commit capability.
CREATE FUNCTION citadel_nonce_receipt_ci.reconcile(
 p_raw text,p_reader text,p_epoch bigint,p_anchor char(64),p_evidence char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE n char(64); evidence char(64);
BEGIN
 IF p_raw !~ '^[0-9a-f]{64}$' OR p_reader !~ '^[a-z0-9-]{3,80}$'
 OR p_epoch<1 OR p_anchor !~ '^[0-9a-f]{64}$'
 OR p_evidence !~ '^[0-9a-f]{64}$' THEN RETURN 'DENY_INVALID'; END IF;
 n:=encode(digest(decode(p_raw,'hex'),'sha256'),'hex');
 SELECT r.evidence_sha256 INTO evidence
 FROM citadel_nonce_receipt_ci.receipt r
 WHERE r.registry_key='citadel-draft' AND r.nonce_sha256=n
 AND r.reader_id=p_reader AND r.epoch=p_epoch AND r.anchor_sha256=p_anchor;
 IF NOT FOUND THEN RETURN 'NO_MATCHING_COMMITTED_RECEIPT'; END IF;
 IF evidence<>p_evidence THEN RETURN 'DENY_CONFLICTING_EVIDENCE'; END IF;
 RETURN 'MATCHING_COMMITTED_RECEIPT';
END $fn$;
SQL
nonce="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_nonce_receipt_ci.issue('reader-east',8,repeat('a',64))")"
[[ "$nonce" =~ ^[0-9a-f]{64}$ ]] || { echo 'FAIL: invalid nonce' >&2; exit 1; }
nonce2="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_nonce_receipt_ci.issue('reader-east',8,repeat('a',64))")"
[[ "$nonce2" =~ ^[0-9a-f]{64}$ && "$nonce" != "$nonce2" ]] || {
 echo 'FAIL: nonce collision' >&2; exit 1
}
# Mimic an ACK that is discarded by the caller after a successful COMMIT.
psql -X -q -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_nonce_receipt_ci.commit_receipt('$nonce','reader-east',8,repeat('a',64),repeat('b',64))" >/dev/null
# Recover only by separate read-only session; duplicate consume must DENY.
psql -X -q -v ON_ERROR_STOP=1 <<SQL
DO \$test\$
DECLARE result text;
BEGIN
 result:=citadel_nonce_receipt_ci.reconcile('$nonce','reader-east',8,repeat('a',64),repeat('b',64));
 IF result<>'MATCHING_COMMITTED_RECEIPT' THEN RAISE EXCEPTION 'lost ACK recovery: %',result; END IF;
 result:=citadel_nonce_receipt_ci.commit_receipt('$nonce','reader-east',8,repeat('a',64),repeat('b',64));
 IF result<>'DENY_UNKNOWN_EXPIRED_USED_OR_MISMATCH'
 THEN RAISE EXCEPTION 'nonce replay: %',result; END IF;
 result:=citadel_nonce_receipt_ci.reconcile('$nonce','reader-east',8,repeat('a',64),repeat('c',64));
 IF result<>'DENY_CONFLICTING_EVIDENCE' THEN RAISE EXCEPTION 'evidence conflict: %',result; END IF;
 result:=citadel_nonce_receipt_ci.reconcile('$nonce','reader-west',8,repeat('a',64),repeat('b',64));
 IF result<>'NO_MATCHING_COMMITTED_RECEIPT' THEN RAISE EXCEPTION 'reader substitution: %',result; END IF;
 result:=citadel_nonce_receipt_ci.reconcile('$nonce', 'reader-east',9,repeat('a',64),repeat('b',64));
 IF result<>'NO_MATCHING_COMMITTED_RECEIPT' THEN RAISE EXCEPTION 'epoch substitution: %',result; END IF;
 IF (SELECT count(*) FROM citadel_nonce_receipt_ci.receipt)<>1
 THEN RAISE EXCEPTION 'duplicate recovery receipt'; END IF;
END \$test\$;
BEGIN;
DO \$test\$
BEGIN
 IF citadel_nonce_receipt_ci.commit_receipt('$nonce2','reader-east',8,repeat('a',64),repeat('d',64))
 <>'COMMITTED' THEN RAISE EXCEPTION 'speculative commit'; END IF;
END \$test\$;
ROLLBACK;
DO \$test\$
DECLARE result text;
BEGIN
 result:=citadel_nonce_receipt_ci.reconcile('$nonce2','reader-east',8,repeat('a',64),repeat('d',64));
 IF result<>'NO_MATCHING_COMMITTED_RECEIPT' THEN RAISE EXCEPTION 'rollback leaked receipt: %',result; END IF;
 result:=citadel_nonce_receipt_ci.commit_receipt('$nonce2','reader-east',8,repeat('a',64),repeat('d',64));
 IF result<>'COMMITTED' THEN RAISE EXCEPTION 'retry after rollback: %',result; END IF;
 IF (SELECT count(*) FROM citadel_nonce_receipt_ci.receipt)<>2
 OR (SELECT count(*) FROM citadel_nonce_receipt_ci.challenge
 WHERE consumed_receipt_sha256 IS NOT NULL)<>2
 THEN RAISE EXCEPTION 'atomic receipt/consumption count mismatch'; END IF;
 RAISE NOTICE 'PASS: lost ACK, immutable receipt, conflict and rollback recovery';
END \$test\$;
SQL
echo 'PASS: nonce receipt recovery regression in disposable PostgreSQL; Draft/HOLD'
