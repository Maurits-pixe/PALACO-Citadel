import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRioContactReference } from '../contact-preview/reference.mjs';
import { createEncryptedTestEndpoint,canonicalEncrypted,encodeEncryptedBytes,decodeEncryptedBytes,encryptedEnvelopeDigest } from './client.mjs';
test('encrypted bytes pass both explicit contact rounds while SQLite never receives plaintext',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rio-encrypted-')),path=join(dir,'outbox.sqlite'),T='2026-10-10T13:00:00.000Z';
  const control=createRioContactReference({databasePath:path,classification:'SYNTHETIC_ONLY',payloadMode:'OPAQUE_TRANSPORT',now:()=>T});
  const sender=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'sender-test',now:()=>T});
  const receiver=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'RECEIVER',id:'receiver-test',now:()=>T});
  let action=0;
  const state=side=>control.view(side).requests[0];
  function act(side,type){const row=state(side);return control.act(side,{type,actionId:'act-'+(++action),id:row.id,revision:row.revision,...(type==='FINAL_ACCEPT'?{contractDigest:row.contractDigest,evidenceSetDigest:row.evidenceSetDigest}:{})});}
  try{
    await sender.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id);await receiver.connect(sender.publicIdentity,sender.publicIdentity.pin,sender.publicIdentity.id);
    const context={channelId:'channel-test',messageId:'message-test',senderId:'sender-test',receiverId:'receiver-test',issuedAt:T,expiresAt:'2026-10-10T13:05:00.000Z'};
    const text='ALLEEN-DE-ONTVANGER-LEEST-DEZE-UNIEKE-PROEFTEKST',envelope=await sender.seal(text,context);
    const payload=encodeEncryptedBytes(new TextEncoder().encode(canonicalEncrypted(envelope)));
    assert.equal(control.act('SENDER',{type:'INITIATE',actionId:'wrong-mode',text}).status,'REJECTED');
    assert.equal(control.act('SENDER',{type:'INITIATE_OPAQUE',actionId:'init',opaquePayload:payload}).status,'APPLIED');
    assert.equal(state('RECEIVER').opaquePayload,null);assert.equal(state('SENDER').text,null);
    assert.equal(act('RECEIVER','NOVA_ADMIT').status,'APPLIED');
    assert.equal((await receiver.preview(JSON.parse(new TextDecoder().decode(decodeEncryptedBytes(state('RECEIVER').opaquePayload))),context)).text,text);
    assert.equal(act('SENDER','FINAL_ACCEPT').status,'APPLIED');assert.equal(state('SENDER').phase,'COMMIT_CONFIRMATION');
    assert.equal(act('RECEIVER','FINAL_ACCEPT').status,'APPLIED');assert.equal(state('SENDER').phase,'QUEUED');
    assert.equal(act('SENDER','PREPARE_DELIVERY').status,'APPLIED');assert.equal(state('RECEIVER').opaquePayload,null);
    assert.equal(act('RECEIVER','ADMIT_DELIVERY').status,'APPLIED');
    assert.equal(act('SENDER','FINAL_ACCEPT').status,'APPLIED');assert.equal(state('SENDER').phase,'DELIVERY_CONFIRMATION');
    assert.equal(act('RECEIVER','FINAL_ACCEPT').status,'APPLIED');assert.equal(state('RECEIVER').phase,'DELIVERED');
    const delivered=JSON.parse(new TextDecoder().decode(decodeEncryptedBytes(state('RECEIVER').opaquePayload)));
    assert.equal((await receiver.acceptDelivered(delivered,context,await encryptedEnvelopeDigest(delivered))).text,text);
    assert.equal(JSON.stringify(control.view('SENDER')).includes(text),false);
    assert.equal(JSON.stringify(control.view('RECEIVER')).includes(text),false);
    assert.equal(readFileSync(path).includes(Buffer.from(text)),false);
  }finally{control.close();sender.close();receiver.close();rmSync(dir,{recursive:true,force:true});}
});
test('opaque mode remains bounded and text mode rejects encrypted-initiation actions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rio-opaque-bounds-'));
  const text=createRioContactReference({databasePath:join(dir,'text.sqlite'),classification:'SYNTHETIC_ONLY'});
  const opaque=createRioContactReference({databasePath:join(dir,'opaque.sqlite'),classification:'SYNTHETIC_ONLY',payloadMode:'OPAQUE_TRANSPORT'});
  try{
    assert.equal(text.act('SENDER',{type:'INITIATE_OPAQUE',actionId:'mode-1',opaquePayload:'AA'}).status,'REJECTED');
    for(const payload of ['','AB','AA=',Buffer.alloc(4097).toString('base64url')])
      assert.equal(opaque.act('SENDER',{type:'INITIATE_OPAQUE',actionId:'bad-'+payload.length,opaquePayload:payload}).status,'REJECTED');
    assert.equal(opaque.view('RECEIVER').requests.length,0);
  }finally{text.close();opaque.close();rmSync(dir,{recursive:true,force:true});}
});
