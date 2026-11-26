#!/usr/bin/env bash
# PALACO CITADEL — denial-only rotation writer contract, scratch CI only.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" ||
      "${PGHOST:-}" != "127.0.0.1" ||
      "${PGDATABASE:-}" != "postgres" ||
      "${PGUSER:-}" != "postgres" ]]; then
  echo 'HOLD: disposable PostgreSQL CI environment required' >&2
  exit 64
fi
cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS citadel_issuer_writer_hold_ci CASCADE' >/dev/null 2>&1 || true
  psql -X -q -v ON_ERROR_STOP=1 -c 'DROP ROLE IF EXISTS citadel_issuer_untrusted_ci' >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE citadel_issuer_untrusted_ci NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE SCHEMA citadel_issuer_writer_hold_ci;
CREATE TABLE citadel_issuer_writer_hold_ci.current_pin (
  singleton boolean PRIMARY KEY CHECK (singleton),
  sequence bigint NOT NULL CHECK (sequence>0),
  issuer_fingerprint char(64) NOT NULL CHECK (issuer_fingerprint ~ '^[0-9a-f]{64}$')
);
CREATE TABLE citadel_issuer_writer_hold_ci.history (
  sequence bigint PRIMARY KEY,
  issuer_fingerprint char(64) NOT NULL
);
INSERT INTO citadel_issuer_writer_hold_ci.current_pin VALUES (true,7,repeat('a',64));
INSERT INTO citadel_issuer_writer_hold_ci.history VALUES (7,repeat('a',64));
-- There is deliberately no runnable authorized writer in this design.
-- No SECURITY DEFINER, no signing capability, no production path.
CREATE FUNCTION citadel_issuer_writer_hold_ci.propose_rotation(
 expected_sequence bigint,
 new_fingerprint text,
 reviewer_a text,
 reviewer_b text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $body$
BEGIN
  RAISE EXCEPTION 'HOLD: external identity, independent dual review and durable anchor not established'
    USING ERRCODE='42501';
END
$body$;
REVOKE ALL ON SCHEMA citadel_issuer_writer_hold_ci FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA citadel_issuer_writer_hold_ci FROM PUBLIC;
REVOKE ALL ON FUNCTION citadel_issuer_writer_hold_ci.propose_rotation(
 bigint,text,text,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA citadel_issuer_writer_hold_ci TO citadel_issuer_untrusted_ci;
GRANT SELECT ON citadel_issuer_writer_hold_ci.current_pin,
 citadel_issuer_writer_hold_ci.history TO citadel_issuer_untrusted_ci;
DO $check$
BEGIN
 IF has_function_privilege('citadel_issuer_untrusted_ci',
   'citadel_issuer_writer_hold_ci.propose_rotation(bigint,text,text,text)',
   'EXECUTE')
   OR has_table_privilege('citadel_issuer_untrusted_ci',
    'citadel_issuer_writer_hold_ci.current_pin','UPDATE')
   OR has_table_privilege('citadel_issuer_untrusted_ci',
    'citadel_issuer_writer_hold_ci.history','INSERT')
 THEN RAISE EXCEPTION 'FAIL: writer surface reachable by untrusted role'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc WHERE oid =
    'citadel_issuer_writer_hold_ci.propose_rotation(bigint,text,text,text)'::regprocedure
    AND prosecdef) THEN
    RAISE EXCEPTION 'FAIL: function unexpectedly SECURITY DEFINER';
 END IF;
 RAISE NOTICE 'PASS: no untrusted EXECUTE or direct writer privileges';
END $check$;
SQL
# An untrusted caller must receive a database error rather than a no-op success.
if psql -X -q -v ON_ERROR_STOP=1 -c  "SET ROLE citadel_issuer_untrusted_ci; SELECT citadel_issuer_writer_hold_ci.propose_rotation(7,repeat('b',64),'reviewer-1','reviewer-2');"  >/dev/null 2>&1; then
 echo 'FAIL: untrusted caller executed writer contract' >&2
 exit 1
fi
# Even the fixture owner cannot turn alleged "dual approval" into authority.
# Exercise the contract with plausible, colluding, stale and empty attestations.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
DECLARE
 old_count bigint;
 state_before bigint;
 denied boolean;
 request text[];
BEGIN
 SELECT count(*) INTO old_count FROM citadel_issuer_writer_hold_ci.history;
 SELECT sequence INTO state_before FROM citadel_issuer_writer_hold_ci.current_pin;
 FOREACH request SLICE 1 IN ARRAY ARRAY[
  ARRAY['7','reviewer-a','reviewer-b'],
  ARRAY['7','reviewer-a','reviewer-a'],
  ARRAY['6','reviewer-a','reviewer-b'],
  ARRAY['7','','']
 ] LOOP
  denied:=false;
  BEGIN
   PERFORM citadel_issuer_writer_hold_ci.propose_rotation(
    request[1]::bigint,repeat('b',64),request[2],request[3]);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: a HOLD rotation request was accepted'; END IF;
 END LOOP;
 IF (SELECT sequence FROM citadel_issuer_writer_hold_ci.current_pin)<>state_before
   OR (SELECT count(*) FROM citadel_issuer_writer_hold_ci.history)<>old_count
   OR (SELECT issuer_fingerprint FROM citadel_issuer_writer_hold_ci.current_pin)
      <>repeat('a',64) THEN
   RAISE EXCEPTION 'FAIL: HOLD preflight modified database state';
 END IF;
 RAISE NOTICE 'PASS: all owner-side requests denied; state and history unchanged';
END $check$;
SQL
echo 'PASS: scratch-only issuer writer HOLD contract'
