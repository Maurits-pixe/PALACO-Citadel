import { createHash, createPublicKey, verify } from 'node:crypto';
import { inspectSpecialtyDesign } from './contact-readiness.mjs';

export const GUARD_ROLES = Object.freeze(['IDENTITY','ADDRESS','HUMAN_CONSENT','SCOPE_POLICY',
  'E2EE_KEYS','CONTENT_INTEGRITY','REPLAY_ORDER','PRIVACY','DELIVERY_REVOCATION']);
const SIDES = ['SENDER','RECEIVER'];
const VERSION = '6ri9ade-signed-reference/0.1';
const DOMAIN = 'PALACO/6RI9ADE/REFERENCE-EVIDENCE/v0.1\0';
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function token(value) { return typeof value === 'string' && ID.test(value); }
function stamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}
function windowValid(value, time, maxTtl) {
  const start = stamp(value?.issuedAt), end = stamp(value?.expiresAt);
  return Number.isFinite(start) && Number.isFinite(end) && start <= time && time < end
    && start < end && end - start <= maxTtl;
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  throw new Error('NON_JSON_REFERENCE');
}
function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }

/** Domain-separated evidence bytes, not an E2EE or transport protocol. */
export function referenceSigningBytes(body) {
  return Buffer.from(DOMAIN + canonical(body), 'utf8');
}
export function referenceContractDigest(request) { return digest(request); }
export function referenceEnvelopeDigest(envelope) { return digest(envelope); }
export function referenceAdmissionDigest(initiation, admission) {
  return digest([referenceEnvelopeDigest(initiation), referenceEnvelopeDigest(admission)]);
}
export function referenceEvidenceSetDigest(evidence) {
  const sorted = [...evidence].sort((a,b) =>
    (SIDES.indexOf(a.body.side) - SIDES.indexOf(b.body.side))
    || (GUARD_ROLES.indexOf(a.body.roleCode) - GUARD_ROLES.indexOf(b.body.roleCode)));
  return digest(sorted.map(referenceEnvelopeDigest));
}
function requestValid(request, time) {
  const keys = ['schemaVersion','id','challengeId','sender','receiver','scope','policyVersion',
    'ppBindingVersion','scriptieBindingVersion','issuedAt','expiresAt'];
  const partyKeys = ['accountId','deviceId','tenantId','worldId','citadelId','keyVersion'];
  return exact(request, keys) && request.schemaVersion === '6ri9ade-transfer-reference/0.1'
    && ['id','challengeId','policyVersion','ppBindingVersion','scriptieBindingVersion'].every(key => token(request[key]))
    && SIDES.every(side => {
      const party = request[side.toLowerCase()];
      return exact(party, partyKeys) && partyKeys.every(key => token(party[key]));
    })
    && request.sender.accountId !== request.receiver.accountId
    && Array.isArray(request.scope) && request.scope.length === 1 && request.scope[0] === 'chat:text'
    && windowValid(request, time, 15 * 60_000);
}
function snapshotValid(snapshot, request, time) {
  const keys = ['schemaVersion','classification','revision','checkpoint','expectedRequest',
    'observedAt','expiresAt','challengeState','contactState','revokedEnvelopeIds','issuers'];
  const observed = stamp(snapshot?.observedAt), end = stamp(snapshot?.expiresAt);
  return exact(snapshot, keys) && snapshot.schemaVersion === '6ri9ade-trust-reference/0.1'
    && snapshot.classification === 'SYNTHETIC_ONLY' && token(snapshot.revision)
    && ['SERVICE_COMMIT','QUEUED_DELIVERY'].includes(snapshot.checkpoint)
    && canonical(snapshot.expectedRequest) === canonical(request)
    && Number.isFinite(observed) && observed <= time && time - observed <= 30_000
    && Number.isFinite(end) && time < end && observed < end && end - observed <= 30_000
    && ['CURRENT','CONSUMED','UNKNOWN'].includes(snapshot.challengeState)
    && ['CURRENT','BLOCKED','REVOKED','EXPIRED','UNKNOWN'].includes(snapshot.contactState)
    && Array.isArray(snapshot.revokedEnvelopeIds) && snapshot.revokedEnvelopeIds.length <= 128
    && snapshot.revokedEnvelopeIds.every(token)
    && Array.isArray(snapshot.issuers) && snapshot.issuers.length <= 32;
}
function issuerValid(issuer, request, contractDigest, side, role, time) {
  const keys = ['id','classification','publicKeyPem','side','roleCode','receiptStages',
    'subjectAccountId','subjectDeviceId','subjectKeyVersion','contextDigest','issuedAt','expiresAt','status'];
  const party = request[side.toLowerCase()];
  return exact(issuer, keys) && token(issuer.id) && issuer.classification === 'SYNTHETIC_ONLY'
    && issuer.side === side && issuer.roleCode === role
    && issuer.subjectAccountId === party.accountId && issuer.subjectDeviceId === party.deviceId
    && issuer.subjectKeyVersion === party.keyVersion && issuer.contextDigest === contractDigest
    && issuer.status === 'CURRENT' && typeof issuer.publicKeyPem === 'string' && issuer.publicKeyPem.length <= 4096
    && /^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(issuer.publicKeyPem)
    && Array.isArray(issuer.receiptStages) && issuer.receiptStages.length <= 3
    && issuer.receiptStages.every(stage => ['INITIATED','NOVA_ADMITTED','FINAL_ACCEPTED'].includes(stage))
    && (role === 'HUMAN_RECEIPT' || issuer.receiptStages.length === 0)
    && windowValid(issuer, time, 24 * 60 * 60_000);
}
function signatureValid(envelope, issuer) {
  if (!exact(envelope, ['algorithm','body','signature']) || envelope.algorithm !== 'Ed25519'
      || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)) return false;
  try {
    const signature = Buffer.from(envelope.signature, 'base64url');
    if (signature.length !== 64 || signature.toString('base64url') !== envelope.signature) return false;
    const key = createPublicKey(issuer.publicKeyPem);
    return key.asymmetricKeyType === 'ed25519'
      && verify(null, referenceSigningBytes(envelope.body), key, signature);
  } catch { return false; }
}
function signedBody(envelope, context, { role, side, kind, stage, admissionDigest, evidenceSetDigest }) {
  const body = envelope?.body;
  const common = ['schemaVersion','type','id','issuerId','side','contractDigest','admissionDigest','issuedAt','expiresAt'];
  const keys = kind === 'GUARD_ATTESTATION'
    ? [...common, 'roleCode','checkpoint','status','evidenceDigest']
    : [...common, 'stage','evidenceSetDigest'];
  if (!exact(body, keys) || body.schemaVersion !== VERSION || body.type !== kind
      || !token(body.id) || !token(body.issuerId) || body.side !== side
      || body.contractDigest !== context.contractDigest || body.admissionDigest !== admissionDigest
      || !windowValid(body, context.time, kind === 'GUARD_ATTESTATION' ? 120_000 : 15 * 60_000)
      || stamp(body.issuedAt) < stamp(context.request.issuedAt)
      || stamp(body.expiresAt) > stamp(context.request.expiresAt)
      || context.snapshot.revokedEnvelopeIds.includes(body.id)) return null;
  if (kind === 'GUARD_ATTESTATION') {
    if (body.roleCode !== role || body.checkpoint !== context.snapshot.checkpoint || !['PASS','FAIL','UNKNOWN'].includes(body.status)
        || typeof body.evidenceDigest !== 'string' || !HASH.test(body.evidenceDigest)) return null;
  } else if (body.stage !== stage || body.evidenceSetDigest !== evidenceSetDigest) return null;
  const matches = context.snapshot.issuers.filter(issuer => issuer?.id === body.issuerId);
  if (matches.length !== 1 || !issuerValid(matches[0], context.request, context.contractDigest, side, role, context.time)
      || (kind === 'HUMAN_RECEIPT' && !matches[0].receiptStages.includes(stage))
      || stamp(body.issuedAt) < stamp(matches[0].issuedAt)
      || stamp(body.expiresAt) > stamp(matches[0].expiresAt)
      || !signatureValid(envelope, matches[0])) return null;
  return body;
}

/**
 * Trusted synchronous loaders belong to the host; never deserialize them from
 * request JSON. This factory evaluates synthetic reference evidence only.
 * No result grants rights, consumes a challenge, opens contact or sends data.
 */
export function createBrigadeReferenceGate({ design, loadSnapshot = () => undefined, now = () => new Date().toISOString() } = {}) {
  if (typeof loadSnapshot !== 'function' || typeof now !== 'function') throw new TypeError('TRUSTED_SYNC_LOADERS_REQUIRED');
  const designStatus = inspectSpecialtyDesign(design).designStatus;
  function evaluate(input) {
    const controls = GUARD_ROLES.map(roleCode => ({roleCode, sender:'UNKNOWN', receiver:'UNKNOWN'}));
    const reasons = [];
    let safetyVerdict = 'HOLD', contactEligibility = 'HOLD', contractDigest = null;
    let evidenceSetDigest = null, evaluatedAt = null, checkpoint = null, validUntil = null;
    let snapshot, snapshotFingerprint;
    function finish() {
      let fresh = false;
      try {
        const secondTime = stamp(now());
        const current = loadSnapshot();
        fresh = Number.isFinite(secondTime) && secondTime >= stamp(evaluatedAt)
          && snapshotValid(current, input?.request, secondTime)
          && digest(current) === snapshotFingerprint
          && current.challengeState === 'CURRENT' && current.contactState === 'CURRENT'
          && (validUntil === null || secondTime < stamp(validUntil));
      } catch {}
      if (contactEligibility !== 'STOP' && !fresh) {
        safetyVerdict = 'HOLD'; contactEligibility = 'HOLD';
        evidenceSetDigest = null; reasons.push('TRUST_OR_RIGHTS_CHANGED');
      }
      return freeze({
        schemaVersion:'6ri9ade-gate-reference/0.1', mode:'REFERENCE_ONLY', classification:'SYNTHETIC_ONLY',
        checkpoint, evaluatedAt, validUntil, contractDigest, evidenceSetDigest,
        safetyVerdict, contactEligibility, controls, reasonCodes:[...new Set(reasons)],
        canOpenContact:false, operativeAuthority:'NONE', runtimeConnected:false,
        externalSideEffect:false, replayStateConsumed:false
      });
    }
    try {
      evaluatedAt = now();
      const time = stamp(evaluatedAt);
      if (designStatus !== 'DESIGN_DRAFT') { reasons.push('INVALID_GUARD_DESIGN'); return finish(); }
      if (!exact(input, ['request','initiation','novaAdmission','evidence','finalReceipts'])
          || !Number.isFinite(time) || !requestValid(input.request, time)
          || !Array.isArray(input.evidence) || input.evidence.length > 36
          || !Array.isArray(input.finalReceipts) || input.finalReceipts.length > 4) {
        reasons.push('INVALID_REFERENCE_INPUT'); return finish();
      }
      snapshot = loadSnapshot();
      if (!snapshotValid(snapshot, input.request, time)) {
        reasons.push('TRUST_SNAPSHOT_UNAVAILABLE'); return finish();
      }
      checkpoint = snapshot.checkpoint; snapshotFingerprint = digest(snapshot);
      contractDigest = referenceContractDigest(input.request);
      validUntil = snapshot.expiresAt;
      if (snapshot.contactState !== 'CURRENT') {
        contactEligibility = ['BLOCKED','REVOKED','EXPIRED'].includes(snapshot.contactState) ? 'STOP' : 'HOLD';
        reasons.push('CONTACT_RIGHTS_NOT_CURRENT'); return finish();
      }
      if (snapshot.challengeState !== 'CURRENT') {
        reasons.push('CHALLENGE_NOT_CURRENT'); return finish();
      }
      const context = { request:input.request, snapshot, contractDigest, time };
      const initiation = signedBody(input.initiation, context, {role:'HUMAN_RECEIPT',side:'SENDER',
        kind:'HUMAN_RECEIPT',stage:'INITIATED',admissionDigest:null,evidenceSetDigest:null});
      if (!initiation) { reasons.push('AUTHENTICATED_INITIATION_REQUIRED'); return finish(); }
      const nova = signedBody(input.novaAdmission, context, {role:'HUMAN_RECEIPT',side:'RECEIVER',
        kind:'HUMAN_RECEIPT',stage:'NOVA_ADMITTED',
        admissionDigest:referenceEnvelopeDigest(input.initiation),evidenceSetDigest:null});
      if (!nova || stamp(nova.issuedAt) < stamp(initiation.issuedAt)) {
        reasons.push('SEPARATE_NOVA_ADMISSION_REQUIRED'); return finish();
      }
      const admissionDigest = referenceAdmissionDigest(input.initiation, input.novaAdmission);
      const seenIds = new Set([initiation.id,nova.id]);
      const accepted = [];
      let failed = false, allPass = input.evidence.length === 18;
      if (seenIds.size !== 2) { reasons.push('DUPLICATE_RECEIPT_ID'); allPass = false; }
      for (const control of controls) for (const side of SIDES) {
        const matches = input.evidence.filter(item => item?.body?.roleCode === control.roleCode && item?.body?.side === side);
        const valid = [];
        for (const envelope of matches) {
          const body = signedBody(envelope, context, {role:control.roleCode,side,kind:'GUARD_ATTESTATION',admissionDigest});
          if (body && stamp(body.issuedAt) >= stamp(nova.issuedAt)) valid.push({envelope,body});
        }
        const hasFail = valid.some(({body}) => body.status === 'FAIL');
        if (hasFail) failed = true;
        const field = side.toLowerCase();
        if (matches.length !== 1 || valid.length !== 1) {
          control[field] = hasFail ? 'FAIL' : 'UNKNOWN';
          allPass = false; reasons.push('MISSING_INVALID_OR_DUPLICATE_SLOT');
          continue;
        }
        const {envelope,body} = valid[0];
        control[field] = body.status;
        if (seenIds.has(body.id)) { allPass = false; reasons.push('DUPLICATE_EVIDENCE_ID'); }
        seenIds.add(body.id);
        if (body.status !== 'PASS') allPass = false;
        accepted.push(envelope);
      }
      if (failed) {
        safetyVerdict = 'STOP'; contactEligibility = 'STOP';
        reasons.push('AUTHENTICATED_GUARD_FAILURE'); return finish();
      }
      if (!allPass || accepted.length !== 18) {
        reasons.push('ALL_EIGHTEEN_CURRENT_PASSES_REQUIRED'); return finish();
      }
      safetyVerdict = 'REFERENCE_ALL_PASS';
      evidenceSetDigest = referenceEvidenceSetDigest(accepted);
      const expiry = [snapshot.expiresAt,input.request.expiresAt,initiation.expiresAt,nova.expiresAt,
        ...accepted.map(item => item.body.expiresAt)].sort((a,b) => stamp(a)-stamp(b))[0];
      validUntil = expiry;
      contactEligibility = 'READY_FOR_FINAL_CONFIRMATION';
      const latestEvidence = Math.max(...accepted.map(item => stamp(item.body.issuedAt)));
      let finalValid = input.finalReceipts.length === 2;
      for (const side of SIDES) {
        const matches = input.finalReceipts.filter(envelope => envelope?.body?.side === side);
        if (matches.length !== 1) { finalValid = false; continue; }
        const body = signedBody(matches[0], context, {role:'HUMAN_RECEIPT',side,kind:'HUMAN_RECEIPT',
          stage:'FINAL_ACCEPTED',admissionDigest,evidenceSetDigest});
        if (!body || stamp(body.issuedAt) < latestEvidence || seenIds.has(body.id)) { finalValid = false; continue; }
        seenIds.add(body.id);
        if (stamp(body.expiresAt) < stamp(validUntil)) validUntil = body.expiresAt;
      }
      if (finalValid) contactEligibility = 'REFERENCE_GATE_SATISFIED';
      else reasons.push('BOTH_EXACT_FINAL_HUMAN_RECEIPTS_REQUIRED');
      return finish();
    } catch {
      reasons.push('REFERENCE_INPUT_OR_LOADER_ERROR'); return finish();
    }
  }
  return Object.freeze({ evaluate });
}
