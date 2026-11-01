-- EARTH-091: isolated psql integration test; requires EARTH-089 and EARTH-090 migrations.
-- Run only on disposable PostgreSQL database; all test writes are rolled back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO earth_audit.checkpoint(id,version,chain_length,head_hash)
VALUES (1,0,1,repeat('a',64));
INSERT INTO earth_audit.review_record(record_index,previous_hash,receipt_hash,record_hash)
VALUES (0,NULL,repeat('b',64),repeat('a',64));

DO $$
DECLARE
  result record;
  failed boolean;
  current_version bigint;
  n bigint;
BEGIN
  SELECT * INTO result FROM earth_audit.append_checkpoint_batch(
    0,1,repeat('a',64),
    jsonb_build_array(jsonb_build_object('index',1,'previousHash',repeat('a',64),
      'receiptSHA256',repeat('c',64),'recordHash',repeat('d',64))));
  IF result.new_version <> 1 OR result.new_length <> 2 OR result.new_head <> repeat('d',64) THEN
    RAISE EXCEPTION 'EARTH091_VALID_APPEND_FAILED';
  END IF;

  failed := false;
  BEGIN
    PERFORM earth_audit.append_checkpoint_batch(
      0,1,repeat('a',64),
      jsonb_build_array(jsonb_build_object('index',2,'previousHash',repeat('d',64),
        'receiptSHA256',repeat('e',64),'recordHash',repeat('f',64))));
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'EARTH091_STALE_WRITE_ACCEPTED'; END IF;

  failed := false;
  BEGIN
    PERFORM earth_audit.append_checkpoint_batch(
      1,2,repeat('d',64),
      jsonb_build_array(
        jsonb_build_object('index',2,'previousHash',repeat('d',64),
          'receiptSHA256',repeat('e',64),'recordHash',repeat('f',64)),
        jsonb_build_object('index',3,'previousHash','INVALID',
          'receiptSHA256',repeat('e',64),'recordHash',repeat('9',64))));
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'EARTH091_PARTIAL_BATCH_ACCEPTED'; END IF;
  SELECT version INTO current_version FROM earth_audit.checkpoint WHERE id=1;
  SELECT count(*) INTO n FROM earth_audit.review_record;
  IF current_version <> 1 OR n <> 2 THEN
    RAISE EXCEPTION 'EARTH091_ROLLBACK_FAILED';
  END IF;

  failed := false;
  BEGIN
    UPDATE earth_audit.review_record SET receipt_hash=repeat('0',64) WHERE record_index=1;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'EARTH091_APPEND_ONLY_UPDATE_BYPASS'; END IF;

  failed := false;
  BEGIN
    DELETE FROM earth_audit.review_record WHERE record_index=1;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'EARTH091_APPEND_ONLY_DELETE_BYPASS'; END IF;
END $$;
ROLLBACK;
