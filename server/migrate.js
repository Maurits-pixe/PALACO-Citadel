import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { getConfig } from './config.js';

const config = getConfig();
const pool = new Pool({ connectionString: config.databaseUrl });

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('Bastion schema is ready.');
} finally {
  await pool.end();
}
