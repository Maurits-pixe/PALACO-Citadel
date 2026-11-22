import {createHash,createPublicKey,verify} from 'node:crypto';
export const WITNESS_SCHEMA='palaco-citadel-anchor-witness-quorum-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-ANCHOR-WITNESS-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const fail=reason=>({schema:WITNESS_SCHEMA,witnessQuorumValid:false,
  reason,trust:'NOT_ESTABLISHED',authorization:'DENY',
  executionAllowed:false,releaseAllowed:false,stateChanged:false});
const fields=(o,k)=>o!==null && typeof o==='object' &&
  !Array.isArray(o) && Object.getPrototypeOf(o)===Object.prototype &&
  Reflect.ownKeys(o).length===k.length &&
  k.every(x=>Object.hasOwn(Object.getOwnPropertyDescriptor(o,x)??{},'value'));
const digest=b=>createHash('sha256').update(b).digest('hex');

/**
 * Offline preflight for TWO distinct witness signatures over an anchor digest.
 * Does not establish that witnesses are genuinely independent, enrolled or
 * authorized. No external publication or persistence is performed.
 */
export function inspectAnchorWitnessQuorum(input={}) {
 try {
  const {anchorBytes,claimedAnchorSha256,witnesses,approvedFingerprints}=input;
  if(!(anchorBytes instanceof Uint8Array) || anchorBytes.length<1 ||
    anchorBytes.length>8192 || !HEX.test(claimedAnchorSha256) ||
    !Array.isArray(witnesses) || witnesses.length!==2 ||
    !Array.isArray(approvedFingerprints) || approvedFingerprints.length!==2 ||
    !approvedFingerprints.every(x=>typeof x==='string'&&HEX.test(x)) ||
    approvedFingerprints[0]===approvedFingerprints[1])
    return fail('INVALID_WITNESS_INPUT');
  const copied=Buffer.from(anchorBytes);
  const anchorSha256=digest(copied);
  if(anchorSha256!==claimedAnchorSha256) return fail('ANCHOR_DIGEST_MISMATCH');
  const message=Buffer.concat([DOMAIN,Buffer.from(anchorSha256,'ascii')]);
  const identities=new Set(),fingerprints=new Set();
  for(const w of witnesses){
    if(!fields(w,['witnessId','fingerprint','publicJwk','signatureBase64Url']) ||
      typeof w.witnessId!=='string' ||
      !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(w.witnessId) ||
      identities.has(w.witnessId) || !HEX.test(w.fingerprint) ||
      fingerprints.has(w.fingerprint) ||
      !approvedFingerprints.includes(w.fingerprint) ||
      !fields(w.publicJwk,['kty','crv','x','y']) ||
      w.publicJwk.kty!=='EC' || w.publicJwk.crv!=='P-256' ||
      typeof w.signatureBase64Url!=='string' ||
      !/^[A-Za-z0-9_-]+$/.test(w.signatureBase64Url))
      return fail('UNAPPROVED_OR_DUPLICATE_WITNESS');
    const key=createPublicKey({key:w.publicJwk,format:'jwk'});
    if(key.asymmetricKeyType!=='ec' ||
      key.asymmetricKeyDetails?.namedCurve!=='prime256v1' ||
      digest(key.export({type:'spki',format:'der'}))!==w.fingerprint)
      return fail('WITNESS_KEY_MISMATCH');
    const sig=Buffer.from(w.signatureBase64Url,'base64url');
    if(sig.length<8 || sig.length>80 ||
      sig.toString('base64url')!==w.signatureBase64Url ||
      !verify('sha256',message,{key,dsaEncoding:'der'},sig))
      return fail('WITNESS_SIGNATURE_INVALID');
    identities.add(w.witnessId);fingerprints.add(w.fingerprint);
  }
  return {schema:WITNESS_SCHEMA,witnessQuorumValid:true,
    anchorSha256,witnessCount:2,
    unresolvedGates:['INDEPENDENT_WITNESS_ENROLLMENT',
      'PROTECTED_FINGERPRINT_DISTRIBUTION','DURABLE_EXTERNAL_PUBLICATION',
      'TRUSTED_TIME_AND_REVOCATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    executionAllowed:false,releaseAllowed:false,stateChanged:false};
 }catch{return fail('MALFORMED_OR_UNTRUSTED_INPUT');}
}
