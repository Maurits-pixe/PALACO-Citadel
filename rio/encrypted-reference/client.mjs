// Browser/Node Web Crypto reference. Test-only; not an audited messaging protocol.
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true});
const VERSION='rio-encrypted-reference/0.1';
const SUITE='RSA-OAEP-3072-SHA256+A256GCM+ECDSA-P256-SHA256';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_BYTES=512, MAX_ENVELOPE=4096, MAX_MESSAGES=128;
const fail=()=>{throw new Error('ENCRYPTED_TRANSFER_NOT_ACCEPTED');};
function exact(value,keys) {
  return value!==null && typeof value==='object' && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value))
    && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
}
export function canonicalEncrypted(value) {
  if(value===null || ['string','boolean'].includes(typeof value))return JSON.stringify(value);
  if(typeof value==='number' && Number.isSafeInteger(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalEncrypted).join(',')+']';
  if(value && typeof value==='object' && [Object.prototype,null].includes(Object.getPrototypeOf(value))) {
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalEncrypted(value[k])).join(',')+'}';
  }
  return fail();
}
function freeze(value) {
  if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
export function encodeEncryptedBytes(bytes) {
  let binary='';for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeEncryptedBytes(text,max=MAX_ENVELOPE) {
  if(typeof text!=='string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length>Math.ceil(max*4/3))return fail();
  let bytes;
  try{bytes=Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{return fail();}
  if(!bytes.length || bytes.length>max || encodeEncryptedBytes(bytes)!==text)return fail();
  return bytes;
}
async function digest(bytes){return encodeEncryptedBytes(await crypto.subtle.digest('SHA-256',bytes));}
export async function encryptedEnvelopeDigest(envelope) {
  return digest(encoder.encode(canonicalEncrypted(envelope)));
}
function stamp(value) {
  const time=typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(time) && new Date(time).toISOString()===value?time:NaN;
}
function validContext(context,time,senderId,receiverId) {
  if(!exact(context,['channelId','messageId','senderId','receiverId','issuedAt','expiresAt'])
    || !['channelId','messageId','senderId','receiverId'].every(k=>typeof context[k]==='string'&&ID.test(context[k]))
    || context.senderId!==senderId || context.receiverId!==receiverId
    || !Number.isFinite(stamp(context.issuedAt)) || !Number.isFinite(stamp(context.expiresAt))
    || stamp(context.issuedAt)>time || stamp(context.expiresAt)<=time
    || stamp(context.expiresAt)-stamp(context.issuedAt)>300_000)return fail();
}
function copy(value){return JSON.parse(canonicalEncrypted(value));}

/** Private keys remain in this endpoint closure and are not exportable. */
export async function createEncryptedTestEndpoint({classification,role,id,now=()=>new Date().toISOString()}={}) {
  if(classification!=='SYNTHETIC_ONLY' || !['SENDER','RECEIVER'].includes(role)
    || typeof id!=='string' || !ID.test(id) || typeof now!=='function')return fail();
  let keys=await crypto.subtle.generateKey(role==='SENDER'
    ? {name:'ECDSA',namedCurve:'P-256'}
    : {name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
    false,role==='SENDER'?['sign','verify']:['encrypt','decrypt']);
  const spki=new Uint8Array(await crypto.subtle.exportKey('spki',keys.publicKey));
  const publicIdentity=freeze({schemaVersion:VERSION,classification,role,id,
    algorithm:role==='SENDER'?'ECDSA-P256-SHA256':'RSA-OAEP-3072-SHA256',
    spki:encodeEncryptedBytes(spki),pin:await digest(spki)});
  let peer=null,peerKey=null,closed=false,busy=false,lastClock=-Infinity;
  const sent=new Set(), received=new Set();
  function clock(){
    const time=stamp(now());
    if(closed || !Number.isFinite(time) || time<lastClock)return fail();
    lastClock=time;return time;
  }
  async function connect(input,expectedPin,expectedId) {
    if(closed || busy || peer)return fail();busy=true;
    try {
      const candidate=copy(input);
      if(!exact(candidate,['schemaVersion','classification','role','id','algorithm','spki','pin'])
        || candidate.schemaVersion!==VERSION || candidate.classification!==classification
        || candidate.role===(role) || !['SENDER','RECEIVER'].includes(candidate.role)
        || typeof candidate.id!=='string'||!ID.test(candidate.id)||candidate.id===id
        || candidate.algorithm!==(role==='SENDER'?'RSA-OAEP-3072-SHA256':'ECDSA-P256-SHA256')
        || typeof expectedId!=='string'||candidate.id!==expectedId
        || typeof expectedPin!=='string'||candidate.pin!==expectedPin)return fail();
      const raw=decodeEncryptedBytes(candidate.spki,1024);
      if(await digest(raw)!==expectedPin)return fail();
      const key=await crypto.subtle.importKey('spki',raw,role==='SENDER'
        ? {name:'RSA-OAEP',hash:'SHA-256'}:{name:'ECDSA',namedCurve:'P-256'},false,
        role==='SENDER'?['encrypt']:['verify']);
      if(role==='SENDER' && (key.algorithm.modulusLength!==3072
        || encodeEncryptedBytes(key.algorithm.publicExponent)!=='AQAB'))return fail();
      if(closed)return fail();
      peer=freeze(candidate);peerKey=key;return true;
    }catch{return fail();}finally{busy=false;}
  }
  function parties(){return role==='SENDER'?[id,peer.id]:[peer.id,id];}
  async function seal(text,inputContext) {
    if(closed || busy || role!=='SENDER' || !peer)return fail();busy=true;
    let secret=null;
    try {
      const context=copy(inputContext),time=clock(),[senderId,receiverId]=parties();
      validContext(context,time,senderId,receiverId);
      if(typeof text!=='string'||!text.trim())return fail();
      const bytes=encoder.encode(text);
      if(bytes.length>MAX_BYTES || decoder.decode(bytes)!==text || sent.has(context.messageId)||sent.size>=MAX_MESSAGES)return fail();
      const header={schemaVersion:VERSION,classification,suite:SUITE,context,
        senderPin:publicIdentity.pin,receiverPin:peer.pin};
      const aad=encoder.encode(canonicalEncrypted(header)),label=await crypto.subtle.digest('SHA-256',aad);
      secret=crypto.getRandomValues(new Uint8Array(32));
      const contentKey=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['encrypt']);
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},contentKey,bytes);
      const wrappedKey=await crypto.subtle.encrypt({name:'RSA-OAEP',label},peerKey,secret);
      const unsigned={header,iv:encodeEncryptedBytes(iv),wrappedKey:encodeEncryptedBytes(wrappedKey),
        ciphertext:encodeEncryptedBytes(ciphertext)};
      const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,
        encoder.encode(canonicalEncrypted(unsigned)));
      const envelope={...unsigned,signature:encodeEncryptedBytes(signature)};
      if(encoder.encode(canonicalEncrypted(envelope)).length>MAX_ENVELOPE || closed)return fail();
      validContext(context,clock(),senderId,receiverId);
      sent.add(context.messageId);
      return freeze(envelope);
    }catch{return fail();}finally{secret?.fill(0);busy=false;}
  }
  async function inspect(input,inputContext,consume,deliveredDigest) {
    if(closed || busy || role!=='RECEIVER' || !peer)return fail();busy=true;
    let secret=null;
    try {
      const envelope=copy(input),expected=copy(inputContext),time=clock(),[senderId,receiverId]=parties();
      validContext(expected,time,senderId,receiverId);
      if(encoder.encode(canonicalEncrypted(envelope)).length>MAX_ENVELOPE
        || !exact(envelope,['header','iv','wrappedKey','ciphertext','signature'])
        || !exact(envelope.header,['schemaVersion','classification','suite','context','senderPin','receiverPin'])
        || envelope.header.schemaVersion!==VERSION || envelope.header.classification!==classification
        || envelope.header.suite!==SUITE || envelope.header.senderPin!==peer.pin
        || envelope.header.receiverPin!==publicIdentity.pin
        || canonicalEncrypted(envelope.header.context)!==canonicalEncrypted(expected)
        || received.has(expected.messageId) || (consume&&received.size>=MAX_MESSAGES))return fail();
      const envelopeDigest=await encryptedEnvelopeDigest(envelope);
      if(consume && deliveredDigest!==envelopeDigest)return fail();
      const iv=decodeEncryptedBytes(envelope.iv,12),wrapped=decodeEncryptedBytes(envelope.wrappedKey,384);
      const ciphertext=decodeEncryptedBytes(envelope.ciphertext,MAX_BYTES+16),signature=decodeEncryptedBytes(envelope.signature,64);
      if(iv.length!==12||wrapped.length!==384||signature.length!==64||ciphertext.length<17)return fail();
      const unsigned={header:envelope.header,iv:envelope.iv,wrappedKey:envelope.wrappedKey,ciphertext:envelope.ciphertext};
      if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},peerKey,signature,
        encoder.encode(canonicalEncrypted(unsigned))))return fail();
      const aad=encoder.encode(canonicalEncrypted(envelope.header)),label=await crypto.subtle.digest('SHA-256',aad);
      secret=new Uint8Array(await crypto.subtle.decrypt({name:'RSA-OAEP',label},keys.privateKey,wrapped));
      if(secret.length!==32)return fail();
      const key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['decrypt']);
      const bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,ciphertext));
      const text=decoder.decode(bytes);
      if(!text.trim() || bytes.length>MAX_BYTES || closed)return fail();
      validContext(expected,clock(),senderId,receiverId);
      if(consume)received.add(expected.messageId);
      return freeze({text,envelopeDigest,classification,mode:'ENCRYPTED_REFERENCE_ONLY'});
    }catch{return fail();}finally{secret?.fill(0);busy=false;}
  }
  function close(){if(busy)return false;closed=true;keys=null;peerKey=null;peer=null;sent.clear();received.clear();return true;}
  return Object.freeze({publicIdentity,connect,seal,
    preview:(envelope,context)=>inspect(envelope,context,false),
    acceptDelivered:(envelope,context,hostDeliveredDigest)=>inspect(envelope,context,true,hostDeliveredDigest),close});
}
