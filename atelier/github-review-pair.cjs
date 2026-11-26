'use strict';
// Read-only pair validation before archival: no external trust or release authority.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const SHA256=/^[a-f0-9]{64}$/;
function validatePair(reportBytes,receiptBytes,context){
 if(!Buffer.isBuffer(receiptBytes)||receiptBytes.length===0||receiptBytes.length>20000)
  throw Error('Invalid integrity receipt size');
 const receipt=JSON.parse(receiptBytes.toString('utf8'));
 const canonical=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
 if(!receiptBytes.equals(canonical))throw Error('Noncanonical integrity receipt');
 const expected=inspect(reportBytes,context);
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
    Object.keys(receipt).length!==Object.keys(expected).length||
    Object.keys(receipt).some(k=>!Object.hasOwn(expected,k))||
    !SHA256.test(receipt.report_sha256||''))
  throw Error('Unexpected integrity receipt structure');
 if(Object.keys(expected).some(k=>receipt[k]!==expected[k]))
  throw Error('Integrity receipt does not match report bytes and CI context');
 return {result:'PAIR_VERIFIED',report_sha256:crypto.createHash('sha256').update(reportBytes).digest('hex'),
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false};
}
function run(paths,env=process.env){
 if(paths.length!==2)throw Error('Usage: node atelier/github-review-pair.cjs <report.json> <receipt.json>');
 const context={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
  headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
  attempt:Number(env.GITHUB_RUN_ATTEMPT)};
 const result=validatePair(fs.readFileSync(paths[0]),fs.readFileSync(paths[1]),context);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(e){process.stderr.write('Review evidence pair rejected: '+e.message+'\n');process.exitCode=1;}
}
module.exports={validatePair,run};
