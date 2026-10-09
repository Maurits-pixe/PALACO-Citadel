import { createEngine } from './engine.mjs';
import { createPersonaAdapters } from './personas.mjs';
import { canonicalJSON, packageDigest } from './integrity.mjs';

export const FIXED_NOW = '2026-10-10T10:00:00.000Z';
export const SCENARIOS = Object.freeze(['ready', 'no-consent', 'revoked', 'expired', 'offline', 'conflict', 'unauthorized', 'tampered', 'execution']);
const clone = value => JSON.parse(canonicalJSON(value));

/** Explicit test helper: changing a manifest creates a different package and digest. */
export function bindPackage(lab) {
  const definition = clone(lab.manifest);
  delete definition.packageDigest;
  lab.package = { schemaVersion: '0.1', elixerId: lab.manifest.elixerId, version: lab.manifest.version, personaRefs: clone(lab.manifest.personaRefs), manifest: definition };
  lab.manifest.packageDigest = packageDigest(lab.package);
  lab.request.packageDigest = lab.manifest.packageDigest;
  return lab;
}

/** Synthetic laboratory fixture, not a provisioned tenant, account or consent. */
export function createLab(options = {}) {
  const { scenario = 'ready', now = () => FIXED_NOW } = options;
  if (!SCENARIOS.includes(scenario)) throw new TypeError('UNKNOWN_LAB_SCENARIO');
  const identity = { actorId: 'lab-actor-001', tenantId: 'lab-tenant-001', worldId: 'lab-world-001', citadelId: 'lab-citadel-001' };
  const permissions = ['public.read', 'household.read'];
  const capabilities = ['READ', 'EXPLAIN', 'PROPOSE'];
  const sourceRefs = ['https://app.notion.com/p/bf8b28ff413049c5985caab475827458', 'https://app.notion.com/p/50f3dbccda0a4e03a26476cdc6f44cd7'];
  const manifest = {
    schemaVersion: '0.1', elixerId: 'HARA-LAB-001', canonicalName: 'H∆R∆', version: '0.1.0',
    lifecycle: 'LAB_CANDIDATE', purpose: 'Synthetische, uitsluitend lezende H∆R∆-laboratoriumkandidaat',
    tenantId: identity.tenantId, worldId: identity.worldId, citadelId: identity.citadelId,
    personaRefs: [['HARAM', 'haram-v0-1'], ['CHINGCHING', 'chingching-v0-1'], ['HANNIE', 'hannie-v0-1']].map(([personaId, adapterId]) => ({ personaId, adapterId, characterVersion: '0.1.0', capabilities: [...capabilities], permissions: [...permissions], timeoutMs: 1000 })),
    capabilities, permissions, forbiddenActions: ['EXECUTE', 'AUTHORIZE', 'ISSUE'],
    dependencies: [{ id: 'synthetic-memory', required: true }],
    dataClassification: 'SYNTHETIC_ONLY', memoryPolicy: { mode: 'EPHEMERAL', productionData: false },
    consentPolicy: { requiredFor: ['household.read'] }, surfaceBindings: { full: 'FULL_ELIXER', widget: 'WIDGET' },
    source: { repository: 'Maurits-pixe/PALACO-Citadel', commit: null },
    packageDigest: 'sha256:' + '0'.repeat(64), provenanceRefs: sourceRefs,
    issuerRef: null, distribution: 'NOT_ALLOWED', activation: 'INACTIVE',
    issuedAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-10-11T10:00:00.000Z',
  };
  const request = {
    schemaVersion: '0.1', who: identity.actorId, what: scenario === 'conflict' ? 'PROPOSE' : 'READ',
    why: 'De eerste ELIXER ENGINE-kern inspecteren met synthetische gegevens.',
    elixerId: manifest.elixerId, version: manifest.version, packageDigest: manifest.packageDigest,
    tenantId: identity.tenantId, worldId: identity.worldId, citadelId: identity.citadelId, surface: 'FULL_ELIXER',
    provenanceRefs: [...sourceRefs], policyVersion: 'lab-policy-0.1', consentReference: 'lab-consent-001',
    scope: [...permissions], authorization: null, expiration: '2026-10-10T11:00:00.000Z',
    revocationState: 'CURRENT', correlationId: 'lab-' + scenario + '-001',
  };
  const records = {
    policy: { schemaVersion: '0.1', version: request.policyVersion, tenantId: identity.tenantId, worldId: identity.worldId, citadelId: identity.citadelId, allowedActions: [...capabilities], allowedScopes: [...permissions], forbiddenActions: ['EXECUTE', 'AUTHORIZE', 'ISSUE'], expiresAt: '2026-10-11T10:00:00.000Z' },
    consent: { schemaVersion: '0.1', id: 'lab-consent-001', actorId: identity.actorId, tenantId: identity.tenantId, worldId: identity.worldId, citadelId: identity.citadelId, scopes: ['household.read'], expiresAt: '2026-10-11T10:00:00.000Z', revoked: false },
    revocation: { schemaVersion: '0.1', state: 'CURRENT', revokedRefs: [], checkedAt: FIXED_NOW },
  };
  const contextReads = [];
  const lab = { manifest, request, records, contextReads, package: null };
  if (scenario === 'no-consent') { request.consentReference = null; records.consent = null; }
  if (scenario === 'revoked') records.revocation.revokedRefs.push(manifest.elixerId);
  if (scenario === 'expired') request.expiration = '2026-10-10T09:59:59.000Z';
  if (scenario === 'unauthorized') request.tenantId = 'lab-other-tenant';
  if (scenario === 'execution') request.what = 'EXECUTE';
  bindPackage(lab);
  if (scenario === 'tampered') lab.package.version = '0.1.1';
  const defaultLoadContext = async ({ scope, identity: boundIdentity }) => {
    contextReads.push({ scope: [...scope], identity: clone(boundIdentity) });
    return {
      classification: 'SYNTHETIC_ONLY',
      ...(scope.includes('public.read') ? { public: { summary: 'Synthetische demo: drie persona’s lezen een fictieve dagindeling.' } } : {}),
      ...(scope.includes('household.read') ? { household: { schedule: [{ label: 'Fictief tuinmoment', at: '2026-10-10T14:00:00.000Z' }] } } : {}),
    };
  };
  lab.engine = createEngine({
    trustedContext: options.trustedContext ?? identity,
    loadPolicy: options.loadPolicy ?? (async () => clone(records.policy)),
    loadConsent: options.loadConsent ?? (async reference => records.consent?.id === reference ? clone(records.consent) : null),
    loadRevocation: options.loadRevocation ?? (async () => clone(records.revocation)),
    loadContext: options.loadContext ?? defaultLoadContext, now,
    dependencies: options.dependencies ?? { 'synthetic-memory': scenario !== 'offline' },
    adapters: options.adapters ?? createPersonaAdapters({ conflict: scenario === 'conflict' }),
  });
  return lab;
}
