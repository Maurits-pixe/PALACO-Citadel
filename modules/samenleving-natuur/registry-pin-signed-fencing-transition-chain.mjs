import {createHash,createPublicKey,verify} from 'node:crypto';
import {computeFencingAnchorHash,inspectFencingEpochAnchorChain,FENCING_ANCHOR_SCHEMA} from './registry-pin-fencing-epoch-anchor-chain.mjs';

export const SIGNED_FENCING_TRANSITION_SCHEMA='palaco-citadel-signed-fencing-transition-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-FENCING-TRANSITION-V1\n');
const HEX=/^[0-9a-f]{64}$/;
// Accept only minimal DER SEQUENCEs of two positive P-256 ECDSA scalars.
// A valid cryptographic check must not accept multiple transport encodings.
const P256_ORDER=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
function canonicalWitnessDer(signature){
 if(signature.length<8||signature.length>72||
    signature[0]!==0x30||signature[1]!==signature.length-2)return false;
 let offset=2;
 for(let part=0;part<2;part++){
  if(offset+2>signature.length||signature[offset]!==0x02)return false;
  const size=signature[offset+1];offset+=2;
  if(size<1||size>33||offset+size>signature.length)return false;
  const first=signature[offset],second=size>1?signature[offset+1]:0;
  if((first&0x80)||(size>1&&first===0&&!(second&0x80))||
     (size===33&&first!==0)||(size===1&&first===0))return false;
  let scalar=0n;
  for(let i=0;i<size;i++)scalar=(scalar<<8n)|BigInt(signature[offset+i]);
  if(scalar===0n||scalar>=P256_ORDER)return false;
  offset+=size;
 }
 return offset===signature.length;
}
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
// Snapshot a bounded witness roster using own data descriptors. Iterating a
// caller-owned array directly can execute indexed getters or Proxy get traps.
function captureWitnessRoster(roster){
 if(!Array.isArray(roster))return null;
 const length=Object.getOwnPropertyDescriptor(roster,'length');
 if(!length||!Object.hasOwn(length,'value')||
    !Number.isSafeInteger(length.value)||length.value<2||length.value>5)return null;
 const names=Reflect.ownKeys(roster);
 if(names.length!==length.value+1)return null;
 const copy=[];
 for(let i=0;i<length.value;i++){
  const field=Object.getOwnPropertyDescriptor(roster,String(i));
  if(!field||!Object.hasOwn(field,'value'))return null;
  copy.push(field.value);
 }
 if(names.some(name=>name!=='length'&&
   (typeof name!=='string'||!/^(0|[1-9][0-9]*)$/.test(name)||
    Number(name)>=length.value)))return null;
 return copy;
}
// The same descriptor-only boundary is required for the bounded transition
// batches and witness-evidence arrays. Never invoke caller-supplied iterators,
// indexed getters or inherited values during signature and epoch verification.
function captureBoundedDataArray(array,min,max){
 if(!Array.isArray(array))return null;
 const length=Object.getOwnPropertyDescriptor(array,'length');
 if(!length||!Object.hasOwn(length,'value')||
    !Number.isSafeInteger(length.value)||
    length.value<min||length.value>max)return null;
 const names=Reflect.ownKeys(array);
 if(names.length!==length.value+1||
    names.some(name=>name!=='length'&&
      (typeof name!=='string'||!/^(0|[1-9][0-9]*)$/.test(name)||
       Number(name)>=length.value)))return null;
 const captured=[];
 for(let i=0;i<length.value;i++){
  const field=Object.getOwnPropertyDescriptor(array,String(i));
  if(!field||!Object.hasOwn(field,'value'))return null;
  captured.push(field.value);
 }
 return captured;
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
  if(!x||!Number.isSafeInteger(x.minimumEpoch)||x.minimumEpoch<1)return deny('INVALID_INPUT');
  const batches=captureBoundedDataArray(x.batches,1,8);
  if(!batches)return deny('INVALID_INPUT');
  const roster=captureWitnessRoster(x.requiredWitnessIds);
  if(!roster)return deny('INVALID_WITNESS_ROSTER');
  const first=exact(x.previousAnchor,AF),last=exact(x.expectedFinalAnchor,AF);
  if(!first||!last||first.schema!==FENCING_ANCHOR_SCHEMA||
   last.schema!==FENCING_ANCHOR_SCHEMA||!hex(first.anchorSha256)||!hex(last.anchorSha256))
   return deny('INVALID_ANCHOR');
  if(first.epoch<x.minimumEpoch)return deny('EXTERNAL_EPOCH_FLOOR');
  const ids=new Set();
  for(const name of roster){
   if(!id(name)||ids.has(name))return deny('INVALID_WITNESS_ROSTER');
   ids.add(name);
  }
  const pins=exact(x.witnessKeyPins,roster);
  if(!pins)return deny('INVALID_WITNESS_PINS');
  const keyPins=new Set();
  for(const name of ids){
   if(!hex(pins[name])||keyPins.has(pins[name]))return deny('DUPLICATE_OR_INVALID_WITNESS_KEY_PIN');
   keyPins.add(pins[name]);
  }
  let cursor=first;
  const steps=[];
  for(const batchInput of batches){
   const batch=exact(batchInput,BATCH),payload=batch&&exact(batch.payload,PF);
   const step=payload&&exact(payload.step,SF);
   const witnesses=batch&&captureBoundedDataArray(batch.witnesses,ids.size,ids.size);
   if(!batch||!payload||!step||!witnesses)return deny('INVALID_BATCH');
   if(!hex(payload.previousAnchorSha256)||!hex(payload.candidateAnchorSha256)||
    payload.previousAnchorSha256!==cursor.anchorSha256)return deny('ANCHOR_CHAIN_DISCONTINUITY');
   if(step.registryKey!==cursor.registryKey||!id(step.leaderId)||
    !Number.isSafeInteger(step.previousEpoch)||!Number.isSafeInteger(step.epoch)||
    step.previousEpoch!==cursor.epoch||step.epoch!==cursor.epoch+1||
    !hex(step.tokenSha256)||!hex(step.checkpointHeadSha256))return deny('NON_CONSECUTIVE_EPOCH');
   const computed=computeFencingAnchorHash(cursor.anchorSha256,step);
   if(!computed||computed!==payload.candidateAnchorSha256)return deny('INVALID_CANDIDATE_ANCHOR');
   const seen=new Set();
   for(const evidence of witnesses){
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
    if(signature.toString('base64url')!==e.signatureBase64Url||
     !canonicalWitnessDer(signature))return deny('INVALID_SIGNATURE_ENCODING');
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
