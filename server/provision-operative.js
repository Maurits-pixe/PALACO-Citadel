import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { getConfig } from './config.js';

const username = process.env.PROVISION_USERNAME?.trim();
const password = process.env.PROVISION_PASSWORD;
const teamId = process.env.PROVISION_TEAM_ID;
const clearanceLevel = Number(process.env.PROVISION_CLEARANCE_LEVEL);
const channelIds = (process.env.PROVISION_CHANNEL_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

if (!username || username.length < 3 || username.length > 50
  || !password || password.length < 14 || password.length > 200
  || !/^[1-9]\d*$/.test(teamId || '')
  || !Number.isInteger(clearanceLevel) || clearanceLevel < 1 || clearanceLevel > 5
  || channelIds.length === 0 || channelIds.some(value => !/^[1-9]\d*$/.test(value))) {
  throw new Error('Set operative credentials, team id, clearance (1-5), and explicit channel ids.');
}

const config = getConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  const channels = await client.query(
    `SELECT id FROM channels
     WHERE team_id = $1 AND id = ANY($2::bigint[]) AND clearance_level <= $3`,
    [teamId, channelIds, clearanceLevel]
  );
  if (channels.rowCount !== channelIds.length) {
    throw new Error('Every selected channel must exist in the team and fit the clearance level.');
  }
  const user = await client.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'operative') RETURNING id`,
    [username, await bcrypt.hash(password, 12)]
  );
  await client.query(
    `INSERT INTO team_memberships (team_id, user_id, role, clearance_level)
     VALUES ($1, $2, 'operative', $3)`,
    [teamId, user.rows[0].id, clearanceLevel]
  );
  for (const channelId of channelIds) {
    await client.query(
      'INSERT INTO channel_memberships (channel_id, user_id) VALUES ($1, $2)',
      [channelId, user.rows[0].id]
    );
  }
  await client.query('COMMIT');
  console.log(`Operative provisioned for team ${teamId} with explicit channel membership.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
