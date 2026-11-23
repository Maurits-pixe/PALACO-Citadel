import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectSignedAuditHeadAnchor,AUDIT_ANCHOR_SCHEMA} from './registry-pin-audit-anchor.mjs';
import {computeRegistryPinEntryHash} from './registry-pin-ledger.mjs';
import {PIN_SCHEMA} from './registry-snapshot-pin.mjs';

const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const publicJwk=pair.publicKey.export({format:'jwk'});
const anchorPublicJwk={kty:'EC',crv:'P-256',x:publicJwk.x,y:publicJwk.y};
const sha=b=>createHash('sha256').update(b).digest('hex');
const expectedAnchorKeyFingerprint=sha(pair.publicKey.export({format:'der',type:'spki'}));
const genesisPin={schema:PIN_SCHEMA,issuerFingerprint:'a'.repeat(64),
  revision:1,registrySha256:'b'.repeat(64)};
const currentPin={...genesisPin,revision:2,registrySha256:'c'.repeat(64)};
const entry={sequence:1,previousHash:'0'.repeat(64),fromPin:genesisPin,toPin:currentPin};
const entries=[entry];
const headHash=computeRegistryPinEntryHash(entry);
const document=(overrides={})=>({schema:AUDIT_ANCHOR_SCHEMA,sequence:1,headHash,
  genesisPin,currentPin,...overrides});
function setup(doc=document(),overrides={}) {
 const anchorBytes=Buffer.from(JSON.stringify(doc));
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 return {anchorBytes,signatureBase64Url,anchorPublicJwk,
   expectedAnchorKeyFingerprint,genesisPin,currentPin,entries,
   minimumAnchorSequence:1,...overrides};
}
test('valid signed external-head candidate matches exact ledger but never authorizes',()=>{
 const r=inspectSignedAuditHeadAnchor(setup());
 assert.equal(r.anchorSignatureValid,true,JSON.stringify(r));
 assert.equal(r.anchoredLedgerMatched,true);
 assert.equal(r.anchoredSequence,1);
 assert.equal(r.anchoredHeadHash,headHash);
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.stateChanged,false);
 assert.equal(r.executionAllowed,false);
 assert.equal(r.releaseAllowed,false);
});
test('stale signed checkpoint below local sequence floor rejected',()=>{
 const r=inspectSignedAuditHeadAnchor(setup(document(),{minimumAnchorSequence:2}));
 assert.equal(r.reason,'ANCHOR_ROLLBACK_OR_MISMATCH');
});
test('signed substituted current pin is rejected despite valid signature',()=>{
 const changed={...currentPin,registrySha256:'d'.repeat(64)};
 assert.equal(inspectSignedAuditHeadAnchor(setup(document({currentPin:changed}))).reason,
 'ANCHOR_ROLLBACK_OR_MISMATCH');
});
test('signed inaccurate head rejected by actual ledger history',()=>{
 const r=inspectSignedAuditHeadAnchor(setup(document({headHash:'f'.repeat(64)})));
 assert.equal(r.reason,'LEDGER_HEAD_ANCHOR_MISMATCH');
});
test('reordered or omitted ledger entries cannot match signed head',()=>{
 assert.equal(inspectSignedAuditHeadAnchor(setup(document(),{entries:[]})).anchoredLedgerMatched,false);
 assert.equal(inspectSignedAuditHeadAnchor(setup(document(),{entries:[{...entry,sequence:2}]})).anchoredLedgerMatched,false);
});
test('anchor signing key substitution fails fingerprint pin',()=>{
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
 const r=inspectSignedAuditHeadAnchor(setup(document(),{
   anchorPublicJwk:{kty:'EC',crv:'P-256',x:other.x,y:other.y}
 }));
 assert.equal(r.reason,'UNPINNED_ANCHOR_KEY');
});
test('signature or exact anchor bytes tampering rejected',()=>{
 const input=setup();
 const tampered=Buffer.from(input.anchorBytes);tampered[8]^=1;
 assert.equal(inspectSignedAuditHeadAnchor({...input,anchorBytes:tampered}).anchorSignatureValid,false);
 assert.equal(inspectSignedAuditHeadAnchor({...input,signatureBase64Url:'AQID'}).anchorSignatureValid,false);
});
test('missing pinned key, hostile inputs and fake authority fail closed',()=>{
 for(const v of [undefined,null,{},[],{...setup(),expectedAnchorKeyFingerprint:'f'.repeat(64)}]){
  const r=inspectSignedAuditHeadAnchor(v);
  assert.equal(r.authorization,'DENY');
  assert.equal(r.releaseAllowed,false);
  assert.equal(r.anchoredLedgerMatched,false);
 }
});


test('null outer anchor input returns DENY without raising a TypeError',()=>{
 const r=inspectSignedAuditHeadAnchor(null);
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
 assert.equal(r.releaseAllowed,false);
});

test('hostile outer anchor getter never executes',()=>{
 const input=setup();
 let reads=0;
 Object.defineProperty(input,'signatureBase64Url',{
   configurable:true,enumerable:true,
   get(){reads++;throw Error('unexpected outer getter');}
 });
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(reads,0);
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('outer audit anchor Proxy enumeration failure remains fail closed',()=>{
 const input=new Proxy(setup(),{ownKeys(){throw Error('hostile key list');}});
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.reason,'MALFORMED_OR_UNTRUSTED_ANCHOR');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('oversized anchor signature is rejected before base64url decoding',()=>{
 const input=setup();
 const result=inspectSignedAuditHeadAnchor({
   ...input,signatureBase64Url:'A'.repeat(100000)
 });
 assert.equal(result.anchorSignatureValid,false);
 assert.equal(result.anchoredLedgerMatched,false);
 assert.equal(result.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(result.authorization,'DENY');
 assert.equal(result.releaseAllowed,false);
});

test('non-base64url and undersized anchor signatures remain denied',()=>{
 const input=setup();
 for(const signatureBase64Url of ['AQID','+'.repeat(80),'A'.repeat(108)]) {
   const result=inspectSignedAuditHeadAnchor({...input,signatureBase64Url});
   assert.equal(result.anchorSignatureValid,false);
   assert.equal(result.reason,'INVALID_ANCHOR_INPUT');
   assert.equal(result.authorization,'DENY');
   assert.equal(result.executionAllowed,false);
 }
});


test('audit anchor public JWK getter is not executed',()=>{
 const input=setup();
 const malicious={...input.anchorPublicJwk};
 let getterCalls=0;
 Object.defineProperty(malicious,'x',{enumerable:true,configurable:true,
   get(){getterCalls++;throw Error('hostile coordinate getter');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk:malicious});
 assert.equal(getterCalls,0);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('audit anchor JWK Proxy descriptor is read once for fingerprint and verification',()=>{
 const input=setup();
 let reads=0;
 const mutable=new Proxy({...input.anchorPublicJwk},{
   getOwnPropertyDescriptor(target,key){
     const d=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='x'){
       reads++;
       return {...d,value:reads===1?input.anchorPublicJwk.x:'AAAAAAAA'};
     }
     return d;
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk:mutable});
 assert.equal(reads,1);
 assert.equal(r.anchoredLedgerMatched,true,JSON.stringify(r));
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('audit anchor JWK rejects unexpected symbol fields',()=>{
 const input=setup();
 const key={...input.anchorPublicJwk,[Symbol('unexpected')]:'value'};
 const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk:key});
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
});


test('audit anchor genesis PIN accessors cannot run during verification',()=>{
 const input=setup();
 const hostile={...input.genesisPin};
 let reads=0;
 Object.defineProperty(hostile,'revision',{enumerable:true,configurable:true,
   get(){reads++;throw Error('pin getter');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,genesisPin:hostile});
 assert.equal(reads,0);
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('audit anchor current PIN Proxy descriptor is captured once',()=>{
 const input=setup();
 let reads=0;
 const pin=new Proxy({...input.currentPin},{
   getOwnPropertyDescriptor(target,key){
     const d=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='registrySha256'){
       reads++;
       return {...d,value:reads===1?input.currentPin.registrySha256:'f'.repeat(64)};
     }
     return d;
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,currentPin:pin});
 assert.equal(r.anchoredLedgerMatched,true,JSON.stringify(r));
 assert.ok(reads>=1,'PIN must be checked through its own data descriptor');
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
});

test('audit anchor PIN with unexpected symbol field fails closed',()=>{
 const input=setup();
 const genesisPin={...input.genesisPin,[Symbol('extra')]:'untrusted'};
 const r=inspectSignedAuditHeadAnchor({...input,genesisPin});
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
});


test('first-read substituted audit PIN cannot be rescued by a later valid descriptor',()=>{
 const input=setup();
 let reads=0;
 const altered=new Proxy({...input.currentPin},{
   getOwnPropertyDescriptor(target,key){
     const descriptor=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='registrySha256'){
       reads++;
       return {...descriptor,value:reads===1?'f'.repeat(64):input.currentPin.registrySha256};
     }
     return descriptor;
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,currentPin:altered});
 assert.equal(reads,1);
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.reason,'ANCHOR_ROLLBACK_OR_MISMATCH');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('outer audit anchor signature Proxy descriptor is captured exactly once',()=>{
 const valid=setup();
 let reads=0;
 const input=new Proxy(valid,{
   getOwnPropertyDescriptor(target,key){
     const descriptor=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='signatureBase64Url'){
       reads++;
       return {...descriptor,value:reads===1?valid.signatureBase64Url:'AQID'};
     }
     return descriptor;
   }
 });
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(reads,1);
 assert.equal(r.anchoredLedgerMatched,true,JSON.stringify(r));
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('first-read invalid outer audit signature cannot be rescued by later Proxy value',()=>{
 const valid=setup();
 let reads=0;
 const input=new Proxy(valid,{
   getOwnPropertyDescriptor(target,key){
     const descriptor=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='signatureBase64Url'){
       reads++;
       return {...descriptor,value:reads===1?'AQID':valid.signatureBase64Url};
     }
     return descriptor;
   }
 });
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(reads,1);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('audit ledger array Proxy entry is sampled once before replay',()=>{
 const input=setup();
 let reads=0;
 const history=new Proxy([...input.entries],{
   getOwnPropertyDescriptor(target,key){
     const d=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='0'){
       reads++;
       return {...d,value:reads===1?input.entries[0]:{...input.entries[0],sequence:9}};
     }
     return d;
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,entries:history});
 assert.equal(reads,1);
 assert.equal(r.anchoredLedgerMatched,true,JSON.stringify(r));
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('audit ledger entry accessor fails without executing caller code',()=>{
 const input=setup();
 const entryWithGetter={...input.entries[0]};
 let getterCalls=0;
 Object.defineProperty(entryWithGetter,'toPin',{enumerable:true,configurable:true,
   get(){getterCalls++;throw Error('hostile ledger getter');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,entries:[entryWithGetter]});
 assert.equal(getterCalls,0);
 assert.equal(r.reason,'LEDGER_INVALID_CHAIN_LINK');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('first-read altered audit ledger PIN cannot be rescued by later Proxy data',()=>{
 const input=setup();
 let reads=0;
 const tampered=new Proxy({...input.entries[0].toPin},{
   getOwnPropertyDescriptor(target,key){
     const d=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='registrySha256'){
       reads++;
       return {...d,value:reads===1?'f'.repeat(64):input.entries[0].toPin.registrySha256};
     }
     return d;
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,
   entries:[{...input.entries[0],toPin:tampered}]});
 assert.equal(reads,1);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('audit ledger rejects sparse entries and hidden array keys',()=>{
 const input=setup();
 const sparse=new Array(1);
 const withSymbol=[...input.entries];
 withSymbol[Symbol('hidden')]='untrusted';
 for(const history of [sparse,withSymbol]){
   const r=inspectSignedAuditHeadAnchor({...input,entries:history});
   assert.equal(r.reason,'LEDGER_INVALID_CHAIN_LINK');
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});

test('audit ledger rejects oversized entry count without walking entries',()=>{
 const input=setup();
 let reads=0;
 const oversized=new Proxy(new Array(4097),{
   ownKeys(){reads++;throw Error('should not enumerate oversized ledger');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,entries:oversized});
 assert.equal(reads,0);
 assert.equal(r.reason,'LEDGER_INVALID_CHAIN_LINK');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('audit ledger array indexed accessor is rejected without invoking it',()=>{
 const input=setup();
 const history=[...input.entries];
 let reads=0;
 Object.defineProperty(history,'0',{configurable:true,enumerable:true,
   get(){reads++;throw Error('hostile history entry');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,entries:history});
 assert.equal(reads,0);
 assert.equal(r.reason,'LEDGER_INVALID_CHAIN_LINK');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});
