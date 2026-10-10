import { test,expect,chromium } from '@playwright/test';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRioContactPreview } from '../contact-preview/server.mjs';
test('separate persistent Chromium processes retain private keys and replay state across relaunch',async()=>{
  test.setTimeout(90000);
  const dir=mkdtempSync(join(tmpdir(),'rio-client-process-'));
  const server=await startRioContactPreview({databasePath:join(dir,'outbox.sqlite'),classification:'SYNTHETIC_ONLY',payloadMode:'OPAQUE_TRANSPORT'});
  const handles=[];
  async function boot(side,mode,expectedOwnPin){
    const browser=await chromium.launchPersistentContext(join(dir,side.toLowerCase()+'-profile'),{headless:true});handles.push(browser);
    await browser.addCookies([{name:side==='SENDER'?'rio_sender':'rio_receiver',value:server.credentials[side].sessionToken,url:server.origin,httpOnly:true,sameSite:'Strict'}]);
    const page=await browser.newPage();
    await page.goto(side==='SENDER'?server.senderUrl:server.receiverUrl);
    const identity=await page.evaluate(async options=>{
      window.module=await import('/assets/encrypted-client.mjs');
      const {openRioTestKeyVault}=await import('/assets/key-vault.mjs');
      const keyVault=await openRioTestKeyVault({...options,classification:'SYNTHETIC_ONLY',namespace:'process-'+options.role.toLowerCase()});
      window.endpoint=await window.module.createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:options.role,id:options.id,keyVault});
      return window.endpoint.publicIdentity;
    },{role:side,id:'persistent-'+side.toLowerCase(),mode,...(expectedOwnPin?{expectedOwnPin}:{})});
    return {browser,page,identity};
  }
  async function connect(page,peer){await page.evaluate(peer=>window.endpoint.connect(peer,peer.pin,peer.id),peer);}
  async function act(page,side,type,opaquePayload){
    const result=await page.evaluate(async({side,type,opaquePayload})=>{
      const state=await(await fetch('/api/state',{headers:{'X-RIO-Side':side}})).json(),row=state.requests[0];
      const body=type==='INITIATE_OPAQUE'?{type,actionId:crypto.randomUUID(),opaquePayload}
        :{type,actionId:crypto.randomUUID(),id:row.id,revision:row.revision,
          ...(type==='FINAL_ACCEPT'?{contractDigest:row.contractDigest,evidenceSetDigest:row.evidenceSetDigest}:{})};
      const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-RIO-Side':side,'X-RIO-CSRF':state.csrfToken},body:JSON.stringify(body)});
      return response.status;
    },{side,type,...(opaquePayload?{opaquePayload}:{})});
    expect(result).toBe(200);
  }
  async function consume(page,context){
    return page.evaluate(async context=>{
      const state=await(await fetch('/api/state',{headers:{'X-RIO-Side':'RECEIVER'}})).json();
      if(state.requests[0].phase!=='DELIVERED')throw new Error('DELIVERY_NOT_COMMITTED');
      const envelope=JSON.parse(new TextDecoder().decode(window.module.decodeEncryptedBytes(state.requests[0].opaquePayload)));
      return window.endpoint.acceptDelivered(envelope,context,await window.module.encryptedEnvelopeDigest(envelope));
    },context);
  }
  try{
    let sender=await boot('SENDER','ENROLL'),receiver=await boot('RECEIVER','ENROLL');
    const senderIdentity=sender.identity,receiverIdentity=receiver.identity;
    await connect(sender.page,receiver.identity);await connect(receiver.page,sender.identity);
    const context={channelId:'process-contact',messageId:'process-message',senderId:'persistent-sender',receiverId:'persistent-receiver',
      issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()};
    const opaquePayload=await sender.page.evaluate(async context=>{
      const envelope=await window.endpoint.seal('Procesherstart behoudt deze kunstmatige proeftekst.',context);
      return window.module.encodeEncryptedBytes(new TextEncoder().encode(window.module.canonicalEncrypted(envelope)));
    },context);
    await act(sender.page,'SENDER','INITIATE_OPAQUE',opaquePayload);
    await act(receiver.page,'RECEIVER','NOVA_ADMIT');
    await act(sender.page,'SENDER','FINAL_ACCEPT');await act(receiver.page,'RECEIVER','FINAL_ACCEPT');
    await act(sender.page,'SENDER','PREPARE_DELIVERY');await act(receiver.page,'RECEIVER','ADMIT_DELIVERY');
    await act(sender.page,'SENDER','FINAL_ACCEPT');await act(receiver.page,'RECEIVER','FINAL_ACCEPT');
    await sender.browser.close();await receiver.browser.close();
    sender=await boot('SENDER','RESUME',senderIdentity.pin);receiver=await boot('RECEIVER','RESUME',receiverIdentity.pin);
    expect(sender.identity).toEqual(senderIdentity);expect(receiver.identity).toEqual(receiverIdentity);
    expect((await consume(receiver.page,context)).text).toBe('Procesherstart behoudt deze kunstmatige proeftekst.');
    await expect(sender.page.evaluate(context=>window.endpoint.seal('Hetzelfde identificatienummer mag niet opnieuw.',context),context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    await expect(consume(receiver.page,context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    await receiver.browser.close();receiver=await boot('RECEIVER','RESUME',receiverIdentity.pin);
    await expect(consume(receiver.page,context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
  }finally{
    for(const handle of handles)await handle.close().catch(()=>{});
    await server.close();rmSync(dir,{recursive:true,force:true});
  }
});
