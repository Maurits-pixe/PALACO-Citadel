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
// A single exact own-field capture avoids double descriptor reads when
// supplied outer inputs are Proxy-backed. Accessors are never evaluated.
const captureExactRecord = (value, keys) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return null;
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length ||
      actual.some(key => typeof key !== 'string' || !keys.includes(key)))
    return null;
  const snapshot = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
};
const pinKeys = ['schema','issuerFingerprint','revision','registrySha256'];
// Capture a PIN's own data descriptors once, never evaluating accessors or
// rereading attacker-controlled Proxy fields after validation.
const capturePin = p => {
  if (p === null || typeof p !== 'object' || Array.isArray(p) ||
      Object.getPrototypeOf(p) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(p);
  if (keys.length !== pinKeys.length ||
      keys.some(k => typeof k !== 'string' || !pinKeys.includes(k))) return null;
  // A plain snapshot remains compatible with the downstream ledger's strict
  // plain-record validator; no untrusted object is forwarded.
  const copy = {};
  for (const key of pinKeys) {
    const d = Object.getOwnPropertyDescriptor(p,key);
    if (!d || !Object.hasOwn(d,'value')) return null;
    copy[key] = d.value;
  }
  return copy.schema === PIN_SCHEMA && HEX.test(copy.issuerFingerprint) &&
    HEX.test(copy.registrySha256) && Number.isSafeInteger(copy.revision) &&
    copy.revision > 0 ? copy : null;
};
// Keep the hash-linked history stable from validation through ledger replay.
// A Proxy may change an entry between checks; copy only own data descriptors,
// reject holes/accessors/extra keys and impose the ledger's 4096-entry cap.
const captureLedgerEntries = entries => {
  if (!Array.isArray(entries)) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(entries, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value > 4096) return null;
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(entries);
  if (keys.length !== length + 1 ||
      keys.some(k => k !== 'length' &&
        (typeof k !== 'string' || !/^(0|[1-9][0-9]*)$/.test(k) ||
          Number(k) >= length))) return null;
  const captured = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(entries, String(index));
    if (!item || !Object.hasOwn(item, 'value')) return null;
    const record = captureExactRecord(item.value,
      ['sequence','previousHash','fromPin','toPin']);
    if (!record) return null;
    const fromPin = capturePin(record.fromPin);
    const toPin = capturePin(record.toPin);
    if (!fromPin || !toPin) return null;
    captured.push({sequence: record.sequence, previousHash: record.previousHash,
      fromPin, toPin});
  }
  return captured;
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
    const snapshot = captureExactRecord(input,inputKeys);
    if (!snapshot) return reject('INVALID_ANCHOR_INPUT');
    const {
      anchorBytes, signatureBase64Url, anchorPublicJwk,
      expectedAnchorKeyFingerprint, genesisPin, entries, currentPin,
      minimumAnchorSequence
    } = snapshot;
    // Capture caller-owned PINs once; validating them before this point would
    // invoke untrusted Proxy descriptor traps for a second read.
    const genesisSnapshot = capturePin(genesisPin);
    const currentSnapshot = capturePin(currentPin);
    if (!genesisSnapshot || !currentSnapshot)
      return reject('INVALID_ANCHOR_INPUT');
    if (!(anchorBytes instanceof Uint8Array) || !anchorBytes.length ||
      anchorBytes.length > 8192 || !Array.isArray(entries) ||
      typeof expectedAnchorKeyFingerprint !== 'string' ||
      !HEX.test(expectedAnchorKeyFingerprint) ||
      !Number.isSafeInteger(minimumAnchorSequence) ||
      minimumAnchorSequence < 0 ||
      typeof signatureBase64Url !== 'string' ||
      signatureBase64Url.length < 11 || signatureBase64Url.length > 107 ||
      !/^[A-Za-z0-9_-]+$/.test(signatureBase64Url))
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
    // P-256 coordinates are exactly 32 bytes: a valid-looking 43-character
    // base64url string can still have nonzero unused trailing bits. Require
    // canonical encoding so a single public key has one textual form.
    const xBytes = Buffer.from(keySnapshot.x,'base64url');
    const yBytes = Buffer.from(keySnapshot.y,'base64url');
    if (xBytes.length !== 32 || yBytes.length !== 32 ||
        xBytes.toString('base64url') !== keySnapshot.x ||
        yBytes.toString('base64url') !== keySnapshot.y)
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
    // A signature authenticates bytes, not an agreed interpretation of JSON.
    // Reject whitespace variants, duplicate member names and noncanonical
    // escapes so independent verifiers cannot disagree about the signed head.
    if (JSON.stringify(doc) !== text)
      return reject('NONCANONICAL_ANCHOR_DOCUMENT');
    // Check the signed sequence bound before walking caller-supplied history.
    // Impossible checkpoints must never trigger Proxy enumeration or a
    // potentially expensive replay of an oversized untrusted ledger.
    if (!own(doc,['schema','sequence','headHash','genesisPin','currentPin']) ||
        !Number.isSafeInteger(doc.sequence) ||
        doc.sequence < 0 || doc.sequence > 4096)
      return reject('ANCHOR_ROLLBACK_OR_MISMATCH');
    const entriesSnapshot = captureLedgerEntries(entries);
    if (!entriesSnapshot) return reject('LEDGER_INVALID_CHAIN_LINK');
    if (!own(doc,['schema','sequence','headHash','genesisPin','currentPin']) ||
      doc.schema !== AUDIT_ANCHOR_SCHEMA ||
      !Number.isSafeInteger(doc.sequence) || doc.sequence < minimumAnchorSequence ||
      !HEX.test(doc.headHash) ||
      !pinOK(doc.genesisPin) || !pinOK(doc.currentPin) ||
      !samePin(doc.genesisPin,genesisSnapshot) ||
      !samePin(doc.currentPin,currentSnapshot) || doc.sequence !== entriesSnapshot.length)
      return reject('ANCHOR_ROLLBACK_OR_MISMATCH');
    const ledger=inspectRegistryPinLedger({
      genesisPin:genesisSnapshot,entries:entriesSnapshot,expectedHeadHash:doc.headHash,
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
