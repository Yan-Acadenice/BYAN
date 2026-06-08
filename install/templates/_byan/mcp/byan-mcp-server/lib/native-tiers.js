// Single source of truth for MODEL ROUTING of native-workflow leaves.
//
// Claude Code's in-CLI Workflow tool runs each agent() leaf on the main-loop
// model unless that call sets opts.model. Ported BYAN workflows never set it,
// so every leaf ran on the session model (Opus) — the read-the-file leaf paid
// the same tier as the implement-and-verify leaf. This module is the one place
// that decides a leaf's model tier, so the rule lives once and the linter
// (workflows-lint.js) can enforce it.
//
// This is a DISTINCT concern from src/byan-v2/dispatcher/complexity-scorer.js,
// which scores task COMPLEXITY (0-100) to route a whole task to an executor.
// That scorer answers "how hard is this task"; this module answers "which model
// tier does this workflow LEAF deserve". They share the same exploration intent
// but produce different outputs, so they stay separate (clarified, not merged).
//
// The sandbox forbids import INSIDE a .claude/workflows/*.js script, so a script
// cannot require() this file at runtime. The contract it encodes is instead a
// literal (model: 'haiku') the author writes on exploration leaves, validated
// against this module by the linter. This module is the canonical reference.

// The three-tier vocabulary. cheap/balanced are explicit downgrades; deep is the
// default and means "inherit the main-loop model".
export const TIERS = Object.freeze({ CHEAP: 'cheap', BALANCED: 'balanced', DEEP: 'deep' });

// tier -> concrete opts.model value, or null = OMIT opts.model (inherit).
//
// deep MUST be null. Omitting opts.model lets the leaf inherit whatever model the
// session runs (Opus by default, but Sonnet if the user chose Sonnet). We never
// PIN UP — pinning a leaf to a fixed high tier would override the user's session
// choice and could silently DOWNGRADE a Sonnet/Opus session's heavy leaf. Only
// cheap/balanced carry a value, and only exploration leaves ever get one.
//
// Values are the harness model-selection aliases (same set as the Agent tool:
// 'haiku' | 'sonnet' | 'opus'). They are version-independent. If a future
// runtime needs full model ids, this map is the ONLY edit — the linter then
// flags every script literal that drifts from it, so the fan-out stays bounded.
export const TIER_MODEL = Object.freeze({ cheap: 'haiku', balanced: 'sonnet', deep: null });

// Leaf task-type taxonomy. EXPLORATION is the only downgrade-safe class; the
// other three are protected (never downgraded).
export const LEAF_TYPES = Object.freeze({
  EXPLORATION: 'exploration',
  IMPLEMENTATION: 'implementation',
  VERIFICATION: 'verification',
  ANALYSIS: 'analysis',
});

// Label keyword sets, matched as substrings on the leaf LABEL (not the prompt —
// see classifyLeaf). Protected sets are checked first so any protected signal
// beats an exploration signal (conservative: when in doubt, do not downgrade).
// Note: 'test' is deliberately ABSENT. It collides both ways — 'discover-tests'
// is exploration (find the test files) while 'test-design' is analysis — so the
// bare token decides nothing. Real verification leaves carry verify/validate/
// check/review/gate/audit/assert/lint; a leaf that runs tests is labelled
// 'verify-*' in practice.
const VERIFICATION_KEYWORDS = ['verify', 'validate', 'check', 'assert', 'gate', 'lint', 'audit', 'review'];
const ANALYSIS_KEYWORDS = ['analy', 'design', 'architect', 'assess', 'evaluate', 'strategy', 'risk', 'nfr', 'recommend', 'judge', 'score', 'coverage'];
const IMPLEMENTATION_KEYWORDS = ['implement', 'build', 'write', 'generate', 'create', 'dev', 'rgr', 'refactor', 'fix', 'scaffold', 'save', 'optimize', 'aggregate', 'report', 'present', 'plan', 'map', 'select', 'subprocess', 'sub-'];
const EXPLORATION_KEYWORDS = ['load', 'read', 'scan', 'list', 'parse', 'detect', 'discover', 'fetch', 'lookup', 'source-tree', 'mode-detection'];

function matchesAny(text, keywords) {
  return keywords.some((kw) => text.includes(kw));
}

// classifyLeaf({ label }) -> a LEAF_TYPES value.
//
// Keys off the LABEL, deliberately NOT the prompt. A leaf's prompt is noisy: an
// exploration leaf like load-story says "Read... Parse... Report the story key",
// and 'report' would wrongly pull it to implementation. The label is the curated,
// stable signal the author controls. Priority is protect-first: VERIFICATION,
// then ANALYSIS, then IMPLEMENTATION, then EXPLORATION. Anything unmatched
// defaults to IMPLEMENTATION (deep), so an unknown leaf is never downgraded.
export function classifyLeaf(leaf) {
  const label = String((leaf && leaf.label) || '').toLowerCase();
  if (!label) return LEAF_TYPES.IMPLEMENTATION;
  if (matchesAny(label, VERIFICATION_KEYWORDS)) return LEAF_TYPES.VERIFICATION;
  if (matchesAny(label, ANALYSIS_KEYWORDS)) return LEAF_TYPES.ANALYSIS;
  if (matchesAny(label, IMPLEMENTATION_KEYWORDS)) return LEAF_TYPES.IMPLEMENTATION;
  if (matchesAny(label, EXPLORATION_KEYWORDS)) return LEAF_TYPES.EXPLORATION;
  return LEAF_TYPES.IMPLEMENTATION;
}

// tierFor(taskType) -> a TIERS value. Conservative auto-routing: only EXPLORATION
// is downgraded (cheap); every other type stays deep. BALANCED is part of the
// vocabulary but is never auto-assigned — it exists for an explicit, manual
// opt-in on a leaf an author judges mid-weight. Automation only ever picks
// cheap or deep.
export function tierFor(taskType) {
  return taskType === LEAF_TYPES.EXPLORATION ? TIERS.CHEAP : TIERS.DEEP;
}

// modelForLeaf({ label }) -> the opts.model value to write (a string) or null
// (omit opts.model). This is what F2 stamps onto exploration leaves.
export function modelForLeaf(leaf) {
  return TIER_MODEL[tierFor(classifyLeaf(leaf))];
}

// isKnownTierModel(modelId) -> true if modelId is one of the concrete downgrade
// models (cheap/balanced). Used by the linter to reject an opts.model literal
// that is not a recognised tier. null/'' are not "known" (deep = omission, not a
// literal). 'opus' is intentionally NOT known — we never pin up.
export function isKnownTierModel(modelId) {
  if (!modelId) return false;
  return Object.values(TIER_MODEL).filter(Boolean).includes(modelId);
}

// isDowngradeModel(modelId) -> true if modelId pins a leaf BELOW the inherited
// tier (cheap or balanced). The linter's anti-downgrade rule uses this: a
// protected leaf must never carry a downgrade model.
export function isDowngradeModel(modelId) {
  return modelId === TIER_MODEL.cheap || modelId === TIER_MODEL.balanced;
}
