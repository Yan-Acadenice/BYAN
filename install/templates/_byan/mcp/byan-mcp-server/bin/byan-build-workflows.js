#!/usr/bin/env node
import { buildWorkflowsRegistry } from '../lib/workflows-generator.js';

// Regenerate .claude/workflows/INDEX.md from the workflow manifest.
// Usage: node bin/byan-build-workflows.js [--root <dir>]

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
  }
  return args;
}

const r = buildWorkflowsRegistry(parseArgs(process.argv));
const c = r.counts;
process.stdout.write(
  `[byan-build-workflows] ${r.written ? 'wrote' : 'unchanged'} ${r.path} ` +
    `(autonomous ${c.autonomous}, pipeline ${c.pipeline})\n`
);
