// node --test compatible tests for phase-guard + response-check hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(__dirname, 'fd-phase-guard.js');
const CHECK = path.join(__dirname, 'fd-response-check.js');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function writeState(root, state) {
  const dir = path.join(root, '_byan-output');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fd-state.json'), JSON.stringify(state));
}

function runHook(hookPath, { input = '', env = {} } = {}) {
  return spawnSync('node', [hookPath], {
    input,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('phase-guard emits non-empty additionalContext when FD active', () => {
  const root = mkTmp('fd-guard-active');
  writeState(root, {
    fd_id: 'test-1',
    feature_name: 'demo',
    phase: 'BRAINSTORM',
    raw_ideas: [],
  });
  const res = runHook(GUARD, { env: { CLAUDE_PROJECT_DIR: root } });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(parsed.hookSpecificOutput.additionalContext.length > 0);
  assert.match(parsed.hookSpecificOutput.additionalContext, /\[FD:BRAINSTORM\]/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Quantity > quality/);
});

test('phase-guard emits empty additionalContext when no state', () => {
  const root = mkTmp('fd-guard-empty');
  const res = runHook(GUARD, { env: { CLAUDE_PROJECT_DIR: root } });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.additionalContext, '');
});

test('phase-guard emits empty additionalContext when phase is COMPLETED', () => {
  const root = mkTmp('fd-guard-completed');
  writeState(root, { fd_id: 'x', feature_name: 'y', phase: 'COMPLETED' });
  const res = runHook(GUARD, { env: { CLAUDE_PROJECT_DIR: root } });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.additionalContext, '');
});

test('response-check exits 2 when FD active but transcript lacks header', () => {
  const root = mkTmp('fd-check-block');
  writeState(root, { fd_id: 'z', feature_name: 'f', phase: 'PRUNE' });
  const payload = {
    messages: [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'Sure, here is my answer without any header.' },
    ],
  };
  const res = runHook(CHECK, {
    input: JSON.stringify(payload),
    env: { CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(res.status, 2);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.decision, 'block');
  assert.match(parsed.systemMessage, /\[FD:PRUNE\]/);
});

test('response-check exits 0 when header present in string content', () => {
  const root = mkTmp('fd-check-ok-str');
  writeState(root, { fd_id: 'z', feature_name: 'f', phase: 'BUILD' });
  const payload = {
    messages: [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '[FD:BUILD]\nHere is my update.' },
    ],
  };
  const res = runHook(CHECK, {
    input: JSON.stringify(payload),
    env: { CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.continue, true);
});

test('response-check exits 0 when header present in array content blocks', () => {
  const root = mkTmp('fd-check-ok-arr');
  writeState(root, { fd_id: 'z', feature_name: 'f', phase: 'VALIDATE' });
  const payload = {
    transcript: [
      { role: 'user', content: [{ type: 'text', text: 'ping' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '[FD:VALIDATE]' },
          { type: 'text', text: 'All tests green.' },
        ],
      },
    ],
  };
  const res = runHook(CHECK, {
    input: JSON.stringify(payload),
    env: { CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(res.status, 0);
});

test('response-check exits 0 when FD inactive (no state file)', () => {
  const root = mkTmp('fd-check-no-state');
  const res = runHook(CHECK, {
    input: JSON.stringify({ messages: [{ role: 'assistant', content: 'nothing' }] }),
    env: { CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(res.status, 0);
});

test('response-check fails gracefully on malformed stdin', () => {
  const root = mkTmp('fd-check-bad-json');
  writeState(root, { fd_id: 'z', feature_name: 'f', phase: 'DISPATCH' });
  const res = runHook(CHECK, {
    input: 'not-valid-json{{{',
    env: { CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(res.status, 0);
});
