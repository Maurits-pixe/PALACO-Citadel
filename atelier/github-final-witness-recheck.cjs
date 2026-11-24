'use strict';
// Recompute and strictly compare the retained final artifact witness.
// A local consistency record is not a signed attestation or permission to release.
const fs=require('node:fs');
const {verifyAll}=require('./github-final-artifact-witness.cjs');
const FIELDS=['schema','result','repository','pr_number','candidate_sha',
 'run_id','run_attempt','artifact_id','review_sha256','github_zip_digest',
 'decision','publication','release_approved','evidence_usable','limitation'];
function recheckWitness(raw,input,context){
 if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>20000)
  throw Error('Invalid final artifact witness byte length');
 const candidate=JSON.parse(raw.toString('utf8'));
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
  Object.keys(candidate).length!==FIELDS.length||
  Object.keys(candidate).some(k=>!FIELDS.includes(k))||
  !raw.equals(Buffer.from(JSON.stringify(candidate,null,2)+'\n')))
  throw Error('Noncanonical or unexpected final artifact witness');
 const fresh=verifyAll(input,context);
 if(Object.keys(fresh).some(k=>candidate[k]!==fresh[k]))
  throw Error('Final artifact witness differs from freshly verified evidence');
 return {schema:'palaco.citadel.atelier.final-witness-recheck/1',
  result:'FINAL_WITNESS_RECOMPUTED',repository:context.repository,
  pr_number:context.prNumber,candidate_sha:context.headSha,
  run_id:context.runId,run_attempt:context.attempt,artifact_id:context.artifactId,
  review_sha256:fresh.review_sha256,github_zip_digest:fresh.github_zip_digest,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Recomputed local GitHub-reported evidence consistency, no external signature or release authorization'};
}
function run(args,env=process.env){
 if(args.length!==9)throw Error('Usage: node atelier/github-final-witness-recheck.cjs <final-witness> <review> <integrity> <metadata> <extracted-receipt> <zip-receipt> <zip> <download-dir> <original-dir>');
 const context={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const input={review:fs.readFileSync(args[1]),integrity:fs.readFileSync(args[2]),
  metadata:fs.readFileSync(args[3]),extractedReceipt:fs.readFileSync(args[4]),
  zipReceipt:fs.readFileSync(args[5]),downloadedZip:args[6],
  downloadDir:args[7],originalDir:args[8]};
 const result=recheckWitness(fs.readFileSync(args[0]),input,context);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('Final witness recheck failed: '+e.message+'\n');process.exitCode=1;}}
module.exports={recheckWitness,run};
