// Trusted-host, SYNTHETIC_ONLY device replacement and transfer authority.
// Public keys and bounded replay metadata are durable; private keys never enter this registry.
import { DatabaseSync } from 'node:sqlite';
import { createHash, createPublicKey, publicEncrypt, verify, randomBytes, randomUUID, timingSafeEqual, constants } from 'node:crypto';
import { existsSync, lstatSync, openSync, closeSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const VERSION='rio-device-recovery-registry/0.1', IDENTITY='rio-encrypted-reference/0.1';
const RECOVERY='rio-device-recovery/0.1', CLASS='SYNTHETIC_ONLY';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, ROLES=['SENDER','RECEIVER'];
const TABLE='CREATE TABLE rio_recovery (id INTEGER PRIMARY KEY CHECK(id=1), state_json TEXT NOT NULL) STRICT';
const STATE_KEYS=['schemaVersion','classification','revision','parties','pending','sent','received','retiredPins','replacements','maxClock'];
const IDENTITY_KEYS=['schemaVersion','classification','role','id','algorithm','spki','pin'];
const CONTEXT_KEYS=['channelId','messageId','senderId','receiverId','issuedAt','expiresAt'];
const RECOVERY_KEYS=['schemaVersion','classification','id','role','pairRevision','accountId','oldPin','newPin','oldDeviceId','newDeviceId','peerPin','peerDeviceId','peerAccountId','issuedAt','expiresAt'];
const fail=()=>{throw new Error('RECOVERY_NOT_ACCEPTED');};
const token=value=>typeof value==='string'&&ID.test(value);
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function exact(value,keys){return plain(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isSafeInteger(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return fail();
}
function copy(value){return JSON.parse(canonical(value));}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function stamp(value){const time=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(time)&&new Date(time).toISOString()===value&&time>=0?time:NaN;}
function bytes(value,max){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length>Math.ceil(max*4/3))return fail();
  const raw=Buffer.from(value,'base64url');
  if(!raw.length||raw.length>max||raw.toString('base64url')!==value)return fail();
  return raw;
}
function pin(value){return typeof value==='string'&&value.length===43&&bytes(value,32).length===32;}
function identity(value,role){
  if(!exact(value,IDENTITY_KEYS)||value.schemaVersion!==IDENTITY||value.classification!==CLASS
    ||!ROLES.includes(value.role)||(role&&value.role!==role)||!token(value.id)
    ||value.algorithm!==(value.role==='SENDER'?'ECDSA-P256-SHA256':'RSA-OAEP-3072-SHA256')||!pin(value.pin))return fail();
  const raw=bytes(value.spki,1024);
  if(createHash('sha256').update(raw).digest('base64url')!==value.pin)return fail();
  const key=createPublicKey({key:raw,format:'der',type:'spki'}),details=key.asymmetricKeyDetails;
  if(!key.export({format:'der',type:'spki'}).equals(raw)
    ||(value.role==='SENDER'?(key.asymmetricKeyType!=='ec'||details?.namedCurve!=='prime256v1')
      :(key.asymmetricKeyType!=='rsa'||details?.modulusLength!==3072||details?.publicExponent!==65537n)))return fail();
  return key;
}
function parties(value){
  if(!exact(value,ROLES))return fail();
  for(const role of ROLES){if(!exact(value[role],['identity','deviceId'])||!token(value[role].deviceId))return fail();identity(value[role].identity,role);}
  if(value.SENDER.identity.id===value.RECEIVER.identity.id||value.SENDER.identity.pin===value.RECEIVER.identity.pin
    ||value.SENDER.deviceId===value.RECEIVER.deviceId)return fail();
}
function context(value){
  if(!exact(value,CONTEXT_KEYS)||!['channelId','messageId','senderId','receiverId'].every(k=>token(value[k]))
    ||!Number.isFinite(stamp(value.issuedAt))||!Number.isFinite(stamp(value.expiresAt))
    ||stamp(value.expiresAt)<=stamp(value.issuedAt)||stamp(value.expiresAt)-stamp(value.issuedAt)>300_000)return fail();
}
function challenge(value){
  if(!exact(value,['context','wrappedChallenge'])||!exact(value.context,RECOVERY_KEYS))return fail();
  const c=value.context;
  if(c.schemaVersion!==RECOVERY||c.classification!==CLASS||!ROLES.includes(c.role)
    ||typeof c.id!=='string'||!/^recovery-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.id)
    ||!Number.isSafeInteger(c.pairRevision)||c.pairRevision<1
    ||!['accountId','oldDeviceId','newDeviceId','peerDeviceId','peerAccountId'].every(k=>token(c[k]))
    ||!['oldPin','newPin','peerPin'].every(k=>pin(c[k]))
    ||!Number.isFinite(stamp(c.issuedAt))||stamp(c.expiresAt)-stamp(c.issuedAt)!==120_000)return fail();
  if(c.role==='SENDER'?value.wrappedChallenge!==null:bytes(value.wrappedChallenge,384).length!==384)return fail();
}
function state(value){
  if(!exact(value,STATE_KEYS)||value.schemaVersion!==VERSION||value.classification!==CLASS
    ||!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isSafeInteger(value.maxClock)||value.maxClock<0
    ||!Number.isSafeInteger(value.replacements)||value.replacements<0||value.replacements>8
    ||!Array.isArray(value.retiredPins)||value.retiredPins.length!==value.replacements
    ||new Set(value.retiredPins).size!==value.retiredPins.length||!value.retiredPins.every(x=>pin(x))
    ||!Array.isArray(value.sent)||value.sent.length>128||!Array.isArray(value.received)||value.received.length>128
    ||new Set(value.received).size!==value.received.length||!value.received.every(token))return fail();
  if(value.parties===null){
    if(value.revision!==0||value.pending!==null||value.sent.length||value.received.length||value.replacements)return fail();
  }else{
    parties(value.parties);
    if(value.revision!==value.replacements+1||ROLES.some(role=>value.retiredPins.includes(value.parties[role].identity.pin)))return fail();
  }
  const sentIds=new Set();
  for(const sent of value.sent){
    if(!exact(sent,['messageId','context','deviceId','pairRevision','done','envelopeDigest'])||!token(sent.messageId)||sentIds.has(sent.messageId)
      ||!token(sent.deviceId)||!Number.isSafeInteger(sent.pairRevision)||sent.pairRevision<1||sent.pairRevision>value.revision
      ||typeof sent.done!=='boolean'||(sent.done?!pin(sent.envelopeDigest):sent.envelopeDigest!==null))return fail();
    context(sent.context);
    if(sent.context.messageId!==sent.messageId||sent.context.senderId!==value.parties?.SENDER.identity.id
      ||sent.context.receiverId!==value.parties?.RECEIVER.identity.id)return fail();
    sentIds.add(sent.messageId);
  }
  if(value.received.some(id=>!value.sent.some(row=>row.messageId===id&&row.done)))return fail();
  if(value.pending!==null){
    const p=value.pending;
    if(!value.parties||!exact(p,['challenge','candidateIdentity','nonce','possessed','ownerConfirmed','peerConfirmed'])
      ||![p.possessed,p.ownerConfirmed,p.peerConfirmed].every(x=>typeof x==='boolean')
      ||((p.ownerConfirmed||p.peerConfirmed)&&!p.possessed))return fail();
    challenge(p.challenge);const c=p.challenge.context,role=c.role,peerRole=role==='SENDER'?'RECEIVER':'SENDER';
    identity(p.candidateIdentity,role);
    if(c.pairRevision!==value.revision||c.accountId!==value.parties[role].identity.id
      ||c.oldPin!==value.parties[role].identity.pin||c.oldDeviceId!==value.parties[role].deviceId
      ||c.peerPin!==value.parties[peerRole].identity.pin||c.peerDeviceId!==value.parties[peerRole].deviceId
      ||c.peerAccountId!==value.parties[peerRole].identity.id||c.newPin!==p.candidateIdentity.pin
      ||p.candidateIdentity.id!==c.accountId||value.retiredPins.includes(c.newPin)
      ||c.newPin===c.oldPin||c.newPin===c.peerPin||c.newDeviceId===c.oldDeviceId||c.newDeviceId===c.peerDeviceId
      ||(role==='SENDER'?p.nonce!==null:bytes(p.nonce,32).length!==32))return fail();
  }
  return value;
}

/** This object belongs only to a trusted synthetic test host; approvals are not public actions. */
export function openRioTestRecoveryRegistry({databasePath,classification,now=()=>new Date().toISOString(),fault=()=>undefined}={}){
  let db=null,closed=false,busy=false,lastClock=0;
  try{
    if(classification!==CLASS||typeof databasePath!=='string'||!isAbsolute(databasePath)||databasePath.includes('\0')
      ||typeof now!=='function'||typeof fault!=='function')return fail();
    if(existsSync(databasePath)){const info=lstatSync(databasePath);if(!info.isFile()||info.isSymbolicLink())return fail();}
    else{const descriptor=openSync(databasePath,'wx',0o600);closeSync(descriptor);}
    db=new DatabaseSync(databasePath,{timeout:0,allowExtension:false});
    const version=db.prepare('PRAGMA user_version').get().user_version;
    const schema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if(version===0){
      if(schema.length)return fail();
      db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE');
      db.exec(TABLE);
      const initial={schemaVersion:VERSION,classification:CLASS,revision:0,parties:null,pending:null,
        sent:[],received:[],retiredPins:[],replacements:0,maxClock:0};
      db.prepare('INSERT INTO rio_recovery VALUES(1,?)').run(canonical(initial));
      db.exec('PRAGMA user_version=1; COMMIT');
    }else{
      if(version!==1||schema.length!==1||schema[0].type!=='table'||schema[0].name!=='rio_recovery'||schema[0].sql!==TABLE)return fail();
      db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
    }
    read();
  }catch{try{db?.exec('ROLLBACK');}catch{}try{db?.close();}catch{}return fail();}
  function read(){
    const version=db.prepare('PRAGMA user_version').get().user_version;
    const schema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if(version!==1||schema.length!==1||schema[0].type!=='table'||schema[0].name!=='rio_recovery'||schema[0].sql!==TABLE)return fail();
    const rows=db.prepare('SELECT id,state_json FROM rio_recovery').all();
    if(rows.length!==1||rows[0].id!==1||typeof rows[0].state_json!=='string'||rows[0].state_json.length>262_144)return fail();
    const parsed=JSON.parse(rows[0].state_json);state(parsed);
    if(canonical(parsed)!==rows[0].state_json)return fail();
    return parsed;
  }
  function clock(record){
    const time=stamp(now());
    if(!Number.isFinite(time)||time<record.maxClock||time<lastClock)return fail();
    lastClock=time;return time;
  }
  function transact(work,expiry){
    if(closed||busy)return fail();busy=true;
    try{
      db.exec('BEGIN IMMEDIATE');
      const record=read(),time=clock(record);
      if(typeof expiry==='number'&&time>=expiry)return fail();
      const result=work(record,time);
      const injected=fault('BEFORE_COMMIT');
      if(injected==='ABORT'||(injected&&typeof injected.then==='function'))return fail();
      const finalTime=clock(record);
      const deadline=typeof expiry==='function'?expiry(record):expiry;
      if(deadline!==undefined&&finalTime>=deadline)return fail();
      record.maxClock=finalTime;state(record);
      db.prepare('UPDATE rio_recovery SET state_json=? WHERE id=1').run(canonical(record));
      const writtenFault=fault('AFTER_WRITE_BEFORE_COMMIT');
      if(writtenFault==='ABORT'||(writtenFault&&typeof writtenFault.then==='function'))return fail();
      db.exec('COMMIT');
      return result;
    }catch{try{db.exec('ROLLBACK');}catch{}return fail();}
    finally{busy=false;}
  }
  const projection=record=>frozen(copy({revision:record.revision,parties:record.parties}));
  function enrolled(record){if(!record.parties)return fail();}
  function bind(record,deviceId,packet){
    enrolled(record);
    if(!token(deviceId)||!exact(packet,['own','peer']))return fail();
    identity(packet.own);identity(packet.peer);
    const role=packet.own.role,peerRole=role==='SENDER'?'RECEIVER':'SENDER';
    if(record.parties[role].deviceId!==deviceId||canonical(packet.own)!==canonical(record.parties[role].identity)
      ||canonical(packet.peer)!==canonical(record.parties[peerRole].identity))return fail();
    return role;
  }
  function pending(record,input,time){
    enrolled(record);challenge(input);
    if(!record.pending||canonical(input)!==canonical(record.pending.challenge)||input.context.pairRevision!==record.revision
      ||stamp(input.context.issuedAt)>time||stamp(input.context.expiresAt)<=time)return fail();
    return record.pending;
  }
  function enroll(input){
    try{
      const candidate=copy(input);parties(candidate);
      return transact(record=>{
        if(record.parties!==null)return fail();
        record.parties=candidate;record.revision=1;
        return projection(record);
      });
    }catch{return fail();}
  }
  function snapshot(){return transact(record=>{enrolled(record);return projection(record);});}
  function propose(input){
    try{
      const proposal=copy(input);
      if(!exact(proposal,['role','expectedRevision','oldPin','newDeviceId','candidateIdentity'])
        ||!ROLES.includes(proposal.role)||!Number.isSafeInteger(proposal.expectedRevision)||!pin(proposal.oldPin)
        ||!token(proposal.newDeviceId))return fail();
      const key=identity(proposal.candidateIdentity,proposal.role);
      return transact((record,time)=>{
        enrolled(record);
        const role=proposal.role,other=role==='SENDER'?'RECEIVER':'SENDER',own=record.parties[role],peer=record.parties[other];
        if(record.replacements>=8||record.revision!==proposal.expectedRevision||own.identity.pin!==proposal.oldPin
          ||(record.pending&&stamp(record.pending.challenge.context.expiresAt)>time)
          ||proposal.candidateIdentity.id!==own.identity.id||proposal.candidateIdentity.pin===own.identity.pin
          ||proposal.candidateIdentity.pin===peer.identity.pin||record.retiredPins.includes(proposal.candidateIdentity.pin)
          ||proposal.newDeviceId===own.deviceId||proposal.newDeviceId===peer.deviceId)return fail();
        const c={schemaVersion:RECOVERY,classification:CLASS,id:'recovery-'+randomUUID(),role,pairRevision:record.revision,
          accountId:own.identity.id,oldPin:own.identity.pin,newPin:proposal.candidateIdentity.pin,oldDeviceId:own.deviceId,
          newDeviceId:proposal.newDeviceId,peerPin:peer.identity.pin,peerDeviceId:peer.deviceId,peerAccountId:peer.identity.id,
          issuedAt:new Date(time).toISOString(),expiresAt:new Date(time+120_000).toISOString()};
        const signBytes=Buffer.from('RIO_DEVICE_RECOVERY_PROOF\n'+canonical(c));
        const nonce=role==='RECEIVER'?randomBytes(32):null;
        const wrappedChallenge=nonce?publicEncrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',
          oaepLabel:createHash('sha256').update(signBytes).digest()},nonce).toString('base64url'):null;
        const publicChallenge={context:c,wrappedChallenge};
        record.pending={challenge:publicChallenge,candidateIdentity:proposal.candidateIdentity,nonce:nonce?.toString('base64url')??null,
          possessed:false,ownerConfirmed:false,peerConfirmed:false};
        nonce?.fill(0);
        return frozen(copy(publicChallenge));
      },record=>stamp(record.pending.challenge.context.expiresAt));
    }catch{return fail();}
  }
  function proveCandidate(input,proof){
    try{
      const value=copy(input),proofBytes=bytes(proof,value?.context?.role==='SENDER'?64:32);
      challenge(value);
      return transact((record,time)=>{
        const p=pending(record,value,time);
        if(p.possessed)return fail();
        const key=identity(p.candidateIdentity),signBytes=Buffer.from('RIO_DEVICE_RECOVERY_PROOF\n'+canonical(value.context));
        const accepted=value.context.role==='SENDER'
          ?proofBytes.length===64&&verify('sha256',signBytes,{key,dsaEncoding:'ieee-p1363'},proofBytes)
          :proofBytes.length===32&&timingSafeEqual(proofBytes,bytes(p.nonce,32));
        if(!accepted)return fail();
        p.possessed=true;return true;
      },stamp(value.context.expiresAt));
    }catch{return fail();}
  }
  function confirm(input,field){
    try{
      const value=copy(input);challenge(value);
      return transact((record,time)=>{
        const p=pending(record,value,time);
        if(!p.possessed||p[field])return fail();
        p[field]=true;return true;
      },stamp(value.context.expiresAt));
    }catch{return fail();}
  }
  function activate(input){
    try{
      const value=copy(input);challenge(value);
      return transact((record,time)=>{
        const p=pending(record,value,time),c=p.challenge.context;
        if(!p.possessed||!p.ownerConfirmed||!p.peerConfirmed||record.replacements>=8)return fail();
        record.retiredPins.push(c.oldPin);record.replacements++;record.revision++;
        record.parties[c.role]={identity:p.candidateIdentity,deviceId:c.newDeviceId};
        record.pending=null;
        return projection(record);
      },stamp(value.context.expiresAt));
    }catch{return fail();}
  }
  function checkPair(deviceId,input){
    try{const packet=copy(input);return transact(record=>{bind(record,deviceId,packet);return true;});}
    catch{return fail();}
  }
  function authorize(deviceId,input){
    try{
      const packet=copy(input);
      if(!exact(packet,['checkpoint','own','peer','context','envelopeDigest'])
        ||!['SEAL_START','SEAL_FINISH','RECEIVE_START','RECEIVE_PREVIEW','RECEIVE_CONSUME'].includes(packet.checkpoint)
        ||(packet.checkpoint==='SEAL_START'?packet.envelopeDigest!==null:!pin(packet.envelopeDigest)))return fail();
      context(packet.context);
      return transact((record,time)=>{
        const role=bind(record,deviceId,{own:packet.own,peer:packet.peer}),c=packet.context;
        if(c.senderId!==record.parties.SENDER.identity.id||c.receiverId!==record.parties.RECEIVER.identity.id
          ||stamp(c.issuedAt)>time||stamp(c.expiresAt)<=time)return fail();
        const sent=record.sent.find(row=>row.messageId===c.messageId);
        if(packet.checkpoint.startsWith('SEAL')){
          if(role!=='SENDER')return fail();
          if(packet.checkpoint==='SEAL_START'){
            if(sent||record.sent.length>=128)return fail();
            record.sent.push({messageId:c.messageId,context:c,deviceId,pairRevision:record.revision,done:false,envelopeDigest:null});
          }else{
            if(!sent||sent.done||sent.deviceId!==deviceId||sent.pairRevision!==record.revision
              ||canonical(sent.context)!==canonical(c))return fail();
            sent.done=true;sent.envelopeDigest=packet.envelopeDigest;
          }
        }else{
          if(role!=='RECEIVER'||!sent||!sent.done||sent.pairRevision!==record.revision
            ||sent.deviceId!==record.parties.SENDER.deviceId||canonical(sent.context)!==canonical(c)
            ||sent.envelopeDigest!==packet.envelopeDigest||record.received.includes(c.messageId))return fail();
          if(packet.checkpoint==='RECEIVE_CONSUME'){
            if(record.received.length>=128)return fail();
            record.received.push(c.messageId);
          }
        }
        return true;
      },stamp(packet.context.expiresAt));
    }catch{return fail();}
  }
  function acceptTransport(opaquePayload){
    try{
      const raw=bytes(opaquePayload,4096);
      const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      if(!exact(envelope,['header','iv','wrappedKey','ciphertext','signature'])
        ||!exact(envelope.header,['schemaVersion','classification','suite','context','senderPin','receiverPin'])
        ||envelope.header.schemaVersion!==IDENTITY||envelope.header.classification!==CLASS
        ||envelope.header.suite!=='RSA-OAEP-3072-SHA256+A256GCM+ECDSA-P256-SHA256'
        ||!pin(envelope.header.senderPin)||!pin(envelope.header.receiverPin)
        ||bytes(envelope.iv,12).length!==12||bytes(envelope.wrappedKey,384).length!==384
        ||bytes(envelope.signature,64).length!==64||bytes(envelope.ciphertext,528).length<17
        ||!raw.equals(Buffer.from(canonical(envelope))))return fail();
      const c=envelope.header.context;context(c);
      const digest=createHash('sha256').update(raw).digest('base64url');
      return transact((record,time)=>{
        enrolled(record);
        const sent=record.sent.find(row=>row.messageId===c.messageId);
        if(envelope.header.senderPin!==record.parties.SENDER.identity.pin
          ||envelope.header.receiverPin!==record.parties.RECEIVER.identity.pin
          ||c.senderId!==record.parties.SENDER.identity.id||c.receiverId!==record.parties.RECEIVER.identity.id
          ||stamp(c.issuedAt)>time||stamp(c.expiresAt)<=time
          ||!sent||!sent.done||sent.pairRevision!==record.revision
          ||sent.deviceId!==record.parties.SENDER.deviceId||sent.envelopeDigest!==digest
          ||canonical(sent.context)!==canonical(c)||record.received.includes(c.messageId))return fail();
        const unsigned={header:envelope.header,iv:envelope.iv,wrappedKey:envelope.wrappedKey,ciphertext:envelope.ciphertext};
        if(!verify('sha256',Buffer.from(canonical(unsigned)),{key:identity(record.parties.SENDER.identity),dsaEncoding:'ieee-p1363'},
          bytes(envelope.signature,64)))return fail();
        return true;
      },stamp(c.expiresAt));
    }catch{return fail();}
  }
  function close(){
    if(closed)return true;if(busy)return fail();
    try{db.close();closed=true;return true;}catch{return fail();}
  }
  return Object.freeze({enroll,snapshot,propose,proveCandidate,confirmOwner:value=>confirm(value,'ownerConfirmed'),
    confirmPeer:value=>confirm(value,'peerConfirmed'),activate,checkPair,authorize,acceptTransport,close});
}
