'use strict';
// v7.14: read-only reconciliation of TWO independently supplied consumed-ID ledgers.
// A matching signature-free digest is integrity, NOT authenticity or proof of independence.
const {canonical,sha}=require('./github-custodian-key-registry.cjs');
const {validateEntry}=require('./github-spent-recovery-register.cjs');
const HASH=/^[0-9a-f]{64}$/;
const KEYS=['schema','repository','archive_id','records','decision','publication',
 'release_approved','evidence_usable'];
const exact=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 JSON.stringify(Object.keys(v).sort())===JSON.stringify([...k].sort());
function validateSnapshot(raw,identity,anchor){
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>1200000)
 throw Error('Missing or oversized reconciliation snapshot');
 let s;try{s=JSON.parse(raw.toString('utf8'));}catch{throw Error('Malformed snapshot');}
 if(!raw.equals(canonical(s))||!exact(s,KEYS)||
 s.schema!=='palaco.citadel.atelier.spent-registry-snapshot/1'||
 s.repository!=='Maurits-pixe/PALACO-Citadel'||
 typeof identity!=='string'||!/^[A-Za-z0-9_.:-]{3,100}$/.test(identity)||
 s.archive_id!==identity||!Array.isArray(s.records)||s.records.length>10000||
 s.decision!=='HOLD'||s.publication!=='DENY'||
 s.release_approved!==false||s.evidence_usable!==false)
 throw Error('Invalid canonical snapshot or archive identity');
 if(!anchor||!Number.isSafeInteger(anchor.sequence)||anchor.sequence<0||
 (anchor.sequence===0?anchor.head!==null:!HASH.test(anchor.head||'')))
 throw Error('Missing independent checkpoint floor');
 const ids=new Set(),records=[];let prior=null;
 for(let i=0;i<s.records.length;i++){
  const bytes=canonical(s.records[i]);
  if(bytes.length>10000)throw Error('Oversized consumption record');
  const e=validateEntry(bytes,i+1,prior);
  if(ids.has(e.decision_id))throw Error('Replayed decision within snapshot');
  ids.add(e.decision_id);records.push(e);prior=e.entry_sha256;
 }
 if(records.length<anchor.sequence||
 anchor.sequence>0&&records[anchor.sequence-1].entry_sha256!==anchor.head)
 throw Error('Snapshot violates independently pinned history floor');
 return {archive_id:identity,records,head:prior,sequence:records.length};
}
function reconcile(rawA,rawB,idA,idB,anchorA,anchorB){
 if(idA===idB)throw Error('Independent archive identifiers must differ');
 const a=validateSnapshot(rawA,idA,anchorA),b=validateSnapshot(rawB,idB,anchorB);
 const shared=Math.min(a.sequence,b.sequence);
 let common=0;
 for(;common<shared;common++){
  if(a.records[common].entry_sha256!==b.records[common].entry_sha256)break;
 }
 let status;
 if(common<shared)status='FORK_OR_SPLIT_VIEW';
 else if(a.sequence===b.sequence)status='IDENTICAL_RECORD_HISTORY';
 else status=a.sequence>b.sequence?'ARCHIVE_B_BEHIND':'ARCHIVE_A_BEHIND';
 const known=new Map();
 let replayAcrossFork=false;
 if(status==='FORK_OR_SPLIT_VIEW'){
  for(const entry of a.records.slice(common))known.set(entry.decision_id,entry.entry_sha256);
  replayAcrossFork=b.records.slice(common).some(entry=>known.has(entry.decision_id)&&
   known.get(entry.decision_id)!==entry.entry_sha256);
 }
 return {schema:'palaco.citadel.atelier.spent-registry-reconciliation/1',
  status,archive_ids:[idA,idB],sequences:[a.sequence,b.sequence],
  heads:[a.head,b.head],common_prefix:common,
  cross_fork_replay:replayAcrossFork,
  incident:status!=='IDENTICAL_RECORD_HISTORY',
  synchronization_authorized:false,decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'Two locally validated snapshots checked against supplied external floors; no source authentication, cross-host atomicity, automatic synchronization or independence proven'};
}
function requireIdentical(...args){
 const report=reconcile(...args);
 if(report.incident)throw Error('Registry fork or stale archive: synchronization denied');
 return report;
}
module.exports={validateSnapshot,reconcile,requireIdentical};
