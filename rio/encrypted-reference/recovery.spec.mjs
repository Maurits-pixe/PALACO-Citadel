import {test,expect,chromium} from '@playwright/test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openRioTestRecoveryRegistry} from './recovery-registry.mjs';
import {startRioContactPreview} from '../contact-preview/server.mjs';
const CLASS='SYNTHETIC_ONLY';
async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'rio-device-recovery-')),path=join(dir,'recovery.sqlite');
  let registry=openRioTestRecoveryRegistry({databasePath:path,classification:CLASS});
  const server=await startRioContactPreview({databasePath:join(dir,'outbox.sqlite'),classification:CLASS,payloadMode:'OPAQUE_TRANSPORT',
    transportAuthority:payload=>registry.acceptTransport(payload)});
  const handles=[];
  async function boot(role,deviceId,mode='ENROLL',pin){
    const context=await chromium.launchPersistentContext(join(dir,deviceId),{headless:true});handles.push(context);
    await context.addCookies([{name:role==='SENDER'?'rio_sender':'rio_receiver',value:server.credentials[role].sessionToken,
      url:server.origin,httpOnly:true,sameSite:'Strict'}]);
    // Test bridge binds the device in the host closure. It exposes no recovery approvals.
    await context.route(server.origin+'/__test-authority/**',async route=>{
      try{
        if(route.request().method()!=='POST')throw new Error('METHOD');
        const input=route.request().postDataJSON(),kind=new URL(route.request().url()).pathname.split('/').at(-1);
        const accepted=kind==='pair'?registry.checkPair(deviceId,input):kind==='transfer'?registry.authorize(deviceId,input):false;
        await route.fulfill({status:accepted===true?200:409,contentType:'application/json',body:JSON.stringify({accepted:accepted===true})});
      }catch{await route.fulfill({status:409,contentType:'application/json',body:'{"accepted":false}'});}
    });
    const page=await context.newPage();await page.goto(role==='SENDER'?server.senderUrl:server.receiverUrl);
    const identity=await page.evaluate(async({role,mode,pin})=>{
      window.module=await import('/assets/client.mjs');
      const {openRioTestKeyVault}=await import('/assets/key-vault.mjs');
      window.authority=Object.freeze({
        checkPair:async packet=>{
          const response=await fetch('/__test-authority/pair',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify(packet),signal:AbortSignal.timeout(5000)});
          return response.ok&&(await response.json()).accepted===true;
        },
        authorize:async packet=>{
          const response=await fetch('/__test-authority/transfer',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify(packet),signal:AbortSignal.timeout(5000)});
          return response.ok&&(await response.json()).accepted===true;
        }
      });
      const keyVault=await openRioTestKeyVault({classification:'SYNTHETIC_ONLY',role,id:'recovery-'+role.toLowerCase(),
        namespace:'recovery-'+role.toLowerCase(),mode,...(pin?{expectedOwnPin:pin}:{}),
        peerRotationAuthority:packet=>window.authority.checkPair(packet)});
      window.vault=keyVault;
      window.endpoint=await window.module.createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role,id:'recovery-'+role.toLowerCase(),keyVault,recoveryAuthority:window.authority});
      return window.endpoint.publicIdentity;
    },{role,mode,pin});
    return {context,page,identity,role,deviceId};
  }
  async function connect(device,peer,rotation=false){
    return device.page.evaluate(({peer,rotation})=>rotation?window.endpoint.rebindPeer(peer,peer.pin,peer.id):window.endpoint.connect(peer,peer.pin,peer.id),{peer,rotation});
  }
  const sender=await boot('SENDER','device-sender'),receiver=await boot('RECEIVER','device-receiver');
  registry.enroll({SENDER:{identity:sender.identity,deviceId:sender.deviceId},RECEIVER:{identity:receiver.identity,deviceId:receiver.deviceId}});
  await connect(sender,receiver.identity);await connect(receiver,sender.identity);
  return {sender,receiver,boot,connect,server,path,dir,get registry(){return registry;},
    restartRegistry(){registry.close();registry=openRioTestRecoveryRegistry({databasePath:path,classification:CLASS});},
    async close(){for(const handle of handles)await handle.close().catch(()=>{});await server.close();registry.close();rmSync(dir,{recursive:true,force:true});}};
}
async function state(device){return device.page.evaluate(async role=>{const response=await fetch('/api/state',{headers:{'X-RIO-Side':role}});return response.json();},device.role);}
async function act(device,type,payload,id){
  return device.page.evaluate(async({role,type,payload,id})=>{
    const state=await(await fetch('/api/state',{headers:{'X-RIO-Side':role}})).json();
    const row=id?state.requests.find(r=>r.id===id):state.requests.at(-1);
    const body=type==='INITIATE_OPAQUE'?{type,actionId:crypto.randomUUID(),opaquePayload:payload}
      :{type,id:row.id,revision:row.revision,actionId:crypto.randomUUID(),...(type==='FINAL_ACCEPT'?{contractDigest:row.contractDigest,evidenceSetDigest:row.evidenceSetDigest}:{})};
    const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-RIO-Side':role,'X-RIO-CSRF':state.csrfToken},body:JSON.stringify(body)});
    return response.status;
  },{role:device.role,type,payload,id});
}
async function seal(device,text,messageId='message-'+crypto.randomUUID()){
  const start=Date.now(),context={channelId:'device-contact',messageId,senderId:'recovery-sender',receiverId:'recovery-receiver',
    issuedAt:new Date(start).toISOString(),expiresAt:new Date(start+300000).toISOString()};
  return device.page.evaluate(async({text,context})=>{
    const envelope=await window.endpoint.seal(text,context);
    const payload=window.module.encodeEncryptedBytes(new TextEncoder().encode(window.module.canonicalEncrypted(envelope)));
    return {context,envelope,payload};
  },{text,context});
}
async function queued(sender,receiver,packet){
  expect(await act(sender,'INITIATE_OPAQUE',packet.payload)).toBe(200);
  const id=(await state(sender)).requests.at(-1).id;
  expect(await act(receiver,'NOVA_ADMIT',undefined,id)).toBe(200);
  expect(await act(sender,'FINAL_ACCEPT',undefined,id)).toBe(200);
  expect(await act(receiver,'FINAL_ACCEPT',undefined,id)).toBe(200);
  expect((await state(receiver)).requests.find(r=>r.id===id).phase).toBe('QUEUED');
  return id;
}
async function deliver(sender,receiver,id){
  expect(await act(sender,'PREPARE_DELIVERY',undefined,id)).toBe(200);
  expect(await act(receiver,'ADMIT_DELIVERY',undefined,id)).toBe(200);
  expect(await act(sender,'FINAL_ACCEPT',undefined,id)).toBe(200);
  expect(await act(receiver,'FINAL_ACCEPT',undefined,id)).toBe(200);
  expect((await state(receiver)).requests.find(r=>r.id===id).phase).toBe('DELIVERED');
}
async function consume(receiver,packet,id){
  expect((await state(receiver)).requests.find(r=>r.id===id).phase).toBe('DELIVERED');
  return receiver.page.evaluate(async({envelope,context})=>window.endpoint.acceptDelivered(envelope,context,await window.module.encryptedEnvelopeDigest(envelope)),packet);
}
async function proposed(f,role){
  const old=role==='SENDER'?f.sender:f.receiver,candidate=await f.boot(role,'replacement-'+role.toLowerCase());
  const challenge=f.registry.propose({role,expectedRevision:f.registry.snapshot().revision,oldPin:old.identity.pin,
    newDeviceId:candidate.deviceId,candidateIdentity:candidate.identity});
  const proof=await candidate.page.evaluate(challenge=>window.endpoint.proveRecovery(challenge),challenge);
  return {old,candidate,challenge,proof};
}
for(const role of ['SENDER','RECEIVER']){
  test(role+' recovery on another persistent browser profile blocks old queued delivery and preserves replay across process restart',async()=>{
    test.setTimeout(90000);
    const f=await fixture();
    try{
      const oldPacket=await seal(f.sender,'Oude kunstmatige overdracht.'),oldRequest=await queued(f.sender,f.receiver,oldPacket);
      const {old,candidate,challenge,proof}=await proposed(f,role);
      expect(candidate.identity.pin).not.toBe(old.identity.pin);
      expect(()=>f.registry.activate(challenge)).toThrow('RECOVERY_NOT_ACCEPTED');
      expect(()=>f.registry.confirmOwner(challenge)).toThrow('RECOVERY_NOT_ACCEPTED');
      expect(f.registry.proveCandidate(challenge,proof)).toBe(true);
      expect(f.registry.confirmOwner(challenge)).toBe(true);
      expect(()=>f.registry.activate(challenge)).toThrow('RECOVERY_NOT_ACCEPTED');
      expect(f.registry.confirmPeer(challenge)).toBe(true);f.registry.activate(challenge);
      expect(()=>f.registry.activate(challenge)).toThrow('RECOVERY_NOT_ACCEPTED');
      expect(await act(f.sender,'PREPARE_DELIVERY',undefined,oldRequest)).toBe(503);
      expect((await state(f.receiver)).requests.find(r=>r.id===oldRequest).phase).toBe('CLOSED');
      if(role==='SENDER'){
        await expect(seal(old,'Oude sleutel mag geen nieuwe overdracht maken.')).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      }else{
        await expect(old.page.evaluate(packet=>window.endpoint.preview(packet.envelope,packet.context),oldPacket)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      }
      const peer=role==='SENDER'?f.receiver:f.sender;
      await f.connect(candidate,peer.identity);await f.connect(peer,candidate.identity,true);
      const sender=role==='SENDER'?candidate:peer,receiver=role==='RECEIVER'?candidate:peer;
      await expect(seal(sender,'Gebruikt nummer blijft geblokkeerd.',oldPacket.context.messageId)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      if(role==='RECEIVER')await expect(receiver.page.evaluate(packet=>window.endpoint.preview(packet.envelope,packet.context),oldPacket)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      const text='Nieuw apparaat ontvangt deze afgeschermde proeftekst — 世界.';
      const fresh=await seal(sender,text),id=await queued(sender,receiver,fresh);await deliver(sender,receiver,id);
      expect((await consume(receiver,fresh,id)).text).toBe(text);
      const peerPin=peer.identity.pin,peerEpoch=await peer.page.evaluate(()=>window.endpoint.keyEpoch);
      await sender.context.close();await receiver.context.close();f.restartRegistry();
      const resumedSender=await f.boot('SENDER',sender.deviceId,'RESUME',sender.identity.pin);
      const resumedReceiver=await f.boot('RECEIVER',receiver.deviceId,'RESUME',receiver.identity.pin);
      expect(resumedSender.identity).toEqual(sender.identity);expect(resumedReceiver.identity).toEqual(receiver.identity);
      const resumedPeer=role==='SENDER'?resumedReceiver:resumedSender;
      expect(resumedPeer.identity.pin).toBe(peerPin);expect(await resumedPeer.page.evaluate(()=>window.endpoint.keyEpoch)).toBe(peerEpoch);
      await expect(seal(resumedSender,'Hetzelfde nummer blijft verbruikt.',fresh.context.messageId)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      await expect(consume(resumedReceiver,fresh,id)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      const dbBytes=readFileSync(f.path);expect(dbBytes.includes(Buffer.from(text))).toBe(false);expect(dbBytes.includes(Buffer.from('PRIVATE KEY'))).toBe(false);
      const again=await seal(resumedSender,'Na herstart blijft de nieuwe sleutel bruikbaar.'),nextId=await queued(resumedSender,resumedReceiver,again);
      await deliver(resumedSender,resumedReceiver,nextId);
      expect((await consume(resumedReceiver,again,nextId)).text).toBe('Na herstart blijft de nieuwe sleutel bruikbaar.');
    }finally{await f.close();}
  });
}
for(const role of ['SENDER','RECEIVER']){
  test(role+' local revocation during final authority callback prevents browser result release',async()=>{
    const f=await fixture();
    try{
      let packet;if(role==='RECEIVER')packet=await seal(f.sender,'Geen tekst na lokale intrekking.');
      const device=role==='SENDER'?f.sender:f.receiver;
      const outcome=await device.page.evaluate(async({role,packet})=>{
        const original=window.authority;
        // A second endpoint/vault handle represents another same-profile tab.
        const {openRioTestKeyVault}=await import('/assets/key-vault.mjs');
        const keyVault=await openRioTestKeyVault({classification:'SYNTHETIC_ONLY',role,id:'recovery-'+role.toLowerCase(),namespace:'recovery-'+role.toLowerCase(),
          mode:'RESUME',expectedOwnPin:window.endpoint.publicIdentity.pin,peerRotationAuthority:p=>original.checkPair(p)});
        const revoker=await window.module.createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role,id:'recovery-'+role.toLowerCase(),keyVault,recoveryAuthority:original});
        const previous=window.endpoint;previous.close();
        const vault=await openRioTestKeyVault({classification:'SYNTHETIC_ONLY',role,id:'recovery-'+role.toLowerCase(),namespace:'recovery-'+role.toLowerCase(),
          mode:'RESUME',expectedOwnPin:revoker.publicIdentity.pin,peerRotationAuthority:p=>original.checkPair(p)});
        const authority={checkPair:p=>original.checkPair(p),authorize:async p=>{
          const result=await original.authorize(p);
          if(p.checkpoint===(role==='SENDER'?'SEAL_FINISH':'RECEIVE_PREVIEW'))await revoker.revoke();
          return result;
        }};
        window.endpoint=await window.module.createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role,id:'recovery-'+role.toLowerCase(),keyVault:vault,recoveryAuthority:authority});
        try{
          if(role==='SENDER'){
            const time=Date.now(),context={channelId:'callback-revoke',messageId:'callback-message',senderId:'recovery-sender',receiverId:'recovery-receiver',
              issuedAt:new Date(time).toISOString(),expiresAt:new Date(time+300000).toISOString()};
            await window.endpoint.seal('Geen envelop na lokale intrekking.',context);
          }else await window.endpoint.preview(packet.envelope,packet.context);
          return 'RELEASED';
        }catch(error){return error.message;}finally{revoker.close();}
      },{role,packet});
      expect(outcome).toBe('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    }finally{await f.close();}
  });
}
test('browser vault snapshots peer rotation input before awaiting host approval',async()=>{
  const f=await fixture();
  try{
    const {candidate,challenge,proof}=await proposed(f,'RECEIVER');
    f.registry.proveCandidate(challenge,proof);f.registry.confirmOwner(challenge);f.registry.confirmPeer(challenge);f.registry.activate(challenge);
    const persisted=await f.sender.page.evaluate(async candidate=>{
      const {openRioTestKeyVault}=await import('/assets/key-vault.mjs');
      let proceed,entered;const gate=new Promise(r=>proceed=r),ready=new Promise(r=>entered=r);
      const old=window.endpoint.publicIdentity;window.endpoint.close();
      const keyVault=await openRioTestKeyVault({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'recovery-sender',namespace:'recovery-sender',mode:'RESUME',
        expectedOwnPin:old.pin,peerRotationAuthority:async packet=>{
          if(!Object.isFrozen(packet)||!Object.isFrozen(packet.peer))throw new Error('MUTABLE_PACKET');
          const accepted=await window.authority.checkPair(packet);entered();await gate;return accepted;
        }});
      const restored=await keyVault.initialize(()=>{throw new Error('NO_NEW_KEYS');});
      const pending=keyVault.rotatePeer(restored.epoch,restored.peer,candidate);
      await ready;candidate.id='changed-after-approval';candidate.pin=old.pin;proceed();await pending;keyVault.close();
      const reopened=await openRioTestKeyVault({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'recovery-sender',namespace:'recovery-sender',mode:'RESUME',expectedOwnPin:old.pin});
      const value=await reopened.initialize(()=>{throw new Error('NO_NEW_KEYS');});reopened.close();return value.peer;
    },candidate.identity);
    expect(persisted).toEqual(candidate.identity);
  }finally{await f.close();}
});
