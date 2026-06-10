const express = require('express');
const crypto = require('crypto');
const pool = require('../db/db');
const { requireAuth } = require('./auth');
const router = express.Router();

// POST /api/friends/invite — get or create invite token for current user
router.post('/invite', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT token FROM friend_invites WHERE inviter_id = $1',
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.json({ token: existing.rows[0].token });
    }
    const token = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    await pool.query(
      'INSERT INTO friend_invites (inviter_id, token) VALUES ($1, $2)',
      [req.user.id, token]
    );
    return res.json({ token });
  } catch (e) {
    console.error('[friends] invite error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/join/:token — accept an invite link
router.get('/join/:token', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT inviter_id FROM friend_invites WHERE token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invite link not found.' });
    const inviterId = rows[0].inviter_id;
    if (inviterId === req.user.id) return res.status(400).json({ error: 'You cannot join your own invite.' });

    const a = Math.min(inviterId, req.user.id);
    const b = Math.max(inviterId, req.user.id);

    const check = await pool.query(
      'SELECT id FROM friendships WHERE user_a_id = $1 AND user_b_id = $2',
      [a, b]
    );
    if (check.rows.length === 0) {
      await pool.query(
        'INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1, $2)',
        [a, b]
      );
    }
    return res.json({ success: true, message: 'Friend added!' });
  } catch (e) {
    console.error('[friends] join error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/leaderboard?sort=streak|points
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const sort = req.query.sort === 'points' ? 'points' : 'streak';
    const orderBy = sort === 'points' ? 'l.total_points DESC' : 'l.current_streak DESC';

    const { rows } = await pool.query(`
      WITH friend_ids AS (
        SELECT CASE WHEN user_a_id = $1 THEN user_b_id ELSE user_a_id END AS fid
        FROM friendships WHERE user_a_id = $1 OR user_b_id = $1
        UNION ALL SELECT $1
      )
      SELECT u.username, l.total_points, l.current_streak, l.longest_streak
      FROM friend_ids fi
      JOIN users u ON u.id = fi.fid
      LEFT JOIN leaderboard l ON l.username = u.username
      ORDER BY ${orderBy}
    `, [req.user.id]);

    return res.json({ data: rows });
  } catch (e) {
    console.error('[friends] leaderboard error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/list
router.get('/list', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.username, l.total_points, l.current_streak
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
      LEFT JOIN leaderboard l ON l.username = u.username
      WHERE f.user_a_id = $1 OR f.user_b_id = $1
    `, [req.user.id]);
    return res.json({ data: rows });
  } catch (e) {
    console.error('[friends] list error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
