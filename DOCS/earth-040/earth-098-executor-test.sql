-- EARTH-098: isolated role boundary negative tests.
-- Apply after EARTH-089, EARTH-090, EARTH-097 on disposable PostgreSQL.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE r text := 'earth_audit_executor';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r AND rolcanlogin=false AND rolbypassrls=false AND rolsuper=false) THEN
  RAISE EXCEPTION 'EARTH098_EXECUTOR_ROLE_INVALID';
 END IF;
 IF has_schema_privilege(r,'earth_audit','USAGE')
 OR has_table_privilege(r,'earth_audit.checkpoint','SELECT')
 OR has_table_privilege(r,'earth_audit.checkpoint','UPDATE')
 OR has_table_privilege(r,'earth_audit.review_record','INSERT')
 OR has_table_privilege(r,'earth_audit.review_record','UPDATE')
 OR has_table_privilege(r,'earth_audit.review_record','DELETE')
 OR has_function_privilege(r,'earth_audit.append_checkpoint_batch(bigint,bigint,text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'EARTH098_EXECUTOR_HAS_PREMATURE_AUTHORITY';
 END IF;
END $$;
ROLLBACK;
