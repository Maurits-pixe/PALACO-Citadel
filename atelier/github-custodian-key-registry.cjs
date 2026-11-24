'use strict';
// Offline trust registry: only an OUT-OF-BAND SHA-256 pin authorizes a snapshot.
// No registry or private key is embedded into GitHub Actions.
const crypto=require('node:crypto');
const fs=require('node:fs');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const {verifyReceipt}=require('./github-external-receipt-verify.cjs');
const HASH=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9_.:-]{3,100}$/;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const ALLOWED=['schema','version','previous_sha256','keys','decision','publication','release_approved','evidence_usable'];
const KEY_FIELDS=['key_id','custodian_id','public_key_pem','spki_sha256','status','valid_from','valid_until'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const canonical=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const exact=(v,fields)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(Object.keys(v).sort())===JSON.stringify([...fields].sort());
function parseUtc(s){
 if(typeof s!=='string'||!DATE.test(s)||!Number.isFinite(Date.parse(s))||
 new Date(s).toISOString().replace('.000Z','Z')!==s)throw Error('Invalid registry UTC timestamp');
 return Date.parse(s);
}
function parseRegistry(raw,pin){
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>60000||!HASH.test(pin||'')||sha(raw)!==pin)
 throw Error('Registry is not independently pinned');
 let r;try{r=JSON.parse(raw.toString('utf8'));}catch{throw Error('Invalid registry JSON');}
 if(!exact(r,ALLOWED)||!raw.equals(canonical(r))||
 r.schema!=='palaco.citadel.atelier.custodian-key-registry/1'||
 !Number.isSafeInteger(r.version)||r.version<1||
 !(r.previous_sha256===null||HASH.test(r.previous_sha256||''))||
 (r.version===1)!==(r.previous_sha256===null)||
 !Array.isArray(r.keys)||r.keys.length===0||r.keys.length>64||
 r.decision!=='HOLD'||r.publication!=='DENY'||
 r.release_approved!==false||r.evidence_usable!==false)
 throw Error('Invalid registry schema or HOLD policy');
 const ids=new Set(),pins=new Set();
 for(const k of r.keys){
  if(!exact(k,KEY_FIELDS)||!ID.test(k.key_id||'')||!ID.test(k.custodian_id||'')||
  !HASH.test(k.spki_sha256||'')||
  !['ACTIVE','RETIRED','REVOKED'].includes(k.status)||
  typeof k.public_key_pem!=='string'||k.public_key_pem.length>500||
  ids.has(k.key_id)||pins.has(k.spki_sha256))throw Error('Duplicate or invalid custodian key record');
  ids.add(k.key_id);pins.add(k.spki_sha256);
  const start=parseUtc(k.valid_from),end=k.valid_until===null?null:parseUtc(k.valid_until);
  if(end!==null&&end<=start||k.status==='RETIRED'&&end===null||
  k.status==='ACTIVE'&&end!==null)throw Error('Invalid key validity or rotation status');
  let pub;
  try{pub=crypto.createPublicKey(k.public_key_pem);}catch{throw Error('Invalid custodian public key');}
  if(pub.asymmetricKeyType!=='ed25519'||
    sha(pub.export({format:'der',type:'spki'}))!==k.spki_sha256)
   throw Error('Key material does not match pinned SPKI fingerprint');
 }
 return r;
}
function checkEvolution(previousBytes,previousPin,nextBytes,nextPin){
 const old=parseRegistry(previousBytes,previousPin),next=parseRegistry(nextBytes,nextPin);
 if(next.version!==old.version+1||next.previous_sha256!==previousPin)
 throw Error('Registry update violates monotonic version or previous digest');
 const before=new Map(old.keys.map(k=>[k.key_id,k]));
 const after=new Map(next.keys.map(k=>[k.key_id,k]));
 for(const [id,prior] of before){
  const current=after.get(id);
  if(!current)throw Error('Historical custodian key cannot disappear');
  for(const f of ['key_id','custodian_id','public_key_pem','spki_sha256','valid_from'])
   if(current[f]!==prior[f])throw Error('Historical custodian key identity changed');
  if(prior.status==='REVOKED'&&current.status!=='REVOKED')
   throw Error('Revoked key cannot be resurrected');
  if(prior.status==='RETIRED'&&current.status==='ACTIVE')
   throw Error('Retired key cannot be reactivated');
  if(prior.status==='ACTIVE'&&current.status==='RETIRED'&&current.valid_until===null)
   throw Error('Retired key requires cutoff');
  if(prior.status!=='ACTIVE'&&current.valid_until!==prior.valid_until)
   throw Error('Historical cutoff cannot be rewritten');
  if(prior.status==='ACTIVE'&&current.status==='ACTIVE'&&current.valid_until!==null)
   throw Error('Active key cannot have cutoff');
 }
 return next;
}
function verifyWithRegistry(receiptBytes,handoffBytes,registryBytes,pin,custodian,keyId){
 const r=parseRegistry(registryBytes,pin);
 if(!ID.test(custodian||'')||!ID.test(keyId||''))throw Error('Missing key selection');
 const k=r.keys.find(x=>x.key_id===keyId&&x.custodian_id===custodian);
 if(!k||k.status==='REVOKED')throw Error('Unknown or revoked custody signing key');
 let envelope;
 try{envelope=JSON.parse(receiptBytes.toString('utf8'));}catch{throw Error('Malformed custody receipt');}
 const ts=parseUtc(envelope?.payload?.received_at);
 if(ts<parseUtc(k.valid_from)||k.valid_until!==null&&ts>=parseUtc(k.valid_until))
 throw Error('Receipt outside pinned key validity interval');
 const verified=verifyReceipt(receiptBytes,handoffBytes,k.public_key_pem,custodian,k.spki_sha256);
 return {...verified,registry_version:r.version,registry_sha256:pin,key_id:k.key_id,
  result:'PINNED_REGISTRY_SIGNATURE_VALID_CUSTODY_UNPROVEN',
  limitation:'Pinned key snapshot and signature verified; historical receipt time is signed but not independently time-attested; custody and release remain unproven'};
}
function main(args,env=process.env){
 if(args.length!==4)throw Error('Usage: node github-custodian-key-registry.cjs RECEIPT HANDOFF REGISTRY PIN');
 const result=verifyWithRegistry(loadBounded(args[0],12000),loadBounded(args[1],20000),
 loadBounded(args[2],60000),args[3],env.PALACO_TRUSTED_CUSTODIAN_ID,env.PALACO_TRUSTED_KEY_ID);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write('Custodian registry DENY: '+e.message+'\n');process.exitCode=1;}}
module.exports={parseRegistry,checkEvolution,verifyWithRegistry,canonical,sha};
