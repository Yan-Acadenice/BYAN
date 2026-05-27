#!/usr/bin/env node
import { migrate } from '../lib/migrate-fs.js';

// Migrate the legacy _byan/ layout to the new by-type layout.
// Usage: node bin/byan-migrate-fs.js [--root <dir>] [--apply]
// Default is a dry-run (nothing is moved). Pass --apply to perform the moves.

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const r = migrate(args);
const n = (a) => a.length;
process.stdout.write(
  `[byan-migrate-fs] ${r.applied ? 'APPLY' : 'dry-run'} — ` +
    `moved ${n(r.moved)}, kept ${n(r.kept)}, skipped ${n(r.skipped)}, ` +
    `manual ${n(r.manual)}, conflicts ${n(r.conflicts)}\n`
);
if (r.conflicts.length > 0) {
  process.stdout.write('Conflicts (target exists, source preserved):\n');
  for (const c of r.conflicts) process.stdout.write(`  ${c.from} -> ${c.to}\n`);
}
if (!r.applied) {
  process.stdout.write('Dry-run only. Re-run with --apply to perform the moves.\n');
}
