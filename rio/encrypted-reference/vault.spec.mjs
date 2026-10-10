import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRioContactPreview } from '../contact-preview/server.mjs';

const CLASSIFICATION = 'SYNTHETIC_ONLY';
async function boot(page, role, { mode = 'ENROLL', pin, time } = {}) {
  return page.evaluate(async ({ role, mode, pin, time }) => {
    window.encryptedModule = await import('/assets/client.mjs');
    window.vaultModule = await import('/assets/key-vault.mjs');
    window.vaultRole = role;
    window.vaultNamespace = 'native-' + role.toLowerCase();
    window.vaultId = 'native-' + role.toLowerCase();
    window.vaultTime = time;
    window.vaultInjection = { target: null, count: 0 };
    const keyVault = await window.vaultModule.openRioTestKeyVault({
      classification: 'SYNTHETIC_ONLY', role, id: window.vaultId,
      namespace: window.vaultNamespace, mode,
      ...(pin ? { expectedOwnPin: pin } : {}),
      fault: () => {
        const injection = window.vaultInjection;
        injection.count++;
        return injection.target === injection.count ? 'ABORT' : undefined;
      }
    });
    window.endpoint = await window.encryptedModule.createEncryptedTestEndpoint({
      classification: 'SYNTHETIC_ONLY', role, id: window.vaultId,
      now: () => window.vaultTime, keyVault
    });
    return { identity: window.endpoint.publicIdentity, epoch: window.endpoint.keyEpoch };
  }, { role, mode, pin, time });
}
async function fixture(browser) {
  const dir = mkdtempSync(join(tmpdir(), 'rio-native-vault-'));
  const server = await startRioContactPreview({
    databasePath: join(dir, 'outbox.sqlite'), classification: CLASSIFICATION,
    payloadMode: 'OPAQUE_TRANSPORT'
  });
  const contexts = {}, pages = {}, identities = {}, epochs = {};
  const time = new Date().toISOString();
  try {
    for (const role of ['SENDER', 'RECEIVER']) {
      const context = await browser.newContext(); contexts[role] = context;
      await context.addCookies([{
        name: role === 'SENDER' ? 'rio_sender' : 'rio_receiver',
        value: server.credentials[role].sessionToken, url: server.origin,
        httpOnly: true, sameSite: 'Strict'
      }]);
      const page = await context.newPage(); pages[role] = page;
      await page.goto(role === 'SENDER' ? server.senderUrl : server.receiverUrl);
      const opened = await boot(page, role, { time });
      identities[role] = opened.identity; epochs[role] = opened.epoch;
    }
    for (const role of ['SENDER', 'RECEIVER']) {
      const peer = identities[role === 'SENDER' ? 'RECEIVER' : 'SENDER'];
      await pages[role].evaluate(peer => window.endpoint.connect(peer, peer.pin, peer.id), peer);
    }
  } catch (error) {
    for (const context of Object.values(contexts)) await context.close();
    await server.close(); rmSync(dir, { recursive: true, force: true }); throw error;
  }
  return {
    server, contexts, pages, identities, epochs, time,
    async extraPage(role) {
      const page = await contexts[role].newPage();
      await page.goto(role === 'SENDER' ? server.senderUrl : server.receiverUrl);
      const opened = await boot(page, role, { mode: 'RESUME', pin: identities[role].pin, time });
      expect(opened.identity).toEqual(identities[role]);
      return page;
    },
    async close() {
      for (const context of Object.values(contexts)) await context.close();
      await server.close(); rmSync(dir, { recursive: true, force: true });
    }
  };
}
function messageContext(f, messageId = 'message-' + crypto.randomUUID(), offset = 0) {
  const issuedAt = new Date(Date.parse(f.time) + offset);
  return {
    channelId: 'native-vault-channel', messageId,
    senderId: f.identities.SENDER.id, receiverId: f.identities.RECEIVER.id,
    issuedAt: issuedAt.toISOString(), expiresAt: new Date(+issuedAt + 300_000).toISOString()
  };
}
async function seal(page, context, text = 'Kunstmatige duurzame proeftekst') {
  return page.evaluate(({ context, text }) => window.endpoint.seal(text, context), { context, text });
}
async function consume(page, envelope, context) {
  return page.evaluate(async ({ envelope, context }) => window.endpoint.acceptDelivered(
    envelope, context, await window.encryptedModule.encryptedEnvelopeDigest(envelope)
  ), { envelope, context });
}
async function preview(page, envelope, context) {
  return page.evaluate(({ envelope, context }) => window.endpoint.preview(envelope, context), { envelope, context });
}
async function inject(page, target) {
  await page.evaluate(target => { window.vaultInjection = { target, count: 0 }; }, target);
}
// Real IndexedDB transactions; no key objects or private material leave the browser.
async function nativeState(page, operation = 'READ', options = {}) {
  return page.evaluate(async ({ operation, options }) => {
    const name = 'rio-test-vault-' + window.vaultNamespace;
    let replacementKey;
    if (operation === 'CORRUPT') {
      const role = window.vaultRole;
      const generated = await crypto.subtle.generateKey(role === 'SENDER'
        ? { name: 'ECDSA', namedCurve: 'P-256' }
        : { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        options.kind === 'EXTRACTABLE', role === 'SENDER' ? ['sign', 'verify'] : ['encrypt', 'decrypt']);
      replacementKey = generated.privateKey;
    }
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('NATIVE_STORAGE_FAILURE'));
    });
    return new Promise((resolve, reject) => {
      const write = operation !== 'READ';
      const tx = database.transaction('state', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('state'), request = store.get('endpoint');
      let summary;
      request.onsuccess = () => {
        const record = request.result;
        if (!record) { summary = null; return; }
        if (operation === 'CORRUPT') record.keys.privateKey = replacementKey;
        if (operation === 'FILL') {
          if (options.side === 'SENDER') record.sent = Array.from({ length: 128 }, (_, i) => ({
            id: 'reserved-' + i, token: 'reservation-' + i, epoch: record.epoch, done: true
          }));
          else record.received = Array.from({ length: 128 }, (_, i) => 'received-' + i);
        }
        if (write) store.put(record, 'endpoint');
        summary = {
          pin: record.publicIdentity.pin, epoch: record.epoch, status: record.status,
          peerPin: record.peer?.pin || null, revision: record.revision,
          maxClock: record.maxClock, sent: record.sent.map(x => ({ id: x.id, done: x.done })),
          received: [...record.received], retiredPins: [...record.retiredPins],
          privatePresent: !!record.keys?.privateKey,
          privateExtractable: record.keys?.privateKey?.extractable ?? null
        };
      };
      tx.oncomplete = () => { database.close(); resolve(summary); };
      tx.onabort = tx.onerror = () => { database.close(); reject(new Error('NATIVE_STORAGE_FAILURE')); };
    });
  }, { operation, options });
}
async function resume(f, role, { mode = 'RESUME', pin = f.identities[role].pin, time = f.time } = {}) {
  const page = f.pages[role];
  await page.reload();
  return boot(page, role, { mode, pin, time });
}

test('native keys and both replay ledgers survive reload with the same pinned identities', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const first = messageContext(f, 'reload-consumed'), second = messageContext(f, 'reload-waiting');
    const consumed = await seal(f.pages.SENDER, first);
    expect((await consume(f.pages.RECEIVER, consumed, first)).text).toBe('Kunstmatige duurzame proeftekst');
    const waiting = await seal(f.pages.SENDER, second, 'Na herladen leesbaar');
    for (const role of ['SENDER', 'RECEIVER']) {
      const restored = await resume(f, role);
      expect(restored.identity).toEqual(f.identities[role]);
      expect(restored.epoch).toBe(f.epochs[role]);
      const summary = await nativeState(f.pages[role]);
      expect(summary.privatePresent).toBe(true); expect(summary.privateExtractable).toBe(false);
    }
    expect((await consume(f.pages.RECEIVER, waiting, second)).text).toBe('Na herladen leesbaar');
    await expect(consume(f.pages.RECEIVER, consumed, first)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    await expect(seal(f.pages.SENDER, first)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect((await nativeState(f.pages.SENDER)).sent.map(x => x.id)).toEqual(['reload-consumed', 'reload-waiting']);
    expect((await nativeState(f.pages.RECEIVER)).received).toEqual(['reload-consumed', 'reload-waiting']);
  } finally { await f.close(); }
});

test('two pages sharing a sender vault release exactly one envelope for a message ID', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const second = await f.extraPage('SENDER'), context = messageContext(f, 'racing-send');
    const results = await Promise.allSettled([seal(f.pages.SENDER, context), seal(second, context)]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
    expect((await nativeState(f.pages.SENDER)).sent).toEqual([{ id: context.messageId, done: true }]);
    const envelope = results.find(x => x.status === 'fulfilled').value;
    expect((await consume(f.pages.RECEIVER, envelope, context)).text).toBe('Kunstmatige duurzame proeftekst');
  } finally { await f.close(); }
});

test('two receiver pages transactionally consume a delivered envelope at most once', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const second = await f.extraPage('RECEIVER'), context = messageContext(f, 'racing-receive');
    const envelope = await seal(f.pages.SENDER, context);
    const results = await Promise.allSettled([
      consume(f.pages.RECEIVER, envelope, context), consume(second, envelope, context)
    ]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
    expect((await nativeState(f.pages.RECEIVER)).received).toEqual([context.messageId]);
    await expect(preview(second, envelope, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
  } finally { await f.close(); }
});

test('durable revocation invalidates other open handles; replacement requires a fresh pair and keeps replay history', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const oldSender = await f.extraPage('SENDER'), oldReceiver = await f.extraPage('RECEIVER');
    const usedContext = messageContext(f, 'before-replace-used'), oldContext = messageContext(f, 'before-replace-unread');
    const used = await seal(f.pages.SENDER, usedContext);
    await consume(f.pages.RECEIVER, used, usedContext);
    const oldEnvelope = await seal(f.pages.SENDER, oldContext);
    for (const role of ['SENDER', 'RECEIVER']) {
      expect(await f.pages[role].evaluate(() => window.endpoint.revoke())).toBe(true);
      const revoked = await nativeState(f.pages[role]);
      expect(revoked.status).toBe('REVOKED'); expect(revoked.privatePresent).toBe(false);
    }
    await expect(seal(oldSender, messageContext(f, 'revoked-handle-send'))).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    await expect(preview(oldReceiver, oldEnvelope, oldContext)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    const changed = {};
    for (const role of ['SENDER', 'RECEIVER']) {
      changed[role] = await resume(f, role, { mode: 'REPLACE' });
      expect(changed[role].identity.pin).not.toBe(f.identities[role].pin);
      expect(changed[role].epoch).not.toBe(f.epochs[role]);
      const summary = await nativeState(f.pages[role]);
      expect(summary.peerPin).toBeNull(); expect(summary.retiredPins).toEqual([f.identities[role].pin]);
    }
    await expect(seal(f.pages.SENDER, messageContext(f, 'unpaired-new-epoch'))).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    for (const role of ['SENDER', 'RECEIVER']) {
      const peer = changed[role === 'SENDER' ? 'RECEIVER' : 'SENDER'].identity;
      expect(await f.pages[role].evaluate(peer => window.endpoint.connect(peer, peer.pin, peer.id), peer)).toBe(true);
    }
    await expect(seal(f.pages.SENDER, usedContext)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    await expect(preview(oldReceiver, oldEnvelope, oldContext)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect((await nativeState(f.pages.RECEIVER)).received).toEqual([usedContext.messageId]);
    const fresh = messageContext(f, 'new-epoch-message');
    expect((await consume(f.pages.RECEIVER, await seal(f.pages.SENDER, fresh), fresh)).text).toBe('Kunstmatige duurzame proeftekst');
  } finally { await f.close(); }
});

test('restored peer pin is immutable and connecting the same peer is idempotent', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    await resume(f, 'SENDER');
    const original = f.identities.RECEIVER, before = await nativeState(f.pages.SENDER);
    expect(await f.pages.SENDER.evaluate(peer => window.endpoint.connect(peer, peer.pin, peer.id), original)).toBe(true);
    const changedPeer = await f.pages.RECEIVER.evaluate(async () => {
      const endpoint = await window.encryptedModule.createEncryptedTestEndpoint({
        classification: 'SYNTHETIC_ONLY', role: 'RECEIVER', id: 'changed-peer'
      });
      const identity = endpoint.publicIdentity; endpoint.close(); return identity;
    });
    await expect(f.pages.SENDER.evaluate(peer => window.endpoint.connect(peer, peer.pin, peer.id), changedPeer))
      .rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect(await nativeState(f.pages.SENDER)).toEqual(before);
  } finally { await f.close(); }
});

for (const invalid of ['WRONG_PIN', 'ACTIVE_REPLACE', 'EXISTING_ENROLL', 'CLASSIFICATION']) {
  test('invalid vault opening preserves existing enrollment: ' + invalid, async ({ browser }) => {
    const f = await fixture(browser);
    try {
      const page = f.pages.SENDER, before = await nativeState(page);
      await page.evaluate(() => window.endpoint.close());
      if (invalid === 'CLASSIFICATION') {
        await expect(page.evaluate(() => window.vaultModule.openRioTestKeyVault({
          classification: 'REAL', role: 'SENDER', id: window.vaultId,
          namespace: window.vaultNamespace, mode: 'RESUME', expectedOwnPin: 'A'.repeat(43)
        }))).rejects.toThrow('KEY_VAULT_NOT_ACCEPTED');
      } else {
        await expect(boot(page, 'SENDER', {
          mode: invalid === 'ACTIVE_REPLACE' ? 'REPLACE' : invalid === 'EXISTING_ENROLL' ? 'ENROLL' : 'RESUME',
          ...(invalid !== 'EXISTING_ENROLL' ? { pin: invalid === 'WRONG_PIN' ? (f.identities.SENDER.pin[0] === 'A' ? 'B' : 'A') + f.identities.SENDER.pin.slice(1) : f.identities.SENDER.pin } : {}),
          time: f.time
        })).rejects.toThrow(/NOT_ACCEPTED/);
      }
      expect(await nativeState(page)).toEqual(before);
      const restored = await boot(page, 'SENDER', { mode: 'RESUME', pin: f.identities.SENDER.pin, time: f.time });
      expect(restored.identity).toEqual(f.identities.SENDER);
    } finally { await f.close(); }
  });
}

test('resume after storage loss fails closed and creates no replacement keys', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const page = f.pages.SENDER;
    await page.evaluate(async () => {
      window.endpoint.close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('rio-test-vault-' + window.vaultNamespace);
        request.onsuccess = resolve; request.onerror = () => reject(new Error('DELETE_FAILED'));
        request.onblocked = () => reject(new Error('DELETE_BLOCKED'));
      });
    });
    await expect(boot(page, 'SENDER', { mode: 'RESUME', pin: f.identities.SENDER.pin, time: f.time }))
      .rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect(await nativeState(page)).toBeNull();
  } finally { await f.close(); }
});

for (const role of ['SENDER', 'RECEIVER']) {
  for (const kind of ['EXTRACTABLE', 'MISMATCHED']) {
    test('native restored private key is rejected: ' + role + ' ' + kind, async ({ browser }) => {
      const f = await fixture(browser);
      try {
        const page = f.pages[role];
        await page.evaluate(() => window.endpoint.close());
        const corrupt = await nativeState(page, 'CORRUPT', { kind });
        expect(corrupt.privateExtractable).toBe(kind === 'EXTRACTABLE');
        await expect(boot(page, role, { mode: 'RESUME', pin: f.identities[role].pin, time: f.time }))
          .rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
        expect((await nativeState(page)).pin).toBe(f.identities[role].pin);
        expect((await nativeState(page)).epoch).toBe(f.epochs[role]);
      } finally { await f.close(); }
    });
  }
}

test('aborted native enrollment leaves no endpoint record and releases no identity', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const outcome = await f.pages.SENDER.evaluate(async () => {
      const vault = await window.vaultModule.openRioTestKeyVault({
        classification: 'SYNTHETIC_ONLY', role: 'SENDER', id: 'aborted-enroll',
        namespace: 'aborted-enroll', mode: 'ENROLL', fault: () => 'ABORT'
      });
      try {
        await window.encryptedModule.createEncryptedTestEndpoint({
          classification: 'SYNTHETIC_ONLY', role: 'SENDER', id: 'aborted-enroll', keyVault: vault
        });
        return 'RELEASED';
      } catch { return 'REJECTED'; }
    });
    expect(outcome).toBe('REJECTED');
    const recordAbsent = await f.pages.SENDER.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('rio-test-vault-aborted-enroll', 1);
        request.onsuccess = () => resolve(request.result); request.onerror = reject;
      });
      return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readonly'), get = tx.objectStore('state').get('endpoint');
        let absent = false; get.onsuccess = () => { absent = get.result === undefined; };
        tx.oncomplete = () => { db.close(); resolve(absent); };
        tx.onerror = tx.onabort = () => { db.close(); reject(new Error('NATIVE_STORAGE_FAILURE')); };
      });
    });
    expect(recordAbsent).toBe(true);
  } finally { await f.close(); }
});

test('aborted sender reservation releases no ciphertext and leaves no partial reservation', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const page = f.pages.SENDER, context = messageContext(f, 'aborted-reservation'), before = await nativeState(page);
    await inject(page, 1);
    await expect(seal(page, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect(await nativeState(page)).toEqual(before);
    await inject(page, null);
    expect((await consume(f.pages.RECEIVER, await seal(page, context), context)).text).toBe('Kunstmatige duurzame proeftekst');
  } finally { await f.close(); }
});

test('aborted sender completion releases no envelope and permanently burns its prior reservation', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const page = f.pages.SENDER, context = messageContext(f, 'aborted-completion');
    await inject(page, 2);
    await expect(seal(page, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect((await nativeState(page)).sent).toEqual([{ id: context.messageId, done: false }]);
    await inject(page, null);
    await expect(seal(page, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    await resume(f, 'SENDER');
    await expect(seal(page, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    const next = messageContext(f, 'after-aborted-completion');
    expect((await consume(f.pages.RECEIVER, await seal(page, next), next)).text).toBe('Kunstmatige duurzame proeftekst');
  } finally { await f.close(); }
});

for (const target of [1, 2]) {
  test('aborted receiver transaction releases no plaintext and records no consumed ID: write ' + target, async ({ browser }) => {
    const f = await fixture(browser);
    try {
      const page = f.pages.RECEIVER, context = messageContext(f, 'aborted-consume-' + target);
      const envelope = await seal(f.pages.SENDER, context);
      await inject(page, target);
      await expect(consume(page, envelope, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
      expect((await nativeState(page)).received).toEqual([]);
      await inject(page, null);
      expect((await consume(page, envelope, context)).text).toBe('Kunstmatige duurzame proeftekst');
      await expect(consume(page, envelope, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    } finally { await f.close(); }
  });
}

test('persisted maximum clock rejects rollback after endpoint reload', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    await seal(f.pages.SENDER, messageContext(f, 'before-clock-rollback'));
    const before = await nativeState(f.pages.SENDER);
    expect(before.maxClock).toBe(Date.parse(f.time));
    const rollback = new Date(Date.parse(f.time) - 1).toISOString();
    await resume(f, 'SENDER', { time: rollback });
    await expect(seal(f.pages.SENDER, messageContext(f, 'rolled-back-send', -1)))
      .rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
    expect(await nativeState(f.pages.SENDER)).toEqual(before);
  } finally { await f.close(); }
});

for (const role of ['SENDER', 'RECEIVER']) {
  test('native persisted 128-message bound cannot be reset by reload: ' + role, async ({ browser }) => {
    const f = await fixture(browser);
    try {
      const context = messageContext(f, 'over-limit'), envelope = await seal(f.pages.SENDER, context);
      const page = f.pages[role]; await page.evaluate(() => window.endpoint.close());
      await nativeState(page, 'FILL', { side: role });
      await resume(f, role);
      if (role === 'SENDER') {
        await expect(seal(page, messageContext(f, 'over-sender-limit'))).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
        expect((await nativeState(page)).sent).toHaveLength(128);
      } else {
        expect((await preview(page, envelope, context)).text).toBe('Kunstmatige duurzame proeftekst');
        await expect(consume(page, envelope, context)).rejects.toThrow('ENCRYPTED_TRANSFER_NOT_ACCEPTED');
        expect((await nativeState(page)).received).toHaveLength(128);
      }
    } finally { await f.close(); }
  });
}

for(const role of ['SENDER','RECEIVER']){
  test('revocation during asynchronous crypto prevents final release: '+role,async({browser})=>{
    const f=await fixture(browser);
    try{
      const other=await f.extraPage(role),page=f.pages[role],context=messageContext(f,'mid-crypto-'+role.toLowerCase());
      const envelope=role==='RECEIVER'?await seal(f.pages.SENDER,context):null;
      await page.evaluate(role=>{
        const method=role==='SENDER'?'encrypt':'decrypt',original=crypto.subtle[method].bind(crypto.subtle);
        window.cryptoPaused=false;
        crypto.subtle[method]=async(...args)=>{
          const result=await original(...args);
          if(args[0]?.name==='AES-GCM'){
            window.cryptoPaused=true;
            await new Promise(resolve=>{window.releaseCrypto=resolve;});
          }
          return result;
        };
      },role);
      const pending=(role==='SENDER'?seal(page,context):consume(page,envelope,context))
        .then(()=> 'RELEASED',()=> 'REJECTED');
      await expect.poll(()=>page.evaluate(()=>window.cryptoPaused)).toBe(true);
      expect(await other.evaluate(()=>window.endpoint.revoke())).toBe(true);
      await page.evaluate(()=>window.releaseCrypto());
      expect(await pending).toBe('REJECTED');
      const stored=await nativeState(page);expect(stored.status).toBe('REVOKED');
      if(role==='SENDER')expect(stored.sent).toEqual([{id:context.messageId,done:false}]);
      else expect(stored.received).toEqual([]);
    }finally{await f.close();}
  });
}
