#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateContract } from '../lib/workflows-lint.js';

// Validate native workflow scripts under .claude/workflows/ against the full
// contract (state-coupling + clock/RNG + meta-literal) AND node --check syntax.
// Exits non-zero on any violation (used by the pre-commit gate).
// Usage: node bin/byan-lint-workflows.js [--root <dir>]

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

let files = [];
try {
  files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => path.join(dir, e.name));
} catch (_e) {
  process.stdout.write('[byan-lint-workflows] no .claude/workflows/ directory - nothing to lint\n');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const violations = validateContract(fs.readFileSync(file, 'utf8'));

  // Syntax gate: a native script must parse.
  try {
    execFileSync('node', ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    violations.push({ id: 'node-check', msg: `node --check failed: ${String(e.stderr || e.message).split('\n')[0]}` });
  }

  if (violations.length) {
    failed += 1;
    for (const v of violations) {
      process.stderr.write(`[byan-lint-workflows] ${file}: ${v.id} - ${v.msg}\n`);
    }
  }
}

if (failed === 0) {
  process.stdout.write(`[byan-lint-workflows] OK - ${files.length} native workflows pass the contract (state, clock/RNG, meta, node --check)\n`);
  process.exit(0);
}
process.exit(1);
