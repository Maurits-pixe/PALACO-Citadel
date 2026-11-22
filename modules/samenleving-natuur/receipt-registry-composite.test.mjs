import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, createPublicKey, sign } from 'node:crypto';
import { assessReceiptWithRegistry, COMPOSITE_SCHEMA } from './receipt-registry-composite.mjs';
import { CRYPTO_SCHEMA } from './receipt-crypto-verifier.mjs';
import { REGISTRY_SCHEMA } from './reviewer-registry-check.mjs';

const keys = () => {
  const k = generateKeyPairSync('ec', {namedCurve:'prime256v1'});
  const j = k.publicKey.export({format:'jwk'});
  return {
    privateKey:k.privateKey,
    publicJwk:{kty:'EC',crv:'P-256',x:j.x,y:j.y},
    fingerprint:createHash('sha256').update(k.publicKey.export({type:'spki',format:'der'})).digest('hex')
  };
};
const reviewer=keys(), issuer=keys();
const payloadBytes=Buffer.from('{"receipt":"PALACO-review-fixture"}');
const hash=b=>createHash('sha256').update(b).digest('hex');
const signWith=(prefix, bytes, key)=>sign('sha256',Buffer.concat([Buffer.from(prefix),bytes]),key).toString('base64url');
const envelope=()=>({schema:CRYPTO_SCHEMA,payloadSha256:hash(payloadBytes),
  signatureBase64Url:signWith('PALACO-CITADEL-RECEIPT-V1\n',payloadBytes,reviewer.privateKey)});
const registry=()=>({schema:REGISTRY_SCHEMA,revision:4,
  issuedAt:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',
  reviewers:[{fingerprint:reviewer.fingerprint,role:'receipt-reviewer',status:'active',
    notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'}]});
const claims=()=>({
  ledgerBound:true,checkpointBound:true,reviewerIndependent:true,policyMatched:true,
  makerId:'maker-1',reviewerId:'reviewer-2',
  makerKeyFingerprint:'f'.repeat(64),reviewerKeyFingerprint:reviewer.fingerprint,
  checkpointDigest:hash(payloadBytes),
  issuerIndependentlyTrusted:true,revocationFresh:true,
  authorization:'ALLOW'
});
function fixture(overrides={}, registryOverride=registry()) {
  const registryBytes=Buffer.from(JSON.stringify(registryOverride));
  return {
    payloadBytes,envelope:envelope(),reviewerPublicJwk:reviewer.publicJwk,claims:claims(),
    registryBytes,registrySignatureBase64Url:signWith('PALACO-CITADEL-REVIEWER-REGISTRY-V1\n',registryBytes,issuer.privateKey),
    issuerPublicJwk:issuer.publicJwk,expectedIssuerFingerprint:issuer.fingerprint,
    minimumRevision:4,evaluationTime:'2026-11-22T00:00:00.000Z',...overrides
  };
}
test('two valid signatures and matching key imply technical consistency only',()=>{
  const r=assessReceiptWithRegistry(fixture());
  assert.equal(r.schema,COMPOSITE_SCHEMA);
  assert.equal(r.cryptographicBindingsConsistent,true,JSON.stringify(r));
  assert.equal(r.receiptSignatureVerified,true);
  assert.equal(r.registrySignatureVerified,true);
  assert.deepEqual(r.failedChecks,[]);
  assert.ok(r.unresolvedGates.includes('INDEPENDENT_ISSUER_TRUST'));
  assert.equal(r.authorization,'DENY');
  assert.equal(r.trust,'NOT_ESTABLISHED');
  assert.equal(r.executionAllowed,false);
  assert.equal(r.releaseAllowed,false);
});
test('revoked reviewer is rejected',()=>{
  const reg=registry();reg.reviewers[0].status='revoked';
  const r=assessReceiptWithRegistry(fixture({},reg));
  assert.equal(r.cryptographicBindingsConsistent,false);
  assert.deepEqual(r.failedChecks,['REGISTRY_REVIEWER_REVOKED']);
});
test('issuer pin mismatch and rollback revision are rejected',()=>{
  assert.deepEqual(assessReceiptWithRegistry(fixture({expectedIssuerFingerprint:'a'.repeat(64)})).failedChecks,['REGISTRY_ISSUER_PIN_MISMATCH']);
  assert.deepEqual(assessReceiptWithRegistry(fixture({minimumRevision:5})).failedChecks,['REGISTRY_REGISTRY_POLICY_REJECTED']);
});
test('mutated registry or receipt bytes are rejected even if flags claim success',()=>{
  const f=fixture();
  const reg=Buffer.from(f.registryBytes);
  reg[10]^=1;
  assert.equal(assessReceiptWithRegistry({...f,registryBytes:reg}).cryptographicBindingsConsistent,false);
  assert.deepEqual(assessReceiptWithRegistry({...f,payloadBytes:Buffer.from('tampered')}).failedChecks,['RECEIPT_SIGNATURE_INVALID']);
});
test('claimed signer fingerprint must match cryptographically verified key',()=>{
  const f=fixture({claims:{...claims(),reviewerKeyFingerprint:'d'.repeat(64)}});
  assert.deepEqual(assessReceiptWithRegistry(f).failedChecks,['REVIEWER_KEY_BINDING_MISMATCH']);
});
test('same maker and reviewer fingerprint fails local separation',()=>{
  const r=assessReceiptWithRegistry(fixture({claims:{...claims(),makerKeyFingerprint:reviewer.fingerprint}}));
  assert.deepEqual(r.failedChecks,['RECEIPT_REVIEW_CONSISTENCY_FAILED']);
});
test('malformed claims and missing registry fail closed',()=>{
  for (const c of [null,[],{},undefined]) {
    const r=assessReceiptWithRegistry(fixture({claims:c}));
    assert.equal(r.authorization,'DENY');
    assert.equal(r.cryptographicBindingsConsistent,false);
  }
  assert.equal(assessReceiptWithRegistry(fixture({registryBytes:null})).registrySignatureVerified,false);
});
test('untrusted claimed trust cannot override explicit non-authorization',()=>{
  const r=assessReceiptWithRegistry(fixture({claims:{...claims(),trust:'TRUSTED',releaseAllowed:true}}));
  assert.equal(r.cryptographicBindingsConsistent,true);
  assert.equal(r.authorization,'DENY');
  assert.equal(r.releaseAllowed,false);
});
