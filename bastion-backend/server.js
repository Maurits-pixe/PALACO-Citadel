import bodyParser from 'body-parser';
import cors from 'cors';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { validate as validateUuid, v4 as uuidv4 } from 'uuid';
import { openDatabase } from './db.js';

const TICKET_TTL_MS = 30_000;
const DEMO_OWNER_ID = 'local-demo';
const DEFAULT_ORIGINS = ['https://localhost:5173', 'https://localhost:5175'];
const actions = new Set(['COMPLETE', 'ESCALATE']);

function parseOrigins(value) {
  if (!value) return DEFAULT_ORIGINS;
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

function validPayload(action, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  return action === 'COMPLETE' || action === 'ESCALATE'
    ? keys.length === 1
      && keys[0] === 'taskId'
      && Number.isSafeInteger(payload.taskId)
      && payload.taskId > 0
    : false;
}

export function createBastionDemoApp({
  db,
  allowedOrigins = DEFAULT_ORIGINS,
  now = Date.now
}) {
  if (!db) throw new TypeError('A SQLite database is required.');
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      callback(null, Boolean(origin && allowedOrigins.includes(origin)));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
  }));
  app.use(bodyParser.json({ limit: '16kb', strict: true }));

  app.get('/health', (_req, res) => res.json({ status: 'demo-only' }));

  app.get('/api/tasks', (_req, res) => {
    const tasks = db.prepare(`
      SELECT id, title, description, priority, status, assignee, clearance, created_at
      FROM tasks ORDER BY created_at DESC, id DESC
    `).all();
    res.json(tasks);
  });

  app.post('/api/mutations/prepare', (req, res) => {
    const { action, payload } = req.body || {};
    if (!actions.has(action) || !validPayload(action, payload)) {
      return res.status(400).json({ error: 'INVALID_DEMO_MUTATION' });
    }

    const createdAt = now();
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
      return res.status(500).json({ error: 'DEMO_CLOCK_UNAVAILABLE' });
    }
    const ticketId = uuidv4();
    const expiresAt = createdAt + TICKET_TTL_MS;
    try {
      db.prepare(`
        INSERT INTO mutation_tickets
          (id, action_type, payload, owner_id, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(ticketId, action, JSON.stringify(payload), DEMO_OWNER_ID, createdAt, expiresAt);
      return res.status(201).json({
        ticketId,
        expiresAt,
        message: 'Demo action prepared. Confirm within 30 seconds.'
      });
    } catch {
      return res.status(500).json({ error: 'DEMO_PREPARATION_FAILED' });
    }
  });

  app.post('/api/mutations/execute', (req, res) => {
    const { ticketId } = req.body || {};
    if (typeof ticketId !== 'string' || !validateUuid(ticketId)) {
      return res.status(400).json({ error: 'INVALID_TICKET_ID' });
    }

    try {
      const executeTransaction = db.transaction(() => {
        const ticket = db.prepare(`
          SELECT id, action_type, payload, owner_id, expires_at, is_consumed
          FROM mutation_tickets WHERE id = ?
        `).get(ticketId);
        if (!ticket || ticket.owner_id !== DEMO_OWNER_ID) {
          return { kind: 'not-found' };
        }
        if (ticket.is_consumed) return { kind: 'already-used' };

        const checkedAt = now();
        if (!Number.isSafeInteger(checkedAt) || checkedAt >= ticket.expires_at) {
          db.prepare('UPDATE mutation_tickets SET is_consumed = 1 WHERE id = ?')
            .run(ticketId);
          return { kind: 'expired' };
        }

        let payload;
        try {
          payload = JSON.parse(ticket.payload);
        } catch {
          db.prepare('UPDATE mutation_tickets SET is_consumed = 1 WHERE id = ?')
            .run(ticketId);
          return { kind: 'invalid-ticket' };
        }
        if (!validPayload(ticket.action_type, payload)) {
          db.prepare('UPDATE mutation_tickets SET is_consumed = 1 WHERE id = ?')
            .run(ticketId);
          return { kind: 'invalid-ticket' };
        }

        const update = ticket.action_type === 'COMPLETE'
          ? db.prepare("UPDATE tasks SET status = 'COMPLETED' WHERE id = ?")
          : db.prepare("UPDATE tasks SET priority = 'HIGH' WHERE id = ?");
        const result = update.run(payload.taskId);
        db.prepare('UPDATE mutation_tickets SET is_consumed = 1 WHERE id = ?')
          .run(ticketId);
        if (result.changes !== 1) return { kind: 'task-not-found' };
        return { kind: 'success', acceptedAt: checkedAt };
      });
      const outcome = executeTransaction.immediate();

      if (outcome.kind === 'expired') {
        return res.status(403).json({
          success: false,
          error: 'CONSENT_EXPIRED',
          code: 'DEMO_CONSENT_EXPIRED',
          message: 'The demo action expired before it was accepted; no task change was made.'
        });
      }
      if (outcome.kind === 'already-used') {
        return res.status(409).json({ success: false, error: 'DEMO_TICKET_ALREADY_USED' });
      }
      if (outcome.kind === 'not-found') {
        return res.status(404).json({ success: false, error: 'DEMO_TICKET_NOT_FOUND' });
      }
      if (outcome.kind === 'task-not-found') {
        return res.status(404).json({ success: false, error: 'DEMO_TASK_NOT_FOUND' });
      }
      if (outcome.kind === 'invalid-ticket') {
        return res.status(409).json({ success: false, error: 'INVALID_DEMO_TICKET' });
      }
      return res.json({
        success: true,
        acceptedAt: outcome.acceptedAt,
        note: 'Local demo state only; this is not an authorization or D-013 compliance record.'
      });
    } catch {
      return res.status(500).json({ success: false, error: 'DEMO_EXECUTION_FAILED' });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      return res.status(error.status || 400).json({ error: 'INVALID_REQUEST_BODY' });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
  return app;
}

export function startBastionDemoServer({
  db = openDatabase(resolve('bastion.db')),
  port = Number(process.env.PORT || 3005),
  host = '127.0.0.1',
  certPath = process.env.TLS_CERT_PATH || resolve('localhost.pem'),
  keyPath = process.env.TLS_KEY_PATH || resolve('localhost-key.pem'),
  allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS)
} = {}) {
  const app = createBastionDemoApp({ db, allowedOrigins });
  const server = createHttpsServer({
    cert: readFileSync(certPath),
    key: readFileSync(keyPath)
  }, app);
  server.listen(port, host);
  return { server, db };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    const { server, db } = startBastionDemoServer();
    const shutdown = () => server.close(() => {
      db.close();
      process.exit(0);
    });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    server.on('listening', () => {
      console.log(`Bastion local demo API listening on https://127.0.0.1:${server.address().port}`);
      console.log('Demo-only synthetic data; no authentication, authorization, or D-013 claim.');
    });
  } catch (error) {
    console.error(`Bastion demo API did not start: ${error.message}`);
    process.exitCode = 1;
  }
}
