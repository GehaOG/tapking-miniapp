const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'game.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    username   TEXT    NOT NULL DEFAULT 'Player',
    score      INTEGER NOT NULL DEFAULT 0,
    energy     INTEGER NOT NULL DEFAULT 1000,
    last_seen  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_score ON users(score DESC);
`);

module.exports = db;
