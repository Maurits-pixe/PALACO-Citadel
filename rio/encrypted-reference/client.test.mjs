import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { createEncryptedTestEndpoint,encryptedEnvelopeDigest,encodeEncryptedBytes,decodeEncryptedBytes,canonicalEncrypted } from './client.mjs';
const T='2026-10-10T13:00:00.000Z';
let sender,receiver,n=0;
const context=()=>({channelId:'channel-test',messageId:'message-'+(++n),senderId:'test-sender',receiverId:'test-receiver',issuedAt:T,expiresAt:'2026-10-10T13:05:00.000Z'});
const rejected=fn=>assert.rejects(fn,/^Error: ENCRYPTED_TRANSFER_NOT_ACCEPTED$/);
before(async()=>{
  sender=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'test-sender',now:()=>T});
  receiver=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'RECEIVER',id:'test-receiver',now:()=>T});
  await sender.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id);
  await receiver.connect(sender.publicIdentity,sender.publicIdentity.pin,sender.publicIdentity.id);
});
after(()=>{sender?.close();receiver?.close();});
test('Unicode text decrypts only at the pinned recipient and previews do not consume delivery',async()=>{
  const c=context(),text='Alleen deze testontvanger leest dit: wereld — 世界 — عالم.';
  const envelope=await sender.seal(text,c),digest=await encryptedEnvelopeDigest(envelope);
  assert.equal(canonicalEncrypted(envelope).includes(text),false);
  assert.equal((await receiver.preview(envelope,c)).text,text);
  assert.equal((await receiver.preview(envelope,c)).text,text);
  assert.equal((await receiver.acceptDelivered(envelope,c,digest)).text,text);
  await rejected(()=>receiver.acceptDelivered(envelope,c,digest));
  await rejected(()=>receiver.preview(envelope,c));
});
test('fresh messages use different nonces, wrapped keys and ciphertext',async()=>{
  const a=await sender.seal('Dezelfde proeftekst',context()),b=await sender.seal('Dezelfde proeftekst',context());
  for(const key of ['iv','wrappedKey','ciphertext'])assert.notEqual(a[key],b[key]);
});
test('sender cannot seal the same message identifier twice',async()=>{
  const c=context();await sender.seal('Proef',c);await rejected(()=>sender.seal('Andere tekst',c));
});
for(const field of ['iv','wrappedKey','ciphertext','signature']){
  test('changed '+field+' is rejected without consuming the original',async()=>{
    const c=context(),e=await sender.seal('Ongewijzigde tekst',c),changed=structuredClone(e);
    const bytes=decodeEncryptedBytes(changed[field]);bytes[0]^=1;changed[field]=encodeEncryptedBytes(bytes);
    await rejected(()=>receiver.preview(changed,c));
    assert.equal((await receiver.preview(e,c)).text,'Ongewijzigde tekst');
  });
}
for(const field of ['channelId','messageId','senderId','receiverId','issuedAt','expiresAt']){
  test('changed expected '+field+' cannot decrypt a different contact contract',async()=>{
    const c=context(),e=await sender.seal('Contextvast',c),changed={...c};
    changed[field]=field.endsWith('At')?'2026-10-10T13:04:00.000Z':changed[field]+'-changed';
    await rejected(()=>receiver.preview(e,changed));
  });
}
for(const field of ['schemaVersion','classification','suite','senderPin','receiverPin']){
  test('changed authenticated header '+field+' is rejected',async()=>{
    const c=context(),e=await sender.seal('Kopvast',c),changed=structuredClone(e);
    changed.header[field]+='-changed';await rejected(()=>receiver.preview(changed,c));
  });
}
test('unknown envelope fields, malformed base64 and noncanonical trailing bits are rejected',async()=>{
  const c=context(),e=await sender.seal('Strikt',c);
  await rejected(()=>receiver.preview({...e,privateKey:'invented'},c));
  await rejected(()=>receiver.preview({...e,iv:e.iv+'='},c));
  assert.throws(()=>decodeEncryptedBytes('AB'),/ENCRYPTED_TRANSFER_NOT_ACCEPTED/);
});
test('untrusted delivered digest does not consume an otherwise valid envelope',async()=>{
  const c=context(),e=await sender.seal('Geen automatische ontvangst',c);
  await rejected(()=>receiver.acceptDelivered(e,c,'wrong-digest'));
  assert.equal((await receiver.preview(e,c)).text,'Geen automatische ontvangst');
});
test('empty, oversized and invalid Unicode plaintext are rejected',async()=>{
  for(const text of ['', ' ', 'x'.repeat(513),String.fromCharCode(0xd800)])await rejected(()=>sender.seal(text,context()));
});
test('future, expired and long-lived contexts are rejected',async()=>{
  for(const override of [{issuedAt:'2026-10-10T13:00:01.000Z'},{expiresAt:T},{expiresAt:'2026-10-10T14:00:00.000Z'}])
    await rejected(()=>sender.seal('Tijdvast',{...context(),...override}));
});
test('roles have no wrong-side decrypt/encrypt operation and export no private keys',async()=>{
  await rejected(()=>receiver.seal('Verkeerde rol',context()));
  const c=context(),e=await sender.seal('Rolvast',c);await rejected(()=>sender.preview(e,c));
  assert.deepEqual(Object.keys(sender).sort(),['acceptDelivered','close','connect','preview','publicIdentity','seal'].sort());
  assert.equal(canonicalEncrypted(sender.publicIdentity).includes('PRIVATE'),false);
});
test('endpoint creation requires explicit synthetic classification',async()=>{
  for(const classification of [undefined,'LIVE','PRODUCTION'])
    await rejected(()=>createEncryptedTestEndpoint({classification,role:'SENDER',id:'test-x'}));
});
test('peer identity requires an independently supplied pin and cannot be replaced after connection',async()=>{
  const isolated=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'test-isolated',now:()=>T});
  try{
    await rejected(()=>isolated.connect(receiver.publicIdentity,'wrong-pin',receiver.publicIdentity.id));
    await rejected(()=>isolated.connect({...receiver.publicIdentity,spki:sender.publicIdentity.spki},receiver.publicIdentity.pin,receiver.publicIdentity.id));
    assert.equal(await isolated.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id),true);
    await rejected(()=>isolated.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id));
  }finally{isolated.close();}
});
test('expiry and backward clocks fail after initial preview and closed endpoints cannot resume',async()=>{
  let time=T;
  const endpoint=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'RECEIVER',id:'test-clock',now:()=>time});
  const localSender=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'test-clock-sender',now:()=>T});
  try{
    await endpoint.connect(localSender.publicIdentity,localSender.publicIdentity.pin,localSender.publicIdentity.id);
    await localSender.connect(endpoint.publicIdentity,endpoint.publicIdentity.pin,endpoint.publicIdentity.id);
    const c={...context(),senderId:'test-clock-sender',receiverId:'test-clock'},e=await localSender.seal('Tijdproef',c);
    await endpoint.preview(e,c);time='2026-10-10T13:05:00.000Z';await rejected(()=>endpoint.preview(e,c));
    time=T;await rejected(()=>endpoint.preview(e,c));endpoint.close();await rejected(()=>endpoint.preview(e,c));
  }finally{endpoint.close();localSender.close();}
});

test('correct key pins cannot silently substitute the expected peer identity',async()=>{
  const isolated=await createEncryptedTestEndpoint({classification:'SYNTHETIC_ONLY',role:'SENDER',id:'identity-pin-test',now:()=>T});
  try{
    await rejected(()=>isolated.connect({...receiver.publicIdentity,id:'substituted-id'},receiver.publicIdentity.pin,receiver.publicIdentity.id));
    await rejected(()=>isolated.connect(receiver.publicIdentity,receiver.publicIdentity.pin));
    assert.equal(await isolated.connect(receiver.publicIdentity,receiver.publicIdentity.pin,receiver.publicIdentity.id),true);
  }finally{isolated.close();}
});
