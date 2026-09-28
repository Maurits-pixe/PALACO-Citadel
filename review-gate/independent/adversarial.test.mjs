import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtemp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {newCitadel,recordStep,template} from '../../atelier/builder.mjs';
import {digest} from '../../citadel-proof/proof.mjs';
import {createDraftPackage,eraPayload} from '../../registration/preview.mjs';
import {packageEnvelope,signedPayload} from '../../contracts/atelier-registration-v1/contract.mjs';
import {ContractGateway} from '../../registration/contract-gateway.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const sign=data=>{const s=createSign('SHA256');s.update(data);s.end();return s.sign(keys.privateKey).toString('base64');};
const signed=(kind,obj)=>({...obj,signature:sign(signedPayload(kind,obj))});
const start='2026-09-28T06:00:00Z',expires='2026-09-29T06:00:00Z';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'palaco-contract-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const principal={user_id:'U1',tenant_id:'T1',project_id:'P1',maker_id:'M1',assurance:'LOCAL_OPERATOR'};
  let project=newCitadel({makerId:'M1',name:'L.A. draft',intention:'test',projectId:'P1',citadelId:'C1'});
  for(const step of template.required_steps)project=recordStep(project,'M1',step,'answer');
  const state={generation:1,revoked_keys:[],revoked_grants:[],bindings:[]};
  for(const [key_id,purpose]of [['issuer','PREVIEW_ISSUER'],['era','ERA_WITNESS']])state.bindings.push(signed('KEY_BINDING',{key_id,purpose,tenant_id:'T1',project_id:'P1',identity_id:'AUTHORITY1',allowed_makers:['M1'],public_key:publicKey,status:'ACTIVE',not_before:start,expires_at:expires,authority_evidence:'a'.repeat(64)}));
  let clock='2026-09-28T07:00:00Z';
  const config={root,allowedRoot:root,enabled:true,authenticate:async token=>token==='valid'?principal:null,readTrust:async()=>state,trustRootKey:publicKey,clock:()=>clock};
  const gateway=new ContractGateway(config);
  function request(seq=1){
    const pkg=createDraftPackage(project,'M1',{},seq),envelope=packageEnvelope(pkg,principal);
    const grant=signed('GRANT',{grant_id:'G'+seq,key_id:'issuer',tenant_id:'T1',project_id:'P1',user_id:'U1',maker_id:'M1',citadel_id:'C1',action:'PREVIEW',contract_digest:digest(envelope),not_before:start,expires_at:expires});
    const evidence={citadelId:'C1',makerId:'M1',manifestSha256:digest(pkg.manifest),exportSequence:seq,observedAt:start,validUntil:expires,keyId:'era'};evidence.signature=sign(eraPayload(evidence));
    const era=signed('ERA',{key_id:'era',tenant_id:'T1',project_id:'P1',contract_digest:digest(envelope),evidence});
    return {envelope,grant,era,expected_sequence:seq-1};
  }
  const query=r=>({tenant_id:'T1',project_id:'P1',citadel_id:'C1',contract_digest:digest(r.envelope)});
  return {root,principal,state,config,gateway,request,query,setClock:value=>{clock=value;}};
}


test('REVIEW R1: expired grant becomes usable after clock rollback above commit time',async t=>{
  const f=await fixture(t),r=f.request();
  r.grant=signed('GRANT',{...r.grant,expires_at:'2026-09-28T07:45:00Z'});
  assert.equal((await f.gateway.commit('valid',r)).outcome,'ALLOW_FOR_PREVIEW_ONLY');
  f.setClock('2026-09-28T08:00:00Z');
  assert.equal((await f.gateway.preview('valid',f.query(r))).code,'GRANT_EXPIRED');
  f.setClock('2026-09-28T07:30:00Z');
  const result=await new ContractGateway(f.config).preview('valid',f.query(r));
  assert.equal(result.outcome,'ALLOW_FOR_PREVIEW_ONLY');
  console.log('R1 observed: expired grant resurrected by rollback (08:00 -> 07:30; commit 07:00)');
});
test('REVIEW R2: modified receipt outcome accepted after recomputing local hashes',async t=>{
  const f=await fixture(t),r=f.request();await f.gateway.commit('valid',r);
  const path=join(f.root,'tenants','T1','projects','P1','citadels','C1','events','000000000001.json');
  const record=JSON.parse(await readFile(path,'utf8'));
  record.event.receipt.outcome='ACTIVE';record.event.receipt.activation_gates=[];
  record.event.receipt.tenant_id='OTHER_TENANT';record.event.receipt.contract_digest='f'.repeat(64);
  record.event.evidenceSha256=digest(record.event.receipt);
  const {recordHash,...body}=record;
  const {createHash}=await import('node:crypto');
  record.recordHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  await writeFile(path,JSON.stringify(record));
  const result=await f.gateway.preview('valid',f.query(r));
  assert.equal(result.outcome,'ACTIVE');assert.equal(result.tenant_id,'OTHER_TENANT');
  assert.deepEqual(result.activation_gates,[]);assert.ok(result.html);
  console.log('R2 observed: ACTIVE outcome, foreign tenant and empty gates returned with valid preview HTML');
});
test('REVIEW R3: same-generation trust revocation during commit still returns ALLOW',async t=>{
  const f=await fixture(t),r=f.request();
  const gateway=new ContractGateway({...f.config,fault:async point=>{
    if(point==='before-event-commit')f.state.revoked_grants.push('G1');
  }});
  const result=await gateway.commit('valid',r);
  assert.equal(result.outcome,'ALLOW_FOR_PREVIEW_ONLY');
  assert.equal((await gateway.preview('valid',f.query(r))).code,'GRANT_REVOKED');
  console.log('R3 observed: commit returns ALLOW for concurrently revoked grant without generation increment');
});
test('REVIEW R4: abrupt process death leaves lock and pending bytes; restart fails closed',async t=>{
  const root=await mkdtemp(join(tmpdir(),'palaco-crash-review-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const {spawnSync}=await import('node:child_process');
  const registryURL=new URL('../../registration/registry.mjs',import.meta.url).href;
  const source=`import {LocalRegistry} from ${JSON.stringify(registryURL)};
    const root=${JSON.stringify(root)};
    const registry=new LocalRegistry(root,{allowedRoot:root,fault:async point=>{if(point==='before-event-commit')process.exit(71);}});
    await registry.append({type:'IDENTITY_REGISTERED',subjectId:'M1',actorId:'U1',citadelId:'C1',evidenceSha256:'a'.repeat(64)},0);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8'});
  assert.equal(child.status,71);
  const names=await readdir(join(root,'citadels','C1','events'));
  assert.ok(names.includes('.writer.lock'));assert.ok(names.some(x=>x.startsWith('.pending-')));
  assert.ok(!names.some(x=>x.endsWith('.json')));
  const {LocalRegistry}=await import('../../registration/registry.mjs');
  const recovered=new LocalRegistry(root,{allowedRoot:root});
  await assert.rejects(()=>recovered.transaction('C1',async()=>{}),/writer lock unavailable/);
  console.log('R4 observed: true process exit before commit leaves lock/pending, no final event; restart requires operator recovery');
});
