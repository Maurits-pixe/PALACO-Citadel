import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDecision,verifyGISDecision} from './earth-078-verify-decision.mjs';
test('EARTH-078 verifies pinned bytes and trusted Ed25519 decision only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'earth078-'));
 try{
  const sourcePath=join(dir,'source.zip'),outputPath=join(dir,'map.geojson');
  await writeFile(sourcePath,'source fixture');await writeFile(outputPath,'output fixture');
  const sha=s=>createHash('sha256').update(s).digest('hex');
  const sourceSHA256=sha('source fixture'),outputSHA256=sha('output fixture');
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const reviewerId='independent-reviewer';
  const dossier={source:{sha256:sourceSHA256},conversion:{sourceSHA256,outputSHA256,rendererCompatible:true},review:{decision:'ACCEPT',reviewerId,evidenceRef:'fixture'}};
  const signature=sign(null,canonicalDecision({sourceSHA256,outputSHA256,reviewerId,decision:'ACCEPT'}),privateKey).toString('base64');
  const trustAnchors=new Map([[reviewerId,publicKey.export({type:'spki',format:'pem'})]]);
  const args={dossier,sourcePath,outputPath,signature,trustAnchors};
  assert.equal((await verifyGISDecision(args)).status,'CRYPTOGRAPHICALLY_VERIFIED');
  assert.equal((await verifyGISDecision({...args,trustAnchors:new Map()})).status,'HOLD');
  assert.equal((await verifyGISDecision({...args,signature:'A'.repeat(86)+'=='})).status,'HOLD');
  await writeFile(outputPath,'tampered');assert.deepEqual((await verifyGISDecision(args)).reasons,['ARTIFACT_DIGEST_MISMATCH']);
 }finally{await rm(dir,{recursive:true,force:true})}
});
