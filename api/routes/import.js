'use strict';

const projectScanner = require('../services/project-scanner');
const { decodeFilesPayload } = require('../services/files-payload');

module.exports = function registerImportRoutes(router, auth) {
  router.post('/api/import/scan', auth.required, (req, res) => {
    const { path: projectPath, files, name, type, projectName } = req.body || {};

    const mode = resolveMode(projectPath, files);
    if (mode.error) return sendError(res, 400, mode.error.message, mode.error.code);

    try {
      let result;
      if (mode.kind === 'files') {
        const fileMap = decodeFilesPayload(files);
        result = projectScanner.scanFromFiles(fileMap, {
          name: name || projectName,
          type,
          projectName
        });
      } else {
        result = projectScanner.scanProject(projectPath, { name, type });
      }
      sendJson(res, 200, { data: result });
    } catch (err) {
      const status = errToStatus(err, 'SCAN_FAILED');
      sendError(res, status.code, err.message, err.code || 'SCAN_FAILED');
    }
  });

  router.post('/api/import/project', auth.required, (req, res) => {
    const { path: projectPath, files, name, type, projectName } = req.body || {};

    const mode = resolveMode(projectPath, files);
    if (mode.error) return sendError(res, 400, mode.error.message, mode.error.code);

    try {
      let result;
      if (mode.kind === 'files') {
        const fileMap = decodeFilesPayload(files);
        result = projectScanner.importFromFiles(fileMap, req.user.id, {
          name: name || projectName,
          type,
          projectName
        });
      } else {
        result = projectScanner.importProject(projectPath, req.user.id, { name, type });
      }
      sendJson(res, 201, { data: result });
    } catch (err) {
      const status = errToStatus(err, 'IMPORT_FAILED');
      sendError(res, status.code, err.message, err.code || 'IMPORT_FAILED');
    }
  });

  router.post('/api/import/dry-run', auth.required, (req, res) => {
    const { path: projectPath, files, name, type, projectName } = req.body || {};

    const mode = resolveMode(projectPath, files);
    if (mode.error) return sendError(res, 400, mode.error.message, mode.error.code);

    try {
      let result;
      if (mode.kind === 'files') {
        const fileMap = decodeFilesPayload(files);
        result = projectScanner.dryRunFromFiles(fileMap, {
          name: name || projectName,
          type,
          projectName
        });
      } else {
        result = projectScanner.dryRun(projectPath, { name, type });
      }
      sendJson(res, 200, { data: result });
    } catch (err) {
      const status = errToStatus(err, 'DRY_RUN_FAILED');
      sendError(res, status.code, err.message, err.code || 'DRY_RUN_FAILED');
    }
  });

  router.post('/api/import/multi', auth.required, (req, res) => {
    const { paths } = req.body || {};
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
    const { agentPath } = req.body || {};
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

function resolveMode(projectPath, files) {
  const hasPath = projectPath !== undefined && projectPath !== null && projectPath !== '';
  const hasFiles = files !== undefined && files !== null;

  if (hasPath && hasFiles) {
    return { error: { message: 'Provide either path OR files, not both', code: 'MISSING_FIELDS' } };
  }
  if (!hasPath && !hasFiles) {
    return { error: { message: 'path or files is required', code: 'MISSING_FIELDS' } };
  }
  return { kind: hasFiles ? 'files' : 'path' };
}

function errToStatus(err, fallbackCode) {
  if (err.code === 'PATH_NOT_FOUND') return { code: 404 };
  if (err.code === 'INVALID_PAYLOAD' || err.status === 400) return { code: 400 };
  if (err.code === 'TOO_MANY_FILES' || err.code === 'PAYLOAD_TOO_LARGE') return { code: 413 };
  return { code: 500 };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, code });
}
