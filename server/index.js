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
const { router: authRouter } = require('./routes/auth');
app.use('/api/auth', authRouter);
app.use('/api/cards', require('./routes/cards'));
app.use('/api/trivia', require('./routes/trivia'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/admin', require('./routes/admin'));

// SPA fallback — serve homepage for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../vaultiac-home.html'));
});

app.listen(PORT, () => {
  console.log(`Vaultiac server running at http://localhost:${PORT}`);
  scheduleJob();

  // Seed market data on first deploy if table is empty
  const { runScrapeJob } = require('./jobs/newsletter-scrape');
  pool.query('SELECT COUNT(*) FROM market_data WHERE recorded_date = $1', [new Date().toISOString().split('T')[0]]).then(result => {
    if (parseInt(result.rows[0].count) === 0) {
      console.log('[startup] No market data for today — running scrape');
      runScrapeJob().catch(err => console.error('[startup] Scrape failed:', err.message));
    }
  }).catch(() => {});
});
