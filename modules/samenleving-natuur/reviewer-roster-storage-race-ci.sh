#!/usr/bin/env bash
# Disposable PostgreSQL service ONLY. Never use PALACO MONO / staging / shared DB.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" || "${PGHOST:-}" != "127.0.0.1" ||
      "${PGDATABASE:-}" != "postgres" || "${PGPORT:-}" != "5432" ]]; then
  echo 'DENY: ephemeral CI PostgreSQL guard not satisfied' >&2
  exit 64
fi
tmp="$(mktemp -d)"
holder_pid=''
contender_pid=''
cleanup() {
  for pid in "$holder_pid" "$contender_pid"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
  psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_roster_race_ci CASCADE' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_roster_race_ci;
CREATE TABLE citadel_roster_race_ci.checkpoint (
 registry_key text PRIMARY KEY,
 store_version bigint NOT NULL CHECK (store_version > 0),
 sequence bigint NOT NULL CHECK (sequence > 0),
 revision bigint NOT NULL CHECK (revision > 0),
 head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_roster_race_ci.history (
 registry_key text NOT NULL,
 store_version bigint NOT NULL,
 head_sha256 char(64) NOT NULL,
 PRIMARY KEY (registry_key,store_version)
);
INSERT INTO citadel_roster_race_ci.checkpoint VALUES ('test-only',12,4,8,repeat('a',64));
SQL

# Writer A holds a real row lock, then atomically advances state + audit row.
# Writer B starts while A holds the lock and must update zero rows after A commits.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/holder.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout = '12s';
SELECT store_version FROM citadel_roster_race_ci.checkpoint
 WHERE registry_key='test-only' FOR UPDATE;
\! touch "$tmp/locked"
SELECT pg_sleep(3);
DO \$write\$
DECLARE changed integer;
BEGIN
 UPDATE citadel_roster_race_ci.checkpoint
 SET store_version=13,sequence=5,revision=9,head_sha256=repeat('b',64)
 WHERE registry_key='test-only' AND store_version=12 AND sequence=4
  AND revision=8 AND head_sha256=repeat('a',64);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'writer A failed expected atomic advance'; END IF;
 INSERT INTO citadel_roster_race_ci.history VALUES ('test-only',13,repeat('b',64));
END \$write\$;
COMMIT;
SQL
holder_pid=$!
for attempt in $(seq 1 100); do
  [[ -e "$tmp/locked" ]] && break
  if ! kill -0 "$holder_pid" 2>/dev/null; then cat "$tmp/holder.log" >&2; exit 1; fi
  sleep 0.05
done
[[ -e "$tmp/locked" ]] || { echo 'FAIL: first writer never acquired row lock' >&2; exit 1; }

# Separate real connection, same optimistic expected state, different proposed successor.
psql -X -q -v ON_ERROR_STOP=1 >"$tmp/contender.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout = '12s';
DO \$write\$
DECLARE changed integer;
BEGIN
 UPDATE citadel_roster_race_ci.checkpoint
 SET store_version=13,sequence=5,revision=10,head_sha256=repeat('c',64)
 WHERE registry_key='test-only' AND store_version=12 AND sequence=4
  AND revision=8 AND head_sha256=repeat('a',64);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN
   RAISE EXCEPTION 'FAIL: stale writer unexpectedly updated % rows',changed;
 END IF;
 RAISE NOTICE 'PASS: competing stale writer updated zero rows';
END \$write\$;
ROLLBACK;
SQL
contender_pid=$!
wait "$holder_pid"; holder_pid=''
wait "$contender_pid"; contender_pid=''

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $assert$
DECLARE state_count integer; history_count integer;
BEGIN
 SELECT count(*) INTO state_count FROM citadel_roster_race_ci.checkpoint
 WHERE registry_key='test-only' AND store_version=13 AND sequence=5
 AND revision=9 AND head_sha256=repeat('b',64);
 SELECT count(*) INTO history_count FROM citadel_roster_race_ci.history
 WHERE registry_key='test-only' AND store_version=13 AND head_sha256=repeat('b',64);
 IF state_count<>1 OR history_count<>1 THEN
   RAISE EXCEPTION 'FAIL: winning state or atomic history not preserved';
 END IF;
 IF (SELECT count(*) FROM citadel_roster_race_ci.history)<>1 THEN
   RAISE EXCEPTION 'FAIL: losing writer added history';
 END IF;
 RAISE NOTICE 'PASS: winner and single audit row preserved; stale writer rejected';
END $assert$;
SQL
cat "$tmp/contender.log"
echo 'PASS: disposable two-writer PostgreSQL race; no production writer enabled'
