/**
 * perf-routing — the MECHANISM for routing a task to the pool reputed stronger
 * for it, WITHOUT asserting an unsourced ranking.
 *
 * The honest ceiling (BYAN fact-check, performance domain): "model X is better
 * at task Y" needs L2 evidence (a reproducible benchmark). A community arena such
 * as designarena.ai is preference-vote data — below that floor. So this module
 * ships a NEUTRAL default (DEFAULT_FORCES = []): out of the box it claims nothing
 * and changes no routing. It provides the config-driven forces table + a matcher;
 * populating the table with rankings (from the user's own benchmarks, or an arena
 * taken as a weak signal) is an explicit opt-in, and every result it returns is
 * tagged `confidence: 'heuristic'` so downstream never presents it as measured.
 *
 * A forces entry: { category, pattern (regex source, case-insensitive), favors:
 * 'codex' | 'claude' }. Pure — no I/O.
 */

// Neutral by default: no unsourced perf claim ships. Populate via config.
const DEFAULT_FORCES = [];

// Return the first forces entry whose pattern matches the text, or null.
// Malformed entries (missing pattern/favors, or an invalid regex) are skipped.
function matchCategory(text, forces = DEFAULT_FORCES) {
  const s = String(text || '');
  if (!Array.isArray(forces)) return null;
  for (const entry of forces) {
    if (!entry || !entry.pattern || !entry.favors) continue;
    let re;
    try {
      re = new RegExp(entry.pattern, 'i');
    } catch {
      continue; // invalid regex in a user-supplied table — skip, never throw
    }
    if (re.test(s)) return entry;
  }
  return null;
}

// Resolve the perf preference for a text: which pool the (user-supplied) table
// favors, always tagged heuristic. { favors: 'codex'|'claude'|null, category, confidence }.
function perfFavors(text, forces = DEFAULT_FORCES) {
  const hit = matchCategory(text, forces);
  if (!hit) return { favors: null, category: null, confidence: 'heuristic' };
  return { favors: hit.favors, category: hit.category, confidence: 'heuristic' };
}

module.exports = { DEFAULT_FORCES, matchCategory, perfFavors };
