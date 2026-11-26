'use strict';
// v7.11 read-only recovery assessment. NO rename, delete, lock reclaim or auto-promotion.
const fs=require('node:fs');
const path=require('node:path');
const {inspectCommit}=require('./github-atomic-incident-archive.cjs');
const {verifyLedger,canonical}=require('./github-incident-ledger.cjs');
const {sha}=require('./github-custodian-key-registry.cjs');
const HEX=/^[0-9a-f]{64}$/;
const COMMIT=/^commit-([0-9]{6})-([a-f0-9]{16})$/;
const PREPARE=/^\.prepare-(commit-[0-9]{6}-[a-f0-9]{16})$/;
function readOnlyAssessment(root,stageName,priorLedgerBytes,minimum={sequence:0,head:null}){
 if(typeof root!=='string'||typeof stageName!=='string'||!PREPARE.test(stageName))
  throw Error('Invalid recovery stage identifier');
 const rootSt=fs.lstatSync(root);
 if(!rootSt.isDirectory()||rootSt.isSymbolicLink())
  throw Error('Unsafe recovery root');
 const rootReal=fs.realpathSync(root);
 const names=fs.readdirSync(rootReal);
 const stage=path.join(rootReal,stageName);
 if(!names.includes(stageName))throw Error('Missing quarantined transaction');
 if(names.includes('.writer-lock'))throw Error('Writer lock requires independent review');
 if(names.filter(n=>n.startsWith('.prepare-')).length!==1)
  throw Error('Multiple unresolved preparations require separate investigation');
 if(!Buffer.isBuffer(priorLedgerBytes))throw Error('Prior ledger bytes required');
 const prior=verifyLedger(priorLedgerBytes,minimum);
 const expectedSequence=prior.ledger.records.length+1;
 const commits=names.filter(n=>COMMIT.test(n)).sort();
 if(commits.length!==expectedSequence-1)
  throw Error('Committed history length diverges from recovery predecessor');
 if(commits.length){
  const last=inspectCommit(path.join(rootReal,commits.at(-1)));
  if(last.manifest.sequence!==expectedSequence-1||
     last.manifest.head_sha256!==prior.head||
     !last.ledgerBytes.equals(priorLedgerBytes))
   throw Error('Predecessor ledger does not match last committed archive');
 }else if(prior.head!==null)throw Error('Unexpected nonempty predecessor ledger');
 const data=inspectCommit(stage); // exact 3 files, no symlinks, hashes/canonical JSON
 const m=data.manifest;
 const recordName='commit-'+String(m.sequence).padStart(6,'0')+'-'+
    sha(Buffer.concat([data.ledgerBytes,data.proofBytes])).slice(0,16);
 if(stageName!=='.prepare-'+recordName||m.sequence!==expectedSequence||
    m.previous_sha256!==prior.head)
  throw Error('Quarantine identity or predecessor hash mismatch');
 const ledger=verifyLedger(data.ledgerBytes,minimum).ledger;
 const newest=ledger.records.at(-1),proof=JSON.parse(data.proofBytes.toString('utf8'));
 if(ledger.records.length!==expectedSequence||
    !canonical(ledger).equals(data.ledgerBytes)||
    JSON.stringify(ledger.records.slice(0,-1))!==JSON.stringify(prior.ledger.records)||
    newest.previous_sha256!==prior.head||
    proof.schema!=='palaco.citadel.atelier.authenticated-incident-proof/1'||
    proof.sequence!==newest.sequence||proof.kind!==newest.kind||
    proof.incident_id!==newest.incident_id||
    proof.record_sha256!==newest.record_sha256||
    proof.evidence_sha256!==newest.evidence_sha256||
    proof.decision!=='HOLD'||proof.publication!=='DENY'||
    proof.release_approved!==false||proof.evidence_usable!==false)
   throw Error('Recovery evidence is not bound to exact predecessor and proof');
 if(names.includes(recordName))throw Error('Target commit already exists');
 return {schema:'palaco.citadel.atelier.recovery-assessment/1',
   result:'QUARANTINED_ARCHIVE_INTEGRITY_CHECK_PASSED',
   recovery_authorized:false,promotion_performed:false,
   sequence:m.sequence,head_sha256:m.head_sha256,
   commit_name:recordName,stage_name:stageName,
   archive_manifest_sha256:sha(data.manifestBytes),
   decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
   limitation:'Local read-only integrity assessment; authenticity, external custody and manual recovery authorization are not established'};
}
function main(args,env=process.env){
 if(args.length!==3)throw Error('Usage: node github-incident-recovery.cjs ROOT PREPARE_NAME PRIOR_LEDGER');
 const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
 const min={sequence:Number(env.PALACO_LEDGER_MIN_SEQUENCE||0),
 head:env.PALACO_LEDGER_MIN_HEAD_SHA256||null};
 const report=readOnlyAssessment(args[0],args[1],loadBounded(args[2],1000000),min);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 return report;
}
if(require.main===module){try{main(process.argv.slice(2));}
 catch(e){process.stderr.write('Recovery denied: '+e.message+'\n');process.exitCode=1;}}
module.exports={readOnlyAssessment,main};
