'use strict';
// Verify GitHub-hosted Actions artifact metadata after upload; read-only, no GO.
const https=require('node:https');
const fs=require('node:fs');
const SHA=/^[0-9a-f]{40}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
function validateMetadata(meta,{repository,runId,headSha,artifactId}){
 if(!REPO.test(repository||'')||!positive(runId)||!positive(artifactId)||!SHA.test(headSha||''))
  throw Error('Invalid GitHub artifact verification context');
 if(!meta||typeof meta!=='object'||Array.isArray(meta)||meta.id!==artifactId||
  meta.name!=='atelier-review-evidence'||meta.expired!==false||
  meta.workflow_run?.id!==runId||meta.workflow_run?.head_sha!==headSha||
  !DIGEST.test(meta.digest||'')||!positive(meta.size_in_bytes)||
  !Number.isFinite(Date.parse(meta.created_at))||
  !Number.isFinite(Date.parse(meta.expires_at))||
  Date.parse(meta.expires_at)<=Date.parse(meta.created_at))
  throw Error('GitHub artifact metadata does not match expected run and head');
 return {schema:'palaco.citadel.atelier.github-artifact-metadata/1',
  artifact_id:artifactId,repository,run_id:runId,head_sha:headSha,
  github_zip_digest:meta.digest,artifact_bytes:meta.size_in_bytes,
  result:'GITHUB_METADATA_OBSERVED',
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'REST metadata attests GitHub-reported ZIP digest, not locally verified ZIP bytes or release approval'};
}
function getJson(url,token){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{Authorization:'Bearer '+token,
   Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'PALACO-Citadel-artifact-metadata-readonly'},timeout:10000},res=>{
   const chunks=[];let n=0;
   res.on('data',chunk=>{n+=chunk.length;if(n>100000){req.destroy(Error('Artifact metadata oversized'));return;}chunks.push(chunk);});
   res.on('end',()=>{
    if(res.statusCode!==200){const error=Error('GitHub API artifact status '+res.statusCode);error.statusCode=res.statusCode;reject(error);return;}
    try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
    catch(err){reject(err);}
   });
  });
  req.on('timeout',()=>req.destroy(Error('Artifact metadata API timeout')));
  req.on('error',reject);
 });
}
async function observe({repository,runId,headSha,artifactId,token,fetchJson=getJson,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!REPO.test(repository||'')||!positive(artifactId)||!positive(runId)||
   !SHA.test(headSha||'')||typeof token!=='string'||!token)
  throw Error('Invalid artifact observation arguments');
 const url='https://api.github.com/repos/'+repository+'/actions/artifacts/'+artifactId;
 let meta;
 for(let attempt=0;attempt<3;attempt++){
  try{meta=await fetchJson(url,token);break;}
  catch(err){
   // Newly uploaded artifacts may briefly return 404 before API indexing.
   // Missing metadata is never silently promoted to verified evidence.
   if(err?.statusCode!==404)throw err;
   if(attempt===2)return {schema:'palaco.citadel.atelier.github-artifact-metadata/1',
    artifact_id:artifactId,repository,run_id:runId,head_sha:headSha,
    result:'GITHUB_METADATA_UNAVAILABLE',reason:'artifact_metadata_not_found_after_retries',
    decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
    limitation:'Artifact metadata unavailable; no GitHub ZIP digest or authenticated artifact verification'};
   await wait(attempt===0?500:1500);
  }
 }
 return validateMetadata(meta,{repository,runId,headSha,artifactId});
}
function sanitizeObservation(result){
 if(!result||typeof result!=='object'||Array.isArray(result)||
  result.schema!=='palaco.citadel.atelier.github-artifact-metadata/1'||
  !positive(result.artifact_id)||!positive(result.run_id)||
  !REPO.test(result.repository||'')||!SHA.test(result.head_sha||'')||
  result.decision!=='HOLD'||result.publication!=='DENY'||
  result.release_approved!==false||result.evidence_usable!==false)
  throw Error('Invalid artifact metadata diagnostic');
 const base={schema:result.schema,artifact_id:result.artifact_id,
  repository:result.repository,run_id:result.run_id,head_sha:result.head_sha};
 if(result.result==='GITHUB_METADATA_OBSERVED'){
  if(!DIGEST.test(result.github_zip_digest||'')||
   !positive(result.artifact_bytes)||
   result.limitation!=='REST metadata attests GitHub-reported ZIP digest, not locally verified ZIP bytes or release approval'||
   Object.hasOwn(result,'reason'))
    throw Error('Invalid verified artifact metadata fields');
  return {...base,github_zip_digest:result.github_zip_digest,
   artifact_bytes:result.artifact_bytes,result:'GITHUB_METADATA_OBSERVED',
   decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
   limitation:result.limitation};
 }
 if(result.result==='GITHUB_METADATA_UNAVAILABLE'){
  if(result.reason!=='artifact_metadata_not_found_after_retries'||
   result.limitation!=='Artifact metadata unavailable; no GitHub ZIP digest or authenticated artifact verification'||
   Object.hasOwn(result,'github_zip_digest')||Object.hasOwn(result,'artifact_bytes'))
    throw Error('Invalid unavailable artifact metadata fields');
  return {...base,result:'GITHUB_METADATA_UNAVAILABLE',
   reason:result.reason,decision:'HOLD',publication:'DENY',
   release_approved:false,evidence_usable:false,limitation:result.limitation};
 }
 throw Error('Invalid artifact metadata diagnostic');
}
function saveObservation(result,filename){
 if(typeof filename!=='string'||!filename)throw Error('Missing artifact metadata diagnostic path');
 const diagnostic=sanitizeObservation(result);
 fs.writeFileSync(filename,JSON.stringify(diagnostic,null,2)+'\\n',{flag:'wx',mode:0o600});
 return diagnostic;
}
async function main(env=process.env){
 const result=await observe({repository:env.GITHUB_REPOSITORY,runId:Number(env.GITHUB_RUN_ID),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,artifactId:Number(env.PALACO_ARTIFACT_ID),
  token:env.GITHUB_TOKEN});
 // Record the API observation separately. It contains only fixed diagnostics.
 // A 404 result remains explicitly UNAVAILABLE rather than VERIFIED.
 if(env.PALACO_ARTIFACT_METADATA_PATH)
  saveObservation(result,env.PALACO_ARTIFACT_METADATA_PATH);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module)main().catch(e=>{
 process.stderr.write('GitHub artifact metadata verification failed: '+e.message+'\n');
 process.exitCode=1;
});
module.exports={validateMetadata,observe,sanitizeObservation,saveObservation,main};
