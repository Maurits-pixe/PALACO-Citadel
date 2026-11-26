'use strict';
// Verify the bytes actually downloaded and extracted from GitHub Actions.
// No claim is made about the original ZIP archive digest or authenticity.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validatePair}=require('./github-review-pair.cjs');
const FILES=['atelier-review-evidence.json','atelier-review-integrity.json'];
function readBoundedRegularFile(filename){
 // Prevent unbounded allocations and reject symlinks even if a directory
 // entry is replaced between listing and reading.
 const flags=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW;
 const fd=fs.openSync(filename,flags);
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.size===0||stat.size>20000)
   throw Error('Evidence file is not a bounded regular file');
  const bytes=Buffer.alloc(stat.size);
  let offset=0;
  while(offset<bytes.length){
   const count=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);
   if(count<=0)throw Error('Evidence file changed during bounded read');
   offset+=count;
  }
  if(fs.fstatSync(fd).size!==bytes.length)
   throw Error('Evidence file size changed during bounded read');
  return bytes;
 }finally{fs.closeSync(fd);}
}
function compareExtracted(downloadDir,originalDir,context){
 if(typeof downloadDir!=='string'||!downloadDir||typeof originalDir!=='string'||!originalDir)
  throw Error('Artifact directories required');
 const entries=fs.readdirSync(downloadDir,{withFileTypes:true});
 if(entries.length!==2||entries.some(entry=>!entry.isFile()||!FILES.includes(entry.name)))
  throw Error('Downloaded artifact must contain exactly two regular JSON files');
 const data=FILES.map(name=>{
  const extracted=readBoundedRegularFile(path.join(downloadDir,name));
  const original=readBoundedRegularFile(path.join(originalDir,name));
  if(!extracted.equals(original))
   throw Error('Downloaded artifact bytes differ from original CI evidence');
  return extracted;
 });
 const checked=validatePair(data[0],data[1],context);
 return {
  schema:'palaco.citadel.atelier.extracted-artifact-check/1',
  result:'EXTRACTED_BYTES_MATCH',repository:context.repository,
  pr_number:context.prNumber,candidate_sha:context.headSha,
  workflow_run_id:context.runId,workflow_run_attempt:context.attempt,
  evidence_sha256:crypto.createHash('sha256').update(data[0]).digest('hex'),
  integrity_receipt_sha256:crypto.createHash('sha256').update(data[1]).digest('hex'),
  pair_result:checked.result,decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'Extracted files match local CI copies; this does not independently validate ZIP bytes or GitHub artifact digest'
 };
}
function run(args,env=process.env){
 if(args.length!==2)throw Error('Usage: node atelier/github-extracted-artifact.cjs <download-dir> <original-dir>');
 const context={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT)};
 const result=compareExtracted(args[0],args[1],context);
 if(env.PALACO_EXTRACTED_REPORT_PATH){
  const receipt={...result,artifact_id:Number(env.PALACO_ARTIFACT_ID)};
  if(!Number.isSafeInteger(receipt.artifact_id)||receipt.artifact_id<=0)
   throw Error('Missing exact GitHub review artifact ID for extracted receipt');
  fs.writeFileSync(env.PALACO_EXTRACTED_REPORT_PATH,
   JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(err){process.stderr.write('Extracted review artifact verification failed: '+err.message+'\n');process.exitCode=1;}
}
module.exports={readBoundedRegularFile,compareExtracted,run};
