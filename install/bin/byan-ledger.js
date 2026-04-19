#!/usr/bin/env node
/**
 * BYAN token ledger CLI.
 *
 * Usage :
 *   byan-ledger                  # full session summary
 *   byan-ledger --json           # machine-readable
 *   byan-ledger --since 2026-04-19T15:00:00Z
 *   byan-ledger --root <dir>     # override project root
 */

const path = require('path');
const { readLog, summarize, renderReport, defaultLogPath } = require('../lib/token-ledger');

function parseArgs(argv) {
  const out = { json: false, since: null, root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--since') out.since = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('byan-ledger [--json] [--since <iso>] [--root <dir>]');
    process.exit(0);
  }

  const logPath = defaultLogPath(path.resolve(args.root));
  const entries = readLog(logPath);
  const stats = summarize(entries, { since: args.since });

  if (args.json) {
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
  } else {
    process.stdout.write(renderReport(stats) + '\n');
  }
}

main();
