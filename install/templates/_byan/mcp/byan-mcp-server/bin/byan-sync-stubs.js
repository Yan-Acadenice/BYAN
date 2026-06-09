#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { applyFix, check, STUB_DIRS } from '../lib/stub-sync.js';

// Normalize stale _bmad / @bmad PATH references in tracked agent stubs to the
// _byan/ canonical form. Two modes:
//   (default) fix : rewrite stale path tokens in place (atomic per file).
//   --check       : report any residual stale ref and exit non-zero (no writes).
//                   This is the pre-commit gate's entry point.
// Usage: node bin/byan-sync-stubs.js [--check] [--root <dir>]

function parseArgs(argv) {
  const args = { check: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--root') args.projectRoot = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const root = args.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Self-disable when none of the stub dirs exist (installed-user no-op).
const anyDir = STUB_DIRS.some(
  (d) => fs.existsSync(path.join(root, d)) || fs.existsSync(path.join(root, 'install', 'templates', d)),
);
if (!anyDir) {
  process.stdout.write('[byan-sync-stubs] no stub directories - nothing to normalize\n');
  process.exit(0);
}

if (args.check) {
  const { stale, ok, scanned } = check({ rootDir: root });
  if (ok) {
    process.stdout.write(`[byan-sync-stubs] OK - ${scanned} stubs free of stale _bmad/@bmad path refs\n`);
    process.exit(0);
  }
  for (const { file, refs } of stale) {
    process.stderr.write(`[byan-sync-stubs] stale: ${file} -> ${refs.join(', ')}\n`);
  }
  process.stderr.write(
    `[byan-sync-stubs] FAIL - ${stale.length} stub(s) carry stale path refs. Run: node bin/byan-sync-stubs.js\n`,
  );
  process.exit(1);
}

const { fixed, scanned } = applyFix({ rootDir: root });
process.stdout.write(`[byan-sync-stubs] normalized - ${fixed.length} stub(s) fixed of ${scanned} scanned\n`);
process.exit(0);
