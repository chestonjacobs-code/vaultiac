CREATE TABLE IF NOT EXISTS market_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_name TEXT NOT NULL,
  set_name TEXT,
  sale_price REAL NOT NULL,
  volume INTEGER,
  source TEXT,
  recorded_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS news_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headline TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  published_date TEXT NOT NULL,
  scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  total_points INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_played_date TEXT
);

CREATE TABLE IF NOT EXISTS trivia_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  clues_used INTEGER NOT NULL,
  points_earned INTEGER NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0,
  played_at TEXT NOT NULL
);
