import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../lib/dispatch.js';

test('score < 15 routes to main-thread', () => {
  const r = dispatch({ task: 'hi', complexity: 5 });
  assert.equal(r.route, 'main-thread');
});

test('score 15-39 parallelizable routes to agent-subagent-worktree', () => {
  const r = dispatch({ task: 'medium task', complexity: 25, parallelizable: true });
  assert.equal(r.route, 'agent-subagent-worktree');
});

test('score 15-39 sequential routes to mcp-worker-haiku', () => {
  const r = dispatch({ task: 'medium seq', complexity: 25, parallelizable: false });
  assert.equal(r.route, 'mcp-worker-haiku');
});

test('score >= 40 routes to main-thread-opus regardless of parallelizable', () => {
  const r1 = dispatch({ task: 'complex', complexity: 50, parallelizable: true });
  const r2 = dispatch({ task: 'complex', complexity: 80, parallelizable: false });
  assert.equal(r1.route, 'main-thread-opus');
  assert.equal(r2.route, 'main-thread-opus');
});

test('complexity estimated from task length when absent', () => {
  const shortTask = dispatch({ task: 'x' });
  assert.equal(shortTask.score, 0);
  assert.equal(shortTask.route, 'main-thread');
  const longTask = dispatch({ task: 'x'.repeat(500) });
  assert.equal(longTask.score, 50);
  assert.equal(longTask.route, 'main-thread-opus');
});

test('score is clamped to 100 max from task length estimation', () => {
  const r = dispatch({ task: 'x'.repeat(5000) });
  assert.equal(r.score, 100);
});

test('parallelizable defaults to false when not boolean true', () => {
  const r1 = dispatch({ task: 't', complexity: 25 });
  const r2 = dispatch({ task: 't', complexity: 25, parallelizable: 'yes' });
  assert.equal(r1.parallelizable, false);
  assert.equal(r2.parallelizable, false);
});
