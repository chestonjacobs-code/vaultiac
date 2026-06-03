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

// GET /api/newsletter/top-mover — single biggest mover today
router.get('/top-mover', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT * FROM market_data
       WHERE recorded_date = $1
       ORDER BY price_change_pct DESC
       LIMIT 1`,
      [today]
    );

    if (rows.length === 0) {
      // Fall back to most recent day's top mover
      const { rows: fallback } = await pool.query(
        `SELECT * FROM market_data
         ORDER BY recorded_date DESC, price_change_pct DESC
         LIMIT 1`
      );
      return res.json({ data: fallback[0] || null });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    console.error('Top mover error:', err.message);
    res.status(500).json({ error: 'Failed to load top mover' });
  }
});

// GET /api/newsletter/top-movers?limit=10 — top N movers today
router.get('/top-movers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT * FROM market_data
       WHERE recorded_date = $1
       ORDER BY price_change_pct DESC
       LIMIT $2`,
      [today, limit]
    );

    if (rows.length === 0) {
      const { rows: fallback } = await pool.query(
        `SELECT * FROM market_data
         ORDER BY recorded_date DESC, price_change_pct DESC
         LIMIT $1`,
        [limit]
      );
      return res.json({ data: fallback });
    }

    res.json({ data: rows });
  } catch (err) {
    console.error('Top movers error:', err.message);
    res.status(500).json({ error: 'Failed to load top movers' });
  }
});

module.exports = router;
