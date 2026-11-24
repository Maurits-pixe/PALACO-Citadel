'use strict';
// Independently hash downloaded ZIP bytes against GitHub REST artifact metadata.
// A matching digest is integrity evidence only: no signer or release authorization.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {sanitizeObservation}=require('./github-artifact-metadata.cjs');
const SHA=/^[a-f0-9]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const MAX_ZIP=100000;
function verifyZip(zipPath,observationBytes,context){
 if(typeof zipPath!=='string'||!zipPath||
  !Buffer.isBuffer(observationBytes)||observationBytes.length===0||
  observationBytes.length>20000)
  throw Error('Invalid ZIP verification inputs');
 if(!REPO.test(context?.repository||'')||!positive(context.runId)||
  !positive(context.artifactId)||!SHA.test(context.headSha||''))
  throw Error('Invalid ZIP verification run context');
 const parsed=JSON.parse(observationBytes.toString('utf8'));
 const normalized=sanitizeObservation(parsed);
 if(!observationBytes.equals(Buffer.from(JSON.stringify(normalized,null,2)+'\n')))
  throw Error('Noncanonical artifact metadata observation');
 if(normalized.artifact_id!==context.artifactId||
  normalized.repository!==context.repository||
  normalized.run_id!==context.runId||
  normalized.head_sha!==context.headSha)
  throw Error('ZIP metadata belongs to a different candidate or artifact');
 if(normalized.result!=='GITHUB_METADATA_OBSERVED')
  throw Error('GitHub ZIP digest unavailable; cannot verify downloaded ZIP');
 const fd=fs.openSync(zipPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 let archive;
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.size<=0||stat.size>MAX_ZIP)
   throw Error('Downloaded ZIP is not a bounded regular file');
  if(stat.size!==normalized.artifact_bytes)
   throw Error('Downloaded ZIP size differs from GitHub artifact metadata');
  archive=Buffer.alloc(stat.size);
  let offset=0;
  while(offset<archive.length){
   const n=fs.readSync(fd,archive,offset,archive.length-offset,offset);
   if(n<=0)throw Error('Downloaded ZIP changed during read');
   offset+=n;
  }
  if(fs.fstatSync(fd).size!==archive.length)
   throw Error('Downloaded ZIP size changed during read');
 }finally{fs.closeSync(fd);}
 const actual='sha256:'+crypto.createHash('sha256').update(archive).digest('hex');
 if(actual!==normalized.github_zip_digest)
  throw Error('Downloaded ZIP SHA-256 differs from GitHub artifact metadata');
 return {schema:'palaco.citadel.atelier.github-zip-integrity/1',
  result:'DOWNLOADED_ZIP_DIGEST_MATCH',repository:context.repository,
  run_id:context.runId,candidate_sha:context.headSha,
  artifact_id:context.artifactId,github_zip_digest:actual,zip_bytes:archive.length,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'ZIP bytes match GitHub-reported digest; no independent signer or release permission'};
}
function run(args,env=process.env){
 if(args.length!==2)throw Error('Usage: node atelier/github-zip-integrity.cjs <downloaded.zip> <metadata-observation.json>');
 const result=verifyZip(args[0],fs.readFileSync(args[1]),{
  repository:env.GITHUB_REPOSITORY,runId:Number(env.GITHUB_RUN_ID),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,artifactId:Number(env.PALACO_ARTIFACT_ID)});
 if(env.PALACO_ZIP_INTEGRITY_REPORT_PATH){
  fs.writeFileSync(env.PALACO_ZIP_INTEGRITY_REPORT_PATH,
   JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('Downloaded GitHub ZIP integrity verification failed: '+e.message+'\n');process.exitCode=1;}
}
module.exports={verifyZip,run};
