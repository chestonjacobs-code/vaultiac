const express = require('express');
const db = require('../db/db');
const router = express.Router();

// GET /api/leaderboard?sort=points|streak&limit=50
router.get('/', (req, res) => {
  const sort = req.query.sort === 'streak' ? 'current_streak' : 'total_points';
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const rows = db
    .prepare(`SELECT username, total_points, current_streak, longest_streak, last_played_date FROM leaderboard ORDER BY ${sort} DESC LIMIT ?`)
    .all(limit);

  res.json({ data: rows });
});

// GET /api/leaderboard/user/:username
router.get('/user/:username', (req, res) => {
  const row = db
    .prepare('SELECT username, total_points, current_streak, longest_streak, last_played_date FROM leaderboard WHERE username = ?')
    .get(req.params.username);

  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ data: row });
});

module.exports = router;
