/**
 * Unit tests for the BYAN-only opt-in evidence enrichment layer (C5d).
 *
 * The layer takes the DATA matrix the byan-benchmark workflow returns and, when
 * a byan_fc_check adapter is injected, stamps an AUDITED evidence level onto
 * each hard-claim cell, enforcing the strict-domain floors. These tests inject a
 * MOCK checker (no MCP, no network) and feed synthetic matrices, exactly as the
 * task requires.
 *
 * Placement under .claude/__tests__/ keeps the suite inside the locked build
 * scope while staying a first-class jest target (recursive **​/__tests__/** glob).
 */

'use strict';

const path = require('path');

const MODULE = path.resolve(__dirname, '..', 'hooks', 'lib', 'autobench-fc-enrich.js');
const {
  parseLevel,
  levelLabel,
  isHardClaim,
  cellClaimText,
  applyCheckToCell,
  enrichMatrix,
  countCells,
  STRICT_FLOORS,
} = require(MODULE);

// A mock byan_fc_check adapter: maps a claim text to a deterministic fc result
// keyed on substrings, so each test controls exactly what the checker returns.
function mockChecker(map) {
  const calls = [];
  const fn = async (text) => {
    calls.push(text);
    for (const key of Object.keys(map)) {
      if (text.includes(key)) return map[key];
    }
    // Default: a mid-level CLAIM so an un-keyed cell still gets a real result.
    return { status: 'CLAIM', level: 3, score: 65, assertionType: 'CLAIM' };
  };
  fn.calls = calls;
  return fn;
}

// Build a one-row, two-cell synthetic benchmark for the common case.
function makeBenchmark(overrides) {
  return Object.assign(
    {
      workflow: 'byan-benchmark',
      domain: 'general',
      scope: 'internal',
      degenerate: false,
      matrix: [
        {
          option: 'Option A',
          total: 10,
          cells: [
            { criterion: 'speed', verdict: 'always fastest', level: 'L4', unverified: true, claim: 'Option A is always the fastest' },
            { criterion: 'cost', verdict: 'cheaper at scale', level: 'L4', unverified: true, claim: 'cheaper at scale' },
          ],
        },
      ],
    },
    overrides
  );
}

describe('autobench-fc-enrich - helpers', () => {
  test('parseLevel accepts L-strings, bare strings and numbers; rejects out-of-range', () => {
    expect(parseLevel('L2')).toBe(2);
    expect(parseLevel('l5')).toBe(5);
    expect(parseLevel('3')).toBe(3);
    expect(parseLevel(4)).toBe(4);
    expect(parseLevel(0)).toBeNull();
    expect(parseLevel(6)).toBeNull();
    expect(parseLevel('LX')).toBeNull();
    expect(parseLevel(undefined)).toBeNull();
  });

  test('levelLabel renders the canonical L{n}', () => {
    expect(levelLabel(1)).toBe('L1');
    expect(levelLabel(null)).toBeNull();
  });

  test('STRICT_FLOORS encodes the documented domain floors (sec L2, perf L2, compliance L1)', () => {
    // Numeric: smaller is stronger. compliance requires L1; security/perf L2.
    expect(STRICT_FLOORS.compliance).toBe(1);
    expect(STRICT_FLOORS.security).toBe(2);
    expect(STRICT_FLOORS.performance).toBe(2);
  });

  test('isHardClaim: strict domain forces inclusion; absolutes trigger; hedged general cell skipped', () => {
    const hedged = { criterion: 'cost', verdict: 'somewhat cheaper' };
    const absolute = { criterion: 'speed', verdict: 'always the fastest' };
    expect(isHardClaim(hedged, 'general')).toBe(false);
    expect(isHardClaim(absolute, 'general')).toBe(true);
    expect(isHardClaim(hedged, 'security')).toBe(true);
    expect(isHardClaim({ verdict: 'x', isHardClaim: true }, 'general')).toBe(true);
  });

  test('cellClaimText prefers explicit claim, else joins criterion + verdict', () => {
    expect(cellClaimText({ claim: 'the basis' })).toBe('the basis');
    expect(cellClaimText({ criterion: 'speed', verdict: 'fast' })).toBe('speed: fast');
  });

  test('countCells totals across rows', () => {
    expect(countCells(makeBenchmark().matrix)).toBe(2);
    expect(countCells(null)).toBe(0);
  });
});

describe('autobench-fc-enrich - applyCheckToCell (floors + flags)', () => {
  test('a CLAIM at/above floor raises the level and clears unverified (non-strict)', () => {
    const cell = { criterion: 'speed', verdict: 'fast', level: 'L4', unverified: true };
    const out = applyCheckToCell(cell, { status: 'CLAIM', level: 2, score: 80, assertionType: 'CLAIM' }, 'general');
    expect(out.level).toBe('L2');
    expect(out.unverified).toBe(false);
    expect(out.fcChecked).toBe(true);
    expect(out.fcScore).toBe(80);
    // Pure: the input cell is not mutated.
    expect(cell.level).toBe('L4');
  });

  test('a security claim below the L2 floor stays flagged unverified', () => {
    const cell = { criterion: 'auth', verdict: 'secure', level: 'L4', unverified: false };
    const out = applyCheckToCell(cell, { status: 'CLAIM', level: 4, score: 50, assertionType: 'CLAIM' }, 'security');
    expect(out.unverified).toBe(true);
    expect(out.fcBelowFloor).toBe(true);
    expect(out.fcFloor).toBe('L2');
  });

  test('a security claim at the L2 floor clears unverified', () => {
    const cell = { criterion: 'auth', verdict: 'secure', level: 'L4', unverified: true };
    const out = applyCheckToCell(cell, { status: 'CLAIM', level: 2, score: 80, assertionType: 'CLAIM' }, 'security');
    expect(out.level).toBe('L2');
    expect(out.unverified).toBe(false);
    expect(out.fcBelowFloor).toBe(false);
  });

  test('a compliance claim below L1 stays flagged (L1 is the strictest floor)', () => {
    const cell = { criterion: 'gdpr', verdict: 'compliant', level: 'L3', unverified: false };
    const out = applyCheckToCell(cell, { status: 'CLAIM', level: 2, score: 80, assertionType: 'CLAIM' }, 'compliance');
    expect(out.unverified).toBe(true);
    expect(out.fcFloor).toBe('L1');
  });

  test('a BLOCKED fc result flags the cell unverified even off a strict domain', () => {
    const cell = { criterion: 'x', verdict: 'y', level: 'L4', unverified: false };
    const out = applyCheckToCell(cell, { status: 'BLOCKED', level: 5, score: 20, assertionType: 'OPINION' }, 'general');
    expect(out.unverified).toBe(true);
  });

  test('a HYPOTHESIS result records the level but does NOT clear unverified', () => {
    const cell = { criterion: 'x', verdict: 'y', level: 'L4', unverified: true };
    const out = applyCheckToCell(cell, { status: 'OPINION', level: 5, score: 20, assertionType: 'HYPOTHESIS' }, 'general');
    expect(out.unverified).toBe(true);
    expect(out.fcStatus).toBe('OPINION');
  });
});

describe('autobench-fc-enrich - enrichMatrix (opt-in + orchestration)', () => {
  test('opt-in: with NO checker the matrix is returned unchanged (BYAN-only gate)', async () => {
    const bench = makeBenchmark();
    const out = await enrichMatrix({ benchmark: bench });
    expect(out.enrichment.enabled).toBe(false);
    expect(out.enrichment.reason).toBe('no-checker');
    // Matrix content is identical.
    expect(out.matrix).toEqual(bench.matrix);
  });

  test('opt-in: enabled=false short-circuits even with a checker', async () => {
    const out = await enrichMatrix({ benchmark: makeBenchmark(), check: mockChecker({}), enabled: false });
    expect(out.enrichment.enabled).toBe(false);
    expect(out.enrichment.reason).toBe('disabled');
  });

  test('a degenerate benchmark is never enriched', async () => {
    const bench = makeBenchmark({ degenerate: true, matrix: [] });
    const out = await enrichMatrix({ benchmark: bench, check: mockChecker({}) });
    expect(out.enrichment.enabled).toBe(false);
    expect(out.enrichment.reason).toBe('degenerate');
  });

  test('enriches hard-claim cells and counts raised authority', async () => {
    const check = mockChecker({
      'always the fastest': { status: 'CLAIM', level: 2, score: 80, assertionType: 'CLAIM' },
    });
    const bench = makeBenchmark();
    const out = await enrichMatrix({ benchmark: bench, check });
    // The absolute cell ("always fastest") is a hard claim; the hedged "cheaper"
    // cell is not, so only one cell is checked.
    expect(out.enrichment.enabled).toBe(true);
    expect(out.enrichment.checked).toBe(1);
    expect(out.enrichment.raised).toBe(1);
    const enrichedCell = out.matrix[0].cells[0];
    expect(enrichedCell.level).toBe('L2');
    expect(enrichedCell.unverified).toBe(false);
    expect(enrichedCell.fcChecked).toBe(true);
    // The skipped cell is passed through untouched.
    expect(out.matrix[0].cells[1].fcChecked).toBeUndefined();
    expect(out.enrichment.skipped).toBe(1);
    // The mock was called exactly once, with the hard-claim text.
    expect(check.calls).toEqual(['Option A is always the fastest']);
  });

  test('strict domain: EVERY cell is a hard claim, floor flags the shortfalls', async () => {
    const check = mockChecker({
      'gdpr': { status: 'CLAIM', level: 2, score: 80, assertionType: 'CLAIM' }, // below L1 compliance floor
      'audit log': { status: 'CLAIM', level: 1, score: 95, assertionType: 'CLAIM' }, // meets L1
    });
    const bench = makeBenchmark({
      domain: 'compliance',
      matrix: [
        {
          option: 'Vendor X',
          total: 5,
          cells: [
            { criterion: 'gdpr', verdict: 'compliant', level: 'L4', unverified: true, claim: 'gdpr article 17 honored' },
            { criterion: 'audit', verdict: 'has audit log', level: 'L4', unverified: true, claim: 'ships an audit log' },
          ],
        },
      ],
    });
    const out = await enrichMatrix({ benchmark: bench, check });
    expect(out.enrichment.checked).toBe(2);
    // gdpr at L2 is below the L1 compliance floor -> flagged.
    expect(out.matrix[0].cells[0].unverified).toBe(true);
    expect(out.matrix[0].cells[0].fcBelowFloor).toBe(true);
    // audit log at L1 meets the floor -> cleared.
    expect(out.matrix[0].cells[1].unverified).toBe(false);
    expect(out.enrichment.flagged).toBe(1);
  });

  test('a checker that throws degrades gracefully: cell flagged fcError, never thrown', async () => {
    const check = async () => { throw new Error('mcp down'); };
    const bench = makeBenchmark({ domain: 'security' });
    const out = await enrichMatrix({ benchmark: bench, check });
    // Both security cells attempted; both fall back, none crash.
    expect(out.enrichment.enabled).toBe(true);
    expect(out.matrix[0].cells.every((c) => c.fcError === true)).toBe(true);
    expect(out.enrichment.skipped).toBe(2);
  });

  test('enrichMatrix throws only on a missing/invalid benchmark object', async () => {
    await expect(enrichMatrix({ benchmark: null, check: mockChecker({}) })).rejects.toThrow(/benchmark object/);
  });
});
