'use strict';
// Offline deterministic incident ledger. Hash chaining does not replace an external head pin.
const crypto=require('node:crypto');
const fs=require('node:fs');
const {canonical}=require('./github-custodian-key-registry.cjs');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_.:-]{3,100}$/;
const SCHEMA='palaco.citadel.atelier.incident-ledger/1';
const LIMIT='Local hash-chain integrity only; externally pinned ledger head and authenticated witness evidence required for independent audit';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function keys(v,names){
 return v&&typeof v==='object'&&!Array.isArray(v)&&
 JSON.stringify(Object.keys(v).sort())===JSON.stringify([...names].sort());
}
function base(){return {schema:SCHEMA,repository:'Maurits-pixe/PALACO-Citadel',
 records:[],decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,limitation:LIMIT};}
function validateReport(r,incident){
 if(!keys(r,['schema','result','repository','checkpoint_sequence',
 'checkpoint_sha256','observer_ids','observations','incident','decision',
 'publication','release_approved','evidence_usable','limitation'])||
 r.schema!=='palaco.citadel.atelier.checkpoint-witness-incident/1'||
 r.repository!=='Maurits-pixe/PALACO-Citadel'||
 r.incident!==incident||
 r.result!==(incident?'CHECKPOINT_SPLIT_VIEW_OR_STALE_OBSERVATION':'TWO_PINNED_WITNESSES_AGREE')||
 !Number.isSafeInteger(r.checkpoint_sequence)||r.checkpoint_sequence<1||
 !SHA.test(r.checkpoint_sha256||'')||
 !Array.isArray(r.observer_ids)||r.observer_ids.length!==2||
 !ID.test(r.observer_ids[0]||'')||!ID.test(r.observer_ids[1]||'')||
 r.observer_ids[0]===r.observer_ids[1]||
 !Array.isArray(r.observations)||r.observations.length!==2||
 r.observations.some(o=>!keys(o,['sequence','sha256'])||
 !Number.isSafeInteger(o.sequence)||o.sequence<1||!SHA.test(o.sha256||''))||
 r.decision!=='HOLD'||r.publication!=='DENY'||
 r.release_approved!==false||r.evidence_usable!==false)
 throw Error('Untrusted or noncanonical witness report shape');
 return r;
}
function recordDigest(record){
 const {record_sha256,...body}=record;
 return hash(canonical(body));
}
function verifyLedger(raw,minimum={sequence:0,head:null}){
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>1000000)
 throw Error('Ledger is missing or oversized');
 let ledger;try{ledger=JSON.parse(raw.toString('utf8'));}
 catch{throw Error('Invalid ledger JSON');}
 if(!raw.equals(canonical(ledger))||!keys(ledger,['schema','repository','records',
 'decision','publication','release_approved','evidence_usable','limitation'])||
 ledger.schema!==SCHEMA||ledger.repository!=='Maurits-pixe/PALACO-Citadel'||
 !Array.isArray(ledger.records)||ledger.records.length>500||
 ledger.decision!=='HOLD'||ledger.publication!=='DENY'||
 ledger.release_approved!==false||ledger.evidence_usable!==false||
 ledger.limitation!==LIMIT)throw Error('Invalid canonical ledger or authority claim');
 const seen=new Set(),open=new Set();
 let last=null;
 for(let i=0;i<ledger.records.length;i++){
  const r=ledger.records[i];
  if(!keys(r,['sequence','kind','incident_id','evidence_sha256',
    'checkpoint_sha256','previous_sha256','record_sha256'])||
  r.sequence!==i+1||!['OPEN','RECOVERY_RECORDED'].includes(r.kind)||
  !ID.test(r.incident_id||'')||!SHA.test(r.evidence_sha256||'')||
  !SHA.test(r.checkpoint_sha256||'')||
  r.previous_sha256!==last||!SHA.test(r.record_sha256||'')||
  r.record_sha256!==recordDigest(r))
   throw Error('Broken incident hash chain, invalid record or sequence');
  if(r.kind==='OPEN'){
   if(seen.has(r.incident_id))throw Error('Duplicate incident identifier');
   seen.add(r.incident_id);open.add(r.incident_id);
  }else{
   if(!open.has(r.incident_id))throw Error('Recovery without one open incident');
   open.delete(r.incident_id);
  }
  last=r.record_sha256;
 }
 if(!minimum||!Number.isSafeInteger(minimum.sequence)||minimum.sequence<0||
 (minimum.sequence===0?minimum.head!==null:!SHA.test(minimum.head||'')))
 throw Error('Invalid external minimum ledger head');
 if(ledger.records.length<minimum.sequence||
 (minimum.sequence>0&&ledger.records[minimum.sequence-1].record_sha256!==minimum.head))
 throw Error('Ledger truncated or diverges from externally pinned head');
 return {ledger,open,head:last};
}
function append(raw,kind,incidentId,evidenceBytes,minimum={sequence:0,head:null}){
 const {ledger,open,head}=verifyLedger(raw,minimum);
 if(!ID.test(incidentId||'')||!Buffer.isBuffer(evidenceBytes)||
 evidenceBytes.length<1||evidenceBytes.length>12000)
 throw Error('Invalid incident identity or evidence');
 let report;
 try{report=JSON.parse(evidenceBytes.toString('utf8'));}
 catch{throw Error('Malformed witness diagnostic');}
 if(!evidenceBytes.equals(canonical(report)))
 throw Error('Noncanonical witness diagnostic');
 validateReport(report,kind==='OPEN');
 if(kind==='OPEN'&&ledger.records.some(r=>r.incident_id===incidentId)||
 kind==='RECOVERY_RECORDED'&&!open.has(incidentId)||
 !['OPEN','RECOVERY_RECORDED'].includes(kind))
 throw Error('Duplicate incident or unauthorized recovery');
 const entry={sequence:ledger.records.length+1,kind,incident_id:incidentId,
 evidence_sha256:hash(evidenceBytes),checkpoint_sha256:report.checkpoint_sha256,
 previous_sha256:head};
 entry.record_sha256=recordDigest(entry);
 const next={...ledger,records:[...ledger.records,entry]};
 verifyLedger(canonical(next),minimum);
 return next;
}
function main(args,env=process.env){
 if(args.length!==4||!['OPEN','RECOVERY_RECORDED'].includes(args[0]))
 throw Error('Usage: node github-incident-ledger.cjs OPEN|RECOVERY_RECORDED INCIDENT_ID EVIDENCE_JSON OUTPUT_JSON');
 const oldPath=env.PALACO_LEDGER_INPUT;
 const raw=oldPath?loadBounded(oldPath,1000000):canonical(base());
 const floor={sequence:Number(env.PALACO_LEDGER_MIN_SEQUENCE||0),
 head:env.PALACO_LEDGER_MIN_HEAD_SHA256||null};
 const result=append(raw,args[0],args[1],loadBounded(args[2],12000),floor);
 fs.writeFileSync(args[3],canonical(result),{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({sequence:result.records.length,
 head_sha256:result.records.at(-1).record_sha256,decision:'HOLD',publication:'DENY'})+'\n');
 return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write('Incident ledger DENY: '+e.message+'\n');process.exitCode=1;}}
module.exports={base,append,verifyLedger,canonical,recordDigest,validateReport};
