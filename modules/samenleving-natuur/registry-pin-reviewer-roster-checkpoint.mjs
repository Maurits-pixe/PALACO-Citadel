import {createHash} from 'node:crypto';
import {inspectReviewerRosterTransition} from './registry-pin-reviewer-roster-transition.mjs';

export const REVIEWER_ROSTER_CHECKPOINT_SCHEMA='palaco-citadel-reviewer-roster-checkpoint-v1';
const HEX=/^[0-9a-f]{64}$/;
const DOMAIN='PALACO-CITADEL-REVIEWER-ROSTER-CHECKPOINT-V1\n';
const sha=b=>createHash('sha256').update(b).digest('hex');
const deny=reason=>({schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,
 checkpointMatched:false,reason,proposedCheckpoint:null,
 trust:'NOT_ESTABLISHED',authorization:'DENY',
 stateChanged:false,releaseAllowed:false,executionAllowed:false});
function snapshot(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||
    own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const copy={};
 for(const k of keys){
   const d=Object.getOwnPropertyDescriptor(o,k);
   if(!d||!Object.hasOwn(d,'value'))return null;
   copy[k]=d.value;
 }
 return copy;
}
const fields=['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256'];
const valid=p=>p&&p.schema===REVIEWER_ROSTER_CHECKPOINT_SCHEMA&&
 Number.isSafeInteger(p.sequence)&&p.sequence>=1&&p.sequence<4096&&
 Number.isSafeInteger(p.revision)&&p.revision>=1&&
 typeof p.issuerFingerprint==='string'&&HEX.test(p.issuerFingerprint)&&
 typeof p.rosterSha256==='string'&&HEX.test(p.rosterSha256)&&
 typeof p.headSha256==='string'&&HEX.test(p.headSha256);
const transitionFields=['previousBytes','previousSignatureBase64Url',
 'candidateBytes','candidateSignatureBase64Url','issuerPublicJwk',
 'expectedIssuerFingerprint','expectedPreviousSha256','minimumRevision'];
/**
 * Read-only, local CAS and hash-chain preflight for signed roster history.
 * currentPin/expectedPin are supplied, NOT obtained from protected storage.
 * Never grants authority or modifies state.
 */
export function inspectReviewerRosterCheckpointAdvance(input={}){
 try{
  const x=snapshot(input,['currentPin','expectedPin','transition']);
  if(!x)return deny('INVALID_CHECKPOINT_INPUT');
  const current=snapshot(x.currentPin,fields),expected=snapshot(x.expectedPin,fields);
  if(!valid(current)||!valid(expected))return deny('INVALID_CHECKPOINT');
  if(fields.some(k=>current[k]!==expected[k]))return deny('CHECKPOINT_CAS_CONFLICT');
  const transition=snapshot(x.transition,transitionFields);
  if(!transition)return deny('INVALID_ROSTER_TRANSITION');
  if(transition.expectedIssuerFingerprint!==current.issuerFingerprint||
     transition.expectedPreviousSha256!==current.rosterSha256||
     transition.minimumRevision!==current.revision)
    return deny('CHECKPOINT_PIN_MISMATCH');
  const result=inspectReviewerRosterTransition(transition);
  if(!result.transitionConsistent)return deny('TRANSITION_'+result.reason);
  if(result.previousRevision!==current.revision||
     result.previousSha256!==current.rosterSha256||
     result.candidateRevision<=current.revision)
    return deny('CHECKPOINT_REPLAY');
  const sequence=current.sequence+1;
  const headSha256=sha(DOMAIN+JSON.stringify([sequence,current.headSha256,
   current.issuerFingerprint,current.rosterSha256,result.candidateSha256,
   current.revision,result.candidateRevision]));
  return {schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,checkpointMatched:true,
    proposedCheckpoint:{schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,
      sequence,revision:result.candidateRevision,
      issuerFingerprint:current.issuerFingerprint,
      rosterSha256:result.candidateSha256,headSha256},
    unresolvedGates:['INDEPENDENT_AUTHENTICATED_CHECKPOINT_READ',
      'ATOMIC_PERSISTENT_COMPARE_AND_SWAP','INDEPENDENT_PUBLICATION',
      'FRESH_REVOCATION','TRUSTED_ISSUER_CUSTODY'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    stateChanged:false,releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_CHECKPOINT');}
}
