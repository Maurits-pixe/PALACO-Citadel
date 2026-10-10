import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createEncryptedTestEndpoint, encryptedEnvelopeDigest, canonicalEncrypted, encodeEncryptedBytes } from './client.mjs';
import { openRioTestRecoveryRegistry } from './recovery-registry.mjs';

const CLASS='SYNTHETIC_ONLY', BASE=Date.parse('2026-10-10T12:00:00.000Z');
const clone=value=>JSON.parse(JSON.stringify(value));
const encryptedError={message:'ENCRYPTED_TRANSFER_NOT_ACCEPTED'};
const recoveryError={message:'RECOVERY_NOT_ACCEPTED'};
const other=role=>role==='SENDER'?'RECEIVER':'SENDER';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tamperProof=proof=>(proof[0]==='A'?'B':'A')+proof.slice(1);

async function fixture(t, options={}){
  const dir=mkdtempSync(join(tmpdir(),'rio-recovery-'));
  const databasePath=join(dir,'recovery.sqlite');
  let time=BASE, abort=false, registry;
  const endpoints=[], handles=[];
  const now=()=>new Date(time).toISOString();
  const open=()=>{const handle=openRioTestRecoveryRegistry({databasePath,classification:CLASS,now,
    fault:()=>abort?'ABORT':undefined});handles.push(handle);return handle;};
  registry=open();
  const authority=deviceId=>({checkPair:packet=>registry.checkPair(deviceId,packet),
    authorize:async packet=>{
      const result=registry.authorize(deviceId,packet);
      await options.afterAuthorize?.(deviceId,packet);
      return result;
    }});
  async function endpoint(role,deviceId){
    const result=await createEncryptedTestEndpoint({classification:CLASS,role,
      id:role==='SENDER'?'test-account-sender':'test-account-receiver',now,recoveryAuthority:authority(deviceId)});
    endpoints.push(result);return result;
  }
  const sender=await endpoint('SENDER','sender-device-1');
  const receiver=await endpoint('RECEIVER','receiver-device-1');
  registry.enroll({SENDER:{identity:sender.publicIdentity,deviceId:'sender-device-1'},
    RECEIVER:{identity:receiver.publicIdentity,deviceId:'receiver-device-1'}});
  await sender.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id);
  await receiver.connect(sender.publicIdentity,sender.publicIdentity.pin,sender.publicIdentity.id);
  t.after(()=>{
    for(const value of endpoints)value.close();
    for(const handle of handles)handle.close();
    rmSync(dir,{recursive:true,force:true});
  });
  const context=(messageId='message-1')=>({channelId:'synthetic-channel',messageId,
    senderId:sender.publicIdentity.id,receiverId:receiver.publicIdentity.id,
    issuedAt:new Date(time).toISOString(),expiresAt:new Date(time+60_000).toISOString()});
  async function propose(role,deviceId=role.toLowerCase()+'-device-2'){
    const candidate=await endpoint(role,deviceId),current=registry.snapshot();
    const challenge=registry.propose({role,expectedRevision:current.revision,oldPin:current.parties[role].identity.pin,
      newDeviceId:deviceId,candidateIdentity:candidate.publicIdentity});
    return {role,deviceId,candidate,challenge};
  }
  async function prove(proposal){
    const proof=await proposal.candidate.proveRecovery(proposal.challenge);
    assert.equal(registry.proveCandidate(proposal.challenge,proof),true);
    return proof;
  }
  async function ready(proposal){
    await prove(proposal);
    assert.equal(registry.confirmOwner(proposal.challenge),true);
    assert.equal(registry.confirmPeer(proposal.challenge),true);
    return proposal;
  }
  async function activate(proposal, unchanged=proposal.role==='SENDER'?receiver:sender){
    const snapshot=registry.activate(proposal.challenge);
    assert.equal(snapshot.parties[proposal.role].identity.pin,proposal.candidate.publicIdentity.pin);
    await proposal.candidate.connect(unchanged.publicIdentity,unchanged.publicIdentity.pin,unchanged.publicIdentity.id);
    await unchanged.rebindPeer(proposal.candidate.publicIdentity,proposal.candidate.publicIdentity.pin,proposal.candidate.publicIdentity.id);
    return snapshot;
  }
  return {sender,receiver,now,context,endpoint,propose,prove,ready,activate,databasePath,
    get registry(){return registry;},trackHandle:handle=>{handles.push(handle);return handle;},setAbort:value=>{abort=value;},
    setTime:value=>{time=value;},time:()=>time,
    reopen:()=>{registry.close();registry=open();return registry;}};
}

for(const role of ['SENDER','RECEIVER']){
  test('approved '+role+' replacement uses new keys and resumes exact-pair transfer',async t=>{
    const f=await fixture(t),old=role==='SENDER'?f.sender:f.receiver;
    const p=await f.ready(await f.propose(role));
    assert.notEqual(p.candidate.publicIdentity.pin,old.publicIdentity.pin);
    const current=await f.activate(p);
    assert.equal(current.revision,2);
    const sender=role==='SENDER'?p.candidate:f.sender,receiver=role==='RECEIVER'?p.candidate:f.receiver;
    const context=f.context('after-'+role),envelope=await sender.seal('Artificial replacement text',context);
    const digest=await encryptedEnvelopeDigest(envelope);
    assert.equal((await receiver.acceptDelivered(envelope,context,digest)).text,'Artificial replacement text');
    const peer=role==='SENDER'?receiver:sender;
    await assert.rejects(old.connect(peer.publicIdentity,peer.publicIdentity.pin,peer.publicIdentity.id),encryptedError);
    assert.throws(()=>f.registry.checkPair(role.toLowerCase()+'-device-1',
      {own:old.publicIdentity,peer:peer.publicIdentity}),recoveryError);
  });

  test(role+' replacement cannot activate before proof and both exact approvals',async t=>{
    const f=await fixture(t),p=await f.propose(role),unchanged=role==='SENDER'?f.receiver:f.sender;
    await assert.rejects(p.candidate.connect(unchanged.publicIdentity,unchanged.publicIdentity.pin,unchanged.publicIdentity.id),encryptedError);
    assert.throws(()=>f.registry.confirmOwner(p.challenge),recoveryError);
    assert.throws(()=>f.registry.confirmPeer(p.challenge),recoveryError);
    assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
    await f.prove(p);
    assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
    f.registry.confirmOwner(p.challenge);
    assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
    assert.equal(f.registry.snapshot().revision,1);
    f.registry.confirmPeer(p.challenge);
    assert.equal(f.registry.activate(p.challenge).revision,2);
  });

  test(role+' possession proof is bound to the exact challenge and cannot be replayed',async t=>{
    const f=await fixture(t),p=await f.propose(role);
    const proof=await p.candidate.proveRecovery(p.challenge);
    assert.throws(()=>f.registry.proveCandidate(p.challenge,tamperProof(proof)),recoveryError);
    const changed=clone(p.challenge);changed.context.newDeviceId='unauthorized-device';
    assert.throws(()=>f.registry.proveCandidate(changed,proof),recoveryError);
    const wrongPin=clone(p.challenge);wrongPin.context.newPin=(wrongPin.context.newPin[0]==='A'?'B':'A')+wrongPin.context.newPin.slice(1);
    await assert.rejects(p.candidate.proveRecovery(wrongPin),encryptedError);
    assert.equal(f.registry.proveCandidate(p.challenge,proof),true);
    assert.throws(()=>f.registry.proveCandidate(p.challenge,proof),recoveryError);
    f.registry.confirmOwner(p.challenge);
    assert.throws(()=>f.registry.confirmOwner(p.challenge),recoveryError);
    f.registry.confirmPeer(p.challenge);
    assert.throws(()=>f.registry.confirmPeer(p.challenge),recoveryError);
    f.registry.activate(p.challenge);
    assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
  });
}

test('new receiver cannot read old ciphertext and old receiver cannot finalize it after replacement',async t=>{
  const f=await fixture(t),context=f.context('old-ciphertext');
  const envelope=await f.sender.seal('Only the original receiver held this decryption key',context);
  assert.equal((await f.receiver.preview(envelope,context)).text,'Only the original receiver held this decryption key');
  const p=await f.ready(await f.propose('RECEIVER'));
  await f.activate(p);
  await assert.rejects(p.candidate.preview(envelope,context),encryptedError);
  await assert.rejects(f.receiver.preview(envelope,context),encryptedError);
  await assert.rejects(f.receiver.acceptDelivered(envelope,context,await encryptedEnvelopeDigest(envelope)),encryptedError);
});

test('retired keys, wrong devices, stale revision and duplicate enrollment stay rejected',async t=>{
  const f=await fixture(t),p=await f.ready(await f.propose('SENDER'));
  assert.throws(()=>f.registry.enroll(f.registry.snapshot().parties),recoveryError);
  assert.throws(()=>f.registry.checkPair('sender-device-unknown',
    {own:f.sender.publicIdentity,peer:f.receiver.publicIdentity}),recoveryError);
  await f.activate(p);
  const next=await f.endpoint('SENDER','sender-device-3'),current=f.registry.snapshot();
  assert.throws(()=>f.registry.propose({role:'SENDER',expectedRevision:1,oldPin:p.candidate.publicIdentity.pin,
    newDeviceId:'sender-device-3',candidateIdentity:next.publicIdentity}),recoveryError);
  assert.throws(()=>f.registry.propose({role:'SENDER',expectedRevision:current.revision,oldPin:p.candidate.publicIdentity.pin,
    newDeviceId:'sender-device-3',candidateIdentity:f.sender.publicIdentity}),recoveryError);
  assert.throws(()=>f.registry.checkPair('sender-device-1',
    {own:f.sender.publicIdentity,peer:f.receiver.publicIdentity}),recoveryError);
});

test('global sent and consumed message history survives both replacements and registry reopen',async t=>{
  const f=await fixture(t),context=f.context('durable-consumed');
  const envelope=await f.sender.seal('Synthetic durable replay evidence',context);
  await f.receiver.acceptDelivered(envelope,context,await encryptedEnvelopeDigest(envelope));
  const s=await f.ready(await f.propose('SENDER'));
  await f.activate(s);
  f.reopen();
  await assert.rejects(s.candidate.seal('Repeat after sender replacement',context),encryptedError);
  const r=await f.ready(await f.propose('RECEIVER'));
  await f.activate(r,s.candidate);
  f.reopen();
  await assert.rejects(s.candidate.seal('Repeat after both replacements',context),encryptedError);
  await assert.rejects(r.candidate.acceptDelivered(envelope,context,await encryptedEnvelopeDigest(envelope)),encryptedError);
  const fresh=f.context('fresh-after-reopen'),next=await s.candidate.seal('Fresh synthetic text',fresh);
  assert.equal((await r.candidate.acceptDelivered(next,fresh,await encryptedEnvelopeDigest(next))).text,'Fresh synthetic text');
  const db=new DatabaseSync(f.databasePath,{readOnly:true});
  try{
    const record=JSON.parse(db.prepare('SELECT state_json FROM rio_recovery WHERE id=1').get().state_json);
    assert.ok(record.sent.some(value=>value.messageId==='durable-consumed'&&value.done));
    assert.ok(record.received.includes('durable-consumed'));
  }finally{db.close();}
});

test('rotation during a reserved seal denies output and permanently burns its message ID',async t=>{
  const start=deferred(),resume=deferred();
  const f=await fixture(t,{afterAuthorize:async (_device,packet)=>{
    if(packet.checkpoint==='SEAL_START'&&packet.context.messageId==='interrupted-seal'){
      start.resolve();await resume.promise;
    }
  }});
  const context=f.context('interrupted-seal');
  const pending=f.sender.seal('Must not escape after rotation',context);
  const rejected=assert.rejects(pending,encryptedError);
  await start.promise;
  const p=await f.ready(await f.propose('SENDER'));
  await f.activate(p);
  resume.resolve();await rejected;
  f.reopen();
  await assert.rejects(p.candidate.seal('Do not reuse burned ID',context),encryptedError);
  const db=new DatabaseSync(f.databasePath,{readOnly:true});
  try{
    const record=JSON.parse(db.prepare('SELECT state_json FROM rio_recovery WHERE id=1').get().state_json);
    assert.equal(record.sent.find(value=>value.messageId===context.messageId).done,false);
  }finally{db.close();}
});

test('rotation after receive precheck prevents the old endpoint returning decrypted text',async t=>{
  const start=deferred(),resume=deferred();
  const f=await fixture(t,{afterAuthorize:async (_device,packet)=>{
    if(packet.checkpoint==='RECEIVE_START'&&packet.context.messageId==='interrupted-receive'){
      start.resolve();await resume.promise;
    }
  }});
  const context=f.context('interrupted-receive'),envelope=await f.sender.seal('Artificial text blocked during replacement',context);
  const pending=f.receiver.preview(envelope,context),rejected=assert.rejects(pending,encryptedError);
  await start.promise;
  const p=await f.ready(await f.propose('RECEIVER'));
  await f.activate(p);
  resume.resolve();await rejected;
  const db=new DatabaseSync(f.databasePath,{readOnly:true});
  try{
    const record=JSON.parse(db.prepare('SELECT state_json FROM rio_recovery WHERE id=1').get().state_json);
    assert.ok(!record.received.includes(context.messageId));
  }finally{db.close();}
});

test('aborted activation keeps old pair active and complete approvals available for one retry',async t=>{
  const f=await fixture(t),p=await f.ready(await f.propose('SENDER'));
  f.setAbort(true);
  assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
  f.setAbort(false);
  assert.equal(f.registry.snapshot().revision,1);
  assert.equal(f.registry.checkPair('sender-device-1',{own:f.sender.publicIdentity,peer:f.receiver.publicIdentity}),true);
  await assert.rejects(p.candidate.connect(f.receiver.publicIdentity,f.receiver.publicIdentity.pin,f.receiver.publicIdentity.id),encryptedError);
  assert.equal(f.registry.activate(p.challenge).revision,2);
  assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
});

test('two registry handles can activate a proven challenge exactly once',async t=>{
  const f=await fixture(t),p=await f.ready(await f.propose('RECEIVER'));
  const second=f.trackHandle(openRioTestRecoveryRegistry({databasePath:f.databasePath,classification:CLASS,now:f.now}));
  const results=await Promise.allSettled([
    Promise.resolve().then(()=>f.registry.activate(p.challenge)),
    Promise.resolve().then(()=>second.activate(p.challenge))
  ]);
  assert.equal(results.filter(value=>value.status==='fulfilled').length,1);
  assert.equal(results.filter(value=>value.status==='rejected').length,1);
  assert.equal(results.find(value=>value.status==='rejected').reason.message,'RECOVERY_NOT_ACCEPTED');
  assert.equal(second.snapshot().revision,2);
});

test('challenge expiry denies proof and activation while a fresh challenge can replace it',async t=>{
  const f=await fixture(t),p=await f.ready(await f.propose('SENDER'));
  f.setTime(BASE+120_000);
  assert.throws(()=>f.registry.activate(p.challenge),recoveryError);
  await assert.rejects(p.candidate.proveRecovery(p.challenge),encryptedError);
  const next=await f.ready(await f.propose('SENDER','sender-device-3'));
  assert.notEqual(next.challenge.context.id,p.challenge.context.id);
  assert.throws(()=>f.registry.confirmOwner(p.challenge),recoveryError);
  assert.equal(f.registry.activate(next.challenge).revision,2);
});

test('host and client reject clock rollback, including after the durable registry is reopened',async t=>{
  const f=await fixture(t);
  f.setTime(BASE+1000);f.registry.snapshot();
  const context=f.context('clock-forward'),envelope=await f.sender.seal('Clock boundary fixture',context);
  await f.receiver.preview(envelope,context);
  f.setTime(BASE+999);
  assert.throws(()=>f.registry.snapshot(),recoveryError);
  await assert.rejects(f.receiver.preview(envelope,context),encryptedError);
  f.reopen();
  assert.throws(()=>f.registry.snapshot(),recoveryError);
  f.setTime(BASE+1001);
  assert.equal(f.registry.snapshot().revision,1);
});

test('host ledger binds full context, ciphertext digest and role at every checkpoint',async t=>{
  const f=await fixture(t),context=f.context('ledger-bound');
  const sender={own:f.sender.publicIdentity,peer:f.receiver.publicIdentity};
  const receiver={own:f.receiver.publicIdentity,peer:f.sender.publicIdentity};
  const digest='A'.repeat(43),differentDigest='B'+'A'.repeat(42);
  const packet=(checkpoint,pair,c= context,d= digest)=>({checkpoint,...pair,context:c,envelopeDigest:d});
  assert.throws(()=>f.registry.authorize('receiver-device-1',packet('SEAL_START',receiver,context,null)),recoveryError);
  assert.equal(f.registry.authorize('sender-device-1',packet('SEAL_START',sender,context,null)),true);
  const changed={...context,channelId:'another-channel'};
  assert.throws(()=>f.registry.authorize('sender-device-1',packet('SEAL_FINISH',sender,changed)),recoveryError);
  assert.equal(f.registry.authorize('sender-device-1',packet('SEAL_FINISH',sender)),true);
  assert.throws(()=>f.registry.authorize('receiver-device-1',packet('RECEIVE_PREVIEW',receiver,changed)),recoveryError);
  assert.throws(()=>f.registry.authorize('receiver-device-1',packet('RECEIVE_PREVIEW',receiver,context,differentDigest)),recoveryError);
  assert.equal(f.registry.authorize('receiver-device-1',packet('RECEIVE_PREVIEW',receiver)),true);
  assert.equal(f.registry.authorize('receiver-device-1',packet('RECEIVE_CONSUME',receiver)),true);
  assert.throws(()=>f.registry.authorize('receiver-device-1',packet('RECEIVE_START',receiver)),recoveryError);
});

test('registry persists only public key material and bounded metadata, without message plaintext or private keys',async t=>{
  const f=await fixture(t),text='Unique artificial plaintext absent from host metadata',context=f.context('metadata-only');
  const envelope=await f.sender.seal(text,context);
  await f.receiver.acceptDelivered(envelope,context,await encryptedEnvelopeDigest(envelope));
  const p=await f.ready(await f.propose('RECEIVER'));
  const db=new DatabaseSync(f.databasePath,{readOnly:true});
  try{
    const serialized=db.prepare('SELECT state_json FROM rio_recovery WHERE id=1').get().state_json;
    const record=JSON.parse(serialized);
    assert.ok(!serialized.includes(text));
    for(const forbidden of ['privateKey','ciphertext','wrappedKey','ENCRYPTED_TRANSFER_NOT_ACCEPTED','CryptoKey']){
      assert.ok(!serialized.includes(forbidden),forbidden+' must not be stored');
    }
    assert.deepEqual(Object.keys(record.parties.SENDER.identity).sort(),
      ['algorithm','classification','id','pin','role','schemaVersion','spki'].sort());
    assert.equal(record.pending.challenge.context.id,p.challenge.context.id);
    assert.equal(record.pending.candidateIdentity.pin,p.candidate.publicIdentity.pin);
    assert.equal(record.received.length,1);
    assert.equal(canonicalEncrypted(record),serialized);
  }finally{db.close();}
});

test('global replay reservation limit remains bounded after restart and device replacement',async t=>{
  const f=await fixture(t),pair={own:f.sender.publicIdentity,peer:f.receiver.publicIdentity};
  for(let i=0;i<128;i++){
    assert.equal(f.registry.authorize('sender-device-1',{checkpoint:'SEAL_START',...pair,
      context:f.context('bounded-'+i),envelopeDigest:null}),true);
  }
  f.reopen();
  const p=await f.ready(await f.propose('SENDER'));
  await f.activate(p);
  await assert.rejects(p.candidate.seal('Past the lifetime bound',f.context('bounded-129')),encryptedError);
  const db=new DatabaseSync(f.databasePath,{readOnly:true});
  try{
    const record=JSON.parse(db.prepare('SELECT state_json FROM rio_recovery WHERE id=1').get().state_json);
    assert.equal(record.sent.length,128);
  }finally{db.close();}
});

test('replacement history is bounded and cannot reuse a retired identity',async t=>{
  const f=await fixture(t);
  for(let i=2;i<=9;i++){
    const p=await f.ready(await f.propose('SENDER','sender-device-'+i));
    await f.activate(p);
  }
  assert.equal(f.registry.snapshot().revision,9);
  const candidate=await f.endpoint('SENDER','sender-device-10'),current=f.registry.snapshot();
  assert.throws(()=>f.registry.propose({role:'SENDER',expectedRevision:current.revision,
    oldPin:current.parties.SENDER.identity.pin,newDeviceId:'sender-device-10',candidateIdentity:candidate.publicIdentity}),recoveryError);
  f.reopen();
  assert.equal(f.registry.snapshot().revision,9);
});

test('transport accepts only exact current sealed bytes and rejects plaintext, mutation and consumed envelopes',async t=>{
  const f=await fixture(t),context=f.context('transport-current');
  const envelope=await f.sender.seal('Synthetic opaque transport',context);
  const encode=value=>encodeEncryptedBytes(new TextEncoder().encode(canonicalEncrypted(value)));
  const payload=encode(envelope);
  assert.equal(f.registry.acceptTransport(payload),true);
  assert.throws(()=>f.registry.acceptTransport(encode({text:'Plaintext has no valid encrypted envelope'})),recoveryError);
  const tampered=clone(envelope);tampered.signature=tamperProof(tampered.signature);
  assert.throws(()=>f.registry.acceptTransport(encode(tampered)),recoveryError);
  const changed=clone(envelope);changed.header.context.channelId='transport-another-channel';
  assert.throws(()=>f.registry.acceptTransport(encode(changed)),recoveryError);
  const noncanonical=encodeEncryptedBytes(new TextEncoder().encode(JSON.stringify(envelope)));
  assert.notEqual(noncanonical,payload);
  assert.throws(()=>f.registry.acceptTransport(noncanonical),recoveryError);
  await f.receiver.acceptDelivered(envelope,context,await encryptedEnvelopeDigest(envelope));
  assert.throws(()=>f.registry.acceptTransport(payload),recoveryError);
});

test('transport refuses old ciphertext after replacement and accepts a newly sealed current pair envelope',async t=>{
  const f=await fixture(t),context=f.context('transport-retired');
  const encode=value=>encodeEncryptedBytes(new TextEncoder().encode(canonicalEncrypted(value)));
  const old=await f.sender.seal('Synthetic old receiver ciphertext',context);
  assert.equal(f.registry.acceptTransport(encode(old)),true);
  const p=await f.ready(await f.propose('RECEIVER'));
  await f.activate(p);
  f.reopen();
  assert.throws(()=>f.registry.acceptTransport(encode(old)),recoveryError);
  const freshContext=f.context('transport-replaced'),fresh=await f.sender.seal('Current synthetic receiver ciphertext',freshContext);
  assert.equal(f.registry.acceptTransport(encode(fresh)),true);
});

test('HTTP host rejects explicitly invalid transport authority instead of disabling it',async t=>{
  const {createRioContactReference}=await import('../contact-preview/reference.mjs');
  const {startRioContactPreview}=await import('../contact-preview/server.mjs');
  const f=await fixture(t);
  for(const transportAuthority of [null,false,0,'invalid']){
    assert.throws(()=>createRioContactReference({databasePath:join(f.databasePath,'unused.sqlite'),classification:CLASS,payloadMode:'OPAQUE_TRANSPORT',transportAuthority}),
      /EXPLICIT_SYNTHETIC_HOST_REQUIRED/);
    await assert.rejects(startRioContactPreview({databasePath:join(f.databasePath,'unused.sqlite'),classification:CLASS,payloadMode:'OPAQUE_TRANSPORT',transportAuthority}),
      /EXPLICIT_SYNTHETIC_HOST_REQUIRED/);
  }
});
test('endpoint requires exact true from trusted pair authority',async()=>{
  const sender=await createEncryptedTestEndpoint({classification:CLASS,role:'SENDER',id:'reject-authority-sender',
    recoveryAuthority:{checkPair:async()=>({accepted:true}),authorize:async()=>true}});
  const receiver=await createEncryptedTestEndpoint({classification:CLASS,role:'RECEIVER',id:'reject-authority-receiver'});
  try{await assert.rejects(sender.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id),encryptedError);}
  finally{sender.close();receiver.close();}
});
test('host transport verifies sender signature even if a fabricated envelope digest is recorded',async t=>{
  const f=await fixture(t),originalContext=f.context('real-envelope'),envelope=clone(await f.sender.seal('Synthetic signature check',originalContext));
  const fabricatedContext=f.context('fabricated-envelope');envelope.header.context=fabricatedContext;
  const packet={own:f.sender.publicIdentity,peer:f.receiver.publicIdentity,context:fabricatedContext};
  f.registry.authorize('sender-device-1',{...packet,checkpoint:'SEAL_START',envelopeDigest:null});
  f.registry.authorize('sender-device-1',{...packet,checkpoint:'SEAL_FINISH',envelopeDigest:await encryptedEnvelopeDigest(envelope)});
  const payload=encodeEncryptedBytes(new TextEncoder().encode(canonicalEncrypted(envelope)));
  assert.throws(()=>f.registry.acceptTransport(payload),recoveryError);
});
