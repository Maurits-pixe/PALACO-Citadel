'use strict';
// PALACO Citadel Atelier release evidence evaluator — offline, read-only.
const fs=require('node:fs');
const path=require('node:path');
const SHA=/^[0-9a-f]{40}$/;
const GATES=['G01','G02','G03','G04','G05','G06','G07','G08'];
const REQUIRED={
 G01:['automated_contracts'],
 G02:['automated_recovery','browser_preservation'],
 G03:['browser_two_tabs'],
 G04:['automated_rollback'],
 G05:['browser_accessibility','manual_screenreader','physical_mobile'],
 G06:['offline_browser','export_integrity'],
 G07:['actions_all_required','deploy_all_required','independent_review'],
 G08:['authorized_go13']
};
function evaluate(registry,candidateSha){
 if(!registry||typeof registry!=='object'||Array.isArray(registry)||!SHA.test(candidateSha||'')||
   registry.schema!=='palaco.citadel.atelier.release-evidence/1'){
  throw Error('Ongeldige bewijsregistratie of kandidaat-SHA (40 hex)');
 }
 if(registry.evidence_items!==undefined&&(!Array.isArray(registry.evidence_items)||registry.evidence_items.length>1000)){
  throw Error('Ongeldige bewijsregels; controleer het lokale register');
 }
 const observed=typeof registry.observed_commit_sha==='string'?registry.observed_commit_sha:'';
 const sameSha=observed===candidateSha&&SHA.test(observed);
 const records=Array.isArray(registry.evidence_items)?registry.evidence_items:[];
 const invalidRecords=records.filter(item=>!item||typeof item!=='object'||Array.isArray(item)||
   !GATES.includes(item.gate)||!REQUIRED[item.gate].includes(item.kind)||
   !['pass','fail'].includes(item.result)||!SHA.test(item.commit_sha||'')||
   typeof item.reviewed!=='boolean'||typeof item.source!=='string'||item.source.length>2048);
 if(invalidRecords.length){
  throw Error('Onbekende of ongeldige bewijsregel; register geweigerd');
 }
 const decisions=GATES.map(id=>{
  const accepted=[];const missing=[];const conflicts=[];
  for(const kind of REQUIRED[id]){
   const eligible=records.filter(x=>x&&x.gate===id&&x.kind===kind&&x.commit_sha===candidateSha&&
     x.reviewed===true&&typeof x.source==='string'&&x.source.trim()!=='');
   const hasPass=eligible.some(x=>x.result==='pass');
   const hasFail=eligible.some(x=>x.result==='fail');
   if(hasFail&&hasPass)conflicts.push(kind);
   // A verified failure never gets hidden by another passing item.
   if(sameSha&&hasPass&&!hasFail)accepted.push(kind);
   else missing.push(kind);
  }
  return {id,pass:false,accepted,missing,conflicts}; // HOLD even if all categories appear accepted.
 });
 const blockers=[];
 if(!sameSha)blockers.push('stale_or_mismatched_commit');
 if(registry.release_approved!==true)blockers.push('no_release_approval');
 if(registry.authority!=='NONE'||registry.state!=='DRAFT')blockers.push('invalid_draft_boundary');
 for(const gate of decisions){
  if(gate.conflicts.length)blockers.push(gate.id+':conflicting_evidence:'+gate.conflicts.join(','));
  if(gate.missing.length)blockers.push(gate.id+':'+gate.missing.join(','));
 }
 return {
  schema:'palaco.citadel.atelier.release-evaluation/1',
  candidate_sha:candidateSha,observed_sha:observed||null,
  matching_commit:Boolean(sameSha),
  decision:'HOLD',publication:'DENY',release_approved:false,
  gates:decisions,blockers
 };
}
function run(argv){
 const candidate=argv[0],filename=argv[1],enforce=argv.includes('--enforce');
 if(!candidate||!filename)throw Error('Gebruik: node atelier/release-gate.cjs <40-tekens-SHA> <bewijs.json> [--enforce]');
 const record=JSON.parse(fs.readFileSync(path.resolve(filename),'utf8'));
 const result=evaluate(record,candidate);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(enforce&&result.decision!=='GO')process.exitCode=1;
 return result;
}
if(require.main===module){
 try{run(process.argv.slice(2));}
 catch(error){process.stderr.write('Vrijgavecontrole geweigerd: '+error.message+'\n');process.exitCode=2;}
}
module.exports={evaluate,run,REQUIRED,GATES};
