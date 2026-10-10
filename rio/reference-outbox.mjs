import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, openSync, closeSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createBrigadeReferenceGate, referenceContractDigest } from './brigade-evidence.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_MESSAGES = 128, MAX_RIGHTS = 256, MAX_ATTEMPTS = 3, RETRY_MS = 1000;
const MESSAGE_KEYS = ['schemaVersion','classification','requestId','messageId','idempotencyKey','opaquePayload'];
const hash = value => createHash('sha256').update(value).digest('hex');
const token = value => typeof value === 'string' && ID.test(value);
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  throw new Error('NON_JSON');
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function stamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}
function messageValid(message) {
  if (!exact(message,MESSAGE_KEYS) || message.schemaVersion !== 'rio-opaque-message-reference/0.1'
      || message.classification !== 'SYNTHETIC_ONLY'
      || !['requestId','messageId','idempotencyKey'].every(key => token(message[key]))
      || typeof message.opaquePayload !== 'string' || message.opaquePayload.length > 5462
      || !/^[A-Za-z0-9_-]+$/.test(message.opaquePayload)) return false;
  const bytes = Buffer.from(message.opaquePayload,'base64url');
  return bytes.length >= 1 && bytes.length <= 4096 && bytes.toString('base64url') === message.opaquePayload;
}
function bindingMatches(request, message) {
  const binding = request?.transferBinding;
  const bytes = Buffer.from(message.opaquePayload,'base64url');
  return request?.schemaVersion === '6ri9ade-transfer-reference/0.2' && request.id === message.requestId
    && exact(binding,['messageId','payloadDigest','payloadByteLength','payloadEncoding','idempotencyKey'])
    && binding.messageId === message.messageId && binding.idempotencyKey === message.idempotencyKey
    && binding.payloadEncoding === 'base64url' && binding.payloadByteLength === bytes.length
    && binding.payloadDigest === hash(bytes);
}
function sameTransfer(original, current) {
  const immutable = request => Object.fromEntries(Object.entries(request)
    .filter(([key]) => !['challengeId','issuedAt','expiresAt'].includes(key)));
  return canonical(immutable(original)) === canonical(immutable(current))
    && current.challengeId !== original.challengeId
    && stamp(current.issuedAt) >= stamp(original.issuedAt)
    && stamp(current.expiresAt) <= stamp(original.expiresAt);
}
function projection(status, messageId = null, { duplicate=false, databaseMutated=false } = {}) {
  return freeze({
    schemaVersion:'rio-outbox-result-reference/0.1', mode:'REFERENCE_ONLY', classification:'SYNTHETIC_ONLY',
    status, messageId, duplicate, databaseMutated,
    canOpenContact:false, operativeAuthority:'NONE', runtimeConnected:false, externalSideEffect:false
  });
}

/**
 * File-backed, synchronous, bounded SYNTHETIC_ONLY reference outbox.
 * Trusted host owns databasePath, evidence loaders and clock. There is no
 * network sink, live account resolver, crypto transport, or activation path.
 */
export function openRioReferenceOutbox({
  databasePath, classification, design, loadEvidence = () => undefined,
  now = () => new Date().toISOString(), fault = () => undefined
} = {}) {
  if (classification !== 'SYNTHETIC_ONLY' || typeof databasePath !== 'string'
      || !isAbsolute(databasePath) || databasePath.includes('\0')
      || typeof loadEvidence !== 'function' || typeof now !== 'function' || typeof fault !== 'function') {
    throw new TypeError('EXPLICIT_SYNTHETIC_TRUSTED_HOST_REQUIRED');
  }
  // The parent directory must already exist and belong to the trusted host.
  if (existsSync(databasePath)) {
    const info = lstatSync(databasePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new TypeError('REGULAR_DATABASE_FILE_REQUIRED');
  } else {
    const descriptor = openSync(databasePath,'wx',0o600); closeSync(descriptor);
  }
  const db = new DatabaseSync(databasePath,{timeout:0,allowExtension:false});
  let closed = false, busy = false, lastClock = -Infinity;
  function readNow() {
    const value = now(), time = stamp(value);
    if (!Number.isFinite(time) || time < lastClock) throw new Error('INVALID_OR_BACKWARD_HOST_CLOCK');
    lastClock = time; return value;
  }
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (![0,1].includes(version)) throw new Error('UNSUPPORTED_REFERENCE_DATABASE');
    if (version === 0 && db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().length !== 0) {
      throw new Error('UNCLASSIFIED_EXISTING_DATABASE');
    }
    if (version === 1) {
      const existing = db.prepare('SELECT * FROM rio_meta WHERE id=1').get();
      if (existing?.classification !== 'SYNTHETIC_ONLY' || existing?.schema_version !== 'rio-outbox-reference/0.1') {
        throw new Error('DATABASE_CLASSIFICATION_MISMATCH');
      }
    }
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
    db.exec('BEGIN IMMEDIATE');
    db.exec(
      'CREATE TABLE IF NOT EXISTS rio_meta (id INTEGER PRIMARY KEY CHECK(id=1), classification TEXT NOT NULL, schema_version TEXT NOT NULL) STRICT;'+
      'CREATE TABLE IF NOT EXISTS rio_messages ('+
      'message_id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, idempotency_key TEXT NOT NULL UNIQUE,'+
      'message_json TEXT NOT NULL, fingerprint TEXT NOT NULL, request_json TEXT NOT NULL, contract_digest TEXT NOT NULL,'+
      'expires_ms INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN (\'QUEUED\',\'CLOSED\',\'DELIVERED\')),'+
      'attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 3), retry_at INTEGER NOT NULL, commit_challenge TEXT NOT NULL UNIQUE) STRICT;'+
      'CREATE TABLE IF NOT EXISTS rio_challenges (challenge_id TEXT PRIMARY KEY,checkpoint TEXT NOT NULL,message_id TEXT NOT NULL REFERENCES rio_messages(message_id) DEFERRABLE INITIALLY DEFERRED) STRICT;'+
      'CREATE TABLE IF NOT EXISTS rio_rights (request_id TEXT PRIMARY KEY,revoked INTEGER NOT NULL CHECK(revoked=1)) STRICT;'+
      'CREATE TABLE IF NOT EXISTS rio_inbox (message_id TEXT PRIMARY KEY REFERENCES rio_messages(message_id),request_id TEXT NOT NULL,payload_digest TEXT NOT NULL,opaque_payload TEXT NOT NULL,delivered_at TEXT NOT NULL) STRICT;'+
      'CREATE TABLE IF NOT EXISTS rio_audit (message_id TEXT NOT NULL REFERENCES rio_messages(message_id),checkpoint TEXT NOT NULL,record_digest TEXT NOT NULL,PRIMARY KEY(message_id,checkpoint)) STRICT;'
    );
    const meta = db.prepare('SELECT * FROM rio_meta WHERE id=1').get();
    if (meta && (meta.classification !== 'SYNTHETIC_ONLY' || meta.schema_version !== 'rio-outbox-reference/0.1')) {
      throw new Error('DATABASE_CLASSIFICATION_MISMATCH');
    }
    if (!meta) db.prepare('INSERT INTO rio_meta VALUES(1,?,?)').run('SYNTHETIC_ONLY','rio-outbox-reference/0.1');
    db.exec('PRAGMA user_version=1; COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close(); throw error;
  }
  function inject(point) {
    const response = fault(point);
    if (response && typeof response.then === 'function') throw new Error('SYNC_FAULT_REQUIRED');
  }
  function row(id) { return db.prepare('SELECT * FROM rio_messages WHERE message_id=?').get(id); }
  function revoked(id) { return !!db.prepare('SELECT 1 FROM rio_rights WHERE request_id=?').get(id); }
  function consumed(id) { return !!db.prepare('SELECT 1 FROM rio_challenges WHERE challenge_id=?').get(id); }
  function transact(messageId, work) {
    if (closed || busy) return projection('HOLD',messageId);
    busy = true;
    try {
      db.exec('BEGIN IMMEDIATE');
      const outcome = work();
      if (outcome.persist) {
        inject('BEFORE_COMMIT');
        if (outcome.finalCheck && !outcome.finalCheck()) throw new Error('FINAL_CHECK_FAILED');
        db.exec('COMMIT');
      }
      else db.exec('ROLLBACK');
      return projection(outcome.status,messageId,{
        duplicate:!!outcome.duplicate, databaseMutated:!!outcome.persist
      });
    } catch {
      try { db.exec('ROLLBACK'); } catch {}
      return projection('HOLD',messageId);
    } finally { busy = false; }
  }
  function evaluate(checkpoint, message, original = null) {
    let firstBundle;
    // Re-load host evidence on every trusted snapshot read. Never trust a gate
    // result, public key, or eligibility boolean supplied with message JSON.
    const gate = createBrigadeReferenceGate({
      design, now:readNow,
      loadSnapshot: () => {
        const raw = loadEvidence(checkpoint,freeze(structuredClone(message)));
        if (!exact(raw,['input','snapshot'])) throw new Error('SYNC_EVIDENCE_BUNDLE_REQUIRED');
        const bundle = JSON.parse(canonical(raw));
        if (!firstBundle) firstBundle = bundle;
        if (canonical(bundle.input) !== canonical(firstBundle.input)
            || canonical(bundle.snapshot) !== canonical(firstBundle.snapshot)) throw new Error('EVIDENCE_CHANGED');
        return bundle.snapshot;
      }
    });
    // Initial load selects the signed input; subsequent gate reads revalidate
    // its immutable identity and current trust snapshot.
    const raw = loadEvidence(checkpoint,freeze(structuredClone(message)));
    if (!exact(raw,['input','snapshot'])) return {status:'HOLD'};
    firstBundle = JSON.parse(canonical(raw));
    const request = firstBundle.input?.request;
    if (!bindingMatches(request,message) || firstBundle.snapshot?.checkpoint !== checkpoint
        || (original && !sameTransfer(original,request))) return {status:'HOLD'};
    const result = gate.evaluate(firstBundle.input);
    if (result.contactEligibility === 'STOP') return {status:'CLOSED'};
    if (result.contactEligibility !== 'REFERENCE_GATE_SATISFIED' || result.checkpoint !== checkpoint
        || result.classification !== 'SYNTHETIC_ONLY' || result.canOpenContact !== false
        || result.contractDigest !== referenceContractDigest(request)) return {status:'HOLD'};
    return {status:'PASS',request,result,trustDigest:hash(canonical(firstBundle.snapshot))};
  }
  function current(message, checkpoint, first, original = null) {
    const second = evaluate(checkpoint,message,original);
    const finalTime = stamp(readNow());
    return second.status === 'PASS'
      && referenceContractDigest(second.request) === referenceContractDigest(first.request)
      && second.result.evidenceSetDigest === first.result.evidenceSetDigest
      && second.trustDigest === first.trustDigest
      && stamp(second.result.evaluatedAt) >= stamp(first.result.evaluatedAt)
      && finalTime < stamp(second.result.validUntil)
      && (!original || finalTime < stamp(original.expiresAt));
  }
  function commit(input) {
    let message;
    try {
      message = JSON.parse(canonical(input));
      if (!messageValid(message)) return projection('HOLD');
    } catch { return projection('HOLD'); }
    return transact(message.messageId,() => {
      const fingerprint = hash(canonical(message));
      const matches = db.prepare('SELECT * FROM rio_messages WHERE message_id=? OR request_id=? OR idempotency_key=?')
        .all(message.messageId,message.requestId,message.idempotencyKey);
      if (matches.length) {
        const same = matches.length === 1 && matches[0].fingerprint === fingerprint
          && matches[0].message_id === message.messageId && matches[0].request_id === message.requestId
          && matches[0].idempotency_key === message.idempotencyKey;
        return {status:same ? matches[0].state : 'CLOSED',duplicate:same};
      }
      if (revoked(message.requestId)) return {status:'CLOSED'};
      if (db.prepare('SELECT count(*) AS n FROM rio_messages').get().n >= MAX_MESSAGES) return {status:'HOLD'};
      const check = evaluate('SERVICE_COMMIT',message);
      if (check.status !== 'PASS') return {status:check.status};
      if (consumed(check.request.challengeId)) return {status:'CLOSED'};
      db.prepare('INSERT INTO rio_challenges VALUES(?,?,?)').run(check.request.challengeId,'SERVICE_COMMIT',message.messageId);
      inject('AFTER_CHALLENGE');
      db.prepare('INSERT INTO rio_messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
        message.messageId,message.requestId,message.idempotencyKey,canonical(message),fingerprint,
        canonical(check.request),referenceContractDigest(check.request),stamp(check.request.expiresAt),
        'QUEUED',0,0,check.request.challengeId);
      db.prepare('INSERT INTO rio_audit VALUES(?,?,?)').run(message.messageId,'SERVICE_COMMIT',
        hash(canonical({contractDigest:check.result.contractDigest,evidenceSetDigest:check.result.evidenceSetDigest})));
      inject('AFTER_OUTBOX');
      return {status:'QUEUED',persist:true,
        finalCheck:() => !revoked(message.requestId) && current(message,'SERVICE_COMMIT',check)};
    });
  }
  function deliver(messageId) {
    if (!token(messageId)) return projection('HOLD');
    return transact(messageId,() => {
      const stored = row(messageId);
      if (!stored) return {status:'NOT_FOUND'};
      if (stored.state !== 'QUEUED') return {status:stored.state,duplicate:stored.state === 'DELIVERED'};
      const time = stamp(readNow());
      if (!Number.isFinite(time)) return {status:'HOLD'};
      if (revoked(stored.request_id) || time >= stored.expires_ms) {
        db.prepare('UPDATE rio_messages SET state=\'CLOSED\' WHERE message_id=?').run(messageId);
        return {status:'CLOSED',persist:true};
      }
      if (time < stored.retry_at) return {status:'HOLD'};
      let message, original;
      try {
        message = JSON.parse(stored.message_json); original = JSON.parse(stored.request_json);
        if (!messageValid(message) || message.messageId !== messageId
            || message.requestId !== stored.request_id || message.idempotencyKey !== stored.idempotency_key
            || hash(canonical(message)) !== stored.fingerprint || !bindingMatches(original,message)
            || referenceContractDigest(original) !== stored.contract_digest
            || stamp(original.expiresAt) !== stored.expires_ms) throw new Error('STORED_TRANSFER_CHANGED');
      } catch {
        db.prepare('UPDATE rio_messages SET state=\'CLOSED\' WHERE message_id=?').run(messageId);
        return {status:'CLOSED',persist:true};
      }
      let check;
      try { check = evaluate('QUEUED_DELIVERY',message,original); }
      catch { check = {status:'HOLD'}; }
      if (check.status === 'CLOSED') {
        db.prepare('UPDATE rio_messages SET state=\'CLOSED\' WHERE message_id=?').run(messageId);
        return {status:'CLOSED',persist:true};
      }
      if (check.status !== 'PASS') {
        const attempts = stored.attempts + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'CLOSED' : 'HOLD';
        db.prepare('UPDATE rio_messages SET attempts=?,retry_at=?,state=? WHERE message_id=?')
          .run(attempts,time+RETRY_MS,status === 'CLOSED' ? 'CLOSED' : 'QUEUED',messageId);
        return {status,persist:true};
      }
      if (consumed(check.request.challengeId)) {
        db.prepare('UPDATE rio_messages SET state=\'CLOSED\' WHERE message_id=?').run(messageId);
        return {status:'CLOSED',persist:true};
      }
      db.prepare('INSERT INTO rio_challenges VALUES(?,?,?)').run(check.request.challengeId,'QUEUED_DELIVERY',messageId);
      inject('AFTER_CHALLENGE');
      const payloadDigest = hash(Buffer.from(message.opaquePayload,'base64url'));
      db.prepare('INSERT INTO rio_inbox VALUES(?,?,?,?,?)')
        .run(messageId,message.requestId,payloadDigest,message.opaquePayload,readNow());
      db.prepare('UPDATE rio_messages SET state=\'DELIVERED\',attempts=attempts+1 WHERE message_id=?').run(messageId);
      db.prepare('INSERT INTO rio_audit VALUES(?,?,?)').run(messageId,'QUEUED_DELIVERY',
        hash(canonical({contractDigest:check.result.contractDigest,evidenceSetDigest:check.result.evidenceSetDigest})));
      inject('AFTER_INBOX');
      return {status:'DELIVERED',persist:true,
        finalCheck:() => !revoked(message.requestId) && current(message,'QUEUED_DELIVERY',check,original)};
    });
  }
  function revoke(requestId) {
    if (!token(requestId)) return projection('HOLD');
    return transact(null,() => {
      if (!revoked(requestId)) {
        if (db.prepare('SELECT count(*) AS n FROM rio_rights').get().n >= MAX_RIGHTS) return {status:'HOLD'};
        db.prepare('INSERT INTO rio_rights VALUES(?,1)').run(requestId);
      }
      db.prepare('UPDATE rio_messages SET state=\'CLOSED\' WHERE request_id=? AND state=\'QUEUED\'').run(requestId);
      return {status:'CLOSED',persist:true};
    });
  }
  function status(messageId) {
    if (closed || busy || !token(messageId)) return projection('HOLD');
    try { const stored = row(messageId); return projection(stored?.state ?? 'NOT_FOUND',messageId); }
    catch { return projection('HOLD',messageId); }
  }
  function inbox(messageId) {
    // Explicit trusted-host-only local inbox inspection; never a public route.
    if (closed || busy || !token(messageId)) return null;
    try {
      const stored = row(messageId);
      const item = db.prepare('SELECT * FROM rio_inbox WHERE message_id=?').get(messageId);
      if (stored?.state !== 'DELIVERED' || !item) return null;
      const message = JSON.parse(stored.message_json);
      if (!messageValid(message) || hash(canonical(message)) !== stored.fingerprint
          || item.opaque_payload !== message.opaquePayload
          || item.payload_digest !== hash(Buffer.from(item.opaque_payload,'base64url'))) return null;
      return freeze({classification:'SYNTHETIC_ONLY',messageId,opaquePayload:item.opaque_payload});
    } catch { return null; }
  }
  function close() {
    if (busy) return false;
    if (!closed) { db.close(); closed = true; }
    return true;
  }
  return Object.freeze({commit,deliver,revoke,status,inbox,close});
}
