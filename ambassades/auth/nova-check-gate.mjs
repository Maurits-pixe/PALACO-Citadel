import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MANIFEST_BLOB_SHA = 'd938ba81c91b48704d566a448af87f0f0c2465bd';
const ROLE_CODES = Object.freeze([
  'IDENTITY', 'ADDRESS', 'HUMAN_CONSENT', 'SCOPE_POLICY', 'E2EE_KEYS',
  'CONTENT_INTEGRITY', 'REPLAY_ORDER', 'PRIVACY', 'DELIVERY_REVOCATION',
]);
const SOURCE_BINDING = Object.freeze({
  repository: 'Maurits-pixe/PALACO-Citadel',
  commit: '74dcf9535733af2f37a729b3a11f2269d5d594db',
  path: 'rio/brigade-specialties.json',
  blobSha: MANIFEST_BLOB_SHA,
});
const SESSION_ID = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^[a-f0-9]{32}$/;

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function exactObject(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

// Exact source bytes are checked once when the process loads. A changed or missing
// manifest prevents startup; it cannot silently replace the nine design roles.
const manifestBytes = readFileSync(new URL('./brigade-specialties.json', import.meta.url));
const manifestBlobSha = createHash('sha1')
  .update(Buffer.from('blob ' + manifestBytes.length + '\0'))
  .update(manifestBytes).digest('hex');
if (manifestBlobSha !== MANIFEST_BLOB_SHA) throw new TypeError('NOVA_GUARD_MANIFEST_MISMATCH');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schemaVersion !== '6ri9ade-specialty-design/0.1'
    || manifest.designId !== '6RI9ADE-BODYGUARDS-001'
    || manifest.status !== 'DESIGN_DRAFT' || manifest.componentName !== '6RI9ADE'
    || !Array.isArray(manifest.guards) || manifest.guards.length !== ROLE_CODES.length
    || manifest.guards.some((guard, index) => guard.id !== '6RI9ADE-BG-' + String(index + 1).padStart(2, '0')
      || guard.roleCode !== ROLE_CODES[index] || guard.runtimeIdentity !== 'UNENROLLED'
      || guard.runtimeStatus !== 'NOT_CONNECTED' || guard.capabilities !== 'DESIGN_ONLY')) {
  throw new TypeError('NOVA_GUARD_MANIFEST_INVALID');
}
const guards = freeze(manifest.guards.map(({ id, roleCode }) => ({ id, roleCode })));

function currentReception(receipt, { sessionId, time, sessionExpiresAt }) {
  const acceptance = receipt?.firstAcceptance;
  return typeof sessionId === 'string' && SESSION_ID.test(sessionId)
    && Number.isFinite(time) && Number.isFinite(sessionExpiresAt) && time < sessionExpiresAt
    && receipt !== null && typeof receipt === 'object'
    && typeof receipt.id === 'string' && RECEIPT_ID.test(receipt.id)
    && receipt.status === 'FIRST_ACCEPTED'
    && Number.isSafeInteger(receipt.revision) && receipt.revision >= 1
    && Number.isFinite(receipt.createdAt) && receipt.createdAt <= time
    && Number.isFinite(receipt.expiresAt) && time < receipt.expiresAt
    && receipt.expiresAt <= sessionExpiresAt
    && exactObject(acceptance, ['acceptedAt', 'scope', 'actor'])
    && Number.isFinite(acceptance.acceptedAt)
    && receipt.createdAt <= acceptance.acceptedAt && acceptance.acceptedAt <= time
    && acceptance.acceptedAt < receipt.expiresAt
    && acceptance.scope === 'reception-only' && acceptance.actor === 'browser-test-session';
}

/**
 * Server-owned assessment of the existing reception choice. Local checks confirm
 * only this temporary browser session. No guardian assertion, human identity,
 * second party, final consent, or safety guarantee is created here.
 */
export function createNovaCheckGate(receipt, context) {
  if (!currentReception(receipt, context)) throw new TypeError('NOVA_CURRENT_RECEPTION_REQUIRED');
  const checkGate = freeze({
    schemaVersion: 'nova-check-gate/0.1',
    policyVersion: 'NOVA-CHECK-GATE-0.1',
    receiptId: receipt.id,
    currentRevision: receipt.revision,
    receptionAcceptedAt: new Date(receipt.firstAcceptance.acceptedAt).toISOString(),
    scope: 'reception-only',
    evaluatedAt: new Date(context.time).toISOString(),
    expiresAt: new Date(receipt.expiresAt).toISOString(),
    outcome: 'HOLD',
    reason: 'CONNECTIONS_MISSING',
    localChecks: {
      session: 'CONFIRMED', receptionChoice: 'CONFIRMED',
      scope: 'CONFIRMED', expiry: 'CONFIRMED',
    },
    guards: guards.map(({ id, roleCode }) => ({ id, roleCode, sender: 'UNKNOWN', receiver: 'UNKNOWN' })),
    steward: 'UNKNOWN',
    canOpenContact: false,
    finalConsentEnabled: false,
    sourceBinding: { ...SOURCE_BINDING },
  });
  // Kept separately on the receipt; this capability must never enter the JSON response.
  const binding = freeze({
    sessionId: context.sessionId,
    receiptId: receipt.id,
    currentRevision: receipt.revision,
    receptionAcceptedAt: receipt.firstAcceptance.acceptedAt,
    expiresAt: receipt.expiresAt,
  });
  return { checkGate, binding };
}

/** Project a fresh clone only while the same live session and exact reception remain current. */
export function copyCurrentNovaCheckGate(receipt, context) {
  if (!currentReception(receipt, context)) return null;
  const assessment = receipt.checkGate;
  const binding = receipt.checkGateBinding;
  if (!assessment || !exactObject(binding,
    ['sessionId', 'receiptId', 'currentRevision', 'receptionAcceptedAt', 'expiresAt'])
      || binding.sessionId !== context.sessionId || binding.receiptId !== receipt.id
      || binding.currentRevision !== receipt.revision
      || binding.receptionAcceptedAt !== receipt.firstAcceptance.acceptedAt
      || binding.expiresAt !== receipt.expiresAt
      || assessment.receiptId !== receipt.id || assessment.currentRevision !== receipt.revision
      || assessment.receptionAcceptedAt !== new Date(receipt.firstAcceptance.acceptedAt).toISOString()
      || assessment.expiresAt !== new Date(receipt.expiresAt).toISOString()
      || !Number.isFinite(Date.parse(assessment.evaluatedAt))
      || Date.parse(assessment.evaluatedAt) < receipt.firstAcceptance.acceptedAt
      || Date.parse(assessment.evaluatedAt) > context.time
      || Date.parse(assessment.evaluatedAt) >= receipt.expiresAt) return null;
  return {
    ...assessment,
    localChecks: { ...assessment.localChecks },
    guards: assessment.guards.map(guard => ({ ...guard })),
    sourceBinding: { ...assessment.sourceBinding },
  };
}
