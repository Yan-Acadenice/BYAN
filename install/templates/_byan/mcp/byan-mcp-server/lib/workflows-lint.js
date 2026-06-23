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
import { isKnownTierModel, isDowngradeModel, classifyLeaf, LEAF_TYPES } from './native-tiers.js';

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

// Model-routing anti-downgrade guard (enforcement-bridge F3).
//
// A native leaf may pin a CHEAPER model (opts.model) ONLY when it is an
// EXPLORATION leaf (read/load/parse/detect). Implement, verify and analysis
// leaves must inherit the session model (no opts.model). This is the structural
// net that stops a cheap model from silently landing on a heavy leaf — the exact
// STRICT-2 (No Downgrade) line. The source of truth for tiers and leaf
// classification is native-tiers.js; this rule only enforces it.
//
// Parsing is comment-stripped (a model: token in a comment is not a real call).
// Each model: is keyed to the nearest preceding label: within the SAME opts
// object (no intervening }). Downgraded leaves carry static-string labels by
// convention, so a quoted-literal match is sufficient.
const MODEL_RE = /\bmodel:\s*(['"`])([^'"`]*)\1/g;
const LABEL_RE = /\blabel:\s*(['"`])([^'"`]*)\1/g;

function nearestLabelBefore(code, modelIndex) {
  const before = code.slice(0, modelIndex);
  let last = null;
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(before))) {
    last = { value: m[2], end: m.index + m[0].length };
  }
  if (!last) return null;
  // Same object only: an object-close between the label and the model means the
  // label belongs to a different (earlier) call.
  if (before.slice(last.end).includes('}')) return null;
  return last.value;
}

export function modelRoutingViolations(src) {
  const code = stripComments(src);
  const out = [];
  let m;
  MODEL_RE.lastIndex = 0;
  while ((m = MODEL_RE.exec(code))) {
    const model = m[2];
    if (!isKnownTierModel(model)) {
      out.push({
        id: 'unknown-tier-model',
        msg: `opts.model '${model}' is not a known downgrade tier (cheap/balanced); never pin up — omit opts.model to inherit the session model on deep leaves`,
      });
      continue;
    }
    const label = nearestLabelBefore(code, m.index);
    if (!label) {
      out.push({
        id: 'downgrade-without-label',
        msg: `a model downgrade ('${model}') must sit on a labelled exploration leaf; no label found in this opts object`,
      });
      continue;
    }
    if (isDowngradeModel(model) && classifyLeaf({ label }) !== LEAF_TYPES.EXPLORATION) {
      out.push({
        id: 'protected-leaf-downgraded',
        msg: `leaf '${label}' is not exploration but carries downgrade model '${model}'; only read/load/parse/detect leaves may downgrade (STRICT-2 No Downgrade)`,
      });
    }
  }
  return out;
}

// Positive tiering ADVISORY — the symmetric half of modelRoutingViolations.
//
// modelRoutingViolations stops a downgrade from landing on a PROTECTED leaf
// (the anti-downgrade direction, a HARD contract rule). This function surfaces the
// opposite signal: an EXPLORATION-labelled leaf (read/load/parse/detect) that does
// NOT downgrade and so runs on the session model (Opus) for cheap I/O — a possible
// token saving. It is NON-BLOCKING (the bin's --advise mode, not validateContract):
// classifyLeaf is permissive, so a flagged leaf may legitimately stay deep when it
// bears judgment (a gate, a classification, an exact conversion). The human owns
// the call. Same source of truth: classifyLeaf + isDowngradeModel from
// native-tiers.js; this only reports against the contract those encode.
//
// Membership: a model: token belongs to a label when it sits in the SAME opts
// object — between the brace that closes the previous object and the one that
// closes this label's object — so the rule is order-independent (model: may sit
// before OR after label: within { ... }). Comment-stripped, like the others.
//
// Conservative by construction: only STATIC quoted/backtick labels are seen, and
// only labels classifyLeaf rules EXPLORATION fire. A computed (unquoted) label or
// a non-exploration label is never flagged, so the rule never forces a downgrade
// onto protected or unclassifiable work — it only recovers the safe savings.
function sameOptsObjectText(code, labelStart, labelEnd) {
  const prevClose = code.lastIndexOf('}', labelStart);
  const left = prevClose === -1 ? 0 : prevClose + 1;
  const nextClose = code.indexOf('}', labelEnd);
  const right = nextClose === -1 ? code.length : nextClose;
  return code.slice(left, right);
}

function objectHasDowngradeModel(objText) {
  let mm;
  MODEL_RE.lastIndex = 0;
  while ((mm = MODEL_RE.exec(objText))) {
    if (isDowngradeModel(mm[2])) return true;
  }
  return false;
}

export function untieredExplorationViolations(src) {
  const code = stripComments(src);
  const out = [];
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(code))) {
    const label = m[2];
    if (classifyLeaf({ label }) !== LEAF_TYPES.EXPLORATION) continue;
    const objText = sameOptsObjectText(code, m.index, m.index + m[0].length);
    if (!objectHasDowngradeModel(objText)) {
      out.push({
        id: 'untiered-exploration',
        msg: `exploration leaf '${label}' does not pin a downgrade model; add model: 'haiku' so cheap I/O does not run on the session model (token waste)`,
      });
    }
  }
  return out;
}

// Full native-workflow contract: state-coupling (comment-stripped) + clock/RNG
// (raw) + meta-literal-first + model-routing anti-downgrade. Returns the
// combined [{ id, msg }] violations.
//
// untieredExplorationViolations is DELIBERATELY NOT in the hard contract. The
// tiering rule is a FLOOR (forbid a downgrade on a protected leaf), not a CEILING
// (force every exploration-labelled leaf to downgrade). classifyLeaf is permissive
// — many exploration-labelled leaves bear judgment (a HALT/prereq gate, a
// classification, an exact conversion consumed verbatim downstream) and MUST stay
// deep. Forcing them to haiku would be the exact STRICT-2 No Downgrade regression.
// So the positive check ships as a non-blocking ADVISORY (the bin's --advise mode);
// the human keeps the per-leaf judgment. See docs/native-workflows-contract.md.
export function validateContract(src) {
  return [
    ...lintSource(src),
    ...clockRngViolations(src),
    ...metaLiteralViolations(src),
    ...modelRoutingViolations(src),
  ];
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
