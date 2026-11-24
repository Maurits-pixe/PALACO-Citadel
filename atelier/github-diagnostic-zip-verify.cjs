'use strict';
// v7.02: verify independently obtained diagnostic ZIP against GitHub REST metadata.
// Read-only integrity check. GitHub is the trust domain; this is not a signature.
const fs=require('node:fs');
const crypto=require('node:crypto');
const NAME='atelier-artifact-metadata-observation';
const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
function loadBounded(file,max){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.size<1||st.size>max)throw Error('Nonregular or oversized archive input');
  const buf=Buffer.alloc(st.size);
  let off=0;
  while(off<buf.length){
   const n=fs.readSync(fd,buf,off,buf.length-off,off);
   if(n<1)throw Error('Archive input changed during read');
   off+=n;
  }
  if(fs.fstatSync(fd).size!==st.size)throw Error('Archive input size changed');
  return buf;
 }finally{fs.closeSync(fd);}
}
function verify(zipBytes,metadata,ctx){
 if(!Buffer.isBuffer(zipBytes)||zipBytes.length<1||zipBytes.length>200000||
    !REPO.test(ctx?.repository||'')||!SHA.test(ctx.headSha||'')||
    !positive(ctx.runId)||!positive(ctx.artifactId))
  throw Error('Invalid archive bytes or expected GitHub context');
 if(!metadata||Array.isArray(metadata)||typeof metadata!=='object'||
    metadata.id!==ctx.artifactId||metadata.name!==NAME||
    metadata.expired!==false||metadata.workflow_run?.id!==ctx.runId||
    metadata.workflow_run?.head_sha!==ctx.headSha||
    !DIGEST.test(metadata.digest||'')||
    !positive(metadata.size_in_bytes)||
    !Number.isFinite(Date.parse(metadata.created_at))||
    !Number.isFinite(Date.parse(metadata.expires_at))||
    Date.parse(metadata.expires_at)<=Date.parse(metadata.created_at))
  throw Error('Diagnostic ZIP metadata does not match run, SHA or artifact ID');
 const actual='sha256:'+crypto.createHash('sha256').update(zipBytes).digest('hex');
 if(zipBytes.length!==metadata.size_in_bytes||actual!==metadata.digest)
  throw Error('Diagnostic ZIP bytes differ from GitHub-reported digest or size');
 return {schema:'palaco.citadel.atelier.diagnostic-zip-authentication/1',
  result:'GITHUB_DIAGNOSTIC_ZIP_MATCH',repository:ctx.repository,
  candidate_sha:ctx.headSha,run_id:ctx.runId,artifact_id:ctx.artifactId,
  github_zip_digest:actual,zip_bytes:zipBytes.length,decision:'HOLD',
  publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'GitHub REST ZIP digest and downloaded bytes match; no third-party custody or release authority'};
}
function main(args,env=process.env){
 if(args.length!==2)throw Error('Usage: node github-diagnostic-zip-verify.cjs ZIP METADATA_JSON');
 const raw=loadBounded(args[1],100000);
 const meta=JSON.parse(raw.toString('utf8'));
 const result=verify(loadBounded(args[0],200000),meta,{
  repository:env.GITHUB_REPOSITORY,headSha:env.PALACO_EXPECTED_HEAD_SHA,
  runId:Number(env.GITHUB_RUN_ID),artifactId:Number(env.PALACO_DIAGNOSTIC_ARCHIVE_ID)});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{main(process.argv.slice(2));}
 catch(err){process.stderr.write('Diagnostic archive authentication failed: '+err.message+'\n');process.exitCode=1;}
}
module.exports={verify,loadBounded,main};
