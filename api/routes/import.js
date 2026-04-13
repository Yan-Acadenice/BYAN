'use strict';

const projectScanner = require('../services/project-scanner');

module.exports = function registerImportRoutes(router, auth) {
  router.post('/api/import/scan', auth.required, (req, res) => {
    const { path: projectPath } = req.body;
    if (!projectPath) return sendError(res, 400, 'path is required', 'MISSING_FIELDS');

    try {
      const result = projectScanner.scanProject(projectPath);
      sendJson(res, 200, { data: result });
    } catch (err) {
      const status = err.code === 'PATH_NOT_FOUND' ? 404 : 500;
      sendError(res, status, err.message, err.code || 'SCAN_FAILED');
    }
  });

  router.post('/api/import/project', auth.required, (req, res) => {
    const { path: projectPath, name, type } = req.body;
    if (!projectPath) return sendError(res, 400, 'path is required', 'MISSING_FIELDS');

    try {
      const result = projectScanner.importProject(projectPath, req.user.id, { name, type });
      sendJson(res, 201, { data: result });
    } catch (err) {
      const status = err.code === 'PATH_NOT_FOUND' ? 404 : 500;
      sendError(res, status, err.message, err.code || 'IMPORT_FAILED');
    }
  });

  router.post('/api/import/dry-run', auth.required, (req, res) => {
    const { path: projectPath, type } = req.body;
    if (!projectPath) return sendError(res, 400, 'path is required', 'MISSING_FIELDS');

    try {
      const result = projectScanner.dryRun(projectPath, { type });
      sendJson(res, 200, { data: result });
    } catch (err) {
      const status = err.code === 'PATH_NOT_FOUND' ? 404 : 500;
      sendError(res, status, err.message, err.code || 'DRY_RUN_FAILED');
    }
  });

  router.post('/api/import/multi', auth.required, (req, res) => {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return sendError(res, 400, 'paths array is required', 'MISSING_FIELDS');
    }

    const results = [];
    const errors = [];

    for (const projectPath of paths) {
      try {
        const result = projectScanner.importProject(projectPath, req.user.id);
        results.push({ path: projectPath, ...result });
      } catch (err) {
        errors.push({ path: projectPath, error: err.message, code: err.code });
      }
    }

    sendJson(res, 200, { data: { imported: results, errors } });
  });

  router.post('/api/import/soul', auth.required, (req, res) => {
    const { agentPath } = req.body;
    if (!agentPath) return sendError(res, 400, 'agentPath is required', 'MISSING_FIELDS');

    try {
      const result = projectScanner.importSoul(agentPath);
      sendJson(res, 200, { data: result });
    } catch (err) {
      const status = err.code === 'PATH_NOT_FOUND' ? 404 : 500;
      sendError(res, status, err.message, err.code || 'SOUL_IMPORT_FAILED');
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
