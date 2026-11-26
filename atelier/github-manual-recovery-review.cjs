'use strict';
// v7.12 — two independently pinned Ed25519 approvals for MANUAL REVIEW ONLY.
// No archive promotion, quarantine release, lock takeover or GO authority.
const crypto=require('node:crypto');
const {canonical,sha}=require('./github-custodian-key-registry.cjs');
const HEX=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9_.:-]{3,100}$/;
const STAMP=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const DOMAIN='PALACO-CITADEL-MANUAL-RECOVERY-REVIEW-V1\n';
const KEYS=['schema','reviewer_id','assessment_sha256','stage_name','sequence',
 'ledger_head_sha256','decision_id','action','created_at','expires_at'];
const LIMIT='Verified two reviewer signatures for manual assessment only; no promotion, custody or recovery permission';
const exact=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 JSON.stringify(Object.keys(v).sort())===JSON.stringify([...k].sort());
function time(s){
 if(typeof s!=='string'||!STAMP.test(s)||!Number.isFinite(Date.parse(s))||
 new Date(s).toISOString().replace('.000Z','Z')!==s)throw Error('Invalid canonical review time');
 return Date.parse(s);
}
function decode(raw){
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>20000)throw Error('Invalid canonical review input');
 let v;try{v=JSON.parse(raw.toString('utf8'));}catch{throw Error('Malformed review JSON');}
 if(!raw.equals(canonical(v)))throw Error('Noncanonical review JSON');
 return v;
}
function verify(assessmentBytes,approvals,reviewers,consumedIds,now){
 const assessment=decode(assessmentBytes);
 if(!exact(assessment,['schema','result','recovery_authorized','promotion_performed',
 'sequence','head_sha256','commit_name','stage_name','archive_manifest_sha256',
 'decision','publication','release_approved','evidence_usable','limitation'])||
 assessment.schema!=='palaco.citadel.atelier.recovery-assessment/1'||
 assessment.result!=='QUARANTINED_ARCHIVE_INTEGRITY_CHECK_PASSED'||
 !/^\.prepare-commit-[0-9]{6}-[a-f0-9]{16}$/.test(assessment.stage_name||'')||
 !Number.isSafeInteger(assessment.sequence)||assessment.sequence<1||
 !HEX.test(assessment.head_sha256||'')||!HEX.test(assessment.archive_manifest_sha256||'')||
 assessment.recovery_authorized!==false||assessment.promotion_performed!==false||
 assessment.decision!=='HOLD'||assessment.publication!=='DENY'||
 assessment.release_approved!==false||assessment.evidence_usable!==false)
 throw Error('Recovery assessment cannot confer authority');
 if(!Array.isArray(approvals)||approvals.length!==2||
 !Array.isArray(reviewers)||reviewers.length!==2||
 !Array.isArray(consumedIds)||consumedIds.some(x=>!HEX.test(x))||
 new Set(consumedIds).size!==consumedIds.length||
 !Number.isSafeInteger(now)||now<0)
 throw Error('Missing externally managed reviewer and anti-replay context');
 const digest=sha(assessmentBytes),used=new Set(consumedIds),seen=new Set();
 const payloads=[];
 for(let i=0;i<2;i++){
  const envelope=decode(approvals[i]),trust=reviewers[i];
  if(!exact(envelope,['payload','signature'])||!exact(envelope.payload,KEYS)||
   !trust||!ID.test(trust.reviewerId||'')||!HEX.test(trust.spkiSha256||'')||
   trust.reviewerId!==envelope.payload.reviewer_id||
   seen.has(trust.reviewerId)||!ID.test(envelope.payload.reviewer_id)||
   !HEX.test(envelope.payload.decision_id||'')||
   envelope.payload.schema!=='palaco.citadel.atelier.manual-recovery-review/1'||
   envelope.payload.action!=='ASSESSMENT_ACCEPTED_FOR_MANUAL_REVIEW'||
   envelope.payload.assessment_sha256!==digest||
   envelope.payload.stage_name!==assessment.stage_name||
   envelope.payload.sequence!==assessment.sequence||
   envelope.payload.ledger_head_sha256!==assessment.head_sha256)
   throw Error('Invalid reviewer identity or assessment binding');
  seen.add(trust.reviewerId);
  const a=time(envelope.payload.created_at),b=time(envelope.payload.expires_at);
  if(a>=b||now<a||now>=b)throw Error('Review decision outside validity window');
  if(used.has(envelope.payload.decision_id))throw Error('Replay of previously consumed recovery review');
  if(typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature))
   throw Error('Invalid reviewer signature encoding');
  let pub;
  try{pub=crypto.createPublicKey(trust.publicKeyPem);
   if(pub.asymmetricKeyType!=='ed25519'||
    sha(pub.export({type:'spki',format:'der'}))!==trust.spkiSha256)
     throw Error('Untrusted key pin');
  }catch(e){throw Error('Untrusted reviewer key: '+e.message);}
  const signature=Buffer.from(envelope.signature,'base64url');
  if(signature.length!==64||signature.toString('base64url')!==envelope.signature||
  !crypto.verify(null,Buffer.concat([Buffer.from(DOMAIN),canonical(envelope.payload)]),pub,signature))
   throw Error('Invalid reviewer signature');
  payloads.push(envelope.payload);
 }
 if(payloads[0].decision_id!==payloads[1].decision_id)
 throw Error('Two reviewers did not approve the same review decision ID');
 if(reviewers[0].spkiSha256===reviewers[1].spkiSha256)
 throw Error('Reviewers must use different trusted public keys');
 return {schema:'palaco.citadel.atelier.manual-recovery-review-verification/1',
  result:'TWO_SIGNED_MANUAL_REVIEW_DECISIONS_VALID',
  assessment_sha256:digest,decision_id:payloads[0].decision_id,
  reviewer_ids:payloads.map(p=>p.reviewer_id),
  reviewed_stage:assessment.stage_name,sequence:assessment.sequence,
  recovery_authorized:false,promotion_performed:false,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:LIMIT};
}
module.exports={verify,DOMAIN,LIMIT};
