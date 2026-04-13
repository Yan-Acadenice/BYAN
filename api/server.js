'use strict';

const http = require('http');
const { URL } = require('url');
const config = require('./config');
const db = require('./db');
const createAuth = require('./middleware/auth');
const createRbac = require('./middleware/rbac');

const VERSION = '1.0.0';
const verbose = process.argv.includes('--verbose');

function log(...args) {
  if (verbose) console.log(`[BYAN API]`, ...args);
}

// --- Router ---

class Router {
  constructor() {
    this.routes = [];
  }

  _register(method, path, ...handlers) {
    const { pattern, paramNames } = this._compilePath(path);
    this.routes.push({ method, pattern, paramNames, handlers });
  }

  get(path, ...handlers) { this._register('GET', path, ...handlers); }
  post(path, ...handlers) { this._register('POST', path, ...handlers); }
  put(path, ...handlers) { this._register('PUT', path, ...handlers); }
  patch(path, ...handlers) { this._register('PATCH', path, ...handlers); }
  delete(path, ...handlers) { this._register('DELETE', path, ...handlers); }

  _compilePath(path) {
    const paramNames = [];
    const regexStr = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    return { pattern: new RegExp(`^${regexStr}$`), paramNames };
  }

  handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      req.params = {};
      route.paramNames.forEach((name, i) => {
        req.params[name] = decodeURIComponent(match[i + 1]);
      });

      req.query = Object.fromEntries(url.searchParams);

      const handlers = route.handlers;
      let idx = 0;
      const next = () => {
        if (idx < handlers.length) {
          handlers[idx++](req, res, next);
        }
      };
      next();
      return true;
    }

    return false;
  }
}

// --- Body Parser ---

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') {
      return resolve({});
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// --- CORS ---

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// --- Auth setup ---

const noAuth = (req, res, next) => next();

// --- Start ---

function start() {
  db.init();
  log('Database initialized');

  const auth = createAuth(config);
  const rbac = createRbac();

  const router = new Router();

  require('./routes/auth')(router, noAuth, auth);
  require('./routes/groups')(router, auth);
  require('./routes/roles')(router, auth, rbac);
  require('./routes/import')(router, auth);

  require('./routes/projects')(router, auth.required);
  require('./routes/nodes')(router, auth.required);
  require('./routes/knowledge')(router, auth.required);
  require('./routes/search')(router, auth.required);

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      req.body = await parseBody(req);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, code: 'INVALID_BODY' }));
    }

    log(`${req.method} ${req.url}`);

    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', version: VERSION }));
    }

    const handled = router.handle(req, res);

    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }));
    }
  });

  server.listen(config.port, () => {
    console.log(`BYAN API v${VERSION} listening on port ${config.port}`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();

module.exports = { noAuth, createAuth, createRbac };
