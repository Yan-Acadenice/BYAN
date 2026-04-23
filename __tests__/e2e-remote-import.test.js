'use strict';

/**
 * E2E integration test: MCP client payload format ↔ API service layer.
 *
 * Proves that buildFilesPayload (client) and scanFromFiles/importFromFiles/
 * dryRunFromFiles/decodeFilesPayload (API) agree on the file payload format.
 *
 * No HTTP server is started. Pure function calls only.
 *
 * W2 (MCP server) did not expose buildFilesPayload as a CommonJS export —
 * server.js is an ES module with no named exports. An inline stub is used
 * that matches the exact contract (same skip rules, same binary detection,
 * same { path, content, encoding } shape, same size-cap semantics).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helpers — absolute paths only (cwd is reset between bash calls)
// ---------------------------------------------------------------------------

const API_ROOT = '/home/yan/BYAN/api';

const { setupTmpDb, teardownTmpDb } = require(`${API_ROOT}/__tests__/helpers/tmp-db`);

let dbCtx;
let dbModule;
let scanner;
let filesPayload;

before(() => {
  dbCtx   = setupTmpDb();
  dbModule = require(`${API_ROOT}/db`);
  scanner  = require(`${API_ROOT}/services/project-scanner`);
  filesPayload = require(`${API_ROOT}/services/files-payload`);
});

after(() => {
  teardownTmpDb(dbCtx);
});

// ---------------------------------------------------------------------------
// Inline stub for W2's buildFilesPayload (async, matches server.js contract)
//
// Contract (from server.js lines 101-173):
//   skipDirs  : Set of directory names to skip
//   skipFile  : /\.log$|\.sqlite$|\.lock$|\.pid$/ patterns
//   binary    : NUL byte in first 8 KB → base64 encoding
//   returns   : { files: Array<{ path, content, encoding }>, count, totalBytes }
//   throws    : Error if too many files OR total size exceeds maxBytes
// ---------------------------------------------------------------------------

const STUB_SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'coverage',
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.mypy_cache',
  'target', 'out', '.turbo', '.cache', '.DS_Store',
]);
const STUB_SKIP_PATTERNS = [
  /\.log$/i, /\.sqlite$/i, /\.sqlite-journal$/i, /\.sqlite-wal$/i,
  /\.lock$/i, /\.pid$/i,
];
const STUB_MAX_FILES  = 10000;
const STUB_MAX_BYTES  = 100 * 1024 * 1024;

function looksBinary(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  for (const b of sample) if (b === 0) return true;
  return false;
}

async function buildFilesPayload(absRoot, opts = {}) {
  const skipDirs    = opts.skipDirs    || STUB_SKIP_DIRS;
  const skipPatterns = opts.skipPatterns || STUB_SKIP_PATTERNS;
  const maxFiles    = opts.maxFiles    || STUB_MAX_FILES;
  const maxBytes    = opts.maxBytes    || STUB_MAX_BYTES;

  const stat = fs.statSync(absRoot);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${absRoot}`);

  const files = [];
  let totalBytes = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (skipPatterns.some(re => re.test(entry.name))) continue;

      const rel = path.relative(absRoot, full).split(path.sep).join('/');
      const buf = fs.readFileSync(full);
      totalBytes += buf.length;

      if (files.length + 1 > maxFiles) {
        throw new Error(`Too many files (>${maxFiles}). Add to skipDirs or increase maxFiles.`);
      }
      if (totalBytes > maxBytes) {
        throw new Error(
          `Total size exceeds ${(maxBytes / 1024 / 1024).toFixed(0)}MB. ` +
          `Prune node_modules/dist/build dirs or increase maxBytes.`
        );
      }

      if (looksBinary(buf)) {
        files.push({ path: rel, content: buf.toString('base64'), encoding: 'base64' });
      } else {
        files.push({ path: rel, content: buf.toString('utf8'), encoding: 'utf8' });
      }
    }
  }

  walk(absRoot);
  return { files, count: files.length, totalBytes };
}

// ---------------------------------------------------------------------------
// Bridge: Array<{ path, content, encoding }> → Map<string, { content: Buffer, size }>
// This is the exact shape W1's scanFromFiles / importFromFiles expect.
// ---------------------------------------------------------------------------

function payloadToFileMap(filesArray) {
  return filesPayload.decodeFilesPayload(filesArray);
}

// ---------------------------------------------------------------------------
// Temp dir helpers
// ---------------------------------------------------------------------------

function mkTmpDir(prefix = 'byan-e2e-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTree(rootDir, tree) {
  for (const [rel, content] of Object.entries(tree)) {
    const full = path.join(rootDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(full, content);
    } else {
      fs.writeFileSync(full, content, 'utf8');
    }
  }
}

function rmTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function seedUser() {
  const db = dbModule.getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, role, active) VALUES (?, ?, ?, 'user', 1)"
  ).run(id, `u_${id.slice(0, 8)}`, 'x:y');
  return id;
}

// ===========================================================================
// Scenario A — happy path: full pipeline buildFilesPayload → scanFromFiles
// ===========================================================================

test('Scenario A: happy path — buildFilesPayload feeds scanFromFiles correctly', async () => {
  const dir = mkTmpDir('byan-e2e-a-');
  try {
    writeTree(dir, {
      'README.md':                   '# Hello admin_bff',
      '_bmad/_memory/agent-elo.json': '{"domain":"javascript","score":600}',
      'docs/architecture.md':        '# Architecture\nTech stack: node, sqlite',
      'src/index.js':                'module.exports = {}',
      // Filtered dirs
      'node_modules/bar/x.js':       'should be filtered',
      '.git/HEAD':                   'ref: refs/heads/main',
      'build/out.js':                'should be filtered',
      // Filtered file pattern
      'debug.log':                   'should be filtered',
    });

    // Step 1: MCP client produces payload
    const payload = await buildFilesPayload(dir);
    const relPaths = payload.files.map(f => f.path);

    // node_modules / .git / build / *.log must be absent
    assert.ok(!relPaths.includes('node_modules/bar/x.js'), 'node_modules filtered');
    assert.ok(!relPaths.includes('.git/HEAD'),             '.git filtered');
    assert.ok(!relPaths.includes('build/out.js'),          'build filtered');
    assert.ok(!relPaths.includes('debug.log'),             '*.log filtered');

    // Kept files must be present
    assert.ok(relPaths.includes('README.md'),              'README.md present');
    assert.ok(relPaths.includes('docs/architecture.md'),   'docs/architecture.md present');
    assert.ok(relPaths.includes('src/index.js'),           'src/index.js present');

    // Step 2: bridge payload → fileMap (W1's Map<string, { content: Buffer, size }>)
    const fileMap = payloadToFileMap(payload.files);

    // Step 3: W1's scanFromFiles
    const result = scanner.scanFromFiles(fileMap, { name: 'admin_bff', type: 'dev' });
    assert.equal(result.name, 'admin_bff');
    assert.equal(result.type, 'dev');
    assert.ok(Array.isArray(result.artifacts), 'artifacts is array');

    // docs/ is a SCAN_DIR so architecture.md should appear
    const artifactPaths = result.artifacts.map(a => a.path);
    assert.ok(
      artifactPaths.includes('docs/architecture.md'),
      `architecture.md expected in artifacts, got: ${JSON.stringify(artifactPaths)}`
    );

    // README.md is not in a SCAN_DIR → not in artifacts, but fileMap has it
    assert.ok(fileMap.has('README.md'), 'README.md still in fileMap');
    const readmeBuf = fileMap.get('README.md').content;
    assert.ok(readmeBuf.toString('utf8').includes('Hello admin_bff'), 'README content intact');

  } finally {
    rmTmpDir(dir);
  }
});

// ===========================================================================
// Scenario B — importFromFiles creates DB rows
// ===========================================================================

test('Scenario B: importFromFiles creates project + root node in DB', async () => {
  const dir = mkTmpDir('byan-e2e-b-');
  try {
    writeTree(dir, {
      'README.md':                                     '# admin_bff project',
      'docs/architecture.md':                          '# Architecture',
      '_bmad-output/planning-artifacts/prd.md':        '# PRD\nbody',
      '_bmad-output/planning-artifacts/epic-1.md':     '# Epic 1',
      '_bmad-output/implementation-artifacts/story.md': '# Story',
    });

    const payload = await buildFilesPayload(dir);
    const fileMap = payloadToFileMap(payload.files);

    const userId = seedUser();
    const result = scanner.importFromFiles(fileMap, userId, {
      name: 'admin_bff',
      type: 'dev',
    });

    // projectId + rootNodeId must be set
    assert.ok(result.projectId,  'projectId present');
    assert.ok(result.rootNodeId, 'rootNodeId present');
    assert.ok(result.artifactsImported > 0, 'at least one artifact imported');

    const db = dbModule.getDb();

    // Project row
    const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.projectId);
    assert.ok(proj, 'project row exists');
    assert.equal(proj.name, 'admin_bff');
    assert.equal(proj.type, 'dev');

    // Root node row
    const root = db.prepare('SELECT * FROM nodes WHERE id = ?').get(result.rootNodeId);
    assert.ok(root, 'root node exists');
    assert.equal(root.project_id, result.projectId);

    // Owner role assigned
    const role = db.prepare(
      'SELECT * FROM project_roles WHERE project_id = ? AND user_id = ?'
    ).get(result.projectId, userId);
    assert.ok(role, 'project_role row exists');
    assert.equal(role.role, 'owner');

    // At least root node in nodes table
    const nodeCount = db.prepare(
      'SELECT COUNT(*) as c FROM nodes WHERE project_id = ?'
    ).get(result.projectId).c;
    assert.ok(nodeCount >= 1, `expected root + children, got ${nodeCount}`);

  } finally {
    rmTmpDir(dir);
  }
});

// ===========================================================================
// Scenario C — binary files get base64 encoding
// ===========================================================================

test('Scenario C: binary file → base64 encoding, scanFromFiles does not crash', async () => {
  const dir = mkTmpDir('byan-e2e-c-');
  try {
    // Binary blob with NUL bytes (triggers looksBinary)
    const binBlob = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff, 0x00]);
    writeTree(dir, {
      'bin/logo.dat': binBlob,
      'README.md':    '# test',
    });

    const payload = await buildFilesPayload(dir);
    const binEntry = payload.files.find(f => f.path === 'bin/logo.dat');
    assert.ok(binEntry, 'bin/logo.dat present in payload');
    assert.equal(binEntry.encoding, 'base64', 'binary file encoded as base64');

    // Verify base64 decodes back to original bytes
    const decoded = Buffer.from(binEntry.content, 'base64');
    assert.deepEqual(Array.from(decoded), Array.from(binBlob), 'base64 round-trip matches');

    // W1's decodeFilesPayload must decode it to a Buffer without crashing
    const fileMap = payloadToFileMap(payload.files);
    assert.ok(fileMap.has('bin/logo.dat'), 'bin/logo.dat in fileMap');
    const entry = fileMap.get('bin/logo.dat');
    assert.ok(Buffer.isBuffer(entry.content), 'content is Buffer');

    // scanFromFiles should not crash even with binary content in map
    const result = scanner.scanFromFiles(fileMap, { name: 'binary-proj' });
    assert.equal(result.name, 'binary-proj');

  } finally {
    rmTmpDir(dir);
  }
});

// ===========================================================================
// Scenario D — size cap rejects oversized payload
// ===========================================================================

test('Scenario D: size cap — two 55 MB files throw "Total size exceeds"', async () => {
  const dir = mkTmpDir('byan-e2e-d-');
  try {
    // Two 55 MB files → total 110 MB > 100 MB cap
    const chunk = Buffer.alloc(55 * 1024 * 1024, 0x41); // 'A' × 55 MB (text)
    writeTree(dir, {
      'big1.txt': chunk,
      'big2.txt': chunk,
    });

    await assert.rejects(
      () => buildFilesPayload(dir, { maxBytes: 100 * 1024 * 1024 }),
      /Total size exceeds/i
    );
  } finally {
    rmTmpDir(dir);
  }
});

// ===========================================================================
// Scenario E — path traversal rejected by decodeFilesPayload
// ===========================================================================

test('Scenario E: path traversal rejected by decodeFilesPayload with INVALID_PAYLOAD', () => {
  const hostile = [
    { path: '../../etc/passwd', content: 'x', encoding: 'utf8' },
  ];

  let threw = false;
  try {
    filesPayload.decodeFilesPayload(hostile);
  } catch (err) {
    threw = true;
    assert.equal(err.code,   'INVALID_PAYLOAD', 'error code is INVALID_PAYLOAD');
    assert.equal(err.status, 400,               'error status is 400');
    assert.match(err.message, /traversal/i,     'message mentions traversal');
  }
  assert.ok(threw, 'decodeFilesPayload must throw on path traversal');
});
