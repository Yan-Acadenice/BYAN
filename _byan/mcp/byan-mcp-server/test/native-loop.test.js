import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convergenceGuard, buildVerdict, DEFAULT_MAX_CYCLES } from '../lib/native-loop.js';

test('default cap is 3 cycles', () => {
  assert.equal(DEFAULT_MAX_CYCLES, 3);
});

test('convergenceGuard: green converges immediately (done, not aborted)', () => {
  const g = convergenceGuard({ cycles: 1, green: true });
  assert.deepEqual(g, { done: true, abort: false, reason: 'green' });
});

test('convergenceGuard: keeps looping while under the cap and not green', () => {
  const g = convergenceGuard({ cycles: 1, green: false });
  assert.equal(g.done, false);
  assert.equal(g.abort, false);
  const g2 = convergenceGuard({ cycles: 2, green: false });
  assert.equal(g2.done, false);
});

test('convergenceGuard: hard-aborts at the 3-cycle cap without convergence', () => {
  const g = convergenceGuard({ cycles: 3, green: false });
  assert.equal(g.done, true);
  assert.equal(g.abort, true);
  assert.match(g.reason, /no convergence after 3 cycles/);
});

test('convergenceGuard: respects a custom cap', () => {
  assert.equal(convergenceGuard({ cycles: 2, green: false, maxCycles: 2 }).abort, true);
  assert.equal(convergenceGuard({ cycles: 1, green: false, maxCycles: 2 }).done, false);
});

test('buildVerdict: review-ready when green, flags the human gate', () => {
  const v = buildVerdict({ storyKey: '1-2-auth', green: true, cycles: 2 });
  assert.equal(v.status, 'review-ready');
  assert.equal(v.green, true);
  assert.equal(v.needsHumanGate, true);
  assert.equal(v.workflow, 'dev-story');
});

test('buildVerdict: aborted-no-convergence at the cap, carries blocking issues', () => {
  const v = buildVerdict({ storyKey: '1-2-auth', green: false, cycles: 3, blocking: ['tests red'] });
  assert.equal(v.status, 'aborted-no-convergence');
  assert.deepEqual(v.blocking, ['tests red']);
});

test('buildVerdict: in-progress below the cap and not green', () => {
  const v = buildVerdict({ green: false, cycles: 1 });
  assert.equal(v.status, 'in-progress');
  assert.equal(v.storyKey, null);
});
