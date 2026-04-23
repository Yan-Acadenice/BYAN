'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function setupTmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-api-test-'));
  const dbPath = path.join(dir, 'test.db');
  process.env.BYAN_DB_PATH = dbPath;

  // Force config reload so dbPath picks up env var
  delete require.cache[require.resolve('../../config')];
  delete require.cache[require.resolve('../../db')];

  const db = require('../../db');
  db.init();

  return { dir, dbPath, db };
}

function teardownTmpDb(ctx) {
  try { ctx.db.close(); } catch {}
  try { fs.rmSync(ctx.dir, { recursive: true, force: true }); } catch {}

  // Clear require cache so each test suite starts fresh
  delete require.cache[require.resolve('../../config')];
  delete require.cache[require.resolve('../../db')];
  delete require.cache[require.resolve('../../services/project-scanner')];
  delete require.cache[require.resolve('../../services/bsp-tree')];
}

function mkTmpDir(prefix = 'byan-fs-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTree(rootDir, tree) {
  for (const [rel, content] of Object.entries(tree)) {
    const full = path.join(rootDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

module.exports = { setupTmpDb, teardownTmpDb, mkTmpDir, writeTree };
