#!/usr/bin/env node
import { harvest, renderDigest } from '../lib/insight-harvest.js';

// Aggregate native Claude Code outcome trails into a GATED improvement digest.
// Reads: _byan-output/tool-log.jsonl, .byan-strict/audit.log,
//        _byan-output/suitability-ledger.json, _byan/memoire/elo-profile.json
// Missing trail -> empty; digest self-disables gracefully.
//
// Usage: node bin/byan-insight-digest.js [--root <dir>] [--json]

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--root') args.root = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const root = args.root || process.env.CLAUDE_PROJECT_DIR || process.cwd();

const digest = harvest({ rootDir: root });

if (args.json) {
  process.stdout.write(JSON.stringify(digest, null, 2) + '\n');
} else {
  process.stdout.write(renderDigest(digest) + '\n');
}

process.exit(0);
