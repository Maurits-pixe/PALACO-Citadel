import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDecision} from './earth-078-verify-decision.mjs';
import {reviewerKeyFingerprint} from './earth-082-reviewer-key-binding.mjs';
import {evaluateGISAdmissionCandidate} from './earth-083-admission-pipeline.mjs';
test('full pipeline verifies bytes signature roles epochs and key binding but never admits automatically',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'earth083-'));
 try{
  const sourcePath=join(dir,'source.zip'),outputPath=join(dir,'output.geojson');
  await writeFile(sourcePath,'fixture source');await writeFile(outputPath,'fixture output');
  const sha=s=>createHash('sha256').update(s).digest('hex');
  const sourceSHA256=sha('fixture source'),outputSHA256=sha('fixture output'),reviewerId='alice';
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const pem=publicKey.export({type:'spki',format:'pem'});
  const dossier={source:{sha256:sourceSHA256},conversion:{sourceSHA256,outputSHA256,rendererCompatible:true},review:{decision:'ACCEPT',reviewerId,evidenceRef:'fixture'}};
  const signature=sign(null,canonicalDecision({sourceSHA256,outputSHA256,reviewerId,decision:'ACCEPT'}),privateKey).toString('base64');
  const registry=new Map([['alice',{active:true,revoked:false,validFromEpoch:1,roles:['GIS_SOURCE_REVIEWER'],keyFingerprint:reviewerKeyFingerprint(pem)}],['bob',{active:true,revoked:false,validFromEpoch:1,roles:['GIS_RELEASE_APPROVER']}]]);
  const input={dossier,sourcePath,outputPath,signature,trustAnchors:new Map([['alice',pem]]),registry,trustedEpoch:2,minimumAcceptedEpoch:2,sourceReview:{decision:'ACCEPT',independent:true,recordId:'S1',reviewerId:'alice'},releaseReview:{decision:'APPROVE',authorized:true,recordId:'R1',reviewerId:'bob'}};
  assert.equal((await evaluateGISAdmissionCandidate(input)).status,'AWAITING_EXPLICIT_MANUAL_ADMISSION');
  assert.equal((await evaluateGISAdmissionCandidate({...input,trustAnchors:new Map()})).stage,'CRYPTOGRAPHY');
  assert.equal((await evaluateGISAdmissionCandidate({...input,minimumAcceptedEpoch:3})).stage,'GOVERNANCE');
  const revoked=new Map(registry);revoked.set('alice',{...registry.get('alice'),revoked:true});
  assert.equal((await evaluateGISAdmissionCandidate({...input,registry:revoked})).stage,'GOVERNANCE');
  await writeFile(outputPath,'tampered');
  assert.equal((await evaluateGISAdmissionCandidate(input)).stage,'CRYPTOGRAPHY');
 }finally{await rm(dir,{recursive:true,force:true})}
});
