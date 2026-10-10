import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  GUARD_ROLES,
  createBrigadeReferenceGate,
  referenceSigningBytes,
  referenceContractDigest,
  referenceEnvelopeDigest,
  referenceAdmissionDigest,
  referenceEvidenceSetDigest
} from '../brigade-evidence.mjs';

export const FIXED_NOW = '2026-10-10T10:00:00.000Z';
const SIDES = ['SENDER', 'RECEIVER'];
const SIGNED_VERSION = '6ri9ade-signed-reference/0.1';
const hash = value => createHash('sha256').update(value).digest('hex');

/**
 * Explicitly synthetic signing fixtures. Keys are created in process memory,
 * never written to files, and confer no production identity or authority.
 * The object is intentionally mutable so tests can simulate hostile input and
 * independently changed trusted state. Only public keys enter the snapshot.
 */
export function makeBrigadeFixture({
  checkpoint = 'SERVICE_COMMIT',
  final = false,
  now = FIXED_NOW
} = {}) {
  const design = JSON.parse(readFileSync(new URL('../brigade-specialties.json', import.meta.url), 'utf8'));
  const request = {
    schemaVersion: '6ri9ade-transfer-reference/0.1',
    id: 'synthetic-request-001',
    challengeId: 'synthetic-challenge-001',
    sender: {
      accountId: 'synthetic-sender', deviceId: 'synthetic-sender-device',
      tenantId: 'synthetic-sender-tenant', worldId: 'synthetic-sender-world',
      citadelId: 'synthetic-sender-citadel', keyVersion: 'synthetic-key-v1'
    },
    receiver: {
      accountId: 'synthetic-receiver', deviceId: 'synthetic-receiver-device',
      tenantId: 'synthetic-receiver-tenant', worldId: 'synthetic-receiver-world',
      citadelId: 'synthetic-receiver-citadel', keyVersion: 'synthetic-key-v1'
    },
    scope: ['chat:text'], policyVersion: 'synthetic-policy-v1',
    ppBindingVersion: 'synthetic-pp-v1', scriptieBindingVersion: 'synthetic-scriptie-v1',
    issuedAt: '2026-10-10T09:59:00.000Z',
    expiresAt: '2026-10-10T10:05:00.000Z'
  };
  const contractDigest = referenceContractDigest(request);
  const privateKeys = new Map();
  const issuers = [];
  for (const side of SIDES) {
    for (const roleCode of [...GUARD_ROLES, 'HUMAN_RECEIPT']) {
      const pair = generateKeyPairSync('ed25519');
      const id = 'synthetic:' + side + ':' + roleCode;
      privateKeys.set(id, pair.privateKey);
      const party = request[side.toLowerCase()];
      issuers.push({
        id, classification: 'SYNTHETIC_ONLY',
        publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }),
        side, roleCode,
        receiptStages: roleCode === 'HUMAN_RECEIPT'
          ? (side === 'SENDER' ? ['INITIATED', 'FINAL_ACCEPTED'] : ['NOVA_ADMITTED', 'FINAL_ACCEPTED'])
          : [],
        subjectAccountId: party.accountId, subjectDeviceId: party.deviceId,
        subjectKeyVersion: party.keyVersion, contextDigest: contractDigest,
        issuedAt: '2026-10-10T09:55:00.000Z',
        expiresAt: '2026-10-10T10:10:00.000Z',
        status: 'CURRENT'
      });
    }
  }
  const fixture = {
    classification: 'SYNTHETIC_ONLY', design, now,
    snapshot: {
      schemaVersion: '6ri9ade-trust-reference/0.1', classification: 'SYNTHETIC_ONLY',
      revision: 'synthetic-snapshot-v1', checkpoint,
      expectedRequest: structuredClone(request),
      observedAt: '2026-10-10T09:59:59.000Z',
      expiresAt: '2026-10-10T10:00:20.000Z',
      challengeState: 'CURRENT', contactState: 'CURRENT',
      revokedEnvelopeIds: [], issuers
    },
    input: { request, initiation: null, novaAdmission: null, evidence: [], finalReceipts: [] },
    privateKeys,
    signBody(body, privateKey = privateKeys.get(body.issuerId)) {
      if (!privateKey) throw new Error('SYNTHETIC_FIXTURE_KEY_NOT_FOUND');
      return {
        algorithm: 'Ed25519',
        body: structuredClone(body),
        signature: sign(null, referenceSigningBytes(body), privateKey).toString('base64url')
      };
    },
    resign(envelope, changes = {}, privateKey = privateKeys.get(envelope.body.issuerId)) {
      return this.signBody({ ...structuredClone(envelope.body), ...changes }, privateKey);
    },
    replaceEvidence(index, changes = {}, { rebuildFinal = false } = {}) {
      this.input.evidence[index] = this.resign(this.input.evidence[index], changes);
      if (rebuildFinal) this.finalize();
      return this.input.evidence[index];
    },
    finalize(changes = {}) {
      const admissionDigest = referenceAdmissionDigest(this.input.initiation, this.input.novaAdmission);
      const evidenceSetDigest = referenceEvidenceSetDigest(this.input.evidence);
      this.input.finalReceipts = SIDES.map(side => this.signBody({
        schemaVersion: SIGNED_VERSION, type: 'HUMAN_RECEIPT',
        id: 'synthetic-final-' + side.toLowerCase(),
        issuerId: 'synthetic:' + side + ':HUMAN_RECEIPT', side,
        contractDigest: referenceContractDigest(this.input.request),
        admissionDigest, stage: 'FINAL_ACCEPTED', evidenceSetDigest,
        issuedAt: '2026-10-10T09:59:20.000Z',
        expiresAt: '2026-10-10T10:01:00.000Z',
        ...(changes[side] ?? {})
      }));
      return this.input.finalReceipts;
    },
    gate(options = {}) {
      return createBrigadeReferenceGate({
        design: this.design,
        loadSnapshot: () => this.snapshot,
        now: () => this.now,
        ...options
      });
    },
    evaluate(options = {}) { return this.gate(options).evaluate(this.input); }
  };
  fixture.input.initiation = fixture.signBody({
    schemaVersion: SIGNED_VERSION, type: 'HUMAN_RECEIPT',
    id: 'synthetic-initiation', issuerId: 'synthetic:SENDER:HUMAN_RECEIPT', side: 'SENDER',
    contractDigest, admissionDigest: null, stage: 'INITIATED', evidenceSetDigest: null,
    issuedAt: '2026-10-10T09:59:02.000Z', expiresAt: '2026-10-10T10:04:00.000Z'
  });
  fixture.input.novaAdmission = fixture.signBody({
    schemaVersion: SIGNED_VERSION, type: 'HUMAN_RECEIPT',
    id: 'synthetic-nova-admission', issuerId: 'synthetic:RECEIVER:HUMAN_RECEIPT', side: 'RECEIVER',
    contractDigest, admissionDigest: referenceEnvelopeDigest(fixture.input.initiation),
    stage: 'NOVA_ADMITTED', evidenceSetDigest: null,
    issuedAt: '2026-10-10T09:59:04.000Z', expiresAt: '2026-10-10T10:04:00.000Z'
  });
  const admissionDigest = referenceAdmissionDigest(fixture.input.initiation, fixture.input.novaAdmission);
  for (const side of SIDES) for (const roleCode of GUARD_ROLES) {
    fixture.input.evidence.push(fixture.signBody({
      schemaVersion: SIGNED_VERSION, type: 'GUARD_ATTESTATION',
      id: 'synthetic-evidence-' + side.toLowerCase() + '-' + roleCode,
      issuerId: 'synthetic:' + side + ':' + roleCode,
      side, roleCode, checkpoint, contractDigest, admissionDigest,
      status: 'PASS', evidenceDigest: hash('SYNTHETIC_ONLY:' + checkpoint + ':' + side + ':' + roleCode),
      issuedAt: '2026-10-10T09:59:10.000Z', expiresAt: '2026-10-10T10:01:00.000Z'
    }));
  }
  if (final) fixture.finalize();
  return fixture;
}
