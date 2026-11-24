'use strict';
// v7.06: fail-closed registry freshness anchored to an OUT-OF-BAND checkpoint pin.
// GitHub may test this contract but may not create or approve the trust anchor.
const {parseRegistry,sha,canonical}=require('./github-custodian-key-registry.cjs');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const HASH=/^[0-9a-f]{64}$/;
const KEYS=['schema','repository','registry_version','registry_sha256',
 'checkpoint_sequence','previous_checkpoint_sha256','decision','publication',
 'release_approved','evidence_usable','limitation'];
const LIMIT='Externally pinned checkpoint comparison only; custody, independently administered storage and release authorization are NOT proven';
function checkCheckpoint(registryBytes,registryPin,checkpointBytes,checkpointPin,minimumSequence){
 if(!Buffer.isBuffer(checkpointBytes)||checkpointBytes.length<1||checkpointBytes.length>12000||
 !HASH.test(checkpointPin||'')||sha(checkpointBytes)!==checkpointPin)
 throw Error('Unpinned checkpoint or modified checkpoint bytes');
 let c;
 try{c=JSON.parse(checkpointBytes.toString('utf8'));}catch{throw Error('Invalid checkpoint JSON');}
 if(!c||typeof c!=='object'||Array.isArray(c)||
 JSON.stringify(Object.keys(c).sort())!==JSON.stringify([...KEYS].sort())||
 !checkpointBytes.equals(canonical(c))||
 c.schema!=='palaco.citadel.atelier.registry-checkpoint/1'||
 c.repository!=='Maurits-pixe/PALACO-Citadel'||
 !Number.isSafeInteger(c.registry_version)||c.registry_version<1||
 !Number.isSafeInteger(c.checkpoint_sequence)||c.checkpoint_sequence<1||
 !(c.previous_checkpoint_sha256===null||HASH.test(c.previous_checkpoint_sha256||''))||
 (c.checkpoint_sequence===1)!==(c.previous_checkpoint_sha256===null)||
 !HASH.test(c.registry_sha256||'')||
 c.decision!=='HOLD'||c.publication!=='DENY'||
 c.release_approved!==false||c.evidence_usable!==false||c.limitation!==LIMIT)
 throw Error('Invalid checkpoint schema or authorization');
 if(!Number.isSafeInteger(minimumSequence)||minimumSequence<1||
 c.checkpoint_sequence<minimumSequence)
 throw Error('Checkpoint sequence rolled back below independent minimum');
 const r=parseRegistry(registryBytes,registryPin);
 // Strict equality refuses BOTH older and newer uncheckpointed versions.
 if(c.registry_version!==r.version||c.registry_sha256!==registryPin)
 throw Error('Registry does not match independently pinned current checkpoint');
 return {schema:'palaco.citadel.atelier.registry-checkpoint-verification/1',
 result:'PINNED_CHECKPOINT_MATCH_CUSTODY_UNPROVEN',
 checkpoint_sequence:c.checkpoint_sequence,checkpoint_sha256:checkpointPin,
 registry_version:r.version,registry_sha256:registryPin,
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:'Checkpoint and registry match supplied out-of-band pins; independent provenance and anti-rollback floor depend on external management'};
}
function checkAdvance(previousBytes,previousPin,nextBytes,nextPin){
 if(!Buffer.isBuffer(previousBytes)||!Buffer.isBuffer(nextBytes)||
 !HASH.test(previousPin||'')||!HASH.test(nextPin||'')||
 sha(previousBytes)!==previousPin||sha(nextBytes)!==nextPin)
 throw Error('Checkpoint update is not pinned');
 let a,b;
 try{a=JSON.parse(previousBytes);b=JSON.parse(nextBytes);}
 catch{throw Error('Malformed checkpoint transition');}
 // The next and previous registry bytes are independently validated by checkCheckpoint.
 // This only verifies checkpoint linkage, not authority to publish the next pin.
 if(!Number.isSafeInteger(a.checkpoint_sequence)||a.checkpoint_sequence<1||
 b.checkpoint_sequence!==a.checkpoint_sequence+1||
 b.previous_checkpoint_sha256!==previousPin||
 !Number.isSafeInteger(a.registry_version)||!Number.isSafeInteger(b.registry_version)||
 b.registry_version<a.registry_version)
 throw Error('Checkpoint chain rollback, fork or skipped sequence');
 return {checkpoint_sequence:b.checkpoint_sequence,checkpoint_sha256:nextPin,
 decision:'HOLD',publication:'DENY',release_approved:false};
}
function main(args,env=process.env){
 if(args.length!==4)throw Error('Usage: node github-registry-checkpoint.cjs REGISTRY REGISTRY_PIN CHECKPOINT CHECKPOINT_PIN');
 const result=checkCheckpoint(loadBounded(args[0],60000),args[1],
 loadBounded(args[2],12000),args[3],Number(env.PALACO_EXTERNAL_CHECKPOINT_MIN_SEQUENCE));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write('Registry checkpoint DENY: '+e.message+'\n');process.exitCode=1;}}
module.exports={checkCheckpoint,checkAdvance,LIMIT};
