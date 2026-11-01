-- EARTH-094: role-isolation candidate, disposable PostgreSQL only.
-- Run as the migration owner after EARTH-089 and EARTH-090.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='earth_audit_reader_ci') THEN
  CREATE ROLE earth_audit_reader_ci NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='earth_audit_writer_ci') THEN
  CREATE ROLE earth_audit_writer_ci NOLOGIN;
 END IF;
END $$;
REVOKE ALL ON SCHEMA earth_audit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA earth_audit FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA earth_audit FROM PUBLIC;
GRANT USAGE ON SCHEMA earth_audit TO earth_audit_reader_ci, earth_audit_writer_ci;
GRANT SELECT ON earth_audit.checkpoint,earth_audit.review_record TO earth_audit_reader_ci,earth_audit_writer_ci;
GRANT INSERT ON earth_audit.review_record TO earth_audit_writer_ci;
GRANT UPDATE (version,chain_length,head_hash) ON earth_audit.checkpoint TO earth_audit_writer_ci;
GRANT EXECUTE ON FUNCTION earth_audit.append_checkpoint_batch(bigint,bigint,text,jsonb) TO earth_audit_writer_ci;
COMMIT;
