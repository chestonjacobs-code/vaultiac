require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const express = require('express');
const path = require('path');
const { scheduleJob } = require('./jobs/newsletter-scrape');
const pool = require('./db/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static HTML files from the root Vaultiac directory
app.use(express.static(path.join(__dirname, '../')));
// Serve /public for JS client and other assets
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/cards', require('./routes/cards'));
app.use('/api/trivia', require('./routes/trivia'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/newsletter', require('./routes/newsletter'));

// SPA fallback — serve homepage for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../vaultiac-home.html'));
});

app.listen(PORT, () => {
  console.log(`Vaultiac server running at http://localhost:${PORT}`);
  scheduleJob();

  // Seed market data on first deploy if table is empty
  const { runScrapeJob } = require('./jobs/newsletter-scrape');
  pool.query('SELECT COUNT(*) FROM market_data').then(result => {
    if (parseInt(result.rows[0].count) === 0) {
      console.log('[startup] market_data empty — running initial scrape');
      runScrapeJob().catch(err => console.error('[startup] Initial scrape failed:', err.message));
    }
  }).catch(() => {}); // ignore if table doesn't exist yet
});
