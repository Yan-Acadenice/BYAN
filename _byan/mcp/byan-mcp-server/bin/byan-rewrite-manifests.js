#!/usr/bin/env node
import { rewritePaths } from '../lib/manifest-reconcile.js';

// Rewrite the path columns of the *-manifest.csv files to their post-migration
// (by-type) locations, using the same authority as the FS mover (mapPath).
// Usage: node bin/byan-rewrite-manifests.js [--root <dir>] [--apply]
// Default is a dry-run (nothing written). Run in the SAME step as the FS move.

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const r = rewritePaths({ projectRoot: args.projectRoot, apply: args.apply });
let total = 0;
process.stdout.write(`[byan-rewrite-manifests] ${r.applied ? 'APPLY' : 'dry-run'}\n`);
for (const [name, m] of Object.entries(r.manifests || {})) {
  total += m.changed || 0;
  process.stdout.write(`  ${name}: ${m.changed || 0} path(s) rewritten (column ${m.column})\n`);
}
process.stdout.write(`  total: ${total}\n`);
if (!r.applied) process.stdout.write('Dry-run only. Re-run with --apply to rewrite.\n');
