'use strict';

const mcpProxy = require('../services/mcp-proxy');

module.exports = function registerMcpRoutes(router, auth) {

  router.get('/api/mcp/servers', auth, (req, res) => {
    try {
      const data = mcpProxy.listServers({ status: req.query.status });
      sendJson(res, 200, { data, total: data.length });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'LIST_FAILED');
    }
  });

  router.post('/api/mcp/servers', auth, (req, res) => {
    const { name, description, command, args, env, transport, healthCheckUrl } = req.body;
    if (!name || !command) {
      return sendError(res, 400, 'name and command are required', 'MISSING_FIELDS');
    }
    try {
      const data = mcpProxy.registerServer({ name, description, command, args, env, transport, healthCheckUrl });
      sendJson(res, 201, { data });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'REGISTER_FAILED');
    }
  });

  router.get('/api/mcp/servers/:id', auth, (req, res) => {
    const data = mcpProxy.getServer(req.params.id);
    if (!data) return sendError(res, 404, 'MCP server not found', 'NOT_FOUND');
    sendJson(res, 200, { data });
  });

  router.put('/api/mcp/servers/:id', auth, (req, res) => {
    try {
      const data = mcpProxy.updateServer(req.params.id, req.body);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MCP_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'UPDATE_FAILED');
    }
  });

  router.delete('/api/mcp/servers/:id', auth, (req, res) => {
    try {
      const data = mcpProxy.deleteServer(req.params.id);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MCP_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'DELETE_FAILED');
    }
  });

  router.post('/api/mcp/servers/:id/link', auth, (req, res) => {
    const { projectId, config: projectConfig } = req.body;
    if (!projectId) {
      return sendError(res, 400, 'projectId is required', 'MISSING_FIELDS');
    }
    try {
      const data = mcpProxy.linkToProject(req.params.id, projectId, projectConfig);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MCP_NOT_FOUND' || err.code === 'PROJECT_NOT_FOUND') {
        return sendError(res, 404, err.message, err.code);
      }
      sendError(res, 500, err.message, err.code || 'LINK_FAILED');
    }
  });

  router.delete('/api/mcp/servers/:id/link/:projectId', auth, (req, res) => {
    try {
      const data = mcpProxy.unlinkFromProject(req.params.id, req.params.projectId);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'LINK_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'UNLINK_FAILED');
    }
  });

  router.get('/api/mcp/projects/:projectId', auth, (req, res) => {
    try {
      const data = mcpProxy.getProjectServers(req.params.projectId);
      sendJson(res, 200, { data, total: data.length });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'LIST_FAILED');
    }
  });
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, code });
}
