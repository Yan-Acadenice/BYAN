// F1 — the dispatch BRAIN. Single source of truth for the intelligent dispatch:
// given a task's NATURE and COMPLEXITY, decide which RUNTIME runs it (Codex or
// Claude), which MODEL, and (Codex only) which reasoning EFFORT.
//
// It composes with, does not duplicate, native-tiers.js: the Claude-side model
// tier is delegated to that module's TIER_MODEL vocabulary (which, by design,
// only ever yields haiku / sonnet / null — so Fable can never leak in from the
// Claude side either). This module adds the two NEW axes the intelligent dispatch
// needs — runtime selection and Codex reasoning effort — on top of it.
//
// Routing table is the cross-checked result (5 independent sources, see
// docs / CHANGELOG): Codex wins autonomous execution, shell/CI/DevOps, deploy,
// browser/computer use ; Claude wins architecture, refactor-at-repo-scale,
// quality, planning, and ALL verification. Two hard red lines are enforced here,
// not left to the caller:
//   1. Fable is NEVER emitted (long-term product decision).
//   2. Verification is NEVER routed to Codex (a runtime must not grade its own
//      work ; the reviewer stays on Claude).
//
// Pure: no I/O, no clock, deterministic. The Codex transport (F2) and the
// orchestrating loop (F4) consume this; they never re-decide routing.

import { TIER_MODEL } from './native-tiers.js';

export const RUNTIMES = Object.freeze({ CODEX: 'codex', CLAUDE: 'claude' });

// Codex runs on the ChatGPT-subscription entitled model. Kept as a named constant
// so a plan change is a one-line edit, not a scatter of string literals.
export const CODEX_MODEL = 'gpt-5.4';

export const EFFORTS = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });

// Models we refuse to emit, ever. Fable is excluded by explicit long-term
// decision; the guard makes that refusal mechanical rather than a convention.
export const FORBIDDEN_MODELS = Object.freeze(['fable', 'claude-fable-5']);

// Task natures that route to Codex. Everything NOT here (and not a verification
// nature) falls through to Claude — Claude is the safe default, so an unknown or
// ambiguous nature keeps judgment on Claude rather than gambling it on Codex.
const CODEX_NATURES = Object.freeze([
  'execution', 'exec', 'shell', 'terminal', 'command',
  'deploy', 'deployment', 'devops', 'ci', 'cd', 'pipeline',
  'scripting', 'script', 'automation', 'browser', 'computer-use', 'e2e-run',
]);

// Natures that MUST stay on Claude even if a future edit mislabels them — the
// verification red line. Checked before the Codex table so it can never be
// overridden by a nature that also looks like execution (e.g. "run-and-verify").
const VERIFICATION_NATURES = Object.freeze([
  'verification', 'verify', 'validate', 'review', 'audit', 'check', 'qa',
]);

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function matchesAny(text, list) {
  return list.some((kw) => text.includes(kw));
}

// assertNoFable(model) — mechanical enforcement of red line #1. Throws rather
// than silently substituting, so a Fable request is a loud failure at the source.
export function assertNoFable(model) {
  const m = normalize(model);
  if (FORBIDDEN_MODELS.some((f) => m.includes(f))) {
    throw new Error(`dispatch-router: forbidden model "${model}" (Fable is excluded by long-term policy)`);
  }
  return model;
}

// isVerification(nature) — red line #2 helper. A verification nature never leaves
// Claude.
export function isVerification(nature) {
  return matchesAny(normalize(nature), VERIFICATION_NATURES);
}

// routeRuntime(nature) -> 'codex' | 'claude'. Verification wins first (stays
// Claude), then the Codex table, else Claude (safe default).
export function routeRuntime(nature) {
  const n = normalize(nature);
  if (isVerification(n)) return RUNTIMES.CLAUDE;
  if (matchesAny(n, CODEX_NATURES)) return RUNTIMES.CODEX;
  return RUNTIMES.CLAUDE;
}

// Map a complexity input to a coarse bucket. Accepts a 0-100 number (the
// complexity-scorer scale) OR a label (trivial/low/medium/high/hard). Anything
// unrecognised is treated as medium — a safe middle that neither over-spends nor
// under-powers.
export function complexityBucket(complexity) {
  if (typeof complexity === 'number' && Number.isFinite(complexity)) {
    if (complexity < 34) return EFFORTS.LOW;
    if (complexity < 67) return EFFORTS.MEDIUM;
    return EFFORTS.HIGH;
  }
  const c = normalize(complexity);
  if (['trivial', 'low', 'simple', 'easy'].includes(c)) return EFFORTS.LOW;
  if (['high', 'hard', 'complex', 'frontier'].includes(c)) return EFFORTS.HIGH;
  return EFFORTS.MEDIUM;
}

// effortForComplexity(complexity) -> a Codex reasoning-effort value. Codex is the
// only side with a real effort knob (`codex exec -c model_reasoning_effort=...`);
// this maps complexity onto it 1:1 with the bucket.
export function effortForComplexity(complexity) {
  return complexityBucket(complexity);
}

// claudeModelForComplexity(complexity) -> 'haiku' | 'sonnet' | null(omit=inherit).
// Delegates to native-tiers' TIER_MODEL so the Claude vocabulary stays in one
// place: low -> cheap(haiku), medium -> balanced(sonnet), high -> deep(null =
// inherit the session model, i.e. Opus on an Opus session). Fable is structurally
// impossible here (TIER_MODEL has no Fable entry), but we still assert to make the
// guarantee explicit and catch a future TIER_MODEL drift.
export function claudeModelForComplexity(complexity) {
  const bucket = complexityBucket(complexity);
  const model = bucket === EFFORTS.LOW
    ? TIER_MODEL.cheap
    : bucket === EFFORTS.MEDIUM
      ? TIER_MODEL.balanced
      : TIER_MODEL.deep; // null = inherit (never pinned to Fable)
  return model == null ? null : assertNoFable(model);
}

// dispatch({ nature, complexity }) -> the full routing decision:
//   { runtime, model, effort, reasoning }
// - Codex: model = CODEX_MODEL, effort = complexity bucket (the real knob).
// - Claude: model = haiku/sonnet/null(inherit), effort = null (Claude has no
//   effort knob — its "effort" IS the model tier).
// Both red lines are enforced here regardless of caller input.
export function dispatch({ nature, complexity } = {}) {
  const runtime = routeRuntime(nature);
  if (runtime === RUNTIMES.CODEX) {
    return {
      runtime,
      model: assertNoFable(CODEX_MODEL),
      effort: effortForComplexity(complexity),
      reasoning: `nature "${normalize(nature)}" routes to Codex ; effort scaled to complexity`,
    };
  }
  return {
    runtime,
    model: claudeModelForComplexity(complexity), // null = inherit session model
    effort: null, // Claude effort = model tier, no separate knob
    reasoning: isVerification(nature)
      ? 'verification stays on Claude (red line: a runtime never grades its own work)'
      : `nature "${normalize(nature)}" stays on Claude (default-safe) ; model scaled to complexity`,
  };
}
