const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..', '..');
const configuredPath = process.env.DATABASE_FILE || './data/supporthub.db';
const databasePath = path.resolve(projectRoot, configuredPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function assertDatabaseReady() {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!table) {
    throw new Error('Database is not initialized. Stop the server and run: npm run setup-db');
  }
}

module.exports = { db, databasePath, assertDatabaseReady };
