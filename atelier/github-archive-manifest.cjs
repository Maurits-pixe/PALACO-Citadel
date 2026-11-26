'use strict';
// Offline byte inventory for four preverified diagnostics. Not an attestation.
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const NAMES=['atelier-artifact-metadata-observation.json',
 'atelier-extracted-evidence-check.json','atelier-zip-integrity-check.json',
 'atelier-final-artifact-witness.json'];
const SHA=/^[a-f0-9]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
function contextValid(ctx){
 return REPO.test(ctx?.repository||'')&&SHA.test(ctx.headSha||'')&&
  Number.isSafeInteger(ctx.prNumber)&&ctx.prNumber>0&&
  Number.isSafeInteger(ctx.runId)&&ctx.runId>0&&
  Number.isSafeInteger(ctx.attempt)&&ctx.attempt>0&&
  Number.isSafeInteger(ctx.artifactId)&&ctx.artifactId>0;
}
function fileRecord(name,raw){
 if(!NAMES.includes(name)||!Buffer.isBuffer(raw)||!raw.length||raw.length>20000)
  throw Error('Unrecognized or oversized archive diagnostic');
 const report=JSON.parse(raw.toString('utf8'));
 if(!report||Array.isArray(report)||typeof report!=='object'||
  !raw.equals(Buffer.from(JSON.stringify(report,null,2)+'\n'))||
  report.decision!=='HOLD'||report.publication!=='DENY'||
  report.release_approved!==false||report.evidence_usable!==false)
  throw Error('Archive diagnostic is noncanonical or claims authority');
 return {name,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')};
}
function buildManifest(files,ctx){
 if(!contextValid(ctx)||!files||typeof files!=='object'||
  Object.keys(files).length!==NAMES.length||
  NAMES.some(n=>!Buffer.isBuffer(files[n])))
  throw Error('Invalid final archive manifest context or diagnostic set');
 // These reports have already passed independent byte-level checks upstream.
 for(const [name,head,run,artifact] of [
  [NAMES[0],'head_sha','run_id','artifact_id'],
  [NAMES[1],'candidate_sha','workflow_run_id','artifact_id'],
  [NAMES[2],'candidate_sha','run_id','artifact_id'],
  [NAMES[3],'candidate_sha','run_id','artifact_id']]){
  const report=JSON.parse(files[name].toString('utf8'));
  if(report.repository!==ctx.repository||report[head]!==ctx.headSha||
   report[run]!==ctx.runId||report[artifact]!==ctx.artifactId)
   throw Error('Archive diagnostic does not match exact artifact and candidate');
 }
 const extracted=JSON.parse(files[NAMES[1]].toString('utf8'));
 const witness=JSON.parse(files[NAMES[3]].toString('utf8'));
 if(extracted.pr_number!==ctx.prNumber||extracted.workflow_run_attempt!==ctx.attempt||
  witness.pr_number!==ctx.prNumber||witness.run_attempt!==ctx.attempt)
  throw Error('Archive diagnostic PR or run attempt mismatch');
 return {schema:'palaco.citadel.atelier.archive-manifest/1',
  result:'FOUR_DIAGNOSTICS_BOUND',repository:ctx.repository,pr_number:ctx.prNumber,
  candidate_sha:ctx.headSha,run_id:ctx.runId,run_attempt:ctx.attempt,
  artifact_id:ctx.artifactId,files:NAMES.map(n=>fileRecord(n,files[n])),
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'SHA-256 inventory of locally checked GitHub diagnostics; not an external signature or release authority'};
}
function verifyManifest(raw,files,ctx){
 if(!Buffer.isBuffer(raw)||!raw.length||raw.length>20000)
  throw Error('Invalid archive manifest byte length');
 const parsed=JSON.parse(raw.toString('utf8'));
 const expected=buildManifest(files,ctx);
 if(!raw.equals(Buffer.from(JSON.stringify(parsed,null,2)+'\n'))||
  JSON.stringify(parsed)!==JSON.stringify(expected))
  throw Error('Archive manifest differs from original evidence bytes or run context');
 return expected;
}
function readFiles(dir){
 const result={};
 for(const name of NAMES){
  const fd=fs.openSync(path.join(dir,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
   const st=fs.fstatSync(fd);
   if(!st.isFile()||st.size<=0||st.size>20000)
    throw Error('Unbounded or nonregular archive diagnostic');
   const b=Buffer.alloc(st.size);
   let offset=0;
   while(offset<b.length){
    const n=fs.readSync(fd,b,offset,b.length-offset,offset);
    if(n<=0)throw Error('Archive diagnostic changed during read');
    offset+=n;
   }
   result[name]=b;
  }finally{fs.closeSync(fd);}
 }
 return result;
}
function main(args,env=process.env){
 if(args.length!==2||!['create','verify'].includes(args[0]))
  throw Error('Usage: node atelier/github-archive-manifest.cjs create|verify <directory>');
 const dir=args[1];
 const ctx={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const files=readFiles(dir);
 const manifestPath=path.join(dir,'atelier-archive-manifest.json');
 const result=args[0]==='create'?buildManifest(files,ctx):
  verifyManifest(fs.readFileSync(manifestPath),files,ctx);
 if(args[0]==='create')
  fs.writeFileSync(manifestPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){try{main(process.argv.slice(2));}
 catch(e){process.stderr.write('Archive manifest verification failed: '+e.message+'\n');process.exitCode=1;}}
module.exports={NAMES,buildManifest,verifyManifest,main};
