-- EARTH-097: isolated PostgreSQL role boundary candidate.
-- NOT applied to PALACO Supabase. Run only on disposable staging.
-- The privileged function is SECURITY DEFINER: ownership must be assigned to
-- a dedicated NOLOGIN owner that has no BYPASSRLS or superuser privilege.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='earth_audit_executor') THEN
  CREATE ROLE earth_audit_executor NOLOGIN;
 END IF;
END $$;
-- The function must be reviewed and installed by the dedicated function owner,
-- not by postgres/supabase_admin, before enabling EXECUTE.
REVOKE ALL ON SCHEMA earth_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA earth_audit FROM PUBLIC,anon,authenticated,service_role,earth_audit_executor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA earth_audit FROM PUBLIC,anon,authenticated,service_role,earth_audit_executor;
-- Deliberately no EXECUTE grant until a separately reviewed owner-bound function
-- has been installed and its full cryptographic input validation is tested.
COMMIT;
