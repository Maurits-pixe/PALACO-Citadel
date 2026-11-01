// EARTH-118: read-only verification entry point with independently pinned registry.
import {verifyTrustSnapshotAttestation} from './earth-116-trust-attestation.mjs';
import {verifySignedAuditEvidence} from './earth-108-signed-evidence.mjs';
const hold=reason=>Object.freeze({status:'HOLD',reason});
export function verifyAttestedAuditEvidence({snapshot,attestation,pinnedAuthorityKey,nowEpoch,minimumAcceptedEpoch,chain,receipts,signatures,checkpoint,signatureProtocol}={}) {
 const a=verifyTrustSnapshotAttestation({snapshot,attestation,pinnedAuthorityKey,nowEpoch});
 if(a.status!=='ATTESTATION_MATCH') return hold('REGISTRY_ATTESTATION_UNTRUSTED');
 if(snapshot.authenticated!==true) return hold('REGISTRY_AUTHENTICATION_UNDECLARED');
 if(!checkpoint||checkpoint.length!==snapshot.checkpoint.length||checkpoint.headHash!==snapshot.checkpoint.headHash) return hold('CHECKPOINT_MISMATCH');
 return verifySignedAuditEvidence({
  chain,receipts,signatures,checkpoint,
  trustedFloor:snapshot.checkpoint,
  trustAnchors:snapshot.trustAnchors,
  revokedReviewers:snapshot.revokedReviewers,
  revokedKeys:snapshot.revokedKeys,
  trustedEpoch:snapshot.epoch,
  minimumAcceptedEpoch,
  signatureProtocol,
  trustSnapshot:snapshot,
  nowEpoch
 });
}
// The caller MUST independently authenticate the pinned authority key.
// This entry point does not confer signing, storage, release or authorization powers.
