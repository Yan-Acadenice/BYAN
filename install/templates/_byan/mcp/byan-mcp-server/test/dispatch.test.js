import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../lib/dispatch.js';

// --- CASE 1: score < 15 -> strategy 'main-thread' ---
test('score < 15 -> strategy main-thread', () => {
  const r = dispatch({ task: 'hi', complexity: 5 });
  assert.equal(r.strategy, 'main-thread');
});

// --- CASE 2: score 15-39 parallelizable -> strategy 'agent-subagent-worktree' ---
test('score 15-39 parallelizable -> strategy agent-subagent-worktree', () => {
  const r = dispatch({ task: 'medium task', complexity: 25, parallelizable: true });
  assert.equal(r.strategy, 'agent-subagent-worktree');
});

// --- CASE 3: score 15-39 sequential -> strategy 'mcp-worker' (no '-haiku' suffix) ---
test('score 15-39 sequential -> strategy mcp-worker (no -haiku suffix)', () => {
  const r = dispatch({ task: 'medium seq', complexity: 25, parallelizable: false });
  assert.equal(r.strategy, 'mcp-worker');
  assert.ok(!r.strategy.includes('-haiku'), `strategy must not contain '-haiku', got: ${r.strategy}`);
});

// --- CASE 4: score >= 40 (both parallelizable true and false) -> strategy 'main-thread' (no 'main-thread-opus') ---
test('score >= 40 parallelizable true -> strategy main-thread (no -opus)', () => {
  const r = dispatch({ task: 'complex', complexity: 50, parallelizable: true });
  assert.equal(r.strategy, 'main-thread');
  assert.ok(r.strategy !== 'main-thread-opus', `strategy must not be 'main-thread-opus', got: ${r.strategy}`);
});

test('score >= 40 parallelizable false -> strategy main-thread (no -opus)', () => {
  const r = dispatch({ task: 'complex', complexity: 80, parallelizable: false });
  assert.equal(r.strategy, 'main-thread');
  assert.ok(r.strategy !== 'main-thread-opus', `strategy must not be 'main-thread-opus', got: ${r.strategy}`);
});

// --- CASE 5: complexity estimated from task.length when absent ---
test('task length 1 -> score 0, strategy main-thread', () => {
  const r = dispatch({ task: 'x' });
  assert.equal(r.score, 0);
  assert.equal(r.strategy, 'main-thread');
});

test('task length 500 -> score 50, strategy main-thread', () => {
  const r = dispatch({ task: 'x'.repeat(500) });
  assert.equal(r.score, 50);
  assert.equal(r.strategy, 'main-thread');
});

// --- CASE 6: score clamped at 100 ---
test('task length 5000 -> score clamped to 100', () => {
  const r = dispatch({ task: 'x'.repeat(5000) });
  assert.equal(r.score, 100);
});

// --- CASE 7: parallelizable defaults false unless exactly true ---
test('parallelizable defaults false when absent', () => {
  const r = dispatch({ task: 't', complexity: 25 });
  assert.equal(r.parallelizable, false);
});

test("parallelizable defaults false when 'yes' string", () => {
  const r = dispatch({ task: 't', complexity: 25, parallelizable: 'yes' });
  assert.equal(r.parallelizable, false);
});

// --- CASE 8: tier by nature, no downgrade for verification/implementation/analysis ---
test('nature verification -> model null (never haiku)', () => {
  const r = dispatch({ task: 'some task', complexity: 25, nature: 'verification' });
  assert.equal(r.model, null, `model must be null for verification, got: ${r.model}`);
});

test('nature implementation -> model null (never haiku)', () => {
  const r = dispatch({ task: 'some task', complexity: 25, nature: 'implementation' });
  assert.equal(r.model, null, `model must be null for implementation, got: ${r.model}`);
});

test('nature analysis -> model null (never haiku)', () => {
  const r = dispatch({ task: 'some task', complexity: 25, nature: 'analysis' });
  assert.equal(r.model, null, `model must be null for analysis, got: ${r.model}`);
});

// --- CASE 9: exploration downgrade -> tier 'cheap', model 'haiku' ---
test('nature exploration score 25 sequential -> tier cheap, model haiku', () => {
  const r = dispatch({ task: 'some task', complexity: 25, nature: 'exploration' });
  assert.equal(r.tier, 'cheap');
  assert.equal(r.model, 'haiku');
});

// --- CASE 10: conservative default via classifyLeaf when nature absent ---
test('task with verification keyword -> nature verification, model null', () => {
  const r = dispatch({ task: 'verify the auth flow' });
  assert.equal(r.nature, 'verification');
  assert.equal(r.model, null);
});

test('task with exploration keyword -> nature exploration, model haiku', () => {
  const r = dispatch({ task: 'load the config file' });
  assert.equal(r.nature, 'exploration');
  assert.equal(r.model, 'haiku');
});

// --- CASE 11: no pin-up, model is never 'opus' ---
test('no pin-up: model is never opus across score/nature combinations', () => {
  const combos = [
    { task: 'x', complexity: 5, nature: 'implementation' },
    { task: 'x'.repeat(250), complexity: 25, nature: 'verification' },
    { task: 'x'.repeat(500), complexity: 50, nature: 'analysis' },
    { task: 'x'.repeat(800), complexity: 80, nature: 'exploration' },
    { task: 'x', complexity: 5, nature: 'exploration' },
    { task: 'x'.repeat(250), complexity: 25, parallelizable: true, nature: 'implementation' },
  ];
  for (const args of combos) {
    const r = dispatch(args);
    assert.ok(
      r.model !== 'opus',
      `model must never be 'opus', got '${r.model}' for ${JSON.stringify(args)}`
    );
  }
});

// --- CASE 12: explicit valid nature overrides keyword in task ---
test('explicit nature verification overrides exploration keyword in task', () => {
  const r = dispatch({ task: 'load the file', nature: 'verification' });
  assert.equal(r.nature, 'verification');
  assert.equal(r.model, null);
});

// --- CASE 13: invalid nature falls back to classifyLeaf ---
test('invalid nature garbage falls back to classifyLeaf -> exploration, model haiku', () => {
  const r = dispatch({ task: 'load the file', nature: 'garbage' });
  assert.equal(r.nature, 'exploration');
  assert.equal(r.model, 'haiku');
});

// --- CASE 13b: invalid nature on a PROTECTED task does NOT downgrade ---
// The fallback to classifyLeaf must stay conservative: a garbage nature with a
// protected (implementation) task label resolves to implementation -> deep ->
// model null, never haiku. This pins that an invalid nature can never silently
// downgrade protected work.
test('invalid nature on protected task -> implementation, model null (no silent downgrade)', () => {
  const r = dispatch({ task: 'implement the feature', nature: 'garbage' });
  assert.equal(r.nature, 'implementation');
  assert.equal(r.model, null);
});

// --- CASE 14: zero-arg / empty-arg defensive default ---
// The `{} = {}` guard plus `task?.length || 0` must produce a defined, safe
// result with no task and no nature: score 0, main-thread, implementation (the
// classifyLeaf empty-label default), model null. Protected by default.
test('dispatch() with no args -> score 0, main-thread, implementation, model null', () => {
  const r = dispatch();
  assert.equal(r.score, 0);
  assert.equal(r.strategy, 'main-thread');
  assert.equal(r.nature, 'implementation');
  assert.equal(r.model, null);
});

test('dispatch({}) with empty object -> score 0, implementation, model null', () => {
  const r = dispatch({});
  assert.equal(r.score, 0);
  assert.equal(r.nature, 'implementation');
  assert.equal(r.model, null);
});
