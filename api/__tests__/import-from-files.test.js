'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { setupTmpDb, teardownTmpDb, mkTmpDir, writeTree } = require('./helpers/tmp-db');

let dbCtx;
let scanner;
let dbModule;

before(() => {
  dbCtx = setupTmpDb();
  dbModule = require('../db');
  scanner = require('../services/project-scanner');
});

after(() => {
  teardownTmpDb(dbCtx);
});

function sampleFileMap() {
  return new Map([
    ['README.md', { content: Buffer.from('# root readme'), size: 13 }],
    ['_bmad-output/planning-artifacts/prd.md', {
      content: Buffer.from('---\ndescription: product reqs\n---\n# PRD\nbody'),
      size: 44
    }],
    ['_bmad-output/planning-artifacts/epic-1.md', {
      content: Buffer.from('# Epic 1\nepic content'),
      size: 21
    }],
    ['_bmad-output/implementation-artifacts/story-1.md', {
      content: Buffer.from('# Story 1\nstory content'),
      size: 23
    }],
    ['docs/architecture.md', {
      content: Buffer.from('# Architecture\ntech stack'),
      size: 25
    }]
  ]);
}

test('scanFromFiles: detects dev project by default', () => {
  const fileMap = sampleFileMap();
  const result = scanner.scanFromFiles(fileMap, { name: 'sample' });
  assert.equal(result.type, 'dev');
  assert.equal(result.name, 'sample');
  assert.ok(Array.isArray(result.artifacts));
});

test('scanFromFiles: finds artifacts in SCAN_DIRS only', () => {
  const fileMap = sampleFileMap();
  const result = scanner.scanFromFiles(fileMap, { name: 'x' });
  const paths = result.artifacts.map(a => a.path).sort();
  assert.deepEqual(paths, [
    '_bmad-output/implementation-artifacts/story-1.md',
    '_bmad-output/planning-artifacts/epic-1.md',
    '_bmad-output/planning-artifacts/prd.md',
    'docs/architecture.md'
  ]);
});

test('scanFromFiles: classifies by artifactType prefix', () => {
  const fileMap = sampleFileMap();
  const result = scanner.scanFromFiles(fileMap, { name: 'x' });
  const byPath = Object.fromEntries(result.artifacts.map(a => [a.path, a.type]));
  assert.equal(byPath['_bmad-output/planning-artifacts/prd.md'], 'planning');
  assert.equal(byPath['_bmad-output/implementation-artifacts/story-1.md'], 'implementation');
  assert.equal(byPath['docs/architecture.md'], 'documentation');
});

test('scanFromFiles: detects training project type', () => {
  const fileMap = new Map([
    ['_bmad-output/planning-artifacts/bloc-1-rncp.md', {
      content: Buffer.from('# bloc'), size: 7
    }]
  ]);
  const result = scanner.scanFromFiles(fileMap, { name: 'training-proj' });
  assert.equal(result.type, 'training');
});

test('scanFromFiles: skips non-markdown extensions', () => {
  const fileMap = new Map([
    ['_bmad-output/planning-artifacts/prd.md', { content: Buffer.from('x'), size: 1 }],
    ['_bmad-output/planning-artifacts/logo.png', { content: Buffer.from('x'), size: 1 }]
  ]);
  const result = scanner.scanFromFiles(fileMap, { name: 'x' });
  assert.equal(result.artifacts.length, 1);
});

test('dryRunFromFiles: returns preview without DB writes', () => {
  const fileMap = sampleFileMap();
  const before = dbModule.getDb().prepare('SELECT COUNT(*) as c FROM projects').get().c;
  const preview = scanner.dryRunFromFiles(fileMap, { name: 'dry' });
  const after = dbModule.getDb().prepare('SELECT COUNT(*) as c FROM projects').get().c;
  assert.equal(before, after, 'dry-run must not write to DB');
  assert.equal(preview.projectName, 'dry');
  assert.equal(preview.totalArtifacts, 4);
  assert.ok(preview.nodes.length === 4);
});

test('importFromFiles: creates project + nodes in DB', () => {
  const fileMap = sampleFileMap();
  const userId = seedUser();
  const result = scanner.importFromFiles(fileMap, userId, { name: 'imported' });

  assert.ok(result.projectId);
  assert.ok(result.rootNodeId);
  assert.equal(result.artifactsImported, 4);

  const db = dbModule.getDb();
  const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.projectId);
  assert.equal(proj.name, 'imported');
  assert.equal(proj.type, 'dev');

  const role = db.prepare(
    'SELECT * FROM project_roles WHERE project_id = ? AND user_id = ?'
  ).get(result.projectId, userId);
  assert.equal(role.role, 'owner');

  const nodeCount = db.prepare(
    'SELECT COUNT(*) as c FROM nodes WHERE project_id = ?'
  ).get(result.projectId).c;
  assert.ok(nodeCount >= 2, `expected root + at least 1 child, got ${nodeCount}`);
});

test('importFromFiles: epic/story parent-child linking preserved', () => {
  const fileMap = new Map([
    ['_bmad-output/planning-artifacts/epic-1/epic.md', {
      content: Buffer.from('# Epic'), size: 6
    }],
    ['_bmad-output/planning-artifacts/epic-1/story-1.md', {
      content: Buffer.from('# Story under epic-1'), size: 20
    }]
  ]);
  const userId = seedUser();
  const result = scanner.importFromFiles(fileMap, userId, { name: 'nested' });

  const db = dbModule.getDb();
  const storyNode = db.prepare(
    "SELECT * FROM nodes WHERE project_id = ? AND node_type = 'story'"
  ).get(result.projectId);
  assert.ok(storyNode, 'story node created');
  const parent = db.prepare('SELECT node_type FROM nodes WHERE id = ?').get(storyNode.parent_id);
  assert.equal(parent.node_type, 'epic', 'story is child of epic, not root');
});

test('readFilesystemToMap: reads real fs into map', () => {
  const dir = mkTmpDir();
  writeTree(dir, {
    'README.md': '# hi',
    '_bmad-output/planning-artifacts/prd.md': '# PRD',
    'src/index.js': 'console.log("hi")'
  });

  const map = scanner.readFilesystemToMap(dir);
  assert.ok(map.has('README.md'));
  assert.ok(map.has('_bmad-output/planning-artifacts/prd.md'));
  assert.ok(map.has('src/index.js'));
  assert.equal(map.get('README.md').content.toString('utf8'), '# hi');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFilesystemToMap: skips node_modules, .git, dist', () => {
  const dir = mkTmpDir();
  writeTree(dir, {
    'README.md': '# hi',
    'node_modules/foo/index.js': 'skip me',
    '.git/config': 'skip me',
    'dist/bundle.js': 'skip me',
    'src/a.js': 'keep'
  });

  const map = scanner.readFilesystemToMap(dir);
  assert.ok(map.has('README.md'));
  assert.ok(map.has('src/a.js'));
  assert.ok(!map.has('node_modules/foo/index.js'));
  assert.ok(!map.has('.git/config'));
  assert.ok(!map.has('dist/bundle.js'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFilesystemToMap: skips *.log and *.sqlite*', () => {
  const dir = mkTmpDir();
  writeTree(dir, {
    'app.log': 'logs',
    'db.sqlite': 'bin',
    'db.sqlite-wal': 'wal',
    'keep.md': 'keep'
  });

  const map = scanner.readFilesystemToMap(dir);
  assert.ok(map.has('keep.md'));
  assert.ok(!map.has('app.log'));
  assert.ok(!map.has('db.sqlite'));
  assert.ok(!map.has('db.sqlite-wal'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFilesystemToMap: enforces maxFiles', () => {
  const dir = mkTmpDir();
  const tree = {};
  for (let i = 0; i < 5; i++) {
    tree[`f${i}.txt`] = 'x';
  }
  writeTree(dir, tree);

  assert.throws(
    () => scanner.readFilesystemToMap(dir, { maxFiles: 3 }),
    /Too many files/i
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFilesystemToMap: enforces maxTotalBytes', () => {
  const dir = mkTmpDir();
  writeTree(dir, {
    'big1.txt': 'x'.repeat(500),
    'big2.txt': 'x'.repeat(500)
  });

  assert.throws(
    () => scanner.readFilesystemToMap(dir, { maxTotalBytes: 800 }),
    /size exceeds/i
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('readFilesystemToMap: PATH_NOT_FOUND on missing path', () => {
  assert.throws(
    () => scanner.readFilesystemToMap('/nonexistent/path/xyz-byan-test'),
    err => err.code === 'PATH_NOT_FOUND'
  );
});

test('wrapper scanProject: matches scanFromFiles + readFilesystemToMap', () => {
  const dir = mkTmpDir();
  writeTree(dir, {
    'README.md': '# root',
    '_bmad-output/planning-artifacts/prd.md': '# prd',
    'docs/architecture.md': '# arch'
  });

  const viaWrapper = scanner.scanProject(dir);
  const map = scanner.readFilesystemToMap(dir);
  const viaPure = scanner.scanFromFiles(map, {
    name: path.basename(dir),
    sourcePath: path.resolve(dir)
  });

  // artifact list should be identical
  const w = viaWrapper.artifacts.map(a => a.path).sort();
  const p = viaPure.artifacts.map(a => a.path).sort();
  assert.deepEqual(w, p);
  assert.equal(viaWrapper.type, viaPure.type);

  fs.rmSync(dir, { recursive: true, force: true });
});

function seedUser() {
  const db = dbModule.getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, role, active) VALUES (?, ?, ?, 'user', 1)"
  ).run(id, `u_${id.slice(0, 8)}`, 'x:y');
  return id;
}
