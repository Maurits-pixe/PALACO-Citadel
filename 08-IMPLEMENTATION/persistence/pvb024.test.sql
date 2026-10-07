\set ON_ERROR_STOP on
\i 08-IMPLEMENTATION/persistence/pvb024.sql
SELECT append_temporal_receipt(1,'hash-1','GENESIS','2026-06-01T00:00:00Z','{"receipt":1}'::jsonb);
SELECT append_temporal_receipt(2,'hash-2','hash-1','2026-06-01T00:00:01Z','{"receipt":2}'::jsonb);
DO $$ BEGIN
  BEGIN PERFORM append_temporal_receipt(1,'old','GENESIS','2026-05-01T00:00:00Z','{}'); RAISE EXCEPTION 'G-0092 failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%NON_CONTIGUOUS_LEDGER_SEQUENCE%' THEN RAISE; END IF; END;
  BEGIN PERFORM append_temporal_receipt(3,'bad-parent','GENESIS','2026-06-01T00:00:02Z','{}'); RAISE EXCEPTION 'G-0093 failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LEDGER_HEAD_MISMATCH%' THEN RAISE; END IF; END;
  BEGIN PERFORM append_temporal_receipt(3,'rollback-time','hash-2','2026-05-01T00:00:00Z','{}'); RAISE EXCEPTION 'G-0094 failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LEDGER_TIME_ROLLBACK%' THEN RAISE; END IF; END;
END $$;
SELECT CASE WHEN highest_receipt_sequence=2 AND head_receipt_hash='hash-2' THEN 'G-0095 PASS' ELSE 'FAIL' END FROM temporal_ledger_head WHERE singleton=TRUE;
