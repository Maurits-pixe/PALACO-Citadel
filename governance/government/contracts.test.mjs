import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPEAL_ROLE, GOVERNMENT_ID, RATIFYING_SUBJECT, SEAT_IDS,
  evaluateAppointmentMandate, evaluateMandateFromRegistry, evaluateRatification,
  evaluateAppealPanelEligibility, validateAppointmentMandate, validateMandateRegistry,
  validateRatificationRecord, validateAppealPanel
} from './contracts.mjs';

const mandate = (overrides = {}) => ({
  mandate_id:'M-1', mandate_holder:'HOOFDKANTOOR', holder_identity_ref:'identity:hq-1',
  function:'APPOINT_AMBASSADOR_SEATS', seat_scope:[...SEAT_IDS], constitutional_basis_ref:'issue:#52',
  policy_version:'GO-GOV-12-004-v0.1', valid_from:'2026-11-01T00:00:00Z', valid_until:'2027-11-01T00:00:00Z',
  appointment_constraints:'one-person-one-seat', eligibility_requirements_ref:'policy:ambassador-eligibility-v0.1',
  conflict_policy_ref:'policy:conflict-v0.1', revocation_ref:null, audit_ref:'audit:mandate-1',
  provenance:'fixture', status:'ACTIVE', ...overrides
});

const ratification = (overrides = {}) => ({
  ratification_id:'R-1', ratifying_subject:RATIFYING_SUBJECT, ratifying_identity_ref:'identity:hq-ratifier-1',
  ratification_mandate_ref:'mandate:ratify-1', government_id:GOVERNMENT_ID, competence_id:'COMP-1',
  instrument_version:'1.0.0', instrument_digest:'a'.repeat(64), constitutional_basis_ref:'issue:#52',
  independent_review_ref:'review:independent-1', conflict_review_ref:'conflict:1', dissent_refs:['dissent:1'],
  in_doubt_status:false, decision:'RATIFIED_NOT_ACTIVE', effective_recorded_at:'2026-11-02T00:00:00Z',
  expires_at:null, revocation_ref:null, appeal_ref:null, audit_ref:'audit:ratification-1',
  provenance:'fixture', signature_or_attestation_ref:'attestation:1', ...overrides
});

const evidence = (overrides = {}) => ({
  instrument_digest:'a'.repeat(64), independent_review_complete:true, reviewer_eligible:true,
  conflicts_complete:true, dissent_preserved:true, constitutional_objections_dispositioned:true,
  ratifying_identity_valid:true, ratification_mandate_valid:true, revocation_checked:true,
  provenance_complete:true, unresolved_material_objection:false, ...overrides
});

const panel = (overrides = {}) => ({
  panel_id:'PANEL-1', role:APPEAL_ROLE, policy_version:'GO-GOV-12-004-v0.1', provenance:'fixture',
  members:[
    {member_id:'A',identity_ref:'identity:A',status:'ACTIVE',conflict_status:'CLEAR'},
    {member_id:'B',identity_ref:'identity:B',status:'ACTIVE',conflict_status:'CLEAR'},
    {member_id:'C',identity_ref:'identity:C',status:'ACTIVE',conflict_status:'CLEAR'}
  ], ...overrides
});

test('appointment mandate is scoped and never creates authority', () => {
  const value = validateAppointmentMandate(mandate());
  assert.equal(value.seat_scope.length, 12);
  const r = evaluateAppointmentMandate(value, {at:'2026-12-01T00:00:00Z',revocation_checked:true});
  assert.equal(r.decision, 'MANDATE_ELIGIBLE_FOR_RECORDING');
  assert.equal(r.authority_created, false);
  assert.equal(r.government_active, false);
});

test('appointment mandate fails closed on revocation uncertainty, revoked status and unknown seat', () => {
  assert.equal(evaluateAppointmentMandate(mandate(), {at:'2026-12-01T00:00:00Z',revocation_checked:false}).decision, 'IN_DOUBT');
  assert.equal(evaluateAppointmentMandate(mandate({status:'REVOKED',revocation_ref:'revoke:1'}), {at:'2026-12-01T00:00:00Z',revocation_checked:true}).decision, 'MANDATE_REVOKED');
  assert.throws(() => validateAppointmentMandate(mandate({seat_scope:['PALACO-AMB-99']})), /unknown seat/);
});

test('mandate registry rejects duplicate IDs and binds lookup to exact seat', () => {
  const registry = {registry_id:'HQ-MANDATES-1',schema_version:'PALACO-GOV-MANDATE-REGISTRY-0.1',provenance:'fixture',records:[mandate()]};
  assert.equal(validateMandateRegistry(registry).records.length, 1);
  assert.throws(() => validateMandateRegistry({...registry,records:[mandate(),mandate()]}), /duplicate mandate_id/);
  const ok = evaluateMandateFromRegistry(registry,{mandate_id:'M-1',seat_id:'PALACO-AMB-01',at:'2026-12-01T00:00:00Z',revocation_checked:true});
  assert.equal(ok.decision,'MANDATE_ELIGIBLE_FOR_RECORDING');
  assert.equal(evaluateMandateFromRegistry(registry,{mandate_id:'M-1',seat_id:'PALACO-AMB-99',at:'2026-12-01T00:00:00Z',revocation_checked:true}).decision,'APPOINTMENT_HOLD');
});

test('ratification reaches RATIFIED_NOT_ACTIVE only with exact complete evidence', () => {
  const r = evaluateRatification(validateRatificationRecord(ratification()), evidence());
  assert.equal(r.decision, 'RATIFIED_NOT_ACTIVE');
  assert.equal(r.authority_created, false);
  assert.equal(r.government_active, false);
});

test('ratification fails closed on digest drift, missing independent review and objection', () => {
  assert.equal(evaluateRatification(ratification(), evidence({instrument_digest:'b'.repeat(64)})).decision, 'HOLD');
  assert.match(evaluateRatification(ratification(), evidence({independent_review_complete:false})).reason, /INDEPENDENT_REVIEW/);
  assert.equal(evaluateRatification(ratification(), evidence({unresolved_material_objection:true})).decision, 'IN_DOUBT');
});

test('ratification rejects Government self-ratifier identity and schema drift', () => {
  assert.throws(() => validateRatificationRecord(ratification({ratifying_subject:GOVERNMENT_ID})), /ratifying_subject/);
  assert.throws(() => validateRatificationRecord({...ratification(),activation_authority:true}), /fields do not match/);
});

test('appeal panel requires at least three unique attributable members', () => {
  assert.equal(validateAppealPanel(panel()).members.length,3);
  assert.throws(() => validateAppealPanel(panel({members:panel().members.slice(0,2)})), /at least three/);
  assert.throws(() => validateAppealPanel(panel({members:[panel().members[0],panel().members[0],panel().members[2]]})), /duplicate/);
});

test('appeal eligibility excludes original actors and preserves unknown conflict as IN_DOUBT', () => {
  const excluded = evaluateAppealPanelEligibility(panel(),{original_author_id:'A'});
  assert.equal(excluded.decision,'INELIGIBLE');
  assert.deepEqual(excluded.eligible_member_ids,['B','C']);
  const unknownPanel = panel({members:[...panel().members,{member_id:'D',identity_ref:'identity:D',status:'ACTIVE',conflict_status:'UNKNOWN'}]});
  assert.equal(evaluateAppealPanelEligibility(unknownPanel).decision,'IN_DOUBT');
});

test('eligible appeal panel still creates no authority', () => {
  const r = evaluateAppealPanelEligibility(panel());
  assert.equal(r.decision,'ELIGIBLE');
  assert.equal(r.authority_created,false);
  assert.equal(r.government_active,false);
});


test('machine-readable schemas define every required field under additionalProperties false', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(readFileSync(new URL('./government-contracts.schema.json', import.meta.url), 'utf8'));
  for (const name of ['appointmentMandate','mandateRegistry','ratificationRecord','appealPanel']) {
    const def = schema.$defs[name];
    assert.equal(def.additionalProperties, false, name);
    for (const key of def.required) assert.ok(def.properties[key], name + ' missing property ' + key);
  }
  const member = schema.$defs.appealPanel.properties.members.items;
  assert.equal(member.additionalProperties, false);
  for (const key of member.required) assert.ok(member.properties[key], 'appeal member missing property ' + key);
});
