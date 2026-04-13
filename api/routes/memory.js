'use strict';

const memoryStore = require('../services/memory-store');

module.exports = function registerMemoryRoutes(router, auth) {

  router.post('/api/memory', auth, (req, res) => {
    const { projectId, nodeId, userId, cliSource, sessionId, category, content, metadata, pinned } = req.body;
    if (!content) {
      return sendError(res, 400, 'content is required', 'MISSING_FIELDS');
    }
    try {
      const memory = memoryStore.store({ projectId, nodeId, userId, cliSource, sessionId, category, content, metadata, pinned });
      sendJson(res, 201, { data: memory });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'STORE_FAILED');
    }
  });

  router.get('/api/memory', auth, (req, res) => {
    try {
      const query = {
        projectId: req.query.projectId,
        nodeId: req.query.nodeId,
        category: req.query.category,
        layer: req.query.layer,
        cliSource: req.query.cliSource,
        sessionId: req.query.sessionId,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
        includePinned: req.query.includePinned === 'true'
      };
      const data = memoryStore.recall(query);
      sendJson(res, 200, { data, total: data.length });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'RECALL_FAILED');
    }
  });

  router.get('/api/memory/search', auth, (req, res) => {
    if (!req.query.q) {
      return sendError(res, 400, 'q parameter is required', 'MISSING_FIELDS');
    }
    try {
      const data = memoryStore.search(req.query.q, {
        projectId: req.query.projectId,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined
      });
      sendJson(res, 200, { data, total: data.length });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'SEARCH_FAILED');
    }
  });

  router.get('/api/memory/context-window', auth, (req, res) => {
    if (!req.query.nodeId) {
      return sendError(res, 400, 'nodeId parameter is required', 'MISSING_FIELDS');
    }
    try {
      const maxTokens = req.query.maxTokens ? parseInt(req.query.maxTokens, 10) : undefined;
      const data = memoryStore.buildContextWindow(req.query.nodeId, maxTokens);
      sendJson(res, 200, { data });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'CONTEXT_FAILED');
    }
  });

  router.get('/api/memory/:id', auth, (req, res) => {
    const memory = memoryStore.getMemory(req.params.id);
    if (!memory) return sendError(res, 404, 'Memory not found', 'NOT_FOUND');
    sendJson(res, 200, { data: memory });
  });

  router.put('/api/memory/:id', auth, (req, res) => {
    try {
      const data = memoryStore.updateMemory(req.params.id, req.body);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MEMORY_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'UPDATE_FAILED');
    }
  });

  router.delete('/api/memory/:id', auth, (req, res) => {
    try {
      const data = memoryStore.deleteMemory(req.params.id);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MEMORY_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'DELETE_FAILED');
    }
  });

  router.post('/api/memory/:id/promote', auth, (req, res) => {
    const { layer } = req.body;
    if (!layer) {
      return sendError(res, 400, 'layer is required', 'MISSING_FIELDS');
    }
    try {
      const data = memoryStore.promote(req.params.id, layer);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MEMORY_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      if (err.code === 'INVALID_LAYER' || err.code === 'INVALID_PROMOTION') return sendError(res, 400, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'PROMOTE_FAILED');
    }
  });

  router.post('/api/memory/:id/pin', auth, (req, res) => {
    try {
      const data = memoryStore.pin(req.params.id);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MEMORY_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'PIN_FAILED');
    }
  });

  router.delete('/api/memory/:id/pin', auth, (req, res) => {
    try {
      const data = memoryStore.unpin(req.params.id);
      sendJson(res, 200, { data });
    } catch (err) {
      if (err.code === 'MEMORY_NOT_FOUND') return sendError(res, 404, err.message, err.code);
      sendError(res, 500, err.message, err.code || 'UNPIN_FAILED');
    }
  });

  router.post('/api/memory/decay', auth, (req, res) => {
    try {
      const data = memoryStore.decay();
      sendJson(res, 200, { data });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'DECAY_FAILED');
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
