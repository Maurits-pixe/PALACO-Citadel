'use strict';
// Independent post-download byte inventory, bound to v7.00 manifest and CI context.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {NAMES,verifyManifest}=require('./github-archive-manifest.cjs');
const ALL=[...NAMES,'atelier-archive-manifest.json'];
function safeRead(dir,name){
 const fd=fs.openSync(path.join(dir,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.size<1||st.size>20000)throw Error('Invalid diagnostic member');
  const bytes=Buffer.alloc(st.size);
  let pos=0;
  while(pos<bytes.length){
   const n=fs.readSync(fd,bytes,pos,bytes.length-pos,pos);
   if(n<1)throw Error('Diagnostic changed while reading');
   pos+=n;
  }
  if(fs.fstatSync(fd).size!==st.size)throw Error('Diagnostic size changed');
  return bytes;
 }finally{fs.closeSync(fd);}
}
function verifiedInventory(dir){
 const entries=fs.readdirSync(dir).sort();
 if(JSON.stringify(entries)!==JSON.stringify([...ALL].sort()))
  throw Error('Downloaded archive member set differs from exact five-file contract');
 return Object.fromEntries(ALL.map(n=>[n,safeRead(dir,n)]));
}
function verifyDownloaded(original,downloaded,ctx){
 if(path.resolve(original)===path.resolve(downloaded))throw Error('Source and download must be separate');
 const a=verifiedInventory(original),b=verifiedInventory(downloaded);
 // The manifest is recomputed using the downloaded reports, not trusted on its face.
 const reports=Object.fromEntries(NAMES.map(n=>[n,b[n]]));
 const expected=verifyManifest(b['atelier-archive-manifest.json'],reports,ctx);
 for(const name of ALL){
  if(!crypto.timingSafeEqual(crypto.createHash('sha256').update(a[name]).digest(),
                              crypto.createHash('sha256').update(b[name]).digest()))
   throw Error('Downloaded archive differs from source: '+name);
 }
 return {schema:'palaco.citadel.atelier.archive-redownload/1',
  result:'FIVE_FILES_REDOWNLOADED_AND_VERIFIED',repository:ctx.repository,
  pr_number:ctx.prNumber,candidate_sha:ctx.headSha,run_id:ctx.runId,
  run_attempt:ctx.attempt,artifact_id:ctx.artifactId,
  diagnostic_count:expected.files.length,decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'GitHub artifact bytes agree with local source and canonical inventory; no external signature or release authority'};
}
function main(args,env=process.env){
 if(args.length!==2)throw Error('Usage: node github-archive-redownload.cjs SOURCE_DIR DOWNLOADED_DIR');
 const ctx={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
 headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
 attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const result=verifyDownloaded(args[0],args[1],ctx);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{main(process.argv.slice(2));}catch(e){process.stderr.write('Redownload verification denied: '+e.message+'\n');process.exitCode=1;}
}
module.exports={verifyDownloaded,verifiedInventory,main};
