import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectWitnessRegistryPolicy,WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const anchorBytes=Buffer.from('PALACO witness registry check');
const claimedAnchorSha256=digest(anchorBytes);
const message=Buffer.concat([Buffer.from('PALACO-CITADEL-ANCHOR-WITNESS-V1\n'),
 Buffer.from(claimedAnchorSha256,'ascii')]);
function witness(witnessId){
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const k=keys.publicKey.export({format:'jwk'});
 return {witnessId,fingerprint:digest(keys.publicKey.export({format:'der',type:'spki'})),
  publicJwk:{kty:'EC',crv:'P-256',x:k.x,y:k.y},
  signatureBase64Url:sign('sha256',message,keys.privateKey).toString('base64url')};
}
const a=witness('witness-a'),b=witness('witness-b');
const members=[a,b].map(w=>({witnessId:w.witnessId,fingerprint:w.fingerprint,status:'ACTIVE'}));
const registry={schema:WITNESS_REGISTRY_SCHEMA,epoch:8,members};
const base=()=>({anchorBytes,claimedAnchorSha256,witnesses:[a,b],
 registry:{...registry,members:members.map(x=>({...x}))},minimumEpoch:8});
const run=x=>inspectWitnessRegistryPolicy({...base(),...x});
test('enrolled, distinct, active signers match locally but never authorize',()=>{
 const r=run({});
 assert.equal(r.witnessPolicyMatched,true,JSON.stringify(r));
 assert.equal(r.registryEpoch,8);assert.equal(r.anchorSha256,claimedAnchorSha256);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.releaseAllowed,false);assert.equal(r.stateChanged,false);
});
test('revoked signer rejected even if cryptographic signature remains valid',()=>{
 assert.equal(run({registry:{...registry,members:[members[0],{...members[1],status:'REVOKED'}]}}).reason,'WITNESS_REVOKED');
});
test('stale and invalid epoch snapshots cannot pass',()=>{
 assert.equal(run({minimumEpoch:9}).reason,'INVALID_OR_ROLLED_BACK_REGISTRY');
 assert.equal(run({minimumEpoch:0}).witnessPolicyMatched,false);
 assert.equal(run({registry:{...registry,epoch:0}}).witnessPolicyMatched,false);
});
test('rebound identity and unenrolled witness are rejected',()=>{
 assert.equal(run({witnesses:[{...a,fingerprint:b.fingerprint},b]}).reason,'WITNESS_KEY_REBOUND');
 assert.equal(run({witnesses:[{...a,witnessId:'outsider'},b]}).reason,'WITNESS_NOT_ENROLLED');
});
test('duplicate identities or fingerprints invalidate entire registry',()=>{
 assert.equal(run({registry:{...registry,members:[members[0],{...members[1],witnessId:members[0].witnessId}]}}).reason,'INVALID_OR_DUPLICATE_ENROLLMENT');
 assert.equal(run({registry:{...registry,members:[members[0],{...members[1],fingerprint:members[0].fingerprint}]}}).reason,'INVALID_OR_DUPLICATE_ENROLLMENT');
});
test('invalid signatures cannot be approved by policy',()=>{
 const r=run({witnesses:[{...a,signatureBase64Url:'AQID'},b]});
 assert.equal(r.witnessPolicyMatched,false);
 assert.equal(r.reason,'SIGNATURE_WITNESS_SIGNATURE_INVALID');
});
test('null hostile accessor and proxy inputs fail closed',()=>{
 const proxy=new Proxy({},{get(){throw Error('hostile');}});
 for(const v of [undefined,null,{},[],proxy,
  {...base(),registry:{...registry,members:[{...members[0],get status(){throw Error('hostile');}},members[1]]}}]){
  const r=inspectWitnessRegistryPolicy(v);
  assert.equal(r.authorization,'DENY');
  assert.equal(r.witnessPolicyMatched,false);
  assert.equal(r.stateChanged,false);
 }
});
