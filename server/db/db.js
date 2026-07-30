require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
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
        price_change_pct REAL DEFAULT 0,
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
    // Add price_change_pct column if it doesn't exist yet (live DB migration)
    await client.query(`
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS price_change_pct REAL DEFAULT 0;
    `);
    // Add daily_play_date column for trivia daily lock
    await client.query(`
      ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS daily_play_date TEXT;
    `);
    // Daily shared trivia cache — one Pokémon per day for all players
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_trivia (
        play_date DATE PRIMARY KEY,
        pokemon_id INTEGER NOT NULL,
        pokemon_name TEXT NOT NULL,
        clues JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Auth users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        notify_updates BOOLEAN DEFAULT FALSE,
        agreed_to_terms BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
    // Live migrations for existing users tables
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_updates BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_to_terms BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `);
    // Friends system tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS friend_invites (
        id SERIAL PRIMARY KEY,
        inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_friend_invites_token ON friend_invites(token);

      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_a_id, user_b_id)
      );
      CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_a_id);
      CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b_id);
    `);
    // Password resets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
    `);
    // Drop FK constraint on friend_invites.inviter_id — users table may be empty in production
    await client.query(`
      ALTER TABLE friend_invites DROP CONSTRAINT IF EXISTS friend_invites_inviter_id_fkey;
    `);
    // Same for friendships
    await client.query(`
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_user_a_id_fkey;
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_user_b_id_fkey;
    `);
    // Friend requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER NOT NULL,
        to_user_id INTEGER NOT NULL,
        invite_token TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(from_user_id, to_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
      CREATE INDEX IF NOT EXISTS idx_friend_requests_token ON friend_requests(invite_token);
    `);
    // Weekly recaps table
    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_recaps (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        week_start TEXT NOT NULL,
        rank INTEGER,
        total_friends INTEGER,
        message TEXT,
        dismissed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, week_start)
      );
      CREATE INDEX IF NOT EXISTS idx_weekly_recaps_user ON weekly_recaps(user_id);
    `);
    // Friend groups tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS group_invites (
        token TEXT PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Card show finder — table_count and search/submit tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_shows (
        id SERIAL PRIMARY KEY,
        show_name TEXT NOT NULL,
        venue_name TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        zip TEXT NOT NULL,
        lat NUMERIC,
        lng NUMERIC,
        date_start DATE NOT NULL,
        date_end DATE,
        time_range TEXT,
        category TEXT NOT NULL,
        table_count INTEGER,
        admission TEXT,
        notes TEXT,
        source TEXT NOT NULL,
        submitted_by INTEGER REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'published',
        rejection_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_card_shows_zip ON card_shows(zip);
      CREATE INDEX IF NOT EXISTS idx_card_shows_date_start ON card_shows(date_start);
      CREATE INDEX IF NOT EXISTS idx_card_shows_city_state ON card_shows(city, state);
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

initSchema().catch(err => console.error('Schema init error:', err));

module.exports = pool;
