-- EARTH-094: privileges are tested under SET ROLE (not table owner).
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF has_table_privilege('earth_audit_reader_ci','earth_audit.review_record','INSERT') OR
    has_table_privilege('earth_audit_reader_ci','earth_audit.checkpoint','UPDATE') OR
    has_function_privilege('earth_audit_reader_ci','earth_audit.append_checkpoint_batch(bigint,bigint,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'EARTH094_READER_OVERPRIVILEGED';
 END IF;
 IF has_table_privilege('earth_audit_writer_ci','earth_audit.review_record','UPDATE') OR
    has_table_privilege('earth_audit_writer_ci','earth_audit.review_record','DELETE') OR
    has_table_privilege('earth_audit_writer_ci','earth_audit.checkpoint','DELETE') OR
    NOT has_function_privilege('earth_audit_writer_ci','earth_audit.append_checkpoint_batch(bigint,bigint,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'EARTH094_WRITER_GRANTS_INVALID';
 END IF;
END $$;
ROLLBACK;
