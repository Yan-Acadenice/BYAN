#!/usr/bin/env node
import { evaluateGate } from '../lib/precommit-gate.js';

// Pre-commit entry for the BYAN Strict Mode gate.
// Usage: node bin/strict-precommit-gate.js [--root <dir>]
// Exit 0 = allow commit, exit 1 = block commit.

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
  }
  return args;
}

const result = await evaluateGate(parseArgs(process.argv));
if (result.pass) {
  process.exit(0);
}
process.stderr.write(`[byan strict gate] BLOCK: ${result.reason}\n`);
process.exit(1);
