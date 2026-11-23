'use strict';
// Read-only GitHub collection. Never authenticates local JSON or authorizes release.
const https=require('node:https');
const fs=require('node:fs');
const {audit}=require('./github-review-audit.cjs');
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA=/^[0-9a-f]{40}$/;
function requestJson(url,token){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{
   'Authorization':'Bearer '+token,
   'Accept':'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'PALACO-Citadel-readonly-review-audit'
  },timeout:10000},res=>{
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>2000000){req.destroy(Error('API response oversized'));return;}chunks.push(chunk);});
   res.on('end',()=>{
    if(res.statusCode!==200){reject(Error('GitHub API status '+res.statusCode));return;}
    try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}
   });
  });
  req.on('timeout',()=>req.destroy(Error('GitHub API timeout')));
  req.on('error',reject);
 });
}
async function collect({repository,number,token,expectedHead,fetchJson=requestJson,now=new Date().toISOString()}){
 if(!REPO.test(repository||'')||!Number.isSafeInteger(number)||number<=0||typeof token!=='string'||!token){
  throw Error('Invalid read-only GitHub collection parameters');
 }
 const base='https://api.github.com/repos/'+repository+'/pulls/'+number;
 const pr=await fetchJson(base,token);
 if(!pr||!SHA.test(pr.head?.sha||'')||!pr.user?.login||pr.number!==number)throw Error('Invalid PR API response');
 const observedHead=pr.head.sha;
 if(expectedHead!==undefined&&(!SHA.test(expectedHead)||expectedHead!==observedHead))
  throw Error('PR head does not match workflow event commit');
 const reviews=[];let paginationComplete=false;
 for(let page=1;page<=11;page++){
  if(page===11)break; // Never claim completeness beyond our ten-page safety bound.
  const batch=await fetchJson(base+'/reviews?per_page=100&page='+page,token);
  if(!Array.isArray(batch)||batch.length>100)throw Error('Invalid review API page');
  reviews.push(...batch);
  if(reviews.length>1000)throw Error('Review history exceeds audit limit');
  if(batch.length<100){paginationComplete=true;break;}
 }
 // Re-fetch the PR to detect a head change while collecting.
 const after=await fetchJson(base,token);
 if(after?.head?.sha!==observedHead||after.number!==number)throw Error('PR head changed during review collection');
 const provenance={pr_number:number,head_sha:observedHead,
  total_count:reviews.length,pagination_complete:paginationComplete,
  has_next_page:!paginationComplete,fetched_at:now};
 const result=audit({reviews,candidateSha:observedHead,prNumber:number,
  authorLogin:pr.user.login,provenance,now});
 return {...result,origin:'github_rest_read_only_runtime_observation',
  collection_complete:paginationComplete&&result.review_list_issues.length===0,
  // No self-asserted JSON output is a release authorization.
  evidence_usable:false,decision:'HOLD',publication:'DENY',release_approved:false};
}
function safeReport(result,runId,runAttempt,repository){
 // Explicit field allowlist: never persist reviewer identities, review bodies,
 // GitHub token, or untrusted API payloads.
 return {
  schema:'palaco.citadel.atelier.github-review-evidence/1',
  source:'github_actions_readonly_api_observation',
  workflow_run_id:Number.isSafeInteger(runId)&&runId>0?runId:null,
  workflow_run_attempt:Number.isSafeInteger(runAttempt)&&runAttempt>0?runAttempt:null,
  repository:typeof repository==='string'&&REPO.test(repository)?repository:null,
  pr_number:result.pr_number,
  candidate_sha:result.candidate_sha,
  review_count:result.review_count,
  matching_approved_review_count:result.matching_approved_review_count,
  collection_complete:result.collection_complete===true,
  review_list_issues:Array.isArray(result.review_list_issues)?result.review_list_issues.slice():[],
  decision:'HOLD',publication:'DENY',release_approved:false,
  evidence_usable:false,
  limitation:'An observation artifact cannot replace current authenticated GitHub review verification'
 };
}
async function main(){
 const repository=process.env.GITHUB_REPOSITORY;
 const number=Number(process.env.PALACO_PR_NUMBER);
 const token=process.env.GITHUB_TOKEN;
 const expectedHead=process.env.PALACO_EXPECTED_HEAD_SHA;
 if(!SHA.test(expectedHead||''))throw Error('Missing or invalid exact workflow PR head SHA');
 const result=await collect({repository,number,token,expectedHead});
 const report=safeReport(result,Number(process.env.GITHUB_RUN_ID),
  Number(process.env.GITHUB_RUN_ATTEMPT),repository);
 const reportPath=process.env.PALACO_REVIEW_REPORT_PATH;
 if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(require.main===module)main().catch(e=>{
 process.stderr.write('Read-only GitHub review inspection unavailable: '+e.message+'\n');
 process.exitCode=1;
});
module.exports={collect,safeReport};
