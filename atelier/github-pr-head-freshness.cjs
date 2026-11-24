'use strict';
// Final read-only PR-head freshness guard. No publication or release authority.
const https=require('node:https');
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA=/^[a-f0-9]{40}$/;
function verifyCurrentHead(pr,{repository,prNumber,candidateSha}){
 if(!REPO.test(repository||'')||!Number.isSafeInteger(prNumber)||prNumber<=0||
  !SHA.test(candidateSha||''))throw Error('Invalid expected PR head context');
 if(!pr||typeof pr!=='object'||pr.number!==prNumber||
  pr.state!=='open'||pr.head?.sha!==candidateSha||
  pr.base?.repo?.full_name!==repository||
  pr.head?.repo?.full_name!==repository)
  throw Error('PR changed or is not the exact open repository candidate');
 return {schema:'palaco.citadel.atelier.pr-head-freshness/1',
  repository,pr_number:prNumber,candidate_sha:candidateSha,
  result:'CURRENT_HEAD_OBSERVED',decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'Read-only PR head observation is not release approval and can become stale'};
}
function fetchJson(url,token){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{Authorization:'Bearer '+token,
   Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'PALACO-Citadel-final-head-observer'},timeout:10000},res=>{
   const chunks=[];let n=0;
   res.on('data',chunk=>{
    n+=chunk.length;if(n>100000){req.destroy(Error('PR response too large'));return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    if(res.statusCode!==200){reject(Error('GitHub PR API status '+res.statusCode));return;}
    try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
    catch(e){reject(e);}
   });
  });
  req.on('timeout',()=>req.destroy(Error('PR API timeout')));
  req.on('error',reject);
 });
}
async function check({repository,prNumber,candidateSha,token,request=fetchJson}){
 if(!REPO.test(repository||'')||!Number.isSafeInteger(prNumber)||prNumber<=0||
  !SHA.test(candidateSha||'')||typeof token!=='string'||!token)
  throw Error('Invalid PR freshness observer arguments');
 const result=await request('https://api.github.com/repos/'+repository+'/pulls/'+prNumber,token);
 return verifyCurrentHead(result,{repository,prNumber,candidateSha});
}
async function main(env=process.env){
 const result=await check({repository:env.GITHUB_REPOSITORY,
  prNumber:Number(env.PALACO_PR_NUMBER),
  candidateSha:env.PALACO_EXPECTED_HEAD_SHA,token:env.GITHUB_TOKEN});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module)main().catch(e=>{
 process.stderr.write('Current PR candidate verification failed: '+e.message+'\n');
 process.exitCode=1;
});
module.exports={verifyCurrentHead,check,main};
