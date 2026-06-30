#!/usr/bin/env node
/**
 * Stop hook — BYAN Strict Mode end-of-turn guard.
 *
 * When a strict session is engaged (active + scope locked + not completed),
 * block the turn from ending IF the assistant's last message claims the work
 * is done. Completion must be earned through byan_strict_complete (3 passes,
 * last verdict "ok"), which flips state.completed and disengages this guard.
 *
 * A mid-task yield (asking the user a question, reporting progress without a
 * completion claim) is allowed — the guard only fires on a premature "done".
 *
 * Non-blocking on any IO/parse error : the hook never traps a turn when it
 * cannot read the state.
 */

const { loadConfig, loadState, isEngaged, passCount, lastVerdict, readStdin, parseJson } =
  require('./lib/strict-runtime');
// Shared transcript reader — the real Stop payload has no inline transcript
// (last_assistant_message + transcript_path JSONL). Same reader as the other
// Stop hooks so the completion-claim guard sees the actual finished message.
const { extractLastAssistantText } = require('./lib/transcript-read');

const DEFAULT_MARKERS = ['done', 'finished', 'complete', 'delivered', 'ready'];

// Strip the contexts where a completion marker is a MENTION, not a CLAIM:
// fenced + inline code, HTML comments (the BYAN-BENCH:done marker lives there),
// and snake_case / namespaced identifiers (byan_strict_complete, BENCH:done). A
// marker that survives this strip is prose -- the only place a real "it is done"
// claim lives. Exported so the regression cases are unit-testable.
function denoiseForClaim(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`]*`/g, ' ') // inline code spans
    .replace(/<!--[\s\S]*?-->/g, ' ') // HTML comments (e.g. <!-- BYAN-BENCH:done -->)
    .replace(/[A-Za-z0-9]+(?:[_:][A-Za-z0-9]+)+/g, ' '); // snake_case / ns identifiers
}

// A completion marker counts only as a STANDALONE claim, bounded by non-letters
// (Unicode-aware via the u flag, so "indefini" does not embed "fini" and
// "determine" does not embed "termine"), with a permissive trailing inflection
// (livre -> livree / livres). Bias: a false negative is caught by the pre-commit
// gate (the hard net), while a false positive traps a legitimate turn -- so a
// marker that is only mentioned is NOT read as a claim.
function claimsCompletion(text, markers) {
  if (!text) return false;
  const clean = denoiseForClaim(text).toLowerCase();
  return (markers || DEFAULT_MARKERS).some((m) => {
    const marker = String(m).toLowerCase().trim();
    if (!marker) return false;
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return new RegExp(`(?<![\\p{L}])${escaped}(?:s|e|es|ée|ées|és)?(?![\\p{L}])`, 'iu').test(clean);
    } catch {
      // Older runtimes without lookbehind/\p{L} -> fall back to a plain include.
      return clean.includes(marker);
    }
  });
}

// Pure decision : returns { block, reason }.
function decideStop({ state, config, lastAssistantText }) {
  if (!isEngaged(state)) return { block: false };

  const markers = config && config.completion_claim_markers;
  if (!claimsCompletion(lastAssistantText, markers)) return { block: false };

  const minPasses = (config && config.min_passes) || 3;
  const done = passCount(state);
  const verdict = lastVerdict(state);

  // Defensive : if somehow 3 ok passes are recorded but complete() was not
  // called, still block and tell the agent to call complete.
  const base =
    (config && config.banners && config.banners.stop_block) ||
    'Strict mode: the turn cannot end. The locked scope has not been completed.';

  const reason =
    `${base}\n` +
    `Progress: ${done}/${minPasses} self-verify passes, last verdict=${verdict || 'none'}.\n` +
    `You claimed completion but byan_strict_complete has not produced an audit token. ` +
    `Run byan_strict_self_verify until the scope is satisfied (last pass verdict "ok"), ` +
    `then call byan_strict_complete. If the scope changed, re-lock it.`;

  return { block: true, reason };
}

if (require.main === module) {
  (async () => {
    const state = loadState();
    if (!isEngaged(state)) {
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
    const config = loadConfig();
    const payload = parseJson(await readStdin());
    const lastAssistantText = extractLastAssistantText(payload);

    const decision = decideStop({ state, config, lastAssistantText });
    if (!decision.block) {
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
    process.stdout.write(
      JSON.stringify({ decision: 'block', reason: decision.reason, systemMessage: decision.reason })
    );
    process.exit(2);
  })();
}

module.exports = { decideStop, claimsCompletion, denoiseForClaim, extractLastAssistantText };
