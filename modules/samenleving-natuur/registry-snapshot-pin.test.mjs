import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { checkPinnedRegistrySnapshot, PIN_SCHEMA } from './registry-snapshot-pin.mjs';
import { REGISTRY_SCHEMA } from './reviewer-registry-check.mjs';

const pair = generateKeyPairSync('ec', {namedCurve:'prime256v1'});
const jwk = pair.publicKey.export({format:'jwk'});
const issuerPublicJwk = {kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const issuerFingerprint = sha(pair.publicKey.export({format:'der',type:'spki'}));
const reviewerFingerprint = 'a'.repeat(64);
const document = () => ({
  schema: REGISTRY_SCHEMA, revision: 5,
  issuedAt:'2026-11-20T00:00:00.000Z',
  expiresAt:'2026-12-01T00:00:00.000Z',
  reviewers:[{fingerprint:reviewerFingerprint,role:'receipt-reviewer',
    status:'active',notBefore:'2026-11-01T00:00:00.000Z',
    notAfter:'2026-12-01T00:00:00.000Z'}]
});
const signed = (doc=document()) => {
  const registryBytes = Buffer.from(JSON.stringify(doc));
  const signatureBase64Url = sign('sha256', Buffer.concat([
    Buffer.from('PALACO-CITADEL-REVIEWER-REGISTRY-V1\n'), registryBytes
  ]), pair.privateKey).toString('base64url');
  return {registryBytes, signatureBase64Url};
};
const pinned = registryBytes => ({
  schema:PIN_SCHEMA,issuerFingerprint,revision:5,registrySha256:sha(registryBytes)
});
const evaluate = (data=signed(), overrides={}) => checkPinnedRegistrySnapshot({
  ...data,pinnedSnapshot:pinned(data.registryBytes),issuerPublicJwk,
  evaluationTime:'2026-11-22T00:00:00.000Z',reviewerFingerprint,
  ...overrides
});

test('exact signed bytes match pin but never grant trust or authorization', () => {
  const r=evaluate();
  assert.equal(r.exactSnapshotMatched,true,JSON.stringify(r));
  assert.equal(r.registryRevision,5);
  assert.equal(r.trust,'NOT_ESTABLISHED');
  assert.equal(r.authorization,'DENY');
  assert.equal(r.executionAllowed,false);
  assert.equal(r.releaseAllowed,false);
});
test('different validly signed snapshot of same revision is rejected', () => {
  const original=signed();
  const changed=signed({...document(),reviewers:[{...document().reviewers[0],status:'revoked'}]});
  const result=evaluate(changed,{pinnedSnapshot:pinned(original.registryBytes)});
  assert.equal(result.reason,'SNAPSHOT_BYTES_DIFFER_FROM_PIN');
});
test('old and new revisions cannot silently advance or roll back', () => {
  const old=signed({...document(),revision:4});
  const newer=signed({...document(),revision:6});
  const original=signed();
  for(const candidate of [old,newer]) {
    assert.equal(evaluate(candidate,{pinnedSnapshot:pinned(original.registryBytes)}).exactSnapshotMatched,false);
  }
  assert.equal(evaluate(newer,{pinnedSnapshot:{...pinned(newer.registryBytes),revision:5}}).reason,'REVISION_NOT_EXACTLY_PINNED');
});
test('signature forgery fails even with correctly calculated pin digest', () => {
  const data=signed();
  const forged={...data,signatureBase64Url:'AQID'};
  assert.equal(evaluate(forged).reason,'REGISTRY_INVALID_SIGNATURE_ENCODING');
});
test('valid-length modified registry signature fails cryptographic verification', () => {
  const data=signed();
  const bytes=Buffer.from(data.signatureBase64Url,'base64url');
  bytes[bytes.length-1]^=1;
  const result=evaluate({...data,signatureBase64Url:bytes.toString('base64url')});
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'REGISTRY_REGISTRY_SIGNATURE_INVALID');
  assert.equal(result.trust,'NOT_ESTABLISHED');
  assert.equal(result.authorization,'DENY');
  assert.equal(result.executionAllowed,false);
  assert.equal(result.releaseAllowed,false);
});

test('revoked reviewer fails even when exact registry is pinned', () => {
  const data=signed({...document(),reviewers:[{...document().reviewers[0],status:'revoked'}]});
  assert.equal(evaluate(data).reason,'REGISTRY_REVIEWER_REVOKED');
});
test('malformed pins and bad issuer fingerprints fail closed', () => {
  const data=signed();
  for(const invalid of [null,{},'pin',{...pinned(data.registryBytes),revision:0},
    {...pinned(data.registryBytes),issuerFingerprint:'b'.repeat(64)}]){
    const result=evaluate(data,{pinnedSnapshot:invalid});
    assert.equal(result.exactSnapshotMatched,false);
    assert.equal(result.authorization,'DENY');
  }
});
test('expired snapshot is rejected despite correct signature and pin', () => {
  const data=signed({...document(),issuedAt:'2026-11-01T00:00:00.000Z'});
  assert.equal(evaluate(data).reason,'REGISTRY_REGISTRY_SNAPSHOT_TOO_OLD');
});


test('accessor-based pin cannot alter input bytes or bypass the local trust boundary', () => {
  const data=signed();
  const expectedPin=pinned(data.registryBytes);
  const originalDigest=sha(data.registryBytes);
  let reads=0;
  Object.defineProperty(expectedPin,'registrySha256',{
    configurable:true,enumerable:true,
    get(){
      reads++;
      data.registryBytes[0]^=1;
      return originalDigest;
    }
  });
  const result=evaluate(data,{pinnedSnapshot:expectedPin});
  assert.equal(reads,0,'untrusted pin getter must not execute');
  assert.equal(sha(data.registryBytes),originalDigest);
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'INVALID_PIN');
  assert.equal(result.trust,'NOT_ESTABLISHED');
  assert.equal(result.authorization,'DENY');
  assert.equal(result.executionAllowed,false);
  assert.equal(result.releaseAllowed,false);
});

test('mutable registry bytes remain copied even when caller alters original after pin snapshot', () => {
  const data=signed();
  const originalDigest=sha(data.registryBytes);
  let descriptorReads=0;
  const pinProxy=new Proxy(pinned(data.registryBytes),{
    getOwnPropertyDescriptor(target,key){
      const descriptor=Reflect.getOwnPropertyDescriptor(target,key);
      if(key==='registrySha256'){
        descriptorReads++;
        // The pin's data descriptor is read only once, after input bytes are copied.
        data.registryBytes[0]^=1;
      }
      return descriptor;
    }
  });
  const result=evaluate(data,{pinnedSnapshot:pinProxy});
  assert.equal(descriptorReads,1);
  assert.notEqual(sha(data.registryBytes),originalDigest);
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'SNAPSHOT_BYTES_DIFFER_FROM_PIN');
  assert.equal(result.authorization,'DENY');
});

test('mutated bytes before pin check cannot match the prior signed snapshot', () => {
  const data=signed();
  const trustedDigest=pinned(data.registryBytes);
  data.registryBytes[0]^=1;
  const result=evaluate(data,{pinnedSnapshot:trustedDigest});
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'SNAPSHOT_BYTES_DIFFER_FROM_PIN');
  assert.equal(result.authorization,'DENY');
});


test('pin descriptor Proxy that throws fails closed without raising exceptions', () => {
  const data=signed();
  const hostile=new Proxy(pinned(data.registryBytes),{
    getOwnPropertyDescriptor(target,key){
      if(key==='registrySha256')throw Error('untrusted pin descriptor');
      return Reflect.getOwnPropertyDescriptor(target,key);
    }
  });
  const result=evaluate(data,{pinnedSnapshot:hostile});
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'UNTRUSTED_PIN_INPUT');
  assert.equal(result.authorization,'DENY');
  assert.equal(result.releaseAllowed,false);
});


test('pin with unexpected symbol field fails closed before descriptor reads', () => {
  const data=signed();
  const candidate=pinned(data.registryBytes);
  candidate[Symbol('invisible')]='unexpected';
  const result=evaluate(data,{pinnedSnapshot:candidate});
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'INVALID_PIN');
  assert.equal(result.authorization,'DENY');
});

test('hostile ownKeys Proxy trap fails closed without inspecting pin values', () => {
  const data=signed();
  let descriptors=0;
  const hostile=new Proxy(pinned(data.registryBytes),{
    ownKeys(){throw Error('blocked ownKeys');},
    getOwnPropertyDescriptor(target,key){
      descriptors++;
      return Reflect.getOwnPropertyDescriptor(target,key);
    }
  });
  const result=evaluate(data,{pinnedSnapshot:hostile});
  assert.equal(descriptors,0);
  assert.equal(result.exactSnapshotMatched,false);
  assert.equal(result.reason,'UNTRUSTED_PIN_INPUT');
  assert.equal(result.authorization,'DENY');
  assert.equal(result.releaseAllowed,false);
});
