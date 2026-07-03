// Per-script tiering report + gate decision (the engine under the tier hook
// and the byan-tier-script bin).
//
// The Workflow tool runs every agent() leaf on the session model unless the
// script pins opts.model, and the sandbox forbids importing native-tiers at
// runtime — so the ONLY moment the tiering doctrine can reach an AD-HOC script
// is when the script text crosses the Workflow tool boundary. This module
// analyzes that text: one verdict per statically-labelled leaf, against the
// same source of truth the repo linter enforces (native-tiers.js).
//
// The gate is deny-ONCE and never rewrites the script (STRICT-2 No Downgrade:
// a wrong auto-stamp would be the exact regression the doctrine forbids). The
// author fixes the listed leaves, or asserts the deep choices are deliberate
// with the acknowledgment marker. An identical resubmission after a deny
// passes — the gate forces a decision, it does not trap the turn.

import crypto from 'node:crypto';
import { classifyLeaf, tierFor, TIER_MODEL, TIERS, LEAF_TYPES } from './native-tiers.js';
import { stripComments, extractLabelledLeaves } from './workflows-lint.js';

// Acknowledgment marker, raw-text (comment form survives comment-stripping
// concerns by design — mirrors the BYAN-BENCH marker family). Writing it is an
// explicit authoring act: "I reviewed the tiering; the deep leaves are
// deliberate."
export const ACK_RE = /BYAN-TIER:\s*reviewed\b/;

function verdictFor(cls, model) {
  const expected = TIER_MODEL[tierFor(cls)]; // 'haiku' | 'sonnet' | null (inherit)
  if (expected === null) {
    // Protected class: any pinned model is a downgrade or a pin-up — both wrong.
    return model === null ? 'ok' : 'violation';
  }
  if (model === null) return 'missing-tier';
  if (model === expected) return 'ok';
  // Exploration may ride ABOVE its floor (sonnet on a cheap leaf wastes a
  // little, breaks nothing). Anything else — haiku on mech-, opus anywhere —
  // is below a declared tier or an unknown pin.
  if (cls === LEAF_TYPES.EXPLORATION && model === TIER_MODEL[TIERS.BALANCED]) return 'ok';
  return 'violation';
}

// analyzeScript(src) -> { acknowledged, agentCalls, leaves, gaps, violations }
// leaves: [{ label, model, class, expectedModel, verdict }] for every
// statically-labelled opts object. Unlabelled agent() calls classify to the
// deep default and cannot gap, so they are only counted (agentCalls).
export function analyzeScript(src) {
  const leaves = extractLabelledLeaves(src).map(({ label, model }) => {
    const cls = classifyLeaf({ label });
    return {
      label,
      model,
      class: cls,
      expectedModel: TIER_MODEL[tierFor(cls)],
      verdict: verdictFor(cls, model),
    };
  });
  return {
    acknowledged: ACK_RE.test(String(src)),
    agentCalls: (stripComments(src).match(/\bagent\s*\(/g) || []).length,
    leaves,
    gaps: leaves.filter((l) => l.verdict === 'missing-tier'),
    violations: leaves.filter((l) => l.verdict === 'violation'),
  };
}

// One line per offending leaf, then the two exits (fix or acknowledge). The
// reason is the whole teaching surface of the gate — it must carry the exact
// label and the exact value to write.
export function formatGateReason(analysis) {
  const lines = ['BYAN tier gate: this workflow script has undecided or invalid model tiers.'];
  for (const g of analysis.gaps) {
    lines.push(`- leaf '${g.label}' (${g.class}) has no model: add model: '${g.expectedModel}'`);
  }
  for (const v of analysis.violations) {
    const fix = v.expectedModel === null ? 'omit model: (deep leaves inherit the session model)' : `use model: '${v.expectedModel}'`;
    lines.push(`- leaf '${v.label}' (${v.class}) carries model: '${v.model}': ${fix}`);
  }
  lines.push(
    "Fix the listed leaves, or add the comment '// BYAN-TIER: reviewed' to assert the current tiers are deliberate. This gate denies once: an identical resubmission passes."
  );
  return lines.join('\n');
}

// Pure gate decision (the hook is only the I/O shell around this).
// Precedence: escape hatch > acknowledgment > clean > deny-once memory > deny.
export function decideTierGate({ analysis, escaped = false, scriptHash = null, priorDenyHash = null } = {}) {
  if (escaped) return { decision: 'allow', code: 'escape-hatch' };
  if (analysis.acknowledged) return { decision: 'allow', code: 'acknowledged' };
  if (analysis.gaps.length === 0 && analysis.violations.length === 0) {
    return { decision: 'allow', code: 'clean' };
  }
  if (scriptHash && priorDenyHash && scriptHash === priorDenyHash) {
    return { decision: 'allow', code: 'unchanged-after-deny' };
  }
  return {
    decision: 'deny',
    code: analysis.violations.length ? 'violations' : 'gaps',
    reason: formatGateReason(analysis),
  };
}

export function hashScript(src) {
  return crypto.createHash('sha1').update(String(src)).digest('hex');
}
