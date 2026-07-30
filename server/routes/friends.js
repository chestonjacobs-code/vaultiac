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

// GET /api/friends/invite-info/:token — return inviter username (no auth required)
router.get('/invite-info/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT u.username, u.avatar_url FROM friend_invites fi JOIN users u ON u.id = fi.inviter_id WHERE fi.token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invite not found.' });
    return res.json({ username: rows[0].username, avatar_url: rows[0].avatar_url });
  } catch (e) {
    console.error('[friends] invite-info error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/request/:token — create a pending friend request (replaces auto-join)
router.post('/request/:token', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT inviter_id FROM friend_invites WHERE token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invite link not found.' });
    const fromId = rows[0].inviter_id;
    if (fromId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself.' });

    // Check already friends
    const a = Math.min(fromId, req.user.id);
    const b = Math.max(fromId, req.user.id);
    const alreadyFriends = await pool.query(
      'SELECT id FROM friendships WHERE user_a_id = $1 AND user_b_id = $2', [a, b]
    );
    if (alreadyFriends.rows.length > 0) return res.json({ status: 'already_friends' });

    // Upsert pending request
    await pool.query(
      `INSERT INTO friend_requests (from_user_id, to_user_id, invite_token, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET status = 'pending', created_at = NOW()`,
      [fromId, req.user.id, req.params.token]
    );

    // Get inviter username for response
    const uRes = await pool.query('SELECT username FROM users WHERE id = $1', [fromId]);
    return res.json({ status: 'pending', from_username: uRes.rows[0]?.username });
  } catch (e) {
    console.error('[friends] request error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/pending — return pending requests for current user
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fr.id, fr.from_user_id, u.username as from_username, u.avatar_url as from_avatar_url, fr.invite_token, fr.created_at
       FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user_id
       WHERE fr.to_user_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [req.user.id]
    );
    return res.json({ data: rows });
  } catch (e) {
    console.error('[friends] pending error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/respond — accept or decline a friend request
router.post('/respond', requireAuth, async (req, res) => {
  const { request_id, action } = req.body; // action: 'accept' | 'decline'
  if (!request_id || !['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = $3',
      [request_id, req.user.id, 'pending']
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found.' });
    const fr = rows[0];

    if (action === 'accept') {
      const a = Math.min(fr.from_user_id, req.user.id);
      const b = Math.max(fr.from_user_id, req.user.id);
      await pool.query(
        'INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [a, b]
      );
    }

    await pool.query(
      'UPDATE friend_requests SET status = $1 WHERE id = $2',
      [action === 'accept' ? 'accepted' : 'declined', fr.id]
    );

    return res.json({ success: true, action });
  } catch (e) {
    console.error('[friends] respond error:', e.message);
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
      SELECT u.username, u.avatar_url, l.total_points, l.current_streak, l.longest_streak
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
      SELECT u.username, u.avatar_url, l.total_points, l.current_streak
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

// GET /api/friends/recap — return undismissed weekly recap for current user
router.get('/recap', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM weekly_recaps WHERE user_id = $1 AND dismissed = FALSE ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    return res.json({ data: rows[0] || null });
  } catch (e) {
    console.error('[friends] recap error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/recap/dismiss — mark recap as dismissed
router.post('/recap/dismiss', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE weekly_recaps SET dismissed = TRUE WHERE user_id = $1 AND dismissed = FALSE',
      [req.user.id]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error('[friends] recap dismiss error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/upcoming-shows — upcoming shows where at least one friend is going/vending, grouped by show
router.get('/upcoming-shows', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cs.id AS show_id, cs.show_name, cs.city, cs.state, cs.date_start, cs.date_end,
              u.id AS user_id, u.username, u.avatar_url, sa.is_going, sa.is_vending
       FROM show_attendance sa
       JOIN card_shows cs ON cs.id = sa.show_id
       JOIN users u ON u.id = sa.user_id
       JOIN friendships f ON f.user_a_id = LEAST($1, u.id) AND f.user_b_id = GREATEST($1, u.id)
       WHERE cs.status = 'published' AND COALESCE(cs.date_end, cs.date_start) >= CURRENT_DATE
       ORDER BY cs.date_start ASC, cs.id ASC`,
      [req.user.id]
    );

    const showMap = new Map();
    for (const r of rows) {
      if (!showMap.has(r.show_id)) {
        showMap.set(r.show_id, {
          show_id: r.show_id,
          show_name: r.show_name,
          city: r.city,
          state: r.state,
          date_start: r.date_start,
          date_end: r.date_end,
          friends: [],
        });
      }
      showMap.get(r.show_id).friends.push({
        user_id: r.user_id,
        username: r.username,
        avatar_url: r.avatar_url,
        is_going: r.is_going,
        is_vending: r.is_vending,
      });
    }
    return res.json(Array.from(showMap.values()));
  } catch (e) {
    console.error('[friends] upcoming-shows error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
