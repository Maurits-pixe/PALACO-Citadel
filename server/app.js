import bcrypt from 'bcrypt';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { bearerToken, issueAccessToken, verifyAccessToken } from './auth.js';
import { writeAudit } from './audit.js';
import { canAccessChannel, canReadTask, canUpdateTask } from './policy.js';

const PASSWORD_ROUNDS = 12;
const MESSAGE_MAX_LENGTH = 2000;
const MESSAGE_TTL_MIN = 5;
const MESSAGE_TTL_MAX = 300;
const TASK_STATUSES = new Set(['PENDING', 'ACTIVE', 'COMPLETED']);
const TASK_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const dummyPasswordHash = bcrypt.hash('invalid-bastion-login-password', PASSWORD_ROUNDS);

function id(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function parseTtl(value) {
  if (value === null || value === undefined) return null;
  return Number.isInteger(value) && value >= MESSAGE_TTL_MIN && value <= MESSAGE_TTL_MAX
    ? value
    : undefined;
}

function publicMessage(row) {
  return {
    id: String(row.id),
    channel_id: String(row.channel_id),
    sender_id: String(row.sender_id),
    content: row.content,
    created_at: row.created_at,
    expires_at: row.expires_at
  };
}

async function inTransaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function emitToChannelMembers(io, pool, channelId, event, payload) {
  const members = await pool.query(
    `SELECT DISTINCT cm.user_id
     FROM channel_memberships cm
     JOIN channels c ON c.id = cm.channel_id
     JOIN team_memberships tm ON tm.team_id = c.team_id AND tm.user_id = cm.user_id
     JOIN users u ON u.id = cm.user_id
     WHERE cm.channel_id = $1 AND u.is_active = TRUE
       AND tm.clearance_level >= c.clearance_level`,
    [channelId]
  );
  for (const member of members.rows) {
    io.to(`user:${member.user_id}`).emit(event, payload);
  }
}

async function emitToTeamMembers(io, pool, teamId, event, payload) {
  const members = await pool.query(
    `SELECT tm.user_id FROM team_memberships tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1 AND u.is_active = TRUE`,
    [teamId]
  );
  for (const member of members.rows) {
    io.to(`user:${member.user_id}`).emit(event, payload);
  }
}

export function createBastionApp({ pool, jwtSecret, allowedOrigins, ioRef = { current: null } }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed.'));
    },
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type']
  }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));

  app.get('/health', rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }), async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      return res.json({ status: 'ok' });
    } catch {
      return res.status(503).json({ status: 'unavailable' });
    }
  });

  async function authenticate(req, res, next) {
    const token = bearerToken(req.get('authorization'));
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const claims = verifyAccessToken(token, jwtSecret);
      const user = await pool.query(
        'SELECT id, username, role FROM users WHERE id = $1 AND is_active = TRUE',
        [claims.userId]
      );
      if (!user.rowCount) return res.status(401).json({ error: 'Authentication required.' });
      req.user = user.rows[0];
      return next();
    } catch {
      return res.status(401).json({ error: 'Authentication required.' });
    }
  }

  async function findMembership(userId, teamId, executor = pool, lock = '') {
    const result = await executor.query(
      `SELECT team_id, user_id, role, clearance_level
       FROM team_memberships WHERE user_id = $1 AND team_id = $2 ${lock}`,
      [userId, teamId]
    );
    return result.rows[0] || null;
  }

  async function findChannelAccess(userId, channelId) {
    const result = await pool.query(
      `SELECT c.id, c.team_id, c.name, c.clearance_level,
              tm.user_id, tm.role, tm.clearance_level AS member_clearance,
              cm.channel_id
       FROM channels c
       JOIN users u ON u.id = $1 AND u.is_active = TRUE
       JOIN team_memberships tm ON tm.team_id = c.team_id AND tm.user_id = u.id
       JOIN channel_memberships cm ON cm.channel_id = c.id AND cm.user_id = $1
       WHERE c.id = $2`,
      [userId, channelId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const membership = {
      team_id: row.team_id,
      user_id: row.user_id,
      role: row.role,
      clearance_level: row.member_clearance
    };
    const channel = {
      id: row.id,
      team_id: row.team_id,
      clearance_level: row.clearance_level
    };
    const channelMembership = { channel_id: row.channel_id };
    return canAccessChannel(membership, channel, channelMembership)
      ? { channel, membership }
      : null;
  }

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!validText(username, 50) || !validText(password, 200)) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
      const result = await pool.query(
        'SELECT id, username, role, password_hash FROM users WHERE username = $1 AND is_active = TRUE',
        [username.trim()]
      );
      const user = result.rows[0];
      const passwordHash = user ? user.password_hash : await dummyPasswordHash;
      const matches = await bcrypt.compare(password, passwordHash);
      if (!user || !matches) {
        await writeAudit(pool, {
          action: 'LOGIN_FAILED',
          ipAddress: req.ip
        });
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      await writeAudit(pool, {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip
      });
      return res.json({
        accessToken: issueAccessToken(user.id, jwtSecret),
        user: { id: String(user.id), username: user.username, role: user.role }
      });
    } catch {
      return res.status(503).json({ error: 'Authentication service unavailable.' });
    }
  });

  app.get('/api/me', authenticate, (req, res) => {
    res.json({ id: String(req.user.id), username: req.user.username, role: req.user.role });
  });

  app.get('/api/teams', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT t.id, t.name, tm.role, tm.clearance_level
         FROM teams t JOIN team_memberships tm ON tm.team_id = t.id
         WHERE tm.user_id = $1 ORDER BY t.name`,
        [req.user.id]
      );
      await writeAudit(pool, {
        userId: req.user.id,
        action: 'VIEW_TEAMS',
        ipAddress: req.ip
      });
      res.json(result.rows.map(row => ({ ...row, id: String(row.id) })));
    } catch {
      res.status(503).json({ error: 'Team service unavailable.' });
    }
  });

  app.get('/api/teams/:teamId/tasks', authenticate, async (req, res) => {
    if (!id(req.params.teamId)) return res.status(400).json({ error: 'Invalid team.' });
    try {
      const result = await pool.query(
        `SELECT t.id, t.team_id, t.title, t.description, t.status, t.priority,
                t.clearance_level, t.assigned_to, t.created_by, t.created_at, t.updated_at
         FROM tasks t
         JOIN team_memberships tm ON tm.team_id = t.team_id AND tm.user_id = $2
         WHERE t.team_id = $1 AND t.clearance_level <= tm.clearance_level
           AND (tm.role = 'commander' OR t.assigned_to = $2 OR t.created_by = $2)
         ORDER BY t.created_at DESC`,
        [req.params.teamId, req.user.id]
      );
      await writeAudit(pool, {
        userId: req.user.id,
        action: 'VIEW_TASKS',
        targetType: 'team',
        targetId: req.params.teamId,
        ipAddress: req.ip
      });
      res.json(result.rows.map(row => ({
        ...row,
        id: String(row.id),
        team_id: String(row.team_id),
        assigned_to: row.assigned_to === null ? null : String(row.assigned_to),
        created_by: String(row.created_by)
      })));
    } catch {
      res.status(503).json({ error: 'Task service unavailable.' });
    }
  });

  app.post('/api/teams/:teamId/tasks', authenticate, async (req, res) => {
    const { title, description = '', priority = 'MEDIUM', clearanceLevel = 1, assignedTo = null } = req.body || {};
    if (!id(req.params.teamId) || !validText(title, 150) || typeof description !== 'string'
      || description.length > 5000 || !TASK_PRIORITIES.has(priority)
      || !Number.isInteger(clearanceLevel) || clearanceLevel < 1 || clearanceLevel > 5
      || (assignedTo !== null && !id(String(assignedTo)))) {
      return res.status(400).json({ error: 'Invalid task fields.' });
    }
    try {
      const outcome = await inTransaction(pool, async client => {
        const membership = await findMembership(req.user.id, req.params.teamId, client, 'FOR SHARE');
        if (!membership || membership.role !== 'commander') {
          await writeAudit(client, {
            userId: req.user.id,
            action: 'DENIED_TASK_CREATE',
            targetType: 'team',
            targetId: req.params.teamId,
            ipAddress: req.ip
          });
          return { error: 'Commander membership required.', status: 403 };
        }
        if (clearanceLevel > membership.clearance_level) {
          await writeAudit(client, {
            userId: req.user.id,
            action: 'DENIED_TASK_CREATE',
            targetType: 'team',
            targetId: req.params.teamId,
            ipAddress: req.ip,
            details: { requestedClearance: clearanceLevel }
          });
          return { error: 'Task clearance exceeds your authorization.', status: 403 };
        }
        if (assignedTo) {
          const assignee = await findMembership(assignedTo, req.params.teamId, client, 'FOR SHARE');
          if (!assignee || assignee.clearance_level < clearanceLevel) {
            await writeAudit(client, {
              userId: req.user.id,
              action: 'DENIED_TASK_ASSIGNMENT',
              targetType: 'team',
              targetId: req.params.teamId,
              ipAddress: req.ip,
              details: { requestedClearance: clearanceLevel }
            });
            return { error: 'Assignee is not eligible for this task.', status: 400 };
          }
        }
        const result = await client.query(
          `INSERT INTO tasks
            (team_id, title, description, priority, clearance_level, assigned_to, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, team_id, title, description, status, priority, clearance_level,
                     assigned_to, created_by, created_at, updated_at`,
          [req.params.teamId, title.trim(), description, priority, clearanceLevel, assignedTo, req.user.id]
        );
        const insertedTask = result.rows[0];
        await writeAudit(client, {
          userId: req.user.id,
          action: 'CREATE_TASK',
          targetType: 'task',
          targetId: insertedTask.id,
          ipAddress: req.ip,
          details: { teamId: req.params.teamId, clearanceLevel }
        });
        return { task: insertedTask };
      });
      if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
      const task = outcome.task;
      emitToTeamMembers(
        ioRef.current,
        pool,
        req.params.teamId,
        'tasks_changed',
        { teamId: req.params.teamId }
      ).catch(() => {});
      res.status(201).json({ ...task, id: String(task.id), team_id: String(task.team_id) });
    } catch {
      res.status(503).json({ error: 'Task service unavailable.' });
    }
  });

  app.patch('/api/tasks/:taskId', authenticate, async (req, res) => {
    const { status } = req.body || {};
    if (!id(req.params.taskId) || !TASK_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid task update.' });
    }
    try {
      const outcome = await inTransaction(pool, async client => {
        const existing = await client.query(
          'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
          [req.params.taskId]
        );
        const task = existing.rows[0];
        if (!task) {
          await writeAudit(client, {
            userId: req.user.id,
            action: 'DENIED_TASK_UPDATE',
            targetType: 'task',
            targetId: req.params.taskId,
            ipAddress: req.ip
          });
          return { error: 'Task not found.', status: 404 };
        }
        const membership = await findMembership(req.user.id, task.team_id, client, 'FOR SHARE');
        if (!canUpdateTask(membership, task, req.user.id)) {
          await writeAudit(client, {
            userId: req.user.id,
            action: 'DENIED_TASK_UPDATE',
            targetType: 'task',
            targetId: req.params.taskId,
            ipAddress: req.ip
          });
          return { error: 'Task not found.', status: 404 };
        }
        const result = await client.query(
          `UPDATE tasks SET status = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, team_id, title, description, status, priority, clearance_level,
                     assigned_to, created_by, created_at, updated_at`,
          [status, req.params.taskId]
        );
        await writeAudit(client, {
          userId: req.user.id,
          action: 'UPDATE_TASK_STATUS',
          targetType: 'task',
          targetId: req.params.taskId,
          ipAddress: req.ip,
          details: { status }
        });
        return { task, updated: result.rows[0] };
      });
      if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
      const { task, updated } = outcome;
      emitToTeamMembers(
        ioRef.current,
        pool,
        task.team_id,
        'tasks_changed',
        { teamId: String(task.team_id) }
      ).catch(() => {});
      res.json({ ...updated, id: String(updated.id), team_id: String(updated.team_id) });
    } catch {
      res.status(503).json({ error: 'Task service unavailable.' });
    }
  });

  app.get('/api/teams/:teamId/channels', authenticate, async (req, res) => {
    if (!id(req.params.teamId)) return res.status(400).json({ error: 'Invalid team.' });
    try {
      const result = await pool.query(
        `SELECT c.id, c.team_id, c.name, c.clearance_level
         FROM channels c
         JOIN users u ON u.id = $2 AND u.is_active = TRUE
         JOIN team_memberships tm ON tm.team_id = c.team_id AND tm.user_id = u.id
         JOIN channel_memberships cm ON cm.channel_id = c.id AND cm.user_id = $2
         WHERE c.team_id = $1 AND c.clearance_level <= tm.clearance_level
         ORDER BY c.name`,
        [req.params.teamId, req.user.id]
      );
      await writeAudit(pool, {
        userId: req.user.id,
        action: 'VIEW_CHANNELS',
        targetType: 'team',
        targetId: req.params.teamId,
        ipAddress: req.ip
      });
      res.json(result.rows.map(row => ({ ...row, id: String(row.id), team_id: String(row.team_id) })));
    } catch {
      res.status(503).json({ error: 'Channel service unavailable.' });
    }
  });

  app.get('/api/channels/:channelId/messages', authenticate, async (req, res) => {
    if (!id(req.params.channelId)) return res.status(400).json({ error: 'Invalid channel.' });
    try {
      const outcome = await inTransaction(pool, async client => {
        const access = await client.query(
          `SELECT c.id
           FROM channels c
           JOIN users u ON u.id = $1 AND u.is_active = TRUE
           JOIN team_memberships tm ON tm.team_id = c.team_id AND tm.user_id = u.id
           JOIN channel_memberships cm ON cm.channel_id = c.id AND cm.user_id = u.id
           WHERE c.id = $2 AND tm.clearance_level >= c.clearance_level
           FOR SHARE OF c, u, tm, cm`,
          [req.user.id, req.params.channelId]
        );
        if (!access.rowCount) return { error: 'Channel not found.' };
        const result = await client.query(
          `SELECT id, channel_id, sender_id, content, created_at, expires_at
           FROM messages
           WHERE channel_id = $1 AND is_destroyed = FALSE
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY created_at DESC LIMIT 100`,
          [req.params.channelId]
        );
        await writeAudit(client, {
          userId: req.user.id,
          action: 'VIEW_CHANNEL_MESSAGES',
          targetType: 'channel',
          targetId: req.params.channelId,
          ipAddress: req.ip
        });
        return { messages: result.rows };
      });
      if (outcome.error) return res.status(404).json({ error: outcome.error });
      res.json(outcome.messages.reverse().map(publicMessage));
    } catch {
      res.status(503).json({ error: 'Message service unavailable.' });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.message === 'Origin not allowed.') {
      return res.status(403).json({ error: 'Origin not allowed.' });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Invalid JSON.' });
    }
    return res.status(500).json({ error: 'Request failed.' });
  });

  return { app, authenticate, findChannelAccess, findMembership };
}

export function attachBastionSockets(io, { pool, jwtSecret }) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('Authentication required.'));
      const claims = verifyAccessToken(token, jwtSecret);
      const result = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
        [claims.userId]
      );
      if (!result.rowCount) return next(new Error('Authentication required.'));
      socket.data.userId = claims.userId;
      socket.data.tokenExpiresAt = claims.expiresAt;
      return next();
    } catch {
      return next(new Error('Authentication required.'));
    }
  });

  io.on('connection', socket => {
    socket.join(`user:${socket.data.userId}`);
    const tokenLifetime = socket.data.tokenExpiresAt - Date.now();
    if (tokenLifetime <= 0) {
      socket.disconnect(true);
      return;
    }
    const expiryTimer = setTimeout(() => socket.disconnect(true), tokenLifetime);
    expiryTimer.unref();
    socket.once('disconnect', () => clearTimeout(expiryTimer));

    socket.on('join_channel', async (payload, acknowledge = () => {}) => {
      const channelId = typeof payload === 'string' ? payload : payload?.channelId;
      if (!id(channelId)) return acknowledge({ error: 'Channel not found.' });
      try {
        const result = await pool.query(
          `SELECT c.id, c.team_id, c.clearance_level,
                  tm.user_id, tm.role, tm.clearance_level AS member_clearance,
                  cm.channel_id
           FROM channels c
           JOIN users u ON u.id = $1 AND u.is_active = TRUE
           JOIN team_memberships tm ON tm.team_id = c.team_id AND tm.user_id = u.id
           JOIN channel_memberships cm ON cm.channel_id = c.id AND cm.user_id = $1
           WHERE c.id = $2`,
          [socket.data.userId, channelId]
        );
        const row = result.rows[0];
        const membership = row && {
          team_id: row.team_id,
          role: row.role,
          clearance_level: row.member_clearance
        };
        const channel = row && { id: row.id, team_id: row.team_id, clearance_level: row.clearance_level };
        const channelMembership = row && { channel_id: row.channel_id };
        if (!canAccessChannel(membership, channel, channelMembership)) {
          await writeAudit(pool, {
            userId: socket.data.userId,
            action: 'DENIED_CHANNEL_JOIN',
            targetType: 'channel',
            targetId: channelId
          });
          return acknowledge({ error: 'Channel not found.' });
        }
        await writeAudit(pool, {
          userId: socket.data.userId,
          action: 'JOIN_CHANNEL',
          targetType: 'channel',
          targetId: channelId
        });
        return acknowledge({ ok: true });
      } catch {
        return acknowledge({ error: 'Channel service unavailable.' });
      }
    });

    socket.on('send_message', async (payload, acknowledge = () => {}) => {
      const channelId = payload?.channelId;
      const content = payload?.content;
      const ttlSeconds = parseTtl(payload?.ttlSeconds);
      if (!id(channelId) || !validText(content, MESSAGE_MAX_LENGTH) || ttlSeconds === undefined) {
        return acknowledge({ error: 'Invalid message.' });
      }
      try {
        const message = await inTransaction(pool, async client => {
          const access = await client.query(
            `SELECT c.id
             FROM channels c
             JOIN users u ON u.id = $1 AND u.is_active = TRUE
             JOIN team_memberships tm ON tm.team_id = c.team_id AND tm.user_id = u.id
             JOIN channel_memberships cm ON cm.channel_id = c.id AND cm.user_id = u.id
             WHERE c.id = $2 AND tm.clearance_level >= c.clearance_level
             FOR SHARE OF c, u, tm, cm`,
            [socket.data.userId, channelId]
          );
          if (!access.rowCount) {
            await writeAudit(client, {
              userId: socket.data.userId,
              action: 'DENIED_MESSAGE_SEND',
              targetType: 'channel',
              targetId: channelId
            });
            return null;
          }
          const inserted = await client.query(
            `INSERT INTO messages (channel_id, sender_id, content, expires_at)
             VALUES ($1, $2, $3, CASE WHEN $4::integer IS NULL
               THEN NULL ELSE NOW() + make_interval(secs => $4) END)
             RETURNING id, channel_id, sender_id, content, created_at, expires_at`,
            [channelId, socket.data.userId, content.trim(), ttlSeconds]
          );
          const savedMessage = publicMessage(inserted.rows[0]);
          await writeAudit(client, {
            userId: socket.data.userId,
            action: 'SEND_MESSAGE',
            targetType: 'message',
            targetId: savedMessage.id,
            details: { channelId, ttlSeconds }
          });
          return savedMessage;
        });
        if (!message) return acknowledge({ error: 'Channel not found.' });
        emitToChannelMembers(io, pool, channelId, 'receive_message', message).catch(() => {});
        return acknowledge({ ok: true, messageId: message.id });
      } catch {
        return acknowledge({ error: 'Message service unavailable.' });
      }
    });
  });
}

export async function expireMessages(pool, io) {
  const expired = await inTransaction(pool, async client => {
    const result = await client.query(
      `UPDATE messages SET content = NULL, is_destroyed = TRUE
       WHERE expires_at <= NOW() AND is_destroyed = FALSE
       RETURNING id, channel_id`
    );
    for (const message of result.rows) {
      await writeAudit(client, {
        action: 'MESSAGE_EXPIRED',
        targetType: 'message',
        targetId: message.id,
        details: { channelId: String(message.channel_id) }
      });
    }
    return result.rows;
  });
  for (const message of expired) {
    emitToChannelMembers(
      io,
      pool,
      message.channel_id,
      'message_destroyed',
      { id: String(message.id) }
    ).catch(() => {});
  }
  return expired.length;
}
