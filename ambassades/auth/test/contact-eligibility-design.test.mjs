import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CompactSign, SignJWT } from 'jose';
import { CONTACT_DESIGN as POLICY, createContactEligibilityDesign } from '../contact-eligibility-design.mjs';
import { validateDesignSnapshot } from '../../../rio/identity-design/reference.mjs';

const identityFixture = JSON.parse(await readFile(new URL('../../../rio/identity-design/draft.json', import.meta.url), 'utf8'));
const contactFixture = JSON.parse(await readFile(new URL('./fixtures/contact-eligibility-design.json', import.meta.url), 'utf8'));
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const assessor = createContactEligibilityDesign({ publicKey });
const NOW = 1_800_000_000_000;
const fresh = () => ({ snapshot: structuredClone(identityFixture), registry: structuredClone(contactFixture) });
function request(person = 'ALPHA', kind = 'PHONE') {
  return { session_ref: `TST-SESSION-${person}`, claimed_actor_person_id: null,
    shared_palaco_id: 'TST-PROJECT-PALACO', pp_ref: `TST-PP-${person}`,
    binding_ref: `TST-CONTACT-BINDING-${person}-${kind}`, transport: 'WIFI', now_ms: NOW, proof: null };
}
function claimsFor(snapshot, registry, proposed = request()) {
  const session = snapshot.sessions.find(item => item.session_ref === proposed.session_ref);
  const pp = registry.ppBindings.find(item => item.pp_ref === proposed.pp_ref);
  const contact = registry.contactBindings.find(item => item.binding_ref === proposed.binding_ref);
  return { iss: POLICY.issuer, aud: POLICY.audience, jti: 'TST-PROOF-CONTACT-01',
    iat: NOW / 1000 - 10, exp: NOW / 1000 + 60, purpose: POLICY.purpose, policy_version: POLICY.policyVersion,
    person_id: session.person_id, pp_ref: pp.pp_ref, pp_revision: pp.revision,
    session_ref: session.session_ref, provider: session.provider, provider_user_ref: session.provider_user_ref,
    shared_palaco_id: proposed.shared_palaco_id, binding_ref: contact.binding_ref, binding_revision: contact.revision,
    contact_kind: contact.kind, contact_ref: contact.contact_ref, challenge_ref: contact.challenge_ref,
    contact_verified: true };
}
async function sign(claims, header = {}, key = privateKey) {
  return new SignJWT(claims).setProtectedHeader({ alg: POLICY.algorithm, kid: POLICY.kid, typ: POLICY.type, ...header }).sign(key);
}
async function prepared(person = 'ALPHA', kind = 'PHONE') {
  const { snapshot, registry } = fresh(); const proposed = request(person, kind);
  proposed.proof = await sign(claimsFor(snapshot, registry, proposed));
  return { snapshot, registry, proposed };
}
function held(result, eligible = false) {
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.mode, 'DESIGN_ONLY');
  assert.equal(result.decisionStatus, 'ADVISORY_HUMAN_DECISION_REQUIRED');
  assert.equal(result.policyVersion, POLICY.policyVersion);
  assert.equal(result.designEligible, eligible);
  for (const field of ['canAuthorize', 'canStartChat', 'canOpenContact', 'oauthEnabled', 'accountActive']) assert.equal(result[field], false);
  assert.equal(result.operativeAuthority, 'NONE');
  assert.ok(Object.values(result).every(value => value === null || typeof value !== 'object'));
}
async function assess({ snapshot, registry, proposed }) { return assessor.assess(snapshot, registry, proposed); }

test('actual signed PHONE or EMAIL independently models eligibility, while all authority stays closed', async () => {
  for (const person of ['ALPHA', 'BETA']) for (const kind of ['PHONE', 'EMAIL']) {
    const input = await prepared(person, kind); const result = await assess(input);
    held(result, true);
    assert.equal(result.reason, 'DESIGN_CHAT_ELIGIBLE');
    assert.equal(result.actor_person_id, `TST-PERSON-${person}`);
    assert.equal(result.pp_ref, `TST-PP-${person}`);
    assert.equal(result.contact_kind, kind);
    assert.equal(result.shared_palaco_id, 'TST-PROJECT-PALACO');
  }
});

test('transport never supplies identity and has no effect on a valid or missing proof', async () => {
  const input = await prepared(); const valid = await assess(input);
  for (const transport of ['WIFI', 'MOBILE', 'OTHER']) {
    input.proposed.transport = transport;
    assert.deepEqual(await assess(input), valid);
    held(await assessor.assess(input.snapshot, input.registry, { ...input.proposed, proof: null }));
  }
  input.proposed.transport = 'PHONE'; held(await assess(input));
});

test('review permissions supply no chat authority; individual active membership is required separately', async () => {
  const input = await prepared(); input.snapshot.memberships[0].permissions = [];
  held(await assess(input), true);
  input.snapshot.memberships[0].status = 'REVOKED'; held(await assess(input));
  const beta = request('BETA'); beta.proof = await sign(claimsFor(input.snapshot, input.registry, beta));
  held(await assessor.assess(input.snapshot, input.registry, beta), true);
  input.snapshot.memberships[0].status = 'ACTIVE'; input.snapshot.sessions[0].status = 'CLOSED';
  held(await assess(input));
});

test('revoking one contact preserves the confirmed alternative and the other person', async () => {
  const input = await prepared(); input.registry.contactBindings[0].status = 'REVOKED';
  held(await assess(input));
  for (const [person, kind] of [['ALPHA', 'EMAIL'], ['BETA', 'PHONE']]) {
    const alternative = request(person, kind);
    alternative.proof = await sign(claimsFor(input.snapshot, input.registry, alternative));
    held(await assessor.assess(input.snapshot, input.registry, alternative), true);
  }
  input.registry.contactBindings[0].status = 'UNCONFIRMED'; held(await assess(input));
  input.registry.ppBindings[0].status = 'REVOKED';
  const email = request('ALPHA', 'EMAIL'); email.proof = await sign(claimsFor(input.snapshot, input.registry, email));
  held(await assessor.assess(input.snapshot, input.registry, email));
});

test('caller actor, group, session, PP and contact cannot impersonate or cross contexts', async () => {
  for (const change of [
    value => { value.claimed_actor_person_id = 'TST-PERSON-BETA'; },
    value => { value.claimed_actor_person_id = 'TST-PROJECT-PALACO'; },
    value => { value.session_ref = 'TST-SESSION-BETA'; },
    value => { value.shared_palaco_id = 'TST-GROUP-OTHER'; },
    value => { value.pp_ref = 'TST-PP-BETA'; },
    value => { value.binding_ref = 'TST-CONTACT-BINDING-BETA-PHONE'; },
  ]) {
    const input = await prepared(); change(input.proposed); held(await assess(input));
  }
  const input = await prepared(); input.proposed.claimed_actor_person_id = 'TST-PERSON-ALPHA';
  held(await assess(input), true);
  input.snapshot.groups.push({ shared_palaco_id: 'TST-PROJECT-OTHER', kind: 'PROJECT', status: 'DESIGN_ONLY' });
  input.snapshot.memberships.push({ ...input.snapshot.memberships[0], membership_id: 'TST-MEMBERSHIP-OTHER', shared_palaco_id: 'TST-PROJECT-OTHER' });
  assert.equal(validateDesignSnapshot(input.snapshot).valid, true);
  input.proposed.shared_palaco_id = 'TST-PROJECT-OTHER'; held(await assess(input));
  input.proposed.proof = await sign(claimsFor(input.snapshot, input.registry, input.proposed)); held(await assess(input), true);
});

test('proof is signed by the single configured key; corruption, substitute keys and algorithms fail', async () => {
  const input = await prepared(); const claims = claimsFor(input.snapshot, input.registry);
  const other = generateKeyPairSync('ed25519');
  const [header, payload, signature] = input.proposed.proof.split('.');
  const tampered = `${header}.${Buffer.from(JSON.stringify({ ...claims, person_id: 'TST-PERSON-BETA' })).toString('base64url')}.${signature}`;
  const alteredSignature = `${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const wrongAlgorithm = await sign(claims, { alg: 'HS256' }, new Uint8Array(32));
  for (const proof of [tampered, alteredSignature, await sign(claims, {}, other.privateKey), wrongAlgorithm,
    `${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload}.eA`]) {
    input.proposed.proof = proof; held(await assess(input));
  }
});

test('fixed header rejects token-selected keys, metadata, changed kid and changed type', async () => {
  const input = await prepared(); const claims = claimsFor(input.snapshot, input.registry);
  for (const header of [{ kid: 'TST-OTHER-KEY' }, { typ: 'OTHER' },
    { jku: 'https://invalid.example/never-fetch' }, { x5u: 'https://invalid.example/never-fetch' },
    { jwk: publicKey.export({ format: 'jwk' }) }, { extra: 'TST-CANARY' }]) {
    input.proposed.proof = await sign(claims, header); held(await assess(input));
  }
  input.proposed.proof = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid: POLICY.kid, typ: 'JWT', crit: ['test'], test: true })
    .sign(privateKey, { crit: { test: true } });
  held(await assess(input));
});

test('every signed context claim is required and unknown claims and unsigned verified booleans fail', async () => {
  const input = await prepared(); const claims = claimsFor(input.snapshot, input.registry);
  for (const [field, replacement] of Object.entries({
    iss: 'TST-OTHER-ISSUER', aud: ['TST-PALACO-CHAT-ELIGIBILITY'], purpose: 'TST-OTHER-PURPOSE',
    policy_version: 'TST-POLICY-OTHER', person_id: 'TST-PERSON-BETA', pp_ref: 'TST-PP-BETA', pp_revision: 2,
    session_ref: 'TST-SESSION-BETA', provider: 'TST-PROVIDER-OTHER', provider_user_ref: 'TST-PROVIDER-USER-BETA',
    shared_palaco_id: 'TST-PROJECT-OTHER', binding_ref: 'TST-CONTACT-BINDING-OTHER', binding_revision: 2,
    contact_kind: 'EMAIL', contact_ref: 'TST-PHONE-OTHER', challenge_ref: 'TST-CHALLENGE-OTHER', contact_verified: false,
  })) {
    input.proposed.proof = await sign({ ...claims, [field]: replacement }); held(await assess(input));
  }
  for (const field of Object.keys(claims)) {
    const missing = { ...claims }; delete missing[field]; input.proposed.proof = await sign(missing); held(await assess(input));
  }
  input.proposed.proof = await sign({ ...claims, verified: true }); held(await assess(input));
  input.proposed = { ...request(), contact_verified: true }; held(await assess(input));
  input.proposed = { ...request(), verified: true, publicKey }; held(await assess(input));
});

test('strict fixture time window rejects expired, future, oversized-lifetime and unsafe numbers', async () => {
  const input = await prepared(); const claims = claimsFor(input.snapshot, input.registry);
  for (const timing of [{ exp: NOW / 1000 }, { iat: NOW / 1000 + 1 }, { iat: -1 },
    { iat: NOW / 1000 - 301, exp: NOW / 1000 + 1 }, { exp: claims.iat },
    { exp: Number.MAX_SAFE_INTEGER + 1 }, { iat: 1.5 }]) {
    input.proposed.proof = await sign({ ...claims, ...timing }); held(await assess(input));
  }
  const nonFinite = JSON.stringify(claims).replace(`"exp":${claims.exp}`, '"exp":1e999');
  input.proposed.proof = await new CompactSign(Buffer.from(nonFinite))
    .setProtectedHeader({ alg: 'EdDSA', kid: POLICY.kid, typ: 'JWT' }).sign(privateKey);
  held(await assess(input));
  input.proposed.proof = await sign({ ...claims, iat: NOW / 1000, exp: NOW / 1000 + POLICY.maxFixtureLifetimeSeconds });
  held(await assess(input), true);
  input.proposed.now_ms = NOW + POLICY.maxFixtureLifetimeSeconds * 1000 - 1; held(await assess(input), true);
  input.proposed.now_ms += 1; held(await assess(input));
  for (const now_ms of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER, '1800000000000']) {
    input.proposed.now_ms = now_ms; held(await assess(input));
  }
});

test('each evaluation rereads revocations and revisions; old proofs do not survive rebinds', async () => {
  const input = await prepared(); held(await assess(input), true);
  for (const [binding, field, changed] of [
    [input.registry.ppBindings[0], 'revision', 2], [input.registry.contactBindings[0], 'revision', 2],
    [input.registry.contactBindings[0], 'contact_ref', 'TST-PHONE-NEW'],
    [input.registry.contactBindings[0], 'challenge_ref', 'TST-CHALLENGE-NEW'],
    [input.registry.ppBindings[0], 'status', 'REVOKED'],
  ]) {
    const original = binding[field]; binding[field] = changed; held(await assess(input)); binding[field] = original;
    held(await assess(input), true);
  }
  input.registry.ppBindings[0].person_id = 'TST-PERSON-BETA';
  input.registry.ppBindings[1].person_id = 'TST-PERSON-ALPHA'; held(await assess(input));
  for (const [field, changed] of [['provider', 'TST-PROVIDER-REBOUND'], ['provider_user_ref', 'TST-PROVIDER-USER-REBOUND']]) {
    const rebound = await prepared(); held(await assess(rebound), true); rebound.snapshot.providerBindings[0][field] = changed;
    rebound.snapshot.sessions[0][field] = changed; rebound.snapshot.historicalReceipts[0][field] = changed;
    assert.equal(validateDesignSnapshot(rebound.snapshot).valid, true);
    held(await assess(rebound));
  }
});

test('state changes during asynchronous signature verification cannot leave a positive result', async () => {
  for (const change of [
    input => { input.snapshot.memberships[0].status = 'REVOKED'; },
    input => { input.snapshot.sessions[0].status = 'CLOSED'; },
    input => { input.registry.ppBindings[0].revision += 1; },
    input => { input.registry.contactBindings[0].status = 'REVOKED'; },
    input => { input.registry.oauthEnabled = true; },
  ]) {
    const input = await prepared();
    const pending = assess(input); change(input); held(await pending);
  }
  // The caller's separate request object is copied before the async boundary.
  const input = await prepared(); const pending = assess(input);
  input.proposed.claimed_actor_person_id = 'TST-PERSON-BETA'; input.proposed.pp_ref = 'TST-PP-BETA';
  const result = await pending; held(result, true); assert.equal(result.actor_person_id, 'TST-PERSON-ALPHA');
});

test('registry is bounded, closed and rejects duplicate, dangling, real or untyped references', async () => {
  const changes = [
    r => { r.oauthEnabled = true; }, r => { r.accountActive = true; }, r => { r.canOpenContact = true; },
    r => { r.operativeAuthority = 'ADMIN'; }, r => { r.mode = 'LIVE'; }, r => { r.policyVersion = 'OTHER'; },
    r => { r.extra = true; }, r => { r.ppBindings.push({ ...r.ppBindings[0] }); },
    r => { r.ppBindings[1].person_id = r.ppBindings[0].person_id; },
    r => { r.ppBindings[0].person_id = 'TST-PERSON-MISSING'; }, r => { r.ppBindings[0].revision = Infinity; },
    r => { r.contactBindings.push({ ...r.contactBindings[0] }); },
    r => { r.contactBindings[0].pp_ref = 'TST-PP-MISSING'; },
    r => { r.contactBindings[1].contact_ref = r.contactBindings[3].contact_ref; },
    r => { r.contactBindings[1].challenge_ref = r.contactBindings[3].challenge_ref; },
    r => { r.contactBindings[0].kind = 'WIFI'; }, r => { r.contactBindings[0].contact_ref = '+31612345678'; },
    r => { r.contactBindings[1].contact_ref = 'someone@example.invalid'; },
    r => { r.contactBindings[0].revision = 0; }, r => { r.ppBindings = Array(33).fill(r.ppBindings[0]); },
    r => { r.contactBindings = Array(65).fill(r.contactBindings[0]); },
  ];
  for (const change of changes) { const input = await prepared(); change(input.registry); held(await assess(input)); }
  const input = await prepared(); input.snapshot.canOpenContact = true; held(await assess(input));
});

test('accessors, inherited fields, symbols and untyped objects are rejected without invoking callbacks', async () => {
  let calls = 0;
  const hostile = Object.defineProperty({}, 'toJSON', { get() { calls += 1; throw new Error('never'); } });
  for (const change of [
    input => { input.registry.ppBindings[0].revision = hostile; },
    input => { input.registry.contactBindings[0].kind = hostile; },
    input => { input.proposed.now_ms = hostile; }, input => { input.proposed.proof = hostile; },
    input => { Object.defineProperty(input.proposed, 'pp_ref', { enumerable: true, get() { calls += 1; } }); },
    input => { Object.defineProperty(input.registry.contactBindings[0], 'contact_ref', { enumerable: true, get() { calls += 1; } }); },
    input => { Object.defineProperty(input.registry.contactBindings, '0', { enumerable: true, get() { calls += 1; } }); },
    input => { input.proposed[Symbol('extra')] = true; },
    input => { input.registry = Object.create(input.registry); },
  ]) { const input = await prepared(); change(input); held(await assess(input)); }
  assert.equal(calls, 0);
});

test('bounded token and fatal UTF-8 decoding reject malformed evidence without echoing input', async () => {
  const input = await prepared();
  const invalidUtf8 = await new CompactSign(new Uint8Array([123, 34, 120, 34, 58, 34, 0xc3, 0x28, 34, 125]))
    .setProtectedHeader({ alg: 'EdDSA', kid: POLICY.kid, typ: 'JWT' }).sign(privateKey);
  for (const proof of [invalidUtf8, 'A'.repeat(8193), 'TST-CANARY-PRIVATE-PROOF', 'é'.repeat(4000),
    await sign({ TST_CANARY_PRIVATE_PHONE: '+31612345678' })]) {
    input.proposed.proof = proof; const result = await assess(input); held(result);
    const output = JSON.stringify(result);
    for (const sensitive of [proof, 'TST-CANARY', '+31612345678', 'PRIVATE-PROOF']) assert.equal(output.includes(sensitive), false);
    assert.equal(Object.hasOwn(result, 'actor_person_id'), false);
  }
});

test('the byte cap accepts a real signed compact proof at the boundary and rejects the next payload byte', async () => {
  const input = await prepared(); const raw = JSON.stringify(claimsFor(input.snapshot, input.registry));
  const [header, , signature] = input.proposed.proof.split('.'); const fixedBytes = header.length + signature.length + 2;
  let payloadBytes = Buffer.byteLength(raw);
  while (fixedBytes + Math.ceil((payloadBytes + 1) * 4 / 3) <= 8192) payloadBytes += 1;
  const signPadded = bytes => new CompactSign(Buffer.from(raw + ' '.repeat(bytes - Buffer.byteLength(raw))))
    .setProtectedHeader({ alg: 'EdDSA', kid: POLICY.kid, typ: 'JWT' }).sign(privateKey);
  input.proposed.proof = await signPadded(payloadBytes);
  assert.ok(input.proposed.proof.length >= 8190 && input.proposed.proof.length <= 8192);
  held(await assess(input), true);
  input.proposed.proof = await signPadded(payloadBytes + 1);
  assert.ok(input.proposed.proof.length > 8192); held(await assess(input));
});

test('factory accepts only an explicitly configured public Ed25519 key; inputs remain unchanged', async () => {
  for (const configuration of [null, {}, { publicKey: privateKey }, { publicKey: publicKey.export({ format: 'jwk' }) },
    { publicKey, issuer: 'OTHER' }, { publicKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey }]) {
    assert.throws(() => createContactEligibilityDesign(configuration), /^Error: INVALID_TEST_VERIFICATION_KEY$/);
  }
  const input = await prepared(); const before = structuredClone(input);
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(input); held(await assess(input), true); assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(assessor), true);
});
