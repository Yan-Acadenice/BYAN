'use strict';

// BYAN FS migration hook (F11) — wires the by-type migration into the yanstaller
// update flow, kept DORMANT by a guard.
//
// It acts only when BOTH conditions hold:
//   1. migration is explicitly enabled (env BYAN_FS_MIGRATE=1, or a marker file
//      _byan/_config/migrate-fs.enabled shipped once the platform adopts the new
//      layout), and
//   2. the project still has the legacy module layout (_byan/{bmm,bmb,tea,cis}).
//
// Otherwise it is a no-op — so current old-layout installs are not touched until
// the platform itself switches to the by-type layout. When it does act it first
// backs up _byan/, then runs the migrator (idempotent + non-destructive, F8),
// the manifest reconcile, and the index rebuild, in that order.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LEGACY_MODULES = ['core', 'bmm', 'bmb', 'tea', 'cis'];

// True iff a directory holds at least one *.md agent file. We probe the agent
// FILES, not the module directory: a migrated tree keeps module dirs around for
// the retained module-scoped infra (e.g. _byan/bmb/config.yaml), so an empty
// _byan/<mod>/agents/ (or its absence) must read as "already migrated".
function hasAgentFiles(dir) {
  try {
    return fs.readdirSync(dir).some((f) => f.endsWith('.md'));
  } catch {
    return false;
  }
}

function hasLegacyLayout(projectRoot) {
  const locations = [path.join(projectRoot, '_byan', 'agents')]; // flat agents
  for (const m of LEGACY_MODULES) {
    locations.push(path.join(projectRoot, '_byan', m, 'agents'));
  }
  return locations.some(hasAgentFiles);
}

function isEnabled({ projectRoot, env }) {
  if (env && env.BYAN_FS_MIGRATE === '1') return true;
  return fs.existsSync(path.join(projectRoot, '_byan', '_config', 'migrate-fs.enabled'));
}

function shouldMigrate({ projectRoot, env = process.env } = {}) {
  if (!projectRoot) return false;
  return isEnabled({ projectRoot, env }) && hasLegacyLayout(projectRoot);
}

function defaultBackup({ projectRoot }) {
  const src = path.join(projectRoot, '_byan');
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const dst = path.join(projectRoot, `_byan.bak-${stamp}`);
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}

function runFsMigration({ projectRoot, env = process.env, exec = execSync, backup = defaultBackup } = {}) {
  if (!shouldMigrate({ projectRoot, env })) {
    return { ran: false, reason: 'guard_not_passed (disabled or no legacy layout)' };
  }

  const backupPath = backup({ projectRoot });
  const binDir = path.join(projectRoot, '_byan', 'mcp', 'byan-mcp-server', 'bin');
  const run = (bin, args = '') =>
    exec(`node "${path.join(binDir, bin)}" --root "${projectRoot}"${args}`, { cwd: projectRoot, stdio: 'inherit' });

  // Full sequence: move the files, then fix every reference to the moved files
  // (content bodies + manifest path columns), dedup, and rebuild the index. The
  // module-wins collision rule in migration-map reconciles flat-vs-module
  // duplicate agents during the move (module canonical, flat -> <name>-flat).
  run('byan-migrate-fs.js', ' --apply');
  run('byan-rewrite-refs.js', ' --apply');
  run('byan-rewrite-manifests.js', ' --apply');
  run('byan-reconcile-manifests.js', ' --apply');
  run('byan-build-index.js');

  return {
    ran: true,
    backup: backupPath,
    steps: ['migrate', 'rewrite-refs', 'rewrite-manifests', 'reconcile', 'build-index'],
  };
}

module.exports = { shouldMigrate, runFsMigration, hasLegacyLayout };
