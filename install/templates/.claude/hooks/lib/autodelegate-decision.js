/**
 * autodelegate-decision — the pure core that decides whether BYAN should hand a
 * task to Codex (on the ChatGPT subscription, no API credit), and how hard to
 * push. Two triggers, honest about their strength:
 *
 *   1. NATURE (always available, no gauge needed): the request looks like
 *      delegable coding work (implement / write / fix / refactor / test) -> mode
 *      'delegable-only', propose handing THIS task to Codex.
 *   2. PRESSURE (only when a usage gauge is supplied): the estimated Claude 5h
 *      consumption is at/above the threshold (default 80%) -> mode 'all', propose
 *      offloading everything delegable to spare the remaining budget.
 *   3. PERF (opt-in, off by default): a config-driven forces table says Codex is
 *      reputed stronger for this kind of task -> mode 'perf-routed'. Honest: this
 *      is a heuristic below BYAN's L2 perf floor, so it ships neutral (empty
 *      table) and asserts nothing until the user populates it. See perf-routing.
 *
 * The red line is never crossed: only DELEGABLE natures are ever proposed —
 * judgment / analysis / soul / verification stay on Claude. This module states
 * that in `redLine` so the hook's nudge always carries it. Pure (no I/O): the
 * hook is a thin shell that feeds it the request text + the F1 usage estimate.
 */

const { perfFavors } = require('./perf-routing');

const DEFAULT_THRESHOLD = 80;
const DEFAULT_INVOCATION = 'codex:codex-rescue --model gpt-5.4';
const RED_LINE = 'delegable work only (code / mechanical) — judgment, analysis, soul and verification stay on Claude';

// Verbs/nouns that mark a delegable coding task. Heuristic by construction (free
// text has no nature field); kept deliberately conservative so conversational or
// judgment requests do not trip it.
const DELEGABLE_RE = new RegExp(
  [
    'code', 'coder', 'impl[ée]mente', 'implement', '[ée]cris', 'write', 'wire',
    'fix', 'corrige', 'debug', 'd[ée]bogue', 'refactor', 'refactorise',
    'test', 'tests', 'script', 'module', 'fonction', 'function', 'patch',
    'ajoute\\s+(le|la|un|une|du)', 'build\\s+(the|a|le|la)', 'port',
  ].join('|'),
  'i'
);

function looksDelegable(text) {
  return DELEGABLE_RE.test(String(text || ''));
}

// Decide the auto-delegation posture for one turn.
// Returns { delegate, mode, pct, reason, redLine, invocation } — a stable shape.
// mode: 'off' | 'all' | 'delegable-only' | 'none'.
function decideAutodelegation({ requestText = '', usage = null, config = {} } = {}) {
  const {
    enabled = true,
    threshold = DEFAULT_THRESHOLD,
    invocation = DEFAULT_INVOCATION,
  } = config;

  if (!enabled) {
    return { delegate: false, mode: 'off', pct: null, reason: 'auto-delegation disabled (toggle off)', redLine: RED_LINE, invocation };
  }

  const pct = usage && typeof usage.pct === 'number' ? usage.pct : null;
  const delegable = looksDelegable(requestText);

  if (pct != null && pct >= threshold) {
    return {
      delegate: true,
      mode: 'all',
      pct,
      reason: `estimated Claude 5h usage ${pct}% >= ${threshold}% — propose offloading everything delegable to Codex`,
      redLine: RED_LINE,
      invocation,
    };
  }

  if (delegable) {
    return {
      delegate: true,
      mode: 'delegable-only',
      pct,
      reason: 'request looks like delegable coding work — propose handing it to Codex to spare the Claude 5h budget',
      redLine: RED_LINE,
      invocation,
    };
  }

  // PERF (opt-in): the forces table (user-populated) may favor Codex for this
  // kind of task even at low pressure. Off by default; always heuristic.
  if (config.perfRouting) {
    const pf = perfFavors(requestText, config.perfForces || []);
    if (pf.favors === 'codex') {
      return {
        delegate: true,
        mode: 'perf-routed',
        pct,
        reason: `perf heuristic favors Codex for '${pf.category}' (heuristic, NOT a measured benchmark)`,
        redLine: RED_LINE,
        invocation,
      };
    }
  }

  return {
    delegate: false,
    mode: 'none',
    pct,
    reason: pct != null
      ? `usage ${pct}% below ${threshold}% and task not clearly delegable`
      : 'task not clearly delegable and no usage gauge available',
    redLine: RED_LINE,
    invocation,
  };
}

// Defense-in-depth: the invocation string is interpolated into BYAN's injected
// context. It is config/installer-controlled today (safe), but sanitising before
// interpolation closes the door on any future path feeding untrusted text in —
// strip newlines/control chars (no context-structure injection) and cap length.
function sanitizeForContext(value, max = 120) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]+/g, " ") // control chars + newlines -> space
    .replace(/\s+/g, " ")                       // collapse whitespace runs
    .trim()
    .slice(0, max);
}

// Render a decision into the one-paragraph nudge injected into BYAN's context.
// Empty string when there is nothing to propose (so the hook injects nothing).
// The nudge is ADVISORY: it proposes, it never forces — BYAN still owns the call
// and the red line is spelled out every time.
function renderNudge(decision) {
  if (!decision || !decision.delegate) return '';
  const gauge = decision.pct != null ? ` (estimated Claude 5h usage ~${decision.pct}%)` : '';
  const invocation = sanitizeForContext(decision.invocation) || DEFAULT_INVOCATION;
  const scope = decision.mode === 'all'
    ? 'Consider offloading ALL delegable work this session to Codex'
    : decision.mode === 'perf-routed'
      ? 'Codex is heuristically favored for this kind of task (not a measured benchmark) — consider handing it over'
      : 'This looks like delegable coding work — consider handing it to Codex';
  return [
    `[BYAN auto-delegate]${gauge}: ${scope} via \`${invocation}\` `
      + '(runs on the ChatGPT subscription, no API credit).',
    `Red line: ${decision.redLine}. This is advisory — you decide, and you still verify Codex's output before commit.`,
  ].join(' ');
}

module.exports = {
  DEFAULT_THRESHOLD,
  DEFAULT_INVOCATION,
  RED_LINE,
  looksDelegable,
  decideAutodelegation,
  renderNudge,
};
