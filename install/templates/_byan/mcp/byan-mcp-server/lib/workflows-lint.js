// Linter for native workflow scripts (enforcement-bridge F3).
//
// A .claude/workflows/*.js runs OUTSIDE the conversation turn, so BYAN's
// main-thread hooks (strict-scope-guard, strict-stop-guard, fd-phase-guard) do
// not fire for it. The structural net that survives is this lint + the
// pre-commit gate: a native script must NOT couple directly to BYAN state
// internals. State goes through the byan_fd_* / byan_strict_* MCP tools.
//
// Forbidden: importing/requiring lib/fd-state.js (or the strict-mode lib).
// Comments are stripped before matching so the contract comment in a script
// that NAMES fd-state.js (to explain the rule) does not self-trip.

import fs from 'node:fs';
import path from 'node:path';

// Strip /* block */ and // line comments. Preserve "://" inside strings (URLs)
// by only treating // as a comment when not preceded by a colon.
export function stripComments(src) {
  let s = String(src).replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return s;
}

const RULES = [
  {
    id: 'import-fd-state',
    re: /\bimport\b[^\n;]*?from\s*['"][^'"]*fd-state[^'"]*['"]/,
    msg: 'import of fd-state is forbidden; mutate FD state via the byan_fd_* MCP tools',
  },
  {
    id: 'require-fd-state',
    re: /\brequire\s*\(\s*['"][^'"]*fd-state[^'"]*['"]\s*\)/,
    msg: 'require of fd-state is forbidden; mutate FD state via the byan_fd_* MCP tools',
  },
  {
    id: 'dynamic-import-fd-state',
    re: /\bimport\s*\(\s*['"][^'"]*fd-state[^'"]*['"]\s*\)/,
    msg: 'dynamic import of fd-state is forbidden; mutate FD state via the byan_fd_* MCP tools',
  },
  {
    id: 'import-strict-mode-lib',
    re: /\b(?:import\b[^\n;]*?from\s*|require\s*\(\s*|import\s*\(\s*)['"][^'"]*lib\/strict-mode[^'"]*['"]/,
    msg: 'import of the strict-mode lib is forbidden; use the byan_strict_* MCP tools',
  },
];

// Lint one script's source. Returns an array of { id, msg } violations.
export function lintSource(src) {
  const code = stripComments(src);
  const out = [];
  for (const rule of RULES) {
    if (rule.re.test(code)) out.push({ id: rule.id, msg: rule.msg });
  }
  return out;
}

// Lint every *.js in a directory (non-recursive; native workflows are flat).
// Returns [{ file, violations }] for files that have at least one violation.
export function lintWorkflowsDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
  const results = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.js')) continue;
    const file = path.join(dir, e.name);
    const violations = lintSource(fs.readFileSync(file, 'utf8'));
    if (violations.length) results.push({ file, violations });
  }
  return results;
}
