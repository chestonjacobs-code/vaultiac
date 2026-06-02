const express = require('express');
const db = require('../db/db');
const router = express.Router();

// GET /api/newsletter
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM news_stories ORDER BY published_date DESC')
    .all();

  res.json({ data: rows });
});

// GET /api/newsletter/market?limit=100
router.get('/market', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = db
    .prepare('SELECT * FROM market_data ORDER BY recorded_date DESC LIMIT ?')
    .all(limit);

  res.json({ data: rows });
});

module.exports = router;
