-- EARTH-089: candidate PostgreSQL schema; not deployed.
-- Apply with a dedicated migration role. Runtime roles must not own these tables.
BEGIN;
CREATE SCHEMA IF NOT EXISTS earth_audit;
CREATE TABLE IF NOT EXISTS earth_audit.checkpoint (
  id integer PRIMARY KEY CHECK (id = 1),
  version bigint NOT NULL CHECK (version >= 0),
  chain_length bigint NOT NULL CHECK (chain_length >= 1),
  head_hash text NOT NULL CHECK (head_hash ~ '^[0-9a-f]{64}$')
);
CREATE TABLE IF NOT EXISTS earth_audit.review_record (
  record_index bigint PRIMARY KEY CHECK (record_index >= 0),
  previous_hash text CHECK (previous_hash IS NULL OR previous_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
  record_hash text NOT NULL UNIQUE CHECK (record_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION earth_audit.reject_record_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EARTH_AUDIT_APPEND_ONLY';
END $$;
DROP TRIGGER IF EXISTS review_record_no_update ON earth_audit.review_record;
CREATE TRIGGER review_record_no_update BEFORE UPDATE OR DELETE ON earth_audit.review_record
FOR EACH ROW EXECUTE FUNCTION earth_audit.reject_record_mutation();
-- The caller MUST use a transaction and compare-and-swap update with version predicate.
-- This table is not an independently trusted external checkpoint.
COMMIT;
