import { createHash, createPublicKey, verify } from 'node:crypto';
import { computeRegistryPinEntryHash, inspectRegistryPinLedger } from './registry-pin-ledger.mjs';

export const REVIEW_CONTRACT_SCHEMA = 'palaco-citadel-pin-update-review-v1';
const DOMAIN = Buffer.from('PALACO-CITADEL-PIN-UPDATE-REVIEW-V1\n');
const HEX = /^[a-f0-9]{64}$/;
const strict = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length &&
  keys.every(key => Object.hasOwn(v,key) &&
    Object.getOwnPropertyDescriptor(v,key)?.get === undefined);
const pinKeys = ['schema','issuerFingerprint','revision','registrySha256'];
const pinOK = p => strict(p,pinKeys) && p.schema==='palaco-citadel-registry-snapshot-pin-v1' &&
  HEX.test(p.issuerFingerprint) && HEX.test(p.registrySha256) &&
  Number.isSafeInteger(p.revision) && p.revision > 0;
const samePin = (a,b) => a.revision===b.revision &&
  a.issuerFingerprint===b.issuerFingerprint && a.registrySha256===b.registrySha256;
const rejected = reason => ({
  schema:REVIEW_CONTRACT_SCHEMA, reviewSignaturesValid:false,
  proposalConsistent:false, reason, candidateLedgerHash:null,
  trust:'NOT_ESTABLISHED',authorization:'DENY',executionAllowed:false,
  releaseAllowed:false,stateChanged:false
});
const hash = b => createHash('sha256').update(b).digest('hex');

/**
 * Offline, read-only review preflight. The caller MUST NOT treat an accepted
 * signature as independently verified reviewer identity or approval authority.
 * No CAS, persistence or authorization action occurs.
 */
export function inspectDualReviewPinUpdate({
  genesisPin, entries, expectedHeadHash, currentPin, transition, approvals
} = {}) {
  try {
    if(!pinOK(currentPin) || !pinOK(genesisPin) ||
       !strict(transition,['schema','candidateVerified','proposedPin',
         'previousRevision','previousSnapshotSha256','stateChanged',
         'requiredBeforeCommit','trust','authorization','executionAllowed','releaseAllowed']) ||
       transition.schema!=='palaco-citadel-registry-pin-transition-v1' ||
       transition.candidateVerified!==true || transition.stateChanged!==false ||
       transition.authorization!=='DENY' || transition.releaseAllowed!==false ||
       transition.executionAllowed!==false || !pinOK(transition.proposedPin) ||
       transition.previousRevision!==currentPin.revision ||
       transition.previousSnapshotSha256!==currentPin.registrySha256 ||
       transition.proposedPin.issuerFingerprint!==currentPin.issuerFingerprint ||
       transition.proposedPin.revision<=currentPin.revision ||
       !Array.isArray(approvals) || approvals.length!==2)
      return rejected('INVALID_PROPOSAL');
    const inspection=inspectRegistryPinLedger({
      genesisPin,entries,expectedHeadHash,expectedCurrentPin:currentPin
    });
    if(!inspection.chainConsistent) return rejected('LEDGER_'+inspection.reason);
    const entry={
      sequence:entries.length+1,previousHash:expectedHeadHash,
      fromPin:currentPin,toPin:transition.proposedPin
    };
    const candidateLedgerHash=computeRegistryPinEntryHash(entry);
    if(!candidateLedgerHash) return rejected('INVALID_CANDIDATE_LINK');
    const signingMessage=Buffer.concat([DOMAIN,Buffer.from(candidateLedgerHash,'utf8')]);
    const identities=new Set(),fingerprints=new Set();
    for(const approval of approvals){
      if(!strict(approval,['reviewerId','reviewerFingerprint',
        'publicJwk','signatureBase64Url']) ||
        typeof approval.reviewerId!=='string' ||
        !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(approval.reviewerId) ||
        !HEX.test(approval.reviewerFingerprint) ||
        identities.has(approval.reviewerId) ||
        fingerprints.has(approval.reviewerFingerprint) ||
        !strict(approval.publicJwk,['kty','crv','x','y']) ||
        approval.publicJwk.kty!=='EC' || approval.publicJwk.crv!=='P-256' ||
        typeof approval.signatureBase64Url!=='string' ||
        !/^[A-Za-z0-9_-]+$/.test(approval.signatureBase64Url))
        return rejected('INVALID_OR_DUPLICATE_REVIEWER');
      const key=createPublicKey({key:approval.publicJwk,format:'jwk'});
      if(key.asymmetricKeyType!=='ec' || key.asymmetricKeyDetails?.namedCurve!=='prime256v1' ||
        hash(key.export({type:'spki',format:'der'}))!==approval.reviewerFingerprint)
        return rejected('REVIEWER_KEY_MISMATCH');
      const sig=Buffer.from(approval.signatureBase64Url,'base64url');
      if(sig.length<8 || sig.length>80 ||
        sig.toString('base64url')!==approval.signatureBase64Url ||
        !verify('sha256',signingMessage,{key,dsaEncoding:'der'},sig))
        return rejected('REVIEW_SIGNATURE_INVALID');
      identities.add(approval.reviewerId);
      fingerprints.add(approval.reviewerFingerprint);
    }
    return {
      schema:REVIEW_CONTRACT_SCHEMA,
      reviewSignaturesValid:true,proposalConsistent:true,
      candidateLedgerHash,reviewCount:2,
      unresolvedGates:['INDEPENDENT_IDENTITY_AND_ROLE_ATTESTATION',
        'TRUSTED_TIME_AND_REVOCATION','PROTECTED_HEAD_ANCHOR','ATOMIC_CAS_STORAGE'],
      trust:'NOT_ESTABLISHED',authorization:'DENY',executionAllowed:false,
      releaseAllowed:false,stateChanged:false
    };
  }catch{return rejected('UNTRUSTED_OR_MALFORMED_INPUT');}
}
