import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The hook is CommonJS under .claude/hooks (CJS shell + ESM lib via dynamic
// import, the leantime-fd-sync bridge). Load it via require and drive its
// exported runGuard directly.
const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const guard = require(path.join(ROOT, '.claude', 'hooks', 'tier-script-guard.js'));

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-tier-'));
}

const GAP_SCRIPT = "export const meta = { name: 'x', description: 'y' }\nconst a = await agent('read it', { label: 'load-story', phase: 'LOAD' })\n";
const CLEAN_SCRIPT = "export const meta = { name: 'x', description: 'y' }\nconst a = await agent('do it', { label: 'rgr-cycle-1' })\n";
const ACK_SCRIPT = '// BYAN-TIER: reviewed\n' + GAP_SCRIPT;

function payload(input, toolName = 'Workflow') {
  return { tool_name: toolName, tool_input: input };
}

function decisionOf(out) {
  return out.hookSpecificOutput.permissionDecision;
}

test('runGuard: a non-Workflow tool is always allowed', async () => {
  const root = tmpRoot();
  const out = await guard.runGuard(payload({ file_path: 'x' }, 'Write'), { root });
  assert.equal(decisionOf(out), 'allow');
});

test('runGuard: a registry (name-only) invocation is allowed — repo linter owns it', async () => {
  const root = tmpRoot();
  const out = await guard.runGuard(payload({ name: 'dev-story' }), { root });
  assert.equal(decisionOf(out), 'allow');
});

test('runGuard: a clean inline script is allowed and ledger-logged', async () => {
  const root = tmpRoot();
  const out = await guard.runGuard(payload({ script: CLEAN_SCRIPT }), { root });
  assert.equal(decisionOf(out), 'allow');
  const ledger = fs.readFileSync(path.join(root, '_byan-output', 'tier-ledger.jsonl'), 'utf8');
  const entry = JSON.parse(ledger.trim().split('\n').pop());
  assert.equal(entry.decision, 'allow');
  assert.equal(entry.code, 'clean');
  assert.equal(entry.source, 'inline');
});

test('runGuard: an inline script with a tier gap is DENIED once with the exact leaf', async () => {
  const root = tmpRoot();
  const out = await guard.runGuard(payload({ script: GAP_SCRIPT }), { root });
  assert.equal(decisionOf(out), 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /load-story/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /haiku/);
});

test('runGuard: the SAME script resubmitted after a deny passes (deny once, never trap)', async () => {
  const root = tmpRoot();
  const first = await guard.runGuard(payload({ script: GAP_SCRIPT }), { root });
  assert.equal(decisionOf(first), 'deny');
  const second = await guard.runGuard(payload({ script: GAP_SCRIPT }), { root });
  assert.equal(decisionOf(second), 'allow');
  const ledger = fs.readFileSync(path.join(root, '_byan-output', 'tier-ledger.jsonl'), 'utf8');
  const codes = ledger.trim().split('\n').map((l) => JSON.parse(l).code);
  assert.deepEqual(codes, ['gaps', 'unchanged-after-deny']);
});

test('runGuard: after the deny is consumed, a NEW gapped script is denied again', async () => {
  const root = tmpRoot();
  await guard.runGuard(payload({ script: GAP_SCRIPT }), { root });
  await guard.runGuard(payload({ script: GAP_SCRIPT }), { root });
  const other = GAP_SCRIPT.replace('load-story', 'scan-context');
  const out = await guard.runGuard(payload({ script: other }), { root });
  assert.equal(decisionOf(out), 'deny');
});

test('runGuard: an acknowledged script is allowed (marker wins)', async () => {
  const root = tmpRoot();
  const out = await guard.runGuard(payload({ script: ACK_SCRIPT }), { root });
  assert.equal(decisionOf(out), 'allow');
});

test('runGuard: scriptPath variant is read from disk and gated', async () => {
  const root = tmpRoot();
  const p = path.join(root, 'wf.js');
  fs.writeFileSync(p, GAP_SCRIPT);
  const out = await guard.runGuard(payload({ scriptPath: p }), { root });
  assert.equal(decisionOf(out), 'deny');
});

test('runGuard: an unreadable scriptPath is allowed (the tool itself will surface the error)', async () => {
  const root = tmpRoot();
  const out = await guard.runGuard(payload({ scriptPath: path.join(root, 'missing.js') }), { root });
  assert.equal(decisionOf(out), 'allow');
});

test('runGuard: the escape hatch (.byan-tier/off) allows and logs the escape', async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, '.byan-tier'), { recursive: true });
  fs.writeFileSync(path.join(root, '.byan-tier', 'off'), '');
  const out = await guard.runGuard(payload({ script: GAP_SCRIPT }), { root });
  assert.equal(decisionOf(out), 'allow');
  const ledger = fs.readFileSync(path.join(root, '_byan-output', 'tier-ledger.jsonl'), 'utf8');
  assert.equal(JSON.parse(ledger.trim().split('\n').pop()).code, 'escape-hatch');
});

test('runGuard: ledger entry carries the model histogram (the measurement basis)', async () => {
  const root = tmpRoot();
  const src = [
    "export const meta = { name: 'x', description: 'y' }",
    "const a = await agent('r', { label: 'load-a', model: 'haiku' })",
    "const b = await agent('c', { label: 'mech-check-b', model: 'sonnet' })",
    "const c = await agent('v', { label: 'verify-c' })",
    "const d = await agent('unlabelled heavy work')",
  ].join('\n');
  const out = await guard.runGuard(payload({ script: src }), { root });
  assert.equal(decisionOf(out), 'allow');
  const entry = JSON.parse(
    fs.readFileSync(path.join(root, '_byan-output', 'tier-ledger.jsonl'), 'utf8').trim().split('\n').pop()
  );
  assert.deepEqual(entry.models, { haiku: 1, sonnet: 1, inherit: 2 });
  assert.equal(entry.agentCalls, 4);
});
