import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { digest, digestBytes, makeManifest } from '../citadel-proof/proof.mjs';
const require = createRequire(import.meta.url);
function deepFreeze(value) { for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child); return Object.freeze(value); }
export const template = deepFreeze(require('./la-foundation.v0.1.json'));
const allowed = new Set(template.allowed_extensions);
const steps = template.required_steps;
function check(ok, message) { if (!ok) throw new Error(message); }
function ownership(project, makerId) { check(makerId && makerId === project.maker_id, 'maker mismatch'); }
const clone = value => structuredClone(value);
export function newCitadel({ makerId, name, intention, projectId = randomUUID(), citadelId = randomUUID() }) {
  check(makerId && name?.trim() && intention?.trim(), 'maker, name and intention required');
  check(projectId !== citadelId && citadelId !== template.source_citadel, 'distinct identities required');
  return { project_id: projectId, citadel_id: citadelId, maker_id: makerId, created_from: `${template.template_id}-v${template.template_version}`, source_citadel: template.source_citadel, state: 'DRAFT', name: name.trim(), intention: intention.trim(), layout: template.default_layout, theme: template.default_theme, trajectory: [], customization: {}, assets: [], audit: [{ sequence: 1, event: 'CITADEL_DRAFT_CREATED' }] };
}
export function recordStep(project, makerId, step, value) {
  ownership(project, makerId);
  check(step === steps[project.trajectory.length], 'step out of order');
  check(typeof value === 'string' && value.trim(), 'step response required');
  const next = clone(project);
  next.trajectory.push({ step, value: value.trim() });
  next.audit.push({ sequence: next.audit.length + 1, event: 'TRAJECTORY_STEP', step });
  return next;
}
export function customize(project, makerId, changes) {
  ownership(project, makerId);
  check(project.trajectory.length === steps.length, 'complete L.A. trajectory first');
  check(changes && Object.keys(changes).length > 0 && Object.keys(changes).every(k => allowed.has(k)), 'prohibited override');
  for (const value of Object.values(changes)) check(value !== null && typeof value !== 'object', 'customization must be scalar');
  const next = clone(project);
  next.customization = { ...next.customization, ...changes };
  next.audit.push({ sequence: next.audit.length + 1, event: 'CUSTOMIZATION_CHANGED', fields: Object.keys(changes).sort() });
  return next;
}
export function registerAsset(project, makerId, { bytes, prompt, renderer, rights, relation }) {
  ownership(project, makerId);
  check(bytes instanceof Uint8Array && bytes.length > 0, 'asset bytes required');
  check(renderer?.id && renderer?.version && renderer?.provenance && rights && relation, 'asset provenance required');
  const next = clone(project);
  const asset = { asset_id: randomUUID(), project_id: project.project_id, creator_id: makerId, prompt: prompt || '', renderer, rights, relation, content_hash: digestBytes(bytes), classification: 'CREATIVE_ASSET' };
  next.assets.push(asset);
  next.audit.push({ sequence: next.audit.length + 1, event: 'ASSET_REGISTERED', asset_id: asset.asset_id });
  return { project: next, asset };
}
export function draftExport(project, makerId, fileBytes, exportSequence) {
  ownership(project, makerId);
  check(project.trajectory.length === steps.length && project.state === 'DRAFT', 'incomplete or active project');
  const files = Object.fromEntries(Object.entries(fileBytes).map(([name, bytes]) => [name, digestBytes(bytes)]));
  const manifest = makeManifest({ citadelId: project.citadel_id, template: { id: template.template_id, version: template.template_version, sha256: digest(template) }, builderVersion: '0.1.0', exportSequence, files, renderer: { id: 'PALACO-IMAGE-STUDIO-PROCEDURAL', version: '0.1', provenance: 'local' } });
  return { manifest, manifestSha256: digest(manifest), state: 'DRAFT' };
}
export function or6itEntry(project, makerId, officialCitadel) {
  ownership(project, makerId);
  check(officialCitadel?.citadelId === project.citadel_id && officialCitadel?.status === 'ACTIVE' && officialCitadel?.authorityVerified === true, 'official active Citadel required');
  return { elixer: 'OR6IT', parent_citadel_id: project.citadel_id, maker_id: makerId, world_state: 'DRAFT', authority: 'NONE', note: 'WORLD creation requires a separate OR6IT governed workflow' };
}
