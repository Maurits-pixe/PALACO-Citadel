'use strict';
// Offline validation of a sanitized review observation artifact. No release authority.
const fs=require('node:fs');
const crypto=require('node:crypto');
const SHA=/^[0-9a-f]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ISSUE=new Set(['missing_fetch_provenance','wrong_pr_provenance','stale_head_provenance',
 'incomplete_review_count','incomplete_pagination','stale_or_invalid_fetch_time','invalid_review_issue_list']);
const FIELDS=['schema','source','workflow_run_id','workflow_run_attempt','repository',
 'pr_number','candidate_sha','review_count','matching_approved_review_count',
 'collection_complete','review_list_issues','decision','publication',
 'release_approved','evidence_usable','limitation'];
const integer=v=>Number.isSafeInteger(v)&&v>0;
function inspect(raw,context){
 if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>20000)throw Error('Invalid report byte length');
 const report=JSON.parse(raw.toString('utf8'));
 // Collector emits canonical pretty JSON with a single trailing newline.
 // Byte-for-byte comparison rejects duplicate keys, ambiguous encodings and
 // reserialized or appended content before assessing any authority fields.
 const canonical=Buffer.from(JSON.stringify(report,null,2)+'\n','utf8');
 if(!raw.equals(canonical))throw Error('Noncanonical review evidence JSON bytes');
 if(!report||typeof report!=='object'||Array.isArray(report)||
    Object.keys(report).length!==FIELDS.length||
    Object.keys(report).some(k=>!FIELDS.includes(k)))throw Error('Unexpected report structure');
 if(report.schema!=='palaco.citadel.atelier.github-review-evidence/1'||
    report.source!=='github_actions_readonly_api_observation'||
    report.decision!=='HOLD'||report.publication!=='DENY'||
    report.release_approved!==false||report.evidence_usable!==false||
    typeof report.limitation!=='string'||
    report.limitation!=='An observation artifact cannot replace current authenticated GitHub review verification')
   throw Error('Report boundary invalid');
 const {repository,prNumber,headSha,runId,attempt}=context||{};
 if(!REPO.test(repository||'')||!SHA.test(headSha||'')||
    !integer(prNumber)||!integer(runId)||!integer(attempt)||
    report.repository!==repository||report.pr_number!==prNumber||
    report.candidate_sha!==headSha||
    report.workflow_run_id!==runId||report.workflow_run_attempt!==attempt)
   throw Error('Report does not match exact workflow context');
 const n=report.review_count,m=report.matching_approved_review_count;
 if(!Number.isSafeInteger(n)||n<0||n>1000||
    !Number.isSafeInteger(m)||m<0||m>n||
    typeof report.collection_complete!=='boolean'||
    !Array.isArray(report.review_list_issues)||
    report.review_list_issues.length>20||
    report.review_list_issues.some(v=>!ISSUE.has(v))||
    (report.collection_complete&&report.review_list_issues.length!==0))
   throw Error('Report observations inconsistent');
 return {schema:'palaco.citadel.atelier.review-integrity/1',
  report_sha256:crypto.createHash('sha256').update(raw).digest('hex'),
  repository,pr_number:prNumber,candidate_sha:headSha,
  workflow_run_id:runId,workflow_run_attempt:attempt,
  result:'INTEGRITY_CHECKED',decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  note:'Hash verifies exact local report bytes only; not GitHub artifact ZIP digest or authenticated origin'};
}
function run(argv,env=process.env){
 const filename=argv[0];
 if(!filename)throw Error('Usage: node atelier/github-review-evidence-integrity.cjs <report.json>');
 const raw=fs.readFileSync(filename);
 const result=inspect(raw,{repository:env.GITHUB_REPOSITORY,
  prNumber:Number(env.PALACO_PR_NUMBER),headSha:env.PALACO_EXPECTED_HEAD_SHA,
  runId:Number(env.GITHUB_RUN_ID),attempt:Number(env.GITHUB_RUN_ATTEMPT)});
 // Separate receipt binds JSON bytes to the current CI context; it is not signed.
 if(env.PALACO_REVIEW_INTEGRITY_PATH)
  fs.writeFileSync(env.PALACO_REVIEW_INTEGRITY_PATH,JSON.stringify(result,null,2)+'\n',
   {flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('Review evidence integrity check failed: '+e.message+'\n');process.exitCode=1;}
}
module.exports={inspect,run};
