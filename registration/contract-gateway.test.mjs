import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtemp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {newCitadel,recordStep,template} from '../atelier/builder.mjs';
import {digest} from '../citadel-proof/proof.mjs';
import {createDraftPackage,eraPayload} from './preview.mjs';
import {packageEnvelope,signedPayload} from '../contracts/atelier-registration-v1/contract.mjs';
import {ContractGateway} from './contract-gateway.mjs';
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

test('feature is disabled by default; identity UNKNOWN denies before storage',async t=>{
  const f=await fixture(t);const g=new ContractGateway({...f.config,enabled:undefined});
  assert.equal((await g.commit('valid',f.request())).code,'FEATURE_DISABLED');
  assert.equal((await f.gateway.commit('invalid',f.request())).code,'IDENTITY_UNRESOLVED');
  assert.deepEqual(await readdir(f.root),[]);
});
test('one atomic event binds contract, verification and receipt; preview emits no extra event',async t=>{
  const f=await fixture(t),req=f.request();const result=await f.gateway.commit('valid',req);
  assert.equal(result.outcome,'ALLOW_FOR_PREVIEW_ONLY');assert.equal(result.sequence,1);
  const preview=await f.gateway.preview('valid',f.query(req));assert.match(preview.html,/sandbox=""/);
  const files=await readdir(join(f.root,'tenants','T1','projects','P1','citadels','C1','events'));
  assert.deepEqual(files,['000000000001.json']);assert.ok(result.activation_gates.includes('ACTIVATION'));
});
test('contract version, payload modification and audit-head mismatch deny',async t=>{
  const f=await fixture(t);
  for(const mutate of [r=>r.envelope.schema_version='v999',r=>r.envelope.package.files['citadel.json']=Buffer.from('{}').toString('base64'),r=>r.envelope.audit_head='0'.repeat(64)]){
    const r=f.request();mutate(r);assert.equal((await f.gateway.commit('valid',r)).outcome,'DENY');
  }
  assert.deepEqual(await readdir(f.root),[]);
});
test('wrong template is denied even when scoped signatures are valid',async t=>{
  const f=await fixture(t),r=f.request();r.envelope.package.manifest.template.version='invalid';r.envelope.template_version='invalid';
  r.grant=signed('GRANT',{...r.grant,contract_digest:digest(r.envelope)});
  r.era=signed('ERA',{...r.era,contract_digest:digest(r.envelope)});
  assert.equal((await f.gateway.commit('valid',r)).code,'TEMPLATE_MISMATCH');
});
test('missing, revoked and expired grant deny',async t=>{
  const f=await fixture(t),r=f.request();assert.equal((await f.gateway.commit('valid',{...r,grant:null})).code,'GRANT_MISSING');
  f.state.revoked_grants.push('G1');assert.equal((await f.gateway.commit('valid',r)).code,'GRANT_REVOKED');
  f.state.revoked_grants=[];r.grant=signed('GRANT',{...r.grant,expires_at:start});assert.equal((await f.gateway.commit('valid',r)).code,'GRANT_EXPIRED');
});
test('wrong Citadel, action, tenant or project scope denies signed grants',async t=>{
  const f=await fixture(t);
  for(const [field,value]of [['citadel_id','C2'],['action','ACTIVATE'],['tenant_id','T2'],['project_id','P2']]){
    const r=f.request();r.grant=signed('GRANT',{...r.grant,[field]:value});assert.equal((await f.gateway.commit('valid',r)).code,'GRANT_SCOPE');
  }
});
test('unknown, untrusted, expired, revoked and rotated keybindings deny',async t=>{
  const f=await fixture(t),r=f.request(),saved=structuredClone(f.state.bindings);
  f.state.bindings=[];assert.equal((await f.gateway.commit('valid',r)).code,'KEY_BINDING_UNKNOWN');
  f.state.bindings=structuredClone(saved);f.state.bindings[0].signature='bad';assert.equal((await f.gateway.commit('valid',r)).code,'KEY_BINDING_UNTRUSTED');
  f.state.bindings=structuredClone(saved);f.state.bindings[0]=signed('KEY_BINDING',{...saved[0],expires_at:start});assert.equal((await f.gateway.commit('valid',r)).code,'KEY_EXPIRED');
  f.state.bindings=structuredClone(saved);f.state.revoked_keys=['issuer'];assert.equal((await f.gateway.commit('valid',r)).code,'KEY_REVOKED');
  f.state.revoked_keys=[];f.state.bindings[0]=signed('KEY_BINDING',{...saved[0],key_id:'issuer_rotated'});assert.equal((await f.gateway.commit('valid',r)).code,'KEY_BINDING_UNKNOWN');
});
test('missing ERA and local clock rollback deny; clock high-water survives new gateway',async t=>{
  const f=await fixture(t),r=f.request();assert.equal((await f.gateway.commit('valid',{...r,era:null})).code,'ERA_MISSING');
  await f.gateway.commit('valid',r);f.setClock('2026-09-28T06:30:00Z');
  assert.equal((await new ContractGateway(f.config).preview('valid',f.query(r))).code,'CLOCK_ROLLBACK');
});
test('tenant/project overreach denied before storage; query cannot choose another scope',async t=>{
  const f=await fixture(t),r=f.request();r.envelope.tenant_id='T2';
  assert.equal((await f.gateway.commit('valid',r)).code,'TENANT_PROJECT_MISMATCH');
  assert.equal((await f.gateway.preview('valid',{...f.query(r),project_id:'P2'})).code,'TENANT_PROJECT_MISMATCH');
  assert.deepEqual(await readdir(f.root),[]);
});
test('replay, stale sequence and concurrent registration are refused',async t=>{
  const f=await fixture(t),r=f.request();const results=await Promise.all([f.gateway.commit('valid',r),f.gateway.commit('valid',r)]);
  assert.equal(results.filter(x=>x.outcome==='ALLOW_FOR_PREVIEW_ONLY').length,1);
  assert.equal((await f.gateway.commit('valid',r)).code,'OK');
  const replay=structuredClone(r);replay.idempotency_key='different-replay-key';
  assert.equal((await f.gateway.commit('valid',{...replay,expected_sequence:1})).code,'REPLAY');
});
test('damaged hash chain and mismatched receipt deny preview',async t=>{
  const f=await fixture(t),r=f.request();await f.gateway.commit('valid',r);
  const path=join(f.root,'tenants','T1','projects','P1','citadels','C1','events','000000000001.json');
  const text=await readFile(path,'utf8');await writeFile(path,text.replace('LOCAL_OPERATOR','BROKEN').replace('ALLOW_FOR_PREVIEW_ONLY','ACTIVE'));
  assert.equal((await f.gateway.preview('valid',f.query(r))).code,'STORAGE_INCONSISTENT');
});
test('failure before commit leaves no final event; after-commit interruption recovers same receipt',async t=>{
  const f=await fixture(t),r=f.request();
  const bad=new ContractGateway({...f.config,fault:async point=>{if(point==='before-event-commit')throw Error('IO');}});
  assert.equal((await bad.commit('valid',r)).outcome,'DENY');
  const files=await readdir(join(f.root,'tenants','T1','projects','P1','citadels','C1','events'));assert.deepEqual(files,[]);
  const interrupted=new ContractGateway({...f.config,fault:async point=>{if(point==='after-contract-commit')throw Error('response lost');}});
  assert.equal((await interrupted.commit('valid',r)).outcome,'DENY');
  const recovered=await new ContractGateway(f.config).preview('valid',f.query(r));assert.equal(recovered.outcome,'ALLOW_FOR_PREVIEW_ONLY');assert.equal(recovered.sequence,1);
});
test('revocation after receipt and trust generation changes deny renewed access',async t=>{
  const f=await fixture(t),r=f.request();await f.gateway.commit('valid',r);f.state.revoked_keys=['era'];f.state.generation++;
  assert.equal((await f.gateway.preview('valid',f.query(r))).code,'TRUST_CHANGED');
});
test('same project and Citadel IDs in two tenants occupy distinct scoped stores',async t=>{
  const f=await fixture(t),a=f.request();await f.gateway.commit('valid',a);
  const b=structuredClone(a);b.envelope.tenant_id='T2';
  for(const old of [...f.state.bindings]) f.state.bindings.push(signed('KEY_BINDING',{...old,key_id:old.key_id+'2',tenant_id:'T2'}));
  b.grant=signed('GRANT',{...b.grant,key_id:'issuer2',tenant_id:'T2',contract_digest:digest(b.envelope)});
  b.era.evidence.keyId='era2';b.era.evidence.signature=sign(eraPayload(b.era.evidence));
  b.era=signed('ERA',{...b.era,key_id:'era2',tenant_id:'T2',contract_digest:digest(b.envelope)});
  const gatewayB=new ContractGateway({...f.config,authenticate:async()=>({...f.principal,tenant_id:'T2'})});
  assert.equal((await gatewayB.commit('valid',b)).outcome,'ALLOW_FOR_PREVIEW_ONLY');
  assert.equal((await gatewayB.preview('valid',f.query(a))).code,'TENANT_PROJECT_MISMATCH');
  assert.equal((await gatewayB.preview('valid',{...f.query(b),tenant_id:'T2'})).outcome,'ALLOW_FOR_PREVIEW_ONLY');
  for(const tenant of ['T1','T2'])assert.deepEqual(await readdir(join(f.root,'tenants',tenant,'projects','P1','citadels','C1','events')),['000000000001.json']);
});
