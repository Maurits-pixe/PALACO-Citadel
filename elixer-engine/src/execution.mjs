import { readFileSync } from 'node:fs';
import { canonicalJSON, packageDigest, deepFreeze } from './integrity.mjs';
import { assertSchemaSupported, validateWithSchema, validateManifest, validateRequest, validatePolicy, validateConsent, validateRevocation } from './contracts.mjs';

const copy = value => JSON.parse(canonicalJSON(value));
const frozenCopy = value => deepFreeze(copy(value));
const loadSchema = name => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/' + name + '.json', import.meta.url), 'utf8'));
  assertSchemaSupported(schema);
  return deepFreeze(schema);
};
const operationSchema = loadSchema('elixer-operation-v0.1');
const authorizationSchema = loadSchema('elixer-execution-authorization-v0.1');
const receiptSchema = loadSchema('elixer-action-receipt-v0.1');
const householdSchema = loadSchema('elixer-household-v0.1');
const resourceSchema = {
  "type": "object",
  "properties": {
    "schemaVersion": {
      "type": "string",
      "const": "0.1"
    },
    "targetId": {
      "type": "string",
      "format": "token64"
    },
    "resourceType": {
      "type": "string",
      "enum": [
        "WEBSITE",
        "APP",
        "ELIXER"
      ]
    },
    "version": {
      "type": "string",
      "minLength": 5,
      "maxLength": 64,
      "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$"
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256,
      "pattern": "\\S"
    },
    "summary": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096,
      "pattern": "\\S"
    },
    "accessibilityLabel": {
      "type": "string",
      "minLength": 1,
      "maxLength": 512,
      "pattern": "\\S"
    },
    "classification": {
      "type": "string",
      "const": "SYNTHETIC_ONLY"
    }
  },
  "required": [
    "schemaVersion",
    "targetId",
    "resourceType",
    "version",
    "title",
    "summary",
    "accessibilityLabel",
    "classification"
  ],
  "additionalProperties": false
};
const snapshotSchema = {
  type: 'object',
  properties: {
    policy: { type: ['object', 'null'] },
    consent: { type: ['object', 'null'] },
    revocation: { type: ['object', 'null'] },
    authorization: { type: ['object', 'null'] },
    household: { type: ['object', 'null'] },
    dependencyAvailable: { type: 'boolean' },
  },
  required: ['policy', 'consent', 'revocation', 'authorization', 'household', 'dependencyAvailable'],
  additionalProperties: false,
};
const executionInputSchema = {
  type: 'object', properties: { manifest: { type: 'object' }, request: { type: 'object' } },
  required: ['manifest', 'request'], additionalProperties: false,
};
const ISO = { type: 'string', format: 'date-time' };
const TOKEN = { type: 'string', format: 'token64' };
const REQUIRED_SCOPE = 'consumer.maintenance.write';
const contextMatches = (left, right) => ['tenantId', 'worldId', 'citadelId'].every(key => left[key] === right[key]);

export const validateOperation = value => validateWithSchema(operationSchema, value);
export const validateExecutionAuthorization = value => validateWithSchema(authorizationSchema, value);
export const validateActionReceipt = value => validateWithSchema(receiptSchema, value);

/** Bind the exact operation and its base revision, never a caller's claim of permission. */
export function actionDigest(input) {
  const { manifest, request } = copy(input);
  if (!validateOperation(request?.operation).valid) throw new TypeError('OPERATION_INVALID');
  return packageDigest({
    identity: {
      actorId: request.who,
      tenantId: request.tenantId,
      worldId: request.worldId,
      citadelId: request.citadelId,
      elixerId: manifest.elixerId,
      version: manifest.version,
      packageDigest: manifest.packageDigest,
    },
    policyVersion: request.policyVersion,
    consentReference: request.consentReference,
    householdReference: request.householdReference,
    operation: request.operation,
  });
}

/**
 * The only executor is an allowlisted replacement of one synthetic consumer resource.
 * Every commit is synchronous and process-local. No provider, network or arbitrary callback
 * can be selected by a request. Production and institutional authority remain separate.
 */
export function createExecutionBoundary(options) {
  if (!options || typeof options.loadExecutionSnapshot !== 'function' || typeof options.now !== 'function') throw new TypeError('TRUSTED_EXECUTION_LOADERS_REQUIRED');
  const { loadExecutionSnapshot, now, targetId } = options;
  if (!validateWithSchema(TOKEN, targetId).valid) throw new TypeError('REGISTERED_TARGET_REQUIRED');
  const identity = copy(options.trustedContext);
  const trustedContext = deepFreeze(Object.fromEntries(['actorId', 'tenantId', 'worldId', 'citadelId'].map(key => [key, identity[key]])));
  if (!Object.values(trustedContext).every(value => typeof value === 'string' && /\S/.test(value) && value.length <= 256)) throw new TypeError('TRUSTED_CONTEXT_REQUIRED');
  const initialResource = copy(options.initialResource);
  if (!validateWithSchema(resourceSchema, initialResource).valid || initialResource.targetId !== targetId) throw new TypeError('SYNTHETIC_REGISTERED_RESOURCE_REQUIRED');
  // Resource, idempotency ledger and receipts advance through one atomic reference assignment.
  let store = { resource: deepFreeze(initialResource), ledger: new Map(), receipts: [] };
  let lastClock = null;

  const denied = code => deepFreeze({ status: 'DENIED', code, receipt: null });
  const committed = receipt => deepFreeze({ status: 'COMMITTED', code: null, receipt });
  function clock() {
    const timestamp = now();
    if (!validateWithSchema(ISO, timestamp).valid) throw new Error('CLOCK_UNKNOWN');
    const instant = Date.parse(timestamp);
    if (lastClock !== null && instant < lastClock) throw new Error('CLOCK_MOVED_BACKWARD');
    lastClock = instant;
    return { timestamp, instant };
  }

  function checkSnapshot(manifest, request, digest, instant) {
    let snapshot;
    try { snapshot = copy(loadExecutionSnapshot()); }
    catch { return { code: 'EXECUTION_SNAPSHOT_UNAVAILABLE' }; }
    if (!validateWithSchema(snapshotSchema, snapshot).valid) return { code: 'EXECUTION_SNAPSHOT_INVALID' };
    const { policy, consent, revocation, authorization: grant, household } = snapshot;
    if (!validateWithSchema(householdSchema, household).valid || household.householdId !== manifest.householdRef || household.householdId !== request.householdReference ||
        household.elixerId !== manifest.elixerId || !contextMatches(household, trustedContext)) return { code: 'HOUSEHOLD_MISMATCH' };
    if (household.state !== 'CURRENT' || Date.parse(household.expiresAt) <= instant) return { code: 'HOUSEHOLD_UNAVAILABLE' };
    if (!household.registeredTargets.includes(targetId)) return { code: 'HOUSEHOLD_TARGET_DENIED' };
    if (!snapshot.dependencyAvailable) return { code: 'DEPENDENCY_UNAVAILABLE' };
    if (!validatePolicy(policy).valid || policy.version !== request.policyVersion || !contextMatches(policy, trustedContext)) return { code: 'POLICY_MISMATCH' };
    if (!policy.allowedActions.includes('EXECUTE') || policy.forbiddenActions.includes('EXECUTE') ||
        request.scope.some(scope => !manifest.permissions.includes(scope) || !policy.allowedScopes.includes(scope))) return { code: 'EXECUTION_PROFILE_DENIED' };
    if (!validateRevocation(revocation).valid || revocation.state !== 'CURRENT' || request.revocationState !== 'CURRENT') return { code: 'REVOCATION_UNKNOWN' };
    const checkedAt = Date.parse(revocation.checkedAt);
    if (checkedAt > instant || instant - checkedAt > 60_000) return { code: 'REVOCATION_STALE' };
    if (request.consentReference === null || consent === null) return { code: 'CONSENT_REQUIRED' };
    if (!validateConsent(consent).valid || consent.id !== request.consentReference || consent.actorId !== trustedContext.actorId || !contextMatches(consent, trustedContext)) return { code: 'CONSENT_MISMATCH' };
    if (consent.revoked || revocation.revokedRefs.includes(consent.id)) return { code: 'CONSENT_REVOKED' };
    if (!consent.scopes.includes(REQUIRED_SCOPE) || request.scope.some(scope => scope !== 'public.read' && !consent.scopes.includes(scope))) return { code: 'CONSENT_SCOPE_DENIED' };
    if (grant === null) return { code: 'AUTHORIZATION_NOT_FOUND' };
    if (!validateExecutionAuthorization(grant).valid || grant.id !== request.authorization ||
        grant.actorId !== trustedContext.actorId || !contextMatches(grant, trustedContext) ||
        grant.elixerId !== manifest.elixerId || grant.version !== manifest.version ||
        grant.packageDigest !== manifest.packageDigest || grant.policyVersion !== policy.version ||
        grant.consentReference !== consent.id || grant.actionDigest !== digest || grant.householdReference !== household.householdId || grant.householdDigest !== packageDigest(household)) return { code: 'AUTHORIZATION_MISMATCH' };
    if (grant.revoked || revocation.revokedRefs.includes(grant.id)) return { code: 'AUTHORIZATION_REVOKED' };
    const otherReferences = [manifest.elixerId, manifest.packageDigest, policy.version, targetId, trustedContext.actorId, household.householdId];
    if (otherReferences.some(reference => revocation.revokedRefs.includes(reference))) return { code: 'REFERENCE_REVOKED' };
    if (Date.parse(manifest.issuedAt) > instant || Date.parse(manifest.expiresAt) <= Date.parse(manifest.issuedAt)) return { code: 'PACKAGE_TIME_INVALID' };
    if (Date.parse(grant.issuedAt) > instant || Date.parse(grant.expiresAt) <= Date.parse(grant.issuedAt)) return { code: 'AUTHORIZATION_TIME_INVALID' };
    if (Date.parse(grant.expiresAt) <= instant) return { code: 'AUTHORIZATION_EXPIRED' };
    if (Date.parse(consent.expiresAt) <= instant) return { code: 'CONSENT_EXPIRED' };
    if ([manifest.expiresAt, request.expiration, policy.expiresAt].some(value => Date.parse(value) <= instant)) return { code: 'EXECUTION_EXPIRED' };
    return { code: null, grant };
  }

  function execute(input) {
    let manifest, request;
    try {
      const value = copy(input);
      if (!validateWithSchema(executionInputSchema, value).valid) return denied('EXECUTION_INPUT_INVALID');
      ({ manifest, request } = value);
    } catch { return denied('EXECUTION_INPUT_INVALID'); }
    if (!validateManifest(manifest).valid || !validateRequest(request).valid) return denied('EXECUTION_CONTRACT_INVALID');
    if (request.what !== 'EXECUTE') return denied('EXECUTION_REQUEST_REQUIRED');
    if (request.who !== trustedContext.actorId || !contextMatches(request, trustedContext) || !contextMatches(manifest, trustedContext)) return denied('CONTEXT_MISMATCH');
    if (request.elixerId !== manifest.elixerId || request.version !== manifest.version || request.packageDigest !== manifest.packageDigest) return denied('PACKAGE_BINDING_MISMATCH');
    const manifestDefinition = copy(manifest);
    delete manifestDefinition.packageDigest;
    const boundPackage = { schemaVersion: '0.1', elixerId: manifest.elixerId, version: manifest.version, personaRefs: manifest.personaRefs, manifest: manifestDefinition };
    if (packageDigest(boundPackage) !== manifest.packageDigest) return denied('PACKAGE_DIGEST_MISMATCH');
    if (!manifest.provenanceRefs.length || canonicalJSON([...request.provenanceRefs].sort()) !== canonicalJSON([...manifest.provenanceRefs].sort())) return denied('PROVENANCE_MISMATCH');
    // The absent reference is explicitly distinct from an unknown or invalid grant.
    if (request.authorization === null) return deepFreeze({ status: 'AUTH_PENDING', code: 'EXPLICIT_AUTHORIZATION_REQUIRED', receipt: null });
    if (!validateOperation(request.operation).valid) return denied('OPERATION_INVALID');
    if (request.operation.targetId !== targetId) return denied('TARGET_MISMATCH');
    if (manifest.activation !== 'ACTIVE' || !manifest.capabilities.includes('EXECUTE') ||
        manifest.forbiddenActions.includes('EXECUTE') || !request.scope.includes(REQUIRED_SCOPE) ||
        !manifest.permissions.includes(REQUIRED_SCOPE) || manifest.dataClassification !== 'SYNTHETIC_ONLY') return denied('EXECUTION_PROFILE_DENIED');
    const digest = actionDigest({ manifest, request });
    const key = canonicalJSON({
      tenantId: trustedContext.tenantId, worldId: trustedContext.worldId,
      citadelId: trustedContext.citadelId, targetId, idempotencyKey: request.operation.idempotencyKey,
    });
    try {
      let checkedTime = clock();
      let gate = checkSnapshot(manifest, request, digest, checkedTime.instant);
      if (gate.code) return denied(gate.code);
      const previous = store.ledger.get(key);
      if (previous && previous.actionDigest !== digest) return denied('IDEMPOTENCY_CONFLICT');
      const payload = request.operation.payload;
      if (payload.resourceType !== store.resource.resourceType) return denied('RESOURCE_TYPE_MISMATCH');
      // A valid replay refers to the original base revision, which has already advanced.
      if (!previous && payload.expectedBeforeDigest !== packageDigest(store.resource)) return denied('RESOURCE_BASE_STALE');
      if (!previous && payload.version === store.resource.version) return denied('RESOURCE_VERSION_UNCHANGED');
      const nextResource = previous ? store.resource : deepFreeze({
        schemaVersion: '0.1', targetId, resourceType: store.resource.resourceType,
        version: payload.version, title: payload.title, summary: payload.summary,
        accessibilityLabel: payload.accessibilityLabel, classification: 'SYNTHETIC_ONLY',
      });
      if (!validateWithSchema(resourceSchema, nextResource).valid) return denied('RESOURCE_CONTRACT_INVALID');
      const beforeDigest = previous ? previous.receipt.beforeDigest : packageDigest(store.resource);
      const afterDigest = previous ? previous.receipt.afterDigest : packageDigest(nextResource);
      // Fresh host-owned gates are the final callbacks. No await or request-controlled callback
      // exists between this consistent snapshot and the synchronous atomic commit.
      checkedTime = clock();
      gate = checkSnapshot(manifest, request, digest, checkedTime.instant);
      if (gate.code) return denied(gate.code);
      if (previous) return committed(previous.receipt);
      const eventId = 'lab-maintenance-' + digest.slice(7, 39);
      const body = {
        schemaVersion: '0.1', type: 'SYNTHETIC_ACTION_RECEIPT',
        receiptId: 'lab-action-' + digest.slice(7, 39), actionDigest: digest,
        idempotencyKey: request.operation.idempotencyKey,
        actorId: trustedContext.actorId, tenantId: trustedContext.tenantId,
        worldId: trustedContext.worldId, citadelId: trustedContext.citadelId,
        elixerId: manifest.elixerId, version: manifest.version, packageDigest: manifest.packageDigest,
        policyVersion: request.policyVersion, consentReference: request.consentReference,
        authorizationReference: request.authorization,
        householdReference: request.householdReference, householdDigest: gate.grant.householdDigest,
        action: request.operation.action, targetId, resourceType: store.resource.resourceType,
        previousVersion: store.resource.version, appliedVersion: nextResource.version,
        committedAt: checkedTime.timestamp, eventId, beforeDigest, afterDigest,
        commitStatus: 'COMMITTED', storage: 'PROCESS_MEMORY', externalSideEffect: false,
      };
      const receipt = deepFreeze({ ...body, hash: packageDigest(body) });
      if (!validateActionReceipt(receipt).valid) return denied('RECEIPT_CONTRACT_INVALID');
      const ledger = new Map(store.ledger);
      ledger.set(key, deepFreeze({ actionDigest: digest, receipt }));
      const receipts = [...store.receipts, receipt];
      const result = committed(receipt);
      const nextStore = { resource: nextResource, ledger, receipts };
      // All potentially failing hashes, schema checks and result construction preceded the effect.
      // This single reference update commits resource, replay protection and receipt together.
      store = nextStore;
      return result;
    } catch { return denied('EXECUTION_GATE_UNAVAILABLE'); }
  }

  return Object.freeze({
    execute,
    resources: () => frozenCopy([store.resource]),
    receipts: () => frozenCopy(store.receipts),
  });
}
