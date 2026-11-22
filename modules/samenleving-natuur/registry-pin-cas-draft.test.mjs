import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('./registry-pin-cas-draft.sql', import.meta.url),'utf8');

test('draft declares a private scope and no automatic activation',()=>{
  assert.match(source,/CREATE SCHEMA IF NOT EXISTS citadel_pin_draft/);
  assert.match(source,/REVOKE ALL ON SCHEMA citadel_pin_draft FROM PUBLIC/);
  assert.match(source,/DO NOT APPLY WITHOUT OWNER-GOVERNED SECURITY REVIEW/);
});
test('both tables are FORCE RLS and do not grant public access',()=>{
  for(const name of ['pin_state','pin_history']) {
    assert.ok(source.includes('ALTER TABLE citadel_pin_draft.'+name+' ENABLE ROW LEVEL SECURITY;'));
    assert.ok(source.includes('ALTER TABLE citadel_pin_draft.'+name+' FORCE ROW LEVEL SECURITY;'));
  }
  assert.match(source,/REVOKE ALL ON ALL TABLES IN SCHEMA citadel_pin_draft FROM PUBLIC/);
  assert.doesNotMatch(source,/\bGRANT\s+(?:INSERT|UPDATE|DELETE|EXECUTE)\b/i);
});
test('pin history forbids update and delete through trigger',()=>{
  assert.match(source,/BEFORE UPDATE OR DELETE ON citadel_pin_draft\.pin_history/);
  assert.match(source,/PALACO_CITADEL_AUDIT_IMMUTABLE/);
  assert.match(source,/PRIMARY KEY \(registry_key, sequence\)/);
});
test('CAS entry point remains hard-denied and revokes PUBLIC execute',()=>{
  assert.match(source,/PALACO_CITADEL_HOLD_NO_AUTHORIZED_WRITER/);
  assert.match(source,/REVOKE ALL ON FUNCTION citadel_pin_draft\.cas_pin_update_disabled\(\) FROM PUBLIC/);
  assert.match(source,/SECURITY INVOKER/);
});
test('state has revision, exact digest and ledger-head constraints',()=>{
  for(const name of ['registry_sha256','head_sha256','issuer_fingerprint']) {
    assert.match(source,new RegExp(name+' char\\(64\\) NOT NULL'));
  }
  assert.match(source,/revision bigint NOT NULL CHECK \(revision > 0\)/);
});

