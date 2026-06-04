const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// POST /api/contact
router.post('/', async (req, res) => {
  const { name, email, message, type } = req.body;

  if (!name || !message) {
    return res.status(400).json({ error: 'Name and message are required.' });
  }

  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValid) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.CONTACT_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const typeLabel = type || 'General';
    const replyLine = email ? `Reply-To: ${email}` : 'No reply email provided';

    await transporter.sendMail({
      from: `"Vaultiac Feedback" <${process.env.CONTACT_EMAIL}>`,
      to: process.env.CONTACT_EMAIL,
      subject: `[Vaultiac] ${typeLabel} — from ${name}`,
      text: `Type: ${typeLabel}\nName: ${name}\nEmail: ${email || 'not provided'}\n\n${message}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#e8c27a;margin-bottom:4px;">Vaultiac Feedback</h2>
          <p style="color:#888;font-size:13px;margin-top:0;">${typeLabel}</p>
          <hr style="border:1px solid #eee;margin:16px 0;"/>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email || '<em>not provided</em>'}</p>
          <p><strong>Message:</strong></p>
          <p style="background:#f9f9f9;padding:12px 16px;border-radius:8px;border-left:3px solid #e8c27a;">${message.replace(/\n/g, '<br/>')}</p>
          <hr style="border:1px solid #eee;margin:16px 0;"/>
          <p style="color:#aaa;font-size:11px;">${replyLine}</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[contact] Email send failed:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
