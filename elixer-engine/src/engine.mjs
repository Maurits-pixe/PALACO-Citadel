import { canonicalJSON, packageDigest, deepFreeze } from './integrity.mjs';
import { validateManifest, validateRequest, validatePolicy, validateConsent, validateRevocation, validateResult, validateWithSchema } from './contracts.mjs';
import { createJournal } from './journal.mjs';
import { PERSONA_IDS } from './personas.mjs';
import { validateActionReceipt } from './execution.mjs';

const clone = value => JSON.parse(canonicalJSON(value));
const textOrNull = value => typeof value === 'string' && /\S/.test(value) && value.length <= 256 ? value : null;
const idsMatch = (left, right) => ['tenantId', 'worldId', 'citadelId'].every(key => left[key] === right[key]);
const ISO = { type: 'string', format: 'date-time' };
const ERROR_MESSAGES = {
  CONTEXT_MISMATCH: 'De opgegeven actor of context past niet bij de vertrouwde laboratoriumcontext.',
  PROVENANCE_UNKNOWN: 'Bronverwijzingen ontbreken of zijn niet aan dezelfde package gebonden.',
  CONSENT_MISSING: 'Persoonlijke context is niet beschikbaar zonder actuele toestemming.',
  DEPENDENCY_OFFLINE: 'Een vereiste dependency is offline; alleen openbare synthetische informatie blijft beschikbaar.',
  PERSONA_UNAVAILABLE: 'Een persona is niet beschikbaar. De oorzaak bevat geen openbaar gemaakte adaptergegevens.',
  PERSONA_DISSENT: 'Afwijkende persona-adviezen blijven behouden en vragen om beoordeling.',
};
const adapterOutputSchema = {
  type: 'object', properties: {
    recommendation: { type: 'string', enum: ['READ_ONLY', 'PAUSE'] },
    message: { type: 'string', minLength: 1, maxLength: 4096, pattern: '\\S' },
    contextKeys: { type: 'array', items: { type: 'string', enum: ['public', 'household'] }, maxItems: 2, uniqueItems: true },
  }, required: ['recommendation', 'message', 'contextKeys'], additionalProperties: false,
};

/** All trust inputs come from host-owned loaders, never from persona advice or request claims. */
export function createEngine(options) {
  const { loadPolicy, loadConsent, loadRevocation, loadContext, now, dependencies, adapters } = options;
  if ([loadPolicy, loadConsent, loadRevocation, loadContext, now].some(value => typeof value !== 'function')) throw new TypeError('TRUSTED_LOADERS_REQUIRED');
  const hostIdentity = clone(options.trustedContext);
  const trustedContext = deepFreeze(Object.fromEntries(['actorId', 'tenantId', 'worldId', 'citadelId'].map(key => [key, hostIdentity[key]])));
  if (!['actorId', 'tenantId', 'worldId', 'citadelId'].every(key => textOrNull(trustedContext[key]))) throw new TypeError('TRUSTED_CONTEXT_REQUIRED');
  const journal = createJournal();
  const history = [];
  const seen = new Set();
  let queue = Promise.resolve();
  let count = 0;

  async function process(input) {
    count += 1;
    let manifest, request, payload;
    let inputDigest = null;
    let lastClock = null;
    let deadline = null;
    let freshnessDeadline = null;
    let evidence = { provenance: 'UNKNOWN', verification: 'NONE', references: [] };
    let consent = { status: 'UNKNOWN', reference: null };
    let authorization = { status: 'UNKNOWN', reference: null };
    const state = { package: 'UNRESOLVED', conformance: 'NOT_RUN', authority: 'NONE', distribution: 'NOT_ALLOWED', activation: 'INACTIVE', freshness: 'CURRENT', execution: 'NOT_REQUESTED' };
    const reasons = [];
    const uncertainties = [];
    let scope = [];
    let personaResults = [];
    let dissent = [];
    let proposal = null;
    let executionReceipt = null;
    let correlationId = 'lab-invalid-' + count;
    const identity = { elixerId: null, version: null, packageDigest: null, actorId: null, tenantId: null, worldId: null, citadelId: null, householdId: null };

    function note(code) {
      if (!reasons.includes(code)) reasons.push(code);
      if (ERROR_MESSAGES[code] && !uncertainties.includes(ERROR_MESSAGES[code])) uncertainties.push(ERROR_MESSAGES[code]);
    }
    function clock() {
      const value = now();
      if (!validateWithSchema(ISO, value).valid) throw new Error('CLOCK_UNKNOWN');
      const instant = Date.parse(value);
      if (lastClock !== null && instant < lastClock) throw new Error('CLOCK_MOVED_BACKWARD');
      lastClock = instant;
      return value;
    }
    function finish(resultType, code, discard = false) {
      if (code) note(code);
      if (discard && state.execution !== 'COMMITTED') { scope = []; personaResults = []; dissent = []; proposal = null; }
      if (['BLOCKED', 'REVOKED', 'EXPIRED', 'STALE', 'REVIEW_REQUIRED'].includes(resultType) && request?.what === 'EXECUTE' && state.execution !== 'COMMITTED') state.execution = 'DENIED';
      const body = {
        schemaVersion: '0.1', resultId: 'elixer-result-' + String(count).padStart(8, '0'),
        correlationId, resultType, identity, state, scope, evidence, consent, authorization,
        uncertainty: uncertainties, reasonCodes: reasons, personaResults, dissent, proposal, executionReceipt,
      };
      let timestamp;
      try { timestamp = clock(); } catch {
        // An unavailable host clock is reported explicitly; no timestamp is invented.
        timestamp = null;
        note('CLOCK_UNKNOWN');
        body.resultType = state.execution === 'COMMITTED' ? 'EXECUTED_WITH_RECEIPT' : 'REVIEW_REQUIRED';
        if (state.execution !== 'COMMITTED') body.scope = [];
        body.personaResults = [];
        body.dissent = [];
        body.proposal = null;
        body.state.freshness = 'STALE';
      }
      if (state.execution !== 'COMMITTED' && timestamp !== null && deadline !== null && Date.parse(timestamp) >= deadline) {
        note('EXPIRED_BEFORE_RESULT');
        body.resultType = 'EXPIRED';
        body.state.freshness = 'EXPIRED';
        if (request?.what === 'EXECUTE') body.state.execution = 'DENIED';
        body.scope = []; body.personaResults = []; body.dissent = []; body.proposal = null;
      }
      else if (state.execution !== 'COMMITTED' && timestamp !== null && freshnessDeadline !== null && Date.parse(timestamp) > freshnessDeadline) {
        note('REVOCATION_STALE_BEFORE_RESULT');
        body.resultType = 'STALE'; body.state.freshness = 'STALE';
        if (request?.what === 'EXECUTE') body.state.execution = 'DENIED';
        body.scope = []; body.personaResults = []; body.dissent = []; body.proposal = null;
      }
      if (state.execution === 'COMMITTED' && timestamp !== null && deadline !== null && Date.parse(timestamp) >= deadline) {
        note('EXPIRED_AFTER_COMMIT'); body.state.freshness = 'EXPIRED';
      } else if (state.execution === 'COMMITTED' && timestamp !== null && freshnessDeadline !== null && Date.parse(timestamp) > freshnessDeadline) {
        note('REVOCATION_STALE_AFTER_COMMIT'); body.state.freshness = 'STALE';
      }
      const resultIdentity = { ...body };
      delete resultIdentity.resultId;
      body.resultId = 'elixer-result-' + packageDigest(resultIdentity).slice(7, 39);
      const resultDigest = packageDigest(body);
      const trace = journal.append({ timestamp, correlationId, inputDigest, resultDigest, resultType: body.resultType, reasonCodes: [...reasons], state: { ...state } });
      const result = deepFreeze({ ...body, trace });
      if (!validateResult(result).valid) throw new Error('INTERNAL_RESULT_CONTRACT_FAILURE');
      history.push(result);
      return result;
    }

    try {
      ({ manifest, request, package: payload } = clone(input));
      inputDigest = packageDigest({ manifest, request, package: payload });
    } catch { return finish('BLOCKED', 'INPUT_NOT_JSON', true); }
    const validRequest = validateRequest(request);
    const validManifest = validateManifest(manifest);
    if (!validRequest.valid || !validManifest.valid) {
      note(!validRequest.valid ? 'INVALID_REQUEST' : 'INVALID_MANIFEST');
      for (const error of [...validRequest.errors, ...validManifest.errors].slice(0, 100)) note('SCHEMA_' + error.code);
      if (validRequest.errors.some(error => error.path === '/authorization' && error.code === 'REQUIRED')) note('AUTHORIZATION_FIELD_MISSING');
      return finish('BLOCKED', null, true);
    }
    correlationId = request.correlationId;
    Object.assign(identity, { elixerId: request.elixerId, version: request.version, packageDigest: request.packageDigest, actorId: request.who, tenantId: request.tenantId, worldId: request.worldId, citadelId: request.citadelId, householdId: textOrNull(request.householdReference) });
    authorization = { status: request.authorization === null ? 'NOT_PROVIDED' : 'UNKNOWN', reference: request.authorization };
    consent = { status: request.consentReference === null ? 'MISSING' : 'UNKNOWN', reference: request.consentReference };
    if (seen.has(correlationId)) return finish('BLOCKED', 'CORRELATION_ID_REUSED', true);
    seen.add(correlationId);
    if (request.who !== trustedContext.actorId || !idsMatch(request, trustedContext) || !idsMatch(manifest, trustedContext)) return finish('BLOCKED', 'CONTEXT_MISMATCH', true);
    if (request.elixerId !== manifest.elixerId || request.version !== manifest.version) return finish('BLOCKED', 'VERSION_MISMATCH', true);
    state.package = 'RESOLVED';
    if (request.packageDigest !== manifest.packageDigest || packageDigest(payload) !== manifest.packageDigest) return finish('BLOCKED', 'PACKAGE_DIGEST_MISMATCH', true);
    const manifestDefinition = clone(manifest);
    delete manifestDefinition.packageDigest;
    const expectedPayload = { schemaVersion: '0.1', elixerId: manifest.elixerId, version: manifest.version, personaRefs: manifest.personaRefs, manifest: manifestDefinition };
    if (canonicalJSON(payload) !== canonicalJSON(expectedPayload)) return finish('BLOCKED', 'PACKAGE_BINDING_MISMATCH', true);
    const personaIds = manifest.personaRefs.map(value => value.personaId);
    if (personaIds.length !== 3 || new Set(personaIds).size !== 3 || !PERSONA_IDS.every(id => personaIds.includes(id)) ||
        new Set(manifest.personaRefs.map(value => value.adapterId)).size !== 3 ||
        new Set(manifest.dependencies.map(value => value.id)).size !== manifest.dependencies.length ||
        manifest.personaRefs.some(persona => persona.characterVersion !== '0.1.0' ||
          persona.capabilities.some(capability => !manifest.capabilities.includes(capability)) ||
          persona.permissions.some(permission => !manifest.permissions.includes(permission)))) return finish('BLOCKED', 'PERSONA_BINDING_INVALID', true);
    state.package = 'INTEGRITY_VERIFIED';
    evidence.verification = 'INTEGRITY_ONLY';
    state.activation = manifest.activation;
    evidence.references = [...manifest.provenanceRefs];
    if (!manifest.provenanceRefs.length || canonicalJSON([...request.provenanceRefs].sort()) !== canonicalJSON([...manifest.provenanceRefs].sort())) return finish('REVIEW_REQUIRED', 'PROVENANCE_UNKNOWN', true);
    evidence.provenance = 'BOUND_RECORDS';
    uncertainties.push('De hash controleert package-integriteit; een officiële signature, PROOF en institutionele acceptatie ontbreken.');
    const isOffline = () => manifest.dependencies.some(dependency => dependency.required && dependencies?.[dependency.id] !== true);
    let offline = isOffline();
    if (offline) note('DEPENDENCY_OFFLINE');

    async function gate() {
      let policy, revocation, currentConsent;
      offline = isOffline();
      if (offline) note('DEPENDENCY_OFFLINE');
      const timestamp = clock();
      const instant = Date.parse(timestamp);
      deadline = Math.min(Date.parse(manifest.expiresAt), Date.parse(request.expiration));
      if (deadline <= instant) { state.freshness = 'EXPIRED'; return { type: 'EXPIRED', code: 'RUNTIME_EXPIRED' }; }
      if (Date.parse(manifest.issuedAt) > instant || Date.parse(manifest.expiresAt) <= Date.parse(manifest.issuedAt)) return { type: 'BLOCKED', code: 'PACKAGE_TIME_INVALID' };
      try { policy = clone(await loadPolicy()); } catch { return { type: 'REVIEW_REQUIRED', code: 'POLICY_UNAVAILABLE' }; }
      if (!validatePolicy(policy).valid || policy.version !== request.policyVersion || !idsMatch(policy, trustedContext)) return { type: 'BLOCKED', code: 'POLICY_MISMATCH' };
      if (Date.parse(policy.expiresAt) <= instant) { state.freshness = 'EXPIRED'; return { type: 'EXPIRED', code: 'POLICY_EXPIRED' }; }
      try { revocation = clone(await loadRevocation()); } catch { state.freshness = 'STALE'; return { type: 'REVIEW_REQUIRED', code: 'REVOCATION_UNAVAILABLE' }; }
      if (!validateRevocation(revocation).valid || revocation.state !== 'CURRENT' || request.revocationState !== 'CURRENT') { state.freshness = 'STALE'; return { type: 'STALE', code: 'REVOCATION_UNKNOWN' }; }
      const checked = Date.parse(revocation.checkedAt);
      freshnessDeadline = checked + 60_000;
      if (checked > instant || instant - checked > 60_000) { state.freshness = 'STALE'; return { type: 'STALE', code: 'REVOCATION_STALE' }; }
      const references = [manifest.elixerId, manifest.packageDigest, request.consentReference, request.authorization].filter(Boolean);
      if (references.some(reference => revocation.revokedRefs.includes(reference))) {
        if (request.consentReference && revocation.revokedRefs.includes(request.consentReference)) consent.status = 'REVOKED';
        state.execution = request.what === 'EXECUTE' ? 'DENIED' : 'NOT_REQUESTED';
        return { type: 'REVOKED', code: 'REFERENCE_REVOKED' };
      }
      // An execution request is handled only by the independent authorization boundary below.
      if (request.what !== 'EXECUTE' && (!policy.allowedActions.includes(request.what) || policy.forbiddenActions.includes(request.what) || !manifest.capabilities.includes(request.what))) return { type: 'BLOCKED', code: 'CAPABILITY_DENIED' };
      if (request.scope.some(permission => !manifest.permissions.includes(permission) || !policy.allowedScopes.includes(permission))) return { type: 'BLOCKED', code: 'SCOPE_DENIED' };
      if (request.consentReference === null) consent.status = 'MISSING';
      else {
        try { currentConsent = await loadConsent(request.consentReference); } catch { return { type: 'REVIEW_REQUIRED', code: 'CONSENT_UNAVAILABLE' }; }
        if (currentConsent === null) consent.status = 'MISSING';
        else {
          currentConsent = clone(currentConsent);
          if (!validateConsent(currentConsent).valid || currentConsent.id !== request.consentReference || currentConsent.actorId !== trustedContext.actorId || !idsMatch(currentConsent, trustedContext)) return { type: 'BLOCKED', code: 'CONSENT_MISMATCH' };
          if (currentConsent.revoked) { consent.status = 'REVOKED'; return { type: 'REVOKED', code: 'CONSENT_REVOKED' }; }
          if (Date.parse(currentConsent.expiresAt) <= instant) { consent.status = 'EXPIRED'; state.freshness = 'EXPIRED'; return { type: 'EXPIRED', code: 'CONSENT_EXPIRED' }; }
          consent.status = 'GRANTED';
        }
      }
      deadline = Math.min(deadline, Date.parse(policy.expiresAt), ...(currentConsent ? [Date.parse(currentConsent.expiresAt)] : []));
      const finalInstant = Date.parse(clock());
      if ([manifest.expiresAt, request.expiration, policy.expiresAt, ...(currentConsent ? [currentConsent.expiresAt] : [])].some(expiration => Date.parse(expiration) <= finalInstant)) { state.freshness = 'EXPIRED'; return { type: 'EXPIRED', code: 'GATE_EXPIRED_DURING_CHECK' }; }
      if (finalInstant - checked > 60_000) { state.freshness = 'STALE'; return { type: 'STALE', code: 'REVOCATION_STALE' }; }
      const allowed = request.scope.filter(permission => permission === 'public.read' || (!offline && consent.status === 'GRANTED' && currentConsent.scopes.includes(permission)));
      if (allowed.length !== request.scope.length) note(offline ? 'OFFLINE_SCOPE_MINIMIZED' : consent.status === 'GRANTED' ? 'CONSENT_SCOPE_LIMITED' : 'CONSENT_MISSING');
      if (!allowed.length) return { type: 'REVIEW_REQUIRED', code: 'NO_PERMITTED_CONTEXT' };
      return { scope: allowed, action: offline || consent.status !== 'GRANTED' ? 'READ' : request.what };
    }

    try {
      let checked = await gate();
      if (checked.type) return finish(checked.type, checked.code, true);
      scope = checked.scope;
      if (request.what === 'EXECUTE') {
        scope = [];
        if (request.authorization === null) {
          state.execution = 'AUTH_PENDING';
          return finish('EXECUTION_PENDING_AUTHORIZATION', 'EXPLICIT_AUTHORIZATION_REQUIRED', true);
        }
        if (!options.executionBoundary || typeof options.executionBoundary.execute !== 'function') {
          authorization.status = 'DENIED'; state.execution = 'DENIED';
          return finish('BLOCKED', 'EXECUTION_NOT_IMPLEMENTED', true);
        }
        if (manifest.activation !== 'ACTIVE' || !manifest.capabilities.includes('EXECUTE') || manifest.forbiddenActions.includes('EXECUTE') || checked.action !== 'EXECUTE') {
          authorization.status = 'DENIED'; state.execution = 'DENIED';
          return finish('BLOCKED', 'EXECUTION_PROFILE_DENIED', true);
        }
        const execution = options.executionBoundary.execute({ manifest, request });
        if (execution?.status !== 'COMMITTED') {
          authorization.status = 'DENIED'; state.execution = 'DENIED';
          return finish('BLOCKED', 'EXECUTION_DENIED', true);
        }
        if (!validateActionReceipt(execution.receipt).valid) throw new Error('TRUSTED_EXECUTION_RECEIPT_INVALID');
        executionReceipt = execution.receipt;
        state.execution = 'COMMITTED';
        authorization.status = 'GRANTED';
        scope = checked.scope;
        return finish('EXECUTED_WITH_RECEIPT', 'EXPLICIT_MAINTENANCE_COMMITTED');
      }
      let action = checked.action;
      let context;
      // The context loader receives only the effective, minimized scope.
      checked = await gate();
      if (checked.type) return finish(checked.type, checked.code, true);
      scope = checked.scope;
      action = checked.action;
      try { context = clone(await loadContext({ scope: [...scope], identity: { ...trustedContext } })); }
      catch { return finish('REVIEW_REQUIRED', 'CONTEXT_UNAVAILABLE', true); }
      if (!context || context.classification !== 'SYNTHETIC_ONLY' || (scope.includes('public.read') && (!context.public || typeof context.public.summary !== 'string')) || (scope.includes('household.read') && (!context.household || !Array.isArray(context.household.schedule)))) return finish('BLOCKED', 'SYNTHETIC_CONTEXT_REQUIRED', true);
      if (scope.includes('public.read') && context.public.summary.length > 4096) return finish('BLOCKED', 'CONTEXT_LIMIT_EXCEEDED', true);
      if (scope.includes('household.read') && (context.household.schedule.length > 32 ||
        context.household.schedule.some(entry => !entry || typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 256 || !validateWithSchema(ISO, entry.at).valid))) return finish('BLOCKED', 'CONTEXT_CONTRACT_INVALID', true);
      // Never spread the loader's whole result into an adapter.
      context = deepFreeze({
        classification: 'SYNTHETIC_ONLY',
        ...(scope.includes('public.read') ? { public: { summary: context.public.summary } } : {}),
        ...(scope.includes('household.read') && context.household ? { household: { schedule: context.household.schedule.map(entry => ({ label: entry.label, at: entry.at })) } } : {}),
      });
      for (const persona of manifest.personaRefs) {
        checked = await gate();
        if (checked.type) return finish(checked.type, checked.code, true);
        if (canonicalJSON(checked.scope) !== canonicalJSON(scope) || checked.action !== action) return finish('REVIEW_REQUIRED', 'CONSENT_CHANGED_DURING_RUN', true);
        if (!persona.capabilities.includes(action)) return finish('BLOCKED', 'PERSONA_CAPABILITY_DENIED', true);
        const personaScope = scope.filter(permission => persona.permissions.includes(permission));
        const personaContext = deepFreeze({
          classification: 'SYNTHETIC_ONLY',
          ...(personaScope.includes('public.read') && context.public ? { public: context.public } : {}),
          ...(personaScope.includes('household.read') && context.household ? { household: context.household } : {}),
        });
        const adapter = adapters?.[persona.adapterId];
        const unavailable = () => {
          scope = []; dissent = []; proposal = null;
          personaResults = [{ personaId: persona.personaId, characterVersion: persona.characterVersion, status: 'UNAVAILABLE', recommendation: 'PAUSE', message: ERROR_MESSAGES.PERSONA_UNAVAILABLE, contextKeys: [] }];
          return finish('REVIEW_REQUIRED', 'PERSONA_UNAVAILABLE');
        };
        if (typeof adapter !== 'function') return unavailable();
        let timer;
        try {
          const result = await Promise.race([
            Promise.resolve().then(() => adapter(deepFreeze({ persona: clone(persona), action, context: personaContext, identity: { ...trustedContext } }))),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PERSONA_TIMEOUT')), persona.timeoutMs); }),
          ]);
          if (!validateWithSchema(adapterOutputSchema, result).valid || result.contextKeys.some(key => !(key in personaContext))) throw new Error('PERSONA_OUTPUT_INVALID');
          personaResults.push({ personaId: persona.personaId, characterVersion: persona.characterVersion, status: 'ADVISORY', ...clone(result) });
        } catch { return unavailable(); }
        finally { clearTimeout(timer); }
      }
      checked = await gate();
      if (checked.type) return finish(checked.type, checked.code, true);
      if (canonicalJSON(checked.scope) !== canonicalJSON(scope) || checked.action !== action) return finish('REVIEW_REQUIRED', 'CONSENT_CHANGED_DURING_RUN', true);
      const votes = personaResults.filter(persona => persona.recommendation === 'READ_ONLY').length;
      dissent = personaResults.filter(persona => persona.recommendation !== 'READ_ONLY').map(persona => ({ personaId: persona.personaId, message: persona.message }));
      if (action === 'PROPOSE') proposal = { recommendation: votes >= 2 ? 'READ_ONLY' : 'PAUSE', votes, adoptedInternallyOnly: true, grantsAuthority: false };
      if (dissent.length) return finish('REVIEW_REQUIRED', 'PERSONA_DISSENT');
      if (offline) return finish('OFFLINE_READ_ONLY');
      if (action !== request.what) note('PUBLIC_READ_ONLY_FALLBACK');
      return finish(action === 'EXPLAIN' ? 'EXPLANATION' : action === 'PROPOSE' ? 'PROPOSAL' : 'READ_RESULT');
    } catch { state.freshness = 'STALE'; return finish('REVIEW_REQUIRED', 'RUNTIME_GATE_UNAVAILABLE', true); }
  }

  return Object.freeze({
    run(input) {
      // Snapshot before queueing; callers cannot mutate a queued request.
      let snapshot;
      try { snapshot = clone(input); } catch { snapshot = null; }
      const task = queue.then(() => process(snapshot));
      queue = task.catch(() => undefined);
      return task;
    },
    journal: Object.freeze({ entries: () => journal.entries(), verify: () => journal.verify() }),
    history() { return deepFreeze(clone(history)); },
  });
}
