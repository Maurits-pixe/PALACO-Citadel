import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLabCandidate, validateLabCandidate, buildLabCandidatePackage, verifyLabCandidatePackage } from '../src/lab-candidate.mjs';
import { validateManifest } from '../src/contracts.mjs';
import { canonicalJSON, packageDigest } from '../src/integrity.mjs';
import { createLab } from '../src/fixtures.mjs';

const copy = value => JSON.parse(canonicalJSON(value));
const candidate = () => copy(loadLabCandidate());
const binding = bundle => ({ candidateId: bundle.manifest.candidateId, version: bundle.manifest.version, packageDigest: bundle.packageDigest });

test('provisional identity preserves explicit unknowns and does not become a runtime identity', () => {
  const value = loadLabCandidate();
  assert.deepEqual(validateLabCandidate(value), { valid: true, errors: [] });
  assert.equal(value.canonicalName, 'H∆R∆M');
  assert.equal(value.existingRuntime.canonicalName, 'H∆R∆');
  assert.equal(value.existingRuntime.binding, 'UNCONFIRMED');
  assert.equal(validateManifest(value).valid, false);
  const existing = createLab();
  assert.equal(existing.manifest.canonicalName, 'H∆R∆');
  assert.equal(validateManifest(existing.manifest).valid, true);
  assert.throws(() => { value.scope.worldRef = 'guessed'; }, TypeError);
  for (const field of ['elixerId', 'namespace', 'issuerRef', 'signerRef', 'packageDigest']) {
    assert.equal(value[field], null);
    const missing = candidate(); delete missing[field];
    assert.equal(validateLabCandidate(missing).valid, false, 'missing ' + field);
    const guessed = candidate(); guessed[field] = 'invented';
    assert.equal(validateLabCandidate(guessed).valid, false, 'guessed ' + field);
  }
});

test('name similarity and another context cannot bind the candidate automatically', () => {
  for (const name of ['H∆R∆', 'HARA', 'HARAM', 'HΔRΔM']) {
    assert.equal(validateLabCandidate({ ...candidate(), canonicalName: name }).valid, false, name);
  }
  for (const mutate of [
    value => { value.candidateId = 'HARA-LAB-001'; },
    value => { value.scope.tenantId = 'other-tenant'; },
    value => { value.scope.worldRef = 'guessed-world'; },
    value => { value.scope.citadelRef = 'guessed-citadel'; },
    value => { value.existingRuntime.binding = 'CONFIRMED'; },
    value => { value.laBinding.status = 'CONFIRMED'; },
  ]) { const value = candidate(); mutate(value); assert.equal(validateLabCandidate(value).valid, false); }
});

test('privilege fields, live providers and execution capabilities are refused at every level', () => {
  for (const action of candidate().forbiddenActions) {
    const value = candidate(); value.capabilities.push(action);
    assert.equal(validateLabCandidate(value).valid, false, action);
    assert.throws(() => buildLabCandidatePackage(value), /INVALID_LAB_CANDIDATE/);
  }
  for (const mutate of [
    value => { value.authorized = true; },
    value => { value.permissions.push('calendar.write'); },
    value => { value.personas[0].permissions = ['EXECUTE']; },
    value => { value.personas[1].mode = 'LIVE_PROVIDER'; },
    value => { value.personas.push(copy(value.personas[0])); },
    value => { value.forbiddenActions.pop(); },
    value => { value.scope.dataClassification = 'PRODUCTION'; },
    value => { value.memoryPolicy.productionData = true; },
  ]) { const value = candidate(); mutate(value); assert.equal(validateLabCandidate(value).valid, false); }
});

test('conformance, review, issuance and activation cannot be promoted by editing the descriptor', () => {
  for (const [axis, forged] of Object.entries({ integrity: 'INTEGRITY_VERIFIED', conformance: 'PASS', review: 'ACCEPTED', authority: 'ISSUED_REFERENCE', issuance: 'ISSUED', distribution: 'ALLOWED', activation: 'ACTIVE', freshness: 'CURRENT' })) {
    const value = candidate(); value.statusAxes[axis] = forged;
    assert.equal(validateLabCandidate(value).valid, false, axis);
  }
});

test('canonical package hashing is repeatable, detached and sensitive to actual manifest changes', () => {
  const value = candidate(), before = canonicalJSON(value);
  const bundle = buildLabCandidatePackage(value);
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(buildLabCandidatePackage(reordered).packageDigest, bundle.packageDigest);
  assert.equal(canonicalJSON(value), before);
  assert.equal(bundle.manifest.packageDigest, null);
  assert.equal(bundle.packageDigest, packageDigest({ format: bundle.format, manifest: bundle.manifest }));
  for (const edited of [{ ...value, purpose: value.purpose + ' Synthetische variant.' }, { ...value, version: '0.1.1' }]) {
    assert.equal(validateLabCandidate(edited).valid, true);
    assert.notEqual(buildLabCandidatePackage(edited).packageDigest, bundle.packageDigest);
  }
  assert.throws(() => { bundle.manifest.statusAxes.activation = 'ACTIVE'; }, TypeError);
});

test('verification requires an expected binding and refuses tampering, rebinding and extra bundle fields', () => {
  const original = buildLabCandidatePackage(candidate()), expected = binding(original);
  assert.equal(verifyLabCandidatePackage(original).valid, false);
  assert.equal(verifyLabCandidatePackage(original, { ...expected, packageDigest: undefined }).valid, false);
  assert.equal(verifyLabCandidatePackage(original, { ...expected, candidateId: 'another' }).valid, false);
  assert.equal(verifyLabCandidatePackage(original, { ...expected, version: '0.1.1' }).valid, false);
  const tampered = copy(original); tampered.manifest.purpose += ' Gewijzigd.';
  assert.equal(verifyLabCandidatePackage(tampered, expected).valid, false);
  const rebound = buildLabCandidatePackage(tampered.manifest);
  assert.equal(verifyLabCandidatePackage(rebound, expected).valid, false);
  assert.equal(verifyLabCandidatePackage({ ...original, authorize: true }, expected).valid, false);
  assert.equal(verifyLabCandidatePackage(null, expected).valid, false);
});

test('a matching hash leaves the canonical candidate and all authority gates closed', () => {
  const bundle = buildLabCandidatePackage(candidate());
  const verified = verifyLabCandidatePackage(bundle, binding(bundle));
  assert.deepEqual(verified, { valid: true, errors: [], integrity: 'HASH_MATCH', authority: 'NONE', issuance: 'NOT_REQUESTED', distribution: 'NOT_ALLOWED', activation: 'INACTIVE', runtimeBinding: 'UNCONFIRMED' });
  assert.equal(bundle.manifest.statusAxes.integrity, 'UNKNOWN');
  assert.equal(bundle.manifest.statusAxes.conformance, 'NOT_RUN');
  assert.equal(bundle.manifest.statusAxes.review, 'REVIEW_REQUIRED');
  assert.equal(bundle.manifest.statusAxes.activation, 'INACTIVE');
  assert.equal(bundle.manifest.issuerRef, null);
});
