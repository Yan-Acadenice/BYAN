// Pure, tested helpers for native-workflow RGR (red-green-refactor) loops.
//
// The in-CLI Workflow runtime sandbox forbids import/require/fs INSIDE a
// .claude/workflows/*.js script, so a native script MUST inline these tiny
// functions verbatim. This module is the canonical, unit-tested reference; the
// inlined copies in scripts must mirror it. Keeping the logic here (and tested)
// is what lets the doc-only "3 consecutive failures -> HALT" rule become a real,
// verifiable JS counter.

export const DEFAULT_MAX_CYCLES = 3;

// Decide whether the RGR loop must stop.
//   green=true                 -> done, not aborted (story task is green)
//   not green, cycles >= cap   -> done, aborted (no convergence; hard exit)
//   otherwise                  -> keep looping
// Returns { done, abort, reason }.
export function convergenceGuard({ cycles, green, maxCycles = DEFAULT_MAX_CYCLES }) {
  if (green) return { done: true, abort: false, reason: 'green' };
  if (cycles >= maxCycles) {
    return { done: true, abort: true, reason: `no convergence after ${maxCycles} cycles` };
  }
  return { done: false, abort: false, reason: 'continue' };
}

// Structured verdict a native dev-story run returns to the orchestrating skill
// for the human gate. Pure constructor — no side effects, no state mutation.
export function buildVerdict({ storyKey, green, cycles, blocking = [], maxCycles = DEFAULT_MAX_CYCLES }) {
  const aborted = !green && cycles >= maxCycles;
  return {
    workflow: 'dev-story',
    storyKey: storyKey || null,
    status: green ? 'review-ready' : aborted ? 'aborted-no-convergence' : 'in-progress',
    green: Boolean(green),
    cycles,
    maxCycles,
    blocking: Array.isArray(blocking) ? blocking : [],
    needsHumanGate: true,
  };
}
