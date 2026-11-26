import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectAnchorWitnessQuorum,WITNESS_SCHEMA} from './registry-pin-anchor-witness.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
const anchorBytes=Buffer.from('PALACO independently retained anchor candidate');
const claimedAnchorSha256=digest(anchorBytes);
const DOMAIN=Buffer.from('PALACO-CITADEL-ANCHOR-WITNESS-V1\n');
const message=Buffer.concat([DOMAIN,Buffer.from(claimedAnchorSha256,'ascii')]);
function witness(witnessId){
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=key.publicKey.export({format:'jwk'});
 return {witnessId,fingerprint:digest(key.publicKey.export({type:'spki',format:'der'})),
  publicJwk:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y},
  signatureBase64Url:sign('sha256',message,key.privateKey).toString('base64url')};
}
const a=witness('independent-a'),b=witness('independent-b');
const base=()=>({anchorBytes,claimedAnchorSha256,witnesses:[a,b],
 approvedFingerprints:[a.fingerprint,b.fingerprint]});
const run=x=>inspectAnchorWitnessQuorum({...base(),...x});
test('two distinct pinned signatures validate bytes, but never authorize',()=>{
 const r=run({});
 assert.equal(r.schema,WITNESS_SCHEMA);
 assert.equal(r.witnessQuorumValid,true,JSON.stringify(r));
 assert.equal(r.anchorSha256,claimedAnchorSha256);
 assert.equal(r.witnessCount,2);
 assert.equal(r.trust,'NOT_ESTABLISHED');assert.equal(r.authorization,'DENY');
 assert.equal(r.stateChanged,false);assert.equal(r.releaseAllowed,false);
});
test('one signer or duplicated witness identity or key rejected',()=>{
 for(const witnesses of [[a],[a,a],[a,{...b,witnessId:a.witnessId}],
   [a,{...a,witnessId:'other'}]]){
  assert.equal(run({witnesses}).witnessQuorumValid,false);
 }
});
test('unregistered signer and fake SPKI fingerprint rejected',()=>{
 assert.equal(run({approvedFingerprints:[a.fingerprint,'f'.repeat(64)]}).witnessQuorumValid,false);
 assert.equal(run({witnesses:[{...a,fingerprint:'f'.repeat(64)},b],
   approvedFingerprints:['f'.repeat(64),b.fingerprint]}).reason,'WITNESS_KEY_MISMATCH');
});
test('signed approval cannot be replayed for modified anchor',()=>{
 const changed=Buffer.from(anchorBytes);changed[0]^=1;
 assert.equal(run({anchorBytes:changed}).reason,'ANCHOR_DIGEST_MISMATCH');
 assert.equal(run({anchorBytes:changed,claimedAnchorSha256:digest(changed)}).reason,
   'WITNESS_SIGNATURE_INVALID');
});
test('signature corruption and changed key rejected',()=>{
 assert.equal(run({witnesses:[{...a,signatureBase64Url:'AQID'},b]}).witnessQuorumValid,false);
 const other=witness('other');
 assert.equal(run({witnesses:[{...a,publicJwk:other.publicJwk},b]}).reason,'WITNESS_KEY_MISMATCH');
});
test('hostile and absent inputs fail closed',()=>{
 const hostile=new Proxy({},{get(){throw Error('untrusted');}});
 for(const input of [undefined,null,[],{},hostile]){
  const r=inspectAnchorWitnessQuorum(input);
  assert.equal(r.witnessQuorumValid,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
});
