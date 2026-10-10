import { canonicalEncrypted } from './client.mjs';
const VERSION='rio-browser-key-vault/0.1';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PIN=/^[A-Za-z0-9_-]{43}$/;
const reject=()=>{throw new Error('KEY_VAULT_NOT_ACCEPTED');};
const same=(a,b)=>canonicalEncrypted(a)===canonicalEncrypted(b);
const token=value=>typeof value==='string'&&ID.test(value);
function exact(value,keys){
  return value && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
}
function metadataValid(r,role,id){
  return exact(r,['schemaVersion','classification','role','id','epoch','status','keys','publicIdentity','peer','sent','received','maxClock','revision','retiredPins'])
    && r.schemaVersion===VERSION && r.classification==='SYNTHETIC_ONLY' && r.role===role && r.id===id
    && token(r.epoch) && ['ACTIVE','REVOKED'].includes(r.status)
    && r.publicIdentity?.role===role && r.publicIdentity?.id===id && PIN.test(r.publicIdentity?.pin)
    && (r.status==='ACTIVE'?exact(r.keys,['publicKey','privateKey']):r.keys===null)
    && (r.peer===null || (r.peer?.id!==id && token(r.peer?.id) && PIN.test(r.peer?.pin)))
    && Array.isArray(r.sent) && r.sent.length<=128 && new Set(r.sent.map(x=>x.id)).size===r.sent.length
    && r.sent.every(x=>exact(x,['id','token','epoch','done'])&&token(x.id)&&token(x.token)&&token(x.epoch)&&typeof x.done==='boolean')
    && Array.isArray(r.received) && r.received.length<=128 && new Set(r.received).size===r.received.length && r.received.every(token)
    && Number.isSafeInteger(r.maxClock)&&r.maxClock>=0
    && Number.isSafeInteger(r.revision)&&r.revision>=1
    && Array.isArray(r.retiredPins)&&r.retiredPins.length<=8&&r.retiredPins.every(x=>typeof x==='string'&&PIN.test(x))
    && new Set(r.retiredPins).size===r.retiredPins.length && !r.retiredPins.includes(r.publicIdentity.pin);
}
/** Explicit origin-local test enrollment, never a server key resolver or backup. */
export async function openRioTestKeyVault({
  classification,role,id,namespace,mode,expectedOwnPin,fault=()=>undefined
}={}){
  if(classification!=='SYNTHETIC_ONLY'||!['SENDER','RECEIVER'].includes(role)||!token(id)||!token(namespace)
    ||!['ENROLL','RESUME','REPLACE'].includes(mode)||typeof fault!=='function'
    ||(mode==='ENROLL'?expectedOwnPin!==undefined:typeof expectedOwnPin!=='string'||!PIN.test(expectedOwnPin))
    ||typeof indexedDB==='undefined')return reject();
  let closed=false,initialized=false,ownEpoch=null;
  const db=await new Promise((resolve,rejectPromise)=>{
    let finished=false;
    const request=indexedDB.open('rio-test-vault-'+namespace,1);
    const timer=setTimeout(()=>finish(null),5000);
    function finish(database){
      if(finished){database?.close();return;}finished=true;clearTimeout(timer);
      if(database)resolve(database);else rejectPromise(new Error('KEY_VAULT_NOT_ACCEPTED'));
    }
    request.onupgradeneeded=event=>{
      if(event.oldVersion!==0 || request.result.objectStoreNames.length){request.transaction.abort();return;}
      request.result.createObjectStore('state');
    };
    request.onerror=()=>finish(null);
    request.onblocked=()=>finish(null);
    request.onsuccess=()=>{
      const database=request.result;
      if(database.objectStoreNames.length!==1||!database.objectStoreNames.contains('state')){database.close();finish(null);return;}
      finish(database);
    };
  });
  db.onversionchange=()=>{closed=true;db.close();};
  function transaction(write,work){
    if(closed)return Promise.reject(new Error('KEY_VAULT_NOT_ACCEPTED'));
    return new Promise((resolve,rejectPromise)=>{
      let tx,output,settled=false;
      function failed(){if(settled)return;settled=true;rejectPromise(new Error('KEY_VAULT_NOT_ACCEPTED'));}
      try{
        tx=db.transaction('state',write?'readwrite':'readonly',write?{durability:'strict'}:undefined);
        const store=tx.objectStore('state'),get=store.get('endpoint');
        get.onerror=failed;
        get.onsuccess=()=>{
          try{
            const record=get.result;
            if(record!==undefined&&!metadataValid(record,role,id))return reject();
            const outcome=work(record);
            if(!outcome||typeof outcome.then==='function')return reject();
            output=outcome.value;
            if(outcome.put){
              if(!write||!metadataValid(outcome.put,role,id))return reject();
              const injected=fault('BEFORE_PUT');
              if(injected && typeof injected.then==='function')return reject();
              if(injected==='ABORT')return reject();
              store.put(outcome.put,'endpoint');
            }
          }catch{try{tx.abort();}catch{}failed();}
        };
        tx.onabort=failed;tx.onerror=failed;
        tx.oncomplete=()=>{if(settled)return;settled=true;if(closed)rejectPromise(new Error('KEY_VAULT_NOT_ACCEPTED'));else resolve(output);};
      }catch{try{tx?.abort();}catch{}failed();}
    });
  }
  function active(record,epoch,peer){
    if(!record||record.status!=='ACTIVE'||epoch!==ownEpoch||record.epoch!==epoch
      ||(peer && !same(record.peer,peer)))return reject();
    return record;
  }
  function current(record,epoch,peer,messageId,time,expiresAt){
    active(record,epoch,peer);
    if(!token(messageId)||!Number.isSafeInteger(time)||time<record.maxClock
      ||!Number.isSafeInteger(expiresAt)||time>=expiresAt)return reject();
    record.maxClock=time;record.revision++;
    return record;
  }
  async function initialize(make){
    if(closed||initialized||typeof make!=='function')return reject();
    const original=await transaction(false,r=>({value:r}));
    if(mode==='RESUME'){
      if(!original||original.status!=='ACTIVE'||original.publicIdentity.pin!==expectedOwnPin)return reject();
      initialized=true;ownEpoch=original.epoch;return original;
    }
    if(mode==='ENROLL'?original!==undefined:!original||original.status!=='REVOKED'
      ||original.publicIdentity.pin!==expectedOwnPin||original.retiredPins.length>=8)return reject();
    const generated=await make();
    if(!exact(generated,['keys','publicIdentity']))return reject();
    const record=await transaction(true,r=>{
      if(mode==='ENROLL'?r!==undefined:!r||r.status!=='REVOKED'||r.revision!==original.revision
        ||r.publicIdentity.pin!==expectedOwnPin)return reject();
      if(original && (generated.publicIdentity.pin===expectedOwnPin||original.retiredPins.includes(generated.publicIdentity.pin)))return reject();
      const next={schemaVersion:VERSION,classification,role,id,epoch:'epoch-'+crypto.randomUUID(),status:'ACTIVE',
        keys:generated.keys,publicIdentity:generated.publicIdentity,peer:null,
        sent:original?.sent||[],received:original?.received||[],maxClock:original?.maxClock||0,
        revision:(original?.revision||0)+1,retiredPins:original?[...original.retiredPins,expectedOwnPin]:[]};
      return {value:next,put:next};
    });
    initialized=true;ownEpoch=record.epoch;return record;
  }
  async function enrollPeer(epoch,peer){
    return transaction(true,r=>{
      active(r,epoch);
      if(r.peer && !same(r.peer,peer))return reject();
      if(r.peer)return {value:true};
      r.peer=peer;r.revision++;return {value:true,put:r};
    });
  }
  async function reserveSeal(epoch,peer,messageId,time,expiresAt){
    return transaction(true,r=>{
      current(r,epoch,peer,messageId,time,expiresAt);
      if(r.sent.some(x=>x.id===messageId)||r.sent.length>=128)return reject();
      const reservation='reserve-'+crypto.randomUUID();
      r.sent.push({id:messageId,token:reservation,epoch,done:false});
      return {value:reservation,put:r};
    });
  }
  async function finishSeal(epoch,peer,messageId,reservation,time,expiresAt){
    return transaction(true,r=>{
      current(r,epoch,peer,messageId,time,expiresAt);
      const entry=r.sent.find(x=>x.id===messageId);
      if(!entry||entry.epoch!==epoch||entry.token!==reservation||entry.done)return reject();
      entry.done=true;return {value:true,put:r};
    });
  }
  async function checkReceive(epoch,peer,messageId,time,expiresAt,consume=false){
    return transaction(true,r=>{
      current(r,epoch,peer,messageId,time,expiresAt);
      if(r.received.includes(messageId)||(consume&&r.received.length>=128))return reject();
      if(consume)r.received.push(messageId);
      return {value:true,put:r};
    });
  }
  async function revoke(epoch){
    return transaction(true,r=>{
      if(!r||epoch!==ownEpoch||r.epoch!==epoch)return reject();
      if(r.status==='REVOKED')return {value:true};
      r.status='REVOKED';r.keys=null;r.peer=null;r.revision++;
      return {value:true,put:r};
    });
  }
  function close(){closed=true;db.close();}
  return Object.freeze({initialize,enrollPeer,reserveSeal,finishSeal,checkReceive,revoke,close});
}
