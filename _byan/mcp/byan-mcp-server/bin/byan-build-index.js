#!/usr/bin/env node
import { buildIndex } from '../lib/index-generator.js';

// Regenerate _byan/INDEX.md from the manifests + project zone.
// Usage: node bin/byan-build-index.js [--root <dir>]

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
  }
  return args;
}

const r = buildIndex(parseArgs(process.argv));
const c = r.counts;
process.stdout.write(
  `[byan-build-index] ${r.written ? 'wrote' : 'unchanged'} ${r.path} ` +
    `(agents ${c.agents}, workflows ${c.workflows}, commands ${c.commands}, projects ${c.projects})\n`
);
