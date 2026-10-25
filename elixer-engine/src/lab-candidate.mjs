import { readFileSync } from 'node:fs';
import { validateWithSchema } from './contracts.mjs';
import { canonicalJSON, packageDigest, deepFreeze } from './integrity.mjs';

export const labCandidateSchema = deepFreeze(JSON.parse(readFileSync(new URL('../schemas/elixer-lab-candidate-v0.1.json', import.meta.url), 'utf8')));
const FORMAT = 'ELIXER_LAB_CANDIDATE_PACKAGE_V0_1';
const record = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const bundleSchema = deepFreeze(record({ format: { type: 'string', const: FORMAT }, manifest: labCandidateSchema, packageDigest: { type: 'string', format: 'sha256' } }));
const bindingSchema = deepFreeze(record({ candidateId: labCandidateSchema.properties.candidateId, version: labCandidateSchema.properties.version, packageDigest: { type: 'string', format: 'sha256' } }));

/** A design descriptor is deliberately separate from the runtime manifest. */
export const validateLabCandidate = value => validateWithSchema(labCandidateSchema, value);

export function loadLabCandidate() {
  const value = JSON.parse(readFileSync(new URL('../lab/haram-candidate.json', import.meta.url), 'utf8'));
  if (!validateLabCandidate(value).valid) throw new TypeError('INVALID_LAB_CANDIDATE');
  return deepFreeze(value);
}

/** The detached digest hashes the exact canonical payload, without self-reference. */
export function buildLabCandidatePackage(manifest) {
  if (!validateLabCandidate(manifest).valid) throw new TypeError('INVALID_LAB_CANDIDATE');
  const payload = { format: FORMAT, manifest: JSON.parse(canonicalJSON(manifest)) };
  return deepFreeze({ ...payload, packageDigest: packageDigest(payload) });
}

/** Expected identity/version/digest must come from the caller, not the bundle. */
export function verifyLabCandidatePackage(bundle, expected) {
  const fail = code => ({ valid: false, errors: [{ code }] });
  if (!validateWithSchema(bindingSchema, expected).valid) return fail('BINDING_REQUIRED');
  if (!validateWithSchema(bundleSchema, bundle).valid) return fail('INVALID_LAB_PACKAGE');
  if (bundle.manifest.candidateId !== expected.candidateId) return fail('CANDIDATE_MISMATCH');
  if (bundle.manifest.version !== expected.version) return fail('VERSION_MISMATCH');
  const payload = { format: bundle.format, manifest: bundle.manifest };
  if (bundle.packageDigest !== expected.packageDigest || packageDigest(payload) !== expected.packageDigest) return fail('PACKAGE_DIGEST_MISMATCH');
  return { valid: true, errors: [], integrity: 'HASH_MATCH', authority: 'NONE', issuance: 'NOT_REQUESTED', distribution: 'NOT_ALLOWED', activation: 'INACTIVE', runtimeBinding: 'UNCONFIRMED' };
}
