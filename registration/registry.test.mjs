import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { LocalRegistry, grantPayload, revokePayload } from './registry.mjs';
const hash='a'.repeat(64);
const sign=(payload,key)=>{const s=createSign('SHA256');s.update(payload);s.end();return s.sign(key).toString('base64');};
test('local hash chain, signed grant, revocation, ERA quality and tamper denial',async()=>{
  const root=await mkdtemp(join(tmpdir(),'palaco-reg-'));
  try {
    const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const registry=new LocalRegistry(root,{clock:()=> '2026-09-28T05:00:00.000Z',trustedKeys:{issuer:publicKey}});
    const base={citadelId:'C1',subjectId:'maker',actorId:'issuer',evidenceSha256:hash};
    const identity=await registry.append({...base,type:'IDENTITY_REGISTERED'},0);
    assert.equal(identity.time.assurance,'UNATTESTED');
    await assert.rejects(registry.append({...base,type:'WATERMERK_REGISTERED',markerId:'WM1',assetSha256:hash},0),/stale/);
    const marker=await registry.append({...base,type:'WATERMERK_REGISTERED',markerId:'WM1',assetSha256:hash},1);
    assert.equal(marker.previousHash,identity.recordHash);
    const grant={...base,type:'AUTHORITY_GRANTED',grantId:'G1',action:'ACTIVATE',scope:'C1',validUntil:'2026-10-01T00:00:00Z',manifestSha256:hash,issuerKeyId:'issuer'};
    await assert.rejects(registry.append({...grant,signature:'bad'},2),/untrusted/);
    grant.signature=sign(grantPayload(grant),privateKey);
    await registry.append(grant,2);
    assert.equal((await registry.authorize({citadelId:'C1',subjectId:'maker',action:'ACTIVATE',scope:'C1',manifestSha256:hash})).decision,'ALLOW_FOR_PREVIEW_ONLY');
    assert.equal((await registry.authorize({citadelId:'C1',subjectId:'maker',action:'ACTIVATE',scope:'C1',manifestSha256:'b'.repeat(64)})).decision,'DENY');
    const rev={...base,type:'AUTHORITY_REVOKED',grantId:'G1',issuerKeyId:'issuer'};rev.signature=sign(revokePayload(rev),privateKey);
    await registry.append(rev,3);
    assert.equal((await registry.authorize({citadelId:'C1',subjectId:'maker',action:'ACTIVATE',scope:'C1',manifestSha256:hash})).decision,'DENY');
    const path=join(root,'citadels','C1','events','000000000002.json');
    const bytes=await readFile(path,'utf8');await writeFile(path,bytes.replace('WM1','WM2'));
    assert.equal((await registry.authorize({citadelId:'C1',subjectId:'maker',action:'ACTIVATE',scope:'C1',manifestSha256:hash})).reason,'LEDGER_UNVERIFIED');
  } finally {await rm(root,{recursive:true,force:true});}
});
