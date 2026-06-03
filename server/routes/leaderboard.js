const express = require('express');
const pool = require('../db/db');
const router = express.Router();

// GET /api/leaderboard?sort=points|streak&limit=50
router.get('/', async (req, res) => {
  try {
    const sort = req.query.sort === 'streak' ? 'current_streak' : 'total_points';
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { rows } = await pool.query(
      `SELECT username, total_points, current_streak, longest_streak, last_played_date
       FROM leaderboard ORDER BY ${sort} DESC LIMIT $1`,
      [limit]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /api/leaderboard/user/:username
router.get('/user/:username', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT username, total_points, current_streak, longest_streak, last_played_date FROM leaderboard WHERE username = $1',
      [req.params.username]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error('Leaderboard user error:', err.message);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

module.exports = router;
