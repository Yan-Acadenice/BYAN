#!/usr/bin/env node
import { syncRules } from '../lib/sync-rules.js';

// CLI wrapper for the byan-sync-rules generator.
// Usage: node bin/byan-sync-rules.js [--root <dir>] [--config <file>]

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--config') args.configPath = argv[++i];
  }
  return args;
}

try {
  const report = syncRules(parseArgs(process.argv));
  const lines = Object.entries(report).map(([file, action]) => `  ${action.padEnd(9)} ${file}`);
  process.stdout.write('byan-sync-rules — strict mode artifacts\n' + lines.join('\n') + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`byan-sync-rules failed: ${err.message}\n`);
  process.exit(1);
}
