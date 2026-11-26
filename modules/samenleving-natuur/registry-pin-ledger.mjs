import { createHash } from 'node:crypto';
import { PIN_SCHEMA } from './registry-snapshot-pin.mjs';

export const LEDGER_SCHEMA = 'palaco-citadel-registry-pin-ledger-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_ENTRIES = 4096;
const fields = (x,keys) => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype &&
  Object.keys(x).length === keys.length && keys.every(k=>Object.hasOwn(x,k));
const pinFields = ['schema','issuerFingerprint','revision','registrySha256'];
const recordFields = ['sequence','previousHash','fromPin','toPin'];
const pinOK = p => fields(p,pinFields) && p.schema===PIN_SCHEMA &&
  DIGEST.test(p.issuerFingerprint) && DIGEST.test(p.registrySha256) &&
  Number.isSafeInteger(p.revision) && p.revision>0;
const samePin = (a,b) => a.schema===b.schema &&
  a.issuerFingerprint===b.issuerFingerprint &&
  a.registrySha256===b.registrySha256 && a.revision===b.revision;
const hashEntry = e => createHash('sha256').update(
  'PALACO-CITADEL-PIN-LEDGER-V1\n'+JSON.stringify([
    e.sequence,e.previousHash,
    e.fromPin.schema,e.fromPin.issuerFingerprint,e.fromPin.revision,e.fromPin.registrySha256,
    e.toPin.schema,e.toPin.issuerFingerprint,e.toPin.revision,e.toPin.registrySha256
  ]),'utf8').digest('hex');
const deny = reason => ({
  schema:LEDGER_SCHEMA, chainConsistent:false, reason,
  trust:'NOT_ESTABLISHED',authorization:'DENY',
  executionAllowed:false,releaseAllowed:false, stateChanged:false
});

/**
 * Pure read-only verification of a *supplied* hash-linked pin history.
 * An attacker able to replace both history and expected hash defeats this
 * check. A protected, independently verified anchor is indispensable.
 */
export function inspectRegistryPinLedger({ genesisPin, entries, expectedHeadHash,
  expectedCurrentPin } = {}) {
  try {
    if(!pinOK(genesisPin) || !pinOK(expectedCurrentPin) ||
      !Array.isArray(entries) || entries.length>MAX_ENTRIES ||
      typeof expectedHeadHash!=='string' || !DIGEST.test(expectedHeadHash))
      return deny('INVALID_LEDGER_INPUT');
    let active=genesisPin;
    let head='0'.repeat(64);
    for(let i=0;i<entries.length;i++){
      const entry=entries[i];
      if(!fields(entry,recordFields) ||
         entry.sequence!==i+1 || entry.previousHash!==head ||
         !pinOK(entry.fromPin) || !pinOK(entry.toPin))
        return deny('INVALID_CHAIN_LINK');
      if(!samePin(active,entry.fromPin) ||
         entry.toPin.issuerFingerprint!==active.issuerFingerprint ||
         entry.toPin.revision<=active.revision)
        return deny('PIN_ROLLBACK_OR_CONFLICT');
      head=hashEntry(entry);
      active=entry.toPin;
    }
    if(!samePin(active,expectedCurrentPin)) return deny('CURRENT_PIN_MISMATCH');
    if(head!==expectedHeadHash) return deny('HEAD_ANCHOR_MISMATCH');
    return {
      schema:LEDGER_SCHEMA, chainConsistent:true,
      entriesChecked:entries.length, headHash:head,
      currentRevision:active.revision,
      trust:'NOT_ESTABLISHED',authorization:'DENY',
      executionAllowed:false,releaseAllowed:false,stateChanged:false
    };
  }catch{return deny('MALFORMED_UNTRUSTED_LEDGER');}
}

/** Deterministic hash helper for offline test fixtures; not a signing service. */
export function computeRegistryPinEntryHash(entry) {
  try {
    if(!fields(entry,recordFields) || !Number.isSafeInteger(entry.sequence) ||
       entry.sequence<1 || !DIGEST.test(entry.previousHash) ||
       !pinOK(entry.fromPin) || !pinOK(entry.toPin)) return null;
    return hashEntry(entry);
  }catch{return null;}
}
