#!/usr/bin/env bash
# Disposable PostgreSQL 16 CI security boundary test ONLY. No live credentials.
set -euo pipefail
if [[ "${CITADEL_EPHEMERAL_CI_ONLY:-}" != "1" ||
      "${PGHOST:-}" != "127.0.0.1" ||
      "${PGDATABASE:-}" != "postgres" ||
      "${PGUSER:-}" != "postgres" ]]; then
  echo 'HOLD: disposable local CI PostgreSQL required' >&2
  exit 64
fi
schema=citadel_issuer_acl_ci
role=citadel_issuer_readonly_ci
cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS $schema CASCADE" >/dev/null 2>&1 || true
  psql -X -q -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS $role" >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA citadel_issuer_acl_ci;
CREATE ROLE citadel_issuer_readonly_ci NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE TABLE citadel_issuer_acl_ci.current_pin (
  singleton boolean PRIMARY KEY CHECK (singleton),
  sequence bigint NOT NULL CHECK (sequence>0),
  issuer_sha256 char(64) NOT NULL
);
CREATE TABLE citadel_issuer_acl_ci.append_history (
  sequence bigint PRIMARY KEY,
  issuer_sha256 char(64) NOT NULL
);
INSERT INTO citadel_issuer_acl_ci.current_pin
VALUES (true,4,repeat('a',64));
INSERT INTO citadel_issuer_acl_ci.append_history
VALUES (4,repeat('a',64));
REVOKE ALL ON SCHEMA citadel_issuer_acl_ci FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA citadel_issuer_acl_ci FROM PUBLIC;
GRANT USAGE ON SCHEMA citadel_issuer_acl_ci TO citadel_issuer_readonly_ci;
GRANT SELECT ON citadel_issuer_acl_ci.current_pin,
  citadel_issuer_acl_ci.append_history TO citadel_issuer_readonly_ci;
DO $check$
BEGIN
 IF has_table_privilege('citadel_issuer_readonly_ci',
   'citadel_issuer_acl_ci.current_pin','UPDATE')
   OR has_table_privilege('citadel_issuer_readonly_ci',
   'citadel_issuer_acl_ci.append_history','INSERT')
   OR has_table_privilege('citadel_issuer_readonly_ci',
   'citadel_issuer_acl_ci.append_history','DELETE')
   OR has_schema_privilege('citadel_issuer_readonly_ci',
   'citadel_issuer_acl_ci','CREATE') THEN
   RAISE EXCEPTION 'FAIL: readonly role holds forbidden permissions';
 END IF;
 RAISE NOTICE 'PASS: minimum read-only grants verified';
END $check$;
SQL
# Each command uses a separate session and is expected to fail. A successful
# unauthorized write is a FAIL, never a PASS.
deny() {
  local label="$1" sql="$2"
  if psql -X -q -v ON_ERROR_STOP=1       -c "SET ROLE citadel_issuer_readonly_ci; $sql" >/dev/null 2>&1; then
    echo "FAIL: unauthorized $label succeeded" >&2
    exit 1
  fi
  echo "PASS: unauthorized $label denied"
}
psql -X -q -v ON_ERROR_STOP=1 -c   "SET ROLE citadel_issuer_readonly_ci; SELECT sequence FROM citadel_issuer_acl_ci.current_pin;" >/dev/null
deny 'pin UPDATE' "UPDATE citadel_issuer_acl_ci.current_pin SET sequence=5 WHERE singleton;"
deny 'audit INSERT' "INSERT INTO citadel_issuer_acl_ci.append_history VALUES (5,repeat('b',64));"
deny 'audit DELETE' "DELETE FROM citadel_issuer_acl_ci.append_history WHERE sequence=4;"
deny 'audit TRUNCATE' "TRUNCATE citadel_issuer_acl_ci.append_history;"
deny 'schema CREATE' "CREATE TABLE citadel_issuer_acl_ci.forbidden (id int);"
deny 'privilege escalation' "GRANT UPDATE ON citadel_issuer_acl_ci.current_pin TO citadel_issuer_readonly_ci;"
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
BEGIN
 IF (SELECT sequence FROM citadel_issuer_acl_ci.current_pin WHERE singleton)<>4
    OR (SELECT count(*) FROM citadel_issuer_acl_ci.append_history)<>1
    OR (SELECT issuer_sha256 FROM citadel_issuer_acl_ci.append_history WHERE sequence=4)
      <>repeat('a',64)
 THEN RAISE EXCEPTION 'FAIL: denied operations changed protected state'; END IF;
 RAISE NOTICE 'PASS: denied operations preserved state and history';
END $check$;
SQL
echo 'PASS: disposable issuer ACL negative regressions'
