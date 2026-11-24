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
// Accept only minimal positive DER INTEGERs for ECDSA P-256 (r,s).
// This is a format gate, not a replacement for cryptographic verification.
// Every ECDSA scalar must satisfy 1 <= scalar < the subgroup order.
const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const P256_FIELD_PRIME = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const P256_B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
const canonicalEcdsaDer = signature => {
  if (signature.length < 8 || signature.length > 72 ||
      signature[0] !== 0x30 || signature[1] !== signature.length - 2)
    return false;
  let offset = 2;
  for (let component = 0; component < 2; component++) {
    if (offset + 2 > signature.length || signature[offset] !== 0x02)
      return false;
    const size = signature[offset + 1];
    offset += 2;
    if (size < 1 || size > 33 || offset + size > signature.length)
      return false;
    const first = signature[offset], second = size > 1 ? signature[offset + 1] : 0;
    // No negative, zero, redundant sign padding or oversized scalars.
    if ((first & 0x80) || (size > 1 && first === 0 && !(second & 0x80)) ||
        (size === 33 && first !== 0) ||
        (size === 1 && first === 0))
      return false;
    let scalar = 0n;
    for (let j = 0; j < size; j++)
      scalar = (scalar << 8n) | BigInt(signature[offset + j]);
    if (scalar === 0n || scalar >= P256_ORDER) return false;
    offset += size;
  }
  return offset === signature.length;
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
  // RegExp.test coerces objects to strings; never invoke an attacker-owned
  // toString/valueOf while inspecting untrusted PIN descriptor values.
  return copy.schema === PIN_SCHEMA &&
    typeof copy.issuerFingerprint === 'string' &&
    typeof copy.registrySha256 === 'string' &&
    HEX.test(copy.issuerFingerprint) && HEX.test(copy.registrySha256) &&
    Number.isSafeInteger(copy.revision) &&
    copy.revision > 0 ? copy : null;
};
// Keep the hash-linked history stable from validation through ledger replay.
// A Proxy may change an entry between checks; copy only own data descriptors,
// reject holes/accessors/extra keys and impose the ledger's 4096-entry cap.
const captureLedgerEntries = (entries, expectedSequence) => {
  if (!Array.isArray(entries)) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(entries, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value > 4096 ||
      lengthDescriptor.value !== expectedSequence) return null;
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
    // Validate bounded scalar inputs before accessing caller-controlled PINs
    // or cryptographic key descriptors. Malformed requests fail early.
    if (!(anchorBytes instanceof Uint8Array) || !anchorBytes.length ||
      anchorBytes.length > 8192 ||
      // Shared memory can be concurrently rewritten during verification.
      // The caller must provide an ordinary, independently owned byte view.
      (typeof SharedArrayBuffer !== 'undefined' &&
        anchorBytes.buffer instanceof SharedArrayBuffer) ||
      !Array.isArray(entries) ||
      typeof expectedAnchorKeyFingerprint !== 'string' ||
      !HEX.test(expectedAnchorKeyFingerprint) ||
      !Number.isSafeInteger(minimumAnchorSequence) ||
      minimumAnchorSequence < 0 || minimumAnchorSequence > 4096 ||
      typeof signatureBase64Url !== 'string' ||
      // Canonical DER ECDSA P-256 fits in at most 72 bytes (96 base64url chars).
      signatureBase64Url.length < 11 || signatureBase64Url.length > 96 ||
      !/^[A-Za-z0-9_-]+$/.test(signatureBase64Url))
      return reject('INVALID_ANCHOR_INPUT');
    // Copy signed bytes before consulting any caller-supplied PIN/JWK Proxy:
    // descriptor traps may otherwise mutate the original byte view.
    const snapshotBytes = Buffer.from(anchorBytes);
    // Validate canonical signature transport before inspecting untrusted PIN
    // and key objects; no cryptographic work is justified for malformed data.
    const signature = Buffer.from(signatureBase64Url,'base64url');
    if (signature.toString('base64url') !== signatureBase64Url ||
        !canonicalEcdsaDer(signature))
      return reject('ANCHOR_SIGNATURE_INVALID');
    // Caller-owned PINs are captured once; avoid mutable Proxy rereads.
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
    // P-256 coordinates are exactly 32 bytes: a valid-looking 43-character
    // base64url string can still have nonzero unused trailing bits. Require
    // canonical encoding so a single public key has one textual form.
    const xBytes = Buffer.from(keySnapshot.x,'base64url');
    const yBytes = Buffer.from(keySnapshot.y,'base64url');
    if (xBytes.length !== 32 || yBytes.length !== 32 ||
        xBytes.toString('base64url') !== keySnapshot.x ||
        yBytes.toString('base64url') !== keySnapshot.y)
      return reject('INVALID_ANCHOR_INPUT');
    // Both affine P-256 coordinates are field elements in [0, p-1].
    // Reject non-field encodings before asking the crypto library to import.
    const xCoordinate = BigInt('0x' + xBytes.toString('hex'));
    const yCoordinate = BigInt('0x' + yBytes.toString('hex'));
    if (xCoordinate >= P256_FIELD_PRIME || yCoordinate >= P256_FIELD_PRIME)
      return reject('INVALID_ANCHOR_INPUT');
    // P-256: y^2 = x^3 - 3x + b (mod p). A field-range check alone
    // does not establish that the supplied point belongs to the curve.
    const mod = value => ((value % P256_FIELD_PRIME) + P256_FIELD_PRIME) % P256_FIELD_PRIME;
    if (mod(yCoordinate * yCoordinate) !==
        mod(xCoordinate * xCoordinate * xCoordinate - 3n * xCoordinate + P256_B))
      return reject('INVALID_ANCHOR_INPUT');
    const key = createPublicKey({format:'jwk',key:keySnapshot});
    if (key.asymmetricKeyType !== 'ec' ||
      key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      return reject('INVALID_ANCHOR_KEY');
    const fingerprint = createHash('sha256').update(
      key.export({format:'der',type:'spki'})).digest('hex');
    if (fingerprint !== expectedAnchorKeyFingerprint)
      return reject('UNPINNED_ANCHOR_KEY');
    // Verify the canonical signature over the early-captured byte snapshot.
    if (!verify('sha256',Buffer.concat([PREFIX,snapshotBytes]),key,signature))
      return reject('ANCHOR_SIGNATURE_INVALID');
    // Decode an exact byte snapshot only after signature verification.
    // Preserve any leading UTF-8 BOM in the decoded text: the default
    // decoder silently strips it, creating a second signed byte encoding
    // for the same JSON document. JSON.parse will reject the preserved BOM.
    const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(snapshotBytes);
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
        doc.schema !== AUDIT_ANCHOR_SCHEMA ||
        !Number.isSafeInteger(doc.sequence) ||
        doc.sequence < minimumAnchorSequence || doc.sequence > 4096 ||
        !HEX.test(doc.headHash) ||
        !pinOK(doc.genesisPin) || !pinOK(doc.currentPin) ||
        !samePin(doc.genesisPin,genesisSnapshot) ||
        !samePin(doc.currentPin,currentSnapshot))
      return reject('ANCHOR_ROLLBACK_OR_MISMATCH');
    // A byte-stable signed schema also requires a fixed member order.
    // JSON.stringify(parse(text)) alone permits multiple valid permutations;
    // reserialize the exact typed contract to eliminate such aliases.
    const orderedPin = pin => ({
      schema:pin.schema, issuerFingerprint:pin.issuerFingerprint,
      revision:pin.revision, registrySha256:pin.registrySha256
    });
    const canonicalDocument = JSON.stringify({
      schema:doc.schema, sequence:doc.sequence, headHash:doc.headHash,
      genesisPin:orderedPin(doc.genesisPin),
      currentPin:orderedPin(doc.currentPin)
    });
    if (canonicalDocument !== text)
      return reject('NONCANONICAL_ANCHOR_DOCUMENT');
    // One descriptor read establishes the length/sequence agreement before
    // enumerable Proxy traps or individual untrusted ledger entries are read.
    const entriesSnapshot = captureLedgerEntries(entries, doc.sequence);
    if (!entriesSnapshot) return reject('LEDGER_INVALID_CHAIN_LINK');
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
