import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openRioReferenceOutbox } from './reference-outbox.mjs';
import { makeRioOutboxFixture } from './test-support/rio-outbox-fixtures.mjs';

export function buildRioOutboxReferenceReport(sourceCommit) {
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error('EXACT_SOURCE_COMMIT_REQUIRED');
  }
  const scenarios = [];
  function scenario(name, run) {
    const directory = mkdtempSync(join(tmpdir(),'palaco-rio-outbox-demo-'));
    const databasePath = join(directory,'outbox.sqlite');
    const fixture = makeRioOutboxFixture();
    const handles = [];
    const open = extra => {
      const handle = openRioReferenceOutbox(fixture.options(databasePath,extra));
      handles.push(handle); return handle;
    };
    try {
      const outcomes = run({fixture,open,databasePath});
      const db = new DatabaseSync(databasePath);
      let counts;
      try {
        counts = {
          queuedOrHistoricalMessages: db.prepare('SELECT count(*) AS n FROM rio_messages').get().n,
          consumedChallenges: db.prepare('SELECT count(*) AS n FROM rio_challenges').get().n,
          localInboxMessages: db.prepare('SELECT count(*) AS n FROM rio_inbox').get().n
        };
      } finally { db.close(); }
      scenarios.push({name,outcomes,counts});
    } finally {
      for (const handle of handles) handle.close();
      rmSync(directory,{recursive:true,force:true});
    }
  }
  scenario('missing-final-consent',({fixture,open}) => {
    fixture.commitEvidence.input.finalReceipts.pop();
    const result = open().commit(fixture.message);
    assert.equal(result.status,'HOLD'); return [result];
  });
  scenario('restart-and-idempotent-local-delivery',({fixture,open}) => {
    const first = open(), queued = first.commit(fixture.message);
    assert.equal(queued.status,'QUEUED'); first.close();
    const second = open(), recovered = second.status(fixture.message.messageId);
    const delivered = second.deliver(fixture.message.messageId);
    const duplicate = second.deliver(fixture.message.messageId);
    assert.equal(recovered.status,'QUEUED'); assert.equal(delivered.status,'DELIVERED');
    assert.equal(duplicate.duplicate,true); return [queued,recovered,delivered,duplicate];
  });
  scenario('payload-substitution',({fixture,open}) => {
    const changed = {...fixture.message,opaquePayload:Buffer.from('SYNTHETIC_CHANGED').toString('base64url')};
    const result = open().commit(changed); assert.equal(result.status,'HOLD'); return [result];
  });
  scenario('revocation-survives-restart',({fixture,open}) => {
    const first = open(), queued = first.commit(fixture.message);
    const revoked = first.revoke(fixture.message.requestId); first.close();
    const result = open().deliver(fixture.message.messageId);
    assert.equal(result.status,'CLOSED'); return [queued,revoked,result];
  });
  scenario('commit-proof-is-not-delivery-proof',({fixture,open}) => {
    const outbox = open(), queued = outbox.commit(fixture.message);
    fixture.deliveryEvidence = fixture.commitEvidence;
    const result = outbox.deliver(fixture.message.messageId);
    assert.equal(result.status,'HOLD'); return [queued,result];
  });
  scenario('transaction-failure-rolls-back-and-retries',({fixture,open}) => {
    const failing = open({fault:point => {if(point === 'AFTER_OUTBOX') throw new Error('SYNTHETIC_FAULT');}});
    const held = failing.commit(fixture.message); assert.equal(held.status,'HOLD'); failing.close();
    const recovered = open().commit(fixture.message); assert.equal(recovered.status,'QUEUED');
    return [held,recovered];
  });
  scenario('request-expiry-closes-queue',({fixture,open}) => {
    const outbox = open(), queued = outbox.commit(fixture.message);
    fixture.now = fixture.commitEvidence.input.request.expiresAt;
    const expired = outbox.deliver(fixture.message.messageId);
    assert.equal(expired.status,'CLOSED'); return [queued,expired];
  });
  const report = {
    schemaVersion:'rio-outbox-report-reference/0.1', sourceCommit,
    classification:'SYNTHETIC_ONLY', mode:'REFERENCE_ONLY',
    storage:'FILE_BACKED_SQLITE_TEST_DATABASE', operativeAuthority:'NONE',
    canOpenContact:false, runtimeConnected:false, externalSideEffect:false,
    e2eeImplemented:false, remoteRecipientConnected:false, scenarios
  };
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('BEGIN PRIVATE KEY'));
  assert.ok(!serialized.includes('opaquePayload'));
  return report;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(JSON.stringify(buildRioOutboxReferenceReport(process.env.RIO_SOURCE_COMMIT),null,2)+'\n');
}
