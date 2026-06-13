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
app.use('/api/grader', require('./routes/grader'));
app.use('/api/spotlight', require('./routes/spotlight'));
app.use('/api/admin', require('./routes/admin'));

// Fallback — serve homepage only for non-file, non-API routes
app.get('*', (req, res) => {
  const p = req.path;
  // Let API routes 404 naturally
  if (p.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  // If the path looks like a file (has an extension), let static middleware handle it — if we're here it wasn't found
  if (p.includes('.')) return res.status(404).sendFile(path.join(__dirname, '../vaultiac-home.html'));
  // No extension — treat as SPA route, serve homepage
  res.sendFile(path.join(__dirname, '../vaultiac-home.html'));
});

const { generateWeeklyRecaps } = require('./jobs/weekly-recap');

// Weekly recap — runs every Sunday at midnight Eastern
function scheduleWeeklyRecap() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = now.getDay(); // 0 = Sunday
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(0, 0, 5, 0);
  const msUntil = nextSunday - now;
  console.log('[weekly-recap] Next run in', Math.round(msUntil / 3600000), 'hours');
  setTimeout(async () => {
    await generateWeeklyRecaps();
    scheduleWeeklyRecap();
  }, msUntil);
}

app.listen(PORT, () => {
  console.log(`Vaultiac server running at http://localhost:${PORT}`);
  scheduleJob();
  scheduleWeeklyRecap();

  // Seed market data on first deploy if table is empty
  const { runScrapeJob } = require('./jobs/newsletter-scrape');
  pool.query('SELECT COUNT(*) FROM market_data WHERE recorded_date = $1', [new Date().toISOString().split('T')[0]]).then(result => {
    if (parseInt(result.rows[0].count) === 0) {
      console.log('[startup] No market data for today — running scrape');
      runScrapeJob().catch(err => console.error('[startup] Scrape failed:', err.message));
    }
  }).catch(() => {});
});
