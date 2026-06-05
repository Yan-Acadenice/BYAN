import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  leafKey,
  recordOutcome,
  posterior,
  rating,
  report,
  formatRating,
  betai,
  betaQuantile,
} from '../lib/suitability.js';

// The suitability ledger is the math core of the model-suitability feature: it
// decides, from binary adequacy outcomes, whether a cheap model is SAFE on a
// given leaf. These tests pin the statistics (regularized incomplete beta +
// quantile), the immutable update, and the verdict thresholds — the parts a
// wrong cheap model would botch silently, which is exactly why this leaf was
// never downgraded.

// --- Math primitive: regularized incomplete beta I_x(a,b) ------------------

test('betai is the identity CDF for the uniform Beta(1,1)', () => {
  for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.ok(Math.abs(betai(x, 1, 1) - x) < 1e-9, `betai(${x},1,1) should be ${x}`);
  }
});

test('betai matches the closed form for Beta(a,1): CDF = x^a', () => {
  // Beta(a,1) has pdf a*x^(a-1) so its CDF is exactly x^a.
  assert.ok(Math.abs(betai(0.5, 4, 1) - 0.0625) < 1e-6); // 0.5^4
  assert.ok(Math.abs(betai(0.8, 3, 1) - 0.512) < 1e-6);  // 0.8^3
});

test('betai is bounded and monotonic increasing in x', () => {
  assert.equal(betai(0, 3, 5), 0);
  assert.equal(betai(1, 3, 5), 1);
  let prev = -1;
  for (let x = 0; x <= 1.0001; x += 0.05) {
    const v = betai(Math.min(x, 1), 3, 5);
    assert.ok(v >= prev, `betai must not decrease (x=${x})`);
    prev = v;
  }
});

// --- Math primitive: Beta quantile (inverse CDF) ---------------------------

test('betaQuantile inverts betai (round-trip)', () => {
  for (const [a, b] of [[1, 1], [4, 1], [21, 1], [11, 11], [6, 16]]) {
    for (const p of [0.025, 0.5, 0.975]) {
      const x = betaQuantile(p, a, b);
      assert.ok(Math.abs(betai(x, a, b) - p) < 1e-6, `round-trip p=${p} a=${a} b=${b}`);
    }
  }
});

test('betaQuantile clamps the degenerate tails', () => {
  assert.equal(betaQuantile(0, 4, 2), 0);
  assert.equal(betaQuantile(1, 4, 2), 1);
});

// --- Ledger key ------------------------------------------------------------

test('leafKey is deterministic and pairs model with leaf', () => {
  assert.equal(leafKey('haiku', 'load-story'), leafKey('haiku', 'load-story'));
  assert.notEqual(leafKey('haiku', 'load-story'), leafKey('sonnet', 'load-story'));
  assert.notEqual(leafKey('haiku', 'load-story'), leafKey('haiku', 'parse-epics'));
});

// --- Immutable outcome recording -------------------------------------------

test('recordOutcome increments successes/failures and is immutable', () => {
  const l0 = {};
  const l1 = recordOutcome(l0, { model: 'haiku', leafId: 'load-story', success: true });
  const l2 = recordOutcome(l1, { model: 'haiku', leafId: 'load-story', success: false });

  assert.deepEqual(l0, {}, 'original ledger must not be mutated');
  const k = leafKey('haiku', 'load-story');
  assert.equal(l1[k].successes, 1);
  assert.equal(l1[k].failures, 0);
  assert.equal(l2[k].successes, 1);
  assert.equal(l2[k].failures, 1);
  assert.equal(l1[k].failures, 0, 'l1 must stay unchanged after l2 is derived');
});

test('recordOutcome rejects malformed input (programmer error, not silent)', () => {
  assert.throws(() => recordOutcome({}, { model: 'haiku', success: true }));
  assert.throws(() => recordOutcome({}, { leafId: 'x', success: true }));
  assert.throws(() => recordOutcome({}, { model: 'haiku', leafId: 'x' }));
  assert.throws(() => recordOutcome({}, { model: 'haiku', leafId: 'x', success: 'yes' }));
});

// --- Posterior: prior application ------------------------------------------

test('posterior applies the configurable prior to raw counts', () => {
  const entry = { model: 'haiku', leafId: 'x', successes: 3, failures: 2 };
  const p = posterior(entry, { priorAlpha: 1, priorBeta: 1 });
  assert.equal(p.alpha, 4); // 1 + 3
  assert.equal(p.beta, 3);  // 1 + 2
});

// --- Monotonicity: a success can only raise belief, a failure only lower it --

test('mean strictly rises on success and strictly falls on failure', () => {
  let l = {};
  for (let i = 0; i < 5; i++) l = recordOutcome(l, { model: 'haiku', leafId: 'x', success: true });
  const before = rating(l, { model: 'haiku', leafId: 'x' });

  const afterOk = rating(
    recordOutcome(l, { model: 'haiku', leafId: 'x', success: true }),
    { model: 'haiku', leafId: 'x' },
  );
  const afterKo = rating(
    recordOutcome(l, { model: 'haiku', leafId: 'x', success: false }),
    { model: 'haiku', leafId: 'x' },
  );

  assert.ok(afterOk.mean > before.mean, 'success must raise the mean');
  assert.ok(afterKo.mean < before.mean, 'failure must lower the mean');
  // Strict: a real Beta posterior moves the credible floor with each fresh
  // outcome at n>0. Non-strict bounds would pass against a constant-bound stub.
  assert.ok(afterOk.lower > before.lower, 'success must strictly raise the credible floor');
  assert.ok(afterKo.lower < before.lower, 'failure must strictly lower the credible floor');
});

// --- Verdict thresholds: the safety decision -------------------------------

function ledgerWith(successes, failures, leafId = 'x') {
  let l = {};
  for (let i = 0; i < successes; i++) l = recordOutcome(l, { model: 'haiku', leafId, success: true });
  for (let i = 0; i < failures; i++) l = recordOutcome(l, { model: 'haiku', leafId, success: false });
  return l;
}

test('low-n clean evidence is WATCH, never keep-cheap (the conservative core)', () => {
  // 3 successes, 0 failures: mean 0.8 looks good but the interval is wide.
  const r = rating(ledgerWith(3, 0), { model: 'haiku', leafId: 'x' });
  assert.equal(r.n, 3);
  assert.ok(r.lower < DEFAULTS.keepThreshold, 'thin evidence must keep the floor below the keep threshold');
  assert.equal(r.verdict, 'watch');
});

test('high-n clean evidence earns KEEP-CHEAP', () => {
  const r = rating(ledgerWith(30, 0), { model: 'haiku', leafId: 'x' });
  assert.ok(r.lower >= DEFAULTS.keepThreshold, 'sustained success must lift the floor above the keep threshold');
  assert.equal(r.verdict, 'keep-cheap');
});

test('strong negative evidence earns DEMOTE', () => {
  const r = rating(ledgerWith(5, 15), { model: 'haiku', leafId: 'x' });
  assert.ok(r.upper <= DEFAULTS.demoteThreshold, 'a low ceiling means even optimism cannot justify cheap');
  assert.equal(r.verdict, 'demote');
});

test('verdicts are mutually exclusive and deterministic', () => {
  const seen = new Set();
  for (const [s, f] of [[0, 0], [3, 0], [30, 0], [5, 15], [10, 10], [50, 3]]) {
    const r1 = rating(ledgerWith(s, f), { model: 'haiku', leafId: 'x' });
    const r2 = rating(ledgerWith(s, f), { model: 'haiku', leafId: 'x' });
    assert.deepEqual(r1, r2, 'same evidence must yield the same rating');
    assert.ok(['keep-cheap', 'watch', 'demote'].includes(r1.verdict));
    seen.add(r1.verdict);
  }
  assert.ok(seen.size >= 2, 'the fixtures should exercise more than one verdict');
});

test('an unseen (model x leaf) defaults to n=0 and watch', () => {
  const r = rating({}, { model: 'haiku', leafId: 'never-seen' });
  assert.equal(r.n, 0);
  assert.equal(r.verdict, 'watch');
});

// --- Report: surfaces the lower bound + n, never a bare point estimate ------

test('report lists every pair, severity-first, each carrying lower bound and n', () => {
  let l = {};
  l = ledgerMerge(l, ledgerWith(30, 0, 'safe-leaf'));
  l = ledgerMerge(l, ledgerWith(5, 15, 'bad-leaf'));
  l = ledgerMerge(l, ledgerWith(3, 0, 'thin-leaf'));

  const rows = report(l);
  assert.equal(rows.length, 3);
  // severity order: demote first, then watch, then keep-cheap
  assert.equal(rows[0].verdict, 'demote');
  assert.equal(rows[rows.length - 1].verdict, 'keep-cheap');
  for (const row of rows) {
    assert.ok(typeof row.lower === 'number', 'every row must carry the credible lower bound');
    assert.ok(typeof row.n === 'number', 'every row must carry the sample size n');
  }
});

test('formatRating never emits a bare percentage — always the lower bound and n', () => {
  const r = rating(ledgerWith(3, 0), { model: 'haiku', leafId: 'x' });
  const s = formatRating(r);
  assert.match(s, /n=3/, 'must show the sample size');
  assert.match(s, /lower/i, 'must show the credible lower bound, not just the mean');
  assert.match(s, /watch/, 'must show the verdict');
});

// --- Configurable thresholds ------------------------------------------------

test('thresholds are configurable (defaults are not load-bearing on the math)', () => {
  // With a lax keep threshold, thinner evidence already keeps cheap.
  const r = rating(ledgerWith(8, 0), { model: 'haiku', leafId: 'x' }, { keepThreshold: 0.5 });
  assert.equal(r.verdict, 'keep-cheap');
});

// Test-local helper: merge two single-leaf ledgers (distinct keys) into one.
function ledgerMerge(a, b) {
  return { ...a, ...b };
}
