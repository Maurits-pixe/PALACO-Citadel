import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectSignedWitnessRegistry,SIGNED_WITNESS_REGISTRY_SCHEMA} from './registry-pin-signed-witness-registry.mjs';
import {WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=k=>{const p=k.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:p.x,y:p.y};};
const fp=k=>sha(k.publicKey.export({format:'der',type:'spki'}));
const anchorBytes=Buffer.from('PALACO audit anchor for signed registry QA');
const claimedAnchorSha256=sha(anchorBytes);
function witness(witnessId){
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const signatureBase64Url=sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-ANCHOR-WITNESS-V1\n'),
  Buffer.from(claimedAnchorSha256,'ascii')
 ]),keys.privateKey).toString('base64url');
 return {witnessId,fingerprint:fp(keys),publicJwk:jwk(keys),signatureBase64Url};
}
const a=witness('witness-a'),b=witness('witness-b');
const members=[a,b].map(w=>({witnessId:w.witnessId,fingerprint:w.fingerprint,status:'ACTIVE'}));
function signed(registry){
 const registryBytes=Buffer.from(JSON.stringify(registry));
 return {registryBytes,registrySignatureBase64Url:sign('sha256',
  Buffer.concat([Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n'),registryBytes]),
  issuer.privateKey).toString('base64url')};
}
const valid=()=>({...signed({schema:WITNESS_REGISTRY_SCHEMA,epoch:12,members}),
  issuerPublicJwk:jwk(issuer),expectedIssuerFingerprint:fp(issuer),
  anchorBytes,claimedAnchorSha256,witnesses:[a,b],minimumEpoch:12});
const base=()=>{const v=valid();return {...v,expectedRegistrySha256:sha(v.registryBytes)};};
const run=changes=>inspectSignedWitnessRegistry({...base(),...changes});
test('exact signed witness register and active signatures match without granting authority',()=>{
 const r=run({});
 assert.equal(r.schema,SIGNED_WITNESS_REGISTRY_SCHEMA);
 assert.equal(r.signedRegistryMatched,true,JSON.stringify(r));
 assert.equal(r.registryEpoch,12);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.releaseAllowed,false);assert.equal(r.stateChanged,false);
});
test('exact registry digest substitution is rejected before signature check',()=>{
 const changed=Buffer.from(base().registryBytes);changed[0]^=1;
 assert.equal(run({registryBytes:changed}).reason,'REGISTRY_BYTES_SUBSTITUTED');
});
test('validly re-signed stale register fails protected epoch floor',()=>{
 const stale=signed({schema:WITNESS_REGISTRY_SCHEMA,epoch:11,members});
 assert.equal(run({...stale,expectedRegistrySha256:sha(stale.registryBytes)}).reason,
  'REGISTRY_EPOCH_ROLLBACK_OR_SCHEMA');
});
test('valid signed revocation rejects a previously valid witness signature',()=>{
 const revoked=signed({schema:WITNESS_REGISTRY_SCHEMA,epoch:12,
  members:[members[0],{...members[1],status:'REVOKED'}]});
 assert.equal(run({...revoked,expectedRegistrySha256:sha(revoked.registryBytes)}).reason,
  'WITNESS_POLICY_WITNESS_REVOKED');
});
test('signer key substitution cannot replace issuer public key',()=>{
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 assert.equal(run({issuerPublicJwk:jwk(other)}).reason,'UNPINNED_REGISTRY_ISSUER');
});
test('tampered signature and wrong signing key fail closed',()=>{
 assert.equal(run({registrySignatureBase64Url:'AQID'}).reason,'REGISTRY_SIGNATURE_INVALID');
 assert.equal(run({expectedIssuerFingerprint:'f'.repeat(64)}).reason,
  'UNPINNED_REGISTRY_ISSUER');
});
test('missing and hostile records deny without exceptions',()=>{
 const hostile=new Proxy({},{get(){throw Error('hostile');}});
 for(const input of [undefined,null,{},[],hostile,{...base(),minimumEpoch:0}]){
  const r=inspectSignedWitnessRegistry(input);
  assert.equal(r.signedRegistryMatched,false);
  assert.equal(r.authorization,'DENY');assert.equal(r.stateChanged,false);
 }
});

test('outer accessor properties are rejected without invoking getters',()=>{
 const input=base();
 let calls=0;
 Object.defineProperty(input,'expectedRegistrySha256',{enumerable:true,
  configurable:true,get(){calls++;throw Error('getter must not execute');}});
 const r=inspectSignedWitnessRegistry(input);
 assert.equal(calls,0);
 assert.equal(r.reason,'INVALID_SIGNED_REGISTRY_INPUT');
 assert.equal(r.authorization,'DENY');
});
test('issuer JWK accessor is rejected without invocation',()=>{
 const input=base();
 let calls=0;
 const issuerPublicJwk={...input.issuerPublicJwk};
 Object.defineProperty(issuerPublicJwk,'x',{enumerable:true,configurable:true,
   get(){calls++;throw Error('JWK getter must not execute');}});
 const r=inspectSignedWitnessRegistry({...input,issuerPublicJwk});
 assert.equal(calls,0);
 assert.equal(r.reason,'INVALID_SIGNED_REGISTRY_INPUT');
});
test('issuer JWK Proxy descriptor is captured once before signature verification',()=>{
 const input=base();
 let reads=0;
 const issuerPublicJwk=new Proxy({...input.issuerPublicJwk},{
  getOwnPropertyDescriptor(target,key){
    const descriptor=Reflect.getOwnPropertyDescriptor(target,key);
    if(key==='x'){
      reads++;
      return {...descriptor,value:reads===1?input.issuerPublicJwk.x:'A'.repeat(43)};
    }
    return descriptor;
  }
 });
 const r=inspectSignedWitnessRegistry({...input,issuerPublicJwk});
 assert.equal(reads,1);
 assert.equal(r.signedRegistryMatched,true,JSON.stringify(r));
 assert.equal(r.authorization,'DENY');
});
test('unexpected symbol metadata on outer contract and issuer JWK is denied',()=>{
 const outer={...base(),[Symbol('extra')]:true};
 const key={...base().issuerPublicJwk,[Symbol('extra')]:true};
 for(const input of [outer,{...base(),issuerPublicJwk:key}]){
   const r=inspectSignedWitnessRegistry(input);
   assert.equal(r.signedRegistryMatched,false);
   assert.equal(r.authorization,'DENY');
 }
});
