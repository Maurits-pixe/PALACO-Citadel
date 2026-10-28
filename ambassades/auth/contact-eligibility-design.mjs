// Offline signed fixture policy only: an eligible design result never opens chat or contact.
import { KeyObject } from 'node:crypto';
import { compactVerify } from 'jose';
import { validateDesignSnapshot, MODE, DECISION_STATUS } from '../../rio/identity-design/reference.mjs';

export const CONTACT_DESIGN = Object.freeze({
  schemaVersion: 'palaco-contact-eligibility-design/0.1',
  policyVersion: 'TST-CONTACT-ELIGIBILITY-0.1',
  issuer: 'TST-CONTACT-VERIFIER', audience: 'TST-PALACO-CHAT-ELIGIBILITY',
  kid: 'TST-CONTACT-KEY-01', algorithm: 'EdDSA', type: 'JWT',
  purpose: 'TST-CONFIRMED-CONTACT-CHAT', maxFixtureLifetimeSeconds: 300,
});
const MAX_TIME = 8_640_000_000_000_000;
const REGISTRY_KEYS = ['schemaVersion', 'policyVersion', 'mode', 'decisionStatus', 'oauthEnabled',
  'accountActive', 'canOpenContact', 'operativeAuthority', 'ppBindings', 'contactBindings'];
const REQUEST_KEYS = ['session_ref', 'claimed_actor_person_id', 'shared_palaco_id', 'pp_ref',
  'binding_ref', 'transport', 'now_ms', 'proof'];
const CLAIM_KEYS = ['iss', 'aud', 'jti', 'iat', 'exp', 'purpose', 'policy_version', 'person_id',
  'pp_ref', 'pp_revision', 'session_ref', 'provider', 'provider_user_ref', 'shared_palaco_id',
  'binding_ref', 'binding_revision', 'contact_kind', 'contact_ref', 'challenge_ref', 'contact_verified'];
const PATTERNS = Object.freeze({
  person: /^TST-PERSON-[A-Z0-9][A-Z0-9-]{0,47}$/,
  group: /^TST-(?:GROUP|PROJECT)-[A-Z0-9][A-Z0-9-]{0,47}$/,
  session: /^TST-SESSION-[A-Z0-9][A-Z0-9-]{0,47}$/,
  pp: /^TST-PP-[A-Z0-9][A-Z0-9-]{0,47}$/,
  binding: /^TST-CONTACT-BINDING-[A-Z0-9][A-Z0-9-]{0,47}$/,
  PHONE: /^TST-PHONE-[A-Z0-9][A-Z0-9-]{0,47}$/,
  EMAIL: /^TST-EMAIL-[A-Z0-9][A-Z0-9-]{0,47}$/,
  challenge: /^TST-CHALLENGE-[A-Z0-9][A-Z0-9-]{0,47}$/,
  proof: /^TST-PROOF-[A-Z0-9][A-Z0-9-]{0,47}$/,
});
function invalid() { throw new Error('INVALID_DESIGN_INPUT'); }
// Exact own data fields; never read a caller accessor or serialize an unvalidated object.
function record(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) invalid();
  const result = Object.create(null);
  for (const name of names) {
    const field = Object.getOwnPropertyDescriptor(value, name);
    if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
    result[name] = field.value;
  }
  return result;
}
function list(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isInteger(length) || length < 1 || length > maximum || Reflect.ownKeys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) invalid();
    result.push(field.value);
  }
  return result;
}
function ref(value, kind) {
  if (typeof value !== 'string' || value.length > 80 || !PATTERNS[kind].test(value)) invalid();
}
function revision(value) { if (!Number.isSafeInteger(value) || value < 1) invalid(); }
function add(map, key, value) { if (map.has(key)) invalid(); map.set(key, value); }
function own(value, name) {
  const field = Object.getOwnPropertyDescriptor(value, name);
  if (!field || !Object.hasOwn(field, 'value')) invalid();
  return field.value;
}
function registryContext(snapshot, input) {
  if (!validateDesignSnapshot(snapshot).valid) invalid();
  const source = record(input, REGISTRY_KEYS);
  if (source.schemaVersion !== CONTACT_DESIGN.schemaVersion || source.policyVersion !== CONTACT_DESIGN.policyVersion
      || source.mode !== MODE || source.decisionStatus !== DECISION_STATUS || source.oauthEnabled !== false
      || source.accountActive !== false || source.canOpenContact !== false || source.operativeAuthority !== 'NONE') invalid();
  const persons = new Set(list(own(snapshot, 'persons'), 32).map(item => own(item, 'person_id')));
  const pp = new Map(); const boundPersons = new Set();
  for (const candidate of list(source.ppBindings, 32)) {
    const item = record(candidate, ['pp_ref', 'person_id', 'revision', 'status']);
    ref(item.pp_ref, 'pp'); ref(item.person_id, 'person'); revision(item.revision);
    if (!persons.has(item.person_id) || boundPersons.has(item.person_id) || !['ACTIVE', 'REVOKED'].includes(item.status)) invalid();
    add(pp, item.pp_ref, item); boundPersons.add(item.person_id);
  }
  const contacts = new Map(); const contactRefs = new Set(); const challenges = new Set();
  for (const candidate of list(source.contactBindings, 64)) {
    const item = record(candidate, ['binding_ref', 'pp_ref', 'kind', 'contact_ref', 'revision', 'challenge_ref', 'status']);
    ref(item.binding_ref, 'binding'); ref(item.pp_ref, 'pp'); revision(item.revision); ref(item.challenge_ref, 'challenge');
    if (!['PHONE', 'EMAIL'].includes(item.kind)) invalid();
    ref(item.contact_ref, item.kind);
    if (!pp.has(item.pp_ref) || !['CONFIRMED', 'UNCONFIRMED', 'REVOKED'].includes(item.status)
        || contactRefs.has(item.contact_ref) || challenges.has(item.challenge_ref)) invalid();
    add(contacts, item.binding_ref, item); contactRefs.add(item.contact_ref); challenges.add(item.challenge_ref);
  }
  return { pp, contacts };
}
function requestData(input) {
  const request = record(input, REQUEST_KEYS);
  ref(request.session_ref, 'session'); ref(request.shared_palaco_id, 'group'); ref(request.pp_ref, 'pp');
  ref(request.binding_ref, 'binding');
  if (request.claimed_actor_person_id !== null) ref(request.claimed_actor_person_id, 'person');
  if (!['WIFI', 'MOBILE', 'OTHER'].includes(request.transport) || !Number.isSafeInteger(request.now_ms)
      || request.now_ms < 0 || request.now_ms > MAX_TIME) invalid();
  if (request.proof !== null && (typeof request.proof !== 'string' || request.proof.length > 8192
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(request.proof))) invalid();
  return Object.freeze(request);
}
function currentContext(snapshot, registry, request) {
  const design = registryContext(snapshot, registry);
  const sessions = list(own(snapshot, 'sessions'), 64).map(item => record(item,
    ['session_ref', 'person_id', 'provider', 'provider_user_ref', 'status']));
  const session = sessions.find(item => item.session_ref === request.session_ref);
  if (!session || session.status !== 'ACTIVE'
      || (request.claimed_actor_person_id !== null && request.claimed_actor_person_id !== session.person_id)) return null;
  const membership = list(own(snapshot, 'memberships'), 64).map(item => record(item,
    ['membership_id', 'person_id', 'shared_palaco_id', 'status', 'permissions']))
    .find(item => item.person_id === session.person_id && item.shared_palaco_id === request.shared_palaco_id);
  // Identity snapshot validation binds the session's provider pair to this person. REVIEW/COMMENT are not CHAT permissions.
  if (!membership || membership.status !== 'ACTIVE') return null;
  const pp = design.pp.get(request.pp_ref); const contact = design.contacts.get(request.binding_ref);
  if (!pp || pp.status !== 'ACTIVE' || pp.person_id !== session.person_id
      || !contact || contact.pp_ref !== pp.pp_ref || contact.status !== 'CONFIRMED') return null;
  return Object.freeze({ person_id: session.person_id, session_ref: session.session_ref, provider: session.provider,
    provider_user_ref: session.provider_user_ref, shared_palaco_id: membership.shared_palaco_id,
    membership_id: membership.membership_id, pp_ref: pp.pp_ref, pp_revision: pp.revision,
    binding_ref: contact.binding_ref, binding_revision: contact.revision, contact_kind: contact.kind,
    contact_ref: contact.contact_ref, challenge_ref: contact.challenge_ref });
}
function claimsMatch(payload, context, now) {
  const claims = record(payload, CLAIM_KEYS);
  ref(claims.jti, 'proof');
  if (claims.iss !== CONTACT_DESIGN.issuer || claims.aud !== CONTACT_DESIGN.audience
      || claims.purpose !== CONTACT_DESIGN.purpose || claims.policy_version !== CONTACT_DESIGN.policyVersion
      || claims.contact_verified !== true || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
      || claims.iat < 0 || claims.exp > Math.floor(MAX_TIME / 1000) || claims.exp <= claims.iat
      || claims.exp - claims.iat > CONTACT_DESIGN.maxFixtureLifetimeSeconds
      || claims.iat * 1000 > now || claims.exp * 1000 <= now) return false;
  return Object.keys(context).filter(key => key !== 'membership_id').every(key => claims[key] === context[key]);
}
function result(reason, context = null) {
  return Object.freeze({ schemaVersion: CONTACT_DESIGN.schemaVersion, policyVersion: CONTACT_DESIGN.policyVersion,
    mode: MODE, decisionStatus: DECISION_STATUS,
    designEligible: context !== null, canAuthorize: false, canStartChat: false, canOpenContact: false,
    oauthEnabled: false, accountActive: false, operativeAuthority: 'NONE', reason,
    ...(context ? { actor_person_id: context.person_id, shared_palaco_id: context.shared_palaco_id,
      pp_ref: context.pp_ref, binding_ref: context.binding_ref, contact_kind: context.contact_kind } : {}) });
}

/** Trusted test setup supplies one public Ed25519 KeyObject. No token/request selects a key or enables a live adapter. */
export function createContactEligibilityDesign(configuration) {
  let publicKey;
  try {
    ({ publicKey } = record(configuration, ['publicKey']));
    if (!(publicKey instanceof KeyObject) || publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') invalid();
  } catch { throw new Error('INVALID_TEST_VERIFICATION_KEY'); }
  return Object.freeze({
    async assess(snapshot, registry, proposedRequest) {
      let request; let before;
      try { request = requestData(proposedRequest); before = currentContext(snapshot, registry, request); }
      catch { return result('INVALID_DESIGN_INPUT'); }
      if (!before) return result('CURRENT_CONFIRMED_BINDING_REQUIRED');
      if (request.proof === null) return result('SIGNED_PROOF_REQUIRED');
      try {
        const verified = await compactVerify(request.proof, publicKey, { algorithms: [CONTACT_DESIGN.algorithm] });
        const header = record(verified.protectedHeader, ['alg', 'kid', 'typ']);
        if (header.alg !== CONTACT_DESIGN.algorithm || header.kid !== CONTACT_DESIGN.kid || header.typ !== CONTACT_DESIGN.type) invalid();
        const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(verified.payload));
        if (!claimsMatch(payload, before, request.now_ms)) return result('INVALID_SIGNED_PROOF');
        // Copy primitive context before awaiting, then re-read current state. No positive proof result is cached.
        const after = currentContext(snapshot, registry, request);
        if (!after || JSON.stringify(before) !== JSON.stringify(after)) return result('CONTEXT_CHANGED');
        return result('DESIGN_CHAT_ELIGIBLE', after);
      } catch { return result('INVALID_SIGNED_PROOF'); }
    },
  });
}
