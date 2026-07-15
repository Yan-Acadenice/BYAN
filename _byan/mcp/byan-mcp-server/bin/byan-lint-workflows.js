#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateContract, untieredExplorationViolations, untieredAnalysisViolations } from '../lib/workflows-lint.js';

// Validate native workflow scripts under .claude/workflows/ against the full
// contract (state-coupling + clock/RNG + meta-literal) AND node --check syntax.
// Exits non-zero on any contract violation (used by the pre-commit gate).
//
// Tiering is reported SEPARATELY and NON-BLOCKING: exploration-labelled leaves
// that run deep are a possible token saving, but many legitimately stay deep
// (they bear a gate/classification/exact-conversion). So they are an ADVISORY,
// never a hard failure. A one-line summary always prints; --advise lists each one.
// Usage: node bin/byan-lint-workflows.js [--root <dir>] [--advise]

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') args.projectRoot = argv[++i];
    else if (argv[i] === '--advise') args.advise = true;
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
const advisories = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const violations = validateContract(src);

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

  // Non-blocking tiering advisory: exploration + analysis leaves that run deep.
  for (const a of untieredExplorationViolations(src)) {
    advisories.push({ file, ...a });
  }
  for (const a of untieredAnalysisViolations(src)) {
    advisories.push({ file, ...a });
  }
}

// Tiering advisory is informational only — it never changes the exit code.
if (advisories.length) {
  if (args.advise) {
    for (const a of advisories) {
      process.stdout.write(`[byan-lint-workflows] ADVISORY ${a.file}: ${a.id} - ${a.msg}\n`);
    }
  } else {
    process.stdout.write(
      `[byan-lint-workflows] advisory: ${advisories.length} downgrade-eligible leaf(s) run deep (rerun with --advise to list; exploration -> model: 'haiku', analysis -> model: 'sonnet', or keep deep if genuinely hard)\n`
    );
  }
}

if (failed === 0) {
  process.stdout.write(`[byan-lint-workflows] OK - ${files.length} native workflows pass the contract (state, clock/RNG, meta, node --check)\n`);
  process.exit(0);
}
process.exit(1);
