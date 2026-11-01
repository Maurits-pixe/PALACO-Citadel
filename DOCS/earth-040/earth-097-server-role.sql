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
REVOKE ALL ON SCHEMA earth_audit FROM PUBLIC,earth_audit_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA earth_audit FROM PUBLIC,earth_audit_executor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA earth_audit FROM PUBLIC,earth_audit_executor;
-- Supabase roles are absent in vanilla PostgreSQL CI. Revoke only when present.
DO $
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA earth_audit FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA earth_audit FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA earth_audit FROM %I',role_name);
  END IF;
 END LOOP;
END $;
-- Deliberately no EXECUTE grant until a separately reviewed owner-bound function
-- has been installed and its full cryptographic input validation is tested.
COMMIT;
