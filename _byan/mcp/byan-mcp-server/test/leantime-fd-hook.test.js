import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The hook is an I/O shell; its decision logic lives in (and is unit-tested via)
// lib/leantime-fd-core.js. These subprocess tests pin the shell's CONTRACT:
// it exits 0 in every path and no-ops (empty additionalContext, no side effect)
// when the tool is not an FD tool, the payload is junk, or Leantime is off.
// The configured/reachable network path is exercised by the live F0/F5
// verification (against the real Leantime), not here.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..'); // test -> byan-mcp-server -> mcp -> _byan -> root
const HOOK = path.join(ROOT, '.claude', 'hooks', 'leantime-fd-sync.js');

// Env with Leantime DELIBERATELY unset (the session env may carry real creds).
function envOff() {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
  delete e.LEANTIME_API_URL;
  delete e.LEANTIME_API_TOKEN;
  delete e.LEANTIME_ASSIGN_USER_ID;
  return e;
}

function runHook(payload, env = envOff()) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync('node', [HOOK], { input, env, encoding: 'utf8' });
}

function parseOut(res) {
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

test('hook exits 0 and no-ops on a non-FD tool', () => {
  const res = runHook({ tool_name: 'Read', tool_response: { content: [{ type: 'text', text: '{}' }] } });
  assert.equal(res.status, 0);
  const out = parseOut(res);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.equal(out.hookSpecificOutput.additionalContext, '');
});

test('hook exits 0 and no-ops on an FD tool when Leantime is not configured', () => {
  const state = { phase: 'BUILD', fd_id: 'hooktest', project_context: { name: 'X' }, backlog: [] };
  const res = runHook({
    tool_name: 'mcp__byan__byan_fd_advance',
    tool_response: { content: [{ type: 'text', text: JSON.stringify(state) }] },
  });
  assert.equal(res.status, 0);
  const out = parseOut(res);
  assert.equal(out.hookSpecificOutput.additionalContext, ''); // syncEnabled false -> silent
});

test('hook exits 0 on a malformed (non-JSON) payload', () => {
  const res = runHook('this is not json');
  assert.equal(res.status, 0);
  assert.ok(parseOut(res)); // still emits a valid hookSpecificOutput envelope
});

test('hook exits 0 on an FD tool with an unparseable tool_response', () => {
  const res = runHook({ tool_name: 'mcp__byan__byan_fd_update', tool_response: 'garbage-not-state' });
  assert.equal(res.status, 0);
});

test('hook NEVER writes fd-state.json (state-coupling, file-immutability)', () => {
  // Run against a throwaway ROOT so the sidecar lands in tmp and the real repo
  // fd-state is untouched. A sentinel fd-state.json must survive verbatim on both
  // the parseable-state path and the path that reaches the read-only file fallback.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lt-hook-'));
  try {
    fs.mkdirSync(path.join(tmp, '_byan-output'), { recursive: true });
    const statePath = path.join(tmp, '_byan-output', 'fd-state.json');
    const sentinel = JSON.stringify({ phase: 'BUILD', fd_id: 'sentinel', sentinel: true });
    fs.writeFileSync(statePath, sentinel);
    const env = { ...envOff(), CLAUDE_PROJECT_DIR: tmp };

    const state = { phase: 'BUILD', fd_id: 'x', project_context: { name: 'X' }, backlog: [] };
    let res = runHook(
      { tool_name: 'mcp__byan__byan_fd_advance', tool_response: { content: [{ type: 'text', text: JSON.stringify(state) }] } },
      env,
    );
    assert.equal(res.status, 0);
    assert.equal(fs.readFileSync(statePath, 'utf8'), sentinel);

    // unparseable tool_response -> the shell reaches the read-only fd-state fallback
    res = runHook({ tool_name: 'mcp__byan__byan_fd_update', tool_response: 'garbage' }, env);
    assert.equal(res.status, 0);
    assert.equal(fs.readFileSync(statePath, 'utf8'), sentinel);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
