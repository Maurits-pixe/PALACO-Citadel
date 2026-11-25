import {createHash,createPublicKey,verify} from 'node:crypto';
import {computeFencingAnchorHash,inspectFencingEpochAnchorChain,FENCING_ANCHOR_SCHEMA} from './registry-pin-fencing-epoch-anchor-chain.mjs';

export const SIGNED_FENCING_TRANSITION_SCHEMA='palaco-citadel-signed-fencing-transition-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-FENCING-TRANSITION-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const AF=['schema','registryKey','epoch','leaderId','tokenSha256','checkpointHeadSha256','anchorSha256'];
const SF=['registryKey','previousEpoch','epoch','leaderId','tokenSha256','checkpointHeadSha256'];
const PF=['previousAnchorSha256','step','candidateAnchorSha256'];
const EF=['witnessId','witnessPublicJwk','expectedWitnessFingerprint','signatureBase64Url'];
const BATCH=['payload','witnesses'];
const deny=reason=>Object.freeze({schema:SIGNED_FENCING_TRANSITION_SCHEMA,verified:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,releaseAllowed:false,executionAllowed:false});
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const names=Reflect.ownKeys(o);
 if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const hex=v=>typeof v==='string'&&HEX.test(v);
const id=v=>typeof v==='string'&&/^[a-z0-9-]{3,80}$/.test(v);
const eq=(a,b,fields)=>fields.every(k=>a[k]===b[k]);
/**
 * Pure signature verification of caller-provided transition bundles.
 * Does not authenticate independent witness custody or external epoch pins.
 */
export function inspectSignedFencingTransitionChain(input={}){
 try{
  const x=exact(input,['previousAnchor','batches','expectedFinalAnchor','minimumEpoch','requiredWitnessIds','witnessKeyPins']);
  if(!x||!Array.isArray(x.batches)||x.batches.length<1||x.batches.length>8||
   !Array.isArray(x.requiredWitnessIds)||x.requiredWitnessIds.length<2||x.requiredWitnessIds.length>5||
   !Number.isSafeInteger(x.minimumEpoch)||x.minimumEpoch<1)return deny('INVALID_INPUT');
  const first=exact(x.previousAnchor,AF),last=exact(x.expectedFinalAnchor,AF);
  if(!first||!last||first.schema!==FENCING_ANCHOR_SCHEMA||
   last.schema!==FENCING_ANCHOR_SCHEMA||!hex(first.anchorSha256)||!hex(last.anchorSha256))
   return deny('INVALID_ANCHOR');
  if(first.epoch<x.minimumEpoch)return deny('EXTERNAL_EPOCH_FLOOR');
  const ids=new Set();
  for(const name of x.requiredWitnessIds){
   if(!id(name)||ids.has(name))return deny('INVALID_WITNESS_ROSTER');
   ids.add(name);
  }
  const pins=exact(x.witnessKeyPins,x.requiredWitnessIds);
  if(!pins)return deny('INVALID_WITNESS_PINS');
  const keyPins=new Set();
  for(const name of ids){
   if(!hex(pins[name])||keyPins.has(pins[name]))return deny('DUPLICATE_OR_INVALID_WITNESS_KEY_PIN');
   keyPins.add(pins[name]);
  }
  let cursor=first;
  const steps=[];
  for(const batchInput of x.batches){
   const batch=exact(batchInput,BATCH),payload=batch&&exact(batch.payload,PF);
   const step=payload&&exact(payload.step,SF);
   if(!batch||!payload||!step||!Array.isArray(batch.witnesses)||
    batch.witnesses.length!==ids.size)return deny('INVALID_BATCH');
   if(!hex(payload.previousAnchorSha256)||!hex(payload.candidateAnchorSha256)||
    payload.previousAnchorSha256!==cursor.anchorSha256)return deny('ANCHOR_CHAIN_DISCONTINUITY');
   if(step.registryKey!==cursor.registryKey||!id(step.leaderId)||
    !Number.isSafeInteger(step.previousEpoch)||!Number.isSafeInteger(step.epoch)||
    step.previousEpoch!==cursor.epoch||step.epoch!==cursor.epoch+1||
    !hex(step.tokenSha256)||!hex(step.checkpointHeadSha256))return deny('NON_CONSECUTIVE_EPOCH');
   const computed=computeFencingAnchorHash(cursor.anchorSha256,step);
   if(!computed||computed!==payload.candidateAnchorSha256)return deny('INVALID_CANDIDATE_ANCHOR');
   const seen=new Set();
   for(const evidence of batch.witnesses){
    const e=exact(evidence,EF);
    if(!e||!ids.has(e.witnessId)||seen.has(e.witnessId))return deny('INVALID_WITNESS_EVIDENCE');
    seen.add(e.witnessId);
    if(e.expectedWitnessFingerprint!==pins[e.witnessId])return deny('WITNESS_PIN_MISMATCH');
    const jwk=exact(e.witnessPublicJwk,['kty','crv','x','y']);
    if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||
     typeof jwk.x!=='string'||typeof jwk.y!=='string'||
     !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)||!/^[A-Za-z0-9_-]{43}$/.test(jwk.y)||
     typeof e.signatureBase64Url!=='string'||!/^[A-Za-z0-9_-]{11,107}$/.test(e.signatureBase64Url))
     return deny('INVALID_WITNESS_EVIDENCE');
    const key=createPublicKey({format:'jwk',key:jwk});
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')
     return deny('INVALID_WITNESS_KEY');
    const fingerprint=createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex');
    if(fingerprint!==pins[e.witnessId])return deny('WITNESS_KEY_SUBSTITUTION');
    const signature=Buffer.from(e.signatureBase64Url,'base64url');
    if(signature.length<8||signature.length>80||
     signature.toString('base64url')!==e.signatureBase64Url)return deny('INVALID_SIGNATURE_ENCODING');
    const signed=Buffer.from(JSON.stringify({payload:{previousAnchorSha256:payload.previousAnchorSha256,
     step,candidateAnchorSha256:payload.candidateAnchorSha256},witnessId:e.witnessId}));
    if(!verify('sha256',Buffer.concat([DOMAIN,signed]),key,signature))
     return deny('INVALID_TRANSITION_SIGNATURE');
   }
   if(seen.size!==ids.size)return deny('MISSING_WITNESS');
   steps.push(step);
   cursor={schema:FENCING_ANCHOR_SCHEMA,registryKey:step.registryKey,epoch:step.epoch,
    leaderId:step.leaderId,tokenSha256:step.tokenSha256,
    checkpointHeadSha256:step.checkpointHeadSha256,anchorSha256:computed};
  }
  if(!eq(cursor,last,AF))return deny('PINNED_FINAL_ANCHOR_MISMATCH');
  const chain=inspectFencingEpochAnchorChain({previousAnchor:first,transitions:steps,
   expectedFinalAnchor:last,minimumEpoch:x.minimumEpoch});
  if(!chain.chainValid)return deny('ANCHOR_'+chain.reason);
  return Object.freeze({schema:SIGNED_FENCING_TRANSITION_SCHEMA,verified:true,
   finalEpoch:cursor.epoch,finalAnchorSha256:cursor.anchorSha256,
   witnessCount:ids.size,transitionCount:steps.length,
   unresolvedGates:Object.freeze(['INDEPENDENT_WITNESS_CUSTODY','AUTHENTICATED_WITNESS_READS',
    'EXTERNALLY_PROTECTED_ANCHOR','FRESH_REVOCATION','ATOMIC_FENCING_ENFORCEMENT']),
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   releaseAllowed:false,executionAllowed:false});
 }catch{return deny('MALFORMED_UNTRUSTED_SIGNED_TRANSITION');}
}
