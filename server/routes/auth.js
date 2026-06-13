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

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    const { rows } = await pool.query('SELECT id, username FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    // Always return success to prevent email enumeration
    if (rows.length === 0) return res.json({ success: true });

    const user = rows[0];
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const resetUrl = `https://vaultiac.com/vaultiac-reset-password.html?token=${token}`;

    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Vaultiac <noreply@vaultiac.com>',
      to: email.trim().toLowerCase(),
      subject: 'Reset your Vaultiac password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0c0a10;color:#f3eee6;border-radius:16px;">
          <h2 style="font-size:24px;margin-bottom:8px;">Reset your password</h2>
          <p style="color:#9a93a6;margin-bottom:24px;">Hi ${user.username}, click the button below to reset your Vaultiac password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(90deg,#7ce8d6,#f0a6c8);color:#0c0a10;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;">Reset Password</a>
          <p style="color:#9a93a6;font-size:12px;margin-top:24px;">If you didn't request this, ignore this email. Your password won't change.</p>
        </div>
      `
    });

    return res.json({ success: true });
  } catch(e) {
    console.error('[auth] forgot-password error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

    const reset = rows[0];
    const password_hash = await bcrypt.hash(password, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);

    return res.json({ success: true });
  } catch(e) {
    console.error('[auth] reset-password error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, requireAuth };
