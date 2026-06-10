// BYAN-only opt-in evidence enrichment for the byan-benchmark matrix (C5d).
//
// The native workflow (.claude/workflows/byan-benchmark.js) returns a DATA
// matrix where each cell carries a self-graded evidence `level` (L1..L5) and an
// `unverified` flag. That self-grade is the model judging its own claim. Inside
// ~/BYAN the orchestrating skill can do better: it can call the byan_fc_check
// MCP tool per factual cell and stamp an AUDITED evidence level onto the cell,
// turning the Niv column into a fact-checked authority rather than a self-grade.
//
// This module is the pure, testable core of that wiring. It does NOT know about
// MCP transport: the caller injects an async `check(text) -> { level, score, ...}`
// function (in BYAN, a thin adapter over mcp__byan__byan_fc_check; in tests, a
// mock). Without an injected checker the matrix is returned unchanged, which is
// why the layer is OPT-IN and BYAN-only by construction: a platform that cannot
// reach byan_fc_check simply does not pass a checker and gets the self-graded
// matrix back, untouched.
//
// Strict-domain floors (mirrors .claude/rules/fact-check.md and the engine's
// STRICT_FLOORS): a security/performance claim must reach L2, a compliance claim
// L1, or the cell stays flagged [UNVERIFIED] no matter what the checker returned.
// Enrichment can only RAISE authority or flag a shortfall; it never silently
// upgrades a cell past its domain floor.

'use strict';

// Strict-domain minimum evidence levels. Numeric so floor comparison is a plain
// `<=` (L1 is the strongest -> the smallest number). Kept in sync with the
// engine's STRICT_FLOORS map and the fact-check rule doc.
const STRICT_FLOORS = { security: 2, performance: 2, compliance: 1 };

// Default heuristic: which cells are "hard claims" worth fact-checking. A cell
// is a hard claim when it sits in a strict domain (every cell is then a claim
// because the floor applies) OR its verdict text uses an absolute / superlative
// the fact-check auto-detection also keys on. Low-stakes internal cells with a
// hedged verdict are skipped to keep latency down (anti-bloat, C4).
const ABSOLUTE_RE =
  /\b(always|never|toujours|jamais|forcement|obviously|guaranteed|fastest|slowest|best|worst|optimal|superior|plus rapide|le plus|mieux|meilleur|fully|completely|zero|100%)\b/i;

const STRICT_DOMAINS = Object.keys(STRICT_FLOORS);

// Parse an "L3" / "l2" / 3 style level into the 1..5 integer, or null if absent.
function parseLevel(level) {
  if (typeof level === 'number' && Number.isFinite(level)) {
    return level >= 1 && level <= 5 ? Math.round(level) : null;
  }
  if (typeof level === 'string') {
    const m = level.match(/L?\s*([1-5])\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}

// Render a numeric level back to the canonical "L{n}" the matrix uses.
function levelLabel(n) {
  return n == null ? null : `L${n}`;
}

// Decide whether a cell is a hard claim worth an fc_check call.
//   - any cell in a strict domain is a hard claim (the floor must be enforced);
//   - otherwise, a cell whose verdict uses an absolute/superlative is a claim;
//   - an explicit isHardClaim flag on the cell forces inclusion.
// Returns false for hedged, low-stakes internal cells so enrichment stays cheap.
function isHardClaim(cell, domain) {
  if (!cell) return false;
  if (cell.isHardClaim === true) return true;
  if (STRICT_DOMAINS.includes(domain)) return true;
  const verdict = typeof cell.verdict === 'string' ? cell.verdict : '';
  const claim = typeof cell.claim === 'string' ? cell.claim : '';
  return ABSOLUTE_RE.test(verdict) || ABSOLUTE_RE.test(claim);
}

// Build the text the checker scores for a cell. Prefer an explicit cell.claim
// (the factual basis the SOURCE leaf wrote); fall back to the qualitative
// verdict joined with the criterion so the checker has a self-contained claim.
function cellClaimText(cell) {
  if (cell && typeof cell.claim === 'string' && cell.claim.trim()) return cell.claim.trim();
  const criterion = cell && cell.criterion ? String(cell.criterion) : '';
  const verdict = cell && cell.verdict ? String(cell.verdict) : '';
  return [criterion, verdict].filter(Boolean).join(': ').trim();
}

// Apply a single fc_check result to a cell. PURE given the result: returns a NEW
// cell object (never mutates the input), records the audited level/score, the
// fact-check status and assertionType, and re-evaluates the strict-domain floor.
function applyCheckToCell(cell, result, domain) {
  const checkedLevel = result ? parseLevel(result.level) : null;
  const floor = STRICT_FLOORS[domain] || null;

  // Below the domain floor (or unscored) -> the cell stays unverified regardless
  // of the prior self-grade. A claim that cannot be sourced to its floor is not
  // trustworthy in a strict domain.
  const belowFloor =
    floor != null && (checkedLevel == null || checkedLevel > floor);
  const blocked = result && result.status === 'BLOCKED';

  const out = Object.assign({}, cell);
  out.fcChecked = true;
  if (result) {
    out.fcStatus = result.status;
    out.fcAssertionType = result.assertionType;
    if (typeof result.score === 'number') out.fcScore = result.score;
  }

  if (checkedLevel != null) {
    out.level = levelLabel(checkedLevel);
  }

  if (belowFloor || blocked) {
    out.unverified = true;
    out.fcFloor = floor != null ? `L${floor}` : null;
    out.fcBelowFloor = true;
  } else if (checkedLevel != null) {
    // A genuine audited level at or above the floor clears the unverified flag
    // ONLY when the checker actually classified it as a CLAIM/FACT (not a bare
    // HYPOTHESIS/OPINION). Otherwise leave the flag as the engine set it.
    if (result && (result.status === 'CLAIM' || result.status === 'VERIFIED')) {
      out.unverified = false;
    }
    out.fcBelowFloor = false;
  }

  return out;
}

/**
 * Enrich a benchmark matrix in place-free fashion (returns a NEW matrix).
 *
 * @param {object} params
 * @param {object} params.benchmark   The DATA object the workflow returned
 *                                    ({ matrix, domain, scope, ... }).
 * @param {(text: string) => Promise<object>} [params.check]
 *                                    Async checker; in BYAN a thin adapter over
 *                                    mcp__byan__byan_fc_check. If omitted, the
 *                                    matrix is returned unchanged (opt-in).
 * @param {boolean} [params.enabled=true]  Master opt-in switch.
 * @param {(cell, domain) => boolean} [params.claimSelector]
 *                                    Override the hard-claim heuristic.
 * @returns {Promise<object>} A new benchmark object with enriched matrix and an
 *                            `enrichment` report ({ enabled, checked, raised,
 *                            flagged, skipped }).
 */
async function enrichMatrix(params) {
  const {
    benchmark,
    check,
    enabled = true,
    claimSelector = isHardClaim,
  } = params || {};

  if (!benchmark || typeof benchmark !== 'object') {
    throw new Error('enrichMatrix requires a benchmark object');
  }

  const domain = benchmark.domain || 'general';
  const matrix = Array.isArray(benchmark.matrix) ? benchmark.matrix : [];

  // Opt-in guard: no checker, disabled, or a degenerate (un-tabled) benchmark ->
  // return the input untouched with an honest report. This is the BYAN-only
  // gate: other platforms never inject a checker, so they get this branch.
  if (!enabled || typeof check !== 'function' || benchmark.degenerate) {
    return Object.assign({}, benchmark, {
      enrichment: {
        enabled: false,
        reason: !enabled
          ? 'disabled'
          : typeof check !== 'function'
            ? 'no-checker'
            : 'degenerate',
        checked: 0,
        raised: 0,
        flagged: 0,
        skipped: countCells(matrix),
      },
    });
  }

  let checked = 0;
  let raised = 0;
  let flagged = 0;
  let skipped = 0;

  const newMatrix = [];
  for (const row of matrix) {
    const cells = Array.isArray(row && row.cells) ? row.cells : [];
    const newCells = [];
    for (const cell of cells) {
      if (!claimSelector(cell, domain)) {
        skipped += 1;
        newCells.push(cell);
        continue;
      }

      const text = cellClaimText(cell);
      if (!text) {
        skipped += 1;
        newCells.push(cell);
        continue;
      }

      let result = null;
      try {
        result = await check(text);
      } catch {
        // A checker failure must never break the benchmark: fall back to the
        // self-graded cell, flagged so the gap is auditable, and keep going.
        const fallback = Object.assign({}, cell, { fcChecked: false, fcError: true });
        newCells.push(fallback);
        skipped += 1;
        continue;
      }

      const beforeLevel = parseLevel(cell && cell.level);
      const enriched = applyCheckToCell(cell, result, domain);
      checked += 1;

      const afterLevel = parseLevel(enriched.level);
      if (afterLevel != null && (beforeLevel == null || afterLevel < beforeLevel)) {
        // A smaller number is a STRONGER level -> authority was raised.
        raised += 1;
      }
      if (enriched.fcBelowFloor === true) flagged += 1;

      newCells.push(enriched);
    }
    newMatrix.push(Object.assign({}, row, { cells: newCells }));
  }

  return Object.assign({}, benchmark, {
    matrix: newMatrix,
    enrichment: { enabled: true, checked, raised, flagged, skipped },
  });
}

function countCells(matrix) {
  if (!Array.isArray(matrix)) return 0;
  return matrix.reduce(
    (n, row) => n + (Array.isArray(row && row.cells) ? row.cells.length : 0),
    0
  );
}

module.exports = {
  STRICT_FLOORS,
  parseLevel,
  levelLabel,
  isHardClaim,
  cellClaimText,
  applyCheckToCell,
  enrichMatrix,
  countCells,
};
