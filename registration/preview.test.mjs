import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, mkdir, symlink, readFile, readdir, unlink, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { get } from 'node:http';
import { newCitadel, recordStep, template } from '../atelier/builder.mjs';
import { digest } from '../citadel-proof/proof.mjs';
import { LocalRegistry, grantPayload, revokePayload } from './registry.mjs';
import { createDraftPackage, PreviewAdapter, eraPayload } from './preview.mjs';
import { ConfinedStore } from './storage.mjs';
import { startLocalPreview } from './preview-server.mjs';

const now = '2026-09-28T06:00:00.000Z';
const expiry = '2026-09-29T06:00:00.000Z';
const keys = generateKeyPairSync('rsa', { modulusLength:2048 });
const publicKey = keys.publicKey.export({ type:'spki', format:'pem' });
const sign = data => { const s=createSign('SHA256'); s.update(data); s.end(); return s.sign(keys.privateKey).toString('base64'); };
async function fixture(t, { makerId='makerA', root, fault, adapterFault } = {}) {
  if (!root) { root=await mkdtemp(join(tmpdir(),'palaco-preview-')); t.after(()=>rm(root,{recursive:true,force:true})); }
  const registry = new LocalRegistry(root, { allowedRoot:root, clock:()=>now, trustedKeys:{issuer:publicKey}, fault });
  const adapter = new PreviewAdapter(registry, { makerId, eraKeys:{clock:publicKey}, fault:adapterFault });
  let project = newCitadel({ makerId, name:'<script>alert(1)</script>', intention:'Test', citadelId:'C1', projectId:'P1' });
  for (const step of template.required_steps) project=recordStep(project,makerId,step,'maker answer');
  const pkg=createDraftPackage(project,makerId);
  const manifestSha256=digest(pkg.manifest);
  const era={citadelId:'C1',makerId,manifestSha256,exportSequence:1,observedAt:now,validUntil:expiry,keyId:'clock'};
  era.signature=sign(eraPayload(era));
  const grant={type:'AUTHORITY_GRANTED',grantId:`grant_${makerId}`,subjectId:makerId,actorId:'issuer',citadelId:'C1',action:'PREVIEW',scope:'P1',manifestSha256,evidenceSha256:'a'.repeat(64),validUntil:expiry,issuerKeyId:'issuer'};
  grant.signature=sign(grantPayload(grant));
  const addGrant=async()=>registry.append(grant,(await registry.events('C1')).length);
  return {root,registry,adapter,project,pkg,era,grant,manifestSha256,addGrant};
}

test('valid Atelier export → atomic registration → isolated loopback preview; receipts are idempotent', async t=>{
  const f=await fixture(t); await f.addGrant();
  const receipt=await f.adapter.register(f.pkg,f.era);
  assert.equal(receipt.decision,'ALLOW_FOR_PREVIEW_ONLY');
  const hosted=await startLocalPreview(f.adapter);
  t.after(()=>new Promise(resolve=>{hosted.server.closeAllConnections();hosted.server.close(resolve);}));
  const url=hosted.urlFor('C1',f.manifestSha256);
  const response=await fetch(url); assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/sandbox=""/); assert.doesNotMatch(html,/<script>/);
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(url.replace(/\/[a-f0-9]{64}\//,'/'+'0'.repeat(64)+'/'))).status,403);
  assert.equal(await new Promise((resolve,reject)=>get(url,{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject)),403);
  assert.equal((await fetch(url,{method:'POST'})).status,403);
  assert.equal((await fetch(url)).status,200);
  const records=await f.registry.events('C1');
  assert.deepEqual(records.map(r=>r.event.type),['AUTHORITY_GRANTED','DRAFT_REGISTERED','PREVIEW_READY']);
  assert.equal(records[1].event.verification.eraStatus,'SIGNED_APPLICATION_ATTESTATION');
  assert.equal(records[1].time.assurance,'UNATTESTED');
  assert.equal((await stat(join(f.root,'citadels','C1','events','000000000002.json'))).mode & 0o777,0o600);
});

test('modified payload after export produces no registration', async t=>{
  const f=await fixture(t); await f.addGrant(); f.pkg.files['citadel.json']=Buffer.from('{}').toString('base64');
  await assert.rejects(f.adapter.register(f.pkg,f.era),/hash mismatch/);
  assert.equal((await f.registry.events('C1')).length,1);
});

test('wrong template version is denied before persistence', async t=>{
  const f=await fixture(t); await f.addGrant(); f.pkg.manifest.template.version='999';
  await assert.rejects(f.adapter.register(f.pkg,f.era),/template substitution/);
  assert.equal((await f.registry.events('C1')).length,1);
});

test('missing grant, wrong scope and expired grant deny registration', async t=>{
  const f=await fixture(t);
  await assert.rejects(f.adapter.register(f.pkg,f.era),/grant denied/);
  f.grant.scope='anotherProject';f.grant.signature=sign(grantPayload(f.grant));await f.addGrant();
  await assert.rejects(f.adapter.register(f.pkg,f.era),/grant denied/);
  f.grant.grantId='expired'; f.grant.scope='P1';f.grant.validUntil=now;f.grant.signature=sign(grantPayload(f.grant));await f.addGrant();
  await assert.rejects(f.adapter.register(f.pkg,f.era),/GRANT_EXPIRED/);
});

test('revoked grant blocks registration and re-opening an already prepared preview', async t=>{
  const f=await fixture(t); await f.addGrant(); await f.adapter.register(f.pkg,f.era); await f.adapter.preview('C1',f.manifestSha256);
  const rev={type:'AUTHORITY_REVOKED',grantId:f.grant.grantId,subjectId:'makerA',actorId:'issuer',citadelId:'C1',evidenceSha256:'a'.repeat(64),issuerKeyId:'issuer'};
  rev.signature=sign(revokePayload(rev));await f.registry.append(rev,3);
  await assert.rejects(f.adapter.preview('C1',f.manifestSha256),/grant denied/);
  const pkg=createDraftPackage(f.project,'makerA',{},2);
  const era={...f.era,manifestSha256:digest(pkg.manifest),exportSequence:2};era.signature=sign(eraPayload(era));
  await assert.rejects(f.adapter.register(pkg,era),/grant denied/);
});

test('missing, forged, future and expired ERA attestations deny preview admission', async t=>{
  const f=await fixture(t); await f.addGrant();
  await assert.rejects(f.adapter.register(f.pkg,null),/ERA attestation/);
  await assert.rejects(f.adapter.register(f.pkg,{...f.era,signature:'bad'}),/ERA signature/);
  for (const era of [{...f.era,observedAt:expiry},{...f.era,validUntil:now}]) {
    era.signature=sign(eraPayload(era));await assert.rejects(f.adapter.register(f.pkg,era),/ERA time/);
  }
  assert.equal((await f.registry.events('C1')).length,1);
});

test('duplicate export and replay fail; competing attempts produce one registration',async t=>{
  const f=await fixture(t);await f.addGrant();
  const results=await Promise.allSettled([f.adapter.register(f.pkg,f.era),f.adapter.register(f.pkg,f.era)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  await assert.rejects(f.adapter.register(f.pkg,f.era),/replay/);
  assert.equal((await f.registry.events('C1')).filter(x=>x.event.type==='DRAFT_REGISTERED').length,1);
});

test('two configured makers cannot bind the same Citadel object ID',async t=>{
  const a=await fixture(t);await a.addGrant();await a.adapter.register(a.pkg,a.era);
  const b=await fixture(t,{root:a.root,makerId:'makerB'});await b.addGrant();
  await assert.rejects(b.adapter.register(b.pkg,b.era),/another maker/);
  await assert.rejects(b.adapter.preview('C1',a.manifestSha256),/registration missing/);
});

test('traversal, root escape, symlink ancestors, ledger symlinks and permissive directory are refused',async t=>{
  const f=await fixture(t);await f.addGrant();
  assert.throws(()=>new ConfinedStore(f.root + '/../escape',f.root),/traversal/);
  assert.throws(()=>new ConfinedStore('/outside-root',f.root),/outside/);
  assert.throws(()=>new ConfinedStore(f.root,undefined),/absolute root/);
  await assert.rejects(f.registry.events('../outside'),/invalid citadel/);
  f.pkg.files['../outside']=Buffer.from('x').toString('base64');
  await assert.rejects(f.adapter.register(f.pkg,f.era),/unsafe package path/);
  const outside=await mkdtemp(join(tmpdir(),'palaco-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  await symlink(outside,join(f.root,'escape'));
  await assert.rejects(new ConfinedStore(join(f.root,'escape'),f.root).initialize(),/symlink/);
  const target=join(f.root,'citadels','C1','events','000000000001.json');
  await symlink(target,join(f.root,'citadels','C1','events','000000000002.json'));
  await assert.rejects(f.registry.events('C1'),/unsafe file/);
  await mkdir(join(f.root,'permissive'),{mode:0o755});
  await assert.rejects(new ConfinedStore(join(f.root,'permissive'),f.root).initialize(),/mode/);
  assert.deepEqual(await readdir(outside),[]);
});

test('abrupt process exit between registration and preview: durable record and automatic recovery',async t=>{
  const f=await fixture(t);await f.addGrant();
  const input=join(f.root,'input.json');await writeFile(input,JSON.stringify({pkg:f.pkg,era:f.era}),{mode:0o600});
  const child=`import { readFile } from 'node:fs/promises';
    import { LocalRegistry } from ${JSON.stringify(new URL('./registry.mjs',import.meta.url).href)};
    import { PreviewAdapter } from ${JSON.stringify(new URL('./preview.mjs',import.meta.url).href)};
    const data=JSON.parse(await readFile(${JSON.stringify(input)},'utf8'));
    const registry=new LocalRegistry(${JSON.stringify(f.root)}, {allowedRoot:${JSON.stringify(f.root)},clock:()=>${JSON.stringify(now)},trustedKeys:{issuer:${JSON.stringify(publicKey)}}});
    const adapter=new PreviewAdapter(registry,{makerId:'makerA',eraKeys:{clock:${JSON.stringify(publicKey)}},fault:async()=>process.exit(87)});
    await adapter.register(data.pkg,data.era);`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',child],{encoding:'utf8'});
  assert.equal(result.status,87,result.stderr);
  assert.equal((await f.registry.events('C1')).length,2);
  // A dead writer PID and staged bytes are recovered before the next transaction.
  assert.match((await f.adapter.preview('C1',f.manifestSha256)).html,/DRAFT/);
  assert.equal((await f.registry.events('C1')).length,3);
  await assert.rejects(f.adapter.register(f.pkg,f.era),/replay/);
});

test('write/sync failures leave no partial final registration event',async t=>{
  for (const point of ['before-file-sync','before-event-commit']) {
    const f=await fixture(t);await f.addGrant();
    f.registry.store.fault=async actual=>{if(actual===point)throw Error('injected storage failure');};
    await assert.rejects(f.adapter.register(f.pkg,f.era),/injected/);
    assert.equal((await f.registry.events('C1')).length,1);
    assert.deepEqual(await readdir(join(f.root,'citadels','C1','events')),['000000000001.json']);
  }
});
