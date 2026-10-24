import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMemory, answerQuestion, createDossier, disposeSessionDossier,
  grantDossierConsent, proposeHistoricalLearning, reviewLearningProposal,
  revokeDossierConsent, validateDossier,
} from '../../ambassades/rio/visitcard/engine.mjs';

const purpose = 'session-only personal question and answer';
const scopes = ['STORE_MEMORY', 'QUERY_MEMORY', 'PROPOSE_LEARNING', 'REVIEW_LEARNING'];
const disposed = {ok: true, authority_effect: 'NONE'};

function successful(result) {
  assert.equal(result.ok, true, result.errors?.join('\n'));
  return result.dossier;
}

function refused(result, pattern) {
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
  assert.equal(Object.hasOwn(result, 'dossier'), false);
  assert.equal(Object.hasOwn(result, 'result'), false);
  if (pattern) assert.match(result.errors.join('\n'), pattern);
}

function fixture(name) {
  let sequence = 0;
  const time = () => new Date(Date.UTC(2026, 9, 20) + sequence++ * 1000).toISOString();
  const owner = 'participant:unit:' + name;
  const input = {
    dossier_id: 'rio:dossier:' + name,
    identity_id: 'rio:identity:' + name,
    owner_participant_id: owner,
    purpose_scope: purpose,
    created_at: time(), record_id: name + '-created',
    source: 'unit-session-fixture', source_revision: '1',
  };
  const record = () => ({
    record_id: name + '-record-' + sequence,
    recorded_at: time(), actor_ref: owner,
    source: 'unit-session-fixture', source_revision: '1',
  });
  const consentId = name + '-consent';
  const proposalId = 'rio:learning:' + name + '-proposal';
  const secret = 'TST_PRIVATE_' + name + ': violet appointment is Tuesday.';
  const consent = at => ({
    consent_id: consentId, scope: scopes, purpose,
    valid_from: at, valid_until: null,
  });
  const memory = (at, content = secret) => ({
    memory_id: 'rio:memory:' + name + '-' + sequence,
    content, source_ref: 'user:unit-example', source_revision: '1',
    captured_at: at, purpose, sensitivity: 'PRIVATE', retention_until: null,
  });
  const question = at => ({
    question_id: 'rio:question:' + name + '-question-' + sequence,
    requester_participant_id: owner, purpose, asked_at: at,
    text: 'When is the violet appointment?',
  });
  const proposal = () => ({
    proposal_id: proposalId, content: 'TST_PRIVATE_' + name + ' learning example',
    source_ref: 'user:unit-example', source_revision: '1', purpose,
  });
  const grant = dossier => {
    const provenance = record();
    return grantDossierConsent(dossier, consent(provenance.recorded_at), provenance);
  };
  const remember = (dossier, content) => {
    const provenance = record();
    return addMemory(dossier, memory(provenance.recorded_at, content), provenance);
  };
  const answer = dossier => {
    const provenance = record();
    return answerQuestion(dossier, question(provenance.recorded_at), provenance);
  };
  const created = successful(createDossier(input));
  const populate = () => {
    let dossier = successful(grant(created));
    dossier = successful(remember(dossier));
    dossier = successful(proposeHistoricalLearning(dossier, proposal(), record()));
    return successful(answer(dossier));
  };
  return {input, created, record, consent, consentId, memory, question,
    proposal, proposalId, secret, grant, remember, answer, populate};
}

test('disposal is content-free and idempotent, reserves its ID and refuses all held-snapshot operations', () => {
  const f = fixture('dispose-held');
  const current = f.populate();
  const held = structuredClone(current);
  const original = JSON.stringify(held);
  assert.deepEqual(validateDossier(held), []);
  assert.ok(held.questions[0].answer.includes(f.secret));

  assert.deepEqual(disposeSessionDossier(current), disposed);
  assert.deepEqual(disposeSessionDossier(held), disposed);
  refused(createDossier(f.input), /already registered/);

  const provenance = () => f.record();
  const grantRecord = provenance();
  const memoryRecord = provenance();
  const questionRecord = provenance();
  const attempts = [
    () => grantDossierConsent(held, {...f.consent(grantRecord.recorded_at), consent_id: 'new-consent'}, grantRecord),
    () => revokeDossierConsent(held, f.consentId, provenance()),
    () => addMemory(held, f.memory(memoryRecord.recorded_at), memoryRecord),
    () => answerQuestion(held, f.question(questionRecord.recorded_at), questionRecord),
    () => proposeHistoricalLearning(held, {...f.proposal(), proposal_id: 'rio:learning:new-proposal'}, provenance()),
    () => reviewLearningProposal(held, f.proposalId, 'ACCEPTED', provenance()),
  ];
  for (const attempt of attempts) refused(attempt(), /snapshot.*(?:stale|altered|registered)/);

  // Disposal releases the runtime's state; it does not claim to erase a copy
  // already held by a caller or turn local teardown into consent revocation.
  assert.equal(JSON.stringify(held), original);
  assert.equal(held.state, 'ACTIVE');
  assert.equal(held.consents[0].state, 'GRANTED');
});

test('disposing one dossier leaves an unrelated current dossier usable', () => {
  const a = fixture('dispose-independent-a');
  const b = fixture('dispose-independent-b');
  const left = a.populate();
  let right = b.populate();
  assert.deepEqual(disposeSessionDossier(left), disposed);

  const answered = b.answer(right);
  right = successful(answered);
  assert.equal(answered.result.status, 'ANSWER_SUPPORTED');
  assert.ok(answered.result.answer.includes(b.secret));
  assert.equal(answered.result.answer.includes(a.secret), false);
  assert.deepEqual(answered.result.citations, [right.memories[0].memory_id]);
  right = successful(b.remember(right, 'TST_PRIVATE_second memory for the unrelated dossier'));
  assert.equal(right.memories.length, 2);
  assert.equal(right.authority_effect, 'NONE');
  assert.deepEqual(disposeSessionDossier(right), disposed);
});

test('malformed, fabricated, stale and altered disposal requests cannot stop the current dossier', () => {
  const f = fixture('dispose-invalid');
  const stale = structuredClone(f.created);
  let current = f.populate();
  const altered = structuredClone(current);
  altered.memories[0].content = 'TST_PRIVATE_forged replacement';
  const fabricated = structuredClone(current);
  fabricated.dossier_id = 'rio:dossier:unregistered-disposal-example';
  const unreadable = structuredClone(current);
  Object.defineProperty(unreadable, 'memories', {get() { throw new Error(f.secret); }});
  assert.deepEqual(validateDossier(altered), []);
  assert.deepEqual(validateDossier(fabricated), []);

  for (const invalid of [undefined, null, {}, {...current, authority_effect: 'GRANTED'}]) {
    refused(disposeSessionDossier(invalid));
  }
  for (const invalid of [stale, altered, fabricated]) {
    refused(disposeSessionDossier(invalid));
  }
  const failedRead = disposeSessionDossier(unreadable);
  refused(failedRead);
  assert.equal(JSON.stringify(failedRead).includes(f.secret), false);
  const answered = f.answer(current);
  current = successful(answered);
  assert.equal(answered.result.status, 'ANSWER_SUPPORTED');
  assert.ok(answered.result.answer.includes(f.secret));

  assert.deepEqual(disposeSessionDossier(current), disposed);
  // A disposed ID must not bypass structural validation on repeated calls.
  refused(disposeSessionDossier({...current, memories: 'invalid'}));
  assert.deepEqual(disposeSessionDossier(current), disposed);
});

test('a fresh dossier needs its own consent and cannot inherit the disposed memory or answer', () => {
  const old = fixture('dispose-old-memory');
  const held = old.populate();
  assert.deepEqual(disposeSessionDossier(held), disposed);
  const fresh = fixture('dispose-new-memory');
  let current = fresh.created;
  refused(fresh.remember(current), /STORE_MEMORY consent/);
  refused(fresh.answer(current), /QUERY_MEMORY consent/);
  current = successful(fresh.grant(current));
  const withoutMemory = fresh.answer(current);
  current = successful(withoutMemory);
  assert.equal(withoutMemory.result.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(withoutMemory.result.citations, []);
  assert.equal(withoutMemory.result.answer.includes(old.secret), false);

  current = successful(fresh.remember(current));
  const answered = fresh.answer(current);
  current = successful(answered);
  assert.equal(answered.result.status, 'ANSWER_SUPPORTED');
  assert.equal(answered.result.answer, fresh.secret);
  assert.deepEqual(answered.result.citations, [current.memories[0].memory_id]);
  assert.equal(JSON.stringify(current).includes(old.secret), false);
  refused(old.answer(held), /snapshot.*(?:stale|altered|registered)/);
  assert.deepEqual(disposeSessionDossier(current), disposed);
});
