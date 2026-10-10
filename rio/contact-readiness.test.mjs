import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyContactReference, inspectSpecialtyDesign, loadContactReadiness } from './contact-readiness.mjs';

const binding = JSON.parse(await readFile(new URL('./contact-source-binding.json', import.meta.url), 'utf8'));
const design = JSON.parse(await readFile(new URL('./brigade-specialties.json', import.meta.url), 'utf8'));
const files = {};
for (const source of binding.sources) {
  files[source.id] = await readFile(new URL('../' + source.path.split('/').map(encodeURIComponent).join('/'), import.meta.url));
}
const clone = value => JSON.parse(JSON.stringify(value));
function held(result) {
  assert.equal(result.contactStatus, 'HOLD');
  assert.equal(result.canOpenContact, false);
  assert.equal(result.operativeAuthority, 'NONE');
  assert.equal(result.runtimeConnected, false);
}
function unresolved(candidate, bytes = files) {
  const result = verifyContactReference(candidate, bytes);
  assert.equal(result.referenceStatus, 'SOURCE_BINDING_UNRESOLVED');
  assert.ok(result.errors.length);
  held(result);
  return result;
}
function invalidDesign(candidate) {
  const result = inspectSpecialtyDesign(candidate);
  assert.equal(result.designStatus, 'INVALID');
  assert.equal(result.canOpenContact, false);
  assert.equal(result.runtimeConnected, false);
  assert.equal(result.operativeAuthority, 'NONE');
  assert.equal(result.absoluteSafetyGuaranteed, false);
  assert.deepEqual(result.assignedSpecialties, []);
  return result;
}

test('actual repository bytes bind the two references and keep contact HOLD', async () => {
  const result = await loadContactReadiness();
  assert.equal(result.referenceStatus, 'BRIGADE_REFERENCE_BOUND');
  assert.equal(result.errors.length, 0);
  assert.equal(result.sources.length, 2);
  for (const source of result.sources) {
    assert.equal(source.byteIntegrity, 'MATCHED_PIN');
    assert.match(source.contentSha256, /^[0-9a-f]{64}$/);
  }
  held(result);
  assert.equal(result.specialtyDesign.designStatus, 'DESIGN_DRAFT');
  assert.equal(result.specialtyDesign.assignedSpecialties.length, 9);
  assert.equal(result.specialtyDesign.runtimeIdentitiesVerified, false);
  assert.match(result.specialtyDesign.contentSha256, /^[0-9a-f]{64}$/);
});
for (const [field, value] of [
  ['repository','Maurits-pixe/PALACO'],
  ['commitSha','0000000000000000000000000000000000000000'],
  ['path','../../untrusted.txt'],
  ['gitBlobSha','0000000000000000000000000000000000000000'],
  ['supportedClaims',['NINE_VERIFIED_SAFETY_AGENTS']]
]) {
  test('reject substituted source pin: ' + field, () => {
    const candidate = clone(binding);
    candidate.sources[0][field] = value;
    unresolved(candidate);
  });
}
test('changed source bytes cannot retain the pinned reference status', () => {
  const changed = { ...files, 'big-bang': Buffer.concat([files['big-bang'], Buffer.from('\ntampered')]) };
  assert.ok(unresolved(binding, changed).errors.includes('SOURCE_BYTES_CHANGED:big-bang'));
});
test('missing source bytes remain visible and cannot be replaced by text PASS', () => {
  unresolved(binding, { 'big-bang': files['big-bang'] });
  unresolved(binding, { 'big-bang': files['big-bang'], 'guardian-profile': 'PASS' });
});
test('duplicate source record cannot replace the missing second reference', () => {
  const candidate = clone(binding);
  candidate.sources[1] = clone(candidate.sources[0]);
  unresolved(candidate);
});
test('BRIGADE mention cannot verify the 6RI9ADE alias', () => {
  const candidate = clone(binding);
  candidate.aliases['6RI9ADE'] = 'VERIFIED';
  unresolved(candidate);
});
test('profile fields cannot assert nine enrolled identities or a safety PASS', () => {
  for (const [key,value] of [['agentIdentities','NINE_ENROLLED'],['bilateralSafetyEvidence','PASS'],['agentCapabilities','AUTHORIZE']]) {
    const candidate = clone(binding);
    candidate.operationalBindings[key] = value;
    unresolved(candidate);
  }
});
test('a synthetic humanConfirmed field cannot create permission', () => {
  const candidate = clone(binding);
  candidate.humanConfirmed = true;
  unresolved(candidate);
});
test('test and ZIP reports cannot claim independent verification', () => {
  for (const key of ['testVerification','zipVerification']) {
    const candidate = clone(binding);
    candidate.contactFoundation[key] = 'VERIFIED';
    unresolved(candidate);
  }
});
test('source binding preserves both human gates and every unresolved operational binding', () => {
  const result = verifyContactReference(binding, files);
  assert.deepEqual(result.requiredHumanGates, ['NOVA_ADMISSION','FINAL_EXACT_CONTACT_CONSENT']);
  assert.ok(Object.values(result.operationalBindings).every(value => value === 'UNKNOWN'));
  assert.deepEqual(result.aliases, { BRI9ADE:'UNKNOWN', '6RI9ADE':'UNKNOWN' });
  assert.equal(result.reportedFoundationTests.status, 'REPORTED_ONLY');
  held(result);
});
test('returned evidence and policy cannot be mutated by a caller', () => {
  const result = verifyContactReference(binding, files);
  assert.throws(() => { result.canOpenContact = true; }, TypeError);
  assert.throws(() => { result.sources[0].supportedClaims.push('AUTHORIZE'); }, TypeError);
  assert.throws(() => { result.requiredHumanGates.splice(0, 1); }, TypeError);
  held(result);
});
test('incomplete and malformed references fail closed without throwing', () => {
  for (const candidate of [undefined,null,{},[],{sources:[null]}]) {
    unresolved(candidate, undefined);
  }
});
test('nine distinct new design specialties do not enroll runtime guardians', () => {
  const result = inspectSpecialtyDesign(design);
  assert.equal(result.designStatus, 'DESIGN_DRAFT');
  assert.equal(new Set(result.assignedSpecialties.map(role => role.id)).size, 9);
  assert.equal(new Set(result.assignedSpecialties.map(role => role.roleCode)).size, 9);
  assert.equal(result.runtimeIdentitiesVerified, false);
  assert.equal(result.canOpenContact, false);
  assert.equal(result.absoluteSafetyGuaranteed, false);
});
test('missing guardian does not collapse into a green aggregate flag', () => {
  const candidate = clone(design); candidate.guards.pop(); invalidDesign(candidate);
});
test('duplicate guardian identity is rejected', () => {
  const candidate = clone(design); candidate.guards[8].id = candidate.guards[0].id; invalidDesign(candidate);
});
test('duplicate specialty cannot replace another required control', () => {
  const candidate = clone(design); candidate.guards[8].roleCode = candidate.guards[0].roleCode; invalidDesign(candidate);
});
test('declaring a design guardian live or authorized is rejected', () => {
  for (const [field,value] of [['runtimeIdentity','VERIFIED'],['runtimeStatus','ACTIVE'],['capabilities','EXECUTE']]) {
    const candidate = clone(design); candidate.guards[0][field] = value; invalidDesign(candidate);
  }
});
test('absolute safety and automatic human consent cannot be asserted', () => {
  for (const field of ['absoluteSafetyGuaranteed','technicalPassCreatesConsent','canMintAuthority','canOpenContact']) {
    const candidate = clone(design); candidate.policy[field] = true; invalidDesign(candidate);
  }
});
test('neither human gate may be skipped in the specialty design', () => {
  const candidate = clone(design); candidate.policy.humanGates = ['FINAL_EXACT_CONTACT_CONSENT']; invalidDesign(candidate);
});
test('unknown or conflicting checks must HOLD rather than PASS', () => {
  for (const field of ['onUnknown','onConflict']) {
    const candidate = clone(design); candidate.policy[field] = 'PASS'; invalidDesign(candidate);
  }
});
test('E2EE and content integrity remain endpoint controls', () => {
  for (const index of [4,5]) {
    const candidate = clone(design); candidate.guards[index].evidencePlacement = 'BOTH_ENDPOINTS_AND_RELAY'; invalidDesign(candidate);
  }
});
test('additional runtime PASS fields and empty controls cannot hide in a design', () => {
  const extra = clone(design); extra.guards[0].safety = 'PASS'; invalidDesign(extra);
  const empty = clone(design); empty.guards[0].checks = []; invalidDesign(empty);
});
