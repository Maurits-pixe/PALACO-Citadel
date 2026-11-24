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


test('noncanonical trailing bits in P-256 JWK coordinates are denied',()=>{
 const input=setup();
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 const noncanonical=value=>{
   const last=alphabet.indexOf(value.at(-1));
   assert.ok(last>=0);
   const alternate=alphabet[last ^ 1];
   const changed=value.slice(0,-1)+alternate;
   assert.equal(Buffer.from(changed,'base64url').toString('base64url'),value);
   return changed;
 };
 for (const coordinate of ['x','y']) {
   const anchorPublicJwk={
     ...input.anchorPublicJwk,
     [coordinate]:noncanonical(input.anchorPublicJwk[coordinate])
   };
   const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk});
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});


test('signed noncanonical JSON formatting is rejected even with valid signature',()=>{
 const original=setup();
 const canonical=JSON.stringify(document());
 const noncanonical=canonical.replace(',"sequence"', ', "sequence"');
 assert.notEqual(noncanonical,canonical);
 const anchorBytes=Buffer.from(noncanonical,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url});
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('signed duplicate JSON member names cannot create ambiguous audit heads',()=>{
 const original=setup();
 const canonical=JSON.stringify(document());
 const duplicate=canonical.replace('{"schema":',
   '{"schema":"'+AUDIT_ANCHOR_SCHEMA+'","schema":');
 assert.notEqual(duplicate,canonical);
 const anchorBytes=Buffer.from(duplicate,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url});
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
 assert.equal(r.releaseAllowed,false);
});


test('oversized signed audit sequence is denied before ledger enumeration',()=>{
 const input=setup(document({sequence:4097}));
 let enumerations=0;
 const hostileHistory=new Proxy([...input.entries],{
   ownKeys(){enumerations++;throw Error('untrusted ledger must not be inspected');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,entries:hostileHistory});
 assert.equal(enumerations,0);
 assert.equal(r.reason,'ANCHOR_ROLLBACK_OR_MISMATCH');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('signed negative audit sequence is denied before touching history',()=>{
 const input=setup(document({sequence:-1}));
 let enumerations=0;
 const hostileHistory=new Proxy([...input.entries],{
   ownKeys(){enumerations++;throw Error('history must not be enumerated');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,entries:hostileHistory});
 assert.equal(enumerations,0);
 assert.equal(r.reason,'ANCHOR_ROLLBACK_OR_MISMATCH');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.executionAllowed,false);
 assert.equal(r.authorization,'DENY');
});


test('signed anchor rollback floor, schema and head hash reject before ledger enumeration',()=>{
 const cases=[
   {doc:document(),overrides:{minimumAnchorSequence:2}},
   {doc:document({schema:'untrusted-anchor-v1'}),overrides:{}},
   {doc:document({headHash:'NOT_A_SHA256_DIGEST'}),overrides:{}},
   {doc:document({currentPin:{...currentPin,revision:3}}),overrides:{}}
 ];
 for (const {doc,overrides} of cases) {
   const input=setup(doc,overrides);
   let enumerations=0;
   const hostileHistory=new Proxy([...input.entries],{
     ownKeys(){enumerations++;throw Error('ledger should not be enumerated');}
   });
   const r=inspectSignedAuditHeadAnchor({...input,entries:hostileHistory});
   assert.equal(enumerations,0,JSON.stringify(doc));
   assert.equal(r.reason,'ANCHOR_ROLLBACK_OR_MISMATCH',JSON.stringify(doc));
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});


test('signed audit sequence/length mismatch rejects before ledger enumeration',()=>{
 const signed=setup();
 for(const length of [0,2]){
   let enumerationCalls=0;
   let lengthDescriptorCalls=0;
   const history=new Proxy(new Array(length),{
     getOwnPropertyDescriptor(target,key){
       if(key==='length') lengthDescriptorCalls++;
       return Reflect.getOwnPropertyDescriptor(target,key);
     },
     ownKeys(){
       enumerationCalls++;
       throw Error('mismatched ledger must not be enumerated');
     }
   });
   const r=inspectSignedAuditHeadAnchor({...signed,entries:history});
   assert.equal(lengthDescriptorCalls,1);
   assert.equal(enumerationCalls,0);
   assert.equal(r.reason,'LEDGER_INVALID_CHAIN_LINK');
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});

test('signed audit ledger length Proxy is read once and cannot change after preflight',()=>{
 const signed=setup();
 let lengthReads=0;
 const history=new Proxy([...signed.entries],{
   getOwnPropertyDescriptor(target,key){
     const d=Reflect.getOwnPropertyDescriptor(target,key);
     if(key==='length'){
       lengthReads++;
       return {...d,value:lengthReads===1?1:2};
     }
     return d;
   }
 });
 const r=inspectSignedAuditHeadAnchor({...signed,entries:history});
 assert.equal(lengthReads,1);
 assert.equal(r.anchoredLedgerMatched,true,JSON.stringify(r));
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('impossible minimum audit sequence rejects before key and ledger inspection',()=>{
 const input=setup();
 let keyEnumerations=0;
 let ledgerEnumerations=0;
 const anchorPublicJwk=new Proxy(input.anchorPublicJwk,{
   ownKeys(){keyEnumerations++;throw Error('key must not be enumerated');}
 });
 const entries=new Proxy([...input.entries],{
   ownKeys(){ledgerEnumerations++;throw Error('ledger must not be enumerated');}
 });
 for(const minimumAnchorSequence of [4097, Number.MAX_SAFE_INTEGER]) {
   const r=inspectSignedAuditHeadAnchor({
     ...input,anchorPublicJwk,entries,minimumAnchorSequence
   });
   assert.equal(keyEnumerations,0);
   assert.equal(ledgerEnumerations,0);
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.executionAllowed,false);
   assert.equal(r.releaseAllowed,false);
 }
});

test('nonintegral audit sequence floor is denied before key verification',()=>{
 const input=setup();
 const r=inspectSignedAuditHeadAnchor({
   ...input, minimumAnchorSequence:4095.5,
   anchorPublicJwk:new Proxy(input.anchorPublicJwk,{
     ownKeys(){throw Error('untrusted key accessed');}
   })
 });
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
});


test('invalid scalar anchor input cannot inspect caller-owned PIN descriptors',()=>{
 const input=setup();
 let pinEnumerations=0;
 const hostilePin=new Proxy(input.genesisPin,{
   ownKeys(){pinEnumerations++;throw Error('PIN enumeration should not run');}
 });
 for (const override of [
   {minimumAnchorSequence:4097},
   {minimumAnchorSequence:-1},
   {expectedAnchorKeyFingerprint:'not-a-digest'},
   {signatureBase64Url:'AQID'}
 ]) {
   const r=inspectSignedAuditHeadAnchor({...input,genesisPin:hostilePin,...override});
   assert.equal(pinEnumerations,0,JSON.stringify(override));
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT',JSON.stringify(override));
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});

test('valid scalar inputs still inspect and deny hostile PINs without executing getters',()=>{
 const input=setup();
 const hostilePin={...input.genesisPin};
 let getterCalls=0;
 Object.defineProperty(hostilePin,'revision',{
   enumerable:true,configurable:true,
   get(){getterCalls++;throw Error('untrusted PIN getter executed');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,genesisPin:hostilePin});
 assert.equal(getterCalls,0);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('audit anchor signed bytes are captured before key Proxy mutations',()=>{
 const input=setup();
 const anchorBytes=Buffer.from(input.anchorBytes);
 let mutations=0;
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   getOwnPropertyDescriptor(target,key){
     if(key==='x'){
       mutations++;
       anchorBytes[0]^=1;
     }
     return Reflect.getOwnPropertyDescriptor(target,key);
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes,anchorPublicJwk});
 assert.equal(mutations,1);
 assert.equal(r.anchoredLedgerMatched,true,JSON.stringify(r));
 assert.equal(r.anchorSignatureValid,true);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('tampered initial audit bytes cannot be repaired by a key Proxy trap',()=>{
 const input=setup();
 const anchorBytes=Buffer.from(input.anchorBytes);
 anchorBytes[0]^=1;
 let repairs=0;
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   getOwnPropertyDescriptor(target,key){
     if(key==='x'){
       repairs++;
       anchorBytes[0]^=1;
     }
     return Reflect.getOwnPropertyDescriptor(target,key);
   }
 });
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes,anchorPublicJwk});
 assert.equal(repairs,1);
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('noncanonical signature is rejected before any PIN or JWK descriptor inspection',()=>{
 const input=setup();
 const signatureBase64Url='B'.repeat(11);
 assert.notEqual(Buffer.from(signatureBase64Url,'base64url').toString('base64url'),
   signatureBase64Url);
 let pinReads=0;
 let keyReads=0;
 const genesisPin=new Proxy({...input.genesisPin},{
   ownKeys(){pinReads++;throw Error('untrusted PIN enumerated');}
 });
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   ownKeys(){keyReads++;throw Error('untrusted key enumerated');}
 });
 const r=inspectSignedAuditHeadAnchor({
   ...input,signatureBase64Url,genesisPin,anchorPublicJwk
 });
 assert.equal(pinReads,0);
 assert.equal(keyReads,0);
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('canonical but invalid signature remains denied by crypto verification',()=>{
 const input=setup();
 const signatureBase64Url=Buffer.alloc(64,42).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...input,signatureBase64Url});
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('non-DER ECDSA signature is rejected before PIN and public-key inspection',()=>{
 const input=setup();
 let pinReads=0, keyReads=0;
 const genesisPin=new Proxy({...input.genesisPin},{
   ownKeys(){pinReads++;throw Error('PIN must not be enumerated');}
 });
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   ownKeys(){keyReads++;throw Error('key must not be enumerated');}
 });
 // Syntactically canonical base64url but not a DER SEQUENCE.
 const signatureBase64Url=Buffer.alloc(64,0x2a).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({
   ...input,signatureBase64Url,genesisPin,anchorPublicJwk
 });
 assert.equal(pinReads,0);
 assert.equal(keyReads,0);
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('nonminimal DER ECDSA INTEGER encoding is denied before key inspection',()=>{
 const input=setup();
 // SEQUENCE(INTEGER 0x0001, INTEGER 0x01) has redundant leading zero.
 const signature=Buffer.from([0x30,0x07,0x02,0x02,0x00,0x01,0x02,0x01,0x01]);
 let keyReads=0;
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   ownKeys(){keyReads++;throw Error('key must not be enumerated');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,
   signatureBase64Url:signature.toString('base64url'),anchorPublicJwk});
 assert.equal(keyReads,0);
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.authorization,'DENY');
});


test('P-256 ECDSA scalars equal to curve order fail before untrusted key access',()=>{
 const input=setup();
 const order=Buffer.from(
   'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551','hex');
 const oversizedInteger=Buffer.concat([Buffer.from([0x02,0x21,0x00]),order]);
 const one=Buffer.from([0x02,0x01,0x01]);
 let keyReads=0, pinReads=0;
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   ownKeys(){keyReads++;throw Error('key inspected before scalar validation');}
 });
 const genesisPin=new Proxy({...input.genesisPin},{
   ownKeys(){pinReads++;throw Error('PIN inspected before scalar validation');}
 });
 for(const components of [
   [oversizedInteger,one],
   [one,oversizedInteger]
 ]) {
   const sequence=Buffer.concat(components);
   const signature=Buffer.concat([Buffer.from([0x30,sequence.length]),sequence]);
   const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk,genesisPin,
     signatureBase64Url:signature.toString('base64url')});
   assert.equal(keyReads,0);
   assert.equal(pinReads,0);
   assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});

test('P-256 ECDSA scalar greater than curve order is rejected',()=>{
 const input=setup();
 const overOrder=Buffer.from(
   'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632552','hex');
 const component=Buffer.concat([Buffer.from([0x02,0x21,0x00]),overOrder]);
 const one=Buffer.from([0x02,0x01,0x01]);
 const contents=Buffer.concat([one,component]);
 const signature=Buffer.concat([Buffer.from([0x30,contents.length]),contents]);
 const r=inspectSignedAuditHeadAnchor({...input,
   signatureBase64Url:signature.toString('base64url')});
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
});


test('ECDSA DER rejects zero, negative and trailing encoded scalar bytes before key access',()=>{
 const input=setup();
 const one=Buffer.from([0x02,0x01,0x01]);
 const invalid=[
   Buffer.from([0x02,0x01,0x00]), // zero INTEGER
   Buffer.from([0x02,0x01,0x80]), // negative INTEGER
   Buffer.from([0x02,0x02,0x00,0x01]), // redundant sign prefix
   Buffer.from([0x02,0x01,0x7f,0x00]) // trailing byte after two integers
 ];
 for (const bad of invalid) {
   for (const position of [0,1]) {
     const components=position===0?[bad,one]:[one,bad];
     const body=Buffer.concat(components);
     const signature=Buffer.concat([Buffer.from([0x30,body.length]),body]);
     let keyReads=0;
     const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
       ownKeys(){keyReads++;throw Error('malformed DER must not reach key parsing');}
     });
     const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk,
       signatureBase64Url:signature.toString('base64url')});
     assert.equal(keyReads,0,'case '+position+' '+bad.toString('hex'));
     assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
     assert.equal(r.anchorSignatureValid,false);
     assert.equal(r.anchoredLedgerMatched,false);
     assert.equal(r.authorization,'DENY');
   }
 }
});

test('P-256 order minus one remains a parseable positive scalar',()=>{
 const input=setup();
 const high=Buffer.from(
   'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632550','hex');
 const highInteger=Buffer.concat([Buffer.from([0x02,0x21,0x00]),high]);
 const one=Buffer.from([0x02,0x01,0x01]);
 for(const parts of [[highInteger,one],[one,highInteger]]){
   let keyReads=0;
   const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
     ownKeys(target){keyReads++;return Reflect.ownKeys(target);}
   });
   const body=Buffer.concat(parts);
   const signature=Buffer.concat([Buffer.from([0x30,body.length]),body]);
   const r=inspectSignedAuditHeadAnchor({...input,anchorPublicJwk,
     signatureBase64Url:signature.toString('base64url')});
   assert.equal(keyReads,1,'valid P-256 boundary must reach cryptographic key verification');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});


test('signed audit anchor rejects reordered top-level JSON members',()=>{
 const doc=document();
 const reordered={sequence:doc.sequence,schema:doc.schema,
   headHash:doc.headHash,genesisPin:doc.genesisPin,currentPin:doc.currentPin};
 const input=setup(reordered);
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('signed audit anchor rejects reordered nested PIN members',()=>{
 const doc=document();
 const pin=doc.genesisPin;
 const genesisPin={revision:pin.revision,schema:pin.schema,
   issuerFingerprint:pin.issuerFingerprint,registrySha256:pin.registrySha256};
 const input=setup({...doc,genesisPin});
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('P-256 DER transport rejects >96 base64url characters before PIN and JWK access',()=>{
 const input=setup();
 let pinReads=0, keyReads=0;
 const genesisPin=new Proxy({...input.genesisPin},{
   ownKeys(){pinReads++;throw Error('PIN must not be inspected');}
 });
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   ownKeys(){keyReads++;throw Error('JWK must not be inspected');}
 });
 for(const signatureBase64Url of ['A'.repeat(97),'A'.repeat(107)]){
   const r=inspectSignedAuditHeadAnchor({...input,signatureBase64Url,
     genesisPin,anchorPublicJwk});
   assert.equal(pinReads,0);
   assert.equal(keyReads,0);
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});

test('maximum transport-length base64url still reaches DER parser',()=>{
 const input=setup();
 // 72 zero bytes encode to the maximum 96-character transport length,
 // but are not a valid ASN.1 DER ECDSA signature.
 const signatureBase64Url=Buffer.alloc(72).toString('base64url');
 assert.equal(signatureBase64Url.length,96);
 const r=inspectSignedAuditHeadAnchor({...input,signatureBase64Url});
 assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('valid ECDSA signatures from another domain cannot authenticate a Citadel audit anchor',()=>{
 const original=setup();
 for(const domain of [
   Buffer.alloc(0),
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V2\n'),
   Buffer.from('PALACO-CITADEL-REGISTRY-PIN-V1\n')
 ]) {
   const signatureBase64Url=sign('sha256',
     Buffer.concat([domain,original.anchorBytes]),pair.privateKey).toString('base64url');
   const r=inspectSignedAuditHeadAnchor({...original,signatureBase64Url});
   assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.executionAllowed,false);
   assert.equal(r.releaseAllowed,false);
 }
});

test('audit domain prefix requires exact version and trailing newline',()=>{
 const original=setup();
 for(const prefix of [
   'PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1',
   'PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\r\n',
   'PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n\n'
 ]) {
   const signatureBase64Url=sign('sha256',
     Buffer.concat([Buffer.from(prefix),original.anchorBytes]),
     pair.privateKey).toString('base64url');
   const r=inspectSignedAuditHeadAnchor({...original,signatureBase64Url});
   assert.equal(r.reason,'ANCHOR_SIGNATURE_INVALID');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});


test('shared-memory audit bytes fail closed before PIN and key inspection',()=>{
 const input=setup();
 const shared=new SharedArrayBuffer(input.anchorBytes.length);
 const anchorBytes=new Uint8Array(shared);
 anchorBytes.set(input.anchorBytes);
 let keyReads=0, pinReads=0;
 const anchorPublicJwk=new Proxy({...input.anchorPublicJwk},{
   ownKeys(){keyReads++;throw Error('untrusted key must not be inspected');}
 });
 const genesisPin=new Proxy({...input.genesisPin},{
   ownKeys(){pinReads++;throw Error('untrusted PIN must not be inspected');}
 });
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes,anchorPublicJwk,genesisPin});
 assert.equal(keyReads,0);
 assert.equal(pinReads,0);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('ordinary isolated Uint8Array audit bytes preserve read-only verification',()=>{
 const input=setup();
 const anchorBytes=Uint8Array.from(input.anchorBytes);
 assert.equal(anchorBytes.buffer instanceof SharedArrayBuffer,false);
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes});
 assert.equal(r.anchorSignatureValid,true,JSON.stringify(r));
 assert.equal(r.anchoredLedgerMatched,true);
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
 assert.equal(r.releaseAllowed,false);
});


test('signed nested duplicate PIN fields are rejected as noncanonical JSON',()=>{
 const input=setup();
 const original=input.anchorBytes.toString('utf8');
 const marker='"revision":1,';
 assert.ok(original.includes(marker));
 const duplicate=original.replace(marker,'"revision":1,"revision":1,');
 const anchorBytes=Buffer.from(duplicate,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes,signatureBase64Url});
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('signed alternative JSON numeric notation cannot alias an audit sequence',()=>{
 const input=setup();
 const canonical=input.anchorBytes.toString('utf8');
 const changed=canonical.replace('"sequence":1,','"sequence":1.0,');
 assert.notEqual(changed,canonical);
 const anchorBytes=Buffer.from(changed,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes,signatureBase64Url});
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
});

test('signed escaped JSON schema character does not alias canonical audit schema',()=>{
 const input=setup();
 const canonical=input.anchorBytes.toString('utf8');
 const changed=canonical.replace('palaco-citadel-audit-head-anchor-v1',
   'palaco-citadel-audit-head-anchor-v\\u0031');
 assert.notEqual(changed,canonical);
 const anchorBytes=Buffer.from(changed,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...input,anchorBytes,signatureBase64Url});
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
});


test('validly signed UTF-8 BOM audit document is rejected without ledger access',()=>{
 const original=setup();
 const anchorBytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),original.anchorBytes]);
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 let ledgerEnumerations=0;
 const entries=new Proxy([...original.entries],{
   ownKeys(){ledgerEnumerations++;throw Error('BOM document must not reach ledger');}
 });
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url,entries});
 assert.equal(ledgerEnumerations,0);
 assert.equal(r.reason,'MALFORMED_OR_UNTRUSTED_ANCHOR');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('validly signed invalid UTF-8 cannot reach ledger verification',()=>{
 const original=setup();
 const anchorBytes=Buffer.concat([
   Buffer.from([0xc0,0xaf]),original.anchorBytes
 ]);
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 let ledgerEnumerations=0;
 const entries=new Proxy([...original.entries],{
   ownKeys(){ledgerEnumerations++;throw Error('invalid UTF-8 must not reach ledger');}
 });
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url,entries});
 assert.equal(ledgerEnumerations,0);
 assert.equal(r.reason,'MALFORMED_OR_UNTRUSTED_ANCHOR');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
});


test('signed exponent-form audit sequence cannot alias canonical integer JSON',()=>{
 const original=setup();
 const canonical=original.anchorBytes.toString('utf8');
 const changed=canonical.replace('"sequence":1,','"sequence":1e0,');
 assert.notEqual(changed,canonical);
 const anchorBytes=Buffer.from(changed,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 let ledgerReads=0;
 const entries=new Proxy([...original.entries],{
   ownKeys(){ledgerReads++;throw Error('noncanonical sequence must not reach ledger');}
 });
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url,entries});
 assert.equal(ledgerReads,0);
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('signed noncanonical PIN revision exponent cannot alias original revision',()=>{
 const original=setup();
 const canonical=original.anchorBytes.toString('utf8');
 const changed=canonical.replace('"revision":1,','"revision":1e0,');
 assert.notEqual(changed,canonical);
 const anchorBytes=Buffer.from(changed,'utf8');
 const signatureBase64Url=sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
 ]),pair.privateKey).toString('base64url');
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url});
 assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
});

test('signed trailing JSON whitespace cannot be silently normalized',()=>{
 const original=setup();
 for(const suffix of ['\n','\t',' ']){
   const anchorBytes=Buffer.concat([original.anchorBytes,Buffer.from(suffix)]);
   const signatureBase64Url=sign('sha256',Buffer.concat([
     Buffer.from('PALACO-CITADEL-AUDIT-HEAD-ANCHOR-V1\n'),anchorBytes
   ]),pair.privateKey).toString('base64url');
   const r=inspectSignedAuditHeadAnchor({...original,anchorBytes,signatureBase64Url});
   assert.equal(r.reason,'NONCANONICAL_ANCHOR_DOCUMENT');
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});


test('P-256 JWK coordinates equal to field prime are rejected before key import',()=>{
 const original=setup();
 const prime=Buffer.from('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff','hex')
   .toString('base64url');
 assert.equal(prime.length,43);
 for (const coordinate of ['x','y']){
   const anchorPublicJwk={...original.anchorPublicJwk,[coordinate]:prime};
   const r=inspectSignedAuditHeadAnchor({...original,anchorPublicJwk});
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT',coordinate);
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.executionAllowed,false);
   assert.equal(r.releaseAllowed,false);
 }
});

test('P-256 coordinates above field prime are rejected consistently',()=>{
 const original=setup();
 const tooLarge=Buffer.alloc(32,255).toString('base64url');
 for (const coordinate of ['x','y']){
   const anchorPublicJwk={...original.anchorPublicJwk,[coordinate]:tooLarge};
   const r=inspectSignedAuditHeadAnchor({...original,anchorPublicJwk});
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT',coordinate);
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
 }
});

test('unchanged valid P-256 JWK still verifies signed anchor after field preflight',()=>{
 const r=inspectSignedAuditHeadAnchor(setup());
 assert.equal(r.anchorSignatureValid,true,JSON.stringify(r));
 assert.equal(r.anchoredLedgerMatched,true);
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('in-range P-256 JWK coordinates not on curve fail before cryptographic import',()=>{
 const original=setup();
 const zero=Buffer.alloc(32).toString('base64url');
 for(const anchorPublicJwk of [
   {...original.anchorPublicJwk,x:zero,y:zero},
   {...original.anchorPublicJwk,y:zero}
 ]){
   const r=inspectSignedAuditHeadAnchor({...original,anchorPublicJwk});
   assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
   assert.equal(r.anchorSignatureValid,false);
   assert.equal(r.anchoredLedgerMatched,false);
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});

test('legitimate P-256 public point still verifies the signed audit anchor',()=>{
 const input=setup();
 const r=inspectSignedAuditHeadAnchor(input);
 assert.equal(r.anchorSignatureValid,true,JSON.stringify(r));
 assert.equal(r.anchoredLedgerMatched,true);
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
 assert.equal(r.releaseAllowed,false);
});


test('malicious genesis PIN hash object cannot execute implicit string coercion',()=>{
 const input=setup();
 let coercions=0;
 const hostileHash={
   toString(){coercions++;throw Error('untrusted PIN toString executed');},
   valueOf(){coercions++;throw Error('untrusted PIN valueOf executed');}
 };
 const genesisPin={...input.genesisPin,registrySha256:hostileHash};
 const r=inspectSignedAuditHeadAnchor({...input,genesisPin});
 assert.equal(coercions,0);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('malicious current PIN issuer object cannot execute implicit string coercion',()=>{
 const input=setup();
 let coercions=0;
 const hostileIssuer={
   [Symbol.toPrimitive](){coercions++;throw Error('untrusted PIN primitive conversion executed');}
 };
 const currentPin={...input.currentPin,issuerFingerprint:hostileIssuer};
 const r=inspectSignedAuditHeadAnchor({...input,currentPin});
 assert.equal(coercions,0);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});


test('Uint8Array subclass valueOf cannot run during audit-byte snapshot',()=>{
 const original=setup();
 let coercions=0;
 class HostileBytes extends Uint8Array {
   valueOf(){coercions++;throw Error('subclass valueOf must never run');}
 }
 const anchorBytes=new HostileBytes(original.anchorBytes);
 const r=inspectSignedAuditHeadAnchor({...original,anchorBytes});
 assert.equal(coercions,0);
 assert.equal(r.reason,'INVALID_ANCHOR_INPUT');
 assert.equal(r.anchorSignatureValid,false);
 assert.equal(r.anchoredLedgerMatched,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.releaseAllowed,false);
});

test('ordinary Buffer and Uint8Array remain valid byte inputs',()=>{
 const original=setup();
 for(const anchorBytes of [
   Buffer.from(original.anchorBytes),
   Uint8Array.from(original.anchorBytes)
 ]){
   const r=inspectSignedAuditHeadAnchor({...original,anchorBytes});
   assert.equal(r.anchorSignatureValid,true,JSON.stringify(r));
   assert.equal(r.anchoredLedgerMatched,true);
   assert.equal(r.trust,'NOT_ESTABLISHED');
   assert.equal(r.authorization,'DENY');
   assert.equal(r.releaseAllowed,false);
 }
});
