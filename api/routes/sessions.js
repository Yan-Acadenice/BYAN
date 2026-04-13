'use strict';

const sessionStitcher = require('../services/session-stitcher');

module.exports = function registerSessionRoutes(router, auth) {

  router.post('/api/sessions', auth, (req, res) => {
    const { userId, projectId, nodeId, cliSource, agentName } = req.body;
    if (!cliSource) {
      return sendError(res, 400, 'cliSource is required', 'MISSING_FIELDS');
    }
    try {
      const data = sessionStitcher.startSession({ userId, projectId, nodeId, cliSource, agentName });
      sendJson(res, 201, { data });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'SESSION_START_FAILED');
    }
  });

  router.put('/api/sessions/:id/end', auth, (req, res) => {
    try {
      const data = sessionStitcher.endSession(req.params.id, req.body.summary);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'SESSION_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'SESSION_END_FAILED');
    }
  });

  router.get('/api/sessions', auth, (req, res) => {
    try {
      const data = sessionStitcher.listSessions({
        projectId: req.query.projectId,
        userId: req.query.userId,
        cliSource: req.query.cliSource,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined
      });
      sendJson(res, 200, { data, total: data.length });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'SESSION_LIST_FAILED');
    }
  });

  router.get('/api/sessions/:id', auth, (req, res) => {
    const data = sessionStitcher.getSession(req.params.id);
    if (!data) return sendError(res, 404, 'Session not found', 'NOT_FOUND');
    sendJson(res, 200, { data });
  });

  router.get('/api/sessions/:id/context', auth, (req, res) => {
    try {
      const session = sessionStitcher.getSession(req.params.id);
      if (!session) return sendError(res, 404, 'Session not found', 'NOT_FOUND');
      const data = sessionStitcher.getStitchedContext(req.params.id);
      sendJson(res, 200, { data });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'CONTEXT_FAILED');
    }
  });

  router.get('/api/sessions/:id/history', auth, (req, res) => {
    try {
      const session = sessionStitcher.getSession(req.params.id);
      if (!session) return sendError(res, 404, 'Session not found', 'NOT_FOUND');
      const data = sessionStitcher.getSessionChain(req.params.id);
      sendJson(res, 200, { data, total: data.length });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'HISTORY_FAILED');
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
