import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import { makeManifest, verifyExport, digestBytes, digest, signManifest, verifyBinding, draftRecord, transition, revoke } from './proof.mjs';
const bytes = { 'citadel.json': Buffer.from('{"name":"LA"}') };
const template = { id: 'L.A. Foundation', version: '0.1', sha256: 'a'.repeat(64) };
const manifest = makeManifest({ citadelId: 'LA-001', template, builderVersion: '0.1', exportSequence: 1, files: { 'citadel.json': digestBytes(bytes['citadel.json']) }, renderer: { id: 'procedural', version: '0.1', provenance: 'local' } });
const ev = (id, extra = {}) => ({ id, sha256: digest(id), ...extra });
test('draft export, byte integrity, replay and template pin', () => {
  assert.equal(verifyExport(manifest, bytes, template), digest(manifest));
  assert.throws(() => verifyExport(manifest, bytes, template, 1));
  assert.throws(() => verifyExport(manifest, { 'citadel.json': Buffer.from('tampered') }, template));
  assert.throws(() => verifyExport(manifest, bytes, { ...template, sha256: 'b'.repeat(64) }));
  assert.throws(() => makeManifest({ citadelId: 'x', template, builderVersion: '0.1', exportSequence: 1, files: { '../escape': 'a'.repeat(64) }, renderer: manifest.renderer }));
});
test('identity binding requires trusted key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const binding = signManifest(manifest, privateKey);
  assert.equal(verifyBinding(manifest, binding, pem), true);
  assert.throws(() => verifyBinding({ ...manifest, builderVersion: '0.2' }, binding, pem));
  assert.throws(() => verifyBinding(manifest, binding, 'other key'));
});
test('review, verification, authorization, commit and revoke fail closed', () => {
  let r = draftRecord(manifest, 'builder');
  const ctx = { manifestSha256: digest(manifest), bindingVerified: true, exportVerified: true, authority: { id: 'council', scope: 'LA-001', manifestSha256: digest(manifest) }, commit: { ticketId: 'T-1', manifestSha256: digest(manifest), outcome: 'COMMITTED' } };
  assert.throws(() => transition(r, 'ACTIVE', ev('shortcut'), ctx));
  assert.throws(() => transition(r, 'REVIEWED', ev('self', { reviewerId: 'builder' }), ctx));
  r = transition(r, 'REVIEWED', ev('review', { reviewerId: 'independent' }), ctx);
  assert.throws(() => transition(r, 'VERIFIED', ev('verify'), { ...ctx, bindingVerified: false }));
  r = transition(r, 'VERIFIED', ev('verify'), ctx);
  assert.throws(() => transition(r, 'ACTIVATABLE', ev('auth'), { ...ctx, authority: null }));
  r = transition(r, 'ACTIVATABLE', ev('auth'), ctx);
  assert.throws(() => transition(r, 'ACTIVE', ev('commit'), { ...ctx, commit: null }));
  r = transition(r, 'ACTIVE', ev('commit'), ctx);
  r = revoke(r, ev('revoke'), ctx.authority);
  assert.equal(r.state, 'REVOKED'); assert.equal(r.history.length, 5);
  assert.throws(() => transition(r, 'ACTIVE', ev('resume'), ctx));
});
