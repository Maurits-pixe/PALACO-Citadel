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
const pinOK = p => own(p,pinKeys) && p.schema === PIN_SCHEMA &&
  HEX.test(p.issuerFingerprint) && HEX.test(p.registrySha256) &&
  Number.isSafeInteger(p.revision) && p.revision > 0;
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
    const {
      anchorBytes, signatureBase64Url, anchorPublicJwk,
      expectedAnchorKeyFingerprint, genesisPin, entries, currentPin,
      minimumAnchorSequence
    } = input;
    if (!(anchorBytes instanceof Uint8Array) || !anchorBytes.length ||
      anchorBytes.length > 8192 || !Array.isArray(entries) ||
      !pinOK(genesisPin) || !pinOK(currentPin) ||
      typeof expectedAnchorKeyFingerprint !== 'string' ||
      !HEX.test(expectedAnchorKeyFingerprint) ||
      !Number.isSafeInteger(minimumAnchorSequence) ||
      minimumAnchorSequence < 0 ||
      !own(anchorPublicJwk,['kty','crv','x','y']) ||
      anchorPublicJwk.kty !== 'EC' || anchorPublicJwk.crv !== 'P-256' ||
      typeof signatureBase64Url !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(signatureBase64Url))
      return reject('INVALID_ANCHOR_INPUT');
    const key = createPublicKey({format:'jwk',key:anchorPublicJwk});
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
      !HEX.test(doc.headHash) || !pinOK(doc.genesisPin) ||
      !pinOK(doc.currentPin) || !samePin(doc.genesisPin,genesisPin) ||
      !samePin(doc.currentPin,currentPin) || doc.sequence !== entries.length)
      return reject('ANCHOR_ROLLBACK_OR_MISMATCH');
    const ledger=inspectRegistryPinLedger({
      genesisPin,entries,expectedHeadHash:doc.headHash,
      expectedCurrentPin:currentPin
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
