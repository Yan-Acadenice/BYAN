'use strict';

const crypto = require('crypto');
const { getDb } = require('../db');

module.exports = function registerGroupRoutes(router, auth) {
  router.get('/api/groups', auth.required, (req, res) => {
    const db = getDb();
    let groups;

    if (req.user.role === 'admin') {
      groups = db.prepare('SELECT * FROM groups ORDER BY name').all();
    } else {
      groups = db.prepare(`
        SELECT g.* FROM groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ?
        ORDER BY g.name
      `).all(req.user.id);
    }

    sendJson(res, 200, { data: groups, total: groups.length });
  });

  router.post('/api/groups', auth.required, (req, res) => {
    const { name, description } = req.body;
    if (!name) return sendError(res, 400, 'name is required', 'MISSING_FIELDS');

    const db = getDb();
    const existing = db.prepare('SELECT id FROM groups WHERE name = ?').get(name);
    if (existing) return sendError(res, 409, 'Group name already taken', 'GROUP_EXISTS');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const run = db.transaction(() => {
      db.prepare('INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)')
        .run(id, name, description || null, now);

      db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
        .run(id, req.user.id, 'admin');
    });

    run();
    sendJson(res, 201, { data: { id, name, description: description || null } });
  });

  router.get('/api/groups/:id', auth.required, (req, res) => {
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return sendError(res, 404, 'Group not found', 'NOT_FOUND');

    if (req.user.role !== 'admin') {
      const membership = db.prepare(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
      ).get(req.params.id, req.user.id);
      if (!membership) return sendError(res, 403, 'Not a member of this group', 'FORBIDDEN');
    }

    const members = db.prepare(`
      SELECT gm.user_id, gm.role, u.username, u.display_name
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
    `).all(req.params.id);

    sendJson(res, 200, { data: { ...group, members } });
  });

  router.put('/api/groups/:id', auth.required, (req, res) => {
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return sendError(res, 404, 'Group not found', 'NOT_FOUND');

    if (!isGroupAdmin(db, req.params.id, req.user)) {
      return sendError(res, 403, 'Group admin access required', 'FORBIDDEN');
    }

    const { name, description } = req.body;
    const fields = [];
    const values = [];

    if (name !== undefined) {
      const dup = db.prepare('SELECT id FROM groups WHERE name = ? AND id != ?').get(name, req.params.id);
      if (dup) return sendError(res, 409, 'Group name already taken', 'GROUP_EXISTS');
      fields.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }

    if (fields.length === 0) return sendError(res, 400, 'No fields to update', 'NO_CHANGES');

    values.push(req.params.id);
    db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    sendJson(res, 200, { data: updated });
  });

  router.delete('/api/groups/:id', auth.required, (req, res) => {
    const db = getDb();
    const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return sendError(res, 404, 'Group not found', 'NOT_FOUND');

    if (!isGroupAdmin(db, req.params.id, req.user)) {
      return sendError(res, 403, 'Group admin access required', 'FORBIDDEN');
    }

    db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { data: { deleted: true } });
  });

  router.post('/api/groups/:id/members', auth.required, (req, res) => {
    const { userId, role } = req.body;
    if (!userId) return sendError(res, 400, 'userId is required', 'MISSING_FIELDS');

    const memberRole = role || 'member';
    if (!['admin', 'member'].includes(memberRole)) {
      return sendError(res, 400, 'role must be "admin" or "member"', 'INVALID_ROLE');
    }

    const db = getDb();
    const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return sendError(res, 404, 'Group not found', 'NOT_FOUND');

    if (!isGroupAdmin(db, req.params.id, req.user)) {
      return sendError(res, 403, 'Group admin access required', 'FORBIDDEN');
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return sendError(res, 404, 'User not found', 'USER_NOT_FOUND');

    const existing = db.prepare(
      'SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(req.params.id, userId);
    if (existing) return sendError(res, 409, 'User is already a member', 'ALREADY_MEMBER');

    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
      .run(req.params.id, userId, memberRole);

    sendJson(res, 201, { data: { groupId: req.params.id, userId, role: memberRole } });
  });

  router.delete('/api/groups/:id/members/:userId', auth.required, (req, res) => {
    const db = getDb();
    const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return sendError(res, 404, 'Group not found', 'NOT_FOUND');

    if (!isGroupAdmin(db, req.params.id, req.user)) {
      return sendError(res, 403, 'Group admin access required', 'FORBIDDEN');
    }

    const membership = db.prepare(
      'SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(req.params.id, req.params.userId);
    if (!membership) return sendError(res, 404, 'Member not found', 'NOT_FOUND');

    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
      .run(req.params.id, req.params.userId);

    sendJson(res, 200, { data: { removed: true } });
  });
};

function isGroupAdmin(db, groupId, user) {
  if (user.role === 'admin') return true;
  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, user.id);
  return membership && membership.role === 'admin';
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, code });
}
