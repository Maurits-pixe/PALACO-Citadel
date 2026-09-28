import { draftExport, template } from '../atelier/builder.mjs';
import { digest, digestBytes, verifyExport } from '../citadel-proof/proof.mjs';
import { authorizeRecords, verifySignature } from './registry.mjs';

const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x);
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const pin = Object.freeze({ id: template.template_id, version: template.template_version, sha256: digest(template) });
const escape = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createDraftPackage(project, makerId, assets = {}, exportSequence = 1) {
  requireThat(!Object.hasOwn(assets, 'citadel.json'), 'reserved project file');
  const bytes = { ...assets, 'citadel.json': Buffer.from(JSON.stringify(project)) };
  const { manifest } = draftExport(project, makerId, bytes, exportSequence);
  return { manifest, files: Object.fromEntries(Object.entries(bytes).map(([name, value]) => [name, Buffer.from(value).toString('base64')])) };
}
export function eraPayload(attestation) {
  const { citadelId, makerId, manifestSha256, exportSequence, observedAt, validUntil, keyId } = attestation;
  return Buffer.from(JSON.stringify({ domain:'PALACO-ERA-PREVIEW-v1', citadelId, makerId, manifestSha256, exportSequence, observedAt, validUntil, keyId }));
}
export class PreviewAdapter {
  constructor(registry, { makerId, eraKeys, clock = registry.clock, fault = async () => {} }) {
    requireThat(id(makerId), 'configured local maker required');
    this.registry = registry;
    // Operator trusted configuration; never sourced from an HTTP request.
    this.makerId = makerId;
    this.eraKeys = { ...eraKeys };
    this.clock = clock;
    this.fault = fault;
  }
  validate(pkg, era, latestSequence = 0) {
    requireThat(pkg && Buffer.byteLength(JSON.stringify(pkg)) <= 4 * 1024 * 1024, 'package missing or oversized');
    const bytes = {};
    requireThat(pkg.files && Object.keys(pkg.files).length <= 256, 'invalid file count');
    for (const [name, encoded] of Object.entries(pkg.files)) {
      requireThat(name.split('/').every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,100}$/.test(part) && part !== '.' && part !== '..'), 'unsafe package path');
      requireThat(typeof encoded === 'string' && Buffer.from(encoded, 'base64').toString('base64') === encoded, 'noncanonical asset bytes');
      bytes[name] = Buffer.from(encoded, 'base64');
    }
    const manifestSha256 = verifyExport(pkg.manifest, bytes, pin, latestSequence);
    const project = JSON.parse(bytes['citadel.json']?.toString('utf8') || 'null');
    requireThat(project && project.state === 'DRAFT' && project.maker_id === this.makerId && id(project.project_id) && id(project.citadel_id), 'maker/project binding mismatch');
    requireThat(project.citadel_id === pkg.manifest.citadelId && project.citadel_id !== template.source_citadel && project.project_id !== project.citadel_id, 'Citadel binding mismatch');
    requireThat(project.created_from === `${template.template_id}-v${template.template_version}` && project.source_citadel === template.source_citadel, 'project template mismatch');
    requireThat(typeof project.name === 'string' && project.name.trim() && typeof project.intention === 'string', 'project presentation missing');
    requireThat(Array.isArray(project.trajectory) && project.trajectory.length === template.required_steps.length && project.trajectory.every((item, i) => item.step === template.required_steps[i] && typeof item.value === 'string' && item.value.trim()), 'incomplete L.A. trajectory');
    requireThat(Array.isArray(project.assets) && project.assets.every(asset => asset.project_id === project.project_id && asset.creator_id === this.makerId && asset.classification === 'CREATIVE_ASSET' && Object.values(bytes).some(value => digestBytes(value) === asset.content_hash)), 'asset binding missing');
    requireThat(era && era.citadelId === project.citadel_id && era.makerId === this.makerId && era.manifestSha256 === manifestSha256 && era.exportSequence === pkg.manifest.exportSequence, 'ERA attestation missing or mismatch');
    const now = Date.parse(this.clock()), observed = Date.parse(era.observedAt), expiry = Date.parse(era.validUntil);
    requireThat(Number.isFinite(now) && Number.isFinite(observed) && Number.isFinite(expiry) && observed <= now && now < expiry && observed < expiry, 'ERA time window invalid');
    requireThat(verifySignature(eraPayload(era), era.signature, this.eraKeys[era.keyId]), 'ERA signature untrusted');
    return { project, manifestSha256 };
  }
  request(project, manifestSha256) {
    return { citadelId:project.citadel_id, subjectId:this.makerId, action:'PREVIEW', scope:project.project_id, at:this.clock(), manifestSha256 };
  }
  async register(pkg, era) {
    // Snapshot inputs before the first asynchronous boundary.
    pkg = structuredClone(pkg); era = structuredClone(era);
    const { project, manifestSha256 } = this.validate(pkg, era);
    return this.registry.transaction(project.citadel_id, async tx => {
      const registrations = tx.records.filter(r => r.event.type === 'DRAFT_REGISTERED');
      requireThat(registrations.every(r => r.event.subjectId === this.makerId && r.event.projectId === project.project_id), 'object already bound to another maker/project');
      const lastSequence = Math.max(0, ...registrations.map(r => r.event.exportSequence));
      this.validate(pkg, era, lastSequence);
      const decision = authorizeRecords(tx.records, this.request(project, manifestSha256));
      requireThat(decision.decision === 'ALLOW_FOR_PREVIEW_ONLY', `preview grant denied: ${decision.reason}`);
      const verification = { profile:'LOCAL_PREVIEW_V1', outcome:'ALLOW_FOR_PREVIEW_ONLY', template:pin, manifestSha256, grantId:decision.grantId, eraDigest:digest(era), eraStatus:'SIGNED_APPLICATION_ATTESTATION', activation:'NOT_AUTHORIZED' };
      const record = await tx.append({ type:'DRAFT_REGISTERED', subjectId:this.makerId, actorId:this.makerId, citadelId:project.citadel_id, projectId:project.project_id, evidenceSha256:digest(verification), manifestSha256, exportSequence:pkg.manifest.exportSequence, package:pkg, era, verification });
      await this.fault('after-registration');
      return { registrationHash:record.recordHash, manifestSha256, sequence:record.sequence, decision:'ALLOW_FOR_PREVIEW_ONLY' };
    });
  }
  async preview(citadelId, manifestSha256) {
    return this.registry.transaction(citadelId, async tx => {
      const registrations = tx.records.filter(r => r.event.type === 'DRAFT_REGISTERED');
      const record = registrations.at(-1);
      requireThat(record && record.event.manifestSha256 === manifestSha256 && record.event.subjectId === this.makerId, 'current registration missing');
      const { project } = this.validate(record.event.package, record.event.era);
      requireThat(digest(record.event.verification) === record.event.evidenceSha256 && record.event.verification.manifestSha256 === manifestSha256, 'verification record mismatch');
      const decision = authorizeRecords(tx.records, this.request(project, manifestSha256));
      requireThat(decision.decision === 'ALLOW_FOR_PREVIEW_ONLY', `preview grant denied: ${decision.reason}`);
      let receipt = tx.records.find(r => r.event.type === 'PREVIEW_READY' && r.event.registrationHash === record.recordHash);
      if (!receipt) receipt = await tx.append({ type:'PREVIEW_READY', subjectId:this.makerId, actorId:this.makerId, citadelId, evidenceSha256:record.event.evidenceSha256, registrationHash:record.recordHash, manifestSha256, grantId:decision.grantId });
      const inner = `<!doctype html><html lang="nl"><meta charset="utf-8"><title>DRAFT Citadel</title><body><h1>${escape(project.name)}</h1><p>DRAFT · ALLOW_FOR_PREVIEW_ONLY</p><p>${escape(project.intention)}</p>${project.trajectory.map(x=>`<section><h2>${escape(x.step)}</h2><p>${escape(x.value)}</p></section>`).join('')}</body></html>`;
      const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><title>PALACO lokale preview</title><body><h1>Geïsoleerde DRAFT-preview</h1><p>Single-user local preview · niet geactiveerd</p><iframe title="Citadel-concept" sandbox="" width="100%" height="700" srcdoc="${escape(inner)}"></iframe></body></html>`;
      return { html, receiptHash:receipt.recordHash, headers:{ 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'none'; sandbox", 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer' } };
    });
  }
}
