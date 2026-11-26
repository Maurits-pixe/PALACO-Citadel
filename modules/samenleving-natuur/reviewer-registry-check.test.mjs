import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { checkSignedReviewerRegistry, REGISTRY_SCHEMA } from './reviewer-registry-check.mjs';

const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const k=publicKey.export({format:'jwk'});
const issuerPublicJwk={kty:'EC',crv:'P-256',x:k.x,y:k.y};
const fingerprint=createHash('sha256').update(createPublicKey({key:issuerPublicJwk,format:'jwk'}).export({type:'spki',format:'der'})).digest('hex');
const reviewerFingerprint='b'.repeat(64);
const entry=()=>({fingerprint:reviewerFingerprint,role:'receipt-reviewer',status:'active',notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2027-01-01T00:00:00.000Z'});
const registry=()=>({schema:REGISTRY_SCHEMA,revision:4,issuedAt:'2026-11-20T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',reviewers:[entry()]});
const payload=doc=>Buffer.from(JSON.stringify(doc));
const run=(doc=registry(),extra={})=>{
  const registryBytes=payload(doc);
  const signatureBase64Url=sign('sha256',Buffer.concat([Buffer.from('PALACO-CITADEL-REVIEWER-REGISTRY-V1\n'),registryBytes]),privateKey).toString('base64url');
  return checkSignedReviewerRegistry({registryBytes,signatureBase64Url,issuerPublicJwk,
    expectedIssuerFingerprint:fingerprint,minimumRevision:4,
    evaluationTime:'2026-11-22T00:00:00.000Z',reviewerFingerprint,...extra});
};

test('valid signed registry passes local checks but never establishes trust',()=>{
  const r=run();
  assert.equal(r.localRegistryCheckPassed,true);
  assert.equal(r.registryRevision,4);
  assert.equal(r.trust,'NOT_ESTABLISHED');
  assert.equal(r.authorization,'DENY');
  assert.equal(r.executionAllowed,false);
  assert.equal(r.releaseAllowed,false);
});
test('revoked, expired and missing reviewer fail closed',()=>{
  assert.equal(run({...registry(),reviewers:[{...entry(),status:'revoked'}]}).reason,'REVIEWER_REVOKED');
  assert.equal(run({...registry(),reviewers:[{...entry(),notAfter:'2026-01-02T00:00:00.000Z'}]}).reason,'REVIEWER_NOT_CURRENT');
  assert.equal(run({...registry(),reviewers:[]}).reason,'REVIEWER_NOT_LISTED');
});
test('issuer pin and signed bytes are checked',()=>{
  assert.equal(run(registry(),{expectedIssuerFingerprint:'c'.repeat(64)}).reason,'ISSUER_PIN_MISMATCH');
  const bytes=payload(registry());
  const r=run(registry(),{registryBytes:Buffer.from(bytes.toString().replace('active','revoked'))});
  assert.equal(r.reason,'REGISTRY_SIGNATURE_INVALID');
});
test('old revision and expired registry fail closed',()=>{
  assert.equal(run({...registry(),revision:3}).reason,'REGISTRY_POLICY_REJECTED');
  assert.equal(run({...registry(),expiresAt:'2026-01-03T00:00:00.000Z'}).reason,'REGISTRY_POLICY_REJECTED');
});
test('duplicate reviewer and malformed entry fail closed',()=>{
  assert.equal(run({...registry(),reviewers:[entry(),entry()]}).reason,'INVALID_REGISTRY_ENTRY');
  assert.equal(run({...registry(),reviewers:[{...entry(),role:'owner'}]}).reason,'INVALID_REGISTRY_ENTRY');
});
test('untrusted or malformed inputs cannot grant authority',()=>{
  for(const extra of [{minimumRevision:0},{evaluationTime:'yesterday'},{signatureBase64Url:'%%%'},
    {registryBytes:new Uint8Array(0)}, {issuerPublicJwk:{}}]){
    const r=run(registry(),extra);
    assert.equal(r.localRegistryCheckPassed,false);
    assert.equal(r.authorization,'DENY');
  }
});

test('valid but seven-day-old signed snapshots fail the freshness gate',()=>{
  assert.equal(run({...registry(),issuedAt:'2026-11-14T23:59:59.999Z'}).reason,'REGISTRY_SNAPSHOT_TOO_OLD');
  assert.equal(run({...registry(),issuedAt:'2026-11-15T00:00:00.000Z'}).localRegistryCheckPassed,true);
});
test('future-issued snapshots and invalid validity intervals fail closed',()=>{
  assert.equal(run({...registry(),issuedAt:'2026-11-23T00:00:00.000Z'}).reason,'REGISTRY_POLICY_REJECTED');
  assert.equal(run({...registry(),expiresAt:'2026-11-19T00:00:00.000Z'}).reason,'REGISTRY_POLICY_REJECTED');
  const invalid=entry();
  invalid.notBefore='2026-12-01T00:00:00.000Z';
  invalid.notAfter='2026-11-30T00:00:00.000Z';
  assert.equal(run({...registry(),reviewers:[invalid]}).reason,'INVALID_REGISTRY_ENTRY');
});
