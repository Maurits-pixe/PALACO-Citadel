import { createHash } from 'node:crypto';
import { makeBrigadeFixture, FIXED_NOW } from './brigade-fixtures.mjs';
import { referenceContractDigest, referenceEnvelopeDigest, referenceAdmissionDigest } from '../brigade-evidence.mjs';

export { FIXED_NOW };
const hash = value => createHash('sha256').update(value).digest('hex');

/** Rebind synthetic signatures after an intentional host-context change. */
export function rebindRioEvidence(fixture, changes = {}) {
  Object.assign(fixture.input.request, structuredClone(changes));
  const contractDigest = referenceContractDigest(fixture.input.request);
  fixture.snapshot.expectedRequest = structuredClone(fixture.input.request);
  for (const issuer of fixture.snapshot.issuers) {
    const party = fixture.input.request[issuer.side.toLowerCase()];
    issuer.contextDigest = contractDigest;
    issuer.subjectAccountId = party.accountId;
    issuer.subjectDeviceId = party.deviceId;
    issuer.subjectKeyVersion = party.keyVersion;
  }
  const messageId = fixture.input.request.transferBinding.messageId;
  fixture.input.initiation = fixture.resign(fixture.input.initiation, {
    id: 'synthetic-init-' + messageId, contractDigest
  });
  fixture.input.novaAdmission = fixture.resign(fixture.input.novaAdmission, {
    id: 'synthetic-nova-' + messageId,
    contractDigest,
    admissionDigest: referenceEnvelopeDigest(fixture.input.initiation)
  });
  const admissionDigest = referenceAdmissionDigest(fixture.input.initiation, fixture.input.novaAdmission);
  fixture.input.evidence = fixture.input.evidence.map((envelope, index) => fixture.resign(envelope, {
    id: 'synthetic-evidence-' + messageId + '-' + index,
    checkpoint: fixture.snapshot.checkpoint, contractDigest, admissionDigest
  }));
  fixture.finalize({
    SENDER: { id: 'synthetic-final-sender-' + messageId },
    RECEIVER: { id: 'synthetic-final-receiver-' + messageId }
  });
  return fixture;
}

/**
 * A local-storage reference fixture, never a live identity or E2EE protocol.
 * Every key remains in process memory. The payload is deliberately opaque
 * synthetic bytes; this helper does not claim that these bytes are encrypted.
 */
export function makeRioOutboxFixture({
  messageId = 'synthetic-message-001',
  requestId = 'synthetic-request-001',
  idempotencyKey = 'synthetic-idempotency-001',
  opaquePayload = Buffer.from('SYNTHETIC_OPAQUE_BYTES').toString('base64url'),
  now = FIXED_NOW
} = {}) {
  const decoded = Buffer.from(opaquePayload, 'base64url');
  const message = {
    schemaVersion: 'rio-opaque-message-reference/0.1',
    classification: 'SYNTHETIC_ONLY',
    requestId, messageId, idempotencyKey, opaquePayload
  };
  const transferBinding = {
    messageId,
    payloadDigest: hash(decoded),
    payloadByteLength: decoded.length,
    payloadEncoding: 'base64url',
    idempotencyKey
  };
  function evidence(checkpoint) {
    const fixture = makeBrigadeFixture({ checkpoint, now });
    fixture.input.request.schemaVersion = '6ri9ade-transfer-reference/0.2';
    fixture.input.request.id = requestId;
    fixture.input.request.challengeId = 'synthetic-' + checkpoint.toLowerCase() + '-' + messageId;
    fixture.input.request.transferBinding = structuredClone(transferBinding);
    rebindRioEvidence(fixture);
    return fixture;
  }
  const commitEvidence = evidence('SERVICE_COMMIT');
  const deliveryEvidence = evidence('QUEUED_DELIVERY');
  const fixture = {
    message, transferBinding,
    classification: 'SYNTHETIC_ONLY',
    design: commitEvidence.design,
    now,
    commitEvidence,
    deliveryEvidence,
    loadEvidence(checkpoint) {
      const source = checkpoint === 'SERVICE_COMMIT' ? this.commitEvidence
        : checkpoint === 'QUEUED_DELIVERY' ? this.deliveryEvidence : null;
      if (!source) throw new Error('SYNTHETIC_CHECKPOINT_UNKNOWN');
      return { input: source.input, snapshot: source.snapshot };
    },
    options(databasePath, extra = {}) {
      return {
        databasePath,
        classification: 'SYNTHETIC_ONLY',
        design: this.design,
        loadEvidence: (checkpoint, proposedMessage) => this.loadEvidence(checkpoint, proposedMessage),
        now: () => this.now,
        ...extra
      };
    },
    advance(milliseconds = 1000) {
      this.now = new Date(Date.parse(this.now) + milliseconds).toISOString();
      this.commitEvidence.now = this.now;
      this.deliveryEvidence.now = this.now;
      return this.now;
    }
  };
  return fixture;
}
