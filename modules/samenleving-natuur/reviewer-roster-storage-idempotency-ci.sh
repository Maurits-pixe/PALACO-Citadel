#!/usr/bin/env bash
# EPHEMERAL CI ONLY — idempotent checkpoint recovery fixture, not a production writer.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" || "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" || "${PGDATABASE:-}" != "postgres" ]]; then
  echo 'DENY: disposable localhost PostgreSQL CI guard required' >&2
  exit 64
fi
cleanup() {
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_roster_idempotency_ci CASCADE' >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_roster_idempotency_ci;
CREATE TABLE citadel_roster_idempotency_ci.checkpoint (
 registry_key text PRIMARY KEY,
 store_version integer NOT NULL CHECK (store_version>0),
 revision integer NOT NULL CHECK (revision>0),
 head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_roster_idempotency_ci.receipt (
 registry_key text NOT NULL,
 recovery_id text NOT NULL,
 request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
 expected_version integer NOT NULL,
 target_revision integer NOT NULL,
 store_version integer NOT NULL,
 head_sha256 char(64) NOT NULL,
 PRIMARY KEY (registry_key,recovery_id),
 UNIQUE (registry_key,store_version),
 UNIQUE (registry_key,head_sha256)
);
CREATE TABLE citadel_roster_idempotency_ci.history (
 registry_key text NOT NULL,
 store_version integer NOT NULL,
 recovery_id text NOT NULL,
 head_sha256 char(64) NOT NULL,
 PRIMARY KEY (registry_key,store_version),
 UNIQUE (registry_key,recovery_id)
);
INSERT INTO citadel_roster_idempotency_ci.checkpoint
 VALUES ('ci-only',12,8,repeat('a',64));

-- This SQL function exists ONLY inside the disposable fixture schema.
-- Its unique request identity is pinned to the whole request digest.
-- Real integrations must obtain digest and authority independently.
CREATE FUNCTION citadel_roster_idempotency_ci.attempt(
 id text, digest char(64), expected_version integer, target_version integer,
 target_revision integer, target_head char(64))
RETURNS text LANGUAGE plpgsql AS $body$
DECLARE old citadel_roster_idempotency_ci.receipt%ROWTYPE; changed integer;
BEGIN
 IF id !~ '^[a-z0-9-]{1,80}$' OR digest !~ '^[0-9a-f]{64}$'
  OR target_head !~ '^[0-9a-f]{64}$'
  OR expected_version<1 OR target_version<>expected_version+1
  OR target_revision<1 THEN RETURN 'DENY_INVALID_REQUEST'; END IF;
 -- Serialize on the checkpoint row; a concurrent retry cannot pass as a new write.
 PERFORM 1 FROM citadel_roster_idempotency_ci.checkpoint
  WHERE registry_key='ci-only' FOR UPDATE;
 SELECT * INTO old FROM citadel_roster_idempotency_ci.receipt
  WHERE registry_key='ci-only' AND recovery_id=id;
 IF FOUND THEN
  IF old.request_sha256=digest AND old.expected_version=expected_version
   AND old.target_revision=target_revision AND old.store_version=target_version
   AND old.head_sha256=target_head THEN RETURN 'ALREADY_COMMITTED'; END IF;
  RETURN 'DENY_IDEMPOTENCY_KEY_REUSE';
 END IF;
 UPDATE citadel_roster_idempotency_ci.checkpoint
  SET store_version=target_version,revision=target_revision,head_sha256=target_head
  WHERE registry_key='ci-only' AND store_version=expected_version
    AND revision<target_revision;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_STALE_CHECKPOINT'; END IF;
 INSERT INTO citadel_roster_idempotency_ci.history
  VALUES ('ci-only',target_version,id,target_head);
 INSERT INTO citadel_roster_idempotency_ci.receipt
  VALUES ('ci-only',id,digest,expected_version,target_revision,target_version,target_head);
 RETURN 'COMMITTED';
END $body$;

DO $test$
DECLARE status text;
BEGIN
 status:=citadel_roster_idempotency_ci.attempt('recovery-001',repeat('b',64),12,13,9,repeat('c',64));
 IF status<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: initial commit: %',status; END IF;
 status:=citadel_roster_idempotency_ci.attempt('recovery-001',repeat('b',64),12,13,9,repeat('c',64));
 IF status<>'ALREADY_COMMITTED' THEN RAISE EXCEPTION 'FAIL: exact retry: %',status; END IF;
 status:=citadel_roster_idempotency_ci.attempt('recovery-001',repeat('b',64),12,13,10,repeat('c',64));
 IF status<>'DENY_IDEMPOTENCY_KEY_REUSE' THEN RAISE EXCEPTION 'FAIL: altered revision accepted: %',status; END IF;
 status:=citadel_roster_idempotency_ci.attempt('recovery-001',repeat('d',64),12,13,9,repeat('c',64));
 IF status<>'DENY_IDEMPOTENCY_KEY_REUSE' THEN RAISE EXCEPTION 'FAIL: reused key: %',status; END IF;
 status:=citadel_roster_idempotency_ci.attempt('recovery-002',repeat('e',64),12,13,9,repeat('f',64));
 IF status<>'DENY_STALE_CHECKPOINT' THEN RAISE EXCEPTION 'FAIL: stale attempt: %',status; END IF;
 IF (SELECT count(*) FROM citadel_roster_idempotency_ci.receipt)<>1
  OR (SELECT count(*) FROM citadel_roster_idempotency_ci.history)<>1
  OR NOT EXISTS (SELECT 1 FROM citadel_roster_idempotency_ci.checkpoint
   WHERE registry_key='ci-only' AND store_version=13 AND revision=9
    AND head_sha256=repeat('c',64)) THEN
  RAISE EXCEPTION 'FAIL: replay changed committed state';
 END IF;
 RAISE NOTICE 'PASS: exact retry has single receipt and history row; key reuse and stale requests denied';
END $test$;

-- An interrupted transaction leaves no receipt, history or state.
-- A legitimate retry of that SAME request should commit once.
BEGIN;
DO $test$
DECLARE status text;
BEGIN
 status:=citadel_roster_idempotency_ci.attempt('recovery-003',repeat('1',64),13,14,10,repeat('2',64));
 IF status<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: interrupted attempt did not stage'; END IF;
END $test$;
ROLLBACK;

DO $test$
DECLARE status text;
BEGIN
 IF (SELECT count(*) FROM citadel_roster_idempotency_ci.receipt)<>1
   OR (SELECT count(*) FROM citadel_roster_idempotency_ci.history)<>1 THEN
  RAISE EXCEPTION 'FAIL: aborted attempt left evidence'; END IF;
 status:=citadel_roster_idempotency_ci.attempt('recovery-003',repeat('1',64),13,14,10,repeat('2',64));
 IF status<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: legitimate retry after rollback: %',status; END IF;
 status:=citadel_roster_idempotency_ci.attempt('recovery-003',repeat('1',64),13,14,10,repeat('2',64));
 IF status<>'ALREADY_COMMITTED' THEN RAISE EXCEPTION 'FAIL: retry after recovery: %',status; END IF;
 IF (SELECT count(*) FROM citadel_roster_idempotency_ci.receipt)<>2
  OR (SELECT count(*) FROM citadel_roster_idempotency_ci.history)<>2
  OR NOT EXISTS (SELECT 1 FROM citadel_roster_idempotency_ci.checkpoint
   WHERE registry_key='ci-only' AND store_version=14 AND revision=10
     AND head_sha256=repeat('2',64)) THEN
  RAISE EXCEPTION 'FAIL: recovered state not exactly once'; END IF;
 RAISE NOTICE 'PASS: rolled back attempt safely retried and committed exactly once';
END $test$;
SQL
echo 'PASS: disposable PostgreSQL idempotent recovery fixture; no production permission'
