export const GOVERNMENT_ID = 'PALACO-GOVERNMENT-12';
export const RATIFYING_SUBJECT = 'PALACO-HOOFDKANTOOR-CONSTITUTIONAL-RATIFICATION';
export const APPEAL_ROLE = 'PALACO-CONSTITUTIONAL-APPEAL-PANEL';
export const APPOINTMENT_FUNCTION = 'APPOINT_AMBASSADOR_SEATS';
export const SEAT_IDS = Object.freeze(Array.from({ length: 12 }, (_, i) => 'PALACO-AMB-' + String(i + 1).padStart(2, '0')));

const SHA256 = /^[a-f0-9]{64}$/;
const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unique = values => new Set(values).size === values.length;
const output = (decision, reason, extra = {}) => Object.freeze({ decision, reason, ...extra, authority_created: false, government_active: false });

function parseTime(value) {
  if (!nonEmpty(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function exactKeys(record, expected, label) {
  if (!isRecord(record)) throw new TypeError(label + ' must be an object');
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((k, i) => k !== wanted[i])) throw new TypeError(label + ' fields do not match contract');
}
function string(record, key) {
  if (!nonEmpty(record[key])) throw new TypeError(key + ' must be a non-empty string');
}
function nullableString(record, key) {
  if (record[key] !== null && !nonEmpty(record[key])) throw new TypeError(key + ' must be null or a non-empty string');
}

export function validateAppointmentMandate(record) {
  const fields = ['mandate_id','mandate_holder','holder_identity_ref','function','seat_scope','constitutional_basis_ref','policy_version','valid_from','valid_until','appointment_constraints','eligibility_requirements_ref','conflict_policy_ref','revocation_ref','audit_ref','provenance','status'];
  exactKeys(record, fields, 'appointment mandate');
  for (const key of ['mandate_id','holder_identity_ref','constitutional_basis_ref','policy_version','appointment_constraints','eligibility_requirements_ref','conflict_policy_ref','audit_ref','provenance']) string(record, key);
  nullableString(record, 'revocation_ref');
  if (record.mandate_holder !== 'HOOFDKANTOOR') throw new TypeError('mandate_holder must be HOOFDKANTOOR');
  if (record.function !== APPOINTMENT_FUNCTION) throw new TypeError('invalid appointment function');
  if (!Array.isArray(record.seat_scope) || record.seat_scope.length === 0 || !unique(record.seat_scope)) throw new TypeError('seat_scope must be a non-empty unique array');
  if (record.seat_scope.some(seat => !SEAT_IDS.includes(seat))) throw new TypeError('seat_scope contains unknown seat');
  if (!['DRAFT','ACTIVE','SUSPENDED','REVOKED','EXPIRED'].includes(record.status)) throw new TypeError('invalid mandate status');
  const from = parseTime(record.valid_from);
  const until = parseTime(record.valid_until);
  if (from === null || until === null || until <= from) throw new TypeError('invalid mandate validity window');
  return Object.freeze({ ...record, seat_scope: Object.freeze([...record.seat_scope]) });
}

export function evaluateAppointmentMandate(record, { at, revocation_checked } = {}) {
  const mandate = validateAppointmentMandate(record);
  const now = parseTime(at);
  if (now === null) return output('IN_DOUBT', 'INVALID_EVALUATION_TIME');
  if (revocation_checked !== true) return output('IN_DOUBT', 'REVOCATION_NOT_CHECKED');
  if (mandate.status === 'REVOKED') return output('MANDATE_REVOKED', 'STATUS_REVOKED');
  if (mandate.status !== 'ACTIVE') return output('APPOINTMENT_HOLD', 'STATUS_' + mandate.status);
  if (now < parseTime(mandate.valid_from) || now >= parseTime(mandate.valid_until)) return output('APPOINTMENT_HOLD', 'OUTSIDE_VALIDITY_WINDOW');
  if (mandate.revocation_ref !== null) return output('APPOINTMENT_HOLD', 'REVOCATION_REFERENCE_PRESENT');
  return output('MANDATE_ELIGIBLE_FOR_RECORDING', 'SCOPED_MANDATE_VALID');
}

export function validateMandateRegistry(snapshot) {
  exactKeys(snapshot, ['registry_id','schema_version','provenance','records'], 'mandate registry');
  string(snapshot, 'registry_id');
  string(snapshot, 'provenance');
  if (snapshot.schema_version !== 'PALACO-GOV-MANDATE-REGISTRY-0.1') throw new TypeError('unsupported registry schema_version');
  if (!Array.isArray(snapshot.records)) throw new TypeError('registry records must be an array');
  const records = snapshot.records.map(validateAppointmentMandate);
  if (!unique(records.map(r => r.mandate_id))) throw new TypeError('duplicate mandate_id');
  return Object.freeze({ ...snapshot, records: Object.freeze(records) });
}

export function evaluateMandateFromRegistry(snapshot, { mandate_id, seat_id, at, revocation_checked } = {}) {
  const registry = validateMandateRegistry(snapshot);
  if (!nonEmpty(mandate_id)) return output('IN_DOUBT', 'MANDATE_ID_REQUIRED');
  const mandate = registry.records.find(r => r.mandate_id === mandate_id);
  if (!mandate) return output('APPOINTMENT_HOLD', 'MANDATE_NOT_FOUND');
  if (!nonEmpty(seat_id) || !mandate.seat_scope.includes(seat_id)) return output('APPOINTMENT_HOLD', 'SEAT_OUT_OF_SCOPE');
  return evaluateAppointmentMandate(mandate, { at, revocation_checked });
}

export function validateRatificationRecord(record) {
  const fields = ['ratification_id','ratifying_subject','ratifying_identity_ref','ratification_mandate_ref','government_id','competence_id','instrument_version','instrument_digest','constitutional_basis_ref','independent_review_ref','conflict_review_ref','dissent_refs','in_doubt_status','decision','effective_recorded_at','expires_at','revocation_ref','appeal_ref','audit_ref','provenance','signature_or_attestation_ref'];
  exactKeys(record, fields, 'ratification record');
  for (const key of ['ratification_id','ratifying_identity_ref','ratification_mandate_ref','competence_id','instrument_version','constitutional_basis_ref','independent_review_ref','conflict_review_ref','audit_ref','provenance','signature_or_attestation_ref']) string(record, key);
  for (const key of ['expires_at','revocation_ref','appeal_ref']) nullableString(record, key);
  if (record.ratifying_subject !== RATIFYING_SUBJECT) throw new TypeError('invalid ratifying_subject');
  if (record.government_id !== GOVERNMENT_ID) throw new TypeError('invalid government_id');
  if (!SHA256.test(record.instrument_digest)) throw new TypeError('instrument_digest must be lowercase sha256');
  if (!Array.isArray(record.dissent_refs) || record.dissent_refs.some(ref => !nonEmpty(ref))) throw new TypeError('invalid dissent_refs');
  if (typeof record.in_doubt_status !== 'boolean') throw new TypeError('in_doubt_status must be boolean');
  if (!['RATIFIED_NOT_ACTIVE','REJECTED','IN_DOUBT'].includes(record.decision)) throw new TypeError('invalid ratification decision');
  const effective = parseTime(record.effective_recorded_at);
  const expires = record.expires_at === null ? null : parseTime(record.expires_at);
  if (effective === null) throw new TypeError('invalid effective_recorded_at');
  if (record.expires_at !== null && expires === null) throw new TypeError('invalid expires_at');
  if (expires !== null && expires <= effective) throw new TypeError('expires_at must be later than effective_recorded_at');
  return Object.freeze({ ...record, dissent_refs: Object.freeze([...record.dissent_refs]) });
}

export function evaluateRatification(record, evidence = {}) {
  const ratification = validateRatificationRecord(record);
  if (!nonEmpty(evidence.instrument_digest) || evidence.instrument_digest !== ratification.instrument_digest) return output('HOLD', 'INSTRUMENT_DIGEST_MISMATCH');
  if (ratification.decision === 'IN_DOUBT' || ratification.in_doubt_status === true) return output('IN_DOUBT', 'RECORDED_IN_DOUBT');
  if (ratification.decision === 'REJECTED') return output('REJECTED', 'RECORDED_REJECTION');
  const evaluatedAt = parseTime(evidence.evaluated_at);
  if (evaluatedAt === null) return output('IN_DOUBT', 'INVALID_EVALUATION_TIME');
  if (evaluatedAt < parseTime(ratification.effective_recorded_at)) return output('HOLD', 'RATIFICATION_NOT_YET_EFFECTIVE');
  if (ratification.expires_at !== null && evaluatedAt >= parseTime(ratification.expires_at)) return output('HOLD', 'RATIFICATION_EXPIRED');
  const required = ['independent_review_complete','reviewer_eligible','conflicts_complete','dissent_preserved','constitutional_objections_dispositioned','ratifying_identity_valid','ratification_mandate_valid','revocation_checked','provenance_complete'];
  for (const key of required) if (evidence[key] !== true) return output('HOLD', 'MISSING_' + key.toUpperCase());
  if (evidence.unresolved_material_objection === true) return output('IN_DOUBT', 'UNRESOLVED_MATERIAL_OBJECTION');
  if (ratification.revocation_ref !== null) return output('HOLD', 'REVOCATION_REFERENCE_PRESENT');
  return output('RATIFIED_NOT_ACTIVE', 'ALL_RATIFICATION_PRECONDITIONS_MET');
}

export function validateAppealPanel(panel) {
  exactKeys(panel, ['panel_id','role','members','policy_version','provenance'], 'appeal panel');
  string(panel, 'panel_id');
  string(panel, 'policy_version');
  string(panel, 'provenance');
  if (panel.role !== APPEAL_ROLE) throw new TypeError('invalid appeal role');
  if (!Array.isArray(panel.members) || panel.members.length < 3) throw new TypeError('appeal panel requires at least three members');
  const members = panel.members.map(member => {
    exactKeys(member, ['member_id','identity_ref','status','conflict_status'], 'appeal member');
    string(member, 'member_id');
    string(member, 'identity_ref');
    if (!['ACTIVE','SUSPENDED','REVOKED','EXPIRED'].includes(member.status)) throw new TypeError('invalid appeal member status');
    if (!['CLEAR','CONFLICT','UNKNOWN'].includes(member.conflict_status)) throw new TypeError('invalid conflict status');
    return Object.freeze({ ...member });
  });
  if (!unique(members.map(m => m.member_id))) throw new TypeError('duplicate appeal member');
  if (!unique(members.map(m => m.identity_ref))) throw new TypeError('duplicate appeal identity');
  return Object.freeze({ ...panel, members: Object.freeze(members) });
}

export function evaluateAppealPanelEligibility(panel, challenge = {}) {
  const value = validateAppealPanel(panel);
  for (const key of ['original_reviewer_ids','original_tally_verifier_ids']) {
    const list = challenge[key];
    if (list !== undefined && (!Array.isArray(list) || list.some(v => !nonEmpty(v)) || !unique(list))) return output('IN_DOUBT', 'INVALID_CHALLENGE_CONTEXT');
  }
  for (const key of ['original_author_id','challenged_decision_maker_id']) {
    if (challenge[key] !== undefined && !nonEmpty(challenge[key])) return output('IN_DOUBT', 'INVALID_CHALLENGE_CONTEXT');
  }
  const excluded = new Set([challenge.original_author_id, challenge.challenged_decision_maker_id, ...(challenge.original_reviewer_ids || []), ...(challenge.original_tally_verifier_ids || [])].filter(nonEmpty));
  const eligible = value.members.filter(m => m.status === 'ACTIVE' && m.conflict_status === 'CLEAR' && !excluded.has(m.member_id));
  const blocked = value.members.filter(m => !eligible.includes(m));
  const extra = { eligible_member_ids: eligible.map(m => m.member_id), blocked_member_ids: blocked.map(m => m.member_id) };
  if (value.members.some(m => m.conflict_status === 'UNKNOWN')) return output('IN_DOUBT', 'UNKNOWN_MEMBER_CONFLICT', extra);
  if (eligible.length < 3) return output('INELIGIBLE', 'FEWER_THAN_THREE_ELIGIBLE_MEMBERS', extra);
  return output('ELIGIBLE', 'THREE_OR_MORE_INDEPENDENT_MEMBERS', extra);
}
