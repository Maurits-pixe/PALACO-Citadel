'use strict';
// Verify a detached Ed25519 receipt against an OUT-OF-BAND pinned public key.
// This module NEVER fetches keys from receipts and never grants publication.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const HEX=/^[0-9a-f]{64}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;
const SCHEMA='palaco.citadel.atelier.external-custody-receipt/1';
const MSG='PALACO-CITADEL-EXTERNAL-CUSTODY-RECEIPT-V1\n';
const KEYS=['schema','custodian_id','handoff_sha256','archive_zip_sha256','archive_manifest_sha256',
 'repository','pr_number','candidate_sha','run_id','run_attempt',
 'source_artifact_id','diagnostic_artifact_id','received_at','receipt_nonce'];
function ownKeys(obj,expected){
 return obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 JSON.stringify(Object.keys(obj).sort())===JSON.stringify([...expected].sort());
}
function canonical(v){return Buffer.from(JSON.stringify(v,null,2)+'\n');}
function verifyReceipt(receiptBytes,handoffBytes,pinnedPublicKeyPem,expectedCustodian,pinnedSpkiSha256){
 if(!Buffer.isBuffer(receiptBytes)||receiptBytes.length<1||receiptBytes.length>12000||
 !Buffer.isBuffer(handoffBytes)||handoffBytes.length<1||handoffBytes.length>20000)
 throw Error('Missing or oversized receipt or handoff');
 let envelope,handoff;
 try{envelope=JSON.parse(receiptBytes.toString('utf8'));handoff=JSON.parse(handoffBytes.toString('utf8'));}
 catch{throw Error('Malformed receipt or handoff JSON');}
 if(!ownKeys(envelope,['payload','signature'])||
 !receiptBytes.equals(canonical(envelope))||
 !ownKeys(envelope.payload,KEYS)||!SIGNATURE.test(envelope.signature||'')||
 !handoffBytes.equals(canonical(handoff)))
 throw Error('Noncanonical receipt or unsigned fields');
 const p=envelope.payload;
 if(p.schema!==SCHEMA||typeof expectedCustodian!=='string'||
 !/^[A-Za-z0-9_.:-]{3,100}$/.test(expectedCustodian)||
 p.custodian_id!==expectedCustodian||
 typeof p.received_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(p.received_at)||
 !Number.isFinite(Date.parse(p.received_at))||
 !HEX.test(p.receipt_nonce||'')||
 !HEX.test(p.handoff_sha256||'')||
 !HEX.test(p.archive_zip_sha256||'')||
 !HEX.test(p.archive_manifest_sha256||''))
 throw Error('Invalid external receipt identity or payload fields');
 if(handoff.schema!=='palaco.citadel.atelier.custody-handoff/1'||
 handoff.custody_state!=='NOT_EXTERNALLY_ACKNOWLEDGED'||
 handoff.decision!=='HOLD'||handoff.publication!=='DENY'||
 handoff.release_approved!==false||handoff.evidence_usable!==false||
 p.handoff_sha256!==crypto.createHash('sha256').update(handoffBytes).digest('hex')||
 p.archive_zip_sha256!==handoff.archive_zip_sha256||
 p.archive_manifest_sha256!==handoff.archive_manifest_sha256||
 p.repository!==handoff.repository||p.pr_number!==handoff.pr_number||
 p.candidate_sha!==handoff.candidate_sha||p.run_id!==handoff.run_id||
 p.run_attempt!==handoff.run_attempt||
 p.source_artifact_id!==handoff.source_artifact_id||
 p.diagnostic_artifact_id!==handoff.diagnostic_artifact_id)
 throw Error('External receipt mismatches verified handoff binding or HOLD');
 if(!HEX.test(pinnedSpkiSha256||''))throw Error('Missing trusted public key pin');
 let pub;
 try{
  pub=crypto.createPublicKey(pinnedPublicKeyPem);
  if(pub.asymmetricKeyType!=='ed25519')throw Error('Unsupported key type');
  const actualPin=crypto.createHash('sha256').update(pub.export({format:'der',type:'spki'})).digest('hex');
  if(actualPin!==pinnedSpkiSha256)throw Error('Trusted key fingerprint mismatch');
 }catch(e){throw Error('Untrusted custodian public key: '+e.message);}
 const signature=Buffer.from(envelope.signature,'base64url');
 if(signature.length!==64||signature.toString('base64url')!==envelope.signature||
 !crypto.verify(null,Buffer.concat([Buffer.from(MSG),canonical(p)]),pub,signature))
 throw Error('Invalid independent custodian signature');
 return {schema:'palaco.citadel.atelier.external-receipt-verification/1',
  result:'SIGNATURE_VALID_NOT_INDEPENDENT_CUSTODY_PROVEN',
  custodian_id:expectedCustodian,repository:p.repository,
  candidate_sha:p.candidate_sha,run_id:p.run_id,
  archive_zip_sha256:p.archive_zip_sha256,
  custody_state:'EXTERNAL_SIGNATURE_CRYPTOGRAPHICALLY_VERIFIED',
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'Signature and pinned key verified; genuine independence, possession, retention and release permission require separate evidence'};
}
function main(args,env=process.env){
 if(args.length!==4)throw Error('Usage: node github-external-receipt-verify.cjs RECEIPT_JSON HANDOFF_JSON TRUSTED_PUBLIC_KEY_PEM PIN_SHA256');
 const result=verifyReceipt(loadBounded(args[0],12000),loadBounded(args[1],20000),
  fs.readFileSync(args[2],'utf8'),env.PALACO_TRUSTED_CUSTODIAN_ID,args[3]);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write('External receipt verification DENY: '+e.message+'\n');process.exitCode=1;}}
module.exports={verifyReceipt,canonical,MSG,SCHEMA};
