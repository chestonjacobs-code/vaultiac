require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'vaultiac.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Ensure the directory exists (important for /data volume on Railway)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

module.exports = db;
