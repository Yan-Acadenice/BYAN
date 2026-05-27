import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lockScope, selfVerify, complete } from '../lib/strict-mode.js';
import { syncRules } from '../lib/sync-rules.js';

// End-to-end : exercise the real hook scripts and the pre-commit gate as
// child processes, plus the generated cross-platform artifacts. This covers
// the wiring (stdin parse -> decision -> stdout/exit), not just pure logic.

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const HOOKS = path.join(REPO_ROOT, '.claude', 'hooks');
const GATE = path.join(REPO_ROOT, '_byan', 'mcp', 'byan-mcp-server', 'bin', 'strict-precommit-gate.js');
const REAL_CONFIG = path.join(REPO_ROOT, '.claude', 'hooks', 'lib', 'strict-config.json');

// A temp project root carrying the strict-config.json (so hooks resolve it via
// CLAUDE_PROJECT_DIR) and a place for .byan-strict state.
function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-e2e-'));
  const hookLib = path.join(root, '.claude', 'hooks', 'lib');
  fs.mkdirSync(hookLib, { recursive: true });
  if (fs.existsSync(REAL_CONFIG)) {
    fs.copyFileSync(REAL_CONFIG, path.join(hookLib, 'strict-config.json'));
  }
  return root;
}

function runHook(hookFile, payload, root) {
  const out = { stdout: '', code: 0 };
  try {
    out.stdout = execFileSync('node', [path.join(HOOKS, hookFile)], {
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: 'utf8',
    });
  } catch (e) {
    out.stdout = (e.stdout || '').toString();
    out.code = e.status || 1;
  }
  return out;
}

function runGate(root) {
  try {
    execFileSync('node', [GATE, '--root', root], { encoding: 'utf8' });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

function engage(root) {
  lockScope({
    scopeText: 'Build the complete feature exactly as asked.',
    acceptanceCriteria: ['c1', 'c2'],
    allowedPaths: ['src/feature/'],
    projectRoot: root,
  });
}

// --- Claude Code hooks E2E ---------------------------------------------

test('E2E stop-guard: blocks (exit 2) on completion claim while engaged', () => {
  const root = tmpProject();
  engage(root);
  selfVerify({ verdict: 'ok', projectRoot: root });
  const res = runHook(
    'strict-stop-guard.js',
    { transcript: [{ role: 'assistant', content: "It's done, shipping now." }] },
    root
  );
  assert.equal(res.code, 2);
  assert.match(res.stdout, /"decision":"block"/);
});

test('E2E stop-guard: allows (continue) without completion claim', () => {
  const root = tmpProject();
  engage(root);
  const res = runHook(
    'strict-stop-guard.js',
    { transcript: [{ role: 'assistant', content: 'One question before I continue.' }] },
    root
  );
  assert.equal(res.code, 0);
  assert.match(res.stdout, /"continue":true/);
});

test('E2E scope-guard: denies Write outside locked paths', () => {
  const root = tmpProject();
  engage(root);
  const res = runHook(
    'strict-scope-guard.js',
    { tool_name: 'Write', tool_input: { file_path: 'src/other/x.js' } },
    root
  );
  assert.match(res.stdout, /"permissionDecision":"deny"/);
});

test('E2E scope-guard: allows Write inside locked paths', () => {
  const root = tmpProject();
  engage(root);
  const res = runHook(
    'strict-scope-guard.js',
    { tool_name: 'Write', tool_input: { file_path: 'src/feature/x.js' } },
    root
  );
  assert.match(res.stdout, /"permissionDecision":"allow"/);
});

test('E2E context-inject: injects banner when engaged', () => {
  const root = tmpProject();
  engage(root);
  const res = runHook('strict-context-inject.js', { prompt: 'continue' }, root);
  assert.match(res.stdout, /STRICT MODE ACTIVE/);
});

test('E2E context-inject: suggests on keyword when not engaged', () => {
  const root = tmpProject();
  const res = runHook('strict-context-inject.js', { prompt: 'ship to production' }, root);
  assert.match(res.stdout, /STRICT MODE SUGGESTED/);
});

// --- Pre-commit gate standalone ----------------------------------------

test('E2E gate: exit 1 when engaged but not completed', () => {
  const root = tmpProject();
  engage(root);
  selfVerify({ verdict: 'ok', projectRoot: root });
  assert.equal(runGate(root), 1);
});

test('E2E gate: exit 0 when completed correctly', () => {
  const root = tmpProject();
  engage(root);
  selfVerify({ verdict: 'ok', projectRoot: root });
  selfVerify({ verdict: 'ok', projectRoot: root });
  selfVerify({ verdict: 'ok', projectRoot: root });
  complete({ projectRoot: root });
  assert.equal(runGate(root), 0);
});

test('E2E gate: exit 0 when strict never engaged', () => {
  const root = tmpProject();
  assert.equal(runGate(root), 0);
});

// --- Codex / Copilot artifacts -----------------------------------------

test('E2E artifacts: AGENTS.md and copilot-instructions carry the strict block', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-e2e-art-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  // Use the real source of truth so the test reflects shipped content.
  fs.copyFileSync(
    path.join(REPO_ROOT, '_byan', '_config', 'strict-mode.yaml'),
    path.join(cfgDir, 'strict-mode.yaml')
  );
  syncRules({ projectRoot: root });

  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const copilot = fs.readFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'utf8');
  for (const content of [agents, copilot]) {
    assert.match(content, /BYAN-STRICT:BEGIN/);
    assert.match(content, /BYAN-STRICT:END/);
    assert.match(content, /BYAN Strict Mode/);
    assert.match(content, /STRICT-1/);
    assert.match(content, /byan_strict_lock_scope/);
  }
});
