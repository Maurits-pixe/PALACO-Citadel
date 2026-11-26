#!/usr/bin/env bash
# EPHEMERAL CI ONLY — never point this script at PALACO MONO or shared databases.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" || "${PGDATABASE:-}" != "postgres" || "${PGHOST:-}" != "127.0.0.1" ]]; then
  echo "HOLD: requires explicitly marked local disposable PostgreSQL CI service" >&2
  exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
cleanup() {
  if [[ -n "$holder_pid" ]]; then
    kill "$holder_pid" 2>/dev/null || true
    wait "$holder_pid" 2>/dev/null || true
  fi
  psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_cas_concurrency_ci CASCADE' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_cas_concurrency_ci;
CREATE TABLE citadel_cas_concurrency_ci.fixture (
  registry_key text PRIMARY KEY,
  revision integer NOT NULL CHECK (revision > 0),
  registry_sha256 char(64) NOT NULL,
  head_sha256 char(64) NOT NULL
);
INSERT INTO citadel_cas_concurrency_ci.fixture
VALUES ('ci-only',2,repeat('b',64),repeat('c',64));
SQL
# The holder acquires a real row lock and signals from the psql client before
# sleeping. The contender is a genuinely separate PostgreSQL connection.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/holder.log" 2>&1 <<SQL &
BEGIN;
SELECT revision FROM citadel_cas_concurrency_ci.fixture
WHERE registry_key='ci-only' FOR UPDATE;
\! touch "$tmp/held"
SELECT pg_sleep(5);
UPDATE citadel_cas_concurrency_ci.fixture SET
revision=3,registry_sha256=repeat('d',64),head_sha256=repeat('e',64)
WHERE registry_key='ci-only' AND revision=2
AND registry_sha256=repeat('b',64) AND head_sha256=repeat('c',64);
COMMIT;
SQL
holder_pid=$!
for attempt in $(seq 1 80); do
  [[ -f "$tmp/held" ]] && break
  if ! kill -0 "$holder_pid" 2>/dev/null; then
    cat "$tmp/holder.log" >&2
    echo 'FAIL: lock holder exited before acquiring row lock' >&2
    exit 1
  fi
  sleep 0.1
done
[[ -f "$tmp/held" ]] || { echo 'FAIL: holder never signaled row lock' >&2; exit 1; }

psql -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '300ms';
DO $test$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM revision FROM citadel_cas_concurrency_ci.fixture
      WHERE registry_key='ci-only' FOR UPDATE;
  EXCEPTION WHEN lock_not_available THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: concurrent writer was not blocked by row lock'; END IF;
  RAISE NOTICE 'PASS: competing transaction rejected by PostgreSQL row lock timeout';
END
$test$;
ROLLBACK;
SQL
wait "$holder_pid"
holder_pid=''
# After the first writer commits, a stale optimistic CAS must affect zero rows.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE changed integer;
BEGIN
  UPDATE citadel_cas_concurrency_ci.fixture SET revision=4,
    registry_sha256=repeat('f',64),head_sha256=repeat('a',64)
  WHERE registry_key='ci-only' AND revision=2
    AND registry_sha256=repeat('b',64) AND head_sha256=repeat('c',64);
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'FAIL: stale writer unexpectedly advanced pin'; END IF;
  IF (SELECT revision FROM citadel_cas_concurrency_ci.fixture
      WHERE registry_key='ci-only') <> 3 THEN
    RAISE EXCEPTION 'FAIL: original committed revision was lost';
  END IF;
  RAISE NOTICE 'PASS: stale optimistic compare rejected, committed revision preserved';
END
$test$;
BEGIN;
UPDATE citadel_cas_concurrency_ci.fixture SET revision=4
WHERE registry_key='ci-only';
ROLLBACK;
DO $test$
BEGIN
  IF (SELECT revision FROM citadel_cas_concurrency_ci.fixture
      WHERE registry_key='ci-only') <> 3 THEN
    RAISE EXCEPTION 'FAIL: transaction rollback did not restore revision';
  END IF;
  RAISE NOTICE 'PASS: speculative revision rolled back';
END
$test$;
SQL
echo 'PASS: ephemeral two-session PostgreSQL concurrency test'
