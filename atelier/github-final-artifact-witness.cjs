'use strict';
// Final consistency boundary spanning original review, downloaded JSON and ZIP.
// This is a diagnostic only, never a release or signature authorization.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {checkChain}=require('./github-artifact-chain.cjs');
const {verifyReceipt:checkExtracted}=require('./github-extracted-receipt.cjs');
const {verifyReceipt:checkZip}=require('./github-zip-receipt-recheck.cjs');
function verifyAll(input,context){
 const {review,integrity,metadata,extractedReceipt,zipReceipt,
  downloadedZip,downloadDir,originalDir}=input;
 const chained=checkChain(review,integrity,metadata,context);
 if(chained.result!=='CHAIN_METADATA_CONSISTENT')
  throw Error('Final artifact witness requires observed GitHub ZIP metadata');
 const extracted=checkExtracted(extractedReceipt,downloadDir,originalDir,context);
 const zipped=checkZip(zipReceipt,downloadedZip,metadata,context);
 const raw=JSON.parse(zipReceipt.toString('utf8'));
 if(chained.github_zip_digest!==zipped.zip_sha256||
  raw.github_zip_digest!==chained.github_zip_digest||
  extracted.artifact_id!==chained.artifact_id||
  zipped.artifact_id!==chained.artifact_id||
  extracted.head_sha!==chained.head_sha||
  zipped.candidate_sha!==chained.head_sha||
  extracted.run_id!==chained.run_id||zipped.run_id!==chained.run_id)
  throw Error('Final artifact witness cross-check found incompatible evidence');
 const originalHash=crypto.createHash('sha256').update(review).digest('hex');
 if(originalHash!==chained.report_sha256)
  throw Error('Review source SHA-256 differs from original evidence chain');
 return {schema:'palaco.citadel.atelier.final-artifact-witness/1',
  result:'ALL_LOCAL_ARTIFACT_CHECKS_CONSISTENT',repository:context.repository,
  pr_number:context.prNumber,candidate_sha:context.headSha,
  run_id:context.runId,run_attempt:context.attempt,artifact_id:context.artifactId,
  review_sha256:originalHash,github_zip_digest:zipped.zip_sha256,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Cross-checked local CI data and GitHub-reported digest; no independent signature or release authority'};
}
function run(args,env=process.env){
 if(args.length!==8)throw Error('Usage: node atelier/github-final-artifact-witness.cjs <review> <integrity> <metadata> <extracted-receipt> <zip-receipt> <zip> <download-dir> <original-dir>');
 const context={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const input={review:fs.readFileSync(args[0]),integrity:fs.readFileSync(args[1]),
  metadata:fs.readFileSync(args[2]),extractedReceipt:fs.readFileSync(args[3]),
  zipReceipt:fs.readFileSync(args[4]),downloadedZip:args[5],
  downloadDir:args[6],originalDir:args[7]};
 const result=verifyAll(input,context);
 if(env.PALACO_FINAL_ARTIFACT_WITNESS_PATH)
  fs.writeFileSync(env.PALACO_FINAL_ARTIFACT_WITNESS_PATH,
   JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('Final artifact witness rejected: '+e.message+'\n');process.exitCode=1;}}
module.exports={verifyAll,run};
