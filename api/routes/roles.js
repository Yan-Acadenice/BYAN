'use strict';

const crypto = require('crypto');
const { getDb } = require('../db');

module.exports = function registerRoleRoutes(router, auth, rbac) {
  router.get('/api/projects/:id/roles', auth.required, (req, res) => {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return sendError(res, 404, 'Project not found', 'NOT_FOUND');

    if (req.user.role !== 'admin') {
      const effective = rbac.getEffectiveRole(req.user.id, req.params.id);
      if (effective !== 'owner') {
        return sendError(res, 403, 'Only project owners can manage roles', 'FORBIDDEN');
      }
    }

    const roles = db.prepare(`
      SELECT pr.rowid as roleId, pr.project_id, pr.user_id, pr.group_id, pr.role, pr.created_at,
             u.username as user_username, u.display_name as user_display_name,
             g.name as group_name
      FROM project_roles pr
      LEFT JOIN users u ON u.id = pr.user_id
      LEFT JOIN groups g ON g.id = pr.group_id
      WHERE pr.project_id = ?
    `).all(req.params.id);

    sendJson(res, 200, { data: roles, total: roles.length });
  });

  router.post('/api/projects/:id/roles', auth.required, (req, res) => {
    const { userId, groupId, role } = req.body;

    if (!userId && !groupId) {
      return sendError(res, 400, 'userId or groupId is required', 'MISSING_FIELDS');
    }
    if (!role || !['owner', 'editor', 'viewer', 'agent-only'].includes(role)) {
      return sendError(res, 400, 'Valid role is required (owner, editor, viewer, agent-only)', 'INVALID_ROLE');
    }

    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return sendError(res, 404, 'Project not found', 'NOT_FOUND');

    if (req.user.role !== 'admin') {
      const effective = rbac.getEffectiveRole(req.user.id, req.params.id);
      if (effective !== 'owner') {
        return sendError(res, 403, 'Only project owners can manage roles', 'FORBIDDEN');
      }
    }

    if (userId) {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) return sendError(res, 404, 'User not found', 'USER_NOT_FOUND');
    }
    if (groupId) {
      const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
      if (!group) return sendError(res, 404, 'Group not found', 'GROUP_NOT_FOUND');
    }

    try {
      db.prepare(`
        INSERT INTO project_roles (project_id, user_id, group_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.params.id, userId || null, groupId || null, role, new Date().toISOString());

      sendJson(res, 201, { data: { projectId: req.params.id, userId, groupId, role } });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return sendError(res, 409, 'Role already assigned', 'ROLE_EXISTS');
      }
      sendError(res, 500, err.message, 'ASSIGN_FAILED');
    }
  });

  router.put('/api/projects/:id/roles/:roleId', auth.required, (req, res) => {
    const { role } = req.body;
    if (!role || !['owner', 'editor', 'viewer', 'agent-only'].includes(role)) {
      return sendError(res, 400, 'Valid role is required', 'INVALID_ROLE');
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT rowid, * FROM project_roles WHERE rowid = ? AND project_id = ?'
    ).get(req.params.roleId, req.params.id);
    if (!existing) return sendError(res, 404, 'Role assignment not found', 'NOT_FOUND');

    if (req.user.role !== 'admin') {
      const effective = rbac.getEffectiveRole(req.user.id, req.params.id);
      if (effective !== 'owner') {
        return sendError(res, 403, 'Only project owners can manage roles', 'FORBIDDEN');
      }
    }

    db.prepare('UPDATE project_roles SET role = ? WHERE rowid = ?')
      .run(role, req.params.roleId);

    sendJson(res, 200, { data: { roleId: req.params.roleId, role } });
  });

  router.delete('/api/projects/:id/roles/:roleId', auth.required, (req, res) => {
    const db = getDb();
    const existing = db.prepare(
      'SELECT rowid FROM project_roles WHERE rowid = ? AND project_id = ?'
    ).get(req.params.roleId, req.params.id);
    if (!existing) return sendError(res, 404, 'Role assignment not found', 'NOT_FOUND');

    if (req.user.role !== 'admin') {
      const effective = rbac.getEffectiveRole(req.user.id, req.params.id);
      if (effective !== 'owner') {
        return sendError(res, 403, 'Only project owners can manage roles', 'FORBIDDEN');
      }
    }

    db.prepare('DELETE FROM project_roles WHERE rowid = ?').run(req.params.roleId);
    sendJson(res, 200, { data: { deleted: true } });
  });
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, code });
}
