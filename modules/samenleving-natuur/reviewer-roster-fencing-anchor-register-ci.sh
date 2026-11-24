#!/usr/bin/env bash
# DRAFT/HOLD: isolated PostgreSQL fencing anchor CAS and rollback regression.
set -euo pipefail
if [[ "$CITADEL_EPHEMERAL_CI_ONLY" != "1" ||
 "$PGHOST" != "127.0.0.1" || "$PGPORT" != "5432" ||
 "$PGDATABASE" != "postgres" ]]; then
 echo 'DENY: disposable PostgreSQL CI only' >&2; exit 64
fi
tmp="$(mktemp -d)"
writer=''
cleanup() {
 if [[ -n "$writer" ]]; then kill "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true; fi
 psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_fencing_anchor_cas_ci CASCADE' >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_fencing_anchor_cas_ci;
CREATE TABLE citadel_fencing_anchor_cas_ci.pinned_anchor (
 registry_key text PRIMARY KEY, epoch bigint NOT NULL CHECK(epoch>0),
 anchor_sha256 char(64) NOT NULL CHECK(anchor_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_fencing_anchor_cas_ci.audit (
 registry_key text NOT NULL, epoch bigint NOT NULL,
 previous_anchor char(64) NOT NULL, candidate_anchor char(64) NOT NULL,
 PRIMARY KEY(registry_key,epoch)
);
INSERT INTO citadel_fencing_anchor_cas_ci.pinned_anchor
 VALUES('ci-only',7,repeat('a',64));
-- The fixture performs atomically pinned version/hash CAS and audit insertion.
-- It DOES NOT validate witness signatures or offer independent external trust.
CREATE FUNCTION citadel_fencing_anchor_cas_ci.advance(
 expected_epoch bigint,previous_sha char(64),next_epoch bigint,candidate_sha char(64))
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE changed integer;
BEGIN
 IF expected_epoch<1 OR next_epoch<>expected_epoch+1 OR
 previous_sha !~ '^[0-9a-f]{64}$' OR candidate_sha !~ '^[0-9a-f]{64}$'
 THEN RETURN 'DENY_INVALID'; END IF;
 UPDATE citadel_fencing_anchor_cas_ci.pinned_anchor
 SET epoch=next_epoch,anchor_sha256=candidate_sha
 WHERE registry_key='ci-only' AND epoch=expected_epoch
 AND anchor_sha256=previous_sha;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN 'DENY_STALE_OR_FORK'; END IF;
 INSERT INTO citadel_fencing_anchor_cas_ci.audit VALUES
 ('ci-only',next_epoch,previous_sha,candidate_sha);
 RETURN 'COMMITTED';
END $fn$;
SQL
# Session A holds version 8 uncommitted while session B races with forked 8.
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/first.log" 2>&1 <<SQL &
BEGIN;
SELECT citadel_fencing_anchor_cas_ci.advance(
 7,repeat('a',64),8,repeat('b',64));
\! touch "$tmp/staged"
SELECT pg_sleep(3);
COMMIT;
SQL
writer=$!
for i in $(seq 1 100); do
 [[ -f "$tmp/staged" ]] && break
 if ! kill -0 "$writer" 2>/dev/null; then cat "$tmp/first.log" >&2; exit 1; fi
 sleep 0.05
done
[[ -f "$tmp/staged" ]] || { echo 'FAIL: first anchor not staged' >&2; exit 1; }
# Second session waits on row lock and then loses CAS to the committed anchor.
loser="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT citadel_fencing_anchor_cas_ci.advance(7,repeat('a',64),8,repeat('c',64))")"
wait "$writer"; writer=''
grep -qx 'COMMITTED' "$tmp/first.log" || { cat "$tmp/first.log" >&2; exit 1; }
[[ "$loser" == 'DENY_STALE_OR_FORK' ]] || {
 echo "FAIL: competing anchor accepted: $loser" >&2; exit 1
}
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $test$
DECLARE result text;
BEGIN
 result:=citadel_fencing_anchor_cas_ci.advance(7,repeat('a',64),8,repeat('b',64));
 IF result<>'DENY_STALE_OR_FORK' THEN RAISE EXCEPTION 'FAIL: replay: %',result; END IF;
 result:=citadel_fencing_anchor_cas_ci.advance(8,repeat('c',64),9,repeat('d',64));
 IF result<>'DENY_STALE_OR_FORK' THEN RAISE EXCEPTION 'FAIL: forked parent: %',result; END IF;
 result:=citadel_fencing_anchor_cas_ci.advance(8,repeat('b',64),10,repeat('d',64));
 IF result<>'DENY_INVALID' THEN RAISE EXCEPTION 'FAIL: skipped epoch: %',result; END IF;
 IF NOT EXISTS (SELECT 1 FROM citadel_fencing_anchor_cas_ci.pinned_anchor
  WHERE epoch=8 AND anchor_sha256=repeat('b',64))
 OR (SELECT count(*) FROM citadel_fencing_anchor_cas_ci.audit)<>1
 THEN RAISE EXCEPTION 'FAIL: incorrect pinned anchor or duplicate audit'; END IF;
 RAISE NOTICE 'PASS: forked CAS and stale replay refused without side effects';
END $test$;
BEGIN;
DO $test$
BEGIN
 IF citadel_fencing_anchor_cas_ci.advance(8,repeat('b',64),9,repeat('d',64))<>'COMMITTED'
 THEN RAISE EXCEPTION 'FAIL: speculative new anchor'; END IF;
END $test$;
ROLLBACK;
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM citadel_fencing_anchor_cas_ci.pinned_anchor
  WHERE epoch=8 AND anchor_sha256=repeat('b',64))
 OR EXISTS (SELECT 1 FROM citadel_fencing_anchor_cas_ci.audit WHERE epoch=9)
 THEN RAISE EXCEPTION 'FAIL: rolled-back anchor survived'; END IF;
END $test$;
DO $test$
DECLARE result text;
BEGIN
 result:=citadel_fencing_anchor_cas_ci.advance(8,repeat('b',64),9,repeat('d',64));
 IF result<>'COMMITTED' THEN RAISE EXCEPTION 'FAIL: recovery: %',result; END IF;
 result:=citadel_fencing_anchor_cas_ci.advance(8,repeat('b',64),9,repeat('e',64));
 IF result<>'DENY_STALE_OR_FORK' THEN RAISE EXCEPTION 'FAIL: competing retry: %',result; END IF;
 IF NOT EXISTS (SELECT 1 FROM citadel_fencing_anchor_cas_ci.pinned_anchor
  WHERE epoch=9 AND anchor_sha256=repeat('d',64))
 OR (SELECT count(*) FROM citadel_fencing_anchor_cas_ci.audit)<>2
 THEN RAISE EXCEPTION 'FAIL: final pin or audit inconsistent'; END IF;
 RAISE NOTICE 'PASS: one post-rollback recovery and exactly two audited anchors';
END $test$;
SQL
echo 'PASS: isolated fencing anchor CAS race and rollback recovery; HOLD unchanged'
