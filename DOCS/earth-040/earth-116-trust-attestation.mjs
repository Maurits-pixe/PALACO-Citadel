// EARTH-116: independently pinned Ed25519 trust snapshot attestation.
// Pinned key must be provided out of band, never from the snapshot itself.
import {createPublicKey,verify} from 'node:crypto';
import {canonicalTrustRegistry} from './earth-117-canonical-registry.mjs';
const DOMAIN=Buffer.from('PALACO/EARTH/TRUST-SNAPSHOT/ED25519/v1\\0','utf8');
const HEX=/^[a-f0-9]{64}$/;
const B64=/^[A-Za-z0-9+/]{86}==$/;
const hold=reason=>Object.freeze({status:'HOLD',reason});
export function trustSnapshotMessage({epoch,expiresAtEpoch,checkpoint}={}) {
 if(!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(expiresAtEpoch)||expiresAtEpoch<epoch||!checkpoint||!Number.isSafeInteger(checkpoint.length)||checkpoint.length<1||!HEX.test(checkpoint.headHash??'')) throw Error('SNAPSHOT_FIELDS_INVALID');
 return Buffer.concat([DOMAIN,Buffer.from(canonicalTrustRegistry(arguments[0]),'utf8')]);
}
export function verifyTrustSnapshotAttestation({snapshot,attestation,pinnedAuthorityKey,nowEpoch}={}) {
 if(!snapshot||!attestation||attestation.protocol!=='EARTH-117-v1'||!B64.test(attestation.signature??'')) return hold('ATTESTATION_MISSING');
 if(!Number.isSafeInteger(nowEpoch)||nowEpoch<0||!Number.isSafeInteger(snapshot.expiresAtEpoch)||snapshot.expiresAtEpoch<nowEpoch) return hold('SNAPSHOT_EXPIRED');
 if(typeof pinnedAuthorityKey!=='string') return hold('PINNED_KEY_MISSING');
 try {
  const key=createPublicKey(pinnedAuthorityKey);
  if(key.asymmetricKeyType!=='ed25519') return hold('UNSUPPORTED_KEY');
  const ok=verify(null,trustSnapshotMessage(snapshot),key,Buffer.from(attestation.signature,'base64'));
  return ok?Object.freeze({status:'ATTESTATION_MATCH',reason:null}):hold('ATTESTATION_INVALID');
 }catch{return hold('ATTESTATION_INVALID');}
}
// Only epoch, expiry and checkpoint are covered; key/revocation registry binding remains OPEN.
