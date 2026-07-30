const express = require('express');
const pool = require('../db/db');
const { requireAuth } = require('./auth');
const router = express.Router();

const REQUIRED_FIELDS = ['show_name', 'city', 'state', 'zip', 'date_start', 'category'];
const MILES_PER_HOUR = 45;
const MAX_SUBMISSIONS_PER_DAY = 5;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

// Short, common-profanity-only list — intentionally not exhaustive.
const BAD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot', 'dick', 'piss', 'bastard', 'whore'];

async function geocode(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const place = data.places && data.places[0];
    if (!place) return null;
    return { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
  } catch (e) {
    return null;
  }
}

function geocodeZip(zip) {
  return geocode(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
}

function geocodeCityState(city, state) {
  return geocode(`https://api.zippopotam.us/us/${encodeURIComponent(state)}/${encodeURIComponent(city)}`);
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function isSimilar(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen >= DUPLICATE_SIMILARITY_THRESHOLD;
}

function containsProfanity(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some((w) => lower.includes(w));
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !isNaN(d.getTime());
}

// GET /api/card-shows/search
router.get('/search', async (req, res) => {
  const { zip, date, category } = req.query;
  const radiusMinutes = parseInt(req.query.radius_minutes, 10) || 90;
  if (!zip) return res.status(400).json({ error: 'zip is required' });

  const origin = await geocodeZip(zip);
  if (!origin) return res.status(400).json({ error: "That doesn't look like a valid US ZIP code." });

  const radiusMiles = (radiusMinutes * MILES_PER_HOUR) / 60;

  try {
    const params = [];
    let query = `SELECT * FROM card_shows WHERE status = 'published' AND lat IS NOT NULL AND lng IS NOT NULL AND COALESCE(date_end, date_start) >= CURRENT_DATE`;
    if (date) {
      params.push(date);
      query += ` AND date_start = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    const { rows } = await pool.query(query, params);

    const data = rows
      .map((r) => ({
        ...r,
        distance_miles: Math.round(haversineMiles(origin.lat, origin.lng, parseFloat(r.lat), parseFloat(r.lng)) * 10) / 10,
      }))
      .filter((r) => r.distance_miles <= radiusMiles)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    return res.json({ data });
  } catch (e) {
    console.error('[card-shows] search error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/card-shows/submit
router.post('/submit', requireAuth, async (req, res) => {
  const body = req.body || {};
  const { show_name, venue_name, city, state, zip, date_start, date_end, time_range, category, table_count, admission, notes } = body;

  // 1. Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!body[field] || String(body[field]).trim() === '') {
      return res.status(422).json({ reason: `Missing required field: ${field}` });
    }
  }

  // 2. Valid ZIP
  const geo = await geocodeZip(zip);
  if (!geo) {
    return res.status(422).json({ reason: "That doesn't look like a valid US ZIP code." });
  }

  // 3. Valid date
  const dateReason = 'Date must be a valid date between today and 18 months from now.';
  if (!isValidDateStr(date_start)) {
    return res.status(422).json({ reason: dateReason });
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(`${date_start}T00:00:00Z`);
  const maxDate = new Date(today);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + 18);
  if (startDate < today || startDate > maxDate) {
    return res.status(422).json({ reason: dateReason });
  }
  if (date_end && !isValidDateStr(date_end)) {
    return res.status(422).json({ reason: dateReason });
  }

  try {
    // 4. Duplicate check
    const dupCheck = await pool.query(
      `SELECT show_name, venue_name, date_start FROM card_shows
       WHERE status = 'published' AND zip = $1
       AND date_start BETWEEN $2::date - INTERVAL '1 day' AND $2::date + INTERVAL '1 day'`,
      [zip, date_start]
    );
    for (const existing of dupCheck.rows) {
      const nameMatch = isSimilar(show_name, existing.show_name);
      const venueMatch = venue_name && existing.venue_name && isSimilar(venue_name, existing.venue_name);
      if (nameMatch || venueMatch) {
        const existingDate = existing.date_start.toISOString().split('T')[0];
        return res.status(422).json({
          reason: `This looks like a duplicate of an existing show: ${existing.show_name} on ${existingDate}.`,
        });
      }
    }

    // 5. Spam/profanity filter
    if (containsProfanity(show_name) || containsProfanity(notes)) {
      return res.status(422).json({ reason: 'Submission contains inappropriate language.' });
    }

    // 6. Rate limit
    const rateCheck = await pool.query(
      `SELECT COUNT(*) FROM card_shows WHERE submitted_by = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.user.id]
    );
    if (parseInt(rateCheck.rows[0].count, 10) >= MAX_SUBMISSIONS_PER_DAY) {
      return res.status(422).json({ reason: "You've submitted the maximum of 5 shows in 24 hours. Try again tomorrow." });
    }

    const { rows } = await pool.query(
      `INSERT INTO card_shows
        (show_name, venue_name, city, state, zip, lat, lng, date_start, date_end, time_range, category, table_count, admission, notes, source, submitted_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'user_submission',$15,'published')
       RETURNING *`,
      [
        show_name,
        venue_name || null,
        city,
        state.trim().toUpperCase(),
        zip,
        geo.lat,
        geo.lng,
        date_start,
        date_end || date_start,
        time_range || null,
        category,
        table_count || null,
        admission || null,
        notes || null,
        req.user.id,
      ]
    );
    return res.json(rows[0]);
  } catch (e) {
    console.error('[card-shows] submit error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.geocodeZip = geocodeZip;
module.exports.geocodeCityState = geocodeCityState;
