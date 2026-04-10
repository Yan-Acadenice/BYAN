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
    this.port = options.port || 3000;
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
      this.server.listen(this.port, () => {
        const url = `http://localhost:${this.port}`;
        console.log(`BYAN WebUI running at ${url}`);
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
    const { cli, agent, model } = data;
    const cliName = cli || 'claude';
    const session = this.sessionManager.create(cliName, agent || null);
    const sessionId = session.id;

    ws._chatSessionId = sessionId;

    try {
      const bridge = createBridge(cliName, {
        projectRoot: this.projectRoot,
        agent: agent || null,
        model: model || null,
        onChunk: (chunk) => {
          this._sendToSession(sessionId, { type: 'chat', sessionId, chunk, role: 'assistant' });
        },
        onToolUse: (tool) => {
          this._sendToSession(sessionId, { type: 'chat-tool', sessionId, tool });
        },
        onComplete: (result) => {
          this._sendToSession(sessionId, { type: 'chat-complete', sessionId, result });
        },
        onError: (err) => {
          this._sendToSession(sessionId, { type: 'chat-error', sessionId, error: err.message });
        },
      });

      await bridge.start();
      this.chatBridges.set(sessionId, bridge);

      ws.send(JSON.stringify({ type: 'chat-started', sessionId, cli: cliName }));
    } catch (err) {
      this.sessionManager.delete(sessionId);
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
  const port = parseInt(process.argv[2], 10) || 3000;
  const projectRoot = process.argv[3] || path.resolve(__dirname, '..', '..', '..');
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
