#!/usr/bin/env node
import { reconcile } from '../lib/manifest-reconcile.js';

// Dedup the *-manifest.csv files (same name+path = duplicate; same name + diff
// path = reported collision). Dry-run by default; --apply rewrites the files.
// Usage: node bin/byan-reconcile-manifests.js [--root <dir>] [--apply]

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

const r = reconcile(parseArgs(process.argv));
process.stdout.write(`[byan-reconcile-manifests] ${r.applied ? 'APPLY' : 'dry-run'}\n`);
for (const [name, m] of Object.entries(r.manifests)) {
  process.stdout.write(`  ${name}: removed ${m.removed}, collisions ${m.collisions}` +
    (m.collisionNames.length ? ` (${m.collisionNames.join(', ')})` : '') + '\n');
}
if (!r.applied) process.stdout.write('Dry-run only. Re-run with --apply to rewrite.\n');
