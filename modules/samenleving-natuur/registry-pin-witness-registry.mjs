import {inspectAnchorWitnessQuorum} from './registry-pin-anchor-witness.mjs';

export const WITNESS_REGISTRY_SCHEMA='palaco-citadel-witness-registry-policy-v1';
const HEX=/^[a-f0-9]{64}$/;
const reject=reason=>({schema:WITNESS_REGISTRY_SCHEMA,
  witnessPolicyMatched:false,reason,trust:'NOT_ESTABLISHED',
  authorization:'DENY',stateChanged:false,
  executionAllowed:false,releaseAllowed:false});
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype &&
  Reflect.ownKeys(o).length===keys.length &&
  keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(o,k)??{},'value'));
const validId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(s);

/**
 * Read-only enrollment and revocation preflight. `registry` and its epoch
 * floor MUST come from independent trusted storage for any real assurance.
 * A caller-controlled snapshot can be forged; return DENY in every case.
 */
export function inspectWitnessRegistryPolicy(input={}) {
 try {
  const {anchorBytes,claimedAnchorSha256,witnesses,registry,minimumEpoch}=input;
  if(!exact(registry,['schema','epoch','members'])||
    registry.schema!==WITNESS_REGISTRY_SCHEMA||
    !Number.isSafeInteger(registry.epoch)||registry.epoch<1||
    !Number.isSafeInteger(minimumEpoch)||minimumEpoch<1||
    registry.epoch<minimumEpoch||
    !Array.isArray(registry.members)||registry.members.length<2||
    registry.members.length>256||
    !Array.isArray(witnesses)||witnesses.length!==2)
    return reject('INVALID_OR_ROLLED_BACK_REGISTRY');

  const byId=new Map(),seenKeys=new Set();
  for(const member of registry.members) {
    if(!exact(member,['witnessId','fingerprint','status'])||
      !validId(member.witnessId)||typeof member.fingerprint!=='string'||
      !HEX.test(member.fingerprint)||
      !['ACTIVE','REVOKED'].includes(member.status)||
      byId.has(member.witnessId)||seenKeys.has(member.fingerprint))
      return reject('INVALID_OR_DUPLICATE_ENROLLMENT');
    byId.set(member.witnessId,member);
    seenKeys.add(member.fingerprint);
  }
  const approvedFingerprints=[];
  for(const witness of witnesses){
    if(!witness||!validId(witness.witnessId))return reject('INVALID_WITNESS_ID');
    const member=byId.get(witness.witnessId);
    if(!member)return reject('WITNESS_NOT_ENROLLED');
    if(member.status!=='ACTIVE')return reject('WITNESS_REVOKED');
    if(member.fingerprint!==witness.fingerprint)return reject('WITNESS_KEY_REBOUND');
    approvedFingerprints.push(member.fingerprint);
  }
  if(approvedFingerprints[0]===approvedFingerprints[1])
    return reject('NON_DISTINCT_ENROLLMENT');
  const proof=inspectAnchorWitnessQuorum({
    anchorBytes,claimedAnchorSha256,witnesses,approvedFingerprints
  });
  if(!proof.witnessQuorumValid)return reject('SIGNATURE_'+proof.reason);
  return {
    schema:WITNESS_REGISTRY_SCHEMA,witnessPolicyMatched:true,
    registryEpoch:registry.epoch,anchorSha256:proof.anchorSha256,
    witnessesChecked:2,
    unresolvedGates:['INDEPENDENT_SIGNED_ENROLLMENT_REGISTER',
      'PROTECTED_EPOCH_FLOOR','TRUSTED_REVOCATION_FRESHNESS',
      'INDEPENDENT_SIGNER_CUSTODY'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    stateChanged:false,executionAllowed:false,releaseAllowed:false
  };
 }catch{return reject('MALFORMED_UNTRUSTED_REGISTRY');}
}
