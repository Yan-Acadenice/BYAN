'use strict';

const { getDb } = require('../db');

const ROLE_HIERARCHY = { 'owner': 4, 'editor': 3, 'viewer': 2, 'agent-only': 1 };

function getEffectiveRole(userId, projectId) {
  const db = getDb();

  const directRole = db.prepare(
    'SELECT role FROM project_roles WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);

  if (directRole) return directRole.role;

  const groupRoles = db.prepare(`
    SELECT pr.role FROM project_roles pr
    JOIN group_members gm ON gm.group_id = pr.group_id
    WHERE pr.project_id = ? AND gm.user_id = ?
  `).all(projectId, userId);

  if (groupRoles.length === 0) return null;

  let best = null;
  for (const gr of groupRoles) {
    if (!best || ROLE_HIERARCHY[gr.role] > ROLE_HIERARCHY[best]) {
      best = gr.role;
    }
  }
  return best;
}

function meetsMinimum(effectiveRole, minimumRole) {
  if (!effectiveRole) return false;
  return ROLE_HIERARCHY[effectiveRole] >= ROLE_HIERARCHY[minimumRole];
}

function createRbac() {
  function projectRole(minimumRole) {
    return function(req, res, next) {
      if (!req.user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
      }

      if (req.user.role === 'admin') return next();

      const projectId = req.params.id || req.params.projectId || req.body.projectId;
      if (!projectId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Project ID required', code: 'MISSING_PROJECT' }));
      }

      const effective = getEffectiveRole(req.user.id, projectId);
      if (!meetsMinimum(effective, minimumRole)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: `Requires ${minimumRole} role or higher`,
          code: 'INSUFFICIENT_ROLE'
        }));
      }

      req.projectRole = effective;
      next();
    };
  }

  function nodeAccess(minimumRole) {
    return function(req, res, next) {
      if (!req.user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
      }

      if (req.user.role === 'admin') return next();

      const nodeId = req.params.id;
      if (!nodeId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Node ID required', code: 'MISSING_NODE' }));
      }

      const db = getDb();
      const node = db.prepare('SELECT project_id FROM nodes WHERE id = ?').get(nodeId);
      if (!node) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Node not found', code: 'NOT_FOUND' }));
      }

      const effective = getEffectiveRole(req.user.id, node.project_id);
      if (!meetsMinimum(effective, minimumRole)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: `Requires ${minimumRole} role or higher`,
          code: 'INSUFFICIENT_ROLE'
        }));
      }

      req.projectRole = effective;
      next();
    };
  }

  return { projectRole, nodeAccess, getEffectiveRole };
}

module.exports = createRbac;
