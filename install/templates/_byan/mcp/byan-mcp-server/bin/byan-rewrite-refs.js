#!/usr/bin/env node
import { rewriteTree } from '../lib/rewrite-refs.js';

// Rewrite intra-file _byan/ path references to their post-migration location.
// Usage: node bin/byan-rewrite-refs.js [--root <dir>] [--apply] [--verbose]
// Default is a dry-run (nothing is written). Pass --apply to rewrite in place.
// Run this in the SAME atomic step as byan-migrate-fs --apply (after the moves).

function parseArgs(argv) {
  const args = { apply: false, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--verbose') args.verbose = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const r = rewriteTree({ projectRoot: args.projectRoot, apply: args.apply });
process.stdout.write(
  `[byan-rewrite-refs] ${r.applied ? 'APPLY' : 'dry-run'} — ` +
    `scanned ${r.filesScanned}, changed ${r.filesChanged}, refs rewritten ${r.refsRewritten}\n`
);
if (args.verbose) {
  for (const f of r.files) {
    process.stdout.write(`  ${f.file} (${f.count})\n`);
    for (const c of f.changes) process.stdout.write(`      ${c.from} -> ${c.to}\n`);
  }
}
if (!r.applied) {
  process.stdout.write('Dry-run only. Re-run with --apply to rewrite in place.\n');
}
