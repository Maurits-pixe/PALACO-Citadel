'use strict';
// Offline three-way consistency check. Neither REST metadata nor local hashes grant GO.
const fs=require('node:fs');
const {validatePair}=require('./github-review-pair.cjs');
const {sanitizeObservation}=require('./github-artifact-metadata.cjs');
const DIGEST=/^sha256:[a-f0-9]{64}$/;
function checkChain(reviewBytes,receiptBytes,metadataBytes,context){
 if(!Buffer.isBuffer(metadataBytes)||metadataBytes.length===0||metadataBytes.length>20000)
  throw Error('Invalid metadata observation byte length');
 const observation=JSON.parse(metadataBytes.toString('utf8'));
 const canonical=Buffer.from(JSON.stringify(observation,null,2)+'\n');
 if(!metadataBytes.equals(canonical))throw Error('Noncanonical metadata observation JSON bytes');
 const normalized=sanitizeObservation(observation);
 if(JSON.stringify(normalized,null,2)+'\n'!==metadataBytes.toString('utf8'))
  throw Error('Metadata observation contains untrusted fields or ordering');
 const pair=validatePair(reviewBytes,receiptBytes,context);
 if(!Number.isSafeInteger(context?.artifactId)||context.artifactId<=0||
  normalized.artifact_id!==context.artifactId||
  normalized.repository!==context.repository||
  normalized.run_id!==context.runId||
  normalized.head_sha!==context.headSha)
  throw Error('Artifact observation does not match evidence pair context');
 const observed=normalized.result==='GITHUB_METADATA_OBSERVED';
 if(observed&&!DIGEST.test(normalized.github_zip_digest||''))
  throw Error('Artifact ZIP digest is missing');
 return {schema:'palaco.citadel.atelier.review-artifact-chain/1',
  repository:context.repository,pr_number:context.prNumber,
  head_sha:context.headSha,run_id:context.runId,run_attempt:context.attempt,
  artifact_id:context.artifactId,report_sha256:pair.report_sha256,
  artifact_metadata_status:normalized.result,
  github_zip_digest:observed?normalized.github_zip_digest:null,
  result:observed?'CHAIN_METADATA_CONSISTENT':'CHAIN_METADATA_UNAVAILABLE',
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Consistency of local JSON and GitHub API metadata is not downloaded ZIP verification or release authorization'};
}
function run(files,env=process.env){
 if(files.length!==3)throw Error('Usage: node atelier/github-artifact-chain.cjs <review.json> <integrity.json> <metadata.json>');
 const context={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const result=checkChain(...files.map(f=>fs.readFileSync(f)),context);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(err){process.stderr.write('GitHub review artifact chain check failed: '+err.message+'\n');process.exitCode=1;}
}
module.exports={checkChain,run};
