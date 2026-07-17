/**
 * fact-check-core — pure detection engine shared by the fact-check hooks.
 *
 * No IO, no process exit. The PreToolUse doc gate (fact-check-absolutes.js)
 * and the Stop conversation nudge (fact-check-claims.js) both consume this so
 * the absolute-detection logic lives in one place.
 */

'use strict';

// WI-5 — the absolute-claim patterns. Kept HIGH-SIGNAL on purpose : this gate
// hard-blocks a doc write, so a false positive costs the user a block. Every
// entry is either a plain absolute, a comparative superlative, an unsourced
// best-practice claim, or a certainty phrase — the exact trigger families named
// in .claude/rules/fact-check.md. Noisy bare words ("mieux", "the best",
// "impossible", "bien sur") are deliberately excluded.
const ABSOLUTES = [
  // plain absolutes
  /\btoujours\b/i,
  /\bjamais\b/i,
  /\bforc[eé]ment\b/i,
  /\bobviously\b/i,
  /\balways\b/i,
  /\bnever\b/i,
  /\bclearly\b/i,
  /\bundoubtedly\b/i,
  /\b[ée]videmment\b/i,
  /\bcertainly\b/i,
  /\bwithout a doubt\b/i,
  /\bsans aucun doute\b/i,
  /\bguaranteed\b/i,
  // comparative superlatives (a claim, not phrasing)
  /\bfaster than\b/i,
  /\bbetter than\b/i,
  /\bplus rapide que\b/i,
  /\bmeilleur que\b/i,
  /\bthe fastest\b/i,
  /\ble plus rapide\b/i,
  /\bsuperior to\b/i,
  // ("optimal" alone was dropped in WI-5 review : too common in legit doc prose
  //  ("the optimal layout") to hard-block a doc write without a false positive.)
  // unsourced best-practice / authority claims
  /\bbest practice\b/i,
  /\bbonne pratique\b/i,
  /\bindustry standard\b/i,
  /\bstandard de l['’]industrie\b/i,
  // certainty framing
  /\bil est clair que\b/i,
  /\bit is well[- ]known\b/i,
  /\bwell[- ]known that\b/i,
  /\bprouv[eé] que\b/i,
];

const SOURCE_MARKERS = [
  /\bRFC\s*\d+/i,
  /\bCVE-\d{4}-\d+/i,
  /https?:\/\//,
  /\[CLAIM\s+L[1-5]\]/i,
  /\[FACT\s+USER-VERIFIED/i,
  /\bsource\s*:/i,
  /_byan\/knowledge\/sources\.md/,
];

// Strip content that cannot be a claim :
//   - fenced code blocks ``` ... ```
//   - inline backticks `...`
//   - block quotes (lines starting with >)
//   - BULLET list-example lines (e.g. "- toujours") — a doc listing the trigger
//     words as examples, not asserting them. WI-5 review fix : this REQUIRES a
//     bullet marker (- or *), so a prose sentence merely STARTING with an
//     absolute ("Never mutate state directly.") is NOT stripped and stays policed
//     (the old `^[\s-]*` matched any leading whitespace -> a false negative).
function stripNonClaimZones(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/^> .*$/gm, '')
    .replace(/^\s*[-*]\s+['"]?\b(toujours|jamais|forc[eé]ment|obviously|always|never|clearly|undoubtedly|[ée]videmment|certainly|guaranteed)\b['"]?/gim, '');
}

// Return the first unsourced absolute (with surrounding context) or null when
// every absolute has a source marker within a +/-240 char window.
function findUnsourced(text) {
  if (!text) return null;
  for (const re of ABSOLUTES) {
    const match = text.match(re);
    if (!match) continue;
    const idx = match.index || 0;
    const windowStart = Math.max(0, idx - 240);
    const windowEnd = Math.min(text.length, idx + match[0].length + 240);
    const ctx = text.slice(windowStart, windowEnd);
    const hasSource = SOURCE_MARKERS.some((sm) => sm.test(ctx));
    if (!hasSource) {
      return { absolute: match[0], context: text.slice(Math.max(0, idx - 80), idx + 80) };
    }
  }
  return null;
}

module.exports = { ABSOLUTES, SOURCE_MARKERS, stripNonClaimZones, findUnsourced };
