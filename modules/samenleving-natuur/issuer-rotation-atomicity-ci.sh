#!/usr/bin/env bash
# PALACO CITADEL: scratch-only rotation ledger concurrency regression.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" ||
      "${PGHOST:-}" != "127.0.0.1" ||
      "${PGDATABASE:-}" != "postgres" ||
      "${PGUSER:-}" != "postgres" ]]; then
  echo 'HOLD: scratch PostgreSQL CI environment required' >&2
  exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
cleanup() {
  if [[ -n "$holder_pid" ]]; then
    kill "$holder_pid" 2>/dev/null || true
    wait "$holder_pid" 2>/dev/null || true
  fi
  psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_issuer_rotation_ci CASCADE' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_issuer_rotation_ci;
CREATE TABLE citadel_issuer_rotation_ci.current_pin (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  sequence bigint NOT NULL CHECK (sequence > 0),
  issuer_sha256 char(64) NOT NULL CHECK (issuer_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_issuer_rotation_ci.append_history (
  sequence bigint PRIMARY KEY CHECK (sequence > 0),
  previous_head char(64) NOT NULL,
  next_head char(64) UNIQUE NOT NULL,
  previous_issuer char(64) NOT NULL,
  next_issuer char(64) NOT NULL
);
CREATE FUNCTION citadel_issuer_rotation_ci.deny_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HOLD: issuer rotation audit history is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON citadel_issuer_rotation_ci.append_history
FOR EACH STATEMENT EXECUTE FUNCTION citadel_issuer_rotation_ci.deny_history_mutation();
INSERT INTO citadel_issuer_rotation_ci.current_pin
VALUES (true,3,repeat('a',64),repeat('b',64),repeat('c',64));
INSERT INTO citadel_issuer_rotation_ci.append_history
VALUES (3,repeat('0',64),repeat('c',64),repeat('0',64),repeat('a',64));
SQL
# One client holds a transaction row lock and applies a single atomic
# state/history transition. Separate connections cannot race it.
psql -X -v ON_ERROR_STOP=1 >"$tmp/holder.log" 2>&1 <<SQL &
BEGIN;
SELECT sequence FROM citadel_issuer_rotation_ci.current_pin WHERE singleton FOR UPDATE;
\! touch "$tmp/held"
SELECT pg_sleep(4);
UPDATE citadel_issuer_rotation_ci.current_pin SET
  sequence=4,issuer_sha256=repeat('d',64),
  snapshot_sha256=repeat('e',64),head_sha256=repeat('f',64)
WHERE singleton AND sequence=3 AND issuer_sha256=repeat('a',64)
  AND snapshot_sha256=repeat('b',64) AND head_sha256=repeat('c',64);
INSERT INTO citadel_issuer_rotation_ci.append_history
VALUES (4,repeat('c',64),repeat('f',64),repeat('a',64),repeat('d',64));
COMMIT;
SQL
holder_pid=$!
for attempt in $(seq 1 80); do
  [[ -f "$tmp/held" ]] && break
  if ! kill -0 "$holder_pid" 2>/dev/null; then
    cat "$tmp/holder.log" >&2; exit 1
  fi
  sleep 0.1
done
[[ -f "$tmp/held" ]] || { echo 'FAIL: lock not obtained' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '250ms';
DO $block$
DECLARE timed_out boolean := false;
BEGIN
  BEGIN
    PERFORM sequence FROM citadel_issuer_rotation_ci.current_pin
      WHERE singleton FOR UPDATE;
  EXCEPTION WHEN lock_not_available THEN timed_out := true;
  END;
  IF NOT timed_out THEN RAISE EXCEPTION 'FAIL: concurrent rotation not blocked'; END IF;
  RAISE NOTICE 'PASS: competing rotation blocked by row lock';
END
$block$;
ROLLBACK;
SQL
wait "$holder_pid"
holder_pid=''
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
DECLARE changed integer;
BEGIN
  UPDATE citadel_issuer_rotation_ci.current_pin SET sequence=5
  WHERE singleton AND sequence=3 AND issuer_sha256=repeat('a',64)
    AND snapshot_sha256=repeat('b',64) AND head_sha256=repeat('c',64);
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'FAIL: stale rotation replay committed'; END IF;
  IF (SELECT sequence FROM citadel_issuer_rotation_ci.current_pin WHERE singleton) <> 4
    OR (SELECT count(*) FROM citadel_issuer_rotation_ci.append_history) <> 2
    OR (SELECT next_head FROM citadel_issuer_rotation_ci.append_history
        WHERE sequence=4) <> repeat('f',64) THEN
    RAISE EXCEPTION 'FAIL: state/history diverged';
  END IF;
END
$check$;
-- Simulate a failed composite transaction, including a speculative append.
BEGIN;
UPDATE citadel_issuer_rotation_ci.current_pin SET sequence=5 WHERE singleton;
INSERT INTO citadel_issuer_rotation_ci.append_history
VALUES (5,repeat('f',64),repeat('1',64),repeat('d',64),repeat('2',64));
ROLLBACK;
DO $check$
BEGIN
  IF (SELECT sequence FROM citadel_issuer_rotation_ci.current_pin WHERE singleton) <> 4
     OR EXISTS (SELECT 1 FROM citadel_issuer_rotation_ci.append_history WHERE sequence=5) THEN
    RAISE EXCEPTION 'FAIL: rolled-back rotation leaked state or history';
  END IF;
  RAISE NOTICE 'PASS: failed rotation rolled back state AND append';
END
$check$;
DO $check$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    UPDATE citadel_issuer_rotation_ci.append_history SET next_head=repeat('9',64)
      WHERE sequence=4;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: old history may be rewritten'; END IF;
  RAISE NOTICE 'PASS: audit history rewrite rejected';
END
$check$;
SQL
echo 'PASS: scratch issuer rotation atomicity, lock, replay and rollback checks'
