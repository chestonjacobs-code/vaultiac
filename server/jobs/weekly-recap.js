const pool = require('../db/db');

function getWeekStart() {
  // Returns the most recent Sunday as YYYY-MM-DD (Eastern Time)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = now.getDay(); // 0 = Sunday
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return sunday.toISOString().slice(0, 10);
}

function getRecapMessage(rank, total) {
  if (total <= 1) return null; // No friends to compare against
  if (rank === 1) {
    return "Your friends can't compare to your Pokemon knowledge. First place this week.";
  } else if (rank === total) {
    return "You've got some work to do. Last place in your friend group this week. Time to grind.";
  } else if (rank === 2) {
    return "So close. Second place this week. One more streak day and you're on top.";
  } else {
    const mid = Math.ceil(total / 2);
    if (rank <= mid) {
      return `Top half of your friend group this week. Ranked #${rank} of ${total}.`;
    } else {
      return `Ranked #${rank} of ${total} this week. Your friends are pulling ahead.`;
    }
  }
}

async function generateWeeklyRecaps() {
  const weekStart = getWeekStart();
  console.log('[weekly-recap] Generating for week:', weekStart);

  try {
    // Get all users who have at least one friend
    const { rows: users } = await pool.query(`
      SELECT DISTINCT u.id, u.username
      FROM users u
      JOIN friendships f ON f.user_a_id = u.id OR f.user_b_id = u.id
    `);

    for (const user of users) {
      // Get friend group leaderboard (streak-based) including this user
      const { rows: board } = await pool.query(`
        WITH friend_ids AS (
          SELECT CASE WHEN user_a_id = $1 THEN user_b_id ELSE user_a_id END AS fid
          FROM friendships WHERE user_a_id = $1 OR user_b_id = $1
          UNION ALL SELECT $1
        )
        SELECT u.id, u.username, COALESCE(l.current_streak, 0) as streak
        FROM friend_ids fi
        JOIN users u ON u.id = fi.fid
        LEFT JOIN leaderboard l ON l.username = u.username
        ORDER BY streak DESC
      `, [user.id]);

      const total = board.length;
      const rankIdx = board.findIndex(r => r.id === user.id);
      const rank = rankIdx + 1;
      const message = getRecapMessage(rank, total);
      if (!message) continue;

      await pool.query(
        `INSERT INTO weekly_recaps (user_id, week_start, rank, total_friends, message, dismissed)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         ON CONFLICT (user_id, week_start) DO UPDATE SET rank = $3, total_friends = $4, message = $5, dismissed = FALSE`,
        [user.id, weekStart, rank, total, message]
      );
    }

    console.log('[weekly-recap] Done. Processed', users.length, 'users.');
  } catch (e) {
    console.error('[weekly-recap] Error:', e.message);
  }
}

module.exports = { generateWeeklyRecaps };
