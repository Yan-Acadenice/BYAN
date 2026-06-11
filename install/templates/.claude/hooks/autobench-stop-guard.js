#!/usr/bin/env node
/**
 * Stop hook — BYAN Auto-Benchmark end-of-turn guard.
 *
 * Goal : when the assistant's finished message presents a CHOICE between
 * options (a fork) but did NOT emit a BYAN-BENCH marker, the agent skipped the
 * benchmark doctrine. The hook blocks ONCE to force exactly one regeneration in
 * which the agent re-presents the fork as the compact benchmark table and emits
 * the marker. It never loops : a block-token keyed on the message content makes
 * the second pass non-blocking by construction.
 *
 * Shipped DISARMED (approach C) : the hook observes and ledgers every turn but
 * does not block until explicitly armed (enforcement.armed in the config —
 * config-only, set via the YAML + byan-sync-rules, no loose flag file). Day one
 * is zero noise / zero latency; the net is pre-built but inert until the user
 * opts in. A disarmed turn that WOULD have fired is recorded as
 * observed-disarmed-fork so arming later is an informed decision.
 *
 * Detection is ARTIFACT-primary with a regex fallback. The decision order :
 *   1. MARKER   : a BYAN-BENCH:done|skip marker -> satisfied (the agent already
 *                 benchmarked, or deliberately skipped a degenerate fork).
 *   2. NEVER    : y/n confirms and destructive prompts are exempt — we never
 *                 benchmark "proceed?" or "rm -rf".
 *   3. ESCAPE   : the session flag (.byan-autobench/off) or the cross-session
 *                 config opt-out suppresses all blocking.
 *   4. DISARMED : not armed -> observe + ledger, never block (the default).
 *   5. BLOCKED  : a block-token for this turn already exists -> the regen pass,
 *                 do not block again.
 *   6. FORK     : a fork is present when an AskUserQuestion tool_use artifact is
 *                 in the finished turn (the unambiguous, primary signal). The
 *                 choice-language regex is only a LAST-RESORT fallback for
 *                 inline-prose forks that never called the tool.
 *
 * Honest ceiling (GH #28273) : the Stop hook is REACTIVE. It cannot intercept
 * before the message is displayed; it can only force a regeneration after the
 * fact. The proactive half is the doctrine the agent self-applies. This hook is
 * the safety net, not a pre-display filter.
 *
 * Non-blocking on any IO/parse error : the hook never traps a turn it cannot
 * read. Every invocation appends one fire/miss line to the ledger.
 */

'use strict';

const {
  loadAutobenchConfig,
  escapeHatchActive,
  isArmed,
  readBlockToken,
  writeBlockToken,
  appendLedger,
  extractLastAssistantText,
  extractLastAssistantContent,
  hasChoiceArtifact,
  turnHash,
  readStdin,
  parseJson,
} = require('./lib/autobench-runtime');

// Reconstruct a RegExp from a {source, flags} config pair. Returns null on a
// malformed pattern so a single bad config entry never throws the whole hook.
function compileRegex(spec) {
  if (!spec || typeof spec.source !== 'string') return null;
  try {
    return new RegExp(spec.source, spec.flags || '');
  } catch {
    return null;
  }
}

function countMatches(text, re) {
  if (!re) return 0;
  // A global regex is required to count; clone with the g flag if absent.
  const g = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');
  const m = text.match(g);
  return m ? m.length : 0;
}

function anyRegexMatches(text, specs) {
  if (!Array.isArray(specs)) return false;
  return specs.some((spec) => {
    const re = compileRegex(spec);
    return Boolean(re) && re.test(text);
  });
}

// Evaluate the choice-language signals with their per-signal thresholds.
// A signal fires when : (min_matches present -> >= that many matches) OR
// (requires_candidates present -> the signal matches AND >= N candidate tokens
// co-occur) OR (a plain match otherwise).
function hasChoiceLanguage(text, config) {
  const specs = (config && config.choice_language) || [];
  const candidateRe = compileRegex(config && config.candidate_token);
  const candidateCount = candidateRe ? countMatches(text, candidateRe) : 0;

  return specs.some((spec) => {
    const re = compileRegex(spec);
    if (!re) return false;

    if (typeof spec.min_matches === 'number') {
      return countMatches(text, re) >= spec.min_matches;
    }
    if (typeof spec.requires_candidates === 'number') {
      return re.test(text) && candidateCount >= spec.requires_candidates;
    }
    return re.test(text);
  });
}

function hasMarker(text, config) {
  const spec = config && config.marker_patterns && config.marker_patterns.any;
  const re = compileRegex(spec);
  return Boolean(re) && re.test(text);
}

function hasNeverListed(text, config) {
  return anyRegexMatches(text, config && config.never_list);
}

// Parse the marker fields (g1/g2/scope) for the ledger. Best-effort : a marker
// without fields still satisfies; the fields only enrich the audit trail.
function readMarkerFields(text, config) {
  const fields = (config && config.marker_fields) || {};
  const out = {};
  const g1 = compileRegex(fields.g1);
  const g2 = compileRegex(fields.g2);
  const scope = compileRegex(fields.scope);
  let m;
  if (g1 && (m = text.match(g1))) out.g1 = Number(m[1]);
  if (g2 && (m = text.match(g2))) out.g2 = Number(m[1]);
  if (scope && (m = text.match(scope))) out.scope = m[1];
  return out;
}

function markerKind(text, config) {
  const mp = (config && config.marker_patterns) || {};
  const doneRe = compileRegex(mp.done);
  const skipRe = compileRegex(mp.skip);
  if (doneRe && doneRe.test(text)) return 'done';
  if (skipRe && skipRe.test(text)) return 'skip';
  return null;
}

/**
 * Pure decision. No IO, no clock — fully unit-testable.
 *
 * Inputs : lastAssistantText (the finished prose), artifact (true when an
 * AskUserQuestion tool_use was in the finished turn — the caller computes this
 * from the raw content so the decision stays pure), armed (the enforcement gate),
 * config, escapeHatch, blocked.
 *
 * Detection is ARTIFACT-primary : a real fork is present when the artifact is
 * there OR, as a last-resort fallback, when the choice-language regex matches
 * inline prose. block is true IFF a fork is present AND no marker AND not
 * never-listed AND escape-hatch inactive AND ARMED AND not already blocked.
 *
 * Returns { block, reason?, ledger } where ledger is the audit record.
 */
function decideBench({ lastAssistantText, artifact, armed, config, escapeHatch, blocked }) {
  const text = lastAssistantText || '';

  const marker = hasMarker(text, config);
  const neverHit = hasNeverListed(text, config);
  const choiceLang = hasChoiceLanguage(text, config);
  const hasArtifact = artifact === true;
  // ARTIFACT-primary : the structural AskUserQuestion tool_use is the unambiguous
  // fork signal. The lexical regex is only the fallback for prose forks that
  // never called the tool.
  const fork = hasArtifact || choiceLang;
  const detection = hasArtifact ? 'artifact' : choiceLang ? 'regex-fallback' : null;
  const armedOn = armed === true;

  const ledger = { neverHit, choiceLang, artifact: hasArtifact, marker, detection, armed: armedOn };

  if (marker) {
    const kind = markerKind(text, config);
    Object.assign(ledger, readMarkerFields(text, config));
    ledger.event = kind === 'skip' ? 'satisfied-skip' : 'satisfied-marker';
    return { block: false, ledger };
  }
  if (neverHit) {
    ledger.event = 'satisfied-never';
    return { block: false, ledger };
  }
  if (escapeHatch) {
    ledger.event = 'satisfied-escape';
    return { block: false, ledger };
  }
  if (!armedOn) {
    // DISARMED by default (approach C) : never block. Record whether a fork WOULD
    // have fired, so arming later is data-informed, not a blind flip.
    ledger.event = fork ? 'observed-disarmed-fork' : 'observed-disarmed';
    return { block: false, ledger };
  }
  if (blocked) {
    // The regen pass : we already blocked this exact content once.
    ledger.event = 'satisfied-already-blocked';
    return { block: false, ledger };
  }
  if (!fork) {
    ledger.event = 'no-choice';
    return { block: false, ledger };
  }

  // A genuine miss while ARMED : the agent offered a fork without benchmarking it.
  const reason =
    (config && config.banners && config.banners.stop_block) ||
    'Auto-benchmark: you presented a choice without a BYAN-BENCH marker. Re-present it as the compact benchmark table and emit the marker.';
  ledger.event = 'fired-block';
  return { block: true, reason, ledger };
}

if (require.main === module) {
  (async () => {
    // Wrap everything : the hook must NEVER trap a turn it cannot read.
    try {
      const config = loadAutobenchConfig();
      const payload = parseJson(await readStdin());
      const lastAssistantText = extractLastAssistantText(payload);
      // ARTIFACT-primary signal : read the RAW last-assistant content (the block
      // array extractLastAssistantText flattens away) so the structural
      // AskUserQuestion tool_use is visible to the decision.
      const artifact = hasChoiceArtifact(extractLastAssistantContent(payload));

      const hash = turnHash(lastAssistantText);
      const escapeHatch = escapeHatchActive(config);
      const armed = isArmed(config);
      // Loop-guard : the content-hash block token is primary; stop_hook_active is
      // an additional belt from the runtime (a prior Stop hook already blocked
      // this turn), so we never depend on it alone.
      const blocked = readBlockToken(hash) || payload.stop_hook_active === true;

      const decision = decideBench({ lastAssistantText, artifact, armed, config, escapeHatch, blocked });

      // Audit trail : one JSONL line per invocation. turnHash is content-only;
      // any timestamp/session comes from the environment, kept out of the pure
      // decision so it stays deterministic.
      appendLedger(
        {
          turnHash: hash,
          event: decision.ledger.event,
          g1: decision.ledger.g1,
          g2: decision.ledger.g2,
          scope: decision.ledger.scope,
          neverHit: decision.ledger.neverHit,
          choiceLang: decision.ledger.choiceLang,
          artifact: decision.ledger.artifact,
          detection: decision.ledger.detection,
          armed: decision.ledger.armed,
          marker: decision.ledger.marker,
          ts: process.env.BYAN_HOOK_TS || undefined,
          session: process.env.CLAUDE_SESSION_ID || undefined,
        },
        config
      );

      if (!decision.block) {
        process.stdout.write(JSON.stringify({ continue: true }));
        process.exit(0);
      }

      // Block-once : write the token BEFORE emitting the block so the
      // regenerated turn (same content if the agent fails to fix) is exempt.
      writeBlockToken(hash);
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: decision.reason, systemMessage: decision.reason })
      );
      process.exit(2);
    } catch {
      // Last-resort net : on any unexpected failure, let the turn end.
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
  })();
}

module.exports = {
  decideBench,
  hasChoiceLanguage,
  hasMarker,
  hasNeverListed,
  markerKind,
  readMarkerFields,
  compileRegex,
  countMatches,
};
