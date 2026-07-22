/**
 * BYAN WebUI Server
 * Lightweight HTTP + WebSocket server for browser-based install/update.
 * No framework -- Node built-in http module + ws.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const SessionManager = require('./chat/session-manager');
const { detectCLIs } = require('./chat/cli-detector');
const { createBridge } = require('./chat/bridge');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

class ByanWebUI {
  constructor(options = {}) {
    // ?? and not || : port 0 is a VALID value (the OS assigns a free port and
    // the fork parent reads it back from the ready message). `0 || 3000` would
    // silently force 3000 and crash on EADDRINUSE when 3000 is busy.
    this.port = options.port ?? 3000;
    this.projectRoot = options.projectRoot || process.cwd();
    this.publicDir = path.join(__dirname, 'public');
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.api = require('./api');
    this.sessionManager = null;
    this.chatBridges = new Map();
  }

  start() {
    this.sessionManager = new SessionManager(this.projectRoot);

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('message', (raw) => this.handleChatMessage(ws, raw));
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });

    return new Promise((resolve) => {
      // Bind to loopback ONLY. Without a host argument Node binds to :: (every
      // interface), which made the installer LAN-reachable — and since it runs
      // the real install engine (file writes + child processes), that exposed
      // an arbitrary-write surface to the local network. A local installer has
      // no business listening off-host.
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server.address();
        const assignedPort = (addr && typeof addr === 'object') ? addr.port : this.port;
        const url = `http://localhost:${assignedPort}`;
        console.log(`BYAN WebUI running at ${url}`);
        // Notify parent Electron process (F3 LocalServer) of the assigned port.
        // process.send exists only when forked via child_process.fork().
        if (typeof process.send === 'function') {
          process.send({ type: 'ready', port: assignedPort });
        }
        this.openBrowser(url);
        resolve(this);
      });
    });
  }

  openBrowser(url) {
    const { exec } = require('child_process');
    const cmds = {
      darwin: 'open',
      win32: 'start',
      linux: 'xdg-open'
    };
    const cmd = cmds[process.platform] || 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }

  handleRequest(req, res) {
    if (req.url.startsWith('/api/')) {
      return this.handleAPI(req, res);
    }
    return this.serveStatic(req, res);
  }

  serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(this.publicDir, urlPath);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(this.publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(resolved);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(resolved, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          fs.readFile(path.join(this.publicDir, 'index.html'), (e2, fallback) => {
            if (e2) {
              res.writeHead(404);
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fallback);
          });
          return;
        }
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  handleAPI(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = url.pathname.replace('/api/', '');
    const method = req.method.toUpperCase();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const handler = this.api.resolve(method, route);
    if (!handler) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          req.body = body ? JSON.parse(body) : {};
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        this.runHandler(handler, req, res);
      });
    } else {
      this.runHandler(handler, req, res);
    }
  }

  async runHandler(handler, req, res) {
    try {
      await handler(req, res, this);
    } catch (err) {
      console.error('API error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  }

  broadcast(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  broadcastLog(level, message) {
    this.broadcast({ type: 'log', level, message, timestamp: Date.now() });
  }

  broadcastProgress(step, total, label) {
    this.broadcast({ type: 'progress', step, total, label });
  }

  broadcastComplete(success, summary) {
    this.broadcast({ type: 'complete', success, summary });
  }

  handleChatMessage(ws, raw) {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    switch (data.type) {
      case 'chat-subscribe':
        ws._chatSessionId = data.sessionId || null;
        ws.send(JSON.stringify({ type: 'subscribed', sessionId: data.sessionId }));
        break;

      case 'chat-start':
        this._wsStartChat(ws, data);
        break;

      case 'chat-send':
        this._wsSendChat(ws, data);
        break;

      case 'chat-stop':
        this._wsStopChat(ws, data);
        break;

      default:
        break;
    }
  }

  async _wsStartChat(ws, data) {
    const { cli, agent, model, resumeSessionId, cwd } = data;
    const cliName = cli || 'claude';

    // Resume path: reattach to an existing record, reuse its cwd + the claude
    // session id so --resume reloads the right context. Fresh path: create a new
    // record bound to the requested cwd (F3/F4).
    let session = null;
    let claudeResume = null;
    let projectRoot = cwd || this.projectRoot;
    if (resumeSessionId) {
      const existing = this.sessionManager.load(resumeSessionId);
      if (existing) {
        session = existing;
        claudeResume = existing.claudeSessionId || null;
        projectRoot = existing.cwd || projectRoot;
      }
    }
    if (!session) {
      session = this.sessionManager.create(cliName, agent || null, { cwd: projectRoot });
    }
    const sessionId = session.id;

    ws._chatSessionId = sessionId;

    // Accumulate the assistant's streamed text for THIS turn so it can be saved
    // to the record on complete. Without this, resume replays user turns with no
    // replies (the transcript is half-empty). Reset each turn in onComplete.
    let assistantBuf = '';
    try {
      const bridge = createBridge(cliName, {
        projectRoot,
        agent: agent || null,
        model: model || null,
        resumeSessionId: claudeResume,
        onChunk: (chunk) => {
          assistantBuf += chunk;
          this._sendToSession(sessionId, { type: 'chat', sessionId, chunk, role: 'assistant' });
        },
        onToolUse: (tool) => {
          this._sendToSession(sessionId, { type: 'chat-tool', sessionId, tool });
        },
        onComplete: (result) => {
          // Persist the claude session id so this record can be resumed later.
          if (result && result.sessionId) {
            this.sessionManager.setClaudeSessionId(sessionId, result.sessionId);
          }
          // Persist the assistant reply so a resumed thread shows both sides.
          if (assistantBuf) {
            this.sessionManager.addMessage(sessionId, 'assistant', assistantBuf);
            assistantBuf = '';
          }
          this._sendToSession(sessionId, { type: 'chat-complete', sessionId, result });
        },
        onError: (err) => {
          this._sendToSession(sessionId, { type: 'chat-error', sessionId, error: err.message });
        },
      });

      await bridge.start();
      this.chatBridges.set(sessionId, bridge);

      ws.send(JSON.stringify({ type: 'chat-started', sessionId, cli: cliName, resumed: Boolean(claudeResume) }));
    } catch (err) {
      // Only delete a record we created in this call ; never drop a resumed one.
      if (!resumeSessionId) this.sessionManager.delete(sessionId);
      ws.send(JSON.stringify({ type: 'chat-error', sessionId, error: err.message }));
    }
  }

  async _wsSendChat(ws, data) {
    const { sessionId, message } = data;
    const bridge = this.chatBridges.get(sessionId);
    if (!bridge) {
      ws.send(JSON.stringify({ type: 'chat-error', sessionId, error: 'No active bridge' }));
      return;
    }

    this.sessionManager.addMessage(sessionId, 'user', message);

    try {
      await bridge.send(message);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'chat-error', sessionId, error: err.message }));
    }
  }

  async _wsStopChat(ws, data) {
    const { sessionId } = data;
    const bridge = this.chatBridges.get(sessionId);
    if (bridge) {
      await bridge.stop();
      this.chatBridges.delete(sessionId);
    }
    ws.send(JSON.stringify({ type: 'chat-stopped', sessionId }));
  }

  _sendToSession(sessionId, data) {
    const payload = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        if (!client._chatSessionId || client._chatSessionId === sessionId) {
          client.send(payload);
        }
      }
    }
  }

  stop() {
    return new Promise(async (resolve) => {
      for (const [id, bridge] of this.chatBridges) {
        try { await bridge.stop(); } catch { /* best effort */ }
      }
      this.chatBridges.clear();

      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close(() => {
          if (this.server) {
            this.server.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

if (require.main === module) {
  // Port order: argv[2] (explicit CLI), then env PORT (the Electron fork
  // passes PORT=0 for an OS-assigned port), then 3000. Number.isFinite and
  // not || : 0 is a valid requested port here.
  const argPort = parseInt(process.argv[2], 10);
  const envPort = parseInt(process.env.PORT ?? '', 10);
  const port = Number.isFinite(argPort) ? argPort : (Number.isFinite(envPort) ? envPort : 3000);
  const projectRoot = process.argv[3] || process.env.BYAN_PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');
  const ui = new ByanWebUI({ port, projectRoot });
  ui.start().then(() => {
    console.log(`Project root: ${ui.projectRoot}`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    ui.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = ByanWebUI;
