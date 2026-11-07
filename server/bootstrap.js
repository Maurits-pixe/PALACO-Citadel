import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { getConfig } from './config.js';

const username = process.env.BOOTSTRAP_USERNAME?.trim();
const password = process.env.BOOTSTRAP_PASSWORD;
const teamName = process.env.BOOTSTRAP_TEAM?.trim();
const channelName = process.env.BOOTSTRAP_CHANNEL?.trim();

if (!username || username.length < 3 || username.length > 50
  || !password || password.length < 14 || password.length > 200
  || !teamName || !channelName) {
  throw new Error('Set bootstrap username, 14+ character password, team, and channel in the environment.');
}

const config = getConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  const userResult = await client.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'commander') RETURNING id`,
    [username, await bcrypt.hash(password, 12)]
  );
  const teamResult = await client.query(
    'INSERT INTO teams (name) VALUES ($1) RETURNING id',
    [teamName]
  );
  const teamId = teamResult.rows[0].id;
  const userId = userResult.rows[0].id;
  await client.query(
    `INSERT INTO team_memberships (team_id, user_id, role, clearance_level)
     VALUES ($1, $2, 'commander', 5)`,
    [teamId, userId]
  );
  const channelResult = await client.query(
    `INSERT INTO channels (team_id, name, clearance_level)
     VALUES ($1, $2, 1) RETURNING id`,
    [teamId, channelName]
  );
  await client.query(
    'INSERT INTO channel_memberships (channel_id, user_id) VALUES ($1, $2)',
    [channelResult.rows[0].id, userId]
  );
  await client.query('COMMIT');
  console.log(`Bootstrap commander and team created (team id ${teamId}).`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
