import { ConfinedStore } from './storage.mjs';
import { createHash, createVerify } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const fail = message => { throw new Error(message); };
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const names = ['IDENTITY_REGISTERED','KEY_BOUND','AUTHORITY_GRANTED','AUTHORITY_REVOKED','WATERMERK_REGISTERED','HOLOGRAM_REGISTERED','ERA_ATTESTED','PROOF_RECORDED','EXECUTION_COMMITTED','DRAFT_REGISTERED','PREVIEW_READY'];
function checkEvent(event) {
  if (!event || !names.includes(event.type) || !validId(event.subjectId) || !validId(event.actorId) || !validId(event.citadelId) || !hex(event.evidenceSha256)) fail('invalid event envelope');
  if (event.type === 'AUTHORITY_GRANTED' && (!validId(event.grantId) || !validId(event.action) || !validId(event.scope) || !event.validUntil || !hex(event.manifestSha256) || !event.issuerKeyId || !event.signature)) fail('incomplete grant');
  if (event.type === 'AUTHORITY_REVOKED' && (!validId(event.grantId) || !event.issuerKeyId || !event.signature)) fail('incomplete revocation');
  if (['WATERMERK_REGISTERED','HOLOGRAM_REGISTERED'].includes(event.type) && (!validId(event.markerId) || !hex(event.assetSha256))) fail('invalid marker');
  if (event.type === 'ERA_ATTESTED' && (!hex(event.targetHash) || !event.attestationRef || !event.attestorKeyId)) fail('invalid ERA attestation');
  if (event.type === 'DRAFT_REGISTERED' && (!validId(event.projectId) || !hex(event.manifestSha256) || !Number.isSafeInteger(event.exportSequence) || event.exportSequence < 1 || !event.package || !event.verification)) fail('invalid draft registration');
  if (event.type === 'PREVIEW_READY' && (!hex(event.registrationHash) || !hex(event.manifestSha256) || !validId(event.grantId))) fail('invalid preview receipt');
  if (event.type === 'EXECUTION_COMMITTED' && (!validId(event.ticketId) || !validId(event.grantId) || !hex(event.manifestSha256))) fail('invalid commit');
}
export function grantPayload(grant) { const { grantId, subjectId, citadelId, action, scope, validUntil, evidenceSha256, manifestSha256 } = grant; return Buffer.from(canonical({ grantId, subjectId, citadelId, action, scope, validUntil, evidenceSha256, manifestSha256 })); }
export function revokePayload(revoke) { return Buffer.from(canonical({ grantId: revoke.grantId, subjectId: revoke.subjectId, citadelId: revoke.citadelId, evidenceSha256: revoke.evidenceSha256 })); }
export function verifySignature(payload, signature, trustedPublicKey) {
  if (!trustedPublicKey || typeof signature !== 'string') return false;
  try { const v=createVerify('SHA256'); v.update(payload); v.end(); return v.verify(trustedPublicKey,Buffer.from(signature,'base64')); } catch { return false; }
}
export class LocalRegistry {
  constructor(root, { allowedRoot, clock = () => new Date().toISOString(), trustedKeys = {}, fault } = {}) {
    this.store = new ConfinedStore(root, allowedRoot, { fault });
    this.clock = clock;
    this.trustedKeys = { ...trustedKeys };
  }
  parts(citadelId) { if (!validId(citadelId)) fail('invalid citadel ID'); return ['citadels',citadelId,'events']; }
  async events(citadelId) {
    const parts = this.parts(citadelId);
    const all = await this.store.list(parts);
    // Pending files after abrupt process termination need operator recovery.
    if (all.some(x => x.startsWith('.pending-'))) fail('pending event requires recovery');
    const files = all.filter(x => x !== '.writer.lock').sort();
    const out=[]; let previous='0'.repeat(64);
    for(const file of files) {
      const seq=out.length+1;
      if(file!==`${String(seq).padStart(12,'0')}.json`) fail('sequence gap or unexpected file');
      const record=JSON.parse(await this.store.read(parts,file));
      const { recordHash, ...body }=record;
      if(record.sequence!==seq || record.previousHash!==previous || sha(canonical(body))!==recordHash) fail('ledger integrity failure');
      checkEvent(record.event);
      if(record.event.citadelId !== citadelId) fail('ledger Citadel mismatch');
      if (record.event.type==='AUTHORITY_GRANTED' || record.event.type==='AUTHORITY_REVOKED') {
        const payload=record.event.type==='AUTHORITY_GRANTED'?grantPayload(record.event):revokePayload(record.event);
        if(!verifySignature(payload,record.event.signature,this.trustedKeys[record.event.issuerKeyId])) fail('historical issuer signature failure');
      }
      previous=recordHash;out.push(record);
    }
    return out;
  }
  async transaction(citadelId, fn) {
    return this.store.locked(this.parts(citadelId), async () => {
      const records = await this.events(citadelId);
      return fn({ records, append: async event => {
        if(event.citadelId !== citadelId) fail('transaction Citadel mismatch');
        const record = await this.appendLocked(event, records.length, records);
        records.push(record);
        return record;
      } });
    });
  }
  async append(event, expectedSequence) {
    checkEvent(event);
    event = structuredClone(event);
    return this.transaction(event.citadelId, async tx => {
      if(tx.records.length !== expectedSequence) fail('stale expected sequence');
      return tx.append(event);
    });
  }
  async appendLocked(event, expectedSequence, prior) {
      checkEvent(event);
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
      await this.store.atomicCreate(this.parts(event.citadelId), `${String(sequence).padStart(12,'0')}.json`, canonical(record)+'\n');
      return record;
  }
  async authorize({citadelId,subjectId,action,scope,at=this.clock(),manifestSha256}) {
    if(!validId(subjectId)||!validId(action)||!validId(scope)||!hex(manifestSha256)) return {decision:'DENY',reason:'INVALID_REQUEST'};
    let records; try { records=await this.events(citadelId); } catch { return {decision:'DENY',reason:'LEDGER_UNVERIFIED'}; }
    return authorizeRecords(records, {citadelId,subjectId,action,scope,at,manifestSha256});
  }
}
export function authorizeRecords(records, {citadelId,subjectId,action,scope,at,manifestSha256}) {
    const revoked=new Set(records.filter(r=>r.event.type==='AUTHORITY_REVOKED').map(r=>r.event.grantId));
    const grants=records.filter(r=>r.event.type==='AUTHORITY_GRANTED').map(r=>r.event).filter(e=>e.subjectId===subjectId&&e.action===action&&e.scope===scope&&!revoked.has(e.grantId));
    const grant=grants.at(-1);
    if(!grant) return {decision:'DENY',reason:'NO_VALID_GRANT'};
    if(!Number.isFinite(Date.parse(at))||!Number.isFinite(Date.parse(grant.validUntil))||Date.parse(at)>=Date.parse(grant.validUntil)) return {decision:'DENY',reason:'GRANT_EXPIRED'};
    if(grant.manifestSha256!==manifestSha256) return {decision:'DENY',reason:'MANIFEST_MISMATCH'};
    return {decision:'ALLOW_FOR_PREVIEW_ONLY',grantId:grant.grantId,ledgerHead:records.at(-1).recordHash,reason:'COMMIT_GATE_REQUIRED'};
}
