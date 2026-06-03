#!/usr/bin/env node
import path from 'node:path';
import { lintWorkflowsDir } from '../lib/workflows-lint.js';

// Lint native workflow scripts under .claude/workflows/. Exits non-zero on any
// violation (used by the pre-commit gate). Usage: node bin/byan-lint-workflows.js [--root <dir>]

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const root = args.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = path.join(root, '.claude', 'workflows');
const results = lintWorkflowsDir(dir);

if (results.length === 0) {
  process.stdout.write('[byan-lint-workflows] OK — no forbidden state coupling in .claude/workflows/\n');
  process.exit(0);
}

for (const r of results) {
  for (const v of r.violations) {
    process.stderr.write(`[byan-lint-workflows] ${r.file}: ${v.id} — ${v.msg}\n`);
  }
}
process.exit(1);
