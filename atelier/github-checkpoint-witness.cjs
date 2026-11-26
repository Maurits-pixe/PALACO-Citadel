'use strict';
// v7.07: compare TWO separately pinned Ed25519 witness statements.
// Evidence originates out of band. Never fetch trust keys from observations.
const crypto=require('node:crypto');
const fs=require('node:fs');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const {sha,canonical}=require('./github-custodian-key-registry.cjs');
const {checkCheckpoint}=require('./github-registry-checkpoint.cjs');
const HEX=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9_.:-]{3,100}$/;
const REPO='Maurits-pixe/PALACO-Citadel';
const CONTEXT='PALACO-CITADEL-CHECKPOINT-WITNESS-V1\n';
const FIELDS=['schema','observer_id','repository','checkpoint_sequence',
 'checkpoint_sha256','registry_version','registry_sha256','observation_nonce'];
const LIMIT='Two pinned witness signatures agree; independence, freshness and custody depend on externally administered trust and sequence floor';
function exactly(value,fields){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 JSON.stringify(Object.keys(value).sort())===JSON.stringify([...fields].sort());
}
function unpack(raw,trust){
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>12000||
 !trust||!ID.test(trust.observerId||'')||!HEX.test(trust.spkiSha256||''))
 throw Error('Missing witness or externally trusted identity');
 let envelope;
 try{envelope=JSON.parse(raw.toString('utf8'));}catch{throw Error('Malformed witness JSON');}
 if(!exactly(envelope,['payload','signature'])||!raw.equals(canonical(envelope))||
 !exactly(envelope.payload,FIELDS)||
 typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature))
 throw Error('Noncanonical or unexpected witness fields');
 const p=envelope.payload;
 if(p.schema!=='palaco.citadel.atelier.checkpoint-witness/1'||
 p.observer_id!==trust.observerId||p.repository!==REPO||
 !Number.isSafeInteger(p.checkpoint_sequence)||p.checkpoint_sequence<1||
 !Number.isSafeInteger(p.registry_version)||p.registry_version<1||
 !HEX.test(p.checkpoint_sha256||'')||!HEX.test(p.registry_sha256||'')||
 !HEX.test(p.observation_nonce||''))
 throw Error('Invalid witness payload identity or checkpoint fields');
 let key;
 try{
  key=crypto.createPublicKey(trust.publicKeyPem);
  if(key.asymmetricKeyType!=='ed25519')throw Error('Expected Ed25519');
  if(sha(key.export({type:'spki',format:'der'}))!==trust.spkiSha256)
   throw Error('Pinned observer key mismatch');
 }catch(e){throw Error('Untrusted observer key: '+e.message);}
 const signature=Buffer.from(envelope.signature,'base64url');
 if(signature.length!==64||signature.toString('base64url')!==envelope.signature||
 !crypto.verify(null,Buffer.concat([Buffer.from(CONTEXT),canonical(p)]),key,signature))
 throw Error('Invalid checkpoint witness signature');
 return p;
}
function inspect(first,second,trustA,trustB,checkpointBytes,registryBytes,registryPin,checkpointPin,minSequence){
 if(!trustA||!trustB||trustA.observerId===trustB.observerId||
 trustA.spkiSha256===trustB.spkiSha256)
 throw Error('Witnesses must have distinct out-of-band pinned keys and IDs');
 const a=unpack(first,trustA),b=unpack(second,trustB);
 const verified=checkCheckpoint(registryBytes,registryPin,checkpointBytes,checkpointPin,minSequence);
 // A same-sequence conflicting signature becomes an incident, never a successful consensus.
 const same=a.checkpoint_sequence===b.checkpoint_sequence&&
 a.checkpoint_sha256===b.checkpoint_sha256&&
 a.registry_version===b.registry_version&&a.registry_sha256===b.registry_sha256;
 const matching=same&&a.checkpoint_sequence===verified.checkpoint_sequence&&
 a.checkpoint_sha256===checkpointPin&&a.registry_version===verified.registry_version&&
 a.registry_sha256===registryPin;
 const result=matching?'TWO_PINNED_WITNESSES_AGREE':'CHECKPOINT_SPLIT_VIEW_OR_STALE_OBSERVATION';
 return {schema:'palaco.citadel.atelier.checkpoint-witness-incident/1',result,
  repository:REPO,checkpoint_sequence:verified.checkpoint_sequence,
  checkpoint_sha256:checkpointPin,
  observer_ids:[a.observer_id,b.observer_id],
  observations:[{sequence:a.checkpoint_sequence,sha256:a.checkpoint_sha256},
                {sequence:b.checkpoint_sequence,sha256:b.checkpoint_sha256}],
  incident:!matching,decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,limitation:LIMIT};
}
function requireAgreement(...args){
 const result=inspect(...args);
 if(result.incident)throw Error('Signed checkpoint split-view/staleness incident: HOLD/DENY');
 return result;
}
function main(args,env=process.env){
 if(args.length!==10)throw Error('Usage: node github-checkpoint-witness.cjs OBS_A OBS_B KEY_A_PEM PIN_A KEY_B_PEM PIN_B REGISTRY REG_PIN CHECKPOINT CHECKPOINT_PIN');
 const [a,b,keyA,pinA,keyB,pinB,reg,regPin,cp,cpPin]=args;
 const trusts=[{observerId:env.PALACO_WITNESS_A_ID,publicKeyPem:fs.readFileSync(keyA,'utf8'),spkiSha256:pinA},
 {observerId:env.PALACO_WITNESS_B_ID,publicKeyPem:fs.readFileSync(keyB,'utf8'),spkiSha256:pinB}];
 const evidence=[loadBounded(a,12000),loadBounded(b,12000),trusts[0],trusts[1],
 loadBounded(cp,12000),loadBounded(reg,60000),regPin,cpPin,
 Number(env.PALACO_EXTERNAL_CHECKPOINT_MIN_SEQUENCE)];
 const report=inspect(...evidence);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(report.incident)process.exitCode=1;
 return report;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write('Checkpoint witness DENY: '+e.message+'\n');process.exitCode=1;}}
module.exports={unpack,inspect,requireAgreement,CONTEXT};
