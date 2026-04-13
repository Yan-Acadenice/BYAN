'use strict';

const crypto = require('crypto');
const { getDb } = require('../db');

function registerServer(data) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!data.name || !data.command) {
    throw Object.assign(new Error('name and command are required'), { code: 'MISSING_FIELDS' });
  }

  db.prepare(`
    INSERT INTO mcp_servers (id, name, description, command, args, env, transport, status, health_check_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || null,
    data.command,
    data.args ? JSON.stringify(data.args) : null,
    data.env ? JSON.stringify(data.env) : null,
    data.transport || 'stdio',
    data.healthCheckUrl || null,
    now, now
  );

  return getServer(id);
}

function listServers(options = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM mcp_servers ${where} ORDER BY name`).all(...params).map(parseServer);
}

function getServer(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
  return row ? parseServer(row) : null;
}

function updateServer(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(id);
  if (!existing) {
    throw Object.assign(new Error('MCP server not found'), { code: 'MCP_NOT_FOUND' });
  }

  const fields = [];
  const values = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.command !== undefined) { fields.push('command = ?'); values.push(data.command); }
  if (data.args !== undefined) { fields.push('args = ?'); values.push(JSON.stringify(data.args)); }
  if (data.env !== undefined) { fields.push('env = ?'); values.push(JSON.stringify(data.env)); }
  if (data.transport !== undefined) { fields.push('transport = ?'); values.push(data.transport); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.healthCheckUrl !== undefined) { fields.push('health_check_url = ?'); values.push(data.healthCheckUrl); }

  if (fields.length === 0) return getServer(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getServer(id);
}

function deleteServer(id) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(id);
  if (!existing) {
    throw Object.assign(new Error('MCP server not found'), { code: 'MCP_NOT_FOUND' });
  }
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  return { deleted: true };
}

function linkToProject(serverId, projectId, projectConfig) {
  const db = getDb();

  const server = db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(serverId);
  if (!server) {
    throw Object.assign(new Error('MCP server not found'), { code: 'MCP_NOT_FOUND' });
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    throw Object.assign(new Error('Project not found'), { code: 'PROJECT_NOT_FOUND' });
  }

  db.prepare(`
    INSERT OR REPLACE INTO project_mcp (project_id, mcp_server_id, config, enabled)
    VALUES (?, ?, ?, 1)
  `).run(projectId, serverId, projectConfig ? JSON.stringify(projectConfig) : null);

  return { projectId, serverId, linked: true };
}

function unlinkFromProject(serverId, projectId) {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM project_mcp WHERE project_id = ? AND mcp_server_id = ?'
  ).run(projectId, serverId);

  if (result.changes === 0) {
    throw Object.assign(new Error('Link not found'), { code: 'LINK_NOT_FOUND' });
  }
  return { deleted: true };
}

function getProjectServers(projectId) {
  const db = getDb();
  return db.prepare(`
    SELECT ms.*, pm.config AS project_config, pm.enabled
    FROM mcp_servers ms
    JOIN project_mcp pm ON pm.mcp_server_id = ms.id
    WHERE pm.project_id = ?
    ORDER BY ms.name
  `).all(projectId).map(row => {
    const server = parseServer(row);
    server.projectConfig = row.project_config ? JSON.parse(row.project_config) : null;
    server.enabled = !!row.enabled;
    return server;
  });
}

function injectContext(serverId, nodeId) {
  const db = getDb();
  const server = getServer(serverId);
  if (!server) return null;

  const tools = db.prepare(
    'SELECT name, description FROM mcp_tools WHERE mcp_server_id = ? ORDER BY name'
  ).all(serverId);

  const toolList = tools.length > 0
    ? tools.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n')
    : 'No tools registered yet.';

  return {
    server: { id: server.id, name: server.name, transport: server.transport },
    tools,
    contextString: `MCP Server: ${server.name}\nTransport: ${server.transport}\nAvailable Tools:\n${toolList}`
  };
}

function parseServer(row) {
  return {
    ...row,
    args: row.args ? JSON.parse(row.args) : null,
    env: row.env ? JSON.parse(row.env) : null
  };
}

module.exports = {
  registerServer,
  listServers,
  getServer,
  updateServer,
  deleteServer,
  linkToProject,
  unlinkFromProject,
  getProjectServers,
  injectContext
};
