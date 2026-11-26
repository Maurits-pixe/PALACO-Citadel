'use strict';
// v7.13 — local single-writer, append-only spent decision registry.
// External head pinning and independent reviewers are inputs, not services created here.
const fs=require('node:fs');
const path=require('node:path');
const {canonical,sha}=require('./github-custodian-key-registry.cjs');
const {verify}=require('./github-manual-recovery-review.cjs');
const HASH=/^[0-9a-f]{64}$/;
const COMMIT=/^spent-([0-9]{6})-([a-f0-9]{16})\.json$/;
const LIMIT='Local append-only consumption only; external head pin, trusted time and independent storage are required';
const strict=(obj,fields)=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&
 JSON.stringify(Object.keys(obj).sort())===JSON.stringify([...fields].sort());
function entryHash(e){const {entry_sha256,...body}=e;return sha(canonical(body));}
function validateEntry(bytes,sequence,previous){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>10000)throw Error('Invalid consumption entry bytes');
 let e;try{e=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Malformed consumption entry');}
 if(!bytes.equals(canonical(e))||
 !strict(e,['schema','sequence','decision_id','assessment_sha256','reviewer_ids','previous_sha256','entry_sha256','decision','publication','release_approved','evidence_usable','limitation'])||
 e.schema!=='palaco.citadel.atelier.spent-recovery-review/1'||
 e.sequence!==sequence||!HASH.test(e.decision_id||'')||!HASH.test(e.assessment_sha256||'')||
 !Array.isArray(e.reviewer_ids)||e.reviewer_ids.length!==2||
 e.reviewer_ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_.:-]{3,100}$/.test(x))||
 e.reviewer_ids[0]===e.reviewer_ids[1]||e.previous_sha256!==previous||
 !HASH.test(e.entry_sha256||'')||e.entry_sha256!==entryHash(e)||
 e.decision!=='HOLD'||e.publication!=='DENY'||
 e.release_approved!==false||e.evidence_usable!==false||e.limitation!==LIMIT)
 throw Error('Invalid consumption record or broken hash chain');
 return e;
}
function scan(root,floor={sequence:0,head:null}){
 if(!floor||!Number.isSafeInteger(floor.sequence)||floor.sequence<0||
 (floor.sequence===0?floor.head!==null:!HASH.test(floor.head||'')))
 throw Error('Invalid externally supplied consumption floor');
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe consumption directory');
 const parent=fs.realpathSync(root),names=fs.readdirSync(parent);
 if(names.some(n=>n.startsWith('.prepare-')))throw Error('Unresolved consumption staging');
 const files=names.filter(n=>COMMIT.test(n)).sort();
 if(names.some(n=>!COMMIT.test(n)&&n!=='.spent-writer-lock'))
 throw Error('Unexpected entries in consumption root');
 if(files.length>10000)throw Error('Consumption history exceeds bound');
 const ids=[],entries=[];let prior=null;
 for(let i=0;i<files.length;i++){
  const name=files[i],m=COMMIT.exec(name);
  if(Number(m[1])!==i+1)throw Error('Consumption history has a gap');
  const fd=fs.openSync(path.join(parent,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  let bytes;
  try{
   const st=fs.fstatSync(fd);
   if(!st.isFile()||st.size<1||st.size>10000)throw Error('Invalid spent entry file');
   bytes=Buffer.alloc(st.size);let pos=0;
   while(pos<bytes.length){const n=fs.readSync(fd,bytes,pos,bytes.length-pos,pos);if(n<1)throw Error('Truncated consumption record');pos+=n;}
  }finally{fs.closeSync(fd);}
  const entry=validateEntry(bytes,i+1,prior);
  if(entry.entry_sha256.slice(0,16)!==m[2])throw Error('Consumption filename digest mismatch');
  if(ids.includes(entry.decision_id))throw Error('Repeated consumed decision ID');
  ids.push(entry.decision_id);entries.push(entry);prior=entry.entry_sha256;
 }
 if(files.length<floor.sequence||
 floor.sequence>0&&entries[floor.sequence-1].entry_sha256!==floor.head)
 throw Error('Consumption history rollback or divergent external head');
 return {entries,consumedIds:ids,head:prior,sequence:entries.length};
}
function write(root,assessment,approvals,reviewers,now,floor={sequence:0,head:null},opts={}){
 const parent=fs.realpathSync(root),lock=path.join(parent,'.spent-writer-lock');
 fs.mkdirSync(lock,{mode:0o700});
 let stage;
 try{
  const history=scan(parent,floor);
  const review=verify(assessment,approvals,reviewers,history.consumedIds,now);
  const record={schema:'palaco.citadel.atelier.spent-recovery-review/1',
   sequence:history.sequence+1,decision_id:review.decision_id,
   assessment_sha256:review.assessment_sha256,reviewer_ids:review.reviewer_ids,
   previous_sha256:history.head,decision:'HOLD',publication:'DENY',
   release_approved:false,evidence_usable:false,limitation:LIMIT};
  record.entry_sha256=entryHash(record);
  const file='spent-'+String(record.sequence).padStart(6,'0')+'-'+record.entry_sha256.slice(0,16)+'.json';
  stage=path.join(parent,'.prepare-'+file);
  const fd=fs.openSync(stage,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{
   const b=canonical(record);let pos=0;
   while(pos<b.length){const n=fs.writeSync(fd,b,pos,b.length-pos,pos);if(n<1)throw Error('Short consumption write');pos+=n;}
   fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  validateEntry(fs.readFileSync(stage),record.sequence,history.head);
  if(opts.failBeforeRename)throw Error('Injected incomplete consumption transaction');
  const final=path.join(parent,file);
  // Only writer holding this lock can commit a new immutable entry.
  fs.renameSync(stage,final);stage=null;
  const dirFd=fs.openSync(parent,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
  try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
  const checked=scan(parent,floor);
  if(checked.head!==record.entry_sha256)throw Error('Committed consumption head mismatch');
  return {record,path:final,decision:'HOLD',publication:'DENY',release_approved:false};
 }finally{
  // Failures retain any prepare file for forensic quarantine; no automatic recovery.
  fs.rmdirSync(lock);
 }
}
module.exports={scan,write,validateEntry,entryHash,LIMIT};
