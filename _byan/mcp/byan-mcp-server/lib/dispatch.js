import { classifyLeaf, tierFor, TIER_MODEL, LEAF_TYPES } from './native-tiers.js';

// byan_dispatch routes a unit of work along TWO independent axes:
//
//   STRATEGY  — WHERE the work runs (inline / isolated subagent / mcp worker).
//               Derived from the scalar score + parallelizable. This is
//               dispatch's own concern: orchestration.
//   TIER      — WHICH model the work deserves. Delegated to native-tiers (the
//               single source of truth), keyed on the task's NATURE, never on its
//               size. Only exploration downgrades to a cheap tier; implementation,
//               verification, analysis (and anything unmatched) stay deep =
//               inherit the session model. We never PIN UP to opus.
//
// Before this split the two axes were fused into one route string
// ('mcp-worker-haiku', 'main-thread-opus'), so a short sequential task was
// silently downgraded to haiku purely on length, and a long one was pinned up to
// opus — exactly the size-driven mis-tiering native-tiers' anti-downgrade doctrine
// forbids. The score still picks the strategy; the model now comes from nature.
//
// The dependency on native-tiers is intentional and one-directional: dispatch
// CONSUMES the tier source of truth, it does not duplicate it. native-tiers is a
// pure, IO-free module, so the import is safe and keeps the tiering doctrine in a
// single place.

const VALID_NATURES = new Set(Object.values(LEAF_TYPES));

export function dispatch({ task, complexity, parallelizable, nature } = {}) {
  const score =
    typeof complexity === 'number'
      ? complexity
      : Math.min(100, Math.floor((task?.length || 0) / 10));
  const isPar = parallelizable === true;

  // Axis 1 — strategy (where). Scalar, as before, minus the fused model suffix.
  let strategy, strategyReason;
  if (score < 15) {
    strategy = 'main-thread';
    strategyReason = `score ${score} < 15: inline, no delegation overhead`;
  } else if (score < 40 && isPar) {
    strategy = 'agent-subagent-worktree';
    strategyReason = `score ${score} + parallelizable: isolated subagent (worktree)`;
  } else if (score < 40) {
    strategy = 'mcp-worker';
    strategyReason = `score ${score}, sequential: delegated MCP worker`;
  } else {
    strategy = 'main-thread';
    strategyReason = `score ${score} >= 40: heavy, kept in the main thread`;
  }

  // Axis 2 — tier (which model). By nature, via native-tiers. An explicit, valid
  // nature wins; otherwise classify the task text. An unknown nature falls back to
  // classification rather than guessing, and classification's own default is
  // IMPLEMENTATION (deep), so the conservative path is the worst case — protected
  // work is never downgraded on a miss.
  const leafType = VALID_NATURES.has(nature) ? nature : classifyLeaf({ label: task || '' });
  const tier = tierFor(leafType);
  const model = TIER_MODEL[tier]; // 'haiku' (exploration) or null (every other nature -> inherit session model). tierFor never auto-picks balanced/'sonnet'.

  const tierReason =
    model === null
      ? `nature=${leafType} -> ${tier}: inherit the session model (protected, not downgraded)`
      : `nature=${leafType} -> ${tier}: ${model}`;

  // model applies to a DELEGATED strategy (subagent / mcp-worker leaf); for a
  // main-thread strategy the work runs on the session model and model is advisory.
  return {
    score,
    strategy,
    nature: leafType,
    tier,
    model,
    parallelizable: isPar,
    reasoning: `${strategyReason}. ${tierReason}.`,
  };
}

// Batch tiering — the authoring aid for workflow scripts. The author passes the
// planned leaves BEFORE writing the script and gets the opts.model value per
// leaf from the same source of truth (native-tiers). No strategy axis here:
// the leaves all run inside one Workflow invocation, so WHERE they run is the
// script's concern, only WHICH model each deserves is answered. An explicit
// valid nature wins; otherwise the label classifies; a miss stays protected
// (implementation -> deep -> null), same conservative path as dispatch().
export function dispatchBatch(leaves) {
  if (!Array.isArray(leaves)) return [];
  return leaves.map((leaf) => {
    const { label, nature } = leaf && typeof leaf === 'object' ? leaf : {};
    const leafType = VALID_NATURES.has(nature) ? nature : classifyLeaf({ label: label || '' });
    const tier = tierFor(leafType);
    return {
      label: label || '',
      nature: leafType,
      tier,
      model: TIER_MODEL[tier],
    };
  });
}
