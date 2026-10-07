CREATE TABLE IF NOT EXISTS temporal_ledger (
  receipt_sequence BIGINT PRIMARY KEY CHECK (receipt_sequence > 0),
  receipt_hash TEXT NOT NULL UNIQUE,
  previous_receipt_hash TEXT NOT NULL,
  highest_trusted_time TIMESTAMPTZ NOT NULL,
  receipt_json JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS temporal_ledger_head (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  highest_receipt_sequence BIGINT NOT NULL,
  head_receipt_hash TEXT NOT NULL,
  highest_trusted_time TIMESTAMPTZ
);
INSERT INTO temporal_ledger_head(singleton,highest_receipt_sequence,head_receipt_hash,highest_trusted_time)
VALUES(TRUE,0,'GENESIS',NULL) ON CONFLICT(singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION append_temporal_receipt(
  p_sequence BIGINT, p_hash TEXT, p_previous_hash TEXT, p_trusted_time TIMESTAMPTZ, p_receipt JSONB
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE h temporal_ledger_head%ROWTYPE;
BEGIN
  SELECT * INTO h FROM temporal_ledger_head WHERE singleton=TRUE FOR UPDATE;
  IF p_sequence <> h.highest_receipt_sequence + 1 THEN RAISE EXCEPTION 'NON_CONTIGUOUS_LEDGER_SEQUENCE'; END IF;
  IF p_previous_hash <> h.head_receipt_hash THEN RAISE EXCEPTION 'LEDGER_HEAD_MISMATCH'; END IF;
  IF h.highest_trusted_time IS NOT NULL AND p_trusted_time < h.highest_trusted_time THEN RAISE EXCEPTION 'LEDGER_TIME_ROLLBACK'; END IF;
  INSERT INTO temporal_ledger VALUES(p_sequence,p_hash,p_previous_hash,p_trusted_time,p_receipt);
  UPDATE temporal_ledger_head SET highest_receipt_sequence=p_sequence,head_receipt_hash=p_hash,highest_trusted_time=p_trusted_time WHERE singleton=TRUE;
  RETURN 'TEMPORAL_LEDGER_APPENDED';
END $$;