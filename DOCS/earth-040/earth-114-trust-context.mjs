// EARTH-114: fail-closed trust-context freshness contract.
// Trust data must be authenticated by an independent caller. No I/O or authority granted.
export function validateTrustContext({snapshot,nowEpoch,minimumAcceptedEpoch}={}) {
 const hold=reason=>Object.freeze({status:'HOLD',reason});
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)) return hold('SNAPSHOT_MISSING');
 if(!Number.isSafeInteger(nowEpoch)||nowEpoch<0||!Number.isSafeInteger(minimumAcceptedEpoch)||minimumAcceptedEpoch<0) return hold('EPOCH_INVALID');
 if(snapshot.authenticated!==true) return hold('SNAPSHOT_UNAUTHENTICATED');
 if(!Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<minimumAcceptedEpoch||snapshot.epoch>nowEpoch) return hold('SNAPSHOT_EPOCH_INVALID');
 if(!Number.isSafeInteger(snapshot.expiresAtEpoch)||snapshot.expiresAtEpoch<nowEpoch||snapshot.expiresAtEpoch<snapshot.epoch) return hold('SNAPSHOT_EXPIRED');
 if(!(snapshot.trustAnchors instanceof Map)||!(snapshot.revokedReviewers instanceof Set)||!(snapshot.revokedKeys instanceof Set)) return hold('TRUST_FIELDS_MISSING');
 if(!snapshot.checkpoint||!Number.isSafeInteger(snapshot.checkpoint.length)||snapshot.checkpoint.length<1||!/^[a-f0-9]{64}$/.test(snapshot.checkpoint.headHash??'')) return hold('CHECKPOINT_MISSING');
 return Object.freeze({status:'TRUST_CONTEXT_STRUCTURALLY_VALID',reason:null});
}
// This structural validator does not prove authentication or freshness itself.
