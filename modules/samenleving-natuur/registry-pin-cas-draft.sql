-- PALACO CITADEL: INERT DRAFT schema for registry-pin transaction review.
-- DO NOT APPLY WITHOUT OWNER-GOVERNED SECURITY REVIEW.
-- No production credentials, grants, roles, or active CAS endpoints.
-- This file is NOT in migrations, and no tool executes it.
BEGIN;
CREATE SCHEMA IF NOT EXISTS citadel_pin_draft;
REVOKE ALL ON SCHEMA citadel_pin_draft FROM PUBLIC;

CREATE TABLE IF NOT EXISTS citadel_pin_draft.pin_state (
  registry_key text PRIMARY KEY,
  issuer_fingerprint char(64) NOT NULL CHECK (issuer_fingerprint ~ '^[0-9a-f]{64}$'),
  revision bigint NOT NULL CHECK (revision > 0),
  registry_sha256 char(64) NOT NULL CHECK (registry_sha256 ~ '^[0-9a-f]{64}$'),
  head_sha256 char(64) NOT NULL CHECK (head_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE IF NOT EXISTS citadel_pin_draft.pin_history (
  registry_key text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  previous_head_sha256 char(64) NOT NULL CHECK (previous_head_sha256 ~ '^[0-9a-f]{64}$'),
  new_head_sha256 char(64) NOT NULL CHECK (new_head_sha256 ~ '^[0-9a-f]{64}$'),
  from_revision bigint NOT NULL CHECK (from_revision > 0),
  to_revision bigint NOT NULL CHECK (to_revision > from_revision),
  from_registry_sha256 char(64) NOT NULL CHECK (from_registry_sha256 ~ '^[0-9a-f]{64}$'),
  to_registry_sha256 char(64) NOT NULL CHECK (to_registry_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (registry_key, sequence),
  UNIQUE (registry_key, new_head_sha256),
  FOREIGN KEY (registry_key) REFERENCES citadel_pin_draft.pin_state(registry_key)
);

ALTER TABLE citadel_pin_draft.pin_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE citadel_pin_draft.pin_state FORCE ROW LEVEL SECURITY;
ALTER TABLE citadel_pin_draft.pin_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE citadel_pin_draft.pin_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA citadel_pin_draft FROM PUBLIC;

-- Guard direct modification of append-only audit rows.
CREATE OR REPLACE FUNCTION citadel_pin_draft.reject_history_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, citadel_pin_draft AS $$
BEGIN
  RAISE EXCEPTION 'PALACO_CITADEL_AUDIT_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS pin_history_no_mutation ON citadel_pin_draft.pin_history;
CREATE TRIGGER pin_history_no_mutation
BEFORE UPDATE OR DELETE ON citadel_pin_draft.pin_history
FOR EACH ROW EXECUTE FUNCTION citadel_pin_draft.reject_history_mutation();

-- TRUNCATE does not fire row-level DELETE triggers; explicitly block it.
-- Both audit history and current pin state remain non-writable in HOLD.
CREATE TRIGGER pin_history_no_truncate
BEFORE TRUNCATE ON citadel_pin_draft.pin_history
FOR EACH STATEMENT EXECUTE FUNCTION citadel_pin_draft.reject_history_mutation();

CREATE OR REPLACE FUNCTION citadel_pin_draft.reject_state_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, citadel_pin_draft AS $
BEGIN
  RAISE EXCEPTION 'PALACO_CITADEL_PIN_STATE_FROZEN' USING ERRCODE = '42501';
END;
$;
CREATE TRIGGER pin_state_no_write
BEFORE INSERT OR UPDATE OR DELETE ON citadel_pin_draft.pin_state
FOR EACH ROW EXECUTE FUNCTION citadel_pin_draft.reject_state_mutation();
CREATE TRIGGER pin_state_no_truncate
BEFORE TRUNCATE ON citadel_pin_draft.pin_state
FOR EACH STATEMENT EXECUTE FUNCTION citadel_pin_draft.reject_state_mutation();
REVOKE ALL ON FUNCTION citadel_pin_draft.reject_state_mutation() FROM PUBLIC;

-- Deliberate execution barrier. This is not an activated CAS service.
-- Future review must establish authenticated dual approval, trusted time,
-- current revocation, and owner-governed privileges BEFORE replacing the barrier.
CREATE OR REPLACE FUNCTION citadel_pin_draft.cas_pin_update_disabled()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, citadel_pin_draft AS $$
BEGIN
  RAISE EXCEPTION 'PALACO_CITADEL_HOLD_NO_AUTHORIZED_WRITER' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION citadel_pin_draft.cas_pin_update_disabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION citadel_pin_draft.reject_history_mutation() FROM PUBLIC;
COMMIT;
