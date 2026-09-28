import { digest } from '../citadel-proof/proof.mjs';
import { LocalRegistry, verifySignature } from './registry.mjs';
import { ConfinedStore } from './storage.mjs';
import { PreviewAdapter, renderIsolatedPreview } from './preview.mjs';
import { VERSION, OPEN_GATES, id, requireContract as check, validateEnvelope, signedPayload, denied } from '../contracts/atelier-registration-v1/contract.mjs';

// Feature-gated local operator adapter. authenticate/readTrust are trusted configuration,
// not caller-controlled claims. Production identity and tenant admission remain disabled.
export class ContractGateway {
  constructor({root,allowedRoot,enabled=false,authenticate,readTrust,trustRootKey,clock=()=>new Date().toISOString(),fault=async()=>{}}){
    this.store=new ConfinedStore(root,allowedRoot);this.enabled=enabled;
    this.authenticate=authenticate;this.readTrust=readTrust;this.trustRootKey=trustRootKey;this.clock=clock;this.fault=fault;
  }
  async context(session){
    check(this.enabled===true,'FEATURE_DISABLED');
    const principal=await this.authenticate(session);
    check(principal?.assurance==='LOCAL_OPERATOR','IDENTITY_UNRESOLVED');
    for(const key of ['tenant_id','project_id','maker_id','user_id'])check(id(principal[key]),'IDENTITY_UNRESOLVED');
    return Object.freeze({...principal});
  }
  async registry(principal){
    const root=await this.store.directory(['tenants',principal.tenant_id,'projects',principal.project_id],true);
    return new LocalRegistry(root,{allowedRoot:this.store.root,clock:this.clock,fault:this.fault});
  }
  binding(snapshot,keyId,purpose,principal,now){
    check(snapshot&&Number.isSafeInteger(snapshot.generation)&&Array.isArray(snapshot.bindings)&&Array.isArray(snapshot.revoked_keys)&&Array.isArray(snapshot.revoked_grants),'KEY_BINDING_UNKNOWN');
    const records=snapshot.bindings.filter(b=>b.key_id===keyId);
    check(records.length===1,'KEY_BINDING_UNKNOWN');
    const b=records[0];
    check(verifySignature(signedPayload('KEY_BINDING',b),b.signature,this.trustRootKey),'KEY_BINDING_UNTRUSTED');
    check(b.status==='ACTIVE'&&!snapshot.revoked_keys.includes(keyId),'KEY_REVOKED');
    check(b.tenant_id===principal.tenant_id&&b.project_id===principal.project_id&&b.purpose===purpose&&b.allowed_makers?.includes(principal.maker_id)&&id(b.identity_id)&&/^[a-f0-9]{64}$/.test(b.authority_evidence),'KEY_SCOPE');
    check(Date.parse(b.not_before)<=now&&now<Date.parse(b.expires_at),'KEY_EXPIRED');
    return b;
  }
  validate(envelope,grant,era,principal,snapshot,now,latestExport=0){
    const project=validateEnvelope(envelope,principal),contractDigest=digest(envelope);
    check(Number.isFinite(now),'CLOCK_UNKNOWN');
    check(grant,'GRANT_MISSING');
    const issuer=this.binding(snapshot,grant.key_id,'PREVIEW_ISSUER',principal,now);
    check(verifySignature(signedPayload('GRANT',grant),grant.signature,issuer.public_key),'GRANT_SIGNATURE');
    check(grant.tenant_id===principal.tenant_id&&grant.project_id===principal.project_id&&grant.maker_id===principal.maker_id&&grant.user_id===principal.user_id&&grant.citadel_id===envelope.citadel_id&&grant.action==='PREVIEW'&&grant.contract_digest===contractDigest&&id(grant.grant_id),'GRANT_SCOPE');
    check(!snapshot.revoked_grants.includes(grant.grant_id),'GRANT_REVOKED');
    check(Date.parse(grant.not_before)<=now&&now<Date.parse(grant.expires_at),'GRANT_EXPIRED');
    check(era,'ERA_MISSING');
    const witness=this.binding(snapshot,era.key_id,'ERA_WITNESS',principal,now);
    check(verifySignature(signedPayload('ERA',era),era.signature,witness.public_key),'ERA_SIGNATURE');
    check(era.tenant_id===principal.tenant_id&&era.project_id===principal.project_id&&era.contract_digest===contractDigest&&era.evidence?.keyId===era.key_id,'ERA_SCOPE');
    const verifier=new PreviewAdapter({clock:()=>new Date(now).toISOString()},{makerId:principal.maker_id,eraKeys:{[era.key_id]:witness.public_key}});
    try{verifier.validate(envelope.package,era.evidence,latestExport);}catch(error){
      const text=error.message;
      const code=text.includes('replay')?'REPLAY':text.includes('template')?'TEMPLATE_MISMATCH':text.includes('ERA')?'ERA_INVALID':'EXPORT_INVALID';
      throw Object.assign(error,{code});
    }
    return {project,contractDigest};
  }
  async commit(session,request){
    let committed=false;
    try{
      const principal=await this.context(session);
      const {envelope,grant,era,expected_sequence}=structuredClone(request);
      // Validate before creating any tenant/project directory.
      validateEnvelope(envelope,principal);
      check(Number.isSafeInteger(expected_sequence)&&expected_sequence>=0,'SEQUENCE_CONFLICT');
      const snapshot=structuredClone(await this.readTrust());
      this.validate(envelope,grant,era,principal,snapshot,Date.parse(this.clock()));
      const registry=await this.registry(principal);
      return await registry.transaction(envelope.citadel_id,async tx=>{
        check(tx.records.length===expected_sequence,'SEQUENCE_CONFLICT');
        const previous=tx.records.filter(r=>r.event.type==='CONTRACT_PREVIEW_COMMITTED');
        check(previous.every(r=>r.event.subjectId===principal.maker_id&&r.event.envelope.tenant_id===principal.tenant_id&&r.event.envelope.project_id===principal.project_id),'OBJECT_OWNER_CONFLICT');
        const now=Date.parse(this.clock());
        check(previous.every(r=>Date.parse(r.event.evaluatedAt)<=now),'CLOCK_ROLLBACK');
        const {contractDigest}=this.validate(envelope,grant,era,principal,snapshot,now,Math.max(0,...previous.map(r=>r.event.envelope.package.manifest.exportSequence)));
        check((await this.readTrust()).generation===snapshot.generation,'TRUST_CHANGED');
        const receipt={schema_version:VERSION,outcome:'ALLOW_FOR_PREVIEW_ONLY',code:'OK',tenant_id:principal.tenant_id,project_id:principal.project_id,citadel_id:envelope.citadel_id,contract_digest:contractDigest,trust_generation:snapshot.generation,activation_gates:[...OPEN_GATES]};
        const event={type:'CONTRACT_PREVIEW_COMMITTED',subjectId:principal.maker_id,actorId:principal.user_id,citadelId:envelope.citadel_id,evidenceSha256:digest(receipt),contractDigest,evaluatedAt:new Date(now).toISOString(),envelope,grant,era,receipt};
        const record=await tx.append(event);
        committed=true;
        await this.fault('after-contract-commit');
        check((await this.readTrust()).generation===snapshot.generation,'TRUST_CHANGED');
        return {...receipt,record_hash:record.recordHash,sequence:record.sequence};
      });
    }catch(error){return denied(error.code||(committed?'COMMIT_OUTCOME_UNKNOWN':'STORAGE_INCONSISTENT'));}
  }
  async preview(session,{tenant_id,project_id,citadel_id,contract_digest}){
    try{
      const principal=await this.context(session);
      check(tenant_id===principal.tenant_id&&project_id===principal.project_id&&id(citadel_id),'TENANT_PROJECT_MISMATCH');
      const registry=await this.registry(principal);
      return await registry.transaction(citadel_id,async tx=>{
        const eventRecord=tx.records.filter(r=>r.event.type==='CONTRACT_PREVIEW_COMMITTED').at(-1);
        check(eventRecord&&eventRecord.event.contractDigest===contract_digest,'UNKNOWN_REGISTRATION');
        const e=eventRecord.event,now=Date.parse(this.clock());
        check(now>=Date.parse(e.evaluatedAt),'CLOCK_ROLLBACK');
        const trust=structuredClone(await this.readTrust());
        const {project,contractDigest}=this.validate(e.envelope,e.grant,e.era,principal,trust,now);
        check(contractDigest===e.contractDigest&&digest(e.receipt)===e.evidenceSha256,'STORAGE_INCONSISTENT');
        check((await this.readTrust()).generation===trust.generation,'TRUST_CHANGED');
        return {...e.receipt,evaluated_trust_generation:trust.generation,record_hash:eventRecord.recordHash,sequence:eventRecord.sequence,...renderIsolatedPreview(project,eventRecord.recordHash)};
      });
    }catch(error){return denied(error.code||'STORAGE_INCONSISTENT');}
  }
}
