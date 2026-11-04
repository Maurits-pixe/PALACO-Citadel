-- EARTH-090: atomic checkpoint append candidate; NOT DEPLOYED.
-- Must be installed by migration role, not exposed directly to untrusted clients.
BEGIN;
CREATE OR REPLACE FUNCTION earth_audit.append_checkpoint_batch(
  p_expected_version bigint,
  p_expected_length bigint,
  p_expected_head text,
  p_records jsonb
) RETURNS TABLE(new_version bigint,new_length bigint,new_head text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, earth_audit
AS $$
DECLARE
  v earth_audit.checkpoint%ROWTYPE;
  item jsonb;
  idx bigint;
  prev text;
  rh text;
  receipt text;
  count_added bigint := 0;
BEGIN
  IF p_expected_version IS NULL OR p_expected_length IS NULL OR p_expected_head IS NULL
     OR p_records IS NULL OR jsonb_typeof(p_records) <> 'array'
     OR jsonb_array_length(p_records) = 0 OR jsonb_array_length(p_records) > 1000 THEN
    RAISE EXCEPTION 'EARTH_AUDIT_INVALID_BATCH';
  END IF;
  SELECT * INTO v FROM earth_audit.checkpoint WHERE id = 1 FOR UPDATE;
  IF NOT FOUND OR v.version <> p_expected_version OR v.chain_length <> p_expected_length
     OR v.head_hash <> p_expected_head THEN
    RAISE EXCEPTION 'EARTH_AUDIT_STALE_CHECKPOINT';
  END IF;
  idx := v.chain_length;
  prev := v.head_hash;
  FOR item IN SELECT value FROM jsonb_array_elements(p_records) LOOP
    IF jsonb_typeof(item) <> 'object' OR
       item->>'index' IS DISTINCT FROM idx::text OR
       item->>'previousHash' IS DISTINCT FROM prev OR
       COALESCE(item->>'receiptSHA256','') !~ '^[0-9a-f]{64}$' OR
       COALESCE(item->>'recordHash','') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'EARTH_AUDIT_INVALID_LINK';
    END IF;
    rh := item->>'recordHash';
    receipt := item->>'receiptSHA256';
    -- A trusted application must independently verify recordHash and receipt digest.
    INSERT INTO earth_audit.review_record(record_index,previous_hash,receipt_hash,record_hash)
    VALUES(idx,prev,receipt,rh);
    idx := idx + 1;
    prev := rh;
    count_added := count_added + 1;
  END LOOP;
  UPDATE earth_audit.checkpoint SET version = v.version + 1,
    chain_length = idx, head_hash = prev
  WHERE id = 1 AND version = v.version;
  IF NOT FOUND THEN RAISE EXCEPTION 'EARTH_AUDIT_CONCURRENT_UPDATE'; END IF;
  RETURN QUERY SELECT v.version + 1, idx, prev;
END;
$$;
REVOKE ALL ON FUNCTION earth_audit.append_checkpoint_batch(bigint,bigint,text,jsonb) FROM PUBLIC;
COMMIT;
