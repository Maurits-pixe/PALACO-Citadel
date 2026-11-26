'use strict';
// Verify that a retained extracted-file diagnostic belongs to this exact CI run.
// This is consistency-only: neither matching bytes nor GitHub metadata grants GO.
const fs=require('node:fs');
const {compareExtracted}=require('./github-extracted-artifact.cjs');
const SHA256=/^[0-9a-f]{64}$/;
const FIELDS=['schema','result','repository','pr_number','candidate_sha',
 'workflow_run_id','workflow_run_attempt','evidence_sha256',
 'integrity_receipt_sha256','pair_result','decision','publication',
 'release_approved','evidence_usable','limitation','artifact_id'];
function verifyReceipt(raw,downloadDir,originalDir,context){
 if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>20000)
  throw Error('Invalid extracted receipt byte length');
 const parsed=JSON.parse(raw.toString('utf8'));
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
  Object.keys(parsed).length!==FIELDS.length||
  Object.keys(parsed).some(k=>!FIELDS.includes(k))||
  !raw.equals(Buffer.from(JSON.stringify(parsed,null,2)+'\n')))
  throw Error('Noncanonical or unexpected extracted receipt JSON');
 if(!Number.isSafeInteger(context?.artifactId)||context.artifactId<=0)
  throw Error('Invalid bound GitHub artifact ID');
 const fresh=compareExtracted(downloadDir,originalDir,context);
 const expected={...fresh,artifact_id:context.artifactId};
 if(!SHA256.test(parsed.evidence_sha256||'')||
  !SHA256.test(parsed.integrity_receipt_sha256||'')||
  Object.keys(expected).some(k=>parsed[k]!==expected[k]))
  throw Error('Extracted receipt does not match fresh CI files and workflow context');
 return {schema:'palaco.citadel.atelier.extracted-receipt-check/1',
  result:'RECEIPT_RECOMPUTED',repository:context.repository,
  artifact_id:context.artifactId,head_sha:context.headSha,
  run_id:context.runId,run_attempt:context.attempt,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Recomputed local artifact receipt is not a signed GitHub ZIP attestation'};
}
function run(args,env=process.env){
 if(args.length!==3)throw Error('Usage: node atelier/github-extracted-receipt.cjs <receipt.json> <download-dir> <original-dir>');
 const context={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const result=verifyReceipt(fs.readFileSync(args[0]),args[1],args[2],context);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('Extracted artifact receipt verification failed: '+e.message+'\n');process.exitCode=1;}}
module.exports={verifyReceipt,run};
