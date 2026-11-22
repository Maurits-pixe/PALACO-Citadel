import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, createPublicKey } from 'node:crypto';
import { assessSignedReceipt, BRIDGE_SCHEMA } from './receipt-evidence-bridge.mjs';
import { CRYPTO_SCHEMA } from './receipt-crypto-verifier.mjs';

const domain = Buffer.from('PALACO-CITADEL-RECEIPT-V1\n');
const payloadBytes = Buffer.from('{"citadel":"W-0001","receipt":"review-test"}');
const { privateKey, publicKey } = generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk = publicKey.export({format:'jwk'});
const publicJwk = {kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = sha(createPublicKey({key:publicJwk,format:'jwk'}).export({type:'spki',format:'der'}));
const envelope = () => ({
  schema: CRYPTO_SCHEMA,
  payloadSha256: sha(payloadBytes),
  signatureBase64Url: sign('sha256',Buffer.concat([domain,payloadBytes]),privateKey).toString('base64url')
});
const claims = () => ({
  ledgerBound:true, checkpointBound:true,
  signatureCryptographicallyValid:true, reviewerRegistrySignatureValid:true,
  reviewerActive:true,reviewerIndependent:true,
  issuerIndependentlyTrusted:true,revocationFresh:true,policyMatched:true,
  makerId:'maker-001',reviewerId:'reviewer-002',
  makerKeyFingerprint:'f'.repeat(64),
  reviewerKeyFingerprint:fingerprint,
  checkpointDigest:sha(payloadBytes)
});
const run = (overrides={}) => assessSignedReceipt({
  payloadBytes,envelope:envelope(),publicJwk,claims:claims(),...overrides
});

test('valid cryptographic signature feeds local review but never authorization',()=>{
  const r=run();
  assert.equal(r.schema,BRIDGE_SCHEMA);
  assert.equal(r.cryptographicallyValid,true);
  assert.equal(r.reviewerSigningKeyMatchesClaim,true);
  assert.equal(r.localChecksReportedPass,true,JSON.stringify(r));
  assert.deepEqual(r.failedChecks,[]);
  assert.equal(r.trust,'NOT_ESTABLISHED');
  assert.equal(r.authorization,'DENY');
  assert.equal(r.executionAllowed,false);
  assert.equal(r.releaseAllowed,false);
});

test('untrusted true signature flag cannot override a failed signature',()=>{
  const corrupted=Buffer.from(payloadBytes);
  corrupted[0]^=1;
  const r=run({payloadBytes:corrupted});
  assert.equal(r.cryptographicallyValid,false);
  assert.equal(r.localChecksReportedPass,false);
  assert.ok(r.failedChecks.includes('actualSignatureVerificationFailed'));
});

test('different signing key than reviewer fingerprint fails closed',()=>{
  const r=run({claims:{...claims(),reviewerKeyFingerprint:'e'.repeat(64)}});
  assert.equal(r.cryptographicallyValid,true);
  assert.equal(r.reviewerSigningKeyMatchesClaim,false);
  assert.equal(r.localChecksReportedPass,false);
  assert.ok(r.failedChecks.includes('reviewerSigningKeyMismatch'));
});

test('incorrect checkpoint digest fails despite valid signature',()=>{
  const r=run({claims:{...claims(),checkpointDigest:'0'.repeat(64)}});
  assert.equal(r.cryptographicallyValid,true);
  assert.equal(r.localChecksReportedPass,false);
  assert.ok(r.failedChecks.includes('digestMismatchOrMissing'));
});

test('same maker and reviewer key fails despite verified receipt',()=>{
  const r=run({claims:{...claims(),makerKeyFingerprint:fingerprint}});
  assert.equal(r.localChecksReportedPass,false);
  assert.ok(r.failedChecks.includes('makerReviewerKeyNotDistinct'));
});

test('missing and getter-based claims fail closed',()=>{
  for (const value of [null,{},[],undefined]) {
    const r=run({claims:value});
    assert.equal(r.localChecksReportedPass,false);
    assert.equal(r.authorization,'DENY');
  }
  const adversarial=claims();
  Object.defineProperty(adversarial,'reviewerId',{get(){throw Error('spoofed');},enumerable:true});
  assert.equal(run({claims:adversarial}).localChecksReportedPass,false);
});

test('approval overrides are ignored even with a valid signature',()=>{
  const r=run({claims:{...claims(),authorization:'ALLOW',releaseAllowed:true,trust:'TRUSTED'}});
  assert.equal(r.cryptographicallyValid,true);
  assert.equal(r.authorization,'DENY');
  assert.equal(r.releaseAllowed,false);
});

test('missing reviewer fingerprint never silently passes key binding',()=>{
  const incomplete=claims();
  delete incomplete.reviewerKeyFingerprint;
  const r=run({claims:incomplete});
  assert.equal(r.localChecksReportedPass,false);
  assert.equal(r.authorization,'DENY');
  assert.ok(r.failedChecks.length>0);
});


test('hostile proxy descriptor access fails closed without crashing receipt bridge',()=>{
 const adversarial=new Proxy(claims(),{
  getOwnPropertyDescriptor(target,key){
   if(key==='reviewerKeyFingerprint')throw Error('malicious descriptor trap');
   return Reflect.getOwnPropertyDescriptor(target,key);
  }
 });
 const result=run({claims:adversarial});
 assert.equal(result.cryptographicallyValid,true);
 assert.equal(result.reviewerSigningKeyMatchesClaim,false);
 assert.equal(result.localChecksReportedPass,false);
 assert.ok(result.failedChecks.includes('reviewerSigningKeyMismatch'));
 assert.equal(result.authorization,'DENY');
 assert.equal(result.releaseAllowed,false);
});

test('reviewer fingerprint accessor cannot substitute authenticated key binding',()=>{
 const adversarial=claims();
 Object.defineProperty(adversarial,'reviewerKeyFingerprint',{
  enumerable:true,configurable:true,get(){return fingerprint;}
 });
 const result=run({claims:adversarial});
 assert.equal(result.cryptographicallyValid,true);
 assert.equal(result.reviewerSigningKeyMatchesClaim,false);
 assert.equal(result.localChecksReportedPass,false);
 assert.ok(result.failedChecks.includes('reviewerSigningKeyMismatch'));
 assert.equal(result.authorization,'DENY');
});

test('reviewer fingerprint claim remains informative and never grants authority',()=>{
 const result=run();
 assert.equal(result.reviewerSigningKeyMatchesClaim,true);
 assert.equal(result.trust,'NOT_ESTABLISHED');
 assert.equal(result.authorization,'DENY');
 assert.equal(result.executionAllowed,false);
 assert.equal(result.releaseAllowed,false);
});
