'use strict';
// Recheck the persisted ZIP diagnostic using downloaded bytes and current CI context.
// An observed GitHub digest is not an independent signature or a release gate.
const fs=require('node:fs');
const {verifyZip}=require('./github-zip-integrity.cjs');
const EXPECTED_FIELDS=['schema','result','repository','run_id','candidate_sha',
 'artifact_id','github_zip_digest','zip_bytes','decision','publication',
 'release_approved','evidence_usable','limitation'];
function verifyReceipt(receiptBytes,zipPath,metadataBytes,context){
 if(!Buffer.isBuffer(receiptBytes)||receiptBytes.length===0||receiptBytes.length>20000)
  throw Error('Invalid ZIP receipt size');
 const parsed=JSON.parse(receiptBytes.toString('utf8'));
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
  Object.keys(parsed).length!==EXPECTED_FIELDS.length||
  Object.keys(parsed).some(k=>!EXPECTED_FIELDS.includes(k))||
  !receiptBytes.equals(Buffer.from(JSON.stringify(parsed,null,2)+'\n')))
  throw Error('Invalid canonical ZIP receipt');
 const fresh=verifyZip(zipPath,metadataBytes,context);
 if(Object.keys(fresh).some(k=>parsed[k]!==fresh[k]))
  throw Error('Stored ZIP receipt differs from current source, digest or run');
 return {schema:'palaco.citadel.atelier.zip-receipt-recheck/1',
  result:'ZIP_RECEIPT_RECOMPUTED',repository:context.repository,
  candidate_sha:context.headSha,run_id:context.runId,
  artifact_id:context.artifactId,zip_sha256:fresh.github_zip_digest,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Read-only recheck of GitHub-reported ZIP digest; not a signed attestation'};
}
function run(args,env=process.env){
 if(args.length!==3)
  throw Error('Usage: node atelier/github-zip-receipt-recheck.cjs <receipt.json> <download.zip> <metadata.json>');
 const context={repository:env.GITHUB_REPOSITORY,runId:Number(env.GITHUB_RUN_ID),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,artifactId:Number(env.PALACO_ARTIFACT_ID)};
 const result=verifyReceipt(fs.readFileSync(args[0]),args[1],fs.readFileSync(args[2]),context);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('ZIP receipt recheck failed: '+e.message+'\n');process.exitCode=1;}
}
module.exports={verifyReceipt,run};
