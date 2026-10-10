import { test,expect } from '@playwright/test';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRioContactPreview } from '../contact-preview/server.mjs';
async function fixture(browser){
  const dir=mkdtempSync(join(tmpdir(),'rio-encrypted-browser-')),path=join(dir,'outbox.sqlite');
  const server=await startRioContactPreview({databasePath:path,classification:'SYNTHETIC_ONLY',payloadMode:'OPAQUE_TRANSPORT'});
  const contexts={},pages={},identities={};
  try{
    for(const side of ['SENDER','RECEIVER']){
      const context=await browser.newContext();contexts[side]=context;
      await context.addCookies([{name:side==='SENDER'?'rio_sender':'rio_receiver',value:server.credentials[side].sessionToken,url:server.origin,httpOnly:true,sameSite:'Strict'}]);
      const page=await context.newPage();pages[side]=page;
      await page.goto(side==='SENDER'?server.senderUrl:server.receiverUrl);
      identities[side]=await page.evaluate(async side=>{
        const module=await import('/assets/encrypted-client.mjs');window.encryptedModule=module;
        window.endpoint=await module.createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:side,id:'browser-'+side.toLowerCase()});
        return window.endpoint.publicIdentity;
      },side);
    }
    for(const side of ['SENDER','RECEIVER']){
      const peer=identities[side==='SENDER'?'RECEIVER':'SENDER'];
      await pages[side].evaluate(async peer=>window.endpoint.connect(peer,peer.pin,peer.id),peer);
    }
  }catch(error){
    for(const context of Object.values(contexts))await context.close();
    await server.close();rmSync(dir,{recursive:true,force:true});throw error;
  }
  return {server,path,pages,async close(){
    for(const context of Object.values(contexts))await context.close();
    await server.close();rmSync(dir,{recursive:true,force:true});
  }};
}
async function state(f,side){
  return f.pages[side].evaluate(async side=>{
    const response=await fetch('/api/state',{headers:{'X-RIO-Side':side}});
    if(!response.ok)throw new Error('STATE_REJECTED');return response.json();
  },side);
}
async function act(f,side,type){
  return f.pages[side].evaluate(async({side,type})=>{
    const state=await (await fetch('/api/state',{headers:{'X-RIO-Side':side}})).json(),row=state.requests[0];
    const body={type,actionId:crypto.randomUUID(),id:row.id,revision:row.revision,
      ...(type==='FINAL_ACCEPT'?{contractDigest:row.contractDigest,evidenceSetDigest:row.evidenceSetDigest}:{})};
    const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-RIO-Side':side,'X-RIO-CSRF':state.csrfToken},body:JSON.stringify(body)});
    return {status:response.status,outcome:await response.json()};
  },{side,type});
}
async function initiate(f,text){
  return f.pages.SENDER.evaluate(async text=>{
    const start=new Date(),context={channelId:'channel-'+crypto.randomUUID(),messageId:'message-'+crypto.randomUUID(),
      senderId:'browser-sender',receiverId:'browser-receiver',issuedAt:start.toISOString(),expiresAt:new Date(+start+300_000).toISOString()};
    window.originalEnvelope=await window.endpoint.seal(text,context);
    const opaquePayload=window.encryptedModule.encodeEncryptedBytes(new TextEncoder().encode(window.encryptedModule.canonicalEncrypted(window.originalEnvelope)));
    const state=await(await fetch('/api/state',{headers:{'X-RIO-Side':'SENDER'}})).json();
    const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-RIO-Side':'SENDER','X-RIO-CSRF':state.csrfToken},
      body:JSON.stringify({type:'INITIATE_OPAQUE',actionId:crypto.randomUUID(),opaquePayload})});
    return {context,status:response.status};
  },text);
}
async function preview(f,context,consume=false){
  return f.pages.RECEIVER.evaluate(async({context,consume})=>{
    const state=await(await fetch('/api/state',{headers:{'X-RIO-Side':'RECEIVER'}})).json(),row=state.requests[0];
    if(!row.opaquePayload)throw new Error('NOVA_NOT_ADMITTED');
    const envelope=JSON.parse(new TextDecoder().decode(window.encryptedModule.decodeEncryptedBytes(row.opaquePayload)));
    if(consume && row.phase!=='DELIVERED')throw new Error('DELIVERY_NOT_COMMITTED');
    return consume?window.endpoint.acceptDelivered(envelope,context,await window.encryptedModule.encryptedEnvelopeDigest(envelope))
      :window.endpoint.preview(envelope,context);
  },{context,consume});
}
test('private browser keys exchange ciphertext through both explicit HTTP approval rounds',async({browser})=>{
  const f=await fixture(browser);
  try{
    const text='GEHEIME-KUNSTMATIGE-PROEFTEKST-世界',init=await initiate(f,text);
    expect(init.status).toBe(200);
    expect((await state(f,'RECEIVER')).requests[0].opaquePayload).toBeNull();
    await expect(preview(f,init.context)).rejects.toThrow('NOVA_NOT_ADMITTED');
    expect((await act(f,'RECEIVER','NOVA_ADMIT')).status).toBe(200);
    expect((await preview(f,init.context)).text).toBe(text);
    await expect(preview(f,init.context,true)).rejects.toThrow('DELIVERY_NOT_COMMITTED');
    expect((await act(f,'SENDER','FINAL_ACCEPT')).status).toBe(200);
    expect((await state(f,'SENDER')).requests[0].phase).toBe('COMMIT_CONFIRMATION');
    expect((await act(f,'RECEIVER','FINAL_ACCEPT')).status).toBe(200);
    expect((await state(f,'SENDER')).requests[0].phase).toBe('QUEUED');
    expect((await act(f,'SENDER','PREPARE_DELIVERY')).status).toBe(200);
    expect((await state(f,'RECEIVER')).requests[0].opaquePayload).toBeNull();
    expect((await act(f,'RECEIVER','ADMIT_DELIVERY')).status).toBe(200);
    expect((await act(f,'SENDER','FINAL_ACCEPT')).status).toBe(200);
    expect((await act(f,'RECEIVER','FINAL_ACCEPT')).status).toBe(200);
    expect((await preview(f,init.context,true)).text).toBe(text);
    await expect(preview(f,init.context,true)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    for(const side of ['SENDER','RECEIVER']){
      const stateText=JSON.stringify(await state(f,side));expect(stateText).not.toContain(text);
      expect(stateText).not.toContain('PRIVATE KEY');expect(stateText).not.toContain('"d":');
    }
    expect(readFileSync(f.path).includes(Buffer.from(text))).toBe(false);
  }finally{await f.close();}
});
test('browser receiver rejects altered ciphertext and a substituted peer key',async({browser})=>{
  const f=await fixture(browser);
  try{
    const init=await initiate(f,'Afgeschermde proeftekst');await act(f,'RECEIVER','NOVA_ADMIT');
    const outcome=await f.pages.RECEIVER.evaluate(async context=>{
      const state=await(await fetch('/api/state',{headers:{'X-RIO-Side':'RECEIVER'}})).json();
      const envelope=JSON.parse(new TextDecoder().decode(window.encryptedModule.decodeEncryptedBytes(state.requests[0].opaquePayload)));
      const bytes=window.encryptedModule.decodeEncryptedBytes(envelope.ciphertext);bytes[0]^=1;envelope.ciphertext=window.encryptedModule.encodeEncryptedBytes(bytes);
      try{await window.endpoint.preview(envelope,context);return 'ACCEPTED';}catch{return 'REJECTED';}
    },init.context);
    expect(outcome).toBe('REJECTED');expect((await preview(f,init.context)).text).toBe('Afgeschermde proeftekst');
    const wrongPin=await f.pages.SENDER.evaluate(async()=>{
      const isolated=await window.encryptedModule.createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'isolated-test'});
      try{await isolated.connect(window.endpoint.publicIdentity,'wrong-pin',window.endpoint.publicIdentity.id);return 'ACCEPTED';}catch{return 'REJECTED';}finally{isolated.close();}
    });expect(wrongPin).toBe('REJECTED');
  }finally{await f.close();}
});
test('revocation closes encrypted delivery without giving it automatic consent',async({browser})=>{
  const f=await fixture(browser);
  try{
    const init=await initiate(f,'Intrekbare proeftekst');await act(f,'RECEIVER','NOVA_ADMIT');
    await act(f,'SENDER','FINAL_ACCEPT');await act(f,'RECEIVER','FINAL_ACCEPT');
    expect((await act(f,'RECEIVER','REVOKE')).status).toBe(200);
    expect((await state(f,'RECEIVER')).requests[0].phase).toBe('CLOSED');
    expect((await act(f,'SENDER','PREPARE_DELIVERY')).status).toBe(409);
    await expect(preview(f,init.context,true)).rejects.toThrow('DELIVERY_NOT_COMMITTED');
  }finally{await f.close();}
});
