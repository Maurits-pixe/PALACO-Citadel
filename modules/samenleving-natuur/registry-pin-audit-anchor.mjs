import { createHash, createPublicKey, verify } from 'node:crypto';
import { inspectRegistryPinLedger } from './registry-pin-ledger.mjs';
import { PIN_SCHEMA } from './registry-snapshot-pin.mjs';

export const AUDIT_ANCHOR_SCHEMA = 'palaco-citadel-audit-head-anchor-v1';
const PREFIX = Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n');
const HEX = /^[0-9a-f]{64}$/;
const own = (v, keys) => v !== null && typeof v === 'object' &&
  !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype &&
  Reflect.ownKeys(v).length === keys.length &&
  keys.every(k => Object.hasOwn(v, k) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(v,k) ?? {}, 'value'));
const pinKeys = ['schema','issuerFingerprint','revision','registrySha256'];
// Capture a PIN's own data descriptors once, never evaluating accessors or
// rereading attacker-controlled Proxy fields after validation.
const capturePin = p => {
  if (p === null || typeof p !== 'object' || Array.isArray(p) ||
      Object.getPrototypeOf(p) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(p);
  if (keys.length !== pinKeys.length ||
      keys.some(k => typeof k !== 'string' || !pinKeys.includes(k))) return null;
  const copy = Object.create(null);
  for (const key of pinKeys) {
    const d = Object.getOwnPropertyDescriptor(p,key);
    if (!d || !Object.hasOwn(d,'value')) return null;
    copy[key] = d.value;
  }
  return copy.schema === PIN_SCHEMA && HEX.test(copy.issuerFingerprint) &&
    HEX.test(copy.registrySha256) && Number.isSafeInteger(copy.revision) &&
    copy.revision > 0 ? copy : null;
};
const pinOK = p => capturePin(p) !== null;
const samePin = (a,b) => a.schema===b.schema && a.revision===b.revision &&
  a.issuerFingerprint===b.issuerFingerprint && a.registrySha256===b.registrySha256;
const reject = reason => ({
  schema:AUDIT_ANCHOR_SCHEMA, anchorSignatureValid:false,
  anchoredLedgerMatched:false, reason, trust:'NOT_ESTABLISHED',
  authorization:'DENY',stateChanged:false,
  executionAllowed:false,releaseAllowed:false
});

/**
 * Read-only signature + exact ledger binding. The trusted anchor-key
 * fingerprint MUST be obtained from a protected independent channel.
 * Caller-supplied trust evidence cannot establish actual independence.
 */
export function inspectSignedAuditHeadAnchor(input = {}) {
  try {
    // The outer contract is untrusted: reject null, getters and hostile
    // Proxy traps before touching any caller-controlled field.
    const inputKeys = [
      'anchorBytes','signatureBase64Url','anchorPublicJwk',
      'expectedAnchorKeyFingerprint','genesisPin','entries',
      'currentPin','minimumAnchorSequence'
    ];
    if (!own(input,inputKeys)) return reject('INVALID_ANCHOR_INPUT');
    const snapshot = Object.create(null);
    for (const key of inputKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(input,key);
      if (!descriptor || !Object.hasOwn(descriptor,'value'))
        return reject('INVALID_ANCHOR_INPUT');
      snapshot[key] = descriptor.value;
    }
    const {
      anchorBytes, signatureBase64Url, anchorPublicJwk,
      expectedAnchorKeyFingerprint, genesisPin, entries, currentPin,
      minimumAnchorSequence
    } = snapshot;
    if (!(anchorBytes instanceof Uint8Array) || !anchorBytes.length ||
      anchorBytes.length > 8192 || !Array.isArray(entries) ||
      !pinOK(genesisPin) || !pinOK(currentPin) ||
      typeof expectedAnchorKeyFingerprint !== 'string' ||
      !HEX.test(expectedAnchorKeyFingerprint) ||
      !Number.isSafeInteger(minimumAnchorSequence) ||
      minimumAnchorSequence < 0 ||
      typeof signatureBase64Url !== 'string' ||
      signatureBase64Url.length < 11 || signatureBase64Url.length > 107 ||
      !/^[A-Za-z0-9_-]+$/.test(signatureBase64Url))
      return reject('INVALID_ANCHOR_INPUT');
    const genesisSnapshot = capturePin(genesisPin);
    const currentSnapshot = capturePin(currentPin);
    if (!genesisSnapshot || !currentSnapshot)
      return reject('INVALID_ANCHOR_INPUT');
    // Snapshot each public JWK coordinate exactly once: hostile getters and
    // changing Proxy descriptors must not alter the key between fingerprint
    // derivation and cryptographic verification.
    const keyFields = ['kty','crv','x','y'];
    if (anchorPublicJwk === null || typeof anchorPublicJwk !== 'object' ||
        Array.isArray(anchorPublicJwk) ||
        Object.getPrototypeOf(anchorPublicJwk) !== Object.prototype)
      return reject('INVALID_ANCHOR_INPUT');
    const actualKeyFields = Reflect.ownKeys(anchorPublicJwk);
    if (actualKeyFields.length !== keyFields.length ||
        actualKeyFields.some(k => typeof k !== 'string' || !keyFields.includes(k)))
      return reject('INVALID_ANCHOR_INPUT');
    const keySnapshot = {};
    for (const field of keyFields) {
      const d = Object.getOwnPropertyDescriptor(anchorPublicJwk, field);
      if (!d || !Object.hasOwn(d,'value') || typeof d.value !== 'string')
        return reject('INVALID_ANCHOR_INPUT');
      keySnapshot[field] = d.value;
    }
    if (keySnapshot.kty !== 'EC' || keySnapshot.crv !== 'P-256' ||
        !/^[A-Za-z0-9_-]{43}$/.test(keySnapshot.x) ||
        !/^[A-Za-z0-9_-]{43}$/.test(keySnapshot.y))
      return reject('INVALID_ANCHOR_INPUT');
    const key = createPublicKey({format:'jwk',key:keySnapshot});
    if (key.asymmetricKeyType !== 'ec' ||
      key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      return reject('INVALID_ANCHOR_KEY');
    const fingerprint = createHash('sha256').update(
      key.export({format:'der',type:'spki'})).digest('hex');
    if (fingerprint !== expectedAnchorKeyFingerprint)
      return reject('UNPINNED_ANCHOR_KEY');
    // Snapshot mutable caller-owned bytes exactly once so the signed bytes
    // and decoded ledger claims cannot diverge during verification.
    const snapshotBytes = Buffer.from(anchorBytes);
    const signature = Buffer.from(signatureBase64Url,'base64url');
    if (signature.length < 8 || signature.length > 80 ||
      signature.toString('base64url') !== signatureBase64Url ||
      !verify('sha256',Buffer.concat([PREFIX,snapshotBytes]),key,signature))
      return reject('ANCHOR_SIGNATURE_INVALID');
    // Decode an exact byte snapshot only after signature verification.
    const text = new TextDecoder('utf-8',{fatal:true}).decode(snapshotBytes);
    const doc = JSON.parse(text);
    if (!own(doc,['schema','sequence','headHash','genesisPin','currentPin']) ||
      doc.schema !== AUDIT_ANCHOR_SCHEMA ||
      !Number.isSafeInteger(doc.sequence) || doc.sequence < minimumAnchorSequence ||
      !HEX.test(doc.headHash) ||
      !pinOK(doc.genesisPin) || !pinOK(doc.currentPin) ||
      !samePin(doc.genesisPin,genesisSnapshot) ||
      !samePin(doc.currentPin,currentSnapshot) || doc.sequence !== entries.length)
      return reject('ANCHOR_ROLLBACK_OR_MISMATCH');
    const ledger=inspectRegistryPinLedger({
      genesisPin:genesisSnapshot,entries,expectedHeadHash:doc.headHash,
      expectedCurrentPin:currentSnapshot
    });
    if (!ledger.chainConsistent) return reject('LEDGER_'+ledger.reason);
    return {
      schema:AUDIT_ANCHOR_SCHEMA,anchorSignatureValid:true,
      anchoredLedgerMatched:true,anchoredSequence:doc.sequence,
      anchoredHeadHash:doc.headHash,
      unresolvedGates:['INDEPENDENT_PROTECTED_KEY_FINGERPRINT',
        'EXTERNALLY_PERSISTED_ANCHOR','TRUSTED_REVOCATION_AND_CLOCK'],
      trust:'NOT_ESTABLISHED',authorization:'DENY',
      stateChanged:false,executionAllowed:false,releaseAllowed:false
    };
  } catch { return reject('MALFORMED_OR_UNTRUSTED_ANCHOR'); }
}
