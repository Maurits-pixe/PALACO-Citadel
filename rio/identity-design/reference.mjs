// Offline synthetic design consistency only. No input or result authorizes a person.
export const SCHEMA_VERSION = 'palaco-identity-design/0.1';
export const MODE = 'DESIGN_ONLY';
export const DECISION_STATUS = 'ADVISORY_HUMAN_DECISION_REQUIRED';
export const KNOWN_DESIGN_PERMISSIONS = Object.freeze([
  Object.freeze({ action: 'TST-ACTION-REVIEW', scope: 'TST-SCOPE-PROJECT-DRAFT' }),
  Object.freeze({ action: 'TST-ACTION-COMMENT', scope: 'TST-SCOPE-PROJECT-DRAFT' }),
]);

const LIMITS = Object.freeze({ persons: 32, groups: 32, bindings: 32, sessions: 64, memberships: 64, receipts: 64, permissions: 8 });
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const PATTERNS = Object.freeze({
  person: /^TST-PERSON-[A-Z0-9][A-Z0-9-]{0,47}$/,
  group: /^TST-(?:GROUP|PROJECT)-[A-Z0-9][A-Z0-9-]{0,47}$/,
  provider: /^TST-PROVIDER-[A-Z0-9][A-Z0-9-]{0,47}$/,
  user: /^TST-PROVIDER-USER-[A-Z0-9][A-Z0-9-]{0,47}$/,
  session: /^TST-SESSION-[A-Z0-9][A-Z0-9-]{0,47}$/,
  membership: /^TST-MEMBERSHIP-[A-Z0-9][A-Z0-9-]{0,47}$/,
  audit: /^TST-AUDIT-[A-Z0-9][A-Z0-9-]{0,47}$/,
});
const SNAPSHOT_KEYS = ['schemaVersion', 'mode', 'decisionStatus', 'oauthEnabled', 'accountActive',
  'canOpenContact', 'operativeAuthority', 'persons', 'groups', 'providerBindings', 'sessions', 'memberships', 'historicalReceipts'];
const ACTION_KEYS = ['session_ref', 'claimed_actor_person_id', 'shared_palaco_id', 'provider',
  'provider_user_ref', 'action', 'scope', 'at_ms', 'audit_ref'];
const RECEIPT_KEYS = ['mode', 'decisionStatus', 'canAuthorize', 'session_ref', 'action', 'scope',
  'at_ms', 'audit_ref', 'actor_person_id', 'shared_palaco_id', 'provider', 'provider_user_ref'];

function invalid() { throw new Error('INVALID_DESIGN_INPUT'); }

// Read only own data descriptors. Accessors, inherited fields, classes and symbols are rejected.
function record(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) invalid();
  const result = Object.create(null);
  for (const name of names) {
    const property = Object.getOwnPropertyDescriptor(value, name);
    if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) invalid();
    result[name] = property.value;
  }
  return result;
}

function list(value, minimum, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isInteger(length) || length < minimum || length > maximum) invalid();
  if (Reflect.ownKeys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) invalid();
    result.push(property.value);
  }
  return result;
}

function ref(value, kind) {
  if (typeof value !== 'string' || value.length > 80 || !PATTERNS[kind].test(value)) invalid();
  return value;
}
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMESTAMP) invalid();
  return value;
}
function permission(action, scope) {
  return typeof action === 'string' && typeof scope === 'string'
    && KNOWN_DESIGN_PERMISSIONS.some(item => item.action === action && item.scope === scope);
}
function pair(left, right) { return JSON.stringify([left, right]); }
function unique(map, key, value) {
  if (map.has(key)) invalid();
  map.set(key, value);
}
function closed(value) {
  if (value.mode !== MODE || value.decisionStatus !== DECISION_STATUS || value.canAuthorize !== false) invalid();
}

function normalizedSnapshot(input) {
  const source = record(input, SNAPSHOT_KEYS);
  if (source.schemaVersion !== SCHEMA_VERSION || source.mode !== MODE || source.decisionStatus !== DECISION_STATUS
      || source.oauthEnabled !== false || source.accountActive !== false || source.canOpenContact !== false
      || source.operativeAuthority !== 'NONE') invalid();
  const persons = new Map();
  for (const candidate of list(source.persons, 1, LIMITS.persons)) {
    const person = record(candidate, ['person_id', 'identity_status']);
    ref(person.person_id, 'person');
    if (person.identity_status !== 'UNVERIFIED_FIXTURE') invalid();
    unique(persons, person.person_id, person);
  }
  const groups = new Map();
  for (const candidate of list(source.groups, 1, LIMITS.groups)) {
    const group = record(candidate, ['shared_palaco_id', 'kind', 'status']);
    ref(group.shared_palaco_id, 'group');
    if (!['GROUP', 'PROJECT'].includes(group.kind) || group.status !== MODE
        || !group.shared_palaco_id.startsWith(`TST-${group.kind}-`)) invalid();
    unique(groups, group.shared_palaco_id, group);
  }
  const bindings = new Map();
  const boundPersons = new Set();
  for (const candidate of list(source.providerBindings, 1, LIMITS.bindings)) {
    const binding = record(candidate, ['person_id', 'provider', 'provider_user_ref', 'status']);
    ref(binding.person_id, 'person'); ref(binding.provider, 'provider'); ref(binding.provider_user_ref, 'user');
    if (!persons.has(binding.person_id) || boundPersons.has(binding.person_id) || binding.status !== 'UNVERIFIED_FIXTURE') invalid();
    unique(bindings, pair(binding.provider, binding.provider_user_ref), binding);
    boundPersons.add(binding.person_id);
  }
  // v0.1 intentionally admits no automatic account linking or multiple provider aliases per person.
  if (boundPersons.size !== persons.size) invalid();
  const sessions = new Map();
  for (const candidate of list(source.sessions, 1, LIMITS.sessions)) {
    const session = record(candidate, ['session_ref', 'person_id', 'provider', 'provider_user_ref', 'status']);
    ref(session.session_ref, 'session'); ref(session.person_id, 'person');
    ref(session.provider, 'provider'); ref(session.provider_user_ref, 'user');
    if (!['ACTIVE', 'CLOSED'].includes(session.status)
        || bindings.get(pair(session.provider, session.provider_user_ref))?.person_id !== session.person_id) invalid();
    unique(sessions, session.session_ref, session);
  }
  const memberships = new Map();
  const edges = new Map();
  for (const candidate of list(source.memberships, 1, LIMITS.memberships)) {
    const member = record(candidate, ['membership_id', 'person_id', 'shared_palaco_id', 'status', 'permissions']);
    ref(member.membership_id, 'membership'); ref(member.person_id, 'person'); ref(member.shared_palaco_id, 'group');
    if (!persons.has(member.person_id) || !groups.has(member.shared_palaco_id) || !['ACTIVE', 'REVOKED'].includes(member.status)) invalid();
    const permissions = [];
    const seen = new Set();
    for (const candidatePermission of list(member.permissions, 0, LIMITS.permissions)) {
      const item = record(candidatePermission, ['action', 'scope']);
      if (!permission(item.action, item.scope)) invalid();
      const key = pair(item.action, item.scope);
      if (seen.has(key)) invalid();
      seen.add(key);
      permissions.push(item);
    }
    member.permissions = permissions;
    unique(memberships, member.membership_id, member);
    unique(edges, pair(member.person_id, member.shared_palaco_id), member);
  }
  const historicalReceipts = new Map();
  for (const candidate of list(source.historicalReceipts, 0, LIMITS.receipts)) {
    const receipt = record(candidate, RECEIPT_KEYS);
    closed(receipt);
    ref(receipt.audit_ref, 'audit'); ref(receipt.session_ref, 'session'); ref(receipt.actor_person_id, 'person');
    ref(receipt.shared_palaco_id, 'group'); ref(receipt.provider, 'provider'); ref(receipt.provider_user_ref, 'user');
    timestamp(receipt.at_ms);
    const session = sessions.get(receipt.session_ref);
    if (!permission(receipt.action, receipt.scope) || !session
        || session.person_id !== receipt.actor_person_id || session.provider !== receipt.provider
        || session.provider_user_ref !== receipt.provider_user_ref
        || !groups.has(receipt.shared_palaco_id) || !edges.has(pair(receipt.actor_person_id, receipt.shared_palaco_id))) invalid();
    // Historical consistency is independent of today's membership/session state.
    // These user-supplied JSON records prove no append-only storage, signature or event occurrence.
    unique(historicalReceipts, receipt.audit_ref, receipt);
  }
  return { persons, groups, bindings, sessions, memberships, edges, historicalReceipts };
}

function validation(valid) {
  return Object.freeze({ schemaVersion: SCHEMA_VERSION, mode: MODE, decisionStatus: DECISION_STATUS,
    valid, canAuthorize: false, reason: valid ? 'VALID_DESIGN_SNAPSHOT' : 'INVALID_SNAPSHOT' });
}

/** Validate only bounded synthetic reference consistency; this never establishes identity or permission. */
export function validateDesignSnapshot(snapshot) {
  try { normalizedSnapshot(snapshot); return validation(true); } catch { return validation(false); }
}

function inspection(reason, receipt = null) {
  return Object.freeze({ schemaVersion: SCHEMA_VERSION, mode: MODE, decisionStatus: DECISION_STATUS,
    designMatch: receipt !== null, canAuthorize: false, reason, receipt });
}

/**
 * Inspect a proposed synthetic action without executing, persisting or authorizing it.
 * session_ref is an offline reference, never a raw cookie, token or authenticated capability.
 * claimed_actor_person_id must be explicitly null (no claim) or match the session-derived person.
 */
export function inspectDesignAction(snapshot, proposedAction) {
  let design;
  try { design = normalizedSnapshot(snapshot); } catch { return inspection('INVALID_SNAPSHOT'); }
  let action;
  try {
    action = record(proposedAction, ACTION_KEYS);
    ref(action.session_ref, 'session'); ref(action.shared_palaco_id, 'group');
    ref(action.provider, 'provider'); ref(action.provider_user_ref, 'user'); ref(action.audit_ref, 'audit');
    timestamp(action.at_ms);
    if (!permission(action.action, action.scope)) invalid();
    if (action.claimed_actor_person_id !== null && !design.groups.has(action.claimed_actor_person_id)) ref(action.claimed_actor_person_id, 'person');
  } catch { return inspection('INVALID_ACTION'); }
  if (design.groups.has(action.claimed_actor_person_id)) return inspection('GROUP_CANNOT_ACT');
  const session = design.sessions.get(action.session_ref);
  if (!session) return inspection('SESSION_UNKNOWN');
  if (session.status !== 'ACTIVE') return inspection('SESSION_NOT_ACTIVE');
  const actor = session.person_id;
  if (action.claimed_actor_person_id !== null && action.claimed_actor_person_id !== actor) return inspection('ACTOR_SESSION_MISMATCH');
  if (session.provider !== action.provider || session.provider_user_ref !== action.provider_user_ref
      || design.bindings.get(pair(action.provider, action.provider_user_ref))?.person_id !== actor) return inspection('PROVIDER_SESSION_MISMATCH');
  if (!design.groups.has(action.shared_palaco_id)) return inspection('GROUP_UNKNOWN');
  const member = design.edges.get(pair(actor, action.shared_palaco_id));
  if (!member) return inspection('MEMBERSHIP_REQUIRED');
  if (member.status !== 'ACTIVE') return inspection('MEMBERSHIP_NOT_ACTIVE');
  if (!member.permissions.some(item => item.action === action.action && item.scope === action.scope)) return inspection('PERMISSION_REQUIRED');
  if (design.historicalReceipts.has(action.audit_ref)) return inspection('AUDIT_REFERENCE_REUSED');
  const receipt = Object.freeze({ mode: MODE, decisionStatus: DECISION_STATUS, canAuthorize: false,
    session_ref: session.session_ref, action: action.action, scope: action.scope, at_ms: action.at_ms,
    audit_ref: action.audit_ref, actor_person_id: actor, shared_palaco_id: member.shared_palaco_id,
    provider: session.provider, provider_user_ref: session.provider_user_ref });
  return inspection('SIMULATED_DESIGN_MATCH', receipt);
}
