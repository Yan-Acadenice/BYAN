import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBenchmark,
  classifyPunt,
  classifyCompleteness,
  summarize,
  recommend,
  buildReport,
} from '../lib/armament-report.js';

// WI-7 — the armament observation report core. It only measures + recommends ;
// it never arms. These tests pin the classifiers, the calibrated recommendation
// (small-sample HOLD, clean ARM, dirty HOLD) and the assembled report.

test('classifyBenchmark : unmarked real choice would fire, a satisfied skip does not', () => {
  assert.equal(classifyBenchmark({ choiceLang: true, artifact: true, marker: false, neverHit: false }), 'wouldFire');
  assert.equal(classifyBenchmark({ event: 'satisfied-skip', marker: true }), 'satisfied');
  assert.equal(classifyBenchmark({ event: 'blocked' }), 'wouldFire');
  assert.equal(classifyBenchmark(null), 'skip');
});

test('classifyPunt : a detected punt would fire', () => {
  assert.equal(classifyPunt({ punt: true }), 'wouldFire');
  assert.equal(classifyPunt({ event: 'observed-disarmed-punt', punt: true }), 'wouldFire');
  assert.equal(classifyPunt({ punt: false, event: 'ok' }), 'satisfied');
});

test('classifyCompleteness : a gap (missing) would fire', () => {
  assert.equal(classifyCompleteness({ missing: ['F2'] }), 'wouldFire');
  assert.equal(classifyCompleteness({ missing: [] }), 'satisfied');
});

test('summarize : counts totals, would-fire and rate', () => {
  const s = summarize(
    [{ punt: true }, { punt: false }, { punt: true }, null],
    classifyPunt
  );
  assert.equal(s.total, 3);
  assert.equal(s.wouldFire, 2);
  assert.equal(s.satisfied, 1);
  assert.ok(Math.abs(s.fireRate - 2 / 3) < 1e-9);
});

test('recommend : small sample -> HOLD, clean -> ARM, dirty -> HOLD', () => {
  assert.equal(recommend({ total: 5, wouldFire: 0, fireRate: 0 }).arm, false); // small
  assert.equal(recommend({ total: 40, wouldFire: 0, fireRate: 0 }).arm, true); // clean
  assert.equal(recommend({ total: 40, wouldFire: 8, fireRate: 0.2 }).arm, false); // dirty
});

test('buildReport : three guards, each with a summary + armed flag + recommend', () => {
  const r = buildReport(
    { benchmark: [{ event: 'satisfied-skip', marker: true }], punt: [{ punt: true }], completeness: [{ missing: [] }] },
    { autobench: false, punt: false, completeness: false }
  );
  for (const k of ['autobench', 'punt', 'completeness']) {
    assert.ok(r[k].summary, `${k} has a summary`);
    assert.equal(r[k].armed, false);
    assert.ok(typeof r[k].recommend.arm === 'boolean');
  }
});
