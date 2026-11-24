#!/usr/bin/env bash
# EPHEMERAL CI ONLY — simulate lost COMMIT acknowledgement; no production DB access.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" || "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" || "${PGDATABASE:-}" != "postgres" ]]; then
 echo 'DENY: requires isolated local disposable PostgreSQL CI service' >&2; exit 64
fi
cleanup(){
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_commit_outcome_ci CASCADE' >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_commit_outcome_ci;
CREATE TABLE citadel_commit_outcome_ci.state (
 registry_key text PRIMARY KEY, version integer NOT NULL CHECK(version>0),
 revision integer NOT NULL CHECK(revision>0), head char(64) NOT NULL
);
CREATE TABLE citadel_commit_outcome_ci.receipt (
 registry_key text NOT NULL, recovery_id text NOT NULL,
 digest char(64) NOT NULL, from_version integer NOT NULL,
 to_version integer NOT NULL, to_revision integer NOT NULL,
 to_head char(64) NOT NULL,
 PRIMARY KEY(registry_key,recovery_id), UNIQUE(registry_key,to_version)
);
CREATE TABLE citadel_commit_outcome_ci.audit (
 registry_key text NOT NULL, recovery_id text NOT NULL, version integer NOT NULL,
 PRIMARY KEY(registry_key,recovery_id), UNIQUE(registry_key,version)
);
INSERT INTO citadel_commit_outcome_ci.state VALUES('ci-only',12,8,repeat('a',64));
-- Test-only function. It checks recovery identity BEFORE the conditional update
-- while holding the same row lock as other writers.
CREATE FUNCTION citadel_commit_outcome_ci.attempt(
 p_id text,p_digest char(64),p_from integer,p_to integer,p_rev integer,p_head char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE prior citadel_commit_outcome_ci.receipt%ROWTYPE; n integer;
BEGIN
 IF p_id !~ '^[a-z0-9-]{1,80}$' OR p_digest !~ '^[0-9a-f]{64}$'
 OR p_head !~ '^[0-9a-f]{64}$' OR p_from<1 OR p_to<>p_from+1 OR p_rev<1
 THEN RETURN 'DENY_INVALID'; END IF;
 PERFORM 1 FROM citadel_commit_outcome_ci.state WHERE registry_key='ci-only' FOR UPDATE;
 SELECT * INTO prior FROM citadel_commit_outcome_ci.receipt
 WHERE registry_key='ci-only' AND recovery_id=p_id;
 IF FOUND THEN
  IF prior.digest=p_digest AND prior.from_version=p_from AND prior.to_version=p_to
   AND prior.to_revision=p_rev AND prior.to_head=p_head THEN RETURN 'ALREADY_COMMITTED'; END IF;
  RETURN 'DENY_KEY_REUSE';
 END IF;
 UPDATE citadel_commit_outcome_ci.state SET version=p_to,revision=p_rev,head=p_head
 WHERE registry_key='ci-only' AND version=p_from AND revision<p_rev;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN 'DENY_STALE'; END IF;
 INSERT INTO citadel_commit_outcome_ci.receipt VALUES
 ('ci-only',p_id,p_digest,p_from,p_to,p_rev,p_head);
 INSERT INTO citadel_commit_outcome_ci.audit VALUES('ci-only',p_id,p_to);
 RETURN 'COMMITTED';
END $fn$;
SQL

# The server commits successfully, but the originating client does not retain
# the acknowledgement. A new connection MUST read durable state first.
psql -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
BEGIN;
DO $test$
BEGIN
 IF citadel_commit_outcome_ci.attempt('lost-ack-001',repeat('b',64),12,13,9,repeat('c',64))
 <> 'COMMITTED' THEN RAISE EXCEPTION 'initial lost-ack attempt failed'; END IF;
END $test$;
COMMIT;
SQL

# Independent fresh connection: verify exact receipt and audit BEFORE retry.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $verify$
DECLARE status text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM citadel_commit_outcome_ci.receipt
  WHERE recovery_id='lost-ack-001' AND digest=repeat('b',64)
   AND from_version=12 AND to_version=13 AND to_revision=9
   AND to_head=repeat('c',64))
 OR NOT EXISTS (SELECT 1 FROM citadel_commit_outcome_ci.audit
  WHERE recovery_id='lost-ack-001' AND version=13)
 THEN RAISE EXCEPTION 'FAIL: committed recovery evidence not found on reconnect'; END IF;
 status:=citadel_commit_outcome_ci.attempt('lost-ack-001',repeat('b',64),12,13,9,repeat('c',64));
 IF status<>'ALREADY_COMMITTED' THEN
  RAISE EXCEPTION 'FAIL: lost ACK produced second write: %',status; END IF;
 status:=citadel_commit_outcome_ci.attempt('lost-ack-001',repeat('d',64),12,13,9,repeat('c',64));
 IF status<>'DENY_KEY_REUSE' THEN
  RAISE EXCEPTION 'FAIL: changed retry accepted: %',status; END IF;
 IF (SELECT count(*) FROM citadel_commit_outcome_ci.receipt)<>1
 OR (SELECT count(*) FROM citadel_commit_outcome_ci.audit)<>1
 THEN RAISE EXCEPTION 'FAIL: duplicate evidence after lost ACK'; END IF;
 RAISE NOTICE 'PASS: committed without observed ACK is recovered without a second write';
END $verify$;
SQL

# An interrupted/uncommitted transaction leaves no evidence. The same request
# can then legitimately commit once in a later connection.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $test$
BEGIN
 IF citadel_commit_outcome_ci.attempt('rolled-back-002',repeat('e',64),13,14,10,repeat('f',64))
 <> 'COMMITTED' THEN RAISE EXCEPTION 'speculative attempt failed'; END IF;
END $test$;
ROLLBACK;
SQL
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $verify$
DECLARE status text;
BEGIN
 IF EXISTS (SELECT 1 FROM citadel_commit_outcome_ci.receipt WHERE recovery_id='rolled-back-002')
 OR EXISTS (SELECT 1 FROM citadel_commit_outcome_ci.audit WHERE recovery_id='rolled-back-002')
 THEN RAISE EXCEPTION 'FAIL: rolled-back transaction left evidence'; END IF;
 status:=citadel_commit_outcome_ci.attempt('rolled-back-002',repeat('e',64),13,14,10,repeat('f',64));
 IF status<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: retry after rollback: %',status; END IF;
 status:=citadel_commit_outcome_ci.attempt('rolled-back-002',repeat('e',64),13,14,10,repeat('f',64));
 IF status<>'ALREADY_COMMITTED' THEN RAISE EXCEPTION 'FAIL: duplicate recovery: %',status; END IF;
 IF (SELECT count(*) FROM citadel_commit_outcome_ci.receipt)<>2
 OR (SELECT count(*) FROM citadel_commit_outcome_ci.audit)<>2
 OR NOT EXISTS (SELECT 1 FROM citadel_commit_outcome_ci.state
 WHERE version=14 AND revision=10 AND head=repeat('f',64))
 THEN RAISE EXCEPTION 'FAIL: recovery final state inconsistent'; END IF;
 RAISE NOTICE 'PASS: rolled-back attempt retries once and leaves exactly one receipt';
END $verify$;
SQL
echo 'PASS: disposable PostgreSQL lost-ACK and rollback recovery semantics; HOLD intact'
