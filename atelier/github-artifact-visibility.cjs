'use strict';
// Wait for GitHub's run-artifact listing to index a finalized upload.
// Read-only; a missing artifact must fail rather than silently skip evidence.
const https=require('node:https');
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA=/^[a-f0-9]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
function inspectListing(payload,{repository,runId,artifactId,headSha}){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.artifacts))
  throw Error('Invalid run artifact listing response');
 if(!Number.isSafeInteger(payload.total_count)||payload.total_count<0)
  throw Error('Invalid artifact listing count');
 if(payload.artifacts.length>100)throw Error('Artifact listing exceeds page limit');
 const items=payload.artifacts.filter(x=>x?.id===artifactId);
 if(items.length>1)throw Error('Duplicate artifact ID in GitHub listing');
 if(items.length===0)return false;
 const item=items[0];
 if(item.name!=='atelier-review-evidence'||item.expired!==false||
  !positive(item.size_in_bytes)||
  (item.workflow_run?.id!==undefined&&item.workflow_run.id!==runId)||
  (item.workflow_run?.head_sha!==undefined&&item.workflow_run.head_sha!==headSha))
  throw Error('GitHub artifact listing contradicts candidate evidence context');
 return true;
}
function getJson(url,token){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{Authorization:'Bearer '+token,
   Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'PALACO-Citadel-artifact-listing-readonly'},timeout:10000},res=>{
   const chunks=[];let length=0;
   res.on('data',chunk=>{
    length+=chunk.length;
    if(length>1000000){req.destroy(Error('Artifact listing response too large'));return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    if(res.statusCode!==200){
     const error=Error('GitHub run artifact listing status '+res.statusCode);
     error.statusCode=res.statusCode;reject(error);return;
    }
    try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
    catch(err){reject(err);}
   });
  });
  req.on('timeout',()=>req.destroy(Error('Artifact listing API timeout')));
  req.on('error',reject);
 });
}
async function awaitVisibility({repository,runId,artifactId,headSha,token,
 fetchJson=getJson,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!REPO.test(repository||'')||!positive(runId)||!positive(artifactId)||
  !SHA.test(headSha||'')||typeof token!=='string'||!token)
  throw Error('Invalid expected artifact visibility context');
 const url='https://api.github.com/repos/'+repository+'/actions/runs/'+runId+'/artifacts?per_page=100';
 for(let attempt=1;attempt<=8;attempt++){
  let listing;
  try{listing=await fetchJson(url,token);}
  catch(err){
   if(err?.statusCode!==404)throw err;
  }
  if(listing&&inspectListing(listing,{repository,runId,artifactId,headSha}))
   return {schema:'palaco.citadel.atelier.artifact-list-visibility/1',
    result:'ARTIFACT_LISTED',repository,run_id:runId,
    candidate_sha:headSha,artifact_id:artifactId,attempt,
    decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
    limitation:'Listing visibility is not downloaded ZIP verification or release permission'};
  if(attempt<8)await wait(2000);
 }
 throw Error('GitHub artifact not listed after bounded visibility checks');
}
async function main(env=process.env){
 const result=await awaitVisibility({repository:env.GITHUB_REPOSITORY,
  runId:Number(env.GITHUB_RUN_ID),artifactId:Number(env.PALACO_ARTIFACT_ID),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,token:env.GITHUB_TOKEN});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module)main().catch(err=>{
 process.stderr.write('Artifact visibility failed: '+err.message+'\n');
 process.exitCode=1;
});
module.exports={inspectListing,awaitVisibility,main};
