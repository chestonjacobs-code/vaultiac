const express = require('express');
const pool = require('../db/db');
const router = express.Router();

// GET /api/newsletter
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM news_stories ORDER BY published_date DESC');
    res.json({ data: rows });
  } catch (err) {
    console.error('Newsletter error:', err.message);
    res.status(500).json({ error: 'Failed to load newsletter' });
  }
});

// GET /api/newsletter/market?limit=100
router.get('/market', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      'SELECT * FROM market_data ORDER BY recorded_date DESC LIMIT $1',
      [limit]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('Market data error:', err.message);
    res.status(500).json({ error: 'Failed to load market data' });
  }
});

module.exports = router;
