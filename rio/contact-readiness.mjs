import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const repository = 'Maurits-pixe/PALACO-Citadel';
const commitSha = '117e3ba7023aafd040b0babc89b878beb1dc0cc8';
const pins = [
  {
    "id": "big-bang",
    "path": "CANON/00-big-bang/# ☄️ THE BIG BANG — PALACO",
    "gitBlobSha": "701324fd30ca0c88af928a24e43c66274db51110",
    "locator": "XL, lines 1231–1247",
    "supportedClaims": [
      "BRIGADE_CONCEPT_MENTION"
    ]
  },
  {
    "id": "guardian-profile",
    "path": "08-IMPLEMENTATION/profile.go",
    "gitBlobSha": "1716ee6893558976cf6db18dc338e350c572bc8e",
    "locator": "lines 12–36",
    "supportedClaims": [
      "GUARDIAN_PROFILE_FIELDS"
    ]
  }
];
const unknownBindings = ['agentIdentities', 'agentCapabilities', 'bilateralSafetyEvidence', 'ppRegistration', 'scriptieIdContract'];

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && expected.every((value, index) => actual[index] === value);
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}

/**
 * A read-only reference checker. Supplied bytes are evidence inputs, never
 * identity, safety attestation, human consent or runtime authorization.
 * Every result keeps contact HOLD. This module contains no contact executor.
 */
export function verifyContactReference(binding, files) {
  const errors = [];
  const evidence = [];
  const rootKeys = ['schemaVersion', 'classification', 'resolvedName', 'aliases', 'sources',
    'operationalBindings', 'contactFoundation', 'productionTarget', 'operativeAuthority'];
  if (!exactKeys(binding, rootKeys)
      || binding.schemaVersion !== 'rio-contact-source-binding/0.1'
      || binding.classification !== 'DESIGN_REFERENCE'
      || binding.resolvedName !== 'BRIGADE'
      || binding.operativeAuthority !== 'NONE') errors.push('INVALID_REFERENCE_CONTRACT');
  if (!exactKeys(binding?.aliases, ['BRI9ADE', '6RI9ADE'])
      || binding.aliases.BRI9ADE !== 'UNKNOWN'
      || binding.aliases['6RI9ADE'] !== 'UNKNOWN') errors.push('UNSUPPORTED_ALIAS_CLAIM');
  if (!exactKeys(binding?.operationalBindings, unknownBindings)
      || unknownBindings.some(key => binding.operationalBindings[key] !== 'UNKNOWN')) {
    errors.push('UNSUPPORTED_OPERATIONAL_CLAIM');
  }
  const foundation = binding?.contactFoundation;
  if (!exactKeys(foundation, ['pageId','url','version','lastEditedAt','classification',
      'reportedTests','testVerification','zipSha256','zipVerification'])
      || foundation.pageId !== 'a69dd64d-8566-4c80-9b8b-723630785a52'
      || foundation.url !== 'https://app.notion.com/p/a69dd64d85664c809b8b723630785a52'
      || foundation.version !== 'v0.1'
      || foundation.lastEditedAt !== '2026-10-10T08:56:48.681Z'
      || foundation.classification !== 'ENGINEERING_DRAFT'
      || foundation.reportedTests !== 20
      || foundation.testVerification !== 'REPORTED_ONLY'
      || foundation.zipSha256 !== 'c775b84fb6ba6cc3a2af94fa41c7ebb9d0eef3d782cfb6c7522429c4841a134d'
      || foundation.zipVerification !== 'NOT_PERFORMED') errors.push('INVALID_FOUNDATION_REFERENCE');
  const target = binding?.productionTarget;
  if (!exactKeys(target, ['repository','observedCommitSha','path','state'])
      || target.repository !== 'Maurits-pixe/PALACO'
      || target.observedCommitSha !== 'db664274c3760cca3fef19d23945e3c79dbe7f8c'
      || target.path !== 'crates/palaco-citadel/src/rio/'
      || target.state !== 'PLANNED_LOCATION_NOT_PRESENT_AT_OBSERVED_COMMIT') {
    errors.push('INVALID_PRODUCTION_TARGET_REFERENCE');
  }
  if (!Array.isArray(binding?.sources) || binding.sources.length !== pins.length) {
    errors.push('INCOMPLETE_SOURCE_SET');
  }
  if (!exactKeys(files, pins.map(pin => pin.id))) errors.push('INCOMPLETE_SOURCE_BYTES');
  for (const pin of pins) {
    const matches = Array.isArray(binding?.sources)
      ? binding.sources.filter(source => source?.id === pin.id) : [];
    const source = matches.length === 1 ? matches[0] : undefined;
    if (!exactKeys(source, ['id','path','gitBlobSha','locator','supportedClaims','repository','commitSha'])
        || source.repository !== repository || source.commitSha !== commitSha
        || source.path !== pin.path || source.gitBlobSha !== pin.gitBlobSha
        || source.locator !== pin.locator || !sameArray(source.supportedClaims, pin.supportedClaims)) {
      errors.push('INVALID_SOURCE_PIN:' + pin.id);
      continue;
    }
    const bytes = files?.[pin.id];
    if (!Buffer.isBuffer(bytes)) {
      errors.push('MISSING_SOURCE_BYTES:' + pin.id);
      continue;
    }
    if (gitBlobSha(bytes) !== pin.gitBlobSha) {
      errors.push('SOURCE_BYTES_CHANGED:' + pin.id);
      continue;
    }
    evidence.push({
      id: pin.id, repository, commitSha, path: pin.path,
      gitBlobSha: pin.gitBlobSha, contentSha256: sha256(bytes),
      supportedClaims: [...pin.supportedClaims],
      byteIntegrity: 'MATCHED_PIN',
      meaning: 'DESIGN_REFERENCE_ONLY'
    });
  }
  return freeze({
    schemaVersion: 'rio-contact-readiness/0.1',
    referenceStatus: errors.length ? 'SOURCE_BINDING_UNRESOLVED' : 'BRIGADE_REFERENCE_BOUND',
    contactStatus: 'HOLD',
    canOpenContact: false,
    operativeAuthority: 'NONE',
    runtimeConnected: false,
    sources: evidence,
    aliases: { BRI9ADE: 'UNKNOWN', '6RI9ADE': 'UNKNOWN' },
    operationalBindings: Object.fromEntries(unknownBindings.map(key => [key, 'UNKNOWN'])),
    requiredHumanGates: ['NOVA_ADMISSION', 'FINAL_EXACT_CONTACT_CONSENT'],
    requiredTechnicalGate: 'CURRENT_BILATERAL_SAFETY_EVIDENCE',
    reportedFoundationTests: { count: 20, status: 'REPORTED_ONLY', independentlyRunHere: false },
    remainingIntegration: ['AUTHENTICATED_HUMAN_RECEIPTS', 'DURABLE_CONTACT_SERVICE', 'E2EE_TEXT_RELAY'],
    errors
  });
}


const roleCodes = ["IDENTITY","ADDRESS","HUMAN_CONSENT","SCOPE_POLICY","E2EE_KEYS","CONTENT_INTEGRITY","REPLAY_ORDER","PRIVACY","DELIVERY_REVOCATION"];
export function inspectSpecialtyDesign(design) {
  const errors = [];
  if (!exactKeys(design, ['schemaVersion','designId','componentName','status','requestBasis','sourceRelationship','policy','guards'])
      || design.schemaVersion !== '6ri9ade-specialty-design/0.1'
      || design.designId !== '6RI9ADE-BODYGUARDS-001'
      || design.componentName !== '6RI9ADE' || design.status !== 'DESIGN_DRAFT'
      || typeof design.requestBasis !== 'string' || !design.requestBasis.trim()
      || typeof design.sourceRelationship !== 'string' || !design.sourceRelationship.trim()) {
    errors.push('INVALID_SPECIALTY_DESIGN');
  }
  const policy = design?.policy;
  if (!exactKeys(policy, ['requiredGuards','allEvidenceRequired','onUnknown','onConflict','onFailure',
      'humanGates','protectBothParties','technicalPassCreatesConsent','canMintAuthority','canOpenContact','absoluteSafetyGuaranteed'])
      || policy.requiredGuards !== 9 || policy.allEvidenceRequired !== true
      || policy.onUnknown !== 'HOLD' || policy.onConflict !== 'HOLD' || policy.onFailure !== 'STOP'
      || !sameArray(policy.humanGates, ['NOVA_ADMISSION','FINAL_EXACT_CONTACT_CONSENT'])
      || policy.protectBothParties !== true || policy.technicalPassCreatesConsent !== false
      || policy.canMintAuthority !== false || policy.canOpenContact !== false
      || policy.absoluteSafetyGuaranteed !== false) errors.push('INVALID_SPECIALTY_BOUNDARY');
  const guards = Array.isArray(design?.guards) ? design.guards : [];
  if (guards.length !== 9) errors.push('NINE_DISTINCT_SPECIALTIES_REQUIRED');
  for (let i = 0; i < 9; i++) {
    const guard = guards[i];
    const keys = ['id','roleCode','specialty','purpose','checks','stopConditions','boundary',
      'evidencePlacement','runtimeIdentity','runtimeStatus','capabilities'];
    const textFields = ['specialty','purpose','boundary'];
    const lists = ['checks','stopConditions'];
    if (!exactKeys(guard, keys)
        || guard.id !== '6RI9ADE-BG-' + String(i + 1).padStart(2, '0')
        || guard.roleCode !== roleCodes[i]
        || textFields.some(key => typeof guard[key] !== 'string' || !guard[key].trim())
        || lists.some(key => !Array.isArray(guard[key]) || !guard[key].length
          || guard[key].some(value => typeof value !== 'string' || !value.trim()))
        || !['BOTH_ENDPOINTS','CLIENT_ENDPOINTS_ONLY','BOTH_ENDPOINTS_AND_RELAY'].includes(guard.evidencePlacement)
        || (['E2EE_KEYS','CONTENT_INTEGRITY'].includes(guard.roleCode)
          && guard.evidencePlacement !== 'CLIENT_ENDPOINTS_ONLY')
        || guard.runtimeIdentity !== 'UNENROLLED' || guard.runtimeStatus !== 'NOT_CONNECTED'
        || guard.capabilities !== 'DESIGN_ONLY') errors.push('INVALID_GUARD:' + (i + 1));
  }
  return freeze({
    designId: '6RI9ADE-BODYGUARDS-001', componentName: '6RI9ADE',
    designStatus: errors.length ? 'INVALID' : 'DESIGN_DRAFT',
    assignedSpecialties: errors.length ? [] : guards.map(({id,roleCode,specialty}) => ({id,roleCode,specialty})),
    runtimeIdentitiesVerified: false, runtimeConnected: false, canOpenContact: false,
    operativeAuthority: 'NONE', absoluteSafetyGuaranteed: false, errors
  });
}

/** Uses only fixed repository-relative paths; no user-selected files or URLs. */
export async function loadContactReadiness() {
  let binding;
  try {
    binding = JSON.parse(await readFile(new URL('./contact-source-binding.json', import.meta.url), 'utf8'));
  } catch {
    binding = undefined;
  }
  const files = {};
  for (const pin of pins) {
    try {
      files[pin.id] = await readFile(new URL('../' + pin.path.split('/').map(encodeURIComponent).join('/'), import.meta.url));
    } catch {
      files[pin.id] = undefined;
    }
  }
  let design;
  let designBytes;
  try {
    designBytes = await readFile(new URL('./brigade-specialties.json', import.meta.url));
    design = JSON.parse(designBytes.toString('utf8'));
  } catch {
    design = undefined;
  }
  const specialtyDesign = inspectSpecialtyDesign(design);
  return freeze({
    ...verifyContactReference(binding, files),
    specialtyDesign: { ...specialtyDesign, contentSha256: designBytes ? sha256(designBytes) : null }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await loadContactReadiness();
  const sourceCommit = process.env.RIO_SOURCE_COMMIT ?? null;
  process.stdout.write(JSON.stringify({ sourceCommit, ...result }, null, 2) + '\n');
  process.exitCode = result.referenceStatus === 'BRIGADE_REFERENCE_BOUND' && result.specialtyDesign.designStatus === 'DESIGN_DRAFT' ? 0 : 1;
}
