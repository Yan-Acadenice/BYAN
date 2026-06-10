/**
 * Unit + CLI tests for the BYAN Auto-Benchmark miss-ledger reader (C5e).
 *
 * The reader aggregates the JSONL trail the Stop hook appends to
 * _byan-output/benchmark-ledger.jsonl into fires / misses / miss-rate. These
 * tests feed a SYNTHETIC ledger written to a temp file (so the repo ledger is
 * never touched) and assert the aggregate, the malformed-line tolerance, the
 * missing-file path, the formatted report, and the CLI main() exit behaviour.
 *
 * Placement under .claude/__tests__/ keeps the suite inside the locked build
 * scope while staying a first-class jest target (recursive **​/__tests__/** glob).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, '.claude', 'hooks', 'lib', 'autobench-ledger-report.js');
const {
  readLedger,
  aggregate,
  report,
  formatReport,
  pct,
  main,
  MISS_EVENTS,
  HIT_EVENTS,
} = require(MODULE);

// A synthetic ledger: 2 misses, 3 hits, 1 skip, 1 never, 1 escape, 1 no-choice.
// fires = hits + misses = 5; miss-rate = 2/5 = 0.4.
const SYNTHETIC = [
  { turnHash: 'a1', event: 'fired-block', neverHit: false, choiceLang: true, marker: false },
  { turnHash: 'b2', event: 'satisfied-marker', g1: 2, g2: 1, scope: 'internal', marker: true },
  { turnHash: 'c3', event: 'satisfied-marker', g1: 3, g2: 2, scope: 'external', marker: true },
  { turnHash: 'd4', event: 'fired-block', neverHit: false, choiceLang: true, marker: false },
  { turnHash: 'e5', event: 'satisfied-marker', g1: 4, g2: 3, scope: 'internal', marker: true },
  { turnHash: 'f6', event: 'satisfied-skip', scope: 'internal', marker: true },
  { turnHash: 'g7', event: 'satisfied-never', neverHit: true, choiceLang: true, marker: false },
  { turnHash: 'h8', event: 'satisfied-escape', neverHit: false, choiceLang: true, marker: false },
  { turnHash: 'i9', event: 'no-choice', neverHit: false, choiceLang: false, marker: false },
];

function writeLedger(dir, entries) {
  const p = path.join(dir, 'benchmark-ledger.jsonl');
  fs.writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-ledger-'));
});
afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('autobench-ledger-report - event taxonomy', () => {
  test('fired-block is the only MISS event; satisfied-marker is the only HIT event', () => {
    expect(MISS_EVENTS.has('fired-block')).toBe(true);
    expect(MISS_EVENTS.has('satisfied-marker')).toBe(false);
    expect(HIT_EVENTS.has('satisfied-marker')).toBe(true);
    expect(HIT_EVENTS.has('satisfied-skip')).toBe(false);
  });
});

describe('autobench-ledger-report - readLedger', () => {
  test('reads and parses a well-formed JSONL ledger', () => {
    const p = writeLedger(tmp, SYNTHETIC);
    const { entries, malformed, missing } = readLedger(p);
    expect(missing).toBe(false);
    expect(malformed).toBe(0);
    expect(entries).toHaveLength(SYNTHETIC.length);
    expect(entries[0].event).toBe('fired-block');
  });

  test('a missing ledger is not an error (empty trail, missing:true)', () => {
    const { entries, missing } = readLedger(path.join(tmp, 'does-not-exist.jsonl'));
    expect(missing).toBe(true);
    expect(entries).toEqual([]);
  });

  test('malformed lines are counted and skipped, never thrown', () => {
    const p = path.join(tmp, 'benchmark-ledger.jsonl');
    fs.writeFileSync(
      p,
      [
        JSON.stringify({ event: 'satisfied-marker', g1: 2, g2: 1, scope: 'internal' }),
        '{ not valid json',
        '',
        '   ',
        JSON.stringify({ event: 'fired-block' }),
        '42', // valid JSON but not an object
      ].join('\n')
    );
    const { entries, malformed } = readLedger(p);
    expect(entries).toHaveLength(2);
    expect(malformed).toBe(2); // the broken line + the bare number
  });
});

describe('autobench-ledger-report - aggregate', () => {
  test('computes fires, misses, hits, skips, exempt and miss-rate', () => {
    const agg = aggregate(SYNTHETIC);
    expect(agg.total).toBe(9);
    expect(agg.misses).toBe(2);
    expect(agg.hits).toBe(3);
    expect(agg.skips).toBe(1);
    // never + escape + no-choice = 3 exempt.
    expect(agg.exempt).toBe(3);
    expect(agg.fires).toBe(5); // hits + misses
    expect(agg.missRate).toBeCloseTo(0.4, 5);
  });

  test('miss-rate is 0 when no fork was ever present (no division by zero)', () => {
    const agg = aggregate([
      { event: 'no-choice' },
      { event: 'satisfied-never' },
    ]);
    expect(agg.fires).toBe(0);
    expect(agg.missRate).toBe(0);
  });

  test('tallies byEvent, byScope and gate averages from marker entries', () => {
    const agg = aggregate(SYNTHETIC);
    expect(agg.byEvent['satisfied-marker']).toBe(3);
    expect(agg.byEvent['fired-block']).toBe(2);
    expect(agg.byScope.internal).toBe(3); // 2 markers + 1 skip
    expect(agg.byScope.external).toBe(1);
    // g1 over the 3 marker entries: (2+3+4)/3 = 3.0
    expect(agg.gates.countWithGates).toBe(3);
    expect(agg.gates.g1Avg).toBeCloseTo(3.0, 5);
    expect(agg.gates.g2Avg).toBeCloseTo(2.0, 5);
  });

  test('an unrecognised event lands under unknown, not silently dropped', () => {
    const agg = aggregate([{ event: 'satisfied-future-thing' }, {}]);
    // The {} entry has no event -> bucketed as 'unknown' event string.
    expect(agg.unknown).toBe(2);
    expect(agg.byEvent['satisfied-future-thing']).toBe(1);
    expect(agg.byEvent['unknown']).toBe(1);
  });

  test('handles a non-array input defensively', () => {
    const agg = aggregate(null);
    expect(agg.total).toBe(0);
    expect(agg.missRate).toBe(0);
  });
});

describe('autobench-ledger-report - report + formatReport', () => {
  test('report() reads + aggregates and carries malformed/missing/path', () => {
    const p = writeLedger(tmp, SYNTHETIC);
    const rep = report(p);
    expect(rep.path).toBe(p);
    expect(rep.missing).toBe(false);
    expect(rep.malformed).toBe(0);
    expect(rep.fires).toBe(5);
  });

  test('formatReport renders a human summary with miss-rate and no emoji', () => {
    const rep = report(writeLedger(tmp, SYNTHETIC));
    const out = formatReport(rep);
    expect(out).toContain('miss-rate   : 40.0%');
    expect(out).toContain('forks (fires): 5');
    expect(out).toContain('misses: 2');
    expect(out).toMatch(/satisfied-marker\s+3/);
    // No emoji (IA-23): assert the output carries no pictographic code points.
    // Ranges written as escapes only so the test source itself stays emoji-free.
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(out)).toBe(false);
  });

  test('formatReport on a missing ledger states the hook has not fired', () => {
    const rep = report(path.join(tmp, 'nope.jsonl'));
    const out = formatReport(rep);
    expect(out).toContain('ledger not found');
  });

  test('pct renders one decimal', () => {
    expect(pct(0.4)).toBe('40.0%');
    expect(pct(0)).toBe('0.0%');
  });
});

describe('autobench-ledger-report - main() CLI', () => {
  test('main() returns the report object (default text mode)', () => {
    const p = writeLedger(tmp, SYNTHETIC);
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const rep = main([p]);
    spy.mockRestore();
    expect(rep.fires).toBe(5);
    expect(rep.misses).toBe(2);
  });

  test('main() --json emits parseable JSON', () => {
    const p = writeLedger(tmp, SYNTHETIC);
    let captured = '';
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => { captured += s; return true; });
    main([p, '--json']);
    spy.mockRestore();
    const parsed = JSON.parse(captured);
    expect(parsed.fires).toBe(5);
    expect(parsed.missRate).toBeCloseTo(0.4, 5);
  });

  test('e2e spawnSync: the CLI exits 0 and prints the report', () => {
    const p = writeLedger(tmp, SYNTHETIC);
    const res = spawnSync('node', [MODULE, p], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('miss-rate   : 40.0%');
  });

  test('e2e spawnSync: exits 0 even when the ledger is missing', () => {
    const res = spawnSync('node', [MODULE, path.join(tmp, 'absent.jsonl')], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('ledger not found');
  });
});
