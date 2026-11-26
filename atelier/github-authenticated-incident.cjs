'use strict';
// v7.09: derive incident records ONLY from raw, signature-verified witness envelopes.
// No caller-supplied witness-summary JSON is accepted as authoritative evidence.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {inspect}=require('./github-checkpoint-witness.cjs');
const {base,append,verifyLedger,canonical}=require('./github-incident-ledger.cjs');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const {sha}=require('./github-custodian-key-registry.cjs');
function authenticatedAppend(ledgerBytes,kind,incidentId,evidence,minimum={sequence:0,head:null}){
 if(!evidence||!Buffer.isBuffer(evidence.first)||!Buffer.isBuffer(evidence.second)||
 !Buffer.isBuffer(evidence.registry)||!Buffer.isBuffer(evidence.checkpoint)||
 !evidence.trustA||!evidence.trustB)
 throw Error('Raw signed witness evidence and pinned trust inputs required');
 if(!['OPEN','RECOVERY_RECORDED'].includes(kind))
 throw Error('Invalid incident action');
 const report=inspect(evidence.first,evidence.second,evidence.trustA,evidence.trustB,
  evidence.checkpoint,evidence.registry,evidence.registryPin,
  evidence.checkpointPin,evidence.minSequence);
 if((kind==='OPEN')!==report.incident)
 throw Error('Witness state does not authorize requested incident or recovery registration');
 const rawReport=canonical(report);
 const next=append(ledgerBytes,kind,incidentId,rawReport,minimum);
 const previous=verifyLedger(ledgerBytes,minimum).ledger;
 const record=next.records.at(-1);
 const audit={schema:'palaco.citadel.atelier.authenticated-incident-proof/1',
  kind,incident_id:incidentId,sequence:record.sequence,record_sha256:record.record_sha256,
  evidence_sha256:sha(rawReport),first_witness_sha256:sha(evidence.first),
  second_witness_sha256:sha(evidence.second),checkpoint_sha256:evidence.checkpointPin,
  registry_sha256:evidence.registryPin,previous_ledger_length:previous.records.length,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Cryptographic witness verification only; witness independence, evidence retention, external ledger head and release remain unproven'};
 return {ledger:next,proof:audit,report};
}
function main(args,env=process.env){
 if(args.length!==15||!['OPEN','RECOVERY_RECORDED'].includes(args[0]))
 throw Error('Usage: node github-authenticated-incident.cjs KIND INCIDENT_ID WITNESS_A WITNESS_B PUBKEY_A PIN_A ID_A PUBKEY_B PIN_B ID_B REGISTRY REGISTRY_PIN CHECKPOINT CHECKPOINT_PIN OUTPUT_PREFIX');
 const [kind,incidentId,wA,wB,keyA,pinA,idA,keyB,pinB,idB,registry,regPin,checkpoint,cpPin,prefix]=args;
 const evidence={first:loadBounded(wA,12000),second:loadBounded(wB,12000),
  trustA:{observerId:idA,publicKeyPem:fs.readFileSync(keyA,'utf8'),spkiSha256:pinA},
  trustB:{observerId:idB,publicKeyPem:fs.readFileSync(keyB,'utf8'),spkiSha256:pinB},
  registry:loadBounded(registry,60000),checkpoint:loadBounded(checkpoint,12000),
  registryPin:regPin,checkpointPin:cpPin,
  minSequence:Number(env.PALACO_EXTERNAL_CHECKPOINT_MIN_SEQUENCE)};
 const old=env.PALACO_LEDGER_INPUT?loadBounded(env.PALACO_LEDGER_INPUT,1000000):canonical(base());
 const floor={sequence:Number(env.PALACO_LEDGER_MIN_SEQUENCE||0),
  head:env.PALACO_LEDGER_MIN_HEAD_SHA256||null};
 const result=authenticatedAppend(old,kind,incidentId,evidence,floor);
 // Exclusive creation; no automatic release or remote publication.
 const ledgerPath=prefix+'.ledger.json',proofPath=prefix+'.proof.json';
 if(fs.existsSync(ledgerPath)||fs.existsSync(proofPath))
 throw Error('Output exists: refusing overwrite');
 fs.writeFileSync(ledgerPath,canonical(result.ledger),{flag:'wx',mode:0o600});
 fs.writeFileSync(proofPath,canonical(result.proof),{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify(result.proof,null,2)+'\n');
 return result;
}
if(require.main===module){try{main(process.argv.slice(2));}
 catch(e){process.stderr.write('Authenticated incident DENY: '+e.message+'\n');process.exitCode=1;}}
module.exports={authenticatedAppend,main};
