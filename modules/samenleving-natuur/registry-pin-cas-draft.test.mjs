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


test('TRUNCATE is blocked on the history and current-state tables',()=>{
  for(const table of ['pin_history','pin_state']) {
    assert.match(source,new RegExp('BEFORE TRUNCATE ON citadel_pin_draft\\.'+table));
    assert.match(source,new RegExp('DROP TRIGGER IF EXISTS '+table+'_no_truncate'));
  }
});
test('draft state cannot be inserted, updated or deleted via ordinary DML',()=>{
  assert.match(source,/BEFORE INSERT OR UPDATE OR DELETE ON citadel_pin_draft\.pin_state/);
  assert.match(source,/PALACO_CITADEL_PIN_STATE_FROZEN/);
  assert.match(source,/REVOKE ALL ON FUNCTION citadel_pin_draft\.reject_state_mutation\(\) FROM PUBLIC/);
});

test('every PL/pgSQL function has a paired full dollar-quote delimiter',()=>{
  const opens=[...source.matchAll(/SET search_path = pg_catalog, citadel_pin_draft AS \$\$/g)];
  const closes=[...source.matchAll(/^\$\$;$/gm)];
  assert.equal(opens.length,3,'all three functions must declare AS $$');
  assert.equal(closes.length,3,'all three function bodies must close with $$;');
  assert.doesNotMatch(source,/ AS \$(?!\$)/);
  assert.doesNotMatch(source,/^\$;$/m);
});
