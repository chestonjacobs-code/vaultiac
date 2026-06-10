const express = require('express');
const { Resend } = require('resend');
const pool = require('../db/db');
const router = express.Router();

const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware — require admin secret
function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/admin/notify
// Body: { subject: string, message: string }
router.post('/notify', requireAdmin, async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'subject and message are required.' });
  }

  // Fetch all opted-in users
  const { rows: users } = await pool.query(
    'SELECT email, username FROM users WHERE notify_updates = true'
  );

  if (users.length === 0) {
    return res.json({ sent: 0, message: 'No opted-in users found.' });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const user of users) {
    try {
      await resend.emails.send({
        from: 'Vaultiac <onboarding@resend.dev>',
        to: user.email,
        subject: subject,
        html: buildEmail(user.username, message),
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: user.email, error: err.message });
      console.error(`[admin/notify] Failed to send to ${user.email}:`, err.message);
    }
  }

  console.log(`[admin/notify] Blast complete — sent: ${results.sent}, failed: ${results.failed}`);
  res.json(results);
});

// GET /api/admin/notify-count — how many opted-in users
router.get('/notify-count', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM users WHERE notify_updates = true');
  res.json({ count: parseInt(rows[0].count) });
});

function buildEmail(username, message) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0c0a10;padding:24px 32px;">
            <span style="font-size:20px;font-weight:900;letter-spacing:.08em;color:#e8c27a;">VAULTIAC</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 16px;">Hi ${username},</p>
            ${message.split('\n').map(p => p.trim() ? `<p style="margin:0 0 16px;">${p}</p>` : '').join('')}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #eeeeee;color:#999999;font-size:12px;line-height:1.6;">
            You're receiving this because you signed up for updates at vaultiac.com.<br/>
            &copy; ${new Date().getFullYear()} Vaultiac
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = router;
