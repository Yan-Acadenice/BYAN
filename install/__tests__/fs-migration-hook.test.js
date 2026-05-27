'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shouldMigrate, runFsMigration } = require('../lib/fs-migration-hook');

function tmpProject({ oldLayout = false, enabledMarker = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-f11-'));
  fs.mkdirSync(path.join(root, '_byan', '_config'), { recursive: true });
  if (oldLayout) {
    for (const m of ['bmm', 'bmb']) fs.mkdirSync(path.join(root, '_byan', m, 'agents'), { recursive: true });
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
  // order: migrate-fs --apply, then reconcile --apply, then build-index
  assert.equal(calls.length, 3);
  assert.match(calls[0], /byan-migrate-fs\.js.*--apply/);
  assert.match(calls[1], /byan-reconcile-manifests\.js.*--apply/);
  assert.match(calls[2], /byan-build-index\.js/);
  // each targets the project root
  for (const c of calls) assert.ok(c.includes(root), 'command targets the project root');
});

test('runFsMigration reports the steps it ran', () => {
  const root = tmpProject({ oldLayout: true, enabledMarker: true });
  const r = runFsMigration({ projectRoot: root, env: {}, exec: () => {}, backup: () => '/bak' });
  assert.deepEqual(r.steps, ['migrate', 'reconcile', 'build-index']);
});
