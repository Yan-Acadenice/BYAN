#!/usr/bin/env node
// BYAN Auto-Benchmark miss-ledger reader / aggregator (C5e).
//
// The Stop hook (autobench-stop-guard.js) appends ONE JSONL line per invocation
// to _byan-output/benchmark-ledger.jsonl. Each line is an audit record of one
// end-of-turn decision: did the agent benchmark a fork it should have, or did it
// MISS. This module reads that trail and aggregates it into the fires / misses /
// miss-rate summary required by the acceptance criteria, plus a small CLI-ish
// `main()` so a human (or CI) can run a one-shot report.
//
// Event vocabulary is OWNED by the hook; this reader treats it as the contract:
//   fired-block               -> a MISS (the agent offered a fork without a
//                                benchmark marker; the hook forced a regen).
//   satisfied-marker          -> a HIT  (a real benchmark was presented).
//   satisfied-skip            -> a deliberate skip (fork considered, not tabled).
//   satisfied-never           -> exempt (y/n confirm / destructive prompt).
//   satisfied-escape          -> exempt (escape-hatch active).
//   satisfied-already-blocked -> the forced regen pass (block-once accounting).
//   no-choice                 -> no fork was present (the common case).
// Anything else is bucketed under `unknown` so a future event type is surfaced,
// not silently dropped.
//
// Pure read-only: this module NEVER writes the ledger. It reads what the hook
// wrote. Robust to a partially-written / corrupt JSONL file: a malformed line is
// counted under `malformed` and skipped, never thrown.

'use strict';

const fs = require('fs');
const path = require('path');

// Events that count as a genuine MISS the agent must fix. Kept narrow on
// purpose: only `fired-block` is a real failure. Everything else is either a
// hit, an exempt case, or accounting.
const MISS_EVENTS = new Set(['fired-block']);

// Events that count as a real benchmark HIT (a fork was tabled).
const HIT_EVENTS = new Set(['satisfied-marker']);

// Events that mean "a fork was considered and deliberately not tabled".
const SKIP_EVENTS = new Set(['satisfied-skip']);

// Exempt / accounting events: present in the trail but neither a miss nor a hit.
const EXEMPT_EVENTS = new Set([
  'satisfied-never',
  'satisfied-escape',
  'satisfied-already-blocked',
  'no-choice',
]);

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function defaultLedgerPath() {
  return path.join(projectRoot(), '_byan-output', 'benchmark-ledger.jsonl');
}

/**
 * Read and parse the ledger file into an array of entries.
 * Returns { entries, malformed, missing } where `malformed` counts unparseable
 * lines and `missing` is true when the file does not exist (a fresh repo where
 * the hook never fired -> not an error, just an empty trail).
 *
 * @param {string} [filePath] absolute path; defaults to the project ledger.
 */
function readLedger(filePath) {
  const p = filePath || defaultLedgerPath();
  let raw;
  try {
    if (!fs.existsSync(p)) return { entries: [], malformed: 0, missing: true };
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    // An unreadable ledger is treated as empty rather than thrown: a reporting
    // tool must never crash the caller over a permissions blip.
    return { entries: [], malformed: 0, missing: true };
  }

  const entries = [];
  let malformed = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') entries.push(obj);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { entries, malformed, missing: false };
}

/**
 * Aggregate a list of ledger entries into a summary.
 *
 * @param {Array<object>} entries
 * @returns {object} {
 *   total, fires, misses, hits, skips, exempt, unknown, missRate,
 *   byEvent:{event:count}, byScope:{internal,external,unknown},
 *   gates:{g1Total,g2Total,countWithGates}
 * }
 *   - fires  = decisions where a fork was present and acted on (hits + misses).
 *   - misses = fired-block events (the agent must fix these).
 *   - missRate = misses / fires (0 when no fork was ever present).
 */
function aggregate(entries) {
  const list = Array.isArray(entries) ? entries : [];

  const byEvent = {};
  const byScope = { internal: 0, external: 0, unknown: 0 };
  let misses = 0;
  let hits = 0;
  let skips = 0;
  let exempt = 0;
  let unknown = 0;
  let g1Total = 0;
  let g2Total = 0;
  let countWithGates = 0;

  for (const e of list) {
    const event = e && typeof e.event === 'string' ? e.event : 'unknown';
    byEvent[event] = (byEvent[event] || 0) + 1;

    if (MISS_EVENTS.has(event)) misses += 1;
    else if (HIT_EVENTS.has(event)) hits += 1;
    else if (SKIP_EVENTS.has(event)) skips += 1;
    else if (EXEMPT_EVENTS.has(event)) exempt += 1;
    else unknown += 1;

    // Scope tally (only the marker-bearing hits/skips carry a scope field).
    const scope = e && e.scope;
    if (scope === 'internal' || scope === 'external') byScope[scope] += 1;
    else if (scope != null) byScope.unknown += 1;

    // Gate totals: only the satisfied-marker entries carry g1/g2 (the marker
    // fields the hook parsed). Average gate counts hint at fork complexity.
    if (typeof e.g1 === 'number' || typeof e.g2 === 'number') {
      if (typeof e.g1 === 'number') g1Total += e.g1;
      if (typeof e.g2 === 'number') g2Total += e.g2;
      countWithGates += 1;
    }
  }

  // A "fire" is a turn where a fork was genuinely present and the doctrine
  // applied: a HIT (tabled) or a MISS (should have, didn't). Skips, exempts and
  // no-choice turns are NOT fires, so the miss-rate is not diluted by the vast
  // majority of turns that have no fork at all.
  const fires = hits + misses;
  const missRate = fires > 0 ? misses / fires : 0;

  return {
    total: list.length,
    fires,
    misses,
    hits,
    skips,
    exempt,
    unknown,
    missRate,
    byEvent,
    byScope,
    gates: {
      g1Total,
      g2Total,
      countWithGates,
      g1Avg: countWithGates > 0 ? g1Total / countWithGates : 0,
      g2Avg: countWithGates > 0 ? g2Total / countWithGates : 0,
    },
  };
}

/**
 * Convenience: read + aggregate in one call.
 * @param {string} [filePath]
 * @returns {object} aggregate(...) plus { malformed, missing, path }.
 */
function report(filePath) {
  const p = filePath || defaultLedgerPath();
  const { entries, malformed, missing } = readLedger(p);
  return Object.assign(aggregate(entries), { malformed, missing, path: p });
}

// Render a percentage with one decimal, no trailing-zero noise (e.g. "12.5%").
function pct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Render a human-readable summary block (no color, no emoji). Returns a string
 * so it is testable; main() writes it to stdout.
 */
function formatReport(rep) {
  const lines = [];
  lines.push('BYAN Auto-Benchmark ledger report');
  lines.push(`  file        : ${rep.path}`);
  if (rep.missing) {
    lines.push('  status      : ledger not found (the Stop hook has not fired yet)');
    return lines.join('\n');
  }
  lines.push(`  records     : ${rep.total}${rep.malformed ? ` (+${rep.malformed} malformed, skipped)` : ''}`);
  lines.push(`  forks (fires): ${rep.fires}   hits: ${rep.hits}   misses: ${rep.misses}`);
  lines.push(`  miss-rate   : ${pct(rep.missRate)}${rep.fires === 0 ? ' (no fork seen)' : ''}`);
  lines.push(`  skips       : ${rep.skips}   exempt: ${rep.exempt}   unknown: ${rep.unknown}`);
  lines.push(
    `  scope       : internal=${rep.byScope.internal} external=${rep.byScope.external}`
  );
  if (rep.gates.countWithGates > 0) {
    lines.push(
      `  avg gates   : g1=${rep.gates.g1Avg.toFixed(1)} g2=${rep.gates.g2Avg.toFixed(1)} (over ${rep.gates.countWithGates} benchmarks)`
    );
  }
  const events = Object.keys(rep.byEvent).sort();
  if (events.length) {
    lines.push('  by event    :');
    for (const ev of events) lines.push(`    ${ev.padEnd(26)} ${rep.byEvent[ev]}`);
  }
  return lines.join('\n');
}

// CLI entry: `node autobench-ledger-report.js [path]` or `--json` for raw data.
// Exit 0 always (a report tool never fails the shell over a read).
function main(argv) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const asJson = args.includes('--json');
  const fileArg = args.find((a) => a && !a.startsWith('--'));
  const rep = report(fileArg);
  if (asJson) {
    process.stdout.write(JSON.stringify(rep, null, 2) + '\n');
  } else {
    process.stdout.write(formatReport(rep) + '\n');
  }
  return rep;
}

if (require.main === module) {
  main();
}

module.exports = {
  MISS_EVENTS,
  HIT_EVENTS,
  SKIP_EVENTS,
  EXEMPT_EVENTS,
  defaultLedgerPath,
  readLedger,
  aggregate,
  report,
  formatReport,
  pct,
  main,
};
