import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { makeBrigadeFixture, FIXED_NOW } from './test-support/brigade-fixtures.mjs';
import {
  referenceSigningBytes,
  referenceContractDigest,
  referenceEvidenceSetDigest
} from './brigade-evidence.mjs';

const OTHER_DIGEST = 'f'.repeat(64);

function noEffects(result) {
  assert.equal(result.mode, 'REFERENCE_ONLY');
  assert.equal(result.classification, 'SYNTHETIC_ONLY');
  assert.equal(result.canOpenContact, false);
  assert.equal(result.operativeAuthority, 'NONE');
  assert.equal(result.runtimeConnected, false);
  assert.equal(result.externalSideEffect, false);
  assert.equal(result.replayStateConsumed, false);
}
function held(result) {
  assert.equal(result.safetyVerdict, 'HOLD');
  assert.equal(result.contactEligibility, 'HOLD');
  assert.equal(result.evidenceSetDigest, null);
  noEffects(result);
}
function finalPending(result) {
  assert.equal(result.safetyVerdict, 'REFERENCE_ALL_PASS');
  assert.equal(result.contactEligibility, 'READY_FOR_FINAL_CONFIRMATION');
  noEffects(result);
}
function issuerFor(fixture, envelope = fixture.input.evidence[0]) {
  return fixture.snapshot.issuers.find(item => item.id === envelope.body.issuerId);
}

test('all 18 signed role outputs reach a final-human gate, never contact access', () => {
  const fixture = makeBrigadeFixture();
  assert.equal(fixture.classification, 'SYNTHETIC_ONLY');
  assert.equal(fixture.input.evidence.length, 18);
  const result = fixture.evaluate();
  finalPending(result);
  assert.equal(result.controls.length, 9);
  assert.ok(result.controls.every(item => item.sender === 'PASS' && item.receiver === 'PASS'));
  assert.equal(result.evidenceSetDigest, referenceEvidenceSetDigest(fixture.input.evidence));
});

test('two exact signed human confirmations satisfy only the synthetic reference gate', () => {
  const fixture = makeBrigadeFixture({ final: true });
  const result = fixture.evaluate();
  assert.equal(result.contactEligibility, 'REFERENCE_GATE_SATISFIED');
  assert.equal(result.safetyVerdict, 'REFERENCE_ALL_PASS');
  noEffects(result);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.controls));
  assert.ok(result.controls.every(Object.isFrozen));
  assert.throws(() => { result.controls[0].sender = 'FAIL'; }, TypeError);
});

test('signed evidence order cannot alter the bound set or invalidate exact confirmations', () => {
  const fixture = makeBrigadeFixture({ final: true });
  const digest = referenceEvidenceSetDigest(fixture.input.evidence);
  fixture.input.evidence.reverse();
  const result = fixture.evaluate();
  assert.equal(result.evidenceSetDigest, digest);
  assert.equal(result.contactEligibility, 'REFERENCE_GATE_SATISFIED');
  noEffects(result);
});

test('one missing receiver control cannot be hidden by final confirmations', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.evidence.pop();
  held(fixture.evaluate());
});

test('duplicate attestations cannot fill a missing specialty slot', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.evidence[17] = structuredClone(fixture.input.evidence[0]);
  held(fixture.evaluate());
});

test('same evidence ID in two signed specialty slots is rejected', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.replaceEvidence(1, { id: fixture.input.evidence[0].body.id }, { rebuildFinal: true });
  held(fixture.evaluate());
});

test('a valid signed failure dominates missing or duplicated other slots', () => {
  const fixture = makeBrigadeFixture();
  fixture.replaceEvidence(0, { status: 'FAIL' });
  fixture.input.evidence = [fixture.input.evidence[0], structuredClone(fixture.input.evidence[0])];
  const result = fixture.evaluate();
  assert.equal(result.safetyVerdict, 'STOP');
  assert.equal(result.contactEligibility, 'STOP');
  assert.ok(result.reasonCodes.includes('AUTHENTICATED_GUARD_FAILURE'));
  noEffects(result);
});

test('an attacker changing PASS to FAIL cannot cause an authenticated rejection', () => {
  const fixture = makeBrigadeFixture();
  fixture.input.evidence[0].body.status = 'FAIL';
  const result = fixture.evaluate();
  held(result);
  assert.ok(!result.reasonCodes.includes('AUTHENTICATED_GUARD_FAILURE'));
});

test('even a signed failure for another contract is not a failure for this request', () => {
  const fixture = makeBrigadeFixture();
  fixture.replaceEvidence(0, { status: 'FAIL', contractDigest: OTHER_DIGEST });
  held(fixture.evaluate());
});

test('signed UNKNOWN is uncertainty, never an implied passing control', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.replaceEvidence(0, { status: 'UNKNOWN' }, { rebuildFinal: true });
  held(fixture.evaluate());
});

test('tampering with a signed evidence digest fails real signature verification', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.evidence[0].body.evidenceDigest = OTHER_DIGEST;
  held(fixture.evaluate());
});

test('client PASS objects without envelopes or signatures confer no trust', () => {
  const fixture = makeBrigadeFixture();
  fixture.input.evidence = fixture.input.evidence.map(item => ({
    body: structuredClone(item.body), status: 'PASS', humanConfirmed: true
  }));
  held(fixture.evaluate());
});

test('a different Ed25519 private key cannot impersonate a registered signer', () => {
  const fixture = makeBrigadeFixture();
  const impostor = generateKeyPairSync('ed25519');
  fixture.input.evidence[0] = fixture.resign(fixture.input.evidence[0], {}, impostor.privateKey);
  held(fixture.evaluate());
});

test('a valid signature under an unknown issuer cannot enroll that issuer', () => {
  const fixture = makeBrigadeFixture();
  fixture.input.evidence[0] = fixture.resign(fixture.input.evidence[0], { issuerId: 'synthetic-unknown' });
  held(fixture.evaluate());
});

test('ambiguous signer registry entries cannot establish authority', () => {
  const fixture = makeBrigadeFixture();
  fixture.snapshot.issuers.push(structuredClone(issuerFor(fixture)));
  held(fixture.evaluate());
});

test('RSA public keys cannot be treated as Ed25519 evidence keys', () => {
  const fixture = makeBrigadeFixture();
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  issuerFor(fixture).publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  held(fixture.evaluate());
});

test('a private PEM is never accepted in the public signer registry', () => {
  const fixture = makeBrigadeFixture();
  const envelope = fixture.input.evidence[0];
  issuerFor(fixture).publicKeyPem = fixture.privateKeys.get(envelope.body.issuerId)
    .export({ type: 'pkcs8', format: 'pem' });
  held(fixture.evaluate());
});

test('changing the envelope algorithm cannot relax signature requirements', () => {
  const fixture = makeBrigadeFixture();
  fixture.input.evidence[0].algorithm = 'none';
  held(fixture.evaluate());
});

test('a signature without this reference protocol domain is not transferable', () => {
  const fixture = makeBrigadeFixture();
  const envelope = fixture.input.evidence[0];
  envelope.signature = sign(null, Buffer.from(JSON.stringify(envelope.body)),
    fixture.privateKeys.get(envelope.body.issuerId)).toString('base64url');
  held(fixture.evaluate());
});

for (const [label, changes] of [
  ['role', { roleCode: 'ADDRESS' }],
  ['side', { side: 'RECEIVER' }],
  ['checkpoint', { checkpoint: 'QUEUED_DELIVERY' }],
  ['contract', { contractDigest: OTHER_DIGEST }],
  ['admission', { admissionDigest: OTHER_DIGEST }]
]) {
  test('a correctly signed attestation with the wrong ' + label + ' cannot pass', () => {
    const fixture = makeBrigadeFixture({ final: true });
    fixture.replaceEvidence(0, changes, { rebuildFinal: true });
    held(fixture.evaluate());
  });
}

for (const [label, field, value] of [
  ['account', 'subjectAccountId', 'synthetic-other-account'],
  ['device', 'subjectDeviceId', 'synthetic-other-device'],
  ['device key version', 'subjectKeyVersion', 'synthetic-key-v2'],
  ['contract authorization', 'contextDigest', OTHER_DIGEST],
  ['role authorization', 'roleCode', 'ADDRESS'],
  ['side authorization', 'side', 'RECEIVER'],
  ['key status', 'status', 'REVOKED']
]) {
  test('trusted registry ' + label + ' mismatch invalidates otherwise signed evidence', () => {
    const fixture = makeBrigadeFixture({ final: true });
    issuerFor(fixture)[field] = value;
    held(fixture.evaluate());
  });
}

test('a modified WORLD cannot borrow the original trusted expected request', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.request.receiver.worldId = 'synthetic-other-world';
  held(fixture.evaluate());
});

test('updated trusted request still requires new receipts and context-bound signatures', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.request.policyVersion = 'synthetic-policy-v2';
  fixture.snapshot.expectedRequest = structuredClone(fixture.input.request);
  fixture.snapshot.issuers.forEach(item => { item.contextDigest = referenceContractDigest(fixture.input.request); });
  held(fixture.evaluate());
});

test('extra files or private-world scope cannot ride along with text consent', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.request.scope.push('private-world:read');
  fixture.snapshot.expectedRequest = structuredClone(fixture.input.request);
  held(fixture.evaluate());
});

for (const stage of ['initiation', 'novaAdmission']) {
  test('missing ' + stage + ' cannot be replaced by final confirmations', () => {
    const fixture = makeBrigadeFixture({ final: true });
    fixture.input[stage] = null;
    held(fixture.evaluate());
  });
}

test('humanConfirmed from request JSON does not replace authenticated human events', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.humanConfirmed = true;
  held(fixture.evaluate());
});

test('a guard signing key cannot impersonate the human receipt issuer', () => {
  const fixture = makeBrigadeFixture();
  const guard = fixture.input.evidence[0];
  fixture.input.initiation = fixture.resign(fixture.input.initiation,
    { issuerId: guard.body.issuerId }, fixture.privateKeys.get(guard.body.issuerId));
  held(fixture.evaluate());
});

test('NOVA admission must follow the sender initiation', () => {
  const fixture = makeBrigadeFixture();
  fixture.input.novaAdmission = fixture.resign(fixture.input.novaAdmission,
    { issuedAt: '2026-10-10T09:59:01.000Z' });
  held(fixture.evaluate());
});

test('NOVA admission binds the specific signed sender initiation', () => {
  const fixture = makeBrigadeFixture();
  fixture.input.novaAdmission = fixture.resign(fixture.input.novaAdmission,
    { admissionDigest: OTHER_DIGEST });
  held(fixture.evaluate());
});

test('safety evidence obtained before reception cannot bypass the first human gate', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.replaceEvidence(0, { issuedAt: '2026-10-10T09:59:03.000Z' }, { rebuildFinal: true });
  held(fixture.evaluate());
});

test('one final human is insufficient even when every guard passes', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.finalReceipts.pop();
  finalPending(fixture.evaluate());
});

test('two sender confirmations cannot replace the receiver final confirmation', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.finalReceipts[1] = fixture.resign(fixture.input.finalReceipts[0],
    { id: 'synthetic-second-sender-final' });
  finalPending(fixture.evaluate());
});

for (const [label, changes] of [
  ['contract', { contractDigest: OTHER_DIGEST }],
  ['admission', { admissionDigest: OTHER_DIGEST }],
  ['evidence set', { evidenceSetDigest: OTHER_DIGEST }],
  ['event order', { issuedAt: '2026-10-10T09:59:09.000Z' }],
  ['receipt ID', { id: 'synthetic-initiation' }]
]) {
  test('final human confirmation with the wrong ' + label + ' cannot satisfy the gate', () => {
    const fixture = makeBrigadeFixture({ final: true });
    fixture.input.finalReceipts[0] = fixture.resign(fixture.input.finalReceipts[0], changes);
    finalPending(fixture.evaluate());
  });
}

test('changed signed evidence invalidates old final consent until both humans rebind it', () => {
  const fixture = makeBrigadeFixture({ final: true });
  const oldDigest = referenceEvidenceSetDigest(fixture.input.evidence);
  fixture.replaceEvidence(0, { evidenceDigest: OTHER_DIGEST });
  assert.notEqual(referenceEvidenceSetDigest(fixture.input.evidence), oldDigest);
  finalPending(fixture.evaluate());
  fixture.finalize();
  const rebound = fixture.evaluate();
  assert.equal(rebound.contactEligibility, 'REFERENCE_GATE_SATISFIED');
  noEffects(rebound);
});

test('revoking one evidence ID invalidates the previously complete set', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.snapshot.revokedEnvelopeIds.push(fixture.input.evidence[0].body.id);
  held(fixture.evaluate());
});

for (const [label, changes] of [
  ['expiry boundary', { expiresAt: FIXED_NOW }],
  ['future issue time', { issuedAt: '2026-10-10T10:00:01.000Z' }],
  ['excessive evidence lifetime', {
    issuedAt: '2026-10-10T09:59:04.000Z', expiresAt: '2026-10-10T10:01:05.000Z'
  }]
]) {
  test(label + ' cannot be repaired by a valid signature', () => {
    const fixture = makeBrigadeFixture({ final: true });
    fixture.replaceEvidence(0, changes, { rebuildFinal: true });
    held(fixture.evaluate());
  });
}

test('a trust snapshot expiring at evaluation time cannot be cached as current', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.snapshot.expiresAt = FIXED_NOW;
  held(fixture.evaluate());
});

test('an asynchronous or failed trust loader cannot be treated as authoritative state', () => {
  const fixture = makeBrigadeFixture({ final: true });
  held(fixture.evaluate({ loadSnapshot: () => Promise.resolve(fixture.snapshot) }));
  held(fixture.evaluate({ loadSnapshot: () => { throw new Error('fixture unavailable'); } }));
});

test('a changed trust revision at the final check discards a previous passing conclusion', () => {
  const fixture = makeBrigadeFixture({ final: true });
  let reads = 0;
  const result = fixture.evaluate({
    loadSnapshot: () => {
      reads += 1;
      return reads === 1 ? fixture.snapshot : { ...fixture.snapshot, revision: 'synthetic-snapshot-v2' };
    }
  });
  assert.equal(reads, 2);
  held(result);
  assert.ok(result.reasonCodes.includes('TRUST_OR_RIGHTS_CHANGED'));
});

test('revocation between initial and final trusted reads stops reference eligibility', () => {
  const fixture = makeBrigadeFixture({ final: true });
  let reads = 0;
  held(fixture.evaluate({
    loadSnapshot: () => ++reads === 1 ? fixture.snapshot : { ...fixture.snapshot, contactState: 'REVOKED' }
  }));
});

test('expiry during evaluation cannot return a still-valid reference result', () => {
  const fixture = makeBrigadeFixture({ final: true });
  let times = 0;
  held(fixture.evaluate({ now: () => ++times === 1 ? FIXED_NOW : fixture.snapshot.expiresAt }));
});

test('a clock moving backwards cannot preserve reference eligibility', () => {
  const fixture = makeBrigadeFixture({ final: true });
  let times = 0;
  held(fixture.evaluate({
    now: () => ++times === 1 ? FIXED_NOW : '2026-10-10T09:59:59.000Z'
  }));
});

test('a consumed challenge cannot be replayed to obtain another eligibility conclusion', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.snapshot.challengeState = 'CONSUMED';
  held(fixture.evaluate());
});

for (const state of ['BLOCKED', 'REVOKED', 'EXPIRED']) {
  test(state + ' trusted contact rights produce STOP without opening contact', () => {
    const fixture = makeBrigadeFixture({ final: true });
    fixture.snapshot.contactState = state;
    const result = fixture.evaluate();
    assert.equal(result.contactEligibility, 'STOP');
    noEffects(result);
  });
}

test('unknown trusted contact rights remain on HOLD', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.snapshot.contactState = 'UNKNOWN';
  held(fixture.evaluate());
});

test('commit evidence and final confirmations cannot be replayed at queued delivery', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.snapshot.checkpoint = 'QUEUED_DELIVERY';
  held(fixture.evaluate());
});

test('queued delivery has its own context-bound reference evidence and human receipts', () => {
  const fixture = makeBrigadeFixture({ checkpoint: 'QUEUED_DELIVERY', final: true });
  const result = fixture.evaluate();
  assert.equal(result.checkpoint, 'QUEUED_DELIVERY');
  assert.equal(result.contactEligibility, 'REFERENCE_GATE_SATISFIED');
  noEffects(result);
});

test('repeated evaluation has no effects, but later consumption invalidates the same input', () => {
  const fixture = makeBrigadeFixture({ final: true });
  const gate = fixture.gate();
  const before = structuredClone(fixture.snapshot);
  const first = gate.evaluate(fixture.input);
  const second = gate.evaluate(fixture.input);
  assert.deepEqual(second, first);
  assert.deepEqual(fixture.snapshot, before);
  noEffects(first);
  noEffects(second);
  fixture.snapshot.challengeState = 'CONSUMED';
  held(gate.evaluate(fixture.input));
});

test('a queued delivery cannot reuse commit evidence even after final digests are rebuilt', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.snapshot.checkpoint = 'QUEUED_DELIVERY';
  fixture.finalize();
  held(fixture.evaluate());
});

test('private injected fields are neither accepted as evidence nor reflected in the result', () => {
  const fixture = makeBrigadeFixture({ final: true });
  fixture.input.evidence[0].body.privateReason = 'SYNTHETIC_PRIVATE_DO_NOT_DISCLOSE';
  fixture.input.evidence[0].body.messagePlaintext = 'SYNTHETIC_PLAINTEXT_DO_NOT_DISCLOSE';
  const result = fixture.evaluate();
  held(result);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('SYNTHETIC_PRIVATE_DO_NOT_DISCLOSE'));
  assert.ok(!serialized.includes('SYNTHETIC_PLAINTEXT_DO_NOT_DISCLOSE'));
});

test('fixture signatures use public-only trust state and domain-separated signing bytes', () => {
  const fixture = makeBrigadeFixture({ final: true });
  assert.ok(fixture.snapshot.issuers.every(item =>
    item.classification === 'SYNTHETIC_ONLY' && item.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')));
  assert.ok(!JSON.stringify(fixture.snapshot).includes('PRIVATE KEY'));
  assert.ok(referenceSigningBytes(fixture.input.evidence[0].body)
    .toString('utf8').startsWith('PALACO/6RI9ADE/REFERENCE-EVIDENCE/v0.1'));
});
