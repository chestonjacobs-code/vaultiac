const express = require('express');
const crypto = require('crypto');
const pool = require('../db/db');
const { requireAuth } = require('./auth');
const router = express.Router();

const MAX_NAME_LENGTH = 40;

function cleanName(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

// POST /api/groups — create a new group (creator auto-joins as a member)
router.post('/', requireAuth, async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) {
    return res.status(400).json({ error: `Group name is required and must be ${MAX_NAME_LENGTH} characters or fewer.` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO groups (name, creator_id) VALUES ($1, $2) RETURNING id, name',
      [name, req.user.id]
    );
    const group = rows[0];
    await client.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );
    await client.query('COMMIT');
    return res.json({ id: group.id, name: group.name });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[groups] create error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/groups — list groups the current user belongs to
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.creator_id,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
       ORDER BY g.created_at ASC`,
      [req.user.id]
    );
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      member_count: parseInt(r.member_count),
      is_creator: r.creator_id === req.user.id,
    }));
    return res.json({ data });
  } catch (e) {
    console.error('[groups] list error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/groups/invite-info/:token — join-preview info (no auth required)
router.get('/invite-info/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.name,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM group_invites gi
       JOIN groups g ON g.id = gi.group_id
       WHERE gi.token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invite not found.' });
    return res.json({ name: rows[0].name, member_count: parseInt(rows[0].member_count) });
  } catch (e) {
    console.error('[groups] invite-info error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/join/:token — join a group via invite link
router.post('/join/:token', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT group_id FROM group_invites WHERE token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invite not found.' });
    const groupId = rows[0].group_id;
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, req.user.id]
    );
    return res.json({ success: true, group_id: groupId });
  } catch (e) {
    console.error('[groups] join error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/groups/:id — group detail (members-only)
router.get('/:id', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  try {
    // Check the group exists before membership — otherwise a deleted group
    // (whose group_members rows are cascade-deleted along with it) always
    // reports 403 "not a member" instead of 404, even for its own creator.
    const groupRes = await pool.query(
      `SELECT g.id, g.name, g.creator_id, u.username AS creator_username
       FROM groups g
       JOIN users u ON u.id = g.creator_id
       WHERE g.id = $1`,
      [groupId]
    );
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    const group = groupRes.rows[0];

    const membership = await pool.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    const membersRes = await pool.query(
      `SELECT u.username, u.avatar_url
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );
    const members = membersRes.rows.map(m => ({
      username: m.username,
      avatar_url: m.avatar_url,
      is_creator: m.username === group.creator_username,
    }));

    return res.json({
      id: group.id,
      name: group.name,
      creator_username: group.creator_username,
      members,
    });
  } catch (e) {
    console.error('[groups] detail error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:id/members — creator adds an existing friend to the group
router.post('/:id/members', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'username is required.' });
  }
  try {
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    if (groupRes.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can add members.' });
    }

    const userRes = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const targetId = userRes.rows[0].id;

    const a = Math.min(req.user.id, targetId);
    const b = Math.max(req.user.id, targetId);
    const friendCheck = await pool.query(
      'SELECT id FROM friendships WHERE user_a_id = $1 AND user_b_id = $2',
      [a, b]
    );
    if (friendCheck.rows.length === 0) {
      return res.status(400).json({ error: 'You can only add existing friends to a group.' });
    }

    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, targetId]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error('[groups] add member error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/groups/:id/members/:username — creator removes a member, or a member leaves
router.delete('/:id/members/:username', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const { username } = req.params;
  try {
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    const creatorId = groupRes.rows[0].creator_id;

    const userRes = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const targetId = userRes.rows[0].id;

    const requesterIsCreator = req.user.id === creatorId;
    const requesterIsTarget = req.user.id === targetId;

    if (requesterIsCreator && targetId === creatorId) {
      return res.status(400).json({ error: 'The creator cannot leave the group — delete the group instead.' });
    }
    if (!requesterIsCreator && !requesterIsTarget) {
      return res.status(403).json({ error: 'You can only remove yourself, or the creator can remove others.' });
    }

    await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, targetId]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error('[groups] remove member error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:id/invite — get or create an invite token for the group
router.post('/:id/invite', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const membership = await pool.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    const existing = await pool.query('SELECT token FROM group_invites WHERE group_id = $1', [groupId]);
    if (existing.rows.length > 0) {
      return res.json({ token: existing.rows[0].token });
    }
    const token = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    await pool.query(
      'INSERT INTO group_invites (group_id, token) VALUES ($1, $2)',
      [groupId, token]
    );
    return res.json({ token });
  } catch (e) {
    console.error('[groups] invite error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/groups/:id — rename group (creator only)
router.patch('/:id', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const name = cleanName(req.body.name);
  if (!name) {
    return res.status(400).json({ error: `Group name is required and must be ${MAX_NAME_LENGTH} characters or fewer.` });
  }
  try {
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    if (groupRes.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can rename the group.' });
    }
    await pool.query('UPDATE groups SET name = $1 WHERE id = $2', [name, groupId]);
    return res.json({ success: true, id: parseInt(groupId), name });
  } catch (e) {
    console.error('[groups] rename error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/groups/:id — delete group (creator only; cascades to members + invites)
router.delete('/:id', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  try {
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    if (groupRes.rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can delete the group.' });
    }
    await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    return res.json({ success: true });
  } catch (e) {
    console.error('[groups] delete error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
