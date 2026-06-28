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

module.exports = db;
