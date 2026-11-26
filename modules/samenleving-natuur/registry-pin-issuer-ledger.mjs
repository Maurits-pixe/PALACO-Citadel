import {createHash} from 'node:crypto';
import {inspectWitnessIssuerRotation} from './registry-pin-witness-issuer-rotation.mjs';

export const ISSUER_PIN_LEDGER_SCHEMA='palaco-citadel-issuer-pin-ledger-v1';
const HEX=/^[0-9a-f]{64}$/;
const DOMAIN='PALACO-CITADEL-ISSUER-PIN-LEDGER-V1\n';
const hash=value=>createHash('sha256').update(value).digest('hex');
const deny=reason=>({schema:ISSUER_PIN_LEDGER_SCHEMA,transitionAccepted:false,
  proposedPin:null,reason,trust:'NOT_ESTABLISHED',authorization:'DENY',
  stateChanged:false,releaseAllowed:false,executionAllowed:false});
const capture=(obj,keys)=>{
 if(obj===null||typeof obj!=='object'||Array.isArray(obj)||
    Object.getPrototypeOf(obj)!==Object.prototype)return null;
 const own=Reflect.ownKeys(obj);
 if(own.length!==keys.length||
    own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const result={};
 for(const k of keys){
  const d=Object.getOwnPropertyDescriptor(obj,k);
  if(!d||!Object.hasOwn(d,'value'))return null;
  result[k]=d.value;
 }
 return result;
};
const pinKeys=['schema','sequence','issuerFingerprint','snapshotSha256','headSha256','epoch'];
const pinOK=p=>p&&p.schema===ISSUER_PIN_LEDGER_SCHEMA&&
 Number.isSafeInteger(p.sequence)&&p.sequence>=0&&
 Number.isSafeInteger(p.epoch)&&p.epoch>=1&&
 typeof p.issuerFingerprint==='string'&&HEX.test(p.issuerFingerprint)&&
 typeof p.snapshotSha256==='string'&&HEX.test(p.snapshotSha256)&&
 typeof p.headSha256==='string'&&HEX.test(p.headSha256);

/**
 * No writes. Computes a hypothetical single monotone key-pin transition.
 * An actual store must protect oldPin and atomically enforce expectedPin.
 */
export function inspectIssuerPinLedgerAdvance(input={}) {
 try {
  const a=capture(input,['oldPin','expectedPin','rotationProof']);
  if(!a)return deny('INVALID_INPUT');
  const old=capture(a.oldPin,pinKeys),expected=capture(a.expectedPin,pinKeys);
  if(!pinOK(old)||!pinOK(expected))return deny('INVALID_PIN');
  if(pinKeys.some(k=>old[k]!==expected[k]))
    return deny('PIN_CAS_CONFLICT');
  if(old.sequence>=4096)return deny('MAX_PIN_SEQUENCE');
  const proofInput=capture(a.rotationProof,[
   'previousBytes','previousSignatureBase64Url','candidateBytes',
   'candidateSignatureBase64Url','oldIssuerPublicJwk','newIssuerPublicJwk',
   'pinnedOldIssuerFingerprint','expectedPreviousSha256','minimumEpoch',
   'rotationStatementBytes','oldRotationSignatureBase64Url',
   'newRotationSignatureBase64Url'
  ]);
  if(!proofInput)return deny('INVALID_ROTATION_PROOF');
  if(proofInput.pinnedOldIssuerFingerprint!==old.issuerFingerprint||
     proofInput.expectedPreviousSha256!==old.snapshotSha256||
     proofInput.minimumEpoch!==old.epoch)
    return deny('ROTATION_PIN_MISMATCH');
  const proof=inspectWitnessIssuerRotation(proofInput);
  if(!proof.rotationConsistent)
    return deny('ROTATION_'+proof.reason);
  if(proof.previousEpoch!==old.epoch||
     proof.candidateEpoch<=old.epoch||
     proof.newIssuerFingerprint===old.issuerFingerprint)
    return deny('ROTATION_EPOCH_OR_KEY_REPLAY');
  if(!(proofInput.candidateBytes instanceof Uint8Array)||
     !(proofInput.rotationStatementBytes instanceof Uint8Array))
    return deny('INVALID_ROTATION_BYTES');
  const candidateSha256=hash(Buffer.from(proofInput.candidateBytes));
  const statementSha256=hash(Buffer.from(proofInput.rotationStatementBytes));
  const nextSequence=old.sequence+1;
  const nextHead=hash(DOMAIN+JSON.stringify([
    nextSequence,old.headSha256,old.issuerFingerprint,
    proof.newIssuerFingerprint,old.snapshotSha256,candidateSha256,
    statementSha256,old.epoch,proof.candidateEpoch
  ]));
  return {schema:ISSUER_PIN_LEDGER_SCHEMA,transitionAccepted:true,
    proposedPin:{schema:ISSUER_PIN_LEDGER_SCHEMA,sequence:nextSequence,
      issuerFingerprint:proof.newIssuerFingerprint,
      snapshotSha256:candidateSha256,headSha256:nextHead,
      epoch:proof.candidateEpoch},
    unresolvedGates:['INDEPENDENT_PROTECTED_PIN_STORAGE',
      'ATOMIC_AUTHENTICATED_COMPARE_AND_SWAP','EXTERNAL_DUAL_APPROVAL',
      'TRUSTED_TIME_AND_REVOCATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    stateChanged:false,releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_INPUT');}
}
