const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'wedding.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    search_name TEXT NOT NULL,
    attending TEXT CHECK(attending IN ('yes','no')),
    invite_code TEXT UNIQUE,
    responded_at TEXT,
    checked_in INTEGER NOT NULL DEFAULT 0,
    checked_in_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_guests_search_name ON guests(search_name);
  CREATE INDEX IF NOT EXISTS idx_guests_public_token ON guests(public_token);
  CREATE INDEX IF NOT EXISTS idx_guests_invite_code ON guests(invite_code);
`);

// Migration: per-venue check-in columns (safe on existing DBs — ignored if already present)
const addCol = (sql) => { try { db.exec(sql); } catch (_) {} };
addCol('ALTER TABLE guests ADD COLUMN ceremony_checked_in INTEGER NOT NULL DEFAULT 0');
addCol('ALTER TABLE guests ADD COLUMN ceremony_checked_in_at TEXT');
addCol('ALTER TABLE guests ADD COLUMN reception_checked_in INTEGER NOT NULL DEFAULT 0');
addCol('ALTER TABLE guests ADD COLUMN reception_checked_in_at TEXT');
// Carry any legacy single check-in into the ceremony slot
db.exec('UPDATE guests SET ceremony_checked_in = 1, ceremony_checked_in_at = checked_in_at WHERE checked_in = 1 AND ceremony_checked_in = 0');
// Pass status: 'approved' (active) | 'revoked' (blocked). Default approved for all existing records.
addCol("ALTER TABLE guests ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");

module.exports = db;
