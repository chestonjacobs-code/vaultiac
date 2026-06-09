const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'vaultiac_jwt_secret_change_in_production';
const JWT_EXPIRES = '90d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Middleware — verify JWT
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// GET /api/auth/check-username?username=xxx
router.get('/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username required' });
  const clean = username.trim().replace(/\s+/g, '');
  if (clean.length < 2) return res.json({ available: false, reason: 'Too short — minimum 2 characters.' });
  if (clean.length > 30) return res.json({ available: false, reason: 'Too long — maximum 30 characters.' });
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [clean]);
    if (rows.length > 0) return res.json({ available: false, reason: 'Username already taken.' });
    return res.json({ available: true });
  } catch(e) {
    console.error('[auth] check-username error:', e.message, e.stack);
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'email, password, and username are required' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().replace(/\s+/g, '');

  if (cleanUsername.length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters.' });
  if (cleanUsername.length > 30) return res.status(400).json({ error: 'Username must be 30 characters or fewer.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  try {
    // Check email uniqueness
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // Check username uniqueness
    const usernameCheck = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    if (usernameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const notify_updates = req.body.notify_updates === true;
    const agreed_to_terms = req.body.agreed_to_terms === true;

    if (!agreed_to_terms) {
      return res.status(400).json({ error: 'You must agree to the Terms of Service to create an account.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, username, notify_updates, agreed_to_terms) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, username, notify_updates, created_at',
      [cleanEmail, password_hash, cleanUsername, notify_updates, agreed_to_terms]
    );
    const user = rows[0];

    // Also upsert into leaderboard so trivia works immediately
    await pool.query(
      `INSERT INTO leaderboard (username, total_points, current_streak, longest_streak, last_played_date, daily_play_date)
       VALUES ($1, 0, 0, 0, NULL, NULL) ON CONFLICT (username) DO NOTHING`,
      [cleanUsername]
    );

    const token = generateToken(user);
    return res.json({ token, user: { id: user.id, email: user.email, username: user.username, notify_updates: user.notify_updates } });

  } catch(e) {
    console.error('[auth] signup error:', e.message, e.stack);
    return res.status(500).json({ error: 'Server error during signup', detail: e.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (rows.length === 0) return res.status(401).json({ error: 'No account found with that email.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    const token = generateToken(user);
    return res.json({ token, user: { id: user.id, email: user.email, username: user.username } });

  } catch(e) {
    console.error('[auth] login error:', e.message, e.stack);
    return res.status(500).json({ error: 'Server error during login', detail: e.message });
  }
});

// GET /api/auth/me — verify token and return current user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, username, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } catch(e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, requireAuth };
