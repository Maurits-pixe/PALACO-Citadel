import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,createSign,sign as cryptoSign,verify as cryptoVerify,randomBytes} from 'node:crypto';
import {newCitadel,recordStep,template} from '../atelier/builder.mjs';
import {digest} from '../citadel-proof/proof.mjs';
import {createDraftPackage,eraPayload} from '../registration/preview.mjs';
import {packageEnvelope,signedPayload} from '../contracts/atelier-registration-v1/contract.mjs';
import {ContractGateway} from '../registration/contract-gateway.mjs';

// Two independently generated possession keys and a challenge-response fixture.
// This validates the adapter boundary; it is not production identity enrollment.
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'palaco-two-identities-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const authority=generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=authority.publicKey.export({type:'spki',format:'pem'});
  const sign=bytes=>{const s=createSign('SHA256');s.update(bytes);s.end();return s.sign(authority.privateKey).toString('base64');};
  const signed=(kind,value)=>({...value,signature:sign(signedPayload(kind,value))});
  const clock=()=> '2026-09-28T07:00:00Z',until='2026-09-29T00:00:00Z',from='2026-09-28T00:00:00Z';
  const sessions=new Map(),state={generation:1,bindings:[],revoked_keys:[],revoked_grants:[]};
  const users={};
  for(const who of ['A','B']){
    const identity=generateKeyPairSync('ed25519');
    const p={user_id:'U'+who,tenant_id:'T'+who,project_id:'P1',maker_id:'M'+who,assurance:'LOCAL_OPERATOR'};
    const challenge=randomBytes(32);
    const proof=cryptoSign(null,challenge,identity.privateKey);
    assert.equal(cryptoVerify(null,challenge,identity.publicKey,proof),true);
    const token=randomBytes(32).toString('hex');sessions.set(token,Object.freeze(p));
    for(const [role,purpose]of [['issuer','PREVIEW_ISSUER'],['era','ERA_WITNESS']])state.bindings.push(signed('KEY_BINDING',{key_id:role+who,purpose,tenant_id:p.tenant_id,project_id:p.project_id,identity_id:'ISSUER',allowed_makers:[p.maker_id],public_key:pem,status:'ACTIVE',not_before:from,expires_at:until,authority_evidence:'a'.repeat(64)}));
    let project=newCitadel({makerId:p.maker_id,name:'PRIVATE-'+who,intention:'private content '+who,projectId:'P1',citadelId:'C1'});
    for(const step of template.required_steps)project=recordStep(project,p.maker_id,step,'private answer '+who);
    const pkg=createDraftPackage(project,p.maker_id),envelope=packageEnvelope(pkg,p);
    const grant=signed('GRANT',{grant_id:'G'+who,key_id:'issuer'+who,user_id:p.user_id,tenant_id:p.tenant_id,project_id:p.project_id,maker_id:p.maker_id,citadel_id:'C1',action:'PREVIEW',contract_digest:digest(envelope),not_before:from,expires_at:until});
    const evidence={citadelId:'C1',makerId:p.maker_id,manifestSha256:digest(pkg.manifest),exportSequence:1,observedAt:from,validUntil:until,keyId:'era'+who};evidence.signature=sign(eraPayload(evidence));
    const era=signed('ERA',{key_id:'era'+who,tenant_id:p.tenant_id,project_id:p.project_id,contract_digest:digest(envelope),evidence});
    users[who]={token,principal:p,identity,challenge,proof,request:{envelope,grant,era,expected_sequence:0},query:{tenant_id:p.tenant_id,project_id:p.project_id,citadel_id:'C1',contract_digest:digest(envelope)}};
  }
  const gateway=new ContractGateway({root,allowedRoot:root,enabled:true,authenticate:async session=>sessions.get(session?.token)||null,readTrust:async()=>state,trustRootKey:pem,clock});
  return {root,gateway,users};
}

test('two independent possession identities: mutual read denial and distinct same-ID stores',async t=>{
  const {root,gateway,users:{A,B}}=await fixture(t);
  assert.equal(cryptoVerify(null,A.challenge,B.identity.publicKey,A.proof),false);
  for(const u of [A,B])assert.equal((await gateway.commit({token:u.token},u.request)).outcome,'ALLOW_FOR_PREVIEW_ONLY');
  for(const [reader,owner]of [[A,B],[B,A]]){
    const denied=await gateway.preview({token:reader.token},owner.query);
    assert.equal(denied.outcome,'DENY');assert.equal(denied.code,'TENANT_PROJECT_MISMATCH');
    assert.equal(JSON.stringify(denied).includes('PRIVATE-'),false);
    const own=await gateway.preview({token:reader.token},reader.query);assert.match(own.html,new RegExp('PRIVATE-'+reader.principal.user_id.slice(1)));
  }
  for(const tenant of ['TA','TB'])assert.deepEqual(await readdir(join(root,'tenants',tenant,'projects','P1','citadels','C1','events')),['000000000001.json']);
});
test('guessed project/Citadel/receipt IDs and swapped receipts never expose foreign content',async t=>{
  const {gateway,users:{A,B}}=await fixture(t);
  await gateway.commit({token:A.token},A.request);await gateway.commit({token:B.token},B.request);
  for(const q of [B.query,{...A.query,project_id:'P99'},{...A.query,citadel_id:'C99'},{...A.query,contract_digest:B.query.contract_digest}]){
    const result=await gateway.preview({token:A.token},q);assert.equal(result.outcome,'DENY');assert.equal(JSON.stringify(result).includes('private content B'),false);assert.equal(Object.hasOwn(result,'html'),false);
  }
});
test('session and payload tenant override denied; missing session yields no identity information',async t=>{
  const {gateway,users:{A,B}}=await fixture(t);await gateway.commit({token:B.token},B.request);
  const forged={token:A.token,tenant_id:'TB',project_id:'P1',headers:{'x-tenant-id':'TB'},url:'/tenants/TB'};
  assert.equal((await gateway.preview(forged,B.query)).code,'TENANT_PROJECT_MISMATCH');
  assert.equal((await gateway.commit(forged,B.request)).code,'TENANT_PROJECT_MISMATCH');
  assert.equal((await gateway.preview({token:'guessed'},B.query)).code,'IDENTITY_UNRESOLVED');
});
