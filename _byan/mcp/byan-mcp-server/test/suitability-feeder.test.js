import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictToOutcome, verdictsToOutcomes } from '../lib/suitability-feeder.js';

// Feeder B maps an adversarial panel vote into a ledger outcome. The rule is
// "at least half refute => flagged => the cheap model failed". These tests pin
// the majority boundary (including the conservative tie handling) and the input
// guards.

test('a 3-skeptic panel: 0 or 1 refuters => survived (success)', () => {
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'load-story', refutedVotes: 0, totalVotes: 3 }).success, true);
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'load-story', refutedVotes: 1, totalVotes: 3 }).success, true);
});

test('a 3-skeptic panel: 2 or 3 refuters => flagged (failure)', () => {
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'load-story', refutedVotes: 2, totalVotes: 3 }).success, false);
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'load-story', refutedVotes: 3, totalVotes: 3 }).success, false);
});

test('single skeptic: refute flips it, no refute keeps it', () => {
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 0, totalVotes: 1 }).success, true);
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 1, totalVotes: 1 }).success, false);
});

test('an even panel tie resolves AGAINST the cheap model (conservative)', () => {
  // 1 of 2 refuters: a tie. Anti-downgrade bias flags it.
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 1, totalVotes: 2 }).success, false);
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 0, totalVotes: 2 }).success, true);
});

test('a 5-skeptic panel needs 3 refuters to flag', () => {
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 2, totalVotes: 5 }).success, true);
  assert.equal(verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 3, totalVotes: 5 }).success, false);
});

test('outcome carries model and leafId through unchanged', () => {
  const o = verdictToOutcome({ model: 'sonnet', leafId: 'parse-epics', refutedVotes: 0, totalVotes: 3 });
  assert.equal(o.model, 'sonnet');
  assert.equal(o.leafId, 'parse-epics');
});

test('malformed input throws (programmer error, surfaced not swallowed)', () => {
  assert.throws(() => verdictToOutcome({ leafId: 'x', refutedVotes: 0, totalVotes: 3 }));
  assert.throws(() => verdictToOutcome({ model: 'haiku', refutedVotes: 0, totalVotes: 3 }));
  assert.throws(() => verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 0, totalVotes: 0 }));
  assert.throws(() => verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 4, totalVotes: 3 }));
  assert.throws(() => verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: -1, totalVotes: 3 }));
  assert.throws(() => verdictToOutcome({ model: 'haiku', leafId: 'x', refutedVotes: 1.5, totalVotes: 3 }));
});

test('verdictsToOutcomes maps a batch and rejects a non-array', () => {
  const outcomes = verdictsToOutcomes([
    { model: 'haiku', leafId: 'a', refutedVotes: 0, totalVotes: 3 },
    { model: 'haiku', leafId: 'b', refutedVotes: 2, totalVotes: 3 },
  ]);
  assert.deepEqual(outcomes, [
    { model: 'haiku', leafId: 'a', success: true },
    { model: 'haiku', leafId: 'b', success: false },
  ]);
  assert.throws(() => verdictsToOutcomes('not-an-array'));
});
