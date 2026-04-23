'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { setupTmpDb, teardownTmpDb } = require('./helpers/tmp-db');

let dbCtx;
let registerImportRoutes;
let dbModule;
let userId;

before(() => {
  dbCtx = setupTmpDb();
  dbModule = require('../db');
  registerImportRoutes = require('../routes/import');

  const id = crypto.randomUUID();
  dbModule.getDb().prepare(
    "INSERT INTO users (id, username, password_hash, role, active) VALUES (?, ?, ?, 'user', 1)"
  ).run(id, `u_${id.slice(0, 8)}`, 'x:y');
  userId = id;
});

after(() => {
  teardownTmpDb(dbCtx);
});

// --- Fake router + auth + res ---

function makeRouter() {
  const routes = [];
  return {
    routes,
    post(routePath, ...handlers) { routes.push({ method: 'POST', path: routePath, handlers }); },
    get() {}, put() {}, patch() {}, delete() {},
    find(method, routePath) {
      return routes.find(r => r.method === method && r.path === routePath);
    }
  };
}

function makeAuth(user) {
  return {
    required: (req, res, next) => { req.user = user; next(); }
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    writeHead(code, headers) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(body) { this.body = body; }
  };
  return res;
}

async function call(router, method, pathStr, body, user) {
  const route = router.find(method, pathStr);
  if (!route) throw new Error(`No route ${method} ${pathStr}`);
  const req = { body, user };
  const res = makeRes();

  let i = 0;
  const next = () => {
    if (i < route.handlers.length) route.handlers[i++](req, res, next);
  };
  next();

  // Allow microtask flush
  await Promise.resolve();
  return {
    status: res.statusCode,
    data: res.body ? JSON.parse(res.body) : null
  };
}

function getRouter() {
  const router = makeRouter();
  registerImportRoutes(router, makeAuth({ id: userId }));
  return router;
}

test('POST /api/import/project with files payload creates project', async () => {
  const router = getRouter();
  const files = [
    { path: 'README.md', content: '# hello', encoding: 'utf8' },
    {
      path: '_bmad-output/planning-artifacts/prd.md',
      content: '# PRD\nbody',
      encoding: 'utf8'
    }
  ];
  const result = await call(router, 'POST', '/api/import/project', {
    files,
    name: 'from-payload',
    projectName: 'from-payload'
  });

  assert.equal(result.status, 201, `expected 201, got ${result.status}: ${JSON.stringify(result.data)}`);
  assert.ok(result.data.data.projectId);
  assert.ok(result.data.data.rootNodeId);

  const proj = dbModule.getDb().prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).get(result.data.data.projectId);
  assert.equal(proj.name, 'from-payload');
});

test('POST /api/import/project with BOTH path and files returns 400', async () => {
  const router = getRouter();
  const result = await call(router, 'POST', '/api/import/project', {
    path: '/tmp/foo',
    files: [{ path: 'a.md', content: 'x' }]
  });
  assert.equal(result.status, 400);
  assert.equal(result.data.code, 'MISSING_FIELDS');
  assert.match(result.data.error, /either path OR files/i);
});

test('POST /api/import/project with NEITHER returns 400', async () => {
  const router = getRouter();
  const result = await call(router, 'POST', '/api/import/project', {});
  assert.equal(result.status, 400);
  assert.equal(result.data.code, 'MISSING_FIELDS');
});

test('POST /api/import/scan with files payload returns data envelope', async () => {
  const router = getRouter();
  const files = [
    { path: '_bmad-output/planning-artifacts/prd.md', content: '# PRD' }
  ];
  const result = await call(router, 'POST', '/api/import/scan', {
    files, name: 'scan-test'
  });
  assert.equal(result.status, 200);
  assert.ok(result.data.data);
  assert.equal(result.data.data.name, 'scan-test');
  assert.equal(result.data.data.artifacts.length, 1);
});

test('POST /api/import/dry-run with files payload does not touch DB', async () => {
  const router = getRouter();
  const before = dbModule.getDb().prepare('SELECT COUNT(*) as c FROM projects').get().c;

  const result = await call(router, 'POST', '/api/import/dry-run', {
    files: [
      { path: '_bmad-output/planning-artifacts/prd.md', content: '# PRD' }
    ],
    name: 'dry-test'
  });

  const after = dbModule.getDb().prepare('SELECT COUNT(*) as c FROM projects').get().c;
  assert.equal(result.status, 200);
  assert.equal(before, after);
  assert.equal(result.data.data.projectName, 'dry-test');
});

test('POST /api/import/project with path traversal rejected 400', async () => {
  const router = getRouter();
  const result = await call(router, 'POST', '/api/import/project', {
    files: [{ path: '../../../etc/passwd', content: 'evil' }]
  });
  assert.equal(result.status, 400);
});

test('POST /api/import/scan keeps backward-compat path mode', async () => {
  const router = getRouter();
  // nonexistent path → 404 PATH_NOT_FOUND (legacy behavior)
  const result = await call(router, 'POST', '/api/import/scan', {
    path: '/nonexistent/path/xyz-byan-compat-test'
  });
  assert.equal(result.status, 404);
  assert.equal(result.data.code, 'PATH_NOT_FOUND');
});
