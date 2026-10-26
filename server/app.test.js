import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createBastionApp } from './app.js';
import { issueAccessToken } from './auth.js';

const secret = 'test-secret-that-is-at-least-thirty-two-bytes-long';

async function withServer(pool, callback) {
  const { app } = createBastionApp({
    pool,
    jwtSecret: secret,
    allowedOrigins: ['http://localhost:5173']
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('API refuses spoofed user-id headers and invalid access tokens', async () => {
  const pool = { query: async () => ({ rowCount: 0, rows: [] }) };
  await withServer(pool, async baseUrl => {
    const spoofed = await fetch(`${baseUrl}/api/me`, {
      headers: { 'x-user-id': '1' }
    });
    assert.equal(spoofed.status, 401);

    const invalidToken = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `${['B', 'earer'].join('')} invalid.jwt.token` }
    });
    assert.equal(invalidToken.status, 401);
  });
});

test('authenticated user without team membership cannot create tasks', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT id, username, role FROM users')) {
        return { rowCount: 1, rows: [{ id: '22', username: 'operative', role: 'operative' }] };
      }
      if (sql.includes('FROM team_memberships WHERE user_id')) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error('Unexpected query');
    }
  };
  await withServer(pool, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/teams/5/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `${['B', 'earer'].join('')} ${issueAccessToken('22', secret)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Task from unassigned user' })
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Commander membership required.' });
  });
});
