/**
 * BYAN WebUI REST API handlers.
 * Each handler receives (req, res, server) where server is ByanWebUI instance.
 */

let yanstaller = null;
let detector = null;
let backuper = null;
let sttEngine = null;
let AgentPackager = null;
let ConversationExporter = null;
let GistClient = null;

try { yanstaller = require('../../lib/yanstaller'); } catch { yanstaller = null; }
try { detector = require('../../lib/yanstaller/detector'); } catch { detector = null; }
try { backuper = require('../../lib/yanstaller/backuper'); } catch { backuper = null; }
try { sttEngine = require('../../lib/stt/engine'); } catch { sttEngine = null; }
try { AgentPackager = require('../../lib/exchange/agent-packager'); } catch { AgentPackager = null; }
try { ConversationExporter = require('../../lib/exchange/conversation-exporter'); } catch { ConversationExporter = null; }
try { GistClient = require('../../lib/exchange/gist-client'); } catch { GistClient = null; }

const fs = require('fs');
const path = require('path');

const { createBridge } = require('./chat/bridge');
const { detectCLIs, detectAgents } = require('./chat/cli-detector');
const SessionManager = require('./chat/session-manager');

const activeBridges = new Map();
let sessionManagerInstance = null;

function getSessionManager(server) {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(server.projectRoot);
  }
  return sessionManagerInstance;
}

function sendToSessionClients(server, sessionId, data) {
  const payload = JSON.stringify(data);
  for (const client of server.clients) {
    if (client.readyState === 1) {
      if (!client._chatSessionId || client._chatSessionId === sessionId) {
        client.send(payload);
      }
    }
  }
}

function json(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data));
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')
    );
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function isByanInstalled(projectRoot) {
  return fs.existsSync(path.join(projectRoot, '_bmad'));
}

function detectPlatforms(projectRoot) {
  const found = [];
  const checks = [
    { name: 'copilot-cli', path: '.github/agents' },
    { name: 'vscode', path: '.vscode' },
    { name: 'claude', path: '.claude' },
    { name: 'codex', path: '.codex/prompts' }
  ];
  for (const check of checks) {
    if (fs.existsSync(path.join(projectRoot, check.path))) {
      found.push(check.name);
    }
  }
  return found;
}

const routes = {
  'GET status': async (req, res, server) => {
    const projectRoot = server.projectRoot;
    const version = readPackageVersion();
    const installed = isByanInstalled(projectRoot);

    let platforms = detectPlatforms(projectRoot);
    let detectionResult = null;

    if (detector) {
      try {
        detectionResult = await detector.detect();
        platforms = detectionResult.platforms
          .filter(p => p.detected)
          .map(p => p.name);
      } catch {
        // Fallback to fs-based detection
      }
    }

    json(res, 200, {
      version,
      installed,
      platforms,
      detection: detectionResult,
      sttEngine: sttEngine ? 'available' : 'not-installed',
      projectRoot
    });
  },

  'GET update/check': async (req, res, server) => {
    const version = readPackageVersion();

    // Simulated update check; real implementation would query npm registry
    json(res, 200, {
      updateAvailable: false,
      installed: version,
      latest: version,
      changes: []
    });
  },

  'POST install': async (req, res, server) => {
    json(res, 200, { status: 'started' });

    const config = req.body || {};
    const projectRoot = server.projectRoot;
    const steps = [
      'Detecting environment',
      'Validating prerequisites',
      'Creating directory structure',
      'Installing core module',
      'Installing selected modules',
      'Configuring platforms',
      'Generating agent stubs',
      'Writing configuration',
      'Validating installation'
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        server.broadcastProgress(i + 1, steps.length, steps[i]);
        server.broadcastLog('info', steps[i] + '...');
        await sleep(300);
      }

      if (yanstaller) {
        try {
          await yanstaller.install({
            mode: config.mode || 'full',
            platforms: config.platforms,
            yes: true,
            projectRoot
          });
        } catch (err) {
          server.broadcastLog('warn', `Yanstaller: ${err.message} (continuing with stub install)`);
        }
      }

      ensureDirectoryStructure(projectRoot);
      writeBaseConfig(projectRoot, config);

      server.broadcastProgress(steps.length, steps.length, 'Complete');
      server.broadcastComplete(true, {
        message: 'BYAN installed successfully',
        projectRoot,
        mode: config.mode || 'auto',
        platforms: config.platforms || detectPlatforms(projectRoot)
      });
    } catch (err) {
      server.broadcastLog('error', err.message);
      server.broadcastComplete(false, { message: err.message });
    }
  },

  'POST update': async (req, res, server) => {
    json(res, 200, { status: 'started' });

    const steps = [
      'Checking current version',
      'Creating backup',
      'Downloading update',
      'Applying changes',
      'Merging configuration',
      'Validating update'
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        server.broadcastProgress(i + 1, steps.length, steps[i]);
        server.broadcastLog('info', steps[i] + '...');
        await sleep(400);
      }

      if (yanstaller && yanstaller.update) {
        try {
          await yanstaller.update('latest');
        } catch (err) {
          server.broadcastLog('warn', `Update module: ${err.message}`);
        }
      }

      server.broadcastComplete(true, { message: 'BYAN updated successfully' });
    } catch (err) {
      server.broadcastLog('error', err.message);
      server.broadcastComplete(false, { message: err.message });
    }
  },

  'POST rollback': async (req, res, server) => {
    const { backupPath } = req.body || {};

    if (!backuper) {
      json(res, 503, { error: 'Backup module not available' });
      return;
    }

    try {
      const targetPath = path.join(server.projectRoot, '_bmad');
      await backuper.restore(backupPath, targetPath);
      json(res, 200, { success: true, message: 'Rollback complete' });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET backups': async (req, res, server) => {
    if (!backuper) {
      json(res, 200, { backups: [] });
      return;
    }

    try {
      const list = await backuper.listBackups(server.projectRoot);
      json(res, 200, { backups: list });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'GET stt/status': async (req, res) => {
    if (!sttEngine) {
      json(res, 200, { available: false, reason: 'STT engine module not installed' });
      return;
    }

    try {
      const status = typeof sttEngine.status === 'function'
        ? await sttEngine.status()
        : { available: true };
      json(res, 200, status);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST stt/test': async (req, res) => {
    if (!sttEngine) {
      json(res, 503, { error: 'STT engine not available' });
      return;
    }

    try {
      const result = typeof sttEngine.test === 'function'
        ? await sttEngine.test()
        : { success: false, reason: 'Test not implemented' };
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // --- Chat routes ---

  'POST chat/start': async (req, res, server) => {
    const { cli, agent, model } = req.body || {};
    const sm = getSessionManager(server);

    const cliName = cli || 'claude';
    const session = sm.create(cliName, agent || null);

    try {
      const bridge = createBridge(cliName, {
        projectRoot: server.projectRoot,
        agent: agent || null,
        model: model || null,
        onChunk: (chunk) => {
          sendToSessionClients(server, session.id, {
            type: 'chat',
            sessionId: session.id,
            chunk,
            role: 'assistant',
          });
        },
        onToolUse: (tool) => {
          sendToSessionClients(server, session.id, {
            type: 'chat-tool',
            sessionId: session.id,
            tool,
          });
        },
        onComplete: (result) => {
          sendToSessionClients(server, session.id, {
            type: 'chat-complete',
            sessionId: session.id,
            result,
          });
        },
        onError: (err) => {
          sendToSessionClients(server, session.id, {
            type: 'chat-error',
            sessionId: session.id,
            error: err.message,
          });
        },
      });

      await bridge.start();
      activeBridges.set(session.id, bridge);

      json(res, 200, { sessionId: session.id, cli: cliName });
    } catch (err) {
      sm.delete(session.id);
      json(res, 500, { error: err.message });
    }
  },

  'POST chat/send': async (req, res, server) => {
    const { sessionId, message } = req.body || {};

    if (!sessionId || !message) {
      json(res, 400, { error: 'sessionId and message are required' });
      return;
    }

    const bridge = activeBridges.get(sessionId);
    if (!bridge) {
      json(res, 404, { error: 'No active bridge for session' });
      return;
    }

    const sm = getSessionManager(server);
    sm.addMessage(sessionId, 'user', message);

    json(res, 200, { status: 'streaming' });

    try {
      await bridge.send(message);
    } catch (err) {
      sendToSessionClients(server, sessionId, {
        type: 'chat-error',
        sessionId,
        error: err.message,
      });
    }
  },

  'POST chat/stop': async (req, res) => {
    const { sessionId } = req.body || {};

    if (!sessionId) {
      json(res, 400, { error: 'sessionId is required' });
      return;
    }

    const bridge = activeBridges.get(sessionId);
    if (bridge) {
      await bridge.stop();
      activeBridges.delete(sessionId);
    }

    json(res, 200, { status: 'stopped' });
  },

  'GET chat/sessions': async (req, res, server) => {
    const sm = getSessionManager(server);
    json(res, 200, { sessions: sm.list() });
  },

  'GET chat/session/:id': async (req, res, server) => {
    const sm = getSessionManager(server);
    const session = sm.load(req.params.id);
    if (!session) {
      json(res, 404, { error: 'Session not found' });
      return;
    }
    json(res, 200, { session });
  },

  'DELETE chat/session/:id': async (req, res, server) => {
    const sm = getSessionManager(server);
    const bridge = activeBridges.get(req.params.id);
    if (bridge) {
      await bridge.stop();
      activeBridges.delete(req.params.id);
    }
    sm.delete(req.params.id);
    json(res, 200, { status: 'deleted' });
  },

  // --- Agent routes ---

  'GET agents': async (req, res, server) => {
    const agents = await detectAgents(server.projectRoot);
    json(res, 200, { agents });
  },

  'GET agents/:name': async (req, res, server) => {
    const agents = await detectAgents(server.projectRoot);
    const agent = agents.find((a) => a.id === req.params.name || a.name === req.params.name);
    if (!agent) {
      json(res, 404, { error: 'Agent not found' });
      return;
    }
    json(res, 200, { agent });
  },

  // --- CLI detection ---

  'GET cli/detect': async (req, res) => {
    const clis = await detectCLIs();
    json(res, 200, { clis });
  },

  // --- Agent Exchange routes ---

  'GET agents/exportable': async (req, res, server) => {
    if (!AgentPackager) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    try {
      const packager = new AgentPackager(server.projectRoot);
      const agents = await packager.listExportableAgents();
      json(res, 200, { agents });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST agents/export': async (req, res, server) => {
    if (!AgentPackager) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    const { agentName, compress, author } = req.body || {};
    if (!agentName) {
      json(res, 400, { error: 'Missing agentName' });
      return;
    }
    try {
      const packager = new AgentPackager(server.projectRoot);
      const buffer = await packager.exportAgent(agentName, { compress, author });
      const ext = compress ? '.byan-agent.gz' : '.byan-agent';
      const filename = `${sanitizeForFilename(agentName)}${ext}`;
      const contentType = compress ? 'application/gzip' : 'application/json';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length
      });
      res.end(buffer);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST agents/import': async (req, res, server) => {
    if (!AgentPackager) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    try {
      const upload = await readUploadedFile(req);
      const packager = new AgentPackager(server.projectRoot);
      const opts = {
        targetModule: upload.fields.targetModule || null,
        overwrite: upload.fields.overwrite === 'true' || upload.fields.overwrite === true
      };
      const result = await packager.importAgent(upload.buffer, opts);
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST agents/import-url': async (req, res, server) => {
    if (!AgentPackager || !GistClient) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    const { url } = req.body || {};
    if (!url) {
      json(res, 400, { error: 'Missing url' });
      return;
    }
    try {
      const gist = new GistClient();
      const pkg = url.includes('gist.github.com')
        ? await gist.importFromGist(url)
        : await gist.importFromURL(url);
      const packager = new AgentPackager(server.projectRoot);
      const buffer = Buffer.from(JSON.stringify(pkg), 'utf8');
      const result = await packager.importAgent(buffer);
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST agents/validate': async (req, res, server) => {
    if (!AgentPackager) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    try {
      const upload = await readUploadedFile(req);
      const packager = new AgentPackager(server.projectRoot);
      const result = await packager.validate(upload.buffer);
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // --- Conversation Exchange routes ---

  'POST chat/export': async (req, res, server) => {
    if (!ConversationExporter) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    const { session, format } = req.body || {};
    if (!session) {
      json(res, 400, { error: 'Missing session data' });
      return;
    }
    try {
      const exporter = new ConversationExporter();
      let content, filename, contentType;
      switch (format) {
        case 'markdown':
          content = exporter.exportMarkdown(session);
          filename = `chat-${sanitizeForFilename(session.agent || 'byan')}-${Date.now()}.md`;
          contentType = 'text/markdown; charset=utf-8';
          break;
        case 'template':
          content = exporter.exportTemplate(session);
          filename = `template-${sanitizeForFilename(session.agent || 'byan')}-${Date.now()}.byan-template`;
          contentType = 'application/json; charset=utf-8';
          break;
        default:
          content = exporter.exportJSON(session);
          filename = `chat-${sanitizeForFilename(session.agent || 'byan')}-${Date.now()}.byan-chat`;
          contentType = 'application/json; charset=utf-8';
          break;
      }
      const buf = Buffer.from(content, 'utf8');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buf.length
      });
      res.end(buf);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST chat/import': async (req, res) => {
    if (!ConversationExporter) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    try {
      const upload = await readUploadedFile(req);
      const exporter = new ConversationExporter();
      const content = upload.buffer.toString('utf8');
      let result;
      if (upload.filename && upload.filename.includes('.byan-template')) {
        const template = exporter.importTemplate(content);
        result = { success: true, type: 'template', data: template };
      } else {
        const session = exporter.importJSON(content);
        result = { success: true, type: 'chat', sessionId: session.id, data: session };
      }
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  // --- Gist routes ---

  'POST gist/export': async (req, res, server) => {
    if (!AgentPackager || !GistClient) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    const { agentName, author } = req.body || {};
    if (!agentName) {
      json(res, 400, { error: 'Missing agentName' });
      return;
    }
    try {
      const packager = new AgentPackager(server.projectRoot);
      const buffer = await packager.exportAgent(agentName, { author });
      const pkg = JSON.parse(buffer.toString('utf8'));
      const gist = new GistClient();
      const gistUrl = await gist.exportToGist(pkg);
      json(res, 200, { success: true, gistUrl });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },

  'POST gist/import': async (req, res, server) => {
    if (!AgentPackager || !GistClient) {
      json(res, 503, { error: 'Exchange module not available' });
      return;
    }
    const { url } = req.body || {};
    if (!url) {
      json(res, 400, { error: 'Missing url' });
      return;
    }
    try {
      const gist = new GistClient();
      const pkg = await gist.importFromGist(url);
      const packager = new AgentPackager(server.projectRoot);
      const buffer = Buffer.from(JSON.stringify(pkg), 'utf8');
      const result = await packager.importAgent(buffer);
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }
};

function resolve(method, route) {
  const key = `${method} ${route}`;
  if (routes[key]) return routes[key];

  for (const pattern of Object.keys(routes)) {
    const [pMethod, pRoute] = pattern.split(' ', 2);
    if (pMethod !== method) continue;
    if (!pRoute || !pRoute.includes(':')) continue;

    const pParts = pRoute.split('/');
    const rParts = route.split('/');
    if (pParts.length !== rParts.length) continue;

    const params = {};
    let match = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) {
        params[pParts[i].slice(1)] = rParts[i];
      } else if (pParts[i] !== rParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return (req, res, server) => {
        req.params = params;
        return routes[pattern](req, res, server);
      };
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureDirectoryStructure(projectRoot) {
  const dirs = [
    '_bmad',
    '_bmad/_config',
    '_bmad/_memory',
    '_bmad/core',
    '_bmad/core/agents',
    '_bmad/core/workflows',
    '_bmad/core/tasks',
    '_bmad-output',
    '_bmad-output/planning-artifacts',
    '_bmad-output/implementation-artifacts'
  ];

  for (const dir of dirs) {
    const full = path.join(projectRoot, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
  }
}

function writeBaseConfig(projectRoot, config) {
  const configPath = path.join(projectRoot, '_bmad', 'core', 'config.yaml');
  if (fs.existsSync(configPath)) return;

  const content = [
    `user_name: ${config.userName || 'User'}`,
    `communication_language: ${config.language || 'English'}`,
    `document_output_language: ${config.language || 'English'}`,
    `output_folder: "{project-root}/_bmad-output"`
  ].join('\n') + '\n';

  fs.writeFileSync(configPath, content, 'utf8');
}

function sanitizeForFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 100) || 'file';
}

function readUploadedFile(req) {
  return new Promise((resolve, reject) => {
    const contentType = (req.headers && req.headers['content-type']) || '';

    if (req.body && req.body._fileBuffer) {
      resolve({
        buffer: Buffer.from(req.body._fileBuffer, 'base64'),
        filename: sanitizeUploadFilename(req.body._fileName || ''),
        fields: req.body
      });
      return;
    }

    const chunks = [];
    req.removeAllListeners('data');
    req.removeAllListeners('end');
    req.on('data', chunk => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      try {
        resolve(parseUploadBody(raw, contentType));
      } catch (err) {
        reject(err);
      }
    });

    if (req._body !== undefined) {
      const raw = Buffer.from(typeof req._body === 'string' ? req._body : JSON.stringify(req.body || {}), 'utf8');
      try {
        resolve(parseUploadBody(raw, contentType));
      } catch (err) {
        reject(err);
      }
    }
  });
}

function parseUploadBody(raw, contentType) {
  if (contentType.includes('multipart/form-data')) {
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      throw new Error('Missing multipart boundary');
    }
    return extractMultipartFile(raw, boundaryMatch[1]);
  }

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      if (parsed._fileBuffer) {
        return {
          buffer: Buffer.from(parsed._fileBuffer, 'base64'),
          filename: sanitizeUploadFilename(parsed._fileName || ''),
          fields: parsed
        };
      }
    } catch { /* not JSON with fileBuffer, treat as raw */ }
  }

  return { buffer: raw, filename: '', fields: {} };
}

function extractMultipartFile(raw, boundary) {
  const rawStr = raw.toString('binary');
  const parts = rawStr.split('--' + boundary);
  const fields = {};
  let fileResult = null;

  for (const part of parts) {
    if (part.trim() === '' || part.trim() === '--') continue;

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = part.substring(0, headerEnd);
    const body = part.substring(headerEnd + 4).replace(/\r\n$/, '');

    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    if (headers.includes('filename=')) {
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      fileResult = {
        buffer: Buffer.from(body, 'binary'),
        filename: sanitizeUploadFilename(filenameMatch ? filenameMatch[1] : '')
      };
    } else {
      fields[fieldName] = body;
    }
  }

  if (!fileResult) {
    throw new Error('No file found in multipart upload');
  }
  fileResult.fields = fields;
  return fileResult;
}

function sanitizeUploadFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9_.\-]/g, '').substring(0, 200);
}

module.exports = { resolve, routes };
