/**
 * fact-check-core — pure detection engine shared by the fact-check hooks.
 *
 * No IO, no process exit. The PreToolUse doc gate (fact-check-absolutes.js)
 * and the Stop conversation nudge (fact-check-claims.js) both consume this so
 * the absolute-detection logic lives in one place.
 */

'use strict';

const ABSOLUTES = [
  /\btoujours\b/i,
  /\bjamais\b/i,
  /\bforc[eé]ment\b/i,
  /\bobviously\b/i,
  /\balways\b/i,
  /\bnever\b/i,
  /\bclearly\b/i,
  /\bundoubtedly\b/i,
  /\bfaster than\b/i,
  /\bbetter than\b/i,
  /\bplus rapide que\b/i,
  /\bmeilleur que\b/i,
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
//   - list-of-pattern lines (e.g. "- toujours")
function stripNonClaimZones(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/^> .*$/gm, '')
    .replace(/^[\s-]*['"]?\b(toujours|jamais|forc[eé]ment|obviously|always|never|clearly|undoubtedly)\b['"]?/gim, '');
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
