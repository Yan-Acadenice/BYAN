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
// PIN UP (nothing is ever forced to opus). cheap/balanced carry a value:
// exploration leaves get cheap (haiku); explicit mech- leaves AND analysis leaves
// get balanced (sonnet). Analysis routing to balanced is a deliberate downgrade of
// the session model for judgment-but-not-frontier work (score/rank/assess/nfr/
// coverage/recommend) — the heaviest workflow prompts, which rarely need the top
// model; the 'deep-' label prefix opts a hard analysis leaf back to the session
// model. VERIFICATION and IMPLEMENTATION still inherit (deep).
//
// Values are the harness model-selection aliases (same set as the Agent tool:
// 'haiku' | 'sonnet' | 'opus'). They are version-independent. If a future
// runtime needs full model ids, this map is the ONLY edit — the linter then
// flags every script literal that drifts from it, so the fan-out stays bounded.
export const TIER_MODEL = Object.freeze({ cheap: 'haiku', balanced: 'sonnet', deep: null });

// Leaf task-type taxonomy. EXPLORATION (cheap) and MECHANICAL + ANALYSIS
// (balanced) are the downgrade classes; VERIFICATION and IMPLEMENTATION stay
// protected (deep, inherit the session model). MECHANICAL is verification whose
// outcome is binary and judgment-free (JSON parses, schema matches, lint passes,
// a test suite exits 0). ANALYSIS bears judgment (score/rank/assess/design/nfr/
// coverage) but rarely the frontier reasoning that needs the top model, so it
// auto-routes to balanced (sonnet) — escapable per-leaf via the 'deep-' prefix.
// Semantic/adversarial VERIFICATION stays deep (a wrong check corrupts silently).
export const LEAF_TYPES = Object.freeze({
  EXPLORATION: 'exploration',
  MECHANICAL: 'mechanical',
  IMPLEMENTATION: 'implementation',
  VERIFICATION: 'verification',
  ANALYSIS: 'analysis',
});

// MECHANICAL is opt-in ONLY, through this label prefix ('mech-validate-json').
// No keyword fuzziness: 'validate-json' without the prefix stays VERIFICATION
// (protected). The prefix is an explicit authoring act — the author asserts
// "this check is binary and judgment-free", and the linter can then hold the
// script to it (a mech- leaf must carry model: 'sonnet', nothing else).
export const MECHANICAL_PREFIX = 'mech-';

// DEEP_PREFIX is the ANALYSIS escape hatch. Analysis auto-routes to balanced
// (sonnet); a 'deep-' label prefix opts a specific analysis leaf back OUT of that
// downgrade and onto the protected deep default (inherit the session model), for
// genuinely frontier reasoning. Parallel to MECHANICAL_PREFIX: an explicit
// authoring act the linter honours. 'deep-assess-architecture' rides the session
// model; 'assess-architecture' rides sonnet. The prefix wins over keyword class.
export const DEEP_PREFIX = 'deep-';

// Label keyword sets, matched as substrings on the leaf LABEL (not the prompt —
// see classifyLeaf). Protected sets are checked first so any protected signal
// beats an exploration signal (conservative: when in doubt, do not downgrade).
// Note: 'test' is deliberately ABSENT. It collides both ways — 'discover-tests'
// is exploration (find the test files) while 'test-design' is analysis — so the
// bare token decides nothing. Real verification leaves carry verify/validate/
// check/review/gate/audit/assert/lint; a leaf that runs tests is labelled
// 'verify-*' in practice.
const VERIFICATION_KEYWORDS = ['verify', 'validate', 'check', 'assert', 'gate', 'lint', 'audit', 'review'];
const ANALYSIS_KEYWORDS = ['analy', 'design', 'architect', 'assess', 'evaluate', 'strategy', 'risk', 'nfr', 'recommend', 'judge', 'score', 'coverage', 'synthes'];
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
  // Explicit opt-in prefixes beat every keyword class (the author's declared
  // intent is the signal): mech- -> balanced; deep- -> the protected deep default
  // (the analysis escape hatch, classified as the deep IMPLEMENTATION bucket).
  if (label.startsWith(MECHANICAL_PREFIX)) return LEAF_TYPES.MECHANICAL;
  if (label.startsWith(DEEP_PREFIX)) return LEAF_TYPES.IMPLEMENTATION;
  if (matchesAny(label, VERIFICATION_KEYWORDS)) return LEAF_TYPES.VERIFICATION;
  if (matchesAny(label, ANALYSIS_KEYWORDS)) return LEAF_TYPES.ANALYSIS;
  if (matchesAny(label, IMPLEMENTATION_KEYWORDS)) return LEAF_TYPES.IMPLEMENTATION;
  if (matchesAny(label, EXPLORATION_KEYWORDS)) return LEAF_TYPES.EXPLORATION;
  return LEAF_TYPES.IMPLEMENTATION;
}

// tierFor(taskType) -> a TIERS value. Auto-routing: EXPLORATION -> cheap (haiku);
// MECHANICAL and ANALYSIS -> balanced (sonnet); VERIFICATION and IMPLEMENTATION
// stay deep (inherit the session model). MECHANICAL reaches balanced only through
// the explicit mech- opt-in; ANALYSIS reaches it by keyword classification (it is
// the judgment-but-not-frontier class), with the deep- prefix as the per-leaf
// escape back to deep. No path ever lands opus (no pin-up).
export function tierFor(taskType) {
  if (taskType === LEAF_TYPES.EXPLORATION) return TIERS.CHEAP;
  if (taskType === LEAF_TYPES.MECHANICAL) return TIERS.BALANCED;
  if (taskType === LEAF_TYPES.ANALYSIS) return TIERS.BALANCED;
  return TIERS.DEEP;
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
