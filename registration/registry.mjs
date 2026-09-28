import { mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { createHash, createVerify } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const fail = message => { throw new Error(message); };
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const names = ['IDENTITY_REGISTERED','KEY_BOUND','AUTHORITY_GRANTED','AUTHORITY_REVOKED','WATERMERK_REGISTERED','HOLOGRAM_REGISTERED','ERA_ATTESTED','PROOF_RECORDED','EXECUTION_COMMITTED'];
function checkEvent(event) {
  if (!event || !names.includes(event.type) || !validId(event.subjectId) || !validId(event.actorId) || !validId(event.citadelId) || !hex(event.evidenceSha256)) fail('invalid event envelope');
  if (event.type === 'AUTHORITY_GRANTED' && (!validId(event.grantId) || !validId(event.action) || !validId(event.scope) || !event.validUntil || !hex(event.manifestSha256) || !event.issuerKeyId || !event.signature)) fail('incomplete grant');
  if (event.type === 'AUTHORITY_REVOKED' && (!validId(event.grantId) || !event.issuerKeyId || !event.signature)) fail('incomplete revocation');
  if (['WATERMERK_REGISTERED','HOLOGRAM_REGISTERED'].includes(event.type) && (!validId(event.markerId) || !hex(event.assetSha256))) fail('invalid marker');
  if (event.type === 'ERA_ATTESTED' && (!hex(event.targetHash) || !event.attestationRef || !event.attestorKeyId)) fail('invalid ERA attestation');
  if (event.type === 'EXECUTION_COMMITTED' && (!validId(event.ticketId) || !validId(event.grantId) || !hex(event.manifestSha256))) fail('invalid commit');
}
export function grantPayload(grant) { const { grantId, subjectId, citadelId, action, scope, validUntil, evidenceSha256, manifestSha256 } = grant; return Buffer.from(canonical({ grantId, subjectId, citadelId, action, scope, validUntil, evidenceSha256, manifestSha256 })); }
export function revokePayload(revoke) { return Buffer.from(canonical({ grantId: revoke.grantId, subjectId: revoke.subjectId, citadelId: revoke.citadelId, evidenceSha256: revoke.evidenceSha256 })); }
export function verifySignature(payload, signature, trustedPublicKey) {
  if (!trustedPublicKey || typeof signature !== 'string') return false;
  try { const v=createVerify('SHA256'); v.update(payload); v.end(); return v.verify(trustedPublicKey,Buffer.from(signature,'base64')); } catch { return false; }
}
export class LocalRegistry {
  constructor(root, { clock = () => new Date().toISOString(), trustedKeys = {} } = {}) {
    if (!root || !isAbsolute(root)) fail('absolute data root required');
    this.root=resolve(root); this.clock=clock; this.trustedKeys=trustedKeys;
  }
  dir(citadelId) { if (!validId(citadelId)) fail('invalid citadel ID'); return join(this.root,'citadels',citadelId,'events'); }
  async events(citadelId) {
    const dir=this.dir(citadelId); let files;
    try { files=(await readdir(dir)).filter(x=>x.endsWith('.json')).sort(); } catch(e) { if(e.code==='ENOENT') return []; throw e; }
    const out=[]; let previous='0'.repeat(64);
    for(const file of files) {
      const seq=out.length+1;
      if(file!==`${String(seq).padStart(12,'0')}.json`) fail('sequence gap or unexpected file');
      const record=JSON.parse(await readFile(join(dir,file),'utf8'));
      const { recordHash, ...body }=record;
      if(record.sequence!==seq || record.previousHash!==previous || sha(canonical(body))!==recordHash) fail('ledger integrity failure');
      checkEvent(record.event);
      if (record.event.type==='AUTHORITY_GRANTED' || record.event.type==='AUTHORITY_REVOKED') {
        const payload=record.event.type==='AUTHORITY_GRANTED'?grantPayload(record.event):revokePayload(record.event);
        if(!verifySignature(payload,record.event.signature,this.trustedKeys[record.event.issuerKeyId])) fail('historical issuer signature failure');
      }
      previous=recordHash;out.push(record);
    }
    return out;
  }
  async append(event, expectedSequence) {
    checkEvent(event);
    const dir=this.dir(event.citadelId);await mkdir(dir,{recursive:true,mode:0o700});
    const lock=join(dir,'.writer.lock');let handle;
    try { handle=await open(lock,'wx',0o600); } catch { fail('writer lock unavailable; fail closed'); }
    try {
      const prior=await this.events(event.citadelId);
      if(prior.length!==expectedSequence) fail('stale expected sequence');
      if(event.type==='AUTHORITY_GRANTED' && prior.some(r=>r.event.grantId===event.grantId)) fail('grant ID already used');
      if(event.type==='AUTHORITY_REVOKED' && (!prior.some(r=>r.event.type==='AUTHORITY_GRANTED'&&r.event.grantId===event.grantId) || prior.some(r=>r.event.type==='AUTHORITY_REVOKED'&&r.event.grantId===event.grantId))) fail('grant missing or already revoked');
      if(event.type==='AUTHORITY_GRANTED' || event.type==='AUTHORITY_REVOKED') {
        const key=this.trustedKeys[event.issuerKeyId];
        const payload=event.type==='AUTHORITY_GRANTED'?grantPayload(event):revokePayload(event);
        if(!verifySignature(payload,event.signature,key)) fail('untrusted issuer signature');
      }
      const sequence=prior.length+1;
      const body={schema:'palaco.registration.event/0.1',sequence,previousHash:prior.at(-1)?.recordHash || '0'.repeat(64),time:{observedAt:this.clock(),source:'LOCAL_SYSTEM_CLOCK',assurance:'UNATTESTED'},event};
      const record={...body,recordHash:sha(canonical(body))};
      const file=join(dir,`${String(sequence).padStart(12,'0')}.json`);
      const fd=await open(file,'wx',0o600);
      try { await fd.writeFile(canonical(record)+'\n'); await fd.sync(); } finally { await fd.close(); }
      return record;
    } finally { await handle.close(); await unlink(lock); }
  }
  async authorize({citadelId,subjectId,action,scope,at=this.clock(),manifestSha256}) {
    if(!validId(subjectId)||!validId(action)||!validId(scope)||!hex(manifestSha256)) return {decision:'DENY',reason:'INVALID_REQUEST'};
    let records; try { records=await this.events(citadelId); } catch { return {decision:'DENY',reason:'LEDGER_UNVERIFIED'}; }
    const revoked=new Set(records.filter(r=>r.event.type==='AUTHORITY_REVOKED').map(r=>r.event.grantId));
    const grants=records.filter(r=>r.event.type==='AUTHORITY_GRANTED').map(r=>r.event).filter(e=>e.subjectId===subjectId&&e.action===action&&e.scope===scope&&!revoked.has(e.grantId));
    const grant=grants.at(-1);
    if(!grant) return {decision:'DENY',reason:'NO_VALID_GRANT'};
    if(!Number.isFinite(Date.parse(at))||!Number.isFinite(Date.parse(grant.validUntil))||Date.parse(at)>=Date.parse(grant.validUntil)) return {decision:'DENY',reason:'GRANT_EXPIRED'};
    if(grant.manifestSha256!==manifestSha256) return {decision:'DENY',reason:'MANIFEST_MISMATCH'};
    return {decision:'ALLOW_FOR_PREVIEW_ONLY',grantId:grant.grantId,ledgerHead:records.at(-1).recordHash,reason:'COMMIT_GATE_REQUIRED'};
  }
}
