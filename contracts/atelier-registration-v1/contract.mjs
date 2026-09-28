import { digest, digestBytes } from '../../citadel-proof/proof.mjs';
export const VERSION='palaco.atelier-registration/1.0.0';
export const OPEN_GATES=Object.freeze(['INDEPENDENT_REVIEW','IDENTITY_AUTHORITY','PRODUCTION_TENANCY','EXECUTION_COMMIT','ACTIVATION']);
export const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
export function requireContract(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
export function packageEnvelope(pkg,{tenant_id,user_id,maker_id,project_id}){
  const project=JSON.parse(Buffer.from(pkg.files['citadel.json'],'base64').toString('utf8'));
  return {schema_version:VERSION,tenant_id,user_id,maker_id,project_id,citadel_id:pkg.manifest.citadelId,
    template_id:pkg.manifest.template.id,template_version:pkg.manifest.template.version,
    payload_digest:digestBytes(Buffer.from(pkg.files['citadel.json'],'base64')),
    asset_digests:Object.fromEntries(Object.entries(pkg.manifest.files).filter(([path])=>path!=='citadel.json')),
    audit_head:digest(project.audit),package:structuredClone(pkg)};
}
function validateEnvelopeFields(value,principal){
  requireContract(value?.schema_version===VERSION,'CONTRACT_VERSION');
  const allowed=['schema_version','tenant_id','user_id','maker_id','project_id','citadel_id','template_id','template_version','payload_digest','asset_digests','audit_head','package'];
  requireContract(Object.keys(value).length===allowed.length&&Object.keys(value).every(k=>allowed.includes(k)),'CONTRACT_FIELDS');
  for(const key of ['tenant_id','user_id','maker_id','project_id','citadel_id']) requireContract(id(value[key]),'INVALID_ID');
  for(const key of ['tenant_id','user_id','maker_id','project_id']) requireContract(value[key]===principal[key],'TENANT_PROJECT_MISMATCH');
  requireContract(value.package&&Object.keys(value.package).length===2&&Object.keys(value.package).every(k=>['manifest','files'].includes(k)),'CONTRACT_FIELDS');
  requireContract(Buffer.byteLength(JSON.stringify(value))<=4*1024*1024,'PACKAGE_SIZE');
  const expected=packageEnvelope(value.package,principal);
  requireContract(digest(value)===digest(expected),'CONTRACT_DIGEST_MISMATCH');
  const project=JSON.parse(Buffer.from(value.package.files['citadel.json'],'base64').toString('utf8'));
  requireContract(project.project_id===value.project_id&&project.maker_id===value.maker_id&&project.citadel_id===value.citadel_id,'OBJECT_BINDING');
  requireContract(Array.isArray(project.audit)&&project.audit.length>0&&project.audit.every((entry,i)=>entry.sequence===i+1),'AUDIT_SEQUENCE');
  return project;
}
export function signedPayload(kind,value){const {signature,...body}=value;return Buffer.from(JSON.stringify({domain:`PALACO-CONTRACT-V1-${kind}`,digest:digest(body)}));}
export function denied(code){return {schema_version:VERSION,outcome:'DENY',code,activation_gates:[...OPEN_GATES]};}

export function validateEnvelope(value,principal){
  try{return validateEnvelopeFields(value,principal);}
  catch(error){if(error.code)throw error;throw Object.assign(new Error('CONTRACT_MALFORMED'),{code:'CONTRACT_MALFORMED'});}
}
