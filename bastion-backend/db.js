import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const seedTasks = [
  ['Perimeter East security review', 'Review fictional sensor coverage in sector 4–9.', 'HIGH', 'Alpha Team', 3],
  ['Packet #402 header review', 'Analyze a fictional sample packet header.', 'CRITICAL', 'Tech Ops', 5],
  ['Supply inventory check', 'Review fictional unit 7 inventory.', 'MEDIUM', 'Support', 1]
];

export function openDatabase(filename = resolve('bastion.db')) {
  const databasePath = resolve(filename);
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED')),
      assignee TEXT NOT NULL DEFAULT '',
      clearance INTEGER NOT NULL DEFAULT 1 CHECK (clearance BETWEEN 1 AND 5),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS mutation_tickets (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL CHECK (action_type IN ('COMPLETE', 'ESCALATE')),
      payload TEXT NOT NULL CHECK (json_valid(payload)),
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      is_consumed INTEGER NOT NULL DEFAULT 0 CHECK (is_consumed IN (0, 1))
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_expires ON mutation_tickets(expires_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_owner ON mutation_tickets(owner_id);
  `);

  const count = db.prepare('SELECT count(*) AS count FROM tasks').get().count;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO tasks (title, description, priority, assignee, clearance)
      VALUES (?, ?, ?, ?, ?)
    `);
    const seed = db.transaction(() => {
      for (const task of seedTasks) insert.run(...task);
    });
    seed();
  }

  return db;
}
