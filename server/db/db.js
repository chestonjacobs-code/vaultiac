require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialize schema on first connection
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        total_points INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_played_date TEXT
      );

      CREATE TABLE IF NOT EXISTS trivia_sessions (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        pokemon_name TEXT NOT NULL,
        clues_used INTEGER NOT NULL,
        points_earned INTEGER NOT NULL,
        solved INTEGER NOT NULL DEFAULT 0,
        played_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_data (
        id SERIAL PRIMARY KEY,
        card_name TEXT NOT NULL,
        set_name TEXT,
        sale_price REAL NOT NULL,
        volume INTEGER,
        source TEXT,
        recorded_date TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS news_stories (
        id SERIAL PRIMARY KEY,
        headline TEXT NOT NULL,
        summary TEXT,
        source_url TEXT,
        published_date TEXT NOT NULL,
        scraped_at TEXT NOT NULL
      );
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

initSchema().catch(err => console.error('Schema init error:', err));

module.exports = pool;
