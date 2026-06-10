#!/usr/bin/env node
import { syncRules, syncAutobench } from '../lib/sync-rules.js';

// CLI wrapper for the byan-sync-rules generator.
// Usage: node bin/byan-sync-rules.js [--root <dir>] [--config <file>]
//
// One command regenerates BOTH generated rulesets: strict mode (syncRules) and
// auto-benchmark (syncAutobench). The --config override applies only to the
// strict source; the autobench source resolves from its own default path so the
// two generators stay independent.

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--config') args.configPath = argv[++i];
  }
  return args;
}

function printReport(title, report) {
  const lines = Object.entries(report).map(
    ([file, action]) => `  ${action.padEnd(9)} ${file}`
  );
  process.stdout.write(`${title}\n${lines.join('\n')}\n`);
}

try {
  const args = parseArgs(process.argv);
  printReport('byan-sync-rules — strict mode artifacts', syncRules(args));
  // Autobench resolves its own source; do not forward the strict --config.
  printReport(
    'byan-sync-rules — auto-benchmark artifacts',
    syncAutobench({ projectRoot: args.projectRoot })
  );
  process.exit(0);
} catch (err) {
  process.stderr.write(`byan-sync-rules failed: ${err.message}\n`);
  process.exit(1);
}
