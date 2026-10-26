import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const KINDS = new Set(['task', 'shopping', 'memory']);
const ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'De invoer is ongeldig.',
  NOT_ALLOWED: 'Deze handeling is niet toegestaan.',
  NOT_FOUND: 'Het gevraagde record bestaat niet.',
  STALE_PROPOSAL: 'Het huishouden is gewijzigd. Maak een nieuw voorstel.',
  EXPIRED_PROPOSAL: 'Het voorstel is verlopen. Maak een nieuw voorstel.',
  STORAGE_ERROR: 'De lokale opslag kon de handeling niet afronden.',
  STORE_CLOSED: 'De lokale opslag is gesloten.',
});

function fail(code) {
  const error = new Error(ERROR_MESSAGES[code]);
  error.code = code;
  throw error;
}

function record(value, allowed, required = allowed) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key) || !('value' in descriptors[key]))
    || required.some((key) => !Object.hasOwn(descriptors, key))) fail('INVALID_INPUT');
}

function text(value, max, { empty = false, trim = false } = {}) {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) fail('INVALID_INPUT');
  const result = trim ? value.trim() : value;
  if ((!empty && result.trim().length === 0) || result.length > max) fail('INVALID_INPUT');
  return result;
}

function identifier(value) {
  const result = text(value, 200);
  if (result !== result.trim() || /[\u0000-\u001f\u007f]/.test(result)) fail('INVALID_INPUT');
  return result;
}

function date(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_INPUT');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) fail('INVALID_INPUT');
  return value;
}

function actionInput(value) {
  record(value, ['operation', 'kind', 'title', 'details', 'dueDate', 'itemId', 'done'], ['operation']);
  if (value.operation === 'add') {
    record(value, ['operation', 'kind', 'title', 'details', 'dueDate'], ['operation', 'kind', 'title']);
    if (!KINDS.has(value.kind)) fail('INVALID_INPUT');
    const title = text(value.title, 240, { trim: true });
    if (/[\r\n\t\u0001-\u001f\u007f]/.test(title)) fail('INVALID_INPUT');
    return { operation: 'add', kind: value.kind, title,
      details: Object.hasOwn(value, 'details') ? text(value.details, 800, { empty: true }) : '',
      dueDate: Object.hasOwn(value, 'dueDate') ? date(value.dueDate) : null };
  }
  if (value.operation === 'complete') {
    record(value, ['operation', 'itemId', 'done']);
    if (typeof value.done !== 'boolean') fail('INVALID_INPUT');
    return { operation: 'complete', itemId: identifier(value.itemId), done: value.done };
  }
  if (value.operation === 'forget') {
    record(value, ['operation', 'itemId']);
    return { operation: 'forget', itemId: identifier(value.itemId) };
  }
  fail('NOT_ALLOWED');
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const digestFor = (proposal) => createHash('sha256').update(JSON.stringify({
  version: 1, proposalId: proposal.id, actorId: proposal.actorId,
  householdId: proposal.householdId, sessionId: proposal.sessionId,
  baseRevision: proposal.baseRevision, createdAt: proposal.createdAt,
  expiresAt: proposal.expiresAt, action: proposal.action,
})).digest('hex');
const equalDigest = (left, right) => timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

/** Local operator store. Context must come from the trusted host, never from model output. */
export function createHouseholdStore(options = {}) {
  record(options, ['filename', 'actorId', 'householdId', 'clock'], []);
  const { filename = ':memory:', actorId = 'local-operator', householdId = 'local-household', clock = Date.now } = options;
  identifier(actorId);
  identifier(householdId);
  if (typeof filename !== 'string' || filename.length === 0 || filename.includes('\0') || typeof clock !== 'function') fail('INVALID_INPUT');
  const identity = Object.freeze({ actorId, householdId });
  let db;
  try { db = new DatabaseSync(filename); } catch { fail('STORAGE_ERROR'); }
  let closed = false;
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS items (
        household_id TEXT NOT NULL REFERENCES households(id), id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('task','shopping','memory')),
        title TEXT NOT NULL, details TEXT NOT NULL, due_date TEXT,
        done INTEGER NOT NULL CHECK(done IN (0,1)), version INTEGER NOT NULL CHECK(version > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (household_id, id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL,
        household_id TEXT NOT NULL REFERENCES households(id), session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','REVOKED')),
        action_json TEXT NOT NULL, digest TEXT NOT NULL, base_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
        actor_id TEXT NOT NULL, household_id TEXT NOT NULL REFERENCES households(id),
        session_id TEXT NOT NULL, operation TEXT NOT NULL,
        revision INTEGER NOT NULL, at TEXT NOT NULL, action_digest TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS revoked_sessions (
        actor_id TEXT NOT NULL, household_id TEXT NOT NULL REFERENCES households(id),
        session_id TEXT NOT NULL, at TEXT NOT NULL,
        PRIMARY KEY (actor_id, household_id, session_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS audit (
        sequence INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, household_id TEXT NOT NULL,
        session_id TEXT NOT NULL, event TEXT NOT NULL, ref TEXT NOT NULL,
        digest TEXT, at TEXT NOT NULL
      ) STRICT;
    `);
    db.prepare('INSERT OR IGNORE INTO households (id, revision) VALUES (?, 0)').run(householdId);
  } catch { db.close(); fail('STORAGE_ERROR'); }

  function ensureOpen() { if (closed) fail('STORE_CLOSED'); }
  function now() {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8.64e15 - PROPOSAL_TTL_MS) fail('INVALID_INPUT');
    return value;
  }
  function contextInput(context, { allowRevoked = false } = {}) {
    ensureOpen();
    record(context, ['actorId', 'householdId', 'sessionId']);
    identifier(context.actorId);
    identifier(context.householdId);
    identifier(context.sessionId);
    if (context.actorId !== actorId || context.householdId !== householdId) fail('NOT_ALLOWED');
    if (!allowRevoked && db.prepare('SELECT 1 FROM revoked_sessions WHERE actor_id = ? AND household_id = ? AND session_id = ?')
      .get(actorId, householdId, context.sessionId)) fail('NOT_ALLOWED');
    return { actorId, householdId, sessionId: context.sessionId };
  }
  function transaction(fn) {
    ensureOpen();
    try {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); db.exec('COMMIT'); return clone(result); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch (error) {
      if (Object.hasOwn(ERROR_MESSAGES, error?.code)) throw error;
      fail('STORAGE_ERROR');
    }
  }
  function revision() { return db.prepare('SELECT revision FROM households WHERE id = ?').get(householdId).revision; }
  function appendAudit(context, event, ref, digest, at) {
    db.prepare('INSERT INTO audit (actor_id, household_id, session_id, event, ref, digest, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(actorId, householdId, context.sessionId, event, ref, digest, at);
  }
  function publicProposal(row) {
    return { id: row.id, status: row.status, action: actionInput(JSON.parse(row.action_json)), digest: row.digest,
      baseRevision: row.base_revision, createdAt: row.created_at, expiresAt: row.expires_at };
  }
  function boundProposal(context, proposalId) {
    const row = db.prepare('SELECT * FROM proposals WHERE id = ? AND actor_id = ? AND household_id = ? AND session_id = ?')
      .get(proposalId, actorId, householdId, context.sessionId);
    if (!row) fail('NOT_FOUND');
    return row;
  }
  function publicReceipt(row) {
    return { id: row.id, proposalId: row.proposal_id, actorId: row.actor_id, householdId: row.household_id,
      operation: row.operation, revision: row.revision, at: row.at, actionDigest: row.action_digest };
  }
  function targetFor(action) {
    if (action.operation === 'add') return null;
    const item = db.prepare('SELECT * FROM items WHERE household_id = ? AND id = ?').get(householdId, action.itemId);
    if (!item) fail('NOT_FOUND');
    if (action.operation === 'forget' && item.kind !== 'memory') fail('NOT_ALLOWED');
    if (action.operation === 'complete' && item.kind === 'memory') fail('NOT_ALLOWED');
    return item;
  }

  return Object.freeze({
    identity,
    read(context) {
      const trusted = contextInput(context);
      return transaction(() => {
        contextInput(trusted);
        const rows = db.prepare('SELECT * FROM items WHERE household_id = ? ORDER BY created_at, id').all(householdId);
        return { id: householdId, label: 'Mijn huishouden', revision: revision(), items: rows.map((row) => ({
          id: row.id, kind: row.kind, title: row.title, details: row.details, dueDate: row.due_date,
          done: row.done === 1, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
        })) };
      });
    },
    propose(context, action) {
      const trusted = contextInput(context);
      const normalized = actionInput(action);
      return transaction(() => {
        contextInput(trusted);
        targetFor(normalized);
        const timestamp = now();
        const proposal = { id: randomUUID(), status: 'PENDING', action: normalized, actorId, householdId,
          sessionId: trusted.sessionId, baseRevision: revision(), createdAt: new Date(timestamp).toISOString(),
          expiresAt: new Date(timestamp + PROPOSAL_TTL_MS).toISOString() };
        proposal.digest = digestFor(proposal);
        db.prepare(`INSERT INTO proposals
          (id, actor_id, household_id, session_id, status, action_json, digest, base_revision, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(proposal.id, actorId, householdId, trusted.sessionId,
          proposal.status, JSON.stringify(normalized), proposal.digest, proposal.baseRevision, proposal.createdAt, proposal.expiresAt);
        appendAudit(trusted, 'PROPOSED', proposal.id, proposal.digest, proposal.createdAt);
        return { id: proposal.id, status: proposal.status, action: normalized, digest: proposal.digest,
          baseRevision: proposal.baseRevision, createdAt: proposal.createdAt, expiresAt: proposal.expiresAt };
      });
    },
    pending(context) {
      const trusted = contextInput(context);
      return transaction(() => {
        contextInput(trusted);
        const at = new Date(now()).toISOString();
        return db.prepare(`SELECT * FROM proposals WHERE actor_id = ? AND household_id = ? AND session_id = ?
          AND status = 'PENDING' AND expires_at > ? ORDER BY created_at, id`).all(actorId, householdId, trusted.sessionId, at).map(publicProposal);
      });
    },
    approve(context, input) {
      const trusted = contextInput(context);
      record(input, ['proposalId', 'digest']);
      identifier(input.proposalId);
      if (typeof input.digest !== 'string' || !/^[a-f0-9]{64}$/.test(input.digest)) fail('INVALID_INPUT');
      return transaction(() => {
        contextInput(trusted);
        const row = boundProposal(trusted, input.proposalId);
        const proposal = { ...publicProposal(row), actorId, householdId, sessionId: trusted.sessionId };
        const recomputed = digestFor(proposal);
        if (!equalDigest(input.digest, row.digest) || !equalDigest(row.digest, recomputed)) fail('NOT_ALLOWED');
        if (row.status === 'APPROVED') {
          const existing = db.prepare('SELECT * FROM receipts WHERE proposal_id = ? AND actor_id = ? AND household_id = ? AND session_id = ?')
            .get(row.id, actorId, householdId, trusted.sessionId);
          if (!existing) fail('STORAGE_ERROR');
          return publicReceipt(existing);
        }
        if (row.status !== 'PENDING') fail('NOT_ALLOWED');
        const timestamp = now();
        if (timestamp >= Date.parse(row.expires_at)) fail('EXPIRED_PROPOSAL');
        if (revision() !== row.base_revision) fail('STALE_PROPOSAL');
        targetFor(proposal.action);
        const at = new Date(timestamp).toISOString();
        const action = proposal.action;
        if (action.operation === 'add') {
          db.prepare(`INSERT INTO items
            (household_id, id, kind, title, details, due_date, done, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`).run(householdId, randomUUID(), action.kind, action.title,
            action.details, action.dueDate, at, at);
        } else if (action.operation === 'complete') {
          db.prepare('UPDATE items SET done = ?, version = version + 1, updated_at = ? WHERE household_id = ? AND id = ?')
            .run(Number(action.done), at, householdId, action.itemId);
        } else {
          db.prepare('DELETE FROM items WHERE household_id = ? AND id = ?').run(householdId, action.itemId);
        }
        const nextRevision = row.base_revision + 1;
        db.prepare('UPDATE households SET revision = ? WHERE id = ?').run(nextRevision, householdId);
        const receipt = { id: randomUUID(), proposalId: row.id, actorId, householdId,
          operation: action.operation, revision: nextRevision, at, actionDigest: row.digest };
        db.prepare(`INSERT INTO receipts
          (id, proposal_id, actor_id, household_id, session_id, operation, revision, at, action_digest)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(receipt.id, row.id, actorId, householdId, trusted.sessionId,
          receipt.operation, nextRevision, at, row.digest);
        db.prepare("UPDATE proposals SET status = 'APPROVED' WHERE id = ?").run(row.id);
        appendAudit(trusted, 'APPROVED', row.id, row.digest, at);
        return receipt;
      });
    },
    reject(context, input) {
      const trusted = contextInput(context);
      record(input, ['proposalId']);
      identifier(input.proposalId);
      return transaction(() => {
        contextInput(trusted);
        const row = boundProposal(trusted, input.proposalId);
        if (row.status === 'REJECTED') return publicProposal(row);
        if (row.status !== 'PENDING') fail('NOT_ALLOWED');
        db.prepare("UPDATE proposals SET status = 'REJECTED' WHERE id = ?").run(row.id);
        appendAudit(trusted, 'REJECTED', row.id, row.digest, new Date(now()).toISOString());
        return publicProposal({ ...row, status: 'REJECTED' });
      });
    },
    revokeSession(context) {
      const trusted = contextInput(context, { allowRevoked: true });
      return transaction(() => {
        const at = new Date(now()).toISOString();
        db.prepare('INSERT OR IGNORE INTO revoked_sessions (actor_id, household_id, session_id, at) VALUES (?, ?, ?, ?)')
          .run(actorId, householdId, trusted.sessionId, at);
        const result = db.prepare(`UPDATE proposals SET status = 'REVOKED' WHERE actor_id = ? AND household_id = ?
          AND session_id = ? AND status = 'PENDING'`).run(actorId, householdId, trusted.sessionId);
        appendAudit(trusted, 'SESSION_REVOKED', trusted.sessionId, null, at);
        return { sessionId: trusted.sessionId, revoked: true, rejectedCount: result.changes };
      });
    },
    receipts(context) {
      const trusted = contextInput(context);
      return transaction(() => {
        contextInput(trusted);
        return db.prepare('SELECT * FROM receipts WHERE actor_id = ? AND household_id = ? ORDER BY revision, id')
          .all(actorId, householdId).map(publicReceipt);
      });
    },
    close() {
      if (!closed) { db.close(); closed = true; }
    },
  });
}
