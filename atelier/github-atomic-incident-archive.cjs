'use strict';
// v7.10: commit ledger + authenticated proof as one immutable directory.
// Local-filesystem transaction only; fsync + atomic rename require same filesystem.
const fs=require('node:fs');
const path=require('node:path');
const {canonical,verifyLedger}=require('./github-incident-ledger.cjs');
const {sha}=require('./github-custodian-key-registry.cjs');
const SHA=/^[a-f0-9]{64}$/;
const HOLD={decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false};
const FILES=['ledger.json','proof.json','commit-manifest.json'];
function directory(parent){
 const st=fs.lstatSync(parent);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe archive root');
 return fs.realpathSync(parent);
}
function validateBundle(result,priorLedgerBytes){
 if(!result||!result.ledger||!result.proof)throw Error('Missing authenticated ledger and proof');
 const ledgerBytes=canonical(result.ledger),proofBytes=canonical(result.proof);
 const verified=verifyLedger(ledgerBytes),prior=verifyLedger(priorLedgerBytes);
 if(verified.ledger.records.length!==prior.ledger.records.length+1)
 throw Error('Ledger must append exactly one record');
 const record=verified.ledger.records.at(-1),p=result.proof;
 if(record.previous_sha256!==prior.head||p.sequence!==record.sequence||
 p.record_sha256!==record.record_sha256||p.incident_id!==record.incident_id||
 p.kind!==record.kind||p.evidence_sha256!==record.evidence_sha256||
 p.schema!=='palaco.citadel.atelier.authenticated-incident-proof/1'||
 p.decision!=='HOLD'||p.publication!=='DENY'||p.release_approved!==false||
 p.evidence_usable!==false)
 throw Error('Authenticated proof is not bound to appended ledger record');
 if(ledgerBytes.length>1000000||proofBytes.length>20000)throw Error('Oversized committed evidence');
 return {ledgerBytes,proofBytes,record,priorHead:prior.head};
}
function writeExclusive(file,bytes){
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{
  let off=0;while(off<bytes.length){const n=fs.writeSync(fd,bytes,off,bytes.length-off,off);if(n<1)throw Error('Short archive write');off+=n;}
  fs.fsyncSync(fd);
 }finally{fs.closeSync(fd);}
}
function syncDir(dir){const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function safeRead(file,limit){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const st=fs.fstatSync(fd);if(!st.isFile()||st.size<1||st.size>limit)throw Error('Invalid archive member');
  const bytes=Buffer.alloc(st.size);let off=0;
  while(off<bytes.length){const n=fs.readSync(fd,bytes,off,bytes.length-off,off);if(n<1)throw Error('Truncated archive member');off+=n;}
  if(fs.fstatSync(fd).size!==st.size)throw Error('Archive member changed during read');
  return bytes;
 }finally{fs.closeSync(fd);}
}
function inspectCommit(commitDir){
 const st=fs.lstatSync(commitDir);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Invalid archive commit directory');
 const entries=fs.readdirSync(commitDir).sort();
 if(JSON.stringify(entries)!==JSON.stringify([...FILES].sort()))throw Error('Incomplete or extra archive files');
 const ledgerBytes=safeRead(path.join(commitDir,FILES[0]),1000000);
 const proofBytes=safeRead(path.join(commitDir,FILES[1]),20000);
 const manifestBytes=safeRead(path.join(commitDir,FILES[2]),20000);
 let m,p;try{m=JSON.parse(manifestBytes);p=JSON.parse(proofBytes);}catch{throw Error('Invalid archived JSON');}
 if(!manifestBytes.equals(canonical(m))||!proofBytes.equals(canonical(p))||
 m.schema!=='palaco.citadel.atelier.atomic-incident-commit/1'||
 m.ledger_sha256!==sha(ledgerBytes)||m.proof_sha256!==sha(proofBytes)||
 m.sequence!==p.sequence||m.head_sha256!==p.record_sha256||
 m.decision!=='HOLD'||m.publication!=='DENY'||
 m.release_approved!==false||m.evidence_usable!==false)
 throw Error('Archive manifest or evidence has changed');
 const {ledger}=verifyLedger(ledgerBytes);
 if(ledger.records.length!==m.sequence||ledger.records.at(-1).record_sha256!==m.head_sha256)
 throw Error('Archived ledger head mismatch');
 return {manifest:m,ledgerBytes,proofBytes,manifestBytes};
}
function commit(root,result,priorBytes,options={}){
 const parent=directory(root);
 const lock=path.join(parent,'.writer-lock');
 fs.mkdirSync(lock,{mode:0o700}); // stale lock fails closed, no unsafe lock stealing
 let stage=null;
 try{
  const {ledgerBytes,proofBytes,record,priorHead}=validateBundle(result,priorBytes);
  const existing=fs.readdirSync(parent);
  if(existing.some(n=>n.startsWith('.prepare-')))throw Error('Unresolved partial transaction requires manual recovery');
  const committed=existing.filter(n=>/^commit-[0-9]{6}-[a-f0-9]{16}$/.test(n));
  const expectedSequence=record.sequence;
  if(committed.length!==expectedSequence-1)throw Error('Concurrent history or missing committed transaction');
  if(committed.length){
   const latest=committed.sort().at(-1);
   const previous=inspectCommit(path.join(parent,latest));
   if(previous.manifest.sequence!==expectedSequence-1||
    previous.manifest.head_sha256!==priorHead||!previous.ledgerBytes.equals(priorBytes))
    throw Error('Stale prior ledger or conflicting writer');
  }else if(priorHead!==null)throw Error('Initial transaction has nonempty predecessor');
  const digest=sha(Buffer.concat([ledgerBytes,proofBytes]));
  const finalName='commit-'+String(expectedSequence).padStart(6,'0')+'-'+digest.slice(0,16);
  const final=path.join(parent,finalName);
  if(fs.existsSync(final))throw Error('Transaction already exists');
  const txManifest={schema:'palaco.citadel.atelier.atomic-incident-commit/1',
   sequence:record.sequence,head_sha256:record.record_sha256,
   previous_sha256:priorHead,ledger_sha256:sha(ledgerBytes),
   proof_sha256:sha(proofBytes),decision:'HOLD',publication:'DENY',
   release_approved:false,evidence_usable:false};
  stage=path.join(parent,'.prepare-'+finalName);
  fs.mkdirSync(stage,{mode:0o700});
  writeExclusive(path.join(stage,FILES[0]),ledgerBytes);
  if(options.failAfterLedger)throw Error('Injected interrupted transaction');
  writeExclusive(path.join(stage,FILES[1]),proofBytes);
  writeExclusive(path.join(stage,FILES[2]),canonical(txManifest));
  syncDir(stage);
  inspectCommit(stage);
  if(options.failBeforeCommit)throw Error('Injected precommit failure');
  // POSIX rename on same filesystem makes the complete directory visible in one step.
  fs.renameSync(stage,final);stage=null;
  syncDir(parent);
  return {path:final,manifest:inspectCommit(final).manifest};
 }finally{
  // Staging is retained after failure for explicit review, never auto-promoted.
  fs.rmdirSync(lock);
 }
}
module.exports={commit,inspectCommit,validateBundle};
