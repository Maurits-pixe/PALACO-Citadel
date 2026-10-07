import { createHash, createPublicKey, createSign, createVerify } from 'node:crypto';

const hex = /^[a-f0-9]{64}$/;
const states = ['DRAFT', 'REVIEWED', 'VERIFIED', 'ACTIVATABLE', 'ACTIVE'];
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
function pathOK(path) { return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.split('/').some(x => x === '' || x === '.' || x === '..' || x === 'citadel.manifest.json') && !path.includes('\\'); }
export function makeManifest({ citadelId, template, builderVersion, exportSequence, files, renderer }) {
  assert(typeof citadelId === 'string' && citadelId.length > 0, 'citadel ID required');
  assert(template?.id && template?.version && hex.test(template.sha256), 'pinned template digest required');
  assert(typeof builderVersion === 'string' && builderVersion.length > 0, 'builder version required');
  assert(Number.isSafeInteger(exportSequence) && exportSequence > 0, 'positive export sequence required');
  assert(renderer?.id && renderer?.version && renderer?.provenance, 'renderer provenance required');
  assert(files && Object.keys(files).length > 0, 'files required');
  for (const [path, hash] of Object.entries(files)) assert(pathOK(path) && hex.test(hash), 'invalid file entry');
  return { schema: 'palaco.citadel.manifest/0.1', state: 'DRAFT', citadelId, template, builderVersion, exportSequence, files: sort(files), renderer };
}
export function verifyExport(manifest, bytes, pinnedTemplate, latestSequence = 0) {
  assert(manifest?.schema === 'palaco.citadel.manifest/0.1' && manifest.state === 'DRAFT', 'invalid manifest or state');
  assert(Number.isSafeInteger(manifest.exportSequence) && manifest.exportSequence > latestSequence, 'replay or invalid sequence');
  assert(manifest.template?.id === pinnedTemplate?.id && manifest.template?.version === pinnedTemplate?.version && manifest.template?.sha256 === pinnedTemplate?.sha256, 'template substitution');
  const names = Object.keys(manifest.files || {}).sort();
  assert(names.length > 0 && names.every(pathOK) && names.join('\0') === Object.keys(bytes).sort().join('\0'), 'file set mismatch');
  for (const name of names) assert(hex.test(manifest.files[name]) && digestBytes(bytes[name]) === manifest.files[name], `file hash mismatch: ${name}`);
  assert(manifest.citadelId && manifest.builderVersion && manifest.renderer?.provenance, 'missing provenance');
  return digest(manifest);
}
export function digestBytes(bytes) { assert(bytes instanceof Uint8Array, 'file bytes required'); return createHash('sha256').update(bytes).digest('hex'); }
export function signManifest(manifest, privateKey) {
  assert(manifest.state === 'DRAFT', 'only draft manifests can be bound');
  const payload = Buffer.from(digest(manifest), 'hex');
  const signer = createSign('SHA256'); signer.update(payload); signer.end();
  return { algorithm: 'RSA-PSS-SHA256', manifestSha256: digest(manifest), publicKey: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }), signature: signer.sign({ key: privateKey, padding: 6, saltLength: 32 }).toString('base64') };
}
export function verifyBinding(manifest, binding, trustedPublicKey) {
  assert(binding?.algorithm === 'RSA-PSS-SHA256' && binding.manifestSha256 === digest(manifest), 'binding digest mismatch');
  assert(binding.publicKey === trustedPublicKey, 'untrusted identity key');
  const verifier = createVerify('SHA256'); verifier.update(Buffer.from(binding.manifestSha256, 'hex')); verifier.end();
  assert(verifier.verify({ key: trustedPublicKey, padding: 6, saltLength: 32 }, Buffer.from(binding.signature, 'base64')), 'invalid signature');
  return true;
}
export function transition(record, next, evidence, context) {
  assert(record && states.includes(record.state), 'invalid current state');
  assert(states.indexOf(next) === states.indexOf(record.state) + 1, 'nonsequential transition');
  assert(evidence?.id && evidence?.sha256 && hex.test(evidence.sha256), 'evidence required');
  assert(context?.manifestSha256 && hex.test(context.manifestSha256), 'exact manifest digest required');
  assert(record.manifestSha256 === context.manifestSha256, 'manifest changed');
  if (next === 'REVIEWED') assert(evidence.reviewerId && evidence.reviewerId !== record.builderId, 'independent reviewer required');
  if (next === 'VERIFIED') assert(context.bindingVerified === true && context.exportVerified === true, 'verification required');
  if (next === 'ACTIVATABLE') assert(context.authority?.id && context.authority?.scope === record.citadelId && context.authority?.manifestSha256 === record.manifestSha256, 'activation authority required');
  if (next === 'ACTIVE') assert(context.commit?.ticketId && context.commit?.manifestSha256 === record.manifestSha256 && context.commit?.outcome === 'COMMITTED' && context.authority?.id, 'execution commit required');
  return { ...record, state: next, history: [...record.history, { sequence: record.history.length + 1, state: next, evidence }] };
}
export function revoke(record, evidence, authority) {
  assert(record.state !== 'REVOKED' && evidence?.id && hex.test(evidence.sha256) && authority?.id && authority.scope === record.citadelId, 'revocation authority and evidence required');
  return { ...record, state: 'REVOKED', history: [...record.history, { sequence: record.history.length + 1, state: 'REVOKED', evidence, authorityId: authority.id }] };
}
export function draftRecord(manifest, builderId) {
  assert(manifest.state === 'DRAFT' && builderId, 'draft and builder required');
  return { citadelId: manifest.citadelId, builderId, manifestSha256: digest(manifest), state: 'DRAFT', history: [] };
}
