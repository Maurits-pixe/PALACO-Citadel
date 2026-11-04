// EARTH-117: deterministic, strict registry serialization for attested trust snapshots.
// Explicitly reject unsupported or ambiguous keys and unbounded values.
const HEX=/^[0-9a-f]{64}$/;
const safeId=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(x);
export function canonicalTrustRegistry(snapshot) {
 if(!snapshot||!(snapshot.trustAnchors instanceof Map)||!(snapshot.revokedReviewers instanceof Set)||!(snapshot.revokedKeys instanceof Set)) throw Error('REGISTRY_MISSING');
 const anchors=[...snapshot.trustAnchors.entries()];
 if(anchors.some(([id,pem])=>!safeId(id)||typeof pem!=='string'||pem.length>8192||!pem.startsWith('-----BEGIN PUBLIC KEY-----'))) throw Error('ANCHOR_INVALID');
 const revokedReviewers=[...snapshot.revokedReviewers],revokedKeys=[...snapshot.revokedKeys];
 if([...revokedReviewers,...revokedKeys].some(x=>!safeId(x))) throw Error('REVOCATION_INVALID');
 const ids=anchors.map(x=>x[0]);
 if(new Set(ids).size!==ids.length) throw Error('DUPLICATE_ANCHOR');
 anchors.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 revokedReviewers.sort();revokedKeys.sort();
 if(!Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<0||!Number.isSafeInteger(snapshot.expiresAtEpoch)||snapshot.expiresAtEpoch<snapshot.epoch||!Number.isSafeInteger(snapshot.checkpoint?.length)||snapshot.checkpoint.length<1||!HEX.test(snapshot.checkpoint.headHash??'')) throw Error('SNAPSHOT_INVALID');
 return JSON.stringify({protocol:'EARTH-117-v1',epoch:snapshot.epoch,expiresAtEpoch:snapshot.expiresAtEpoch,checkpoint:{length:snapshot.checkpoint.length,headHash:snapshot.checkpoint.headHash},trustAnchors:anchors,revokedReviewers,revokedKeys});
}
