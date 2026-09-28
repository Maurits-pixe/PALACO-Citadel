import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function validateFreeze(freeze,observed){
  const failures=[];
  for(const subject of freeze.subjects){
    const pr=observed.prs.find(x=>x.number===subject.pr);
    if(!pr||pr.head.sha!==subject.head||pr.base.ref!==subject.base_ref||pr.base.sha!==subject.base_sha)failures.push(`PR_${subject.pr}_DRIFT`);
    const run=observed.runs.find(x=>x.id===subject.ci_run);
    if(!run||run.head_sha!==subject.head||run.status!=='completed'||run.conclusion!=='success'||run.name!=='Citadel local preview conformance')failures.push(`PR_${subject.pr}_CI_UNVERIFIED`);
  }
  if(observed.mergeBase!==freeze.dependency.merge_base)failures.push('MERGE_BASE_DRIFT');
  if(observed.contractVersion!==freeze.contract_version)failures.push('CONTRACT_DRIFT');
  return {status:failures.length?'REVIEW_INVALIDATED':'FROZEN_EVIDENCE_MATCHES',failures,activation:'NOT_AUTHORIZED'};
}
export async function fetchEvidence(freeze,{token=process.env.GITHUB_TOKEN}={}){
  async function get(path){
    const res=await fetch(`https://api.github.com/repos/${freeze.repository}/${path}`,{headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})}});
    if(!res.ok)throw Error(`GitHub evidence unavailable (${res.status})`);
    return res.json();
  }
  const prs=await Promise.all(freeze.subjects.map(s=>get(`pulls/${s.pr}`)));
  const runs=await Promise.all(freeze.subjects.map(s=>get(`actions/runs/${s.ci_run}`)));
  const parent=prs.find(p=>p.number===freeze.dependency.parent_pr);
  const child=prs.find(p=>p.number===freeze.dependency.child_pr);
  const [comparison,contract]=await Promise.all([get(`compare/${parent.head.sha}...${child.head.sha}`),get(`contents/contracts/atelier-registration-v1/contract.mjs?ref=${child.head.sha}`)]);
  const source=Buffer.from(contract.content,'base64').toString('utf8');
  return {prs,runs,mergeBase:comparison.merge_base_commit.sha,contractVersion:source.match(/VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const freeze=JSON.parse(await readFile(new URL('./freeze.json',import.meta.url),'utf8'));
    const result=validateFreeze(freeze,await fetchEvidence(freeze));
    console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;
  }catch(error){console.error(JSON.stringify({status:'REVIEW_INVALIDATED',reason:error.message,activation:'NOT_AUTHORIZED'}));process.exitCode=1;}
}
