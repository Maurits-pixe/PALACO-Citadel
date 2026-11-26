'use strict';
// Read-only, offline verification of GitHub PR review metadata.
// Input must originate from an independently retrieved GitHub API response.
// An arbitrary JSON file cannot prove its own provenance or issue authority.
const fs=require('node:fs');
const SHA=/^[0-9a-f]{40}$/;
const login=v=>typeof v==='string'?v.trim().toLowerCase():'';
const state=v=>typeof v==='string'?v.toUpperCase():'';
function audit({reviews,candidateSha,prNumber,authorLogin,provenance,now}){
 if(!Array.isArray(reviews)||reviews.length>1000||!SHA.test(candidateSha||'')||
    !Number.isSafeInteger(prNumber)||prNumber<=0||!login(authorLogin)){
   throw Error('Ongeldige GitHub-reviewinvoer');
 }
 const issues=[];
 // The review list is diagnostic unless completeness/freshness metadata is supplied.
 // This metadata is declarative, NOT proof of GitHub API authenticity.
 const checkedAt=provenance?.fetched_at;
 const asOf=typeof now==='string'?Date.parse(now):Date.now();
 const fetched=typeof checkedAt==='string'?Date.parse(checkedAt):NaN;
 if(!provenance||typeof provenance!=='object'||Array.isArray(provenance))issues.push('missing_fetch_provenance');
 else {
  if(provenance.pr_number!==prNumber)issues.push('wrong_pr_provenance');
  if(provenance.head_sha!==candidateSha)issues.push('stale_head_provenance');
  if(!Number.isSafeInteger(provenance.total_count)||provenance.total_count!==reviews.length)
   issues.push('incomplete_review_count');
  if(provenance.has_next_page!==false||provenance.pagination_complete!==true)
   issues.push('incomplete_pagination');
  if(!Number.isFinite(fetched)||!Number.isFinite(asOf)||fetched>asOf||
     asOf-fetched>15*60*1000)issues.push('stale_or_invalid_fetch_time');
 }
 const approved=[];const rejected=[];
 const latestByReviewer=new Map();
 const reviewIdCounts=new Map();
 for(const item of reviews){
  const r=item&&typeof item==='object'&&!Array.isArray(item)?item:{};
  const id=r.databaseId||r.id||r.github_review_id;
  if(Number.isSafeInteger(id))reviewIdCounts.set(id,(reviewIdCounts.get(id)||0)+1);
 }
 // Later reviews by the same author supersede earlier approval. If chronology
 // cannot be established reliably, refuse to rely on any of those reviews.
 for(const item of reviews){
  const r=item&&typeof item==='object'&&!Array.isArray(item)?item:{};
  const reviewer=login(r.author?.login||r.user?.login||r.reviewer?.login||r.reviewer_id);
  if(!reviewer)continue;
  const submitted=r.submittedAt||r.submitted_at;
  const timestamp=typeof submitted==='string'&&Number.isFinite(Date.parse(submitted))?
    Date.parse(submitted):null;
  const previous=latestByReviewer.get(reviewer);
  if(!previous){latestByReviewer.set(reviewer,{item:r,timestamp,ambiguous:false,count:1});continue;}
  previous.count++;
  if(timestamp===null||previous.timestamp===null||timestamp===previous.timestamp){
   previous.ambiguous=true;continue;
  }
  if(timestamp>previous.timestamp){previous.item=r;previous.timestamp=timestamp;}
 }
 for(const item of reviews){
  const r=item&&typeof item==='object'&&!Array.isArray(item)?item:{};
  const reviewer=login(r.author?.login||r.user?.login||r.reviewer?.login||r.reviewer_id);
  const reviewState=state(r.state);
  const sha=r.commit?.oid||r.commit_id||r.commit_sha||r.reviewed_commit_sha||'';
  const id=r.databaseId||r.id||r.github_review_id;
  const url=r.url||r.html_url||r.review_url||'';
  const matchesLink=typeof url==='string'&&
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+#pullrequestreview-\d+$/.test(url)&&
    url.endsWith('/pull/'+prNumber+'#pullrequestreview-'+id);
  const reasons=[];
  const history=reviewer?latestByReviewer.get(reviewer):null;
  if(history?.ambiguous)reasons.push('ambiguous_review_history');
  else if(history&&history.item!==r)reasons.push('superseded_review');
  if(Number.isSafeInteger(id)&&(reviewIdCounts.get(id)||0)>1)reasons.push('duplicate_review_id');
  if(reviewState!=='APPROVED')reasons.push('not_approved');
  if(!reviewer||reviewer===login(authorLogin))reasons.push('not_independent');
  if(sha!==candidateSha)reasons.push('wrong_commit');
  if(!Number.isSafeInteger(id)||id<=0||!matchesLink)reasons.push('invalid_review_identity');
  const result={id:Number.isSafeInteger(id)?id:null,reviewer:reviewer||null,state:reviewState||null,reasons};
  if(reasons.length)rejected.push(result);else approved.push(result);
 }
 // A GitHub API response is only an observation. Never emit authorization.
 return {schema:'palaco.citadel.atelier.github-review-audit/1',state:'DRAFT',
  candidate_sha:candidateSha,pr_number:prNumber,review_count:reviews.length,
  matching_approved_review_count:approved.length,approved,rejected,
  evidence_usable:false,review_list_complete_claim:issues.length===0,
  review_list_issues:issues,
  decision:'HOLD',publication:'DENY',release_approved:false,
  provenance_warning:'Locally supplied review JSON is not an authenticated GitHub API attestation'};
}
function main(args){
 const [filename,candidateSha,prText,authorLogin]=args;
 const prNumber=Number(prText);
 const input=JSON.parse(fs.readFileSync(filename,'utf8'));
 const reviews=Array.isArray(input)?input:input?.reviews;
 const provenance=Array.isArray(input)?undefined:input?.provenance;
 const result=audit({reviews,candidateSha,prNumber,authorLogin,provenance});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(require.main===module){
 try{main(process.argv.slice(2));}
 catch(e){process.stderr.write('Reviewaudit geweigerd: '+e.message+'\n');process.exitCode=2;}
}
module.exports={audit};
