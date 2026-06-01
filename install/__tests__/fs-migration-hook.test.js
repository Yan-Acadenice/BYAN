'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shouldMigrate, runFsMigration, hasLegacyLayout } = require('../lib/fs-migration-hook');

function tmpProject({ oldLayout = false, enabledMarker = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-f11-'));
  fs.mkdirSync(path.join(root, '_byan', '_config'), { recursive: true });
  if (oldLayout) {
    // real agent .md files in legacy module locations (hasLegacyLayout probes files)
    for (const m of ['bmm', 'bmb']) {
      const dir = path.join(root, '_byan', m, 'agents');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${m}-sample.md`), 'AGENT');
    }
  }
  if (enabledMarker) fs.writeFileSync(path.join(root, '_byan', '_config', 'migrate-fs.enabled'), '');
  return root;
}

// ── shouldMigrate (dormant guard) ────────────────────────────────────────────

test('shouldMigrate false by default (disabled), even with old layout', () => {
  const root = tmpProject({ oldLayout: true });
  assert.equal(shouldMigrate({ projectRoot: root, env: {} }), false);
});

test('shouldMigrate true when enabled via env AND old layout present', () => {
  const root = tmpProject({ oldLayout: true });
  assert.equal(shouldMigrate({ projectRoot: root, env: { BYAN_FS_MIGRATE: '1' } }), true);
});

test('shouldMigrate true when enabled via marker file AND old layout present', () => {
  const root = tmpProject({ oldLayout: true, enabledMarker: true });
  assert.equal(shouldMigrate({ projectRoot: root, env: {} }), true);
});

test('shouldMigrate false when enabled but NO old layout (already migrated / fresh)', () => {
  const root = tmpProject({ oldLayout: false, enabledMarker: true });
  assert.equal(shouldMigrate({ projectRoot: root, env: { BYAN_FS_MIGRATE: '1' } }), false);
});

// ── runFsMigration ───────────────────────────────────────────────────────────

test('runFsMigration is a no-op when the guard is not passed', () => {
  const root = tmpProject({ oldLayout: true }); // not enabled
  const calls = [];
  const r = runFsMigration({ projectRoot: root, env: {}, exec: (c) => calls.push(c), backup: () => 'noop' });
  assert.equal(r.ran, false);
  assert.equal(calls.length, 0, 'no migration command spawned');
});

test('runFsMigration backs up then runs migrate -> reconcile -> build-index in order', () => {
  const root = tmpProject({ oldLayout: true, enabledMarker: true });
  const calls = [];
  let backedUp = null;
  const r = runFsMigration({
    projectRoot: root,
    env: {},
    exec: (cmd) => calls.push(cmd),
    backup: ({ projectRoot }) => { backedUp = projectRoot; return path.join(projectRoot, '_byan.bak'); },
  });
  assert.equal(r.ran, true);
  assert.equal(backedUp, root, 'backup taken before migration');
  assert.ok(r.backup.endsWith('_byan.bak'));
  // full sequence: migrate -> rewrite-refs -> rewrite-manifests -> reconcile -> build-index
  assert.equal(calls.length, 5);
  assert.match(calls[0], /byan-migrate-fs\.js.*--apply/);
  assert.match(calls[1], /byan-rewrite-refs\.js.*--apply/);
  assert.match(calls[2], /byan-rewrite-manifests\.js.*--apply/);
  assert.match(calls[3], /byan-reconcile-manifests\.js.*--apply/);
  assert.match(calls[4], /byan-build-index\.js/);
  // each targets the project root
  for (const c of calls) assert.ok(c.includes(root), 'command targets the project root');
});

test('runFsMigration reports the full step sequence', () => {
  const root = tmpProject({ oldLayout: true, enabledMarker: true });
  const r = runFsMigration({ projectRoot: root, env: {}, exec: () => {}, backup: () => '/bak' });
  assert.deepEqual(r.steps, ['migrate', 'rewrite-refs', 'rewrite-manifests', 'reconcile', 'build-index']);
});

// ── hasLegacyLayout (probes agent files, not module dirs) ─────────────────────

test('hasLegacyLayout true when agent .md files exist in flat or module locations', () => {
  const root = tmpProject({ oldLayout: true });
  assert.equal(hasLegacyLayout(root), true);
});

test('hasLegacyLayout true for flat _byan/agents/*.md', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-f11b-'));
  fs.mkdirSync(path.join(root, '_byan', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '_byan', 'agents', 'byan.md'), 'AGENT');
  assert.equal(hasLegacyLayout(root), true);
});

test('hasLegacyLayout false on a migrated Gen3 tree (module dirs kept but no agents/)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-f11c-'));
  // Gen3: agents live under agent/<name>/, module dir kept only for config
  fs.mkdirSync(path.join(root, '_byan', 'agent', 'byan'), { recursive: true });
  fs.writeFileSync(path.join(root, '_byan', 'agent', 'byan', 'byan.md'), 'AGENT');
  fs.mkdirSync(path.join(root, '_byan', 'bmb'), { recursive: true });
  fs.writeFileSync(path.join(root, '_byan', 'bmb', 'config.yaml'), 'byan_version: 2.0.0');
  assert.equal(hasLegacyLayout(root), false);
});

test('hasLegacyLayout false when _byan/<mod>/agents exists but is empty (post-move)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-f11d-'));
  fs.mkdirSync(path.join(root, '_byan', 'bmm', 'agents'), { recursive: true }); // emptied by move
  assert.equal(hasLegacyLayout(root), false);
});
