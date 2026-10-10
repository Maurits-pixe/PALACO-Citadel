import { readFileSync } from 'node:fs';
import { createHash, randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { openRioReferenceOutbox } from '../reference-outbox.mjs';
import {
  GUARD_ROLES, referenceSigningBytes, referenceContractDigest,
  referenceEnvelopeDigest, referenceAdmissionDigest, referenceEvidenceSetDigest
} from '../brigade-evidence.mjs';

const SIDES = ['SENDER','RECEIVER'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const token = value => typeof value === 'string' && ID.test(value);
const iso = time => new Date(time).toISOString();
// Public action tokens must satisfy the same identifier grammar on every round.
const nonce = () => 'r'+randomBytes(17).toString('base64url');
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function canonical(value) {
  if (value === null || ['string','boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (plain(value)) return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  throw new Error('NON_JSON');
}
function freeze(value) {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
function result(status='REJECTED', duplicate=false) {
  return freeze({ok:status==='APPLIED',status,duplicate,mode:'REFERENCE_ONLY',
    classification:'SYNTHETIC_ONLY',operativeAuthority:'NONE',runtimeConnected:false,
    canOpenContact:false,externalSideEffect:false});
}

/** Two fixed local test roles, not authentication of real people. */
export function createRioContactReference({
  databasePath,classification,now=()=>new Date().toISOString(),simulateGuards=()=> 'PASS',payloadMode='TEXT',transportAuthority
}={}) {
  if (classification!=='SYNTHETIC_ONLY' || typeof now!=='function' || typeof simulateGuards!=='function' || !['TEXT','OPAQUE_TRANSPORT'].includes(payloadMode)
    ||(transportAuthority!==undefined&&(typeof transportAuthority!=='function'||payloadMode!=='OPAQUE_TRANSPORT'))) {
    throw new TypeError('EXPLICIT_SYNTHETIC_HOST_REQUIRED');
  }
  const design=JSON.parse(readFileSync(new URL('../brigade-specialties.json',import.meta.url),'utf8'));
  const items=new Map(), ledger=new Map(), keyEpoch='synthetic-key-'+nonce();
  let closed=false, busy=false, lastClock=-Infinity;
  function clock() {
    const value=now(), time=Date.parse(value);
    if (typeof value!=='string' || !Number.isFinite(time) || iso(time)!==value || time<lastClock) throw new Error('INVALID_CLOCK');
    lastClock=time; return time;
  }
  const pairs=new Map();
  for (const side of SIDES) for (const role of [...GUARD_ROLES,'HUMAN_RECEIPT']) {
    pairs.set(side+':'+role,generateKeyPairSync('ed25519'));
  }
  const outbox=openRioReferenceOutbox({
    databasePath,classification,design,now:()=>iso(clock()),
    loadEvidence:(checkpoint,message)=>{
      const item=items.get(message.requestId);
      if (!item || item.round.checkpoint!==checkpoint || item.message.messageId!==message.messageId
          || !['COMMIT_CONFIRMATION','DELIVERY_CONFIRMATION'].includes(item.phase)) return undefined;
      return {input:item.round.input,snapshot:item.round.snapshot};
    }
  });
  function transportAccepted(opaquePayload){
    if(!transportAuthority)return true;
    try{return transportAuthority(opaquePayload)===true;}catch{return false;}
  }
  function closeStale(item){
    item.revocationPending=true;item.phase='HOLD';item.round.revision=nonce();
    item.round.input.finalReceipts=[];item.round.evidenceSetDigest=null;item.round.confirmations={sender:false,receiver:false};
    const status=outbox.revoke(item.id);
    if(status.status!=='CLOSED')return false;
    item.revocationPending=false;item.phase='CLOSED';return true;
  }
  function signBody(body) {
    const pair=pairs.get(body.issuerId.slice('synthetic:'.length));
    if (!pair) throw new Error('UNKNOWN_SYNTHETIC_ISSUER');
    return {algorithm:'Ed25519',body,signature:sign(null,referenceSigningBytes(body),pair.privateKey).toString('base64url')};
  }
  function createRound(item,checkpoint,time) {
    const request={
      schemaVersion:'6ri9ade-transfer-reference/0.2',id:item.id,challengeId:'challenge-'+nonce(),
      sender:{accountId:'synthetic-sender',deviceId:'synthetic-sender-device',tenantId:'synthetic-sender-tenant',
        worldId:'synthetic-sender-world',citadelId:'synthetic-sender-citadel',keyVersion:keyEpoch},
      receiver:{accountId:'synthetic-receiver',deviceId:'synthetic-receiver-device',tenantId:'synthetic-receiver-tenant',
        worldId:'synthetic-receiver-world',citadelId:'synthetic-receiver-citadel',keyVersion:keyEpoch},
      scope:['chat:text'],policyVersion:'synthetic-policy-v1',ppBindingVersion:'synthetic-pp-v1',
      scriptieBindingVersion:'synthetic-scriptie-v1',issuedAt:iso(time),expiresAt:iso(item.expires),
      transferBinding:{messageId:item.message.messageId,payloadDigest:item.payloadDigest,
        payloadByteLength:item.byteLength,payloadEncoding:'base64url',idempotencyKey:item.message.idempotencyKey}
    };
    const contractDigest=referenceContractDigest(request);
    const issuers=[];
    for (const side of SIDES) for (const roleCode of [...GUARD_ROLES,'HUMAN_RECEIPT']) {
      const party=request[side.toLowerCase()];
      issuers.push({
        id:'synthetic:'+side+':'+roleCode,classification:'SYNTHETIC_ONLY',
        publicKeyPem:pairs.get(side+':'+roleCode).publicKey.export({type:'spki',format:'pem'}),
        side,roleCode,receiptStages:roleCode==='HUMAN_RECEIPT'
          ? (side==='SENDER'?['INITIATED','FINAL_ACCEPTED']:['NOVA_ADMITTED','FINAL_ACCEPTED']):[],
        subjectAccountId:party.accountId,subjectDeviceId:party.deviceId,subjectKeyVersion:party.keyVersion,
        contextDigest:contractDigest,issuedAt:iso(time),expiresAt:iso(item.expires),status:'CURRENT'
      });
    }
    return {
      checkpoint,revision:nonce(),contractDigest,evidenceSetDigest:null,confirmations:{sender:false,receiver:false},
      input:{request,initiation:null,novaAdmission:null,evidence:[],finalReceipts:[]},
      snapshot:{schemaVersion:'6ri9ade-trust-reference/0.1',classification:'SYNTHETIC_ONLY',
        revision:'round-'+nonce(),checkpoint,expectedRequest:structuredClone(request),
        observedAt:iso(time),expiresAt:iso(time+20_000),challengeState:'CURRENT',
        contactState:'CURRENT',revokedEnvelopeIds:[],issuers}
    };
  }
  function renewTrust(round,time) {
    round.snapshot.observedAt=iso(time);round.snapshot.expiresAt=iso(Math.min(time+20_000,Date.parse(round.input.request.expiresAt)));
  }
  function humanReceipt(item,side,stage,time) {
    const round=item.round,input=round.input;
    const admissionDigest=stage==='INITIATED'?null:stage==='NOVA_ADMITTED'
      ? referenceEnvelopeDigest(input.initiation):referenceAdmissionDigest(input.initiation,input.novaAdmission);
    return signBody({
      schemaVersion:'6ri9ade-signed-reference/0.1',type:'HUMAN_RECEIPT',id:'receipt-'+nonce(),
      issuerId:'synthetic:'+side+':HUMAN_RECEIPT',side,contractDigest:round.contractDigest,
      admissionDigest,stage,evidenceSetDigest:stage==='FINAL_ACCEPTED'?round.evidenceSetDigest:null,
      issuedAt:iso(time),expiresAt:iso(stage==='FINAL_ACCEPTED'?Math.min(time+120_000,item.expires):item.expires)
    });
  }
  function guards(item,time) {
    const round=item.round,input=round.input,admissionDigest=referenceAdmissionDigest(input.initiation,input.novaAdmission);
    const status=simulateGuards();
    if (!['PASS','FAIL','UNKNOWN'].includes(status)) throw new Error('INVALID_SIMULATION');
    input.evidence=SIDES.flatMap(side=>GUARD_ROLES.map(roleCode=>signBody({
      schemaVersion:'6ri9ade-signed-reference/0.1',type:'GUARD_ATTESTATION',id:'guard-'+nonce(),
      issuerId:'synthetic:'+side+':'+roleCode,side,contractDigest:round.contractDigest,admissionDigest,
      issuedAt:iso(time),expiresAt:iso(Math.min(time+120_000,item.expires)),roleCode,
      checkpoint:round.checkpoint,status,evidenceDigest:hash('SIMULATED_ONLY:'+round.checkpoint+':'+side+':'+roleCode+':'+round.contractDigest)
    })));
    input.finalReceipts=[];round.confirmations={sender:false,receiver:false};
    round.revision=nonce();round.snapshot.revision='round-'+round.revision;renewTrust(round,time);
    round.evidenceSetDigest=status==='PASS'?referenceEvidenceSetDigest(input.evidence):null;
    item.phase=status==='PASS'?(round.checkpoint==='SERVICE_COMMIT'?'COMMIT_CONFIRMATION':'DELIVERY_CONFIRMATION')
      :'HOLD';
    if (status==='FAIL') {
      item.revocationPending=true;
      const stop=outbox.revoke(item.id);
      if (stop.status!=='CLOSED') throw new Error('DURABLE_STOP_PENDING');
      item.revocationPending=false;item.phase='CLOSED';
    }
  }
  function allowed(item,side,time) {
    if (item.phase==='DELIVERED') return [];
    if (item.phase==='CLOSED' || time>=item.expires) return [];
    if (item.revocationPending) return ['DECLINE','REVOKE'];
    const options=['DECLINE','REVOKE'];
    if (item.phase==='WAITING_NOVA' && side==='RECEIVER') options.unshift('NOVA_ADMIT','HOLD');
    if (item.phase==='QUEUED' && side==='SENDER') options.unshift('PREPARE_DELIVERY');
    if (item.phase==='WAITING_DELIVERY_NOVA' && side==='RECEIVER') options.unshift('ADMIT_DELIVERY','HOLD');
    if (['COMMIT_CONFIRMATION','DELIVERY_CONFIRMATION','HOLD'].includes(item.phase) && item.round.input.novaAdmission) {
      options.unshift('REFRESH_GUARDS','HOLD');
      if (item.phase!=='HOLD' && item.round.evidenceSetDigest && !item.round.confirmations[side.toLowerCase()]
          && item.round.input.evidence.every(e=>Date.parse(e.body.expiresAt)>time)) options.unshift('FINAL_ACCEPT');
    }
    if (item.phase==='HOLD' && !item.round.input.novaAdmission && side==='RECEIVER') {
      options.unshift(item.round.checkpoint==='SERVICE_COMMIT'?'NOVA_ADMIT':'ADMIT_DELIVERY');
    }
    return [...new Set(options)];
  }
  function view(side) {
    if (!SIDES.includes(side) || closed || busy) return null;
    let time;
    try {time=clock();} catch {return null;}
    const requests=[...items.values()].map(item=>{
      const round=item.round,expired=time>=item.expires&&item.phase!=='DELIVERED';
      const showText=side==='SENDER'||!!round.input.novaAdmission||item.phase==='DELIVERED';
      const inboxText=item.phase==='DELIVERED'&&side==='RECEIVER'
        ? outbox.inbox(item.message.messageId)?.opaquePayload : null;
      const visibleText=item.phase==='DELIVERED'&&side==='RECEIVER'
        ? (inboxText ? Buffer.from(inboxText,'base64url').toString('utf8') : null)
        : (showText?item.text:null);
      return {
        id:item.id,revision:round.revision,phase:expired?'CLOSED':item.phase,stage:round.checkpoint,
        text:payloadMode==='TEXT'?visibleText:null,...(payloadMode==='OPAQUE_TRANSPORT'?{opaquePayload:showText?(inboxText||item.message.opaquePayload):null}:{}),byteLength:item.byteLength,payloadDigest:item.payloadDigest,
        contractDigest:round.contractDigest,evidenceSetDigest:round.evidenceSetDigest,
        confirmations:{...round.confirmations},
        guards:GUARD_ROLES.map(roleCode=>{
          const output={roleCode};
          for (const s of SIDES) {
            const evidence=round.input.evidence.find(e=>e.body.side===s&&e.body.roleCode===roleCode);
            output[s.toLowerCase()]=evidence?.body.status==='PASS'&&Date.parse(evidence.body.expiresAt)>time?'SIMULATED_PASS':'UNKNOWN';
          }
          return output;
        }),
        allowedActions:expired?[]:allowed(item,side,time),createdAt:iso(item.created)
      };
    });
    return freeze({mode:'REFERENCE_ONLY',classification:'SYNTHETIC_ONLY',side,
      notifications:side==='RECEIVER'?requests.filter(r=>['WAITING_NOVA','WAITING_DELIVERY_NOVA'].includes(r.phase)).length:0,
      payloadMode,controlsSimulated:true,canOpenContact:false,operativeAuthority:'NONE',runtimeConnected:false,
      externalSideEffect:false,requests});
  }
  function act(side,input) {
    if (closed||busy||!SIDES.includes(side)) return result();
    let body,fingerprint,time;
    try {
      body=JSON.parse(canonical(input));
      const keys=body.type==='INITIATE'?['type','actionId','text']:body.type==='INITIATE_OPAQUE'?['type','actionId','opaquePayload']
        :body.type==='FINAL_ACCEPT'?['type','id','revision','actionId','contractDigest','evidenceSetDigest']
        :['type','id','revision','actionId'];
      if (!exact(body,keys)||!token(body.actionId)||!token(body.type)) return result();
      fingerprint=hash(side+':'+canonical(body));
      if (ledger.has(body.actionId)) {
        const old=ledger.get(body.actionId);
        return old.fingerprint===fingerprint?result(old.status,true):result();
      }
      if (ledger.size>=1024) return result('HOLD');
      time=clock();
    } catch {return result('HOLD');}
    busy=true;
    let outcome='REJECTED';
    try {
      if (['INITIATE','INITIATE_OPAQUE'].includes(body.type)) {
        if (side!=='SENDER'||items.size>=64) return result();
        let bytes;
        if (payloadMode==='TEXT') {
          if (body.type!=='INITIATE'||typeof body.text!=='string'||!body.text.trim()
              ||Buffer.byteLength(body.text,'utf8')>1024) return result();
          bytes=Buffer.from(body.text,'utf8');
          if (bytes.toString('utf8')!==body.text) return result();
        } else {
          if (body.type!=='INITIATE_OPAQUE'||typeof body.opaquePayload!=='string'
              ||body.opaquePayload.length>5462||!/^[A-Za-z0-9_-]+$/.test(body.opaquePayload)) return result();
          bytes=Buffer.from(body.opaquePayload,'base64url');
          if (bytes.length<1||bytes.length>4096||bytes.toString('base64url')!==body.opaquePayload) return result();
        }
        if(payloadMode==='OPAQUE_TRANSPORT'&&!transportAccepted(bytes.toString('base64url')))return result();
        const id='request-'+nonce(),messageId='message-'+nonce();
        const item={id,text:payloadMode==='TEXT'?body.text:null,payloadDigest:hash(bytes),byteLength:bytes.length,
          created:time,expires:time+5*60_000,phase:'WAITING_NOVA',
          message:{schemaVersion:'rio-opaque-message-reference/0.1',classification:'SYNTHETIC_ONLY',
            requestId:id,messageId,idempotencyKey:'idempotency-'+nonce(),opaquePayload:bytes.toString('base64url')}};
        item.round=createRound(item,'SERVICE_COMMIT',time);
        item.round.input.initiation=humanReceipt(item,'SENDER','INITIATED',time);
        items.set(id,item);outcome='APPLIED';
      } else {
        if (!token(body.id)||!token(body.revision)) return result();
        const item=items.get(body.id);
        if (!item||body.revision!==item.round.revision||!allowed(item,side,time).includes(body.type)) return result();
        const round=item.round;
        if(transportAuthority&&!['DECLINE','REVOKE'].includes(body.type)&&!transportAccepted(item.message.opaquePayload)){
          closeStale(item);outcome='HOLD';return result(outcome);
        }
        if (['DECLINE','REVOKE'].includes(body.type)) {
          item.revocationPending=true;item.phase='HOLD';round.revision=nonce();
          round.input.finalReceipts=[];round.evidenceSetDigest=null;round.confirmations={sender:false,receiver:false};
          const closedResult=outbox.revoke(item.id);
          if (closedResult.status!=='CLOSED') {outcome='HOLD';return result(outcome);}
          item.revocationPending=false;item.phase='CLOSED';outcome='APPLIED';
        } else if (body.type==='HOLD') {
          item.phase='HOLD';round.revision=nonce();round.input.finalReceipts=[];
          round.evidenceSetDigest=null;
          round.confirmations={sender:false,receiver:false};outcome='APPLIED';
        } else if (['NOVA_ADMIT','ADMIT_DELIVERY'].includes(body.type)) {
          if (round.input.novaAdmission) return result();
          round.input.novaAdmission=humanReceipt(item,'RECEIVER','NOVA_ADMITTED',time);
          guards(item,time);outcome='APPLIED';
        } else if (body.type==='PREPARE_DELIVERY') {
          item.round=createRound(item,'QUEUED_DELIVERY',time);
          item.round.input.initiation=humanReceipt(item,'SENDER','INITIATED',time);
          item.phase='WAITING_DELIVERY_NOVA';outcome='APPLIED';
        } else if (body.type==='REFRESH_GUARDS') {
          guards(item,time);outcome='APPLIED';
        } else if (body.type==='FINAL_ACCEPT') {
          if (body.contractDigest!==round.contractDigest||body.evidenceSetDigest!==round.evidenceSetDigest) return result();
          round.input.finalReceipts.push(humanReceipt(item,side,'FINAL_ACCEPTED',time));
          round.confirmations[side.toLowerCase()]=true;renewTrust(round,time);
          if (round.confirmations.sender&&round.confirmations.receiver) {
            if(transportAuthority&&!transportAccepted(item.message.opaquePayload)){
              closeStale(item);outcome='HOLD';return result(outcome);
            }
            const operation=round.checkpoint==='SERVICE_COMMIT'?outbox.commit(item.message):outbox.deliver(item.message.messageId);
            if (!['QUEUED','DELIVERED'].includes(operation.status)) {
              item.phase=operation.status==='CLOSED'?'CLOSED':'HOLD';round.revision=nonce();
              round.input.finalReceipts=[];round.evidenceSetDigest=null;round.confirmations={sender:false,receiver:false};
              outcome='HOLD';
            } else {
              item.phase=operation.status;round.revision=nonce();outcome='APPLIED';
            }
          } else outcome='APPLIED';
        }
      }
      return result(outcome);
    } catch {
      outcome='HOLD';
      const item=items.get(body.id);
      if (item && !['DELIVERED','CLOSED'].includes(item.phase)) {
        item.phase='HOLD';item.round.revision=nonce();item.round.evidenceSetDigest=null;
        item.round.input.finalReceipts=[];item.round.confirmations={sender:false,receiver:false};
      }
      return result(outcome);
    } finally {
      ledger.set(body.actionId,{fingerprint,status:outcome});
      busy=false;
    }
  }
  function close() {
    if (busy) return false;
    if (!closed) {outbox.close();pairs.clear();items.clear();ledger.clear();closed=true;}
    return true;
  }
  return Object.freeze({act,view,close});
}
