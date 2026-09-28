import { digest } from '../citadel-proof/proof.mjs';
import { LocalRegistry, verifySignature } from './registry.mjs';
import { ConfinedStore } from './storage.mjs';
import { PreviewAdapter, renderIsolatedPreview } from './preview.mjs';
import { trustDigest } from './trust-registry.mjs';
import { VERSION, OPEN_GATES, id, requireContract as check, validateEnvelope, signedPayload, denied } from '../contracts/atelier-registration-v1/contract.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const iso = value => new Date(value).toISOString();

function normalizeTrust(value) {
  check(value && Number.isSafeInteger(value.generation) && value.generation >= 1, 'TRUST_EPOCH_INVALID');
  check(Array.isArray(value.bindings) && Array.isArray(value.revoked_keys) && Array.isArray(value.revoked_grants), 'TRUST_SNAPSHOT_INVALID');
  const snapshot = structuredClone(value);
  snapshot.previous_digest ??= null;
  const computed = trustDigest(snapshot);
  if (snapshot.registry_digest !== undefined) check(snapshot.registry_digest === computed && hex(snapshot.registry_digest), 'TRUST_DIGEST_INVALID');
  else snapshot.registry_digest = computed;
  return snapshot;
}

function trustRelation(pinned, current) {
  if (current.generation < pinned.generation) check(false, 'TRUST_ROLLBACK');
  if (current.generation === pinned.generation && current.registry_digest !== pinned.registry_digest) check(false, 'TRUST_CONFLICT');
  if (current.generation > pinned.generation) check(false, 'TRUST_CHANGED');
}

function latestTime(records) {
  const values = records.flatMap(record => {
    const event = record.event;
    return event.type === 'CONTRACT_PREVIEW_COMMITTED' ? [Date.parse(event.evaluatedAt)] : event.type === 'TEMPORAL_OBSERVED' ? [Date.parse(event.observedAt)] : [];
  }).filter(Number.isFinite);
  return values.length ? Math.max(...values) : -Infinity;
}

function shouldObserve(code) {
  return ['GRANT_EXPIRED', 'CLOCK_ROLLBACK', 'TEMPORAL_UNCERTAIN'].includes(code);
}

function idempotencyKey(envelope, grant, era, supplied) {
  return supplied || digest({ contract_digest: digest(envelope), grant_id: grant?.grant_id || null, era_digest: era ? digest(era) : null });
}

function makeTemporal(principal, citadelId, now, trust, reason) {
  const observedAt = iso(now);
  return {
    type: 'TEMPORAL_OBSERVED', subjectId: principal.maker_id, actorId: principal.user_id, citadelId,
    evidenceSha256: digest({ observedAt, trustGeneration: trust.generation, trustDigest: trust.registry_digest, reason }),
    observedAt, trustGeneration: trust.generation, trustDigest: trust.registry_digest, reason
  };
}

function assetRoot(envelope) { return digest(envelope.asset_digests); }

function makeReceipt({ principal, envelope, grant, era, trust, contractDigest, sequence, idempotency }) {
  return {
    schema_version: VERSION,
    outcome: 'ALLOW_FOR_PREVIEW_ONLY',
    code: 'OK',
    tenant_id: principal.tenant_id,
    project_id: principal.project_id,
    maker_id: principal.maker_id,
    user_id: principal.user_id,
    citadel_id: envelope.citadel_id,
    action: 'PREVIEW',
    scope: envelope.project_id,
    contract_digest: contractDigest,
    template_id: envelope.template_id,
    template_version: envelope.template_version,
    payload_digest: envelope.payload_digest,
    asset_root: assetRoot(envelope),
    audit_head: envelope.audit_head,
    registration_sequence: sequence,
    grant_id: grant.grant_id,
    grant_state: 'ACTIVE',
    era_evidence_ref: digest(era.evidence),
    trust_generation: trust.generation,
    trust_digest: trust.registry_digest,
    trust_previous_digest: trust.previous_digest,
    idempotency_key: idempotency,
    preview_state: 'PREVIEW_AVAILABLE',
    feature_flag_state: 'PREVIEW_ONLY_ENABLED',
    activation_gates: [...OPEN_GATES]
  };
}

function assertReceipt(record, principal, envelope, grant, era, trust) {
  const event = record.event;
  const receipt = event.receipt;
  check(event.type === 'CONTRACT_PREVIEW_COMMITTED' && event.lifecycle?.state === 'RECEIPT_COMMITTED', 'STORAGE_INCONSISTENT');
  check(receipt?.schema_version === VERSION && receipt.outcome === 'ALLOW_FOR_PREVIEW_ONLY' && receipt.code === 'OK', 'RECEIPT_SEMANTIC_MISMATCH');
  for (const [key, expected] of Object.entries({
    tenant_id: principal.tenant_id, project_id: principal.project_id, maker_id: principal.maker_id,
    user_id: principal.user_id, citadel_id: envelope.citadel_id, action: 'PREVIEW', scope: envelope.project_id,
    contract_digest: event.contractDigest, template_id: envelope.template_id, template_version: envelope.template_version,
    payload_digest: envelope.payload_digest, asset_root: assetRoot(envelope), audit_head: envelope.audit_head,
    grant_id: grant.grant_id, grant_state: 'ACTIVE', era_evidence_ref: digest(era.evidence),
    trust_generation: trust.generation, trust_digest: trust.registry_digest, trust_previous_digest: trust.previous_digest,
    idempotency_key: event.idempotencyKey, preview_state: 'PREVIEW_AVAILABLE', feature_flag_state: 'PREVIEW_ONLY_ENABLED'
  })) check(receipt[key] === expected, 'RECEIPT_SEMANTIC_MISMATCH');
  check(receipt.registration_sequence === record.sequence && event.registrationSequence === record.sequence, 'RECEIPT_SEQUENCE_MISMATCH');
  check(Array.isArray(receipt.activation_gates) && JSON.stringify(receipt.activation_gates) === JSON.stringify(OPEN_GATES), 'ACTIVATION_GATE_MISMATCH');
  check(digest(receipt) === event.evidenceSha256, 'RECEIPT_DIGEST_MISMATCH');
  check(event.envelope && digest(event.envelope) === digest(envelope) && event.grant && digest(event.grant) === digest(grant) && event.era && digest(event.era) === digest(era), 'RECEIPT_INPUT_MISMATCH');
  return receipt;
}

// Feature-gated local operator adapter. authenticate/readTrust are trusted configuration,
// not caller-controlled claims. Production identity and tenant admission remain disabled.
export class ContractGateway {
  constructor({ root, allowedRoot, enabled = false, authenticate, readTrust, trustRootKey, clock = () => new Date().toISOString(), fault = async () => {} }) {
    this.store = new ConfinedStore(root, allowedRoot); this.enabled = enabled;
    this.authenticate = authenticate; this.readTrust = readTrust; this.trustRootKey = trustRootKey; this.clock = clock; this.fault = fault;
  }
  async context(session) {
    check(this.enabled === true, 'FEATURE_DISABLED');
    const principal = await this.authenticate(session);
    check(principal?.assurance === 'LOCAL_OPERATOR', 'IDENTITY_UNRESOLVED');
    for (const key of ['tenant_id', 'project_id', 'maker_id', 'user_id']) check(id(principal[key]), 'IDENTITY_UNRESOLVED');
    return Object.freeze({ ...principal });
  }
  async registry(principal) {
    const root = await this.store.directory(['tenants', principal.tenant_id, 'projects', principal.project_id], true);
    return new LocalRegistry(root, { allowedRoot: this.store.root, clock: this.clock, fault: this.fault });
  }
  async trustedSnapshot() {
    try { return normalizeTrust(await this.readTrust()); }
    catch (error) { if (error.code) throw error; throw Object.assign(new Error('TRUST_REGISTRY_UNAVAILABLE'), { code: 'TRUST_REGISTRY_UNAVAILABLE' }); }
  }
  binding(snapshot, keyId, purpose, principal, now) {
    check(snapshot && Number.isSafeInteger(snapshot.generation) && Array.isArray(snapshot.bindings) && Array.isArray(snapshot.revoked_keys) && Array.isArray(snapshot.revoked_grants), 'KEY_BINDING_UNKNOWN');
    const records = snapshot.bindings.filter(b => b.key_id === keyId);
    check(records.length === 1, 'KEY_BINDING_UNKNOWN');
    const b = records[0];
    check(verifySignature(signedPayload('KEY_BINDING', b), b.signature, this.trustRootKey), 'KEY_BINDING_UNTRUSTED');
    check(b.status === 'ACTIVE' && !snapshot.revoked_keys.includes(keyId), 'KEY_REVOKED');
    check(b.tenant_id === principal.tenant_id && b.project_id === principal.project_id && b.purpose === purpose && b.allowed_makers?.includes(principal.maker_id) && id(b.identity_id) && hex(b.authority_evidence), 'KEY_SCOPE');
    check(Date.parse(b.not_before) <= now && now < Date.parse(b.expires_at), 'KEY_EXPIRED');
    return b;
  }
  validate(envelope, grant, era, principal, snapshot, now, latestExport = 0) {
    const project = validateEnvelope(envelope, principal), contractDigest = digest(envelope);
    check(Number.isFinite(now), 'CLOCK_UNKNOWN');
    check(grant, 'GRANT_MISSING');
    const issuer = this.binding(snapshot, grant.key_id, 'PREVIEW_ISSUER', principal, now);
    check(verifySignature(signedPayload('GRANT', grant), grant.signature, issuer.public_key), 'GRANT_SIGNATURE');
    check(grant.tenant_id === principal.tenant_id && grant.project_id === principal.project_id && grant.maker_id === principal.maker_id && grant.user_id === principal.user_id && grant.citadel_id === envelope.citadel_id && grant.action === 'PREVIEW' && grant.contract_digest === contractDigest && id(grant.grant_id), 'GRANT_SCOPE');
    check(!snapshot.revoked_grants.includes(grant.grant_id), 'GRANT_REVOKED');
    check(Date.parse(grant.not_before) <= now && now < Date.parse(grant.expires_at), 'GRANT_EXPIRED');
    check(era, 'ERA_MISSING');
    const witness = this.binding(snapshot, era.key_id, 'ERA_WITNESS', principal, now);
    check(verifySignature(signedPayload('ERA', era), era.signature, witness.public_key), 'ERA_SIGNATURE');
    check(era.tenant_id === principal.tenant_id && era.project_id === principal.project_id && era.contract_digest === contractDigest && era.evidence?.keyId === era.key_id, 'ERA_SCOPE');
    const verifier = new PreviewAdapter({ clock: () => new Date(now).toISOString() }, { makerId: principal.maker_id, eraKeys: { [era.key_id]: witness.public_key } });
    try { verifier.validate(envelope.package, era.evidence, latestExport); }
    catch (error) {
      const text = error.message;
      const code = text.includes('replay') ? 'REPLAY' : text.includes('template') ? 'TEMPLATE_MISMATCH' : text.includes('ERA') ? 'ERA_INVALID' : 'EXPORT_INVALID';
      throw Object.assign(error, { code });
    }
    return { project, contractDigest };
  }
  async appendTemporalIfAdvancing(tx, principal, citadelId, now, trust, reason) {
    const high = latestTime(tx.records);
    if (Number.isFinite(now) && now > high) await tx.append(makeTemporal(principal, citadelId, now, trust, reason));
  }
  async commit(session, request) {
    let committed = false;
    try {
      const principal = await this.context(session);
      const { envelope, grant, era, expected_sequence, idempotency_key } = structuredClone(request || {});
      validateEnvelope(envelope, principal);
      check(Number.isSafeInteger(expected_sequence) && expected_sequence >= 0, 'SEQUENCE_CONFLICT');
      const pinned = await this.trustedSnapshot();
      const registry = await this.registry(principal);
      return await registry.transaction(envelope.citadel_id, async tx => {
        const now = Date.parse(this.clock()); check(Number.isFinite(now), 'CLOCK_UNKNOWN');
        check(now >= latestTime(tx.records), 'CLOCK_ROLLBACK');
        const idem = idempotencyKey(envelope, grant, era, idempotency_key);
        const previous = tx.records.filter(r => r.event.type === 'CONTRACT_PREVIEW_COMMITTED');
        const existing = previous.find(r => r.event.idempotencyKey === idem);
        const current = await this.trustedSnapshot();
        trustRelation(pinned, current);
        if (existing) {
          const receipt = assertReceipt(existing, principal, envelope, grant, era, current);
          return { ...receipt, record_hash: existing.recordHash, sequence: existing.sequence };
        }
        check(!previous.some(r => r.event.contractDigest === digest(envelope)), 'REPLAY');
        check(tx.records.length === expected_sequence, 'SEQUENCE_CONFLICT');
        check(previous.every(r => r.event.subjectId === principal.maker_id && r.event.envelope.tenant_id === principal.tenant_id && r.event.envelope.project_id === principal.project_id), 'OBJECT_OWNER_CONFLICT');
        let validated;
        try {
          validated = this.validate(envelope, grant, era, principal, current, now, Math.max(0, ...previous.map(r => r.event.envelope.package.manifest.exportSequence)));
        } catch (error) {
          if (shouldObserve(error.code)) await this.appendTemporalIfAdvancing(tx, principal, envelope.citadel_id, now, current, error.code);
          throw error;
        }
        const fresh = await this.trustedSnapshot(); trustRelation(current, fresh);
        const sequence = tx.records.length + 1;
        const idemReceipt = makeReceipt({ principal, envelope, grant, era, trust: fresh, contractDigest: validated.contractDigest, sequence, idempotency: idem });
        const event = {
          type: 'CONTRACT_PREVIEW_COMMITTED', subjectId: principal.maker_id, actorId: principal.user_id, citadelId: envelope.citadel_id,
          evidenceSha256: digest(idemReceipt), contractDigest: validated.contractDigest, evaluatedAt: iso(now), envelope, grant, era,
          receipt: idemReceipt, idempotencyKey: idem, registrationSequence: sequence, trustGeneration: fresh.generation, trustDigest: fresh.registry_digest,
          lifecycle: { state: 'RECEIPT_COMMITTED', preview: 'PREVIEW_AVAILABLE' }
        };
        const record = await tx.append(event);
        committed = true;
        await this.fault('after-contract-commit');
        trustRelation(fresh, await this.trustedSnapshot());
        assertReceipt(record, principal, envelope, grant, era, fresh);
        return { ...idemReceipt, record_hash: record.recordHash, sequence: record.sequence };
      });
    } catch (error) { return denied(error.code || (committed ? 'COMMIT_OUTCOME_UNKNOWN' : 'STORAGE_INCONSISTENT')); }
  }
  async preview(session, { tenant_id, project_id, citadel_id, contract_digest }) {
    try {
      const principal = await this.context(session);
      check(tenant_id === principal.tenant_id && project_id === principal.project_id && id(citadel_id), 'TENANT_PROJECT_MISMATCH');
      const registry = await this.registry(principal);
      return await registry.transaction(citadel_id, async tx => {
        const eventRecord = tx.records.filter(r => r.event.type === 'CONTRACT_PREVIEW_COMMITTED').at(-1);
        check(eventRecord && eventRecord.event.contractDigest === contract_digest, 'UNKNOWN_REGISTRATION');
        const e = eventRecord.event, now = Date.parse(this.clock()); check(Number.isFinite(now), 'CLOCK_UNKNOWN');
        check(now >= latestTime(tx.records), 'CLOCK_ROLLBACK');
        const trust = await this.trustedSnapshot();
        trustRelation({ generation: e.trustGeneration, registry_digest: e.trustDigest }, trust);
        let validated;
        try { validated = this.validate(e.envelope, e.grant, e.era, principal, trust, now); }
        catch (error) {
          if (shouldObserve(error.code)) await this.appendTemporalIfAdvancing(tx, principal, citadel_id, now, trust, error.code);
          throw error;
        }
        check(validated.contractDigest === e.contractDigest, 'RECEIPT_INPUT_MISMATCH');
        const receipt = assertReceipt(eventRecord, principal, e.envelope, e.grant, e.era, trust);
        trustRelation(trust, await this.trustedSnapshot());
        await this.appendTemporalIfAdvancing(tx, principal, citadel_id, now, trust, 'PREVIEW_READ');
        return { ...receipt, evaluated_trust_generation: trust.generation, record_hash: eventRecord.recordHash, sequence: eventRecord.sequence, ...renderIsolatedPreview(validated.project, eventRecord.recordHash) };
      });
    } catch (error) { return denied(error.code || 'STORAGE_INCONSISTENT'); }
  }
}
