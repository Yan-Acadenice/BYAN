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

// Lint one script's source for state coupling. Comment-stripped so a contract
// comment that NAMES fd-state does not self-trip. Returns [{ id, msg }].
export function lintSource(src) {
  const code = stripComments(src);
  const out = [];
  for (const rule of RULES) {
    if (rule.re.test(code)) out.push({ id: rule.id, msg: rule.msg });
  }
  return out;
}

// Wall-clock / RNG primitives break the Workflow runtime's resume (the launch
// validator rejects them). It scans the RAW text, so a token in a COMMENT or a
// string literal breaks invocation just the same - we therefore check the raw
// source, NOT the comment-stripped one. This is the exact failure that a manual
// review caught while porting; mechanizing it here keeps it from recurring.
const CLOCK_RNG_RE = /Date\.now|Math\.random|new Date/;

export function clockRngViolations(src) {
  const m = String(src).match(CLOCK_RNG_RE);
  if (!m) return [];
  return [{
    id: 'clock-or-rng',
    msg: `wall-clock/RNG token "${m[0]}" is forbidden anywhere in a native workflow (breaks resume; the launch validator scans raw text - even comments and strings). Pass timestamps/ids via args.`,
  }];
}

// A native workflow script must start with a pure `export const meta = {` literal
// (after an optional shebang and blank lines). Otherwise the launch validator
// rejects it.
export function metaLiteralViolations(src) {
  const body = String(src).replace(/^﻿/, '');
  const firstReal = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#!'));
  if (firstReal && /^export const meta\s*=\s*\{/.test(firstReal)) return [];
  return [{
    id: 'meta-literal-first',
    msg: 'a native workflow script must begin with `export const meta = {` (pure literal) after an optional shebang',
  }];
}

// Full native-workflow contract: state-coupling (comment-stripped) + clock/RNG
// (raw) + meta-literal-first. Returns the combined [{ id, msg }] violations.
export function validateContract(src) {
  return [...lintSource(src), ...clockRngViolations(src), ...metaLiteralViolations(src)];
}

// Lint every *.js in a directory (non-recursive; native workflows are flat)
// against the FULL contract. Returns [{ file, violations }] for offending files.
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
    const violations = validateContract(fs.readFileSync(file, 'utf8'));
    if (violations.length) results.push({ file, violations });
  }
  return results;
}
