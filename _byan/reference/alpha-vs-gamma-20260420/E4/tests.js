/**
 * Tests for fact-check-absolutes.js — uses node --test.
 * Run : node --test tests.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, 'fact-check-absolutes.js');

function runHook(payload) {
  const input = payload === undefined ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload));
  const r = spawnSync('node', [HOOK], { input, encoding: 'utf8', timeout: 5000 });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* keep null */ }
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr, json: parsed };
}

function decision(res) {
  return res.json && res.json.hookSpecificOutput && res.json.hookSpecificOutput.permissionDecision;
}

test('allows non-Edit/Write tools', () => {
  const res = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(decision(res), 'allow');
});

test('allows Edit on non-doc file (.js)', () => {
  const res = runHook({
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/foo.js', old_string: 'x', new_string: 'this is always true' }
  });
  assert.strictEqual(decision(res), 'allow');
});

test('blocks Write on .md with unsourced absolute', () => {
  const res = runHook({
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/doc.md', content: 'Redis is always faster for caching.' }
  });
  assert.strictEqual(decision(res), 'deny');
  assert.match(res.json.hookSpecificOutput.permissionDecisionReason, /always|faster than/i);
});

test('allows Write on .md when URL present near absolute', () => {
  const content = 'Per benchmarks at https://redis.io/docs/benchmark Redis is always fast in-memory.';
  const res = runHook({
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/doc.md', content }
  });
  assert.strictEqual(decision(res), 'allow');
});

test('allows Write on .md with [CLAIM L2] prefix', () => {
  const content = '[CLAIM L2] On our hardware Redis is always faster than Postgres for single-key lookups.';
  const res = runHook({
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/doc.md', content }
  });
  assert.strictEqual(decision(res), 'allow');
});

test('blocks Edit on .md with absolute introduced', () => {
  const res = runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: '/tmp/doc.md',
      old_string: 'Redis is fast.',
      new_string: 'Redis is obviously the best choice, undoubtedly faster than any SQL DB.'
    }
  });
  assert.strictEqual(decision(res), 'deny');
});

test('detects French absolutes (toujours)', () => {
  const res = runHook({
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/doc.md', content: 'Redis est toujours plus rapide que Postgres.' }
  });
  assert.strictEqual(decision(res), 'deny');
  assert.match(res.json.hookSpecificOutput.permissionDecisionReason, /toujours|plus rapide que/i);
});

test('malformed stdin → exit 0, no crash, allows', () => {
  const res = runHook('this is not { valid json');
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(decision(res), 'allow');
});

test('empty stdin → exit 0, allows', () => {
  const res = runHook('');
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(decision(res), 'allow');
});

test('allows .md with source: marker near absolute', () => {
  const content = 'This algorithm never loops indefinitely (source: RFC 9110 section 4.2).';
  const res = runHook({
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/doc.md', content }
  });
  assert.strictEqual(decision(res), 'allow');
});
